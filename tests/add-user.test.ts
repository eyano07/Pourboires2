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
