import { defineEventHandler, setHeader } from 'h3'
import { requireUser } from '../../lib/session'
import { readEarnings, readTips } from '../../lib/store'
import { viewFor } from '../../lib/live'
import { nameMap } from '../../lib/users'

export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  setHeader(event, 'Cache-Control', 'no-store')
  return viewFor(me, await readTips(), await nameMap(), await readEarnings())
})
