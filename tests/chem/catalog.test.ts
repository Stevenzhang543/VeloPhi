/**
 * The shipped chemistry catalogue (26.64, D260, D262, D263; engine/CHEM.md, "Data files"): the checks of
 * scripts/chem/build_catalog.py made again on src/chem/data/catalog.json, independently of the builder, plus spot
 * values against textbook constants. The catalogue is data typed from handbooks; what a test can establish is that it
 * is whole and consistent: every id resolves, every dissolution and recipe balances, molar masses follow from the
 * formulas, names exist in three languages, a labelled molarity is what recipe and density give. Tolerances are stated
 * where a number is compared. How the catalogue behaves in the core is tested in catalogEngine.test.ts.
 */
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', '..')
const text = (p: string) => readFileSync(join(root, p), 'utf8')
const json = (p: string) => JSON.parse(text(p))

type Amounts = Record<string, number>
type Name = { zh: string; en: string; de: string }
interface NetSpecies { id: string; phase: 'aq' | 's' | 'g'; z?: number; comp: Amounts; M: number; component?: boolean; rxn?: Amounts }
interface Substance {
  id: string; overlay?: boolean; formula?: string; comp: Amounts; phase: string; M: number
  Hf?: number | null; S?: number | null; cp?: number | null; src?: string | null; entry?: string | null; nasa?: string
  rho?: number | null; Tm?: number | null; Tb?: number | null; Hfus?: number | null; Hvap?: number | null; Tign?: number | null; antoine?: number[]
  dissolves?: Amounts; solubility?: { points: [number, number][]; src: string; entry: string; shape?: string }; Hsol?: number
  extracts?: Amounts; crystallises?: string
}
interface Reagent { id: string; name: Name; group: string; kind: string; label: string; recipe: { water_kg?: number; species: Amounts }; rho?: number | null; form?: string; hazard: string[]; beyondModel?: boolean; rhoEst?: boolean }
interface Display { f: string; name: Name; color?: number[]; texture?: string }
interface Catalog {
  format: string; version: number; generator: { inputs: Record<string, string> }; counts: Record<string, unknown>
  substances: Substance[]; thermo: { Hf: Record<string, number | null>; src: Record<string, string>; entry: Record<string, string> }
  forms: Record<string, number | string[]>; display: Record<string, Display>; reagents: Reagent[]
  pending: Array<{ section: string; id: string; missing: string[] }>
  reactions: Array<{ id: string; eq?: Amounts; between?: string[] }>; couples: Array<{ id: string; ox: Amounts; red: Amounts; bench?: boolean }>; dissolution: Record<string, unknown>
}

const cat = json('src/chem/data/catalog.json') as Catalog
const net = json('src/chem/data/aqueous.json') as { components: string[]; species: NetSpecies[] }
const weights = new Map<string, number>((json('src/chem/data/elements.json').elements as Array<{ symbol: string; mass: number }>).map(e => [e.symbol, e.mass]))
const experiments = json('tests/fixtures/chem/catalog-experiments.json').experiments as Array<{ id: string; reagents: string[] }>

const LANGS = ['zh', 'en', 'de'] as const
const GROUPS = ['acid', 'base', 'saltSolution', 'solidSalt', 'metal', 'oxide', 'nonmetal', 'indicator', 'organic', 'gas', 'solvent']
const HAZARDS = ['corrosive', 'toxic', 'flammable', 'oxidiser', 'irritant', 'environment']
const TEXTURES = ['powder', 'crystal', 'floc', 'gel', 'metal', 'liquid']

const network = new Map(net.species.map(s => [s.id, s]))
const own = cat.substances.filter(s => !s.overlay)
const overlays = cat.substances.filter(s => s.overlay)
const substance = new Map(own.map(s => [s.id, s]))
const known = (id: string) => network.has(id) || substance.has(id)
const compOf = (id: string): Amounts => network.get(id)?.comp ?? substance.get(id)!.comp
const chargeOf = (id: string) => network.get(id)?.z ?? 0
const massOf = (id: string) => network.get(id)?.M ?? substance.get(id)!.M
const reagent = new Map(cat.reagents.map(r => [r.id, r]))
const sub = (id: string) => cat.substances.find(s => s.id === id)!

