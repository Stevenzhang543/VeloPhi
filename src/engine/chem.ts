/**
 * The chemistry core as seen from TypeScript (26.64, D261; engine/CHEM.md): the aqueous equilibrium and the species
 * database as stateless calculations, and the bench — vessels, reagents, the log of actions — as a session held by
 * the core. The interface edits, draws and shows; every number here comes back from Rust.
 *
 * The data (the aqueous network and the catalogue) are not part of the core: `loadChemistry()` fetches them on first
 * use (their own chunks, never in the start-up bundle) and hands them over once.
 */
import { calc, core, failCore, jsonBytes, parseContainer } from './core'

/** What a model could not do, or did approximately: rendered by the interface from its code (`unmodelled` is the “未建模” mark). */
export interface Diagnostic { code: string; severity: 'info' | 'approx' | 'unmodelled' | 'error'; path?: string; params?: Record<string, unknown> }

/** Counts returned when the data are set. */
export interface ChemCounts { components: number; species: number; aqueous: number; solids: number; gases: number; reagents: number; reactions: number; couples: number; unknownForms: string[]; diagnostics: Diagnostic[] }

/** A species of the database. */
export interface SpeciesInfo { id: string; phase: 'aq' | 's' | 'l' | 'g'; z: number; comp: Record<string, number>; M: number; component: boolean; rxn: Record<string, number>; logK25: number; dH25: number; forms: boolean; src: string }

/** One equilibrium request: amounts of species (mol), optionally water by mass, the solids that may form, a gas phase. */
export interface EquilibriumRequest {
  T?: number
  amounts: Record<string, number>
  water_kg?: number
  solids?: 'forms' | 'all' | 'none' | string[]
  gas?: { volume_L?: number; pressure_atm?: number; species?: string[] }
  guess?: Array<number | null>
  minMolality?: number
}

/** An equilibrium state, or `ok: false` with the reason: unconverged numbers are never returned. */
export interface EquilibriumResult {
  ok: boolean
  T: number
  pH: number
  I: number
  aw: number
  water_kg: number
  charge: number
  iterations: number
  species: Array<{ id: string; m: number; n: number; gamma: number; a: number }>
  solids: Array<{ id: string; n: number }>
  gas: Array<{ id: string; n: number }>
  si: Array<{ id: string; si: number }>
  pressures: Array<{ id: string; p: number }>
  lnA: Array<number | null>
  diagnostics: Diagnostic[]
}

/** Hand the data to the core (tests; the application uses `loadChemistry`). */
export function setChemData(aqueous: unknown, catalog?: unknown, forms?: string[]): ChemCounts {
  return calc<ChemCounts>({ op: 'chemSetData', aqueous, catalog, forms })
}

/** Species by id, or all of a phase. */
export function chemSpecies(sel: { ids?: string[]; phase?: 'aq' | 's' | 'l' | 'g' } = {}): { species: SpeciesInfo[]; components: string[] } {
  return calc({ op: 'chemSpecies', ...sel })
}

/** The equilibrium of a mixture. */
export function chemEquilibrium(req: EquilibriumRequest): EquilibriumResult {
  return calc<EquilibriumResult>({ op: 'chemEquilibrium', ...req })
}

/** Balance an equation: species ids or formulas on each side. */
export function chemBalance(reactants: string[], products: string[]): { balanced: true; coefficients: number[] } | { balanced: false; reason: 'impossible' | 'notUnique' | 'formula'; independent?: number; term?: string } {
  return calc({ op: 'chemBalance', reactants, products })
}

/** Hand the gas data (`velophi-chemgas`) to the core. */
export function setGasData(gas: unknown): { species: number; elements: string[] } {
  return calc({ op: 'gasSetData', gas })
}

/** Standard-state values of gas species: cp, s in J/(mol·K); h, g in J/mol (h includes the enthalpy of formation). */
export function gasThermo(ids: string[], T = 298.15): { T: number; P0: number; values: Array<{ id: string; cp: number; h: number; s: number; g: number; extrapolated: boolean }> } {
  return calc({ op: 'gasThermo', ids, T })
}

