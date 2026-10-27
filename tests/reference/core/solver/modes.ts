/**
 * Mode determination at a state where something changes (start, impacts, events).
 *
 * Contact candidates are the touching feature pairs that neither approach nor separate. Each pair of bodies
 * forms a unit (convex shapes touch along one normal); a unit's options are: which points are closed, and
 * whether it sticks or slides (either way) when the relative tangential velocity is zero. Ropes at their full
 * length with zero length rate can be taut or slack. All combinations are tried in a fixed order (closed
 * before open, stick before slide) and the first one consistent with the complementarity conditions is
 * taken:
 *   closed point: λn ≥ 0;  open candidate: gap acceleration ≥ 0;
 *   stick: |λt| ≤ μs·N;  slide from rest in direction s: s·(d vt/dt) ≥ 0;
 *   taut rope: tension ≥ 0;  slack candidate: (L − ℓ)'' ≥ 0.
 * 26.52 (D58, D59) adds three more kinds of entity, each with the same two-sided logic:
 *   slider end stop: closed λ ≥ 0, open candidate g̈ ≥ 0 (g = s − lo or hi − s);
 *   torque-limited motor: locked |λ_drive| ≤ τmax, slipping from rest in direction d: d·ė ≥ 0 (e = ω_rel − speed);
 *   rolling resistance of a unit: rolling rest |M| ≤ C_rr·N·R, rolling from rest in direction r: r·ω̇_rel ≥ 0.
 */
import type { ContactFeature, ContactKin, Pose } from './kinematics'
import { computePoses, contactKin, driveKin, ropeKin, sliderAxisKin } from './kinematics'
import type { Friction, Mode, ModeSolution, PairInfo, System, UnitMode } from './dynamics'
import { TOL, rollRadius, rollingOf, rowDot, solveMode, switchBranches } from './dynamics'

/** A touching feature with its kinematics. */
export interface Touch { pair: PairInfo; feature: ContactFeature; kin: ContactKin }

/** Whether a contact lies within its feature's region (face extent or vertex cone), up to TOL.ext. */
export function inRegion(k: ContactKin): boolean { return k.m1 >= -TOL.ext && k.m2 >= -TOL.ext }

/**
 * Broad phase: can the two bodies of a pair be within `margin` of each other? (Bounding circles about the
 * body origins; a pair rejected here has no feature with a gap below the margin.)
 */
export function pairMayTouch(pair: PairInfo, poses: Pose[], margin: number): boolean {
  const a = poses[pair.X.global], b = poses[pair.Y.global]
  const dx = a.x - b.x, dy = a.y - b.y, r = pair.X.bound + pair.Y.bound + margin
  return dx * dx + dy * dy <= r * r
}

/** Touching features (gap ≈ 0 within the feature's region), deduplicated by contact point. */
export function touchingFeatures(sys: System, poses: Pose[]): Touch[] {
  const out: Touch[] = []
  for (const pair of sys.pairs) {
    if (!pairMayTouch(pair, poses, 1e-6)) continue
    const local: Touch[] = []
    for (const f of pair.features) {
      const k = contactKin(f, poses)
      if (!inRegion(k) || k.gap > TOL.touch || k.gap < -TOL.deep) continue
      if (local.some(t => Math.abs(t.kin.cx - k.cx) <= 1e-9 && Math.abs(t.kin.cy - k.cy) <= 1e-9)) continue
      local.push({ pair, feature: f, kin: k })
    }
    out.push(...local)
  }
  return out
}

/**
 * Touches of a pair split into contact units (26.52, D35). Convex shapes touch along one normal: one unit. A pair with a
 * concave or compound body may touch at several places with different normals (a ball in a V-notch, a block in a
 * channel): touches whose normals (oriented from Y to X) are parallel and point the same way form one unit, in the
 * order the first touch of each appears.
 */
export function contactClusters(pair: PairInfo, list: Touch[]): Touch[][] {
  if (pair.X.shape.kind !== 'complex' && pair.Y.shape.kind !== 'complex') return [list]
  const out: Array<{ nx: number; ny: number; list: Touch[] }> = []
  for (const t of list) {
    const sg = t.feature.A.body === pair.X ? 1 : -1
    const nx = sg * t.kin.nx, ny = sg * t.kin.ny
    const c = out.find(o => Math.abs(o.nx * ny - o.ny * nx) <= 1e-6 && o.nx * nx + o.ny * ny > 0)
    if (c) c.list.push(t)
    else out.push({ nx, ny, list: [t] })
  }
  return out.map(o => o.list)
}

