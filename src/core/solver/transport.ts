/**
 * Transport of recordings between threads (decision D13). A recording holds object graphs (the compiled
 * system, modes that point at contact features, impacts that point at pairs) that cannot be posted. The
 * worker sends plain data — typed arrays for the states, indices for pairs, features, segments and events —
 * and the receiving thread recompiles `system` from the same scene, so that every mode decodes to the very
 * feature objects its own solver would use: frame states, mode solutions and the hash are bit-identical.
 *
 * Progressive runs post deltas (only what is new since the last post); RecordingAssembler rebuilds
 * consistent prefixes from them.
 */
import type { Scene } from '../scene/types'
import type { Mode, System, UnitMode } from './dynamics'
import { buildSystem } from './dynamics'
import { compileModel } from './model'
import type { ImpactPoint, ImpactResult } from './impact'
import type { ChangeDetail, Recording, Segment, SimEvent, SimStats, SimulationRun } from './simulation'
import { recordingHash } from './simulation'
import type { EventType } from './events'

/** UnitMode with the pair and features as indices; `friction` indexes ['none', 'stick', 'slide']. */
export interface EncodedUnit { pair: number; ref: number; points: number[]; open: number[]; friction: 0 | 1 | 2; s: number }
/** Mode as plain data. */
export interface EncodedMode { units: EncodedUnit[]; taut: boolean[]; sw?: number[] }
/** Segment as plain data. */
export interface EncodedSegment { index: number; t0: number; t1: number; mode: EncodedMode; X0: Float64Array; label: string; impactLoss: number; reduced?: boolean }
/** ImpactPoint with pair and feature indices (−1: none). */
export type EncodedImpactPoint = Omit<ImpactPoint, 'pair' | 'feature'> & { pair: number; feature: number }
/** ImpactResult as plain data. */
export interface EncodedImpact { X: Float64Array; points: EncodedImpactPoint[]; energyBefore: number; energyAfter: number; loss: number; warning?: string }
/** SimEvent as plain data. */
export interface EncodedEvent { index: number; t: number; triggers: EventType[]; changes: ChangeDetail[]; before: Float64Array; after: Float64Array; impact: EncodedImpact | null; segment: number }

/** New data of a run since the previous delta. */
export interface RecordingDelta {
  /** First frame in `states`. */
  fromFrame: number
  /** Number of valid frames after applying the delta. */
  frameCount: number
  states: Float64Array
  frameSegment: Int32Array
  impactLoss: Float64Array
  /** Segments from this index on are replaced (the last one grows while the run continues). */
  segmentsFrom: number
  segments: EncodedSegment[]
  /** Events from this index on are new. */
  eventsFrom: number
  events: EncodedEvent[]
  warnings: string[]
  stats: SimStats
  /** Simulated time reached (s). */
  t: number
  /** Simulated duration (s). */
  T: number
  /** Start of the Moreau–Jean fallback (reduced accuracy), null while event-driven. */
  reducedFrom: number | null
}

/** End of a run. */
export interface RecordingEnd { completed: boolean; error: string | null; hash: string }

/** A whole recording as plain data. */
export interface EncodedRecording { delta: RecordingDelta; end: RecordingEnd }

const FRICTION = ['none', 'stick', 'slide'] as const

function featureIndex(sys: System, pair: number, f: unknown): number {
  const i = sys.pairs[pair].features.indexOf(f as never)
  if (i < 0) throw new Error('transport: contact feature not found in its pair')
  return i
}

/** Mode as plain data (features as indices into their pair). */
export function encodeMode(sys: System, mode: Mode): EncodedMode {
  const units = mode.units.map(u => {
    const pi = u.pair.index
    return {
      pair: pi, ref: featureIndex(sys, pi, u.ref), points: u.points.map(p => featureIndex(sys, pi, p)), open: u.open.map(p => featureIndex(sys, pi, p)),
      friction: FRICTION.indexOf(u.friction) as 0 | 1 | 2, s: u.s
    }
  })
  return mode.sw ? { units, taut: mode.taut.slice(), sw: mode.sw.slice() } : { units, taut: mode.taut.slice() }
}

/** Mode from plain data, pointing at this system's feature objects. */
export function decodeMode(sys: System, m: EncodedMode): Mode {
  const units: UnitMode[] = m.units.map(u => {
    const pair = sys.pairs[u.pair]
    return { pair, ref: pair.features[u.ref], points: u.points.map(i => pair.features[i]), open: u.open.map(i => pair.features[i]), friction: FRICTION[u.friction], s: u.s }
  })
  return m.sw ? { units, taut: m.taut.slice(), sw: m.sw.slice() } : { units, taut: m.taut.slice() }
}

