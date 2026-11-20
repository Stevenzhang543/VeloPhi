/**
 * Glassware drawn by code (26.64, D258): every vessel is its profile — the inner radius against the height, the same
 * one the liquid level is computed from (src/chem/apparatus.ts) — offset outwards by the wall, with one stroke weight
 * for every outline, a body between the two wall lines and one highlight. No bitmaps and no gradients, so a vessel
 * can be drawn at any size and with any contents.
 *
 * A `Frame` places a vessel on the canvas: the x of its axis, the y of its inner bottom, pixels per centimetre, and
 * `flip` for a vessel standing on its mouth (a jar collecting over water).
 */
import type { VesselShape, VesselData } from '../../chem/apparatus'
import { graduations, levelOf, radiusAt } from '../../chem/apparatus'
import type { ChemPalette } from './palette'

export interface Frame { cx: number; base: number; ppc: number; flip?: boolean }

/** Stroke weight of the drawing system, px (scaled by the projector's line factor). */
export const STROKE = 1.5

export const fx = (f: Frame, r: number) => f.cx + r * f.ppc
export const fy = (f: Frame, h: number) => (f.flip ? f.base + h * f.ppc : f.base - h * f.ppc)

/** Wall thickness of a vessel in cm of its own scale. */
export function wallOf(shape: VesselShape, v: VesselData | undefined): number {
  return v?.draw.wall === 'thick' ? Math.max(0.45, shape.rMax * 0.16) : Math.min(0.22, Math.max(0.1, shape.rMax * 0.05))
}

/** Distance between the axes of a U-tube's arms, cm. */
export const uGap = (shape: VesselShape) => shape.r[0] * 4.4

/** Profile points with the implicit flat bottom (h, r), from the axis outwards and up. */
function profile(shape: VesselShape): Array<[number, number]> {
  const pts: Array<[number, number]> = []
  if (shape.r[0] > 1e-9) pts.push([shape.h[0], 0])
  for (let i = 0; i < shape.h.length; i++) pts.push([shape.h[i], shape.r[i]])
  return pts
}

/** The profile moved outwards by `t` along its normals (mitre joins, limited). */
function offset(pts: Array<[number, number]>, t: number): Array<[number, number]> {
  const n = pts.length
  const normals: Array<[number, number]> = []
  for (let i = 0; i < n - 1; i++) {
    const dh = pts[i + 1][0] - pts[i][0], dr = pts[i + 1][1] - pts[i][1]
    const len = Math.hypot(dh, dr) || 1
    normals.push([-dr / len, dh / len])
  }
  const out: Array<[number, number]> = []
  for (let i = 0; i < n; i++) {
    const a = normals[Math.max(0, i - 1)], b = normals[Math.min(n - 2, i)]
    let nh = a[0] + b[0], nr = a[1] + b[1]
    const len = Math.hypot(nh, nr) || 1
    nh /= len; nr /= len
    // mitre length 1 / cos(half angle), capped so a sharp corner does not spike
    const k = Math.min(1.8, 1 / Math.max(0.3, nh * a[0] + nr * a[1]))
    out.push([pts[i][0] + nh * t * k, Math.max(0, pts[i][1] + nr * t * k)])
  }
  // on the axis the wall goes straight down
  if (pts[0][1] === 0) out[0] = [pts[0][0] - t, 0]
  return out
}

function trace(ctx: CanvasRenderingContext2D, f: Frame, pts: Array<[number, number]>, side: 1 | -1, from: 'top' | 'bottom', move: boolean) {
  const order = from === 'top' ? [...pts].reverse() : pts
  order.forEach(([h, r], i) => { const x = fx(f, side * r), y = fy(f, h); if (i === 0 && move) ctx.moveTo(x, y); else ctx.lineTo(x, y) })
}

