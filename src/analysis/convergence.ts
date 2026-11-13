/**
 * Convergence study of a scene (26.63, D237; research preview): the same scene, the same time T, computed with one
 * fixed-step method at steps h, h/2, h/4, … and compared with the exact event-driven solver at tight tolerances. For
 * each step it reports the value of one quantity at T, its error against the reference, the observed order
 * p = log₂(e(h)/e(h/2)), the self-convergence order from three successive runs (no reference needed), and the largest
 * drift of the mechanical energy. The engine computes every value; this module forms differences and orders, and
 * writes the manifest that makes the study repeatable (scene fingerprint, engine version, method, steps, tolerances).
 *
 * What to expect: explicit Euler and the two time-stepping solvers (Moreau–Jean, the many-body solver) are first
 * order; classical RK4 and the two-stage Gauss method are fourth order while the motion is smooth — an impact or
 * another event inside the interval is located and handled exactly, so it does not reduce the order of rk4/gauss4,
 * but it does limit the time-stepping solvers, which resolve events only to a step.
 */
import type { IntegratorKind, Scene } from '../core/scene/types'
import { ENGINE_VERSION } from '../core/scene/types'
import { simulate } from '../engine/recording'
import type { Recording } from '../engine/recording'
import { valuesAtFrame, quantitySeries } from '../engine/observe'

export type StudyMethod = Exclude<IntegratorKind, 'dopri5'>
/** Formal order of each method for smooth motion. */
export const FORMAL_ORDER: Record<StudyMethod, number> = { euler: 1, rk4: 4, gauss4: 4, moreau: 1, softstep: 1 }
/** Differences below this (relative to the value's scale) are rounding, not discretisation error. */
export const ROUNDING = 5e-13

export interface StudyRow {
  h: number
  steps: number
  value: number
  /** |value − reference|. */
  error: number
  /** log₂(error(2h)/error(h)); null for the first row and once the error is near the reference's own accuracy. */
  order: number | null
  /** log₂(|v(4h) − v(2h)| / |v(2h) − v(h)|); null where it cannot be formed. */
  selfOrder: number | null
  /** Largest |E(t) − E(0)| of the mechanical energy over the run (J); null when the scene has none to report. */
  drift: number | null
  ms: number
  /** Events the run reported. */
  events: number
}
export interface Study {
  method: StudyMethod
  quantity: string
  t: number
  /** `accuracy`: the reference's own error, estimated as its difference from a run at tolerances 100 times looser. */
  reference: { value: number; relTol: number; absTol: number; events: number; hash: string | null; accuracy: number }
  rows: StudyRow[]
  /** Observed order at the finest steps (the last row that has one; null: the error is at rounding level). */
  order: number | null
  /** The order has stopped changing with the step (the last two agree within 0.3): the asymptotic range is reached. */
  settled: boolean
  formal: number
  /** The energy of the scene is not conserved by the physics itself (friction, drag, drives, plastic impacts). */
  dissipative: boolean
  manifest: Record<string, unknown>
}

export interface StudyOptions {
  method: StudyMethod
  /** Quantity id (see observe: `ball.x`, `rope.T`, `system.e`, …). */
  quantity: string
  /** Time at which the quantity is compared (s). */
  t: number
  /** Coarsest step (s); T must be a whole number of these. */
  h0: number
  /** Number of steps h0, h0/2, … (2–8). */
  levels: number
  /** Called before each run (label, index, count): the dialog's progress line. */
  onRun?: (label: string, k: number, n: number) => void
}

const clone = (s: Scene): Scene => { const c = JSON.parse(JSON.stringify(s)) as Scene; if (c.branches) delete c.branches; return c }

/** The scene as one run of the study computes it. */
export function studyScene(scene: Scene, method: IntegratorKind, h: number, t: number, loose = false): Scene {
  const s = clone(scene)
  s.settings.integrator = method
  s.settings.outputStep = h
  s.settings.duration = t
  s.settings.stopAt = null
  if (method === 'dopri5') { s.settings.relTol = loose ? 1e-10 : 1e-12; s.settings.absTol = loose ? 1e-12 : 1e-14 }
  // the many-body solver: one sub-step per step, no sleeping (a sleeping body is not a discretisation error)
  if (method === 'softstep') s.settings.softStep = { stepHz: 1 / h, substeps: 1, sleep: false }
  return s
}

function energyDrift(rec: Recording): number | null {
  try {
    const stride = Math.max(1, Math.floor(rec.frameCount / 400))
    const e = quantitySeries(rec, ['system.e'], 0, rec.frameCount - 1, stride).values[0]
    if (!e || !e.length || !Number.isFinite(e[0])) return null
    let d = 0
    for (let i = 1; i < e.length; i++) d = Math.max(d, Math.abs(e[i] - e[0]))
    return d
  } catch { return null }
}

const lastValue = (rec: Recording, id: string) => valuesAtFrame(rec, rec.frameCount - 1, [id])[0]

