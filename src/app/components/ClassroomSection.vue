<script setup lang="ts">
/**
 * The classroom section of the library (26.64, D240; the classroom page of 26.63, D235, moved here): what a teacher
 * opens in front of a class — the "predict first" cases with the class tally, the classroom experiments (flows of
 * 10–15 minutes with a teacher view) and the teaching activities — and at the bottom the tallies kept on this
 * computer. The class tally and the projection switch are also on the 教学 menu of every experiment panel.
 *
 * Content, not cards: each kind is a plain list under its heading, separated by the ticks of a scale; a row carries
 * at most one tag (D243).
 */
import { computed } from 'vue'
import { tl } from '../../i18n'
import { state, showToast } from '../store'
import { settings } from '../settings'
import { shell } from '../layout'
import { CASES } from '../../teaching/cases'
import { LESSONS } from '../../teaching/lessons/defs'
import { ACTIVITIES, openActivity } from '../learn/actions'
import { openLesson } from '../lessons'
import { tally, newTally, openCase, clearTallyHistory, tallySummary, totalOf } from '../tally'
import { T3 } from '../models/labels'
import Icon from './Icon.vue'

const STAGE: Record<string, string> = { j: '初中', s: '高中', u: '大学' }
const acts = computed(() => ACTIVITIES.map(a => ({ id: a.id, title: T3(a.title), stage: tl(STAGE[a.stage] ?? '高中'), goal: a.goals[0] ? T3(a.goals[0]) : '' })))
function freeTally() { newTally(); state.page = 'studio' }
function startLesson(id: string, teacher: boolean) { if (openLesson(id, teacher)) state.page = 'studio' }
async function copyRecord(i: number) { try { await navigator.clipboard.writeText(tallySummary(tally.history[i])); showToast(tl('统计结果已复制')) } catch { showToast(tl('无法写入剪贴板'), true) } }
const fmtDate = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
const share = (r: (typeof tally.history)[number], k: number) => { const n = totalOf(r.rounds[k]); return r.answer === null || !n ? null : Math.round((100 * r.rounds[k][r.answer]) / n) }
</script>

