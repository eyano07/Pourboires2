import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

/** Devises de la caisse : dollar américain et franc congolais (FC, sans centimes). */
export type Currency = 'USD' | 'CDF'
export const CURRENCIES: Currency[] = ['USD', 'CDF']
const UNIT: Record<Currency, number> = { USD: 100, CDF: 1 }
export const MAX_AMOUNT: Record<Currency, number> = { USD: 100_000, CDF: 300_000_000 }
export type Totals = Record<Currency, number>
export const zeroTotals = (): Totals => ({ USD: 0, CDF: 0 })

/** Une saisie : l'utilisateur, le montant et sa devise (l'id sert à la suppression). */
export interface TipEntry {
  id: string
  username: string
  amount: number
  currency: Currency
}
export interface Share { username: string, amounts: Totals }
export interface CloseResult { shift: string, totals: Totals, shares: Share[], by: string }

/** Services de la journée, dans l'ordre. Variable SHIFTS pour changer (ex. « Matin,Soir »). */
export function shifts(): string[] {
  const list = (process.env.SHIFTS || 'Matin,Soir').split(',').map(s => s.trim()).filter(Boolean)
  return list.length ? list : ['Matin', 'Soir']
}

/** Service en cours, ou null si la journée est clôturée (tous les services ont été partagés). */
export function currentShift(data: Pick<TipsFile, 'closes'>): string | null {
  return shifts()[data.closes.length] ?? null
}
export interface TipsFile {
  date: string
  entries: TipEntry[]
  /** Personnes cochées par la caisse : elles partagent le pourboire et reçoivent les notifications. */
  shareWith: string[]
  /** Partages faits aujourd'hui, un par service (effacés au changement de jour). */
  closes: CloseResult[]
}

export const TIMEZONE = 'Africa/Kinshasa'

export function dataDir(): string {
  return process.env.DATA_DIR || join(process.cwd(), 'data')
}

/** Date du jour (AAAA-MM-JJ) dans le fuseau du restaurant. */
export function todayStr(now: Date = new Date(), tz: string = TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}

export function toUnits(amount: number, currency: Currency): number {
  return Math.round(amount * UNIT[currency])
}

/** Totaux de la caisse, par devise, calculés en unités entières (pas d'erreur d'arrondi). */
export function totalsOf(entries: TipEntry[]): Totals {
  const t = zeroTotals()
  for (const c of CURRENCIES) {
    t[c] = entries.filter(e => e.currency === c).reduce((sum, e) => sum + toUnits(e.amount, c), 0) / UNIT[c]
  }
  return t
}
export const hasMoney = (t: Totals) => CURRENCIES.some(c => t[c] > 0)

export function validateCurrency(value: unknown): Currency | null {
  const v = typeof value === 'string' ? value.toUpperCase() : ''
  if (v === 'FC') return 'CDF'
  return (CURRENCIES as string[]).includes(v) ? v as Currency : null
}

/** Retourne le montant arrondi (au centime en USD, au franc en FC), ou null s'il est invalide. */
export function validateAmount(value: unknown, currency: Currency = 'USD'): number | null {
  const n = typeof value === 'string' ? Number(value.replace(/\s/g, '').replace(',', '.')) : value
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  const rounded = toUnits(n, currency) / UNIT[currency]
  if (rounded <= 0 || rounded > MAX_AMOUNT[currency]) return null
  return rounded
}

function migrateClose(c: any): CloseResult {
  if (c.totals) return c
  // Ancien format (une seule devise, USD)
  return {
    shift: c.shift, by: c.by, totals: { USD: c.total ?? 0, CDF: 0 },
    shares: c.shares.map((s: any) => ({ username: s.username, amounts: { USD: s.amount ?? 0, CDF: 0 } })),
  }
}

// Les écritures sont sérialisées pour éviter les pertes de données.
let queue: Promise<unknown> = Promise.resolve()
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn)
  queue = run.catch(() => undefined)
  return run
}

async function writeAtomic(file: string, data: unknown): Promise<void> {
  const tmp = `${file}.${process.pid}.tmp`
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 })
  await fs.rename(tmp, file)
}

async function load(dir: string, now: Date): Promise<TipsFile> {
  const file = join(dir, 'tips.json')
  const today = todayStr(now)
  let current: TipsFile | null = null
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'))
    if (parsed && typeof parsed.date === 'string' && Array.isArray(parsed.entries)) {
      current = {
        date: parsed.date,
        entries: parsed.entries.map((e: TipEntry) => ({
          id: e.id, username: e.username, amount: e.amount, currency: e.currency === 'CDF' ? 'CDF' : 'USD',
        })),
        shareWith: Array.isArray(parsed.shareWith) ? parsed.shareWith.filter((u: unknown) => typeof u === 'string') : [],
        closes: (Array.isArray(parsed.closes) ? parsed.closes : (parsed.lastClose ? [{ shift: shifts()[0], ...parsed.lastClose }] : []))
          .filter((c: any) => c && Array.isArray(c.shares))
          .map(migrateClose),
      }
    }
  } catch { /* fichier absent ou illisible */ }
  if (!current || current.date !== today) {
    current = { date: today, entries: [], shareWith: [], closes: [] }
    await fs.mkdir(dir, { recursive: true, mode: 0o700 })
    await writeAtomic(file, current)
  }
  return current
}

export function readTips(dir: string = dataDir(), now: Date = new Date()): Promise<TipsFile> {
  return serial(() => load(dir, now))
}

