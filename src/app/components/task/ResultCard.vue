<script setup lang="ts">
/**
 * One result of a task (26.57, D114; manual §4.4): the quantity, its object, frame and evaluation point, the value
 * with its unit, the state of the computation and of the physical conditions (in words, not only colour), and where
 * the value comes from. Opened, it lists the conditions, the independent checks with their differences and budgets,
 * and every root with the rule that chose one. Old results (the task changed since) are shown greyed and labelled.
 * The card can be pinned to the top of the task panel or to the canvas (manual §7.4 basic layer), by menu.
 */
import { computed, ref } from 'vue'
import { tl } from '../../../i18n'
import { fmtQ } from '../../settings'
import type { ResultEnvelope, TaskSpec } from '../../../task/types'
import { specKey } from '../../../task/build'
import { atText } from '../../../task/plan'
import { targetSpec, DOMAINS, QUANTITIES } from '../../../task/vocab'
import { dock, docked, undock } from '../../task/dock'
import StackCards from '../StackCards.vue'

const props = withDefaults(defineProps<{ result: ResultEnvelope; task: TaskSpec; old?: boolean; compact?: boolean }>(), { old: false, compact: false })
const emit = defineEmits<{ (e: 'locate', t: number): void }>()

const spec = computed(() => targetSpec(props.task.domain, specKey(props.result.targetId)))
const label = computed(() => (spec.value ? tl(spec.value.label) : props.result.targetId))
const entity = computed(() => (spec.value?.entity ?? []).map(e => tl(DOMAINS[props.task.domain].entities[e] ?? e)).join(' + '))
const frame = computed(() => {
  const f = spec.value?.frame
  if (f === 'incline-ground') return tl('地面参考系 · 沿斜面向下为正')
  if (f === 'ground') return tl('地面参考系')
  return ''
})
const at = computed(() => {
  const r = props.result
  if (r.at?.kind === 'condition') {
    const c = props.task.conditions.find(x => x.id === (r.at as { predicateId: string }).predicateId)
    if (c) return tl(c.kind === 'displacementEquals' ? '沿斜面移动 {0} 时（第一次）' : c.kind === 'heightEquals' ? '高出抛出点 {0} 时' : '速度为 {0} 时', [fmtQ(c.valueSI, c.kind === 'velocityEquals' ? 'm/s' : 'm')])
  }
  return tl(atText(r.at))
})
const STATE_TEXT: Record<string, string> = { solved: '已求解', stale: '结果过期', failed: '计算失败', noSolution: '无解', multiSolution: '多个解', pending: '求解中' }
const APP_TEXT: Record<string, string> = { applicable: '条件成立', approximate: '近似成立', inapplicable: '条件不成立', insufficient: '信息不足' }
const PROV_TEXT: Record<string, string> = { analytic: '解析', simulation: '仿真', measurement: '测量', conservation: '守恒检查', sameSource: '同源一致', otherAlgorithm: '另一算法' }
const tone = computed(() => (props.old ? '' : props.result.computation === 'solved' ? (props.result.checks.some(c => c.pass === false) ? 'warn' : 'ok') : props.result.computation === 'noSolution' ? 'warn' : 'bad'))
const valueText = computed(() => {
  const v = props.result.value
  if (!v) return '—'
  if (v.text) return v.text.split('、').map(x => tl(x)).join(tl('、'))
  if (v.scalarSI === undefined) return '—'
  if (v.unit === 'rad') return `${fmtQ(v.scalarSI, 'rad')}`
  return fmtQ(v.scalarSI, v.unit === '1' ? '' : v.unit)
})
const passed = computed(() => props.result.checks.filter(c => c.pass === true).length)
const failed = computed(() => props.result.checks.filter(c => c.pass === false).length)
const models = computed(() => Object.keys(props.result.modelVersions).join(' · '))
const where = computed(() => docked(props.result.targetId))
const menu = ref(false)
const qName = computed(() => (spec.value ? tl(QUANTITIES[spec.value.quantity]?.label ?? '') : ''))
</script>

