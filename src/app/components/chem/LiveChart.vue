<script setup lang="ts">
/**
 * A live curve of the selected vessel (26.65, D297 item 10): temperature, pH, gas held or pressure against bench time,
 * or pH against the vessel's volume (a titration). The points are the core's numbers sampled by the bench store
 * (src/chem/series.ts); this component draws them and saves them as a table. Drawn on a small canvas in the
 * interface's type and the bench's colours; it redraws when the bench changes.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { tl } from '../../../i18n'
import { useBench } from '../../../chem/bench'
import type { Curve } from '../../../chem/series'
import { chemPalette } from '../../../render/chem/palette'
import { fixed } from '../../../chem/format'
import { saveFile } from '../../../platform/files'

const props = defineProps<{ vessel: string }>()
const bench = useBench()
const curve = ref<Curve>('T')
const curves = computed(() => { void bench.revision.value; return bench.series.curvesOf(props.vessel) })
watch(curves, list => { if (!list.includes(curve.value)) curve.value = list[0] ?? 'T' })

const LABEL: Record<Curve, () => string> = { T: () => tl('温度'), pH: () => 'pH', pHV: () => tl('pH–体积'), gas: () => tl('气体'), P: () => tl('压强') }
const UNIT: Record<Curve, string> = { T: '°C', pH: '', pHV: '', gas: 'mL', P: 'kPa' }
const xIsVolume = computed(() => curve.value === 'pHV')

const canvas = ref<HTMLCanvasElement | null>(null)
let raf = 0

/** Round numbers for an axis: about four steps of 1, 2 or 5 × 10ⁿ. */
function ticks(lo: number, hi: number): number[] {
  const span = hi - lo || Math.abs(hi) || 1
  const raw = span / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p
  const step = (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v)
  return out
}

function draw() {
  raf = 0
  const c = canvas.value
  if (!c) return
  const w = c.clientWidth, h = c.clientHeight
  if (!w || !h) return
  const dpr = window.devicePixelRatio || 1
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr) }
  const ctx = c.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  const P = chemPalette()
  const pts = bench.series.points(props.vessel, curve.value)
  const L = 40, R = 10, T = 10, B = 24
  ctx.font = `400 12px ${P.font}`
  ctx.fillStyle = P.ink3
  if (pts.length < 2) { ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(tl('时间流逝后显示曲线'), w / 2, h / 2); return }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  if (curve.value === 'pH' || curve.value === 'pHV') { y0 = Math.min(y0, Math.floor(y0)); y1 = Math.max(y1, Math.ceil(y1)) }
  if (y1 - y0 < 1e-9) { y0 -= 1; y1 += 1 }
  if (x1 - x0 < 1e-9) x1 = x0 + 1
  const pad = (y1 - y0) * 0.08; y0 -= pad; y1 += pad
  const X = (x: number) => L + ((x - x0) / (x1 - x0)) * (w - L - R)
  const Y = (y: number) => T + (1 - (y - y0) / (y1 - y0)) * (h - T - B)
  // grid and axis labels
  ctx.strokeStyle = P.tickMinor; ctx.lineWidth = 1
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = P.ink2
  const yt = ticks(y0, y1), dy = yt.length > 1 ? yt[1] - yt[0] : 1
  for (const v of yt) { const yy = Math.round(Y(v)) + 0.5; ctx.beginPath(); ctx.moveTo(L, yy); ctx.lineTo(w - R, yy); ctx.stroke(); ctx.fillText(fixed(v, dy < 1 ? (dy < 0.1 ? 2 : 1) : 0), L - 6, yy) }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  const minutes = !xIsVolume.value && x1 - x0 > 300
  const xt = ticks(minutes ? x0 / 60 : x0, minutes ? x1 / 60 : x1), dx = xt.length > 1 ? xt[1] - xt[0] : 1
  for (const v of xt) { const xx = X(minutes ? v * 60 : v); ctx.fillText(fixed(v, dx < 1 ? 1 : 0), xx, h - B + 6) }
  ctx.textAlign = 'right'
  ctx.fillStyle = P.ink3
  ctx.fillText(xIsVolume.value ? 'mL' : minutes ? 'min' : 's', w - R, h - B + 6)
  // the curve: the core's samples, joined
  ctx.strokeStyle = P.accent; ctx.lineWidth = 1.75; ctx.lineJoin = 'round'
  ctx.beginPath()
  pts.forEach(([x, y], i) => { if (i) ctx.lineTo(X(x), Y(y)); else ctx.moveTo(X(x), Y(y)) })
  ctx.stroke()
  const [lx, ly] = pts[pts.length - 1]
  ctx.fillStyle = P.accent; ctx.beginPath(); ctx.arc(X(lx), Y(ly), 3, 0, Math.PI * 2); ctx.fill()
}
const kick = () => { if (!raf && typeof requestAnimationFrame !== 'undefined') raf = requestAnimationFrame(draw) }
watch(() => [bench.revision.value, curve.value, props.vessel, canvas.value], kick, { flush: 'post' })
onBeforeUnmount(() => { if (raf) cancelAnimationFrame(raf) })

async function exportData() {
  const x = xIsVolume.value ? tl('体积 (mL)') : tl('时间 (s)')
  const unit = UNIT[curve.value]
  const y = unit ? `${LABEL[curve.value]()} (${unit})` : LABEL[curve.value]()
  await saveFile(bench.series.csv(props.vessel, curve.value, [x, y]), `${bench.vesselName(props.vessel).replace(/\s+/g, '-')}-${curve.value}.csv`, [{ name: 'CSV', extensions: ['csv'] }])
}
</script>

<template>
  <div class="live" data-ui="chem-live">
    <div class="head">
      <div class="segmented curves" role="tablist" :aria-label="tl('曲线')">
        <button v-for="c in curves" :key="c" type="button" role="tab" :class="{ on: curve === c }" :aria-selected="curve === c" :data-curve="c" @click="curve = c">{{ LABEL[c]() }}</button>
      </div>
      <button type="button" class="btn small ghost" :title="tl('导出数据')" :aria-label="tl('导出数据')" data-ui="chem-live-export" @click="exportData">CSV</button>
    </div>
    <canvas ref="canvas" class="chart" role="img" :aria-label="tl('{0}随{1}变化的曲线', [LABEL[curve](), xIsVolume ? tl('体积') : tl('时间')])" />
  </div>
</template>

<style scoped>
.live { display: flex; flex-direction: column; gap: var(--space-2); }
.head { display: flex; align-items: center; gap: var(--space-2); }
.curves { display: flex; flex: 1 1 auto; min-width: 0; }
.curves button { flex: 1 1 0; justify-content: center; padding: 0 4px; }
.chart { display: block; width: 100%; height: 160px; }
</style>
