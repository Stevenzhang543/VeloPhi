/**
 * Shape operations of 26.52 (D35), pure functions of the scene: split a compound body into its parts, combine bodies
 * into one compound body, and cut polygons and boxes along a line. Mass is shared by area (uniform density), initial
 * velocities are the rigid-body velocities at the new centres of mass, and every anchor, movable pulley, central-field
 * target and contact pair that referred to a changed body is carried over to the piece it belongs to.
 */
import { tl } from '../../i18n'
import type { Anchor, BodyDef, PartShapeDef, Scene, ShapePart } from '../../core/scene/types'
import { connectorAnchors } from '../../core/scene/types'
import { nextId } from '../../core/scene/build'
import { compoundMass, polygonCentroid, shapeOutline } from '../../core/solver/model'
import type { Pt } from './geometry'
import { centroid, clean, localVerts, rotate, signedArea, toLocalPt, toWorldPt } from './geometry'

/** A unique name `${base}${k}` not used by any body. */
function freshName(scene: Scene, base: string): string {
  const used = new Set(scene.bodies.map(b => b.name))
  let k = 1
  while (used.has(`${base}${k}`)) k++
  return `${base}${k}`
}

/** Area of a part shape (m²). */
function partArea(s: PartShapeDef): number {
  if (s.type === 'circle') return Math.PI * s.radius * s.radius
  if (s.type === 'box') return s.width * s.height
  return Math.abs(signedArea(s.points))
}

/** Rigid-body velocity of a body definition at a world point (its initial state). */
function velocityAt(def: BodyDef, p: Pt): Pt {
  if (def.kind === 'static') return { x: 0, y: 0 }
  const w = def.kind === 'rigid' && !def.fixedRotation ? def.angularVelocity : 0
  return { x: def.velocity.x - w * (p.y - def.position.y), y: def.velocity.y + w * (p.x - def.position.x) }
}

/** Point-in-polygon (even–odd) for a world polygon. */
function inside(poly: Pt[], p: Pt): boolean {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c
  }
  return c
}

/** A new body made from `orig`: its kind, material, colour and drag, with the given shape, pose and mass. */
function derived(scene: Scene, orig: BodyDef, name: string, shape: BodyDef['shape'], position: Pt, angle: number, mass: number, at: Pt): BodyDef {
  const v = velocityAt(orig, at)
  const b: BodyDef = {
    id: nextId(scene, orig.kind === 'static' ? 's' : 'b'), name, kind: orig.kind, role: orig.role === 'block' || orig.role === 'ground' || orig.role === 'wall' || orig.role === 'incline' ? orig.role : 'generic',
    shape, position: { x: clean(position.x), y: clean(position.y) }, angle: clean(angle),
    velocity: { x: clean(v.x), y: clean(v.y) }, angularVelocity: orig.kind === 'rigid' ? orig.angularVelocity : 0,
    mass: orig.kind === 'static' ? orig.mass : mass, inertia: null, fixedRotation: orig.fixedRotation,
    material: { ...orig.material }, beltSpeed: orig.beltSpeed, color: orig.color
  }
  if (orig.drag) b.drag = { ...orig.drag }
  return b
}

/**
 * Hand over everything that referred to `oldId` to the new bodies: anchors and movable pulleys go to the body whose
 * region holds their world point (`owner`), central-field targets and contact pairs to every new body; the watch list
 * drops the old body's quantities.
 */
function reassign(scene: Scene, old: BodyDef, made: BodyDef[], owner: (w: Pt) => BodyDef) {
  const move = (a: Anchor) => {
    if (a.body !== old.id) return
    const w = toWorldPt(old, a.local)
    const b = owner(w)
    a.body = b.id
    const l = toLocalPt(b, w)
    a.local = { x: clean(l.x), y: clean(l.y) }
  }
  for (const c of scene.connectors) {
    for (const a of connectorAnchors(c)) move(a)
    if (c.type === 'central' && c.targets?.includes(old.id)) c.targets = [...c.targets.filter(t => t !== old.id), ...made.map(b => b.id)]
  }
  for (const p of scene.pulleys) {
    if (p.body !== old.id) continue
    const w = toWorldPt(old, p.position)
    const b = owner(w)
    const l = toLocalPt(b, w)
    p.body = b.id
    p.position = { x: clean(l.x), y: clean(l.y) }
  }
  const pairs = scene.contactPairs.filter(p => p.a === old.id || p.b === old.id)
  scene.contactPairs = scene.contactPairs.filter(p => p.a !== old.id && p.b !== old.id)
  for (const p of pairs) for (const b of made) scene.contactPairs.push({ ...p, a: p.a === old.id ? b.id : p.a, b: p.b === old.id ? b.id : p.b })
  scene.watch = scene.watch.filter(w => !w.split(/[.|]/).includes(old.id))
}

