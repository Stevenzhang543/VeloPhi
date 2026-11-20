<script setup lang="ts">
/**
 * The reactor workshop (26.64, D277; 物理实验 › 原子与核): build a core on a grid from twelve materials or start from
 * a preset, see its multiplication factor and the two-group flux and power maps, start it and drive it — rods, pump,
 * heat exchanger, turbine — with the protection of the model, watch power, temperatures, reactivity and the poisons,
 * read the reactivity budget, and work through six tasks the core checks. All numbers are results of the core
 * (src/engine/nuclear.ts); state and actions are src/nuclear/reactor/workshop.ts.
 *
 * A teaching model (D278): two-group diffusion on homogenised cells, point kinetics, lumped thermal hydraulics. The
 * page says so permanently and lists what the model leaves out; it stops before prompt critical and ends at fuel
 * damage, as the core reports.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { activeLang, tl } from '../../../i18n'
import { showToast, state } from '../../store'
import { labState } from '../../lab/state'
import { addUiTestHook } from '../../uitest'
import type { ReactorPresetId, ReactorTask } from '../../../engine/nuclear'
import { cellKey, rodOrder, sharedWorkshop } from '../../../nuclear/reactor/workshop'
import { TASKS, checkText, taskGoal, taskTitle } from '../../../nuclear/reactor/tasks'
import { FLUX_RAMP, materialColour } from '../../../nuclear/reactor/palette'
import { CURVE_COLOURS } from '../../../nuclear/chain'
import { diagnosticLines, diagnosticText, severityText, tripReason } from '../../../nuclear/diagText'
import { fixed, kelvinText, pcmText, percentText, powerText, sig, timeText, withUnit } from '../../../nuclear/format'
import Icon from '../Icon.vue'
import NumField from '../NumField.vue'
import LabChart from '../lab/LabChart.vue'
import type { MapMode } from './ReactorMap.vue'
import ReactorMap from './ReactorMap.vue'
import ReactorStudies from './ReactorStudies.vue'

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })

type Tab = 'core' | 'run' | 'balance' | 'tasks' | 'studies' | 'about'
const S = labState('reactor', () => ({
  preset: 'research' as ReactorPresetId, map: 'material' as MapMode, tab: 'core' as Tab, tool: 'select' as string, plot: 'temperature' as 'temperature' | 'reactivity' | 'poisons',
  study: 'kinetics' as 'kinetics' | 'poisons', rhoPcm: 100, duration: 120, flux: 3e13, fissionRate: 1e13, shutdownH: 4, hours: 72
}))
const ws = sharedWorkshop()
const s = ws.s
const dark = computed(() => state.theme === 'dark')
const lang = computed(() => activeLang())
const selected = ref<string | null>(null)
const hovered = ref<string | null>(null)

onMounted(async () => { if (!s.ready) await ws.init(S.preset) })
const PRESET_TEXT: Record<ReactorPresetId, () => string> = { pwrLattice: () => tl('压水堆栅格'), graphitePile: () => tl('天然铀石墨堆'), heavyWater: () => tl('重水堆'), research: () => tl('小型研究堆') }
async function choosePreset(id: string) {
  if (id === 'custom') return
  S.preset = id as ReactorPresetId
  stopClock()
  selected.value = null
  await ws.loadPreset(S.preset)
}
watch(() => s.notice, n => { if (n === 'runReset') { showToast(tl('布局已改动，运行已复位；请重新启动。')); s.notice = '' } })

// ---- the layout ----
const doc = computed(() => s.doc)
const materialName = (id: string) => { const m = s.materials.find(x => x.id === id); return m ? m.name[lang.value] ?? m.name.zh : id }
const tools = computed(() => s.materials.map(m => ({ id: m.id, name: m.name[lang.value] ?? m.name.zh, kind: m.kind, colour: materialColour(m.id, dark.value), rod: m.id === 'b4c' || m.id === 'agincd' })))
const isRodTool = (id: string) => id === 'b4c' || id === 'agincd'
async function apply(x: number, y: number, drag: boolean) {
  selected.value = cellKey(x, y)
  if (S.tool === 'select') return
  if (S.tool === 'detector') { if (!drag) await ws.toggleDetector(x, y); return }
  if (isRodTool(S.tool)) { if (!drag) await ws.toggleRod(x, y, S.tool); return }
  await ws.paint(x, y, S.tool)
}
function applySelected() { if (selected.value) { const [x, y] = selected.value.split(',').map(Number); void apply(x, y, false) } }
const cellInfo = computed(() => {
  const d = doc.value, key = selected.value ?? hovered.value
  if (!d || !key) return null
  const [x, y] = key.split(',').map(Number)
  const i = y * d.grid.nx + x
  const id = String(d.cells[i])
  const c = s.crit
  // the first refined cell of this cell in the solution's grid
  const f = c ? Math.round(c.nx / d.grid.nx) : 1
  const j = c ? y * f * c.nx + x * f : 0
  return {
    key, x, y, material: id, name: materialName(id), fuel: id === 'fuel_leu' || id === 'fuel_nat', adjustable: id === 'fuel_leu',
    enrichment: id === 'fuel_leu' ? d.enrich?.[key] ?? d.enrichment ?? s.materials.find(m => m.id === 'fuel_leu')?.fuel?.enrichment ?? null : null,
    rod: d.rods?.[key] ?? null, detector: (d.detectors ?? []).includes(key),
    flux1: c ? c.flux1[j] : null, flux2: c ? c.flux2[j] : null, power: c ? c.cellPower[i] : null
  }
})
const rodCount = computed(() => Object.keys(doc.value?.rods ?? {}).length)
const fuelRange = computed(() => s.materials.find(m => m.id === 'fuel_leu')?.fuel ?? null)
const hasLeu = computed(() => !!doc.value?.cells.includes('fuel_leu'))
/** The rods as they stand: in the running reactor, or in the document. */
const liveRods = computed(() => s.run?.rods ?? null)
const selectedRodDepth = computed(() => {
  const d = doc.value, key = selected.value
  if (!d || !key || !d.rods?.[key]) return null
  if (s.run) { const i = rodOrder(d).indexOf(key); return i >= 0 ? s.run.rods[i] : null }
  return d.rods[key].insertion
})
const buildRodDepth = computed(() => { const r = Object.values(doc.value?.rods ?? {}); return r.length ? r[0].insertion : 0 })

