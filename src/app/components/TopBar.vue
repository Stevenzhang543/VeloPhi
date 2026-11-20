<script setup lang="ts">
/**
 * Context bar (26.63, D232; it replaces the top bar of 26.60). Navigation between pages is the rail's; this bar holds
 * what belongs to the page shown.
 *
 * 运动 (26.65, D291) — 文件 (name, unsaved mark; new / open / save, share link, exports) · 撤销 / 重做 · 模板 ‖ 运行 ·
 * the sidebar's views [属性] [分析] ([题目] while a problem or task is open) [AI] · 更多. The three "modes" of 26.64 are
 * gone (they were only layout presets and shared the name 分析 with a sidebar tab); the solver badge is in the status
 * bar; the sidebar has no tab row of its own — its view is chosen here, and pressing the view shown folds it
 * (Keynote's inspector buttons). What 26.63 also kept on the bar is
 * one level down in 更多, under four names: 题目, 视图 (what the canvas draws, the sidebar, light / dark), 教学 (force
 * diagram, tape, v–t area, class tally, projection), 计算 (sweep, solver comparison, convergence study). Every control
 * of the bar carries `data-bar-item` (tests/shell/budget2664.test.ts counts them). The experiment panels have no bar
 * here on the desktop (26.65, D290: their name is the rail's selected item, their search is the rail's); the monitor
 * keeps its title and run button. Phones: the navigation drawer, the document menu and undo; the rest is in the
 * bottom tab bar.
 */
import { tl } from '../../i18n'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { state, undo, redo, runSimulation, cancelSimulation, problemLocked, showToast, resolvePage } from '../store'
import type { DisplayToggle } from '../settings'
import { settings } from '../settings'
import { newScene, openScene, saveScene } from '../files'
import { MOD } from '../shortcuts'
import Icon from './Icon.vue'
import TriCheck from './TriCheck.vue'
import { circularTransition } from '../viewTransition'
import { phone, resetStudioMode, setCopilotOpen, shell, showSideTab, tabOf } from '../layout'
import type { SideTab } from '../layout'
// 26.64 (D240): the pages' names and icons are the rail's (panels.ts); the 教学 menu is shared by the experiment panels
import { pageTitle } from '../panels'
import TeachMenu from './TeachMenu.vue'
import { tally } from '../tally'
import { roleDefaults } from '../onboarding/state'

/**
 * Display menu (26.54, D86): every overlay switch lives here, grouped, with four presets on top; nothing sits in
 * the bar itself any more.
 */
