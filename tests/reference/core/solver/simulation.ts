/**
 * Simulation driver: integrates mode by mode, locates events, applies impacts, re-determines the mode and
 * records the full state on the output grid t_k = k·Δt. Steps never cross a grid time, so every recorded
 * frame is an integration point and the whole recording is a pure function of the scene.
 *
 * Streaming (decision D26, docs/dev/STREAMING.md): frames are grouped in chunks of F frames (1 s by default). At
 * the start of every chunk the run takes a checkpoint — everything that influences the rest of the run — so a
 * chunk can be recomputed later from its checkpoint through the same code path, bit for bit (`rebuildChunk`).
 * A run is bounded (the scene's duration, or `SimOptions.duration`) or unbounded (duration null: it runs until
 * it is stopped by the user, by `settings.stopAt` or by permanent rest). Bounded runs keep the 26.49 limits and
 * fingerprint and give exactly the 26.49 recording; unbounded runs have a per-chunk step limit, no wall-clock
 * budget and a rolling fingerprint (core/record/fingerprint.ts).
 */
import type { Scene, StopKind } from '../../../../src/core/scene/types'
import { finiteDuration } from '../../../../src/core/scene/types'
import { Sha256 } from '../record/sha256'
import type { FrameChunk, FrameStore } from '../record/frames'
import { ChunkFrames, chunkSummary, framesPerChunk, newChunk } from '../record/frames'
import { CHAIN_START, chainDigest, chunkDigest, digestHex, hashEvents } from '../record/fingerprint'
import { compileModel } from './model'
import type { Mode, ModeSolution, System } from './dynamics'
import { AUX_BELT, AUX_DAMP, AUX_HEAT, AUX_WORK, TOL, buildSystem, derivative, energy, initialState, solveMode } from './dynamics'
import type { EventFn, EventType } from './events'
import { buildEventFns, eventMargin, locateEvent, rearm } from './events'
import type { ImpactResult } from './impact'
import { approaching, resolveImpact } from './impact'
import type { ModeChoice } from './modes'
import { describeMode, determineMode, stateMode } from './modes'
import { MOREAU, moreauStep } from './moreau'
import { project, resolveInitialOverlap } from './project'
import type { ProjectionInfo } from './project'
import type { Rhs, StepResult } from './integrators'
import { dopri5Step, eulerStep, gauss4Step, rk4Step } from './integrators'
import { computePoses, contactKin } from './kinematics'
import { ForceExprError } from './forceExpr'
import type { Message } from '../../../../src/i18n/message'
import { msg, sameMessage } from '../../../../src/i18n/message'
import { pow } from '../../../../src/core/math/dmath'
import type { Checkpoint } from './checkpoint'
import { decodeCheckpoint, encodeCheckpoint } from './checkpoint'
import { decodeMode, encodeMode } from './codec'

export { recordingHash } from '../record/fingerprint'

/** A time interval with one mode. */
export interface Segment {
  index: number
  t0: number
  t1: number
  mode: Mode
  /** State at t0 (after the event that opened the segment). */
  X0: Float64Array
  /** Compact mode description (describeMode). */
  label: string
  /** Cumulative impact loss before this segment (J). */
  impactLoss: number
  /** Computed by the Moreau–Jean fallback (reduced accuracy): the mode only describes the state for readouts. */
  reduced?: boolean
}

/** Kind of a state change reported at an event. */
export type ChangeType =
  | 'impact' | 'touch' | 'separate' | 'stick' | 'slip' | 'reverse' | 'leave' | 'slack' | 'taut' | 'switch' | 'timestep' | 'pulley'
  // 26.52 (D58, D59): slider end stops, torque-limited motors, rolling resistance
  | 'limit' | 'unlimit' | 'motorSlip' | 'motorLock' | 'rollStop' | 'rollStart'

/** One change at an event: an impact, a contact or rope change, or a switch of a variable force. */
export interface ChangeDetail {
  type: ChangeType
  /** Pair key "a|b", rope id, force id (switch), slider id (end stop) or motor id. */
  subject: string
  bodies: string[]
  /**
   * Impact data: normal impulse (N·s), relative normal velocity before and after (m/s), restitution, contact
   * point and normal.
   */
  impulse?: number
  vnBefore?: number
  vnAfter?: number
  restitution?: number
  point?: { x: number; y: number }
  normal?: { x: number; y: number }
  /**
   * Friction in the impact: tangential impulse on the first body along the contact tangent (N·s), relative
   * tangential velocity before and after (m/s).
   */
  tangentImpulse?: number
  vtBefore?: number
  vtAfter?: number
  /**
   * Switch of a variable force: index in model.switches, new branch, and whether it is a kink
   * (abs/min/max/clamp) rather than a jump.
   */
  switchIndex?: number
  branch?: number
  kink?: boolean
}

/** An event: the instant, the functions that fired, the resulting changes and the states before and after. */
export interface SimEvent {
  index: number
  t: number
  triggers: EventType[]
  changes: ChangeDetail[]
  before: Float64Array
  after: Float64Array
  impact: ImpactResult | null
  /** Segment starting at this event. */
  segment: number
}

/** Solver statistics of a run. */
export interface SimStats {
  /** Accepted steps. */
  steps: number
  /** Rejected steps (error too large). */
  rejected: number
  events: number
  locateIterations: number
  /** Largest projection corrections (see ProjectionInfo). */
  maxPositionCorrection: number
  maxVelocityCorrection: number
  /** Mode determinations without a fully consistent solution. */
  ambiguousModes: number
  /** Computing time (ms). */
  wallMs: number
}

/**
 * Why a run ended: its duration was reached, its stop condition (settings.stopAt) fired, permanent rest was
 * detected (unbounded runs), the user stopped or cancelled it, or an error (including limits) stopped it.
 */
export type StopReason = 'duration' | 'stopAt' | 'rest' | 'restApprox' | 'user' | 'error' | 'pulley'

/** Rolling fingerprint of a run up to time `t` (core/record/fingerprint.ts). */
export interface RollingFingerprint {
  /** hex(H_c) of the last closed chunk c. */
  hash: string
  /** Time of the last frame the chain covers (s). */
  t: number
  /** Closed chunks in the chain (c + 1). */
  chunks: number
}

/** The result of a simulation: frames (through `frames`), segments, events and diagnostics. */
export interface Recording {
  scene: Scene
  system: System
  dt: number
  /** Valid frames (a prefix while the run continues). */
  frameCount: number
  /** Length of one state vector. */
  size: number
  /**
   * Frame data: read it with frameState, frameSegment and frameImpactLoss (chunks may be evicted and recomputed
   * on demand; the arrays are not part of the interface).
   */
  frames: FrameStore
  segments: Segment[]
  events: SimEvent[]
  warnings: Message[]
  stats: SimStats
  completed: boolean
  /** User-facing reason the run stopped early; null when it completed. */
  error: Message | null
  /**
   * Final fingerprint: `recordingHash` of the states and events for a bounded run, the rolling fingerprint of
   * the whole run for an unbounded one; empty while the run continues.
   */
  hash: string
  /** Time from which the Moreau–Jean fallback computed the recording (reduced accuracy); null: never. */
  reducedFrom?: number | null
  /** The run has no fixed duration (settings.duration null): it grows until it is stopped. */
  unbounded?: boolean
  /** Why the run ended; absent while it continues. */
  stopReason?: StopReason
  /** Rolling fingerprint up to the last closed chunk (both kinds of run; the one shown for unbounded runs). */
  rolling?: RollingFingerprint | null
}

