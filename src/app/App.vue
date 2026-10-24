<script setup lang="ts">
/**
 * Application shell: top bar, the three pages (studio, monitor and settings), dialogs and toasts. Pages stay
 * mounted once shown so switching is instant (hidden with content-visibility, layout kept); panels on hidden
 * pages and hidden tabs get `active = false` and stop following playback. The monitor and settings pages are
 * mounted on first use or when the browser is idle after startup, whichever comes first.
 */
import { computed, onBeforeUnmount, onMounted, provide, reactive, ref, watch } from 'vue'
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
import ExportDialog from './components/ExportDialog.vue'
import AboutDialog from './components/AboutDialog.vue'
import CoursewareDialog from './components/CoursewareDialog.vue'
import SweepDialog from './components/SweepDialog.vue'
import ReportDialog from './components/ReportDialog.vue'
import PredictionPanel from './components/PredictionPanel.vue'
import { editor } from './editor/editorState'
import MonitorPage from './components/MonitorPage.vue'
import SettingsPage from './components/SettingsPage.vue'
import { isDesktop } from '../platform/files'
import { PAGE_ACTIVE } from './live'
import { settings } from './settings'
import { logEvent } from './trialLog'

const bottomHeight = ref(290)
const rightWidth = ref(380)

const studioOn = computed(() => state.page === 'studio')
// The studio page lives in this template; the other pages provide their own flag
provide(PAGE_ACTIVE, studioOn)

/** Pages mounted so far (kept mounted afterwards). */
const mounted = reactive<Record<Page, boolean>>({ studio: true, monitor: state.page === 'monitor', settings: state.page === 'settings' })
/** Pages laid out at least once (hidden pages keep their layout, so showing them again is cheap). */
const warmed = reactive<Record<Page, boolean>>({ studio: true, monitor: false, settings: false })
watch(() => state.page, p => { mounted[p] = true; logEvent('page.open', { page: p }) })
// Trial log: which dialogs are used (ids only)
const DIALOGS = { export: () => state.showExport, courseware: () => state.showCourseware, sweep: () => state.showSweep, report: () => state.showReport, templates: () => state.showTemplates } as const
for (const [dialog, open] of Object.entries(DIALOGS)) watch(open, v => { if (v) logEvent('dialog.open', { dialog }) })
watch(() => [mounted.monitor, mounted.settings], () => {
  for (const p of ['monitor', 'settings'] as const) {
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

const PAGE_KEYS: Record<string, Page> = { Digit1: 'studio', Digit2: 'monitor', Digit3: 'settings' }

function onKey(e: KeyboardEvent) {
  const mod = e.ctrlKey || e.metaKey
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveScene(e.shiftKey); return }
  if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); openScene(); return }
  if (mod && e.key.toLowerCase() === 'n') { e.preventDefault(); newScene(); return }
  if (mod && e.key === 'Enter') { e.preventDefault(); runSimulation(); return }
  if (mod && e.key === ',') { e.preventDefault(); state.page = 'settings'; return }
  if (e.altKey && !mod && PAGE_KEYS[e.code]) { e.preventDefault(); state.page = PAGE_KEYS[e.code]; return }
  if (typing(e)) return
  if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return }
  if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return }
  // Playback and editing keys belong to the studio and monitor pages
  if (state.page === 'settings') return
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
  if (typing(e) || state.page === 'settings' || editor.spacePanned) return
  if (state.playing) pause(); else play()
}

function beforeUnload(e: BeforeUnloadEvent) { if (state.dirty) { e.preventDefault(); e.returnValue = '' } }

/** Mount the other pages while the browser is idle, so even the first switch is instant. */
function premount() {
  const idle = (cb: () => void) => ('requestIdleCallback' in window ? (window as Window & { requestIdleCallback: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback(cb, { timeout: 4000 }) : setTimeout(cb, 1500))
  setTimeout(() => idle(() => { mounted.monitor = true; idle(() => { mounted.settings = true }) }), 1200)
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
    const leave = await ask('当前场景有未保存的修改，确定退出吗？', { title: 'Verity', kind: 'warning', okLabel: '退出', cancelLabel: '取消' })
    if (!leave) e.preventDefault()
  })
})
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('beforeunload', beforeUnload); unlistenClose?.() })

