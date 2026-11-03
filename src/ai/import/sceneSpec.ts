/**
 * Scenes the AI writes when no template fits (D165): a small description — surfaces, bodies, pulleys, connectors,
 * forces and fields in SI units — compiled with the same helpers the templates use, then checked by the scene file
 * parser. Every problem is reported with a path ("bodies[1].mass must be positive") so the AI can repair it.
 */
import { addBody, addConnector, addGround, addIncline, addPulley, anchor, emptyScene, onIncline } from '../../core/scene/build'
import type { Anchor, BodyDef, ConnectorDef, RegionDef, Scene, ShapeDef } from '../../core/scene/types'
import { COULOMB_K } from '../../core/scene/types'
import { parseScene, serializeScene } from '../../core/scene/io'
import { DEG, cos, sin } from '../../core/math/dmath'
import { arcCentroid } from '../../core/scene/arc'
import type { Vec2 } from '../../core/math/vec'

type V = [number, number]
/**
 * A fixed surface. 26.59 fix 3 (D193): "arc" is a circular track — the circle about `center` with `radius` (the
 * surface a ball runs on: inside for grooves and loops, outside for humps), from `startDeg` counter-clockwise over
 * `sweepDeg` (0° points right, 90° up), `thickness` thick (on the outer side).
 */
export interface SurfaceSpec { type: 'ground' | 'incline' | 'wall' | 'arc'; id: string; name?: string; top?: number; left?: number; right?: number; angleDeg?: number; base?: number; x0?: number; y0?: number; x?: number; bottom?: number; muS?: number; muK?: number; mu?: number; restitution?: number; beltSpeed?: number; center?: V; radius?: number; thickness?: number; startDeg?: number; sweepDeg?: number; side?: 'inside' | 'outside' }
export interface BodySpec {
  /** 26.59 fix 3: "groove" is a movable arc track (radius, thickness, startDeg, sweepDeg; position = its circle's centre), "hoop" a thin ring that rolls. */
  id: string; name?: string; shape: 'box' | 'ball' | 'rod' | 'cylinder' | 'groove' | 'hoop'
  width?: number; height?: number; radius?: number; length?: number; thickness?: number; startDeg?: number; sweepDeg?: number
  /** On a ground (x), an incline (s from the top) or an arc track (angleDeg on its circle, the side the track runs on). */
  mass: number; position?: V; on?: { surface: string; s?: number; x?: number; angleDeg?: number }; angleDeg?: number
  velocity?: V; angularVelocity?: number; muS?: number; muK?: number; mu?: number; restitution?: number; charge?: number
  fixedRotation?: boolean; particle?: boolean; drag?: { linear?: number; quadratic?: number }
}
export interface ConnectorSpec {
  type: 'rope' | 'rod' | 'spring' | 'hinge' | 'force'
  a?: string | null; b?: string | null; anchorA?: V; anchorB?: V; via?: string[]
  length?: number | null; k?: number; restLength?: number | null; damping?: number
  body?: string; F?: V; expr?: { x: string; y: string }
}
export interface FieldSpec { type: 'electric' | 'magnetic' | 'liquid'; E?: V; B?: number; density?: number; region?: [V, V] | null }
export interface SceneSpec {
  name?: string; gravity?: number
  surfaces?: SurfaceSpec[]; bodies: BodySpec[]; pulleys?: Array<{ id: string; position: V; radius?: number; on?: string }>
  connectors?: ConnectorSpec[]; fields?: FieldSpec[]; coulomb?: boolean; watch?: string[]; duration?: number
}

export class SpecError extends Error { constructor(public problems: string[]) { super(problems.join('; ')) } }

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const vec = (v: unknown): v is V => Array.isArray(v) && v.length === 2 && num(v[0]) && num(v[1])
const idOk = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,23}$/.test(s)

