import { defineNitroPlugin } from 'nitropack/runtime'
import { readTips } from '../lib/store'

// Vérifie chaque minute : au changement de jour, tips.json est vidé sur le disque même si personne
// n'utilise l'application (sinon les montants de la veille resteraient jusqu'à la première visite).
export default defineNitroPlugin(() => {
  const tick = () => { readTips().catch(e => console.error('[pourboires] remise à zéro impossible :', e)) }
  tick()
  const timer = setInterval(tick, 60 * 1000)
  timer.unref?.()
})
