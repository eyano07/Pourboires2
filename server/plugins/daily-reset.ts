import { defineNitroPlugin } from 'nitropack/runtime'
import { readTips } from '../lib/store'
import { publishTips } from '../lib/live'

// Vérifie chaque minute : au changement de jour, tips.json est vidé sur le disque même si personne
// n'utilise l'application, et les écrans ouverts sont mis à jour.
export default defineNitroPlugin(() => {
  let lastDate = ''
  const tick = () => {
    readTips().then((d) => {
      if (lastDate && d.date !== lastDate) return publishTips(d)
      lastDate = d.date
    }).then(() => readTips()).then((d) => { lastDate = d.date })
      .catch(e => console.error('[pourboires] remise à zéro impossible :', e))
  }
  tick()
  const timer = setInterval(tick, 60 * 1000)
  timer.unref?.()
})
