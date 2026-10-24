/**
 * Impacts: Newton's restitution law for all touching contacts at once, with Coulomb friction for single
 * contacts.
 *
 * Normal impulses: unknown impulses P ≥ 0 on every touching contact point and every rope at full length,
 * plus free impulses on hinges and rods, change the velocities by Δv = M⁻¹JᵀP. A contact that approached
 * with normal speed vn⁻ < 0 must leave with vn⁺ ≥ −e·vn⁻, any other touching contact with vn⁺ ≥ 0, and an
 * impulse acts only where the bound is reached (complementarity). The active set is found by enumeration in
 * a fixed order. Impacts slower than TOL.zeno are treated as plastic (e = 0) so a bouncing ball comes to
 * rest after finitely many bounces. Ropes jerk inelastically (e = 0). This frictionless solution is
 * always computed first; with μ = 0 it is the result (bit-identical to 26.48).
 *
 * Friction (pair μ > 0): when the frictionless solution has exactly one active unilateral row and it is a
 * frictional contact, the impact is recomputed with Stronge's energetic restitution and Coulomb friction
 * along the impulse path (stickImpact): the normal impulse is the path parameter, slip stops, sticks or
 * reverses exactly where the tangential velocity vanishes, compression ends at vn = 0 and restitution
 * releases e² of the compression work. Hinges and rods stay satisfied (their impulses are eliminated with
 * a Schur complement). Kinetic energy never increases: friction does non-positive work while slipping and
 * none while sticking, and the normal impulse does (1 − e²)·(compression work) ≤ 0 in total.
 * Simultaneous frictional impacts at several points have no comparably safe model; they keep the
 * frictionless impulses (still dissipative) and a warning is recorded when friction would have acted.
 */
import { solveDense } from '../math/linalg'
import type { ContactFeature, Pose, RowJ } from './kinematics'
import { computePoses, distanceKin, hingeKin, ropeKin } from './kinematics'
import type { PairInfo, System } from './dynamics'
import { TOL, addRow, kineticEnergy, rowDot, rowMinvRow } from './dynamics'
import type { ContactKin } from './kinematics'
import { touchingFeatures } from './modes'

/** One contact or rope in an impact, with its velocities (m/s) and impulse (N·s). */
export interface ImpactPoint {
  kind: 'contact' | 'rope'
  pair: PairInfo | null
  feature: ContactFeature | null
  /** Rope index for a rope, −1 for a contact. */
  rope: number
  vnBefore: number
  vnAfter: number
  impulse: number
  restitution: number
  /** Contact point (m) and normal; for a rope, its first anchor and first segment direction. */
  cx: number; cy: number; nx: number; ny: number
  /** Frictional impact: tangential impulse on feature A's body along t = perp(n) (N·s). */
  tangentImpulse?: number
  /** Relative tangential velocity (A against B, along t) before and after (m/s). */
  vtBefore?: number
  vtAfter?: number
  /** How the impact ended along the tangent. */
  friction?: 'slip' | 'stick' | 'reverse'
}

/** Result of an impact: the post-impact state and the points involved. */
export interface ImpactResult {
  X: Float64Array
  points: ImpactPoint[]
  /** Kinetic energy before and after (J). */
  energyBefore: number
  energyAfter: number
  /** Kinetic energy lost (J). */
  loss: number
  /** Set when friction was left out (simultaneous frictional impacts). */
  warning?: string
}

interface IRow { j: RowJ; u: number; target: number; unilateral: boolean; approach: boolean; info: ImpactPoint | null; kin: ContactKin | null }

/** Warning recorded when friction impulses are left out of a multi-point impact. */
export const MULTI_IMPACT_WARNING = '多个接触点同时碰撞时，碰撞冲量未计摩擦（只对单点碰撞计入摩擦冲量）；之后的滑动摩擦照常计算'

/** Whether some touching contact or rope at full length is approaching, so an impact is needed. */
export function approaching(sys: System, X: Float64Array, posesIn?: Pose[]): boolean {
  const poses = posesIn ?? computePoses(sys.model, X)
  for (const t of touchingFeatures(sys, poses)) if (t.kin.vn < -TOL.vel) return true
  for (const r of sys.model.ropes) {
    const k = ropeKin(poses, r)
    if (k.value <= TOL.touch && k.vel < -TOL.vel) return true
  }
  return false
}

