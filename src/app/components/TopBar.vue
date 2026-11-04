<script setup lang="ts">
/**
 * Top bar (26.60, D205: slim; 26.59 fix, D184 grouped it). The app menu (☰: files and exports, templates and problems,
 * teaching tools, the other pages, help), the document name, the three studio modes (搭建 · 仿真 · 分析), undo / redo,
 * search, 视图 (what the canvas draws, light / dark, the mode's default layout), 模板 and 题目, the run button with the
 * 计算 menu, and the AI button. On phones (D206) only the menu, the name, undo and the run button stay: the rest is
 * in the menu and the bottom tab bar.
 */
import AppLogo from './AppLogo.vue'
import Wordmark from './Wordmark.vue'
import { tl } from '../../i18n'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { state, undo, redo, runSimulation, cancelSimulation, problemLocked, showToast } from '../store'
import type { Page } from '../store'
import type { DisplayToggle } from '../settings'
import { settings } from '../settings'
import { newScene, openScene, saveScene } from '../files'
import { MOD } from '../shortcuts'
import Icon from './Icon.vue'
import { vSlideIndicator } from '../slideIndicator'
import TriCheck from './TriCheck.vue'
import SolverBadge from './SolverBadge.vue'
import { circularTransition } from '../viewTransition'
import { STUDIO_MODES, phone, resetStudioMode, setCopilotOpen, setStudioMode, shell } from '../layout'

const PAGES: Array<{ id: Page; label: string; icon: string; key: string }> = [
  { id: 'studio', label: tl('工作台'), icon: 'studio', key: 'Alt+1' },
  { id: 'lab', label: tl('实验室'), icon: 'flask', key: 'Alt+2' },
  { id: 'monitor', label: tl('渲染与监视'), icon: 'monitor', key: 'Alt+3' },
  { id: 'settings', label: tl('设置'), icon: 'settings', key: 'Alt+4' }
]

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

type MenuId = 'app' | 'view' | 'compute' | null
const open = ref<MenuId>(null)
function toggleMenu(id: MenuId) { open.value = open.value === id ? null : id }
function closeOnOutside(e: PointerEvent) {
  if (!open.value) return
  const t = e.target as Element
  if (!t.closest('.menu-anchor')) open.value = null
}
function closeOnEsc(e: KeyboardEvent) { if (e.key === 'Escape') open.value = null }
onMounted(() => { window.addEventListener('pointerdown', closeOnOutside); window.addEventListener('keydown', closeOnEsc) })
onBeforeUnmount(() => { window.removeEventListener('pointerdown', closeOnOutside); window.removeEventListener('keydown', closeOnEsc) })

function act(fn: () => void) { open.value = null; fn() }
const hasResult = () => !!state.recording && !state.stale

/** Teaching tools need a current result, and stay closed while a problem is answered (26.52). */
const teachReady = () => hasResult() && !problemLocked()
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
function goPage(p: Page) { state.page = p }
</script>

