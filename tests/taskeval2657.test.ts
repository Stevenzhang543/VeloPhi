/**
 * Task understanding evaluation (26.57, D115; manual §14.2). The holdout file must be the one frozen before the
 * parser was written (tests/fixtures/coverage/task-eval-2657-freeze.md); the scores of both parts are written to
 * docs/reports/26.57/task-eval.json with numerators, denominators and 95 % intervals, and the error lists. The first
 * blind run is kept in docs/reports/26.57/task-eval-holdout-first-run.json and never overwritten.
 */
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { metrics, scoreCase } from './helpers/taskEval'
import type { EvalCase } from './helpers/taskEval'

const FROZEN = '078687ae84f275b4b45586b2d0f706ee6abc5e5a00484c50c32404fc43881bd5'
/**
 * Labels found wrong when the blind run was reviewed (the frozen file is not edited; the report shows the raw and
 * the adjudicated numbers side by side).
 */
const ADJUDICATED: Record<string, string> = {
  'incline-ambi-09': '上滑的最大距离只由 μk 决定（v₀²/(2g(sinθ + μk cosθ))）；μs 只影响停下以后的分支，题目没有问停下以后。标注所期望的追问并不必要，系统不追问是正确的。'
}
const load = (f: string) => readFileSync(f, 'utf8')

describe('task understanding set (manual §14.2)', () => {
  it('the holdout is the frozen file, and the freeze record names it', () => {
    const h = createHash('sha256').update(readFileSync('tests/fixtures/task-eval-holdout-2657.json')).digest('hex')
    expect(h).toBe(FROZEN)
    expect(load('tests/fixtures/coverage/task-eval-2657-freeze.md')).toContain(FROZEN)
  })

  it('has the planned composition: 240 cases, 120 complete / 60 ambiguous / 30 conflicting / 30 out of scope, about 70/30', () => {
    const dev = JSON.parse(load('tests/fixtures/task-eval-dev-2657.json')).cases as EvalCase[]
    const hold = JSON.parse(load('tests/fixtures/task-eval-holdout-2657.json')).cases as EvalCase[]
    const all = [...dev, ...hold]
    expect(all.length).toBe(240)
    const n = (cat: string) => all.filter(c => c.cat === cat).length
    expect([n('complete'), n('ambiguous'), n('conflict'), n('out')]).toEqual([120, 60, 30, 30])
    expect(hold.length / all.length).toBeGreaterThan(0.29)
    // no wording appears on both sides
    const devText = new Set(dev.map(c => c.text))
    expect(hold.filter(c => devText.has(c.text))).toEqual([])
  })

  it('scores both parts and writes the report (development part held to its tuned level)', () => {
    const dev = (JSON.parse(load('tests/fixtures/task-eval-dev-2657.json')).cases as EvalCase[]).map(scoreCase)
    const hold = (JSON.parse(load('tests/fixtures/task-eval-holdout-2657.json')).cases as EvalCase[]).map(scoreCase)
    const byDomain = (rs: typeof dev) => Object.fromEntries(['incline', 'projectile', 'collision', 'circuit', 'lens', 'field', 'out'].map(d => [d, metrics(rs.filter(r => r.domain === d))]))
    const report = {
      generated: 'tests/taskeval2657.test.ts', frozenHoldout: FROZEN,
      dev: { all: metrics(dev), byDomain: byDomain(dev), errors: dev.filter(r => r.errors.length).map(r => ({ id: r.id, errors: r.errors })) },
      holdout: { all: metrics(hold), byDomain: byDomain(hold), errors: hold.filter(r => r.errors.length).map(r => ({ id: r.id, errors: r.errors })) },
      adjudicated: { cases: ADJUDICATED, holdout: metrics(hold.filter(r => !(r.id in ADJUDICATED))) }
    }
    mkdirSync('docs/reports/26.57', { recursive: true })
    writeFileSync('docs/reports/26.57/task-eval.json', JSON.stringify(report, null, 1))
    const first = 'docs/reports/26.57/task-eval-holdout-first-run.json'
    if (!existsSync(first)) writeFileSync(first, JSON.stringify({ note: 'first run of the frozen holdout (before any change made after seeing it)', holdout: report.holdout }, null, 1))
    // the development part is the tuning set: it must stay where it was tuned (regression guard)
    const m = report.dev.all
    expect(m.silent.n).toBe(0)
    expect(m.givens.p!).toBeGreaterThan(0.98)
    expect(m.targets.p!).toBeGreaterThan(0.95)
    expect(m.clarifyRecall.p!).toBeGreaterThan(0.95)
  })
})
