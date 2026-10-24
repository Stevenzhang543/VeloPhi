<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { state, edit, currentTime, markStale, viewCamera } from '../store'
import { compileModel } from '../../core/solver/model'
import { buildSystem, initialState, solveMode } from '../../core/solver/dynamics'
import type { System } from '../../core/solver/dynamics'
import { computePoses } from '../../core/solver/kinematics'
import { frameState } from '../../core/solver/simulation'
import type { Camera } from '../../render/renderer'
import { DARK, LIGHT, computeTrajectories, drawScene, toWorld, vectorScales } from '../../render/renderer'
import { anchorFor, createConnector, createForce, createHinge, hitTest, moveObject, placeObject, wrapAt } from '../editing'
import { cloneScene, serializeScene } from '../../core/scene/io'

const host = ref<HTMLDivElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const cam = ref<Camera>({ cx: state.scene.view.center.x, cy: state.scene.view.center.y, ppm: state.scene.view.pixelsPerMeter, width: 800, height: 600 })
const hover = ref<string | null>(null)
const cursorWorld = ref<{ x: number; y: number } | null>(null)

const editing = computed(() => state.stale || !state.recording)

// edit-mode system, rebuilt when the scene changes
const editSys = shallowRef<{ sys: System; X: Float64Array; key: string } | null>(null)
function editSystem(): { sys: System; X: Float64Array } | null {
  const key = serializeScene(state.scene)
  if (editSys.value && editSys.value.key === key) return editSys.value
  try {
    const sc = cloneScene(state.scene)
    const model = compileModel(sc)
    const sys = buildSystem(model)
    const X = initialState(sys)
    editSys.value = { sys, X, key }
    return editSys.value
  } catch {
    return null
  }
}

const trajectories = computed(() => (state.recording ? computeTrajectories(state.recording) : null))
const scales = computed(() => {
  const rec = state.recording
  if (rec && !state.stale) return vectorScales(rec, rec.system)
  const es = editSystem()
  return es ? vectorScales(null, es.sys) : { v: 30, a: 30, f: 3 }
})

let raf = 0
function requestDraw() {
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(draw)
}

function draw() {
  const c = canvas.value
  if (!c) return
  const ctx = c.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const palette = state.theme === 'dark' ? DARK : LIGHT
  Object.assign(viewCamera, cam.value)
  const pending = state.pendingConnector
  const pendingDraw = pending ? { world: pending.first.world, cursor: cursorWorld.value, pulleys: pending.pulleys.map(p => state.scene.pulleys.find(q => q.id === p.pulley)!.position) } : null
  if (!editing.value && state.recording) {
    const rec = state.recording
    const k = Math.min(state.frame, rec.frameCount - 1)
    const X = frameState(rec, k)
    const seg = rec.segments[rec.frameSegment[k]]
    const sol = solveMode(rec.system, X, seg.mode)
    drawScene(ctx, cam.value, {
      sys: rec.system, X, mode: seg.mode, sol, rec, frame: k, time: k * rec.dt, options: state.display,
      selectedId: state.selection?.id ?? null, hoverId: hover.value, palette, scales: scales.value, trajectories: trajectories.value,
      editing: false, pending: pendingDraw, digits: state.digits
    })
  } else {
    const es = editSystem()
    if (!es) { ctx.fillStyle = palette.bg; ctx.fillRect(0, 0, cam.value.width, cam.value.height); return }
    drawScene(ctx, cam.value, {
      sys: es.sys, X: es.X, mode: null, sol: null, rec: null, frame: 0, time: 0, options: { ...state.display, forces: false, trajectory: false, acceleration: false },
      selectedId: state.selection?.id ?? null, hoverId: hover.value, palette, scales: scales.value, trajectories: null,
      editing: true, pending: pendingDraw, digits: state.digits
    })
  }
}

function resize() {
  const h = host.value, c = canvas.value
  if (!h || !c) return
  const r = h.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  c.width = Math.max(1, Math.round(r.width * dpr))
  c.height = Math.max(1, Math.round(r.height * dpr))
  c.style.width = `${r.width}px`
  c.style.height = `${r.height}px`
  cam.value = { ...cam.value, width: r.width, height: r.height }
  requestDraw()
}

/** Fit the view to where things happen: every recorded position of the moving bodies (or their initial
 * positions before a run), pulleys and fixed anchors, with a margin. */
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
  for (const p of state.scene.pulleys) grow(p.position.x, p.position.y, p.radius)
  for (const c of state.scene.connectors) for (const a of c.type === 'force' ? [c.a] : [c.a, c.b]) if (!a.body) grow(a.local.x, a.local.y)
  if (!Number.isFinite(minX)) {
    const v = state.scene.view
    cam.value = { ...cam.value, cx: v.center.x, cy: v.center.y, ppm: v.pixelsPerMeter }
    requestDraw()
    return
  }
  // keep a little of the supporting surface in view
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
  fitView()
})
onBeforeUnmount(() => { ro?.disconnect(); cancelAnimationFrame(raf) })

