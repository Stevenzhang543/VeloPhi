/**
 * Editing of teaching annotations (`scene.annotations`): creation by the ruler, protractor, text and arrow
 * tools, hit testing, moving and deleting.
 *
 * Annotation edits are undoable steps on the same history as every other edit, but unlike `edit()` they do not
 * mark the recording out of date: annotations never affect the simulation, so a teacher can label a paused
 * moment without the run being redone and playback jumping back to t = 0.
 */
import type { AnnotationDef, Scene } from '../../core/scene/types'
import { serializeScene } from '../../core/scene/io'
import { state } from '../store'
import type { Camera } from '../../render/renderer'
import { toScreen } from '../../render/renderer'
import { annotationDistance, annotationPoints } from '../../render/annotations'
import type { Pt } from './geometry'

const HISTORY_LIMIT = 200

/** Push a history entry (scene text before the change) without invalidating the recording. */
export function pushHistory(before: string) {
  if (before === serializeScene(state.scene)) return
  state.past.push(before)
  if (state.past.length > HISTORY_LIMIT) state.past.shift()
  state.future = []
  state.dirty = true
}

/** Change annotations as one undoable step (the recording stays valid). */
export function editAnnotations(mutator: (scene: Scene) => void) {
  const before = serializeScene(state.scene)
  mutator(state.scene)
  pushHistory(before)
}

/** The first free annotation id `n<k>`. */
export function newAnnotationId(scene: Scene): string {
  const used = new Set(scene.annotations.map(a => a.id))
  let k = scene.annotations.length + 1
  while (used.has(`n${k}`)) k++
  return `n${k}`
}

/** Topmost annotation within `tolPx` of the screen point. */
export function hitAnnotation(cam: Camera, list: AnnotationDef[], sx: number, sy: number, tolPx = 6): AnnotationDef | null {
  for (let i = list.length - 1; i >= 0; i--) if (annotationDistance(cam, list[i], sx, sy) <= tolPx) return list[i]
  return null
}

/** Index of the annotation point (endpoint, vertex) under the screen point, or −1. Text has no point handles. */
export function annotationPointAt(cam: Camera, a: AnnotationDef, sx: number, sy: number, tolPx = 8): number {
  if (a.type === 'text') return -1
  const pts = annotationPoints(a)
  let best = -1, bd = tolPx
  pts.forEach((p, i) => {
    const [x, y] = toScreen(cam, p.x, p.y)
    const d = Math.hypot(x - sx, y - sy)
    if (d <= bd) { bd = d; best = i }
  })
  return best
}

/** Translate an annotation from its original copy by (dx, dy). */
export function placeMoved(a: AnnotationDef, orig: AnnotationDef, dx: number, dy: number) {
  const src = annotationPoints(orig), dst = annotationPoints(a)
  for (let i = 0; i < src.length; i++) { dst[i].x = src[i].x + dx; dst[i].y = src[i].y + dy }
}

/** Set point `index` of an annotation. */
export function setAnnotationPoint(a: AnnotationDef, index: number, p: Pt) {
  const pts = annotationPoints(a)
  if (pts[index]) { pts[index].x = p.x; pts[index].y = p.y }
}

/** An annotation without its id (distributes over the union). */
export type NewAnnotation = AnnotationDef extends infer T ? (T extends AnnotationDef ? Omit<T, 'id'> : never) : never

/** Add an annotation with a new id; returns the id. */
export function addAnnotation(scene: Scene, a: NewAnnotation): string {
  const id = newAnnotationId(scene)
  scene.annotations.push({ ...a, id } as AnnotationDef)
  return id
}

/** Remove an annotation. */
export function deleteAnnotation(scene: Scene, id: string) {
  scene.annotations = scene.annotations.filter(a => a.id !== id)
}

/** Copy of an annotation shifted by (dx, dy) with a new id. */
export function duplicateAnnotation(scene: Scene, id: string, dx: number, dy: number): string | null {
  const a = scene.annotations.find(x => x.id === id)
  if (!a) return null
  const copy = JSON.parse(JSON.stringify(a)) as AnnotationDef
  copy.id = newAnnotationId(scene)
  for (const p of annotationPoints(copy)) { p.x += dx; p.y += dy }
  scene.annotations.push(copy)
  return copy.id
}
