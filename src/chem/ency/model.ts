/**
 * The encyclopedia of elements and substances (26.64, D271): from the data files to what the pages show. Everything
 * here is a pure function of the records (src/chem/data/*.json) and the interface language — no Vue, no DOM — so the
 * tests can build the page of every element and of every substance (tests/chem/ency.test.ts).
 *
 * Rules (D273): a number shown is a number of a data file or of the core, written with the digits the file has; a
 * conversion (K → °C, seconds → years) is marked by the unit; a missing value is `null` here and "无数据" on the page —
 * nothing is estimated or filled in.
 */
import { tl } from '../../i18n'
import { activeLang } from '../../i18n/locale'
import type { Tri } from '../../i18n/tri'
import type { CrystalRecord, DataSource, ElementCategory, ElementRecord, ElementStructure, MoleculeMethod, MoleculeRecord, StandardState } from '../data'
import type { CrystalSpec } from '../../engine/mol'
import { withDecimal } from '../../units/units'
import { NNBSP, sig } from '../format'
import { ELEMENT_TEXT, NAME_PARTS } from './text'

const T3 = (t: Tri | null | undefined): string => (t ? t[activeLang()] ?? t.zh : '')
const MINUS = '−'

/** A number of a data file with the digits it has there (decimal separator of the readouts, real minus sign). */
export function plain(v: number | null | undefined): string | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null
  const s = String(v)
  if (/e/i.test(s)) return sig(v, 3)
  return withDecimal(s).replace('-', MINUS)
}
const unit = (s: string | null, u: string): string | null => (s === null ? null : `${s}${NNBSP}${u}`)

/** A temperature given in kelvin, with °C behind it (as many decimals as the kelvin value has, two at most). */
export function kelvinText(k: number | null | undefined): string | null {
  const s = plain(k)
  if (s === null || k === null || k === undefined) return null
  const dec = Math.min(2, (String(k).split('.')[1] ?? '').length)
  const c = (k - 273.15).toFixed(dec)
  const zero = Number(c) === 0
  return `${s}${NNBSP}K (${withDecimal(zero ? c.replace('-', '') : c).replace('-', MINUS)}${NNBSP}°C)`
}

// ---- The periodic table ----

export interface Cell { z: number; symbol: string; row: number; col: number }

/** Row and column (1-based) of an element in the 18-column table; the f block stands in rows 9 and 10 below it. */
export function cellOf(e: ElementRecord): Cell {
  if (e.group !== null) return { z: e.z, symbol: e.symbol, row: e.period, col: e.group }
  // 57–71 and 89–103 carry no group in the data: fifteen cells each, under groups 3 … 17
  const first = e.period === 6 ? 57 : 89
  return { z: e.z, symbol: e.symbol, row: e.period + 3, col: 3 + (e.z - first) }
}

export type ColourMode = 'category' | 'state' | 'electronegativity' | 'radius' | 'ionisation' | 'melt' | 'density'
export const COLOUR_MODES: ColourMode[] = ['category', 'state', 'electronegativity', 'radius', 'ionisation', 'melt', 'density']

export function modeLabel(m: ColourMode): string {
  switch (m) {
    case 'category': return tl('元素类别')
    case 'state': return tl('物态')
    case 'electronegativity': return tl('电负性')
    case 'radius': return tl('原子半径')
    case 'ionisation': return tl('电离能')
    case 'melt': return tl('熔点')
    default: return tl('密度')
  }
}

/** The unit of a scale ('' for the Pauling scale). */
export function modeUnit(m: ColourMode): string {
  return m === 'radius' ? 'pm' : m === 'ionisation' ? 'eV' : m === 'melt' ? 'K' : m === 'density' ? 'g/cm³' : ''
}

/** The value a scale colours an element by; null when the data have none. */
export function scaleValue(m: ColourMode, e: ElementRecord): number | null {
  switch (m) {
    case 'electronegativity': return e.electronegativity
    case 'radius': return e.radius.atomic
    case 'ionisation': return e.ionisation?.eV ?? null
    case 'melt': return e.melt
    case 'density': return e.density
    default: return null
  }
}

/** Smallest and largest value of a scale over the elements that have one. */
export function scaleDomain(m: ColourMode, elements: ElementRecord[]): [number, number] | null {
  const v = elements.map(e => scaleValue(m, e)).filter((x): x is number => x !== null)
  return v.length ? [Math.min(...v), Math.max(...v)] : null
}

/**
 * The state of an element at a temperature and 101.325 kPa, read from its melting and boiling point. Null when the
 * data do not decide it (no melting point: helium does not freeze at this pressure, and the heaviest elements have
 * no measured points).
 */
export function stateAt(e: ElementRecord, T: number): StandardState | null {
  if (e.sublimes) return e.boil === null ? null : T < e.boil ? 'solid' : 'gas'
  if (e.boil !== null && T >= e.boil) return 'gas'
  if (e.melt === null) return null
  if (T < e.melt) return 'solid'
  return e.boil === null ? null : 'liquid'
}

