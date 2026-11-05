export type Currency = 'USD' | 'CDF'
export const CURRENCIES: Currency[] = ['USD', 'CDF']
export type Totals = Record<Currency, number>
export interface Entry { id: string, username: string, amount: number, currency: Currency }
export interface Share { username: string, amounts: Totals }
export interface TipsData {
  /** Noms complets des personnes visibles dans cette vue (identifiant -> noms). */
  names: Record<string, string>
  date: string
  /** Service en cours, ou null si la journée est clôturée. */
  shift: string | null
  shifts: string[]
  /** L'utilisateur est coché pour le service en cours. */
  selected: boolean
  /** L'utilisateur a le droit de voir la caisse (caissier, admin, ou agent coché). */
  canSeeTill: boolean
  totals: Totals | null
  entries: Entry[]
  shareWith: string[]
  /** Tous les partages du jour (caissier et admin uniquement). */
  closes: { shift: string, totals: Totals, shares: Share[], by: string }[]
  /** Dernier gain de l'agent, affiché jusqu'à ce qu'il soit resélectionné. */
  lastEarning: { shift: string, date: string, amounts: Totals, people: number } | null
}
export interface LiveNotice { title: string, body: string }

const UNIT: Record<Currency, number> = { USD: 100, CDF: 1 }
const nf = (n: number, d: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d })
export const money = (n: number, c: Currency = 'USD') => (c === 'USD' ? `${nf(n, 2)} $` : `${nf(n, 0)} FC`)
export const currencyLabel = (c: Currency) => (c === 'USD' ? 'USD' : 'FC')
export const hasMoney = (t?: Totals | null) => !!t && CURRENCIES.some(c => t[c] > 0)
export function moneyTotals(t?: Totals | null): string {
  const parts = CURRENCIES.filter(c => (t?.[c] ?? 0) > 0).map(c => money(t![c], c))
  return parts.length ? parts.join(' + ') : money(0)
}

/** Partage à parts égales par devise (même règle que le serveur). */
export function splitEqually(totals: Totals | null | undefined, usernames: string[]): Share[] {
  const names = [...new Set(usernames)].sort((a, b) => a.localeCompare(b, 'fr'))
  return names.map((username, i) => {
    const amounts = { USD: 0, CDF: 0 } as Totals
    for (const c of CURRENCIES) {
      const units = Math.round((totals?.[c] ?? 0) * UNIT[c])
      const base = Math.floor(units / names.length)
      amounts[c] = (base + (i < units - base * names.length ? 1 : 0)) / UNIT[c]
    }
    return { username, amounts }
  })
}

/** Initiales et couleur stable pour un nom (avatars). */
export function initials(name: string) {
  const parts = name.split(/[_\s.-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '')).toUpperCase()
}
const PALETTE = ['#0f766e', '#7c3aed', '#db2777', '#ea580c', '#2563eb', '#16a34a', '#9333ea', '#0891b2', '#c2410c', '#4f46e5']
export function avatarColor(name: string) {
  let h = 0
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}
export const prettyName = (u: string) => u.replace(/_/g, ' ')

export const useTips = () => useState<TipsData | null>('tips', () => null)
export const useNotices = () => useState<LiveNotice[]>('notices', () => [])
export const useLiveStatus = () => useState<'off' | 'connecting' | 'on'>('live', () => 'off')
export const usePresenceTick = () => useState<number>('presence', () => 0)

let source: EventSource | null = null
let retry: ReturnType<typeof setTimeout> | null = null

/**
 * Une seule connexion en direct par onglet (Server-Sent Events) : le serveur pousse
 * l'état de la caisse et les alertes. Aucune requête répétée.
 */
export function startLive() {
  if (import.meta.server || source) return
  const tips = useTips()
  const notices = useNotices()
  const status = useLiveStatus()
  const presence = usePresenceTick()
  status.value = 'connecting'
  source = new EventSource('/api/events')
  source.addEventListener('open', () => { status.value = 'on' })
  source.addEventListener('tips', (e) => { tips.value = JSON.parse((e as MessageEvent).data) })
  source.addEventListener('presence', () => { presence.value++ })
  source.addEventListener('notify', (e) => {
    const n = JSON.parse((e as MessageEvent).data) as LiveNotice
    notices.value = [n] // toujours la plus récente (les anciennes seraient périmées)
    try { navigator.vibrate?.(200) } catch { /* facultatif */ }
  })
  source.addEventListener('error', () => {
    // Le navigateur reconnecte seul ; si la connexion est refusée (session expirée), on vérifie.
    if (source?.readyState !== EventSource.CLOSED) { status.value = 'connecting'; return }
    stopLive()
    status.value = 'connecting'
    retry = setTimeout(async () => {
      const me = await fetchMe()
      if (!me || me.mustChangePassword) {
        useMe().value = me
        await navigateTo(me ? '/password' : '/login')
      } else startLive()
    }, 3000)
  })
}

export function stopLive() {
  if (retry) clearTimeout(retry)
  retry = null
  source?.close()
  source = null
  useLiveStatus().value = 'off'
}
