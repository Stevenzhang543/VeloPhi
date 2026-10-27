/**
 * Prediction and comparison (the "预测与对比" panel): before a run students write down what they expect — the
 * time of the first event of a kind (e.g. the time of common velocity), a quantity at a time, or the result of
 * a formula of a recognised situation — and after the run each prediction is compared with the simulation and,
 * where one applies, with the textbook formula.
 *
 * Predictions are part of the scene document (`scene.extra.predictions`, values in SI) so they are saved with
 * the file and survive undo/redo; the UI changes them through the store's `edit()`.
 *
 * Pure (no DOM, no Vue).
 */
import { tl, trDeep, paren, colonSep } from '../i18n'
import type { Scene } from '../core/scene/types'
import type { ChangeType, Recording, SimEvent } from '../engine/recording'
import type { QuantityDef } from '../engine/observe'
import { listQuantities, valueAt } from '../engine/observe'
import type { Situation } from '../formula/recognize'
import { FORMULAS } from '../formula/library'
import { cardsAt, evaluateCard } from '../formula/match'

/** Event kinds a prediction (or a sweep) can target, in teaching order. */
export const EVENT_TYPES: Array<{ type: ChangeType; label: string }> = trDeep([
  { type: 'stick', label: '共速（相对静止）' },
  { type: 'impact', label: '碰撞' },
  { type: 'slack', label: '绳松弛' },
  { type: 'taut', label: '绳绷紧' },
  { type: 'separate', label: '分离' },
  { type: 'leave', label: '离开接触面' },
  { type: 'touch', label: '开始接触' },
  { type: 'slip', label: '开始相对滑动' },
  { type: 'reverse', label: '相对滑动反向' },
  { type: 'switch', label: '变力切换（折点）' }
])

/** Display label of an event kind. */
export function eventTypeLabel(t: ChangeType): string {
  return EVENT_TYPES.find(e => e.type === t)?.label ?? t
}

/** Display names of the recognised situation types. */
export const SITUATION_NAMES: Record<string, string> = trDeep({
  incline: '斜面上的物块', flat: '水平面上的物块', 'board-block': '板块模型（相对滑动）', 'board-together': '板块模型（共同运动）',
  rolling: '斜面上的滚动', collision: '碰撞', bounce: '反弹', projectile: '抛体运动', pendulum: '单摆', spring: '弹簧振子',
  rotation: '定轴转动', 'hinged-impact': '小球碰撞细杆', pulley: '滑轮连接体', atwood: '阿特伍德机', energy: '能量守恒', momentum: '动量守恒'
})

/** What a prediction is about. */
export type PredictionTarget =
  /** Time of the first event of a kind (optionally one involving a given body). */
  | { kind: 'event'; event: ChangeType; body?: string | null }
  /** A quantity (observe/quantities id) at time t. */
  | { kind: 'quantity'; id: string; t: number }
  /** The measured result of a formula of a recognised situation (the `occurrence`-th one of its type). */
  | { kind: 'formula'; situation: string; formula: string; occurrence?: number; t?: number | null }

/** A student's prediction, stored in the scene. */
export interface Prediction {
  id: string
  target: PredictionTarget
  /** Predicted value in SI. */
  value: number
  /** Optional working or comment. */
  note?: string
}

/** Grade of a prediction against a reference value. */
export type Grade = 'ok' | 'warn' | 'bad' | 'none'

/** Relative error limits of the grades: ≤ 1 % 'ok', ≤ 5 % 'warn', otherwise 'bad'. */
export const PREDICTION_TOLERANCE = { ok: 0.01, warn: 0.05 }

/** Display text of each grade. */
export const GRADE_TEXT: Record<Grade, string> = trDeep({ ok: '准确', warn: '接近', bad: '偏差较大', none: '无法比较' })

// ---- Persistence ----

function isTarget(t: unknown): t is PredictionTarget {
  if (!t || typeof t !== 'object') return false
  const o = t as Record<string, unknown>
  switch (o.kind) {
    case 'event': return typeof o.event === 'string' && (o.body === undefined || o.body === null || typeof o.body === 'string')
    case 'quantity': return typeof o.id === 'string' && typeof o.t === 'number' && Number.isFinite(o.t)
    case 'formula': return typeof o.situation === 'string' && typeof o.formula === 'string'
    default: return false
  }
}