export function stateLabel(s: StandardState | null): string {
  return s === 'solid' ? tl('固态') : s === 'liquid' ? tl('液态') : s === 'gas' ? tl('气态') : tl('无数据')
}

export const CATEGORIES: ElementCategory[] = ['alkali-metal', 'alkaline-earth', 'transition-metal', 'post-transition-metal', 'metalloid', 'reactive-nonmetal', 'halogen', 'noble-gas', 'lanthanide', 'actinide']

export function categoryLabel(c: ElementCategory): string {
  switch (c) {
    case 'alkali-metal': return tl('碱金属')
    case 'alkaline-earth': return tl('碱土金属')
    case 'transition-metal': return tl('过渡金属')
    case 'post-transition-metal': return tl('后过渡金属')
    case 'metalloid': return tl('类金属')
    case 'reactive-nonmetal': return tl('活泼非金属')
    case 'halogen': return tl('卤素')
    case 'noble-gas': return tl('稀有气体')
    case 'lanthanide': return tl('镧系元素')
    default: return tl('锕系元素')
  }
}

/** The Chinese name of an element with its parts where a font may lack the character: 「𬬻（钅卢）」. */
export function nameGloss(e: ElementRecord): string | null {
  const parts = NAME_PARTS[e.symbol]
  return parts && activeLang() === 'zh' ? tl('“{0}”由“{1}”与“{2}”左右或上下合成', [e.name.zh, parts[0], parts[1]]) : null
}

// ---- The element page ----

export interface PropRow { id: string; label: string; value: string | null; note?: string }

const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻' }
const SUB: Record<string, string> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' }
const sup = (s: string) => [...s].map(c => SUP[c] ?? c).join('')
const sub = (s: string) => [...s].map(c => SUB[c] ?? c).join('')
const L = 'spdf'

/** `[Ar] 3d10 4s1` → [Ar] 3d¹⁰ 4s¹. */
export function configText(c: string): string { return c.replace(/(\d[spdfg])(\d+)/g, (_m, a: string, n: string) => a + sup(n)) }

/** An oxidation state as chemists write it: +2, −1, 0. */
export function oxidationText(n: number): string { return n > 0 ? `+${n}` : n < 0 ? `${MINUS}${-n}` : '0' }

export interface ConfigLevel {
  n: number; l: number
  /** `3d`. */
  label: string
  electrons: number
  capacity: number
  /** One entry per orbital: 0 empty, 1 one electron, 2 a pair (filled by Hund's rule). */
  boxes: number[]
}

/** The occupied subshells in the order they are filled (n + l, then n), with the electrons placed by Hund's rule. */
export function configLevels(e: ElementRecord): ConfigLevel[] {
  return [...e.subshells].sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]) || a[0] - b[0]).map(([n, l, k]) => {
    const orbitals = 2 * l + 1
    const boxes = Array.from({ length: orbitals }, (_x, i) => (k > i ? 1 : 0) + (k > orbitals + i ? 1 : 0))
    return { n, l, label: `${n}${L[l] ?? '?'}`, electrons: k, capacity: 2 * orbitals, boxes }
  })
}

const STRUCTURES: Record<ElementStructure, () => string> = {
  fcc: () => tl('面心立方'), bcc: () => tl('体心立方'), hcp: () => tl('六方最密堆积'), diamond: () => tl('金刚石型'), sc: () => tl('简单立方'),
  hexagonal: () => tl('六方'), tetragonal: () => tl('四方'), orthorhombic: () => tl('正交'), rhombohedral: () => tl('三方（菱面体）'), cubic: () => tl('立方'), monoclinic: () => tl('单斜')
}
export function structureLabel(s: ElementStructure): string { return STRUCTURES[s]?.() ?? s }

/** The structure types the core builds from the key and the lattice constants alone (engine/CHEM.md). */
export const GENERATED_STRUCTURES = new Set<string>(['fcc', 'bcc', 'hcp', 'diamond', 'sc'])

export interface StructureChoice {
  id: string
  label: string
  spec: CrystalSpec
  /** False: the data name a crystal system only; the core cannot build the cell from it and the viewer says so. */
  generated: boolean
  note: string
}

/** The crystal structures a page can hand to the viewer for an element: records with a full basis first. */
export function elementStructures(e: ElementRecord, crystals: CrystalRecord[]): StructureChoice[] {
  const out: StructureChoice[] = []
  for (const c of crystals) {
    if (c.formula !== e.symbol && c.formula !== `${e.symbol}2`) continue
    out.push({ id: c.id, label: T3(c.name), spec: { structure: c.structure, a: c.a, b: c.b, c: c.c, alpha: c.alpha, beta: c.beta, gamma: c.gamma, basis: c.basis }, generated: true, note: c.note ? T3(c.note) : '' })
  }
  const x = e.crystal
  if (x && x.a !== null && !out.some(o => o.spec.structure === x.structure)) {
    const spec: CrystalSpec = { structure: x.structure, element: e.symbol, a: x.a }
    if (x.b !== null) spec.b = x.b
    if (x.c !== null) spec.c = x.c
    if (x.alpha !== null) spec.alpha = x.alpha
    const generated = GENERATED_STRUCTURES.has(x.structure) && (x.structure !== 'hcp' || x.c !== null)
    out.push({ id: `element-${x.structure}`, label: structureLabel(x.structure), spec, generated, note: generated ? '' : tl('数据只给出晶系与晶格常数，没有晶胞内的原子坐标，这个结构未建模。') })
  }
  return out
}

