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
import { computed, nextTick, onMounted, ref, shallowRef, watch } from 'vue'
import { tl, activeLang } from '../../i18n'
import { state, showToast } from '../store'
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
import { openStudioMore, shell } from '../layout'
import { newScene, openScene } from '../files'
import { APPARATUS_COMMANDS, askBench } from './chem/commands'
import { askLab } from '../lab/commands'
import { ency, openElement, openSubstance, openTable } from '../../chem/ency/route'
import { openGuide, startWalk } from '../onboarding/engine'
import { segmentList } from '../onboarding/steps'

interface Item { cat: string; icon: string; title: string; detail: string; hay: string; run: () => unknown }

const CATS: Array<[string, string]> = [['goal', '目标'], ['page', '页面'], ['tool', '工具'], ['template', '模板'], ['lab', '实验'], ['model', '模型'], ['activity', '活动'], ['case', '易错概念'], ['formula', '公式'], ['handbook', '手册'], ['problem', '题目'], ['path', '学习路径'], ['matter', '元素与物质']]
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
  // 26.64 (D240): the five panels in rail order, the home page, the settings; then what the new shell moved
  // (src/app/inventoryMap.ts lists every move and the command here that reaches it)
  add('page', 'motion', tl('运动'), tl('力学场景的搭建、运行与分析'), 'studio workbench motion mechanics 1 ' + tl('工作台'), go('studio'))
  add('page', 'physicsLab', tl('物理实验'), tl('电与磁、光、波、热、近代物理'), 'lab physics 2 ' + tl('实验室'), go('lab'))
  add('page', 'chemLab', tl('化学实验'), tl('实验台、引导实验、元素与物质'), 'chem chemistry 3', go('chem'))
  add('page', 'library', tl('资源库'), tl('模板、题目、课堂、学习手册'), 'library 4', go('library'))
  add('page', 'monitor', tl('渲染与监视'), tl('大画面播放与读数'), 'monitor 5 watch', go('monitor'))
  add('page', 'home', tl('首页'), tl('标题与五个面板的入口'), 'home start 0', go('home'))
  add('page', 'settings', tl('设置'), tl('单位、外观、AI 与快捷键'), 'settings', go('settings'))
  add('page', 'classroom', tl('课堂'), tl('课堂实验、教学活动、预测统计'), 'classroom teach lessons tally history', () => { state.librarySection = 'classroom'; state.page = 'library' })
  add('page', 'elements', tl('元素与物质'), tl('资源库的分区'), 'matter elements substances periodic table', () => { state.librarySection = 'matter'; state.page = 'library' })
  add('page', 'problem', tl('题目库'), tl('按教材章节的内置题目'), 'problems exercises', () => { state.librarySection = 'problems'; state.page = 'library' })
  add('page', 'template', tl('模板库'), tl('从经典模型开始'), 'templates start', () => { state.librarySection = 'templates'; state.page = 'library' })
  // 26.64 (D271): the periodic table; the elements and substances themselves join the index once their data are loaded
  add('page', 'elements', tl('元素周期表'), tl('化学实验'), 'periodic table periodensystem elements chem', () => { openTable(); ency.open = true; state.page = 'chem' })
  // 26.64 (D268): the chemistry bench — its shelves and a new bench (the page acts on the request once it is shown)
  add('page', 'flask', tl('药品架'), tl('化学实验台'), 'chem reagents shelf chemicals', () => { askBench({ type: 'shelf' }); state.page = 'chem' })
  add('page', 'file', tl('新建实验台'), tl('化学实验台'), 'chem new bench', () => { askBench({ type: 'new' }); state.page = 'chem' })
  add('page', 'graduation', tl('引导实验'), tl('化学实验台'), 'chem guided experiments lab steps 40', () => { askBench({ type: 'guide' }); state.page = 'chem' })
  // 26.64 (D244): what the 物理实验 bar keeps in its popovers and its 更多 menu (the page acts on the request once shown)
  add('page', 'flask', tl('选择实验'), tl('物理实验'), 'lab physics experiments catalogue choose level', () => { askLab('catalogue'); state.page = 'lab' })
  add('page', 'info', tl('关于本实验'), tl('物理实验'), 'lab physics about summary models principle', () => { askLab('about'); state.page = 'lab' })
  add('page', 'export', tl('导出实验'), tl('物理实验'), 'lab physics export file', () => { askLab('export'); state.page = 'lab' })
  add('page', 'open', tl('导入实验'), tl('物理实验'), 'lab physics import file', () => { askLab('import'); state.page = 'lab' })
  add('page', 'undo', tl('重置实验'), tl('物理实验'), 'lab physics reset defaults', () => { askLab('reset'); state.page = 'lab' })
  for (const g of APPARATUS_COMMANDS) add('page', 'beaker', tl('仪器：{0}', [T(g)]), tl('化学实验台'), `chem apparatus ${g.group} ${g.zh} ${g.en} ${g.de}`, () => { askBench({ type: 'apparatus', group: g.group }); state.page = 'chem' })
  add('page', 'file', tl('新建场景'), tl('只有地面的空场景'), 'new scene file', () => newScene())
  add('page', 'open', tl('打开文件…'), tl('场景文件或题目文件'), 'open file', () => openScene())
  add('page', 'link', tl('从链接打开'), tl('粘贴 VeloΦ 分享链接'), 'open link share url paste', () => { shell.openLink = true })
  add('page', 'display', tl('课堂投影'), tl('字号放大、对比加强，后排也看得清'), 'projector projection classroom', () => { settings.projector = !settings.projector; showToast(settings.projector ? tl('已打开课堂投影：字更大、对比更强') : tl('已关闭课堂投影')) })
  add('page', 'sweep', tl('参数扫描'), tl('一个参数取一组值，批量计算'), 'sweep parameter batch', () => { state.page = 'studio'; state.showSweep = true })
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
  // 26.64 (D245): what the motion bar keeps one level down — 更多 at its groups, the object list, the sidebar
  add('page', 'eye', tl('视图'), tl('画面上显示哪些量、侧栏、深浅色'), 'view display overlays vectors more', () => openStudioMore('view'))
  add('page', 'graduation', tl('教学'), tl('受力图、纸带、班级统计、课堂投影'), 'teach teaching fbd tape more', () => openStudioMore('teach'))
  add('page', 'run', tl('计算'), tl('参数扫描、求解器对照、收敛性研究'), 'compute calculation sweep solver more', () => openStudioMore('compute'))
  add('page', 'list', tl('对象列表'), tl('场景里的物体与连接件'), 'objects list bodies', () => { state.page = 'studio'; shell.flyout = 'objects' })
  add('page', 'sidebar', tl('侧栏'), tl('展开或收起'), 'sidebar side panel', () => { state.page = 'studio'; shell.sideOpen = !shell.sideOpen })
  add('page', 'graduation', tl('入门'), tl('五段走查与完成情况'), 'welcome tour onboarding walkthrough guide start', () => openGuide('list'))
  add('page', 'list', tl('新变化'), tl('按版本列出，每条可以带你去看'), 'whats new changes release news', () => openGuide('news'))
  for (const s of segmentList()) add('page', 'graduation', tl('入门：{0}', [s.title]), tl('约 {0} 分钟', [s.minutes]), `walkthrough onboarding ${s.id}`, () => { void startWalk(s.id, { restart: true }) })
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
// 26.64 (D271): elements and substances — names in the three languages, symbols and formulas. Their data are not part
// of the start-up bundle: they are fetched when the search opens and join the results when they have arrived.
const matter = shallowRef<Item[]>([])
void Promise.all([import('../../chem/ency/store'), import('../../chem/ency/model')]).then(async ([store, model]) => {
  const data = await store.loadEncy()
  matter.value = model.searchItems(data.elements.elements, data.substances).map(s => ({
    cat: 'matter', icon: s.kind === 'element' ? 'atom' : 'flask', title: s.title, detail: s.detail, hay: norm(s.hay.join(' ')),
    run: () => { if (s.kind === 'element') openElement(s.id); else openSubstance(s.id); ency.open = true; state.page = 'chem' }
  }))
}).catch(() => { /* the search works without them */ })
const searchMs = ref(0)

