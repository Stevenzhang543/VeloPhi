/**
 * The pendulum wave behind the home page (26.64, D257): fifteen pendulums whose lengths are chosen so that the longest
 * makes 24 swings in the pattern's cycle and each next one makes one more. Released together they drift out of step,
 * pass through travelling waves and standing patterns, and come back into line once per cycle.
 *
 * The motion is not drawn from a formula. Each pendulum is a tiny scene of the application — a point mass on a rod,
 * released at rest (built with core/scene/build.ts) — solved by the Rust core in a background session
 * (`sessionSimulate`), and the positions the page draws are that session's `series` of the bob. The sessions are
 * freed as soon as their positions are copied out, so what stays in memory is one small array.
 *
 * What is decided here is the apparatus, not the motion: how many pendulums, their lengths (the classical ratio
 * L_k ∝ 1 / (N₀ + k)²), the release angle. Because every bob is released at the same angle, the large-angle correction
 * of the period is the same factor for all of them, so the pattern repeats exactly — only slightly later than the
 * small-angle cycle. That moment is read from the solved motion itself (`loopFrame`), not computed.
 *
 * Cost: solving one pendulum takes about 25 ms in the WebAssembly core, once; the page asks for them one per idle
 * period. Drawing a frame reads 30 numbers.
 */
import { addBody, addConnector, anchor, emptyScene } from '../../core/scene/build'
import type { RodDef, Scene } from '../../core/scene/types'
import { cos, sin } from '../../core/math/dmath'
import { EngineSession } from '../../engine/session'

/** The apparatus. */
export const WAVE = {
  /** Pendulums in the row. */
  count: 15,
  /** Swings of the longest pendulum per cycle; pendulum k makes `first + k`. */
  first: 24,
  /** The cycle after which all are in line again, for small angles (s). */
  cycle: 120,
  /** Release angle (rad): 5° — small, so the rods can be long and neighbours still never cross. */
  release: (5 * Math.PI) / 180,
  /** g of the apparatus (m/s²): fixed, so the decoration does not depend on the default-gravity setting. */
  gravity: 9.8,
  /** Time between stored positions (s). */
  step: 1 / 30
} as const

/** Length (m) of pendulum k for the small-angle period cycle / (first + k). */
export function waveLength(k: number): number {
  const period = WAVE.cycle / (WAVE.first + k)
  const w = period / (2 * Math.PI)
  return WAVE.gravity * w * w
}

/** The scene of pendulum k: a point mass on a rod from a fixed pivot at the origin, released at rest. */
export function pendulumScene(k: number): Scene {
  const s = emptyScene(`pendulum wave ${k}`)
  const L = waveLength(k)
  const bob = addBody(s, { id: 'bob', name: 'bob', kind: 'particle', role: 'ball', shape: { type: 'circle', radius: 0.02 }, position: { x: L * sin(WAVE.release), y: -L * cos(WAVE.release) }, mass: 1 })
  addConnector<RodDef>(s, { id: 'rod', name: 'rod', type: 'rod', a: anchor(null, { x: 0, y: 0 }), b: anchor(bob), length: null })
  s.settings.gravity = { x: 0, y: -WAVE.gravity }
  s.settings.outputStep = WAVE.step
  return s
}

/** Simulated time per pendulum (s): the cycle and a margin for the large-angle lengthening (2 %: release angles to 32°). */
export const WAVE_DURATION = WAVE.cycle * 1.02

/** Positions of one bob relative to its pivot, from the core: x0, y0, x1, y1, … (m), one pair per stored frame. */
export function solvePendulum(k: number): Float32Array {
  const session = EngineSession.simulate(pendulumScene(k), { duration: WAVE_DURATION })
  try {
    const r = session.call<{ t: Float64Array; values: Float64Array[] }>({ op: 'series', ids: ['bob.x', 'bob.y'], from: 0, stride: 1 })
    const n = r.t.length
    const xy = new Float32Array(2 * n)
    for (let i = 0; i < n; i++) { xy[2 * i] = r.values[0][i]; xy[2 * i + 1] = r.values[1][i] }
    return xy
  } finally {
    session.free()
  }
}

