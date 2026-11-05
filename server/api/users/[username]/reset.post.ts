import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireUser } from '../../../lib/session'
import { resetPassword } from '../../../lib/users'
import { asHttp } from '../../../lib/userRoute'

export default defineEventHandler(async (event) => {
  await requireUser(event, { roles: ['admin'] })
  const body = await readBody(event)
  return await asHttp(() => resetPassword(getRouterParam(event, 'username') ?? '', body?.password))
})
