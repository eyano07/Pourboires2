import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { addTip, closeTips, readTips, removeTip, setShareWith, splitEqually, todayStr, totalOf, validateAmount } from '../server/lib/store'

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
    expect(d).toEqual({ date: '2026-11-05', entries: [], shareWith: [], closes: [] })
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
    expect(d).toEqual({ date: '2026-11-06', entries: [], shareWith: [], closes: [] })
    expect(JSON.parse(readFileSync(join(dir, 'tips.json'), 'utf8')).entries).toEqual([])
  })
  it('ajouter un pourboire après minuit repart de zéro', async () => {
    await addTip('alice', 100, dir, day1)
    await addTip('alice', 200, dir, day2)
    const d = await readTips(dir, day2)
    expect(totalOf(d.entries)).toBe(200)
  })
  it('supprime sa propre saisie, refuse celle d’un autre', async () => {
    const e = await addTip('alice', 50, dir, day1) as { id: string }
    expect(await removeTip(e.id, 'bob', dir, day1)).toBe('forbidden')
    expect(await removeTip('inconnu', 'alice', dir, day1)).toBe('not_found')
    expect(await removeTip(e.id, 'alice', dir, day1)).toBe('ok')
    expect((await readTips(dir, day1)).entries).toHaveLength(0)
  })
  it('le fichier du jour ne garde que l’utilisateur et le montant (plus un id technique)', async () => {
    await addTip('alice', 100, dir, day1)
    const raw = JSON.parse(readFileSync(join(dir, 'tips.json'), 'utf8'))
    expect(Object.keys(raw)).toEqual(['date', 'entries', 'shareWith', 'closes'])
    expect(Object.keys(raw.entries[0]).sort()).toEqual(['amount', 'id', 'username'])
  })
  it('nettoie les anciens champs (ex. time) d’un fichier existant', async () => {
    writeFileSync(join(dir, 'tips.json'), JSON.stringify({
      date: '2026-11-05', entries: [{ id: 'a', username: 'alice', amount: 5, time: '2026-11-05T09:00:00Z', extra: 1 }],
    }))
    const d = await readTips(dir, day1)
    expect(d.entries).toEqual([{ id: 'a', username: 'alice', amount: 5 }])
  })
  it('tips.json a des droits privés (600)', async () => {
    await addTip('alice', 1, dir, day1)
    expect(statSync(join(dir, 'tips.json')).mode & 0o777).toBe(0o600)
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

describe('partage et vidage', () => {
  it('partage à parts égales au centime près, sans perdre de centime', () => {
    expect(splitEqually(10, ['c', 'a', 'b'])).toEqual([
      { username: 'a', amount: 3.34 }, { username: 'b', amount: 3.33 }, { username: 'c', amount: 3.33 },
    ])
    expect(splitEqually(125.5, ['x', 'y'])).toEqual([{ username: 'x', amount: 62.75 }, { username: 'y', amount: 62.75 }])
    expect(splitEqually(0.01, ['a', 'b'])).toEqual([{ username: 'a', amount: 0.01 }, { username: 'b', amount: 0 }])
    expect(splitEqually(50, [])).toEqual([])
    for (const n of [1, 3, 7, 13]) {
      const parts = splitEqually(1000.07, Array.from({ length: n }, (_, i) => `u${i}`))
      expect(Math.round(parts.reduce((t, p) => t + p.amount * 100, 0))).toBe(100007)
    }
  })
  it('journée type : service du matin, service du soir, puis journée clôturée', async () => {
    // Matin
    await setShareWith(['bob', 'alice', 'alice'], dir, day1)
    await addTip('caisse1', 100, dir, day1)
    await addTip('caisse1', 50.5, dir, day1)
    const m = await closeTips('caisse1', ['alice', 'bob', 'zoe'], dir, day1)
    expect(m).toEqual({ shift: 'Matin', total: 150.5, by: 'caisse1', shares: [{ username: 'alice', amount: 75.25 }, { username: 'bob', amount: 75.25 }] })
    let d = await readTips(dir, day1)
    expect(totalOf(d.entries)).toBe(0)
    expect(d.shareWith).toEqual([]) // le caissier du soir choisit ses personnes
    // Soir
    await setShareWith(['zoe'], dir, day1)
    await addTip('caisse2', 30, dir, day1)
    const s = await closeTips('caisse2', ['alice', 'bob', 'zoe'], dir, day1)
    expect(s).toMatchObject({ shift: 'Soir', total: 30, shares: [{ username: 'zoe', amount: 30 }] })
    d = await readTips(dir, day1)
    expect(d.closes.map(c => c.shift)).toEqual(['Matin', 'Soir'])
    // Clôturée : plus de saisie, de sélection ni de vidage
    expect(await addTip('caisse2', 5, dir, day1)).toBe('day_closed')
    expect(await setShareWith(['zoe'], dir, day1)).toBe('day_closed')
    expect(await closeTips('caisse2', ['zoe'], dir, day1)).toBe('day_closed')
    // Lendemain : tout recommence
    expect(await readTips(dir, day2)).toEqual({ date: '2026-11-06', entries: [], shareWith: [], closes: [] })
    expect(await addTip('caisse1', 5, dir, day2)).toMatchObject({ amount: 5 })
  })
  it('reprend un ancien fichier (lastClose)', async () => {
    writeFileSync(join(dir, 'tips.json'), JSON.stringify({ date: '2026-11-05', entries: [], shareWith: [], lastClose: { total: 5, shares: [{ username: 'a', amount: 5 }], by: 'c' } }))
    expect((await readTips(dir, day1)).closes).toEqual([{ shift: 'Matin', total: 5, shares: [{ username: 'a', amount: 5 }], by: 'c' }])
  })
  it('refuse de vider une caisse vide ou sans personne cochée', async () => {
    expect(await closeTips('caisse', ['alice'], dir, day1)).toBe('empty')
    await addTip('caisse', 10, dir, day1)
    expect(await closeTips('caisse', ['alice'], dir, day1)).toBe('no_selection')
    await setShareWith(['ancien'], dir, day1) // compte supprimé depuis
    expect(await closeTips('caisse', ['alice'], dir, day1)).toBe('no_selection')
    expect(totalOf((await readTips(dir, day1)).entries)).toBe(10)
  })
  it('le changement de jour efface aussi la sélection et le dernier partage', async () => {
    await addTip('caisse', 10, dir, day1)
    await setShareWith(['alice'], dir, day1)
    await closeTips('caisse', ['alice'], dir, day1)
    await setShareWith(['alice'], dir, day1)
    expect(await readTips(dir, day2)).toEqual({ date: '2026-11-06', entries: [], shareWith: [], closes: [] })
  })
})
