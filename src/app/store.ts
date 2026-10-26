/**
 * Application state. The scene is the only document; everything else (recording, situations, playback)
 * is derived from it. Every edit goes through `edit()` so it can be undone and so the result is marked
 * out of date. Recordings are large typed arrays and are kept out of Vue's reactivity (markRaw).
 *
 * Simulation runs through the simulation client (Web Worker when enabled): partial recordings are shown and
 * can be played while the rest is computed; a new edit cancels the run in flight. An unbounded scene (decision
 * D26) is computed ahead of the playhead and keeps growing while it plays; situations are recognised as its
 * phases complete (analysis/recognition.ts).
 */
import type { Message } from '../i18n/message'
import { MessageError } from '../i18n/message'
import { markRaw, reactive, watch, watchEffect } from 'vue'
import type { Scene } from '../core/scene/types'
import { cloneScene, parseScene, serializeScene, validateScene } from '../core/scene/io'
import type { Recording, RollingFingerprint } from '../core/solver/simulation'
import type { Situation } from '../formula/situations'
import { recognize } from '../formula/situations'
import { IncrementalRecognizer } from '../analysis/recognition'
import { StreamRecording } from '../core/solver/stream'
import { canonicalQuantityId } from '../core/observe/quantities'
import { logEvent } from './trialLog'
import { buildTemplate } from '../templates'
import { startSimulation } from './simClient'
import type { RunStats, SimHandle } from './simClient'
import type { DisplayOptions } from './settings'
import { settings } from './settings'
import { clock } from '../units/clock'
import type { Problem } from '../teaching/problems'
import { tl } from '../i18n'

export type { DisplayOptions } from './settings'

/** Active editor tool. */
export type Tool =
  | 'select' | 'pan'
  | 'add-ball' | 'add-block' | 'add-disc' | 'add-wedge' | 'add-ground' | 'add-incline' | 'add-wall' | 'add-conveyor' | 'add-pulley'
  | 'add-polygon'
  | 'connect-rope' | 'connect-rod' | 'connect-spring' | 'connect-hinge' | 'add-force'
  | 'connect-damper' | 'connect-weld' | 'connect-slider' | 'connect-motor' | 'connect-gear'
  | 'measure-ruler' | 'measure-angle' | 'annotate-text' | 'annotate-arrow'
  // 26.52: central fields, cutting and combining bodies
  | 'add-central' | 'shape-cut' | 'shape-combine'

/** Selected object, if any. */
export type Selection = { kind: 'body' | 'connector' | 'pulley'; id: string } | null

/** Top-level page. */
export type Page = 'studio' | 'monitor' | 'settings'

/** The run in flight or last run, for the timeline and the solver-information panel (decision D26). */
export interface RunInfo {
  /** The scene is unbounded: the run grows until stopped. */
  unbounded: boolean
  /** Simulated time computed (s). */
  tComputed: number
  /** Time the run computes to before it pauses (look-ahead target; +∞ for a bounded run). */
  tTarget: number
  /** Simulated seconds per wall-clock second of computing. */
  speed: number
  /** Memory held by the recording (bytes). */
  memoryBytes: number
  chunks: number
  residentChunks: number
  checkpoints: number
  /** Chunks recomputed from checkpoints on this thread. */
  rebuilds: number
  /** Engine that computes the run, and why Rust/WASM is not used (null when it is). */
  engine: 'wasm' | 'ts'
  engineReason: string | null
  /** Computing waits for the playhead (look-ahead full). */
  paused: boolean
  /** Rolling fingerprint up to `fingerprint.t`. */
  fingerprint: RollingFingerprint | null
}

/** RunInfo before any run. */
function emptyRun(): RunInfo {
  return { unbounded: false, tComputed: 0, tTarget: 0, speed: 0, memoryBytes: 0, chunks: 0, residentChunks: 0, checkpoints: 0, rebuilds: 0, engine: 'ts', engineReason: null, paused: false, fingerprint: null }
}

