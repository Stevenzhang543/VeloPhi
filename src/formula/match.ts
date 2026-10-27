/**
 * Formula cards (26.53): for a moment t, the situations active at t, every formula of each evaluated with the
 * situation's variables and compared with the simulated measurement — computed in the Rust core
 * (formula/cards.rs), graded there:
 *   exact formulas    relative error ≤ 1e-6 (energy ledger 1e-8), or absolute ≤ 1e-9 × max(1, |theory|)
 *                     → 'match', otherwise 'deviate'
 *   approximations    graded by their approximation condition: 'approx-ok' / 'approx' / 'approx-invalid'
 *   conditions fail   → 'not-applicable';  no measurement → 'no-measure'
 * This module renders the texts and the LaTeX of a card (the symbolic form and the substitution).
 */
import { activeLang, msgText } from '../i18n/locale'
import type { Message } from '../i18n/message'
import { calc, core } from '../engine/core'
import type { Recording } from '../engine/recording'
import type { FormulaDef } from './library'
import { FORMULAS } from './library'
import type { Node } from './expr'
import { parse, toLatex } from './expr'
import type { Condition, RawCondition, RawSample, RawSituation, Sample, Situation } from './recognize'
import { activeSituations, conditionOf, recognize, sampleOf } from './recognize'

export { activeSituations } from './recognize'

/** Limits of 'match': relative, absolute (relative to max(1, |theory|)), and relative for the energy ledger. */
export const THRESHOLDS = { exactRel: 1e-6, exactAbs: 1e-9, energyRel: 1e-8 }

/** Grade of a formula card (see the module header). */
export type Verdict = 'match' | 'deviate' | 'approx-ok' | 'approx' | 'approx-invalid' | 'not-applicable' | 'no-measure'

/** A formula evaluated for a situation and compared with the simulation. */
export interface FormulaCard {
  key: string
  formula: FormulaDef
  situation: Situation
  verdict: Verdict
  /** Conditions this formula depends on, with their status. */
  conditions: Condition[]
  /** Theoretical value (SI). */
  theory: number | null
  /** Simulated measurement (SI). */
  sim: number | null
  /** Simulation minus theory, and its size relative to the larger of the two. */
  absError: number | null
  relError: number | null
  /** LaTeX: the symbolic form, and the form with values substituted. */
  symbolic: string
  substituted: string
  /** User-facing explanation of the verdict. */
  reason: string
  measureLabel: string
  measureNote?: string
  /** The sample the card was evaluated with, and the time of the sample. */
  sample: Sample
  time: number
  /** Value of every node of the formula's expression in pre-order (step-by-step solution); absent when not asked. */
  trace?: number[]
}

/** Number formatting of the cards. */
export interface FormatOptions { digits: number }

/** Number in LaTeX with `digits` significant digits (×10ⁿ outside [1e-3, 1e6)). */
export function formatNumber(v: number, digits: number): string {
  if (!Number.isFinite(v)) return String(v)
  if (v === 0) return '0'
  const a = Math.abs(v)
  if (a >= 1e-3 && a < 1e6) {
    const s = v.toPrecision(digits)
    return s.includes('e') ? sci(v, digits) : trimZeros(s)
  }
  return sci(v, digits)
}

function trimZeros(s: string): string {
  if (!s.includes('.')) return s
  return s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
}

function sci(v: number, digits: number): string {
  const [m, e] = v.toExponential(Math.max(0, digits - 1)).split('e')
  return `${trimZeros(m)}\\times 10^{${Number(e)}}`
}

/** Plain-text number for non-LaTeX places. */
export function formatPlain(v: number | null, digits: number): string {
  if (v === null || !Number.isFinite(v)) return '—'
  if (v === 0) return '0'
  const a = Math.abs(v)
  if (a >= 1e-3 && a < 1e6) return trimZeros(v.toPrecision(digits))
  return v.toExponential(Math.max(0, digits - 1)).replace(/\.?0+e/, 'e')
}

function unitLatex(u: string): string {
  if (!u) return ''
  return `\\,\\mathrm{${u.replace(/·/g, '\\cdot ').replace(/²/g, '^2').replace(/\//g, '/')}}`
}

const parsed = new Map<string, Node>()
/** Parsed expression of a library formula (for its LaTeX; cached). */
export function formulaAst(f: FormulaDef): Node {
  let a = parsed.get(f.id)
  if (!a) { a = parse(f.expr); parsed.set(f.id, a) }
  return a
}

// ---- The library in the core ----

const installed = new WeakSet<object>()
/** Hand the calculation fields of the formula library to the core (once per loaded core). */
export function ensureLibrary() {
  const b = core()
  if (installed.has(b)) return
  calc({ op: 'setLibrary', formulas: libraryJson() })
  installed.add(b)
}

/** The calculation fields of the formula library. */
export function libraryJson() {
  return FORMULAS.map(f => {
    const o: Record<string, unknown> = { id: f.id, situation: f.situation, expr: f.expr, unit: f.unit, measure: f.measure, kind: f.kind }
    if (f.requires) o.requires = [...f.requires]
    if (f.approxOf) o.approxOf = f.approxOf
    if (f.causes) o.causes = [...f.causes]
    return o
  })
}

// ---- Cards ----

type Text = string | Message
const text = (v: Text | null | undefined): string => (v === null || v === undefined ? '' : typeof v === 'string' ? v : msgText(v))

/** Raw card of the core. */
interface RawCard {
  key: string; formula: string; situation: string; verdict: Verdict; conditions: RawCondition[]
  theory: number | null; sim: number | null; absError: number | null; relError: number | null
  reason: Text; measureLabel: Text; measureNote?: Text; trace?: number[]
}

