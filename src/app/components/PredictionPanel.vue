<script setup lang="ts">
/**
 * Prediction & compare panel (right sidebar, no backdrop). Students write down their predictions before a run
 * — the time of the first event of a kind, a quantity at a time, or a formula result of a recognised
 * situation — and after the run each one is compared with the simulation and the formula (absolute and
 * relative error, badge). Values are entered and shown in display units and stored in SI in
 * `scene.extra.predictions` through `edit()` (saved with the scene, undoable).
 *
 * Props: `closable` (show a close button). Emits: `close`.
 */
import { computed, reactive, ref, watch } from 'vue'
import { state, edit } from '../store'
import { fmtQ, settings, toDisp, unitLabel } from '../settings'
import { cloneScene } from '../../core/scene/io'
import { compileModel } from '../../core/solver/model'
import { buildSystem } from '../../core/solver/dynamics'
import type { ChangeType } from '../../core/solver/simulation'
import type { QuantityDef } from '../../core/observe/quantities'
import { listQuantities } from '../../core/observe/quantities'
import { FORMULAS } from '../../formula/library'
import type { Comparison, Prediction, PredictionTarget } from '../../analysis/prediction'
import { EVENT_TYPES, GRADE_TEXT, PREDICTION_TOLERANCE, SITUATION_NAMES, comparePrediction, newPredictionId, readPredictions, situationsOfType, targetLabel, targetUnit, writePredictions } from '../../analysis/prediction'
import { relErrorText } from '../../export/formulaImage'
import { timeLabel } from '../../export/video'
import { logEvent } from '../trialLog'
import NumField from './NumField.vue'
import Icon from './Icon.vue'

