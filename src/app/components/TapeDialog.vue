<script setup lang="ts">
/**
 * 26.52 ticker tape dialog (D63): the strip a ticker timer would print for a body (teaching/tape.ts), the table
 * x₁ … xₙ, vₙ = (xₙ + xₙ₊₁)/(2T) beside the simulation's velocity, and the successive-difference acceleration beside
 * the simulation's average. Export as PNG, SVG or CSV.
 *
 * Mounted by App.vue while `state.showTape` is true (and a recording exists).
 */
import { tl } from '../../i18n'
import { computed, reactive, ref, watch } from 'vue'
import { state, showToast, pause, seekContinuous } from '../store'
import { settings } from '../settings'
import type { TapeDirection } from '../../teaching/tape'
import { cm, tapeData, tapeSvg } from '../../teaching/tape'
import { formatSig } from '../../units/units'
import { svgToPng } from '../../export/formulaImage'
import { safeName } from '../../export/safeName'
import { tableCsv } from '../../export/csv'
import { saveFile } from '../../platform/files'
import { logEvent } from '../trialLog'
import NumField from './NumField.vue'
import Icon from './Icon.vue'

const rec = computed(() => (state.stale ? null : state.recording))
const bodies = computed(() => rec.value?.system.model.dynamic ?? [])
const tMax = computed(() => (rec.value ? Math.max(0, (rec.value.frameCount - 1) * rec.value.dt) : 0))
const sel = state.selection
const opt = reactive({
  bodyId: sel && bodies.value.some(b => b.id === sel.id) ? sel.id : bodies.value[0]?.id ?? '',
  direction: 'path' as TapeDirection,
  // From the playhead when at least two counting intervals follow it, else from the start of the run
  start: tMax.value - state.time >= 2 * settings.teaching.tape.period * settings.teaching.tape.every ? state.time : 0,
  intervals: 6,
  dark: false
})
const tape = settings.teaching.tape
const busy = ref(false)
const PRESETS = [{ label: tl('50 Hz（0.02 s）'), v: 0.02 }, { label: tl('60 Hz（1/60 s）'), v: 1 / 60 }, { label: tl('10 Hz（0.1 s）'), v: 0.1 }]
watch(() => opt.start, t => { pause(); seekContinuous(t) })
watch(() => tape.every, v => { if (v !== Math.round(v)) tape.every = Math.max(1, Math.round(v)) })
watch(() => opt.intervals, v => { if (v !== Math.round(v)) opt.intervals = Math.max(1, Math.round(v)) })

const data = computed(() => (rec.value && opt.bodyId ? tapeData(rec.value, { bodyId: opt.bodyId, direction: opt.direction, period: tape.period, every: tape.every, start: opt.start, intervals: opt.intervals }) : null))
const drawing = computed(() => (data.value ? tapeSvg(data.value, { theme: opt.dark ? 'dark' : 'light', digits: state.digits }) : null))
const f = (v: number | null) => (v === null ? '—' : formatSig(v, state.digits))
const relErr = computed(() => {
  const d = data.value
  if (!d || d.accel === null || d.simAccel === null) return null
  const ref0 = Math.abs(d.simAccel)
  return ref0 > 0 ? Math.abs(d.accel - d.simAccel) / ref0 : Math.abs(d.accel)
})
const formula = computed(() => {
  const d = data.value
  if (!d || d.used < 2) return ''
  const m = d.used / 2
  const xs = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_v, i) => `x${a + i}`).join('+')
  return m === 1 ? 'a = (x₂ − x₁) / T²' : `a = [(${xs(m + 1, 2 * m)}) − (${xs(1, m)})] / (${m * m}T²)`
})