/** The colour ramp of the flux and power maps, for the key under the map. */
const rampCss = `linear-gradient(90deg, ${FLUX_RAMP.join(', ')})`

// ---- running ----
const mode = computed<'build' | 'run'>(() => (s.run ? 'run' : 'build'))
const SPEEDS = [1, 10, 60, 600, 3600]
const ROD_SPEEDS: Array<[number, () => string]> = [[0.0001, () => tl('很慢')], [0.0005, () => tl('慢')], [0.002, () => tl('中')], [0.02, () => tl('快')]]
let clock: ReturnType<typeof setInterval> | null = null
let stepping = false
let sinceMaps = 0
const TICK = 0.2
function stopClock() { if (clock) clearInterval(clock); clock = null; s.running = false }
function startClock() {
  if (!s.run || s.run.ended) return
  s.running = true
  if (clock) return
  clock = setInterval(async () => {
    if (!s.running || stepping || !props.active) return
    stepping = true
    try {
      await ws.step(s.speed * TICK, 4)
      sinceMaps += TICK
      // the maps follow the rods and the temperatures a few times a minute, not every tick (a solution takes 10–100 ms)
      if (S.map !== 'material' && sinceMaps >= 3) { sinceMaps = 0; await ws.refreshMaps() }
    } finally { stepping = false }
    if (!s.running || s.run?.ended) stopClock()
  }, TICK * 1000)
}
onBeforeUnmount(stopClock)
async function start(kind: 'cold' | 'power') { stopClock(); await ws.start(kind); if (s.run) S.tab = 'run' }
async function endRun() { stopClock(); await ws.stop() }
function toggleRun() { if (s.running) { stopClock(); void ws.refreshMaps() } else startClock() }
async function scram() { await ws.scram(); if (!s.running) startClock() }
async function resetTrip() { await ws.resetTrip() }
function setRods(v: number) { s.rodTarget = v; if (s.run) ws.control({ rods: v }); else void ws.setRodInsertion(null, v) }
function setSelectedRod(v: number) { const key = selected.value; if (!key) return; if (s.run) ws.control({ rods: { [key]: v } }); else void ws.setRodInsertion(key, v) }
const pump = computed(() => s.loop.pump)
const status = computed(() => {
  const r = s.run
  if (!r) return { cls: '', text: tl('搭建中') }
  if (r.ended) return { cls: 'bad', text: r.ended.reason === 'coreDamage' ? tl('堆芯损坏') : tl('超出模型范围') }
  if (r.trip) return { cls: 'warn', text: tl('保护停堆：{0}', [tripReason(r.trip.reason)]) }
  return { cls: s.running ? 'ok' : 'info', text: s.running ? tl('运行中') : tl('已暂停') }
})
const ended = computed(() => {
  const e = s.run?.ended
  if (!e) return ''
  return diagnosticText(e.reason === 'coreDamage' ? { code: 'reactor.coreDamage', severity: 'error', params: { t: e.t, fuelT: e.value, limit: e.limit } } : { code: 'reactor.promptCritical', severity: 'unmodelled', params: { t: e.t, rho: e.value, limit: e.limit } })
})
const notes = computed(() => { lang.value; return diagnosticLines(s.diagnostics, ['reactor.teachingModel', 'reactor.coreDamage', 'reactor.promptCritical', 'reactor.solveBudget']) })
const events = computed(() => { lang.value; return s.events.slice(-6).reverse().map(e => ({ t: timeText(e.t), text: e.kind === 'trip' ? tl('保护停堆：{0}', [tripReason(e.reason ?? '')]) : e.kind === 'coreDamage' ? tl('堆芯损坏') : tl('超出模型范围') })) })
const protection = computed(() => doc.value?.protection ?? {})
const periodText = (p: number | undefined) => (p === undefined || !Number.isFinite(p) || Math.abs(p) > 1e6 ? '∞' : (p < 0 ? '−' : '') + timeText(Math.abs(p)))

