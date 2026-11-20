<script setup lang="ts">
/**
 * Application shell (26.64, D240): the navigation rail at the left — the five panels 运动 (`studio`), 物理实验 (`lab`),
 * 化学实验 (`chem`), 资源库 (`library`), 监视 (`monitor`), then search, help and the settings; the mark opens the home
 * page — and beside it the context bar of the page shown (the home page has none), the page, and for the studio and
 * the monitor the status bar. Pages stay mounted once shown so switching is instant (hidden with content-visibility,
 * layout kept); panels on hidden pages and hidden tabs get `active = false` and stop following playback. The lab,
 * monitor and settings pages are mounted on first use or when the browser is idle after startup, whichever comes
 * first; home, chem and library on first use. Phones have no rail: the same list opens as a drawer from the bar.
 * The classroom page of 26.63 is a section of the library (store.ts redirects the old page id).
 */
import { locale, tl } from '../i18n'
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, provide, reactive, ref, watch } from 'vue'
import { state, undo, redo, runSimulation, play, pause, seekFrame, edit } from './store'
import type { Page, ShownPage } from './store'
import { pageOfKey } from './shortcuts'
import { overlapPrompt } from './overlapGate'
import { deleteObject } from './editing'
import { openScene, saveScene, newScene } from './files'
import TopBar from './components/TopBar.vue'
import ScopeTrace from './components/decor/ScopeTrace.vue'
import NavRail from './components/NavRail.vue'
import StatusBar from './components/StatusBar.vue'
import Viewport from './components/viewport/Viewport.vue'
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
import ScenePanel from './components/ScenePanel.vue'
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
// 26.64 (D248–D251): the walkthrough over the real interface, and Help › 入门 / 新变化
const GuideDialog = defineAsyncComponent(() => import('./components/GuideDialog.vue'))
const WalkthroughOverlay = defineAsyncComponent(() => import('./components/WalkthroughOverlay.vue'))
import { initOnboarding, movedHint, walk } from './onboarding/engine'
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
// 26.63 (D232–D237): the new pages, the class tally, the share link, the convergence study, the shortcut sheet
const HomePage = defineAsyncComponent(() => import('./components/HomePage.vue'))
const LibraryPage = defineAsyncComponent(() => import('./components/LibraryPage.vue'))
// 26.64 (D240, D241): the chemistry panel (a mount point until its bench lands) and "open from a link"
const ChemPage = defineAsyncComponent({ loader: () => import('./components/chem/ChemPage.vue'), loadingComponent: ScopeTrace, delay: 200 })
const OpenLinkDialog = defineAsyncComponent(() => import('./components/OpenLinkDialog.vue'))
const TallyBar = defineAsyncComponent(() => import('./components/TallyBar.vue'))
const ShareDialog = defineAsyncComponent(() => import('./components/ShareDialog.vue'))
const ConvergenceDialog = defineAsyncComponent(() => import('./components/ConvergenceDialog.vue'))
const ShortcutSheet = defineAsyncComponent(() => import('./components/ShortcutSheet.vue'))
// 26.64: the update notice of the desktop and Android apps (it schedules the one check per start); never on the web
const UpdateNotice = defineAsyncComponent(() => import('./components/UpdateNotice.vue'))
import { tally } from './tally'
import { zoomStudio } from './viewStatus'
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
import { installNuclearLinks } from './nuclideLink'
import { settings } from './settings'
import { logEvent } from './trialLog'
import { landscape, phone, setCopilotOpen, shell, showSideTab, syncSideTab } from './layout'
import Icon from './components/Icon.vue'
import type { SheetId, SideTab } from './layout'
import { openEncyFromHash } from '../chem/ency/route'

const studioOn = computed(() => state.page === 'studio')
// The studio page lives in this template; the other pages provide their own flag
provide(PAGE_ACTIVE, studioOn)
// 26.64 (D268): a bench link in the address (#b=…) starts in the chemistry panel, which opens it
if (typeof location !== 'undefined' && location.hash.startsWith('#b=')) state.page = 'chem'
// 26.64 (D276, D277): the nuclide pages and the reactor workshop answer the encyclopedia's hooks and the address #n=…
installNuclearLinks()
// 26.64 (D271): a link to an element or a substance (#e=Cu, #m=ethanol) opens the encyclopedia over the bench
if (typeof location !== 'undefined' && openEncyFromHash(location.hash)) state.page = 'chem'

