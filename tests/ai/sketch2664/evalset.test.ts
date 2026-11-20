/**
 * 26.64 (D285): the evaluation set. 60 problems taken from the built-in problems with reworded statements, in nine
 * categories; every expected answer is the engine's answer of the built-in problem today (recomputed here, relative
 * 1e-9), so the set cannot drift from the engine. The grading accepts what the problem's own tolerance accepts.
 * The evaluation script never writes the token it reads.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BUILTIN_PROBLEMS, builtinProblem } from '../../../src/teaching/problemBank'
import { questionKey } from '../../../src/teaching/problems'
import { simulate } from '../../../src/engine/recording'
import { recognize } from '../../../src/formula/recognize'
import { gradeAnswers, readAnswers } from '../../../src/ai/sketch/evaluate'
import { runLadder } from '../../../src/ai/sketch/check'
import { rankTemplates } from '../../../src/ai/sketch/templates'
import { SKETCH_EXAMPLES } from '../../../src/ai/sketch/prompt'

interface Ask { q: string; prompt: string; expected: number; unit: string; tolerance: number }
interface Problem { id: string; category: string; source: string; template: string; params: Record<string, number>; problem: string; asks: Ask[] }
const root = join(__dirname, '..', '..', '..')
const set = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'copilot', 'eval-set.json'), 'utf8')) as { categories: Record<string, number>; problems: Problem[] }

describe('the evaluation set (D285)', () => {
  it('60 problems in nine categories, each from a built-in problem, with a statement of its own', () => {
    expect(set.problems).toHaveLength(60)
    const counts: Record<string, number> = {}
    for (const p of set.problems) counts[p.category] = (counts[p.category] ?? 0) + 1
    expect(counts).toEqual({ incline: 8, pulley: 8, board: 5, spring: 7, circular: 8, projectile: 7, collision: 7, field: 5, buoyancy: 5 })
    expect(counts).toEqual(set.categories)
    expect(new Set(set.problems.map(p => p.id)).size).toBe(60)
    expect(new Set(set.problems.map(p => p.problem)).size).toBe(60)
    for (const p of set.problems) {
      const spec = BUILTIN_PROBLEMS.find(x => x.id === p.source)
      expect(spec, p.id).toBeDefined()
      expect(p.template).toBe(spec!.template)
      // reworded: not the stem of the bank with its numbers filled in
      const stem = spec!.stem.zh.replace(/\{(\w+)\}/g, (_, k: string) => String(p.params[k] ?? 9.8))
      expect(p.problem.startsWith(stem.slice(0, 16)), p.id).toBe(false)
      expect(p.asks.length, p.id).toBeGreaterThan(0)
      expect(p.problem).toContain('求：')
    }
    expect(set.problems.reduce((n, p) => n + p.asks.length, 0)).toBe(118)
  })

  it('every expected answer is the engine\'s answer of the built-in problem (1e-9)', () => {
    for (const p of set.problems) {
      const spec = BUILTIN_PROBLEMS.find(x => x.id === p.source)!
      const prob = builtinProblem(spec, p.params)
      const rec = simulate(prob.scene)
      const sits = recognize(rec)
      for (const a of p.asks) {
        const key = questionKey(rec, sits, prob.questions.find(q => q.id === a.q)!)
        expect(key.value, `${p.id}/${a.q}`).not.toBeNull()
        expect(Math.abs(key.value! - a.expected), `${p.id}/${a.q}: ${key.value} vs ${a.expected}`).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(a.expected)))
      }
      rec.session.free()
    }
  })

  it('the template search offers the problem\'s own template for most reworded statements', () => {
    const hit = set.problems.filter(p => rankTemplates(p.problem, 5).some(t => t.id === p.template)).length
    // measured 2026-11-16: 57 of 60 (the reworded statements share fewer words with the catalogue than the stems do)
    expect(hit).toBeGreaterThanOrEqual(54)
  })

  it('grading: by position, within the problem\'s tolerance, a magnitude for a signed value', () => {
    const asks: Ask[] = [{ q: 'a', prompt: '', expected: 1.96, unit: 'm/s²', tolerance: 0.02 }, { q: 'v', prompt: '', expected: -3, unit: 'm/s', tolerance: 0.02 }, { q: 't', prompt: '', expected: 0.5, unit: 's', tolerance: 0.02 }]
    const g = gradeAnswers([1.99, 3.01, null], asks)
    expect(g).toMatchObject({ correct: 2, total: 3 })
    expect(g.each.map(e => e.ok)).toEqual([true, true, false])
    expect(gradeAnswers([2.1], asks).correct).toBe(0)
    // the answers of a built scene, read as the app reads them
    const e = SKETCH_EXAMPLES[1]
    const l = runLadder(JSON.stringify(e.sketch), e.problem)
    const table = set.problems.find(p => p.source === 'n-table')!
    expect(gradeAnswers(readAnswers(l.scene!, l.questions), table.asks.slice(0, 2)).each.map(x => x.ok)).toEqual([true, true])
  })

  it('the evaluation script reads the token from a file named by the environment and never writes it', () => {
    const src = readFileSync(join(root, 'scripts', 'copilot-eval.mjs'), 'utf8')
    expect(src).toContain('process.env.VELOPHI_APP_TOKEN_FILE')
    // the token appears in the request header and nowhere else: not in a log line, not in what is written to a file
    const lines = src.split('\n')
    expect(lines.filter(l => /(console\.\w+|writeFileSync)\([^\n]*(\$\{token\}|[,(+]\s*token\b)/.test(l))).toEqual([])
    expect(lines.filter(l => /\$\{token\}/.test(l))).toHaveLength(1)
    expect(lines.some(l => l.includes('authorization: `Bearer ${token}`'))).toBe(true)
    expect(src).not.toMatch(/[a-f0-9]{64}/)
    expect(src).not.toMatch(/headers[^\n]*writeFileSync|writeFileSync[^\n]*headers/)
  })
})