function latticeText(x: NonNullable<ElementRecord['crystal']>): string {
  const parts: string[] = []
  if (x.a !== null) parts.push(`a = ${plain(x.a)}${NNBSP}Å`)
  if (x.b !== null) parts.push(`b = ${plain(x.b)}${NNBSP}Å`)
  if (x.c !== null) parts.push(`c = ${plain(x.c)}${NNBSP}Å`)
  if (x.alpha !== null) parts.push(`α = ${plain(x.alpha)}°`)
  return parts.join(', ')
}

export interface OrbitalChoice { n: number; l: number; label: string }

export interface IsotopeRow {
  a: number
  /** `⁶³Cu`. */
  label: string
  abundance: string | null
  halfLife: string | null
  stable: boolean
  mode: string | null
  /** The route of the nuclide page: `nuclide:<Z>-<A>`. */
  route: string
}

/** The part of nuclides.json the isotope table reads. */
export interface NuclideTable {
  units?: { year_s?: number }
  flags?: { halfLifeEstimated?: number; halfLifeLimit?: number }
  modes: string[]
  citations?: string[]
  licence?: string
  /** `[Z, A, state, massExcess, halfLife, abundance, flags, decays]`. */
  nuclides: Array<[number, number, number, number | null, number | null, number, number, Array<number | null>]>
}

const YEAR_S = 31556926

/** A half-life given in seconds, in the unit that reads best (the year of the data file). */
export function halfLifeText(s: number, year = YEAR_S): string {
  const steps: Array<[number, string]> = [[year, 'a'], [86400, 'd'], [3600, 'h'], [60, 'min'], [1, 's'], [1e-3, 'ms'], [1e-6, 'µs'], [1e-9, 'ns']]
  for (const [size, u] of steps) if (s >= size) return `${sig(s / size, 3)}${NNBSP}${u}`
  return `${sig(s, 3)}${NNBSP}s`
}

const MODE_TEXT: Record<string, string> = { 'B-': 'β⁻', 'B+': 'β⁺', EC: 'EC', 'e+': 'β⁺', A: 'α', IT: 'IT', SF: 'SF', '2B-': '2β⁻', '2B+': '2β⁺' }

/** The decay mode as nuclear tables print it (β⁻, α, EC …); other modes as the data name them. */
export function modeText(m: string): string { return MODE_TEXT[m] ?? m.replace(/^B-/, 'β⁻').replace(/^B\+/, 'β⁺') }

/**
 * The isotopes of an element: those found in nature and the stable ones, and the longest-lived of the others (four
 * at most) — from the nuclide table where it is loaded, else from the element record alone.
 */
export function isotopeRows(e: ElementRecord, table: NuclideTable | null): IsotopeRow[] {
  const row = (a: number, abundance: number | null, half: number | null, stable: boolean, mode: string | null, approx = false): IsotopeRow => ({
    a, label: `${sup(String(a))}${e.symbol}`, abundance: abundance !== null && abundance > 0 ? `${plain(abundance)}${NNBSP}%` : null,
    halfLife: stable ? tl('稳定') : half === null ? null : (approx ? '≈ ' : '') + halfLifeText(half, table?.units?.year_s ?? YEAR_S), stable, mode, route: `nuclide:${e.z}-${a}`
  })
  if (!table) return e.isotopes.map(i => row(i.a, i.abundance, null, false, null))
  const ground = table.nuclides.filter(n => n[0] === e.z && n[2] === 0)
  const natural = ground.filter(n => n[5] > 0 || n[4] === 0)
  const others = ground.filter(n => !natural.includes(n) && n[4] !== null).sort((a, b) => (b[4] as number) - (a[4] as number)).slice(0, 4)
  const est = (table.flags?.halfLifeEstimated ?? 2) | (table.flags?.halfLifeLimit ?? 4)
  return [...natural, ...others].sort((a, b) => a[1] - b[1]).map(n => {
    const decays = n[7]
    let best = -1, bestF = -1
    for (let i = 0; i + 1 < decays.length; i += 2) { const f = decays[i + 1] ?? 0; if (best < 0 || f > bestF) { best = decays[i] as number; bestF = f } }
    return row(n[1], n[5], n[4], n[4] === 0, best >= 0 && table.modes[best] ? modeText(table.modes[best]) : null, (n[6] & est) !== 0)
  })
}

export interface Link { id: string; formula: string; name: string }

