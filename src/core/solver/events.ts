/**
 * Event functions of a mode. Each is a scalar function of the state that stays ≥ 0 while the mode is valid:
 *   contact  signed distance of a probe (a vertex or circle) to the other body — a new contact;
 *   liftoff  normal force of a closed point — the point separates;
 *   leave    position of a closed point along its face (or angle inside a vertex cone) — it slides off;
 *   slip     μs·N − |λt| of a sticking unit — it starts to slide;
 *   stop     s·vt of a sliding unit — the relative velocity reaches zero (共速);
 *   slack    rope tension — the rope goes slack;
 *   taut     L − ℓ of a slack rope — the rope becomes taut.
 * Hysteresis: a function that starts at (or within ε of) zero fires only after falling ε below its start, so
 * a mode chosen exactly at a boundary does not trigger itself again.
 */
import type { Pose, Probe } from './kinematics'
import { computePoses, featureProbeKey, probeValue } from './kinematics'
import type { Mode, ModeSolution, System } from './dynamics'
import { TOL, solveMode } from './dynamics'

export type EventType = 'contact' | 'liftoff' | 'leave' | 'slip' | 'stop' | 'slack' | 'taut'

export interface EventFn {
  type: EventType
  unit: number
  point: number
  rope: number
  probe: Probe | null
  eps: number
  threshold: number
  /** Value at the start of the segment. */
  start: number
  value: (poses: Pose[], sol: ModeSolution) => number
}

export function buildEventFns(sys: System, mode: Mode, poses: Pose[], sol: ModeSolution, X?: Float64Array): EventFn[] {
  const model = sys.model
  const epsF = TOL.force * model.forceScale
  const fns: EventFn[] = []
  const add = (type: EventType, eps: number, value: EventFn['value'], extra: Partial<EventFn> = {}) => {
    fns.push({ type, unit: -1, point: -1, rope: -1, probe: null, eps, threshold: 0, start: 0, value, ...extra })
  }
  const closedProbes = new Set<string>()
  mode.units.forEach((u, ui) => {
    u.points.forEach((p, pi) => {
      closedProbes.add(featureProbeKey(p))
      add('liftoff', epsF, (_, s) => s.units[ui].pointLambda[pi], { unit: ui, point: pi })
      add('leave', TOL.ext, (_, s) => s.units[ui].pointKin[pi].m1, { unit: ui, point: pi })
      add('leave', TOL.ext, (_, s) => s.units[ui].pointKin[pi].m2, { unit: ui, point: pi })
    })
    if (u.points.length > 0 && u.friction === 'stick') {
      const muS = u.pair.material.muS
      add('slip', epsF, (_, s) => muS * s.units[ui].normal - Math.abs(s.units[ui].tangent), { unit: ui })
    }
    if (u.points.length > 0 && u.friction === 'slide') {
      const sgn = u.s
      add('stop', 1e-10, (_, s) => sgn * s.units[ui].vt, { unit: ui })
    }
  })
  for (const pair of sys.pairs) {
    for (const probe of pair.probes) {
      if (closedProbes.has(probe.key)) continue
      add('contact', TOL.ext, poses => probeValue(probe, poses), { probe })
    }
  }
  mode.taut.forEach((taut, k) => {
    if (taut) add('slack', epsF, (_, s) => s.ropeTension[k], { rope: k })
    else add('taut', TOL.ext, (_, s) => s.ropeKin[k].value, { rope: k })
  })
  // probes that start at contact but are already separating (after a bounce) need no hysteresis
  let ahead: Pose[] | null = null
  const dt = 1e-7
  if (X) {
    const n = sys.n
    const Y = Float64Array.from(X)
    for (let k = 0; k < 3 * n; k++) Y[k] += dt * X[3 * n + k]
    ahead = computePoses(sys.model, Y)
  }
  for (const f of fns) {
    const g0 = f.value(poses, sol)
    f.start = g0
    f.threshold = g0 > f.eps ? 0 : Math.min(g0, 0) - f.eps
    if (f.type === 'contact' && ahead && f.threshold < 0) {
      const rate = (f.value(ahead, sol) - g0) / dt
      if (rate > 1e-9) f.threshold = Math.min(0, g0)
    }
  }
  return fns
}

/** min over functions of (g − threshold): ≥ 0 while nothing has happened. */
export function eventMargin(sys: System, fns: EventFn[], mode: Mode, X: Float64Array): { margin: number; fired: EventFn[]; values: Float64Array } {
  const poses = computePoses(sys.model, X)
  const sol = solveMode(sys, X, mode, poses)
  let margin = Infinity
  const fired: EventFn[] = []
  const values = new Float64Array(fns.length)
  fns.forEach((f, i) => {
    const g = f.value(poses, sol)
    values[i] = g
    const d = g - f.threshold
    if (d < margin) margin = d
    if (d < 0) fired.push(f)
  })
  return { margin, fired, values }
}

/**
 * Re-arming: a function that started at its boundary gets its hysteresis removed as soon as it is seen
 * moving away from the boundary — threshold 0 once it exceeds 2ε, or its own start value (≤ 0) once it
 * has risen above it. Without this, a ball bouncing ever lower would fall an extra ε each bounce and
 * gain energy.
 */
export function rearm(fns: EventFn[], values: Float64Array) {
  fns.forEach((f, i) => {
    if (f.threshold >= 0) return
    if (values[i] > 2 * f.eps) f.threshold = 0
    else if (values[i] > f.start + 1e-3 * f.eps) f.threshold = Math.max(f.threshold, Math.min(0, f.start))
  })
}

/**
 * Locate the first event in a step of size h from X0: bracket [0, h] with margin(0) ≥ 0 > margin(h), Illinois
 * iteration on the step size, every evaluation a fresh step from X0. Returns the smallest step found with
 * a negative margin (just past the event) within TOL.time.
 */
export function locateEvent(
  sys: System, fns: EventFn[], mode: Mode, step: (h: number) => Float64Array, h: number, marginAtH: number
): { h: number; X: Float64Array; fired: EventFn[]; iterations: number } {
  let lo = 0, hi = h
  let flo = Infinity, fhi = marginAtH
  let Xhi = step(h)
  let firedHi = eventMargin(sys, fns, mode, Xhi).fired
  let side = 0
  let it = 0
  // margin at 0 is positive by construction; use a nominal value for the secant
  flo = 1
  {
    const m0 = eventMargin(sys, fns, mode, step(0)).margin
    if (Number.isFinite(m0)) flo = m0
  }
  while (hi - lo > TOL.time && it < 200) {
    it++
    let mid: number
    if (Number.isFinite(flo) && Number.isFinite(fhi) && flo !== fhi) mid = lo + (hi - lo) * flo / (flo - fhi)
    else mid = 0.5 * (lo + hi)
    if (!(mid > lo && mid < hi)) mid = 0.5 * (lo + hi)
    // keep the bracket shrinking: fall back to bisection every few iterations
    if (it % 8 === 0) mid = 0.5 * (lo + hi)
    const Xm = step(mid)
    const r = eventMargin(sys, fns, mode, Xm)
    if (r.margin < 0) {
      hi = mid; fhi = r.margin; Xhi = Xm; firedHi = r.fired
      if (side === -1) flo /= 2
      side = -1
    } else {
      lo = mid; flo = r.margin
      if (side === 1) fhi /= 2
      side = 1
    }
  }
  return { h: hi, X: Xhi, fired: firedHi, iterations: it }
}
