import { useTheme } from 'vuetify'

/**
 * Mode jour / nuit. Choix mémorisé dans un cookie (lu aussi par le serveur : pas de flash au chargement).
 * Sans choix, l'application suit le réglage du téléphone.
 */
export function useThemeMode() {
  const pref = useCookie<'light' | 'dark' | null>('biso_theme', { maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', default: () => null })
  const theme = useTheme()
  const apply = (dark: boolean) => {
    const name = dark ? 'bisoDark' : 'biso'
    if (typeof (theme as any).change === 'function') (theme as any).change(name)
    else theme.global.name.value = name
  }
  const isDark = computed(() => theme.global.current.value.dark)
  /** À l'affichage (serveur et navigateur identiques) : seulement le choix mémorisé. */
  function initFromCookie() {
    if (pref.value) apply(pref.value === 'dark')
  }
  /** Une fois la page affichée : sans choix mémorisé, suivre le réglage du téléphone (et ses changements). */
  function followSystem() {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    if (!pref.value) apply(mq.matches)
    mq.addEventListener?.('change', e => { if (!pref.value) apply(e.matches) })
  }
  function toggle() {
    pref.value = isDark.value ? 'light' : 'dark'
    apply(pref.value === 'dark')
  }
  return { isDark, initFromCookie, followSystem, toggle }
}