/** Matches: every word of the query in the item; titles that start with the query first, then title hits. */
const results = computed(() => {
  const t0 = performance.now()
  const words = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean).map(norm)
  const out: Array<{ cat: string; items: Item[] }> = []
  if (words.length) {
    const scored: Array<[number, Item]> = []
    for (const it of [...index, ...matter.value]) {
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
    <div class="palette glass-float" role="dialog" :aria-label="tl('全局搜索')">
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
/* 26.64 (D255): the command palette is a floating control — glass, over the dimmed page */
.palette { width: min(640px, 94vw); border-radius: var(--radius-float); overflow: hidden; display: flex; flex-direction: column; max-height: 70vh; }
.head { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--separator); color: var(--text-2); }
.q { flex: 1; border: 0; outline: none; background: transparent; font: inherit; font-size: calc(16px * var(--zoom, 1)); color: var(--text); }
kbd { border: 1px solid var(--separator); border-radius: var(--radius-row); padding: 1px 5px; color: var(--text-2); }
.list { overflow: auto; padding: 4px 6px 8px; }
/* on glass only the first two text colours are used (design file §5) */
.cat { padding: 8px 8px 3px; font-weight: 600; color: var(--text-2); }
.row { display: flex; align-items: center; gap: 10px; width: 100%; border: 0; background: transparent; border-radius: var(--radius-control); padding: 6px 8px; cursor: pointer; text-align: left; color: var(--text); font: inherit; min-width: 0; }
.row.on { background: var(--accent-soft); }
.row.on .title { color: var(--accent-strong); }
.title { flex: 0 1 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 55%; }
.detail { flex: 1 1 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: right; color: var(--text-2); }
.empty { padding: 16px 10px; }
.foot { display: flex; gap: 8px; padding: 7px 14px; border-top: 1px solid var(--separator); color: var(--text-2); }
.spacer { flex: 1; }
</style>
