/**
 * Checkpoints of a streaming run (decision D26): everything that influences the rest of the run, taken at the
 * start of every chunk, so that the chunk can be recomputed later through the very same code path and come out
 * bit for bit the same. A checkpoint is one Float64Array (little-endian IEEE-754 doubles when posted or saved);
 * integers and flags are stored as exact doubles. The layout is part of the engine contract (the Rust engine
 * produces and consumes it); docs/dev/STREAMING.md lists it field by field.
 *
 *   header (26 values)       format, length, N, chunk, k, t, h, impactLoss, lastEventT, eventsAtInstant,
 *                            reduced, reducedFrom, kStop, eventCount, segment index, segment t0,
 *                            segment impactLoss, segment reduced, steps, rejected, events, locateIterations,
 *                            ambiguousModes, max position correction, max velocity correction, frame segment
 *   X, k1, segment X0        N values each
 *   mode                     U, per unit (pair, ref, friction, s, roll, P, points…, O, open…), R, taut…, W, sw…,
 *                            L, limit…, S, slip…   (26.52, format 2: roll 0 none, 1 rest, 2 rolling +, 3 rolling −;
 *                            W, L and S are −1 when the mode has no such field)
 *   event functions          M, thresholds…, starts…
 *   recent event times       R, times…
 *   toggles                  T, per switch (index, n, times…), ascending switch index
 *
 * In the Moreau–Jean part (reduced = 1) the event-driven fields are written empty: h = 0, k1 = 0,
 * lastEventT = 0, eventsAtInstant = 0, M = 0, no recent events, no toggles.
 */
import type { EncodedMode, EncodedUnit } from './codec'

/** Version of the checkpoint layout. */
export const CHECKPOINT_FORMAT = 2
/** Values before X. */
export const CHECKPOINT_HEADER = 26

/** A checkpoint as plain data (see the module header). */
export interface Checkpoint {
  chunk: number
  /** Frame index of the chunk start (chunk · F); the frame's state is X. */
  k: number
  t: number
  /** Next trial step. */
  h: number
  impactLoss: number
  lastEventT: number
  eventsAtInstant: number
  /** Start of the Moreau–Jean part; null while event-driven. */
  reducedFrom: number | null
  /** Frame at which a pending stop condition ends the run; +∞: none. */
  kStop: number
  /** Events created before the checkpoint. */
  eventCount: number
  /**
   * Segment index recorded for frame k. Usually the open segment; differs when the run switched to the
   * Moreau–Jean fallback right after recording the frame.
   */
  frameSegment: number
  /** The open segment (the mode is `mode`; its label is describeMode(mode)). */
  segment: { index: number; t0: number; impactLoss: number; reduced: boolean; X0: Float64Array }
  stats: { steps: number; rejected: number; events: number; locateIterations: number; ambiguousModes: number }
  projection: { position: number; velocity: number }
  X: Float64Array
  /** f(X) in the current mode. */
  k1: Float64Array
  mode: EncodedMode
  /** Hysteresis state of the event functions of the current mode, in buildEventFns order. */
  thresholds: Float64Array
  starts: Float64Array
  /** Event times inside the event-storm window. */
  recentEvents: number[]
  /** Recent switch times of variable-force switches (chatter detection), by switch index. */
  toggles: Array<{ index: number; times: number[] }>
}

function modeLength(m: EncodedMode): number {
  let n = 1
  for (const u of m.units) n += 7 + u.points.length + u.open.length
  return n + 1 + m.taut.length + 1 + (m.sw ? m.sw.length : 0) + 1 + (m.limit ? m.limit.length : 0) + 1 + (m.slip ? m.slip.length : 0)
}

/** Checkpoint code of a unit's rolling state: 0 none, 1 rest, 2 rolling +, 3 rolling −. */
const rollCode = (r: number | undefined) => (r === undefined ? 0 : r === 0 ? 1 : r > 0 ? 2 : 3)
const rollOf = (c: number): number | undefined => (c === 0 ? undefined : c === 1 ? 0 : c === 2 ? 1 : -1)

