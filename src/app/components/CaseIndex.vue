<script setup lang="ts">
/**
 * Misconception index (26.63, D234): the illuminating cases by topic. Each card says what many students think; opening
 * it loads the scene and — "先猜后看" — the class tally with its question, or just the scene with the explanation.
 */
import { computed, ref } from 'vue'
import { tl } from '../../i18n'
import { CASES, CASE_TOPICS } from '../../teaching/cases'
import type { CaseTopic } from '../../teaching/cases'
import { openCase } from '../tally'
import { T3 } from '../models/labels'
import Icon from './Icon.vue'

const topic = ref<CaseTopic | 'all'>('all')
const q = ref('')
const shown = computed(() => {
  const needle = q.value.trim().toLowerCase()
  return CASES.filter(c => (topic.value === 'all' || c.topic === topic.value) && (!needle || `${T3(c.title)} ${T3(c.belief)} ${T3(c.physics)}`.toLowerCase().includes(needle)))
})
const open = ref<string | null>(null)
</script>

<template>
  <div class="cases">
    <header class="head">
      <div>
        <h2 class="page-title">{{ tl('易错概念') }}</h2>
        <p class="page-sub">{{ tl('每个案例从一个常见的想法出发：先让学生预测，再运行仿真，用结果和受力、曲线来讨论。') }}</p>
      </div>
      <input v-model="q" class="field find" type="search" :placeholder="tl('搜索案例…')" :aria-label="tl('搜索案例')" />
    </header>
    <div class="chips" role="tablist" :aria-label="tl('主题')">
      <button type="button" class="chip" role="tab" :class="{ on: topic === 'all' }" :aria-selected="topic === 'all'" @click="topic = 'all'">{{ tl('全部') }}</button>
      <button v-for="t in CASE_TOPICS" :key="t.id" type="button" class="chip" role="tab" :class="{ on: topic === t.id }" :aria-selected="topic === t.id" @click="topic = t.id">{{ T3(t.label) }}</button>
    </div>
    <div class="grid-cards wide list">
      <article v-for="c in shown" :key="c.id" class="card case" :data-ui="c.id">
        <h3 class="card-title">{{ T3(c.title) }}</h3>
        <p class="belief"><span class="tag">{{ tl('常见想法') }}</span>{{ T3(c.belief) }}</p>
        <div v-if="open === c.id" class="more">
          <p><span class="tag ok">{{ tl('物理') }}</span>{{ T3(c.physics) }}</p>
          <p class="small muted"><Icon name="eye" :size="13" />{{ T3(c.watch) }}</p>
        </div>
        <div class="acts">
          <button type="button" class="btn primary small" @click="openCase(c.id, true)"><Icon name="tally" :size="13" />{{ tl('先猜后看') }}</button>
          <button type="button" class="btn small" @click="openCase(c.id, false)"><Icon name="run" :size="13" />{{ tl('直接打开') }}</button>
          <span class="spacer" />
          <button type="button" class="btn ghost small" :aria-expanded="open === c.id" @click="open = open === c.id ? null : c.id">{{ open === c.id ? tl('收起解释') : tl('看解释') }}</button>
        </div>
      </article>
      <div v-if="!shown.length" class="empty-state"><span class="card-ico"><Icon name="search" :size="20" /></span>{{ tl('没有匹配的案例') }}</div>
    </div>
  </div>
</template>

<style scoped>
.cases { padding: 18px 22px 32px; max-width: 1120px; margin: 0 auto; }
.head { display: flex; align-items: flex-end; gap: 16px; }
.head > div { flex: 1; min-width: 0; }
.page-title { font-size: calc(21px * var(--zoom)); }
.find { width: 220px; flex: 0 0 auto; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; margin: 14px 0 12px; }
.case { display: flex; flex-direction: column; gap: 8px; }
.case h3 { margin: 0; font-size: var(--type-body); }
.belief, .more p { margin: 0; line-height: 1.55; color: var(--text-2); font-size: var(--type-small); }
.more { display: flex; flex-direction: column; gap: 6px; }
.more p.small { display: flex; gap: 6px; align-items: baseline; }
.tag { display: inline-block; margin-right: 6px; padding: 0 6px; border-radius: 5px; background: var(--warning-soft); color: var(--warning); font-size: var(--type-tiny); font-weight: 650; }
.tag.ok { background: var(--success-soft); color: var(--success); }
.acts { display: flex; align-items: center; gap: 6px; margin-top: auto; padding-top: 2px; flex-wrap: wrap; }
@media (max-width: 760px) { .cases { padding: 12px 10px 24px; } .head { flex-direction: column; align-items: stretch; } .find { width: auto; } }
</style>