interface ToggleDef { key: DisplayToggle; label: string; tip?: string }
const TOGGLE_GROUPS: Array<{ title: string; items: ToggleDef[] }> = [
  { title: tl('矢量'), items: [
    { key: 'velocity', label: tl('速度'), tip: tl('显示速度矢量') },
    { key: 'acceleration', label: tl('加速度'), tip: tl('显示加速度矢量') },
    { key: 'forces', label: tl('受力'), tip: tl('显示所选物体受力（运行后）') },
    { key: 'forcesAll', label: tl('同时显示所有物体的受力') },
    // 26.57 (D119, T06)
    { key: 'contactPoints', label: tl('各接触点分别画出（N1、N2…）'), tip: tl('默认把同一接触面的支持力合成一个箭头（受力只计一次）；打开后分别画出每个接触点') }
  ] },
  { title: tl('轨迹与标注'), items: [
    { key: 'trajectory', label: tl('轨迹'), tip: tl('显示质心轨迹') },
    { key: 'strobe', label: tl('频闪'), tip: tl('频闪照片：按固定时间间隔叠加物体此前的位置（间隔与张数在设置页“显示”中调整；导出图片与视频时一并绘出）') },
    { key: 'labels', label: tl('关键时刻'), tip: tl('在画面上标注碰撞、共速等时刻') },
    { key: 'names', label: tl('物体名称') },
    // 26.58 (D133)
    { key: 'manyBody', label: tl('多体接触点与读数'), tip: tl('实时多体场景：画出各接触点，并在左下角显示物体数、运动中的物体数与接触点数') }
  ] },
  { title: tl('电场与磁场'), items: [
    { key: 'fields', label: tl('匀强电场与磁场') },
    { key: 'fieldLines', label: tl('电场线') },
    { key: 'equipotentials', label: tl('等势线') }
  ] },
  { title: tl('背景'), items: [
    { key: 'grid', label: tl('网格'), tip: tl('显示网格与比例尺') },
    { key: 'axes', label: tl('坐标轴') }
  ] }
]
type PresetId = 'motion' | 'forces' | 'energy' | 'clean'
const PRESETS: Array<{ id: PresetId; label: string; tip: string; icon: string }> = [
  { id: 'motion', label: tl('运动'), tip: tl('速度、加速度与轨迹'), icon: 'run' },
  { id: 'forces', label: tl('受力'), tip: tl('所选物体的受力与数值'), icon: 'force' },
  { id: 'energy', label: tl('能量'), tip: tl('速度与轨迹，右侧打开监视（能量柱）'), icon: 'area' },
  { id: 'clean', label: tl('简洁'), tip: tl('只留物体、名称与网格'), icon: 'eye' }
]
const PRESET_VALUES: Record<PresetId, Partial<Record<DisplayToggle, boolean>>> = {
  motion: { velocity: true, acceleration: true, forces: false, forcesAll: false, trajectory: true, labels: true, strobe: false },
  forces: { velocity: false, acceleration: false, forces: true, trajectory: false, labels: true, strobe: false },
  energy: { velocity: true, acceleration: false, forces: false, forcesAll: false, trajectory: true, labels: true, strobe: false },
  clean: { velocity: false, acceleration: false, forces: false, forcesAll: false, trajectory: false, labels: false, strobe: false, names: true, grid: true, axes: false, fieldLines: false, equipotentials: false }
}
function applyPreset(id: PresetId) {
  Object.assign(state.display, PRESET_VALUES[id])
  if (id === 'energy') state.rightTab = 'watch'
}
/** The preset the overlays currently match, if any. */
function presetOn(id: PresetId): boolean {
  return Object.entries(PRESET_VALUES[id]).every(([k, v]) => state.display[k as DisplayToggle] === v)
}

type MenuId = 'doc' | 'more' | null
/** 更多 (D245): the four groups 26.63 kept on the bar; the one opened last is shown again. */
type MoreGroup = 'problems' | 'view' | 'teach' | 'compute'
const MORE_GROUPS: MoreGroup[] = ['problems', 'view', 'teach', 'compute']
const moreGroup = ref<MoreGroup>(settings.ui.role ? roleDefaults(settings.ui.role).moreGroup : 'view')
/** Open 更多 at one of its groups (the global search and Copilot's pointer use it: `velophi:studio-more`). */
function showMore(e: Event) { const g = (e as CustomEvent<string>).detail as MoreGroup; if (MORE_GROUPS.includes(g)) moreGroup.value = g; open.value = 'more' }
function pickedItem(e: MouseEvent) { if ((e.target as Element).closest('[role="menuitem"]')) open.value = null }
const open = ref<MenuId>(null)
function toggleMenu(id: MenuId) { open.value = open.value === id ? null : id }
function closeOnOutside(e: PointerEvent) {
  if (!open.value) return
  const t = e.target as Element
  if (!t.closest('.menu-anchor')) open.value = null
}
function closeOnEsc(e: KeyboardEvent) { if (e.key === 'Escape') open.value = null }
onMounted(() => { window.addEventListener('pointerdown', closeOnOutside); window.addEventListener('keydown', closeOnEsc); window.addEventListener('velophi:studio-more', showMore) })
onBeforeUnmount(() => { window.removeEventListener('pointerdown', closeOnOutside); window.removeEventListener('keydown', closeOnEsc); window.removeEventListener('velophi:studio-more', showMore) })

function act(fn: () => void) { open.value = null; fn() }
const hasResult = () => !!state.recording && !state.stale

