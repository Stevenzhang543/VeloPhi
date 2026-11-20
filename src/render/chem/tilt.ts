/**
 * A vessel tipped to pour (26.65, D297 item 1). The vessel turns about the lip it pours from; its liquid keeps a level
 * surface, and the surface sits where the liquid's area in the drawing is the same as upright — the cross-section of
 * the profile, the same profile the upright level comes from (src/chem/apparatus.ts). The tilt is the least at which
 * the surface reaches the lip, plus a little: a full beaker pours at a slight angle, a nearly empty one is turned up.
 *
 * Geometry in the vessel's own frame: x across (cm, from the axis), h up from the inner bottom. Tipping by φ (to the
 * right, clockwise on the screen) puts a point at the world height h·cos φ − x·sin φ above the pivot's.
 */
import type { VesselData, VesselShape } from '../../chem/apparatus'
import { levelOf } from '../../chem/apparatus'
import type { ChemPalette } from './palette'
import type { Frame } from './glass'
import { STROKE, cavityPath, drawGlass, fx, fy, wallOf } from './glass'
import { absorption } from './liquid'

type Pt = [number, number]

/** The inner space of a vessel as a closed polygon (x, h), the left wall downwards, the right wall upwards. */
export function cavityPolygon(shape: VesselShape): Pt[] {
  const left: Pt[] = [], right: Pt[] = []
  for (let i = 0; i < shape.h.length; i++) { left.push([-shape.r[i], shape.h[i]]); right.push([shape.r[i], shape.h[i]]) }
  return [...left.reverse(), ...right]
}

/** Area of the part of a polygon where a·x + b·h ≤ c (Sutherland–Hodgman against one half-plane, then the shoelace). */
export function areaBelow(poly: Pt[], a: number, b: number, c: number): number {
  const out: Pt[] = []
  const n = poly.length
  const f = (p: Pt) => a * p[0] + b * p[1] - c
  for (let i = 0; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n]
    const fp = f(p), fq = f(q)
    if (fp <= 0) out.push(p)
    if ((fp <= 0) !== (fq <= 0)) { const t = fp / (fp - fq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]) }
  }
  let s = 0
  for (let i = 0; i < out.length; i++) { const p = out[i], q = out[(i + 1) % out.length]; s += p[0] * q[1] - q[0] * p[1] }
  return Math.abs(s) / 2
}

/** The c of the surface h·cos φ − x·sin φ = c under which the polygon holds `area` (bisection). */
export function surfaceAt(poly: Pt[], phi: number, area: number): number {
  const a = -Math.sin(phi), b = Math.cos(phi)
  let lo = Infinity, hi = -Infinity
  for (const p of poly) { const v = a * p[0] + b * p[1]; lo = Math.min(lo, v); hi = Math.max(hi, v) }
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (areaBelow(poly, a, b, mid) < area) lo = mid; else hi = mid }
  return (lo + hi) / 2
}

/** Area of the liquid in the drawing upright: the cross-section below its level. */
export function uprightArea(shape: VesselShape, volume_mL: number): number {
  if (!(volume_mL > 0)) return 0
  return areaBelow(cavityPolygon(shape), 0, 1, levelOf(shape, volume_mL))
}

/** The least tilt (rad) at which the surface of `volume_mL` reaches the lip at the top right; capped at 125°. */
export function lipTilt(shape: VesselShape, volume_mL: number): number {
  const poly = cavityPolygon(shape)
  const area = uprightArea(shape, volume_mL)
  const top = shape.top, r = shape.r[shape.r.length - 1]
  if (!(area > 0)) return (110 * Math.PI) / 180
  for (let deg = 0; deg <= 125; deg += 2.5) {
    const phi = (deg * Math.PI) / 180
    if (surfaceAt(poly, phi, area) >= top * Math.cos(phi) - r * Math.sin(phi) - 1e-6) return phi
  }
  return (125 * Math.PI) / 180
}

const cache = new Map<string, number>()
/** `lipTilt`, remembered per shape and volume (the volume does not change while a pour is held). */
export function lipTiltCached(shape: VesselShape, volume_mL: number): number {
  const key = `${shape.kind}@${shape.capacity_mL}:${volume_mL.toFixed(3)}`
  let v = cache.get(key)
  if (v === undefined) { v = lipTilt(shape, volume_mL); if (cache.size > 64) cache.clear(); cache.set(key, v) }
  return v
}

export interface TiltDraw {
  /** Screen point of the lip (the pivot). */
  lipX: number
  lipY: number
  /** Tilt, rad (positive: the mouth turns towards +x on the screen). */
  phi: number
  /** Pour to the left: the vessel is mirrored. */
  left: boolean
  ppc: number
  volume_mL: number
  colour: readonly [number, number, number] | null
  line: number
  selected?: boolean
}

