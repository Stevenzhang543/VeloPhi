<script setup lang="ts">
/**
 * Global search (26.55, D96; Ctrl+K / ⌘K): one box over the tools, templates, experiments and circuit presets,
 * formulas, handbook topics and concept pages, built-in problems, learning-path units, the pages and (26.56) the
 * model families and teaching activities; (26.57) goals — the task targets and the teaching packages. Results are
 * grouped by category; ↑ ↓ choose, Enter opens, Esc closes. The index is built once per language when the box
 * opens; a query is a scan of a few hundred short strings (well under the 50 ms of the manual).
 *
 * Mounted by App.vue while `state.showPalette` is true.
 */
import { foldSearch } from '../searchText'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { tl, activeLang } from '../../i18n'
import { state } from '../store'
import type { Page } from '../store'
import { settings } from '../settings'
import { ALL_TOOLS, pickTool } from '../tools'
import { TEMPLATES } from '../../templates'
import { LABS } from '../lab/catalog'
import { PRESETS } from '../lab/circuitPresets'
import { FORMULAS } from '../../formula/library'
import { TOPICS } from '../../handbook/topics'
import { CONCEPTS } from '../../handbook/concepts'
import { BUILTIN_PROBLEMS } from '../../teaching/problemBank'
import { CHAPTERS, ptext } from '../../teaching/problems'
import { openBuiltin } from '../problemMode'
import { openHandbook } from '../handbook'
import { PATHS } from '../learn/paths'
import { openLab, openTemplate, openTopic, openActivity } from '../learn/actions'
import { LESSONS } from '../../teaching/lessons/defs'
import { openLesson } from '../lessons'
import { MODELS } from '../../content/models'
import { ACTIVITIES } from '../../teaching/activities'
import { LEVEL_TEXT } from '../models/labels'
import Icon from './Icon.vue'
import { DOMAINS } from '../../task/vocab'
import { PACKAGES } from '../../content/packages'
import { openSample } from '../task/taskState'
import { CASES } from '../../teaching/cases'
import { newTally, openCase } from '../tally'
import { shell } from '../layout'

interface Item { cat: string; icon: string; title: string; detail: string; hay: string; run: () => unknown }

const CATS: Array<[string, string]> = [['goal', '目标'], ['page', '页面'], ['tool', '工具'], ['template', '模板'], ['lab', '实验'], ['model', '模型'], ['activity', '活动'], ['case', '易错概念'], ['formula', '公式'], ['handbook', '手册'], ['problem', '题目'], ['path', '学习路径']]
const catLabel = (c: string) => tl(CATS.find(x => x[0] === c)?.[1] ?? c)

// 26.59 (UX12): full/half width and every dash folded the same way
const norm = (s: string) => foldSearch(s)
/** Strip KaTeX commands and braces from a formula for searching (\\dfrac{mv}{qB} → mv qB). */
const plainTex = (s: string) => s.replace(/\\[a-zA-Z]+/g, ' ').replace(/[{}^_\\]/g, ' ')

