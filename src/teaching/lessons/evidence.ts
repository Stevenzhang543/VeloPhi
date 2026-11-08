/**
 * The evidence of the classroom experiments (26.61, phase B): every number a lesson shows or grades against comes from
 * the engine (a run of the lesson's scene) or the model registry — and is checked against the textbook rule with
 * |sim − ref| ≤ atol + rtol·|ref| (the same rule as the reference suite, tests/reference2661.test.ts).
 */
import { buildTemplate } from '../../templates'
import { simulate } from '../../engine/recording'
import type { Recording } from '../../engine/recording'
import { recognize } from '../../formula/recognize'
import { evaluateProblemTarget } from '../problems'
import type { ProblemTarget } from '../problems'
import { evalModel } from '../../engine/models'
import { parseMeasuredCsv, rmsDeviation, seriesFrom, unitOptionFor } from '../../analysis/measured'
import type { MeasuredSeries } from '../../analysis/measured'

/** |x − ref| ≤ atol + rtol·|ref|. */
export const close = (x: number, ref: number, rtol: number, atol = 0) => Math.abs(x - ref) <= atol + rtol * Math.abs(ref)

function read(rec: Recording, target: ProblemTarget): number | null {
  try {
    const v = evaluateProblemTarget(rec, recognize(rec), target).sim
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  } catch { return null }
}

// ---- act-static: the threshold tan θ = μs on a fixed incline ----

export interface StaticEvidence {
  theta: number; muS: number; muK: number
  /** Critical angle arctan μs (degrees). */
  thetaC: number
  /** The rule: tan θ ≤ μs (stays at rest). */
  ruleStays: boolean
  /** The engine: the block did not slide in the run. */
  engineStays: boolean
  /** Time of the first "starts to slide" (null: none; a block released on a too steep slope slides from t = 0). */
  slipAt: number | null
  /** Friction at t = 0.2 s against mg sin θ (at rest) or μk N (sliding), N. */
  friction: number | null
  expected: number
  /** Speed along the slope at t = 1 s (m/s). */
  speed: number | null
  /** |tan θ − μs| below this: the run is judged with the tolerance (near the threshold). */
  nearThreshold: boolean
  agrees: boolean
}

export function staticEvidence(theta: number, muS = 0.5, muK = 0.4, m = 2, g = 9.8): StaticEvidence {
  const scene = buildTemplate('incline-friction', { theta, muS, muK, m, g, v0: 0 })
  scene.settings.duration = 1.2
  const rec = simulate(scene, { duration: 1.2 })
  const th = theta * Math.PI / 180
  const ruleStays = Math.tan(th) <= muS
  const speed = read(rec, { kind: 'quantity', id: 'custom.vs', t: 1 })
  const friction = read(rec, { kind: 'quantity', id: 'contact.block|incline.f', t: 0.2 })
  const slip = rec.events.find(e => e.changes.some(c => c.type === 'slip'))
  const engineStays = speed !== null && Math.abs(speed) < 1e-3
  const expected = ruleStays ? m * g * Math.sin(th) : muK * m * g * Math.cos(th)
  const nearThreshold = Math.abs(Math.tan(th) - muS) < 1e-3
  const agrees = nearThreshold || (engineStays === ruleStays && friction !== null && close(Math.abs(friction), expected, 1e-3, 1e-6))
  return { theta, muS, muK, thetaC: Math.atan(muS) * 180 / Math.PI, ruleStays, engineStays, slipAt: slip ? slip.t : engineStays ? null : 0, friction, expected, speed, nearThreshold, agrees }
}

// ---- act-collision: before and after one elastic impact ----

export interface CollisionEvidence {
  m1: number; m2: number; u1: number
  before: { vA: number | null; vB: number | null; p: number | null; ek: number | null }
  after: { vA: number | null; vB: number | null; p: number | null; ek: number | null }
  /** Textbook: v₁' = (m₁ − m₂)u₁/(m₁ + m₂), v₂' = 2m₁u₁/(m₁ + m₂). */
  ref: { vA: number; vB: number; p: number; ek: number }
  agrees: boolean
}

export function collisionEvidence(m2: number, m1 = 1, u1 = 3): CollisionEvidence {
  const rec = simulate(buildTemplate('collision-1d', { m1, m2, v0: u1, e: 1 }), { duration: 1.5 })
  const side = (s: 'before' | 'after') => {
    const at = (id: string) => read(rec, { kind: 'atEvent', id, event: 'impact', side: s, body: null })
    return { vA: at('A.vx'), vB: at('B.vx'), p: at('system.px'), ek: at('system.ek') }
  }
  const before = side('before'), after = side('after')
  const ref = { vA: (m1 - m2) * u1 / (m1 + m2), vB: 2 * m1 * u1 / (m1 + m2), p: m1 * u1, ek: 0.5 * m1 * u1 * u1 }
  const ok = (v: number | null, r: number) => v !== null && close(v, r, 1e-6, 1e-9)
  const agrees = ok(after.vA, ref.vA) && ok(after.vB, ref.vB) && ok(after.p, ref.p) && ok(before.p, ref.p) && ok(after.ek, ref.ek) && ok(before.ek, ref.ek)
  return { m1, m2, u1, before, after, ref, agrees }
}