export interface ElementModel {
  z: number
  symbol: string
  name: string
  names: Tri
  gloss: string | null
  category: ElementCategory
  categoryText: string
  rows: PropRow[]
  configuration: string
  configurationPredicted: boolean
  levels: ConfigLevel[]
  /** Subshells the core can sample (hydrogen-like, n ≤ 4). */
  orbitals: OrbitalChoice[]
  /** The element has electrons in shells the orbital viewer does not cover (n ≥ 5). */
  orbitalsBeyond: boolean
  structures: StructureChoice[]
  isotopes: IsotopeRow[]
  /** Visible emission lines (nm), for the elements the data list them for. */
  lines: number[] | null
  compounds: Link[]
  compoundCount: number
  /** Two or three sentences on uses and discovery; null where none has been written. */
  blurb: string | null
  /** The reactor workshop is reached from this page (uranium). */
  reactor: boolean
  sources: string[]
}

export interface ElementContext {
  sources?: Record<string, DataSource>
  crystals?: CrystalRecord[]
  nuclides?: NuclideTable | null
  substances?: SubstanceEntry[]
}

const COMPOUND_LIMIT = 18

export function elementModel(e: ElementRecord, ctx: ElementContext = {}): ElementModel {
  const rows: PropRow[] = []
  const add = (id: string, label: string, value: string | null, note?: string) => rows.push(note ? { id, label, value, note } : { id, label, value })
  add('z', tl('原子序数'), String(e.z))
  add('mass', e.massIsMassNumber ? tl('最稳定同位素的质量数') : tl('相对原子质量'), e.massIsMassNumber ? `[${e.mass}]` : plain(e.mass), e.massIsMassNumber ? tl('没有标准相对原子质量') : undefined)
  add('position', tl('周期、族、区'), [tl('第 {0} 周期', [e.period]), e.group !== null ? tl('第 {0} 族', [e.group]) : categoryLabel(e.category), tl('{0} 区', [e.block])].join(' · '))
  add('category', tl('元素类别'), categoryLabel(e.category))
  add('configuration', tl('基态电子排布'), configText(e.configuration), e.configurationPredicted ? tl('理论预测，未经实验确认') : undefined)
  const ox = e.oxidationStates
  add('oxidation', tl('氧化态'), ox.common.length || ox.other.length ? [ox.common.map(oxidationText).join(', '), ox.other.length ? `(${ox.other.map(oxidationText).join(', ')})` : ''].filter(Boolean).join(' ') : null, ox.other.length ? tl('括号内为不常见的氧化态') : undefined)
  add('electronegativity', tl('电负性（鲍林标度）'), plain(e.electronegativity))
  add('radiusAtomic', tl('原子半径'), unit(plain(e.radius.atomic), 'pm'))
  add('radiusCovalent', tl('共价半径'), unit(plain(e.radius.covalent), 'pm'))
  add('radiusVdw', tl('范德华半径'), unit(plain(e.radius.vdw), 'pm'))
  add('ionisation', tl('第一电离能'), e.ionisation ? `${plain(e.ionisation.eV)}${NNBSP}eV (${plain(e.ionisation.kJmol)}${NNBSP}kJ/mol)` : null)
  add('affinity', tl('电子亲和能'), unit(plain(e.electronAffinity), 'eV'))
  add('melt', tl('熔点'), kelvinText(e.melt), e.allotrope ? tl('指 {0}', [e.allotrope]) : undefined)
  add('boil', e.sublimes ? tl('升华点') : tl('沸点'), kelvinText(e.boil))
  add('state', tl('常温常压下的物态'), e.state ? stateLabel(e.state) : null, `25${NNBSP}°C, 101.325${NNBSP}kPa`)
  add('density', tl('密度'), unit(plain(e.density), 'g/cm³'), e.density !== null && e.densityPhase ? (e.densityPhase === 'gas' ? tl('气体，按 25 °C 的理想气体') : stateLabel(e.densityPhase)) : undefined)
  add('crystal', tl('晶体结构'), e.crystal ? [structureLabel(e.crystal.structure), latticeText(e.crystal)].filter(Boolean).join(' · ') : null)
  add('abundance', tl('地壳丰度'), unit(plain(e.abundanceCrust), 'mg/kg'))
  const d = e.discovery
  add('discovery', tl('发现'), d.ancient ? tl('古代已知') : d.year !== null || d.by ? [d.year !== null ? tl('{0} 年', [d.year]) : '', d.by ?? ''].filter(Boolean).join(' · ') : null)

  const seen = new Set<string>()
  const orbitals: OrbitalChoice[] = []
  for (const [n, l] of e.subshells) {
    const label = `${n}${L[l] ?? '?'}`
    if (n <= 4 && !seen.has(label)) { seen.add(label); orbitals.push({ n, l, label }) }
  }
  const all = (ctx.substances ?? []).filter(s => s.category !== 'element' && s.elements.includes(e.symbol) && s.elements.length > 1)
    .sort((a, b) => a.elements.length - b.elements.length || a.raw.length - b.raw.length || a.raw.localeCompare(b.raw))
  const lines = e.emissionLines?.length ? e.emissionLines : null
  const text = ELEMENT_TEXT[e.symbol]

  return {
    z: e.z, symbol: e.symbol, name: T3(e.name), names: e.name, gloss: nameGloss(e), category: e.category, categoryText: categoryLabel(e.category), rows,
    configuration: configText(e.configuration), configurationPredicted: e.configurationPredicted, levels: configLevels(e), orbitals, orbitalsBeyond: e.subshells.some(s => s[0] > 4),
    structures: elementStructures(e, ctx.crystals ?? []), isotopes: isotopeRows(e, ctx.nuclides ?? null), lines,
    compounds: all.slice(0, COMPOUND_LIMIT).map(s => ({ id: s.id, formula: s.formula, name: T3(s.name) })), compoundCount: all.length,
    blurb: text ? T3(text) : null, reactor: e.symbol === 'U', sources: elementSources(ctx.sources ?? {}, !!ctx.nuclides, ctx.nuclides ?? null, !!lines)
  }
}

