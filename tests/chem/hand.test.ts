/**
 * Tools held in the hand (26.65, D297 item 7): each emptying of a tool is ONE action of the log.
 * - the spatula takes a dose of a powder from an open wide bottle and puts it in a vessel: `add` of the dose in grams;
 *   it does not take pieces (the tweezers do), nor from a stoppered bottle (the rule);
 * - the tweezers take a piece (a granule) the same way;
 * - the dropper draws from a bottle of a liquid (an `add` in drops) or from a vessel (a `pour` in drops);
 * - the glass rod stirs: no action at all (the model has no stirring).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setChemData, setGasData } from '../../src/engine/chem'
import { setCatalogue } from '../../src/chem/catalog'
import type { Catalogue } from '../../src/chem/catalog'
import { useBench } from '../../src/chem/bench'
import { dropInto, hand, handTap, putToolDown, stirring, takeTool } from '../../src/app/components/chem/hand'

const root = join(__dirname, '..', '..')
const json = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'))

beforeAll(async () => {
  const cat = json('src/chem/data/catalog.json')
  setChemData(json('src/chem/data/aqueous.json'), cat)
  setGasData(json('src/chem/data/gas.json'))
  setCatalogue(cat as Catalogue)
  await useBench().init(async () => {})
})

describe('the tools of the hand', () => {
  it('spatula and tweezers: a dose from an open wide bottle is one add in grams', () => {
    const b = useBench()
    b.reset()
    const beaker = b.place('beaker')!
    b.add(beaker, 'water', { value: 50, unit: 'mL' })
    const salt = b.placeBottle('NaCl_solid')!
    const zinc = b.placeBottle('Zn_granule')!
    takeTool('spatula')
    hand.dose = 0.4
    // the stopper is on: nothing is taken (the rule is said)
    expect(handTap({ fixture: salt })).toBe(false)
    expect(hand.load).toBeNull()
    b.setFixture(salt, { open: true }); b.setFixture(zinc, { open: true })
    // pieces are for the tweezers
    handTap({ fixture: zinc })
    expect(hand.load).toBeNull()
    handTap({ fixture: salt })
    expect(hand.load).toMatchObject({ from: 'bottle', reagent: 'NaCl_solid' })
    const n = b.log.value.length
    expect(handTap({ vessel: beaker })).toBe(true)
    expect(b.log.value.length).toBe(n + 1)
    expect(b.log.value[n]).toEqual({ act: 'add', to: beaker, reagent: 'NaCl_solid', amount: { value: 0.4, unit: 'g' } })
    expect(hand.load).toBeNull()
    takeTool('tweezers')
    hand.dose = 0.5
    handTap({ fixture: salt })
    expect(hand.load).toBeNull()
    handTap({ fixture: zinc })
    expect(handTap({ vessel: beaker })).toBe(true)
    expect(b.log.value[b.log.value.length - 1]).toEqual({ act: 'add', to: beaker, reagent: 'Zn_granule', amount: { value: 0.5, unit: 'g' } })
    putToolDown()
  })

  it('dropper: drops from a bottle are an add, drops from a vessel a pour', () => {
    const b = useBench()
    b.reset()
    const a = b.place('beaker')!, c = b.place('beaker')!
    b.add(a, 'NaOH_0.1M', { value: 30, unit: 'mL' })
    const ind = b.placeBottle('phenolphthalein')!
    takeTool('dropper')
    handTap({ fixture: ind })
    expect(hand.load).toMatchObject({ from: 'bottle', reagent: 'phenolphthalein' })
    expect(dropInto(c, 3)).toBe(true)
    expect(b.log.value[b.log.value.length - 1]).toEqual({ act: 'add', to: c, reagent: 'phenolphthalein', amount: { value: 3, unit: 'drop' } })
    putToolDown(); takeTool('dropper')
    handTap({ vessel: a })
    expect(hand.load).toMatchObject({ from: 'vessel', id: a })
    expect(handTap({ vessel: c })).toBe(true)
    expect(b.log.value[b.log.value.length - 1]).toEqual({ act: 'pour', from: a, to: c, amount: { value: 1, unit: 'drop' } })
    putToolDown()
  })

  it('glass rod: stirring is drawn, and is no action', () => {
    const b = useBench()
    b.reset()
    const a = b.place('beaker')!
    b.add(a, 'water', { value: 50, unit: 'mL' })
    const n = b.log.value.length
    takeTool('glassRod')
    expect(handTap({ vessel: a })).toBe(false)
    expect(stirring(a)).toBe(true)
    expect(b.log.value.length).toBe(n)
    putToolDown()
  })
})
