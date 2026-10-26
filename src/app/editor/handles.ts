/**
 * Selection handles of the studio editor and what dragging them does:
 *   box      8 resize handles (the opposite corner or edge stays fixed) and a rotation handle;
 *   circle   a radius handle;
 *   polygon  a handle per vertex (dynamic and static polygons, inclines included) and a rotation handle;
 *   pulley   a radius handle.
 * Every drag starts from a copy of the body taken at mouse-down and recomputes the body from it on each
 * move, so a drag is exact and repeatable; anchors and movable pulleys attached to the body are remapped so
 * they stay on the same material point.
 */
import { tl } from '../../i18n'
import type { BodyDef, PulleyDef, Scene } from '../../core/scene/types'
import type { Pt, Attachments } from './geometry'
import {
  MIN_SIZE, bodyCenter, captureAttachments, centroid, clean, closestOnSegment, pulleyWorld, isValidSimple, localVerts, remapAttachments,
  rotate, signedArea, toLocalPt, toWorldPt, worldVerts, writePolygon
} from './geometry'
import { roundTo } from './snap'

/** Which handle; corners and edges carry the side signs (sx, sy) in body coordinates. */
export type HandleId =
  | { kind: 'corner' | 'edge'; sx: number; sy: number }
  | { kind: 'rotate' }
  | { kind: 'radius' }
  | { kind: 'vertex'; index: number }

/** A handle and its world position. */
export interface Handle { id: HandleId; at: Pt }

/** Distance (screen px) of the rotation handle beyond the shape. */
export const ROTATE_PX = 26

/** Stable string key of a handle. */
export function handleKey(h: HandleId): string {
  return h.kind === 'vertex' ? `v${h.index}` : h.kind === 'corner' || h.kind === 'edge' ? `${h.kind}${h.sx},${h.sy}` : h.kind
}

/** Handles of a body definition at zoom `ppm`. */
export function bodyHandles(def: BodyDef, ppm: number): Handle[] {
  const out: Handle[] = []
  if (def.shape.type === 'circle') {
    const r = rotate({ x: def.shape.radius, y: 0 }, 0)
    out.push({ id: { kind: 'radius' }, at: { x: def.position.x + r.x, y: def.position.y + r.y } })
    return out
  }
  if (def.shape.type === 'box') {
    const w = def.shape.width / 2, h = def.shape.height / 2
    // Edge handles only where the side is long enough on screen to tell them from the corners
    const wide = def.shape.width * ppm >= 56, tall = def.shape.height * ppm >= 56
    for (const sy of [-1, 0, 1]) for (const sx of [-1, 0, 1]) {
      if (sx === 0 && sy === 0) continue
      if ((sx === 0 && !wide) || (sy === 0 && !tall)) continue
      out.push({ id: { kind: sx !== 0 && sy !== 0 ? 'corner' : 'edge', sx, sy }, at: toWorldPt(def, { x: sx * w, y: sy * h }) })
    }
    out.push({ id: { kind: 'rotate' }, at: toWorldPt(def, { x: 0, y: h + ROTATE_PX / ppm }) })
    return out
  }
  const wv = worldVerts(def)
  wv.forEach((p, index) => out.push({ id: { kind: 'vertex', index }, at: p }))
  out.push({ id: { kind: 'rotate' }, at: rotateHandleAt(def, ppm) })
  return out
}

/** Point above a polygon's centre at its top (in the body's up direction), `extraPx` further out. */
function polygonTop(def: BodyDef, ppm: number, extraPx: number): Pt {
  const c = bodyCenter(def)
  const lc = toLocalPt(def, c)
  let top = -Infinity
  for (const v of localVerts(def)) top = Math.max(top, v.y - lc.y)
  const up = rotate({ x: 0, y: top + extraPx / ppm }, def.angle)
  return { x: c.x + up.x, y: c.y + up.y }
}

function rotateHandleAt(def: BodyDef, ppm: number): Pt { return polygonTop(def, ppm, ROTATE_PX) }

