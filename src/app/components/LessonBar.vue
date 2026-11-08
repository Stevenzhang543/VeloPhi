<script setup lang="ts">
/**
 * The classroom experiment card (26.61, phase B): over the studio, so the scene, the curves, the event list and the
 * formula cards stay visible; six steps (看现象 → 提交预测 → 操纵一个变量 → 观察指定时刻 → 用证据解释 → 迁移), the
 * evidence buttons of each step, the prediction (locked once submitted, judged by the engine's result), two hints,
 * the assumptions, and for the teacher the flow, common errors, projection and the printable sheets.
 */
import { computed, ref } from 'vue'
import { tl, activeLang } from '../../i18n'
import type { Tri } from '../../i18n/tri'
import { T3 } from '../models/labels'
import { lessonById, LESSON_STEPS, LESSON_STEP_TEXT } from '../../teaching/lessons/defs'
import type { LessonStep } from '../../teaching/lessons/defs'
import { collisionEvidence, fitRcCsv, rcEvidence, rightOption, sampleRcCsv, staticEvidence, transferAnswer } from '../../teaching/lessons/evidence'
import type { CsvFit } from '../../teaching/lessons/evidence'
import { lessonHandout } from '../../teaching/lessons/handout'
import { parseMeasuredCsv } from '../../analysis/measured'
import { lessonUi, closeLesson, goStep, nextStep, prevStep, setProjector, showEvidence } from '../lessons'
import { saveFile, openTextFile } from '../../platform/files'
import { showToast } from '../store'
import { phone } from '../layout'
import Icon from './Icon.vue'

const T = (t: Tri | undefined) => T3(t)
const lesson = computed(() => lessonById(lessonUi.id ?? '')!)
const step = computed<LessonStep>(() => lesson.value.steps.find(s => s.id === lessonUi.step)!)
const at = computed(() => LESSON_STEPS.indexOf(lessonUi.step))
const n = (v: number | null | undefined, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : Number(v.toPrecision(d)).toString())

/** The engine's evidence of the lesson (computed once per lesson; short runs). */
const evidence = computed(() => {
  const id = lesson.value.id
  if (id === 'lesson-static') return { static: [20, 25, 28, 35].map(th => staticEvidence(th)) }
  if (id === 'lesson-collision') return { collision: [0.5, 1, 2, 4].map(m => collisionEvidence(m)) }
  return { rc: [[500, 1e-4], [1000, 1e-4], [2000, 1e-4], [1000, 2e-4]].map(([R, C]) => rcEvidence(R, C)) }
})
const evidenceLines = computed(() => {
  const e = evidence.value
  if (e.static) return e.static.map(s => tl('θ = {0}°：规则 {1}，引擎 {2}，摩擦力 {3} N（预期 {4} N）', [s.theta, s.ruleStays ? tl('静止') : tl('滑动'), s.engineStays ? tl('静止') : tl('滑动'), n(Math.abs(s.friction ?? NaN), 4), n(s.expected, 4)]))
  if (e.collision) return e.collision.map(c => tl('m₂ = {0} kg：碰后 v_A = {1}，v_B = {2} m/s；p {3} → {4}；E_k {5} → {6} J', [c.m2, n(c.after.vA, 4), n(c.after.vB, 4), n(c.before.p, 4), n(c.after.p, 4), n(c.before.ek, 4), n(c.after.ek, 4)]))
  return (e.rc ?? []).map(r => tl('R = {0} Ω，C = {1} F：τ = {2} s，V(τ)/Vs = {3}', [r.R, r.C, n(r.tau, 4), n(r.ratio, 4)]))
})
const allAgree = computed(() => { const e = evidence.value; return (e.static ?? e.collision ?? e.rc ?? []).every(x => x.agrees) })

// ---- predict / explain / transfer ----
const right = (s: 'predict' | 'explain') => rightOption(lesson.value.id, s)
function submit(s: 'predict' | 'explain') { if (lessonUi.choice[s]) lessonUi.locked[s] = true }
const predictJudged = computed(() => lessonUi.locked.predict && at.value >= LESSON_STEPS.indexOf('manipulate'))
const transferRef = computed(() => transferAnswer(lesson.value.id))
const transferOk = computed(() => {
  const v = Number(lessonUi.transfer.replace(',', '.'))
  const s = step.value.number
  if (!lessonUi.transfer.trim() || !Number.isFinite(v) || !s) return null
  return Math.abs(v - transferRef.value) <= s.rtol * Math.abs(transferRef.value)
})

