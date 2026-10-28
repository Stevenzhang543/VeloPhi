<script setup lang="ts">
/**
 * A teaching activity (26.56, D102): goal and prerequisites → concept diagnosis → prediction with a reason → a
 * controlled experiment (one input varied, the rest held) → revising the explanation → questions with graded hints
 * → a transfer question → the result by dimension (concept, unit, direction, modelling, calculation, explanation)
 * and whether it counts as mastery evidence (rule shown). Every expected value comes from the Rust model (modelEval);
 * the page compares only. Fully usable by keyboard: native radio groups (arrow keys), check boxes (Space), buttons.
 *
 * Mounted by App.vue while `state.activity` names an activity.
 */
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { dialogKeys } from '../focusTrap'
import { tl, activeLang } from '../../i18n'
import type { Tri } from '../../i18n/tri'
import { state } from '../store'
import { fmtK } from '../settings'
import { activityById } from '../../teaching/activities'
import type { ActivitySpec, ChoiceQuestion, Dimension, Question } from '../../teaching/activities/types'
import { DIMENSIONS } from '../../teaching/activities/types'
import { activityInputs, evaluate, expectedChoice, gradeItem, isMastery, keepFirst, tally, trendOf, TREND_OPTIONS } from '../../teaching/activities/grade'
import type { Answer, Evaluation, FirstCheck, ItemGrade, Trend } from '../../teaching/activities/grade'
import { MASTERY_RULE } from '../../teaching/records'
import type { AttemptRecord, ItemRecord } from '../../teaching/records'
import { modelById } from '../../content/models'
import { recordAttempt, progressOfActivity, visit } from '../learn/records'
import { openLab, openTemplate } from '../learn/actions'
import { exportDocument } from '../models/run'
import { saveFile } from '../../platform/files'
import { T3, STATE_TEXT } from '../models/labels'
import Icon from './Icon.vue'

/** `step` opens a given step (teacher preview, accessibility checks); otherwise the activity starts at its goals. */
const props = defineProps<{ step?: string }>()
const T = (t: Tri | undefined) => T3(t)
const act = computed<ActivitySpec>(() => activityById(state.activity ?? '')!)
const model = computed(() => modelById(act.value.models[0])!)
const STEPS = ['intro', 'diagnose', 'predict', 'experiment', 'questions', 'transfer', 'summary'] as const
type Step = typeof STEPS[number]
const STEP_TEXT: Record<Step, string> = { intro: tl('目标'), diagnose: tl('诊断'), predict: tl('预测'), experiment: tl('实验'), questions: tl('解题'), transfer: tl('迁移'), summary: tl('结果') }
const DIM_TEXT: Record<Dimension, string> = { concept: tl('概念'), unit: tl('单位'), direction: tl('方向'), modelling: tl('建模'), calculation: tl('计算'), explanation: tl('解释') }
const TREND_TEXT: Record<Trend, string> = { increases: tl('增大'), decreases: tl('减小'), constant: tl('不变'), mixed: tl('先增后减或反复') }

const step = ref<Step>((STEPS as readonly string[]).includes(props.step ?? '') ? (props.step as Step) : 'intro')
const heading = ref<HTMLElement | null>(null)
watch(step, async () => { await nextTick(); heading.value?.focus() })
const started = new Date().toISOString()
const constantsSet = 'CODATA2022'

// Evaluations by the core
const ev = computed<Evaluation | null>(() => { try { return evaluate(model.value.id, activityInputs(act.value), constantsSet) } catch { return null } })
const tev = computed<Evaluation | null>(() => { try { return evaluate(model.value.id, activityInputs(act.value, act.value.transfer.inputs), constantsSet) } catch { return null } })

// Answers, grades and hints of every question by id (diagnostic d*, prediction p, core q*, transfer t*)
const answers = reactive<Record<string, { choice: string | null; choices: string[]; value: string; unit: string | null }>>({})
const grades = reactive<Record<string, ItemGrade | null>>({})
/**
 * The first check of every core and transfer question: the evidence. The feedback names the reference answer, so a
 * learner may correct and check again to learn, but only the first check counts for the result and for mastery.
 */
const first = reactive<Record<string, FirstCheck>>({})
const hints = reactive<Record<string, number>>({})
function slot(id: string) { if (!answers[id]) answers[id] = { choice: null, choices: [], value: '', unit: null }; return answers[id] }
for (const q of [...act.value.diagnostic, act.value.predict.question, ...act.value.questions, ...act.value.transfer.questions]) slot(q.id)

