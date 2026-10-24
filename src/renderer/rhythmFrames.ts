/** 26.46 rhythm charts: the per-frame picture of each RhythmChart2D, published by whoever drives the chart
 * (the runtime's rhythm owner while playing, the editor's chart panel while authoring) and drawn by the
 * scene renderer. All positions are chart units in the entity's local frame. */

export type RhythmFrameStatus = 'loading' | 'ready' | 'countdown' | 'playing' | 'paused' | 'finished' | 'error' | 'preview'

export interface RhythmFrameEffect {
  /** Chart position of the hit. */
  x: number
  y: number
  /** Seconds since the hit. */
  age: number
  /** 1 perfect, 2 great, 3 good, 4 bad, 5 miss. */
  judgement: number
  /** Line rotation (degrees) at the hit, for the burst's orientation. */
  rotation: number
}

/** 26.47: how a note type looks (index = the note's type index). `color` null: the component's colour for
 * the built-in kind. `hidden`: the note is shown by its prefab only. */
export interface RhythmFrameNoteType {
  shape: 'bar' | 'circle' | 'diamond' | 'square' | 'ring' | 'none'
  color: { r: number; g: number; b: number } | null
  scale: number
  hidden: boolean
}

export interface RhythmFrame {
  /** 0 lanes (falling notes), 1 lines (judgement lines). */
  mode: 0 | 1
  lanes: number
  laneWidth: number
  judgeY: number
  /** Chart time (seconds from beat 0). */
  time: number
  /** Per line: x, y, rotation (degrees), alpha, length. */
  lines: ArrayLike<number>
  /** Per note: id, kind (0 tap, 1 hold, 2 drag, 3 flick, 4 custom), x, y, rotation, distance, body, flags
   * (1 simultaneous, 2 holding), lane, line, type index, size. */
  notes: ArrayLike<number>
  /** Press glow per lane, 0..1. */
  lanePress: ArrayLike<number>
  effects: readonly RhythmFrameEffect[]
  /** The latest judgement and its age in seconds (null before the first). */
  judgement: { judgement: number; offsetMs: number; age: number } | null
  combo: number
  score: number
  accuracy: number
  /** 0..1 through the chart. */
  progress: number
  status: RhythmFrameStatus
  /** Shown for loading, ready (press to start), countdown and errors. */
  message: string
  /** Beat phase 0..1 (1 at each beat), for a subtle pulse. */
  beatPulse: number
  /** 26.47: note types by index (empty: built-in types only). */
  types: readonly RhythmFrameNoteType[]
  /** 26.47: the hit error bar (windows in milliseconds, recent hits), or null when it is off. */
  errorBar: { windows: readonly number[]; hits: readonly { offsetMs: number; judgement: number; age: number }[] } | null
}

export const RHYTHM_FRAME_NOTE_STRIDE = 12
export const RHYTHM_FRAME_LINE_STRIDE = 5

const frames = new Map<string, RhythmFrame>()

/** Publishes (or with null, removes) the picture of one RhythmChart2D, keyed by its component uuid. */
export function publishRhythmFrame(componentUuid: string, frame: RhythmFrame | null): void {
  if (frame) frames.set(componentUuid, frame)
  else frames.delete(componentUuid)
}

export function rhythmFrame(componentUuid: string): RhythmFrame | null {
  return frames.get(componentUuid) ?? null
}

export function clearRhythmFrames(componentUuids?: Iterable<string>): void {
  if (!componentUuids) { frames.clear(); return }
  for (const uuid of componentUuids) frames.delete(uuid)
}

export function rhythmFrameCount(): number { return frames.size }
