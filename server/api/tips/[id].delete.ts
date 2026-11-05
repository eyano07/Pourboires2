import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requireSession } from '../../lib/session'
import { removeTip } from '../../lib/store'

export default defineEventHandler(async (event) => {
  const s = requireSession(event, 'caissier')
  const result = await removeTip(getRouterParam(event, 'id') ?? '', s.u)
  if (result === 'not_found') throw createError({ statusCode: 404, statusMessage: 'Saisie introuvable' })
  if (result === 'forbidden') throw createError({ statusCode: 403, statusMessage: 'Ce n’est pas votre saisie' })
  return { ok: true }
})
