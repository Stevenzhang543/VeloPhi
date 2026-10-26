/**
 * Moreau–Jean time stepping: the reduced-accuracy fallback for scenes with very many contacts or impacts
 * (manual 26.49 §1, P2). It is never used unless the user chooses it (integrator 'moreau') or the
 * event-driven solver stops making progress (impacts or mode switches piling up at one instant); the
 * recording then says so (Recording.reducedFrom, segments marked `reduced`, a 'timestep' event, a warning).
 *
 * One step of size h from (q, v):
 *   v* = v + h·M⁻¹Q(q, v)                                   applied forces (explicit)
 *   v⁺ = v* + M⁻¹JᵀP                                        impulses of all constraints, by projected
 *                                                           Gauss–Seidel with a fixed number of sweeps:
 *     hinges, rods             J·v⁺ = 0
 *     contacts that touch, or that the free motion v* closes within the step (speculative contacts):
 *                              vn⁺ ≥ −e·vn⁻ when the approach at the start of the step reaches the contact
 *                              (Newton; e = 0 below 2·g·h, so resting bodies do not chatter), otherwise
 *                              vn⁺ ≥ −gap/h (land without bouncing); Pn ≥ 0, complementary
 *     friction                 |Pt| ≤ μ·Pn, aiming at vt⁺ = 0 (μs while sticking, μk while sliding)
 *     ropes at full length     like a contact with e = 0
 *     slider end stops         like a contact with the stop's restitution (26.52)
 *     torque-limited drives    the drive row with |P| ≤ h·τmax (26.52)
 *     rolling resistance       |P_roll| ≤ C_rr·R·Pn on the relative rolling, aiming at zero (26.52)
 *   q⁺ = q + h·v⁺, then penetration and joint drift are removed by a mass-weighted projection.
 * Fixed loop orders and sweep counts keep it bit-reproducible. Contact forces between frames, friction heat
 * and impact losses are not resolved individually: the energy the impulses remove is booked as one loss.
 */
import type { Pose, RowJ } from './kinematics'
import type { ContactFeature } from './kinematics'
import { computePoses, contactKin, equalityKins, rollKin, ropeKin, sliderAxisKin } from './kinematics'
import type { System } from './dynamics'
import { AUX_BELT, AUX_DAMP, AUX_WORK, TOL, appliedForces, energy, limitRow, newRates, rollRadius, rollingOf, rowDot, rowMinvRow } from './dynamics'
import { inRegion, pairMayTouch } from './modes'
import { correction } from './project'

/** Parameters of the fallback. */
export const MOREAU = {
  /** Steps per output interval. */
  substeps: 4,
  /** Gauss–Seidel sweeps per step. */
  sweeps: 60,
  /** Penetration and joint drift left after the projection (m). */
  slop: 1e-9,
  /** Relative tangential speed treated as sticking (m/s). */
  stickSpeed: 1e-6
}

interface PRow {
  j: RowJ
  /** Diagonal j·M⁻¹·jᵀ. */
  d: number
  /** Velocity the row aims at (J·v⁺ = target for equalities, ≥ target for unilateral rows). */
  target: number
  kind: 'eq' | 'normal' | 'tangent'
  /** Index of the normal row of a friction row; −1 otherwise. */
  normal: number
  /** Friction coefficient of a friction row. */
  mu: number
  /** Accumulated impulse of the row. */
  lambda: number
  /** Bound |λ| ≤ lim of an equality row (the drive of a torque-limited motor, 26.52). */
  lim?: number
}

function addVel(model: System['model'], v: Float64Array, j: RowJ, dl: number) {
  // v += M⁻¹·jᵀ·dl
  const dyn = model.dynamic
  if (j.ai >= 0) { const b = dyn[j.ai]; v[3 * j.ai] += b.invMass * j.ax * dl; v[3 * j.ai + 1] += b.invMass * j.ay * dl; v[3 * j.ai + 2] += b.invInertia * j.aw * dl }
  if (j.bi >= 0) { const b = dyn[j.bi]; v[3 * j.bi] += b.invMass * j.bx * dl; v[3 * j.bi + 1] += b.invMass * j.by * dl; v[3 * j.bi + 2] += b.invInertia * j.bw * dl }
  if (j.ex) for (const t of j.ex) { const b = dyn[t.i]; v[3 * t.i] += b.invMass * t.x * dl; v[3 * t.i + 1] += b.invMass * t.y * dl; v[3 * t.i + 2] += b.invInertia * t.w * dl }
}

/**
 * Contacts that touch, or that the free velocity v* closes within the step: per pair, features in region,
 * deduplicated by contact point.
 */