/** Point the rotation stem starts from (top middle of the shape). */
export function rotateStemFrom(def: BodyDef, ppm: number): Pt {
  if (def.shape.type === 'box') return toWorldPt(def, { x: 0, y: def.shape.height / 2 })
  return polygonTop(def, ppm, 0)
}

/** Radius handle of a pulley, to the right of its (world) axle. */
export function pulleyHandles(scene: Scene, p: PulleyDef): Handle[] {
  const c = pulleyWorld(scene, p)
  return [{ id: { kind: 'radius' }, at: { x: c.x + Math.max(p.radius, 0), y: c.y } }]
}

/** Nearest handle within `tol` of p. */
export function hitHandle(handles: Handle[], p: Pt, tol: number): Handle | null {
  let best: Handle | null = null, bd = tol
  for (const h of handles) {
    const d = Math.hypot(h.at.x - p.x, h.at.y - p.y)
    if (d <= bd) { bd = d; best = h }
  }
  return best
}

/** Polygon or box edge under p (within tol): edge index (from vertex i to i + 1) and the point on it. */
export function edgeAt(def: BodyDef, p: Pt, tol: number): { index: number; local: Pt } | null {
  if (def.shape.type === 'circle') return null
  const wv = worldVerts(def)
  let best: { index: number; local: Pt } | null = null, bd = tol
  for (let i = 0; i < wv.length; i++) {
    const r = closestOnSegment(p, wv[i], wv[(i + 1) % wv.length])
    if (r.d <= bd && r.u > 0.02 && r.u < 0.98) { bd = r.d; best = { index: i, local: toLocalPt(def, r.q) } }
  }
  return best
}

// ---- Dragging ----

/** State of a handle drag, captured at mouse-down. */
export interface HandleDrag {
  bodyId: string | null
  pulleyId: string | null
  handle: HandleId
  /** Body (or pulley) as it was at mouse-down. */
  orig: BodyDef | null
  origPulley: PulleyDef | null
  /** Anchors and pulleys on the body, remapped as it changes. */
  att: Attachments | null
  /** Pointer angle about the centre at mouse-down (rotation). */
  startAngle: number
  /** Rotation centre (world) and, for static polygons, the centroid in body coordinates. */
  center: Pt
}

/** What the overlay shows during a drag. */
export interface DragFeedback {
  /** World outline of a rejected vertex position (drawn red). */
  invalid: Pt[] | null
  /** Dimension labels: text at a world point. */
  labels: Array<{ at: Pt; text: string }>
}

/** Begin dragging a handle of a body or pulley; null when the target is gone. */
export function startHandleDrag(scene: Scene, target: { body?: string; pulley?: string }, handle: HandleId, pointer: Pt): HandleDrag | null {
  if (target.pulley) {
    const p = scene.pulleys.find(x => x.id === target.pulley)
    if (!p) return null
    return { bodyId: null, pulleyId: p.id, handle, orig: null, origPulley: JSON.parse(JSON.stringify(p)), att: null, startAngle: 0, center: pulleyWorld(scene, p) }
  }
  const b = scene.bodies.find(x => x.id === target.body)
  if (!b) return null
  // Polygons are edited counter-clockwise; normalise a clockwise one first (part of this undo step)
  if (b.shape.type === 'polygon' && signedArea(b.shape.points) < 0) {
    b.shape.points = b.shape.points.slice().reverse()
    if (handle.kind === 'vertex') handle = { kind: 'vertex', index: b.shape.points.length - 1 - handle.index }
  }
  const center = bodyCenter(b)
  return {
    bodyId: b.id, pulleyId: null, handle, orig: JSON.parse(JSON.stringify(b)), origPulley: null,
    att: captureAttachments(scene, b.id), startAngle: Math.atan2(pointer.y - center.y, pointer.x - center.x), center
  }
}

/** Modifiers and formatting of a drag. */
export interface DragOptions {
  /** Snapping active (grid on and Alt not held). */
  snap: boolean
  /** Snap step (m). */
  step: number
  /** Shift: free rotation; keep proportions when resizing from a corner. */
  shift: boolean
  /** Angle snap (rad); 0 = off. */
  angleSnap: number
  /** Magnetic angle snapping (D47): maps a free angle to the snapped one; null: none. */
  magnet?: ((angle: number) => number) | null
  /** Formats a length / an angle for labels. */
  fmtLen: (v: number) => string
  fmtAng: (v: number) => string
}

