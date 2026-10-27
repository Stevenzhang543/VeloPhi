/**
 * Scene editing operations used by the viewport and the panels: hit testing, placing objects (snapped
 * onto the surface under the cursor), creating connectors, deleting and duplicating. Hit tests and the surface
 * under the cursor are answered by the core (views.rs) for the shown state. Drag-to-create, handles,
 * annotations and the context-menu commands build on these in `./editor/`.
 */
import { tl } from '../i18n'
import type { BodyDef, ConnectorDef, Scene } from '../core/scene/types'
import { COULOMB_K, connectorAnchors } from '../core/scene/types'
import { addBody, addGround, addIncline, addPulley, nextId } from '../core/scene/build'
import type { BodyModel, System } from '../engine/model'
import type { Pose } from '../engine/views'
import { bodiesAtPoint, bodyAtPoint, pickAt, surfaceBelowPoint } from '../engine/views'
import type { EngineSession } from '../engine/session'
import type { Selection, Tool } from './store'

/** A world point (m). */
export interface Pt { x: number; y: number }

/**
 * The shown state as the core sees it: a session (the scene being edited, or a recording), the compiled model, the
 * drawn poses and the time shown (0 for a scene).
 */
export interface EditView { session: EngineSession; sys: System; poses: Pose[]; t: number }

/** Topmost object under a world point (tolerance in metres; computed in the core). */
export function hitTest(cp: EditView, p: Pt, tol: number): Selection {
  return pickAt(cp.session, p.x, p.y, tol, cp.t)
}

/** Topmost body containing the point within `tol` (m); dynamic bodies first. */
export function bodyAt(cp: EditView, p: Pt, tol: number, dynamicOnly = false): BodyModel | null {
  const id = bodyAtPoint(cp.session, p.x, p.y, tol, dynamicOnly, cp.t)
  return id === null ? null : cp.sys.model.byId.get(id) ?? null
}

/** Surface under the point: an upward-facing face within reach, as foot point, outward normal and angle. */
export function surfaceBelow(cp: EditView, p: Pt, reach = 0.6): { foot: Pt; n: Pt; angle: number } | null {
  return surfaceBelowPoint(cp.session, p.x, p.y, reach, cp.t)
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
export function placeObject(scene: Scene, cp: EditView, tool: Tool, p: Pt): string | null {
  const snap = surfaceBelow(cp, p)
  const onSurface = (halfH: number) => (snap ? { x: snap.foot.x + snap.n.x * halfH, y: snap.foot.y + snap.n.y * halfH, angle: snap.angle } : { x: p.x, y: p.y, angle: 0 })
  switch (tool) {
    case 'add-ball': {
      const r = 0.08, at = onSurface(r)
      return addBody(scene, { name: nextName(scene, tl('小球')), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: at.x, y: at.y }, mass: 0.5, material: { ...DYN_MATERIAL, restitution: 0.6 } }).id
    }
    case 'add-block': {
      const w = 0.3, h = 0.2, at = onSurface(h / 2)
      return addBody(scene, { name: nextName(scene, tl('物块')), role: 'block', shape: { type: 'box', width: w, height: h }, position: { x: at.x, y: at.y }, angle: at.angle, mass: 1, material: DYN_MATERIAL }).id
    }
    case 'add-disc': {
      const r = 0.15, at = onSurface(r)
      return addBody(scene, { name: nextName(scene, tl('圆柱')), role: 'wheel', shape: { type: 'circle', radius: r }, position: { x: at.x, y: at.y }, mass: 1, material: DYN_MATERIAL }).id
    }
    case 'add-wedge': {
      // Right-angled wedge (30°), a dynamic polygon; points are shifted to its centre of mass when compiled
      const base = 0.6, h = base * Math.tan(Math.PI / 6)
      const at = onSurface(h / 3)
      const pts = [{ x: -base / 3, y: -h / 3 }, { x: (2 * base) / 3, y: -h / 3 }, { x: -base / 3, y: (2 * h) / 3 }]
      return addBody(scene, { name: nextName(scene, tl('楔块')), role: 'generic', shape: { type: 'polygon', points: pts }, position: { x: at.x, y: at.y }, angle: at.angle, mass: 2, material: DYN_MATERIAL }).id
    }
    case 'add-ground':
      return addGround(scene, { name: nextName(scene, tl('地面')), top: p.y, left: p.x - 4, right: p.x + 4, material: STATIC_MATERIAL }).id
    case 'add-incline':
      return addIncline(scene, { name: nextName(scene, tl('斜面')), angle: Math.PI / 6, base: 3, x0: p.x, y0: p.y, material: STATIC_MATERIAL }).id
    case 'add-wall':
      return addBody(scene, { name: nextName(scene, tl('墙')), kind: 'static', role: 'wall', shape: { type: 'box', width: 0.2, height: 2 }, position: { x: p.x, y: p.y + 1 }, material: STATIC_MATERIAL }).id
    case 'add-conveyor':
      return addGround(scene, { name: nextName(scene, tl('传送带')), role: 'conveyor', top: p.y, left: p.x - 2, right: p.x + 2, thickness: 0.3, beltSpeed: 2, material: STATIC_MATERIAL }).id
    case 'add-pulley':
      return addPulley(scene, { name: nextName(scene, tl('滑轮')), position: { x: p.x, y: p.y }, radius: 0.05 }).id
    // 26.54 (D78)
    case 'add-charge': case 'add-fixed-charge':
      return addCharge(scene, tool === 'add-fixed-charge', p, 0.05)
    case 'add-polygon': {
      // Regular pentagon, a dynamic polygon about its centre of mass
      const r = 0.15, at = onSurface(r * Math.cos(Math.PI / 5))
      const pts = Array.from({ length: 5 }, (_, i) => ({ x: r * Math.cos(-Math.PI / 2 + Math.PI / 5 + (2 * Math.PI * i) / 5), y: r * Math.sin(-Math.PI / 2 + Math.PI / 5 + (2 * Math.PI * i) / 5) }))
      return addBody(scene, { name: nextName(scene, tl('多边形')), role: 'generic', shape: { type: 'polygon', points: pts }, position: { x: at.x, y: at.y }, angle: at.angle, mass: 1, material: DYN_MATERIAL, color: '#0d9488' }).id
    }
  }
  return null
}

