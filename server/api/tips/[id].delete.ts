import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requireUser } from '../../lib/session'
import { removeTip } from '../../lib/store'
import { publishTips } from '../../lib/live'

export default defineEventHandler(async (event) => {
  const me = await requireUser(event, { roles: ['caissier'] })
  const result = await removeTip(getRouterParam(event, 'id') ?? '', me.username)
  if (result === 'not_found') throw createError({ statusCode: 404, statusMessage: 'Saisie introuvable' })
  if (result === 'forbidden') throw createError({ statusCode: 403, statusMessage: 'Ce n’est pas votre saisie' })
  await publishTips()
  return { ok: true }
})