/** Options of a simulation run. */
export interface SimOptions {
  /**
   * Simulated time (s); null: unbounded; default: the scene's duration (`simulate` falls back to the scene's
   * legacyDuration when that is null).
   */
  duration?: number | null
  /** Wall-clock budget in ms (bounded runs only; the recording is kept up to where it stopped). */
  budgetMs?: number
  /** Called every ~0.1 s of simulated time; return false to stop. */
  progress?: (t: number, total: number) => boolean | void
  /** Events at one instant before the fallback starts (default 200). */
  maxEventsPerInstant?: number
  /**
   * When the event-driven solver piles up events — more than `events` within `window` seconds of simulated
   * time, or more than maxEventsPerInstant at one instant — the rest of the run is computed by the
   * Moreau–Jean fallback (reduced accuracy). false: stop with an error instead. Default 400 events / 0.05 s.
   */
  fallback?: { events: number; window: number } | false
  /** Length of a chunk of frames in simulated seconds (default 1; rounded to whole frames). */
  chunkSeconds?: number
  /**
   * Reuse the mode solution of the last right-hand-side evaluation in the event check (default true). The
   * reuse is result-neutral (docs/dev/STREAMING.md §3); false is a diagnostic that proves it.
   */
  solutionCache?: boolean
}

/** Accepted steps a bounded run may take (26.49 limit). */
export const MAX_STEPS = 5_000_000
/** Accepted steps an unbounded run may take within one chunk. */
export const MAX_STEPS_PER_CHUNK = 500_000

/** State of frame k (a read-only view). */
export function frameState(rec: Recording, k: number): Float64Array {
  return rec.frames.state(k)
}

/** Segment index of frame k. */
export function frameSegment(rec: Recording, k: number): number {
  return rec.frames.segment(k)
}

/** Cumulative impact loss up to frame k (J). */
export function frameImpactLoss(rec: Recording, k: number): number {
  return rec.frames.impactLoss(k)
}

/** Frame k can be read without recomputing a chunk (see FrameStore.cheap). */
export function frameIsCheap(rec: Recording, k: number): boolean {
  return rec.frames.cheap ? rec.frames.cheap(k) : true
}

/** All frame states of a recording as one contiguous array (tests, small exports). */
export function recordingStates(rec: Recording, from = 0, to = rec.frameCount): Float64Array {
  const out = new Float64Array((to - from) * rec.size)
  for (let k = from; k < to; k++) out.set(rec.frames.state(k), (k - from) * rec.size)
  return out
}

function unitStatus(mode: Mode): Map<string, { status: string; bodies: string[] }> {
  const m = new Map<string, { status: string; bodies: string[] }>()
  for (const u of mode.units) {
    if (u.points.length === 0) continue
    const st = u.friction === 'slide' ? (u.s > 0 ? 'slide+' : 'slide-') : u.friction
    m.set(u.pair.key, { status: st, bodies: [u.pair.X.id, u.pair.Y.id] })
  }
  return m
}

function diffModes(sys: System, prev: Mode | null, next: Mode, impact: ImpactResult | null): ChangeDetail[] {
  const out: ChangeDetail[] = []
  if (impact) {
    for (const p of impact.points) {
      if (p.kind === 'contact' && p.pair) {
        if (p.vnBefore < 0) {
          const c: ChangeDetail = { type: 'impact', subject: p.pair.key, bodies: [p.pair.X.id, p.pair.Y.id], impulse: p.impulse, vnBefore: p.vnBefore, vnAfter: p.vnAfter, restitution: p.restitution, point: { x: p.cx, y: p.cy }, normal: { x: p.nx, y: p.ny } }
          if (p.tangentImpulse !== undefined) { c.tangentImpulse = p.tangentImpulse; c.vtBefore = p.vtBefore; c.vtAfter = p.vtAfter }
          out.push(c)
        }
      } else if (p.kind === 'rope' && p.vnBefore < 0) {
        const r = sys.model.ropes[p.rope]
        out.push({ type: 'taut', subject: r.id, bodies: [r.a.body?.id ?? '', r.b.body?.id ?? ''].filter(Boolean), impulse: p.impulse, vnBefore: p.vnBefore, vnAfter: p.vnAfter })
      } else if (p.kind === 'limit' && p.vnBefore < 0) {
        const sl = sys.model.sliders[p.rope]
        out.push({ type: 'limit', subject: sl.id, bodies: [sl.a.body?.id ?? '', sl.b.body?.id ?? ''].filter(Boolean), impulse: p.impulse, vnBefore: p.vnBefore, vnAfter: p.vnAfter, restitution: p.restitution, point: { x: p.cx, y: p.cy }, normal: { x: p.nx, y: p.ny } })
      }
    }
  }
  if (!prev) return out
  const a = unitStatus(prev), b = unitStatus(next)
  const keys = new Set([...a.keys(), ...b.keys()])
  for (const key of [...keys].sort()) {
    const pa = a.get(key), pb = b.get(key)
    const bodies = (pa ?? pb)!.bodies
    if (!pa && pb) { if (!out.some(c => c.type === 'impact' && c.subject === key)) out.push({ type: 'touch', subject: key, bodies }) }
    else if (pa && !pb) out.push({ type: 'separate', subject: key, bodies })
    else if (pa && pb && pa.status !== pb.status) {
      const was = pa.status, now = pb.status
      if (was.startsWith('slide') && now === 'stick') out.push({ type: 'stick', subject: key, bodies })
      else if (was === 'stick' && now.startsWith('slide')) out.push({ type: 'slip', subject: key, bodies })
      else if (was.startsWith('slide') && now.startsWith('slide')) out.push({ type: 'reverse', subject: key, bodies })
    }
  }
  sys.model.ropes.forEach((r, k) => {
    const bodies = [r.a.body?.id ?? '', r.b.body?.id ?? ''].filter(Boolean)
    if (prev.taut[k] && !next.taut[k]) out.push({ type: 'slack', subject: r.id, bodies })
    else if (!prev.taut[k] && next.taut[k] && !out.some(c => c.type === 'taut' && c.subject === r.id)) out.push({ type: 'taut', subject: r.id, bodies })
  })
  const model = sys.model
  if (prev.sw && next.sw) {
    for (let k = 0; k < next.sw.length; k++) {
      if (prev.sw[k] === next.sw[k]) continue
      const f = model.forces[model.switchForce[k]], def = model.switches[k]
      out.push({ type: 'switch', subject: f.id, bodies: f.a.body ? [f.a.body.id] : [], switchIndex: k, branch: next.sw[k], kink: !def.jump })
    }
  }
  // 26.52: rolling resistance of closed units of the same pair in both modes, in unit order
  for (const u of next.units) {
    if (u.points.length === 0 || u.roll === undefined) continue
    const p = prev.units.find(q => q.pair === u.pair && q.points.length > 0 && q.roll !== undefined)
    if (!p || p.roll === u.roll) continue
    const bodies = [u.pair.X.id, u.pair.Y.id]
    if (u.roll === 0) out.push({ type: 'rollStop', subject: u.pair.key, bodies })
    else if (p.roll === 0) out.push({ type: 'rollStart', subject: u.pair.key, bodies })
  }
  // 26.52: slider end stops and torque-limited motors
  if (prev.limit && next.limit) {
    model.sliders.forEach((sl, k) => {
      const a = prev.limit![k], b = next.limit![k]
      if (a === b) return
      const bodies = [sl.a.body?.id ?? '', sl.b.body?.id ?? ''].filter(Boolean)
      if (b !== 0 && !out.some(c => c.type === 'limit' && c.subject === sl.id)) out.push({ type: 'limit', subject: sl.id, bodies })
      else if (b === 0) out.push({ type: 'unlimit', subject: sl.id, bodies })
    })
  }
  if (prev.slip && next.slip) {
    model.motors.forEach((mo, k) => {
      const a = prev.slip![k], b = next.slip![k]
      if (a === b) return
      const bodies = [mo.a.body?.id ?? '', mo.b.body?.id ?? ''].filter(Boolean)
      out.push({ type: b === 0 ? 'motorLock' : 'motorSlip', subject: mo.id, bodies })
    })
  }
  return out
}


