/**
 * Application state. The scene is the only document; everything else (recording, situations, playback)
 * is derived from it. Every edit goes through `edit()` so it can be undone and so the result is marked
 * out of date. Recordings are large typed arrays and are kept out of Vue's reactivity (markRaw).
 *
 * Simulation runs through the simulation client (Web Worker when enabled): partial recordings are shown and
 * can be played while the rest is computed; a new edit cancels the run in flight.
 */
import { markRaw, reactive } from 'vue'
import type { Scene } from '../core/scene/types'
import { cloneScene, parseScene, serializeScene, validateScene } from '../core/scene/io'
import type { Recording } from '../core/solver/simulation'
import type { Situation } from '../formula/situations'
import { recognize } from '../formula/situations'
import { canonicalQuantityId } from '../core/observe/quantities'
import { logEvent } from './trialLog'
import { buildTemplate } from '../templates'
import { startSimulation } from './simClient'
import type { SimHandle } from './simClient'
import type { DisplayOptions } from './settings'
import { settings } from './settings'

export type { DisplayOptions } from './settings'

/** Active editor tool. */
export type Tool =
  | 'select' | 'pan'
  | 'add-ball' | 'add-block' | 'add-disc' | 'add-wedge' | 'add-ground' | 'add-incline' | 'add-wall' | 'add-conveyor' | 'add-pulley'
  | 'add-polygon'
  | 'connect-rope' | 'connect-rod' | 'connect-spring' | 'connect-hinge' | 'add-force'
  | 'measure-ruler' | 'measure-angle' | 'annotate-text' | 'annotate-arrow'

/** Selected object, if any. */
export type Selection = { kind: 'body' | 'connector' | 'pulley'; id: string } | null

/** Top-level page. */
export type Page = 'studio' | 'monitor' | 'settings'

/** Reactive application state. */
export interface AppState {
  scene: Scene
  fileName: string | null
  filePath: string | null
  dirty: boolean
  /** Undo and redo stacks of serialized scenes. */
  past: string[]
  future: string[]
  selection: Selection
  tool: Tool
  /** Connector being created: tool, first anchor and the pulleys clicked so far. */
  pendingConnector: null | { tool: Tool; first: { body: string | null; local: { x: number; y: number }; world: { x: number; y: number } }; pulleys: Array<{ pulley: string; wrap: 'cw' | 'ccw' }> }
  recording: Recording | null
  situations: Situation[]
  /** The recording does not belong to the current scene. */
  stale: boolean
  computing: boolean
  /** Fraction of the simulated duration computed by the run in flight (0 … 1). */
  progress: number
  /** Identity of the run that produced `recording` (partial recordings of one run share it). */
  runId: number
  simError: string | null
  /** Recompute after each edit (stored in the settings). */
  autoRun: boolean
  /** Recorded frame shown (floor of time / Δt). */
  frame: number
  /** Continuous playback time (s); drawing interpolates between frames. */
  time: number
  /**
   * Frame used by the heavier panels (formula cards, readouts); follows `frame` at most ~12 times a second while
   * playing.
   */
  panelFrame: number
  playing: boolean
  speed: number
  loop: boolean
  /** Canvas overlays (stored in the settings, so they are also the defaults of the next session). */
  display: DisplayOptions
  /** Significant digits of readouts (stored in the settings). */
  digits: number
  /** Quantity ids plotted in the chart panel. */
  chart: string[]
  /** Top-level page: the studio (build and analyse), the render & monitor page, or the settings page. */
  page: Page
  rightTab: 'inspect' | 'formula' | 'watch' | 'predict' | 'settings'
  bottomTab: 'chart' | 'events'
  /** Effective theme (settings.themeMode resolved against the system appearance); read by the renderer. */
  theme: 'light' | 'dark'
  toast: { text: string; error: boolean } | null
  showTemplates: boolean
  showExport: boolean
  showAbout: boolean
  showCourseware: boolean
  showSweep: boolean
  showReport: boolean
  /** Incremented to ask the viewport to reset its camera. */
  cameraRequest: number
  /** Fit the view to the motion once the next recording is ready. */
  fitPending: boolean
}

const initialScene = buildTemplate('incline')

/** The application state; preferences are forwarded to `settings`. */
export const state = reactive<AppState>({
  scene: initialScene,
  fileName: null,
  filePath: null,
  dirty: false,
  past: [],
  future: [],
  selection: null,
  tool: 'select',
  pendingConnector: null,
  recording: null,
  situations: [],
  stale: true,
  computing: false,
  progress: 0,
  runId: 0,
  simError: null,
  // Preferences live in `settings`; these accessors keep the old field names working everywhere
  get autoRun() { return settings.autoRun },
  set autoRun(v: boolean) { settings.autoRun = v },
  frame: 0,
  time: 0,
  panelFrame: 0,
  playing: false,
  speed: 1,
  loop: false,
  get display() { return settings.display },
  set display(v: DisplayOptions) { settings.display = v },
  get digits() { return settings.digits },
  set digits(v: number) { settings.digits = Math.round(Math.min(12, Math.max(3, v))) },
  chart: [],
  page: 'studio',
  rightTab: 'formula',
  bottomTab: 'chart',
  theme: 'light',
  toast: null,
  showTemplates: false,
  showExport: false,
  showAbout: false,
  showCourseware: false,
  showSweep: false,
  showReport: false,
  cameraRequest: 0,
  fitPending: true
}) as AppState

