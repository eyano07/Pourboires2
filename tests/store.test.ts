import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  addTip, closeTips, readEarnings, readTips, removeTip, setShareWith, splitEqually, todayStr, totalsOf,
  validateAmount, validateCurrency,
} from '../server/lib/store'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'biso-')) })

const day1 = new Date('2026-11-05T10:00:00Z')
const day2 = new Date('2026-11-06T10:00:00Z')
const EMPTY = (date: string) => ({ date, entries: [], shareWith: [], closes: [] })
const T = (USD: number, CDF: number) => ({ USD, CDF })

describe('todayStr', () => {
  it('utilise le fuseau Africa/Kinshasa (UTC+1)', () => {
    expect(todayStr(new Date('2026-11-05T23:30:00Z'))).toBe('2026-11-06')
    expect(todayStr(new Date('2026-11-05T22:30:00Z'))).toBe('2026-11-05')
  })
})

describe('montants et devises', () => {
  it('USD : centimes, virgule ou point', () => {
    expect(validateAmount(100, 'USD')).toBe(100)
    expect(validateAmount('12,5', 'USD')).toBe(12.5)
    expect(validateAmount(10.005, 'USD')).toBe(10.01)
  })
  it('FC : francs entiers, espaces acceptés', () => {
    expect(validateAmount('15 000', 'CDF')).toBe(15000)
    expect(validateAmount(2500.4, 'CDF')).toBe(2500)
    expect(validateAmount(300_000_001, 'CDF')).toBeNull()
  })
  it('refuse les valeurs invalides', () => {
    for (const v of [0, -5, 'abc', '', null, undefined, NaN, Infinity, 100001, {}]) expect(validateAmount(v, 'USD')).toBeNull()
    expect(validateAmount(0.4, 'CDF')).toBeNull()
  })
  it('devise : USD, CDF ou FC', () => {
    expect(validateCurrency('usd')).toBe('USD')
    expect(validateCurrency('FC')).toBe('CDF')
    expect(validateCurrency('CDF')).toBe('CDF')
    expect(validateCurrency('EUR')).toBeNull()
  })
})

describe('caisse', () => {
  it('crée le fichier du jour vide', async () => {
    expect(await readTips(dir, day1)).toEqual(EMPTY('2026-11-05'))
  })
  it('totaux séparés par devise, sans erreur flottante', async () => {
    await addTip('alice', 0.1, 'USD', dir, day1)
    await addTip('alice', 0.2, 'USD', dir, day1)
    await addTip('bob', 5000, 'CDF', dir, day1)
    await addTip('bob', 2500, 'CDF', dir, day1)
    const d = await readTips(dir, day1)
    expect(totalsOf(d.entries)).toEqual(T(0.3, 7500))
    expect(d.entries.map(e => e.currency)).toEqual(['USD', 'USD', 'CDF', 'CDF'])
  })
  it('le fichier ne garde que utilisateur, montant, devise (+ id)', async () => {
    await addTip('alice', 100, 'CDF', dir, day1)
    const raw = JSON.parse(readFileSync(join(dir, 'tips.json'), 'utf8'))
    expect(Object.keys(raw)).toEqual(['date', 'entries', 'shareWith', 'closes'])
    expect(Object.keys(raw.entries[0]).sort()).toEqual(['amount', 'currency', 'id', 'username'])
    expect(statSync(join(dir, 'tips.json')).mode & 0o777).toBe(0o600)
  })
  it('anciens fichiers : saisies sans devise = USD, ancien partage converti', async () => {
    writeFileSync(join(dir, 'tips.json'), JSON.stringify({
      date: '2026-11-05', entries: [{ id: 'a', username: 'alice', amount: 5, time: 'x' }], shareWith: [],
      lastClose: { total: 5, shares: [{ username: 'a', amount: 5 }], by: 'c' },
    }))
    const d = await readTips(dir, day1)
    expect(d.entries).toEqual([{ id: 'a', username: 'alice', amount: 5, currency: 'USD' }])
    expect(d.closes).toEqual([{ shift: 'Matin', by: 'c', totals: T(5, 0), shares: [{ username: 'a', amounts: T(5, 0) }] }])
  })
  it('supprime l’historique au changement de jour', async () => {
    await addTip('alice', 100, 'USD', dir, day1)
    expect(await readTips(dir, day2)).toEqual(EMPTY('2026-11-06'))
  })
  it('supprime une saisie (contrôle des droits fait par la route)', async () => {
    const e = await addTip('alice', 50, 'USD', dir, day1) as { id: string }
    expect(await removeTip('inconnu', dir, day1)).toBe('not_found')
    expect(await removeTip(e.id, dir, day1)).toBe('ok')
    expect((await readTips(dir, day1)).entries).toEqual([])
  })
  it('se remet d’un fichier corrompu', async () => {
    writeFileSync(join(dir, 'tips.json'), '{pas du json')
    expect((await readTips(dir, day1)).entries).toEqual([])
  })
  it('ajouts simultanés sans perte', async () => {
    await Promise.all(Array.from({ length: 25 }, (_, i) => addTip('alice', i + 1, i % 2 ? 'CDF' : 'USD', dir, day1)))
    expect(totalsOf((await readTips(dir, day1)).entries)).toEqual(T(169, 156))
  })
})

