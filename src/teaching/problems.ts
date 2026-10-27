/**
 * 26.52 problems (D40 revised): a problem is a scene, a stem and questions. Numeric answers come from the
 * simulation — a quantity at a time, at an event, at the end of the run or its extreme value, the time of an
 * event, or the measured result of a formula of a recognised situation — so changing the scene changes the
 * answers. A formula card, where one applies, gives the theoretical value shown beside it. Choice questions have
 * a fixed answer or one read from the simulation (the option index is the number of bounds the value exceeds).
 *
 * Problem files (`*.velophi-problem.json`): `{ format: 'velophi-problem', version: 1, problem }` with the scene
 * in scene file format inside; answers are plain (teaching use, no protection against cheating).
 *
 * Pure (no DOM, no Vue).
 */
import { tl } from '../i18n'
import type { Lang, Tri } from '../i18n/tri'
import { fillParams } from '../i18n/tri'
import type { Scene } from '../core/scene/types'
import { parseScene, serializeScene, SceneFileError } from '../core/scene/io'
import type { ChangeType, Recording } from '../engine/recording'
import { extremeOf, listQuantities, valueAtFrame, valuesAtEvent } from '../engine/observe'
import type { Situation } from '../formula/recognize'
import type { PredictionTarget, TargetValue } from '../analysis/prediction'
import { evaluateTarget, firstEvent, relativeError } from '../analysis/prediction'
import { formatSig } from '../units/units'

/** A text of a problem: the author's own (one language) or trilingual (built-in problems). */
export type PText = string | Tri

/** The text in a language, with `{name}` placeholders filled. */
export function ptext(t: PText | undefined, lang: Lang, params: Record<string, string | number> = {}): string {
  if (t === undefined) return ''
  return fillParams(typeof t === 'string' ? t : t[lang] || t.zh, params)
}

/** What a numeric answer is read from. */
export type ProblemTarget = PredictionTarget
  /** A quantity just before or just after the first event of a kind (involving `body` when given). */
  | { kind: 'atEvent'; id: string; event: ChangeType; body?: string | null; side: 'before' | 'after' }
  /** A quantity at the end of the run. */
  | { kind: 'end'; id: string }
  /** The largest or smallest value of a quantity over the run. */
  | { kind: 'extreme'; id: string; which: 'max' | 'min' }

export interface NumericQuestion {
  id: string
  type: 'numeric'
  prompt: PText
  target: ProblemTarget
  /** Relative tolerance of a correct answer (default 2 %). */
  tolerance?: number
  /** Absolute tolerance (SI) for answers near zero (default 1e-6). */
  absTolerance?: number
  hint?: PText
  explain?: PText
}

export interface ChoiceQuestion {
  id: string
  type: 'choice'
  prompt: PText
  options: PText[]
  /** Fixed correct option (index). */
  answer?: number
  /** Correct option from the simulation: the number of `bounds` (ascending, SI) the value exceeds. */
  answerFrom?: { target: ProblemTarget; bounds: number[] }
  hint?: PText
  explain?: PText
}

export type ProblemQuestion = NumericQuestion | ChoiceQuestion

/** Textbook chapters of the problem gallery. */
export const CHAPTERS = [
  { id: 'kinematics', label: { zh: '匀变速直线运动', en: 'Uniformly accelerated motion', de: 'Gleichmäßig beschleunigte Bewegung' } },
  { id: 'forces', label: { zh: '相互作用', en: 'Forces and equilibrium', de: 'Kräfte und Gleichgewicht' } },
  { id: 'newton', label: { zh: '牛顿运动定律', en: "Newton's laws", de: 'Newtonsche Gesetze' } },
  { id: 'projectile', label: { zh: '抛体运动', en: 'Projectile motion', de: 'Wurfbewegungen' } },
  { id: 'circular', label: { zh: '圆周运动', en: 'Circular motion', de: 'Kreisbewegung' } },
  { id: 'gravitation', label: { zh: '万有引力', en: 'Gravitation', de: 'Gravitation' } },
  { id: 'energy', label: { zh: '机械能', en: 'Mechanical energy', de: 'Mechanische Energie' } },
  { id: 'momentum', label: { zh: '动量', en: 'Momentum', de: 'Impuls' } },
  { id: 'oscillation', label: { zh: '振动', en: 'Oscillations', de: 'Schwingungen' } },
  { id: 'rotation', label: { zh: '转动', en: 'Rotation', de: 'Drehbewegung' } }
] as const satisfies ReadonlyArray<{ id: string; label: Tri }>

export type ChapterId = typeof CHAPTERS[number]['id']

export interface Problem {
  id: string
  title: PText
  chapter: ChapterId | string
  stem: PText
  scene: Scene
  questions: ProblemQuestion[]
  /** Id of the built-in problem it was made from (parameters can be varied). */
  builtin?: string
}

