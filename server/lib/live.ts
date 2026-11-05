import { readUsers } from './auth'
import { broadcast } from './events'
import { notify } from './push'
import { currentShift, dataDir, readTips, shifts, totalOf, type TipsFile } from './store'

export const money = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD' }).format(n)

export function snapshot(data: TipsFile) {
  return {
    date: data.date, total: totalOf(data.entries), entries: data.entries, shareWith: data.shareWith,
    closes: data.closes, shift: currentShift(data), shifts: shifts(),
  }
}

/** Comptes pouvant partager les pourboires : tous sauf les administrateurs. */
export async function staffNames(): Promise<string[]> {
  return (await readUsers(dataDir())).filter(u => u.role !== 'admin').map(u => u.username)
}

/** Diffuse l'état de la caisse à tous les écrans ouverts. */
export async function publishTips(data?: TipsFile) {
  broadcast('tips', snapshot(data ?? await readTips()))
}

/**
 * Alerte des utilisateurs : en direct (appli ouverte) + Web Push (téléphone, si HTTPS).
 * L'envoi Web Push ne bloque jamais la réponse à la caisse.
 */
export function alertUsers(usernames: string[], title: string, body: string) {
  if (!usernames.length) return
  broadcast('notify', { title, body }, usernames)
  notify(usernames, { title, body }).catch(e => console.error('[pourboires] push :', e?.message ?? e))
}

/** Alerte différente pour chaque utilisateur (ex. sa part au vidage). */
export function alertEach(messages: { username: string, title: string, body: string }[]) {
  for (const m of messages) alertUsers([m.username], m.title, m.body)
}
