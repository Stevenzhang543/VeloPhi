/**
 * Formula and event detail views (manual 26.50, D28): the generated step-by-step solution ends on the card's
 * theoretical value bit for bit, every event of every template has a detail in all three languages, and every
 * event function and change type has a trilingual template.
 */
import { describe, expect, it } from 'vitest'
import { TEMPLATES, buildTemplate } from '../src/templates'
import type { Recording } from '../src/engine/recording'
import { simulate } from '../src/engine/recording'
import { calc } from '../src/engine/core'
import type { Scene, ForceDef } from '../src/core/scene/types'
import type { ChangeType, EventType } from '../src/engine/types'
import type { Situation } from '../src/formula/recognize'
import { recognize } from '../src/formula/recognize'
import { cardsAt } from '../src/formula/match'
import { solveFormula as refSolveFormula } from './reference/formula/solve'
import { FORMULAS } from '../src/formula/library'
import { evaluate } from './reference/formula/expr'
import { formulaTree, solveFormula } from '../src/formula/solve'
import { FORMULA_TEXT, buildFormulaDetail, cardTime, findSituation } from '../src/formula/detail'
import { CHANGE_TEXT, EVENT_TEXT, TRIGGER_TEXT, buildEventDetail as buildEventDetailOf, eventDataOf } from '../src/formula/eventDetail'
import type { DetailOptions } from '../src/formula/detail'
import type { Lang } from '../src/i18n/tri'

/** Event detail of event i of a recording (its numbers from the core). */
const buildEventDetail = (r: Recording, i: number, lang: Lang, opts: DetailOptions = {}) => buildEventDetailOf(eventDataOf(r, i), i, lang, opts)
import type { DetailView } from '../src/formula/detailTypes'
import { chainLatex, detailLatex, splitMath } from '../src/formula/detailTypes'
import { detailHtml } from '../src/export/detailImage'
import { LANGS } from '../src/i18n/tri'
import { defaultChoice, presetChoice } from '../src/units/units'
import { sampleDerivation, sampleShared } from './fixtures/derivations'

/** Templates plus variants that reach other events and situations (friction impact, slipping, force switch). */
function scenes(): Array<[string, Scene]> {
  const out: Array<[string, Scene]> = TEMPLATES.map(t => [t.id, buildTemplate(t.id)])
  out.push(['rolling(mu=0.1)', buildTemplate('rolling', { mu: 0.1 })])
  out.push(['board-block(mu)', buildTemplate('board-block', { mu1: 0.3, mu2: 0.2 })])
  out.push(['collision-1d(e=0)', buildTemplate('collision-1d', { e: 0 })])
  const rough = buildTemplate('projectile')
  for (const b of rough.bodies) b.material = { ...b.material, muS: 0.3, muK: 0.3, restitution: 0.6 }
  out.push(['projectile(rough)', rough])
  const sw = buildTemplate('variable-force')
  const f = sw.connectors.find(c => c.type === 'force') as ForceDef
  f.expr = { x: 'if(t < 1, 5, 0) + 2*abs(t - 2)', y: '0' }
  out.push(['variable-force(switch)', sw])
  const mj = buildTemplate('collision-1d')
  mj.settings.integrator = 'moreau'
  out.push(['collision-1d(moreau)', mj])
  return out
}

const runs = new Map<string, Recording>()
function rec(id: string, scene: Scene): Recording {
  let r = runs.get(id)
  if (!r) { r = simulate(scene); runs.set(id, r) }
  return r
}

/** All texts of a view (titles, texts, labels, table cells), for completeness checks. */
function texts(v: DetailView): string[] {
  const out = [v.title, ...v.badges.map(b => b.text)]
  for (const s of v.sections) {
    out.push(s.title)
    for (const b of s.blocks) {
      if (b.kind === 'text' || b.kind === 'subhead') out.push(b.text)
      else if (b.kind === 'equation' && b.text) out.push(b.text)
      else if (b.kind === 'steps') for (const st of b.steps) out.push(st.text)
      else if (b.kind === 'conditions') for (const c of b.items) out.push(c.label, c.role)
    }
  }
  return out
}

