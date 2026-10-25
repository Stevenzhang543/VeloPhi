/**
 * Derivations of situation group B (manual 26.50, D28): every formula has one, card texts match the library,
 * all three languages are filled in, every LaTeX line renders, every checked step is dimensionally consistent
 * and the last step agrees with the formula's expression.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import katex from 'katex'
import { FORMULAS } from '../src/formula/library'
import type { FormulaDef } from '../src/formula/library'
import { DERIVATIONS_B, SHARED_B } from '../src/formula/derivations/groupB'
import type { Derivation, DerivationStep } from '../src/formula/derivations/types'
import type { Tri } from '../src/i18n/tri'
import { dimension, evaluate, parse, variables } from '../src/formula/expr'
import { dimEqual, formatDim, unitDim } from '../src/formula/units'
import type { Dim } from '../src/formula/units'
import { TEMPLATES, buildTemplate } from '../src/templates'
import { simulate } from '../src/core/solver/simulation'
import { recognize } from '../src/formula/situations'

const GROUP_B = ['pendulum', 'spring', 'spring-pair', 'vcircle-rope', 'vcircle-rod', 'rotation', 'rolling', 'roll-slip', 'hinged-impact', 'var-force']
const formulasB = FORMULAS.filter(f => GROUP_B.includes(f.situation))
const sharedById = new Map(SHARED_B.map(s => [s.id, s]))

/** Variable units and one set of sample values per situation type, from the templates. */
const units = new Map<string, Record<string, string>>()
const values = new Map<string, Record<string, number>>()

beforeAll(() => {
  const variants: Array<[string, Record<string, number>]> = [...TEMPLATES.map(t => [t.id, {}] as [string, Record<string, number>]), ['rolling', { mu: 0.05 }]]
  for (const [id, ov] of variants) {
    for (const s of recognize(simulate(buildTemplate(id, ov)))) {
      if (!GROUP_B.includes(s.type)) continue
      const sample = s.sample(s.tEvent ?? (s.t0 + s.t1) / 2)
      const u = units.get(s.type) ?? {}
      const v = values.get(s.type) ?? {}
      for (const [k, x] of Object.entries(sample.vars)) { u[k] = x.unit; if (!(k in v)) v[k] = x.value }
      units.set(s.type, u)
      values.set(s.type, v)
    }
  }
  // 31 templates since 26.51: more than the default 10 s hook timeout on slower machines
}, 120000)

const steps = (d: Derivation): DerivationStep[] => [...(d.uses ?? []).flatMap(id => sharedById.get(id)?.steps ?? []), ...d.steps]
const formulaOf = (id: string): FormulaDef => FORMULAS.find(f => f.id === id)!

function triFilled(t: Tri | undefined, what: string) {
  expect(t, what).toBeTruthy()
  for (const lang of ['zh', 'en', 'de'] as const) expect(t![lang].trim(), `${what} [${lang}]`).not.toBe('')
}

describe('group-B derivations: coverage and texts', () => {
  it('there are 50 group-B formulas and each has exactly one derivation', () => {
    expect(formulasB.length).toBe(50)
    const ids = DERIVATIONS_B.map(d => d.formula)
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ids].sort()).toEqual(formulasB.map(f => f.id).sort())
  })

  it('shared step lists have unique ids, are used, and belong to the situation that uses them', () => {
    const ids = SHARED_B.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    const used = new Set<string>()
    for (const d of DERIVATIONS_B) {
      const f = formulaOf(d.formula)
      for (const id of d.uses ?? []) {
        expect(sharedById.has(id), `${d.formula} uses ${id}`).toBe(true)
        expect(id.startsWith(`${f.situation}.`), `${d.formula} uses ${id} of another situation`).toBe(true)
        used.add(id)
      }
    }
    for (const id of ids) expect(used.has(id), `shared list ${id} is never used`).toBe(true)
  })

  it('Chinese card texts equal the library, translations exist exactly where the library has a text', () => {
    for (const d of DERIVATIONS_B) {
      const f = formulaOf(d.formula)
      expect(d.title.zh, `${f.id} title`).toBe(f.title)
      triFilled(d.title, `${f.id} title`)
      for (const key of ['note', 'method'] as const) {
        if (f[key] === undefined) expect(d[key], `${f.id} ${key} not in library`).toBeUndefined()
        else { expect(d[key]?.zh, `${f.id} ${key}`).toBe(f[key]); triFilled(d[key], `${f.id} ${key}`) }
      }
      if (f.causes === undefined) expect(d.causes, `${f.id} causes not in library`).toBeUndefined()
      else {
        expect(d.causes?.map(c => c.zh), `${f.id} causes`).toEqual(f.causes)
        d.causes!.forEach((c, i) => triFilled(c, `${f.id} cause ${i}`))
      }
    }
  })

  it('cross-references name existing formula titles in each language', () => {
    const titles = { zh: new Set(DERIVATIONS_B.map(d => d.title.zh)), en: new Set(DERIVATIONS_B.map(d => d.title.en)), de: new Set(DERIVATIONS_B.map(d => d.title.de)) }
    const patterns = { zh: /见“([^”]+)”/g, en: /see “([^”]+)”/g, de: /siehe „([^“]+)“/g }
    const texts = [...SHARED_B.flatMap(s => s.steps), ...DERIVATIONS_B.flatMap(d => d.steps)].map(st => st.text)
    let n = 0
    for (const t of texts) {
      for (const lang of ['zh', 'en', 'de'] as const) {
        for (const m of t[lang].matchAll(patterns[lang])) { expect(titles[lang].has(m[1]), `${lang}: ${m[1]}`).toBe(true); n++ }
      }
    }
    expect(n).toBeGreaterThan(0)
  })

  it('every shared list and step has texts in all three languages', () => {
    for (const s of SHARED_B) {
      triFilled(s.title, `${s.id} title`)
      expect(s.steps.length, s.id).toBeGreaterThan(0)
      s.steps.forEach((st, i) => { triFilled(st.text, `${s.id} step ${i} text`); if (st.basis) triFilled(st.basis, `${s.id} step ${i} basis`) })
    }
    for (const d of DERIVATIONS_B) {
      expect(d.steps.length, d.formula).toBeGreaterThan(0)
      d.steps.forEach((st, i) => { triFilled(st.text, `${d.formula} step ${i} text`); if (st.basis) triFilled(st.basis, `${d.formula} step ${i} basis`) })
    }
  })
})