/** The inner space of a vessel as a closed path (the clip of everything inside it). */
export function cavityPath(ctx: CanvasRenderingContext2D, shape: VesselShape, f: Frame, uTube = false) {
  ctx.beginPath()
  if (uTube) {
    const r = shape.r[0], g = uGap(shape) / 2
    const top = fy(f, shape.top), y0 = fy(f, 0)
    // two arms joined by a half ring below h = 0
    ctx.moveTo(fx(f, -g - r), top)
    ctx.lineTo(fx(f, -g - r), y0)
    ctx.arc(f.cx, y0, (g + r) * f.ppc, Math.PI, 0, true)
    ctx.lineTo(fx(f, g + r), top)
    ctx.lineTo(fx(f, g - r), top)
    ctx.lineTo(fx(f, g - r), y0)
    ctx.arc(f.cx, y0, (g - r) * f.ppc, 0, Math.PI, false)
    ctx.lineTo(fx(f, -g + r), top)
    ctx.closePath()
    return
  }
  const pts = profile(shape)
  trace(ctx, f, pts, -1, 'top', true)
  trace(ctx, f, pts, 1, 'bottom', false)
  ctx.closePath()
}

export interface GlassOptions { line?: number; selected?: boolean; hover?: boolean }

/** A vessel's glass: body, the two wall lines and its fittings (spout, foot, tap, side arm …). Contents are drawn before, graduations after. */
export function drawGlass(ctx: CanvasRenderingContext2D, P: ChemPalette, shape: VesselShape, v: VesselData | undefined, f: Frame, o: GlassOptions = {}) {
  const line = STROKE * (o.line ?? 1)
  const t = wallOf(shape, v)
  const draw = v?.draw ?? {}
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  const body = draw.opaque ? P.tickMinor : P.glassBody
  const edge = o.selected ? P.accent : P.ink2
  if (draw.uTube) {
    const r = shape.r[0], g = uGap(shape) / 2, top = fy(f, shape.top), y0 = fy(f, 0)
    const ring = (rIn: number, rOut: number) => {
      ctx.beginPath()
      ctx.moveTo(fx(f, -g - rOut), top); ctx.lineTo(fx(f, -g - rOut), y0); ctx.arc(f.cx, y0, (g + rOut) * f.ppc, Math.PI, 0, true); ctx.lineTo(fx(f, g + rOut), top)
      ctx.moveTo(fx(f, g - rIn), top); ctx.lineTo(fx(f, g - rIn), y0); ctx.arc(f.cx, y0, Math.max(0.5, (g - rIn) * f.ppc), 0, Math.PI, false); ctx.lineTo(fx(f, -g + rIn), top)
    }
    ctx.strokeStyle = P.glassBody; ctx.lineWidth = Math.max(2, t * f.ppc * 2); ring(r + t / 2, r + t / 2); ctx.stroke()
    ctx.strokeStyle = edge; ctx.lineWidth = line; ring(r + t, r + t); ctx.stroke()
    ctx.restore()
    return
  }
  const inner = profile(shape)
  const outer = offset(inner, t)
  // body: between the wall lines
  ctx.beginPath()
  trace(ctx, f, outer, -1, 'top', true)
  trace(ctx, f, outer, 1, 'bottom', false)
  trace(ctx, f, inner, 1, 'top', false)
  trace(ctx, f, inner, -1, 'bottom', false)
  ctx.closePath()
  ctx.fillStyle = body
  ctx.fill()
  // inner wall: a hairline; outer wall: the stroke of the system, with the rim
  ctx.beginPath()
  trace(ctx, f, inner, -1, 'top', true)
  trace(ctx, f, inner, 1, 'bottom', false)
  ctx.strokeStyle = P.tick
  ctx.lineWidth = Math.max(0.75, line * 0.6)
  ctx.stroke()
  const topIn = inner[inner.length - 1], topOut = outer[outer.length - 1]
  ctx.beginPath()
  ctx.moveTo(fx(f, -topIn[1]), fy(f, topIn[0]))
  if (draw.spout) {
    // the lip pulled out on one side
    ctx.lineTo(fx(f, -topOut[1] - 0.32 * shape.rMax * 0.3 - 0.25), fy(f, topOut[0] + 0.12))
    ctx.lineTo(fx(f, -topOut[1]), fy(f, topOut[0] - 0.5))
    trace(ctx, f, outer.slice(0, -1), -1, 'top', false)
  } else trace(ctx, f, outer, -1, 'top', false)
  trace(ctx, f, outer, 1, 'bottom', false)
  ctx.lineTo(fx(f, topIn[1]), fy(f, topIn[0]))
  ctx.strokeStyle = edge
  ctx.lineWidth = line
  ctx.stroke()
  // the one highlight: a soft stroke inside the left wall
  if (!draw.opaque) {
    const inset = Math.max(3 / f.ppc, shape.rMax * 0.16)
    ctx.beginPath()
    let started = false
    for (let i = 0; i <= 12; i++) {
      const h = shape.h[0] + (shape.top - shape.h[0]) * (0.24 + (0.4 * i) / 12)
      const r = radiusAt(shape, h) - inset
      if (r <= 0.05) { started = false; continue }
      const x = fx(f, -r), y = fy(f, h)
      if (!started) { ctx.moveTo(x, y); started = true } else ctx.lineTo(x, y)
    }
    ctx.strokeStyle = P.glassLight
    ctx.lineWidth = Math.max(1.5, Math.min(3, shape.rMax * f.ppc * 0.06))
    ctx.stroke()
  }
  ctx.strokeStyle = edge
  ctx.lineWidth = line
  const dir = f.flip ? 1 : -1
  if (draw.foot) {
    const w = shape.rMax * 1.9, y = fy(f, shape.h[0] - t), hgt = 0.35 * f.ppc * -dir
    ctx.beginPath(); ctx.moveTo(fx(f, -w), y + hgt); ctx.lineTo(fx(f, -w * 0.9), y); ctx.lineTo(fx(f, w * 0.9), y); ctx.lineTo(fx(f, w), y + hgt); ctx.closePath()
    ctx.fillStyle = P.glassBody; ctx.fill(); ctx.stroke()
  }
  if (draw.ring) {
    // a cork ring keeps a round flask upright
    const y = fy(f, shape.h[0] - t), w = shape.rMax * 0.62, hgt = shape.rMax * 0.34 * f.ppc
    ctx.beginPath(); ctx.moveTo(fx(f, -w), y - hgt); ctx.lineTo(fx(f, -w * 1.15), y); ctx.lineTo(fx(f, w * 1.15), y); ctx.lineTo(fx(f, w), y - hgt)
    ctx.strokeStyle = P.ink3; ctx.stroke(); ctx.strokeStyle = edge
  }
  if (draw.sideArm) {
    const h = shape.top - (shape.top - shape.full) * 0.3, r = radiusAt(shape, h) + t
    const x0 = fx(f, r), y0 = fy(f, h), len = shape.rMax * 1.5 * f.ppc, w = Math.max(3, 0.5 * f.ppc)
    ctx.beginPath()
    ctx.moveTo(x0, y0 - w / 2); ctx.lineTo(x0 + len, y0 - w / 2 + len * 0.3); ctx.moveTo(x0, y0 + w / 2); ctx.lineTo(x0 + len, y0 + w / 2 + len * 0.3)
    ctx.stroke()
  }
  if (draw.tap) {
    // stem, stopcock and tip below the bottom
    const yb = fy(f, shape.h[0] - t), stem = 2.4 * f.ppc, w = Math.max(2, 0.3 * f.ppc)
    ctx.beginPath()
    ctx.moveTo(f.cx - w, yb); ctx.lineTo(f.cx - w, yb + stem * 0.62); ctx.lineTo(f.cx - w * 0.35, yb + stem)
    ctx.moveTo(f.cx + w, yb); ctx.lineTo(f.cx + w, yb + stem * 0.62); ctx.lineTo(f.cx + w * 0.35, yb + stem)
    ctx.stroke()
    const ky = yb + stem * 0.3
    if (draw.tap === 'glass') {
      ctx.beginPath(); ctx.moveTo(f.cx - w * 2.6, ky); ctx.lineTo(f.cx + w * 3.4, ky); ctx.moveTo(f.cx + w * 3.4, ky - w * 1.4); ctx.lineTo(f.cx + w * 3.4, ky + w * 1.4)
      ctx.lineWidth = line * 1.6; ctx.stroke(); ctx.lineWidth = line
    } else {
      ctx.fillStyle = P.rubber
      ctx.fillRect(f.cx - w * 1.5, ky - w * 1.6, w * 3, w * 3.2)
      ctx.beginPath(); ctx.arc(f.cx, ky, w * 0.8, 0, Math.PI * 2); ctx.fillStyle = P.glassLight; ctx.fill(); ctx.stroke()
    }
  }
  if (draw.lid) {
    const y = fy(f, shape.top), w = (topOut[1] + 0.25) * f.ppc, hgt = Math.max(3, 0.4 * f.ppc)
    ctx.fillStyle = P.tickMinor
    ctx.beginPath(); ctx.rect(f.cx - w, y - hgt, w * 2, hgt); ctx.fill(); ctx.stroke()
  }
  ctx.restore()
}