function contactCandidates(sys: System, poses: Pose[], h: number, vStar: Float64Array) {
  const model = sys.model
  const out: Array<{ pairIndex: number; kin: ReturnType<typeof contactKin>; feature: ContactFeature }> = []
  for (const pair of sys.pairs) {
    const a = poses[pair.X.global], b = poses[pair.Y.global]
    const reach = h * (Math.abs(a.vx) + Math.abs(a.vy) + Math.abs(a.w) * pair.X.bound + Math.abs(b.vx) + Math.abs(b.vy) + Math.abs(b.w) * pair.Y.bound + model.accelScale * h)
    if (!pairMayTouch(pair, poses, 2 * reach + 1e-6)) continue
    const local: Array<{ k: ReturnType<typeof contactKin>; f: ContactFeature }> = []
    for (const f of pair.features) {
      const k = contactKin(f, poses)
      if (!inRegion(k) || k.gap < -0.05) continue
      if (k.gap > TOL.touch && k.gap + h * Math.min(k.vn, rowDot(k.jn, vStar)) > 0) continue
      if (local.some(o => Math.abs(o.k.cx - k.cx) <= 1e-9 && Math.abs(o.k.cy - k.cy) <= 1e-9)) continue
      local.push({ k, f })
    }
    for (const o of local) out.push({ pairIndex: pair.index, kin: o.k, feature: o.f })
  }
  return out
}

/** Result of one Moreau–Jean step. */
export interface MoreauStepResult {
  X: Float64Array
  /** Energy removed by the impulses and the projection in this step (J); may be slightly negative (explicit forces). */
  loss: number
}

/** One Moreau–Jean step of size h from state X (positions, velocities, ledger entries and clock updated). */
export function moreauStep(sys: System, X: Float64Array, h: number): MoreauStepResult {
  const model = sys.model, n = sys.n
  const poses = computePoses(model, X)
  const rates = newRates(sys.pairs.length)
  const Q = appliedForces(sys, poses, rates, X, null)
  const E0 = energy(sys, X, poses).total
  const v = Float64Array.from(X.subarray(3 * n, 6 * n))
  for (const b of model.dynamic) {
    const i = b.index
    v[3 * i] += h * Q[3 * i] * b.invMass; v[3 * i + 1] += h * Q[3 * i + 1] * b.invMass; v[3 * i + 2] += h * Q[3 * i + 2] * b.invInertia
  }
  const rows: PRow[] = []
  const eq = (j: RowJ, target: number) => rows.push({ j, d: rowMinvRow(model, j, j), target, kind: 'eq', normal: -1, mu: 0, lambda: 0 })
  // Equality rows keep their velocity target: 0, or a motor's speed (vel = J·v − speed)
  const drives: number[] = []
  for (const e of equalityKins(model, poses)) {
    if (e.kind === 'drive') drives.push(rows.length)
    eq(e.kin.j, e.kind === 'drive' ? model.motors[e.owner].speed : 0)
    if (e.kind === 'drive' && model.motors[e.owner].limited) rows[rows.length - 1].lim = h * model.motors[e.owner].maxTorque
  }
  model.ropes.forEach(r => {
    const k = ropeKin(poses, r)
    // g = L − ℓ ≥ 0, tension ≥ 0
    if (k.value > TOL.touch && k.value + 2 * h * k.vel > 0) return
    rows.push({ j: k.j, d: rowMinvRow(model, k.j, k.j), target: k.value > TOL.touch ? -k.value / h : 0, kind: 'normal', normal: -1, mu: 0, lambda: 0 })
  })
  // Below this approach speed an impact is plastic (gravity alone brings a resting body to it every step)
  const vRest = Math.max(TOL.zeno, 2 * model.accelScale * h)
  for (const c of contactCandidates(sys, poses, h, v)) {
    const pair = sys.pairs[c.pairIndex], k = c.kin
    const reaches = k.gap <= TOL.touch || k.gap + h * k.vn <= 0
    const e = k.vn < -vRest ? pair.material.restitution : 0
    const target = reaches ? Math.max(-e * k.vn, k.gap > TOL.touch ? -k.gap / h : 0) : -k.gap / h
    const ni = rows.length
    rows.push({ j: k.jn, d: rowMinvRow(model, k.jn, k.jn), target, kind: 'normal', normal: -1, mu: 0, lambda: 0 })
    const mat = pair.material
    if (mat.muS > 0 || mat.muK > 0) {
      const belt = k.vt - rowDot(k.jt, X, 3 * n)
      const mu = Math.abs(k.vt) <= MOREAU.stickSpeed ? Math.max(mat.muS, mat.muK) : mat.muK
      rows.push({ j: k.jt, d: rowMinvRow(model, k.jt, k.jt), target: -belt, kind: 'tangent', normal: ni, mu, lambda: 0 })
    }
    // 26.52: rolling resistance, a friction-like row on the relative rolling
    const crr = rollingOf(pair)
    if (crr > 0) {
      const R = rollRadius(c.feature)
      if (R > 0) {
        const rk = rollKin(poses, c.feature.A.body, c.feature.B.body)
        rows.push({ j: rk.j, d: rowMinvRow(model, rk.j, rk.j), target: 0, kind: 'tangent', normal: ni, mu: crr * R, lambda: 0 })
      }
    }
  }
  // 26.52: slider end stops that touch or that the motion reaches within the step
  if (model.hasLimits) {
    model.sliders.forEach((sl, k) => {
      if (!sl.limited) return
      const kin = sliderAxisKin(poses, sl)
      for (const side of [-1, 1]) {
        if (side < 0 ? !(sl.lo > -Infinity) : !(sl.hi < Infinity)) continue
        const row = limitRow(sl, k, side, kin)
        if (row.value > TOL.touch && row.value + 2 * h * row.vel > 0) continue
        const reaches = row.value <= TOL.touch || row.value + h * row.vel <= 0
        const e = row.vel < -vRest ? sl.e : 0
        const target = reaches ? Math.max(-e * row.vel, row.value > TOL.touch ? -row.value / h : 0) : -row.value / h
        rows.push({ j: row.j, d: rowMinvRow(model, row.j, row.j), target, kind: 'normal', normal: -1, mu: 0, lambda: 0 })
      }
    })
  }
  // Projected Gauss–Seidel
  for (let sweep = 0; sweep < MOREAU.sweeps; sweep++) {
    for (const r of rows) {
      if (!(r.d > 0)) continue
      const vel = rowDot(r.j, v)
      let next = r.lambda + (r.target - vel) / r.d
      if (r.kind === 'normal') next = Math.max(0, next)
      else if (r.kind === 'tangent') { const lim = r.mu * rows[r.normal].lambda; next = Math.min(lim, Math.max(-lim, next)) }
      else if (r.lim !== undefined) next = Math.min(r.lim, Math.max(-r.lim, next))
      const dl = next - r.lambda
      if (dl !== 0) { addVel(model, v, r.j, dl); r.lambda = next }
    }
  }
  // Motor work (26.51): torque motors (their power over the step) and the impulses of speed drives at their speed
  let motor = h * rates.beltWork
  for (const k of drives) motor += rows[k].lambda * rows[k].target
  const Y = Float64Array.from(X)
  for (let k = 0; k < 3 * n; k++) { Y[3 * n + k] = v[k]; Y[k] = X[k] + h * v[k] }
  Y[sys.auxBase + AUX_WORK] = X[sys.auxBase + AUX_WORK] + h * rates.appliedWork
  Y[sys.auxBase + AUX_DAMP] = X[sys.auxBase + AUX_DAMP] + h * rates.damping
  if (motor !== 0) Y[sys.auxBase + AUX_BELT] = X[sys.auxBase + AUX_BELT] + motor
  if (sys.timeSlot >= 0) Y[sys.timeSlot] = X[sys.timeSlot] + h
  const Z = projectPositions(sys, Y)
  const E1 = energy(sys, Z).total
  // Scenes without motors keep the expression of 26.50 (bit for bit)
  return { X: Z, loss: motor !== 0 ? E0 + h * rates.appliedWork + motor - h * rates.damping - E1 : E0 + h * rates.appliedWork - h * rates.damping - E1 }
}

