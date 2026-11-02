<script setup lang="ts">
/**
 * The task panel (26.57, D114; manual §3.2, §3.4, §6.4, VP-06): one stable place for what is studied, what is known
 * (with where each value came from), what is asked (object, frame, evaluation point), the conditions and the
 * questions that change the answer. A problem enters as text (rule-based reading), as one of the six samples, from
 * the current scene (targets are offered, never guessed) or by hand. Solving shows result cards with their checks,
 * the worked steps (model → law → relation → solve → check), the phases, and the way to the demonstration, practice
 * and a transfer question. Values in the stem can be linked to known values by clicking the number and then the
 * row (a typed link: a length cannot become a mass, T18/T19). Undo takes back the last change of the task.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { tl } from '../../../i18n'
import { fmtQ } from '../../settings'
import { showToast, state, seekTime } from '../../store'
import type { Given, TaskDomain, TaskSpec, SolutionStep } from '../../../task/types'
import type { Clarification } from '../../../task/validate'
import { DOMAINS, ASSUMPTIONS, givenSpec, targetSpec } from '../../../task/vocab'
import { entriesOf, specKey } from '../../../task/build'
import { atText } from '../../../task/plan'
import { tokenValue } from '../../../task/parse'
import { unitInfo } from '../../../task/compare'
import { SAMPLE_DOMAINS } from '../../../task/samples'
import { taskUi, readText, newManualTask, openSample, suggestFromCurrentScene, addTarget, changeTask, solveCurrent, cancelSolve, currentResults, taskFile, loadTaskFile, setTask } from '../../task/taskState'
import { openDemo, openPractice, transferTask } from '../../task/demo'
import { docks, resetDocks, undoDock, dock, snapState } from '../../task/dock'
import { openTextFile, saveFile } from '../../../platform/files'
import { aiImport, cancelImport, importProblem, STAGE_TEXT as AI_STAGE } from '../../../ai/import/pipeline'
import { aiReady } from '../../../ai/client'
import NumField from '../NumField.vue'
import StackCards from '../StackCards.vue'
import ResultCard from './ResultCard.vue'
import Tex from '../Tex.vue'
import Icon from '../Icon.vue'

const task = computed(() => taskUi.task)
const domain = computed(() => (task.value ? DOMAINS[task.value.domain] : null))
const STATE_TEXT: Record<string, string> = { draft: '还没有任务', parsed: '已读取', needsInput: '需要补充', ready: '可以求解', solving: '求解中', solved: '已求解', noSolution: '无解', multiSolution: '多个解', failed: '求解失败', stale: '结果过期', outOfScope: '超出范围' }
const SOURCE_TEXT: Record<string, string> = { stem: '题目', image: '图片', scene: '场景', user: '手动', default: '默认', model: '模型', measurement: '测量' }
const STAGE_TEXT: Record<SolutionStep['stage'], string> = { model: '确定模型', law: '选择定律', relation: '建立关系', solve: '求解', check: '检查' }
const DOMAIN_TEXT = (d: TaskDomain) => tl(DOMAINS[d].label)

// ---- history (undo of task changes in this panel) ----
const past: Array<TaskSpec | null> = []
function change(fn: () => void) { past.push(task.value ? JSON.parse(JSON.stringify(task.value)) : null); if (past.length > 60) past.shift(); fn() }
function undo() { if (!past.length) return; setTask(past.pop() ?? null, !!taskUi.outcome) }
function onKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { if (!past.length && !undoDock()) return; e.preventDefault(); e.stopPropagation(); if (past.length) undo() }
  if (e.key === 'Escape' && linking.value) { e.stopPropagation(); linking.value = null }
}

// ---- input ----
const busyRead = ref(false)
async function analyse() {
  if (!taskUi.draft.trim()) return
  busyRead.value = true
  await nextTick()
  change(() => readText(taskUi.draft))
  busyRead.value = false
}
const manualDomain = ref<TaskDomain>('incline')
// 26.59 (D162): AI reading from the task page. A task-type problem becomes a task here; other problems open as a
// problem, template or model like from the import bar. The rule reader stays for offline use.
const aiOk = computed(() => aiReady().ok)
const aiError = ref('')
async function aiRead() {
  if (!taskUi.draft.trim()) return
  aiError.value = ''
  const o = await importProblem(taskUi.draft, {})
  if (!o.ok && o.code !== 'aborted') aiError.value = o.error
}
function setupAi() { state.page = 'settings'; state.settingsSection = 'ai' }

// ---- known values ----
interface Row { ref: string; label: string; unit: string; given?: Given; conflict: boolean; note?: string }
const rows = computed<Row[]>(() => {
  const t = task.value
  if (!t || !domain.value) return []
  return domain.value.givens.filter(g => entriesOf(t, g.ref).length).map(g => {
    const all = entriesOf(t, g.ref)
    const adopted = all.find(x => (x.status ?? 'adopted') === 'adopted')
    return { ref: g.ref, label: tl(g.label), unit: g.unit, given: adopted, conflict: all.some(x => x.status === 'conflict'), note: adopted?.source === 'default' ? tl(g.fallback?.note ?? '') : undefined }
  })
})
const missingRefs = computed(() => (task.value && domain.value ? domain.value.givens.filter(g => !entriesOf(task.value!, g.ref).length) : []))
const addRef = ref('')
function setValue(ref: string, v: number, unit: string) { change(() => changeTask({ set: [{ ref, valueSI: v, unit, source: 'user' }] })) }
function removeValue(ref: string) { change(() => changeTask({ remove: [ref] })) }
function addValue() { const g = addRef.value && givenSpec(task.value!.domain, addRef.value); if (!g) return; change(() => changeTask({ set: [{ ref: g.ref, valueSI: g.fallback?.value ?? 0, unit: g.unit, source: 'user' }] })); addRef.value = '' }

// ---- targets ----
const addKey = ref('')
const addCond = ref<number>(1)
const addT = ref<number>(1)
const addSpec = computed(() => (task.value && addKey.value ? targetSpec(task.value.domain, addKey.value) : undefined))
function addTargetNow() {
  const s = addSpec.value
  if (!s) return
  change(() => addTarget(s.key, s.at === 'condition' ? { conditionValue: addCond.value } : s.at === 'time' ? { tSI: addT.value } : {}))
  addKey.value = ''
}
function removeTarget(id: string) { change(() => changeTask({ removeTargets: [id] })) }
function targetLabel(id: string) { const s = task.value ? targetSpec(task.value.domain, specKey(id)) : undefined; return s ? tl(s.label) : id }
function targetAt(id: string) {
  const t = task.value!
  const tg = t.targets.find(x => x.id === id)!
  if (tg.at?.kind === 'condition') {
    const c = t.conditions.find(x => x.id === (tg.at as { predicateId: string }).predicateId)
    if (c) return tl(c.kind === 'displacementEquals' ? '沿斜面移动 {0} 时（第一次）' : c.kind === 'heightEquals' ? '高出抛出点 {0} 时' : '速度为 {0} 时', [fmtQ(c.valueSI, c.kind === 'velocityEquals' ? 'm/s' : 'm')]) + (tg.answerDomain === 'falling' ? tl('，下降时') : tg.answerDomain === 'all' ? tl('，每一次') : '')
  }
  return tl(atText(tg.at))
}

// ---- conditions and options ----
const smooth = computed(() => !!task.value?.assumptions.some(a => a.id === 'smooth'))
function toggleSmooth() { change(() => changeTask(smooth.value ? { unassume: ['smooth'] } : { assume: [{ id: 'smooth', source: 'user' }] })) }
function setOption(key: string, v: string) { change(() => changeTask({ options: { [key]: v } })) }

// ---- clarifications ----
const blocking = computed(() => (taskUi.check?.clarifications ?? []).filter(c => c.blocking))
const notices = computed(() => (taskUi.check?.clarifications ?? []).filter(c => !c.blocking))
function answer(c: Clarification, i: number) { const p = c.options[i].patch; if (!Object.keys(p).length) return; change(() => changeTask(p)) }
const missingInput = ref<Record<string, number>>({})

// ---- solving ----
const why = computed(() => (!task.value ? tl('先读取或填写一道题') : taskUi.check?.state === 'outOfScope' ? tl('超出一期支持的范围') : blocking.value.length ? tl('还有 {0} 个问题需要回答', [blocking.value.length]) : ''))
/** Solve; the results come into view (the asked target has a stable place, manual §3.3). */
async function solve() {
  if (!(await solveCurrent())) return
  await nextTick()
  pinZone.value?.scrollIntoView({ block: 'start' })
}
const results = computed(() => currentResults())
const pinnedTop = computed(() => results.value.filter(r => docks[r.targetId] === 'top'))
const unpinned = computed(() => results.value.filter(r => docks[r.targetId] !== 'top'))
const stepsByStage = computed(() => {
  const st = taskUi.outcome?.steps ?? []
  return (['model', 'law', 'relation', 'solve', 'check'] as const).map(s => ({ stage: s, steps: st.filter(x => x.stage === s) })).filter(g => g.steps.length)
})
function locate(t: number) {
  if (!task.value) return
  if (['incline', 'projectile', 'collision'].includes(task.value.domain) && taskUi.boundScene) { state.page = 'studio'; seekTime(t); return }
  openDemo(task.value, t)
}
function transfer() {
  if (!task.value) return
  const { task: next, change: why2 } = transferTask(task.value)
  change(() => setTask(next))
  showToast(tl(why2))
}

