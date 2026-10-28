<script setup lang="ts">
/**
 * Application shell: top bar, the three pages (studio, monitor and settings), dialogs and toasts. Pages stay
 * mounted once shown so switching is instant (hidden with content-visibility, layout kept); panels on hidden
 * pages and hidden tabs get `active = false` and stop following playback. The monitor and settings pages are
 * mounted on first use or when the browser is idle after startup, whichever comes first.
 */
import { locale, tl } from '../i18n'
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, provide, reactive, ref, watch } from 'vue'
import { state, undo, redo, runSimulation, play, pause, seekFrame, edit } from './store'
import type { Page } from './store'
import { deleteObject } from './editing'
import { openScene, saveScene, newScene } from './files'
import TopBar from './components/TopBar.vue'
import LeftPanel from './components/LeftPanel.vue'
import Viewport from './components/Viewport.vue'
import Inspector from './components/Inspector.vue'
import FormulaPanel from './components/FormulaPanel.vue'
import WatchPanel from './components/WatchPanel.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import Timeline from './components/Timeline.vue'
import ChartPanel from './components/ChartPanel.vue'
import EventList from './components/EventList.vue'
import TemplateGallery from './components/TemplateGallery.vue'
const ExportDialog = defineAsyncComponent(() => import('./components/ExportDialog.vue'))
const AboutDialog = defineAsyncComponent(() => import('./components/AboutDialog.vue'))
const CoursewareDialog = defineAsyncComponent(() => import('./components/CoursewareDialog.vue'))
const SweepDialog = defineAsyncComponent(() => import('./components/SweepDialog.vue'))
const ReportDialog = defineAsyncComponent(() => import('./components/ReportDialog.vue'))
const FbdDialog = defineAsyncComponent(() => import('./components/FbdDialog.vue'))
const TapeDialog = defineAsyncComponent(() => import('./components/TapeDialog.vue'))
const ProblemGallery = defineAsyncComponent(() => import('./components/ProblemGallery.vue'))
// 26.55 (D96): learning path and global search
const LearningPath = defineAsyncComponent(() => import('./components/LearningPath.vue'))
const CommandPalette = defineAsyncComponent(() => import('./components/CommandPalette.vue'))
// 26.56: teaching activities and the model catalogue (D102, D105)
const ActivityRunner = defineAsyncComponent(() => import('./components/ActivityRunner.vue'))
const ModelCatalog = defineAsyncComponent(() => import('./components/models/ModelCatalog.vue'))
import ProblemPanel from './components/ProblemPanel.vue'
import PredictionPanel from './components/PredictionPanel.vue'
import { editor } from './editor/editorState'
import MonitorPage from './components/MonitorPage.vue'
// 26.55 (D97): the lab and settings pages load on their first visit (smaller start-up bundle)
const SettingsPage = defineAsyncComponent(() => import('./components/SettingsPage.vue'))
const LabPage = defineAsyncComponent(() => import('./components/lab/LabPage.vue'))
import DetailPanel from './components/DetailPanel.vue'
import { isDesktop } from '../platform/files'
import { PAGE_ACTIVE } from './live'
import { settings } from './settings'
import { vSlideIndicator } from './slideIndicator'
import Icon from './components/Icon.vue'
import { logEvent } from './trialLog'
import { drawerOpen, narrow, railOn } from './layout'

const bottomHeight = ref(290)
const rightWidth = ref(380)

const studioOn = computed(() => state.page === 'studio')
// The studio page lives in this template; the other pages provide their own flag
provide(PAGE_ACTIVE, studioOn)