/** The footnote of an element page: where the numbers come from, the licence of the oxidation states included. */
export function elementSources(sources: Record<string, DataSource>, withNuclides: boolean, table: NuclideTable | null, withLines: boolean): string[] {
  const out: string[] = []
  const ox = sources.oxidationStates
  out.push(tl('氧化态：{0}（由 mendeleev 整理；CC BY-SA）', [ox?.citation ?? 'mendeleev']))
  const cited = new Set<string>()
  for (const [field, s] of Object.entries(sources)) {
    if (field === 'oxidationStates' || field === 'emissionLines' || !s.citation) continue
    cited.add(s.citation)
  }
  for (const c of cited) out.push(c)
  if (Object.values(sources).some(s => s.package === 'mendeleev')) out.push(tl('其余性质取自 mendeleev 数据包（各项的出处见 docs/chem/DATA_SOURCES.md）。'))
  if (withLines) out.push(tl('发射谱线：教科书数值，只列可见光区的主要谱线，没有相对强度。'))
  if (withNuclides && table) {
    for (const c of table.citations ?? []) out.push(c)
    if (table.licence) out.push(table.licence)
  }
  return out
}

// ---- Substances ----

/** A substance of the catalogue with the fields the pages read (engine/CHEM.md, "The catalogue"). */
export interface CatSubstance {
  id: string; formula?: string; comp?: Record<string, number>; phase: string; M?: number | null
  Hf?: number | null; S?: number | null; cp?: number | null; rho?: number | null; Tm?: number | null; Tb?: number | null
  Hfus?: number | null; Hvap?: number | null; Tign?: number | null
  src?: string | null; propSrc?: string | null; note?: string
  dissolves?: Record<string, number>
  solubility?: { points: Array<[number, number]>; src?: string }
  crystallises?: string
}
export interface CatReagent { id: string; name?: Tri; kind: string; label?: string; recipe: { water_kg?: number; species: Record<string, number> } }
export interface CatReaction { id: string; name?: Tri | string; note?: Tri; eq?: Record<string, number>; between?: string[]; teaching?: boolean; class?: string }
export interface CatalogueData {
  substances?: CatSubstance[]
  display?: Record<string, { f?: string; name?: Tri; color?: [number, number, number] }>
  reagents?: CatReagent[]
  reactions?: CatReaction[]
  spectra?: Record<string, number[]>
  sources?: Record<string, Record<string, string>>
}

export interface SubstanceEntry {
  /** The id of the page: the id of the molecule record, else the id of the catalogue substance. */
  id: string
  /** The formula as the data write it (`C2H5OH`, `SO4^2-`, `CuSO4:3H2O`) and typeset. */
  raw: string
  formula: string
  name: Tri | null
  /** Category key of molecules.json; null for a substance only the catalogue has. */
  category: string | null
  molecule: MoleculeRecord | null
  forms: CatSubstance[]
  /** Ids under which the reaction network knows the substance. */
  species: string[]
  elements: string[]
  crystals: CrystalRecord[]
}

/** A formula of molecules.json typeset: `SO4^2-` → SO₄²⁻, `[Cu(NH3)4]^2+` → [Cu(NH₃)₄]²⁺. */
export function moleculeFormula(raw: string): string {
  const [body, charge = ''] = raw.split('^')
  const c = /^(\d*)([+-])$/.exec(charge)
  return body.replace(/([A-Za-z)\]])(\d+)/g, (_m, a: string, n: string) => a + sub(n)) + (c ? sup((c[1] === '1' ? '' : c[1]) + c[2]) : charge)
}

/** A catalogue id typeset: `Cu+2` → Cu²⁺, `CuSO4:3H2O(s)` → CuSO₄·3H₂O. */
export function catalogueFormula(id: string): string {
  let s = id.replace(/\((s|l|g|aq|a|am|c)\)$/, '')
  let charge = ''
  const m = /([+-])(\d*)$/.exec(s)
  if (m && m.index > 0) { s = s.slice(0, m.index); charge = sup((m[2] && m[2] !== '1' ? m[2] : '') + m[1]) }
  return s.replace(/([A-Za-z)\]])(\d+)/g, (_x, a: string, n: string) => a + sub(n)).replace(/:/g, '·') + charge
}

