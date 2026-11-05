import { defineEventHandler, getRouterParam } from 'h3'
import { requireUser } from '../../lib/session'
import { deleteUser } from '../../lib/users'
import { asHttp } from '../../lib/userRoute'

export default defineEventHandler(async (event) => {
  const me = await requireUser(event, { roles: ['admin'] })
  await asHttp(() => deleteUser(getRouterParam(event, 'username') ?? '', me.username))
  return { ok: true }
})