/** Steps the study will use, coarsest first (T/h0 rounded to a whole number of steps). */
export function studySteps(t: number, h0: number, levels: number): number[] {
  const n0 = Math.max(1, Math.round(t / h0))
  return Array.from({ length: Math.max(2, Math.min(8, Math.round(levels))) }, (_, k) => t / (n0 * 2 ** k))
}

/** Run the study (synchronous; a few runs of the scene). Throws with the engine's message when a run fails. */
export function convergenceStudy(scene: Scene, o: StudyOptions): Study {
  const steps = studySteps(o.t, o.h0, o.levels)
  o.onRun?.('reference', 0, steps.length + 1)
  const refScene = studyScene(scene, 'dopri5', steps[0], o.t)
  const ref = simulate(refScene, { duration: o.t, maxSteps: 20_000_000 })
  if (ref.error) { const m = String((ref.error as { key?: string }).key ?? ref.error); ref.session.free(); throw new Error(m) }
  const refValue = lastValue(ref, o.quantity)
  const refDrift = energyDrift(ref)
  const refEvents = ref.events.length, refHash = ref.hash ?? null
  ref.session.free()
  if (!Number.isFinite(refValue)) throw new Error(`quantity ${o.quantity} has no value at t = ${o.t}`)
  const scale = Math.max(Math.abs(refValue), 1e-9)
  // How good is the reference itself? The same run at tolerances 100 times looser differs from it by about the looser
  // run's error — an upper estimate of the reference's. Errors near it say nothing about the method any more.
  const loose = simulate(studyScene(scene, 'dopri5', steps[0], o.t, true), { duration: o.t, maxSteps: 20_000_000 })
  const accuracy = loose.error ? 0 : Math.abs(lastValue(loose, o.quantity) - refValue)
  loose.session.free()
  const floor = Math.max(ROUNDING * scale, 3 * accuracy)
  const reference = { value: refValue, relTol: 1e-12, absTol: 1e-14, events: refEvents, hash: refHash, accuracy }
  const rows: StudyRow[] = []
  steps.forEach((h, k) => {
    o.onRun?.(`h = ${h}`, k + 1, steps.length + 1)
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0
    const rec = simulate(studyScene(scene, o.method, h, o.t), { duration: o.t, maxSteps: 20_000_000 })
    const ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0
    if (rec.error) { const m = String((rec.error as { key?: string }).key ?? rec.error); rec.session.free(); throw new Error(m) }
    const value = lastValue(rec, o.quantity)
    const error = Math.abs(value - refValue)
    const prev = rows[k - 1], prev2 = rows[k - 2]
    const order = prev && prev.error > floor && error > floor ? Math.log2(prev.error / error) : null
    const d1 = prev && prev2 ? Math.abs(prev2.value - prev.value) : 0, d2 = prev ? Math.abs(prev.value - value) : 0
    const selfOrder = prev && prev2 && d1 > ROUNDING * scale && d2 > ROUNDING * scale ? Math.log2(d1 / d2) : null
    rows.push({ h, steps: Math.round(o.t / h), value, error, order, selfOrder, drift: energyDrift(rec), ms, events: rec.events.length })
    rec.session.free()
  })
  const orders = rows.map(r => r.order).filter((p): p is number => p !== null && Number.isFinite(p))
  // The exact run's own drift tells whether the scene conserves energy at all
  const dissipative = refDrift !== null && refDrift > 1e-7 * Math.max(1, Math.abs(refValue))
  return {
    method: o.method, quantity: o.quantity, t: o.t, reference, rows,
    order: orders.length ? orders[orders.length - 1] : null,
    settled: orders.length >= 2 && Math.abs(orders[orders.length - 1] - orders[orders.length - 2]) <= 0.3,
    formal: FORMAL_ORDER[o.method], dissipative,
    manifest: {
      format: 'velophi-convergence', version: 1, engine: ENGINE_VERSION, scene: scene.name, sceneHash: reference.hash,
      method: o.method, quantity: o.quantity, t: o.t, steps,
      reference: { integrator: 'dopri5', relTol: 1e-12, absTol: 1e-14, value: refValue, events: reference.events, accuracy },
      softStep: o.method === 'softstep' ? { substeps: 1, sleep: false } : undefined,
      rows: rows.map(r => ({ h: r.h, steps: r.steps, value: r.value, error: r.error, order: r.order, selfOrder: r.selfOrder, energyDrift: r.drift, events: r.events }))
    }
  }
}

/** The study as CSV (one row per step; the reference in the header lines). */
export function studyCsv(s: Study): string {
  const head = [`# VeloPhi ${ENGINE_VERSION} convergence study`, `# method,${s.method}`, `# quantity,${s.quantity}`, `# t,${s.t}`, `# reference (dopri5 rtol 1e-12 atol 1e-14),${s.reference.value}`, 'h,steps,value,error,order,self_order,energy_drift,events']
  const f = (v: number | null) => (v === null || !Number.isFinite(v) ? '' : String(v))
  return [...head, ...s.rows.map(r => [r.h, r.steps, r.value, r.error, f(r.order), f(r.selfOrder), f(r.drift), r.events].join(','))].join('\n') + '\n'
}
