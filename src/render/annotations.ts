/**
 * Teaching annotations on the canvas: text, arrows, rulers (length and angle to the horizontal) and
 * protractors (angle between two rays). Annotations live in world coordinates in `scene.annotations`;
 * they are drawn in edit mode, during playback and in exported frames, and never affect the simulation.
 * Measured values are printed in the display units of the current render context.
 */
import type { AnnotationDef } from '../core/scene/types'
import type { Camera, Palette } from './renderer'
import { arrow, niceStep, tag, toScreen } from './renderer'
import { FONT, MONO, font, fpx, lw, q } from './style'

type Ann<T extends AnnotationDef['type']> = Extract<AnnotationDef, { type: T }>

/** Default text size of a text annotation (CSS px before the projector factor). */
export const TEXT_SIZE = 16

const noteColor = (P: Palette) => P.note ?? P.accent

/** Acute angle (rad) between the segment a→b and the horizontal. */
export function angleToHorizontal(ax: number, ay: number, bx: number, by: number): number {
  return Math.atan2(Math.abs(by - ay), Math.abs(bx - ax))
}

/** Angle (rad, 0 … π) at `v` between the rays to `a` and `b`. */
export function angleBetween(v: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const ax = a.x - v.x, ay = a.y - v.y, bx = b.x - v.x, by = b.y - v.y
  return Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by))
}

/** Label of a ruler: length and angle to the horizontal in display units. */
export function rulerLabel(a: { x: number; y: number }, b: { x: number; y: number }, digits: number): string {
  const L = Math.hypot(b.x - a.x, b.y - a.y)
  const th = angleToHorizontal(a.x, a.y, b.x, b.y)
  return `${q(L, 'm', Math.min(digits, 4))}  ∠ ${q(th, 'rad', Math.min(digits, 3))}`
}

// ---- Text metrics ----

let measureCtx: CanvasRenderingContext2D | null = null
function measurer(): CanvasRenderingContext2D | null {
  if (measureCtx) return measureCtx
  if (typeof document === 'undefined') return null
  measureCtx = document.createElement('canvas').getContext('2d')
  return measureCtx
}

/** Screen box of a text annotation: top-left at the anchor point. */
export function textBox(cam: Camera, a: Ann<'text'>): { x: number; y: number; w: number; h: number; lines: string[]; size: number } {
  const size = fpx(a.size ?? TEXT_SIZE)
  const lines = (a.text || ' ').split('\n')
  const m = measurer()
  let w = 0
  if (m) { m.font = `${size}px ${FONT}`; for (const l of lines) w = Math.max(w, m.measureText(l).width) } else w = Math.max(...lines.map(l => l.length)) * size * 0.8
  const [x, y] = toScreen(cam, a.at.x, a.at.y)
  return { x, y, w, h: lines.length * size * 1.3, lines, size }
}

function distSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const ex = bx - ax, ey = by - ay, ee = ex * ex + ey * ey
  let u = ee > 0 ? ((px - ax) * ex + (py - ay) * ey) / ee : 0
  u = Math.max(0, Math.min(1, u))
  return Math.hypot(px - ax - u * ex, py - ay - u * ey)
}

/** Screen distance from (sx, sy) to the annotation (0 inside a text box). */
export function annotationDistance(cam: Camera, a: AnnotationDef, sx: number, sy: number): number {
  if (a.type === 'text') {
    const b = textBox(cam, a)
    const dx = Math.max(b.x - 4 - sx, 0, sx - (b.x + b.w + 4)), dy = Math.max(b.y - 4 - sy, 0, sy - (b.y + b.h + 4))
    return Math.hypot(dx, dy)
  }
  if (a.type === 'arrow' || a.type === 'ruler') {
    const [x0, y0] = toScreen(cam, a.from.x, a.from.y), [x1, y1] = toScreen(cam, a.to.x, a.to.y)
    return distSeg(sx, sy, x0, y0, x1, y1)
  }
  const [vx, vy] = toScreen(cam, a.vertex.x, a.vertex.y), [ax, ay] = toScreen(cam, a.a.x, a.a.y), [bx, by] = toScreen(cam, a.b.x, a.b.y)
  return Math.min(distSeg(sx, sy, vx, vy, ax, ay), distSeg(sx, sy, vx, vy, bx, by))
}