/** Order the features of a unit so the reference comes first: a face on a static body is preferred. */
function pickReference(list: Touch[]): Touch {
  for (const t of list) if (!t.feature.B.body.dynamic) return t
  for (const t of list) if (t.feature.A.body.dynamic && t.feature.kind === 'pf') return t
  return list[0]
}

/** Keep at most two points per unit: the extremes along the tangent. */
function reducePoints(list: Touch[], ref: Touch): Touch[] {
  if (list.length <= 2) return list
  let lo = list[0], hi = list[0]
  const proj = (t: Touch) => ref.kin.tx * t.kin.cx + ref.kin.ty * t.kin.cy
  for (const t of list) { if (proj(t) < proj(lo)) lo = t; if (proj(t) > proj(hi)) hi = t }
  return lo === hi ? [lo] : [lo, hi]
}

/** `wr`: relative rolling ω_A − ω_B, NaN when the unit has no rolling resistance (26.52). */
interface UnitCandidate { pair: PairInfo; ref: Touch; points: Touch[]; vt: number; wr: number }
interface UnitOption { closed: number[]; friction: Friction; s: number; roll?: number }

function unitOptions(u: UnitCandidate): UnitOption[] {
  const p = u.points.length
  const subsets: number[][] = p === 1 ? [[0]] : [[0, 1], [0], [1]]
  const mat = u.pair.material
  const frictions: Array<{ friction: Friction; s: number }> = []
  if (mat.muS <= 0 && mat.muK <= 0) frictions.push({ friction: 'none', s: 0 })
  else if (Math.abs(u.vt) > TOL.vel) frictions.push({ friction: 'slide', s: u.vt > 0 ? 1 : -1 })
  else frictions.push({ friction: 'stick', s: 0 }, { friction: 'slide', s: 1 }, { friction: 'slide', s: -1 })
  // 26.52: rolling rest before rolling either way, or the rolling direction
  const rolls: number[] | null = Number.isNaN(u.wr) ? null : Math.abs(u.wr) > TOL.vel ? [u.wr > 0 ? 1 : -1] : [0, 1, -1]
  const out: UnitOption[] = []
  for (const sub of subsets) {
    for (const fr of frictions) {
      if (rolls) for (const r of rolls) out.push({ closed: sub, friction: fr.friction, s: fr.s, roll: r })
      else out.push({ closed: sub, friction: fr.friction, s: fr.s })
    }
  }
  out.push({ closed: [], friction: 'none', s: 0 })
  return out
}

/** Relative rolling of a unit with rolling resistance, NaN without (26.52). */
function unitRolling(pair: PairInfo, ref: Touch, poses: Pose[]): number {
  if (!(rollingOf(pair) > 0) || !(rollRadius(ref.feature) > 0)) return Number.NaN
  return poses[ref.feature.A.body.global].w - poses[ref.feature.B.body.global].w
}

/** Which entities started at rest at their boundary (they may only leave it with the right sign of acceleration). */
export interface FromRest {
  slide: boolean[]
  slack: boolean[]
  /** 26.52: rolling from rolling rest (per unit) and slipping from a locked drive (per motor). */
  roll?: boolean[]
  slip?: boolean[]
  /** 26.52: end-stop candidates (per slider: the side, or 0). */
  limit?: number[]
}

/** Result of determineMode. */
export interface ModeChoice {
  mode: Mode
  solution: ModeSolution
  /** Violation of the chosen mode (0 when consistent). */
  violation: number
  /** Number of combinations tried. */
  tried: number
  /** No combination was fully consistent; the least violating one was taken. */
  ambiguous: boolean
}

