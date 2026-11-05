import { defineEventHandler, setHeader } from 'h3'
import { requireUser } from '../../lib/session'
import { readTips } from '../../lib/store'
import { snapshot } from '../../lib/live'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  setHeader(event, 'Cache-Control', 'no-store')
  return snapshot(await readTips())
})
