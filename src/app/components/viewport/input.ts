/**
 * The DOM events of the viewport: mouse and touch on the canvas (they drive the tools of tools.ts and the camera),
 * and the keyboard of the studio (clipboard, nudging, Escape, the tool keys).
 */
import { ref } from 'vue'
import { state, edit } from '../../store'
import { editor, clearDrafts } from '../../editor/editorState'
import { viewStatus } from '../../viewStatus'
import type { Pt } from '../../editor/geometry'
import { snapPoint, snapStep } from '../../editor/snap'
import { placeMoved } from '../../editor/annotations'
import { copySelection, deleteSelection, duplicateSelection, nudgeSelection, paste } from '../../editor/commands'
import type { PointerInput, ViewportCore } from './state'
import type { Painter } from './draw'
import type { Tools } from './tools'

/** A key event that goes to a text field is not a shortcut. */
function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  if (!t) return false
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable
}

/** Tool shortcuts (no modifier). V (select) is handled by the app. */
const TOOL_KEYS: Record<string, typeof state.tool> = {
  h: 'pan', b: 'add-block', o: 'add-ball', c: 'add-disc', p: 'add-polygon', g: 'add-ground', i: 'add-incline', w: 'add-wall',
  m: 'measure-ruler', a: 'measure-angle', t: 'annotate-text', l: 'annotate-arrow'
}

