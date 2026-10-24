/**
 * Application state. The scene is the only document; everything else (recording, situations, playback)
 * is derived from it. Every edit goes through `edit()` so it can be undone and so the result is marked
 * out of date. Recordings are large typed arrays and are kept out of Vue's reactivity (markRaw).
 */
import { markRaw, reactive, watch } from 'vue'
import type { Scene } from '../core/scene/types'
import { cloneScene, parseScene, serializeScene, validateScene } from '../core/scene/io'
import type { Recording } from '../core/solver/simulation'
import { simulate } from '../core/solver/simulation'
import type { Situation } from '../formula/situations'
import { recognize } from '../formula/situations'
import { buildTemplate } from '../templates'

export type Tool =
  | 'select' | 'pan'
  | 'add-ball' | 'add-block' | 'add-disc' | 'add-wedge' | 'add-ground' | 'add-incline' | 'add-wall' | 'add-conveyor' | 'add-pulley'
  | 'connect-rope' | 'connect-rod' | 'connect-spring' | 'connect-hinge' | 'add-force'

export type Selection = { kind: 'body' | 'connector' | 'pulley'; id: string } | null

export interface DisplayOptions {
  velocity: boolean
  acceleration: boolean
  forces: boolean
  forcesAll: boolean
  trajectory: boolean
  labels: boolean
  grid: boolean
  axes: boolean
  names: boolean
}

export interface AppState {
  scene: Scene
  fileName: string | null
  filePath: string | null
  dirty: boolean
  past: string[]
  future: string[]
  selection: Selection
  tool: Tool
  pendingConnector: null | { tool: Tool; first: { body: string | null; local: { x: number; y: number }; world: { x: number; y: number } }; pulleys: Array<{ pulley: string; wrap: 'cw' | 'ccw' }> }
  recording: Recording | null
  situations: Situation[]
  stale: boolean
  computing: boolean
  simError: string | null
  autoRun: boolean
  frame: number
  playing: boolean
  speed: number
  loop: boolean
  display: DisplayOptions
  digits: number
  chart: string[]
  rightTab: 'inspect' | 'formula' | 'watch' | 'settings'
  bottomTab: 'chart' | 'events'
  theme: 'light' | 'dark'
  toast: { text: string; error: boolean } | null
  showTemplates: boolean
  showExport: boolean
  showAbout: boolean
  cameraRequest: number
  /** Fit the view to the motion once the next recording is ready. */
  fitPending: boolean
}

const initialScene = buildTemplate('incline')

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
  simError: null,
  autoRun: true,
  frame: 0,
  playing: false,
  speed: 1,
  loop: false,
  display: { velocity: true, acceleration: false, forces: true, forcesAll: false, trajectory: true, labels: true, grid: true, axes: true, names: true },
  digits: 4,
  chart: [],
  rightTab: 'formula',
  bottomTab: 'chart',
  theme: 'light',
  toast: null,
  showTemplates: false,
  showExport: false,
  showAbout: false,
  cameraRequest: 0,
  fitPending: true
}) as AppState

// ---------------------------------------------------------------------------------------------- editing
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

export function undo() {
  const prev = state.past.pop()
  if (!prev) return
  state.future.push(serializeScene(state.scene))
  state.scene = parseScene(prev).scene
  fixSelection()
  state.dirty = true
  markStale()
}

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