// ---- Explode ----

/** Split a compound body into one body per part (in place of it); returns the first new id, or null. */
export function explodeCompound(scene: Scene, id: string): string | null {
  const old = scene.bodies.find(b => b.id === id)
  if (!old || old.shape.type !== 'compound' || old.shape.parts.length < 1) return null
  const dynamic = old.kind !== 'static'
  // The parts as the solver places them (a dynamic compound about its centre of mass)
  const shift = dynamic ? compoundMass(old.shape, 1).centroid : { x: 0, y: 0 }
  const total = old.shape.parts.reduce((s, p) => s + partArea(p.shape), 0)
  const made: BodyDef[] = []
  const regions: Array<{ body: BodyDef; test: (w: Pt) => boolean; c: Pt }> = []
  const base = old.name.replace(/\d+$/, '')
  for (const part of old.shape.parts) {
    const local = { x: part.position.x - shift.x, y: part.position.y - shift.y }
    let shape: PartShapeDef = part.shape
    let origin = local
    if (part.shape.type === 'polygon') {
      // A polygon part about its own centroid
      const ccw = signedArea(part.shape.points) < 0 ? part.shape.points.slice().reverse() : part.shape.points
      const c = polygonCentroid(ccw)
      shape = { type: 'polygon', points: ccw.map(p => ({ x: clean(p.x - c.x), y: clean(p.y - c.y) })) }
      const rc = rotate(c, part.angle)
      origin = { x: local.x + rc.x, y: local.y + rc.y }
    }
    const w = toWorldPt(old, origin)
    const area = partArea(part.shape)
    const b = derived(scene, old, freshName(scene, base || tl('部件')), JSON.parse(JSON.stringify(shape)), w, old.angle + part.angle, total > 0 ? old.mass * area / total : old.mass, w)
    if (b.shape.type === 'circle') b.role = 'ball'
    scene.bodies.push(b)
    made.push(b)
    const outline = shapeOutline(b.shape, b.kind !== 'static')[0]
    regions.push({
      body: b, c: w,
      test: p => {
        if (outline.kind === 'circle') return Math.hypot(p.x - w.x, p.y - w.y) <= outline.radius
        return inside(outline.verts.map(v => toWorldPt(b, v)), p)
      }
    })
  }
  const owner = (p: Pt) => regions.find(r => r.test(p))?.body ?? regions.reduce((best, r) => (Math.hypot(p.x - r.c.x, p.y - r.c.y) < Math.hypot(p.x - best.c.x, p.y - best.c.y) ? r : best)).body
  reassign(scene, old, made, owner)
  scene.bodies = scene.bodies.filter(b => b.id !== old.id)
  return made[0]?.id ?? null
}

// ---- Combine ----

/** Parts of a body in world coordinates (a compound body contributes each of its parts). */
function worldParts(def: BodyDef): ShapePart[] {
  const dynamic = def.kind !== 'static'
  if (def.shape.type === 'compound') {
    const shift = dynamic ? compoundMass(def.shape, 1).centroid : { x: 0, y: 0 }
    return def.shape.parts.map(p => ({ shape: JSON.parse(JSON.stringify(p.shape)), position: toWorldPt(def, { x: p.position.x - shift.x, y: p.position.y - shift.y }), angle: def.angle + p.angle }))
  }
  if (def.shape.type === 'polygon') return [{ shape: { type: 'polygon', points: localVerts(def) }, position: { ...def.position }, angle: def.angle }]
  return [{ shape: JSON.parse(JSON.stringify(def.shape)), position: { ...def.position }, angle: def.angle }]
}