/** Pages mounted so far (kept mounted afterwards). */
const mounted = reactive<Record<Page, boolean>>({ studio: true, lab: state.page === 'lab', monitor: state.page === 'monitor', settings: state.page === 'settings' })
/** Pages laid out at least once (hidden pages keep their layout, so showing them again is cheap). */
const warmed = reactive<Record<Page, boolean>>({ studio: true, lab: false, monitor: false, settings: false })
watch(() => state.page, p => { mounted[p] = true; logEvent('page.open', { page: p }) })
// Trial log: which dialogs are used (ids only)
const DIALOGS = { export: () => state.showExport, courseware: () => state.showCourseware, sweep: () => state.showSweep, report: () => state.showReport, fbd: () => state.showFbd, tape: () => state.showTape, problems: () => state.showProblems, templates: () => state.showTemplates, learning: () => state.showLearning, search: () => state.showPalette } as const
for (const [dialog, open] of Object.entries(DIALOGS)) watch(open, v => { if (v) logEvent('dialog.open', { dialog }) })
watch(() => [mounted.lab, mounted.monitor, mounted.settings], () => {
  for (const p of ['lab', 'monitor', 'settings'] as const) {
    if (mounted[p] && !warmed[p]) requestAnimationFrame(() => requestAnimationFrame(() => { warmed[p] = true }))
  }
})
/**
 * Hidden pages and tabs are not display:none (which would lay them out from scratch on every switch) but
 * content-visibility: hidden, which skips their rendering while keeping the layout for an instant switch back.
 * A freshly mounted page is laid out once invisibly ("warming") before it is hidden.
 */
function pageClass(p: Page) { return state.page === p ? 'is-on' : warmed[p] ? 'is-off' : 'is-warming' }
const tabClass = (on: boolean) => (on ? 'is-on' : 'is-off')

function typing(e: KeyboardEvent) {
  const t = e.target as HTMLElement
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable
}

const PAGE_KEYS: Record<string, Page> = { Digit1: 'studio', Digit2: 'lab', Digit3: 'monitor', Digit4: 'settings' }

function onKey(e: KeyboardEvent) {
  const mod = e.ctrlKey || e.metaKey
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveScene(e.shiftKey); return }
  if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); openScene(); return }
  if (mod && e.key.toLowerCase() === 'n') { e.preventDefault(); newScene(); return }
  if (mod && e.key === 'Enter') { e.preventDefault(); runSimulation(); return }
  if (mod && e.key === ',') { e.preventDefault(); state.page = 'settings'; return }
  // 26.55 (D96): global search, also from inside a text field
  if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); state.showPalette = !state.showPalette; return }
  if (e.altKey && !mod && PAGE_KEYS[e.code]) { e.preventDefault(); state.page = PAGE_KEYS[e.code]; return }
  if (typing(e)) return
  if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return }
  if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return }
  // Playback and editing keys belong to the studio and monitor pages (the lab has its own)
  if (state.page === 'settings' || state.page === 'lab') return
  // Space toggles playback on release, unless it was held to pan the view (Space + drag)
  if (e.key === ' ') { e.preventDefault(); if (!e.repeat) { spaceHeld = true; editor.spacePanned = false } return }
  if (e.key === 'ArrowRight') { pause(); seekFrame(state.frame + (e.shiftKey ? 10 : 1)); return }
  if (e.key === 'ArrowLeft') { pause(); seekFrame(state.frame - (e.shiftKey ? 10 : 1)); return }
  if (e.key === 'Home') { pause(); seekFrame(0); return }
  if (e.key === 'End') { pause(); seekFrame(Number.MAX_SAFE_INTEGER); return }
  if (e.key === 'Escape') { state.tool = 'select'; state.pendingConnector = null; return }
  if (state.page !== 'studio') return
  if ((e.key === 'Delete' || e.key === 'Backspace') && state.selection) { const sel = state.selection; edit(s => deleteObject(s, sel)); state.selection = null; return }
  if (e.key.toLowerCase() === 'v' && !mod) state.tool = 'select'
}

let spaceHeld = false
function onKeyUp(e: KeyboardEvent) {
  if (e.key !== ' ' || !spaceHeld) return
  spaceHeld = false
  if (typing(e) || state.page === 'settings' || state.page === 'lab' || editor.spacePanned) return
  if (state.playing) pause(); else play()
}

function beforeUnload(e: BeforeUnloadEvent) { if (state.dirty) { e.preventDefault(); e.returnValue = '' } }

