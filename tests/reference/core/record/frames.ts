/**
 * Frame storage of recordings (decision D26). Output frames are grouped in chunks of F consecutive frames
 * (chunk c holds frames c·F … c·F + F − 1, F = max(1, round(1 s / Δt)) by default, so chunk boundaries lie on the
 * output grid). A chunk is three typed arrays — states (row-major, `size` values per frame), segment indices and
 * cumulative impact losses — that can be posted between threads, dropped under memory pressure and recomputed
 * from the chunk's checkpoint (core/solver/checkpoint.ts) bit for bit.
 *
 * Everything that reads frames goes through `FrameStore`, never through the arrays themselves.
 */

/** Per-frame data of a recording; frames may live in chunks that are evicted and rebuilt on demand. */
export interface FrameStore {
  /** State of frame k: a read-only view (do not write into it). */
  state(k: number): Float64Array
  /** Segment index of frame k. */
  segment(k: number): number
  /** Cumulative kinetic energy lost in impacts up to frame k (J). */
  impactLoss(k: number): number
  /**
   * True when frame k can be read without recomputing a chunk (its chunk is in memory, or k is a chunk start,
   * which a checkpoint holds). Stores that never evict omit it.
   */
  cheap?(k: number): boolean
  /** Frames per chunk, when the store is chunked. */
  readonly chunkFrames?: number
  /**
   * Start recomputing evicted chunk c off this thread (26.51); true when it is in memory or on its way, false when
   * reading it would recompute it here. Stores without a remote rebuilder omit it.
   */
  prefetch?(c: number): boolean
}

/** One chunk of frames. Only the first `count` frames are valid. */
export interface FrameChunk {
  /** Chunk index c. */
  index: number
  /** Index of the chunk's first frame (c·F). */
  first: number
  /** Valid frames. */
  count: number
  states: Float64Array
  segment: Int32Array
  impactLoss: Float64Array
}

/** An empty chunk for `capacity` frames of `size` values. */
export function newChunk(index: number, first: number, capacity: number, size: number): FrameChunk {
  return { index, first, count: 0, states: new Float64Array(capacity * size), segment: new Int32Array(capacity), impactLoss: new Float64Array(capacity) }
}

/** Bytes held by a chunk's arrays. */
export function chunkBytes(c: FrameChunk): number {
  return c.states.byteLength + c.segment.byteLength + c.impactLoss.byteLength
}

/** Frames per chunk for output step `dt` and chunk length `seconds` (default 1 s). */
export function framesPerChunk(dt: number, seconds = 1): number {
  return Math.max(1, Math.round(seconds / dt))
}

/**
 * Summary of a chunk: for every state component i (N = size values each), the minimum, maximum, first and last
 * value over the chunk's frames, as one Float64Array [min₀…min_{N−1}, max₀…, first₀…, last₀…] of length 4N.
 */
export function chunkSummary(c: FrameChunk, size: number): Float64Array {
  const out = new Float64Array(4 * size)
  const s = c.states
  const n = c.count
  if (n === 0) return out
  for (let i = 0; i < size; i++) {
    let lo = s[i], hi = s[i]
    for (let k = 1; k < n; k++) { const v = s[k * size + i]; if (v < lo) lo = v; if (v > hi) hi = v }
    out[i] = lo; out[size + i] = hi; out[2 * size + i] = s[i]; out[3 * size + i] = s[(n - 1) * size + i]
  }
  return out
}

/** Frames held in memory chunk by chunk (the solver's own store; nothing is ever recomputed). */
export class ChunkFrames implements FrameStore {
  /** Chunks by index; null once released (posted to another thread). */
  readonly chunks: Array<FrameChunk | null> = []

  constructor(readonly size: number, readonly chunkFrames: number) {}

  /** The chunk holding frame k (it must be present). */
  chunkAt(k: number): FrameChunk {
    const c = this.chunks[Math.floor(k / this.chunkFrames)]
    if (!c || k - c.first >= c.count || k < c.first) throw new Error(`frame ${k} is not in memory`)
    return c
  }

  state(k: number): Float64Array {
    const c = this.chunkAt(k)
    const j = k - c.first
    return c.states.subarray(j * this.size, (j + 1) * this.size)
  }

  segment(k: number): number { const c = this.chunkAt(k); return c.segment[k - c.first] }

  impactLoss(k: number): number { const c = this.chunkAt(k); return c.impactLoss[k - c.first] }
}
