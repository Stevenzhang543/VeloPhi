<script setup lang="ts">
/**
 * Export dialog: CSV data (SI or display units, separator and decimal mark from the export settings) and video
 * (same renderer and effects as the screen, overlay values in display units). Links to the courseware package
 * and the lab report dialogs.
 */
import { computed, ref } from 'vue'
import { state, showToast, viewCamera } from '../store'
import { effectiveEffects, settings, toDisp, unitLabel } from '../settings'
import { listQuantities } from '../../core/observe/quantities'
import { defaultCsvIds, effectiveSeparator, recordingCsv } from '../../export/csv'
import { exportVideo } from '../../export/video'
import type { FrameEffects } from '../../render/frame'
import { PROJECTOR_STYLE } from '../../render/frame'
import { saveFile } from '../../platform/files'
import { DARK, LIGHT } from '../../render/renderer'
import { logEvent } from '../trialLog'
import NumField from './NumField.vue'
import Icon from './Icon.vue'

const tab = ref<'csv' | 'video'>('csv')
const rec = computed(() => state.recording!)
const total = computed(() => (rec.value.frameCount - 1) * rec.value.dt)
const all = computed(() => listQuantities(rec.value.system))
const picked = ref<string[]>(defaultCsvIds(rec.value))
const stride = ref(1)
const t0 = ref(0)
const t1 = ref(total.value)
const busy = ref(false)
const progress = ref(0)
const csvUnits = ref<'si' | 'display'>('si')
let cancel = false

