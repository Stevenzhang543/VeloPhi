<script setup lang="ts">
/**
 * Scene viewport. Two variants share the drawing code:
 *   studio   the editor: tools, drag-to-create, selection handles, grid snapping, measuring and annotation
 *            tools, context menu and editing shortcuts;
 *   monitor  the playback view of the render & monitor page: no editing tools (a click still selects what to
 *            watch), effects on, a larger time display.
 * During playback the recording is drawn at the continuous `state.time` through `renderFrame` (interpolated
 * states, motion blur, particles, trails); in edit mode the scene's initial state is drawn.
 *
 * A viewport never draws while its page is hidden (pages stay mounted; `usePageActive()` says whether ours is
 * shown, and a zero-size host also counts as hidden) and resizes and redraws as soon as it is shown again. It
 * does not even read its size while hidden (that would force layout of a content-visibility: hidden subtree).
 * Draw requests are coalesced into one per animation frame and a pending request is never cancelled.
 */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { state, edit, markStale, viewCamera } from '../store'
import { usePageActive } from '../live'
import type { Selection } from '../store'
import { settings, effectiveEffects, fmtQ, toDisp, unitLabel } from '../settings'
import { compileModel } from '../../core/solver/model'
import { buildSystem, initialState } from '../../core/solver/dynamics'
import type { System } from '../../core/solver/dynamics'
import type { Pose } from '../../core/solver/kinematics'
import { computePoses, pulleyCenter } from '../../core/solver/kinematics'
import { frameState } from '../../core/solver/simulation'
import type { AnnotationDef } from '../../core/scene/types'
import { cloneScene, parseScene, serializeScene } from '../../core/scene/io'
import type { Camera } from '../../render/renderer'
import { DARK, LIGHT, computeTrajectories, drawScene, toScreen, toWorld, vectorScales } from '../../render/renderer'
import type { FrameEffects } from '../../render/frame'
import { DEFAULT_STYLE, PROJECTOR_STYLE, renderFrame } from '../../render/frame'
import type { EditorOverlay, HandleKind } from '../../render/overlay'
import { drawEditorOverlay, emptyOverlay } from '../../render/overlay'
import { TEXT_SIZE, annotationPoints, rulerLabel } from '../../render/annotations'
import { anchorFor, createConnector, createForce, createHinge, hitTest, moveObject, placeObject, wrapAt } from '../editing'
import { editor, clearDrafts, notify } from '../editor/editorState'
import type { MenuTarget } from '../editor/editorState'
import type { Pt } from '../editor/geometry'
import { bodyCenter, pulleyWorld } from '../editor/geometry'
import { featurePoints, featureSnap, snapOn, snapPoint, snapStep } from '../editor/snap'
import type { DragFeedback, Handle, HandleDrag, HandleId } from '../editor/handles'
import { applyHandleDrag, bodyHandles, deleteVertex, edgeAt, handleKey, hitHandle, insertVertex, pulleyHandles, rotateStemFrom, startHandleDrag } from '../editor/handles'
import type { DragTool } from '../editor/create'
import { createFromDrag, createPolygon, dragPreview, isDragTool, polygonPreview } from '../editor/create'
import { addAnnotation, annotationPointAt, deleteAnnotation, editAnnotations, hitAnnotation, placeMoved, pushHistory, setAnnotationPoint } from '../editor/annotations'
import {
  bringToFront, convertToPolygon, copySelection, deleteSelection, duplicateSelection, hasClipboard, kindChangeBlocker, nudgeSelection,
  paste, resetVelocity, sendToBack, toggleFixedRotation, toggleStatic
} from '../editor/commands'
import ContextMenu from './ContextMenu.vue'
import type { MenuItem } from './ContextMenu.vue'
import AnnotationTextInput from './AnnotationTextInput.vue'

const props = withDefaults(defineProps<{ variant?: 'studio' | 'monitor' }>(), { variant: 'studio' })
const studio = computed(() => props.variant !== 'monitor')
const pageActive = usePageActive()

const host = ref<HTMLDivElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const cam = ref<Camera>({ cx: state.scene.view.center.x, cy: state.scene.view.center.y, ppm: state.scene.view.pixelsPerMeter, width: 800, height: 600 })
const hover = ref<string | null>(null)
const hotHandle = ref<string | null>(null)
const cursorWorld = shallowRef<Pt | null>(null)
const snapMark = shallowRef<Pt | null>(null)
const cursor = ref('default')

const editing = computed(() => state.stale || !state.recording)
/** Geometry can be changed (move, handles): the studio, and the shown state is the initial one. */
const canEditGeometry = computed(() => studio.value && (editing.value || (state.frame === 0 && !state.playing)))

// ---- Edit-mode system ----
// The scene's version counts mutations, so the compiled edit system is rebuilt only when the scene changed
let sceneVersion = 0
watch(() => state.scene, () => { sceneVersion++ }, { deep: true, flush: 'sync' })
let editCache: { version: number; value: { sys: System; X: Float64Array; poses: Pose[] } | null } | null = null
function editSystem(): { sys: System; X: Float64Array; poses: Pose[] } | null {
  if (editCache && editCache.version === sceneVersion) return editCache.value
  let value: { sys: System; X: Float64Array; poses: Pose[] } | null = null
  try {
    const model = compileModel(cloneScene(state.scene))
    const sys = buildSystem(model)
    const X = initialState(sys)
    value = { sys, X, poses: computePoses(model, X) }
  } catch { value = null }
  editCache = { version: sceneVersion, value }
  return value
}

const trajectories = computed(() => (state.recording ? computeTrajectories(state.recording) : null))
/**
 * Vector scales: fixed per recording during playback, from the initial state in edit mode (cheap; cached per
 * recording).
 */
function currentScales(): { v: number; a: number; f: number } {
  const rec = state.recording
  if (rec && !state.stale) return vectorScales(rec, rec.system)
  const es = editSystem()
  return es ? vectorScales(null, es.sys) : { v: 30, a: 30, f: 3 }
}

// ---- Drawing ----
// One draw per animation frame. A pending request is kept, never cancelled: cancelling and re-requesting on
// every state change starved the canvas while playback changed the time on each tick.
let raf = 0
function requestDraw() {
  if (raf) return
  raf = requestAnimationFrame(() => { raf = 0; draw() })
}

function visible(): boolean {
  if (!pageActive.value) return false
  const h = host.value
  return !!h && h.clientWidth > 0 && h.clientHeight > 0
}