/** Predictions stored in the scene (malformed entries are skipped). */
export function readPredictions(scene: Scene): Prediction[] {
  const raw = (scene.extra as { predictions?: unknown } | undefined)?.predictions
  if (!Array.isArray(raw)) return []
  return raw.filter((p): p is Prediction => !!p && typeof p === 'object' && typeof (p as Prediction).id === 'string'
    && typeof (p as Prediction).value === 'number' && Number.isFinite((p as Prediction).value) && isTarget((p as Prediction).target))
}

/** Store predictions in the scene (use inside `edit()`); an empty list removes the field. */
export function writePredictions(scene: Scene, list: Prediction[]) {
  const extra = { ...(scene.extra ?? {}) }
  if (list.length) extra.predictions = JSON.parse(JSON.stringify(list)) as unknown
  else delete extra.predictions
  if (Object.keys(extra).length) scene.extra = extra
  else delete scene.extra
}

/** A prediction id not used in the list. */
export function newPredictionId(list: Prediction[]): string {
  let k = list.length + 1
  while (list.some(p => p.id === `p${k}`)) k++
  return `p${k}`
}

// ---- Evaluation ----

/** First event with a change of the given type (involving `body` when given). */
export function firstEvent(rec: Recording, type: ChangeType, body?: string | null): SimEvent | null {
  return rec.events.find(e => e.changes.some(c => c.type === type && (!body || c.bodies.includes(body)))) ?? null
}

/** Situations of a type in time order. */
export function situationsOfType(sits: Situation[], type: string): Situation[] {
  return sits.filter(s => s.type === type).sort((a, b) => a.t0 - b.t0)
}

/** Simulated and formula values of a target. */
export interface TargetValue {
  /** Simulated value (SI) or null. */
  sim: number | null
  /** Formula value (SI) or null when no formula applies. */
  formula: number | null
  /** SI unit. */
  unit: string
  /** User-facing remark on the simulated value (why it is missing). */
  simNote?: string
  /** User-facing remark on the formula value (where it comes from, or why it is missing). */
  formulaNote?: string
}

/** SI unit of a target. */
export function targetUnit(target: PredictionTarget, quantities: Map<string, QuantityDef>): string {
  if (target.kind === 'event') return 's'
  if (target.kind === 'quantity') return quantities.get(target.id)?.unit ?? ''
  return FORMULAS.find(f => f.id === target.formula)?.unit ?? ''
}

/** Human-readable description of a target. */
export function targetLabel(target: PredictionTarget, ctx: { quantities: Map<string, QuantityDef>; bodyName: (id: string) => string; time: (t: number) => string }): string {
  if (target.kind === 'event') return tl('首次{0}的时刻{1}', [eventTypeLabel(target.event), target.body ? paren(ctx.bodyName(target.body)) : ''])
  if (target.kind === 'quantity') {
    const q = ctx.quantities.get(target.id)
    return tl('{0} 时 {1}', [ctx.time(target.t), q ? `${q.owner} ${q.label}` : target.id])
  }
  const f = FORMULAS.find(x => x.id === target.formula)
  const occ = (target.occurrence ?? 0) > 0 ? tl('（第 {0} 段）', [(target.occurrence ?? 0) + 1]) : ''
  return `${SITUATION_NAMES[target.situation] ?? target.situation}${occ}${colonSep()}${f?.title ?? target.formula}`
}

/**
 * Simulated and formula values of a target. For an event, the formula value is the start of the stage that
 * ends at the event plus the duration predicted by that stage's formula (e.g. the time t₁ of common velocity
 * in the board–block model), when such a formula is recognised.
 */