/** Resolve the impact at state X; null when nothing approaches. */
export function resolveImpact(sys: System, X: Float64Array): ImpactResult | null {
  const model = sys.model
  const n = sys.n
  const poses = computePoses(model, X)
  const rows: IRow[] = []
  model.hinges.forEach(h => {
    for (const k of hingeKin(poses, h.a, h.b)) rows.push({ j: k.j, u: k.vel, target: 0, unilateral: false, approach: false, info: null, kin: null })
  })
  model.rods.forEach(r => {
    const k = distanceKin(poses, r.a, r.b)
    rows.push({ j: k.j, u: k.vel, target: 0, unilateral: false, approach: false, info: null, kin: null })
  })
  let any = false
  for (const t of touchingFeatures(sys, poses)) {
    const u = t.kin.vn
    const approach = u < -TOL.vel
    if (approach) any = true
    const e = approach && -u >= TOL.zeno ? t.pair.material.restitution : 0
    rows.push({
      j: t.kin.jn, u, target: approach ? -e * u : 0, unilateral: true, approach,
      info: { kind: 'contact', pair: t.pair, feature: t.feature, rope: -1, vnBefore: u, vnAfter: u, impulse: 0, restitution: e, cx: t.kin.cx, cy: t.kin.cy, nx: t.kin.nx, ny: t.kin.ny },
      kin: t.kin
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
      info: { kind: 'rope', pair: null, feature: null, rope: k, vnBefore: rk.vel, vnAfter: rk.vel, impulse: 0, restitution: 0, cx: pa.x, cy: pa.y, nx: rk.path.u1.x, ny: rk.path.u1.y },
      kin: null
    })
  })
  if (!any) return null
  const m = rows.length
  const W = new Float64Array(m * m)
  for (let r = 0; r < m; r++) for (let k = 0; k < m; k++) W[r * m + k] = rowMinvRow(model, rows[r].j, rows[k].j)
  const uni = rows.map((r, i) => (r.unilateral ? i : -1)).filter(i => i >= 0)
  // Option order per unilateral row: approaching rows active first, others inactive first
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
  const friction = frictionPass(sys, X, rows, P, W)
  if (friction && friction !== 'fallback') return friction
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
  let frictionWouldAct = friction === 'fallback'
  rows.forEach((r, i) => {
    if (!r.info) return
    r.info.impulse = P[i]
    r.info.vnAfter = rowDot(r.j, Y, 3 * n)
    if (r.approach || P[i] > 0) points.push(r.info)
    if (P[i] > 0 && r.kin && r.info.pair && (r.info.pair.material.muK > 0 || r.info.pair.material.muS > 0)) {
      const belt = r.kin.vt - rowDot(r.kin.jt, X, 3 * n)
      if (Math.max(Math.abs(r.kin.vt), Math.abs(rowDot(r.kin.jt, Y, 3 * n) + belt)) > TOL.vel) frictionWouldAct = true
    }
  })
  const out: ImpactResult = { X: Y, points, energyBefore: before, energyAfter: after, loss: before - after }
  if (frictionWouldAct) out.warning = MULTI_IMPACT_WARNING
  return out
}

// ---- Friction ----
/** Outcome of the frictional impact along the impulse path. */
export interface StrongeResult {
  /** Normal impulse along the contact's normal row (N·s). */
  Pn: number
  /** Tangential impulse along the tangent row (N·s). */
  Pt: number
  /** Final relative normal and tangential velocity (m/s). */
  vn: number
  vt: number
  /** How the tangential motion ended. */
  end: 'slip' | 'stick' | 'reverse'
}

/**
 * Stronge's energetic impact with Coulomb friction for one contact. With the 2×2 inverse effective mass
 * W (rows n, t; W is symmetric positive definite) the relative velocity is linear in the impulse,
 * v = v⁻ + W·P. The normal impulse Pn parametrizes the path; while slipping in direction s the tangential
 * impulse grows as dPt = −μk·s·dPn, while sticking as dPt = −(Wtn/Wtt)·dPn (possible when
 * |Wtn| ≤ μs·Wtt). Phases are linear in Pn, so every crossing (vt = 0, vn = 0) and the final normal work
 * are found exactly (closed form). Returns null on non-finite input.
 */
