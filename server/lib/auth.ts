import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto'

export type Role = 'caissier' | 'lecteur'
export interface User { username: string, role: Role, passwordHash: string }
export interface Session { u: string, r: Role, exp: number }

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [algo, saltHex, hashHex] = stored.split('$')
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length)
  return timingSafeEqual(actual, expected)
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url')
const sign = (data: string, secret: string) => createHmac('sha256', secret).update(data).digest('base64url')

export function createToken(user: { username: string, role: Role }, secret: string, now = Date.now()): string {
  const payload = b64(JSON.stringify({ u: user.username, r: user.role, exp: now + SESSION_TTL_MS } satisfies Session))
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
    if (typeof s.exp !== 'number' || s.exp < now) return null
    if (s.r !== 'caissier' && s.r !== 'lecteur') return null
    return s
  } catch { return null }
}

export async function readUsers(dir: string): Promise<User[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(join(dir, 'users.json'), 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

export async function saveUsers(dir: string, users: User[]): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(join(dir, 'users.json'), JSON.stringify(users, null, 2), 'utf8')
}

export async function authenticate(dir: string, username: string, password: string): Promise<User | null> {
  const users = await readUsers(dir)
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase())
  // Même coût de calcul si l'utilisateur n'existe pas.
  const ok = verifyPassword(password, user?.passwordHash ?? 'scrypt$00$00')
  return user && ok ? user : null
}
