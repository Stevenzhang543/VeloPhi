<script setup lang="ts">
/**
 * 26.52 problem gallery (D40 revised): the 30 built-in problems by textbook chapter, importing a problem file and
 * writing a new problem for the current scene. Opening a problem enters problem mode (problemMode.ts).
 *
 * Mounted by App.vue while `state.showProblems` is true.
 */
import { tl, activeLang } from '../../i18n'
import { computed, ref } from 'vue'
import { state } from '../store'
import { CHAPTERS, problemParams, ptext } from '../../teaching/problems'
import type { BuiltinProblem } from '../../teaching/problemBank'
import { BUILTIN_PROBLEMS, builtinProblem } from '../../teaching/problemBank'
import { importProblem, newProblemFromScene, openBuiltin } from '../problemMode'
import Icon from './Icon.vue'

const lang = computed(() => activeLang())
const chapter = ref<string>('all')
const query = ref('')
// Stem parameters of each problem (its scene built once)
const PARAMS = new Map(BUILTIN_PROBLEMS.map(p => [p.id, problemParams(builtinProblem(p))]))
const stemOf = (p: BuiltinProblem) => ptext(p.stem, lang.value, PARAMS.get(p.id))
const list = computed(() => {
  const q = query.value.trim().toLowerCase()
  return BUILTIN_PROBLEMS.filter(p => (chapter.value === 'all' || p.chapter === chapter.value)
    && (!q || `${ptext(p.title, lang.value)} ${stemOf(p)}`.toLowerCase().includes(q)))
})
const count = (id: string) => BUILTIN_PROBLEMS.filter(p => p.chapter === id).length
const chapterLabel = (id: string) => CHAPTERS.find(c => c.id === id)?.label[lang.value] ?? id
function close() { state.showProblems = false }
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="close">
    <div class="dialog problems" role="dialog" :aria-label="tl('题目')">
      <div class="dialog-header"><Icon name="problem" :size="18" />{{ tl('题目') }}<span class="spacer" /><button class="btn icon ghost" :title="tl('关闭')" @click="close"><Icon name="close" /></button></div>
      <div class="dialog-body body">
        <nav>
          <input v-model="query" class="field search" :placeholder="tl('搜索题目…')" :aria-label="tl('搜索题目')" />
          <button class="nav-item" :class="{ on: chapter === 'all' }" @click="chapter = 'all'">{{ tl('全部') }}<span class="n">{{ BUILTIN_PROBLEMS.length }}</span></button>
          <button v-for="c in CHAPTERS" :key="c.id" class="nav-item" :class="{ on: chapter === c.id }" @click="chapter = c.id">{{ c.label[lang] }}<span class="n">{{ count(c.id) }}</span></button>
          <div class="sep" />
          <button class="nav-item action" @click="importProblem"><Icon name="open" :size="14" />{{ tl('导入题目包…') }}</button>
          <button class="nav-item action" @click="newProblemFromScene"><Icon name="pen" :size="14" />{{ tl('用当前场景出题') }}</button>
        </nav>
        <section class="grid">
          <div v-if="!list.length" class="empty">{{ tl('没有匹配的题目。') }}</div>
          <button v-for="p in list" :key="p.id" class="card" @click="openBuiltin(p)">
            <span class="card-top"><span class="chip">{{ chapterLabel(p.chapter) }}</span><span class="tiny muted">{{ tl('{0} 问', [p.questions.length]) }}</span></span>
            <span class="card-title">{{ ptext(p.title, lang) }}</span>
            <span class="card-stem small">{{ stemOf(p) }}</span>
          </button>
        </section>
      </div>
      <div class="dialog-footer">
        <span class="tiny muted">{{ tl('答案由仿真得出，题目参数可以“换一组数据”；题目包为 .velophi-problem.json，可在“题目”面板中编辑后导出。') }}</span>
        <span class="spacer" />
        <button class="btn" @click="close">{{ tl('关闭') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.problems { width: min(1080px, calc(100vw - 48px)); }
.body { display: grid; grid-template-columns: 210px minmax(0, 1fr); gap: 14px; min-height: 0; height: min(620px, calc(100vh - 220px)); }
nav { display: flex; flex-direction: column; gap: 2px; overflow-y: auto; }
.search { margin-bottom: 6px; }
.nav-item { display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border: 0; background: transparent; border-radius: 8px; cursor: pointer; font-size: var(--type-small); color: var(--text-2); text-align: left; transition: background 140ms ease, color 140ms ease; }
.nav-item:hover { background: var(--hover); color: var(--text); }
.nav-item.on { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.nav-item .n { margin-left: auto; font-size: 11px; color: var(--text-3); }
.nav-item.action { color: var(--text); }
.sep { height: 1px; background: var(--separator); margin: 6px 4px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; overflow-y: auto; align-content: start; padding: 2px; }
.card { display: flex; flex-direction: column; gap: 5px; text-align: left; padding: 11px 12px; border-radius: 12px; border: 1px solid var(--separator); background: var(--group); cursor: pointer; transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease; color: inherit; font: inherit; }
.card:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--accent) 45%, var(--separator)); box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08); }
.card:active { transform: translateY(0) scale(0.99); }
.card-top { display: flex; align-items: center; justify-content: space-between; }
.chip { font-size: 10.5px; font-weight: 600; color: var(--accent); background: var(--accent-soft); border-radius: var(--radius-pill); padding: 1px 8px; }
.card-title { font-weight: 650; font-size: 14px; }
.card-stem { color: var(--text-2); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
@media (prefers-reduced-motion: reduce) { .card { transition: none; } .card:hover { transform: none; } }
@media (max-width: 760px) { .body { grid-template-columns: 1fr; height: auto; } }
</style>