// ---- act-rc: t = RC → 63.2 %, and a measured CSV ----

export interface RcEvidence { R: number; C: number; Vs: number; tau: number; atTau: number; ratio: number; agrees: boolean }

export function rcEvidence(R: number, C: number, Vs = 5): RcEvidence {
  const r = evalModel('E15', { R, C, Vs, V0: 0, t: R * C })
  const out = (id: string) => r.outputs.find(o => o.id === id)?.value ?? NaN
  const tau = out('tau'), atTau = out('VC')
  const ratio = atTau / Vs
  return { R, C, Vs, tau, atTau, ratio, agrees: close(tau, R * C, 1e-12) && close(ratio, 1 - Math.exp(-1), 1e-9) }
}

/**
 * The sample measurement of the lesson (clearly a sample: synthetic, deterministic noise of ±1.5 % of Vs): time in ms,
 * voltage in V, a column the class should not map (current in mA). R = 1 kΩ, C = 100 μF, Vs = 5 V.
 */
export function sampleRcCsv(R = 1000, C = 1e-4, Vs = 5): string {
  let seed = 11
  const noise = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647 - 0.5) * 0.03 * Vs }
  const lines = ['# VeloPhi sample data (synthetic): RC charging, R = 1 kΩ, C = 100 μF, Vs = 5 V', 'time (ms),U_C (V),I (mA)']
  for (let k = 0; k <= 50; k++) {
    const t = k * 0.01
    const v = Vs * (1 - Math.exp(-t / (R * C)))
    lines.push(`${(t * 1000).toFixed(0)},${(v + (k ? noise() : 0)).toFixed(4)},${((Vs - v) / R * 1000).toFixed(4)}`)
  }
  return lines.join('\n')
}

export interface CsvFit {
  series: MeasuredSeries
  /** τ read where the measured voltage crosses 63.2 % of the source voltage (linear interpolation), s. */
  tau: number | null
  /** RMS deviation from the model V(t) = Vs(1 − e^(−t/RC)) with the lesson's R and C, V. */
  rms: number | null
  n: number
}

/** Map two columns of a measured CSV (time, voltage) with their units and compare with the model. */
export function fitRcCsv(text: string, timeCol: number, voltCol: number, R = 1000, C = 1e-4, Vs = 5): CsvFit {
  const table = parseMeasuredCsv(text)
  const tu = unitOptionFor('s', table.columns[timeCol]?.unit ?? '')
  const vu = unitOptionFor('V', table.columns[voltCol]?.unit ?? '')
  const series = seriesFrom(table, timeCol, voltCol, 'uc', 'U_C', 'V', tu, vu)
  const target = Vs * (1 - Math.exp(-1))
  let tau: number | null = null
  for (let i = 1; i < series.t.length; i++) {
    const a = series.v[i - 1], b = series.v[i]
    if (a < target && b >= target) { tau = series.t[i - 1] + (target - a) / (b - a) * (series.t[i] - series.t[i - 1]); break }
  }
  const simT = series.t, simV = series.t.map(t => Vs * (1 - Math.exp(-t / (R * C))))
  const d = rmsDeviation(series, simT, simV)
  return { series, tau, rms: d?.rms ?? null, n: d?.n ?? 0 }
}

// ---- Verdicts of the lesson questions (decided by the evidence) ----

/** The right option of a predict or explain step. */
export function rightOption(lesson: string, step: 'predict' | 'explain'): string {
  if (lesson === 'lesson-static') return step === 'predict' ? (staticEvidence(28).engineStays ? 'stay' : 'slide') : 'tan'
  if (lesson === 'lesson-collision') {
    if (step === 'explain') return 'kept'
    const v = collisionEvidence(2).after.vA ?? 0
    return v > 1e-9 ? 'forward' : v < -1e-9 ? 'back' : 'stop'
  }
  if (step === 'predict') return rcEvidence(2000, 1e-4).tau > rcEvidence(1000, 1e-4).tau * 1.5 ? 'double' : 'same'
  return 'ratio'
}

/** The answer of a transfer step (in the step's unit). */
export function transferAnswer(lesson: string): number {
  if (lesson === 'lesson-static') return Math.atan(0.7) * 180 / Math.PI
  if (lesson === 'lesson-collision') return collisionEvidence(2, 2, 1.5).after.vB ?? NaN
  return rcEvidence(2200, 4.7e-5).tau
}
