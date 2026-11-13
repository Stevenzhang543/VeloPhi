<script setup lang="ts">
/**
 * Context bar (26.63, D232; it replaces the top bar of 26.60). Navigation between pages is the rail's; this bar holds
 * what belongs to the page shown.
 *
 * Studio: the document (name, unsaved mark, and a menu with new / open / save, share link, exports), undo and redo, the
 * three modes (搭建 · 仿真 · 分析), then 模板 and 题目, 视图 (what the canvas draws), 教学 (force diagram, tape, v–t area,
 * prediction tally, courseware and report), the run button with the 计算 menu (sweep, solver comparison, convergence
 * study), the solver badge, AI and the sidebar switch. Other pages: their title, search, and for the monitor the run
 * button. Phones: the navigation drawer, the document menu and undo; the rest is in the bottom tab bar.
 */
import { tl } from '../../i18n'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
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
import { tally } from '../tally'

const PAGE_TITLE = computed((): Record<Page, { label: string; icon: string }> => ({
  home: { label: tl('首页'), icon: 'home' },
  studio: { label: tl('工作台'), icon: 'studio' },
  lab: { label: tl('实验室'), icon: 'flask' },
  library: { label: tl('资源库'), icon: 'library' },
  classroom: { label: tl('课堂'), icon: 'classroom' },
  monitor: { label: tl('渲染与监视'), icon: 'monitor' },
  settings: { label: tl('设置'), icon: 'settings' }
}))

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

type MenuId = 'doc' | 'view' | 'teach' | 'compute' | null
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
const title = computed(() => PAGE_TITLE.value[state.page])
</script>

