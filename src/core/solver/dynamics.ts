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
import type { ContactFeature, ContactKin, Pose, Probe, RowJ } from './kinematics'
import { anchorState, computePoses, contactKin, distanceKin, hingeKin, pairFeatures, pairProbes, ropeKin, ropePath } from './kinematics'

/** Tolerances shared by the solver. Lengths in m, velocities in m/s, times in s; force and acceleration
 * tolerances are relative to the scene's force and acceleration scales. */
export const TOL = {
  touch: 1e-8,
  deep: 1e-5,
  ext: 1e-9,
  vel: 1e-7,
  zeno: 1e-5,
  force: 1e-9,
  acc: 1e-9,
  time: 1e-12,
  drift: 1e-12,
  velDrift: 1e-12
}

export interface PairInfo {
  index: number
  key: string
  X: BodyModel
  Y: BodyModel
  features: ContactFeature[]
  probes: Probe[]
  material: Material
}

export type Friction = 'none' | 'stick' | 'slide'

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

export interface Mode { units: UnitMode[]; taut: boolean[] }

export type RowKind = 'hinge' | 'rod' | 'rope' | 'normal' | 'tangent'
export interface Row {
  kind: RowKind
  /** Connector index (hinge/rod/rope) or unit index (normal/tangent). */
  owner: number
  /** Hinge axis (0, 1) or point index in the unit. */
  sub: number
  /** Constraint gradient (acceleration row) and force direction. */
  j: RowJ
  f: RowJ
  c: number
  /** Position-level value (0 for tangent rows) and velocity-level value. */
  value: number
  vel: number
}

export interface UnitState {
  /** Total normal force (N), tangential force on the reference body A along t (N). */
  normal: number
  tangent: number
  /** Relative tangential velocity and its rate. */
  vt: number
  at: number
  refKin: ContactKin
  pointKin: ContactKin[]
  pointLambda: number[]
  openKin: ContactKin[]
}

export interface ModeSolution {
  poses: Pose[]
  rows: Row[]
  lambda: Float64Array
  /** Generalized accelerations (3n). */
  acc: Float64Array
  /** Applied generalized forces (3n). */
  Q: Float64Array
  consistent: boolean
  residual: number
  rank: number
  units: UnitState[]
  ropeTension: number[]
  ropeKin: Array<{ value: number; vel: number; acc: number }>
  /** Ledger rates. */
  rates: Rates
}

export interface Rates {
  heat: number
  appliedWork: number
  damping: number
  beltWork: number
  pairSlide: Map<number, number>
  pairHeat: Map<number, number>
}

export const AUX_HEAT = 0, AUX_WORK = 1, AUX_DAMP = 2, AUX_BELT = 3, AUX_FIXED = 4

export interface System {
  model: Model
  n: number
  pairs: PairInfo[]
  pairByKey: Map<string, PairInfo>
  /** Index of the first auxiliary (ledger) entry in the state vector. */
  auxBase: number
  size: number
}

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
  const size = auxBase + AUX_FIXED + 2 * pairs.length
  const sys: System = { model, n, pairs, pairByKey: new Map(pairs.map(p => [p.key, p])), auxBase, size }
  // Resolve lengths given as "initial" (null in the scene).
  const X0 = initial ?? initialState(sys)
  const poses = computePoses(model, X0)
  for (const r of model.ropes) if (!Number.isFinite(r.length)) r.length = ropePath(poses, r).length
  for (const r of model.rods) if (!Number.isFinite(r.length)) r.length = distanceKin(poses, r.a, r.b).value
  for (const s of model.springs) if (!Number.isFinite(s.restLength)) s.restLength = distanceKin(poses, s.a, s.b).value
  return sys
}

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

// ---------------------------------------------------------------------------------------------- helpers
export function invMassOf(model: Model, i: number): [number, number] {
  const b = model.dynamic[i]
  return [b.invMass, b.invInertia]
}

/** j · M⁻¹ · fᵀ for two rows. */
export function rowMinvRow(model: Model, j: RowJ, f: RowJ): number {
  let s = 0
  const term = (ji: number, jx: number, jy: number, jw: number, fi: number, fx: number, fy: number, fw: number) => {
    if (ji < 0 || ji !== fi) return
    const b = model.dynamic[ji]
    s += b.invMass * (jx * fx + jy * fy) + b.invInertia * jw * fw
  }
  term(j.ai, j.ax, j.ay, j.aw, f.ai, f.ax, f.ay, f.aw)
  term(j.ai, j.ax, j.ay, j.aw, f.bi, f.bx, f.by, f.bw)
  term(j.bi, j.bx, j.by, j.bw, f.ai, f.ax, f.ay, f.aw)
  term(j.bi, j.bx, j.by, j.bw, f.bi, f.bx, f.by, f.bw)
  return s
}

