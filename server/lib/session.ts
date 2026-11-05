import type { H3Event } from 'h3'
import { createError, getCookie, setCookie } from 'h3'
import { createToken, passwordVersion, readToken, SESSION_TTL_MS, type Role } from './auth'
import { dataDir } from './store'
import { findUser } from './users'

export const COOKIE = 'biso_session'

export function sessionSecret(): string {
  const s = process.env.SESSION_SECRET
  if (s) return s
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 500, statusMessage: 'SESSION_SECRET manquant' })
  }
  return 'dev-secret-seulement-en-developpement'
}

export function setSessionCookie(event: H3Event, user: { username: string, passwordHash: string }) {
  setCookie(event, COOKIE, createToken(user, sessionSecret()), {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: SESSION_TTL_MS / 1000,
    secure: process.env.COOKIE_SECURE === 'true',
  })
}

export interface CurrentUser { username: string, role: Role, mustChangePassword: boolean }

/** Valide un jeton de session (aussi utilisé pour revérifier les connexions en direct). */
export async function userFromToken(token: string | undefined) {
  const secret = sessionSecret()
  const s = readToken(token, secret)
  const found = s ? await findUser(s.u, dataDir()) : null
  // Session refusée si le mot de passe a changé depuis la connexion.
  return found && s && passwordVersion(found.passwordHash, secret) === s.v ? found : null
}

export const sessionToken = (event: H3Event) => getCookie(event, COOKIE)

/**
 * Utilisateur connecté, relu dans users.json : un compte supprimé ou dont le rôle a changé
 * est pris en compte immédiatement.
 */
export async function requireUser(
  event: H3Event,
  opts: { roles?: Role[], allowTemporaryPassword?: boolean } = {},
): Promise<CurrentUser> {
  const user = await userFromToken(sessionToken(event))
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Non connecté' })
  const mustChangePassword = !!user.mustChangePassword
  if (mustChangePassword && !opts.allowTemporaryPassword) {
    throw createError({ statusCode: 403, statusMessage: 'Changement de mot de passe requis' })
  }
  if (opts.roles && !opts.roles.includes(user.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Accès refusé' })
  }
  return { username: user.username, role: user.role, mustChangePassword }
}
