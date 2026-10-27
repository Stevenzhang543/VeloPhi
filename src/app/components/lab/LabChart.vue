<script setup lang="ts">
/**
 * Line chart of the lab (26.54): curves with axes, ticks, labels, reference markers and a cursor. Only draws the
 * numbers it is given (computed by the core); sizes follow the container and the device pixel ratio.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { state } from '../../store'
import { DARK, LIGHT } from '../../../render/renderer'
import { FONT, MONO } from '../../../render/style'

export interface ChartSeries { x: ArrayLike<number>; y: ArrayLike<number>; color: string; width?: number; dash?: number[]; label?: string }
export interface ChartMarker { x?: number; y?: number; label?: string; color?: string }

const props = withDefaults(defineProps<{
  series: ChartSeries[]
  xLabel?: string
  yLabel?: string
  xRange?: [number, number] | null
  yRange?: [number, number] | null
  markers?: ChartMarker[]
  cursor?: number | null
  height?: number
}>(), { xLabel: '', yLabel: '', xRange: null, yRange: null, markers: () => [], cursor: null, height: 190 })

const canvas = ref<HTMLCanvasElement | null>(null)
const box = ref<HTMLElement | null>(null)
let ro: ResizeObserver | null = null

function nice(span: number, target: number): number {
  const raw = span / target
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw) return m * p
  return 10 * p
}
const tick = (v: number) => {
  if (v === 0) return '0'
  const a = Math.abs(v)
  if (a >= 1e-3 && a < 1e5) return String(Number(v.toPrecision(6)))
  return v.toExponential(1).replace('e+', 'e')
}

function range(axis: 'x' | 'y'): [number, number] {
  const fixed = axis === 'x' ? props.xRange : props.yRange
  if (fixed) return fixed
  let lo = Infinity, hi = -Infinity
  for (const s of props.series) {
    const a = axis === 'x' ? s.x : s.y
    for (let i = 0; i < a.length; i++) { const v = a[i]; if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v } }
  }
  for (const m of props.markers) { const v = axis === 'x' ? m.x : m.y; if (v !== undefined && Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v) } }
  if (!Number.isFinite(lo)) return [0, 1]
  if (hi - lo < 1e-12 * Math.max(1, Math.abs(hi))) { lo -= 0.5 * Math.max(1, Math.abs(lo)); hi += 0.5 * Math.max(1, Math.abs(hi)) }
  const pad = axis === 'y' ? 0.06 * (hi - lo) : 0
  return [lo - pad, hi + pad]
}

function draw() {
  const c = canvas.value, b = box.value
  if (!c || !b) return
  const w = b.clientWidth, h = props.height
  if (w <= 0) return
  const dpr = window.devicePixelRatio || 1
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr) }
  c.style.width = `${w}px`; c.style.height = `${h}px`
  const ctx = c.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const P = state.theme === 'dark' ? DARK : LIGHT
  ctx.clearRect(0, 0, w, h)
  const L = 52, R = 12, T = 12, B = 34
  const [x0, x1] = range('x'), [y0, y1] = range('y')
  const X = (v: number) => L + (v - x0) / (x1 - x0) * (w - L - R)
  const Y = (v: number) => h - B - (v - y0) / (y1 - y0) * (h - T - B)
  // grid and ticks
  ctx.font = `10.5px ${MONO}`
  ctx.lineWidth = 1
  const sx = nice(x1 - x0, Math.max(3, (w - L - R) / 80)), sy = nice(y1 - y0, Math.max(3, (h - T - B) / 40))
  ctx.strokeStyle = P.gridMinor; ctx.fillStyle = P.text2
  for (let v = Math.ceil(x0 / sx) * sx; v <= x1 + 1e-9 * sx; v += sx) {
    const x = X(v)
    ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, h - B); ctx.stroke()
    const t = tick(Math.abs(v) < 1e-12 * sx ? 0 : v)
    ctx.fillText(t, x - ctx.measureText(t).width / 2, h - B + 14)
  }
  for (let v = Math.ceil(y0 / sy) * sy; v <= y1 + 1e-9 * sy; v += sy) {
    const y = Y(v)
    ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(w - R, y); ctx.stroke()
    const t = tick(Math.abs(v) < 1e-12 * sy ? 0 : v)
    ctx.fillText(t, L - 6 - ctx.measureText(t).width, y + 3.5)
  }
  ctx.strokeStyle = P.gridMajor
  ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, h - B); ctx.lineTo(w - R, h - B); ctx.stroke()
  if (y0 < 0 && y1 > 0) { ctx.beginPath(); ctx.moveTo(L, Y(0)); ctx.lineTo(w - R, Y(0)); ctx.stroke() }
  ctx.font = `11px ${FONT}`
  ctx.fillStyle = P.text2
  if (props.xLabel) ctx.fillText(props.xLabel, w - R - ctx.measureText(props.xLabel).width, h - 4)
  if (props.yLabel) ctx.fillText(props.yLabel, 4, 10)
  // curves
  ctx.save()
  ctx.beginPath(); ctx.rect(L, T - 2, w - L - R, h - T - B + 4); ctx.clip()
  for (const s of props.series) {
    ctx.strokeStyle = s.color; ctx.lineWidth = s.width ?? 2; ctx.setLineDash(s.dash ?? [])
    ctx.beginPath()
    let started = false
    for (let i = 0; i < s.x.length; i++) {
      const xv = s.x[i], yv = s.y[i]
      if (!Number.isFinite(xv) || !Number.isFinite(yv)) { started = false; continue }
      if (!started) { ctx.moveTo(X(xv), Y(yv)); started = true } else ctx.lineTo(X(xv), Y(yv))
    }
    ctx.stroke()
  }
  ctx.setLineDash([])
  for (const m of props.markers) {
    ctx.strokeStyle = m.color ?? P.text2; ctx.fillStyle = m.color ?? P.text2
    if (m.x !== undefined && m.y === undefined) {
      ctx.setLineDash([4, 3]); ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(X(m.x), T); ctx.lineTo(X(m.x), h - B); ctx.stroke(); ctx.setLineDash([])
      if (m.label) ctx.fillText(m.label, X(m.x) + 4, T + 12)
    } else if (m.y !== undefined && m.x === undefined) {
      ctx.setLineDash([4, 3]); ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(L, Y(m.y)); ctx.lineTo(w - R, Y(m.y)); ctx.stroke(); ctx.setLineDash([])
      if (m.label) ctx.fillText(m.label, w - R - ctx.measureText(m.label).width - 2, Y(m.y) - 4)
    } else if (m.x !== undefined && m.y !== undefined) {
      ctx.beginPath(); ctx.arc(X(m.x), Y(m.y), 3.5, 0, Math.PI * 2); ctx.fill()
      if (m.label) ctx.fillText(m.label, X(m.x) + 6, Y(m.y) - 6)
    }
  }
  if (props.cursor !== null && Number.isFinite(props.cursor)) {
    ctx.strokeStyle = P.accent; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(X(props.cursor), T); ctx.lineTo(X(props.cursor), h - B); ctx.stroke()
  }
  ctx.restore()
  // legend
  const labelled = props.series.filter(s => s.label)
  if (labelled.length) {
    ctx.font = `11px ${FONT}`
    let x = L + 8
    for (const s of labelled) {
      ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.setLineDash(s.dash ?? [])
      ctx.beginPath(); ctx.moveTo(x, T + 8); ctx.lineTo(x + 16, T + 8); ctx.stroke(); ctx.setLineDash([])
      ctx.fillStyle = P.text2; ctx.fillText(s.label!, x + 20, T + 12)
      x += 32 + ctx.measureText(s.label!).width
    }
  }
}

let raf = 0
// one pending frame at most; a new change while it waits is drawn by it (cancelling it on every change would starve
// the chart while an animation changes the data each frame)
const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw() }) }
// 26.55 (D97): shallow — the series are new arrays when they change (a deep watch walked every number each frame)
watch(() => [props.series, props.markers, props.cursor, props.xRange, props.yRange, props.xLabel, props.yLabel, state.theme], schedule)
onMounted(() => { ro = new ResizeObserver(schedule); if (box.value) ro.observe(box.value); schedule() })
onBeforeUnmount(() => { ro?.disconnect(); cancelAnimationFrame(raf) })
</script>

<template>
  <div ref="box" class="lab-chart" :style="{ height: `${height}px` }"><canvas ref="canvas" /></div>
</template>

<style scoped>
.lab-chart { width: 100%; position: relative; }
canvas { display: block; }
</style>
