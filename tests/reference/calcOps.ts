/**
 * TypeScript reference of the calculation interface (26.53, D69): the same requests as the Rust session dispatcher
 * (engine/velophi-core/src/api.rs, engine/CALC.md), answered with the TypeScript engine and numeric modules of
 * 26.52. Used only by scripts/calc-parity.mjs and the reference tests; the application never imports it.
 *
 * A run is fed into a StreamRecording through the worker's deltas, exactly as the interface received runs in 26.52,
 * so evictions and rebuilds (a small `budget`) are part of what is compared.
 */
import type { Scene } from '../../src/core/scene/types'
import { SimulationRun, exactStateAt, frameLedger } from './core/solver/simulation'
import type { Recording } from './core/solver/simulation'
import { StreamRecording } from './core/solver/stream'
import { DeltaWriter } from './core/solver/transport'
import { contactForces, listQuantities, customQuantities, makeContext, makeContextFor, evaluateQuantity, quantitySeries } from './core/observe/quantities'
import type { Situation, Sample, Condition } from './formula/situations'
import { recognize } from './formula/situations'
import { IncrementalRecognizer } from './analysis/recognition'
import { FORMULAS } from '../../src/formula/library'
import { activeSituations, evaluateCard } from './formula/match'
import type { FormulaCard } from './formula/match'
import { eventDataRef } from './eventData'
import { areaRef, fbdRef, frameViewRef, tapeRef, vectorScalesRef } from './views'

/** A calculation request (see engine/CALC.md). */
export type CalcRequest = { op: string } & Record<string, unknown>

/** Options of a reference run. */
export interface RefOptions { duration?: number | null; until?: number; budget?: number; chunk?: number }

/** A reference session: the stream recording of a run, its current recording and the situation recognizer. */
export interface RefSession { stream: StreamRecording; rec: Recording; ended: boolean; recognizer: IncrementalRecognizer; situations: Situation[] | null; recognizedAt: unknown }

/** Run a scene and assemble its stream recording (velophi-cli calc does the same with Rust). */
export function refSession(scene: Scene, o: RefOptions = {}, onDelta?: (k: number, sess: RefSession) => void): RefSession | { createError: string } {
  let run: SimulationRun
  try {
    const opts: { duration?: number | null; chunkSeconds?: number } = {}
    if (o.duration !== undefined) opts.duration = o.duration
    if (o.chunk !== undefined) opts.chunkSeconds = o.chunk
    run = new SimulationRun(scene, opts)
  } catch (e) {
    return { createError: (e as Error).message }
  }
  const stream = new StreamRecording({ scene, chunkFrames: run.chunkFrames, duration: run.bounded ? run.T : null, budgetBytes: o.budget })
  const writer = new DeltaWriter(run, true)
  let until = Infinity
  if (!run.bounded && o.until !== undefined) {
    const F = run.chunkFrames
    until = Math.ceil(Math.ceil(o.until / run.dt - 1e-9) / F) * F
  }
  // Run to the end (or the chunk boundary at `until`), then hand the deltas over one by one (velophi-cli calc)
  const done = run.advance(Infinity, until)
  if (!done) run.stop()
  const sess: RefSession = { stream, rec: stream.snapshot(), ended: false, recognizer: new IncrementalRecognizer(), situations: null, recognizedAt: null }
  writer.next(true).forEach((d, k) => {
    stream.apply(d)
    sess.rec = stream.snapshot()
    onDelta?.(k, sess)
  })
  const r = run.result()
  sess.rec = stream.final({ completed: r.completed, error: r.error, hash: r.hash, stopReason: r.stopReason })
  sess.ended = true
  return sess
}

function segmentInfo(s: Recording['segments'][number]) {
  const o: Record<string, unknown> = { index: s.index, t0: s.t0, t1: s.t1, label: s.label, impactLoss: s.impactLoss }
  if (s.reduced) o.reduced = true
  return o
}

/**
 * Event as the interface reads it (26.53 `events` operation): the changes, a summary of the impact and the label point
 * (the first change's point, else its first moving body's position before the event) — as 26.52 drew it.
 */
