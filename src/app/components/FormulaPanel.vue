<script setup lang="ts">
/**
 * Formula comparison for the current frame: the situations active at that time, each formula with its
 * conditions, the substituted line, theory vs. simulation and the error. Every substituted value and every
 * result is shown in its own display unit (settings), with the unit written next to it, so the line stays
 * consistent whatever units are chosen; the evaluation itself is always SI.
 * Follows `state.panelFrame` only while `active` (visible tab on the visible page).
 *
 * 26.51: only formulas within the chosen knowledge level are shown (D44; the others are folded into one line
 * that can be expanded), each card carries its level tag, and the substitution is shown compactly as
 * "given → substituted → result" with every known value in its own colour, plus the calculation steps on demand (D45).
 */
import { tl, paren, semiSep } from '../../i18n'
import { computed, nextTick, ref, watch } from 'vue'
import { state, seekTime, problemLocked } from '../store'
import ProblemLock from './ProblemLock.vue'
import { activeSituations, evaluateCard, THRESHOLDS } from '../../formula/match'
import type { FormulaCard, Verdict } from '../../formula/match'
import { FORMULAS } from '../../formula/library'
import type { Sample } from '../../formula/situations'
import { useGated } from '../live'
import { effectiveCurriculum, fmtNum, fmtQ, settings, unitLabel } from '../settings'
import { shownTime } from '../../units/clock'
import { levelTag, withinLevel } from '../../formula/levels'
import type { Solution } from '../../formula/solve'
import { solveFormula } from '../../formula/solve'
import { locale } from '../../i18n/locale'
import RichText from './detail/RichText.vue'
import Tex from './Tex.vue'
import Section from './Section.vue'
import { openFormulaDetail } from '../details'
import { openHandbook } from '../handbook'

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })

const showNA = ref(false)
const frame = useGated(() => props.active, () => state.panelFrame)

/** Compact worked solution of a card: coloured knowns, substitution and result, steps (D45). */
function compact(c: FormulaCard, sample: Sample, digits: number): Solution | null {
  if (c.theory === null) return null
  try { return solveFormula(c.formula, sample, { digits, units: settings.units, lang: locale.lang }) } catch { return null }
}

/** Cards whose calculation steps are expanded. */
const expanded = ref(new Set<string>())
function toggleSteps(key: string) {
  const s = new Set(expanded.value)
  if (s.has(key)) s.delete(key); else s.add(key)
  expanded.value = s
}
/** Show the formulas above the chosen knowledge level too. */
const showAbove = ref(false)

const reducedFrom = computed(() => (state.stale ? null : state.recording?.reducedFrom ?? null))
const reducedNow = computed(() => reducedFrom.value !== null && state.recording !== null && frame.value * state.recording.dt >= reducedFrom.value - 1e-12)

const groups = computed(() => {
  const rec = state.recording
  if (!rec || state.stale) return []
  const t = frame.value * rec.dt
  const digits = state.digits
  return activeSituations(state.situations, t).map(s => {
    const sample = s.sample(Math.min(Math.max(t, s.t0), s.t1))
    const cur = effectiveCurriculum(), level = settings.knowledge.level
    const cards = FORMULAS.filter(f => f.situation === s.type).map(f => evaluateCard(f, s, sample, { digits }))
    const applicable = cards.filter(c => c.verdict !== 'not-applicable')
    const within = applicable.filter(c => withinLevel(c.formula.id, cur, level))
    const above = applicable.filter(c => !withinLevel(c.formula.id, cur, level))
    const show = (c: FormulaCard) => ({ c, sol: compact(c, sample, digits), tag: tl(levelTag(c.formula.id, cur)) })
    return { sit: s, sample, cards: [...within, ...(showAbove.value ? above : [])].map(show), above: above.length, na: cards.filter(c => c.verdict === 'not-applicable') }
  })
})

