/**
 * Dynamics for a fixed contact/connector mode.
 *
 * A mode says which contact points are closed, whether each contact unit sticks or slides (and which way),
 * and which ropes are taut. With the mode fixed the motion is smooth: every active constraint is an
 * equality at acceleration level, J·a + c = 0, and the constraint forces λ follow from
 *   (J M⁻¹ F̃ᵀ) λ = −(J M⁻¹ Q + c),   a = M⁻¹ (Q + F̃ᵀ λ),
 * where F̃ is the force direction of each row. For a sliding unit the kinetic friction μk·N is folded into
 * the direction of its normal rows (F̃ = Jn − μk·s·Jt), so friction is exactly Coulomb's law and needs no
 * unknown of its own. The system is solved with complete pivoting (redundant supports are detected).
 */
import type { Material } from '../../../../src/core/scene/types'
import { solveDense } from '../math/linalg'
import type { BodyModel, Model, SliderModel } from './model'
import { centralForce, centralPotential, pairKey, pairMaterial } from './model'
import { ENV_SIZE, ForceExprError, branchOf, fillEnv } from './forceExpr'
import { msg } from '../../../../src/i18n/message'
import type { ConstraintKin, ContactFeature, ContactKin, Pose, Probe, RowJ, RowTerm } from './kinematics'
import { anchorState, computePoses, contactKin, distanceKin, equalityKins, pairFeatures, pairProbes, rollKin, ropeKin, ropePath, sliderAxisKin } from './kinematics'

/**
 * Tolerances shared by the solver. Lengths in m, velocities in m/s, times in s; force and acceleration
 * tolerances are relative to the scene's force and acceleration scales.
 */
export const TOL = {
  /** Gap up to which a contact point touches and a rope counts as taut (m). */
  touch: 1e-8,
  /** Deepest penetration still treated as a touching contact (m). */
  deep: 1e-5,
  /** Margin of a feature's extent in region tests and leave/contact events (m). */
  ext: 1e-9,
  /** Relative velocity treated as zero (m/s). */
  vel: 1e-7,
  /** Impact speed below which restitution is ignored, so bounce sequences end (m/s). */
  zeno: 1e-5,
  /** Force threshold, relative to `forceScale`. */
  force: 1e-9,
  /** Acceleration threshold, relative to `accelScale`. */
  acc: 1e-9,
  /** Resolution of event location (s). */
  time: 1e-12,
  /** Position drift that triggers projection (m). */
  drift: 1e-12,
  /** Velocity drift that triggers projection (m/s). */
  velDrift: 1e-12
}

/** A pair of bodies that can touch: at least one is dynamic and they are not joined by a hinge. */
export interface PairInfo {
  index: number
  key: string
  X: BodyModel
  Y: BodyModel
  features: ContactFeature[]
  probes: Probe[]
  /** Effective material of the pair (see pairMaterial). */
  material: Material
}

/** Friction state of a contact unit. */
export type Friction = 'none' | 'stick' | 'slide'

/** Mode of one contact unit: its closed points and their common friction state. */
export interface UnitMode {
  pair: PairInfo
  /** Reference feature: defines the tangent t and the relative velocity vt of the unit. */
  ref: ContactFeature
  /** Closed contact points. */
  points: ContactFeature[]
  /** Touching points that were decided open (checked: they must not accelerate into contact). */
  open: ContactFeature[]
  friction: Friction
  /** Sliding direction: sign of vt (friction acts against it). */
  s: number
  /**
   * Rolling resistance (26.52, D59), present when the pair has some and a round body can turn: 0 while the relative
   * rolling ω_A − ω_B is locked (rolling rest), otherwise its sign (the resisting couple acts against it).
   */
  roll?: number
}

/**
 * Contact and connector mode. `taut[k]`: rope k is taut. `sw` holds the frozen branch (+1, −1, or 0 for sign
 * at zero) of every switch of the variable forces (model.switches); absent or empty when the scene has none.
 */
export interface Mode {
  units: UnitMode[]; taut: boolean[]; sw?: number[]
  /** End stops of the sliders (26.52, D58; present when some slider has one): 0 free, −1 at the lower, +1 at the upper stop. */
  limit?: number[]
  /** Torque-limited speed motors (26.52, D58; present when some motor has a limit): 0 locked, ±1 slipping with e = ω_rel − speed of that sign. */
  slip?: number[]
}

/** Kind of a constraint row ('weld', 'motor', 'drive', 'slider' and 'gear' since 26.51). */
export type RowKind = 'hinge' | 'weld' | 'motor' | 'drive' | 'rod' | 'slider' | 'gear' | 'rope' | 'normal' | 'tangent' | 'limit' | 'roll'
/** One active constraint at acceleration level: J·a + c = 0. */
export interface Row {
  kind: RowKind
  /** Connector index (hinge/rod/rope) or unit index (normal/tangent). */
  owner: number
  /** Hinge axis (0, 1) or point index in the unit. */
  sub: number
  /** Constraint gradient (acceleration row). */
  j: RowJ
  /** Force direction (differs from `j` for sliding contacts). */
  f: RowJ
  /** Velocity-dependent term c of J·a + c = 0. */
  c: number
  /** Position-level value (0 for tangent rows). */
  value: number
  /** Velocity-level value. */
  vel: number
}

