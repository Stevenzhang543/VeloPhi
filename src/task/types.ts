/**
 * The task contract (26.57, D110; manual §6.5, §10.2–10.4): what a problem asks, kept apart from what the scene
 * shows. A task names the objects it is about, the known values with their source, the frames and the
 * conditions of the evaluation, and its targets as quantity references with an evaluation point. Results come back
 * as envelopes that carry the task revision and the scene hash they were computed for, so a late answer to an old
 * question never reaches the screen (VP-05, T14).
 *
 * The old problem targets (teaching/problems.ts), the prediction targets (analysis/prediction.ts) and the activity
 * questions keep their formats; task/adapters.ts maps them onto these types.
 */

/** Version of the task file format (the old problem files have no task and stay version 1). */
export const TASK_SCHEMA = 2

/** The six task domains of the first phase (manual §6.9, §13.1 C). */
export type TaskDomain = 'incline' | 'projectile' | 'collision' | 'circuit' | 'lens' | 'field'

/** Component of a quantity in its frame. `signed` is the component along the frame's positive axis of a 1-D frame. */
export type Component = 'x' | 'y' | 'tangent' | 'normal' | 'magnitude' | 'signed'

/** A quantity reference (manual §6.5): which quantity, of which objects, in which frame and component. */
export interface QuantityRef {
  /** Stable id, e.g. "blockA.speed". */
  id: string
  /** Task entities (keys of `entityBindings`). */
  entityIds: string[]
  /** Quantity kind from task/vocab.ts QUANTITIES. */
  quantity: string
  /** Frame id (task `frames`). */
  frameId: string
  component?: Component
  /** Relative to another entity (relative velocity). */
  relativeTo?: string
}

/**
 * When a target is evaluated (manual §6.5): a time, one side of an event, the first or every crossing of a
 * registered condition, an interval operation, or — for time-independent models (DC circuit, thin lens,
 * electrostatics) — the static state.
 */
export type EvaluationPoint =
  | { kind: 'time'; tSI: number }
  | { kind: 'event'; eventId: string; occurrence: number; side: 'before' | 'after' }
  | { kind: 'condition'; predicateId: string; crossing: 'first' | 'all'; intervalSI: [number, number] }
  | { kind: 'interval'; intervalSI: [number, number]; operation: 'function' | 'min' | 'max' | 'integral' }
  | { kind: 'static' }

/** What kind of answer a target wants. */
export type TargetKind = 'value' | 'function' | 'range' | 'critical' | 'graph' | 'explain' | 'prove'

/** A target of a task. */
export interface TaskTarget {
  id: string
  kind: TargetKind
  ref: QuantityRef
  at?: EvaluationPoint
  requestedUnit?: string
  /** 'nonnegative', 'positive', 'any', 'first', 'rising', 'falling' (root selection). */
  answerDomain?: string
}

/** Where a value or an assumption comes from (manual §10.4). */
export type EvidenceSource = 'stem' | 'image' | 'scene' | 'user' | 'default' | 'model' | 'measurement'

/** A known value: a reference into the task's entities (`blockA.mass`, `incline.theta`), SI value and source. */
export interface Given {
  ref: string
  valueSI: number
  /** SI unit of the value ('1' for a pure number, 'rad' for angles). */
  unit: string
  source: EvidenceSource
  /** The text it was read from and its position in the stem [start, end). */
  raw?: string
  span?: [number, number]
  /** Adopted, replaced by a later value, or in conflict with another source (manual §10.4). */
  status?: 'adopted' | 'overridden' | 'conflict'
  /** Task revision that set it. */
  revision?: number
}

/** A frame of the task. */
export interface FrameDef {
  id: string
  kind: 'ground' | 'incline'
  /** Origin, e.g. "blockA.initialPosition". */
  origin?: string
  /** Positive axis of a 1-D frame: down or up the incline, right, up. */
  positiveAxis?: 'downIncline' | 'upIncline' | 'right' | 'up'
}

/**
 * A registered condition (manual §6.6: “predicateId with a typed definition”): the along-frame displacement of an
 * entity equals a value, its height equals a value, a velocity component equals a value. Never free text.
 */
export interface TaskCondition {
  id: string
  kind: 'displacementEquals' | 'heightEquals' | 'velocityEquals'
  entity: string
  frameId: string
  component: Component
  valueSI: number
  /** Crossing direction: rising (increasing), falling or either. */
  direction?: 'rising' | 'falling' | 'any'
}