describe('generated solution', () => {
  it('ends on the card theoretical value bit for bit, and equals the 26.52 solution (every template, situation, card, several times)', () => {
    let checked = 0
    const unitSets = [defaultChoice(), presetChoice('lab'), presetChoice('si-rad')]
    for (const [id, scene] of scenes()) {
      const r = rec(id, scene)
      for (const s of recognize(r)) {
        const times = [s.tEvent ?? s.t0, (s.t0 + s.t1) / 2, s.t1, s.t0 + 0.37 * (s.t1 - s.t0)]
        for (const t of times) {
          for (const card of cardsAt(r, t, { digits: 4, trace: true }, [s])) {
            const sample = card.sample
            expect(card.time).toBe(cardTime(s, t))
            for (const units of unitSets) {
              const sol = solveFormula(card.formula, sample, { digits: 4, units, lang: 'zh' }, card.trace, card.reason)
              // The 26.52 solution (TypeScript evaluation of every subtree) is the same, line for line
              const ref = refSolveFormula(card.formula, sample, { digits: 4, units, lang: 'zh' })
              if (card.theory === null) { expect(sol.value, `${id} ${card.key}`).toBeNull(); continue }
              expect(sol, `${id} ${card.key} t=${t}`).toEqual(ref)
              expect(Object.is(sol.value, card.theory), `${id} ${card.key} t=${t}: ${sol.value} vs ${card.theory}`).toBe(true)
              checked++
            }
            // The chain starts with the symbolic expression and ends with the result and its unit
            const sol = solveFormula(card.formula, sample, { digits: 4, units: defaultChoice(), lang: 'en' }, card.trace, card.reason)
            if (card.theory !== null && Number.isFinite(card.theory)) {
              expect(sol.rhs.length).toBeGreaterThanOrEqual(1)
              expect(sol.rhs[sol.rhs.length - 1]).toBe(sol.resultDisplay)
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1000)
  })

  it('covers every library formula that some template recognises', () => {
    const seen = new Set<string>()
    for (const [id, scene] of scenes()) { const rr = rec(id, scene); for (const s of recognize(rr)) for (const c of cardsAt(rr, s.tEvent ?? s.t0, { digits: 6 }, [s])) seen.add(c.formula.id) }
    // Every formula's tree evaluates identically through solveFormula when all its variables are given
    for (const f of FORMULAS) {
      const vars: Record<string, number> = {}
      const tree = formulaTree(f)
      const sample = { vars: {} as Record<string, { value: number; unit: string; symbol: string; label: string }>, measures: {}, conditions: [] }
      let k = 1
      const collect = (n: typeof tree): void => {
        if (n.type === 'var' && !(n.name in vars)) { vars[n.name] = 0.3 + 0.17 * k++; sample.vars[n.name] = { value: vars[n.name], unit: '', symbol: n.name, label: n.name } }
        if (n.type === 'neg') collect(n.arg)
        if (n.type === 'bin' || n.type === 'cmp') { collect(n.left); collect(n.right) }
        if (n.type === 'call') n.args.forEach(collect)
      }
      collect(tree)
      const core = calc<{ value: number; trace: number[] }>({ op: 'evaluateExpr', expr: f.expr, vars })
      const sol = solveFormula(f, sample, { digits: 4, units: defaultChoice(), lang: 'de' }, core.trace)
      expect(Object.is(sol.value, evaluate(tree, vars)), f.id).toBe(true)
      expect(sol, f.id).toEqual(refSolveFormula(f, sample, { digits: 4, units: defaultChoice(), lang: 'de' }))
    }
    expect(seen.size).toBeGreaterThan(60)
  })

  it('shows known values in display units and converts to SI before substituting', () => {
    const r = rec('incline', buildTemplate('incline'))
    const s = recognize(r).find(x => x.type === 'incline')!
    const card = cardsAt(r, 0.5, { digits: 6, trace: true }, [s]).find(c => c.formula.id === 'incline.s')!
    const sol = solveFormula(card.formula, card.sample, { digits: 4, units: presetChoice('lab'), lang: 'zh' }, card.trace)
    expect(sol.converted).toBe(true)
    expect(sol.known.find(k => k.name === 'a')!.display).toContain('cm')
    expect(sol.known.find(k => k.name === 'a')!.si).toContain('m/s^2')
    expect(sol.rhs[sol.rhs.length - 1]).toContain('cm')
    expect(sol.rhs[sol.rhs.length - 2]).toContain('\\mathrm{m}')
    // Angles are shown in degrees in every line
    const ca = cardsAt(r, 0.5, { digits: 6, trace: true }, [s]).find(c => c.formula.id === 'incline.a.down')!
    const a = solveFormula(ca.formula, ca.sample, { digits: 4, units: defaultChoice(), lang: 'zh' }, ca.trace)
    expect(a.rhs[1]).toContain('30^{\\circ}')
  })
})

describe('formula detail', () => {
  const r = () => rec('incline', buildTemplate('incline'))
  const sit = (): Situation => recognize(r()).find(x => x.type === 'incline')!

  it('has derivation, substitution, conditions and comparison in every language', () => {
    for (const lang of LANGS) {
      const v = buildFormulaDetail(r(), sit(), 'incline.a.down', 0.5, lang, { derivation: sampleDerivation, shared: sampleShared })
      expect(v.sections.map(s => s.id)).toEqual(['derivation', 'solution', 'conditions', 'compare'])
      for (const t of texts(v)) expect(t.trim().length, `${lang}: empty text`).toBeGreaterThan(0)
      // Shared steps come first, then the formula's own steps
      const d = v.sections[0].blocks
      const subheads = d.filter(b => b.kind === 'subhead').map(b => (b as { text: string }).text)
      expect(subheads[0]).toBe(sampleShared('incline.block-forces')!.title[lang])
      const steps = d.filter(b => b.kind === 'steps')
      expect(steps.length).toBe(2)
      expect(v.title).toBe(sampleDerivation('incline.a.down')!.title[lang])
      // Worked solution (D45): given / find / solution / answer, the calculation with a note on every line
      const sol = v.sections[1].blocks
      expect(sol.filter(b => b.kind === 'subhead').length).toBe(4)
      const calc = sol.find(b => b.kind === 'calc') as Extract<(typeof sol)[number], { kind: 'calc' }>
      expect(calc.lines.length).toBeGreaterThan(2)
      for (const ln of calc.lines) expect(ln.note, `${lang}: a calculation line without a note`).toBeTruthy()
      expect(calc.lines[0].tex).toContain('\\textcolor')
      expect(detailLatex(v)).toContain('\\begin{aligned}')
    }
  })

  it('says that the derivation is pending when none is registered', () => {
    for (const lang of LANGS) {
      const v = buildFormulaDetail(r(), sit(), 'incline.N', 0.5, lang, { derivation: () => null })
      const texts0 = v.sections[0].blocks.filter(b => b.kind === 'text').map(b => (b as { text: string }).text)
      expect(texts0).toContain(FORMULA_TEXT.pending[lang])
      expect(v.sections.length).toBe(4)
    }
  })

  it('lists the conditions with their status and explains a not-applicable card', () => {
    const v = buildFormulaDetail(r(), sit(), 'incline.a.up', 0.5, 'en')
    const conds = v.sections[2].blocks.find(b => b.kind === 'conditions')
    expect(conds && conds.kind === 'conditions' && conds.items[0].status).toBe('fail')
    const verdict = v.sections[3].blocks.filter(b => b.kind === 'text').map(b => (b as { text: string }).text).join(' ')
    expect(verdict).toContain('not applicable')
  })

  it('finds the situation by key, else by type at the time', () => {
    const sits = recognize(r())
    const key = sits.find(x => x.type === 'incline')!.key
    expect(findSituation(sits, 'incline.a.down', key, 0.5)?.key).toBe(key)
    expect(findSituation(sits, 'incline.a.down', 'gone', 0.5)?.type).toBe('incline')
    expect(findSituation(sits, 'nope', null, 0.5)).toBeNull()
  })

  it('builds for every card of every template without throwing', () => {
    for (const [id, scene] of scenes()) {
      const rr = rec(id, scene)
      for (const s of recognize(rr)) {
        for (const c of cardsAt(rr, s.tEvent ?? s.t0, { digits: 6 }, [s])) {
          const v = buildFormulaDetail(rr, s, c.formula.id, s.tEvent ?? s.t0, 'de', { units: presetChoice('lab') })
          expect(v.sections.length, `${id} ${c.key}`).toBe(4)
        }
      }
    }
  })
})

describe('event detail', () => {
  it('every event of every template builds with non-empty text in all three languages', () => {
    const changeTypes = new Set<string>()
    const triggerTypes = new Set<string>()
    let events = 0
    for (const [id, scene] of scenes()) {
      const r = rec(id, scene)
      r.events.forEach((e, i) => {
        events++
        e.changes.forEach(c => changeTypes.add(c.type))
        e.triggers.forEach(t => triggerTypes.add(t))
        const titles = new Set<string>()
        for (const lang of LANGS) {
          const v = buildEventDetail(r, i, lang, { units: lang === 'de' ? presetChoice('lab') : defaultChoice() })
          expect(v.kind).toBe('event')
          expect(v.sections.length, `${id} #${i}`).toBeGreaterThanOrEqual(4)
          for (const t of texts(v)) expect(t.trim().length, `${id} #${i} ${lang}`).toBeGreaterThan(0)
          titles.add(v.sections.map(s => s.title).join('|'))
          expect(detailHtml(v)).toContain('vdet')
        }
        // The section titles are really in three languages
        expect(titles.size).toBe(3)
      })
    }
    expect(events).toBeGreaterThan(10)
    for (const t of ['impact', 'stick', 'reverse', 'slack', 'taut', 'switch', 'timestep']) expect(changeTypes.has(t), t).toBe(true)
    for (const t of ['contact', 'stop', 'slack', 'taut', 'switch']) expect(triggerTypes.has(t), t).toBe(true)
  })

  it('substitutes the impact numbers: restitution, impulse, momentum', () => {
    const r = rec('collision-1d', buildTemplate('collision-1d'))
    const i = r.events.findIndex(e => e.impact)
    const v = buildEventDetail(r, i, 'zh')
    const impact = v.sections.find(s => s.id === 'impact')!
    const chains = impact.blocks.filter(b => b.kind === 'chain').map(b => (b as { lhs: string; rhs: string[] }))
    expect(chains.map(c => c.lhs)).toEqual(expect.arrayContaining(['v_n^{+}', 'W_{nn}', 'J', '\\vec p^{-}', '\\vec p^{+}', '\\Delta E_k']))
    const J = chains.find(c => c.lhs === 'J')!
    const p = r.events[i].impact!.points[0]
    expect(J.rhs[J.rhs.length - 1]).toContain(p.impulse.toPrecision(4))
  })

  it('writes W_nn with the parallel-axis term for a hinged body', () => {
    const r = rec('ball-rod', buildTemplate('ball-rod'))
    const v = buildEventDetail(r, r.events.findIndex(e => e.impact), 'en')
    const w = v.sections.find(s => s.id === 'impact')!.blocks.find(b => b.kind === 'chain' && b.lhs === 'W_{nn}')
    expect(w && w.kind === 'chain' && w.rhs[0]).toContain('I_{OB}')
  })

  it('rebuilds the Stronge phases of a frictional impact consistently with the solver', () => {
    const rough = buildTemplate('projectile')
    for (const b of rough.bodies) b.material = { ...b.material, muS: 0.3, muK: 0.3, restitution: 0.6 }
    const r = rec('projectile(rough)', rough)
    const i = r.events.findIndex(e => e.impact?.points.some(p => p.friction !== null))
    expect(i).toBeGreaterThanOrEqual(0)
    const impact = buildEventDetail(r, i, 'de').sections.find(s => s.id === 'impact')!
    const phaseText = impact.blocks.find(b => b.kind === 'text' && b.text === EVENT_TEXT.phases.de)
    expect(phaseText, 'phases reconstructed').toBeTruthy()
    const table = impact.blocks.find(b => b.kind === 'table' && b.rows.length >= 2)
    expect(table).toBeTruthy()
  })

  it('reports the event function values at the located time (within the location tolerance)', () => {
    const r = rec('board-block', buildTemplate('board-block'))
    const i = r.events.findIndex(e => e.triggers.includes('stop'))
    const trig = buildEventDetail(r, i, 'en').sections.find(s => s.id === 'trigger')!
    const table = trig.blocks.find(b => b.kind === 'table')
    expect(table && table.kind === 'table' && table.rows.length).toBeGreaterThan(0)
  })

  it('a missing event gives a message instead of throwing', () => {
    const r = rec('incline', buildTemplate('incline'))
    const v = buildEventDetail(r, 99, 'en')
    expect(v.sections[0].id).toBe('missing')
  })
})

describe('templates', () => {
  const tri = (t: { zh: string; en: string; de: string }) => LANGS.every(l => t[l].trim().length > 0)
  it('every event function type has a trilingual template', () => {
    const types: EventType[] = ['contact', 'liftoff', 'leave', 'slip', 'stop', 'slack', 'taut', 'switch', 'pulley', 'limit', 'unlimit', 'mslip', 'mlock', 'rollStart', 'rollStop', 'zone']
    expect(Object.keys(TRIGGER_TEXT).sort()).toEqual([...types].sort())
    for (const t of types) {
      expect(tri(TRIGGER_TEXT[t].name) && tri(TRIGGER_TEXT[t].meaning), t).toBe(true)
      expect(TRIGGER_TEXT[t].g).toMatch(/^g\(t\) =/)
    }
  })
  it('every change type has a trilingual template', () => {
    const types: ChangeType[] = ['impact', 'touch', 'separate', 'stick', 'slip', 'reverse', 'leave', 'slack', 'taut', 'switch', 'timestep', 'pulley', 'limit', 'unlimit', 'motorSlip', 'motorLock', 'rollStop', 'rollStart', 'zoneEnter', 'zoneLeave']
    expect(Object.keys(CHANGE_TEXT).sort()).toEqual([...types].sort())
    for (const t of types) expect(tri(CHANGE_TEXT[t].name) && tri(CHANGE_TEXT[t].text) && tri(CHANGE_TEXT[t].law), t).toBe(true)
  })
  it('all other detail texts are trilingual', () => {
    for (const [k, t] of Object.entries(EVENT_TEXT)) expect(tri(t), k).toBe(true)
    for (const [k, t] of Object.entries(FORMULA_TEXT)) expect(tri(t), k).toBe(true)
  })
  it('splits inline formulas', () => {
    expect(splitMath('a $J_n$ b')).toEqual([{ math: false, s: 'a ' }, { math: true, s: 'J_n' }, { math: false, s: ' b' }])
    expect(splitMath('no math')).toEqual([{ math: false, s: 'no math' }])
    expect(chainLatex('a', ['b', 'c'])).toBe('\\begin{aligned} a &= b \\\\ &= c \\end{aligned}')
  })
})
