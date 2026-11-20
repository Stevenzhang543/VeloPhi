/**
 * The camera of the viewport: the size of the canvas, fitting the view to where things happen, short glides between
 * views, zoom about the pointer, and the part of a phone's canvas a sheet covers.
 */
import { computed, watch } from 'vue'
import { state } from '../../store'
import { settings } from '../../settings'
import { posesAt, positions } from '../../../engine/views'
import { connectorAnchors, usesSoftStep } from '../../../core/scene/types'
import type { Camera } from '../../../render/renderer'
import { histogramOf } from '../../../render/manybody'
import { outlineWorld, pulleyWorld } from '../../editor/geometry'
import { SHEET_STOPS, landscape, phone, shell } from '../../layout'
import { canvasDpr } from '../../../platform/device'
import { viewStatus } from '../../viewStatus'
import type { ViewportCore } from './state'
import type { Painter } from './draw'

export interface CameraControl {
  /** Take the size of the host box (does nothing while the page is hidden). */
  resize(): void
  /** Fit the view to where things happen. */
  fitView(animate?: boolean): void
  /** Move the camera to `target` in a short glide. */
  glideTo(target: Camera, ms?: number): void
  /** Stop a glide in progress (the pointer takes over). */
  stopGlide(): void
  /** Fit again once the recording reaches `vp.refitAt`. */
  maybeRefit(): void
  /** Zoom about the pointer by a wheel step. */
  wheelZoom(e: WheelEvent): void
}

