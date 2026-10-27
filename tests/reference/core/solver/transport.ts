/**
 * Transport of recordings between threads (decisions D13, D20, D26). A recording holds object graphs (the
 * compiled system, modes that point at contact features, impacts that point at pairs) that cannot be posted. The
 * worker sends plain data — typed arrays for the frames and checkpoints, indices for pairs, features, segments
 * and events — and the receiving thread recompiles `system` from the same scene, so that every mode decodes to
 * the very feature objects its own solver would use: frame states, mode solutions and fingerprints are
 * bit-identical.
 *
 * A streaming run posts one delta per closed chunk of frames (its frames, checkpoint, summary and digest, the
 * segments and events up to its end), plus a delta with the frames computed so far when a chunk takes long. The
 * receiving side is a StreamRecording (stream.ts). Byte layouts: docs/dev/STREAMING.md.
 */
import type { Message } from '../../../../src/i18n/message'
import type { Scene } from '../../../../src/core/scene/types'
import type { System } from './dynamics'
import type { ImpactPoint, ImpactResult } from './impact'
import type { ChangeDetail, ClosedChunk, Recording, Segment, SimEvent, SimStats, SimulationRun, StopReason } from './simulation'
import { frameImpactLoss, frameSegment, frameState } from './simulation'
import type { EventType } from './events'
import type { EncodedMode } from './codec'
import { decodeMode, encodeMode, featureIndex } from './codec'
import { StreamRecording } from './stream'

export type { EncodedMode, EncodedUnit } from './codec'
export { decodeMode, encodeMode } from './codec'

/** Segment as plain data. */
export interface EncodedSegment { index: number; t0: number; t1: number; mode: EncodedMode; X0: Float64Array; label: string; impactLoss: number; reduced?: boolean }
/** ImpactPoint with pair and feature indices (−1: none). */
export type EncodedImpactPoint = Omit<ImpactPoint, 'pair' | 'feature'> & { pair: number; feature: number }
/** ImpactResult as plain data. */
export interface EncodedImpact { X: Float64Array; points: EncodedImpactPoint[]; energyBefore: number; energyAfter: number; loss: number; warning?: Message }
/** SimEvent as plain data. */
export interface EncodedEvent { index: number; t: number; triggers: EventType[]; changes: ChangeDetail[]; before: Float64Array; after: Float64Array; impact: EncodedImpact | null; segment: number }

/** A closed chunk as posted (see ClosedChunk). */
export interface ChunkInfo {
  chunk: number
  first: number
  frames: number
  eventsFrom: number
  eventsTo: number
  digest: Uint8Array
  rolling: Uint8Array
  summary: Float64Array
  t: number
}

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
  warnings: Message[]
  stats: SimStats
  /** Simulated time the delta reaches (s). */
  t: number
  /** Simulated duration (s); +∞ for an unbounded run. */
  T: number
  /** Start of the Moreau–Jean fallback (reduced accuracy), null while event-driven. */
  reducedFrom: number | null
  /** Checkpoints taken since the previous delta. */
  checkpoints?: Array<{ chunk: number; data: Float64Array }>
  /** Chunks closed by this delta (their frames are complete with it). */
  chunks?: ChunkInfo[]
}

/** End of a run. */
export interface RecordingEnd { completed: boolean; error: Message | null; hash: string; stopReason?: StopReason }

/** A whole recording as plain data. */
export interface EncodedRecording { delta: RecordingDelta; end: RecordingEnd; chunkFrames?: number; duration?: number | null }

function encodeSegment(sys: System, s: Segment, t1Max = Infinity): EncodedSegment {
  const out: EncodedSegment = { index: s.index, t0: s.t0, t1: Math.min(s.t1, t1Max), mode: encodeMode(sys, s.mode), X0: Float64Array.from(s.X0), label: s.label, impactLoss: s.impactLoss }
  if (s.reduced) out.reduced = true
  return out
}