export function addTip(
  username: string, amount: number, currency: Currency = 'USD',
  dir: string = dataDir(), now: Date = new Date(),
): Promise<TipEntry | 'day_closed'> {
  return serial(async () => {
    const data = await load(dir, now)
    if (!currentShift(data)) return 'day_closed'
    const entry: TipEntry = { id: randomUUID(), username, amount, currency }
    data.entries.push(entry)
    await writeAtomic(join(dir, 'tips.json'), data)
    return entry
  })
}

/** Supprime une saisie appartenant à `username`. Retourne 'ok', 'not_found' ou 'forbidden'. */
export function removeTip(
  id: string, username: string,
  dir: string = dataDir(), now: Date = new Date(),
): Promise<'ok' | 'not_found' | 'forbidden'> {
  return serial(async () => {
    const data = await load(dir, now)
    const entry = data.entries.find(e => e.id === id)
    if (!entry) return 'not_found'
    if (entry.username !== username) return 'forbidden'
    data.entries = data.entries.filter(e => e.id !== id)
    await writeAtomic(join(dir, 'tips.json'), data)
    return 'ok'
  })
}

/**
 * Partage chaque devise à parts égales (au centime en USD, au franc en FC).
 * Les unités restantes (ex. 10 $ / 3) vont une par une aux premiers de la liste (ordre alphabétique).
 */
export function splitEqually(totals: Totals, usernames: string[]): Share[] {
  const names = [...new Set(usernames)].sort((a, b) => a.localeCompare(b, 'fr'))
  if (!names.length) return []
  const shares: Share[] = names.map(username => ({ username, amounts: zeroTotals() }))
  for (const c of CURRENCIES) {
    const units = toUnits(totals[c], c)
    const base = Math.floor(units / names.length)
    const rest = units - base * names.length
    shares.forEach((s, i) => { s.amounts[c] = (base + (i < rest ? 1 : 0)) / UNIT[c] })
  }
  return shares
}

/** Gains d'un utilisateur aujourd'hui (somme de ses parts sur tous les services). */
export function earningsOf(username: string, closes: CloseResult[]): Totals {
  const t = zeroTotals()
  const u = username.toLowerCase()
  for (const c of closes) {
    const s = c.shares.find(x => x.username.toLowerCase() === u)
    if (s) for (const k of CURRENCIES) t[k] = (toUnits(t[k], k) + toUnits(s.amounts[k], k)) / UNIT[k]
  }
  return t
}

/**
 * Dernier gain de chaque agent : affiché sur son compte jusqu'à ce qu'un caissier le sélectionne
 * de nouveau (même le lendemain). Fichier data/earnings.json : utilisateur -> montants.
 */
export interface Earning { shift: string, date: string, amounts: Totals, people: number }
export type EarningsFile = Record<string, Earning>

async function loadEarnings(dir: string): Promise<EarningsFile> {
  try {
    const parsed = JSON.parse(await fs.readFile(join(dir, 'earnings.json'), 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch { return {} }
}

export function readEarnings(dir: string = dataDir()): Promise<EarningsFile> {
  return serial(() => loadEarnings(dir))
}

/** Enregistre les personnes cochées par la caisse (et efface leur dernier gain affiché). */
export function setShareWith(
  usernames: string[], dir: string = dataDir(), now: Date = new Date(),
): Promise<string[] | 'day_closed'> {
  return serial(async () => {
    const data = await load(dir, now)
    if (!currentShift(data)) return 'day_closed'
    data.shareWith = [...new Set(usernames)].sort((a, b) => a.localeCompare(b, 'fr'))
    await writeAtomic(join(dir, 'tips.json'), data)
    const earnings = await loadEarnings(dir)
    const before = Object.keys(earnings).length
    for (const u of data.shareWith) delete earnings[u.toLowerCase()]
    if (Object.keys(earnings).length !== before) await writeAtomic(join(dir, 'earnings.json'), earnings)
    return data.shareWith
  })
}

export type CloseError = 'empty' | 'no_selection' | 'day_closed'

/**
 * Vide la caisse en fin de service : calcule les parts entre les personnes cochées (parmi `existing`,
 * les comptes qui existent encore), remet le compteur et la sélection à zéro pour le service suivant,
 * et garde le partage jusqu'à la fin de la journée. Après le dernier service, la journée est clôturée.
 */
export function closeTips(
  by: string, existing: string[], dir: string = dataDir(), now: Date = new Date(),
): Promise<CloseResult | CloseError> {
  return serial(async () => {
    const data = await load(dir, now)
    const shift = currentShift(data)
    if (!shift) return 'day_closed'
    const totals = totalsOf(data.entries)
    if (!hasMoney(totals)) return 'empty'
    const known = new Set(existing.map(u => u.toLowerCase()))
    const people = data.shareWith.filter(u => known.has(u.toLowerCase()))
    if (!people.length) return 'no_selection'
    const result: CloseResult = { shift, totals, shares: splitEqually(totals, people), by }
    data.entries = []
    data.shareWith = [] // le caissier du service suivant choisit ses propres personnes
    data.closes.push(result)
    await writeAtomic(join(dir, 'tips.json'), data)
    const earnings = await loadEarnings(dir)
    for (const s of result.shares) {
      earnings[s.username.toLowerCase()] = { shift, date: data.date, amounts: s.amounts, people: result.shares.length }
    }
    await writeAtomic(join(dir, 'earnings.json'), earnings)
    return result
  })
}
