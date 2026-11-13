<script setup lang="ts">
/**
 * Classroom page (26.63, D235): what a teacher runs in front of a class — "predict first" cases with the class tally,
 * the classroom experiments (flows of 10–15 minutes with a teacher view), the teaching activities, and the tools for
 * the projector and for handing material out. The tallies of this computer are listed at the bottom.
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
function projector() { settings.projector = !settings.projector; showToast(settings.projector ? tl('已打开课堂投影：字更大、对比更强') : tl('已关闭课堂投影')) }
async function copyRecord(i: number) { try { await navigator.clipboard.writeText(tallySummary(tally.history[i])); showToast(tl('统计结果已复制')) } catch { showToast(tl('无法写入剪贴板'), true) } }
const fmtDate = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
const share = (r: (typeof tally.history)[number], k: number) => { const n = totalOf(r.rounds[k]); return r.answer === null || !n ? null : Math.round((100 * r.rounds[k][r.answer]) / n) }
</script>

<template>
  <div class="page-shell classroom">
    <div class="page-scroll">
      <div class="page-inner">
        <h1 class="page-title">{{ tl('课堂') }}</h1>
        <p class="page-sub">{{ tl('为投影到大屏幕设计：不需要学生设备。先提出问题让全班预测，再运行，再用证据讨论。') }}</p>

        <div class="tools">
          <button type="button" class="card hoverable tool" data-ui="classroom-tally" @click="freeTally">
            <span class="card-ico green"><Icon name="tally" :size="18" /></span>
            <span><span class="card-title">{{ tl('先猜后看：自己出题') }}</span><span class="card-text">{{ tl('对当前场景提一个问题，举手计票，锁定后运行，揭晓后可以讨论再投一次。') }}</span></span>
          </button>
          <button type="button" class="card hoverable tool" :class="{ on: settings.projector }" @click="projector">
            <span class="card-ico"><Icon name="monitor" :size="18" /></span>
            <span><span class="card-title">{{ settings.projector ? tl('课堂投影：已打开') : tl('课堂投影') }}</span><span class="card-text">{{ tl('字号放大、对比加强、关闭半透明，后排也看得清。') }}</span></span>
          </button>
          <button type="button" class="card hoverable tool" @click="state.page = 'studio'; shell.share = true">
            <span class="card-ico violet"><Icon name="share" :size="18" /></span>
            <span><span class="card-title">{{ tl('把场景发给学生') }}</span><span class="card-text">{{ tl('生成分享链接：场景就在链接里，网页版打开即可，不需要账号。') }}</span></span>
          </button>
        </div>

        <h2 class="section-title"><Icon name="target" :size="17" />{{ tl('先猜后看的现成案例') }}<span class="tiny muted">{{ tl('每个案例对应一个常见的错误想法') }}</span><button type="button" class="btn ghost small more" @click="state.librarySection = 'cases'; state.page = 'library'">{{ tl('易错概念索引') }}<Icon name="arrowRight" :size="13" /></button></h2>
        <div class="grid-cards wide">
          <button v-for="c in CASES" :key="c.id" type="button" class="card" @click="openCase(c.id, true)">
            <span class="card-title">{{ T3(c.title) }}</span>
            <span class="card-text">{{ T3(c.question) }}</span>
          </button>
        </div>

        <h2 class="section-title"><Icon name="classroom" :size="17" />{{ tl('课堂实验') }}<span class="tiny muted">{{ tl('看现象 → 预测 → 改一个变量 → 看指定时刻 → 用证据解释 → 迁移') }}</span></h2>
        <div class="grid-cards wide">
          <article v-for="l in LESSONS" :key="l.id" class="card lesson">
            <h3 class="card-title">{{ T3(l.title) }}</h3>
            <p class="card-text">{{ T3(l.goal) }}</p>
            <div class="acts">
              <span class="badge">{{ tl('{0} 分钟', [l.teacher.minutes]) }}</span><span class="spacer" />
              <button type="button" class="btn small" @click="startLesson(l.id, false)">{{ tl('学生视图') }}</button>
              <button type="button" class="btn primary small" @click="startLesson(l.id, true)">{{ tl('教师视图') }}</button>
            </div>
          </article>
        </div>

        <h2 class="section-title"><Icon name="graduation" :size="17" />{{ tl('教学活动') }}<span class="tiny muted">{{ tl('诊断 → 预测 → 实验 → 解释 → 迁移，按模型核对') }}</span></h2>
        <div class="grid-cards">
          <button v-for="a in acts" :key="a.id" type="button" class="card act" @click="openActivity(a.id)">
            <span class="card-title">{{ a.title }}</span>
            <span class="card-text clamp">{{ a.goal }}</span>
            <span class="badge lvl">{{ a.stage }}</span>
          </button>
        </div>

        <h2 class="section-title"><Icon name="report" :size="17" />{{ tl('本机的预测统计') }}<button v-if="tally.history.length" type="button" class="btn ghost small more" @click="clearTallyHistory">{{ tl('清空') }}</button></h2>
        <div v-if="!tally.history.length" class="card empty-note small muted">{{ tl('还没有统计。做过一次“先猜后看”，结果会列在这里（只有各选项的人数，不记录任何学生）。') }}</div>
        <div v-else class="history card">
          <div v-for="(r, i) in tally.history" :key="r.at + i" class="hrow">
            <span class="mono tiny muted when">{{ fmtDate(r.at) }}</span>
            <span class="hq">{{ r.question }}</span>
            <span class="mono small counts">{{ r.rounds.map(c => c.join(' / ')).join('  →  ') }}</span>
            <span v-if="share(r, 0) !== null" class="badge" :class="{ ok: share(r, r.rounds.length - 1)! >= 70 }">{{ r.rounds.map((_, k) => `${share(r, k)}%`).join(' → ') }}</span>
            <button type="button" class="btn icon ghost" :title="tl('复制结果')" :aria-label="tl('复制结果')" @click="copyRecord(i)"><Icon name="copy" :size="14" /></button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tools { margin-top: 18px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.tool { flex-direction: row !important; gap: 12px; align-items: flex-start !important; }
.tool.on { box-shadow: var(--elev-1), inset 0 0 0 1.5px var(--accent); }
.section-title .tiny { font-weight: 400; }
.lesson { display: flex; flex-direction: column; gap: 6px; }
.lesson h3 { margin: 0; }
.lesson .card-text { margin: 0; }
.acts { display: flex; align-items: center; gap: 6px; margin-top: auto; padding-top: 6px; }
.act { position: relative; padding-right: 54px; }
.lvl { position: absolute; top: 12px; right: 12px; }
.clamp { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.empty-note { padding: 16px; }
.history { padding: 4px 12px; }
.hrow { display: flex; align-items: center; gap: 12px; padding: 7px 0; }
.hrow + .hrow { border-top: 1px solid var(--separator); }
.hq { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.when { flex: 0 0 auto; }
.counts { flex: 0 0 auto; color: var(--text-2); }
@media (max-width: 900px) { .tools { grid-template-columns: 1fr; } .counts { display: none; } }
</style>