/** Sum of normalized violations of the complementarity conditions (0: valid). */
export function modeViolation(sys: System, mode: Mode, sol: ModeSolution, rest: FromRest): number {
  const slideFromRest = rest.slide, slackCandidates = rest.slack
  const epsF = TOL.force * sys.model.forceScale
  const epsA = TOL.acc * sys.model.accelScale
  const F = sys.model.forceScale, Acc = sys.model.accelScale
  let v = 0
  if (!sol.consistent) v += 1 + sol.residual
  mode.units.forEach((u, ui) => {
    const st = sol.units[ui]
    for (const l of st.pointLambda) if (l < -epsF) v += -l / F
    for (const k of st.openKin) {
      const ga = rowAcc(k, sol)
      if (ga < -epsA) v += -ga / Acc
    }
    if (u.points.length > 0) {
      if (u.friction === 'stick') {
        const margin = u.pair.material.muS * st.normal - Math.abs(st.tangent)
        if (margin < -epsF) v += -margin / F
      } else if (u.friction === 'slide' && slideFromRest[ui]) {
        const sa = u.s * st.at
        if (sa < -epsA) v += -sa / Acc
      }
      // 26.52: rolling resistance
      if (u.roll === 0) {
        const margin = rollingOf(u.pair) * rollRadius(u.ref) * st.normal - Math.abs(st.roll)
        if (margin < -epsF) v += -margin / F
      } else if (u.roll !== undefined && rest.roll && rest.roll[ui]) {
        const ra = u.roll * st.wra
        if (ra < -epsA) v += -ra / Acc
      }
    }
  })
  mode.taut.forEach((taut, k) => {
    if (taut) { const T = sol.ropeTension[k]; if (T < -epsF) v += -T / F }
    else if (slackCandidates[k]) { const a = sol.ropeKin[k].acc; if (a < -epsA) v += -a / Acc }
  })
  // 26.52: end stops of sliders
  if (mode.limit) {
    const model = sys.model
    mode.limit.forEach((side, k) => {
      if (side !== 0) { const l = sol.limitForce[k]; if (l < -epsF) v += -l / F; return }
      const cand = rest.limit ? rest.limit[k] : 0
      if (cand === 0) return
      const kin = sliderAxisKin(sol.poses, model.sliders[k])
      const a = cand * -(rowDot(kin.j, sol.acc) + kin.c)
      if (a < -epsA) v += -a / Acc
    })
  }
  // 26.52: torque-limited motors
  if (mode.slip) {
    const model = sys.model
    mode.slip.forEach((d, k) => {
      const mo = model.motors[k]
      if (!mo.limited) return
      if (d === 0) { const margin = mo.maxTorque - Math.abs(sol.driveTorque[k]); if (margin < -epsF) v += -margin / F }
      else if (rest.slip && rest.slip[k]) { const a = d * sol.driveAcc[k]; if (a < -epsA) v += -a / Acc }
    })
  }
  return v
}

function rowAcc(k: ContactKin, sol: ModeSolution): number {
  let s = k.cn
  const j = k.jn
  if (j.ai >= 0) s += j.ax * sol.acc[3 * j.ai] + j.ay * sol.acc[3 * j.ai + 1] + j.aw * sol.acc[3 * j.ai + 2]
  if (j.bi >= 0) s += j.bx * sol.acc[3 * j.bi] + j.by * sol.acc[3 * j.bi + 1] + j.bw * sol.acc[3 * j.bi + 2]
  return s
}

/**
 * Determine the mode at state X. Touching points that approach must have been resolved by an impact
 * before; points that separate are left open. `prefer.slack` lists ropes whose slack event located X.
 */
