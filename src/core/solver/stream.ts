/**
 * StreamRecording: the receiving side of a streaming run (decision D26). It assembles the deltas of a run
 * (transport.ts) into a recording that grows chunk by chunk, keeps every checkpoint, chunk summary, segment and
 * event, and holds frame chunks in memory under a budget: when the budget is exceeded the least recently used
 * closed chunk is dropped; reading one of its frames later recomputes the chunk from its checkpoint on this
 * thread with the TypeScript engine (`rebuildChunk`), synchronously. The recomputed chunk is checked against the
 * chunk's digest, its events and the next checkpoint, so a mismatch can never go unnoticed.
 *
 * Frame access is synchronous: frameState(rec, k) on a snapshot whose `frames` is this store.
 */
import type { Message } from '../../i18n/message'
import type { Scene } from '../scene/types'
import type { System } from './dynamics'
import { buildSystem } from './dynamics'
import { compileModel } from './model'
import type { FrameChunk, FrameStore } from '../record/frames'
import { chunkBytes, framesPerChunk, newChunk } from '../record/frames'
import { CHAIN_START, chainDigest, chunkDigest, digestHex, hashEvents, sameDigest } from '../record/fingerprint'
import { Sha256 } from '../record/sha256'
import type { Recording, RollingFingerprint, Segment, SimEvent, SimOptions, SimStats, StopReason } from './simulation'
import { rebuildChunk } from './simulation'
import { checkpointImpactLoss, checkpointSegment, checkpointState } from './checkpoint'
import type { ChunkInfo, RecordingDelta, RecordingEnd } from './transport'
import { decodeEvent, decodeSegment } from './transport'

/** Default memory budget of a recording's frames (bytes). */
export const DEFAULT_MEMORY_BUDGET = 512 * 1024 * 1024

/** How a StreamRecording is set up (from the worker's 'started' message). */
export interface StreamInit {
  scene: Scene
  /** Compiled system of the same scene (compiled here when absent). */
  system?: System
  /** Frames per chunk of the run (default: 1 s of frames). */
  chunkFrames?: number
  /** Effective duration of the run: null for unbounded (needed to recompute chunks the same way). */
  duration: number | null
  /** Run options that influence results (fallback, maxEventsPerInstant). */
  sim?: Pick<SimOptions, 'fallback' | 'maxEventsPerInstant'>
  /** Memory budget of the frames (bytes; default 512 MiB). */
  budgetBytes?: number
}

interface Slot {
  index: number
  first: number
  /** Frames received for the chunk. */
  count: number
  /** Resident frames, or null when evicted. */
  data: FrameChunk | null
  checkpoint: Float64Array | null
  /** Set when the chunk is closed (its frames are final). */
  info: ChunkInfo | null
  lastUse: number
}

/** Memory and work counters of a stream (for the solver-information panel). */
export interface StreamStats {
  /** Bytes held: resident frames, checkpoints, summaries, segments and events (estimate). */
  memoryBytes: number
  /** Bytes of resident frames. */
  residentBytes: number
  chunks: number
  residentChunks: number
  checkpoints: number
  evictions: number
  rebuilds: number
  /** Wall-clock time spent recomputing chunks (ms). */
  rebuildMs: number
}

/** A growing recording assembled from deltas, with evictable frame chunks (see the module header). */
export class StreamRecording implements FrameStore {
  readonly scene: Scene
  readonly system: System
  readonly size: number
  readonly dt: number
  readonly chunkFrames: number
  readonly duration: number | null
  budgetBytes: number
  frameCount = 0
  segments: Segment[] = []
  events: SimEvent[] = []
  warnings: Message[] = []
  stats: SimStats = { steps: 0, rejected: 0, events: 0, locateIterations: 0, maxPositionCorrection: 0, maxVelocityCorrection: 0, ambiguousModes: 0, wallMs: 0 }
  reducedFrom: number | null = null
  /** Simulated time reached (s). */
  t = 0
  /** Simulated duration (s); +∞ when unbounded. */
  T = 0
  /** Set once the run has ended. */
  end: RecordingEnd | null = null
  evictions = 0
  rebuilds = 0
  rebuildMs = 0
  private readonly sim: Pick<SimOptions, 'fallback' | 'maxEventsPerInstant'>
  private readonly slots: Slot[] = []
  private tick = 0
  private residentBytes = 0
  private fixedBytes = 0
  private recordBytes = 0
  private rolling: Uint8Array = CHAIN_START
  private lastInfo: ChunkInfo | null = null
  /** Streamed recordingHash of a bounded run: states of the frames before `hashed`. */
  private readonly hasher: Sha256 | null
  private hashed = 0
  private final_: Recording | null = null

