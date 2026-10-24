/**
 * Scene editing operations used by the viewport and the panels: hit testing, placing objects (snapped
 * onto the surface under the cursor), creating connectors, deleting and duplicating. Drag-to-create, handles,
 * annotations and the context-menu commands build on these in `./editor/`.
 */
import type { BodyDef, ConnectorDef, Scene } from '../core/scene/types'
import { addBody, addGround, addIncline, addPulley, nextId } from '../core/scene/build'
import type { System } from '../core/solver/dynamics'
import type { Pose } from '../core/solver/kinematics'
import { anchorState, pulleyCenter, ropeKin } from '../core/solver/kinematics'
import type { BodyModel } from '../core/solver/model'
import { signedDistance } from '../core/solver/kinematics'
import type { Selection, Tool } from './store'

/** A world point (m). */
export interface Pt { x: number; y: number }

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const ex = b.x - a.x, ey = b.y - a.y, ee = ex * ex + ey * ey
  let u = ee > 0 ? ((p.x - a.x) * ex + (p.y - a.y) * ey) / ee : 0
  u = Math.max(0, Math.min(1, u))
  return Math.hypot(p.x - a.x - u * ex, p.y - a.y - u * ey)
}

/** Topmost object under a world point (tolerance in metres). */
export function hitTest(sys: System, poses: Pose[], p: Pt, tol: number): Selection {
  const model = sys.model
  for (const pl of model.pulleys) { const c = pulleyCenter(poses, pl); if (Math.hypot(p.x - c.x, p.y - c.y) <= pl.radius + tol) return { kind: 'pulley', id: pl.id } }
  for (const c of [...model.hinges]) { const a = anchorState(poses, c.a); if (Math.hypot(p.x - a.px, p.y - a.py) <= tol * 1.2) return { kind: 'connector', id: c.id } }
  for (const f of model.forces) { const a = anchorState(poses, f.a); if (Math.hypot(p.x - a.px, p.y - a.py) <= tol * 1.2) return { kind: 'connector', id: f.id } }
  const dyn = [...model.dynamic].reverse()
  for (const b of dyn) if (signedDistance(b, poses[b.global], p.x, p.y) <= tol * 0.5) return { kind: 'body', id: b.id }
  for (const r of model.ropes) {
    const pts = ropeKin(poses, r).path.points
    for (let i = 0; i + 1 < pts.length; i += 2) if (distToSegment(p, pts[i], pts[i + 1]) <= tol) return { kind: 'connector', id: r.id }
  }
  for (const c of [...model.rods, ...model.springs]) {
    const a = anchorState(poses, c.a), b = anchorState(poses, c.b)
    if (distToSegment(p, { x: a.px, y: a.py }, { x: b.px, y: b.py }) <= tol) return { kind: 'connector', id: c.id }
  }
  for (const b of [...model.bodies].reverse()) if (!b.dynamic && signedDistance(b, poses[b.global], p.x, p.y) <= 0) return { kind: 'body', id: b.id }
  return null
}

/** Topmost body containing the point within `tol` (m); dynamic bodies first. */
export function bodyAt(sys: System, poses: Pose[], p: Pt, tol: number, dynamicOnly = false): BodyModel | null {
  const list = [...sys.model.dynamic].reverse()
  if (!dynamicOnly) list.push(...[...sys.model.bodies].filter(b => !b.dynamic).reverse())
  for (const b of list) if (signedDistance(b, poses[b.global], p.x, p.y) <= tol) return b
  return null
}

/** Surface under the point: an upward-facing face within reach, as foot point, outward normal and angle. */
export function surfaceBelow(sys: System, poses: Pose[], p: Pt, reach = 0.6): { foot: Pt; n: Pt; angle: number } | null {
  let best: { foot: Pt; n: Pt; d: number } | null = null
  for (const b of sys.model.bodies) {
    if (b.shape.kind !== 'polygon') continue
    const pose = poses[b.global]
    const { verts, normals, lengths } = b.shape
    for (let f = 0; f < verts.length; f++) {
      const nl = normals[f]
      const n = { x: pose.c * nl.x - pose.s * nl.y, y: pose.s * nl.x + pose.c * nl.y }
      if (n.y < 0.25) continue
      const v = verts[f]
      const e0 = { x: pose.x + pose.c * v.x - pose.s * v.y, y: pose.y + pose.s * v.x + pose.c * v.y }
      const t = { x: -n.y, y: n.x }
      const along = (p.x - e0.x) * t.x + (p.y - e0.y) * t.y
      const d = (p.x - e0.x) * n.x + (p.y - e0.y) * n.y
      if (along < 0 || along > lengths[f] || d < -0.15 || d > reach) continue
      if (!best || Math.abs(d) < Math.abs(best.d)) best = { foot: { x: e0.x + t.x * along, y: e0.y + t.y * along }, n, d }
    }
  }
  if (!best) return null
  // A box lying on the face is turned so its up direction is the face normal
  const ang = Math.atan2(-best.n.x, best.n.y)
  return { foot: best.foot, n: best.n, angle: ang }
}

