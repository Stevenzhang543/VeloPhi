/**
 * Simulation driver: integrates mode by mode, locates events, applies impacts, re-determines the mode and
 * records the full state on the output grid t_k = k·Δt. Steps never cross a grid time, so every recorded
 * frame is an integration point and the whole recording is a pure function of the scene.
 */
import type { Scene } from '../scene/types'
import { Sha256 } from '../record/sha256'
import { compileModel } from './model'
import type { Mode, ModeSolution, System } from './dynamics'
import { AUX_BELT, AUX_DAMP, AUX_HEAT, AUX_WORK, buildSystem, derivative, energy, initialState, solveMode } from './dynamics'
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
import { dopri5Step, eulerStep, rk4Step } from './integrators'
import { computePoses } from './kinematics'
import { ForceExprError } from './forceExpr'
import { pow } from '../math/dmath'

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
  | 'impact' | 'touch' | 'separate' | 'stick' | 'slip' | 'reverse' | 'leave' | 'slack' | 'taut' | 'switch' | 'timestep'

/** One change at an event: an impact, a contact or rope change, or a switch of a variable force. */
export interface ChangeDetail {
  type: ChangeType
  /** Pair key "a|b", rope id, or force id (switch). */
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

/** The result of a simulation: the state of every frame plus segments, events and diagnostics. */
export interface Recording {
  scene: Scene
  system: System
  dt: number
  frameCount: number
  /** Length of one state vector. */
  size: number
  /** All frame states: frameCount × size, row-major. */
  states: Float64Array
  /** Segment index of each frame. */
  frameSegment: Int32Array
  /** Cumulative kinetic energy lost in impacts up to each frame (J). */
  impactLoss: Float64Array
  segments: Segment[]
  events: SimEvent[]
  warnings: string[]
  stats: SimStats
  completed: boolean
  /** User-facing reason the run stopped early; null when it completed. */
  error: string | null
  /** `recordingHash` of the states and events; empty for a partial recording. */
  hash: string
  /** Time from which the Moreau–Jean fallback computed the recording (reduced accuracy); null: never. */
  reducedFrom?: number | null
}

/** Options of a simulation run. */
export interface SimOptions {
  /** Simulated time (s); default: the scene's duration. */
  duration?: number
  /** Wall-clock budget in ms (the recording is kept up to where it stopped). */
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
}

/** State of frame k (a view into the recording). */
export function frameState(rec: Recording, k: number): Float64Array {
  return rec.states.subarray(k * rec.size, (k + 1) * rec.size)
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
  return out
}

/** Simulate a scene to the end (or until the budget, cancellation or an error) and return the recording. */
export function simulate(scene: Scene, opts: SimOptions = {}): Recording {
  const run = new SimulationRun(scene, opts)
  run.advance(Infinity)
  return run.result()
}

/**
 * An incremental simulation: `advance(deadline)` runs until the wall clock (ms, Date.now()) passes the
 * deadline or the run ends, so the work can be sliced (Web Worker posts, main-thread fallback). The
 * algorithm is the same whatever the slicing, so the recording is bit-identical to `simulate`.
 * `partial()` returns a consistent prefix of the recording at any time.
 */
export class SimulationRun {
  readonly scene: Scene
  readonly system: System
  readonly dt: number
  readonly size: number
  /** Number of output intervals (frames − 1). */
  readonly K: number
  /** Simulated duration (s). */
  readonly T: number
  /** Full-size buffers; only the first `frames` frames are valid. */
  readonly states: Float64Array
  readonly frameSegment: Int32Array
  readonly impactLossArr: Float64Array
  readonly segments: Segment[] = []
  readonly events: SimEvent[] = []
  readonly warnings: string[]
  readonly stats: SimStats = { steps: 0, rejected: 0, events: 0, locateIterations: 0, maxPositionCorrection: 0, maxVelocityCorrection: 0, ambiguousModes: 0, wallMs: 0 }
  error: string | null = null
  finished = false
  /** Start of the Moreau–Jean part, null while event-driven. */
  reducedFrom: number | null = null
  /** Index of the last recorded frame. */
  k = 0
  /** Simulated time reached. */
  t = 0