let cache: { lang: string; items: Item[] } | null = null
function buildIndex(): Item[] {
  const lang = activeLang()
  if (cache && cache.lang === lang) return cache.items
  const T = (t: { zh: string; en: string; de: string }) => t[lang] ?? t.zh
  const items: Item[] = []
  const add = (cat: string, icon: string, title: string, detail: string, extra: string, run: () => unknown) => items.push({ cat, icon, title, detail, hay: norm(`${title} ${detail} ${extra}`), run })
  const go = (p: Page) => () => { state.page = p }
  add('page', 'home', tl('首页'), tl('开始：搜索、继续上次的场景、按身份进入'), 'home start 1', go('home'))
  add('page', 'studio', tl('工作台'), tl('编辑与仿真'), 'studio 2', go('studio'))
  add('page', 'flask', tl('实验室'), tl('电路、光学、热学、原子与量子实验'), 'lab 3', go('lab'))
  add('page', 'library', tl('资源库'), tl('模板、题目、易错概念、模型目录、课程对照、学习手册'), 'library 4', go('library'))
  add('page', 'classroom', tl('课堂'), tl('课堂实验、教学活动、预测统计与教师工具'), 'classroom teach 5', go('classroom'))
  add('page', 'monitor', tl('渲染与监视'), tl('大画面播放与读数'), 'monitor 6', go('monitor'))
  add('page', 'settings', tl('设置'), tl('单位、外观、AI 与快捷键'), 'settings', go('settings'))
  // 26.63 (D233–D237)
  add('page', 'target', tl('易错概念'), tl('先猜结果，再看仿真怎么说'), 'misconception cases predict', () => { state.librarySection = 'cases'; state.page = 'library' })
  add('page', 'tally', tl('先猜后看：班级预测统计'), tl('举手计票，锁定后运行，揭晓后可以讨论再投一次'), 'tally vote predict class', () => { newTally(); state.page = 'studio' })
  add('page', 'converge', tl('收敛性研究'), tl('步长减半，看误差按几阶减小'), 'convergence order step', () => { state.page = 'studio'; shell.convergence = true })
  add('page', 'share', tl('分享链接'), tl('场景写在链接里，不上传'), 'share link url', () => { state.page = 'studio'; shell.share = true })
  add('page', 'keyboard', tl('快捷键一览'), tl('全部键盘与鼠标操作'), 'shortcuts keys ?', () => { shell.shortcuts = true })
  for (const c of CASES) add('case', 'target', T(c.title), T(c.belief), c.id, () => openCase(c.id))
  add('page', 'book', tl('学习手册'), tl('原理、公式推导与例题'), 'handbook', () => openHandbook(null))
  add('page', 'graduation', tl('学习路径'), tl('按课程标准顺序的模板、实验、题目与手册'), 'path learn', () => { state.showLearning = true })
  // 26.58 (D136, D138): the solver comparison and the welcome page with its tour
  add('page', 'layers', tl('求解器对照'), tl('精确求解器与实时多体求解器算同一场景，看差多少'), 'solver compare softstep exact', () => { state.page = 'studio'; state.showSolverCompare = true })
  add('page', 'info', tl('欢迎与导览'), tl('三个入口与 60 秒导览'), 'welcome tour onboarding', () => { state.showWelcome = true })
  for (const t of ALL_TOOLS) add('tool', t.icon, t.label, t.tip, `${t.key ?? ''} ${t.tool}`, () => { state.page = 'studio'; pickTool(t.tool) })
  for (const t of TEMPLATES) add('template', 'template', t.name, t.description, `${t.group} ${t.id}`, () => openTemplate(t.id))
  for (const l of LABS) add('lab', l.icon, l.title, l.summary, l.id, () => openLab(l.id))
  for (const [id, pr] of Object.entries(PRESETS)) add('lab', 'battery', `${tl('电路')} · ${pr.label}`, tl('电路实验的预设'), id, () => openLab('circuit', id))
  for (const f of FORMULAS) add('formula', 'phi', f.title, plainTex(f.latex), `${f.id} ${f.situation} ${f.note ?? ''} ${f.method ?? ''}`, () => openHandbook(f.id))
  for (const t of TOPICS) add('handbook', t.icon, T(t.title), tl('学习手册的主题'), t.id, () => openTopic(t.id))
  for (const c of CONCEPTS) add('handbook', c.icon, T(c.title), tl('学习手册的概念页'), `${c.id} ${c.sections.map(s => T(s.heading)).join(' ')}`, () => openTopic(`concept:${c.id}`))
  // 26.56 (D105): the model families (with their maturity) and the teaching activities
  add('page', 'layers', tl('模型目录'), tl('{0} 个模型族：条件、分支、常数与核验', [MODELS.length]), 'models catalogue', () => { state.showModels = true })
  // 26.62 (D222): the curriculum map (283 topics, 310 components, the syllabus index and the 21 required experiments)
  add('page', 'graduation', tl('课程对照'), tl('从初中到大学的知识点、组件与课程章节对照'), 'curriculum syllabus igcse ib dp myp 9702 university topics components', () => { state.showCurriculum = true })
  for (const m of MODELS) add('model', 'layers', `${m.id} ${T(m.title)}`, LEVEL_TEXT[m.level], `${m.title.zh} ${m.title.en} ${m.title.de}`, () => { state.modelId = m.id; state.showModels = true })
  for (const a of ACTIVITIES) add('activity', 'graduation', T(a.title), a.models.join(' '), `${a.id} ${a.title.zh} ${a.title.en}`, () => openActivity(a.id))
  // 26.61 (B): the classroom experiments (scene, evidence, teacher view)
  for (const l of LESSONS) add('activity', 'graduation', tl('课堂实验：{0}', [T(l.title)]), T(l.goal), `${l.id} ${l.activity} lesson classroom ${tl('课堂实验')} ${l.title.zh} ${l.title.en} ${l.title.de}`, () => openLesson(l.id))
  for (const p of BUILTIN_PROBLEMS) add('problem', 'problem', ptext(p.title, lang), CHAPTERS.find(c => c.id === p.chapter)?.label[lang] ?? p.chapter, p.id, () => openBuiltin(p))
  for (const s of PATHS) for (const u of s.units) add('path', 'graduation', u.title, s.title, `${s.id} ${u.id}`, () => { settings.ui.learnStage = s.id; state.showLearning = true })
  // 26.57 (D122, T26): search by what is asked — the targets of the six task kinds and the goal words of the teaching
  // packages (“射程”, “摩擦力”, “第一次到达” …), not only by model or template names
  add('goal', 'problem', tl('解一道题：粘贴题目文字'), tl('读出已知量、求解目标与条件；缺少的信息会先问你'), 'task solve paste', () => { state.page = 'studio'; state.rightTab = 'task' })
  for (const d of Object.values(DOMAINS)) for (const t of d.targets) add('goal', 'problem', tl('求{0}', [tl(t.label)]), tl('任务：{0}', [tl(d.label)]), `${d.id} ${t.key} ${t.label} ${d.label} ${t.words.join(' ')} ${t.words.map(w => tl(w)).join(' ')}`, () => { openSample(d.id); state.page = 'studio'; state.rightTab = 'task' })
  for (const p of PACKAGES) add('goal', 'layers', tl('教学包：{0}', [tl(p.title)]), p.goals.map(g => tl(g)).join(tl('、')), `${p.id} ${p.goals.join(' ')} ${p.concept} ${p.system}`, () => { state.modelId = p.id; state.showModels = true })
  cache = { lang, items }
  return items
}