/** Composition of a neutral formula with brackets and a `:` part for water of crystallisation (`CaSO4:0.5H2O`). */
function parseFormula(formula: string): Amounts {
  const out: Amounts = {}
  formula.split(':').forEach((part, i) => {
    let times = 1
    const lead = i > 0 ? /^(\d+(?:\.\d+)?)(?=[A-Z([])/.exec(part) : null
    if (lead) { times = Number(lead[1]); part = part.slice(lead[0].length) }
    const stack: Amounts[] = [{}]
    let last: Amounts | null = null
    const add = (into: Amounts, group: Amounts, n: number) => { for (const [k, v] of Object.entries(group)) into[k] = (into[k] ?? 0) + v * n }
    for (const m of part.matchAll(/([A-Z][a-z]?)|(\d+(?:\.\d+)?)|([()[\]])/g)) {
      if (m[1]) { last = { [m[1]]: 1 }; add(stack[stack.length - 1], last, 1) }
      else if (m[2]) { add(stack[stack.length - 1], last!, Number(m[2]) - 1); last = null }
      else if (m[3] === '(' || m[3] === '[') { stack.push({}); last = null }
      else { last = stack.pop()!; add(stack[stack.length - 1], last, 1) }
    }
    expect(stack.length, formula).toBe(1)
    add(out, stack[0], times)
  })
  return out
}

/** Σ ν·comp and Σ ν·z of a list of species; elements with a zero total are dropped. */
function total(parts: Amounts): { comp: Amounts; z: number } {
  const comp: Amounts = {}
  let z = 0
  for (const [id, nu] of Object.entries(parts)) {
    for (const [el, n] of Object.entries(compOf(id))) comp[el] = (comp[el] ?? 0) + nu * n
    z += nu * chargeOf(id)
  }
  for (const k of Object.keys(comp)) if (Math.abs(comp[k]) < 1e-6) delete comp[k]
  return { comp, z }
}

function sameComp(a: Amounts, b: Amounts): boolean {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].every(k => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) < 1e-6)
}

function duplicates(keys: string[]): string[] {
  const seen = new Set<string>()
  return keys.filter(k => seen.has(k) || !seen.add(k))
}

describe('catalogue: shape and counts', () => {
  it('is a velophi-chemcat 1 document with every section', () => {
    expect(cat.format).toBe('velophi-chemcat')
    expect(cat.version).toBe(1)
    for (const key of ['substances', 'thermo', 'forms', 'display', 'reagents', 'pending', 'reactions', 'couples', 'dissolution', 'spectra', 'flames']) expect(cat, key).toHaveProperty(key)
  })

  it('reaches the counts of D260', () => {
    expect(own.length).toBeGreaterThanOrEqual(150)
    expect(cat.reagents.length).toBeGreaterThanOrEqual(200)
    // engine species: the network plus the substances
    expect(net.species.length + own.length).toBeGreaterThanOrEqual(600)
    expect(cat.counts.substances).toBe(own.length)
    expect(cat.counts.reagents).toBe(cat.reagents.length)
    for (const g of GROUPS) expect(cat.reagents.some(r => r.group === g), g).toBe(true)
  })

  it('was built from the section files and the network on disk', () => {
    // a section or the network changed without `python -I scripts/chem/build_catalog.py`: the catalogue is stale
    const stale: string[] = []
    for (const [name, hash] of Object.entries(cat.generator.inputs)) {
      const path = name.startsWith('catalog/') ? 'scripts/chem/' + name : 'src/chem/data/' + name
      if (createHash('sha256').update(readFileSync(join(root, path))).digest('hex') !== hash) stale.push(name)
    }
    expect(stale).toEqual([])
  })

  it('is written with LF line ends and ends with a newline', () => {
    const raw = text('src/chem/data/catalog.json')
    expect(raw.includes('\r')).toBe(false)
    expect(raw.endsWith('}\n')).toBe(true)
  })
})

