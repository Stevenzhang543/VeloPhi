/**
 * Adapters between the old target formats and the task contract (26.57, D110/D117; manual §11.1 “旧 ProblemTarget
 * 映射到新引用；映射不完整时标记缺失项”). The old problem files, the predictions stored in scenes and the formula
 * cards keep their formats; these functions describe them as quantity references with evaluation points, and
 * evaluate a reference on a recording with the same core requests the old evaluators use, so the same target gives
 * the same answer wherever it is asked.
 */
import type { Applicability, EvaluationPoint, QuantityRef, TaskTarget } from './types'
import type { ProblemTarget } from '../teaching/problems'
import type { PredictionTarget } from '../analysis/prediction'
import type { CondStatus } from '../formula/recognize'
import type { Recording } from '../engine/recording'
import type { Scene } from '../core/scene/types'
import { valuesAt, valuesAtEvent } from '../engine/observe'
import { firstEvent } from '../analysis/prediction'

/** Applicability of a formula-card condition status (ok / approx / fail); a condition that cannot be evaluated is insufficient. */
export function conditionApplicability(s: CondStatus | null | undefined): Applicability {
  return s === 'ok' ? 'applicable' : s === 'approx' ? 'approximate' : s === 'fail' ? 'inapplicable' : 'insufficient'
}

/** Quantity kind, component and entities of an observation id (`block.vx`, `contact.a|b.N`, `pair.a|b.heat`). */
export function refOfQuantityId(id: string): { ref: QuantityRef; missing: string[] } {
  const dot = id.lastIndexOf('.')
  const owner = dot > 0 ? id.slice(0, dot) : id
  const key = dot > 0 ? id.slice(dot + 1) : ''
  const pairOwner = /^(contact|pair)\.(.+)$/.exec(owner)
  const entities = pairOwner ? pairOwner[2].split('|') : [owner]
  const table: Record<string, { quantity: string; component?: QuantityRef['component'] }> = {
    x: { quantity: 'position', component: 'x' }, y: { quantity: 'position', component: 'y' },
    vx: { quantity: 'velocity', component: 'x' }, vy: { quantity: 'velocity', component: 'y' }, v: { quantity: 'velocity', component: 'magnitude' },
    ax: { quantity: 'acceleration', component: 'x' }, ay: { quantity: 'acceleration', component: 'y' }, a: { quantity: 'acceleration', component: 'magnitude' },
    N: { quantity: 'normalForce', component: 'magnitude' }, f: { quantity: 'frictionForce', component: 'magnitude' },
    T: { quantity: 'tension', component: 'magnitude' }, ek: { quantity: 'kineticEnergy' }, px: { quantity: 'momentum', component: 'x' }, py: { quantity: 'momentum', component: 'y' },
    heat: { quantity: 'heat' }, slide: { quantity: 'distance' }
  }
  const t = table[key]
  const missing: string[] = []
  if (!t) missing.push('量的物理含义（只有观测编号）')
  return { ref: { id, entityIds: entities, quantity: t?.quantity ?? `observe:${key || id}`, frameId: 'ground', component: t?.component }, missing }
}

/** A target mapped from an old format, with what the old format does not say. */
export interface MappedTarget { target: TaskTarget; missing: string[] }

/** The duration of a scene's recording (null: unbounded without a stop condition). */
function boundedDuration(scene: Scene | null | undefined): number | null {
  if (!scene) return null
  if (scene.settings.duration !== null && scene.settings.duration !== undefined) return scene.settings.duration
  return null
}

/** An old problem target as a task target (manual §11.1). */
export function fromProblemTarget(id: string, t: ProblemTarget, scene?: Scene | null): MappedTarget {
  if (t.kind === 'quantity' || t.kind === 'event' || t.kind === 'formula') return fromPredictionTarget(id, t)
  const { ref, missing } = refOfQuantityId(t.id)
  let at: EvaluationPoint | undefined
  if (t.kind === 'atEvent') at = { kind: 'event', eventId: t.event, occurrence: 1, side: t.side }
  else if (t.kind === 'extreme') at = { kind: 'interval', intervalSI: [0, boundedDuration(scene) ?? Infinity], operation: t.which }
  else {
    // “the end of the run” is a time only when the run has an end (T28)
    const d = boundedDuration(scene)
    if (d === null) missing.push('终止条件（无限时长的记录没有结束值）')
    else at = { kind: 'time', tSI: d }
  }
  return { target: { id, kind: 'value', ref, at }, missing }
}

/** A prediction target as a task target. */
export function fromPredictionTarget(id: string, t: PredictionTarget): MappedTarget {
  if (t.kind === 'quantity') {
    const { ref, missing } = refOfQuantityId(t.id)
    return { target: { id, kind: 'value', ref, at: { kind: 'time', tSI: t.t } }, missing }
  }
  if (t.kind === 'event') {
    return { target: { id, kind: 'value', ref: { id: `event.${t.event}.t`, entityIds: t.body ? [t.body] : [], quantity: 'time', frameId: 'ground' }, at: { kind: 'event', eventId: t.event, occurrence: 1, side: 'before' } }, missing: [] }
  }
  return {
    target: { id, kind: 'value', ref: { id: `formula.${t.formula}`, entityIds: [], quantity: `formula:${t.formula}`, frameId: 'ground' }, at: t.t !== undefined && t.t !== null ? { kind: 'time', tSI: t.t } : undefined },
    missing: t.t === undefined || t.t === null ? ['取值时刻（默认取情形的事件时刻或中点）'] : []
  }
}

/**
 * Value of a mapped observation target on a recording, with the core requests of the old evaluators: a time
 * (exact state between frames), one side of the first event of a kind, the extreme over the interval. Null with a
 * reason when the point is not in the recording (never the last frame instead).
 */
export function evaluateMapped(rec: Recording, target: TaskTarget, body?: string | null): { value: number | null; reason?: string } {
  const at = target.at
  const id = target.ref.id
  if (!at) return { value: null, reason: '缺少取值时机' }
  const tMax = (rec.frameCount - 1) * rec.dt
  if (at.kind === 'time') {
    if (at.tSI < 0 || at.tSI > tMax + 1e-12) return { value: null, reason: '该时刻超出了记录' }
    const v = valuesAt(rec, at.tSI, [id])[0]
    return Number.isFinite(v) ? { value: v } : { value: null, reason: '该量在此时没有定义' }
  }
  if (at.kind === 'event') {
    const e = firstEvent(rec, at.eventId as never, body ?? null)
    if (!e) return { value: null, reason: rec.completed ? '本次仿真中没有发生该事件' : '仿真未算完，记录内没有该事件' }
    if (target.ref.quantity === 'time') return { value: e.t }
    const v = valuesAtEvent(rec, e.index, at.side, [id])[0]
    return Number.isFinite(v) ? { value: v } : { value: null, reason: '该量在此时没有定义' }
  }
  if (at.kind === 'interval') {
    const r = rec.session.call<{ value: number }>({ op: 'extreme', id, which: at.operation === 'min' ? 'min' : 'max' })
    return Number.isFinite(r.value) ? { value: r.value } : { value: null, reason: '没有有限的值' }
  }
  return { value: null, reason: '这种取值时机需要任务的条件表' }
}