  private readonly opts: SimOptions
  private readonly wall0: number
  /** Wall-clock ms spent in the constructor and in finished slices. */
  private wallUsed = 0
  private sliceStart = 0
  private readonly projInfo: ProjectionInfo = { position: 0, velocity: 0 }
  private impactLoss = 0
  private X: Float64Array
  private mode: Mode
  private sol: ModeSolution
  private rhsMode: Mode
  private fns: EventFn[]
  private k1: Float64Array
  private h: number
  private lastEventT = -1
  private eventsAtInstant = 0
  private nextProgress = 0.1
  private readonly toggles = new Map<number, number[]>()
  /** Recent event times (event storm detection). */
  private readonly recentEvents: number[] = []
  /** Last right-hand-side evaluation (state array and its mode solution), reused by the event check. */
  private lastY: Float64Array | null = null
  private lastSol: ModeSolution | null = null
  private readonly rhs: Rhs
  private readonly ctl: { relTol: number; absTol: number; count: number }
  private result_: Recording | null = null

  constructor(scene: Scene, opts: SimOptions = {}) {
    this.wall0 = Date.now()
    this.scene = scene
    this.opts = opts
    const model = compileModel(scene)
    this.warnings = [...model.warnings]
    const sys = buildSystem(model)
    this.system = sys
    const st = model.settings
    this.dt = st.outputStep
    this.T = opts.duration ?? st.duration
    this.K = Math.max(0, Math.round(this.T / this.dt))
    this.size = sys.size
    this.states = new Float64Array((this.K + 1) * this.size)
    this.frameSegment = new Int32Array(this.K + 1)
    this.impactLossArr = new Float64Array(this.K + 1)
    this.ctl = { relTol: st.relTol, absTol: st.absTol, count: 6 * sys.n }
    this.rhs = (Y, out) => { this.lastSol = derivative(sys, Y, this.rhsMode, out); this.lastY = Y }

    let X = initialState(sys)
    const overlap = resolveInitialOverlap(sys, X)
    if (overlap.removed > 0) {
      X = overlap.X
      this.warnings.push(`初始重叠 ${(overlap.removed * 1000).toPrecision(3)} mm 已移除（物体被推到刚好接触）`)
    }
    if (overlap.deep.length) this.warnings.push(`初始时 ${overlap.deep.join('、')} 深度重叠（超过 5 cm），这些物体之间的接触不会被正确处理，请调整位置`)

    const first = this.settle(X)
    X = first.X
    this.mode = first.choice.mode
    this.rhsMode = this.mode
    this.sol = first.choice.solution
    this.segments.push({ index: 0, t0: 0, t1: this.T, mode: this.mode, X0: Float64Array.from(X), label: describeMode(this.mode), impactLoss: this.impactLoss })
    if (first.impact) {
      this.events.push({ index: 0, t: 0, triggers: ['contact'], changes: diffModes(sys, null, this.mode, first.impact), before: initialState(sys), after: Float64Array.from(X), impact: first.impact, segment: 0 })
    }
    this.states.set(X, 0)
    this.frameSegment[0] = 0
    this.impactLossArr[0] = this.impactLoss
    this.X = X
    this.fns = buildEventFns(sys, this.mode, computePoses(model, X), this.sol, X)
    this.k1 = new Float64Array(this.size)
    this.rhs(X, this.k1)
    this.h = st.integrator === 'dopri5' ? Math.min(this.dt, initialStepGuess(X, this.k1, this.ctl, this.dt)) : this.dt
    if (this.K === 0) this.finished = true
    if (st.integrator === 'moreau' && !this.finished) this.startReduced('已选择 Moreau–Jean 时间步进')
    this.wallUsed = Date.now() - this.wall0
  }