/** `SO4^2-` → `SO4-2`, `[Cu(NH3)4]^2+` → `Cu(NH3)4+2`: the id the reaction network would use for a molecule or ion. */
export function speciesIdOf(raw: string): string {
  const [body, charge = ''] = raw.split('^')
  const c = /^(\d*)([+-])$/.exec(charge)
  const b = charge ? body.replace(/^\[(.*)\]$/, '$1') : body
  return b + (c ? c[2] + (c[1] === '1' ? '' : c[1]) : '')
}

const PHASES = ['', '(g)', '(l)', '(s)', '(aq)']

function elementsOfComp(comp: Record<string, number> | undefined): string[] { return Object.keys(comp ?? {}).filter(k => /^[A-Z][a-z]?$/.test(k)) }

/** Every page of a substance: the molecules and ions, and the catalogue's substances that are none of them. */
export function substanceIndex(molecules: MoleculeRecord[], cat: CatalogueData | null, crystals: CrystalRecord[] = []): SubstanceEntry[] {
  const display = cat?.display ?? {}
  const known = new Set<string>([...Object.keys(display), ...(cat?.substances ?? []).map(s => s.id), ...Object.keys(cat?.spectra ?? {})])
  for (const r of cat?.reactions ?? []) for (const k of [...Object.keys(r.eq ?? {}), ...(r.between ?? [])]) known.add(k)
  const count = new Map<string, number>()
  for (const m of molecules) count.set(m.formula, (count.get(m.formula) ?? 0) + 1)
  const taken = new Set<string>()
  const out: SubstanceEntry[] = []
  const nameOf = (id: string) => display[id]?.name?.en.toLowerCase() ?? ''
  for (const m of molecules) {
    const base = speciesIdOf(m.formula)
    const forms = (cat?.substances ?? []).filter(s => !taken.has(s.id) && (
      (nameOf(s.id) !== '' && nameOf(s.id) === m.name.en.toLowerCase()) || (m.charge === 0 && count.get(m.formula) === 1 && s.formula === m.formula)))
    for (const f of forms) taken.add(f.id)
    const species = [...new Set([...PHASES.map(p => base + p).filter(id => known.has(id) && (m.charge !== 0 || count.get(m.formula) === 1)), ...forms.map(f => f.id)])]
    out.push({ id: m.id, raw: m.formula, formula: moleculeFormula(m.formula), name: m.name, category: m.category, molecule: m, forms, species, elements: [...new Set(m.atoms)], crystals: m.charge === 0 ? crystals.filter(c => c.formula === m.formula && count.get(m.formula) === 1) : [] })
  }
  const ids = new Set(out.map(o => o.id))
  for (const s of cat?.substances ?? []) {
    if (taken.has(s.id) || ids.has(s.id)) continue
    const raw = s.formula ?? s.id.replace(/\((s|l|g|aq)\)$/, '')
    const sameSolid = s.crystallises ? [] : crystals.filter(c => c.formula === raw)
    out.push({ id: s.id, raw, formula: display[s.id]?.f ?? catalogueFormula(s.formula ?? s.id), name: display[s.id]?.name ?? null, category: null, molecule: null, forms: [s], species: [s.id], elements: elementsOfComp(s.comp), crystals: s.phase === 's' ? sameSolid : [] })
  }
  return out
}

export function phaseLabel(p: string): string {
  return p === 's' ? tl('固态') : p === 'l' ? tl('液态') : p === 'g' ? tl('气态') : p === 'aq' ? tl('水溶液') : p
}

export function methodLabel(m: MoleculeMethod): string {
  if (m === 'vsepr') return tl('价层电子对互斥模型生成：只表示形状，键长与键角是理想值，不是实测值。')
  if (m === 'literature') return tl('文献中的实测键长与键角。')
  if (m === 'rdkit-etkdg-uff') return tl('计算构型：RDKit 的 ETKDG 生成，UFF 力场优化；不是实测结构。')
  return tl('计算构型：RDKit 的 ETKDG 生成，MMFF94 力场优化；不是实测结构。')
}

export interface FormModel {
  id: string
  title: string
  rows: PropRow[]
  /** Solubility against temperature: K, g per 100 g of water. */
  solubility: Array<[number, number]> | null
  note: string
}

export interface ReactionModel { id: string; name: string; equation: string | null; note: string; teaching: boolean; viaIons: boolean }

export interface SubstanceModel {
  id: string
  title: string
  formula: string
  names: Tri | null
  categoryText: string | null
  molarMass: string | null
  charge: number
  molecule: MoleculeRecord | null
  method: MoleculeMethod | null
  methodText: string | null
  references: string[]
  crystals: Array<{ id: string; label: string; spec: CrystalSpec; note: string }>
  forms: FormModel[]
  /** Colour of the solid as the catalogue gives it (sRGB). */
  solidColour: [number, number, number] | null
  /** Dissolved species with a display spectrum, each at the concentration the swatch is computed for (mol/L). */
  colourSpecies: Record<string, number> | null
  reagents: Array<{ id: string; text: string }>
  reactions: ReactionModel[]
  elements: Array<{ symbol: string; name: string }>
  sources: string[]
}

