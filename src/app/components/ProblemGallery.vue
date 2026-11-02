<script setup lang="ts">
/**
 * Problem gallery: the built-in problems by textbook chapter (26.52, D40), importing a problem file and writing a
 * new problem for the current scene. 26.59 (D171): 81 problems in 14 chapters, filters by model type, level and
 * school stage, search folded for width and dashes (UX12), and "我的题目" — problems saved on this computer (AI
 * readings and the teacher's own) with the same filters. Opening a problem enters problem mode (problemMode.ts).
 *
 * Mounted by App.vue while `state.showProblems` is true.
 */
import { vDialog } from '../focusTrap'
import { tl, activeLang } from '../../i18n'
import { computed, ref } from 'vue'
import { state, showToast } from '../store'
import { CHAPTERS, problemParams, ptext } from '../../teaching/problems'
import type { BuiltinProblem } from '../../teaching/problemBank'
import { BUILTIN_PROBLEMS, builtinProblem } from '../../teaching/problemBank'
import { META, LEVEL_LABEL, STAGE_LABEL } from '../../teaching/problemMeta'
import type { Level, Stage } from '../../teaching/problemMeta'
import { myProblems, getMyProblem, deleteMyProblem } from '../../teaching/myProblems'
import type { MyProblemMeta } from '../../teaching/myProblems'
import { importProblem, newProblemFromScene, openBuiltin, openProblem } from '../problemMode'
import { foldSearch } from '../searchText'
import { ask } from '../../platform/ask'
import Icon from './Icon.vue'