<template>
  <header class="ctxbar" :class="{ phone }">
    <button v-if="phone" type="button" class="btn icon ghost" data-ui="nav" :aria-label="tl('页面')" :aria-expanded="shell.navOpen" @click="shell.navOpen = true"><Icon name="menu" :size="19" /></button>

    <!-- The document: name and unsaved mark; its menu holds the file commands, the share link and the exports -->
    <div v-if="studio" class="menu-anchor doc-anchor">
      <button class="btn ghost doc" data-ui="file" :class="{ active: open === 'doc' }" :aria-expanded="open === 'doc'" :title="tl('文件：新建、打开、保存、分享链接、导出')" @click="toggleMenu('doc')">
        <Icon name="file" :size="15" /><span class="doc-text">{{ state.fileName ?? state.scene.name }}</span><span class="dot" :class="{ on: state.dirty }" :title="tl('有未保存的修改')" /><Icon name="chevron" :size="11" />
      </button>
      <div v-if="open === 'doc'" class="menu doc-menu" role="menu">
        <button role="menuitem" @click="act(newScene)"><Icon name="file" />{{ tl('新建') }}<span class="spacer" /><kbd>{{ MOD }}+N</kbd></button>
        <button role="menuitem" @click="act(openScene)"><Icon name="open" />{{ tl('打开…') }}<span class="spacer" /><kbd>{{ MOD }}+O</kbd></button>
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

    <div v-if="studio" class="group-btns">
      <button class="btn icon ghost" data-ui="undo" :title="tl('撤销（{0}+Z）', [MOD])" :aria-label="tl('撤销')" :disabled="!state.past.length" @click="undo"><Icon name="undo" /></button>
      <button v-if="!phone" class="btn icon ghost" :title="tl('重做（{0}+Y）', [MOD])" :aria-label="tl('重做')" :disabled="!state.future.length" @click="redo"><Icon name="redo" /></button>
    </div>

    <!-- The three studio modes -->
    <nav v-if="!phone && studio" v-slide-indicator class="segmented modes" :aria-label="tl('工作模式')">
      <button v-for="m in STUDIO_MODES" :key="m.id" :data-ui="`mode-${m.id}`" :class="{ on: shell.mode === m.id }" :aria-current="shell.mode === m.id ? 'true' : undefined" :title="tl(m.tip)" @click="setStudioMode(m.id)"><Icon :name="m.icon" :size="14" /><span class="lbl">{{ tl(m.label) }}</span></button>
    </nav>

    <span class="spacer" />

    <template v-if="!phone && studio">
      <button class="btn ghost lib" data-ui="templates" :title="tl('经典模型模板')" @click="state.showTemplates = true"><Icon name="template" /><span class="lbl">{{ tl('模板') }}</span></button>
      <button class="btn ghost lib" data-ui="problems" :class="{ active: !!state.problem }" :title="tl('按教材章节的内置题目、导入题目包、用当前场景出题')" @click="state.showProblems = true"><Icon name="problem" /><span class="lbl">{{ tl('题目') }}</span></button>

      <!-- 视图: what the canvas draws (D86), light / dark, the mode's default layout -->
      <div class="menu-anchor">
        <button class="btn ghost lib" data-ui="view" :class="{ active: open === 'view' }" :aria-expanded="open === 'view'" :title="tl('画面上显示的内容、深浅色外观')" @click="toggleMenu('view')"><Icon name="eye" /><span class="lbl">{{ tl('视图') }}</span></button>
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

      <!-- 教学: representations and classroom tools -->
      <div class="menu-anchor">
        <button class="btn ghost lib" data-ui="teach" :class="{ active: open === 'teach' }" :aria-expanded="open === 'teach'" :title="tl('教学工具：受力分析图、纸带、v–t 面积、预测统计')" @click="toggleMenu('teach')"><Icon name="graduation" /><span class="lbl">{{ tl('教学') }}</span></button>
        <div v-if="open === 'teach'" class="menu right" role="menu">
          <button role="menuitem" :disabled="!teachReady()" :title="needResult" @click="act(() => { state.showFbd = true })"><Icon name="fbd" />{{ tl('受力分析图…') }}</button>
          <button role="menuitem" :disabled="!teachReady()" :title="needResult" @click="act(() => { state.showTape = true })"><Icon name="tape" />{{ tl('打点计时器纸带…') }}</button>
          <button role="menuitem" :disabled="!teachReady()" :title="needResult" @click="act(vtArea)"><Icon name="area" />{{ tl('v–t 图面积') }}</button>
          <div class="sep" />
          <button role="menuitem" data-ui="tally" @click="act(() => { tally.open = true })"><Icon name="tally" />{{ tl('先猜后看：班级预测统计…') }}</button>
          <button role="menuitem" @click="act(() => { state.rightTab = 'predict'; shell.sideOpen = true })"><Icon name="target" />{{ tl('个人预测（侧栏）') }}</button>
          <div class="sep" />
          <button role="menuitem" @click="act(() => { state.page = 'classroom' })"><Icon name="classroom" />{{ tl('课堂页：课堂实验与活动') }}</button>
        </div>
      </div>
    </template>
    <button v-if="!phone && !studio && state.page !== 'home'" class="btn ghost find" data-ui="search" @click="state.showPalette = true"><Icon name="search" :size="15" /><span class="lbl muted">{{ tl('搜索模板、题目、公式、工具…') }}</span><kbd>{{ MOD }}+K</kbd></button>

    <div v-if="!phone && (studio || state.page === 'monitor')" class="run">
      <button class="btn primary" data-ui="run" :class="{ quiet: !state.stale && !!state.recording, busy: state.computing }" :title="tl('重新计算（{0}+Enter）', [MOD])" :aria-label="state.stale || !state.recording ? tl('运行仿真') : tl('重新计算')" @click="runSimulation()"><Icon name="run" /><span class="lbl">{{ state.stale || !state.recording ? tl('运行') : tl('重算') }}</span></button>
      <div class="menu-anchor">
        <button class="btn icon ghost" data-ui="compute" :class="{ active: open === 'compute' }" :aria-expanded="open === 'compute'" :title="tl('计算：参数扫描、求解器对照、收敛性研究、计算设置')" :aria-label="tl('计算')" @click="toggleMenu('compute')"><Icon name="chevron" :size="13" /></button>
        <div v-if="open === 'compute'" class="menu right" role="menu">
          <button role="menuitem" @click="act(() => runSimulation())"><Icon name="run" />{{ tl('重新计算') }}<span class="spacer" /><kbd>{{ MOD }}+Enter</kbd></button>
          <button role="menuitem" :disabled="!state.computing" @click="act(cancelSimulation)"><Icon name="stop" />{{ tl('停止计算') }}</button>
          <div class="sep" />
          <button role="menuitem" data-ui="sweep" @click="act(() => { state.showSweep = true })"><Icon name="sweep" />{{ tl('参数扫描…') }}</button>
          <button role="menuitem" @click="act(() => { state.page = 'studio'; state.showSolverCompare = true })"><Icon name="layers" />{{ tl('求解器对照…') }}</button>
          <button role="menuitem" data-ui="convergence" @click="act(() => { state.page = 'studio'; shell.convergence = true })"><Icon name="converge" />{{ tl('收敛性研究…') }}</button>
          <button role="menuitem" @click="act(() => { state.page = 'studio'; state.rightTab = 'settings' })"><Icon name="settings" />{{ tl('计算设置（场景）') }}</button>
        </div>
      </div>
      <SolverBadge class="solver" />
    </div>
    <button v-if="settings.ai.copilot && !phone && studio" class="btn ghost ai-btn" data-ui="copilot" :class="{ active: state.showCopilot && shell.sideOpen }" :aria-pressed="state.showCopilot" :title="tl('Copilot：讲题、生成仿真场景、替你操作（{0}+I）', [MOD])" @click="setCopilotOpen(!(state.showCopilot && shell.sideOpen))"><Icon name="chat" /><span class="lbl">AI</span></button>
    <button v-if="!phone && studio" class="btn icon ghost" data-ui="sidebar" :class="{ active: shell.sideOpen }" :aria-pressed="shell.sideOpen" :title="shell.sideOpen ? tl('收起侧栏（{0}）', [SIDE_KEY]) : tl('展开侧栏（{0}）', [SIDE_KEY])" :aria-label="tl('侧栏')" @click="shell.sideOpen = !shell.sideOpen"><Icon name="sidebar" /></button>
  </header>