describe('catalogue: substances', () => {
  it('have unique ids outside the network, a phase, and the molar mass of their formula', () => {
    expect(duplicates(cat.substances.map(s => s.id))).toEqual([])
    for (const s of own) {
      expect(network.has(s.id), s.id).toBe(false)
      expect(['s', 'l', 'g', 'aq'], s.id).toContain(s.phase)
      const comp = parseFormula(s.formula!)
      expect(sameComp(comp, s.comp), s.id).toBe(true)
      const M = Object.entries(comp).reduce((sum, [el, n]) => sum + weights.get(el)! * n, 0)
      // rounded to 0.001 g/mol in the catalogue
      expect(Math.abs(M - s.M), s.id).toBeLessThan(0.001)
    }
  })

  it('never repeat the composition and phase of a network species', () => {
    const clash: string[] = []
    for (const s of own) for (const n of net.species) if (n.phase === s.phase && (n.z ?? 0) === 0 && sameComp(n.comp, s.comp)) clash.push(`${s.id} = ${n.id}`)
    expect(clash).toEqual([])
  })

  it('overlay records belong to solids of the network and carry what dissolves', () => {
    for (const s of overlays) {
      expect(network.get(s.id)?.phase, s.id).toBe('s')
      expect(s.dissolves, s.id).toBeTruthy()
      expect(s.M, s.id).toBe(network.get(s.id)!.M)
    }
  })

  it('dissolve into known species, balanced in elements and charge', () => {
    for (const s of cat.substances) {
      if (!s.dissolves) continue
      expect(Object.keys(s.dissolves).filter(id => !known(id)), s.id).toEqual([])
      const t = total(s.dissolves)
      expect(sameComp(t.comp, s.overlay ? network.get(s.id)!.comp : s.comp), s.id).toBe(true)
      expect(Math.abs(t.z), s.id).toBeLessThan(1e-9)
    }
  })

  it('name known species in extracts and crystallises', () => {
    const tables = new Set(cat.substances.filter(s => s.solubility).map(s => s.id))
    for (const s of cat.substances) {
      for (const id of Object.keys(s.extracts ?? {})) expect(known(id), `${s.id} extracts ${id}`).toBe(true)
      if (s.crystallises) expect(tables.has(s.crystallises) || network.get(s.crystallises)?.phase === 's', `${s.id} → ${s.crystallises}`).toBe(true)
    }
  })

  it('have solubility tables ordered in temperature and shaped as declared', () => {
    let tables = 0
    for (const s of cat.substances) {
      if (!s.solubility) continue
      tables++
      const p = s.solubility.points
      expect(s.dissolves, s.id).toBeTruthy()
      expect(s.solubility.entry, s.id).toBe('hand')
      expect(p.every(q => q[0] >= 273.15 && q[0] <= 373.15 && q[1] > 0), s.id).toBe(true)
      expect(p.every((q, i) => i === 0 || q[0] > p[i - 1][0]), s.id).toBe(true)
      const v = p.map(q => q[1])
      const rising = (a: number[]) => a.every((x, i) => i === 0 || x >= a[i - 1])
      const falling = (a: number[]) => a.every((x, i) => i === 0 || x <= a[i - 1])
      // a real maximum (sodium sulfate, sodium carbonate, the vitriols) or retrograde solubility (calcium hydroxide)
      // is declared; everything else rises with temperature
      if (s.solubility.shape === 'max') {
        const peak = v.indexOf(Math.max(...v))
        expect(peak > 0 && peak < v.length - 1 && rising(v.slice(0, peak + 1)) && falling(v.slice(peak)), s.id).toBe(true)
      } else if (s.solubility.shape === 'decreasing') expect(falling(v), s.id).toBe(true)
      else expect(rising(v), s.id).toBe(true)
    }
    expect(tables).toBeGreaterThanOrEqual(60)
    expect(sub('Thenardite').solubility!.shape).toBe('max')
    expect(sub('Portlandite').solubility!.shape).toBe('decreasing')
  })

  it('mark where every thermodynamic value comes from', () => {
    for (const s of own) {
      const given = [s.Hf, s.S, s.cp].some(v => v !== null && v !== undefined)
      if (s.nasa) {
        expect(s.src, s.id).toBe('NASA Glenn via Cantera')
        expect(s.entry, s.id).toBe('file')
        expect(typeof s.Hf, s.id).toBe('number')
      } else if (given) {
        expect(['CODATA', 'NBS', 'CRC'], s.id).toContain(s.src)
        expect(s.entry, s.id).toBe('hand')
      } else expect(s.src ?? null, s.id).toBeNull()
    }
  })

  it('carry plausible physical constants', () => {
    for (const s of cat.substances) {
      if (s.rho != null) expect(s.rho > 0.00005 && s.rho < 23, s.id).toBe(true)
      if (s.Tm != null && s.Tb != null) expect(s.Tm < s.Tb, s.id).toBe(true)
      if (s.antoine) {
        expect(s.antoine.length, s.id).toBe(5)
        // the fit reproduces the normal boiling point: 1.01325 bar at Tb within 1 % (a wrong digit in A, B or C shows
        // at once: 1 % of pressure is about 0.3 K)
        const [A, B, C, lo, hi] = s.antoine
        expect(lo < hi && s.Tb != null && s.Tb >= lo - 2 && s.Tb <= hi + 2, s.id).toBe(true)
        expect(Math.abs(10 ** (A - B / (s.Tb! + C)) / 1.01325 - 1), s.id).toBeLessThan(0.01)
      }
    }
  })

  it('stock neither mercury nor white phosphorus', () => {
    expect(cat.substances.filter(s => 'Hg' in s.comp).map(s => s.id)).toEqual([])
    expect(cat.reagents.filter(r => Object.keys(r.recipe.species).some(id => 'Hg' in compOf(id))).map(r => r.id)).toEqual([])
    // P(s) is red phosphorus: its enthalpy of formation is not the zero of the white reference form
    expect(substance.get('P(s)')!.Hf).toBeLessThan(0)
  })
})

