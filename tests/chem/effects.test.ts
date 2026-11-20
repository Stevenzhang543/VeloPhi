/**
 * The phenomena of the bench (26.65, D297 item 2): what the drawing shows comes from the core's events only.
 * - an event of a declared reaction makes its `effects` (catalog.json) go on; sounds, heat and bubbles are not drawn
 *   here; an impulse (a pop) lasts its fixed life, a stream lasts while events keep coming;
 * - a silver mirror and a deposit stay exactly as long as the core holds their product in the vessel;
 * - a coloured gas leaving an open vessel takes the core's colour of that gas; a gas the core gives no colour gives nothing;
 * - on a real bench, sodium on water darts and melts, zinc in copper sulfate takes a deposit — from the core's events.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setChemData, setGasData } from '../../src/engine/chem'
import type { BenchEvent, VesselState } from '../../src/engine/chem'
import { setCatalogue } from '../../src/chem/catalog'
import type { Catalogue } from '../../src/chem/catalog'
import { createEffects, gasColour, strengthOf } from '../../src/chem/effects'
import { createBench } from '../../src/chem/bench'

const root = join(__dirname, '..', '..')
const json = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'))

beforeAll(() => {
  const cat = json('src/chem/data/catalog.json')
  setChemData(json('src/chem/data/aqueous.json'), cat)
  setGasData(json('src/chem/data/gas.json'))
  setCatalogue(cat as Catalogue)
})

const vessel = (id: string, solids: Array<{ id: string; n: number }> = []) => ({ id, solids: solids.map(s => ({ ...s, form: 'powder', g: s.n })) }) as unknown as VesselState
const reaction = (vessel: string, id: string, effects: string[], extent = 1e-4): BenchEvent => ({ code: 'reaction', vessel, params: { id, extent, effects } })

describe('effects from events', () => {
  it('have a strength that follows the amount turned over', () => {
    expect(strengthOf(0)).toBe(0)
    expect(strengthOf(1e-7)).toBeCloseTo(0.3, 12)
    expect(strengthOf(1e-3)).toBeCloseTo(0.3 + 0.14 * 4, 12)
    expect(strengthOf(1)).toBe(1)
    expect(strengthOf(1e-12)).toBe(0.2)
  })

  it('draw what the reaction declares, not its sounds, heat or bubbles; an impulse lasts its life', () => {
    const fx = createEffects()
    fx.note([reaction('a', 'H2_burn', ['flame', 'pop', 'bubbles', 'heat', 'hiss'])], false, 100)
    const now = fx.of(vessel('a'), 100.1)
    expect(now.map(e => e.key).sort()).toEqual(['flame', 'pop'])
    // the flame takes the catalogue's colour key of this reaction
    expect(now.find(e => e.key === 'flame')!.flame).toBe('paleBlue')
    // a pop is over in 0.7 s, the flame in 2.5 s
    expect(fx.of(vessel('a'), 100.8).map(e => e.key)).toEqual(['flame'])
    expect(fx.of(vessel('a'), 102.6)).toEqual([])
    expect(fx.busy(102.6)).toBe(false)
  })

  it('in a stream lasts while the events come, and fades a moment after the last', () => {
    const fx = createEffects()
    for (let t = 0; t < 3; t += 0.1) fx.note([reaction('a', 'Fe_burn', ['spark', 'molten'])], true, t)
    expect(fx.of(vessel('a'), 3.0).map(e => e.key).sort()).toEqual(['molten', 'spark'])
    expect(fx.of(vessel('a'), 3.0)[0].since).toBe(0)
    expect(fx.of(vessel('a'), 3.9)).toEqual([])
    // no event with nothing turned over
    fx.note([reaction('b', 'Fe_burn', ['spark'], 0)], true, 4)
    expect(fx.of(vessel('b'), 4)).toEqual([])
  })

  it('keeps a mirror while the core holds its silver, and only then', () => {
    const fx = createEffects()
    fx.note([reaction('m', 'silver_mirror_glucose', ['mirror'])], true, 0)
    expect(fx.of(vessel('m', [{ id: 'Ag(s)', n: 1e-4 }]), 1000).map(e => e.key)).toEqual(['mirror'])
    expect(fx.of(vessel('m', []), 1001)).toEqual([])
  })

  it('shows a coloured gas leaving in the core\'s colour of that gas, and nothing for a colourless one', () => {
    expect(gasColour('NO2(g)')).toMatch(/^rgba\(/)
    expect(gasColour('Br2(g)')).toMatch(/^rgba\(/)
    expect(gasColour('H2(g)')).toBeNull()
    // the catalogue's display spectrum of chlorine absorbs below 400 nm only: the core sees it almost white, so it
    // is not drawn (a data gap, reported; nothing is painted the core does not give)
    expect(gasColour('Cl2(g)')).toBeNull()
    const fx = createEffects()
    fx.note([{ code: 'gas', vessel: 'g', params: { species: 'NO2(g)', n: 1e-4 } }, { code: 'gas', vessel: 'h', params: { species: 'H2(g)', n: 1e-4 } }], true, 0)
    expect(fx.of(vessel('g'), 0.5).map(e => [e.key, !!e.colour])).toEqual([['gas', true]])
    expect(fx.of(vessel('h'), 0.5)).toEqual([])
  })
})

describe('effects on a real bench (the core\'s events)', () => {
  it('sodium on water darts and melts; zinc in copper sulfate takes a deposit while the copper is there', async () => {
    let t = 0
    const bench = createBench({ storage: null, notify: () => {}, now: () => t })
    await bench.init(async () => {})
    const a = bench.place('beaker')!
    bench.add(a, 'water', { value: 100, unit: 'mL' })
    bench.add(a, 'Na_lump', { value: 0.3, unit: 'g' })
    const b = bench.place('beaker')!
    bench.add(b, 'CuSO4_1M', { value: 50, unit: 'mL' })
    bench.add(b, 'Zn_granule', { value: 2, unit: 'g' })
    bench.start()
    for (let i = 0; i < 10; i++) { t += 100; bench.frame(0.1, 1000) }
    const keys = (id: string) => bench.effectsOf(bench.vesselOf(id)!).map(e => e.key).sort()
    expect(keys(a)).toEqual(expect.arrayContaining(['dart', 'melt']))
    expect(keys(b)).toContain('deposit')
    const copper = bench.vesselOf(b)!.solids.find(s => s.id === 'Cu(s)')
    expect(copper && copper.n > 0).toBe(true)
    // emptying the beaker takes the copper away, and the deposit with it
    bench.pause()
    bench.emptyVessel(b)
    expect(keys(b)).not.toContain('deposit')
    bench.dispose()
  })
})
