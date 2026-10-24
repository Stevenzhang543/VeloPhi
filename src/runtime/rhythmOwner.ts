/** 26.46 rhythm runtime: plays every RhythmChart2D of the running scene. The song is decoded whole and
 * scheduled on the audio clock; chart time is read from the clock the speakers follow (output timestamp),
 * input carries the browser's event time, and judgement, scoring and note positions come from the Rust
 * core (nova_rhythm through WasmRhythmSession). Frames are published for the scene renderer.
 * 26.47: the chart's own note types (look, prefab notes from a pool, hit sounds; custom notes reported as
 * touches and judged by scripts), the master timeline (tracks applied to scene objects, the camera and
 * post-processing; triggers as signals), a separate picture offset and the hit error bar. */
import { WasmRhythmSession } from '../../nova_core/pkg/nova_core.js'
import type { Entity } from '../world/Entity'
import type { RhythmChart2D, RhythmPlayState } from '../world/components'
import { worldTransform } from '../world/hierarchy'
import type { RhythmAudioBuffer, RhythmAudioPort, RhythmAudioVoice } from './audioRuntimeContracts'
import type { TimedInputEvent } from './input'
import { publishRhythmFrame, RHYTHM_FRAME_NOTE_STRIDE, type RhythmFrame, type RhythmFrameEffect, type RhythmFrameNoteType, type RhythmFrameStatus } from '../renderer/rhythmFrames'
import { JUDGEMENT_LABELS, RhythmChartClock, isRhythmKeyboardKey, laneKeyCodes, rhythmSettingsArray, songSchedule } from './rhythmClock'
import { CHART_TRACK_CAMERA, CHART_TRACK_POST, normalizeChartDocument, type ChartNoteTypeDef } from './rhythmChartDocument'
import type { Camera2D, ShapeRenderer2D, SpriteRenderer2D, TextRenderer2D } from '../world/components'
import { setWorldTransform } from '../world/hierarchy'

export interface RhythmOwnerPorts {
  entities(): readonly Entity[]
  resolveAsset(reference: string | null | undefined): { uuid: string; assetType: string } | null
  readText(reference: string | null | undefined): string | null
  /** Catalog revision; charts are re-read only when it changes. */
  revision(): number
  audio(): RhythmAudioPort | null
  openTimedInput(): () => void
  takeTimedInput(): TimedInputEvent[]
  /** Client (CSS pixel) point → world through the active game camera; null without a viewport. */
  clientToWorld(clientX: number, clientY: number): { x: number; y: number } | null
  nowMs(): number
  emit(signal: string, payload: Record<string, unknown>, target: string): void
  log(message: string, level: 'info' | 'warning' | 'error'): void
  /** The player's device calibration in milliseconds (positive: the music is heard later than reported). */
  calibrationMs(): number
  /** Keyboard codes bound to the project's input actions (Pause, Retry…): in lines mode without authored lane
   * keys every other letter, digit and Space hits, so these stay free for the actions. */
  reservedKeys?(): ReadonlySet<string>
  /** 26.47: the player's picture offset in milliseconds (positive: notes are drawn earlier, for screens that
   * show frames late). Judgement is not affected. */
  visualOffsetMs?(): number
  /** 26.47: prefab notes. Spawns a prefab (root returned) and removes an instance when play ends. */
  spawnPrefab?(reference: string, position: { x: number; y: number }): Entity | null
  despawn?(entity: Entity): void
  /** 26.47: master-timeline post-processing values (exposure, bloom…), set without a tween. */
  setPost?(name: string, value: number): void
}

export interface RhythmSnapshot {
  active: boolean
  entity: string
  state: string
  time: number
  beat: number
  bpm: number
  score: number
  combo: number
  maxCombo: number
  accuracy: number
  perfect: number
  great: number
  good: number
  bad: number
  miss: number
  judged: number
  total: number
  early: number
  late: number
  meanOffsetMs: number
  lastJudgement: string
  finished: boolean
  fullCombo: boolean
  allPerfect: boolean
  progress: number
  length: number
  offsetMs: number
  autoplay: boolean
  title: string
  /** 26.47: the picture offset in use (milliseconds). */
  visualOffsetMs: number
  /** 26.47: on an object that shows a note (prefab note types): that note. */
  note: Record<string, unknown> | null
}

export type RhythmCommandAction = 'play' | 'pause' | 'resume' | 'stop' | 'restart' | 'seek' | 'offset' | 'autoplay' | 'speed' | 'visual'

const SCHEDULE_MARGIN = .12
const EFFECT_SECONDS = .45
const AUTOPLAY_LOOKAHEAD = .25
/** A prefab note stays where it was judged this long (its hit animation, its signal), then goes back to the pool. */
const PREFAB_LINGER = .2
const MAX_PREFAB_NOTES = 256
const ERROR_BAR_HITS = 24
const ERROR_BAR_SECONDS = 3
const BUILTIN_NAMES = ['tap', 'hold', 'drag', 'flick', 'custom']

interface PrefabNote { root: Entity; members: Entity[]; typeIndex: number; note: number; releaseAt: number }
interface TrackTarget { target: string; property: string }

interface ChartRun {
  component: RhythmChart2D
  entity: Entity
  session: WasmRhythmSession | null
  chartReference: string
  chartSource: string
  revision: number
  audioReference: string
  /** Seconds: where beat 0 is in the audio, with the component's and the device's offsets. */
  audioOffset: number
  song: RhythmAudioBuffer | null
  hitSound: RhythmAudioBuffer | null
  voice: RhythmAudioVoice | null
  clock: RhythmChartClock
  silent: boolean
  status: RhythmFrameStatus
  message: string
  loadToken: number
  noteTimes: Float64Array
  noteKinds: Float64Array
  length: number
  lanes: number
  mode: 0 | 1
  keyCodes: string[]
  lanePress: Float64Array
  heldLanes: Map<number, number>
  effects: RhythmFrameEffect[]
  lastJudgement: { judgement: number; offsetMs: number; at: number } | null
  lastBeat: number
  autoplayUntil: number
  /** After a resume: the time the chart was paused at (autoplay clicks start after it). */
  replayUntil: number
  finishedEmitted: boolean
  /** Chart time to start from once the audio can play. */
  startAt: number
  time: number
  stats: Float64Array
  lastClickMs: number
  /** Silent clock: performance time the engine paused at. */
  heldSince: number | null
  title: string
  /** 26.47 note types by index (null for the built-in four), with their look for the renderer. */
  typeIds: string[]
  typeDefs: (ChartNoteTypeDef | null)[]
  frameTypes: RhythmFrameNoteType[]
  typeSounds: (RhythmAudioBuffer | null)[]
  /** Per compiled note: type index, chart-file index, lane, line, x. */
  noteTypeIndex: Int32Array
  noteSource: Int32Array
  noteLane: Float64Array
  noteLine: Float64Array
  noteX: Float64Array
  /** The chart file's notes (for each note's `data`). */
  rawNotes: unknown[]
  tracks: TrackTarget[]
  /** A target's own value before the timeline first changed it (restored before its track starts). */
  trackBase: Map<string, number>
  triggerNames: string[]
  prefabs: Map<number, PrefabNote>
  prefabPool: Map<number, PrefabNote[]>
  errorHits: { offsetMs: number; judgement: number; at: number }[]
}

