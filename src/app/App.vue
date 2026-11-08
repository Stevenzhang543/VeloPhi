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
import { overlapPrompt } from './overlapGate'
import { deleteObject } from './editing'
import { openScene, saveScene, newScene } from './files'
import TopBar from './components/TopBar.vue'
import Viewport from './components/Viewport.vue'
import Timeline from './components/Timeline.vue'
import TemplateGallery from './components/TemplateGallery.vue'
// 26.60 (D205–D206): the new shell — tool strip, floating timeline, one sidebar; phones: tab bar and sheets
import ToolStrip from './components/ToolStrip.vue'
import TimeDock from './components/TimeDock.vue'
import Sidebar from './components/Sidebar.vue'
import PhoneNav from './components/PhoneNav.vue'
import BottomSheet from './components/BottomSheet.vue'
import ToolPalette from './components/ToolPalette.vue'
import ObjectList from './components/ObjectList.vue'
import Inspector from './components/Inspector.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import FormulaPanel from './components/FormulaPanel.vue'
import WatchPanel from './components/WatchPanel.vue'
import PredictionPanel from './components/PredictionPanel.vue'
import ChartPanel from './components/ChartPanel.vue'
import EventList from './components/EventList.vue'
const ExportDialog = defineAsyncComponent(() => import('./components/ExportDialog.vue'))
const AboutDialog = defineAsyncComponent(() => import('./components/AboutDialog.vue'))
const CoursewareDialog = defineAsyncComponent(() => import('./components/CoursewareDialog.vue'))
const SweepDialog = defineAsyncComponent(() => import('./components/SweepDialog.vue'))
const SolverCompareDialog = defineAsyncComponent(() => import('./components/SolverCompareDialog.vue'))
const WelcomeDialog = defineAsyncComponent(() => import('./components/WelcomeDialog.vue'))
const TourOverlay = defineAsyncComponent(() => import('./components/TourOverlay.vue'))
const ReportDialog = defineAsyncComponent(() => import('./components/ReportDialog.vue'))
const FbdDialog = defineAsyncComponent(() => import('./components/FbdDialog.vue'))
const TapeDialog = defineAsyncComponent(() => import('./components/TapeDialog.vue'))
const OverlapDialog = defineAsyncComponent(() => import('./components/OverlapDialog.vue'))
const ProblemGallery = defineAsyncComponent(() => import('./components/ProblemGallery.vue'))
// 26.55 (D96): learning path and global search
const LearningPath = defineAsyncComponent(() => import('./components/LearningPath.vue'))
const CommandPalette = defineAsyncComponent(() => import('./components/CommandPalette.vue'))
// 26.56: teaching activities and the model catalogue (D102, D105)
import { lessonUi } from './lessons'
const ActivityRunner = defineAsyncComponent(() => import('./components/ActivityRunner.vue'))
// 26.61 (B): the classroom experiment card over the studio
const LessonBar = defineAsyncComponent(() => import('./components/LessonBar.vue'))
const ModelCatalog = defineAsyncComponent(() => import('./components/models/ModelCatalog.vue'))
const CurriculumDialog = defineAsyncComponent(() => import('./components/CurriculumDialog.vue'))
import ProblemPanel from './components/ProblemPanel.vue'
// 26.57 (D114): the task panel
import TaskPanel from './components/task/TaskPanel.vue'
import { editor } from './editor/editorState'
import MonitorPage from './components/MonitorPage.vue'
import CanvasPins from './components/task/CanvasPins.vue'
// 26.55 (D97): the lab and settings pages load on their first visit (smaller start-up bundle)
const SettingsPage = defineAsyncComponent(() => import('./components/SettingsPage.vue'))
const LabPage = defineAsyncComponent(() => import('./components/lab/LabPage.vue'))
import DetailPanel from './components/DetailPanel.vue'
// 26.59 (D167, D172): the problem import bar and Copilot
import Spotlight from './components/ai/Spotlight.vue'
// 26.60 (D204): Copilot is the AI tab of the sidebar, or the AI sheet on a phone
const CopilotPanel = defineAsyncComponent(() => import('./components/ai/CopilotPanel.vue'))
import { isDesktop } from '../platform/files'
import { PAGE_ACTIVE } from './live'
import { settings } from './settings'
import { logEvent } from './trialLog'
import { phone, setCopilotOpen, shell, syncSideTab } from './layout'
import type { SheetId } from './layout'

