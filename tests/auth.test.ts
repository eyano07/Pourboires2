import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { authenticate, createToken, hashPassword, readToken, saveUsers, SESSION_TTL_MS, verifyPassword } from '../server/lib/auth'

describe('mots de passe', () => {
  it('hache et vérifie', () => {
    const h = hashPassword('secret123')
    expect(h).not.toContain('secret123')
    expect(verifyPassword('secret123', h)).toBe(true)
    expect(verifyPassword('autre', h)).toBe(false)
  })
  it('deux hachages du même mot de passe diffèrent (sel)', () => {
    expect(hashPassword('x1x1x1')).not.toBe(hashPassword('x1x1x1'))
  })
  it('refuse un format de hachage invalide', () => {
    expect(verifyPassword('a', 'nimportequoi')).toBe(false)
  })
})

describe('jeton de session', () => {
  const user = { username: 'alice', role: 'caissier' as const }
  it('aller-retour valide', () => {
    const s = readToken(createToken(user, 'k'), 'k')
    expect(s?.u).toBe('alice')
    expect(s?.r).toBe('caissier')
  })
  it('refuse une mauvaise clé, un jeton modifié ou absent', () => {
    const t = createToken(user, 'k')
    expect(readToken(t, 'autre')).toBeNull()
    const [p, sig] = t.split('.')
    const forged = Buffer.from(JSON.stringify({ u: 'alice', r: 'lecteur', exp: Date.now() + 1e6 })).toString('base64url')
    expect(readToken(`${forged}.${sig}`, 'k')).toBeNull()
    expect(readToken(undefined, 'k')).toBeNull()
    expect(readToken(p, 'k')).toBeNull()
  })
  it('refuse un jeton expiré', () => {
    const t = createToken(user, 'k', 1000)
    expect(readToken(t, 'k', 1000 + SESSION_TTL_MS + 1)).toBeNull()
  })
})

describe('authenticate', () => {
  it('trouve l’utilisateur (insensible à la casse) et refuse les mauvais identifiants', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'biso-'))
    await saveUsers(dir, [{ username: 'Alice', role: 'caissier', passwordHash: hashPassword('pass123') }])
    expect((await authenticate(dir, 'alice', 'pass123'))?.role).toBe('caissier')
    expect(await authenticate(dir, 'alice', 'faux')).toBeNull()
    expect(await authenticate(dir, 'zoe', 'pass123')).toBeNull()
  })
})
