/**
 * Drag-to-create for the `add-*` tools and the polygon tool.
 *
 * A click places an object of default size (see `placeObject`, snapped onto surfaces); a press-drag sizes it:
 *   block, wall          rectangle from corner to corner;
 *   ball, disc, pulley   centre, then radius;
 *   ground, conveyor     horizontal extent, top surface at the press point;
 *   incline, wedge       right triangle: the right angle under the press point, base along the drag in x,
 *                        height along the drag in y (slope angle shown live).
 * The polygon tool collects clicked vertices; the result is made convex (hull) and stored about its centre of
 * mass as a dynamic body.
 */
import type { Scene } from '../../core/scene/types'
import { addBody, addGround, addPulley } from '../../core/scene/build'
import type { Tool } from '../store'
import { fmtQ } from '../settings'
import { DYN_MATERIAL, STATIC_MATERIAL, nextName } from '../editing'
import type { OverlayLabel, OverlayShape } from '../../render/overlay'
import type { Pt } from './geometry'
import { MIN_SIZE, centroid, clean, convexHull, isValidConvex, signedArea } from './geometry'

/** Tools that create an object by press-drag. */
export type DragTool = 'add-ball' | 'add-block' | 'add-disc' | 'add-wedge' | 'add-ground' | 'add-incline' | 'add-wall' | 'add-conveyor' | 'add-pulley'

const DRAG_TOOLS = new Set<Tool>(['add-ball', 'add-block', 'add-disc', 'add-wedge', 'add-ground', 'add-incline', 'add-wall', 'add-conveyor', 'add-pulley'])
/** Whether a tool creates by press-drag. */
export function isDragTool(t: Tool): t is DragTool { return DRAG_TOOLS.has(t) }

/** Thickness of drawn grounds and conveyors (m). */
const GROUND_TH = 0.4, BELT_TH = 0.3

const L = (v: number, digits = 4) => fmtQ(v, 'm', digits)

/** Radius of a centre-radius drag, a whole number of snap steps when snapping. */
function radiusOf(a: Pt, b: Pt, step: number): number {
  const r = Math.hypot(b.x - a.x, b.y - a.y)
  return step > 0 ? clean(Math.max(step, Math.round(r / step) * step)) : r
}
const A = (v: number) => fmtQ(v, 'rad', 3)

/** Right triangle of the incline and wedge tools (world, counter-clockwise) or null when too small. */
function triangle(a: Pt, b: Pt): { pts: Pt[]; base: number; h: number; angle: number } | null {
  const base = clean(Math.abs(b.x - a.x)), h = clean(Math.abs(b.y - a.y))
  if (base < MIN_SIZE || h < MIN_SIZE) return null
  const yb = Math.min(a.y, b.y), yt = Math.max(a.y, b.y)
  const C = { x: a.x, y: yb }, T = { x: a.x, y: yt }, E = { x: b.x, y: yb }
  const pts = b.x > a.x ? [C, E, T] : [E, C, T]
  return { pts, base, h, angle: Math.atan2(h, base) }
}

function rect(a: Pt, b: Pt): { cx: number; cy: number; w: number; h: number } {
  return { cx: clean((a.x + b.x) / 2), cy: clean((a.y + b.y) / 2), w: clean(Math.abs(b.x - a.x)), h: clean(Math.abs(b.y - a.y)) }
}

