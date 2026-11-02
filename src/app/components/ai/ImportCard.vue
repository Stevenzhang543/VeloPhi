<script setup lang="ts">
/**
 * A problem read with "识别题目" in the Copilot box (26.59 fix, D182; it replaces the import bar above the canvas).
 * While the AI reads: the stages (cancellable). When done (D189): what was built (a template, an own scene, an
 * equation model …), the answers — computed by the app, never by the AI — and the solution path with those answers
 * filled in; an equation model also shows its equations and the solver's verdict. Expand for what the AI understood
 * (AiSummary). On failure: why, the checks that failed, the beginning of the AI's answer, and the next steps.
 */
import { computed, ref } from 'vue'
import { tl } from '../../../i18n'
import { state, showToast } from '../../store'
import { settings } from '../../settings'
import { aiImport, cancelImport, problemOf, STAGE_TEXT, verdictText } from '../../../ai/import/pipeline'
import type { ImportOutcome, ImportSuccess, ImportFailure } from '../../../ai/import/pipeline'
import { answersOf, solutionSteps } from '../../../ai/import/answers'
import { aiLabel } from '../../../ai/client'
import { saveMyProblem } from '../../../teaching/myProblems'
import { readText } from '../../task/taskState'
import { templateById } from '../../../templates'
import AiSummary from './AiSummary.vue'
import Tex from '../Tex.vue'
import Icon from '../Icon.vue'

const props = defineProps<{ outcome: ImportOutcome | null | undefined; source?: { text: string; image?: string } }>()
const emit = defineEmits<{ retry: [hint?: string]; reread: [text: string] }>()
const open = ref(false)
const shown = ref(settings.ai.revealAnswers)

const success = computed(() => (props.outcome?.ok ? (props.outcome as ImportSuccess) : null))
const failure = computed(() => (props.outcome && !props.outcome.ok ? (props.outcome as ImportFailure) : null))

/** What the reading built, in a few words. */
const built = computed(() => {
  const b = success.value?.build
  if (!b) return ''
  if (b.kind === 'template') return `${success.value!.first.route === 'example' ? tl('例题') : tl('仿真模板')} · ${templateById(b.id)?.name ?? b.id}`
  if (b.kind === 'scene') return tl('自建场景（{0} 个物体）', [b.scene.bodies.filter(x => x.kind !== 'static').length])
  if (b.kind === 'equations') return `${tl('自建方程模型')} · ${verdictText(b.result.verdict)}`
  if (b.kind === 'task') return tl('解析求解与核对')
  return tl('解析模型')
})
const eq = computed(() => (success.value?.build.kind === 'equations' ? success.value.build : null))
// Reactive on the run state: the answers of a simulated problem appear when the scene has been computed
const answers = computed(() => { void state.run.tComputed; void state.computing; return success.value ? answersOf(success.value) : null })
const steps = computed(() => (success.value ? solutionSteps(success.value, shown.value ? answers.value : null) : []))
const computing = computed(() => !!success.value && answers.value === null)

function saveToMine() {
  const o = success.value
  if (!o) return
  const p = problemOf(o)
  if (!p) { showToast(tl('只有建立了场景的题目可以保存到题库'), true); return }
  saveMyProblem(p, { types: o.first.category.types, level: o.first.category.level, stage: o.first.category.stage, route: o.first.route })
  showToast(tl('已保存到“我的题目”'))
}
/** Offline fallback: the 26.57 rule reader (six domains). */
function ruleRead() {
  readText(props.source?.text ?? '')
  state.page = 'studio'
  state.rightTab = 'task'
}
async function copyRaw() {
  try { await navigator.clipboard.writeText(failure.value?.raw ?? ''); showToast(tl('已复制')) } catch { /* unavailable */ }
}
</script>

