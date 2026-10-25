<script setup lang="ts">
/**
 * Time-series charts (uPlot) of the quantities in `state.chart`, one chart per unit. Values are shown in the
 * display units of the settings. Data comes from the per-run series cache (computed once per recording; a
 * growing partial recording only adds frames), and the charts are rebuilt only when the selection, the run,
 * the units or the theme change. During playback only a DOM cursor moves (no canvas redraw per frame).
 * `active` = false (hidden tab or page) defers all work until the panel is shown again.
 *
 * Long runs (decision D32): an unbounded run shows the recent seconds around the playhead (default) or the whole
 * run; the whole run, and any bounded run longer than LONG_FRAMES frames, is drawn as a per-pixel-column min/max
 * envelope (render/chartLod.ts) built from chunk summaries and cached chunk scans, so a redraw never iterates all
 * frames. Dragging across a chart zooms into that time span (the envelope is recomputed at the finer level, down to
 * single frames); double-click returns to the whole run. Chunks that are not in memory are filled in afterwards,
 * one per pass, without blocking the interface.
 *
 * Branches (26.51, D52): the time axis shows the clock of the scene on screen (a branch starts at its branch
 * point), and while a branch is shown its parent's curves of the same quantities can be overlaid (dashed), so
 * "what changed after the branch point" is visible at a glance.
 */
import { tl } from '../../i18n'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { state, seekTime, pause } from '../store'
import { canonicalQuantityId, evaluateQuantity, listQuantities, makeContext } from '../../core/observe/quantities'
import type { Recording } from '../../core/solver/simulation'
import { parentRecording } from '../branches'
import type { QuantityDef } from '../../core/observe/quantities'
import { formatSig } from '../../units/units'
import { fromDisp, toDisp, unitLabel } from '../settings'
import { RECENT_SPAN, recentWindow, seriesFor, seriesWindow, useGated } from '../live'
import { chartEnvelope, envelopePlot } from '../../render/chartLod'
import type { SeriesView } from '../live'

const props = withDefaults(defineProps<{ active?: boolean; limit?: number; variant?: 'studio' | 'monitor' }>(), { active: true, limit: 8, variant: 'studio' })

const host = ref<HTMLDivElement | null>(null)
interface Plot { plot: uPlot; ids: string[]; unit: string; cursor: HTMLDivElement }
let plots: Plot[] = []
let built = { key: '', runId: -1, n: '', w: 0, h: 0 }
/** The last pointer gesture was a drag (zoom), not a click (seek). */
let dragged = false

/** What an unbounded run's charts show: the recent window around the playhead, or the whole run (overview). */
const longMode = ref<'recent' | 'all'>('recent')
/** Identity of the data of a series (length, time range, envelope version): new data means setData. */
const dataSig = (s: SeriesView) => `${s.t.length}|${s.t[0]}|${s.t[s.t.length - 1]}|${(s as EnvSeries).version ?? ''}`

/** A bounded run longer than this many frames is drawn as an envelope too. */
const LONG_FRAMES = 20000
/** Zoomed time span of the envelope view (s); null: the whole run. */
const zoom = ref<{ t0: number; t1: number } | null>(null)
/** An envelope as a series: four points per pixel column (first, extremes, last); `pending`: parts still unknown. */
interface EnvSeries extends SeriesView { pending: boolean; version: number }
let envVersion = 0
let envPasses = 0

/** Envelope series of `ids` over [t0, t1] (whole run when no zoom) for a plot `columns` pixels wide. */
function envelopeSeries(r: NonNullable<typeof rec.value>, ids: string[], columns: number): EnvSeries {
  const last = r.frameCount - 1
  const k0 = zoom.value ? Math.max(0, Math.floor(zoom.value.t0 / r.dt)) : 0
  const k1 = zoom.value ? Math.min(last, Math.ceil(zoom.value.t1 / r.dt)) : last
  // Every few passes also recompute one chunk that is not in memory (the stream verifies it)
  const env = chartEnvelope(r, { ids, k0, k1, columns: Math.max(32, columns), rebuild: envPasses++ % 2 === 1, budgetMs: 40 })
  const plot = envelopePlot(env)
  const values = new Map<string, Float64Array>()
  for (const id of ids) {
    const v = plot.values.get(id) ?? []
    const a = new Float64Array(plot.t.length)
    for (let i = 0; i < a.length; i++) { const x = v[i]; a[i] = typeof x === 'number' ? x : NaN }
    values.set(id, a)
  }
  envVersion++
  return { t: plot.t, get: id => values.get(id) ?? new Float64Array(plot.t.length), stride: env.unit, total: plot.t.length, from: k0, pending: env.pending, version: envVersion }
}