// ---- files ----
async function exportTask() {
  if (!task.value) return
  await saveFile(taskFile(), `${(task.value.title || task.value.domain).replace(/[\\/:*?"<>|]/g, '_')}.velophi-task.json`, [{ name: tl('VeloPhi 任务'), extensions: ['json'] }])
}
async function importTask() {
  const f = await openTextFile([{ name: tl('VeloPhi 任务'), extensions: ['json'] }])
  if (!f) return
  const err = loadTaskFile(f.text)
  if (err) showToast(tl(err), true)
}

// ---- stem with its numbers (semantic links, click-click) ----
interface Chip { start: number; end: number; raw: string; bound: string | null }
const stemParts = computed(() => {
  const t = task.value
  const text = t?.stem?.text ?? ''
  if (!text) return []
  const chips: Chip[] = []
  for (const e of t!.evidence ?? []) if (e.span && e.status !== 'overridden') chips.push({ start: e.span[0], end: e.span[1], raw: text.slice(e.span[0], e.span[1]), bound: e.boundTo })
  for (const g of [...t!.givens, ...t!.initialConditions]) if (g.span && !chips.some(c => c.start === g.span![0])) chips.push({ start: g.span[0], end: g.span[1], raw: text.slice(g.span[0], g.span[1]), bound: g.ref })
  for (const u of taskUi.parse?.unused ?? []) if (!chips.some(c => c.start === u.span[0])) chips.push({ start: u.span[0], end: u.span[1], raw: u.raw, bound: null })
  chips.sort((a, b) => a.start - b.start)
  const out: Array<{ text: string; chip?: Chip }> = []
  let at = 0
  for (const c of chips) { if (c.start < at) continue; if (c.start > at) out.push({ text: text.slice(at, c.start) }); out.push({ text: text.slice(c.start, c.end), chip: c }); at = c.end }
  if (at < text.length) out.push({ text: text.slice(at) })
  return out
})
const linking = ref<Chip | null>(null)
const hoverRef = ref<string | null>(null)
const panel = ref<HTMLElement | null>(null)
const pointer = ref<{ x: number; y: number } | null>(null)
const chipEl = ref<HTMLElement | null>(null)
function startLink(c: Chip, e: Event) { linking.value = c; chipEl.value = e.currentTarget as HTMLElement }
function onMove(e: PointerEvent) { if (!linking.value || !panel.value) return; const r = panel.value.getBoundingClientRect(); pointer.value = { x: e.clientX - r.left + panel.value.scrollLeft, y: e.clientY - r.top + panel.value.scrollTop } }
const line = computed(() => {
  if (!linking.value || !chipEl.value || !panel.value || !pointer.value) return null
  const r = panel.value.getBoundingClientRect(), c = chipEl.value.getBoundingClientRect()
  return { x1: c.left + c.width / 2 - r.left + panel.value.scrollLeft, y1: c.bottom - r.top + panel.value.scrollTop, x2: pointer.value.x, y2: pointer.value.y }
})
/** Finish a link on a row: the units must measure the same kind of quantity (T18). */
function linkTo(row: Row) {
  const c = linking.value
  if (!c || !task.value) return
  linking.value = null
  const v = tokenValue(c.raw)
  if (!v) { showToast(tl('“{0}”不是一个带单位的数值', [c.raw]), true); return }
  const want = row.unit === '1' ? '1' : row.unit
  const got = v.siUnit === '1' ? '1' : (unitInfo(v.unit)?.si ?? v.siUnit)
  if (want !== got) { showToast(tl('不能连接：“{0}”的单位是 {1}，“{2}”需要 {3}', [c.raw, got === '1' ? tl('无单位') : got, row.label, want === '1' ? tl('无单位') : want]), true); return }
  const neg = row.ref === 'blockA.v0' && /向上|上滑|冲上/.test(task.value.stem?.text.slice(c.start, c.end + 16) ?? '')
  change(() => changeTask({ set: [{ ref: row.ref, valueSI: neg ? -Math.abs(v.si) : v.si, unit: row.unit, source: 'stem', raw: c.raw, span: [c.start, c.end] }] }))
}
const linkedRef = (c: Chip) => c.bound

