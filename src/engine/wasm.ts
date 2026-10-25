/**
 * Loader and wrapper of the Rust core compiled to WebAssembly (manual 26.50, D29). The module has no imports
 * and a raw C ABI (engine/ABI.md): JavaScript allocates input buffers in linear memory, passes pointer and
 * length, and copies results out. Results are containers ("VRD1": a JSON document followed by an 8-byte aligned
 * blob of typed arrays) that decode to the same plain data as the TypeScript transport (core/solver/transport.ts),
 * so the rest of the application cannot tell the engines apart — their recordings are bit-identical (D30).
 */
import type { Scene } from '../core/scene/types'
import { SCENE_VERSION } from '../core/scene/types'
import type { RecordingDelta, RecordingEnd } from '../core/solver/transport'
import type { Message } from '../i18n/message'
import { isMessage, reviveMessage } from '../i18n/message'

/** ABI version this loader speaks. */
export const ABI_VERSION = 1

interface Exports {
  memory: WebAssembly.Memory
  abi_version(): number
  /** Newest scene format the engine reads (absent before 26.51). */
  scene_version?: () => number
  alloc(len: number): number
  dealloc(ptr: number, len: number): void
  last_error(ptr: number, len: number): number
  run_create(ptr: number, len: number): number
  run_info(h: number, ptr: number, len: number): number
  run_set_until(h: number, frame: number): void
  run_advance(h: number, budgetSteps: number): number
  run_time(h: number): number
  run_frame_count(h: number): number
  run_request_tail(h: number): void
  run_take_delta(h: number, ptr: number, len: number): number
  run_end(h: number, ptr: number, len: number): number
  run_stop(h: number): void
  run_cancel(h: number): void
  run_fail_budget(h: number, budgetMs: number): void
  run_rebuild_chunk(h: number, cpPtr: number, cpLen: number, endFrame: number): number
  run_take_output(h: number, ptr: number, len: number): number
  run_free(h: number): void
}

/** Status of `advance`. */
export type AdvanceStatus = 'budget' | 'paused' | 'finished'

/** What a run reports when created (the worker's 'started' message). */
export interface WasmRunInfo {
  /** Output intervals of the whole run; +∞ when unbounded. */
  K: number
  size: number
  chunkFrames: number
  /** Effective duration (s), null when unbounded. */
  duration: number | null
  dt: number
  loadWarnings: Message[]
}

/** An error of the engine, carrying its message. */
export class WasmEngineError extends Error {
  readonly msg: Message
  constructor(m: Message) {
    super(m.key)
    this.msg = m
  }
}

/** Scene JSON that keeps −0 (written as the string "-0", which the Rust scene parser reads as −0). */
export function sceneJson(scene: Scene, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ scene, ...extra }, (_k, v) => (Object.is(v, -0) ? '-0' : v))
}

/** Decode a "VRD1" container: JSON with `{$f64|$i32|$u8: [offset, length]}` references into the blob. */
export function parseContainer(bytes: Uint8Array): unknown {
  if (bytes.length < 8 || bytes[0] !== 0x56 || bytes[1] !== 0x52 || bytes[2] !== 0x44 || bytes[3] !== 0x31) throw new Error('engine: not a result container')
  const n = bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24)
  const doc = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + n)))
  const blobStart = Math.ceil((8 + n) / 8) * 8
  const base = bytes.byteOffset + blobStart
  const buf = bytes.buffer
  const revive = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(revive)
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      const ref = (o.$f64 ?? o.$i32 ?? o.$u8) as [number, number] | undefined
      if (o.$f64) return new Float64Array(buf.slice(base + ref![0], base + ref![0] + 8 * ref![1]))
      if (o.$i32) return new Int32Array(buf.slice(base + ref![0], base + ref![0] + 4 * ref![1]))
      if (o.$u8) return new Uint8Array(buf.slice(base + ref![0], base + ref![0] + ref![1]))
      if ('$num' in o) return Number(o.$num)
      if (isMessage(o)) return reviveMessage(o)
      const out: Record<string, unknown> = {}
      for (const [k, x] of Object.entries(o)) out[k] = revive(x)
      return out
    }
    return v
  }
  return revive(doc)
}

/** The instantiated engine module. */
export class WasmEngine {
  private readonly x: Exports
  /** Scratch output buffer in linear memory (grown on demand). */
  private outPtr = 0
  private outLen = 0

  constructor(instance: WebAssembly.Instance) {
    this.x = instance.exports as unknown as Exports
    const v = this.x.abi_version()
    if (v !== ABI_VERSION) throw new Error(`engine: ABI version ${v}, expected ${ABI_VERSION}`)
    // 26.51: an engine built before scene format 4 would ignore drag, gravitation and the new connectors
    const sv = typeof this.x.scene_version === 'function' ? this.x.scene_version() : 3
    if (sv < SCENE_VERSION) throw new Error(`engine: scene format ${sv}, expected ${SCENE_VERSION}`)
  }

  /** Bytes of linear memory (diagnostics). */
  get memoryBytes(): number { return this.x.memory.buffer.byteLength }

  /** Copy bytes into linear memory; the caller frees them with `dealloc`. */
  private copyIn(bytes: Uint8Array): number {
    const p = this.x.alloc(bytes.length)
    new Uint8Array(this.x.memory.buffer, p, bytes.length).set(bytes)
    return p
  }

  /** Call a byte-returning export (n > 0 bytes, −n buffer too small, 0 nothing) and copy the result out. */
  private take(fn: (ptr: number, len: number) => number): Uint8Array | null {
    for (;;) {
      if (this.outLen === 0) { this.outLen = 1 << 16; this.outPtr = this.x.alloc(this.outLen) }
      const r = fn(this.outPtr, this.outLen)
      if (r === 0) return null
      if (r > 0) return new Uint8Array(this.x.memory.buffer, this.outPtr, r).slice()
      this.x.dealloc(this.outPtr, this.outLen)
      this.outLen = Math.max(-r, 2 * this.outLen)
      this.outPtr = this.x.alloc(this.outLen)
    }
  }