// ---- charts of the run ----
const colour = (i: number) => CURVE_COLOURS[i][dark.value ? 1 : 0]
const powerSeries = computed(() => [{ version: s.historyVersion, x: s.history.t, y: s.history.n, color: colour(0), label: tl('相对功率') }])
/** The power axis starts at zero and reaches at least 1.2 (a choice of the drawing). */
const powerRange = computed<[number, number]>(() => { let m = 1.2; if (s.historyVersion >= 0) for (const v of s.history.n) if (v > m) m = v; return [0, m * 1.05] })
const plotSeries = computed(() => {
  // the record is plain data: this is recomputed when its version changes
  const h = s.historyVersion >= 0 ? s.history : s.history
  if (S.plot === 'temperature') return [{ x: h.t, y: h.fuelPeakT, color: colour(1), label: tl('燃料最高') }, { x: h.t, y: h.fuelT, color: colour(3), label: tl('燃料平均') }, { x: h.t, y: h.coolantT, color: colour(0), label: tl('冷却剂') }]
  // reactivity in pcm: 1 pcm = 10⁻⁵
  if (S.plot === 'reactivity') return [{ x: h.t, y: h.rho.map(v => v * 1e5), color: colour(0), label: tl('总反应性') }, { x: h.t, y: h.rhoStatic.map(v => v * 1e5), color: colour(2), label: tl('布局') }, { x: h.t, y: h.rhoFeedback.map(v => v * 1e5), color: colour(1), label: tl('反馈') }]
  return [{ x: h.t, y: h.xenon, color: colour(0), label: '¹³⁵Xe' }, { x: h.t, y: h.iodine, color: colour(1), label: '¹³⁵I' }, { x: h.t, y: h.samarium, color: colour(2), label: '¹⁴⁹Sm' }]
})
const plotLabel = computed(() => (S.plot === 'temperature' ? 'T / K' : S.plot === 'reactivity' ? 'ρ / pcm' : tl('核密度 / 10²⁴ cm⁻³')))

// ---- reactivity budget ----
const BALANCE_TEXT: Record<string, () => string> = { excess: () => tl('冷态净堆的剩余反应性'), fuelTemperature: () => tl('燃料温度（多普勒）'), moderatorTemperature: () => tl('慢化剂温度与空泡'), xenon: () => tl('氙-135'), samarium: () => tl('钐-149'), rods: () => tl('控制棒'), shim: () => tl('补偿') }
const balanceRows = computed(() => { lang.value; return (s.balance?.entries ?? []).map(e => ({ id: e.id, label: BALANCE_TEXT[e.id]?.() ?? e.id, rho: pcmText(e.rho, 0), k: fixed(e.k, 5) })) })

// ---- tasks ----
const taskList = computed(() => { lang.value; return TASKS.map(t => ({ id: t.id, title: taskTitle(t.id), goal: taskGoal(t.id) })) })
async function beginTask(id: ReactorTask) {
  stopClock()
  selected.value = null
  await ws.startTask(id)
  const def = TASKS.find(t => t.id === id)!
  S.preset = def.preset
  if (def.setup === 'build') S.map = 'material'
}
const taskChecks = computed(() => { lang.value; const r = s.task.result; return r ? r.checks.map(c => ({ id: c.id, ok: c.ok, text: checkText(r.task, c) })) : [] })

// ---- what the model leaves out (D278) ----
const leftOut = computed(() => [
  tl('只有两个能群的扩散近似，每格的截面是均匀化的教学数值，不是评价核数据。'),
  tl('平面二维布局，轴向只用一个曲率修正；没有三维的通量形状。'),
  tl('随时间的行为是点堆动力学：通量的形状不随时间变化，只在需要时重新求一次稳态。'),
  tl('热工是集总的：一个燃料温度、一个冷却剂温度、一个慢化剂温度；没有子通道、沸腾危机与结构力学。'),
  tl('没有燃耗、没有可燃毒物与硼酸浓度；毒物只有氙-135 与钐-149。'),
  tl('只做慢中子堆的稳态与慢瞬态。反应性到 0.9 β 就停下，不计算瞬发临界之后的任何事；燃料最多 5 % 富集度。')
])

addUiTestHook('reactor', { ws, s, S, select: (x: number, y: number) => { selected.value = cellKey(x, y) }, startClock, stopClock })
</script>

