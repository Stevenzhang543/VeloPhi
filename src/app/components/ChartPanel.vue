<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { state, seekTime, pause } from '../store'
import { listQuantities, quantitySeries } from '../../core/observe/quantities'
import type { QuantityDef } from '../../core/observe/quantities'

const host = ref<HTMLDivElement | null>(null)
let plots: uPlot[] = []

const rec = computed(() => (state.stale ? null : state.recording))
const quantities = computed<Map<string, QuantityDef>>(() => new Map((rec.value ? listQuantities(rec.value.system) : []).map(q => [q.id, q])))

const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#4b5563']

/** Charts grouped by unit: quantities with the same unit share one chart. */
const groups = computed(() => {
  const m = new Map<string, QuantityDef[]>()
  for (const id of state.chart) {
    const q = quantities.value.get(id)
    if (!q) continue
    const list = m.get(q.unit) ?? []
    list.push(q); m.set(q.unit, list)
  }
  return [...m.entries()]
})

function cssVar(name: string) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888' }

function build() {
  for (const p of plots) p.destroy()
  plots = []
  const r = rec.value
  const el = host.value
  if (el) el.replaceChildren()
  if (!r || !el) return
  const ids = groups.value.flatMap(([, list]) => list.map(q => q.id))
  if (ids.length === 0) return
  const stride = Math.max(1, Math.floor(r.frameCount / 4000))
  const data = quantitySeries(r, ids, 0, r.frameCount - 1, stride)
  const series = new Map(ids.map((id, i) => [id, data.values[i]]))
  const width = el.clientWidth
  const cols = groups.value.length
  const w = Math.max(240, Math.floor((width - (cols - 1) * 8) / cols))
  const h = Math.max(110, el.clientHeight - 44)
  const axisColor = cssVar('--text-3'), gridColor = cssVar('--separator')
  let colorIndex = 0
  groups.value.forEach(([unit, list]) => {
    const div = document.createElement('div')
    div.className = 'chart'
    el.appendChild(div)
    const opts: uPlot.Options = {
      width: w, height: h,
      scales: {
        x: { time: false },
        // a quantity that is constant to within 1e-6 of its size is drawn flat: round-off at the 1e-12
        // level must not look like a physical change (e.g. a conserved angular momentum)
        y: { range: (_u, min, max) => { const mag = Math.max(Math.abs(min), Math.abs(max)); const span = Math.max(max - min, mag * 1e-6, 1e-12); const mid = (min + max) / 2; const half = span / 2 * 1.08 + (max - min < mag * 1e-6 ? Math.max(mag * 0.05, 1e-9) : 0); return [mid - half, mid + half] } }
      },
      legend: { show: true, live: true },
      cursor: { drag: { x: false, y: false } },
      axes: [
        { stroke: axisColor, grid: { stroke: gridColor, width: 1 }, ticks: { stroke: gridColor }, label: 't / s', labelSize: 14, size: 34, font: '11px sans-serif', labelFont: '11px sans-serif' },
        { stroke: axisColor, grid: { stroke: gridColor, width: 1 }, ticks: { stroke: gridColor }, label: unit || '1', labelSize: 14, size: 56, font: '11px sans-serif', labelFont: '11px sans-serif' }
      ],
      series: [
        { label: 't' , value: (_u, v) => (v == null ? '—' : v.toFixed(4)) },
        ...list.map(q => ({ label: `${q.owner} ${q.label}`, stroke: COLORS[colorIndex++ % COLORS.length], width: 1.6, value: (_u: uPlot, v: number | null) => (v == null ? '—' : Number(v.toPrecision(Math.min(8, state.digits))).toString()) }))
      ],
      hooks: {
        draw: [u => {
          const t = state.frame * r.dt
          const x = u.valToPos(t, 'x', true)
          const ctx = u.ctx
          ctx.save()
          ctx.strokeStyle = cssVar('--accent')
          ctx.lineWidth = 1.5 * devicePixelRatio
          ctx.beginPath(); ctx.moveTo(x, u.bbox.top); ctx.lineTo(x, u.bbox.top + u.bbox.height); ctx.stroke()
          for (const e of r.events) {
            if (e.changes.length === 0) continue
            const ex = u.valToPos(e.t, 'x', true)
            ctx.strokeStyle = cssVar('--warning')
            ctx.setLineDash([3 * devicePixelRatio, 3 * devicePixelRatio])
            ctx.lineWidth = devicePixelRatio
            ctx.beginPath(); ctx.moveTo(ex, u.bbox.top); ctx.lineTo(ex, u.bbox.top + u.bbox.height); ctx.stroke()
          }
          ctx.restore()
        }]
      }
    }
    const plot = new uPlot(opts, [Array.from(data.t), ...list.map(q => Array.from(series.get(q.id)!, v => (Number.isFinite(v) ? v : null)))] as uPlot.AlignedData, div)
    plot.over.addEventListener('click', () => {
      const idx = plot.cursor.left !== undefined ? plot.posToVal(plot.cursor.left, 'x') : null
      if (idx !== null) { pause(); seekTime(idx) }
    })
    plots.push(plot)
  })
}

let resizeTimer: ReturnType<typeof setTimeout> | null = null
const ro = new ResizeObserver(() => { if (resizeTimer) clearTimeout(resizeTimer); resizeTimer = setTimeout(build, 120) })
watch(host, el => { if (el) ro.observe(el) })
watch([rec, groups, () => state.theme], () => nextTick(build))
watch(() => state.frame, () => { for (const p of plots) p.redraw(false, false) })
onBeforeUnmount(() => { ro.disconnect(); for (const p of plots) p.destroy() })

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
  <div class="charts-wrap">
    <div class="chart-bar">
      <span class="small muted">曲线：</span>
      <button class="btn small" :disabled="!rec" @click="preset('kin')">x‑t / v‑t / a‑t</button>
      <button class="btn small" :disabled="!rec" @click="preset('energy')">能量</button>
      <button class="btn small" :disabled="!rec" @click="preset('force')">受力</button>
      <button class="btn small ghost" :disabled="!state.chart.length" @click="state.chart = []">清空</button>
      <span class="tiny muted">（在“监视”页点图表按钮可加入任意量；点击曲线跳到该时刻；虚线为事件时刻）</span>
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
.charts { flex: 1; min-height: 0; display: flex; gap: 8px; overflow-x: auto; overflow-y: hidden; }
:deep(.chart) { flex: 0 0 auto; }
:deep(.uplot) { font-family: var(--font-ui); color: var(--text-2); }
:deep(.u-legend) { font-size: 11px; text-align: left; }
:deep(.u-legend .u-marker) { width: 10px; height: 3px; }
</style>
