/**
 * Layout of the interface (26.60, D205–D206; 26.55, D96 for narrow windows).
 *
 * Desktop: the canvas fills the window. A slim top bar carries the three studio modes — 搭建 (build), 仿真 (simulate),
 * 分析 (analyze) — which are presets of what is shown: the tool strip at the left edge of the canvas, one sidebar on the
 * right with four tabs (属性, 分析, 题目, AI) that folds to a rail of icons, and the floating timeline at the bottom of
 * the canvas whose drawer (curves and events) opens upward. What the user changes within a mode is remembered for it.
 * At most two panels share the window with the canvas.
 *
 * Phone (web on a phone, the Android app, any window narrower than 760 px): the canvas is full screen; a bottom tab bar
 * (工具, 属性, ▶, 分析, AI) opens bottom sheets that stop at a third, two thirds or the full height and close when
 * dragged down; a slim timeline sits above the tab bar.
 */
import { computed, reactive, ref, watch } from 'vue'
import { settings } from './settings'
import { state } from './store'

const mq = (q: string) => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q) : null)
const narrowQ = mq('(max-width: 900px)')
const phoneQ = mq('(max-width: 760px), (max-height: 500px) and (pointer: coarse)')

/** The window is narrow (the sidebar overlays the canvas instead of taking its own column). */
export const narrow = ref(!!narrowQ?.matches)
/** Phone layout: full-screen canvas, bottom tab bar and sheets. */
export const phone = ref(!!phoneQ?.matches)
narrowQ?.addEventListener?.('change', e => { narrow.value = e.matches })
phoneQ?.addEventListener?.('change', e => { phone.value = e.matches })

/** Kept for older callers: the tool strip shows icons only (always, since 26.60). */
export const railOn = computed(() => true)
/** Kept for older callers: the sidebar is open over the canvas of a narrow window. */
export const drawerOpen = computed({ get: () => shell.sideOpen && narrow.value, set: v => { shell.sideOpen = v } })

export type StudioMode = 'build' | 'simulate' | 'analyze'
export type SideTab = 'inspect' | 'analysis' | 'problem' | 'ai'
export type SheetId = 'tools' | 'inspect' | 'analysis' | 'ai' | 'timeline'

/** Heights of the phone sheets as fractions of the room between the top bar and the tab bar (D206). */
export const SHEET_STOPS: Record<1 | 2 | 3, number> = { 1: 0.36, 2: 0.64, 3: 1 }

interface ModeLayout { sideOpen: boolean; sideTab: SideTab; drawerOpen: boolean; tools: boolean }

/** What each mode shows by default. */
export const MODE_PRESETS: Record<StudioMode, ModeLayout> = {
  build: { sideOpen: true, sideTab: 'inspect', drawerOpen: false, tools: true },
  simulate: { sideOpen: false, sideTab: 'analysis', drawerOpen: true, tools: false },
  analyze: { sideOpen: true, sideTab: 'analysis', drawerOpen: true, tools: false }
}

export const STUDIO_MODES: Array<{ id: StudioMode; label: string; icon: string; tip: string }> = [
  { id: 'build', label: '搭建', icon: 'pen', tip: '放置物体与连接件，修改属性' },
  { id: 'simulate', label: '仿真', icon: 'run', tip: '播放、看曲线与事件' },
  { id: 'analyze', label: '分析', icon: 'formula', tip: '公式对照、监视读数、题目与预测' }
]

const KEY = 'velophi.shell.v1'
interface Stored { mode: StudioMode; memory: Partial<Record<StudioMode, ModeLayout>>; sideWidth: number; drawerHeight: number; tools: boolean }
function load(): Stored {
  const d: Stored = { mode: 'build', memory: {}, sideWidth: 380, drawerHeight: 300, tools: true }
  try { const raw = localStorage.getItem(KEY); if (raw) Object.assign(d, JSON.parse(raw)) } catch { /* layout only */ }
  if (!['build', 'simulate', 'analyze'].includes(d.mode)) d.mode = 'build'
  d.sideWidth = Math.min(720, Math.max(300, Number(d.sideWidth) || 380))
  d.drawerHeight = Math.min(700, Math.max(160, Number(d.drawerHeight) || 300))
  return d
}
const stored = load()
const start = { ...MODE_PRESETS[stored.mode], ...(stored.memory[stored.mode] ?? {}) }

export const shell = reactive({
  mode: stored.mode as StudioMode,
  /** Sidebar open (desktop) and its tab (a narrow window starts with it folded: it would cover the canvas). */
  sideOpen: start.sideOpen && !narrowQ?.matches,
  sideTab: start.sideTab as SideTab,
  sideWidth: stored.sideWidth,
  /** Curves and events drawer above the timeline bar. */
  drawerOpen: start.drawerOpen,
  drawerHeight: stored.drawerHeight,
  /** Tool strip shown in full (all modes keep select, pan and the palette button). */
  tools: start.tools,
  /** Open flyout of the tool strip. */
  flyout: null as null | 'palette' | 'objects',
  /** A tab whose content changed while another was shown (it pulses until opened). */
  attention: null as SideTab | null,
  /** Phone: the open sheet and its height (1: a third, 2: two thirds, 3: full). */
  sheet: null as SheetId | null,
  sheetSize: 2 as 1 | 2 | 3
})

