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
 * Simultaneous frictional impacts at several points (26.51, D37, multiFriction): Newton's law on the normal
 * rows with Coulomb friction on the post-impact tangential velocities, solved as a linear complementarity
 * problem by enumerating normal active sets and tangential states (stick, slip either way) in a fixed order;
 * the first combination that satisfies every condition and does not increase the kinetic energy is taken.
 * When none does (or there are more than MULTI_FRICTION_POINTS frictional points), the frictionless
 * impulses are kept (still dissipative) and a warning is recorded.
 */
import type { Message } from '../../i18n/message'
import { msg } from '../../i18n/message'
import { solveDense } from '../math/linalg'
import type { ContactFeature, Pose, RowJ } from './kinematics'
import { anchorState, computePoses, equalityKins, ropeKin, sliderAxisKin } from './kinematics'
import type { PairInfo, System } from './dynamics'
import { TOL, addRow, kineticEnergy, limitRow, rowDot, rowMinvRow } from './dynamics'
import type { ContactKin } from './kinematics'
import { touchingFeatures } from './modes'

/** One contact, rope or slider end stop in an impact, with its velocities (m/s) and impulse (N·s). */
export interface ImpactPoint {
  kind: 'contact' | 'rope' | 'limit'
  pair: PairInfo | null
  feature: ContactFeature | null
  /** Rope index for a rope, slider index for an end stop (26.52), −1 for a contact. */
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
  warning?: Message
}

interface IRow { j: RowJ; u: number; target: number; unilateral: boolean; approach: boolean; info: ImpactPoint | null; kin: ContactKin | null }

/** Warning recorded when friction impulses are left out of a multi-point impact. */
export const MULTI_IMPACT_WARNING: Message = msg('warn.multiImpactFriction')

/** Whether some touching contact or rope at full length is approaching, so an impact is needed. */
export function approaching(sys: System, X: Float64Array, posesIn?: Pose[]): boolean {
  const poses = posesIn ?? computePoses(sys.model, X)
  for (const t of touchingFeatures(sys, poses)) if (t.kin.vn < -TOL.vel) return true
  for (const r of sys.model.ropes) {
    const k = ropeKin(poses, r)
    if (k.value <= TOL.touch && k.vel < -TOL.vel) return true
  }
  // 26.52: a slider moving into an end stop
  if (sys.model.hasLimits) {
    for (const st of stopRows(sys, poses)) if (st.row.vel < -TOL.vel) return true
  }
  return false
}

/** End-stop rows of sliders at a stop (gap ≤ TOL.touch), in slider order, lower before upper (26.52). */
function stopRows(sys: System, poses: Pose[]) {
  const out: Array<{ k: number; row: ReturnType<typeof limitRow> }> = []
  sys.model.sliders.forEach((sl, k) => {
    if (!sl.limited) return
    const kin = sliderAxisKin(poses, sl)
    if (kin.value - sl.lo <= TOL.touch) out.push({ k, row: limitRow(sl, k, -1, kin) })
    else if (sl.hi - kin.value <= TOL.touch) out.push({ k, row: limitRow(sl, k, 1, kin) })
  })
  return out
}

/** Warning recorded when Newton's law at several points at once would add energy and the impact is made plastic. */
export const MULTI_IMPACT_PLASTIC_WARNING: Message = msg('warn.multiImpactPlastic')

/**
 * Resolve the impact at state X; null when nothing approaches. Newton's law applied at several points at once
 * can add kinetic energy (simultaneous restitution is not energetically consistent in general); when the
 * frictionless result of a multi-point impact would, the impact is solved again as plastic (e = 0 at every
 * point), which never adds energy, and a warning is recorded (26.51, D37).
 */