<template>
  <div class="import-card" :class="{ ok: !!success, fail: !!failure }">
    <!-- Progress, announced politely -->
    <div v-if="!outcome" class="status" role="status">
      <span class="dot" aria-hidden="true" />
      <span>{{ tl(STAGE_TEXT[aiImport.stage ?? 'reading']) }}…</span>
      <span class="muted">{{ aiLabel() }}</span>
      <button type="button" class="btn small ghost" @click="cancelImport()">{{ tl('取消') }}</button>
    </div>
    <!-- Built: what, the answers, the solution path -->
    <template v-else-if="success">
      <div class="head">
        <Icon name="check2" :size="14" class="good" />
        <span class="title">{{ success.first.summary || tl('题目') }}</span>
      </div>
      <div class="built" :class="{ warn: eq && eq.result.verdict !== 'solved' }">{{ built }}</div>

      <section v-if="computing || (answers && answers.length)" class="answers" :aria-label="tl('答案')">
        <h4>{{ tl('答案') }}</h4>
        <p v-if="computing" class="muted">{{ tl('引擎计算中…') }}</p>
        <template v-else-if="shown">
          <div v-for="(a, i) in answers!" :key="i" class="ans"><span>({{ i + 1 }}) {{ a.prompt }}</span><b>{{ a.text }}</b></div>
        </template>
        <button v-else type="button" class="btn small" @click="shown = true">{{ tl('显示答案') }}</button>
      </section>
      <p v-if="success.conclusion" class="conclusion">{{ success.conclusion }}</p>

      <section v-if="steps.length" class="steps" :aria-label="tl('解题思路')">
        <h4>{{ tl('解题思路') }}</h4>
        <ol><li v-for="(s, i) in steps" :key="i">{{ s }}</li></ol>
      </section>

      <button type="button" class="more" :aria-expanded="open" @click="open = !open">
        <span>{{ eq ? tl('方程与 AI 的理解') : tl('AI 的理解') }}</span>
        <Icon name="chevron" :size="12" class="chev" :class="{ open }" />
      </button>
      <p v-if="!open && (success.clarifications.length || success.warnings.length)" class="note">{{ tl('有需要确认的地方，展开查看') }}</p>
      <div v-if="open" class="detail">
        <template v-if="eq">
          <div class="eqs">
            <div v-for="(e, i) in eq.equations" :key="i" class="eqrow"><span class="n">{{ i + 1 }}</span><Tex :tex="e.latex" /><span v-if="e.why" class="why">{{ e.why }}</span></div>
          </div>
          <dl class="vars">
            <template v-for="k in eq.knowns" :key="'k' + k.name"><dt>{{ k.name }}</dt><dd>{{ k.value }} {{ k.unit }}<span v-if="k.meaning" class="muted"> · {{ k.meaning }}</span></dd></template>
            <template v-for="u in eq.unknowns" :key="'u' + u.name"><dt>{{ u.name }}</dt><dd><b>{{ u.value === null ? '?' : Number(u.value.toPrecision(6)) }}</b> {{ u.unit }}<span v-if="u.meaning" class="muted"> · {{ u.meaning }}</span></dd></template>
          </dl>
          <p v-if="eq.result.conflicts.length" class="muted">{{ tl('不能同时满足的方程：{0}', [eq.result.conflicts.map(c => c.index + 1).join('、')]) }}</p>
          <p v-if="eq.result.verdict === 'underdetermined'" class="muted">{{ tl('无法确定：{0}', [eq.result.undetermined.join('、')]) }}</p>
          <p class="tiny muted">{{ tl('方程由 AI 根据题目列出，由 App 求解并检查是否矛盾或条件不足。') }}</p>
        </template>
        <AiSummary :outcome="success" hide-outputs @clarify="h => emit('retry', h)" @reread="t => emit('reread', t)" />
        <div class="actions">
          <button v-if="success.build.kind === 'template' || success.build.kind === 'scene'" type="button" class="btn small" @click="saveToMine">{{ tl('保存到我的题目') }}</button>
          <button type="button" class="btn small ghost" @click="emit('retry')">{{ tl('重新识别') }}</button>
        </div>
      </div>
    </template>
    <!-- Not built: why, and what next -->
    <div v-else-if="failure" class="error" role="alert">
      <span>{{ failure.error }}</span>
      <details v-if="failure.errors?.length || failure.raw">
        <summary>{{ tl('详情') }}</summary>
        <ul v-if="failure.errors?.length"><li v-for="(e, i) in failure.errors" :key="i">{{ e }}</li></ul>
        <template v-if="failure.raw">
          <div class="raw-head"><span>{{ tl('AI 的回答（开头）') }}</span><button type="button" class="btn small ghost" @click="copyRaw">{{ tl('复制') }}</button></div>
          <pre class="raw">{{ failure.raw || tl('（空）') }}</pre>
        </template>
      </details>
      <div class="actions">
        <button type="button" class="btn small" @click="emit('retry')">{{ tl('重试') }}</button>
        <button type="button" class="btn small ghost" @click="ruleRead">{{ tl('改用离线规则读题') }}</button>
        <button type="button" class="btn small ghost" @click="state.showTemplates = true">{{ tl('手动选模板') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.import-card { align-self: stretch; border-radius: 14px; padding: 10px 12px; background: var(--pane); border: 1px solid var(--separator); display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; font-size: var(--type-small); }
.import-card.fail { background: var(--danger-soft); border-color: transparent; }
.status { display: flex; align-items: center; gap: 8px; color: var(--text-2); flex-wrap: wrap; }
.status .muted { color: var(--text-3); font-size: var(--type-tiny); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); animation: pulse 1.2s ease-in-out infinite; flex: 0 0 auto; }
@keyframes pulse { 50% { opacity: 0.3; } }
.head { display: flex; align-items: flex-start; gap: 6px; }
.head .title { flex: 1; min-width: 0; color: var(--text); font-weight: 600; line-height: 1.45; }
.good { color: var(--success); flex: 0 0 auto; margin-top: 2px; }
.built { color: var(--accent); font-size: var(--type-tiny); }
.built.warn { color: var(--warning); }
h4 { margin: 0 0 4px; font-size: var(--type-tiny); color: var(--text-3); font-weight: 600; letter-spacing: 0.04em; }
.answers { display: grid; gap: 3px; }
.ans { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
.ans span { color: var(--text-2); min-width: 0; }
.ans b { font-family: var(--font-mono); color: var(--text); white-space: nowrap; }
.conclusion { margin: 0; padding: 6px 8px; border-radius: 8px; background: var(--warning-soft, var(--fill)); color: var(--text); line-height: 1.5; }
.steps ol { margin: 0; padding-left: 20px; display: grid; gap: 3px; color: var(--text); line-height: 1.5; }
.more { display: flex; align-items: center; justify-content: space-between; gap: 6px; width: 100%; border: 0; background: none; color: var(--text-2); font: inherit; text-align: left; padding: 2px; min-height: 26px; cursor: pointer; border-radius: 6px; }
.more:hover { background: var(--hover); }
.chev { transition: transform var(--dur-toggle, 180ms) var(--ease-out); transform: rotate(-90deg); flex: 0 0 auto; }
.chev.open { transform: none; }
.note { margin: 0; color: var(--warning); }
.detail { display: grid; gap: 8px; }
.eqs { display: grid; gap: 4px; overflow-x: auto; }
.eqrow { display: grid; grid-template-columns: auto auto 1fr; gap: 8px; align-items: baseline; }
.eqrow .n { color: var(--text-3); font-size: var(--type-tiny); }
.eqrow .why { color: var(--text-3); font-size: var(--type-tiny); }
.vars { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 0; }
.vars dt { font-family: var(--font-mono); color: var(--text-2); }
.vars dd { margin: 0; }
.vars b { font-family: var(--font-mono); }
.muted { color: var(--text-3); margin: 0; }
.tiny { font-size: var(--type-tiny); }
.actions { display: flex; flex-wrap: wrap; gap: 6px; }
.error { display: grid; gap: 6px; color: var(--danger); }
.error ul { margin: 4px 0 0; padding-left: 18px; color: var(--text-2); }
.raw-head { display: flex; align-items: center; justify-content: space-between; margin-top: 6px; color: var(--text-2); }
.raw { margin: 4px 0 0; max-height: 180px; overflow: auto; white-space: pre-wrap; word-break: break-all; font-family: var(--font-mono); font-size: var(--type-tiny); color: var(--text-2); background: var(--fill); border-radius: 6px; padding: 6px 8px; }
@media (prefers-reduced-motion: reduce) { .dot { animation: none; } .chev { transition: none; } }
</style>
