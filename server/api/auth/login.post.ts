import { createError, defineEventHandler, getRequestIP, readBody, setCookie } from 'h3'
import { authenticate, createToken, SESSION_TTL_MS } from '../../lib/auth'
import { dataDir } from '../../lib/store'
import { COOKIE, sessionSecret } from '../../lib/session'

// Limite simple : 8 échecs / 15 min par IP + nom.
const failures = new Map<string, { n: number, until: number }>()

export default defineEventHandler(async (event) => {
  const body = await readBody<{ username?: string, password?: string }>(event)
  const username = String(body?.username ?? '').trim()
  const password = String(body?.password ?? '')
  if (!username || !password) throw createError({ statusCode: 400, statusMessage: 'Nom et mot de passe requis' })

  const key = `${getRequestIP(event) ?? 'ip'}|${username.toLowerCase()}`
  const f = failures.get(key)
  if (f && f.until > Date.now() && f.n >= 8) {
    throw createError({ statusCode: 429, statusMessage: 'Trop de tentatives, réessayez plus tard' })
  }

  const user = await authenticate(dataDir(), username, password)
  if (!user) {
    const cur = f && f.until > Date.now() ? f : { n: 0, until: Date.now() + 15 * 60 * 1000 }
    cur.n++
    failures.set(key, cur)
    throw createError({ statusCode: 401, statusMessage: 'Identifiants incorrects' })
  }
  failures.delete(key)
  setCookie(event, COOKIE, createToken(user, sessionSecret()), {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: SESSION_TTL_MS / 1000,
    secure: process.env.COOKIE_SECURE === 'true',
  })
  return { username: user.username, role: user.role }
})
