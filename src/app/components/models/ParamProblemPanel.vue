<script setup lang="ts">
/**
 * Teacher's parameterized problems for a model (26.56, D102; EDU10, EDU13): choose the inputs to draw (range and
 * step), the outputs to ask and the conditions that must hold; preview several seeds before use. Each draw is
 * evaluated by the Rust model; draws whose conditions fail or whose answers are undefined are rejected and counted
 * by reason. The same seed always gives the same problem. Export as JSON with the run manifest.
 */
import { computed, reactive, ref, watch } from 'vue'
import { tl } from '../../../i18n'
import type { ModelSpec } from '../../../content/models/types'
import { checkSpec, preview } from '../../../teaching/paramProblem'
import type { ParamSpec } from '../../../teaching/paramProblem'
import { fmtK } from '../../settings'
import { exportDocument } from '../../models/run'
import { saveFile } from '../../../platform/files'
import { T3 } from '../../models/labels'
import NumField from '../NumField.vue'

const props = defineProps<{ model: ModelSpec; constantsSet: string }>()

interface Row { on: boolean; lo: number; hi: number; step: number }
const rows = reactive<Record<string, Row>>({})
const ask = reactive<Record<string, boolean>>({})
const need = reactive<Record<string, boolean>>({})
const seed = ref(1)
const count = ref(5)
const open = ref(false)

/** One significant digit (a readable step). */
const sig1 = (x: number) => { if (!(x > 0)) return 1; const e = Math.floor(Math.log10(x)); return Math.round(x / 10 ** e) * 10 ** e }

function reset() {
  const m = props.model
  for (const k of Object.keys(rows)) delete rows[k]
  for (const k of Object.keys(ask)) delete ask[k]
  for (const k of Object.keys(need)) delete need[k]
  m.inputs.forEach((i, n) => {
    const v = i.value
    const step = sig1(Math.abs(v) / 10 || 0.1)
    let lo = v === 0 ? 0 : Math.min(v / 2, v * 2)
    const hi = v === 0 ? 10 * step : Math.max(v / 2, v * 2)
    if (i.min !== undefined && lo <= i.min) lo = i.min + (i.open ? step : 0)
    rows[i.id] = { on: n === 0, lo: Number(lo.toPrecision(6)), hi: Number(hi.toPrecision(6)), step }
  })
  const first = m.outputs[0]?.id
  for (const o of m.outputs) ask[o.id] = o.id === first
  for (const c of m.conditions ?? []) need[c.id] = false
}
watch(() => props.model.id, reset, { immediate: true })

const spec = computed<ParamSpec>(() => ({
  model: props.model.id,
  ask: Object.keys(ask).filter(k => ask[k]),
  vary: Object.fromEntries(Object.entries(rows).filter(([, r]) => r.on).map(([k, r]) => [k, { lo: r.lo, hi: r.hi, step: r.step }])),
  require: Object.keys(need).filter(k => need[k]),
  constantsSet: props.constantsSet
}))
/** checkSpec reports in English (it is a pure module); the panel words the cases a teacher can produce. */
function word(m: string): string {
  const d = /^(\w+): (below|above) the domain \((.*)\)$/.exec(m)
  if (d) return d[2] === 'below' ? tl('{0} 的下限低于有效域（{1}）', [T3(inputSpec(d[1])?.label) || d[1], d[3]]) : tl('{0} 的上限高于有效域（{1}）', [T3(inputSpec(d[1])?.label) || d[1], d[3]])
  const e = /^(\w+): empty range or step$/.exec(m)
  if (e) return tl('{0} 的区间或步长无效', [T3(inputSpec(e[1])?.label) || e[1]])
  return m
}
const issues = computed(() => [...checkSpec(spec.value).map(word), ...(spec.value.ask.length ? [] : [tl('至少选一个所求的量')]), ...(Object.keys(spec.value.vary).length ? [] : [tl('至少抽取一个输入')])])
const result = ref<ReturnType<typeof preview> | null>(null)
function run() { if (!issues.value.length) result.value = preview(spec.value, Array.from({ length: Math.max(1, Math.min(50, count.value)) }, (_, k) => seed.value + k)) }
const inputSpec = (id: string) => props.model.inputs.find(i => i.id === id)!
const outSpec = (id: string) => props.model.outputs.find(o => o.id === id)!
const uniqueOutputs = computed(() => props.model.outputs.filter((o, k, a) => a.findIndex(x => x.id === o.id) === k))
async function exportSet() {
  if (!result.value) return
  const doc = exportDocument('param-problems', { spec: spec.value, seeds: result.value.instances.map(i => i.seed) }, result.value, 'models', props.constantsSet)
  await saveFile(doc, `velophi-${props.model.id}-problems.json`, [{ name: 'JSON', extensions: ['json'] }])
}
</script>

