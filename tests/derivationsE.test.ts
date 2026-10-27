/**
 * Group-E derivations (the rail loop, liquid and bounded-region situations of 26.55, manual 26.55, D90–D92): every
 * formula of the group-E situations has a
 * derivation, the card texts match the library, all texts exist in three languages, every step renders in KaTeX,
 * every step's machine-checkable equation is dimensionally consistent, the last step agrees with the library
 * expression, and the steps hold numerically in the recognised template situations.
 */
import { describe, expect, it } from 'vitest'
import katex from 'katex'
import { FORMULAS } from '../src/formula/library'
import type { FormulaDef } from '../src/formula/library'
import { DERIVATIONS_E as DERIVATIONS_A, GROUP_E_SITUATIONS as GROUP_A_SITUATIONS, SHARED_E as SHARED_A } from '../src/formula/derivations/groupE'
import type { Derivation, DerivationStep, SharedSteps } from '../src/formula/derivations/types'
import type { Tri } from '../src/i18n/tri'
import { LANGS } from '../src/i18n/tri'
import type { Node } from './reference/formula/expr'
import { dimension, evaluate, parse, variables } from './reference/formula/expr'
import type { Dim } from '../src/formula/units'
import { dimEqual, formatDim, unitDim } from '../src/formula/units'
import { buildTemplate } from '../src/templates'
// Regions, liquids and rail loops run only in the Rust core (D77).
import { simulate } from '../src/engine/recording'
import { recognize } from '../src/formula/recognize'

const GROUP = new Set(GROUP_A_SITUATIONS)
const formulasA = FORMULAS.filter(f => GROUP.has(f.situation))
const formulaById = new Map(FORMULAS.map(f => [f.id, f] as [string, FormulaDef]))
const sharedById = new Map(SHARED_A.map(s => [s.id, s] as [string, SharedSteps]))

/** Templates whose recordings contain the group-E situations. */
const TEMPLATE_IDS = ['rail-force', 'rail-coast', 'rail-fall', 'floating-block', 'sinking-ball', 'rising-block', 'mass-spectrometer', 'cyclotron-dees', 'bounded-field', 'oscilloscope']
/** The templates plus variants: a narrow field the charge crosses, a floating block that has settled. */
const VARIANTS: Array<[string, Record<string, number>]> = [...TEMPLATE_IDS.map(id => [id, {}] as [string, Record<string, number>]), ['bounded-field', { D: 0.6 }], ['floating-block', { c: 40 }]]

let unitsCache: Map<string, Record<string, string>> | null = null
/** Units of the situation variables, per situation type, collected from the recognised template situations. */
function situationUnits(): Map<string, Record<string, string>> {
  if (unitsCache) return unitsCache
  const units = new Map<string, Record<string, string>>()
  for (const [id, ov] of VARIANTS) {
    const rec = simulate(buildTemplate(id, ov))
    for (const s of recognize(rec)) {
      if (!GROUP.has(s.type)) continue
      const u = units.get(s.type) ?? {}
      for (const t of [s.tEvent ?? s.t0, s.t1]) for (const [k, v] of Object.entries(s.sample(t).vars)) u[k] = v.unit
      units.set(s.type, u)
    }
  }
  unitsCache = units
  return units
}

const isZero = (src: string) => src.trim() === '0'
const parsed = new Map<string, Node>()
function ast(src: string): Node {
  let n = parsed.get(src)
  if (!n) { n = parse(src); parsed.set(src, n) }
  return n
}

/** Dimension problem of one step in one situation, or null. */
function stepDimensionError(step: DerivationStep, situation: string): string | null {
  const units = situationUnits().get(situation)
  if (!units) return `situation ${situation} not recognised in the templates`
  const dims: Record<string, Dim> = {}
  for (const [k, u] of Object.entries(units)) dims[k] = unitDim(u)
  for (const [k, u] of Object.entries(step.symbols ?? {})) {
    let d: Dim
    try { d = unitDim(u) } catch { return `symbol ${k}: unknown unit ${u}` }
    if (k in dims && !dimEqual(dims[k], d)) return `symbol ${k} (${u}) shadows a situation variable with another unit (${units[k]})`
    dims[k] = d
  }
  const c = step.check!
  try {
    const l = isZero(c.lhs) ? null : dimension(ast(c.lhs), dims)
    const r = isZero(c.rhs) ? null : dimension(ast(c.rhs), dims)
    if (l && r && !dimEqual(l, r)) return `${c.lhs} [${formatDim(l)}] ≠ ${c.rhs} [${formatDim(r)}]`
    return null
  } catch (e) {
    return (e as Error).message
  }
}

