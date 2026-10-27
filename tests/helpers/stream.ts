/**
 * Test helpers on the Rust core: a run streamed delta by delta into a recording store, as the simulation host and
 * the interface thread do (26.53).
 */
import type { Scene } from '../../src/core/scene/types'
import { cloneScene } from '../../src/core/scene/io'
import { core, jsonBytes } from '../../src/engine/core'
import type { Recording, RecordingEnd } from '../../src/engine/recording'
import { RecordingStore } from '../../src/engine/recording'
import { reviveMessage } from '../../src/i18n/message'

/** Options of streamRun. */
export interface StreamOptions {
  /** Duration override (null: unbounded); default the scene's. */
  duration?: number | null
  /** Stop an unbounded run once this many frames are recorded. */
  frames?: number
  chunkSeconds?: number
  budgetBytes?: number
  /** Loop iterations per advance call (small values exercise the tail deltas). */
  steps?: number
  /** Called with every delta before it is applied (the bytes are copied). */
  onDelta?: (bytes: Uint8Array, store: RecordingStore) => void
}

/** Run `scene` in the core and apply its deltas to a recording store one by one; returns the store and the recording. */
export function streamRun(scene: Scene, o: StreamOptions = {}): { store: RecordingStore; rec: Recording } {
  const b = core()
  const req: Record<string, unknown> = { scene: cloneScene(scene) }
  if (o.duration !== undefined) req.duration = o.duration
  if (o.chunkSeconds !== undefined) req.chunkSeconds = o.chunkSeconds
  const h = b.runCreate(jsonBytes(req))
  if (!h) throw new Error(b.lastError().key)
  const info = JSON.parse(new TextDecoder().decode(b.runInfo(h)!)) as { chunkFrames: number; duration: number | null; dt: number }
  const store = new RecordingStore(cloneScene(scene), { chunkFrames: info.chunkFrames, duration: info.duration, budgetBytes: o.budgetBytes })
  const until = o.frames !== undefined ? Math.ceil(o.frames / info.chunkFrames) * info.chunkFrames : Infinity
  b.runSetUntil(h, until)
  for (;;) {
    const st = b.runAdvance(h, o.steps ?? 50000)
    if (st === 1) b.runStop(h)
    const finished = st !== 0
    if (finished || o.steps) b.runRequestTail(h)
    for (;;) {
      const d = b.runTakeDelta(h)
      if (!d) break
      o.onDelta?.(d.slice(), store)
      store.apply(d)
    }
    if (finished && b.runEnd(h)) break
  }
  const e = JSON.parse(new TextDecoder().decode(b.runEnd(h)!)) as RecordingEnd & { error: unknown }
  b.runFree(h)
  const rec = store.final({ ...e, error: e.error ? reviveMessage(e.error) : null })
  return { store, rec }
}
