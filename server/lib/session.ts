import type { H3Event } from 'h3'
import { createError, getCookie } from 'h3'
import { readToken, type Role, type Session } from './auth'

export const COOKIE = 'biso_session'

export function sessionSecret(): string {
  const s = process.env.SESSION_SECRET
  if (s) return s
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 500, statusMessage: 'SESSION_SECRET manquant' })
  }
  return 'dev-secret-seulement-en-developpement'
}

export function currentSession(event: H3Event): Session | null {
  return readToken(getCookie(event, COOKIE), sessionSecret())
}

export function requireSession(event: H3Event, role?: Role): Session {
  const s = currentSession(event)
  if (!s) throw createError({ statusCode: 401, statusMessage: 'Non connecté' })
  if (role && s.r !== role) throw createError({ statusCode: 403, statusMessage: 'Accès refusé' })
  return s
}
