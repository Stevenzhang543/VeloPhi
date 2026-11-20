/**
 * Nuclides, decay chains and the reactor workshop (26.64, D276–D278): typed wrappers of the operations of
 * `engine/velophi-chem/src/nuclear` and `reactor` (engine/CHEM.md). Every number comes from the core; this module
 * only loads the two data files on first use and hands them over (`nuclideSetData`, `reactorSetData`) — they are
 * never part of the start-up bundle.
 *
 * Data: NUBASE2020 / AME2020 (CC BY 3.0; `nuclideCitations()` must be shown where the data are shown) and the
 * teaching cross-sections of the reactor workshop (docs/chem/DATA_SOURCES.md).
 */
import { calc } from './core'

/** A diagnostic of the chemistry core: the interface renders the text; `unmodelled` is the source of the mark. */
export interface CoreDiagnostic { code: string; severity: 'info' | 'approx' | 'unmodelled' | 'error'; path?: string; params?: Record<string, unknown> }

// ---- data files, loaded on demand ----

let nuclideData: Promise<NuclideDataInfo> | null = null
let reactorData: Promise<{ materials: string[]; teaching: string }> | null = null

export interface NuclideDataInfo { nuclides: number; ground: number; isomers: number; stable: number; feeding: number; citations: string[]; licence: string }

/** Load the nuclide table (once) and install it in the core. */
export function loadNuclides(): Promise<NuclideDataInfo> {
  nuclideData ??= import('../chem/data/nuclides.json?raw').then(m => calc<NuclideDataInfo>({ op: 'nuclideSetData', data: JSON.parse(m.default) }))
  return nuclideData
}

/** Load the cross-section sets of the reactor workshop (once) and install them in the core. */
export function loadReactorData(): Promise<{ materials: string[]; teaching: string }> {
  reactorData ??= import('../chem/data/xs2g.json?raw').then(m => calc<{ materials: string[]; teaching: string }>({ op: 'reactorSetData', data: JSON.parse(m.default) }))
  return reactorData
}

/** Forget that the data were installed (tests that replace the core). */
export function resetNuclearData() { nuclideData = null; reactorData = null }

/** The citations the licence of the nuclide data requires. */
export async function nuclideCitations(): Promise<string[]> { return (await loadNuclides()).citations }

// ---- nuclides ----

export interface NuclideBranch { mode: string; to: string | null; sink: 'fission' | 'outside' | null; fraction: number; Q: number | null; isomerUnknown: string | null }
export interface NuclideRecord {
  id: string; symbol: string; Z: number; A: number; N: number; state: 0 | 1 | 2
  /** keV */ massExcess: number | null; /** u */ mass: number | null; /** keV */ binding: number | null; bindingPerNucleon: number | null
  stable: boolean; /** s; null: stable or not known */ halfLife: number | null; /** 1/s */ lambda: number | null; /** percent */ abundance: number
  flags: { massEstimated: boolean; halfLifeEstimated: boolean; halfLifeLimit: boolean; particleUnstable: boolean; modesOpen: boolean }
  /** as published */ decays: Array<{ mode: string; intensity: number | null }>
  /** computed by the core */ branches: NuclideBranch[]; branchSum: number
}
export interface Feeding { parent: string; mode: string; to: string; fraction: number }

export async function nuclideInfo(req: { ids?: string[]; Z?: number; A?: number; element?: string; feeding?: Feeding[] }): Promise<{ nuclides: NuclideRecord[]; missing: string[]; count: number }> {
  await loadNuclides()
  return calc({ op: 'nuclideInfo', ...req })
}

export interface NuclideChart { count: number; Z: Int32Array; N: Int32Array; state: Int32Array; halfLife: Float64Array; massExcess: Float64Array; abundance: Float64Array; mode: Int32Array; modes: string[]; citations: string[] }

/** The whole table as arrays, for the chart of nuclides. */
export async function nuclideChart(): Promise<NuclideChart> {
  await loadNuclides()
  return calc<NuclideChart>({ op: 'nuclideChart' })
}

