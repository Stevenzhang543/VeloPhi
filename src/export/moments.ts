/**
 * Key moments of a recording for courseware, reports and slides: events (impacts, sticking, slack …), starts of
 * motion stages (segments) and times added by the user. Moments closer than a small tolerance are merged so a
 * stage that starts at an event appears once. Also: readouts (values of chosen quantities at a moment) in
 * display units.
 *
 * Pure (no DOM).
 */
import { tl, semiSep } from '../i18n'
import type { ChangeDetail, Recording } from '../core/solver/simulation'
import { evaluateQuantity, listQuantities } from '../core/observe/quantities'
import type { Sample, Situation } from '../formula/situations'
import { observeAt } from '../formula/situations'
import type { FormulaCard } from '../formula/match'
import { activeSituations, evaluateCard } from '../formula/match'
import { FORMULAS } from '../formula/library'
import type { FormulaDef } from '../formula/library'
import { parse, toLatex } from '../formula/expr'
import type { Node } from '../formula/expr'
import { eventLabel } from '../render/renderer'
import type { UnitChoice } from '../units/units'
import { formatQuantity, latexQuantity } from '../units/units'

/** Why a time is a key moment. */
export type MomentKind = 'start' | 'event' | 'segment' | 'user' | 'end'

/** A key moment of a recording. */
export interface KeyMoment {
  t: number
  kinds: MomentKind[]
  /** Short user-facing description (the bodies involved and the change). */
  label: string
  /** Index into rec.events when the moment is an event. */
  eventIndex?: number
}

/** Which moments keyMoments collects. */
export interface MomentOptions {
  events: boolean
  segments: boolean
  /** Include t = 0 and the last recorded time. */
  ends?: boolean
  /** Extra times (s) chosen by the user. */
  user?: number[]
}

/** Time tolerance used to merge moments. */
export function momentTolerance(rec: Recording): number {
  return Math.max(1e-9, rec.dt * 1e-3)
}

/** Names of bodies, ropes and forces by id. */
export function nameOf(rec: Recording, id: string): string {
  const m = rec.system.model
  return m.byId.get(id)?.name ?? m.ropes.find(r => r.id === id)?.name ?? m.forces.find(f => f.id === id)?.name ?? id
}

/** Who a change concerns: the bodies (joined by '–'), the force of a variable-force switch, nothing for the solver. */
export function changeWho(rec: Recording, c: ChangeDetail): string {
  if (c.type === 'timestep') return ''
  if (c.type === 'switch') return nameOf(rec, c.subject)
  return c.bodies.map(id => nameOf(rec, id)).join('–')
}

/** User-facing text of an event: who and what for every change, joined by a full-width semicolon. */
export function eventText(rec: Recording, eventIndex: number): string {
  const e = rec.events[eventIndex]
  const parts: string[] = []
  for (const c of e.changes) {
    const who = changeWho(rec, c)
    const text = who ? `${who} ${eventLabel(c)}` : eventLabel(c)
    if (!parts.includes(text)) parts.push(text)
  }
  return parts.join(semiSep())
}

/** Notice for a recording computed (partly) with the Moreau–Jean fallback, or null. */
export function reducedNotice(rec: Recording, units: UnitChoice): string | null {
  const t = rec.reducedFrom
  if (t === null || t === undefined) return null
  return t > 0
    ? tl('精度降级：事件过于密集，自 t = {0} 起改用 Moreau–Jean 时间步进计算，此后的仿真值精度降低、事件时刻不精确定位，公式对照仅供参考。', [formatQuantity(t, 's', units, 6)])
    : tl('精度降级：本次全程使用 Moreau–Jean 时间步进计算，仿真值精度降低、事件时刻不精确定位，公式对照仅供参考。')
}

/** Key moments in time order; moments closer than momentTolerance are merged. */
export function keyMoments(rec: Recording, o: MomentOptions): KeyMoment[] {
  const tMax = (rec.frameCount - 1) * rec.dt
  const tol = momentTolerance(rec)
  const list: KeyMoment[] = []
  const add = (t: number, kind: MomentKind, label: string, eventIndex?: number) => {
    if (!Number.isFinite(t)) return
    const tc = Math.max(0, Math.min(tMax, t))
    const near = list.find(m => Math.abs(m.t - tc) <= tol)
    if (near) {
      if (!near.kinds.includes(kind)) near.kinds.push(kind)
      // An event names the moment better than a stage start or a chosen time
      if (eventIndex !== undefined && near.eventIndex === undefined) { near.eventIndex = eventIndex; near.label = label }
      return
    }
    list.push({ t: tc, kinds: [kind], label, eventIndex })
  }
  if (o.ends) add(0, 'start', tl('初始时刻'))
  if (o.events) rec.events.forEach((e, i) => { if (e.changes.length > 0 && e.t <= tMax + tol) add(e.t, 'event', eventText(rec, i), i) })
  if (o.segments) rec.segments.forEach((s, i) => { if (i > 0 && s.t0 <= tMax + tol) add(s.t0, 'segment', tl('第 {0} 运动阶段开始', [i + 1])) })
  for (const t of o.user ?? []) add(t, 'user', tl('自选时刻'))
  if (o.ends) add(tMax, 'end', tl('记录结束'))
  return list.sort((a, b) => a.t - b.t)
}