/** Compile a scene description; throws SpecError with every problem found. */
export function compileSceneSpec(spec: SceneSpec): Scene {
  const problems: string[] = []
  const P = (m: string) => problems.push(m)
  if (!spec || typeof spec !== 'object') throw new SpecError(['scene must be an object'])
  const scene = emptyScene(typeof spec.name === 'string' && spec.name.trim() ? spec.name.trim().slice(0, 60) : 'AI 场景')
  const g = spec.gravity === undefined ? 9.8 : spec.gravity
  if (!num(g) || g < 0 || g > 1000) P('gravity must be a number in 0–1000 (m/s²)')
  else scene.settings.gravity = { x: 0, y: -g }
  const ids = new Set<string>()
  const claim = (id: unknown, where: string): boolean => {
    if (!idOk(id)) { P(`${where}.id must be a short identifier (letters, digits, _)`); return false }
    if (ids.has(id)) { P(`${where}.id "${id}" is used twice`); return false }
    ids.add(id)
    return true
  }
  const surf = new Map<string, { s: SurfaceSpec; body: BodyDef }>()
  const mat = (o: { muS?: number; muK?: number; mu?: number; restitution?: number }, where: string) => {
    const muS = o.muS ?? o.mu ?? 0, muK = o.muK ?? o.mu ?? muS, e = o.restitution ?? 0
    if (!num(muS) || muS < 0 || !num(muK) || muK < 0) P(`${where}: friction coefficients must be ≥ 0`)
    if (!num(e) || e < 0 || e > 1) P(`${where}.restitution must be within 0–1`)
    return { muS: num(muS) ? muS : 0, muK: num(muK) ? muK : 0, restitution: num(e) ? Math.min(1, Math.max(0, e)) : 0 }
  }

  ;(spec.surfaces ?? []).forEach((s, i) => {
    const w = `surfaces[${i}]`
    if (!claim(s?.id, w)) return
    if (s.type === 'ground') {
      const left = s.left ?? -10, right = s.right ?? 10, top = s.top ?? 0
      if (![left, right, top].every(num) || right <= left) { P(`${w}: ground needs left < right and a top height`); return }
      surf.set(s.id, { s, body: addGround(scene, { id: s.id, name: s.name, top, left, right, material: mat(s, w), beltSpeed: num(s.beltSpeed) ? s.beltSpeed : 0, role: num(s.beltSpeed) && s.beltSpeed !== 0 ? 'conveyor' : 'ground' }) })
    } else if (s.type === 'incline') {
      const a = s.angleDeg, base = s.base ?? 4
      if (!num(a) || a <= 0 || a >= 89) { P(`${w}.angleDeg must be within (0, 89)`); return }
      if (!num(base) || base <= 0 || base > 1000) { P(`${w}.base must be positive (m)`); return }
      surf.set(s.id, { s, body: addIncline(scene, { id: s.id, name: s.name, angle: a * DEG, base, x0: s.x0 ?? 0, y0: s.y0 ?? 0, material: mat(s, w), beltSpeed: num(s.beltSpeed) ? s.beltSpeed : 0 }) })
    } else if (s.type === 'wall') {
      const x = s.x, bottom = s.bottom ?? 0, top = s.top ?? 2
      if (!num(x) || !num(bottom) || !num(top) || top <= bottom) { P(`${w}: wall needs x and bottom < top`); return }
      const th = 0.2
      surf.set(s.id, { s, body: addBody(scene, { id: s.id, name: s.name ?? '墙', kind: 'static', role: 'wall', shape: { type: 'box', width: th, height: top - bottom }, position: { x, y: (top + bottom) / 2 }, material: mat(s, w) }) })
    } else if (s.type === 'arc') {
      // 26.59 fix 3 (D193): circular track; `radius` is the running surface (inner side, or outer side for "outside")
      const R = s.radius, t = s.thickness ?? 0.1, a0 = s.startDeg ?? 180, sw = s.sweepDeg ?? 90
      if (!vec(s.center)) { P(`${w}.center must be [x, y] (the circle's centre)`); return }
      if (!num(R) || R <= 0 || !num(t) || t <= 0) { P(`${w}: radius and thickness must be positive (m)`); return }
      if (!num(a0) || !num(sw) || sw <= 0 || sw > 360) { P(`${w}: sweepDeg must be within (0, 360]`); return }
      const outside = s.side === 'outside'
      if (outside && t >= R) { P(`${w}: an outside track needs thickness < radius`); return }
      const inner = outside ? R - t : R
      surf.set(s.id, { s, body: addBody(scene, { id: s.id, name: s.name ?? '圆弧轨道', kind: 'static', role: 'ground', shape: { type: 'arc', radius: inner, thickness: t, start: a0 * DEG, sweep: Math.min(sw, 360) * DEG }, position: { x: s.center[0], y: s.center[1] }, material: mat(s, w), color: '#64748b' }) })
    } else P(`${w}.type must be ground, incline, wall or arc`)
  })

  const bodies = new Map<string, BodyDef>()
  ;(spec.bodies ?? []).forEach((b, i) => {
    const w = `bodies[${i}]`
    if (!claim(b?.id, w)) return
    if (!num(b.mass) || b.mass <= 0) { P(`${w}.mass must be positive (kg)`); return }
    let shape: ShapeDef, half: number, role: BodyDef['role']
    if (b.shape === 'ball' || b.shape === 'cylinder') {
      const r = b.radius ?? 0.1
      if (!num(r) || r <= 0) { P(`${w}.radius must be positive (m)`); return }
      shape = { type: 'circle', radius: r }; half = r; role = b.shape === 'ball' ? 'ball' : 'wheel'
    } else if (b.shape === 'box' || b.shape === 'rod') {
      const wd = b.shape === 'rod' ? (b.length ?? 1) : (b.width ?? 0.3), h = b.shape === 'rod' ? (b.height ?? 0.04) : (b.height ?? 0.2)
      if (!num(wd) || wd <= 0 || !num(h) || h <= 0) { P(`${w}: width/height (or length) must be positive (m)`); return }
      shape = { type: 'box', width: wd, height: h }; half = h / 2; role = b.shape === 'rod' ? 'rod' : 'block'
    } else if (b.shape === 'groove' || b.shape === 'hoop') {
      // 26.59 fix 3: movable arc track (its body origin is its centre of mass) or a thin hoop
      const R = b.radius ?? (b.shape === 'hoop' ? 0.2 : 0.5), t = b.thickness ?? (b.shape === 'hoop' ? 0.02 : 0.1)
      const a0 = b.shape === 'hoop' ? 0 : (b.startDeg ?? 180), sw = b.shape === 'hoop' ? 360 : (b.sweepDeg ?? 180)
      if (!num(R) || R <= 0 || !num(t) || t <= 0 || !num(a0) || !num(sw) || sw <= 0 || sw > 360) { P(`${w}: radius, thickness > 0 and sweepDeg within (0, 360]`); return }
      const arc = { type: 'arc' as const, radius: R, thickness: t, start: a0 * DEG, sweep: sw * DEG }
      const { c } = arcCentroid(arc)
      shape = { ...arc, center: { x: -c.x, y: -c.y } }; half = R + t; role = b.shape === 'hoop' ? 'wheel' : 'block'
    } else { P(`${w}.shape must be box, ball, rod, cylinder, groove or hoop`); return }
    // A groove's position names its circle's centre: the body origin is its centre of mass
    const arcShift = shape.type === 'arc' && shape.center ? { x: -shape.center.x, y: -shape.center.y } : { x: 0, y: 0 }
    let position: Vec2 | null = null, angle = (b.angleDeg ?? 0) * DEG
    if (b.on) {
      const su = surf.get(b.on.surface)
      if (!su) { P(`${w}.on.surface "${b.on.surface}" is not a surface id`); return }
      if (su.s.type === 'incline') {
        const th = (su.s.angleDeg ?? 30) * DEG, base = su.s.base ?? 4, len = base / cos(th), s = b.on.s ?? 0.3
        if (!num(s) || s < 0 || s > len) { P(`${w}.on.s must be within 0–${len.toFixed(2)} m along the slope (from its top)`); return }
        const wd = shape.type === 'box' ? shape.width : 2 * half, ht = shape.type === 'box' ? shape.height : 2 * half
        const pl = onIncline(th, base, s, wd, ht, su.s.x0 ?? 0, su.s.y0 ?? 0)
        position = pl.position; angle = shape.type === 'circle' ? 0 : pl.angle
      } else if (su.s.type === 'ground') {
        const x = b.on.x ?? b.position?.[0] ?? 0
        if (!num(x)) { P(`${w}.on.x must be a number`); return }
        position = { x: x + arcShift.x, y: (su.s.top ?? 0) + half + arcShift.y }
      } else if (su.s.type === 'arc') {
        // On an arc track at angle θ of its circle: a ball inside (grooves, loops) or outside (humps) the circle
        const th = b.on.angleDeg
        if (!num(th)) { P(`${w}.on.angleDeg must be the angle on the track's circle (0° right, 90° up)`); return }
        const [cx, cy] = su.s.center as V, R = su.s.radius as number, u = { x: cos(th * DEG), y: sin(th * DEG) }
        const outside = su.s.side === 'outside'
        if (shape.type === 'circle') {
          const d = outside ? R + shape.radius : R - shape.radius
          if (d <= 0) { P(`${w}: the ball is larger than the track`); return }
          position = { x: cx + d * u.x, y: cy + d * u.y }
        } else if (shape.type === 'box' && outside) {
          position = { x: cx + (R + shape.height / 2) * u.x, y: cy + (R + shape.height / 2) * u.y }; angle = (th - 90) * DEG
        } else { P(`${w}.on: only balls (inside or outside) and boxes (outside) can be placed on an arc track`); return }
      } else { P(`${w}.on: bodies can be placed on a ground, an incline or an arc track`); return }
    } else if (vec(b.position)) position = { x: b.position[0] + arcShift.x, y: b.position[1] + arcShift.y }
    else { P(`${w} needs position [x, y] or on {surface, s|x}`); return }
    if (b.velocity !== undefined && !vec(b.velocity)) P(`${w}.velocity must be [vx, vy] (m/s)`)
    if (b.charge !== undefined && !num(b.charge)) P(`${w}.charge must be a number (C)`)
    const body = addBody(scene, {
      id: b.id, name: typeof b.name === 'string' && b.name ? b.name.slice(0, 30) : b.id, kind: b.particle ? 'particle' : 'rigid', role, shape, position, angle,
      velocity: vec(b.velocity) ? { x: b.velocity[0], y: b.velocity[1] } : { x: 0, y: 0 }, angularVelocity: num(b.angularVelocity) ? b.angularVelocity : 0,
      mass: b.mass, material: mat(b, w), fixedRotation: !!b.fixedRotation, charge: num(b.charge) && b.charge !== 0 ? b.charge : undefined,
      drag: b.drag ? { linear: num(b.drag.linear) ? b.drag.linear : 0, quadratic: num(b.drag.quadratic) ? b.drag.quadratic : 0 } : undefined
    })
    bodies.set(b.id, body)
  })
  if (!bodies.size) P('the scene needs at least one moving body')

  const pulleys = new Map<string, Vec2>()
  ;(spec.pulleys ?? []).forEach((p, i) => {
    const w = `pulleys[${i}]`
    if (!claim(p?.id, w)) return
    if (!vec(p.position)) { P(`${w}.position must be [x, y]`); return }
    const r = p.radius ?? 0.08
    if (!num(r) || r < 0) { P(`${w}.radius must be ≥ 0`); return }
    // 26.59 fix: a movable pulley rides on a body ("on"); its axle is given in world coordinates like the others
    if (p.on !== undefined && p.on !== null) {
      const carrier = bodies.get(p.on)
      if (!carrier) { P(`${w}.on "${p.on}" is not a moving body id`); return }
      const dx = p.position[0] - carrier.position.x, dy = p.position[1] - carrier.position.y
      const c = cos(-carrier.angle), sn = sin(-carrier.angle)
      addPulley(scene, { id: p.id, position: { x: c * dx - sn * dy, y: sn * dx + c * dy }, radius: r, body: carrier.id })
    } else addPulley(scene, { id: p.id, position: { x: p.position[0], y: p.position[1] }, radius: r })
    pulleys.set(p.id, { x: p.position[0], y: p.position[1] })
  })

  const anchorOf = (id: string | null | undefined, local: V | undefined, w: string): Anchor | null => {
    if (id === null || id === undefined) {
      if (!vec(local)) { P(`${w}: a world anchor needs coordinates [x, y]`); return null }
      return { body: null, local: { x: local[0], y: local[1] } }
    }
    const b = bodies.get(id) ?? surf.get(id)?.body
    if (!b) { P(`${w}: "${id}" is not a body or surface id`); return null }
    return anchor(b, vec(local) ? { x: local[0], y: local[1] } : { x: 0, y: 0 })
  }
  const world = (a: Anchor): Vec2 => {
    if (!a.body) return a.local
    const b = scene.bodies.find(x => x.id === a.body)!
    const c = cos(b.angle), s = sin(b.angle)
    return { x: b.position.x + c * a.local.x - s * a.local.y, y: b.position.y + s * a.local.x + c * a.local.y }
  }
  ;(spec.connectors ?? []).forEach((c, i) => {
    const w = `connectors[${i}]`
    if (!c || typeof c !== 'object') { P(`${w} must be an object`); return }
    if (c.type === 'force') {
      const a = anchorOf(c.body ?? c.a, c.anchorA, w)
      if (!a) return
      if (c.expr && (typeof c.expr.x !== 'string' || typeof c.expr.y !== 'string')) { P(`${w}.expr must have x and y expressions`); return }
      if (!c.expr && !vec(c.F)) { P(`${w}.F must be [Fx, Fy] (N)`); return }
      addConnector(scene, { type: 'force', name: '力', a, force: vec(c.F) ? { x: c.F[0], y: c.F[1] } : { x: 0, y: 0 }, expr: c.expr ?? null } as ConnectorDef)
      return
    }
    const a = anchorOf(c.a, c.anchorA, w), b = anchorOf(c.b, c.anchorB, w)
    if (!a || !b) return
    if (c.type === 'rope') {
      const via = c.via ?? []
      const path: Vec2[] = [world(a), ...via.map(id => pulleys.get(id)!).filter(Boolean), world(b)]
      if (via.some(id => !pulleys.has(id))) { P(`${w}.via: unknown pulley id`); return }
      const wraps = via.map((id, k) => {
        const p0 = path[k], p1 = path[k + 1], p2 = path[k + 2]
        const cross = (p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x)
        return { pulley: id, wrap: (cross < 0 ? 'cw' : 'ccw') as 'cw' | 'ccw' }
      })
      if (c.length !== undefined && c.length !== null && (!num(c.length) || c.length <= 0)) { P(`${w}.length must be positive or null`); return }
      addConnector(scene, { type: 'rope', name: '轻绳', a, b, pulleys: wraps, length: c.length ?? null } as ConnectorDef)
    } else if (c.type === 'rod') {
      addConnector(scene, { type: 'rod', name: '轻杆', a, b, length: num(c.length) ? c.length : null } as ConnectorDef)
    } else if (c.type === 'spring') {
      if (!num(c.k) || c.k <= 0) { P(`${w}.k must be positive (N/m)`); return }
      addConnector(scene, { type: 'spring', name: '弹簧', a, b, stiffness: c.k, restLength: num(c.restLength) ? c.restLength : null, damping: num(c.damping) ? c.damping : 0 } as ConnectorDef)
    } else if (c.type === 'hinge') {
      addConnector(scene, { type: 'hinge', name: '铰链', a, b } as ConnectorDef)
    } else P(`${w}.type must be rope, rod, spring, hinge or force`)
  })

  const regions: RegionDef[] = []
  ;(spec.fields ?? []).forEach((f, i) => {
    const w = `fields[${i}]`
    if (!f || typeof f !== 'object') { P(`${w} must be an object`); return }
    const box = f.region
    if (box !== undefined && box !== null && !(Array.isArray(box) && box.length === 2 && vec(box[0]) && vec(box[1]))) { P(`${w}.region must be [[x1, y1], [x2, y2]] or null`); return }
    const rect = box ? { x: (box[0][0] + box[1][0]) / 2, y: (box[0][1] + box[1][1]) / 2, w: Math.abs(box[1][0] - box[0][0]), h: Math.abs(box[1][1] - box[0][1]) } : null
    if (rect && (rect.w <= 0 || rect.h <= 0)) { P(`${w}.region must have a positive size`); return }
    if (f.type === 'electric') {
      if (!vec(f.E)) { P(`${w}.E must be [Ex, Ey] (V/m)`); return }
      if (rect) regions.push({ id: `field${i + 1}`, name: '电场', kind: 'field', shape: 'rect', ...rect, E: { x: f.E[0], y: f.E[1] } })
      else scene.settings.electric = { E: { x: f.E[0], y: f.E[1] } }
    } else if (f.type === 'magnetic') {
      if (!num(f.B)) { P(`${w}.B must be a number (T, out of the page positive)`); return }
      if (rect) regions.push({ id: `field${i + 1}`, name: '磁场', kind: 'field', shape: 'rect', ...rect, B: f.B })
      else scene.settings.magnetic = { B: f.B }
    } else if (f.type === 'liquid') {
      if (!rect) { P(`${w}: a liquid needs a region`); return }
      if (!num(f.density) || f.density <= 0) { P(`${w}.density must be positive (kg/m³)`); return }
      regions.push({ id: `liquid${i + 1}`, name: '液体', kind: 'liquid', shape: 'rect', ...rect, density: f.density, depth: 0.1, dragLinear: 2 })
    } else P(`${w}.type must be electric, magnetic or liquid`)
  })
  if (regions.length) scene.settings.regions = regions
  if (spec.coulomb) scene.settings.coulomb = { k: COULOMB_K }

  // Bodies must not start inside each other (touching is fine)
  const dyn = [...bodies.values()]
  for (let i = 0; i < dyn.length; i++) for (let j = i + 1; j < dyn.length; j++) {
    const a = dyn[i], b = dyn[j]
    const ra = radiusOf(a.shape), rb = radiusOf(b.shape)
    const d = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y)
    if (d < 0.5 * Math.min(ra, rb)) P(`bodies "${a.id}" and "${b.id}" start inside each other`)
  }

  if (spec.duration !== undefined && (!num(spec.duration) || spec.duration <= 0 || spec.duration > 600)) P('duration must be within 0–600 s')
  scene.settings.duration = num(spec.duration) && spec.duration > 0 ? Math.min(600, spec.duration) : 5
  scene.settings.legacyDuration = scene.settings.duration
  scene.watch = (spec.watch ?? []).filter(x => typeof x === 'string').slice(0, 12)
  if (!scene.watch.length) scene.watch = dyn.slice(0, 3).flatMap(b => [`${b.id}.v`])
  scene.view = fitView(scene)
  scene.description = 'AI 根据题目生成的场景'
  if (problems.length) throw new SpecError(problems)
  // The scene file parser checks every reference, range and type the compiler did not.
  try {
    return parseScene(serializeScene(scene)).scene
  } catch (e) {
    throw new SpecError([`scene check: ${(e as Error).message}`])
  }
}

