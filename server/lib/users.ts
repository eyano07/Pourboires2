import { hashPassword, MIN_PASSWORD, readUsers, ROLES, saveUsers, verifyPassword, type Role, type User } from './auth'
import { dataDir } from './store'

export class UserError extends Error {
  constructor(public code: 'invalid' | 'exists' | 'not_found' | 'forbidden' | 'wrong_password', message: string) {
    super(message)
  }
}

export const USERNAME_RE = /^[A-Za-z0-9_.-]{2,30}$/

// Les modifications de users.json sont sérialisées.
let queue: Promise<unknown> = Promise.resolve()
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn)
  queue = run.catch(() => undefined)
  return run
}

export interface PublicUser { username: string, role: Role, mustChangePassword: boolean }
const pub = (u: User): PublicUser => ({ username: u.username, role: u.role, mustChangePassword: !!u.mustChangePassword })

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

export async function findUser(username: string, dir = dataDir()): Promise<User | null> {
  return (await readUsers(dir)).find(u => same(u.username, username)) ?? null
}

export async function listUsers(dir = dataDir()): Promise<PublicUser[]> {
  return (await readUsers(dir)).map(pub)
}

/** Crée un compte avec un mot de passe par défaut : l'utilisateur devra le changer à sa première connexion. */
export function createUser(
  input: { username: unknown, role: unknown, password: unknown }, dir = dataDir(),
): Promise<PublicUser> {
  return serial(async () => {
    const username = String(input.username ?? '').trim()
    const password = String(input.password ?? '')
    if (!USERNAME_RE.test(username)) throw new UserError('invalid', 'Nom invalide (2 à 30 caractères : lettres, chiffres, . _ -)')
    if (!ROLES.includes(input.role as Role)) throw new UserError('invalid', 'Rôle invalide')
    if (password.length < MIN_PASSWORD) throw new UserError('invalid', `Mot de passe par défaut : ${MIN_PASSWORD} caractères minimum`)
    const users = await readUsers(dir)
    if (users.some(u => same(u.username, username))) throw new UserError('exists', 'Ce nom d’utilisateur existe déjà')
    const user: User = { username, role: input.role as Role, passwordHash: hashPassword(password), mustChangePassword: true }
    users.push(user)
    await saveUsers(dir, users)
    return pub(user)
  })
}

export function resetPassword(username: string, password: unknown, dir = dataDir()): Promise<PublicUser> {
  return serial(async () => {
    const pw = String(password ?? '')
    if (pw.length < MIN_PASSWORD) throw new UserError('invalid', `Mot de passe : ${MIN_PASSWORD} caractères minimum`)
    const users = await readUsers(dir)
    const user = users.find(u => same(u.username, username))
    if (!user) throw new UserError('not_found', 'Utilisateur introuvable')
    user.passwordHash = hashPassword(pw)
    user.mustChangePassword = true
    await saveUsers(dir, users)
    return pub(user)
  })
}

export function deleteUser(username: string, actingAdmin: string, dir = dataDir()): Promise<void> {
  return serial(async () => {
    if (same(username, actingAdmin)) throw new UserError('forbidden', 'Vous ne pouvez pas supprimer votre propre compte')
    const users = await readUsers(dir)
    const user = users.find(u => same(u.username, username))
    if (!user) throw new UserError('not_found', 'Utilisateur introuvable')
    await saveUsers(dir, users.filter(u => u !== user))
  })
}

export function changePassword(username: string, current: unknown, next: unknown, dir = dataDir()): Promise<PublicUser> {
  return serial(async () => {
    const cur = String(current ?? '')
    const nw = String(next ?? '')
    const users = await readUsers(dir)
    const user = users.find(u => same(u.username, username))
    if (!user) throw new UserError('not_found', 'Utilisateur introuvable')
    if (!verifyPassword(cur, user.passwordHash)) throw new UserError('wrong_password', 'Mot de passe actuel incorrect')
    if (nw.length < MIN_PASSWORD) throw new UserError('invalid', `Nouveau mot de passe : ${MIN_PASSWORD} caractères minimum`)
    if (nw === cur) throw new UserError('invalid', 'Le nouveau mot de passe doit être différent de l’ancien')
    user.passwordHash = hashPassword(nw)
    user.mustChangePassword = false
    await saveUsers(dir, users)
    return pub(user)
  })
}