/** Teaching tools need a current result, and stay closed while a problem is answered (26.52). */
const teachReady = () => hasResult() && !problemLocked()
const needResult = computed(() => (hasResult() ? undefined : tl('先运行仿真，得到结果后可用')))
/** v–t area (D64): show the velocity of the selected (or first moving) body in the chart and explain Shift-drag. */
function vtArea() {
  const rec = state.recording
  if (!rec) return
  const sel = state.selection?.kind === 'body' ? rec.system.model.byId.get(state.selection.id) : null
  const body = sel && sel.dynamic ? sel : rec.system.model.dynamic[0]
  if (!body) return
  state.page = 'studio'
  state.bottomTab = 'chart'
  shell.drawerOpen = true
  state.chart = [`${body.id}.vx`, `${body.id}.vy`]
  showToast(tl('在速度曲线上按住 Shift 拖动，选出时间段即可求面积（位移）'))
}

function toggleTheme(e?: MouseEvent) {
  // 26.57 (D124): the new theme grows from the button (immediate with reduced motion)
  circularTransition(() => { settings.themeMode = state.theme === 'dark' ? 'light' : 'dark' }, e && e.detail > 0 ? { x: e.clientX, y: e.clientY } : undefined)
}
/** Parent switch of a group of overlays (26.57, D120: tri-state, visibility only). */
function setGroup(keys: string[], on: boolean) { for (const k of keys) (state.display as unknown as Record<string, boolean>)[k] = on }
const SIDE_KEY = `${MOD}+\\`
const studio = computed(() => state.page === 'studio')
/**
 * The sidebar's views (26.65, D292). Pressing the view shown folds the sidebar; pressing another opens it there.
 * 题目 appears while a problem is open or the task panel was chosen.
 */
const shownView = computed<SideTab | null>(() => (!shell.sideOpen ? null : state.showCopilot ? 'ai' : tabOf(state.rightTab)))
const VIEWS = computed((): Array<{ id: SideTab; label: string; tip: string; ui: string }> => [
  { id: 'inspect', label: tl('属性'), tip: tl('所选物体的参数；没有选择时是整个场景'), ui: 'tab-props' },
  { id: 'analysis', label: tl('分析'), tip: tl('公式对照、监视读数、预测'), ui: 'tab-analysis' },
  ...(state.problem || state.rightTab === 'task' || state.rightTab === 'problem' ? [{ id: 'problem' as const, label: tl('题目'), tip: tl('作答与揭晓、任务（已知、所求与核对）'), ui: 'tab-problems' }] : []),
  ...(settings.ai.copilot ? [{ id: 'ai' as const, label: 'AI', tip: tl('Copilot：讲题、搭场景（{0}+I）', [MOD]), ui: 'copilot' }] : [])
])
function pickView(v: SideTab) {
  if (shownView.value === v) { shell.sideOpen = false; if (v === 'ai') state.showCopilot = false; return }
  if (v === 'ai') { setCopilotOpen(true); return }
  showSideTab(v)
}
const title = computed(() => pageTitle(resolvePage(state.page).page))
</script>