// ---- Editing ----
const HISTORY_LIMIT = 200

/** Apply a change to the scene as one undoable step. */
export function edit(mutator: (scene: Scene) => void) {
  const before = serializeScene(state.scene)
  mutator(state.scene)
  const after = serializeScene(state.scene)
  if (before === after) return
  state.past.push(before)
  if (state.past.length > HISTORY_LIMIT) state.past.shift()
  state.future = []
  state.dirty = true
  markStale()
}

/** Undo the last edit. */
export function undo() {
  const prev = state.past.pop()
  if (!prev) return
  state.future.push(serializeScene(state.scene))
  state.scene = parseScene(prev).scene
  fixSelection()
  state.dirty = true
  markStale()
}

/** Redo the last undone edit. */
export function redo() {
  const next = state.future.pop()
  if (!next) return
  state.past.push(serializeScene(state.scene))
  state.scene = parseScene(next).scene
  fixSelection()
  state.dirty = true
  markStale()
}

function fixSelection() {
  const s = state.selection
  if (!s) return
  const exists = s.kind === 'body' ? state.scene.bodies.some(b => b.id === s.id) : s.kind === 'pulley' ? state.scene.pulleys.some(p => p.id === s.id) : state.scene.connectors.some(c => c.id === s.id)
  if (!exists) state.selection = null
}

/** Watch ids in their listed form (pair.b|a → pair.a|b), without duplicates, so every panel finds their labels. */
function normalizeWatch(scene: Scene) {
  const seen = new Set<string>()
  scene.watch = scene.watch.map(canonicalQuantityId).filter(id => !seen.has(id) && !!seen.add(id))
}

/** Replace the whole document (new, open, template). */
export function loadScene(scene: Scene, name: string | null, path: string | null = null) {
  normalizeWatch(scene)
  state.scene = scene
  state.fileName = name
  state.filePath = path
  state.past = []
  state.future = []
  state.dirty = false
  state.selection = null
  state.chart = defaultChart(scene)
  state.fitPending = true
  state.cameraRequest++
  markStale()
  runSimulation()
}

/** Initial chart quantities of a scene: the first three watched ones. */
export function defaultChart(scene: Scene): string[] {
  return scene.watch.slice(0, 3)
}

// ---- Simulation ----
let autoTimer: ReturnType<typeof setTimeout> | null = null
let runToken = 0
let handle: SimHandle | null = null

/** The scene changed: results are out of date, the run in flight is cancelled, and (auto-run) a new one is scheduled. */
export function markStale() {
  state.stale = true
  state.playing = false
  cancelSimulation()
  if (autoTimer) { clearTimeout(autoTimer); autoTimer = null }
  if (state.autoRun) autoTimer = setTimeout(() => { autoTimer = null; runSimulation() }, 350)
}

/** Stop the run in flight; the recording computed so far stays (marked incomplete). */
export function cancelSimulation() {
  if (!handle) return
  runToken++
  handle.cancel()
  handle = null
  state.computing = false
  state.progress = 0
}

/**
 * Show a (partial or final) recording; `first`: the first one this run delivers; `freshScene`: the scene was
 * edited since the last run (start from frame 0); otherwise the frame shown before the run (`keepFrame`) is kept.
 */
function acceptRecording(rec: Recording, first: boolean, freshScene: boolean, keepFrame: number) {
  state.recording = markRaw(rec)
  if (first && freshScene) state.situations = []
  state.stale = false
  const last = rec.frameCount - 1
  if (first && freshScene) setFrame(0)
  else if (!state.playing && state.frame > last) setFrame(last)
  else if (!state.playing && rec.completed !== false && keepFrame !== state.frame && keepFrame <= last && !freshScene) setFrame(keepFrame)
}

