/**
 * 26.59 problem bank (D171; fix D185): 82 built-in problems in 14 chapters, every one with categories; each new problem's
 * questions checked against independent analytic values (closed-form physics, not the engine's formula library),
 * at the problem's own parameters and at a second set from its `vary` ranges.
 */
import { describe, expect, it } from 'vitest'
import { BUILTIN_PROBLEMS, builtinProblem, varyParams } from '../../src/teaching/problemBank'
import { PROBLEMS_2659 } from '../../src/teaching/problemBank2659'
import { META } from '../../src/teaching/problemMeta'
import { CHAPTERS, isCorrect, ptext, problemParams, questionKey } from '../../src/teaching/problems'
import { CATEGORY_TYPES } from '../../src/ai/import/catalog'
import { simulate } from '../../src/engine/recording'
import { recognize } from '../../src/formula/recognize'

const DEG = Math.PI / 180
const K = 8.9875517923e9
type P = Record<string, number>
const sq = (x: number) => x * x

/** Analytic answers by problem and question id (parameters in the templates' display units). */
const ANALYTIC: Record<string, (p: P) => Record<string, number>> = {
  'k-pursuit': p => ({ max: p.d + sq(p.v) / (2 * p.a), gap1: p.d + p.v - p.a / 2 }),
  'k-slope-up': p => {
    const th = p.theta * DEG, up = p.g * (Math.sin(th) + p.muK * Math.cos(th)), dn = p.g * (Math.sin(th) - p.muK * Math.cos(th)), t = -p.v0 / up
    return { t, v1: dn * (1 - t) }
  },
  'f-two-ropes': p => ({ T1: p.m * p.g * Math.sin(p.beta * DEG) / Math.sin((p.alpha + p.beta) * DEG), T2: p.m * p.g * Math.sin(p.alpha * DEG) / Math.sin((p.alpha + p.beta) * DEG) }),
  'f-wheel-axle': p => ({ F: p.m * p.g * p.r / p.R }),
  'f-incline-stick': p => ({ f: p.m * p.g * Math.sin(p.theta * DEG), N: p.m * p.g * Math.cos(p.theta * DEG) }),
  'n-incline-pulley': p => {
    const th = p.theta * DEG, a = p.g * (p.m2 - p.m1 * Math.sin(th) - p.mu * p.m1 * Math.cos(th)) / (p.m1 + p.m2)
    return { a, T: p.m2 * (p.g - a) }
  },
  'n-movable-pulley': p => ({ a1: 2 * p.g * Math.abs(p.m2 - 2 * p.m1) / (p.m2 + 4 * p.m1), T: 3 * p.m1 * p.m2 * p.g / (4 * p.m1 + p.m2) }),
  'n-elevator': p => ({ F: p.m * p.F / (p.M + p.m) }),
  'n-conveyor-incline': p => {
    const th = p.theta * DEG, a1 = p.g * (Math.sin(th) + p.mu * Math.cos(th)), a2 = p.g * (Math.sin(th) - p.mu * Math.cos(th)), t = p.u / a1
    return { t, v: p.u + a2 * (1 - t) }
  },
  'n-variable-force': p => ({ v: 2 * p.F0 / (p.m * p.omega) }),
  'n-pull-angle': p => {
    const a = p.alpha * DEG, N = p.m * p.g - p.F * Math.sin(a)
    return { N, a: (p.F * Math.cos(a) - p.mu * N) / p.m }
  },
  'p-top-speed': p => ({ vland: p.v0, t: 2 * p.v0 * Math.sin(p.alpha * DEG) / p.g }),
  'p-throw-down': p => {
    const vy = p.v0 * Math.sin(-p.alpha * DEG)
    return { v: Math.sqrt(sq(p.v0) + 2 * p.g * p.h), t: (-vy + Math.sqrt(sq(vy) + 2 * p.g * p.h)) / p.g }
  },
  'p-slope': p => {
    const th = p.theta * DEG, t = (2 * p.v0 * Math.tan(th)) / p.g
    return { t, AB: (p.v0 * t) / Math.cos(th), v: Math.hypot(p.v0, p.g * t) }
  },
  'e-efficiency': p => {
    const th = p.theta * DEG
    return { F: p.m * p.g * (Math.sin(th) + p.mu * Math.cos(th)), eta: Math.sin(th) / (Math.sin(th) + p.mu * Math.cos(th)) }
  },
  'e-slider-stop': p => { const v = Math.sqrt(2 * p.g * p.L * Math.sin(p.theta * DEG)); return { v, v2: p.e * v } },
  'e-bounce-loss': p => ({ loss: (1 - sq(p.e)) * p.m * p.g * p.h }),
  'e-slope-heat': p => {
    const th = p.theta * DEG, s = sq(p.v0) / (2 * p.g * (Math.sin(th) + p.muK * Math.cos(th)))
    return { Q: p.muK * p.m * p.g * Math.cos(th) * s }
  },
  'g-binary': p => {
    const w = Math.sqrt((p.M1 + p.M2) / p.d ** 3)
    return { v1: w * p.d * p.M2 / (p.M1 + p.M2), v2: w * p.d * p.M1 / (p.M1 + p.M2) }
  },
  'g-kepler': p => ({ v1: Math.sqrt(p.M / p.r1), v2: Math.sqrt(p.M / p.r2) }),
  'g-cosmic': p => { const r = p.R + 0.031; return { v: Math.sqrt(p.M / r), F: p.M / sq(r) } },
  'm-three-balls': p => ({ vC: p.v0 }),
  'm-pendulums': p => {
    const v = Math.sqrt(2 * p.g * p.L * (1 - Math.cos(p.theta0 * DEG)))
    return { vB: 2 * p.m1 * v / (p.m1 + p.m2), vA: Math.abs(p.m1 - p.m2) * v / (p.m1 + p.m2) }
  },
  'm-oblique': p => ({ vB: p.v0 * Math.sqrt(1 - sq(p.b / 0.2)) }),
  'm-bounce': p => ({ v: Math.sqrt(0.16 + sq(p.e) * 2 * p.g * p.h), t: Math.sqrt(2 * p.h / p.g) }),
  'o-vertical-spring': p => ({ vmax: p.A * Math.sqrt(p.k / p.m), Fmax: p.m * p.g + p.k * p.A }),
  'o-physical': p => ({ w: Math.sqrt(3 * p.g * (1 - Math.cos(p.theta0 * DEG)) / p.L) }),
  'o-resonance': p => ({ F: p.k * p.F0 / (p.c * p.omega) }),
  'r-motor-disc': p => ({ w: 2 * p.M * 1.5 / (p.m * sq(p.r)) }),
  'r-gears': p => { const I = 0.5 * p.mA * sq(p.rA) + 0.5 * p.mB * sq(p.rB) * sq(p.rA / p.rB); return { wA: p.M / I } },
  'r-rolling-resistance': p => ({ t: p.v0 / (p.crr * p.g * 2 / 3) }),
  'r-ball-rod': p => { const w = p.m * p.v0 * p.d / (p.M * sq(p.L) / 3 + p.m * sq(p.d)); return { v: w * p.d } },
  'es-coulomb': p => { const F = K * p.q1 * 1e-6 * p.q2 * 1e-6 / sq(p.d); return { F, a: F / (p.m1 * 1e-3) } },
  'es-deflection': p => {
    const a = p.q * 1e-3 * p.E / (p.m * 1e-3), t = (p.L + 0.47) / p.v0
    return { v: Math.hypot(p.v0, a * t), F: p.q * 1e-3 * p.E }
  },
  'es-oscilloscope': p => {
    const qm = p.q / p.m, v0 = Math.sqrt(2 * qm * p.U1), vy = qm * p.U2 / p.d * (p.L / v0)
    return { v0, v: Math.hypot(v0, vy) }
  },
  'es-charged-pendulum': p => {
    const m = p.m * 1e-3, qE = p.q * 1e-3 * p.E, th = Math.atan2(qE, m * p.g), g2 = Math.hypot(p.g, qE / m)
    return { T: m * g2 * (3 - 2 * Math.cos(th)) }
  },
  'es-oil-drop': p => ({ v: (p.m * 1e-3 * p.g - p.q * 1e-3 * p.E) / p.b }),
  'mg-circle': p => ({ F: p.q * 1e-3 * p.v * p.B, a: p.q * p.v * p.B / p.m }),
  'mg-selector': p => ({ FE: p.q * 1e-3 * p.E, FB: p.q * 1e-3 * p.v0 * p.B }),
  'mg-spectrometer': p => ({ v1: Math.sqrt(2 * p.q * p.U / p.m1), v2: Math.sqrt(2 * p.q * p.U / p.m2) }),
  'mg-bounded': p => { const r = p.m * p.v / (p.q * p.B); return { t: (0.4 * r + 0.1) / p.v + Math.PI * r / p.v } },
  'mg-round': p => { const r = p.m * p.v / (p.q * p.B), phi = 2 * Math.atan(p.R / r); return { t: 1 / p.v + phi * r / p.v } },
  'mg-combo': p => ({ v: Math.hypot(p.v0, p.q * p.E * p.L / (p.m * p.v0)) }),
  'in-rail-force': p => { const k = sq(p.B * p.L) / p.R; return { v: p.F / k, I: p.F / (p.B * p.L) } },
  'in-rail-coast': p => { const tau = p.m * p.R / sq(p.B * p.L); return { v: p.v0 * Math.exp(-1 / tau), Q: 0.5 * p.m * sq(p.v0) } },
  'in-rail-fall': p => { const v = p.m * p.g * p.R / sq(p.B * p.L); return { v, emf: p.B * p.L * v } },
  'fl-floating': p => { const V = 0.2 * 0.1 * p.d; return { Fb: p.rhoB * V * p.g, V: p.rhoB * V / p.rho } },
  'fl-sinking': p => ({ a: p.g * (1 - p.rho / p.rhoB) }),
  'fl-weigh': p => { const V = 0.1 * 0.1 * p.d; return { Fb: p.rho * V * p.g, F: (p.rhoB - p.rho) * V * p.g } },
  'fl-boat': p => { const M = 250 * 0.8 * 0.12 * p.d; return { Fb: (M + p.m) * p.g, V: (M + p.m) / p.rho } },
  'fl-rising': p => ({ a: p.g * (p.rho / p.rhoB - 1) }),
  'fl-densities': p => { const V = 0.16 * 0.12 * p.d; return { Fb: p.rho * V * p.g, V: 600 * V / p.rho } }
}
/** Answers that reach the analytic value only asymptotically (transients, settling). */
const LOOSE: Record<string, number> = { 'o-resonance/F': 0.02 }