const isAxisAligned = (angle: number) => {
  const q = Math.abs(angle / (Math.PI / 2) - Math.round(angle / (Math.PI / 2)))
  return q < 1e-9
}

/** Apply the drag for pointer p (world, snapped to the grid by the caller when snapping is on). */
export function applyHandleDrag(scene: Scene, d: HandleDrag, p: Pt, o: DragOptions): DragFeedback {
  const fb: DragFeedback = { invalid: null, labels: [] }
  if (d.pulleyId) {
    const pl = scene.pulleys.find(x => x.id === d.pulleyId)
    if (!pl || !d.origPulley) return fb
    let r = Math.hypot(p.x - d.center.x, p.y - d.center.y)
    if (o.snap) r = roundTo(r, o.step)
    pl.radius = clean(Math.max(MIN_SIZE, r))
    fb.labels.push({ at: { x: d.center.x + pl.radius, y: d.center.y }, text: `r = ${o.fmtLen(pl.radius)}` })
    return fb
  }
  const def = scene.bodies.find(x => x.id === d.bodyId)
  const orig = d.orig
  if (!def || !orig) return fb
  const h = d.handle
  if (h.kind === 'rotate') return rotateBody(def, orig, d, p, o, fb)
  if (h.kind === 'radius' && orig.shape.type === 'circle') {
    let r = Math.hypot(p.x - orig.position.x, p.y - orig.position.y)
    if (o.snap) r = roundTo(r, o.step)
    r = clean(Math.max(MIN_SIZE, r))
    def.shape = { type: 'circle', radius: r }
    const k = r / orig.shape.radius
    if (d.att) remapAttachments(d.att, q => ({ x: q.x * k, y: q.y * k }))
    fb.labels.push({ at: { x: orig.position.x + r, y: orig.position.y }, text: `r = ${o.fmtLen(r)}` })
    return fb
  }
  if ((h.kind === 'corner' || h.kind === 'edge') && orig.shape.type === 'box') return resizeBox(def, orig, d, h, p, o, fb)
  if (h.kind === 'vertex' && orig.shape.type === 'polygon') {
    const verts = localVerts(orig)
    const cand = verts.map(v => ({ ...v }))
    const lp = toLocalPt(orig, p)
    cand[h.index] = { x: clean(lp.x), y: clean(lp.y) }
    if (!isValidSimple(cand)) {
      fb.invalid = cand.map(l => toWorldPt(orig, l))
      return fb
    }
    writePolygon(def, orig, cand, d.att)
    const n = cand.length
    const a = cand[(h.index + n - 1) % n], b = cand[h.index], c = cand[(h.index + 1) % n]
    fb.labels.push({ at: toWorldPt(orig, b), text: `${o.fmtLen(Math.hypot(b.x - a.x, b.y - a.y))} · ${o.fmtLen(Math.hypot(c.x - b.x, c.y - b.y))}` })
    return fb
  }
  return fb
}

