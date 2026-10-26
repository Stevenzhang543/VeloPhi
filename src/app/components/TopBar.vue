<script setup lang="ts">
/**
 * Top bar: document name (fixed width, so nothing shifts when it changes), page switcher, file and history
 * commands, run / stop, canvas overlays, analysis and output menus, theme and about.
 * Overlay toggles are inline on wide windows and collapse into the "显示" menu on narrower ones (CSS only).
 */
import AppLogo from './AppLogo.vue'
import Wordmark from './Wordmark.vue'
import { tl, paren } from '../../i18n'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { state, undo, redo, runSimulation, cancelSimulation, problemLocked, showToast } from '../store'
import type { Page } from '../store'
import type { DisplayToggle } from '../settings'
import { settings } from '../settings'
import { newScene, openScene, saveScene } from '../files'
import { MOD } from '../shortcuts'
import Icon from './Icon.vue'
import { vSlideIndicator } from '../slideIndicator'

const PAGES: Array<{ id: Page; label: string; icon: string; key: string }> = [
  { id: 'studio', label: tl('工作台'), icon: 'studio', key: 'Alt+1' },
  { id: 'monitor', label: tl('渲染与监视'), icon: 'monitor', key: 'Alt+2' },
  { id: 'settings', label: tl('设置'), icon: 'settings', key: 'Alt+3' }
]

/**
 * Compaction when the bar does not fit (narrow window, projector mode, large interface scale):
 * 0 full · 1 secondary buttons show icons only · 2 page switcher shows icons only too.
 */
const level = ref(0)
let ro: ResizeObserver | null = null
async function fit() {
  const el = root.value
  if (!el) return
  for (let l = 0; l <= 2; l++) {
    level.value = l
    await nextTick()
    if (el.scrollWidth <= el.clientWidth + 1) return
  }
}

const toggles: Array<{ key: DisplayToggle; label: string; tip: string }> = [
  { key: 'velocity', label: tl('速度'), tip: tl('显示速度矢量') },
  { key: 'acceleration', label: tl('加速度'), tip: tl('显示加速度矢量') },
  { key: 'forces', label: tl('受力'), tip: tl('显示所选物体受力（运行后）') },
  { key: 'trajectory', label: tl('轨迹'), tip: tl('显示质心轨迹') },
  { key: 'labels', label: tl('关键时刻'), tip: tl('在画面上标注碰撞、共速等时刻') },
  { key: 'strobe', label: tl('频闪'), tip: tl('频闪照片：按固定时间间隔叠加物体此前的位置（间隔与张数在设置页“显示”中调整；导出图片与视频时一并绘出）') },
  { key: 'grid', label: tl('网格'), tip: tl('显示网格与比例尺') }
]
const moreToggles: Array<{ key: DisplayToggle; label: string }> = [
  { key: 'forcesAll', label: tl('同时显示所有物体的受力') },
  { key: 'axes', label: tl('坐标轴') },
  { key: 'names', label: tl('物体名称') }
]

type MenuId = 'file' | 'display' | 'output' | 'teach' | null
const open = ref<MenuId>(null)
const root = ref<HTMLElement | null>(null)
function toggleMenu(id: MenuId) { open.value = open.value === id ? null : id }
function closeOnOutside(e: PointerEvent) {
  if (!open.value) return
  const t = e.target as Element
  if (!t.closest('.menu-anchor')) open.value = null
}
function closeOnEsc(e: KeyboardEvent) { if (e.key === 'Escape') open.value = null }
onMounted(() => {
  window.addEventListener('pointerdown', closeOnOutside)
  window.addEventListener('keydown', closeOnEsc)
  ro = new ResizeObserver(() => { fit() })
  if (root.value) ro.observe(root.value)
  fit()
})
onBeforeUnmount(() => { window.removeEventListener('pointerdown', closeOnOutside); window.removeEventListener('keydown', closeOnEsc); ro?.disconnect() })
// Widths change with the page and the run state: re-fit after the switch has painted (never inside it)
let fitTimer: ReturnType<typeof setTimeout> | null = null
watch(() => [state.page, state.computing, state.stale, settings.projector, settings.uiScale], () => {
  if (fitTimer) clearTimeout(fitTimer)
  fitTimer = setTimeout(() => { fitTimer = null; fit() }, 250)
})

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
  state.chart = [`${body.id}.vx`, `${body.id}.vy`]
  showToast(tl('在速度曲线上按住 Shift 拖动，选出时间段即可求面积（位移）'))
}

function toggleTheme() {
  settings.themeMode = state.theme === 'dark' ? 'light' : 'dark'
}
</script>

