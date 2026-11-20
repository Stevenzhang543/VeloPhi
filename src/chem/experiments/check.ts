/**
 * Evaluating the checks of a guided experiment (26.64, D270). A check is a condition on numbers the core reports;
 * this module reads those numbers from a view of the bench and compares. Nothing chemical is computed here: the only
 * arithmetic is a unit (K → °C, Pa → kPa), a sum over the ids a quantity names, a gas's share of the gas volume the
 * core reports, and the difference to the value a quantity had when the step began.
 */
import { chemFlame, chemSpecies } from '../../engine/chem'
import type { CircuitState, VesselReading, VesselState } from '../../engine/chem'
import { kindOf } from '../apparatus'
import { substanceOf } from '../catalog'
import type { Check, Quantity } from './types'

/** What the evaluator needs of a bench (the store of the page, or a bare session in a script). */
export interface BenchView {
  time: number
  vessel(id: string): VesselState | undefined
  /** The vessel in full (species of the solution); null when it is not on the bench. */
  reading(id: string): VesselReading | null
  circuitOf(vessel: string): CircuitState | undefined
  /** Instruments and tools on the vessel. */
  parts(vessel: string): string[]
  /** Sum of the events of a kind in a vessel since the experiment began (mol; all subjects when `id` is absent). */
  event(vessel: string, code: string, id?: string): number
}

/** One leaf of a check with what the bench shows for it. */
export interface Term {
  check: Check
  ok: boolean
  /** The number compared (a quantity, a quotient or a change); null when the bench has nothing to read. */
  value: number | null
}
export interface Outcome { ok: boolean; terms: Term[] }

/** Values the `since: 'step'` checks of a step started from, by `quantityKey`. */
export type Baseline = Map<string, number>

export const quantityKey = (q: Quantity) => JSON.stringify(q)

const sumIds = <T extends { id: string }>(list: T[] | undefined, id: string | string[], pick: (x: T) => number): number => {
  const ids = Array.isArray(id) ? id : [id]
  let s = 0
  for (const x of list ?? []) if (ids.includes(x.id)) s += pick(x)
  return s
}

/** The value of a quantity now; null when the vessel is not there or has nothing of the kind (no solution: no pH). */
export function valueOf(q: Quantity, b: BenchView): number | null {
  if (q.q === 'time') return b.time
  if (q.q === 'flame') { const f = flameColour(q.v, b); return f ? f[q.ch === 'r' ? 0 : q.ch === 'g' ? 1 : 2] : 0 }
  const v = b.vessel(q.v)
  if (!v) return null
  switch (q.q) {
    case 'pH': return v.pH ?? null
    case 'T': return v.T - 273.15
    case 'volume': return v.volume_mL
    case 'mass': return v.mass_g
    case 'water': return v.water_g ?? 0
    case 'gasVolume': return v.gas_mL
    case 'pressure': return v.P / 1000
    case 'solid': return sumIds(v.solids, q.id, s => (q.unit === 'g' ? s.g : s.n))
    case 'gas': {
      const n = sumIds(v.gas, q.id, s => s.n)
      if (q.unit !== 'mL') return n
      const all = v.gas.reduce((s, x) => s + x.n, 0)
      return all > 0 ? (v.gas_mL * n) / all : 0
    }
    case 'released': return sumIds(v.released, q.id, s => s.n)
    case 'solute': return sumIds(v.solutes, q.id, s => s.n)
    case 'liquid': return sumIds(v.liquids, q.id, s => s.n)
    case 'species': {
      const r = b.reading(q.v)
      if (!r) return null
      return sumIds(r.species, q.id, s => (q.unit === 'M' ? s.c : s.n))
    }
    case 'colour': {
      const c = q.gas ? v.gasColour : v.colour
      return c ? c[q.ch === 'r' ? 0 : q.ch === 'g' ? 1 : 2] : 255
    }
    case 'event': return b.event(q.v, q.code, q.id)
    case 'circuit': {
      const c = b.circuitOf(q.v)
      if (!c) return null
      if (q.field === 'emf') return c.emf
      if (q.field === 'I') return c.on && c.connected ? Math.abs(c.I) : 0
      if (q.field === 'charge') return c.charge
      const pole = [c.a, c.b].find(p => p.vessel === q.v && p.material === q.electrode)
      return pole ? pole.massChange_g : null
    }
  }
}

const within = (x: number | null, min?: number, max?: number) => x !== null && Number.isFinite(x) && (min === undefined || x >= min) && (max === undefined || x <= max)