// A formula opened from the handbook: show it even above the chosen level, and bring its card into view
watch(() => [state.formulaFocus, groups.value.length] as const, async ([id]) => {
  if (!id || !groups.value.length) return
  if (!groups.value.some(g => g.cards.some(x => x.c.formula.id === id))) showAbove.value = true
  await nextTick()
  const el = document.querySelector(`[data-fid="${id}"]`)
  if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(() => { if (state.formulaFocus === id) state.formulaFocus = null }, 2500) }
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
    <ProblemLock v-if="problemLocked()" />
    <div v-else-if="!state.recording || state.stale" class="empty">{{ tl('运行仿真后，这里会按当前时刻列出匹配的公式，') }}<br />{{ tl('代入参数后与仿真结果逐项对照。') }}</div>
    <template v-else>
      <Section id="formula.legend" :title="tl('判定与读法')" :open="false">
        <div class="legend tiny muted">
          {{ tl('精确公式：相对误差 ≤ {0} 判为一致（能量账本 ≤ {1}）。近似公式按适用条件分级。已知量按“设置 › 单位与数值”显示，代入时换算为国际单位；颜色对应同一个量。', [sci(THRESHOLDS.exactRel), sci(THRESHOLDS.energyRel)]) }}
        </div>
      </Section>
      <div v-if="reducedFrom !== null" class="reduced small" :class="{ now: reducedNow }">
        <span class="badge warn">{{ tl('精度降级') }}</span>
        <span>{{ tl('{0} Moreau–Jean 时间步进计算，{1}仿真值精度降低、事件时刻不精确定位，下面的对照仅供参考。', [reducedFrom > 0 ? tl('事件过于密集，自 t = {0} 起改用', [fmtQ(shownTime(reducedFrom), 's', 6)]) : tl('本次使用'), reducedFrom > 0 ? tl('此后的') : '']) }}</span>
      </div>
      <div v-if="state.computing && !state.situations.length" class="empty">{{ tl('正在计算，完成后识别典型情形并对照公式…') }}</div>
      <div v-else-if="groups.length === 0" class="empty">{{ tl('当前时刻没有识别到可匹配的典型情形。') }}</div>
      <Section v-for="g in groups" :id="`formula.sit.${g.sit.type}`" :key="g.sit.key" class="situation" :title="g.sit.title" :count="g.cards.length" strong>
        <template #actions>
          <button v-if="g.sit.tEvent !== undefined" class="btn ghost small" @click="seekTime(g.sit.tEvent!)">{{ tl('跳到 t = {0}', [fmtQ(shownTime(g.sit.tEvent!), 's', 6)]) }}</button>
          <span v-else class="tiny muted mono">{{ fmtNum(shownTime(g.sit.t0), 's', 5) }}–{{ fmtNum(shownTime(g.sit.t1), 's', 5) }} {{ unitLabel('s') }}</span>
        </template>
        <details class="vars">
          <summary class="tiny muted">{{ tl('已知量（来自场景与本阶段初态）') }}</summary>
          <div v-for="(v, k) in g.sample.vars" :key="k" class="var small">
            <Tex :tex="v.symbol" /> <span class="muted">{{ v.label }}</span> <span class="spacer" />
            <span class="mono">{{ fmtQ(v.value, v.unit) }}</span>
          </div>
        </details>
        <article v-for="{ c, sol, tag } in g.cards" :key="c.key" class="card" :class="[VERDICT[c.verdict].cls, { focus: state.formulaFocus === c.formula.id }]" :data-fid="c.formula.id">
          <div class="card-head">
            <span class="card-title">{{ c.formula.title }}</span>
            <span v-if="c.formula.method" class="badge info">{{ c.formula.method }}</span>
            <span class="badge level" :title="tl('知识水平（设置 › 知识与公式）')">{{ tag }}</span>
            <span class="spacer" />
            <span class="badge" :class="VERDICT[c.verdict].cls">{{ VERDICT[c.verdict].text }}</span>
            <button class="btn ghost small detail-btn" :title="tl('在学习手册中查看这条公式的原理与推导')" @click="openHandbook(c.formula.id)">{{ tl('手册') }}</button>
            <button class="btn ghost small detail-btn" :title="tl('推导、解题过程与适用条件')" @click="openDetail(c)">{{ tl('详情') }}</button>
          </div>
          <Tex :tex="c.symbolic" display />
          <template v-if="sol && !sol.error">
            <div v-if="sol.known.length" class="knowns small">
              <span class="muted">{{ tl('已知') }}</span>
              <span v-for="k in sol.known" :key="k.name" class="known"><Tex :tex="`\\textcolor{${k.color}}{${k.symbol} = ${k.display}}`" /></span>
            </div>
            <div class="subst"><Tex :tex="sol.coloredSubstituted ? `${sol.lhs} = ${sol.coloredSubstituted} = ${sol.resultDisplay}` : `${sol.lhs} = ${sol.resultDisplay}`" /></div>
            <button v-if="sol.lines.length > 1" class="steps-toggle tiny" :aria-expanded="expanded.has(c.key)" @click="toggleSteps(c.key)">{{ expanded.has(c.key) ? tl('收起计算步骤') : tl('展开计算步骤（{0} 步）', [sol.lines.length]) }}</button>
            <div v-if="expanded.has(c.key)" class="steps">
              <template v-for="(ln, li) in sol.lines" :key="li">
                <div class="step-eq"><Tex :tex="li === 0 ? `${sol.lhs} = ${ln.tex}` : `= ${ln.tex}`" /></div>
                <div class="step-note tiny muted"><RichText v-if="ln.note" :text="ln.note" /></div>
              </template>
            </div>
          </template>
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
        <button v-if="g.above && !showAbove" class="above small" @click="showAbove = true">{{ tl('还有 {0} 条超出所选知识水平的公式，点此显示', [g.above]) }}</button>
      </Section>
      <label v-if="groups.some(g => g.above) || showAbove" class="check small na-toggle"><input v-model="showAbove" type="checkbox" />{{ tl('显示超出所选知识水平的公式') }}</label>
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
.card.focus { box-shadow: 0 0 0 2px var(--accent); transition: box-shadow 300ms ease; }
.knowns { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; margin: 2px 0 2px; }
.known { white-space: nowrap; }
.level { background: var(--fill); color: var(--text-2); font-weight: 600; flex: 0 0 auto; }
.steps-toggle { border: 0; background: none; color: var(--accent); cursor: pointer; padding: 0; margin: 0 0 4px; }
.steps { display: grid; grid-template-columns: minmax(0, auto) minmax(6em, 1fr); gap: 2px 10px; align-items: center; background: var(--fill); border-radius: 8px; padding: 6px 8px; margin: 2px 0 6px; overflow-x: auto; }
.step-eq { white-space: nowrap; }
.step-note { line-height: 1.35; }
.above { display: block; width: 100%; border: 1px dashed var(--separator); background: none; border-radius: var(--radius-group); color: var(--text-2); padding: 6px 10px; cursor: pointer; text-align: left; margin-bottom: 8px; }
.above:hover { color: var(--accent); border-color: var(--accent); }
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
