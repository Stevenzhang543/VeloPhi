<script setup lang="ts">
/**
 * Help › 入门 and Help › 新变化 (26.64, D249, D250). Two standing lists, opened by the user — neither opens by itself:
 *   入门     the checklist of the five segments: which are done, where an unfinished one stands, about how long each
 *            takes; any segment can be started, taken up again or walked again from here
 *   新变化   the changes by version; every entry has 带我去看, which shows the page and rings the control
 * The dialog closes when a walk starts: the walk happens in the interface itself.
 */
import { computed } from 'vue'
import { tl } from '../../i18n'
import { vDialog } from '../focusTrap'
import { state } from '../store'
import { beginNews, guideUi, showNews, startWalk } from '../onboarding/engine'
import { onboarding } from '../onboarding/state'
import type { SegmentId } from '../onboarding/state'
import { segmentList } from '../onboarding/steps'
import { allNews } from '../onboarding/news'
import Icon from './Icon.vue'

const close = () => { state.showWelcome = false }
const rows = computed(() => segmentList().map(s => {
  const r = onboarding.record.segments[s.id]
  return { ...s, done: r.done, at: !r.done && r.step > 0 ? Math.min(r.step, s.steps - 1) : 0 }
}))
const doneCount = computed(() => rows.value.filter(r => r.done).length)
const news = computed(() => allNews())
function walkSegment(id: SegmentId, restart: boolean) { close(); void startWalk(id, { restart }) }
function take(id: string, version: string) { close(); showNews(id, version) }
function walkNews() { close(); beginNews() }
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="close">
    <div v-dialog="close" class="dialog guide" role="dialog" :aria-label="tl('入门')" data-ui="guide">
      <div class="dialog-header">
        <div class="tabs" role="tablist">
          <button type="button" role="tab" :class="{ on: guideUi.tab === 'list' }" :aria-selected="guideUi.tab === 'list'" data-ui="guide-tab-list" @click="guideUi.tab = 'list'">{{ tl('入门') }}</button>
          <button type="button" role="tab" :class="{ on: guideUi.tab === 'news' }" :aria-selected="guideUi.tab === 'news'" data-ui="guide-tab-news" @click="guideUi.tab = 'news'">{{ tl('新变化') }}</button>
        </div>
        <span class="spacer" />
        <button type="button" class="btn icon ghost" :title="tl('关闭')" :aria-label="tl('关闭')" @click="close"><Icon name="close" /></button>
      </div>

      <div v-if="guideUi.tab === 'list'" class="dialog-body">
        <p class="lead small">{{ tl('五段走查，在真实的界面上做，用的是临时文档。已完成 {0}/5。', [doneCount]) }}</p>
        <ol class="segs" data-ui="guide-list">
          <li v-for="(r, i) in rows" :key="r.id" class="seg" :class="{ done: r.done }" :data-segment="r.id" :data-done="r.done">
            <span class="mark" :aria-label="r.done ? tl('已完成') : tl('未完成')"><Icon v-if="r.done" name="check" :size="15" /><span v-else class="num">{{ i }}</span></span>
            <span class="name">{{ r.title }}</span>
            <span class="info small num">{{ r.done ? tl('已完成') : r.at ? tl('第 {0}/{1} 步', [r.at + 1, r.steps]) : tl('约 {0} 分钟', [r.minutes]) }}</span>
            <button type="button" class="btn small" :data-ui="`guide-start-${r.id}`" @click="walkSegment(r.id, r.done)">{{ r.done ? tl('重走') : r.at ? tl('继续') : tl('开始') }}</button>
          </li>
        </ol>
      </div>

      <div v-else class="dialog-body">
        <section v-for="g in news" :key="g.version" class="ver" :data-version="g.version">
          <div class="vhead"><h3 class="num">{{ g.version }}</h3><span class="spacer" /><button type="button" class="btn small" data-ui="guide-news-walk" @click="walkNews">{{ tl('逐条看') }}</button></div>
          <ul class="news" data-ui="guide-news">
            <li v-for="n in g.items" :key="n.id" :data-news="n.id">
              <div class="ntext"><b>{{ n.title }}</b><span class="small">{{ n.text }}</span></div>
              <button type="button" class="btn small ghost" :data-ui="`guide-show-${n.id}`" @click="take(n.id, g.version)">{{ tl('带我去看') }}</button>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.guide { width: min(560px, calc(100vw - 24px)); }
.dialog-header .tabs { flex: 0 1 auto; min-width: calc(200px * var(--zoom)); font-weight: var(--weight-regular); }
.spacer { flex: 1; }
.lead { margin: 0 0 var(--space-3); color: var(--text-2); }
.segs, .news { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.seg { display: grid; grid-template-columns: 26px minmax(0, 1fr) auto auto; align-items: center; gap: var(--space-3); min-height: var(--control-lg); padding: var(--space-1) 0; }
.seg + .seg, .news li + li { box-shadow: 0 -1px 0 var(--separator); }
.mark { width: 24px; height: 24px; display: grid; place-items: center; border-radius: var(--radius-round); background: var(--fill); color: var(--text-2); font-size: var(--type-small); }
.seg.done .mark { background: var(--success-soft); color: var(--success); }
.name { font-weight: var(--weight-strong); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.info { color: var(--text-2); white-space: nowrap; }
.ver + .ver { margin-top: var(--space-4); }
.vhead { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-1); }
.vhead h3 { margin: 0; font-size: var(--type-subtitle); font-weight: var(--weight-title); }
.news li { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) 0; }
.ntext { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.ntext b { font-weight: var(--weight-strong); }
.ntext span { color: var(--text-2); line-height: 1.45; }
@media (max-width: 520px) { .seg { grid-template-columns: 26px minmax(0, 1fr) auto; } .info { display: none; } .news li { flex-direction: column; align-items: flex-start; gap: var(--space-1); } }
</style>