/** Graduation marks on the inner wall, labelled where there is room. */
export function drawGraduations(ctx: CanvasRenderingContext2D, P: ChemPalette, kind: string, shape: VesselShape, f: Frame, font: string, line = 1) {
  const marks = graduations(kind, shape.capacity_mL)
  if (!marks.length) return
  ctx.save()
  ctx.strokeStyle = P.ink2
  ctx.fillStyle = P.ink2
  ctx.lineCap = 'butt'
  const majors = marks.filter(m => m.major)
  const spacing = majors.length > 1 ? Math.abs(fy(f, levelOf(shape, majors[1].mL)) - fy(f, levelOf(shape, majors[0].mL))) : 99
  const size = Math.max(8, Math.min(11, spacing * 0.7))
  const labels = spacing >= 11 && shape.rMax * f.ppc >= 5
  ctx.font = `500 ${size}px ${font}`
  ctx.textBaseline = 'middle'
  for (const m of marks) {
    const h = levelOf(shape, m.mL)
    const r = radiusAt(shape, h)
    const y = Math.round(fy(f, h)) + 0.5
    if (marks.length === 1) {
      // a single ring mark right round the neck
      ctx.lineWidth = Math.max(1, line)
      ctx.beginPath(); ctx.moveTo(fx(f, -r), y); ctx.lineTo(fx(f, r), y); ctx.stroke()
      continue
    }
    const narrow = r * f.ppc < 12
    const len = narrow ? (m.major ? r * 2 * f.ppc : r * f.ppc) : m.major ? Math.min(r * 0.42 * f.ppc, 14) : Math.min(r * 0.24 * f.ppc, 8)
    if (!m.major && spacing / 5 < 2.5) continue
    ctx.lineWidth = m.major ? Math.max(1, line) : Math.max(0.75, line * 0.7)
    ctx.globalAlpha = m.major ? 1 : 0.75
    ctx.beginPath(); ctx.moveTo(fx(f, r) - len, y); ctx.lineTo(fx(f, r), y); ctx.stroke()
    if (m.major && m.label && labels && (narrow || r * f.ppc - len >= ctx.measureText(m.label).width + 8)) {
      ctx.globalAlpha = 1
      if (narrow) { ctx.textAlign = 'left'; ctx.fillText(m.label, fx(f, r) + 5, y) } else { ctx.textAlign = 'right'; ctx.fillText(m.label, fx(f, r) - len - 3, y) }
    }
  }
  ctx.restore()
}