/** Pages mounted so far (kept mounted afterwards). */
const mounted = reactive<Record<ShownPage, boolean>>({ studio: true, home: state.page === 'home', lab: state.page === 'lab', chem: state.page === 'chem', library: state.page === 'library', monitor: state.page === 'monitor', settings: state.page === 'settings' })
/** Pages laid out at least once (hidden pages keep their layout, so showing them again is cheap). */
const warmed = reactive<Record<ShownPage, boolean>>({ studio: true, home: false, lab: false, chem: false, library: false, monitor: false, settings: false })
/** `state.page` as shown (a legacy id never stays: store.ts redirects it synchronously). */
const shown = (p: Page): ShownPage => (p === 'classroom' ? 'library' : p)
watch(() => state.page, p => { mounted[shown(p)] = true; shell.navOpen = false; logEvent('page.open', { page: shown(p) }) })
// Trial log: which dialogs are used (ids only)
const DIALOGS = { export: () => state.showExport, courseware: () => state.showCourseware, sweep: () => state.showSweep, solverCompare: () => state.showSolverCompare, report: () => state.showReport, fbd: () => state.showFbd, tape: () => state.showTape, problems: () => state.showProblems, templates: () => state.showTemplates, learning: () => state.showLearning, search: () => state.showPalette } as const
for (const [dialog, open] of Object.entries(DIALOGS)) watch(open, v => { if (v) logEvent('dialog.open', { dialog }) })
const LATER: ShownPage[] = ['home', 'lab', 'chem', 'library', 'monitor', 'settings']
watch(() => LATER.map(p => mounted[p]), () => {
  for (const p of LATER) {
    if (mounted[p] && !warmed[p]) requestAnimationFrame(() => requestAnimationFrame(() => { warmed[p] = true }))
  }
})
/**
 * Hidden pages and tabs are not display:none (which would lay them out from scratch on every switch) but
 * content-visibility: hidden, which skips their rendering while keeping the layout for an instant switch back.
 * A freshly mounted page is laid out once invisibly ("warming") before it is hidden.
 */
function pageClass(p: ShownPage) { return state.page === p ? 'is-on' : warmed[p] ? 'is-off' : 'is-warming' }

function typing(e: KeyboardEvent) {
  const t = e.target as HTMLElement
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable
}

const SIDE_KEYS: Record<string, SideTab> = { Digit1: 'inspect', Digit2: 'analysis', Digit3: 'problem', Digit4: 'ai' }

function onKey(e: KeyboardEvent) {
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
  // 26.64 (D240): Alt+1…5 the panels in rail order, Alt+0 the home page
  if (e.altKey && !mod && !e.shiftKey) { const p = pageOfKey(e.code); if (p) { e.preventDefault(); state.page = p; return } }
  // 26.64 (D250): Alt+6 was a page of 26.63 — said once, where it is looked for
  if (e.altKey && !mod && !e.shiftKey && e.code === 'Digit6') { movedHint('alt6', tl('Alt+1…5 现在对应五个面板；课堂在资源库里。')); return }
  // 26.63 (D233; the open items of 26.60): the sidebar, its tabs and the curves drawer from the keyboard
  if (mod && e.altKey && SIDE_KEYS[e.code] && state.page === 'studio' && !phone.value) {
    const tab = SIDE_KEYS[e.code]
    if (tab !== 'ai' || settings.ai.copilot) { e.preventDefault(); showSideTab(tab) }
    return
  }
  if (mod && !e.altKey && e.key === '\\' && state.page === 'studio' && !phone.value) { e.preventDefault(); shell.sideOpen = !shell.sideOpen; return }
  if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'j' && state.page === 'studio' && !phone.value) { e.preventDefault(); shell.drawerOpen = !shell.drawerOpen; return }
  if (typing(e)) return
  if (e.key === '?' && !mod && !e.altKey) { e.preventDefault(); shell.shortcuts = !shell.shortcuts; return }
  if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return }
  if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return }
  // Playback and editing keys belong to the studio and monitor pages (the lab has its own)
  if (state.page !== 'studio' && state.page !== 'monitor') return
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
  // 26.63 (D233): zoom steps and fit from the keyboard
  if (!mod && !e.altKey && (e.key === '+' || e.key === '=')) { zoomStudio(1); return }
  if (!mod && !e.altKey && e.key === '-') { zoomStudio(-1); return }
  if (!mod && !e.altKey && e.key === '0') { state.cameraRequest++; return }
}

