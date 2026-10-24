/** 26.46 the Nova chart file (`.nova-chart`, JSON `nova-chart` version 1) as TypeScript values: defaults,
 * normalisation of loaded files, stable serialisation and a tempo map mirroring nova_rhythm::TempoMap
 * (verified against the WASM core). Used by the chart editor and the rhythm templates.
 * 26.47 (version 2): the chart's own note types, per-note size and data, and the master timeline (tracks and
 * triggers). A chart that uses none of them is still written as version 1. */

export type ChartMode = 'lanes' | 'lines'
/** The four built-in note types. */
export type ChartBuiltinNoteType = 'tap' | 'hold' | 'drag' | 'flick'
/** A built-in type or the id of one of the chart's `noteTypes`. */
export type ChartNoteType = string
export type ChartNoteBase = ChartBuiltinNoteType | 'custom'
export type ChartNoteShape = 'bar' | 'circle' | 'diamond' | 'square' | 'ring' | 'none'
export type ChartLineProperty = 'x' | 'y' | 'rotation' | 'alpha' | 'speed'

export interface ChartMeta { title: string; artist: string; charter: string; level: string; audio: string; offsetMs: number; previewStart: number }
export interface ChartTempoPoint { beat: number; bpm: number }
export interface ChartEvent { start: number; end: number; from: number; to: number; ease: string }
export interface ChartLine { x: number; y: number; rotation: number; alpha: number; speed: number; length: number; events: Record<ChartLineProperty, ChartEvent[]> }
export interface ChartNote { type: ChartNoteType; beat: number; endBeat?: number; lane: number; line: number; x: number; side: number; speed: number; size?: number; data?: Record<string, unknown> }
/** A chart's own note type: behaviour (read by the Rust core) and look, prefab and sound (read by the runtime). */
export interface ChartNoteTypeDef {
  id: string
  name: string
  base: ChartNoteBase
  /** Perfect, great, good, bad in milliseconds; absent: the chart component's. */
  windows?: [number, number, number, number]
  weight: number
  combo: boolean
  timeout: 'miss' | 'perfect'
  /** Hit area in chart units (0: the component's). */
  width: number
  height: number
  shape: ChartNoteShape
  /** #rrggbb */
  color: string
  /** Drawing scale. */
  scale: number
  /** A prefab shown for each note of this type (pooled), instead of or on top of the shape. */
  prefab: string
  hitSound: string
  hitSoundVolume: number
  effect: 'burst' | 'none'
}
export interface ChartTrack { target: string; property: string; events: ChartEvent[] }
export interface ChartTrigger { beat: number; name: string; value: number }
export interface ChartDocument { format: 'nova-chart'; version: 1 | 2; meta: ChartMeta; mode: ChartMode; lanes: number; tempo: ChartTempoPoint[]; lines: ChartLine[]; notes: ChartNote[]; noteTypes: ChartNoteTypeDef[]; tracks: ChartTrack[]; triggers: ChartTrigger[] }

export const CHART_BUILTIN_TYPES: readonly ChartBuiltinNoteType[] = ['tap', 'hold', 'drag', 'flick']
export const CHART_NOTE_BASES: readonly ChartNoteBase[] = ['tap', 'hold', 'drag', 'flick', 'custom']
export const CHART_NOTE_SHAPES: readonly ChartNoteShape[] = ['bar', 'circle', 'diamond', 'square', 'ring', 'none']
/** Master-timeline targets with a fixed meaning; any other target is a scene object's name. */
export const CHART_TRACK_CAMERA = 'camera'
export const CHART_TRACK_POST = 'post'
export const CHART_OBJECT_PROPERTIES = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'scale', 'alpha'] as const
export const CHART_CAMERA_PROPERTIES = ['x', 'y', 'zoom', 'rotation'] as const
export const CHART_POST_PROPERTIES = ['exposure', 'contrast', 'saturation', 'vignette', 'bloom', 'blur'] as const
export function chartTrackProperties(target: string): readonly string[] {
  return target === CHART_TRACK_CAMERA ? CHART_CAMERA_PROPERTIES : target === CHART_TRACK_POST ? CHART_POST_PROPERTIES : CHART_OBJECT_PROPERTIES
}