/** LaTeX of the substitution "lhs = expression with values = result unit". */
export function substitutedLatex(f: FormulaDef, sample: Sample, theory: number | null, digits: number): string {
  if (theory === null) return ''
  const show = (name: string) => {
    const v = sample.vars[name]
    if (!v) return null
    // Angles are shown in degrees; the evaluation itself stays in radians
    if (v.unit === 'rad') return `${formatNumber(v.value * 180 / Math.PI, digits)}^\\circ`
    return formatNumber(v.value, digits)
  }
  try {
    return `${f.lhs} = ${toLatex(formulaAst(f), { value: show })} = ${formatNumber(theory, digits)}${unitLatex(f.unit)}`
  } catch {
    return ''
  }
}

function cardOf(raw: RawCard, f: FormulaDef, sit: Situation, sample: Sample, time: number, opts: FormatOptions): FormulaCard {
  const c: FormulaCard = {
    key: raw.key, formula: f, situation: sit, verdict: raw.verdict, conditions: raw.conditions.map(conditionOf),
    theory: raw.theory, sim: raw.sim, absError: raw.absError, relError: raw.relError,
    symbolic: f.latex, substituted: substitutedLatex(f, sample, raw.theory, opts.digits), reason: text(raw.reason),
    measureLabel: text(raw.measureLabel), sample, time
  }
  if (raw.measureNote !== undefined && raw.measureNote !== null) c.measureNote = text(raw.measureNote)
  if (raw.trace) c.trace = raw.trace
  return c
}

const byId = new Map(FORMULAS.map(f => [f.id, f]))

const cardCache = new WeakMap<object, Map<string, FormulaCard[]>>()

/**
 * Formula cards of all situations of a recording active at t, in situation order (cached per recording prefix,
 * time, digits and language).
 */
export function cardsAt(rec: Recording, t: number, opts: FormatOptions & { moment?: boolean; trace?: boolean } = { digits: 6 }, sits: Situation[] = recognize(rec)): FormulaCard[] {
  ensureLibrary()
  const session = rec.session
  const memo = `${rec.frameCount}|${rec.events.length}|${t}|${opts.digits}|${activeLang()}|${opts.moment ? 1 : 0}|${opts.trace ? 1 : 0}`
  let m = cardCache.get(session)
  if (!m) { m = new Map(); cardCache.set(session, m) }
  const hit = m.get(memo)
  if (hit) return hit
  const r = session.call<{ groups: Array<{ situation: RawSituation; sample: RawSample; cards: RawCard[]; t: number }> }>({ op: 'cards', t, moment: !!opts.moment, trace: !!opts.trace })
  const out: FormulaCard[] = []
  for (const g of r.groups) {
    const sit = sits.find(s => s.key === g.situation.key)
    if (!sit) continue
    const sample = sampleOf(g.sample)
    const ts = g.t
    for (const c of g.cards) {
      const f = byId.get(c.formula)
      if (f) out.push(cardOf(c, f, sit, sample, ts, opts))
    }
  }
  if (m.size > 200) m.clear()
  m.set(memo, out)
  return out
}

/** One formula of one situation at time t (clamped to the situation), with the values of its expression's nodes. */
export function evaluateCard(rec: Recording, sit: Situation, formulaId: string, t: number, opts: FormatOptions = { digits: 6 }): FormulaCard | null {
  ensureLibrary()
  const f = byId.get(formulaId)
  if (!f) return null
  const r = rec.session.call<{ card: RawCard | null; sample: RawSample; t: number }>({ op: 'card', situation: sit.key, formula: formulaId, t })
  if (!r.card) return null
  return cardOf(r.card, f, sit, sampleOf(r.sample), r.t, opts)
}

/** Situations with the verdicts of their formulas at a representative time (formula timeline, D71). */
export interface TimelineEntry { situation: Situation; t: number; cards: Array<{ formula: FormulaDef; verdict: Verdict }> }

type RawTimeline = Array<{ situation: RawSituation; t: number; cards: Array<{ formula: string; verdict: Verdict }> }>
const timelineCache = new WeakMap<object, { memo: string; raw: RawTimeline; sits: Situation[]; list: TimelineEntry[] }>()
/** The formula timeline of a recording (cached per recording prefix and language). */
export function formulaTimeline(rec: Recording, sits: Situation[] = recognize(rec)): TimelineEntry[] {
  ensureLibrary()
  const memo = `${rec.frameCount}|${rec.events.length}|${activeLang()}`
  const hit = timelineCache.get(rec.session)
  if (hit && hit.memo === memo && hit.sits === sits) return hit.list
  // The core's answer depends on the recording only; the situations it is matched with may be newer (26.53: a list
  // recognised later on the same frames used to get the entries of the older one)
  const raw = hit && hit.memo === memo ? hit.raw : rec.session.call<{ timeline: RawTimeline }>({ op: 'timeline' }).timeline
  const list: TimelineEntry[] = []
  for (const e of raw) {
    const sit = sits.find(s => s.key === e.situation.key)
    if (!sit) continue
    list.push({ situation: sit, t: e.t, cards: e.cards.flatMap(c => { const f = byId.get(c.formula); return f ? [{ formula: f, verdict: c.verdict }] : [] }) })
  }
  timelineCache.set(rec.session, { memo, raw, sits, list })
  return list
}

/** Formula cards of the situations active at t (shorthand of cardsAt for a list already recognised). */
export function cardsFor(rec: Recording, sits: Situation[], t: number, opts: FormatOptions = { digits: 6 }): FormulaCard[] {
  return activeSituations(sits, t).length ? cardsAt(rec, t, opts, sits) : []
}