let lastError = 0
let effectsBroken = false
function draw() {
  const c = canvas.value
  if (!c || !visible()) return
  const ctx = c.getContext('2d')
  if (!ctx) return
  try {
    paint(ctx)
  } catch (err) {
    // A failing visual effect must never leave the canvas blank: draw again without effects
    if (performance.now() - lastError > 2000) { console.error('[viewport] draw failed', err); lastError = performance.now() }
        if (!effectsBroken) { effectsBroken = true; try { paint(ctx) } catch { /* Reported above */ } }
  }
}

function paint(ctx: CanvasRenderingContext2D) {
  const dpr = window.devicePixelRatio || 1
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const palette = state.theme === 'dark' ? DARK : LIGHT
  Object.assign(viewCamera, cam.value)
  const style = settings.projector ? PROJECTOR_STYLE : DEFAULT_STYLE
  const units = settings.units
  const pending = state.pendingConnector
  const pendingDraw = pending && studio.value ? { world: pending.first.world, cursor: cursorWorld.value, pulleys: pending.pulleys.map(p => pulleyNow(p.pulley) ?? pending.first.world) } : null
  const annotations = state.scene.annotations
  if (!editing.value && state.recording) {
    const rec = state.recording
    const e = effectiveEffects()
    const on = !effectsBroken
    const fx: FrameEffects = {
      motionBlur: on && e.motionBlur && state.playing,
      shutterSeconds: e.shutter * (1 / 60) * state.speed,
      particles: on && e.particles,
      trails: on && e.trails,
      trailSeconds: e.trailSeconds
    }
    renderFrame(ctx, cam.value, {
      rec, time: state.time, options: state.display, palette, digits: state.digits, scales: currentScales(), trajectories: trajectories.value,
      selectedId: state.selection?.id ?? null, hoverId: hover.value, effects: fx, annotations, selectedAnnotation: editor.annotationId, units, style
    })
  } else {
    const es = editSystem()
    if (!es) { ctx.fillStyle = palette.bg; ctx.fillRect(0, 0, cam.value.width, cam.value.height); return }
    drawScene(ctx, cam.value, {
      sys: es.sys, X: es.X, mode: null, sol: null, rec: null, frame: 0, time: 0, options: { ...state.display, forces: false, trajectory: false, acceleration: false },
      selectedId: state.selection?.id ?? null, hoverId: hover.value, palette, scales: currentScales(), trajectories: null,
      editing: true, pending: pendingDraw, digits: state.digits, units, style, annotations, selectedAnnotation: editor.annotationId
    })
  }
  if (studio.value) {
    const ov = buildOverlay()
    if (pendingDraw && !editing.value) {
      const pts = [pendingDraw.world, ...pendingDraw.pulleys, ...(pendingDraw.cursor ? [pendingDraw.cursor] : [])]
      ov.shapes.push({ kind: 'poly', pts, closed: false, dashed: true })
    }
    drawEditorOverlay(ctx, cam.value, ov, palette)
  }
}

let fittedVisible = false
function resize() {
  const h = host.value, c = canvas.value
  if (!h || !c || !pageActive.value) return // Resized again when the page is shown
  const r = h.getBoundingClientRect()
  if (r.width < 1 || r.height < 1) return // Hidden: keep the last size, draw nothing
  const dpr = window.devicePixelRatio || 1
  c.width = Math.max(1, Math.round(r.width * dpr))
  c.height = Math.max(1, Math.round(r.height * dpr))
  c.style.width = `${r.width}px`
  c.style.height = `${r.height}px`
  cam.value = { ...cam.value, width: r.width, height: r.height }
  if (!fittedVisible) { fittedVisible = true; fitView() }
  requestDraw()
}

/**
 * Fit the view to where things happen: every recorded position of the moving bodies (or their initial
 * positions before a run), pulleys and fixed anchors, with a margin.
 */
function fitView() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const grow = (x: number, y: number, r = 0) => { minX = Math.min(minX, x - r); maxX = Math.max(maxX, x + r); minY = Math.min(minY, y - r); maxY = Math.max(maxY, y + r) }
  const rec = state.recording
  if (rec && !state.stale) {
    const stride = Math.max(1, Math.floor(rec.frameCount / 300))
    for (const b of rec.system.model.dynamic) for (let k = 0; k < rec.frameCount; k += stride) grow(rec.states[k * rec.size + 3 * b.index], rec.states[k * rec.size + 3 * b.index + 1], b.bound)
    for (const b of rec.system.model.dynamic) { const k = rec.frameCount - 1; grow(rec.states[k * rec.size + 3 * b.index], rec.states[k * rec.size + 3 * b.index + 1], b.bound) }
  } else {
    for (const b of state.scene.bodies) if (b.kind !== 'static') grow(b.position.x, b.position.y, b.shape.type === 'circle' ? b.shape.radius : b.shape.type === 'box' ? Math.hypot(b.shape.width, b.shape.height) / 2 : 0.3)
  }
  for (const p of state.scene.pulleys) {
    const carrier = p.body && rec && !state.stale ? rec.system.model.byId.get(p.body) : null
    if (carrier && carrier.dynamic) {
      // A movable pulley goes wherever its body goes
      const reach = Math.hypot(p.position.x, p.position.y) + p.radius
      const stride = Math.max(1, Math.floor(rec!.frameCount / 300))
      for (let k = 0; k < rec!.frameCount; k += stride) grow(rec!.states[k * rec!.size + 3 * carrier.index], rec!.states[k * rec!.size + 3 * carrier.index + 1], reach)
    } else { const c = pulleyWorld(state.scene, p); grow(c.x, c.y, p.radius) }
  }
  for (const c of state.scene.connectors) for (const a of c.type === 'force' ? [c.a] : [c.a, c.b]) if (!a.body) grow(a.local.x, a.local.y)
  if (!Number.isFinite(minX)) {
    const v = state.scene.view
    cam.value = { ...cam.value, cx: v.center.x, cy: v.center.y, ppm: v.pixelsPerMeter }
    requestDraw()
    return
  }
  // Keep a little of the supporting surface in view
  minY -= 0.15 * Math.max(0.5, maxY - minY)
  const w = Math.max(0.6, maxX - minX), h = Math.max(0.6, maxY - minY)
  const ppm = Math.max(10, Math.min(2000, Math.min((cam.value.width * 0.8) / w, (cam.value.height * 0.72) / h)))
  cam.value = { ...cam.value, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, ppm }
  requestDraw()
}

let ro: ResizeObserver | null = null
onMounted(() => {
  ro = new ResizeObserver(resize)
  if (host.value) ro.observe(host.value)
  resize()
  window.addEventListener('keydown', onKeyCapture, true)
  window.addEventListener('keydown', onSpace)
  window.addEventListener('keyup', onSpace)
  window.addEventListener('keyup', onAltUp)
})
onBeforeUnmount(() => {
  ro?.disconnect()
  if (raf) cancelAnimationFrame(raf) // Unmounting: nothing left to draw
  raf = 0
  window.removeEventListener('keydown', onKeyCapture, true)
  window.removeEventListener('keydown', onSpace)
  window.removeEventListener('keyup', onSpace)
  window.removeEventListener('keyup', onAltUp)
})

