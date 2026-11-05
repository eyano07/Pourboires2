import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto'

export type Role = 'admin' | 'caissier' | 'lecteur'
export const ROLES: Role[] = ['admin', 'caissier', 'lecteur']
export interface User {
  username: string
  role: Role
  passwordHash: string
  /** Noms complets de la personne (affichés dans l'application). */
  name?: string
  /** Vrai tant que l'utilisateur n'a pas remplacé son mot de passe par défaut. */
  mustChangePassword?: boolean
}
export interface Session { u: string, v: string, exp: number }

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000
export const MIN_PASSWORD = 6

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [algo, saltHex, hashHex] = stored.split('$')
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  if (expected.length === 0) return false
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length)
  return timingSafeEqual(actual, expected)
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url')
const sign = (data: string, secret: string) => createHmac('sha256', secret).update(data).digest('base64url')

/** Empreinte courte du mot de passe haché : change dès que le mot de passe change. */
export function passwordVersion(passwordHash: string, secret: string): string {
  return createHmac('sha256', secret).update(`pwv:${passwordHash}`).digest('base64url').slice(0, 16)
}

/**
 * Le jeton contient le nom et la version du mot de passe : le rôle et l'état du compte sont relus
 * dans users.json à chaque requête, et un changement de mot de passe invalide les anciennes sessions.
 */
export function createToken(user: { username: string, passwordHash: string }, secret: string, now = Date.now()): string {
  const payload = b64(JSON.stringify({ u: user.username, v: passwordVersion(user.passwordHash, secret), exp: now + SESSION_TTL_MS } satisfies Session))
  return `${payload}.${sign(payload, secret)}`
}

export function readToken(token: string | undefined, secret: string, now = Date.now()): Session | null {
  if (!token) return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  const expected = Buffer.from(sign(payload, secret))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Session
    if (typeof s.u !== 'string' || typeof s.v !== 'string' || typeof s.exp !== 'number' || s.exp < now) return null
    return s
  } catch { return null }
}

/**
 * Lit users.json. Fichier absent => aucun compte. Fichier illisible => erreur : on ne doit
 * jamais réécrire (donc effacer) les comptes à partir d'un fichier corrompu.
 */
export async function readUsers(dir: string): Promise<User[]> {
  let raw: string
  try { raw = await fs.readFile(join(dir, 'users.json'), 'utf8') } catch (e: any) {
    if (e?.code === 'ENOENT') return []
    throw e
  }
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error('users.json invalide (tableau attendu)')
  return parsed
}

export async function saveUsers(dir: string, users: User[]): Promise<void> {
  await fs.mkdir(dir, { recursive: true, mode: 0o700 })
  const file = join(dir, 'users.json')
  const tmp = `${file}.${process.pid}.tmp`
  await fs.writeFile(tmp, JSON.stringify(users, null, 2), { encoding: 'utf8', mode: 0o600 })
  await fs.rename(tmp, file)
}

export async function authenticate(dir: string, username: string, password: string): Promise<User | null> {
  const users = await readUsers(dir)
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase())
  // Même coût de calcul si l'utilisateur n'existe pas.
  const ok = verifyPassword(password, user?.passwordHash ?? 'scrypt$00$00')
  return user && ok ? user : null
}