/** A decay network given by the caller instead of the table (half-lives in seconds; absent or 0: stable). */
export interface DecayNetwork { nuclides: Array<{ id: string; halfLife?: number | null; lambda?: number }>; decays: Array<{ from: string; to: string; fraction?: number; mode?: string }> }
export interface DecayChain {
  nuclides: Array<{ id: string; stable: boolean; halfLife: number | null; lambda: number; generation: number }>
  edges: Array<{ from: number; to: number; mode: string; fraction: number; Q: number | null }>
  untracked: Array<{ from: number; reason: 'fission' | 'outside' | 'pruned' | 'unknown' | 'deficit'; fraction: number }>
  diagnostics: CoreDiagnostic[]
}
export interface ChainOptions { minBranch?: number; maxNuclides?: number; feeding?: Feeding[] }

/** The decay network below one or several parents, in topological order. */
export async function nuclideChain(parents: string | string[], opts: ChainOptions = {}): Promise<DecayChain> {
  await loadNuclides()
  return calc<DecayChain>({ op: 'nuclideChain', parents: Array.isArray(parents) ? parents : [parents], ...opts })
}

export interface DecayResult {
  nuclides: string[]; lambda: number[]; t: Float64Array
  /** nuclei and becquerel: one row of `t.length` values per nuclide */ N: Float64Array; A: Float64Array
  untracked: Float64Array; total: number; analytic: number; fallback: number; errorBound: number
  chain: DecayChain; diagnostics: CoreDiagnostic[]
}
export type DecayTimes = { times: number[] } | { grid: { tEnd: number; samples: number } }

/** The inventory in time, from the table. */
export async function nuclideDecay(inventory: Record<string, number>, when: DecayTimes, opts: ChainOptions & { unit?: 'N' | 'mol' | 'g' | 'Bq' } = {}): Promise<DecayResult> {
  await loadNuclides()
  return calc<DecayResult>({ op: 'nuclideDecay', inventory, ...when, ...opts })
}

/** The inventory in time for a network of the caller (needs no data file, so it is synchronous). */
export function networkDecay(network: DecayNetwork, inventory: Record<string, number>, when: DecayTimes, unit: 'N' | 'Bq' = 'N'): DecayResult {
  return calc<DecayResult>({ op: 'nuclideDecay', network, inventory, unit, ...when })
}

/** Row of a nuclide in `N` or `A` of a decay result. */
export function decayRow(r: DecayResult, values: Float64Array, id: string): Float64Array {
  const i = r.nuclides.indexOf(id)
  if (i < 0) return new Float64Array(0)
  return values.subarray(i * r.t.length, (i + 1) * r.t.length)
}

// ---- reactor ----

