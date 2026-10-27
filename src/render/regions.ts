/**
 * Field regions, liquids and rail loops on the canvas (26.55, D90–D92). A field region is a tinted rectangle or
 * circle with its E lines (arrows follow the sign of E·cos(ωt + φ) for an alternating field) and its ⊙ / × marks for
 * B; a liquid is a blue rectangle with its surface drawn at the top; a rail loop is two rails along its direction
 * through the ends of the rod, closed by a resistor behind the rod's start, with the B marks between the rails.
 * Purely visual: the forces come from the core.
 */
import type { Camera, Palette } from './renderer'
import { toScreen } from './renderer'
import type { RailLoopDef, RegionDef, SceneSettings } from '../core/scene/types'
import { font, lw, q } from './style'
import { tl } from '../i18n'

type Pt = { x: number; y: number }
const LIQUID = 'rgba(37, 99, 235, 0.16)'
const LIQUID_EDGE = '#2563eb'

/** Path of a region in screen coordinates. */
function regionPath(ctx: CanvasRenderingContext2D, cam: Camera, r: RegionDef) {
  ctx.beginPath()
  if (r.shape === 'circle') {
    const [sx, sy] = toScreen(cam, r.x, r.y)
    ctx.arc(sx, sy, (r.r ?? 1) * cam.ppm, 0, Math.PI * 2)
  } else {
    const [sx, sy] = toScreen(cam, r.x - (r.w ?? 1) / 2, r.y + (r.h ?? 1) / 2)
    ctx.rect(sx, sy, (r.w ?? 1) * cam.ppm, (r.h ?? 1) * cam.ppm)
  }
}

/** Screen box of a region (for labels and the B grid). */
function regionBox(cam: Camera, r: RegionDef): { x0: number; y0: number; x1: number; y1: number } {
  const hw = r.shape === 'circle' ? (r.r ?? 1) : (r.w ?? 1) / 2
  const hh = r.shape === 'circle' ? (r.r ?? 1) : (r.h ?? 1) / 2
  const [x0, y0] = toScreen(cam, r.x - hw, r.y + hh)
  const [x1, y1] = toScreen(cam, r.x + hw, r.y - hh)
  return { x0, y0, x1, y1 }
}

/** ⊙ (out of the page) or × (into the page) marks on a world-anchored grid inside the current clip. */
function bMarks(ctx: CanvasRenderingContext2D, cam: Camera, box: { x0: number; y0: number; x1: number; y1: number }, out: boolean, col: string) {
  const gap = Math.max(26, Math.min(56, (box.x1 - box.x0) / 3))
  const o = toScreen(cam, 0, 0)
  const ox = ((o[0] % gap) + gap) % gap, oy = ((o[1] % gap) + gap) % gap
  ctx.strokeStyle = col; ctx.fillStyle = col
  ctx.globalAlpha = 0.5
  ctx.lineWidth = lw(1.1)
  const xs = Math.max(box.x0, 0), xe = Math.min(box.x1, cam.width), ys = Math.max(box.y0, 0), ye = Math.min(box.y1, cam.height)
  for (let x = ox - gap / 2 + Math.floor((xs - ox) / gap) * gap; x < xe + gap; x += gap) {
    for (let y = oy - gap / 2 + Math.floor((ys - oy) / gap) * gap; y < ye + gap; y += gap) {
      if (out) {
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.stroke()
        ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill()
      } else {
        ctx.beginPath(); ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4); ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4); ctx.stroke()
      }
    }
  }
  ctx.globalAlpha = 1
}

/** Parallel E lines with arrowheads inside the current clip; `sign` flips them (alternating field). */
function eLines(ctx: CanvasRenderingContext2D, box: { x0: number; y0: number; x1: number; y1: number }, E: Pt, sign: number, alpha: number, col: string) {
  const m = Math.hypot(E.x, E.y)
  if (!(m > 0) || sign === 0) return
  const ux = (sign * E.x) / m, uy = (-sign * E.y) / m
  const nx = -uy, ny = ux
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2
  const diag = Math.hypot(box.x1 - box.x0, box.y1 - box.y0)
  const gap = Math.max(18, Math.min(40, diag / 6))
  ctx.strokeStyle = col; ctx.fillStyle = col
  ctx.globalAlpha = alpha
  ctx.lineWidth = lw(1.2)
  const n = Math.ceil(diag / gap / 2)
  for (let k = -n; k <= n; k++) {
    const px = cx + nx * k * gap, py = cy + ny * k * gap
    ctx.beginPath(); ctx.moveTo(px - ux * diag, py - uy * diag); ctx.lineTo(px + ux * diag, py + uy * diag); ctx.stroke()
    for (let j = -3; j <= 3; j++) {
      const s = j * 70 + (k % 2) * 35
      const ax = px + ux * s, ay = py + uy * s
      ctx.beginPath()
      ctx.moveTo(ax + ux * 6, ay + uy * 6)
      ctx.lineTo(ax - ux * 4 + nx * 4, ay - uy * 4 + ny * 4)
      ctx.lineTo(ax - ux * 4 - nx * 4, ay - uy * 4 - ny * 4)
      ctx.closePath(); ctx.fill()
    }
  }
  ctx.globalAlpha = 1
}