// ---- RC: the measured CSV ----
const csvText = ref<string | null>(null)
const csvCols = computed(() => { try { return csvText.value ? parseMeasuredCsv(csvText.value).columns : [] } catch { return [] } })
const timeCol = ref(0), voltCol = ref(1)
const fit = computed<CsvFit | null>(() => { try { return csvText.value ? fitRcCsv(csvText.value, timeCol.value, voltCol.value) : null } catch { return null } })
async function loadCsv() {
  const f = await openTextFile([{ name: 'CSV', extensions: ['csv', 'txt'] }]).catch(() => null)
  if (f) { csvText.value = f.text; timeCol.value = 0; voltCol.value = Math.min(1, csvCols.value.length - 1) }
}

// ---- teacher ----
async function exportSheet(role: 'student' | 'teacher') {
  const html = lessonHandout(lesson.value, activeLang(), role, role === 'teacher' ? evidenceLines.value : [])
  try { if (await saveFile(html, `${lesson.value.id}-${role}.html`, [{ name: 'HTML', extensions: ['html'] }])) showToast(tl('已保存')) } catch (e) { showToast((e as Error).message, true) }
}
</script>

<template>
  <aside v-if="lessonUi.id" class="lesson" :class="{ proj: lessonUi.projector, phone, collapsed: lessonUi.collapsed }" role="region" :aria-label="tl('课堂实验')" data-ui="lesson">
    <header>
      <Icon name="graduation" :size="15" />
      <b class="title">{{ T(lesson.title) }}</b>
      <span class="spacer" />
      <button type="button" class="btn icon ghost" :class="{ on: lessonUi.teacher }" :title="tl('教师视图')" :aria-pressed="lessonUi.teacher" @click="lessonUi.teacher = !lessonUi.teacher"><Icon name="user" :size="14" /></button>
      <button type="button" class="btn icon ghost" :class="{ on: lessonUi.projector }" :title="tl('投影模式')" :aria-pressed="lessonUi.projector" @click="setProjector(!lessonUi.projector)"><Icon name="monitor" :size="14" /></button>
      <button type="button" class="btn icon ghost" :title="lessonUi.collapsed ? tl('展开') : tl('收起')" @click="lessonUi.collapsed = !lessonUi.collapsed"><Icon :name="lessonUi.collapsed ? 'expandDown' : 'expandUp'" :size="14" /></button>
      <button type="button" class="btn icon ghost" :title="tl('结束课堂实验')" :aria-label="tl('结束课堂实验')" @click="closeLesson"><Icon name="cross" :size="14" /></button>
    </header>
    <template v-if="!lessonUi.collapsed">
      <ol class="steps" :aria-label="tl('步骤')">
        <li v-for="(s, k) in LESSON_STEPS" :key="s"><button type="button" :class="{ on: s === lessonUi.step, done: k < at }" :aria-current="s === lessonUi.step ? 'step' : undefined" @click="goStep(s)">{{ k + 1 }}. {{ T(LESSON_STEP_TEXT[s]) }}</button></li>
      </ol>
      <div class="body">
        <p v-if="lessonUi.step === 'observe'" class="goal">{{ T(lesson.goal) }}<br><span class="muted">{{ T(lesson.start) }}</span></p>
        <p class="text">{{ T(step.text) }}</p>
        <div v-if="step.evidence?.length" class="ev">
          <button v-for="(e, i) in step.evidence" :key="i" type="button" class="btn small" :class="{ primary: lessonUi.shown === tl(e.label.zh) }" :disabled="lessonUi.busy" data-ui="lesson-evidence" @click="showEvidence(e)"><Icon name="play" :size="12" />{{ T(e.label) }}</button>
        </div>

        <!-- Predict and explain: a choice, locked once submitted; judged by the engine's result -->
        <div v-if="step.options && (lessonUi.step === 'predict' || lessonUi.step === 'explain')" class="choice" role="radiogroup">
          <label v-for="o in step.options" :key="o.id" :class="{ right: (lessonUi.step === 'explain' ? lessonUi.locked.explain : predictJudged) && o.id === right(lessonUi.step as 'predict' | 'explain') }">
            <input v-model="lessonUi.choice[lessonUi.step]" type="radio" :value="o.id" :disabled="lessonUi.locked[lessonUi.step]"> {{ T(o.text) }}
          </label>
          <button v-if="!lessonUi.locked[lessonUi.step]" type="button" class="btn small primary" :disabled="!lessonUi.choice[lessonUi.step]" @click="submit(lessonUi.step as 'predict' | 'explain')">{{ lessonUi.step === 'predict' ? tl('提交预测') : tl('提交解释') }}</button>
          <p v-else-if="lessonUi.step === 'predict'" class="muted">{{ tl('预测已记录。操纵变量、看到结果后再对照。') }}</p>
          <p v-else-if="lessonUi.choice.explain === right('explain')" class="ok">{{ tl('与证据一致。') }}</p>
          <p v-else class="warn">{{ T(step.options.find(o => o.id === lessonUi.choice.explain)?.feedback) || tl('再看一次证据。') }}</p>
        </div>
        <p v-if="predictJudged && lessonUi.step !== 'predict'" class="small" :class="lessonUi.choice.predict === right('predict') ? 'ok' : 'warn'">
          {{ lessonUi.choice.predict === right('predict') ? tl('你的预测与引擎的结果一致。') : tl('你的预测与引擎的结果不同：用这一步的证据找原因。') }}
        </p>

        <!-- The engine's evidence of the lesson (manipulate, observe at) -->
        <table v-if="lessonUi.step === 'manipulate' || lessonUi.step === 'observeAt' || lessonUi.teacher" class="tbl">
          <caption>{{ tl('引擎证据') }} <span :class="allAgree ? 'ok' : 'warn'">{{ allAgree ? tl('与教材规则一致（容差内）') : tl('与教材规则不一致') }}</span></caption>
          <tbody><tr v-for="(l, i) in evidenceLines" :key="i"><td>{{ l }}</td></tr></tbody>
        </table>

        <!-- RC: map the columns of a measured CSV -->
        <div v-if="lesson.id === 'lesson-rc' && lessonUi.step === 'observeAt'" class="csv">
          <div class="row">
            <button type="button" class="btn small" @click="csvText = sampleRcCsv(); timeCol = 0; voltCol = 1">{{ tl('载入示例数据（合成）') }}</button>
            <button type="button" class="btn small ghost" @click="loadCsv">{{ tl('打开 CSV…') }}</button>
          </div>
          <div v-if="csvCols.length" class="row">
            <label>{{ tl('时间列') }} <select v-model.number="timeCol"><option v-for="(c, i) in csvCols" :key="i" :value="i">{{ c.name }}{{ c.unit ? ` (${c.unit})` : '' }}</option></select></label>
            <label>{{ tl('电压列') }} <select v-model.number="voltCol"><option v-for="(c, i) in csvCols" :key="i" :value="i">{{ c.name }}{{ c.unit ? ` (${c.unit})` : '' }}</option></select></label>
          </div>
          <p v-if="fit" class="small">{{ tl('{0} 个点 · 实测 τ ≈ {1} s（模型 RC = 0.1 s）· RMS 偏差 {2} V', [fit.n, n(fit.tau, 3), n(fit.rms, 2)]) }}</p>
        </div>

        <div v-if="lessonUi.step === 'transfer' && step.number" class="num">
          <label>{{ T(step.number.prompt) }} <input v-model="lessonUi.transfer" inputmode="decimal" size="8"> {{ step.number.unit }}</label>
          <span v-if="transferOk === true" class="ok">{{ tl('正确') }}</span>
          <span v-else-if="transferOk === false" class="warn">{{ tl('再算一次') }}</span>
        </div>

        <details class="small"><summary>{{ tl('提示（{0}）', [2]) }}</summary>
          <ol><li v-for="(h, i) in lesson.hints.slice(0, Math.max(1, lessonUi.hints))" :key="i">{{ T(h) }}</li></ol>
          <button v-if="lessonUi.hints < 2" type="button" class="btn small ghost" @click="lessonUi.hints = Math.max(2, lessonUi.hints + 1)">{{ tl('下一条提示') }}</button>
          <p v-for="(h, i) in step.hints ?? []" :key="`s${i}`" class="muted">{{ T(h) }}</p>
        </details>
        <details class="small"><summary>{{ tl('适用条件') }}</summary><ul><li v-for="(a, i) in lesson.assumptions" :key="i">{{ T(a) }}</li></ul></details>

        <section v-if="lessonUi.teacher" class="teacher">
          <h4>{{ tl('教师流程（{0} 分钟）', [lesson.teacher.minutes]) }}</h4>
          <ol><li v-for="(f, i) in lesson.teacher.flow" :key="i">{{ T(f) }}</li></ol>
          <h4>{{ tl('常见错误') }}</h4>
          <ul><li v-for="(m, i) in lesson.misconceptions" :key="i">{{ T(m) }}</li></ul>
          <div class="row">
            <button type="button" class="btn small" @click="exportSheet('student')"><Icon name="download" :size="12" />{{ tl('学生材料') }}</button>
            <button type="button" class="btn small" @click="exportSheet('teacher')"><Icon name="download" :size="12" />{{ tl('教师材料') }}</button>
          </div>
        </section>
      </div>
      <footer>
        <button type="button" class="btn ghost small" :disabled="at <= 0" @click="prevStep">{{ tl('上一步') }}</button>
        <span class="spacer" />
        <button v-if="at < LESSON_STEPS.length - 1" type="button" class="btn primary small" :disabled="lessonUi.step === 'predict' && !lessonUi.locked.predict" @click="nextStep">{{ tl('下一步') }}</button>
        <button v-else type="button" class="btn primary small" @click="closeLesson">{{ tl('完成') }}</button>
      </footer>
    </template>
  </aside>
