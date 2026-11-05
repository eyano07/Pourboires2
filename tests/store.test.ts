import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { addTip, readTips, removeTip, todayStr, totalOf, validateAmount } from '../server/lib/store'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'biso-')) })

const day1 = new Date('2026-11-05T10:00:00Z')
const day2 = new Date('2026-11-06T10:00:00Z')

describe('todayStr', () => {
  it('utilise le fuseau Africa/Kinshasa (UTC+1)', () => {
    expect(todayStr(new Date('2026-11-05T23:30:00Z'))).toBe('2026-11-06')
    expect(todayStr(new Date('2026-11-05T22:30:00Z'))).toBe('2026-11-05')
  })
})

describe('validateAmount', () => {
  it('accepte nombres et chaînes (virgule ou point)', () => {
    expect(validateAmount(100)).toBe(100)
    expect(validateAmount('12,5')).toBe(12.5)
    expect(validateAmount('0.1')).toBe(0.1)
  })
  it('arrondit au centime', () => { expect(validateAmount(10.005)).toBe(10.01) })
  it('refuse les valeurs invalides', () => {
    for (const v of [0, -5, 'abc', '', null, undefined, NaN, Infinity, 100001, {}]) {
      expect(validateAmount(v)).toBeNull()
    }
  })
})

describe('store', () => {
  it('crée le fichier du jour vide', async () => {
    const d = await readTips(dir, day1)
    expect(d).toEqual({ date: '2026-11-05', entries: [] })
    expect(JSON.parse(readFileSync(join(dir, 'tips.json'), 'utf8')).date).toBe('2026-11-05')
  })
  it('ajoute des pourboires avec le nom d’utilisateur et calcule le total sans erreur flottante', async () => {
    await addTip('alice', 0.1, dir, day1)
    await addTip('alice', 0.2, dir, day1)
    await addTip('bob', 100, dir, day1)
    const d = await readTips(dir, day1)
    expect(d.entries.map(e => e.username)).toEqual(['alice', 'alice', 'bob'])
    expect(totalOf(d.entries)).toBe(100.3)
  })
  it('supprime l’historique au changement de jour', async () => {
    await addTip('alice', 100, dir, day1)
    const d = await readTips(dir, day2)
    expect(d).toEqual({ date: '2026-11-06', entries: [] })
    expect(JSON.parse(readFileSync(join(dir, 'tips.json'), 'utf8')).entries).toEqual([])
  })
  it('ajouter un pourboire après minuit repart de zéro', async () => {
    await addTip('alice', 100, dir, day1)
    await addTip('alice', 200, dir, day2)
    const d = await readTips(dir, day2)
    expect(totalOf(d.entries)).toBe(200)
  })
  it('supprime sa propre saisie, refuse celle d’un autre', async () => {
    const e = await addTip('alice', 50, dir, day1)
    expect(await removeTip(e.id, 'bob', dir, day1)).toBe('forbidden')
    expect(await removeTip('inconnu', 'alice', dir, day1)).toBe('not_found')
    expect(await removeTip(e.id, 'alice', dir, day1)).toBe('ok')
    expect((await readTips(dir, day1)).entries).toHaveLength(0)
  })
  it('le fichier du jour ne garde que l’utilisateur et le montant (plus un id technique)', async () => {
    await addTip('alice', 100, dir, day1)
    const raw = JSON.parse(readFileSync(join(dir, 'tips.json'), 'utf8'))
    expect(Object.keys(raw)).toEqual(['date', 'entries'])
    expect(Object.keys(raw.entries[0]).sort()).toEqual(['amount', 'id', 'username'])
  })
  it('nettoie les anciens champs (ex. time) d’un fichier existant', async () => {
    writeFileSync(join(dir, 'tips.json'), JSON.stringify({
      date: '2026-11-05', entries: [{ id: 'a', username: 'alice', amount: 5, time: '2026-11-05T09:00:00Z', extra: 1 }],
    }))
    const d = await readTips(dir, day1)
    expect(d.entries).toEqual([{ id: 'a', username: 'alice', amount: 5 }])
  })
  it('se remet d’un fichier corrompu', async () => {
    writeFileSync(join(dir, 'tips.json'), '{pas du json')
    expect((await readTips(dir, day1)).entries).toEqual([])
  })
  it('supporte des ajouts simultanés sans perte', async () => {
    await Promise.all(Array.from({ length: 25 }, (_, i) => addTip('alice', i + 1, dir, day1)))
    const d = await readTips(dir, day1)
    expect(d.entries).toHaveLength(25)
    expect(totalOf(d.entries)).toBe(325)
  })
})
