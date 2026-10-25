<script setup lang="ts">
/**
 * Sections of a formula or event detail view (formula/detailTypes.ts): text, sub-headings, display equations,
 * numbered derivation steps with their basis, chains of equalities (aligned), tables and condition lists. Pure
 * rendering of the builder's data; `large` is the reading mode (bigger type, wider tables).
 */
import type { DetailView } from '../../../formula/detailTypes'
import { chainLatex } from '../../../formula/detailTypes'
import Tex from '../Tex.vue'
import RichText from './RichText.vue'

defineProps<{ view: DetailView; large?: boolean }>()

const STATUS_MARK: Record<'ok' | 'approx' | 'fail', string> = { ok: '✓', approx: '≈', fail: '✗' }
</script>

<template>
  <div class="dbody" :class="{ large }">
    <section v-for="s in view.sections" :id="`detail-${s.id}`" :key="s.id" class="dsec" :data-section="s.id">
      <h3 class="dsec-title">{{ s.title }}</h3>
      <template v-for="(b, bi) in s.blocks" :key="bi">
        <p v-if="b.kind === 'text'" class="dtext" :class="[b.tone ? `tone-${b.tone}` : '', { small: b.small }]"><RichText :text="b.text" /></p>
        <h4 v-else-if="b.kind === 'subhead'" class="dsub"><RichText :text="b.text" /></h4>
        <div v-else-if="b.kind === 'equation'" class="deq">
          <div class="eq-scroll"><Tex :tex="b.tex" display /></div>
          <p v-if="b.text" class="dtext"><RichText :text="b.text" /></p>
          <span v-if="b.basis" class="basis">{{ b.basis }}</span>
        </div>
        <ol v-else-if="b.kind === 'steps'" class="dsteps">
          <li v-for="(st, si) in b.steps" :key="si" class="dstep">
            <span class="num">{{ si + 1 }}</span>
            <div class="step-body">
              <p class="dtext"><RichText :text="st.text" /></p>
              <div class="eq-scroll"><Tex :tex="st.tex" display /></div>
              <span v-if="st.basis" class="basis">{{ st.basis }}</span>
            </div>
          </li>
        </ol>
        <div v-else-if="b.kind === 'chain'" class="dchain eq-scroll"><Tex :tex="chainLatex(b.lhs, b.rhs)" display /></div>
        <div v-else-if="b.kind === 'calc'" class="dcalc">
          <template v-for="(ln, li) in b.lines" :key="li">
            <div class="calc-eq eq-scroll"><Tex :tex="li === 0 ? `${b.lhs} = ${ln.tex}` : `= ${ln.tex}`" /></div>
            <div class="calc-note small"><RichText v-if="ln.note" :text="ln.note" /></div>
          </template>
        </div>
        <div v-else-if="b.kind === 'table'" class="dtable-wrap">
          <table class="dtable">
            <thead v-if="b.head"><tr><th v-for="(h, hi) in b.head" :key="hi" :style="{ textAlign: b.align?.[hi] ?? 'left' }"><RichText :text="h" /></th></tr></thead>
            <tbody>
              <tr v-for="(r, ri) in b.rows" :key="ri">
                <td v-for="(cell, ci) in r" :key="ci" :class="[{ mono: cell.mono }, cell.tone ? `tone-${cell.tone}` : '']" :style="{ textAlign: b.align?.[ci] ?? 'left' }">
                  <span v-if="cell.text"><RichText :text="cell.text" /></span><Tex v-if="cell.tex" :tex="cell.tex" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <ul v-else-if="b.kind === 'conditions'" class="dconds">
          <li v-for="(cd, ci) in b.items" :key="ci" :class="`st-${cd.status}`">
            <span class="mark">{{ STATUS_MARK[cd.status] }}</span>
            <div class="cond-body">
              <div class="cond-head"><span class="cond-label">{{ cd.label }}</span><span class="role">{{ cd.role }}</span></div>
              <div v-if="cd.detail" class="cond-detail"><RichText :text="cd.detail" /></div>
            </div>
          </li>
        </ul>
      </template>
    </section>
  </div>
</template>