function radiusOf(s: ShapeDef): number {
  if (s.type === 'circle') return s.radius
  if (s.type === 'box') return Math.min(s.width, s.height) / 2
  return 0.1
}

/** A view that shows every body (static ones included). */
function fitView(scene: Scene): { center: Vec2; pixelsPerMeter: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const b of scene.bodies) {
    const r = b.shape.type === 'circle' ? b.shape.radius : b.shape.type === 'box' ? Math.hypot(b.shape.width, b.shape.height) / 2 : 0
    const pts = b.shape.type === 'polygon' ? b.shape.points.map(p => ({ x: b.position.x + p.x, y: b.position.y + p.y })) : [b.position]
    for (const p of pts) { x0 = Math.min(x0, p.x - r); x1 = Math.max(x1, p.x + r); y0 = Math.min(y0, p.y - r); y1 = Math.max(y1, p.y + r) }
  }
  // Ground boxes are wide: keep the view on the moving bodies plus a margin
  const moving = scene.bodies.filter(b => b.kind !== 'static')
  if (moving.length) {
    const mx0 = Math.min(...moving.map(b => b.position.x)) - 2, mx1 = Math.max(...moving.map(b => b.position.x)) + 2
    x0 = Math.max(x0, mx0 - 2); x1 = Math.min(x1, mx1 + 2)
  }
  if (!Number.isFinite(x0)) return { center: { x: 0, y: 1 }, pixelsPerMeter: 80 }
  const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0)
  return { center: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, pixelsPerMeter: Math.max(10, Math.min(300, Math.min(900 / w, 520 / h))) }
}
