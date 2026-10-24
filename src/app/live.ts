/**
 * Live data for panels without wasted work: a gate that follows a reactive source only while the panel is
 * visible, and a per-run cache of quantity time series shared by the charts and the dashboard sparklines.
 *
 * Panels on hidden pages or hidden tabs stay mounted (instant switching) but must not recompute on every
 * frame; `useGated` freezes their inputs while hidden and catches up once when shown again.
 */
import { computed, inject, shallowRef, watchEffect } from 'vue'
import type { InjectionKey, Ref } from 'vue'
import type { Recording } from '../core/solver/simulation'
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
}

/**
 * Time series (SI) of the given quantities for the recording of run `runId`. Computed once per run; partial
 * recordings of the same run only add the new frames. One observation context per frame is shared by all ids.
 */
export function seriesFor(rec: Recording, runId: number, ids: string[]): SeriesView {
  const expected = Math.max(rec.frameCount, Math.round(rec.scene.settings.duration / rec.dt) + 1)
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
    total: c.t.length
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