/** Remove penetration, joint drift and rope overstretch (positions only), a few Gauss–Newton passes. */
function projectPositions(sys: System, Xin: Float64Array): Float64Array {
  const model = sys.model, n = sys.n
  let X = Xin
  for (let pass = 0; pass < 6; pass++) {
    const poses = computePoses(model, X)
    const rows: Array<{ j: RowJ; err: number }> = []
    for (const e of equalityKins(model, poses)) if (e.holonomic && Math.abs(e.kin.value) > MOREAU.slop) rows.push({ j: e.kin.j, err: e.kin.value })
    model.ropes.forEach(r => { const k = ropeKin(poses, r); if (k.value < -MOREAU.slop) rows.push({ j: k.j, err: k.value }) })
    // 26.52: slider end stops
    if (model.hasLimits) {
      model.sliders.forEach((sl, k) => {
        if (!sl.limited) return
        const kin = sliderAxisKin(poses, sl)
        if (kin.value - sl.lo < -MOREAU.slop) { const r = limitRow(sl, k, -1, kin); rows.push({ j: r.j, err: r.value }) }
        else if (sl.hi - kin.value < -MOREAU.slop) { const r = limitRow(sl, k, 1, kin); rows.push({ j: r.j, err: r.value }) }
      })
    }
    for (const pair of sys.pairs) {
      if (!pairMayTouch(pair, poses, 1e-6)) continue
      const seen: Array<{ x: number; y: number }> = []
      for (const f of pair.features) {
        const k = contactKin(f, poses)
        if (!inRegion(k) || k.gap >= -MOREAU.slop || k.gap < -0.05) continue
        if (seen.some(p => Math.abs(p.x - k.cx) <= 1e-9 && Math.abs(p.y - k.cy) <= 1e-9)) continue
        seen.push({ x: k.cx, y: k.cy })
        rows.push({ j: k.jn, err: k.gap })
      }
    }
    if (!rows.length) break
    const d = correction(sys, rows)
    if (!d) break
    if (X === Xin) X = Float64Array.from(Xin)
    for (let k = 0; k < 3 * n; k++) X[k] += d[k]
  }
  return X
}
