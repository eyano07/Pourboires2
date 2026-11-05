import { createError, defineEventHandler, readBody } from 'h3'
import { requireSession } from '../../lib/session'
import { addTip, validateAmount } from '../../lib/store'

export default defineEventHandler(async (event) => {
  const s = requireSession(event, 'caissier')
  const body = await readBody<{ amount?: unknown }>(event)
  const amount = validateAmount(body?.amount)
  if (amount === null) throw createError({ statusCode: 400, statusMessage: 'Montant invalide' })
  return await addTip(s.u, amount)
})
