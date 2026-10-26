<script setup lang="ts">
/**
 * Parameter sweep dialog: pick one scene parameter (display units), a range and up to 50 values, and one
 * result per run (time of the first event of a kind, a quantity at a time, its max / min, or its final value).
 * Runs one after another through `startSimulation` (the interface stays usable; cancellable), plots the result
 * against the parameter with uPlot and exports the table as CSV or the plot as PNG.
 *
 * Mounted by App.vue while `state.showSweep` is true; closes itself by setting the flag to false.
 * No props, no emits. The current scene is copied when a sweep starts; editing it meanwhile does not matter.
 */
import { tl, paren, stripLabel } from '../../i18n'
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { state, showToast } from '../store'
import { settings, toDisp, unitLabel } from '../settings'
import { startSimulation } from '../simClient'
import { cloneScene } from '../../core/scene/io'
import { compileModel } from '../../core/solver/model'
import { buildSystem } from '../../core/solver/dynamics'
import type { ChangeType } from '../../core/solver/simulation'
import type { QuantityDef } from '../../core/observe/quantities'
import { listQuantities } from '../../core/observe/quantities'
import type { SweepMeasure, SweepParam, SweepPoint, SweepRunner } from '../../analysis/sweep'
import { MAX_SWEEP_POINTS, linspace, listSweepParams, measureUnit, runSweep } from '../../analysis/sweep'
import { EVENT_TYPES, eventTypeLabel } from '../../analysis/prediction'
import { tableCsv } from '../../export/csv'
import { CHART_DARK, CHART_LIGHT, chartPng } from '../../export/chartImage'
import { safeName } from '../../export/courseware'
import { ENGINE_VERSION, finiteDuration } from '../../core/scene/types'
import { formatSig } from '../../units/units'
import { saveFile } from '../../platform/files'
import { logEvent } from '../trialLog'
import NumField from './NumField.vue'
import Icon from './Icon.vue'

// ---- Parameter ----
const params = computed<SweepParam[]>(() => { try { return listSweepParams(state.scene) } catch { return [] } })
const groups = computed(() => {
  const m = new Map<string, SweepParam[]>()
  for (const p of params.value) { const l = m.get(p.group) ?? []; l.push(p); m.set(p.group, l) }
  return [...m.entries()]
})
const preferred = ['template:mu1', 'template:mu', 'template:theta', 'template:v0']
const paramId = ref(preferred.find(id => params.value.some(p => p.id === id)) ?? params.value[0]?.id ?? '')
const param = computed(() => params.value.find(p => p.id === paramId.value) ?? null)
const current = computed(() => { try { return param.value ? param.value.get(state.scene) : 0 } catch { return 0 } })
const from = ref(0)
const to = ref(1)
const count = ref(11)

const scaleOf = (si: string) => (si ? toDisp(1, si) : 1)
const labelOf = (si: string) => (si ? unitLabel(si) : '')
const fmt = (v: number | null, si: string, digits = state.digits) => (v === null || !Number.isFinite(v) ? '—' : formatSig(si ? toDisp(v, si) : v, digits))

function initRange() {
  const p = param.value
  if (!p) return
  const v = current.value
  let a = v === 0 ? 0 : v * 0.5, b = v === 0 ? 1 : v * 1.5
  if (a > b) [a, b] = [b, a]
  if (p.min !== undefined) a = Math.max(a, p.min)
  if (p.max !== undefined) b = Math.min(b, p.max)
  if (p.unit === '' && p.max === 1 && v === 0) b = 1
  from.value = Number(a.toPrecision(6))
  to.value = Number(b.toPrecision(6))
}
watch(paramId, initRange, { immediate: true })

// ---- Measure ----
const system = computed(() => {
  if (state.recording) return state.recording.system
  try { return buildSystem(compileModel(cloneScene(state.scene))) } catch { return null }
})
const quantities = computed<QuantityDef[]>(() => (system.value ? listQuantities(system.value) : []))
const qById = computed(() => new Map(quantities.value.map(q => [q.id, q])))
const dynamicBodies = computed(() => state.scene.bodies.filter(b => b.kind !== 'static'))
const presentEvents = computed(() => new Set((state.recording?.events ?? []).flatMap(e => e.changes.map(c => c.type))))
const mKind = ref<SweepMeasure['kind']>(presentEvents.value.size ? 'eventTime' : 'final')
const mEvent = ref<ChangeType>(EVENT_TYPES.find(e => presentEvents.value.has(e.type))?.type ?? 'stick')
const mBody = ref('')
const mQuantity = ref(state.scene.watch.find(id => qById.value.has(id)) ?? quantities.value[0]?.id ?? '')
const tMax = computed(() => finiteDuration(state.scene.settings))
const mTime = ref(Math.min(tMax.value, Number((tMax.value / 2).toPrecision(3))))

