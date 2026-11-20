/**
 * What a press, a drag, a release and a double click do in the viewport, tool by tool: panning, selecting and
 * moving, handles, drag-to-create, the multi-click tools (polygon, protractor, combine), measuring and annotating,
 * connectors, cutting, field regions. The handlers take a `PointerInput` — where it comes from (mouse, touch, pen)
 * is the business of input.ts.
 */
import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import { tl } from '../../../i18n'
import { state, edit } from '../../store'
import { settings, fmtQ } from '../../settings'
import { serializeScene } from '../../../core/scene/io'
import { eventLabelAt, forceArrowAt, toScreen } from '../../../render/renderer'
import { openEventDetail } from '../../details'
import { regionAt, regionHandles, resizeRegion } from '../../../render/regions'
import { anchorFor, createCentral, createConnector, createForce, createPin, hitTest, moveObject, placeObject, wrapAt } from '../../editing'
import { combineBodies, cutBodies } from '../../editor/shapeOps'
import { editor, clearDrafts, notify } from '../../editor/editorState'
import { viewStatus } from '../../viewStatus'
import type { Pt } from '../../editor/geometry'
import { bodyCenter, pulleyWorld } from '../../editor/geometry'
import { snapOn, snapPoint, snapStep } from '../../editor/snap'
import { snapAngles, snapBodyMove, snapRotation } from '../../editor/objectSnap'
import type { Handle } from '../../editor/handles'
import { applyHandleDrag, deleteVertex, edgeAt, handleKey, hitHandle, insertVertex, startHandleDrag } from '../../editor/handles'
import { createFromDrag, createPolygon, dragPreview, isDragTool } from '../../editor/create'
import { isPresetTool } from '../../editor/presets'
import { addAnnotation, annotationPointAt, editAnnotations, hitAnnotation, placeMoved, pushHistory, setAnnotationPoint } from '../../editor/annotations'
import type { PointerInput, ViewportCore } from './state'
import type { Painter } from './draw'
import type { CameraControl } from './camera'
import type { SnapFeedback } from './snap'
import { bodySize } from './snap'
import type { Overlays } from './overlays'

/** The bar under the canvas while a multi-click tool has picks. */
export interface DraftBar { label: string; action: string; ready: boolean; finish: () => void; undo: null | (() => void) }

export interface Tools {
  onDown(e: PointerInput): void
  onMove(e: PointerInput): void
  onUp(e: PointerInput): void
  onDblClick(e: PointerInput): void
  closePolygon(): void
  finishCombine(): void
  /** Clear the picks of a multi-click tool (the draft bar's cancel). */
  cancelDraft(): void
  draftBar: ComputedRef<DraftBar | null>
}