export const CHART_LINE_PROPERTIES: readonly ChartLineProperty[] = ['x', 'y', 'rotation', 'alpha', 'speed']
export const CHART_EASINGS = ['linear', 'step', 'sine_in', 'sine_out', 'sine_in_out', 'quad_in', 'quad_out', 'quad_in_out', 'cubic_in', 'cubic_out', 'cubic_in_out', 'quart_in', 'quart_out', 'quart_in_out', 'quint_in', 'quint_out', 'quint_in_out', 'expo_in', 'expo_out', 'expo_in_out', 'circ_in', 'circ_out', 'circ_in_out', 'back_in', 'back_out', 'back_in_out', 'elastic_in', 'elastic_out', 'elastic_in_out', 'bounce_in', 'bounce_out', 'bounce_in_out'] as const

const finite = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback

/** A new note type with the defaults of the built-in tap. */
export function defaultNoteType(id: string, overrides: Partial<ChartNoteTypeDef> = {}): ChartNoteTypeDef {
  return { id, name: id, base: 'tap', weight: 1, combo: true, timeout: 'miss', width: 0, height: 0, shape: 'bar', color: '#78c8ff', scale: 1, prefab: '', hitSound: '', hitSoundVolume: .5, effect: 'burst', ...overrides }
}

/** The base behaviour of a note type name in a document (built-in names are their own base). */
export function chartNoteBase(document: Pick<ChartDocument, 'noteTypes'>, type: string): ChartNoteBase {
  if ((CHART_BUILTIN_TYPES as readonly string[]).includes(type)) return type as ChartBuiltinNoteType
  return document.noteTypes.find(item => item.id === type)?.base ?? 'tap'
}

const HEX = /^#[0-9a-f]{6}$/i
function normalizeNoteType(value: unknown): ChartNoteTypeDef | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  const id = text(source.id).trim()
  if (!id || (CHART_BUILTIN_TYPES as readonly string[]).includes(id)) return null
  const windows = Array.isArray(source.windows) && source.windows.length === 4 && source.windows.every(item => typeof item === 'number' && Number.isFinite(item)) ? source.windows.map(Number) as [number, number, number, number] : undefined
  return defaultNoteType(id, {
    name: text(source.name, id) || id,
    base: (CHART_NOTE_BASES as readonly string[]).includes(source.base as string) ? source.base as ChartNoteBase : 'tap',
    ...(windows ? { windows } : {}),
    weight: Math.max(0, Math.min(1000, finite(source.weight, 1))), combo: source.combo !== false, timeout: source.timeout === 'perfect' ? 'perfect' : 'miss',
    width: Math.max(0, finite(source.width, 0)), height: Math.max(0, finite(source.height, 0)),
    shape: (CHART_NOTE_SHAPES as readonly string[]).includes(source.shape as string) ? source.shape as ChartNoteShape : 'bar',
    color: HEX.test(text(source.color)) ? text(source.color).toLowerCase() : '#78c8ff', scale: Math.max(.05, Math.min(20, finite(source.scale, 1))),
    prefab: text(source.prefab), hitSound: text(source.hitSound), hitSoundVolume: Math.max(0, Math.min(2, finite(source.hitSoundVolume, .5))), effect: source.effect === 'none' ? 'none' : 'burst'
  })
}

/** True when a document needs version 2 to be read correctly. */
export function chartNeedsVersion2(document: ChartDocument): boolean {
  return document.noteTypes.length > 0 || document.tracks.length > 0 || document.triggers.length > 0 || document.notes.some(note => (note.size !== undefined && note.size !== 1) || (note.data !== undefined && Object.keys(note.data).length > 0))
}

export function defaultChartLine(overrides: Partial<Omit<ChartLine, 'events'>> = {}): ChartLine {
  return { x: 0, y: 0, rotation: 0, alpha: 1, speed: 1, length: 24, ...overrides, events: { x: [], y: [], rotation: [], alpha: [], speed: [] } }
}