/** Values for the `{name}` placeholders of the stem: the template parameters of the scene, rounded for reading. */
export function problemParams(p: Problem): Record<string, string> {
  const t = (p.scene.extra as { template?: { values?: Record<string, unknown> } } | undefined)?.template
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(t?.values ?? {})) if (typeof v === 'number' && Number.isFinite(v)) out[k] = formatSig(v, 4)
  return out
}

// ---- Evaluation ----

/** SI unit of a target's value. */
export function problemTargetUnit(rec: Recording, target: ProblemTarget): string {
  if (target.kind === 'atEvent' || target.kind === 'end' || target.kind === 'extreme') return listQuantities(rec).find(q => q.id === target.id)?.unit ?? ''
  return evaluateTarget(rec, [], target).unit
}

/** Most frames scanned for an extreme value. */
const EXTREME_MAX_FRAMES = 400_000

/** Simulated value of a target (and the formula value where a formula card applies). */
export function evaluateProblemTarget(rec: Recording, sits: Situation[], target: ProblemTarget): TargetValue {
  if (target.kind !== 'atEvent' && target.kind !== 'end' && target.kind !== 'extreme') {
    const v = evaluateTarget(rec, sits, target)
    // A formula that does not apply to the recognised situation gives no theoretical value
    if (target.kind === 'formula' && v.formulaNote !== undefined) return { ...v, formula: null }
    return v
  }
  const q = listQuantities(rec).find(x => x.id === target.id)
  if (!q) return { sim: null, formula: null, unit: '', simNote: tl('场景中没有这个量（物体或连接件可能已删除）') }
  const finite = (v: number) => (Number.isFinite(v) ? v : null)
  if (target.kind === 'end') return { sim: finite(valueAtFrame(rec, rec.frameCount - 1, target.id)), formula: null, unit: q.unit }
  if (target.kind === 'extreme') {
    if (rec.frameCount > EXTREME_MAX_FRAMES) return { sim: null, formula: null, unit: q.unit, simNote: tl('记录太长，无法查找最值') }
    const best = extremeOf(rec, target.id, target.which === 'max' ? 'max' : 'min')
    return { sim: Number.isFinite(best) ? best : null, formula: null, unit: q.unit }
  }
  const e = firstEvent(rec, target.event, target.body)
  if (!e) return { sim: null, formula: null, unit: q.unit, simNote: rec.completed ? tl('本次仿真中没有发生该事件') : tl('仿真未算完，记录内没有该事件') }
  const v = valuesAtEvent(rec, e.index, target.side === 'after' ? 'after' : 'before', [target.id])[0]
  return { sim: finite(v), formula: null, unit: q.unit }
}

/** Correct answer of a question: a value (SI, numeric) or an option index (choice); null when it cannot be read. */
export interface QuestionKey {
  value: number | null
  /** Theoretical value from a formula card (numeric questions), or null. */
  theory: number | null
  unit: string
  /** Why the value is missing. */
  note?: string
}

/** The correct answer of a question for a recording. */
export function questionKey(rec: Recording, sits: Situation[], q: ProblemQuestion): QuestionKey {
  if (q.type === 'numeric') {
    const v = evaluateProblemTarget(rec, sits, q.target)
    return { value: v.sim, theory: v.formula, unit: v.unit, note: v.simNote }
  }
  if (q.answerFrom) {
    const v = evaluateProblemTarget(rec, sits, q.answerFrom.target)
    if (v.sim === null) return { value: null, theory: null, unit: '', note: v.simNote }
    let k = 0
    for (const b of q.answerFrom.bounds) if (v.sim > b) k++
    return { value: Math.min(k, q.options.length - 1), theory: null, unit: '' }
  }
  return { value: q.answer ?? null, theory: null, unit: '' }
}

/** Is an answer correct? null: unanswered or no key. */
export function isCorrect(q: ProblemQuestion, answer: number | null | undefined, key: QuestionKey): boolean | null {
  if (answer === null || answer === undefined || !Number.isFinite(answer) || key.value === null) return null
  if (q.type === 'choice') return answer === key.value
  const tol = q.tolerance ?? 0.02, abs = q.absTolerance ?? 1e-6
  return Math.abs(answer - key.value) <= tol * Math.abs(key.value) + abs
}

/** Relative error of a numeric answer (null without a key). */
export function answerError(answer: number, key: QuestionKey): number | null {
  return relativeError(answer, key.value)
}

// ---- Files ----

export const PROBLEM_FORMAT = 'velophi-problem'
export const PROBLEM_VERSION = 1

/** The problem as a file (pretty JSON). */
export function serializeProblem(p: Problem): string {
  const { scene, ...rest } = p
  return JSON.stringify({ format: PROBLEM_FORMAT, version: PROBLEM_VERSION, problem: { ...rest, scene: JSON.parse(serializeScene(scene)) as unknown } }, null, 2)
}