/** A problem being answered or written (26.52, D40): answers in SI (numeric) or option indices (choice). */
export interface ProblemSession {
  problem: Problem
  answers: Record<string, number | null>
  /** Answers checked: the animation, curves and formula cards are shown. */
  revealed: boolean
  /** Hints opened, by question id. */
  hints: Record<string, boolean>
  /** Teacher mode: the questions are edited, nothing is hidden. */
  editing: boolean
}

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
  /** Statistics of the run in flight or the last run. */
  run: RunInfo
  /** Playback has caught up with the computation and waits for more frames. */
  buffering: boolean
  simError: Message | string | null
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
  rightTab: 'inspect' | 'formula' | 'watch' | 'predict' | 'settings' | 'problem'
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
  /** 26.52 teaching tools (D62, D63) and the problem gallery (D40). */
  showFbd: boolean
  showTape: boolean
  showProblems: boolean
  /** The problem in progress (null: no problem mode). */
  problem: ProblemSession | null
  /** Incremented to ask the viewport to reset its camera. */
  cameraRequest: number
  /** Fit the view to the motion once the next recording is ready. */
  fitPending: boolean
  /** 26.51 learning handbook (D46): settings section to open, formula entry to show there. */
  settingsSection: string | null
  handbookFocus: string | null
  /** Formula card to bring into view in the formula panel (opened from the handbook). */
  formulaFocus: string | null
  /** Time to show as soon as the recording reaches it (an example opened from the handbook). */
  pendingSeek: number | null
  /** 26.51 branches (D52): the branch shown (null: the main scene). */
  branch: string | null
  /** The main scene (with its `branches`) while a branch is shown in `scene`; null on the main scene. */
  mainScene: Scene | null
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
  run: emptyRun(),
  buffering: false,
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
  showFbd: false,
  showTape: false,
  showProblems: false,
  problem: null,
  cameraRequest: 0,
  fitPending: true,
  settingsSection: null,
  handbookFocus: null,
  branch: null,
  mainScene: null,
  formulaFocus: null,
  pendingSeek: null
}) as AppState

// ---- Editing ----
const HISTORY_LIMIT = 200

/** Apply a change to the scene as one undoable step. */
/** A continuous gesture (scrubbing a number): its edits form one undo step. */
let gesture: { pushed: boolean } | null = null
/** Start a gesture: the edits until `endEditGesture` are undone together. */
export function beginEditGesture() { gesture = { pushed: false } }
/** End the gesture started by `beginEditGesture`. */
export function endEditGesture() { gesture = null }

