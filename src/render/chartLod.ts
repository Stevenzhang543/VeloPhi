/**
 * Level of detail of long time charts (decision D32): min/max envelopes of quantity time series at three levels —
 * single frames, blocks of B frames and chunks of F frames (the recording's own chunks, docs/dev/STREAMING.md) — so a
 * chart of any length is drawn from a few values per pixel column and a redraw never iterates all frames.
 *
 *  - Chunk statistics (min, max, first, last) of a plain state component (positions, angles, velocities, angular
 *    velocities, a pair's sliding distance and friction heat) are the chunk summaries the run streams with every
 *    chunk: available for every closed chunk, also when its frames have been evicted.
 *  - Everything else (speeds, energies, forces …), and every level finer than a chunk, comes from a scan: a chunk in
 *    memory is evaluated frame by frame once, and the scan keeps the chunk's min, max, first and last, the same per
 *    block, and the frame values (in a small LRU cache, for the frame level). Scans are spread over calls by a time
 *    budget; an evicted chunk is recomputed only on request (`rebuild`, one chunk per call), so the interface never
 *    waits for more than one chunk. Until a chunk is known, its start value (a chunk start is held by its
 *    checkpoint, so reading it is cheap) stands in for it, and the result says that it is `pending`.
 *
 * Columns: the frame window is snapped outward to whole units of the level, and of the U units column j holds units
 * [⌊j·U/C⌋, ⌊(j+1)·U/C⌋) — the statistics of a column are exactly those of its frames. Non-finite values (a contact
 * quantity while there is no contact) are left out of min and max.
 *
 * The caches live per frame store (one per run), so the growing snapshots of a streaming run share them. Pure
 * (no DOM): the chart panel, the dashboard sparklines and the tests use it.
 */
import type { Recording } from '../core/solver/simulation'
import { frameIsCheap, frameState } from '../core/solver/simulation'
import type { System } from '../core/solver/dynamics'
import { AUX_FIXED } from '../core/solver/dynamics'
import { pairKey } from '../core/solver/model'
import { evaluateQuantity, makeContext } from '../core/observe/quantities'

/** Level of an envelope: one value per frame, per block of frames, or per chunk. */
export type LodLevel = 'frame' | 'block' | 'chunk'

/** Blocks per chunk of the middle level. */
export const BLOCKS_PER_CHUNK = 20
/** Frame-value arrays kept for the frame level (one per quantity and chunk). */
const RAW_CACHE = 1024

/** Statistics of a scanned chunk of one quantity. */
interface ChunkLod {
  /** Frames scanned (an open chunk grows and is extended). */
  count: number
  /** min, max, first, last of every block (4 values per block). */
  blocks: Float64Array
  min: number
  max: number
  first: number
  last: number
}

/** Level-of-detail data of one quantity. */
interface QuantityLod {
  id: string
  /** Index of the state component the quantity is, or −1 when it needs the mode solution. */
  component: number
  chunks: Array<ChunkLod | undefined>
  /** Value at chunk starts (stand-ins for chunks not scanned yet). */
  starts: Map<number, number>
}

/** The caches of one recording (frame store). */
class LodCache {
  /** Frames per chunk, frames per block, blocks per chunk. */
  readonly F: number
  readonly B: number
  readonly nb: number
  readonly quantities = new Map<string, QuantityLod>()
  /** Frame values by `id#chunk`, least recently used first. */
  readonly raw = new Map<string, Float64Array>()
  /** Chunks whose recompute failed (never retried). */
  readonly failed = new Set<number>()
  /** Work counters (tests, diagnostics). */
  scans = 0
  rebuilds = 0

  constructor(F: number) {
    this.F = F
    this.B = Math.max(1, Math.ceil(F / BLOCKS_PER_CHUNK))
    this.nb = Math.ceil(F / this.B)
  }

  rawGet(id: string, c: number): Float64Array | undefined {
    const key = `${id}#${c}`
    const a = this.raw.get(key)
    if (a) { this.raw.delete(key); this.raw.set(key, a) }
    return a
  }

  rawSet(id: string, c: number, a: Float64Array) {
    const key = `${id}#${c}`
    this.raw.delete(key)
    this.raw.set(key, a)
    while (this.raw.size > RAW_CACHE) this.raw.delete(this.raw.keys().next().value!)
  }
}

const caches = new WeakMap<object, LodCache>()

/** Frames per chunk of a recording (its store's chunks, else 1 s of frames). */
export function chunkFramesOf(rec: Recording): number {
  return rec.frames.chunkFrames ?? Math.max(1, Math.round(1 / rec.dt))
}