/** Forces and kinematics of a contact unit in a mode solution. */
export interface UnitState {
  /** Total normal force (N). */
  normal: number
  /** Tangential force on the reference body A along t (N). */
  tangent: number
  /** Relative tangential velocity (m/s). */
  vt: number
  /** Rate of change of vt (m/s²). */
  at: number
  refKin: ContactKin
  pointKin: ContactKin[]
  /** Normal force of each closed point (N). */
  pointLambda: number[]
  openKin: ContactKin[]
  /** Rolling resistance couple on A (N·m; 0 without rolling resistance), relative rolling ω_A − ω_B and its rate (26.52). */
  roll: number
  wr: number
  wra: number
}

/** Solution of the dynamics of a mode at one state. */
export interface ModeSolution {
  poses: Pose[]
  rows: Row[]
  /** Constraint force of each row. */
  lambda: Float64Array
  /** Generalized accelerations (3n). */
  acc: Float64Array
  /** Applied generalized forces (3n). */
  Q: Float64Array
  /** Diagnostics of the dense solve (see SolveResult). */
  consistent: boolean
  residual: number
  rank: number
  units: UnitState[]
  /** Tension of each rope (N); 0 when slack. */
  ropeTension: number[]
  ropeKin: Array<{ value: number; vel: number; acc: number }>
  /** Energy ledger rates. */
  rates: Rates
  /** Force of each slider's end stop (N, pushing inwards; 0 when free); empty when no slider has stops (26.52). */
  limitForce: number[]
  /** Torque of each motor on b (N·m) and the rate of e = ω_b − ω_a − speed; empty when no motor has a torque limit (26.52). */
  driveTorque: number[]
  driveAcc: number[]
}

/** Energy ledger rates (W). */
export interface Rates {
  /** Friction heat. */
  heat: number
  /** Power of the applied forces. */
  appliedWork: number
  /** Spring damping dissipation. */
  damping: number
  /** Power delivered by conveyor belts and motors (26.51). */
  beltWork: number
  /** Relative sliding speed per pair index (m/s). */
  pairSlide: Float64Array
  /** Friction heat rate per pair index (W). */
  pairHeat: Float64Array
}

/** Ledger offsets after `auxBase`: heat, applied work, damping, belt work; per-pair entries start at AUX_FIXED. */
export const AUX_HEAT = 0, AUX_WORK = 1, AUX_DAMP = 2, AUX_BELT = 3, AUX_FIXED = 4

/**
 * The compiled model plus the layout of the state vector: positions (3n), velocities (3n), the ledger
 * entries (AUX_FIXED + 2 per pair), then the time entry if there is one.
 */
export interface System {
  model: Model
  /** Number of dynamic bodies. */
  n: number
  pairs: PairInfo[]
  pairByKey: Map<string, PairInfo>
  /** Index of the first auxiliary (ledger) entry in the state vector. */
  auxBase: number
  /** Index of the time entry (scenes with variable forces: the last entry, dt/dt = 1), else −1. */
  timeSlot: number
  /** Length of the state vector. */
  size: number
}

/**
 * Build the system: contact pairs, state layout, and the lengths given as "initial", resolved at `initial`
 * (default: the scene's initial state).
 */
export function buildSystem(model: Model, initial: Float64Array | null = null): System {
  const pairs: PairInfo[] = []
  const B = model.bodies
  for (let i = 0; i < B.length; i++) {
    for (let j = i + 1; j < B.length; j++) {
      const X = B[i], Y = B[j]
      if (!X.dynamic && !Y.dynamic) continue
      const key = pairKey(X.id, Y.id)
      if (model.noCollide.has(key)) continue
      pairs.push({ index: pairs.length, key, X, Y, features: pairFeatures(X, Y), probes: pairProbes(X, Y), material: pairMaterial(model.scene, X, Y) })
    }
  }
  const n = model.n
  const auxBase = 6 * n
  const timeSlot = model.hasExpr ? auxBase + AUX_FIXED + 2 * pairs.length : -1
  const size = auxBase + AUX_FIXED + 2 * pairs.length + (model.hasExpr ? 1 : 0)
  const sys: System = { model, n, pairs, pairByKey: new Map(pairs.map(p => [p.key, p])), auxBase, timeSlot, size }
  // Resolve lengths given as "initial" (null in the scene)
  const X0 = initial ?? initialState(sys)
  const poses = computePoses(model, X0)
  for (const r of model.ropes) if (!Number.isFinite(r.length)) r.length = ropePath(poses, r).length
  for (const r of model.rods) if (!Number.isFinite(r.length)) r.length = distanceKin(poses, r.a, r.b).value
  for (const s of model.springs) if (!Number.isFinite(s.restLength)) s.restLength = distanceKin(poses, s.a, s.b).value
  // 26.51: the relative angles of welds and sliders, and the angle sum of gears, are kept as they start
  const th = (b: BodyModel | null) => (b ? poses[b.global].th : 0)
  for (const w of model.welds) if (!Number.isFinite(w.angle0)) w.angle0 = th(w.b.body) - th(w.a.body)
  for (const sl of model.sliders) if (!Number.isFinite(sl.angle0)) sl.angle0 = th(sl.b.body) - th(sl.a.body)
  for (const g of model.gears) if (!Number.isFinite(g.offset0)) g.offset0 = th(g.a) + g.ratio * th(g.b)
  return sys
}