watch(() => state.cameraRequest, fitView)
watch(() => [state.recording, state.stale], () => { if (state.fitPending && state.recording && !state.stale) { state.fitPending = false; fitView() } })
watch(() => [state.frame, state.recording, state.stale, state.selection, state.theme, state.digits, state.pendingConnector, hover.value, { ...state.display }], requestDraw, { deep: true })
watch(() => state.scene, requestDraw, { deep: true })

defineExpose({ canvas, cam, fitView })

// ---------------------------------------------------------------------------------------------- input
function worldOf(e: MouseEvent | WheelEvent) {
  const r = canvas.value!.getBoundingClientRect()
  return toWorld(cam.value, e.clientX - r.left, e.clientY - r.top)
}

function currentPoses() {
  if (!editing.value && state.recording) {
    const rec = state.recording
    return { sys: rec.system, poses: computePoses(rec.system.model, frameState(rec, state.frame)) }
  }
  const es = editSystem()
  return es ? { sys: es.sys, poses: computePoses(es.sys.model, es.X) } : null
}

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

let drag: null | { kind: 'pan' | 'move'; start: { x: number; y: number }; last: { x: number; y: number }; snapshot?: string; moved: boolean; sx: number; sy: number } = null

function onDown(e: MouseEvent) {
  const p = worldOf(e)
  if (e.button === 1 || e.button === 2 || state.tool === 'pan' || (e.button === 0 && spaceDown)) {
    drag = { kind: 'pan', start: p, last: { x: e.clientX, y: e.clientY }, moved: false, sx: e.clientX, sy: e.clientY }
    return
  }
  if (e.button !== 0) return
  const cp = currentPoses()
  if (!cp) return
  const tol = 8 / cam.value.ppm
  const tool = state.tool
  if (tool.startsWith('add-') && tool !== 'add-force') {
    if (!editing.value) { state.recording && markStale() }
    let id: string | null = null
    edit(scene => { id = placeObject(scene, cp.sys, cp.poses, tool, p) })
    if (id) state.selection = { kind: tool === 'add-pulley' ? 'pulley' : 'body', id }
    if (!e.shiftKey) state.tool = 'select'
    state.rightTab = 'inspect'
    return
  }
  if (tool === 'add-force') {
    let id: string | null = null
    edit(scene => { id = createForce(scene, cp.sys, cp.poses, p) })
    if (id) { state.selection = { kind: 'connector', id }; state.rightTab = 'inspect' }
    if (!e.shiftKey) state.tool = 'select'
    return
  }
  if (tool === 'connect-hinge') {
    let id: string | null = null
    edit(scene => { id = createHinge(scene, cp.sys, cp.poses, p) })
    if (id) { state.selection = { kind: 'connector', id }; state.rightTab = 'inspect' }
    if (!e.shiftKey) state.tool = 'select'
    return
  }
  if (tool === 'connect-rope' || tool === 'connect-rod' || tool === 'connect-spring') {
    const pending = state.pendingConnector
    if (tool === 'connect-rope' && pending) {
      const hit = hitTest(cp.sys, cp.poses, p, tol)
      if (hit?.kind === 'pulley' && !pending.pulleys.some(q => q.pulley === hit.id)) { pending.pulleys.push({ pulley: hit.id, wrap: 'cw' }); requestDraw(); return }
    }
    const anc = anchorFor(cp.sys, cp.poses, p, 10 / cam.value.ppm)
    if (!pending) { state.pendingConnector = { tool, first: anc, pulleys: [] }; return }
    // finish: wrap directions from the polyline
    const pts = [pending.first.world, ...pending.pulleys.map(q => state.scene.pulleys.find(x => x.id === q.pulley)!.position), anc.world]
    const pulleys = pending.pulleys.map((q, i) => ({ pulley: q.pulley, wrap: wrapAt(pts[i], pts[i + 1], pts[i + 2]) }))
    let id: string | null = null
    edit(scene => { id = createConnector(scene, tool, pending.first, anc, pulleys) })
    state.pendingConnector = null
    if (id) { state.selection = { kind: 'connector', id }; state.rightTab = 'inspect' }
    if (!e.shiftKey) state.tool = 'select'
    return
  }
  // select / move
  const hit = hitTest(cp.sys, cp.poses, p, tol)
  state.selection = hit
  // during playback a click on a moving body is a request for its readings
  if (!editing.value && hit?.kind === 'body' && state.rightTab === 'inspect' && cp.sys.model.byId.get(hit.id)?.dynamic) state.rightTab = 'watch'
  if (hit && (hit.kind === 'body' || hit.kind === 'pulley') && (editing.value || state.frame === 0)) {
    drag = { kind: 'move', start: p, last: p, snapshot: serializeScene(state.scene), moved: false, sx: e.clientX, sy: e.clientY }
  }
}

