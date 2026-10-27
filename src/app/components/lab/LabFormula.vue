<script setup lang="ts">
/**
 * A formula of a lab experiment (26.54, D76): the textbook form, the value it gives with the current numbers
 * (evaluated by the core's formula language, `evaluateExpr`) and, beside it, the value the experiment computed in
 * Rust, with their difference. The conclusion is on top; the known values and the substitution fold out.
 */
import { computed } from 'vue'
import { tl } from '../../../i18n'
import { calc } from '../../../engine/core'
import { fmtQ } from '../../settings'
import Tex from '../Tex.vue'

export interface LabVar { name: string; symbol: string; value: number; unit: string }

const props = withDefaults(defineProps<{
  title: string
  tex: string
  /** Expression of the formula language in the variables' names (SI). */
  expr: string
  vars: LabVar[]
  /** SI unit of the result ('' for a pure number). */
  unit: string
  lhs: string
  /** Value of the experiment (core); null or absent: shown without comparison. */
  result?: number | null
  /** Shown instead of the number (for example a text result). */
  note?: string
}>(), { result: null, note: '' })

const theory = computed<number | null>(() => {
  try {
    const vars: Record<string, number> = {}
    for (const v of props.vars) vars[v.name] = v.value
    const r = calc<{ value?: number; error?: unknown }>({ op: 'evaluateExpr', expr: props.expr, vars })
    return typeof r.value === 'number' ? r.value : null
  } catch { return null }
})
const fmt = (v: number | null) => (v === null || !Number.isFinite(v) ? '—' : props.unit ? fmtQ(v, props.unit) : String(Number(v.toPrecision(5))))
const rel = computed(() => {
  const t = theory.value, r = props.result
  if (t === null || r === null || !Number.isFinite(t) || !Number.isFinite(r)) return null
  const d = Math.abs(t - r), s = Math.max(Math.abs(t), Math.abs(r))
  return s > 0 ? d / s : 0
})
const verdict = computed(() => (rel.value === null ? '' : rel.value <= 1e-9 ? 'ok' : rel.value <= 1e-3 ? 'warn' : 'bad'))
const relText = computed(() => {
  const r = rel.value
  if (r === null) return ''
  if (r === 0) return '0'
  return r >= 1e-5 ? `${Number((r * 100).toPrecision(2))}%` : r.toExponential(1)
})
</script>

<template>
  <div class="lf" :class="verdict">
    <div class="lf-head">
      <span class="lf-title">{{ title }}</span>
      <span class="spacer" />
      <span v-if="note" class="lf-val mono">{{ note }}</span>
      <span v-else class="lf-val mono"><Tex :tex="lhs" /> = {{ fmt(theory) }}</span>
    </div>
    <div class="lf-tex"><Tex :tex="tex" display /></div>
    <div v-if="result !== null && result !== undefined" class="lf-cmp tiny">
      <span class="muted">{{ tl('公式') }}</span><span class="mono">{{ fmt(theory) }}</span>
      <span class="muted">{{ tl('实验（Rust 计算）') }}</span><span class="mono">{{ fmt(result) }}</span>
      <span class="muted">{{ tl('相对差') }}</span><span class="mono">{{ relText }}</span>
    </div>
    <details v-if="vars.length" class="lf-known">
      <summary class="tiny muted">{{ tl('代入的已知量') }}</summary>
      <div class="lf-vars">
        <span v-for="v in vars" :key="v.name" class="lf-var small"><Tex :tex="v.symbol" /> = <span class="mono">{{ v.unit ? fmtQ(v.value, v.unit) : String(Number(v.value.toPrecision(5))) }}</span></span>
      </div>
    </details>
  </div>
</template>

<style scoped>
.lf-tex { overflow-x: auto; overflow-y: hidden; max-width: 100%; }
.lf { background: var(--group); border-radius: var(--radius-group); padding: 6px 10px; margin-bottom: 8px; border-left: 3px solid transparent; }
.lf.ok { border-left-color: var(--success); }
.lf.warn { border-left-color: var(--warning); }
.lf.bad { border-left-color: var(--danger); }
.lf-head { display: flex; align-items: baseline; gap: 6px; }
.lf-title { font-weight: 600; font-size: var(--type-small); }
.lf-val { font-size: var(--type-small); color: var(--accent); white-space: nowrap; }
.lf-cmp { display: grid; grid-template-columns: auto 1fr; gap: 1px 10px; margin: 2px 0; }
.lf-cmp .mono { text-align: right; }
.lf-known summary { cursor: pointer; }
.lf-vars { display: flex; flex-wrap: wrap; gap: 2px 12px; padding: 2px 0; }
.lf-var { white-space: nowrap; }
</style>