export interface Xs2g { D1: number; D2: number; a1: number; a2: number; s12: number; nf1: number; nf2: number; f1?: number; f2?: number }
export interface ReactorMaterial extends Xs2g { id: string }
export type BoundaryKind = 'vacuum' | 'marshak' | 'zeroFlux' | 'reflective' | number
export interface ReactorDoc {
  format?: 'velophi-reactor'; version?: 1
  grid: { nx: number; ny: number; pitch_cm: number; refine?: number }
  cells: Array<string | number>
  materials?: ReactorMaterial[]
  enrichment?: number; enrich?: Record<string, number>
  rods?: Record<string, { material: string; insertion: number }>
  boundary?: BoundaryKind | { left?: BoundaryKind; right?: BoundaryKind; bottom?: BoundaryKind; top?: BoundaryKind }
  height_cm?: number; axialBuckling?: number; power_W?: number
  thermal?: Record<string, number>
  loop?: { pump?: number; exchanger?: boolean; turbine?: boolean }
  protection?: { power?: number; period_s?: number; fuelT_K?: number; enabled?: boolean }
  detectors?: string[]; source_n_per_s?: number
}
export interface ReactorConditions { fuelT?: number; moderatorT?: number; coolantT?: number; void?: number; moderatorVoid?: number; coolantVoid?: number; xenon?: number; samarium?: number }
/** The state of a running reactor: plain data that goes back with the next request. */
export interface ReactorState {
  format: 'velophi-reactor-state'; version: 1; t: number; n: number; c: number[]
  fuelT: number; coolantT: number; moderatorT: number; inletT: number
  iodine: number; xenon: number; promethium: number; samarium: number
  decay: number[]; rods: number[]; targets: number[]; rodSpeed: number
  loop: { pump: number; exchanger: boolean; turbine: boolean }; shim: number; scram: boolean
  energy_J: number; electric_J: number
  trip: { reason: 'power' | 'period' | 'fuelTemperature' | 'manual'; t: number; value: number; limit: number } | null
  ended: { reason: 'coreDamage' | 'validity'; t: number; value: number; limit: number } | null
  step: number; stats: Record<string, number | null>; core: Record<string, unknown> | null; hash: string
}
export interface ReactorFeedback { alpha: Record<'fuelT' | 'moderatorT' | 'coolantT' | 'moderatorVoid' | 'coolantVoid' | 'xenon' | 'samarium', number>; generation: number; beta: number; fluxPerFission: number; sourceWeight: number; adjointConverged: boolean }
export interface Criticality {
  keff: number; rho: number; nx: number; ny: number; h_cm: number
  flux1: Float64Array; flux2: Float64Array; power: Float64Array; cellPower: Float64Array
  peak: number; iterations: number; restarts: number; residual: number; converged: boolean
  conditions: Required<Omit<ReactorConditions, 'void'>>; insertions: number[]
  detectors: Array<{ cell: string; flux1: number; flux2: number }>
  feedback?: ReactorFeedback; diagnostics: CoreDiagnostic[]
}

/** k_eff, flux and power distribution of a layout. Layouts that bring all their materials need no data file. */
export async function reactorCriticality(doc: ReactorDoc, opts: { conditions?: ReactorConditions; insertions?: number[]; state?: ReactorState; tol?: number; feedback?: boolean } = {}): Promise<Criticality> {
  if (doc.cells.some(c => typeof c === 'string' && !doc.materials?.some(m => m.id === c)) || doc.rods) await loadReactorData()
  return calc<Criticality>({ op: 'reactorCriticality', doc, ...opts })
}

export interface ReactorMaterialInfo { id: string; kind: string; xs: Xs2g; reference: Xs2g; name: { zh: string; en: string; de: string }; note: string; src: Record<string, string>; fuel?: { enrichment: number; adjustable: boolean; min: number; max: number; damage_K: number }; kInfinity?: number }
export interface ReactorMaterials { materials: ReactorMaterialInfo[]; sources: Record<string, string>; teaching: string; kinetics: { beta: number[]; lambda: number[]; betaTotal: number }; decayHeat: { lambda: number[]; a: number[] }; limits: { promptMargin: number; rebase: number; scramTime_s: number }; diagnostics: CoreDiagnostic[] }

export async function reactorMaterials(conditions?: ReactorConditions, enrichment?: number): Promise<ReactorMaterials> {
  await loadReactorData()
  return calc<ReactorMaterials>({ op: 'reactorMaterials', ...(conditions ? { conditions } : {}), ...(enrichment === undefined ? {} : { enrichment }) })
}

export interface ReactorControls { rods?: number | Record<string, number>; rodSpeed?: number; pump?: number; exchanger?: boolean; turbine?: boolean; shim?: number; scram?: boolean; resetTrip?: boolean }
export type ReactorSeriesName = 'n' | 'rho' | 'rhoStatic' | 'rhoFeedback' | 'period' | 'fuelT' | 'fuelPeakT' | 'coolantT' | 'moderatorT' | 'inletT' | 'outletT' | 'void' | 'iodine' | 'xenon' | 'promethium' | 'samarium' | 'decayHeat' | 'thermal_W' | 'electric_W' | 'flow' | 'rods' | 'precursors'
export interface ReactorRun {
  state: ReactorState; t: Float64Array; series: Record<ReactorSeriesName, Float64Array>; samples: number
  events: Array<{ t: number; kind: 'trip' | 'coreDamage' | 'validity'; reason?: string; value: number; limit: number }>
  detectors: Array<{ cell: string; flux: number }>; solves: number; steps: number; partial: boolean; beta: number
  diagnostics: CoreDiagnostic[]
}

