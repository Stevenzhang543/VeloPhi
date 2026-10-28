/**
 * Units of 26.56 (D99): seven SI base dimensions in the Rust core and the interface, absolute temperature with the
 * affine °C display, temperature differences without offset, unit choices that survive saving and loading, and
 * numbers that do not depend on the interface language.
 */
import { describe, expect, it } from 'vitest'
import { UNITS, dimFull, BASE_DIMS } from '../src/formula/units'
import { coreUnits } from '../src/engine/models'
import { formatQuantityKind, fromDisplayKind, toDisplayKind, presetChoice, optionFor, numberStyle, readableSig } from '../src/units/units'
import { evalModel } from '../src/engine/models'

describe('units2656 Celsius affine', () => {
  const si = presetChoice('si')
  it('an absolute temperature shows in °C with the offset, a difference without it', () => {
    expect(optionFor('K', si)?.id).toBe('°C')
    expect(toDisplayKind(293.15, 'K', 'temperature', si)).toBeCloseTo(20, 12)
    expect(fromDisplayKind(20, 'K', 'temperature', si)).toBeCloseTo(293.15, 12)
    expect(toDisplayKind(10, 'K', 'temperatureDifference', si)).toBe(10)
    expect(fromDisplayKind(-40, 'K', 'temperature', si)).toBeCloseTo(233.15, 12)
    // the registry agrees: G06 turns 293.15 K into 20 °C and keeps a 10 K difference
    const r = evalModel('G06', { T1: 293.15, dT: 10, m: 2, a: 3, v: 4 })
    expect(r.outputs.find(o => o.id === 'tC')!.value).toBeCloseTo(20, 12)
    expect(r.outputs.find(o => o.id === 'dTK')!.value).toBe(10)
  })
})

describe('units2656 display conversions', () => {
  it('every unit of the interface table round-trips through its display option', () => {
    const si = presetChoice('si')
    for (const u of Object.keys(UNITS)) {
      for (const v of [0.1234, 300, -2]) {
        const d = toDisplayKind(v, u, undefined, si)
        expect(fromDisplayKind(d, u, undefined, si), u).toBeCloseTo(v, 9)
      }
    }
  })
})

describe('units2656 save-load-language', () => {
  it('a unit choice survives JSON, and the numbers do not depend on the language (only the decimal mark)', () => {
    const c = presetChoice('si')
    const back = JSON.parse(JSON.stringify(c))
    expect(back).toEqual(c)
    const was = numberStyle.decimal
    numberStyle.decimal = '.'
    const a = formatQuantityKind(293.15, 'K', 'temperature', back, 6)
    numberStyle.decimal = ','
    const b = formatQuantityKind(293.15, 'K', 'temperature', back, 6)
    numberStyle.decimal = was
    expect(a.replace('.', ',')).toBe(b)
    expect(a).toBe('20 °C')
  })
})

describe('dims2656 seven dimensions', () => {
  it('both tables use L M T I Θ N J and agree unit by unit', () => {
    expect(BASE_DIMS).toBe(7)
    const core = coreUnits()
    expect(core.map(u => u.unit)).toEqual(Object.keys(UNITS))
    for (const u of core) expect(dimFull(UNITS[u.unit])).toEqual(u.dim)
    expect(dimFull(UNITS.K)).toEqual([0, 0, 0, 0, 1, 0, 0])
    expect(dimFull(UNITS.mol)).toEqual([0, 0, 0, 0, 0, 1, 0])
    expect(dimFull(UNITS.cd)).toEqual([0, 0, 0, 0, 0, 0, 1])
    expect(dimFull(UNITS.V)).toEqual([2, 1, -3, -1, 0, 0, 0])
  })
})

describe('units2656 readable powers of ten', () => {
  it('model pages and activities show 10⁻⁴ and 4.7×10⁻⁵ instead of 1e-4 and 4.7e-5', () => {
    expect(readableSig(1e-4, 4)).toBe('10⁻⁴')
    expect(readableSig(4.7e-5, 4)).toBe('4.7×10⁻⁵')
    expect(readableSig(-2.5e7, 3)).toBe('−2.5×10⁷')
    expect(readableSig(0.025, 4)).toBe('0.025')
    expect(readableSig(null, 4)).toBe('—')
  })
})
