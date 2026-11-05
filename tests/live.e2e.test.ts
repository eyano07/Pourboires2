import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { createECDH, randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:https'
import { existsSync, mkdtempSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ece from 'http_ece'

// Teste : partage, vidage, connexion en direct (SSE) et notifications Web Push réelles
// (envoyées en HTTPS à un faux service de push qui déchiffre les messages).
const server = join(process.cwd(), '.output/server/index.mjs')
const PORT = 3998
const base = `http://127.0.0.1:${PORT}`
let proc: ChildProcess
let dir: string
let pushServer: Server
const pushInbox: { device: string, msg: any }[] = []
const devices: Record<string, { ecdh: ReturnType<typeof createECDH>, auth: Buffer }> = {}
let pushPort = 0

async function login(username: string, password: string) {
  const r = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }),
  })
  return r.headers.get('set-cookie')?.split(';')[0] ?? ''
}
const call = (path: string, cookie = '', init: RequestInit = {}) =>
  fetch(`${base}${path}`, { ...init, headers: { 'content-type': 'application/json', cookie, ...(init.headers ?? {}) } })
const post = (path: string, cookie: string, body?: unknown) => call(path, cookie, { method: 'POST', body: JSON.stringify(body ?? {}) })
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Ouvre une connexion en direct et enregistre les événements reçus. */
function listen(cookie: string) {
  const events: { event: string, data: any }[] = []
  const ctrl = new AbortController()
  const done = (async () => {
    const r = await fetch(`${base}/api/events`, { headers: { cookie }, signal: ctrl.signal })
    if (!r.ok || !r.body) { events.push({ event: 'http', data: r.status }); return }
    const reader = r.body.getReader()
    let buf = ''
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }))
      if (done) { events.push({ event: 'closed', data: null }); return }
      buf += new TextDecoder().decode(value)
      let i
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2)
        const ev = /^event: (.*)$/m.exec(block)?.[1] ?? 'message'
        const data = /^data: (.*)$/m.exec(block)?.[1]
        events.push({ event: ev, data: data ? JSON.parse(data) : null })
      }
    }
  })().catch(() => {})
  return { events, stop: () => ctrl.abort(), done, of: (e: string) => events.filter(x => x.event === e).map(x => x.data) }
}

function device(name: string) {
  const ecdh = createECDH('prime256v1'); ecdh.generateKeys()
  const auth = randomBytes(16)
  devices[name] = { ecdh, auth }
  return { endpoint: `https://127.0.0.1:${pushPort}/push/${name}`, keys: { p256dh: ecdh.getPublicKey('base64url'), auth: auth.toString('base64url') } }
}