/**
 * Advance a reactor by `dt` seconds. Without `state` a new one is made from `init`: cold and shut down, or with
 * `power` in equilibrium at that power (`search`: with the rods where the reactor is critical).
 */
export async function reactorAdvance(doc: ReactorDoc, req: { state?: ReactorState; dt: number; samples?: number; controls?: ReactorControls; init?: { power?: number; search?: boolean; rods?: number; coldT?: number }; maxSolves?: number }): Promise<ReactorRun> {
  await loadReactorData()
  return calc<ReactorRun>({ op: 'reactorAdvance', doc, ...req })
}

export interface ReactorBalance { entries: Array<{ id: 'excess' | 'fuelTemperature' | 'moderatorTemperature' | 'xenon' | 'samarium' | 'rods' | 'shim'; rho: number; k: number }>; keff: number; rhoStatic: number; rho: number; beta: number; solves: number; diagnostics: CoreDiagnostic[] }

/** The reactivity budget: what the temperatures, the poisons and the rods each take. */
export async function reactorBalance(doc: ReactorDoc, state?: ReactorState): Promise<ReactorBalance> {
  await loadReactorData()
  return calc<ReactorBalance>({ op: 'reactorBalance', doc, ...(state ? { state } : {}) })
}

export type ReactorPresetId = 'pwrLattice' | 'graphitePile' | 'heavyWater' | 'research'

export async function reactorPresets(): Promise<Array<{ id: ReactorPresetId; doc: ReactorDoc }>> {
  await loadReactorData()
  return calc<{ presets: Array<{ id: ReactorPresetId; doc: ReactorDoc }> }>({ op: 'reactorPresets' }).presets
}

export type ReactorTask = 'critical' | 'power' | 'xenonRestart' | 'lossOfCooling' | 'minimalChange' | 'refuel'
export interface TaskResult { task: ReactorTask; passed: boolean; checks: Array<{ id: string; ok: boolean; value: number; limit: number }>; diagnostics: CoreDiagnostic[] }

export async function reactorTaskCheck(task: ReactorTask, doc: ReactorDoc, more: { state?: ReactorState; start?: ReactorDoc; series?: { t: number[]; n: number[] } } & Record<string, unknown> = {}): Promise<TaskResult> {
  await loadReactorData()
  return calc<TaskResult>({ op: 'reactorTaskCheck', task, doc, ...more })
}

export interface KineticsRun { t: Float64Array; n: Float64Array; rho: Float64Array; period: Float64Array; precursors: Float64Array; samples: number; beta: number; limit: number; generation: number; inhour: { rho: number; omega: number | null; period: number | null }; promptJump: number | null; ended: { reason: 'validity'; t: number; value: number; limit: number } | null; diagnostics: CoreDiagnostic[] }

/** Point kinetics alone: the power after reactivity steps, the stable period of the in-hour equation. */
export function reactorKinetics(req: { rho?: number; steps?: Array<[number, number]>; duration: number; samples?: number; generation?: number; n0?: number; source?: number; rtol?: number }): KineticsRun {
  return calc<KineticsRun>({ op: 'reactorKinetics', ...req })
}

export interface PoisonLevels { iodine: number; xenon: number; promethium: number; samarium: number }
export interface PoisonRun { t: Float64Array; iodine: Float64Array; xenon: Float64Array; promethium: Float64Array; samarium: Float64Array; equilibrium: PoisonLevels; atShutdown: PoisonLevels | null; peak: { after: number; xenon: number; ratio: number } | null; xenonAbsorption: number; diagnostics: CoreDiagnostic[] }

/** The xenon and samarium chains alone, for a given fission rate (1/(cm³ s)) and thermal flux (1/(cm² s)). */
export async function reactorPoisons(req: { fissionRate: number; flux: number; duration: number; samples?: number; start?: 'clean' | 'equilibrium'; shutdownAt?: number; rtol?: number }): Promise<PoisonRun> {
  await loadReactorData()
  return calc<PoisonRun>({ op: 'reactorPoisons', ...req })
}