<template>
  <header class="ctxbar" :class="{ phone }">
    <button v-if="phone" type="button" class="btn icon ghost" data-ui="nav" data-bar-item="phone" :aria-label="tl('页面')" :aria-expanded="shell.navOpen" @click="shell.navOpen = true"><Icon name="menu" :size="19" /></button>

    <!-- The document: name and unsaved mark; its menu holds the file commands, the share link and the exports -->
    <div v-if="studio" class="menu-anchor doc-anchor" data-bar-item="studio phone">
      <button class="btn ghost doc" data-ui="file" :class="{ active: open === 'doc' }" :aria-expanded="open === 'doc'" :title="tl('文件：打开、保存、分享、导出')" @click="toggleMenu('doc')">
        <Icon name="file" :size="15" /><span class="doc-text">{{ state.fileName ?? state.scene.name }}</span><span class="dot" :class="{ on: state.dirty }" :title="tl('有未保存的修改')" /><Icon name="chevron" :size="11" />
      </button>
      <div v-if="open === 'doc'" class="menu doc-menu" role="menu">
        <button role="menuitem" @click="act(newScene)"><Icon name="file" />{{ tl('新建') }}<span class="spacer" /><kbd>{{ MOD }}+N</kbd></button>
        <button role="menuitem" @click="act(openScene)"><Icon name="open" />{{ tl('打开…') }}<span class="spacer" /><kbd>{{ MOD }}+O</kbd></button>
        <button role="menuitem" data-ui="open-link" @click="act(() => { shell.openLink = true })"><Icon name="link" />{{ tl('从链接打开…') }}</button>
        <button role="menuitem" @click="act(() => saveScene(false))"><Icon name="save" />{{ tl('保存') }}<span class="spacer" /><kbd>{{ MOD }}+S</kbd></button>
        <button role="menuitem" @click="act(() => saveScene(true))"><Icon name="saveas" />{{ tl('另存为…') }}</button>
        <div class="sep" />
        <button role="menuitem" data-ui="share" @click="act(() => { shell.share = true })"><Icon name="share" />{{ tl('分享链接…') }}<span class="spacer" /><span class="tiny muted">{{ tl('不上传') }}</span></button>
        <div class="menu-title">{{ tl('导出') }}</div>
        <button role="menuitem" data-ui="output" :disabled="!hasResult()" :title="needResult" @click="act(() => { state.showExport = true })"><Icon name="download" />{{ tl('数据与视频…') }}<span class="spacer" /><span class="tiny muted">CSV · MP4</span></button>
        <button role="menuitem" :disabled="!hasResult()" :title="needResult" @click="act(() => { state.showCourseware = true })"><Icon name="courseware" />{{ tl('课件导出…') }}</button>
        <button role="menuitem" :disabled="!hasResult()" :title="needResult" @click="act(() => { state.showReport = true })"><Icon name="report" />{{ tl('实验报告…') }}</button>
        <template v-if="phone">
          <div class="sep" />
          <button role="menuitem" @click="act(() => { state.showTemplates = true })"><Icon name="template" />{{ tl('模板库…') }}</button>
          <button role="menuitem" @click="act(() => { state.showProblems = true })"><Icon name="problem" />{{ tl('题目库…') }}</button>
          <button role="menuitem" @click="act(() => { shell.convergence = true })"><Icon name="converge" />{{ tl('收敛性研究…') }}</button>
          <button role="menuitem" @click="act(() => toggleTheme())"><Icon :name="state.theme === 'dark' ? 'sun' : 'moon'" />{{ state.theme === 'dark' ? tl('浅色外观') : tl('深色外观') }}</button>
        </template>
      </div>
    </div>
    <div v-else class="ptitle"><span class="pico"><Icon :name="title.icon" :size="17" /></span><span class="ptext">{{ title.label }}</span></div>

    <div v-if="studio" class="group-btns" role="group" :aria-label="tl('撤销与重做')" data-bar-item="studio phone" data-bar-group>
      <button class="btn icon ghost" data-ui="undo" :title="tl('撤销（{0}+Z）', [MOD])" :aria-label="tl('撤销')" :disabled="!state.past.length" @click="undo"><Icon name="undo" /></button>
      <button v-if="!phone" class="btn icon ghost" :title="tl('重做（{0}+Y）', [MOD])" :aria-label="tl('重做')" :disabled="!state.future.length" @click="redo"><Icon name="redo" /></button>
    </div>

    <button v-if="!phone && studio" class="btn ghost lib" data-ui="templates" data-bar-item="studio" :title="tl('经典模型模板')" @click="state.showTemplates = true"><Icon name="template" /><span class="lbl">{{ tl('模板') }}</span></button>

    <span class="spacer" />


    <div v-if="!phone && (studio || state.page === 'monitor')" class="run" data-bar-item="studio page" data-bar-group>
      <button class="btn primary" data-ui="run" :class="{ quiet: !state.stale && !!state.recording, busy: state.computing }" :title="tl('重新计算（{0}+Enter）', [MOD])" :aria-label="state.stale || !state.recording ? tl('运行仿真') : tl('重新计算')" @click="runSimulation()"><Icon name="run" /><span class="lbl">{{ state.stale || !state.recording ? tl('运行') : tl('重算') }}</span></button>
    </div>
    <!-- The sidebar's views (D292): one group of plain text buttons; the view shown is pressed -->
    <div v-if="!phone && studio" class="views" role="group" :aria-label="tl('侧栏')" data-bar-item="studio" data-bar-group>
      <button v-for="v in VIEWS" :key="v.id" type="button" class="view-btn" :data-ui="v.ui" :class="{ on: shownView === v.id }" :aria-pressed="shownView === v.id" :title="v.tip" @click="pickView(v.id)">{{ v.label }}</button>
    </div>

    <!-- 更多 (26.64, D245): what 26.63 kept on the bar — 题目, 视图, 教学, 计算 — one level down, under these four names -->
    <div v-if="!phone && studio" class="menu-anchor" data-bar-item="studio">
      <button class="btn icon ghost" data-ui="studio-more" :class="{ active: open === 'more' }" aria-haspopup="dialog" :aria-expanded="open === 'more'" :title="tl('更多：题目、视图、教学、计算')" :aria-label="tl('更多')" @click="toggleMenu('more')"><Icon name="more" /></button>
      <div v-if="open === 'more'" class="menu right more-panel" role="dialog" :aria-label="tl('更多')">
        <div class="tabs" role="tablist">
          <button type="button" role="tab" data-ui="problems" :class="{ on: moreGroup === 'problems' }" :aria-selected="moreGroup === 'problems'" @click="moreGroup = 'problems'">{{ tl('题目') }}</button>
          <button type="button" role="tab" data-ui="view" :class="{ on: moreGroup === 'view' }" :aria-selected="moreGroup === 'view'" @click="moreGroup = 'view'">{{ tl('视图') }}</button>
          <button type="button" role="tab" data-ui="teach" :class="{ on: moreGroup === 'teach' }" :aria-selected="moreGroup === 'teach'" @click="moreGroup = 'teach'">{{ tl('教学') }}</button>
          <button type="button" role="tab" data-ui="compute" :class="{ on: moreGroup === 'compute' }" :aria-selected="moreGroup === 'compute'" @click="moreGroup = 'compute'">{{ tl('计算') }}</button>
        </div>

        <div v-if="moreGroup === 'problems'" class="menu-col" role="menu">
          <button role="menuitem" data-ui="problems-open" @click="act(() => { state.showProblems = true })"><Icon name="problem" />{{ tl('题目库…') }}</button>
          <button role="menuitem" @click="act(() => { state.rightTab = 'task'; shell.sideOpen = true })"><Icon name="target" />{{ tl('解一道题（任务）') }}</button>
          <button role="menuitem" @click="act(() => { state.showLearning = true })"><Icon name="graduation" />{{ tl('学习路径…') }}</button>
        </div>

        <!-- 视图: what the canvas draws (D86), light / dark, the mode's default layout, the sidebar -->
        <div v-else-if="moreGroup === 'view'" class="menu-col display-panel" role="menu">
          <div class="presets">
            <button v-for="p in PRESETS" :key="p.id" class="preset" :class="{ on: presetOn(p.id) }" :title="p.tip" @click="applyPreset(p.id)"><Icon :name="p.icon" :size="16" /><span>{{ p.label }}</span></button>
          </div>
          <template v-for="g in TOGGLE_GROUPS" :key="g.title">
            <TriCheck :label="g.title" :children="g.items.map(t => ({ key: t.key, on: state.display[t.key], disabled: t.key === 'forcesAll' && !state.display.forces }))" @set="setGroup" />
            <label v-for="t in g.items" :key="t.key" class="menu-check" role="menuitemcheckbox" :aria-checked="state.display[t.key]" :title="t.tip">
              <input v-model="state.display[t.key]" type="checkbox" class="switch" :disabled="t.key === 'forcesAll' && !state.display.forces" /><span>{{ t.label }}</span>
            </label>
          </template>
          <div class="sep" />
          <button data-ui="sidebar" :aria-pressed="shell.sideOpen" @click="act(() => { shell.sideOpen = !shell.sideOpen })"><Icon name="sidebar" />{{ shell.sideOpen ? tl('收起侧栏') : tl('展开侧栏') }}<span class="spacer" /><kbd>{{ SIDE_KEY }}</kbd></button>
          <button data-ui="theme" @click="act(() => toggleTheme())"><Icon :name="state.theme === 'dark' ? 'sun' : 'moon'" />{{ state.theme === 'dark' ? tl('浅色外观') : tl('深色外观') }}</button>
          <button @click="act(resetStudioMode)"><Icon name="undo" />{{ tl('恢复默认布局') }}</button>
          <button @click="act(() => { state.page = 'settings'; state.settingsSection = 'display' })"><Icon name="sliders" />{{ tl('更多显示与视觉效果设置…') }}</button>
        </div>

        <!-- 教学: the studio's representations, then the class tally and projection shared by every experiment panel -->
        <div v-else-if="moreGroup === 'teach'" class="menu-col" role="menu" @click="pickedItem">
          <button role="menuitem" :disabled="!teachReady()" :title="needResult" @click="state.showFbd = true"><Icon name="fbd" />{{ tl('受力分析图…') }}</button>
          <button role="menuitem" :disabled="!teachReady()" :title="needResult" @click="state.showTape = true"><Icon name="tape" />{{ tl('打点计时器纸带…') }}</button>
          <button role="menuitem" :disabled="!teachReady()" :title="needResult" @click="vtArea"><Icon name="area" />{{ tl('v–t 图面积') }}</button>
          <button role="menuitem" @click="state.rightTab = 'predict'; shell.sideOpen = true"><Icon name="target" />{{ tl('个人预测（侧栏）') }}</button>
          <div class="sep" />
          <TeachMenu inline :tally-action="() => { tally.open = true }" />
        </div>

        <!-- 计算: the run and its studies -->
        <div v-else class="menu-col" role="menu">
          <button role="menuitem" @click="act(() => runSimulation())"><Icon name="run" />{{ tl('重新计算') }}<span class="spacer" /><kbd>{{ MOD }}+Enter</kbd></button>
          <button role="menuitem" :disabled="!state.computing" @click="act(cancelSimulation)"><Icon name="stop" />{{ tl('停止计算') }}</button>
          <div class="sep" />
          <button role="menuitem" data-ui="sweep" @click="act(() => { state.showSweep = true })"><Icon name="sweep" />{{ tl('参数扫描…') }}</button>
          <button role="menuitem" @click="act(() => { state.page = 'studio'; state.showSolverCompare = true })"><Icon name="layers" />{{ tl('求解器对照…') }}</button>
          <button role="menuitem" data-ui="convergence" @click="act(() => { state.page = 'studio'; shell.convergence = true })"><Icon name="converge" />{{ tl('收敛性研究…') }}</button>
          <button role="menuitem" @click="act(() => { state.page = 'studio'; state.rightTab = 'settings' })"><Icon name="settings" />{{ tl('计算设置（场景）') }}</button>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.ctxbar { display: flex; align-items: center; gap: 4px; padding: 0 8px 0 10px; height: var(--bar-h); flex: 0 0 var(--bar-h); flex-wrap: nowrap; position: relative; z-index: 50; min-width: 0; }
