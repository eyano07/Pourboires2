import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireUser } from '../../../lib/session'
import { resetPassword } from '../../../lib/users'
import { asHttp } from '../../../lib/userRoute'
import { disconnectUser } from '../../../lib/events'

export default defineEventHandler(async (event) => {
  await requireUser(event, { roles: ['admin'] })
  const body = await readBody(event)
  const name = getRouterParam(event, 'username') ?? ''
  const result = await asHttp(() => resetPassword(name, body?.password))
  disconnectUser(name)
  return result
})