const STAT = { score: 0, accuracy: 1, combo: 2, maxCombo: 3, perfect: 4, great: 5, good: 6, bad: 7, miss: 8, judged: 9, total: 10, early: 11, late: 12, mean: 13, deviation: 14, finished: 15 } as const

/** Pending "start from here" requests from the chart editor, by component uuid (chart seconds). */
const startRequests = new Map<string, number>()
/** Asks the next play session to start this chart at `seconds` (the chart editor's "test from here"). */
export function requestRhythmStart(componentUuid: string, seconds: number): void {
  if (Number.isFinite(seconds)) startRequests.set(componentUuid, seconds); else startRequests.delete(componentUuid)
}

/** The device calibration stored in this browser (milliseconds), or 0. */
export function storedRhythmCalibration(): number {
  try { const value = Number(globalThis.localStorage?.getItem('nova.rhythm.calibrationMs')); return Number.isFinite(value) ? Math.max(-500, Math.min(500, value)) : 0 } catch { return 0 }
}
export function storeRhythmCalibration(milliseconds: number): void {
  try { globalThis.localStorage?.setItem('nova.rhythm.calibrationMs', String(Math.round(Math.max(-500, Math.min(500, milliseconds))))) } catch { /* Private mode or blocked storage: the offset lasts this session only. */ }
}
/** 26.47: the picture offset stored in this browser (milliseconds; positive draws notes earlier), or 0. */
export function storedRhythmVisualOffset(): number {
  try { const value = Number(globalThis.localStorage?.getItem('nova.rhythm.visualOffsetMs')); return Number.isFinite(value) ? Math.max(-500, Math.min(500, value)) : 0 } catch { return 0 }
}
export function storeRhythmVisualOffset(milliseconds: number): void {
  try { globalThis.localStorage?.setItem('nova.rhythm.visualOffsetMs', String(Math.round(Math.max(-500, Math.min(500, milliseconds))))) } catch { /* As above. */ }
}

/** The renderer's note types for a compiled chart and its document's own types (the chart editor's preview). */
export function rhythmFrameTypes(session: WasmRhythmSession, noteTypes: readonly ChartNoteTypeDef[]): RhythmFrameNoteType[] {
  return session.type_ids().split('\n').map((id, index) => frameNoteType(index < 4 ? null : noteTypes.find(type => type.id === id) ?? null))
}

/** Renderer look of a note type (null: a built-in type drawn with the component's colours). */
function frameNoteType(def: ChartNoteTypeDef | null): RhythmFrameNoteType {
  if (!def) return { shape: 'bar', color: null, scale: 1, hidden: false }
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(def.color)
  return {
    shape: def.shape, color: hex ? { r: parseInt(hex[1], 16), g: parseInt(hex[2], 16), b: parseInt(hex[3], 16) } : null, scale: def.scale,
    // A prefab note without a shape is drawn by its prefab only.
    hidden: def.shape === 'none'
  }
}

const NO_KEYS: ReadonlySet<string> = new Set()
function rank(score: number): string { return score >= 1_000_000 ? 'P' : score >= 950_000 ? 'S' : score >= 900_000 ? 'A' : score >= 800_000 ? 'B' : score >= 700_000 ? 'C' : 'D' }

export class RuntimeRhythmOwner {
  private runs = new Map<string, ChartRun>()
  private closeInput: (() => void) | null = null
  private active = false
  private songCache = new Map<string, Promise<RhythmAudioBuffer | null>>()
  private loadSerial = 0
  /** Entity uuid of every object that shows a note (prefab note roots and their children) → its note. */
  private noteObjects = new Map<string, { run: ChartRun; prefab: PrefabNote }>()
  private failedPrefabs = new Set<string>()
  private missingTargets = new Set<string>()
  readonly diagnostics = { charts: 0, notesJudged: 0, inputEvents: 0, lastError: '' as string, clockSource: 'none' as 'audio' | 'performance' | 'none', latencyMs: 0 }

  constructor(private readonly ports: RhythmOwnerPorts) {
    for (const key of ['entities', 'resolveAsset', 'readText', 'revision', 'audio', 'openTimedInput', 'takeTimedInput', 'clientToWorld', 'nowMs', 'emit', 'log', 'calibrationMs'] as const) {
      if (typeof ports?.[key] !== 'function') throw new Error(`RHYTHM_PORTS_REQUIRED: missing ${key}`)
    }
  }

  get running(): boolean { return this.active }

  /** Play started: charts with playOnStart load at once, the others wait for rhythm_play(). */
  begin(): void {
    this.stop()
    this.active = true
    this.closeInput = this.ports.openTimedInput()
    for (const entity of this.ports.entities()) {
      const component = entity.getComponent<RhythmChart2D>('RhythmChart2D')
      if (!component || !component.enabled) continue
      this.resetComponent(component)
      if (component.playOnStart) this.load(entity, component)
    }
  }

  /** Play stopped: every voice stops and the charts go back to their placeholder. */
  stop(): void {
    for (const run of this.runs.values()) { run.voice?.stop(); this.disposePrefabs(run); run.session?.free(); publishRhythmFrame(run.component.uuid, null); this.resetComponent(run.component) }
    this.runs.clear()
    this.noteObjects.clear(); this.failedPrefabs.clear()
    this.closeInput?.(); this.closeInput = null
    this.active = false
    this.diagnostics.charts = 0
  }

  dispose(): void { this.stop(); this.songCache.clear() }

  private resetComponent(component: RhythmChart2D): void {
    component.state = 'idle'; component.lastError = null; component.runtimeSongTime = 0; component.runtimeScore = 0
    component.runtimeCombo = 0; component.runtimeMaxCombo = 0; component.runtimeAccuracy = 1; component.runtimeJudgement = ''
  }

  private setState(run: ChartRun, status: RhythmFrameStatus, message = ''): void {
    run.status = status; run.message = message
    const state: RhythmPlayState = status === 'preview' || status === 'countdown' ? 'playing' : status === 'ready' ? 'loading' : status
    if (run.component.state !== state) run.component.state = state
  }