<template>
  <div class="lab-shell rx" data-ui="reactor-lab">
    <div class="lab-stage">
      <div class="lab-bar">
        <label class="ctl">{{ tl('预设') }}
          <select class="field small" data-ui="reactor-preset" :value="s.presetId" :aria-label="tl('预设')" @change="choosePreset(($event.target as HTMLSelectElement).value)">
            <option v-if="s.presetId === 'custom'" value="custom">{{ tl('自定布局') }}</option>
            <option v-for="id in ws.presetIds()" :key="id" :value="id">{{ PRESET_TEXT[id]() }}</option>
          </select>
        </label>
        <label class="ctl">{{ tl('显示') }}
          <select v-model="S.map" class="field small" data-ui="reactor-map-mode" :aria-label="tl('显示')">
            <option value="material">{{ tl('材料') }}</option>
            <option value="flux1">{{ tl('快群通量') }}</option>
            <option value="flux2">{{ tl('热群通量') }}</option>
            <option value="power">{{ tl('功率密度') }}</option>
          </select>
        </label>
        <span class="keff num" data-ui="reactor-keff" :title="tl('有效增殖因数')">k<sub>eff</sub> = <b>{{ s.crit ? fixed(s.crit.keff, 5) : '—' }}</b></span>
        <span class="grow" />
        <template v-if="mode === 'build'">
          <button class="btn small" data-ui="reactor-start-cold" :disabled="!s.ready || s.busy" :title="tl('冷态、停堆，按布局里的棒位')" @click="start('cold')">{{ tl('冷态启动') }}</button>
          <button class="btn small" data-ui="reactor-start-power" :disabled="!s.ready || s.busy" :title="tl('额定功率下的平衡状态，控制棒在临界位置')" @click="start('power')">{{ tl('满功率') }}</button>
        </template>
        <template v-else>
          <button class="btn small primary" data-ui="reactor-play" :disabled="!!s.run?.ended" :aria-label="s.running ? tl('暂停') : tl('运行')" @click="toggleRun"><Icon :name="s.running ? 'pause' : 'play'" :size="14" />{{ s.running ? tl('暂停') : tl('运行') }}</button>
          <label class="ctl">{{ tl('时间') }}
            <select v-model.number="s.speed" class="field small" data-ui="reactor-speed" :aria-label="tl('时间倍率')"><option v-for="k in SPEEDS" :key="k" :value="k">× {{ k }}</option></select>
          </label>
          <button class="btn small scram" data-ui="reactor-scram" :disabled="!!s.run?.ended || !!s.run?.scram" :title="tl('落下全部控制棒')" @click="scram">{{ tl('紧急停堆') }}</button>
          <button class="btn small" data-ui="reactor-end" :title="tl('回到搭建')" @click="endRun">{{ tl('结束运行') }}</button>
        </template>
      </div>

      <div class="teach small" role="note" data-ui="reactor-teaching">
        <Icon name="info" :size="14" />
        <span>{{ tl('教学模型：两群扩散、均匀化截面、集总热工，不能用于设计或安全分析。') }}</span>
        <button class="tlink" data-ui="reactor-about" @click="S.tab = 'about'">{{ tl('模型边界') }}</button>
      </div>
      <div v-if="s.error" class="rerr small" role="alert" data-ui="reactor-error">{{ s.error }}</div>
      <div v-if="ended" class="rerr small" role="alert" data-ui="reactor-ended">{{ ended }}</div>

      <div class="rbody" :class="mode">
        <div class="rmap-wrap">
          <ReactorMap v-if="doc" :doc="doc" :crit="s.crit" :mode="S.map" :dark="dark" :selected="selected" :rods="liveRods" @cell="apply" @hover="(x, y) => (hovered = cellKey(x, y))" @move="(x, y) => (selected = cellKey(x, y))" @apply="applySelected" />
          <div v-else class="small loading">{{ tl('正在载入截面数据…') }}</div>
          <div v-if="doc && S.map !== 'material'" class="ramp tiny num" data-ui="reactor-ramp"><span>0</span><i :style="{ background: rampCss }" /><span>{{ tl('图上的最大值') }}</span></div>
        </div>
        <div v-if="mode === 'build'" class="palette" data-ui="reactor-palette" role="toolbar" :aria-label="tl('材料与工具')">
          <button class="swatch" :class="{ on: S.tool === 'select' }" data-tool="select" @click="S.tool = 'select'"><Icon name="target" :size="14" /><span>{{ tl('选择') }}</span></button>
          <button v-for="m in tools" :key="m.id" class="swatch" :class="{ on: S.tool === m.id }" :data-tool="m.id" :title="m.rod ? tl('在格上加一根或取走这种控制棒') : tl('把格子改成这种材料')" @click="S.tool = m.id">
            <span class="chip" :class="{ rod: m.rod }" :style="{ background: m.colour }" /><span>{{ m.name }}</span>
          </button>
          <button class="swatch" :class="{ on: S.tool === 'detector' }" data-tool="detector" @click="S.tool = 'detector'"><span class="chip ring" /><span>{{ tl('探测器') }}</span></button>
        </div>
        <div v-else class="rplots" data-ui="reactor-plots">
          <LabChart :series="powerSeries" x-label="t / s" :y-label="tl('相对功率 n')" :y-range="powerRange" :height="190" />
          <div class="lab-seg plot-seg" :aria-label="tl('第二张图')">
            <button :class="{ on: S.plot === 'temperature' }" data-ui="reactor-plot-temperature" @click="S.plot = 'temperature'">{{ tl('温度') }}</button>
            <button :class="{ on: S.plot === 'reactivity' }" data-ui="reactor-plot-reactivity" @click="S.plot = 'reactivity'">{{ tl('反应性') }}</button>
            <button :class="{ on: S.plot === 'poisons' }" data-ui="reactor-plot-poisons" @click="S.plot = 'poisons'">{{ tl('毒物') }}</button>
          </div>
          <LabChart :series="plotSeries" x-label="t / s" :y-label="plotLabel" :height="190" />
        </div>
      </div>
    </div>

    <aside class="lab-side">
      <div class="lab-seg tabs" role="tablist" :aria-label="tl('反应堆工坊')">
        <button role="tab" :aria-selected="S.tab === 'core'" :class="{ on: S.tab === 'core' }" data-tab="core" @click="S.tab = 'core'">{{ tl('堆芯') }}</button>
        <button role="tab" :aria-selected="S.tab === 'run'" :class="{ on: S.tab === 'run' }" data-tab="run" @click="S.tab = 'run'">{{ tl('运行') }}</button>
        <button role="tab" :aria-selected="S.tab === 'balance'" :class="{ on: S.tab === 'balance' }" data-tab="balance" @click="S.tab = 'balance'">{{ tl('收支') }}</button>
        <button role="tab" :aria-selected="S.tab === 'tasks'" :class="{ on: S.tab === 'tasks' }" data-tab="tasks" @click="S.tab = 'tasks'">{{ tl('任务') }}</button>
        <button role="tab" :aria-selected="S.tab === 'studies'" :class="{ on: S.tab === 'studies' }" data-tab="studies" @click="S.tab = 'studies'">{{ tl('专题') }}</button>
        <button role="tab" :aria-selected="S.tab === 'about'" :class="{ on: S.tab === 'about' }" data-tab="about" @click="S.tab = 'about'">{{ tl('模型边界') }}</button>
      </div>

      <template v-if="S.tab === 'core'">
        <dl v-if="s.crit && doc" class="lab-kv" data-ui="reactor-core">
          <dt>{{ tl('有效增殖因数') }}</dt><dd><b class="num big" data-row="keff">{{ fixed(s.crit.keff, 5) }}</b></dd>
          <dt>{{ tl('反应性 ρ') }}</dt><dd><b class="num" data-row="rho">{{ pcmText(s.crit.rho, 0) }}</b></dd>
          <dt>{{ tl('功率峰因子') }}</dt><dd><b class="num">{{ fixed(s.crit.peak, 3) }}</b></dd>
          <dt>{{ tl('网格') }}</dt><dd><b class="num">{{ doc.grid.nx }} × {{ doc.grid.ny }} · {{ withUnit(fixed(doc.grid.pitch_cm, 1), 'cm') }}</b></dd>
          <dt>{{ tl('求解') }}</dt><dd><b class="num">{{ s.crit.converged ? tl('已收敛') : tl('未收敛') }} · {{ s.crit.iterations }}</b></dd>
        </dl>
        <section v-if="doc && rodCount" class="lab-block">
          <div class="lab-btitle">{{ tl('控制棒（{0} 根）', [rodCount]) }}</div>
          <label class="slide small"><span>{{ tl('全部棒的插入深度') }}</span>
            <input type="range" min="0" max="1" step="0.005" :value="s.run ? s.rodTarget : buildRodDepth" data-ui="reactor-rods-all" :aria-label="tl('全部棒的插入深度')" @input="setRods(Number(($event.target as HTMLInputElement).value))" />
            <b class="num">{{ percentText(s.run ? s.rodTarget : buildRodDepth) }}</b>
          </label>
          <label v-if="selectedRodDepth !== null" class="slide small"><span>{{ tl('所选的棒') }}</span>
            <input type="range" min="0" max="1" step="0.005" :value="selectedRodDepth" data-ui="reactor-rod-one" :aria-label="tl('所选的棒')" @input="setSelectedRod(Number(($event.target as HTMLInputElement).value))" />
            <b class="num">{{ percentText(selectedRodDepth) }}</b>
          </label>
          <p class="tiny sub note">{{ tl('0 % 是全部提出，100 % 是全部插入。') }}</p>
        </section>
        <section v-if="doc && hasLeu && fuelRange" class="lab-block">
          <div class="lab-fields">
            <label>{{ tl('低浓铀富集度') }}</label><NumField :model-value="doc.enrichment ?? fuelRange.enrichment" label="%" :min="fuelRange.min" :max="fuelRange.max" :step="0.05" :disabled="mode === 'run'" data-ui="reactor-enrichment" @update:model-value="v => ws.setEnrichment(v)" />
          </div>
          <p class="tiny sub note">{{ tl('可调范围 {0} % 到 {1} %：材料表里没有更高的富集度。', [fixed(fuelRange.min, 2), fixed(fuelRange.max, 0)]) }}</p>
        </section>
        <section v-if="cellInfo" class="lab-block" data-ui="reactor-cell">
          <div class="lab-btitle"><span class="chip" :style="{ background: materialColour(cellInfo.material, dark) }" />{{ tl('格 ({0}, {1})', [cellInfo.x, cellInfo.y]) }} · {{ cellInfo.name }}</div>
          <dl class="lab-kv">
            <template v-if="cellInfo.rod"><dt>{{ tl('控制棒') }}</dt><dd><b>{{ materialName(cellInfo.rod.material) }}</b></dd></template>
            <template v-if="cellInfo.detector"><dt>{{ tl('探测器') }}</dt><dd><b>{{ tl('有') }}</b></dd></template>
            <template v-if="cellInfo.flux1 !== null"><dt>{{ tl('快群通量（相对）') }}</dt><dd><b class="num">{{ sig(cellInfo.flux1, 4) }}</b></dd></template>
            <template v-if="cellInfo.flux2 !== null"><dt>{{ tl('热群通量（相对）') }}</dt><dd><b class="num">{{ sig(cellInfo.flux2, 4) }}</b></dd></template>
            <template v-if="cellInfo.power !== null && cellInfo.fuel"><dt>{{ tl('功率（平均为 1）') }}</dt><dd><b class="num">{{ fixed(cellInfo.power, 3) }}</b></dd></template>
          </dl>
          <div v-if="cellInfo.adjustable && cellInfo.enrichment !== null && fuelRange && selected === cellInfo.key" class="lab-fields">
            <label>{{ tl('这一格的富集度') }}</label><NumField :model-value="cellInfo.enrichment" label="%" :min="fuelRange.min" :max="fuelRange.max" :step="0.05" :disabled="mode === 'run'" data-ui="reactor-cell-enrichment" @update:model-value="v => ws.setEnrichment(v, cellInfo!.key)" />
          </div>
        </section>
        <p v-else class="small sub">{{ tl('在图上点一格查看它；选一种材料后点或拖动来改布局。') }}</p>
      </template>

      <template v-if="S.tab === 'run'">
        <p class="status"><span class="badge" :class="status.cls" data-ui="reactor-status">{{ status.text }}</span><span v-if="s.run" class="small sub num"> t = {{ timeText(s.run.t) }}</span></p>
        <template v-if="s.run">
          <dl class="lab-kv" data-ui="reactor-readout">
            <dt>{{ tl('相对功率 n') }}</dt><dd><b class="num big" data-row="n">{{ sig(s.run.n, 4) }}</b></dd>
            <dt>{{ tl('热功率') }}</dt><dd><b class="num">{{ powerText(s.last.thermal_W) }}</b></dd>
            <dt>{{ tl('电功率') }}</dt><dd><b class="num">{{ powerText(s.last.electric_W) }}</b></dd>
            <dt>{{ tl('周期') }}</dt><dd><b class="num" data-row="period">{{ periodText(s.last.period) }}</b></dd>
            <dt>{{ tl('反应性 ρ') }}</dt><dd><b class="num" data-row="rho">{{ pcmText(s.last.rho, 1) }}</b></dd>
            <dt>{{ tl('燃料最高温度') }}</dt><dd><b class="num">{{ kelvinText(s.last.fuelPeakT ?? s.run.fuelT) }}</b></dd>
            <dt>{{ tl('冷却剂温度') }}</dt><dd><b class="num">{{ kelvinText(s.run.coolantT) }}</b></dd>
            <dt>{{ tl('氙-135') }}</dt><dd><b class="num">{{ withUnit(sig(s.run.xenon, 3), '10²⁴ cm⁻³') }}</b></dd>
            <dt>{{ tl('衰变热（占额定）') }}</dt><dd><b class="num">{{ percentText(s.last.decayHeat) }}</b></dd>
          </dl>
          <section class="lab-block">
            <div class="lab-btitle">{{ tl('操纵') }}</div>
            <label class="slide small"><span>{{ tl('棒位目标') }}</span>
              <input type="range" min="0" max="1" step="0.001" :value="s.rodTarget" :disabled="!!s.run.scram" data-ui="reactor-rod-target" :aria-label="tl('棒位目标')" @input="setRods(Number(($event.target as HTMLInputElement).value))" />
              <b class="num">{{ percentText(s.rodTarget) }}</b>
            </label>
            <p class="tiny sub note num">{{ tl('现在的棒位 {0}', [percentText(s.run.rods[0] ?? 0)]) }}</p>
            <div class="lab-fields">
              <label>{{ tl('棒速') }}</label>
              <select v-model.number="s.rodSpeed" class="field small" data-ui="reactor-rod-speed" :aria-label="tl('棒速')"><option v-for="[v, name] in ROD_SPEEDS" :key="v" :value="v">{{ name() }}</option></select>
            </div>
            <label class="slide small"><span>{{ tl('主泵流量') }}</span>
              <input type="range" min="0" max="1" step="0.05" :value="pump" data-ui="reactor-pump" :aria-label="tl('主泵流量')" @input="ws.control({ pump: Number(($event.target as HTMLInputElement).value) })" />
              <b class="num">{{ percentText(pump) }}</b>
            </label>
            <label class="ctl small"><input type="checkbox" :checked="s.loop.exchanger" data-ui="reactor-exchanger" @change="ws.control({ exchanger: ($event.target as HTMLInputElement).checked })" />{{ tl('换热器投入') }}</label>
            <label class="ctl small"><input type="checkbox" :checked="s.loop.turbine" data-ui="reactor-turbine" @change="ws.control({ turbine: ($event.target as HTMLInputElement).checked })" />{{ tl('汽轮发电机并网') }}</label>
            <button v-if="s.run.trip && !s.run.ended" class="btn small tonal" data-ui="reactor-reset-trip" @click="resetTrip">{{ tl('复位保护') }}</button>
          </section>
        </template>
        <p v-else class="small sub">{{ tl('用上面的“冷态启动”或“满功率”让这个布局运行起来。') }}</p>
        <section v-if="doc" class="lab-block" data-ui="reactor-protection">
          <div class="lab-btitle">{{ tl('停堆保护') }}</div>
          <label class="ctl small"><input type="checkbox" :checked="protection.enabled !== false" data-ui="reactor-protection-on" @change="ws.setProtection({ enabled: ($event.target as HTMLInputElement).checked })" />{{ tl('保护投入') }}</label>
          <div class="lab-fields">
            <label>{{ tl('功率上限（相对）') }}</label><NumField :model-value="protection.power ?? 1.2" :min="0.1" :max="3" :step="0.05" @update:model-value="v => ws.setProtection({ power: v })" />
            <label>{{ tl('周期下限') }}</label><NumField :model-value="protection.period_s ?? 10" label="s" :min="1" :max="1000" @update:model-value="v => ws.setProtection({ period_s: v })" />
            <label>{{ tl('燃料温度上限') }}</label><NumField :model-value="protection.fuelT_K ?? 1800" label="K" :min="300" :max="3500" @update:model-value="v => ws.setProtection({ fuelT_K: v })" />
          </div>
        </section>
        <section v-if="events.length || notes.length" class="lab-block" data-ui="reactor-events">
          <div class="lab-btitle">{{ tl('记录') }}</div>
          <p v-for="(e, i) in events" :key="i" class="tiny note"><span class="num sub">{{ e.t }}</span> {{ e.text }}</p>
          <p v-for="d in notes" :key="d.text" class="tiny note" :data-code="d.code"><span class="badge" :class="d.severity === 'info' ? '' : 'warn'">{{ severityText(d.severity) }}</span> {{ d.text }}</p>
        </section>
      </template>

      <template v-if="S.tab === 'balance'">
        <p class="small sub">{{ tl('从冷态、无毒物、棒全部提出的堆芯出发，一次改一项，每一项都由核心重新求解布局得到。') }}</p>
        <button class="btn small tonal" data-ui="reactor-balance-run" :disabled="!s.ready" @click="ws.computeBalance()">{{ tl('计算收支') }}</button>
        <table v-if="s.balance" class="btable small" data-ui="reactor-balance">
          <thead><tr><th>{{ tl('项目') }}</th><th class="r">ρ</th><th class="r">k</th></tr></thead>
          <tbody>
            <tr v-for="r in balanceRows" :key="r.id" :data-row="r.id"><td>{{ r.label }}</td><td class="r num">{{ r.rho }}</td><td class="r num">{{ r.k }}</td></tr>
          </tbody>
          <tfoot><tr><td>{{ tl('合计') }}</td><td class="r num">{{ pcmText(s.balance.rho, 0) }}</td><td class="r num">{{ fixed(s.balance.keff, 5) }}</td></tr></tfoot>
        </table>
        <p v-if="s.balance" class="tiny sub note num">β = {{ pcmText(s.balance.beta, 1) }} · {{ tl('重新求解 {0} 次', [s.balance.solves]) }}</p>
      </template>

      <template v-if="S.tab === 'tasks'">
        <ol class="tasks" data-ui="reactor-tasks">
          <li v-for="t in taskList" :key="t.id" :class="{ on: s.task.id === t.id }" :data-task="t.id">
            <div class="thead"><b>{{ t.title }}</b>
              <button class="btn small" :class="{ tonal: s.task.id !== t.id }" :data-ui="`task-start-${t.id}`" :disabled="!s.ready || s.busy" @click="beginTask(t.id)">{{ s.task.id === t.id ? tl('重新开始') : tl('开始') }}</button>
            </div>
            <p v-if="s.task.id === t.id" class="small goal">{{ t.goal }}</p>
            <template v-if="s.task.id === t.id">
              <button class="btn small primary" data-ui="task-check" @click="ws.checkTask()">{{ tl('检查') }}</button>
              <p v-if="s.task.result" class="verdict"><span class="badge" :class="s.task.result.passed ? 'ok' : 'warn'" data-ui="task-verdict">{{ s.task.result.passed ? tl('通过') : tl('还没有完成') }}</span></p>
              <ul v-if="taskChecks.length" class="checks tiny" data-ui="task-checks">
                <li v-for="c in taskChecks" :key="c.id" :class="{ ok: c.ok }" :data-check="c.id"><span class="mark" aria-hidden="true">{{ c.ok ? '✓' : '✗' }}</span>{{ c.text }}</li>
              </ul>
            </template>
          </li>
        </ol>
      </template>

      <template v-if="S.tab === 'studies'">
        <ReactorStudies :S="S" />
      </template>

      <template v-if="S.tab === 'about'">
        <section class="about" data-ui="reactor-about-text">
          <p class="small"><b>{{ tl('这是教学模型，不能用于设计或安全分析。') }}</b></p>
          <p class="small sub">{{ tl('它算的是：网格上的二维两群扩散方程（有效增殖因数与通量分布）；六组缓发中子的点堆动力学；燃料温度、慢化剂温度与空泡、氙-135 与钐-149 的反馈；停堆后的衰变热。') }}</p>
          <div class="lab-btitle">{{ tl('模型不含什么') }}</div>
          <ul class="small out"><li v-for="x in leftOut" :key="x">{{ x }}</li></ul>
          <div class="lab-btitle">{{ tl('两种结局') }}</div>
          <p class="small sub">{{ tl('燃料最高温度超过损坏限值，仿真以“堆芯损坏”结束；反应性接近瞬发临界，仿真停下并说明已超出模型的适用范围。两种情况都不再往后算。') }}</p>
          <template v-if="s.library">
            <div class="lab-btitle">{{ tl('截面数据的来源') }}</div>
            <ul class="tiny out src"><li v-for="(text, key) in s.library.sources" :key="key"><b>{{ key }}</b> — {{ text }}</li></ul>
            <p class="tiny sub note">{{ s.library.teaching }}</p>
          </template>
        </section>
      </template>
    </aside>
  </div>