/** j · v for a generalized vector v (3n). */
export function rowDot(j: RowJ, v: Float64Array, offset = 0): number {
  let s = 0
  if (j.ai >= 0) s += j.ax * v[offset + 3 * j.ai] + j.ay * v[offset + 3 * j.ai + 1] + j.aw * v[offset + 3 * j.ai + 2]
  if (j.bi >= 0) s += j.bx * v[offset + 3 * j.bi] + j.by * v[offset + 3 * j.bi + 1] + j.bw * v[offset + 3 * j.bi + 2]
  return s
}

/** out += λ · fᵀ (generalized force of a row). */
export function addRow(out: Float64Array, f: RowJ, lambda: number) {
  if (f.ai >= 0) { out[3 * f.ai] += f.ax * lambda; out[3 * f.ai + 1] += f.ay * lambda; out[3 * f.ai + 2] += f.aw * lambda }
  if (f.bi >= 0) { out[3 * f.bi] += f.bx * lambda; out[3 * f.bi + 1] += f.by * lambda; out[3 * f.bi + 2] += f.bw * lambda }
}

export function combine(a: RowJ, b: RowJ, k: number): RowJ {
  // a + k·b, both rows over the same two bodies (contact rows of one pair)
  const r: RowJ = { ...a }
  const put = (bi: number, x: number, y: number, w: number) => {
    if (bi < 0) return
    if (r.ai === bi) { r.ax += k * x; r.ay += k * y; r.aw += k * w } else if (r.bi === bi) { r.bx += k * x; r.by += k * y; r.bw += k * w } else if (r.ai < 0) { r.ai = bi; r.ax = k * x; r.ay = k * y; r.aw = k * w } else { r.bi = bi; r.bx = k * x; r.by = k * y; r.bw = k * w }
  }
  put(b.ai, b.ax, b.ay, b.aw)
  put(b.bi, b.bx, b.by, b.bw)
  return r
}

/** Applied generalized forces: gravity, constant forces, springs (with damping). */
export function appliedForces(sys: System, poses: Pose[], rates: Rates | null): Float64Array {
  const model = sys.model
  const Q = new Float64Array(3 * sys.n)
  const g = model.settings.gravity
  for (const b of model.dynamic) { Q[3 * b.index] = b.mass * g.x; Q[3 * b.index + 1] = b.mass * g.y }
  for (const f of model.forces) {
    if (!f.a.body || f.a.body.index < 0) continue
    const p = anchorState(poses, f.a)
    const i = f.a.body.index
    Q[3 * i] += f.force.x; Q[3 * i + 1] += f.force.y; Q[3 * i + 2] += p.rx * f.force.y - p.ry * f.force.x
    if (rates) rates.appliedWork += f.force.x * p.vx + f.force.y * p.vy
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

export function newRates(): Rates {
  return { heat: 0, appliedWork: 0, damping: 0, beltWork: 0, pairSlide: new Map(), pairHeat: new Map() }
}

/** Surface speed of the face owner of a feature (conveyors). */
export function beltOf(f: ContactFeature): number { return f.kind === 'pf' ? f.B.body.beltSpeed : 0 }

// ---------------------------------------------------------------------------------------------- solve
export interface UnitKin { refKin: ContactKin; pointKin: ContactKin[]; openKin: ContactKin[] }
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

export function solveMode(sys: System, X: Float64Array, mode: Mode, posesIn?: Pose[]): ModeSolution {
  const model = sys.model
  const n = sys.n
  const poses = posesIn ?? computePoses(model, X)
  const rates = newRates()
  const Q = appliedForces(sys, poses, rates)
  const { rows, unitKin, ropeKins } = buildRows(sys, poses, mode)
  const m = rows.length
  // Unconstrained accelerations a0 = M⁻¹Q.
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
    const res = solveDense(m, A, rhs)
    lambda = res.x; consistent = res.consistent; residual = res.residual; rank = res.rank
  }
  const G = Float64Array.from(Q)
  for (let r = 0; r < m; r++) addRow(G, rows[r].f, lambda[r])
  const acc = new Float64Array(3 * n)
  for (const b of model.dynamic) {
    const i = b.index
    acc[3 * i] = G[3 * i] * b.invMass; acc[3 * i + 1] = G[3 * i + 1] * b.invMass; acc[3 * i + 2] = G[3 * i + 2] * b.invInertia
  }
  // Unit summaries and ledger rates.
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
        rates.pairSlide.set(u.pair.index, (rates.pairSlide.get(u.pair.index) ?? 0) + Math.abs(vt))
        rates.pairHeat.set(u.pair.index, (rates.pairHeat.get(u.pair.index) ?? 0) + heat)
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
  for (const [p, v] of sol.rates.pairSlide) out[base + AUX_FIXED + 2 * p] = v
  for (const [p, v] of sol.rates.pairHeat) out[base + AUX_FIXED + 2 * p + 1] = v
  return sol
}

// ---------------------------------------------------------------------------------------------- energy
export interface EnergyParts { kinetic: number; gravity: number; spring: number; total: number }

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
