/**
 * What the editor draws over the scene in the studio: the handles of the selection, the preview of a shape being
 * dragged out, the drafts of the multi-click tools, snap guides and the snap marker. This module only says what is
 * there (world coordinates); render/overlay.ts draws it.
 */
import { state } from '../../store'
import { fmtQ } from '../../settings'
import type { EditorOverlay, HandleKind } from '../../../render/overlay'
import { emptyOverlay } from '../../../render/overlay'
import { annotationPoints, rulerLabel } from '../../../render/annotations'
import { editor } from '../../editor/editorState'
import { outlineWorld } from '../../editor/geometry'
import { snapPoint } from '../../editor/snap'
import type { Handle, HandleId } from '../../editor/handles'
import { bodyHandles, handleKey, pulleyHandles, rotateStemFrom } from '../../editor/handles'
import { dragPreview, polygonPreview } from '../../editor/create'
import type { ViewportCore } from './state'
import type { Painter } from './draw'
import type { SnapFeedback } from './snap'
import { PULSE_MS } from './snap'

export interface Overlays {
  /** Handles of the selected body or pulley (null: nothing with handles is selected, or geometry cannot be edited). */
  selectionHandles(): { handles: Handle[]; target: { body?: string; pulley?: string } } | null
  /** The overlay of the current state. */
  build(): EditorOverlay
}

function overlayKind(h: HandleId): HandleKind { return h.kind }