export function useCamera(vp: ViewportCore, painter: Painter): CameraControl {
  const cam = vp.cam
  const { requestDraw, visible } = painter

  /**
   * 26.60 r2: the height of the canvas a phone sheet covers (px; none at full height, where the canvas is hidden). The
   * view keeps the scene in the part left above the sheet: opening or resizing a sheet pans by half the change.
   */
  const sheetCover = computed(() => (phone.value && !landscape.value && shell.sheet && shell.sheetSize < 3 ? SHEET_STOPS[shell.sheetSize] * cam.value.height : 0))
  watch(sheetCover, (now, before) => {
    const d = now - (before ?? 0)
    if (!d || !(cam.value.ppm > 0) || !Number.isFinite(d)) return
    // A view the user has not moved since it was fitted is fitted again (to the room left); else it only pans
    const c = cam.value, f = lastFit
    if (f && Math.abs(c.cx - f.cx) < 1e-9 && Math.abs(c.cy - f.cy) < 1e-9 && Math.abs(c.ppm - f.ppm) < 1e-9) { fitView(); return }
    cam.value = { ...cam.value, cy: cam.value.cy - d / 2 / cam.value.ppm }
    requestDraw()
  })
  /** The camera as the last fit left it. */
  let lastFit: { cx: number; cy: number; ppm: number } | null = null

  let fittedVisible = false
  function resize() {
    const h = vp.host.value, c = vp.canvas.value
    if (!h || !c || !vp.pageActive.value) { vp.hostW = vp.hostH = 0; return } // Resized again when the page is shown
    const r = h.getBoundingClientRect()
    vp.hostW = r.width; vp.hostH = r.height
    if (r.width < 1 || r.height < 1) return // Hidden: keep the last size, draw nothing
    const dpr = canvasDpr()
    c.width = Math.max(1, Math.round(r.width * dpr))
    c.height = Math.max(1, Math.round(r.height * dpr))
    c.style.width = `${r.width}px`
    c.style.height = `${r.height}px`
    cam.value = { ...cam.value, width: r.width, height: r.height }
    // Floating controls over the bottom of the canvas (the timeline bar of the studio, D205)
    const cs = getComputedStyle(h)
    vp.floatBottom = parseFloat(cs.getPropertyValue('--float-bottom')) || 0
    vp.floatLeft = parseFloat(cs.getPropertyValue('--float-left')) || 0
    if (!fittedVisible) { fittedVisible = true; fitView() }
    requestDraw()
  }

  /**
   * 26.63 (D233): move the camera to `target` in a short glide (centre linearly, zoom geometrically), so a fit or a
   * zoom step reads as one motion of the same picture. Without interface animations it jumps.
   */
  let glide = 0
  function glideTo(target: Camera, ms = 240) {
    cancelAnimationFrame(glide)
    const from = cam.value
    const calm = !settings.ui.motion || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
    if (calm || !visible() || !(from.ppm > 0) || !(target.ppm > 0)) { cam.value = target; requestDraw(); return }
    const t0 = performance.now(), l0 = Math.log(from.ppm), l1 = Math.log(target.ppm)
    const step = (now: number) => {
      const u = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - u, 3)
      cam.value = { ...cam.value, cx: from.cx + (target.cx - from.cx) * e, cy: from.cy + (target.cy - from.cy) * e, ppm: Math.exp(l0 + (l1 - l0) * e) }
      requestDraw()
      if (u < 1) glide = requestAnimationFrame(step)
    }
    glide = requestAnimationFrame(step)
  }
  function stopGlide() { cancelAnimationFrame(glide) }

  /**
   * Fit the view to where things happen: every recorded position of the moving bodies (or their initial
   * positions before a run), pulleys and fixed anchors, with a margin.
   */
  function fitView(animate = false) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    const grow = (x: number, y: number, r = 0) => { minX = Math.min(minX, x - r); maxX = Math.max(maxX, x + r); minY = Math.min(minY, y - r); maxY = Math.max(maxY, y + r) }
    const rec = state.recording
    if (rec && !state.stale) {
      // An unbounded run can go anywhere (a body falling off a table falls for ever): fit the first part of the
      // motion — the scene's former duration — rather than everything computed so far
      const last = rec.unbounded ? Math.min(rec.frameCount - 1, Math.round(Math.max(1, state.scene.settings.legacyDuration ?? 3) / rec.dt)) : rec.frameCount - 1
      const stride = Math.max(1, Math.floor((last + 1) / 300))
      const got = positions(rec, 0, last + 1, stride)
      const lastPoses = posesAt(rec, { frames: [last] })[0]
      for (const b of rec.system.model.dynamic) {
        for (let p = 0; p < got.frames.length; p++) grow(got.xy[2 * (p * got.n + b.index)], got.xy[2 * (p * got.n + b.index) + 1], b.bound)
        if (lastPoses) grow(lastPoses[b.global].x, lastPoses[b.global].y, b.bound)
      }
    } else {
      for (const b of state.scene.bodies) if (b.kind !== 'static') grow(b.position.x, b.position.y, b.shape.type === 'circle' ? b.shape.radius : b.shape.type === 'box' ? Math.hypot(b.shape.width, b.shape.height) / 2 : 0.3)
    }
    // 26.58 (D146): a many-body scene is fitted with its container — walls, pegs, funnel — not only the moving bodies
    const many = usesSoftStep(state.scene)
    if (many) {
      for (const b of state.scene.bodies) {
        // the ground is left out: it reaches further than anything happens on it
        if (b.kind !== 'static' || b.role === 'ground') continue
        const sh = b.shape
        if (sh.type === 'circle') grow(b.position.x, b.position.y, sh.radius)
        else if (sh.type === 'box') {
          // the box's own extent (a tall thin wall must not widen the view by its height)
          const c = Math.abs(Math.cos(b.angle)), sn = Math.abs(Math.sin(b.angle))
          const hx = (c * sh.width + sn * sh.height) / 2, hy = (sn * sh.width + c * sh.height) / 2
          grow(b.position.x - hx, b.position.y - hy); grow(b.position.x + hx, b.position.y + hy)
        }
        else if (sh.type === 'polygon') {
          const c = Math.cos(b.angle), sn = Math.sin(b.angle)
          for (const q of sh.points) grow(b.position.x + c * q.x - sn * q.y, b.position.y + sn * q.x + c * q.y)
        }
      }
    }
    // 26.60 r2: the fixed bodies the motion happens on or next to (an incline, a track, steps) are shown too, as far as
    // they reach near the motion — not grounds, which reach much further than anything happens on them
    if (!many && Number.isFinite(minX)) {
      const m = Math.max(1, 0.5 * Math.max(maxX - minX, maxY - minY))
      const ex0 = minX - m, ex1 = maxX + m, ey0 = minY - m, ey1 = maxY + m
      const near: Array<[number, number, number, number]> = []
      for (const b of state.scene.bodies) {
        if (b.kind !== 'static' || b.role === 'ground') continue
        let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity
        try {
          for (const o of outlineWorld(b)) for (const q of o.kind === 'poly' ? o.pts : [{ x: o.c.x - o.r, y: o.c.y - o.r }, { x: o.c.x + o.r, y: o.c.y + o.r }]) { bx0 = Math.min(bx0, q.x); bx1 = Math.max(bx1, q.x); by0 = Math.min(by0, q.y); by1 = Math.max(by1, q.y) }
        } catch { continue }
        if (bx1 < ex0 || bx0 > ex1 || by1 < ey0 || by0 > ey1) continue
        near.push([Math.max(bx0, ex0), Math.max(by0, ey0), Math.min(bx1, ex1), Math.min(by1, ey1)])
      }
      for (const [a, b, c, d] of near) { grow(a, b); grow(c, d) }
    }
    for (const p of state.scene.pulleys) {
      const carrier = p.body && rec && !state.stale ? rec.system.model.byId.get(p.body) : null
      if (carrier && carrier.dynamic) {
        // A movable pulley goes wherever its body goes
        const reach = Math.hypot(p.position.x, p.position.y) + p.radius
        const lastK = rec!.unbounded ? Math.min(rec!.frameCount - 1, Math.round(Math.max(1, state.scene.settings.legacyDuration ?? 3) / rec!.dt)) : rec!.frameCount - 1
        const stride = Math.max(1, Math.floor((lastK + 1) / 300))
        const got = positions(rec!, 0, lastK + 1, stride)
        for (let q = 0; q < got.frames.length; q++) grow(got.xy[2 * (q * got.n + carrier.index)], got.xy[2 * (q * got.n + carrier.index) + 1], reach)
      } else { const c = pulleyWorld(state.scene, p); grow(c.x, c.y, p.radius) }
    }
    for (const c of state.scene.connectors) for (const a of connectorAnchors(c)) if (!a.body) grow(a.local.x, a.local.y)
    // 26.55: field regions and liquids (not the ones that only stand for "everywhere")
    for (const r of state.scene.settings.regions ?? []) {
      const hw = r.shape === 'circle' ? (r.r ?? 1) : (r.w ?? 1) / 2, hh = r.shape === 'circle' ? (r.r ?? 1) : (r.h ?? 1) / 2
      if (hw < 25 && hh < 25) { grow(r.x - hw, r.y - hh); grow(r.x + hw, r.y + hh) }
    }
    if (!Number.isFinite(minX)) {
      const v = state.scene.view
      cam.value = { ...cam.value, cx: v.center.x, cy: v.center.y, ppm: v.pixelsPerMeter }
      requestDraw()
      return
    }
    // Keep a little of the supporting surface in view
    minY -= 0.15 * Math.max(0.5, maxY - minY)
    // 26.57: a body that stays (nearly) at rest still shows enough of its support to read the slope and the scale
    const w = Math.max(1.5, maxX - minX), h = Math.max(1, maxY - minY)
    // 26.58 (D146): the Galton histogram is drawn under the board in screen pixels (40–140 px, three bin widths, and
    // its caption): leave that much room below
    const hist = many ? histogramOf(state.scene) : null
    // 26.60 r2: on a phone the part under an open sheet does not count; the scene goes in the middle of the rest
    const cover = sheetCover.value
    const fit = (reserve: number) => Math.max(10, Math.min(2000, Math.min((cam.value.width * 0.8) / w, ((cam.value.height - cover) * (hist ? 0.9 : 0.72) - reserve) / h)))
    let ppm = fit(0), reserve = 0
    if (hist) for (let k = 0; k < 2; k++) { reserve = Math.max(40, Math.min(140, 3 * hist.binWidth * ppm)) + 44; ppm = fit(reserve) }
    const target = { ...cam.value, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 - (reserve + cover) / 2 / ppm, ppm }
    lastFit = { cx: target.cx, cy: target.cy, ppm }
    if (animate) glideTo(target)
    else { cancelAnimationFrame(glide); cam.value = target; requestDraw() }
  }

  function maybeRefit() {
    const rec = state.recording
    if (vp.refitAt <= 0 || !rec || state.stale || !visible()) return
    if ((rec.frameCount - 1) * rec.dt + 1e-9 < vp.refitAt && !rec.completed) return
    vp.refitAt = 0
    fitView()
  }

  function wheelZoom(e: WheelEvent) {
    e.preventDefault()
    cancelAnimationFrame(glide)
    vp.refitAt = 0
    const before = vp.worldOf(e)
    const f = Math.exp(-e.deltaY * 0.0015)
    const ppm = Math.min(5000, Math.max(5, cam.value.ppm * f))
    cam.value = { ...cam.value, ppm }
    const after = vp.worldOf(e)
    cam.value = { ...cam.value, cx: cam.value.cx + before.x - after.x, cy: cam.value.cy + before.y - after.y }
    requestDraw()
  }

  return { resize, fitView, glideTo, stopGlide, maybeRefit, wheelZoom }
}

/** 26.63 (D233): the status bar reads the zoom of the studio view and asks for zoom steps. */
export function useStatusZoom(vp: ViewportCore, camera: CameraControl) {
  const cam = vp.cam
  watch(() => cam.value.ppm, v => { if (vp.studio.value) viewStatus.ppm = v }, { immediate: true })
  watch(() => viewStatus.zoom, z => {
    if (!z || !vp.studio.value) return
    viewStatus.zoom = 0
    vp.refitAt = 0
    camera.glideTo({ ...cam.value, ppm: Math.min(5000, Math.max(5, cam.value.ppm * Math.pow(1.25, z))) })
  })
}
