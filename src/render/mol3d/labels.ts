/**
 * The 2D layer over the 3D picture (26.64, D271): element symbols on their atoms, δ+ / δ− marks, free-standing notes
 * (the dipole's value, an orbital's axes), the rings of picked atoms and the measurement between them. It follows the
 * camera's projection, is drawn with Canvas 2D for both the WebGL picture and the fallback, and goes into the exported
 * image.
 *
 * A symbol is drawn on an atom only when the ball is large enough to hold it and the atom's centre is not hidden behind
 * another atom; beyond `LABEL_LIMIT` atoms symbols are left out altogether (they would be a texture, not text).
 */
import { FONT } from '../style'
import type { Camera, Viewport } from './camera'
import { pixelSize, project, screenRay } from './camera'
import type { MolPalette } from './palette'
import { inkOn, toCss } from './palette'
import { raySphere } from './pick'
import type { Scene } from './scene'
import type { Vec3 } from './vec'
import { add, cross, dot, length, normalize, scale, sub } from './vec'

/** More atoms than this: no element symbols. */
export const LABEL_LIMIT = 400

/** A measurement to draw: the picked atoms in order and the text of its value (formatted from the core's result). */
export interface OverlayMeasurement { atoms: number[]; text: string }

export interface OverlayState {
  /** Element symbols. */
  labels: boolean
  /** Picked atoms, in the order picked. */
  selection: number[]
  /** Atom under the pointer, or −1. */
  hover: number
  measurement: OverlayMeasurement | null
  /** Type scale (projector mode: 1.4). */
  fontScale: number
}

export const EMPTY_OVERLAY: OverlayState = { labels: false, selection: [], hover: -1, measurement: null, fontScale: 1 }

/** True when another atom lies in front of the centre of atom `i`. */
export function occluded(scene: Scene, camera: Camera, vp: Viewport, i: number): boolean {
  const a = scene.atoms[i]
  const s = project(camera, vp, a.pos)
  const { origin, dir } = screenRay(camera, vp, s[0], s[1])
  const own = dot(sub(a.pos, origin), dir) - a.radius
  for (let j = 0; j < scene.atoms.length; j++) {
    if (j === i) continue
    const t = raySphere(origin, dir, scene.atoms[j].pos, scene.atoms[j].radius)
    if (t !== null && t < own) return true
  }
  return false
}

function haloText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, ink: string, ground: string) {
  ctx.lineJoin = 'round'
  ctx.lineWidth = 3.5
  ctx.strokeStyle = ground
  ctx.strokeText(text, x, y)
  ctx.fillStyle = ink
  ctx.fillText(text, x, y)
}

function badge(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, P: MolPalette, size: number) {
  ctx.font = `600 ${size}px ${FONT}`
  const w = ctx.measureText(text).width + size * 0.9, h = size * 1.55
  // Keep the badge inside the picture
  const cw = ctx.canvas.clientWidth || Infinity, ch = ctx.canvas.clientHeight || Infinity
  const bx = Math.min(Math.max(4, x - w / 2), Math.max(4, cw - w - 4)), by = Math.min(Math.max(4, y - h / 2), Math.max(4, ch - h - 4))
  ctx.beginPath()
  // roundRect is missing in WebViews older than 2022: a plain rectangle there
  if (typeof ctx.roundRect === 'function') ctx.roundRect(bx, by, w, h, h / 2)
  else ctx.rect(bx, by, w, h)
  ctx.fillStyle = toCss(P.bg, 0.94)
  ctx.fill()
  ctx.lineWidth = 1.25
  ctx.strokeStyle = toCss(P.accent)
  ctx.stroke()
  ctx.fillStyle = toCss(P.text)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, bx + w / 2, by + h / 2 + 0.5)
}

/** Points of the arc of an angle a–b–c (vertex b) at a third of the shorter leg, in world coordinates. */
export function angleArc(a: Vec3, b: Vec3, c: Vec3, steps = 16): Vec3[] {
  const u = sub(a, b), v = sub(c, b)
  const r = Math.min(length(u), length(v)) * 0.33
  const eu = normalize(u), ev = normalize(v)
  const n = cross(eu, ev)
  const total = Math.atan2(length(n), dot(eu, ev))
  // A direction in the plane of the angle, perpendicular to the first leg
  const side = length(n) > 1e-9 ? normalize(cross(normalize(n), eu)) : [0, 0, 0] as Vec3
  const out: Vec3[] = []
  for (let k = 0; k <= steps; k++) {
    const t = total * k / steps
    out.push(add(b, add(scale(eu, r * Math.cos(t)), scale(side, r * Math.sin(t)))))
  }
  return out
}