let spaceDown = false
function onKey(e: KeyboardEvent) { if (e.code === 'Space' && (e.target as HTMLElement).tagName !== 'INPUT') spaceDown = e.type === 'keydown' }
window.addEventListener('keydown', onKey)
window.addEventListener('keyup', onKey)
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey) })

function onMove(e: MouseEvent) {
  const p = worldOf(e)
  cursorWorld.value = p
  if (drag?.kind === 'pan') {
    const dx = e.clientX - drag.last.x, dy = e.clientY - drag.last.y
    drag.last = { x: e.clientX, y: e.clientY }
    cam.value = { ...cam.value, cx: cam.value.cx - dx / cam.value.ppm, cy: cam.value.cy + dy / cam.value.ppm }
    requestDraw()
    return
  }
  if (drag?.kind === 'move') {
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return
    drag.moved = true
    const dx = p.x - drag.last.x, dy = p.y - drag.last.y
    drag.last = p
    moveObject(state.scene, state.selection, dx, dy)
    state.stale = true
    state.playing = false
    requestDraw()
    return
  }
  if (state.pendingConnector) requestDraw()
  const cp = currentPoses()
  if (cp) {
    const h = hitTest(cp.sys, cp.poses, p, 8 / cam.value.ppm)
    const id = h?.id ?? null
    if (id !== hover.value) hover.value = id
  }
}

function onUp() {
  if (drag?.kind === 'move' && drag.moved && drag.snapshot) {
    state.past.push(drag.snapshot)
    state.future = []
    state.dirty = true
    markStale()
  }
  drag = null
}

function onLeave() { hover.value = null; cursorWorld.value = null; onUp() }

const timeText = computed(() => {
  if (editing.value) return null
  return `t = ${currentTime().toFixed(Math.max(3, Math.min(6, state.digits - 1)))} s`
})

const toolHint = computed(() => {
  switch (state.tool) {
    case 'connect-rope': return state.pendingConnector ? '点击滑轮让绳绕过，再点击另一物体或空白处（固定点）完成' : '点击物体（靠近中心吸附到质心）或空白处作为绳的一端'
    case 'connect-rod': return state.pendingConnector ? '点击另一端' : '点击轻杆的一端'
    case 'connect-spring': return state.pendingConnector ? '点击弹簧另一端（物体或固定点）' : '点击弹簧的一端'
    case 'connect-hinge': return '点击物体上的转轴位置（与重叠的物体铰接，否则固定在世界中）'
    case 'add-force': return '点击物体上的作用点添加恒力'
    case 'pan': return '拖动平移视图'
    case 'select': return ''
    default: return '点击放置（靠近表面时自动贴合）；按住 Shift 连续放置'
  }
})
</script>

<template>
  <div ref="host" class="viewport" :class="{ crosshair: state.tool !== 'select' && state.tool !== 'pan', grab: state.tool === 'pan' }">
    <canvas ref="canvas" @wheel="onWheel" @mousedown="onDown" @mousemove="onMove" @mouseup="onUp" @mouseleave="onLeave" @contextmenu.prevent />
    <div class="overlay top-left">
      <span v-if="timeText" class="time mono">{{ timeText }}</span>
      <span v-if="editing" class="badge warn">编辑中{{ state.recording ? ' · 结果已过期' : '' }}</span>
      <span v-if="state.computing" class="badge info">计算中…</span>
      <span v-if="state.simError" class="badge bad" :title="state.simError">{{ state.simError }}</span>
    </div>
    <div v-if="toolHint" class="overlay hint small">{{ toolHint }}</div>
    <div class="overlay bottom-right">
      <button class="btn ghost small" title="缩放到运动范围" @click="fitView">适合视图</button>
    </div>
  </div>
</template>

<style scoped>
.viewport { position: relative; width: 100%; height: 100%; overflow: hidden; border-radius: var(--radius-pane); background: var(--canvas-bg); box-shadow: var(--shadow); }
.viewport.crosshair canvas { cursor: crosshair; }
.viewport.grab canvas { cursor: grab; }
canvas { display: block; }
.overlay { position: absolute; display: flex; gap: 6px; align-items: center; pointer-events: none; }
.overlay > * { pointer-events: auto; }
.top-left { top: 10px; left: 12px; }
.bottom-right { bottom: 8px; right: 8px; }
.hint { top: 10px; left: 50%; transform: translateX(-50%); background: var(--pane); padding: 4px 10px; border-radius: 999px; box-shadow: var(--shadow); color: var(--text-2); }
.time { font-size: 15px; font-weight: 600; background: var(--pane); padding: 2px 10px; border-radius: 8px; box-shadow: var(--shadow); }
</style>