/** Standard changes and ln K of a gas reaction `{ id: ν }` (products positive). */
export function gasReaction(species: Record<string, number>, T = 298.15): { T: number; dH: number; dS: number; dG: number; lnK: number; log10K: number; dn: number; balanced: boolean; extrapolated: boolean } {
  return calc({ op: 'gasReaction', species, T })
}

export interface GasRequest { amounts: Record<string, number>; T?: number; pressure_atm?: number; volume_L?: number; adiabatic?: boolean; species?: string[]; minFraction?: number }
export interface GasResult {
  ok: boolean
  T: number; P_atm: number; V_L: number; n: number
  species: Array<{ id: string; n: number; x: number }>
  H: number; U: number; S: number; G: number; cp: number
  mass_g: number; density: number; iterations: number; adiabatic: boolean
  initial: { T: number; P_atm: number; V_L: number; H: number; U: number }
  diagnostics: Diagnostic[]
}

/** Equilibrium of a gas mixture at a temperature, or adiabatically (flame temperature). `ok: false` carries only diagnostics. */
export function gasEquilibrium(req: GasRequest): GasResult {
  return calc<GasResult>({ op: 'gasEquilibrium', ...req })
}

/** sRGB, 0 … 255. */
export type Rgb = [number, number, number]

/** Colour of white light after a layer of solution or gas (Beer–Lambert over the display spectra of the catalogue). */
export function chemColour(species: Record<string, number>, path_cm = 1): { rgb: Rgb; absorbance: number[]; wavelengths: number[]; colourless: string[] } {
  return calc({ op: 'chemColour', species, path_cm })
}

/** The stored display spectrum of a species: ε in L/(mol·cm) at 400 … 700 nm; `epsilon` null when it has none. */
export function chemSpectrum(id: string): { id: string; wavelengths?: number[]; epsilon: number[] | null } {
  return calc({ op: 'chemSpectrum', id })
}

/** Colour of a flame holding these elements; `rgb` null when none of them colours it. */
export function chemFlame(elements: string[]): { rgb: Rgb | null; lines: Array<{ element: string; nm: number; power: number; rgb: Rgb | null }>; none: string[] } {
  return calc({ op: 'chemFlame', elements })
}

/** log10 K and ΔH (J/mol) of formation reactions at a temperature. */
export function chemLogK(ids: string[], T = 298.15): { T: number; values: Array<{ id: string; logK: number; dH: number }>; dhA: number; dhB: number } {
  return calc({ op: 'chemLogK', ids, T })
}

let loading: Promise<ChemCounts> | null = null

/**
 * Load the chemistry data and hand them to the core of this thread (once). The JSON files are separate chunks.
 * Rejects when a file is missing from the build.
 */
export function loadChemistry(): Promise<ChemCounts> {
  loading ??= (async () => {
    const files = (import.meta as unknown as { glob: (p: string) => Record<string, () => Promise<{ default: unknown }>> }).glob('../chem/data/{aqueous,catalog,gas}.json')
    const get = async (name: string) => {
      const f = files[`../chem/data/${name}.json`]
      if (!f) throw new Error(`chemistry data: ${name}.json is not part of this build`)
      return (await f()).default
    }
    const [aqueous, catalog, gas] = await Promise.all([get('aqueous'), get('catalog'), get('gas')])
    setGasData(gas)
    return setChemData(aqueous, catalog)
  })()
  loading.catch(() => { loading = null })
  return loading
}

// ---- The bench (D268) ----

/** Amount of a reagent or of a liquid poured. */
export interface Amount { value: number; unit: 'mL' | 'L' | 'drop' | 'g' | 'mg' | 'kg' | 'mol' | 'mmol' | 'fraction' }

