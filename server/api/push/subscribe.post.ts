import { createError, defineEventHandler, readBody } from 'h3'
import { requireUser } from '../../lib/session'
import { isValidSub, subscribe } from '../../lib/push'

export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const body = await readBody(event)
  if (!isValidSub(body)) throw createError({ statusCode: 400, statusMessage: 'Abonnement invalide' })
  await subscribe(me.username, body)
  return { ok: true }
})
