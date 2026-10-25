/**
 * Learning handbook (manual 26.51, D46): every formula has an entry (a topic) and an example, every topic has its
 * principle in three languages and key relations that render, and every example still shows its formula at the
 * stored time (template with the stored parameters).
 */
import { describe, expect, it } from 'vitest'
import katex from 'katex'
import { FORMULAS } from '../src/formula/library'
import { TOPICS, formulasOf, topicOf } from '../src/handbook/topics'
import EXAMPLES from '../src/handbook/examples.json'
import { HANDBOOK_VARIANTS } from '../src/handbook/variants'
import { LANGS } from '../src/i18n/tri'
import { TEMPLATES, buildTemplate } from '../src/templates'
import { simulate } from '../src/core/solver/simulation'
import type { Recording } from '../src/core/solver/simulation'
import { recognize } from '../src/formula/situations'
import { cardsAt } from '../src/formula/match'
import { getDerivation } from '../src/formula/derivations'

const examples = EXAMPLES as Record<string, { template: string; params?: Record<string, number>; t: number }>

describe('handbook content', () => {
  it('every formula belongs to a topic and every topic has formulas', () => {
    const ids = new Set(TOPICS.map(t => t.id))
    for (const f of FORMULAS) expect(ids.has(topicOf(f.id)), f.id).toBe(true)
    for (const t of TOPICS) expect(formulasOf(t.id).length, t.id).toBeGreaterThan(0)
    expect(TOPICS.map(t => t.id)).toEqual(['motion', 'friction', 'energy', 'momentum', 'circular', 'oscillation', 'rotation', 'gravitation', 'drag'])
  })

  it('every topic has its principle in three languages and key relations that render', () => {
    for (const t of TOPICS) {
      for (const l of LANGS) expect(t.title[l].trim(), `${t.id} title ${l}`).not.toBe('')
      expect(t.principle.length, t.id).toBeGreaterThanOrEqual(2)
      for (const p of t.principle) for (const l of LANGS) expect(p[l].trim().length, `${t.id} ${l}`).toBeGreaterThan(20)
      for (const law of t.laws) expect(() => katex.renderToString(law, { throwOnError: true }), law).not.toThrow()
    }
  })

  it('every formula has a derivation and an example from a known template', () => {
    const tids = new Set(TEMPLATES.map(t => t.id))
    for (const f of FORMULAS) {
      expect(getDerivation(f.id), `${f.id} derivation`).not.toBeNull()
      const ex = examples[f.id]
      expect(ex, `${f.id} example`).toBeTruthy()
      expect(tids.has(ex.template), `${f.id} template ${ex.template}`).toBe(true)
      if (ex.params) expect(HANDBOOK_VARIANTS.some(([id, p]) => id === ex.template && JSON.stringify(p) === JSON.stringify(ex.params)), `${f.id} variant`).toBe(true)
    }
  })
})

describe('handbook examples', () => {
  it('each example shows its formula at the stored time', () => {
    const recs = new Map<string, Recording>()
    let checked = 0
    for (const f of FORMULAS) {
      const ex = examples[f.id]
      const key = `${ex.template}:${JSON.stringify(ex.params ?? {})}`
      let rec = recs.get(key)
      if (!rec) { rec = simulate(buildTemplate(ex.template, ex.params ?? {})); recs.set(key, rec) }
      const cards = cardsAt(recognize(rec), ex.t).filter(c => c.formula.id === f.id)
      expect(cards.some(c => ['match', 'approx-ok', 'approx', 'no-measure'].includes(c.verdict)), `${f.id} in ${key} at ${ex.t}: ${cards.map(c => c.verdict).join(',')}`).toBe(true)
      checked++
    }
    expect(checked).toBe(FORMULAS.length)
  }, 120000)
})