/** Does a change match a stop kind (settings.stopAt.on)? 'touch' also matches an impact (contact with a bounce). */
export function changeMatches(c: ChangeDetail, on: StopKind): boolean {
  return c.type === on || (on === 'touch' && c.type === 'impact')
}

/**
 * Simulate a scene to the end (or until the budget, cancellation or an error) and return the recording. Always
 * bounded: an unbounded scene runs for its legacyDuration (the stop condition still applies).
 */
export function simulate(scene: Scene, opts: SimOptions = {}): Recording {
  const run = new SimulationRun(scene, { ...opts, duration: opts.duration ?? finiteDuration(scene.settings) })
  run.advance(Infinity)
  return run.result()
}

/** A closed chunk: its frames are final and its digest is known. */
export interface ClosedChunk {
  chunk: number
  /** First frame and number of frames. */
  first: number
  frames: number
  /** Events the chunk owns: indices [eventsFrom, eventsTo). */
  eventsFrom: number
  eventsTo: number
  /** Segments that exist when the chunk closes. */
  segmentsTo: number
  /** d_c and the chain value H_c after it. */
  digest: Uint8Array
  rolling: Uint8Array
  /** Min, max, first and last of every state component (core/record/frames.ts chunkSummary). */
  summary: Float64Array
  /** Time of the chunk's last frame (s). */
  t: number
}

/** Where a resumed run starts: a compiled system of the same scene and a serialized checkpoint. */
export interface ResumePoint { system: System; checkpoint: Float64Array }

/**
 * An incremental simulation: `advance(deadline)` runs until the wall clock (ms, Date.now()) passes the
 * deadline or the run ends, so the work can be sliced (Web Worker posts, main-thread fallback). The
 * algorithm is the same whatever the slicing, so the recording is bit-identical to `simulate`.
 * `partial()` returns a consistent prefix of the recording at any time.
 *
 * With a ResumePoint the run continues from a checkpoint of an earlier run of the same scene and options
 * (`rebuildChunk`): it reproduces that run from the checkpoint on.
 */
/** Relative tangential velocities of the sliding units of a mode at state X (26.53, D73). */
function slidingSpeeds(sys: System, X: Float64Array, mode: Mode): number[] {
  if (!mode.units.some(u => u.points.length > 0 && u.friction === 'slide')) return []
  const poses = computePoses(sys.model, X)
  return mode.units.filter(u => u.points.length > 0 && u.friction === 'slide').map(u => contactKin(u.ref, poses).vt)
}

export class SimulationRun {
  readonly scene: Scene
  readonly system: System
  readonly dt: number
  readonly size: number
  /** Number of output intervals (frames − 1); +∞ for an unbounded run. */
  readonly K: number
  /** Simulated duration (s); +∞ for an unbounded run. */
  readonly T: number
  /** The run has a fixed duration (26.49 limits and fingerprint). */
  readonly bounded: boolean
  /** Frames per chunk (F). */
  readonly chunkFrames: number
  /** Frame chunks (released ones are null). */
  readonly frames: ChunkFrames
  /** Serialized checkpoint of every chunk taken so far, by chunk index. */
  readonly checkpoints: Array<Float64Array | undefined> = []
  /** Closed chunks in order (see ClosedChunk). */
  readonly closed: ClosedChunk[] = []
  readonly segments: Segment[] = []
  readonly events: SimEvent[] = []
  readonly warnings: Message[]
  readonly stats: SimStats = { steps: 0, rejected: 0, events: 0, locateIterations: 0, maxPositionCorrection: 0, maxVelocityCorrection: 0, ambiguousModes: 0, wallMs: 0 }
  error: Message | null = null
  finished = false
  stopReason: StopReason | null = null
  /** Start of the Moreau–Jean part, null while event-driven. */
  reducedFrom: number | null = null
  /** Index of the last recorded frame. */
  k = 0
  /** Simulated time reached. */
  t = 0
  /** Chain value H_c of the last closed chunk (CHAIN_START before the first). */
  rolling: Uint8Array = CHAIN_START

  private readonly opts: SimOptions
  private readonly wall0: number
  /** Wall-clock ms spent in the constructor and in finished slices. */
  private wallUsed = 0
  private sliceStart = 0
  private readonly projInfo: ProjectionInfo = { position: 0, velocity: 0 }
  private impactLoss = 0
  /**
   * A stop decided inside a step (rest, approximate rest, a body reaching its pulley): the run ends at the next loop
   * top, after the checkpoint of a chunk that starts at the last frame (26.51), so every chunk is closed in order.
   */
  private pendingStop: StopReason | null = null
  /** Consecutive recorded frames of approximate rest (26.51). */
  private nearRest = 0
  /** Frames of approximate rest that end an unbounded run. */
  private readonly restHold: number
  private X!: Float64Array
  private mode!: Mode
  private sol!: ModeSolution
  private rhsMode!: Mode
  private fns: EventFn[] = []
  private k1!: Float64Array
  private h = 0
  private lastEventT = -1
  private eventsAtInstant = 0
  private nextProgress = 0.1
  private readonly toggles = new Map<number, number[]>()
  /** Recent event times (event storm detection). */
  private recentEvents: number[] = []
  /** Last right-hand-side evaluation (state array and its mode solution), reused by the event check. */
  private lastY: Float64Array | null = null
  private lastSol: ModeSolution | null = null
  private readonly useCache: boolean
  private readonly rhs: Rhs
  private readonly ctl: { relTol: number; absTol: number; count: number }
  private result_: Recording | null = null
  /** Global index of segments[0] and events[0] (non-zero in a resumed run). */
  private segBase = 0
  private eventBase = 0
  /** First chunk this run computes (non-zero in a resumed run). */
  private readonly firstChunk: number
  /** Frame at which the next checkpoint is taken. */
  private cpFrame = 0
  /** advance() returns at the top of the loop once k reaches this frame (pause, end of a rebuild). */
  private pauseFrame = Infinity
  /** Frame at which a fired stop condition ends the run; +∞ while none has fired. */
  private kStop = Infinity
  /** Accepted steps at the last checkpoint (per-chunk limit of unbounded runs). */
  private chunkSteps = 0
  /** Events owned by each chunk start at this global index (E_c). */
  private readonly chunkEvents: number[] = []
  /** Permanent rest may end this run (see restAllowed in the constructor). */
  private readonly restAllowed: boolean
  /** Streamed 26.49 fingerprint of a bounded run (states of the closed chunks so far). */
  private readonly stateHasher: Sha256 | null

