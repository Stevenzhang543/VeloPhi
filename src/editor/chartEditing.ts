/** 26.46 chart editor logic without the DOM: the time axis, snapping, hit testing, note edits and undo.
 * The panel (ChartEditorPanel.vue) draws and routes pointer and keyboard input through these functions. */
import { ChartTempo, sortChartNotes, type ChartDocument, type ChartNote, type ChartNoteType } from '../runtime/rhythmChartDocument'

/** 26.47: 'custom' places the chart's own note type chosen next to the tools. */
export type ChartTool = 'select' | 'tap' | 'hold' | 'drag' | 'flick' | 'erase' | 'custom'
export const CHART_TOOLS: readonly ChartTool[] = ['select', 'tap', 'hold', 'drag', 'flick', 'erase', 'custom']
export const CHART_SNAPS = [1, 2, 3, 4, 6, 8, 12, 16] as const

/** Where things are on the editor canvas. Time runs upwards; the judgement line is near the bottom. */
export interface ChartView {
  width: number
  height: number
  /** Pixel row of the judgement line (the cursor time). */
  judgeY: number
  /** Chart time at the judgement line. */
  time: number
  /** Pixels per second. */
  pps: number
  /** Note field left edge and width in pixels (lanes or the line's x range). */
  fieldLeft: number
  fieldWidth: number
  mode: 'lanes' | 'lines'
  lanes: number
  /** Lines mode: the chart x range shown across the field. */
  xRange: number
}

export function yAtTime(view: ChartView, time: number): number { return view.judgeY - (time - view.time) * view.pps }
export function timeAtY(view: ChartView, y: number): number { return view.time + (view.judgeY - y) / view.pps }
export function laneWidthPx(view: ChartView): number { return view.fieldWidth / Math.max(1, view.lanes) }
export function laneAtX(view: ChartView, x: number): number { return Math.floor((x - view.fieldLeft) / laneWidthPx(view)) }
export function laneCentreX(view: ChartView, lane: number): number { return view.fieldLeft + (lane + .5) * laneWidthPx(view) }
/** Lines mode: chart x (−xRange … xRange) ↔ pixels. */
export function pxAtChartX(view: ChartView, x: number): number { return view.fieldLeft + (x / view.xRange + 1) / 2 * view.fieldWidth }
export function chartXAtPx(view: ChartView, px: number): number { return ((px - view.fieldLeft) / view.fieldWidth * 2 - 1) * view.xRange }

export function snapBeat(beat: number, divisor: number): number { const step = 1 / Math.max(1, divisor); return Math.round(beat / step) * step }
export function snapX(x: number, step = .25): number { return Math.round(x / step) * step }

export function noteX(view: ChartView, note: ChartNote): number { return view.mode === 'lanes' ? laneCentreX(view, note.lane) : pxAtChartX(view, note.x) }

/** The note under a pointer (heads, and hold bodies), searching the visible notes; −1 for none. */
export function noteAt(document: ChartDocument, tempo: ChartTempo, view: ChartView, px: number, py: number, line = 0): number {
  const half = view.mode === 'lanes' ? laneWidthPx(view) * .45 : Math.max(14, view.fieldWidth / (view.xRange * 2) * .6)
  let best = -1, bestDistance = Number.POSITIVE_INFINITY
  document.notes.forEach((note, index) => {
    if (view.mode === 'lines' && note.line !== line) return
    const x = noteX(view, note)
    if (Math.abs(px - x) > half) return
    const y = yAtTime(view, tempo.beatToTime(note.beat))
    let distance = Math.abs(py - y)
    if (note.type === 'hold' && note.endBeat !== undefined) {
      const end = yAtTime(view, tempo.beatToTime(note.endBeat))
      if (py <= y && py >= end) distance = Math.min(distance, 4)
    }
    if (distance <= 9 && distance < bestDistance) { best = index; bestDistance = distance }
  })
  return best
}

/** Indices of the notes whose heads lie inside a pixel rectangle. */
export function notesInRect(document: ChartDocument, tempo: ChartTempo, view: ChartView, a: { x: number; y: number }, b: { x: number; y: number }, line = 0): number[] {
  const left = Math.min(a.x, b.x), right = Math.max(a.x, b.x), top = Math.min(a.y, b.y), bottom = Math.max(a.y, b.y)
  return document.notes.flatMap((note, index) => {
    if (view.mode === 'lines' && note.line !== line) return []
    const x = noteX(view, note), y = yAtTime(view, tempo.beatToTime(note.beat))
    return x >= left && x <= right && y >= top && y <= bottom ? [index] : []
  })
}

/** A new note from a pointer position, snapped; null outside the field. */
export function noteFromPointer(view: ChartView, tempo: ChartTempo, px: number, py: number, type: ChartNoteType, snap: number, line = 0, side = 1): ChartNote | null {
  if (px < view.fieldLeft || px > view.fieldLeft + view.fieldWidth) return null
  const beat = snapBeat(tempo.timeToBeat(timeAtY(view, py)), snap)
  if (view.mode === 'lanes') {
    const lane = laneAtX(view, px)
    if (lane < 0 || lane >= view.lanes) return null
    return { type, beat, lane, line: 0, x: 0, side: 1, speed: 1, ...(type === 'hold' ? { endBeat: beat + 1 / snap } : {}) }
  }
  return { type, beat, lane: 0, line, x: snapX(chartXAtPx(view, px)), side, speed: 1, ...(type === 'hold' ? { endBeat: beat + 1 / snap } : {}) }
}