// ---- dragging a result onto the pin area (snap with hysteresis) ----
const pinZone = ref<HTMLElement | null>(null)
const drag = ref<{ id: string; x: number; y: number; captured: boolean } | null>(null)
function dragStart(id: string, e: PointerEvent) { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.value = { id, x: e.clientX, y: e.clientY, captured: false } }
function dragMove(e: PointerEvent) {
  const d = drag.value
  if (!d || !pinZone.value) return
  const r = pinZone.value.getBoundingClientRect()
  const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right), dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom)
  d.captured = snapState(Math.hypot(dx, dy), d.captured)
  d.x = e.clientX; d.y = e.clientY
}
function dragEnd() { const d = drag.value; drag.value = null; if (d?.captured) dock(d.id, 'top') }

onMounted(() => window.addEventListener('pointermove', onMove))
onBeforeUnmount(() => window.removeEventListener('pointermove', onMove))
</script>

<template>
  <div ref="panel" class="task-panel" @keydown="onKey">
    <!-- status line: always the same place (manual §3.4) -->
    <div class="tstatus" role="status">
      <span class="badge" :class="taskUi.state === 'solved' ? 'ok' : taskUi.state === 'stale' || taskUi.state === 'needsInput' ? 'warn' : taskUi.state === 'failed' || taskUi.state === 'noSolution' || taskUi.state === 'outOfScope' ? 'bad' : 'info'">{{ tl(STATE_TEXT[taskUi.state]) }}</span>
      <span class="ttitle small">{{ task ? (task.title || DOMAIN_TEXT(task.domain)) : tl('任务') }}</span>
      <span class="spacer" />
      <button class="btn icon ghost small" :disabled="!past.length" :title="tl('撤销对任务的修改（Ctrl+Z）')" :aria-label="tl('撤销')" @click="undo"><Icon name="undo" :size="14" /></button>
      <button class="btn icon ghost small" :title="tl('导入任务文件')" :aria-label="tl('导入任务')" @click="importTask"><Icon name="open" :size="14" /></button>
      <button class="btn icon ghost small" :disabled="!task" :title="tl('导出任务文件（含目标、条件、来源与版本）')" :aria-label="tl('导出任务')" @click="exportTask"><Icon name="save" :size="14" /></button>
    </div>

    <StackCards :title="tl('题目')" :open="!task" :summary="task?.stem?.text ? tl('已读取') : ''">
      <textarea v-model="taskUi.draft" class="field stem-input" rows="4" :aria-label="tl('粘贴或输入题目')" :placeholder="tl('粘贴一道题：例如“2 kg 的物块在固定 30° 斜面上从静止释放，μs = 0.25，μk = 0.2，求沿斜面移动 2 m 时的速率。”')" />
      <div class="row-btns">
        <template v-if="aiOk">
          <button class="btn primary small" :aria-busy="aiImport.busy" :disabled="!taskUi.draft.trim() || aiImport.busy" data-ui="task-ai-read" @click="aiRead">{{ aiImport.busy ? tl(AI_STAGE[aiImport.stage ?? 'reading']) + '…' : tl('AI 读题') }}</button>
          <button v-if="aiImport.busy" class="btn small" @click="cancelImport()">{{ tl('取消') }}</button>
          <button class="btn small" :aria-busy="busyRead" :disabled="!taskUi.draft.trim() || busyRead" :title="tl('不联网：规则读题，只支持六类题型')" @click="analyse">{{ tl('离线规则读题') }}</button>
        </template>
        <template v-else>
          <button class="btn primary small" :aria-busy="busyRead" :disabled="!taskUi.draft.trim() || busyRead" @click="analyse">{{ busyRead ? tl('正在读取…') : tl('分析题目') }}</button>
          <button class="btn small ghost" :title="tl('登录或填写 API key 后，AI 可以读任意说法的题目')" @click="setupAi">{{ tl('启用 AI 读题') }}</button>
        </template>
        <button class="btn small" :title="tl('只识别场景里的情形，并列出可求的量；不会替你决定求什么')" @click="change(suggestFromCurrentScene)">{{ tl('从当前场景') }}</button>
        <select class="field small" :aria-label="tl('示例题')" value="" @change="e => { const d = (e.target as HTMLSelectElement).value as TaskDomain; if (d) change(() => openSample(d)); (e.target as HTMLSelectElement).value = '' }">
          <option value="">{{ tl('示例题…') }}</option>
          <option v-for="d in SAMPLE_DOMAINS" :key="d" :value="d">{{ DOMAIN_TEXT(d) }}</option>
        </select>
      </div>
      <div class="row-btns">
        <span class="tiny muted">{{ tl('手动填写：') }}</span>
        <select v-model="manualDomain" class="field small" :aria-label="tl('题型')"><option v-for="d in SAMPLE_DOMAINS" :key="d" :value="d">{{ DOMAIN_TEXT(d) }}</option></select>
        <button class="btn small" @click="change(() => newManualTask(manualDomain))">{{ tl('新建') }}</button>
      </div>
      <p v-if="aiError" class="small warn-text" role="alert">{{ aiError }}</p>
      <p v-if="taskUi.parse?.scope === 'out'" class="small warn-text">{{ tl(taskUi.parse.reason ?? '', (taskUi.parse.reasonParams ?? []).map(x => tl(x))) }}。{{ tl('可以改用“手动填写”。') }}</p>
      <p v-if="taskUi.parse?.candidates && taskUi.parse.candidates.length > 1" class="tiny muted">{{ tl('题型也可能是：{0}', [taskUi.parse.candidates.slice(1).map(DOMAIN_TEXT).join('、')]) }}</p>
    </StackCards>

    <p v-if="taskUi.suggestion" class="small suggestion">{{ tl(taskUi.suggestion.message, taskUi.suggestion.params?.map(p => tl(String(p)))) }}</p>

    <template v-if="task && domain">
      <!-- the stem with its numbers: click a number, then a known value, to link them -->
      <div v-if="stemParts.length" class="stem" :class="{ linking: !!linking }">
        <template v-for="(p, i) in stemParts" :key="i">
          <button v-if="p.chip" type="button" class="num-chip" :class="{ bound: !!p.chip.bound, lit: hoverRef && p.chip.bound === hoverRef, active: linking === p.chip }" :title="p.chip.bound ? tl('已连接到“{0}”；点击后再点一行可改连', [givenSpec(task.domain, linkedRef(p.chip)!)?.label ? tl(givenSpec(task.domain, linkedRef(p.chip)!)!.label) : linkedRef(p.chip)]) : tl('没有用到的数值：点击后再点一行已知量进行连接')" @click="startLink(p.chip, $event)">{{ p.text }}</button>
          <span v-else>{{ p.text }}</span>
        </template>
        <p v-if="linking" class="tiny link-hint" role="status">{{ tl('现在点击下方一行已知量完成连接（Esc 取消）') }}</p>
      </div>
      <svg v-if="line" class="link-layer" aria-hidden="true"><line :x1="line.x1" :y1="line.y1" :x2="line.x2" :y2="line.y2" /></svg>

      <section class="summary" :aria-label="tl('理解摘要')">
        <div class="srow"><span class="sk">{{ tl('研究对象') }}</span><span class="sv">{{ Object.values(domain.entities).map(e => tl(e)).join('、') }}<span class="tiny muted"> · {{ DOMAIN_TEXT(task.domain) }}</span></span></div>
        <div class="srow"><span class="sk">{{ tl('坐标') }}</span><span class="sv small">{{ task.domain === 'incline' ? tl('沿斜面向下为正，原点在物块的初位置；读数在地面参考系') : task.domain === 'projectile' ? tl('x 水平向右、y 竖直向上，原点在抛出点') : task.domain === 'collision' ? tl('向右为正（一维）') : task.domain === 'field' ? tl('平面直角坐标，单位 m；方向角从 +x 轴量起') : tl('与时间无关的稳态') }}</span></div>

        <div class="shead">{{ tl('已知') }}</div>
        <div v-for="r in rows" :key="r.ref" class="grow-row" :class="{ conflict: r.conflict, target: !!linking }" @mouseenter="hoverRef = r.ref" @mouseleave="hoverRef = null" @click="linking && linkTo(r)">
          <span class="gl small">{{ r.label }}</span>
          <NumField v-if="r.given" :model-value="r.given.valueSI" :unit="r.unit === '1' ? '' : r.unit" width="120px" @update:model-value="v => setValue(r.ref, v, r.unit)" />
          <span class="src tiny" :class="r.given?.source" :title="r.note || (r.given?.raw ? tl('原文：{0}', [r.given.raw]) : '')">{{ r.conflict ? tl('冲突') : tl(SOURCE_TEXT[r.given?.source ?? 'user']) }}</span>
          <button class="btn icon ghost small" :aria-label="tl('删除这个已知量')" :title="tl('删除')" @click.stop="removeValue(r.ref)">✕</button>
        </div>
        <div class="row-btns">
          <select v-model="addRef" class="field small" :aria-label="tl('添加已知量')"><option value="">{{ tl('添加已知量…') }}</option><option v-for="g in missingRefs" :key="g.ref" :value="g.ref">{{ tl(g.label) }}</option></select>
          <button class="btn small" :disabled="!addRef" @click="addValue">{{ tl('添加') }}</button>
        </div>

        <div class="shead">{{ tl('所求') }}</div>
        <div v-for="t in task.targets" :key="t.id" class="grow-row">
          <span class="gl small"><b>{{ targetLabel(t.id) }}</b><span class="tiny muted"> · {{ targetAt(t.id) }}</span></span>
          <button class="btn icon ghost small" :aria-label="tl('删除这个所求')" :title="tl('删除')" @click="removeTarget(t.id)">✕</button>
        </div>
        <p v-if="!task.targets.length" class="tiny muted">{{ tl('还没有所求：从下面选择（不会替你猜题意）。') }}</p>
        <div class="row-btns">
          <select v-model="addKey" class="field small" :aria-label="tl('添加所求')"><option value="">{{ tl('添加所求…') }}</option><option v-for="s in domain.targets" :key="s.key" :value="s.key">{{ tl(s.label) }}</option></select>
          <template v-if="addSpec?.at === 'condition'"><span class="tiny">{{ tl(addSpec.condition?.label ?? '') }}</span><NumField v-model="addCond" unit="m" width="96px" /></template>
          <template v-if="addSpec?.at === 'time'"><span class="tiny">t</span><NumField v-model="addT" unit="s" width="96px" /></template>
          <button class="btn small" :disabled="!addKey" @click="addTargetNow">{{ tl('添加') }}</button>
        </div>

        <div class="shead">{{ tl('条件与假设') }}</div>
        <div class="assume">
          <span v-for="a in task.assumptions" :key="a.id" class="chip" :title="tl('来源：{0}', [tl(SOURCE_TEXT[a.source])])">{{ tl(ASSUMPTIONS[a.id] ?? (a.id === 'smooth' ? '接触面光滑（不计摩擦）' : a.id)) }}</span>
        </div>
        <label v-if="task.domain === 'incline'" class="check small model-cond">
          <input type="checkbox" :checked="smooth" @change="toggleSmooth" />{{ tl('光滑（不计摩擦）') }}
          <span v-if="smooth" class="tiny warn-text">{{ tl('摩擦因数保留但不参与计算；已有结果需要重新求解') }}</span>
        </label>
        <div v-for="(o, key) in domain.options ?? {}" :key="key" class="grow-row">
          <span class="gl small">{{ tl(o.label) }}</span>
          <select class="field small" :value="task.options?.[key] ?? ''" @change="setOption(String(key), ($event.target as HTMLSelectElement).value)"><option value="" disabled>{{ tl('请选择') }}</option><option v-for="(lbl, id) in o.choices" :key="id" :value="id">{{ tl(lbl) }}</option></select>
        </div>
      </section>

      <section v-if="blocking.length || notices.length" class="clarify" :aria-label="tl('需要确认')">
        <div class="shead">{{ tl('需要确认') }}</div>
        <div v-for="c in [...blocking, ...notices]" :key="c.id" class="cl" :class="{ soft: !c.blocking }">
          <p class="small">{{ tl(c.message, c.params?.map(p => (typeof p === 'string' ? tl(p) : p))) }}</p>
          <div class="row-btns">
            <button v-for="(o, i) in c.options" :key="o.id" class="btn small" :disabled="!Object.keys(o.patch).length" @click="answer(c, i)">{{ tl(o.label) }}</button>
            <template v-if="c.kind === 'missingGiven' && c.ref && givenSpec(task.domain, c.ref)">
              <NumField :model-value="missingInput[c.ref] ?? 0" :unit="givenSpec(task.domain, c.ref)!.unit === '1' ? '' : givenSpec(task.domain, c.ref)!.unit" width="120px" @update:model-value="v => (missingInput[c.ref!] = v)" />
              <button class="btn small" @click="setValue(c.ref!, missingInput[c.ref!] ?? 0, givenSpec(task.domain, c.ref!)!.unit)">{{ tl('填入') }}</button>
            </template>
          </div>
        </div>
      </section>

      <div class="solve-row">
        <button v-if="!taskUi.busy" class="btn primary" :disabled="!!why" :title="why || tl('由计算核心求解，并用另一种方法核对')" @click="solve">{{ taskUi.state === 'stale' ? tl('重新求解') : tl('求解') }}</button>
        <button v-else class="btn primary" aria-busy="true" @click="cancelSolve">{{ tl('求解中… 取消') }}</button>
        <span v-if="why" class="tiny muted">{{ why }}</span>
        <!-- 26.59 (UX5): the demo right next to the results, no scrolling to "接下来" -->
        <button v-if="taskUi.outcome && !taskUi.busy" class="btn small" data-ui="task-demo" @click="openDemo(task)">{{ tl('看演示') }}</button>
      </div>

      <!-- pinned results: drop a card here (or use its ⋯ menu) -->
      <div ref="pinZone" class="pin-zone" :class="{ hot: drag?.captured, empty: !pinnedTop.length }">
        <div class="tiny muted pin-title">{{ pinnedTop.length ? tl('固定的结果') : tl('拖动结果卡片左侧的 ⠿ 到这里可固定（或用卡片的 ⋯ 菜单）') }}<button v-if="Object.keys(docks).length" class="btn ghost small" @click="resetDocks">{{ tl('恢复默认') }}</button></div>
        <ResultCard v-for="r in pinnedTop" :key="`p${r.targetId}`" :result="r" :task="task" compact @locate="locate" />
      </div>

      <div v-if="unpinned.length" class="shead">{{ tl('结果') }}</div>
      <div v-for="r in unpinned" :key="r.targetId" class="rwrap">
        <span class="grip" role="button" tabindex="-1" :title="tl('拖到“固定的结果”')" @pointerdown="dragStart(r.targetId, $event)" @pointermove="dragMove" @pointerup="dragEnd" @pointercancel="drag = null">⠿</span>
        <ResultCard :result="r" :task="task" @locate="locate" />
      </div>
      <p v-for="(n, i) in taskUi.outcome?.notes ?? []" :key="`n${i}`" class="tiny warn-text">{{ tl(n) }}</p>

      <StackCards v-if="taskUi.previous" :title="tl('旧结果（条件已改变，仅供比较）')" :count="taskUi.previous.results.length" tone="warn" summary="">
        <ResultCard v-for="r in taskUi.previous.results" :key="`o${r.targetId}`" :result="r" :task="task" old compact />
      </StackCards>

      <template v-if="taskUi.outcome">
        <StackCards v-if="taskUi.outcome.phases.length > 1" :title="tl('运动阶段')" :count="taskUi.outcome.phases.length" :summary="tl(taskUi.outcome.phases[0].label)">
          <ol class="phases small"><li v-for="p in taskUi.outcome.phases" :key="p.id"><b>{{ tl(p.label) }}</b> <span class="mono muted">{{ fmtQ(p.t0, 's') }} – {{ p.t1 === null ? '…' : fmtQ(p.t1, 's') }}</span></li></ol>
        </StackCards>
        <StackCards v-for="g in stepsByStage" :key="g.stage" :title="tl(STAGE_TEXT[g.stage])" :count="g.steps.length" :summary="tl(g.steps[0].text, g.steps[0].params?.map(p => (typeof p === 'string' ? tl(p) : p))).slice(0, 40)">
          <div v-for="s in g.steps" :key="s.id" class="step">
            <p class="small">{{ tl(s.text, s.params?.map(p => (typeof p === 'string' ? tl(p) : p))) }}<span v-if="s.model" class="tiny muted"> · {{ s.model }}</span></p>
            <Tex v-if="s.tex" :tex="s.tex" display />
          </div>
        </StackCards>
        <section class="learn">
          <div class="shead">{{ tl('接下来') }}</div>
          <div class="row-btns">
            <button class="btn small" @click="openDemo(task)">{{ tl('看演示') }}</button>
            <button class="btn small" @click="openPractice(task.domain)">{{ tl('做练习') }}</button>
            <button class="btn small" @click="transfer">{{ tl('迁移题（只改一个条件）') }}</button>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>

