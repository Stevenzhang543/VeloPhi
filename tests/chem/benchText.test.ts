/**
 * The bench in words and numbers (26.64, D247, D268; src/chem/benchText.ts, format.ts, catalog.ts): the log as
 * readable lines in three languages with the catalogue's names, the one formatter of quantities (real minus, narrow
 * space, the resolution asked for), formulas typeset from species ids, and the particle shares of the micro view.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { locale } from '../../src/i18n/locale'
import type { BenchAction } from '../../src/engine/chem'
import { setCatalogue, prettyFormula, reagentText, speciesName, unitsFor, reagentOf } from '../../src/chem/catalog'
import type { Catalogue } from '../../src/chem/catalog'
import { diagnosticText, equationText, groupedLog, logLine, markLabel } from '../../src/chem/benchText'
import { NNBSP, fixed, fmtAmount, fmtAmountOf, fmtConc, fmtDuration, fmtMass, fmtPH, fmtPressure, fmtTemp, fmtVolume, qty } from '../../src/chem/format'
import { numberStyle } from '../../src/units/units'
import { particleShares } from '../../src/render/chem/particles'

const root = join(__dirname, '..', '..')
beforeAll(() => { setCatalogue(JSON.parse(readFileSync(join(root, 'src/chem/data/catalog.json'), 'utf8')) as Catalogue) })
afterEach(() => { locale.lang = 'zh'; numberStyle.decimal = '.' })

const names: Record<string, string> = { f: '锥形瓶 A', b: '碱式滴定管 B', k: '烧杯 C' }
const ctx = { name: (id: string) => names[id] ?? id, kind: (id: string) => (id === 'b' ? 'buretteBase' : id === 'f' ? 'erlenmeyer' : 'beaker') }
const S = NNBSP

describe('log lines', () => {
  const add: BenchAction = { act: 'add', to: 'f', reagent: 'HCl_1M', amount: { value: 20, unit: 'mL' } }
  const deliver: BenchAction = { act: 'pour', from: 'b', to: 'f', amount: { value: 12.35, unit: 'mL' } }

  it('reads like a lab record in Chinese, with the catalogue’s names', () => {
    expect(logLine(add, ctx)).toBe(`取 20.00${S}mL 1 mol/L 盐酸到锥形瓶 A`)
    expect(logLine(deliver, ctx)).toBe(`碱式滴定管 B向锥形瓶 A滴加 12.35${S}mL`)
    expect(logLine({ act: 'pour', from: 'k', to: 'f' }, ctx)).toBe('把烧杯 C全部倒入锥形瓶 A')
    expect(logLine({ act: 'pour', from: 'k', to: 'f', amount: { value: 5, unit: 'mL' } }, ctx)).toBe(`从烧杯 C向锥形瓶 A倒入 5.00${S}mL`)
    expect(logLine({ act: 'add', to: 'f', reagent: 'phenolphthalein', amount: { value: 2, unit: 'drop' } }, ctx)).toMatch(/^取 2 滴 .*酚酞.*到锥形瓶 A$/)
    expect(logLine({ act: 'wait', seconds: 0.5, times: 120 }, ctx)).toBe(`等待 60${S}s`)
    expect(logLine({ act: 'heat', vessel: 'k', power: 150 }, ctx)).toBe(`加热烧杯 C（150${S}W）`)
    expect(logLine({ act: 'heat', vessel: 'k', power: 0 }, ctx)).toBe('停止加热烧杯 C')
    expect(logLine({ act: 'stopper', vessel: 'f', on: true }, ctx)).toBe('塞上锥形瓶 A')
    expect(logLine({ act: 'connect', from: 'f', to: 'k' }, ctx)).toBe('用导管连接锥形瓶 A与烧杯 C')
    expect(logLine({ act: 'collector', vessel: 'k', mode: 'water' }, ctx)).toBe('烧杯 C改为排水集气')
    expect(logLine({ act: 'ambient', T: 303.15 }, ctx)).toBe(`室内条件：30.0${S}°C`)
    expect(logLine({ act: 'circuitSet', id: 'c1', on: false }, ctx)).toBe('电路 c1：断开开关')
  })

  it('reads in English and German too, with no Chinese left', () => {
    const all: BenchAction[] = [add, deliver, { act: 'place', object: { id: 'k', kind: 'beaker', capacity_mL: 250 } }, { act: 'remove', id: 'k' }, { act: 'pour', from: 'k', to: 'f' }, { act: 'filter', from: 'k', to: 'f' }, { act: 'empty', vessel: 'k' },
      { act: 'heat', vessel: 'k', power: 150 }, { act: 'heat', vessel: 'k', power: 0 }, { act: 'bath', vessel: 'k', T: 273.15 }, { act: 'bath', vessel: 'k', T: null }, { act: 'stopper', vessel: 'f', on: true }, { act: 'stopper', vessel: 'f', on: false },
      { act: 'connect', from: 'f', to: 'k' }, { act: 'disconnect', from: 'f' }, { act: 'collector', vessel: 'k', mode: 'water' }, { act: 'collector', vessel: 'k', mode: 'up' }, { act: 'collector', vessel: 'k', mode: 'down' }, { act: 'collector', vessel: 'k', mode: 'none' },
      { act: 'ignite', vessel: 'k', on: true }, { act: 'ignite', vessel: 'k', on: false }, { act: 'light', vessel: 'k' }, { act: 'light', vessel: 'k', on: false }, { act: 'ambient', T: 300, P: 1 }, { act: 'wait', seconds: 0.5, times: 7 },
      { act: 'circuit', id: 'c1', a: { vessel: 'k', electrode: 'Zn(s)' }, b: { vessel: 'k', electrode: 'Cu(s)' } }, { act: 'circuitSet', id: 'c1', load: 100, source: 6, bridge: true, on: true }, { act: 'circuitSet', id: 'c1', source: 0, bridge: false }, { act: 'circuitRemove', id: 'c1' }]
    const plain = { name: (id: string) => `V-${id}`, kind: ctx.kind }
    for (const lang of ['en', 'de'] as const) {
      locale.lang = lang
      for (const e of all) { const line = logLine(e, plain); expect(line.length, JSON.stringify(e)).toBeGreaterThan(3); expect(/[一-鿿]/.test(line), `${lang}: ${line}`).toBe(false) }
    }
    locale.lang = 'en'
    expect(logLine(add, plain)).toBe(`Add 20.00${S}mL of 1 mol/L hydrochloric acid to V-f`)
    expect(logLine(deliver, plain)).toBe(`V-b delivers 12.35${S}mL into V-f`)
    locale.lang = 'de'
    expect(logLine(add, plain)).toBe(`20.00${S}mL 1 mol/L Salzsäure in V-f geben`)
    expect(logLine(deliver, plain)).toBe(`Aus V-b 12.35${S}mL in V-f tropfen`)
  })

  it('folds a pour by hand into one line with a count, and keeps waits apart', () => {
    const one: BenchAction = { act: 'add', to: 'f', reagent: 'water', amount: { value: 1, unit: 'mL' } }
    const g = groupedLog([one, one, one, { act: 'wait', seconds: 0.5, times: 4 }, one])
    expect(g.map(x => [x.entry.act, x.count, x.wait])).toEqual([['add', 3, false], ['wait', 1, true], ['add', 1, false]])
  })

  it('names diagnostics and writes balanced equations with the catalogue’s formulas', () => {
    expect(markLabel('unmodelled')).toBe('未建模')
    expect(markLabel('approx')).toBe('近似')
    expect(diagnosticText({ code: 'thermal.unknownEnthalpy', severity: 'approx', params: { species: ['Zn+2'] } })).toContain(speciesName('Zn+2'))
    expect(diagnosticText({ code: 'equil.concentrated', severity: 'approx', params: { I: 1.234 } })).toContain(`1.2${S}mol/kg`)
    expect(diagnosticText({ code: 'redox.unmodelled', severity: 'unmodelled', params: { oxidant: 'Fe+3', reductant: 'Zn(s)', volts: 1.5 } })).toMatch(/只是共存/)
    expect(equationText(['Zn(s)', 'H+'], ['Zn+2', 'H2'], [1, 2, 1, 1])).toBe('Zn + 2 H⁺ → Zn²⁺ + H₂')
  })
})

describe('names and formulas', () => {
  it('typesets a formula from a species id when the catalogue has none', () => {
    expect(prettyFormula('Zn+2')).toBe('Zn²⁺')
    expect(prettyFormula('CO3-2')).toBe('CO₃²⁻')
    expect(prettyFormula('Cl-')).toBe('Cl⁻')
    expect(prettyFormula('H2(g)')).toBe('H₂')
    expect(prettyFormula('Cu(OH)2(s)')).toBe('Cu(OH)₂')
    expect(prettyFormula('Calcite')).toBe('Calcite')
    expect(reagentText('HCl_1M')).toBe('1 mol/L 盐酸')
    expect(reagentText('nothing')).toBe('nothing')
  })
  it('offers the units a reagent can be measured in (engine/CHEM.md, action add)', () => {
    expect(unitsFor(reagentOf('HCl_1M')!)[0]).toBe('mL')
    expect(unitsFor(reagentOf('Zn_granule')!)).toEqual(['g', 'mg', 'mmol', 'mol'])
    expect(unitsFor(reagentOf('Zn_granule')!)).not.toContain('mL')
  })
})

describe('the formatter', () => {
  it('writes a real minus, a narrow space before the unit and the decimals asked for', () => {
    expect(qty(20, 'mL', 2)).toBe(`20.00${S}mL`)
    expect(fmtTemp(268.15, 1)).toBe(`−5.0${S}°C`)
    expect(fmtTemp(298.15)).toBe(`25.0${S}°C`)
    expect(fixed(-0.001, 2)).toBe('0.00')
    expect(fmtPH(7.004)).toBe('7.00')
    expect(fmtVolume(12.345, 2)).toBe(`12.35${S}mL`)
    expect(fmtPressure(101325)).toBe(`101.3${S}kPa`)
    expect(fmtMass(20.0729, 3)).toBe(`20.073${S}g`)
    expect(fmtMass(0.0716)).toBe(`71.6${S}mg`)
    expect(qty(null, 'mL', 2)).toBe('—')
  })
  it('uses mmol and µmol where amounts are small, and powers of ten below', () => {
    expect(fmtAmount(0.25)).toBe(`0.25${S}mol`)
    expect(fmtAmount(0.0008)).toBe(`0.8${S}mmol`)
    expect(fmtAmount(2.5e-6)).toBe(`2.5${S}µmol`)
    expect(fmtAmount(1.2e-10)).toBe(`1.2×10⁻¹⁰${S}mol`)
    expect(fmtConc(0.1)).toBe(`0.1${S}mol/L`)
    expect(fmtConc(2.5e-4)).toBe(`0.25${S}mmol/L`)
    expect(fmtConc(1e-7)).toBe(`10⁻⁷${S}mol/L`)
    expect(fmtAmountOf({ value: 2, unit: 'drop' })).toBe('2')
    expect(fmtDuration(60)).toBe(`60${S}s`)
    expect(fmtDuration(754)).toBe(`12${S}min 34${S}s`)
  })
  it('follows the decimal separator of the readouts', () => {
    numberStyle.decimal = ','
    expect(qty(20, 'mL', 2)).toBe(`20,00${S}mL`)
    expect(fmtAmount(0.0008)).toBe(`0,8${S}mmol`)
  })
})

describe('micro view', () => {
  it('shares out at most 36 particles in the proportion of the amounts', () => {
    const P = { series: ['a', 'b', 'c', 'd'] }
    const s = particleShares([{ id: 'Na+', label: 'Na⁺', z: 1, n: 0.002 }, { id: 'Cl-', label: 'Cl⁻', z: -1, n: 0.002 }, { id: 'H+', label: 'H⁺', z: 1, n: 1e-9 }], P)
    expect(s.map(x => [x.id, x.count])).toEqual([['Na+', 18], ['Cl-', 18]])
    expect(particleShares([{ id: 'A', label: 'A', z: 0, n: 3 }, { id: 'B', label: 'B', z: 0, n: 1 }], P).map(x => x.count)).toEqual([27, 9])
    expect(particleShares([], P)).toEqual([])
  })
})