describe('partage', () => {
  it('parts égales par devise, sans perdre d’unité', () => {
    expect(splitEqually(T(10, 1000), ['c', 'a', 'b'])).toEqual([
      { username: 'a', amounts: T(3.34, 334) }, { username: 'b', amounts: T(3.33, 333) }, { username: 'c', amounts: T(3.33, 333) },
    ])
    for (const n of [1, 3, 7, 13]) {
      const parts = splitEqually(T(1000.07, 123457), Array.from({ length: n }, (_, i) => `u${i}`))
      expect(Math.round(parts.reduce((t, p) => t + p.amounts.USD * 100, 0))).toBe(100007)
      expect(parts.reduce((t, p) => t + p.amounts.CDF, 0)).toBe(123457)
    }
  })
  it('journée type : matin, soir, puis journée clôturée', async () => {
    await setShareWith(['bob', 'alice', 'alice'], dir, day1)
    await addTip('caisse1', 100, 'USD', dir, day1)
    await addTip('caisse1', 20000, 'CDF', dir, day1)
    const m = await closeTips('caisse1', ['alice', 'bob', 'zoe'], dir, day1)
    expect(m).toEqual({ shift: 'Matin', by: 'caisse1', totals: T(100, 20000), shares: [
      { username: 'alice', amounts: T(50, 10000) }, { username: 'bob', amounts: T(50, 10000) },
    ] })
    let d = await readTips(dir, day1)
    expect(totalsOf(d.entries)).toEqual(T(0, 0))
    expect(d.shareWith).toEqual([])
    await setShareWith(['zoe'], dir, day1)
    await addTip('caisse2', 7000, 'CDF', dir, day1)
    expect(await closeTips('caisse2', ['alice', 'bob', 'zoe'], dir, day1)).toMatchObject({ shift: 'Soir', totals: T(0, 7000) })
    d = await readTips(dir, day1)
    expect(d.closes.map(c => c.shift)).toEqual(['Matin', 'Soir'])
    expect(await addTip('caisse2', 5, 'USD', dir, day1)).toBe('day_closed')
    expect(await setShareWith(['zoe'], dir, day1)).toBe('day_closed')
    expect(await closeTips('caisse2', ['zoe'], dir, day1)).toBe('day_closed')
    expect(await readTips(dir, day2)).toEqual(EMPTY('2026-11-06'))
  })
  it('caisse vide (dans les deux devises) ou personne cochée : refus', async () => {
    expect(await closeTips('caisse', ['alice'], dir, day1)).toBe('empty')
    await addTip('caisse', 500, 'CDF', dir, day1)
    expect(await closeTips('caisse', ['alice'], dir, day1)).toBe('no_selection')
    await setShareWith(['ancien'], dir, day1)
    expect(await closeTips('caisse', ['alice'], dir, day1)).toBe('no_selection')
  })
})

describe('dernier gain de l’agent', () => {
  it('reste affiché (même le lendemain) jusqu’à ce que l’agent soit resélectionné', async () => {
    await setShareWith(['alice', 'bob'], dir, day1)
    await addTip('caisse', 10, 'USD', dir, day1)
    await closeTips('caisse', ['alice', 'bob'], dir, day1)
    let e = await readEarnings(dir)
    expect(e.alice).toEqual({ shift: 'Matin', date: '2026-11-05', amounts: T(5, 0), people: 2 })
    // Le lendemain, le gain est toujours là
    await readTips(dir, day2)
    expect((await readEarnings(dir)).bob.amounts).toEqual(T(5, 0))
    // Alice est resélectionnée : son gain disparaît, celui de bob reste
    await setShareWith(['alice'], dir, day2)
    e = await readEarnings(dir)
    expect(e.alice).toBeUndefined()
    expect(e.bob).toBeDefined()
    // Nouveau vidage : nouveau gain (remplace l'ancien)
    await addTip('caisse', 3000, 'CDF', dir, day2)
    await closeTips('caisse', ['alice', 'bob'], dir, day2)
    expect((await readEarnings(dir)).alice).toEqual({ shift: 'Matin', date: '2026-11-06', amounts: T(0, 3000), people: 1 })
    expect(statSync(join(dir, 'earnings.json')).mode & 0o777).toBe(0o600)
  })
})
