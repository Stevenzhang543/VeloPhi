/**
 * Parameterized problems with constraints (26.56, D102; blueprint EDU10, EDU13): a teacher names a model, the
 * inputs to draw (range and step), the conditions that must hold and the outputs asked for. Values are drawn from a
 * seeded generator (the same seed gives the same problem), rounded to their step, and every draw is evaluated by the
 * Rust model registry: draws whose conditions fail, whose answers are undefined or outside the allowed range are
 * rejected and reported. The answer is always the core's value for the rounded inputs shown to the learner.
 */
import { modelById, exampleInputs } from '../content/models'
import { evalModel } from '../engine/models'

export interface ParamRange { lo: number; hi: number; step: number }

export interface ParamSpec {
  model: string
  /** Outputs asked for. */
  ask: string[]
  /** Inputs drawn (SI). */
  vary: Record<string, ParamRange>
  /** Inputs fixed (SI); the others take the model's worked example. */
  fixed?: Record<string, number>
  /** Conditions that must be applicable. */
  require?: string[]
  /** Allowed ranges of outputs (SI). */
  outputRange?: Record<string, { min?: number; max?: number }>
  constantsSet?: string
}

export interface ParamInstance {
  seed: number
  inputs: Record<string, number>
  answers: Record<string, { value: number; unit: string }>
  conditions: Record<string, string>
  tries: number
}

export interface Rejection { inputs: Record<string, number>; reason: string }

/**
 * mulberry32: a small seeded generator (reproducible in every browser and in Node). The seed is scrambled first
 * (murmur3 finaliser): the first draws of plain mulberry32 for neighbouring seeds 1, 2, 3 … lie close together, so
 * a teacher's seeds 1–5 gave nearly the same problems (26.56 hand check).
 */
export function seeded(seed: number): () => number {
  let a = (seed >>> 0) ^ 0x9e3779b9
  a = Math.imul(a ^ (a >>> 16), 0x85ebca6b)
  a = Math.imul(a ^ (a >>> 13), 0xc2b2ae35)
  a = (a ^ (a >>> 16)) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A value on the grid lo + k·step within [lo, hi], free of binary noise. */
export function onGrid(r: ParamRange, u: number): number {
  const n = Math.max(0, Math.floor((r.hi - r.lo) / r.step + 1e-9))
  const k = Math.min(n, Math.floor(u * (n + 1)))
  return Number((r.lo + k * r.step).toPrecision(12))
}

/** Problems with the specification itself (unknown names, empty ranges, ranges outside the input domain). */
export function checkSpec(spec: ParamSpec): string[] {
  const m = modelById(spec.model)
  if (!m) return [`unknown model ${spec.model}`]
  const issues: string[] = []
  const outs = new Set(m.outputs.map(o => o.id))
  const conds = new Set((m.conditions ?? []).map(c => c.id))
  for (const a of spec.ask) if (!outs.has(a)) issues.push(`unknown output ${a}`)
  for (const c of spec.require ?? []) if (!conds.has(c)) issues.push(`unknown condition ${c}`)
  for (const [id, r] of Object.entries(spec.vary)) {
    const i = m.inputs.find(x => x.id === id)
    if (!i) { issues.push(`unknown input ${id}`); continue }
    if (!(r.step > 0) || !(r.hi >= r.lo)) issues.push(`${id}: empty range or step`)
    if (i.min !== undefined && (r.lo < i.min || (i.open && r.lo === i.min))) issues.push(`${id}: below the domain (${i.min})`)
    if (i.max !== undefined && (r.hi > i.max || (i.open && r.hi === i.max))) issues.push(`${id}: above the domain (${i.max})`)
  }
  return issues
}

/** One problem for a seed; draws again (up to `maxTries`) while the core rejects the values. */
export function generate(spec: ParamSpec, seed: number, maxTries = 40): { instance: ParamInstance | null; rejected: Rejection[] } {
  const m = modelById(spec.model)
  if (!m) return { instance: null, rejected: [{ inputs: {}, reason: 'model' }] }
  const rand = seeded(seed)
  const rejected: Rejection[] = []
  for (let tries = 1; tries <= maxTries; tries++) {
    const inputs: Record<string, number> = { ...exampleInputs(m), ...(spec.fixed ?? {}) }
    for (const [id, r] of Object.entries(spec.vary)) inputs[id] = onGrid(r, rand())
    const r = evalModel(spec.model, inputs, { constantsSet: spec.constantsSet ?? 'CODATA2022' })
    let reason = ''
    if (r.domain.length) reason = `domain:${r.domain.map(d => d.input).join(',')}`
    const conds = Object.fromEntries(r.conditions.map(c => [c.id, c.state]))
    for (const c of spec.require ?? []) if (!reason && conds[c] !== 'applicable') reason = `condition:${c}`
    const answers: ParamInstance['answers'] = {}
    for (const a of spec.ask) {
      if (reason) break
      const o = r.outputs.find(x => x.id === a && (x.state === 'applicable' || x.state === 'approximate'))
      if (!o || o.value === null || !Number.isFinite(o.value)) { reason = `undefined:${a}`; break }
      const lim = spec.outputRange?.[a]
      if (lim && ((lim.min !== undefined && o.value < lim.min) || (lim.max !== undefined && o.value > lim.max))) { reason = `range:${a}`; break }
      answers[a] = { value: o.value, unit: o.unit }
    }
    if (!reason) return { instance: { seed, inputs, answers, conditions: conds, tries }, rejected }
    rejected.push({ inputs, reason })
  }
  return { instance: null, rejected }
}

/** Several seeds at once: the instances, the rejection rate and the reasons (shown to the teacher before use). */
export function preview(spec: ParamSpec, seeds: number[]) {
  const instances: ParamInstance[] = []
  const reasons: Record<string, number> = {}
  let draws = 0
  let failed = 0
  for (const s of seeds) {
    const g = generate(spec, s)
    draws += g.rejected.length + (g.instance ? 1 : 0)
    for (const r of g.rejected) { const k = r.reason.split(':')[0]; reasons[k] = (reasons[k] ?? 0) + 1 }
    if (g.instance) instances.push(g.instance)
    else failed++
  }
  return { instances, failed, rejectionRate: draws ? (draws - instances.length) / draws : 0, reasons }
}