export function resolveImpact(sys: System, X: Float64Array): ImpactResult | null {
  const poses = computePoses(sys.model, X)
  const rows = impactRows(sys, poses, false)
  if (!rows) return null
  const res = solveImpact(sys, X, rows)
  if (res.frictionless && res.active >= 2 && res.result.energyAfter > res.result.energyBefore + 1e-12 * Math.max(1, res.result.energyBefore)) {
    const plastic = solveImpact(sys, X, impactRows(sys, poses, true)!)
    plastic.result.warning = MULTI_IMPACT_PLASTIC_WARNING
    return plastic.result
  }
  return res.result
}

/** The rows of an impact (equality rows, touching contacts, ropes at full length); null when nothing approaches. */
function impactRows(sys: System, poses: Pose[], plastic: boolean): IRow[] | null {
  const model = sys.model
  const rows: IRow[] = []
  // Equality constraints (hinges, rods and the connectors of 26.51) stay satisfied at velocity level; the drive of a
  // torque-limited motor (26.52) cannot deliver an impulse and takes no part
  for (const e of equalityKins(model, poses)) {
    if (e.kind === 'drive' && model.motors[e.owner].limited) continue
    rows.push({ j: e.kin.j, u: e.kin.vel, target: 0, unilateral: false, approach: false, info: null, kin: null })
  }
  let any = false
  for (const t of touchingFeatures(sys, poses)) {
    const u = t.kin.vn
    const approach = u < -TOL.vel
    if (approach) any = true
    const e = approach && -u >= TOL.zeno && !plastic ? t.pair.material.restitution : 0
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
  // 26.52 (D58): slider end stops, Newton's law with the stop's restitution
  if (model.hasLimits) {
    for (const { k, row } of stopRows(sys, poses)) {
      const sl = model.sliders[k]
      const u = row.vel
      const approach = u < -TOL.vel
      if (approach) any = true
      const e = approach && -u >= TOL.zeno && !plastic ? sl.e : 0
      const pb = anchorState(poses, sl.b)
      const A = sl.a.body && sl.a.body.index >= 0 ? poses[sl.a.body.global] : null
      const ax = A ? A.c * sl.axis.x - A.s * sl.axis.y : sl.axis.x, ay = A ? A.s * sl.axis.x + A.c * sl.axis.y : sl.axis.y
      const sg = row.sub === 0 ? 1 : -1
      rows.push({
        j: row.j, u, target: approach ? -e * u : 0, unilateral: true, approach,
        info: { kind: 'limit', pair: null, feature: null, rope: k, vnBefore: u, vnAfter: u, impulse: 0, restitution: e, cx: pb.px, cy: pb.py, nx: sg * ax, ny: sg * ay },
        kin: null
      })
    }
  }
  return any ? rows : null
}

/**
 * Solve an impact: the frictionless impulses, then friction (one point: Stronge; several: multiFriction).
 * `frictionless`: the result keeps the frictionless impulses; `active`: active unilateral rows of that pass.
 */
function solveImpact(sys: System, X: Float64Array, rows: IRow[]): { result: ImpactResult; frictionless: boolean; active: number } {
  const model = sys.model
  const n = sys.n
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
  let active = 0
  for (const ri of uni) if (P[ri] > 0) active++
  if (friction && friction !== 'fallback') return { result: friction, frictionless: false, active }
  if (friction === null && frictionActs(sys, X, rows, P)) {
    const multi = multiFriction(sys, X, rows)
    if (multi) return { result: multi, frictionless: false, active }
  }
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
  return { result: out, frictionless: true, active }
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

/**
 * Whether the frictionless impulses P leave several unilateral rows active and friction would act on one of
 * them (a frictional contact with an impulse whose tangential velocity before or after is not zero).
 */
function frictionActs(sys: System, X: Float64Array, rows: IRow[], P: Float64Array): boolean {
  const model = sys.model, n = sys.n
  let active = 0
  for (let i = 0; i < rows.length; i++) if (rows[i].unilateral && P[i] > 0) active++
  if (active < 2) return false
  const dv = new Float64Array(3 * n)
  rows.forEach((r, i) => { if (P[i] !== 0) addRow(dv, r.j, P[i]) })
  const Y = Float64Array.from(X)
  for (const b of model.dynamic) {
    const i = b.index
    Y[3 * n + 3 * i] += dv[3 * i] * b.invMass
    Y[3 * n + 3 * i + 1] += dv[3 * i + 1] * b.invMass
    Y[3 * n + 3 * i + 2] += dv[3 * i + 2] * b.invInertia
  }
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (!(P[i] > 0) || !r.kin || !r.info?.pair) continue
    const mat = r.info.pair.material
    if (!(mat.muK > 0 || mat.muS > 0)) continue
    const belt = r.kin.vt - rowDot(r.kin.jt, X, 3 * n)
    if (Math.max(Math.abs(r.kin.vt), Math.abs(rowDot(r.kin.jt, Y, 3 * n) + belt)) > TOL.vel) return true
  }
  return false
}

/** Most frictional contact points of a simultaneous frictional impact (D37). */
export const MULTI_FRICTION_POINTS = 8
/** Most combinations tried by one enumeration of multiFriction (3⁸). */
export const MULTI_FRICTION_TRIES = 6561

/** The rows of a multi-point frictional impact: the impact rows, then the tangent rows of the frictional contacts. */
interface FrictionRows {
  ext: RowJ[]
  /** Velocity of each extended row before the impact (tangent rows without the belt speed). */
  extU: Float64Array
  /** W = J·M⁻¹·Jᵀ of the extended rows (me × me). */
  W: Float64Array
  /** Index of the tangent row of each impact row (−1: frictionless or not a contact). */
  tan: Int32Array
  belt: Float64Array; muK: Float64Array; muS: Float64Array
  /** Direction of slip before the impact (sign of vt⁻, +1 when zero). */
  dir: Float64Array
  scaleP: number
}

/** A combination that passed the checks: impulses on the extended rows, the state after, and the tangential states. */
interface FrictionSolution { P: Float64Array; Y: Float64Array; after: number; fr: number[]; states: number[] }

function frictionRows(sys: System, X: Float64Array, rows: IRow[]): FrictionRows | null {
  const model = sys.model, n = sys.n
  const m = rows.length
  const ext: RowJ[] = rows.map(r => r.j)
  const u: number[] = rows.map(r => r.u)
  const tan = new Int32Array(m).fill(-1)
  const belt = new Float64Array(m), muK = new Float64Array(m), muS = new Float64Array(m), dir = new Float64Array(m)
  let frictional = 0
  for (let i = 0; i < m; i++) {
    const r = rows[i]
    if (!r.unilateral || !r.kin || !r.info?.pair) continue
    const mat = r.info.pair.material
    if (!(mat.muK > 0 || mat.muS > 0)) continue
    frictional++
    tan[i] = ext.length
    const ut = rowDot(r.kin.jt, X, 3 * n)
    ext.push(r.kin.jt)
    u.push(ut)
    belt[i] = r.kin.vt - ut
    muK[i] = mat.muK
    muS[i] = Math.max(mat.muS, mat.muK)
    dir[i] = r.kin.vt < 0 ? -1 : 1
  }
  if (frictional === 0 || frictional > MULTI_FRICTION_POINTS) return null
  const me = ext.length
  const W = new Float64Array(me * me)
  for (let r = 0; r < me; r++) for (let k = 0; k < me; k++) W[r * me + k] = rowMinvRow(model, ext[r], ext[k])
  let sc = 0
  for (const v of u) for (const bd of model.dynamic) sc = Math.max(sc, bd.mass * Math.abs(v))
  return { ext, extU: Float64Array.from(u), W, tan, belt, muK, muS, dir, scaleP: Math.max(sc, 1e-12) }
}

/** State after impulses P on the extended rows. */
function applyExt(sys: System, X: Float64Array, ext: RowJ[], P: Float64Array): Float64Array {
  const model = sys.model, n = sys.n
  const dv = new Float64Array(3 * n)
  for (let k = 0; k < ext.length; k++) if (P[k] !== 0) addRow(dv, ext[k], P[k])
  const Y = Float64Array.from(X)
  for (const bd of model.dynamic) {
    const i = bd.index
    Y[3 * n + 3 * i] += dv[3 * i] * bd.invMass
    Y[3 * n + 3 * i + 1] += dv[3 * i + 1] * bd.invMass
    Y[3 * n + 3 * i + 2] += dv[3 * i + 2] * bd.invInertia
  }
  return Y
}

/** Work of the conveyor belts through the tangential impulses (J): −Σ u_belt·Pt. */
function beltWorkOf(fx: FrictionRows, fr: number[], P: Float64Array): number {
  let w = 0
  for (const i of fr) w -= fx.belt[i] * P[fx.tan[i]]
  return w
}

/**
 * Simultaneous frictional impact at several points (D37). Three models are tried in turn:
 *   1. Newton: unknowns are impulses on the equality rows, normal impulses Pn ≥ 0 on the active unilateral rows
 *      and, on every active frictional contact, the tangential impulse Pt — free while sticking (tangential
 *      velocity after the impact vt⁺ = 0, |Pt| ≤ μs·Pn), −μk·s·Pn while slipping in direction s (s·vt⁺ ≥ 0).
 *      Equality rows keep zero velocity, active normal rows reach their Newton target −e·vn⁻ (0 for rows that
 *      were not approaching), sticking contacts reach vt⁺ = 0, inactive rows end at or above their target.
 *      Normal active sets are enumerated in the order of the frictionless pass (approaching rows active
 *      first); for each, the tangential states in the order stick, slip along vt⁻, slip against it (base-3
 *      digits, last contact fastest). The first combination that passes every check and does not increase
 *      the kinetic energy beyond the work of conveyor belts is the result.
 *   2. Poisson: the same problem with every target 0 (compression), then each contact's impulse (normal and
 *      tangential) multiplied by 1 + e, the equality rows re-solved; accepted when no contact approaches
 *      and the energy does not increase. Newton's law at several points at once has no solution in many
 *      over-constrained arrangements (a block landing in a corner), Poisson's usually does.
 *   3. Plastic: the compression of 2 alone (e = 0 at every point), with a warning.
 * Null when none applies (also with too many points or combinations).
 */
function multiFriction(sys: System, X: Float64Array, rows: IRow[]): ImpactResult | null {
  const fx = frictionRows(sys, X, rows)
  if (!fx) return null
  const before = kineticEnergy(sys, X)
  const m = rows.length
  const newton = new Float64Array(m)
  for (let i = 0; i < m; i++) newton[i] = rows[i].target
  const sol = enumerateFriction(sys, X, rows, fx, newton, before)
  if (sol) return frictionResult(sys, rows, fx, sol, before)
  const plastic = enumerateFriction(sys, X, rows, fx, new Float64Array(m), before)
  if (!plastic) return null
  const poisson = poissonStep(sys, X, rows, fx, plastic, before)
  if (poisson) return frictionResult(sys, rows, fx, poisson, before)
  for (const r of rows) if (r.info) r.info.restitution = 0
  const out = frictionResult(sys, rows, fx, plastic, before)
  out.warning = MULTI_IMPACT_PLASTIC_WARNING
  return out
}

/** Enumerate normal active sets and tangential states for the given targets (step 1 of multiFriction). */
function enumerateFriction(sys: System, X: Float64Array, rows: IRow[], fx: FrictionRows, targets: Float64Array, before: number): FrictionSolution | null {
  const m = rows.length
  const uni = rows.map((r, i) => (r.unilateral ? i : -1)).filter(i => i >= 0)
  const digits = uni.map(() => 0)
  let tries = 0
  for (let outer = 0; outer < 1 << Math.min(uni.length, 14); outer++) {
    const active = rows.map(r => !r.unilateral)
    uni.forEach((ri, k) => { const preferActive = rows[ri].approach; active[ri] = digits[k] === 0 ? preferActive : !preferActive })
    const fr: number[] = []
    for (let i = 0; i < m; i++) if (active[i] && fx.tan[i] >= 0) fr.push(i)
    const states = fr.map(() => 0)
    // Only combinations with friction acting somewhere are new; the all-frictionless ones were the first pass
    if (fr.length > 0) {
      for (;;) {
        if (++tries > MULTI_FRICTION_TRIES) return null
        const sol = tryCombination(sys, X, rows, fx, targets, active, fr, states, before)
        if (sol) return sol
        if (!advanceBase(states, 3)) break
      }
    }
    if (!advance(digits)) break
  }
  return null
}

/** One combination: solve and check (null when not admissible). */
function tryCombination(sys: System, X: Float64Array, rows: IRow[], fx: FrictionRows, targets: Float64Array, active: boolean[], fr: number[], states: number[], before: number): FrictionSolution | null {
  const { ext, extU, W, tan, belt, muK, muS, dir, scaleP } = fx
  const m = rows.length, me = ext.length
  /** Slip coefficient of each row's column (Pt = coef·Pn), 0 when not slipping. */
  const coef = new Float64Array(m)
  const stick: number[] = []
  fr.forEach((i, k) => {
    if (states[k] === 0) stick.push(i)
    else coef[i] = -muK[i] * (states[k] === 1 ? dir[i] : -dir[i])
  })
  // Unknowns: the active rows (normal impulse with its slip column), then the tangent rows of sticking contacts
  const cols: number[] = []
  for (let i = 0; i < m; i++) if (active[i]) cols.push(i)
  const q = cols.length + stick.length
  const A = new Float64Array(q * q), b = new Float64Array(q)
  for (let a = 0; a < q; a++) {
    const ra = a < cols.length ? cols[a] : tan[stick[a - cols.length]]
    for (let c = 0; c < q; c++) {
      if (c < cols.length) {
        const rc = cols[c]
        A[a * q + c] = coef[rc] !== 0 ? W[ra * me + rc] + coef[rc] * W[ra * me + tan[rc]] : W[ra * me + rc]
      } else A[a * q + c] = W[ra * me + tan[stick[c - cols.length]]]
    }
    b[a] = a < cols.length ? targets[ra] - extU[ra] : -belt[stick[a - cols.length]] - extU[ra]
  }
  const sol = solveDense(q, A, b)
  if (!sol.consistent) return null
  const P = new Float64Array(me)
  cols.forEach((ri, c) => {
    P[ri] = sol.x[c]
    if (coef[ri] !== 0) P[tan[ri]] = coef[ri] * sol.x[c]
  })
  stick.forEach((ri, k) => { P[tan[ri]] = sol.x[cols.length + k] })
  const vel = (r: number) => { let v = extU[r]; for (let k = 0; k < me; k++) v += W[r * me + k] * P[k]; return v }
  for (let i = 0; i < m; i++) {
    if (!rows[i].unilateral) continue
    if (active[i]) { if (P[i] < -1e-12 * scaleP) return null }
    else if (vel(i) < targets[i] - TOL.vel) return null
  }
  for (let k = 0; k < fr.length; k++) {
    const i = fr[k]
    const pn = Math.max(P[i], 0)
    if (states[k] === 0) { if (Math.abs(P[tan[i]]) > muS[i] * pn + 1e-12 * scaleP) return null }
    else {
      const s = states[k] === 1 ? dir[i] : -dir[i]
      if (s * (vel(tan[i]) + belt[i]) < -TOL.vel) return null
    }
  }
  const Y = applyExt(sys, X, ext, P)
  const after = kineticEnergy(sys, Y)
  if (!(after <= before + beltWorkOf(fx, fr, P) + 1e-12 * Math.max(1, before))) return null
  return { P, Y, after, fr: fr.slice(), states: states.slice() }
}

/** Step 2 of multiFriction: Poisson's restitution after the plastic compression (null when not admissible). */
function poissonStep(sys: System, X: Float64Array, rows: IRow[], fx: FrictionRows, plastic: FrictionSolution, before: number): FrictionSolution | null {
  const { ext, extU, W, tan } = fx
  const m = rows.length, me = ext.length
  const P = Float64Array.from(plastic.P)
  let any = false
  for (let i = 0; i < m; i++) {
    const e = rows[i].info?.restitution ?? 0
    if (!rows[i].unilateral || !(e > 0) || !(P[i] > 0)) continue
    any = true
    P[i] *= 1 + e
    if (tan[i] >= 0) P[tan[i]] *= 1 + e
  }
  if (!any) return null
  // Equality rows keep zero velocity: re-solve their impulses with the contact impulses fixed
  const bil: number[] = []
  for (let i = 0; i < m; i++) if (!rows[i].unilateral) bil.push(i)
  if (bil.length > 0) {
    const nb = bil.length
    const A = new Float64Array(nb * nb), b = new Float64Array(nb)
    bil.forEach((ra, a) => {
      bil.forEach((rc, c) => { A[a * nb + c] = W[ra * me + rc] })
      let v = extU[ra]
      for (let k = 0; k < me; k++) if (k >= m || rows[k].unilateral) v += W[ra * me + k] * P[k]
      b[a] = -v
    })
    const sol = solveDense(nb, A, b)
    if (!sol.consistent) return null
    bil.forEach((ri, a) => { P[ri] = sol.x[a] })
  }
  for (let i = 0; i < m; i++) {
    if (!rows[i].unilateral) continue
    let v = extU[i]
    for (let k = 0; k < me; k++) v += W[i * me + k] * P[k]
    if (v < -TOL.vel) return null
  }
  const Y = applyExt(sys, X, ext, P)
  const after = kineticEnergy(sys, Y)
  if (!(after <= before + beltWorkOf(fx, plastic.fr, P) + 1e-12 * Math.max(1, before))) return null
  return { P, Y, after, fr: plastic.fr, states: plastic.states }
}

/** The impact result of a multi-point frictional solution. */
function frictionResult(sys: System, rows: IRow[], fx: FrictionRows, sol: FrictionSolution, before: number): ImpactResult {
  const n = sys.n
  const { P, Y, fr, states } = sol
  const points: ImpactPoint[] = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (!r.info) continue
    if (!(r.approach || P[i] > 0)) continue
    const info = r.info
    // + 0: a zero impulse is reported as +0 (−0 arises from slip coefficients times a zero normal impulse)
    info.impulse = P[i] + 0
    info.vnAfter = rowDot(r.j, Y, 3 * n)
    const k = fr.indexOf(i)
    if (k >= 0 && r.kin) {
      info.tangentImpulse = P[fx.tan[i]] + 0
      info.vtBefore = r.kin.vt
      info.vtAfter = rowDot(r.kin.jt, Y, 3 * n) + fx.belt[i]
      info.friction = states[k] === 0 ? 'stick' : states[k] === 1 || Math.abs(r.kin.vt) <= TOL.vel ? 'slip' : 'reverse'
    }
    points.push(info)
  }
  return { X: Y, points, energyBefore: before, energyAfter: sol.after, loss: before - sol.after }
}

/** Next combination of base-`base` digits (last digit fastest); false after the last. */
function advanceBase(digits: number[], base: number): boolean {
  let k = digits.length - 1
  while (k >= 0) { digits[k]++; if (digits[k] < base) return true; digits[k] = 0; k-- }
  return false
}

function advance(digits: number[]): boolean {
  let k = digits.length - 1
  while (k >= 0) { digits[k]++; if (digits[k] < 2) return true; digits[k] = 0; k-- }
  return false
}