/** Every Tri of a derivation with a label for messages. */
function trisOf(d: Derivation): Array<[string, Tri]> {
  const out: Array<[string, Tri]> = [['title', d.title]]
  if (d.note) out.push(['note', d.note])
  if (d.method) out.push(['method', d.method])
  d.causes?.forEach((c, i) => out.push([`causes[${i}]`, c]))
  d.steps.forEach((s, i) => { out.push([`steps[${i}].text`, s.text]); if (s.basis) out.push([`steps[${i}].basis`, s.basis]) })
  return out
}

/** Situations whose derivations use a shared step list. */
function usersOf(sharedId: string): Set<string> {
  const out = new Set<string>()
  for (const d of DERIVATIONS_A) if (d.uses?.includes(sharedId)) out.add(formulaById.get(d.formula)!.situation)
  return out
}

/** Deterministic pseudo-random numbers in [0.3, 2.3). */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return 0.3 + 2 * s / 2 ** 32 }
}

describe('group-E derivations: coverage and card texts', () => {
  it('there are 20 group-E formulas and each has exactly one derivation', () => {
    expect(formulasA.length).toBe(20)
    const seen = new Map<string, number>()
    for (const d of DERIVATIONS_A) seen.set(d.formula, (seen.get(d.formula) ?? 0) + 1)
    for (const f of formulasA) expect(seen.get(f.id), f.id).toBe(1)
    for (const d of DERIVATIONS_A) expect(GROUP.has(formulaById.get(d.formula)?.situation ?? ''), `${d.formula} is a group-E formula`).toBe(true)
  })

  it('the Chinese card texts equal the library texts, and optional texts exist exactly when the library has them', () => {
    for (const d of DERIVATIONS_A) {
      const f = formulaById.get(d.formula)!
      expect(d.title.zh, `${f.id} title`).toBe(f.title)
      expect(d.note?.zh, `${f.id} note`).toBe(f.note)
      expect(d.method?.zh, `${f.id} method`).toBe(f.method)
      expect(d.causes?.map(c => c.zh), `${f.id} causes`).toEqual(f.causes)
    }
  })

  it('every text exists in all three languages', () => {
    const empty = (t: Tri) => LANGS.filter(l => typeof t[l] !== 'string' || t[l].trim() === '')
    for (const d of DERIVATIONS_A) for (const [what, t] of trisOf(d)) expect(empty(t), `${d.formula} ${what}`).toEqual([])
    for (const s of SHARED_A) {
      expect(empty(s.title), `${s.id} title`).toEqual([])
      s.steps.forEach((st, i) => {
        expect(empty(st.text), `${s.id} steps[${i}].text`).toEqual([])
        expect(empty(st.basis!), `${s.id} steps[${i}].basis`).toEqual([])
      })
    }
  })
})

describe('group-E derivations: shared steps', () => {
  it('shared ids are unique, named after their situation, and used', () => {
    expect(new Set(SHARED_A.map(s => s.id)).size).toBe(SHARED_A.length)
    for (const s of SHARED_A) {
      const users = usersOf(s.id)
      expect(users.size, `${s.id} is used`).toBeGreaterThan(0)
      for (const sit of users) expect(s.id.startsWith(`${sit}.`), `${s.id} used by ${sit}`).toBe(true)
      expect(s.steps.length, s.id).toBeGreaterThan(0)
    }
  })
  it('every uses id exists', () => {
    for (const d of DERIVATIONS_A) for (const id of d.uses ?? []) expect(sharedById.has(id), `${d.formula} uses ${id}`).toBe(true)
  })
})