export function determineMode(sys: System, X: Float64Array, maxTries = 20000, prefer: { slack?: number[]; unlimit?: number[] } = {}): ModeChoice {
  const model = sys.model
  const poses = computePoses(model, X)
  const touches = touchingFeatures(sys, poses).filter(t => t.kin.vn <= TOL.vel)
  // Group by pair
  const byPair = new Map<number, Touch[]>()
  for (const t of touches) {
    const list = byPair.get(t.pair.index) ?? []
    list.push(t); byPair.set(t.pair.index, list)
  }
  const candidates: UnitCandidate[] = []
  for (const pair of sys.pairs) {
    const all = byPair.get(pair.index)
    if (!all || all.length === 0) continue
    for (const list of contactClusters(pair, all)) {
      const ref = pickReference(list)
      const ordered = [ref, ...list.filter(t => t !== ref)]
      const points = reducePoints(ordered, ref)
      if (!points.includes(ref)) points.unshift(ref)
      candidates.push({ pair, ref, points: points.slice(0, 2), vt: ref.kin.vt, wr: unitRolling(pair, ref, poses) })
    }
  }
  const ropeInfo = model.ropes.map(r => ropeKin(poses, r))
  const ropeCandidate = ropeInfo.map(k => k.value <= TOL.touch && Math.abs(k.vel) <= TOL.vel)
  const options = candidates.map(unitOptions)
  // A rope whose slack event just fired is tried slack first (its tension is already a rounding error below 0)
  const ropeOptions = ropeCandidate.map((c, k) => (c ? (prefer.slack?.includes(k) ? [false, true] : [true, false]) : [false]))
  // 26.52 (D58): a slider at rest at an end stop may stay there or leave it (open first after its release event fired)
  const limitCand: number[] = model.hasLimits ? model.sliders.map(sl => {
    if (!sl.limited) return 0
    const kin = sliderAxisKin(poses, sl)
    if (Math.abs(kin.vel) > TOL.vel) return 0
    if (kin.value - sl.lo <= TOL.touch) return -1
    if (sl.hi - kin.value <= TOL.touch) return 1
    return 0
  }) : []
  const limitOptions = limitCand.map((side, k) => (side === 0 ? [0] : prefer.unlimit?.includes(k) ? [0, side] : [side, 0]))
  // A torque-limited motor at its speed may stay locked or slip either way; otherwise it slips against e
  const slipE: number[] = model.hasSlip ? model.motors.map(mo => (mo.limited ? driveKin(poses, mo.a.body, mo.b.body, mo.speed).vel : 0)) : []
  const slipOptions = model.hasSlip ? model.motors.map((mo, k) => (!mo.limited ? [0] : Math.abs(slipE[k]) > TOL.vel ? [slipE[k] > 0 ? 1 : -1] : [0, 1, -1])) : []
  const radices = [...options.map(o => o.length), ...ropeOptions.map(o => o.length), ...limitOptions.map(o => o.length), ...slipOptions.map(o => o.length)]
  const digits = radices.map(() => 0)
  const slideFromRest = candidates.map(c => Math.abs(c.vt) <= TOL.vel)
  const rest: FromRest = { slide: slideFromRest, slack: ropeCandidate }
  if (candidates.some(c => !Number.isNaN(c.wr))) rest.roll = candidates.map(c => Math.abs(c.wr) <= TOL.vel)
  if (model.hasLimits) rest.limit = limitCand
  if (model.hasSlip) rest.slip = model.motors.map((mo, k) => mo.limited && Math.abs(slipE[k]) <= TOL.vel)
  const nU = candidates.length, nR = ropeOptions.length, nL = limitOptions.length
  // Branches of the variable forces follow from the state alone (the located state lies past a switch)
  const sw = model.switches.length > 0 ? switchBranches(sys, X) : undefined
  let best: ModeChoice | null = null
  let tried = 0
  for (;;) {
    const units: UnitMode[] = []
    candidates.forEach((c, ui) => {
      const opt = options[ui][digits[ui]]
      const closed = opt.closed.map(i => c.points[i].feature)
      const open = c.points.filter((_, i) => !opt.closed.includes(i)).map(t => t.feature)
      if (closed.length === 0) {
        units.push({ pair: c.pair, ref: c.ref.feature, points: [], open, friction: 'none', s: 0 })
      } else {
        const u: UnitMode = { pair: c.pair, ref: c.ref.feature, points: closed, open, friction: opt.friction, s: opt.s }
        if (opt.roll !== undefined) u.roll = opt.roll
        units.push(u)
      }
    })
    const taut = ropeOptions.map((o, k) => o[digits[nU + k]])
    const mode: Mode = sw ? { units, taut, sw } : { units, taut }
    if (model.hasLimits) mode.limit = limitOptions.map((o, k) => o[digits[nU + nR + k]])
    if (model.hasSlip) mode.slip = slipOptions.map((o, k) => o[digits[nU + nR + nL + k]])
    const sol = solveMode(sys, X, mode, poses)
    const violation = modeViolation(sys, mode, sol, rest)
    tried++
    if (!best || violation < best.violation) best = { mode, solution: sol, violation, tried, ambiguous: false }
    if (violation === 0) break
    // Next combination (last entity varies fastest)
    let k = radices.length - 1
    while (k >= 0) { digits[k]++; if (digits[k] < radices[k]) break; digits[k] = 0; k-- }
    if (k < 0 || tried >= maxTries) break
  }
  const chosen = best!
  chosen.tried = tried
  chosen.ambiguous = chosen.violation > 0
  return chosen
}

