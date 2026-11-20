/**
 * The bench as things (26.65, D297 items 3–5): supports, burners and baths are fixtures of the document (drawing
 * only), and where they stand decides actions of the log. Checked here:
 * - geometry (rig.ts): a vessel put down comes to rest on the highest support under it within reach, in a slot of a
 *   rack (test tubes only), in a clamp it is brought to, else on the bench; a lit burner heats the lowest vessel whose
 *   bottom is over its flame — on the gauze of a tripod over it, in a clamp at the right height — and nothing beside it
 *   or above the flame's reach (which follows the power setting, √P);
 * - the store: lighting a lamp under a beaker on a tripod is ONE `heat` entry and one step of undo together with the
 *   lamp (undo puts the lamp out again, redo lights it); moving the lamp away, or the beaker off the tripod, is `heat 0`;
 *   standing in a water bath is `bath`, its temperature setting is `bath` again; a hot plate heats what stands on it;
 * - the document keeps the fixtures, a bench of 26.64 (a burner on the list of a vessel's parts, a heat entry in the
 *   log) opens with a tripod and a lit lamp under the vessel and the same fingerprint;
 * - an action from elsewhere (a guided step, Copilot) is followed by the drawing: `heat` lights the lamp under the vessel.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setChemData, setGasData } from '../../src/engine/chem'
import { setCatalogue } from '../../src/chem/catalog'
import type { Catalogue } from '../../src/chem/catalog'
import { createBench } from '../../src/chem/bench'
import { RIG, dropSpot, flameOf, gripOf, heatedBy, newFixture, rigWants } from '../../src/chem/rig'
import type { Fixture, RigVessel } from '../../src/chem/rig'

const root = join(__dirname, '..', '..')
const json = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'))

beforeAll(() => {
  const cat = json('src/chem/data/catalog.json')
  setChemData(json('src/chem/data/aqueous.json'), cat)
  setGasData(json('src/chem/data/gas.json'))
  setCatalogue(cat as Catalogue)
})

const beaker = (x: number, y = 0, on: string | null = null, at: RigVessel['at'] = null): RigVessel => ({ id: 'b', kind: 'beaker', capacity_mL: 250, x, y, on, at })

describe('where things come to rest', () => {
  const tripod = newFixture('tripod', 'f1', 0)
  const rack = newFixture('testTubeRack', 'f2', 30)
  const stand = newFixture('stand', 'f3', 60)

  it('on the gauze of a tripod under it, else on the bench', () => {
    const v = { id: 'b', kind: 'beaker', capacity_mL: 250 }
    expect(dropSpot([tripod], [], v, 1.2, RIG.tripod.h + 3)).toMatchObject({ y: RIG.tripod.h, on: 'f1', what: 'gauze', x: 1.2 })
    // just below the gauze still lands on it (1.5 cm of grace), well below falls past it to the bench
    expect(dropSpot([tripod], [], v, 0, RIG.tripod.h - 1)).toMatchObject({ on: 'f1' })
    expect(dropSpot([tripod], [], v, 0, RIG.tripod.h - 3)).toMatchObject({ y: 0, on: null, what: 'bench' })
    expect(dropSpot([tripod], [], v, 12, 20)).toMatchObject({ y: 0, on: null })
  })

  it('a test tube in the nearest free slot of a rack; a beaker never', () => {
    const tube = { id: 't', kind: 'testTube', capacity_mL: 20 }
    const s = dropSpot([rack], [], tube, 30 - 1.6, 9)
    expect(s.what).toBe('slot')
    expect(s.x).toBeCloseTo(30 - RIG.rack.pitch / 2, 12)
    expect(s.y).toBe(RIG.rack.floor)
    // the slot is taken: not that slot again (here the next one is out of reach: the bench)
    const taken: RigVessel = { id: 'u', kind: 'testTube', capacity_mL: 20, x: s.x, y: s.y, on: 'f2', at: 'slot' }
    expect(dropSpot([rack], [taken], tube, s.x, 9).what).toBe('bench')
    expect(dropSpot([rack], [taken], tube, s.x + RIG.rack.pitch * 0.8, 9)).toMatchObject({ what: 'slot', x: s.x + RIG.rack.pitch })
    expect(dropSpot([rack], [], { id: 'b', kind: 'beaker', capacity_mL: 250 }, 30, 9).what).toBe('bench')
  })

  it('in a stand\'s clamp, gripped near its mouth, when brought to the jaws', () => {
    const tube = { id: 't', kind: 'testTube', capacity_mL: 20 }
    const grip = gripOf('testTube', 20)
    const s = dropSpot([stand], [], tube, 60 + RIG.stand.reach + 0.5, 22 - grip + 1)
    expect(s).toMatchObject({ what: 'clamp', on: 'f3', x: 60 + RIG.stand.reach })
    expect(s.y).toBeCloseTo(22 - grip, 9)
    expect(dropSpot([stand], [], tube, 60 + RIG.stand.reach + 4, 22 - grip).what).toBe('bench')
  })
})

describe('what a burner heats', () => {
  const lamp: Fixture = { ...newFixture('alcoholBurner', 'f1', 0), lit: true, cap: false }

  it('the vessel on the tripod over it; not one beside it, not one above the flame', () => {
    expect(heatedBy(lamp, [beaker(0, RIG.tripod.h, 'f0', 'gauze')])?.id).toBe('b')
    expect(heatedBy(lamp, [beaker(6, RIG.tripod.h)])).toBeNull()
    expect(heatedBy(lamp, [beaker(0, 0)])).toBeNull()
    expect(heatedBy(lamp, [beaker(0, RIG.alcoholBurner.h + RIG.alcoholBurner.flame + RIG.heatAbove + 0.5)])).toBeNull()
    expect(rigWants([{ ...lamp, lit: false }], [beaker(0, RIG.tripod.h)]).get('b')!.heater).toBe(0)
    expect(rigWants([lamp], [beaker(0, RIG.tripod.h)]).get('b')!.heater).toBe(150)
  })

  it('reaches less high on a lower flame (its height follows the square root of the power)', () => {
    const low = flameOf({ ...lamp, power: 150 / 4 })!, full = flameOf(lamp)!
    expect(low.reach / full.reach).toBeCloseTo(0.5, 12)
  })

  it('a test tube clamped with its bottom in the outer flame', () => {
    const tube: RigVessel = { id: 't', kind: 'testTube', capacity_mL: 20, x: 0, y: RIG.alcoholBurner.h + 2.8, on: 's', at: 'clamp' }
    expect(heatedBy(lamp, [tube])?.id).toBe('t')
  })
})

async function fresh() {
  const b = createBench({ storage: null, notify: () => {} })
  await b.init(async () => {})
  return b
}

describe('geometry becomes actions of the log', () => {
  it('lighting the lamp under a beaker is one heat entry and one step of undo with the lamp', async () => {
    const b = await fresh()
    const v = b.place('beaker')!
    b.add(v, 'water', { value: 100, unit: 'mL' })
    expect(b.rigUnder(v, 'alcoholBurner')).toBe(true)
    const lamp = b.fixtures.value.find(f => f.kind === 'alcoholBurner')!.id
    expect(b.extras(v)).toMatchObject({ on: b.fixtures.value.find(f => f.kind === 'tripod')!.id, at: 'gauze', y: RIG.tripod.h })
    const n = b.log.value.length
    b.tapFixture(lamp) // the cap comes off: nothing for the chemistry
    expect(b.log.value.length).toBe(n)
    b.tapFixture(lamp) // lit: the beaker over it is heated
    expect(b.log.value.length).toBe(n + 1)
    expect(b.log.value[n]).toEqual({ act: 'heat', vessel: v, power: 150 })
    expect(b.vesselOf(v)!.heater).toBe(150)
    b.undo()
    expect(b.vesselOf(v)!.heater).toBe(0)
    expect(b.fixtureOf(lamp)).toMatchObject({ lit: false, cap: false })
    b.redo()
    expect(b.vesselOf(v)!.heater).toBe(150)
    expect(b.fixtureOf(lamp)).toMatchObject({ lit: true })
    // the power setting of a lit lamp under a vessel is a heat entry again
    b.setFixture(lamp, { power: 80 })
    expect(b.vesselOf(v)!.heater).toBe(80)
    // the lamp carried away: heat 0; brought back under the tripod (it snaps to its centre): heated again
    const tripod = b.fixtures.value.find(f => f.kind === 'tripod')!
    b.moveFixture(lamp, tripod.x + 12)
    expect(b.vesselOf(v)!.heater).toBe(0)
    b.moveFixture(lamp, tripod.x + 2)
    expect(b.fixtureOf(lamp)!.x).toBe(tripod.x)
    expect(b.vesselOf(v)!.heater).toBe(80)
    // the beaker taken off the tripod: heat 0
    b.moveVessel(v, tripod.x + 20, 0)
    expect(b.vesselOf(v)!.heater).toBe(0)
    expect(b.extras(v)).toMatchObject({ on: null, y: 0 })
    // putting the cap on puts the lamp out
    b.tapFixture(lamp)
    expect(b.fixtureOf(lamp)).toMatchObject({ lit: false, cap: true })
    b.dispose()
  })

  it('a water bath holds the vessel standing in it at its setting; a hot plate heats what stands on it', async () => {
    const b = await fresh()
    const v = b.place('beaker', undefined, 100)!
    b.add(v, 'water', { value: 40, unit: 'mL' })
    const bath = b.addFixture('waterBath')!
    const f = b.fixtureOf(bath)!
    b.moveVessel(v, f.x, 5)
    expect(b.extras(v)).toMatchObject({ on: bath, at: 'bath' })
    expect(b.vesselOf(v)!.bath).toBeCloseTo(333.15, 9)
    expect(b.log.value[b.log.value.length - 1]).toEqual({ act: 'bath', vessel: v, T: 333.15 })
    b.setFixture(bath, { T: 313.15 })
    expect(b.vesselOf(v)!.bath).toBeCloseTo(313.15, 9)
    b.moveVessel(v, f.x + 20, 0)
    expect(b.vesselOf(v)!.bath).toBeNull()
    const plate = b.addFixture('hotPlate')!
    b.moveVessel(v, b.fixtureOf(plate)!.x, RIG.hotPlate.h + 1)
    expect(b.vesselOf(v)!.heater).toBe(0)
    b.tapFixture(plate)
    expect(b.vesselOf(v)!.heater).toBe(300)
    b.dispose()
  })

  it('the drawing follows an action from elsewhere: heat lights the lamp under the vessel', async () => {
    const b = await fresh()
    const v = b.place('beaker')!
    b.add(v, 'water', { value: 100, unit: 'mL' })
    b.apply({ act: 'heat', vessel: v, power: 150 })
    const lamp = b.fixtures.value.find(f => f.kind === 'alcoholBurner')
    expect(lamp).toMatchObject({ lit: true, cap: false, power: 150 })
    expect(b.partsOf(v)).toContain('alcoholBurner')
    b.apply({ act: 'heat', vessel: v, power: 0 })
    expect(b.fixtureOf(lamp!.id)).toMatchObject({ lit: false })
    b.dispose()
  })
})

describe('the document', () => {
  it('keeps the fixtures through a file, and opens a bench of 26.64 with its burner as a thing of its own', async () => {
    const b = await fresh()
    const v = b.place('beaker')!
    b.add(v, 'water', { value: 100, unit: 'mL' })
    b.rigUnder(v, 'alcoholBurner')
    const doc = b.portableDoc()
    expect(doc.fixtures?.map(f => f.kind)).toEqual(['tripod', 'alcoholBurner'])
    const again = await fresh()
    again.open(doc)
    expect(again.fixtures.value.map(f => f.kind)).toEqual(['tripod', 'alcoholBurner'])
    expect(again.extras(v)).toMatchObject({ at: 'gauze' })
    again.dispose()
    // 26.64: the burner was a part of the flask, the log heated it
    const old = { format: 'velophi-bench' as const, version: 1 as const, objects: [], log: [
      { act: 'place' as const, object: { id: 'v1', kind: 'erlenmeyer', capacity_mL: 250, heat_J_K: 88.2, loss_W_K: 0.25, x: 0, y: 0, label: 'A', parts: ['alcoholBurner', 'thermometer'] } },
      { act: 'add' as const, to: 'v1', reagent: 'water', amount: { value: 50, unit: 'mL' as const } },
      { act: 'heat' as const, vessel: 'v1', power: 150 }
    ] }
    const plain = await fresh()
    plain.open({ ...old, log: old.log })
    expect(plain.extras('v1').parts).toEqual(['thermometer'])
    expect(plain.fixtures.value.map(f => f.kind)).toEqual(['tripod', 'alcoholBurner'])
    expect(plain.fixtures.value.find(f => f.kind === 'alcoholBurner')).toMatchObject({ lit: true, cap: false })
    expect(plain.log.value.length).toBe(3)
    const hash = plain.hash()
    const ref = await fresh()
    ref.open({ ...old, log: old.log.map(e => (e.act === 'place' ? { ...e, object: { ...e.object, parts: [] } } : e)) })
    expect(ref.hash()).toBe(hash)
    plain.dispose(); ref.dispose(); b.dispose()
  })
})