/** Draw the layer into a context whose units are CSS pixels. */
export function drawOverlay(ctx: CanvasRenderingContext2D, scene: Scene, camera: Camera, vp: Viewport, P: MolPalette, o: OverlayState) {
  const ground = toCss(P.bg, 0.9)
  const pos = (i: number) => project(camera, vp, scene.atoms[i].pos)
  const radiusPx = (i: number, s: Vec3) => scene.atoms[i].radius / pixelSize(camera, vp, s[2])
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const symbols = o.labels && scene.atoms.length <= LABEL_LIMIT
  for (const l of scene.labels) {
    if (l.kind === 'note') {
      const s = project(camera, vp, l.pos)
      ctx.font = `600 ${13 * o.fontScale}px ${FONT}`
      haloText(ctx, l.text, s[0], s[1], toCss(P.textMuted), ground)
      continue
    }
    const i = l.atom!
    if (l.kind === 'element' && !symbols) continue
    const s = pos(i), r = radiusPx(i, s)
    if (occluded(scene, camera, vp, i)) continue
    if (l.kind === 'charge') {
      ctx.font = `700 ${12.5 * o.fontScale}px ${FONT}`
      // Outwards from the middle of the picture, so the mark does not sit on a bond
      const mid = project(camera, vp, scene.centre)
      let ux = s[0] - mid[0], uy = s[1] - mid[1]
      const un = Math.hypot(ux, uy)
      if (un < 6) { ux = 0.7; uy = -0.7 } else { ux /= un; uy /= un }
      const d = Math.max(r, 5) + 11 * o.fontScale
      haloText(ctx, l.text, s[0] + ux * d, s[1] + uy * d, toCss(l.text === 'δ+' ? P.deltaPlus : P.deltaMinus), ground)
    } else if (scene.style === 'wire') {
      ctx.font = `600 ${12 * o.fontScale}px ${FONT}`
      haloText(ctx, l.text, s[0] + 9 * o.fontScale, s[1] - 8 * o.fontScale, toCss(P.text), ground)
    } else {
      // On the ball, in the ink that reads on its colour; two-letter symbols need a larger ball
      const size = Math.min(15 * o.fontScale, r * (l.text.length > 1 ? 0.95 : 1.15))
      if (size < 8.5) continue
      ctx.font = `600 ${size}px ${FONT}`
      ctx.fillStyle = toCss(inkOn(scene.atoms[i].colour))
      ctx.fillText(l.text, s[0], s[1] + size * 0.04)
    }
  }

  // Measurement: the legs, the arc of an angle, the value
  const sel = o.selection.filter(i => i >= 0 && i < scene.atoms.length)
  const accent = toCss(P.accent)
  if (sel.length >= 2) {
    ctx.strokeStyle = accent
    ctx.lineWidth = 1.75
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    sel.forEach((i, k) => { const s = pos(i); if (k) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]) })
    ctx.stroke()
    ctx.setLineDash([])
    if (sel.length === 3) {
      ctx.beginPath()
      angleArc(scene.atoms[sel[0]].pos, scene.atoms[sel[1]].pos, scene.atoms[sel[2]].pos).forEach((p, k) => { const s = project(camera, vp, p); if (k) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]) })
      ctx.stroke()
    }
  }
  if (o.hover >= 0 && o.hover < scene.atoms.length && !sel.includes(o.hover)) {
    const s = pos(o.hover)
    ctx.beginPath()
    ctx.arc(s[0], s[1], radiusPx(o.hover, s) + 3, 0, 2 * Math.PI)
    ctx.strokeStyle = toCss(P.accent, 0.55)
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
  sel.forEach((i, k) => {
    const s = pos(i), r = radiusPx(i, s) + 3.5
    ctx.beginPath()
    ctx.arc(s[0], s[1], r, 0, 2 * Math.PI)
    ctx.strokeStyle = ground
    ctx.lineWidth = 4.5
    ctx.stroke()
    ctx.strokeStyle = accent
    ctx.lineWidth = 2.25
    ctx.stroke()
    // The order of picking, at the ring's upper left: the second atom is the vertex of an angle
    const size = 10.5 * o.fontScale
    const bx = s[0] - r * 0.74 - size * 0.35, by = s[1] - r * 0.74 - size * 0.35
    ctx.beginPath()
    ctx.arc(bx, by, size * 0.78, 0, 2 * Math.PI)
    ctx.fillStyle = accent
    ctx.fill()
    ctx.font = `700 ${size}px ${FONT}`
    ctx.fillStyle = toCss(inkOn(P.accent))
    ctx.fillText(String(k + 1), bx, by + 0.5)
  })
  const m = o.measurement
  if (m && m.atoms.length >= 2 && m.atoms.every(i => i >= 0 && i < scene.atoms.length)) {
    const p = m.atoms.map(pos)
    let x: number, y: number
    if (p.length === 2) { x = (p[0][0] + p[1][0]) / 2; y = (p[0][1] + p[1][1]) / 2 - 14 * o.fontScale }
    else if (p.length === 3) {
      // Beyond the arc, along the bisector of the angle as it appears on the screen
      const bx = (p[0][0] + p[2][0]) / 2 - p[1][0], by = (p[0][1] + p[2][1]) / 2 - p[1][1]
      const d = Math.hypot(bx, by) || 1
      const reach = Math.min(Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]), Math.hypot(p[2][0] - p[1][0], p[2][1] - p[1][1])) * 0.33 + 20 * o.fontScale
      x = p[1][0] + bx / d * reach; y = p[1][1] + by / d * reach
    } else { x = (p[1][0] + p[2][0]) / 2; y = (p[1][1] + p[2][1]) / 2 - 14 * o.fontScale }
    badge(ctx, m.text, x, y, P, 13 * o.fontScale)
  }
  ctx.restore()
}