  /** Reads and compiles the chart, then decodes the song; the chart starts when the audio clock runs. */
  private load(entity: Entity, component: RhythmChart2D, startAt?: number): void {
    const previous = this.runs.get(component.uuid)
    previous?.voice?.stop(); if (previous) this.disposePrefabs(previous); previous?.session?.free()
    const reference = component.chartAsset ?? ''
    const run: ChartRun = {
      component, entity, session: null, chartReference: reference, chartSource: '', revision: this.ports.revision(), audioReference: '', audioOffset: 0,
      song: null, hitSound: null, voice: null, clock: new RhythmChartClock(), silent: true, status: 'loading', message: 'Loading…', loadToken: ++this.loadSerial,
      noteTimes: new Float64Array(0), noteKinds: new Float64Array(0), length: 0, lanes: 4, mode: 0, keyCodes: [], lanePress: new Float64Array(16), heldLanes: new Map(),
      effects: [], lastJudgement: null, lastBeat: Number.NEGATIVE_INFINITY, autoplayUntil: Number.NEGATIVE_INFINITY, replayUntil: Number.NEGATIVE_INFINITY, finishedEmitted: false,
      startAt: startAt ?? startRequests.get(component.uuid) ?? -Math.max(0, component.leadInSeconds), time: 0, stats: new Float64Array(16), lastClickMs: 0, heldSince: null, title: '',
      typeIds: [...BUILTIN_NAMES.slice(0, 4)], typeDefs: [null, null, null, null], frameTypes: [], typeSounds: [], noteTypeIndex: new Int32Array(0), noteSource: new Int32Array(0),
      noteLane: new Float64Array(0), noteLine: new Float64Array(0), noteX: new Float64Array(0), rawNotes: [], tracks: [], trackBase: new Map(), triggerNames: [],
      prefabs: new Map(), prefabPool: new Map(), errorHits: []
    }
    startRequests.delete(component.uuid)
    run.time = run.startAt
    this.runs.set(component.uuid, run); this.diagnostics.charts = this.runs.size
    this.setState(run, 'loading', 'Loading…')
    const fail = (message: string) => { this.setState(run, 'error', message); component.lastError = message; this.diagnostics.lastError = message; this.ports.log(`${entity.name}: ${message}`, 'warning'); this.publish(run) }
    if (!reference) { fail('No chart asset is assigned.'); return }
    const source = this.ports.readText(reference)
    if (source === null) { fail(`Chart asset not found: ${reference}`); return }
    run.chartSource = source
    try { run.session = new WasmRhythmSession(source, rhythmSettingsArray(component)) } catch (error) { fail(`Chart error: ${error instanceof Error ? error.message : String(error)}`); return }
    const session = run.session
    run.mode = session.mode() === 1 ? 1 : 0; run.lanes = session.lanes(); run.length = session.length(); run.title = session.title()
    run.keyCodes = laneKeyCodes(run.lanes, component.laneKeys)
    const notes = session.notes(), stride = 10, count = Math.floor(notes.length / stride)
    run.noteTimes = new Float64Array(count); run.noteKinds = new Float64Array(count); run.noteTypeIndex = new Int32Array(count); run.noteSource = new Int32Array(count)
    run.noteLane = new Float64Array(count); run.noteLine = new Float64Array(count); run.noteX = new Float64Array(count)
    for (let index = 0; index < count; index++) {
      const at = index * stride
      run.noteTimes[index] = notes[at + 2]; run.noteKinds[index] = notes[at + 1]; run.noteLane[index] = notes[at + 4]; run.noteLine[index] = notes[at + 5]
      run.noteX[index] = notes[at + 6]; run.noteTypeIndex[index] = notes[at + 8]; run.noteSource[index] = notes[at + 9]
    }
    // 26.47: note types (look, prefab, sound), note data, the timeline.
    let documentTypes: ChartNoteTypeDef[] = []
    try { const parsed = JSON.parse(source) as { notes?: unknown }; run.rawNotes = Array.isArray(parsed.notes) ? parsed.notes : []; documentTypes = normalizeChartDocument(parsed).noteTypes } catch { run.rawNotes = [] }
    run.typeIds = session.type_ids().split('\n')
    run.typeDefs = run.typeIds.map((id, index) => index < 4 ? null : documentTypes.find(type => type.id === id) ?? null)
    run.frameTypes = run.typeDefs.map(frameNoteType)
    run.typeSounds = run.typeIds.map(() => null)
    const trackInfo = session.track_info()
    run.tracks = trackInfo ? trackInfo.split('\n').map(line => { const [target, property] = line.split('\t'); return { target: target ?? '', property: property ?? '' } }) : []
    run.triggerNames = session.trigger_names().split('\n')
    run.audioOffset = (session.offset_ms() + component.offsetMs + this.ports.calibrationMs()) / 1000
    session.seek(run.startAt)
    run.audioReference = component.audioAsset || session.audio()
    const port = this.ports.audio()
    const token = run.loadToken
    const songReady = (song: RhythmAudioBuffer | null) => {
      if (this.runs.get(component.uuid) !== run || run.loadToken !== token) return
      run.song = song; run.silent = !song
      if (!song && run.audioReference) this.ports.log(`${entity.name}: the song “${run.audioReference}” could not be decoded; the chart plays without music.`, 'warning')
      this.setState(run, 'ready', 'Click or press a key to start')
      this.tryStart(run)
    }
    if (component.hitSound && component.hitSoundAsset && port) void this.decodeCached(port, component.hitSoundAsset).then(buffer => { if (this.runs.get(component.uuid) === run) run.hitSound = buffer })
    if (port) run.typeDefs.forEach((def, index) => {
      if (def?.hitSound && this.ports.resolveAsset(def.hitSound)) void this.decodeCached(port, def.hitSound).then(buffer => { if (this.runs.get(component.uuid) === run) run.typeSounds[index] = buffer })
    })
    if (!run.audioReference || !port || !this.ports.resolveAsset(run.audioReference)) {
      if (run.audioReference && !this.ports.resolveAsset(run.audioReference)) this.ports.log(`${entity.name}: audio asset not found: ${run.audioReference}; the chart plays without music.`, 'warning')
      songReady(null); return
    }
    void this.decodeCached(port, run.audioReference).then(songReady, () => songReady(null))
  }

  private decodeCached(port: RhythmAudioPort, reference: string): Promise<RhythmAudioBuffer | null> {
    const key = this.ports.resolveAsset(reference)?.uuid ?? reference
    let pending = this.songCache.get(key)
    if (!pending) {
      pending = port.decode(reference)
      this.songCache.set(key, pending)
      void pending.then(buffer => { if (!buffer) this.songCache.delete(key) })
      // Keep only the latest few songs decoded (a song is tens of megabytes).
      while (this.songCache.size > 3) this.songCache.delete(this.songCache.keys().next().value!)
    }
    return pending
  }

  /** Starts a ready chart once the audio clock runs (silent charts start at once). */
  private tryStart(run: ChartRun): boolean {
    if (run.status !== 'ready' || !run.session) return false
    const port = this.ports.audio()
    if (run.song && port) {
      if (port.state() !== 'running') { void port.resume().then(running => { if (running) this.tryStart(run) }); return false }
      const contextNow = port.contextTime()
      if (contextNow === null) return false
      const when = contextNow + SCHEDULE_MARGIN, schedule = songSchedule(run.startAt, when, run.audioOffset)
      run.voice?.stop()
      run.voice = schedule.offset < run.song.duration ? port.start(run.song, schedule.start, schedule.offset, { bus: run.component.bus || 'Music', volume: run.component.volume }) : null
      run.clock.start(run.startAt, when)
      this.diagnostics.clockSource = 'audio'; this.diagnostics.latencyMs = port.latency() * 1000
    } else {
      run.silent = true
      run.clock.start(run.startAt, this.ports.nowMs() / 1000 + SCHEDULE_MARGIN)
      this.diagnostics.clockSource = 'performance'
    }
    run.autoplayUntil = Math.max(run.startAt, run.replayUntil); run.replayUntil = Number.NEGATIVE_INFINITY; run.heldSince = null
    this.setState(run, run.startAt < 0 ? 'countdown' : 'playing')
    if (!run.finishedEmitted) this.ports.emit('rhythm.started', { title: run.title, time: run.startAt }, run.entity.uuid)
    return true
  }

