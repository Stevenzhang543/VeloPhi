/**
 * Formula viewing (26.53, D70–D72): categories, search and filters, the reasons an empty result gives, favourites
 * first, the lanes of the formula timeline, and what cards and known values refer to on the canvas.
 */
import { describe, expect, it } from 'vitest'
import { buildTemplate, TEMPLATES } from '../../src/templates'
import { simulate } from '../../src/engine/recording'
import { recognize } from '../../src/formula/recognize'
import { cardsAt, formulaTimeline } from '../../src/formula/match'
import { FORMULAS } from '../../src/formula/library'
import type { FormulaFilter } from '../../src/formula/panel'
import { CATEGORIES, cardHighlight, emptyReasons, forceKindsOf, formulaCategory, matchesSearch, pinnedFirst, rejectedBy, timelineBars, varHighlight, varRef } from '../../src/formula/panel'

const none: FormulaFilter = { search: '', body: '', category: '', verdict: 'all', pinnedOnly: false, pinned: [], pick: null }
const byId = (id: string) => FORMULAS.find(f => f.id === id)!

describe('formula categories and forces', () => {
  it('every formula has a category and every category is used', () => {
    const used = new Set(FORMULAS.map(formulaCategory))
    for (const c of CATEGORIES) expect(used.has(c.id), c.id).toBe(true)
    expect(formulaCategory(byId('incline.a.down'))).toBe('dynamics')
    expect(formulaCategory(byId('incline.v'))).toBe('kinematics')
    expect(formulaCategory(byId('flat.Q'))).toBe('energy')
    expect(formulaCategory(byId('col.v1'))).toBe('collision')
  })

  it('names the forces a formula is about', () => {
    expect(forceKindsOf(byId('incline.N'))).toContain('normal')
    expect(forceKindsOf(byId('incline.f.kinetic'))).toEqual(expect.arrayContaining(['friction', 'normal']))
    expect(forceKindsOf(byId('incline.v'))).not.toContain('friction')
  })
})

describe('filters of the formula panel', () => {
  const rec = simulate(buildTemplate('board-block'))
  const sits = recognize(rec)
  const t = 0.3
  const cards = cardsAt(rec, t, { digits: 6 }, sits).filter(c => c.verdict !== 'not-applicable')
  const block = rec.system.model.dynamic.find(b => b.name.includes('物块') || b.id.includes('block'))!.id

  it('searches titles, symbols and ids', () => {
    expect(cards.length).toBeGreaterThan(2)
    expect(cards.filter(c => matchesSearch(c, '加速度')).length).toBeGreaterThan(0)
    expect(cards.filter(c => matchesSearch(c, 'mu_1')).map(c => c.formula.id)).toContain('bb.a1')
    expect(cards.filter(c => matchesSearch(c, 'bb.a2')).map(c => c.formula.id)).toEqual(['bb.a2'])
    expect(cards.every(c => matchesSearch(c, ''))).toBe(true)
  })

  it('filters by body, category, verdict, favourites and canvas pick, and says which filter emptied the list', () => {
    expect(cards.filter(c => rejectedBy(c, { ...none, body: block }) === null).length).toBeGreaterThan(0)
    expect(cards.filter(c => rejectedBy(c, { ...none, body: 'nobody' }) === null)).toEqual([])
    expect(cards.filter(c => rejectedBy(c, { ...none, verdict: 'deviate' }) === null)).toEqual([])
    const pinned = cards.slice(-1).map(c => c.formula.id)
    expect(cards.filter(c => rejectedBy(c, { ...none, pinnedOnly: true, pinned }) === null).map(c => c.formula.id)).toEqual(pinned)
    expect(pinnedFirst(cards, pinned)[0].formula.id).toBe(pinned[0])
    const picked = cards.filter(c => rejectedBy(c, { ...none, pick: { body: block, force: 'friction' } }) === null)
    expect(picked.length).toBeGreaterThan(0)
    for (const c of picked) expect(forceKindsOf(c.formula)).toContain('friction')
    // Nothing deviates: the verdict filter is named; a search and the verdict together name both
    expect(emptyReasons(cards, { ...none, verdict: 'deviate' })).toEqual(['verdict'])
    expect(emptyReasons(cards, { ...none, search: 'zzzz', category: 'energy' })).toEqual(['search'])
  })

  it('cards and known values refer to bodies, forces, contacts and angles', () => {
    const c = cards.find(x => x.formula.id === 'bb.a1')!
    const h = cardHighlight(c)
    // a1 = μ1 g: the block and the board of μ1, not the ground the board stands on
    expect(c.situation.bodies.length).toBe(3)
    expect(h.bodies).toEqual(c.situation.bodies.slice(0, 2))
    expect(h.forces).toContain('friction')
    const sit = c.situation
    expect(varRef('m', sit)).toEqual({ kind: 'body', body: sit.bodies[0] })
    expect(varRef('M', sit)).toEqual({ kind: 'body', body: sit.bodies[1] })
    expect(varRef('mu1', sit)?.kind).toBe('pair')
    expect(varRef('t', sit)).toBeNull()
    expect(varHighlight('mu1', sit)!.forces).toEqual(['normal', 'friction'])
    const inc = recognize(simulate(buildTemplate('incline'))).find(s => s.type === 'incline')!
    expect(varHighlight('theta', inc)!.angle).toEqual([inc.bodies[0]])
    // N = mg cos θ lights the block and its angle; a formula with no body variables lights the situation
    const incRec = simulate(buildTemplate('incline'))
    const nCard = cardsAt(incRec, 0.2, { digits: 6 }, recognize(incRec)).find(x => x.formula.id === 'incline.N')!
    expect(cardHighlight(nCard)).toMatchObject({ bodies: [inc.bodies[0]], angle: [inc.bodies[0]], forces: ['normal', 'gravity'] })
  })
})

describe('formula timeline', () => {
  it('follows a newer recognition of the same frames', () => {
    const rec = simulate(buildTemplate('incline'))
    const older = recognize(rec), newer = recognize(rec)
    expect(formulaTimeline(rec, older)[0].situation).toBe(older[0])
    const entries = formulaTimeline(rec, newer)
    expect(entries.length).toBe(newer.length)
    for (const e of entries) expect(newer).toContain(e.situation)
  })

  for (const id of TEMPLATES.map(t => t.id).filter((_, i) => i % 5 === 0)) {
    it(`${id}: one bar per situation, bars of a lane do not overlap, colours follow the verdicts`, () => {
      const rec = simulate(buildTemplate(id))
      const sits = recognize(rec)
      const entries = formulaTimeline(rec, sits)
      expect(entries.length).toBe(sits.length)
      const bars = timelineBars(entries, [])
      expect(bars.length).toBe(sits.length)
      for (const b of bars) {
        expect(b.lane).toBeLessThan(4)
        if (b.lane < 3) for (const o of bars) if (o !== b && o.lane === b.lane) expect(o.t1 < b.t0 - 1e-12 || o.t0 > b.t1 + 1e-12).toBe(true)
        const vs = b.entry.cards.filter(c => c.verdict !== 'not-applicable').map(c => c.verdict)
        if (vs.includes('deviate') || vs.includes('approx-invalid')) expect(b.verdict).toBe('deviate')
        else if (vs.length && vs.every(v => v === 'match' || v === 'approx-ok')) expect(b.verdict).toBe('match')
      }
    })
  }
})