/** Editable points of an annotation (world), in a fixed order per type. */
export function annotationPoints(a: AnnotationDef): Array<{ x: number; y: number }> {
  switch (a.type) {
    case 'text': return [a.at]
    case 'arrow': case 'ruler': return [a.from, a.to]
    case 'angle': return [a.vertex, a.a, a.b]
  }
}

// ---- Drawing ----

function halo(ctx: CanvasRenderingContext2D, P: Palette, path: () => void) {
  ctx.save()
  ctx.strokeStyle = P.accent
  ctx.globalAlpha = 0.25
  ctx.lineWidth = lw(8)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  path()
  ctx.stroke()
  ctx.restore()
}

function drawText(ctx: CanvasRenderingContext2D, cam: Camera, a: Ann<'text'>, P: Palette, selected: boolean) {
  const b = textBox(cam, a)
  ctx.fillStyle = P.labelBg
  ctx.beginPath(); ctx.roundRect(b.x - 4, b.y - 3, b.w + 8, b.h + 4, 5); ctx.fill()
  if (selected) {
    ctx.strokeStyle = P.accent
    ctx.lineWidth = lw(1.5)
    ctx.setLineDash([4, 3])
    ctx.stroke()
    ctx.setLineDash([])
  }
  ctx.fillStyle = a.color ?? P.text
  ctx.font = `${b.size}px ${FONT}`
  ctx.textBaseline = 'top'
  b.lines.forEach((l, i) => ctx.fillText(l, b.x, b.y + i * b.size * 1.3))
  ctx.textBaseline = 'alphabetic'
}

function drawArrow(ctx: CanvasRenderingContext2D, cam: Camera, a: Ann<'arrow'>, P: Palette, selected: boolean) {
  const [x0, y0] = toScreen(cam, a.from.x, a.from.y), [x1, y1] = toScreen(cam, a.to.x, a.to.y)
  if (selected) halo(ctx, P, () => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1) })
  ctx.lineCap = 'round'
  arrow(ctx, x0, y0, x1, y1, a.color ?? noteColor(P), 2.6)
  ctx.lineCap = 'butt'
  if (a.text) tag(ctx, x0 + 6, y0 - 6, a.text, a.color ?? noteColor(P), P, font(13))
}

function drawRuler(ctx: CanvasRenderingContext2D, cam: Camera, a: Ann<'ruler'>, P: Palette, digits: number, selected: boolean) {
  const [x0, y0] = toScreen(cam, a.from.x, a.from.y), [x1, y1] = toScreen(cam, a.to.x, a.to.y)
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy)
  if (len < 1) return
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux
  const color = noteColor(P)
  if (selected) halo(ctx, P, () => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1) })
  ctx.strokeStyle = color
  ctx.lineWidth = lw(1.6)
  ctx.beginPath()
  ctx.moveTo(x0, y0); ctx.lineTo(x1, y1)
  // End bars
  const e = 8
  ctx.moveTo(x0 - nx * e, y0 - ny * e); ctx.lineTo(x0 + nx * e, y0 + ny * e)
  ctx.moveTo(x1 - nx * e, y1 - ny * e); ctx.lineTo(x1 + nx * e, y1 + ny * e)
  ctx.stroke()
  // Graduation like a real ruler (minor ticks every nice step, longer every fifth)
  const Lw = Math.hypot(a.to.x - a.from.x, a.to.y - a.from.y)
  const step = niceStep(cam.ppm, 10)
  if (Lw / step <= 400) {
    ctx.lineWidth = lw(1)
    ctx.globalAlpha = 0.8
    ctx.beginPath()
    for (let i = 1; ; i++) {
      const s = i * step * cam.ppm
      if (s >= len - 0.5) break
      const t = i % 5 === 0 ? 6 : 3
      ctx.moveTo(x0 + ux * s, y0 + uy * s); ctx.lineTo(x0 + ux * s + nx * t, y0 + uy * s + ny * t)
    }
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  // Angle to the horizontal at the start point
  const th = angleToHorizontal(a.from.x, a.from.y, a.to.x, a.to.y)
  if (th > 0.5 * Math.PI / 180 && th < 89.5 * Math.PI / 180 && len > 40) {
    const r = Math.min(28, len * 0.4)
    const hdir = dx >= 0 ? 0 : Math.PI
    const ray = Math.atan2(dy, dx)
    let diff = ray - hdir
    while (diff > Math.PI) diff -= 2 * Math.PI
    while (diff < -Math.PI) diff += 2 * Math.PI
    ctx.lineWidth = lw(1)
    ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + Math.cos(hdir) * (r + 10), y0); ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath(); ctx.arc(x0, y0, r, hdir, hdir + diff, diff < 0); ctx.stroke()
  }
  // Label beside the middle, on the upper side, far enough that its box clears the line
  const text = rulerLabel(a.from, a.to, digits)
  const f = font(12, MONO)
  ctx.font = f
  const tw = ctx.measureText(text).width, lh = fpx(12) + 4
  const side = ny <= 0 ? 1 : -1
  const off = 10 + Math.abs(nx) * (tw / 2 + 3) + Math.abs(ny) * lh / 2
  const mx = (x0 + x1) / 2 + nx * off * side, my = (y0 + y1) / 2 + ny * off * side
  tag(ctx, mx - tw / 2, my + lh / 2 - 4, text, color, P, f)
}

