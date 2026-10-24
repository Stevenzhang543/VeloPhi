<script setup lang="ts">
/**
 * Time-series charts (uPlot) of the quantities in `state.chart`, one chart per unit. Values are shown in the
 * display units of the settings. Data comes from the per-run series cache (computed once per recording; a
 * growing partial recording only adds frames), and the charts are rebuilt only when the selection, the run,
 * the units or the theme change. During playback only a DOM cursor moves (no canvas redraw per frame).
 * `active` = false (hidden tab or page) defers all work until the panel is shown again.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { state, seekTime, pause } from '../store'
import { canonicalQuantityId, listQuantities } from '../../core/observe/quantities'
import type { QuantityDef } from '../../core/observe/quantities'
import { formatSig } from '../../units/units'
import { fromDisp, toDisp, unitLabel } from '../settings'
import { seriesFor, useGated } from '../live'
import type { SeriesView } from '../live'

const props = withDefaults(defineProps<{ active?: boolean; limit?: number; variant?: 'studio' | 'monitor' }>(), { active: true, limit: 8, variant: 'studio' })

const host = ref<HTMLDivElement | null>(null)
interface Plot { plot: uPlot; ids: string[]; unit: string; cursor: HTMLDivElement }
let plots: Plot[] = []
let built = { key: '', runId: -1, n: -1, w: 0, h: 0 }

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
const buildKey = computed(() => JSON.stringify([groups.value.map(([u, l]) => [unitLabel(u), l.map(q => q.id)]), unitLabel('s'), state.theme, state.digits, props.variant]))

function cssVar(name: string) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888' }

function destroy() {
  for (const p of plots) p.plot.destroy()
  plots = []
  host.value?.replaceChildren()
  built = { key: '', runId: -1, n: -1, w: 0, h: 0 }
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

function dataFor(s: SeriesView, ids: string[], unit: string): uPlot.AlignedData {
  const ft = toDisp(1, 's'), fv = toDisp(1, unit)
  const t = Array.from(s.t, v => v * ft)
  return [t, ...ids.map(id => Array.from(s.get(id), v => (Number.isFinite(v) ? v * fv : null)))] as uPlot.AlignedData
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
  const eventTimes = r.events.filter(e => e.changes.length > 0).map(e => e.t * ft)
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
      cursor: { drag: { x: false, y: false } },
      axes: [
        { stroke: axisColor, grid: { stroke: gridColor, width: 1 }, ticks: { stroke: gridColor }, label: tLabel, labelSize: 14, size: 34, font: '11px sans-serif', labelFont: '11px sans-serif' },
        { stroke: axisColor, grid: { stroke: gridColor, width: 1 }, ticks: { stroke: gridColor }, label: unitLabel(unit) || '1', labelSize: 14, size: 56, font: '11px sans-serif', labelFont: '11px sans-serif' }
      ],
      series: [
        { label: 't', value: (_u, v) => (v == null ? '—' : formatSig(v, 6)) },
        ...list.map(q => ({ label: `${q.owner} ${q.label}`, stroke: palette[colorIndex++ % palette.length], width: 1.6, value: (_u: uPlot, v: number | null) => (v == null ? '—' : formatSig(v, digits)) }))
      ],
      hooks: {
        draw: [u => {
          // Event times as dashed lines (static; drawn only when the chart itself redraws)
          const ctx = u.ctx
          ctx.save()
          ctx.strokeStyle = warn
          ctx.setLineDash([3 * devicePixelRatio, 3 * devicePixelRatio])
          ctx.lineWidth = devicePixelRatio
          for (const et of eventTimes) {
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
    plot.over.addEventListener('click', () => {
      const x = plot.cursor.left
      if (x === undefined || x < 0) return
      pause()
      seekTime(fromDisp(plot.posToVal(x, 'x'), 's'))
    })
    plots.push({ plot, ids, unit, cursor })
  }
  built = { key: buildKey.value, runId: state.runId, n: s.t.length, w, h }
  placeCursor()
}

/** Bring the charts up to date (build, add new frames, or resize). */
function sync() {
  const r = rec.value, el = host.value
  if (!props.active || !el) return
  if (!r || groups.value.length === 0) { if (plots.length) destroy(); return }
  if (el.clientWidth === 0 || el.clientHeight === 0) return
  const ids = groups.value.flatMap(([, list]) => list.map(q => q.id))
  const s = seriesFor(r, state.runId, ids)
  if (plots.length && built.key === buildKey.value && built.runId === state.runId) {
    if (s.t.length !== built.n) {
      for (const p of plots) p.plot.setData(dataFor(s, p.ids, p.unit))
      built.n = s.t.length
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
  const td = toDisp(tCursor.value, 's')
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
watch([rec, buildKey, () => state.runId, () => props.active], () => nextTick(schedule))
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
      <span class="small muted">曲线：</span>
      <button class="btn small" :disabled="!rec" @click="preset('kin')">x‑t / v‑t / a‑t</button>
      <button class="btn small" :disabled="!rec" @click="preset('energy')">能量</button>
      <button class="btn small" :disabled="!rec" @click="preset('force')">受力</button>
      <button class="btn small ghost" :disabled="!state.chart.length" @click="state.chart = []">清空</button>
      <span v-if="variant === 'studio'" class="tiny muted hint">（在“监视”页点图表按钮可加入任意量；点击曲线跳到该时刻；虚线为事件时刻）</span>
      <span v-else-if="groups.length >= limit" class="tiny muted hint">最多显示 {{ limit }} 张图</span>
    </div>
    <div v-if="!rec" class="empty">运行仿真后显示曲线。</div>
    <div v-else-if="!groups.length" class="empty">选择上方的预设或在“监视”页添加曲线。</div>
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
