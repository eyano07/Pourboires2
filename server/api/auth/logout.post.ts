import { defineEventHandler, deleteCookie } from 'h3'
import { COOKIE } from '../../lib/session'

export default defineEventHandler((event) => {
  deleteCookie(event, COOKIE, { path: '/' })
  return { ok: true }
})
