<script setup lang="ts">
/**
 * Playback bar: transport, event jumps, speed, loop, the time readout (display time unit) and the track with
 * event markers. While a run is still computing, the track spans the full duration and shows how far the
 * recording reaches. `active` = false (hidden page) stops it from following playback.
 */
import { computed } from 'vue'
import { state, play, pause, seekFrame, seekTime, seekAfter } from '../store'
import { useGated } from '../live'
import { fmtNum, fmtTime, unitLabel } from '../settings'
import Icon from './Icon.vue'
import { eventLabel } from '../../render/renderer'

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })

const rec = computed(() => (state.stale ? null : state.recording))
/** Full simulated duration (also while the recording is still growing). */
const duration = computed(() => (rec.value ? Math.max((rec.value.frameCount - 1) * rec.value.dt, rec.value.scene.settings.duration) : 0))
const lastFrame = computed(() => (rec.value ? rec.value.frameCount - 1 : 0))
/** Frames of the complete recording (the track's range). */
const totalFrames = computed(() => (rec.value ? Math.max(lastFrame.value, Math.round(duration.value / rec.value.dt)) : 0))
const computedFraction = computed(() => (rec.value && duration.value > 0 ? (lastFrame.value * rec.value.dt) / duration.value : 1))
const tNow = useGated(() => props.active, () => (rec.value ? state.time : 0))
const frameNow = useGated(() => props.active, () => state.frame)

const markers = computed(() => {
  const r = rec.value
  if (!r || duration.value <= 0) return []
  return r.events.filter(e => e.changes.length > 0).map(e => ({ t: e.t, left: (e.t / duration.value) * 100, text: `${e.changes.map(eventLabel).filter((v, i, a) => a.indexOf(v) === i).join('、')} @ ${fmtNum(e.t, 's', Math.min(10, state.digits + 2))} ${unitLabel('s')}` }))
})

function toggle() { if (state.playing) pause(); else play() }
function step(d: number) { pause(); seekFrame(state.frame + d) }
function jumpEvent(dir: 1 | -1) {
  const now = state.time
  const list = markers.value.map(m => m.t)
  const target = dir > 0 ? list.find(x => x > now + 1e-9) : [...list].reverse().find(x => x < now - 1e-9)
  if (target === undefined) return
  if (dir > 0) seekAfter(target)
  else { pause(); seekTime(target) }
}
function onTrack(e: Event) {
  pause()
  const r = rec.value
  if (!r) return
  seekFrame(Math.min(lastFrame.value, Number((e.target as HTMLInputElement).value)))
}
/** Fixed decimals (the readout must not jitter), fine enough for Δt, in the display time unit. */
const fmtT = (t: number) => fmtTime(t, rec.value?.dt ?? 1e-3, false)
</script>

<template>
  <div class="timeline">
    <div class="controls">
      <button class="btn icon ghost" title="回到开始（Home）" :disabled="!rec" @click="pause(); seekFrame(0)"><Icon name="start" /></button>
      <button class="btn icon ghost" title="上一帧（←）" :disabled="!rec" @click="step(-1)"><Icon name="stepb" /></button>
      <button class="btn icon primary play" :title="state.playing ? '暂停（空格）' : '播放（空格）'" :disabled="!rec" @click="toggle"><Icon :name="state.playing ? 'pause' : 'play'" /></button>
      <button class="btn icon ghost" title="下一帧（→）" :disabled="!rec" @click="step(1)"><Icon name="stepf" /></button>
      <button class="btn icon ghost" title="到结尾（End）" :disabled="!rec" @click="pause(); seekFrame(lastFrame)"><Icon name="end" /></button>
      <span class="sep" />
      <button class="btn ghost small" title="上一个事件" :disabled="!markers.length" @click="jumpEvent(-1)">◀<span class="ev-lbl"> 事件</span></button>
      <button class="btn ghost small" title="下一个事件（跳到事件后的第一帧）" :disabled="!markers.length" @click="jumpEvent(1)"><span class="ev-lbl">事件 </span>▶</button>
      <span class="sep" />
      <select v-model.number="state.speed" class="field speed" title="播放速度（仿真时间 / 真实时间）">
        <option :value="0.05">0.05×</option>
        <option :value="0.1">0.1×</option>
        <option :value="0.25">0.25×</option>
        <option :value="0.5">0.5×</option>
        <option :value="1">1×</option>
        <option :value="2">2×</option>
        <option :value="4">4×</option>
      </select>
      <button class="btn icon ghost" :class="{ active: state.loop }" title="循环播放" :aria-pressed="state.loop" @click="state.loop = !state.loop"><Icon name="loop" /></button>
      <span class="spacer" />
      <span v-if="state.computing && rec" class="badge info computing" title="仍在计算；可以先播放已算出的部分">已算 {{ Math.round(computedFraction * 100) }}%</span>
      <span class="mono time">{{ fmtT(tNow) }} / {{ fmtT(duration) }} {{ unitLabel('s') }}</span>
      <span class="mono tiny muted frames">帧 {{ rec ? frameNow : 0 }} / {{ rec ? lastFrame : 0 }}</span>
    </div>
    <div class="track">
      <div class="computed" :style="{ transform: `scaleX(${computedFraction})` }" />
      <input type="range" min="0" :max="totalFrames" step="1" :value="rec ? Math.round(tNow / rec.dt) : 0" :disabled="!rec" aria-label="时间" @input="onTrack" />
      <div class="markers">
        <button v-for="(m, i) in markers" :key="i" class="marker" :style="{ left: `${m.left}%` }" :title="m.text" @click="seekAfter(m.t)" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.timeline { padding: 6px 12px 4px; container-type: inline-size; }
.controls { display: flex; align-items: center; gap: 4px; min-width: 0; }
.play { width: 34px; }
.sep { width: 1px; height: 18px; background: var(--separator); margin: 0 4px; flex: 0 0 auto; }
.speed { width: 76px; flex: 0 0 auto; }
.controls > .btn { flex: 0 0 auto; }
/* Narrow: drop the secondary texts before anything gets squeezed */
@container (max-width: 700px) { .frames, .ev-lbl { display: none; } }
@container (max-width: 560px) { .computing, .sep { display: none; } .speed { width: 62px; } }
.time { font-size: var(--type-body); font-weight: 600; margin: 0 8px; white-space: nowrap; }
.frames { white-space: nowrap; }
.computing { margin-right: 4px; }
.track { position: relative; height: 22px; margin-top: 2px; }
.track input { width: 100%; margin: 0; position: absolute; top: 4px; accent-color: var(--accent); }
.computed { position: absolute; left: 8px; right: 8px; top: 10px; height: 4px; border-radius: 999px; background: var(--accent-soft); transform-origin: left; transition: transform 200ms linear; pointer-events: none; }
.markers { position: absolute; left: 8px; right: 8px; top: 0; height: 100%; pointer-events: none; }
.marker { position: absolute; top: 0; width: 8px; height: 8px; margin-left: -4px; border-radius: 2px; transform: rotate(45deg); background: var(--warning); border: 0; padding: 0; cursor: pointer; pointer-events: auto; }
.marker:hover { transform: rotate(45deg) scale(1.35); }
</style>
