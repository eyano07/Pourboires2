import { createError, defineEventHandler, readBody } from 'h3'
import { requireUser } from '../../lib/session'
import { addTip, readTips, totalOf, validateAmount } from '../../lib/store'
import { alertUsers, money, publishTips } from '../../lib/live'

export default defineEventHandler(async (event) => {
  const me = await requireUser(event, { roles: ['caissier'] })
  const body = await readBody<{ amount?: unknown }>(event)
  const amount = validateAmount(body?.amount)
  if (amount === null) throw createError({ statusCode: 400, statusMessage: 'Montant invalide' })
  const entry = await addTip(me.username, amount)
  if (entry === 'day_closed') throw createError({ statusCode: 409, statusMessage: 'Journée clôturée : reprise demain' })
  const data = await readTips()
  await publishTips(data)
  // Seules les personnes cochées par la caisse sont notifiées (pas l'auteur de la saisie).
  const targets = data.shareWith.filter(u => u.toLowerCase() !== me.username.toLowerCase())
  alertUsers(targets, 'Nouveau pourboire', `+${money(amount)} — caisse : ${money(totalOf(data.entries))}`)
  return entry
})
