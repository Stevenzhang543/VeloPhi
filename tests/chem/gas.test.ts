/**
 * Gas equilibrium on the build under test (26.64, D264/D275): the reference cases of tests/fixtures/chem/gas.json
 * (Cantera on the same polynomials; the NO2 dimer in closed form — scripts/oracles/chem_gas.py) through the same
 * entry the interface uses. The native core runs the same file in engine/velophi-chem/tests/gas_reference.rs.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gasEquilibrium, gasReaction, gasThermo, setGasData } from '../../src/engine/chem'
import type { GasRequest } from '../../src/engine/chem'

const root = join(__dirname, '..', '..')
const json = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'))
const reference = json('tests/fixtures/chem/gas.json') as {
  cases: Array<{ id: string; mode: string; request: GasRequest; expect: { T: number; P_atm: number; n: number; x: Record<string, number>; H: number; S: number } }>
  reactions: Array<{ id: string; species: Record<string, number>; T: number; dH: number; dS: number; dG: number; lnK: number }>
}

beforeAll(() => { expect(setGasData(json('src/chem/data/gas.json')).species).toBeGreaterThanOrEqual(40) })

describe('gas equilibrium', () => {
  it('agrees with the reference on every case', () => {
    expect(reference.cases.length).toBeGreaterThanOrEqual(40)
    let worstT = 0
    for (const c of reference.cases) {
      const got = gasEquilibrium(c.request)
      expect(got.ok, c.id).toBe(true)
      worstT = Math.max(worstT, Math.abs(got.T - c.expect.T))
      expect(Math.abs(got.n / c.expect.n - 1), c.id).toBeLessThan(2e-6)
      const mine = Object.fromEntries(got.species.map(s => [s.id, s.x]))
      for (const [id, x] of Object.entries(c.expect.x)) {
        const d = x > 1e-6 ? Math.abs((mine[id] ?? 0) / x - 1) : Math.abs((mine[id] ?? 0) - x) / 1e-6
        expect(d, `${c.id} / ${id}`).toBeLessThan(1e-5)
      }
    }
    // The manual asks for 1 K; the two programs agree far closer
    expect(worstT).toBeLessThan(0.01)
  })

  it('gives the textbook flame temperatures', () => {
    const flame = (amounts: Record<string, number>) => gasEquilibrium({ amounts, T: 298.15, adiabatic: true }).T
    expect(flame({ 'CH4(g)': 1, 'O2(g)': 2, 'N2(g)': 7.52 })).toBeGreaterThan(2200)
    expect(flame({ 'CH4(g)': 1, 'O2(g)': 2, 'N2(g)': 7.52 })).toBeLessThan(2250)
    expect(flame({ 'H2(g)': 2, 'O2(g)': 1 })).toBeGreaterThan(3050)
    expect(flame({ 'C2H2(g)': 1, 'O2(g)': 2.5 })).toBeGreaterThan(3300)
  })

  it('reaction quantities and standard values', () => {
    for (const r of reference.reactions) {
      const got = gasReaction(r.species, r.T)
      expect(got.balanced, r.id).toBe(true)
      for (const k of ['dH', 'dS', 'dG', 'lnK'] as const) expect(Math.abs(got[k] - r[k]), `${r.id} ${k}`).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(r[k])))
    }
    const [water, oxygen] = gasThermo(['H2O(g)', 'O2(g)']).values
    expect(water.h).toBeCloseTo(-241826, -2)
    expect(Math.abs(oxygen.h)).toBeLessThan(1)
    expect(oxygen.s).toBeCloseTo(205.15, 1)
  })

  it('says what it cannot do', () => {
    const cold = gasEquilibrium({ amounts: { 'H2(g)': 2, 'O2(g)': 1 }, T: 320 })
    expect(cold.diagnostics.map(d => d.code)).toContain('gas.wouldCondense')
    const high = gasEquilibrium({ amounts: { 'N2(g)': 1, 'H2(g)': 3 }, T: 700, pressure_atm: 200 })
    expect(high.diagnostics.map(d => d.code)).toContain('gas.highPressure')
    expect(() => gasEquilibrium({ amounts: { nonsense: 1 } })).toThrow()
    expect(() => gasEquilibrium({ amounts: {} })).toThrow()
  })
})
