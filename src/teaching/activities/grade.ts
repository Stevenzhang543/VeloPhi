/**
 * Expected answers and grading of activities (26.56, D102). The expected answer of every item is read from the model
 * evaluated in the Rust core (`modelEval`); this module only compares the learner's input with it, item by item and
 * dimension by dimension (concept, unit, direction, modelling, calculation, explanation), with the scaled error
 * e = |q − q_ref| / max(|q_ref|, q_scale) of the blueprint (§9.1). Hints are counted, never deducted.
 */
import { evalModel } from '../../engine/models'
import type { ModelResult, ModelState } from '../../engine/models'
import { modelById, exampleInputs } from '../../content/models'
import type { ActivitySpec, ChoiceQuestion, Dimension, MultiQuestion, NumberQuestion, Question, TrendQuestion } from './types'

export type Verdict = 'correct' | 'wrong'
export type Verdicts = Partial<Record<Dimension, Verdict>>

/** A model evaluation reduced to what grading needs. */
export interface Evaluation {
  model: string
  inputs: Record<string, number>
  outputs: Record<string, { value: number | null; state: ModelState; unit: string }>
  conditions: Record<string, ModelState>
  constantsSet: string
  result: ModelResult
}

/** Inputs of the main model: the activity's (or the transfer's) values over the model's worked example. */
export function activityInputs(a: ActivitySpec, over: Record<string, number> = a.inputs): Record<string, number> {
  const m = modelById(a.models[0])
  return { ...(m ? exampleInputs(m) : {}), ...over }
}

/** Evaluate the main model of an activity in the core. */
export function evaluate(model: string, inputs: Record<string, number>, constantsSet = 'CODATA2022'): Evaluation {
  const r = evalModel(model, inputs, { constantsSet })
  const outputs: Evaluation['outputs'] = {}
  for (const o of r.outputs) if (!outputs[o.id] || o.state === 'applicable' || o.state === 'approximate') outputs[o.id] = { value: o.value, state: o.state, unit: o.unit }
  return { model, inputs, outputs, conditions: Object.fromEntries(r.conditions.map(c => [c.id, c.state])), constantsSet: r.constantsSet, result: r }
}

/** The correct option of a choice question for an evaluation (null when the model gives none). */
export function expectedChoice(q: ChoiceQuestion, ev: Evaluation): string | null {
  const a = q.answer
  if ('fixed' in a) return a.fixed
  if ('condition' in a) {
    const held = Object.entries(ev.conditions).filter(([, s]) => s === 'applicable').map(([id]) => id)
    for (const id of held) {
      const opt = a.map ? a.map[id] : id
      if (opt && q.options.some(o => o.id === opt)) return opt
    }
    return null
  }
  const v = ev.outputs[a.sign.output]?.value
  if (v === null || v === undefined) return null
  return v > 0 ? a.sign.pos : v < 0 ? a.sign.neg : (a.sign.zero ?? null)
}

export interface ItemGrade {
  verdicts: Verdicts
  expected: unknown
  /** Feedback ids of the chosen wrong options (misconceptions). */
  feedback: string[]
  /** The item cannot be graded because the model gives no value here. */
  ungradable?: boolean
}

export function gradeChoice(q: ChoiceQuestion, ev: Evaluation, chosen: string | null): ItemGrade {
  const expected = expectedChoice(q, ev)
  if (expected === null) return { verdicts: {}, expected, feedback: [], ungradable: true }
  const ok = chosen === expected
  return { verdicts: { [q.dimension]: ok ? 'correct' : 'wrong' }, expected, feedback: !ok && chosen && q.options.find(o => o.id === chosen)?.feedback ? [chosen] : [] }
}

export function gradeMulti(q: MultiQuestion, chosen: string[]): ItemGrade {
  const want = new Set(q.answer)
  const got = new Set(chosen)
  const ok = want.size === got.size && [...want].every(x => got.has(x))
  return { verdicts: { modelling: ok ? 'correct' : 'wrong' }, expected: [...want], feedback: chosen.filter(c => !want.has(c) && q.options.find(o => o.id === c)?.feedback) }
}

/** Scaled error of a value against a reference (blueprint §9.1). */
export function scaledError(value: number, ref: number, scale = 0): number {
  const s = Math.max(Math.abs(ref), scale)
  return s === 0 ? Math.abs(value) : Math.abs(value - ref) / s
}