export function edit(mutator: (scene: Scene) => void) {
  const before = serializeScene(state.scene)
  mutator(state.scene)
  const after = serializeScene(state.scene)
  if (before === after) return
  if (!gesture?.pushed) state.past.push(before)
  if (gesture) gesture.pushed = true
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
  state.problem = null
  state.branch = null
  state.mainScene = null
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
/** Incremental situation recognition of the run in flight. */
let recognizer: IncrementalRecognizer | null = null
let lastRecognition = 0
/** Least wall-clock time between two incremental recognitions (ms). */
const RECOGNITION_INTERVAL_MS = 400

/** The scene changed: results are out of date, the run in flight is cancelled, and (auto-run) a new one is scheduled. */
export function markStale() {
  state.stale = true
  state.playing = false
  abortRun()
  if (autoTimer) { clearTimeout(autoTimer); autoTimer = null }
  if (state.autoRun) autoTimer = setTimeout(() => { autoTimer = null; runSimulation() }, 350)
}

/**
 * The user's stop button: an unbounded run ends where it is and becomes a complete recording (stopRun); a bounded
 * run is cancelled, the recording computed so far stays (marked incomplete).
 */
export function cancelSimulation() {
  if (handle && state.run.unbounded) { stopRun(); return }
  abortRun()
}

/** Abandon the run in flight (the scene changed, or a bounded run is cancelled). */
function abortRun() {
  if (!handle) return
  runToken++
  handle.cancel()
  handle = null
  state.computing = false
  state.buffering = false
  state.progress = 0
  state.run.paused = false
}

/**
 * End an unbounded run where it is (the user's stop): everything computed is kept and the recording becomes
 * complete; situations are recognised over the whole of it.
 */
export function stopRun() {
  handle?.stop()
}

/** Compute the run in flight at least up to time t (an unbounded run otherwise stops at its look-ahead). */
export function computeTo(t: number) {
  handle?.computeTo(t)
  state.run.tTarget = Math.max(state.run.tTarget, t)
}

/** Tell the run in flight where playback is (it computes ahead of it). */
function reportPlayhead() {
  if (!handle || !state.run.unbounded) return
  handle.setPlayhead(state.time, state.playing ? state.speed : 0)
  state.run.tTarget = Math.max(state.run.tComputed, state.time + Math.max(settings.sim.lookAheadSeconds, 3 * (state.playing ? state.speed : 0)))
}

/** Change the look-ahead of the run in flight (settings page). */
export function applyLookAhead() {
  handle?.setLookAhead(settings.sim.lookAheadSeconds)
  reportPlayhead()
}

/** Change the memory budget of the current recording (settings page). */
export function applyMemoryBudget() {
  const bytes = settings.sim.memoryMB * 1024 * 1024
  const frames = state.recording?.frames
  if (frames instanceof StreamRecording) frames.setBudget(bytes)
  handle?.stream()?.setBudget(bytes)
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
  // An example opened from the handbook: show its time once it is computed
  const ts = state.pendingSeek
  if (ts !== null && (last * rec.dt >= ts - 1e-9 || rec.completed)) {
    state.pendingSeek = null
    setFrame(Math.min(last, Math.max(0, Math.round(ts / rec.dt))))
  }
}

let recognitionTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Recognise the situations of a growing recording, at most every RECOGNITION_INTERVAL_MS; a recording that arrives
 * sooner is recognised at the end of the interval (so the last one of a burst is never skipped).
 */
function recognizeGrowing(rec: Recording, token: number) {
  if (!recognizer || token !== runToken) return
  const wait = RECOGNITION_INTERVAL_MS - (performance.now() - lastRecognition)
  if (wait > 0) {
    if (recognitionTimer) clearTimeout(recognitionTimer)
    recognitionTimer = setTimeout(() => { recognitionTimer = null; recognizeGrowing(rec, token) }, wait)
    return
  }
  lastRecognition = performance.now()
  try { state.situations = markRaw(recognizer.update(rec)) } catch { /* Recognition of a partial recording is best effort */ }
}

/**
 * Recognise the situations of the shown recording again (the interface language changed: titles and conditions
 * are texts). A run in flight restarts its incremental recogniser on the recording received so far.
 */
export function recognizeAgain() {
  const rec = state.recording
  if (!rec) return
  try {
    if (recognizer) {
      recognizer = new IncrementalRecognizer()
      lastRecognition = performance.now()
      state.situations = markRaw(recognizer.update(rec))
    } else if (!state.computing) state.situations = markRaw(recognize(rec))
  } catch { /* Recognition of a partial recording is best effort */ }
}

/** Compute the current scene. Partial recordings are shown while the run continues (settings.sim.progressive). */
export function runSimulation(): Promise<void> {
  if (autoTimer) { clearTimeout(autoTimer); autoTimer = null }
  if (handle) { handle.cancel(); handle = null }
  const token = ++runToken
  state.computing = true
  state.buffering = false
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
    state.simError = e instanceof MessageError ? e.msg : (e as Error).message
    state.computing = false
    return Promise.resolve()
  }
  const unbounded = scene.settings.duration === null
  state.run = { ...emptyRun(), unbounded, tTarget: unbounded ? settings.sim.lookAheadSeconds : Infinity }
  recognizer = new IncrementalRecognizer()
  lastRecognition = 0
  let delivered = false
  const started = performance.now()
  const playhead = freshScene ? 0 : state.time
  const h = startSimulation(scene, {
    budgetMs: settings.sim.budgetSeconds * 1000, useWorker: settings.sim.worker, progressive: settings.sim.progressive || unbounded,
    lookAhead: settings.sim.lookAheadSeconds, memoryBytes: settings.sim.memoryMB * 1024 * 1024, engine: settings.sim.engine
  }, {
    onPartial: rec => {
      if (token !== runToken || rec.frameCount < 2) return
      if (!unbounded && !settings.sim.progressive) return
      // Re-running an unchanged bounded scene: keep showing the complete recording until the new one is done
      if (!unbounded && !freshScene && !delivered && state.recording?.completed) return
      if (!delivered) state.runId = token
      acceptRecording(rec, !delivered, freshScene, keepFrame)
      delivered = true
      recognizeGrowing(rec, token)
    },
    // Bounded: the fraction of the duration; unbounded: the fraction of the look-ahead target computed
    onProgress: (t, total) => { if (token === runToken) state.progress = Number.isFinite(total) ? (total > 0 ? Math.min(1, t / total) : 0) : (state.run.tTarget > 0 ? Math.min(1, t / state.run.tTarget) : 0) },
    onStats: st => {
      if (token !== runToken) return
      updateRunInfo(st)
    }
  })
  handle = h
  if (unbounded && playhead > 0) h.setPlayhead(playhead, 0)
  return h.done.then(rec => {
    if (token !== runToken) return
    handle = null
    if (rec) {
      if (!delivered) state.runId = token
      acceptRecording(rec, !delivered, freshScene, keepFrame)
      state.situations = markRaw(recognize(rec))
      if (rec.error) state.simError = rec.error
      state.progress = 1
      state.run.paused = false
      state.run.tTarget = state.run.tComputed
      logEvent('sim.run', { ms: Math.round(performance.now() - started), completed: rec.completed, frames: rec.frameCount, reduced: rec.reducedFrom != null })
    }
    recognizer = null
    if (recognitionTimer) { clearTimeout(recognitionTimer); recognitionTimer = null }
    state.computing = false
    state.buffering = false
  }, e => {
    if (token !== runToken) return
    handle = null
    recognizer = null
    state.recording = null
    state.situations = []
    state.simError = e instanceof MessageError ? e.msg : (e as Error).message
    state.computing = false
    state.buffering = false
  })
}

