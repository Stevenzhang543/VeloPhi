<script setup lang="ts">
/**
 * Phase portrait (26.54, D87): one quantity against another over the run (x–vₓ, θ–ω, or any two quantities), with
 * the current state marked. The values come from the same per-run series cache as the time charts (live.ts); an
 * unbounded run shows the recent window around the playhead. Clicking a point of the curve seeks to that time.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { tl } from '../../i18n'
import { state, seekTime, pause } from '../store'
import type { QuantityDef } from '../../engine/observe'
import { recentWindow, seriesFor, seriesWindow, useGated } from '../live'
import type { SeriesView } from '../live'
import { formatSig } from '../../units/units'
import { toDisp, unitLabel } from '../settings'

const props = withDefaults(defineProps<{ x: QuantityDef | null; y: QuantityDef | null; active?: boolean }>(), { active: true })

const canvas = ref<HTMLCanvasElement | null>(null)
const tNow = useGated(() => props.active, () => state.time)
const rec = computed(() => (state.stale ? null : state.recording))

/** Samples of both quantities (SI); the series cache makes repeated calls cheap, and a growing recording adds frames. */
function currentSeries(): SeriesView | null {
  const r = rec.value
  if (!r || !props.x || !props.y || !props.active) return null
  const ids = [props.x.id, props.y.id]
  return r.unbounded ? seriesWindow(r, state.runId, ids, recentWindow(r, tNow.value)) : seriesFor(r, state.runId, ids)
}

function cssVar(name: string) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888' }

/** Plot area in CSS pixels and the value ranges (display units). */
let frame = { left: 56, top: 10, w: 0, h: 0, x0: 0, x1: 1, y0: 0, y1: 1 }

/** Round tick steps (1, 2, 5 × 10ⁿ) covering [a, b] with about n ticks. */
function ticks(a: number, b: number, n: number): number[] {
  const span = b - a
  if (!(span > 0)) return [a]
  const raw = span / n, mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map(k => k * mag).find(s => s >= raw) ?? 10 * mag
  const out: number[] = []
  for (let v = Math.ceil(a / step) * step; v <= b + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v)
  return out
}