/** Preview of a drag from a to b: outline, dimension labels, and whether releasing would create something. */
export function dragPreview(tool: DragTool, a: Pt, b: Pt, step = 0): { shapes: OverlayShape[]; labels: OverlayLabel[]; ok: boolean } {
  const shapes: OverlayShape[] = [], labels: OverlayLabel[] = []
  switch (tool) {
    case 'add-block': case 'add-wall': {
      const r = rect(a, b)
      const ok = r.w >= MIN_SIZE && r.h >= MIN_SIZE
      shapes.push({ kind: 'poly', closed: true, fill: true, invalid: !ok, pts: [{ x: r.cx - r.w / 2, y: r.cy - r.h / 2 }, { x: r.cx + r.w / 2, y: r.cy - r.h / 2 }, { x: r.cx + r.w / 2, y: r.cy + r.h / 2 }, { x: r.cx - r.w / 2, y: r.cy + r.h / 2 }] })
      labels.push({ at: { x: r.cx, y: r.cy - r.h / 2 }, text: `宽 ${L(r.w)}`, center: true, dy: 16 })
      labels.push({ at: { x: r.cx + r.w / 2, y: r.cy }, text: `高 ${L(r.h)}`, dx: 8 })
      return { shapes, labels, ok }
    }
    case 'add-ball': case 'add-disc': case 'add-pulley': {
      const r = radiusOf(a, b, step)
      const ok = r >= MIN_SIZE
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1
      const edge = { x: a.x + (b.x - a.x) / d * r, y: a.y + (b.y - a.y) / d * r }
      shapes.push({ kind: 'circle', c: a, r, fill: true, invalid: !ok })
      shapes.push({ kind: 'line', a, b: edge, dashed: true })
      labels.push({ at: edge, text: `r = ${L(r)}`, dx: 8, dy: -6 })
      return { shapes, labels, ok }
    }
    case 'add-ground': case 'add-conveyor': {
      const th = tool === 'add-ground' ? GROUND_TH : BELT_TH
      const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x)
      const ok = x1 - x0 >= MIN_SIZE
      shapes.push({ kind: 'poly', closed: true, fill: true, invalid: !ok, pts: [{ x: x0, y: a.y - th }, { x: x1, y: a.y - th }, { x: x1, y: a.y }, { x: x0, y: a.y }] })
      labels.push({ at: { x: (x0 + x1) / 2, y: a.y }, text: `长 ${L(x1 - x0)}`, center: true, dy: -10 })
      return { shapes, labels, ok }
    }
    case 'add-incline': case 'add-wedge': {
      const tri = triangle(a, b)
      if (!tri) {
        shapes.push({ kind: 'line', a, b, dashed: true, invalid: true })
        return { shapes, labels, ok: false }
      }
      shapes.push({ kind: 'poly', closed: true, fill: true, pts: tri.pts })
      const [p0, p1] = b.x > a.x ? [tri.pts[0], tri.pts[1]] : [tri.pts[1], tri.pts[0]]
      labels.push({ at: { x: (p0.x + p1.x) / 2, y: p0.y }, text: `底 ${L(tri.base)}`, center: true, dy: 16 })
      labels.push({ at: { x: a.x, y: (Math.min(a.y, b.y) + Math.max(a.y, b.y)) / 2 }, text: `高 ${L(tri.h)}`, dx: b.x > a.x ? -8 - 70 : 8 })
      const foot = { x: b.x, y: Math.min(a.y, b.y) }
      shapes.push({ kind: 'arc', c: foot, rPx: 26, from: b.x > a.x ? Math.PI : 0, to: b.x > a.x ? Math.PI - tri.angle : tri.angle })
      labels.push({ at: foot, text: `θ = ${A(tri.angle)}`, dx: b.x > a.x ? -110 : 34, dy: -8 })
      return { shapes, labels, ok: true }
    }
  }
}