const measure = computed<SweepMeasure>(() => {
  if (mKind.value === 'eventTime') return { kind: 'eventTime', event: mEvent.value, body: mBody.value || null }
  if (mKind.value === 'valueAt') return { kind: 'valueAt', id: mQuantity.value, t: mTime.value }
  return { kind: mKind.value, id: mQuantity.value }
})
const unitOfQ = (id: string) => qById.value.get(id)?.unit ?? ''
const bodyName = (id: string) => state.scene.bodies.find(b => b.id === id)?.name ?? id
function measureLabel(m: SweepMeasure): string {
  if (m.kind === 'eventTime') return tl('首次{0}的时刻{1}', [eventTypeLabel(m.event), m.body ? paren(bodyName(m.body)) : ''])
  const q = qById.value.get(m.id)
  const name = q ? `${q.owner} ${q.label}` : m.id
  if (m.kind === 'valueAt') return tl('t = {0} {1} 时的{2}', [fmt(m.t, 's', 6), labelOf('s'), name])
  return tl('{0}的{1}', [name, m.kind === 'max' ? tl('最大值') : m.kind === 'min' ? tl('最小值') : tl('末值')])
}

// ---- Run ----
/** Display label of a parameter: object name plus field label; template parameters by their own label. */
function paramLabel(p: SweepParam): string {
  if (p.id.startsWith('template:')) return p.label
  return `${stripLabel(p.group).replace(/（.*）| \(.*\)/, '')} ${p.label}`
}
/** Kind of parameter for the trial log, without object ids: "body:mass", "pair:mu", "template:mu1". */
function paramKind(p: SweepParam): string {
  const parts = p.id.split(':')
  return parts[0] === 'template' || parts.length < 3 ? p.id : `${parts[0]}:${parts[parts.length - 1]}`
}
interface Frozen { param: string; paramUnit: string; measure: string; measureUnit: string }
const points = shallowRef<SweepPoint[]>([])
const frozen = ref<Frozen | null>(null)
const running = ref(false)
const progress = ref(0)
const elapsed = ref(0)
let cancelFlag = false

const values = computed(() => linspace(from.value, to.value, count.value))
const canRun = computed(() => !!param.value && count.value >= 1 && (count.value === 1 || to.value !== from.value) && (mKind.value === 'eventTime' || qById.value.has(mQuantity.value)))

async function run() {
  const p = param.value
  if (!p || running.value) return
  const m = measure.value
  frozen.value = { param: paramLabel(p), paramUnit: p.unit, measure: measureLabel(m), measureUnit: measureUnit(m, unitOfQ) }
  points.value = []
  running.value = true
  progress.value = 0
  cancelFlag = false
  const started = performance.now()
  const timer = setInterval(() => { elapsed.value = (performance.now() - started) / 1000 }, 250)
  const runner: SweepRunner = (scene, onProgress) => startSimulation(scene, { budgetMs: settings.sim.budgetSeconds * 1000, useWorker: settings.sim.worker, progressive: false }, { onProgress: (t, total) => onProgress(total > 0 ? t / total : 0) })
  try {
    await runSweep(cloneScene(state.scene), { param: p, values: values.value, measure: m }, runner, {
      onPoint: pt => { points.value = [...points.value, pt] },
      onProgress: f => { progress.value = f },
      cancelled: () => cancelFlag
    })
    logEvent('sweep.run', { ok: !cancelFlag, cancelled: cancelFlag, param: paramKind(p), n: values.value.length, done: points.value.length, results: points.value.filter(x => x.result !== null).length, measure: m.kind, seconds: Math.round((performance.now() - started) / 100) / 10 })
  } catch (e) {
    showToast(tl('参数扫描失败：{0}', [(e as Error).message]), true)
    logEvent('sweep.run', { ok: false, param: paramKind(p), n: values.value.length, done: points.value.length, measure: m.kind })
  } finally {
    clearInterval(timer)
    elapsed.value = (performance.now() - started) / 1000
    running.value = false
  }
}

