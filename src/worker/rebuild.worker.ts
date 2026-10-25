/**
 * Rebuild worker (manual 26.51, carry-over 1 of 26.50): recomputes chunks of frames that were evicted under the
 * memory budget from their checkpoints, off the interface thread, with the Rust core compiled to WebAssembly (the
 * TypeScript engine when it does not load). The interface thread verifies every chunk against its digest and the
 * next checkpoint before using it (core/solver/stream.ts), exactly as a chunk it recomputes itself. One worker
 * serves every recording; the compiled run of the last scenes is kept (app/rebuildClient.ts).
 */
import wasmUrl from '../engine/verity_core.wasm?url'
import type { WasmEngine, WasmRun } from '../engine/wasm'
import { loadEngine } from '../engine/wasm'
import type { Scene } from '../core/scene/types'
import { compileModel } from '../core/solver/model'
import { buildSystem } from '../core/solver/dynamics'
import type { System } from '../core/solver/dynamics'
import { rebuildChunk } from '../core/solver/simulation'

/** Request of the interface thread. */
export interface ToRebuild { type: 'rebuild'; id: number; scene: Scene; duration: number | null; chunkSeconds: number; checkpoint: Float64Array; endFrame: number }
/** Answer: the chunk's frames and the next checkpoint, or why it failed. */
export type FromRebuild =
  | { type: 'rebuilt'; id: number; first: number; count: number; states: Float64Array; segment: Int32Array; impactLoss: Float64Array; next: Float64Array | null; engine: 'wasm' | 'ts' }
  | { type: 'failed'; id: number; message: string }

interface Scope { postMessage(m: FromRebuild, transfer?: Transferable[]): void; onmessage: ((e: MessageEvent<ToRebuild>) => void) | null }
const scope = self as unknown as Scope

let enginePromise: Promise<WasmEngine | null> | null = null
const engine = () => (enginePromise ??= loadEngine(wasmUrl).catch(() => null))

/** Compiled runs of recent scenes (key: scene text and duration). */
const runs = new Map<string, { wasm: WasmRun | null; system: System | null }>()
const RUNS_KEPT = 3

async function runFor(scene: Scene, duration: number | null) {
  const key = `${duration}|${JSON.stringify(scene)}`
  const hit = runs.get(key)
  if (hit) return hit
  const e = await engine()
  let entry: { wasm: WasmRun | null; system: System | null }
  try {
    entry = e ? { wasm: e.create(scene, duration), system: null } : { wasm: null, system: buildSystem(compileModel(scene)) }
  } catch {
    entry = { wasm: null, system: buildSystem(compileModel(scene)) }
  }
  runs.set(key, entry)
  if (runs.size > RUNS_KEPT) {
    const [oldKey, old] = runs.entries().next().value!
    old.wasm?.free()
    runs.delete(oldKey)
  }
  return entry
}

scope.onmessage = async ev => {
  const m = ev.data
  if (m.type !== 'rebuild') return
  try {
    const run = await runFor(m.scene, m.duration)
    if (run.wasm) {
      const out = run.wasm.rebuildChunk(m.checkpoint, m.endFrame) as { chunk: { first: number; count: number; states: Float64Array; segment: Int32Array; impactLoss: Float64Array }; next: Float64Array | null; error?: unknown }
      if (!out || out.error || !out.chunk) throw new Error('engine: rebuild failed')
      const c = out.chunk
      scope.postMessage({ type: 'rebuilt', id: m.id, first: c.first, count: c.count, states: c.states, segment: c.segment, impactLoss: c.impactLoss, next: out.next ?? null, engine: 'wasm' }, [c.states.buffer, c.segment.buffer, c.impactLoss.buffer])
      return
    }
    const r = rebuildChunk(m.scene, run.system!, m.checkpoint, { duration: m.duration, chunkSeconds: m.chunkSeconds }, m.endFrame)
    const c = r.chunk
    scope.postMessage({ type: 'rebuilt', id: m.id, first: c.first, count: c.count, states: c.states, segment: c.segment, impactLoss: c.impactLoss, next: r.next, engine: 'ts' }, [c.states.buffer, c.segment.buffer, c.impactLoss.buffer])
  } catch (e) {
    scope.postMessage({ type: 'failed', id: m.id, message: (e as Error).message || String(e) })
  }
}