describe('group-B derivations: LaTeX', () => {
  const all: Array<[string, DerivationStep]> = [
    ...SHARED_B.flatMap(s => s.steps.map((st, i) => [`${s.id}#${i}`, st] as [string, DerivationStep])),
    ...DERIVATIONS_B.flatMap(d => d.steps.map((st, i) => [`${d.formula}#${i}`, st] as [string, DerivationStep]))
  ]
  it('every step renders with KaTeX (also in strict mode)', () => {
    for (const [where, st] of all) {
      expect(() => katex.renderToString(st.latex, { throwOnError: true }), `${where}: ${st.latex}`).not.toThrow()
      expect(() => katex.renderToString(st.latex, { throwOnError: true, strict: 'error' }), `${where} (strict): ${st.latex}`).not.toThrow()
    }
  })
  it('LaTeX is language-neutral (no CJK characters)', () => {
    for (const [where, st] of all) expect(/[　-鿿＀-￯]/.test(st.latex), `${where}: ${st.latex}`).toBe(false)
  })
})

describe('group-B derivations: checks', () => {
  it('every situation of group B is recognised in some template', () => {
    for (const s of GROUP_B) expect(units.has(s), s).toBe(true)
  })

  it('every check has equal dimensions on both sides (situation variables plus step symbols)', () => {
    let n = 0
    for (const d of DERIVATIONS_B) {
      const situation = formulaOf(d.formula).situation
      const vars = units.get(situation)!
      for (const st of steps(d)) {
        if (!st.check) continue
        for (const name of Object.keys(st.symbols ?? {})) {
          expect(name in vars, `${d.formula}: symbol ${name} shadows a variable of ${situation}`).toBe(false)
        }
        const dims: Record<string, Dim> = {}
        for (const [k, u] of Object.entries({ ...vars, ...(st.symbols ?? {}) })) dims[k] = unitDim(u)
        let l: Dim, r: Dim
        try {
          l = dimension(parse(st.check.lhs), dims)
          r = dimension(parse(st.check.rhs), dims)
        } catch (e) {
          throw new Error(`${d.formula}: ${st.check.lhs} = ${st.check.rhs}: ${(e as Error).message}`)
        }
        expect(dimEqual(l, r), `${d.formula}: ${st.check.lhs} [${formatDim(l)}] = ${st.check.rhs} [${formatDim(r)}]`).toBe(true)
        n++
      }
    }
    expect(n).toBeGreaterThan(150)
  })

  it('the last step of each derivation is checked and agrees with the formula expression', () => {
    for (const d of DERIVATIONS_B) {
      const f = formulaOf(d.formula)
      const last = d.steps[d.steps.length - 1]
      expect(last.check, `${f.id} last step has a check`).toBeTruthy()
      const lhs = parse(last.check!.lhs), rhs = parse(last.check!.rhs)
      const vals = values.get(f.situation)!
      // A step "symbol = expression of situation variables" must give the library value
      if (lhs.type !== 'var' || ![...variables(rhs)].every(v => v in vals)) continue
      const theory = evaluate(parse(f.expr), vals)
      const mine = evaluate(rhs, vals)
      expect(Math.abs(mine - theory), `${f.id}: ${last.check!.rhs} = ${mine}, library ${theory}`).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(theory)))
    }
  })
})
