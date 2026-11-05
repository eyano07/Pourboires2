import { createError } from 'h3'
import { UserError } from './users'

/** Convertit une UserError en erreur HTTP. */
export async function asHttp<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn() } catch (e) {
    if (e instanceof UserError) {
      const status = { invalid: 400, exists: 409, not_found: 404, forbidden: 403, wrong_password: 403 }[e.code]
      throw createError({ statusCode: status, statusMessage: e.message })
    }
    throw e
  }
}