/** Does this recording use the envelope view? */
function envelopeMode(r: NonNullable<typeof rec.value>): boolean {
  return r.unbounded ? longMode.value === 'all' : r.frameCount > LONG_FRAMES || zoom.value !== null
}

const rec = computed(() => (state.stale ? null : state.recording))
const system = computed(() => rec.value?.system ?? null)
const quantities = computed<Map<string, QuantityDef>>(() => new Map((system.value ? listQuantities(system.value) : []).map(q => [q.id, q])))

const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#4b5563']
const COLORS_DARK = ['#60a5fa', '#f87171', '#4ade80', '#fbbf24', '#a78bfa', '#22d3ee', '#f472b6', '#9ca3af']

/** Charts grouped by SI unit: quantities with the same unit share one chart. */
const groups = computed(() => {
  const m = new Map<string, QuantityDef[]>()
  const seen = new Set<string>()
  for (const id of state.chart) {
    const q = quantities.value.get(canonicalQuantityId(id))
    if (!q || seen.has(q.id)) continue
    seen.add(q.id)
    const list = m.get(q.unit) ?? []
    list.push(q); m.set(q.unit, list)
  }
  return [...m.entries()].slice(0, props.limit)
})

/** Everything that requires a rebuild (not just new data). */
const buildKey = computed(() => JSON.stringify([groups.value.map(([u, l]) => [unitLabel(u), l.map(q => q.id)]), unitLabel('s'), state.theme, state.digits, props.variant, state.branch, overlay.value, !!parentRec.value]))

function cssVar(name: string) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888' }

function destroy() {
  for (const p of plots) p.plot.destroy()
  plots = []
  host.value?.replaceChildren()
  built = { key: '', runId: -1, n: '', w: 0, h: 0 }
}

/** Plot size per chart for the host size. */
function layout(el: HTMLElement, count: number) {
  const width = el.clientWidth, height = el.clientHeight
  const legend = 46
  if (props.variant === 'monitor') {
    // A 2 × 2 grid only when there is room for two rows; otherwise one row (scrolls sideways when narrow)
    const twoRows = count > 2 && width / count < 300 && height >= 2 * (110 + legend) + 10
    el.classList.toggle('two-rows', twoRows)
    const cols = twoRows ? 2 : count
    const rows = Math.ceil(count / cols)
    return { w: Math.max(220, Math.floor((width - (cols - 1) * 10) / cols)), h: Math.max(80, Math.floor((height - (rows - 1) * 10) / rows) - legend) }
  }
  return { w: Math.max(240, Math.floor((width - (count - 1) * 8) / count)), h: Math.max(110, height - legend) }
}

/** Start time of the recording's scene: a branch's clock starts at its branch point (D52); charts show absolute time. */
const origin = computed(() => rec.value?.scene.settings.startTime ?? 0)

/** Overlay of the parent branch's curves (D52), on by default while a branch is shown. */
const overlay = ref(true)
const parentRec = computed<Recording | null>(() => (overlay.value && state.branch !== null && rec.value ? parentRecording() : null))
const parentIds = computed(() => new Set(parentRec.value ? listQuantities(parentRec.value.system).map(q => q.id) : []))
/** Most parent samples per curve (each needs a mode solution); the line spans the gaps. */
const OVERLAY_SAMPLES = 1500
const overlayCache = new Map<string, Array<number | null>>()
/** Values of the parent's quantity `id` at the chart's times (absolute time matched to the parent's frames). */
function overlayValues(s: SeriesView, id: string, fv: number): Array<number | null> {
  const p = parentRec.value!
  const key = `${state.runId}|${id}|${s.t.length}|${s.t[0]}|${s.t[s.t.length - 1]}|${fv}`
  const hit = overlayCache.get(key)
  if (hit) return hit
  const po = p.scene.settings.startTime ?? 0, o = origin.value
  const every = Math.max(1, Math.ceil(s.t.length / OVERLAY_SAMPLES))
  const out: Array<number | null> = new Array(s.t.length).fill(null)
  for (let i = 0; i < s.t.length; i += every) {
    const k = Math.round((s.t[i] + o - po) / p.dt)
    if (k < 0 || k >= p.frameCount) continue
    const v = evaluateQuantity(makeContext(p, k), id)
    out[i] = Number.isFinite(v) ? v * fv : null
  }
  if (overlayCache.size > 40) overlayCache.delete(overlayCache.keys().next().value!)
  overlayCache.set(key, out)
  return out
}

