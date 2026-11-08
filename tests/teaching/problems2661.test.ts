/**
 * 26.61 problems: each question agrees with its closed form (< 0.5 %, at its own numbers and at another set), and the
 * textbook answer a student would give (the ball as a point, R the track radius) is accepted by the problem's 2 %
 * rule — the arc problems keep R large against the 3 cm ball. The new templates also load in the gallery's form.
 */
import { describe, expect, it } from 'vitest'
import { builtinProblem, varyParams } from '../../src/teaching/problemBank'
import { PROBLEMS_2661 } from '../../src/teaching/problemBank2661'
import { isCorrect, problemParams, questionKey } from '../../src/teaching/problems'
import { simulate } from '../../src/engine/recording'
import { recognize } from '../../src/formula/recognize'
import { TEMPLATES_2661 } from '../../src/templates/t2661'
import { buildTemplate, exactTemplates, usesNewer } from '../../src/templates'
import { validateScene } from '../../src/core/scene/io'

type P = Record<string, number>
const sq = (x: number) => x * x
const r = 0.03
/** Exact model answers (with the ball's radius where the template has one) and the textbook answers (point, R). */
const EXACT: Record<string, (p: P) => Record<string, number>> = {
  'e-spring-drop': p => { const mg = p.m * p.g; return { x: (mg + Math.sqrt(mg * mg + 2 * p.k * mg * p.h)) / p.k, v: Math.sqrt(2 * p.g * p.h + p.m * sq(p.g) / p.k) } },
  'e-spring-launch': p => ({ H: p.k * sq(p.x) / (2 * p.m * p.g), v: Math.sqrt(p.k * sq(p.x) / p.m - 2 * p.g * p.x) }),
  'c-dome': p => { const h = (2 * p.R + sq(p.v0) / p.g) / 3; return { h, v: Math.sqrt(p.g * h) } },
  'p-wall': p => { const t = p.d / p.v0; return { t, v: Math.hypot(p.v0, p.g * t) } },
  'c-arc-slide': p => ({ v: Math.sqrt(2 * p.g * (p.R - r)), N: 3 * p.m * p.g }),
  'c-loop': p => ({ vTop: Math.sqrt(sq(p.v0) - 4 * p.g * (p.R - r)), Nb: p.m * p.g + p.m * sq(p.v0) / (p.R - r) }),
  'c-bridge': p => { const rho = p.R + 0.05, c = (sq(p.v0) / (p.g * rho) + 2) / 3; return { N: p.m * (p.g - sq(p.v0) / rho), v: Math.sqrt(p.g * rho * c) } },
  'm-groove': p => { const rho = p.R - r, v = Math.sqrt(2 * p.g * rho * p.M / (p.M + p.m)); return { v, V: p.m * v / p.M } }
}
const TEXTBOOK: Record<string, (p: P) => Record<string, number>> = {
  'c-arc-slide': p => ({ v: Math.sqrt(2 * p.g * p.R), N: 3 * p.m * p.g }),
  'c-loop': p => ({ vTop: Math.sqrt(sq(p.v0) - 4 * p.g * p.R), Nb: p.m * p.g + p.m * sq(p.v0) / p.R }),
  'c-bridge': p => { const c = (sq(p.v0) / (p.g * p.R) + 2) / 3; return { N: p.m * (p.g - sq(p.v0) / p.R), v: Math.sqrt(p.g * p.R * c) } },
  'm-groove': p => { const v = Math.sqrt(2 * p.g * p.R * p.M / (p.M + p.m)); return { v, V: p.m * v / p.M } }
}

function check(spec: (typeof PROBLEMS_2661)[number], params: P, report: string[]) {
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
}

describe('26.61 problems and templates', () => {
  it('every new problem agrees with its closed form, at its own numbers and at another set', () => {
    const report: string[] = []
    let seed = 2661
    const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
    for (const spec of PROBLEMS_2661) {
      expect(EXACT[spec.id], spec.id).toBeDefined()
      check(spec, spec.params, report)
      check(spec, varyParams(spec, rand), report)
    }
    expect(report.length).toBe(PROBLEMS_2661.length * 4)
  }, 300000)

  it('the new templates build, validate, and the ones with 26.60 features stay out of the TypeScript reference', () => {
    const exact = new Set(exactTemplates().map(t => t.id))
    for (const t of TEMPLATES_2661) {
      const s = buildTemplate(t.id)
      expect(() => validateScene(s), t.id).not.toThrow()
      expect(s.watch.length, t.id).toBeGreaterThan(0)
      expect(exact.has(t.id), t.id).toBe(!usesNewer(s))
      const rec = simulate(s, { duration: 0.5 })
      expect(rec.error, t.id).toBeNull()
    }
    expect(usesNewer(buildTemplate('spring-drop'))).toBe(true)
    expect(usesNewer(buildTemplate('dome-slide'))).toBe(true)
    expect(usesNewer(buildTemplate('projectile-wall'))).toBe(false)
  })
})
