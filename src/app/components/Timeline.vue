<script setup lang="ts">
/**
 * Playback bar: transport, event jumps, speed, loop, the time readout (display time unit) and the track with
 * event markers. While a run is still computing, the track shows how far the recording reaches. An unbounded run
 * (decision D26) grows: the track spans the computed range plus the look-ahead target, playback waits (buffering)
 * when it catches up with the computation, clicking beyond the computed part asks the run to compute there, and
 * the track can show everything or a recent window. `active` = false (hidden page) stops it from following
 * playback. 26.51 (D52): "branch from this moment", the branch selector, and markers where branches leave the
 * scene on screen; times are shown on the clock of that scene (a branch starts at its branch point).
 * 26.53 (D71): the formula timeline under the track — each recognised situation as a bar (colour: its category; the
 * line under it: the verdicts of its formulas, green all agree, red some deviate, yellow approximate; ★ favourites),
 * event situations as marks; a click jumps there and shows the situation in the formula panel, a double click zooms
 * the track to it.
 */
import { tl, listSep } from '../../i18n'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { state, play, pause, seekFrame, seekTime, seekAfter, computeTo, stopRun } from '../store'
import { useGated } from '../live'
import { fmtNum, fmtTime, settings, unitLabel } from '../settings'
import { formulaTimeline } from '../../formula/match'
import type { TimelineBar } from '../../formula/panel'
import { timelineBars } from '../../formula/panel'
import { locale } from '../../i18n/locale'
import Icon from './Icon.vue'
import TimelineMarks from './TimelineMarks.vue'
import FormulaTrack from './FormulaTrack.vue'
import { eventLabel } from '../../render/renderer'
import { openEventDetail } from '../details'
import { branchDepth, branchHere, branchList, canBranch, deleteBranch, showBranch } from '../branches'
import { shownTime } from '../../units/clock'
import { ask } from '../../platform/ask'

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })

const rec = computed(() => (state.stale ? null : state.recording))
const unbounded = computed(() => !!rec.value?.unbounded)
const lastFrame = computed(() => (rec.value ? rec.value.frameCount - 1 : 0))
/** Computed range (s). */
const tComputed = computed(() => (rec.value ? lastFrame.value * rec.value.dt : 0))
/** End of the track: the full duration of a bounded run; the computed range or look-ahead target of an unbounded one. */
const duration = computed(() => {
  const r = rec.value
  if (!r) return 0
  if (!r.unbounded) return Math.max(tComputed.value, r.scene.settings.duration ?? 0)
  const target = state.computing && Number.isFinite(state.run.tTarget) ? state.run.tTarget : 0
  return Math.max(tComputed.value, target, r.dt)
})
const tNow = useGated(() => props.active, () => (rec.value ? state.time : 0))
const frameNow = useGated(() => props.active, () => state.frame)

/** Track zoom of an unbounded run: everything, or a recent window around the playhead. */
const zoom = ref<'all' | 'recent'>('all')
/** Span of the recent window (s). */
const WINDOW = 60
/** Visible range of the track (s), moving in quarter-window steps. */
/** A range chosen on the formula timeline (double click), until reset. */
const range = ref<{ t0: number; t1: number } | null>(null)
watch(rec, () => { range.value = null })
const view = computed(() => {
  const end = duration.value
  if (range.value) return { t0: Math.max(0, range.value.t0), t1: Math.min(Math.max(end, range.value.t1), range.value.t1) }
  if (zoom.value === 'all' || end <= WINDOW) return { t0: 0, t1: end }
  const step = WINDOW / 4
  const t0 = Math.max(0, Math.min(Math.floor((tNow.value - 0.75 * WINDOW) / step) * step, end - WINDOW))
  return { t0, t1: t0 + WINDOW }
})
const span = computed(() => Math.max(1e-9, view.value.t1 - view.value.t0))
/** Fraction of the visible track that is computed. */
const computedFraction = computed(() => Math.max(0, Math.min(1, (tComputed.value - view.value.t0) / span.value)))
const dtOf = computed(() => rec.value?.dt ?? 1)
const kMin = computed(() => Math.round(view.value.t0 / dtOf.value))
const kMax = computed(() => Math.max(kMin.value + 1, Math.round(view.value.t1 / dtOf.value)))

/** Most markers drawn (long runs: the events in view, thinned evenly). */
const MAX_MARKERS = 400
const markers = computed(() => {
  const r = rec.value
  if (!r || duration.value <= 0) return []
  const { t0, t1 } = view.value
  const list: Array<{ index: number; t: number }> = []
  r.events.forEach((e, i) => { if (e.changes.length > 0 && e.t >= t0 - 1e-12 && e.t <= t1 + 1e-12) list.push({ index: i, t: e.t }) })
  const every = Math.max(1, Math.ceil(list.length / MAX_MARKERS))
  return list.filter((_, i) => i % every === 0).map(({ index, t }) => {
    const e = r.events[index]
    return { index, t, left: ((t - t0) / span.value) * 100, text: `${e.changes.map(eventLabel).filter((v, i, a) => a.indexOf(v) === i).join(listSep())} @ ${fmtNum(shownTime(t), 's', Math.min(10, state.digits + 2))} ${unitLabel('s')}` }
  })
})