/** State vector of the scene's initial positions and velocities (ledger entries 0). */
export function initialState(sys: System): Float64Array {
  const X = new Float64Array(sys.size)
  const n = sys.n
  for (const b of sys.model.dynamic) {
    const i = b.index
    X[3 * i] = b.def.position.x; X[3 * i + 1] = b.def.position.y; X[3 * i + 2] = b.def.angle
    X[3 * n + 3 * i] = b.def.velocity.x; X[3 * n + 3 * i + 1] = b.def.velocity.y
    X[3 * n + 3 * i + 2] = b.invInertia > 0 ? b.def.angularVelocity : 0
  }
  // A branch (D52) continues its parent's energy ledger
  const l = sys.model.settings.startLedger
  if (l) {
    const a = sys.auxBase
    X[a + AUX_HEAT] = l.frictionHeat; X[a + AUX_WORK] = l.appliedWork; X[a + AUX_DAMP] = l.damping; X[a + AUX_BELT] = l.beltWork
    if (l.pairs) for (const p of sys.pairs) { const v = l.pairs[p.key]; if (v) { X[a + AUX_FIXED + 2 * p.index] = v[0]; X[a + AUX_FIXED + 2 * p.index + 1] = v[1] } }
  }
  return X
}

// ---- Helpers ----
/** Inverse mass and inverse moment of inertia of dynamic body i. */
export function invMassOf(model: Model, i: number): [number, number] {
  const b = model.dynamic[i]
  return [b.invMass, b.invInertia]
}

/** Product j · M⁻¹ · fᵀ of two rows. */
export function rowMinvRow(model: Model, j: RowJ, f: RowJ): number {
  const dyn = model.dynamic
  let s = 0
  // Same-body products in a fixed order: (a,a) (a,b) (b,a) (b,b), then the extra terms of multi-body rows
  if (j.ai >= 0) {
    if (j.ai === f.ai) { const b = dyn[j.ai]; s += b.invMass * (j.ax * f.ax + j.ay * f.ay) + b.invInertia * j.aw * f.aw }
    if (j.ai === f.bi) { const b = dyn[j.ai]; s += b.invMass * (j.ax * f.bx + j.ay * f.by) + b.invInertia * j.aw * f.bw }
  }
  if (j.bi >= 0) {
    if (j.bi === f.ai) { const b = dyn[j.bi]; s += b.invMass * (j.bx * f.ax + j.by * f.ay) + b.invInertia * j.bw * f.aw }
    if (j.bi === f.bi) { const b = dyn[j.bi]; s += b.invMass * (j.bx * f.bx + j.by * f.by) + b.invInertia * j.bw * f.bw }
  }
  if (j.ex || f.ex) s += extraMinv(model, j, f)
  return s
}

/** Products involving the `ex` terms of multi-body rows (ropes over movable pulleys). */
function extraMinv(model: Model, j: RowJ, f: RowJ): number {
  const jt = rowTerms(j), ft = rowTerms(f)
  let s = 0
  for (let a = 0; a < jt.length; a++) {
    for (let c = 0; c < ft.length; c++) {
      if (a < 2 && c < 2) continue // Counted in rowMinvRow
      const p = jt[a], q = ft[c]
      if (p.i < 0 || p.i !== q.i) continue
      const b = model.dynamic[p.i]
      s += b.invMass * (p.x * q.x + p.y * q.y) + b.invInertia * p.w * q.w
    }
  }
  return s
}

/** All terms of a row (slots a and b first, unused slots with index −1). */
export function rowTerms(j: RowJ): RowTerm[] {
  const out: RowTerm[] = [{ i: j.ai, x: j.ax, y: j.ay, w: j.aw }, { i: j.bi, x: j.bx, y: j.by, w: j.bw }]
  if (j.ex) out.push(...j.ex)
  return out
}

/** Product j · v with a generalized vector v (3n entries from `offset`). */
export function rowDot(j: RowJ, v: Float64Array, offset = 0): number {
  let s = 0
  if (j.ai >= 0) s += j.ax * v[offset + 3 * j.ai] + j.ay * v[offset + 3 * j.ai + 1] + j.aw * v[offset + 3 * j.ai + 2]
  if (j.bi >= 0) s += j.bx * v[offset + 3 * j.bi] + j.by * v[offset + 3 * j.bi + 1] + j.bw * v[offset + 3 * j.bi + 2]
  if (j.ex) for (const t of j.ex) s += t.x * v[offset + 3 * t.i] + t.y * v[offset + 3 * t.i + 1] + t.w * v[offset + 3 * t.i + 2]
  return s
}

/** Add λ · fᵀ (the generalized force of a row) to `out`. */
export function addRow(out: Float64Array, f: RowJ, lambda: number) {
  if (f.ai >= 0) { out[3 * f.ai] += f.ax * lambda; out[3 * f.ai + 1] += f.ay * lambda; out[3 * f.ai + 2] += f.aw * lambda }
  if (f.bi >= 0) { out[3 * f.bi] += f.bx * lambda; out[3 * f.bi + 1] += f.by * lambda; out[3 * f.bi + 2] += f.bw * lambda }
  if (f.ex) for (const t of f.ex) { out[3 * t.i] += t.x * lambda; out[3 * t.i + 1] += t.y * lambda; out[3 * t.i + 2] += t.w * lambda }
}

/** Row a + k·b; both rows act on the same two bodies (contact rows of one pair). */
export function combine(a: RowJ, b: RowJ, k: number): RowJ {
  const r: RowJ = { ...a }
  const put = (bi: number, x: number, y: number, w: number) => {
    if (bi < 0) return
    if (r.ai === bi) { r.ax += k * x; r.ay += k * y; r.aw += k * w } else if (r.bi === bi) { r.bx += k * x; r.by += k * y; r.bw += k * w } else if (r.ai < 0) { r.ai = bi; r.ax = k * x; r.ay = k * y; r.aw = k * w } else { r.bi = bi; r.bx = k * x; r.by = k * y; r.bw = k * w }
  }
  put(b.ai, b.ax, b.ay, b.aw)
  put(b.bi, b.bx, b.by, b.bw)
  return r
}