const query = ref('')
const input = ref<HTMLInputElement | null>(null)
const active = ref(0)
const index = buildIndex()
const searchMs = ref(0)

/** Matches: every word of the query in the item; titles that start with the query first, then title hits. */
const results = computed(() => {
  const t0 = performance.now()
  const words = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean).map(norm)
  const out: Array<{ cat: string; items: Item[] }> = []
  if (words.length) {
    const scored: Array<[number, Item]> = []
    for (const it of index) {
      if (!words.every(w => it.hay.includes(w))) continue
      const tn = norm(it.title)
      scored.push([tn.startsWith(words[0]) ? 0 : tn.includes(words[0]) ? 1 : 2, it])
    }
    for (const [cat] of CATS) {
      const list = scored.filter(([, it]) => it.cat === cat).sort((a, b) => a[0] - b[0]).slice(0, 8).map(([, it]) => it)
      if (list.length) out.push({ cat, items: list })
    }
  } else {
    out.push({ cat: 'page', items: index.filter(it => it.cat === 'page') })
  }
  searchMs.value = performance.now() - t0
  return out
})
const flat = computed(() => results.value.flatMap(g => g.items))
watch(query, () => { active.value = 0 })

function close() { state.showPalette = false }
function run(it: Item) { close(); void it.run() }
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.preventDefault(); close(); return }
  if (e.key === 'ArrowDown') { e.preventDefault(); active.value = Math.min(flat.value.length - 1, active.value + 1); scrollActive(); return }
  if (e.key === 'ArrowUp') { e.preventDefault(); active.value = Math.max(0, active.value - 1); scrollActive(); return }
  if (e.key === 'Enter') { e.preventDefault(); const it = flat.value[active.value]; if (it) run(it) }
}
async function scrollActive() { await nextTick(); document.querySelector('.palette .row.on')?.scrollIntoView({ block: 'nearest' }) }
onMounted(() => input.value?.focus())
</script>