/** The elements in a vessel: those of every species present in more than a trace. */
export function elementsIn(vessel: string, b: BenchView): string[] {
  const r = b.reading(vessel)
  if (!r) return []
  const ids = [...(r.species ?? []).filter(x => x.n > 1e-9).map(x => x.id), ...r.solids.map(x => x.id), ...r.liquids.map(x => x.id), ...r.solutes.map(x => x.id)]
  const out = new Set<string>()
  for (const id of ids) {
    let comp = substanceOf(id)?.comp
    if (!comp) { try { comp = chemSpecies({ ids: [id] }).species[0]?.comp } catch { comp = undefined } }
    for (const el of Object.keys(comp ?? {})) out.add(el)
  }
  return [...out]
}

/** The colour of a flame holding the vessel's contents, as seen through the filters on the vessel; null when nothing colours it. */
export function flameColour(vessel: string, b: BenchView): [number, number, number] | null {
  const blocked = new Set(b.parts(vessel).flatMap(p => kindOf(p)?.tool?.blocks ?? []))
  const elements = elementsIn(vessel, b).filter(e => !blocked.has(e))
  if (!elements.length) return null
  try { return chemFlame(elements).rgb } catch { return null }
}

function leaf(c: Check, b: BenchView, base: Baseline | undefined): Term {
  if ('is' in c) {
    let x = valueOf(c.is, b)
    if (c.since === 'step' && x !== null) x -= base?.get(quantityKey(c.is)) ?? x
    return { check: c, ok: within(x, c.min, c.max), value: x }
  }
  if ('ratio' in c) {
    const n = valueOf(c.ratio[0], b), d = valueOf(c.ratio[1], b)
    const x = n !== null && d !== null && d !== 0 ? n / d : null
    return { check: c, ok: within(x, c.min, c.max), value: x }
  }
  if ('flag' in c) {
    const v = b.vessel(c.v)
    const want = c.on !== false
    let is = false
    if (v) {
      if (c.flag === 'closed') is = v.closed
      else if (c.flag === 'heating') is = v.heater > 0
      else if (c.flag === 'bath') is = v.bath !== null
      else if (c.flag === 'ignited') is = v.ignited
      else if (c.flag === 'collecting') is = v.collect !== 'none'
      else is = c.to ? v.outlet === c.to : v.outlet !== null
    }
    return { check: c, ok: !!v && is === want, value: null }
  }
  if ('part' in c) return { check: c, ok: b.parts(c.v).includes(c.part), value: null }
  if ('wired' in c) { const k = b.circuitOf(c.wired); return { check: c, ok: (!!k && k.connected && k.on) === (c.on !== false), value: null } }
  throw new Error('check: not a leaf')
}

/** Evaluate a check: whether it holds, and every leaf with the number the bench shows for it. */
export function evaluate(c: Check, b: BenchView, base?: Baseline): Outcome {
  if ('all' in c) { const parts = c.all.map(x => evaluate(x, b, base)); return { ok: parts.every(p => p.ok), terms: parts.flatMap(p => p.terms) } }
  if ('any' in c) { const parts = c.any.map(x => evaluate(x, b, base)); return { ok: parts.some(p => p.ok), terms: parts.flatMap(p => p.terms) } }
  if ('not' in c) { const p = evaluate(c.not, b, base); return { ok: !p.ok, terms: p.terms.map(t => ({ ...t, ok: !t.ok })) } }
  const t = leaf(c, b, base)
  return { ok: t.ok, terms: [t] }
}

/** The quantities a check compares with their value at the start of a step. */
export function sinceQuantities(c: Check, out: Quantity[] = []): Quantity[] {
  if ('all' in c) c.all.forEach(x => sinceQuantities(x, out))
  else if ('any' in c) c.any.forEach(x => sinceQuantities(x, out))
  else if ('not' in c) sinceQuantities(c.not, out)
  else if ('is' in c && c.since === 'step') out.push(c.is)
  return out
}

/** The values the `since` quantities of a check have now: the baseline of a step that begins. */
export function baselineOf(c: Check, b: BenchView): Baseline {
  const m: Baseline = new Map()
  for (const q of sinceQuantities(c)) { const x = valueOf(q, b); if (x !== null) m.set(quantityKey(q), x) }
  return m
}

/** Every vessel letter or id a check names. */
export function vesselsOf(c: Check, out = new Set<string>()): Set<string> {
  if ('all' in c) c.all.forEach(x => vesselsOf(x, out))
  else if ('any' in c) c.any.forEach(x => vesselsOf(x, out))
  else if ('not' in c) vesselsOf(c.not, out)
  else if ('is' in c) { if (c.is.q !== 'time') out.add(c.is.v) }
  else if ('ratio' in c) { for (const q of c.ratio) if (q.q !== 'time') out.add(q.v) }
  else if ('flag' in c) { out.add(c.v); if (c.to) out.add(c.to) }
  else if ('part' in c) out.add(c.v)
  else if ('wired' in c) out.add(c.wired)
  return out
}
