<script setup lang="ts">
/**
 * The map of the reactor workshop (26.64, D277): the grid of cells with their materials, control rods (the filled part
 * of the mark is the insertion depth) and detectors, or the fast flux, the thermal flux or the power density of the
 * last solution of the core, each scaled to its own maximum. Click or drag chooses cells; arrow keys move the choice,
 * Enter applies the tool.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { tl } from '../../../i18n'
import type { Criticality, ReactorDoc } from '../../../engine/nuclear'
import { FLUX_RAMP, materialColour } from '../../../nuclear/reactor/palette'

export type MapMode = 'material' | 'flux1' | 'flux2' | 'power'
const props = defineProps<{ doc: ReactorDoc; crit: Criticality | null; mode: MapMode; dark: boolean; selected: string | null; rods?: number[] | null }>()
const emit = defineEmits<{ (e: 'cell', x: number, y: number, drag: boolean): void; (e: 'hover', x: number, y: number): void; (e: 'apply'): void; (e: 'move', x: number, y: number): void }>()

const box = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const nx = computed(() => props.doc.grid.nx)
const ny = computed(() => props.doc.grid.ny)
const geom = { x0: 0, y0: 0, cell: 1, w: 0, h: 0 }
const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
const RAMP = FLUX_RAMP.map(rgb)

/** The picture at one pixel per (refined) cell. */
function image(): HTMLCanvasElement {
  const field = props.mode === 'material' || !props.crit ? null : props.mode === 'flux1' ? props.crit.flux1 : props.mode === 'flux2' ? props.crit.flux2 : props.crit.power
  const w = field ? props.crit!.nx : nx.value, h = field ? props.crit!.ny : ny.value
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const data = new ImageData(w, h)
  if (field) {
    let max = 0
    for (let i = 0; i < field.length; i++) if (field[i] > max) max = field[i]
    for (let i = 0; i < field.length; i++) {
      const k = max > 0 ? Math.min(RAMP.length - 1, Math.max(0, Math.floor(field[i] / max * RAMP.length))) : 0
      data.data[i * 4] = RAMP[k][0]; data.data[i * 4 + 1] = RAMP[k][1]; data.data[i * 4 + 2] = RAMP[k][2]; data.data[i * 4 + 3] = 255
    }
  } else {
    const cache = new Map<string, [number, number, number]>()
    props.doc.cells.forEach((id, i) => {
      const key = String(id)
      let col = cache.get(key)
      if (!col) { col = rgb(materialColour(key, props.dark)); cache.set(key, col) }
      data.data[i * 4] = col[0]; data.data[i * 4 + 1] = col[1]; data.data[i * 4 + 2] = col[2]; data.data[i * 4 + 3] = 255
    })
  }
  c.getContext('2d')!.putImageData(data, 0, 0)
  return c
}