/** Create the object of a drag from a to b. Returns the new id and what it is, or null when too small. */
export function createFromDrag(scene: Scene, tool: DragTool, a: Pt, b: Pt, step = 0): { id: string; kind: 'body' | 'pulley' } | null {
  switch (tool) {
    case 'add-block': case 'add-wall': {
      const r = rect(a, b)
      if (r.w < MIN_SIZE || r.h < MIN_SIZE) return null
      if (tool === 'add-block') return { kind: 'body', id: addBody(scene, { name: nextName(scene, '物块'), role: 'block', shape: { type: 'box', width: r.w, height: r.h }, position: { x: r.cx, y: r.cy }, mass: 1, material: DYN_MATERIAL }).id }
      return { kind: 'body', id: addBody(scene, { name: nextName(scene, '墙'), kind: 'static', role: 'wall', shape: { type: 'box', width: r.w, height: r.h }, position: { x: r.cx, y: r.cy }, material: STATIC_MATERIAL }).id }
    }
    case 'add-ball': case 'add-disc': case 'add-pulley': {
      const r = radiusOf(a, b, step)
      if (r < MIN_SIZE) return null
      if (tool === 'add-pulley') return { kind: 'pulley', id: addPulley(scene, { name: nextName(scene, '滑轮'), position: { x: a.x, y: a.y }, radius: r }).id }
      if (tool === 'add-ball') return { kind: 'body', id: addBody(scene, { name: nextName(scene, '小球'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: a.x, y: a.y }, mass: 0.5, material: { ...DYN_MATERIAL, restitution: 0.6 } }).id }
      return { kind: 'body', id: addBody(scene, { name: nextName(scene, '圆柱'), role: 'wheel', shape: { type: 'circle', radius: r }, position: { x: a.x, y: a.y }, mass: 1, material: DYN_MATERIAL }).id }
    }
    case 'add-ground': case 'add-conveyor': {
      const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x)
      if (x1 - x0 < MIN_SIZE) return null
      if (tool === 'add-ground') return { kind: 'body', id: addGround(scene, { name: nextName(scene, '地面'), top: a.y, left: x0, right: x1, thickness: GROUND_TH, material: STATIC_MATERIAL }).id }
      return { kind: 'body', id: addGround(scene, { name: nextName(scene, '传送带'), role: 'conveyor', top: a.y, left: x0, right: x1, thickness: BELT_TH, beltSpeed: 2, material: STATIC_MATERIAL }).id }
    }
    case 'add-incline': {
      const tri = triangle(a, b)
      if (!tri) return null
      // Like addIncline: a static polygon with its points in world coordinates (origin at 0)
      return { kind: 'body', id: addBody(scene, { name: nextName(scene, '斜面'), kind: 'static', role: 'incline', shape: { type: 'polygon', points: tri.pts }, position: { x: 0, y: 0 }, material: STATIC_MATERIAL }).id }
    }
    case 'add-wedge': {
      const tri = triangle(a, b)
      if (!tri) return null
      const c = centroid(tri.pts)
      return { kind: 'body', id: addBody(scene, { name: nextName(scene, '楔块'), role: 'generic', shape: { type: 'polygon', points: tri.pts.map(p => ({ x: p.x - c.x, y: p.y - c.y })) }, position: c, mass: 2, material: DYN_MATERIAL }).id }
    }
  }
}

// ---- Polygon tool ----

/**
 * Create a dynamic convex polygon from clicked world points. Returns the id and the number of points dropped
 * to keep it convex, or an error text.
 */
export function createPolygon(scene: Scene, pts: Pt[]): { id: string; dropped: number } | { error: string } {
  const hull = convexHull(pts)
  if (hull.length < 3 || Math.abs(signedArea(hull)) < 1e-6 || !isValidConvex(hull)) return { error: '顶点太少或几乎共线，无法构成多边形' }
  const c = centroid(hull)
  const local = hull.map(p => ({ x: p.x - c.x, y: p.y - c.y }))
  const id = addBody(scene, { name: nextName(scene, '多边形'), role: 'generic', shape: { type: 'polygon', points: local }, position: c, mass: 1, material: DYN_MATERIAL, color: '#0d9488' }).id
  return { id, dropped: pts.length - hull.length }
}

/** Preview of the polygon being drawn: placed points, the edge to the cursor and the convex result. */
export function polygonPreview(pts: Pt[], cursor: Pt | null, closeHot: boolean): { shapes: OverlayShape[]; labels: OverlayLabel[] } {
  const shapes: OverlayShape[] = [], labels: OverlayLabel[] = []
  if (pts.length === 0) return { shapes, labels }
  const all = cursor && !closeHot ? [...pts, cursor] : pts
  if (all.length >= 3) {
    const hull = convexHull(all)
    if (hull.length >= 3) shapes.push({ kind: 'poly', pts: hull, closed: true, fill: true, dashed: true })
  }
  shapes.push({ kind: 'poly', pts: cursor ? [...pts, closeHot ? pts[0] : cursor] : pts, closed: false })
  if (cursor && !closeHot) {
    const last = pts[pts.length - 1]
    labels.push({ at: cursor, text: L(Math.hypot(cursor.x - last.x, cursor.y - last.y)), dx: 10, dy: -8 })
  }
  return { shapes, labels }
}