function dataFor(s: SeriesView, ids: string[], unit: string): uPlot.AlignedData {
  const ft = toDisp(1, 's'), fv = toDisp(1, unit)
  const o = origin.value
  const t = Array.from(s.t, v => (v + o) * ft)
  const extra = parentRec.value ? ids.filter(id => parentIds.value.has(id)).map(id => overlayValues(s, id, fv)) : []
  return [t, ...ids.map(id => Array.from(s.get(id), v => (Number.isFinite(v) ? v * fv : null))), ...extra] as uPlot.AlignedData
}

function build(s: SeriesView) {
  destroy()
  const r = rec.value!
  const el = host.value!
  const { w, h } = layout(el, groups.value.length)
  const axisColor = cssVar('--text-3'), gridColor = cssVar('--separator'), warn = cssVar('--warning')
  const palette = state.theme === 'dark' ? COLORS_DARK : COLORS
  const tLabel = `t / ${unitLabel('s')}`
  const ft = toDisp(1, 's')
  const o = origin.value
  const eventTimes = r.events.filter(e => e.changes.length > 0).map(e => (e.t + o) * ft)
  const digits = Math.min(8, state.digits)
  let colorIndex = 0
  for (const [unit, list] of groups.value) {
    const div = document.createElement('div')
    div.className = 'chart'
    el.appendChild(div)
    const ids = list.map(q => q.id)
    const opts: uPlot.Options = {
      width: w, height: h,
      scales: {
        x: { time: false },
        // A quantity that is constant to within 1e-6 of its size is drawn flat: round-off at the 1e-12 level must
        // not look like a physical change (e.g. a conserved angular momentum)
        y: { range: (_u, min, max) => { const mag = Math.max(Math.abs(min), Math.abs(max)); const span = Math.max(max - min, mag * 1e-6, 1e-12); const mid = (min + max) / 2; const half = span / 2 * 1.08 + (max - min < mag * 1e-6 ? Math.max(mag * 0.05, 1e-9) : 0); return [mid - half, mid + half] } }
      },
      legend: { show: true, live: true },
      cursor: { drag: { x: true, y: false, setScale: false } },
      axes: [
        { stroke: axisColor, grid: { stroke: gridColor, width: 1 }, ticks: { stroke: gridColor }, label: tLabel, labelSize: 14, size: 34, font: '11px sans-serif', labelFont: '11px sans-serif' },
        { stroke: axisColor, grid: { stroke: gridColor, width: 1 }, ticks: { stroke: gridColor }, label: unitLabel(unit) || '1', labelSize: 14, size: 56, font: '11px sans-serif', labelFont: '11px sans-serif' }
      ],
      series: [
        { label: 't', value: (_u, v) => (v == null ? '—' : formatSig(v, 6)) },
        ...list.map(q => ({ label: `${q.owner} ${q.label}`, stroke: palette[colorIndex++ % palette.length], width: 1.6, value: (_u: uPlot, v: number | null) => (v == null ? '—' : formatSig(v, digits)) })),
        // The parent branch's curves (dashed, same colours)
        ...(parentRec.value ? list.map((q, i) => ({ q, color: palette[(colorIndex - list.length + i) % palette.length] })).filter(x => parentIds.value.has(x.q.id)).map(({ q, color }) => ({ label: `${q.owner} ${q.label}${tl('（父分支）')}`, stroke: color, width: 1.2, dash: [6, 4], spanGaps: true, alpha: 0.75, value: (_u: uPlot, v: number | null) => (v == null ? '—' : formatSig(v, digits)) })) : [])
      ],
      hooks: {
        setSelect: [u => {
          // A drag across the chart zooms into that span (all charts); the envelope is recomputed for it
          if (u.select.width < 4) return
          const a = fromDisp(u.posToVal(u.select.left, 'x'), 's') - o, b = fromDisp(u.posToVal(u.select.left + u.select.width, 'x'), 's') - o
          u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false)
          dragged = true
          if (b - a > 2 * (rec.value?.dt ?? 0)) { zoom.value = { t0: a, t1: b }; schedule() }
        }],
        draw: [u => {
          // Event times as dashed lines (static; drawn only when the chart itself redraws)
          const ctx = u.ctx
          ctx.save()
          ctx.strokeStyle = warn
          ctx.setLineDash([3 * devicePixelRatio, 3 * devicePixelRatio])
          ctx.lineWidth = devicePixelRatio
          const xmin = u.scales.x.min ?? -Infinity, xmax = u.scales.x.max ?? Infinity
          for (const et of eventTimes) {
            if (et < xmin || et > xmax) continue
            const ex = u.valToPos(et, 'x', true)
            ctx.beginPath(); ctx.moveTo(ex, u.bbox.top); ctx.lineTo(ex, u.bbox.top + u.bbox.height); ctx.stroke()
          }
          ctx.restore()
          // uPlot lays out the plot area on its first draw: place the time cursor once it is known
          queueMicrotask(placeCursor)
        }]
      }
    }
    const plot = new uPlot(opts, dataFor(s, ids, unit), div)
    const cursor = document.createElement('div')
    cursor.className = 'time-cursor'
    plot.over.appendChild(cursor)
    plot.over.addEventListener('dblclick', () => { if (zoom.value) { zoom.value = null; schedule() } })
    plot.over.addEventListener('click', () => {
      if (dragged) { dragged = false; return }
      const x = plot.cursor.left
      if (x === undefined || x < 0) return
      pause()
      seekTime(fromDisp(plot.posToVal(x, 'x'), 's') - o)
    })
    plots.push({ plot, ids, unit, cursor })
  }
  built = { key: buildKey.value, runId: state.runId, n: dataSig(s), w, h }
  placeCursor()
}