const envScratch = new Float64Array(ENV_SIZE)

/**
 * Value of variable force k at state X: world components (N). `sw` are the frozen switch branches of the
 * mode (null: exact evaluation, used for readouts outside a mode). Throws ForceExprError when not finite.
 */
export function forceValue(sys: System, k: number, X: Float64Array, sw: ArrayLike<number> | null): { x: number; y: number } {
  const model = sys.model
  const f = model.forces[k]
  if (!f.expr) return f.force
  const body = f.a.body
  if (!body || body.index < 0) return { x: 0, y: 0 }
  const g = model.settings.gravity
  fillEnv(envScratch, X, sys.n, body.index, sys.timeSlot, body.mass, Math.sqrt(g.x * g.x + g.y * g.y))
  // A branch (D52) runs from 0 on its own clock; its variable forces see the absolute time
  const t0 = model.settings.startTime
  if (t0) envScratch[0] += t0
  const s = sw && sw.length === model.switches.length ? sw : null
  const fx = f.expr.x.fn(envScratch, s), fy = f.expr.y.fn(envScratch, s)
  if (!Number.isFinite(fx) || !Number.isFinite(fy)) {
    const t = envScratch[0]
    throw new ForceExprError(msg('err.forceNotFinite', { force: f.name, t, fx, fy }))
  }
  return { x: fx, y: fy }
}

/** Switching argument of switch s at state X with the frozen branches sw (null: exact). */
export function switchArg(sys: System, s: number, X: Float64Array, sw: ArrayLike<number> | null): number {
  const model = sys.model
  const f = model.forces[model.switchForce[s]]
  const body = f.a.body
  if (!body || body.index < 0) return 1
  const g = model.settings.gravity
  fillEnv(envScratch, X, sys.n, body.index, sys.timeSlot, body.mass, Math.sqrt(g.x * g.x + g.y * g.y))
  const t0 = model.settings.startTime
  if (t0) envScratch[0] += t0
  return model.switches[s].arg(envScratch, sw && sw.length === model.switches.length ? sw : null)
}

/** Branches of all switches at state X (exact evaluation of the arguments). */
export function switchBranches(sys: System, X: Float64Array): number[] {
  const model = sys.model
  const out: number[] = []
  for (let s = 0; s < model.switches.length; s++) out.push(branchOf(model.switches[s], switchArg(sys, s, X, null)))
  return out
}

/** Applied generalized forces: gravity, constant and variable forces, springs (with damping). */
export function appliedForces(sys: System, poses: Pose[], rates: Rates | null, X?: Float64Array, sw?: ArrayLike<number> | null): Float64Array {
  const model = sys.model
  const Q = new Float64Array(3 * sys.n)
  const g = model.settings.gravity
  for (const b of model.dynamic) { Q[3 * b.index] = b.mass * g.x; Q[3 * b.index + 1] = b.mass * g.y }
  // 26.51 (D50): drag on the centre of mass, F = −(b + c|v|)v; its power is dissipated (damping entry)
  for (const b of model.dynamic) {
    if (b.dragLin === 0 && b.dragQuad === 0) continue
    const p = poses[b.global]
    const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
    const k = b.dragLin + b.dragQuad * sp
    Q[3 * b.index] -= k * p.vx; Q[3 * b.index + 1] -= k * p.vy
    if (rates) rates.damping += k * sp * sp
  }
  // 26.51 (D50): gravitation between every pair of bodies with mass, at least one of them moving
  if (model.G > 0) {
    const at = model.attractors
    for (let i = 0; i < at.length; i++) {
      for (let j = i + 1; j < at.length; j++) {
        const A = at[i], B = at[j]
        if (!A.dynamic && !B.dynamic) continue
        const pa = A.dynamic ? poses[A.global] : A.gravPos, pb = B.dynamic ? poses[B.global] : B.gravPos
        const dx = pb.x - pa.x, dy = pb.y - pa.y
        const d2 = dx * dx + dy * dy
        if (!(d2 > 0)) continue
        const d = Math.sqrt(d2)
        // Inside the sum of the bounding radii (bodies that may overlap: joined, or passing through) the pull falls
        // off linearly, as inside a uniform sphere; it is the inverse square outside and continuous at R
        const R = A.bound + B.bound
        const f = d >= R ? model.G * A.attract * B.attract / d2 : model.G * A.attract * B.attract * d / (R * R * R)
        const fx = f * dx / d, fy = f * dy / d
        if (A.dynamic) { Q[3 * A.index] += fx; Q[3 * A.index + 1] += fy }
        if (B.dynamic) { Q[3 * B.index] -= fx; Q[3 * B.index + 1] -= fy }
      }
    }
  }
  // 26.52 (D60): central fields pull (k > 0) each target's centre of mass towards the centre; a centre on a dynamic body
  // takes the reaction at its point. Conservative: the potential is part of the mechanical energy, no ledger entry
  for (const c of model.centrals) {
    const P = anchorState(poses, c.a)
    const cb = c.a.body
    for (const t of c.targets) {
      const p = poses[t.global]
      const dx = p.x - P.px, dy = p.y - P.py
      const r = Math.sqrt(dx * dx + dy * dy)
      if (!(r > 0)) continue
      const F = centralForce(c.k, c.n, r, t.bound)
      const fx = -F * dx / r, fy = -F * dy / r
      Q[3 * t.index] += fx; Q[3 * t.index + 1] += fy
      if (cb && cb.index >= 0) { Q[3 * cb.index] -= fx; Q[3 * cb.index + 1] -= fy; Q[3 * cb.index + 2] -= P.rx * fy - P.ry * fx }
    }
  }
  // 26.51 (D51): torque motors act on b and react on a; their power is motor work
  for (const m of model.motors) {
    if (m.mode !== 'torque') continue
    const a = m.a.body, b = m.b.body
    if (b && b.index >= 0) Q[3 * b.index + 2] += m.torque
    if (a && a.index >= 0) Q[3 * a.index + 2] -= m.torque
    if (rates) rates.beltWork += m.torque * ((b ? poses[b.global].w : 0) - (a ? poses[a.global].w : 0))
  }
  for (let k = 0; k < model.forces.length; k++) {
    const f = model.forces[k]
    if (!f.a.body || f.a.body.index < 0) continue
    const p = anchorState(poses, f.a)
    const i = f.a.body.index
    const F = f.expr ? (X ? forceValue(sys, k, X, sw ?? null) : { x: 0, y: 0 }) : f.force
    Q[3 * i] += F.x; Q[3 * i + 1] += F.y; Q[3 * i + 2] += p.rx * F.y - p.ry * F.x
    if (rates) rates.appliedWork += F.x * p.vx + F.y * p.vy
  }
  for (const s of model.springs) {
    const pa = anchorState(poses, s.a), pb = anchorState(poses, s.b)
    const dx = pa.px - pb.px, dy = pa.py - pb.py
    const L = Math.sqrt(dx * dx + dy * dy)
    if (L === 0) continue
    const ux = dx / L, uy = dy / L
    const vrel = ux * (pa.vx - pb.vx) + uy * (pa.vy - pb.vy)
    const ext = L - s.restLength
    const mag = s.cubic !== 0 ? -s.stiffness * ext - s.cubic * ext * ext * ext - s.damping * vrel : -s.stiffness * ext - s.damping * vrel
    if (s.a.body && s.a.body.index >= 0) {
      const i = s.a.body.index
      Q[3 * i] += mag * ux; Q[3 * i + 1] += mag * uy; Q[3 * i + 2] += pa.rx * mag * uy - pa.ry * mag * ux
    }
    if (s.b.body && s.b.body.index >= 0) {
      const i = s.b.body.index
      Q[3 * i] -= mag * ux; Q[3 * i + 1] -= mag * uy; Q[3 * i + 2] -= pb.rx * mag * uy - pb.ry * mag * ux
    }
    if (rates) rates.damping += s.damping * vrel * vrel
  }
  return Q
}

