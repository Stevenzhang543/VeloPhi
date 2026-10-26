<script setup lang="ts">
/**
 * 26.52 problem panel (right sidebar tab, D40 revised). Student side: the stem and the questions with answer
 * fields (display units); while answering, the playhead stays at t = 0 and curves, formula cards, events and
 * readouts are hidden. "揭晓答案" plays the run and checks every answer against the simulation, with the formula's
 * theoretical value, hints and explanations. Built-in problems offer another set of numbers.
 * Teacher side (editing): title, chapter, stem and questions — numeric questions read from the simulation
 * (a quantity at a time, at an event, at the end, its extreme, an event time, a formula result) or choice
 * questions — and export as a problem file.
 */
import { tl, activeLang } from '../../i18n'
import { computed, watch } from 'vue'
import { state } from '../store'
import { fmtQ, toDisp, unitLabel } from '../settings'
import type { ChoiceQuestion, NumericQuestion, ProblemQuestion, ProblemTarget, QuestionKey } from '../../teaching/problems'
import { CHAPTERS, isCorrect, answerError, problemParams, ptext, questionKey } from '../../teaching/problems'
import { listQuantities } from '../../core/observe/quantities'
import type { QuantityDef } from '../../core/observe/quantities'
import { recognize } from '../../formula/situations'
import { FORMULAS } from '../../formula/library'
import { EVENT_TYPES, SITUATION_NAMES } from '../../analysis/prediction'
import { relErrorText } from '../../export/formulaImage'
import { anotherSet, exitProblem, exportProblem, retry, reveal } from '../problemMode'
import NumField from './NumField.vue'
import Icon from './Icon.vue'

const s = computed(() => state.problem)
const lang = computed(() => activeLang())
const params = computed(() => (s.value ? problemParams({ ...s.value.problem, scene: state.scene }) : {}))
const text = (t: Parameters<typeof ptext>[0]) => ptext(t, lang.value, params.value)
const chapterLabel = (id: string) => { const c = CHAPTERS.find(x => x.id === id); return c ? c.label[lang.value] : id }

const rec = computed(() => (!state.stale && state.recording && state.recording.completed !== false && !state.computing ? state.recording : null))
const sits = computed(() => {
  const r = rec.value
  if (!r) return []
  return state.situations.length ? state.situations : recognize(r)
})
const keys = computed(() => {
  const r = rec.value, p = s.value
  const m = new Map<string, QuestionKey>()
  if (!r || !p) return m
  for (const q of p.problem.questions) {
    try { m.set(q.id, questionKey(r, sits.value, q)) } catch { m.set(q.id, { value: null, theory: null, unit: '', note: tl('无法读取答案') }) }
  }
  return m
})
const unitOf = (q: ProblemQuestion) => keys.value.get(q.id)?.unit ?? ''
const scaleOf = (si: string) => (si ? toDisp(1, si) : 1)
const labelOf = (si: string) => (si ? unitLabel(si) : '')
const showResults = computed(() => !!s.value && (s.value.revealed || s.value.editing))
const score = computed(() => {
  const p = s.value
  if (!p) return { right: 0, total: 0 }
  let right = 0
  for (const q of p.problem.questions) if (isCorrect(q, p.answers[q.id], keys.value.get(q.id) ?? { value: null, theory: null, unit: '' }) === true) right++
  return { right, total: p.problem.questions.length }
})
const verdict = (q: ProblemQuestion) => {
  const p = s.value
  if (!p) return null
  return isCorrect(q, p.answers[q.id], keys.value.get(q.id) ?? { value: null, theory: null, unit: '' })
}
const LETTERS = 'ABCDEFGH'
function setAnswer(id: string, v: number | null) { if (s.value) s.value.answers[id] = v }
function errOf(q: NumericQuestion): string {
  const a = s.value?.answers[q.id], k = keys.value.get(q.id)
  if (a === null || a === undefined || !k || k.value === null) return ''
  return relErrorText(answerError(a, k))
}

