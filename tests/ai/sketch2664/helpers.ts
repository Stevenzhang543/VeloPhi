/**
 * Helpers of the sketch tests (26.64): short constructors for sketches, and readings of a compiled scene from the
 * engine (the tests compare them with closed forms).
 */
import type { BodySketch, ConnectorSketch, QuestionSketch, SceneSketch, SurfaceSketch, ValueRow } from '../../../src/ai/sketch/schema'
import { emptySketch } from '../../../src/ai/sketch/schema'
import type { Scene } from '../../../src/core/scene/types'
import { EngineSession } from '../../../src/engine/session'
import { runLadder } from '../../../src/ai/sketch/check'
import type { Ladder } from '../../../src/ai/sketch/check'

export const DEG = Math.PI / 180

export const surface = (id: string, type: SurfaceSketch['type'], more: Partial<SurfaceSketch> = {}): SurfaceSketch => ({ id, name: id, type, side: '', span: '', at: '', ...more })
export const body = (id: string, type: BodySketch['type'], place: BodySketch['place'], ref: string, at: BodySketch['at'], more: Partial<BodySketch> = {}): BodySketch => ({ id, name: id, type, place, ref, at, ref2: '', moves: 'rest', side: '', points: [], ...more })
export const val = (of: string, quantity: string, value: number, unit = '', quote = ''): ValueRow => ({ of, quantity, value, unit, quote })
export const conn = (id: string, type: ConnectorSketch['type'], path: string[], mode: ConnectorSketch['mode'] = ''): ConnectorSketch => ({ id, name: id, type, path, mode })
export const ask = (prompt: string, kind: QuestionSketch['kind'], more: Partial<QuestionSketch> = {}): QuestionSketch => ({ prompt, unit: '', kind, id: '', t: 0, event: '', side: '', body: '', which: '', ...more })

/** A sketch with the usual top fields; `movingBodies` follows the bodies unless given. */
export function sk(more: Partial<SceneSketch>): SceneSketch {
  const s: SceneSketch = { ...emptySketch(), route: 'sketch', title: 'test', gravity: 'down', ...more }
  if (more.movingBodies === undefined) s.movingBodies = s.bodies.length
  return s
}

/** The ladder of a sketch (a deep copy goes in, as an answer would). `problem` defaults to a text with no quotes to check. */
export function ladder(s: SceneSketch, problem = ''): Ladder { return runLadder(JSON.parse(JSON.stringify(s)), problem) }

/** The compiled scene of a sketch that must pass L0–L3; throws with the findings otherwise. */
export function sceneOf(s: SceneSketch, problem = ''): Scene {
  const l = ladder(s, problem)
  if (!l.loadable || !l.scene) throw new Error(`not loadable: ${l.diagnostics.map(d => `${d.code} ${d.path}: expected ${d.expected}; got ${d.got}`).join(' | ')}`)
  return l.scene
}

export const codes = (l: Ladder) => l.diagnostics.map(d => d.code)
export const bodyOf = (scene: Scene, id: string) => { const b = scene.bodies.find(x => x.id === id); if (!b) throw new Error(`no body ${id}`); return b }

/** Quantities at time t of a run of `duration` seconds. */
export function valuesAt(scene: Scene, ids: string[], t: number, duration = Math.max(t + 0.2, 0.5)): number[] {
  const s = EngineSession.simulate(scene, { duration })
  try { return Array.from(s.call<{ values: Float64Array }>({ op: 'evaluate', ids, t }).values) } finally { s.free() }
}
export function extreme(scene: Scene, id: string, which: 'max' | 'min', duration: number): number {
  const s = EngineSession.simulate(scene, { duration })
  try { return s.call<{ value: number }>({ op: 'extreme', id, which }).value } finally { s.free() }
}
/** The engine's contact between two bodies on the first frame of a short run. */
export function contactAt0(scene: Scene, on: string, by: string): { inContact: boolean; N: number; f: number; status: string } {
  const s = EngineSession.simulate(scene, { duration: 0.05 })
  try { return s.call({ op: 'contactForces', frame: 0, on, by }) } finally { s.free() }
}
/** Time of the first event with a change of this type (NaN: none). */
export function firstEvent(scene: Scene, type: string, duration: number): number {
  const s = EngineSession.simulate(scene, { duration })
  try { return s.call<{ events: Array<{ t: number; changes: Array<{ type: string }> }> }>({ op: 'events' }).events.find(e => e.changes.some(c => c.type === type))?.t ?? NaN } finally { s.free() }
}
