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
import type { Material } from '../scene/types'
import { solveDense } from '../math/linalg'
import type { BodyModel, Model } from './model'
import { pairKey, pairMaterial } from './model'
import { ENV_SIZE, ForceExprError, branchOf, fillEnv } from './forceExpr'
import { msg } from '../../i18n/message'
import type { ContactFeature, ContactKin, Pose, Probe, RowJ, RowTerm } from './kinematics'
import { anchorState, computePoses, contactKin, distanceKin, hingeKin, pairFeatures, pairProbes, ropeKin, ropePath } from './kinematics'

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
}

/**
 * Contact and connector mode. `taut[k]`: rope k is taut. `sw` holds the frozen branch (+1, −1, or 0 for sign
 * at zero) of every switch of the variable forces (model.switches); absent or empty when the scene has none.
 */
export interface Mode { units: UnitMode[]; taut: boolean[]; sw?: number[] }

/** Kind of a constraint row. */
export type RowKind = 'hinge' | 'rod' | 'rope' | 'normal' | 'tangent'
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
}

/** Energy ledger rates (W). */
export interface Rates {
  /** Friction heat. */
  heat: number
  /** Power of the applied forces. */
  appliedWork: number
  /** Spring damping dissipation. */
  damping: number
  /** Power delivered by conveyor belts. */
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
  const s = sw && sw.length === model.switches.length ? sw : null
  const fx = f.expr.x.fn(envScratch, s), fy = f.expr.y.fn(envScratch, s)
  if (!Number.isFinite(fx) || !Number.isFinite(fy)) {
    const t = sys.timeSlot >= 0 ? X[sys.timeSlot] : 0
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
    const mag = -s.stiffness * (L - s.restLength) - s.damping * vrel
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

// ---- Solve ----
/** Kinematics of a unit's reference, closed and open points. */
export interface UnitKin { refKin: ContactKin; pointKin: ContactKin[]; openKin: ContactKin[] }
/** Rows of a mode with the kinematics they were built from. */
export interface ModeRows { rows: Row[]; unitKin: UnitKin[]; ropeKins: ReturnType<typeof ropeKin>[] }

/** The active constraint rows of a mode at given poses. */
export function buildRows(sys: System, poses: Pose[], mode: Mode): ModeRows {
  const model = sys.model
  const rows: Row[] = []
  model.hinges.forEach((h, k) => {
    const [rx, ry] = hingeKin(poses, h.a, h.b)
    rows.push({ kind: 'hinge', owner: k, sub: 0, j: rx.j, f: rx.j, c: rx.c, value: rx.value, vel: rx.vel })
    rows.push({ kind: 'hinge', owner: k, sub: 1, j: ry.j, f: ry.j, c: ry.c, value: ry.value, vel: ry.vel })
  })
  model.rods.forEach((r, k) => {
    const d = distanceKin(poses, r.a, r.b)
    rows.push({ kind: 'rod', owner: k, sub: 0, j: d.j, f: d.j, c: d.c, value: d.value - r.length, vel: d.vel })
  })
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
    pointKin.forEach((k, pi) => {
      const f = u.friction === 'slide' ? combine(k.jn, refKin.jt, -muK * u.s) : k.jn
      rows.push({ kind: 'normal', owner: ui, sub: pi, j: k.jn, f, c: k.cn, value: k.gap, vel: k.vn })
    })
    if (u.friction === 'stick' && u.points.length > 0) {
      rows.push({ kind: 'tangent', owner: ui, sub: 0, j: refKin.jt, f: refKin.jt, c: refKin.ct, value: 0, vel: refKin.vt })
    }
    return { refKin, pointKin, openKin }
  })
  return { rows, unitKin, ropeKins }
}

/** Solve the dynamics of a mode at state X: accelerations, constraint forces and ledger rates. */
export function solveMode(sys: System, X: Float64Array, mode: Mode, posesIn?: Pose[]): ModeSolution {
  const model = sys.model
  const n = sys.n
  const poses = posesIn ?? computePoses(model, X)
  const rates = newRates(sys.pairs.length)
  const Q = appliedForces(sys, poses, rates, X, mode.sw ?? null)
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
    const res = solveDense(m, A, rhs, 1e-12, true)
    lambda = res.x; consistent = res.consistent; residual = res.residual; rank = res.rank
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
    const { refKin, pointKin, openKin } = unitKin[ui]
    const pointLambda: number[] = []
    let normal = 0, tangent = 0
    for (let r = 0; r < m; r++) {
      const row = rows[r]
      if (row.owner !== ui) continue
      if (row.kind === 'normal') { pointLambda.push(lambda[r]); normal += lambda[r] } else if (row.kind === 'tangent') tangent = lambda[r]
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
    return { normal, tangent, vt, at, refKin, pointKin, pointLambda, openKin }
  })
  const ropeTension = model.ropes.map((_, k) => {
    for (let r = 0; r < m; r++) if (rows[r].kind === 'rope' && rows[r].owner === k) return lambda[r]
    return 0
  })
  const ropeKinOut = ropeKins.map(rk => ({ value: rk.value, vel: rk.vel, acc: rowDot(rk.j, acc) + rk.c }))
  return { poses, rows, lambda, acc, Q, consistent, residual, rank, units, ropeTension, ropeKin: ropeKinOut, rates }
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
export interface EnergyParts { kinetic: number; gravity: number; spring: number; total: number }

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
    const pa = anchorState(poses, s.a), pb = anchorState(poses, s.b)
    const dx = pa.px - pb.px, dy = pa.py - pb.py
    const e = Math.sqrt(dx * dx + dy * dy) - s.restLength
    spring += 0.5 * s.stiffness * e * e
  }
  return { kinetic, gravity, spring, total: kinetic + gravity + spring }
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