/** Narrowest right panel: its five tabs must stay readable at the current interface scale. */
const minRight = () => Math.round(300 * settings.uiScale * (settings.projector ? 1.18 : 1))
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

const RIGHT_TABS: Array<{ id: typeof state.rightTab; label: string }> = [
  { id: 'formula', label: '公式对照' }, { id: 'inspect', label: '属性' }, { id: 'watch', label: '监视' }, { id: 'predict', label: '预测' }, { id: 'settings', label: '场景' }
]
</script>

<template>
  <div class="ambient" aria-hidden="true"><i /><i /><i /><i /></div>
  <div class="app" :style="{ '--bottom-h': `${bottomHeight}px`, '--right-w': `${rightWidth}px` }">
    <TopBar class="top" />
    <div class="pages">
        <div class="page page-studio" :class="pageClass('studio')" :inert="!studioOn">
          <aside class="left"><LeftPanel /></aside>
          <main class="center">
            <div class="view"><Viewport variant="studio" /></div>
            <div class="split-h" @mousedown.prevent="dragSplit('bottom', $event)" />
            <section class="pane bottom">
              <Timeline :active="studioOn" />
              <div class="bottom-tabs">
                <div class="tabs"><button :class="{ on: state.bottomTab === 'chart' }" @click="state.bottomTab = 'chart'">曲线</button><button :class="{ on: state.bottomTab === 'events' }" @click="state.bottomTab = 'events'">事件</button></div>
              </div>
              <div class="bottom-body">
                <ChartPanel :class="tabClass(state.bottomTab === 'chart')" :inert="state.bottomTab !== 'chart'" :active="studioOn && state.bottomTab === 'chart'" />
                <EventList :class="tabClass(state.bottomTab === 'events')" :inert="state.bottomTab !== 'events'" :active="studioOn && state.bottomTab === 'events'" />
              </div>
            </section>
          </main>
          <div class="split-v" @mousedown.prevent="dragSplit('right', $event)" />
          <aside class="pane right">
            <div class="right-head">
              <div class="tabs" role="tablist">
                <button v-for="t in RIGHT_TABS" :key="t.id" role="tab" :aria-selected="state.rightTab === t.id" :class="{ on: state.rightTab === t.id }" @click="state.rightTab = t.id">{{ t.label }}</button>
              </div>
            </div>
            <div class="tab-stack">
              <div class="tab-panel" :class="tabClass(state.rightTab === 'formula')" :inert="state.rightTab !== 'formula'"><FormulaPanel :active="studioOn && state.rightTab === 'formula'" /></div>
              <div class="tab-panel" :class="tabClass(state.rightTab === 'inspect')" :inert="state.rightTab !== 'inspect'"><Inspector /></div>
              <div class="tab-panel" :class="tabClass(state.rightTab === 'watch')" :inert="state.rightTab !== 'watch'"><WatchPanel :active="studioOn && state.rightTab === 'watch'" /></div>
              <div class="tab-panel" :class="tabClass(state.rightTab === 'predict')" :inert="state.rightTab !== 'predict'"><PredictionPanel /></div>
              <div class="tab-panel" :class="tabClass(state.rightTab === 'settings')" :inert="state.rightTab !== 'settings'"><SettingsPanel /></div>
            </div>
          </aside>
        </div>
        <MonitorPage v-if="mounted.monitor" class="page" :class="pageClass('monitor')" :inert="state.page !== 'monitor'" :active="state.page === 'monitor'" />
        <SettingsPage v-if="mounted.settings" class="page" :class="pageClass('settings')" :inert="state.page !== 'settings'" :active="state.page === 'settings'" />
    </div>
    <TemplateGallery v-if="state.showTemplates" />
    <ExportDialog v-if="state.showExport && state.recording" />
    <AboutDialog v-if="state.showAbout" />
    <CoursewareDialog v-if="state.showCourseware && state.recording" />
    <SweepDialog v-if="state.showSweep" />
    <ReportDialog v-if="state.showReport && state.recording" />
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
/* Five tabs in a narrow panel: smaller labels before anything is cut */
@container (max-width: 330px) { .right-head .tabs button { font-size: var(--type-tiny); padding: 0 2px; } }
.tab-stack { flex: 1; min-height: 0; position: relative; }
.tab-panel { position: absolute; inset: 0; overflow: auto; padding: 4px 12px 12px; }
</style>