const parseNum = (s: string): number | null => { const v = Number(s.trim().replace(',', '.')); return s.trim() && Number.isFinite(v) ? v : null }
function answerOf(q: Question): Answer {
  const a = slot(q.id)
  if (q.kind === 'multi') return { choices: a.choices }
  if (q.kind === 'number') return { value: parseNum(a.value), unit: a.unit }
  return { choice: a.choice }
}
function check(q: Question, e: Evaluation | null, observed?: Trend | null) {
  if (!e) return
  const g = gradeItem(q, e, answerOf(q), observed)
  grades[q.id] = g
  keepFirst(first, q.id, g, answerOf(q))
}
/** Corrected after the first check (shown, recorded, not counted). */
const revisedAfterCheck = (q: Question) => !!first[q.id] && grades[q.id] !== first[q.id].grade
const optionText = (q: ChoiceQuestion | Question, id: string | null) => (q.kind === 'choice' || q.kind === 'multi' ? T(q.options.find(o => o.id === id)?.text) : '')
const unitText = (u: string) => (u === '' ? tl('无单位') : u)
function expectedText(q: Question, g: ItemGrade): string {
  if (q.kind === 'number') { const x = g.expected as { value: number; unit: string } | null; const o = model.value.outputs.find(y => y.id === q.output); return x ? fmtK(x.value, x.unit, o?.kind) : '—' }
  if (q.kind === 'multi') return (g.expected as string[]).map(id => optionText(q, id)).join('、')
  if (q.kind === 'trend') return TREND_TEXT[g.expected as Trend] ?? '—'
  return optionText(q, g.expected as string)
}

// Prediction
const prediction = reactive({ reason: null as string | null, text: '', locked: false })
const predictionOk = computed(() => !!slot('p').choice && !!prediction.reason)

// Experiment: the learner picks at least three values of the varied input
const exp = act.value.experiment
const picked = reactive<Record<number, boolean>>(Object.fromEntries((exp?.values ?? []).map((_, k) => [k, true])))
const series = ref<Array<{ x: number; ev: Evaluation }> | null>(null)
const pickedValues = computed(() => (exp?.values ?? []).filter((_, k) => picked[k]))
function runExperiment() {
  if (!exp || pickedValues.value.length < 3) return
  series.value = pickedValues.value.map(x => ({ x, ev: evaluate(model.value.id, { ...activityInputs(act.value), [exp.vary]: x }, constantsSet) }))
}
const observed = computed<Trend | null>(() => {
  const q = act.value.predict.question
  if (q.kind !== 'trend' || !series.value) return null
  return trendOf(series.value.map(r => r.ev.outputs[q.output]?.value ?? null))
})
const varySpec = computed(() => model.value.inputs.find(i => i.id === exp?.vary))
const held = computed(() => model.value.inputs.filter(i => i.id !== exp?.vary).map(i => `${T(i.label)} ${fmtK(activityInputs(act.value)[i.id], i.unit, i.kind)}`))
const revision = reactive({ text: '', changed: false })
function settlePrediction() {
  const q = act.value.predict.question
  if (q.kind === 'trend') check(q, ev.value, observed.value)
  else check(q, ev.value)
}

// Navigation
const order = computed<Step[]>(() => STEPS.filter(s => s !== 'experiment' || !!exp))
const at = computed(() => order.value.indexOf(step.value))
const canNext = computed(() => {
  switch (step.value) {
    case 'predict': return prediction.locked
    case 'experiment': return !!series.value
    default: return true
  }
})
function next() {
  if (step.value === 'predict' && !prediction.locked) return
  if (step.value === 'experiment') settlePrediction()
  const n = order.value[at.value + 1]
  if (n === 'summary') finish()
  if (n) step.value = n
}
function back() { const p = order.value[at.value - 1]; if (p && step.value !== 'summary') step.value = p }