const safeName = computed(() => (state.scene.name || 'verity').replace(/[\\/:*?"<>|]/g, '_'))
const sepText = computed(() => { const s = effectiveSeparator({ separator: settings.export.csvSeparator, decimal: settings.export.csvDecimal }); return s === '\t' ? '制表符' : s === ',' ? '逗号' : '分号' })
const tScale = computed(() => toDisp(1, 's'))

async function doCsv() {
  const r = rec.value
  const from = Math.max(0, Math.round(t0.value / r.dt)), to = Math.min(r.frameCount - 1, Math.round(t1.value / r.dt))
  const text = recordingCsv(r, { ids: picked.value, stride: stride.value, from, to, units: csvUnits.value, unitChoice: settings.units, separator: settings.export.csvSeparator, decimal: settings.export.csvDecimal })
  const path = await saveFile(text, `${safeName.value}.csv`, [{ name: 'CSV 表格', extensions: ['csv'] }])
  if (path) { showToast(`已导出 ${path}`); logEvent('export.csv', { columns: picked.value.length, units: csvUnits.value }) }
}

const res = ref<'720' | '1080'>('1080')
const fps = ref(settings.export.fps === 30 ? 30 : 60)
const speed = ref(1)
const overlay = ref<string[]>([...state.scene.watch].slice(0, 4))
const estFrames = computed(() => Math.floor(((Math.min(t1.value, total.value) - t0.value) / speed.value) * fps.value) + 1)

/** Effects of the export: the screen settings, with the shutter expressed in simulated seconds per video frame. */
function videoEffects(): FrameEffects | null {
  const e = effectiveEffects()
  if (e.quality === 'off') return null
  return { motionBlur: e.motionBlur, shutterSeconds: e.shutter * speed.value / fps.value, particles: e.particles, trails: e.trails, trailSeconds: e.trailSeconds }
}

async function doVideo() {
  busy.value = true
  cancel = false
  progress.value = 0
  try {
    const [w, h] = res.value === '1080' ? [1920, 1080] : [1280, 720]
    const out = await exportVideo(rec.value, {
      width: w, height: h, fps: fps.value, speed: speed.value, t0: t0.value, t1: t1.value,
      view: { cx: viewCamera.cx, cy: viewCamera.cy, ppmAtHeight: viewCamera.ppm, viewHeight: viewCamera.height },
      options: { ...state.display }, palette: state.theme === 'dark' ? DARK : LIGHT, selectedId: state.selection?.id ?? null,
      digits: state.digits, overlayIds: overlay.value, title: state.scene.name,
      units: settings.units, effects: videoEffects(), annotations: state.scene.annotations, style: settings.projector ? PROJECTOR_STYLE : null, bitrate: settings.export.bitrate
    }, p => { progress.value = p }, () => cancel)
    const path = await saveFile(out.data, `${safeName.value}.${out.extension}`, [{ name: out.extension === 'mp4' ? 'MP4 视频' : 'WebM 视频', extensions: [out.extension] }])
    if (path) { showToast(`已导出视频（${out.frames} 帧）：${path}`); logEvent('export.video', { frames: out.frames, format: out.extension, fps: fps.value }) }
  } catch (e) {
    showToast(`视频导出失败：${(e as Error).message}`, true)
  } finally {
    busy.value = false
  }
}
function toggle(list: string[], id: string) { const i = list.indexOf(id); if (i >= 0) list.splice(i, 1); else list.push(id) }

function openCourseware() { state.showExport = false; state.showCourseware = true }
function openReport() { state.showExport = false; state.showReport = true }
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="!busy && (state.showExport = false)">
    <div class="dialog">
      <div class="dialog-header"><Icon name="export" :size="18" />导出<span class="spacer" /><div class="tabs mini"><button :class="{ on: tab === 'csv' }" @click="tab = 'csv'">数据 CSV</button><button :class="{ on: tab === 'video' }" @click="tab = 'video'">视频</button></div><button class="btn icon ghost" :disabled="busy" @click="state.showExport = false"><Icon name="close" /></button></div>
      <div class="dialog-body">
        <div class="more">
          <button class="btn" :disabled="busy" title="视频、关键时刻截图、公式卡片、数据与 PPTX 一次导出" @click="openCourseware"><Icon name="template" />课件包…</button>
          <button class="btn" :disabled="busy" title="参数表、截图、曲线、公式对照与误差（HTML，可打印为 PDF）" @click="openReport"><Icon name="file" />实验报告…</button>
        </div>
        <div class="group">
          <div class="row"><label>开始时刻</label><NumField class="grow" :model-value="t0" :unit="unitLabel('s')" :scale="tScale" :min="0" :max="total" @update:model-value="v => (t0 = v)" /></div>
          <div class="row"><label>结束时刻</label><NumField class="grow" :model-value="t1" :unit="unitLabel('s')" :scale="tScale" :min="0" :max="total" @update:model-value="v => (t1 = v)" /></div>
        </div>
        <template v-if="tab === 'csv'">
          <div class="group">
            <div class="row"><label>每隔几帧取一行</label><NumField class="grow" :model-value="stride" :min="1" :step="1" @update:model-value="v => (stride = Math.max(1, Math.round(v)))" /></div>
            <div class="row"><label>数值单位</label>
              <select v-model="csvUnits" class="field grow">
                <option value="si">国际单位（与仿真结果逐位一致）</option>
                <option value="display">显示单位（按当前单位设置换算）</option>
              </select>
            </div>
            <div class="tiny muted">记录步长 Δt = {{ rec.dt }} s；每列表头注明单位。分隔符：{{ sepText }}，小数点：“{{ settings.export.csvDecimal }}”（在设置页“导出”中修改）。</div>
          </div>
          <div class="cols">
            <label v-for="q in all" :key="q.id" class="check small"><input type="checkbox" :checked="picked.includes(q.id)" @change="toggle(picked, q.id)" />{{ q.owner }} · {{ q.label }}</label>
          </div>
        </template>
        <template v-else>
          <div class="group">
            <div class="row"><label>分辨率</label><select v-model="res" class="field grow"><option value="1080">1920 × 1080</option><option value="720">1280 × 720</option></select></div>
            <div class="row"><label>帧率</label><select v-model.number="fps" class="field grow"><option :value="30">30 帧/秒</option><option :value="60">60 帧/秒</option></select></div>
            <div class="row"><label>播放速度</label><select v-model.number="speed" class="field grow"><option :value="0.1">0.1×（慢放）</option><option :value="0.25">0.25×</option><option :value="0.5">0.5×</option><option :value="1">1×（实时）</option><option :value="2">2×</option></select></div>
            <div class="tiny muted">画面与当前视图一致（位置、缩放、矢量、轨迹、标注与视觉效果）。共 {{ estFrames }} 帧，每帧按其仿真时刻取精确状态；叠加数值按当前显示单位。</div>
          </div>
          <div class="group-title">叠加显示的数值（最多 6 个）</div>
          <div class="cols">
            <label v-for="q in all.filter(q => state.scene.watch.includes(q.id))" :key="q.id" class="check small"><input type="checkbox" :checked="overlay.includes(q.id)" @change="toggle(overlay, q.id)" />{{ q.owner }} · {{ q.label }}</label>
            <span v-if="!state.scene.watch.length" class="tiny muted">（在“监视”页添加的量可叠加到视频上）</span>
          </div>
          <div v-if="busy" class="progress"><div class="bar" :style="{ width: `${(progress * 100).toFixed(1)}%` }" /></div>
        </template>
      </div>
      <div class="dialog-footer">
        <button v-if="busy" class="btn" @click="cancel = true">取消导出</button>
        <button v-else class="btn" @click="state.showExport = false">关闭</button>
        <button v-if="tab === 'csv'" class="btn primary" :disabled="!picked.length" @click="doCsv">导出 CSV</button>
        <button v-else class="btn primary" :disabled="busy || t1 <= t0" @click="doVideo">{{ busy ? `编码中 ${(progress * 100).toFixed(0)}%` : '导出视频' }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mini { width: 180px; margin-right: 8px; }
.more { display: flex; gap: 8px; margin-bottom: 10px; }
.cols { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 2px 12px; max-height: 260px; overflow: auto; padding: 4px; background: var(--group); border-radius: var(--radius-group); }
.row > label { width: 130px; }
.progress { height: 6px; background: var(--fill); border-radius: 6px; overflow: hidden; margin-top: 10px; }
.bar { height: 100%; background: var(--accent); transition: width 0.2s; }
</style>