const studioOn = computed(() => state.page === 'studio')
// The studio page lives in this template; the other pages provide their own flag
provide(PAGE_ACTIVE, studioOn)

/** Pages mounted so far (kept mounted afterwards). */
const mounted = reactive<Record<Page, boolean>>({ studio: true, lab: state.page === 'lab', monitor: state.page === 'monitor', settings: state.page === 'settings' })
/** Pages laid out at least once (hidden pages keep their layout, so showing them again is cheap). */
const warmed = reactive<Record<Page, boolean>>({ studio: true, lab: false, monitor: false, settings: false })
watch(() => state.page, p => { mounted[p] = true; logEvent('page.open', { page: p }) })
// Trial log: which dialogs are used (ids only)
const DIALOGS = { export: () => state.showExport, courseware: () => state.showCourseware, sweep: () => state.showSweep, solverCompare: () => state.showSolverCompare, report: () => state.showReport, fbd: () => state.showFbd, tape: () => state.showTape, problems: () => state.showProblems, templates: () => state.showTemplates, learning: () => state.showLearning, search: () => state.showPalette } as const
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

function typing(e: KeyboardEvent) {
  const t = e.target as HTMLElement
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable
}

const PAGE_KEYS: Record<string, Page> = { Digit1: 'studio', Digit2: 'lab', Digit3: 'monitor', Digit4: 'settings' }

function onKey(e: KeyboardEvent) {
  // 26.58 (D146): while the tour is shown its own keys (←, →, Enter, Escape) are not shortcuts
  if (state.tourStep !== null && ['ArrowLeft', 'ArrowRight', 'Enter', 'Escape'].includes(e.key)) return
  const mod = e.ctrlKey || e.metaKey
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveScene(e.shiftKey); return }
  if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); openScene(); return }
  if (mod && e.key.toLowerCase() === 'n') { e.preventDefault(); newScene(); return }
  if (mod && e.key === 'Enter') { e.preventDefault(); runSimulation(); return }
  if (mod && e.key === ',') { e.preventDefault(); state.page = 'settings'; return }
  // 26.55 (D96): global search, also from inside a text field
  if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); state.showPalette = !state.showPalette; return }
  // 26.59 (D167): Copilot
  if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'i' && settings.ai.copilot) { e.preventDefault(); setCopilotOpen(!state.showCopilot); return }
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
  syncSideTab()
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKeyUp)
  premount()
  // 26.58 (D138): the welcome page once, on the first start (not during the release self-check)
  if (!settings.ui.welcomed && !/[?&]selftest/.test(location.search)) setTimeout(() => { if (!settings.ui.welcomed) state.showWelcome = true }, 900)
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

/** Phone sheets: titles, and the pages of the 属性 and 分析 sheets (26.60, D206). */
const SHEET_TITLE: Record<SheetId, string> = { tools: '工具', inspect: '属性', analysis: '分析', ai: 'Copilot', timeline: '时间轴' }
type PhonePage = 'inspect' | 'settings' | 'formula' | 'watch' | 'predict' | 'chart' | 'events' | 'problem' | 'task'
const phonePage = ref<PhonePage>('formula')
const PHONE_ANALYSIS = computed(() => [
  ...(state.problem ? [{ id: 'problem' as const, label: tl('题目') }] : []),
  { id: 'formula' as const, label: tl('公式') }, { id: 'chart' as const, label: tl('曲线') }, { id: 'events' as const, label: tl('事件') },
  { id: 'watch' as const, label: tl('监视') }, { id: 'task' as const, label: tl('任务') }, { id: 'predict' as const, label: tl('预测') }
])
// The analysis sheet follows the right panel's page (a problem opened shows it) and the bottom tab
watch(() => state.rightTab, rt => { if (rt !== 'inspect' && rt !== 'settings') phonePage.value = rt })
function pickPhonePage(p: PhonePage) {
  phonePage.value = p
  if (p === 'chart' || p === 'events') state.bottomTab = p === 'chart' ? 'chart' : 'events'
  else state.rightTab = p
}
const sheetOn = (s: SheetId) => phone.value && shell.sheet === s
watch(phone, p => { if (!p) shell.sheet = null })
</script>