  /** The source clock of a run at performance time `nowMs`. */
  private source(run: ChartRun, nowMs: number): number {
    if (run.silent || !run.song) return nowMs / 1000
    return this.ports.audio()?.heardContextTime(nowMs) ?? nowMs / 1000
  }

  /** One rendered frame. `playing` false while the editor is paused (the audio clock is suspended then). */
  update(playing: boolean): void {
    if (!this.active) return
    const now = this.ports.nowMs()
    const events = this.ports.takeTimedInput()
    this.diagnostics.inputEvents += events.length
    // Charts whose asset changed while playing reload at the same time (chart-editor round trips).
    const revision = this.ports.revision()
    for (const run of this.runs.values()) {
      if (run.revision !== revision) {
        run.revision = revision
        const source = this.ports.readText(run.chartReference)
        if (source !== null && source !== run.chartSource && (run.status === 'playing' || run.status === 'countdown' || run.status === 'paused' || run.status === 'error')) { this.load(run.entity, run.component, run.status === 'error' ? undefined : run.time); continue }
      }
    }
    for (const run of [...this.runs.values()]) {
      if (!run.component.enabled || run.component.removed) continue
      if (!playing) {
        if (run.silent && run.clock.isRunning && run.heldSince === null) run.heldSince = now
        this.publish(run)
        continue
      }
      if (run.heldSince !== null) { run.clock.shift((now - run.heldSince) / 1000); run.heldSince = null }
      if (run.status === 'ready') {
        // A press (a user gesture) lets the browser start audio; it does not count as a hit.
        if (events.some(event => event.kind === 'press')) { void this.ports.audio()?.resume(); this.tryStart(run) } else this.tryStart(run)
        this.publish(run)
        continue
      }
      if (run.status !== 'playing' && run.status !== 'countdown' && run.status !== 'finished') { this.publish(run); continue }
      this.step(run, now, events)
    }
  }

  private step(run: ChartRun, now: number, events: readonly TimedInputEvent[]): void {
    const session = run.session
    if (!session) return
    const source = this.source(run, now)
    const time = run.clock.sample(now, source)
    run.time = time
    if (run.status === 'countdown' && time >= 0) this.setState(run, 'playing')
    const input = this.mapInput(run, events, source)
    const judgements = session.advance(time, input)
    this.applyJudgements(run, judgements, now)
    this.applyTouches(run)
    this.fireTriggers(run)
    this.applyTracks(run, time + this.visualSeconds())
    if (run.component.hitSound && run.component.botPlay) this.scheduleAutoplayClicks(run, time)
    // Lane glow decays unless held.
    for (let lane = 0; lane < run.lanePress.length; lane++) {
      const held = [...run.heldLanes.values()].includes(lane)
      run.lanePress[lane] = held ? 1 : Math.max(0, run.lanePress[lane] - .12)
    }
    run.effects = run.effects.filter(effect => (effect.age = time - (effect as RhythmFrameEffect & { born: number }).born) <= EFFECT_SECONDS)
    if (run.errorHits.length && time - run.errorHits[0].at > ERROR_BAR_SECONDS) run.errorHits = run.errorHits.filter(hit => time - hit.at <= ERROR_BAR_SECONDS)
    const beat = session.time_to_beat(time)
    if (time >= 0 && Math.floor(beat) > run.lastBeat) {
      run.lastBeat = Math.floor(beat)
      this.ports.emit('rhythm.beat', { beat: run.lastBeat, bpm: session.bpm_at(time) }, run.entity.uuid)
    }
    run.stats = session.stats()
    this.writeComponent(run)
    if (run.stats[STAT.finished] > .5 && time >= run.length + .6 && !run.finishedEmitted) {
      run.finishedEmitted = true
      const s = run.stats, full = s[STAT.miss] === 0 && s[STAT.bad] === 0, perfect = full && s[STAT.great] === 0 && s[STAT.good] === 0
      this.setState(run, 'finished', `${perfect ? 'ALL PERFECT' : full ? 'FULL COMBO' : 'CLEAR'} · ${rank(s[STAT.score])} · ${Math.round(s[STAT.score]).toLocaleString('en-US')}`)
      // 26.47: with enough timed hits (not autoplay) the mean offset suggests a better device calibration.
      const timed = s[STAT.perfect] + s[STAT.great] + s[STAT.good] + s[STAT.bad]
      const suggested = !run.component.botPlay && timed >= 20 ? Math.round(Math.max(-500, Math.min(500, this.ports.calibrationMs() + s[STAT.mean] * 1000))) : null
      this.ports.emit('rhythm.finished', {
        score: s[STAT.score], accuracy: s[STAT.accuracy], maxCombo: s[STAT.maxCombo], perfect: s[STAT.perfect], great: s[STAT.great], good: s[STAT.good],
        bad: s[STAT.bad], miss: s[STAT.miss], fullCombo: full, allPerfect: perfect, rank: rank(s[STAT.score]), meanOffsetMs: s[STAT.mean] * 1000,
        suggestedCalibrationMs: suggested
      }, run.entity.uuid)
    }
    this.publish(run)
  }

  private reservedKeys(): ReadonlySet<string> { return this.ports.reservedKeys?.() ?? NO_KEYS }

  /** Timed DOM input → core input (stride 7: kind, time, id, x, y, lane, keyboard). */
  private mapInput(run: ChartRun, events: readonly TimedInputEvent[], source: number): Float64Array {
    const out: number[] = []
    const transform = worldTransform(run.entity, this.ports.entities())
    const unit = run.component.unitScale > 0 ? run.component.unitScale : 1
    const cos = Math.cos(-transform.rotation), sin = Math.sin(-transform.rotation)
    const toChart = (event: TimedInputEvent): { x: number; y: number } | null => {
      const world = this.ports.clientToWorld(event.clientX, event.clientY)
      if (!world) return null
      const dx = world.x - transform.position.x, dy = world.y - transform.position.y
      const sx = (transform.scale.x || 1) * unit, sy = (transform.scale.y || 1) * unit
      return { x: (dx * cos - dy * sin) / sx, y: (dx * sin + dy * cos) / sy }
    }
    for (const event of events) {
      const kind = event.kind === 'press' ? 1 : event.kind === 'release' ? 2 : 3
      const time = run.clock.eventTime(event.timeMs, source)
      if (event.device === 'key') {
        if (event.kind === 'move') continue
        if (run.mode === 0) {
          const lane = run.keyCodes.indexOf(event.code)
          if (lane < 0) continue
          out.push(kind, time, event.id, run.session!.lane_x(lane), run.component.judgeY, lane, 1)
          if (event.kind === 'press') run.heldLanes.set(event.id, lane); else run.heldLanes.delete(event.id)
        } else {
          if (run.component.laneKeys.trim() ? !run.keyCodes.includes(event.code) : !isRhythmKeyboardKey(event.code) || this.reservedKeys().has(event.code)) continue
          out.push(kind, time, event.id, 0, 0, -1, 1)
        }
        continue
      }
      const point = toChart(event)
      if (!point) continue
      out.push(kind, time, event.id, point.x, point.y, -1, 0)
      if (run.mode === 0) {
        const lane = Math.floor((point.x + run.lanes * run.component.laneWidth / 2) / Math.max(1e-6, run.component.laneWidth))
        if (event.kind === 'release') run.heldLanes.delete(event.id)
        else if (lane >= 0 && lane < run.lanes) run.heldLanes.set(event.id, lane)
        else run.heldLanes.delete(event.id)
      }
    }
    return new Float64Array(out)
  }