/** How a vessel collects the gas delivered to it: over water, by upward or downward displacement of air, or not. */
export type CollectMode = 'none' | 'water' | 'up' | 'down'

/** An object on the bench: the core reads these fields and keeps every other one (positions, labels) as given. */
export interface BenchObject { id: string; kind: string; capacity_mL?: number; heat_J_K?: number; loss_W_K?: number; closed?: boolean; collect?: CollectMode; [drawing: string]: unknown }
/** 26.65 (D297): a thing on the bench that is not a vessel (a stand, a burner, a reagent bottle, a tube): drawing only. */
export interface BenchFixture { id: string; kind: string; [drawing: string]: unknown }

/** One entry of the log. */
export type BenchAction =
  | { act: 'place'; object: BenchObject }
  | { act: 'remove'; id: string }
  | { act: 'add'; to: string; reagent: string; amount: Amount; T?: number }
  | { act: 'pour'; from: string; to: string; amount?: Amount; solids?: boolean }
  | { act: 'filter'; from: string; to: string }
  | { act: 'empty'; vessel: string }
  | { act: 'heat'; vessel: string; power: number }
  | { act: 'bath'; vessel: string; T: number | null }
  | { act: 'stopper'; vessel: string; on: boolean }
  | { act: 'connect'; from: string; to: string }
  | { act: 'disconnect'; from: string }
  | { act: 'collector'; vessel: string; mode: CollectMode }
  | { act: 'circuit'; id: string; a: { vessel: string; electrode: string }; b: { vessel: string; electrode: string }; bridge?: boolean; load?: number; source?: number }
  | { act: 'circuitSet'; id: string; load?: number; source?: number; bridge?: boolean; on?: boolean }
  | { act: 'circuitRemove'; id: string }
  | { act: 'ignite' | 'light'; vessel: string; on?: boolean }
  | { act: 'ambient'; T?: number; P?: number }
  | { act: 'wait'; seconds: number; times?: number }

/** A `velophi-bench` document. */
export interface BenchDoc {
  format: 'velophi-bench'
  version: 1
  engine?: string
  settings?: { ambientT?: number; ambientP?: number }
  objects: BenchObject[]
  custom?: unknown
  /** 26.65: the things that are not vessels, kept as given by the core. */
  fixtures?: BenchFixture[]
  log: BenchAction[]
}

/** What happened in an action. */
export interface BenchEvent { code: 'precipitate' | 'dissolved' | 'gas' | 'reaction' | 'boiling' | string; vessel: string; params: Record<string, unknown> }

/** A vessel as the bench draws it. */
export interface VesselState {
  id: string
  kind: string
  T: number
  volume_mL: number
  capacity_mL: number
  mass_g: number
  closed: boolean
  P: number
  heater: number
  bath: number | null
  ignited: boolean
  lit: boolean
  /** 26.65 (D297 item 9): broken (it holds nothing since), and what ran out of it onto the bench so far, mL. */
  cracked?: boolean
  spilled_mL?: number
  /** The vessel its delivery tube leads to. */
  outlet: string | null
  collect: CollectMode
  /** Volume of the gas it holds, mL at the room's pressure and its own temperature. */
  gas_mL: number
  solids: Array<{ id: string; form: string; n: number; g: number }>
  liquids: Array<{ id: string; n: number }>
  gas: Array<{ id: string; n: number }>
  released: Array<{ id: string; n: number }>
  solutes: Array<{ id: string; n: number }>
  pH?: number
  I?: number
  water_g?: number
  /** Light path through the vessel, cm. */
  width_cm: number
  /** Colour of the liquid: white light through `width_cm` (absent without liquid). */
  colour?: Rgb
  /** Absorbance per cm at 400, 420, … 700 nm. */
  absorbance?: number[]
  /** Colour of the gas in the head space. */
  gasColour?: Rgb
}

