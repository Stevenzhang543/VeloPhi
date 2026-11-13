/**
 * 26.63 problems (D234): each question agrees with its closed form (< 0.5 %, at its own numbers and at another set),
 * and the textbook answer a student would give (bodies as points) is accepted by the problem's tolerance. The new
 * templates also build, validate and run; the misconception cases point at templates and options that exist.
 */
import { describe, expect, it } from 'vitest'
import { builtinProblem, varyParams, BUILTIN_PROBLEMS, PROBLEM_COUNT } from '../../src/teaching/problemBank'
import { PROBLEMS_2663 } from '../../src/teaching/problemBank2663'
import { isCorrect, problemParams, questionKey } from '../../src/teaching/problems'
import { META } from '../../src/teaching/problemMeta'
import { simulate } from '../../src/engine/recording'
import { recognize } from '../../src/formula/recognize'
import { TEMPLATES_2663 } from '../../src/templates/t2663'
import { TEMPLATES, buildTemplate, exactTemplates, usesNewer } from '../../src/templates'
import { validateScene } from '../../src/core/scene/io'
import { CASES, CASE_TOPICS } from '../../src/teaching/cases'
import { sceneQuantities } from '../../src/engine/observe'

type P = Record<string, number>
const DEG = Math.PI / 180
/** Exact model answers (with the bodies' radii where the template has them). */
const EXACT: Record<string, (p: P) => Record<string, number>> = {
  'c-rope-break': p => { const c0 = Math.cos(p.theta0 * DEG), c = (p.Tmax / (p.m * p.g) + 2 * c0) / 3; return { v: Math.sqrt(2 * p.g * p.L * (c - c0)), h: p.H - p.L * c, vLand: Math.sqrt(2 * p.g * (p.H - p.L * c0 - 0.03)) } },
  'c-rope-circle': p => { const v = Math.sqrt(p.Tmax * p.r / p.m); return { v, t: (v - p.v0) * p.m / p.P } },
  'p-drop-throw': p => { const t = Math.sqrt(2 * p.h / p.g); return { t, x: p.v0 * t } },
  'p-monkey': p => { const t = (Math.hypot(p.d, p.h) - 0.08) / p.v0; return { t, v: p.g * t } },
  'f-ramp-pull': p => ({ t: p.muS * p.m * p.g / p.k, a: (p.muS - p.muK) * p.g }),
  'n-two-blocks': p => ({ a: p.F / (p.mA + p.mB), N: p.F * p.mB / (p.mA + p.mB) }),
  'n-fall-drag': p => ({ vt: p.m2 * p.g / p.b, a: p.g * Math.exp(-p.b * 0.2 / p.m2) }),
  'm-big-small': p => { const vB = 2 * p.m1 * p.v0 / (p.m1 + p.m2); return { vB, I: p.m2 * vB } }
}
/** What a student computes with points instead of balls. */
const TEXTBOOK: Record<string, (p: P) => Record<string, number>> = {
  'c-rope-break': p => { const c0 = Math.cos(p.theta0 * DEG), c = (p.Tmax / (p.m * p.g) + 2 * c0) / 3; return { v: Math.sqrt(2 * p.g * p.L * (c - c0)), h: p.H - p.L * c, vLand: Math.sqrt(2 * p.g * (p.H - p.L * c0)) } },
  'p-monkey': p => { const t = Math.hypot(p.d, p.h) / p.v0; return { t, v: p.g * t } }
}

function check(spec: (typeof PROBLEMS_2663)[number], params: P, report: string[]) {
  const prob = builtinProblem(spec, params)
  const rec = simulate(prob.scene)
  expect(rec.error, spec.id).toBeNull()
  const sits = recognize(rec)
  const p = { g: 9.8, ...problemParams(prob), ...params } as P
  const want = EXACT[spec.id](p)
  const book = TEXTBOOK[spec.id]?.(p)
  for (const q of prob.questions) {
    const key = questionKey(rec, sits, q)
    expect(key.value, `${spec.id}/${q.id} ${key.note ?? ''}`).not.toBeNull()
    const rel = Math.abs(key.value! - want[q.id]) / Math.max(Math.abs(want[q.id]), 1e-12)
    report.push(`${spec.id}/${q.id}: sim ${key.value} exact ${want[q.id]} rel ${rel.toExponential(2)}`)
    expect(rel, `${spec.id}/${q.id}: sim ${key.value} vs ${want[q.id]} (${JSON.stringify(params)})`).toBeLessThan(5e-3)
    if (q.type === 'numeric') {
      expect(isCorrect(q, want[q.id], key), `${spec.id}/${q.id} the exact answer is accepted`).toBe(true)
      if (book) expect(isCorrect(q, book[q.id], key), `${spec.id}/${q.id} the textbook answer ${book[q.id]} is accepted (sim ${key.value})`).toBe(true)
    }
  }
  rec.session.free()
}