<style scoped>
.task-panel { position: relative; display: flex; flex-direction: column; gap: 8px; padding-bottom: 16px; }
.tstatus { position: sticky; top: -4px; z-index: 3; display: flex; align-items: center; gap: 6px; padding: 6px 0; background: var(--pane); }
/* 26.59 (UX4): anything scrolled into view (focus, find, a click from Copilot) stops below the sticky status row */
:deep(input), :deep(textarea), :deep(select), :deep(button) { scroll-margin-top: 56px; }
.ttitle { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stem-input { width: 100%; min-height: 72px; }
.row-btns { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 6px; }
.stem { background: var(--group); border-radius: var(--radius-group); padding: 8px 10px; line-height: 1.75; font-size: var(--type-body); }
.num-chip { border: 1px dashed var(--text-3); background: transparent; border-radius: 6px; padding: 0 4px; cursor: pointer; font: inherit; color: inherit; }
.num-chip.bound { border: 1px solid var(--accent); background: var(--accent-soft); }
.num-chip.lit, .num-chip.active { background: var(--accent); color: var(--on-accent); }
.link-hint { margin: 4px 0 0; color: var(--accent); }
.link-layer { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; z-index: 5; }
.link-layer line { stroke: var(--accent); stroke-width: 2; stroke-dasharray: 5 3; }
.summary, .clarify, .learn { display: flex; flex-direction: column; gap: 4px; }
.srow { display: flex; gap: 8px; align-items: baseline; }
.sk { flex: 0 0 auto; width: calc(64px * var(--zoom)); color: var(--text-3); font-size: var(--type-small); }
.sv { flex: 1; min-width: 0; }
.shead { font-size: var(--type-small); color: var(--text-3); font-weight: 600; margin-top: 8px; }
.grow-row { display: flex; align-items: center; gap: 6px; min-height: calc(32px * var(--zoom)); border-radius: 6px; }
.grow-row.conflict { background: var(--danger-soft); }
.grow-row.target { outline: 1px dashed var(--accent); cursor: pointer; }
.gl { flex: 1; min-width: 0; }
.src { border-radius: 999px; padding: 0 7px; background: var(--fill); color: var(--text-2); white-space: nowrap; }
.src.default { background: var(--warning-soft); color: var(--warning); }
.src.stem { background: var(--accent-soft); color: var(--accent); }
.assume { display: flex; flex-wrap: wrap; gap: 4px; }
.chip { font-size: var(--type-tiny); border-radius: 999px; padding: 1px 8px; background: var(--fill); color: var(--text-2); }
.model-cond { flex-wrap: wrap; }
.cl { border-left: 3px solid var(--warning); padding: 4px 8px; background: var(--warning-soft); border-radius: 6px; }
.cl.soft { border-left-color: var(--text-3); background: var(--group); }
.cl p { margin: 0; }
.warn-text { color: var(--warning); }
.suggestion { background: var(--accent-soft); border-radius: 8px; padding: 6px 10px; margin: 0; }
.solve-row { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
.pin-zone { border-radius: var(--radius-group); padding: 4px 6px; transition: background var(--dur-2) ease, outline-color var(--dur-2) ease; outline: 1px dashed transparent; }
.pin-zone.empty { min-height: 24px; outline-color: var(--separator); }
.pin-zone.hot { background: var(--accent-soft); outline-color: var(--accent); }
.pin-title { display: flex; align-items: center; gap: 6px; }
.rwrap { display: flex; gap: 2px; align-items: flex-start; }
.rwrap > :last-child { flex: 1; min-width: 0; }
.grip { cursor: grab; color: var(--text-3); padding: 10px 2px; touch-action: none; user-select: none; }
.phases { margin: 0; padding-left: 18px; }
.step p { margin: 4px 0; }
</style>