/** A formatted value of a quantity at a moment. */
export interface Readout { id: string; label: string; value: string }

/**
 * Values of `ids` at time t (exact state, mode of the segment containing t; at an event that is the state
 * just after it), formatted in the display units of `units`.
 */
export function readoutsAt(rec: Recording, t: number, ids: string[], units: UnitChoice, digits: number): Readout[] {
  const defs = new Map(listQuantities(rec.system).map(q => [q.id, q]))
  const known = ids.filter(id => defs.has(id))
  if (!known.length) return []
  const ctx = observeAt(rec, t)
  return known.map(id => {
    const q = defs.get(id)!
    return { id, label: `${q.owner} ${q.label}`, value: formatQuantity(evaluateQuantity(ctx, id), q.unit, units, digits) }
  })
}

/**
 * Default readout quantities: the watch list, else speed and acceleration of every moving body and the
 * magnitude and power of every applied force (at most eight).
 */
export function defaultReadoutIds(rec: Recording): string[] {
  if (rec.scene.watch.length) return rec.scene.watch.slice(0, 8)
  const ids: string[] = []
  for (const b of rec.system.model.dynamic) ids.push(`${b.id}.v`, `${b.id}.a`)
  for (const f of rec.system.model.forces) if (f.a.body?.dynamic) ids.push(`${f.id}.F`, `${f.id}.P`)
  return ids.slice(0, 8)
}

/** File-name friendly form of a moment: number, time and label, e.g. "03_t=1.2245s_<label>". */
export function momentFileStem(index: number, m: KeyMoment, digits = 5): string {
  const t = Number(m.t.toPrecision(digits))
  const label = m.label.replace(/[\\/:*?"<>|\s；、]+/g, '').slice(0, 24)
  return `${String(index + 1).padStart(2, '0')}_t=${t}s${label ? `_${label}` : ''}`
}

/**
 * Formula cards for a key moment. Like `cardsAt`, but a stage that ends exactly at the moment is read just
 * before its end (at an event the state after it already belongs to the next stage), so the card of the
 * ending stage compares its own end values, e.g. the time to reach the common velocity.
 */
export function cardsForMoment(sits: Situation[], t: number, digits: number, units?: UnitChoice | null): FormulaCard[] {
  const out: FormulaCard[] = []
  for (const s of activeSituations(sits, t)) {
    let ts = Math.min(Math.max(t, s.t0), s.t1)
    if (s.tEvent === undefined && s.t1 > s.t0 && ts >= s.t1 - 1e-12) ts = s.t1 - Math.min((s.t1 - s.t0) / 2, 1e-7)
    const sample = s.sample(ts)
    for (const f of FORMULAS) {
      if (f.situation !== s.type) continue
      const card = evaluateCard(f, s, sample, { digits })
      if (units && card.theory !== null) card.substituted = substitutedDisplay(card, sample, units, digits)
      out.push(card)
    }
  }
  return out
}

const asts = new Map<string, Node>()
function ast(f: FormulaDef): Node {
  let a = asts.get(f.id)
  if (!a) { a = parse(f.expr); asts.set(f.id, a) }
  return a
}

/**
 * Substituted line with every value in its own display unit, as the formula panel shows it:
 * "a = 980\,\mathrm{cm/s^2} × … = 392\,\mathrm{cm/s^2}". The evaluation itself stays SI.
 */
export function substitutedDisplay(card: FormulaCard, sample: Sample, units: UnitChoice, digits: number): string {
  if (card.theory === null) return card.substituted
  try {
    const show = (name: string) => {
      const v = sample.vars[name]
      return v ? latexQuantity(v.value, v.unit, units, digits) : null
    }
    return `${card.formula.lhs} = ${toLatex(ast(card.formula), { value: show })} = ${latexQuantity(card.theory, card.formula.unit, units, digits)}`
  } catch {
    return card.substituted
  }
}