describe('catalogue: enthalpies of formation', () => {
  it('have a row for every component of the network and only for network species', () => {
    expect(net.components.filter(c => !(c in cat.thermo.Hf))).toEqual([])
    expect(Object.keys(cat.thermo.Hf).filter(id => !network.has(id))).toEqual([])
  })

  it('name the source of every value', () => {
    for (const [id, v] of Object.entries(cat.thermo.Hf)) {
      if (v === null) continue
      expect(['hand', 'derived'], id).toContain(cat.thermo.entry[id])
      expect(cat.thermo.src[id], id).toBeTruthy()
    }
    expect(Object.values(cat.thermo.Hf).filter(v => v !== null).length).toBeGreaterThanOrEqual(60)
  })

  it('agree with the CODATA key values', () => {
    // CODATA Key Values for Thermodynamics (1989), kJ/mol; the catalogue stores them unrounded, tolerance 0.01
    const codata: Record<string, number> = { 'H2O': -285.83, 'H+': 0, 'OH-': -230.015, 'Na+': -240.34, 'K+': -252.14, 'Cl-': -167.08, 'Ca+2': -543.0, 'Mg+2': -467.0, 'Zn+2': -153.39, 'Cu+2': 64.9, 'Ag+': 105.79, 'SO4-2': -909.34, 'CO3-2': -675.23, 'NO3-': -206.85, 'NH4+': -133.26, 'CO2(g)': -393.51, 'H2O(g)': -241.826 }
    for (const [id, v] of Object.entries(codata)) expect(Math.abs((cat.thermo.Hf[id] as number) - v), id).toBeLessThan(0.01)
    // the three values the brief names, as textbooks round them
    expect((cat.thermo.Hf['H2O'] as number).toFixed(2)).toBe('-285.83')
    expect((cat.thermo.Hf['OH-'] as number).toFixed(1)).toBe('-230.0')
    expect((cat.thermo.Hf['Na+'] as number).toFixed(1)).toBe('-240.3')
  })

  it('give the heat of neutralisation and of dissolving sodium hydroxide', () => {
    const H = cat.thermo.Hf as Record<string, number>
    // H+ + OH- → H2O: −55.8 kJ/mol (textbook −57.3 at finite concentration; CODATA at infinite dilution −55.815)
    expect(H['H2O'] - H['H+'] - H['OH-']).toBeCloseTo(-55.815, 2)
    // NaOH(s) → Na+ + OH-: −44.5 kJ/mol (CRC enthalpy of solution −44.51), tolerance 0.5
    expect(Math.abs(H['Na+'] + H['OH-'] - substance.get('NaOH(s)')!.Hf! + 44.5)).toBeLessThan(0.5)
    // KNO3(s) → K+ + NO3-: +34.9 kJ/mol, tolerance 1
    expect(Math.abs(H['K+'] + H['NO3-'] - substance.get('KNO3(s)')!.Hf! - 34.9)).toBeLessThan(1)
  })
})