</template>

<style scoped>
.ctxbar { display: flex; align-items: center; gap: 4px; padding: 0 8px 0 10px; height: var(--bar-h); flex: 0 0 var(--bar-h); flex-wrap: nowrap; position: relative; z-index: 50; min-width: 0; }
.doc { gap: 6px; padding: 0 8px; max-width: 280px; min-width: 0; font-weight: 600; }
.doc-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--warning); flex: 0 0 auto; visibility: hidden; }
.dot.on { visibility: visible; }
.doc-anchor { min-width: 0; flex: 0 1 auto; }
.ptitle { display: inline-flex; align-items: center; gap: 8px; font-weight: 650; font-size: var(--type-title); padding: 0 6px; min-width: 0; }
.pico { width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); flex: 0 0 auto; }
.ptext { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.modes { flex: 0 0 auto; margin-left: 8px; }
.modes button { gap: 5px; padding: 0 14px; }
.group-btns { display: flex; gap: 2px; flex: 0 0 auto; margin-left: 2px; }
.lib { gap: 5px; padding: 0 9px; }
.find { gap: 8px; min-width: 260px; justify-content: flex-start; background: var(--fill); box-shadow: none; font-weight: 400; }
.find .lbl { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; }
.run { flex: 0 0 auto; display: flex; align-items: center; gap: 2px; margin-left: 6px; }
.run .btn.primary { min-width: 84px; justify-content: center; gap: 5px; white-space: nowrap; }
/* With a current result the run button is still there, but quieter */
.run .btn.primary.quiet { background: var(--pane); color: var(--text); box-shadow: inset 0 0 0 1px var(--border); }
.run .btn.primary.busy :deep(.icon) { animation: spin 900ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.ai-btn { gap: 4px; font-weight: 650; color: var(--accent); }
.menu-anchor { position: relative; flex: 0 0 auto; }
.menu { top: calc(100% + 6px); left: 0; }
.menu.right { left: auto; right: 0; }
.doc-menu { min-width: 250px; }
.menu-check { justify-content: flex-start; }
.menu-check:hover { background: var(--hover) !important; color: inherit !important; }
.display-panel { min-width: 248px; max-height: min(78vh, 640px); overflow: auto; }
.presets { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; padding: 2px 8px 6px; }
.preset { display: flex; flex-direction: column; align-items: center; gap: 2px; border: 0; background: var(--fill); border-radius: 9px; padding: 6px 2px 5px; cursor: pointer; font-size: 11.5px; color: var(--text-2); justify-content: center; }
.preset:hover { background: var(--fill-strong); }
.preset.on { background: var(--accent-soft); color: var(--accent); }
/* Narrow windows: labels give way first, then the solver badge */
@media (max-width: 1360px) { .lib .lbl { display: none; } .doc { max-width: 190px; } }
@media (max-width: 1080px) { .modes .lbl { display: none; } .modes button { padding: 0 10px; } .solver { display: none; } .find { min-width: 0; } .find .lbl, .find kbd { display: none; } }
/* 26.60 (D206): phones — navigation, the document menu and undo */
.ctxbar.phone { gap: 2px; padding: 0 4px; }
.ctxbar.phone .doc-anchor { flex: 1 1 auto; position: static; }
.ctxbar.phone .doc { max-width: 100%; font-size: var(--type-body); }
.ctxbar.phone .spacer { display: none; }
.ctxbar.phone .ptitle { flex: 1 1 auto; }
.ctxbar.phone .doc-menu { position: fixed; left: 6px; right: 6px; top: calc(var(--bar-h) + 4px); max-height: calc(100dvh - 150px); overflow: auto; }
.ctxbar.phone .doc-menu button { min-height: 42px; }
</style>