// Shown again: take the current size (it may have changed while hidden) and draw the current state
watch(pageActive, on => { if (on) { resize(); requestDraw() } })
watch(() => state.recording, () => { effectsBroken = false })
watch(() => state.cameraRequest, fitView)
watch(() => [state.recording, state.stale], () => { if (state.fitPending && state.recording && !state.stale && visible()) { state.fitPending = false; fitView() } })
watch(() => [state.frame, state.time, state.recording, state.stale, state.playing, state.speed, state.selection, state.theme, state.digits, state.pendingConnector, state.tool, hover.value, hotHandle.value, { ...state.display }], requestDraw, { deep: true })
watch(() => state.scene, requestDraw, { deep: true })
watch(settings, requestDraw, { deep: true })
watch(editor, requestDraw, { deep: true })
watch(() => state.selection, s => { if (s) editor.annotationId = null })
watch(() => state.tool, () => { clearDrafts(); snapMark.value = null })

defineExpose({ canvas, cam, fitView })

// ---- Overlay ----
function selectionHandles(): { handles: Handle[]; target: { body?: string; pulley?: string } } | null {
  const sel = state.selection
  if (!sel || !canEditGeometry.value) return null
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

function overlayKind(h: HandleId): HandleKind { return h.kind }

function buildOverlay(): EditorOverlay {
  const ov = emptyOverlay()
  const ppm = cam.value.ppm
  const d = drag
  if (state.tool === 'select' && (!d || d.kind === 'handle')) {
    const sh = selectionHandles()
    if (sh) {
      const activeKey = d?.kind === 'handle' ? d.key : null
      const sel = state.selection
      const def = sel?.kind === 'body' ? state.scene.bodies.find(b => b.id === sel.id) : null
      for (const h of sh.handles) ov.handles.push({ at: h.at, kind: overlayKind(h.id), hot: hotHandle.value === handleKey(h.id), active: activeKey === handleKey(h.id), angle: def?.angle ?? 0 })
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
  if (d?.kind === 'annot-create' && d.moved) {
    ov.shapes.push({ kind: 'line', a: d.a, b: d.b, dashed: d.tool === 'annotate-arrow' })
    if (d.tool === 'measure-ruler') ov.labels.push({ at: { x: (d.a.x + d.b.x) / 2, y: (d.a.y + d.b.y) / 2 }, text: rulerLabel(d.a, d.b, state.digits), center: true, dy: -14 })
  }
  if (state.tool === 'add-polygon' && editor.polyDraft.length) {
    const first = editor.polyDraft[0]
    const cur = cursorWorld.value ? snapPoint(cursorWorld.value, ppm, altDown) : null
    const closeHot = !!cur && editor.polyDraft.length >= 3 && Math.hypot(cur.x - first.x, cur.y - first.y) * ppm <= 9
    const pv = polygonPreview(editor.polyDraft, cur, closeHot)
    ov.shapes.push(...pv.shapes)
    ov.labels.push(...pv.labels)
    editor.polyDraft.forEach((p, i) => ov.handles.push({ at: p, kind: 'vertex', hot: i === 0 && closeHot }))
  }
  if (state.tool === 'measure-angle' && editor.angleDraft.length) {
    const [v, a] = editor.angleDraft
    const cur = cursorWorld.value ? measureSnap(cursorWorld.value, altDown) : null
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
  ov.snap = snapMark.value
  return ov
}

// ---- Input helpers ----
function screenOf(e: MouseEvent): [number, number] {
  const r = canvas.value!.getBoundingClientRect()
  return [e.clientX - r.left, e.clientY - r.top]
}
function worldOf(e: MouseEvent | WheelEvent) {
  const [sx, sy] = screenOf(e)
  return toWorld(cam.value, sx, sy)
}

function currentPoses(): { sys: System; poses: Pose[] } | null {
  if (!editing.value && state.recording) {
    const rec = state.recording
    return { sys: rec.system, poses: computePoses(rec.system.model, frameState(rec, state.frame)) }
  }
  const es = editSystem()
  return es ? { sys: es.sys, poses: es.poses } : null
}

/** World centre of a pulley at the shown state (movable pulleys ride on their body). */
function pulleyNow(id: string): Pt | null {
  const cp = currentPoses()
  const pm = cp?.sys.model.pulleys.find(p => p.id === id)
  if (cp && pm) return pulleyCenter(cp.poses, pm)
  const def = state.scene.pulleys.find(p => p.id === id)
  return def ? pulleyWorld(state.scene, def) : null
}

/** Measuring tools snap to object features first, then to the grid. */
function measureSnap(p: Pt, alt: boolean): Pt {
  if (!alt) {
    const cp = currentPoses()
    if (cp) { const f = featureSnap(featurePoints(cp.sys.model, cp.poses), p, cam.value.ppm); if (f) return f }
  }
  return snapPoint(p, cam.value.ppm, alt)
}

function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  if (!t) return false
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable
}

let spaceDown = false
let altDown = false
function onSpace(e: KeyboardEvent) { if (e.code === 'Space' && !typing(e)) spaceDown = e.type === 'keydown' }
function onAltUp(e: KeyboardEvent) { if (e.key === 'Alt') { altDown = false; if (snapMark.value) requestDraw() } }

function commitSnapshot(snapshot: string) {
  if (snapshot === serializeScene(state.scene)) return
  state.past.push(snapshot)
  if (state.past.length > 200) state.past.shift()
  state.future = []
  state.dirty = true
  markStale()
}

// ---- Dragging ----
type Drag =
  | { kind: 'pan'; lastX: number; lastY: number }
  | { kind: 'right'; sx: number; sy: number; lastX: number; lastY: number }
  | { kind: 'move'; sel: Selection; start: Pt; applied: Pt; snapshot: string; moved: boolean; sx: number; sy: number }
  | { kind: 'handle'; hd: HandleDrag; key: string; snapshot: string; moved: boolean; sx: number; sy: number; feedback: DragFeedback | null }
  | { kind: 'create'; tool: DragTool; a: Pt; b: Pt; step: number; moved: boolean; sx: number; sy: number }
  | { kind: 'annot-create'; tool: 'measure-ruler' | 'annotate-arrow'; a: Pt; b: Pt; moved: boolean; sx: number; sy: number }
  | { kind: 'annot-move'; id: string; orig: AnnotationDef; point: number; start: Pt; snapshot: string; moved: boolean; sx: number; sy: number }

let drag: Drag | null = null

function onWheel(e: WheelEvent) {
  e.preventDefault()
  const before = worldOf(e)
  const f = Math.exp(-e.deltaY * 0.0015)
  const ppm = Math.min(5000, Math.max(5, cam.value.ppm * f))
  cam.value = { ...cam.value, ppm }
  const after = worldOf(e)
  cam.value = { ...cam.value, cx: cam.value.cx + before.x - after.x, cy: cam.value.cy + before.y - after.y }
  requestDraw()
}

function onDown(e: MouseEvent) {
  const p = worldOf(e)
  const [sx, sy] = screenOf(e)
  altDown = e.altKey
  if (editor.menu) editor.menu = null
  if (editor.textInput) (document.activeElement as HTMLElement | null)?.blur?.()
  if (e.button === 1 || (e.button === 0 && (spaceDown || (studio.value && state.tool === 'pan')))) {
    e.preventDefault()
    if (spaceDown) editor.spacePanned = true
    drag = { kind: 'pan', lastX: e.clientX, lastY: e.clientY }
    cursor.value = 'grabbing'
    return
  }
  if (e.button === 2) { drag = { kind: 'right', sx: e.clientX, sy: e.clientY, lastX: e.clientX, lastY: e.clientY }; return }
  if (e.button !== 0) return
  const cp = currentPoses()
  if (!cp) return
  const ppm = cam.value.ppm
  const tol = 8 / ppm
  if (!studio.value) {
    // Monitor: choose what to watch
    state.selection = hitTest(cp.sys, cp.poses, p, tol)
    return
  }
  const tool = state.tool
  const sp = snapPoint(p, ppm, e.altKey)
  if (tool === 'add-polygon') { polygonClick(sp); return }
  if (tool === 'measure-angle') { angleClick(measureSnap(p, e.altKey), e.shiftKey); return }
  if (tool === 'measure-ruler' || tool === 'annotate-arrow') {
    const a = tool === 'measure-ruler' ? measureSnap(p, e.altKey) : sp
    drag = { kind: 'annot-create', tool, a, b: a, moved: false, sx: e.clientX, sy: e.clientY }
    return
  }
  if (tool === 'annotate-text') {
    e.preventDefault()
    editor.textInput = { at: sp, text: '', editId: null }
    return
  }
  if (isDragTool(tool)) {
    drag = { kind: 'create', tool, a: sp, b: sp, step: snapOn(e.altKey) ? snapStep(ppm) : 0, moved: false, sx: e.clientX, sy: e.clientY }
    return
  }
  if (tool === 'add-force') {
    let id: string | null = null
    edit(scene => { id = createForce(scene, cp.sys, cp.poses, p) })
    if (id) { state.selection = { kind: 'connector', id }; state.rightTab = 'inspect' } else notify('请点击在可运动的物体上')
    if (!e.shiftKey) state.tool = 'select'
    return
  }
  if (tool === 'connect-hinge') {
    let id: string | null = null
    edit(scene => { id = createHinge(scene, cp.sys, cp.poses, p) })
    if (id) { state.selection = { kind: 'connector', id }; state.rightTab = 'inspect' } else notify('请点击在可运动的物体上')
    if (!e.shiftKey) state.tool = 'select'
    return
  }
  if (tool === 'connect-rope' || tool === 'connect-rod' || tool === 'connect-spring') {
    const pending = state.pendingConnector
    if (tool === 'connect-rope' && pending) {
      const hit = hitTest(cp.sys, cp.poses, p, tol)
      if (hit?.kind === 'pulley' && !pending.pulleys.some(q => q.pulley === hit.id)) { pending.pulleys.push({ pulley: hit.id, wrap: 'cw' }); requestDraw(); return }
    }
    const anc = anchorFor(cp.sys, cp.poses, p, 10 / ppm)
    if (!pending) { state.pendingConnector = { tool, first: anc, pulleys: [] }; return }
    // Finish: wrap directions from the polyline
    const pts = [pending.first.world, ...pending.pulleys.map(q => pulleyNow(q.pulley) ?? pending.first.world), anc.world]
    const pulleys = pending.pulleys.map((q, i) => ({ pulley: q.pulley, wrap: wrapAt(pts[i], pts[i + 1], pts[i + 2]) }))
    let id: string | null = null
    edit(scene => { id = createConnector(scene, tool, pending.first, anc, pulleys) })
    state.pendingConnector = null
    if (id) { state.selection = { kind: 'connector', id }; state.rightTab = 'inspect' }
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
        if (!ok) notify('多边形至少保留 3 个顶点')
        return
      }
      const snapshot = serializeScene(state.scene)
      const hd = startHandleDrag(state.scene, sh.target, h.id, p)
      if (hd) drag = { kind: 'handle', hd, key: handleKey(hd.handle), snapshot, moved: false, sx: e.clientX, sy: e.clientY, feedback: null }
      return
    }
  }
  // Annotations (drawn on top)
  const selAnn = editor.annotationId ? state.scene.annotations.find(a => a.id === editor.annotationId) : null
  if (selAnn) {
    const idx = annotationPointAt(cam.value, selAnn, sx, sy)
    if (idx >= 0) {
      drag = { kind: 'annot-move', id: selAnn.id, orig: JSON.parse(JSON.stringify(selAnn)), point: idx, start: p, snapshot: serializeScene(state.scene), moved: false, sx: e.clientX, sy: e.clientY }
      return
    }
  }
  const ah = hitAnnotation(cam.value, state.scene.annotations, sx, sy)
  if (ah) {
    state.selection = null
    editor.annotationId = ah.id
    drag = { kind: 'annot-move', id: ah.id, orig: JSON.parse(JSON.stringify(ah)), point: -1, start: p, snapshot: serializeScene(state.scene), moved: false, sx: e.clientX, sy: e.clientY }
    return
  }
  // Objects
  let hit = hitTest(cp.sys, cp.poses, p, tol)
  const cur = state.selection
  if (!hit && cur?.kind === 'body' && canEditGeometry.value) {
    // A click right on the outline keeps the selection (so a double-click on an edge can add a vertex)
    const def = state.scene.bodies.find(b => b.id === cur.id)
    if (def && edgeAt(def, p, 8 / ppm)) hit = cur
  }
  editor.annotationId = null
  state.selection = hit
  // During playback a click on a moving body is a request for its readings
  if (!editing.value && hit?.kind === 'body' && state.rightTab === 'inspect' && cp.sys.model.byId.get(hit.id)?.dynamic) state.rightTab = 'watch'
  if (hit && (hit.kind === 'body' || hit.kind === 'pulley') && canEditGeometry.value) {
    drag = { kind: 'move', sel: hit, start: p, applied: { x: 0, y: 0 }, snapshot: serializeScene(state.scene), moved: false, sx: e.clientX, sy: e.clientY }
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
  if (pts.length < 3) { notify('多边形至少需要 3 个顶点'); return }
  let res: ReturnType<typeof createPolygon> | null = null
  edit(scene => { res = createPolygon(scene, pts) })
  const r = res as ReturnType<typeof createPolygon> | null
  clearDrafts()
  if (!r) return
  if ('error' in r) { notify(r.error); return }
  state.selection = { kind: 'body', id: r.id }
  state.rightTab = 'inspect'
  if (r.dropped > 0) notify(`多边形须为凸多边形：已去掉 ${r.dropped} 个凹进的顶点`)
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

function onMove(e: MouseEvent) {
  const p = worldOf(e)
  cursorWorld.value = p
  altDown = e.altKey
  const ppm = cam.value.ppm
  const d = drag
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
        drag = { kind: 'pan', lastX: d.lastX, lastY: d.lastY }
        cursor.value = 'grabbing'
        onMove(e)
      }
      return
    }
    const dist = Math.hypot(e.clientX - d.sx, e.clientY - d.sy)
    if (d.kind === 'move') {
      if (!d.moved && dist < 4) return
      d.moved = true
      // Snap the displacement, so a body that sits on the grid stays on it
      const tot = { x: p.x - d.start.x, y: p.y - d.start.y }
      const s = snapOn(e.altKey) ? snapStep(ppm) : 0
      const want = s ? { x: Math.round(tot.x / s) * s, y: Math.round(tot.y / s) * s } : tot
      moveObject(state.scene, d.sel, want.x - d.applied.x, want.y - d.applied.y)
      d.applied = want
      snapMark.value = s ? { x: d.start.x + want.x, y: d.start.y + want.y } : null
      state.stale = true
      state.playing = false
      requestDraw()
      return
    }
    if (d.kind === 'handle') {
      if (!d.moved && dist < 3) return
      d.moved = true
      const snap = snapOn(e.altKey)
      const rot = d.hd.handle.kind === 'rotate'
      const q = rot ? p : snapPoint(p, ppm, e.altKey)
      d.feedback = applyHandleDrag(state.scene, d.hd, q, {
        snap, step: snapStep(ppm), shift: e.shiftKey, angleSnap: (settings.editor.angleSnap * Math.PI) / 180,
        fmtLen: v => fmtQ(v, 'm', 4), fmtAng: v => fmtQ(v, 'rad', 4)
      })
      snapMark.value = snap && !rot ? q : null
      state.stale = true
      state.playing = false
      requestDraw()
      return
    }
    if (d.kind === 'create') {
      if (!d.moved && dist < 4) return
      d.moved = true
      d.b = snapPoint(p, ppm, e.altKey)
      d.step = snapOn(e.altKey) ? snapStep(ppm) : 0
      snapMark.value = d.step ? d.b : null
      requestDraw()
      return
    }
    if (d.kind === 'annot-create') {
      if (!d.moved && dist < 4) return
      d.moved = true
      d.b = d.tool === 'measure-ruler' ? measureSnap(p, e.altKey) : snapPoint(p, ppm, e.altKey)
      snapMark.value = d.b
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
        snapMark.value = q
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
  if (!studio.value) {
    const cp = currentPoses()
    const h = cp ? hitTest(cp.sys, cp.poses, p, 8 / ppm) : null
    if ((h?.id ?? null) !== hover.value) hover.value = h?.id ?? null
    cursor.value = h ? 'pointer' : 'default'
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
  if (hot !== hotHandle.value) hotHandle.value = hot
  if (!hot) {
    const cp = currentPoses()
    const h = cp ? hitTest(cp.sys, cp.poses, p, 8 / ppm) : null
    const id = h?.id ?? null
    if (id !== hover.value) hover.value = id
    if (tool === 'select') {
      const [sx, sy] = screenOf(e)
      if (hitAnnotation(cam.value, state.scene.annotations, sx, sy)) cur = 'move'
      else if (h) cur = canEditGeometry.value && (h.kind === 'body' || h.kind === 'pulley') ? 'move' : 'pointer'
    }
  } else if (hover.value) hover.value = null
  if (tool === 'pan') cur = 'grab'
  else if (tool !== 'select') cur = 'crosshair'
  if (spaceDown) cur = 'grab'
  cursor.value = cur
  // Snap marker while placing or measuring
  let mark: Pt | null = null
  if (tool === 'measure-ruler' || tool === 'measure-angle') mark = measureSnap(p, e.altKey)
  else if ((tool.startsWith('add-') && tool !== 'add-force') || tool === 'annotate-arrow' || tool === 'annotate-text') mark = snapOn(e.altKey) ? snapPoint(p, ppm, e.altKey) : null
  const changed = (mark?.x ?? NaN) !== (snapMark.value?.x ?? NaN) || (mark?.y ?? NaN) !== (snapMark.value?.y ?? NaN)
  if (changed || (mark === null) !== (snapMark.value === null)) snapMark.value = mark
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

function onUp(e: MouseEvent) {
  const d = drag
  drag = null
  if (!d) return
  if (d.kind === 'pan') { cursor.value = state.tool === 'pan' ? 'grab' : 'default'; return }
  if (d.kind === 'right') { if (studio.value) openMenu(e); return }
  if (d.kind === 'move' || d.kind === 'handle') {
    if (d.moved) commitSnapshot(d.snapshot)
    snapMark.value = null
    requestDraw()
    return
  }
  if (d.kind === 'create') {
    snapMark.value = null
    const pv = d.moved ? dragPreview(d.tool, d.a, d.b, d.step) : null
    let made: { id: string; kind: 'body' | 'pulley' } | null = null
    if (pv?.ok) edit(scene => { made = createFromDrag(scene, d.tool, d.a, d.b, d.step) })
    else {
      const cp = currentPoses()
      if (cp) edit(scene => { const id = placeObject(scene, cp.sys, cp.poses, d.tool, d.a); if (id) made = { id, kind: d.tool === 'add-pulley' ? 'pulley' : 'body' } })
    }
    const m = made as { id: string; kind: 'body' | 'pulley' } | null
    if (m) { editor.annotationId = null; state.selection = { kind: m.kind, id: m.id } }
    if (!e.shiftKey) state.tool = 'select'
    state.rightTab = 'inspect'
    return
  }
  if (d.kind === 'annot-create') {
    snapMark.value = null
    const len = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y) * cam.value.ppm
    if (!d.moved || len < 4) { notify(d.tool === 'measure-ruler' ? '按住并拖动来测量长度' : '按住并拖动来画箭头'); return }
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
    snapMark.value = null
    if (d.moved) pushHistory(d.snapshot)
    requestDraw()
  }
}

function onLeave() {
  hover.value = null
  hotHandle.value = null
  cursorWorld.value = null
  snapMark.value = null
  const d = drag
  // A drag that leaves the canvas ends there (the context menu needs a release inside)
  if (d && d.kind !== 'right') onUp(new MouseEvent('mouseup'))
  drag = null
  requestDraw()
}

function onDblClick(e: MouseEvent) {
  if (!studio.value) return
  const p = worldOf(e)
  const [sx, sy] = screenOf(e)
  if (state.tool === 'add-polygon') { closePolygon(); return }
  if (state.tool !== 'select') return
  const ah = hitAnnotation(cam.value, state.scene.annotations, sx, sy)
  if (ah?.type === 'text') { editor.textInput = { at: { ...ah.at }, text: ah.text, editId: ah.id }; return }
  const sel = state.selection
  if (sel?.kind !== 'body' || !canEditGeometry.value) return
  const def = state.scene.bodies.find(b => b.id === sel.id)
  if (!def || def.shape.type === 'circle') return
  const hit = edgeAt(def, p, 8 / cam.value.ppm)
  if (!hit) return
  const wasBox = def.shape.type === 'box'
  edit(scene => { const b = scene.bodies.find(x => x.id === sel.id); if (b) insertVertex(b, hit.index, hit.local) })
  notify(wasBox ? '已把矩形转为多边形并添加顶点；拖动顶点改形状，Alt+单击顶点删除' : '已添加顶点；拖动它改变形状')
}

// ---- Context menu ----
function openMenu(e: MouseEvent) {
  const p = worldOf(e)
  const [sx, sy] = screenOf(e)
  let target: MenuTarget = { kind: 'empty' }
  const ah = hitAnnotation(cam.value, state.scene.annotations, sx, sy)
  if (ah) { target = { kind: 'annotation', id: ah.id }; state.selection = null; editor.annotationId = ah.id }
  else {
    const cp = currentPoses()
    const hit = cp ? hitTest(cp.sys, cp.poses, p, 8 / cam.value.ppm) : null
    if (hit) { target = hit; editor.annotationId = null; state.selection = hit }
  }
  editor.menu = { x: e.clientX, y: e.clientY, world: p, target }
}

const ADD_ITEMS: Array<{ tool: string; label: string; icon: string }> = [
  { tool: 'add-ball', label: '小球', icon: 'ball' }, { tool: 'add-block', label: '物块', icon: 'block' },
  { tool: 'add-disc', label: '圆柱', icon: 'disc' }, { tool: 'add-wedge', label: '楔块', icon: 'wedge' },
  { tool: 'add-polygon', label: '多边形', icon: 'polygon' }, { tool: 'add-ground', label: '地面', icon: 'ground' },
  { tool: 'add-incline', label: '斜面', icon: 'incline' }, { tool: 'add-wall', label: '墙', icon: 'wall' },
  { tool: 'add-conveyor', label: '传送带', icon: 'conveyor' }, { tool: 'add-pulley', label: '定滑轮', icon: 'pulley' }
]

const menuItems = computed<MenuItem[]>(() => {
  const m = editor.menu
  if (!m) return []
  const t = m.target
  if (t.kind === 'empty') {
    return [
      { id: 'paste', label: '粘贴到此处', icon: 'paste', shortcut: 'Ctrl+V', disabled: !hasClipboard() },
      { id: 'add', label: '添加物体', icon: 'plus', children: ADD_ITEMS.map(a => ({ id: `add:${a.tool}`, label: a.label, icon: a.icon })) },
      { id: 'text', label: '添加文字标注', icon: 'text' },
      { id: 'fit', label: '适合视图', icon: 'fit', sep: true }
    ]
  }
  if (t.kind === 'annotation') {
    const a = state.scene.annotations.find(x => x.id === t.id)
    return [
      ...(a?.type === 'text' ? [{ id: 'edit-text', label: '编辑文字', icon: 'text' }] : []),
      { id: 'copy', label: '复制', icon: 'copy', shortcut: 'Ctrl+C' },
      { id: 'dup', label: '创建副本', icon: 'duplicate', shortcut: 'Ctrl+D' },
      { id: 'delete', label: '删除', icon: 'trash', shortcut: 'Del', danger: true, sep: true }
    ]
  }
  if (t.kind === 'connector') return [{ id: 'delete', label: '删除', icon: 'trash', shortcut: 'Del', danger: true }]
  if (t.kind === 'pulley') {
    const p = state.scene.pulleys.find(x => x.id === t.id)
    return [
      { id: 'copy', label: '复制', icon: 'copy', shortcut: 'Ctrl+C', disabled: !!p?.body },
      { id: 'dup', label: '创建副本', icon: 'duplicate', shortcut: 'Ctrl+D', disabled: !!p?.body },
      { id: 'delete', label: '删除', icon: 'trash', shortcut: 'Del', danger: true, sep: true }
    ]
  }
  const b = state.scene.bodies.find(x => x.id === t.id)
  if (!b) return []
  const dyn = b.kind !== 'static'
  const block = kindChangeBlocker(state.scene, b)
  const items: MenuItem[] = [
    { id: 'copy', label: '复制', icon: 'copy', shortcut: 'Ctrl+C' },
    { id: 'dup', label: '创建副本', icon: 'duplicate', shortcut: 'Ctrl+D' },
    { id: 'delete', label: '删除', icon: 'trash', shortcut: 'Del', danger: true },
    { id: 'front', label: '移到最前', icon: 'front', sep: true },
    { id: 'back', label: '移到最后', icon: 'back' },
    { id: 'static', label: dyn ? '转为固定物体' : '转为可运动物体', icon: dyn ? 'anchor' : 'unlock', sep: true, disabled: !!block, title: block ?? undefined }
  ]
  if (b.kind === 'rigid') items.push({ id: 'fixrot', label: b.fixedRotation ? '允许转动' : '固定转动（只平动）', icon: 'norotate' })
  if (b.shape.type === 'box') items.push({ id: 'poly', label: '转为多边形（编辑顶点）', icon: 'polygon' })
  if (dyn) {
    const moving = b.velocity.x !== 0 || b.velocity.y !== 0 || b.angularVelocity !== 0
    items.push({ id: 'v0', label: '初速度清零', icon: 'zero', disabled: !moving })
    items.push({ id: 'force', label: '在此处添加外力', icon: 'force', sep: true })
    items.push({ id: 'hinge', label: '在此处添加铰链', icon: 'hinge' })
  }
  return items
})

function runMenu(id: string) {
  const m = editor.menu
  editor.menu = null
  if (!m) return
  const t = m.target
  const tid = t.kind === 'empty' ? '' : t.id
  const offset = snapStep(cam.value.ppm) * 2
  switch (id) {
    case 'paste': paste(snapPoint(m.world, cam.value.ppm, false), offset); return
    case 'text': editor.textInput = { at: snapPoint(m.world, cam.value.ppm, false), text: '', editId: null }; return
    case 'fit': fitView(); return
    case 'edit-text': {
      const a = state.scene.annotations.find(x => x.id === tid)
      if (a?.type === 'text') editor.textInput = { at: { ...a.at }, text: a.text, editId: a.id }
      return
    }
    case 'copy': copySelection(); return
    case 'dup': duplicateSelection(offset); return
    case 'delete': deleteSelection(); return
    case 'front': bringToFront(tid); return
    case 'back': sendToBack(tid); return
    case 'static': toggleStatic(tid); return
    case 'fixrot': toggleFixedRotation(tid); return
    case 'poly': convertToPolygon(tid); return
    case 'v0': resetVelocity(tid); return
    case 'force': case 'hinge': {
      const cp = currentPoses()
      if (!cp) return
      let cid: string | null = null
      edit(scene => { cid = id === 'force' ? createForce(scene, cp.sys, cp.poses, m.world) : createHinge(scene, cp.sys, cp.poses, m.world) })
      if (cid) { state.selection = { kind: 'connector', id: cid }; state.rightTab = 'inspect' } else notify('此处不在可运动的物体上')
      return
    }
  }
  if (id.startsWith('add:')) {
    const tool = id.slice(4) as typeof state.tool
    const cp = currentPoses()
    if (!cp) return
    let nid: string | null = null
    edit(scene => { nid = placeObject(scene, cp.sys, cp.poses, tool, snapPoint(m.world, cam.value.ppm, false)) })
    if (nid) { editor.annotationId = null; state.selection = { kind: tool === 'add-pulley' ? 'pulley' : 'body', id: nid }; state.rightTab = 'inspect' }
  }
}

// ---- Text input ----
const textInputPos = computed(() => {
  const ti = editor.textInput
  if (!ti) return null
  const [x, y] = toScreen(cam.value, ti.at.x, ti.at.y)
  return { x, y }
})

function commitText(text: string) {
  const ti = editor.textInput
  editor.textInput = null
  if (!ti) return
  const t = text.replace(/\s+$/, '').replace(/^\s+/, '')
  if (ti.editId) {
    const eid = ti.editId
    editAnnotations(scene => {
      if (!t) deleteAnnotation(scene, eid)
      else { const a = scene.annotations.find(x => x.id === eid); if (a?.type === 'text') a.text = t }
    })
    if (!t && editor.annotationId === eid) editor.annotationId = null
    return
  }
  if (!t) return
  let id: string | null = null
  editAnnotations(scene => { id = addAnnotation(scene, { type: 'text', at: { ...ti.at }, text: t }) })
  if (id) { state.selection = null; editor.annotationId = id }
  if (state.tool === 'annotate-text') state.tool = 'select'
}

function cancelText() { editor.textInput = null }

// ---- Keyboard ----
/** Tool shortcuts (no modifier). V (select) is handled by the app. */
const TOOL_KEYS: Record<string, typeof state.tool> = {
  h: 'pan', b: 'add-block', o: 'add-ball', c: 'add-disc', p: 'add-polygon', g: 'add-ground', i: 'add-incline', w: 'add-wall',
  m: 'measure-ruler', a: 'measure-angle', t: 'annotate-text', l: 'annotate-arrow'
}

let lastNudge = 0
let lastNudgeId = ''

function onKeyCapture(e: KeyboardEvent) {
  if (!studio.value || !visible() || typing(e) || editor.menu || editor.textInput) return
  const mod = e.ctrlKey || e.metaKey
  const k = e.key
  const lower = k.length === 1 ? k.toLowerCase() : k
  const stop = () => { e.preventDefault(); e.stopPropagation() }
  const offset = snapStep(cam.value.ppm) * 2
  if (mod && !e.altKey) {
    if (lower === 'c' && !e.shiftKey) { if (copySelection()) stop(); return }
    if (lower === 'v' && !e.shiftKey) { stop(); const cw = cursorWorld.value; paste(cw ? snapPoint(cw, cam.value.ppm, false) : null, offset); return }
    if (lower === 'd' && !e.shiftKey) { stop(); duplicateSelection(offset); return }
    return
  }
  if (k.startsWith('Arrow')) {
    const sel = state.selection
    const id = editor.annotationId ?? sel?.id ?? ''
    const isObj = sel?.kind === 'body' || sel?.kind === 'pulley'
    // Nudging continues across the automatic re-run that follows each nudge
    const recent = performance.now() - lastNudge < 1500 && lastNudgeId === id && state.frame === 0 && !state.playing
    if (!(editor.annotationId || (isObj && (editing.value || recent)))) return
    stop()
    const s = snapStep(cam.value.ppm) * (e.shiftKey ? 10 : 1)
    const dx = k === 'ArrowLeft' ? -s : k === 'ArrowRight' ? s : 0
    const dy = k === 'ArrowDown' ? -s : k === 'ArrowUp' ? s : 0
    if (nudgeSelection(dx, dy)) { lastNudge = performance.now(); lastNudgeId = id }
    return
  }
  if (k === 'Escape') {
    const d = drag
    const busy = editor.polyDraft.length > 0 || editor.angleDraft.length > 0 || (d !== null && d.kind !== 'pan')
    drag = null
    snapMark.value = null
    if (d && (d.kind === 'move' || d.kind === 'handle') && d.moved) restoreSnapshot(d.snapshot)
    else if (d && d.kind === 'annot-move' && d.moved) { const a = state.scene.annotations.find(x => x.id === d.id); if (a) placeMoved(a, d.orig, 0, 0) }
    if (busy) { clearDrafts(); stop() }
    requestDraw()
    return
  }
  if (k === 'Enter' && state.tool === 'add-polygon' && editor.polyDraft.length) { stop(); closePolygon(); return }
  if (k === 'Backspace' && state.tool === 'add-polygon' && editor.polyDraft.length) { stop(); editor.polyDraft.pop(); return }
  if ((k === 'Delete' || k === 'Backspace') && editor.annotationId && !state.selection) { stop(); deleteSelection(); return }
  if (!e.altKey && !e.shiftKey && TOOL_KEYS[lower]) {
    stop()
    state.tool = TOOL_KEYS[lower]
    state.pendingConnector = null
  }
}

/** Cancel a move or handle drag: put the scene back as it was at mouse-down. */
function restoreSnapshot(snapshot: string) {
  if (serializeScene(state.scene) === snapshot) return
  state.scene = parseScene(snapshot).scene
  markStale()
}

// ---- HUD ----
const timeText = computed(() => {
  if (editing.value) return null
  const decimals = Math.max(2, Math.min(5, state.digits - 2))
  return `t = ${toDisp(state.time, 's').toFixed(decimals)} ${unitLabel('s')}`
})

const toolHint = computed(() => {
  if (!studio.value) return ''
  const snap = settings.editor.snap ? '；按住 Alt 暂停吸附' : ''
  switch (state.tool) {
    case 'connect-rope': return state.pendingConnector ? '点击滑轮让绳绕过，再点击另一物体或空白处（固定点）完成' : '点击物体（靠近中心吸附到质心）或空白处作为绳的一端'
    case 'connect-rod': return state.pendingConnector ? '点击另一端' : '点击轻杆的一端'
    case 'connect-spring': return state.pendingConnector ? '点击弹簧另一端（物体或固定点）' : '点击弹簧的一端'
    case 'connect-hinge': return '点击物体上的转轴位置（与重叠的物体铰接，否则固定在世界中）'
    case 'add-force': return '点击物体上的作用点添加恒力'
    case 'pan': return '拖动平移视图'
    case 'select': return ''
    case 'add-polygon': return editor.polyDraft.length >= 3 ? `已放 ${editor.polyDraft.length} 个顶点：点击第一个顶点、双击或按 Enter 完成；Backspace 撤回一点；Esc 取消` : '依次点击放置顶点（结果取凸包）' + snap
    case 'measure-ruler': return '按住并拖动测量长度与倾角（自动吸附到顶点和质心）' + snap
    case 'measure-angle': return editor.angleDraft.length === 0 ? '点击角的顶点' : editor.angleDraft.length === 1 ? '点击第一条边上的一点' : '点击第二条边上的一点'
    case 'annotate-text': return '点击放置文字标注'
    case 'annotate-arrow': return '按住并拖动画箭头' + snap
    case 'add-ball': case 'add-disc': case 'add-pulley': return '点击放置；按住拖动设定半径；按住 Shift 连续放置' + snap
    case 'add-ground': case 'add-conveyor': return '点击放置；按住水平拖动设定长度；按住 Shift 连续放置' + snap
    case 'add-incline': case 'add-wedge': return '点击放置；从直角处拖出底边和高；按住 Shift 连续放置' + snap
    default: return '点击放置（靠近表面时自动贴合）；按住拖动设定大小；按住 Shift 连续放置' + snap
  }
})

const selectionHint = computed(() => {
  if (!studio.value || state.tool !== 'select' || !canEditGeometry.value) return ''
  const sel = state.selection
  if (sel?.kind !== 'body') return ''
  const b = state.scene.bodies.find(x => x.id === sel.id)
  if (!b) return ''
  const rot = settings.editor.angleSnap > 0 ? `（按 ${settings.editor.angleSnap}° 吸附，Shift 自由旋转）` : ''
  if (b.shape.type === 'polygon') return `拖动顶点改形状，双击边添加顶点，Alt+单击顶点删除；圆形手柄旋转${rot}`
  if (b.shape.type === 'box') return `拖动方形手柄改大小（Shift 等比），圆形手柄旋转${rot}；右键可转为多边形`
  return '拖动手柄改半径'
})
</script>

<template>
  <div ref="host" class="viewport" :class="[`v-${props.variant}`]">
    <canvas ref="canvas" :style="{ cursor }" @wheel="onWheel" @mousedown="onDown" @mousemove="onMove" @mouseup="onUp" @mouseleave="onLeave" @dblclick="onDblClick" @contextmenu.prevent />
    <div class="overlay top-left">
      <span v-if="timeText && studio" class="time mono">{{ timeText }}</span>
      <span v-if="editing" class="badge warn">{{ studio ? '编辑中' : '未运行' }}{{ state.recording ? ' · 结果已过期' : '' }}</span>
      <span v-if="state.computing" class="badge info">计算中…</span>
      <span v-if="state.simError" class="badge bad" :title="state.simError">{{ state.simError }}</span>
    </div>
    <div v-if="!studio && timeText" class="overlay hud mono">{{ timeText }}<span v-if="state.speed !== 1" class="speed">{{ state.speed }}×</span></div>
    <div v-if="toolHint || editor.notice || selectionHint" class="overlay hint-col">
      <div v-if="toolHint || selectionHint" class="hint small">{{ toolHint || selectionHint }}</div>
      <div v-if="editor.notice" class="hint small notice">{{ editor.notice }}</div>
    </div>
    <div class="overlay bottom-right">
      <button class="btn ghost small" title="缩放到运动范围" @click="fitView">适合视图</button>
    </div>
    <AnnotationTextInput v-if="studio && editor.textInput && textInputPos" :key="`${editor.textInput.editId ?? 'new'}:${editor.textInput.at.x},${editor.textInput.at.y}`"
      :x="textInputPos.x" :y="textInputPos.y" :text="editor.textInput.text" :size="TEXT_SIZE * (settings.projector ? 1.4 : 1)" @commit="commitText" @cancel="cancelText" />
    <ContextMenu v-if="studio && editor.menu && visible()" :x="editor.menu.x" :y="editor.menu.y" :items="menuItems" @pick="runMenu" @close="editor.menu = null" />
  </div>
</template>

<style scoped>
.viewport { position: relative; width: 100%; height: 100%; overflow: hidden; border-radius: var(--radius-pane); background: var(--canvas-bg); box-shadow: var(--shadow); }
canvas { display: block; }
.overlay { position: absolute; display: flex; gap: 6px; align-items: center; pointer-events: none; }
.overlay > * { pointer-events: auto; }
.top-left { top: 10px; left: 12px; }
.bottom-right { bottom: 8px; right: 8px; }
.hint-col { top: 10px; left: 50%; transform: translateX(-50%); flex-direction: column; max-width: 70%; }
.overlay.hint-col > * { pointer-events: none; user-select: none; }
.hint { background: var(--pane); padding: 4px 10px; border-radius: 999px; box-shadow: var(--shadow); color: var(--text-2); text-align: center; }
.hint.notice { color: var(--accent); }
.overlay .time, .overlay.hud { pointer-events: none; }
.time { font-size: 15px; font-weight: 600; background: var(--pane); padding: 2px 10px; border-radius: 8px; box-shadow: var(--shadow); }
.hud { top: 14px; right: 16px; font-size: 30px; font-weight: 650; letter-spacing: 0.01em; background: var(--pane); padding: 4px 16px; border-radius: 12px; box-shadow: var(--shadow); font-variant-numeric: tabular-nums; }
.hud .speed { font-size: 16px; font-weight: 600; color: var(--text-2); margin-left: 10px; }
</style>
