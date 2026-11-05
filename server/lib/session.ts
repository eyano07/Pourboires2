import type { H3Event } from 'h3'
import { createError, getCookie } from 'h3'
import { readToken, type Role } from './auth'
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

export interface CurrentUser { username: string, role: Role, mustChangePassword: boolean }

/**
 * Utilisateur connecté, relu dans users.json : un compte supprimé ou dont le rôle a changé
 * est pris en compte immédiatement.
 */
export async function requireUser(
  event: H3Event,
  opts: { roles?: Role[], allowTemporaryPassword?: boolean } = {},
): Promise<CurrentUser> {
  const s = readToken(getCookie(event, COOKIE), sessionSecret())
  const user = s ? await findUser(s.u, dataDir()) : null
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