.doc { gap: 6px; padding: 0 8px; max-width: 280px; min-width: 0; font-weight: 600; }
.doc-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.dot { width: 7px; height: 7px; border-radius: var(--radius-round); background: var(--warning); flex: 0 0 auto; visibility: hidden; }
.dot.on { visibility: visible; }
.doc-anchor { min-width: 0; flex: 0 1 auto; }
.ptitle { display: inline-flex; align-items: center; gap: 8px; font-weight: var(--weight-title); font-size: var(--type-panel); line-height: var(--line-tight); padding: 0 6px; min-width: 0; }
.pico { width: 28px; height: 28px; display: grid; place-items: center; color: var(--text-2); flex: 0 0 auto; }
.ptext { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.group-btns { display: flex; gap: 2px; flex: 0 0 auto; margin-left: 4px; }
.lib { gap: 5px; padding: 0 9px; }
.run { flex: 0 0 auto; display: flex; align-items: center; gap: 2px; margin-left: 12px; }
.run .btn.primary { min-width: 84px; justify-content: center; gap: 5px; white-space: nowrap; }
/* With a current result the run button is still there, but quieter */
.run .btn.primary.quiet { background: var(--pane); color: var(--text); box-shadow: inset 0 0 0 1px var(--border); }
.run .btn.primary.busy :deep(.icon) { animation: spin 900ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
/* The sidebar's views: text only, quiet until pressed (26.65, D292) */
.views { flex: 0 0 auto; display: flex; gap: 2px; margin-left: 12px; }
.view-btn { height: var(--control-h); padding: 0 10px; border: 0; border-radius: var(--radius-control); background: none; color: var(--text-2); font: inherit; font-size: var(--type-body); cursor: pointer; white-space: nowrap; }
.view-btn:hover { background: var(--hover); color: var(--text); }
.view-btn.on { background: var(--fill-strong); color: var(--text); font-weight: var(--weight-strong); }
.view-btn:focus-visible { outline: 2px solid var(--ring); outline-offset: 1px; }
.menu-anchor { position: relative; flex: 0 0 auto; }
.menu { top: calc(100% + 6px); left: 0; }
.menu.right { left: auto; right: 0; }
.doc-menu { min-width: 250px; }
.menu-check { justify-content: flex-start; }
.menu-check:hover { background: var(--hover) !important; color: inherit !important; }
.more-panel { width: min(calc(348px * var(--zoom)), calc(100vw - 24px)); max-height: min(78vh, 640px); overflow: auto; gap: var(--space-1); }
.more-panel .tabs { flex: 0 0 auto; margin: 2px 2px var(--space-1); }
.menu-col { display: flex; flex-direction: column; gap: 1px; }
.menu-col > label { display: flex; align-items: center; gap: 8px; min-height: var(--menu-row); padding: 0 10px; border-radius: var(--radius-control); cursor: pointer; font-size: var(--type-body); }
.menu-col > button .spacer { flex: 1; }
.presets { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; padding: 2px 8px 6px; }
.preset { display: flex; flex-direction: column; align-items: center; gap: 2px; border: 0; background: var(--fill); border-radius: var(--radius-control); padding: 6px 2px 5px; cursor: pointer; font-size: var(--type-tiny); color: var(--text-2); justify-content: center; }
.preset:hover { background: var(--fill-strong); }
.preset.on { background: var(--accent-soft); color: var(--accent); }
/* Narrow windows: labels give way first, then the solver badge */
@media (max-width: 1360px) { .doc { max-width: 190px; } }
@media (max-width: 1080px) { .lib .lbl { display: none; } .view-btn { padding: 0 8px; } }
/* 26.60 (D206): phones — navigation, the document menu and undo */
.ctxbar.phone { gap: 2px; padding: 0 4px; }
.ctxbar.phone .doc-anchor { flex: 1 1 auto; position: static; }
.ctxbar.phone .doc { max-width: 100%; font-size: var(--type-body); }
.ctxbar.phone .spacer { display: none; }
.ctxbar.phone .ptitle { flex: 1 1 auto; }
.ctxbar.phone .doc-menu { position: fixed; left: 6px; right: 6px; top: calc(var(--bar-h) + 4px); max-height: calc(100dvh - 150px); overflow: auto; }
.ctxbar.phone .doc-menu button { min-height: 42px; }
</style>