/** Factor cos(ωt + φ) of an alternating region (1 for a steady one). */
export function regionPhase(r: RegionDef, t: number): number {
  return r.omega ? Math.cos(r.omega * t + (r.phase ?? 0)) : 1
}

/** Label of a field region: name, E (with ~ when alternating) and B. */
function fieldText(r: RegionDef, digits: number): string {
  const parts = [r.name]
  const e = Math.hypot(r.E?.x ?? 0, r.E?.y ?? 0)
  if (e > 0) parts.push(`E = ${q(e, 'V/m', digits)}${r.omega ? ` · cos(${q(r.omega, 'rad/s', 3)}·t)` : ''}`)
  if (r.B) parts.push(`B = ${q(Math.abs(r.B), 'T', digits)} ${r.B > 0 ? '⊙' : '⊗'}`)
  return parts.join('  ')
}

/** Draw the field regions and liquids of a scene at time t; `selected` gets a highlighted outline with handles. */
export function drawRegions(ctx: CanvasRenderingContext2D, cam: Camera, st: SceneSettings, t: number, P: Palette, digits: number, selected: string | null) {
  const list = st.regions
  if (!list?.length) return
  for (const r of list) {
    const box = regionBox(cam, r)
    if (box.x1 < 0 || box.x0 > cam.width || box.y1 < 0 || box.y0 > cam.height) continue
    ctx.save()
    if (r.kind === 'liquid') {
      regionPath(ctx, cam, r)
      ctx.fillStyle = LIQUID; ctx.fill()
      // the free surface at the top, with small ripples
      ctx.strokeStyle = LIQUID_EDGE; ctx.lineWidth = lw(2)
      ctx.beginPath(); ctx.moveTo(box.x0, box.y0); ctx.lineTo(box.x1, box.y0); ctx.stroke()
      ctx.lineWidth = lw(1); ctx.globalAlpha = 0.6
      for (let x = box.x0 + 14; x < box.x1 - 14; x += 34) { ctx.beginPath(); ctx.moveTo(x, box.y0 + 7); ctx.quadraticCurveTo(x + 6, box.y0 + 3, x + 12, box.y0 + 7); ctx.stroke() }
      ctx.globalAlpha = 1
      ctx.strokeStyle = LIQUID_EDGE; ctx.lineWidth = lw(1); ctx.setLineDash([4, 4])
      ctx.beginPath(); ctx.moveTo(box.x0, box.y0); ctx.lineTo(box.x0, box.y1); ctx.lineTo(box.x1, box.y1); ctx.lineTo(box.x1, box.y0); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = LIQUID_EDGE; ctx.font = font(11)
      ctx.fillText(`${r.name}  ρ = ${q(r.density ?? 1000, 'kg/m³', digits)}`, Math.max(box.x0, 0) + 6, box.y0 + 20)
    } else {
      const hasB = !!r.B, e = Math.hypot(r.E?.x ?? 0, r.E?.y ?? 0)
      const col = hasB && !e ? P.magnetic ?? '#a16207' : P.electric ?? '#0f766e'
      regionPath(ctx, cam, r)
      ctx.globalAlpha = 0.07; ctx.fillStyle = col; ctx.fill(); ctx.globalAlpha = 1
      ctx.save()
      regionPath(ctx, cam, r)
      ctx.clip()
      if (hasB) bMarks(ctx, cam, box, r.B! > 0, P.magnetic ?? '#a16207')
      if (e > 0) {
        const c = regionPhase(r, t)
        eLines(ctx, box, r.E!, Math.sign(c), 0.25 + 0.35 * Math.abs(c), P.electric ?? '#0f766e')
      }
      ctx.restore()
      regionPath(ctx, cam, r)
      ctx.strokeStyle = col; ctx.lineWidth = lw(1.3); ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([])
      // the label inside the top-left corner; above a circle or a region too narrow for it
      ctx.fillStyle = col; ctx.font = font(11)
      const label = fieldText(r, digits)
      const tw = ctx.measureText(label).width
      const above = r.shape === 'circle' || box.x1 - box.x0 < tw + 12
      const lx = above ? Math.min(Math.max(4, (box.x0 + box.x1) / 2 - tw / 2), cam.width - tw - 4) : Math.max(box.x0, 0) + 6
      ctx.fillText(label, lx, above ? box.y0 - 6 : Math.max(box.y0, 0) + 15)
    }
    if (r.id === selected) {
      regionPath(ctx, cam, r)
      ctx.strokeStyle = P.accent; ctx.lineWidth = lw(2); ctx.stroke()
      ctx.fillStyle = P.bg
      for (const h of regionHandles(r)) {
        const [hx, hy] = toScreen(cam, h.x, h.y)
        ctx.beginPath(); ctx.rect(hx - 4, hy - 4, 8, 8); ctx.fill(); ctx.stroke()
      }
    }
    ctx.restore()
  }
}

