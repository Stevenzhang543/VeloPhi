<script setup lang="ts">
/**
 * Global search (26.55, D96; Ctrl+K / ⌘K): one box over the tools, templates, experiments and circuit presets,
 * formulas, handbook topics and concept pages, built-in problems, learning-path units and the pages. Results are
 * grouped by category; ↑ ↓ choose, Enter opens, Esc closes. The index is built once per language when the box
 * opens; a query is a scan of a few hundred short strings (well under the 50 ms of the manual).
 *
 * Mounted by App.vue while `state.showPalette` is true.
 */
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
import { openLab, openTemplate, openTopic } from '../learn/actions'
import Icon from './Icon.vue'

interface Item { cat: string; icon: string; title: string; detail: string; hay: string; run: () => unknown }

const CATS: Array<[string, string]> = [['page', '页面'], ['tool', '工具'], ['template', '模板'], ['lab', '实验'], ['formula', '公式'], ['handbook', '手册'], ['problem', '题目'], ['path', '学习路径']]
const catLabel = (c: string) => tl(CATS.find(x => x[0] === c)?.[1] ?? c)

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')
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
  add('page', 'studio', tl('工作台'), tl('编辑与仿真'), 'studio 1', go('studio'))
  add('page', 'flask', tl('实验室'), tl('电路、光学、热学、原子与量子实验'), 'lab 2', go('lab'))
  add('page', 'monitor', tl('渲染与监视'), tl('大画面播放与读数'), 'monitor 3', go('monitor'))
  add('page', 'settings', tl('设置'), tl('单位、外观、学习手册'), 'settings 4', go('settings'))
  add('page', 'book', tl('学习手册'), tl('原理、公式推导与例题'), 'handbook', () => openHandbook(null))
  add('page', 'graduation', tl('学习路径'), tl('按课程标准顺序的模板、实验、题目与手册'), 'path learn', () => { state.showLearning = true })
  for (const t of ALL_TOOLS) add('tool', t.icon, t.label, t.tip, `${t.key ?? ''} ${t.tool}`, () => { state.page = 'studio'; pickTool(t.tool) })
  for (const t of TEMPLATES) add('template', 'template', t.name, t.description, `${t.group} ${t.id}`, () => openTemplate(t.id))
  for (const l of LABS) add('lab', l.icon, l.title, l.summary, l.id, () => openLab(l.id))
  for (const [id, pr] of Object.entries(PRESETS)) add('lab', 'battery', `${tl('电路')} · ${pr.label}`, tl('电路实验的预设'), id, () => openLab('circuit', id))
  for (const f of FORMULAS) add('formula', 'phi', f.title, plainTex(f.latex), `${f.id} ${f.situation} ${f.note ?? ''} ${f.method ?? ''}`, () => openHandbook(f.id))
  for (const t of TOPICS) add('handbook', t.icon, T(t.title), tl('学习手册的主题'), t.id, () => openTopic(t.id))
  for (const c of CONCEPTS) add('handbook', c.icon, T(c.title), tl('学习手册的概念页'), `${c.id} ${c.sections.map(s => T(s.heading)).join(' ')}`, () => openTopic(`concept:${c.id}`))
  for (const p of BUILTIN_PROBLEMS) add('problem', 'problem', ptext(p.title, lang), CHAPTERS.find(c => c.id === p.chapter)?.label[lang] ?? p.chapter, p.id, () => openBuiltin(p))
  for (const s of PATHS) for (const u of s.units) add('path', 'graduation', u.title, s.title, `${s.id} ${u.id}`, () => { settings.ui.learnStage = s.id; state.showLearning = true })
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
