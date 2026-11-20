/**
 * What a mixture looks like (26.64, D267): the colour of a solution is computed from the species in it.
 *  - The core's sum (Beer–Lambert, CIE 1931, sRGB) against reference colours computed independently by
 *    scripts/chem/build_spectra.py with the tables of colour-science (tests/fixtures/chem/colour.json).
 *  - The laws: a layer twice as thick equals a solution twice as strong; clear water is white.
 *  - On the bench, with the shipped catalogue: dilution pales, ammonia turns copper sulfate deep blue,
 *    phenolphthalein turns pink past the end point and back, nitrogen dioxide colours the head space.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Bench, chemColour, chemFlame, chemSpectrum, setChemData } from '../../src/engine/chem'
import type { Amount, Rgb } from '../../src/engine/chem'

const root = join(__dirname, '..', '..')
const json = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'))
const catalog = json('src/chem/data/catalog.json') as { spectra: Record<string, number[]>; flames: Record<string, number[][]>; spectraSrc: Record<string, string> }
const reference = json('tests/fixtures/chem/colour.json') as { cases: Array<{ id: string; species: Record<string, number>; path_cm: number; absorbance: number[]; rgb: Rgb }> }

beforeAll(() => { setChemData(json('src/chem/data/aqueous.json'), catalog) })

const bench = (capacity_mL = 250, closed = false) => Bench.create({ format: 'velophi-bench', version: 1, objects: [{ id: 'v', kind: 'beaker', capacity_mL, closed }], log: [] })
const add = (b: Bench, reagent: string, value: number, unit: Amount['unit']) => b.apply({ act: 'add', to: 'v', reagent, amount: { value, unit } })
/** Saturation of a colour: 0 for grey and white, 1 for a pure hue. */
const saturation = (c: Rgb) => (Math.max(...c) - Math.min(...c)) / Math.max(1, Math.max(...c))

describe('colour of solutions', () => {
  it('every spectrum of the catalogue is read by the core and has a source note', () => {
    const ids = Object.keys(catalog.spectra)
    expect(ids.length).toBeGreaterThanOrEqual(80)
    for (const id of ids) {
      expect(chemSpectrum(id).epsilon, id).toEqual(catalog.spectra[id])
      expect(catalog.spectraSrc[id], id).toMatch(/display approximation/)
    }
    expect(chemSpectrum('Na+').epsilon).toBeNull()
  })

  it('agrees with the reference colours', () => {
    expect(reference.cases.length).toBeGreaterThanOrEqual(20)
    for (const c of reference.cases) {
      const got = chemColour(c.species, c.path_cm)
      got.absorbance.forEach((a, i) => expect(Math.abs(a - c.absorbance[i]), c.id).toBeLessThanOrEqual(1e-12 * Math.max(1, c.absorbance[i])))
      got.rgb.forEach((v, i) => expect(Math.abs(v - c.rgb[i]), `${c.id}: ${got.rgb} vs ${c.rgb}`).toBeLessThanOrEqual(1))
    }
  })

  it('follows the Beer–Lambert law', () => {
    expect(chemColour({}, 5).rgb).toEqual([255, 255, 255])
    expect(chemColour({ 'Na+': 1, 'Cl-': 1 }, 5)).toMatchObject({ rgb: [255, 255, 255], colourless: ['Cl-', 'Na+'] })
    const thick = chemColour({ 'MnO4-': 1e-4 }, 4)
    const strong = chemColour({ 'MnO4-': 4e-4 }, 1)
    thick.absorbance.forEach((a, i) => expect(a).toBeCloseTo(strong.absorbance[i], 12))
    expect(thick.rgb).toEqual(strong.rgb)
    // Absorbance is additive over the species
    const both = chemColour({ 'Cu+2': 0.1, 'CrO4-2': 1e-4 }, 2)
    const one = chemColour({ 'Cu+2': 0.1 }, 2), other = chemColour({ 'CrO4-2': 1e-4 }, 2)
    both.absorbance.forEach((a, i) => expect(a).toBeCloseTo(one.absorbance[i] + other.absorbance[i], 12))
    expect(() => chemColour({ nonsense: 1 })).toThrow()
  })

  it('names the hues of the classic ions', () => {
    const hue = (s: Record<string, number>, path = 2) => chemColour(s, path).rgb
    const [r1, g1, b1] = hue({ 'Cu+2': 0.5 })
    expect(b1).toBeGreaterThan(r1 + 60); expect(g1).toBeGreaterThan(r1)              // blue
    const [r2, g2, b2] = hue({ 'MnO4-': 2e-4 })
    expect(r2).toBeGreaterThan(g2 + 60); expect(b2).toBeGreaterThan(g2 + 60)          // purple
    const [r3, g3, b3] = hue({ 'CrO4-2': 1e-3 })
    expect(Math.min(r3, g3)).toBeGreaterThan(b3 + 60)                                  // yellow
    const [r4, g4, b4] = hue({ 'Cr2O7-2': 2e-3 })
    expect(r4).toBeGreaterThan(g4 + 20); expect(g4).toBeGreaterThan(b4 + 60)          // orange
    const [r5, g5, b5] = hue({ 'Fe(Thiocyanate)+2': 3e-4 })
    expect(r5).toBeGreaterThan(g5 + 60); expect(g5).toBeGreaterThanOrEqual(b5)        // blood red
    const [r6, g6, b6] = hue({ 'Ni+2': 0.5 })
    expect(g6).toBeGreaterThan(r6 + 40); expect(g6).toBeGreaterThan(b6)               // green
  })
})