  private applyJudgements(run: ChartRun, values: Float64Array, now: number): void {
    const stride = 12
    let sound: { buffer: RhythmAudioBuffer | null; volume: number } | null = null
    for (let at = 0; at + stride <= values.length; at += stride) {
      const note = values[at], judgement = values[at + 1], offset = values[at + 2], time = values[at + 3], x = values[at + 4], y = values[at + 5]
      const combo = values[at + 6], lane = values[at + 7], kind = values[at + 8], holdEnd = values[at + 9] > .5, line = values[at + 10], typeIndex = values[at + 11]
      this.diagnostics.notesJudged++
      const label = JUDGEMENT_LABELS[Math.max(1, Math.min(5, Math.round(judgement)))]
      const def = run.typeDefs[typeIndex] ?? null, type = run.typeIds[typeIndex] ?? 'tap'
      // A note to avoid that nobody touched (or autoplay passed) is perfect without a hit: no burst, sound or text.
      const avoided = !!def && def.timeout === 'perfect' && judgement === 1 && offset === 0
      const world = this.chartToWorld(run, x, y)
      const base = { note, type, kind: BUILTIN_NAMES[kind] ?? 'tap', lane, line, x: world.x, y: world.y, data: this.noteData(run, note) }
      if (!avoided && (!holdEnd || judgement >= 5)) run.lastJudgement = { judgement, offsetMs: offset * 1000, at: time }
      if (judgement < 5) {
        if (!avoided) {
          if (def?.effect !== 'none') { const effect = { x, y, age: 0, judgement, rotation: 0, born: time } as RhythmFrameEffect & { born: number }; run.effects.push(effect) }
          if (!holdEnd && offset !== 0) { run.errorHits.push({ offsetMs: offset * 1000, judgement, at: time }); if (run.errorHits.length > ERROR_BAR_HITS) run.errorHits.shift() }
        }
        if (!holdEnd) {
          if (!avoided) sound = { buffer: run.typeSounds[typeIndex] ?? null, volume: def?.hitSound ? def.hitSoundVolume : run.component.hitSoundVolume }
          this.ports.emit('rhythm.hit', { ...base, judgement: label, offsetMs: offset * 1000, combo, avoided }, run.entity.uuid)
        }
      } else this.ports.emit('rhythm.miss', { ...base, holdBroken: holdEnd }, run.entity.uuid)
      if (!avoided) run.component.runtimeJudgement = label
      // Prefab notes: the object hears its own judgement and stays a moment where it was judged; a hold's
      // object keeps following until the hold ends.
      const prefab = run.prefabs.get(note)
      if (prefab && !(kind === 1 && !holdEnd && judgement < 5)) {
        this.ports.emit(judgement < 5 ? 'rhythm.note_hit' : 'rhythm.note_miss', { ...base, judgement: label, offsetMs: offset * 1000 }, prefab.root.uuid)
        prefab.releaseAt = run.time + PREFAB_LINGER
      }
    }
    if (sound && run.component.hitSound && !run.component.botPlay && now - run.lastClickMs > 12) {
      run.lastClickMs = now
      const port = this.ports.audio(), buffer = sound.buffer ?? run.hitSound ?? port?.click()
      if (port && buffer && port.state() === 'running') port.start(buffer, 0, 0, { bus: 'SFX', volume: sound.volume })
    }
  }

  /** 26.47: presses on custom notes go to the game's scripts (`rhythm.touch`), which judge them. */
  private applyTouches(run: ChartRun): void {
    const session = run.session
    if (!session || run.typeDefs.length <= 4) return
    const values = session.take_touches(), stride = 7
    for (let at = 0; at + stride <= values.length; at += stride) {
      const note = values[at], typeIndex = run.noteTypeIndex[note] ?? 0, world = this.chartToWorld(run, values[at + 3], values[at + 4])
      const payload = { note, type: run.typeIds[typeIndex] ?? 'custom', offsetMs: values[at + 1] * 1000, x: world.x, y: world.y, lane: run.noteLane[note] ?? 0, line: run.noteLine[note] ?? 0, keyboard: values[at + 6] > .5, pointer: values[at + 5], data: this.noteData(run, note) }
      this.ports.emit('rhythm.touch', payload, run.entity.uuid)
      const prefab = run.prefabs.get(note)
      if (prefab) this.ports.emit('rhythm.touch', payload, prefab.root.uuid)
    }
  }

  /** 26.47: timeline triggers become `rhythm.trigger` signals for every object (name, value, beat). */
  private fireTriggers(run: ChartRun): void {
    const session = run.session
    if (!session) return
    const values = session.take_triggers()
    for (let at = 0; at + 3 <= values.length; at += 3) this.ports.emit('rhythm.trigger', { name: run.triggerNames[values[at]] ?? '', beat: values[at + 1], value: values[at + 2], chart: run.entity.uuid }, '')
  }