export function evaluateTarget(rec: Recording, sits: Situation[], target: PredictionTarget): TargetValue {
  const tMax = (rec.frameCount - 1) * rec.dt
  if (target.kind === 'event') {
    const e = firstEvent(rec, target.event, target.body)
    if (!e) return { sim: null, formula: null, unit: 's', simNote: rec.completed ? tl('本次仿真中没有发生该事件') : tl('仿真未算完，记录内没有该事件') }
    let formula: number | null = null
    let formulaNote: string | undefined = tl('没有识别到可计算该时刻的公式')
    for (const c of cardsAt(rec, e.t, { digits: 8 }, sits)) {
      if ((c.formula.measure !== 'tEnd' && c.formula.measure !== 'T') || c.theory === null || c.sim === null) continue
      if (c.verdict === 'not-applicable') continue
      if (Math.abs(c.situation.t0 + c.sim - e.t) > 1e-6 * Math.max(1, e.t)) continue
      formula = c.situation.t0 + c.theory
      formulaNote = tl('按公式“{0}”{1}', [c.formula.title, c.situation.t0 > 0 ? tl('（加上本阶段的开始时刻）') : ''])
      break
    }
    return { sim: e.t, formula, unit: 's', formulaNote }
  }
  if (target.kind === 'quantity') {
    const defs = new Map(listQuantities(rec).map(q => [q.id, q]))
    const q = defs.get(target.id)
    if (!q) return { sim: null, formula: null, unit: '', simNote: tl('场景中没有这个量（物体或连接件可能已删除）') }
    if (target.t < 0 || target.t > tMax + 1e-12) return { sim: null, formula: null, unit: q.unit, simNote: tl('该时刻超出了仿真时长') }
    const v = valueAt(rec, target.t, target.id)
    return { sim: Number.isFinite(v) ? v : null, formula: null, unit: q.unit, formulaNote: tl('此类预测只与仿真比较') }
  }
  const f = FORMULAS.find(x => x.id === target.formula)
  if (!f) return { sim: null, formula: null, unit: '', simNote: tl('公式库中没有这条公式') }
  const list = situationsOfType(sits, target.situation)
  const s = list[target.occurrence ?? 0]
  if (!s) return { sim: null, formula: null, unit: f.unit, simNote: tl('本次仿真中没有识别到该情形') }
  const t = target.t ?? s.tEvent ?? (s.t0 + s.t1) / 2
  const card = evaluateCard(rec, s, f.id, t, { digits: 8 })
  if (!card) return { sim: null, formula: null, unit: f.unit, simNote: tl('仿真中没有可比较的测量值') }
  return {
    sim: card.sim, formula: card.theory, unit: f.unit,
    simNote: card.sim === null ? (card.reason || tl('仿真中没有可比较的测量值')) : undefined,
    formulaNote: card.verdict === 'not-applicable' ? card.reason : undefined
  }
}

/** Relative error |pred − ref| / max(|pred|, |ref|); 0 when both are 0; null without a reference. */
export function relativeError(pred: number, ref: number | null): number | null {
  if (ref === null || !Number.isFinite(ref)) return null
  const scale = Math.max(Math.abs(pred), Math.abs(ref))
  if (scale === 0) return 0
  const d = Math.abs(pred - ref)
  // Differences at round-off level count as exact
  return d <= 1e-12 * scale ? 0 : d / scale
}

/** Grade of a relative error (see PREDICTION_TOLERANCE). */
export function gradeOf(rel: number | null): Grade {
  if (rel === null) return 'none'
  return rel <= PREDICTION_TOLERANCE.ok ? 'ok' : rel <= PREDICTION_TOLERANCE.warn ? 'warn' : 'bad'
}

/** A prediction compared with the simulation and the formula. */
export interface Comparison {
  prediction: Prediction
  value: TargetValue
  /** Prediction minus simulation (SI). */
  absError: number | null
  relError: number | null
  grade: Grade
  /** Prediction minus formula (SI). */
  absErrorFormula: number | null
  relErrorFormula: number | null
}

/** Compare a prediction with the recording and, where one applies, with the formula. */
export function comparePrediction(rec: Recording, sits: Situation[], p: Prediction): Comparison {
  const value = evaluateTarget(rec, sits, p.target)
  const relError = relativeError(p.value, value.sim)
  const relErrorFormula = relativeError(p.value, value.formula)
  return {
    prediction: p, value,
    absError: value.sim === null ? null : p.value - value.sim, relError, grade: gradeOf(relError),
    absErrorFormula: value.formula === null ? null : p.value - value.formula, relErrorFormula
  }
}