  constructor(scene: Scene, opts: SimOptions = {}, from?: ResumePoint) {
    this.wall0 = Date.now()
    this.scene = scene
    this.opts = opts
    let sys: System
    if (from) {
      sys = from.system
      this.warnings = []
    } else {
      const model = compileModel(scene)
      this.warnings = [...model.warnings]
      sys = buildSystem(model)
    }
    this.system = sys
    const model = sys.model
    const st = model.settings
    this.dt = st.outputStep
    const duration = opts.duration !== undefined ? opts.duration : st.duration
    this.bounded = duration !== null
    this.T = duration ?? Infinity
    this.K = duration !== null ? Math.max(0, Math.round(duration / this.dt)) : Infinity
    this.size = sys.size
    this.chunkFrames = framesPerChunk(this.dt, opts.chunkSeconds ?? 1)
    this.frames = new ChunkFrames(this.size, this.chunkFrames)
    this.ctl = { relTol: st.relTol, absTol: st.absTol, count: 6 * sys.n }
    this.useCache = opts.solutionCache !== false
    this.rhs = (Y, out) => { this.lastSol = derivative(sys, Y, this.rhsMode, out); this.lastY = Y }
    // Permanent rest is only detected when nothing depends on time: no variable forces (the clock entry) and no
    // running conveyor belts; and only in unbounded runs, so bounded runs keep their 26.49 length
    this.restAllowed = !this.bounded && sys.timeSlot < 0 && !scene.bodies.some(b => b.kind === 'static' && b.beltSpeed !== 0)
    this.restHold = Math.max(1, Math.round(REST_HOLD / this.dt))
    this.stateHasher = this.bounded && !from ? new Sha256() : null

    if (from) {
      this.firstChunk = this.restore(decodeCheckpoint(from.checkpoint))
      this.wallUsed = Date.now() - this.wall0
      return
    }
    this.firstChunk = 0
    this.chunkEvents[0] = 0
    this.impactLoss = st.startLedger?.impactLoss ?? 0

    let X = initialState(sys)
    const overlap = resolveInitialOverlap(sys, X)
    if (overlap.removed > 0) {
      X = overlap.X
      this.warnings.push(msg('warn.initialOverlapRemoved', { mm: overlap.removed * 1000 }))
    }
    if (overlap.deep.length) this.warnings.push(msg('warn.initialDeepOverlap', { pairs: overlap.deep.slice() }))

    const first = this.settle(X)
    X = first.X
    this.mode = first.choice.mode
    this.rhsMode = this.mode
    this.sol = first.choice.solution
    this.segments.push({ index: 0, t0: 0, t1: this.T, mode: this.mode, X0: Float64Array.from(X), label: describeMode(this.mode), impactLoss: this.impactLoss })
    if (first.impact) {
      const changes = diffModes(sys, null, this.mode, first.impact)
      this.events.push({ index: 0, t: 0, triggers: ['contact'], changes, before: initialState(sys), after: Float64Array.from(X), impact: first.impact, segment: 0 })
      this.checkStopAt(changes, 0)
    }
    this.X = X
    this.record(0, X)
    this.fns = buildEventFns(sys, this.mode, computePoses(model, X), this.sol, X)
    this.k1 = new Float64Array(this.size)
    this.rhs(X, this.k1)
    this.h = st.integrator === 'dopri5' ? Math.min(this.dt, initialStepGuess(X, this.k1, this.ctl, this.dt)) : this.dt
    if (this.K === 0) { this.finished = true; this.stopReason = 'duration' }
    if (st.integrator === 'moreau' && !this.finished) this.startReduced(msg('reason.moreauSelected'))
    this.wallUsed = Date.now() - this.wall0
  }

  /** Switch the rest of the run to the Moreau–Jean fallback (flagged as reduced accuracy). */
  private startReduced(reason: Message) {
    const sys = this.system
    this.reducedFrom = this.t
    // Parameters in key order: the WebAssembly transport writes them sorted, and both engines must give the same text
    this.warnings.push(msg('warn.reducedAccuracy', { reason, t: this.t }))
    const mode = stateMode(sys, this.X, MOREAU.stickSpeed)
    this.mode = mode
    const last = this.segments[this.segments.length - 1]
    const seg: Segment = { index: this.segBase + this.segments.length, t0: this.t, t1: this.T, mode, X0: Float64Array.from(this.X), label: describeMode(mode), impactLoss: this.impactLoss, reduced: true }
    if (last.t0 === this.t) { seg.index = last.index; this.segments[this.segments.length - 1] = seg } else { last.t1 = this.t; this.segments.push(seg) }
    this.events.push({ index: this.eventBase + this.events.length, t: this.t, triggers: [], changes: [{ type: 'timestep', subject: 'solver', bodies: [] }], before: Float64Array.from(this.X), after: Float64Array.from(this.X), impact: null, segment: this.segBase + this.segments.length - 1 })
    this.stats.events++
  }

  /** Moreau–Jean steps up to the deadline (substeps per output interval, frames on the grid). */
  private reducedLoop(deadline: number) {
    const sys = this.system
    const dt = this.dt
    for (;;) {
      if (this.k === this.cpFrame) this.checkpoint()
      if (this.k >= this.K || this.k >= this.kStop || this.pendingStop) { this.end(this.pendingStop ?? (this.k >= this.K ? 'duration' : 'stopAt')); return }
      if (this.k >= this.pauseFrame) return
      if (Date.now() > deadline) return
      const tNext = (this.k + 1) * dt
      const t0 = this.t
      const S = MOREAU.substeps
      let X = this.X
      for (let i = 1; i <= S && tNext > t0; i++) {
        const t1 = i === S ? tNext : t0 + (tNext - t0) * i / S
        const r = moreauStep(sys, X, t1 - this.t)
        if (!finiteState(r.X, 6 * sys.n)) { this.X = X; this.fail(msg('err.stateNotFinite', { t: this.t })); return }
        X = r.X
        this.impactLoss += r.loss
        this.t = t1
        if (sys.timeSlot >= 0) X[sys.timeSlot] = t1
        this.stats.steps++
      }
      this.X = X
      const mode = stateMode(sys, X, MOREAU.stickSpeed)
      const label = describeMode(mode)
      const last = this.segments[this.segments.length - 1]
      if (label !== last.label) {
        last.t1 = tNext
        this.mode = mode
        this.segments.push({ index: this.segBase + this.segments.length, t0: tNext, t1: this.T, mode, X0: Float64Array.from(X), label, impactLoss: this.impactLoss, reduced: true })
      }
      this.k++
      this.record(this.k, X)
      if (this.t >= this.nextProgress) {
        this.nextProgress += 0.1
        if (this.opts.progress && this.opts.progress(this.t, this.T) === false) { this.fail(msg('err.cancelled'), 'user'); return }
      }
      if (this.bounded && this.opts.budgetMs && this.elapsed() > this.opts.budgetMs) { this.fail(msg('err.budget', { seconds: Math.round(this.opts.budgetMs / 1000), t: this.t })); return }
    }
  }

  /** Too many events recently (simulated time)? */
  private eventStorm(t: number): boolean {
    const fb = this.opts.fallback ?? { events: 400, window: 0.05 }
    if (!fb) return false
    this.recentEvents.push(t)
    while (this.recentEvents.length && this.recentEvents[0] < t - fb.window) this.recentEvents.shift()
    return this.recentEvents.length > fb.events
  }

  /** Number of valid frames. */
  get frameCount(): number { return this.k + 1 }