<template>
  <header class="topbar" :class="{ phone }">
    <!-- ☰ The app menu: files, library, teaching, pages, help -->
    <div class="menu-anchor">
      <button class="btn ghost brand" data-ui="file" :class="{ active: open === 'app' }" :aria-expanded="open === 'app'" :title="tl('菜单：文件与导出、模板与题目、教学工具、页面、帮助')" :aria-label="tl('菜单')" @click="toggleMenu('app')">
        <AppLogo :size="22" /><Wordmark v-if="!phone" class="name" :size="15" /><Icon name="chevron" :size="11" />
      </button>
      <div v-if="open === 'app'" class="menu app-menu" role="menu">
        <div class="cols">
          <div class="col menu-col">
            <div class="menu-title">{{ tl('文件') }}</div>
            <button role="menuitem" @click="act(newScene)"><Icon name="file" />{{ tl('新建') }}<span class="spacer" /><kbd>{{ MOD }}+N</kbd></button>
            <button role="menuitem" @click="act(openScene)"><Icon name="open" />{{ tl('打开…') }}<span class="spacer" /><kbd>{{ MOD }}+O</kbd></button>
            <button role="menuitem" @click="act(() => saveScene(false))"><Icon name="save" />{{ tl('保存') }}<span class="spacer" /><kbd>{{ MOD }}+S</kbd></button>
            <button role="menuitem" @click="act(() => saveScene(true))"><Icon name="saveas" />{{ tl('另存为…') }}</button>
            <div class="menu-title">{{ tl('导出') }}</div>
            <button role="menuitem" data-ui="output" :disabled="!hasResult()" @click="act(() => { state.showExport = true })"><Icon name="download" />{{ tl('数据与视频…') }}<span class="spacer" /><span class="tiny muted">CSV · MP4</span></button>
            <button role="menuitem" :disabled="!hasResult()" @click="act(() => { state.showCourseware = true })"><Icon name="courseware" />{{ tl('课件导出…') }}</button>
            <button role="menuitem" :disabled="!hasResult()" @click="act(() => { state.showReport = true })"><Icon name="report" />{{ tl('实验报告…') }}</button>
          </div>
          <div class="col menu-col">
            <div class="menu-title">{{ tl('资源') }}</div>
            <button role="menuitem" @click="act(() => { state.showTemplates = true })"><Icon name="template" />{{ tl('模板库…') }}</button>
            <button role="menuitem" @click="act(() => { state.showProblems = true })"><Icon name="problem" />{{ tl('题目库…') }}</button>
            <button role="menuitem" @click="act(() => { state.showLearning = true })"><Icon name="graduation" />{{ tl('学习路径…') }}</button>
            <button role="menuitem" @click="act(() => { state.showModels = true })"><Icon name="layers" />{{ tl('模型目录…') }}</button>
            <div class="menu-title">{{ tl('教学') }}</div>
            <button role="menuitem" :disabled="!teachReady()" @click="act(() => { state.showFbd = true })"><Icon name="fbd" />{{ tl('受力分析图…') }}</button>
            <button role="menuitem" :disabled="!teachReady()" @click="act(() => { state.showTape = true })"><Icon name="tape" />{{ tl('打点计时器纸带…') }}</button>
            <button role="menuitem" :disabled="!teachReady()" @click="act(vtArea)"><Icon name="area" />{{ tl('v–t 图面积') }}</button>
          </div>
          <div class="col menu-col">
            <div class="menu-title">{{ tl('页面') }}</div>
            <button v-for="p in PAGES" :key="p.id" role="menuitem" :data-ui="`page-${p.id}`" :class="{ on: state.page === p.id }" @click="act(() => goPage(p.id))"><Icon :name="p.icon" />{{ p.label }}<span class="spacer" /><kbd>{{ p.key }}</kbd></button>
            <div class="menu-title">{{ tl('帮助') }}</div>
            <button role="menuitem" data-ui="help" @click="act(() => { state.showWelcome = true })"><Icon name="graduation" />{{ tl('欢迎与导览') }}</button>
            <button role="menuitem" @click="act(() => { state.page = 'settings'; state.settingsSection = 'handbook' })"><Icon name="book" />{{ tl('学习手册') }}</button>
            <button role="menuitem" @click="act(() => { state.showAbout = true })"><Icon name="keyboard" />{{ tl('关于与快捷键') }}</button>
          </div>
        </div>
      </div>
    </div>
    <span class="doc small" :title="state.filePath ?? state.fileName ?? state.scene.name"><span class="doc-text">{{ state.fileName ?? state.scene.name }}</span><span class="dot" :class="{ on: state.dirty }" :title="tl('有未保存的修改')">●</span></span>

    <!-- 26.60 (D205): the three studio modes; other pages show the way back -->
    <nav v-if="!phone && state.page === 'studio'" v-slide-indicator class="segmented modes" :aria-label="tl('工作模式')">
      <button v-for="m in STUDIO_MODES" :key="m.id" :data-ui="`mode-${m.id}`" :class="{ on: shell.mode === m.id }" :aria-current="shell.mode === m.id ? 'true' : undefined" :title="tl(m.tip)" @click="setStudioMode(m.id)"><Icon :name="m.icon" :size="14" /><span class="lbl">{{ tl(m.label) }}</span></button>
    </nav>
    <button v-else-if="state.page !== 'studio'" class="btn ghost back" data-ui="page-studio" @click="state.page = 'studio'"><Icon name="arrowLeft" :size="14" /><span class="lbl">{{ tl('返回工作台') }}</span></button>

    <span class="spacer" />

    <div class="group-btns">
      <button class="btn icon ghost" data-ui="undo" :title="tl('撤销（{0}+Z）', [MOD])" :aria-label="tl('撤销')" :disabled="!state.past.length" @click="undo"><Icon name="undo" /></button>
      <button v-if="!phone" class="btn icon ghost" :title="tl('重做（{0}+Y）', [MOD])" :aria-label="tl('重做')" :disabled="!state.future.length" @click="redo"><Icon name="redo" /></button>
    </div>
    <template v-if="!phone">
      <button class="btn icon ghost" data-ui="search" :title="tl('全局搜索（{0}+K）', [MOD])" :aria-label="tl('全局搜索')" @click="state.showPalette = true"><Icon name="search" /></button>
      <button class="btn ghost lib" data-ui="templates" :title="tl('经典模型模板')" @click="state.showTemplates = true"><Icon name="template" /><span class="lbl">{{ tl('模板') }}</span></button>
      <button class="btn ghost lib" data-ui="problems" :class="{ active: !!state.problem }" :title="tl('按教材章节的内置题目、导入题目包、用当前场景出题')" @click="state.showProblems = true"><Icon name="problem" /><span class="lbl">{{ tl('题目') }}</span></button>

      <!-- 视图: what the canvas draws (D86), light / dark, the mode's default layout -->
      <div class="menu-anchor">
        <button class="btn icon ghost" data-ui="view" :class="{ active: open === 'view' }" :title="tl('画面上显示的内容、深浅色外观')" :aria-label="tl('视图')" @click="toggleMenu('view')"><Icon name="eye" /></button>
        <div v-if="open === 'view'" class="menu right display-panel" role="menu">
          <div class="menu-title">{{ tl('画面显示') }}</div>
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
          <button data-ui="theme" @click="act(() => toggleTheme())"><Icon :name="state.theme === 'dark' ? 'sun' : 'moon'" />{{ state.theme === 'dark' ? tl('浅色外观') : tl('深色外观') }}</button>
          <button @click="act(resetStudioMode)"><Icon name="undo" />{{ tl('恢复本模式的默认布局') }}</button>
          <button @click="act(() => { state.page = 'settings'; state.settingsSection = 'display' })"><Icon name="sliders" />{{ tl('更多显示与视觉效果设置…') }}</button>
        </div>
      </div>
    </template>

    <div v-if="!phone" class="run">
      <button class="btn primary" data-ui="run" :class="{ quiet: !state.stale && !!state.recording }" :title="tl('重新计算（{0}+Enter）', [MOD])" :aria-label="state.stale || !state.recording ? tl('运行仿真') : tl('重新计算')" @click="runSimulation()"><Icon name="run" /><span class="lbl">{{ state.stale || !state.recording ? tl('运行') : tl('重算') }}</span></button>
      <div v-if="!phone" class="menu-anchor">
        <button class="btn icon ghost" data-ui="compute" :class="{ active: open === 'compute' }" :aria-expanded="open === 'compute'" :title="tl('计算：参数扫描、求解器对照、计算设置')" :aria-label="tl('计算')" @click="toggleMenu('compute')"><Icon name="chevron" :size="13" /></button>
        <div v-if="open === 'compute'" class="menu right" role="menu">
          <button role="menuitem" @click="act(() => runSimulation())"><Icon name="run" />{{ tl('重新计算') }}<span class="spacer" /><kbd>{{ MOD }}+Enter</kbd></button>
          <button role="menuitem" :disabled="!state.computing" @click="act(cancelSimulation)"><Icon name="stop" />{{ tl('停止计算') }}</button>
          <div class="sep" />
          <button role="menuitem" data-ui="sweep" @click="act(() => { state.showSweep = true })"><Icon name="sweep" />{{ tl('参数扫描…') }}</button>
          <button role="menuitem" @click="act(() => { state.page = 'studio'; state.showSolverCompare = true })"><Icon name="layers" />{{ tl('求解器对照…') }}</button>
          <button role="menuitem" @click="act(() => { state.page = 'studio'; state.rightTab = 'settings' })"><Icon name="settings" />{{ tl('计算设置（场景）') }}</button>
        </div>
      </div>
      <SolverBadge v-if="!phone" v-show="state.page === 'studio' || state.page === 'monitor'" class="solver" />
    </div>
    <button v-if="settings.ai.copilot && !phone" class="btn ghost ai-btn" data-ui="copilot" :class="{ active: state.showCopilot && shell.sideOpen }" :aria-pressed="state.showCopilot" :title="tl('Copilot：讲题、生成仿真场景、替你操作（{0}+I）', [MOD])" @click="setCopilotOpen(!(state.showCopilot && shell.sideOpen))"><Icon name="chat" /><span class="lbl">AI</span></button>
    <button v-if="!phone && state.page === 'studio'" class="btn icon ghost" data-ui="sidebar" :class="{ active: shell.sideOpen }" :aria-pressed="shell.sideOpen" :title="shell.sideOpen ? tl('收起侧栏') : tl('展开侧栏')" :aria-label="tl('侧栏')" @click="shell.sideOpen = !shell.sideOpen"><Icon name="sidebar" /></button>
  </header>