export function gradeNumber(q: NumberQuestion, ev: Evaluation, value: number | null, unit: string | null): ItemGrade {
  const out = ev.outputs[q.output]
  if (!out || out.value === null || !(out.state === 'applicable' || out.state === 'approximate')) return { verdicts: {}, expected: null, feedback: [], ungradable: true }
  const ref = out.value
  const verdicts: Verdicts = { unit: unit === out.unit ? 'correct' : 'wrong' }
  if (value === null || !Number.isFinite(value)) verdicts.calculation = 'wrong'
  else if (scaledError(value, ref, q.scale) <= q.tol) {
    verdicts.calculation = 'correct'
    if (q.signed) verdicts.direction = 'correct'
  } else if (q.signed && scaledError(Math.abs(value), Math.abs(ref), q.scale) <= q.tol && Math.sign(value) !== Math.sign(ref)) {
    // the right size with the wrong sign: a direction error, not a calculation error
    verdicts.calculation = 'correct'
    verdicts.direction = 'wrong'
  } else verdicts.calculation = 'wrong'
  return { verdicts, expected: { value: ref, unit: out.unit, state: out.state }, feedback: [] }
}

export type Trend = 'increases' | 'decreases' | 'constant' | 'mixed'
export const TREND_OPTIONS: Array<Exclude<Trend, 'mixed'>> = ['increases', 'decreases', 'constant']

/** How a sequence of values changes (relative changes below 1e−9 count as constant). */
export function trendOf(values: Array<number | null>): Trend | null {
  const v = values.filter((x): x is number => x !== null && Number.isFinite(x))
  if (v.length < 2) return null
  const span = Math.max(...v.map(Math.abs), 1e-300)
  const d = v.slice(1).map((x, i) => x - v[i]).map(x => (Math.abs(x) <= 1e-9 * span ? 0 : Math.sign(x)))
  if (d.every(x => x === 0)) return 'constant'
  if (d.every(x => x >= 0)) return 'increases'
  if (d.every(x => x <= 0)) return 'decreases'
  return 'mixed'
}

export function gradeTrend(_q: TrendQuestion, observed: Trend | null, chosen: string | null): ItemGrade {
  if (observed === null || observed === 'mixed') return { verdicts: {}, expected: observed, feedback: [], ungradable: true }
  return { verdicts: { concept: chosen === observed ? 'correct' : 'wrong' }, expected: observed, feedback: [] }
}

/** A learner's answer to one item. */
export type Answer = { choice: string | null } | { choices: string[] } | { value: number | null; unit: string | null }

/** Grade any question (trend questions need the observed trend). */
export function gradeItem(q: Question, ev: Evaluation, answer: Answer | undefined, observed?: Trend | null): ItemGrade {
  switch (q.kind) {
    case 'choice': return gradeChoice(q, ev, answer && 'choice' in answer ? answer.choice : null)
    case 'multi': return gradeMulti(q, answer && 'choices' in answer ? answer.choices : [])
    case 'number': return gradeNumber(q, ev, answer && 'value' in answer ? answer.value : null, answer && 'unit' in answer ? answer.unit : null)
    case 'trend': return gradeTrend(q, observed ?? null, answer && 'choice' in answer ? answer.choice : null)
  }
}

/** Tally of verdicts per dimension. */
export function tally(grades: ItemGrade[]): Record<Dimension, { correct: number; total: number }> {
  const t = { concept: { correct: 0, total: 0 }, unit: { correct: 0, total: 0 }, direction: { correct: 0, total: 0 }, modelling: { correct: 0, total: 0 }, calculation: { correct: 0, total: 0 }, explanation: { correct: 0, total: 0 } }
  for (const g of grades) for (const [d, v] of Object.entries(g.verdicts) as Array<[Dimension, Verdict]>) { t[d].total++; if (v === 'correct') t[d].correct++ }
  return t
}

/**
 * The rule for mastery evidence (shown to the learner): in one complete attempt every graded dimension of the core
 * questions and of the transfer questions is correct at its first check (keepFirst). Hints are allowed and recorded;
 * opening a page is a visit.
 */
/** The first check of a question with the answer then given: the evidence of an attempt. */
export interface FirstCheck { grade: ItemGrade; answer: Answer }

/**
 * Keep the first check of each question (26.56 hand check). The feedback after a check names the reference answer;
 * correcting and checking again is practice, so later checks never replace the first one in the evidence.
 */
export function keepFirst(book: Record<string, FirstCheck>, id: string, grade: ItemGrade, answer: Answer): FirstCheck {
  if (!book[id]) book[id] = { grade, answer }
  return book[id]
}

export function isMastery(core: ItemGrade[], transfer: ItemGrade[]): boolean {
  const all = [...core, ...transfer]
  if (!transfer.length || all.some(g => g.ungradable)) return false
  return all.every(g => Object.values(g.verdicts).length > 0 && Object.values(g.verdicts).every(v => v === 'correct'))
}