export interface SubstanceContext {
  catalogue?: CatalogueData | null
  categories?: Array<{ id: string; name: Tri }>
  references?: Record<string, string>
  elements?: ElementRecord[]
  /** Molar mass of a molecule from the core (g/mol); null when it cannot be computed. */
  molarMass?: (m: MoleculeRecord) => number | null
}

/** The concentration the colour of a solution is shown for (mol/L; the path is 1 cm). */
export const COLOUR_CONC = 0.1
const SPECTATORS = new Set(['H2O', 'H+', 'OH-'])

function coefficient(n: number): string { const a = Math.abs(n); return a === 1 ? '' : `${plain(a)} ` }

/** The equation of a declared reaction as the catalogue balances it: `Zn + Cu²⁺ → Zn²⁺ + Cu`. */
export function equationText(eq: Record<string, number>, cat: CatalogueData | null): string {
  const f = (id: string) => (cat?.display?.[id]?.f ?? catalogueFormula(id)).replace(/\(aq\)$/, '')
  const side = (sign: number) => Object.entries(eq).filter(([, n]) => Math.sign(n) === sign).map(([id, n]) => coefficient(n) + f(id)).join(' + ')
  return `${side(-1)} → ${side(1)}`
}

function formRows(s: CatSubstance): PropRow[] {
  const rows: PropRow[] = []
  const add = (id: string, label: string, value: string | null, note?: string) => rows.push(note ? { id, label, value, note } : { id, label, value })
  add('M', tl('摩尔质量'), unit(plain(s.M), 'g/mol'))
  add('Tm', tl('熔点'), kelvinText(s.Tm))
  add('Tb', tl('沸点'), kelvinText(s.Tb))
  add('rho', tl('密度'), unit(plain(s.rho), s.phase === 'g' ? 'g/L' : 'g/cm³'))
  add('Hf', tl('标准摩尔生成焓 ΔfH°'), unit(plain(s.Hf), 'kJ/mol'), `298.15${NNBSP}K`)
  if (s.S !== undefined) add('S', tl('标准摩尔熵 S°'), unit(plain(s.S), 'J/(mol·K)'))
  if (s.Hfus !== undefined && s.Hfus !== null) add('Hfus', tl('熔化焓'), unit(plain(s.Hfus), 'kJ/mol'))
  if (s.Hvap !== undefined && s.Hvap !== null) add('Hvap', tl('汽化焓'), unit(plain(s.Hvap), 'kJ/mol'))
  if (s.Tign !== undefined && s.Tign !== null) add('Tign', tl('自燃温度'), kelvinText(s.Tign))
  return rows
}

