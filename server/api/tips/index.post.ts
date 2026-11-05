import { createError, defineEventHandler, readBody } from 'h3'
import { requireUser } from '../../lib/session'
import { addTip, validateAmount } from '../../lib/store'

export default defineEventHandler(async (event) => {
  const me = await requireUser(event, { roles: ['caissier'] })
  const body = await readBody<{ amount?: unknown }>(event)
  const amount = validateAmount(body?.amount)
  if (amount === null) throw createError({ statusCode: 400, statusMessage: 'Montant invalide' })
  return await addTip(me.username, amount)
})