function check(spec: (typeof PROBLEMS_2659)[number], params: P, report: string[]) {
  const prob = builtinProblem(spec, params)
  const rec = simulate(prob.scene)
  expect(rec.error, spec.id).toBeNull()
  const sits = recognize(rec)
  const p = { ...problemParams(prob), ...params } as P
  if (p.g === undefined) p.g = 9.8
  const want = ANALYTIC[spec.id](p)
  for (const q of prob.questions) {
    const key = questionKey(rec, sits, q)
    expect(key.value, `${spec.id}/${q.id} ${key.note ?? ''}`).not.toBeNull()
    const w = want[q.id]
    expect(w, `${spec.id}/${q.id} has an analytic value`).toBeDefined()
    const rel = Math.abs(key.value! - w) / Math.max(Math.abs(w), 1e-12)
    report.push(`${spec.id}/${q.id}: sim ${key.value} analytic ${w} rel ${rel.toExponential(2)}`)
    expect(rel, `${spec.id}/${q.id}: sim ${key.value} vs ${w} (${JSON.stringify(params)})`).toBeLessThan(LOOSE[`${spec.id}/${q.id}`] ?? 0.01)
    if (q.type === 'numeric') expect(isCorrect(q, w, key), `${spec.id}/${q.id} the analytic answer is accepted`).toBe(true)
  }
}