/**
 * The mode a state is in, without enumeration (used by the time-stepping fallback for readouts): every
 * touching point closed (at most two per pair), sticking when the relative tangential speed is below
 * `stickSpeed`, otherwise sliding against it; ropes at full length taut; variable-force switches by sign.
 */
export function stateMode(sys: System, X: Float64Array, stickSpeed = 1e-6): Mode {
  const poses = computePoses(sys.model, X)
  const byPair = new Map<number, Touch[]>()
  for (const t of touchingFeatures(sys, poses)) {
    const list = byPair.get(t.pair.index) ?? []
    list.push(t); byPair.set(t.pair.index, list)
  }
  const units: UnitMode[] = []
  for (const pair of sys.pairs) {
    const all = byPair.get(pair.index)
    if (!all) continue
    for (const list of contactClusters(pair, all)) {
      const ref = pickReference(list)
      const points = reducePoints([ref, ...list.filter(t => t !== ref)], ref)
      if (!points.includes(ref)) points.unshift(ref)
      const vt = ref.kin.vt
      const mat = pair.material
      const friction: Friction = mat.muS <= 0 && mat.muK <= 0 ? 'none' : Math.abs(vt) <= stickSpeed ? 'stick' : 'slide'
      const u: UnitMode = { pair, ref: ref.feature, points: points.slice(0, 2).map(t => t.feature), open: [], friction, s: friction === 'slide' ? (vt > 0 ? 1 : -1) : 0 }
      const wr = unitRolling(pair, ref, poses)
      if (!Number.isNaN(wr)) u.roll = Math.abs(wr) <= stickSpeed ? 0 : wr > 0 ? 1 : -1
      units.push(u)
    }
  }
  const model = sys.model
  const taut = model.ropes.map(r => ropeKin(poses, r).value <= TOL.touch)
  const sw = model.switches.length ? switchBranches(sys, X) : undefined
  const mode: Mode = sw ? { units, taut, sw } : { units, taut }
  if (model.hasLimits) {
    mode.limit = model.sliders.map(sl => {
      if (!sl.limited) return 0
      const s = sliderAxisKin(poses, sl).value
      return s - sl.lo <= TOL.touch ? -1 : sl.hi - s <= TOL.touch ? 1 : 0
    })
  }
  if (model.hasSlip) {
    mode.slip = model.motors.map(mo => {
      if (!mo.limited) return 0
      const e = driveKin(poses, mo.a.body, mo.b.body, mo.speed).vel
      return Math.abs(e) <= stickSpeed ? 0 : e > 0 ? 1 : -1
    })
  }
  return mode
}

/** Compact text form of a mode, used as the segment label. */
export function describeMode(mode: Mode): string {
  const sign = (b: number) => (b > 0 ? '+' : b < 0 ? '-' : '0')
  const parts = mode.units.filter(u => u.points.length > 0).map(u => `${u.pair.key}:${u.points.length}${u.friction === 'slide' ? (u.s > 0 ? 'slide+' : 'slide-') : u.friction}${u.roll === undefined ? '' : u.roll === 0 ? '/rest' : u.roll > 0 ? '/roll+' : '/roll-'}`)
  mode.taut.forEach((t, k) => parts.push(`rope${k}:${t ? 'taut' : 'slack'}`))
  if (mode.sw && mode.sw.length) parts.push(`sw:${mode.sw.map(sign).join('')}`)
  if (mode.limit && mode.limit.length) parts.push(`lim:${mode.limit.map(sign).join('')}`)
  if (mode.slip && mode.slip.length) parts.push(`mot:${mode.slip.map(sign).join('')}`)
  return parts.join(' ')
}