  /** Impacts, then the mode, then projection; returns the post-event state. */
  private settle(Xin: Float64Array, fired: EventFn[] = []): { X: Float64Array; choice: ModeChoice; impact: ImpactResult | null } {
    const sys = this.system
    let Xc = Xin
    let combined: ImpactResult | null = null
    for (let k = 0; k < 8 && approaching(sys, Xc); k++) {
      const imp = resolveImpact(sys, Xc)
      if (!imp) break
      Xc = imp.X
      this.impactLoss += imp.loss
      if (imp.warning && !this.warnings.some(w => sameMessage(w, imp.warning!))) this.warnings.push(imp.warning)
      combined = combined ? { ...imp, points: [...combined.points, ...imp.points], energyBefore: combined.energyBefore, loss: combined.loss + imp.loss } : imp
    }
    const slack = fired.filter(f => f.type === 'slack').map(f => f.rope)
    const unlimit = fired.filter(f => f.type === 'unlimit').map(f => f.item)
    const prefer = slack.length || unlimit.length ? { slack, unlimit } : {}
    let choice = determineMode(sys, Xc, undefined, prefer)
    const moving = slidingSpeeds(sys, Xc, choice.mode)
    Xc = project(sys, Xc, choice.mode, this.projInfo)
    // 26.53 (D73): a unit taken as sliding whose relative tangential velocity the projection brought to rest (the
    // other contacts fix the body) is decided again at the projected state, where it may stick
    if (moving.length) {
      const after = slidingSpeeds(sys, Xc, choice.mode)
      if (after.some((v, i) => Math.abs(moving[i]) > TOL.vel && Math.abs(v) <= TOL.vel)) {
        choice = determineMode(sys, Xc, undefined, prefer)
        Xc = project(sys, Xc, choice.mode, this.projInfo)
      }
    }
    choice = { ...choice, solution: solveMode(sys, Xc, choice.mode) }
    if (choice.ambiguous) {
      this.stats.ambiguousModes++
      if (this.stats.ambiguousModes <= 3) this.warnings.push(msg('warn.ambiguousMode', { violation: choice.violation }))
    }
    return { X: Xc, choice, impact: combined }
  }

  private stepFrom(X0: Float64Array, h: number, k1?: Float64Array): StepResult {
    const integrator = this.system.model.settings.integrator
    const slot = this.system.timeSlot
    if (integrator === 'rk4') return rk4Step(this.rhs, X0, h, k1, slot)
    if (integrator === 'euler') return eulerStep(this.rhs, X0, h, 3 * this.system.n, k1, slot)
    if (integrator === 'gauss4') return gauss4Step(this.rhs, X0, h, k1, slot)
    return dopri5Step(this.rhs, X0, h, this.ctl, k1, slot)
  }

  /** The mode solution at X when the last right-hand side was evaluated exactly there. */
  private cached(X: Float64Array): ModeSolution | undefined {
    return this.useCache && this.lastY === X && this.lastSol ? this.lastSol : undefined
  }

  /** Store frame `index` (the next one) in its chunk. */
  private record(index: number, Xr: Float64Array) {
    const F = this.chunkFrames
    const ci = Math.floor(index / F)
    let c = this.frames.chunks[ci]
    if (!c) {
      const first = ci * F
      c = newChunk(ci, first, this.bounded ? Math.min(F, this.K + 1 - first) : F, this.size)
      this.frames.chunks[ci] = c
    }
    const j = index - c.first
    c.states.set(Xr, j * this.size)
    c.segment[j] = this.segBase + this.segments.length - 1
    c.impactLoss[j] = this.impactLoss
    c.count = j + 1
  }

  /** A switch of a variable force that keeps toggling (sign(vx) at vx = 0 …) cannot be integrated. */
  private checkToggles(changes: ChangeDetail[]): Message | null {
    for (const c of changes) {
      if (c.type !== 'switch' || c.switchIndex === undefined) continue
      const list = this.toggles.get(c.switchIndex) ?? []
      list.push(this.t)
      while (list.length && list[0] < this.t - 1e-6) list.shift()
      this.toggles.set(c.switchIndex, list)
      if (list.length > 40) {
        const f = this.system.model.forces.find(x => x.id === c.subject)
        return msg('err.switchChatter', { force: f?.name ?? c.subject, t: this.t })
      }
    }
    return null
  }

  /**
   * The first event with a change of the kind of settings.stopAt arms the stop: the run ends at the first grid
   * frame kStop = max(k, ceil((tE + after) / Δt)).
   */
  private checkStopAt(changes: ChangeDetail[], tE: number) {
    const sa = this.system.model.settings.stopAt
    if (!sa || this.kStop !== Infinity) return
    if (!changes.some(c => changeMatches(c, sa.on))) return
    this.kStop = Math.max(this.k, Math.ceil((tE + sa.after) / this.dt))
  }

  /**
   * Run until Date.now() passes `deadline` (checked every few steps) or the run ends; with `untilFrame`, also
   * return (paused) at the top of the loop once frame `untilFrame` is recorded. Pausing never changes the result.
   * Returns true when the run has ended (completed, stopped by a condition, an error, the budget or cancellation).
   */
  advance(deadline: number, untilFrame = Infinity): boolean {
    if (this.finished) return true
    const started = Date.now()
    this.sliceStart = started
    this.pauseFrame = untilFrame
    try {
      this.loop(deadline)
    } catch (e) {
      this.fail(e instanceof ForceExprError ? e.msg : msg('err.internal', { message: (e as Error).message }))
    }
    this.wallUsed += Date.now() - started
    if (this.finished) this.finish()
    return this.finished
  }

  private fail(message: Message, reason: StopReason = 'error') {
    this.error = message
    this.finished = true
    if (!this.stopReason) this.stopReason = reason
  }

  private end(reason: StopReason) {
    this.finished = true
    if (!this.stopReason) this.stopReason = reason
  }