export function strongeImpact(vn0: number, vt0: number, Wnn: number, Wnt: number, Wtt: number, e: number, muK: number, muS: number): StrongeResult | null {
  if (![vn0, vt0, Wnn, Wnt, Wtt, e, muK, muS].every(Number.isFinite) || !(Wnn > 0) || !(Wtt > 0)) return null
  const stickable = Math.abs(Wnt) <= muS * Wtt
  const afterZero = (): number => (stickable ? 0 : Wnt > 0 ? 1 : -1)
  let s = Math.abs(vt0) > TOL.vel ? (vt0 > 0 ? 1 : -1) : afterZero()
  const s0 = s
  let Pn = 0, Pt = 0, vn = vn0, vt = vt0, work = 0
  let compressing = vn < 0
  let need = 0
  if (!compressing) return { Pn: 0, Pt: 0, vn, vt, end: s === 0 ? 'stick' : 'slip' }
  for (let phase = 0; phase < 8; phase++) {
    const slope = s === 0 ? -Wnt / Wtt : -muK * s
    const kap = Wnn + Wnt * slope
    const rho = s === 0 ? 0 : Wnt + Wtt * slope
    const go = (d: number) => {
      work += vn * d + 0.5 * kap * d * d
      Pn += d; Pt += slope * d; vn += kap * d; vt += rho * d
    }
    let dTrans = s !== 0 && s * rho < 0 ? -vt / rho : Infinity
    if (s === 0 && !(kap > 1e-9 * Wnn)) {
      // Jam: W is (nearly) singular (one degree of freedom, e.g. a hinged body), so sticking also stops the
      // normal motion; the impact ends here (vn ≈ 0 up to rounding) without restitution
      if (compressing && vn < -1e-9 * (Math.abs(vn0) + Math.abs(vt0))) return null
      compressing = false
      need = 0
      vn = Math.max(vn, 0)
      break
    }
    if (compressing) {
      const dC = kap > 0 ? -vn / kap : Infinity
      if (!(dC <= dTrans)) {
        if (!Number.isFinite(dTrans)) return null
        go(dTrans); vt = 0; s = afterZero()
        continue
      }
      go(dC); vn = 0
      compressing = false
      need = -e * e * work
      dTrans -= dC
      if (!(need > 0)) break
    }
    // Restitution: deliver the normal work `need` (vn ≥ 0, kap > 0 in every phase that can follow compression)
    const disc = vn * vn + 2 * kap * need
    const dR = disc >= 0 ? 2 * need / (vn + Math.sqrt(disc)) : Infinity
    if (dR <= dTrans) { go(dR); need = 0; break }
    if (!Number.isFinite(dTrans)) return null
    const before = work
    go(dTrans); vt = 0
    need -= work - before
    s = afterZero()
  }
  if (compressing || need > 1e-12 * Math.abs(work)) return null
  // The impulse cannot exceed what stops the approach many times over (guards nearly singular W)
  if (!(Pn <= 1e6 * (1 + e) * Math.abs(vn0) / Wnn)) return null
  const end = s === 0 ? 'stick' : s === s0 ? 'slip' : 'reverse'
  return { Pn, Pt, vn, vt, end }
}

/**
 * The frictional single-contact impact, or null when it does not apply (no friction, several active
 * points), or 'fallback' when it applies but its result is not admissible (another contact would be
 * pushed into penetration, or the path could not be followed): the frictionless result is used then.
 */
