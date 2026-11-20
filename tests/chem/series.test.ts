/**
 * Live curves (26.65, D297 item 10): the points are the core's numbers, sampled after every action and every frame.
 * - heating 100 g of water at 500 W: the temperature curve rises, its last point is the core's temperature now
 *   (exactly), and each frame of the clock is one point (the state after its steps);
 * - a titration: pH against the vessel's volume has a point after each addition, the core's pH at that volume;
 * - undo takes the points after the bench time it returns to away; the table has a header and one row per point.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setChemData, setGasData } from '../../src/engine/chem'
import { setCatalogue } from '../../src/chem/catalog'
import type { Catalogue } from '../../src/chem/catalog'
import { createBench } from '../../src/chem/bench'

const root = join(__dirname, '..', '..')
const json = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'))

beforeAll(() => {
  const cat = json('src/chem/data/catalog.json')
  setChemData(json('src/chem/data/aqueous.json'), cat)
  setGasData(json('src/chem/data/gas.json'))
  setCatalogue(cat as Catalogue)
})

describe('live curves', () => {
  it('follow the core over bench time and over the volume of a titration', async () => {
    let t = 0
    const b = createBench({ storage: null, notify: () => {}, now: () => t })
    await b.init(async () => {})
    const w = b.place('beaker')!
    b.add(w, 'water', { value: 100, unit: 'g' })
    b.apply({ act: 'heat', vessel: w, power: 500 })
    b.setSpeed(10)
    b.start()
    // 20 frames of 0.1 s at ×10: 20 s of bench time, one sample a frame (the state after its steps)
    for (let i = 0; i < 20; i++) { t += 100; b.frame(0.1, 1000) }
    const T = b.series.points(w, 'T')
    expect(T.length).toBe(21)
    for (let i = 1; i < T.length; i++) { expect(T[i][0]).toBeGreaterThan(T[i - 1][0]); expect(T[i][1]).toBeGreaterThan(T[i - 1][1]) }
    expect(T[T.length - 1][1]).toBe(b.vesselOf(w)!.T - 273.15)
    expect(T[T.length - 1][0]).toBe(b.time.value)
    b.pause()
    // a titration: one point of pH against volume after each addition
    const f = b.place('erlenmeyer')!
    b.add(f, 'HCl_0.1M', { value: 20, unit: 'mL' })
    for (const mL of [10, 9, 0.9, 0.1, 0.1, 5]) b.add(f, 'NaOH_0.1M', { value: mL, unit: 'mL' })
    const pv = b.series.points(f, 'pHV')
    expect(pv.map(p => Math.round(p[0] * 100) / 100)).toEqual([20, 30, 39, 39.9, 40, 40.1, 45.1])
    expect(pv[pv.length - 1][1]).toBe(b.vesselOf(f)!.pH)
    expect(pv[4][1]).toBeGreaterThan(6.5)
    expect(pv[4][1]).toBeLessThan(7.5)
    expect(b.series.curvesOf(f)).toEqual(['T', 'pH', 'pHV'])
    // undo the last addition: its point is gone
    b.undo()
    expect(b.series.points(f, 'pHV').length).toBe(6)
    const csv = b.series.csv(f, 'pHV', ['V', 'pH']).split('\n')
    expect(csv[0]).toBe('V,pH')
    expect(csv.length).toBe(7)
    b.dispose()
  })
})
