import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export interface TipEntry {
  id: string
  username: string
  amount: number
  time: string
}
export interface TipsFile {
  date: string
  entries: TipEntry[]
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
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await fs.rename(tmp, file)
}

async function load(dir: string, now: Date): Promise<TipsFile> {
  const file = join(dir, 'tips.json')
  const today = todayStr(now)
  let current: TipsFile | null = null
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'))
    if (parsed && typeof parsed.date === 'string' && Array.isArray(parsed.entries)) current = parsed
  } catch { /* fichier absent ou illisible */ }
  if (!current || current.date !== today) {
    current = { date: today, entries: [] }
    await fs.mkdir(dir, { recursive: true })
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
): Promise<TipEntry> {
  return serial(async () => {
    const data = await load(dir, now)
    const entry: TipEntry = { id: randomUUID(), username, amount, time: now.toISOString() }
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
