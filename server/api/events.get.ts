import { createError, createEventStream, defineEventHandler } from 'h3'
import { requireUser, sessionToken, userFromToken } from '../lib/session'
import { addClient, broadcast, removeClient, type LiveClient } from '../lib/events'
import { readTips } from '../lib/store'
import { snapshot } from '../lib/live'

/**
 * Connexion en direct (Server-Sent Events). Le navigateur garde UNE connexion ouverte et
 * le serveur y pousse les changements : aucune requête répétée.
 */
export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const token = sessionToken(event)
  const stream = createEventStream(event)
  let closed = false
  const client: LiveClient = {
    username: me.username,
    send: (name, data) => {
      if (closed) return
      stream.push({ event: name, data: JSON.stringify(data) }).catch(() => client.close())
    },
    close: () => {
      if (closed) return
      closed = true
      removeClient(client)
      clearInterval(heartbeat)
      stream.close().catch(() => {})
    },
  }
  if (!addClient(client)) throw createError({ statusCode: 503, statusMessage: 'Trop de connexions' })
  broadcast('presence', {})

  // Toutes les 25 s : maintient la connexion et revérifie la session (compte supprimé, mot de passe changé).
  const heartbeat = setInterval(async () => {
    if (!(await userFromToken(token).catch(() => null))) return client.close()
    stream.push({ event: 'ping', data: '{}' }).catch(() => client.close())
  }, 25000)

  stream.onClosed(() => { client.close(); broadcast('presence', {}) })
  client.send('tips', snapshot(await readTips()))
  return stream.send()
})