describe('catalogue: forms and precipitates', () => {
  const precipitates = cat.forms.precipitates as string[]

  it('give the specific area of each form from its dimensions', () => {
    // m² per cm³: 50 µm spheres 6/d, 3 mm spheres, 1 cm cubes, a 0.2 mm × 3 mm ribbon 2(w + t)/(w·t), 0.1 mm foil 2/t
    const expected: Record<string, number> = { powder: 0.12, granule: 0.002, chip: 0.0006, ribbon: 2 * 3.2 / 0.6 * 1e-3, foil: 0.02, lump: 0.0002, wire: 0.008 }
    for (const [form, area] of Object.entries(expected)) expect(Math.abs((cat.forms[form] as number) / area - 1), form).toBeLessThan(1e-5)
  })

  it('list only solids of the network, each once, and agree with the review of all solids', () => {
    expect(duplicates(precipitates)).toEqual([])
    expect(precipitates.filter(id => network.get(id)?.phase !== 's')).toEqual([])
    const rows = text('scripts/chem/catalog/solids_review.tsv').split('\n').filter(l => l && !l.startsWith('#') && !l.startsWith('id\t')).map(l => l.split('\t'))
    const solids = net.species.filter(s => s.phase === 's').map(s => s.id)
    expect(solids.filter(id => !rows.some(r => r[0] === id))).toEqual([])
    expect(rows.every(r => r.length === 4 && ['precipitate', 'reagent-only', 'mineral'].includes(r[1]) && r[3].length > 0)).toBe(true)
    expect(rows.filter(r => r[1] === 'precipitate').map(r => r[0]).sort()).toEqual([...precipitates].sort())
  })

  it('take the fresh phase of each family, never the geological one', () => {
    for (const id of ['Fe(OH)3(a)', 'Al(OH)3(a)', 'Calcite', 'SiO2(a)', 'Cu(OH)2(s)', 'Brucite', 'Portlandite', 'Barite', 'Gypsum', 'Cerargyrite', 'Bromyrite', 'Iodyrite', 'Ag2CrO4', 'Ag2O', 'PbI2(s)', 'Cotunnite', 'Anglesite', 'PbCrO4', 'Witherite', 'BaCrO4', 'BaSO3', 'Whewellite', 'Fluorite', 'Malachite', 'AgSCN', 'Fe(OH)2(s)', 'Covellite']) expect(precipitates, id).toContain(id)
    for (const id of ['Hematite', 'Goethite', 'Gibbsite', 'Quartz', 'Chalcedony', 'Tenorite', 'Aragonite', 'Dolomite', 'Hydroxyapatite', 'Anhydrite']) expect(precipitates, id).not.toContain(id)
  })
})

describe('catalogue: display', () => {
  it('covers the components, the bench solids, the gases and every substance', () => {
    const rows = text('scripts/chem/catalog/solids_review.tsv').split('\n').map(l => l.split('\t'))
    const bench = rows.filter(r => r[1] === 'precipitate' || r[1] === 'reagent-only').map(r => r[0])
    const wanted = [...net.components, ...bench, ...net.species.filter(s => s.phase === 'g').map(s => s.id), ...own.map(s => s.id)]
    expect(wanted.filter(id => !(id in cat.display))).toEqual([])
    expect(Object.keys(cat.display).filter(id => !known(id))).toEqual([])
  })

  it('has a formula, three names, and colour and texture for solids and liquids', () => {
    for (const [id, d] of Object.entries(cat.display)) {
      expect(d.f.length, id).toBeGreaterThan(0)
      for (const l of LANGS) expect(d.name[l]?.trim().length, `${id} ${l}`).toBeGreaterThan(0)
      const phase = network.get(id)?.phase ?? substance.get(id)!.phase
      if (phase === 's' || phase === 'l') {
        expect(d.color?.length === 3 && d.color.every(c => Number.isInteger(c) && c >= 0 && c <= 255), id).toBe(true)
        expect(TEXTURES, id).toContain(d.texture)
      }
    }
  })

  it('uses a name once per language', () => {
    for (const l of LANGS) expect(duplicates(Object.values(cat.display).map(d => d.name[l])), l).toEqual([])
  })

  it('writes formulas with Unicode subscripts and superscripts', () => {
    expect(cat.display['Cu(NH3)4+2'].f).toBe('[Cu(NH₃)₄]²⁺')
    expect(cat.display['Acetate-'].f).toBe('CH₃COO⁻')
    expect(cat.display['Oxalate-2'].f).toBe('C₂O₄²⁻')
    expect(cat.display['Thiocyanate-'].f).toBe('SCN⁻')
    expect(cat.display['Ferricyanide-3'].f).toBe('[Fe(CN)₆]³⁻')
    expect(cat.display['Cerargyrite']).toMatchObject({ f: 'AgCl', name: { zh: '氯化银', en: 'silver chloride', de: 'Silberchlorid' } })
    expect(cat.display['Chalcanthite'].name).toEqual({ zh: '五水合硫酸铜', en: 'copper(II) sulfate pentahydrate', de: 'Kupfer(II)-sulfat-Pentahydrat' })
    // no ASCII digit is left in a formula of a plain ion or solid
    expect(Object.entries(cat.display).filter(([id, d]) => network.has(id) && /[A-Za-z)\]]\d/.test(d.f)).map(e => e[0])).toEqual([])
  })
})