  /** Switch the rest of the run to the Moreau–Jean fallback (flagged as reduced accuracy). */
  private startReduced(reason: string) {
    const sys = this.system
    this.reducedFrom = this.t
    this.warnings.push(`自 t = ${this.t.toFixed(6)} s 起改用 Moreau–Jean 时间步进（${reason}）：精度降级——事件时刻不再精确定位，接触力读数为近似值，碰撞、摩擦与数值误差损失的能量合计记为“碰撞损失”，公式对照不再给出`)
    const mode = stateMode(sys, this.X, MOREAU.stickSpeed)
    this.mode = mode
    const last = this.segments[this.segments.length - 1]
    const seg: Segment = { index: this.segments.length, t0: this.t, t1: this.T, mode, X0: Float64Array.from(this.X), label: describeMode(mode), impactLoss: this.impactLoss, reduced: true }
    if (last.t0 === this.t) { seg.index = last.index; this.segments[this.segments.length - 1] = seg } else { last.t1 = this.t; this.segments.push(seg) }
    this.events.push({ index: this.events.length, t: this.t, triggers: [], changes: [{ type: 'timestep', subject: 'solver', bodies: [] }], before: Float64Array.from(this.X), after: Float64Array.from(this.X), impact: null, segment: this.segments.length - 1 })
    this.stats.events++
  }

  /** Moreau–Jean steps up to the deadline (substeps per output interval, frames on the grid). */
  private reducedLoop(deadline: number) {
    const sys = this.system
    const dt = this.dt
    while (this.k < this.K) {
      if (Date.now() > deadline) return
      const tNext = (this.k + 1) * dt
      const t0 = this.t
      const S = MOREAU.substeps
      let X = this.X
      for (let i = 1; i <= S && tNext > t0; i++) {
        const t1 = i === S ? tNext : t0 + (tNext - t0) * i / S
        const r = moreauStep(sys, X, t1 - this.t)
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
        this.segments.push({ index: this.segments.length, t0: tNext, t1: this.T, mode, X0: Float64Array.from(X), label, impactLoss: this.impactLoss, reduced: true })
      }
      this.k++
      this.record(this.k, X)
      if (this.t >= this.nextProgress) {
        this.nextProgress += 0.1
        if (this.opts.progress && this.opts.progress(this.t, this.T) === false) { this.error = '已取消'; this.finished = true; return }
      }
      if (this.opts.budgetMs && this.elapsed() > this.opts.budgetMs) { this.error = `计算时间超过 ${Math.round(this.opts.budgetMs / 1000)} s，已计算到 t = ${this.t.toFixed(4)} s`; this.finished = true; return }
    }
    this.finished = true
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
  get frames(): number { return this.k + 1 }

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
      if (imp.warning && !this.warnings.includes(imp.warning)) this.warnings.push(imp.warning)
      combined = combined ? { ...imp, points: [...combined.points, ...imp.points], energyBefore: combined.energyBefore, loss: combined.loss + imp.loss } : imp
    }
    const slack = fired.filter(f => f.type === 'slack').map(f => f.rope)
    let choice = determineMode(sys, Xc, undefined, slack.length ? { slack } : {})
    Xc = project(sys, Xc, choice.mode, this.projInfo)
    choice = { ...choice, solution: solveMode(sys, Xc, choice.mode) }
    if (choice.ambiguous) {
      this.stats.ambiguousModes++
      if (this.stats.ambiguousModes <= 3) this.warnings.push(`t 时刻接触状态无完全一致解（违背量 ${choice.violation.toExponential(2)}），已取最接近的一种`)
    }
    return { X: Xc, choice, impact: combined }
  }

  private stepFrom(X0: Float64Array, h: number, k1?: Float64Array): StepResult {
    const integrator = this.system.model.settings.integrator
    const slot = this.system.timeSlot
    if (integrator === 'rk4') return rk4Step(this.rhs, X0, h, k1, slot)
    if (integrator === 'euler') return eulerStep(this.rhs, X0, h, 3 * this.system.n, k1, slot)
    return dopri5Step(this.rhs, X0, h, this.ctl, k1, slot)
  }

  /** The mode solution at X when the last right-hand side was evaluated exactly there. */
  private cached(X: Float64Array): ModeSolution | undefined {
    return this.lastY === X && this.lastSol ? this.lastSol : undefined
  }

  private record(index: number, Xr: Float64Array) {
    this.states.set(Xr, index * this.size)
    this.frameSegment[index] = this.segments.length - 1
    this.impactLossArr[index] = this.impactLoss
  }

