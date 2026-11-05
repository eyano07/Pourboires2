import { createError, defineEventHandler, getRequestIP, readBody } from 'h3'
import { authenticate } from '../../lib/auth'
import { dataDir } from '../../lib/store'
import { setSessionCookie } from '../../lib/session'

// Limite : 8 échecs / 15 min par IP + nom. Mémoire bornée (entrées expirées purgées, 5000 max).
const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILS = 8
const MAX_KEYS = 5000
const failures = new Map<string, { n: number, until: number }>()

function prune(now: number) {
  for (const [k, v] of failures) if (v.until <= now) failures.delete(k)
  while (failures.size >= MAX_KEYS) failures.delete(failures.keys().next().value as string)
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ username?: string, password?: string }>(event)
  const username = String(body?.username ?? '').trim()
  const password = String(body?.password ?? '')
  if (!username || !password || username.length > 30 || password.length > 200) {
    throw createError({ statusCode: 400, statusMessage: 'Identifiants incorrects' })
  }

  const now = Date.now()
  const key = `${getRequestIP(event) ?? 'ip'}|${username.toLowerCase()}`
  const f = failures.get(key)
  if (f && f.until > now && f.n >= MAX_FAILS) {
    throw createError({ statusCode: 429, statusMessage: 'Trop de tentatives, réessayez plus tard' })
  }

  const user = await authenticate(dataDir(), username, password)
  if (!user) {
    if (!f || f.until <= now) { prune(now); failures.set(key, { n: 1, until: now + WINDOW_MS }) }
    else f.n++
    throw createError({ statusCode: 401, statusMessage: 'Identifiants incorrects' })
  }
  failures.delete(key)
  setSessionCookie(event, user)
  return { username: user.username, role: user.role, mustChangePassword: !!user.mustChangePassword }
})