describe('colour on the bench', () => {
  it('pales on dilution', () => {
    const b = bench(400)
    add(b, 'CuSO4_0.5M', 50, 'mL')
    const strong = b.read('v')
    expect(strong.colour).toBeDefined()
    expect(strong.absorbance).toHaveLength(16)
    add(b, 'water', 200, 'mL')
    const weak = b.read('v')
    // Five times the volume: a fifth of the absorbance at every wavelength, within the shift of the sulfate pairing
    expect(weak.absorbance![15] / strong.absorbance![15]).toBeGreaterThan(0.19)
    expect(weak.absorbance![15] / strong.absorbance![15]).toBeLessThan(0.21)
    expect(saturation(weak.colour!)).toBeLessThan(saturation(strong.colour!))
    b.free()
  })

  it('turns copper sulfate deep blue with ammonia', () => {
    const b = bench()
    add(b, 'CuSO4_0.1M', 20, 'mL')
    add(b, 'water', 60, 'mL')
    const pale = b.read('v')
    add(b, 'NH3_6M', 20, 'mL')
    const deep = b.read('v')
    const ammine = deep.species!.find(s => s.id === 'Cu(NH3)4+2')!
    expect(ammine.n).toBeGreaterThan(0.0015)
    // The tetraammine absorbs in the orange where the aqua ion barely does: the absorbance at 600 nm rises several times
    expect(deep.absorbance![10]).toBeGreaterThan(5 * pale.absorbance![10])
    const [r, g, bl] = deep.colour!
    expect(bl).toBeGreaterThan(r + 80); expect(bl).toBeGreaterThan(g + 30)
    expect(pale.colour![2] - pale.colour![0]).toBeLessThan(bl - r)
    b.free()
  })

  it('shows phenolphthalein pink only past the end point', () => {
    const b = bench()
    add(b, 'HCl_0.1M', 20, 'mL')
    add(b, 'phenolphthalein', 0.1, 'mL')
    const acid = b.read('v')
    expect(saturation(acid.colour!)).toBeLessThan(0.02)
    add(b, 'NaOH_0.1M', 19.9, 'mL')
    expect(saturation(b.read('v').colour!)).toBeLessThan(0.02)
    add(b, 'NaOH_0.1M', 0.3, 'mL')
    const base = b.read('v')
    expect(base.pH!).toBeGreaterThan(9.5)
    const [r, g, bl] = base.colour!
    expect(r).toBeGreaterThan(g + 40); expect(bl).toBeGreaterThan(g + 30)               // pink
    add(b, 'HCl_0.1M', 1, 'mL')
    expect(saturation(b.read('v').colour!)).toBeLessThan(0.02)
    b.free()
  })

  it('colours the head space with nitrogen dioxide and leaves air clear', () => {
    const b = bench(250, true)
    expect(b.read('v').gasColour).toEqual([255, 255, 255])
    add(b, 'NO2_gas', 0.002, 'mol')
    const [r, g, bl] = b.read('v').gasColour!
    expect(r).toBeGreaterThan(bl + 40); expect(g).toBeGreaterThan(bl)                     // brown
    b.free()
  })
})

describe('flame colours', () => {
  it('gives the textbook hues', () => {
    const c = (el: string) => chemFlame([el]).rgb!
    const na = c('Na'); expect(na[0]).toBe(255); expect(na[1]).toBeGreaterThan(120); expect(na[2]).toBeLessThan(80)       // yellow
    const li = c('Li'); expect(li[0]).toBe(255); expect(li[1]).toBeLessThan(60)                                           // crimson
    const ba = c('Ba'); expect(ba[1]).toBe(255); expect(ba[0]).toBeLessThan(230); expect(ba[2]).toBeLessThan(200)          // green
    const cu = c('Cu'); expect(cu[1]).toBe(255); expect(cu[2]).toBeGreaterThan(cu[0])                                     // blue-green
    const sr = c('Sr'); expect(sr[0]).toBe(255); expect(sr[1]).toBeLessThan(120)                                          // red
    const ca = c('Ca'); expect(ca[0]).toBe(255); expect(ca[1]).toBeGreaterThan(sr[1])                                     // orange-red
    const k = c('K'); expect(k[2]).toBeGreaterThan(k[1]); expect(k[0]).toBeGreaterThan(k[1])                              // lilac
    expect(chemFlame(['Mg'])).toMatchObject({ rgb: null, none: ['Mg'] })
    expect(chemFlame(['Na', 'K']).lines.map(l => l.element)).toEqual(['Na', 'Na', 'K', 'K', 'K', 'K'])
    for (const el of Object.keys(catalog.flames)) expect(chemFlame([el]).rgb, el).not.toBeNull()
  })
})
