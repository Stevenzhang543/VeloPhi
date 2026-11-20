<script setup lang="ts">
/**
 * Loading trace (26.64, D257): where a page of the shell waits for something, a trace is swept across a small screen
 * like on an oscilloscope, instead of a spinner. The signal is real when there is one: the displacement of one
 * pendulum of the home page's wave as the core solved it (app/decor/pendulumWave.ts). Before the wave has been solved
 * the screen shows what an oscilloscope shows without a signal — a flat sweep.
 *
 * Under reduced motion the whole trace is drawn once and stands still. `fill` centres it in the space of a page (the
 * loading state of a lazily loaded page).
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { tl } from '../../../i18n'
import { calmMotion, sysEnv } from '../../settings'
import { cachedWave } from '../../decor/pendulumWave'
import { decorStats } from '../../decor/stats'

const props = withDefaults(defineProps<{ fill?: boolean; label?: string }>(), { fill: true, label: '' })

const canvas = ref<HTMLCanvasElement | null>(null)
let raf = 0
let start = 0
/** One sweep of the screen (s) and the simulated time it shows (s). */
const SWEEP_S = 1.6
const SHOWN_S = 12

function draw(now: number) {
  raf = 0
  const c = canvas.value
  if (!c) return
  const t0 = performance.now()
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const W = c.clientWidth, H = c.clientHeight
  if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr) }
  const ctx = c.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, W, H)
  const cs = getComputedStyle(c)
  const mid = H / 2
  // graticule: a centre line with ticks
  ctx.strokeStyle = cs.getPropertyValue('--tick-minor').trim()
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, Math.round(mid) + 0.5); ctx.lineTo(W, Math.round(mid) + 0.5)
  for (let x = 0; x <= W; x += 8) { const h = (x / 8) % 5 === 0 ? 4 : 2; ctx.moveTo(x + 0.5, mid - h); ctx.lineTo(x + 0.5, mid + h) }
  ctx.stroke()

  const still = calmMotion()
  if (!start) start = now
  const head = still ? 1 : (((now - start) / 1000) % SWEEP_S) / SWEEP_S
  const wave = cachedWave()
  const track = wave ? wave.tracks[0] : null
  const amp = track ? Math.abs(track[0]) : 1
  const value = (u: number) => {
    if (!track || !wave) return 0
    const f = Math.min(wave.frames - 1, Math.round((u * SHOWN_S) / wave.step))
    return track[2 * f] / amp
  }
  // the trace up to the head; it fades towards its start like the phosphor of a tube
  const xHead = head * W
  const grad = ctx.createLinearGradient(Math.max(0, xHead - W * 0.75), 0, xHead, 0)
  const trace = cs.getPropertyValue('--trace').trim() || cs.color
  grad.addColorStop(0, 'transparent')
  grad.addColorStop(1, trace)
  ctx.strokeStyle = still ? trace : grad
  ctx.lineWidth = 1.5
  ctx.lineJoin = 'round'
  ctx.beginPath()
  for (let x = 0; x <= xHead; x += 2) { const y = mid - value(x / W) * (H / 2 - 5); if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) }
  ctx.stroke()
  if (!still) {
    ctx.fillStyle = trace
    ctx.beginPath(); ctx.arc(xHead, mid - value(head) * (H / 2 - 5), 2, 0, 2 * Math.PI); ctx.fill()
  }
  const ms = performance.now() - t0
  decorStats.frames++; decorStats.lastMs = ms; decorStats.totalMs += ms
  if (ms > decorStats.maxMs) decorStats.maxMs = ms
  if (!still && !sysEnv.hidden) raf = requestAnimationFrame(draw)
}

function wake() { if (!raf && !sysEnv.hidden) raf = requestAnimationFrame(draw) }
onMounted(() => { raf = requestAnimationFrame(draw); document.addEventListener('visibilitychange', wake) })
onBeforeUnmount(() => { if (raf) cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', wake) })
</script>

<template>
  <div class="scope" :class="{ fill: props.fill }" role="status">
    <canvas ref="canvas" class="screen" aria-hidden="true" />
    <span class="sr-only">{{ props.label || tl('加载中…') }}</span>
  </div>
</template>

<style scoped>
.scope { display: inline-grid; place-items: center; }
.scope.fill { display: grid; width: 100%; height: 100%; min-height: 96px; }
.screen { width: 168px; height: 40px; display: block; }
</style>