/** Mount the other pages while the browser is idle, so even the first switch is instant. */
function premount() {
  const idle = (cb: () => void) => ('requestIdleCallback' in window ? (window as Window & { requestIdleCallback: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback(cb, { timeout: 4000 }) : setTimeout(cb, 1500))
  setTimeout(() => idle(() => { mounted.monitor = true; idle(() => { mounted.settings = true; idle(() => { mounted.lab = true }) }) }), 1200)
}

let unlistenClose: (() => void) | null = null
onMounted(async () => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKeyUp)
  premount()
  if (!isDesktop) { window.addEventListener('beforeunload', beforeUnload); return }
  // Desktop: ask before closing a window with unsaved changes
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const { ask } = await import('@tauri-apps/plugin-dialog')
  unlistenClose = await getCurrentWindow().onCloseRequested(async e => {
    if (!state.dirty) return
    const leave = await ask(tl('当前场景有未保存的修改，确定退出吗？'), { title: 'VeloPhi', kind: 'warning', okLabel: tl('退出'), cancelLabel: tl('取消') })
    if (!leave) e.preventDefault()
  })
})
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('beforeunload', beforeUnload); unlistenClose?.() })

/** Narrowest right panel: its tabs must stay readable at the current interface scale. */
const minRight = () => Math.round(280 * settings.uiScale * (settings.projector ? 1.18 : 1))
watch(() => [settings.uiScale, settings.projector], () => { rightWidth.value = Math.max(rightWidth.value, minRight()) }, { immediate: true })

function dragSplit(kind: 'bottom' | 'right', e: MouseEvent) {
  const start = { x: e.clientX, y: e.clientY, h: bottomHeight.value, w: rightWidth.value }
  const move = (ev: MouseEvent) => {
    if (kind === 'bottom') bottomHeight.value = Math.max(150, Math.min(window.innerHeight - 260, start.h - (ev.clientY - start.y)))
    else rightWidth.value = Math.max(minRight(), Math.min(640, start.w - (ev.clientX - start.x)))
  }
  const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}

/**
 * Right panel (26.54, D86): three tabs — analysis (formulas, watch, prediction as a second-level switch), properties
 * and scene — plus the problem tab in problem mode. `state.rightTab` keeps naming the panel shown; the top tab and
 * the analysis page are derived from it and remembered in the settings.
 */
type TopTab = 'problem' | 'analysis' | 'inspect' | 'settings'
const ANALYSIS = ['formula', 'watch', 'predict'] as const
const isAnalysis = (t: typeof state.rightTab): t is (typeof ANALYSIS)[number] => (ANALYSIS as readonly string[]).includes(t)
const topTab = computed<TopTab>(() => (isAnalysis(state.rightTab) ? 'analysis' : state.rightTab))
/** Labels are computed so that a language change relabels them (App itself is not remounted). */
const RIGHT_TABS = computed((): Array<{ id: TopTab; label: string }> => [
  // The problem tab exists while a problem is open (26.52, D40)
  ...(state.problem ? [{ id: 'problem' as const, label: tl('题目') }] : []),
  { id: 'analysis', label: tl('分析') }, { id: 'inspect', label: tl('属性') }, { id: 'settings', label: tl('场景') }
])
const ANALYSIS_TABS = computed(() => [{ id: 'formula' as const, label: tl('公式') }, { id: 'watch' as const, label: tl('监视') }, { id: 'predict' as const, label: tl('预测') }])
function openTop(t: TopTab) { state.rightTab = t === 'analysis' ? settings.ui.analysisTab : t }
// Remember the tab (restored at the next start) and the page of the analysis tab
if (settings.ui.rightTab && state.rightTab !== settings.ui.rightTab) state.rightTab = settings.ui.rightTab
watch(() => state.rightTab, t => {
  if (t === 'problem') return
  settings.ui.rightTab = t
  if (isAnalysis(t)) settings.ui.analysisTab = t
})
// Leaving problem mode on the problem tab shows the formula cards
watch(() => state.problem, p => { if (!p && state.rightTab === 'problem') state.rightTab = 'formula' })
</script>