/** A new empty chart: four lanes, or one judgement line low on the screen. */
export function newChartDocument(mode: ChartMode, bpm = 120): ChartDocument {
  return {
    format: 'nova-chart', version: 1,
    meta: { title: 'New Chart', artist: '', charter: '', level: '1', audio: '', offsetMs: 0, previewStart: 0 },
    mode, lanes: 4, tempo: [{ beat: 0, bpm }],
    lines: mode === 'lines' ? [defaultChartLine({ y: -2.5 })] : [],
    notes: [], noteTypes: [], tracks: [], triggers: []
  }
}

function normalizeEvent(value: unknown): ChartEvent | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  const start = finite(source.start, Number.NaN), end = finite(source.end, Number.NaN)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return { start, end: Math.max(start, end), from: finite(source.from, 0), to: finite(source.to, 0), ease: text(source.ease, 'linear') || 'linear' }
}

/** A loaded (possibly hand-edited or older) chart file as a complete document; throws on the wrong format. */
export function normalizeChartDocument(value: unknown): ChartDocument {
  if (!value || typeof value !== 'object') throw new Error('A chart is a JSON object.')
  const source = value as Record<string, unknown>
  if (source.format !== 'nova-chart') throw new Error('format must be "nova-chart".')
  const version = finite(source.version, 1)
  if (version !== 1 && version !== 2) throw new Error(`unsupported chart version ${version} (this engine reads up to 2).`)
  const meta = (source.meta && typeof source.meta === 'object' ? source.meta : {}) as Record<string, unknown>
  const mode: ChartMode = source.mode === 'lines' ? 'lines' : 'lanes'
  const tempo = Array.isArray(source.tempo) ? source.tempo.flatMap(point => {
    const beat = finite((point as ChartTempoPoint)?.beat, Number.NaN), bpm = finite((point as ChartTempoPoint)?.bpm, Number.NaN)
    return Number.isFinite(beat) && bpm >= 1 && bpm <= 10_000 ? [{ beat, bpm }] : []
  }).sort((a, b) => a.beat - b.beat) : []
  const lines = Array.isArray(source.lines) ? source.lines.map(item => {
    const line = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const events = (line.events && typeof line.events === 'object' ? line.events : {}) as Record<string, unknown>
    const result = defaultChartLine({ x: finite(line.x, 0), y: finite(line.y, 0), rotation: finite(line.rotation, 0), alpha: finite(line.alpha, 1), speed: finite(line.speed, 1), length: Math.max(0, finite(line.length, 24)) })
    for (const property of CHART_LINE_PROPERTIES) result.events[property] = Array.isArray(events[property]) ? (events[property] as unknown[]).flatMap(event => { const normalized = normalizeEvent(event); return normalized ? [normalized] : [] }).sort((a, b) => a.start - b.start) : []
    return result
  }) : []
  if (mode === 'lines' && !lines.length) lines.push(defaultChartLine({ y: -2.5 }))
  const lanes = Math.max(1, Math.min(16, Math.round(finite(source.lanes, 4))))
  const noteTypes: ChartNoteTypeDef[] = []
  if (Array.isArray(source.noteTypes)) for (const item of source.noteTypes) { const normalized = normalizeNoteType(item); if (normalized && !noteTypes.some(existing => existing.id === normalized.id)) noteTypes.push(normalized) }
  const known = new Set([...CHART_BUILTIN_TYPES, ...noteTypes.map(item => item.id)])
  const notes = Array.isArray(source.notes) ? source.notes.flatMap(item => {
    const note = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const type: ChartNoteType = typeof note.type === 'string' && known.has(note.type) ? note.type : 'tap'
    const beat = finite(note.beat, Number.NaN)
    if (!Number.isFinite(beat)) return []
    const result: ChartNote = { type, beat, lane: Math.max(0, Math.round(finite(note.lane, 0))), line: Math.max(0, Math.round(finite(note.line, 0))), x: finite(note.x, 0), side: finite(note.side, 1) < 0 ? -1 : 1, speed: finite(note.speed, 1) }
    if (chartNoteBase({ noteTypes }, type) === 'hold') { const end = finite(note.endBeat, Number.NaN); result.endBeat = Number.isFinite(end) && end > beat ? end : beat + 1 }
    const size = finite(note.size, 1)
    if (size !== 1) result.size = Math.max(.05, Math.min(50, size))
    if (note.data && typeof note.data === 'object' && !Array.isArray(note.data)) result.data = JSON.parse(JSON.stringify(note.data)) as Record<string, unknown>
    return [result]
  }) : []
  const tracks: ChartTrack[] = Array.isArray(source.tracks) ? source.tracks.flatMap(item => {
    const track = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const target = text(track.target).trim(), property = text(track.property).trim()
    if (!target || !property) return []
    const events = Array.isArray(track.events) ? track.events.flatMap(event => { const normalized = normalizeEvent(event); return normalized ? [normalized] : [] }).sort((a, b) => a.start - b.start) : []
    return [{ target, property, events }]
  }) : []
  const triggers: ChartTrigger[] = Array.isArray(source.triggers) ? source.triggers.flatMap(item => {
    const trigger = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const beat = finite(trigger.beat, Number.NaN)
    return Number.isFinite(beat) ? [{ beat, name: text(trigger.name).replace(/[\r\n\t]/g, ' ').trim(), value: finite(trigger.value, 0) }] : []
  }).sort((a, b) => a.beat - b.beat) : []
  const document: ChartDocument = {
    format: 'nova-chart', version: 1,
    meta: { title: text(meta.title, 'Untitled'), artist: text(meta.artist), charter: text(meta.charter), level: text(meta.level, '1'), audio: text(meta.audio), offsetMs: finite(meta.offsetMs, 0), previewStart: finite(meta.previewStart, 0) },
    mode, lanes, tempo: tempo.length ? tempo : [{ beat: 0, bpm: 120 }], lines, notes: sortChartNotes(notes), noteTypes, tracks, triggers
  }
  document.version = chartNeedsVersion2(document) ? 2 : 1
  return document
}

