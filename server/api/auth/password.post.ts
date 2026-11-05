import { createError, defineEventHandler, readBody } from 'h3'
import { requireUser } from '../../lib/session'
import { changePassword, UserError } from '../../lib/users'

export default defineEventHandler(async (event) => {
  const me = await requireUser(event, { allowTemporaryPassword: true })
  const body = await readBody<{ current?: unknown, next?: unknown }>(event)
  try {
    return await changePassword(me.username, body?.current, body?.next)
  } catch (e) {
    if (e instanceof UserError) throw createError({ statusCode: e.code === 'wrong_password' ? 403 : 400, statusMessage: e.message })
    throw e
  }
})
