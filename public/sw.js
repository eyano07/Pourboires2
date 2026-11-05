// Service worker : affiche les notifications Web Push, même application fermée.
self.addEventListener('push', (event) => {
  let data = { title: 'Pourboires chez Biso', body: '' }
  try { data = event.data.json() } catch { /* message vide */ }
  event.waitUntil((async () => {
    // Si l'application est ouverte et visible, l'alerte s'affiche déjà dans la page.
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    if (wins.some(w => w.visibilityState === 'visible')) return
    await self.registration.showNotification(data.title, { body: data.body, tag: 'pourboires', renotify: true, icon: '/icon-192.png' })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    if (wins.length) return wins[0].focus()
    return self.clients.openWindow('/')
  })())
})
