/**
 * The encyclopedia of elements and substances (26.64, D271): from the data files to the page models.
 *  - every element and every substance gives a page model in the three languages, without an exception and without
 *    `undefined`, `NaN` or `null` in a displayed string; a missing value is `null` (shown as “无数据”), never a guess;
 *  - the periodic table places 118 elements on 118 different cells; the state read from melting and boiling point at
 *    25 °C agrees with the state the data file gives;
 *  - structures the page marks as generated are built by the core, the others are reported as unknown by it;
 *  - search finds elements and substances by symbol, formula and name in the three languages;
 *  - the address fragments, the tints' contrast, the texts of the elements.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CrystalRecord, ElementsFile, MoleculesFile } from '../../src/chem/data'
import { chemBalance, chemColour, chemFlame, setChemData } from '../../src/engine/chem'
import { crystalBuild, molShape, orbitalSample } from '../../src/engine/mol'
import type { CatalogueData, NuclideTable } from '../../src/chem/ency/model'
import { CATEGORIES, COLOUR_MODES, catalogueFormula, categoryLabel, cellOf, configLevels, elementModel, equationText, halfLifeText, isotopeRows, kelvinText, modeLabel, moleculeFormula, plain, scaleDomain, search, searchItems, speciesIdOf, stateAt, substanceIndex, substanceModel } from '../../src/chem/ency/model'
import { CATEGORY_COLOUR, RAMP, STATE_COLOUR, TINT, contrastRatio, mixSrgb, parseHex } from '../../src/chem/ency/palette'
import { encyHash, parseEncyHash } from '../../src/chem/ency/route'
import { ELEMENT_TEXT, NAME_PARTS } from '../../src/chem/ency/text'
import { locale } from '../../src/i18n/locale'
import { missing } from '../../src/i18n'

const root = join(__dirname, '..', '..')
const json = <T>(p: string) => JSON.parse(readFileSync(join(root, p), 'utf8')) as T
const elementsFile = json<ElementsFile>('src/chem/data/elements.json')
const moleculesFile = json<MoleculesFile>('src/chem/data/molecules.json')
const crystals = json<{ crystals: CrystalRecord[] }>('src/chem/data/crystals.json').crystals
const catalogue = json<CatalogueData & { flames: Record<string, unknown> }>('src/chem/data/catalog.json')
const nuclides = json<NuclideTable>('src/chem/data/nuclides.json')
const elements = elementsFile.elements
const substances = substanceIndex(moleculesFile.molecules, catalogue, crystals)
const LANGS = ['zh', 'en', 'de'] as const

beforeAll(() => { setChemData(json('src/chem/data/aqueous.json'), catalogue) })

/** Every string of a model, with the path it was found at. */
function strings(v: unknown, path = '', out: Array<[string, string]> = []): Array<[string, string]> {
  if (typeof v === 'string') out.push([path, v])
  else if (Array.isArray(v)) v.forEach((x, i) => strings(x, `${path}[${i}]`, out))
  else if (v && typeof v === 'object' && !ArrayBuffer.isView(v)) for (const [k, x] of Object.entries(v)) { if (k !== 'molecule' && k !== 'spec') strings(x, `${path}.${k}`, out) }
  return out
}
const BAD = /undefined|\bNaN(?![A-Z(])|\bnull\b|Infinity|\[object/
/** Narrow no-break spaces as plain spaces (comparisons). */
const n = (t: string | null | undefined) => (t ?? '').replace(/ /g, ' ')
function inLang<T>(lang: typeof LANGS[number], f: () => T): T { locale.lang = lang; try { return f() } finally { locale.lang = 'zh' } }

describe('periodic table', () => {
  it('places 118 elements on 118 cells of the 18-column table', () => {
    expect(elements.length).toBe(118)
    const cells = elements.map(cellOf)
    expect(new Set(cells.map(c => `${c.row}:${c.col}`)).size).toBe(118)
    for (const c of cells) { expect(c.col).toBeGreaterThanOrEqual(1); expect(c.col).toBeLessThanOrEqual(18); expect(c.row <= 7 || c.row === 9 || c.row === 10).toBe(true) }
    const at = (s: string) => cells.find(c => c.symbol === s)!
    expect([at('H').row, at('H').col, at('He').col, at('Cu').row, at('Cu').col]).toEqual([1, 1, 18, 4, 11])
    expect([at('La').row, at('La').col, at('Lu').col, at('Ac').row, at('Lr').col]).toEqual([9, 3, 17, 10, 17])
  })

  it('reads the state at 25 °C as the data file gives it, and gives none where the points are missing', () => {
    const differ = elements.filter(e => e.state !== null && stateAt(e, 298.15) !== null && stateAt(e, 298.15) !== e.state).map(e => e.symbol)
    expect(differ).toEqual([])
    const hg = elements.find(e => e.symbol === 'Hg')!, og = elements.find(e => e.symbol === 'Og')!, fe = elements.find(e => e.symbol === 'Fe')!
    expect([stateAt(hg, 200), stateAt(hg, 298.15), stateAt(hg, 700), stateAt(og, 298.15), stateAt(fe, 2000), stateAt(fe, 5000)]).toEqual(['solid', 'liquid', 'gas', null, 'liquid', 'gas'])
  })

  it('has a domain for every scale and a label for every mode and category in three languages', () => {
    for (const m of COLOUR_MODES) if (m !== 'category' && m !== 'state') { const d = scaleDomain(m, elements)!; expect(d[1]).toBeGreaterThan(d[0]) }
    for (const lang of LANGS) inLang(lang, () => {
      const labels = [...COLOUR_MODES.map(modeLabel), ...CATEGORIES.map(categoryLabel)]
      expect(new Set(labels).size).toBe(labels.length)
      if (lang !== 'zh') for (const l of labels) expect(l).not.toMatch(/[一-鿿]/)
    })
  })

  it('keeps the text of a cell readable on every tint, light and dark', () => {
    const css = readFileSync(join(root, 'src/app/tokens.css'), 'utf8')
    const token = (name: string) => [...css.matchAll(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`, 'g'))].map(m => parseHex(m[1]))
    const panes = token('--pane'), texts = token('--text'), accents = token('--accent')
    expect(panes.length).toBeGreaterThanOrEqual(2)
    let worst = Infinity
    // light: the first definitions; dark: the second
    for (const k of [0, 1]) {
      const grounds = [...Object.values(CATEGORY_COLOUR), ...Object.values(STATE_COLOUR)].map(c => mixSrgb(parseHex(c), panes[k], TINT))
      grounds.push(mixSrgb(accents[k], panes[k], RAMP[0]), mixSrgb(accents[k], panes[k], RAMP[1]), panes[k])
      for (const g of grounds) worst = Math.min(worst, contrastRatio(texts[k], g))
    }
    expect(worst).toBeGreaterThanOrEqual(4.5)
  })
})

describe('element pages', () => {
  it('builds the page of every element in three languages without holes in the text', () => {
    for (const lang of LANGS) inLang(lang, () => {
      for (const e of elements) {
        const m = elementModel(e, { sources: elementsFile.sources, crystals, nuclides, substances })
        for (const [path, s] of strings(m)) expect(BAD.test(s), `${lang} ${e.symbol} ${path}: ${s}`).toBe(false)
        expect(m.rows.length).toBeGreaterThanOrEqual(19)
        expect(m.levels.reduce((n, l) => n + l.electrons, 0)).toBe(e.z)
        expect(m.isotopes.length).toBeGreaterThan(0)
        for (const i of m.isotopes) expect(i.route).toMatch(new RegExp(`^nuclide:${e.z}-\\d+$`))
        if (lang !== 'zh') for (const r of m.rows) expect(r.label, `${lang} ${r.id}`).not.toMatch(/[一-鿿]/)
      }
    })
    expect([...missing].filter(k => /元素|物态|电离|同位素|晶|氧化态/.test(k))).toEqual([])
  })

  it('shows a missing value as null, never as a number', () => {
    const og = elementModel(elements.find(e => e.symbol === 'Og')!, { sources: elementsFile.sources, crystals, nuclides, substances })
    const row = (id: string) => og.rows.find(r => r.id === id)!
    for (const id of ['electronegativity', 'radiusAtomic', 'ionisation', 'melt', 'boil', 'density', 'crystal', 'state', 'abundance']) expect(row(id).value, id).toBeNull()
    expect(row('mass').value).toBe('[294]')
    expect(og.configurationPredicted).toBe(true)
    expect(og.structures).toEqual([])
    expect(og.blurb).toBeNull()
  })

  it('writes copper as the data give it', () => {
    const cu = elementModel(elements.find(e => e.symbol === 'Cu')!, { sources: elementsFile.sources, crystals, nuclides, substances })
    const row = (id: string) => cu.rows.find(r => r.id === id)!.value
    expect(row('mass')).toBe('63.546')
    expect(row('configuration')).toBe('[Ar] 3d¹⁰ 4s¹')
    expect(row('oxidation')).toBe('+2 (−2, 0, +1, +3, +4)')
    expect(n(row('melt'))).toBe('1357.77 K (1084.62 °C)')
    expect(n(row('density'))).toBe('8.96 g/cm³')
    expect(cu.isotopes.filter(i => i.stable).map(i => i.label)).toEqual(['⁶³Cu', '⁶⁵Cu'])
    expect(cu.isotopes.find(i => i.a === 63)!.abundance).toMatch(/^69\.15/)
    expect(cu.compounds.length).toBeGreaterThan(3)
    expect(cu.compounds.every(c => substances.some(s => s.id === c.id))).toBe(true)
    expect(cu.orbitals.map(o => o.label)).toEqual(['1s', '2s', '2p', '3s', '3p', '3d', '4s'])
    expect(cu.sources[0]).toMatch(/Wikipedia.*CC BY-SA/)
    expect(cu.sources.some(s => /NUBASE2020/.test(s))).toBe(true)
    // 3d10: five pairs; 4s1: one electron
    const levels = configLevels(elements.find(e => e.symbol === 'Cu')!)
    expect(levels.find(l => l.label === '3d')!.boxes).toEqual([2, 2, 2, 2, 2])
    expect(levels.find(l => l.label === '4s')!.boxes).toEqual([1])
    expect(configLevels(elements.find(e => e.symbol === 'N')!).find(l => l.label === '2p')!.boxes).toEqual([1, 1, 1])
    expect(configLevels(elements.find(e => e.symbol === 'O')!).find(l => l.label === '2p')!.boxes).toEqual([2, 1, 1])
  })

  it('hands the core structures it can build where it says so, and unknown ones where it says that', () => {
    let generated = 0, unmodelled = 0
    for (const e of elements) {
      const m = elementModel(e, { crystals })
      for (const s of m.structures) {
        const b = crystalBuild(s.spec, { n: [2, 2, 2] })
        expect(b.ok, `${e.symbol} ${s.id}`).toBe(s.generated)
        if (s.generated) generated++; else { unmodelled++; expect(s.note).not.toBe('') }
      }
    }
    expect(generated).toBeGreaterThanOrEqual(60)
    expect(unmodelled).toBeGreaterThan(0)
    // every subshell a page offers is one the core samples
    for (const [n, l] of [[1, 0], [2, 1], [3, 2], [4, 3]]) for (let m = -l; m <= l; m++) expect(orbitalSample(n, l, m, { count: 16 }).key).toBeTruthy()
  })

  it('has lines for fourteen elements, flames from the core, and half-lives in readable units', () => {
    const withLines = elements.filter(e => e.emissionLines?.length).map(e => e.symbol)
    expect(withLines.length).toBe(14)
    expect(elementModel(elements.find(e => e.symbol === 'Na')!).lines).toEqual([589, 589.6])
    expect(elementModel(elements.find(e => e.symbol === 'Fe')!).lines).toBeNull()
    for (const s of Object.keys(catalogue.flames)) expect(chemFlame([s]).rgb, s).not.toBeNull()
    expect(chemFlame(['Fe']).rgb).toBeNull()
    expect(halfLifeText(31556926 * 5730)).toMatch(/a$/)
    expect(n(halfLifeText(609.8))).toBe('10.2 min')
    expect(halfLifeText(1.39e-22)).toMatch(/s$/)
    const u = isotopeRows(elements.find(e => e.symbol === 'U')!, nuclides)
    expect(u.map(i => i.a)).toEqual(expect.arrayContaining([234, 235, 238]))
    expect(u.find(i => i.a === 238)!.mode).toBe('α')
    expect(u.every(i => !i.stable && i.halfLife !== null)).toBe(true)
    expect(isotopeRows(elements.find(e => e.symbol === 'U')!, null).length).toBeGreaterThan(0)
  })

  it('has a text for the first 36 elements and 16 more, in three languages, without numbers', () => {
    const first36 = elements.filter(e => e.z <= 36).map(e => e.symbol)
    for (const s of first36) expect(ELEMENT_TEXT[s], s).toBeDefined()
    expect(Object.keys(ELEMENT_TEXT).length).toBe(52)
    for (const [s, t] of Object.entries(ELEMENT_TEXT)) {
      expect(elements.some(e => e.symbol === s), s).toBe(true)
      for (const lang of LANGS) expect(t[lang].length, `${s} ${lang}`).toBeGreaterThan(lang === 'zh' ? 25 : 60)
      expect(t.en + t.de, s).not.toMatch(/[一-鿿]/)
      // a number in a text could disagree with the data file ("B12" is a name)
      expect((t.zh + t.en + t.de).replace(/B12/g, ''), s).not.toMatch(/\d/)
    }
    expect(Object.keys(NAME_PARTS).length).toBe(14)
    for (const s of Object.keys(NAME_PARTS)) expect(elements.find(e => e.symbol === s)!.z).toBeGreaterThanOrEqual(104)
  })
})

describe('substance pages', () => {
  it('indexes every molecule and every catalogue substance once', () => {
    expect(substances.length).toBeGreaterThanOrEqual(535)
    expect(new Set(substances.map(s => s.id)).size).toBe(substances.length)
    expect(substances.filter(s => s.molecule).length).toBe(moleculesFile.molecules.length)
    const forms = substances.flatMap(s => s.forms.map(f => f.id))
    expect(new Set(forms).size).toBe(forms.length)
    expect(forms.length).toBe(catalogue.substances!.length)
    // ethanol the molecule carries the liquid of the catalogue; isomers sharing a formula are not merged by formula
    expect(substances.find(s => s.id === 'ethanol')!.forms.map(f => f.id)).toContain('C2H5OH(l)')
    expect(substances.find(s => s.id === 'water')!.species).toContain('H2O')
  })

  it('builds the page of every substance in three languages without holes in the text', () => {
    const mass = (m: Parameters<typeof molShape>[0]) => molShape(m).mass
    for (const lang of LANGS) inLang(lang, () => {
      for (const s of substances) {
        const m = substanceModel(s, { catalogue, categories: moleculesFile.categories, references: moleculesFile.references, elements, molarMass: lang === 'zh' ? mass : () => 1 })
        for (const [path, text] of strings(m)) expect(BAD.test(text), `${lang} ${s.id} ${path}: ${text}`).toBe(false)
        expect(m.title, s.id).not.toBe('')
        expect(m.formula, s.id).not.toBe('')
        if (lang === 'zh') expect(n(m.molarMass), s.id).toMatch(/^\d[\d.,]* g\/mol$/)
        if (s.molecule) expect(m.methodText).toBeTruthy()
        for (const f of m.forms) for (const r of f.rows) if (lang !== 'zh') expect(r.label).not.toMatch(/[一-鿿]/)
      }
    })
  })

  it('says how a geometry was obtained (D273)', () => {
    const page = (id: string) => substanceModel(substances.find(s => s.id === id)!, { catalogue, references: moleculesFile.references })
    const v = moleculesFile.molecules.find(m => m.method === 'vsepr')!, l = moleculesFile.molecules.find(m => m.method === 'literature')!, r = moleculesFile.molecules.find(m => m.method === 'rdkit-etkdg-mmff')!
    expect(page(v.id).methodText).toMatch(/只表示形状/)
    expect(page(l.id).methodText).toMatch(/实测/)
    expect(page(l.id).references.length).toBeGreaterThan(0)
    expect(page(r.id).methodText).toMatch(/不是实测结构/)
  })

  it('shows copper sulfate with its solubility, its solution colour, its reagents and its reactions', () => {
    const entry = substances.find(s => s.id === 'Chalcanthite')!
    const m = substanceModel(entry, { catalogue, elements })
    expect(m.formula).toBe('CuSO₄·5H₂O')
    expect(n(m.molarMass)).toBe('249.677 g/mol')
    expect(m.forms[0].solubility!.length).toBeGreaterThan(5)
    expect(Object.keys(m.colourSpecies!)).toContain('Cu+2')
    const c = chemColour(m.colourSpecies!, 1).rgb
    expect(c[2]).toBeGreaterThan(c[0])
    expect(m.reagents.some(r => r.id === 'CuSO4_0.1M')).toBe(true)
    expect(m.reactions.find(r => r.id === 'Zn_Cu2')!.equation).toBe('Zn + Cu²⁺ → Zn²⁺ + Cu')
    expect(m.reactions.find(r => r.id === 'Zn_Cu2')!.viaIons).toBe(true)
    expect(m.elements.map(e => e.symbol).sort()).toEqual(['Cu', 'H', 'O', 'S'])
    // every reagent a page offers is one of the shelf
    const shelf = new Set(catalogue.reagents!.map(r => r.id))
    for (const s of substances) for (const r of substanceModel(s, { catalogue }).reagents) expect(shelf.has(r.id)).toBe(true)
  })

  it('writes the equations as the catalogue balances them', () => {
    let checked = 0
    for (const r of catalogue.reactions!) {
      if (!r.eq) continue
      const text = equationText(r.eq, catalogue)
      expect(text, r.id).toMatch(/ → /)
      expect(BAD.test(text), r.id).toBe(false)
      checked++
    }
    expect(checked).toBeGreaterThan(150)
    expect(equationText({ 'K(s)': -2, 'H+': -2, 'K+': 2, H2: 1 }, catalogue)).toBe('2 K + 2 H⁺ → 2 K⁺ + H₂')
    // the core agrees that the coefficients of that one balance
    expect(chemBalance(['Zn', 'Cu+2'], ['Zn+2', 'Cu'])).toMatchObject({ balanced: true })
  })

  it('typesets formulas and network ids', () => {
    expect([moleculeFormula('SO4^2-'), moleculeFormula('[Cu(NH3)4]^2+'), moleculeFormula('OH^-'), moleculeFormula('C2H5OH')]).toEqual(['SO₄²⁻', '[Cu(NH₃)₄]²⁺', 'OH⁻', 'C₂H₅OH'])
    expect([speciesIdOf('SO4^2-'), speciesIdOf('[Cu(NH3)4]^2+'), speciesIdOf('OH^-'), speciesIdOf('H2O')]).toEqual(['SO4-2', 'Cu(NH3)4+2', 'OH-', 'H2O'])
    expect([catalogueFormula('Cu+2'), catalogueFormula('CuSO4:3H2O(s)'), catalogueFormula('MnO4-')]).toEqual(['Cu²⁺', 'CuSO₄·3H₂O', 'MnO₄⁻'])
    expect([plain(-1.5), plain(null), plain(NaN), n(kelvinText(273.15)), kelvinText(null)]).toEqual(['−1.5', null, null, '273.15 K (0.00 °C)', null])
  })
})

describe('search and links', () => {
  it('finds elements and substances by symbol, formula and name in three languages', () => {
    const items = searchItems(elements, substances)
    expect(items.length).toBe(118 + substances.length)
    const first = (q: string) => { const r = search(items, q)[0]; return r ? `${r.kind}:${r.id}` : null }
    expect(first('Cu')).toBe('element:Cu')
    expect(first('铜')).toBe('element:Cu')
    expect(first('Kupfer')).toBe('element:Cu')
    expect(first('copper')).toBe('element:Cu')
    expect(first('29')).toBe('element:Cu')
    expect(first('H2O')).toBe('substance:water')
    expect(first('h₂o')).toBe('substance:water')
    expect(first('乙醇')).toBe('substance:ethanol')
    expect(first('Ethanol')).toBe('substance:ethanol')
    expect(first('Schwefelsäure')).toBe('substance:sulfuric-acid')
    expect(search(items, 'zzzz')).toEqual([])
    expect(search(items, '   ')).toEqual([])
    expect(search(items, 'a', 5).length).toBe(5)
  })

  it('reads and writes the address fragments', () => {
    expect(parseEncyHash('#e=Cu')).toEqual({ kind: 'element', symbol: 'Cu' })
    expect(parseEncyHash('#e')).toEqual({ kind: 'table' })
    expect(parseEncyHash('#m=ethanol')).toEqual({ kind: 'substance', id: 'ethanol' })
    expect(parseEncyHash('#b=abc')).toBeNull()
    expect(parseEncyHash('#e=<script>')).toBeNull()
    expect(parseEncyHash('#m=%E0%A4%A')).toBeNull()
    expect(parseEncyHash('')).toBeNull()
    for (const s of substances) expect(parseEncyHash(encyHash({ kind: 'substance', id: s.id })), s.id).toEqual({ kind: 'substance', id: s.id })
    for (const e of elements) expect(parseEncyHash(encyHash({ kind: 'element', symbol: e.symbol }))).toEqual({ kind: 'element', symbol: e.symbol })
  })
})