<style scoped>
.dbody { display: flex; flex-direction: column; gap: 6px; container-type: inline-size; }
.dsec { padding: 2px 0 10px; scroll-margin-top: 8px; }
.dsec + .dsec { border-top: 1px solid var(--separator); padding-top: 10px; }
.dsec-title { font-size: var(--type-title); font-weight: 650; margin: 2px 0 8px; }
.dsub { font-size: var(--type-small); font-weight: 650; color: var(--text-2); margin: 10px 0 4px; overflow-wrap: anywhere; }
.dtext { margin: 4px 0; line-height: 1.6; overflow-wrap: anywhere; hyphens: auto; }
.dtext.small { font-size: var(--type-small); color: var(--text-2); }
.dtext.tone-ok { color: var(--success); font-weight: 600; }
.dtext.tone-warn { color: var(--warning); }
.dtext.tone-bad { color: var(--danger); font-weight: 600; }
.dtext.tone-info { color: var(--accent); }
.dtext.tone-neutral { color: var(--text-3); font-style: italic; }
.eq-scroll { overflow-x: auto; overflow-y: hidden; max-width: 100%; }
/* Worked calculation (D45): the equation on the left, what was done on the right (below it when narrow) */
.dcalc { display: grid; grid-template-columns: minmax(0, auto) minmax(8em, 1fr); gap: 6px 14px; align-items: center; margin: 6px 0 4px; padding: 8px 10px; background: var(--group); border-radius: var(--radius-group); }
.calc-eq { font-size: 1.05em; padding: 2px 0; }
.calc-eq:nth-of-type(n+2) { padding-left: 1.2em; }
.calc-note { color: var(--text-2); line-height: 1.45; overflow-wrap: anywhere; }
.large .dcalc { font-size: 1.08em; }
@container (max-width: 420px) { .dcalc { grid-template-columns: minmax(0, 1fr); } .calc-note { margin: -4px 0 4px 1.2em; } }
.eq-scroll :deep(.katex-display) { margin: 6px 0; }
.deq { margin: 4px 0 8px; }
.dchain { background: var(--group); border-radius: var(--radius-group); padding: 2px 12px; margin: 6px 0 10px; }
.dchain :deep(.katex-display > .katex) { text-align: left; }
.dchain :deep(.katex-display) { text-align: left; }
.basis { display: inline-block; font-size: var(--type-tiny); color: var(--accent); background: var(--accent-soft); border-radius: var(--radius-pill); padding: 1px 8px; margin-top: 2px; overflow-wrap: anywhere; }
.dsteps { list-style: none; padding: 0; margin: 4px 0 8px; display: flex; flex-direction: column; gap: 6px; }
.dstep { display: flex; gap: 8px; background: var(--group); border-radius: var(--radius-group); padding: 6px 10px; }
.dstep .num { flex: 0 0 auto; width: 20px; height: 20px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); font-size: var(--type-tiny); font-weight: 700; display: inline-flex; align-items: center; justify-content: center; margin-top: 3px; }
.step-body { flex: 1; min-width: 0; }
.dtable-wrap { overflow-x: auto; margin: 4px 0 8px; }
.dtable { border-collapse: collapse; font-size: var(--type-small); width: 100%; }
.dtable th { color: var(--text-3); font-weight: 600; font-size: var(--type-tiny); padding: 3px 6px; border-bottom: 1px solid var(--separator); white-space: nowrap; }
.dtable td { padding: 3px 6px; border-top: 1px solid var(--separator); vertical-align: baseline; }
.dtable tr:first-child td { border-top: 0; }
.dtable td.mono { white-space: nowrap; }
.dtable td :deep(.tex) { margin-left: 4px; }
.dtable td.tone-ok { color: var(--success); }
.dtable td.tone-warn { color: var(--warning); }
.dtable td.tone-bad { color: var(--danger); }
.dtable td.tone-info { color: var(--accent); }
.dconds { list-style: none; padding: 0; margin: 4px 0 8px; display: flex; flex-direction: column; gap: 6px; }
.dconds li { display: flex; gap: 8px; background: var(--group); border-radius: var(--radius-group); padding: 6px 10px; border-left: 3px solid var(--text-3); }
.dconds li.st-ok { border-left-color: var(--success); }
.dconds li.st-approx { border-left-color: var(--warning); }
.dconds li.st-fail { border-left-color: var(--danger); }
.mark { font-weight: 700; width: 14px; flex: 0 0 auto; }
.st-ok .mark { color: var(--success); }
.st-approx .mark { color: var(--warning); }
.st-fail .mark { color: var(--danger); }
.cond-body { flex: 1; min-width: 0; }
.cond-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; }
.cond-label { font-weight: 600; overflow-wrap: anywhere; }
.role { font-size: var(--type-tiny); color: var(--text-3); background: var(--fill); border-radius: var(--radius-pill); padding: 0 7px; }
.cond-detail { font-size: var(--type-small); color: var(--text-2); margin-top: 2px; overflow-wrap: anywhere; }
.large { font-size: calc(15px * var(--zoom)); }
.large .dsec-title { font-size: calc(19px * var(--zoom)); }
.large .dtable { font-size: var(--type-body); }
.large .eq-scroll :deep(.katex-display) { font-size: 1.12em; }
</style>