const eta = computed(() => (running.value && progress.value > 0.02 ? Math.max(0, elapsed.value / progress.value - elapsed.value) : null))
const okCount = computed(() => points.value.filter(p => p.result !== null).length)

function status(p: SweepPoint): { text: string; cls: string } {
  if (p.error && p.result === null) return { text: p.error, cls: 'bad' }
  if (p.result === null) return { text: frozen.value?.measure.startsWith(tl('首次')) ? tl('未发生') : tl('无数值'), cls: 'warn' }
  if (p.incomplete) return { text: tl('未算完（达到计算时间上限）'), cls: 'warn' }
  return { text: tl('完成'), cls: 'ok' }
}

// ---- Plot ----
const plotHost = ref<HTMLDivElement | null>(null)
let plot: uPlot | null = null
function cssVar(name: string) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888' }

function drawPlot() {
  plot?.destroy()
  plot = null
  const el = plotHost.value
  const f = frozen.value
  if (!el || !f || !points.value.length) return
  const xs = points.value.map(p => (f.paramUnit ? toDisp(p.value, f.paramUnit) : p.value))
  const ys = points.value.map(p => (p.result === null ? null : f.measureUnit ? toDisp(p.result, f.measureUnit) : p.result))
  const axis = cssVar('--text-3'), grid = cssVar('--separator')
  const opts: uPlot.Options = {
    width: Math.max(300, el.clientWidth), height: 260,
    scales: { x: { time: false } },
    legend: { show: false },
    cursor: { drag: { x: false, y: false } },
    axes: [
      { stroke: axis, grid: { stroke: grid, width: 1 }, ticks: { stroke: grid }, label: `${f.param}${f.paramUnit && labelOf(f.paramUnit) ? ` / ${labelOf(f.paramUnit)}` : ''}`, labelSize: 16, size: 36, font: '11px sans-serif', labelFont: '11px sans-serif' },
      { stroke: axis, grid: { stroke: grid, width: 1 }, ticks: { stroke: grid }, label: `${f.measure}${labelOf(f.measureUnit) ? ` / ${labelOf(f.measureUnit)}` : ''}`, labelSize: 16, size: 60, font: '11px sans-serif', labelFont: '11px sans-serif' }
    ],
    series: [{}, { stroke: cssVar('--accent'), width: 1.8, points: { show: true, size: 6, fill: cssVar('--accent') }, spanGaps: false }]
  }
  plot = new uPlot(opts, [xs, ys] as uPlot.AlignedData, el)
}
watch([points, () => state.theme, () => settings.units], () => nextTick(drawPlot))
onBeforeUnmount(() => { cancelFlag = true; plot?.destroy() })

// ---- Export ----
function headerUnit(si: string) { const l = labelOf(si); return l ? ` [${l}]` : '' }

async function exportCsv() {
  const f = frozen.value
  if (!f) return
  const rows = points.value.map(p => [f.paramUnit ? toDisp(p.value, f.paramUnit) : p.value, p.result === null ? null : f.measureUnit ? toDisp(p.result, f.measureUnit) : p.result, status(p).text, p.hash ?? ''])
  const text = tableCsv([`${f.param}${headerUnit(f.paramUnit)}`, `${f.measure}${headerUnit(f.measureUnit)}`, tl('状态'), tl('结果指纹 SHA-256')], rows,
    { separator: settings.export.csvSeparator, decimal: settings.export.csvDecimal },
    [tl('VeloPhi {0} 参数扫描', [ENGINE_VERSION]), tl('场景: {0}', [state.scene.name]), tl('数值为显示单位（见表头）；最大值、最小值按记录帧取（步长 Δt），事件时刻为精确定位值')])
  const path = await saveFile(text, tl('{0}_参数扫描.csv', [safeName(state.scene.name)]), [{ name: tl('CSV 表格'), extensions: ['csv'] }])
  if (path) showToast(tl('已导出 {0}', [path]))
}