  /** Event-driven integration until the deadline, a pause or the end of the run. */
  private loop(deadline: number) {
    if (this.reducedFrom !== null) { this.reducedLoop(deadline); return }
    const sys = this.system, model = sys.model
    const opts = this.opts
    const st = model.settings
    const integrator = st.integrator
    const dt = this.dt, T = this.T
    const slot = sys.timeSlot
    const maxAtInstant = opts.maxEventsPerInstant ?? 200
    const budget = this.bounded ? opts.budgetMs : undefined
    let since = 0
    for (;;) {
      if (this.k === this.cpFrame) this.checkpoint()
      if (this.k >= this.K || this.k >= this.kStop || this.pendingStop) { this.end(this.pendingStop ?? (this.k >= this.K ? 'duration' : 'stopAt')); return }
      if (this.k >= this.pauseFrame) return
      if (++since >= 4) {
        since = 0
        if (Date.now() > deadline) return
      }
      const t = this.t
      const tNext = (this.k + 1) * dt
      const remaining = tNext - t
      const clipped = this.h >= remaining
      const hTry = clipped ? remaining : this.h
      const X = this.X
      const r = this.stepFrom(X, hTry, this.k1)
      // 26.52: a state that is no longer finite (a body driven off to infinity in finite time): smaller steps, else stop
      if (!finiteState(r.X, 6 * sys.n)) {
        if (integrator === 'dopri5') {
          this.stats.rejected++
          this.h = hTry * 0.2
          if (this.h < 1e-14) { this.fail(msg('err.stepTooSmall', { t })); return }
          continue
        }
        this.fail(msg('err.stateNotFinite', { t }))
        return
      }
      if (integrator === 'dopri5' && r.err > 1) {
        this.stats.rejected++
        this.h = hTry * Math.max(0.2, 0.9 * pow(r.err, -0.2))
        if (this.h < 1e-14) { this.fail(msg('err.stepTooSmall', { t })); return }
        continue
      }
      const check = eventMargin(sys, this.fns, this.mode, r.X, this.cached(r.X))
      if (check.margin < 0) {
        // ---- Event ----
        const X0 = X, k1 = this.k1
        const loc = locateEvent(sys, this.fns, this.mode, hh => (hh === 0 ? X0 : this.stepFrom(X0, hh, k1).X), hTry, check.margin, Y => this.cached(Y))
        this.stats.locateIterations += loc.iterations
        const tE = loc.h >= remaining ? tNext : t + loc.h
        const before = loc.X
        if (slot >= 0) before[slot] = tE
        const settled = this.settle(before, loc.fired)
        const prevMode = this.mode
        this.mode = settled.choice.mode
        this.sol = settled.choice.solution
        this.X = settled.X
        this.t = tE
        this.segments[this.segments.length - 1].t1 = tE
        this.segments.push({ index: this.segBase + this.segments.length, t0: tE, t1: T, mode: this.mode, X0: Float64Array.from(this.X), label: describeMode(this.mode), impactLoss: this.impactLoss })
        const changes = diffModes(sys, prevMode, this.mode, settled.impact)
        // 26.51: a body reached the pulley its rope runs onto; the run ends at this event
        const reached = loc.fired.filter(f => f.type === 'pulley')
        for (const f of reached) {
          const r = model.ropes[f.rope], end = f.point === 0 ? r.a : r.b
          changes.push({ type: 'pulley', subject: r.id, bodies: end.body ? [end.body.id] : [] })
        }
        this.events.push({ index: this.eventBase + this.events.length, t: tE, triggers: [...new Set(loc.fired.map(f => f.type))], changes, before: Float64Array.from(before), after: Float64Array.from(this.X), impact: settled.impact, segment: this.segBase + this.segments.length - 1 })
        this.stats.events++
        if (tE === tNext) { this.k++; this.record(this.k, this.X) }
        if (reached.length) this.pendingStop = 'pulley'
        this.checkStopAt(changes, tE)
        if (budget && this.elapsed() > budget) { this.fail(msg('err.budget', { seconds: Math.round(budget / 1000), t: tE })); return }
        const chatter = model.switches.length ? this.checkToggles(changes) : null
        if (chatter) { this.fail(chatter); return }
        if (tE - this.lastEventT <= 1e-12) {
          this.eventsAtInstant++
          if (this.eventsAtInstant > maxAtInstant) {
            if (opts.fallback === false) { this.fail(msg('err.eventChatter', { t: tE, count: this.eventsAtInstant })); return }
            this.startReduced(msg('reason.eventsAtInstant', { t: tE, count: this.eventsAtInstant }))
            this.reducedLoop(deadline)
            return
          }
        } else this.eventsAtInstant = 0
        this.lastEventT = tE
        if (this.eventStorm(tE)) {
          this.startReduced(msg('reason.eventStorm', { count: this.recentEvents.length, window: (opts.fallback || { window: 0.05 }).window }))
          this.reducedLoop(deadline)
          return
        }
        this.rhsMode = this.mode
        this.fns = buildEventFns(sys, this.mode, computePoses(model, this.X), this.sol, this.X)
        this.rhs(this.X, this.k1)
        if (integrator !== 'dopri5') this.h = dt
        continue
      }
      // ---- Accept ----
      this.stats.steps++
      rearm(this.fns, check.values)
      let Xn = project(sys, r.X, this.mode, this.projInfo)
      let reuse = Xn === r.X && r.k7 !== undefined
      if (clipped) {
        this.t = tNext
        if (slot >= 0 && Xn[slot] !== tNext) { Xn[slot] = tNext; reuse = false }
        this.k++
        this.record(this.k, Xn)
      } else {
        this.t = t + hTry
        if (slot >= 0 && Xn[slot] !== this.t) { Xn[slot] = this.t; reuse = false }
      }
      this.X = Xn
      if (integrator === 'dopri5') {
        const grow = r.err === 0 ? 5 : Math.min(5, Math.max(0.2, 0.9 * pow(r.err, -0.2)))
        const proposal = hTry * grow
        this.h = Math.min(dt, clipped ? Math.max(this.h, proposal) : proposal)
      } else this.h = dt
      // First-same-as-last: f(X) was the last stage of the step when X was kept unchanged
      if (reuse) this.k1 = r.k7!
      else this.rhs(Xn, this.k1)
      // Permanent rest: on a recorded frame, f(X) is exactly zero in every component (STREAMING.md §6); approximate
      // rest (26.51): every velocity and acceleration below REST_TOL on the recorded frames of REST_HOLD seconds
      if (clipped && this.restAllowed) {
        if (atRest(this.k1)) { this.pendingStop = 'rest'; continue }
        if (nearRest(this.k1, 6 * sys.n)) { if (++this.nearRest >= this.restHold) { this.pendingStop = 'restApprox'; continue } } else this.nearRest = 0
      }
      if (this.t >= this.nextProgress) {
        this.nextProgress += 0.1
        if (opts.progress && opts.progress(this.t, T) === false) { this.fail(msg('err.cancelled'), 'user'); return }
      }
      if (this.bounded ? this.stats.steps > MAX_STEPS : this.stats.steps - this.chunkSteps > MAX_STEPS_PER_CHUNK) {
        this.fail(this.bounded ? msg('err.stepLimit') : msg('err.chunkStepLimit', { t: this.t, limit: MAX_STEPS_PER_CHUNK }))
        return
      }
      if (budget && (this.stats.steps & 255) === 0 && this.elapsed() > budget) { this.fail(msg('err.budget', { seconds: Math.round(budget / 1000), t: this.t })); return }
    }
  }

  /** Wall-clock time spent computing (ms), pauses between slices excluded. */
  private elapsed(): number { return this.wallUsed + Date.now() - this.sliceStart }

  // ---- Chunks and checkpoints ----

  /**
   * Take the checkpoint of chunk c = k / F at the top of the loop (frame c·F has just been recorded and its
   * iteration is complete), after closing chunk c − 1.
   */
  private checkpoint() {
    const F = this.chunkFrames
    const c = this.k / F
    if (c > this.firstChunk) this.closeChunk(c - 1)
    this.chunkEvents[c] = c === 0 ? 0 : this.eventBase + this.events.length
    // The identity cache never carries over a checkpoint (it is result-neutral anyway, STREAMING.md §3)
    this.lastY = null
    this.lastSol = null
    this.checkpoints[c] = encodeCheckpoint(this.snapshotState(c))
    this.chunkSteps = this.stats.steps
    this.cpFrame += F
  }

  /** The checkpoint of chunk c (see core/solver/checkpoint.ts). */
  private snapshotState(c: number): Checkpoint {
    const sys = this.system
    const seg = this.segments[this.segments.length - 1]
    const reduced = this.reducedFrom !== null
    if (!reduced && this.rhsMode !== this.mode) throw new Error('checkpoint: right-hand-side mode differs from the mode')
    const toggles = [...this.toggles.entries()].sort((a, b) => a[0] - b[0]).map(([index, times]) => ({ index, times: times.slice() }))
    return {
      chunk: c, k: this.k, t: this.t, h: reduced ? 0 : this.h, impactLoss: this.impactLoss,
      lastEventT: reduced ? 0 : this.lastEventT, eventsAtInstant: reduced ? 0 : this.eventsAtInstant,
      reducedFrom: this.reducedFrom, kStop: this.kStop, eventCount: this.eventBase + this.events.length,
      frameSegment: this.frames.segment(this.k),
      segment: { index: seg.index, t0: seg.t0, impactLoss: seg.impactLoss, reduced: !!seg.reduced, X0: seg.X0 },
      stats: { steps: this.stats.steps, rejected: this.stats.rejected, events: this.stats.events, locateIterations: this.stats.locateIterations, ambiguousModes: this.stats.ambiguousModes },
      projection: { position: this.projInfo.position, velocity: this.projInfo.velocity },
      X: this.X, k1: reduced ? new Float64Array(this.size) : this.k1, mode: encodeMode(sys, this.mode),
      thresholds: reduced ? new Float64Array(0) : Float64Array.from(this.fns, f => f.threshold),
      starts: reduced ? new Float64Array(0) : Float64Array.from(this.fns, f => f.start),
      recentEvents: reduced ? [] : this.recentEvents.slice(),
      toggles: reduced ? [] : toggles
    }
  }

