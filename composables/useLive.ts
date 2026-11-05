export interface Entry { id: string, username: string, amount: number }
export interface Share { username: string, amount: number }
export interface TipsData {
  date: string
  total: number
  entries: Entry[]
  shareWith: string[]
  lastClose: { total: number, shares: Share[], by: string } | null
}
export interface LiveNotice { title: string, body: string }

export const money = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD' }).format(n)

/** Partage à parts égales au centime près (même règle que le serveur). */
export function splitEqually(total: number, usernames: string[]): Share[] {
  const names = [...new Set(usernames)].sort((a, b) => a.localeCompare(b, 'fr'))
  if (!names.length) return []
  const cents = Math.round(total * 100)
  const base = Math.floor(cents / names.length)
  const rest = cents - base * names.length
  return names.map((username, i) => ({ username, amount: (base + (i < rest ? 1 : 0)) / 100 }))
}

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