  private noteData(run: ChartRun, note: number): Record<string, unknown> | null {
    const raw = run.rawNotes[run.noteSource[note] ?? -1] as { data?: unknown } | undefined
    return raw && raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data) ? raw.data as Record<string, unknown> : null
  }

  /** Chart units in the chart object's frame → world. */
  private chartToWorld(run: ChartRun, x: number, y: number): { x: number; y: number } {
    const transform = worldTransform(run.entity, this.ports.entities())
    const unit = run.component.unitScale > 0 ? run.component.unitScale : 1
    const lx = x * (transform.scale.x || 1) * unit, ly = y * (transform.scale.y || 1) * unit
    const cos = Math.cos(transform.rotation), sin = Math.sin(transform.rotation)
    return { x: transform.position.x + lx * cos - ly * sin, y: transform.position.y + lx * sin + ly * cos }
  }

  private visualSeconds(): number {
    const value = this.ports.visualOffsetMs?.() ?? storedRhythmVisualOffset()
    return Number.isFinite(value) ? Math.max(-.5, Math.min(.5, value / 1000)) : 0
  }

  // ---------------------------------------------------------------- 26.47 master timeline

  private applyTracks(run: ChartRun, time: number): void {
    const session = run.session
    if (!session || !run.tracks.length) return
    const values = session.track_values(time)
    for (let index = 0; index < run.tracks.length; index++) {
      const { target, property } = run.tracks[index], value = values[index], key = `${target}\u0000${property}`
      if (Number.isNaN(value)) {
        // Before its first event a track leaves the target alone; after a seek back the target gets its own value again.
        const base = run.trackBase.get(key)
        if (base !== undefined) { this.writeTrack(target, property, base); run.trackBase.delete(key) }
        continue
      }
      if (!run.trackBase.has(key)) { const current = this.readTrack(target, property); if (current !== null) run.trackBase.set(key, current) }
      this.writeTrack(target, property, value)
    }
  }

  private trackEntity(target: string): Entity | null {
    const entities = this.ports.entities()
    if (target === CHART_TRACK_CAMERA) {
      let best: Entity | null = null, priority = Number.NEGATIVE_INFINITY
      for (const entity of entities) { const camera = entity.getComponent<Camera2D>('Camera2D'); if (entity.enabled && camera?.enabled && camera.active && camera.priority > priority) { best = entity; priority = camera.priority } }
      return best
    }
    const found = entities.find(entity => entity.name === target) ?? null
    if (!found && !this.missingTargets.has(target)) { this.missingTargets.add(target); this.ports.log(`Rhythm timeline: no object named “${target}” in the scene; its tracks are skipped.`, 'warning') }
    return found
  }

  private readTrack(target: string, property: string): number | null {
    if (target === CHART_TRACK_POST) return null
    const entity = this.trackEntity(target)
    if (!entity) return null
    const transform = worldTransform(entity, this.ports.entities())
    switch (property) {
      case 'x': return transform.position.x
      case 'y': return transform.position.y
      case 'rotation': return transform.rotation * 180 / Math.PI
      case 'scaleX': case 'scale': return transform.scale.x
      case 'scaleY': return transform.scale.y
      case 'zoom': return entity.getComponent<Camera2D>('Camera2D')?.zoom ?? null
      case 'alpha': { const renderer = entity.getComponent<ShapeRenderer2D>('ShapeRenderer2D') ?? entity.getComponent<SpriteRenderer2D>('SpriteRenderer2D') ?? entity.getComponent<TextRenderer2D>('TextRenderer2D'); return renderer ? renderer.opacity / 100 : null }
    }
    return null
  }

  private writeTrack(target: string, property: string, value: number): void {
    if (!Number.isFinite(value)) return
    if (target === CHART_TRACK_POST) { this.ports.setPost?.(property, value); return }
    const entity = this.trackEntity(target)
    if (!entity) return
    const entities = this.ports.entities()
    if (property === 'zoom') { const camera = entity.getComponent<Camera2D>('Camera2D'); if (camera) camera.zoom = Math.max(.01, value); return }
    if (property === 'alpha') {
      for (const kind of ['ShapeRenderer2D', 'SpriteRenderer2D', 'TextRenderer2D'] as const) { const renderer = entity.getComponent<ShapeRenderer2D | SpriteRenderer2D | TextRenderer2D>(kind); if (renderer) renderer.opacity = Math.max(0, Math.min(100, value * 100)) }
      return
    }
    const transform = worldTransform(entity, entities)
    const next = { position: { ...transform.position }, rotation: transform.rotation, scale: { ...transform.scale } }
    if (property === 'x') next.position.x = value
    else if (property === 'y') next.position.y = value
    else if (property === 'rotation') next.rotation = value * Math.PI / 180
    else if (property === 'scaleX') next.scale.x = value
    else if (property === 'scaleY') next.scale.y = value
    else if (property === 'scale') { next.scale.x = value; next.scale.y = value }
    else return
    setWorldTransform(entity, next, entities)
  }

  // ---------------------------------------------------------------- 26.47 prefab notes

  /** Places the objects of prefab notes on their notes (`frame`: the published note list). */
  private updatePrefabs(run: ChartRun, notes: ArrayLike<number>): void {
    if (!this.ports.spawnPrefab || !run.typeDefs.some(def => def?.prefab)) return
    const seen = new Set<number>()
    const transform = worldTransform(run.entity, this.ports.entities())
    for (let at = 0; at + RHYTHM_FRAME_NOTE_STRIDE <= notes.length; at += RHYTHM_FRAME_NOTE_STRIDE) {
      const typeIndex = Number(notes[at + 10]), def = run.typeDefs[typeIndex]
      if (!def?.prefab) continue
      const id = Number(notes[at])
      seen.add(id)
      let prefab: PrefabNote | null | undefined = run.prefabs.get(id)
      if (prefab && Number.isFinite(prefab.releaseAt)) continue
      const position = this.chartToWorld(run, Number(notes[at + 2]), Number(notes[at + 3]))
      if (!prefab) prefab = this.acquirePrefab(run, id, typeIndex, def, position)
      if (!prefab) continue
      const size = Number(notes[at + 11]) || 1
      const current = worldTransform(prefab.root, this.ports.entities())
      setWorldTransform(prefab.root, { position, rotation: transform.rotation + Number(notes[at + 4]) * Math.PI / 180, scale: { x: Math.sign(current.scale.x || 1) * size * def.scale, y: Math.sign(current.scale.y || 1) * size * def.scale } }, this.ports.entities())
    }
    for (const [id, prefab] of [...run.prefabs]) {
      if (Number.isFinite(prefab.releaseAt) ? run.time >= prefab.releaseAt : !seen.has(id)) this.releasePrefab(run, prefab)
    }
  }

  private acquirePrefab(run: ChartRun, note: number, typeIndex: number, def: ChartNoteTypeDef, position: { x: number; y: number }): PrefabNote | null {
    const pool = run.prefabPool.get(typeIndex)
    let prefab = pool?.pop() ?? null
    if (prefab) for (const member of prefab.members) member.enabled = true
    else {
      if (run.prefabs.size >= MAX_PREFAB_NOTES || this.failedPrefabs.has(def.prefab)) return null
      const root = this.ports.spawnPrefab!(def.prefab, position)
      if (!root) { this.failedPrefabs.add(def.prefab); this.ports.log(`Rhythm note type “${def.id}”: its prefab ${def.prefab} could not be spawned; the type is drawn without it.`, 'warning'); return null }
      const entities = this.ports.entities(), members = [root]
      // The prefab's children (any depth) are enabled and hidden with it.
      for (let changed = true; changed;) { changed = false; for (const entity of entities) if (entity.parentUuid && !members.includes(entity) && members.some(member => member.uuid === entity.parentUuid)) { members.push(entity); changed = true } }
      prefab = { root, members, typeIndex, note, releaseAt: Number.POSITIVE_INFINITY }
    }
    prefab.note = note; prefab.releaseAt = Number.POSITIVE_INFINITY
    run.prefabs.set(note, prefab)
    for (const member of prefab.members) this.noteObjects.set(member.uuid, { run, prefab })
    return prefab
  }

  private releasePrefab(run: ChartRun, prefab: PrefabNote): void {
    for (const member of prefab.members) { member.enabled = false; this.noteObjects.delete(member.uuid) }
    run.prefabs.delete(prefab.note)
    const pool = run.prefabPool.get(prefab.typeIndex) ?? []
    pool.push(prefab); run.prefabPool.set(prefab.typeIndex, pool)
  }

  private disposePrefabs(run: ChartRun): void {
    const all = [...run.prefabs.values(), ...[...run.prefabPool.values()].flat()]
    for (const prefab of all) { for (const member of prefab.members) this.noteObjects.delete(member.uuid); this.ports.despawn?.(prefab.root) }
    run.prefabs.clear(); run.prefabPool.clear()
  }

  /** Autoplay: hit sounds are scheduled on the audio clock exactly at the notes' times. */
  private scheduleAutoplayClicks(run: ChartRun, time: number): void {
    const port = this.ports.audio()
    if (!port || port.state() !== 'running' || run.silent) return
    const until = time + AUTOPLAY_LOOKAHEAD
    const fallback = run.hitSound ?? port.click()
    let previous = Number.NEGATIVE_INFINITY
    for (let index = lowerBound(run.noteTimes, Math.max(run.autoplayUntil, time - .02)); index < run.noteTimes.length && run.noteTimes[index] <= until; index++) {
      const noteTime = run.noteTimes[index], def = run.typeDefs[run.noteTypeIndex[index]] ?? null
      // Notes to avoid make no sound; a note type may have its own.
      if (noteTime <= run.autoplayUntil || noteTime - previous < .001 || def?.timeout === 'perfect') continue
      const sound = run.typeSounds[run.noteTypeIndex[index]] ?? fallback
      if (!sound) continue
      previous = noteTime
      // Chart time → context time on the clock the run was anchored to.
      port.start(sound, run.clock.sourceAt(noteTime), 0, { bus: 'SFX', volume: def?.hitSound ? def.hitSoundVolume : run.component.hitSoundVolume })
    }
    run.autoplayUntil = Math.max(run.autoplayUntil, until)
  }

  private writeComponent(run: ChartRun): void {
    const c = run.component, s = run.stats
    const time = Math.round(run.time * 1000) / 1000
    if (c.runtimeSongTime !== time) c.runtimeSongTime = time
    if (c.runtimeScore !== s[STAT.score]) c.runtimeScore = s[STAT.score]
    if (c.runtimeCombo !== s[STAT.combo]) c.runtimeCombo = s[STAT.combo]
    if (c.runtimeMaxCombo !== s[STAT.maxCombo]) c.runtimeMaxCombo = s[STAT.maxCombo]
    const accuracy = Math.round(s[STAT.accuracy] * 10000) / 10000
    if (c.runtimeAccuracy !== accuracy) c.runtimeAccuracy = accuracy
  }

  private publish(run: ChartRun): void {
    const session = run.session
    let lines: ArrayLike<number> = [], notes: ArrayLike<number> = []
    if (session && run.status !== 'error') {
      // 26.47: the picture runs ahead of the judgement clock by the picture offset.
      const frame = session.frame(run.time + this.visualSeconds())
      const lineCount = frame[0], lineEnd = 1 + lineCount * 5
      lines = frame.subarray(1, lineEnd)
      notes = frame.subarray(lineEnd + 1, lineEnd + 1 + frame[lineEnd] * RHYTHM_FRAME_NOTE_STRIDE)
      if (run.status === 'playing' || run.status === 'countdown' || run.status === 'paused' || run.status === 'finished') this.updatePrefabs(run, notes)
    }
    const beat = session ? session.time_to_beat(run.time) : 0
    const fraction = beat - Math.floor(beat)
    const frame: RhythmFrame = {
      mode: run.mode, lanes: run.lanes, laneWidth: run.component.laneWidth, judgeY: run.component.judgeY, time: run.time, lines, notes,
      lanePress: run.lanePress.subarray(0, run.lanes), effects: run.effects,
      judgement: run.lastJudgement ? { judgement: run.lastJudgement.judgement, offsetMs: run.lastJudgement.offsetMs, age: run.time - run.lastJudgement.at } : null,
      combo: run.stats[STAT.combo], score: run.stats[STAT.score], accuracy: run.stats[STAT.judged] > 0 ? run.stats[STAT.accuracy] : 1,
      progress: run.length > 0 ? Math.max(0, Math.min(1, run.time / run.length)) : 0,
      status: run.status, message: run.status === 'countdown' ? (run.time < -1.5 ? '' : String(Math.ceil(-run.time))) : run.message,
      beatPulse: run.time >= 0 && run.status === 'playing' ? Math.max(0, 1 - fraction * 5) : 0,
      types: run.frameTypes,
      errorBar: run.component.showErrorBar ? {
        windows: [run.component.perfectMs, run.component.greatMs, run.component.goodMs, run.component.badMs],
        hits: run.errorHits.map(hit => ({ offsetMs: hit.offsetMs, judgement: hit.judgement, age: run.time - hit.at }))
      } : null
    }
    if (run.status === 'countdown' && !frame.message) frame.message = run.title
    publishRhythmFrame(run.component.uuid, frame)
  }

  private runFor(target: string): ChartRun | null {
    if (target) {
      const direct = [...this.runs.values()].find(run => run.entity.uuid === target || run.component.uuid === target)
      if (direct) return direct
    }
    return this.runs.values().next().value ?? null
  }

  private componentFor(target: string): { entity: Entity; component: RhythmChart2D } | null {
    const entities = this.ports.entities()
    const pick = (entity: Entity | undefined) => { const component = entity?.getComponent<RhythmChart2D>('RhythmChart2D'); return entity && component ? { entity, component } : null }
    return (target ? pick(entities.find(entity => entity.uuid === target)) : null) ?? pick(entities.find(entity => entity.getComponent('RhythmChart2D')))
  }

  /** Script and block commands (rhythm_play, rhythm_pause, …). `target` is an entity uuid or '' for the first chart. */
  command(target: string, action: RhythmCommandAction, value = 0): boolean {
    if (!this.active) return false
    if (action === 'play') {
      const found = this.componentFor(target)
      if (!found) return false
      const existing = this.runs.get(found.component.uuid)
      if (existing && (existing.status === 'playing' || existing.status === 'countdown' || existing.status === 'loading' || existing.status === 'ready')) return true
      this.load(found.entity, found.component, Number.isFinite(value) && value !== 0 ? value : undefined)
      return true
    }
    const run = this.runFor(target)
    if (!run) return false
    const now = this.ports.nowMs()
    switch (action) {
      case 'pause': {
        if (run.status !== 'playing' && run.status !== 'countdown') return false
        run.startAt = run.clock.pause(this.source(run, now)); run.time = run.startAt
        run.voice?.stop(); run.voice = null; run.heldLanes.clear()
        this.setState(run, 'paused', 'Paused'); this.publish(run); return true
      }
      case 'resume': {
        if (run.status !== 'paused') return false
        // Resume a second early so the player can find the rhythm again (osu!-style). Only the clock goes back:
        // the judgements, score and combo stay (a seek would reset them), notes already judged are not judged
        // again and autoplay does not click them a second time.
        run.replayUntil = run.startAt
        run.startAt = Math.max(run.startAt - 1, -Math.max(0, run.component.leadInSeconds))
        this.setState(run, 'ready'); return this.tryStart(run) || true
      }
      case 'stop': {
        run.voice?.stop(); run.voice = null; run.clock.reset(); run.session?.free(); run.session = null
        this.runs.delete(run.component.uuid); publishRhythmFrame(run.component.uuid, null); this.resetComponent(run.component); this.diagnostics.charts = this.runs.size
        return true
      }
      case 'restart': this.load(run.entity, run.component); return true
      case 'seek': {
        if (!run.session || !Number.isFinite(value)) return false
        run.voice?.stop(); run.voice = null; run.startAt = value; run.session.seek(value); run.time = value; run.effects = []; run.lastJudgement = null
        run.lastBeat = Number.NEGATIVE_INFINITY; run.finishedEmitted = false
        this.setState(run, 'ready'); this.tryStart(run); return true
      }
      case 'offset': {
        if (!Number.isFinite(value)) return false
        run.component.offsetMs = Math.max(-1000, Math.min(1000, value))
        if (run.status === 'playing' || run.status === 'countdown') { const at = run.time; run.audioOffset = ((run.session?.offset_ms() ?? 0) + run.component.offsetMs + this.ports.calibrationMs()) / 1000; run.voice?.stop(); run.voice = null; run.startAt = at; this.setState(run, 'ready'); this.tryStart(run) }
        return true
      }
      case 'autoplay': run.component.botPlay = value > .5; run.session?.set_settings(rhythmSettingsArray(run.component)); return true
      case 'visual': storeRhythmVisualOffset(value); return true
      case 'speed': if (!(value > 0)) return false; run.component.scrollSpeed = Math.min(100, value); run.session?.set_settings(rhythmSettingsArray(run.component)); return true
    }
    return false
  }

  /** 26.47: the game judges a note (custom note types): a judgement name, or '' and an offset in milliseconds
   * classified by the note's windows. `entityUuid` is the calling object: a note's own object, or a chart. */
  judge(entityUuid: string, note: number, judgement: string, offsetMs: number): boolean {
    if (!this.active) return false
    const owner = this.noteObjects.get(entityUuid)?.run ?? this.runFor(entityUuid)
    const code = ['', 'perfect', 'great', 'good', 'bad', 'miss'].indexOf(judgement)
    if (!owner?.session || !Number.isInteger(note) || note < 0) return false
    return owner.session.judge_note(note, Math.max(0, code), Number.isFinite(offsetMs) ? offsetMs / 1000 : 10)
  }

  /** The note an object shows (prefab note types), for `rhythm_my_note()`. */
  noteOf(entityUuid: string): Record<string, unknown> | null {
    const found = this.noteObjects.get(entityUuid)
    if (!found) return null
    const { run, prefab } = found, note = prefab.note, time = run.noteTimes[note] ?? 0
    return { id: note, type: run.typeIds[prefab.typeIndex] ?? '', beat: run.session ? run.session.time_to_beat(time) : 0, time, lane: run.noteLane[note] ?? 0, line: run.noteLine[note] ?? 0, x: run.noteX[note] ?? 0, data: this.noteData(run, note), chart: run.entity.uuid }
  }

  /** Script context view of a chart: the script's own entity, else the first chart playing. `objectUuid`: the
   * calling object (an object that shows a note reads that note's chart and the note). */
  snapshot(entityUuid = '', objectUuid = ''): RhythmSnapshot {
    const noteObject = objectUuid ? this.noteObjects.get(objectUuid) : undefined
    const run = noteObject?.run ?? this.runFor(entityUuid)
    const s = run?.stats
    const total = s ? s[STAT.total] : 0, full = !!s && s[STAT.miss] === 0 && s[STAT.bad] === 0
    return {
      active: !!run && (run.status === 'playing' || run.status === 'countdown'), entity: run?.entity.uuid ?? '', state: run?.status ?? 'idle',
      time: run?.time ?? 0, beat: run?.session ? run.session.time_to_beat(run.time) : 0, bpm: run?.session ? run.session.bpm_at(Math.max(0, run.time)) : 0,
      score: s?.[STAT.score] ?? 0, combo: s?.[STAT.combo] ?? 0, maxCombo: s?.[STAT.maxCombo] ?? 0, accuracy: s && s[STAT.judged] > 0 ? s[STAT.accuracy] : 1,
      perfect: s?.[STAT.perfect] ?? 0, great: s?.[STAT.great] ?? 0, good: s?.[STAT.good] ?? 0, bad: s?.[STAT.bad] ?? 0, miss: s?.[STAT.miss] ?? 0,
      judged: s?.[STAT.judged] ?? 0, total, early: s?.[STAT.early] ?? 0, late: s?.[STAT.late] ?? 0, meanOffsetMs: (s?.[STAT.mean] ?? 0) * 1000,
      lastJudgement: run?.component.runtimeJudgement ?? '', finished: run?.status === 'finished',
      fullCombo: !!run && run.status === 'finished' && full, allPerfect: !!run && run.status === 'finished' && full && s![STAT.great] === 0 && s![STAT.good] === 0,
      progress: run && run.length > 0 ? Math.max(0, Math.min(1, run.time / run.length)) : 0, length: run?.length ?? 0, offsetMs: run?.component.offsetMs ?? 0,
      autoplay: run?.component.botPlay ?? false, title: run?.title ?? '',
      visualOffsetMs: Math.round(this.visualSeconds() * 1000), note: objectUuid ? this.noteOf(objectUuid) : null
    }
  }
}