  /** Continue from a checkpoint (resumed run); returns its chunk index. */
  private restore(cp: Checkpoint): number {
    const sys = this.system, model = sys.model
    if (cp.X.length !== this.size) throw new Error('checkpoint: state size differs from the scene')
    const mode = decodeMode(sys, cp.mode)
    this.k = cp.k
    this.t = cp.t
    this.X = Float64Array.from(cp.X)
    this.mode = mode
    this.rhsMode = mode
    this.impactLoss = cp.impactLoss
    this.reducedFrom = cp.reducedFrom
    this.kStop = cp.kStop
    this.stats.steps = cp.stats.steps
    this.stats.rejected = cp.stats.rejected
    this.stats.events = cp.stats.events
    this.stats.locateIterations = cp.stats.locateIterations
    this.stats.ambiguousModes = cp.stats.ambiguousModes
    this.projInfo.position = cp.projection.position
    this.projInfo.velocity = cp.projection.velocity
    this.segBase = cp.segment.index
    this.eventBase = cp.eventCount
    const seg: Segment = { index: cp.segment.index, t0: cp.segment.t0, t1: this.T, mode, X0: Float64Array.from(cp.segment.X0), label: describeMode(mode), impactLoss: cp.segment.impactLoss }
    if (cp.segment.reduced) seg.reduced = true
    this.segments.push(seg)
    // Frame k itself (the checkpoint's state)
    const F = this.chunkFrames
    const c = cp.chunk
    if (c * F !== cp.k) throw new Error('checkpoint: chunk length differs from the run')
    const chunk = newChunk(c, cp.k, this.bounded ? Math.min(F, this.K + 1 - cp.k) : F, this.size)
    chunk.states.set(cp.X, 0)
    chunk.segment[0] = cp.frameSegment
    chunk.impactLoss[0] = cp.impactLoss
    chunk.count = 1
    this.frames.chunks[c] = chunk
    // The checkpoint is taken again at the first loop top: the restored state must encode to the same values
    this.chunkEvents[c] = c === 0 ? 0 : cp.eventCount
    this.chunkSteps = cp.stats.steps
    this.cpFrame = cp.k
    if (cp.reducedFrom === null) {
      this.h = cp.h
      this.k1 = Float64Array.from(cp.k1)
      this.lastEventT = cp.lastEventT
      this.eventsAtInstant = cp.eventsAtInstant
      this.recentEvents = cp.recentEvents.slice()
      for (const tg of cp.toggles) this.toggles.set(tg.index, tg.times.slice())
      // The event functions of the mode, with their hysteresis state from the checkpoint
      this.sol = solveMode(sys, this.X, mode)
      this.fns = buildEventFns(sys, mode, computePoses(model, this.X), this.sol, this.X)
      if (this.fns.length !== cp.thresholds.length) throw new Error('checkpoint: event functions differ from the mode')
      this.fns.forEach((f, i) => { f.threshold = cp.thresholds[i]; f.start = cp.starts[i] })
    } else {
      this.k1 = new Float64Array(this.size)
    }
    this.nextProgress = Infinity
    return c
  }

  /** Close chunk c: its frames are final; digest, chain, summary, and the streamed bounded fingerprint. */
  private closeChunk(c: number) {
    const chunk = this.frames.chunks[c]
    if (!chunk) throw new Error(`chunk ${c} was released before it was closed`)
    const states = chunk.states.subarray(0, chunk.count * this.size)
    const eventsFrom = this.chunkEvents[c]
    const eventsTo = this.eventBase + this.events.length
    const local = eventsFrom - this.eventBase
    const digest = chunkDigest(states, this.events, Math.max(0, local), this.events.length)
    this.rolling = chainDigest(this.rolling, digest)
    this.stateHasher?.updateFloat64(states)
    this.closed.push({
      chunk: c, first: chunk.first, frames: chunk.count, eventsFrom, eventsTo, segmentsTo: this.segBase + this.segments.length,
      digest, rolling: this.rolling, summary: chunkSummary(chunk, this.size), t: (chunk.first + chunk.count - 1) * this.dt
    })
  }

  /** Drop the frames of a closed chunk (they were posted to another thread). */
  releaseChunk(c: number) {
    if (!this.closed.length || this.closed[this.closed.length - 1].chunk < c) throw new Error('only closed chunks can be released')
    this.frames.chunks[c] = null
  }

  /**
   * Drop segments and events that have been posted to another thread (unbounded runs in a worker, so that a run of
   * hours does not hold every event twice). Keeps the open segment and the events the open chunk will own.
   */
  forget(segmentsBefore: number, eventsBefore: number) {
    if (this.bounded) return
    const segDrop = Math.min(segmentsBefore - this.segBase, this.segments.length - 1)
    if (segDrop > 0) { this.segments.splice(0, segDrop); this.segBase += segDrop }
    const open = this.chunkEvents[Math.floor(this.k / this.chunkFrames)] ?? 0
    const evDrop = Math.min(eventsBefore, open) - this.eventBase
    if (evDrop > 0) { this.events.splice(0, evDrop); this.eventBase += evDrop }
  }

  /** The rolling fingerprint up to the last closed chunk, or null before the first one closes. */
  rollingFingerprint(): RollingFingerprint | null {
    const last = this.closed[this.closed.length - 1]
    return last ? { hash: digestHex(last.rolling), t: last.t, chunks: this.closed.length } : null
  }

  /** Stop the run with an error message (the recording keeps what was computed). */
  cancel(message: Message = msg('err.cancelled')) {
    if (this.finished) return
    this.fail(message, 'user')
    this.finish()
  }

  /** End the run here without an error (an unbounded run stopped by the user); the recording is complete. */
  stop() {
    if (this.finished) return
    this.end('user')
    this.finish()
  }

  private finish() {
    if (this.result_) return
    const frameCount = this.k + 1
    this.segments[this.segments.length - 1].t1 = Math.min(this.T, this.t)
    this.stats.maxPositionCorrection = this.projInfo.position
    this.stats.maxVelocityCorrection = this.projInfo.velocity
    this.stats.wallMs = this.wallUsed
    const lastChunk = Math.floor(this.k / this.chunkFrames)
    if (!this.closed.length || this.closed[this.closed.length - 1].chunk < lastChunk) {
      if (this.frames.chunks[lastChunk]) this.closeChunk(lastChunk)
    }
    let hash = ''
    if (this.stateHasher) {
      hashEvents(this.stateHasher, this.events)
      hash = this.stateHasher.digestHex()
    } else if (!this.bounded && this.firstChunk === 0) hash = digestHex(this.rolling)
    this.result_ = {
      scene: this.scene, system: this.system, dt: this.dt, frameCount, size: this.size, frames: this.frames,
      segments: this.segments, events: this.events, warnings: this.warnings, stats: this.stats, completed: !this.error, error: this.error,
      hash, unbounded: !this.bounded, stopReason: this.stopReason ?? 'duration', rolling: this.rollingFingerprint()
    }
    if (this.reducedFrom !== null) this.result_.reducedFrom = this.reducedFrom
  }

  /** The final recording (the run must have ended). */
  result(): Recording {
    if (!this.finished) throw new Error('simulation still running')
    this.finish()
    return this.result_!
  }

  /**
   * A consistent prefix of the recording: the frames computed so far (sharing the run's chunks, which are only
   * appended to), the segments and events up to now. `completed` is false and `hash` empty.
   */
  partial(): Recording {
    if (this.finished) return this.result()
    const frameCount = this.k + 1
    const segs = this.segments.slice()
    const last = segs[segs.length - 1]
    segs[segs.length - 1] = { ...last, t1: Math.min(this.T, this.t) }
    const rec: Recording = {
      scene: this.scene, system: this.system, dt: this.dt, frameCount, size: this.size, frames: this.frames,
      segments: segs, events: this.events.slice(), warnings: this.warnings.slice(), stats: { ...this.stats, wallMs: this.wallUsed },
      completed: false, error: null, hash: '', unbounded: !this.bounded, rolling: this.rollingFingerprint()
    }
    if (this.reducedFrom !== null) rec.reducedFrom = this.reducedFrom
    return rec
  }