defineProps<{ closable?: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const predictions = computed<Prediction[]>(() => readPredictions(state.scene))
const fresh = computed(() => (!state.stale && !state.computing && state.recording ? state.recording : null))

// Quantities of the current scene (from the last recording, or compiled from the scene before any run)
const system = computed(() => {
  if (state.recording) return state.recording.system
  try { return buildSystem(compileModel(cloneScene(state.scene))) } catch { return null }
})
const quantities = computed<QuantityDef[]>(() => (system.value ? listQuantities(system.value) : []))
const qById = computed(() => new Map(quantities.value.map(q => [q.id, q])))
const bodyName = (id: string) => state.scene.bodies.find(b => b.id === id)?.name ?? id
const ctx = computed(() => ({ quantities: qById.value, bodyName, time: (t: number) => timeLabel(t, settings.units) }))

// ---- New prediction ----
const draft = reactive({
  kind: 'event' as PredictionTarget['kind'],
  event: 'stick' as ChangeType,
  body: '',
  quantity: state.scene.watch[0] ?? '',
  t: 0,
  situation: '',
  formula: '',
  occurrence: 0,
  value: 0,
  note: ''
})
const dynamicBodies = computed(() => state.scene.bodies.filter(b => b.kind !== 'static'))
const situationTypes = computed(() => {
  const seen = [...new Set(state.situations.map(s => s.type))]
  return seen.length ? seen : [...new Set(FORMULAS.map(f => f.situation))]
})
const formulasOfType = computed(() => FORMULAS.filter(f => f.situation === draft.situation))
const occurrences = computed(() => situationsOfType(state.situations, draft.situation))
watch(situationTypes, list => { if (!list.includes(draft.situation)) draft.situation = list[0] ?? '' }, { immediate: true })
watch(() => draft.situation, () => { if (!formulasOfType.value.some(f => f.id === draft.formula)) draft.formula = formulasOfType.value[0]?.id ?? ''; draft.occurrence = 0 }, { immediate: true })
watch(quantities, list => { if (!list.some(q => q.id === draft.quantity)) draft.quantity = state.scene.watch.find(id => list.some(q => q.id === id)) ?? list[0]?.id ?? '' }, { immediate: true })

const draftTarget = computed<PredictionTarget>(() => {
  if (draft.kind === 'event') return { kind: 'event', event: draft.event, body: draft.body || null }
  if (draft.kind === 'quantity') return { kind: 'quantity', id: draft.quantity, t: draft.t }
  return { kind: 'formula', situation: draft.situation, formula: draft.formula, occurrence: draft.occurrence }
})
const draftUnit = computed(() => targetUnit(draftTarget.value, qById.value))
const canAdd = computed(() => (draft.kind === 'quantity' ? !!draft.quantity : draft.kind === 'formula' ? !!draft.formula : true) && Number.isFinite(draft.value))
const scaleOf = (si: string) => (si ? toDisp(1, si) : 1)
const labelOf = (si: string) => (si ? unitLabel(si) : '')

function add() {
  if (!canAdd.value) return
  const list = predictions.value
  const p: Prediction = { id: newPredictionId(list), target: JSON.parse(JSON.stringify(draftTarget.value)) as PredictionTarget, value: draft.value }
  if (draft.note.trim()) p.note = draft.note.trim().slice(0, 200)
  edit(s => writePredictions(s, [...list, p]))
  revealed.value = false
  draft.note = ''
  logEvent('prediction.add', { kind: p.target.kind })
}
function remove(id: string) {
  const list = predictions.value.filter(p => p.id !== id)
  edit(s => writePredictions(s, list))
}

// ---- Comparison ----
const hideUntilReveal = ref(true)
const revealed = ref(false)
const showResults = computed(() => !hideUntilReveal.value || revealed.value)
const comparisons = computed(() => {
  const rec = fresh.value
  if (!rec) return new Map<string, Comparison>()
  return new Map(predictions.value.map(p => [p.id, comparePrediction(rec, state.situations, p)]))
})
function reveal() { revealed.value = true }
// Trial log: one "compared" entry each time results become visible for a recording
let loggedFor: object | null = null
watch([comparisons, showResults], ([cmp, show]) => {
  const rec = fresh.value
  if (!show || !rec || !cmp.size || loggedFor === rec) return
  loggedFor = rec
  const grades = [...cmp.values()].map(c => c.grade)
  logEvent('prediction.compare', { n: grades.length, ok: grades.filter(g => g === 'ok').length, warn: grades.filter(g => g === 'warn').length, bad: grades.filter(g => g === 'bad').length, none: grades.filter(g => g === 'none').length, revealed: hideUntilReveal.value })
})
const q = (v: number | null, unit: string, digits = state.digits) => fmtQ(v, unit, digits)
function errText(abs: number | null, rel: number | null, unit: string): string {
  if (abs === null) return '—'
  return `${abs > 0 ? '+' : ''}${fmtQ(abs, unit, 3)}（${relErrorText(rel)}）`
}
const pct = (x: number) => `${Number((x * 100).toPrecision(3))}%`
</script>

<template>
  <div class="predict">
    <div class="head">
      <span class="title">预测与对比</span>
      <span class="spacer" />
      <button v-if="closable" class="btn icon ghost" title="关闭" @click="emit('close')"><Icon name="close" /></button>
    </div>
    <div class="tiny muted intro">运行前先写下你的计算结果，运行后与仿真和公式逐项对照。预测随场景文件保存，数值按当前显示单位输入。</div>

    <div class="group-title">新的预测</div>
    <div class="group">
      <div class="tabs kinds">
        <button :class="{ on: draft.kind === 'event' }" @click="draft.kind = 'event'">事件时刻</button>
        <button :class="{ on: draft.kind === 'quantity' }" @click="draft.kind = 'quantity'">物理量</button>
        <button :class="{ on: draft.kind === 'formula' }" @click="draft.kind = 'formula'">公式结果</button>
      </div>
      <template v-if="draft.kind === 'event'">
        <div class="row"><label>事件</label><select v-model="draft.event" class="field grow"><option v-for="e in EVENT_TYPES" :key="e.type" :value="e.type">首次{{ e.label }}</option></select></div>
        <div class="row"><label>涉及物体</label><select v-model="draft.body" class="field grow"><option value="">任意</option><option v-for="b in dynamicBodies" :key="b.id" :value="b.id">{{ b.name }}</option></select></div>
      </template>
      <template v-else-if="draft.kind === 'quantity'">
        <div class="row"><label>物理量</label><select v-model="draft.quantity" class="field grow"><option v-for="x in quantities" :key="x.id" :value="x.id">{{ x.owner }} · {{ x.label }}</option></select></div>
        <div class="row"><label>时刻</label><NumField class="grow" :model-value="draft.t" :unit="labelOf('s')" :scale="scaleOf('s')" :min="0" @update:model-value="v => (draft.t = v)" /></div>
      </template>
      <template v-else>
        <div class="row"><label>情形</label><select v-model="draft.situation" class="field grow"><option v-for="t in situationTypes" :key="t" :value="t">{{ SITUATION_NAMES[t] ?? t }}</option></select></div>
        <div class="row"><label>公式</label><select v-model="draft.formula" class="field grow"><option v-for="f in formulasOfType" :key="f.id" :value="f.id">{{ f.title }}</option></select></div>
        <div v-if="occurrences.length > 1" class="row"><label>第几段</label>
          <select v-model.number="draft.occurrence" class="field grow"><option v-for="(s, i) in occurrences" :key="s.key" :value="i">第 {{ i + 1 }} 段（{{ timeLabel(s.t0, settings.units).replace('t = ', '') }} 起）</option></select>
        </div>
      </template>
      <div class="row"><label>我的预测</label><NumField class="grow" :model-value="draft.value" :unit="labelOf(draftUnit)" :scale="scaleOf(draftUnit)" @update:model-value="v => (draft.value = v)" /></div>
      <div class="row"><label>思路（可选）</label><input v-model="draft.note" class="field grow" maxlength="200" placeholder="如：隔离物块，a₁ = μ₁g" /></div>
      <div class="row end"><span class="tiny muted grow">{{ targetLabel(draftTarget, ctx) }}</span><button class="btn primary small" :disabled="!canAdd" @click="add"><Icon name="plus" />添加预测</button></div>
    </div>

    <div class="list-head">
      <span class="group-title">我的预测（{{ predictions.length }}）</span>
      <span class="spacer" />
      <label class="check tiny" title="避免先看到答案"><input v-model="hideUntilReveal" type="checkbox" />揭晓前隐藏结果</label>
    </div>
    <div v-if="!predictions.length" class="empty">还没有预测。选择一个对象，写下你算出的数值。</div>
    <div v-else-if="!fresh" class="tiny muted status">{{ state.computing ? '正在计算…' : '运行仿真后显示对比。' }}</div>
    <div v-else-if="!showResults" class="reveal"><button class="btn primary" @click="reveal">揭晓对比结果</button></div>

    <article v-for="p in predictions" :key="p.id" class="card" :class="showResults && comparisons.get(p.id) ? comparisons.get(p.id)!.grade : ''">
      <div class="card-head">
        <span class="card-title">{{ targetLabel(p.target, ctx) }}</span>
        <span class="spacer" />
        <span v-if="showResults && comparisons.get(p.id)" class="badge" :class="comparisons.get(p.id)!.grade === 'none' ? '' : comparisons.get(p.id)!.grade">{{ GRADE_TEXT[comparisons.get(p.id)!.grade] }}</span>
        <button class="btn icon ghost del" title="删除这条预测" @click="remove(p.id)"><Icon name="trash" :size="14" /></button>
      </div>
      <div class="grid small">
        <span class="muted">我的预测</span><span class="mono">{{ q(p.value, comparisons.get(p.id)?.value.unit ?? targetUnit(p.target, qById), 8) }}</span>
        <template v-if="showResults && comparisons.get(p.id)">
          <span class="muted">仿真结果</span><span class="mono">{{ q(comparisons.get(p.id)!.value.sim, comparisons.get(p.id)!.value.unit) }}</span>
          <span class="muted">公式结果</span><span class="mono">{{ q(comparisons.get(p.id)!.value.formula, comparisons.get(p.id)!.value.unit) }}</span>
          <span class="muted">与仿真之差</span><span class="mono">{{ errText(comparisons.get(p.id)!.absError, comparisons.get(p.id)!.relError, comparisons.get(p.id)!.value.unit) }}</span>
          <span class="muted">与公式之差</span><span class="mono">{{ errText(comparisons.get(p.id)!.absErrorFormula, comparisons.get(p.id)!.relErrorFormula, comparisons.get(p.id)!.value.unit) }}</span>
        </template>
      </div>
      <div v-if="p.note" class="tiny note">思路：{{ p.note }}</div>
      <div v-if="showResults && comparisons.get(p.id)?.value.simNote" class="tiny muted">{{ comparisons.get(p.id)!.value.simNote }}</div>
      <div v-if="showResults && comparisons.get(p.id)?.value.formulaNote" class="tiny muted">公式：{{ comparisons.get(p.id)!.value.formulaNote }}</div>
    </article>

    <div v-if="predictions.length" class="tiny muted legend">
      评价按与仿真结果的相对误差：≤ {{ pct(PREDICTION_TOLERANCE.ok) }} 准确，≤ {{ pct(PREDICTION_TOLERANCE.warn) }} 接近，否则偏差较大。手算常取 g = 10 m/s²，与场景中的 g 不同会带来约 2% 的差别。
    </div>
  </div>
</template>

<style scoped>
.predict { padding: 4px 0 12px; }
.head { display: flex; align-items: center; margin: 2px 2px 2px; }
.title { font-weight: 600; font-size: var(--type-title); }
.intro { margin: 0 2px 6px; line-height: 1.5; }
.kinds { margin: 4px 0 6px; }
.row > label { width: 84px; }
.row.end { gap: 8px; }
.list-head { display: flex; align-items: center; margin-top: 4px; }
.list-head .group-title { margin-bottom: 4px; }
.status { padding: 4px 2px 8px; }
.reveal { display: flex; justify-content: center; padding: 6px 0 10px; }
.card { background: var(--group); border-radius: var(--radius-group); padding: 8px 10px; margin-bottom: 8px; border-left: 3px solid transparent; }
.card.ok { border-left-color: var(--success); }
.card.warn { border-left-color: var(--warning); }
.card.bad { border-left-color: var(--danger); }
.card-head { display: flex; align-items: center; gap: 6px; }
.card-title { font-weight: 600; font-size: 12.5px; }
.del { width: 24px; height: 24px; }
.grid { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 4px 0 2px; }
.grid .mono { text-align: right; }
.note { color: var(--text-2); margin-top: 2px; }
.legend { margin: 4px 2px; line-height: 1.5; }
</style>
