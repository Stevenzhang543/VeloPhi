/**
 * Reagent bottles on the bench (26.65, D297 item 6): a reagent of the shelf comes in its labelled bottle — a narrow
 * bottle of a liquid, a wide one of a solid, a dropper bottle of an indicator, none for a gas. A bottle is a stock of
 * the shelf, drawing only: putting it on the bench is not an action; what is taken from it is ONE `add` of its reagent.
 * The gesture's amount (closed forms, tolerance 1e-9 unless said):
 * - a dropper lets its first drop fall at 1/3 s of squeezing, then three a second: n(t) = 1 + ⌊3(t − 1/3)⌋;
 * - a solid tipped from a wide bottle flows at 0.6 g/s after the same tip and ramp as a liquid: held T ≥ 1.45 s it gives
 *   0.6·(T − 0.85) g (to one frame's worth, 0.01 g, at 60 frames a second).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setChemData, setGasData } from '../../src/engine/chem'
import { reagentOf, setCatalogue } from '../../src/chem/catalog'
import type { Catalogue } from '../../src/chem/catalog'
import { createBench } from '../../src/chem/bench'
import { bottleFor } from '../../src/chem/rig'
import { DropMeter, PourMeter, SOLID_RATE, addAmount, dropsAfter } from '../../src/chem/pouring'

const root = join(__dirname, '..', '..')
const json = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'))

beforeAll(() => {
  const cat = json('src/chem/data/catalog.json')
  setChemData(json('src/chem/data/aqueous.json'), cat)
  setGasData(json('src/chem/data/gas.json'))
  setCatalogue(cat as Catalogue)
})

describe('the bottle a reagent comes in', () => {
  it('narrow for a liquid, wide for a solid, a dropper bottle for an indicator, none for a gas', () => {
    expect(bottleFor(reagentOf('HCl_1M'))).toBe('narrow')
    expect(bottleFor(reagentOf('water'))).toBe('narrow')
    expect(bottleFor(reagentOf('Zn_granule'))).toBe('wide')
    expect(bottleFor(reagentOf('phenolphthalein'))).toBe('dropper')
    expect(bottleFor(reagentOf('O2_gas'))).toBeNull()
  })
})

describe('what the hand takes from a bottle', () => {
  it('drops: the first at a third of a second, then three a second', () => {
    expect(dropsAfter(0.3)).toBe(0)
    expect(dropsAfter(1 / 3)).toBe(1)
    expect(dropsAfter(1 / 3 + 0.99)).toBe(3)
    expect(dropsAfter(1 / 3 + 1)).toBe(4)
    const m = new DropMeter()
    for (let i = 0; i < 60; i++) m.step('a', 1 / 60)
    expect(m.drops).toBe(dropsAfter(1))
    m.step('b', 1 / 60)
    expect(m.drops).toBe(0)
  })

  it('a solid tipped from a wide bottle: 0.6 g/s after the tip and the ramp', () => {
    const m = new PourMeter(250, Infinity, SOLID_RATE)
    for (let i = 0; i < 180; i++) m.step('a', 1 / 60)
    expect(Math.abs(m.mL - SOLID_RATE * (3 - 0.25 - 0.6))).toBeLessThan(0.01)
    expect(addAmount(m.mL, 'g')).toEqual({ value: Math.round(m.mL * 10) / 10, unit: 'g' })
    expect(addAmount(0.04, 'g')).toBeNull()
  })
})

describe('a bottle on the bench', () => {
  it('is drawing only; what is taken from it is one add of its reagent; the file keeps it', async () => {
    const b = createBench({ storage: null, notify: () => {} })
    await b.init(async () => {})
    const beaker = b.place('beaker')!
    const n = b.log.value.length
    const hash = b.hash()
    const bottle = b.placeBottle('HCl_1M')!
    expect(b.fixtureOf(bottle)).toMatchObject({ kind: 'reagentBottle', reagent: 'HCl_1M', style: 'narrow', open: false })
    expect(b.log.value.length).toBe(n)
    expect(b.hash()).toBe(hash)
    expect(b.placeBottle('O2_gas')).toBeNull()
    // the stopper comes off with a tap (and is laid upside down beside it — a drawing)
    b.tapFixture(bottle)
    expect(b.fixtureOf(bottle)!.open).toBe(true)
    expect(b.log.value.length).toBe(n)
    // what the gesture gives is an add of the bottle's reagent
    expect(b.add(beaker, 'HCl_1M', { value: 12.3, unit: 'mL' })).not.toBeNull()
    expect(b.log.value[b.log.value.length - 1]).toEqual({ act: 'add', to: beaker, reagent: 'HCl_1M', amount: { value: 12.3, unit: 'mL' } })
    expect(b.portableDoc().fixtures?.find(f => f.id === bottle)).toMatchObject({ reagent: 'HCl_1M', open: true })
    b.dispose()
  })
})
