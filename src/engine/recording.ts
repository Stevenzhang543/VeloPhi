/**
 * Recordings as the interface sees them (26.53, D66): a Rust session (the frames, checkpoints, modes and every
 * calculation) plus the light lists the interface walks — segments, events, warnings, statistics — refreshed from
 * the session after each delta. `RecordingStore` assembles a growing recording from the run's deltas (raw bytes,
 * never decoded here); `snapshot()` gives consistent prefixes for playback while the run continues.
 *
 * Evicted chunks the interface is about to need are recomputed by the simulation host off this thread (`prefetch`)
 * and installed into the session, which verifies them; a read of an evicted frame recomputes it in the session.
 */
import type { Message } from '../i18n/message'
import type { Scene } from '../core/scene/types'
import type { EngineSession, SessionInit, SimulateOptions } from './session'
import { EngineSession as Session } from './session'
import type { System } from './model'
import type { Ledger, RecordingEnd, RollingFingerprint, Segment, SimEvent, SimStats, StopReason, StreamStats } from './types'

export type { Ledger, RecordingEnd, RollingFingerprint, Segment, SimEvent, SimStats, StopReason, StreamStats } from './types'
export type { ChangeDetail, ChangeType, EventType } from './types'

/** A recording: frames through its session, segments, events and diagnostics. */
export interface Recording {
  session: EngineSession
  scene: Scene
  system: System
  dt: number
  /** Valid frames (a prefix while the run continues). */
  frameCount: number
  /** Length of one state vector. */
  size: number
  /** Frames per chunk. */
  chunkFrames: number
  segments: Segment[]
  events: SimEvent[]
  warnings: Message[]
  stats: SimStats
  completed: boolean
  error: Message | null
  /** Final fingerprint; empty while the run continues. */
  hash: string
  reducedFrom?: number | null
  unbounded?: boolean
  stopReason?: StopReason
  rolling?: RollingFingerprint | null
  /** The store this recording is a snapshot of (prefetching evicted chunks); absent for a finished simulation. */
  store?: RecordingStore | null
}

/** Remote recomputation of a chunk: the raw rebuild container, or a rejection. */
export type RemoteRebuild = (req: { scene: Scene; duration: number | null; chunkFrames: number; checkpoint: Float64Array; endFrame: number }) => Promise<Uint8Array>

interface Info {
  frameCount: number; dt: number; size: number; chunkFrames: number; t: number; T: number; duration: number | null
  segments: number; events: number; reducedFrom: number | null; warnings: Message[]; stats: SimStats
  ended: boolean; completed: boolean | null; error: Message | null; stopReason: StopReason | null; hash: string
  rolling: RollingFingerprint | null; memory: StreamStats & { rebuilds: number }
}

/** A growing recording assembled from deltas into a session. */
export class RecordingStore {
  readonly session: EngineSession
  readonly scene: Scene
  readonly system: System
  readonly dt: number
  readonly size: number
  readonly chunkFrames: number
  readonly duration: number | null
  frameCount = 0
  segments: Segment[] = []
  events: SimEvent[] = []
  warnings: Message[] = []
  stats: SimStats = { steps: 0, rejected: 0, events: 0, locateIterations: 0, maxPositionCorrection: 0, maxVelocityCorrection: 0, ambiguousModes: 0, wallMs: 0 }
  reducedFrom: number | null = null
  /** Simulated time reached and the duration (+∞ when unbounded). */
  t = 0
  T = 0
  end: RecordingEnd | null = null
  /** Wall-clock time the host spent computing (ms), reported with the deltas. */
  wallMs = 0
  private info: Info | null = null
  private remote: RemoteRebuild | null = null
  private readonly inFlight = new Set<number>()
  private chunkListeners: Array<(c: number) => void> = []
  private final_: Recording | null = null

  constructor(scene: Scene, init: SessionInit & { chunkFrames: number; duration: number | null }, session?: EngineSession) {
    this.scene = scene
    this.session = session ?? Session.create(scene, init)
    this.system = this.session.system
    this.dt = scene.settings.outputStep
    this.size = this.system.size
    this.chunkFrames = init.chunkFrames
    this.duration = init.duration
    if (session) this.refresh()
  }

  /** Apply one delta container (raw bytes from the run). */
  apply(delta: Uint8Array) {
    this.session.apply(delta)
    this.refresh()
  }

  /** Re-read the lists that changed (segments from the last one, which may have grown; new events). */
  refresh() {
    const i = this.session.call<Info>({ op: 'info' })
    this.info = i
    this.frameCount = i.frameCount
    this.t = i.t
    this.T = i.T
    this.stats = { ...i.stats, wallMs: this.wallMs || i.stats.wallMs }
    this.warnings = i.warnings
    this.reducedFrom = i.reducedFrom
    if (i.segments !== this.segments.length || i.segments > 0) {
      const from = Math.max(0, Math.min(this.segments.length, i.segments) - 1)
      const r = this.session.call<{ segments: Segment[] }>({ op: 'segments', from })
      this.segments = this.segments.slice(0, from).concat(r.segments)
    }
    if (i.events > this.events.length) {
      const r = this.session.call<{ events: SimEvent[] }>({ op: 'events', from: this.events.length })
      this.events = this.events.concat(r.events)
    }
  }