export function useOverlays(vp: ViewportCore, painter: Painter, snap: SnapFeedback): Overlays {
  const cam = vp.cam

  function selectionHandles(): { handles: Handle[]; target: { body?: string; pulley?: string } } | null {
    const sel = state.selection
    if (!sel || !vp.canEditGeometry.value) return null
    if (sel.kind === 'body') {
      const def = state.scene.bodies.find(b => b.id === sel.id)
      return def ? { handles: bodyHandles(def, cam.value.ppm), target: { body: def.id } } : null
    }
    if (sel.kind === 'pulley') {
      const p = state.scene.pulleys.find(x => x.id === sel.id)
      return p ? { handles: pulleyHandles(state.scene, p), target: { pulley: p.id } } : null
    }
    return null
  }

  function build(): EditorOverlay {
    const ov = emptyOverlay()
    const ppm = cam.value.ppm
    const d = vp.drag
    if (state.tool === 'select' && (!d || d.kind === 'handle')) {
      const sh = selectionHandles()
      if (sh) {
        const activeKey = d?.kind === 'handle' ? d.key : null
        const sel = state.selection
        const def = sel?.kind === 'body' ? state.scene.bodies.find(b => b.id === sel.id) : null
        for (const h of sh.handles) ov.handles.push({ at: h.at, kind: overlayKind(h.id), hot: vp.hotHandle.value === handleKey(h.id), active: activeKey === handleKey(h.id), angle: def?.angle ?? 0 })
        const rot = sh.handles.find(h => h.id.kind === 'rotate')
        if (def && rot) ov.stem = { from: rotateStemFrom(def, ppm), to: rot.at }
      }
    }
    if (state.tool === 'select' && editor.annotationId) {
      const a = state.scene.annotations.find(x => x.id === editor.annotationId)
      if (a && a.type !== 'text') for (const p of annotationPoints(a)) ov.handles.push({ at: p, kind: 'point' })
    }
    if (d?.kind === 'handle' && d.feedback) {
      if (d.feedback.invalid) ov.shapes.push({ kind: 'poly', pts: d.feedback.invalid, closed: true, invalid: true, fill: true })
      for (const l of d.feedback.labels) ov.labels.push({ at: l.at, text: l.text, dx: 10, dy: -10 })
    }
    if (d?.kind === 'create' && d.moved) {
      const pv = dragPreview(d.tool, d.a, d.b, d.step)
      ov.shapes.push(...pv.shapes)
      ov.labels.push(...pv.labels)
    }
    if (d?.kind === 'cut' && d.moved) {
      // The cut line runs on past both ends of the drag (the whole body is cut along it)
      const dx = d.b.x - d.a.x, dy = d.b.y - d.a.y, L = Math.hypot(dx, dy) || 1, ext = 400 / ppm
      ov.shapes.push({ kind: 'line', a: { x: d.a.x - dx / L * ext, y: d.a.y - dy / L * ext }, b: { x: d.b.x + dx / L * ext, y: d.b.y + dy / L * ext }, dashed: true, invalid: true })
      ov.shapes.push({ kind: 'line', a: d.a, b: d.b })
    }
    if (state.tool === 'shape-combine' && editor.combineDraft.length) {
      for (const id of editor.combineDraft) {
        const def = state.scene.bodies.find(b => b.id === id)
        if (!def) continue
        for (const part of outlineWorld(def)) ov.shapes.push(part.kind === 'circle' ? { kind: 'circle', c: part.c, r: part.r, dashed: true, fill: true } : { kind: 'poly', pts: part.pts, closed: true, dashed: true, fill: true })
      }
    }
    if (d?.kind === 'annot-create' && d.moved) {
      ov.shapes.push({ kind: 'line', a: d.a, b: d.b, dashed: d.tool === 'annotate-arrow' })
      if (d.tool === 'measure-ruler') ov.labels.push({ at: { x: (d.a.x + d.b.x) / 2, y: (d.a.y + d.b.y) / 2 }, text: rulerLabel(d.a, d.b, state.digits), center: true, dy: -14 })
    }
    if (state.tool === 'add-polygon' && editor.polyDraft.length) {
      const first = editor.polyDraft[0]
      const cur = vp.cursorWorld.value ? snapPoint(vp.cursorWorld.value, ppm, vp.altDown) : null
      const closeHot = !!cur && editor.polyDraft.length >= 3 && Math.hypot(cur.x - first.x, cur.y - first.y) * ppm <= 9
      const pv = polygonPreview(editor.polyDraft, cur, closeHot)
      ov.shapes.push(...pv.shapes)
      ov.labels.push(...pv.labels)
      editor.polyDraft.forEach((p, i) => ov.handles.push({ at: p, kind: 'vertex', hot: i === 0 && closeHot }))
    }
    if (state.tool === 'measure-angle' && editor.angleDraft.length) {
      const [v, a] = editor.angleDraft
      const cur = vp.cursorWorld.value ? snap.measureSnap(vp.cursorWorld.value, vp.altDown) : null
      if (a) {
        ov.shapes.push({ kind: 'line', a: v, b: a })
        if (cur) {
          ov.shapes.push({ kind: 'line', a: v, b: cur, dashed: true })
          const ang = Math.abs(Math.atan2((a.x - v.x) * (cur.y - v.y) - (a.y - v.y) * (cur.x - v.x), (a.x - v.x) * (cur.x - v.x) + (a.y - v.y) * (cur.y - v.y)))
          ov.labels.push({ at: v, text: fmtQ(ang, 'rad', 4), dx: 12, dy: -12 })
        }
      } else if (cur) ov.shapes.push({ kind: 'line', a: v, b: cur, dashed: true })
      for (const p of editor.angleDraft) ov.handles.push({ at: p, kind: 'point' })
    }
    ov.snap = vp.snapMark.value
    ov.shapes.push(...vp.snapGuides.value)
    const age = performance.now() - snap.pulse.start
    if (snap.pulse.pts.length && age < PULSE_MS && vp.snapGuides.value.length) {
      const u = age / PULSE_MS
      for (const p of snap.pulse.pts) ov.shapes.push({ kind: 'circle', c: p, r: (3 + 13 * u) / ppm, alpha: 1 - u })
      painter.requestDraw()
    }
    return ov
  }

  return { selectionHandles, build }
}