/** Default material of new moving bodies. */
export const DYN_MATERIAL = { muS: 0.3, muK: 0.3, restitution: 0 }
/** Default material of new fixed surfaces. */
export const STATIC_MATERIAL = { muS: 1, muK: 1, restitution: 1 }

let nameCounters: Record<string, number> = {}
/** Next free name "base1", "base2" …; numbering continues from the last name handed out for `base`. */
export function nextName(scene: Scene, base: string): string {
  const used = new Set(scene.bodies.map(b => b.name))
  let k = nameCounters[base] ?? 1
  while (used.has(`${base}${k}`)) k++
  nameCounters[base] = k + 1
  return `${base}${k}`
}
/** Restart the name counters of nextName (not used by the app or the tests). */
export function resetNameCounters() { nameCounters = {} }

/** Place a new object for an `add-*` tool. Returns the new id. */
export function placeObject(scene: Scene, sys: System, poses: Pose[], tool: Tool, p: Pt): string | null {
  const snap = surfaceBelow(sys, poses, p)
  const onSurface = (halfH: number) => (snap ? { x: snap.foot.x + snap.n.x * halfH, y: snap.foot.y + snap.n.y * halfH, angle: snap.angle } : { x: p.x, y: p.y, angle: 0 })
  switch (tool) {
    case 'add-ball': {
      const r = 0.08, at = onSurface(r)
      return addBody(scene, { name: nextName(scene, '小球'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: at.x, y: at.y }, mass: 0.5, material: { ...DYN_MATERIAL, restitution: 0.6 } }).id
    }
    case 'add-block': {
      const w = 0.3, h = 0.2, at = onSurface(h / 2)
      return addBody(scene, { name: nextName(scene, '物块'), role: 'block', shape: { type: 'box', width: w, height: h }, position: { x: at.x, y: at.y }, angle: at.angle, mass: 1, material: DYN_MATERIAL }).id
    }
    case 'add-disc': {
      const r = 0.15, at = onSurface(r)
      return addBody(scene, { name: nextName(scene, '圆柱'), role: 'wheel', shape: { type: 'circle', radius: r }, position: { x: at.x, y: at.y }, mass: 1, material: DYN_MATERIAL }).id
    }
    case 'add-wedge': {
      // Right-angled wedge (30°), a dynamic polygon; points are shifted to its centre of mass when compiled
      const base = 0.6, h = base * Math.tan(Math.PI / 6)
      const at = onSurface(h / 3)
      const pts = [{ x: -base / 3, y: -h / 3 }, { x: (2 * base) / 3, y: -h / 3 }, { x: -base / 3, y: (2 * h) / 3 }]
      return addBody(scene, { name: nextName(scene, '楔块'), role: 'generic', shape: { type: 'polygon', points: pts }, position: { x: at.x, y: at.y }, angle: at.angle, mass: 2, material: DYN_MATERIAL }).id
    }
    case 'add-ground':
      return addGround(scene, { name: nextName(scene, '地面'), top: p.y, left: p.x - 4, right: p.x + 4, material: STATIC_MATERIAL }).id
    case 'add-incline':
      return addIncline(scene, { name: nextName(scene, '斜面'), angle: Math.PI / 6, base: 3, x0: p.x, y0: p.y, material: STATIC_MATERIAL }).id
    case 'add-wall':
      return addBody(scene, { name: nextName(scene, '墙'), kind: 'static', role: 'wall', shape: { type: 'box', width: 0.2, height: 2 }, position: { x: p.x, y: p.y + 1 }, material: STATIC_MATERIAL }).id
    case 'add-conveyor':
      return addGround(scene, { name: nextName(scene, '传送带'), role: 'conveyor', top: p.y, left: p.x - 2, right: p.x + 2, thickness: 0.3, beltSpeed: 2, material: STATIC_MATERIAL }).id
    case 'add-pulley':
      return addPulley(scene, { name: nextName(scene, '滑轮'), position: { x: p.x, y: p.y }, radius: 0.05 }).id
    case 'add-polygon': {
      // Regular pentagon, a dynamic polygon about its centre of mass
      const r = 0.15, at = onSurface(r * Math.cos(Math.PI / 5))
      const pts = Array.from({ length: 5 }, (_, i) => ({ x: r * Math.cos(-Math.PI / 2 + Math.PI / 5 + (2 * Math.PI * i) / 5), y: r * Math.sin(-Math.PI / 2 + Math.PI / 5 + (2 * Math.PI * i) / 5) }))
      return addBody(scene, { name: nextName(scene, '多边形'), role: 'generic', shape: { type: 'polygon', points: pts }, position: { x: at.x, y: at.y }, angle: at.angle, mass: 1, material: DYN_MATERIAL, color: '#0d9488' }).id
    }
  }
  return null
}

