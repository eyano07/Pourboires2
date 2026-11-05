import { defineEventHandler, readBody } from 'h3'
import { requireUser } from '../../lib/session'
import { unsubscribe } from '../../lib/push'

export default defineEventHandler(async (event) => {
  const me = await requireUser(event, { allowTemporaryPassword: true })
  const body = await readBody<{ endpoint?: unknown }>(event)
  await unsubscribe(me.username, typeof body?.endpoint === 'string' ? body.endpoint : undefined)
  return { ok: true }
})
