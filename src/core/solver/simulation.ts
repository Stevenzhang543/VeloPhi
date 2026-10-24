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
import { describeMode, determineMode } from './modes'
import { project, resolveInitialOverlap } from './project'
import type { ProjectionInfo } from './project'
import type { Rhs, StepResult } from './integrators'
import { dopri5Step, eulerStep, rk4Step } from './integrators'
import { computePoses } from './kinematics'
import { pow } from '../math/dmath'

export interface Segment {
  index: number
  t0: number
  t1: number
  mode: Mode
  /** State at t0 (after the event that opened the segment). */
  X0: Float64Array
  label: string
  /** Cumulative impact loss before this segment. */
  impactLoss: number
}

export type ChangeType =
  | 'impact' | 'touch' | 'separate' | 'stick' | 'slip' | 'reverse' | 'leave' | 'slack' | 'taut'

export interface ChangeDetail {
  type: ChangeType
  /** Pair key "a|b" or rope id. */
  subject: string
  bodies: string[]
  /** Impact data. */
  impulse?: number
  vnBefore?: number
  vnAfter?: number
  restitution?: number
  point?: { x: number; y: number }
  normal?: { x: number; y: number }
}

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

export interface SimStats {
  steps: number
  rejected: number
  events: number
  locateIterations: number
  maxPositionCorrection: number
  maxVelocityCorrection: number
  ambiguousModes: number
  wallMs: number
}

export interface Recording {
  scene: Scene
  system: System
  dt: number
  frameCount: number
  size: number
  /** frameCount × size, row-major. */
  states: Float64Array
  frameSegment: Int32Array
  /** Cumulative kinetic energy lost in impacts up to each frame (J). */
  impactLoss: Float64Array
  segments: Segment[]
  events: SimEvent[]
  warnings: string[]
  stats: SimStats
  completed: boolean
  error: string | null
  hash: string
}

export interface SimOptions {
  duration?: number
  /** Wall-clock budget in ms (the recording is kept up to where it stopped). */
  budgetMs?: number
  /** Called every ~0.1 s of simulated time; return false to stop. */
  progress?: (t: number, total: number) => boolean | void
  maxEventsPerInstant?: number
}

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
        if (p.vnBefore < 0) out.push({ type: 'impact', subject: p.pair.key, bodies: [p.pair.X.id, p.pair.Y.id], impulse: p.impulse, vnBefore: p.vnBefore, vnAfter: p.vnAfter, restitution: p.restitution, point: { x: p.cx, y: p.cy }, normal: { x: p.nx, y: p.ny } })
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
  return out
}