// ---- Teacher: editing ----
const quantities = computed<QuantityDef[]>(() => (state.recording ? listQuantities(state.recording.system) : []))
const dynamicBodies = computed(() => state.scene.bodies.filter(b => b.kind !== 'static'))
const situationTypes = computed(() => {
  const seen = [...new Set(state.situations.map(x => x.type))]
  return seen.length ? seen : [...new Set(FORMULAS.map(f => f.situation))]
})
const formulasOf = (type: string) => FORMULAS.filter(f => f.situation === type)
const KIND_LABEL: Record<ProblemTarget['kind'], string> = {
  quantity: tl('某时刻的物理量'), event: tl('事件发生的时刻'), atEvent: tl('事件前后的物理量'), end: tl('运行结束时的物理量'), extreme: tl('物理量的最大或最小值'), formula: tl('公式对照中的结果')
}
const firstQuantity = () => state.scene.watch.find(id => quantities.value.some(q => q.id === id)) ?? quantities.value[0]?.id ?? ''
function defaultTarget(kind: ProblemTarget['kind']): ProblemTarget {
  switch (kind) {
    case 'quantity': return { kind, id: firstQuantity(), t: 1 }
    case 'event': return { kind, event: 'impact', body: null }
    case 'atEvent': return { kind, id: firstQuantity(), event: 'impact', body: null, side: 'after' }
    case 'end': return { kind, id: firstQuantity() }
    case 'extreme': return { kind, id: firstQuantity(), which: 'max' }
    default: { const t = situationTypes.value[0] ?? ''; return { kind: 'formula', situation: t, formula: formulasOf(t)[0]?.id ?? '', occurrence: 0 } }
  }
}
function newId(): string {
  const list = s.value?.problem.questions ?? []
  let k = list.length + 1
  while (list.some(q => q.id === `q${k}`)) k++
  return `q${k}`
}
function addNumeric() { s.value?.problem.questions.push({ id: newId(), type: 'numeric', prompt: '', target: defaultTarget('quantity'), tolerance: 0.02 }) }
function addChoice() { s.value?.problem.questions.push({ id: newId(), type: 'choice', prompt: '', options: [tl('选项 A'), tl('选项 B')], answer: 0 }) }
function removeQuestion(i: number) { s.value?.problem.questions.splice(i, 1) }
function moveQuestion(i: number, d: number) {
  const list = s.value?.problem.questions
  if (!list) return
  const j = i + d
  if (j < 0 || j >= list.length) return
  const [q] = list.splice(i, 1)
  list.splice(j, 0, q)
}
function setKind(q: NumericQuestion, kind: ProblemTarget['kind']) { q.target = defaultTarget(kind) }
// Editing a built-in (trilingual) text keeps the current language's version as plain text
function setTitle(v: string) { if (s.value) s.value.problem.title = v }
function setStem(v: string) { if (s.value) s.value.problem.stem = v }
function setChoiceAnswer(q: ChoiceQuestion, k: number) { q.answer = k; delete q.answerFrom }
function removeOption(q: ChoiceQuestion, k: number) {
  if (q.options.length <= 2) return
  q.options.splice(k, 1)
  if ((q.answer ?? 0) >= q.options.length) q.answer = 0
}
function setFormulaSituation(q: NumericQuestion) {
  if (q.target.kind === 'formula') q.target.formula = formulasOf(q.target.situation)[0]?.id ?? ''
}
watch(() => state.problem?.editing, e => { if (e) state.rightTab = 'problem' })
const tolPct = (q: NumericQuestion) => Math.round((q.tolerance ?? 0.02) * 1000) / 10
</script>