function toggle() { if (state.playing) pause(); else play() }
function step(d: number) { pause(); seekFrame(state.frame + d) }
function jumpEvent(dir: 1 | -1) {
  const r = rec.value
  if (!r) return
  const now = state.time
  const list = r.events.filter(e => e.changes.length > 0).map(e => e.t)
  const target = dir > 0 ? list.find(x => x > now + 1e-9) : [...list].reverse().find(x => x < now - 1e-9)
  if (target === undefined) return
  if (dir > 0) seekAfter(target)
  else { pause(); seekTime(target) }
}
/** A seek beyond the computed range of an unbounded run waits for the computation. */
const pendingSeek = ref<number | null>(null)
watch(lastFrame, k => { if (pendingSeek.value !== null && k >= pendingSeek.value) { seekFrame(pendingSeek.value); pendingSeek.value = null } })
// Scrubbing feedback (26.52, D57): the thumb grows and a bubble shows the time under it
const scrubbing = ref(false)
const playedFraction = computed(() => {
  const r = rec.value
  if (!r) return 0
  const k = tNow.value / r.dt
  return Math.min(1, Math.max(0, (k - kMin.value) / Math.max(1, kMax.value - kMin.value)))
})
function onTrack(e: Event) {
  pause()
  const r = rec.value
  if (!r) return
  const k = Number((e.target as HTMLInputElement).value)
  if (k > lastFrame.value && unbounded.value && state.computing) {
    computeTo(k * r.dt)
    pendingSeek.value = k
    seekFrame(lastFrame.value)
    return
  }
  pendingSeek.value = null
  seekFrame(Math.min(lastFrame.value, k))
}
function onMarker(m: { index: number; t: number }) {
  seekAfter(m.t)
  openEventDetail(m.index)
}
/** Fixed decimals (the readout must not jitter), fine enough for Δt, in the display time unit. */
const fmtT = (t: number) => fmtTime(t, rec.value?.dt ?? 1e-3, false)

// ---- Formula timeline (D71) ----
const fu = settings.ui.formula
/** Bars of the formula timeline, recomputed at most every 400 ms while a run grows. */
const fbars = shallowRef<TimelineBar[]>([])
let fTimer: ReturnType<typeof setTimeout> | null = null
function updateBars() {
  fTimer = null
  const r = rec.value
  fbars.value = r && fu.timeline && state.situations.length ? timelineBars(formulaTimeline(r, state.situations), fu.pinned) : []
}
watch(() => [rec.value, rec.value?.frameCount, state.situations, fu.timeline, fu.pinned.length, locale.lang], () => {
  if (!fTimer) fTimer = setTimeout(updateBars, state.computing ? 400 : 0)
}, { immediate: true })
onBeforeUnmount(() => { if (fTimer) clearTimeout(fTimer) })
const lanes = computed(() => fbars.value.reduce((n, b) => Math.max(n, b.lane + 1), 1))
const visibleBars = computed(() => fbars.value.filter(b => b.t1 >= view.value.t0 - 1e-12 && b.t0 <= view.value.t1 + 1e-12))
function onBar(b: TimelineBar) {
  pause()
  seekTime(b.t0)
  state.rightTab = 'formula'
  state.formulaSituation = b.entry.situation.key
}
function zoomTo(b: TimelineBar) {
  const d = duration.value
  const pad = Math.max((b.t1 - b.t0) * 0.15, d * 0.02, rec.value?.dt ?? 0)
  range.value = { t0: Math.max(0, b.t0 - pad), t1: Math.min(d, b.t1 + pad) }
}

// ---- Branches (D52) ----
const branches = computed(() => branchList())
const branchOptions = computed(() => [{ id: '', label: tl('主线') }, ...branches.value.map(b => ({ id: b.id, label: `${'　'.repeat(branchDepth(b.id) - 1)}↳ ${b.name}` }))])
const branchValue = computed({ get: () => state.branch ?? '', set: (v: string) => showBranch(v === '' ? null : v) })
const branchable = computed(() => !state.playing && canBranch())
/** Branches leaving the scene on screen, as markers on its track. */
const branchMarks = computed(() => {
  const r = rec.value
  if (!r) return []
  const origin = r.scene.settings.startTime ?? 0
  const { t0, t1 } = view.value
  return branches.value.filter(b => b.parent === state.branch).map(b => ({ id: b.id, name: b.name, t: b.t - origin })).filter(m => m.t >= t0 && m.t <= t1).map(m => ({ ...m, left: ((m.t - t0) / span.value) * 100 }))
})
async function removeBranch() {
  const id = state.branch
  if (id && (await ask(tl('删除当前分支（及由它派生的分支）？'))) && state.branch === id) deleteBranch(id)
}
</script>

