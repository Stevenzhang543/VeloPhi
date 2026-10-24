<script setup lang="ts">
import { computed, ref } from 'vue'
import { state, currentTime, seekTime } from '../store'
import { activeSituations, evaluateCard, formatPlain, THRESHOLDS } from '../../formula/match'
import type { FormulaCard, Verdict } from '../../formula/match'
import { FORMULAS } from '../../formula/library'
import Tex from './Tex.vue'

const showNA = ref(false)

const groups = computed(() => {
  if (!state.recording || state.stale) return []
  const t = currentTime()
  void state.frame
  return activeSituations(state.situations, t).map(s => {
    const sample = s.sample(Math.min(Math.max(t, s.t0), s.t1))
    const cards = FORMULAS.filter(f => f.situation === s.type).map(f => evaluateCard(f, s, sample, { digits: state.digits }))
    return { sit: s, sample, cards: cards.filter(c => c.verdict !== 'not-applicable'), na: cards.filter(c => c.verdict === 'not-applicable') }
  })
})

const VERDICT: Record<Verdict, { text: string; cls: string }> = {
  match: { text: '一致', cls: 'ok' },
  deviate: { text: '偏差超限', cls: 'bad' },
  'approx-ok': { text: '近似成立', cls: 'ok' },
  approx: { text: '近似', cls: 'warn' },
  'approx-invalid': { text: '近似失效', cls: 'bad' },
  'not-applicable': { text: '不适用', cls: '' },
  'no-measure': { text: '无法比较', cls: '' }
}

function err(c: FormulaCard): string {
  if (c.absError === null) return '—'
  return `${formatPlain(c.absError, 3)}（${c.relError !== null ? (c.relError * 100 < 1e-3 ? c.relError.toExponential(2) : (c.relError * 100).toPrecision(3) + '%') : '—'}）`
}
const unit = (u: string) => (u ? ` ${u}` : '')
const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' }
const sci = (v: number) => { const e = Math.round(Math.log10(v)); return `10${String(e).split('').map(c => SUP[c]).join('')}` }
</script>

<template>
  <div class="formulas">
    <div v-if="!state.recording || state.stale" class="empty">运行仿真后，这里会按当前时刻列出匹配的公式，<br />代入参数后与仿真结果逐项对照。</div>
    <template v-else>
      <div class="legend tiny muted">
        精确公式：相对误差 ≤ {{ sci(THRESHOLDS.exactRel) }} 判为一致（能量账本 ≤ {{ sci(THRESHOLDS.energyRel) }}）。近似公式按适用条件分级。角度代入时以度显示。
      </div>
      <div v-if="groups.length === 0" class="empty">当前时刻没有识别到可匹配的典型情形。</div>
      <section v-for="g in groups" :key="g.sit.key" class="situation">
        <header>
          <span class="title">{{ g.sit.title }}</span>
          <span class="spacer" />
          <button v-if="g.sit.tEvent !== undefined" class="btn ghost small" @click="seekTime(g.sit.tEvent!)">跳到 t = {{ formatPlain(g.sit.tEvent!, 6) }} s</button>
          <span v-else class="tiny muted mono">{{ formatPlain(g.sit.t0, 5) }}–{{ formatPlain(g.sit.t1, 5) }} s</span>
        </header>
        <details class="vars">
          <summary class="tiny muted">已知量（来自场景与本阶段初态）</summary>
          <div v-for="(v, k) in g.sample.vars" :key="k" class="var small">
            <Tex :tex="v.symbol" /> <span class="muted">{{ v.label }}</span> <span class="spacer" />
            <span class="mono">{{ formatPlain(v.value, state.digits) }}{{ unit(v.unit) }}</span>
          </div>
        </details>
        <article v-for="c in g.cards" :key="c.key" class="card" :class="VERDICT[c.verdict].cls">
          <div class="card-head">
            <span class="card-title">{{ c.formula.title }}</span>
            <span v-if="c.formula.method" class="badge info">{{ c.formula.method }}</span>
            <span class="spacer" />
            <span class="badge" :class="VERDICT[c.verdict].cls">{{ VERDICT[c.verdict].text }}</span>
          </div>
          <Tex :tex="c.symbolic" display />
          <div v-if="c.substituted" class="subst"><Tex :tex="c.substituted" /></div>
          <div class="compare small">
            <span class="muted">理论值</span><span class="mono">{{ formatPlain(c.theory, state.digits) }}{{ unit(c.formula.unit) }}</span>
            <span class="muted">仿真值</span><span class="mono">{{ formatPlain(c.sim, state.digits) }}{{ unit(c.formula.unit) }}</span>
            <span class="muted">误差</span><span class="mono">{{ err(c) }}</span>
          </div>
          <div class="tiny muted">仿真量：{{ c.measureLabel }}<template v-if="c.formula.note">；{{ c.formula.note }}</template></div>
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
      <label class="check small na-toggle"><input v-model="showNA" type="checkbox" />显示本时刻不适用的公式及原因</label>
    </template>
  </div>
</template>

<style scoped>
.formulas { padding-top: 4px; }
.legend { margin: 2px 2px 8px; line-height: 1.45; }
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
.card-head { display: flex; align-items: center; gap: 6px; }
.card-title { font-weight: 600; font-size: 12.5px; }
.subst { color: var(--text-2); font-size: 0.95em; line-height: 1.9; padding: 2px 0 4px; text-align: center; }
.compare { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 4px 0; }
.compare .mono { text-align: right; }
.conds { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.conds .badge { height: auto; min-height: 20px; white-space: normal; padding: 2px 7px; }
.reason { margin-top: 4px; color: var(--text-2); }
.na { background: var(--group); border-radius: var(--radius-group); padding: 6px 10px; opacity: 0.8; }
.na-item { padding: 3px 0; }
.na-toggle { margin: 4px 2px; }
</style>
