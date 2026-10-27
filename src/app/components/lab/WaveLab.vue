<script setup lang="ts">
/**
 * Mechanical waves and sound (26.55, D93). Three parts:
 *
 * - String: a string (or, shown as a row of particles, a spring for longitudinal waves) integrated by the core
 *   (`waveRun`, leapfrog at Courant number 1): pulses, reflection at fixed and free ends, superposition, standing
 *   waves of a driven string, two media. Drag on the string to pluck it.
 * - Doppler effect: wave fronts of a moving source and the frequencies ahead and behind (`doppler`).
 * - Sound: pitch (note), wavelength and intensity level of a tone (`sound`); the tone and the beats of two tones can
 *   be played (Web Audio; playback only).
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { tl } from '../../../i18n'
import { fmtQ } from '../../settings'
import type { WaveEnd, WaveSpec } from '../../../engine/labs'
import { doppler, soundInfo, waveRun } from '../../../engine/labs'
import { labState } from '../../lab/state'
import { useLabCanvas } from '../../lab/canvas'
import { FONT, MONO } from '../../../render/style'
import NumField from '../NumField.vue'
import LabFormula from './LabFormula.vue'

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })

type EndType = WaveEnd['type']
interface StringPreset { label: string; left: EndType; right: EndType; T: number; mu: number; mu2?: number; split?: number; drive?: { amp: number; freq: number; pulse: number }; shape?: 'pulse' | 'twoPulses' | 'none'; mode?: number }
const PRESETS: Record<string, StringPreset> = {
  fixed: { label: tl('脉冲在固定端反射'), left: 'driven', right: 'fixed', T: 4, mu: 1, drive: { amp: 0.15, freq: 0, pulse: 0.15 } },
  free: { label: tl('脉冲在自由端反射'), left: 'driven', right: 'free', T: 4, mu: 1, drive: { amp: 0.15, freq: 0, pulse: 0.15 } },
  superpose: { label: tl('两个脉冲相遇（叠加）'), left: 'absorb', right: 'absorb', T: 4, mu: 1, shape: 'twoPulses' },
  standing: { label: tl('驻波（两端固定）'), left: 'driven', right: 'fixed', T: 4, mu: 1, drive: { amp: 0.01, freq: 0, pulse: 0 }, mode: 3 },
  media: { label: tl('从轻绳传到重绳'), left: 'driven', right: 'absorb', T: 4, mu: 1, mu2: 4, split: 0.5, drive: { amp: 0.15, freq: 0, pulse: 0.15 } },
  sine: { label: tl('连续的简谐波'), left: 'driven', right: 'absorb', T: 4, mu: 1, drive: { amp: 0.08, freq: 1, pulse: 0 } }
}
const S = labState('waves', () => ({
  part: 'string' as 'string' | 'doppler' | 'sound', preset: 'fixed', L: 4, T: 4, mu: 1, mu2: 1, split: 1, damping: 0, left: 'driven' as EndType, right: 'fixed' as EndType,
  amp: 0.15, freq: 0, pulse: 0.15, mode: 3, speed: 0.5, view: 'transverse' as 'transverse' | 'longitudinal',
  // Doppler
  f: 4, c: 1, vs: 0.5, vo: 0,
  // sound
  sf: 440, sdb: 60, beats: false, sf2: 444
}))
const N = 401
const c1 = computed(() => Math.sqrt(S.T / S.mu))
const c2 = computed(() => Math.sqrt(S.T / (S.split < 1 ? S.mu2 : S.mu)))
const spec = computed<WaveSpec>(() => ({
  n: N, length: S.L, c1: c1.value, c2: c2.value, split: S.split, damping: S.damping,
  left: { type: S.left, amp: S.amp, freq: S.freq, phase: 0, pulse: S.pulse }, right: { type: S.right, amp: S.amp, freq: S.freq, phase: 0, pulse: S.pulse }
}))
const fn = computed(() => S.mode * c1.value / (2 * S.L))

// string state (not persisted)
let u: number[] = new Array(N).fill(0)
let prev: number[] | null = null
const t = ref(0)
const playing = ref(true)
const energy = ref(0)
const dtStep = ref(0)

function shapeOf(kind: StringPreset['shape']): number[] {
  const out = new Array(N).fill(0)
  if (kind === 'twoPulses') {
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * S.L
      out[i] = 0.15 * Math.exp(-(((x - S.L * 0.25) / 0.15) ** 2)) + 0.1 * Math.exp(-(((x - S.L * 0.75) / 0.2) ** 2))
    }
  }
  return out
}
// the two pulses of the superposition example travel towards each other: right-moving and left-moving halves
function travelling(shapeR: (x: number) => number, shapeL: (x: number) => number) {
  const dt = S.L / (N - 1) / Math.max(c1.value, c2.value)
  u = new Array(N).fill(0); const p = new Array(N).fill(0)
  for (let i = 0; i < N; i++) {
    const x = (i / (N - 1)) * S.L
    u[i] = shapeR(x) + shapeL(x)
    p[i] = shapeR(x + c1.value * dt) + shapeL(x - c1.value * dt)
  }
  prev = p
}
function loadPreset(id: string) {
  const p = PRESETS[id]
  S.preset = id
  S.left = p.left; S.right = p.right; S.T = p.T; S.mu = p.mu; S.mu2 = p.mu2 ?? p.mu; S.split = p.split ?? 1
  S.amp = p.drive?.amp ?? 0.15; S.pulse = p.drive?.pulse ?? 0; S.mode = p.mode ?? 3
  S.freq = p.mode ? p.mode * Math.sqrt(p.T / p.mu) / (2 * S.L) : (p.drive?.freq ?? 0)
  restart()
}
function restart() {
  t.value = 0
  const p = PRESETS[S.preset]
  if (p?.shape === 'twoPulses') travelling(x => 0.15 * Math.exp(-(((x - S.L * 0.25) / 0.15) ** 2)), x => -0.1 * Math.exp(-(((x - S.L * 0.75) / 0.2) ** 2)))
  else { u = shapeOf('none'); prev = null }
  playing.value = true
  redraw()
}

function step(simDt: number) {
  try {
    const r = waveRun(spec.value, { u, prev: prev ?? undefined, t0: t.value, duration: simDt, frames: 1 })
    u = r.u; prev = r.prev; t.value = r.t[r.t.length - 1] ?? t.value; energy.value = r.energy; dtStep.value = r.dt
  } catch { playing.value = false }
}

// pluck by dragging
let pluck: number | null = null
let geom = { x0: 40, sx: 100, sy: 100, ymid: 200 }
const { canvas, wrap, redraw, at } = useLabCanvas(() => props.active && S.part === 'string', (ctx, w, h, dt, P) => {
  if (playing.value && dt > 0 && pluck === null) step(dt * S.speed)
  const x0 = 40, x1 = w - 40, ymid = h / 2
  const sx = (x1 - x0) / S.L, sy = Math.min(h * 0.4 / 0.3, sx)
  const X = (x: number) => x0 + x * sx, Y = (v: number) => ymid - v * sy
  // media
  if (S.split < 1) {
    ctx.fillStyle = P.gridMinor; ctx.fillRect(X(S.split * S.L), 20, X(S.L) - X(S.split * S.L), h - 40)
    ctx.fillStyle = P.text2; ctx.font = `11px ${FONT}`
    ctx.fillText(tl('μ₁ = {0}', [fmtQ(S.mu, 'kg/m', 3)]), X(0) + 4, 32); ctx.fillText(tl('μ₂ = {0}', [fmtQ(S.mu2, 'kg/m', 3)]), X(S.split * S.L) + 4, 32)
  }
  ctx.strokeStyle = P.gridMajor; ctx.lineWidth = 1; ctx.setLineDash([4, 4])
  ctx.beginPath(); ctx.moveTo(X(0), ymid); ctx.lineTo(X(S.L), ymid); ctx.stroke(); ctx.setLineDash([])
  // standing wave nodes (theory)
  if (S.preset === 'standing') {
    ctx.fillStyle = P.friction; ctx.font = `11px ${FONT}`
    for (let m = 0; m <= S.mode; m++) { const x = X(m * S.L / S.mode); ctx.beginPath(); ctx.arc(x, ymid, 3, 0, Math.PI * 2); ctx.fill() }
  }
  const dx = S.L / (N - 1)
  if (S.view === 'transverse') {
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2.5
    ctx.beginPath()
    for (let i = 0; i < N; i++) { const x = X(i * dx), y = Y(u[i]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y) }
    ctx.stroke()
    ctx.fillStyle = P.accent
    for (let i = 0; i < N; i += 20) { ctx.beginPath(); ctx.arc(X(i * dx), Y(u[i]), 2.5, 0, Math.PI * 2); ctx.fill() }
  } else {
    // longitudinal: particle i displaced along the line by u, density shown by spacing
    for (let i = 0; i < N; i += 4) {
      const x = X(i * dx + u[i] * 0.6)
      ctx.strokeStyle = P.accent; ctx.lineWidth = 1.4
      ctx.beginPath(); ctx.moveTo(x, ymid - 40); ctx.lineTo(x, ymid + 40); ctx.stroke()
    }
  }
  // ends
  const endMark = (type: EndType, x: number, yv: number) => {
    ctx.fillStyle = P.text; ctx.strokeStyle = P.text; ctx.lineWidth = 2
    if (type === 'fixed') { ctx.fillRect(x - 3, ymid - 30, 6, 60) }
    else if (type === 'free') { ctx.beginPath(); ctx.moveTo(x, ymid - 50); ctx.lineTo(x, ymid + 50); ctx.stroke(); ctx.beginPath(); ctx.arc(x, Y(yv), 5, 0, Math.PI * 2); ctx.stroke() }
    else if (type === 'driven') { ctx.fillStyle = P.applied; ctx.beginPath(); ctx.arc(x, Y(yv), 6, 0, Math.PI * 2); ctx.fill() }
    else { ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x, ymid - 30); ctx.lineTo(x, ymid + 30); ctx.stroke(); ctx.setLineDash([]) }
  }
  endMark(S.left, X(0), u[0]); endMark(S.right, X(S.L), u[N - 1])
  ctx.font = `12px ${MONO}`; ctx.fillStyle = P.text2
  ctx.fillText(`t = ${t.value.toFixed(3)} s`, 10, h - 10)
  geom = { x0, sx, sy, ymid }
}, () => props.active && S.part === 'string' && playing.value)
function onDown(e: PointerEvent) {
  const [px] = at(e)
  pluck = Math.round(((px - geom.x0) / geom.sx) / S.L * (N - 1))
  canvas.value?.setPointerCapture(e.pointerId)
  onMove(e)
}
function onMove(e: PointerEvent) {
  if (pluck === null) return
  const [, py] = at(e)
  const amp = (geom.ymid - py) / geom.sy
  const k = Math.max(1, Math.min(N - 2, pluck))
  // a triangle through the pointer, at rest
  for (let i = 0; i < N; i++) u[i] = i <= k ? amp * i / k : amp * (N - 1 - i) / (N - 1 - k)
  if (S.left === 'free' || S.left === 'absorb') u[0] = u[1]
  prev = null
  redraw()
}
function onUp() { if (pluck !== null) { pluck = null; t.value = 0; playing.value = true } }

// ---- Doppler ----
const dop = computed(() => { try { return doppler({ f: S.f, c: S.c, vs: S.vs, vo: S.vo, t: dopT.value, max: 80 }) } catch { return null } })
const dopT = ref(0)
const dopPlaying = ref(true)
const dopCanvas = useLabCanvas(() => props.active && S.part === 'doppler', (ctx, w, h, dt, P) => {
  if (dopPlaying.value) { dopT.value += dt; if (S.vs * dopT.value > 2.6 * S.c * 1.2 + 4) dopT.value = 0 }
  const d = dop.value
  const sc = Math.min(w, h) / 9, cx = w * 0.25, cy = h / 2
  const X = (x: number) => cx + x * sc
  if (!d) return
  ctx.strokeStyle = P.accent; ctx.lineWidth = 1.4
  for (let i = 0; i + 1 < d.fronts.length; i += 2) { ctx.beginPath(); ctx.arc(X(d.fronts[i]), cy, Math.max(0, d.fronts[i + 1] * sc), 0, Math.PI * 2); ctx.stroke() }
  const xs = S.vs * dopT.value
  ctx.fillStyle = P.applied; ctx.beginPath(); ctx.arc(X(xs), cy, 7, 0, Math.PI * 2); ctx.fill()
  // observers
  ctx.fillStyle = P.text; ctx.font = `12px ${FONT}`
  for (const [x, f] of [[xs + 3.2, d.ahead], [xs - 3.2, d.behind]] as Array<[number, number | null]>) {
    ctx.beginPath(); ctx.arc(X(x), cy + 30, 5, 0, Math.PI * 2); ctx.fill()
    const s = f === null ? tl('（声障之后听不到）') : `f' = ${fmtQ(f, 'Hz', 4)}`
    ctx.fillText(s, X(x) - ctx.measureText(s).width / 2, cy + 52)
  }
}, () => props.active && S.part === 'doppler' && dopPlaying.value)

// ---- Sound ----
const sound = computed(() => { try { return soundInfo({ f: S.sf, amp: ampOf(S.sdb, S.sf) }) } catch { return null } })
/** Displacement amplitude for a level in dB at frequency f (I = ½ρvω²A²). */
function ampOf(db: number, f: number) { const I = 1e-12 * 10 ** (db / 10); const w = 2 * Math.PI * f; return Math.sqrt(2 * I / (1.204 * 343)) / w }
const NOTES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
let audio: AudioContext | null = null
let oscs: OscillatorNode[] = []
let gain: GainNode | null = null
const sounding = ref(false)
function stopTone() { for (const o of oscs) { try { o.stop() } catch { /* stopped */ } } oscs = []; sounding.value = false }
function playTone() {
  if (sounding.value) { stopTone(); return }
  try {
    audio = audio ?? new AudioContext()
    gain = audio.createGain()
    // loudness on a perceptual scale, capped well below full scale
    gain.gain.value = Math.min(0.25, 0.25 * 10 ** ((S.sdb - 90) / 40))
    gain.connect(audio.destination)
    for (const f of S.beats ? [S.sf, S.sf2] : [S.sf]) {
      const o = audio.createOscillator()
      o.type = 'sine'; o.frequency.value = f; o.connect(gain); o.start()
      oscs.push(o)
    }
    sounding.value = true
  } catch { sounding.value = false }
}
watch(() => [S.sf, S.sf2, S.beats, S.sdb], () => { if (sounding.value) { stopTone(); playTone() } })
watch(() => props.active && S.part === 'sound', on => { if (!on) stopTone() })
onBeforeUnmount(() => { stopTone(); audio?.close().catch(() => undefined) })
const soundCanvas = useLabCanvas(() => props.active && S.part === 'sound', (ctx, w, h, _dt, P) => {
  // pressure (or displacement) against time over 10 ms
  const span = 0.01, m = 600
  ctx.strokeStyle = P.gridMajor; ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke()
  ctx.strokeStyle = P.accent; ctx.lineWidth = 2; ctx.beginPath()
  const a = Math.min(1, 10 ** ((S.sdb - 100) / 40) * 2)
  for (let k = 0; k <= m; k++) {
    const tt = span * k / m
    let v = Math.sin(2 * Math.PI * S.sf * tt)
    if (S.beats) v = 0.5 * (v + Math.sin(2 * Math.PI * S.sf2 * tt))
    const x = (k / m) * w, y = h / 2 - v * a * h * 0.4
    if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y)
  }
  ctx.stroke()
  ctx.fillStyle = P.text2; ctx.font = `11px ${FONT}`; ctx.fillText(tl('10 ms 内的波形（示意）'), 8, 16)
})
watch(() => [S.sf, S.sf2, S.beats, S.sdb], soundCanvas.redraw)
</script>

