import { createError, defineEventHandler, readBody } from 'h3'
import { requireUser, setSessionCookie } from '../../lib/session'
import { changePassword, findUser, UserError } from '../../lib/users'
import { disconnectUser } from '../../lib/events'

export default defineEventHandler(async (event) => {
  const me = await requireUser(event, { allowTemporaryPassword: true })
  const body = await readBody<{ current?: unknown, next?: unknown }>(event)
  try {
    const result = await changePassword(me.username, body?.current, body?.next)
    // Les autres sessions (ex. cookie volé) deviennent invalides ; celle-ci reçoit un nouveau cookie.
    const fresh = await findUser(me.username)
    if (fresh) setSessionCookie(event, fresh)
    disconnectUser(me.username) // les connexions en direct se rouvrent avec le nouveau cookie
    return result
  } catch (e) {
    if (e instanceof UserError) throw createError({ statusCode: e.code === 'wrong_password' ? 403 : 400, statusMessage: e.message })
    throw e
  }
})
