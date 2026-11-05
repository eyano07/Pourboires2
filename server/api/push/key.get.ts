import { defineEventHandler } from 'h3'
import { requireUser } from '../../lib/session'
import { vapidKeys } from '../../lib/push'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  return { publicKey: (await vapidKeys()).publicKey }
})
