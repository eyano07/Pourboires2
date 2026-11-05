import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

/** Une saisie : uniquement l'utilisateur et le montant (l'id sert à la suppression). */
export interface TipEntry {
  id: string
  username: string
  amount: number
}
export interface Share { username: string, amount: number }
export interface CloseResult { shift: string, total: number, shares: Share[], by: string }

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
export const MAX_AMOUNT = 100000

export function dataDir(): string {
  return process.env.DATA_DIR || join(process.cwd(), 'data')
}

/** Date du jour (AAAA-MM-JJ) dans le fuseau du restaurant. */
export function todayStr(now: Date = new Date(), tz: string = TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}

export function toCents(amount: number): number {
  return Math.round(amount * 100)
}

export function totalOf(entries: TipEntry[]): number {
  return entries.reduce((sum, e) => sum + toCents(e.amount), 0) / 100
}

/** Retourne le montant arrondi au centime, ou null s'il est invalide. */
export function validateAmount(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : value
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  const rounded = toCents(n) / 100
  if (rounded <= 0 || rounded > MAX_AMOUNT) return null
  return rounded
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
        entries: parsed.entries.map((e: TipEntry) => ({ id: e.id, username: e.username, amount: e.amount })),
        shareWith: Array.isArray(parsed.shareWith) ? parsed.shareWith.filter((u: unknown) => typeof u === 'string') : [],
        closes: Array.isArray(parsed.closes)
          ? parsed.closes
          : (parsed.lastClose && Array.isArray(parsed.lastClose.shares) ? [{ shift: shifts()[0], ...parsed.lastClose }] : []),
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
  username: string, amount: number,
  dir: string = dataDir(), now: Date = new Date(),
): Promise<TipEntry | 'day_closed'> {
  return serial(async () => {
    const data = await load(dir, now)
    if (!currentShift(data)) return 'day_closed'
    const entry: TipEntry = { id: randomUUID(), username, amount }
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
 * Partage un montant à parts égales, au centime près.
 * Les centimes restants (ex. 10 $ / 3) vont un par un aux premiers de la liste (ordre alphabétique).
 */
export function splitEqually(total: number, usernames: string[]): Share[] {
  const names = [...new Set(usernames)].sort((a, b) => a.localeCompare(b, 'fr'))
  if (!names.length) return []
  const cents = toCents(total)
  const base = Math.floor(cents / names.length)
  const rest = cents - base * names.length
  return names.map((username, i) => ({ username, amount: (base + (i < rest ? 1 : 0)) / 100 }))
}

/** Enregistre les personnes cochées par la caisse. */
export function setShareWith(
  usernames: string[], dir: string = dataDir(), now: Date = new Date(),
): Promise<string[] | 'day_closed'> {
  return serial(async () => {
    const data = await load(dir, now)
    if (!currentShift(data)) return 'day_closed'
    data.shareWith = [...new Set(usernames)].sort((a, b) => a.localeCompare(b, 'fr'))
    await writeAtomic(join(dir, 'tips.json'), data)
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
    const total = totalOf(data.entries)
    if (total <= 0) return 'empty'
    const known = new Set(existing.map(u => u.toLowerCase()))
    const people = data.shareWith.filter(u => known.has(u.toLowerCase()))
    if (!people.length) return 'no_selection'
    const result: CloseResult = { shift, total, shares: splitEqually(total, people), by }
    data.entries = []
    data.shareWith = [] // le caissier du service suivant choisit ses propres personnes
    data.closes.push(result)
    await writeAtomic(join(dir, 'tips.json'), data)
    return result
  })
}