function draw() {
  const c = canvas.value, b = box.value
  if (!c || !b) return
  const w = b.clientWidth, h = b.clientHeight
  if (w <= 0 || h <= 0) return
  const dpr = window.devicePixelRatio || 1
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr) }
  const ctx = c.getContext('2d')!
  const style = getComputedStyle(c)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  const cell = Math.max(1, Math.floor(Math.min((w - 8) / nx.value, (h - 8) / ny.value) * dpr) / dpr)
  geom.cell = cell; geom.w = cell * nx.value; geom.h = cell * ny.value
  geom.x0 = Math.round((w - geom.w) / 2); geom.y0 = Math.round((h - geom.h) / 2)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(image(), geom.x0, geom.y0, geom.w, geom.h)
  const bg = style.getPropertyValue('--canvas-bg').trim()
  if (cell >= 6) {
    ctx.strokeStyle = bg; ctx.lineWidth = 1; ctx.globalAlpha = 0.55
    ctx.beginPath()
    for (let x = 0; x <= nx.value; x++) { const px = Math.round(geom.x0 + x * cell) + 0.5; ctx.moveTo(px, geom.y0); ctx.lineTo(px, geom.y0 + geom.h) }
    for (let y = 0; y <= ny.value; y++) { const py = Math.round(geom.y0 + y * cell) + 0.5; ctx.moveTo(geom.x0, py); ctx.lineTo(geom.x0 + geom.w, py) }
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  // rods: a frame in the colour of the absorber, filled from the top as deep as the rod is in
  const keys = Object.keys(props.doc.rods ?? {}).sort((a, b2) => { const [ax, ay] = a.split(',').map(Number), [bx, by] = b2.split(',').map(Number); return ay * nx.value + ax - (by * nx.value + bx) })
  keys.forEach((key, i) => {
    const [x, y] = key.split(',').map(Number)
    const rod = props.doc.rods![key]
    const depth = props.rods && props.rods.length === keys.length ? props.rods[i] : rod.insertion
    const px = geom.x0 + x * cell, py = geom.y0 + y * cell, inset = Math.max(0.5, cell * 0.14), size = cell - 2 * inset
    ctx.fillStyle = bg
    ctx.fillRect(px + inset, py + inset, size, size)
    ctx.fillStyle = materialColour(rod.material, props.dark)
    ctx.fillRect(px + inset, py + inset, size, size * Math.min(1, Math.max(0, depth)))
    ctx.strokeStyle = materialColour(rod.material, props.dark)
    ctx.lineWidth = Math.max(1, cell * 0.08)
    ctx.strokeRect(px + inset, py + inset, size, size)
  })
  // detectors: a ring
  ctx.strokeStyle = style.getPropertyValue('--accent').trim()
  for (const key of props.doc.detectors ?? []) {
    const [x, y] = key.split(',').map(Number)
    ctx.lineWidth = Math.max(1.5, cell * 0.12)
    ctx.beginPath(); ctx.arc(geom.x0 + (x + 0.5) * cell, geom.y0 + (y + 0.5) * cell, Math.max(3, cell * 0.42), 0, Math.PI * 2); ctx.stroke()
  }
  if (props.selected) {
    const [x, y] = props.selected.split(',').map(Number)
    ctx.strokeStyle = style.getPropertyValue('--accent').trim(); ctx.lineWidth = 2.5
    ctx.strokeRect(geom.x0 + x * cell - 1, geom.y0 + y * cell - 1, cell + 2, cell + 2)
    ctx.strokeStyle = bg; ctx.lineWidth = 1
    ctx.strokeRect(geom.x0 + x * cell - 3, geom.y0 + y * cell - 3, cell + 6, cell + 6)
  }
}
let raf = 0
const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw() }) }
watch(() => [props.doc, props.doc.cells, props.doc.rods, props.doc.detectors, props.crit, props.mode, props.dark, props.selected, props.rods], schedule, { deep: 4 })
let ro: ResizeObserver | null = null
onMounted(() => { ro = new ResizeObserver(schedule); if (box.value) ro.observe(box.value); schedule() })
onBeforeUnmount(() => { ro?.disconnect(); cancelAnimationFrame(raf) })
defineExpose({ redraw: schedule })

function cellOf(e: PointerEvent): [number, number] | null {
  const r = canvas.value!.getBoundingClientRect()
  const x = Math.floor((e.clientX - r.left - geom.x0) / geom.cell), y = Math.floor((e.clientY - r.top - geom.y0) / geom.cell)
  return x < 0 || y < 0 || x >= nx.value || y >= ny.value ? null : [x, y]
}
let dragging = false
let lastKey = ''
function down(e: PointerEvent) {
  const c = cellOf(e)
  if (!c) return
  canvas.value!.setPointerCapture(e.pointerId)
  dragging = true; lastKey = c.join(',')
  emit('cell', c[0], c[1], false)
}
function move(e: PointerEvent) {
  const c = cellOf(e)
  if (!c) return
  emit('hover', c[0], c[1])
  if (dragging && c.join(',') !== lastKey) { lastKey = c.join(','); emit('cell', c[0], c[1], true) }
}
function up() { dragging = false }
function key(e: KeyboardEvent) {
  const step: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
  const d = step[e.key]
  if (d) {
    e.preventDefault()
    const [x, y] = (props.selected ?? `${nx.value >> 1},${ny.value >> 1}`).split(',').map(Number)
    emit('move', Math.min(nx.value - 1, Math.max(0, x + d[0])), Math.min(ny.value - 1, Math.max(0, y + d[1])))
  } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); emit('apply') }
}
</script>

<template>
  <div ref="box" class="rmap" data-ui="reactor-map">
    <canvas ref="canvas" tabindex="0" role="application" :aria-label="tl('堆芯网格 {0} × {1}：方向键移动所选的格，回车应用当前工具。', [nx, ny])" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @keydown="key" />
  </div>
</template>

<style scoped>
.rmap { position: absolute; inset: 0; background: var(--canvas-bg); }
canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; cursor: crosshair; outline: none; }
canvas:focus-visible { box-shadow: inset 0 0 0 2px var(--ring); }
</style>
