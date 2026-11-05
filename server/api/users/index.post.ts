import { defineEventHandler, readBody } from 'h3'
import { requireUser } from '../../lib/session'
import { createUser } from '../../lib/users'
import { asHttp } from '../../lib/userRoute'

export default defineEventHandler(async (event) => {
  await requireUser(event, { roles: ['admin'] })
  const body = await readBody(event)
  return await asHttp(() => createUser({ username: body?.username, role: body?.role, password: body?.password }))
})