function resizeBox(def: BodyDef, orig: BodyDef, d: HandleDrag, h: { sx: number; sy: number; kind: string }, p: Pt, o: DragOptions, fb: DragFeedback): DragFeedback {
  if (orig.shape.type !== 'box') return fb
  const w = orig.shape.width, hh = orig.shape.height
  const l = toLocalPt(orig, p)
  const fx = -h.sx * w / 2, fy = -h.sy * hh / 2
  let nw = w, nh = hh
  if (h.sx !== 0) nw = h.sx * (l.x - fx)
  if (h.sy !== 0) nh = h.sy * (l.y - fy)
  // A rotated box cannot follow grid points; snap its sizes instead
  if (o.snap && !isAxisAligned(orig.angle)) {
    if (h.sx !== 0) nw = roundTo(nw, o.step)
    if (h.sy !== 0) nh = roundTo(nh, o.step)
  }
  if (o.shift && h.kind === 'corner') {
    const k = Math.max(nw / w, nh / hh)
    nw = w * k; nh = hh * k
  }
  nw = clean(Math.max(MIN_SIZE, nw)); nh = clean(Math.max(MIN_SIZE, nh))
  const cx = h.sx !== 0 ? fx + h.sx * nw / 2 : 0
  const cy = h.sy !== 0 ? fy + h.sy * nh / 2 : 0
  const cw = toWorldPt(orig, { x: cx, y: cy })
  const c = { x: clean(cw.x), y: clean(cw.y) }
  def.shape = { type: 'box', width: nw, height: nh }
  def.position = c
  const kx = nw / w, ky = nh / hh
  if (d.att) remapAttachments(d.att, q => ({ x: q.x * kx, y: q.y * ky }))
  const tmp = { ...orig, position: c, shape: def.shape }
  if (h.sx !== 0 || h.kind === 'corner') fb.labels.push({ at: toWorldPt(tmp, { x: 0, y: -nh / 2 }), text: tl('宽 {0}', [o.fmtLen(nw)]) })
  if (h.sy !== 0 || h.kind === 'corner') fb.labels.push({ at: toWorldPt(tmp, { x: nw / 2, y: 0 }), text: tl('高 {0}', [o.fmtLen(nh)]) })
  return fb
}

function rotateBody(def: BodyDef, orig: BodyDef, d: HandleDrag, p: Pt, o: DragOptions, fb: DragFeedback): DragFeedback {
  const a = Math.atan2(p.y - d.center.y, p.x - d.center.x)
  let delta = a - d.startAngle
  while (delta > Math.PI) delta -= 2 * Math.PI
  while (delta < -Math.PI) delta += 2 * Math.PI
  const snap = !o.shift && o.angleSnap > 0
  if (orig.kind === 'static' && orig.shape.type === 'polygon') {
    // Static polygons (inclines) keep their points in the body frame: turn the points about the centroid
    if (snap) delta = Math.round(delta / o.angleSnap) * o.angleSnap
    const verts = localVerts(orig)
    const c = centroid(verts)
    const turn = (q: Pt) => { const r = rotate({ x: q.x - c.x, y: q.y - c.y }, delta); return { x: c.x + r.x, y: c.y + r.y } }
    def.shape = { type: 'polygon', points: verts.map(turn) }
    if (d.att) remapAttachments(d.att, turn)
    fb.labels.push({ at: d.center, text: tl('转过 {0}', [o.fmtAng(delta)]) })
    return fb
  }
  let ang = orig.angle + delta
  if (snap) ang = Math.round(ang / o.angleSnap) * o.angleSnap
  else if (o.magnet && !o.shift) ang = o.magnet(ang)
  // Keep the stored angle in (−π, π]
  while (ang > Math.PI) ang -= 2 * Math.PI
  while (ang <= -Math.PI) ang += 2 * Math.PI
  if (Math.abs(ang) < 1e-12) ang = 0
  def.angle = ang
  fb.labels.push({ at: d.center, text: `θ = ${o.fmtAng(ang)}` })
  return fb
}

/** Insert a vertex on edge `index` at local point `local` (a box is converted to a polygon first). */
export function insertVertex(def: BodyDef, index: number, local: Pt): number {
  if (def.shape.type === 'box') def.shape = { type: 'polygon', points: localVerts(def) }
  if (def.shape.type !== 'polygon') return -1
  const verts = localVerts(def)
  verts.splice(index + 1, 0, { x: local.x, y: local.y })
  def.shape = { type: 'polygon', points: verts }
  return index + 1
}

/** Delete vertex `index` of a polygon body (at least 3 remain); re-centres dynamic bodies. Returns false when refused. */
export function deleteVertex(scene: Scene, def: BodyDef, index: number): boolean {
  if (def.shape.type !== 'polygon') return false
  const verts = localVerts(def)
  if (verts.length <= 3) return false
  const rest = verts.filter((_, i) => i !== index)
  if (!isValidSimple(rest)) return false
  const orig: BodyDef = JSON.parse(JSON.stringify(def))
  writePolygon(def, orig, rest, captureAttachments(scene, def.id))
  return true
}