/** The same place (lane or nearby x on the same line) at the same beat. */
export function sameSpot(a: ChartNote, b: ChartNote, mode: 'lanes' | 'lines'): boolean {
  if (Math.abs(a.beat - b.beat) > 1e-6) return false
  return mode === 'lanes' ? a.lane === b.lane : a.line === b.line && Math.abs(a.x - b.x) < .5
}

/** Adds a note, replacing one at the same spot; returns the new note's index. */
export function placeNote(document: ChartDocument, note: ChartNote): number {
  document.notes = document.notes.filter(other => !sameSpot(other, note, document.mode))
  document.notes.push(note)
  sortChartNotes(document.notes)
  return document.notes.indexOf(note)
}

export function deleteNotes(document: ChartDocument, indices: Iterable<number>): void {
  const remove = new Set(indices)
  document.notes = document.notes.filter((_, index) => !remove.has(index))
}

/** Moves notes by beats and lanes (lanes mode) or x (lines mode), clamped to the chart; returns the moved notes. */
export function moveNotes(document: ChartDocument, indices: readonly number[], beats: number, lanes: number, x: number): ChartNote[] {
  const moved = indices.map(index => document.notes[index]).filter(Boolean)
  for (const note of moved) {
    const beat = Math.max(-64, note.beat + beats)
    if (note.type === 'hold' && note.endBeat !== undefined) note.endBeat += beat - note.beat
    note.beat = beat
    if (document.mode === 'lanes') note.lane = Math.max(0, Math.min(document.lanes - 1, note.lane + lanes))
    else note.x = Math.max(-20, Math.min(20, note.x + x))
  }
  sortChartNotes(document.notes)
  return moved
}

/** Mirrors notes left–right (lanes or x). */
export function mirrorNotes(document: ChartDocument, indices: readonly number[]): void {
  for (const index of indices) { const note = document.notes[index]; if (!note) continue; if (document.mode === 'lanes') note.lane = document.lanes - 1 - note.lane; else note.x = -note.x }
  sortChartNotes(document.notes)
}

/** Notes as a clipboard: beats relative to the earliest note. */
export function copyNotes(document: ChartDocument, indices: readonly number[]): ChartNote[] {
  const notes = indices.map(index => document.notes[index]).filter(Boolean)
  const first = Math.min(...notes.map(note => note.beat))
  return notes.map(note => ({ ...note, beat: note.beat - first, ...(note.endBeat !== undefined ? { endBeat: note.endBeat - first } : {}) }))
}

export function pasteNotes(document: ChartDocument, clipboard: readonly ChartNote[], atBeat: number): ChartNote[] {
  const pasted = clipboard.map(note => ({ ...note, beat: note.beat + atBeat, ...(note.endBeat !== undefined ? { endBeat: note.endBeat + atBeat } : {}) }))
  for (const note of pasted) document.notes = document.notes.filter(other => !sameSpot(other, note, document.mode))
  document.notes.push(...pasted)
  sortChartNotes(document.notes)
  return pasted
}

/** Snapshot undo of serialised documents (bounded). */
export class ChartHistory {
  private undoStack: string[] = []
  private redoStack: string[] = []
  constructor(private limit = 200) {}
  /** Records the state before an edit. */
  record(before: string): void { if (this.undoStack[this.undoStack.length - 1] === before) return; this.undoStack.push(before); if (this.undoStack.length > this.limit) this.undoStack.shift(); this.redoStack = [] }
  undo(current: string): string | null { const previous = this.undoStack.pop(); if (previous === undefined) return null; this.redoStack.push(current); return previous }
  redo(current: string): string | null { const next = this.redoStack.pop(); if (next === undefined) return null; this.undoStack.push(current); return next }
  get canUndo(): boolean { return this.undoStack.length > 0 }
  get canRedo(): boolean { return this.redoStack.length > 0 }
  clear(): void { this.undoStack = []; this.redoStack = [] }
}

/** Beats per minute from tap times (seconds): the median interval of the last taps. */
export function tapTempo(times: readonly number[]): number | null {
  if (times.length < 4) return null
  const intervals = times.slice(1).map((time, index) => time - times[index]).filter(value => value > .15 && value < 2).slice(-12).sort((a, b) => a - b)
  if (intervals.length < 3) return null
  const median = intervals[Math.floor(intervals.length / 2)]
  return Math.round(600 / median) / 10
}

/** Device calibration from taps on a metronome: the median of (tap − nearest click), in milliseconds. */
export function calibrationFromTaps(taps: readonly number[], clicks: readonly number[]): { offsetMs: number; spreadMs: number; count: number } | null {
  if (!clicks.length) return null
  const offsets = taps.map(tap => { let best = Number.POSITIVE_INFINITY; for (const click of clicks) if (Math.abs(tap - click) < Math.abs(best)) best = tap - click; return best * 1000 }).filter(value => Math.abs(value) < 300).sort((a, b) => a - b)
  if (offsets.length < 6) return null
  const median = offsets[Math.floor(offsets.length / 2)]
  const spread = offsets[Math.floor(offsets.length * .8)] - offsets[Math.floor(offsets.length * .2)]
  return { offsetMs: Math.round(median), spreadMs: Math.round(spread), count: offsets.length }
}