function encodeSegment(sys: System, s: Segment): EncodedSegment {
  const out: EncodedSegment = { index: s.index, t0: s.t0, t1: s.t1, mode: encodeMode(sys, s.mode), X0: Float64Array.from(s.X0), label: s.label, impactLoss: s.impactLoss }
  if (s.reduced) out.reduced = true
  return out
}

function decodeSegment(sys: System, s: EncodedSegment): Segment {
  const out: Segment = { index: s.index, t0: s.t0, t1: s.t1, mode: decodeMode(sys, s.mode), X0: s.X0, label: s.label, impactLoss: s.impactLoss }
  if (s.reduced) out.reduced = true
  return out
}

function encodeImpact(sys: System, imp: ImpactResult): EncodedImpact {
  const points = imp.points.map(p => {
    const pair = p.pair ? p.pair.index : -1
    return { ...p, pair, feature: p.feature && pair >= 0 ? featureIndex(sys, pair, p.feature) : -1 }
  })
  const out: EncodedImpact = { X: Float64Array.from(imp.X), points, energyBefore: imp.energyBefore, energyAfter: imp.energyAfter, loss: imp.loss }
  if (imp.warning) out.warning = imp.warning
  return out
}

function decodeImpact(sys: System, imp: EncodedImpact): ImpactResult {
  const points: ImpactPoint[] = imp.points.map(p => {
    const pair = p.pair >= 0 ? sys.pairs[p.pair] : null
    return { ...p, pair, feature: pair && p.feature >= 0 ? pair.features[p.feature] : null }
  })
  const out: ImpactResult = { X: imp.X, points, energyBefore: imp.energyBefore, energyAfter: imp.energyAfter, loss: imp.loss }
  if (imp.warning) out.warning = imp.warning
  return out
}

function encodeEvent(sys: System, e: SimEvent): EncodedEvent {
  return {
    index: e.index, t: e.t, triggers: e.triggers.slice(), changes: e.changes.map(c => JSON.parse(JSON.stringify(c)) as ChangeDetail),
    before: Float64Array.from(e.before), after: Float64Array.from(e.after), impact: e.impact ? encodeImpact(sys, e.impact) : null, segment: e.segment
  }
}

function decodeEvent(sys: System, e: EncodedEvent): SimEvent {
  return { index: e.index, t: e.t, triggers: e.triggers, changes: e.changes, before: e.before, after: e.after, impact: e.impact ? decodeImpact(sys, e.impact) : null, segment: e.segment }
}

/** Typed-array buffers of a delta, for postMessage's transfer list. */
export function deltaTransfer(d: RecordingDelta): ArrayBuffer[] {
  const out = new Set<ArrayBuffer>([d.states.buffer as ArrayBuffer, d.frameSegment.buffer as ArrayBuffer, d.impactLoss.buffer as ArrayBuffer])
  for (const s of d.segments) out.add(s.X0.buffer as ArrayBuffer)
  for (const e of d.events) {
    out.add(e.before.buffer as ArrayBuffer); out.add(e.after.buffer as ArrayBuffer)
    if (e.impact) out.add(e.impact.X.buffer as ArrayBuffer)
  }
  return [...out]
}

/** Encode a finished (or partial) recording as one delta from frame 0. */
export function encodeRecording(rec: Recording): EncodedRecording {
  const sys = rec.system
  const delta: RecordingDelta = {
    fromFrame: 0, frameCount: rec.frameCount,
    states: rec.states.slice(0, rec.frameCount * rec.size), frameSegment: rec.frameSegment.slice(0, rec.frameCount), impactLoss: rec.impactLoss.slice(0, rec.frameCount),
    segmentsFrom: 0, segments: rec.segments.map(s => encodeSegment(sys, s)),
    eventsFrom: 0, events: rec.events.map(e => encodeEvent(sys, e)),
    warnings: rec.warnings.slice(), stats: { ...rec.stats },
    t: rec.segments.length ? rec.segments[rec.segments.length - 1].t1 : 0, T: (rec.frameCount - 1) * rec.dt,
    reducedFrom: rec.reducedFrom ?? null
  }
  return { delta, end: { completed: rec.completed, error: rec.error, hash: rec.hash } }
}

/** Decode a recording on a thread that has the same scene (the system is recompiled when not given). */
export function decodeRecording(scene: Scene, enc: EncodedRecording, system?: System): Recording {
  const asm = new RecordingAssembler(scene, enc.delta.frameCount, system)
  asm.apply(enc.delta)
  return asm.final(enc.end)
}

/** Collects the deltas of a run (worker side): `next()` returns what is new since the previous call. */
export class DeltaWriter {
  private frames = 0
  private segments = 0
  private events = 0
  constructor(private readonly run: SimulationRun) {}