const save = () => {
  try {
    const memory = { ...stored.memory, [shell.mode]: { sideOpen: shell.sideOpen, sideTab: shell.sideTab, drawerOpen: shell.drawerOpen, tools: shell.tools } }
    stored.memory = memory
    localStorage.setItem(KEY, JSON.stringify({ mode: shell.mode, memory, sideWidth: shell.sideWidth, drawerHeight: shell.drawerHeight, tools: shell.tools }))
  } catch { /* layout only */ }
}
watch(() => [shell.mode, shell.sideOpen, shell.sideTab, shell.sideWidth, shell.drawerOpen, shell.drawerHeight, shell.tools], save)

/** Switch the studio mode: its remembered layout, else its preset. */
export function setStudioMode(m: StudioMode) {
  if (state.page !== 'studio') state.page = 'studio'
  if (shell.mode === m) return
  save()
  const l = { ...MODE_PRESETS[m], ...(stored.memory[m] ?? {}) }
  shell.mode = m
  shell.sideOpen = l.sideOpen
  shell.drawerOpen = l.drawerOpen
  shell.tools = l.tools
  showSideTab(l.sideTab, false)
  if (m === 'build' && state.tool !== 'select' && !state.recording) { /* keep the tool */ }
}

/** Back to the preset of the current mode. */
export function resetStudioMode() {
  delete stored.memory[shell.mode]
  const l = MODE_PRESETS[shell.mode]
  Object.assign(shell, { sideOpen: l.sideOpen, drawerOpen: l.drawerOpen, tools: l.tools })
  showSideTab(l.sideTab, false)
}

/** The sidebar tab that shows a right-panel page (`state.rightTab`). */
export function tabOf(rt: typeof state.rightTab): SideTab {
  if (rt === 'formula' || rt === 'watch' || rt === 'predict') return 'analysis'
  if (rt === 'problem' || rt === 'task') return 'problem'
  return 'inspect'
}

/**
 * Show a sidebar tab (desktop) or its sheet (phone). `open`: also open the sidebar. The AI tab is `state.showCopilot`;
 * the other tabs follow `state.rightTab`.
 */
export function showSideTab(t: SideTab, open = true) {
  shell.sideTab = t
  if (shell.attention === t) shell.attention = null
  state.showCopilot = t === 'ai'
  if (t === 'analysis' && tabOf(state.rightTab) !== 'analysis') state.rightTab = settings.ui.analysisTab
  if (t === 'problem' && tabOf(state.rightTab) !== 'problem') state.rightTab = state.problem ? 'problem' : 'task'
  if (t === 'inspect' && tabOf(state.rightTab) !== 'inspect') state.rightTab = 'inspect'
  if (open) {
    if (phone.value) { if (shell.sheet !== (t === 'problem' ? 'analysis' : t)) openSheet(t === 'problem' ? 'analysis' : t) }
    else shell.sideOpen = true
  }
}

/**
 * Open or collapse the Copilot (26.59 fix, D183; 26.60: the AI tab of the sidebar, or the AI sheet on a phone).
 */
export function setCopilotOpen(open: boolean) {
  if (open) { showSideTab('ai'); return }
  state.showCopilot = false
  if (phone.value) { if (shell.sheet === 'ai') shell.sheet = null }
  else if (shell.sideTab === 'ai') shell.sideTab = tabOf(state.rightTab)
}

/** Phone: open a sheet (a second tap on its tab closes it). */
export function openSheet(s: SheetId) {
  if (shell.sheet === s) { shell.sheet = null; return }
  shell.sheet = s
  if (s === 'ai') state.showCopilot = true
  if (shell.sheetSize === 1 && (s === 'ai' || s === 'inspect')) shell.sheetSize = 2
}

// Code that shows a page of the right panel (a tool placed an object → 属性, a problem opened → 题目) shows its tab —
// unless the user is in the AI tab: then that tab only asks for attention, the conversation stays in view.
watch(() => state.rightTab, rt => {
  const t = tabOf(rt)
  if (shell.sideTab === t && !state.showCopilot) return
  if (state.showCopilot || (phone.value && shell.sheet && shell.sheet !== (t === 'problem' ? 'analysis' : t))) { shell.attention = t; return }
  shell.sideTab = t
})
watch(() => state.showCopilot, on => { if (on && shell.sideTab !== 'ai') { shell.sideTab = 'ai'; if (!phone.value) shell.sideOpen = true } })
// The analysis sub-tab is remembered
watch(() => state.rightTab, rt => { if (rt === 'formula' || rt === 'watch' || rt === 'predict') settings.ui.analysisTab = rt })

/** At start: the right panel shows the page of the remembered tab (26.60). */
export function syncSideTab() {
  if (state.showCopilot) { shell.sideTab = 'ai'; return }
  if (shell.sideTab === 'ai') { state.showCopilot = true; return }
  if (tabOf(state.rightTab) !== shell.sideTab) showSideTab(shell.sideTab, false)
}
// Leaving problem mode on the problem page shows the task
watch(() => state.problem, p => { if (!p && state.rightTab === 'problem') state.rightTab = 'task' })