function updateRunInfo(st: RunStats) {
  const r = state.run
  r.tComputed = st.tComputed
  r.speed = st.speed
  r.memoryBytes = st.memoryBytes
  r.chunks = st.chunks
  r.residentChunks = st.residentChunks
  r.checkpoints = st.checkpoints
  r.rebuilds = st.rebuilds
  r.engine = st.engine
  r.engineReason = st.engineReason
  r.paused = st.paused
  r.fingerprint = st.fingerprint
  if (r.unbounded) r.tTarget = Math.max(r.tTarget, st.tComputed)
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
/** Simulated time at which the playhead was last reported to the run in flight. */
let reportedAt = -Infinity
/** Report the playhead to the run at least every this many simulated seconds of playback. */
const REPORT_EVERY = 1

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
  if (force || Math.abs(tc - reportedAt) >= REPORT_EVERY) { reportedAt = tc; reportPlayhead() }
}

function setFrame(k: number) {
  const rec = state.recording
  if (!rec) return
  const kc = Math.max(0, Math.min(rec.frameCount - 1, Math.round(k)))
  state.frame = kc
  state.panelFrame = kc
  state.time = kc * rec.dt
  reportedAt = state.time
  reportPlayhead()
}

/** Start playback (from the start when at the end of a complete recording). */
export function play() {
  const rec = state.recording
  if (!rec || state.stale) return
  if (problemLocked()) { showToast(tl('先作答，揭晓答案后再播放')); return }
  if (state.frame >= rec.frameCount - 1 && rec.completed !== false && !state.computing) setFrame(0)
  state.playing = true
  lastWall = performance.now()
  reportPlayhead()
  cancelAnimationFrame(rafId)
  const tick = (now: number) => {
    if (!state.playing || !state.recording) return
    const r = state.recording
    const dtWall = Math.min(0.25, (now - lastWall) / 1000)
    lastWall = now
    const tMax = (r.frameCount - 1) * r.dt
    let t = state.time + dtWall * state.speed
    if (t >= tMax) {
      if (state.computing) {
        // Progressive run: wait for more frames
        t = tMax
        if (!state.buffering) state.buffering = true
      } else if (state.loop) t = 0
      else { setTime(tMax, now, true); state.playing = false; state.buffering = false; return }
    } else if (state.buffering) state.buffering = false
    setTime(t, now, false)
    // The next chunk, if evicted, is recomputed off this thread before playback reaches it (26.51)
    const F = r.frames.chunkFrames
    if (F && r.frames.prefetch) r.frames.prefetch(Math.floor(state.frame / F) + 1)
    rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame(tick)
}

/** Stop playback; the panels catch up with the frame shown. */
export function pause() {
  state.playing = false
  state.buffering = false
  cancelAnimationFrame(rafId)
  state.panelFrame = state.frame
  reportPlayhead()
}

/** Show recorded frame k. */
export function seekFrame(k: number) { if (!problemLocked()) setFrame(k) }

/** Show the recorded frame nearest to time t. */
export function seekTime(t: number) {
  const rec = state.recording
  if (!rec || problemLocked()) return
  setFrame(Math.round(t / rec.dt))
}

/** Seek to an exact time between frames (drawing only; readouts use the frame at or before t). */
export function seekContinuous(t: number) { if (!problemLocked()) setTime(t) }

/** A problem is being answered: the playhead stays at t = 0 and results are hidden until the answers are revealed. */
export function problemLocked(): boolean {
  const p = state.problem
  return !!p && !p.revealed && !p.editing
}

/** Show frame 0 (also while a problem is locked). */
export function rewind() { pause(); setFrame(0) }
// Entering the answering state (opening a problem, leaving the teacher's editing) goes back to t = 0
watch(problemLocked, locked => { if (locked) rewind() })

/** Seek to the first frame at or after an event time (readouts then show the state after the event). */
export function seekAfter(t: number) {
  const rec = state.recording
  if (!rec || problemLocked()) return
  pause()
  setFrame(Math.ceil(t / rec.dt - 1e-9))
}

/**
 * The whole document: the main scene with its branches, the branch shown (if any) as currently edited (26.51,
 * D52). On the main scene this is `state.scene` itself.
 */
export function documentScene(): Scene {
  if (state.branch === null || !state.mainScene) return state.scene
  const doc = cloneScene(state.mainScene)
  const shown = cloneScene(state.scene)
  delete shown.branches
  doc.branches = (doc.branches ?? []).map(b => (b.id === state.branch ? { ...b, scene: shown } : b))
  return doc
}

/** The current document as file text (main scene and branches). */
export function serializeCurrent(): string { return serializeScene(documentScene()) }

// Every time shown is on the clock of the scene on screen (a branch starts at its branch point)
watchEffect(() => { clock.origin = state.scene.settings.startTime ?? 0 })

/** Last camera of the viewport (for video export: "what you see is what you export"). */
export const viewCamera = { cx: 0, cy: 0, ppm: 80, width: 800, height: 600 }