/** Draw a tipped vessel with its level liquid. Returns the colour of its stream. */
export function drawTilted(ctx: CanvasRenderingContext2D, P: ChemPalette, shape: VesselShape, data: VesselData, d: TiltDraw): string {
  const t = wallOf(shape, data)
  const rTop = shape.r[shape.r.length - 1] + t
  // the frame puts the outer lip (top right) at the origin
  const f: Frame = { cx: -rTop * d.ppc, base: shape.top * d.ppc, ppc: d.ppc }
  const a = d.colour ? absorption(d.colour) : 0
  const own = d.colour && a > 0.004 ? `rgba(${d.colour[0]}, ${d.colour[1]}, ${d.colour[2]}, ${Math.min(0.94, Math.pow(a, 0.55)).toFixed(3)})` : null
  ctx.save()
  ctx.translate(d.lipX, d.lipY)
  if (d.left) ctx.scale(-1, 1)
  ctx.rotate(d.phi)
  if (d.volume_mL > 0) {
    const poly = cavityPolygon(shape)
    const c = surfaceAt(poly, d.phi, uprightArea(shape, d.volume_mL))
    const s = Math.sin(d.phi), co = Math.cos(d.phi)
    // the half-plane below the surface, as a large quad in the vessel's frame
    const L = (shape.top + shape.rMax * 2 + 4) * 2
    const p0: Pt = [-c * s, c * co], dir: Pt = [co, s], nrm: Pt = [-s, co]
    const q = (k: number, m: number): [number, number] => { const x = p0[0] + dir[0] * k - nrm[0] * m, h = p0[1] + dir[1] * k - nrm[1] * m; return [fx(f, x), fy(f, h)] }
    ctx.save()
    cavityPath(ctx, shape, f)
    ctx.clip()
    const quad = () => { ctx.beginPath(); const a0 = q(-L, 0), a1 = q(L, 0), a2 = q(L, L), a3 = q(-L, L); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.lineTo(a2[0], a2[1]); ctx.lineTo(a3[0], a3[1]); ctx.closePath(); ctx.fill() }
    if (own) { ctx.globalAlpha = Math.max(0.15, 1 - a); ctx.fillStyle = P.water; quad(); ctx.globalAlpha = 1; ctx.fillStyle = own; quad() } else { ctx.fillStyle = P.water; quad() }
    const e0 = q(-L, 0), e1 = q(L, 0)
    ctx.strokeStyle = P.waterLine
    ctx.lineWidth = Math.max(1, d.line * 1.25)
    ctx.beginPath(); ctx.moveTo(e0[0], e0[1]); ctx.lineTo(e1[0], e1[1]); ctx.stroke()
    ctx.restore()
  }
  drawGlass(ctx, P, shape, data, f, { line: d.line, selected: d.selected })
  ctx.restore()
  // the stream is seen without glass in front of it: a denser coat of the same colour
  return d.colour && own ? `rgba(${d.colour[0]}, ${d.colour[1]}, ${d.colour[2]}, ${Math.min(0.94, Math.max(0.5, Math.pow(a, 0.45))).toFixed(3)})` : P.stream
}

/**
 * The stream from a lip to a surface (screen points): it leaves the lip almost sideways and falls; `width` px.
 * Drawn as one filled ribbon with its two edges stroked, the way the glass is drawn.
 */
export function drawStream(ctx: CanvasRenderingContext2D, P: ChemPalette, x0: number, y0: number, x1: number, y1: number, width: number, tint: string, time: number, line: number) {
  if (!(y1 > y0 + 2)) return
  const pts: Pt[] = []
  const N = 14
  for (let i = 0; i <= N; i++) {
    const s = i / N
    // a short horizontal throw, then a fall; a slight waver along it
    const x = x0 + (x1 - x0) * (1 - (1 - s) * (1 - s)) + Math.sin(time * 18 + s * 9) * 0.35 * s
    pts.push([x, y0 + (y1 - y0) * s])
  }
  const w = (s: number) => width * (1 - 0.35 * s)
  ctx.save()
  ctx.beginPath()
  pts.forEach(([x, y], i) => { const k = w(i / N) / 2; if (i) ctx.lineTo(x - k, y); else ctx.moveTo(x - k, y) })
  for (let i = N; i >= 0; i--) { const [x, y] = pts[i]; ctx.lineTo(x + w(i / N) / 2, y) }
  ctx.closePath()
  ctx.fillStyle = tint
  ctx.fill()
  ctx.strokeStyle = P.waterLine
  ctx.lineWidth = Math.max(0.75, STROKE * line * 0.5)
  ctx.stroke()
  ctx.restore()
}
