/**
 * Observable quantities (26.53): the list and the values come from the Rust core (observe.rs) — the same ids as in
 * 26.52 (see the header of tests/reference/core/observe/quantities.ts):
 *   `<body>.x .y .angle .vx .vy .v .omega .ax .ay .a .alpha .ek .ep .px .py`, `<body>.angle@pivot`,
 *   `contact.<on>|<by>.N .f .fx .fy .Nx .Ny .vt`, `pair.<a>|<b>.slide .heat`, connectors, forces,
 *   `system.*`, `ledger.*`, `custom.<id>`.
 * This module only renders the labels and keeps the per-session lists.
 */
import { tl } from '../i18n'
import { activeLang, msgText } from '../i18n/locale'
import type { Message } from '../i18n/message'
import type { Recording } from './recording'
import { EngineSession } from './session'
import type { Scene } from '../core/scene/types'
import { pairKey } from './model'

/** Group of a quantity in the watch panel. */
export type QuantityGroup = '物体' | '接触' | '连接件' | '系统' | '能量账本' | '自定义'

/** Display name of a quantity group. */
export function groupLabel(g: QuantityGroup): string {
  switch (g) {
    case '物体': return tl('物体')
    case '接触': return tl('接触')
    case '连接件': return tl('连接件')
    case '系统': return tl('系统')
    case '能量账本': return tl('能量账本')
    case '自定义': return tl('自定义')
  }
}

/** A quantity that can be watched, charted and exported. */
export interface QuantityDef {
  id: string
  /** Display label. */
  label: string
  /** KaTeX symbol. */
  symbol: string
  /** SI unit (the key into units/units.ts). */
  unit: string
  group: QuantityGroup
  /** Owner name for display (body / connector name). */
  owner: string
}

/** A custom quantity's compile result. */
export interface CustomStatus { id: string; unit: string | null; error: Message | null }

type Source = Recording | EngineSession
const sessionOf = (s: Source): EngineSession => ('session' in s ? s.session : s)

interface RawQuantity { id: string; label: string | Message; symbol: string; unit: string; group: QuantityGroup; owner: string | Message }
const lists = new WeakMap<EngineSession, { lang: string; list: QuantityDef[]; custom: CustomStatus[] }>()

function text(v: string | Message): string { return typeof v === 'string' ? v : msgText(v) }

function load(s: EngineSession) {
  const lang = activeLang()
  const hit = lists.get(s)
  if (hit && hit.lang === lang) return hit
  const r = s.call<{ quantities: RawQuantity[]; custom: CustomStatus[] }>({ op: 'quantities' })
  const entry = { lang, list: r.quantities.map(q => ({ id: q.id, label: text(q.label), symbol: q.symbol, unit: q.unit, group: q.group, owner: text(q.owner) })), custom: r.custom }
  lists.set(s, entry)
  return entry
}

/** The quantities of a recording or scene session, in display order (built-in, then the custom ones that compile). */
export function listQuantities(src: Source): QuantityDef[] { return load(sessionOf(src)).list }

/** Compile results of the scene's custom quantities. */
export function customStatus(src: Source): CustomStatus[] { return load(sessionOf(src)).custom }

/** Check a custom-quantity expression against the scene's quantities: its SI unit, or the error. */
export function checkCustom(src: Source, expr: string): { ok: true; unit: string } | { ok: false; error: Message } {
  return sessionOf(src).call({ op: 'checkCustom', expr })
}

/** SI unit of a quantity id ('' when unknown). */
export function unitOf(src: Source, id: string): string {
  const key = canonicalQuantityId(id)
  return listQuantities(src).find(q => q.id === key)?.unit ?? ''
}

/**
 * The listed form of a quantity id. A pair is unordered, so `pair.a|b.x` and `pair.b|a.x` are the same quantity;
 * the list names it in pairKey order. Other ids are returned unchanged.
 */
export function canonicalQuantityId(id: string): string {
  if (!id.startsWith('pair.')) return id
  const dot = id.lastIndexOf('.')
  if (dot <= 5) return id
  const bodies = id.slice(5, dot).split('|')
  if (bodies.length !== 2) return id
  return `pair.${pairKey(bodies[0], bodies[1])}${id.slice(dot)}`
}

/** Values of quantities at recorded frame k (NaN for unknown ids). */
export function valuesAtFrame(rec: Recording, k: number, ids: string[]): Float64Array {
  return rec.session.call<{ values: Float64Array }>({ op: 'evaluate', frame: k, ids }).values
}

/** Values of quantities at time t (exact state between frames, in the mode of the segment containing t). */
export function valuesAt(rec: Recording, t: number, ids: string[]): Float64Array {
  return rec.session.call<{ values: Float64Array }>({ op: 'evaluate', t, ids }).values
}

/** Values just before (`before`) or after (`after`) event `index`. */
export function valuesAtEvent(rec: Recording, index: number, side: 'before' | 'after', ids: string[]): Float64Array {
  return rec.session.call<{ values: Float64Array }>({ op: 'evaluate', event: index, side, ids }).values
}

/** One quantity at frame k. */
export function valueAtFrame(rec: Recording, k: number, id: string): number { return valuesAtFrame(rec, k, [id])[0] }
/** One quantity at time t. */
export function valueAt(rec: Recording, t: number, id: string): number { return valuesAt(rec, t, [id])[0] }

/** Values of quantities at frames from..to (every `stride`-th): times and one series per id. */
export function quantitySeries(rec: Recording, ids: string[], from = 0, to = rec.frameCount - 1, stride = 1): { t: Float64Array; values: Float64Array[] } {
  if (to < from || rec.frameCount === 0) return { t: new Float64Array(0), values: ids.map(() => new Float64Array(0)) }
  return rec.session.call<{ t: Float64Array; values: Float64Array[] }>({ op: 'series', ids, from, to, stride })
}

/** Values of quantities at the given frames: times and one series per id. */
export function quantitiesAtFrames(rec: Recording, ids: string[], frames: number[]): { t: Float64Array; values: Float64Array[] } {
  if (!frames.length) return { t: new Float64Array(0), values: ids.map(() => new Float64Array(0)) }
  return rec.session.call<{ t: Float64Array; values: Float64Array[] }>({ op: 'series', ids, frames })
}

/** Largest or smallest finite value of a quantity over the recording (NaN when there is none). */
export function extremeOf(rec: Recording, id: string, which: 'max' | 'min'): number {
  return rec.session.call<{ value: number }>({ op: 'extreme', id, which }).value
}

/** A custom quantity id not used in the list (q1, q2, …). */
export function nextCustomId(list: Array<{ id: string }>): string {
  let i = 1
  while (list.some(q => q.id === `q${i}`)) i++
  return `q${i}`
}

/** The quantities of a scene that has not been run (a scene session of the core, released at once). */
export function sceneQuantities(scene: Scene): QuantityDef[] {
  const s = EngineSession.create(scene)
  try { return listQuantities(s) } finally { s.free() }
}
