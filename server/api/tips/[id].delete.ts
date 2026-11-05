import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requireUser } from '../../lib/session'
import { removeTip } from '../../lib/store'
import { publishTips } from '../../lib/live'

/** Seul l'administrateur peut supprimer un pourboire enregistré (le caissier ne le peut pas). */
export default defineEventHandler(async (event) => {
  await requireUser(event, { roles: ['admin'] })
  const result = await removeTip(getRouterParam(event, 'id') ?? '')
  if (result === 'not_found') throw createError({ statusCode: 404, statusMessage: 'Saisie introuvable' })
  await publishTips()
  return { ok: true }
})