/** World point → anchor on a body (local coordinates about its centre) or a world anchor. */
export function anchorFor(cp: EditView, p: Pt, tolCenter: number): { body: string | null; local: Pt; world: Pt } {
  const b = bodyAt(cp, p, 0, false)
  if (!b || !b.dynamic) return { body: null, local: { x: p.x, y: p.y }, world: { x: p.x, y: p.y } }
  const pose = cp.poses[b.global]
  if (Math.hypot(p.x - pose.x, p.y - pose.y) <= tolCenter) return { body: b.id, local: { x: 0, y: 0 }, world: { x: pose.x, y: pose.y } }
  const dx = p.x - pose.x, dy = p.y - pose.y
  return { body: b.id, local: { x: pose.c * dx + pose.s * dy, y: -pose.s * dx + pose.c * dy }, world: { x: p.x, y: p.y } }
}

/** Wrap direction at a pulley from the turn of the path P → C → N. */
export function wrapAt(prev: Pt, c: Pt, next: Pt): 'cw' | 'ccw' {
  const cr = (c.x - prev.x) * (next.y - c.y) - (c.y - prev.y) * (next.x - c.x)
  return cr < 0 ? 'cw' : 'ccw'
}

/** Create a rope, rod, spring, damper or gear between two anchors (not both in the world, not both on one body); returns its id. */
export function createConnector(scene: Scene, tool: Tool, a: { body: string | null; local: Pt; world: Pt }, b: { body: string | null; local: Pt; world: Pt }, pulleys: Array<{ pulley: string; wrap: 'cw' | 'ccw' }>): string | null {
  if (a.body === null && b.body === null) return null
  if (a.body !== null && a.body === b.body) return null
  const name = (base: string) => { const used = new Set(scene.connectors.map(c => c.name)); let k = 1; while (used.has(`${base}${k}`)) k++; return `${base}${k}` }
  let c: ConnectorDef
  const A = { body: a.body, local: { ...a.local } }, B = { body: b.body, local: { ...b.local } }
  if (tool === 'connect-rope') c = { id: nextId(scene, 'c'), name: name(tl('绳')), type: 'rope', a: A, b: B, pulleys, length: null }
  else if (tool === 'connect-rod') c = { id: nextId(scene, 'c'), name: name(tl('轻杆')), type: 'rod', a: A, b: B, length: null }
  else if (tool === 'connect-spring') c = { id: nextId(scene, 'c'), name: name(tl('弹簧')), type: 'spring', a: A, b: B, stiffness: 50, restLength: null, damping: 0 }
  else if (tool === 'connect-damper') c = { id: nextId(scene, 'c'), name: name(tl('阻尼器')), type: 'damper', a: A, b: B, damping: 2 }
  else if (tool === 'connect-gear') {
    // Gears join two bodies at their centres; the ratio of two discs is r_B / r_A (meshing: opposite senses)
    if (!a.body || !b.body) return null
    const ra = scene.bodies.find(x => x.id === a.body), rb = scene.bodies.find(x => x.id === b.body)
    const ratio = ra?.shape.type === 'circle' && rb?.shape.type === 'circle' ? rb.shape.radius / ra.shape.radius : 1
    c = { id: nextId(scene, 'c'), name: name(tl('齿轮')), type: 'gear', a: { body: a.body, local: { x: 0, y: 0 } }, b: { body: b.body, local: { x: 0, y: 0 } }, ratio: Number(ratio.toPrecision(12)) }
  } else return null
  scene.connectors.push(c)
  return c.id
}