describe('26.63 problems, templates and cases', () => {
  it('every new problem agrees with its closed form, at its own numbers and at another set', () => {
    const report: string[] = []
    let seed = 2663
    const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
    for (const spec of PROBLEMS_2663) {
      expect(EXACT[spec.id], spec.id).toBeDefined()
      check(spec, spec.params, report)
      check(spec, varyParams(spec, rand), report)
    }
    expect(report.length).toBe(PROBLEMS_2663.reduce((n, s) => n + 2 * s.questions.length, 0))
  }, 300000)

  it('the bank lists them once, with categories', () => {
    expect(PROBLEMS_2663.length).toBe(8)
    expect(PROBLEM_COUNT).toBe(BUILTIN_PROBLEMS.length)
    expect(new Set(BUILTIN_PROBLEMS.map(p => p.id)).size).toBe(BUILTIN_PROBLEMS.length)
    for (const p of PROBLEMS_2663) expect(META[p.id], p.id).toBeDefined()
  })

  it('the new templates build, validate and run; the ones the reference engine cannot run are marked', () => {
    const exact = new Set(exactTemplates().map(t => t.id))
    expect(TEMPLATES_2663.length).toBe(7)
    for (const t of TEMPLATES_2663) {
      const s = buildTemplate(t.id)
      expect(() => validateScene(s), t.id).not.toThrow()
      expect(s.watch.length, t.id).toBeGreaterThan(0)
      // every watched quantity exists
      const ids = new Set(sceneQuantities(s).map(q => q.id))
      for (const w of s.watch) expect(ids.has(w), `${t.id}: ${w}`).toBe(true)
      expect(exact.has(t.id), t.id).toBe(!usesNewer(s))
      const rec = simulate(s, { duration: 0.5 })
      expect(rec.error, t.id).toBeNull()
      rec.session.free()
    }
    for (const id of ['rope-break-pendulum', 'rope-break-circle']) expect(usesNewer(buildTemplate(id)), id).toBe(true)
    for (const id of ['drop-vs-throw', 'fall-two-masses', 'monkey-hunter', 'ramp-pull', 'two-blocks-push']) expect(usesNewer(buildTemplate(id)), id).toBe(false)
  })

  it('every misconception case opens a template that exists, with its values, chart and one right option', () => {
    const topics = new Set(CASE_TOPICS.map(t => t.id))
    expect(CASES.length).toBeGreaterThanOrEqual(16)
    expect(new Set(CASES.map(c => c.id)).size).toBe(CASES.length)
    for (const c of CASES) {
      expect(topics.has(c.topic), c.id).toBe(true)
      const t = TEMPLATES.find(x => x.id === c.template)
      expect(t, `${c.id}: template ${c.template}`).toBeTruthy()
      for (const k of Object.keys(c.values ?? {})) expect(t!.params.some(p => p.key === k), `${c.id}: parameter ${k}`).toBe(true)
      expect(c.options.length, c.id).toBeGreaterThanOrEqual(2)
      expect(c.options.length, c.id).toBeLessThanOrEqual(4)
      expect(c.answer >= 0 && c.answer < c.options.length, c.id).toBe(true)
      for (const tri of [c.title, c.belief, c.physics, c.watch, c.question, ...c.options]) for (const lang of ['zh', 'en', 'de'] as const) expect(tri[lang].length, `${c.id} ${lang}`).toBeGreaterThan(0)
      const scene = buildTemplate(c.template, c.values ?? {})
      const ids = new Set(sceneQuantities(scene).map(q => q.id))
      for (const q of c.chart ?? []) expect(ids.has(q), `${c.id}: chart ${q}`).toBe(true)
    }
  })

  it('the cases\' answers are what the engine computes', () => {
    const run = (id: string) => { const c = CASES.find(x => x.id === id)!; return simulate(buildTemplate(c.template, c.values ?? {})) }
    // heavy and light: together without drag, the heavy one first with drag
    const t = (rec: ReturnType<typeof simulate>, body: string) => rec.events.find(e => e.changes.some(ch => (ch.type === 'impact' || ch.type === 'touch') && ch.bodies.includes(body)))?.t ?? NaN
    let rec = run('case-heavy-light'); expect(Math.abs(t(rec, 'heavy') - t(rec, 'light'))).toBeLessThan(1e-9); rec.session.free()
    rec = run('case-heavy-light-air'); expect(t(rec, 'heavy')).toBeLessThan(t(rec, 'light') - 0.05); rec.session.free()
    rec = run('case-drop-throw'); expect(Math.abs(t(rec, 'A') - t(rec, 'B'))).toBeLessThan(1e-9); rec.session.free()
    rec = run('case-monkey'); expect(rec.events.some(e => e.changes.some(ch => ch.bodies.includes('bullet') && ch.bodies.includes('monkey')))).toBe(true); rec.session.free()
    rec = run('case-string-breaks'); expect(rec.events.some(e => e.changes.some(ch => ch.type === 'break'))).toBe(true); rec.session.free()
    rec = run('case-top-of-loop'); expect(rec.events.some(e => e.changes.some(ch => ch.type === 'slack'))).toBe(true); rec.session.free()
  })
})
