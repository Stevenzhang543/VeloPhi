/**
 * A session of the Rust core (26.53, D66): a recording assembled from the run's delta containers (or a scene
 * without a recording, for the editor), with every calculation of the interface as an operation on it
 * (engine/CALC.md). The frame data stay in the core — chunks are evicted under the memory budget and recomputed
 * there — and the interface reads what it needs: a state, a frame view, a series, a formula card.
 */
import type { Scene } from '../core/scene/types'
import { MessageError } from '../i18n/message'
import type { CoreBackend } from './core'
import { core, failCore, jsonBytes, parseContainer } from './core'
import type { System } from './model'
import { linkSystem } from './model'
import type { RecordingEnd } from './types'

/** How a session is set up: the run's 'started' information (absent for a scene session). */
export interface SessionInit {
  chunkFrames?: number
  /** Effective duration of the run (s); null when unbounded. */
  duration?: number | null
  /** Memory budget of the frames (bytes). */
  budgetBytes?: number
  maxEventsPerInstant?: number
  fallback?: { events: number; window: number } | false
}

/** Options of a synchronous simulation (`EngineSession.simulate`). */
export interface SimulateOptions {
  /** Simulated time (s); null: unbounded (then `until` is required); default: the scene's (legacy duration when unbounded). */
  duration?: number | null
  /** Stop an unbounded run at this time (s). */
  until?: number
  chunkSeconds?: number
  budgetBytes?: number
  maxEventsPerInstant?: number
  fallback?: { events: number; window: number } | false
  /** Loop iterations allowed before the run ends with err.budget (the core has no clock). */
  maxSteps?: number
}

/** Scene document as JSON (the Rust scene parser reads −0 written as "-0"). */
function sceneDoc(scene: Scene): unknown {
  return JSON.parse(JSON.stringify(scene))
}

/** Sessions that were dropped without `free()` are freed when collected. */
const finalizer = typeof FinalizationRegistry === 'function'
  ? new FinalizationRegistry<{ b: CoreBackend; h: { v: number } }>(x => { if (x.h.v) x.b.sessionFree(x.h.v) })
  : null

/** One session of the core. Free it with `free()` when it is no longer used (else when it is collected). */
export class EngineSession {
  readonly scene: Scene
  private readonly b: CoreBackend
  private h: number
  private system_: System | null = null
  private info_: { chunkFrames: number; dt: number } | null = null

  /** Handle box shared with the finalizer (0 once freed). */
  private readonly box: { v: number }

  private constructor(b: CoreBackend, h: number, scene: Scene) {
    this.b = b
    this.h = h
    this.scene = scene
    this.box = { v: h }
    finalizer?.register(this, { b, h: this.box }, this.box)
  }

  /** A session for a run of `scene` (init: the run's 'started' information), or a scene session (no init). */
  static create(scene: Scene, init: SessionInit = {}): EngineSession {
    const b = core()
    const h = b.sessionCreate(jsonBytes({ scene: sceneDoc(scene), ...init }))
    if (!h) failCore(b)
    return new EngineSession(b, h, scene)
  }

  /** Run a whole simulation into a new session, synchronously (branches, examples, self-check, tests). */
  static simulate(scene: Scene, opts: SimulateOptions = {}): EngineSession {
    const b = core()
    const h = b.sessionSimulate(jsonBytes({ scene: sceneDoc(scene), ...opts }))
    if (!h) failCore(b)
    return new EngineSession(b, h, scene)
  }

  get handle(): number { return this.h }
  get freed(): boolean { return this.h === 0 }

  private live(): number {
    if (!this.h) throw new Error('engine: session already freed')
    return this.h
  }

  /** Apply one delta container of the run. */
  apply(delta: Uint8Array) {
    if (!this.b.sessionApply(this.live(), delta)) failCore(this.b)
  }

  /** End the recording with the run's end state (the fingerprint is checked against the data). */
  finish(end: RecordingEnd) {
    if (!this.b.sessionFinish(this.live(), jsonBytes(end))) failCore(this.b)
  }

  /** Run one operation (engine/CALC.md); throws MessageError when it fails. */
  call<T = Record<string, unknown>>(req: { op: string } & Record<string, unknown>): T {
    const out = this.b.sessionCall(this.live(), jsonBytes(req))
    if (!out) {
      const m = this.b.lastError()
      throw new MessageError(m)
    }
    return parseContainer(out) as T
  }

  /** Frames recorded so far. */
  get frameCount(): number { return this.h ? this.b.sessionFrameCount(this.h) : 0 }

  /** Linked compiled system (cached). */
  get system(): System {
    if (!this.system_) {
      const r = this.call<{ model: Record<string, unknown>; chunkFrames: number; dt: number }>({ op: 'modelInfo' })
      this.system_ = linkSystem(r.model, this.scene)
      this.info_ = { chunkFrames: r.chunkFrames, dt: r.dt }
    }
    return this.system_
  }

  /** Frames per chunk of the recording. */
  get chunkFrames(): number { void this.system; return this.info_!.chunkFrames }

  /** State of frame k (a new array). */
  state(k: number, out?: Float64Array): Float64Array {
    const x = out ?? new Float64Array(this.system.size)
    if (!this.b.sessionState(this.live(), k, x)) failCore(this.b)
    return x
  }

  /** Whether frame k can be read without recomputing a chunk. */
  cheap(k: number): boolean { return this.b.sessionCheap(this.live(), k) }
  /** Segment index of frame k. */
  segment(k: number): number { return this.b.sessionSegment(this.live(), k) }
  /** Cumulative impact loss at frame k (J). */
  impactLoss(k: number): number { return this.b.sessionImpactLoss(this.live(), k) }

  /** Install a chunk recomputed elsewhere (the raw rebuild container); false when it does not verify. */
  install(chunk: number, bytes: Uint8Array): boolean { return this.b.sessionInstall(this.live(), chunk, bytes) }

  free() {
    if (!this.h) return
    this.b.sessionFree(this.h)
    this.h = 0
    this.box.v = 0
    finalizer?.unregister(this.box)
  }
}
