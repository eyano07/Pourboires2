/**
 * Événements en direct (Server-Sent Events) : une seule connexion ouverte par navigateur,
 * le serveur envoie les nouveautés au moment où elles arrivent (aucune interrogation répétée).
 */
export interface LiveClient {
  username: string
  send: (event: string, data: unknown) => void
  close: () => void
}

const clients = new Set<LiveClient>()
export const MAX_CLIENTS = 500

export function addClient(c: LiveClient): boolean {
  if (clients.size >= MAX_CLIENTS) return false
  clients.add(c)
  return true
}
export function removeClient(c: LiveClient) { clients.delete(c) }

/** Noms des utilisateurs ayant l'application ouverte en ce moment. */
export function onlineUsers(): string[] {
  return [...new Set([...clients].map(c => c.username.toLowerCase()))]
}

/** Envoie un événement à tous, ou seulement aux utilisateurs indiqués. */
export function broadcast(event: string, data: unknown, only?: string[]) {
  const allow = only ? new Set(only.map(u => u.toLowerCase())) : null
  for (const c of clients) {
    if (!allow || allow.has(c.username.toLowerCase())) c.send(event, data)
  }
}

/** Ferme les connexions d'un utilisateur (compte supprimé, mot de passe changé…). */
export function disconnectUser(username: string) {
  for (const c of [...clients]) if (c.username.toLowerCase() === username.toLowerCase()) c.close()
}