export function substanceModel(entry: SubstanceEntry, ctx: SubstanceContext = {}): SubstanceModel {
  const cat = ctx.catalogue ?? null
  const display = cat?.display ?? {}
  const m = entry.molecule
  let mass: number | null = entry.forms.find(f => typeof f.M === 'number')?.M ?? null
  if (mass === null && m && ctx.molarMass) mass = ctx.molarMass(m)

  const forms: FormModel[] = entry.forms.map(s => ({
    id: s.id, title: [display[s.id]?.name ? T3(display[s.id].name) : display[s.id]?.f ?? catalogueFormula(s.id), phaseLabel(s.phase)].join(' · '), rows: formRows(s),
    solubility: s.solubility?.points?.length ? s.solubility.points : null, note: s.note ?? ''
  }))

  // What dissolves from it and has a display spectrum
  const dissolved = new Set<string>(entry.species.filter(id => !/\(g\)$/.test(id)))
  for (const f of entry.forms) for (const k of Object.keys(f.dissolves ?? {})) if (!SPECTATORS.has(k)) dissolved.add(k)
  const coloured = [...dissolved].filter(id => cat?.spectra?.[id])
  const solid = entry.forms.filter(f => f.phase === 's').map(f => display[f.id]?.color).find(Boolean) ?? null

  // Reagents of the shelf that are this substance: the pure substance, or a solution of exactly what it dissolves into
  const pure = new Set(entry.species)
  const ionSets = entry.forms.map(f => Object.keys(f.dissolves ?? {}).filter(k => k !== 'H2O').sort().join('|')).filter(Boolean)
  const reagents = (cat?.reagents ?? []).filter(r => {
    const keys = Object.keys(r.recipe?.species ?? {})
    if (!keys.length) return false
    if (keys.length === 1 && pure.has(keys[0])) return true
    return r.kind === 'solution' && ionSets.includes([...keys].sort().join('|'))
  }).map(r => ({ id: r.id, text: [r.label, r.name ? T3(r.name) : r.id].filter(Boolean).join(' ') }))

  const direct = new Set(entry.species)
  const ions = new Set([...dissolved].filter(id => !direct.has(id)))
  const reactions: ReactionModel[] = []
  for (const r of cat?.reactions ?? []) {
    const keys = [...Object.keys(r.eq ?? {}), ...(r.between ?? [])]
    const hit = keys.some(k => direct.has(k))
    const via = !hit && keys.some(k => ions.has(k))
    if (!hit && !via) continue
    reactions.push({ id: r.id, name: typeof r.name === 'string' ? r.name : T3(r.name) || r.id, equation: r.eq ? equationText(r.eq, cat) : null, note: T3(r.note), teaching: !!r.teaching, viaIons: via })
  }
  reactions.sort((a, b) => Number(a.viaIons) - Number(b.viaIons))

  const bySymbol = new Map((ctx.elements ?? []).map(e => [e.symbol, e]))
  const sources: string[] = []
  if (m?.sources?.length) for (const k of m.sources) if (ctx.references?.[k]) sources.push(ctx.references[k])
  const srcKeys = new Set<string>()
  for (const f of entry.forms) for (const k of `${f.src ?? ''};${f.propSrc ?? ''};${f.solubility?.src ?? ''}`.split(/[;,]\s*/)) if (k.trim()) srcKeys.add(k.trim())
  const subSources = cat?.sources?.substances ?? {}
  for (const k of srcKeys) sources.push(subSources[k] ?? k)
  if (coloured.length) sources.push(tl('溶液颜色由目录中的显示用吸收光谱经朗伯–比尔定律算出，是近似。'))
  if (reactions.length && cat?.sources?.reactions?.school) sources.push(cat.sources.reactions.school)

  return {
    id: entry.id, title: T3(entry.name) || entry.formula, formula: entry.formula, names: entry.name,
    categoryText: entry.category ? T3(ctx.categories?.find(c => c.id === entry.category)?.name) || null : null,
    molarMass: unit(mass === null ? null : m && !entry.forms.length ? withDecimal(mass.toFixed(3)) : plain(mass), 'g/mol'), charge: m?.charge ?? 0,
    molecule: m, method: m?.method ?? null, methodText: m ? methodLabel(m.method) : null, references: (m?.sources ?? []).map(k => ctx.references?.[k]).filter((x): x is string => !!x),
    crystals: entry.crystals.map(c => ({ id: c.id, label: T3(c.name), spec: { structure: c.structure, a: c.a, b: c.b, c: c.c, alpha: c.alpha, beta: c.beta, gamma: c.gamma, basis: c.basis }, note: c.note ? T3(c.note) : '' })),
    forms, solidColour: solid, colourSpecies: coloured.length ? Object.fromEntries(coloured.map(id => [id, COLOUR_CONC])) : null, reagents, reactions,
    elements: entry.elements.map(s => ({ symbol: s, name: T3(bySymbol.get(s)?.name) || s })), sources: [...new Set(sources)]
  }
}

// ---- Search ----

export interface SearchItem { kind: 'element' | 'substance'; id: string; title: string; detail: string; hay: string[] }

/** Lower case, subscripts and superscripts as plain digits and signs, no spaces. */
export function foldFormula(s: string): string {
  const map: Record<string, string> = { '⁺': '+', '⁻': '-', '·': '.' }
  '₀₁₂₃₄₅₆₇₈₉'.split('').forEach((c, i) => { map[c] = String(i) })
  '⁰¹²³⁴⁵⁶⁷⁸⁹'.split('').forEach((c, i) => { map[c] = String(i) })
  return [...s.normalize('NFC')].map(c => map[c] ?? c).join('').toLowerCase().replace(/\s+/g, '')
}

/** Everything the search of the encyclopedia finds: names in the three languages, symbols and formulas. */
export function searchItems(elements: ElementRecord[], substances: SubstanceEntry[]): SearchItem[] {
  const items: SearchItem[] = elements.map(e => ({ kind: 'element', id: e.symbol, title: `${e.symbol} ${T3(e.name)}`, detail: `${e.z} · ${categoryLabel(e.category)}`, hay: [e.symbol, e.name.zh, e.name.en, e.name.de, String(e.z)].map(foldFormula) }))
  for (const s of substances) items.push({ kind: 'substance', id: s.id, title: T3(s.name) || s.formula, detail: s.formula, hay: [s.raw, s.formula, s.name?.zh ?? '', s.name?.en ?? '', s.name?.de ?? '', s.id].filter(Boolean).map(foldFormula) })
  return items
}

/** The best matches of a query: an exact symbol, formula or name first, then names that start with it, then the rest. */
export function search(items: SearchItem[], query: string, limit = 12): SearchItem[] {
  const q = foldFormula(query)
  if (!q) return []
  const scored: Array<[number, number, SearchItem]> = []
  items.forEach((it, i) => {
    let best = 0
    for (const h of it.hay) {
      const s = h === q ? 4 : h.startsWith(q) ? 3 : h.includes(q) ? 1 : 0
      if (s > best) best = s
    }
    // an element before a substance of the same rank: "Cu" is copper before it is CuO
    if (best) scored.push([best * 2 + (it.kind === 'element' ? 1 : 0), i, it])
  })
  return scored.sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, limit).map(s => s[2])
}