<template>
  <header ref="root" class="topbar" :class="`fit-${level}`">
    <div class="brand">
      <AppLogo :size="22" />
      <Wordmark class="name" :size="16" />
      <span class="doc small" :title="state.filePath ?? state.fileName ?? state.scene.name"><span class="doc-text">{{ state.fileName ?? state.scene.name }}</span><span class="dot" :class="{ on: state.dirty }" :title="tl('有未保存的修改')">●</span></span>
    </div>

    <!-- File commands in one menu; Ctrl+S / Ctrl+O / Ctrl+N keep working (D56) -->
    <div class="menu-anchor">
      <button class="btn ghost" :class="{ active: open === 'file' }" :title="tl('新建、打开、保存场景')" @click="toggleMenu('file')"><Icon name="file" /><span class="lbl">{{ tl('文件') }}</span><Icon name="chevron" :size="12" /></button>
      <div v-if="open === 'file'" class="menu" role="menu">
        <button role="menuitem" @click="act(newScene)"><Icon name="file" />{{ tl('新建') }}<span class="spacer" /><kbd>{{ MOD }}+N</kbd></button>
        <button role="menuitem" @click="act(openScene)"><Icon name="open" />{{ tl('打开…') }}<span class="spacer" /><kbd>{{ MOD }}+O</kbd></button>
        <div class="sep" />
        <button role="menuitem" @click="act(() => saveScene(false))"><Icon name="save" />{{ tl('保存') }}<span class="spacer" /><kbd>{{ MOD }}+S</kbd></button>
        <button role="menuitem" @click="act(() => saveScene(true))"><Icon name="saveas" />{{ tl('另存为…') }}<span class="spacer" /><kbd>{{ MOD }}+Shift+S</kbd></button>
      </div>
    </div>

    <nav v-slide-indicator class="segmented page-switch" :aria-label="tl('页面')">
      <button v-for="p in PAGES" :key="p.id" :class="{ on: state.page === p.id }" :aria-current="state.page === p.id ? 'page' : undefined" :title="`${p.label}${paren(p.key)}`" @click="state.page = p.id"><Icon :name="p.icon" :size="15" /><span class="lbl page-lbl">{{ p.label }}</span></button>
    </nav>

    <div class="group-btns">
      <button class="btn ghost" :title="tl('经典模型模板')" @click="state.showTemplates = true"><Icon name="template" /><span class="lbl">{{ tl('模板') }}</span></button>
      <button class="btn ghost" :class="{ active: !!state.problem }" :title="tl('按教材章节的内置题目、导入题目包、用当前场景出题')" @click="state.showProblems = true"><Icon name="problem" /><span class="lbl">{{ tl('题目') }}</span></button>
      <div class="menu-anchor">
        <button class="btn ghost" :class="{ active: open === 'teach' }" :title="tl('受力分析图、打点计时器纸带、v–t 图面积')" @click="toggleMenu('teach')"><Icon name="graduation" /><span class="lbl">{{ tl('教学') }}</span><Icon name="chevron" :size="12" /></button>
        <div v-if="open === 'teach'" class="menu" role="menu">
          <button role="menuitem" :disabled="!teachReady()" @click="act(() => { state.showFbd = true })"><Icon name="fbd" />{{ tl('受力分析图…') }}<span class="spacer" /><span class="tiny muted">SVG · PNG</span></button>
          <button role="menuitem" :disabled="!teachReady()" @click="act(() => { state.showTape = true })"><Icon name="tape" />{{ tl('打点计时器纸带…') }}<span class="spacer" /><span class="tiny muted">PNG · CSV</span></button>
          <button role="menuitem" :disabled="!teachReady()" @click="act(vtArea)"><Icon name="area" />{{ tl('v–t 图面积') }}<span class="spacer" /><span class="tiny muted">Shift+{{ tl('拖动') }}</span></button>
          <div v-if="problemLocked()" class="menu-note tiny muted">{{ tl('作答期间不可用，揭晓答案后再打开。') }}</div>
        </div>
      </div>
    </div>
    <div class="group-btns">
      <button class="btn icon ghost" :title="tl('撤销（{0}+Z）', [MOD])" :disabled="!state.past.length" @click="undo"><Icon name="undo" /></button>
      <button class="btn icon ghost" :title="tl('重做（{0}+Y）', [MOD])" :disabled="!state.future.length" @click="redo"><Icon name="redo" /></button>
    </div>
    <div class="run">
      <button v-if="!state.computing" class="btn primary" :title="tl('重新计算（{0}+Enter）', [MOD])" @click="runSimulation()"><Icon name="run" />{{ state.stale ? tl('运行仿真') : tl('重新计算') }}</button>
      <button v-else class="btn primary computing" :title="tl('停止计算（已算出的部分保留）')" @click="cancelSimulation()">
        <Icon name="stop" :size="12" />{{ state.run.unbounded ? tl('停止计算') : tl('计算中 {0}%', [Math.round(state.progress * 100)]) }}
        <i class="run-progress" :style="{ transform: `scaleX(${state.progress})` }" />
      </button>
    </div>

    <div v-show="state.page !== 'settings'" class="toggles inline-toggles">
      <button v-for="t in toggles" :key="t.key" class="btn small" :class="{ active: state.display[t.key] }" :title="t.tip" :aria-pressed="state.display[t.key]" @click="state.display[t.key] = !state.display[t.key]">{{ t.label }}</button>
      <label class="check tiny" :title="tl('同时显示所有物体的受力')"><input v-model="state.display.forcesAll" type="checkbox" :disabled="!state.display.forces" />{{ tl('全部受力') }}</label>
    </div>

    <span class="spacer" />

    <div v-show="state.page !== 'settings'" class="menu-anchor display-menu">
      <button class="btn ghost" :class="{ active: open === 'display' }" :title="tl('画面上显示的内容')" @click="toggleMenu('display')"><Icon name="eye" /><span class="lbl">{{ tl('显示') }}</span><Icon name="chevron" :size="12" /></button>
      <div v-if="open === 'display'" class="menu" role="menu">
        <div class="menu-title">{{ tl('叠加显示') }}</div>
        <label v-for="t in [...toggles, ...moreToggles]" :key="t.key" class="menu-check" role="menuitemcheckbox" :aria-checked="state.display[t.key]">
          <input v-model="state.display[t.key]" type="checkbox" class="switch" :disabled="t.key === 'forcesAll' && !state.display.forces" /><span>{{ t.label }}</span>
        </label>
        <div class="sep" />
        <button @click="act(() => { state.page = 'settings' })"><Icon name="sliders" />{{ tl('更多显示与视觉效果设置…') }}</button>
      </div>
    </div>

    <button class="btn ghost" :title="tl('选一个参数和范围批量运行，得到“结果–参数”曲线')" @click="state.showSweep = true"><Icon name="sweep" /><span class="lbl">{{ tl('参数扫描') }}</span></button>

    <div class="menu-anchor">
      <button class="btn ghost" :class="{ active: open === 'output' }" :title="tl('导出数据、视频、课件与报告')" @click="toggleMenu('output')"><Icon name="export" /><span class="lbl">{{ tl('输出') }}</span><Icon name="chevron" :size="12" /></button>
      <div v-if="open === 'output'" class="menu right" role="menu">
        <button role="menuitem" :disabled="!hasResult()" @click="act(() => { state.showExport = true })"><Icon name="download" />{{ tl('数据与视频…') }}<span class="spacer" /><span class="tiny muted">CSV · MP4</span></button>
        <button role="menuitem" :disabled="!hasResult()" @click="act(() => { state.showCourseware = true })"><Icon name="courseware" />{{ tl('课件导出…') }}<span class="spacer" /><span class="tiny muted">{{ tl('视频 · 截图 · 公式') }}</span></button>
        <button role="menuitem" :disabled="!hasResult()" @click="act(() => { state.showReport = true })"><Icon name="report" />{{ tl('实验报告…') }}<span class="spacer" /><span class="tiny muted">HTML · PDF</span></button>
      </div>
    </div>

    <button class="btn icon ghost" :title="state.theme === 'dark' ? tl('浅色外观') : tl('深色外观')" @click="toggleTheme"><Icon :name="state.theme === 'dark' ? 'sun' : 'moon'" /></button>
    <button class="btn icon ghost" :title="tl('关于与快捷键')" @click="state.showAbout = true"><Icon name="info" /></button>
  </header>
