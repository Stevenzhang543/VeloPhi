/**
 * Drawing of the viewport: one draw per animation frame, the recording at the continuous `state.time` through
 * `renderFrame` during playback and the scene's initial state in edit mode, the editor's overlay on top in the studio.
 * A viewport never draws while its page is hidden or its host has no size.
 */
import { toRaw } from 'vue'
import { tl } from '../../../i18n'
import { state, viewCamera, problemLocked } from '../../store'
import { settings, effectiveEffects } from '../../settings'
import { DARK, LIGHT, applyCanvasTokens, drawScene, setBottomInset } from '../../../render/renderer'
import type { FrameEffects } from '../../../render/frame'
import { DEFAULT_STYLE, PROJECTOR_STYLE, crowded, renderFrame } from '../../../render/frame'
import { drawManyBody } from '../../../render/manybody'
import type { ManyBodyText } from '../../../render/manybody'
import type { EditorOverlay } from '../../../render/overlay'
import { drawEditorOverlay } from '../../../render/overlay'
import { editor } from '../../editor/editorState'
import { canvasDpr } from '../../../platform/device'
import type { ViewportCore } from './state'

/** Width at the top right of the studio canvas taken by the floating "fit view" button (28 px, 8 px from the edge). */
const FIT_BUTTON_RESERVE = 44

/**
 * 26.65 (D7): the canvas colours that are tokens (tokens.css `--canvas-…`) are read from the document for the theme
 * shown, once per change of theme or root classes.
 */
let tokenKey = ''
function syncCanvasTokens() {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return
  const root = document.documentElement
  const theme = root.getAttribute('data-theme') ?? ''
  const key = `${theme}|${root.className}`
  if (key === tokenKey) return
  tokenKey = key
  const cs = getComputedStyle(root)
  // the computed values are those of the theme on the root, so they go to that theme's palette
  applyCanvasTokens(theme === 'dark', name => cs.getPropertyValue(name))
}

const MANY_TEXT: ManyBodyText = {
  readout: (n, moving, contacts) => tl('实时多体 · {0} 个物体 · 运动 {1} · 接触点 {2}', [n, moving, contacts]),
  histogram: (n, rows) => tl('各格计数（柱）与二项分布 B({0}, ½) 的期望（点）· 共 {1} 个小球', [rows, n])
}

export interface Painter {
  /** Ask for a draw at the next animation frame (requests are coalesced; a pending one is never cancelled). */
  requestDraw(): void
  /** The viewport is on the shown page and has a size. */
  visible(): boolean
  /** A new recording: visual effects are tried again. */
  resetEffects(): void
  /** Unmounting: nothing left to draw. */
  stop(): void
}

export function useDraw(vp: ViewportCore, buildOverlay: () => EditorOverlay): Painter {
  // One draw per animation frame. A pending request is kept, never cancelled: cancelling and re-requesting on
  // every state change starved the canvas while playback changed the time on each tick.
  let raf = 0
  function requestDraw() {
    if (raf) return
    raf = requestAnimationFrame(() => { raf = 0; draw() })
  }

  function visible(): boolean {
    return vp.pageActive.value && vp.hostW >= 1 && vp.hostH >= 1
  }

  let lastError = 0
  let effectsBroken = false
  function draw() {
    const c = vp.canvas.value
    if (!c || !visible()) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    // 26.65 (D5): in the studio the "fit view" button floats at the top right (Viewport.vue): the field legend keeps
    // left of it
    setBottomInset(vp.floatBottom, vp.floatLeft, vp.studio.value ? FIT_BUTTON_RESERVE : 0)
    syncCanvasTokens()
    try {
      paint(ctx)
    } catch (err) {
      // A failing visual effect must never leave the canvas blank: draw again without effects
      if (performance.now() - lastError > 2000) { console.error('[viewport] draw failed', err); lastError = performance.now() }
      if (!effectsBroken) { effectsBroken = true; try { paint(ctx) } catch { /* Reported above */ } }
    } finally {
      // the insets belong to this viewport's floating controls: an export drawn afterwards starts without them
      setBottomInset(0, 0, 0)
    }
  }

  function paint(ctx: CanvasRenderingContext2D) {
    const cam = vp.cam
    const dpr = canvasDpr()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const palette = state.theme === 'dark' ? DARK : LIGHT
    Object.assign(viewCamera, cam.value)
    const style = settings.projector ? PROJECTOR_STYLE : DEFAULT_STYLE
    // 26.55 (D97): the renderer only reads; plain objects spare it Vue's reactive proxies on every property access
    const units = toRaw(settings.units)
    const display = toRaw(state.display)
    const pending = state.pendingConnector
    const pendingDraw = pending && vp.studio.value ? { world: pending.first.world, cursor: vp.cursorWorld.value, pulleys: pending.pulleys.map(p => vp.pulleyNow(p.pulley) ?? pending.first.world) } : null
    const annotations = toRaw(state.scene.annotations)
    if (!vp.editing.value && state.recording) {
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
      const drawn = renderFrame(ctx, cam.value, {
        // While a problem is answered, forces, accelerations, trajectories and key moments are not drawn (26.52)
        rec, time: state.time, options: problemLocked() ? { ...display, forces: false, forcesAll: false, acceleration: false, trajectory: false, labels: false, strobe: false } : display, palette, digits: state.digits, scales: vp.currentScales(), trajectories: vp.trajectories.value,
        selectedId: state.selection?.id ?? null, hoverId: vp.hover.value, effects: fx, annotations, selectedAnnotation: editor.annotationId, units, style,
        // 26.53 (D72): what a hovered formula card or known variable refers to
        highlight: state.rightTab === 'formula' && !problemLocked() ? toRaw(state.formulaHighlight) : null
      })
      // 26.58 (D133, D142): Galton histogram, contact points and the many-body readout
      drawManyBody(ctx, cam.value, { rec, view: drawn, scene: rec.scene, palette, show: display.manyBody !== false, text: MANY_TEXT })
    } else {
      const es = vp.editSystem()
      if (!es) { ctx.fillStyle = palette.bg; ctx.fillRect(0, 0, cam.value.width, cam.value.height); return }
      drawScene(ctx, cam.value, {
        sys: es.sys, view: es.view, rec: null, frame: 0, time: 0, options: { ...display, forces: false, trajectory: false, acceleration: false },
        selectedId: state.selection?.id ?? null, hoverId: vp.hover.value, palette, scales: vp.currentScales(), trajectories: null,
        editing: true, pending: pendingDraw, digits: state.digits, units, style, annotations, selectedAnnotation: editor.annotationId, selectedRegion: editor.regionId,
        crowd: crowded(state.scene.settings.integrator, es.sys.model.dynamic.length)
      })
    }
    if (vp.studio.value) {
      const ov = buildOverlay()
      if (pendingDraw && !vp.editing.value) {
        const pts = [pendingDraw.world, ...pendingDraw.pulleys, ...(pendingDraw.cursor ? [pendingDraw.cursor] : [])]
        ov.shapes.push({ kind: 'poly', pts, closed: false, dashed: true })
      }
      drawEditorOverlay(ctx, cam.value, ov, palette)
    }
  }

  return {
    requestDraw, visible,
    resetEffects() { effectsBroken = false },
    stop() { if (raf) cancelAnimationFrame(raf); raf = 0 }
  }
}
