import { readUsers, type Role } from './auth'
import { nameMap } from './users'
import { broadcastEach } from './events'
import { notify } from './push'
import {
  currentShift, dataDir, readEarnings, readTips, shifts, totalsOf, type Currency, type EarningsFile, type TipsFile, type Totals,
} from './store'

const nf = (n: number, d: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d })
export const money = (n: number, c: Currency) => (c === 'USD' ? `${nf(n, 2)} $` : `${nf(n, 0)} FC`)
/** « 12,50 $ + 15 000 FC » (les devises à zéro sont omises). */
export function moneyTotals(t: Totals): string {
  const parts = (['USD', 'CDF'] as Currency[]).filter(c => t[c] > 0).map(c => money(t[c], c))
  return parts.length ? parts.join(' + ') : money(0, 'USD')
}

export interface Viewer { username: string, role: Role }
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/**
 * Ce qu'un utilisateur a le droit de voir (filtré côté serveur : rien d'autre n'est envoyé).
 * - Caissier et administrateur : toute la caisse et tous les partages du jour.
 * - Agent coché pour le service en cours : la caisse en cours.
 * - Tout agent : uniquement SON dernier gain, affiché jusqu'à ce qu'il soit resélectionné.
 * - Agent non coché : aucun montant.
 */
export function viewFor(user: Viewer, data: TipsFile, names: Record<string, string> = {}, earnings: EarningsFile = {}) {
  const staffView = user.role === 'caissier' || user.role === 'admin'
  const selected = data.shareWith.some(u => same(u, user.username))
  const canSeeTill = staffView || selected
  const entries = canSeeTill ? data.entries : []
  const shareWith = canSeeTill ? data.shareWith : []
  const closes = staffView ? data.closes : []
  // Noms complets, uniquement pour les personnes visibles dans cette vue.
  const visible = new Set([user.username, ...entries.map(e => e.username), ...shareWith, ...closes.flatMap(c => [c.by, ...c.shares.map(s => s.username)])])
  const viewNames: Record<string, string> = {}
  for (const u of visible) viewNames[u] = names[u.toLowerCase()] ?? u
  return {
    names: viewNames,
    date: data.date,
    shift: currentShift(data),
    shifts: shifts(),
    selected,
    canSeeTill,
    totals: canSeeTill ? totalsOf(data.entries) : null,
    entries,
    shareWith,
    closes,
    lastEarning: selected ? null : (earnings[user.username.toLowerCase()] ?? null),
  }
}

/** Comptes pouvant partager les pourboires : tous sauf les administrateurs. */
export async function staffNames(): Promise<string[]> {
  return (await readUsers(dataDir())).filter(u => u.role !== 'admin').map(u => u.username)
}

/** Envoie à chaque écran ouvert SA vue de la caisse. */
export async function publishTips(data?: TipsFile) {
  const d = data ?? await readTips()
  const [names, earnings] = await Promise.all([nameMap(), readEarnings()])
  broadcastEach('tips', c => viewFor(c, d, names, earnings))
}

/**
 * Alerte des utilisateurs : en direct (appli ouverte) + Web Push (téléphone, si HTTPS).
 * L'envoi Web Push ne bloque jamais la réponse à la caisse.
 */
export function alertUsers(usernames: string[], title: string, body: string) {
  if (!usernames.length) return
  broadcastEach('notify', () => ({ title, body }), usernames)
  notify(usernames, { title, body }).catch(e => console.error('[pourboires] push :', e?.message ?? e))
}

/** Alerte différente pour chaque utilisateur (ex. sa part au vidage). */
export function alertEach(messages: { username: string, title: string, body: string }[]) {
  for (const m of messages) alertUsers([m.username], m.title, m.body)
}