/** The solved wave: per pendulum its length and positions, and the frame at which the pattern repeats. */
export interface WaveData {
  lengths: number[]
  /** tracks[k][2f], tracks[k][2f + 1]: bob k at frame f, relative to its pivot (m). */
  tracks: Float32Array[]
  frames: number
  /** First frame after the cycle at which every bob is back where it started (the loop's length in frames). */
  loopFrame: number
  step: number
}

/**
 * The frame, searched from the small-angle cycle on, at which the bobs are closest to their starting positions: the
 * pattern's true period as the solver found it. Playback runs frames [0, loopFrame) in a loop.
 */
export function findLoopFrame(tracks: Float32Array[], step: number): number {
  const frames = Math.min(...tracks.map(t => t.length / 2))
  let best = frames - 1, bestD = Infinity
  for (let f = Math.max(1, Math.floor(WAVE.cycle / step) - 2); f < frames; f++) {
    let d = 0
    for (const t of tracks) { const dx = t[2 * f] - t[0], dy = t[2 * f + 1] - t[1]; d += dx * dx + dy * dy }
    if (d < bestD) { bestD = d; best = f }
  }
  return best
}

/** Assemble the wave from the solved pendulums. */
export function assembleWave(tracks: Float32Array[]): WaveData {
  const frames = Math.min(...tracks.map(t => t.length / 2))
  return { lengths: tracks.map((_, k) => waveLength(k)), tracks, frames, loopFrame: findLoopFrame(tracks, WAVE.step), step: WAVE.step }
}

/** Solve the whole wave at once (tests; the page uses `loadWave`, which spreads the work over idle time). */
export function solveWave(): WaveData {
  return assembleWave(Array.from({ length: WAVE.count }, (_, k) => solvePendulum(k)))
}

/** Position of bob k at time t (s) of the loop, linearly between the two stored frames around it: [x, y] in m. */
export function waveAt(data: WaveData, k: number, t: number, out: [number, number] = [0, 0]): [number, number] {
  const span = data.loopFrame * data.step
  const u = (((t % span) + span) % span) / data.step
  const f = Math.min(data.loopFrame - 1, Math.floor(u))
  const a = u - f
  const tr = data.tracks[k]
  // the frame after the last one of the loop is the first again (the pattern has repeated)
  const g = f + 1 >= data.loopFrame ? 0 : f + 1
  out[0] = tr[2 * f] + a * (tr[2 * g] - tr[2 * f])
  out[1] = tr[2 * f + 1] + a * (tr[2 * g + 1] - tr[2 * f + 1])
  return out
}

let cache: WaveData | null = null
let pending: Promise<WaveData | null> | null = null

/** The wave if it has been solved already (the loading trace draws one of its tracks when it can). */
export function cachedWave(): WaveData | null { return cache }

/**
 * Solve the wave in the background, one pendulum per idle period, once per run of the application. Resolves with null
 * when the core cannot solve it (the page then simply has no decoration).
 */
export function loadWave(): Promise<WaveData | null> {
  if (cache) return Promise.resolve(cache)
  if (pending) return pending
  const idle = (cb: () => void) => {
    const w = globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }
    if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(cb, { timeout: 600 })
    else setTimeout(cb, 30)
  }
  pending = new Promise(resolve => {
    const tracks: Float32Array[] = []
    const next = () => {
      try {
        tracks.push(solvePendulum(tracks.length))
      } catch {
        pending = null
        resolve(null)
        return
      }
      if (tracks.length < WAVE.count) { idle(next); return }
      cache = assembleWave(tracks)
      resolve(cache)
    }
    idle(next)
  })
  return pending
}