  constructor(init: StreamInit) {
    this.scene = init.scene
    this.system = init.system ?? buildSystem(compileModel(init.scene))
    this.size = this.system.size
    this.dt = init.scene.settings.outputStep
    this.chunkFrames = init.chunkFrames ?? framesPerChunk(this.dt)
    this.duration = init.duration
    this.sim = init.sim ?? {}
    this.budgetBytes = init.budgetBytes ?? DEFAULT_MEMORY_BUDGET
    this.hasher = init.duration !== null ? new Sha256() : null
  }

  // ---- Receiving ----

  /** Apply a delta; it may overlap frames already received but must not skip any. */
  apply(d: RecordingDelta) {
    const sys = this.system
    if (d.fromFrame > this.frameCount) throw new Error('transport: missing frames')
    this.writeFrames(d)
    this.frameCount = Math.max(this.frameCount, d.frameCount)
    const segs = this.segments.slice(0, d.segmentsFrom)
    for (const s of d.segments) segs.push(decodeSegment(sys, s))
    this.segments = segs
    const evs = this.events.slice(0, d.eventsFrom)
    for (const e of d.events) { evs.push(decodeEvent(sys, e)); this.recordBytes += (e.before.length + e.after.length + (e.impact ? e.impact.X.length : 0)) * 8 + 256 }
    this.recordBytes += d.segments.length * (this.size * 8 + 160)
    this.events = evs
    this.warnings = d.warnings.slice()
    this.stats = { ...d.stats }
    this.t = d.t
    this.T = d.T
    this.reducedFrom = d.reducedFrom
    for (const cp of d.checkpoints ?? []) {
      const slot = this.slot(cp.chunk)
      if (!slot.checkpoint) this.fixedBytes += cp.data.byteLength
      slot.checkpoint = cp.data
    }
    for (const info of d.chunks ?? []) this.close(info)
    this.evict()
  }

  /** The finished recording; the fingerprint is recomputed from the data and must equal the sender's. */
  final(end: RecordingEnd): Recording {
    if (this.final_) return this.final_
    this.end = end
    let hash: string
    if (this.hasher) {
      // Frames not covered by closed chunks (a recording posted in one piece)
      for (let k = this.hashed; k < this.frameCount; k++) this.hasher.updateFloat64(this.state(k))
      this.hashed = this.frameCount
      hashEvents(this.hasher, this.events)
      hash = this.hasher.digestHex()
    } else hash = digestHex(this.rolling)
    if (end.hash && hash !== end.hash) throw new Error('transport: recording fingerprint mismatch')
    const rec = this.makeRecording(this.segments, this.events, this.warnings, this.stats)
    rec.completed = end.completed
    rec.error = end.error
    rec.hash = hash
    rec.stopReason = end.stopReason ?? 'duration'
    this.final_ = rec
    return rec
  }

  /** A consistent prefix of the recording that shares this store (frames, chunks). */
  snapshot(): Recording {
    if (this.final_) return this.final_
    return this.makeRecording(this.segments.slice(), this.events.slice(), this.warnings.slice(), { ...this.stats })
  }

  private makeRecording(segments: Segment[], events: SimEvent[], warnings: Message[], stats: SimStats): Recording {
    const rec: Recording = {
      scene: this.scene, system: this.system, dt: this.dt, frameCount: this.frameCount, size: this.size, frames: this,
      segments, events, warnings, stats, completed: false, error: null, hash: '', unbounded: this.duration === null, rolling: this.rollingFingerprint()
    }
    if (this.reducedFrom !== null) rec.reducedFrom = this.reducedFrom
    return rec
  }

  /** Rolling fingerprint up to the last closed chunk. */
  rollingFingerprint(): RollingFingerprint | null {
    const i = this.lastInfo
    return i ? { hash: digestHex(this.rolling), t: i.t, chunks: i.chunk + 1 } : null
  }

  private slot(c: number): Slot {
    let s = this.slots[c]
    if (!s) {
      for (let i = this.slots.length; i <= c; i++) this.slots[i] ??= { index: i, first: i * this.chunkFrames, count: 0, data: null, checkpoint: null, info: null, lastUse: 0 }
      s = this.slots[c]
    }
    return s
  }