export function sortChartNotes(notes: ChartNote[]): ChartNote[] {
  return notes.sort((a, b) => a.beat - b.beat || a.lane - b.lane || a.line - b.line || a.x - b.x)
}

const round = (value: number, digits = 6) => { const factor = 10 ** digits; const rounded = Math.round(value * factor) / factor; return Object.is(rounded, -0) ? 0 : rounded }
const serializeEvent = (event: ChartEvent) => ({ start: round(event.start), end: round(event.end), from: round(event.from, 4), to: round(event.to, 4), ease: event.ease })
function serializeNoteType(type: ChartNoteTypeDef): Record<string, unknown> {
  const out: Record<string, unknown> = { id: type.id, name: type.name, base: type.base }
  if (type.windows) out.windows = type.windows.map(value => round(value, 3))
  out.weight = round(type.weight, 4); out.combo = type.combo; out.timeout = type.timeout
  if (type.width) out.width = round(type.width, 4)
  if (type.height) out.height = round(type.height, 4)
  out.shape = type.shape; out.color = type.color; out.scale = round(type.scale, 4)
  if (type.prefab) out.prefab = type.prefab
  if (type.hitSound) { out.hitSound = type.hitSound; out.hitSoundVolume = round(type.hitSoundVolume, 3) }
  out.effect = type.effect
  return out
}