/** Resize handles of a region (world): the four corners of a rectangle, the right-hand point of a circle. */
export function regionHandles(r: RegionDef): Pt[] {
  if (r.shape === 'circle') return [{ x: r.x + (r.r ?? 1), y: r.y }]
  const hw = (r.w ?? 1) / 2, hh = (r.h ?? 1) / 2
  return [{ x: r.x - hw, y: r.y - hh }, { x: r.x + hw, y: r.y - hh }, { x: r.x + hw, y: r.y + hh }, { x: r.x - hw, y: r.y + hh }]
}

/** The point is inside the region (world). */
export function insideRegion(r: RegionDef, p: Pt): boolean {
  if (r.shape === 'circle') return Math.hypot(p.x - r.x, p.y - r.y) <= (r.r ?? 1)
  return Math.abs(p.x - r.x) <= (r.w ?? 1) / 2 && Math.abs(p.y - r.y) <= (r.h ?? 1) / 2
}

/** The topmost region containing the point (the last in the list), or null. */
export function regionAt(st: SceneSettings, p: Pt): RegionDef | null {
  const list = st.regions ?? []
  for (let k = list.length - 1; k >= 0; k--) if (insideRegion(list[k], p)) return list[k]
  return null
}

/** Resize a region by dragging handle `index` to p (the opposite corner stays); sizes stay above `min`. */
export function resizeRegion(r: RegionDef, orig: RegionDef, index: number, p: Pt, min: number) {
  if (r.shape === 'circle') { r.r = Math.max(min, Math.hypot(p.x - orig.x, p.y - orig.y)); return }
  const corners = regionHandles(orig)
  const fixed = corners[(index + 2) % 4]
  const w = Math.max(min, Math.abs(p.x - fixed.x)), h = Math.max(min, Math.abs(p.y - fixed.y))
  const sx = p.x >= fixed.x ? 1 : -1, sy = p.y >= fixed.y ? 1 : -1
  r.w = w; r.h = h
  r.x = fixed.x + (sx * w) / 2; r.y = fixed.y + (sy * h) / 2
}

/** Geometry of a rail loop from the rod's start position: the two rails and the resistor end (world). */
export function railGeometry(loop: RailLoopDef, start: Pt): { u: Pt; n: Pt; back: Pt } {
  const u = { x: Math.cos(loop.angle), y: Math.sin(loop.angle) }
  const n = { x: -u.y, y: u.x }
  const back = { x: start.x - u.x * Math.max(0.3, 0.8 * loop.L), y: start.y - u.y * Math.max(0.3, 0.8 * loop.L) }
  return { u, n, back }
}