  /** A switch of a variable force that keeps toggling (sign(vx) at vx = 0 …) cannot be integrated. */
  private checkToggles(changes: ChangeDetail[]): string | null {
    for (const c of changes) {
      if (c.type !== 'switch' || c.switchIndex === undefined) continue
      const list = this.toggles.get(c.switchIndex) ?? []
      list.push(this.t)
      while (list.length && list[0] < this.t - 1e-6) list.shift()
      this.toggles.set(c.switchIndex, list)
      if (list.length > 40) {
        const f = this.system.model.forces.find(x => x.id === c.subject)
        return `${f?.name ?? c.subject}：变力表达式在 t = ${this.t.toFixed(9)} s 附近反复切换（例如 sign(vx) 在 vx = 0 处），无法确定方向，仿真停止。模拟摩擦请使用接触面的摩擦因数`
      }
    }
    return null
  }

  /**
   * Run until Date.now() passes `deadline` (checked every few steps) or the run ends. Returns true when
   * the run has ended (completed, stopped by an error, the budget or cancellation).
   */
  advance(deadline: number): boolean {
    if (this.finished) return true
    const started = Date.now()
    this.sliceStart = started
    try {
      this.loop(deadline)
    } catch (e) {
      this.error = e instanceof ForceExprError ? e.message : `求解器内部错误：${(e as Error).message}`
      this.finished = true
    }
    this.wallUsed += Date.now() - started
    if (this.finished) this.finish()
    return this.finished
  }