/** Bring the charts up to date (build, add new frames, or resize). */
function sync() {
  const r = rec.value, el = host.value
  if (!props.active || !el) return
  if (!r || groups.value.length === 0) { if (plots.length) destroy(); return }
  if (el.clientWidth === 0 || el.clientHeight === 0) return
  const ids = groups.value.flatMap(([, list]) => list.map(q => q.id))
  const columns = Math.floor(layout(el, groups.value.length).w - 60)
  const s = envelopeMode(r) ? envelopeSeries(r, ids, columns) : !r.unbounded ? seriesFor(r, state.runId, ids) : seriesWindow(r, state.runId, ids, recentWindow(r, state.time))
  // Envelope parts still unknown (chunks being scanned or recomputed): another pass soon
  if ((s as EnvSeries).pending) setTimeout(schedule, 60)
  if (plots.length && built.key === buildKey.value && built.runId === state.runId) {
    if (dataSig(s) !== built.n) {
      for (const p of plots) p.plot.setData(dataFor(s, p.ids, p.unit))
      built.n = dataSig(s)
    }
    const { w, h } = layout(el, plots.length)
    if (w !== built.w || h !== built.h) { for (const p of plots) p.plot.setSize({ width: w, height: h }); built.w = w; built.h = h }
    placeCursor()
    return
  }
  build(s)
}

// Partial recordings arrive often while computing: add their frames at most a few times a second
let timer: ReturnType<typeof setTimeout> | null = null
let lastSync = 0
function schedule() {
  if (!props.active) return
  if (timer) return
  const wait = state.computing ? Math.max(0, 400 - (performance.now() - lastSync)) : 0
  timer = setTimeout(() => { timer = null; lastSync = performance.now(); sync() }, wait)
}

// Cursor: follows the continuous playback time, only while visible
const tCursor = useGated(() => props.active, () => state.time)
function placeCursor() {
  const r = rec.value
  const td = toDisp(tCursor.value + origin.value, 's')
  for (const p of plots) {
    const x = r ? p.plot.valToPos(td, 'x') : -1
    const inside = Number.isFinite(x) && x >= 0 && x <= p.plot.bbox.width / devicePixelRatio + 0.5
    p.cursor.style.transform = `translateX(${inside ? x : -10}px)`
    p.cursor.style.opacity = inside ? '1' : '0'
  }
}
watch(tCursor, placeCursor)

let ro: ResizeObserver | null = null
onMounted(() => {
  ro = new ResizeObserver(() => schedule())
  if (host.value) ro.observe(host.value)
  schedule()
})
/** The recent window of an unbounded run moves in steps: new data when it does. */
const windowKey = computed(() => {
  const r = rec.value
  if (!r || !r.unbounded || longMode.value !== 'recent') return ''
  const w = recentWindow(r, tCursor.value)
  return `${w.t0}|${w.t1}`
})
watch(() => state.runId, () => { zoom.value = null })
watch(longMode, () => { zoom.value = null })
watch([rec, buildKey, () => state.runId, () => props.active, windowKey, longMode], () => nextTick(schedule))
onBeforeUnmount(() => { ro?.disconnect(); if (timer) clearTimeout(timer); destroy() })