function frictionPass(sys: System, X: Float64Array, rows: IRow[], P: Float64Array, W: Float64Array): ImpactResult | 'fallback' | null {
  const model = sys.model, n = sys.n
  const m = rows.length
  const active: number[] = []
  for (let i = 0; i < m; i++) if (rows[i].unilateral && P[i] > 0) active.push(i)
  if (active.length !== 1) return null
  const ri = active[0]
  const row = rows[ri], kin = row.kin, info = row.info
  if (!kin || !info || !info.pair || !row.approach) return null
  const mat = info.pair.material
  if (!(mat.muK > 0 || mat.muS > 0)) return null
  const muK = mat.muK, muS = Math.max(mat.muS, mat.muK)
  // Bilateral rows (hinges, rods) stay satisfied: eliminate their impulses
  const bil: number[] = []
  for (let i = 0; i < m; i++) if (!rows[i].unilateral) bil.push(i)
  const nb = bil.length
  const Wbb = new Float64Array(nb * nb)
  bil.forEach((a, x) => bil.forEach((b, y) => { Wbb[x * nb + y] = W[a * m + b] }))
  /** Velocity change M⁻¹(dᵀ·1 + Bᵀλ) of a unit impulse along row d with the bilateral rows kept. */
  const response = (d: RowJ | null, extraRhs: Float64Array | null): Float64Array => {
    const G = new Float64Array(3 * n)
    if (d) addRow(G, d, 1)
    if (nb > 0) {
      const rhs = new Float64Array(nb)
      for (let x = 0; x < nb; x++) rhs[x] = (d ? -rowMinvRow(model, rows[bil[x]].j, d) : 0) + (extraRhs ? extraRhs[x] : 0)
      const lam = solveDense(nb, Wbb, rhs).x
      for (let x = 0; x < nb; x++) addRow(G, rows[bil[x]].j, lam[x])
    }
    for (const b of model.dynamic) {
      const i = b.index
      G[3 * i] *= b.invMass; G[3 * i + 1] *= b.invMass; G[3 * i + 2] *= b.invInertia
    }
    return G
  }
  const v = Float64Array.from(X.subarray(3 * n, 6 * n))
  if (nb > 0) {
    const rhs = new Float64Array(nb)
    for (let x = 0; x < nb; x++) rhs[x] = -rowDot(rows[bil[x]].j, v)
    const d0 = response(null, rhs)
    for (let k = 0; k < 3 * n; k++) v[k] += d0[k]
  }
  const dn = response(kin.jn, null), dtv = response(kin.jt, null)
  const Wnn = rowDot(kin.jn, dn), Wnt = rowDot(kin.jn, dtv), Wtn = rowDot(kin.jt, dn), Wtt = rowDot(kin.jt, dtv)
  const belt = kin.vt - rowDot(kin.jt, X, 3 * n)
  const vn0 = rowDot(kin.jn, v), vt0 = rowDot(kin.jt, v) + belt
  const res = strongeImpact(vn0, vt0, Wnn, 0.5 * (Wnt + Wtn), Wtt, info.restitution, muK, muS)
  if (!res) return 'fallback'
  for (let k = 0; k < 3 * n; k++) v[k] += res.Pn * dn[k] + res.Pt * dtv[k]
  const Y = Float64Array.from(X)
  for (let k = 0; k < 3 * n; k++) Y[3 * n + k] = v[k]
  // Neither this contact nor the other touching contacts and ropes may be driven into each other
  if (rowDot(kin.jn, Y, 3 * n) < -TOL.vel) return 'fallback'
  for (let i = 0; i < m; i++) {
    if (i === ri || !rows[i].unilateral) continue
    if (rowDot(rows[i].j, Y, 3 * n) < rows[i].target - TOL.vel) return 'fallback'
  }
  const before = kineticEnergy(sys, X), after = kineticEnergy(sys, Y)
  // Safety net: friction never adds energy (a conveyor belt may, through −u·Pt)
  if (!(after <= before - belt * res.Pt + 1e-12 * Math.max(1, before))) return 'fallback'
  info.impulse = res.Pn
  info.vnAfter = rowDot(kin.jn, Y, 3 * n)
  info.tangentImpulse = res.Pt
  info.vtBefore = vt0
  info.vtAfter = rowDot(kin.jt, Y, 3 * n) + belt
  info.friction = res.end
  return { X: Y, points: [info], energyBefore: before, energyAfter: after, loss: before - after }
}

function advance(digits: number[]): boolean {
  let k = digits.length - 1
  while (k >= 0) { digits[k]++; if (digits[k] < 2) return true; digits[k] = 0; k-- }
  return false
}