</template>

<style scoped>
.topbar { display: flex; align-items: center; gap: 8px; padding: 8px 4px; min-height: 52px; flex-wrap: nowrap; position: relative; z-index: 50; overflow: hidden; }
.topbar:has(.menu) { overflow: visible; }
.brand { display: flex; align-items: center; gap: 8px; margin-right: 2px; flex: 0 0 auto; }
.name { font-size: calc(16px * var(--zoom)) !important; }
/* Fixed width: the buttons stay put when the file name changes */
.doc { width: 168px; display: inline-flex; align-items: center; gap: 4px; color: var(--text-3); }
.doc-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.dot { color: var(--warning); font-size: 10px; flex: 0 0 auto; visibility: hidden; }
.dot.on { visibility: visible; }
.page-switch { flex: 0 0 auto; }
.group-btns { display: flex; gap: 2px; flex: 0 0 auto; }
.run { flex: 0 0 auto; min-width: 122px; }
.run .btn { width: 100%; justify-content: center; position: relative; overflow: hidden; white-space: nowrap; }
.run .computing { background: color-mix(in srgb, var(--accent) 82%, #000); }
.run-progress { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(255, 255, 255, 0.85); transform-origin: left; transition: transform 200ms linear; }
.toggles { display: flex; gap: 3px; align-items: center; flex: 0 0 auto; }
.toggles .btn { height: 26px; padding: 0 9px; }
.menu-anchor { position: relative; flex: 0 0 auto; }
.menu { top: calc(100% + 6px); left: 0; }
.menu.right { left: auto; right: 0; }
.menu-check { justify-content: flex-start; }
.menu-note { padding: 4px 10px 6px; max-width: 240px; line-height: 1.4; }
.menu-check:hover { background: var(--hover) !important; color: inherit !important; }
.display-menu { display: none; }
/* Narrow windows: the overlay toggles live in the "显示" menu */
@media (max-width: 1620px) {
  .inline-toggles { display: none !important; }
  .display-menu { display: block; }
}
.fit-1 .lbl:not(.page-lbl), .fit-2 .lbl { display: none; }
.fit-1 .doc, .fit-2 .doc { width: 120px; }
.fit-2 .page-switch button { padding: 0 9px; }
</style>
