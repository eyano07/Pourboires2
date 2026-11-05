import { createError, defineEventHandler, readBody } from 'h3'
import { requireUser } from '../../lib/session'
import { setShareWith } from '../../lib/store'
import { publishTips, staffNames } from '../../lib/live'

/** La caisse coche les personnes qui partagent le pourboire (et seront notifiées). */
export default defineEventHandler(async (event) => {
  await requireUser(event, { roles: ['caissier'] })
  const body = await readBody<{ usernames?: unknown }>(event)
  if (!Array.isArray(body?.usernames) || body.usernames.length > 200) {
    throw createError({ statusCode: 400, statusMessage: 'Liste invalide' })
  }
  const staff = await staffNames()
  const byLower = new Map(staff.map(u => [u.toLowerCase(), u]))
  const chosen: string[] = []
  for (const u of body.usernames) {
    const real = typeof u === 'string' ? byLower.get(u.toLowerCase()) : undefined
    if (!real) throw createError({ statusCode: 400, statusMessage: `Utilisateur inconnu : ${String(u).slice(0, 30)}` })
    chosen.push(real)
  }
  const shareWith = await setShareWith(chosen)
  if (shareWith === 'day_closed') throw createError({ statusCode: 409, statusMessage: 'Journée clôturée : reprise demain' })
  await publishTips()
  return { shareWith }
})
