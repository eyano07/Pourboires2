import { createError, defineEventHandler, getRequestHeader, setResponseHeaders } from 'h3'

const MAX_BODY = 16 * 1024 // 16 Ko : largement suffisant pour cette API

export default defineEventHandler((event) => {
  setResponseHeaders(event, {
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  })

  const method = event.method
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return

  // Refuse les corps de requête trop gros (ou de taille inconnue).
  const len = getRequestHeader(event, 'content-length')
  const te = getRequestHeader(event, 'transfer-encoding')
  if ((te && !len) || Number(len ?? 0) > MAX_BODY) {
    throw createError({ statusCode: 413, statusMessage: 'Requête trop volumineuse' })
  }

  // Protection CSRF : une requête qui modifie des données doit venir de la même origine.
  // (Important car les autres applications du VPS, sur d'autres ports, sont « même site ».)
  const origin = getRequestHeader(event, 'origin')
  const host = getRequestHeader(event, 'host')
  if (origin && host) {
    let originHost = ''
    try { originHost = new URL(origin).host } catch { /* origine invalide */ }
    if (originHost !== host) throw createError({ statusCode: 403, statusMessage: 'Origine refusée' })
  }
})
