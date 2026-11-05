import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const run = (dir: string, ...args: string[]) => {
  try { execFileSync('node', ['scripts/add-user.mjs', ...args], { env: { ...process.env, DATA_DIR: dir }, stdio: 'pipe' }); return 0 } catch (e: any) { return e.status }
}

describe('scripts/add-user.mjs', () => {
  it('crée users.json en 600', () => {
    const dir = mkdtempSync(join(tmpdir(), 'biso-'))
    expect(run(dir, 'chef', 'motdepasse0', 'admin')).toBe(0)
    expect(statSync(join(dir, 'users.json')).mode & 0o777).toBe(0o600)
  })
  it('refuse de toucher un users.json abîmé (aucun compte effacé)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'biso-'))
    writeFileSync(join(dir, 'users.json'), '[{"username":"chef",')
    expect(run(dir, 'zoe', 'motdepasse0', 'admin')).toBe(1)
    expect(readFileSync(join(dir, 'users.json'), 'utf8')).toBe('[{"username":"chef",')
  })
})

describe('scripts/import-users.mjs', () => {
  const imp = (dir: string, csv: string) => {
    const f = join(dir, 'liste.csv'); writeFileSync(f, csv)
    try { return { code: 0, out: execFileSync('node', ['scripts/import-users.mjs', f, 'Chezbiso'], { env: { ...process.env, DATA_DIR: dir }, stdio: 'pipe' }).toString() } } catch (e: any) { return { code: e.status, out: String(e.stderr) } }
  }
  it('importe, garde les comptes existants, refuse un fichier avec erreur', () => {
    const dir = mkdtempSync(join(tmpdir(), 'biso-'))
    expect(run(dir, 'sam.jabeer', 'secret99', 'lecteur')).toBe(0)
    const before = readFileSync(join(dir, 'users.json'), 'utf8')
    const r = imp(dir, 'identifiant;Noms;role\ngrace.mantekila;Grâce  Mantekila;caissier\nsam.jabeer;Sam Jabeer;lecteur\n')
    expect(r.code).toBe(0)
    const users = JSON.parse(readFileSync(join(dir, 'users.json'), 'utf8'))
    expect(users.find((u: any) => u.username === 'grace.mantekila')).toMatchObject({ name: 'Grâce Mantekila', role: 'caissier', mustChangePassword: true })
    expect(users.find((u: any) => u.username === 'sam.jabeer')).toEqual(JSON.parse(before)[0]) // inchangé
    expect(statSync(join(dir, 'users.json')).mode & 0o777).toBe(0o600)
    const after = readFileSync(join(dir, 'users.json'), 'utf8')
    expect(imp(dir, 'zoe;Zoe K;roi\n').code).toBe(1)
    expect(readFileSync(join(dir, 'users.json'), 'utf8')).toBe(after)
  })
})