describe('catalogue: reagents', () => {
  it('have stable readable ids, a group, a kind, hazard keys and three names', () => {
    expect(duplicates(cat.reagents.map(r => r.id))).toEqual([])
    for (const r of cat.reagents) {
      expect(r.id, r.id).toMatch(/^[A-Za-z0-9][A-Za-z0-9_.]*$/)
      expect(GROUPS, r.id).toContain(r.group)
      expect(['solution', 'solid', 'liquid', 'gas'], r.id).toContain(r.kind)
      expect(r.hazard.filter(h => !HAZARDS.includes(h)), r.id).toEqual([])
      expect(r.label.length, r.id).toBeGreaterThan(0)
      for (const l of LANGS) expect(r.name[l]?.trim().length, `${r.id} ${l}`).toBeGreaterThan(0)
    }
    for (const l of LANGS) expect(duplicates(cat.reagents.map(r => `${r.name[l]} | ${r.label}`)), l).toEqual([])
  })

  it('have recipes of known species; solutions are neutral and per kilogram of water', () => {
    for (const r of cat.reagents) {
      const ids = Object.keys(r.recipe.species)
      expect(ids.filter(id => !known(id)), r.id).toEqual([])
      expect(Object.values(r.recipe.species).every(n => n > 0), r.id).toBe(true)
      if (r.kind === 'solution') {
        expect(r.recipe.water_kg, r.id).toBe(1)
        const z = ids.reduce((sum, id) => sum + r.recipe.species[id] * chargeOf(id), 0)
        expect(Math.abs(z), r.id).toBeLessThan(1e-9 * Math.max(1, ...Object.values(r.recipe.species)))
        expect(r.rho === null || (r.rho! > 0.7 && r.rho! < 1.9), r.id).toBe(true)
      } else {
        expect(r.recipe.water_kg, r.id).toBeUndefined()
        expect(ids.length, r.id).toBeGreaterThan(0)
      }
      if (r.kind === 'solid') expect(typeof cat.forms[r.form!], r.id).toBe('number')
      if (r.kind === 'gas') for (const id of ids) expect(network.get(id)?.phase ?? substance.get(id)!.phase, r.id).toBe('g')
    }
  })

  it('hold exactly the labelled moles per litre', () => {
    // (1000 + Σ n·M)/rho mL of the recipe contain c·(a small whole number) mol of each ion of the solute
    let checked = 0
    for (const r of cat.reagents) {
      const m = /^(\d+(?:\.\d+)?) mol\/L$/.exec(r.label)
      if (!m || r.kind !== 'solution') continue
      const c = Number(m[1])
      const grams = 1000 + Object.entries(r.recipe.species).reduce((sum, [id, n]) => sum + n * massOf(id), 0)
      const ratios = Object.values(r.recipe.species).map(n => n * r.rho! * 1000 / grams / c)
      for (const q of ratios) expect(q > 0.5 && Math.abs(q - Math.round(q)) < 1e-6, `${r.id}: ${q}`).toBe(true)
      checked++
    }
    expect(checked).toBeGreaterThanOrEqual(100)
  })

  it('carry the real mass fractions of the concentrated acids and bases', () => {
    const fraction = (id: string) => {
      const r = reagent.get(id)!
      const solute = Object.entries(r.recipe.species).reduce((sum, [s, n]) => sum + n * massOf(s), 0)
      return solute / (1000 + solute)
    }
    // tolerance 1e-6: the recipe is computed from the fraction
    for (const [id, w, rho] of [['HCl_conc', 0.37, 1.184], ['HNO3_conc', 0.68, 1.405], ['H2SO4_conc', 0.98, 1.836], ['NH3_conc', 0.25, 0.907], ['NH3_28pct', 0.28, 0.898], ['NaOH_40pct', 0.40, 1.43]] as Array<[string, number, number]>) {
      expect(Math.abs(fraction(id) - w), id).toBeLessThan(1e-6)
      expect(reagent.get(id)!.rho, id).toBe(rho)
    }
    // 37 % hydrochloric acid of density 1.184 g/mL is 12.0 mol/L; 98 % sulfuric acid 18.3 mol/L (±0.1)
    const molarity = (id: string, species: string) => { const r = reagent.get(id)!; return r.recipe.species[species] * r.rho! * 1000 / (1000 + Object.entries(r.recipe.species).reduce((s, [k, n]) => s + n * massOf(k), 0)) }
    expect(Math.abs(molarity('HCl_conc', 'Cl-') - 12.0)).toBeLessThan(0.1)
    expect(Math.abs(molarity('H2SO4_conc', 'SO4-2') - 18.3)).toBeLessThan(0.1)
    expect(reagent.get('H2SO4_conc')!.beyondModel).toBe(true)
  })

  it('write strong electrolytes as ions and weak ones as molecules', () => {
    expect(Object.keys(reagent.get('HCl_1M')!.recipe.species).sort()).toEqual(['Cl-', 'H+'])
    expect(Object.keys(reagent.get('NaOH_0.1M')!.recipe.species).sort()).toEqual(['Na+', 'OH-'])
    expect(Object.keys(reagent.get('CH3COOH_0.1M')!.recipe.species)).toEqual(['H(Acetate)'])
    expect(Object.keys(reagent.get('NH3_1M')!.recipe.species)).toEqual(['NH3'])
    expect(Object.keys(reagent.get('chlorine_water')!.recipe.species)).toEqual(['Cl2'])
    expect(reagent.get('Zn_granule')).toMatchObject({ kind: 'solid', form: 'granule', recipe: { species: { 'Zn(s)': 1 } } })
    expect(reagent.get('CaCO3_chip')).toMatchObject({ kind: 'solid', form: 'chip', recipe: { species: { Calcite: 1 } } })
  })

  it('flag an estimated density and leave an unknown one null', () => {
    const estimated = cat.reagents.filter(r => r.rhoEst)
    // the estimate adds the mass of the solute to water of 0.9982 g/mL: rho = 0.9982 + (solute g/L)/1000
    for (const r of estimated) {
      const solute = Object.entries(r.recipe.species).reduce((s, [k, n]) => s + n * massOf(k), 0)
      expect(Math.abs(r.rho! * 1000 / (1000 + solute) - 0.9982), r.id).toBeLessThan(1e-4)
    }
    expect(estimated.length).toBeGreaterThan(0)
    expect(reagent.get('HCl_1M')!.rhoEst).toBeUndefined()
  })

  it('has the standard shelf: acids, bases, saturated solutions, indicators, gases, water and ice', () => {
    const shelf = ['HCl_0.1M', 'HCl_1M', 'HCl_2M', 'HCl_6M', 'HCl_conc', 'H2SO4_1M', 'H2SO4_conc', 'HNO3_1M', 'HNO3_conc', 'CH3COOH_0.1M', 'NaOH_0.1M', 'NaOH_1M', 'NaOH_solid', 'NH3_1M', 'NH3_conc',
      'limewater', 'NaCl_sat', 'chlorine_water', 'bromine_water', 'iodine_water', 'iodine_KI', 'H2S_water', 'SO2_water', 'H2O2_3pct', 'Zn_granule', 'CaCO3_chip', 'water', 'ice',
      'phenolphthalein', 'methyl_orange', 'litmus', 'starch_1pct',
      'O2_gas', 'H2_gas', 'N2_gas', 'CO2_gas', 'Cl2_gas', 'NH3_gas', 'HCl_gas', 'SO2_gas', 'NO_gas', 'NO2_gas', 'CH4_gas', 'C2H4_gas', 'C2H2_gas', 'CO_gas']
    expect(shelf.filter(id => !reagent.has(id))).toEqual([])
  })

  it('has every reagent of the forty guided experiments (D270)', () => {
    expect(experiments.length).toBe(40)
    expect(duplicates(experiments.map(e => e.id))).toEqual([])
    const missing = experiments.flatMap(e => e.reagents.filter(id => !reagent.has(id)).map(id => `${e.id}: ${id}`))
    expect(missing).toEqual([])
  })
})

