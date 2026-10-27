/**
 * The Rust core as seen from TypeScript (26.53, D65–D67). All physics and numerics run in Rust: as WebAssembly in
 * the page (this thread, for synchronous queries) and in the simulation worker, as native code in the desktop
 * engine (src-tauri) and, for the tests in environments without a wasm32 toolchain, as a Node-API module built from
 * the same source (engine/velophi-napi). `CoreBackend` is the byte-level C ABI of engine/ABI.md; both kinds of
 * module implement it, so nothing above this file can tell them apart.
 *
 * Results are containers ("VRD1": a JSON document followed by an 8-byte aligned blob of typed arrays) decoded by
 * `parseContainer`; texts are messages `{ key, params }` revived for the interface to render.
 */
import type { Message } from '../i18n/message'
import { MessageError, isMessage, reviveMessage } from '../i18n/message'

/** ABI version this loader speaks. */
export const ABI_VERSION = 2

/** The C ABI of the core (engine/ABI.md), with bytes in and bytes out. */
export interface CoreBackend {
  readonly kind: 'wasm' | 'native'
  abiVersion(): number
  sceneVersion(): number
  /** The message of the last failed call. */
  lastError(): Message
  // Sessions (D66)
  sessionCreate(json: Uint8Array): number
  sessionSimulate(json: Uint8Array): number
  sessionApply(h: number, delta: Uint8Array): boolean
  sessionFinish(h: number, json: Uint8Array): boolean
  sessionCall(h: number, json: Uint8Array): Uint8Array | null
  sessionFrameCount(h: number): number
  sessionState(h: number, k: number, out: Float64Array): boolean
  sessionCheap(h: number, k: number): boolean
  sessionSegment(h: number, k: number): number
  sessionImpactLoss(h: number, k: number): number
  sessionInstall(h: number, chunk: number, bytes: Uint8Array): boolean
  sessionFree(h: number): void
  calcCall(json: Uint8Array): Uint8Array | null
  // Runs (the simulation worker, the tests)
  runCreate(json: Uint8Array): number
  runInfo(h: number): Uint8Array | null
  runSetUntil(h: number, frame: number): void
  runAdvance(h: number, steps: number): number
  runTime(h: number): number
  runFrameCount(h: number): number
  runRequestTail(h: number): void
  runTakeDelta(h: number): Uint8Array | null
  runEnd(h: number): Uint8Array | null
  runStop(h: number): void
  runCancel(h: number): void
  runFailBudget(h: number, ms: number): void
  runRebuildChunk(h: number, checkpoint: Float64Array, endFrame: number): Uint8Array | null
  runFree(h: number): void
  /** Bytes of linear memory (the WebAssembly core; the tests check that freed runs and sessions give memory back). */
  memoryBytes?(): number
}

const enc = new TextEncoder()
const dec = new TextDecoder()

/** JSON bytes of a value; −0 is written as the string "-0" (the Rust parser reads it back as −0). */
export function jsonBytes(v: unknown): Uint8Array {
  return enc.encode(JSON.stringify(v, (_k, x) => (Object.is(x, -0) ? '-0' : x)))
}

/** Decode a "VRD1" container: JSON with `{$f64|$i32|$u8: [offset, length]}` references into the blob. */
export function parseContainer(bytes: Uint8Array): unknown {
  if (bytes.length < 8 || bytes[0] !== 0x56 || bytes[1] !== 0x52 || bytes[2] !== 0x44 || bytes[3] !== 0x31) throw new Error('engine: not a result container')
  const n = bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24)
  const doc = JSON.parse(dec.decode(bytes.subarray(8, 8 + n)))
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

// ---- WebAssembly backend ----