const lang = computed(() => activeLang())
const chapter = ref<string>('all')
const query = ref('')
const type = ref('')
const level = ref<Level | ''>('')
const stage = ref<Stage | ''>('')
// Stem parameters of each problem (its scene built once)
const PARAMS = new Map(BUILTIN_PROBLEMS.map(p => [p.id, problemParams(builtinProblem(p))]))
const stemOf = (p: BuiltinProblem) => ptext(p.stem, lang.value, PARAMS.get(p.id))
const TYPES = [...new Set(BUILTIN_PROBLEMS.flatMap(p => META[p.id]?.types ?? []))]
const LEVELS: Level[] = ['basic', 'advanced', 'hard']
const STAGES: Stage[] = ['junior', 'senior', 'university']
const matchesCats = (types: string[], lv: string, st: string) => (!type.value || types.includes(type.value)) && (!level.value || lv === level.value) && (!stage.value || st === stage.value)
const list = computed(() => {
  const q = foldSearch(query.value)
  return BUILTIN_PROBLEMS.filter(p => (chapter.value === 'all' || p.chapter === chapter.value)
    && matchesCats(META[p.id]?.types ?? [], META[p.id]?.level ?? '', META[p.id]?.stage ?? '')
    && (!q || foldSearch(`${ptext(p.title, lang.value)} ${stemOf(p)} ${(META[p.id]?.types ?? []).map(t => tl(t)).join(' ')}`).includes(q)))
})
const mine = computed(() => {
  const q = foldSearch(query.value)
  return myProblems.list.filter(m => matchesCats(m.types, m.level, m.stage) && (!q || foldSearch(`${m.title} ${m.types.map(t => tl(t)).join(' ')}`).includes(q)))
})
const count = (id: string) => BUILTIN_PROBLEMS.filter(p => p.chapter === id).length
const chapterLabel = (id: string) => CHAPTERS.find(c => c.id === id)?.label[lang.value] ?? id
const filtered = computed(() => !!(type.value || level.value || stage.value || query.value.trim()))
function clearFilters() { type.value = ''; level.value = ''; stage.value = ''; query.value = '' }
function close() { state.showProblems = false }
async function openMine(m: MyProblemMeta) {
  const p = getMyProblem(m.id)
  if (!p) { showToast(tl('无法读取这道题'), true); return }
  if (await openProblem(p)) close()
}
async function removeMine(m: MyProblemMeta) {
  if (!(await ask(tl('从“我的题目”中删除“{0}”？', [m.title])))) return
  deleteMyProblem(m.id)
}
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="close">
    <div v-dialog="close" class="dialog problems" role="dialog" :aria-label="tl('题目')">
      <div class="dialog-header"><Icon name="problem" :size="18" />{{ tl('题目') }}<span class="spacer" /><button class="btn icon ghost" :title="tl('关闭')" @click="close"><Icon name="close" /></button></div>
      <div class="dialog-body body">
        <nav :aria-label="tl('章节')">
          <input v-model="query" class="field search" :placeholder="tl('搜索标题、题干或题型…')" :aria-label="tl('搜索题目')" />
          <button class="nav-item" :class="{ on: chapter === 'all' }" @click="chapter = 'all'">{{ tl('全部') }}<span class="n">{{ BUILTIN_PROBLEMS.length }}</span></button>
          <button v-for="c in CHAPTERS" :key="c.id" class="nav-item" :class="{ on: chapter === c.id }" @click="chapter = c.id">{{ c.label[lang] }}<span class="n">{{ count(c.id) }}</span></button>
          <button class="nav-item" :class="{ on: chapter === 'mine' }" data-ui="my-problems" @click="chapter = 'mine'"><Icon name="user" :size="13" />{{ tl('我的题目') }}<span class="n">{{ myProblems.list.length }}</span></button>
          <div class="sep" />
          <button class="nav-item action" @click="importProblem"><Icon name="open" :size="14" />{{ tl('导入题目包…') }}</button>
          <button class="nav-item action" @click="newProblemFromScene"><Icon name="pen" :size="14" />{{ tl('用当前场景出题') }}</button>
        </nav>
        <div class="main">
          <div class="filters" role="group" :aria-label="tl('筛选')">
            <select v-model="type" class="field small" :aria-label="tl('题型')"><option value="">{{ tl('全部题型') }}</option><option v-for="t in TYPES" :key="t" :value="t">{{ tl(t) }}</option></select>
            <div class="seg" role="radiogroup" :aria-label="tl('难度')">
              <button type="button" role="radio" :aria-checked="!level" :class="{ on: !level }" @click="level = ''">{{ tl('全部难度') }}</button>
              <button v-for="l in LEVELS" :key="l" type="button" role="radio" :aria-checked="level === l" :class="{ on: level === l }" @click="level = level === l ? '' : l">{{ tl(LEVEL_LABEL[l]) }}</button>
            </div>
            <div class="seg" role="radiogroup" :aria-label="tl('学段')">
              <button type="button" role="radio" :aria-checked="!stage" :class="{ on: !stage }" @click="stage = ''">{{ tl('全部学段') }}</button>
              <button v-for="st in STAGES" :key="st" type="button" role="radio" :aria-checked="stage === st" :class="{ on: stage === st }" @click="stage = stage === st ? '' : st">{{ tl(STAGE_LABEL[st]) }}</button>
            </div>
            <button v-if="filtered" type="button" class="btn small ghost" @click="clearFilters">{{ tl('清除筛选') }}</button>
            <span class="spacer" /><span class="tiny muted" role="status">{{ tl('{0} 道', [chapter === 'mine' ? mine.length : list.length]) }}</span>
          </div>
          <section v-if="chapter !== 'mine'" class="grid">
            <div v-if="!list.length" class="empty">{{ tl('没有匹配的题目。') }} <button v-if="filtered" class="btn small" @click="clearFilters">{{ tl('清除筛选') }}</button></div>
            <button v-for="p in list" :key="p.id" class="card" @click="openBuiltin(p)">
              <span class="card-top"><span class="chip">{{ chapterLabel(p.chapter) }}</span><span class="tiny muted">{{ tl(LEVEL_LABEL[META[p.id]?.level ?? 'basic']) }} · {{ tl('{0} 问', [p.questions.length]) }}</span></span>
              <span class="card-title">{{ ptext(p.title, lang) }}</span>
              <span class="card-stem small">{{ stemOf(p) }}</span>
              <span class="tags"><span v-for="t in META[p.id]?.types ?? []" :key="t" class="tag">{{ tl(t) }}</span></span>
            </button>
          </section>
          <section v-else class="grid">
            <div v-if="!mine.length" class="empty">{{ myProblems.list.length ? tl('没有匹配的题目。') : tl('还没有保存的题目。用主界面上方的导入栏让 AI 读一道题，然后“保存到我的题目”；也可以在题目面板中保存。') }}</div>
            <div v-for="m in mine" :key="m.id" class="card mine">
              <button type="button" class="open" @click="openMine(m)">
                <span class="card-top"><span class="chip">{{ m.chapter ? chapterLabel(m.chapter) : tl('自编题') }}</span><span class="tiny muted">{{ m.level ? tl(LEVEL_LABEL[m.level as Level] ?? m.level) : '' }}</span></span>
                <span class="card-title">{{ m.title }}</span>
                <span class="tags"><span v-for="t in m.types" :key="t" class="tag">{{ tl(t) }}</span><span v-if="m.route" class="tag ai">AI</span></span>
              </button>
              <button type="button" class="btn icon ghost del" :title="tl('删除')" :aria-label="tl('删除 {0}', [m.title])" @click="removeMine(m)"><Icon name="trash" :size="13" /></button>
            </div>
          </section>
        </div>
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
.body { display: grid; grid-template-columns: 210px minmax(0, 1fr); gap: 14px; min-height: 0; height: min(640px, calc(100vh - 220px)); }
nav { display: flex; flex-direction: column; gap: 2px; overflow-y: auto; }
.search { margin-bottom: 6px; }
.nav-item { display: flex; align-items: center; gap: 6px; min-height: 30px; padding: 0 10px; border: 0; background: transparent; border-radius: 8px; cursor: pointer; font-size: var(--type-small); color: var(--text-2); text-align: left; transition: background 140ms ease, color 140ms ease; }
.nav-item:hover { background: var(--hover); color: var(--text); }
.nav-item.on { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.nav-item .n { margin-left: auto; font-size: 11px; color: var(--text-3); }
.nav-item.action { color: var(--text); }
.sep { height: 1px; background: var(--separator); margin: 6px 4px; }
.main { display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 10px; min-height: 0; }
.filters { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.filters .spacer { flex: 1; }
.seg { display: inline-flex; border: 1px solid var(--separator); border-radius: 999px; overflow: hidden; }
.seg button { border: 0; background: transparent; color: var(--text-2); font: inherit; font-size: var(--type-small); min-height: 26px; padding: 0 10px; cursor: pointer; transition: background 120ms ease; }
.seg button + button { border-left: 1px solid var(--separator); }
.seg button.on { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.seg button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: auto; }
.tag { font-size: 10.5px; color: var(--text-2); background: var(--fill); border-radius: var(--radius-pill); padding: 1px 7px; }
.tag.ai { color: var(--accent); background: var(--accent-soft); }
.card.mine { position: relative; padding: 0; cursor: default; }
.card.mine .open { display: flex; flex-direction: column; gap: 5px; text-align: left; padding: 11px 36px 11px 12px; border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; border-radius: 12px; min-height: 100%; }
.card.mine .del { position: absolute; top: 6px; right: 6px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; overflow-y: auto; align-content: start; padding: 2px; }
.card { display: flex; flex-direction: column; gap: 5px; text-align: left; padding: 11px 12px; border-radius: 12px; border: 1px solid var(--separator); background: var(--group); cursor: pointer; transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease; color: inherit; font: inherit; }
.card:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--accent) 45%, var(--separator)); box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08); }
.card:active { transform: translateY(0) scale(0.99); }
.card-top { display: flex; align-items: center; justify-content: space-between; }
.chip { font-size: 10.5px; font-weight: 600; color: var(--accent); background: var(--accent-soft); border-radius: var(--radius-pill); padding: 1px 8px; }
.card-title { font-weight: 650; font-size: 14px; }
.card-stem { color: var(--text-2); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
@media (prefers-reduced-motion: reduce) { .card { transition: none; } .card:hover { transform: none; } }
@media (max-width: 760px) { .body { grid-template-columns: 1fr; height: auto; } nav { flex-direction: row; flex-wrap: wrap; } .nav-item .n { margin-left: 4px; } }
</style>