export function useTools(vp: ViewportCore, painter: Painter, camera: CameraControl, snap: SnapFeedback, overlays: Overlays, openMenu: (e: PointerInput) => void): Tools {
  const cam = vp.cam
  const { requestDraw } = painter
  const { editPoint, measureSnap, contactGuides } = snap
  const { selectionHandles } = overlays

  function onDown(e: PointerInput) {
    camera.stopGlide()
    const p = vp.worldOf(e)
    const [sx, sy] = vp.screenOf(e)
    vp.altDown = e.altKey
    if (editor.menu) editor.menu = null
    if (editor.textInput) (document.activeElement as HTMLElement | null)?.blur?.()
    if (e.button === 1 || (e.button === 0 && (vp.spaceDown || (vp.studio.value && state.tool === 'pan')))) {
      e.preventDefault()
      if (vp.spaceDown) editor.spacePanned = true
      vp.drag = { kind: 'pan', lastX: e.clientX, lastY: e.clientY }
      vp.refitAt = 0
      vp.cursor.value = 'grabbing'
      return
    }
    if (e.button === 2) { vp.drag = { kind: 'right', sx: e.clientX, sy: e.clientY, lastX: e.clientX, lastY: e.clientY }; return }
    if (e.button !== 0) return
    const cp = vp.currentPoses()
    if (!cp) return
    const ppm = cam.value.ppm
    const tol = 8 / ppm
    // A key-moment label or dot opens the event's detail view
    const labelEvent = !vp.editing.value && (!vp.studio.value || state.tool === 'select') && vp.canvas.value ? eventLabelAt(vp.canvas.value, sx, sy) : null
    if (labelEvent !== null) { openEventDetail(labelEvent); return }
    if (!vp.studio.value) {
      // Monitor: choose what to watch
      state.selection = hitTest(cp, p, tol)
      return
    }
    const tool = state.tool
    const sp = tool.startsWith('add-') || tool.startsWith('annotate-') ? editPoint(p, e.altKey) : snapPoint(p, ppm, e.altKey)
    if (tool === 'add-polygon') { polygonClick(sp); return }
    if (tool === 'measure-angle') { angleClick(measureSnap(p, e.altKey), e.shiftKey); return }
    if (tool === 'measure-ruler' || tool === 'annotate-arrow') {
      const a = tool === 'measure-ruler' ? measureSnap(p, e.altKey) : sp
      vp.drag = { kind: 'annot-create', tool, a, b: a, moved: false, sx: e.clientX, sy: e.clientY }
      return
    }
    if (tool === 'annotate-text') {
      e.preventDefault()
      editor.textInput = { at: sp, text: '', editId: null }
      return
    }
    if (isDragTool(tool)) {
      vp.drag = { kind: 'create', tool, a: sp, b: sp, step: snapOn(e.altKey) ? snapStep(ppm) : 0, moved: false, sx: e.clientX, sy: e.clientY }
      return
    }
    // 26.59 fix 3 (D194): ready-made parts are placed with one click
    if (isPresetTool(tool)) {
      let id: string | null = null
      edit(scene => { id = placeObject(scene, cp, tool, sp) })
      if (id) { editor.annotationId = null; state.selection = { kind: 'body', id }; state.rightTab = 'inspect' }
      if (!e.shiftKey) state.tool = 'select'
      return
    }
    // 26.52: central fields, cutting, combining
    if (tool === 'add-central') {
      let id: string | null = null
      edit(scene => { id = createCentral(scene, cp, sp) })
      if (id) { state.selection = { kind: 'connector', id }; state.rightTab = 'inspect' }
      if (!e.shiftKey) state.tool = 'select'
      return
    }
    if (tool === 'shape-cut') {
      vp.drag = { kind: 'cut', a: p, b: p, moved: false, sx: e.clientX, sy: e.clientY }
      return
    }
    if (tool === 'shape-combine') {
      const hit = hitTest(cp, p, tol)
      if (hit?.kind !== 'body') { notify(tl('请点击要组合的物体')); return }
      // The second click of a double click finishes (dblclick), it does not toggle again
      if (e.detail >= 2) return
      // 26.60: remember the picks before this click — the first click (or tap) of a double click must not toggle
      draftBefore.push({ t: performance.now(), ids: editor.combineDraft.slice() })
      if (draftBefore.length > 4) draftBefore.shift()
      const i = editor.combineDraft.indexOf(hit.id)
      if (i >= 0) editor.combineDraft.splice(i, 1); else editor.combineDraft.push(hit.id)
      requestDraw()
      return
    }
    if (tool === 'add-force') {
      let id: string | null = null
      edit(scene => { id = createForce(scene, cp, p) })
      if (id) { state.selection = { kind: 'connector', id }; state.rightTab = 'inspect' } else notify(tl('请点击在可运动的物体上'))
      if (!e.shiftKey) state.tool = 'select'
      return
    }
    if (tool === 'connect-hinge' || tool === 'connect-weld' || tool === 'connect-motor' || tool === 'connect-slider') {
      let id: string | null = null
      const kind = ({ 'connect-hinge': 'hinge', 'connect-weld': 'weld', 'connect-motor': 'motor', 'connect-slider': 'slider' } as const)[tool]
      edit(scene => { id = createPin(scene, cp, p, kind) })
      if (id) { state.selection = { kind: 'connector', id }; state.rightTab = 'inspect' } else notify(tl('请点击在可运动的物体上'))
      if (!e.shiftKey) state.tool = 'select'
      return
    }
    if (tool === 'connect-rope' || tool === 'connect-rod' || tool === 'connect-spring' || tool === 'connect-damper' || tool === 'connect-gear') {
      const pending = state.pendingConnector
      if (tool === 'connect-rope' && pending) {
        const hit = hitTest(cp, p, tol)
        if (hit?.kind === 'pulley' && !pending.pulleys.some(q => q.pulley === hit.id)) { pending.pulleys.push({ pulley: hit.id, wrap: 'cw' }); requestDraw(); return }
      }
      const anc = anchorFor(cp, p, 10 / ppm)
      if (!pending) { state.pendingConnector = { tool, first: anc, pulleys: [] }; return }
      // Finish: wrap directions from the polyline
      const pts = [pending.first.world, ...pending.pulleys.map(q => vp.pulleyNow(q.pulley) ?? pending.first.world), anc.world]
      const pulleys = pending.pulleys.map((q, i) => ({ pulley: q.pulley, wrap: wrapAt(pts[i], pts[i + 1], pts[i + 2]) }))
      let id: string | null = null
      edit(scene => { id = createConnector(scene, tool, pending.first, anc, pulleys) })
      state.pendingConnector = null
      if (id) { state.selection = { kind: 'connector', id }; state.rightTab = 'inspect' } else if (tool === 'connect-gear') notify(tl('齿轮需要连接两个可运动的物体'))
      if (!e.shiftKey) state.tool = 'select'
      return
    }
    // Select tool: handles of the selection first
    const sh = selectionHandles()
    if (sh) {
      const h = hitHandle(sh.handles, p, 9 / ppm)
      if (h) {
        if (h.id.kind === 'vertex' && e.altKey && sh.target.body) {
          const id = sh.target.body, index = h.id.index
          let ok = true
          edit(scene => { const def = scene.bodies.find(b => b.id === id); if (def) ok = deleteVertex(scene, def, index) })
          if (!ok) notify(tl('多边形至少保留 3 个顶点'))
          return
        }
        const snapshot = serializeScene(state.scene)
        const hd = startHandleDrag(state.scene, sh.target, h.id, p)
        if (hd) vp.drag = { kind: 'handle', hd, key: handleKey(hd.handle), snapshot, moved: false, sx: e.clientX, sy: e.clientY, feedback: null, heldAngle: Number.NaN }
        return
      }
    }
    // 26.55: resize handles of the selected region
    const selReg = editor.regionId && vp.canEditGeometry.value ? state.scene.settings.regions?.find(r => r.id === editor.regionId) : null
    if (selReg) {
      const idx = regionHandles(selReg).findIndex(h => { const [hx, hy] = toScreen(cam.value, h.x, h.y); return Math.abs(hx - sx) <= 7 && Math.abs(hy - sy) <= 7 })
      if (idx >= 0) { vp.drag = { kind: 'region', id: selReg.id, orig: { ...selReg }, handle: idx, start: p, snapshot: serializeScene(state.scene), moved: false, sx: e.clientX, sy: e.clientY }; return }
    }
    // Annotations (drawn on top)
    const selAnn = editor.annotationId ? state.scene.annotations.find(a => a.id === editor.annotationId) : null
    if (selAnn) {
      const idx = annotationPointAt(cam.value, selAnn, sx, sy)
      if (idx >= 0) {
        vp.drag = { kind: 'annot-move', id: selAnn.id, orig: JSON.parse(JSON.stringify(selAnn)), point: idx, start: p, snapshot: serializeScene(state.scene), moved: false, sx: e.clientX, sy: e.clientY }
        return
      }
    }
    const ah = hitAnnotation(cam.value, state.scene.annotations, sx, sy)
    if (ah) {
      state.selection = null
      editor.annotationId = ah.id
      vp.drag = { kind: 'annot-move', id: ah.id, orig: JSON.parse(JSON.stringify(ah)), point: -1, start: p, snapshot: serializeScene(state.scene), moved: false, sx: e.clientX, sy: e.clientY }
      return
    }
    // 26.53 (D72): with the formula tab open during playback, a click on a force arrow or a body filters the formulas
    if (!vp.editing.value && state.rightTab === 'formula' && state.tool === 'select' && vp.canvas.value) {
      const fa = forceArrowAt(vp.canvas.value, sx, sy)
      if (fa) { state.formulaPick = { body: fa.body, force: fa.kind }; return }
      const bh = hitTest(cp, p, tol)
      state.formulaPick = bh?.kind === 'body' && cp.sys.model.byId.get(bh.id)?.dynamic ? { body: bh.id, force: null } : null
    }
    // Objects
    let hit = hitTest(cp, p, tol)
    const cur = state.selection
    if (!hit && cur?.kind === 'body' && vp.canEditGeometry.value) {
      // A click right on the outline keeps the selection (so a double-click on an edge can add a vertex)
      const def = state.scene.bodies.find(b => b.id === cur.id)
      if (def && edgeAt(def, p, 8 / ppm)) hit = cur
    }
    editor.annotationId = null
    editor.regionId = null
    state.selection = hit
    // 26.55: a click on empty space inside a field region or liquid selects it (edited in the scene tab)
    if (!hit && vp.canEditGeometry.value) {
      const r = regionAt(state.scene.settings, p)
      if (r) {
        editor.regionId = r.id
        state.rightTab = 'settings'
        vp.drag = { kind: 'region', id: r.id, orig: { ...r }, handle: -1, start: p, snapshot: serializeScene(state.scene), moved: false, sx: e.clientX, sy: e.clientY }
        return
      }
    }
    // During playback a click on a moving body is a request for its readings (26.65: the modes are gone, so this is
    // "while playing"; a click on a paused scene selects the body to edit it)
    if (!vp.editing.value && state.playing && hit?.kind === 'body' && state.rightTab === 'inspect' && cp.sys.model.byId.get(hit.id)?.dynamic) state.rightTab = 'watch'
    if (hit && (hit.kind === 'body' || hit.kind === 'pulley') && vp.canEditGeometry.value) {
      vp.drag = { kind: 'move', sel: hit, start: p, applied: { x: 0, y: 0 }, snapshot: serializeScene(state.scene), moved: false, sx: e.clientX, sy: e.clientY, mem: { keys: [] } }
    }
  }

  function polygonClick(sp: Pt) {
    const d = editor.polyDraft
    const ppm = cam.value.ppm
    if (d.length >= 3 && Math.hypot(sp.x - d[0].x, sp.y - d[0].y) * ppm <= 9) { closePolygon(); return }
    // The second click of a double-click lands on the point just placed
    if (d.length && Math.hypot(sp.x - d[d.length - 1].x, sp.y - d[d.length - 1].y) * ppm < 3) return
    d.push(sp)
  }

  function closePolygon() {
    const pts = editor.polyDraft.slice()
    if (pts.length < 3) { notify(tl('多边形至少需要 3 个顶点')); return }
    let res: ReturnType<typeof createPolygon> | null = null
    edit(scene => { res = createPolygon(scene, pts) })
    const r = res as ReturnType<typeof createPolygon> | null
    clearDrafts()
    if (!r) return
    if ('error' in r) { notify(r.error); return }
    state.selection = { kind: 'body', id: r.id }
    state.rightTab = 'inspect'
    if (r.dropped > 0) notify(tl('多边形的边相交，已改用这些点的凸包（去掉 {0} 个顶点）', [r.dropped]))
    state.tool = 'select'
  }

  function angleClick(q: Pt, shift: boolean) {
    const d = editor.angleDraft
    if (d.length < 2) {
      if (d.length === 1 && Math.hypot(q.x - d[0].x, q.y - d[0].y) * cam.value.ppm < 4) return
      d.push(q)
      return
    }
    const [vertex, a] = d
    let id: string | null = null
    editAnnotations(scene => { id = addAnnotation(scene, { type: 'angle', vertex: { ...vertex }, a: { ...a }, b: { ...q } }) })
    clearDrafts()
    if (id) { state.selection = null; editor.annotationId = id }
    if (!shift) state.tool = 'select'
  }

  function onMove(e: PointerInput) {
    const p = vp.worldOf(e)
    vp.cursorWorld.value = p
    if (vp.studio.value) viewStatus.cursor = p
    vp.altDown = e.altKey
    const ppm = cam.value.ppm
    const d = vp.drag
    if (d) {
      if (d.kind === 'pan') {
        const dx = e.clientX - d.lastX, dy = e.clientY - d.lastY
        d.lastX = e.clientX; d.lastY = e.clientY
        cam.value = { ...cam.value, cx: cam.value.cx - dx / ppm, cy: cam.value.cy + dy / ppm }
        requestDraw()
        return
      }
      if (d.kind === 'right') {
        if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 4) {
          vp.drag = { kind: 'pan', lastX: d.lastX, lastY: d.lastY }
          vp.cursor.value = 'grabbing'
          onMove(e)
        }
        return
      }
      const dist = Math.hypot(e.clientX - d.sx, e.clientY - d.sy)
      if (d.kind === 'move') {
        if (!d.moved && dist < 4) return
        d.moved = true
        const tot = { x: p.x - d.start.x, y: p.y - d.start.y }
        const s = snapOn(e.altKey) ? snapStep(ppm) : 0
        let want = s ? { x: Math.round(tot.x / s) * s, y: Math.round(tot.y / s) * s } : tot
        vp.snapGuides.value = []
        if (!e.altKey && (s || settings.editor.objectSnap) && d.sel?.kind === 'body') {
          // 26.60 (D202): the grid (a feature of the body onto a grid line) and object contacts together — contacts win
          // along their normals, so a part can be put against the ground with grid snapping on
          const sel = d.sel
          const def = state.scene.bodies.find(b => b.id === sel.id)
          if (def) {
            const r = snapBodyMove(state.scene, def.id, { x: tot.x - d.applied.x, y: tot.y - d.applied.y }, ppm, d.mem, { grid: s, objects: settings.editor.objectSnap })
            want = { x: tot.x + r.delta.x, y: tot.y + r.delta.y }
            vp.snapGuides.value = contactGuides(r.contacts)
          }
        } else if (!s && !e.altKey && settings.editor.objectSnap && d.sel?.kind === 'pulley') {
          const sel = d.sel
          const def = state.scene.pulleys.find(x => x.id === sel.id)
          if (def) {
            const c0 = pulleyWorld(state.scene, def)
            const at = { x: c0.x + tot.x - d.applied.x, y: c0.y + tot.y - d.applied.y }
            const q = editPoint(at, false, new Set(def.body ? [def.body] : []))
            want = { x: tot.x + q.x - at.x, y: tot.y + q.y - at.y }
          }
        }
        moveObject(state.scene, d.sel, want.x - d.applied.x, want.y - d.applied.y)
        d.applied = want
        vp.snapMark.value = s ? { x: d.start.x + want.x, y: d.start.y + want.y } : null
        state.stale = true
        state.playing = false
        requestDraw()
        return
      }
      if (d.kind === 'handle') {
        if (!d.moved && dist < 3) return
        d.moved = true
        const snapping = snapOn(e.altKey)
        const rot = d.hd.handle.kind === 'rotate'
        const def = d.hd.bodyId ? state.scene.bodies.find(b => b.id === d.hd.bodyId) : null
        const q = rot ? p : editPoint(p, e.altKey, new Set(d.hd.bodyId ? [d.hd.bodyId] : []))
        // Rotation: fixed steps when set in the settings, else free with magnetic angles (D47)
        const magnetic = rot && def && settings.editor.angleSnap === 0 && !e.altKey && !e.shiftKey && settings.editor.objectSnap
        const cands = magnetic && def ? snapAngles(state.scene, def, Math.max(1, 3 * Math.hypot(...bodySize(def)))) : []
        d.feedback = applyHandleDrag(state.scene, d.hd, q, {
          snap: snapping, step: snapStep(ppm), shift: e.shiftKey, angleSnap: (settings.editor.angleSnap * Math.PI) / 180,
          magnet: magnetic ? (a: number) => { const r = snapRotation(a, cands, d.heldAngle); d.heldAngle = r.snapped; return r.angle } : null,
          fmtLen: v => fmtQ(v, 'm', 4), fmtAng: v => fmtQ(v, 'rad', 4)
        })
        vp.snapMark.value = snapping && !rot ? q : null
        if (rot) vp.snapGuides.value = []
        state.stale = true
        state.playing = false
        requestDraw()
        return
      }
      if (d.kind === 'create') {
        if (!d.moved && dist < 4) return
        d.moved = true
        d.b = editPoint(p, e.altKey)
        d.step = snapOn(e.altKey) ? snapStep(ppm) : 0
        vp.snapMark.value = d.step || vp.snapGuides.value.length ? d.b : null
        requestDraw()
        return
      }
      if (d.kind === 'annot-create') {
        if (!d.moved && dist < 4) return
        d.moved = true
        d.b = d.tool === 'measure-ruler' ? measureSnap(p, e.altKey) : snapPoint(p, ppm, e.altKey)
        vp.snapMark.value = d.b
        requestDraw()
        return
      }
      if (d.kind === 'cut') {
        if (!d.moved && dist < 4) return
        d.moved = true
        d.b = p
        requestDraw()
        return
      }
      if (d.kind === 'region') {
        if (!d.moved && dist < 3) return
        d.moved = true
        const r = state.scene.settings.regions?.find(x => x.id === d.id)
        if (!r) return
        const st = snapOn(e.altKey) ? snapStep(ppm) : 0
        const sn = (v: number) => (st ? Math.round(v / st) * st : v)
        if (d.handle >= 0) resizeRegion(r, d.orig, d.handle, { x: sn(p.x), y: sn(p.y) }, Math.max(st, 4 / ppm))
        else { r.x = d.orig.x + sn(p.x - d.start.x); r.y = d.orig.y + sn(p.y - d.start.y) }
        requestDraw()
        return
      }
      if (d.kind === 'annot-move') {
        if (!d.moved && dist < 3) return
        d.moved = true
        const a = state.scene.annotations.find(x => x.id === d.id)
        if (!a) return
        if (d.point >= 0) {
          const q = measureSnap(p, e.altKey)
          setAnnotationPoint(a, d.point, q)
          vp.snapMark.value = q
        } else {
          const s = snapOn(e.altKey) ? snapStep(ppm) : 0
          const dx = p.x - d.start.x, dy = p.y - d.start.y
          placeMoved(a, d.orig, s ? Math.round(dx / s) * s : dx, s ? Math.round(dy / s) * s : dy)
        }
        requestDraw()
        return
      }
      return
    }
    // Hover
    if (!vp.studio.value) {
      const cp = vp.currentPoses()
      const h = cp ? hitTest(cp, p, 8 / ppm) : null
      if ((h?.id ?? null) !== vp.hover.value) vp.hover.value = h?.id ?? null
      const [lx, ly] = vp.screenOf(e)
      vp.cursor.value = h || (!vp.editing.value && vp.canvas.value && eventLabelAt(vp.canvas.value, lx, ly) !== null) ? 'pointer' : 'default'
      return
    }
    const tool = state.tool
    let hot: string | null = null
    let cur = 'default'
    if (tool === 'select') {
      const sh = selectionHandles()
      const h = sh ? hitHandle(sh.handles, p, 9 / ppm) : null
      if (h) { hot = handleKey(h.id); cur = cursorForHandle(h) }
    }
    if (hot !== vp.hotHandle.value) vp.hotHandle.value = hot
    if (!hot) {
      const cp = vp.currentPoses()
      const h = cp ? hitTest(cp, p, 8 / ppm) : null
      const id = h?.id ?? null
      if (id !== vp.hover.value) vp.hover.value = id
      if (tool === 'select') {
        const [sx, sy] = vp.screenOf(e)
        if (hitAnnotation(cam.value, state.scene.annotations, sx, sy)) cur = 'move'
        else if (!vp.editing.value && vp.canvas.value && eventLabelAt(vp.canvas.value, sx, sy) !== null) cur = 'pointer'
        else if (h) cur = vp.canEditGeometry.value && (h.kind === 'body' || h.kind === 'pulley') ? 'move' : 'pointer'
      }
    } else if (vp.hover.value) vp.hover.value = null
    if (tool === 'pan') cur = 'grab'
    else if (tool !== 'select') cur = 'crosshair'
    if (vp.spaceDown) cur = 'grab'
    vp.cursor.value = cur
    // Snap marker while placing or measuring
    let mark: Pt | null = null
    if (tool === 'measure-ruler' || tool === 'measure-angle') mark = measureSnap(p, e.altKey)
    else if ((tool.startsWith('add-') && tool !== 'add-force') || tool === 'annotate-arrow' || tool === 'annotate-text') {
      if (snapOn(e.altKey)) mark = snapPoint(p, ppm, e.altKey)
      else {
        const q = editPoint(p, e.altKey)
        mark = q.x !== p.x || q.y !== p.y ? q : null
      }
    } else if (vp.snapGuides.value.length) vp.snapGuides.value = []
    const changed = (mark?.x ?? NaN) !== (vp.snapMark.value?.x ?? NaN) || (mark?.y ?? NaN) !== (vp.snapMark.value?.y ?? NaN)
    if (changed || (mark === null) !== (vp.snapMark.value === null)) vp.snapMark.value = mark
    if (changed || state.pendingConnector || editor.polyDraft.length || editor.angleDraft.length) requestDraw()
  }

  function cursorForHandle(h: Handle): string {
    if (h.id.kind === 'rotate') return 'grab'
    if (h.id.kind === 'vertex') return 'move'
    const sel = state.selection
    const def = sel?.kind === 'body' ? state.scene.bodies.find(b => b.id === sel.id) : null
    const pl = sel?.kind === 'pulley' ? state.scene.pulleys.find(x => x.id === sel.id) : null
    const c = def ? bodyCenter(def) : pl ? pulleyWorld(state.scene, pl) : h.at
    const a = Math.atan2(h.at.y - c.y, h.at.x - c.x)
    const idx = ((Math.round(a / (Math.PI / 4)) % 4) + 4) % 4
    return ['ew-resize', 'nesw-resize', 'ns-resize', 'nwse-resize'][idx]
  }

  function onUp(e: PointerInput) {
    const d = vp.drag
    vp.drag = null
    if (vp.snapGuides.value.length) vp.snapGuides.value = []
    if (!d) return
    if (d.kind === 'pan') { vp.cursor.value = state.tool === 'pan' ? 'grab' : 'default'; return }
    if (d.kind === 'right') { if (vp.studio.value) openMenu(e); return }
    if (d.kind === 'move' || d.kind === 'handle' || d.kind === 'region') {
      if (d.moved) vp.commitSnapshot(d.snapshot)
      vp.snapMark.value = null
      requestDraw()
      return
    }
    if (d.kind === 'create') {
      vp.snapMark.value = null
      const pv = d.moved ? dragPreview(d.tool, d.a, d.b, d.step) : null
      let made: { id: string; kind: 'body' | 'pulley' } | null = null
      if (pv?.ok) edit(scene => { made = createFromDrag(scene, d.tool, d.a, d.b, d.step) })
      else {
        const cp = vp.currentPoses()
        if (cp) edit(scene => { const id = placeObject(scene, cp, d.tool, d.a); if (id) made = { id, kind: d.tool === 'add-pulley' ? 'pulley' : 'body' } })
      }
      const m = made as { id: string; kind: 'body' | 'pulley' } | null
      if (m) { editor.annotationId = null; state.selection = { kind: m.kind, id: m.id } }
      if (!e.shiftKey) state.tool = 'select'
      state.rightTab = 'inspect'
      return
    }
    if (d.kind === 'annot-create') {
      vp.snapMark.value = null
      const len = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y) * cam.value.ppm
      if (!d.moved || len < 4) { notify(d.tool === 'measure-ruler' ? tl('按住并拖动来测量长度') : tl('按住并拖动来画箭头')); return }
      let id: string | null = null
      editAnnotations(scene => {
        id = d.tool === 'measure-ruler'
          ? addAnnotation(scene, { type: 'ruler', from: { ...d.a }, to: { ...d.b } })
          : addAnnotation(scene, { type: 'arrow', from: { ...d.a }, to: { ...d.b } })
      })
      if (id) { state.selection = null; editor.annotationId = id }
      if (!e.shiftKey) state.tool = 'select'
      return
    }
    if (d.kind === 'annot-move') {
      vp.snapMark.value = null
      if (d.moved) pushHistory(d.snapshot)
      requestDraw()
    }
    if (d.kind === 'cut') {
      if (!d.moved || Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y) * cam.value.ppm < 8) { notify(tl('按住并拖出一条穿过物体的直线')); requestDraw(); return }
      let made: string[] = []
      const before = serializeScene(state.scene)
      edit(scene => { made = cutBodies(scene, d.a, d.b) })
      if (!made.length) {
        // Nothing cut: drop the no-op history entry
        if (serializeScene(state.scene) === before && state.past.length) state.past.pop()
        notify(tl('直线没有穿过矩形或多边形物体（圆和复合体不能切割）'))
      } else {
        state.selection = { kind: 'body', id: made[0] }
        notify(tl('已切成 {0} 块；撤销可恢复', [made.length]))
        if (!e.shiftKey) state.tool = 'select'
      }
      requestDraw()
    }
  }

  function cancelDraft() { clearDrafts(); draftBefore.length = 0; requestDraw() }

  /**
   * The bar under the canvas while a multi-click tool has picks (26.60): finish it without a keyboard or a double click
   * — on a tablet the first tap of a double tap used to drop the last pick, so combining could not be finished.
   */
  const draftBar = computed<DraftBar | null>(() => {
    if (state.tool === 'shape-combine' && editor.combineDraft.length) {
      const n = editor.combineDraft.length
      return { label: tl('已选 {0} 个物体', [n]), action: tl('组合'), ready: n >= 2, finish: () => finishCombine(), undo: null as null | (() => void) }
    }
    if (state.tool === 'add-polygon' && editor.polyDraft.length) {
      const n = editor.polyDraft.length
      return { label: tl('已放 {0} 个顶点', [n]), action: tl('完成多边形'), ready: n >= 3, finish: () => closePolygon(), undo: () => { editor.polyDraft.pop(); requestDraw() } }
    }
    return null
  })

  /** Picks of the combine tool before each of the last clicks (26.60: a double click finishes with the picks as they were). */
  const draftBefore: Array<{ t: number; ids: string[] }> = []
  /** Undo the toggle made by the first click (or tap) of a double click before finishing. */
  function restoreDraftBeforeDouble() {
    const last = draftBefore[draftBefore.length - 1]
    if (last && performance.now() - last.t < 700) editor.combineDraft.splice(0, editor.combineDraft.length, ...last.ids)
    draftBefore.length = 0
  }

  /** Finish the combine tool: the picked bodies become one compound body. */
  function finishCombine() {
    const ids = editor.combineDraft.slice()
    if (ids.length < 2) { notify(tl('至少选两个物体才能组合')); return }
    let r: ReturnType<typeof combineBodies> | null = null
    edit(scene => { r = combineBodies(scene, ids) })
    const res = r as ReturnType<typeof combineBodies> | null
    clearDrafts()
    if (!res) return
    if ('error' in res) { if (state.past.length) state.past.pop(); notify(res.error); return }
    state.selection = { kind: 'body', id: res.id }
    state.rightTab = 'inspect'
    state.tool = 'select'
  }

  function onDblClick(e: PointerInput) {
    if (!vp.studio.value) return
    const p = vp.worldOf(e)
    const [sx, sy] = vp.screenOf(e)
    if (state.tool === 'add-polygon') { closePolygon(); return }
    if (state.tool === 'shape-combine') {
      // The double-clicked body is one of the parts whether it was picked before or not
      const cp = vp.currentPoses()
      const hit = cp ? hitTest(cp, p, 8 / cam.value.ppm) : null
      restoreDraftBeforeDouble()
      if (hit?.kind === 'body' && !editor.combineDraft.includes(hit.id)) editor.combineDraft.push(hit.id)
      finishCombine()
      return
    }
    if (state.tool !== 'select') return
    const ah = hitAnnotation(cam.value, state.scene.annotations, sx, sy)
    if (ah?.type === 'text') { editor.textInput = { at: { ...ah.at }, text: ah.text, editId: ah.id }; return }
    const sel = state.selection
    if (sel?.kind !== 'body' || !vp.canEditGeometry.value) return
    const def = state.scene.bodies.find(b => b.id === sel.id)
    if (!def || def.shape.type === 'circle') return
    const hit = edgeAt(def, p, 8 / cam.value.ppm)
    if (!hit) return
    const wasBox = def.shape.type === 'box'
    edit(scene => { const b = scene.bodies.find(x => x.id === sel.id); if (b) insertVertex(b, hit.index, hit.local) })
    notify(wasBox ? tl('已把矩形转为多边形并添加顶点；拖动顶点改形状，Alt+单击顶点删除') : tl('已添加顶点；拖动它改变形状'))
  }

  return { onDown, onMove, onUp, onDblClick, closePolygon, finishCombine, cancelDraft, draftBar }
}