  /** The finished recording (the session checks the fingerprint against the data). */
  final(end: RecordingEnd): Recording {
    if (this.final_) return this.final_
    this.end = end
    this.session.finish(end)
    this.refresh()
    const rec = this.make()
    rec.completed = end.completed
    rec.error = end.error
    rec.hash = this.info?.hash ?? end.hash
    rec.stopReason = end.stopReason ?? 'duration'
    this.final_ = rec
    return rec
  }

  /** A consistent prefix of the recording sharing this store. */
  snapshot(): Recording {
    return this.final_ ?? this.make()
  }

  private make(): Recording {
    const rec: Recording = {
      session: this.session, scene: this.scene, system: this.system, dt: this.dt, frameCount: this.frameCount, size: this.size, chunkFrames: this.chunkFrames,
      segments: this.segments.slice(), events: this.events.slice(), warnings: this.warnings.slice(), stats: { ...this.stats, wallMs: this.wallMs || this.stats.wallMs },
      completed: false, error: null, hash: '', unbounded: this.duration === null, rolling: this.info?.rolling ?? null, store: this
    }
    if (this.reducedFrom !== null) rec.reducedFrom = this.reducedFrom
    return rec
  }

  /** Rolling fingerprint up to the last closed chunk. */
  rollingFingerprint(): RollingFingerprint | null { return this.info?.rolling ?? null }

  /** Memory and work counters. */
  memory(): StreamStats { return this.session.call<{ memory: StreamStats }>({ op: 'info' }).memory }

  /** Change the memory budget (bytes) and evict down to it. */
  setBudget(bytes: number) { this.session.call({ op: 'setBudget', bytes }) }

  /** Recompute chunks off this thread with `remote` (null: recompute in the session when read). */
  setRemote(remote: RemoteRebuild | null) { this.remote = remote }

  /** Listen for chunks installed after a remote recomputation; returns the unsubscribe function. */
  onChunk(fn: (c: number) => void): () => void {
    this.chunkListeners.push(fn)
    return () => { this.chunkListeners = this.chunkListeners.filter(f => f !== fn) }
  }

  /**
   * Start recomputing evicted chunk c off this thread; true when it is in memory or on its way, false when reading
   * it would recompute it in the session.
   */
  prefetch(c: number): boolean {
    if (this.inFlight.has(c)) return true
    if (!this.remote) return false
    const first = c * this.chunkFrames
    if (first >= this.frameCount) return false
    const r = this.session.call<{ request: { chunk: number; checkpoint: Float64Array; endFrame: number } | null }>({ op: 'prefetch', chunk: c })
    if (!r.request) return this.session.cheap(Math.min(this.frameCount - 1, first + 1))
    this.inFlight.add(c)
    this.remote({ scene: this.scene, duration: this.duration, chunkFrames: this.chunkFrames, checkpoint: r.request.checkpoint, endFrame: r.request.endFrame })
      .then(bytes => {
        this.inFlight.delete(c)
        if (this.session.freed) return
        if (this.session.install(c, bytes)) for (const f of this.chunkListeners) f(c)
      })
      .catch(() => {
        this.inFlight.delete(c)
        if (!this.session.freed) this.session.call({ op: 'remoteFailed', chunk: c })
      })
    return true
  }
}

// ---- Reading a recording ----

/** State of frame k (a new array). */
export function frameState(rec: Recording, k: number): Float64Array { return rec.session.state(k) }
/** Segment index of frame k. */
export function frameSegment(rec: Recording, k: number): number { return rec.session.segment(k) }
/** Cumulative impact loss at frame k (J). */
export function frameImpactLoss(rec: Recording, k: number): number { return rec.session.impactLoss(k) }
/** Whether frame k can be read without recomputing a chunk. */
export function frameIsCheap(rec: Recording, k: number): boolean { return rec.session.cheap(k) }
/** Exact state at time t (one integration step from the last frame or event before t). */
export function exactStateAt(rec: Recording, t: number): Float64Array {
  return rec.session.call<{ states: Float64Array }>({ op: 'exactStates', times: [t] }).states
}
/** Energy ledger of frame k. */
export function frameLedger(rec: Recording, k: number): Ledger {
  return rec.session.call<{ ledger: Ledger[] }>({ op: 'ledger', frames: [k] }).ledger[0]
}
/** States just before and just after event `index`. */
export function eventStates(rec: Recording, index: number): { before: Float64Array; after: Float64Array } {
  return rec.session.call<{ before: Float64Array; after: Float64Array }>({ op: 'event', index })
}
/** Prefetch chunk c of a recording off this thread (no-op without a store or a remote rebuilder). */
export function prefetchChunk(rec: Recording, c: number): boolean { return rec.store?.prefetch(c) ?? false }

/** Run a scene to the end synchronously in the core and return the finished recording. */
export function simulate(scene: Scene, opts: SimulateOptions = {}): Recording {
  const session = Session.simulate(scene, opts)
  const i = session.call<Info>({ op: 'info' })
  const store = new RecordingStore(scene, { chunkFrames: i.chunkFrames, duration: i.duration }, session)
  const rec = store.snapshot()
  rec.completed = !!i.completed
  rec.error = i.error
  rec.hash = i.hash
  rec.stopReason = i.stopReason ?? 'duration'
  rec.store = null
  return rec
}