  private lastError(): Message {
    const b = this.take((p, l) => this.x.last_error(p, l))
    return b ? reviveMessage(JSON.parse(new TextDecoder().decode(b))) : { key: 'err.internal', params: { message: 'engine error' } }
  }

  /** Create a run (`duration` overrides the scene's: null = unbounded). Throws WasmEngineError. */
  create(scene: Scene, duration?: number | null): WasmRun {
    const extra: Record<string, unknown> = {}
    if (duration !== undefined) extra.duration = duration
    const bytes = new TextEncoder().encode(sceneJson(scene, extra))
    const p = this.copyIn(bytes)
    const h = this.x.run_create(p, bytes.length)
    this.x.dealloc(p, bytes.length)
    if (h === 0) throw new WasmEngineError(this.lastError())
    return new WasmRun(this, this.x, h)
  }

  /** @internal */
  takeFrom(fn: (ptr: number, len: number) => number): Uint8Array | null { return this.take(fn) }
  /** @internal */
  copyInBytes(b: Uint8Array): number { return this.copyIn(b) }
  /** @internal */
  error(): Message { return this.lastError() }
}

/** One run of the WASM engine (free it with `free`). */
export class WasmRun {
  private freed = false
  constructor(private readonly engine: WasmEngine, private readonly x: Exports, readonly handle: number) {}

  info(): WasmRunInfo {
    const b = this.engine.takeFrom((p, l) => this.x.run_info(this.handle, p, l))
    if (!b) throw new Error('engine: no run info')
    const o = JSON.parse(new TextDecoder().decode(b)) as { K: number | null; size: number; chunkFrames: number; duration: number | null; dt: number; loadWarnings: unknown[] }
    return { K: o.K ?? Infinity, size: o.size, chunkFrames: o.chunkFrames, duration: o.duration, dt: o.dt, loadWarnings: (o.loadWarnings ?? []).map(reviveMessage) }
  }

  /** Pause at the top of the loop once frame `frame` is recorded (+∞: no pause). */
  setUntil(frame: number) { this.x.run_set_until(this.handle, frame) }

  /** Run at most `budgetSteps` loop iterations. */
  advance(budgetSteps: number): AdvanceStatus {
    const r = this.x.run_advance(this.handle, budgetSteps)
    if (r < 0) throw new Error('engine: unknown run handle')
    return r === 0 ? 'budget' : r === 1 ? 'paused' : 'finished'
  }

  get t(): number { return this.x.run_time(this.handle) }
  get frameCount(): number { return this.x.run_frame_count(this.handle) }

  /** All deltas available now (one per closed chunk; with `tail`, also the frames of the open chunk). */
  takeDeltas(tail: boolean): RecordingDelta[] {
    if (tail) this.x.run_request_tail(this.handle)
    const out: RecordingDelta[] = []
    for (;;) {
      const b = this.engine.takeFrom((p, l) => this.x.run_take_delta(this.handle, p, l))
      if (!b) break
      out.push(parseContainer(b) as RecordingDelta)
    }
    return out
  }

  /** End state of a finished run, or null while it runs. */
  end(): RecordingEnd | null {
    const b = this.engine.takeFrom((p, l) => this.x.run_end(this.handle, p, l))
    if (!b) return null
    const o = JSON.parse(new TextDecoder().decode(b)) as RecordingEnd & { error: unknown }
    return { ...o, error: o.error ? reviveMessage(o.error) : null }
  }

  stop() { this.x.run_stop(this.handle) }
  cancel() { this.x.run_cancel(this.handle) }
  /** End a bounded run because the wall-clock budget is used up (error err.budget). */
  failBudget(budgetMs: number) { this.x.run_fail_budget(this.handle, budgetMs) }

  /**
   * Recompute a chunk from a checkpoint up to the loop top at `endFrame` (decoded container: chunk frames,
   * events, next checkpoint …; see engine/ABI.md).
   */
  rebuildChunk(checkpoint: Float64Array, endFrame: number): unknown {
    const bytes = new Uint8Array(checkpoint.buffer, checkpoint.byteOffset, checkpoint.byteLength)
    const p = this.engine.copyInBytes(bytes)
    const n = this.x.run_rebuild_chunk(this.handle, p, bytes.length, endFrame)
    this.x.dealloc(p, bytes.length)
    if (n === 0) throw new WasmEngineError(this.engine.error())
    const b = this.engine.takeFrom((pp, l) => this.x.run_take_output(this.handle, pp, l))
    return b ? parseContainer(b) : null
  }

  free() {
    if (this.freed) return
    this.freed = true
    this.x.run_free(this.handle)
  }
}

/** Instantiate the engine from the module bytes. */
export async function instantiateEngine(bytes: ArrayBuffer | Uint8Array): Promise<WasmEngine> {
  const { instance } = await WebAssembly.instantiate(bytes as BufferSource, {})
  return new WasmEngine(instance)
}

let loading: Promise<WasmEngine> | null = null

/**
 * Load the engine shipped with the application (fetch + instantiate, no MIME type requirement). The promise is
 * shared; a failure rejects every caller (the worker then falls back to the TypeScript engine).
 */
export function loadEngine(url: string): Promise<WasmEngine> {
  loading ??= (async () => {
    if (typeof WebAssembly !== 'object') throw new Error('WebAssembly is not available')
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return instantiateEngine(await res.arrayBuffer())
  })()
  return loading
}