<template>
  <div class="lab-shell">
    <div class="lab-stage">
      <div class="lab-bar">
        <div class="lab-seg">
          <button :class="{ on: S.part === 'string' }" @click="S.part = 'string'">{{ tl('绳上的波') }}</button>
          <button :class="{ on: S.part === 'doppler' }" @click="S.part = 'doppler'">{{ tl('多普勒效应') }}</button>
          <button :class="{ on: S.part === 'sound' }" @click="S.part = 'sound'">{{ tl('声音') }}</button>
        </div>
        <template v-if="S.part === 'string'">
          <select class="field small" :value="S.preset" :aria-label="tl('示例')" @change="loadPreset(($event.target as HTMLSelectElement).value)">
            <option v-for="(p, id) in PRESETS" :key="id" :value="id">{{ p.label }}</option>
          </select>
          <button class="btn small primary" @click="playing = !playing">{{ playing ? tl('暂停') : tl('播放') }}</button>
          <button class="btn ghost small" @click="restart">{{ tl('重来') }}</button>
          <label class="ctl">{{ tl('慢放') }}<select v-model.number="S.speed" class="field small"><option :value="1">1×</option><option :value="0.5">0.5×</option><option :value="0.25">0.25×</option><option :value="0.1">0.1×</option></select></label>
          <div class="lab-seg"><button :class="{ on: S.view === 'transverse' }" @click="S.view = 'transverse'">{{ tl('横波') }}</button><button :class="{ on: S.view === 'longitudinal' }" @click="S.view = 'longitudinal'">{{ tl('纵波') }}</button></div>
        </template>
        <template v-if="S.part === 'doppler'">
          <button class="btn small primary" @click="dopPlaying = !dopPlaying">{{ dopPlaying ? tl('暂停') : tl('播放') }}</button>
          <button class="btn ghost small" @click="dopT = 0">{{ tl('重来') }}</button>
        </template>
        <template v-if="S.part === 'sound'">
          <button class="btn small primary" @click="playTone">{{ sounding ? tl('停止') : tl('播放声音') }}</button>
        </template>
      </div>
      <div v-show="S.part === 'string'" ref="wrap" class="lab-canvas">
        <canvas ref="canvas" @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp" />
        <div class="hint tiny muted">{{ tl('在绳上按住拖动可以拨动它（松手后从静止开始运动）') }}</div>
      </div>
      <div v-show="S.part === 'doppler'" :ref="el => (dopCanvas.wrap.value = el as HTMLElement)" class="lab-canvas"><canvas :ref="el => (dopCanvas.canvas.value = el as HTMLCanvasElement)" /></div>
      <div v-show="S.part === 'sound'" :ref="el => (soundCanvas.wrap.value = el as HTMLElement)" class="lab-canvas"><canvas :ref="el => (soundCanvas.canvas.value = el as HTMLCanvasElement)" /></div>
    </div>
    <aside class="lab-side">
      <template v-if="S.part === 'string'">
        <section class="lab-block">
          <div class="lab-fields">
            <label>{{ tl('绳长 L') }}</label><NumField :model-value="S.L" unit="m" :min="0.1" @update:model-value="v => { S.L = v; restart() }" />
            <label>{{ tl('张力 T') }}</label><NumField :model-value="S.T" unit="N" :min="1e-6" @update:model-value="v => (S.T = v)" />
            <label>{{ tl('线密度 μ') }}</label><NumField :model-value="S.mu" unit="kg/m" :min="1e-9" @update:model-value="v => (S.mu = v)" />
            <template v-if="S.split < 1"><label>{{ tl('右段线密度') }}</label><NumField :model-value="S.mu2" unit="kg/m" :min="1e-9" @update:model-value="v => (S.mu2 = v)" /></template>
            <label>{{ tl('左端') }}</label>
            <select v-model="S.left" class="field small"><option value="driven">{{ tl('驱动') }}</option><option value="fixed">{{ tl('固定') }}</option><option value="free">{{ tl('自由') }}</option><option value="absorb">{{ tl('不反射') }}</option></select>
            <label>{{ tl('右端') }}</label>
            <select v-model="S.right" class="field small"><option value="fixed">{{ tl('固定') }}</option><option value="free">{{ tl('自由') }}</option><option value="absorb">{{ tl('不反射') }}</option></select>
            <template v-if="S.left === 'driven'">
              <label>{{ tl('振幅') }}</label><NumField :model-value="S.amp" unit="m" @update:model-value="v => (S.amp = v)" />
              <label>{{ tl('驱动方式') }}</label>
              <div class="lab-seg"><button :class="{ on: S.pulse > 0 }" @click="S.pulse = 0.15; restart()">{{ tl('一个脉冲') }}</button><button :class="{ on: S.pulse === 0 }" @click="S.pulse = 0; restart()">{{ tl('连续振动') }}</button></div>
              <template v-if="S.pulse === 0"><label>{{ tl('频率 f') }}</label><NumField :model-value="S.freq" unit="Hz" :min="0" @update:model-value="v => (S.freq = v)" /></template>
            </template>
            <label>{{ tl('阻尼') }}</label><NumField :model-value="S.damping" unit="1/s" :min="0" @update:model-value="v => (S.damping = v)" />
          </div>
          <div v-if="S.preset === 'standing'" class="lab-fields">
            <label>{{ tl('第 n 个驻波') }}</label><NumField :model-value="S.mode" :min="1" :max="12" :step="1" @update:model-value="v => { S.mode = Math.round(v); S.freq = fn; restart() }" />
          </div>
        </section>
        <section class="lab-block">
          <div class="lab-kv">
            <span>{{ tl('波速 v') }}</span><b>{{ fmtQ(c1, 'm/s', 4) }}</b>
            <template v-if="S.left === 'driven' && S.pulse === 0 && S.freq > 0"><span>{{ tl('波长 λ = v/f') }}</span><b>{{ fmtQ(c1 / S.freq, 'm', 4) }}</b></template>
            <span>{{ tl('时间步长') }}</span><b>{{ fmtQ(dtStep, 's', 3) }}</b>
          </div>
          <LabFormula :title="tl('绳上的波速')" tex="v = \sqrt{\dfrac{T}{\mu}}" expr="sqrt(T/mu)" :vars="[{ name: 'T', symbol: 'T', value: S.T, unit: 'N' }, { name: 'mu', symbol: '\mu', value: S.mu, unit: 'kg/m' }]" unit="m/s" lhs="v" />
          <LabFormula v-if="S.preset === 'standing'" :title="tl('驻波的频率（两端固定）')" tex="f_n = \dfrac{n v}{2L}" expr="n*v/(2*L)" :vars="[{ name: 'n', symbol: 'n', value: S.mode, unit: '' }, { name: 'v', symbol: 'v', value: c1, unit: 'm/s' }, { name: 'L', symbol: 'L', value: S.L, unit: 'm' }]" unit="Hz" lhs="f_n" :result="S.freq" />
        </section>
        <details class="lab-block lab-details">
          <summary>{{ tl('原理') }}</summary>
          <p class="tiny muted lab-note">{{ tl('绳被分成 400 小段，核心用蛙跳法逐步计算每一点的位移；时间步长取 Δx/v，这时格点上的结果与波动方程的精确解相同（没有数值色散）。固定端反射时波形倒过来，自由端反射时不倒；两段绳的线密度不同时，在交界处一部分反射、一部分透射。') }}</p>
        </details>
      </template>
      <template v-if="S.part === 'doppler'">
        <section class="lab-block">
          <div class="lab-fields">
            <label>{{ tl('波源频率 f') }}</label><NumField :model-value="S.f" unit="Hz" :min="0.01" @update:model-value="v => (S.f = v)" />
            <label>{{ tl('波速 v') }}</label><NumField :model-value="S.c" unit="m/s" :min="0.01" @update:model-value="v => (S.c = v)" />
            <label>{{ tl('波源速度') }}</label><input v-model.number="S.vs" type="range" :min="0" :max="S.c * 1.6" :step="S.c / 100" :aria-label="tl('波源速度')" />
          </div>
          <div v-if="dop" class="lab-kv">
            <span>{{ tl('波源速度 / 波速') }}</span><b>{{ dop.mach.toFixed(2) }}</b>
            <span>{{ tl('前方接收的频率') }}</span><b class="big">{{ dop.ahead === null ? '—' : fmtQ(dop.ahead, 'Hz', 4) }}</b>
            <span>{{ tl('后方接收的频率') }}</span><b>{{ dop.behind === null ? '—' : fmtQ(dop.behind, 'Hz', 4) }}</b>
          </div>
          <LabFormula :title="tl('多普勒效应（波源运动）')" tex="f' = \dfrac{v}{v - v_s}\,f" expr="v/(v - vs)*f" :vars="[{ name: 'v', symbol: 'v', value: S.c, unit: 'm/s' }, { name: 'vs', symbol: 'v_s', value: S.vs, unit: 'm/s' }, { name: 'f', symbol: 'f', value: S.f, unit: 'Hz' }]" unit="Hz" lhs="f'" :result="dop?.ahead ?? null" />
          <p class="tiny muted lab-note">{{ tl('波源向前运动时，前方的波面挤在一起（波长变短、频率变高），后方的波面拉开。波源速度超过波速时，波面叠成锥形（激波）。') }}</p>
        </section>
      </template>
      <template v-if="S.part === 'sound'">
        <section class="lab-block">
          <div class="lab-fields">
            <label>{{ tl('频率') }}</label><input :value="Math.log10(S.sf)" type="range" min="1.3" max="4.3" step="0.005" :aria-label="tl('频率')" @input="S.sf = Math.round(10 ** Number(($event.target as HTMLInputElement).value))" />
            <label>{{ tl('声强级') }}</label><input v-model.number="S.sdb" type="range" min="0" max="110" step="1" :aria-label="tl('声强级')" />
            <label>{{ tl('两个音（拍）') }}</label><label class="check small"><input v-model="S.beats" type="checkbox" />{{ tl('叠加第二个音') }}</label>
            <template v-if="S.beats"><label>{{ tl('第二个音') }}</label><NumField :model-value="S.sf2" unit="Hz" :min="20" @update:model-value="v => (S.sf2 = v)" /></template>
          </div>
          <div v-if="sound" class="lab-kv">
            <span>{{ tl('频率（音调）') }}</span><b class="big">{{ fmtQ(S.sf, 'Hz', 4) }}</b>
            <span>{{ tl('音名') }}</span><b>{{ NOTES[sound.note] }}{{ sound.octave }} {{ sound.cents >= 0 ? '+' : '' }}{{ sound.cents.toFixed(0) }} ¢</b>
            <span>{{ tl('空气中的波长') }}</span><b>{{ fmtQ(sound.wavelength, 'm', 4) }}</b>
            <span>{{ tl('声强（响度）') }}</span><b>{{ fmtQ(sound.intensity, 'W/m²', 3) }}</b>
            <span>{{ tl('振幅') }}</span><b>{{ fmtQ(ampOf(S.sdb, S.sf), 'm', 3) }}</b>
            <template v-if="S.beats"><span>{{ tl('拍频') }}</span><b>{{ fmtQ(Math.abs(S.sf - S.sf2), 'Hz', 3) }}</b></template>
          </div>
          <LabFormula :title="tl('声强级')" tex="L = 10\lg\dfrac{I}{I_0}" expr="10*lg(I/I0)" :vars="[{ name: 'I', symbol: 'I', value: sound?.intensity ?? 0, unit: 'W/m²' }, { name: 'I0', symbol: 'I_0', value: 1e-12, unit: 'W/m²' }]" unit="" lhs="L/\text{dB}" :result="sound?.level ?? null" />
          <p class="tiny muted lab-note">{{ tl('音调由频率决定，响度由振幅（声强）决定。人耳能听到约 20 Hz 到 20 000 Hz 的声音。播放时音量已限制在安全范围内。') }}</p>
        </section>
      </template>
    </aside>
  </div>
</template>