  private writeFrames(d: RecordingDelta) {
    const F = this.chunkFrames, size = this.size
    let k = d.fromFrame
    const end = d.fromFrame + d.frameSegment.length
    while (k < end) {
      const c = Math.floor(k / F)
      const slot = this.slot(c)
      const j0 = k - slot.first
      const take = Math.min(end - k, F - j0)
      const o = k - d.fromFrame
      if (j0 === 0 && take === d.frameSegment.length && (take === F || this.endsBounded(c, take)) && !slot.data) {
        // A whole chunk in one piece: keep the posted arrays as they are
        slot.data = { index: c, first: slot.first, count: take, states: d.states, segment: d.frameSegment, impactLoss: d.impactLoss }
        this.residentBytes += chunkBytes(slot.data)
      } else {
        if (!slot.data) {
          slot.data = newChunk(c, slot.first, F, size)
          this.residentBytes += chunkBytes(slot.data)
        }
        slot.data.states.set(d.states.subarray(o * size, (o + take) * size), j0 * size)
        slot.data.segment.set(d.frameSegment.subarray(o, o + take), j0)
        slot.data.impactLoss.set(d.impactLoss.subarray(o, o + take), j0)
        slot.data.count = Math.max(slot.data.count, j0 + take)
      }
      slot.count = Math.max(slot.count, j0 + take)
      slot.lastUse = ++this.tick
      k += take
    }
  }

  /** In a bounded run, does chunk c end after `frames` frames (the last, shorter chunk)? */
  private endsBounded(c: number, frames: number): boolean {
    if (this.duration === null) return false
    const K = Math.max(0, Math.round(this.duration / this.dt))
    return c * this.chunkFrames + frames === K + 1
  }

  /** A chunk is closed: verify its digest against the received frames and events, extend the chain. */
  private close(info: ChunkInfo) {
    const slot = this.slot(info.chunk)
    if (!slot.data || slot.data.count < info.frames) throw new Error(`transport: chunk ${info.chunk} is incomplete`)
    const states = slot.data.states.subarray(0, info.frames * this.size)
    const digest = chunkDigest(states, this.events, info.eventsFrom, info.eventsTo)
    if (!sameDigest(digest, info.digest)) throw new Error(`transport: chunk ${info.chunk} fingerprint mismatch`)
    this.rolling = chainDigest(this.rolling, digest)
    if (!sameDigest(this.rolling, info.rolling)) throw new Error(`transport: rolling fingerprint mismatch at chunk ${info.chunk}`)
    if (this.hasher && this.hashed === info.first) { this.hasher.updateFloat64(states); this.hashed = info.first + info.frames }
    slot.info = info
    this.fixedBytes += info.summary.byteLength + 64
    this.lastInfo = info
  }

  // ---- Frames ----

  private resident(k: number): FrameChunk | null {
    const slot = this.slots[Math.floor(k / this.chunkFrames)]
    if (!slot) throw new Error(`frame ${k} has not been received`)
    if (slot.data && k - slot.first < slot.data.count) { slot.lastUse = ++this.tick; return slot.data }
    return null
  }

  private chunkFor(k: number): FrameChunk {
    const data = this.resident(k)
    if (data) return data
    if (k >= this.frameCount) throw new Error(`frame ${k} has not been received`)
    return this.rebuild(this.slots[Math.floor(k / this.chunkFrames)])
  }

  /** The checkpoint of frame k when k starts a chunk (its state is the checkpoint's X). */
  private startCheckpoint(k: number): Float64Array | null {
    const slot = this.slots[Math.floor(k / this.chunkFrames)]
    return slot && slot.first === k ? slot.checkpoint : null
  }

  state(k: number): Float64Array {
    const r = this.resident(k)
    if (r) { const j = k - r.first; return r.states.subarray(j * this.size, (j + 1) * this.size) }
    const cp = this.startCheckpoint(k)
    if (cp) return checkpointState(cp)
    const c = this.chunkFor(k)
    const j = k - c.first
    return c.states.subarray(j * this.size, (j + 1) * this.size)
  }

  segment(k: number): number {
    const r = this.resident(k)
    if (r) return r.segment[k - r.first]
    const cp = this.startCheckpoint(k)
    if (cp) return checkpointSegment(cp)
    const c = this.chunkFor(k)
    return c.segment[k - c.first]
  }

  impactLoss(k: number): number {
    const r = this.resident(k)
    if (r) return r.impactLoss[k - r.first]
    const cp = this.startCheckpoint(k)
    if (cp) return checkpointImpactLoss(cp)
    const c = this.chunkFor(k)
    return c.impactLoss[k - c.first]
  }

  cheap(k: number): boolean {
    const slot = this.slots[Math.floor(k / this.chunkFrames)]
    if (!slot) return false
    return (!!slot.data && k - slot.first < slot.data.count) || (slot.first === k && !!slot.checkpoint)
  }

