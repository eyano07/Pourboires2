import { defineEventHandler } from 'h3'
import { requireUser } from '../../lib/session'
import { listUsers } from '../../lib/users'

export default defineEventHandler(async (event) => {
  await requireUser(event, { roles: ['admin'] })
  return await listUsers()
})