/** Hinge at a point: the body under the point joined to a second body there, or to the world. */
export function createHinge(scene: Scene, cp: EditView, p: Pt): string | null {
  return createPin(scene, cp, p, 'hinge')
}

/** Kind of a connector placed at one point (D51). */
export type PinKind = 'hinge' | 'weld' | 'motor' | 'slider'

/**
 * A connector placed at one point: the body under the point joined to a second body there, or to the world.
 * Hinge and weld: A is the top body. Motor: the top body is driven (B) relative to the body below or the world (A).
 * Slider: the top body (B) slides relative to the body below or the world (A) along its own x axis.
 */
export function createPin(scene: Scene, cp: EditView, p: Pt, kind: PinKind): string | null {
  const poses = cp.poses
  const dyn = bodiesAtPoint(cp.session, p.x, p.y, cp.t).map(id => cp.sys.model.byId.get(id)!).filter(Boolean)
  if (dyn.length === 0) return null
  const first = dyn[0]
  const local = (b: BodyModel) => { const ps = poses[b.global]; const dx = p.x - ps.x, dy = p.y - ps.y; return { x: ps.c * dx + ps.s * dy, y: -ps.s * dx + ps.c * dy } }
  const second = dyn[1] ?? null
  const base = { hinge: tl('铰链'), weld: tl('焊接'), motor: tl('马达'), slider: tl('滑轨') }[kind]
  const nameOf = (k: number) => (kind === 'hinge' ? tl('铰链{0}', [k]) : `${base}${k}`)
  const used = new Set(scene.connectors.map(c => c.name)); let k = 1; while (used.has(nameOf(k))) k++
  const name = nameOf(k)
  const top = { body: first.id, local: local(first) }
  const below = second ? { body: second.id, local: local(second) } : { body: null, local: { x: p.x, y: p.y } }
  const id = nextId(scene, 'c')
  let c: ConnectorDef
  if (kind === 'hinge') c = { id, name, type: 'hinge', a: top, b: below }
  else if (kind === 'weld') c = { id, name, type: 'weld', a: top, b: below }
  else if (kind === 'motor') c = { id, name, type: 'motor', a: below, b: top, mode: 'speed', speed: 2, torque: 1 }
  else {
    // Axis: the top body's own x direction, expressed in the frame of A (the world, or the body below)
    const pf = poses[first.global]
    let ax = pf.c, ay = pf.s
    if (second) { const ps = poses[second.global]; const x = ps.c * ax + ps.s * ay, y = -ps.s * ax + ps.c * ay; ax = x; ay = y }
    c = { id, name, type: 'slider', a: below, b: top, axis: { x: Number(ax.toPrecision(12)), y: Number(ay.toPrecision(12)) } }
  }
  scene.connectors.push(c)
  return c.id
}

/** Create a constant force (5 N to the right) on the dynamic body under the point; returns its id. */
export function createForce(scene: Scene, cp: EditView, p: Pt): string | null {
  const b = bodyAt(cp, p, 0, true)
  if (!b) return null
  const ps = cp.poses[b.global]
  const dx = p.x - ps.x, dy = p.y - ps.y
  const near = Math.hypot(dx, dy) < 0.05
  const used = new Set(scene.connectors.map(c => c.name)); let k = 1; while (used.has(tl('拉力{0}', [k]))) k++
  const c: ConnectorDef = { id: nextId(scene, 'f'), name: tl('拉力{0}', [k]), type: 'force', a: { body: b.id, local: near ? { x: 0, y: 0 } : { x: ps.c * dx + ps.s * dy, y: -ps.s * dx + ps.c * dy } }, force: { x: 5, y: 0 } }
  scene.connectors.push(c)
  return c.id
}