function eventInfo(rec: Recording, e: Recording['events'][number]) {
  const model = rec.system.model
  let at: [number, number] | null = null
  const c = e.changes[0]
  if (c) {
    const g = c.bodies.map(id => model.bodies.find(b => b.id === id && b.dynamic)).find(b => b !== undefined)
    if (g) at = c.point ? [c.point.x, c.point.y] : [e.before[3 * g.index], e.before[3 * g.index + 1]]
  }
  const impact = e.impact
    ? {
        loss: e.impact.loss, energyBefore: e.impact.energyBefore, energyAfter: e.impact.energyAfter,
        points: e.impact.points.map(p => ({ kind: p.kind, pair: p.pair?.key ?? null, rope: p.rope, friction: p.friction ?? null, vnBefore: p.vnBefore, vnAfter: p.vnAfter, impulse: p.impulse, cx: p.cx, cy: p.cy }))
      }
    : null
  return { index: e.index, t: e.t, triggers: e.triggers, changes: JSON.parse(JSON.stringify(e.changes)), segment: e.segment, impact, at }
}

/** Answer one request with the TypeScript reference (results shaped like the Rust containers, typed arrays for blobs). */
function situationsOf(sess: RefSession): Situation[] {
  const key = sess.ended ? 'final' : `${sess.rec.frameCount}/${sess.rec.segments.length}/${sess.rec.events.length}`
  if (sess.situations && sess.recognizedAt === key) return sess.situations
  sess.situations = sess.ended ? recognize(sess.rec) : sess.recognizer.update(sess.rec)
  sess.recognizedAt = key
  return sess.situations
}

const condJson = (c: Condition) => ({ id: c.id, label: c.label, status: c.status, detail: c.detail })
function sampleJson(sm: Sample) {
  const vars: Record<string, unknown> = {}, measures: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(sm.vars)) vars[k] = { value: v.value, unit: v.unit, symbol: v.symbol, label: v.label }
  for (const [k, m] of Object.entries(sm.measures)) measures[k] = m.note === undefined ? { value: m.value, unit: m.unit, label: m.label } : { value: m.value, unit: m.unit, label: m.label, note: m.note }
  return { vars, measures, conditions: sm.conditions.map(condJson) }
}
function situationJson(s: Situation) {
  const o: Record<string, unknown> = { key: s.key, type: s.type, title: s.title, t0: s.t0, t1: s.t1 }
  if (s.tEvent !== undefined) o.tEvent = s.tEvent
  o.bodies = s.bodies
  return o
}
function cardJson(c: FormulaCard) {
  const o: Record<string, unknown> = {
    key: c.key, formula: c.formula.id, situation: c.situation.key, verdict: c.verdict, conditions: c.conditions.map(condJson), theory: c.theory, sim: c.sim,
    absError: c.absError, relError: c.relError, reason: c.reason, measureLabel: c.measureLabel
  }
  if (c.measureNote !== undefined) o.measureNote = c.measureNote
  return o
}

/** The calculation fields of the formula library, as the interface hands them to the Rust session. */
export function libraryJson() {
  return FORMULAS.map(f => {
    const o: Record<string, unknown> = { id: f.id, situation: f.situation, expr: f.expr, unit: f.unit, measure: f.measure, kind: f.kind }
    if (f.requires) o.requires = [...f.requires]
    if (f.approxOf) o.approxOf = f.approxOf
    if (f.causes) o.causes = [...f.causes]
    return o
  })
}