interface WasmExports {
  memory: WebAssembly.Memory
  abi_version(): number
  scene_version(): number
  alloc(len: number): number
  dealloc(ptr: number, len: number): void
  last_error(ptr: number, len: number): number
  session_create(ptr: number, len: number): number
  session_simulate(ptr: number, len: number): number
  session_apply(h: number, ptr: number, len: number): number
  session_finish(h: number, ptr: number, len: number): number
  session_call(h: number, ptr: number, len: number): number
  session_output(h: number): number
  session_frame_count(h: number): number
  session_state(h: number, k: number, out: number): number
  session_cheap(h: number, k: number): number
  session_segment(h: number, k: number): number
  session_impact_loss(h: number, k: number): number
  session_install(h: number, chunk: number, ptr: number, len: number): number
  session_free(h: number): void
  calc_call(ptr: number, len: number): number
  calc_output(): number
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
  run_output(h: number): number
  run_free(h: number): void
}

/** The core compiled to WebAssembly. Results are copied out of linear memory at once (memory.grow detaches views). */
class WasmBackend implements CoreBackend {
  readonly kind = 'wasm' as const
  private readonly x: WasmExports
  /** Scratch output buffer (byte-return convention) and an 8-aligned scratch for states. */
  private outPtr = 0
  private outLen = 0
  private statePtr = 0
  private stateLen = 0

  constructor(instance: WebAssembly.Instance) {
    this.x = instance.exports as unknown as WasmExports
  }

  abiVersion() { return this.x.abi_version() }
  memoryBytes() { return this.x.memory.buffer.byteLength }
  sceneVersion() { return typeof this.x.scene_version === 'function' ? this.x.scene_version() : 3 }

  /** Run `fn` with `bytes` copied into linear memory. */
  private withInput<T>(bytes: Uint8Array, fn: (ptr: number, len: number) => T): T {
    const len = Math.max(1, bytes.length)
    const p = this.x.alloc(len)
    new Uint8Array(this.x.memory.buffer, p, bytes.length).set(bytes)
    try { return fn(p, bytes.length) } finally { this.x.dealloc(p, len) }
  }

  /** A byte-returning export (n > 0 bytes, −n buffer too small, 0 nothing), copied out. */
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

  private copy(ptr: number, n: number): Uint8Array | null {
    return n > 0 && ptr ? new Uint8Array(this.x.memory.buffer, ptr, n).slice() : null
  }

  lastError(): Message {
    const b = this.take((p, l) => this.x.last_error(p, l))
    return b ? reviveMessage(JSON.parse(dec.decode(b))) : { key: 'err.internal', params: { message: 'engine error' } }
  }