describe.skipIf(!existsSync(server))('partage, vidage, direct et push', () => {
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'biso-live-'))
    // Faux service de push HTTPS (certificat auto-signé de test).
    execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-days', '1',
      '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem')], { stdio: 'ignore' })
    const { readFileSync } = await import('node:fs')
    pushServer = createServer({ key: readFileSync(join(dir, 'k.pem')), cert: readFileSync(join(dir, 'c.pem')) }, (req, res) => {
      const chunks: Buffer[] = []
      req.on('data', c => chunks.push(c))
      req.on('end', () => {
        const name = req.url!.split('/').pop()!
        if (name === 'gone') { res.writeHead(410).end(); return }
        const d = devices[name]
        const plain = ece.decrypt(Buffer.concat(chunks), { version: 'aes128gcm', privateKey: d.ecdh, authSecret: d.auth.toString('base64url') })
        pushInbox.push({ device: name, msg: JSON.parse(plain.toString()) })
        res.writeHead(201).end()
      })
    })
    await new Promise<void>(r => pushServer.listen(0, '127.0.0.1', () => r()))
    pushPort = (pushServer.address() as any).port

    const env = { ...process.env, DATA_DIR: join(dir, 'data'), SESSION_SECRET: 's', PORT: String(PORT), HOST: '127.0.0.1', NODE_EXTRA_CA_CERTS: join(dir, 'c.pem') }
    for (const [u, p, r] of [['chef', 'adminpass1', 'admin'], ['caisse', 'motdepasse1', 'caissier'], ['alice', 'motdepasse2', 'lecteur'], ['bob', 'motdepasse3', 'lecteur'], ['zoe', 'motdepasse4', 'lecteur']]) {
      execFileSync('node', ['scripts/add-user.mjs', u, p, r], { env })
    }
    proc = spawn('node', [server], { env, stdio: 'ignore' })
    for (let i = 0; i < 50; i++) {
      try { await fetch(`${base}/api/auth/me`); return } catch { await sleep(200) }
    }
  })
  afterAll(() => { proc?.kill(); pushServer?.close() })

  it('scénario complet', async () => {
    const caisse = await login('caisse', 'motdepasse1')
    const alice = await login('alice', 'motdepasse2')
    const bob = await login('bob', 'motdepasse3')
    const zoe = await login('zoe', 'motdepasse4')
    const chef = await login('chef', 'adminpass1')

    // Droits : seule la caisse coche, vide, voit la liste du personnel
    for (const c of [alice, chef]) {
      expect((await call('/api/staff', c)).status).toBe(403)
      expect((await call('/api/tips/share', c, { method: 'PUT', body: '{"usernames":["alice"]}' })).status).toBe(403)
      expect((await post('/api/tips/close', c)).status).toBe(403)
    }

    // Connexions en direct ouvertes par alice, bob, zoe
    const la = listen(alice), lb = listen(bob), lz = listen(zoe)
    await sleep(500)
    expect(la.of('tips')[0].total).toBe(0)

    // Liste du personnel : sans l'admin, avec indicateur en ligne
    const staff = await (await call('/api/staff', caisse)).json()
    expect(staff.map((s: any) => s.username)).toEqual(['caisse', 'alice', 'bob', 'zoe'])
    expect(staff.find((s: any) => s.username === 'alice').online).toBe(true)
    expect(staff.find((s: any) => s.username === 'caisse').online).toBe(false)

    // Abonnements Web Push (alice : 1 appareil ; zoe : 1 appareil ; un appareil « disparu »)
    const resKey = await (await call('/api/push/key', alice)).json()
    expect(resKey.publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/)
    expect((await post('/api/push/subscribe', alice, device('alice-tel'))).status).toBe(200)
    expect((await post('/api/push/subscribe', zoe, device('zoe-tel'))).status).toBe(200)
    expect((await post('/api/push/subscribe', bob, { endpoint: `https://127.0.0.1:${pushPort}/push/gone`, keys: device('gone').keys })).status).toBe(200)
    expect((await post('/api/push/subscribe', alice, { endpoint: 'http://pas-https', keys: { p256dh: 'x', auth: 'y' } })).status).toBe(400)
    expect(statSync(join(dir, 'data', 'push.json')).mode & 0o777).toBe(0o600)
    expect(statSync(join(dir, 'data', 'vapid.json')).mode & 0o777).toBe(0o600)

    // La caisse coche alice et bob (pas zoe) ; nom inconnu ou admin refusé
    expect((await call('/api/tips/share', caisse, { method: 'PUT', body: '{"usernames":["chef"]}' })).status).toBe(400)
    expect((await call('/api/tips/share', caisse, { method: 'PUT', body: '{"usernames":["inconnu"]}' })).status).toBe(400)
    const share = await call('/api/tips/share', caisse, { method: 'PUT', body: '{"usernames":["BOB","alice"]}' })
    expect(await share.json()).toEqual({ shareWith: ['alice', 'bob'] })

    // Vider une caisse vide : refusé
    expect((await post('/api/tips/close', caisse)).status).toBe(400)

    // Ajouts : tout le monde voit le total en direct, seuls alice et bob sont notifiés
    await post('/api/tips', caisse, { amount: 100 })
    await post('/api/tips', caisse, { amount: '0,01' })
    await sleep(800)
    expect(lz.of('tips').at(-1).total).toBe(100.01)
    expect(la.of('notify').length).toBe(2)
    expect(lb.of('notify').length).toBe(2)
    expect(lz.of('notify').length).toBe(0)
    expect(la.of('notify')[0].body).toContain('100,00')

    // Web Push : reçu et déchiffré pour alice uniquement ; l'appareil « disparu » (410) est retiré
    expect(pushInbox.filter(p => p.device === 'alice-tel').length).toBe(2)
    expect(pushInbox.filter(p => p.device === 'zoe-tel').length).toBe(0)
    expect(pushInbox[0].msg.title).toBe('Nouveau pourboire')
    const { readFileSync } = await import('node:fs')
    expect(readFileSync(join(dir, 'data', 'push.json'), 'utf8')).not.toContain('/push/gone')

    // Vidage : partage 100,01 entre alice et bob, compteur à zéro, chacun notifié de sa part
    const res = await post('/api/tips/close', caisse)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ shift: 'Matin', total: 100.01, by: 'caisse', shares: [{ username: 'alice', amount: 50.01 }, { username: 'bob', amount: 50 }] })
    await sleep(800)
    const after = await (await call('/api/tips', zoe)).json()
    expect(after.total).toBe(0)
    expect(after.entries).toEqual([])
    expect(after.closes[0].shares.length).toBe(2)
    expect(after.shift).toBe('Soir')
    expect(after.shareWith).toEqual([]) // le caissier du soir choisit ses personnes
    expect(lz.of('tips').at(-1).total).toBe(0)
    expect(la.of('notify').at(-1)).toMatchObject({ title: 'Partage du service : Matin' })
    expect(la.of('notify').at(-1).body).toContain('50,01')
    expect(lb.of('notify').at(-1).body).toContain('50,00')
    expect(pushInbox.at(-1)).toMatchObject({ device: 'alice-tel', msg: { title: 'Partage du service : Matin' } })

    // Service du soir : nouveaux pourboires à partir de zéro, l'équipe du matin n'est plus alertée
    const aliceAlerts = la.of('notify').length
    await call('/api/tips/share', caisse, { method: 'PUT', body: '{"usernames":["alice","bob"]}' })
    await post('/api/tips', caisse, { amount: 20 })
    expect((await (await call('/api/tips', alice)).json()).total).toBe(20)

    // Compte supprimé : sa connexion en direct est coupée et ses appareils désabonnés
    expect((await call('/api/users/alice', chef, { method: 'DELETE' })).status).toBe(200)
    await sleep(500)
    expect(la.events.at(-1)?.event).toBe('closed')
    expect(readFileSync(join(dir, 'data', 'push.json'), 'utf8')).not.toContain('alice-tel')
    // … et elle est retirée du partage au prochain vidage (soir), qui clôture la journée
    const res2 = await post('/api/tips/close', caisse)
    expect(await res2.json()).toMatchObject({ shift: 'Soir', shares: [{ username: 'bob', amount: 20 }] })
    const closed = await (await call('/api/tips', bob)).json()
    expect(closed.shift).toBeNull()
    expect(closed.closes.map((c: any) => c.shift)).toEqual(['Matin', 'Soir'])
    expect((await post('/api/tips', caisse, { amount: 5 })).status).toBe(409)
    expect((await call('/api/tips/share', caisse, { method: 'PUT', body: '{"usernames":["bob"]}' })).status).toBe(409)
    expect((await post('/api/tips/close', caisse)).status).toBe(409)
    expect(aliceAlerts).toBeGreaterThan(0)

    // Sans connexion : flux en direct refusé
    const anon = listen('')
    await sleep(300)
    expect(anon.events[0]).toEqual({ event: 'http', data: 401 })
    lb.stop(); lz.stop()
  })
})
