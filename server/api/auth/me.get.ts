import { defineEventHandler } from 'h3'
import { requireUser } from '../../lib/session'

export default defineEventHandler(event => requireUser(event, { allowTemporaryPassword: true }))
