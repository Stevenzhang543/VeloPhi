<script setup lang="ts">
/**
 * One model family (26.56, D105): what it assumes and where it holds, its inputs in display units, the conditions
 * in four states, the outputs with their branch (a formula whose condition fails shows its value struck through,
 * never as the answer), the constants used with their set and source, how it is checked (reference kinds and
 * benchmarks), solving for an unknown input, links to templates, labs, problems and activities, and the teacher's
 * parameterized problems. Every number comes from the Rust core (modelEval, modelSolve).
 */
import { computed, reactive, ref, watch } from 'vue'
import { tl, activeLang } from '../../../i18n'
import { ptext } from '../../../teaching/problems'
import { state } from '../../store'
import { fmtK } from '../../settings'
import { modelById, exampleInputs, linksOf } from '../../../content/models'
import type { ModelSpec } from '../../../content/models/types'
import { tryEval, trySolve, exportDocument } from '../../models/run'
import { GEOMETRY_TEXT, LEVEL_TEXT, REFERENCE_TEXT, STAGE_TEXT, STATE_TEXT, STATUS_TEXT, TEACHING_TEXT, T3 } from '../../models/labels'
import { openLab, openTemplate, openTopic, openActivity } from '../../learn/actions'
import { BUILTIN_PROBLEMS } from '../../../teaching/problemBank'
import { openBuiltin } from '../../problemMode'
import { activityById } from '../../../teaching/activities'
import { templateById } from '../../../templates'
import { labInfo } from '../../lab/catalog'
import { saveFile } from '../../../platform/files'
import NumField from '../NumField.vue'
import Tex from '../Tex.vue'
import Icon from '../Icon.vue'
import ParamProblemPanel from './ParamProblemPanel.vue'

const props = defineProps<{ id: string }>()
const model = computed<ModelSpec>(() => modelById(props.id)!)
const inputs = reactive<Record<string, number>>({})
const constantsSet = ref('CODATA2022')
function resetInputs() { for (const k of Object.keys(inputs)) delete inputs[k]; Object.assign(inputs, exampleInputs(model.value)) }
watch(() => props.id, resetInputs, { immediate: true })

const run = computed(() => tryEval(props.id, { ...inputs }, constantsSet.value))
const result = computed(() => (run.value.ok ? run.value.value : null))
const outputs = computed(() => {
  const r = result.value
  if (!r) return []
  return r.outputs.map(o => {
    const spec = model.value.outputs.find(x => x.id === o.id && (!x.when || r.conditions.find(c => c.id === x.when)?.state === 'applicable' || r.conditions.find(c => c.id === x.when)?.state === 'approximate')) ?? model.value.outputs.find(x => x.id === o.id)!
    return { o, spec }
  })
})
const condLabel = (id: string) => T3(model.value.conditions?.find(c => c.id === id)?.label) || id
const inputSpec = (id: string) => model.value.inputs.find(i => i.id === id)
const links = computed(() => linksOf(model.value))

// ---- Solve for an unknown input ----
const solve = reactive({ unknown: '', target: '', value: 0, lo: 0, hi: 1, log: false })
function initSolve() {
  const m = model.value
  solve.unknown = m.inputs[0]?.id ?? ''
  solve.target = m.outputs[0]?.id ?? ''
  const v = result.value?.outputs.find(o => o.id === solve.target)?.value
  solve.value = v ?? 0
  const x = inputs[solve.unknown] ?? 1
  solve.lo = x > 0 ? x / 10 : x - 10
  solve.hi = x > 0 ? x * 10 : x + 10
}
watch(() => props.id, initSolve, { immediate: true })
const solved = ref<ReturnType<typeof trySolve> | null>(null)
function doSolve() { solved.value = trySolve(props.id, { ...inputs }, solve.unknown, solve.target, solve.value, solve.lo, solve.hi, constantsSet.value, solve.log) }
const unknownSpec = computed(() => inputSpec(solve.unknown))
const targetSpec = computed(() => model.value.outputs.find(o => o.id === solve.target))