/** Zeroed ledger rates for `pairs` contact pairs. */
export function newRates(pairs = 0): Rates {
  return { heat: 0, appliedWork: 0, damping: 0, beltWork: 0, pairSlide: new Float64Array(pairs), pairHeat: new Float64Array(pairs) }
}

/** Surface speed of the face owner of a feature (conveyors). */
export function beltOf(f: ContactFeature): number { return f.kind === 'pf' ? f.B.body.beltSpeed : 0 }

/**
 * Radius of the rolling body of a contact (26.52, D59): the round side's radius (the smaller one when both are round),
 * 0 when neither side is round or neither body can turn.
 */
export function rollRadius(f: ContactFeature): number {
  const rA = f.A.radius, rB = f.kind === 'pp' ? f.B.radius : 0
  const R = rA > 0 && rB > 0 ? Math.min(rA, rB) : rA > 0 ? rA : rB
  if (!(R > 0)) return 0
  return f.A.body.invInertia > 0 || f.B.body.invInertia > 0 ? R : 0
}

/** Rolling resistance coefficient of a pair (0: none). */
export function rollingOf(pair: PairInfo): number { return pair.material.rolling ?? 0 }

/**
 * The end-stop row of slider k on side −1 (lower) or +1 (upper): g = s − lo or hi − s ≥ 0, its force pushes inwards.
 */
export function limitRow(sl: SliderModel, k: number, side: number, kin: ConstraintKin): Row {
  if (side < 0) return { kind: 'limit', owner: k, sub: 0, j: kin.j, f: kin.j, c: kin.c, value: kin.value - sl.lo, vel: kin.vel }
  const j = negRow(kin.j)
  return { kind: 'limit', owner: k, sub: 1, j, f: j, c: -kin.c, value: sl.hi - kin.value, vel: -kin.vel }
}

/** A row with every coefficient negated. */
export function negRow(r: RowJ): RowJ {
  const out: RowJ = { ai: r.ai, ax: -r.ax, ay: -r.ay, aw: -r.aw, bi: r.bi, bx: -r.bx, by: -r.by, bw: -r.bw }
  if (r.ex) out.ex = r.ex.map(t => ({ i: t.i, x: -t.x, y: -t.y, w: -t.w }))
  return out
}

// ---- Solve ----
/** Kinematics of a unit's reference, closed and open points. */
export interface UnitKin { refKin: ContactKin; pointKin: ContactKin[]; openKin: ContactKin[]; rollKin: ConstraintKin | null }
/** Rows of a mode with the kinematics they were built from. */
export interface ModeRows { rows: Row[]; unitKin: UnitKin[]; ropeKins: ReturnType<typeof ropeKin>[] }

