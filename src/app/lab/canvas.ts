/**
 * Canvas of a lab experiment (26.54): sizes the canvas to its container and the device pixel ratio, and calls the
 * experiment's draw function — every animation frame while the experiment is shown (`animate`), or when asked
 * (`redraw`) and after a resize. Drawing only; the numbers come from the core.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { state } from '../store'
import type { Palette } from '../../render/renderer'
import { DARK, LIGHT } from '../../render/renderer'

export type LabDraw = (ctx: CanvasRenderingContext2D, w: number, h: number, dt: number, P: Palette) => void

export function useLabCanvas(active: () => boolean, draw: LabDraw, animate: () => boolean = () => false) {
  const canvas = ref<HTMLCanvasElement | null>(null)
  const wrap = ref<HTMLElement | null>(null)
  let raf = 0, last = 0, pending = true
  let ro: ResizeObserver | null = null
  const frame = (now: number) => {
    raf = 0
    const c = canvas.value, box = wrap.value
    if (!c || !box || !active()) { last = 0; return }
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0
    last = now
    const w = box.clientWidth, h = box.clientHeight
    if (w > 0 && h > 0) {
      const dpr = window.devicePixelRatio || 1
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.style.width = `${w}px`; c.style.height = `${h}px` }
      const ctx = c.getContext('2d')!
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const P = state.theme === 'dark' ? DARK : LIGHT
      ctx.fillStyle = P.bg
      ctx.fillRect(0, 0, w, h)
      draw(ctx, w, h, dt, P)
    }
    pending = false
    if (animate()) raf = requestAnimationFrame(frame)
  }
  const redraw = () => { pending = true; if (!raf) raf = requestAnimationFrame(frame) }
  onMounted(() => {
    ro = new ResizeObserver(redraw)
    if (wrap.value) ro.observe(wrap.value)
    redraw()
  })
  onBeforeUnmount(() => { ro?.disconnect(); if (raf) cancelAnimationFrame(raf); raf = 0 })
  watch(active, on => { if (on) { last = 0; redraw() } })
  watch(animate, on => { if (on) redraw() })
  watch(() => state.theme, redraw)
  /** Pointer position in canvas pixels. */
  const at = (e: PointerEvent | MouseEvent): [number, number] => {
    const r = canvas.value!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  return { canvas, wrap, redraw, at, isPending: () => pending }
}