/** Serialize a checkpoint. */
export function encodeCheckpoint(cp: Checkpoint): Float64Array {
  const N = cp.X.length
  const M = cp.thresholds.length
  let len = CHECKPOINT_HEADER + 3 * N + modeLength(cp.mode) + 1 + 2 * M + 1 + cp.recentEvents.length + 1
  for (const t of cp.toggles) len += 2 + t.times.length
  const out = new Float64Array(len)
  const head = [
    CHECKPOINT_FORMAT, len, N, cp.chunk, cp.k, cp.t, cp.h, cp.impactLoss, cp.lastEventT, cp.eventsAtInstant,
    cp.reducedFrom === null ? 0 : 1, cp.reducedFrom ?? 0, cp.kStop, cp.eventCount,
    cp.segment.index, cp.segment.t0, cp.segment.impactLoss, cp.segment.reduced ? 1 : 0,
    cp.stats.steps, cp.stats.rejected, cp.stats.events, cp.stats.locateIterations, cp.stats.ambiguousModes,
    cp.projection.position, cp.projection.velocity, cp.frameSegment
  ]
  out.set(head, 0)
  let o = CHECKPOINT_HEADER
  out.set(cp.X, o); o += N
  out.set(cp.k1, o); o += N
  out.set(cp.segment.X0, o); o += N
  const m = cp.mode
  out[o++] = m.units.length
  for (const u of m.units) {
    out[o++] = u.pair; out[o++] = u.ref; out[o++] = u.friction; out[o++] = u.s; out[o++] = rollCode(u.roll)
    out[o++] = u.points.length
    for (const p of u.points) out[o++] = p
    out[o++] = u.open.length
    for (const p of u.open) out[o++] = p
  }
  out[o++] = m.taut.length
  for (const b of m.taut) out[o++] = b ? 1 : 0
  out[o++] = m.sw ? m.sw.length : -1
  if (m.sw) for (const b of m.sw) out[o++] = b
  out[o++] = m.limit ? m.limit.length : -1
  if (m.limit) for (const b of m.limit) out[o++] = b
  out[o++] = m.slip ? m.slip.length : -1
  if (m.slip) for (const b of m.slip) out[o++] = b
  out[o++] = M
  out.set(cp.thresholds, o); o += M
  out.set(cp.starts, o); o += M
  out[o++] = cp.recentEvents.length
  for (const t of cp.recentEvents) out[o++] = t
  out[o++] = cp.toggles.length
  for (const t of cp.toggles) {
    out[o++] = t.index; out[o++] = t.times.length
    for (const x of t.times) out[o++] = x
  }
  if (o !== len) throw new Error('checkpoint: length mismatch')
  return out
}

/** Read a checkpoint written by encodeCheckpoint (throws on a malformed buffer). */
export function decodeCheckpoint(d: Float64Array): Checkpoint {
  if (d.length < CHECKPOINT_HEADER || d[0] !== CHECKPOINT_FORMAT || d[1] !== d.length) throw new Error('checkpoint: unknown format')
  const N = d[2]
  let o = CHECKPOINT_HEADER
  const take = (n: number) => { const a = d.slice(o, o + n); o += n; return a }
  const X = take(N), k1 = take(N), X0 = take(N)
  const units: EncodedUnit[] = []
  const U = d[o++]
  for (let i = 0; i < U; i++) {
    const pair = d[o++], ref = d[o++], friction = d[o++] as 0 | 1 | 2, s = d[o++], roll = rollOf(d[o++])
    const P = d[o++]; const points = Array.from(d.subarray(o, o + P)); o += P
    const O = d[o++]; const open = Array.from(d.subarray(o, o + O)); o += O
    const u: EncodedUnit = { pair, ref, points, open, friction, s }
    if (roll !== undefined) u.roll = roll
    units.push(u)
  }
  const R = d[o++]
  const taut = Array.from(d.subarray(o, o + R), v => v !== 0); o += R
  const W = d[o++]
  const mode: EncodedMode = W >= 0 ? { units, taut, sw: Array.from(d.subarray(o, o + W)) } : { units, taut }
  if (W > 0) o += W
  const L = d[o++]
  if (L >= 0) { mode.limit = Array.from(d.subarray(o, o + L)); o += L }
  const S = d[o++]
  if (S >= 0) { mode.slip = Array.from(d.subarray(o, o + S)); o += S }
  const M = d[o++]
  const thresholds = take(M), starts = take(M)
  const RE = d[o++]
  const recentEvents = Array.from(d.subarray(o, o + RE)); o += RE
  const T = d[o++]
  const toggles: Checkpoint['toggles'] = []
  for (let i = 0; i < T; i++) {
    const index = d[o++], n = d[o++]
    toggles.push({ index, times: Array.from(d.subarray(o, o + n)) }); o += n
  }
  if (o !== d.length) throw new Error('checkpoint: length mismatch')
  return {
    chunk: d[3], k: d[4], t: d[5], h: d[6], impactLoss: d[7], lastEventT: d[8], eventsAtInstant: d[9],
    reducedFrom: d[10] !== 0 ? d[11] : null, kStop: d[12], eventCount: d[13], frameSegment: d[25],
    segment: { index: d[14], t0: d[15], impactLoss: d[16], reduced: d[17] !== 0, X0 },
    stats: { steps: d[18], rejected: d[19], events: d[20], locateIterations: d[21], ambiguousModes: d[22] },
    projection: { position: d[23], velocity: d[24] },
    X, k1, mode, thresholds, starts, recentEvents, toggles
  }
}

/** Chunk index of a serialized checkpoint. */
export function checkpointChunk(d: Float64Array): number { return d[3] }

/** State X (frame chunk · F) of a serialized checkpoint, as a view. */
export function checkpointState(d: Float64Array): Float64Array { return d.subarray(CHECKPOINT_HEADER, CHECKPOINT_HEADER + d[2]) }

/** Cumulative impact loss at the checkpoint (frame chunk · F). */
export function checkpointImpactLoss(d: Float64Array): number { return d[7] }

/** Segment index of the checkpoint's frame. */
export function checkpointSegment(d: Float64Array): number { return d[25] }

/** Events created before the checkpoint. */
export function checkpointEventCount(d: Float64Array): number { return d[13] }