/**
 * Create a central field (26.52, D60) at a point: on the body under it (at its centre of mass for a moving body), or
 * fixed in space. Inverse-square attraction of all moving bodies by default; returns its id.
 */
export function createCentral(scene: Scene, cp: EditView, p: Pt): string {
  const b = bodyAt(cp, p, 0, false)
  let a: ConnectorDef['a']
  if (b && b.dynamic) a = { body: b.id, local: { x: 0, y: 0 } }
  else if (b) { const ps = cp.poses[b.global], dx = p.x - ps.x, dy = p.y - ps.y; a = { body: b.id, local: { x: ps.c * dx + ps.s * dy, y: -ps.s * dx + ps.c * dy } } }
  else a = { body: null, local: { x: p.x, y: p.y } }
  const used = new Set(scene.connectors.map(c => c.name)); let k = 1; while (used.has(tl('力心{0}', [k]))) k++
  const c: ConnectorDef = { id: nextId(scene, 'z'), name: tl('力心{0}', [k]), type: 'central', a, k: 20, n: -2, targets: null }
  scene.connectors.push(c)
  return c.id
}

/** Remove an object and everything that refers to it. */
export function deleteObject(scene: Scene, sel: Selection) {
  if (!sel) return
  if (sel.kind === 'body') {
    scene.bodies = scene.bodies.filter(b => b.id !== sel.id)
    scene.connectors = scene.connectors.filter(c => !connectorAnchors(c).some(a => a.body === sel.id))
    for (const c of scene.connectors) if (c.type === 'central' && c.targets) c.targets = c.targets.filter(t => t !== sel.id)
    // Movable pulleys carried by the body go with it, and ropes stop running over them
    const carried = new Set(scene.pulleys.filter(p => p.body === sel.id).map(p => p.id))
    if (carried.size) {
      scene.pulleys = scene.pulleys.filter(p => !carried.has(p.id))
      for (const c of scene.connectors) if (c.type === 'rope') c.pulleys = c.pulleys.filter(p => !carried.has(p.pulley))
    }
    scene.contactPairs = scene.contactPairs.filter(p => p.a !== sel.id && p.b !== sel.id)
    scene.watch = scene.watch.filter(w => !w.split(/[.|]/).includes(sel.id))
    // 26.55: a rail loop goes with its rod
    if (scene.settings.railLoops) {
      scene.settings.railLoops = scene.settings.railLoops.filter(l => l.body !== sel.id)
      if (!scene.settings.railLoops.length) delete scene.settings.railLoops
    }
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
  for (const p of scene.pulleys.filter(q => q.body === id)) scene.pulleys.push({ ...JSON.parse(JSON.stringify(p)), id: nextId(scene, 'p'), name: nextName(scene, p.name.replace(/\d+$/, '') || tl('滑轮')), body: copy.id })
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

/** Default charge of a new charged body (C). */
export const DEFAULT_CHARGE = 1e-6

/**
 * Add a charged ball (26.54, D78): a particle, or a fixed point charge. When the scene has no field and no Coulomb
 * force yet, the Coulomb force is switched on so the charges act on each other.
 */
export function addCharge(scene: Scene, fixed: boolean, at: { x: number; y: number }, r: number): string {
  const st = scene.settings
  if (!st.electric && !st.magnetic && !st.coulomb) st.coulomb = { k: COULOMB_K }
  const body = fixed
    ? addBody(scene, { name: nextName(scene, tl('固定电荷')), kind: 'static', role: 'generic', shape: { type: 'circle', radius: r }, position: { x: at.x, y: at.y }, material: STATIC_MATERIAL, color: '#dc2626', charge: DEFAULT_CHARGE })
    : addBody(scene, { name: nextName(scene, tl('带电小球')), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: at.x, y: at.y }, mass: 0.01, material: { ...DYN_MATERIAL, restitution: 1 }, color: '#ef4444', charge: DEFAULT_CHARGE })
  return body.id
}