<template>
  <div class="dialog-backdrop palette-back" @mousedown.self="close">
    <div class="palette" role="dialog" :aria-label="tl('全局搜索')">
      <div class="head">
        <Icon name="search" :size="16" />
        <input ref="input" v-model="query" class="q" :placeholder="tl('搜索工具、模板、实验、公式、手册、题目…')" :aria-label="tl('全局搜索')" role="combobox" aria-expanded="true" aria-controls="palette-list" :aria-activedescendant="flat.length ? `pal-${active}` : undefined" @keydown="onKey" />
        <kbd class="tiny">Esc</kbd>
      </div>
      <div id="palette-list" class="list" role="listbox">
        <div v-if="query.trim() && !flat.length" class="empty small muted">{{ tl('没有找到“{0}”。', [query.trim()]) }}</div>
        <template v-for="g in results" :key="g.cat">
          <div class="cat tiny muted">{{ catLabel(g.cat) }}</div>
          <button v-for="it in g.items" :id="`pal-${flat.indexOf(it)}`" :key="g.cat + it.title + it.detail" class="row" :class="{ on: flat.indexOf(it) === active }" role="option" :aria-selected="flat.indexOf(it) === active" @mousemove="active = flat.indexOf(it)" @click="run(it)">
            <Icon :name="it.icon" :size="15" />
            <span class="title">{{ it.title }}</span>
            <span class="detail tiny muted">{{ it.detail }}</span>
          </button>
        </template>
      </div>
      <div class="foot tiny muted">
        <span>{{ tl('↑ ↓ 选择 · Enter 打开') }}</span>
        <span class="spacer" />
        <span v-if="query.trim()">{{ tl('{0} 条结果，{1} ms', [flat.length, searchMs.toFixed(1)]) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.palette-back { align-items: flex-start; padding-top: 12vh; }
.palette { width: min(640px, 94vw); background: var(--panel, var(--bg)); border-radius: 14px; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28); overflow: hidden; display: flex; flex-direction: column; max-height: 70vh; border: 1px solid var(--separator); }
.head { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--separator); color: var(--text-2); }
.q { flex: 1; border: 0; outline: none; background: transparent; font: inherit; font-size: calc(16px * var(--zoom, 1)); color: var(--text); }
kbd { border: 1px solid var(--separator); border-radius: 5px; padding: 1px 5px; color: var(--text-2); }
.list { overflow: auto; padding: 4px 6px 8px; }
.cat { padding: 8px 8px 3px; font-weight: 600; }
.row { display: flex; align-items: center; gap: 10px; width: 100%; border: 0; background: transparent; border-radius: 8px; padding: 6px 8px; cursor: pointer; text-align: left; color: var(--text); font: inherit; min-width: 0; }
.row.on { background: var(--accent-soft); }
.row.on .title { color: var(--accent); }
.title { flex: 0 1 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 55%; }
.detail { flex: 1 1 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: right; }
.empty { padding: 16px 10px; }
.foot { display: flex; gap: 8px; padding: 7px 14px; border-top: 1px solid var(--separator); }
.spacer { flex: 1; }
</style>