/** Stable, compact JSON: fixed key order, rounded numbers, default fields left out of notes. */
export function serializeChartDocument(document: ChartDocument): string {
  const notes = sortChartNotes(document.notes.map(note => ({ ...note }))).map(note => {
    const out: Record<string, unknown> = { type: note.type, beat: round(note.beat) }
    if (chartNoteBase(document, note.type) === 'hold') out.endBeat = round(note.endBeat ?? note.beat + 1)
    if (document.mode === 'lanes') out.lane = note.lane
    else { out.line = note.line; out.x = round(note.x, 4); if (note.side < 0) out.side = -1 }
    if (note.speed !== 1) out.speed = round(note.speed, 4)
    if (note.size !== undefined && note.size !== 1) out.size = round(note.size, 4)
    if (note.data && Object.keys(note.data).length) out.data = note.data
    return out
  })
  const lines = document.mode === 'lines' ? document.lines.map(line => ({
    x: round(line.x, 4), y: round(line.y, 4), rotation: round(line.rotation, 4), alpha: round(line.alpha, 4), speed: round(line.speed, 4), length: round(line.length, 4),
    events: Object.fromEntries(CHART_LINE_PROPERTIES.filter(property => line.events[property].length).map(property => [property, line.events[property].map(event => ({ start: round(event.start), end: round(event.end), from: round(event.from, 4), to: round(event.to, 4), ease: event.ease }))]))
  })) : []
  const version2 = chartNeedsVersion2(document)
  const value: Record<string, unknown> = {
    format: 'nova-chart', version: version2 ? 2 : 1,
    meta: { ...document.meta, offsetMs: round(document.meta.offsetMs, 3), previewStart: round(document.meta.previewStart, 3) },
    mode: document.mode, lanes: document.lanes,
    tempo: document.tempo.map(point => ({ beat: round(point.beat), bpm: round(point.bpm, 4) })),
    lines
  }
  if (version2) value.noteTypes = document.noteTypes.map(serializeNoteType)
  value.notes = notes
  if (version2) {
    value.tracks = document.tracks.map(track => ({ target: track.target, property: track.property, events: [...track.events].sort((a, b) => a.start - b.start).map(serializeEvent) }))
    value.triggers = [...document.triggers].sort((a, b) => a.beat - b.beat).map(trigger => ({ beat: round(trigger.beat), name: trigger.name, value: round(trigger.value, 4) }))
  }
  // One note, event, note type or trigger per line keeps diffs of chart files readable.
  return JSON.stringify(value, null, 1).replace(/\{\n\s+("type"|"start"|"id"|"beat"(?=[^{}]*"name"))([^{}]*?)\n\s*\}/g, (match: string) => match.replace(/\n\s*/g, ' ')) + '\n'
}

/** Beats ↔ seconds across tempo changes (the same rules as nova_rhythm::TempoMap). */
export class ChartTempo {
  private segments: Array<{ beat: number; time: number; bpm: number }>
  constructor(points: readonly ChartTempoPoint[]) {
    const sorted = points.filter(point => Number.isFinite(point.beat) && Number.isFinite(point.bpm) && point.bpm >= 1 && point.bpm <= 10_000).map(point => ({ beat: point.beat, bpm: point.bpm })).sort((a, b) => a.beat - b.beat)
    const unique: Array<{ beat: number; bpm: number }> = []
    for (const point of sorted) if (!unique.length || Math.abs(point.beat - unique[unique.length - 1].beat) >= 1e-9) unique.push(point)
    if (!unique.length) unique.push({ beat: 0, bpm: 120 })
    if (unique[0].beat > 0) unique.unshift({ beat: 0, bpm: unique[0].bpm })
    let time = 0
    this.segments = unique.map((point, index) => {
      if (index > 0) time += (point.beat - unique[index - 1].beat) * 60 / unique[index - 1].bpm
      return { beat: point.beat, time, bpm: point.bpm }
    })
    const zero = this.timeIn(0)
    for (const segment of this.segments) segment.time -= zero
  }
  private segmentByBeat(beat: number) {
    let low = 0, high = this.segments.length - 1
    if (beat < this.segments[0].beat) return this.segments[0]
    while (low < high) { const middle = (low + high + 1) >> 1; if (this.segments[middle].beat <= beat) low = middle; else high = middle - 1 }
    return this.segments[low]
  }
  private segmentByTime(time: number) {
    let low = 0, high = this.segments.length - 1
    if (time < this.segments[0].time) return this.segments[0]
    while (low < high) { const middle = (low + high + 1) >> 1; if (this.segments[middle].time <= time) low = middle; else high = middle - 1 }
    return this.segments[low]
  }
  private timeIn(beat: number): number { const segment = this.segmentByBeat(beat); return segment.time + (beat - segment.beat) * 60 / segment.bpm }
  beatToTime(beat: number): number { return Number.isFinite(beat) ? this.timeIn(beat) : 0 }
  timeToBeat(time: number): number { if (!Number.isFinite(time)) return 0; const segment = this.segmentByTime(time); return segment.beat + (time - segment.time) * segment.bpm / 60 }
  bpmAt(time: number): number { return this.segmentByTime(time).bpm }
}
