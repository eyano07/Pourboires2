import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { authenticate } from '../server/lib/auth'
import { changePassword, createUser, deleteUser, findUser, listUsers, nameMap, renameUser, resetPassword, UserError } from '../server/lib/users'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'biso-u-')) })

const rejects = async (p: Promise<unknown>, code: string) => {
  const e = await p.then(() => null, e => e)
  expect(e).toBeInstanceOf(UserError)
  expect((e as UserError).code).toBe(code)
}

describe('création par l’administrateur', () => {
  it('crée un compte avec mot de passe par défaut à changer', async () => {
    const u = await createUser({ name: 'Nom marie', username: 'marie', role: 'caissier', password: 'defaut1' }, dir)
    expect(u).toEqual({ username: 'marie', name: 'Nom marie', role: 'caissier', mustChangePassword: true })
    expect((await authenticate(dir, 'marie', 'defaut1'))?.mustChangePassword).toBe(true)
    expect(readFileSync(join(dir, 'users.json'), 'utf8')).not.toContain('defaut1')
  })
  it('refuse nom invalide, rôle invalide, mot de passe court, doublon (insensible à la casse)', async () => {
    await rejects(createUser({ name: 'x', username: 'okname', role: 'caissier', password: 'defaut1' }, dir), 'invalid')
    await rejects(createUser({ name: 'Nom a b', username: 'a b', role: 'caissier', password: 'defaut1' }, dir), 'invalid')
    await rejects(createUser({ name: 'Nom ok', username: 'ok', role: 'roi', password: 'defaut1' }, dir), 'invalid')
    await rejects(createUser({ name: 'Nom ok', username: 'ok', role: 'lecteur', password: '123' }, dir), 'invalid')
    await createUser({ name: 'Nom Marie', username: 'Marie', role: 'lecteur', password: 'defaut1' }, dir)
    await rejects(createUser({ name: 'Nom marie', username: 'marie', role: 'lecteur', password: 'defaut1' }, dir), 'exists')
  })
  it('crée 10 comptes simultanément sans perte', async () => {
    await Promise.all(Array.from({ length: 10 }, (_, i) => createUser({ name: `Agent ${i}`, username: `user${i}`, role: 'lecteur', password: 'defaut1' }, dir)))
    expect(await listUsers(dir)).toHaveLength(10)
  })
})

describe('changement de mot de passe', () => {
  it('lève l’obligation de changement', async () => {
    await createUser({ name: 'Nom marie', username: 'marie', role: 'caissier', password: 'defaut1' }, dir)
    const u = await changePassword('marie', 'defaut1', 'nouveau22', dir)
    expect(u.mustChangePassword).toBe(false)
    expect(await authenticate(dir, 'marie', 'defaut1')).toBeNull()
    expect((await authenticate(dir, 'marie', 'nouveau22'))?.mustChangePassword).toBe(false)
  })
  it('refuse mauvais mot de passe actuel, mot de passe court ou identique', async () => {
    await createUser({ name: 'Nom marie', username: 'marie', role: 'caissier', password: 'defaut1' }, dir)
    await rejects(changePassword('marie', 'faux', 'nouveau22', dir), 'wrong_password')
    await rejects(changePassword('marie', 'defaut1', '123', dir), 'invalid')
    await rejects(changePassword('marie', 'defaut1', 'defaut1', dir), 'invalid')
    expect((await findUser('marie', dir))?.mustChangePassword).toBe(true)
  })
})

describe('réinitialisation et suppression', () => {
  it('la réinitialisation remet un mot de passe par défaut à changer', async () => {
    await createUser({ name: 'Nom marie', username: 'marie', role: 'caissier', password: 'defaut1' }, dir)
    await changePassword('marie', 'defaut1', 'nouveau22', dir)
    const u = await resetPassword('marie', 'retour33', dir)
    expect(u.mustChangePassword).toBe(true)
    expect(await authenticate(dir, 'marie', 'nouveau22')).toBeNull()
    expect(await authenticate(dir, 'marie', 'retour33')).not.toBeNull()
    await rejects(resetPassword('inconnu', 'retour33', dir), 'not_found')
  })
  it('supprime un compte mais jamais le sien', async () => {
    await createUser({ name: 'Nom boss', username: 'boss', role: 'admin', password: 'defaut1' }, dir)
    await createUser({ name: 'Nom marie', username: 'marie', role: 'caissier', password: 'defaut1' }, dir)
    await rejects(deleteUser('boss', 'boss', dir), 'forbidden')
    await deleteUser('marie', 'boss', dir)
    expect((await listUsers(dir)).map(u => u.username)).toEqual(['boss'])
    await rejects(deleteUser('marie', 'boss', dir), 'not_found')
  })
})

describe('noms complets', () => {
  it('modifiables par l’admin, espaces normalisés, anciens comptes = identifiant', async () => {
    await createUser({ name: '  Grace   Mantekila ', username: 'grace', role: 'lecteur', password: 'defaut1' }, dir)
    expect((await findUser('grace', dir))?.name).toBe('Grace Mantekila')
    expect((await renameUser('grace', 'Grace M. Mantekila', dir)).name).toBe('Grace M. Mantekila')
    await rejects(renameUser('grace', '<b>', dir), 'invalid')
    await rejects(renameUser('inconnu', 'Jean', dir), 'not_found')
    const { saveUsers, readUsers } = await import('../server/lib/auth')
    const all = await readUsers(dir)
    all.push({ username: 'ancien', role: 'lecteur', passwordHash: 'x' })
    await saveUsers(dir, all)
    expect(await nameMap(dir)).toEqual({ grace: 'Grace M. Mantekila', ancien: 'ancien' })
  })
})