function preset(kind: 'kin' | 'energy' | 'force') {
  const r = rec.value
  if (!r) return
  const sel = state.selection?.kind === 'body' ? r.system.model.byId.get(state.selection.id) : null
  const body = sel && sel.dynamic ? sel : r.system.model.dynamic[0]
  if (kind === 'energy') state.chart = ['system.ek', 'system.ep', 'system.es', 'system.e', 'ledger.balance'].filter(id => quantities.value.has(id))
  else if (kind === 'kin' && body) state.chart = [`${body.id}.x`, `${body.id}.vx`, `${body.id}.ax`]
  else if (kind === 'force' && body) state.chart = [...quantities.value.values()].filter(q => q.id.startsWith(`contact.${body.id}|`) && (q.id.endsWith('.N') || q.id.endsWith('.f'))).map(q => q.id).concat(r.system.model.ropes.map(x => `${x.id}.T`))
}
</script>

<template>
  <div class="charts-wrap" :class="`variant-${variant}`">
    <div class="chart-bar">
      <span class="small muted">{{ tl('曲线：') }}</span>
      <button class="btn small" :disabled="!rec" @click="preset('kin')">x‑t / v‑t / a‑t</button>
      <button class="btn small" :disabled="!rec" @click="preset('energy')">{{ tl('能量') }}</button>
      <button class="btn small" :disabled="!rec" @click="preset('force')">{{ tl('受力') }}</button>
      <button class="btn small ghost" :disabled="!state.chart.length" @click="state.chart = []">{{ tl('清空') }}</button>
      <button v-if="state.branch !== null" class="btn small" :class="{ active: overlay }" :aria-pressed="overlay" :title="tl('在曲线中用虚线叠加父分支的同一物理量')" @click="overlay = !overlay">{{ tl('叠加父分支') }}</button>
      <button v-if="rec?.unbounded" class="btn small" :title="longMode === 'recent' ? tl('显示全程（每个像素列的最小/最大包络）') : tl('只显示播放位置附近的 {0} s（逐帧）', [RECENT_SPAN])" @click="longMode = longMode === 'recent' ? 'all' : 'recent'">{{ longMode === 'recent' ? tl('最近 {0} s', [RECENT_SPAN]) : tl('全程') }}</button>
      <button v-if="zoom" class="btn small" :title="tl('双击曲线也可恢复')" @click="zoom = null; schedule()">{{ `${toDisp(zoom.t0 + origin, 's').toPrecision(4)}–${toDisp(zoom.t1 + origin, 's').toPrecision(4)} ${unitLabel('s')}` }} ✕</button>
      <span v-if="variant === 'studio'" class="tiny muted hint">{{ tl('（在“监视”页点图表按钮可加入任意量；点击曲线跳到该时刻，拖动选择区间放大，双击还原；虚线为事件时刻）') }}</span>
      <span v-else-if="groups.length >= limit" class="tiny muted hint">{{ tl('最多显示 {0} 张图', [limit]) }}</span>
    </div>
    <div v-if="!rec" class="empty">{{ tl('运行仿真后显示曲线。') }}</div>
    <div v-else-if="!groups.length" class="empty">{{ tl('选择上方的预设或在“监视”页添加曲线。') }}</div>
    <div ref="host" class="charts" />
  </div>
</template>

<style scoped>
.charts-wrap { display: flex; flex-direction: column; height: 100%; min-height: 0; padding: 0 12px 8px; }
.chart-bar { display: flex; align-items: center; gap: 6px; padding: 4px 0 6px; flex-wrap: wrap; }
.chart-bar .btn { height: 24px; }
.hint { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1; }
.charts { flex: 1; min-height: 0; display: flex; gap: 8px; overflow-x: auto; overflow-y: hidden; }
.variant-monitor .charts { gap: 10px; align-content: flex-start; }
.variant-monitor .charts.two-rows { flex-wrap: wrap; overflow: hidden; }
:deep(.chart) { flex: 0 0 auto; }
:deep(.uplot) { font-family: var(--font-ui); color: var(--text-2); }
:deep(.u-legend) { font-size: var(--type-tiny); text-align: left; }
:deep(.u-legend .u-marker) { width: 10px; height: 3px; }
:deep(.u-over) { cursor: pointer; }
:deep(.time-cursor) { position: absolute; top: 0; bottom: 0; left: -1px; width: 2px; background: var(--accent); border-radius: 1px; pointer-events: none; will-change: transform; box-shadow: 0 0 6px var(--accent-soft); }
</style>