  sessionCreate(json: Uint8Array) { return this.withInput(json, (p, l) => this.x.session_create(p, l)) }
  sessionSimulate(json: Uint8Array) { return this.withInput(json, (p, l) => this.x.session_simulate(p, l)) }
  sessionApply(h: number, b: Uint8Array) { return this.withInput(b, (p, l) => this.x.session_apply(h, p, l)) === 1 }
  sessionFinish(h: number, b: Uint8Array) { return this.withInput(b, (p, l) => this.x.session_finish(h, p, l)) === 1 }
  sessionCall(h: number, b: Uint8Array) {
    const n = this.withInput(b, (p, l) => this.x.session_call(h, p, l))
    return n > 0 ? this.copy(this.x.session_output(h), n) : null
  }
  sessionFrameCount(h: number) { return this.x.session_frame_count(h) }
  sessionState(h: number, k: number, out: Float64Array) {
    const bytes = out.length * 8
    if (this.stateLen < bytes) {
      if (this.stateLen) this.x.dealloc(this.statePtr, this.stateLen + 8)
      this.stateLen = Math.max(bytes, 1024)
      this.statePtr = this.x.alloc(this.stateLen + 8)
    }
    const aligned = (this.statePtr + 7) & ~7
    if (this.x.session_state(h, k, aligned) !== 1) return false
    out.set(new Float64Array(this.x.memory.buffer, aligned, out.length))
    return true
  }
  sessionCheap(h: number, k: number) { return this.x.session_cheap(h, k) === 1 }
  sessionSegment(h: number, k: number) { return this.x.session_segment(h, k) }
  sessionImpactLoss(h: number, k: number) { return this.x.session_impact_loss(h, k) }
  sessionInstall(h: number, chunk: number, b: Uint8Array) { return this.withInput(b, (p, l) => this.x.session_install(h, chunk, p, l)) === 1 }
  sessionFree(h: number) { this.x.session_free(h) }
  calcCall(b: Uint8Array) {
    const n = this.withInput(b, (p, l) => this.x.calc_call(p, l))
    return n > 0 ? this.copy(this.x.calc_output(), n) : null
  }
  runCreate(b: Uint8Array) { return this.withInput(b, (p, l) => this.x.run_create(p, l)) }
  runInfo(h: number) { return this.take((p, l) => this.x.run_info(h, p, l)) }
  runSetUntil(h: number, f: number) { this.x.run_set_until(h, f) }
  runAdvance(h: number, n: number) { return this.x.run_advance(h, n) }
  runTime(h: number) { return this.x.run_time(h) }
  runFrameCount(h: number) { return this.x.run_frame_count(h) }
  runRequestTail(h: number) { this.x.run_request_tail(h) }
  runTakeDelta(h: number) { return this.take((p, l) => this.x.run_take_delta(h, p, l)) }
  runEnd(h: number) { return this.take((p, l) => this.x.run_end(h, p, l)) }
  runStop(h: number) { this.x.run_stop(h) }
  runCancel(h: number) { this.x.run_cancel(h) }
  runFailBudget(h: number, ms: number) { this.x.run_fail_budget(h, ms) }
  runRebuildChunk(h: number, cp: Float64Array, endFrame: number) {
    const bytes = new Uint8Array(cp.buffer, cp.byteOffset, cp.byteLength)
    const n = this.withInput(bytes, (p, l) => this.x.run_rebuild_chunk(h, p, l, endFrame))
    return n > 0 ? this.copy(this.x.run_output(h), n) : null
  }
  runFree(h: number) { this.x.run_free(h) }
}

/** Instantiate the WebAssembly core from its bytes (checks the ABI version). */
export async function instantiateCore(bytes: ArrayBuffer | Uint8Array): Promise<CoreBackend> {
  const { instance } = await WebAssembly.instantiate(bytes as BufferSource, {})
  const b = new WasmBackend(instance)
  const v = b.abiVersion()
  if (v !== ABI_VERSION) throw new Error(`engine: ABI version ${v}, expected ${ABI_VERSION}`)
  return b
}

// ---- The core of this thread ----

let current: CoreBackend | null = null
let loading: Promise<CoreBackend> | null = null

/** The loaded core (throws before `loadCore` or `setCore`). */
export function core(): CoreBackend {
  if (!current) throw new Error('engine: the Rust core is not loaded')
  return current
}

/** Whether a core is loaded on this thread. */
export function coreLoaded(): boolean { return current !== null }

/** Install a core (tests: the Node-API module or a WebAssembly build). */
export function setCore(b: CoreBackend | null) { current = b; loading = b ? Promise.resolve(b) : null }

/** Load the WebAssembly core shipped with the application (shared promise; fetch + instantiate). */
export function loadCore(url: string): Promise<CoreBackend> {
  loading ??= (async () => {
    if (typeof WebAssembly !== 'object') throw new Error('WebAssembly is not available')
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const b = await instantiateCore(await res.arrayBuffer())
    current = b
    return b
  })()
  return loading
}

/** Throw the core's last error as a MessageError. */
export function failCore(b: CoreBackend = core()): never {
  throw new MessageError(b.lastError())
}

/** A stateless calculation (engine/velophi-core/src/calc.rs). */
export function calc<T = Record<string, unknown>>(req: { op: string } & Record<string, unknown>): T {
  const b = core()
  const out = b.calcCall(jsonBytes(req))
  if (!out) failCore(b)
  return parseContainer(out) as T
}
