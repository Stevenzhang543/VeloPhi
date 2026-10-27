/** Formula library: syntax, dimensions, and situations where formulas must NOT be offered. */
import { describe, expect, it } from 'vitest'
import { FORMULAS } from '../src/formula/library'
import { checkDimensions, evaluateCard, formatNumber } from './reference/formula/match'
import { parse, evaluate, toLatex } from './reference/formula/expr'
import { ellipticK } from './reference/formula/elliptic'
import { TEMPLATES, buildTemplate } from '../src/templates'
import { simulate } from './reference/core/solver/simulation'
import { recognize } from './reference/formula/situations'
import { usesFields } from '../src/core/scene/types'
import { simulate as rustSimulate } from '../src/engine/recording'
import { recognize as rustRecognize } from '../src/formula/recognize'

describe('expression language', () => {
  it('parses and evaluates with precedence', () => {
    expect(evaluate(parse('2 + 3*4^2/8 - -1'), {})).toBe(2 + 3 * 16 / 8 + 1)
    expect(evaluate(parse('sqrt(a^2 + b^2)'), { a: 3, b: 4 })).toBe(5)
    expect(() => parse('2 +')).toThrow()
    expect(() => evaluate(parse('x + 1'), {})).toThrow()
  })
  it('prints LaTeX with substituted values', () => {
    const s = toLatex(parse('g*(sin(theta) - muK*cos(theta))'), { value: n => ({ g: '9.8', theta: '0.5236', muK: '0.2' } as Record<string, string>)[n] ?? null })
    expect(s).toContain('9.8')
    expect(s).toContain('\\sin')
  })
  it('K(k) by AGM', () => {
    expect(ellipticK(0)).toBeCloseTo(Math.PI / 2, 15)
    expect(Math.abs(ellipticK(Math.sin(Math.PI / 12)) - 1.5981420021)).toBeLessThan(1e-9)
  })
  it('formats numbers', () => {
    expect(formatNumber(3.2025902, 4)).toBe('3.203')
    expect(formatNumber(1.5e-7, 3)).toContain('10^{-7}')
  })
})

describe('library', () => {
  it('every formula has a unique id and parses', () => {
    const ids = new Set<string>()
    for (const f of FORMULAS) { expect(ids.has(f.id)).toBe(false); ids.add(f.id); expect(() => parse(f.expr)).not.toThrow() }
  })
  it('every formula is dimensionally consistent with the variable units of its situation', () => {
    const units = new Map<string, Record<string, string>>()
    const variants: Array<[string, Record<string, number>]> = [...TEMPLATES.map(t => [t.id, {}] as [string, Record<string, number>]), ['rolling', { mu: 0.1 }], ['board-block', { mu1: 0.3, mu2: 0.2 }], ['velocity-selector', { v0: 3 }]]
    for (const [id, ov] of variants) {
      const scene = buildTemplate(id, ov)
      // 26.54 (D77): charges and fields are recognised by the Rust core only
      const sits = usesFields(scene) ? rustRecognize(rustSimulate(scene)) : recognize(simulate(scene))
      for (const s of sits) {
        const sample = s.sample(s.tEvent ?? s.t0)
        const u = units.get(s.type) ?? {}
        for (const [k, v] of Object.entries(sample.vars)) u[k] = v.unit
        units.set(s.type, u)
        for (const [k, m] of Object.entries(sample.measures)) {
          const f = FORMULAS.find(f => f.situation === s.type && f.measure === k)
          if (f) expect(m.unit, `${f.id} measure unit`).toBe(f.unit)
        }
      }
    }
    for (const f of FORMULAS) {
      const u = units.get(f.situation)
      expect(u, `situation ${f.situation} recognized in some template`).toBeTruthy()
      expect(checkDimensions(f, u!)).toBeNull()
    }
  })
})

describe('formulas are not offered where their assumptions fail', () => {
  const offered = (id: string, ov: Record<string, number>) => {
    const rec = simulate(buildTemplate(id, ov))
    const out: Record<string, string[]> = {}
    for (const s of recognize(rec)) {
      const sample = s.sample(s.tEvent ?? (s.t0 + s.t1) / 2)
      for (const f of FORMULAS.filter(f => f.situation === s.type)) (out[f.id] ??= []).push(evaluateCard(f, s, sample, { digits: 6 }).verdict)
    }
    return out
  }
  it('no pendulum or rotation formulas in a sliding scene', () => {
    const o = offered('incline', {})
    expect(Object.keys(o).some(k => k.startsWith('pe.') || k.startsWith('ro.') || k.startsWith('col.'))).toBe(false)
  })
  it('pure rolling formulas are rejected when the cylinder slips', () => {
    const o = offered('rolling', { mu: 0.05 })
    expect(o['rl.a']).toEqual(['not-applicable'])
    expect(o['rl.a.slip']).toEqual(['match'])
  })
  it('the kinetic-friction formula is rejected for a block at rest', () => {
    const o = offered('incline', { mu: 0.8 })
    expect(o['incline.f.kinetic']).toEqual(['not-applicable'])
    expect(o['incline.f.static']).toEqual(['match'])
  })
  it('1D collision does not offer oblique-only formulas', () => {
    const o = offered('collision-1d', {})
    expect(o['col.angle']).toEqual(['not-applicable'])
    expect(o['col.py']).toEqual(['not-applicable'])
  })
  it('the thin-rod shortcut is not offered when released from another angle', () => {
    const s = buildTemplate('hinged-rod')
    s.bodies[0].angle = -0.5
    const L = 1, pivot = { x: 0, y: 1.5 }
    s.bodies[0].position = { x: pivot.x + Math.cos(-0.5) * L / 2, y: pivot.y + Math.sin(-0.5) * L / 2 }
    const rec = simulate(s)
    const sit = recognize(rec).find(x => x.type === 'rotation')!
    const sample = sit.sample(sit.t0)
    const card = evaluateCard(FORMULAS.find(f => f.id === 'ro.rod')!, sit, sample, { digits: 6 })
    expect(card.verdict).toBe('not-applicable')
    expect(evaluateCard(FORMULAS.find(f => f.id === 'ro.omega')!, sit, sample, { digits: 6 }).verdict).toBe('match')
  })
})
