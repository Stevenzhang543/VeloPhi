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
 */
import type { ContactFeature, ContactKin, Pose } from './kinematics'
import { computePoses, contactKin, ropeKin } from './kinematics'
import type { Friction, Mode, ModeSolution, PairInfo, System, UnitMode } from './dynamics'
import { TOL, solveMode } from './dynamics'

export interface Touch { pair: PairInfo; feature: ContactFeature; kin: ContactKin }

export function inRegion(k: ContactKin): boolean { return k.m1 >= -TOL.ext && k.m2 >= -TOL.ext }

/** Touching features (gap ≈ 0 within the feature's region), deduplicated by contact point. */
export function touchingFeatures(sys: System, poses: Pose[]): Touch[] {
  const out: Touch[] = []
  for (const pair of sys.pairs) {
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

interface UnitCandidate { pair: PairInfo; ref: Touch; points: Touch[]; vt: number }
interface UnitOption { closed: number[]; friction: Friction; s: number }

function unitOptions(u: UnitCandidate): UnitOption[] {
  const p = u.points.length
  const subsets: number[][] = p === 1 ? [[0]] : [[0, 1], [0], [1]]
  const mat = u.pair.material
  const frictions: Array<{ friction: Friction; s: number }> = []
  if (mat.muS <= 0 && mat.muK <= 0) frictions.push({ friction: 'none', s: 0 })
  else if (Math.abs(u.vt) > TOL.vel) frictions.push({ friction: 'slide', s: u.vt > 0 ? 1 : -1 })
  else frictions.push({ friction: 'stick', s: 0 }, { friction: 'slide', s: 1 }, { friction: 'slide', s: -1 })
  const out: UnitOption[] = []
  for (const sub of subsets) for (const fr of frictions) out.push({ closed: sub, friction: fr.friction, s: fr.s })
  out.push({ closed: [], friction: 'none', s: 0 })
  return out
}

export interface ModeChoice {
  mode: Mode
  solution: ModeSolution
  /** Violation of the chosen mode (0 when consistent). */
  violation: number
  tried: number
  ambiguous: boolean
}

/** Sum of normalized violations of the complementarity conditions (0: valid). */
export function modeViolation(sys: System, mode: Mode, sol: ModeSolution, slideFromRest: boolean[], slackCandidates: boolean[]): number {
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
    }
  })
  mode.taut.forEach((taut, k) => {
    if (taut) { const T = sol.ropeTension[k]; if (T < -epsF) v += -T / F }
    else if (slackCandidates[k]) { const a = sol.ropeKin[k].acc; if (a < -epsA) v += -a / Acc }
  })
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
 * before; points that separate are left open.
 */
export function determineMode(sys: System, X: Float64Array, maxTries = 20000): ModeChoice {
  const model = sys.model
  const poses = computePoses(model, X)
  const touches = touchingFeatures(sys, poses).filter(t => t.kin.vn <= TOL.vel)
  // group by pair
  const byPair = new Map<number, Touch[]>()
  for (const t of touches) {
    const list = byPair.get(t.pair.index) ?? []
    list.push(t); byPair.set(t.pair.index, list)
  }
  const candidates: UnitCandidate[] = []
  for (const pair of sys.pairs) {
    const list = byPair.get(pair.index)
    if (!list || list.length === 0) continue
    const ref = pickReference(list)
    const ordered = [ref, ...list.filter(t => t !== ref)]
    const points = reducePoints(ordered, ref)
    if (!points.includes(ref)) points.unshift(ref)
    candidates.push({ pair, ref, points: points.slice(0, 2), vt: ref.kin.vt })
  }
  const ropeInfo = model.ropes.map(r => ropeKin(poses, r))
  const ropeCandidate = ropeInfo.map(k => k.value <= TOL.touch && Math.abs(k.vel) <= TOL.vel)
  const options = candidates.map(unitOptions)
  const ropeOptions = ropeCandidate.map(c => (c ? [true, false] : [false]))
  const radices = [...options.map(o => o.length), ...ropeOptions.map(o => o.length)]
  const digits = radices.map(() => 0)
  const slideFromRest = candidates.map(c => Math.abs(c.vt) <= TOL.vel)
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
        units.push({ pair: c.pair, ref: c.ref.feature, points: closed, open, friction: opt.friction, s: opt.s })
      }
    })
    const taut = ropeOptions.map((o, k) => o[digits[candidates.length + k]])
    const mode: Mode = { units, taut }
    const sol = solveMode(sys, X, mode, poses)
    const violation = modeViolation(sys, mode, sol, slideFromRest, ropeCandidate)
    tried++
    if (!best || violation < best.violation) best = { mode, solution: sol, violation, tried, ambiguous: false }
    if (violation === 0) break
    // next combination (last entity varies fastest)
    let k = radices.length - 1
    while (k >= 0) { digits[k]++; if (digits[k] < radices[k]) break; digits[k] = 0; k-- }
    if (k < 0 || tried >= maxTries) break
  }
  const chosen = best!
  chosen.tried = tried
  chosen.ambiguous = chosen.violation > 0
  return chosen
}

export function describeMode(mode: Mode): string {
  const parts = mode.units.filter(u => u.points.length > 0).map(u => `${u.pair.key}:${u.points.length}${u.friction === 'slide' ? (u.s > 0 ? 'slide+' : 'slide-') : u.friction}`)
  mode.taut.forEach((t, k) => parts.push(`rope${k}:${t ? 'taut' : 'slack'}`))
  return parts.join(' ')
}
