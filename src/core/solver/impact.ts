/**
 * Impacts: Newton's restitution law for all touching contacts at once (frictionless impulses).
 *
 * Unknown impulses P ≥ 0 on every touching contact point and every rope at full length, plus free impulses
 * on hinges and rods, change the velocities by Δv = M⁻¹JᵀP. A contact that approached with normal speed
 * vn⁻ < 0 must leave with vn⁺ ≥ −e·vn⁻, any other touching contact with vn⁺ ≥ 0, and an impulse acts only
 * where the bound is reached (complementarity). The active set is found by enumeration in a fixed order.
 * Impacts slower than TOL.zeno are treated as plastic (e = 0) so a bouncing ball comes to rest after
 * finitely many bounces. Ropes jerk inelastically (e = 0).
 */
import { solveDense } from '../math/linalg'
import type { ContactFeature, Pose, RowJ } from './kinematics'
import { computePoses, distanceKin, hingeKin, ropeKin } from './kinematics'
import type { PairInfo, System } from './dynamics'
import { TOL, addRow, kineticEnergy, rowDot, rowMinvRow } from './dynamics'
import { touchingFeatures } from './modes'

export interface ImpactPoint {
  kind: 'contact' | 'rope'
  pair: PairInfo | null
  feature: ContactFeature | null
  rope: number
  vnBefore: number
  vnAfter: number
  impulse: number
  restitution: number
  cx: number; cy: number; nx: number; ny: number
}

export interface ImpactResult {
  X: Float64Array
  points: ImpactPoint[]
  energyBefore: number
  energyAfter: number
  /** Kinetic energy lost (J). */
  loss: number
}

interface IRow { j: RowJ; u: number; target: number; unilateral: boolean; approach: boolean; info: ImpactPoint | null }

export function approaching(sys: System, X: Float64Array, posesIn?: Pose[]): boolean {
  const poses = posesIn ?? computePoses(sys.model, X)
  for (const t of touchingFeatures(sys, poses)) if (t.kin.vn < -TOL.vel) return true
  for (const r of sys.model.ropes) {
    const k = ropeKin(poses, r)
    if (k.value <= TOL.touch && k.vel < -TOL.vel) return true
  }
  return false
}

export function resolveImpact(sys: System, X: Float64Array): ImpactResult | null {
  const model = sys.model
  const n = sys.n
  const poses = computePoses(model, X)
  const rows: IRow[] = []
  model.hinges.forEach(h => {
    for (const k of hingeKin(poses, h.a, h.b)) rows.push({ j: k.j, u: k.vel, target: 0, unilateral: false, approach: false, info: null })
  })
  model.rods.forEach(r => {
    const k = distanceKin(poses, r.a, r.b)
    rows.push({ j: k.j, u: k.vel, target: 0, unilateral: false, approach: false, info: null })
  })
  let any = false
  for (const t of touchingFeatures(sys, poses)) {
    const u = t.kin.vn
    const approach = u < -TOL.vel
    if (approach) any = true
    const e = approach && -u >= TOL.zeno ? t.pair.material.restitution : 0
    rows.push({
      j: t.kin.jn, u, target: approach ? -e * u : 0, unilateral: true, approach,
      info: { kind: 'contact', pair: t.pair, feature: t.feature, rope: -1, vnBefore: u, vnAfter: u, impulse: 0, restitution: e, cx: t.kin.cx, cy: t.kin.cy, nx: t.kin.nx, ny: t.kin.ny }
    })
  }
  model.ropes.forEach((r, k) => {
    const rk = ropeKin(poses, r)
    if (rk.value > TOL.touch) return
    const approach = rk.vel < -TOL.vel
    if (approach) any = true
    const pa = rk.path.points[0]
    rows.push({
      j: rk.j, u: rk.vel, target: 0, unilateral: true, approach,
      info: { kind: 'rope', pair: null, feature: null, rope: k, vnBefore: rk.vel, vnAfter: rk.vel, impulse: 0, restitution: 0, cx: pa.x, cy: pa.y, nx: rk.path.u1.x, ny: rk.path.u1.y }
    })
  })
  if (!any) return null
  const m = rows.length
  const W = new Float64Array(m * m)
  for (let r = 0; r < m; r++) for (let k = 0; k < m; k++) W[r * m + k] = rowMinvRow(model, rows[r].j, rows[k].j)
  const uni = rows.map((r, i) => (r.unilateral ? i : -1)).filter(i => i >= 0)
  // option order per unilateral row: approaching rows active first, others inactive first
  const digits = uni.map(() => 0)
  let bestP: Float64Array | null = null, bestViolation = Infinity
  const scaleP = (() => { let s = 0; for (const r of rows) for (const b of model.dynamic) s = Math.max(s, b.mass * Math.abs(r.u)); return Math.max(s, 1e-12) })()
  for (let tries = 0; tries < 1 << Math.min(uni.length, 14); tries++) {
    const active = rows.map(r => !r.unilateral)
    uni.forEach((ri, k) => { const preferActive = rows[ri].approach; active[ri] = digits[k] === 0 ? preferActive : !preferActive })
    const idx = rows.map((_, i) => i).filter(i => active[i])
    const P = new Float64Array(m)
    if (idx.length > 0) {
      const q = idx.length
      const A = new Float64Array(q * q), b = new Float64Array(q)
      idx.forEach((ri, a) => {
        idx.forEach((rk, c) => { A[a * q + c] = W[ri * m + rk] })
        b[a] = rows[ri].target - rows[ri].u
      })
      const sol = solveDense(q, A, b)
      idx.forEach((ri, a) => { P[ri] = sol.x[a] })
      if (!sol.consistent) { advance(digits); continue }
    }
    let violation = 0
    for (const ri of uni) {
      if (active[ri]) { if (P[ri] < -1e-12 * scaleP) violation += -P[ri] / scaleP }
      else {
        let v = rows[ri].u
        for (let k = 0; k < m; k++) v += W[ri * m + k] * P[k]
        if (v < rows[ri].target - TOL.vel) violation += (rows[ri].target - v)
      }
    }
    if (violation < bestViolation) { bestViolation = violation; bestP = P }
    if (violation === 0) break
    if (!advance(digits)) break
  }
  const P = bestP ?? new Float64Array(m)
  const before = kineticEnergy(sys, X)
  const dv = new Float64Array(3 * n)
  rows.forEach((r, i) => { if (P[i] !== 0) addRow(dv, r.j, P[i]) })
  const Y = Float64Array.from(X)
  for (const b of model.dynamic) {
    const i = b.index
    Y[3 * n + 3 * i] += dv[3 * i] * b.invMass
    Y[3 * n + 3 * i + 1] += dv[3 * i + 1] * b.invMass
    Y[3 * n + 3 * i + 2] += dv[3 * i + 2] * b.invInertia
  }
  const after = kineticEnergy(sys, Y)
  const points: ImpactPoint[] = []
  rows.forEach((r, i) => {
    if (!r.info) return
    r.info.impulse = P[i]
    r.info.vnAfter = rowDot(r.j, Y, 3 * n)
    if (r.approach || P[i] > 0) points.push(r.info)
  })
  return { X: Y, points, energyBefore: before, energyAfter: after, loss: before - after }
}

function advance(digits: number[]): boolean {
  let k = digits.length - 1
  while (k >= 0) { digits[k]++; if (digits[k] < 2) return true; digits[k] = 0; k-- }
  return false
}