function drawAngle(ctx: CanvasRenderingContext2D, cam: Camera, a: Ann<'angle'>, P: Palette, digits: number, selected: boolean) {
  const [vx, vy] = toScreen(cam, a.vertex.x, a.vertex.y), [ax, ay] = toScreen(cam, a.a.x, a.a.y), [bx, by] = toScreen(cam, a.b.x, a.b.y)
  const color = noteColor(P)
  if (selected) halo(ctx, P, () => { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(vx, vy); ctx.lineTo(bx, by) })
  ctx.strokeStyle = color
  ctx.lineWidth = lw(1.6)
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(vx, vy); ctx.lineTo(bx, by); ctx.stroke()
  const la = Math.hypot(ax - vx, ay - vy), lb = Math.hypot(bx - vx, by - vy)
  if (la < 2 || lb < 2) return
  const r = Math.max(10, Math.min(34, 0.45 * Math.min(la, lb)))
  const aa = Math.atan2(ay - vy, ax - vx), ab = Math.atan2(by - vy, bx - vx)
  let diff = ab - aa
  while (diff > Math.PI) diff -= 2 * Math.PI
  while (diff < -Math.PI) diff += 2 * Math.PI
  ctx.fillStyle = color
  ctx.globalAlpha = 0.12
  ctx.beginPath(); ctx.moveTo(vx, vy); ctx.arc(vx, vy, r, aa, aa + diff, diff < 0); ctx.closePath(); ctx.fill()
  ctx.globalAlpha = 1
  ctx.beginPath(); ctx.arc(vx, vy, r, aa, aa + diff, diff < 0); ctx.stroke()
  ctx.beginPath(); ctx.arc(vx, vy, 2.5, 0, Math.PI * 2); ctx.fill()
  const mid = aa + diff / 2
  const text = q(angleBetween(a.vertex, a.a, a.b), 'rad', Math.min(digits, 4))
  ctx.font = font(12, MONO)
  const tw = ctx.measureText(text).width
  const lx = vx + Math.cos(mid) * (r + 10 + tw / 2), ly = vy + Math.sin(mid) * (r + 10) + fpx(4)
  tag(ctx, lx - tw / 2, ly, text, color, P, font(12, MONO))
}

/** Draw every annotation; `selectedId` gets a highlight. Uses the current render context for units and size. */
export function drawAnnotations(ctx: CanvasRenderingContext2D, cam: Camera, list: AnnotationDef[], P: Palette, digits: number, selectedId: string | null) {
  ctx.save()
  for (const a of list) {
    const sel = a.id === selectedId
    if (a.type === 'text') drawText(ctx, cam, a, P, sel)
    else if (a.type === 'arrow') drawArrow(ctx, cam, a, P, sel)
    else if (a.type === 'ruler') drawRuler(ctx, cam, a, P, digits, sel)
    else if (a.type === 'angle') drawAngle(ctx, cam, a, P, digits, sel)
  }
  ctx.restore()
}
