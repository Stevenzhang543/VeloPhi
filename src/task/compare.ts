/**
 * One comparison service for answers, predictions and checks (26.57, D117; manual §5.6, VP-08). The rule of the
 * manual is
 *
 *     delta = |q − q_ref|,   pass ⇔ delta ≤ atol + rtol · max(|q|, |q_ref|)
 *
 * with atol in the unit of the quantity. The old sources keep their own tolerances (manual §8.3: “保留旧题目的容差
 * 语义”), expressed as rules of this service so that every entry point compares through one function:
 *
 * - problems (teaching/problems.ts): delta ≤ tol·|q_ref| + abs (tol 0.02, abs 10⁻⁶ by default);
 * - activities (teaching/activities/grade.ts): delta ≤ tol·max(|q_ref|, scale);
 * - predictions (analysis/prediction.ts): delta / max(|q|, |q_ref|) graded 1 % / 5 % (round-off counts as exact).
 *
 * Answers in another unit are converted to SI first (T07, T27), so 72 km/h and 20 m/s are the same answer; a value
 * of the right size with the wrong sign is a direction error, not a calculation error.
 */
import { KINDS, kindOf } from '../units/units'

/** A tolerance rule. */
export type Rule =
  | { kind: 'unified'; atol: number; rtol: number }
  | { kind: 'problem'; tol: number; abs: number }
  | { kind: 'scaled'; tol: number; scale: number }
  | { kind: 'relative'; ok: number; warn: number }

/** Result of one comparison. */
export interface Comparison {
  rule: Rule['kind']
  delta: number
  /** Largest delta that passes. */
  limit: number
  pass: boolean
  /** delta / max(|q|, |q_ref|) (null when both are 0). */
  rel: number | null
  /** Graded outcome of the relative rule ('ok' / 'warn' / 'bad'); the pass of the others. */
  grade: 'ok' | 'warn' | 'bad'
}

/** Compare q with q_ref under a rule. Non-finite inputs never pass. */
export function compareValues(q: number, ref: number, rule: Rule): Comparison {
  const delta = Math.abs(q - ref)
  const big = Math.max(Math.abs(q), Math.abs(ref))
  const rel = big === 0 ? 0 : delta / big
  let limit: number
  switch (rule.kind) {
    case 'unified': limit = rule.atol + rule.rtol * big; break
    case 'problem': limit = rule.tol * Math.abs(ref) + rule.abs; break
    case 'scaled': {
      // exactly the activities' scaled error |q − q_ref| / max(|q_ref|, scale) ≤ tol (absolute |q| when the scale is 0)
      const s = Math.max(Math.abs(ref), rule.scale)
      const e = s === 0 ? Math.abs(q) : delta / s
      const pass = Number.isFinite(q) && Number.isFinite(ref) && e <= rule.tol
      return { rule: 'scaled', delta, limit: s === 0 ? rule.tol : rule.tol * s, pass, rel, grade: pass ? 'ok' : 'bad' }
    }
    case 'relative': {
      // round-off differences count as exact (analysis/prediction.ts relativeError)
      const r = big === 0 || delta <= 1e-12 * big ? 0 : delta / big
      const finite = Number.isFinite(q) && Number.isFinite(ref)
      const grade = !finite ? 'bad' : r <= rule.ok ? 'ok' : r <= rule.warn ? 'warn' : 'bad'
      return { rule: 'relative', delta, limit: rule.ok * big, pass: finite && grade === 'ok', rel: big === 0 ? 0 : r, grade }
    }
  }
  const pass = Number.isFinite(q) && Number.isFinite(ref) && delta <= limit
  return { rule: rule.kind, delta, limit, pass, rel, grade: pass ? 'ok' : 'bad' }
}

/** The rule of an old problem question. */
export function problemRule(q: { tolerance?: number; absTolerance?: number }): Rule { return { kind: 'problem', tol: q.tolerance ?? 0.02, abs: q.absTolerance ?? 1e-6 } }
/** The rule of an activity number question. */
export function activityRule(q: { tol: number; scale?: number }): Rule { return { kind: 'scaled', tol: q.tol, scale: q.scale ?? 0 } }
/** The rule of a prediction. */
export const PREDICTION_RULE: Rule = { kind: 'relative', ok: 0.01, warn: 0.05 }
/** Default budget of task results checked against an independent method (rounding-level agreement is not required). */
export const CHECK_RULE: Rule = { kind: 'unified', atol: 1e-9, rtol: 1e-6 }

/** A unit spelled as written (km/h, cm, g, °, μC, kΩ …) → SI factor, offset and SI unit; null when unknown. */
export function unitInfo(unit: string): { factor: number; offset: number; si: string } | null {
  const u = unit.trim().replace(/\s+/g, '').replace(/^deg$/i, '°').replace('^2', '²').replace('uC', 'μC').replace('ohm', 'Ω')
  if (u === '' || u === '1') return { factor: 1, offset: 0, si: '1' }
  for (const k of KINDS) for (const o of k.options) if (o.id === u) return { factor: o.inv ? 1 / o.inv : o.factor, offset: o.offset ?? 0, si: k.si }
  return null
}

/** A value in a unit as SI (exact for units that are 1/n of SI: 30 cm → 0.3 m). */
export function toSI(value: number, unit: string): number | null {
  const u = unit.trim().replace(/\s+/g, '').replace('^2', '²')
  for (const k of KINDS) for (const o of k.options) if (o.id === u) return o.inv ? value / o.inv + (o.offset ?? 0) : value * o.factor + (o.offset ?? 0)
  return u === '' || u === '1' ? value : null
}

/** Two SI units measure the same kind of quantity (N/C and V/m, N·s and kg·m/s). */
export function sameKind(a: string, b: string): boolean { return a === b || (kindOf(a) !== null && kindOf(a) === kindOf(b)) }

/** Verdict of a numeric answer by dimension (manual §8.3). */
export interface AnswerVerdict { unit: 'correct' | 'wrong'; calculation: 'correct' | 'wrong'; direction?: 'correct' | 'wrong'; si: number | null; comparison: Comparison | null }

/**
 * Grade an answer given in any unit of the right kind against a reference in SI: the unit dimension is wrong when
 * the unit measures something else (m/s for a force), the value is converted and compared, and a signed answer of the
 * right size with the wrong sign is a direction error (T27).
 */
export function gradeAnswer(value: number | null, unit: string, ref: number, refUnit: string, rule: Rule, signed = false): AnswerVerdict {
  const info = unitInfo(unit)
  const unitOk = !!info && sameKind(info.si === '1' ? '' : info.si, refUnit === '1' ? '' : refUnit)
  if (value === null || !Number.isFinite(value)) return { unit: unitOk ? 'correct' : 'wrong', calculation: 'wrong', si: null, comparison: null }
  const si = unitOk ? toSI(value, unit) : value
  if (si === null) return { unit: 'wrong', calculation: 'wrong', si: null, comparison: null }
  const c = compareValues(si, ref, rule)
  if (c.pass) return { unit: unitOk ? 'correct' : 'wrong', calculation: 'correct', direction: signed ? 'correct' : undefined, si, comparison: c }
  if (signed && Math.sign(si) !== Math.sign(ref) && compareValues(Math.abs(si), Math.abs(ref), rule).pass) return { unit: unitOk ? 'correct' : 'wrong', calculation: 'correct', direction: 'wrong', si, comparison: c }
  return { unit: unitOk ? 'correct' : 'wrong', calculation: 'wrong', direction: signed ? undefined : undefined, si, comparison: c }
}
