/**
 * The chemistry core through the application's interface (26.64, D261, D275): the aqueous equilibrium against PHREEQC
 * on the same database (tests/fixtures/chem/aq.json, scripts/oracles/chem_aq.py), and the bench session — actions,
 * heat, rates, undo, replay — on the small catalogue of tests/fixtures/chem/catalog-mini.json. The fingerprint of a
 * fixed log is the one the native Rust build computes (engine/velophi-chem/tests/bench.rs reads the same fixture):
 * the WebAssembly build and the native build agree bit for bit.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Bench, chemEquilibrium, chemLogK, chemSpecies, setChemData } from '../../src/engine/chem'
import type { BenchDoc } from '../../src/engine/chem'
import { MessageError } from '../../src/i18n/message'

const root = join(__dirname, '..', '..')
const json = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'))

interface AqCase {
  id: string
  T: number
  amounts: Record<string, number>
  solids: string[]
  gas?: { volume_L: number; species: string[] }
  expect: { pH: number; I: number; water_kg: number; species: Record<string, number>; solids: Record<string, number>; gas: Record<string, number> }
}

beforeAll(() => {
  const counts = setChemData(json('src/chem/data/aqueous.json'), json('tests/fixtures/chem/catalog-mini.json'))
  expect(counts.diagnostics).toEqual([])
  expect(counts.components).toBeGreaterThan(60)
  expect(counts.reagents).toBe(19)
})

describe('aqueous equilibrium', () => {
  it('agrees with PHREEQC on the same database (pH to 1e-4, amounts to 1e-4 relative)', () => {
    const cases = json('tests/fixtures/chem/aq.json').cases as AqCase[]
    expect(cases.length).toBeGreaterThanOrEqual(200)
    let worst = { pH: 0, m: 0, s: 0, g: 0 }
    for (const c of cases) {
      const r = chemEquilibrium({ T: c.T, amounts: c.amounts, solids: c.solids, gas: c.gas })
      expect(r.ok, c.id).toBe(true)
      worst.pH = Math.max(worst.pH, Math.abs(r.pH - c.expect.pH))
      for (const [id, m] of Object.entries(c.expect.species)) if (m > 1e-12) worst.m = Math.max(worst.m, Math.abs((r.species.find(s => s.id === id)?.m ?? 0) - m) / m)
      for (const [id, n] of Object.entries(c.expect.solids)) worst.s = Math.max(worst.s, Math.abs((r.solids.find(s => s.id === id)?.n ?? 0) - n) / Math.max(Math.abs(n), 1e-4))
      for (const [id, n] of Object.entries(c.expect.gas)) worst.g = Math.max(worst.g, Math.abs((r.gas.find(s => s.id === id)?.n ?? 0) - n) / Math.max(Math.abs(n), 1e-6))
    }
    expect(worst.pH).toBeLessThan(1e-4)
    expect(worst.m).toBeLessThan(1e-4)
    expect(worst.s).toBeLessThan(1e-4)
    expect(worst.g).toBeLessThan(2e-4)
  })

  it('carries the constants of its sources unchanged', () => {
    // phreeqc.dat: CO2(g) = CO2(aq) log K −1.468; calcite log Ksp −8.48; water log Kw −14.00 at 25 °C
    const v = Object.fromEntries(chemLogK(['CO2(g)', 'CO2', 'Calcite', 'OH-', 'NH3(g)', 'NH3']).values.map(x => [x.id, x.logK]))
    expect(v['CO2(g)'] - v.CO2).toBeCloseTo(1.468, 3)
    expect(Math.abs(v.Calcite - 8.48)).toBeLessThan(0.05)
    expect(Math.abs(v['OH-'] + 14)).toBeLessThan(0.01)
    // Henry's constant of ammonia: about 59 mol/(kg·atm)
    expect(v.NH3 - v['NH3(g)']).toBeGreaterThan(1.6)
    expect(v.NH3 - v['NH3(g)']).toBeLessThan(1.9)
  })

  it('reports what it cannot solve instead of returning numbers', () => {
    const r = chemEquilibrium({ amounts: { 'Na+': 0.1, 'Cl-': 0.1 } })
    expect(r.ok).toBe(false)
    expect(r.diagnostics[0]).toMatchObject({ code: 'equil.noWater', severity: 'error' })
    expect(() => chemEquilibrium({ amounts: { Unobtainium: 1 } })).toThrow(MessageError)
    expect(chemSpecies({ ids: ['Cerargyrite'] }).species[0]).toMatchObject({ phase: 's', comp: { Ag: 1, Cl: 1 } })
  })
})

describe('bench session', () => {
  const fixture = json('tests/fixtures/chem/bench-hash.json') as { bench: BenchDoc; hash: string; pH: number }

  it('replays a fixed log to the fingerprint of the native build', () => {
    const b = Bench.create(fixture.bench)
    try {
      expect(b.hash()).toBe(fixture.hash)
      expect(b.read('flask').pH).toBeCloseTo(fixture.pH, 12)
      // The document comes back as it went in
      expect(b.document().log).toEqual(fixture.bench.log)
    } finally { b.free() }
  })

  it('titrates, precipitates, undoes and redoes', () => {
    const b = Bench.create({ format: 'velophi-bench', version: 1, objects: [{ id: 'flask', kind: 'erlenmeyer', capacity_mL: 250, x: 0.3, y: 0 }], log: [] })
    try {
      b.apply({ act: 'add', to: 'flask', reagent: 'HCl_0.1M', amount: { value: 20, unit: 'mL' } })
      const t0 = b.read('flask').T
      b.apply({ act: 'add', to: 'flask', reagent: 'NaOH_0.1M', amount: { value: 20, unit: 'mL' } })
      const neutral = b.read('flask')
      expect(neutral.pH).toBeCloseTo(7.0, 1)
      // 2.00 mmol × 55.8 kJ/mol into 40.0 g of water: 0.667 K
      expect(neutral.T - t0).toBeCloseTo(0.667, 1)
      expect(neutral.volume_mL).toBeCloseTo(40, 9)
      const before = b.hash()
      const { events } = b.apply({ act: 'add', to: 'flask', reagent: 'AgNO3_0.1M', amount: { value: 5, unit: 'mL' } })
      expect(events.find(e => e.code === 'precipitate')?.params.species).toBe('Cerargyrite')
      expect(b.state().canUndo).toBe(true)
      b.undo()
      expect(b.hash()).toBe(before)
      b.redo()
      expect(b.read('flask').solids.map(s => s.id)).toEqual(['Cerargyrite'])
      // Drawing fields are kept and are not chemistry
      expect(b.layout([{ id: 'flask', kind: 'ignored', x: 0.7 }])[0]).toMatchObject({ kind: 'erlenmeyer', x: 0.7, y: 0 })
    } finally { b.free() }
  })

  it('refuses what it does not know and leaves the bench as it was', () => {
    const b = Bench.create()
    try {
      b.apply({ act: 'place', object: { id: 'a', kind: 'beaker', capacity_mL: 100 } })
      const h = b.hash()
      expect(() => b.apply({ act: 'add', to: 'a', reagent: 'no_such_reagent', amount: { value: 1, unit: 'mL' } })).toThrow(MessageError)
      expect(() => b.apply({ act: 'add', to: 'nowhere', reagent: 'water', amount: { value: 1, unit: 'mL' } })).toThrow(MessageError)
      expect(() => b.apply({ act: 'add', to: 'a', reagent: 'water', amount: { value: 1, unit: 'mol' } })).toThrow(MessageError)
      expect(b.hash()).toBe(h)
      expect(b.state().log).toBe(1)
    } finally { b.free() }
  })
})