<template>
  <div v-if="s" class="problem">
    <div class="head">
      <span class="chip">{{ s.problem.chapter ? chapterLabel(s.problem.chapter) : tl('自编题') }}</span>
      <span class="spacer" />
      <button v-if="s.problem.builtin && !s.editing" class="btn small ghost" :title="tl('随机换一组参数，答案由仿真重新得出')" @click="anotherSet"><Icon name="sweep" :size="13" />{{ tl('换一组数据') }}</button>
      <button class="btn small ghost" :class="{ active: s.editing }" :title="tl('教师：编辑题干与问题')" @click="s.editing = !s.editing"><Icon name="pen" :size="13" />{{ s.editing ? tl('预览作答') : tl('编辑题目') }}</button>
      <button class="btn icon ghost" :title="tl('退出题目模式')" @click="exitProblem"><Icon name="close" /></button>
    </div>

    <!-- Teacher: title, chapter and stem -->
    <template v-if="s.editing">
      <div class="group">
        <div class="row"><label>{{ tl('标题') }}</label><input class="field grow" :value="ptext(s.problem.title, lang)" @change="e => setTitle((e.target as HTMLInputElement).value)" /></div>
        <div class="row"><label>{{ tl('章节') }}</label><select v-model="s.problem.chapter" class="field grow"><option value="">{{ tl('（未分类）') }}</option><option v-for="c in CHAPTERS" :key="c.id" :value="c.id">{{ c.label[lang] }}</option></select></div>
        <div class="row top"><label>{{ tl('题干') }}</label><textarea class="field grow" rows="4" :value="ptext(s.problem.stem, lang)" @change="e => setStem((e.target as HTMLTextAreaElement).value)" /></div>
        <div class="tiny muted">{{ tl('题干中可以用 {参数名} 引用模板参数（如 {m}），数值随场景参数更新。') }}</div>
      </div>
    </template>
    <template v-else>
      <h2 class="title">{{ text(s.problem.title) }}</h2>
      <p class="stem">{{ text(s.problem.stem) }}</p>
    </template>

    <div v-if="!s.editing && !s.revealed" class="tiny muted lock"><Icon name="info" :size="12" />{{ tl('作答期间画面停在 t = 0，曲线、公式对照与读数暂时隐藏；可以查看物体的参数。') }}</div>

    <!-- Questions -->
    <article v-for="(q, i) in s.problem.questions" :key="q.id" class="q" :class="showResults && !s.editing && verdict(q) !== null ? (verdict(q) ? 'ok' : 'bad') : ''">
      <div class="q-head">
        <span class="q-num">{{ i + 1 }}</span>
        <span v-if="!s.editing" class="q-prompt">{{ text(q.prompt) }}</span>
        <input v-else class="field grow" :value="ptext(q.prompt, lang)" :placeholder="tl('问题文字')" @change="e => (q.prompt = (e.target as HTMLInputElement).value)" />
        <template v-if="s.editing">
          <button class="btn icon ghost mini" :title="tl('上移')" :disabled="i === 0" @click="moveQuestion(i, -1)">↑</button>
          <button class="btn icon ghost mini" :title="tl('下移')" :disabled="i === s.problem.questions.length - 1" @click="moveQuestion(i, 1)">↓</button>
          <button class="btn icon ghost mini" :title="tl('删除这个问题')" @click="removeQuestion(i)"><Icon name="trash" :size="13" /></button>
        </template>
      </div>

      <!-- Answer fields -->
      <template v-if="!s.editing">
        <div v-if="q.type === 'numeric'" class="row answer">
          <NumField class="grow" :model-value="s.answers[q.id] ?? NaN" :unit="labelOf(unitOf(q))" :scale="scaleOf(unitOf(q))" :disabled="s.revealed" @update:model-value="v => setAnswer(q.id, v)" />
        </div>
        <div v-else class="options">
          <label v-for="(o, k) in (q as ChoiceQuestion).options" :key="k" class="opt" :class="{ right: s.revealed && keys.get(q.id)?.value === k, chosen: s.answers[q.id] === k }">
            <input type="radio" :name="`pq-${q.id}`" :checked="s.answers[q.id] === k" :disabled="s.revealed" @change="setAnswer(q.id, k)" /><b>{{ LETTERS[k] }}.</b> {{ text(o) }}
          </label>
        </div>
        <div v-if="q.hint && !s.revealed" class="hint-line">
          <button v-if="!s.hints[q.id]" class="btn small ghost" @click="s.hints[q.id] = true"><Icon name="sparkle" :size="12" />{{ tl('显示提示') }}</button>
          <span v-else class="small hint">{{ text(q.hint) }}</span>
        </div>
        <!-- Result -->
        <div v-if="s.revealed" class="result small">
          <div class="verdict">
            <span class="badge" :class="verdict(q) === true ? 'ok' : verdict(q) === false ? 'bad' : ''">{{ verdict(q) === true ? tl('正确') : verdict(q) === false ? tl('错误') : s.answers[q.id] === undefined || s.answers[q.id] === null ? tl('未作答') : tl('无法判定') }}</span>
            <template v-if="q.type === 'numeric'">
              <span>{{ tl('答案') }} <b class="mono">{{ fmtQ(keys.get(q.id)?.value ?? null, unitOf(q)) }}</b></span>
              <span v-if="errOf(q as NumericQuestion)" class="muted">{{ tl('你的误差 {0}', [errOf(q as NumericQuestion)]) }}</span>
            </template>
            <span v-else-if="keys.get(q.id)?.value !== null && keys.get(q.id)?.value !== undefined">{{ tl('答案') }} <b>{{ LETTERS[keys.get(q.id)!.value!] }}</b></span>
          </div>
          <div v-if="q.type === 'numeric' && keys.get(q.id)?.theory !== null && keys.get(q.id)?.theory !== undefined" class="muted">{{ tl('公式理论值 {0}', [fmtQ(keys.get(q.id)!.theory, unitOf(q))]) }}</div>
          <div v-if="keys.get(q.id)?.note" class="muted">{{ keys.get(q.id)!.note }}</div>
          <div v-if="q.explain" class="explain">{{ text(q.explain) }}</div>
        </div>
      </template>

      <!-- Teacher: question editor -->
      <template v-else>
        <template v-if="q.type === 'numeric'">
          <div class="row"><label>{{ tl('答案来自') }}</label>
            <select class="field grow" :value="q.target.kind" @change="e => setKind(q as NumericQuestion, (e.target as HTMLSelectElement).value as ProblemTarget['kind'])"><option v-for="(l, k) in KIND_LABEL" :key="k" :value="k">{{ l }}</option></select>
          </div>
          <template v-if="q.target.kind === 'quantity' || q.target.kind === 'atEvent' || q.target.kind === 'end' || q.target.kind === 'extreme'">
            <div class="row"><label>{{ tl('物理量') }}</label><select v-model="q.target.id" class="field grow"><option v-for="x in quantities" :key="x.id" :value="x.id">{{ x.owner }} · {{ x.label }}</option></select></div>
          </template>
          <div v-if="q.target.kind === 'quantity'" class="row"><label>{{ tl('时刻') }}</label><NumField class="grow" :model-value="q.target.t" :unit="labelOf('s')" :scale="scaleOf('s')" :min="0" @update:model-value="v => { if (q.type === 'numeric' && q.target.kind === 'quantity') q.target.t = v }" /></div>
          <template v-if="q.target.kind === 'event' || q.target.kind === 'atEvent'">
            <div class="row"><label>{{ tl('事件') }}</label><select v-model="q.target.event" class="field grow"><option v-for="e in EVENT_TYPES" :key="e.type" :value="e.type">{{ tl('首次{0}', [e.label]) }}</option></select></div>
            <div class="row"><label>{{ tl('涉及物体') }}</label><select v-model="q.target.body" class="field grow"><option :value="null">{{ tl('任意') }}</option><option v-for="b in dynamicBodies" :key="b.id" :value="b.id">{{ b.name }}</option></select></div>
          </template>
          <div v-if="q.target.kind === 'atEvent'" class="row"><label>{{ tl('取值') }}</label><select v-model="q.target.side" class="field grow"><option value="before">{{ tl('事件前瞬间') }}</option><option value="after">{{ tl('事件后瞬间') }}</option></select></div>
          <div v-if="q.target.kind === 'extreme'" class="row"><label>{{ tl('取值') }}</label><select v-model="q.target.which" class="field grow"><option value="max">{{ tl('最大值') }}</option><option value="min">{{ tl('最小值') }}</option></select></div>
          <template v-if="q.target.kind === 'formula'">
            <div class="row"><label>{{ tl('情形') }}</label><select v-model="q.target.situation" class="field grow" @change="setFormulaSituation(q as NumericQuestion)"><option v-for="t in situationTypes" :key="t" :value="t">{{ SITUATION_NAMES[t] ?? t }}</option></select></div>
            <div class="row"><label>{{ tl('公式') }}</label><select v-model="q.target.formula" class="field grow"><option v-for="f in formulasOf(q.target.situation)" :key="f.id" :value="f.id">{{ f.title }}</option></select></div>
          </template>
          <div class="row"><label>{{ tl('容差') }}</label><NumField :model-value="tolPct(q as NumericQuestion)" label="%" :min="0" :max="50" width="96px" @update:model-value="v => { if (q.type === 'numeric') q.tolerance = v / 100 }" /></div>
        </template>
        <template v-else>
          <div v-for="(o, k) in (q as ChoiceQuestion).options" :key="k" class="row">
            <label class="opt-edit"><input type="radio" :name="`pe-${q.id}`" :checked="(q as ChoiceQuestion).answer === k" :title="tl('设为正确选项')" @change="setChoiceAnswer(q as ChoiceQuestion, k)" /><b>{{ LETTERS[k] }}</b></label>
            <input class="field grow" :value="ptext(o, lang)" @change="e => ((q as ChoiceQuestion).options[k] = (e.target as HTMLInputElement).value)" />
            <button class="btn icon ghost mini" :disabled="(q as ChoiceQuestion).options.length <= 2" :title="tl('删除选项')" @click="removeOption(q as ChoiceQuestion, k)">✕</button>
          </div>
          <div class="row"><button class="btn small ghost" :disabled="(q as ChoiceQuestion).options.length >= 6" @click="(q as ChoiceQuestion).options.push(tl('新选项'))"><Icon name="plus" :size="12" />{{ tl('添加选项') }}</button>
            <span v-if="(q as ChoiceQuestion).answerFrom" class="tiny muted">{{ tl('正确选项由仿真结果决定') }}</span></div>
        </template>
        <div class="row"><label>{{ tl('题目提示') }}</label><input class="field grow" :value="ptext(q.hint, lang)" :placeholder="tl('（可选）')" @change="e => (q.hint = (e.target as HTMLInputElement).value || undefined)" /></div>
        <div class="row"><label>{{ tl('解析') }}</label><input class="field grow" :value="ptext(q.explain, lang)" :placeholder="tl('（可选）')" @change="e => (q.explain = (e.target as HTMLInputElement).value || undefined)" /></div>
        <div class="tiny muted key">{{ tl('当前答案：') }}<b class="mono">{{ q.type === 'numeric' ? fmtQ(keys.get(q.id)?.value ?? null, unitOf(q)) : keys.get(q.id)?.value !== null && keys.get(q.id)?.value !== undefined ? LETTERS[keys.get(q.id)!.value!] : '—' }}</b><span v-if="keys.get(q.id)?.note">{{ ' · ' + keys.get(q.id)!.note }}</span></div>
      </template>
    </article>

    <div v-if="s.editing" class="add-row">
      <button class="btn small" @click="addNumeric"><Icon name="plus" :size="12" />{{ tl('数值题') }}</button>
      <button class="btn small" @click="addChoice"><Icon name="plus" :size="12" />{{ tl('选择题') }}</button>
      <span class="spacer" />
      <button class="btn small primary" :disabled="!s.problem.questions.length" @click="exportProblem"><Icon name="download" :size="13" />{{ tl('导出题目包') }}</button>
    </div>
    <div v-else class="foot">
      <template v-if="!s.revealed">
        <span class="tiny muted">{{ !rec ? (state.computing ? tl('正在计算答案…') : tl('等待仿真结果…')) : tl('数值按当前显示单位填写；相对误差在容差（一般 2%）内判为正确。') }}</span>
        <button class="btn primary" :disabled="!rec" @click="reveal"><Icon name="reveal" :size="14" />{{ tl('揭晓答案') }}</button>
      </template>
      <template v-else>
        <span class="score">{{ tl('答对 {0} / {1}', [score.right, score.total]) }}</span>
        <span class="spacer" />
        <button class="btn small" @click="state.rightTab = 'formula'"><Icon name="book" :size="13" />{{ tl('公式对照') }}</button>
        <button class="btn small" @click="retry"><Icon name="undo" :size="13" />{{ tl('再做一次') }}</button>
        <button v-if="s.problem.builtin" class="btn small primary" @click="anotherSet"><Icon name="sweep" :size="13" />{{ tl('换一组数据') }}</button>
      </template>
    </div>
    <div v-if="!s.editing" class="tiny muted legend">{{ tl('答案由当前场景的仿真得出：修改场景参数后答案随之改变。手算常取 g = 10 m/s²，与题中 g 不同会带来约 2% 的差别。') }}</div>
  </div>
  <div v-else class="empty">{{ tl('没有打开的题目。') }}</div>
