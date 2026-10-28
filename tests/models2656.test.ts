/**
 * The model registry (26.56, D106): the registry installs in the Rust core without problems (every expression parses,
 * every unit is known, every dimension agrees), and every model is checked against independent reference values
 * (tests/fixtures/oracles2656.json, written by scripts/oracles with mpmath from the physics written out again —
 * never from the registry's expressions) with the scaled error e = |q − q_ref| / max(|q_ref|, q_scale), the
 * four condition states and the withheld values of formulas that do not apply.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { MODELS, modelById, registryJson, exampleInputs } from '../src/content/models'
import { ensureModels, evalModel, coreUnits } from '../src/engine/models'
import { UNITS, dimFull } from '../src/formula/units'
import { TEMPLATE_MODELS, LAB_MODELS, PROBLEM_MODELS } from '../src/content/models/links'
import { TEMPLATES } from '../src/templates'
import { LABS } from '../src/app/lab/catalog'
import { BUILTIN_PROBLEMS } from '../src/teaching/problemBank'
import { FORMULAS } from '../src/formula/library'
import { conceptById } from '../src/handbook/concepts'
import { TOPICS } from '../src/handbook/topics'
import { ACTIVITIES } from '../src/teaching/activities'

interface OracleCase {
  model: string
  name: string
  kind: 'benchmark' | 'boundary' | 'limit' | 'transfer'
  inputs: Record<string, number | null>
  expect: Record<string, number | null | { state?: string; value?: number | null; raw?: number }>
  conditions: Record<string, string>
  method: string
  tol: number
  scale: Record<string, number>
  constantsSet: string
}

const fixture = JSON.parse(readFileSync(new URL('./fixtures/oracles2656.json', import.meta.url), 'utf8')) as { cases: OracleCase[] }

describe('model registry', () => {
  it('installs in the core without problems', () => {
    expect(ensureModels()).toEqual([])
  })

  it('has unique ids and matches the core’s unit table', () => {
    expect(new Set(MODELS.map(m => m.id)).size).toBe(MODELS.length)
    const core = coreUnits()
    expect(core.map(u => u.unit)).toEqual(Object.keys(UNITS))
    for (const u of core) expect(dimFull(UNITS[u.unit]), u.unit).toEqual(u.dim)
    expect(registryJson().length).toBe(MODELS.length)
  })

  it('evaluates every worked example without undefined results', () => {
    const bad: string[] = []
    for (const m of MODELS) {
      const r = evalModel(m.id, exampleInputs(m))
      for (const o of r.outputs) if (o.reason === 'undefined') bad.push(`${m.id}.${o.id}`)
      if (r.domain.length) bad.push(`${m.id}: example outside the domain ${JSON.stringify(r.domain)}`)
    }
    expect(bad).toEqual([])
  })

  it('covers the 180 model families of the blueprint (doc 02), in id order', () => {
    const baseline = JSON.parse(readFileSync(new URL('../docs/coverage/baseline-26.55.json', import.meta.url), 'utf8')) as { models: Array<{ id: string }> }
    expect(MODELS.length).toBe(180)
    expect(MODELS.map(m => m.id)).toEqual(baseline.models.map(m => m.id))
  })

  it('links point at existing templates, labs, problems, situations, topics and activities', () => {
    const bad: string[] = []
    const templates = new Set(TEMPLATES.map(t => t.id))
    const labs = new Set(LABS.map(l => l.id))
    const problems = new Set(BUILTIN_PROBLEMS.map(p => p.id))
    const situations = new Set(FORMULAS.map(f => f.situation))
    const activities = new Set(ACTIVITIES.map(a => a.id))
    const topicOk = (t: string) => (t.startsWith('concept:') ? !!conceptById(t.slice(8)) : TOPICS.some(x => x.id === t))
    for (const [id, ms] of TEMPLATE_MODELS) { if (!templates.has(id)) bad.push(`template ${id}`); for (const m of ms) if (!modelById(m)) bad.push(`template ${id} → ${m}`) }
    for (const [id, ms] of LAB_MODELS) { if (!labs.has(id)) bad.push(`lab ${id}`); for (const m of ms) if (!modelById(m)) bad.push(`lab ${id} → ${m}`) }
    for (const [id, ms] of PROBLEM_MODELS) { if (!problems.has(id)) bad.push(`problem ${id}`); for (const m of ms) if (!modelById(m)) bad.push(`problem ${id} → ${m}`) }
    for (const m of MODELS) {
      for (const t of m.links.templates ?? []) if (!templates.has(t)) bad.push(`${m.id} template ${t}`)
      for (const l of m.links.labs ?? []) if (!labs.has(l)) bad.push(`${m.id} lab ${l}`)
      for (const p of m.links.problems ?? []) if (!problems.has(p)) bad.push(`${m.id} problem ${p}`)
      for (const s of m.links.situations ?? []) if (!situations.has(s)) bad.push(`${m.id} situation ${s}`)
      for (const t of m.links.topics ?? []) if (!topicOk(t)) bad.push(`${m.id} topic ${t}`)
      for (const a of m.links.activities ?? []) if (!activities.has(a)) bad.push(`${m.id} activity ${a}`)
    }
    // every template is mapped to at least one family
    for (const t of templates) if (!TEMPLATE_MODELS.some(([id]) => id === t)) bad.push(`template ${t} unmapped`)
    expect(bad).toEqual([])
  })

  it('restricted models say what is computed and the matrix fields are filled', () => {
    const bad: string[] = []
    for (const m of MODELS) {
      if (m.priority === 'P3' && !m.restricted && m.status === 'verified') bad.push(`${m.id}: P3 without a restricted note`)
      if (!m.example.text.zh || !m.example.answer.en || !m.point.de) bad.push(`${m.id}: texts`)
      if (!m.review?.physics) bad.push(`${m.id}: review`)
      if (m.teaching === 2 && !(m.links.activities ?? []).length) bad.push(`${m.id}: teaching 2 without an activity`)
      if (m.level === 3 && m.teaching < 2) bad.push(`${m.id}: level 3 needs teaching evidence`)
    }
    expect(bad).toEqual([])
  })

  it('every verified model has a benchmark, a boundary and a limit or transfer case', () => {
    const missing: string[] = []
    for (const m of MODELS) {
      if (m.status !== 'verified') continue
      const kinds = new Set(fixture.cases.filter(c => c.model === m.id).map(c => c.kind))
      if (!kinds.has('benchmark') || !kinds.has('boundary') || !(kinds.has('limit') || kinds.has('transfer'))) missing.push(`${m.id}: ${[...kinds].join(',')}`)
      if (!m.benchmarks.some(b => b === `oracle:${m.id}`)) missing.push(`${m.id}: benchmarks do not list oracle:${m.id}`)
    }
    expect(missing).toEqual([])
  })
})

describe('independent reference values', () => {
  for (const c of fixture.cases) {
    it(`${c.model} ${c.kind}: ${c.name}`, () => {
      expect(modelById(c.model), `unknown model ${c.model}`).toBeTruthy()
      const r = evalModel(c.model, c.inputs, { constantsSet: c.constantsSet })
      for (const [id, want] of Object.entries(c.expect)) {
        const o = r.outputs.find(x => x.id === id)
        expect(o, `${c.model}: no output ${id}`).toBeTruthy()
        const spec = typeof want === 'object' && want !== null ? want : { value: want }
        if (spec.state) expect(o!.state, `${c.model}.${id} state`).toBe(spec.state)
        else expect(['applicable', 'approximate'], `${c.model}.${id} state ${o!.state}`).toContain(o!.state)
        if (spec.value === null) expect(o!.value, `${c.model}.${id} withheld`).toBeNull()
        else if (spec.value !== undefined) {
          expect(o!.value, `${c.model}.${id} value`).not.toBeNull()
          const scale = Math.max(Math.abs(spec.value), c.scale[id] ?? 0)
          const err = scale === 0 ? Math.abs(o!.value!) : Math.abs(o!.value! - spec.value) / scale
          expect(err, `${c.model}.${id}: ${o!.value} vs ${spec.value} (${c.method})`).toBeLessThanOrEqual(c.tol)
        }
        if (spec.raw !== undefined) {
          const err = Math.abs((o!.raw ?? NaN) - spec.raw) / Math.max(Math.abs(spec.raw), 1e-300)
          expect(err, `${c.model}.${id} raw`).toBeLessThanOrEqual(c.tol)
        }
      }
      for (const [id, st] of Object.entries(c.conditions)) {
        expect(r.conditions.find(x => x.id === id)?.state, `${c.model} condition ${id}`).toBe(st)
      }
    })
  }
})

describe('formula reference kinds (FOR06, D101)', () => {
  it('a card that uses a simulated value is same-source consistency; conservation laws are labelled; the rest analytic', async () => {
    const { formulaRef, CONSERVATION, exprNames } = await import('../src/formula/refKind')
    const ids = new Set(FORMULAS.map(f => f.id))
    for (const id of CONSERVATION) expect(ids.has(id), `conservation formula ${id}`).toBe(true)
    const law = FORMULAS.find(f => CONSERVATION.has(f.id))!
    const closed = FORMULAS.find(f => !CONSERVATION.has(f.id) && exprNames(f.expr).length > 0)!
    expect(formulaRef(law, null)).toBe('conservation')
    expect(formulaRef(closed, null)).toBe('analytic')
    const v = exprNames(closed.expr)[0]
    const sample = (sim: boolean) => ({ vars: { [v]: { value: 1, unit: '', sim } } }) as unknown as Parameters<typeof formulaRef>[1]
    expect(formulaRef(closed, sample(true))).toBe('consistency')
    expect(formulaRef(closed, sample(false))).toBe('analytic')
    expect(exprNames('sqrt(2*g*h)')).toEqual(['g', 'h'])
  })
})
