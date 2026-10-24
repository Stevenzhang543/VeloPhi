/**
 * Event functions of a mode. Each is a scalar function of the state that stays ≥ 0 while the mode is valid:
 *   contact  signed distance of a probe (a vertex or circle) to the other body — a new contact;
 *   liftoff  normal force of a closed point — the point separates;
 *   leave    position of a closed point along its face (or angle inside a vertex cone) — it slides off;
 *   slip     μs·N − |λt| of a sticking unit — it starts to slide;
 *   stop     s·vt of a sliding unit — the relative velocity reaches zero (common velocity);
 *   slack    rope tension — the rope goes slack;
 *   taut     L − ℓ of a slack rope — the rope becomes taut;
 *   switch   b·(switching argument) of a variable-force switch on branch b — the expression jumps or has a
 *            kink (−|argument| for sign() sitting at zero).
 * Hysteresis: a function that starts at (or within ε of) zero fires only after falling ε below its start, so
 * a mode chosen exactly at a boundary does not trigger itself again.
 */
import type { Pose, Probe } from './kinematics'
import { computePoses, featureProbeKey, probeValue } from './kinematics'
import type { Mode, ModeSolution, System } from './dynamics'
import { TOL, solveMode, switchArg } from './dynamics'

/** Kind of event function (see the module header). */
export type EventType = 'contact' | 'liftoff' | 'leave' | 'slip' | 'stop' | 'slack' | 'taut' | 'switch'

/** An event function of the current mode with its hysteresis state. */
export interface EventFn {
  type: EventType
  /** Unit, point and rope the function belongs to; −1 when not applicable. */
  unit: number
  point: number
  rope: number
  /** Switch index (variable forces), −1 otherwise. */
  sw: number
  /** Probe of a contact function. */
  probe: Probe | null
  /** Hysteresis width ε. */
  eps: number
  /** The event fires when the value falls below this. */
  threshold: number
  /** Value at the start of the segment. */
  start: number
  value: (poses: Pose[], sol: ModeSolution, X: Float64Array) => number
}

/** Hysteresis of switch events (in the unit of the switching argument). */
const SWITCH_EPS = 1e-11

/** Event functions of a mode at the start of a segment, with thresholds set from their start values. */
export function buildEventFns(sys: System, mode: Mode, poses: Pose[], sol: ModeSolution, X: Float64Array): EventFn[] {
  const model = sys.model
  const epsF = TOL.force * model.forceScale
  const fns: EventFn[] = []
  const add = (type: EventType, eps: number, value: EventFn['value'], extra: Partial<EventFn> = {}) => {
    fns.push({ type, unit: -1, point: -1, rope: -1, sw: -1, probe: null, eps, threshold: 0, start: 0, value, ...extra })
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
  const sw = mode.sw
  if (sw && sw.length === model.switches.length) {
    for (let k = 0; k < sw.length; k++) {
      const b = sw[k]
      add('switch', SWITCH_EPS, b !== 0 ? (_p, _s, Y) => b * switchArg(sys, k, Y, sw) : (_p, _s, Y) => -Math.abs(switchArg(sys, k, Y, sw)), { sw: k })
    }
  }
  // Probes that start at contact but are already separating (after a bounce) need no hysteresis
  let ahead: Pose[] | null = null
  const dt = 1e-7
  if (X) {
    const n = sys.n
    const Y = Float64Array.from(X)
    for (let k = 0; k < 3 * n; k++) Y[k] += dt * X[3 * n + k]
    ahead = computePoses(sys.model, Y)
  }
  for (const f of fns) {
    const g0 = f.value(poses, sol, X)
    f.start = g0
    f.threshold = g0 > f.eps ? 0 : Math.min(g0, 0) - f.eps
    if (f.type === 'contact' && ahead && f.threshold < 0) {
      const rate = (f.value(ahead, sol, X) - g0) / dt
      if (rate > 1e-9) f.threshold = Math.min(0, g0)
    }
  }
  return fns
}

/**
 * Smallest g − threshold over all functions: ≥ 0 while nothing has happened. `pre` is the mode solution at X
 * when the caller already has it (the last stage of the integration step).
 */
export function eventMargin(sys: System, fns: EventFn[], mode: Mode, X: Float64Array, pre?: ModeSolution): { margin: number; fired: EventFn[]; values: Float64Array } {
  const poses = pre ? pre.poses : computePoses(sys.model, X)
  const sol = pre ?? solveMode(sys, X, mode, poses)
  let margin = Infinity
  const fired: EventFn[] = []
  const values = new Float64Array(fns.length)
  fns.forEach((f, i) => {
    const g = f.value(poses, sol, X)
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
  sys: System, fns: EventFn[], mode: Mode, step: (h: number) => Float64Array, h: number, marginAtH: number,
  cached: (X: Float64Array) => ModeSolution | undefined = () => undefined
): { h: number; X: Float64Array; fired: EventFn[]; iterations: number } {
  let lo = 0, hi = h
  let flo = Infinity, fhi = marginAtH
  let Xhi = step(h)
  let firedHi = eventMargin(sys, fns, mode, Xhi, cached(Xhi)).fired
  let side = 0
  let it = 0
  // The margin at 0 is positive by construction; 1 is a nominal fallback for the secant
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
    // Keep the bracket shrinking: fall back to bisection every few iterations
    if (it % 8 === 0) mid = 0.5 * (lo + hi)
    const Xm = step(mid)
    const r = eventMargin(sys, fns, mode, Xm, cached(Xm))
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