function cacheOf(rec: Recording): LodCache {
  let c = caches.get(rec.frames)
  if (!c) { c = new LodCache(chunkFramesOf(rec)); caches.set(rec.frames, c) }
  return c
}

/** Work counters of a recording's cache: chunks scanned and recomputed so far. */
export function lodCounters(rec: Recording): { scans: number; rebuilds: number } {
  const c = cacheOf(rec)
  return { scans: c.scans, rebuilds: c.rebuilds }
}

/** State component of a quantity id that is read straight from the state (body kinematics, pair ledger), or −1. */
export function stateComponent(sys: System, id: string): number {
  const dot = id.lastIndexOf('.')
  const head = id.slice(0, dot), q = id.slice(dot + 1)
  const n = sys.n
  if (head.startsWith('pair.')) {
    const [a, b] = head.slice(5).split('|')
    const pair = sys.pairByKey.get(pairKey(a, b))
    if (!pair) return -1
    const base = sys.auxBase + AUX_FIXED + 2 * pair.index
    return q === 'slide' ? base : q === 'heat' ? base + 1 : -1
  }
  const body = sys.model.byId.get(head)
  if (!body || !body.dynamic) return -1
  const i = body.index
  switch (q) {
    case 'x': return 3 * i
    case 'y': return 3 * i + 1
    case 'angle': return 3 * i + 2
    case 'vx': return 3 * n + 3 * i
    case 'vy': return 3 * n + 3 * i + 1
    case 'omega': return 3 * n + 3 * i + 2
  }
  return -1
}

function quantityOf(rec: Recording, lod: LodCache, id: string): QuantityLod {
  let q = lod.quantities.get(id)
  if (!q) { q = { id, component: stateComponent(rec.system, id), chunks: [], starts: new Map() }; lod.quantities.set(id, q) }
  return q
}

/** Summary of closed chunk c (min, max, first, last of every state component), when the store keeps them. */
function summaryOf(rec: Recording, c: number): Float64Array | null {
  const s = (rec.frames as { summary?: (c: number) => Float64Array | null }).summary
  return s ? s.call(rec.frames, c) : null
}

/** Frames of chunk c in the recording. */
function availIn(rec: Recording, lod: LodCache, c: number): number {
  return Math.max(0, Math.min(lod.F, rec.frameCount - c * lod.F))
}

/** Are the frames of chunk c in memory (reading them recomputes nothing)? */
function resident(rec: Recording, lod: LodCache, c: number): boolean {
  const n = availIn(rec, lod, c)
  if (n === 0) return false
  return frameIsCheap(rec, c * lod.F + (n > 1 ? 1 : 0))
}

/**
 * Scan chunk c for the given quantities: evaluate the frames not scanned yet (all of them when the frame values of a
 * quantity are no longer cached) and update the block and chunk statistics.
 */
function scan(rec: Recording, lod: LodCache, c: number, qs: QuantityLod[]) {
  const F = lod.F, B = lod.B
  const first = c * F
  const avail = availIn(rec, lod, c)
  if (avail === 0 || !qs.length) return
  const from: number[] = []
  const arrays: Float64Array[] = []
  for (const q of qs) {
    const st = q.chunks[c]
    const raw = lod.rawGet(q.id, c)
    const f = st && raw ? Math.min(st.count, avail) : 0
    from.push(f)
    arrays.push(raw ?? new Float64Array(F))
  }
  const k0 = Math.min(...from)
  for (let j = k0; j < avail; j++) {
    const k = first + j
    let X: Float64Array | null = null
    let ctx: ReturnType<typeof makeContext> | null = null
    for (let i = 0; i < qs.length; i++) {
      if (j < from[i]) continue
      const q = qs[i]
      if (q.component >= 0) { X ??= frameState(rec, k); arrays[i][j] = X[q.component] }
      else { ctx ??= makeContext(rec, k); arrays[i][j] = evaluateQuantity(ctx, q.id) }
    }
  }
  for (let i = 0; i < qs.length; i++) {
    const q = qs[i], raw = arrays[i]
    lod.rawSet(q.id, c, raw)
    let st = q.chunks[c]
    if (!st || from[i] === 0) { st = { count: 0, blocks: new Float64Array(4 * lod.nb), min: Infinity, max: -Infinity, first: NaN, last: NaN }; q.chunks[c] = st }
    // Blocks touched by the new frames
    for (let b = Math.floor(from[i] / B); b * B < avail; b++) {
      const j0 = b * B, j1 = Math.min(avail, j0 + B)
      let lo = Infinity, hi = -Infinity
      for (let j = j0; j < j1; j++) { const v = raw[j]; if (v < lo) lo = v; if (v > hi) hi = v }
      st.blocks[4 * b] = lo; st.blocks[4 * b + 1] = hi; st.blocks[4 * b + 2] = raw[j0]; st.blocks[4 * b + 3] = raw[j1 - 1]
    }
    let lo = Infinity, hi = -Infinity
    const nbUsed = Math.ceil(avail / B)
    for (let b = 0; b < nbUsed; b++) { if (st.blocks[4 * b] < lo) lo = st.blocks[4 * b]; if (st.blocks[4 * b + 1] > hi) hi = st.blocks[4 * b + 1] }
    st.min = lo; st.max = hi; st.first = raw[0]; st.last = raw[avail - 1]
    st.count = avail
  }
  lod.scans++
}

