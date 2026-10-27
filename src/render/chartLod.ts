/**
 * Level of detail of long time charts (decision D32): min/max envelopes of quantity time series at three levels —
 * single frames, blocks of B frames and chunks of F frames — so a chart of any length is drawn from a few values per
 * pixel column and a redraw never iterates all frames. The envelopes are computed in the Rust core (lod.rs, 26.53):
 * chunk statistics of plain state components come from the chunk summaries, everything else from scans of chunks in
 * memory spread over calls by a work budget; evicted chunks in view are recomputed off this thread (prefetch) or, on
 * request, in the session (`rebuild`, one chunk per call). This module turns an envelope into plot points.
 */
import type { Recording } from '../engine/recording'
import { prefetchChunk } from '../engine/recording'
import { envelopeOf } from '../engine/views'

/** Level of an envelope: one value per frame, per block of frames, or per chunk. */
export type LodLevel = 'frame' | 'block' | 'chunk'

/** Blocks per chunk of the middle level. */
export const BLOCKS_PER_CHUNK = 20

/** Frames per chunk of a recording. */
export function chunkFramesOf(rec: Recording): number { return rec.chunkFrames }

/** What `chartEnvelope` computes. */
export interface EnvelopeRequest {
  /** Quantity ids. */
  ids: string[]
  /** Frame window [k0, k1] (clipped to the recording). */
  k0: number
  k1: number
  /** Pixel columns. */
  columns: number
  /** Work for scanning chunks in this call (frame evaluations; default 4000, about 12 ms). */
  budget?: number
  /** Recompute (at most) one evicted chunk that the view needs (default false). */
  rebuild?: boolean
  /** Use this level instead of the one chosen from the column density (tests). */
  level?: LodLevel
}

/** Column statistics of one quantity (NaN where nothing is known yet; min > max: only non-finite values). */
export interface ColumnStats {
  min: Float64Array
  max: Float64Array
  first: Float64Array
  last: Float64Array
  /** 0: exact; 1: stand-in (the value at a chunk start); 2: unknown. */
  state: Uint8Array
}

/** Min/max envelope of quantities over a frame window. */
export interface Envelope {
  level: LodLevel
  /** Frames per unit of the level. */
  unit: number
  /** First and last frame of every column. */
  colFirst: Int32Array
  colLast: Int32Array
  stats: Map<string, ColumnStats>
  /** Some columns are stand-ins or unknown: call again (with `rebuild` for evicted chunks) to complete them. */
  pending: boolean
  /** Evicted chunks the view needs that have not been recomputed. */
  evicted: number[]
  dt: number
}

/** Level for a window of `frames` frames in `columns` columns. */
export function chooseLevel(frames: number, columns: number, F: number): LodLevel {
  const fpc = frames / Math.max(1, columns)
  const B = Math.max(1, Math.ceil(F / BLOCKS_PER_CHUNK))
  return fpc < B ? 'frame' : fpc < F ? 'block' : 'chunk'
}

const counters = new WeakMap<object, { scans: number; rebuilds: number }>()

/** Work counters of a recording's chart caches: chunks scanned and recomputed so far. */
export function lodCounters(rec: Recording): { scans: number; rebuilds: number } {
  return counters.get(rec.session) ?? { scans: 0, rebuilds: 0 }
}

/** Min/max envelope of `ids` over a frame window (see the module header). */
export function chartEnvelope(rec: Recording, req: EnvelopeRequest): Envelope {
  const r = envelopeOf(rec, { ids: req.ids, k0: req.k0, k1: req.k1, columns: req.columns, budget: req.budget ?? 4000, rebuild: !!req.rebuild, level: req.level })
  counters.set(rec.session, { scans: r.scans, rebuilds: r.rebuilds })
  // Evicted chunks in view are recomputed off this thread when the recording can (they arrive later)
  const evicted = r.evicted.slice()
  let asked = 0
  for (let i = 0; i < evicted.length && asked < 4; i++) if (prefetchChunk(rec, evicted[i])) { evicted.splice(i--, 1); asked++ }
  const stats = new Map<string, ColumnStats>()
  for (const [id, x] of Object.entries(r.stats)) stats.set(id, { min: x.min, max: x.max, first: x.first, last: x.last, state: Uint8Array.from(x.state) })
  return { level: r.level, unit: r.unit, colFirst: r.colFirst, colLast: r.colLast, stats, pending: r.pending, evicted, dt: r.dt }
}

/** Points of one envelope for a line chart. */
export interface EnvelopePlot {
  /** Times (s), non-decreasing. */
  t: Float64Array
  /**
   * Values per id, aligned with `t`: a number, null (a gap: no finite value there) or undefined (not known yet; the
   * line is drawn across it).
   */
  values: Map<string, Array<number | null | undefined>>
  /** Column of every point. */
  colOf: Int32Array
}

/**
 * Plot points of an envelope: one point per column when every column is a single frame, else four per column —
 * first (at the column's first frame), min and max (in the order that keeps the line short, at the column's middle)
 * and last (at its last frame) — so a line through them draws the envelope at any density.
 */
export function envelopePlot(env: Envelope): EnvelopePlot {
  const C = env.colFirst.length
  const single = env.level === 'frame' && env.colFirst.every((k, j) => k === env.colLast[j])
  const per = single ? 1 : 4
  const t = new Float64Array(C * per)
  const colOf = new Int32Array(C * per)
  for (let j = 0; j < C; j++) {
    const ta = env.colFirst[j] * env.dt, tb = env.colLast[j] * env.dt
    if (single) { t[j] = ta; colOf[j] = j; continue }
    const tm = (ta + tb) / 2
    t[4 * j] = ta; t[4 * j + 1] = tm; t[4 * j + 2] = tm; t[4 * j + 3] = tb
    colOf[4 * j] = colOf[4 * j + 1] = colOf[4 * j + 2] = colOf[4 * j + 3] = j
  }
  const values = new Map<string, Array<number | null | undefined>>()
  for (const [id, s] of env.stats) {
    const out: Array<number | null | undefined> = new Array(C * per)
    for (let j = 0; j < C; j++) {
      const o = j * per
      if (s.state[j] === 2) { for (let i = 0; i < per; i++) out[o + i] = undefined; continue }
      const lo = s.min[j], hi = s.max[j]
      if (!(lo <= hi)) { for (let i = 0; i < per; i++) out[o + i] = null; continue }
      if (single) { out[o] = Number.isFinite(s.first[j]) ? s.first[j] : null; continue }
      const f = Number.isFinite(s.first[j]) ? s.first[j] : lo, l = Number.isFinite(s.last[j]) ? s.last[j] : hi
      // Visit the extreme nearer to the first value first
      const minFirst = Math.abs(f - lo) <= Math.abs(f - hi)
      out[o] = f
      out[o + 1] = minFirst ? lo : hi
      out[o + 2] = minFirst ? hi : lo
      out[o + 3] = l
    }
    values.set(id, out)
  }
  return { t, values, colOf }
}