export function useInput(vp: ViewportCore, painter: Painter, tools: Tools, openMenu: (e: PointerInput) => void) {
  const cam = vp.cam
  const { requestDraw, visible } = painter
  const { onDown, onMove, onUp, onDblClick } = tools

  // 26.60 (issue 3): a drag that leaves the canvas (over the sidebar, the timeline or out of the window) keeps going;
  // it used to end at the edge, so a quick move dropped the body short of where the pointer went.
  let windowDrag = false
  function onWindowMove(e: MouseEvent) { if (e.target !== vp.canvas.value) onMove(e) }
  function onWindowUp(e: MouseEvent) {
    endWindowDrag()
    if (e.target !== vp.canvas.value && vp.drag) onUp(e)
  }
  function beginWindowDrag() {
    if (windowDrag || !vp.drag || vp.drag.kind === 'right') return
    windowDrag = true
    window.addEventListener('mousemove', onWindowMove)
    window.addEventListener('mouseup', onWindowUp)
  }
  function endWindowDrag() {
    if (!windowDrag) return
    windowDrag = false
    window.removeEventListener('mousemove', onWindowMove)
    window.removeEventListener('mouseup', onWindowUp)
  }
  function onMouseDown(e: MouseEvent) {
    onDown(e)
    beginWindowDrag()
  }

  function onLeave() {
    vp.hover.value = null
    vp.hotHandle.value = null
    if (vp.studio.value) viewStatus.cursor = null
    const d = vp.drag
    // A drag with the window listeners keeps going outside the canvas (26.60); the context menu needs a release inside
    if (d && d.kind !== 'right' && windowDrag) { requestDraw(); return }
    vp.snapGuides.value = []
    vp.cursorWorld.value = null
    vp.snapMark.value = null
    if (d && d.kind !== 'right') onUp(new MouseEvent('mouseup'))
    vp.drag = null
    requestDraw()
  }

  // ---- Touch (26.55, D42/D43 carried over): one finger works like the mouse (a drag on empty space pans), two
  // fingers pinch-zoom and pan, a long press opens the context menu, a double tap is a double click ----
  const fakeMouse = (x: number, y: number): MouseEvent => ({ clientX: x, clientY: y, button: 0, buttons: 1, altKey: false, shiftKey: false, ctrlKey: false, metaKey: false, detail: 1, preventDefault() {}, stopPropagation() {} }) as unknown as MouseEvent
  let pinch: { d0: number; ppm0: number; world: Pt } | null = null
  let longPress: ReturnType<typeof setTimeout> | null = null
  let touchStart: { x: number; y: number } | null = null
  let lastTap = 0
  function stopLongPress() { if (longPress) { clearTimeout(longPress); longPress = null } }
  function onTouchStart(e: TouchEvent) {
    e.preventDefault()
    stopLongPress()
    if (e.touches.length === 1) {
      const t = e.touches[0]
      touchStart = { x: t.clientX, y: t.clientY }
      const now = performance.now()
      if (now - lastTap < 320) { lastTap = 0; onDblClick(fakeMouse(t.clientX, t.clientY)); return }
      lastTap = now
      onDown(fakeMouse(t.clientX, t.clientY))
      // nothing picked up: the finger pans the view
      if (!vp.drag && (state.tool === 'select' || state.tool === 'pan' || !vp.studio.value)) vp.drag = { kind: 'pan', lastX: t.clientX, lastY: t.clientY }
      longPress = setTimeout(() => {
        longPress = null
        if (!vp.studio.value) return
        const d = vp.drag
        if (d && 'moved' in d && d.moved) return
        vp.drag = null
        openMenu(fakeMouse(t.clientX, t.clientY))
      }, 550)
      return
    }
    // a second finger: drop the one-finger gesture (a move in progress goes back) and start pinching
    const d = vp.drag
    vp.drag = null
    if (d && (d.kind === 'move' || d.kind === 'handle' || d.kind === 'region') && d.moved) vp.restoreSnapshot(d.snapshot)
    const [a, b] = [e.touches[0], e.touches[1]]
    pinch = { d0: Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)), ppm0: cam.value.ppm, world: vp.worldOf(fakeMouse((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2)) }
    vp.refitAt = 0
  }
  function onTouchMove(e: TouchEvent) {
    e.preventDefault()
    if (pinch && e.touches.length >= 2) {
      const [a, b] = [e.touches[0], e.touches[1]]
      const ppm = Math.min(5000, Math.max(5, (pinch.ppm0 * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)) / pinch.d0))
      cam.value = { ...cam.value, ppm }
      // the world point first under the fingers stays under their midpoint (zoom and pan in one)
      const after = vp.worldOf(fakeMouse((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2))
      cam.value = { ...cam.value, cx: cam.value.cx + pinch.world.x - after.x, cy: cam.value.cy + pinch.world.y - after.y }
      requestDraw()
      return
    }
    if (e.touches.length !== 1) return
    const t = e.touches[0]
    if (touchStart && Math.hypot(t.clientX - touchStart.x, t.clientY - touchStart.y) > 8) stopLongPress()
    const d = vp.drag
    if (d && d.kind === 'pan') {
      cam.value = { ...cam.value, cx: cam.value.cx - (t.clientX - d.lastX) / cam.value.ppm, cy: cam.value.cy + (t.clientY - d.lastY) / cam.value.ppm }
      d.lastX = t.clientX; d.lastY = t.clientY
      vp.refitAt = 0
      requestDraw()
      return
    }
    onMove(fakeMouse(t.clientX, t.clientY))
  }
  function onTouchEnd(e: TouchEvent) {
    e.preventDefault()
    stopLongPress()
    if (pinch) { if (e.touches.length < 2) pinch = null; return }
    const t = e.changedTouches[0]
    if (t && vp.drag) onUp(fakeMouse(t.clientX, t.clientY))
  }

  // ---- Keyboard ----
  function onSpace(e: KeyboardEvent) { if (e.code === 'Space' && !typing(e)) vp.spaceDown = e.type === 'keydown' }
  function onAltUp(e: KeyboardEvent) { if (e.key === 'Alt') { vp.altDown = false; if (vp.snapMark.value) requestDraw() } }

  /** The canvas was reached with the Tab key (shows the focus ring; a click does not, 26.60). */
  const kbdFocus = ref(false)
  let lastTab = 0
  function onCanvasFocus() { kbdFocus.value = performance.now() - lastTab < 300 }
  function onTabKey(e: KeyboardEvent) { if (e.key === 'Tab') lastTab = performance.now() }

  let lastNudge = 0
  let lastNudgeId = ''

  function onKeyCapture(e: KeyboardEvent) {
    if (!vp.studio.value || !visible() || typing(e) || editor.menu || editor.textInput || state.tourStep !== null) return
    const mod = e.ctrlKey || e.metaKey
    const k = e.key
    const lower = k.length === 1 ? k.toLowerCase() : k
    const stop = () => { e.preventDefault(); e.stopPropagation() }
    const offset = snapStep(cam.value.ppm) * 2
    if (mod && !e.altKey) {
      if (lower === 'c' && !e.shiftKey) { if (copySelection()) stop(); return }
      if (lower === 'v' && !e.shiftKey) { stop(); const cw = vp.cursorWorld.value; paste(cw ? snapPoint(cw, cam.value.ppm, false) : null, offset); return }
      if (lower === 'd' && !e.shiftKey) { stop(); duplicateSelection(offset); return }
      return
    }
    if (k.startsWith('Arrow')) {
      const sel = state.selection
      const id = editor.annotationId ?? sel?.id ?? ''
      const isObj = sel?.kind === 'body' || sel?.kind === 'pulley'
      // Nudging continues across the automatic re-run that follows each nudge
      const recent = performance.now() - lastNudge < 1500 && lastNudgeId === id && state.frame === 0 && !state.playing
      if (!(editor.annotationId || (isObj && (vp.editing.value || recent)))) return
      stop()
      const s = snapStep(cam.value.ppm) * (e.shiftKey ? 10 : 1)
      const dx = k === 'ArrowLeft' ? -s : k === 'ArrowRight' ? s : 0
      const dy = k === 'ArrowDown' ? -s : k === 'ArrowUp' ? s : 0
      if (nudgeSelection(dx, dy)) { lastNudge = performance.now(); lastNudgeId = id }
      return
    }
    if (k === 'Escape') {
      const d = vp.drag
      const busy = editor.polyDraft.length > 0 || editor.angleDraft.length > 0 || editor.combineDraft.length > 0 || (d !== null && d.kind !== 'pan')
      vp.drag = null
      vp.snapMark.value = null
      if (d && (d.kind === 'move' || d.kind === 'handle' || d.kind === 'region') && d.moved) vp.restoreSnapshot(d.snapshot)
      else if (d && d.kind === 'annot-move' && d.moved) { const a = state.scene.annotations.find(x => x.id === d.id); if (a) placeMoved(a, d.orig, 0, 0) }
      if (busy) { clearDrafts(); stop() }
      requestDraw()
      return
    }
    if (k === 'Enter' && state.tool === 'add-polygon' && editor.polyDraft.length) { stop(); tools.closePolygon(); return }
    if (k === 'Enter' && state.tool === 'shape-combine' && editor.combineDraft.length) { stop(); tools.finishCombine(); return }
    if (k === 'Backspace' && state.tool === 'add-polygon' && editor.polyDraft.length) { stop(); editor.polyDraft.pop(); return }
    if ((k === 'Delete' || k === 'Backspace') && editor.annotationId && !state.selection) { stop(); deleteSelection(); return }
    if ((k === 'Delete' || k === 'Backspace') && editor.regionId && !state.selection && vp.editing.value) {
      stop()
      const id = editor.regionId
      edit(sc => { sc.settings.regions = (sc.settings.regions ?? []).filter(r => r.id !== id); if (!sc.settings.regions.length) delete sc.settings.regions })
      editor.regionId = null
      return
    }
    if (!e.altKey && !e.shiftKey && TOOL_KEYS[lower]) {
      stop()
      state.tool = TOOL_KEYS[lower]
      state.pendingConnector = null
    }
  }

  /** Listen to the window's keys (the component is mounted). */
  function attach() {
    window.addEventListener('keydown', onKeyCapture, true)
    window.addEventListener('keydown', onTabKey, true)
    window.addEventListener('keydown', onSpace)
    window.addEventListener('keyup', onSpace)
    window.addEventListener('keyup', onAltUp)
  }
  /** Stop listening (the component is unmounted). */
  function detach() {
    window.removeEventListener('keydown', onKeyCapture, true)
    window.removeEventListener('keydown', onTabKey, true)
    window.removeEventListener('keydown', onSpace)
    window.removeEventListener('keyup', onSpace)
    window.removeEventListener('keyup', onAltUp)
    endWindowDrag()
  }

  return { onMouseDown, onMove, onUp, onLeave, onDblClick, onTouchStart, onTouchMove, onTouchEnd, onCanvasFocus, kbdFocus, attach, detach }
}