const isText = (t: unknown): t is PText => typeof t === 'string' || (!!t && typeof t === 'object' && typeof (t as Tri).zh === 'string' && typeof (t as Tri).en === 'string' && typeof (t as Tri).de === 'string')
const TARGET_KINDS = new Set(['event', 'quantity', 'formula', 'atEvent', 'end', 'extreme'])

function isTarget(t: unknown): t is ProblemTarget {
  if (!t || typeof t !== 'object') return false
  const o = t as Record<string, unknown>
  if (!TARGET_KINDS.has(o.kind as string)) return false
  switch (o.kind) {
    case 'event': return typeof o.event === 'string'
    case 'quantity': return typeof o.id === 'string' && typeof o.t === 'number' && Number.isFinite(o.t)
    case 'formula': return typeof o.situation === 'string' && typeof o.formula === 'string'
    case 'atEvent': return typeof o.id === 'string' && typeof o.event === 'string' && (o.side === 'before' || o.side === 'after')
    case 'end': return typeof o.id === 'string'
    default: return typeof o.id === 'string' && (o.which === 'max' || o.which === 'min')
  }
}

function checkQuestion(q: unknown, i: number): ProblemQuestion {
  const bad = (what: string) => new SceneFileError(tl('第 {0} 题无效：{1}', [i + 1, what]))
  if (!q || typeof q !== 'object') throw bad(tl('不是对象'))
  const o = q as Record<string, unknown>
  if (typeof o.id !== 'string' || !o.id) throw bad(tl('缺少 id'))
  if (!isText(o.prompt)) throw bad(tl('缺少题目文字'))
  for (const k of ['hint', 'explain']) if (o[k] !== undefined && !isText(o[k])) throw bad(tl('提示或解析不是文字'))
  if (o.type === 'numeric') {
    if (!isTarget(o.target)) throw bad(tl('答案来源无效'))
    for (const k of ['tolerance', 'absTolerance']) if (o[k] !== undefined && !(typeof o[k] === 'number' && (o[k] as number) >= 0 && Number.isFinite(o[k]))) throw bad(tl('容差无效'))
    return o as unknown as NumericQuestion
  }
  if (o.type === 'choice') {
    if (!Array.isArray(o.options) || o.options.length < 2 || !o.options.every(isText)) throw bad(tl('选项少于两个'))
    const n = o.options.length
    if (o.answer !== undefined && !(Number.isInteger(o.answer) && (o.answer as number) >= 0 && (o.answer as number) < n)) throw bad(tl('正确选项无效'))
    if (o.answerFrom !== undefined) {
      const a = o.answerFrom as Record<string, unknown>
      if (!a || !isTarget(a.target) || !Array.isArray(a.bounds) || !a.bounds.every(b => typeof b === 'number' && Number.isFinite(b))) throw bad(tl('正确选项的来源无效'))
    }
    if (o.answer === undefined && o.answerFrom === undefined) throw bad(tl('没有正确选项'))
    return o as unknown as ChoiceQuestion
  }
  throw bad(tl('未知题型'))
}

/** Read a problem file; throws SceneFileError with a readable message. */
export function parseProblem(text: string): { problem: Problem; warnings: string[] } {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { throw new SceneFileError(tl('不是有效的 JSON 文件')) }
  const f = raw as { format?: unknown; version?: unknown; problem?: unknown }
  if (!f || typeof f !== 'object' || f.format !== PROBLEM_FORMAT) throw new SceneFileError(tl('不是 VeloPhi 题目包'))
  if (typeof f.version !== 'number' || f.version > PROBLEM_VERSION) throw new SceneFileError(tl('题目包版本 {0} 较新，请升级 VeloPhi', [String(f.version)]))
  const p = f.problem as Record<string, unknown> | undefined
  if (!p || typeof p !== 'object') throw new SceneFileError(tl('题目包中没有题目'))
  if (!isText(p.title)) throw new SceneFileError(tl('题目缺少标题'))
  if (!isText(p.stem)) throw new SceneFileError(tl('题目缺少题干'))
  if (!Array.isArray(p.questions) || p.questions.length === 0) throw new SceneFileError(tl('题目中没有问题'))
  const questions = p.questions.map(checkQuestion)
  const ids = new Set<string>()
  for (const q of questions) { if (ids.has(q.id)) throw new SceneFileError(tl('问题 id “{0}”重复', [q.id])); ids.add(q.id) }
  const { scene, warnings } = parseScene(JSON.stringify(p.scene))
  return {
    problem: { id: typeof p.id === 'string' && p.id ? p.id : 'problem', title: p.title, chapter: typeof p.chapter === 'string' ? p.chapter : '', stem: p.stem, scene, questions, ...(typeof p.builtin === 'string' ? { builtin: p.builtin } : {}) },
    warnings
  }
}
