import { defineEventHandler, setHeader } from 'h3'
import { requireSession } from '../../lib/session'
import { readTips, totalOf } from '../../lib/store'

export default defineEventHandler(async (event) => {
  requireSession(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const data = await readTips()
  return { date: data.date, total: totalOf(data.entries), entries: data.entries }
})