function fileBase(): string { return safeName(`${state.scene.name}-${tl('纸带')}-${data.value?.name ?? ''}`) }
async function saveSvg() {
  const g = drawing.value
  if (!g) return
  const path = await saveFile(g.svg, `${fileBase()}.svg`, [{ name: 'SVG', extensions: ['svg'] }])
  if (path) { showToast(tl('已保存 {0}', [path])); logEvent('teach.tape', { format: 'svg' }) }
}
async function savePng() {
  const g = drawing.value
  if (!g) return
  busy.value = true
  try {
    const png = await svgToPng(g.svg, g.width, g.height, 2)
    const path = await saveFile(png, `${fileBase()}.png`, [{ name: 'PNG', extensions: ['png'] }])
    if (path) { showToast(tl('已保存 {0}', [path])); logEvent('teach.tape', { format: 'png' }) }
  } catch (e) {
    showToast(tl('导出失败：{0}', [(e as Error).message]), true)
  } finally { busy.value = false }
}
async function saveCsv() {
  const d = data.value
  if (!d) return
  const fmt = { separator: settings.export.csvSeparator, decimal: settings.export.csvDecimal }
  const dots = d.dots.map((p, k) => [k, k % d.every === 0 ? k / d.every : '', p.t, p.s])
  const comments = [
    tl('纸带：{0}，打点周期 {1} s，每 {2} 个点一个计数点，T = {3} s', [d.name, d.period, d.every, d.T]),
    tl('逐差法加速度 a = {0} m/s²（用 {1} 段）；仿真平均加速度 {2} m/s²', [d.accel ?? '—', d.used, d.simAccel ?? '—'])
  ]
  const csv = tableCsv([tl('点序号'), tl('计数点'), tl('时刻 t (s)'), tl('位置 s (m)')], dots, fmt, comments)
    + '\n' + tableCsv([tl('段'), tl('长度 x (m)'), tl('计数点'), tl('纸带速度 v (m/s)'), tl('仿真速度 v (m/s)')], d.lengths.map((x, j) => {
      const v = d.velocities.find(r => r.n === j + 1)
      return [`x${j + 1}`, x, v ? v.n : '', v ? v.tape : '', v ? v.sim : '']
    }), fmt)
  const path = await saveFile(csv, `${fileBase()}.csv`, [{ name: 'CSV', extensions: ['csv'] }])
  if (path) { showToast(tl('已保存 {0}', [path])); logEvent('teach.tape', { format: 'csv' }) }
}
function close() { state.showTape = false }
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="close">
    <div class="dialog tape" role="dialog" :aria-label="tl('打点计时器纸带')">
      <div class="dialog-header"><Icon name="tape" :size="18" />{{ tl('打点计时器纸带') }}<span class="spacer" /><button class="btn icon ghost" :title="tl('关闭')" @click="close"><Icon name="close" /></button></div>
      <div v-if="!rec" class="dialog-body"><div class="empty">{{ tl('请先运行仿真（结果需与当前场景一致）。') }}</div></div>
      <div v-else-if="!bodies.length" class="dialog-body"><div class="empty">{{ tl('场景中没有可分析的动态物体。') }}</div></div>
      <div v-else class="dialog-body">
        <div class="controls">
          <div class="row"><label>{{ tl('研究对象') }}</label><select v-model="opt.bodyId" class="field"><option v-for="b in bodies" :key="b.id" :value="b.id">{{ b.name }}</option></select></div>
          <div class="row"><label>{{ tl('纸带记录') }}</label><select v-model="opt.direction" class="field"><option value="path">{{ tl('路程（沿轨迹）') }}</option><option value="x">{{ tl('沿 x 的位移') }}</option><option value="y">{{ tl('沿 y 的位移') }}</option></select></div>
          <div class="row"><label>{{ tl('打点周期') }}</label>
            <select class="field" :value="PRESETS.find(p => Math.abs(p.v - tape.period) < 1e-12)?.v ?? 'custom'" @change="e => { const v = (e.target as HTMLSelectElement).value; if (v !== 'custom') tape.period = Number(v) }">
              <option v-for="p in PRESETS" :key="p.v" :value="p.v">{{ p.label }}</option><option value="custom">{{ tl('自定义') }}</option>
            </select>
            <NumField v-model="tape.period" unit="s" :min="0.001" :max="1" width="96px" />
          </div>
          <div class="row"><label>{{ tl('计数点间隔') }}</label><NumField v-model="tape.every" :label="tl('个点')" :min="1" :max="50" :step="1" width="96px" /><span class="muted small">T = {{ formatSig(tape.period * tape.every, 4) }} s</span></div>
          <div class="row"><label>{{ tl('起点') }}</label><input v-model.number="opt.start" type="range" class="grow" min="0" :max="tMax" :step="rec.dt" /><span class="mono small tval">{{ formatSig(opt.start, 4) }} s</span></div>
          <div class="row"><label>{{ tl('段数') }}</label><NumField v-model="opt.intervals" :label="tl('段')" :min="1" :max="12" :step="1" width="96px" /><label class="check small"><input v-model="opt.dark" type="checkbox" />{{ tl('深色背景') }}</label></div>
        </div>
        <div class="preview" :class="{ dark: opt.dark }" v-html="drawing?.svg ?? ''" />
        <div v-if="!data" class="empty small">{{ tl('从该起点到运行结束不足一个计数间隔，请把起点前移或缩短打点周期。') }}</div>
        <div v-else class="results">
          <table class="tbl small">
            <thead><tr><th>{{ tl('段') }}</th><th v-for="(_x, j) in data.lengths" :key="j">x<sub>{{ j + 1 }}</sub></th></tr></thead>
            <tbody><tr><td>{{ tl('长度') }}</td><td v-for="(x, j) in data.lengths" :key="j" class="mono">{{ cm(x, state.digits) }}</td></tr></tbody>
          </table>
          <table v-if="data.velocities.length" class="tbl small">
            <thead><tr><th>{{ tl('计数点') }}</th><th v-for="v in data.velocities" :key="v.n">{{ v.n }}</th></tr></thead>
            <tbody>
              <tr><td>v<sub>n</sub> = (x<sub>n</sub> + x<sub>n+1</sub>)/(2T)</td><td v-for="v in data.velocities" :key="v.n" class="mono">{{ f(v.tape) }}</td></tr>
              <tr><td>{{ tl('仿真速度') }}</td><td v-for="v in data.velocities" :key="v.n" class="mono muted">{{ f(v.sim) }}</td></tr>
            </tbody>
          </table>
          <div v-if="data.accel !== null" class="accel">
            <span class="mono">{{ formula }}</span>
            <b class="mono">= {{ f(data.accel) }} m/s²</b>
            <span class="muted">{{ tl('仿真平均加速度 {0} m/s²', [f(data.simAccel)]) }}</span>
            <span v-if="relErr !== null" class="badge" :class="relErr < 0.02 ? 'ok' : 'warn'">{{ tl('相对差 {0}', [`${formatSig(relErr * 100, 3)}%`]) }}</span>
          </div>
          <div class="tiny muted note">{{ tl('点位由记录的精确状态生成（不是帧间插值）。速度单位 m/s；加速度为负表示减速（沿纸带方向）。仿真平均加速度 = 该段时间内速度的变化 ÷ 时间。') }}</div>
        </div>
      </div>
      <div class="dialog-footer">
        <button class="btn" @click="close">{{ tl('关闭') }}</button>
        <span class="spacer" />
        <button class="btn" :disabled="!data" @click="saveCsv"><Icon name="download" />CSV</button>
        <button class="btn" :disabled="!drawing" @click="saveSvg"><Icon name="download" />SVG</button>
        <button class="btn primary" :disabled="!drawing || busy" @click="savePng"><Icon name="download" />{{ busy ? tl('生成中…') : 'PNG' }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tape { width: min(1080px, calc(100vw - 48px)); }
.controls { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 18px; margin-bottom: 10px; }
.row { display: flex; align-items: center; gap: 8px; }
.row > label:first-child { width: 78px; flex: 0 0 auto; }
.row .field { flex: 1; min-width: 0; }
.tval { width: 64px; text-align: right; }
.preview { overflow-x: auto; border: 1px solid var(--separator); border-radius: var(--radius-group); background: #fff; padding: 6px; }
.preview.dark { background: #141518; }
.preview :deep(svg) { display: block; }
.results { margin-top: 10px; display: flex; flex-direction: column; gap: 8px; }
.tbl { border-collapse: collapse; }
.tbl th, .tbl td { padding: 3px 10px; border-bottom: 1px solid var(--separator); text-align: right; white-space: nowrap; }
.tbl th:first-child, .tbl td:first-child { text-align: left; color: var(--text-2); }
.tbl th { color: var(--text-3); font-weight: 500; }
.accel { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.note { line-height: 1.5; }
@media (max-width: 860px) { .controls { grid-template-columns: 1fr; } }
</style>