  next(): RecordingDelta {
    const run = this.run, sys = run.system, size = run.size
    const rec = run.finished ? run.result() : null
    const frameCount = rec ? rec.frameCount : run.frames
    const from = this.frames
    const segFrom = Math.max(0, this.segments - 1)
    const segs = run.segments.slice(segFrom).map(s => encodeSegment(sys, s))
    if (!run.finished && segs.length) segs[segs.length - 1].t1 = Math.min(run.T, run.t)
    const delta: RecordingDelta = {
      fromFrame: from, frameCount,
      states: run.states.slice(from * size, frameCount * size), frameSegment: run.frameSegment.slice(from, frameCount), impactLoss: run.impactLossArr.slice(from, frameCount),
      segmentsFrom: segFrom, segments: segs,
      eventsFrom: this.events, events: run.events.slice(this.events).map(e => encodeEvent(sys, e)),
      warnings: run.warnings.slice(), stats: { ...run.stats }, t: run.t, T: run.T, reducedFrom: run.reducedFrom
    }
    this.frames = frameCount
    this.segments = run.segments.length
    this.events = run.events.length
    return delta
  }
}

/**
 * Rebuilds a recording from deltas (receiving side). `partial()` is a consistent prefix that shares the
 * assembler's buffers (only appended to); `final(end)` is the finished recording.
 */
export class RecordingAssembler {
  readonly scene: Scene
  readonly system: System
  readonly size: number
  readonly dt: number
  private readonly states: Float64Array
  private readonly frameSegment: Int32Array
  private readonly impactLoss: Float64Array
  private segments: Segment[] = []
  private events: SimEvent[] = []
  private warnings: string[] = []
  private stats: SimStats = { steps: 0, rejected: 0, events: 0, locateIterations: 0, maxPositionCorrection: 0, maxVelocityCorrection: 0, ambiguousModes: 0, wallMs: 0 }
  private frames = 0
  private reducedFrom: number | null = null
  /** Simulated time reached (s), for progress. */
  t = 0
  /** Simulated duration (s). */
  T = 0

  /** `maxFrames`: frames of the complete run (K + 1). */
  constructor(scene: Scene, maxFrames: number, system?: System) {
    this.scene = scene
    this.system = system ?? buildSystem(compileModel(scene))
    this.size = this.system.size
    this.dt = scene.settings.outputStep
    this.states = new Float64Array(Math.max(1, maxFrames) * this.size)
    this.frameSegment = new Int32Array(Math.max(1, maxFrames))
    this.impactLoss = new Float64Array(Math.max(1, maxFrames))
  }

  get frameCount(): number { return this.frames }

  /** Apply a delta; it may overlap frames already received but must not skip any. */
  apply(d: RecordingDelta) {
    const sys = this.system
    if (d.fromFrame !== this.frames && !(d.fromFrame < this.frames)) throw new Error('transport: missing frames')
    this.states.set(d.states, d.fromFrame * this.size)
    this.frameSegment.set(d.frameSegment, d.fromFrame)
    this.impactLoss.set(d.impactLoss, d.fromFrame)
    this.frames = d.frameCount
    const segs = this.segments.slice(0, d.segmentsFrom)
    for (const s of d.segments) segs.push(decodeSegment(sys, s))
    this.segments = segs
    const evs = this.events.slice(0, d.eventsFrom)
    for (const e of d.events) evs.push(decodeEvent(sys, e))
    this.events = evs
    this.warnings = d.warnings.slice()
    this.stats = { ...d.stats }
    this.t = d.t
    this.T = d.T
    this.reducedFrom = d.reducedFrom
  }

  /** A consistent prefix of the recording (see the class doc). */
  partial(): Recording {
    const n = this.frames
    const rec: Recording = {
      scene: this.scene, system: this.system, dt: this.dt, frameCount: n, size: this.size,
      states: this.states.subarray(0, n * this.size), frameSegment: this.frameSegment.subarray(0, n), impactLoss: this.impactLoss.subarray(0, n),
      segments: this.segments.slice(), events: this.events.slice(), warnings: this.warnings.slice(), stats: { ...this.stats },
      completed: false, error: null, hash: ''
    }
    if (this.reducedFrom !== null) rec.reducedFrom = this.reducedFrom
    return rec
  }

  /** The finished recording; the hash is recomputed from the data and must equal the sender's. */
  final(end: RecordingEnd): Recording {
    const n = this.frames
    const states = n * this.size === this.states.length ? this.states : this.states.slice(0, n * this.size)
    const hash = recordingHash(states, this.events)
    if (end.hash && hash !== end.hash) throw new Error('transport: recording fingerprint mismatch')
    const rec: Recording = {
      scene: this.scene, system: this.system, dt: this.dt, frameCount: n, size: this.size,
      states, frameSegment: this.frameSegment.slice(0, n), impactLoss: this.impactLoss.slice(0, n),
      segments: this.segments, events: this.events, warnings: this.warnings, stats: this.stats,
      completed: end.completed, error: end.error, hash
    }
    if (this.reducedFrom !== null) rec.reducedFrom = this.reducedFrom
    return rec
  }
}