<template>
  <article class="rcard" :class="[{ old }, tone ? `t-${tone}` : '']" :aria-label="label">
    <header class="rhead">
      <div class="rtitle">
        <b>{{ label }}</b>
        <span class="tiny muted">{{ entity }}<template v-if="frame"> · {{ frame }}</template> · {{ at }}</span>
      </div>
      <span class="badge" :class="tone === 'ok' ? 'ok' : tone === 'warn' ? 'warn' : tone === 'bad' ? 'bad' : ''">{{ old ? tl('旧结果') : tl(STATE_TEXT[result.computation] ?? result.computation) }}</span>
      <div class="menu-anchor">
        <button class="btn icon ghost small" :aria-expanded="menu" :aria-label="tl('结果卡片的操作')" :title="tl('固定、定位')" @click="menu = !menu">⋯</button>
        <div v-if="menu" class="menu right" role="menu" @click="menu = false">
          <div class="menu-title">{{ tl('固定到…') }}</div>
          <button role="menuitem" :disabled="where === 'top'" @click="dock(result.targetId, 'top')">{{ tl('任务面板顶部') }}</button>
          <button role="menuitem" :disabled="where === 'canvas'" @click="dock(result.targetId, 'canvas')">{{ tl('画面右上角') }}</button>
          <button role="menuitem" :disabled="!where" @click="undock(result.targetId)">{{ tl('取消固定') }}</button>
          <template v-if="result.atTimeSI !== undefined && !old">
            <div class="sep" />
            <button role="menuitem" @click="emit('locate', result.atTimeSI)">{{ tl('在画面中定位这一时刻') }}</button>
          </template>
        </div>
      </div>
    </header>
    <div class="rvalue">
      <span class="num mono">{{ valueText }}</span>
      <span v-if="qName" class="tiny muted">{{ qName }}</span>
    </div>
    <p v-if="result.reason" class="rreason small">{{ tl(result.reason) }}</p>
    <div v-if="!compact" class="rmeta tiny">
      <span class="chip" :class="result.applicability">{{ tl(APP_TEXT[result.applicability]) }}</span>
      <span class="chip">{{ tl('来源：{0}', [tl(PROV_TEXT[result.provenance.kind])]) }}<template v-if="models">（{{ models }}）</template></span>
      <span v-if="result.checks.length" class="chip" :class="failed ? 'bad' : 'ok'">{{ tl('独立核对 {0}/{1} 通过', [passed, result.checks.filter(c => c.pass !== null).length]) }}</span>
    </div>
    <StackCards v-if="!compact && (result.checks.length || result.conditionChecks.length || result.alternatives?.length)" :title="tl('条件、核对与全部解')" :count="result.checks.length + (result.alternatives?.length ?? 0)">
      <ul class="rlist small">
        <li v-for="c in result.conditionChecks" :key="c.id"><span class="chip" :class="c.state">{{ tl(APP_TEXT[c.state]) }}</span> {{ tl(c.reason) }}</li>
        <li v-for="c in result.checks" :key="c.id">
          <span class="chip" :class="c.pass === null ? '' : c.pass ? 'ok' : 'bad'">{{ c.pass === null ? tl('未比较') : c.pass ? tl('一致') : tl('不一致') }}</span>
          <span>{{ tl(c.label, c.labelParams) }}</span>
          <span v-if="c.valueSI !== null && result.value?.unit" class="mono">：{{ fmtQ(c.valueSI, result.value.unit === '1' ? '' : result.value.unit) }}</span>
          <span v-if="c.delta !== null" class="mono muted">{{ tl('（差 {0}）', [c.delta.toExponential(1)]) }}</span>
          <div v-if="c.note" class="tiny muted">{{ tl(c.note) }}</div>
        </li>
        <li v-for="(a, i) in result.alternatives ?? []" :key="`alt${i}`">
          <span class="chip" :class="a.chosen ? 'ok' : ''">{{ a.chosen ? tl('采用') : tl('其他解') }}</span>
          <span class="mono">t = {{ fmtQ(a.valueSI, 's') }}</span> <span class="muted">{{ a.conditions.map(x => tl(x)).join('，') }}</span>
        </li>
      </ul>
      <p v-if="result.errorBudget" class="tiny muted">{{ tl('核对的容差：|q − q_ref| ≤ {0} + {1}·max(|q|, |q_ref|)', [result.errorBudget.atolSI, result.errorBudget.rtol]) }}</p>
    </StackCards>
  </article>
</template>

<style scoped>
.rcard { background: var(--pane); border-radius: var(--radius-group); padding: 10px 12px; margin-bottom: 8px; border: 1px solid var(--separator); }
.rcard.old { opacity: 0.6; border-style: dashed; }
.rcard.t-ok { border-left: 3px solid var(--success); }
.rcard.t-warn { border-left: 3px solid var(--warning); }
.rcard.t-bad { border-left: 3px solid var(--danger); }
.rhead { display: flex; align-items: flex-start; gap: 8px; }
.rtitle { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.rvalue { display: flex; align-items: baseline; gap: 8px; margin: 6px 0 2px; }
.rvalue .num { font-size: calc(20px * var(--zoom)); font-weight: 600; font-variant-numeric: tabular-nums; }
.rreason { margin: 4px 0; color: var(--warning); }
.rmeta { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0; }
.chip { display: inline-flex; align-items: center; border-radius: 999px; padding: 1px 8px; background: var(--fill); color: var(--text-2); }
.chip.ok, .chip.applicable { background: var(--success-soft); color: var(--success); }
.chip.approximate { background: var(--warning-soft); color: var(--warning); }
.chip.bad, .chip.inapplicable { background: var(--danger-soft); color: var(--danger); }
.chip.insufficient { background: var(--fill-strong); }
.rlist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.menu-anchor { position: relative; }
.menu { top: calc(100% + 4px); right: 0; left: auto; min-width: 200px; }
</style>
