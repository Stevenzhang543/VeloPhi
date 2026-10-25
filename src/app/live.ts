/**
 * Live data for panels without wasted work: a gate that follows a reactive source only while the panel is
 * visible, and a per-run cache of quantity time series shared by the charts and the dashboard sparklines.
 *
 * An unbounded recording (decision D26) has no fixed length: its series are taken over a window — by default the
 * recent seconds around the playhead, or an overview sampled at the chunk starts, which never needs a chunk to be
 * recomputed.
 *
 * Panels on hidden pages or hidden tabs stay mounted (instant switching) but must not recompute on every
 * frame; `useGated` freezes their inputs while hidden and catches up once when shown again.
 */
import { computed, inject, shallowRef, watchEffect } from 'vue'
import type { InjectionKey, Ref } from 'vue'
import type { Recording } from '../core/solver/simulation'
import { frameIsCheap } from '../core/solver/simulation'
import { evaluateQuantity, makeContext } from '../core/observe/quantities'

/** Provided by each page: true while the page is the one shown. */
export const PAGE_ACTIVE: InjectionKey<Ref<boolean>> = Symbol('verity.pageActive')

/**
 * Whether the page containing the calling component is shown. Components on hidden pages stay mounted and keep
 * their size, so anything that renders per frame (canvases) should skip its work while this is false and catch
 * up once when it turns true.
 */
export function usePageActive(): Ref<boolean> {
  return inject(PAGE_ACTIVE, null) ?? computed(() => true)
}

/** A ref that follows `source()` while `active()` is true and keeps its last value otherwise. */
export function useGated<T>(active: () => boolean, source: () => T): Ref<T> {
  const r = shallowRef(source()) as Ref<T>
  watchEffect(() => { if (active()) r.value = source() })
  return r
}

/** Largest number of samples kept per series (charts and sparklines; readouts use exact frames). */
const MAX_SAMPLES = 4000

interface RunSeries {
  runId: number
  dt: number
  stride: number
  /** Samples available for every series listed in `filled` up to its count. */
  t: Float64Array
  values: Map<string, Float64Array>
  filled: Map<string, number>
}

let cache: RunSeries | null = null

/** Series of one run, as returned by seriesFor. */
export interface SeriesView {
  /** Sample times (s, SI). */
  t: Float64Array
  /** Values (SI) per quantity id, same length as `t`. */
  get(id: string): Float64Array
  /** Recorded frames per sample. */
  stride: number
  /** Samples of the complete recording (more than `t.length` while a run is still computing). */
  total: number
  /** Frame of the first sample (0 unless the series is a window). */
  from: number
}

/** Span of the recent window of an unbounded run's charts (s). */
export const RECENT_SPAN = 10
/** Most samples of a windowed series. */
const WINDOW_SAMPLES = 1500

/** A time window of a series (s). */
export interface SeriesWindow { t0: number; t1: number }

/**
 * The recent window around playback time t: `span` seconds ending a quarter span or more after t (the end moves in
 * steps of a quarter span, so the window does not change every frame), clipped to the computed range.
 */
export function recentWindow(rec: Recording, t: number, span = RECENT_SPAN): SeriesWindow {
  const tEnd = (rec.frameCount - 1) * rec.dt
  const step = span / 4
  const t1 = Math.min(tEnd, Math.max(span, Math.ceil((t + step) / step) * step))
  return { t0: Math.max(0, t1 - span), t1 }
}

interface WindowCache { key: string; t: Float64Array; values: Map<string, Float64Array>; stride: number; from: number }
let windowCache: WindowCache | null = null

/** Series (SI) of the frames inside a window (cached for the current window and run). */
export function seriesWindow(rec: Recording, runId: number, ids: string[], w: SeriesWindow): SeriesView {
  const k0 = Math.max(0, Math.ceil(w.t0 / rec.dt - 1e-9)), k1 = Math.max(k0, Math.min(rec.frameCount - 1, Math.floor(w.t1 / rec.dt + 1e-9)))
  const stride = Math.max(1, Math.ceil((k1 - k0 + 1) / WINDOW_SAMPLES))
  const key = `${runId}|${k0}|${k1}|${stride}`
  if (!windowCache || windowCache.key !== key) {
    const n = Math.floor((k1 - k0) / stride) + 1
    const t = new Float64Array(n)
    for (let i = 0; i < n; i++) t[i] = (k0 + i * stride) * rec.dt
    windowCache = { key, t, values: new Map(), stride, from: k0 }
  }
  const c = windowCache
  const todo = [...new Set(ids)].filter(id => !c.values.has(id))
  if (todo.length) {
    const arrs = todo.map(id => { const a = new Float64Array(c.t.length); c.values.set(id, a); return a })
    for (let i = 0; i < c.t.length; i++) {
      const ctx = makeContext(rec, k0 + i * stride)
      todo.forEach((id, j) => { arrs[j][i] = evaluateQuantity(ctx, id) })
    }
  }
  return { t: c.t, get: (id: string) => c.values.get(id) ?? new Float64Array(c.t.length), stride: c.stride, total: c.t.length, from: c.from }
}

/** Values of the overview samples by quantity and frame (frames never change once computed). */
let overview: { runId: number; values: Map<string, Map<number, number>> } | null = null

/**
 * Overview of a whole (long) recording: one sample per chunk start — the state there is the chunk's checkpoint,
 * always in memory — plus the last frame; at most WINDOW_SAMPLES samples (chunks are skipped evenly beyond).
 */