<template>
  <div class="ambient" aria-hidden="true"><i /><i /><i /><i /></div>
  <div :key="locale.lang" class="app" :style="{ '--bottom-h': `${bottomHeight}px`, '--right-w': `${rightWidth}px` }">
    <TopBar class="top" />
    <div class="pages">
        <div class="page page-studio" :class="[pageClass('studio'), { rail: railOn, narrow, 'drawer-open': drawerOpen }]" :inert="!studioOn">
          <aside class="left"><LeftPanel /></aside>
          <main class="center">
            <div class="view"><Viewport variant="studio" /></div>
            <div class="split-h" @mousedown.prevent="dragSplit('bottom', $event)" />
            <section class="pane bottom">
              <Timeline :active="studioOn" />
              <div class="bottom-tabs">
                <div v-slide-indicator class="tabs"><button :class="{ on: state.bottomTab === 'chart' }" @click="state.bottomTab = 'chart'">{{ tl('曲线') }}</button><button :class="{ on: state.bottomTab === 'events' }" @click="state.bottomTab = 'events'">{{ tl('事件') }}</button></div>
              </div>
              <div class="bottom-body">
                <ChartPanel :class="tabClass(state.bottomTab === 'chart')" :inert="state.bottomTab !== 'chart'" :active="studioOn && state.bottomTab === 'chart'" />
                <EventList :class="tabClass(state.bottomTab === 'events')" :inert="state.bottomTab !== 'events'" :active="studioOn && state.bottomTab === 'events'" />
              </div>
            </section>
          </main>
          <div class="split-v" @mousedown.prevent="dragSplit('right', $event)" />
          <!-- 26.55: in a narrow window the right panel is a drawer over the canvas -->
          <button v-if="narrow" class="drawer-btn btn small" :aria-expanded="drawerOpen" :title="drawerOpen ? tl('收起面板') : tl('分析、属性与场景')" @click="drawerOpen = !drawerOpen"><Icon :name="drawerOpen ? 'close' : 'sidebar'" :size="14" />{{ drawerOpen ? tl('收起') : tl('面板') }}</button>
          <aside class="pane right">
            <div class="right-head">
              <div v-slide-indicator class="tabs" :class="{ four: !!state.problem }" role="tablist">
                <button v-for="t in RIGHT_TABS" :key="t.id" role="tab" :aria-selected="topTab === t.id" :class="{ on: topTab === t.id }" @click="openTop(t.id)">{{ t.label }}</button>
              </div>
              <!-- Second level of the analysis tab (D86) -->
              <div v-if="topTab === 'analysis'" class="subtabs" role="tablist" :aria-label="tl('分析')">
                <button v-for="t in ANALYSIS_TABS" :key="t.id" role="tab" :aria-selected="state.rightTab === t.id" :class="{ on: state.rightTab === t.id }" @click="state.rightTab = t.id">{{ t.label }}</button>
              </div>
            </div>
            <div class="tab-stack">
              <div v-if="state.problem" class="tab-panel" :class="tabClass(state.rightTab === 'problem')" :inert="state.rightTab !== 'problem'"><ProblemPanel /></div>
              <div class="tab-panel" :class="tabClass(state.rightTab === 'formula')" :inert="state.rightTab !== 'formula'"><FormulaPanel :active="studioOn && state.rightTab === 'formula'" /></div>
              <div class="tab-panel" :class="tabClass(state.rightTab === 'inspect')" :inert="state.rightTab !== 'inspect'"><Inspector /></div>
              <div class="tab-panel" :class="tabClass(state.rightTab === 'watch')" :inert="state.rightTab !== 'watch'"><WatchPanel :active="studioOn && state.rightTab === 'watch'" /></div>
              <div class="tab-panel" :class="tabClass(state.rightTab === 'predict')" :inert="state.rightTab !== 'predict'"><PredictionPanel /></div>
              <div class="tab-panel" :class="tabClass(state.rightTab === 'settings')" :inert="state.rightTab !== 'settings'"><SettingsPanel /></div>
            </div>
          </aside>
        </div>
        <LabPage v-if="mounted.lab" class="page" :class="pageClass('lab')" :inert="state.page !== 'lab'" :active="state.page === 'lab'" />
        <MonitorPage v-if="mounted.monitor" class="page" :class="pageClass('monitor')" :inert="state.page !== 'monitor'" :active="state.page === 'monitor'" />
        <SettingsPage v-if="mounted.settings" class="page" :class="pageClass('settings')" :inert="state.page !== 'settings'" :active="state.page === 'settings'" />
        <DetailPanel />
    </div>
    <TemplateGallery v-if="state.showTemplates" />
    <ExportDialog v-if="state.showExport && state.recording" />
    <AboutDialog v-if="state.showAbout" />
    <CoursewareDialog v-if="state.showCourseware && state.recording" />
    <SweepDialog v-if="state.showSweep" />
    <ReportDialog v-if="state.showReport && state.recording" />
    <FbdDialog v-if="state.showFbd && state.recording" />
    <TapeDialog v-if="state.showTape && state.recording" />
    <ProblemGallery v-if="state.showProblems" />
    <LearningPath v-if="state.showLearning" />
    <CommandPalette v-if="state.showPalette" />
    <ModelCatalog v-if="state.showModels" />
    <ActivityRunner v-if="state.activity" :key="state.activity" />
    <div v-if="state.toast" class="toast" :class="{ error: state.toast.error }" role="status">{{ state.toast.text }}</div>
  </div>