<template>
  <div class="ambient" aria-hidden="true"><i /><i /><i /><i /></div>
  <div :key="locale.lang" class="app" :class="{ phone }">
    <TopBar class="top" />
    <div class="workspace">
      <div class="pages">
        <!-- 26.60 (D205): the canvas fills the studio; the tools float on it, one sidebar at the right -->
        <div v-if="!phone" class="page page-studio" :class="pageClass('studio')" :inert="!studioOn">
          <main class="center">
            <div class="view">
              <Viewport variant="studio" /><CanvasPins />
              <ToolStrip />
              <TimeDock v-if="!shell.drawerOpen" part="bar" :active="studioOn" />
            </div>
            <TimeDock v-if="shell.drawerOpen" part="drawer" :active="studioOn" />
          </main>
          <Sidebar />
        </div>
        <!-- 26.60 (D206): phones — full-screen canvas, a slim timeline, sheets over the canvas -->
        <div v-else class="page page-studio phone-studio" :class="pageClass('studio')" :inert="!studioOn">
          <div class="view">
            <Viewport variant="studio" /><CanvasPins />
            <BottomSheet v-if="shell.sheet" :title="tl(SHEET_TITLE[shell.sheet])" @close="shell.sheet = null">
              <template v-if="sheetOn('tools')">
                <div class="sheet-pad">
                  <ToolPalette touch @pick="shell.sheet = null" />
                  <div class="snaps">
                    <label class="snap"><input v-model="settings.editor.objectSnap" type="checkbox" class="switch" /><span>{{ tl('物体吸附') }}</span></label>
                    <label class="snap"><input v-model="settings.editor.snap" type="checkbox" class="switch" /><span>{{ tl('网格吸附') }}</span></label>
                  </div>
                  <div class="ptitle tiny muted">{{ tl('对象') }}</div>
                  <ObjectList @pick="shell.sheet = 'inspect'" />
                </div>
              </template>
              <template v-else-if="sheetOn('inspect')">
                <div class="chips" role="tablist">
                  <button role="tab" :class="{ on: state.rightTab !== 'settings' }" @click="state.rightTab = 'inspect'">{{ tl('对象') }}</button>
                  <button role="tab" :class="{ on: state.rightTab === 'settings' }" @click="state.rightTab = 'settings'">{{ tl('场景') }}</button>
                </div>
                <div class="sheet-pad"><SettingsPanel v-if="state.rightTab === 'settings'" /><Inspector v-else /></div>
              </template>
              <template v-else-if="sheetOn('analysis')">
                <div class="chips scroll" role="tablist">
                  <button v-for="p in PHONE_ANALYSIS" :key="p.id" role="tab" :class="{ on: phonePage === p.id }" @click="pickPhonePage(p.id)">{{ p.label }}</button>
                </div>
                <div class="fill">
                  <div v-if="phonePage === 'chart' || phonePage === 'events'" class="abs"><ChartPanel v-if="phonePage === 'chart'" :active="studioOn" /><EventList v-else :active="studioOn" /></div>
                  <div v-else class="sheet-pad">
                    <FormulaPanel v-if="phonePage === 'formula'" :active="studioOn" />
                    <WatchPanel v-else-if="phonePage === 'watch'" :active="studioOn" />
                    <PredictionPanel v-else-if="phonePage === 'predict'" />
                    <ProblemPanel v-else-if="phonePage === 'problem' && state.problem" />
                    <TaskPanel v-else />
                  </div>
                </div>
              </template>
              <template v-else-if="sheetOn('ai')">
                <div class="fill"><div class="abs"><CopilotPanel /></div></div>
              </template>
            </BottomSheet>
          </div>
          <div class="ptime"><Timeline compact no-play :active="studioOn" /></div>
        </div>
        <LabPage v-if="mounted.lab" class="page" :class="pageClass('lab')" :inert="state.page !== 'lab'" :active="state.page === 'lab'" />
        <MonitorPage v-if="mounted.monitor" class="page" :class="pageClass('monitor')" :inert="state.page !== 'monitor'" :active="state.page === 'monitor'" />
        <SettingsPage v-if="mounted.settings" class="page" :class="pageClass('settings')" :inert="state.page !== 'settings'" :active="state.page === 'settings'" />
        <DetailPanel />
      </div>
    </div>
    <PhoneNav v-if="phone && state.page === 'studio'" />
    <TemplateGallery v-if="state.showTemplates" />
    <ExportDialog v-if="state.showExport && state.recording" />
    <AboutDialog v-if="state.showAbout" />
    <OverlapDialog v-if="overlapPrompt.open" />
    <CoursewareDialog v-if="state.showCourseware && state.recording" />
    <SweepDialog v-if="state.showSweep" />
    <SolverCompareDialog v-if="state.showSolverCompare" />
    <WelcomeDialog v-if="state.showWelcome" />
    <TourOverlay v-if="state.tourStep !== null" />
    <ReportDialog v-if="state.showReport && state.recording" />
    <FbdDialog v-if="state.showFbd && state.recording" />
    <TapeDialog v-if="state.showTape && state.recording" />
    <ProblemGallery v-if="state.showProblems" />
    <LearningPath v-if="state.showLearning" />
    <CommandPalette v-if="state.showPalette" />
    <ModelCatalog v-if="state.showModels" />
    <CurriculumDialog v-if="state.showCurriculum" />
    <ActivityRunner v-if="state.activity" :key="state.activity" />
    <LessonBar v-if="lessonUi.id" :key="lessonUi.id" />
    <Spotlight />
    <!-- 26.59 (D157): two live regions that always exist (polite status, assertive alert), so every message is announced -->
    <div class="sr-only" role="status" aria-live="polite">{{ state.toast && !state.toast.error ? state.toast.text : '' }}</div>
    <div class="sr-only" role="alert">{{ state.toast?.error ? state.toast.text : '' }}</div>
    <div v-if="state.toast" class="toast" :class="{ error: state.toast.error }">{{ state.toast.text }}<button v-if="state.toast.action" type="button" class="toast-act" @click="() => { const a = state.toast?.action; state.toast = null; a?.run() }">{{ state.toast.action.label }}</button><button v-if="state.toast.error || state.toast.action" type="button" class="toast-x" :aria-label="tl('关闭')" @click="state.toast = null">×</button></div>
  </div>