/** World point → anchor on a body (local coordinates about its centre) or a world anchor. */
export function anchorFor(sys: System, poses: Pose[], p: Pt, tolCenter: number): { body: string | null; local: Pt; world: Pt } {
  const b = bodyAt(sys, poses, p, 0, false)
  if (!b || !b.dynamic) return { body: null, local: { x: p.x, y: p.y }, world: { x: p.x, y: p.y } }
  const pose = poses[b.global]
  if (Math.hypot(p.x - pose.x, p.y - pose.y) <= tolCenter) return { body: b.id, local: { x: 0, y: 0 }, world: { x: pose.x, y: pose.y } }
  const dx = p.x - pose.x, dy = p.y - pose.y
  return { body: b.id, local: { x: pose.c * dx + pose.s * dy, y: -pose.s * dx + pose.c * dy }, world: { x: p.x, y: p.y } }
}

/** Wrap direction at a pulley from the turn of the path P → C → N. */
export function wrapAt(prev: Pt, c: Pt, next: Pt): 'cw' | 'ccw' {
  const cr = (c.x - prev.x) * (next.y - c.y) - (c.y - prev.y) * (next.x - c.x)
  return cr < 0 ? 'cw' : 'ccw'
}

/** Create a rope, rod or spring between two anchors (not both in the world, not both on one body); returns its id. */
export function createConnector(scene: Scene, tool: Tool, a: { body: string | null; local: Pt; world: Pt }, b: { body: string | null; local: Pt; world: Pt }, pulleys: Array<{ pulley: string; wrap: 'cw' | 'ccw' }>): string | null {
  if (a.body === null && b.body === null) return null
  if (a.body !== null && a.body === b.body) return null
  const name = (base: string) => { const used = new Set(scene.connectors.map(c => c.name)); let k = 1; while (used.has(`${base}${k}`)) k++; return `${base}${k}` }
  let c: ConnectorDef
  const A = { body: a.body, local: { ...a.local } }, B = { body: b.body, local: { ...b.local } }
  if (tool === 'connect-rope') c = { id: nextId(scene, 'c'), name: name('绳'), type: 'rope', a: A, b: B, pulleys, length: null }
  else if (tool === 'connect-rod') c = { id: nextId(scene, 'c'), name: name('轻杆'), type: 'rod', a: A, b: B, length: null }
  else if (tool === 'connect-spring') c = { id: nextId(scene, 'c'), name: name('弹簧'), type: 'spring', a: A, b: B, stiffness: 50, restLength: null, damping: 0 }
  else return null
  scene.connectors.push(c)
  return c.id
}

/** Hinge at a point: the body under the point joined to a second body there, or to the world. */
export function createHinge(scene: Scene, sys: System, poses: Pose[], p: Pt): string | null {
  const dyn = [...sys.model.dynamic].reverse().filter(b => signedDistance(b, poses[b.global], p.x, p.y) <= 0)
  if (dyn.length === 0) return null
  const first = dyn[0]
  const local = (b: BodyModel) => { const ps = poses[b.global]; const dx = p.x - ps.x, dy = p.y - ps.y; return { x: ps.c * dx + ps.s * dy, y: -ps.s * dx + ps.c * dy } }
  const second = dyn[1] ?? null
  const used = new Set(scene.connectors.map(c => c.name)); let k = 1; while (used.has(`铰链${k}`)) k++
  const c: ConnectorDef = { id: nextId(scene, 'c'), name: `铰链${k}`, type: 'hinge', a: { body: first.id, local: local(first) }, b: second ? { body: second.id, local: local(second) } : { body: null, local: { x: p.x, y: p.y } } }
  scene.connectors.push(c)
  return c.id
}