export function simulate(scene: Scene, opts: SimOptions = {}): Recording {
  const wall0 = Date.now()
  const model = compileModel(scene)
  const warnings = [...model.warnings]
  const sys = buildSystem(model)
  const st = model.settings
  const dt = st.outputStep
  const T = opts.duration ?? st.duration
  const K = Math.max(0, Math.round(T / dt))
  const size = sys.size
  const n = sys.n
  const states = new Float64Array((K + 1) * size)
  const frameSegment = new Int32Array(K + 1)
  const impactLossArr = new Float64Array(K + 1)
  const segments: Segment[] = []
  const events: SimEvent[] = []
  const stats: SimStats = { steps: 0, rejected: 0, events: 0, locateIterations: 0, maxPositionCorrection: 0, maxVelocityCorrection: 0, ambiguousModes: 0, wallMs: 0 }
  const projInfo: ProjectionInfo = { position: 0, velocity: 0 }
  let impactLoss = 0
  let error: string | null = null

  let X = initialState(sys)
  const overlap = resolveInitialOverlap(sys, X)
  if (overlap.removed > 0) {
    X = overlap.X
    warnings.push(`初始重叠 ${(overlap.removed * 1000).toPrecision(3)} mm 已移除（物体被推到刚好接触）`)
  }
  if (overlap.deep.length) warnings.push(`初始时 ${overlap.deep.join('、')} 深度重叠（超过 5 cm），这些物体之间的接触不会被正确处理，请调整位置`)

  /** Impacts, then the mode, then projection; returns the post-event state. */
  const settle = (Xin: Float64Array): { X: Float64Array; choice: ModeChoice; impact: ImpactResult | null } => {
    let Xc = Xin
    let combined: ImpactResult | null = null
    for (let k = 0; k < 8 && approaching(sys, Xc); k++) {
      const imp = resolveImpact(sys, Xc)
      if (!imp) break
      Xc = imp.X
      impactLoss += imp.loss
      combined = combined ? { ...imp, points: [...combined.points, ...imp.points], energyBefore: combined.energyBefore, loss: combined.loss + imp.loss } : imp
    }
    let choice = determineMode(sys, Xc)
    Xc = project(sys, Xc, choice.mode, projInfo)
    choice = { ...choice, solution: solveMode(sys, Xc, choice.mode) }
    if (choice.ambiguous) {
      stats.ambiguousModes++
      if (stats.ambiguousModes <= 3) warnings.push(`t 时刻接触状态无完全一致解（违背量 ${choice.violation.toExponential(2)}），已取最接近的一种`)
    }
    return { X: Xc, choice, impact: combined }
  }

  let t = 0
  const first = settle(X)
  X = first.X
  let mode = first.choice.mode
  let sol: ModeSolution = first.choice.solution
  segments.push({ index: 0, t0: 0, t1: T, mode, X0: Float64Array.from(X), label: describeMode(mode), impactLoss })
  if (first.impact) {
    events.push({ index: 0, t: 0, triggers: ['contact'], changes: diffModes(sys, null, mode, first.impact), before: initialState(sys), after: Float64Array.from(X), impact: first.impact, segment: 0 })
  }
  states.set(X, 0)
  frameSegment[0] = 0
  impactLossArr[0] = impactLoss

  const integrator = st.integrator
  const ctl = { relTol: st.relTol, absTol: st.absTol, count: 6 * n }
  let rhsMode = mode
  const rhs: Rhs = (Y, out) => { derivative(sys, Y, rhsMode, out) }
  const stepFrom = (X0: Float64Array, h: number, k1?: Float64Array): StepResult => {
    if (integrator === 'rk4') return rk4Step(rhs, X0, h, k1)
    if (integrator === 'euler') return eulerStep(rhs, X0, h, 3 * n, k1)
    return dopri5Step(rhs, X0, h, ctl, k1)
  }
  let fns: EventFn[] = buildEventFns(sys, mode, computePoses(model, X), sol, X)
  let k1 = new Float64Array(size)
  rhs(X, k1)
  let h = integrator === 'dopri5' ? Math.min(dt, initialStepGuess(X, k1, ctl, dt)) : dt
  let k = 0
  let lastEventT = -1
  let eventsAtInstant = 0
  const maxAtInstant = opts.maxEventsPerInstant ?? 200
  let nextProgress = 0.1

  const record = (index: number, Xr: Float64Array) => {
    states.set(Xr, index * size)
    frameSegment[index] = segments.length - 1
    impactLossArr[index] = impactLoss
  }

  while (k < K) {
    const tNext = (k + 1) * dt
    const remaining = tNext - t
    const clipped = h >= remaining
    const hTry = clipped ? remaining : h
    const r = stepFrom(X, hTry, k1)
    if (integrator === 'dopri5' && r.err > 1) {
      stats.rejected++
      h = hTry * Math.max(0.2, 0.9 * pow(r.err, -0.2))
      if (h < 1e-14) { error = `步长过小（t = ${t.toFixed(6)} s），仿真停止`; break }
      continue
    }
    const check = eventMargin(sys, fns, mode, r.X)
    if (check.margin < 0) {
      // ------------------------------------------------------------------ event
      const X0 = X
      const loc = locateEvent(sys, fns, mode, hh => (hh === 0 ? X0 : stepFrom(X0, hh, k1).X), hTry, check.margin)
      stats.locateIterations += loc.iterations
      const tE = loc.h >= remaining ? tNext : t + loc.h
      const before = loc.X
      const settled = settle(before)
      const prevMode = mode
      mode = settled.choice.mode
      sol = settled.choice.solution
      X = settled.X
      t = tE
      segments[segments.length - 1].t1 = t
      segments.push({ index: segments.length, t0: t, t1: T, mode, X0: Float64Array.from(X), label: describeMode(mode), impactLoss })
      const changes = diffModes(sys, prevMode, mode, settled.impact)
      events.push({ index: events.length, t, triggers: [...new Set(loc.fired.map(f => f.type))], changes, before: Float64Array.from(before), after: Float64Array.from(X), impact: settled.impact, segment: segments.length - 1 })
      stats.events++
      if (opts.budgetMs && Date.now() - wall0 > opts.budgetMs) { error = `计算时间超过 ${Math.round(opts.budgetMs / 1000)} s，已计算到 t = ${t.toFixed(4)} s`; break }
      if (t - lastEventT <= 1e-12) {
        eventsAtInstant++
        if (eventsAtInstant > maxAtInstant) { error = `t = ${t.toFixed(9)} s 处事件抖振（同一时刻 ${eventsAtInstant} 次状态切换），仿真停止`; break }
      } else eventsAtInstant = 0
      lastEventT = t
      rhsMode = mode
      fns = buildEventFns(sys, mode, computePoses(model, X), sol, X)
      rhs(X, k1)
      if (t === tNext) { k++; record(k, X) }
      if (integrator !== 'dopri5') h = dt
      continue
    }
    // ------------------------------------------------------------------ accept
    stats.steps++
    rearm(fns, check.values)
    X = project(sys, r.X, mode, projInfo)
    if (clipped) { t = tNext; k++; record(k, X) } else t += hTry
    if (integrator === 'dopri5') {
      const grow = r.err === 0 ? 5 : Math.min(5, Math.max(0.2, 0.9 * pow(r.err, -0.2)))
      const proposal = hTry * grow
      h = Math.min(dt, clipped ? Math.max(h, proposal) : proposal)
    } else h = dt
    rhs(X, k1)
    if (t >= nextProgress) {
      nextProgress += 0.1
      if (opts.progress && opts.progress(t, T) === false) { error = '已取消'; break }
    }
    if (stats.steps > 5_000_000) { error = '步数超过上限，仿真停止'; break }
    if (opts.budgetMs && (stats.steps & 255) === 0 && Date.now() - wall0 > opts.budgetMs) { error = `计算时间超过 ${Math.round(opts.budgetMs / 1000)} s，已计算到 t = ${t.toFixed(4)} s（可缩短仿真时长或放宽容差）`; break }
  }
  const frameCount = error ? k + 1 : K + 1
  segments[segments.length - 1].t1 = Math.min(T, t)
  stats.maxPositionCorrection = projInfo.position
  stats.maxVelocityCorrection = projInfo.velocity
  stats.wallMs = Date.now() - wall0
  const statesOut = frameCount === K + 1 ? states : states.slice(0, frameCount * size)
  const hasher = new Sha256()
  hasher.updateFloat64(statesOut)
  for (const e of events) { hasher.updateFloat64(new Float64Array([e.t])); hasher.updateFloat64(e.after) }
  return {
    scene, system: sys, dt, frameCount, size, states: statesOut,
    frameSegment: frameSegment.slice(0, frameCount), impactLoss: impactLossArr.slice(0, frameCount),
    segments, events, warnings, stats, completed: !error, error, hash: hasher.digestHex()
  }
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
  let X0: Float64Array, t0: number
  if (seg.t0 > tk) { X0 = seg.X0; t0 = seg.t0 } else { X0 = frameState(rec, k); t0 = tk }
  if (t === t0) return Float64Array.from(X0)
  const sys = rec.system
  const n = sys.n
  const rhs: Rhs = (Y, out) => { derivative(sys, Y, seg.mode, out) }
  const st = sys.model.settings
  const h = t - t0
  const r = st.integrator === 'rk4' ? rk4Step(rhs, X0, h) : st.integrator === 'euler' ? eulerStep(rhs, X0, h, 3 * n) : dopri5Step(rhs, X0, h, { relTol: st.relTol, absTol: st.absTol, count: 6 * n })
  return r.X
}

/** Mode solution (forces, contact states) at frame k. */
export function frameSolution(rec: Recording, k: number): ModeSolution {
  const seg = rec.segments[rec.frameSegment[k]]
  return solveMode(rec.system, frameState(rec, k), seg.mode)
}

export interface Ledger {
  kinetic: number; gravity: number; spring: number; mechanical: number
  frictionHeat: number; appliedWork: number; damping: number; beltWork: number; impactLoss: number
  /** E_mech + heat + damping + impact loss − applied work − belt work (constant in an exact solution). */
  balance: number
}

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

export function frameLedger(rec: Recording, k: number): Ledger { return ledgerAt(rec, frameState(rec, k), rec.impactLoss[k]) }
