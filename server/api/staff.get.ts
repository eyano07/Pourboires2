import { defineEventHandler } from 'h3'
import { readUsers } from '../lib/auth'
import { requireUser } from '../lib/session'
import { dataDir, readTips } from '../lib/store'
import { onlineUsers } from '../lib/events'

/** Liste des personnes pouvant partager (tous les comptes sauf administrateurs), pour la caisse. */
export default defineEventHandler(async (event) => {
  await requireUser(event, { roles: ['caissier'] })
  const [users, tips] = await Promise.all([readUsers(dataDir()), readTips()])
  const online = new Set(onlineUsers())
  const selected = new Set(tips.shareWith.map(u => u.toLowerCase()))
  return users.filter(u => u.role !== 'admin').map(u => ({
    username: u.username,
    name: u.name || u.username,
    role: u.role,
    online: online.has(u.username.toLowerCase()),
    selected: selected.has(u.username.toLowerCase()),
  }))
})