</template>

<style scoped>
.lesson { position: fixed; left: 72px; top: 64px; z-index: 40; width: min(380px, calc(100vw - 32px)); max-height: calc(100vh - 160px); display: flex; flex-direction: column; background: var(--pane); color: var(--text); border: 1px solid var(--separator); border-radius: var(--radius-panel); box-shadow: var(--shadow-pop); font-size: var(--type-small); }
.lesson.phone { left: 16px; right: 16px; width: auto; top: 56px; max-height: 46vh; }
.lesson.proj { font-size: calc(var(--type-body) * 1.25); width: min(520px, calc(100vw - 32px)); }
.lesson.collapsed { max-height: none; }
header { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-bottom: 1px solid var(--separator); }
.title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.spacer { flex: 1; }
.btn.on { color: var(--accent); }
.steps { display: flex; flex-wrap: wrap; gap: 2px 6px; list-style: none; margin: 0; padding: 6px 10px; border-bottom: 1px solid var(--separator); }
.steps button { border: 0; background: none; color: var(--text-2); font: inherit; font-size: 0.92em; padding: 2px 0; cursor: pointer; }
.steps button.on { color: var(--accent); font-weight: 600; }
.steps button.done { color: var(--text); }
.body { overflow: auto; padding: 8px 12px; display: flex; flex-direction: column; gap: 8px; }
.goal { margin: 0; }
.text { margin: 0; font-weight: 500; }
.ev, .row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.choice { display: flex; flex-direction: column; gap: 4px; }
.choice label.right { color: var(--success, #15803d); font-weight: 600; }
.tbl { width: 100%; border-collapse: collapse; font-size: 0.92em; }
.tbl caption { text-align: left; font-weight: 600; margin-bottom: 2px; }
.tbl td { border-top: 1px solid var(--separator); padding: 3px 0; }
.ok { color: var(--success, #15803d); }
.warn { color: var(--warning, #b45309); }
.muted { color: var(--text-2); }
.small { font-size: 0.92em; }
.teacher h4 { margin: 6px 0 2px; font-size: 1em; }
.teacher ol, .teacher ul, details ol, details ul { margin: 2px 0; padding-left: 18px; }
footer { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-top: 1px solid var(--separator); }
select, input { font: inherit; }
</style>