/** Draw the rail loops: rails, the resistor at the back end, the B marks between the rails and the rod's EMF. */
export function drawRailLoops(ctx: CanvasRenderingContext2D, cam: Camera, st: SceneSettings, startOf: (body: string) => Pt | null, P: Palette, digits: number) {
  const loops = st.railLoops
  if (!loops?.length) return
  const col = P.staticStroke
  for (const loop of loops) {
    const s = startOf(loop.body)
    if (!s) continue
    const { u, n, back } = railGeometry(loop, s)
    const half = loop.L / 2
    // the rails run from the resistor end far past the screen
    const far = Math.hypot(cam.width, cam.height) / cam.ppm + Math.hypot(s.x - cam.cx, s.y - cam.cy) + 2
    const a1 = { x: back.x + n.x * half, y: back.y + n.y * half }, a2 = { x: back.x - n.x * half, y: back.y - n.y * half }
    const b1 = { x: a1.x + u.x * far, y: a1.y + u.y * far }, b2 = { x: a2.x + u.x * far, y: a2.y + u.y * far }
    const [p1x, p1y] = toScreen(cam, a1.x, a1.y), [p2x, p2y] = toScreen(cam, a2.x, a2.y)
    const [q1x, q1y] = toScreen(cam, b1.x, b1.y), [q2x, q2y] = toScreen(cam, b2.x, b2.y)
    ctx.save()
    // B marks in the strip between the rails
    if (loop.B) {
      ctx.save()
      ctx.beginPath(); ctx.moveTo(p1x, p1y); ctx.lineTo(q1x, q1y); ctx.lineTo(q2x, q2y); ctx.lineTo(p2x, p2y); ctx.closePath()
      ctx.globalAlpha = 0.06; ctx.fillStyle = P.magnetic ?? '#a16207'; ctx.fill(); ctx.globalAlpha = 1
      ctx.clip()
      bMarks(ctx, cam, { x0: Math.min(p1x, p2x, q1x, q2x), y0: Math.min(p1y, p2y, q1y, q2y), x1: Math.max(p1x, p2x, q1x, q2x), y1: Math.max(p1y, p2y, q1y, q2y) }, loop.B > 0, P.magnetic ?? '#a16207')
      ctx.restore()
    }
    ctx.strokeStyle = col; ctx.lineWidth = lw(3); ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(p1x, p1y); ctx.lineTo(q1x, q1y); ctx.moveTo(p2x, p2y); ctx.lineTo(q2x, q2y); ctx.stroke()
    // the closing wire with a resistor box in the middle
    const mx = (p1x + p2x) / 2, my = (p1y + p2y) / 2
    const ex = (p1x - p2x), ey = (p1y - p2y)
    const len = Math.hypot(ex, ey) || 1
    const bx = (ex / len) * Math.min(14, len / 4), by = (ey / len) * Math.min(14, len / 4)
    ctx.lineWidth = lw(2)
    ctx.beginPath(); ctx.moveTo(p1x, p1y); ctx.lineTo(mx + bx, my + by); ctx.moveTo(p2x, p2y); ctx.lineTo(mx - bx, my - by); ctx.stroke()
    const wx = (-ey / len) * 6, wy = (ex / len) * 6
    ctx.beginPath(); ctx.moveTo(mx + bx + wx, my + by + wy); ctx.lineTo(mx + bx - wx, my + by - wy); ctx.lineTo(mx - bx - wx, my - by - wy); ctx.lineTo(mx - bx + wx, my - by + wy); ctx.closePath()
    ctx.fillStyle = P.bg; ctx.fill(); ctx.stroke()
    // the label beside the resistor, on the side of the rails, kept on screen
    ctx.fillStyle = P.text2; ctx.font = font(11)
    const text = `${loop.name}  R = ${q(loop.R, 'Ω', digits)}  L = ${q(loop.L, 'm', digits)}  B = ${q(Math.abs(loop.B), 'T', digits)}`
    const tw = ctx.measureText(text).width
    const lx = Math.min(Math.max(4, Math.min(p1x, p2x) + 10), cam.width - tw - 4)
    const ly = Math.min(Math.max(14, Math.min(p1y, p2y) - 8), cam.height - 6)
    ctx.fillText(text, lx, ly)
    ctx.restore()
  }
}

/** Short description of a region for lists. */
export function regionSummary(r: RegionDef, digits: number): string {
  if (r.kind === 'liquid') return tl('液体 ρ = {0}', [q(r.density ?? 1000, 'kg/m³', digits)])
  const parts: string[] = []
  const e = Math.hypot(r.E?.x ?? 0, r.E?.y ?? 0)
  if (e > 0) parts.push(`E = ${q(e, 'V/m', digits)}${r.omega ? '~' : ''}`)
  if (r.B) parts.push(`B = ${q(Math.abs(r.B), 'T', digits)} ${r.B > 0 ? '⊙' : '⊗'}`)
  return parts.join('，') || tl('无场')
}
