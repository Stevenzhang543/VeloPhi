/**
 * Formula matching: for a moment t, take the situations active at t, evaluate every formula of each
 * situation with the situation's variables, compare with the simulated measurement and grade the result.
 *   exact formulas    relative error ≤ 1e-6 (energy ledger 1e-8), or absolute ≤ 1e-9 × max(1, |theory|)
 *                     → 'match', otherwise 'deviate'
 *   approximations    graded by their approximation condition: 'approx-ok' / 'approx' / 'approx-invalid'
 *   conditions fail   → 'not-applicable' (the card is listed separately with the reason)
 *   no measurement    → 'no-measure'
 */
import type { FormulaDef } from './library'
import { FORMULAS } from './library'
import type { Node } from './expr'
import { dimension, evaluate, parse, toLatex } from './expr'
import { dimEqual, unitDim } from './units'
import type { Condition, Sample, Situation } from './situations'

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
}

const parsed = new Map<string, Node>()
function ast(f: FormulaDef): Node {
  let a = parsed.get(f.id)
  if (!a) { a = parse(f.expr); parsed.set(f.id, a) }
  return a
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

/** Evaluate one formula for a situation sample and grade it. */
export function evaluateCard(f: FormulaDef, sit: Situation, sample: Sample, opts: FormatOptions): FormulaCard {
  const node = ast(f)
  const conds = sample.conditions
  const required = (f.requires ?? []).map(id => conds.find(c => c.id === id) ?? { id, label: id, status: 'fail' as const, detail: '情形未提供该条件' })
  const approx = f.approxOf ? conds.find(c => c.id === f.approxOf) ?? null : null
  const vars: Record<string, number> = {}
  for (const [k, v] of Object.entries(sample.vars)) vars[k] = v.value
  const measure = sample.measures[f.measure]
  const symbolic = f.latex
  let theory: number | null = null
  let substituted = ''
  let reason = ''
  try {
    theory = evaluate(node, vars)
    const show = (name: string) => {
      const v = sample.vars[name]
      if (!v) return null
      // Angles are shown in degrees; the evaluation itself stays in radians
      if (v.unit === 'rad') return `${formatNumber(v.value * 180 / Math.PI, opts.digits)}^\\circ`
      return formatNumber(v.value, opts.digits)
    }
    substituted = `${f.lhs} = ${toLatex(node, { value: show })} = ${formatNumber(theory, opts.digits)}${unitLatex(f.unit)}`
  } catch (e) {
    reason = (e as Error).message
  }
  const sim = measure && measure.value !== null && Number.isFinite(measure.value) ? measure.value : null
  let absError: number | null = null, relError: number | null = null
  if (theory !== null && sim !== null) {
    absError = sim - theory
    const scale = Math.max(Math.abs(theory), Math.abs(sim))
    relError = scale > 0 ? Math.abs(absError) / scale : 0
  }
  let verdict: Verdict
  const failed = required.filter(c => c.status === 'fail')
  if (failed.length) {
    verdict = 'not-applicable'
    reason = `条件不满足：${failed.map(c => c.label + (c.detail ? `（${c.detail}）` : '')).join('；')}`
  } else if (theory === null) {
    verdict = 'not-applicable'
  } else if (sim === null) {
    verdict = 'no-measure'
    reason = measure?.note ?? '仿真中没有可比较的测量值'
  } else if (f.kind === 'approx') {
    const st = approx?.status ?? 'ok'
    verdict = st === 'ok' ? 'approx-ok' : st === 'approx' ? 'approx' : 'approx-invalid'
    reason = approx ? `${approx.label}：${approx.detail}` : ''
  } else {
    const rel = f.situation === 'energy' ? THRESHOLDS.energyRel : THRESHOLDS.exactRel
    const ok = (relError ?? 1) <= rel || Math.abs(absError ?? 1) <= THRESHOLDS.exactAbs * Math.max(1, Math.abs(theory))
    verdict = ok ? 'match' : 'deviate'
    if (!ok) reason = `偏差超过阈值（相对 ${rel}）。可能原因：${(f.causes ?? ['数值积分误差', '模型假设与场景不符（请检查条件）']).join('；')}`
  }
  const approxNote = required.some(c => c.status === 'approx') && verdict === 'match' ? '（条件近似成立）' : ''
  return {
    key: `${sit.key}/${f.id}`, formula: f, situation: sit, verdict, conditions: approx ? [approx, ...required] : required,
    theory, sim, absError, relError, symbolic, substituted, reason: reason + approxNote,
    measureLabel: measure?.label ?? f.measure, measureNote: measure?.note
  }
}

/** Situations active at t: from their event time (if any, else t0) to t1. */
export function activeSituations(sits: Situation[], t: number): Situation[] {
  return sits.filter(s => (s.tEvent !== undefined ? t >= s.tEvent - 1e-12 && t <= s.t1 + 1e-12 : t >= s.t0 - 1e-12 && t <= s.t1 + 1e-12))
}

/** Formula cards of all situations active at t. */
export function cardsAt(sits: Situation[], t: number, opts: FormatOptions = { digits: 6 }): FormulaCard[] {
  const cards: FormulaCard[] = []
  for (const s of activeSituations(sits, t)) {
    const sample = s.sample(Math.min(Math.max(t, s.t0), s.t1))
    for (const f of FORMULAS) if (f.situation === s.type) cards.push(evaluateCard(f, s, sample, opts))
  }
  return cards
}

/** Dimension check of one formula against its declared unit with the given variable units. */
export function checkDimensions(f: FormulaDef, varUnits: Record<string, string>): string | null {
  if (f.expr.trim() === '0') return null // Zero carries any dimension
  try {
    const dims: Record<string, readonly [number, number, number]> = {}
    for (const [k, u] of Object.entries(varUnits)) dims[k] = unitDim(u)
    const d = dimension(ast(f), dims)
    if (!dimEqual(d, unitDim(f.unit))) return `${f.id}: 结果量纲与单位 ${f.unit} 不符`
    return null
  } catch (e) {
    return `${f.id}: ${(e as Error).message}`
  }
}
