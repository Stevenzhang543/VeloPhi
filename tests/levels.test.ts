/**
 * Knowledge levels (manual 26.51, D44): every formula carries both tags (none falls back to the default), the
 * tags are plausible (lower secondary formulas are junior in both curricula, HL only for IB), the ceiling filters
 * cards, switching curricula keeps the ceiling, and on 21+ templates the cards of each level never exceed it
 * while the recognition itself is unchanged (the levels only steer what is shown).
 */
import { describe, expect, it } from 'vitest'
import { FORMULAS } from '../src/formula/library'
import { CN_ORD, IB_ORD, LEVELS, LEVEL_CHOICES, levelOf, levelOrdinal, nearestLevel, withinLevel } from '../src/formula/levels'
import { TEMPLATES, buildTemplate } from '../src/templates'
import { simulate } from './reference/core/solver/simulation'
import { recognize } from './reference/formula/situations'
import { cardsAt } from './reference/formula/match'

describe('level tags', () => {
  it('every formula has its own pair of tags and no tag is left over', () => {
    const ids = new Set(FORMULAS.map(f => f.id))
    for (const f of FORMULAS) expect(LEVELS[f.id], f.id).toBeDefined()
    for (const id of Object.keys(LEVELS)) expect(ids.has(id), id).toBe(true)
  })

  it('the two curricula agree roughly: lower secondary is MYP, nothing is HL in the Chinese curriculum', () => {
    for (const f of FORMULAS) {
      const l = levelOf(f.id)
      if (l.cn === 'j') expect(l.ib, f.id).toBe('myp')
      if (l.ib === 'hl') expect(['s2', 'u'], f.id).toContain(l.cn)
      expect(Math.abs(CN_ORD[l.cn] - IB_ORD[l.ib]), f.id).toBeLessThanOrEqual(2)
    }
  })

  it('every level has formulas', () => {
    for (const c of ['cn', 'ib'] as const) {
      for (const ch of LEVEL_CHOICES[c]) expect(FORMULAS.some(f => levelOrdinal(f.id, c) === ch.ord), `${c} ${ch.name}`).toBe(true)
    }
  })

  it('switching curricula keeps the ceiling', () => {
    expect(nearestLevel('cn', 3)).toBe(2)
    expect(nearestLevel('ib', 3)).toBe(3)
    expect(nearestLevel('cn', 1)).toBe(1)
    expect(nearestLevel('ib', 5)).toBe(5)
  })
})

describe('cards per level on the templates', () => {
  it('a ceiling never shows a formula above it, and the full set is unchanged', () => {
    let templates = 0, hidden = 0
    for (const t of TEMPLATES) {
      const rec = simulate(buildTemplate(t.id, {}))
      const sits = recognize(rec)
      const tMid = 0.5 * (rec.frameCount - 1) * rec.dt
      const cards = cardsAt(sits, tMid)
      templates++
      for (const c of ['cn', 'ib'] as const) {
        for (const ch of LEVEL_CHOICES[c]) {
          const shown = cards.filter(card => withinLevel(card.formula.id, c, ch.ord))
          for (const card of shown) expect(levelOrdinal(card.formula.id, c), `${t.id} ${c} ${ch.name} ${card.formula.id}`).toBeLessThanOrEqual(ch.ord)
          hidden += cards.length - shown.length
        }
      }
      // The levels do not change what is recognised
      expect(cardsAt(recognize(rec), tMid).map(c => c.formula.id)).toEqual(cards.map(c => c.formula.id))
    }
    expect(templates).toBeGreaterThanOrEqual(21)
    expect(hidden).toBeGreaterThan(0)
  }, 120000)
})