/** What `chartEnvelope` computes. */
export interface EnvelopeRequest {
  /** Quantity ids. */
  ids: string[]
  /** Frame window [k0, k1] (clipped to the recording). */
  k0: number
  k1: number
  /** Pixel columns. */
  columns: number
  /** Time for scanning chunks in this call (ms; default 12). */
  budgetMs?: number
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

/** Min/max envelope of `ids` over a frame window (see the module header). */
export function chartEnvelope(rec: Recording, req: EnvelopeRequest): Envelope {
  const lod = cacheOf(rec)
  const F = lod.F, B = lod.B, nb = lod.nb
  const last = rec.frameCount - 1
  const k0 = Math.max(0, Math.min(last, Math.floor(req.k0)))
  const k1 = Math.max(k0, Math.min(last, Math.floor(req.k1)))
  const qs = [...new Set(req.ids)].map(id => quantityOf(rec, lod, id))
  let level = req.level ?? chooseLevel(k1 - k0 + 1, req.columns, F)
  // The frame level keeps every frame value of the window: blocks when that would overflow the cache
  if (!req.level && level === 'frame' && (Math.floor(k1 / F) - Math.floor(k0 / F) + 1) * qs.length > RAW_CACHE / 2) level = 'block'
  const deadline = performance.now() + (req.budgetMs ?? 12)

  // Units of the level: frames, blocks (global index c·nb + b) or chunks
  const blockOf = (k: number) => { const c = Math.floor(k / F); return c * nb + Math.floor((k - c * F) / B) }
  const u0 = level === 'frame' ? k0 : level === 'block' ? blockOf(k0) : Math.floor(k0 / F)
  const u1 = level === 'frame' ? k1 : level === 'block' ? blockOf(k1) : Math.floor(k1 / F)
  const unitFirst = (u: number) => (level === 'frame' ? u : level === 'block' ? Math.floor(u / nb) * F + (u % nb) * B : u * F)
  const unitLast = (u: number) => Math.min(last, level === 'frame' ? u : level === 'block' ? Math.min(Math.floor(u / nb) * F + F, unitFirst(u) + B) - 1 : u * F + F - 1)
  const U = u1 - u0 + 1
  const C = Math.max(1, Math.min(Math.floor(req.columns), U))
  const colStart = (j: number) => u0 + Math.floor((j * U) / C)

  // Chunks the view needs, and which quantities must be scanned in each
  const c0 = Math.floor(unitFirst(u0) / F), c1 = Math.floor(unitLast(u1) / F)
  const known = (q: QuantityLod, c: number): boolean => {
    if (level === 'chunk' && q.component >= 0 && summaryOf(rec, c)) return true
    const st = q.chunks[c]
    if (!st || st.count < availIn(rec, lod, c)) return false
    return level !== 'frame' || !!lod.raw.has(`${q.id}#${c}`)
  }
  const evicted: number[] = []
  const work: Array<{ c: number; qs: QuantityLod[] }> = []
  for (let c = c1; c >= c0; c--) {
    const need = qs.filter(q => !known(q, c))
    if (!need.length) continue
    if (resident(rec, lod, c)) work.push({ c, qs: need })
    else if (!lod.failed.has(c)) evicted.push(c)
  }
  // Scan chunks in memory, newest first, within the budget (at least one per call)
  let scanned = 0
  for (const w of work) {
    if (scanned > 0 && performance.now() > deadline) break
    scan(rec, lod, w.c, w.qs)
    scanned++
  }
  // Evicted chunks in view are recomputed off this thread when the store can (26.51): they arrive later and are
  // scanned in a following call; meanwhile the columns stay pending
  if (rec.frames.prefetch) {
    let asked = 0
    for (let i = 0; i < evicted.length && asked < 4; i++) if (rec.frames.prefetch(evicted[i])) { evicted.splice(i--, 1); asked++ }
  }
  // Recompute one evicted chunk here (the stream verifies it against its digest) and scan it
  if (req.rebuild && evicted.length) {
    const c = evicted.shift()!
    try {
      frameState(rec, c * F + Math.min(1, availIn(rec, lod, c) - 1))
      lod.rebuilds++
      scan(rec, lod, c, qs.filter(q => !known(q, c)))
    } catch {
      lod.failed.add(c)
    }
  }
  // Stand-ins: the value at the start of each chunk that is still unknown (a little time beyond the budget)
  stand: for (let c = c0; c <= c1; c++) {
    const startK = c * F
    if (startK > last) break
    for (const q of qs) {
      if (known(q, c) || q.starts.has(c) || !frameIsCheap(rec, startK)) continue
      if (performance.now() > deadline + 4) break stand
      const v = q.component >= 0 ? frameState(rec, startK)[q.component] : evaluateQuantity(makeContext(rec, startK), q.id)
      q.starts.set(c, v)
    }
  }

  // Columns
  const colFirst = new Int32Array(C), colLast = new Int32Array(C)
  for (let j = 0; j < C; j++) { colFirst[j] = unitFirst(colStart(j)); colLast[j] = unitLast(colStart(j + 1) - 1) }
  const stats = new Map<string, ColumnStats>()
  let pending = false
  for (const q of qs) {
    const s: ColumnStats = { min: new Float64Array(C), max: new Float64Array(C), first: new Float64Array(C), last: new Float64Array(C), state: new Uint8Array(C) }
    for (let j = 0; j < C; j++) {
      let lo = Infinity, hi = -Infinity, fst = NaN, lst = NaN, any = false, missing = false
      for (let u = colStart(j); u < colStart(j + 1); u++) {
        const r = unitStats(rec, lod, q, level, u)
        if (!r) { missing = true; continue }
        if (!any) fst = r[2]
        any = true
        if (r[0] < lo) lo = r[0]
        if (r[1] > hi) hi = r[1]
        lst = r[3]
      }
      if (any && !missing) { s.min[j] = lo; s.max[j] = hi; s.first[j] = fst; s.last[j] = lst; continue }
      pending = true
      // Stand-in: the start value of a chunk that begins inside the column
      let stand = NaN
      const ca = Math.ceil(colFirst[j] / F), cb = Math.floor(colLast[j] / F)
      for (let c = ca; c <= cb && Number.isNaN(stand); c++) { const v = q.starts.get(c); if (v !== undefined) stand = v }
      if (any) { s.min[j] = Math.min(lo, Number.isFinite(stand) ? stand : lo); s.max[j] = Math.max(hi, Number.isFinite(stand) ? stand : hi); s.first[j] = fst; s.last[j] = lst; s.state[j] = 1 }
      else if (!Number.isNaN(stand)) { s.min[j] = s.max[j] = s.first[j] = s.last[j] = stand; s.state[j] = 1 }
      else { s.min[j] = s.max[j] = s.first[j] = s.last[j] = NaN; s.state[j] = 2 }
    }
    stats.set(q.id, s)
  }
  return { level, unit: level === 'frame' ? 1 : level === 'block' ? B : F, colFirst, colLast, stats, pending, evicted, dt: rec.dt }
}

const unitOut = new Float64Array(4)

/** [min, max, first, last] of unit u of quantity q, or null when it is not known. */
function unitStats(rec: Recording, lod: LodCache, q: QuantityLod, level: LodLevel, u: number): Float64Array | null {
  const F = lod.F, B = lod.B, nb = lod.nb
  if (level === 'chunk') {
    const st = q.chunks[u]
    if (st && st.count >= availIn(rec, lod, u)) { unitOut[0] = st.min; unitOut[1] = st.max; unitOut[2] = st.first; unitOut[3] = st.last; return unitOut }
    if (q.component >= 0) {
      const sm = summaryOf(rec, u)
      if (sm) {
        const N = sm.length / 4, i = q.component
        unitOut[0] = sm[i]; unitOut[1] = sm[N + i]; unitOut[2] = sm[2 * N + i]; unitOut[3] = sm[3 * N + i]
        return unitOut
      }
    }
    return null
  }
  if (level === 'block') {
    const c = Math.floor(u / nb), b = u % nb
    const st = q.chunks[c]
    if (!st || st.count < Math.min(availIn(rec, lod, c), b * B + B)) return null
    unitOut.set(st.blocks.subarray(4 * b, 4 * b + 4))
    return unitOut
  }
  const c = Math.floor(u / F)
  const raw = lod.raw.get(`${q.id}#${c}`)
  const st = q.chunks[c]
  if (!raw || !st || st.count <= u - c * F) return null
  const v = raw[u - c * F]
  const finite = Number.isFinite(v)
  unitOut[0] = finite ? v : Infinity
  unitOut[1] = finite ? v : -Infinity
  unitOut[2] = unitOut[3] = v
  return unitOut
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