/** The active constraint rows of a mode at given poses. */
export function buildRows(sys: System, poses: Pose[], mode: Mode): ModeRows {
  const model = sys.model
  const rows: Row[] = []
  const slip = mode.slip
  for (const e of equalityKins(model, poses)) {
    // A slipping torque-limited motor (26.52) drives with ±τmax (an applied torque), not with its speed row
    if (slip && e.kind === 'drive' && slip[e.owner] !== 0) continue
    rows.push({ kind: e.kind, owner: e.owner, sub: e.sub, j: e.kin.j, f: e.kin.j, c: e.kin.c, value: e.kin.value, vel: e.kin.vel })
  }
  // 26.52: closed end stops of sliders
  if (mode.limit) {
    const lim = mode.limit
    model.sliders.forEach((sl, k) => { if (lim[k] !== 0) rows.push(limitRow(sl, k, lim[k], sliderAxisKin(poses, sl))) })
  }
  const ropeKins = model.ropes.map((r, k) => {
    const rk = ropeKin(poses, r)
    if (mode.taut[k]) rows.push({ kind: 'rope', owner: k, sub: 0, j: rk.j, f: rk.j, c: rk.c, value: rk.value, vel: rk.vel })
    return rk
  })
  const unitKin = mode.units.map((u, ui) => {
    const refKin = contactKin(u.ref, poses)
    const pointKin = u.points.map(p => (p === u.ref ? refKin : contactKin(p, poses)))
    const openKin = u.open.map(p => contactKin(p, poses))
    const muK = u.pair.material.muK
    // 26.52 (D59): rolling resistance; while rolling its couple −sign·C_rr·R·N is folded into the normal rows
    const rk = u.roll !== undefined && u.points.length > 0 ? rollKin(poses, u.ref.A.body, u.ref.B.body) : null
    const rr = rk && u.roll !== 0 ? -u.roll! * rollingOf(u.pair) * rollRadius(u.ref) : 0
    pointKin.forEach((k, pi) => {
      let f = u.friction === 'slide' ? combine(k.jn, refKin.jt, -muK * u.s) : k.jn
      if (rr !== 0) f = combine(f, rk!.j, rr)
      rows.push({ kind: 'normal', owner: ui, sub: pi, j: k.jn, f, c: k.cn, value: k.gap, vel: k.vn })
    })
    if (u.friction === 'stick' && u.points.length > 0) {
      rows.push({ kind: 'tangent', owner: ui, sub: 0, j: refKin.jt, f: refKin.jt, c: refKin.ct, value: 0, vel: refKin.vt })
    }
    if (rk && u.roll === 0) rows.push({ kind: 'roll', owner: ui, sub: 0, j: rk.j, f: rk.j, c: 0, value: 0, vel: rk.vel })
    return { refKin, pointKin, openKin, rollKin: rk }
  })
  return { rows, unitKin, ropeKins }
}

/**
 * Weights of the minimum-norm choice among the forces of a rank-deficient mode at rest (26.53, D73): friction of
 * sticking contacts (weight above 1) is made as small as possible first — a ball at rest in a symmetric V-groove gets
 * no friction and N = mg/(2 cos θ) on each side, the textbook answer — then every other force (redundant supports
 * share their load evenly); see `solveDense`.
 */
export function minNormWeights(rows: Row[]): Float64Array {
  const w = new Float64Array(rows.length)
  for (let r = 0; r < rows.length; r++) w[r] = rows[r].kind === 'tangent' ? 1e12 : 1
  return w
}

/**
 * How far constraint forces leave the conditions of their mode (26.53, D73): pulling contact points, pushing ropes
 * and end stops, sticking friction outside μs·N and rolling couples outside their limit (0: within; tolerance as in
 * the mode check).
 */
function forceExcess(sys: System, mode: Mode, rows: Row[], lambda: Float64Array): number {
  const eps = TOL.force * sys.model.forceScale
  const nu = mode.units.length
  const normal = new Array<number>(nu).fill(0), tangent = new Array<number>(nu).fill(0), roll = new Array<number>(nu).fill(0)
  let v = 0
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r], l = lambda[r]
    if (row.kind === 'normal') { if (l < -eps) v += -l; normal[row.owner] += l }
    else if (row.kind === 'tangent') tangent[row.owner] = l
    else if (row.kind === 'roll') roll[row.owner] = l
    else if (row.kind === 'rope' || row.kind === 'limit') { if (l < -eps) v += -l }
  }
  mode.units.forEach((u, ui) => {
    if (u.points.length === 0) return
    if (u.friction === 'stick') {
      const margin = u.pair.material.muS * normal[ui] - Math.abs(tangent[ui])
      if (margin < -eps) v += -margin
    }
    if (u.roll === 0) {
      const margin = rollingOf(u.pair) * rollRadius(u.ref) * normal[ui] - Math.abs(roll[ui])
      if (margin < -eps) v += -margin
    }
  })
  return v
}