// Result
const coreGrades = computed(() => act.value.questions.map(q => first[q.id]?.grade).filter((g): g is ItemGrade => !!g))
const transferGrades = computed(() => act.value.transfer.questions.map(q => first[q.id]?.grade).filter((g): g is ItemGrade => !!g))
const revisedCount = computed(() => [...act.value.questions, ...act.value.transfer.questions].filter(revisedAfterCheck).length)
const complete = computed(() => coreGrades.value.length === act.value.questions.length && transferGrades.value.length === act.value.transfer.questions.length)
const dims = computed(() => tally([...coreGrades.value, ...transferGrades.value]))
const mastery = computed(() => complete.value && isMastery(coreGrades.value, transferGrades.value))
const rule = computed(() => MASTERY_RULE[activeLang()] ?? MASTERY_RULE.zh)
let saved: AttemptRecord | null = null
function itemRecords(qs: Question[]): Record<string, ItemRecord> {
  return Object.fromEntries(qs.map(q => {
    const f = first[q.id]
    const g = f?.grade ?? grades[q.id]
    const rec: ItemRecord = { answer: f ? f.answer : answerOf(q), verdicts: g?.verdicts ?? {}, expected: g?.expected ?? null, hints: hints[q.id] ?? 0 }
    if (f && revisedAfterCheck(q)) rec.revised = { answer: answerOf(q), verdicts: grades[q.id]?.verdicts ?? {} }
    return [q.id, rec]
  }))
}
function finish() {
  // ungraded questions count as answered wrongly only if the learner left them; grade them now with what is there
  for (const q of act.value.questions) if (!first[q.id]) check(q, ev.value)
  for (const q of act.value.transfer.questions) if (!first[q.id]) check(q, tev.value)
  const q = act.value.predict.question
  saved = {
    id: `${act.value.id}-${Date.now()}`,
    activity: act.value.id,
    started,
    finished: new Date().toISOString(),
    constantsSet,
    inputs: activityInputs(act.value),
    transferInputs: activityInputs(act.value, act.value.transfer.inputs),
    diagnostic: itemRecords(act.value.diagnostic),
    prediction: { choice: slot(q.id).choice, reason: prediction.reason, text: prediction.text, correct: grades[q.id] ? Object.values(grades[q.id]!.verdicts).every(v => v === 'correct') : null, reasonCorrect: prediction.reason ? prediction.reason === act.value.predict.reason : null },
    experiment: exp && series.value ? { vary: exp.vary, values: series.value.map(r => r.x), controlled: true } : null,
    revision: exp ? { text: revision.text, changed: revision.changed } : null,
    items: itemRecords(act.value.questions),
    transfer: itemRecords(act.value.transfer.questions),
    dims: dims.value,
    mastery: mastery.value
  }
  recordAttempt(saved)
  visit(`activity:${act.value.id}`)
}
async function exportAttempt() {
  if (!saved) return
  await saveFile(exportDocument('activity-attempt', { activity: act.value.id, inputs: saved.inputs, transferInputs: saved.transferInputs, constantsSet }, saved, 'models', constantsSet), `velophi-${act.value.id}.json`, [{ name: 'JSON', extensions: ['json'] }])
}
const progress = computed(() => progressOfActivity(act.value.id))
function close() { state.activity = null }
const root = ref<HTMLElement | null>(null)
onMounted(() => { if (heading.value) heading.value.focus(); else root.value?.focus() })
function openScene() { const o = act.value.open; if (!o) return; close(); if (o.template) void openTemplate(o.template); else if (o.lab) openLab(o.lab, o.preset) }
const hintOf = (q: Question) => (q.hints ?? []).slice(0, hints[q.id] ?? 0)
function moreHint(q: Question) { hints[q.id] = Math.min((q.hints ?? []).length, (hints[q.id] ?? 0) + 1) }
const evFor = (q: Question) => (act.value.transfer.questions.includes(q) ? tev.value : ev.value)
const verdictList = (g: ItemGrade) => (Object.entries(g.verdicts) as Array<[Dimension, string]>)
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="close">
    <div ref="root" class="dialog activity" role="dialog" aria-modal="true" tabindex="-1" :aria-label="T(act.title)" @keydown="dialogKeys($event, root, close)">
      <div class="dialog-header"><Icon name="graduation" :size="18" />{{ T(act.title) }}<span class="spacer" /><button class="btn icon ghost" :title="tl('关闭')" @click="close"><Icon name="close" /></button></div>
      <ol class="steps tiny" :aria-label="tl('步骤')">
        <li v-for="(s, k) in order" :key="s" :class="{ on: s === step, done: k < at }" :aria-current="s === step ? 'step' : undefined">{{ k + 1 }}. {{ STEP_TEXT[s] }}</li>
      </ol>
      <div class="dialog-body body">
        <p v-if="!ev" class="error" role="alert">{{ tl('模型计算失败，活动无法评分。') }}</p>

        <section v-if="step === 'intro'">
          <h3 ref="heading" tabindex="-1">{{ tl('学习目标') }}</h3>
          <ul><li v-for="(g, k) in act.goals" :key="k">{{ T(g) }}</li></ul>
          <p v-if="act.prerequisites.note" class="small">{{ tl('先修：{0}', [T(act.prerequisites.note)]) }}</p>
          <p v-if="act.prerequisites.activities?.length" class="small">{{ tl('建议先完成：{0}', [act.prerequisites.activities.map(a => T(activityById(a)?.title)).join('、')]) }}</p>
          <p class="small muted">{{ tl('模型：{0}。所有参考答案由计算核心按该模型算出；评分分概念、单位、方向、建模、计算、解释六个维度，提示照记不扣分。', [act.models.map(m => `${m} ${T(modelById(m)?.title)}`).join('；')]) }}</p>
          <p class="small muted">{{ tl('本活动已完成 {0} 次；{1}', [progress.attempts, progress.mastery ? tl('已有掌握证据。') : tl('尚无掌握证据。')]) }}</p>
          <button v-if="act.open" class="btn ghost" @click="openScene"><Icon name="play" :size="13" />{{ tl('打开相关场景（离开活动）') }}</button>
        </section>

        <section v-if="step === 'diagnose'">
          <h3 ref="heading" tabindex="-1">{{ tl('先想一想（诊断，不计入掌握）') }}</h3>
          <fieldset v-for="q in act.diagnostic" :key="q.id" class="q">
            <legend>{{ T(q.prompt) }}</legend>
            <label v-for="o in q.options" :key="o.id" class="opt"><input v-model="slot(q.id).choice" type="radio" :name="q.id" :value="o.id" />{{ T(o.text) }}</label>
            <button class="btn tiny" :disabled="!slot(q.id).choice" @click="check(q, ev)">{{ tl('核对') }}</button>
            <div v-if="grades[q.id]" class="fb small" aria-live="polite">
              <p :class="grades[q.id]!.verdicts.concept === 'correct' ? 'ok' : 'no'">{{ grades[q.id]!.verdicts.concept === 'correct' ? tl('正确。') : tl('再想想。正确选项：{0}', [expectedText(q, grades[q.id]!)]) }}</p>
              <p v-for="f in grades[q.id]!.feedback" :key="f" class="muted">{{ T(q.options.find(o => o.id === f)?.feedback) }}</p>
            </div>
          </fieldset>
        </section>

        <section v-if="step === 'predict'">
          <h3 ref="heading" tabindex="-1">{{ tl('预测并说明理由') }}</h3>
          <fieldset class="q" :disabled="prediction.locked">
            <legend>{{ T(act.predict.question.prompt) }}</legend>
            <template v-if="act.predict.question.kind === 'trend'">
              <label v-for="t in TREND_OPTIONS" :key="t" class="opt"><input v-model="slot('p').choice" type="radio" name="p" :value="t" />{{ TREND_TEXT[t] }}</label>
            </template>
            <template v-else>
              <label v-for="o in act.predict.question.options" :key="o.id" class="opt"><input v-model="slot('p').choice" type="radio" name="p" :value="o.id" />{{ T(o.text) }}</label>
            </template>
          </fieldset>
          <fieldset class="q" :disabled="prediction.locked">
            <legend>{{ tl('理由') }}</legend>
            <label v-for="r in act.predict.reasons" :key="r.id" class="opt"><input v-model="prediction.reason" type="radio" name="reason" :value="r.id" />{{ T(r.text) }}</label>
            <label class="free small">{{ tl('用自己的话补充（可选，只记录不评分）') }}<textarea v-model="prediction.text" rows="2" /></label>
          </fieldset>
          <button class="btn primary" :disabled="!predictionOk || prediction.locked" @click="prediction.locked = true">{{ prediction.locked ? tl('预测已提交') : tl('提交预测') }}</button>
        </section>

        <section v-if="step === 'experiment' && exp">
          <h3 ref="heading" tabindex="-1">{{ tl('控制变量实验') }}</h3>
          <p class="small">{{ T(exp.note) }}</p>
          <p class="small muted">{{ tl('改变：{0}；保持不变：{1}', [T(varySpec?.label), held.join('，')]) }}</p>
          <fieldset class="q">
            <legend>{{ tl('选择至少三个取值') }}</legend>
            <label v-for="(x, k) in exp.values" :key="k" class="opt inline"><input v-model="picked[k]" type="checkbox" />{{ varySpec ? fmtK(x, varySpec.unit, varySpec.kind) : x }}</label>
          </fieldset>
          <button class="btn" :disabled="pickedValues.length < 3" @click="runExperiment"><Icon name="run" :size="13" />{{ tl('运行（由计算核心求值）') }}</button>
          <table v-if="series" class="series small">
            <thead><tr><th>{{ T(varySpec?.label) }}</th><th v-for="o in exp.observe" :key="o">{{ T(model.outputs.find(x => x.id === o)?.label) }}</th></tr></thead>
            <tbody><tr v-for="r in series" :key="r.x"><td class="mono">{{ varySpec ? fmtK(r.x, varySpec.unit, varySpec.kind) : r.x }}</td><td v-for="o in exp.observe" :key="o" class="mono">{{ r.ev.outputs[o]?.value !== null && r.ev.outputs[o] ? fmtK(r.ev.outputs[o].value, r.ev.outputs[o].unit, model.outputs.find(x => x.id === o)?.kind) : `— (${STATE_TEXT[r.ev.outputs[o]?.state ?? 'insufficient']})` }}</td></tr></tbody>
          </table>
          <div v-if="series" class="q">
            <p class="small" aria-live="polite">
              <template v-if="act.predict.question.kind === 'trend'">{{ tl('你的预测：{0}；实验结果：{1}。', [TREND_TEXT[(slot('p').choice ?? 'mixed') as Trend], TREND_TEXT[observed ?? 'mixed']]) }}</template>
              <template v-else>{{ tl('你的预测：{0}；模型判定：{1}。', [optionText(act.predict.question, slot('p').choice), optionText(act.predict.question, ev ? expectedChoice(act.predict.question, ev) : null)]) }}</template>
            </p>
            <label class="free small">{{ tl('对照结果，修订你的解释') }}<textarea v-model="revision.text" rows="2" @input="revision.changed = true" /></label>
          </div>
        </section>

        <section v-if="step === 'questions' || step === 'transfer'">
          <h3 ref="heading" tabindex="-1">{{ step === 'questions' ? tl('解题') : tl('迁移：换一个情境') }}</h3>
          <p v-if="step === 'transfer'" class="small">{{ T(act.transfer.text) }}</p>
          <p class="tiny muted">{{ tl('数值一律按 SI 单位填写，并选出单位。') }} {{ tl('评分按每题第一次核对；看到参考答案后修改再核对只作练习，不计入结果。') }}</p>
          <div v-for="q in (step === 'questions' ? act.questions : act.transfer.questions)" :key="q.id" class="q card">
            <fieldset v-if="q.kind === 'choice'">
              <legend>{{ T(q.prompt) }}</legend>
              <label v-for="o in q.options" :key="o.id" class="opt"><input v-model="slot(q.id).choice" type="radio" :name="q.id" :value="o.id" />{{ T(o.text) }}</label>
            </fieldset>
            <fieldset v-else-if="q.kind === 'multi'">
              <legend>{{ T(q.prompt) }}</legend>
              <label v-for="o in q.options" :key="o.id" class="opt"><input v-model="slot(q.id).choices" type="checkbox" :value="o.id" />{{ T(o.text) }}</label>
            </fieldset>
            <fieldset v-else-if="q.kind === 'number'">
              <legend>{{ T(q.prompt) }}</legend>
              <label class="opt inline">{{ tl('数值') }} <input v-model="slot(q.id).value" type="text" inputmode="decimal" class="num" :aria-label="tl('数值')" /></label>
              <label class="opt inline">{{ tl('单位') }} <select v-model="slot(q.id).unit" :aria-label="tl('单位')"><option :value="null" disabled>{{ tl('选择单位') }}</option><option v-for="u in q.units" :key="u" :value="u">{{ unitText(u) }}</option></select></label>
            </fieldset>
            <div class="qa">
              <button class="btn tiny" @click="check(q, evFor(q))">{{ tl('核对') }}</button>
              <button v-if="(q.hints ?? []).length > (hints[q.id] ?? 0)" class="btn ghost tiny" @click="moreHint(q)">{{ tl('提示（第 {0} 条）', [(hints[q.id] ?? 0) + 1]) }}</button>
            </div>
            <ul v-if="hintOf(q).length" class="hints small"><li v-for="(h, k) in hintOf(q)" :key="k">{{ T(h) }}</li></ul>
            <div v-if="grades[q.id]" class="fb small" aria-live="polite">
              <p v-if="grades[q.id]!.ungradable" class="no">{{ tl('模型在此处不给出数值，本题不评分。') }}</p>
              <p v-else><span v-for="[d, v] in verdictList(grades[q.id]!)" :key="d" class="dim" :class="v === 'correct' ? 'ok' : 'no'">{{ DIM_TEXT[d] }} {{ v === 'correct' ? '✓' : '✗' }}</span> <span class="muted">{{ tl('参考：{0}', [expectedText(q, grades[q.id]!)]) }}</span></p>
              <p v-for="f in grades[q.id]!.feedback" :key="f" class="muted">{{ q.kind === 'choice' || q.kind === 'multi' ? T(q.options.find(o => o.id === f)?.feedback) : '' }}</p>
              <p v-if="revisedAfterCheck(q)" class="tiny muted">{{ tl('修改后再次核对：只作练习，结果仍按第一次核对计。') }}</p>
            </div>
          </div>
        </section>

        <section v-if="step === 'summary'">
          <h3 ref="heading" tabindex="-1">{{ tl('结果') }}</h3>
          <p :class="mastery ? 'ok' : 'muted'" class="verdict">{{ mastery ? tl('本次作答构成掌握证据。') : tl('本次作答已记为“已练习”，尚不构成掌握证据。') }}</p>
          <table class="dims small">
            <thead><tr><th>{{ tl('维度') }}</th><th>{{ tl('正确 / 评分项') }}</th></tr></thead>
            <tbody><tr v-for="d in DIMENSIONS" :key="d"><td>{{ DIM_TEXT[d] }}</td><td class="mono">{{ dims[d].total ? `${dims[d].correct} / ${dims[d].total}` : '—' }}</td></tr></tbody>
          </table>
          <p class="tiny muted">{{ tl('提示使用 {0} 次（不扣分）。', [Object.values(hints).reduce((a, b) => a + b, 0)]) }}<template v-if="revisedCount"> {{ tl('{0} 题在核对后修改过，结果按第一次核对计。', [revisedCount]) }}</template></p>
          <p class="tiny rule">{{ rule }}</p>
          <div class="qa"><button class="btn ghost" @click="exportAttempt"><Icon name="download" :size="13" />{{ tl('导出本次作答（含运行清单）') }}</button><button v-if="act.open" class="btn ghost" @click="openScene">{{ tl('打开相关场景') }}</button></div>
        </section>
      </div>
      <div class="dialog-footer">
        <button class="btn ghost" :disabled="at <= 0 || step === 'summary'" @click="back">{{ tl('上一步') }}</button>
        <span class="spacer" />
        <button v-if="step !== 'summary'" class="btn primary" :disabled="!canNext" @click="next">{{ order[at + 1] === 'summary' ? tl('完成并记录') : tl('下一步') }}</button>
        <button v-else class="btn primary" @click="close">{{ tl('关闭') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.activity { width: min(860px, 96vw); }
.spacer { flex: 1; }
.steps { display: flex; flex-wrap: wrap; gap: 4px 12px; list-style: none; margin: 0; padding: 6px 16px; border-bottom: 1px solid var(--separator); color: var(--text-2); }
.steps li.on { color: var(--accent); font-weight: 600; }
.steps li.done { color: var(--text); }
.body { max-height: 66vh; overflow: auto; }
h3 { margin: 4px 0 8px; outline: none; }
.q { border: 1px solid var(--separator); border-radius: 10px; padding: 8px 10px; margin: 0 0 10px; }
.q legend { font-weight: 600; padding: 0 4px; }
.card fieldset { border: 0; padding: 0; margin: 0; }
.opt { display: flex; gap: 8px; align-items: center; padding: 3px 0; cursor: pointer; }
.opt.inline { display: inline-flex; margin-right: 14px; }
.free { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
textarea { width: 100%; font: inherit; }
.num { width: 140px; }
.qa { display: flex; gap: 8px; margin-top: 6px; }
.hints { margin: 6px 0 0; padding-left: 18px; color: var(--text-2); }
.fb { margin-top: 6px; }
.fb p { margin: 2px 0; }
.dim { margin-right: 8px; }
.ok { color: var(--success, #16a34a); }
.no { color: var(--danger, #dc2626); }
.series, .dims { border-collapse: collapse; margin: 8px 0; }
.series td, .series th, .dims td, .dims th { padding: 3px 8px; border-bottom: 1px solid var(--separator); text-align: left; }
.mono { font-family: var(--font-mono); }
.verdict { font-weight: 600; }
.rule { background: var(--hover); border-radius: 8px; padding: 6px 8px; }
.error { color: var(--danger, #dc2626); }
</style>