</template>

<style scoped>
.topbar { display: flex; align-items: center; gap: 6px; padding: 6px 4px 6px 2px; min-height: 48px; flex-wrap: nowrap; position: relative; z-index: 50; }
.brand { gap: 6px; padding: 0 8px 0 6px; }
.name { font-size: calc(15px * var(--zoom)) !important; }
.doc { max-width: 200px; min-width: 0; display: inline-flex; align-items: center; gap: 4px; color: var(--text-3); }
.doc-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.dot { color: var(--warning); font-size: 10px; flex: 0 0 auto; visibility: hidden; }
.dot.on { visibility: visible; }
.modes { flex: 0 0 auto; margin-left: 6px; }
.modes button { gap: 5px; padding: 0 14px; }
.back { gap: 4px; }
.group-btns { display: flex; gap: 2px; flex: 0 0 auto; }
.lib { gap: 4px; }
.run { flex: 0 0 auto; display: flex; align-items: center; gap: 2px; }
.run .btn.primary { min-width: 84px; justify-content: center; gap: 5px; white-space: nowrap; }
/* With a current result the run button is still there, but quieter */
.run .btn.primary.quiet { background: var(--fill-strong); color: var(--text); box-shadow: none; }
.ai-btn { gap: 4px; font-weight: 600; }
.menu-anchor { position: relative; flex: 0 0 auto; }
.menu { top: calc(100% + 6px); left: 0; }
.menu.right { left: auto; right: 0; }
.app-menu { min-width: 0; }
.app-menu .cols { display: grid; grid-template-columns: repeat(3, minmax(200px, 1fr)); gap: 4px 10px; }
.app-menu .col { display: flex; flex-direction: column; gap: 1px; }
.app-menu button.on { color: var(--accent); }
.menu-check { justify-content: flex-start; }
.menu-check:hover { background: var(--hover) !important; color: inherit !important; }
.display-panel { min-width: 248px; max-height: min(78vh, 640px); overflow: auto; }
.presets { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; padding: 2px 8px 6px; }
.preset { display: flex; flex-direction: column; align-items: center; gap: 2px; border: 0; background: var(--fill); border-radius: 9px; padding: 6px 2px 5px; cursor: pointer; font-size: 11.5px; color: var(--text-2); justify-content: center; }
.preset:hover { background: var(--fill-strong); }
.preset.on { background: var(--accent-soft); color: var(--accent); }
/* Narrow windows: labels give way first */
@media (max-width: 1280px) { .lib .lbl, .name { display: none; } .doc { max-width: 140px; } }
@media (max-width: 1000px) { .modes .lbl { display: none; } .modes button { padding: 0 10px; } .solver { display: none; } }
/* 26.60 (D206): phones — menu, name, undo and run */
.topbar.phone { gap: 4px; padding: 4px 2px; min-height: 48px; }
.topbar.phone .doc { flex: 1 1 auto; max-width: none; font-size: var(--type-body); color: var(--text); }
.topbar.phone .spacer { display: none; }
.topbar.phone .app-menu { position: fixed; left: 6px; right: 6px; top: 52px; max-height: calc(100vh - 140px); overflow: auto; }
.topbar.phone .app-menu .cols { grid-template-columns: 1fr; }
.topbar.phone .app-menu button { min-height: 40px; }
.topbar.phone .back .lbl { display: none; }
</style>
