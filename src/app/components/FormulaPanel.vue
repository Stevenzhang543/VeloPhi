<script setup lang="ts">
/**
 * Formula comparison for the current frame: the situations active at that time, each formula with its
 * conditions, the substituted line, theory vs. simulation and the error. Every substituted value and every
 * result is shown in its own display unit (settings), with the unit written next to it, so the line stays
 * consistent whatever units are chosen; the evaluation itself is always SI.
 * Follows `state.panelFrame` only while `active` (visible tab on the visible page).
 */
import { tl, paren, semiSep } from '../../i18n'
import { computed, ref } from 'vue'
import { state, seekTime } from '../store'
import { activeSituations, evaluateCard, THRESHOLDS } from '../../formula/match'
import type { FormulaCard, Verdict } from '../../formula/match'
import { FORMULAS } from '../../formula/library'
import type { FormulaDef } from '../../formula/library'
import type { Sample } from '../../formula/situations'
import { parse, toLatex } from '../../formula/expr'
import type { Node } from '../../formula/expr'
import { useGated } from '../live'
import { fmtNum, fmtQ, texQ, unitLabel } from '../settings'
import Tex from './Tex.vue'
import { openFormulaDetail } from '../details'

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })

const showNA = ref(false)
const frame = useGated(() => props.active, () => state.panelFrame)

const asts = new Map<string, Node>()
function ast(f: FormulaDef): Node {
  let a = asts.get(f.id)
  if (!a) { a = parse(f.expr); asts.set(f.id, a) }
  return a
}

/** Substituted line with each value in its display unit: "a = 9.8 m/s² × (sin 30° − …) = 3.203 m/s²". */
function substitutedLine(c: FormulaCard, sample: Sample, digits: number): string {
  if (c.theory === null) return ''
  try {
    const show = (name: string) => {
      const v = sample.vars[name]
      return v ? texQ(v.value, v.unit, digits) : null
    }
    return `${c.formula.lhs} = ${toLatex(ast(c.formula), { value: show })} = ${texQ(c.theory, c.formula.unit, digits)}`
  } catch {
    return c.substituted
  }
}

const reducedFrom = computed(() => (state.stale ? null : state.recording?.reducedFrom ?? null))
const reducedNow = computed(() => reducedFrom.value !== null && state.recording !== null && frame.value * state.recording.dt >= reducedFrom.value - 1e-12)

const groups = computed(() => {
  const rec = state.recording
  if (!rec || state.stale) return []
  const t = frame.value * rec.dt
  const digits = state.digits
  return activeSituations(state.situations, t).map(s => {
    const sample = s.sample(Math.min(Math.max(t, s.t0), s.t1))
    const cards = FORMULAS.filter(f => f.situation === s.type).map(f => evaluateCard(f, s, sample, { digits }))
    const shown = cards.filter(c => c.verdict !== 'not-applicable').map(c => ({ c, line: substitutedLine(c, sample, digits) }))
    return { sit: s, sample, cards: shown, na: cards.filter(c => c.verdict === 'not-applicable') }
  })
})

/** Open the detail view (derivation, step-by-step solution, conditions) of a card at the frame shown. */
function openDetail(c: FormulaCard) {
  const rec = state.recording
  if (rec) openFormulaDetail(c.formula.id, c.situation.key, frame.value * rec.dt)
}

const VERDICT: Record<Verdict, { text: string; cls: string }> = {
  match: { text: tl('一致'), cls: 'ok' },
  deviate: { text: tl('偏差超限'), cls: 'bad' },
  'approx-ok': { text: tl('近似成立'), cls: 'ok' },
  approx: { text: tl('近似'), cls: 'warn' },
  'approx-invalid': { text: tl('近似失效'), cls: 'bad' },
  'not-applicable': { text: tl('不适用'), cls: '' },
  'no-measure': { text: tl('无法比较'), cls: '' }
}

function err(c: FormulaCard): string {
  if (c.absError === null) return '—'
  const rel = c.relError !== null ? (c.relError * 100 < 1e-3 ? c.relError.toExponential(2) : (c.relError * 100).toPrecision(3) + '%') : '—'
  return `${fmtQ(c.absError, c.formula.unit, 3)}${paren(rel)}`
}
const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' }
const sci = (v: number) => { const e = Math.round(Math.log10(v)); return `10${String(e).split('').map(c => SUP[c]).join('')}` }
</script>