</template>

<style scoped>
.problem { padding: 4px 0 14px; display: flex; flex-direction: column; gap: 8px; }
.head { display: flex; align-items: center; gap: 4px; }
.chip { font-size: var(--type-tiny); font-weight: 600; color: var(--accent); background: var(--accent-soft); border-radius: var(--radius-pill); padding: 2px 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; max-width: 46%; }
.title { font-size: 16px; font-weight: 650; margin: 2px 2px 0; }
.stem { margin: 0 2px; line-height: 1.65; font-size: 13.5px; }
.lock { display: flex; gap: 6px; align-items: flex-start; line-height: 1.5; padding: 6px 8px; border-radius: 8px; background: var(--fill); }
.q { background: var(--group); border-radius: var(--radius-group); padding: 9px 10px; border-left: 3px solid transparent; display: flex; flex-direction: column; gap: 6px; transition: border-color 200ms ease; }
.q.ok { border-left-color: var(--success); }
.q.bad { border-left-color: var(--danger); }
.q-head { display: flex; align-items: flex-start; gap: 8px; }
.q-num { flex: 0 0 auto; width: 20px; height: 20px; border-radius: 50%; background: var(--fill); display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: var(--text-2); }
.q-prompt { line-height: 1.55; font-size: 13px; }
.row > label { width: 72px; flex: 0 0 auto; }
.row.top { align-items: flex-start; }
.row.top textarea { height: auto; padding: 6px 8px; resize: vertical; line-height: 1.5; }
.answer { padding-left: 28px; }
.options { display: flex; flex-direction: column; gap: 3px; padding-left: 28px; }
.opt { display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 7px; cursor: pointer; font-size: 13px; transition: background 140ms ease; }
.opt:hover { background: var(--hover); }
.opt.chosen { background: var(--accent-soft); }
.opt.right { box-shadow: inset 0 0 0 1.5px var(--success); }
.hint-line { padding-left: 28px; }
.hint { color: var(--text-2); line-height: 1.5; }
.result { padding-left: 28px; display: flex; flex-direction: column; gap: 3px; line-height: 1.5; animation: rise 260ms ease both; }
.verdict { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.explain { color: var(--text-2); background: var(--fill); border-radius: 7px; padding: 5px 8px; margin-top: 2px; }
.mini { width: 24px; height: 24px; }
.opt-edit { width: auto !important; display: inline-flex; align-items: center; gap: 4px; }
.key { padding-left: 2px; }
.add-row, .foot { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.foot { justify-content: space-between; }
.score { font-weight: 650; }
.legend { line-height: 1.5; margin: 0 2px; }
@keyframes rise { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .result { animation: none; } }
</style>