</template>

<style scoped>
.app {
  position: relative;
  z-index: 1;
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: 0 8px 8px;
}
.top { flex: 0 0 auto; }
.workspace { flex: 1; min-height: 0; display: flex; }
.pages { flex: 1; min-width: 0; min-height: 0; display: grid; position: relative; }
.page { grid-area: 1 / 1; min-width: 0; min-height: 0; }
/* 26.60 (D205): canvas column and one sidebar */
.page-studio { display: flex; gap: 8px; position: relative; }
.center { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; container: studio / inline-size; }
.view { flex: 1; min-height: 160px; position: relative; --float-bottom: 64px; --float-left: 62px; }
.center:has(.drawer) .view { --float-bottom: 0px; }
/* 26.60 (D206): phones */
.app.phone { padding: 0; }
.app.phone .top { padding: 0 6px; }
.phone-studio { display: flex; flex-direction: column; gap: 0; }
.phone-studio .view { flex: 1; min-height: 0; position: relative; overflow: hidden; --float-bottom: 0px; --float-left: 0px; }
.phone-studio .view :deep(.viewport) { border-radius: 0; box-shadow: none; }
.ptime { flex: 0 0 auto; background: var(--pane); border-top: 0.5px solid var(--separator); }
.sheet-pad { padding: 4px 14px 16px; }
.snaps { display: flex; gap: 16px; padding: 10px 2px 4px; }
.snap { display: inline-flex; align-items: center; gap: 8px; min-height: 40px; }
.ptitle { margin: 10px 2px 4px; font-weight: 600; }
.chips { display: flex; gap: 6px; padding: 2px 14px 8px; }
.chips.scroll { overflow-x: auto; scrollbar-width: none; }
.chips.scroll::-webkit-scrollbar { display: none; }
.chips button { flex: 0 0 auto; min-height: 36px; padding: 0 14px; border: 0; border-radius: 999px; background: var(--fill); color: var(--text-2); font: inherit; font-size: var(--type-small); cursor: pointer; }
.chips button.on { background: var(--accent); color: var(--on-accent); font-weight: 600; }
.fill { position: relative; flex: 1; min-height: 0; height: calc(100% - 46px); }
.abs { position: absolute; inset: 0; overflow: auto; }
</style>