<template>
  <div class="classroom pane reading">
    <div class="inner">
      <header class="head">
        <h1 class="page-title">{{ tl('课堂') }}</h1>
        <div class="tools">
          <button type="button" class="btn primary" data-ui="classroom-tally" :title="tl('对当前场景提一个问题，举手计票')" @click="freeTally"><Icon name="tally" />{{ tl('先猜后看：自己出题') }}</button>
          <label class="proj" :title="tl('字号放大、对比加强，后排也看得清')"><input v-model="settings.projector" type="checkbox" class="switch" data-ui="classroom-projector" /><span>{{ tl('课堂投影') }}</span></label>
          <button type="button" class="btn" :title="tl('场景就在链接里，网页版打开即可')" @click="state.page = 'studio'; shell.share = true"><Icon name="share" />{{ tl('把场景发给学生') }}</button>
        </div>
      </header>

      <i class="tick-rule" aria-hidden="true" />
      <h2 class="section-title">{{ tl('先猜后看的现成案例') }}<span class="count num">{{ CASES.length }}</span><button type="button" class="btn ghost small more" @click="state.librarySection = 'cases'">{{ tl('易错概念索引') }}<Icon name="arrowRight" :size="13" /></button></h2>
      <ul class="list two">
        <li v-for="c in CASES" :key="c.id"><button type="button" class="item" :data-ui="`classroom-${c.id}`" @click="openCase(c.id, true)"><span class="t">{{ T3(c.title) }}</span><span class="d">{{ T3(c.question) }}</span></button></li>
      </ul>

      <i class="tick-rule" aria-hidden="true" />
      <h2 class="section-title">{{ tl('课堂实验') }}<span class="count num">{{ LESSONS.length }}</span></h2>
      <ul class="list">
        <li v-for="l in LESSONS" :key="l.id" class="lesson">
          <div class="text"><span class="t">{{ T3(l.title) }}</span><span class="d">{{ T3(l.goal) }}</span></div>
          <span class="mins num">{{ tl('{0} 分钟', [l.teacher.minutes]) }}</span>
          <button type="button" class="btn small" @click="startLesson(l.id, false)">{{ tl('学生视图') }}</button>
          <button type="button" class="btn small" @click="startLesson(l.id, true)">{{ tl('教师视图') }}</button>
        </li>
      </ul>

      <i class="tick-rule" aria-hidden="true" />
      <h2 class="section-title">{{ tl('教学活动') }}<span class="count num">{{ acts.length }}</span></h2>
      <ul class="list two">
        <li v-for="a in acts" :key="a.id"><button type="button" class="item" @click="openActivity(a.id)"><span class="t">{{ a.title }}<span class="badge lvl">{{ a.stage }}</span></span><span class="d clamp">{{ a.goal }}</span></button></li>
      </ul>

      <i class="tick-rule" aria-hidden="true" />
      <h2 class="section-title">{{ tl('本机的预测统计') }}<button v-if="tally.history.length" type="button" class="btn ghost small more" @click="clearTallyHistory">{{ tl('清空') }}</button></h2>
      <p v-if="!tally.history.length" class="none small">{{ tl('还没有统计。只记各选项的人数，不记录任何学生。') }}</p>
      <ul v-else class="list history">
        <li v-for="(r, i) in tally.history" :key="r.at + i" class="hrow">
          <span class="num tiny when">{{ fmtDate(r.at) }}</span>
          <span class="hq">{{ r.question }}</span>
          <span class="num small counts">{{ r.rounds.map(c => c.join(' / ')).join('  →  ') }}</span>
          <span v-if="share(r, 0) !== null" class="badge" :class="{ ok: share(r, r.rounds.length - 1)! >= 70 }">{{ r.rounds.map((_, k) => `${share(r, k)}%`).join(' → ') }}</span>
          <button type="button" class="btn icon ghost" :title="tl('复制结果')" :aria-label="tl('复制结果')" @click="copyRecord(i)"><Icon name="copy" :size="14" /></button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.classroom { display: block; height: 100%; overflow: auto; overscroll-behavior: contain; }
.inner { max-width: 1040px; margin: 0 auto; padding: var(--space-6) var(--space-6) var(--space-12); }
.head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); flex-wrap: wrap; margin-bottom: var(--space-5); }
.tools { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.proj { display: inline-flex; align-items: center; gap: var(--space-2); min-height: var(--control-h); cursor: pointer; font-weight: var(--weight-medium); }
.section-title { margin: var(--space-3) 0 var(--space-2); }
.count { font-size: var(--type-small); font-weight: var(--weight-medium); color: var(--text-3); }
.list { list-style: none; margin: 0 0 var(--space-6); padding: 0; }
.list.two { columns: 2 340px; column-gap: var(--space-8); }
.list > li { break-inside: avoid; border-bottom: 1px solid var(--separator); }
.item { display: flex; flex-direction: column; gap: 2px; width: 100%; padding: var(--space-2) var(--space-2); margin: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; border-radius: var(--radius-row); transition: background var(--dur-fast) ease; }
.item:hover { background: var(--hover); }
.item:active { background: var(--fill); }
.t { font-weight: var(--weight-strong); display: flex; align-items: center; gap: var(--space-2); }
.d { font-size: var(--type-small); color: var(--text-2); line-height: 1.45; }
.clamp { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.lvl { margin-left: auto; flex: 0 0 auto; }
.lesson { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2); }
.lesson .text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.mins { flex: 0 0 auto; font-size: var(--type-small); color: var(--text-2); margin-right: var(--space-2); }
.none { margin: 0 0 var(--space-6); color: var(--text-2); }
.hrow { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-1) var(--space-2); }
.hq { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.when { flex: 0 0 auto; color: var(--text-3); }
.counts { flex: 0 0 auto; color: var(--text-2); }
@media (max-width: 900px) { .inner { padding: var(--space-4) var(--space-3) var(--space-8); } .counts, .mins { display: none; } .lesson { flex-wrap: wrap; } .lesson .text { flex: 1 1 100%; } }
</style>
