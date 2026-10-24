<script setup lang="ts">
import { computed } from 'vue'
import { state, play, pause, seekFrame, seekTime } from '../store'
import Icon from './Icon.vue'
import { eventLabel } from '../../render/renderer'

const rec = computed(() => (state.stale ? null : state.recording))
const total = computed(() => (rec.value ? (rec.value.frameCount - 1) * rec.value.dt : 0))
const t = computed(() => (rec.value ? state.frame * rec.value.dt : 0))
const markers = computed(() => {
  const r = rec.value
  if (!r || total.value <= 0) return []
  return r.events.filter(e => e.changes.length > 0).map(e => ({ t: e.t, left: (e.t / total.value) * 100, text: `${e.changes.map(eventLabel).filter((v, i, a) => a.indexOf(v) === i).join('、')} @ ${e.t.toPrecision(Math.min(10, state.digits + 2))} s` }))
})

function toggle() { if (state.playing) pause(); else play() }
function step(d: number) { pause(); seekFrame(state.frame + d) }
function jumpEvent(dir: 1 | -1) {
  pause()
  const now = t.value
  const list = markers.value.map(m => m.t)
  const target = dir > 0 ? list.find(x => x > now + 1e-9) : [...list].reverse().find(x => x < now - 1e-9)
  if (target !== undefined) seekTime(dir > 0 ? Math.ceil(target / rec.value!.dt - 1e-9) * rec.value!.dt : target)
}
const digits = computed(() => Math.max(3, Math.min(6, state.digits - 2)))
</script>

<template>
  <div class="timeline">
    <div class="controls">
      <button class="btn icon ghost" title="回到开始" :disabled="!rec" @click="pause(); seekFrame(0)"><Icon name="start" /></button>
      <button class="btn icon ghost" title="上一帧（←）" :disabled="!rec" @click="step(-1)"><Icon name="stepb" /></button>
      <button class="btn icon primary play" :title="state.playing ? '暂停（空格）' : '播放（空格）'" :disabled="!rec" @click="toggle"><Icon :name="state.playing ? 'pause' : 'play'" /></button>
      <button class="btn icon ghost" title="下一帧（→）" :disabled="!rec" @click="step(1)"><Icon name="stepf" /></button>
      <button class="btn icon ghost" title="到结尾" :disabled="!rec" @click="pause(); seekFrame(rec!.frameCount - 1)"><Icon name="end" /></button>
      <span class="sep" />
      <button class="btn ghost small" title="上一个事件" :disabled="!markers.length" @click="jumpEvent(-1)">◀ 事件</button>
      <button class="btn ghost small" title="下一个事件" :disabled="!markers.length" @click="jumpEvent(1)">事件 ▶</button>
      <span class="sep" />
      <select v-model.number="state.speed" class="field speed" title="播放速度（仿真时间 / 真实时间）">
        <option :value="0.05">0.05×</option>
        <option :value="0.1">0.1×</option>
        <option :value="0.25">0.25×</option>
        <option :value="0.5">0.5×</option>
        <option :value="1">1×</option>
        <option :value="2">2×</option>
      </select>
      <button class="btn icon ghost" :class="{ active: state.loop }" title="循环播放" @click="state.loop = !state.loop"><Icon name="loop" /></button>
      <span class="spacer" />
      <span class="mono time">{{ t.toFixed(digits) }} / {{ total.toFixed(digits) }} s</span>
      <span class="mono tiny muted">帧 {{ rec ? state.frame : 0 }} / {{ rec ? rec.frameCount - 1 : 0 }}</span>
    </div>
    <div class="track">
      <input type="range" min="0" :max="rec ? rec.frameCount - 1 : 0" :value="state.frame" :disabled="!rec" @input="pause(); seekFrame(Number(($event.target as HTMLInputElement).value))" />
      <div class="markers">
        <button v-for="(m, i) in markers" :key="i" class="marker" :style="{ left: `calc(${m.left}% )` }" :title="m.text" @click="pause(); seekTime(Math.ceil(m.t / rec!.dt - 1e-9) * rec!.dt)" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.timeline { padding: 6px 12px 4px; }
.controls { display: flex; align-items: center; gap: 4px; }
.play { width: 34px; }
.sep { width: 1px; height: 18px; background: var(--separator); margin: 0 4px; }
.speed { width: 76px; }
.time { font-size: 13px; font-weight: 600; margin-right: 8px; }
.track { position: relative; height: 22px; margin-top: 2px; }
.track input { width: 100%; margin: 0; position: absolute; top: 4px; accent-color: var(--accent); }
.markers { position: absolute; left: 8px; right: 8px; top: 0; height: 100%; pointer-events: none; }
.marker { position: absolute; top: 0; width: 8px; height: 8px; margin-left: -4px; border-radius: 2px; transform: rotate(45deg); background: var(--warning); border: 0; padding: 0; cursor: pointer; pointer-events: auto; }
</style>
