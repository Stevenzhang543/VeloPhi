/**
 * The model registry calculator of the Rust core (26.56, D106; engine/velophi-core/src/modelcalc.rs) and the
 * provenance operations (D100 constants, D104 manifest). The interface sends inputs in SI and shows what comes back;
 * it never evaluates a model itself.
 */
import { calc, core } from './core'
import { registryJson } from '../content/models'

/** State of a condition or an output (FOR04). */
export type ModelState = 'applicable' | 'notApplicable' | 'insufficient' | 'approximate'

export interface ModelCondition { id: string; state: ModelState; missing?: string }
export interface ModelOutput {
  id: string
  unit: string
  state: ModelState
  value: number | null
  /** Value of a formula whose condition does not hold (shown struck through, never as the answer). */
  raw?: number
  branch?: string
  roots?: number[]
  rejected?: number[]
  solutions?: 'none' | 'one' | 'multiple'
  failed?: string[]
  missing?: string
  reason?: 'domain' | 'undefined' | 'noBranch' | 'branchInsufficient'
  trace?: number[]
}
export interface UsedConstant { id: string; value: number; unit: string; u: number; exact: boolean; origin: string }
export interface ModelResult {
  model: string
  constantsSet: string
  constantsSource: string
  domain: Array<{ input: string; value: number; min: number | null; max: number | null; open: boolean }>
  lets: Array<{ id: string; value: number | null; unit: string; missing?: string }>
  conditions: ModelCondition[]
  outputs: ModelOutput[]
  constants: UsedConstant[]
}

const installed = new WeakSet<object>()
let problems: Array<{ model: string; what: string; detail: string }> = []

/** Hand the registry to the core (once per loaded core); returns the problems found (none in a release). */
export function ensureModels() {
  const b = core()
  if (installed.has(b)) return problems
  problems = calc<{ models: number; problems: typeof problems }>({ op: 'setModels', models: registryJson() }).problems
  installed.add(b)
  return problems
}

/** Evaluate a model for inputs in SI (missing inputs: conditions and outputs that need them are 'insufficient'). */
export function evalModel(model: string, inputs: Record<string, number | null>, opts: { constantsSet?: string; trace?: boolean } = {}): ModelResult {
  ensureModels()
  return calc<ModelResult>({ op: 'modelEval', model, inputs, constantsSet: opts.constantsSet ?? 'CODATA2022', trace: !!opts.trace })
}

/** Solutions of a model for one unknown input such that an output takes a value. */
export interface SolveResult {
  model: string
  unknown: string
  target: string
  solutions: 'none' | 'one' | 'multiple'
  roots: Array<{ value: number; conditions: ModelCondition[]; output: ModelOutput | null }>
  range: [number, number]
}
export function invertModel(model: string, inputs: Record<string, number | null>, unknown: string, target: string, value: number, lo: number, hi: number, opts: { constantsSet?: string; samples?: number; log?: boolean } = {}): SolveResult {
  ensureModels()
  return calc<SolveResult>({ op: 'modelSolve', model, inputs, unknown, target, value, lo, hi, constantsSet: opts.constantsSet ?? 'CODATA2022', samples: opts.samples ?? 400, scale: opts.log ? 'log' : 'linear' })
}

/** A constant set. */
export interface ConstantSet { set: string; source: string; sets: string[]; constants: UsedConstant[] }
export function constantSet(set = 'CODATA2022'): ConstantSet { return calc<ConstantSet>({ op: 'constants', set }) }

/** Provenance of a run or a calculation (D104). */
export interface Manifest {
  core: string
  sceneFormat: number
  backend: string
  physicsVersion: string | null
  solver: string | null
  constantsSet: string
  constantsSource: string
  dataSets: Array<{ id: string; description: string }>
  inputSha256: string | null
  backends: Array<{ id: string; physicsVersion: string; solver: string }>
}
export function manifest(backend: string, input = '', constantsSet = 'CODATA2022'): Manifest {
  return calc<Manifest>({ op: 'manifest', backend, input, constantsSet })
}

/** The unit table of the core (tests compare it with formula/units.ts). */
export function coreUnits(): Array<{ unit: string; dim: number[] }> { return calc<{ units: Array<{ unit: string; dim: number[] }> }>({ op: 'units' }).units }
