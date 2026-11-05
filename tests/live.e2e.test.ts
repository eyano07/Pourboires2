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

  it('scénario complet : devises, confidentialité, gains, notifications', async () => {
    const caisse = await login('caisse', 'motdepasse1')
    const alice = await login('alice', 'motdepasse2')
    const bob = await login('bob', 'motdepasse3')
    const zoe = await login('zoe', 'motdepasse4')
    const chef = await login('chef', 'adminpass1')
    const put = (path: string, cookie: string, body: unknown) => call(path, cookie, { method: 'PUT', body: JSON.stringify(body) })
    const tips = async (c: string) => (await call('/api/tips', c)).json()

    // Droits : seule la caisse sélectionne, vide, voit la liste du personnel
    for (const c of [alice, chef]) {
      expect((await call('/api/staff', c)).status).toBe(403)
      expect((await put('/api/tips/share', c, { usernames: ['alice'] })).status).toBe(403)
      expect((await post('/api/tips/close', c)).status).toBe(403)
    }

    const la = listen(alice), lb = listen(bob), lz = listen(zoe)
    await sleep(500)

    // Personnel : sans l'admin, avec noms et présence
    const staff = await (await call('/api/staff', caisse)).json()
    expect(staff.map((x: any) => x.username)).toEqual(['caisse', 'alice', 'bob', 'zoe'])
    expect(staff.find((x: any) => x.username === 'alice')).toMatchObject({ name: 'alice', online: true })

    // Web Push : alice et zoe abonnées ; un appareil « disparu »
    expect((await post('/api/push/subscribe', alice, device('alice-tel'))).status).toBe(200)
    expect((await post('/api/push/subscribe', zoe, device('zoe-tel'))).status).toBe(200)
    expect((await post('/api/push/subscribe', bob, { endpoint: `https://127.0.0.1:${pushPort}/push/gone`, keys: device('gone').keys })).status).toBe(200)
    expect((await post('/api/push/subscribe', alice, { endpoint: 'http://pas-https', keys: { p256dh: 'x', auth: 'y' } })).status).toBe(400)

    // Sélection du matin : alice et bob (pas zoe)
    expect((await put('/api/tips/share', caisse, { usernames: ['chef'] })).status).toBe(400)
    expect(await (await put('/api/tips/share', caisse, { usernames: ['BOB', 'alice'] })).json()).toEqual({ shareWith: ['alice', 'bob'] })
    expect((await post('/api/tips/close', caisse)).status).toBe(400) // caisse vide

    // Deux devises
    expect((await post('/api/tips', caisse, { amount: 10, currency: 'EUR' })).status).toBe(400)
    await post('/api/tips', caisse, { amount: 100, currency: 'USD' })
    await post('/api/tips', caisse, { amount: '0,01', currency: 'USD' })
    await post('/api/tips', caisse, { amount: '25 000', currency: 'FC' })
    await sleep(800)

    // Confidentialité : alice voit la caisse, zoe (non sélectionnée) ne reçoit AUCUN montant
    expect(la.of('tips').at(-1).totals).toEqual({ USD: 100.01, CDF: 25000 })
    for (const v of lz.of('tips')) {
      expect(v.totals).toBeNull()
      expect(v.entries).toEqual([])
      expect(JSON.stringify(v)).not.toMatch(/100\.01|25000/)
    }
    expect((await tips(zoe)).totals).toBeNull()
    expect((await tips(chef)).totals).toEqual({ USD: 100.01, CDF: 25000 }) // l'admin voit tout

    // Alertes : alice et bob seulement
    expect(la.of('notify').length).toBe(3)
    expect(lz.of('notify').length).toBe(0)
    expect(la.of('notify').at(-1).body).toMatch(/25\s000 FC/)
    expect(pushInbox.filter(p => p.device === 'alice-tel').length).toBe(3)
    expect(pushInbox.filter(p => p.device === 'zoe-tel').length).toBe(0)
    const { readFileSync } = await import('node:fs')
    expect(readFileSync(join(dir, 'data', 'push.json'), 'utf8')).not.toContain('/push/gone')

    // Vidage du matin : parts par devise
    const res = await (await post('/api/tips/close', caisse)).json()
    expect(res).toEqual({ shift: 'Matin', by: 'caisse', totals: { USD: 100.01, CDF: 25000 }, shares: [
      { username: 'alice', amounts: { USD: 50.01, CDF: 12500 } }, { username: 'bob', amounts: { USD: 50, CDF: 12500 } },
    ] })
    await sleep(800)
    // Alice n'est plus sélectionnée : elle voit son gain en grand, plus la caisse
    const va = la.of('tips').at(-1)
    expect(va.selected).toBe(false)
    expect(va.totals).toBeNull()
    expect(va.lastEarning).toMatchObject({ shift: 'Matin', amounts: { USD: 50.01, CDF: 12500 }, people: 2 })
    expect(va.closes).toEqual([]) // pas le détail des autres
    expect(JSON.stringify(va)).not.toContain('"bob"')
    // Zoe ne voit toujours rien
    expect(lz.of('tips').at(-1).lastEarning).toBeNull()
    expect(JSON.stringify(lz.of('tips').at(-1))).not.toMatch(/50\.01|12500/)
    expect(la.of('notify').at(-1)).toMatchObject({ title: 'Partage du service : Matin' })
    expect(la.of('notify').at(-1).body).toMatch(/50,01 \$ \+ 12\s500 FC/)
    // Caissier et admin voient les partages
    expect((await tips(chef)).closes.length).toBe(1)

    // Soir : bob est resélectionné -> son gain disparaît et il voit la nouvelle caisse ; alice garde son gain
    await put('/api/tips/share', caisse, { usernames: ['bob', 'zoe'] })
    await post('/api/tips', caisse, { amount: 20, currency: 'USD' })
    await sleep(600)
    expect(lb.of('tips').at(-1)).toMatchObject({ selected: true, lastEarning: null, totals: { USD: 20, CDF: 0 } })
    expect(la.of('tips').at(-1).lastEarning.amounts).toEqual({ USD: 50.01, CDF: 12500 })
    expect(la.of('tips').at(-1).totals).toBeNull()

    // Compte supprimé : connexion coupée, désabonné, retiré du partage
    expect((await call('/api/users/zoe', chef, { method: 'DELETE' })).status).toBe(200)
    await sleep(500)
    expect(lz.events.at(-1)?.event).toBe('closed')
    expect(readFileSync(join(dir, 'data', 'push.json'), 'utf8')).not.toContain('zoe-tel')
    const res2 = await (await post('/api/tips/close', caisse)).json()
    expect(res2).toMatchObject({ shift: 'Soir', shares: [{ username: 'bob', amounts: { USD: 20, CDF: 0 } }] })
    const closed = await tips(caisse)
    expect(closed.shift).toBeNull()
    expect((await post('/api/tips', caisse, { amount: 5 })).status).toBe(409)
    // Alice voit encore son gain du matin (jamais resélectionnée)
    expect((await tips(alice)).lastEarning.shift).toBe('Matin')

    const anon = listen('')
    await sleep(300)
    expect(anon.events[0]).toEqual({ event: 'http', data: 401 })
    la.stop(); lb.stop()
  })
})
