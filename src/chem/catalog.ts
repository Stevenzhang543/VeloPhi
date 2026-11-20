/**
 * The catalogue as the bench's interface reads it (26.64; engine/CHEM.md, "Data files"): the reagents of the shelf,
 * and the names, formulas and colours of species for display. The core gets the same file through `loadChemistry`;
 * here it is kept for its texts. Names come from the catalogue (`reagents[].name`, `display[id].name`), not from the
 * interface's translation tables; a species the catalogue does not describe is shown by its formula, typeset from
 * its id.
 */
import { shallowRef } from 'vue'
import { loadChemistry } from '../engine/chem'
import { activeLang } from '../i18n/locale'
import type { Tri } from '../i18n/tri'

export type ReagentKind = 'solution' | 'solid' | 'liquid' | 'gas'
export interface Reagent { id: string; name?: Tri; group?: string; kind: ReagentKind; label?: string; recipe: { water_kg?: number; species: Record<string, number> }; rho?: number; form?: string; hazard?: string[] }
export interface DisplayEntry { f?: string; name?: Tri; color?: [number, number, number]; texture?: string }
export interface Substance { id: string; formula?: string; comp?: Record<string, number>; phase: string; M?: number; rho?: number }
export interface Reaction { id: string; name?: Tri | string; note?: Tri; eq: Record<string, number>; rate?: { law?: string }; effects?: string[]; flameColour?: string; class?: string; teaching?: boolean }
export interface Couple { id: string; ox: Record<string, number>; red: Record<string, number>; n: number; E0: number }
export interface Catalogue {
  reagents: Reagent[]
  display?: Record<string, DisplayEntry>
  substances?: Substance[]
  reactions?: Reaction[]
  couples?: Couple[]
  forms?: Record<string, unknown>
}

/** The catalogue in use (null until the chemistry data are loaded). */
export const catalogue = shallowRef<Catalogue | null>(null)

/** Use a catalogue for the texts (tests hand the core its data themselves). */
export function setCatalogue(c: Catalogue | null) { catalogue.value = c; index = null }

type Glob = (p: string) => Record<string, () => Promise<{ default: unknown }>>

let loading: Promise<Catalogue> | null = null

/**
 * Load the chemistry data into the core and keep the catalogue for its texts. Rejects when the data are not part of
 * the build.
 */
export function loadCatalogue(): Promise<Catalogue> {
  loading ??= (async () => {
    await loadChemistry()
    const files = (import.meta as unknown as { glob: Glob }).glob('./data/catalog.json')
    const f = files['./data/catalog.json']
    if (!f) throw new Error('chemistry data: catalog.json is not part of this build')
    const cat = (await f()).default as Catalogue
    setCatalogue(cat)
    return cat
  })()
  loading.catch(() => { loading = null })
  return loading
}

// ---- Texts ----

let index: { reagents: Map<string, Reagent>; reactions: Map<string, Reaction>; substances: Map<string, Substance> } | null = null
function idx() {
  const c = catalogue.value
  index ??= { reagents: new Map((c?.reagents ?? []).map(r => [r.id, r])), reactions: new Map((c?.reactions ?? []).map(r => [r.id, r])), substances: new Map((c?.substances ?? []).map(s => [s.id, s])) }
  return index
}

export function reagentOf(id: string): Reagent | undefined { return idx().reagents.get(id) }
export function reactionOf(id: string): Reaction | undefined { return idx().reactions.get(id) }
export function substanceOf(id: string): Substance | undefined { return idx().substances.get(id) }

const SUB: Record<string, string> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' }
const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻' }

/**
 * A formula typeset from a species id of the database: `Zn+2` → Zn²⁺, `CO3-2` → CO₃²⁻, `H2(g)` → H₂, `Cu(OH)2(s)` →
 * Cu(OH)₂. Names without a formula (minerals: `Calcite`) come back as they are.
 */
export function prettyFormula(id: string): string {
  let s = id.replace(/\((s|l|g|aq|a|am|c)\)$/, '')
  let charge = ''
  const m = /([+-])(\d*)$/.exec(s)
  if (m && m.index > 0) {
    s = s.slice(0, m.index)
    charge = (m[2] && m[2] !== '1' ? [...m[2]].map(c => SUP[c]).join('') : '') + SUP[m[1]]
  }
  // digits after a letter or a closing bracket are counts
  s = s.replace(/([A-Za-z)\]])(\d+)/g, (_x, a: string, d: string) => a + [...d].map(c => SUB[c]).join(''))
  return s + charge
}

/** The formula of a species: the catalogue's, else typeset from the id. */
export function speciesFormula(id: string): string { return catalogue.value?.display?.[id]?.f ?? prettyFormula(id) }

/** The name of a species in the interface language; its formula when the catalogue has no name. */
export function speciesName(id: string): string {
  const n = catalogue.value?.display?.[id]?.name
  return n ? n[activeLang()] ?? n.zh : speciesFormula(id)
}

/** The colour of a solid or liquid as the catalogue gives it (sRGB 0–255); null when it gives none. */
export function speciesColour(id: string): [number, number, number] | null { return catalogue.value?.display?.[id]?.color ?? null }
export function speciesTexture(id: string): string | null { return catalogue.value?.display?.[id]?.texture ?? null }

/** The name of a reagent in the interface language (its id when the catalogue has no name). */
export function reagentName(r: Reagent | undefined, id = ''): string {
  if (!r) return id
  return r.name ? r.name[activeLang()] ?? r.name.zh : r.id
}

/** A reagent as the record writes it: “1 mol/L 盐酸”. */
export function reagentText(id: string): string {
  const r = reagentOf(id)
  const name = reagentName(r, id)
  return r?.label ? `${r.label} ${name}` : name
}

/** The first species of a reagent's recipe (what a pure substance is; the main solute of a solution). */
export function reagentSpecies(r: Reagent): string | null { return Object.keys(r.recipe?.species ?? {})[0] ?? null }

/** The units a reagent may be measured in, the default first (engine/CHEM.md, action `add`). */
export function unitsFor(r: Reagent): Array<'mL' | 'drop' | 'L' | 'g' | 'mg' | 'kg' | 'mol' | 'mmol'> {
  if (r.kind === 'solution') return ['mL', 'drop', 'L', 'g']
  if (r.kind === 'liquid') return ['mL', 'drop', 'g', 'mol', 'mmol']
  if (r.kind === 'gas') return ['mL', 'L', 'mmol', 'mol', 'g']
  return ['g', 'mg', 'mmol', 'mol']
}

/** A sensible first amount for a reagent in a unit. */
export function defaultAmount(r: Reagent, unit: string): number {
  if (unit === 'mL') return r.kind === 'gas' ? 100 : 20
  if (unit === 'drop') return 2
  if (unit === 'L') return r.kind === 'gas' ? 0.1 : 0.02
  if (unit === 'g') return r.kind === 'solid' ? 1 : 20
  if (unit === 'mg') return 500
  if (unit === 'kg') return 0.001
  if (unit === 'mmol') return 10
  return 0.01
}

/** Electrode materials on offer: those of a list the catalogue knows as a substance (or as the reduced side of a couple). */
export function knownMaterials(candidates: string[]): string[] {
  const c = catalogue.value
  if (!c) return []
  const known = new Set<string>([...(c.substances ?? []).map(s => s.id), ...Object.keys(c.display ?? {}), ...(c.couples ?? []).flatMap(k => Object.keys(k.red))])
  return candidates.filter(m => known.has(m))
}