function draw() {
  const el = canvas.value
  if (!el) return
  const w = el.clientWidth, h = el.clientHeight
  if (w === 0 || h === 0) return
  const dpr = devicePixelRatio || 1
  if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) { el.width = Math.round(w * dpr); el.height = Math.round(h * dpr) }
  const ctx = el.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  const s = currentSeries()
  const qx = props.x, qy = props.y
  const text = cssVar('--text-3'), grid = cssVar('--separator'), accent = cssVar('--accent')
  ctx.font = '11px sans-serif'
  if (!s || !qx || !qy) return
  const fx = toDisp(1, qx.unit), fy = toDisp(1, qy.unit)
  const xs = s.get(qx.id), ys = s.get(qy.id)
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (let i = 0; i < xs.length; i++) {
    const a = xs[i] * fx, b = ys[i] * fy
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue
    x0 = Math.min(x0, a); x1 = Math.max(x1, a); y0 = Math.min(y0, b); y1 = Math.max(y1, b)
  }
  if (!Number.isFinite(x0)) return
  // Constant quantities still get a visible range; a margin of 6 %
  const pad = (a: number, b: number): [number, number] => { const m = Math.max(Math.abs(a), Math.abs(b)); const span = Math.max(b - a, m * 1e-6, 1e-12); const mid = (a + b) / 2; return [mid - span * 0.53 - (b - a < m * 1e-6 ? m * 0.05 : 0), mid + span * 0.53 + (b - a < m * 1e-6 ? m * 0.05 : 0)] }
  ;[x0, x1] = pad(x0, x1); [y0, y1] = pad(y0, y1)
  const left = 58, right = 12, top = 10, bottom = 34
  const pw = w - left - right, ph = h - top - bottom
  frame = { left, top, w: pw, h: ph, x0, x1, y0, y1 }
  const X = (v: number) => left + (v - x0) / (x1 - x0) * pw
  const Y = (v: number) => top + ph - (v - y0) / (y1 - y0) * ph
  // Grid and tick labels
  ctx.strokeStyle = grid; ctx.fillStyle = text; ctx.lineWidth = 1
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  for (const v of ticks(x0, x1, Math.max(2, Math.floor(pw / 80)))) { const px = X(v); ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, top + ph); ctx.stroke(); ctx.fillText(formatSig(v, 4), px, top + ph + 4) }
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
  for (const v of ticks(y0, y1, Math.max(2, Math.floor(ph / 50)))) { const py = Y(v); ctx.beginPath(); ctx.moveTo(left, py); ctx.lineTo(left + pw, py); ctx.stroke(); ctx.fillText(formatSig(v, 4), left - 4, py) }
  // Axes through zero when inside
  ctx.strokeStyle = text; ctx.globalAlpha = 0.5
  if (x0 < 0 && x1 > 0) { ctx.beginPath(); ctx.moveTo(X(0), top); ctx.lineTo(X(0), top + ph); ctx.stroke() }
  if (y0 < 0 && y1 > 0) { ctx.beginPath(); ctx.moveTo(left, Y(0)); ctx.lineTo(left + pw, Y(0)); ctx.stroke() }
  ctx.globalAlpha = 1
  // Axis titles
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
  ctx.fillText(`${qx.owner} ${qx.label}${unitLabel(qx.unit) ? ` / ${unitLabel(qx.unit)}` : ''}`, left + pw / 2, h - 2)
  ctx.save(); ctx.translate(12, top + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'middle'
  // The vertical title is short (the owner is in the picker above)
  ctx.fillText(`${qy.label}${unitLabel(qy.unit) ? ` / ${unitLabel(qy.unit)}` : ''}`, 0, 0); ctx.restore()
  // The curve up to now (solid) and after (faint)
  const kNow = Math.round((tNow.value - s.t[0]) / Math.max(s.t.length > 1 ? s.t[1] - s.t[0] : 1, 1e-12))
  const path = (from: number, to: number) => {
    ctx.beginPath()
    let pen = false
    for (let i = from; i <= to && i < xs.length; i++) {
      const a = xs[i] * fx, b = ys[i] * fy
      if (!Number.isFinite(a) || !Number.isFinite(b)) { pen = false; continue }
      if (pen) ctx.lineTo(X(a), Y(b)); else { ctx.moveTo(X(a), Y(b)); pen = true }
    }
    ctx.stroke()
  }
  ctx.lineWidth = 1.6
  ctx.strokeStyle = state.theme === 'dark' ? '#60a5fa' : '#2563eb'
  ctx.globalAlpha = 0.3; path(Math.max(0, kNow), xs.length - 1)
  ctx.globalAlpha = 1; path(0, Math.min(xs.length - 1, Math.max(0, kNow)))
  // The current state
  const k = Math.min(xs.length - 1, Math.max(0, kNow))
  if (Number.isFinite(xs[k]) && Number.isFinite(ys[k])) {
    ctx.fillStyle = accent
    ctx.beginPath(); ctx.arc(X(xs[k] * fx), Y(ys[k] * fy), 4.5, 0, 2 * Math.PI); ctx.fill()
  }
}

/** Seek to the sample nearest to the clicked point. */
function click(e: MouseEvent) {
  const s = currentSeries(), el = canvas.value
  if (!s || !el || !props.x || !props.y) return
  const rect = el.getBoundingClientRect()
  const px = e.clientX - rect.left, py = e.clientY - rect.top
  const f = frame
  const fx = toDisp(1, props.x.unit), fy = toDisp(1, props.y.unit)
  const xs = s.get(props.x.id), ys = s.get(props.y.id)
  let best = -1, bestD = 144
  for (let i = 0; i < xs.length; i++) {
    const qx = f.left + (xs[i] * fx - f.x0) / (f.x1 - f.x0) * f.w, qy = f.top + f.h - (ys[i] * fy - f.y0) / (f.y1 - f.y0) * f.h
    const d = (qx - px) ** 2 + (qy - py) ** 2
    if (d < bestD) { bestD = d; best = i }
  }
  if (best < 0) return
  pause()
  seekTime(s.t[best])
}

let ro: ResizeObserver | null = null
let raf = 0
function schedule() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw() }) }
onMounted(() => { ro = new ResizeObserver(schedule); if (canvas.value) ro.observe(canvas.value); schedule() })
onBeforeUnmount(() => { ro?.disconnect(); if (raf) cancelAnimationFrame(raf) })
watch([rec, tNow, () => state.runId, () => state.theme, () => props.x, () => props.y, () => props.active, () => state.recording?.frameCount], schedule)
</script>

<template>
  <div class="phase">
    <canvas ref="canvas" class="phase-canvas" :aria-label="tl('相图')" @click="click" />
    <div v-if="!x || !y" class="empty small muted">{{ tl('选择横轴与纵轴的物理量') }}</div>
  </div>
</template>

<style scoped>
.phase { position: relative; flex: 1; min-height: 0; min-width: 0; display: flex; }
.phase-canvas { flex: 1; width: 100%; height: 100%; min-height: 120px; cursor: crosshair; }
.empty { position: absolute; inset: 0; display: grid; place-items: center; }
</style>