/** Solve the dynamics of a mode at state X: accelerations, constraint forces and ledger rates. */
export function solveMode(sys: System, X: Float64Array, mode: Mode, posesIn?: Pose[]): ModeSolution {
  const model = sys.model
  const n = sys.n
  const poses = posesIn ?? computePoses(model, X)
  const rates = newRates(sys.pairs.length)
  const Q = appliedForces(sys, poses, rates, X, mode.sw ?? null)
  // 26.52 (D58): a slipping torque-limited motor drives b with −sign(e)·τmax (reaction on a); its power is motor work
  if (mode.slip) slipTorques(model, poses, mode.slip, Q, rates)
  const { rows, unitKin, ropeKins } = buildRows(sys, poses, mode)
  const m = rows.length
  // Unconstrained accelerations a0 = M⁻¹Q
  const a0 = new Float64Array(3 * n)
  for (const b of model.dynamic) {
    const i = b.index
    a0[3 * i] = Q[3 * i] * b.invMass; a0[3 * i + 1] = Q[3 * i + 1] * b.invMass; a0[3 * i + 2] = Q[3 * i + 2] * b.invInertia
  }
  let lambda = new Float64Array(m)
  let consistent = true, residual = 0, rank = 0
  if (m > 0) {
    const A = new Float64Array(m * m)
    const rhs = new Float64Array(m)
    for (let r = 0; r < m; r++) {
      for (let k = 0; k < m; k++) A[r * m + k] = rowMinvRow(model, rows[r].j, rows[k].f)
      rhs[r] = -(rowDot(rows[r].j, a0) + rows[r].c)
    }
    // 26.53 (D73): at rest, redundant contacts (statically indeterminate) take the least friction, then the least
    // force; in motion the basic solution of 26.52 stays (the choice among equivalent forces then decides when
    // contacts start to slide, and switching it within a step makes the right-hand side jump)
    let atRest = true
    for (let k = 3 * n; k < 6 * n; k++) if (!(Math.abs(X[k]) <= TOL.vel)) { atRest = false; break }
    const res = solveDense(m, A, rhs, 1e-12, true, atRest ? minNormWeights(rows) : null)
    lambda = res.x; consistent = res.consistent; residual = res.residual; rank = res.rank
    // A least-friction choice that needs a pulling contact, a pushing rope or a force outside a friction cone is
    // not taken: the basic solution stays (26.53; otherwise every mode of such a contact set looked inconsistent)
    if (res.basic && forceExcess(sys, mode, rows, lambda) > 0) lambda = res.basic
  }
  const G = Float64Array.from(Q)
  for (let r = 0; r < m; r++) addRow(G, rows[r].f, lambda[r])
  const acc = new Float64Array(3 * n)
  for (const b of model.dynamic) {
    const i = b.index
    acc[3 * i] = G[3 * i] * b.invMass; acc[3 * i + 1] = G[3 * i + 1] * b.invMass; acc[3 * i + 2] = G[3 * i + 2] * b.invInertia
  }
  // Unit summaries and ledger rates
  const units: UnitState[] = mode.units.map((u, ui) => {
    const { refKin, pointKin, openKin, rollKin: rk } = unitKin[ui]
    const pointLambda: number[] = []
    let normal = 0, tangent = 0, roll = 0
    for (let r = 0; r < m; r++) {
      const row = rows[r]
      if (row.owner !== ui) continue
      if (row.kind === 'normal') { pointLambda.push(lambda[r]); normal += lambda[r] } else if (row.kind === 'tangent') tangent = lambda[r]
      else if (row.kind === 'roll') roll = lambda[r]
    }
    if (u.friction === 'slide') tangent = -u.pair.material.muK * u.s * normal
    const vt = refKin.vt
    const at = rowDot(refKin.jt, acc) + refKin.ct
    if (u.points.length > 0) {
      const heat = -tangent * vt
      rates.heat += heat
      rates.beltWork += -beltOf(u.ref) * tangent
      if (u.friction === 'slide') {
        rates.pairSlide[u.pair.index] += Math.abs(vt)
        rates.pairHeat[u.pair.index] += heat
      }
    }
    let wr = 0, wra = 0
    if (rk) {
      wr = rk.vel
      wra = rowDot(rk.j, acc) + rk.c
      if (u.roll !== 0) roll = -u.roll! * rollingOf(u.pair) * rollRadius(u.ref) * normal
      // The couple's work is friction heat (26.52: booked with the friction of the pair)
      const rh = -roll * wr
      rates.heat += rh
      rates.pairHeat[u.pair.index] += rh
    }
    return { normal, tangent, vt, at, refKin, pointKin, pointLambda, openKin, roll, wr, wra }
  })
  // 26.51: the drive of a speed motor delivers λ·(ω_b − ω_a) (motor work)
  for (let r = 0; r < m; r++) {
    const row = rows[r]
    if (row.kind !== 'drive') continue
    const mo = model.motors[row.owner]
    const wa = mo.a.body ? poses[mo.a.body.global].w : 0, wb = mo.b.body ? poses[mo.b.body.global].w : 0
    rates.beltWork += lambda[r] * (wb - wa)
  }
  const ropeTension = model.ropes.map((_, k) => {
    for (let r = 0; r < m; r++) if (rows[r].kind === 'rope' && rows[r].owner === k) return lambda[r]
    return 0
  })
  const ropeKinOut = ropeKins.map(rk => ({ value: rk.value, vel: rk.vel, acc: rowDot(rk.j, acc) + rk.c }))
  // 26.52: end-stop forces and motor torques
  const limitForce: number[] = []
  if (model.hasLimits) {
    for (let k = 0; k < model.sliders.length; k++) limitForce.push(0)
    for (let r = 0; r < m; r++) if (rows[r].kind === 'limit') limitForce[rows[r].owner] = lambda[r]
  }
  const driveTorque: number[] = [], driveAcc: number[] = []
  if (model.hasSlip) {
    model.motors.forEach((mo, k) => {
      const a = mo.a.body, b = mo.b.body
      driveAcc.push((b && b.index >= 0 ? acc[3 * b.index + 2] : 0) - (a && a.index >= 0 ? acc[3 * a.index + 2] : 0))
      if (mo.mode === 'torque') { driveTorque.push(mo.torque); return }
      const d = mode.slip ? mode.slip[k] : 0
      if (d !== 0) { driveTorque.push(-d * mo.maxTorque); return }
      let tq = 0
      for (let r = 0; r < m; r++) if (rows[r].kind === 'drive' && rows[r].owner === k) tq = lambda[r]
      driveTorque.push(tq)
    })
  }
  return { poses, rows, lambda, acc, Q, consistent, residual, rank, units, ropeTension, ropeKin: ropeKinOut, rates, limitForce, driveTorque, driveAcc }
}