/** Create a constant force (5 N to the right) on the dynamic body under the point; returns its id. */
export function createForce(scene: Scene, sys: System, poses: Pose[], p: Pt): string | null {
  const b = bodyAt(sys, poses, p, 0, true)
  if (!b) return null
  const ps = poses[b.global]
  const dx = p.x - ps.x, dy = p.y - ps.y
  const near = Math.hypot(dx, dy) < 0.05
  const used = new Set(scene.connectors.map(c => c.name)); let k = 1; while (used.has(`拉力${k}`)) k++
  const c: ConnectorDef = { id: nextId(scene, 'f'), name: `拉力${k}`, type: 'force', a: { body: b.id, local: near ? { x: 0, y: 0 } : { x: ps.c * dx + ps.s * dy, y: -ps.s * dx + ps.c * dy } }, force: { x: 5, y: 0 } }
  scene.connectors.push(c)
  return c.id
}

/** Remove an object and everything that refers to it. */
export function deleteObject(scene: Scene, sel: Selection) {
  if (!sel) return
  if (sel.kind === 'body') {
    scene.bodies = scene.bodies.filter(b => b.id !== sel.id)
    scene.connectors = scene.connectors.filter(c => c.a.body !== sel.id && (c.type === 'force' || c.b.body !== sel.id))
    // Movable pulleys carried by the body go with it, and ropes stop running over them
    const carried = new Set(scene.pulleys.filter(p => p.body === sel.id).map(p => p.id))
    if (carried.size) {
      scene.pulleys = scene.pulleys.filter(p => !carried.has(p.id))
      for (const c of scene.connectors) if (c.type === 'rope') c.pulleys = c.pulleys.filter(p => !carried.has(p.pulley))
    }
    scene.contactPairs = scene.contactPairs.filter(p => p.a !== sel.id && p.b !== sel.id)
    scene.watch = scene.watch.filter(w => !w.split(/[.|]/).includes(sel.id))
  } else if (sel.kind === 'pulley') {
    scene.pulleys = scene.pulleys.filter(p => p.id !== sel.id)
    for (const c of scene.connectors) if (c.type === 'rope') c.pulleys = c.pulleys.filter(p => p.pulley !== sel.id)
  } else {
    scene.connectors = scene.connectors.filter(c => c.id !== sel.id)
    scene.watch = scene.watch.filter(w => !w.startsWith(sel.id + '.'))
  }
}

/** Copy a body (and the movable pulleys it carries) 0.4 m to the right; returns the copy's id. */
export function duplicateBody(scene: Scene, id: string): string | null {
  const b = scene.bodies.find(x => x.id === id)
  if (!b) return null
  const copy: BodyDef = JSON.parse(JSON.stringify(b))
  copy.id = nextId(scene, b.kind === 'static' ? 's' : 'b')
  copy.name = nextName(scene, b.name.replace(/\d+$/, ''))
  copy.position = { x: b.position.x + 0.4, y: b.position.y }
  scene.bodies.push(copy)
  for (const p of scene.pulleys.filter(q => q.body === id)) scene.pulleys.push({ ...JSON.parse(JSON.stringify(p)), id: nextId(scene, 'p'), name: nextName(scene, p.name.replace(/\d+$/, '') || '滑轮'), body: copy.id })
  return copy.id
}

/** Sum a + d without the floating noise of repeated small steps (0.30000000000000004 → 0.3). */
const add = (a: number, d: number) => Number((a + d).toPrecision(12))

/** Move a body or pulley by (dx, dy) (m). */
export function moveObject(scene: Scene, sel: Selection, dx: number, dy: number) {
  if (!sel) return
  if (sel.kind === 'body') {
    const b = scene.bodies.find(x => x.id === sel.id)
    if (!b) return
    if (b.kind === 'static' && b.shape.type === 'polygon' && b.position.x === 0 && b.position.y === 0) {
      b.shape.points = b.shape.points.map(p => ({ x: add(p.x, dx), y: add(p.y, dy) }))
    } else { b.position.x = add(b.position.x, dx); b.position.y = add(b.position.y, dy) }
    // World anchors attached to nothing stay; anchors on the body move with it
  } else if (sel.kind === 'pulley') {
    const p = scene.pulleys.find(x => x.id === sel.id)
    if (!p) return
    const carrier = p.body ? scene.bodies.find(b => b.id === p.body) : null
    if (carrier) {
      // A movable pulley's axle is in the carrying body's coordinates: turn the world displacement into that frame
      const c = Math.cos(carrier.angle), s = Math.sin(carrier.angle)
      p.position.x = add(p.position.x, c * dx + s * dy)
      p.position.y = add(p.position.y, -s * dx + c * dy)
    } else { p.position.x = add(p.position.x, dx); p.position.y = add(p.position.y, dy) }
  }
}
