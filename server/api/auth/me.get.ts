import { defineEventHandler } from 'h3'
import { requireSession } from '../../lib/session'

export default defineEventHandler((event) => {
  const s = requireSession(event)
  return { username: s.u, role: s.r }
})