/** Replace the whole document (new, open, template). */
export function loadScene(scene: Scene, name: string | null, path: string | null = null) {
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

export function defaultChart(scene: Scene): string[] {
  return scene.watch.slice(0, 3)
}

// ---------------------------------------------------------------------------------------------- simulation
let autoTimer: ReturnType<typeof setTimeout> | null = null

export function markStale() {
  state.stale = true
  state.playing = false
  if (state.autoRun) {
    if (autoTimer) clearTimeout(autoTimer)
    autoTimer = setTimeout(() => runSimulation(), 350)
  }
}

let runToken = 0
export function runSimulation(): Promise<void> {
  const token = ++runToken
  state.computing = true
  state.simError = null
  return new Promise(resolve => {
    // let the UI paint the "computing" state first
    setTimeout(() => {
      if (token !== runToken) { resolve(); return }
      try {
        const scene = cloneScene(state.scene)
        validateScene(scene)
        const rec = simulate(scene, { budgetMs: 60000 })
        const sits = recognize(rec)
        state.recording = markRaw(rec)
        state.situations = markRaw(sits)
        state.frame = Math.min(state.frame, rec.frameCount - 1)
        if (state.stale) state.frame = 0
        state.stale = false
        if (rec.error) state.simError = rec.error
      } catch (e) {
        state.recording = null
        state.situations = []
        state.simError = (e as Error).message
      }
      state.computing = false
      resolve()
    }, 16)
  })
}

export function currentTime(): number {
  return state.recording ? state.frame * state.recording.dt : 0
}

export function showToast(text: string, error = false) {
  state.toast = { text, error }
  const current = state.toast
  setTimeout(() => { if (state.toast === current) state.toast = null }, error ? 6000 : 2600)
}

// ---------------------------------------------------------------------------------------------- playback
let rafId = 0
let lastWall = 0
let playTime = 0

export function play() {
  const rec = state.recording
  if (!rec || state.stale) return
  if (state.frame >= rec.frameCount - 1) state.frame = 0
  state.playing = true
  lastWall = performance.now()
  playTime = state.frame * rec.dt
  cancelAnimationFrame(rafId)
  const tick = (now: number) => {
    if (!state.playing || !state.recording) return
    const r = state.recording
    playTime += ((now - lastWall) / 1000) * state.speed
    lastWall = now
    let k = Math.floor(playTime / r.dt + 1e-9)
    if (k >= r.frameCount - 1) {
      if (state.loop) { playTime = 0; k = 0 } else { k = r.frameCount - 1; state.playing = false }
    }
    state.frame = k
    if (state.playing) rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame(tick)
}

export function pause() { state.playing = false; cancelAnimationFrame(rafId) }

export function seekFrame(k: number) {
  const rec = state.recording
  if (!rec) return
  state.frame = Math.max(0, Math.min(rec.frameCount - 1, Math.round(k)))
  playTime = state.frame * rec.dt
}

export function seekTime(t: number) {
  const rec = state.recording
  if (!rec) return
  seekFrame(Math.round(t / rec.dt))
}

// ---------------------------------------------------------------------------------------------- preferences
const PREF_KEY = 'verity.prefs.v1'
interface Prefs { theme: 'light' | 'dark'; digits: number; display: DisplayOptions; autoRun: boolean }
export function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREF_KEY)
    if (!raw) {
      state.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      return
    }
    const p = JSON.parse(raw) as Partial<Prefs>
    if (p.theme === 'dark' || p.theme === 'light') state.theme = p.theme
    if (typeof p.digits === 'number' && p.digits >= 3 && p.digits <= 12) state.digits = p.digits
    if (p.display) Object.assign(state.display, p.display)
    if (typeof p.autoRun === 'boolean') state.autoRun = p.autoRun
  } catch { /* preferences are optional */ }
}
export function savePrefs() {
  try {
    const p: Prefs = { theme: state.theme, digits: state.digits, display: { ...state.display }, autoRun: state.autoRun }
    localStorage.setItem(PREF_KEY, JSON.stringify(p))
  } catch { /* ignore */ }
}

watch(() => [state.theme, state.digits, state.autoRun, { ...state.display }], () => {
  document.documentElement.dataset.theme = state.theme
  savePrefs()
}, { deep: true })

export function serializeCurrent(): string { return serializeScene(state.scene) }

/** Last camera of the viewport (for video export: “what you see is what you export”). */
export const viewCamera = { cx: 0, cy: 0, ppm: 80, width: 800, height: 600 }
