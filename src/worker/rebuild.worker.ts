/**
 * Rebuild worker (manual 26.51, carry-over 1 of 26.50): recomputes chunks of frames that were evicted under the
 * memory budget from their checkpoints, off the interface thread, with the Rust core compiled to WebAssembly. The
 * answer is the raw rebuild container; the interface thread's session verifies it against the chunk's digest and the
 * next checkpoint before installing it (session.rs). One worker serves every recording; the compiled runs of the last
 * scenes are kept (engine/host.ts).
 */
import wasmUrl from '../engine/velophi_core.wasm?url'
import type { Scene } from '../core/scene/types'
import { jsonBytes, loadCore } from '../engine/core'

/** Request of the interface thread. */
export interface ToRebuild { type: 'rebuild'; id: number; scene: Scene; duration: number | null; chunkFrames: number; checkpoint: Float64Array; endFrame: number }
/** Answer: the rebuild container, or why it failed. */
export type FromRebuild = { type: 'rebuilt'; id: number; bytes: Uint8Array } | { type: 'failed'; id: number; message: string }

interface Scope { postMessage(m: FromRebuild, transfer?: Transferable[]): void; onmessage: ((e: MessageEvent<ToRebuild>) => void) | null }
const scope = self as unknown as Scope

/** Compiled runs of recent scenes (key: scene text, duration and chunk length). */
const runs = new Map<string, number>()
const RUNS_KEPT = 3

scope.onmessage = async ev => {
  const m = ev.data
  if (m.type !== 'rebuild') return
  try {
    const core = await loadCore(wasmUrl)
    const key = `${m.duration}|${m.chunkFrames}|${JSON.stringify(m.scene)}`
    let h = runs.get(key)
    if (!h) {
      const dt = m.scene.settings.outputStep
      h = core.runCreate(jsonBytes({ scene: m.scene, duration: m.duration, chunkSeconds: m.chunkFrames * dt }))
      if (!h) throw new Error(core.lastError().key)
      runs.set(key, h)
      if (runs.size > RUNS_KEPT) {
        const [oldKey, old] = runs.entries().next().value!
        core.runFree(old)
        runs.delete(oldKey)
      }
    }
    const bytes = core.runRebuildChunk(h, m.checkpoint, m.endFrame)
    if (!bytes) throw new Error(core.lastError().key)
    scope.postMessage({ type: 'rebuilt', id: m.id, bytes }, [bytes.buffer as ArrayBuffer])
  } catch (e) {
    scope.postMessage({ type: 'failed', id: m.id, message: (e as Error).message || String(e) })
  }
}
