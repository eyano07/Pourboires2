import { createError, defineEventHandler } from 'h3'
import { requireUser } from '../../lib/session'
import { closeTips } from '../../lib/store'
import { alertEach, money, publishTips, staffNames } from '../../lib/live'

/** Vider la caisse : partage à parts égales entre les personnes cochées, compteur remis à zéro. */
export default defineEventHandler(async (event) => {
  const me = await requireUser(event, { roles: ['caissier'] })
  const result = await closeTips(me.username, await staffNames())
  if (result === 'empty') throw createError({ statusCode: 400, statusMessage: 'La caisse est déjà vide' })
  if (result === 'no_selection') throw createError({ statusCode: 400, statusMessage: 'Cochez au moins une personne pour le partage' })
  await publishTips()
  alertEach(result.shares.map(s => ({
    username: s.username,
    title: 'Caisse vidée',
    body: `Votre part : ${money(s.amount)} (total ${money(result.total)} partagé entre ${result.shares.length})`,
  })))
  return result
})