<template>
  <div class="timeline">
    <div class="controls" :class="{ unb: unbounded }">
      <button class="btn icon ghost" :title="tl('回到开始（Home）')" :disabled="!rec" @click="pause(); seekFrame(0)"><Icon name="start" /></button>
      <button class="btn icon ghost" :title="tl('上一帧（←）')" :disabled="!rec" @click="step(-1)"><Icon name="stepb" /></button>
      <button class="btn icon primary play" :title="state.playing ? tl('暂停（空格）') : tl('播放（空格）')" :disabled="!rec" @click="toggle"><Icon :name="state.playing ? 'pause' : 'play'" /></button>
      <button class="btn icon ghost" :title="tl('下一帧（→）')" :disabled="!rec" @click="step(1)"><Icon name="stepf" /></button>
      <button class="btn icon ghost" :title="tl('到结尾（End）')" :disabled="!rec" @click="pause(); seekFrame(lastFrame)"><Icon name="end" /></button>
      <span class="sep" />
      <button class="btn ghost small" :title="tl('上一个事件')" :disabled="!markers.length" @click="jumpEvent(-1)">◀<span class="ev-lbl"> {{ tl('事件') }}</span></button>
      <button class="btn ghost small" :title="tl('下一个事件（跳到事件后的第一帧）')" :disabled="!markers.length" @click="jumpEvent(1)"><span class="ev-lbl">{{ tl('事件') }} </span>▶</button>
      <span class="sep" />
      <select v-model.number="state.speed" class="field speed" :title="tl('播放速度（仿真时间 / 真实时间）')">
        <option :value="0.05">0.05×</option>
        <option :value="0.1">0.1×</option>
        <option :value="0.25">0.25×</option>
        <option :value="0.5">0.5×</option>
        <option :value="1">1×</option>
        <option :value="2">2×</option>
        <option :value="4">4×</option>
      </select>
      <button class="btn icon ghost" :class="{ active: state.loop }" :title="tl('循环播放')" :aria-pressed="state.loop" @click="state.loop = !state.loop"><Icon name="loop" /></button>
      <span class="sep" />
      <button class="btn ghost small branch-btn" :disabled="!branchable" :title="tl('从当前时刻建立分支：之后修改物体、连接件或参数，从此刻继续计算；原记录保留，可切换和在曲线中叠加对照（先暂停）')" @click="branchHere()"><Icon name="branch" :size="15" /><span class="br-lbl"> {{ tl('从此刻分支') }}</span></button>
      <template v-if="branches.length">
        <select v-model="branchValue" class="field branch-sel" :title="tl('切换主线与分支')">
          <option v-for="o in branchOptions" :key="o.id" :value="o.id">{{ o.label }}</option>
        </select>
        <button v-if="state.branch" class="btn icon ghost" :title="tl('删除此分支')" @click="removeBranch"><Icon name="trash" :size="15" /></button>
      </template>
      <span class="sep" />
      <button class="btn ghost small ftl-btn" :class="{ active: fu.timeline }" :aria-pressed="fu.timeline" :title="tl('在时间轴下方显示公式时间轴：各情形的时间段与公式判定')" @click="fu.timeline = !fu.timeline">{{ tl('公式') }}</button>
      <button v-if="range" class="btn ghost small" :title="tl('时间轴恢复显示全程')" @click="range = null">{{ tl('显示全程') }}</button>
      <span class="spacer" />
      <span v-if="state.buffering" class="badge warn computing" :title="tl('播放追上了计算，等待新的帧')">{{ tl('缓冲中…') }}</span>
      <template v-if="unbounded">
        <span v-if="state.computing" class="badge info computing" :title="state.run.paused ? tl('已领先播放位置足够远，计算暂停；播放前进时继续') : tl('持续计算中；可以先播放已算出的部分')">{{ tl('已算到 {0} {1}{2}', [fmtT(tComputed), unitLabel('s'), state.run.paused ? tl(' · 暂停') : '']) }}</span>
        <button v-if="state.computing" class="btn ghost small stop-btn" :title="tl('停止计算（保留已算出的部分）')" @click="stopRun()">{{ tl('停止') }}</button>
        <button class="btn ghost small zoom-btn" :title="zoom === 'all' ? tl('时间轴只显示播放位置附近 60 s') : tl('时间轴显示全部已算出的范围')" @click="zoom = zoom === 'all' ? 'recent' : 'all'">{{ zoom === 'all' ? tl('全程') : tl('近 60 s') }}</button>
      </template>
      <span v-else-if="state.computing && rec" class="badge info computing" :title="tl('仍在计算；可以先播放已算出的部分')">{{ tl('已算 {0}%', [Math.round(computedFraction * 100)]) }}</span>
      <span class="mono time">{{ fmtT(tNow) }} / {{ fmtT(unbounded ? tComputed : duration) }} {{ unitLabel('s') }}</span>
      <span class="mono tiny muted frames">{{ tl('帧 {0} / {1}', [rec ? frameNow : 0, rec ? lastFrame : 0]) }}</span>
    </div>
    <div class="track" :class="{ scrub: scrubbing }">
      <div class="rail" />
      <div class="computed" :style="{ transform: `scaleX(${computedFraction})` }" />
      <div class="played" :style="{ transform: `scaleX(${playedFraction})` }" />
      <input type="range" :min="kMin" :max="kMax" step="1" :value="rec ? Math.round(tNow / rec.dt) : 0" :disabled="!rec" :aria-label="tl('时间')" @input="onTrack" @pointerdown="scrubbing = true" @pointerup="scrubbing = false" @pointercancel="scrubbing = false" @blur="scrubbing = false" />
      <div v-if="scrubbing && rec" class="bubble mono" :style="{ left: `calc(7px + (100% - 14px) * ${playedFraction})` }">{{ fmtT(tNow) }} {{ unitLabel('s') }}</div>
      <TimelineMarks :markers="markers" :branch-marks="branchMarks" @marker="onMarker" @branch="showBranch" />
    </div>
    <div v-if="fu.timeline && fbars.length" class="ftrack" :style="{ height: `${lanes * 11 + 3}px` }" role="list" :aria-label="tl('公式时间轴')">
      <FormulaTrack :bars="visibleBars" :t0="view.t0" :span="span" @bar="onBar" @zoom="zoomTo" />
      <div class="fnow" :style="{ left: `calc(${playedFraction * 100}%)` }" />
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
.computing { margin-right: 4px; flex: 0 1 auto; min-width: 6em; display: block; line-height: 20px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Narrow: drop the secondary texts before anything gets squeezed */
@container (max-width: 820px) { .frames, .ev-lbl, .zoom-btn, .br-lbl { display: none; } }
/* A continuing run also shows how far it has computed, a stop and a range button (26.53) */
@container (max-width: 1080px) { .unb .frames, .unb .ev-lbl, .unb .br-lbl { display: none; } }
.branch-sel { width: 180px; flex: 0 1 auto; min-width: 80px; }
.branch-btn { display: inline-flex; align-items: center; gap: 2px; white-space: nowrap; }
@container (max-width: 560px) { .computing, .sep, .stop-btn { display: none; } .speed { width: 62px; } }
.time { font-size: var(--type-body); font-weight: 600; margin: 0 8px; white-space: nowrap; }
.frames { white-space: nowrap; }
.track { position: relative; height: 22px; margin-top: 2px; }
.rail, .computed, .played { position: absolute; left: 7px; right: 7px; top: 9px; height: 4px; border-radius: 999px; pointer-events: none; transform-origin: left; }
.rail { background: var(--fill-strong); }
.computed { background: var(--accent-soft); transition: transform 200ms linear; }
.played { background: color-mix(in srgb, var(--accent) 70%, transparent); }
.track input { width: 100%; margin: 0; position: absolute; top: 4px; height: 14px; -webkit-appearance: none; appearance: none; background: transparent; cursor: pointer; }
.track input:disabled { cursor: default; }
.track input::-webkit-slider-runnable-track { height: 14px; background: transparent; }
.track input::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none; width: 14px; height: 14px; border-radius: 50%; background: var(--accent); border: 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3), 0 0 0 2.5px var(--pane); transition: transform var(--dur-2) var(--ease-spring);
}
.track input::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%; background: var(--accent); border: 0; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3), 0 0 0 2.5px var(--pane); }
.track input:hover::-webkit-slider-thumb { transform: scale(1.15); }
.track.scrub input::-webkit-slider-thumb { transform: scale(1.4); }
.bubble { position: absolute; bottom: calc(100% + 2px); transform: translateX(-50%); background: var(--text); color: var(--pane); font-size: var(--type-tiny); padding: 2px 7px; border-radius: 7px; pointer-events: none; white-space: nowrap; box-shadow: var(--shadow); animation: pop-in var(--dur-2) var(--ease-out); z-index: 2; }
.ftl-btn.active { color: var(--accent); }
.ftrack { position: relative; margin: 0 7px 2px; }
/* A situation with nothing to compare at all: an outline only */
.fnow { position: absolute; top: 0; bottom: 0; width: 1.5px; margin-left: -0.75px; background: var(--accent); pointer-events: none; opacity: 0.8; }
@container (max-width: 560px) { .ftl-btn { display: none; } }
</style>