</template>

<style scoped>
.app {
  position: relative;
  z-index: 1;
  height: 100vh;
  display: flex;
  flex-direction: column;
  padding: 0 8px 8px;
}
.top { flex: 0 0 auto; }
.pages { flex: 1; min-height: 0; display: grid; position: relative; }
.page { grid-area: 1 / 1; min-width: 0; min-height: 0; }
.page-studio {
  display: grid;
  grid-template-columns: var(--left-w) 1fr 6px var(--right-w);
  grid-template-rows: minmax(0, 1fr);
  grid-template-areas: 'left center splitv right';
  gap: 0 8px;
}
.left { grid-area: left; min-height: 0; }
/* Icon rail of the tool palette (D56) */
.page-studio.rail { --left-w: calc(56px * var(--zoom)); }
.center { grid-area: center; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.view { flex: 1; min-height: 160px; }
.split-h { height: 8px; cursor: row-resize; flex: 0 0 auto; }
.split-v { grid-area: splitv; cursor: col-resize; margin: 0 -4px; }
.bottom { height: var(--bottom-h); flex: 0 0 auto; }
.bottom-tabs { padding: 0 12px 4px; display: flex; }
.bottom-tabs .tabs { width: 160px; }
.bottom-body { flex: 1; min-height: 0; position: relative; }
.bottom-body > * { position: absolute; inset: 0; }
.right { grid-area: right; min-height: 0; }
.right-head { padding: 10px 10px 6px; container-type: inline-size; }
/* Three tabs (four in problem mode) and the analysis switch below them (D86) */
.right-head .tabs.four button { flex: 1 1 auto; padding: 0 3px; }
@container (max-width: 300px) { .right-head .tabs button { font-size: var(--type-tiny); padding: 0 2px; } }
.subtabs { display: flex; gap: 2px; margin-top: 6px; position: relative; }
.subtabs button { flex: 1; border: 0; background: none; color: var(--text-2); font-size: var(--type-small); padding: 3px 4px; border-radius: 6px; cursor: pointer; border-bottom: 2px solid transparent; }
.subtabs button:hover { color: var(--text); background: var(--hover); }
.subtabs button.on { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }
.tab-stack { flex: 1; min-height: 0; position: relative; }
.tab-panel { position: absolute; inset: 0; overflow: auto; padding: 4px 12px 12px; }
/* 26.55 (D96): narrow windows — the right panel becomes a drawer over the canvas; phones stack the bottom pane */
.drawer-btn { display: none; }
.page-studio.narrow { grid-template-columns: var(--left-w) 1fr; grid-template-areas: 'left center'; position: relative; }
.page-studio.narrow .split-v { display: none; }
.page-studio.narrow .drawer-btn { display: inline-flex; position: absolute; top: 10px; right: 12px; z-index: 6; gap: 4px; box-shadow: var(--shadow); }
.page-studio.narrow .right { grid-area: auto; background: var(--pane); position: absolute; top: 0; right: 0; bottom: 0; width: min(var(--right-w), 92vw); z-index: 5; transform: translateX(105%); transition: transform 0.2s ease; box-shadow: -8px 0 24px rgba(0, 0, 0, 0.18); }
.page-studio.narrow.drawer-open .right { transform: none; }
.page-studio.narrow.drawer-open .drawer-btn { top: auto; bottom: 12px; right: 14px; }
@media (max-width: 760px) {
  .app { padding: 0 4px 4px; }
  .page-studio.narrow .right { width: 100%; }
  .bottom { height: min(var(--bottom-h), 42vh); }
}
@media (prefers-reduced-motion: reduce) { .page-studio.narrow .right { transition: none; } }
</style>
