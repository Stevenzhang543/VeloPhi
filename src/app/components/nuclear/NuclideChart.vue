<script setup lang="ts">
/**
 * The chart of nuclides on a canvas (26.64, D276): the 3558 ground states on the N–Z plane, coloured by main decay
 * mode, half-life or binding energy per nucleon. Drag pans, the wheel or a pinch zooms about the pointer, a click
 * chooses a nuclide; arrow keys move the choice, + − 0 zoom and fit. A frame is one scaled image and the labels of the
 * visible cells (src/nuclear/chart.ts); its cost is recorded in `chartStats` (budget 4 ms).
 */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { tl } from '../../../i18n'
import { state } from '../../store'
import { FONT } from '../../../render/style'
import type { NuclideTable } from '../../../nuclear/table'
import { recordOf } from '../../../nuclear/table'
import type { ChartPixels, ChartView, ColourScheme } from '../../../nuclear/chart'
import { LABEL_SCALE, cellAt, centreOn, chartPixels, classify, colourClasses, drawChart, fitView, indexAt, zoomAt } from '../../../nuclear/chart'
import { chartStats } from '../../../nuclear/chartStats'
import { nuclideLine } from '../../../nuclear/page'
import Icon from '../Icon.vue'

const props = defineProps<{ table: NuclideTable; scheme: ColourScheme; selected: string | null }>()
const emit = defineEmits<{ (e: 'select', id: string): void }>()

const box = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const view = shallowRef<ChartView>({ scale: 4, ox: 0, oy: 0 })
const size = ref({ w: 0, h: 0 })
const hover = ref<{ N: number; Z: number } | null>(null)
const tip = ref<{ x: number; y: number; text: string } | null>(null)
const dark = computed(() => state.theme === 'dark')
const classes = computed(() => colourClasses(props.scheme))
const cls = computed(() => classify(props.table, props.scheme))
const pixels = computed<ChartPixels>(() => chartPixels(props.table, cls.value, classes.value, dark.value))
/** Classes that occur, for the legend. */
const legend = computed(() => { const used = new Set<number>(); for (const i of props.table.ground) used.add(cls.value[i]); return classes.value.map((c, i) => ({ ...c, colour: dark.value ? c.dark : c.light, used: used.has(i) })).filter(c => c.used) })
const selectedCell = computed(() => { const r = props.selected ? props.table.byId.get(props.selected) : null; return r ? { N: r.N, Z: r.Z } : null })

let image: HTMLCanvasElement | null = null
let fitted = false
let raf = 0
const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw() }) }
watch(pixels, px => {
  image = document.createElement('canvas')
  image.width = px.width; image.height = px.height
  const data = new ImageData(px.width, px.height)
  data.data.set(px.data)
  image.getContext('2d')!.putImageData(data, 0, 0)
  schedule()
}, { immediate: true })
function draw() {
  const c = canvas.value
  if (!c || !image || size.value.w <= 0) return
  const { w, h } = size.value
  const dpr = window.devicePixelRatio || 1
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr) }
  const ctx = c.getContext('2d')!
  const style = getComputedStyle(c)
  const t0 = performance.now()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const labelled = drawChart(ctx, {
    table: props.table, pixels: pixels.value, cls: cls.value, classes: classes.value, dark: dark.value, image, view: view.value, width: w, height: h,
    paint: { bg: style.getPropertyValue('--canvas-bg').trim(), line: style.getPropertyValue('--tick').trim(), text: style.getPropertyValue('--text-2').trim(), accent: style.getPropertyValue('--accent').trim(), font: FONT },
    selected: selectedCell.value, hover: hover.value
  })
  chartStats.record(performance.now() - t0, labelled)
}
watch([view, hover, selectedCell, dark], schedule)

function resize() {
  const b = box.value
  if (!b) return
  const w = b.clientWidth, h = b.clientHeight
  if (w <= 0 || h <= 0) return
  const first = !fitted
  size.value = { w, h }
  if (first) { fitted = true; view.value = selectedCell.value ? centreOn(selectedCell.value.N, selectedCell.value.Z, w, h, Math.max(fitView(props.table, w, h).scale, 14)) : fitView(props.table, w, h) }
  schedule()
}
let ro: ResizeObserver | null = null
onMounted(() => { ro = new ResizeObserver(resize); if (box.value) ro.observe(box.value); resize() })
onBeforeUnmount(() => { ro?.disconnect(); cancelAnimationFrame(raf) })

function fit() { view.value = fitView(props.table, size.value.w, size.value.h) }
function zoom(f: number) { view.value = zoomAt(view.value, f, size.value.w / 2, size.value.h / 2) }
/** Bring a nuclide to the middle, large enough to read its neighbours. */
function focus(N: number, Z: number) { view.value = centreOn(N, Z, size.value.w, size.value.h, Math.max(view.value.scale, LABEL_SCALE + 6)) }
defineExpose({ fit, focus, zoom, view })