/** A vessel in full. */
export interface VesselReading extends VesselState {
  species?: Array<{ id: string; z: number; n: number; m: number; c: number; a: number }>
  water_mol?: number
  aw?: number
  si?: Array<{ id: string; si: number }>
  pressures?: Array<{ id: string; p: number }>
  heatCapacity: number
  diagnostics: Diagnostic[]
}

/** One electrode of a circuit. */
export interface PoleState { vessel: string; material: string; massChange_g: number; deposit: Array<{ id: string; n: number }> }

/** Two electrodes wired together: a galvanic cell, or an electrolysis when a source is in the circuit. */
export interface CircuitState {
  id: string
  a: PoleState
  b: PoleState
  bridge: boolean
  load: number
  source: number
  on: boolean
  connected: boolean
  /** Electromotive force of the cell, or the decomposition voltage under a source, V. */
  emf: number
  /** Current, A: positive when `a` is the anode. */
  I: number
  U: number
  P: number
  internal: number | null
  charge: number
  anode: 'a' | 'b' | null
  anodeCouple: string | null
  cathodeCouple: string | null
}

/** The bench as a whole. */
export interface BenchState { time: number; ambient: { T: number; P: number }; vessels: VesselState[]; circuits: CircuitState[]; log: number; canUndo: boolean; canRedo: boolean }

/** An empty bench document. */
export function emptyBench(): BenchDoc {
  return { format: 'velophi-bench', version: 1, objects: [], log: [] }
}

/** A bench held by the core. Free it when the page that owns it goes away. */
export class Bench {
  private constructor(private handle: number) {}

  /** Create a bench from a document (its log is replayed) or an empty one. Throws the core's message on failure. */
  static create(doc: BenchDoc = emptyBench()): Bench {
    const b = core()
    const h = b.chemSessionCreate(jsonBytes({ bench: doc }))
    if (!h) failCore(b)
    return new Bench(h)
  }

  private call<T>(req: { op: string } & Record<string, unknown>): T {
    const b = core()
    const out = b.chemSessionCall(this.handle, jsonBytes(req))
    if (!out) failCore(b)
    return parseContainer(out) as T
  }

  /** The document: objects, settings and the log — what a file or a share link holds. */
  document(): BenchDoc { return this.call<{ bench: BenchDoc }>({ op: 'document' }).bench }
  state(): BenchState { return this.call({ op: 'state' }) }
  /** One action. On failure the bench is unchanged and the core's message is thrown. */
  apply(action: BenchAction): { events: BenchEvent[]; state: BenchState } { return this.call({ op: 'apply', action }) }
  /** Let time pass (equal consecutive calls are one log entry and one step of undo). */
  advance(seconds: number): { events: BenchEvent[]; state: BenchState } { return this.call({ op: 'advance', seconds }) }
  undo(): BenchState { return this.call<{ state: BenchState }>({ op: 'undo' }).state }
  redo(): BenchState { return this.call<{ state: BenchState }>({ op: 'redo' }).state }
  read(vessel: string): VesselReading { return this.call({ op: 'read', vessel }) }
  clearReleased(): void { this.call({ op: 'clearReleased' }) }
  layout(objects: BenchObject[]): BenchObject[] { return this.call<{ objects: BenchObject[] }>({ op: 'layout', objects }).objects }
  /** 26.65: drawing fields of objects and, when given, the whole list of fixtures; returns both as the core keeps them. */
  layoutAll(objects: BenchObject[], fixtures?: BenchFixture[]): { objects: BenchObject[]; fixtures: BenchFixture[] } {
    return this.call<{ objects: BenchObject[]; fixtures?: BenchFixture[] }>(fixtures ? { op: 'layout', objects, fixtures } : { op: 'layout', objects }) as { objects: BenchObject[]; fixtures: BenchFixture[] }
  }
  /** Fingerprint of the state (the same log gives the same fingerprint on every build). */
  hash(): string { return this.call<{ hash: string }>({ op: 'hash' }).hash }
  free(): void { if (this.handle) { core().chemSessionFree(this.handle); this.handle = 0 } }
}