/** Segment from plain data. */
export function decodeSegment(sys: System, s: EncodedSegment): Segment {
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

/** Event from plain data. */
export function decodeEvent(sys: System, e: EncodedEvent): SimEvent {
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
  for (const c of d.checkpoints ?? []) out.add(c.data.buffer as ArrayBuffer)
  for (const c of d.chunks ?? []) { out.add(c.summary.buffer as ArrayBuffer); out.add(c.digest.buffer as ArrayBuffer); out.add(c.rolling.buffer as ArrayBuffer) }
  return [...out]
}

/** Encode a finished (or partial) recording as one delta from frame 0 (no checkpoints: not evictable). */
export function encodeRecording(rec: Recording): EncodedRecording {
  const sys = rec.system, n = rec.frameCount, size = rec.size
  const states = new Float64Array(n * size), seg = new Int32Array(n), loss = new Float64Array(n)
  for (let k = 0; k < n; k++) { states.set(frameState(rec, k), k * size); seg[k] = frameSegment(rec, k); loss[k] = frameImpactLoss(rec, k) }
  const delta: RecordingDelta = {
    fromFrame: 0, frameCount: n, states, frameSegment: seg, impactLoss: loss,
    segmentsFrom: 0, segments: rec.segments.map(s => encodeSegment(sys, s)),
    eventsFrom: 0, events: rec.events.map(e => encodeEvent(sys, e)),
    warnings: rec.warnings.slice(), stats: { ...rec.stats },
    t: rec.segments.length ? rec.segments[rec.segments.length - 1].t1 : 0, T: (n - 1) * rec.dt,
    reducedFrom: rec.reducedFrom ?? null
  }
  return { delta, end: { completed: rec.completed, error: rec.error, hash: rec.hash, stopReason: rec.stopReason }, duration: rec.unbounded ? null : (n - 1) * rec.dt }
}

/** Decode a recording on a thread that has the same scene (the system is recompiled when not given). */
export function decodeRecording(scene: Scene, enc: EncodedRecording, system?: System): Recording {
  const stream = new StreamRecording({ scene, system, chunkFrames: enc.chunkFrames, duration: enc.duration === undefined ? (enc.delta.frameCount - 1) * scene.settings.outputStep : enc.duration })
  stream.apply(enc.delta)
  return stream.final(enc.end)
}

/**
 * Collects the deltas of a run (worker side). `next(tail)` returns one delta per chunk closed since the previous
 * call, then — when `tail` is set or the run has ended — one more with everything else computed so far. With
 * `release`, the chunks whose arrays went into a delta are dropped from the run (they are transferred).
 */
export class DeltaWriter {
  private frames = 0
  private segments = 0
  private events = 0
  private checkpoints = 0
  private closed = 0
  constructor(private readonly run: SimulationRun, private readonly release = false) {}

  next(tail = false): RecordingDelta[] {
    const run = this.run
    const out: RecordingDelta[] = []
    while (this.closed < run.closed.length) out.push(this.chunkDelta(run.closed[this.closed++]))
    if (tail || run.finished) {
      const d = this.restDelta()
      if (d) out.push(d)
    }
    // What has been posted need not stay in the worker (the last segment is sent again while it grows)
    if (this.release && !run.finished) run.forget(this.segments - 1, this.events)
    return out
  }

  private common(framesTo: number, segmentsTo: number, eventsTo: number, cpTo: number, tEnd: number) {
    const run = this.run, sys = run.system
    segmentsTo = Math.max(segmentsTo, this.segments)
    eventsTo = Math.max(eventsTo, this.events)
    const segFrom = Math.max(0, this.segments - 1)
    const segs = run.segmentsFrom(segFrom).slice(0, segmentsTo - segFrom).map(s => encodeSegment(sys, s, tEnd))
    const events = run.eventsFrom(this.events).slice(0, eventsTo - this.events).map(e => encodeEvent(sys, e))
    const checkpoints: Array<{ chunk: number; data: Float64Array }> = []
    for (; this.checkpoints < cpTo; this.checkpoints++) {
      const data = run.checkpoints[this.checkpoints]
      if (!data) continue
      // Posted (and transferred) by a worker: it keeps no copy
      checkpoints.push({ chunk: this.checkpoints, data: this.release ? data : Float64Array.from(data) })
      if (this.release) run.checkpoints[this.checkpoints] = undefined
    }
    const base = { segmentsFrom: segFrom, segments: segs, eventsFrom: this.events, events, checkpoints, warnings: run.warnings.slice(), stats: { ...run.stats }, t: tEnd, T: run.T, reducedFrom: run.reducedFrom }
    this.segments = segmentsTo
    this.events = eventsTo
    this.frames = Math.max(this.frames, framesTo)
    return base
  }

  /** The delta of one closed chunk (its frames, possibly without those already sent in a tail delta). */
  private chunkDelta(c: ClosedChunk): RecordingDelta {
    const run = this.run, size = run.size
    const chunk = run.frames.chunks[c.chunk]
    if (!chunk) throw new Error(`transport: chunk ${c.chunk} is gone`)
    const from = this.frames, to = c.first + c.frames
    const whole = from === c.first && chunk.count * size === chunk.states.length
    const j0 = from - c.first, j1 = to - c.first
    const states = whole ? chunk.states : chunk.states.slice(j0 * size, j1 * size)
    const seg = whole ? chunk.segment : chunk.segment.slice(j0, j1)
    const loss = whole ? chunk.impactLoss : chunk.impactLoss.slice(j0, j1)
    // A chunk closed at a checkpoint ends at the next chunk start (whose checkpoint goes with it); the final one at
    // the end of the run
    const final = run.finished && c === run.closed[run.closed.length - 1]
    const tEnd = final ? run.t : (c.first + c.frames) * run.dt
    const base = this.common(to, c.segmentsTo, c.eventsTo, c.chunk + 2, Math.min(run.T, tEnd))
    const info: ChunkInfo = { chunk: c.chunk, first: c.first, frames: c.frames, eventsFrom: c.eventsFrom, eventsTo: c.eventsTo, digest: c.digest.slice(), rolling: c.rolling.slice(), summary: c.summary.slice(), t: c.t }
    if (this.release) run.releaseChunk(c.chunk)
    return { fromFrame: from, frameCount: to, states, frameSegment: seg, impactLoss: loss, ...base, chunks: [info] }
  }

  /** Everything not yet sent (frames of the open chunk, segments, events, checkpoints); null when nothing is new. */
  private restDelta(): RecordingDelta | null {
    const run = this.run, size = run.size
    const to = run.frameCount
    if (to <= this.frames && run.segmentCount <= this.segments && run.eventCount <= this.events && !run.finished) return null
    const from = Math.min(this.frames, to)
    const states = new Float64Array((to - from) * size), seg = new Int32Array(to - from), loss = new Float64Array(to - from)
    for (let k = from; k < to; k++) { states.set(run.frames.state(k), (k - from) * size); seg[k - from] = run.frames.segment(k); loss[k - from] = run.frames.impactLoss(k) }
    const base = this.common(to, run.segmentCount, run.eventCount, run.checkpoints.length, Math.min(run.T, run.t))
    return { fromFrame: from, frameCount: to, states, frameSegment: seg, impactLoss: loss, ...base, chunks: [] }
  }
}
