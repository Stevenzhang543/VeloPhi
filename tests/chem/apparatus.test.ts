/**
 * The apparatus of the chemistry bench (26.64, D269; src/chem/apparatus.ts, data/apparatus.json): the data are
 * complete, the height–volume profiles are exact inverses, and every vessel on the shelf is an object the core takes.
 * References: closed forms of elementary solids (cylinder, sphere cap) with the tolerances stated.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Bench, setChemData } from '../../src/engine/chem'
import { APPARATUS, APPARATUS_GROUPS, decimalsFor, graduations, heatCapacityOf, instrumentReading, kindOf, levelOf, litmusState, quantise, shapeOf, shelfKinds, vesselObject, volumeAt, volumeResolution } from '../../src/chem/apparatus'
import type { VesselState } from '../../src/engine/chem'

const root = join(__dirname, '..', '..')
const json = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'))

beforeAll(() => { setChemData(json('src/chem/data/aqueous.json'), json('tests/fixtures/chem/catalog-mini.json')) })

const vesselKinds = APPARATUS.filter(k => k.vessel)

describe('apparatus data', () => {
  it('has at least 40 kinds on the shelf, each with three names, a known group and a role', () => {
    expect(APPARATUS.length).toBeGreaterThanOrEqual(40)
    expect(shelfKinds().length).toBeGreaterThanOrEqual(40)
    const groups = new Set(APPARATUS_GROUPS.map(g => g.id))
    const ids = new Set<string>()
    for (const k of APPARATUS) {
      expect(ids.has(k.id), k.id).toBe(false)
      ids.add(k.id)
      for (const lang of ['zh', 'en', 'de'] as const) expect(k.name[lang]?.length, `${k.id} ${lang}`).toBeGreaterThan(0)
      expect(/[一-鿿]/.test(k.name.en + k.name.de), k.id).toBe(false)
      expect(groups.has(k.group), k.id).toBe(true)
      // a kind on the shelf is something to the core: a vessel, an instrument or a tool — or (26.65, D297) a support,
      // a thing of its own on the bench whose place decides actions of the log; one that waits says why
      if (k.available) expect(!!k.vessel || !!k.instrument || !!k.tool || k.role === 'support', k.id).toBe(true)
      else expect(k.reason, k.id).toBeTruthy()
    }
    for (const g of APPARATUS_GROUPS) for (const lang of ['zh', 'en', 'de'] as const) expect(g.name[lang].length).toBeGreaterThan(0)
  })

  it('keeps the names of the shelf short enough for one line of the popover (18 Latin characters)', () => {
    for (const k of shelfKinds()) {
      expect(k.name.en.length, k.name.en).toBeLessThanOrEqual(18)
      expect(k.name.de.length, k.name.de).toBeLessThanOrEqual(18)
      expect(k.name.zh.length, k.name.zh).toBeLessThanOrEqual(9)
    }
  })

  it('gives sane resolutions (burette 0.01 mL, pan balance 0.1 g, electronic balance 0.001 g, thermometer 0.1 K, pH meter 0.01, pH paper whole numbers)', () => {
    expect(volumeResolution('buretteAcid', 50)).toBe(0.01)
    expect(volumeResolution('buretteBase', 50)).toBe(0.01)
    expect(kindOf('panBalance')!.instrument!.resolution).toBe(0.1)
    expect(kindOf('eBalance')!.instrument!.resolution).toBe(0.001)
    expect(kindOf('thermometer')!.instrument!.resolution).toBe(0.1)
    expect(kindOf('phMeter')!.instrument!.resolution).toBe(0.01)
    expect(kindOf('phPaper')!.instrument!.resolution).toBe(1)
    for (const k of APPARATUS) {
      if (k.instrument) { expect(k.instrument.resolution, k.id).toBeGreaterThan(0); expect(k.instrument.resolution, k.id).toBeLessThanOrEqual(1) }
      if (k.tool?.action === 'heat') { expect(k.tool.power_W, k.id).toBeGreaterThan(20); expect(k.tool.power_W, k.id).toBeLessThan(2000) }
      if (k.tool?.action === 'bath') { expect(k.tool.T_K, k.id).toBeGreaterThan(250); expect(k.tool.T_K, k.id).toBeLessThan(380) }
    }
    expect(decimalsFor(0.01)).toBe(2)
    expect(decimalsFor(0.5)).toBe(1)
    expect(decimalsFor(1)).toBe(0)
    expect(decimalsFor(0.001)).toBe(3)
    expect(quantise(7.004, 0.01)).toBeCloseTo(7.0, 12)
  })

  it('takes the heat capacity of a vessel from its glass: mass × 0.84 J/(g·K)', () => {
    // 250 mL beaker, 100 g of borosilicate glass
    expect(heatCapacityOf('beaker', 250)).toBeCloseTo(84, 9)
    expect(vesselObject('beaker', 'x', 250)).toMatchObject({ id: 'x', kind: 'beaker', capacity_mL: 250, heat_J_K: 84 })
    for (const k of vesselKinds) for (const cap of k.vessel!.capacities) {
      const o = vesselObject(k.id, 'x', cap)
      expect(o.heat_J_K, `${k.id} ${cap}`).toBeGreaterThan(0)
      expect(o.loss_W_K, `${k.id} ${cap}`).toBeGreaterThanOrEqual(0)
      if (k.vessel!.glass_g) expect(o.heat_J_K).toBeCloseTo(k.vessel!.glass_g[String(cap)] * (k.vessel!.cp_J_gK ?? 0.84), 3)
    }
    // an insulated vessel loses next to nothing
    expect(vesselObject('calorimeter', 'c').loss_W_K as number).toBeLessThan(0.05)
  })
})

describe('height–volume profiles', () => {
  it('a full vessel is full: the volume to the mark is the capacity (1e-9 relative), for every kind and capacity', () => {
    for (const k of vesselKinds) for (const cap of k.vessel!.capacities) {
      const s = shapeOf(k.id, cap)
      expect(Math.abs(volumeAt(s, s.full) - cap) / cap, `${k.id} ${cap}`).toBeLessThan(1e-9)
      expect(Math.abs(levelOf(s, cap) - s.full) / s.full, `${k.id} ${cap}`).toBeLessThan(1e-9)
      expect(s.brim_mL).toBeGreaterThanOrEqual(cap * (1 - 1e-12))
      expect(s.top).toBeGreaterThanOrEqual(s.full * (1 - 1e-12))
    }
  })

  it('level and volume are inverse to 1e-9 for every vessel kind', () => {
    for (const k of vesselKinds) for (const cap of k.vessel!.capacities) {
      const s = shapeOf(k.id, cap)
      for (let i = 1; i <= 400; i++) {
        const v = (s.brim_mL * i) / 401
        const back = volumeAt(s, levelOf(s, v))
        expect(Math.abs(back - v) / s.brim_mL, `${k.id} ${cap} v=${v}`).toBeLessThan(1e-9)
        const h = (s.top * i) / 401
        expect(Math.abs(levelOf(s, volumeAt(s, h)) - h) / s.top, `${k.id} ${cap} h=${h}`).toBeLessThan(1e-9)
      }
      // clamped at both ends
      expect(levelOf(s, 0)).toBe(s.h[0])
      expect(levelOf(s, s.brim_mL * 2)).toBe(s.top)
      expect(volumeAt(s, -1)).toBe(0)
    }
  })

  it('agrees with the closed forms: cylinder exactly, sphere cap to 0.5 % (the bowl is a polygon of 18 chords)', () => {
    // measuring cylinder: V = π r² h
    const c = shapeOf('measuringCylinder', 100)
    expect(volumeAt(c, c.full / 2)).toBeCloseTo(50, 9)
    expect(Math.PI * c.r[0] * c.r[0] * c.full).toBeCloseTo(100, 9)
    // burette: 25 mL is half way up the scale
    const b = shapeOf('buretteAcid', 50)
    expect(levelOf(b, 25)).toBeCloseTo(b.full / 2, 9)
    // round flask: a cap of height h of a sphere of radius R holds π h² (3R − h) / 3; the bowl ends at 7.71 / 4 radii
    const f = shapeOf('roundFlask', 250)
    const R = (f.h[18] / 7.71) * 4.0
    const h = R * 0.8
    expect(Math.abs(volumeAt(f, h) - (Math.PI * h * h * (3 * R - h)) / 3) / volumeAt(f, h)).toBeLessThan(5e-3)
  })

  it('draws graduations where the vessel has a scale', () => {
    const cyl = graduations('measuringCylinder', 100)
    expect(cyl.filter(g => g.major).map(g => g.label)).toEqual(['20', '40', '60', '80', '100'])
    expect(cyl.length).toBe(25)
    // a burette counts down from the top: the mark at the capacity is 0, the lowest is 50
    const bur = graduations('buretteAcid', 50)
    expect(bur[0]).toMatchObject({ mL: 0, label: '50' })
    expect(bur[bur.length - 1]).toMatchObject({ mL: 50, label: '0' })
    expect(graduations('volumetricFlask', 100)).toEqual([{ mL: 100, major: true, label: null }])
    expect(graduations('testTube', 20)).toEqual([])
  })
})

describe('apparatus and the core', () => {
  it('places every vessel of the shelf in the core, at every capacity', () => {
    const b = Bench.create()
    try {
      let n = 0
      for (const k of shelfKinds()) {
        if (!k.vessel) continue
        for (const cap of k.vessel.capacities) {
          const id = `t${n++}`
          const { state } = b.apply({ act: 'place', object: vesselObject(k.id, id, cap) })
          const v = state.vessels.find(x => x.id === id)!
          expect(v.capacity_mL, k.id).toBe(cap)
          expect(v.closed, k.id).toBe(!!k.vessel.closed)
        }
      }
      expect(n).toBeGreaterThan(30)
    } finally { b.free() }
  })

  it('reads the numbers of the core to the resolution of the instrument', () => {
    const b = Bench.create()
    try {
      b.apply({ act: 'place', object: vesselObject('erlenmeyer', 'f', 250) })
      b.apply({ act: 'add', to: 'f', reagent: 'HCl_0.1M', amount: { value: 20, unit: 'mL' } })
      const v = b.state().vessels[0]
      const pH = b.read('f').pH!
      expect(instrumentReading('phMeter', v)).toEqual({ value: quantise(pH, 0.01), decimals: 2, unit: '' })
      expect(instrumentReading('phPaper', v)).toMatchObject({ value: 1, decimals: 0 })
      expect(instrumentReading('thermometer', v)).toMatchObject({ decimals: 1, unit: '°C' })
      expect(instrumentReading('thermometer', v)!.value).toBeCloseTo(25, 9)
      expect(instrumentReading('panBalance', v)!.value).toBeCloseTo(20.1, 9)
      expect(instrumentReading('eBalance', v)!.value).toBeCloseTo(Math.round(v.mass_g * 1000) / 1000, 9)
      expect(litmusState('litmusPaper', v)).toBe('red')
      // nothing to read: no solution, no circuit
      const dry = { ...v, pH: undefined } as VesselState
      expect(instrumentReading('phMeter', dry)).toBeNull()
      expect(litmusState('litmusPaper', dry)).toBeNull()
      expect(instrumentReading('voltmeter', v, null)).toBeNull()
    } finally { b.free() }
  })
})