describe('group-E derivations: steps', () => {
  const allSteps: Array<[string, DerivationStep]> = []
  for (const d of DERIVATIONS_A) d.steps.forEach((s, i) => allSteps.push([`${d.formula} steps[${i}]`, s]))
  for (const s of SHARED_A) s.steps.forEach((st, i) => allSteps.push([`${s.id} steps[${i}]`, st]))

  it('every derivation has steps; every step has a basis and a check', () => {
    for (const d of DERIVATIONS_A) expect(d.steps.length, d.formula).toBeGreaterThan(0)
    for (const [where, s] of allSteps) {
      expect(s.basis, `${where} basis`).toBeTruthy()
      expect(s.check, `${where} check`).toBeTruthy()
    }
  })

  it('every step renders in KaTeX and its LaTeX contains no natural-language text', () => {
    for (const [where, s] of allSteps) {
      expect(() => katex.renderToString(s.latex, { throwOnError: true }), where).not.toThrow()
      expect(/^[\x20-\x7e]*$/.test(s.latex), `${where}: LaTeX is plain ASCII`).toBe(true)
    }
  })

  it('every check parses and both sides have the same dimension', () => {
    for (const d of DERIVATIONS_A) {
      const sit = formulaById.get(d.formula)!.situation
      d.steps.forEach((s, i) => expect(stepDimensionError(s, sit), `${d.formula} steps[${i}]`).toBeNull())
    }
    for (const sh of SHARED_A) {
      for (const sit of usersOf(sh.id)) sh.steps.forEach((s, i) => expect(stepDimensionError(s, sit), `${sh.id} steps[${i}] in ${sit}`).toBeNull())
    }
  })

  it('every group-E situation is recognised in the templates (source of the variable units)', () => {
    const units = situationUnits()
    for (const sit of GROUP_A_SITUATIONS) expect(units.has(sit), `situation ${sit} recognised in the templates`).toBe(true)
  })

  it('the last step agrees with the library expression (numerically, when its left side is one symbol)', () => {
    let compared = 0
    for (const d of DERIVATIONS_A) {
      const f = formulaById.get(d.formula)!
      const c = d.steps[d.steps.length - 1].check!
      if (!/^[A-Za-z_]\w*$/.test(c.lhs.trim())) continue
      const rhs = ast(c.rhs), expr = ast(f.expr)
      const names = [...new Set([...variables(rhs), ...variables(expr)])]
      const next = rng(f.id.length * 7919 + 17)
      let finite = 0
      for (let k = 0; k < 8; k++) {
        const vals: Record<string, number> = {}
        for (const n of names) vals[n] = next()
        const a = evaluate(rhs, vals), b = evaluate(expr, vals)
        if (!Number.isFinite(b)) continue
        finite++
        expect(Math.abs(a - b), `${f.id}: ${c.rhs} vs ${f.expr} at ${JSON.stringify(vals)}`).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(b)))
      }
      expect(finite, `${f.id}: some finite samples`).toBeGreaterThan(0)
      compared++
    }
    expect(compared).toBeGreaterThan(17)
  })

  /*
   * Replay with real values: in every recognised template situation where a formula's conditions hold, take
   * the situation variables, let each step "symbol = expression" define its symbol once the expression can
   * be evaluated, and require every scalar step whose quantities are all known to hold (steps written with
   * ≤ must hold as inequalities). Vector steps (\vec) are skipped.
   */
  it('the steps hold numerically in the recognised template situations', () => {
    const bare = /^[A-Za-z_]\w*$/
    const checkedFormulas = new Set<string>()
    let checkedSteps = 0
    for (const [id, ov] of VARIANTS) {
      const rec = simulate(buildTemplate(id, ov))
      for (const sit of recognize(rec)) {
        if (!GROUP.has(sit.type)) continue
        const sample = sit.sample(sit.tEvent ?? (sit.t0 + sit.t1) / 2)
        for (const d of DERIVATIONS_A) {
          const f = formulaById.get(d.formula)!
          if (f.situation !== sit.type) continue
          if ((f.requires ?? []).some(r => sample.conditions.find(c => c.id === r)?.status !== 'ok')) continue
          const vals: Record<string, number> = {}
          for (const [k, v] of Object.entries(sample.vars)) vals[k] = v.value
          const steps = [...(d.uses ?? []).flatMap(u => sharedById.get(u)!.steps), ...d.steps].filter(s => !s.latex.includes('\\vec'))
          const known = (src: string) => [...variables(ast(src))].every(v => v in vals)
          for (let changed = true; changed;) {
            changed = false
            for (const s of steps) {
              const l = s.check!.lhs.trim()
              if (bare.test(l) && !(l in vals) && known(s.check!.rhs)) { vals[l] = evaluate(ast(s.check!.rhs), vals); changed = true }
            }
          }
          for (const s of steps) {
            const c = s.check!
            if (!known(c.lhs) || !known(c.rhs)) continue
            const a = evaluate(ast(c.lhs), vals), b = evaluate(ast(c.rhs), vals)
            const tol = 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))
            const ok = Math.abs(a - b) <= tol || (s.latex.includes('\\le') && a <= b + tol)
            expect(ok, `${d.formula} in ${sit.key}: ${s.latex}: ${c.lhs} = ${a}, ${c.rhs} = ${b}`).toBe(true)
            checkedSteps++
          }
          checkedFormulas.add(d.formula)
        }
      }
    }
    expect(checkedFormulas.size).toBeGreaterThanOrEqual(17)
    expect(checkedSteps).toBeGreaterThan(35)
  })
})