// ---- pointer ----
const pointers = new Map<number, { x: number; y: number }>()
let moved = 0
let pinch = 0
const at = (e: PointerEvent | WheelEvent) => { const r = canvas.value!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
function down(e: PointerEvent) {
  canvas.value!.setPointerCapture(e.pointerId)
  pointers.set(e.pointerId, at(e))
  moved = 0
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y) }
}
function move(e: PointerEvent) {
  const p = at(e)
  const last = pointers.get(e.pointerId)
  if (!last) { setHover(p.x, p.y); return }
  pointers.set(e.pointerId, p)
  if (pointers.size === 1) {
    const dx = p.x - last.x, dy = p.y - last.y
    moved += Math.abs(dx) + Math.abs(dy)
    if (moved > 3) { view.value = { ...view.value, ox: view.value.ox + dx, oy: view.value.oy + dy }; tip.value = null }
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    const d = Math.hypot(a.x - b.x, a.y - b.y)
    if (pinch > 0 && d > 0) view.value = zoomAt(view.value, d / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2)
    pinch = d
    moved = 99
  }
}
function up(e: PointerEvent) {
  const p = at(e)
  const was = pointers.size
  pointers.delete(e.pointerId)
  if (was === 1 && moved <= 3) pickAt(p.x, p.y)
}
function wheel(e: WheelEvent) {
  const p = at(e)
  view.value = zoomAt(view.value, Math.exp(-e.deltaY * 0.0015), p.x, p.y)
}
function recordAt(x: number, y: number) {
  const c = cellAt(view.value, x, y)
  const i = indexAt(pixels.value, c.N, c.Z)
  return i < 0 ? null : recordOf(props.table, c.Z, c.Z + c.N)
}
function setHover(x: number, y: number) {
  const r = recordAt(x, y)
  hover.value = r ? { N: r.N, Z: r.Z } : null
  tip.value = r ? { x: Math.min(x + 14, size.value.w - 180), y: Math.max(4, y - 30), text: nuclideLine(r) } : null
}
function leave() { hover.value = null; tip.value = null }
function pickAt(x: number, y: number) { const r = recordAt(x, y); if (r) emit('select', r.id) }

// ---- keyboard ----
function key(e: KeyboardEvent) {
  if (e.key === '+' || e.key === '=') { zoom(1.4); e.preventDefault(); return }
  if (e.key === '-') { zoom(1 / 1.4); e.preventDefault(); return }
  if (e.key === '0') { fit(); e.preventDefault(); return }
  const step: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }
  const d = step[e.key]
  if (!d) return
  e.preventDefault()
  const from = selectedCell.value ?? { N: 0, Z: 0 }
  // the next nuclide in that direction (the chart has gaps at its edges)
  for (let k = 1; k <= 12; k++) {
    const N = from.N + d[0] * k, Z = from.Z + d[1] * k
    if (indexAt(pixels.value, N, Z) >= 0) {
      const r = recordOf(props.table, Z, Z + N)
      if (r) { emit('select', r.id); const x = view.value.ox + (N + 0.5) * view.value.scale, y = view.value.oy - (Z + 0.5) * view.value.scale; if (x < 40 || y < 20 || x > size.value.w - 20 || y > size.value.h - 30) focus(N, Z) }
      return
    }
  }
}
</script>

<template>
  <div ref="box" class="nchart" data-ui="nuclide-chart">
    <canvas ref="canvas" tabindex="0" role="application" :aria-label="tl('核素图：横轴中子数 N，纵轴质子数 Z。方向键移动，加减号缩放。')" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @pointerleave="leave" @wheel.prevent="wheel" @keydown="key" />
    <div v-if="tip" class="ntip tiny" :style="{ left: `${tip.x}px`, top: `${tip.y}px` }">{{ tip.text }}</div>
    <div class="nzoom">
      <button class="btn ghost icon" :title="tl('放大')" :aria-label="tl('放大')" data-ui="nuclide-zoom-in" @click="zoom(1.6)">+</button>
      <button class="btn ghost icon" :title="tl('缩小')" :aria-label="tl('缩小')" data-ui="nuclide-zoom-out" @click="zoom(1 / 1.6)">−</button>
      <button class="btn ghost icon" :title="tl('显示全图')" :aria-label="tl('显示全图')" data-ui="nuclide-fit" @click="fit"><Icon name="target" :size="15" /></button>
    </div>
    <ul class="nlegend tiny" data-ui="nuclide-legend" :aria-label="tl('图例')">
      <li v-for="c in legend" :key="c.key"><span class="sw" :style="{ background: c.colour }" />{{ c.label }}</li>
    </ul>
  </div>
</template>

<style scoped>
.nchart { position: absolute; inset: 0; overflow: hidden; background: var(--canvas-bg); }
canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; cursor: grab; outline: none; }
canvas:active { cursor: grabbing; }
canvas:focus-visible { box-shadow: inset 0 0 0 2px var(--ring); }
.ntip { position: absolute; pointer-events: none; background: var(--tip-bg); color: var(--tip-text); padding: 2px var(--space-2); border-radius: var(--radius-row); white-space: nowrap; }
.nzoom { position: absolute; right: var(--space-2); top: var(--space-2); display: flex; flex-direction: column; gap: 2px; background: var(--pane); border-radius: var(--radius-control); box-shadow: var(--elev-1); }
.nzoom .btn { width: var(--control-sm); height: var(--control-sm); padding: 0; justify-content: center; font-size: var(--type-subtitle); }
.nlegend { position: absolute; left: calc(var(--space-8) + 2px); top: var(--space-2); margin: 0; padding: var(--space-1) var(--space-2); list-style: none; display: flex; flex-wrap: wrap; gap: 2px var(--space-3); max-width: min(58%, 520px); background: var(--pane); color: var(--text-2); border-radius: var(--radius-control); box-shadow: var(--elev-1); }
.nlegend li { display: inline-flex; align-items: center; gap: var(--space-1); white-space: nowrap; }
.sw { width: 10px; height: 10px; border-radius: var(--radius-row); box-shadow: 0 0 0 1px var(--border); flex: 0 0 auto; }
@media (max-width: 760px) { .nlegend { max-width: calc(100% - 64px); } }
@media (pointer: coarse) { .nzoom .btn { width: var(--touch-min); height: var(--touch-min); } }
</style>