<template>
  <div class="formulas">
    <div v-if="!state.recording || state.stale" class="empty">{{ tl('运行仿真后，这里会按当前时刻列出匹配的公式，') }}<br />{{ tl('代入参数后与仿真结果逐项对照。') }}</div>
    <template v-else>
      <div class="legend tiny muted">
        {{ tl('精确公式：相对误差 ≤ {0} 判为一致（能量账本 ≤ {1}）。近似公式按适用条件分级。代入值带单位，按“设置 › 单位与数值”显示；计算始终使用国际单位。', [sci(THRESHOLDS.exactRel), sci(THRESHOLDS.energyRel)]) }}
      </div>
      <div v-if="reducedFrom !== null" class="reduced small" :class="{ now: reducedNow }">
        <span class="badge warn">{{ tl('精度降级') }}</span>
        <span>{{ tl('{0} Moreau–Jean 时间步进计算，{1}仿真值精度降低、事件时刻不精确定位，下面的对照仅供参考。', [reducedFrom > 0 ? tl('事件过于密集，自 t = {0} 起改用', [fmtQ(reducedFrom, 's', 6)]) : tl('本次使用'), reducedFrom > 0 ? tl('此后的') : '']) }}</span>
      </div>
      <div v-if="state.computing && !state.situations.length" class="empty">{{ tl('正在计算，完成后识别典型情形并对照公式…') }}</div>
      <div v-else-if="groups.length === 0" class="empty">{{ tl('当前时刻没有识别到可匹配的典型情形。') }}</div>
      <section v-for="g in groups" :key="g.sit.key" class="situation">
        <header>
          <span class="title">{{ g.sit.title }}</span>
          <span class="spacer" />
          <button v-if="g.sit.tEvent !== undefined" class="btn ghost small" @click="seekTime(g.sit.tEvent!)">{{ tl('跳到 t = {0}', [fmtQ(g.sit.tEvent!, 's', 6)]) }}</button>
          <span v-else class="tiny muted mono">{{ fmtNum(g.sit.t0, 's', 5) }}–{{ fmtNum(g.sit.t1, 's', 5) }} {{ unitLabel('s') }}</span>
        </header>
        <details class="vars">
          <summary class="tiny muted">{{ tl('已知量（来自场景与本阶段初态）') }}</summary>
          <div v-for="(v, k) in g.sample.vars" :key="k" class="var small">
            <Tex :tex="v.symbol" /> <span class="muted">{{ v.label }}</span> <span class="spacer" />
            <span class="mono">{{ fmtQ(v.value, v.unit) }}</span>
          </div>
        </details>
        <article v-for="{ c, line } in g.cards" :key="c.key" class="card" :class="VERDICT[c.verdict].cls">
          <div class="card-head">
            <span class="card-title">{{ c.formula.title }}</span>
            <span v-if="c.formula.method" class="badge info">{{ c.formula.method }}</span>
            <span class="spacer" />
            <span class="badge" :class="VERDICT[c.verdict].cls">{{ VERDICT[c.verdict].text }}</span>
            <button class="btn ghost small detail-btn" :title="tl('推导、代入求解与适用条件')" @click="openDetail(c)">{{ tl('详情') }}</button>
          </div>
          <Tex :tex="c.symbolic" display />
          <div v-if="line" class="subst"><Tex :tex="line" /></div>
          <div class="compare small">
            <span class="muted">{{ tl('理论值') }}</span><span class="mono">{{ fmtQ(c.theory, c.formula.unit) }}</span>
            <span class="muted">{{ tl('仿真值') }}</span><span class="mono">{{ fmtQ(c.sim, c.formula.unit) }}</span>
            <span class="muted">{{ tl('误差') }}</span><span class="mono">{{ err(c) }}</span>
          </div>
          <div class="tiny muted">{{ tl('仿真量：{0}', [c.measureLabel]) }}<template v-if="c.formula.note">{{ semiSep() }}{{ c.formula.note }}</template></div>
          <div v-if="c.conditions.length" class="conds">
            <span v-for="cd in c.conditions" :key="cd.id" class="badge" :class="cd.status === 'ok' ? 'ok' : cd.status === 'approx' ? 'warn' : 'bad'" :title="cd.detail">{{ cd.label }}<template v-if="cd.detail">：{{ cd.detail }}</template></span>
          </div>
          <div v-if="c.reason && (c.verdict === 'deviate' || c.verdict === 'no-measure' || c.verdict === 'not-applicable')" class="reason small">{{ c.reason }}</div>
        </article>
        <div v-if="showNA && g.na.length" class="na">
          <div v-for="c in g.na" :key="c.key" class="na-item small">
            <Tex :tex="c.symbolic" /> <span class="muted">— {{ c.reason }}</span>
          </div>
        </div>
      </section>
      <label class="check small na-toggle"><input v-model="showNA" type="checkbox" />{{ tl('显示本时刻不适用的公式及原因') }}</label>
    </template>
  </div>
</template>

<style scoped>
.formulas { padding-top: 4px; }
.legend { margin: 2px 2px 8px; line-height: 1.45; }
.reduced { display: flex; gap: 8px; align-items: flex-start; background: var(--warning-soft); border-radius: var(--radius-group); padding: 8px 10px; margin-bottom: 10px; line-height: 1.5; }
.reduced.now { box-shadow: inset 3px 0 0 var(--warning); }
.reduced .badge { flex: 0 0 auto; }
.situation { margin-bottom: 14px; }
.situation header { display: flex; align-items: center; gap: 6px; margin: 4px 2px 6px; }
.situation .title { font-weight: 600; }
.vars { background: var(--group); border-radius: var(--radius-group); padding: 4px 10px; margin-bottom: 8px; }
.vars summary { cursor: pointer; padding: 2px 0; }
.var { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
.card { background: var(--group); border-radius: var(--radius-group); padding: 8px 10px; margin-bottom: 8px; border-left: 3px solid transparent; }
.card.ok { border-left-color: var(--success); }
.card.warn { border-left-color: var(--warning); }
.card.bad { border-left-color: var(--danger); }
.card-head { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 6px; }
.card-title { flex: 1 1 9em; min-width: 0; font-weight: 600; font-size: var(--type-small); overflow-wrap: anywhere; hyphens: auto; }
.card-head .badge, .card-head .detail-btn { flex: 0 0 auto; }
.detail-btn { height: calc(22px * var(--zoom)); padding: 0 6px; margin-right: -4px; color: var(--accent); }
.subst { color: var(--text-2); font-size: 0.95em; line-height: 1.9; padding: 2px 0 4px; text-align: center; overflow-x: auto; overflow-y: hidden; }
.compare { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 4px 0; }
.compare .mono { text-align: right; }
.conds { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.conds .badge { height: auto; min-height: 20px; white-space: normal; padding: 2px 7px; }
.reason { margin-top: 4px; color: var(--text-2); }
.na { background: var(--group); border-radius: var(--radius-group); padding: 6px 10px; opacity: 0.8; }
.na-item { padding: 3px 0; }
.na-toggle { margin: 4px 2px; }
</style>
