import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Nécessite `npm run build` au préalable (.output/server/index.mjs).
const server = join(process.cwd(), '.output/server/index.mjs')
const PORT = 3999
const base = `http://127.0.0.1:${PORT}`
let proc: ChildProcess
let dir: string

async function login(username: string, password: string) {
  const r = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }),
  })
  return { r, cookie: r.headers.get('set-cookie')?.split(';')[0] ?? '' }
}
const call = (path: string, cookie = '', init: RequestInit = {}) =>
  fetch(`${base}${path}`, { ...init, headers: { 'content-type': 'application/json', cookie, ...(init.headers ?? {}) } })

describe.skipIf(!existsSync(server))('API (serveur construit)', () => {
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'biso-e2e-'))
    const env = { ...process.env, DATA_DIR: dir, SESSION_SECRET: 'test-secret', PORT: String(PORT), HOST: '127.0.0.1' }
    execFileSync('node', ['scripts/add-user.mjs', 'chef', 'adminpass1', 'admin'], { env })
    execFileSync('node', ['scripts/add-user.mjs', 'caisse', 'motdepasse1', 'caissier'], { env })
    execFileSync('node', ['scripts/add-user.mjs', 'patron', 'motdepasse2', 'lecteur'], { env })
    proc = spawn('node', [server], { env, stdio: 'ignore' })
    for (let i = 0; i < 50; i++) {
      try { await fetch(`${base}/api/auth/me`); return } catch { await new Promise(r => setTimeout(r, 200)) }
    }
    throw new Error('serveur non démarré')
  })
  afterAll(() => { proc?.kill() })

  it('refuse sans connexion', async () => {
    expect((await call('/api/tips')).status).toBe(401)
    expect((await call('/api/tips', '', { method: 'POST', body: '{"amount":5}' })).status).toBe(401)
  })
  it('refuse de mauvais identifiants', async () => {
    expect((await login('caisse', 'faux')).r.status).toBe(401)
  })
  it('stocke les mots de passe hachés dans users.json', () => {
    const raw = readFileSync(join(dir, 'users.json'), 'utf8')
    expect(raw).not.toContain('motdepasse1')
    expect(raw).toContain('scrypt$')
  })

  it('scénario complet caissier / lecteur', async () => {
    const caisse = await login('caisse', 'motdepasse1')
    const patron = await login('patron', 'motdepasse2')
    expect(caisse.r.status).toBe(200)

    // Le caissier ajoute des pourboires
    for (const a of [100, '50,5']) {
      const r = await call('/api/tips', caisse.cookie, { method: 'POST', body: JSON.stringify({ amount: a }) })
      expect(r.status).toBe(200)
    }
    expect((await call('/api/tips', caisse.cookie, { method: 'POST', body: '{"amount":-3}' })).status).toBe(400)
    expect((await call('/api/tips', caisse.cookie, { method: 'POST', body: '{"amount":"abc"}' })).status).toBe(400)

    // Lecteur non sélectionné : aucun montant visible
    const hidden = await (await call('/api/tips', patron.cookie)).json()
    expect(hidden.totals).toBeNull()
    expect(hidden.entries).toEqual([])
    expect(JSON.stringify(hidden)).not.toContain('150')
    // Une fois sélectionné, il voit la caisse mais ne peut pas ajouter ni supprimer
    expect((await call('/api/tips/share', caisse.cookie, { method: 'PUT', body: '{"usernames":["patron"]}' })).status).toBe(200)
    const view = await (await call('/api/tips', patron.cookie)).json()
    expect(view.totals).toEqual({ USD: 150.5, CDF: 0 })
    expect(view.entries.map((e: any) => e.username)).toEqual(['caisse', 'caisse'])
    expect((await call('/api/tips', patron.cookie, { method: 'POST', body: '{"amount":10}' })).status).toBe(403)
    expect((await call(`/api/tips/${view.entries[0].id}`, patron.cookie, { method: 'DELETE' })).status).toBe(403)

    // Le caissier ne peut PAS supprimer une saisie ; seul l'administrateur le peut
    expect((await call(`/api/tips/${view.entries[0].id}`, caisse.cookie, { method: 'DELETE' })).status).toBe(403)
    const chef = await login('chef', 'adminpass1')
    expect((await call(`/api/tips/${view.entries[0].id}`, chef.cookie, { method: 'DELETE' })).status).toBe(200)
    expect((await call('/api/tips/inconnu', chef.cookie, { method: 'DELETE' })).status).toBe(404)
    expect((await (await call('/api/tips', patron.cookie)).json()).totals.USD).toBe(50.5)

    // Le fichier JSON contient bien nom + montant, et uniquement le jour courant
    const file = JSON.parse(readFileSync(join(dir, 'tips.json'), 'utf8'))
    expect(file.entries).toHaveLength(1)
    expect(Object.keys(file.entries[0]).sort()).toEqual(['amount', 'currency', 'id', 'username'])
    expect(file.entries[0]).toMatchObject({ username: 'caisse', amount: 50.5 })
  })

  it('administrateur : création d’un compte, première connexion, changement obligatoire du mot de passe', async () => {
    const admin = await login('chef', 'adminpass1')
    const post = (path: string, cookie: string, body: unknown) => call(path, cookie, { method: 'POST', body: JSON.stringify(body) })

    // Seul l'administrateur gère les utilisateurs
    const caisse = await login('caisse', 'motdepasse1')
    expect((await call('/api/users', caisse.cookie)).status).toBe(403)
    expect((await post('/api/users', caisse.cookie, { name: 'X Un', username: 'x1', role: 'lecteur', password: 'defaut1' })).status).toBe(403)
    expect((await call('/api/users')).status).toBe(401)

    // Création avec mot de passe par défaut
    const created = await post('/api/users', admin.cookie, { name: 'Marie Kabila', username: 'marie', role: 'caissier', password: 'defaut1' })
    expect(created.status).toBe(200)
    expect((await post('/api/users', admin.cookie, { name: 'Marie Deux', username: 'MARIE', role: 'caissier', password: 'defaut1' })).status).toBe(409)
    expect((await post('/api/users', admin.cookie, { name: 'Zoe', username: 'zoe', role: 'pirate', password: 'defaut1' })).status).toBe(400)
    const list = await (await call('/api/users', admin.cookie)).json()
    expect(JSON.stringify(list)).not.toContain('passwordHash')

    // Première connexion : tout est bloqué sauf /me et le changement de mot de passe
    const marie = await login('marie', 'defaut1')
    expect(marie.r.status).toBe(200)
    expect((await marie.r.json()).mustChangePassword).toBe(true)
    expect((await call('/api/tips', marie.cookie)).status).toBe(403)
    expect((await post('/api/tips', marie.cookie, { amount: 20 })).status).toBe(403)
    expect((await (await call('/api/auth/me', marie.cookie)).json()).mustChangePassword).toBe(true)
    expect((await post('/api/auth/password', marie.cookie, { current: 'faux', next: 'nouveau22' })).status).toBe(403)
    expect((await post('/api/auth/password', marie.cookie, { current: 'defaut1', next: 'abc' })).status).toBe(400)
    const changed = await post('/api/auth/password', marie.cookie, { current: 'defaut1', next: 'nouveau22' })
    expect(changed.status).toBe(200)
    marie.cookie = changed.headers.get('set-cookie')?.split(';')[0] ?? ''

    // Ensuite elle peut travailler, avec son nouveau mot de passe uniquement
    expect((await post('/api/tips', marie.cookie, { amount: 20 })).status).toBe(200)
    expect((await login('marie', 'defaut1')).r.status).toBe(401)
    expect((await login('marie', 'nouveau22')).r.status).toBe(200)

    // Réinitialisation : retour au mot de passe par défaut à changer
    expect((await post('/api/users/marie/reset', admin.cookie, { password: 'retour33' })).status).toBe(200)
    expect((await call('/api/tips', marie.cookie)).status).toBe(401)
    expect((await call('/api/tips', (await login('marie', 'retour33')).cookie)).status).toBe(403) // doit changer son mot de passe

    // Suppression : le compte est bloqué immédiatement, même avec un cookie encore valide
    expect((await call('/api/users/chef', admin.cookie, { method: 'DELETE' })).status).toBe(403)
    expect((await call('/api/users/marie', admin.cookie, { method: 'DELETE' })).status).toBe(200)
    expect((await call('/api/tips', marie.cookie)).status).toBe(401)

    // Un administrateur ne peut pas ajouter de pourboires
    expect((await post('/api/tips', admin.cookie, { amount: 5 })).status).toBe(403)
    expect((await call('/api/tips', admin.cookie)).status).toBe(200)
  })

  it('un ancien cookie est invalide après changement ou réinitialisation du mot de passe', async () => {
    const admin = await login('chef', 'adminpass1')
    const post = (path: string, cookie: string, body: unknown) => call(path, cookie, { method: 'POST', body: JSON.stringify(body) })
    await post('/api/users', admin.cookie, { name: 'Paul', username: 'paul', role: 'caissier', password: 'defaut1' })
    const vole = await login('paul', 'defaut1')
    const p = await login('paul', 'defaut1')
    const changed = await post('/api/auth/password', p.cookie, { current: 'defaut1', next: 'nouveau22' })
    expect(changed.status).toBe(200)
    const fresh = changed.headers.get('set-cookie')?.split(';')[0] ?? ''
    expect((await call('/api/tips', vole.cookie)).status).toBe(401)      // cookie volé : refusé
    expect((await call('/api/tips', fresh)).status).toBe(200)            // l'utilisateur reste connecté
    await post('/api/users/paul/reset', admin.cookie, { password: 'retour33' })
    expect((await call('/api/tips', fresh)).status).toBe(401)
  })

  it('protections : taille, origine, en-têtes, limiteur', async () => {
    const big = JSON.stringify({ username: 'x'.repeat(20000), password: 'y' })
    expect((await call('/api/auth/login', '', { method: 'POST', body: big })).status).toBe(413)
    const evil = await call('/api/auth/login', '', { method: 'POST', body: '{"username":"caisse","password":"motdepasse1"}', headers: { origin: 'http://127.0.0.1:9999' } })
    expect(evil.status).toBe(403)
    const same = await call('/api/auth/login', '', { method: 'POST', body: '{"username":"caisse","password":"motdepasse1"}', headers: { origin: base } })
    expect(same.status).toBe(200)
    const page = await fetch(`${base}/login`)
    expect(page.headers.get('x-frame-options')).toBe('DENY')
    expect(page.headers.get('x-content-type-options')).toBe('nosniff')
    expect((await call('/api/auth/login', '', { method: 'POST', body: JSON.stringify({ username: 'u'.repeat(31), password: 'x' }) })).status).toBe(400)
    let last = 0
    for (let i = 0; i < 9; i++) last = (await call('/api/auth/login', '', { method: 'POST', body: '{"username":"cible","password":"faux"}' })).status
    expect(last).toBe(429)
  })

  it('déconnexion et /me', async () => {
    const { cookie } = await login('patron', 'motdepasse2')
    expect(await (await call('/api/auth/me', cookie)).json()).toEqual({ username: 'patron', name: 'patron', role: 'lecteur', mustChangePassword: false })
    const out = await call('/api/auth/logout', cookie, { method: 'POST' })
    expect(out.status).toBe(200)
  })

  it('sert les pages (login et accueil redirigé)', async () => {
    const login = await fetch(`${base}/login`)
    expect(login.status).toBe(200)
    expect(await login.text()).toContain('Pourboires chez Biso')
    const home = await fetch(`${base}/`, { redirect: 'manual' })
    expect([301, 302, 307, 308]).toContain(home.status)
  })
})