async function exportRun() {
  if (!result.value) return
  const doc = exportDocument('model-run', { model: props.id, inputs: { ...inputs }, constantsSet: constantsSet.value }, result.value, 'models', constantsSet.value)
  await saveFile(doc, `velophi-${props.id}.json`, [{ name: 'JSON', extensions: ['json'] }])
}
const problemTitle = (id: string) => { const p = BUILTIN_PROBLEMS.find(x => x.id === id); return p ? ptext(p.title, activeLang()) : id }
function openProblem(id: string) { const p = BUILTIN_PROBLEMS.find(x => x.id === id); if (p) { state.showModels = false; void openBuiltin(p) } }
function go(fn: () => unknown) { state.showModels = false; void fn() }
</script>

<template>
  <article class="model" :aria-label="`${model.id} ${T3(model.title)}`">
    <header>
      <div class="idline"><span class="mid">{{ model.id }}</span><h3>{{ T3(model.title) }}</h3></div>
      <div class="chips tiny">
        <span v-for="s in model.stages" :key="s" class="chip">{{ STAGE_TEXT[s] }}</span>
        <span class="chip">{{ model.priority }}</span>
        <span class="chip" :class="`lv${model.level}`">{{ LEVEL_TEXT[model.level] }}</span>
        <span class="chip">{{ STATUS_TEXT[model.status] }}</span>
        <span class="chip">{{ TEACHING_TEXT[model.teaching] }}</span>
        <span class="chip geo">{{ tl('几何：{0}', [GEOMETRY_TEXT[model.geometry]]) }}</span>
      </div>
      <p v-if="model.restricted" class="restricted small" role="note"><Icon name="limit" :size="14" />{{ tl('受限模型：{0}', [T3(model.restricted)]) }}</p>
    </header>

    <section class="block">
      <h4>{{ tl('假设与有效域') }}</h4>
      <ul class="small"><li v-for="(a, i) in model.assumptions" :key="i">{{ T3(a) }}</li></ul>
      <p class="small"><b>{{ tl('有效域：') }}</b>{{ T3(model.validity) }}</p>
      <p class="small muted"><b>{{ tl('要点：') }}</b>{{ T3(model.point) }}</p>
    </section>

    <section class="block">
      <div class="row-head"><h4>{{ tl('输入') }}</h4><span class="spacer" />
        <label class="tiny">{{ tl('常数集') }} <select v-model="constantsSet" :aria-label="tl('常数集')"><option value="CODATA2022">CODATA 2022</option><option value="CODATA2018">CODATA 2018</option></select></label>
        <button class="btn ghost tiny" @click="resetInputs">{{ tl('恢复例题数据') }}</button>
      </div>
      <p class="small muted">{{ tl('例题：{0}', [T3(model.example.text)]) }}</p>
      <div v-if="model.inputs.length" class="inputs">
        <label v-for="i in model.inputs" :key="i.id" class="in">
          <span class="sym"><Tex :tex="i.symbol" /></span>
          <span class="lbl small">{{ T3(i.label) }}</span>
          <NumField v-model="inputs[i.id]" :unit="i.unit" :kind="i.kind" :min="i.min" :max="i.max" width="150px" />
        </label>
      </div>
      <p v-else class="small muted">{{ tl('没有可调输入：结果只取决于所选常数集。') }}</p>
    </section>

    <section class="block" aria-live="polite">
      <div class="row-head"><h4>{{ tl('结果') }}</h4><span class="spacer" /><button class="btn ghost tiny" :disabled="!result" @click="exportRun"><Icon name="download" :size="13" />{{ tl('导出（含运行清单）') }}</button></div>
      <p v-if="!run.ok" class="error small" role="alert">{{ tl('计算失败：{0}', [run.error]) }}</p>
      <template v-else-if="result">
        <p v-if="result.domain.length" class="error small" role="alert">{{ tl('输入超出有效域：{0}', [result.domain.map(d => d.input).join(', ')]) }}</p>
        <div v-if="result.conditions.length" class="conds">
          <span v-for="c in result.conditions" :key="c.id" class="cond tiny" :class="c.state">{{ condLabel(c.id) }} · {{ STATE_TEXT[c.state] }}</span>
        </div>
        <table class="outs">
          <tbody>
            <tr v-for="{ o, spec } in outputs" :key="o.id + (o.branch ?? '')" :class="o.state">
              <td class="sym"><Tex :tex="spec.symbol" /></td>
              <td class="small">{{ T3(spec.label) }}<span v-if="spec.branch" class="tiny muted br">{{ T3(spec.branch) }}</span></td>
              <td class="val mono">
                <template v-if="o.value !== null">{{ fmtK(o.value, o.unit, spec.kind) }}</template>
                <template v-else-if="o.roots && o.roots.length">{{ o.roots.map(r => fmtK(r, o.unit, spec.kind)).join('；') }}</template>
                <s v-else-if="o.raw !== undefined" :title="tl('条件不成立：此值只供对照，不是答案')">{{ fmtK(o.raw, o.unit, spec.kind) }}</s>
                <span v-else>—</span>
              </td>
              <td class="tiny st">{{ STATE_TEXT[o.state] }}<span v-if="o.reason === 'undefined'">{{ tl('（无定义）') }}</span><span v-if="o.solutions">{{ ' · ' + o.solutions }}</span></td>
            </tr>
          </tbody>
        </table>
        <p class="small muted">{{ tl('文档圆整答案（仅供阅读）：{0}', [T3(model.example.answer)]) }}</p>
        <details v-if="result.constants.length" class="small">
          <summary>{{ tl('使用的常数（{0}）', [result.constantsSet]) }}</summary>
          <p class="tiny muted">{{ result.constantsSource }}</p>
          <table class="consts tiny"><tbody><tr v-for="k in result.constants" :key="k.id"><td class="mono">{{ k.id }}</td><td class="mono">{{ k.value.toPrecision(12) }} {{ k.unit }}</td><td>{{ k.exact ? tl('精确') : tl('标准不确定度 {0}', [k.u.toPrecision(2)]) }}</td><td class="muted">{{ k.origin }}</td></tr></tbody></table>
        </details>
      </template>
    </section>

    <section class="block">
      <h4>{{ tl('求未知量') }}</h4>
      <div class="solve small">
        <label>{{ tl('未知输入') }} <select v-model="solve.unknown"><option v-for="i in model.inputs" :key="i.id" :value="i.id">{{ T3(i.label) }}</option></select></label>
        <label>{{ tl('已知输出') }} <select v-model="solve.target"><option v-for="o in model.outputs.filter((x, k, a) => a.findIndex(y => y.id === x.id) === k)" :key="o.id" :value="o.id">{{ T3(o.label) }}</option></select></label>
        <label v-if="targetSpec">{{ tl('取值') }} <NumField v-model="solve.value" :unit="targetSpec.unit" :kind="targetSpec.kind" width="130px" /></label>
        <label v-if="unknownSpec">{{ tl('搜索区间') }} <NumField v-model="solve.lo" :unit="unknownSpec.unit" :kind="unknownSpec.kind" width="110px" /> – <NumField v-model="solve.hi" :unit="unknownSpec.unit" :kind="unknownSpec.kind" width="110px" /></label>
        <label><input v-model="solve.log" type="checkbox" /> {{ tl('对数刻度') }}</label>
        <button class="btn" :disabled="!model.inputs.length" @click="doSolve">{{ tl('求解') }}</button>
      </div>
      <div v-if="solved" class="small" aria-live="polite">
        <p v-if="!solved.ok" class="error" role="alert">{{ solved.error }}</p>
        <template v-else>
          <p>{{ solved.value.solutions === 'none' ? tl('区间内无解。') : solved.value.solutions === 'one' ? tl('唯一解：') : tl('多解（逐个检查条件）：') }}</p>
          <ul><li v-for="(r, k) in solved.value.roots" :key="k" class="mono">{{ fmtK(r.value, unknownSpec?.unit ?? '', unknownSpec?.kind) }} <span class="tiny muted">{{ r.conditions.map(c => `${condLabel(c.id)}: ${STATE_TEXT[c.state]}`).join('；') }}</span></li></ul>
        </template>
      </div>
    </section>

    <section class="block">
      <h4>{{ tl('如何核验') }}</h4>
      <p class="small"><span v-for="r in model.references" :key="r" class="chip tiny">{{ REFERENCE_TEXT[r] }}</span></p>
      <ul class="tiny mono bench"><li v-for="b in model.benchmarks" :key="b">{{ b }}</li></ul>
      <p class="tiny muted">{{ tl('审阅：物理 {0}；语言 {1}', [model.review.physics ?? '—', model.review.language ?? '—']) }}</p>
    </section>

    <section class="block">
      <h4>{{ tl('在哪里练习') }}</h4>
      <div class="links small">
        <button v-for="a in links.activities ?? []" :key="a" class="btn" @click="go(() => openActivity(a))"><Icon name="graduation" :size="13" />{{ T3(activityById(a)?.title) }}</button>
        <button v-for="t in links.templates ?? []" :key="t" class="btn ghost" @click="go(() => openTemplate(t))"><Icon name="template" :size="13" />{{ templateById(t)?.name ?? t }}</button>
        <button v-for="l in links.labs ?? []" :key="l" class="btn ghost" @click="go(() => openLab(l))"><Icon name="flask" :size="13" />{{ labInfo(l)?.title ?? l }}</button>
        <button v-for="p in links.problems ?? []" :key="p" class="btn ghost" @click="openProblem(p)"><Icon name="problem" :size="13" />{{ problemTitle(p) }}</button>
        <button v-for="t in links.topics ?? []" :key="t" class="btn ghost" @click="go(() => openTopic(t))"><Icon name="book" :size="13" />{{ t }}</button>
        <span v-if="!(links.activities?.length || links.templates?.length || links.labs?.length || links.problems?.length || links.topics?.length)" class="muted">{{ tl('暂无关联内容。') }}</span>
      </div>
    </section>

    <ParamProblemPanel v-if="model.inputs.length" :model="model" :constants-set="constantsSet" />
  </article>