export function seriesOverview(rec: Recording, runId: number, ids: string[]): SeriesView {
  const F = rec.frames.chunkFrames ?? Math.max(1, Math.round(1 / rec.dt))
  const chunks = Math.floor((rec.frameCount - 1) / F) + 1
  const step = Math.max(1, Math.ceil(chunks / WINDOW_SAMPLES)) * F
  const ks: number[] = []
  for (let k = 0; k < rec.frameCount; k += step) if (frameIsCheap(rec, k)) ks.push(k)
  if (ks[ks.length - 1] !== rec.frameCount - 1) ks.push(rec.frameCount - 1)
  if (!overview || overview.runId !== runId) overview = { runId, values: new Map() }
  const cache = overview.values
  const list = [...new Set(ids)]
  const maps = list.map(id => { let m = cache.get(id); if (!m) { m = new Map(); cache.set(id, m) } return m })
  const arrays = list.map(() => new Float64Array(ks.length))
  ks.forEach((k, i) => {
    let ctx: ReturnType<typeof makeContext> | null = null
    list.forEach((id, j) => {
      let v = maps[j].get(k)
      if (v === undefined) { ctx ??= makeContext(rec, k); v = evaluateQuantity(ctx, id); maps[j].set(k, v) }
      arrays[j][i] = v
    })
  })
  const byId = new Map(list.map((id, j) => [id, arrays[j]]))
  return { t: Float64Array.from(ks, k => k * rec.dt), get: (id: string) => byId.get(id) ?? new Float64Array(ks.length), stride: step, total: ks.length, from: 0 }
}

/**
 * Time series (SI) of the given quantities for the recording of run `runId`. Computed once per run; partial
 * recordings of the same run only add the new frames. One observation context per frame is shared by all ids.
 */
export function seriesFor(rec: Recording, runId: number, ids: string[]): SeriesView {
  const duration = rec.scene.settings.duration
  const expected = Math.max(rec.frameCount, duration === null ? rec.frameCount : Math.round(duration / rec.dt) + 1)
  if (!cache || cache.runId !== runId || cache.dt !== rec.dt) {
    const stride = Math.max(1, Math.ceil(expected / MAX_SAMPLES))
    cache = { runId, dt: rec.dt, stride, t: new Float64Array(0), values: new Map(), filled: new Map() }
  }
  const c = cache
  const available = Math.floor((rec.frameCount - 1) / c.stride) + 1
  const capacity = Math.max(available, Math.floor((expected - 1) / c.stride) + 1)
  if (c.t.length < capacity) {
    const t = new Float64Array(capacity)
    for (let i = 0; i < capacity; i++) t[i] = i * c.stride * rec.dt
    c.t = t
    for (const [id, v] of c.values) { const nv = new Float64Array(capacity); nv.set(v.subarray(0, Math.min(v.length, capacity))); c.values.set(id, nv) }
  }
  const todo: Array<{ id: string; from: number; arr: Float64Array }> = []
  for (const id of new Set(ids)) {
    let arr = c.values.get(id)
    if (!arr) { arr = new Float64Array(c.t.length); c.values.set(id, arr); c.filled.set(id, 0) }
    const from = c.filled.get(id) ?? 0
    if (from < available) todo.push({ id, from, arr })
  }
  if (todo.length) {
    const start = Math.min(...todo.map(x => x.from))
    for (let i = start; i < available; i++) {
      const ctx = makeContext(rec, i * c.stride)
      for (const x of todo) if (i >= x.from) x.arr[i] = evaluateQuantity(ctx, x.id)
    }
    for (const x of todo) c.filled.set(x.id, available)
  }
  return {
    t: c.t.subarray(0, available),
    get: (id: string) => (c.values.get(id) ?? new Float64Array(c.t.length)).subarray(0, available),
    stride: c.stride,
    total: c.t.length,
    from: 0
  }
}

/** Min/max envelope of a series in `buckets` columns, as an SVG path in a w × h box (y up). */
export function sparkPath(values: Float64Array, total: number, w: number, h: number, buckets = 160): { d: string; min: number; max: number } {
  const n = values.length
  let min = Infinity, max = -Infinity
  for (let i = 0; i < n; i++) { const v = values[i]; if (Number.isFinite(v)) { if (v < min) min = v; if (v > max) max = v } }
  if (!Number.isFinite(min)) return { d: '', min: 0, max: 0 }
  const span = max - min
  const flat = span <= Math.max(Math.abs(max), Math.abs(min)) * 1e-9
  const y = (v: number) => (flat ? h / 2 : h - 1 - ((v - min) / span) * (h - 2))
  const cols = Math.min(buckets, n)
  const totalN = Math.max(n, total)
  let d = ''
  for (let b = 0; b < cols; b++) {
    const i0 = Math.floor((b * n) / cols), i1 = Math.max(i0 + 1, Math.floor(((b + 1) * n) / cols))
    let lo = Infinity, hi = -Infinity
    for (let i = i0; i < i1; i++) { const v = values[i]; if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v } }
    if (!Number.isFinite(lo)) continue
    const x = ((i0 + i1 - 1) / 2 / Math.max(1, totalN - 1)) * w
    d += `${d ? 'L' : 'M'}${x.toFixed(2)} ${y(hi).toFixed(2)}`
    if (hi !== lo) d += `L${x.toFixed(2)} ${y(lo).toFixed(2)}`
  }
  return { d, min, max }
}
