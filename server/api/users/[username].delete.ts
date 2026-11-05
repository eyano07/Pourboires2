import { defineEventHandler, getRouterParam } from 'h3'
import { requireUser } from '../../lib/session'
import { deleteUser } from '../../lib/users'
import { asHttp } from '../../lib/userRoute'
import { disconnectUser } from '../../lib/events'
import { unsubscribe } from '../../lib/push'

export default defineEventHandler(async (event) => {
  const me = await requireUser(event, { roles: ['admin'] })
  const name = getRouterParam(event, 'username') ?? ''
  await asHttp(() => deleteUser(name, me.username))
  disconnectUser(name)
  await unsubscribe(name)
  return { ok: true }
})