export function refCall(sess: RefSession, req: CalcRequest): unknown {
  const { stream, rec } = sess
  const sys = rec.system
  const num = (k: string) => (req[k] === undefined ? undefined : Number(req[k]))
  switch (req.op) {
    case 'info':
      return {
        frameCount: rec.frameCount, dt: rec.dt, size: rec.size, chunkFrames: stream.chunkFrames, t: stream.t, T: stream.T,
        duration: stream.duration, segments: rec.segments.length, events: rec.events.length, reducedFrom: rec.reducedFrom ?? null,
        completed: rec.completed, error: rec.error, stopReason: rec.stopReason ?? null, hash: rec.hash, rolling: stream.rollingFingerprint(), closedChunks: stream.closedChunks
      }
    case 'frames': {
      const last = rec.frameCount - 1
      const from = num('from') ?? 0, to = Math.min(num('to') ?? last, last), stride = Math.max(1, num('stride') ?? 1)
      const states: number[] = [], seg: number[] = [], loss: number[] = []
      for (let k = from; k <= to && rec.frameCount > 0; k += stride) { states.push(...stream.state(k)); seg.push(stream.segment(k)); loss.push(stream.impactLoss(k)) }
      return { count: seg.length, states: Float64Array.from(states), segment: Int32Array.from(seg), impactLoss: Float64Array.from(loss) }
    }
    case 'exactStates': {
      const times = (req.times as number[]) ?? []
      const out: number[] = []
      for (const t of times) out.push(...exactStateAt(rec, t))
      return { states: Float64Array.from(out) }
    }
    case 'ledger':
      return { ledger: ((req.frames as number[]) ?? []).map(k => frameLedger(rec, k)) }
    case 'segments':
      return { segments: rec.segments.slice(num('from') ?? 0).map(segmentInfo) }
    case 'events':
      return { events: rec.events.slice(num('from') ?? 0).map(e => eventInfo(rec, e)) }
    case 'event': {
      const e = rec.events[num('index')!]
      return { ...eventInfo(rec, e), before: Float64Array.from(e.before), after: Float64Array.from(e.after) }
    }
    case 'quantities':
      return {
        quantities: listQuantities(sys).map(q => ({ id: q.id, label: q.label, symbol: q.symbol, unit: q.unit, group: q.group, owner: q.owner })),
        custom: customQuantities(sys).map(c => ({ id: c.def.id, unit: c.compiled ? c.compiled.unit : null, error: c.error }))
      }
    case 'evaluate': {
      const ids = req.ids as string[]
      let ctx
      if (req.frame !== undefined) ctx = makeContext(rec, num('frame')!)
      else {
        const t = num('t')!
        const X = exactStateAt(rec, t)
        let seg = rec.segments[0]
        for (const s of rec.segments) if (s.t0 <= t) seg = s
        let k = Math.min(rec.frameCount - 1, Math.max(0, Math.floor(t / rec.dt)))
        if (k + 1 < rec.frameCount && (k + 1) * rec.dt <= t) k++
        while (k > 0 && k * rec.dt > t) k--
        ctx = makeContextFor(rec, X, seg.mode, stream.impactLoss(k), t)
      }
      return { values: Float64Array.from(ids.map(id => evaluateQuantity(ctx, id))) }
    }
    case 'series': {
      const last = rec.frameCount - 1
      const r = quantitySeries(rec, req.ids as string[], num('from') ?? 0, Math.min(num('to') ?? last, last), num('stride') ?? 1)
      return { t: r.t, values: r.values }
    }
    case 'contactForces': {
      const c = contactForces(makeContext(rec, num('frame')!), String(req.on), String(req.by))
      return { Nx: c.Nx, Ny: c.Ny, N: c.N, fx: c.fx, fy: c.fy, f: c.f, vt: c.vt, inContact: c.inContact, status: c.status }
    }
    case 'eventData':
      return { event: eventDataRef(rec, Number(req.index)) }
    case 'setLibrary':
      return { formulas: FORMULAS.length }
    case 'situations':
      return { situations: situationsOf(sess).map(situationJson) }
    case 'sample': {
      const sit = situationsOf(sess).find(x => x.key === req.key)
      if (!sit) throw new Error('no such situation')
      const t = Number(req.t)
      return { sample: sampleJson(sit.sample(Math.min(Math.max(t, sit.t0), sit.t1))) }
    }
    case 'cards': {
      const t = Number(req.t)
      const groups = activeSituations(situationsOf(sess), t).map(sit => {
        const sm = sit.sample(Math.min(Math.max(t, sit.t0), sit.t1))
        return { situation: situationJson(sit), sample: sampleJson(sm), cards: FORMULAS.filter(f => f.situation === sit.type).map(f => cardJson(evaluateCard(f, sit, sm, { digits: 6 }))) }
      })
      return { groups }
    }
    case 'frameView':
      return frameViewRef(rec, Number(req.t), !!req.exact, (req.forces as 'all' | string[] | null | undefined) ?? null)
    case 'fbd':
      return { fbd: fbdRef(rec, Number(req.t), String(req.body)) }
    case 'tape':
      return { tape: tapeRef(rec, { body: String(req.body), direction: (req.direction as 'path' | 'x' | 'y') ?? 'path', period: num('period') ?? 0.02, every: num('every') ?? 5, start: num('start') ?? 0, intervals: num('intervals') }) }
    case 'area':
      return { area: areaRef(rec, String(req.id), num('t0') ?? 0, num('t1') ?? 0) }
    case 'vectorScales':
      return vectorScalesRef(req.recording === false ? null : rec, sys)
    default:
      throw new Error(`reference: unknown op ${req.op}`)
  }
}