<template>
  <section class="block">
    <button class="head" :aria-expanded="open" @click="open = !open"><h4>{{ tl('教师：参数化出题') }}</h4><span class="tiny muted">{{ tl('按约束抽取参数，答案由核心计算') }}</span></button>
    <div v-if="open" class="body small">
      <table class="vary">
        <thead><tr><th>{{ tl('抽取') }}</th><th>{{ tl('输入') }}</th><th>{{ tl('下限') }}</th><th>{{ tl('上限') }}</th><th>{{ tl('步长') }}</th></tr></thead>
        <tbody>
          <tr v-for="i in model.inputs" :key="i.id">
            <td><input v-model="rows[i.id].on" type="checkbox" :aria-label="tl('抽取 {0}', [T3(i.label)])" /></td>
            <td>{{ T3(i.label) }}</td>
            <td><NumField v-model="rows[i.id].lo" :unit="i.unit" :kind="i.kind" :disabled="!rows[i.id].on" width="136px" /></td>
            <td><NumField v-model="rows[i.id].hi" :unit="i.unit" :kind="i.kind" :disabled="!rows[i.id].on" width="136px" /></td>
            <td><NumField v-model="rows[i.id].step" :unit="i.unit" :kind="i.kind" :disabled="!rows[i.id].on" :min="0" width="130px" /></td>
          </tr>
        </tbody>
      </table>
      <fieldset><legend>{{ tl('所求的量') }}</legend><label v-for="o in uniqueOutputs" :key="o.id"><input v-model="ask[o.id]" type="checkbox" /> {{ T3(o.label) }}</label></fieldset>
      <fieldset v-if="model.conditions?.length"><legend>{{ tl('必须成立的条件') }}</legend><label v-for="c in model.conditions" :key="c.id"><input v-model="need[c.id]" type="checkbox" /> {{ T3(c.label) }}</label></fieldset>
      <div class="actions">
        <label>{{ tl('起始种子') }} <input v-model.number="seed" type="number" min="0" step="1" class="seed" /></label>
        <label>{{ tl('预览份数') }} <input v-model.number="count" type="number" min="1" max="50" step="1" class="seed" /></label>
        <button class="btn" :disabled="issues.length > 0" @click="run">{{ tl('预览') }}</button>
        <button class="btn ghost" :disabled="!result" @click="exportSet">{{ tl('导出题组') }}</button>
      </div>
      <ul v-if="issues.length" class="error" role="alert"><li v-for="(m, k) in issues" :key="k">{{ m }}</li></ul>
      <div v-if="result" aria-live="polite">
        <p>{{ tl('{0} 份可用，{1} 份失败；抽取被拒比例 {2}%。', [result.instances.length, result.failed, (100 * result.rejectionRate).toFixed(0)]) }} <span v-for="(n, k) in result.reasons" :key="k" class="tiny muted">{{ k }}: {{ n }} </span></p>
        <table class="inst">
          <thead><tr><th>{{ tl('种子') }}</th><th>{{ tl('题目数据') }}</th><th>{{ tl('答案（核心计算）') }}</th></tr></thead>
          <tbody>
            <tr v-for="x in result.instances" :key="x.seed">
              <td class="mono">{{ x.seed }}</td>
              <td>{{ Object.keys(spec.vary).map(k => `${T3(inputSpec(k).label)} = ${fmtK(x.inputs[k], inputSpec(k).unit, inputSpec(k).kind)}`).join('；') }}</td>
              <td class="mono">{{ Object.entries(x.answers).map(([k, a]) => `${T3(outSpec(k).label)} = ${fmtK(a.value, a.unit, outSpec(k).kind)}`).join('；') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<style scoped>
.block { border-top: 1px solid var(--separator); padding-top: 8px; }
.head { display: flex; align-items: baseline; gap: 10px; border: 0; background: none; padding: 0; cursor: pointer; color: var(--text); font: inherit; }
.head h4 { margin: 0; }
.body { display: flex; flex-direction: column; gap: 8px; margin-top: 6px; }
.vary, .inst { border-collapse: collapse; }
.vary td, .vary th, .inst td, .inst th { padding: 2px 6px; text-align: left; border-bottom: 1px solid var(--separator); }
fieldset { border: 1px solid var(--separator); border-radius: 8px; display: flex; flex-wrap: wrap; gap: 4px 12px; padding: 4px 8px; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.seed { width: 70px; }
.mono { font-family: var(--font-mono); }
.error { color: var(--danger, #dc2626); margin: 0; }
</style>