async function exportPng() {
  const f = frozen.value
  if (!f) return
  const dark = state.theme === 'dark'
  const png = await chartPng([{
    label: f.measure, color: dark ? '#3b8bff' : '#0a6cff', points: true,
    x: points.value.map(p => (f.paramUnit ? toDisp(p.value, f.paramUnit) : p.value)),
    y: points.value.map(p => (p.result === null ? null : f.measureUnit ? toDisp(p.result, f.measureUnit) : p.result))
  }], { width: 820, height: 480, title: tl('{0}：{1}随{2}的变化', [state.scene.name, f.measure, f.param]), xLabel: `${f.param}${headerUnit(f.paramUnit)}`, yLabel: `${f.measure}${headerUnit(f.measureUnit)}`, colors: settings.export.imageBackground === 'theme' && dark ? CHART_DARK : CHART_LIGHT, transparent: settings.export.imageBackground === 'transparent' })
  const path = await saveFile(png, tl('{0}_参数扫描.png', [safeName(state.scene.name)]), [{ name: tl('PNG 图片'), extensions: ['png'] }])
  if (path) showToast(tl('已导出 {0}', [path]))
}

function close() { if (running.value) { cancelFlag = true } state.showSweep = false }
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="!running && close()">
    <div class="dialog sweep">
      <div class="dialog-header"><Icon name="chart" :size="18" />{{ tl('参数扫描') }}<span class="spacer" /><button class="btn icon ghost" :title="tl('关闭')" @click="close"><Icon name="close" /></button></div>
      <div class="dialog-body">
        <div class="cols2">
          <section>
            <div class="group-title">{{ tl('扫描参数') }}</div>
            <div class="group">
              <div class="row"><label>{{ tl('参数') }}</label>
                <select v-model="paramId" class="field grow" :disabled="running">
                  <optgroup v-for="[g, list] in groups" :key="g" :label="g">
                    <option v-for="p in list" :key="p.id" :value="p.id">{{ p.label }}</option>
                  </optgroup>
                </select>
              </div>
              <div v-if="param" class="row"><label>{{ tl('当前值') }}</label><span class="mono small">{{ fmt(current, param.unit, 8) }} {{ labelOf(param.unit) }}</span></div>
              <div v-if="param" class="row"><label>{{ tl('从') }}</label><NumField class="grow" :model-value="from" :unit="labelOf(param.unit)" :scale="scaleOf(param.unit)" :min="param.min" :max="param.max" :disabled="running" @update:model-value="v => (from = v)" /></div>
              <div v-if="param" class="row"><label>{{ tl('到') }}</label><NumField class="grow" :model-value="to" :unit="labelOf(param.unit)" :scale="scaleOf(param.unit)" :min="param.min" :max="param.max" :disabled="running" @update:model-value="v => (to = v)" /></div>
              <div class="row"><label>{{ tl('取值个数') }}</label><NumField class="grow" :model-value="count" :min="1" :max="MAX_SWEEP_POINTS" :step="1" :disabled="running" @update:model-value="v => (count = Math.max(1, Math.min(MAX_SWEEP_POINTS, Math.round(v))))" /></div>
              <div v-if="param?.id.startsWith('template:')" class="tiny muted note">{{ tl('模板参数：每次运行按模板重新搭建场景（场景未改动过时才提供）。') }}</div>
            </div>
          </section>
          <section>
            <div class="group-title">{{ tl('每次运行的结果') }}</div>
            <div class="group">
              <div class="row"><label>{{ tl('结果') }}</label>
                <select v-model="mKind" class="field grow" :disabled="running">
                  <option value="eventTime">{{ tl('首次事件的时刻') }}</option>
                  <option value="valueAt">{{ tl('某时刻的物理量') }}</option>
                  <option value="max">{{ tl('物理量的最大值') }}</option>
                  <option value="min">{{ tl('物理量的最小值') }}</option>
                  <option value="final">{{ tl('物理量的末值') }}</option>
                </select>
              </div>
              <template v-if="mKind === 'eventTime'">
                <div class="row"><label>{{ tl('事件') }}</label>
                  <select v-model="mEvent" class="field grow" :disabled="running"><option v-for="e in EVENT_TYPES" :key="e.type" :value="e.type">{{ e.label }}{{ presentEvents.has(e.type) ? '' : tl('（本次未出现）') }}</option></select>
                </div>
                <div class="row"><label>{{ tl('涉及物体') }}</label>
                  <select v-model="mBody" class="field grow" :disabled="running"><option value="">{{ tl('任意') }}</option><option v-for="b in dynamicBodies" :key="b.id" :value="b.id">{{ b.name }}</option></select>
                </div>
              </template>
              <template v-else>
                <div class="row"><label>{{ tl('物理量') }}</label>
                  <select v-model="mQuantity" class="field grow" :disabled="running"><option v-for="q in quantities" :key="q.id" :value="q.id">{{ q.owner }} · {{ q.label }}</option></select>
                </div>
                <div v-if="mKind === 'valueAt'" class="row"><label>{{ tl('时刻') }}</label><NumField class="grow" :model-value="mTime" :unit="labelOf('s')" :scale="scaleOf('s')" :min="0" :max="tMax" :disabled="running" @update:model-value="v => (mTime = v)" /></div>
              </template>
              <div class="tiny muted note">{{ tl('每个取值运行一次完整仿真（求解设置与当前场景相同）。最大值、最小值按记录帧取；事件时刻为精确定位值。') }}</div>
            </div>
          </section>
        </div>

        <div v-if="running || points.length" class="results">
          <div class="res-head small">
            <b>{{ frozen?.measure }}</b><span class="muted"> {{ tl('随') }} </span><b>{{ frozen?.param }}</b>
            <span class="spacer" />
            <span class="muted tiny">{{ tl('{0}/{1} 次 · 有结果 {2} · 用时 {3} s', [points.length, running ? values.length : points.length, okCount, elapsed.toFixed(1)]) }}<template v-if="eta !== null"> {{ tl('· 约剩 {0} s', [eta.toFixed(0)]) }}</template></span>
          </div>
          <div v-if="running" class="progress"><div class="bar" :style="{ width: `${(progress * 100).toFixed(1)}%` }" /></div>
          <div ref="plotHost" class="plot" />
          <div class="table-wrap">
            <table>
              <thead><tr><th>#</th><th>{{ frozen?.param }}{{ frozen && labelOf(frozen.paramUnit) ? ` / ${labelOf(frozen.paramUnit)}` : '' }}</th><th>{{ frozen?.measure }}{{ frozen && labelOf(frozen.measureUnit) ? ` / ${labelOf(frozen.measureUnit)}` : '' }}</th><th>{{ tl('状态') }}</th></tr></thead>
              <tbody>
                <tr v-for="(p, i) in points" :key="i">
                  <td class="mono muted">{{ i + 1 }}</td>
                  <td class="mono">{{ fmt(p.value, frozen?.paramUnit ?? '', 6) }}</td>
                  <td class="mono">{{ fmt(p.result, frozen?.measureUnit ?? '') }}</td>
                  <td><span class="badge" :class="status(p).cls" :title="status(p).text">{{ status(p).text }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="dialog-footer">
        <button class="btn" :disabled="running || !points.length" @click="exportCsv">{{ tl('导出 CSV') }}</button>
        <button class="btn" :disabled="running || !points.length" @click="exportPng">{{ tl('导出图片') }}</button>
        <span class="spacer" />
        <button v-if="running" class="btn" @click="cancelFlag = true">{{ tl('停止') }}</button>
        <button v-else class="btn" @click="close">{{ tl('关闭') }}</button>
        <button class="btn primary" :disabled="running || !canRun" @click="run">{{ running ? tl('计算中 {0}%', [(progress * 100).toFixed(0)]) : tl('开始扫描（{0} 次）', [values.length]) }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sweep { width: min(980px, calc(100vw - 48px)); }
.cols2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.row > label { width: 76px; }
.note { padding: 6px 0 4px; line-height: 1.5; }
.results { margin-top: 12px; }
.res-head { display: flex; align-items: baseline; gap: 4px; margin: 0 2px 6px; }
.progress { height: 6px; background: var(--fill); border-radius: 6px; overflow: hidden; margin-bottom: 8px; }
.bar { height: 100%; background: var(--accent); transition: width 0.2s; }
.plot { background: var(--group); border-radius: var(--radius-group); padding: 6px; min-height: 40px; }
.table-wrap { max-height: 220px; overflow: auto; margin-top: 8px; }
table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
th { text-align: left; color: var(--text-3); font-weight: 600; font-size: 11.5px; padding: 4px 6px; position: sticky; top: 0; background: var(--pane); }
td { padding: 3px 6px; border-top: 1px solid var(--separator); }
td .badge { max-width: 280px; overflow: hidden; text-overflow: ellipsis; }
:deep(.uplot) { font-family: var(--font-ui); color: var(--text-2); }
.dialog-footer .spacer { flex: 1; }
@media (max-width: 760px) { .cols2 { grid-template-columns: 1fr; } }
</style>