</template>

<style scoped>
.keff { color: var(--text-2); white-space: nowrap; }
.keff b { color: var(--text); font-weight: var(--weight-strong); }
.scram { background: var(--danger-soft); color: var(--danger); font-weight: var(--weight-strong); box-shadow: inset 0 0 0 1px var(--danger); }
.scram:hover:not(:disabled) { background: var(--danger-soft); box-shadow: inset 0 0 0 2px var(--danger); }
.teach { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-1) var(--space-3); background: var(--warning-soft); color: var(--warning); border-bottom: 1px solid var(--separator); }
.teach span { flex: 1; min-width: 0; }
.tlink { border: 0; background: none; padding: 0; font: inherit; color: inherit; text-decoration: underline; cursor: pointer; white-space: nowrap; min-height: var(--hit-min); }
.rerr { padding: var(--space-1) var(--space-3); color: var(--danger); background: var(--danger-soft); border-bottom: 1px solid var(--separator); }
.rbody { flex: 1; min-height: 0; display: grid; grid-template-rows: minmax(0, 1fr) auto; }
.rbody.run { grid-template-rows: minmax(0, 1fr); grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); }
.rmap-wrap { position: relative; min-height: 220px; min-width: 0; }
.loading { padding: var(--space-3); color: var(--text-2); }
.ramp { position: absolute; left: var(--space-2); bottom: var(--space-2); display: flex; align-items: center; gap: var(--space-2); padding: 2px var(--space-2); background: var(--pane); color: var(--text-2); border-radius: var(--radius-control); box-shadow: var(--elev-1); }
.ramp i { display: block; width: 120px; height: 8px; border-radius: var(--radius-row); }
.palette { display: flex; flex-wrap: wrap; gap: var(--space-1); padding: var(--space-2) var(--space-3); border-top: 1px solid var(--separator); }
.swatch { display: inline-flex; align-items: center; gap: var(--space-1); border: 0; background: var(--fill); color: var(--text); border-radius: var(--radius-control); padding: 0 var(--space-2); height: var(--control-sm); font: inherit; font-size: var(--type-small); cursor: pointer; }
.swatch:hover { background: var(--fill-strong); }
.swatch.on { background: var(--accent-soft); color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.chip { display: inline-block; width: 12px; height: 12px; border-radius: var(--radius-row); box-shadow: 0 0 0 1px var(--border); flex: 0 0 auto; }
.chip.rod { border-radius: var(--radius-round); }
.chip.ring { border-radius: var(--radius-round); box-shadow: inset 0 0 0 2px var(--accent); }
.rplots { min-width: 0; overflow: auto; padding: var(--space-2) var(--space-3); border-left: 1px solid var(--separator); display: flex; flex-direction: column; gap: var(--space-1); }
.plot-seg { align-self: flex-start; }
.tabs { display: flex; margin-bottom: var(--space-3); }
.tabs button { flex: 1 1 auto; padding: 3px var(--space-1); }
.lab-kv dt { color: var(--text-2); }
.lab-kv dd { margin: 0; text-align: right; }
.sub { color: var(--text-2); }
.note { margin: var(--space-1) 0 0; line-height: var(--line-body); }
.status { margin: 0 0 var(--space-2); }
.slide { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0 var(--space-2); align-items: center; color: var(--text-2); margin-bottom: var(--space-1); }
.slide span { grid-column: 1 / -1; }
.slide input { width: 100%; min-width: 0; }
.slide b { color: var(--text); min-width: 6ch; text-align: right; }
.lab-side .ctl { display: flex; align-items: center; gap: var(--space-2); margin: var(--space-1) 0; }
.btable { width: 100%; border-collapse: collapse; margin-top: var(--space-2); }
.btable th { text-align: left; font-weight: var(--weight-medium); color: var(--text-2); padding: 2px var(--space-1); border-bottom: 1px solid var(--separator); }
.btable td { padding: 3px var(--space-1); border-bottom: 1px solid var(--separator); }
.btable tfoot td { font-weight: var(--weight-strong); border-bottom: 0; }
.btable .r { text-align: right; white-space: nowrap; }
.tasks { margin: 0; padding: 0; list-style: none; counter-reset: task; }
.tasks > li { padding: var(--space-2) 0; border-bottom: 1px solid var(--separator); }
.thead { display: flex; align-items: center; gap: var(--space-2); }
.thead b { flex: 1; min-width: 0; font-weight: var(--weight-strong); }
.thead b::before { counter-increment: task; content: counter(task) '. '; color: var(--text-2); font-variant-numeric: tabular-nums; }
.goal { margin: var(--space-1) 0 var(--space-2); line-height: var(--line-body); color: var(--text-2); }
.verdict { margin: var(--space-2) 0 0; }
.checks { margin: var(--space-1) 0 0; padding: 0; list-style: none; line-height: var(--line-body); color: var(--text-2); }
.checks li { display: flex; gap: var(--space-1); }
.checks .mark { color: var(--danger); flex: 0 0 auto; }
.checks li.ok .mark { color: var(--success); }
.about p { margin: 0 0 var(--space-2); line-height: var(--line-body); }
.out { margin: 0 0 var(--space-3); padding-left: var(--space-5); line-height: var(--line-body); color: var(--text-2); }
.out.src { overflow-wrap: break-word; }
.about .lab-btitle { margin-top: var(--space-2); }
@media (max-width: 1100px) { .rbody.run { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(200px, 1fr) auto; } .rplots { border-left: 0; border-top: 1px solid var(--separator); } }
@media (max-width: 760px) { .rx.lab-shell { grid-template-rows: minmax(620px, auto) auto; } .rmap-wrap { min-height: 300px; } }
@media (pointer: coarse) { .swatch { height: var(--touch-min); } }
</style>
