/**
 * Recognised textbook situations of a recording (26.53): the recognisers, the samples (variables, measurements,
 * conditions) and their numbers run in the Rust core (formula/situations*.rs, incrementally while a run streams);
 * this module turns the results into objects whose texts are rendered in the interface language.
 */
import { activeLang, msgText } from '../i18n/locale'
import type { Message } from '../i18n/message'
import type { Recording } from '../engine/recording'
import type { EngineSession } from '../engine/session'

/** Status of a condition. */
export type CondStatus = 'ok' | 'approx' | 'fail'
/** A condition of a situation with its status and an explanation. */
export interface Condition { id: string; label: string; status: CondStatus; detail: string }
/**
 * A variable of a sample: SI value, unit, KaTeX symbol and label; `sim` marks a value read from the simulation itself
 * (26.56, FOR06: a formula using it checks consistency within the run, not against an independent solution).
 */
export interface VarValue { value: number; unit: string; symbol: string; label: string; sim?: boolean }
/** A simulated measurement: value (null when there is none), unit, label and an optional note. */
export interface Measure { value: number | null; unit: string; label: string; note?: string }
/** Variables, measurements and conditions of a situation at one time. */
export interface Sample { vars: Record<string, VarValue>; measures: Record<string, Measure>; conditions: Condition[] }

/** A recognised situation over [t0, t1]. */
export interface Situation {
  key: string
  /** Situation type, matched by FormulaDef.situation. */
  type: string
  title: string
  t0: number
  t1: number
  /** Event-type situations (collisions) refer to this instant. */
  tEvent?: number
  /** Ids of the bodies involved. */
  bodies: string[]
  /** Variables, measurements and conditions at time t in [t0, t1] (computed in the core). */
  sample: (t: number) => Sample
}

type Text = string | Message
const SIM_MARK = /（仿真）/
const text = (v: Text | null | undefined): string => (v === null || v === undefined ? '' : typeof v === 'string' ? v : msgText(v))

/** Raw forms of the core's JSON. */
export interface RawCondition { id: string; label: Text; status: CondStatus; detail: Text }
export interface RawSample {
  vars: Record<string, { value: number; unit: string; symbol: string; label: Text }>
  measures: Record<string, { value: number | null; unit: string; label: Text; note?: Text }>
  conditions: RawCondition[]
}
export interface RawSituation { key: string; type: string; title: Text; t0: number; t1: number; tEvent?: number; bodies: string[] }

/** A condition with its texts rendered. */
export function conditionOf(c: RawCondition): Condition { return { id: c.id, label: text(c.label), status: c.status, detail: text(c.detail) } }

/** A sample with its texts rendered. */
export function sampleOf(r: RawSample): Sample {
  const vars: Record<string, VarValue> = {}
  for (const [k, v] of Object.entries(r.vars)) {
    const o: VarValue = { value: v.value, unit: v.unit, symbol: v.symbol, label: text(v.label) }
    // the core labels simulated values “（仿真）” in their Chinese source key
    if (SIM_MARK.test(typeof v.label === 'string' ? v.label : v.label?.key ?? '')) o.sim = true
    vars[k] = o
  }
  const measures: Record<string, Measure> = {}
  for (const [k, m] of Object.entries(r.measures)) {
    const o: Measure = { value: m.value, unit: m.unit, label: text(m.label) }
    if (m.note !== undefined && m.note !== null) o.note = text(m.note)
    measures[k] = o
  }
  return { vars, measures, conditions: r.conditions.map(conditionOf) }
}

/** A situation object for the core's JSON of situation `r` in `session`. */
export function situationOf(session: EngineSession, r: RawSituation): Situation {
  const cache = new Map<number, Sample>()
  const s: Situation = {
    key: r.key, type: r.type, title: text(r.title), t0: r.t0, t1: r.t1, bodies: r.bodies,
    sample: (t: number) => {
      let hit = cache.get(t)
      if (!hit) {
        hit = sampleOf(session.call<{ sample: RawSample }>({ op: 'sample', key: r.key, t }).sample)
        if (cache.size > 64) cache.clear()
        cache.set(t, hit)
      }
      return hit
    }
  }
  if (r.tEvent !== undefined) s.tEvent = r.tEvent
  return s
}

const recognised = new WeakMap<EngineSession, { frames: number; events: number; lang: string; list: Situation[] }>()

/**
 * Situations of a recording (recognised in the core; incremental while it grows). The list is cached per recording
 * prefix and interface language.
 */
export function recognize(rec: Recording): Situation[] {
  const s = rec.session
  const lang = activeLang()
  const hit = recognised.get(s)
  if (hit && hit.frames === rec.frameCount && hit.events === rec.events.length && hit.lang === lang) return hit.list
  if (s.freed) return []
  const r = s.call<{ situations: RawSituation[] }>({ op: 'situations' })
  const list = r.situations.map(x => situationOf(s, x))
  recognised.set(s, { frames: rec.frameCount, events: rec.events.length, lang, list })
  return list
}

/** Situations active at t: from their event time (if any, else t0) to t1. */
export function activeSituations(sits: Situation[], t: number): Situation[] {
  return sits.filter(s => (s.tEvent !== undefined ? t >= s.tEvent - 1e-12 && t <= s.t1 + 1e-12 : t >= s.t0 - 1e-12 && t <= s.t1 + 1e-12))
}