  /** Is chunk c in memory? */
  isResident(c: number): boolean { return !!this.slots[c]?.data }

  /** Checkpoint of chunk c (null before it arrives). */
  checkpoint(c: number): Float64Array | null { return this.slots[c]?.checkpoint ?? null }

  /** Summary of closed chunk c: min, max, first, last of every state component (4·size values), or null. */
  summary(c: number): Float64Array | null { return this.slots[c]?.info?.summary ?? null }

  /** Number of chunks received (closed or open). */
  get chunkCount(): number { return this.slots.length }

  /** Number of closed chunks. */
  get closedChunks(): number { return this.lastInfo ? this.lastInfo.chunk + 1 : 0 }

  /** Recompute an evicted chunk from its checkpoint and verify it (see the module header). */
  private rebuild(slot: Slot): FrameChunk {
    const info = slot.info, cp = slot.checkpoint
    if (!info || !cp) throw new Error(`chunk ${slot.index} is not in memory and cannot be recomputed`)
    const t0 = performance.now()
    const next = this.slots[slot.index + 1]?.checkpoint ?? null
    // A complete chunk runs on to the next chunk start (to compare the next checkpoint); the last one to its last frame
    const endFrame = next ? slot.first + this.chunkFrames : slot.first + info.frames - 1
    const r = rebuildChunk(this.scene, this.system, cp, { ...this.sim, duration: this.duration, chunkSeconds: this.chunkFrames * this.dt }, endFrame)
    const chunk = r.chunk
    if (chunk.count < info.frames) throw new Error(`rebuild: chunk ${slot.index} ended early`)
    const states = chunk.states.subarray(0, info.frames * this.size)
    if (!sameDigest(chunkDigest(states, this.events, info.eventsFrom, info.eventsTo), info.digest)) throw new Error(`rebuild: chunk ${slot.index} differs from the original run`)
    for (const e of r.events) {
      const o = this.events[e.index]
      if (e.index >= info.eventsTo) break
      if (!o || o.t !== e.t || !sameArray(o.after, e.after)) throw new Error(`rebuild: event ${e.index} differs from the original run`)
    }
    if (r.again && !sameArray(r.again, cp)) throw new Error(`rebuild: checkpoint ${slot.index} does not restore exactly`)
    if (next && r.next && !sameArray(r.next, next)) throw new Error(`rebuild: checkpoint ${slot.index + 1} differs from the original run`)
    chunk.count = info.frames
    slot.data = chunk
    slot.lastUse = ++this.tick
    this.residentBytes += chunkBytes(chunk)
    this.rebuilds++
    this.rebuildMs += performance.now() - t0
    this.evict(slot)
    return chunk
  }

  // ---- Memory ----

  /** Change the memory budget (bytes) and evict down to it. */
  setBudget(bytes: number) {
    this.budgetBytes = bytes
    this.evict()
  }

  /** Drop the frames of closed chunk c (tests; normally done by the budget). Returns false when it cannot be dropped. */
  evictChunk(c: number): boolean {
    const s = this.slots[c]
    if (!s || !s.data || !s.info || !s.checkpoint) return false
    this.residentBytes -= chunkBytes(s.data)
    s.data = null
    this.evictions++
    return true
  }

  /** Evict least recently used closed chunks until the budget holds (never `keep`). */
  private evict(keep?: Slot) {
    while (this.residentBytes + this.fixedBytes + this.recordBytes > this.budgetBytes) {
      let victim: Slot | null = null
      for (const s of this.slots) {
        if (!s || !s.data || !s.info || !s.checkpoint || s === keep) continue
        if (!victim || s.lastUse < victim.lastUse) victim = s
      }
      if (!victim) return
      this.evictChunk(victim.index)
    }
  }

  /** Memory and work counters. */
  memory(): StreamStats {
    let resident = 0, checkpoints = 0
    for (const s of this.slots) { if (s?.data) resident++; if (s?.checkpoint) checkpoints++ }
    return {
      memoryBytes: this.residentBytes + this.fixedBytes + this.recordBytes, residentBytes: this.residentBytes,
      chunks: this.slots.length, residentChunks: resident, checkpoints, evictions: this.evictions, rebuilds: this.rebuilds, rebuildMs: this.rebuildMs
    }
  }

  /** Why the run ended, when it has. */
  get stopReason(): StopReason | undefined { return this.end?.stopReason }
}

function sameArray(a: Float64Array, b: Float64Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false
  return true
}