describe('catalogue: merged sections and pending records', () => {
  it('keeps only reactions and dissolution rates whose species exist, and lists what waits for the network', () => {
    // a declared non-reaction has no equation: it names its species in `between`
    for (const r of cat.reactions) expect([...Object.keys(r.eq ?? {}), ...(r.between ?? [])].filter(id => !known(id)), r.id).toEqual([])
    expect(Object.keys(cat.dissolution).filter(id => !known(id))).toEqual([])
    const waiting = new Set(cat.pending.filter(p => p.section === 'couples').map(p => p.id))
    for (const c of cat.couples) {
      const unknown = [...Object.keys(c.ox), ...Object.keys(c.red)].filter(id => !known(id))
      if (unknown.length) expect(waiting.has(c.id), c.id).toBe(true)
    }
    for (const p of cat.pending) expect(p.missing.length, p.id).toBeGreaterThan(0)
  })

  it('balances every declared reaction in elements and charge', () => {
    for (const r of cat.reactions) {
      const t = total(r.eq ?? {})
      expect(Object.keys(t.comp), r.id).toEqual([])
      expect(Math.abs(t.z), r.id).toBeLessThan(1e-6)
    }
  })
})

describe('catalogue: spot values against the textbook', () => {
  const at = (id: string, celsius: number) => sub(id).solubility!.points.find(p => Math.abs(p[0] - (celsius + 273.15)) < 1e-9)![1]

  it('solubilities in g per 100 g of water', () => {
    expect(at('KNO3(s)', 20)).toBe(31.6)
    expect(at('KNO3(s)', 60)).toBe(110)
    expect(at('Halite', 20)).toBe(36.0)
    expect(at('Portlandite', 20)).toBe(0.165)
    expect(at('Sylvite', 20)).toBe(34.0)
    expect(at('NH4Cl(s)', 20)).toBe(37.2)
    expect(at('Chalcanthite', 20)).toBe(20.7)
    expect(at('Thenardite', 40)).toBe(48.8)
  })

  it('molar masses, g/mol (atomic weights of elements.json; tolerance 0.01)', () => {
    for (const [id, M] of [['KNO3(s)', 101.10], ['NaOH(s)', 40.00], ['KMnO4(s)', 158.03], ['AgNO3(s)', 169.87], ['C2H5OH(l)', 46.07], ['Glucose(s)', 180.16], ['KAl(SO4)2:12H2O(s)', 474.37]] as Array<[string, number]>) expect(Math.abs(substance.get(id)!.M - M), id).toBeLessThan(0.01)
  })

  it('standard entropies, heat capacities and transition points', () => {
    // NASA Glenn polynomials at 298.15 K against CODATA: Zn S° 41.63, cp 25.39; Cu S° 33.15; graphite S° 5.74 J/(mol·K)
    expect(substance.get('Zn(s)')).toMatchObject({ Hf: 0, src: 'NASA Glenn via Cantera' })
    expect(Math.abs(substance.get('Zn(s)')!.S! - 41.63)).toBeLessThan(0.05)
    expect(Math.abs(substance.get('Zn(s)')!.cp! - 25.39)).toBeLessThan(0.05)
    expect(Math.abs(substance.get('Cu(s)')!.S! - 33.15)).toBeLessThan(0.05)
    expect(Math.abs(substance.get('C(s)')!.S! - 5.74)).toBeLessThan(0.05)
    // ethene +52.5, ethyne +228.2, ozone +142.7 kJ/mol (tolerance 1: the NASA fit of ozone gives 141.8)
    expect(Math.abs(substance.get('C2H4(g)')!.Hf! - 52.5)).toBeLessThan(0.5)
    expect(Math.abs(substance.get('C2H2(g)')!.Hf! - 228.2)).toBeLessThan(1)
    expect(Math.abs(substance.get('O3(g)')!.Hf! - 142.7)).toBeLessThan(1)
    // ethanol boils at 78.3 °C, water freezes at 0 °C with 6.01 kJ/mol
    expect(substance.get('C2H5OH(l)')!.Tb).toBe(351.44)
    expect(substance.get('Ice(s)')).toMatchObject({ Tm: 273.15, Hfus: 6.01 })
  })
})
