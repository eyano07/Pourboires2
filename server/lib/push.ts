import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import webpush from 'web-push'
import { dataDir } from './store'

/**
 * Notifications Web Push (téléphone, même application fermée).
 * Les navigateurs ne les autorisent que sur un site HTTPS (ou localhost).
 * Clés VAPID générées une fois dans data/vapid.json ; abonnements dans data/push.json.
 */
export interface PushSub { endpoint: string, keys: { p256dh: string, auth: string } }
interface PushFile { [username: string]: PushSub[] }

const MAX_SUBS_PER_USER = 5

let vapid: { publicKey: string, privateKey: string } | null = null
let queue: Promise<unknown> = Promise.resolve()
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn)
  queue = run.catch(() => undefined)
  return run
}

async function writePrivate(file: string, data: unknown) {
  await fs.mkdir(dataDir(), { recursive: true, mode: 0o700 })
  const tmp = `${file}.${process.pid}.tmp`
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 })
  await fs.rename(tmp, file)
}

export async function vapidKeys() {
  if (vapid) return vapid
  const file = join(dataDir(), 'vapid.json')
  try {
    vapid = JSON.parse(await fs.readFile(file, 'utf8'))
  } catch (e: any) {
    if (e?.code !== 'ENOENT') throw e
    vapid = webpush.generateVAPIDKeys()
    await writePrivate(file, vapid)
  }
  return vapid!
}

async function readSubs(): Promise<PushFile> {
  try { return JSON.parse(await fs.readFile(join(dataDir(), 'push.json'), 'utf8')) || {} } catch { return {} }
}

export function isValidSub(s: any): s is PushSub {
  return !!s && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 1000
    && typeof s.keys?.p256dh === 'string' && typeof s.keys?.auth === 'string'
    && s.keys.p256dh.length < 200 && s.keys.auth.length < 100
}

export function subscribe(username: string, sub: PushSub) {
  return serial(async () => {
    const all = await readSubs()
    const key = username.toLowerCase()
    // Un même appareil n'est rattaché qu'à un seul compte à la fois.
    for (const u of Object.keys(all)) all[u] = all[u].filter(s => s.endpoint !== sub.endpoint)
    const list = all[key] ?? []
    list.push({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } })
    all[key] = list.slice(-MAX_SUBS_PER_USER)
    await writePrivate(join(dataDir(), 'push.json'), all)
  })
}

export function unsubscribe(username: string, endpoint?: string) {
  return serial(async () => {
    const all = await readSubs()
    const key = username.toLowerCase()
    if (!all[key]) return
    all[key] = endpoint ? all[key].filter(s => s.endpoint !== endpoint) : []
    if (!all[key].length) delete all[key]
    await writePrivate(join(dataDir(), 'push.json'), all)
  })
}

/** Envoie une notification aux appareils des utilisateurs indiqués (sans bloquer la requête). */
export async function notify(usernames: string[], payload: { title: string, body: string }) {
  const all = await readSubs()
  const keys = await vapidKeys()
  const subject = process.env.PUSH_CONTACT || 'mailto:admin@example.invalid'
  const dead: { user: string, endpoint: string }[] = []
  const jobs: Promise<unknown>[] = []
  for (const u of new Set(usernames.map(n => n.toLowerCase()))) {
    for (const sub of all[u] ?? []) {
      jobs.push(webpush.sendNotification(sub, JSON.stringify(payload), {
        vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 3600, timeout: 10000,
      }).catch((e: any) => {
        if (e?.statusCode === 404 || e?.statusCode === 410) dead.push({ user: u, endpoint: sub.endpoint })
        else console.error('[pourboires] notification non envoyée :', e?.statusCode ?? e?.message)
      }))
    }
  }
  await Promise.all(jobs)
  for (const d of dead) await unsubscribe(d.user, d.endpoint)
}
