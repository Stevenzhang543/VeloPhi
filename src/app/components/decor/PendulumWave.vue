<script setup lang="ts">
/**
 * The pendulum wave behind the home page (26.64, D257) — the one large decoration of the application. Thin rods hang
 * from a beam marked like a scale; their motion is the engine's (app/decor/pendulumWave.ts solves each pendulum in the
 * Rust core and this component only draws the positions it is given).
 *
 * Rules of a decoration, all kept here: it never sits behind text (the page gives it its own band), it is low in
 * contrast (the tick colours of the tokens), it stands still under reduced motion (one frame of the wave, t = 7.5 s),
 * it stops while the page is not shown or the window is hidden, and a frame costs well under a millisecond (15 lines
 * and 15 dots; the time is recorded in `decorStats` and checked by the interface regressions).
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { state } from '../../store'
import { calmMotion, settings, sysEnv } from '../../settings'
import { WAVE, loadWave, waveAt } from '../../decor/pendulumWave'
import type { WaveData } from '../../decor/pendulumWave'
import { decorStats } from '../../decor/stats'

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })

const canvas = ref<HTMLCanvasElement | null>(null)
const ready = ref(false)
let data: WaveData | null = null
let raf = 0
/** Time of the wave (s) and the wall clock of the last frame: the wave rests while the page is away. */
let tWave = 0
let lastWall = 0
let ro: ResizeObserver | null = null
let colours = { beam: '', rod: '', bob: '' }
const STILL_T = 7.5
const pos: [number, number] = [0, 0]

function readColours() {
  const cs = getComputedStyle(canvas.value!)
  colours = { beam: cs.getPropertyValue('--tick').trim(), rod: cs.getPropertyValue('--tick-minor').trim(), bob: cs.getPropertyValue('--tick').trim() }
}

function resize() {
  const c = canvas.value
  if (!c) return
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = Math.max(1, Math.round(c.clientWidth * dpr)), h = Math.max(1, Math.round(c.clientHeight * dpr))
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h }
  draw()
}

function draw() {
  const c = canvas.value
  if (!c || !data) return
  const t0 = performance.now()
  const ctx = c.getContext('2d')!
  const dpr = c.width / Math.max(1, c.clientWidth)
  const W = c.clientWidth, H = c.clientHeight
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, W, H)
  // A narrow window shows every other pendulum, so neighbours never cross
  const stride = W < 620 ? 2 : 1
  const shown = Math.ceil(WAVE.count / stride)
  // The beam is as wide as the page's text column below it (HomePage.vue: 1040 px at most, 24 or 16 px margins), so
  // its ticks and the rule under the title share their edges; the pivots divide it evenly
  const column = Math.min(W - (W < 900 ? 32 : 48), 1040)
  const left = (W - column) / 2
  const gap = column / shown
  const x0 = left + gap / 2
  const beamY = 18.5
  // Longest rod: what the band has room for, and short enough that neighbours stay apart at the release angle
  const lenPx = Math.max(24, Math.min(H - beamY - 36, (gap * 0.46) / Math.sin(WAVE.release)))
  const scale = lenPx / data.lengths[0]

  // The beam: a hairline with the ticks of a scale; a longer tick at every pivot
  ctx.lineWidth = 1
  ctx.strokeStyle = colours.rod
  ctx.beginPath()
  ctx.moveTo(left, beamY); ctx.lineTo(left + column, beamY)
  for (let i = 0; i <= shown * 5; i++) { const x = Math.round(left + (i * gap) / 5) + (i === shown * 5 ? -0.5 : 0.5); ctx.moveTo(x, beamY - 4); ctx.lineTo(x, beamY) }
  ctx.stroke()
  ctx.strokeStyle = colours.beam
  ctx.beginPath()
  for (let i = 0; i < shown; i++) { const x = Math.round(x0 + i * gap) + 0.5; ctx.moveTo(x, beamY - 8); ctx.lineTo(x, beamY) }
  ctx.stroke()

  // The rods, then the bobs
  ctx.strokeStyle = colours.rod
  ctx.beginPath()
  const pts: number[] = []
  for (let i = 0; i < shown; i++) {
    waveAt(data, i * stride, tWave, pos)
    const px = x0 + i * gap, bx = px + pos[0] * scale, by = beamY - pos[1] * scale
    ctx.moveTo(px, beamY); ctx.lineTo(bx, by)
    pts.push(bx, by)
  }
  ctx.stroke()
  ctx.fillStyle = colours.bob
  ctx.beginPath()
  for (let i = 0; i < pts.length; i += 2) { ctx.moveTo(pts[i] + 3.5, pts[i + 1]); ctx.arc(pts[i], pts[i + 1], 3.5, 0, 2 * Math.PI) }
  ctx.fill()

  const ms = performance.now() - t0
  decorStats.frames++
  decorStats.lastMs = ms
  if (ms > decorStats.maxMs) decorStats.maxMs = ms
  decorStats.totalMs += ms
}

const moving = () => props.active && !sysEnv.hidden && !calmMotion() && !!data

function tick(now: number) {
  raf = 0
  if (!moving()) return
  // a long gap (a throttled tab coming back) does not jump the wave
  if (lastWall) tWave += Math.min(0.1, (now - lastWall) / 1000)
  lastWall = now
  draw()
  raf = requestAnimationFrame(tick)
}

function sync() {
  if (!data) return
  if (moving()) { if (!raf) { lastWall = 0; raf = requestAnimationFrame(tick) } return }
  if (raf) { cancelAnimationFrame(raf); raf = 0 }
  // standing still: reduced motion shows one frame of the wave, always the same
  if (calmMotion()) tWave = STILL_T
  draw()
}

onMounted(async () => {
  readColours()
  ro = new ResizeObserver(resize)
  ro.observe(canvas.value!)
  data = await loadWave()
  if (!data || !canvas.value) return
  ready.value = true
  resize()
  sync()
})
onBeforeUnmount(() => { if (raf) cancelAnimationFrame(raf); ro?.disconnect() })
watch(() => [props.active, sysEnv.hidden, calmMotion()], sync)
// the tick colours change with the theme, projection and contrast
watch(() => [state.theme, settings.projector, sysEnv.moreContrast], () => requestAnimationFrame(() => { if (canvas.value) { readColours(); draw() } }))
</script>

<template>
  <canvas ref="canvas" class="wave" :class="{ ready }" aria-hidden="true" data-ui="home-wave" />
</template>

<style scoped>
.wave { position: absolute; inset: 0; width: 100%; height: 100%; display: block; pointer-events: none; opacity: 0; transition: opacity var(--dur-slow) ease; }
.wave.ready { opacity: 1; }
</style>
