/**
 * Delivery tubes and the trough as things (26.65, D297 item 8): where a tube's ends are decides `stopper`, `connect`
 * and `collector`, at the moment an end is let go; a jar on the shelf of a pneumatic trough collects over water.
 * - a tube taken for a flask goes through its stopper (`stopper on`), its other end hangs free;
 * - its end under the mouth of a jar in the trough: `connect`; time passes and hydrogen is in the jar;
 * - its end free again: `disconnect`, and the flask vents through the tube (`stopper off`: the gas leaves to the room);
 * - its end at the bottom of an empty upright jar: `connect` and `collector up`; into limewater: `connect` (none);
 * - a jar taken out of the trough: `collector none`;
 * - an action from elsewhere (`connect` from a guided step) is followed by the drawing: a tube appears between them;
 * - undo puts the tube's end back where it was with the action it gave.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setChemData, setGasData } from '../../src/engine/chem'
import { setCatalogue } from '../../src/chem/catalog'
import type { Catalogue } from '../../src/chem/catalog'
import { createBench } from '../../src/chem/bench'
import { RIG } from '../../src/chem/rig'

const root = join(__dirname, '..', '..')
const json = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'))

beforeAll(() => {
  const cat = json('src/chem/data/catalog.json')
  setChemData(json('src/chem/data/aqueous.json'), cat)
  setGasData(json('src/chem/data/gas.json'))
  setCatalogue(cat as Catalogue)
})

async function fresh() {
  const b = createBench({ storage: null, notify: () => {} })
  await b.init(async () => {})
  return b
}
const last = (b: Awaited<ReturnType<typeof fresh>>) => b.log.value[b.log.value.length - 1]

describe('a tube and a trough', () => {
  it('collects hydrogen over water when its end is under the jar in the trough', async () => {
    const b = await fresh()
    const gen = b.place('erlenmeyer')!
    b.add(gen, 'Zn_granule', { value: 5, unit: 'g' }); b.add(gen, 'HCl_1M', { value: 50, unit: 'mL' })
    const trough = b.addFixture('pneumaticTrough')!
    const tx = b.fixtureOf(trough)!.x
    const jar = b.place('gasJar')!
    b.moveVessel(jar, tx + 4, 3)
    expect(b.extras(jar)).toMatchObject({ on: trough, at: 'trough', y: RIG.trough.shelf })
    expect(b.vesselOf(jar)!.collect).toBe('water')
    expect(last(b)).toEqual({ act: 'collector', vessel: jar, mode: 'water' })
    const tube = b.addTube(gen)!
    expect(b.vesselOf(gen)!.closed).toBe(true)
    expect(b.fixtureOf(tube)).toMatchObject({ a: { vessel: gen, at: 'stopper' }, b: { vessel: null } })
    const je = b.extras(jar)
    const n = b.log.value.length
    b.moveTubeEnd(tube, 'b', je.x, je.y + 0.5)
    expect(b.fixtureOf(tube)!.b).toMatchObject({ vessel: jar, at: 'under' })
    expect(b.log.value.length).toBe(n + 1)
    expect(last(b)).toEqual({ act: 'connect', from: gen, to: jar })
    b.apply({ act: 'wait', seconds: 600 })
    expect(b.read(jar)!.gas.some(g => g.id === 'H2(g)' && g.n > 0)).toBe(true)
    // undo the wait, then the end: it is free again and the flask no longer delivers
    b.undo(); b.undo()
    expect(b.vesselOf(gen)!.outlet).toBeNull()
    expect(b.fixtureOf(tube)!.b).toMatchObject({ vessel: null })
    b.redo()
    expect(b.vesselOf(gen)!.outlet).toBe(jar)
    // the end let go in the air: the flask vents through its tube
    b.moveTubeEnd(tube, 'b', je.x + 20, 15)
    expect(b.vesselOf(gen)!.outlet).toBeNull()
    expect(b.vesselOf(gen)!.closed).toBe(false)
    expect(b.tubed().has(gen)).toBe(true)
    // the jar taken out of the trough no longer collects over water
    b.moveVessel(jar, tx + 30, 0)
    expect(b.vesselOf(jar)!.collect).toBe('none')
    b.dispose()
  })

  it('into an empty upright jar is upward displacement; into limewater it bubbles through', async () => {
    const b = await fresh()
    const gen = b.place('erlenmeyer')!
    const jar = b.place('gasJar')!
    const lime = b.place('beaker', undefined, 100)!
    b.add(lime, 'limewater', { value: 50, unit: 'mL' })
    const tube = b.addTube(gen)!
    const je = b.extras(jar)
    b.moveTubeEnd(tube, 'b', je.x, je.y + 12)
    expect(b.fixtureOf(tube)!.b).toMatchObject({ vessel: jar, at: 'mouth' })
    expect(b.vesselOf(jar)!.collect).toBe('up')
    expect(b.vesselOf(gen)!.outlet).toBe(jar)
    const le = b.extras(lime)
    b.moveTubeEnd(tube, 'b', le.x, le.y + 7)
    expect(b.fixtureOf(tube)!.b).toMatchObject({ vessel: lime, at: 'liquid' })
    expect(b.vesselOf(gen)!.outlet).toBe(lime)
    b.dispose()
  })

  it('a connection made elsewhere is drawn as a tube', async () => {
    const b = await fresh()
    const gen = b.place('erlenmeyer')!
    const jar = b.place('gasJar')!
    b.apply({ act: 'stopper', vessel: gen, on: true })
    b.apply({ act: 'collector', vessel: jar, mode: 'water' })
    // a jar the core holds over water stands on its mouth in a trough
    expect(b.extras(jar).at).toBe('trough')
    expect(b.fixtures.value.some(f => f.kind === 'pneumaticTrough')).toBe(true)
    b.apply({ act: 'connect', from: gen, to: jar })
    expect(b.tubeFrom(gen)!.b).toMatchObject({ vessel: jar, at: 'under' })
    b.apply({ act: 'disconnect', from: gen })
    expect(b.tubeFrom(gen)!.b).toMatchObject({ vessel: null })
    b.dispose()
  })
})