describe('26.59 problem bank', () => {
  it('has 82 problems in 14 chapters, each with categories from the shared vocabulary', () => {
    expect(BUILTIN_PROBLEMS).toHaveLength(82)
    expect(new Set(BUILTIN_PROBLEMS.map(p => p.id)).size).toBe(82)
    const chapters = new Set(BUILTIN_PROBLEMS.map(p => p.chapter))
    expect(chapters.size).toBe(14)
    for (const c of chapters) expect(CHAPTERS.some(x => x.id === c), c).toBe(true)
    for (const p of BUILTIN_PROBLEMS) {
      const m = META[p.id]
      expect(m, p.id).toBeDefined()
      expect(m.types.length, p.id).toBeGreaterThan(0)
      for (const t of m.types) expect(CATEGORY_TYPES, `${p.id}: ${t}`).toContain(t)
      for (const lang of ['zh', 'en', 'de'] as const) {
        expect(ptext(p.title, lang).length, `${p.id} title ${lang}`).toBeGreaterThan(1)
        expect(ptext(p.stem, lang, Object.fromEntries(Object.entries(p.params).map(([k, v]) => [k, String(v)]))), `${p.id} stem ${lang}`).not.toMatch(/\{(?!g\})\w+\}/)
      }
    }
    for (const id of Object.keys(ANALYTIC)) expect(PROBLEMS_2659.some(p => p.id === id), id).toBe(true)
  })

  it('every new problem agrees with its analytic answers (< 1 %), at its own numbers and at another set', () => {
    const report: string[] = []
    let seed = 2659
    const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
    for (const spec of PROBLEMS_2659) {
      expect(ANALYTIC[spec.id], `${spec.id} has analytic answers`).toBeDefined()
      check(spec, spec.params, report)
      check(spec, varyParams(spec, rand), report)
    }
    expect(report.length).toBeGreaterThan(150)
  }, 300000)
})