  /** Event-driven integration until the deadline or the end of the run. */
  private loop(deadline: number) {
    if (this.reducedFrom !== null) { this.reducedLoop(deadline); return }
    const sys = this.system, model = sys.model
    const opts = this.opts
    const st = model.settings
    const integrator = st.integrator
    const dt = this.dt, T = this.T, K = this.K
    const slot = sys.timeSlot
    const maxAtInstant = opts.maxEventsPerInstant ?? 200
    const budget = opts.budgetMs
    let since = 0
    while (this.k < K) {
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
      if (integrator === 'dopri5' && r.err > 1) {
        this.stats.rejected++
        this.h = hTry * Math.max(0.2, 0.9 * pow(r.err, -0.2))
        if (this.h < 1e-14) { this.error = `步长过小（t = ${t.toFixed(6)} s），仿真停止`; this.finished = true; return }
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
        this.segments.push({ index: this.segments.length, t0: tE, t1: T, mode: this.mode, X0: Float64Array.from(this.X), label: describeMode(this.mode), impactLoss: this.impactLoss })
        const changes = diffModes(sys, prevMode, this.mode, settled.impact)
        this.events.push({ index: this.events.length, t: tE, triggers: [...new Set(loc.fired.map(f => f.type))], changes, before: Float64Array.from(before), after: Float64Array.from(this.X), impact: settled.impact, segment: this.segments.length - 1 })
        this.stats.events++
        if (tE === tNext) { this.k++; this.record(this.k, this.X) }
        if (budget && this.elapsed() > budget) { this.error = `计算时间超过 ${Math.round(budget / 1000)} s，已计算到 t = ${tE.toFixed(4)} s`; this.finished = true; return }
        const chatter = model.switches.length ? this.checkToggles(changes) : null
        if (chatter) { this.error = chatter; this.finished = true; return }
        if (tE - this.lastEventT <= 1e-12) {
          this.eventsAtInstant++
          if (this.eventsAtInstant > maxAtInstant) {
            if (opts.fallback === false) { this.error = `t = ${tE.toFixed(9)} s 处事件抖振（同一时刻 ${this.eventsAtInstant} 次状态切换），仿真停止`; this.finished = true; return }
            this.startReduced(`t = ${tE.toFixed(9)} s 处同一时刻发生 ${this.eventsAtInstant} 次状态切换`)
            this.reducedLoop(deadline)
            return
          }
        } else this.eventsAtInstant = 0
        this.lastEventT = tE
        if (this.eventStorm(tE)) {
          this.startReduced(`碰撞与接触切换过于密集（${this.recentEvents.length} 次 / ${(opts.fallback || { window: 0.05 }).window} s）`)
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
      if (this.t >= this.nextProgress) {
        this.nextProgress += 0.1
        if (opts.progress && opts.progress(this.t, T) === false) { this.error = '已取消'; this.finished = true; return }
      }
      if (this.stats.steps > 5_000_000) { this.error = '步数超过上限，仿真停止'; this.finished = true; return }
      if (budget && (this.stats.steps & 255) === 0 && this.elapsed() > budget) { this.error = `计算时间超过 ${Math.round(budget / 1000)} s，已计算到 t = ${this.t.toFixed(4)} s（可缩短仿真时长或放宽容差）`; this.finished = true; return }
    }
    this.finished = true
  }

  /** Wall-clock time spent computing (ms), pauses between slices excluded. */
  private elapsed(): number { return this.wallUsed + Date.now() - this.sliceStart }

  /** Stop the run (the recording keeps what was computed). */
  cancel(message = '已取消') {
    if (this.finished) return
    this.error = message
    this.finished = true
    this.finish()
  }

  private finish() {
    if (this.result_) return
    const frameCount = this.error ? this.k + 1 : this.K + 1
    this.segments[this.segments.length - 1].t1 = Math.min(this.T, this.t)
    this.stats.maxPositionCorrection = this.projInfo.position
    this.stats.maxVelocityCorrection = this.projInfo.velocity
    this.stats.wallMs = this.wallUsed
    const size = this.size
    const statesOut = frameCount === this.K + 1 ? this.states : this.states.slice(0, frameCount * size)
    this.result_ = {
      scene: this.scene, system: this.system, dt: this.dt, frameCount, size, states: statesOut,
      frameSegment: this.frameSegment.slice(0, frameCount), impactLoss: this.impactLossArr.slice(0, frameCount),
      segments: this.segments, events: this.events, warnings: this.warnings, stats: this.stats, completed: !this.error, error: this.error,
      hash: recordingHash(statesOut, this.events)
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
   * A consistent prefix of the recording: the frames computed so far (sharing the run's buffers, which are
   * only appended to), the segments and events up to now. `completed` is false and `hash` empty.
   */
  partial(): Recording {
    if (this.finished) return this.result()
    const frameCount = this.k + 1
    const size = this.size
    const segs = this.segments.slice()
    const last = segs[segs.length - 1]
    segs[segs.length - 1] = { ...last, t1: Math.min(this.T, this.t) }
    const rec: Recording = {
      scene: this.scene, system: this.system, dt: this.dt, frameCount, size,
      states: this.states.subarray(0, frameCount * size),
      frameSegment: this.frameSegment.subarray(0, frameCount), impactLoss: this.impactLossArr.subarray(0, frameCount),
      segments: segs, events: this.events.slice(), warnings: this.warnings.slice(), stats: { ...this.stats, wallMs: this.wallUsed },
      completed: false, error: null, hash: ''
    }
    if (this.reducedFrom !== null) rec.reducedFrom = this.reducedFrom
    return rec
  }
}

/** SHA-256 fingerprint of a recording: all frame states, then the time and post-event state of every event. */
export function recordingHash(states: Float64Array, events: ReadonlyArray<{ t: number; after: Float64Array }>): string {
  const hasher = new Sha256()
  hasher.updateFloat64(states)
  for (const e of events) { hasher.updateFloat64(new Float64Array([e.t])); hasher.updateFloat64(e.after) }
  return hasher.digestHex()
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
  const r = st.integrator === 'rk4' ? rk4Step(rhs, X0, h, undefined, slot) : st.integrator === 'euler' ? eulerStep(rhs, X0, h, 3 * n, undefined, slot) : dopri5Step(rhs, X0, h, { relTol: st.relTol, absTol: st.absTol, count: 6 * n }, undefined, slot)
  if (slot >= 0) r.X[slot] = t
  return r.X
}

/** Mode solution (forces, contact states) at frame k. */
export function frameSolution(rec: Recording, k: number): ModeSolution {
  const seg = rec.segments[rec.frameSegment[k]]
  return solveMode(rec.system, frameState(rec, k), seg.mode)
}

/** Energy ledger of a state (J). */
export interface Ledger {
  kinetic: number; gravity: number; spring: number; mechanical: number
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
    kinetic: e.kinetic, gravity: e.gravity, spring: e.spring, mechanical: e.total,
    frictionHeat, appliedWork, damping, beltWork, impactLoss,
    balance: e.total + frictionHeat + damping + impactLoss - appliedWork - beltWork
  }
}

/** Energy ledger of frame k. */
export function frameLedger(rec: Recording, k: number): Ledger { return ledgerAt(rec, frameState(rec, k), rec.impactLoss[k]) }