/** Compute the current scene. Partial recordings are shown while the run continues (settings.sim.progressive). */
export function runSimulation(): Promise<void> {
  if (autoTimer) { clearTimeout(autoTimer); autoTimer = null }
  if (handle) { handle.cancel(); handle = null }
  const token = ++runToken
  state.computing = true
  state.progress = 0
  state.simError = null
  const freshScene = state.stale
  const keepFrame = state.frame
  let scene: Scene
  try {
    scene = cloneScene(state.scene)
    validateScene(scene)
  } catch (e) {
    state.recording = null
    state.situations = []
    state.simError = (e as Error).message
    state.computing = false
    return Promise.resolve()
  }
  let delivered = false
  const started = performance.now()
  const h = startSimulation(scene, { budgetMs: settings.sim.budgetSeconds * 1000, useWorker: settings.sim.worker, progressive: settings.sim.progressive }, {
    onPartial: rec => {
      if (token !== runToken || !settings.sim.progressive || rec.frameCount < 2) return
      // Re-running an unchanged scene: keep showing the complete recording until the new one is done
      if (!freshScene && !delivered && state.recording?.completed) return
      if (!delivered) state.runId = token
      acceptRecording(rec, !delivered, freshScene, keepFrame)
      delivered = true
    },
    onProgress: (t, total) => { if (token === runToken) state.progress = total > 0 ? Math.min(1, t / total) : 0 }
  })
  handle = h
  return h.done.then(rec => {
    if (token !== runToken) return
    handle = null
    if (rec) {
      if (!delivered) state.runId = token
      acceptRecording(rec, !delivered, freshScene, keepFrame)
      state.situations = markRaw(recognize(rec))
      if (rec.error) state.simError = rec.error
      state.progress = 1
      logEvent('sim.run', { ms: Math.round(performance.now() - started), completed: rec.completed, frames: rec.frameCount, reduced: rec.reducedFrom != null })
    }
    state.computing = false
  }, e => {
    if (token !== runToken) return
    handle = null
    state.recording = null
    state.situations = []
    state.simError = (e as Error).message
    state.computing = false
  })
}

/** Playback time (s); 0 without a recording. */
export function currentTime(): number {
  return state.recording ? state.time : 0
}

/** Show a short message (errors stay longer). */
export function showToast(text: string, error = false) {
  state.toast = { text, error }
  const current = state.toast
  setTimeout(() => { if (state.toast === current) state.toast = null }, error ? 6000 : 2600)
}

// ---- Playback ----
let rafId = 0
let lastWall = 0
let lastPanel = 0
const PANEL_INTERVAL_MS = 80

/** Set the continuous time and the derived frame indices. */
function setTime(t: number, now = performance.now(), force = true) {
  const rec = state.recording
  if (!rec) return
  const tMax = (rec.frameCount - 1) * rec.dt
  const tc = Math.max(0, Math.min(tMax, t))
  state.time = tc
  const k = Math.min(rec.frameCount - 1, Math.floor(tc / rec.dt + 1e-9))
  if (k !== state.frame) state.frame = k
  if (force || now - lastPanel >= PANEL_INTERVAL_MS) {
    lastPanel = now
    if (state.panelFrame !== k) state.panelFrame = k
  }
}

function setFrame(k: number) {
  const rec = state.recording
  if (!rec) return
  const kc = Math.max(0, Math.min(rec.frameCount - 1, Math.round(k)))
  state.frame = kc
  state.panelFrame = kc
  state.time = kc * rec.dt
}

/** Start playback (from the start when at the end of a complete recording). */
export function play() {
  const rec = state.recording
  if (!rec || state.stale) return
  if (state.frame >= rec.frameCount - 1 && rec.completed !== false && !state.computing) setFrame(0)
  state.playing = true
  lastWall = performance.now()
  cancelAnimationFrame(rafId)
  const tick = (now: number) => {
    if (!state.playing || !state.recording) return
    const r = state.recording
    const dtWall = Math.min(0.25, (now - lastWall) / 1000)
    lastWall = now
    const tMax = (r.frameCount - 1) * r.dt
    let t = state.time + dtWall * state.speed
    if (t >= tMax) {
      if (state.computing) t = tMax // Progressive run: wait for more frames
      else if (state.loop) t = 0
      else { setTime(tMax, now, true); state.playing = false; return }
    }
    setTime(t, now, false)
    rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame(tick)
}

/** Stop playback; the panels catch up with the frame shown. */
export function pause() {
  state.playing = false
  cancelAnimationFrame(rafId)
  state.panelFrame = state.frame
}

/** Show recorded frame k. */
export function seekFrame(k: number) { setFrame(k) }

/** Show the recorded frame nearest to time t. */
export function seekTime(t: number) {
  const rec = state.recording
  if (!rec) return
  setFrame(Math.round(t / rec.dt))
}

/** Seek to an exact time between frames (drawing only; readouts use the frame at or before t). */
export function seekContinuous(t: number) { setTime(t) }

/** Seek to the first frame at or after an event time (readouts then show the state after the event). */
export function seekAfter(t: number) {
  const rec = state.recording
  if (!rec) return
  pause()
  setFrame(Math.ceil(t / rec.dt - 1e-9))
}

/** The current scene as file text. */
export function serializeCurrent(): string { return serializeScene(state.scene) }

/** Last camera of the viewport (for video export: "what you see is what you export"). */
export const viewCamera = { cx: 0, cy: 0, ppm: 80, width: 800, height: 600 }