function lowerBound(values: Float64Array, target: number): number {
  let low = 0, high = values.length
  while (low < high) { const middle = (low + high) >> 1; if (values[middle] < target) low = middle + 1; else high = middle }
  return low
}

/** The still picture of a chart at `time` (the chart editor's scene preview): notes, lines and the lane field,
 * no judgements. `session` is a compiled chart (its judgement state is not touched). */
export function rhythmPreviewFrame(session: WasmRhythmSession, time: number, component: Pick<RhythmChart2D, 'laneWidth' | 'judgeY'>, message = '', types: readonly RhythmFrameNoteType[] = []): RhythmFrame {
  const frame = session.frame(time)
  const lineCount = frame[0], lineEnd = 1 + lineCount * 5
  const beat = session.time_to_beat(time), fraction = beat - Math.floor(beat)
  return {
    mode: session.mode() === 1 ? 1 : 0, lanes: session.lanes(), laneWidth: component.laneWidth, judgeY: component.judgeY, time,
    lines: frame.subarray(1, lineEnd), notes: frame.subarray(lineEnd + 1, lineEnd + 1 + frame[lineEnd] * RHYTHM_FRAME_NOTE_STRIDE),
    lanePress: [], effects: [], judgement: null, combo: 0, score: 0, accuracy: 1,
    progress: session.length() > 0 ? Math.max(0, Math.min(1, time / session.length())) : 0,
    status: 'preview', message, beatPulse: time >= 0 ? Math.max(0, 1 - fraction * 5) : 0, types, errorBar: null
  }
}