</template>

<style scoped>
.model { display: flex; flex-direction: column; gap: 10px; }
.idline { display: flex; align-items: baseline; gap: 10px; }
.idline h3 { margin: 0; }
.mid { font-family: var(--font-mono); color: var(--accent); font-weight: 600; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.chip { border: 1px solid var(--separator); border-radius: 6px; padding: 1px 6px; color: var(--text-2); display: inline-block; margin-right: 4px; }
.chip.lv3 { color: var(--success, #16a34a); border-color: currentColor; }
.chip.lv0 { color: var(--danger, #dc2626); border-color: currentColor; }
.restricted { display: flex; gap: 6px; align-items: flex-start; background: var(--warning-soft, rgba(234, 179, 8, 0.12)); border-radius: 8px; padding: 6px 8px; margin: 8px 0 0; }
.block { border-top: 1px solid var(--separator); padding-top: 8px; }
.block h4 { margin: 0 0 6px; }
.row-head { display: flex; align-items: center; gap: 8px; }
.row-head h4 { margin: 0; }
.spacer { flex: 1; }
.inputs { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 6px 14px; margin-top: 6px; }
.in { display: grid; grid-template-columns: 52px 1fr auto; align-items: center; gap: 6px; }
.sym { color: var(--text); }
.conds { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 8px; }
.cond { border-radius: 6px; padding: 2px 7px; border: 1px solid var(--separator); }
.cond.applicable { color: var(--success, #16a34a); border-color: currentColor; }
.cond.notApplicable { color: var(--text-2); text-decoration: line-through; }
.cond.insufficient { color: var(--warning, #b45309); border-style: dashed; }
.cond.approximate { color: var(--warning, #b45309); border-color: currentColor; }
.outs { border-collapse: collapse; width: 100%; }
.outs td { padding: 3px 6px; border-bottom: 1px solid var(--separator); vertical-align: middle; }
.outs tr.notApplicable td { color: var(--text-2); }
.val { text-align: right; white-space: nowrap; }
.mono { font-family: var(--font-mono); }
.br { margin-left: 6px; }
.st { white-space: nowrap; color: var(--text-2); }
.error { color: var(--danger, #dc2626); }
.consts td { padding: 1px 6px; }
.solve { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; }
.solve label { display: inline-flex; gap: 6px; align-items: center; }
.bench { margin: 4px 0; padding-left: 18px; }
.links { display: flex; flex-wrap: wrap; gap: 6px; }
.links .btn { display: inline-flex; gap: 5px; align-items: center; }
</style>