/** A rubber stopper in the mouth of a vessel (through holes are drawn by whatever passes through). */
export function drawStopper(ctx: CanvasRenderingContext2D, P: ChemPalette, shape: VesselShape, f: Frame, line = 1, uTube = false) {
  ctx.save()
  ctx.fillStyle = P.rubber
  ctx.strokeStyle = P.ink2
  ctx.lineWidth = STROKE * line * 0.8
  const plug = (cx: number, r: number) => {
    const y0 = fy(f, shape.top - Math.min(0.9, shape.top * 0.12)), y1 = fy(f, shape.top + Math.min(0.5, r * 0.7))
    ctx.beginPath()
    ctx.moveTo(cx - r * 0.96 * f.ppc, y0); ctx.lineTo(cx - r * 1.12 * f.ppc, y1); ctx.lineTo(cx + r * 1.12 * f.ppc, y1); ctx.lineTo(cx + r * 0.96 * f.ppc, y0)
    ctx.closePath(); ctx.fill(); ctx.stroke()
  }
  const r = shape.r[shape.r.length - 2] ?? shape.r[shape.r.length - 1]
  if (uTube) { const g = uGap(shape) / 2; plug(fx(f, -g), shape.r[0]); plug(fx(f, g), shape.r[0]) } else plug(f.cx, r)
  ctx.restore()
}

/** Half width (cm) of a vessel with its wall and fittings, for layout and hit tests. */
export function halfWidth(shape: VesselShape, v: VesselData | undefined): number {
  const t = wallOf(shape, v)
  if (v?.draw.uTube) return uGap(shape) / 2 + shape.r[0] + t
  return (v?.draw.foot ? shape.rMax * 1.9 : shape.rMax) + t
}