/** An assumption of the task (task/vocab.ts ASSUMPTIONS) and where it comes from. */
export interface Assumption { id: string; source: EvidenceSource }

/** One piece of evidence of the understanding summary (manual §10.4). */
export interface Evidence {
  id: string
  source: EvidenceSource
  raw: string
  span?: [number, number]
  /** What it was bound to: a given ref, a target id, an assumption id or an entity. */
  boundTo: string
  status: 'adopted' | 'overridden' | 'conflict' | 'ignored'
  revision: number
}

/** A task (schema 2). */
export interface TaskSpec {
  schemaVersion: typeof TASK_SCHEMA
  taskId: string
  revision: number
  domain: TaskDomain
  title?: string
  /** The problem text, when there is one. */
  stem?: { text: string; source: 'text' | 'pack' | 'scene' | 'manual' }
  /** Task entity → scene object id (filled when a scene is built or bound). */
  entityBindings: Record<string, string>
  givens: Given[]
  initialConditions: Given[]
  frames: FrameDef[]
  conditions: TaskCondition[]
  assumptions: Assumption[]
  targets: TaskTarget[]
  evidence?: Evidence[]
  /** Discrete choices of the domain: collision kind, circuit connection, lens kind. */
  options?: Record<string, string>
}

/** Task states (manual §10.2). UI transitions (animations) are not part of it. */
export type TaskState = 'draft' | 'parsed' | 'needsInput' | 'ready' | 'solving' | 'solved' | 'noSolution' | 'multiSolution' | 'failed' | 'stale' | 'outOfScope'

/** Physical applicability (manual §5.3) — the four states shared by formula cards, models and results. */
export type Applicability = 'applicable' | 'approximate' | 'inapplicable' | 'insufficient'

/** Computation state of one result (manual §10.3). */
export type Computation = 'pending' | 'solved' | 'stale' | 'failed' | 'noSolution' | 'multiSolution'

/** Kind of evidence behind a value (manual §5.6, §10.3). */
export type ProvenanceKind = 'analytic' | 'simulation' | 'measurement' | 'conservation' | 'sameSource' | 'otherAlgorithm'

/** A result of one target (manual §10.3). */
export interface ResultEnvelope {
  taskId: string
  taskRevision: number
  sceneHash: string
  runId: string
  engineVersion: string
  modelVersions: Record<string, string>
  constantsSet: string
  targetId: string
  applicability: Applicability
  computation: Computation
  value?: { scalarSI?: number; vectorSI?: number[]; unit: string; text?: string }
  /** Every mathematical solution with the conditions that select it (several roots, both phases). */
  alternatives?: Array<{ valueSI: number; conditions: string[]; chosen?: boolean }>
  at?: EvaluationPoint
  /** Time of the evaluation point when it was found (a crossing, an event). */
  atTimeSI?: number
  evidenceIds: string[]
  conditionChecks: Array<{ id: string; state: Applicability; reason: string }>
  provenance: { kind: ProvenanceKind; inputRefs: string[]; referenceId?: string }
  errorBudget?: { atolSI: number; rtol: number }
  /** Independent checks of this value: another method, its value and whether it agrees within the budget. */
  checks: CheckResult[]
  /** Why there is no value (computation failed, no solution, information missing). */
  reason?: string
}

/** An independent check of a result. */
export interface CheckResult {
  id: string
  kind: ProvenanceKind
  /** What was compared (Chinese source text, translated by the interface). */
  label: string
  labelParams?: Array<string | number>
  valueSI: number | null
  /** |q − q_ref| and whether it is within atol + rtol·max(|q|, |q_ref|). */
  delta: number | null
  pass: boolean | null
  note?: string
}

/** A step of the worked solution (determine the model → choose the law → relate → solve → check). */
export interface SolutionStep {
  id: string
  stage: 'model' | 'law' | 'relation' | 'solve' | 'check'
  /** Chinese source text with {0}… parameters (translated by the interface). */
  text: string
  params?: Array<string | number>
  /** KaTeX of the relation or the substitution. */
  tex?: string
  /** Model id and branch used. */
  model?: string
  branch?: string
  /** Targets this step belongs to. */
  targets: string[]
}

/** Outcome of solving a task. */
export interface SolveOutcome {
  state: TaskState
  results: ResultEnvelope[]
  steps: SolutionStep[]
  /** Phases met on the way (incline: slide up, stop, slide down). */
  phases: Array<{ id: string; label: string; t0: number; t1: number | null; branch: string }>
  /** Messages for the summary (Chinese source text). */
  notes: string[]
}