  /** Segments and events created so far, from their global indices (DeltaWriter). */
  segmentsFrom(i: number): Segment[] { return this.segments.slice(Math.max(0, i - this.segBase)) }
  eventsFrom(i: number): SimEvent[] { return this.events.slice(Math.max(0, i - this.eventBase)) }
  /** Global count of segments and events. */
  get segmentCount(): number { return this.segBase + this.segments.length }
  get eventCount(): number { return this.eventBase + this.events.length }
}

/** Approximate rest (26.51): speeds (m/s, rad/s) and accelerations (m/s², rad/s²) at most this. */
export const REST_TOL = 1e-6
/** Approximate rest must last this long (s of recorded frames). */
export const REST_HOLD = 1

/** Are the first `count` components of a state (positions and velocities) all finite? */
function finiteState(X: Float64Array, count: number): boolean {
  for (let i = 0; i < count; i++) if (!Number.isFinite(X[i])) return false
  return true
}

/** Are the first `count` components of the derivative (velocities, accelerations) all within REST_TOL? */
function nearRest(f: Float64Array, count: number): boolean {
  for (let i = 0; i < count; i++) if (!(Math.abs(f[i]) <= REST_TOL)) return false
  return true
}

/** Is the derivative exactly zero in every component (no motion, no work, no heat)? */
function atRest(f: Float64Array): boolean {
  for (let i = 0; i < f.length; i++) if (f[i] !== 0) return false
  return true
}

/** Result of `rebuildChunk`. */
export interface RebuiltChunk {
  /** The chunk's frames (count as recorded by the original run when it was complete). */
  chunk: FrameChunk
  /** Events the rebuilt run created after the checkpoint (global indices from the checkpoint's eventCount). */
  events: SimEvent[]
  /** The checkpoint taken at the end (chunk + 1), when the run got there. */
  next: Float64Array | null
  /** The checkpoint of the chunk as the rebuilt run took it again (must equal the input). */
  again: Float64Array | null
}

/**
 * Recompute one chunk from its checkpoint through the same code path as the original run (same scene,
 * compiled system and options, including the run's effective duration in `opts.duration`): runs to the top of the
 * loop at frame `endFrame` — the next chunk start for a complete chunk, the last frame of a final one.
 */
export function rebuildChunk(scene: Scene, system: System, checkpoint: Float64Array, opts: SimOptions, endFrame: number): RebuiltChunk {
  const run = new SimulationRun(scene, { duration: opts.duration, maxEventsPerInstant: opts.maxEventsPerInstant, fallback: opts.fallback, chunkSeconds: opts.chunkSeconds, solutionCache: opts.solutionCache }, { system, checkpoint })
  const c = run.frames.chunks.findIndex(x => !!x)
  run.advance(Infinity, endFrame)
  return { chunk: run.frames.chunks[c]!, events: run.events, next: run.checkpoints[c + 1] ?? null, again: run.checkpoints[c] ?? null }
}

function initialStepGuess(X: Float64Array, f: Float64Array, ctl: { relTol: number; absTol: number; count: number }, dt: number): number {
  let d0 = 0, d1 = 0
  for (let i = 0; i < ctl.count; i++) {
    const sc = ctl.absTol + ctl.relTol * Math.abs(X[i])
    const a = X[i] / sc, b = f[i] / sc
    d0 += a * a; d1 += b * b
  }
  d0 = Math.sqrt(d0 / Math.max(1, ctl.count)); d1 = Math.sqrt(d1 / Math.max(1, ctl.count))
  const h0 = d0 < 1e-5 || d1 < 1e-5 ? 1e-6 : 0.01 * d0 / d1
  return Math.max(1e-8, Math.min(h0, dt))
}

/** State at an arbitrary time: one step from the last frame (or the last event) before t, in that mode. */
export function exactStateAt(rec: Recording, t: number): Float64Array {
  let k = Math.min(rec.frameCount - 1, Math.max(0, Math.floor(t / rec.dt)))
  if (k + 1 < rec.frameCount && (k + 1) * rec.dt <= t) k++
  while (k > 0 && k * rec.dt > t) k--
  const tk = k * rec.dt
  if (t === tk) return Float64Array.from(frameState(rec, k))
  let seg = rec.segments[0]
  for (const s of rec.segments) if (s.t0 <= t) seg = s
  if (seg.reduced) {
    // Time-stepping part: no continuous solution between frames, linear interpolation (reduced accuracy)
    if (k + 1 >= rec.frameCount) return Float64Array.from(frameState(rec, k))
    const A = frameState(rec, k), B = frameState(rec, k + 1), s = (t - tk) / rec.dt
    const out = new Float64Array(rec.size)
    for (let i = 0; i < rec.size; i++) out[i] = A[i] + s * (B[i] - A[i])
    if (rec.system.timeSlot >= 0) out[rec.system.timeSlot] = t
    return out
  }
  let X0: Float64Array, t0: number
  if (seg.t0 > tk) { X0 = seg.X0; t0 = seg.t0 } else { X0 = frameState(rec, k); t0 = tk }
  if (t === t0) return Float64Array.from(X0)
  const sys = rec.system
  const n = sys.n
  const rhs: Rhs = (Y, out) => { derivative(sys, Y, seg.mode, out) }
  const st = sys.model.settings
  const h = t - t0
  const slot = sys.timeSlot
  const r = st.integrator === 'rk4' ? rk4Step(rhs, X0, h, undefined, slot) : st.integrator === 'euler' ? eulerStep(rhs, X0, h, 3 * n, undefined, slot) : st.integrator === 'gauss4' ? gauss4Step(rhs, X0, h, undefined, slot) : dopri5Step(rhs, X0, h, { relTol: st.relTol, absTol: st.absTol, count: 6 * n }, undefined, slot)
  if (slot >= 0) r.X[slot] = t
  return r.X
}

/** Mode solution (forces, contact states) at frame k. */
export function frameSolution(rec: Recording, k: number): ModeSolution {
  const seg = rec.segments[frameSegment(rec, k)]
  return solveMode(rec.system, frameState(rec, k), seg.mode)
}

/** Energy ledger of a state (J). */
export interface Ledger {
  kinetic: number; gravity: number; spring: number
  /** Potential of the central fields (26.52; 0 without them). */
  field: number
  mechanical: number
  frictionHeat: number; appliedWork: number; damping: number; beltWork: number; impactLoss: number
  /** E_mech + heat + damping + impact loss − applied work − belt work (constant in an exact solution). */
  balance: number
}

/** Energy ledger of state X with the given cumulative impact loss (J). */
export function ledgerAt(rec: Recording, X: Float64Array, impactLoss: number): Ledger {
  const sys = rec.system
  const e = energy(sys, X)
  const b = sys.auxBase
  const frictionHeat = X[b + AUX_HEAT], appliedWork = X[b + AUX_WORK], damping = X[b + AUX_DAMP], beltWork = X[b + AUX_BELT]
  return {
    kinetic: e.kinetic, gravity: e.gravity, spring: e.spring, field: e.field, mechanical: e.total,
    frictionHeat, appliedWork, damping, beltWork, impactLoss,
    balance: e.total + frictionHeat + damping + impactLoss - appliedWork - beltWork
  }
}

/** Energy ledger of frame k. */
export function frameLedger(rec: Recording, k: number): Ledger { return ledgerAt(rec, frameState(rec, k), frameImpactLoss(rec, k)) }