/** Applied torques of slipping torque-limited motors (26.52, D58), with their power as motor work. */
function slipTorques(model: Model, poses: Pose[], slip: number[], Q: Float64Array, rates: Rates | null) {
  model.motors.forEach((mo, k) => {
    const d = slip[k]
    if (!d) return
    const tq = -d * mo.maxTorque
    const a = mo.a.body, b = mo.b.body
    if (b && b.index >= 0) Q[3 * b.index + 2] += tq
    if (a && a.index >= 0) Q[3 * a.index + 2] -= tq
    if (rates) rates.beltWork += tq * ((b ? poses[b.global].w : 0) - (a ? poses[a.global].w : 0))
  })
}

/** Time derivative of the state for a fixed mode. */
export function derivative(sys: System, X: Float64Array, mode: Mode, out: Float64Array): ModeSolution {
  const sol = solveMode(sys, X, mode)
  const n = sys.n
  for (let k = 0; k < 3 * n; k++) { out[k] = X[3 * n + k]; out[3 * n + k] = sol.acc[k] }
  const base = sys.auxBase
  for (let k = base; k < sys.size; k++) out[k] = 0
  out[base + AUX_HEAT] = sol.rates.heat
  out[base + AUX_WORK] = sol.rates.appliedWork
  out[base + AUX_DAMP] = sol.rates.damping
  out[base + AUX_BELT] = sol.rates.beltWork
  const slide = sol.rates.pairSlide, heat = sol.rates.pairHeat
  for (let p = 0; p < slide.length; p++) { out[base + AUX_FIXED + 2 * p] = slide[p]; out[base + AUX_FIXED + 2 * p + 1] = heat[p] }
  if (sys.timeSlot >= 0) out[sys.timeSlot] = 1
  return sol
}

// ---- Energy ----
/** Mechanical energy (J): kinetic, gravitational (zero at `energyZeroY`) and spring potential. */
export interface EnergyParts {
  kinetic: number; gravity: number; spring: number
  /** Potential of the central fields (26.52, D60; 0 without them). */
  field: number
  total: number
}

/** Mechanical energy of state X. */
export function energy(sys: System, X: Float64Array, posesIn?: Pose[]): EnergyParts {
  const model = sys.model, n = sys.n
  const poses = posesIn ?? computePoses(model, X)
  let kinetic = 0, gravity = 0, spring = 0
  const g = model.settings.gravity
  const y0 = model.settings.energyZeroY
  for (const b of model.dynamic) {
    const i = b.index
    const vx = X[3 * n + 3 * i], vy = X[3 * n + 3 * i + 1], w = X[3 * n + 3 * i + 2]
    kinetic += 0.5 * b.mass * (vx * vx + vy * vy) + (b.invInertia > 0 ? 0.5 * b.inertia * w * w : 0)
    gravity += -b.mass * (g.x * X[3 * i] + g.y * (X[3 * i + 1] - y0))
  }
  for (const s of model.springs) {
    if (s.damper) continue
    const pa = anchorState(poses, s.a), pb = anchorState(poses, s.b)
    const dx = pa.px - pb.px, dy = pa.py - pb.py
    const e = Math.sqrt(dx * dx + dy * dy) - s.restLength
    spring += s.cubic !== 0 ? 0.5 * s.stiffness * e * e + 0.25 * s.cubic * e * e * e * e : 0.5 * s.stiffness * e * e
  }
  // 26.51: potential energy of gravitation, −G·m₁m₂/r per pair (counted with gravity)
  if (model.G > 0) {
    const at = model.attractors
    for (let i = 0; i < at.length; i++) {
      for (let j = i + 1; j < at.length; j++) {
        const A = at[i], B = at[j]
        if (!A.dynamic && !B.dynamic) continue
        const pa = A.dynamic ? poses[A.global] : A.gravPos, pb = B.dynamic ? poses[B.global] : B.gravPos
        const dx = pb.x - pa.x, dy = pb.y - pa.y
        const d = Math.sqrt(dx * dx + dy * dy)
        const R = A.bound + B.bound
        if (d >= R && d > 0) gravity -= model.G * A.attract * B.attract / d
        else if (d < R) gravity -= model.G * A.attract * B.attract * (3 * R * R - d * d) / (2 * R * R * R)
      }
    }
  }
  // 26.52 (D60): potential of the central fields (scenes without them keep the sum of 26.51)
  let field = 0
  for (const c of model.centrals) {
    const P = anchorState(poses, c.a)
    for (const t of c.targets) {
      const p = poses[t.global]
      const dx = p.x - P.px, dy = p.y - P.py
      field += centralPotential(c.k, c.n, Math.sqrt(dx * dx + dy * dy), t.bound)
    }
  }
  return { kinetic, gravity, spring, field, total: model.centrals.length ? kinetic + gravity + spring + field : kinetic + gravity + spring }
}

/** Kinetic energy of state X (J). */
export function kineticEnergy(sys: System, X: Float64Array): number {
  const n = sys.n
  let k = 0
  for (const b of sys.model.dynamic) {
    const i = b.index
    const vx = X[3 * n + 3 * i], vy = X[3 * n + 3 * i + 1], w = X[3 * n + 3 * i + 2]
    k += 0.5 * b.mass * (vx * vx + vy * vy) + (b.invInertia > 0 ? 0.5 * b.inertia * w * w : 0)
  }
  return k
}