let spaceHeld = false
function onKeyUp(e: KeyboardEvent) {
  if (e.key !== ' ' || !spaceHeld) return
  spaceHeld = false
  if (typing(e) || (state.page !== 'studio' && state.page !== 'monitor') || editor.spacePanned) return
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
  // 26.64 (D248): what this device is offered — the walkthrough on a first run, the list of changes after an update.
  // Nothing opens by itself: the offer is a block of the home page and a dot on the Help button.
  initOnboarding()
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
  <div :key="locale.lang" class="app" :class="{ phone }">
    <NavRail v-if="!phone" />
    <div class="main">
      <!-- 26.65 (D290): on the desktop only the motion studio and the monitor have a bar here; an experiment panel's
           name is the rail's selected item and its search is the rail's -->
      <TopBar v-if="phone || state.page === 'studio' || state.page === 'monitor'" class="top" />
      <div class="workspace">
        <div class="pages">
          <!-- 26.60 (D205): the canvas fills the studio; the tools float on it, one sidebar at the right -->
          <div v-if="!phone" class="page page-studio" :class="pageClass('studio')" :inert="!studioOn">
            <main class="center">
              <div class="view">
                <Viewport variant="studio" /><CanvasPins />
                <ToolStrip />
                <TallyBar v-if="tally.open" />
                <TimeDock v-if="!shell.drawerOpen" part="bar" :active="studioOn" />
              </div>
              <TimeDock v-if="shell.drawerOpen" part="drawer" :active="studioOn" />
            </main>
            <Sidebar />
          </div>
          <!-- 26.60 (D206): phones — full-screen canvas, a slim timeline, sheets over the canvas; 26.63: in landscape
               the open sheet stands beside the canvas instead of over it -->
          <div v-else class="page page-studio phone-studio" :class="[pageClass('studio'), { side: landscape && !!shell.sheet }]" :inert="!studioOn">
            <div class="view">
              <Viewport variant="studio" /><CanvasPins />
              <TallyBar v-if="tally.open" />
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
                  <div class="sheet-pad"><ScenePanel v-if="state.rightTab === 'settings' || !state.selection" /><Inspector v-else /></div>
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
          <HomePage v-if="mounted.home" class="page" :class="pageClass('home')" :inert="state.page !== 'home'" />
          <LabPage v-if="mounted.lab" class="page" :class="pageClass('lab')" :inert="state.page !== 'lab'" :active="state.page === 'lab'" />
          <LibraryPage v-if="mounted.library" class="page" :class="pageClass('library')" :inert="state.page !== 'library'" :active="state.page === 'library'" />
          <ChemPage v-if="mounted.chem" class="page" :class="pageClass('chem')" :inert="state.page !== 'chem'" :active="state.page === 'chem'" />
          <MonitorPage v-if="mounted.monitor" class="page" :class="pageClass('monitor')" :inert="state.page !== 'monitor'" :active="state.page === 'monitor'" />
          <SettingsPage v-if="mounted.settings" class="page" :class="pageClass('settings')" :inert="state.page !== 'settings'" :active="state.page === 'settings'" />
          <DetailPanel />
        </div>
      </div>
      <StatusBar v-if="!phone && (state.page === 'studio' || state.page === 'monitor')" />
      <PhoneNav v-if="phone && state.page === 'studio'" />
    </div>
    <!-- Phone: the pages as a drawer -->
    <template v-if="phone && shell.navOpen">
      <div class="nav-scrim" @click="shell.navOpen = false" />
      <NavRail drawer @close="shell.navOpen = false" />
    </template>
    <!-- A dialog that is also a section of the library page is not opened twice -->
    <TemplateGallery v-if="state.showTemplates" />
    <ExportDialog v-if="state.showExport && state.recording" />
    <AboutDialog v-if="state.showAbout" />
    <OverlapDialog v-if="overlapPrompt.open" />
    <CoursewareDialog v-if="state.showCourseware && state.recording" />
    <SweepDialog v-if="state.showSweep" />
    <SolverCompareDialog v-if="state.showSolverCompare" />
    <ConvergenceDialog v-if="shell.convergence" />
    <ShareDialog v-if="shell.share" />
    <ShortcutSheet v-if="shell.shortcuts" />
    <OpenLinkDialog v-if="shell.openLink" />
    <GuideDialog v-if="state.showWelcome" />
    <WalkthroughOverlay v-if="walk.id" />
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
    <UpdateNotice v-if="isDesktop" />
    <!-- 26.59 (D157): two live regions that always exist (polite status, assertive alert), so every message is announced -->
    <div class="sr-only" role="status" aria-live="polite">{{ state.toast && !state.toast.error ? state.toast.text : '' }}</div>
    <div class="sr-only" role="alert">{{ state.toast?.error ? state.toast.text : '' }}</div>
    <div v-if="state.toast" class="toast" :class="{ error: state.toast.error }"><span class="toast-ico"><Icon :name="state.toast.error ? 'alert' : 'check'" :size="13" /></span><span class="toast-text">{{ state.toast.text }}</span><button v-if="state.toast.action" type="button" class="toast-act" @click="() => { const a = state.toast?.action; state.toast = null; a?.run() }">{{ state.toast.action.label }}</button><button v-if="state.toast.error || state.toast.action" type="button" class="toast-x" :aria-label="tl('关闭')" @click="state.toast = null">×</button></div>
  </div>
</template>

<style scoped>
.app {
  position: relative;
  z-index: 1;
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: row;
}
.main { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.top { flex: 0 0 auto; }
.workspace { flex: 1; min-height: 0; display: flex; }
.pages { flex: 1; min-width: 0; min-height: 0; display: grid; position: relative; }
.page { grid-area: 1 / 1; min-width: 0; min-height: 0; }
/* 26.60 (D205): canvas column and one sidebar */
.page-studio { display: flex; gap: 8px; position: relative; padding: 0 8px 8px; }
.center { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; container: studio / inline-size; }
.view { flex: 1; min-height: 160px; position: relative; --float-bottom: 64px; --float-left: 62px; }
.center:has(.drawer) .view { --float-bottom: 0px; }
/* 26.60 (D206): phones */
.app.phone { flex-direction: column; }
.phone-studio { display: flex; flex-direction: column; gap: 0; padding: 0; }
.phone-studio .view { flex: 1; min-height: 0; position: relative; overflow: hidden; --float-bottom: 0px; --float-left: 0px; }
.phone-studio .view :deep(.viewport) { border-radius: 0; box-shadow: none; }
.ptime { flex: 0 0 auto; background: var(--pane); border-top: 0.5px solid var(--separator); }
/* 26.63: a phone held sideways — the sheet is a panel at the right, full height, and the canvas keeps the rest */
.phone-studio.side .view :deep(.sheet) { left: auto; right: 0; top: 0; bottom: 0; width: min(48%, 400px); height: 100% !important; border-radius: var(--radius-float) 0 0 var(--radius-float); animation: side-in var(--dur-enter) var(--ease-out); }
.phone-studio.side .view :deep(.sheet .handle) { display: none; }
@keyframes side-in { from { transform: translateX(30%); opacity: 0.4; } to { transform: none; opacity: 1; } }
.nav-scrim { position: fixed; inset: 0; z-index: 9050; background: var(--scrim); animation: fade-in var(--dur-exit) ease; }
.sheet-pad { padding: 4px 14px 16px; }
.snaps { display: flex; gap: 16px; padding: 10px 2px 4px; }
.snap { display: inline-flex; align-items: center; gap: 8px; min-height: 40px; }
.ptitle { margin: 10px 2px 4px; font-weight: 600; }
.chips { display: flex; gap: 6px; padding: 2px 14px 8px; }
.chips.scroll { overflow-x: auto; scrollbar-width: none; }
.chips.scroll::-webkit-scrollbar { display: none; }
.chips button { flex: 0 0 auto; min-height: 36px; padding: 0 14px; border: 0; border-radius: var(--radius-pill); background: var(--fill); color: var(--text-2); font: inherit; font-size: var(--type-small); cursor: pointer; }
.chips button.on { background: var(--accent); color: var(--on-accent); font-weight: 600; }
.fill { position: relative; flex: 1; min-height: 0; height: calc(100% - 46px); }
.abs { position: absolute; inset: 0; overflow: auto; }
</style>