/**
 * Combine bodies into one compound body (all static, or all moving). The parts keep their places; the new body sits at
 * their area centroid, takes the total mass, the material and colour of the first body and the mass-weighted mean
 * velocity. Connectors between two of the combined bodies disappear (they would join the body to itself).
 */
export function combineBodies(scene: Scene, ids: string[]): { id: string } | { error: string } {
  const list = ids.map(id => scene.bodies.find(b => b.id === id)).filter((b): b is BodyDef => !!b)
  if (list.length < 2) return { error: tl('至少选两个物体才能组合') }
  const statics = list.filter(b => b.kind === 'static').length
  if (statics > 0 && statics < list.length) return { error: tl('固定物体只能与固定物体组合') }
  const isStatic = statics === list.length
  const parts: ShapePart[] = list.flatMap(worldParts)
  const { centroid: c } = compoundMass({ type: 'compound', parts }, 1)
  const local = parts.map(p => ({ shape: p.shape, position: { x: clean(p.position.x - c.x), y: clean(p.position.y - c.y) }, angle: clean(p.angle) }))
  const mass = isStatic ? 0 : list.reduce((s, b) => s + b.mass, 0)
  const vx = isStatic ? 0 : list.reduce((s, b) => s + b.mass * b.velocity.x, 0) / mass
  const vy = isStatic ? 0 : list.reduce((s, b) => s + b.mass * b.velocity.y, 0) / mass
  const w = isStatic ? 0 : list.reduce((s, b) => s + b.mass * (b.kind === 'rigid' ? b.angularVelocity : 0), 0) / mass
  const first = list[0]
  const body: BodyDef = {
    id: nextId(scene, isStatic ? 's' : 'b'), name: freshName(scene, tl('复合体')), kind: isStatic ? 'static' : 'rigid', role: 'generic',
    shape: { type: 'compound', parts: local }, position: { x: clean(c.x), y: clean(c.y) }, angle: 0,
    velocity: { x: clean(vx), y: clean(vy) }, angularVelocity: clean(w), mass, inertia: null, fixedRotation: false,
    material: { ...first.material }, beltSpeed: 0, color: first.color
  }
  scene.bodies.push(body)
  const ids2 = new Set(list.map(b => b.id))
  // Connectors inside the group go; the others are re-anchored on the new body
  scene.connectors = scene.connectors.filter(cn => { const ends = connectorAnchors(cn); return !(ends.length === 2 && ends.every(a => a.body && ids2.has(a.body))) })
  for (const old of list) reassign(scene, old, [body], () => body)
  // Contact pairs among the group, and duplicates for the new body, are dropped
  const seen = new Set<string>()
  scene.contactPairs = scene.contactPairs.filter(p => {
    if (p.a === p.b) return false
    const k = p.a < p.b ? `${p.a}|${p.b}` : `${p.b}|${p.a}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  for (const cn of scene.connectors) if (cn.type === 'central' && cn.targets) cn.targets = [...new Set(cn.targets)]
  scene.bodies = scene.bodies.filter(b => !ids2.has(b.id))
  return { id: body.id }
}

// ---- Cut ----

/**
 * Split a simple counter-clockwise polygon (world coordinates) along the infinite line through p0 and p1 into pieces,
 * each counter-clockwise; one piece (the input) when the line misses it. A concave polygon may give more than two.
 * Classic method: insert the crossings, sort them along the line, pair them as the chords inside the polygon, and walk
 * the boundary jumping across each chord.
 */
export function splitPolygonByLine(poly: Pt[], p0: Pt, p1: Pt): Pt[][] {
  const dx = p1.x - p0.x, dy = p1.y - p0.y
  const L = Math.hypot(dx, dy)
  if (!(L > 0) || poly.length < 3) return [poly]
  const side = (p: Pt) => { const s = (dx * (p.y - p0.y) - dy * (p.x - p0.x)) / L; return Math.abs(s) < 1e-12 ? 0 : s }
  const sgn = (s: number) => (s >= 0 ? 1 : -1)
  interface Node { p: Pt; cross: boolean; along: number; partner: number }
  const nodes: Node[] = []
  const n = poly.length
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n]
    nodes.push({ p: a, cross: false, along: 0, partner: -1 })
    const sa = side(a), sb = side(b)
    if (sgn(sa) !== sgn(sb)) {
      const t = sa / (sa - sb)
      const x = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }
      nodes.push({ p: x, cross: true, along: ((x.x - p0.x) * dx + (x.y - p0.y) * dy) / L, partner: -1 })
    }
  }
  const crossings = nodes.map((nd, i) => (nd.cross ? i : -1)).filter(i => i >= 0).sort((i, j) => nodes[i].along - nodes[j].along)
  if (crossings.length < 2 || crossings.length % 2 !== 0) return [poly]
  for (let k = 0; k < crossings.length; k += 2) { nodes[crossings[k]].partner = crossings[k + 1]; nodes[crossings[k + 1]].partner = crossings[k] }
  const seen = new Array(nodes.length).fill(false)
  const out: Pt[][] = []
  for (let start = 0; start < nodes.length; start++) {
    if (seen[start] || nodes[start].cross) continue
    const loop: Pt[] = []
    let k = start
    for (let guard = 0; guard < 4 * nodes.length; guard++) {
      seen[k] = true
      loop.push(nodes[k].p)
      if (nodes[k].cross) { k = nodes[k].partner; seen[k] = true; loop.push(nodes[k].p) }
      k = (k + 1) % nodes.length
      if (k === start) break
    }
    // Drop repeated points (a crossing at a vertex) and slivers
    const clean2 = loop.filter((p, i) => { const q = loop[(i + loop.length - 1) % loop.length]; return Math.hypot(p.x - q.x, p.y - q.y) > 1e-9 })
    if (clean2.length >= 3 && Math.abs(signedArea(clean2)) > 1e-9) out.push(signedArea(clean2) < 0 ? clean2.reverse() : clean2)
  }
  return out.length ? out : [poly]
}

/** Does segment ab cross segment cd? */
function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b)
  return o1 * o2 < 0 && o3 * o4 < 0
}

/**
 * Cut every box and polygon body that the segment a–b crosses (at least twice: through the body) along the line a–b.
 * Each piece becomes a body of its own (mass by area; velocity of the original rigid motion at its centroid). Returns
 * the ids of the new bodies (empty when nothing was cut).
 */
export function cutBodies(scene: Scene, a: Pt, b: Pt): string[] {
  const made: string[] = []
  for (const old of scene.bodies.slice()) {
    if (old.shape.type !== 'box' && old.shape.type !== 'polygon') continue
    const world = localVerts(old).map(v => toWorldPt(old, v))
    let hits = 0
    for (let i = 0; i < world.length; i++) if (segmentsCross(a, b, world[i], world[(i + 1) % world.length])) hits++
    if (hits < 2) continue
    const pieces = splitPolygonByLine(world, a, b)
    if (pieces.length < 2) continue
    const total = Math.abs(signedArea(world))
    const base = old.name.replace(/\d+$/, '')
    const bodies: BodyDef[] = []
    for (const piece of pieces) {
      const c = centroid(piece)
      const area = Math.abs(signedArea(piece))
      const shape: BodyDef['shape'] = { type: 'polygon', points: piece.map(p => ({ x: clean(p.x - c.x), y: clean(p.y - c.y) })) }
      const nb = derived(scene, old, freshName(scene, base || tl('碎块')), shape, c, 0, old.mass * area / total, c)
      scene.bodies.push(nb)
      bodies.push(nb)
    }
    const owner = (p: Pt) => {
      for (let i = 0; i < pieces.length; i++) if (inside(pieces[i], p)) return bodies[i]
      let best = 0, bd = Infinity
      pieces.forEach((pc, i) => { const c = centroid(pc), d = Math.hypot(p.x - c.x, p.y - c.y); if (d < bd) { bd = d; best = i } })
      return bodies[best]
    }
    reassign(scene, old, bodies, owner)
    scene.bodies = scene.bodies.filter(x => x.id !== old.id)
    made.push(...bodies.map(x => x.id))
  }
  return made
}
