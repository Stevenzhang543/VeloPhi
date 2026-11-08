/**
 * Scene files written by the simulation Copilot (26.59 fix 3, D198): the AI reads a problem and writes a complete
 * VeloΦ scene file (`format: "velophi-scene"`, the same JSON as a saved .velophi.json) with the questions to answer.
 * Before it is loaded the app
 *  1. normalizes the forgivable slips of hand-written JSON — [x, y] for {x, y}, degree keys (angleDeg, startDeg,
 *     sweepDeg, axisDeg) for radians, omitted fields with their defaults, a gravity given as a number, rope wraps
 *     worked out from the geometry, dynamic polygons, compounds and arcs moved to their centre of mass — and lists
 *     each change as a note;
 *  2. places bodies marked `"rest": true` on the surface under them (as the editor does when one is dropped);
 *  3. checks the file with the scene parser, compiles it in the core and runs a short probe (deep overlaps at the
 *     start, a solver error), and checks every question against the quantities the scene can read.
 * Every problem is a sentence with a path ("bodies[1].mass must be > 0") so the AI can repair the file.
 */
import type { Anchor, ArcShapeDef, BodyRole, PartShapeDef, Scene, ShapeDef } from '../../core/scene/types'
import { COULOMB_K, ENGINE_VERSION, SCENE_FORMAT, SCENE_VERSION_ARCS } from '../../core/scene/types'
import { emptyScene } from '../../core/scene/build'
import { parseScene, serializeScene } from '../../core/scene/io'
import { arcCentroid } from '../../core/scene/arc'
import { EngineSession } from '../../engine/session'
import { listQuantities } from '../../engine/observe'
import { findOverlaps, pushApart } from '../../engine/overlaps'
import { msgText } from '../../i18n/locale'
import type { Message } from '../../i18n/message'
import { checkTarget } from '../import/contract'
import { extractJsonObject, numberFromText, parseLoose } from '../looseJson'
import type { CheckedQuestion } from '../import/contract'

type O = Record<string, unknown>
type V = { x: number; y: number }

const isObj = (v: unknown): v is O => !!v && typeof v === 'object' && !Array.isArray(v)
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const DEG = Math.PI / 180
const ID = /^[A-Za-z][A-Za-z0-9_]{0,31}$/

/** The result of preparing an AI scene file. */
export type PreparedScene =
  | { ok: true; scene: Scene; questions: CheckedQuestion[]; notes: string[]; warnings: string[]; title: string; stem: string }
  | { ok: false; errors: string[]; notes: string[] }

/** Body roles the file accepts (others become 'generic'). */
const ROLES: readonly BodyRole[] = ['block', 'ball', 'board', 'rod', 'wheel', 'ground', 'incline', 'wall', 'conveyor', 'generic']
const COLORS: Record<BodyRole, string> = {
  block: '#3b82f6', ball: '#ef4444', board: '#a16207', rod: '#7c3aed', wheel: '#0d9488',
  ground: '#64748b', incline: '#64748b', wall: '#64748b', conveyor: '#475569', generic: '#2563eb'
}
const CONNECTOR_TYPES = ['rope', 'rod', 'spring', 'hinge', 'force', 'damper', 'weld', 'slider', 'motor', 'gear', 'central'] as const
const CONNECTOR_NAMES: Record<string, string> = { rope: '轻绳', rod: '轻杆', spring: '弹簧', hinge: '铰链', force: '拉力 F', damper: '阻尼器', weld: '焊接', slider: '滑轨', motor: '电动机', gear: '齿轮', central: '有心力' }
const SINGLE = new Set(['force', 'central'])

/** [x, y] or {x, y} as {x, y}; anything else as it is (the parser reports it). */
function vec(v: unknown): unknown {
  if (Array.isArray(v) && v.length === 2 && fin(v[0]) && fin(v[1])) return { x: v[0], y: v[1] }
  if (isObj(v) && fin(v.x) && fin(v.y)) return { x: v.x, y: v.y }
  return v
}
const isVec = (v: unknown): v is V => isObj(v) && fin(v.x) && fin(v.y)

/** Signed area and area centroid of a polygon. */
function polygonMass(pts: V[]): { area: number; c: V } {
  let a = 0, cx = 0, cy = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length]
    const k = p.x * q.y - q.x * p.y
    a += k; cx += (p.x + q.x) * k; cy += (p.y + q.y) * k
  }
  a /= 2
  return Math.abs(a) < 1e-15 ? { area: 0, c: { x: 0, y: 0 } } : { area: a, c: { x: cx / (6 * a), y: cy / (6 * a) } }
}

const rot = (p: V, a: number): V => ({ x: Math.cos(a) * p.x - Math.sin(a) * p.y, y: Math.sin(a) * p.x + Math.cos(a) * p.y })

/** Area and centroid of a part shape in its own frame (box and circle: centre; arc: from its circle's centre). */
function partMass(s: PartShapeDef | ArcShapeDef): { area: number; c: V } {
  if (s.type === 'circle') return { area: Math.PI * s.radius * s.radius, c: { x: 0, y: 0 } }
  if (s.type === 'box') return { area: s.width * s.height, c: { x: 0, y: 0 } }
  if (s.type === 'arc') {
    const k = arcCentroid(s)
    const cc = s.center ?? { x: 0, y: 0 }
    return { area: k.area, c: { x: cc.x + k.c.x, y: cc.y + k.c.y } }
  }
  const m = polygonMass(s.points)
  return { area: Math.abs(m.area), c: m.c }
}

/** Radians from what the AI wrote: a value above 2π (up to 360) was meant in degrees (a common slip). */
function radiansOf(o: O, key: string, path: string, notes: string[]) {
  const v = o[key]
  if (fin(v) && Math.abs(v) > 2 * Math.PI + 1e-6 && Math.abs(v) <= 360) {
    o[key] = v * DEG
    notes.push(`${path}.${key}: ${v} read as degrees (${(v * DEG).toFixed(6)} rad)`)
  }
}

/** An arc shape (a body shape or a part of a compound): degree keys, defaults, aliases. */
function arcShape(raw: unknown, t: string, path: string, notes: string[]): O {
  const s = { ...(isObj(raw) ? raw : {}) } as O
  s.type = 'arc'
  if (!fin(s.radius) && fin(s.r)) s.radius = s.r
  if (!fin(s.radius) && fin(s.innerRadius)) s.radius = s.innerRadius
  if (!fin(s.radius) && fin(s.R)) s.radius = s.R
  if (t !== 'arc' && !fin(s.sweep) && !fin(s.sweepDeg)) { s.start = 0; s.sweep = 2 * Math.PI }
  if (fin(s.startDeg)) { s.start = s.startDeg * DEG; delete s.startDeg }
  if (fin(s.sweepDeg)) { s.sweep = s.sweepDeg * DEG; delete s.sweepDeg }
  if (!fin(s.sweep) && fin(s.end)) { s.sweep = s.end - (fin(s.start) ? s.start : 0); delete s.end }
  if (!fin(s.start)) s.start = 0
  radiansOf(s, 'start', path, notes)
  radiansOf(s, 'sweep', path, notes)
  if (!fin(s.thickness)) { s.thickness = 0.1; notes.push(`${path}.thickness: 0.1 m assumed`) }
  if (s.center !== undefined) s.center = vec(s.center)
  for (const k of ['r', 'R', 'innerRadius', 'end']) delete s[k]
  return s
}

const ARC_TYPES = ['arc', 'hoop', 'ring', 'annulus', 'track', 'groove']

/** A part shape (circle, box, polygon; in a compound also an arc) from what the AI wrote; aliases are accepted. */
function partShape(raw: unknown, path: string, errors: string[], notes: string[], arcs = false): O | null {
  let s: O
  if (typeof raw === 'string') s = { type: raw }
  else if (isObj(raw)) s = { ...raw }
  else { errors.push(`${path} must be an object such as {"type":"box","width":0.3,"height":0.2}`); return null }
  const t = String(s.type ?? '').toLowerCase()
  if (arcs && ARC_TYPES.includes(t)) return arcShape(s, t, path, notes)
  if (['ball', 'disc', 'disk', 'cylinder', 'sphere', 'wheel'].includes(t)) s.type = 'circle'
  else if (['rect', 'rectangle', 'block', 'square', 'board', 'plank'].includes(t)) s.type = 'box'
  else if (['triangle', 'poly', 'wedge'].includes(t)) s.type = 'polygon'
  else s.type = t
  if (s.type === 'circle' && !fin(s.radius) && fin(s.r)) s.radius = s.r
  if (s.type === 'box' && fin(s.size) && !fin(s.width)) { s.width = s.size; s.height = s.size }
  if (s.type === 'polygon') {
    if (!Array.isArray(s.points) && Array.isArray(s.vertices)) s.points = s.vertices
    if (!Array.isArray(s.points)) { errors.push(`${path}.points must be a list of vertices [{"x":…,"y":…}, …]`); return null }
    s.points = (s.points as unknown[]).map(vec)
    const pts = s.points as unknown[]
    if (pts.every(isVec) && pts.length >= 3 && polygonMass(pts as V[]).area < 0) {
      s.points = [...(pts as V[])].reverse()
      notes.push(`${path}: vertices reversed to counter-clockwise order`)
    }
  }
  if (!['circle', 'box', 'polygon'].includes(s.type as string)) { errors.push(`${path}.type "${raw && isObj(raw) ? String(raw.type) : String(raw)}" must be circle, box, polygon${arcs ? ' or arc' : ''}`); return null }
  delete s.r; delete s.size; delete s.vertices
  return s
}

/** A body shape: a part shape, a compound of parts, or an arc. */
function bodyShape(raw: unknown, path: string, errors: string[], notes: string[]): O | null {
  const t = typeof raw === 'string' ? raw.toLowerCase() : isObj(raw) ? String(raw.type ?? '').toLowerCase() : ''
  if (t === 'compound' || t === 'composite' || t === 'group') {
    const s = raw as O
    const list = Array.isArray(s.parts) ? s.parts : Array.isArray(s.shapes) ? s.shapes : Array.isArray(s.children) ? s.children : null
    if (!list || !list.length) { errors.push(`${path}.parts must list at least one part {"shape": {…}, "position": {"x":…,"y":…}, "angle": 0}`); return null }
    const parts = (list as unknown[]).map((p, i) => {
      const pp = `${path}.parts[${i}]`
      if (!isObj(p)) { errors.push(`${pp} must be {"shape":{…},"position":{"x":…,"y":…},"angle":0}`); return null }
      // A part written flat — {"type":"box","width":…,"position":…} — is read as {shape, position, angle}
      const flat = !isObj(p.shape) && typeof p.shape !== 'string' && typeof p.type === 'string'
      const { position, offset, at, x, y, angle: pa, angleDeg: pd, ...inline } = p
      const rawShape = flat ? inline : p.shape
      if (flat) notes.push(`${pp}: shape fields read as ${pp}.shape`)
      if (rawShape === undefined || rawShape === null) { errors.push(`${pp}.shape is missing: each part is {"shape": {"type": "box", …}, "position": {"x":…,"y":…}, "angle": 0}`); return null }
      const shape = partShape(rawShape, `${pp}.shape`, errors, notes, true)
      const ang = fin(pd) ? pd * DEG : fin(pa) ? pa : 0
      const pos = vec(position ?? offset ?? at ?? (fin(x) && fin(y) ? { x, y } : { x: 0, y: 0 }))
      if (!isVec(pos)) { errors.push(`${pp}.position must be {"x":…,"y":…} (relative to the body position)`); return null }
      return shape ? { shape, position: pos, angle: ang } : null
    })
    return parts.every(Boolean) ? { type: 'compound', parts } : null
  }
  if (ARC_TYPES.includes(t)) return arcShape(raw, t, path, notes)
  return partShape(raw, path, errors, notes)
}

/** An anchor: "bodyId", [x, y] / {x, y} (a world point), or {body, local}. */
function anchorOf(raw: unknown, path: string, errors: string[]): Anchor | null {
  if (typeof raw === 'string') return { body: raw, local: { x: 0, y: 0 } }
  if (Array.isArray(raw)) { const v = vec(raw); if (isVec(v)) return { body: null, local: v } }
  if (isObj(raw)) {
    if (raw.body === undefined && fin(raw.x) && fin(raw.y)) return { body: null, local: { x: raw.x, y: raw.y } }
    const body = raw.body === null || raw.body === undefined || raw.body === '' ? null : raw.body
    const local = vec(raw.local ?? raw.at ?? { x: 0, y: 0 })
    if (body !== null && typeof body !== 'string') { errors.push(`${path}.body must be a body id or null`); return null }
    if (!isVec(local)) { errors.push(`${path}.local must be {"x":…,"y":…}`); return null }
    if (body === null && raw.local === undefined && raw.at === undefined) { errors.push(`${path}: a fixed (world) anchor needs "local": the point {x, y} in the world`); return null }
    return { body, local }
  }
  errors.push(`${path} must be a body id, a world point [x, y] or {"body": id | null, "local": {"x":…,"y":…}}`)
  return null
}

function worldOf(a: Anchor, bodies: Map<string, O>): V | null {
  if (!a.body) return a.local
  const b = bodies.get(a.body)
  if (!b || !isVec(b.position)) return null
  const p = rot(a.local, fin(b.angle) ? b.angle : 0)
  return { x: b.position.x + p.x, y: b.position.y + p.y }
}

/**
 * The file as the parser wants it, from what the AI wrote. `rest`: ids of bodies to place on the surface under them.
 */
/** Keys whose string values are names or words, never numbers. */
const TEXT_KEYS = new Set(['id', 'name', 'description', 'text', 'prompt', 'unit', 'type', 'kind', 'role', 'color', 'title', 'stem', 'label', 'event', 'side', 'which', 'body', 'format', 'engine', 'integrator', 'shape', 'material', 'mode', 'wrap', 'note', 'pulley', 'axis', 'target', 'source', 'on', 'side'])

/**
 * 26.61: numbers the model wrote as text ("2", "25 cm", "30°", "pi/6") become numbers in SI, with one note per field;
 * words stay words.
 */
function coerceNumbers(v: unknown, path: string, notes: string[], depth = 0): unknown {
  if (depth > 12) return v
  if (Array.isArray(v)) return v.map((x, i) => coerceNumbers(x, `${path}[${i}]`, notes, depth + 1))
  if (!isObj(v)) return v
  for (const [k, x] of Object.entries(v)) {
    if (typeof x === 'string' && !TEXT_KEYS.has(k)) {
      const n = numberFromText(x)
      if (n !== null) { v[k] = n; if (notes.length < 40) notes.push(`${path ? `${path}.` : ''}${k}: "${x}" read as ${Number(n.toPrecision(6))}`) }
    } else if (x && typeof x === 'object') v[k] = coerceNumbers(x, path ? `${path}.${k}` : k, notes, depth + 1)
  }
  return v
}

function normalize(input: O, errors: string[], notes: string[]): { doc: O; rest: string[]; fitView: boolean } {
  const doc: O = coerceNumbers(JSON.parse(JSON.stringify(input)) as O, '', notes) as O
  const base = emptyScene('AI 场景')
  if (doc.format !== undefined && doc.format !== SCENE_FORMAT && doc.format !== 'verity-scene') notes.push(`format "${String(doc.format)}" replaced by "${SCENE_FORMAT}"`)
  doc.format = SCENE_FORMAT
  doc.version = SCENE_VERSION_ARCS
  doc.dimension = 2
  doc.engine = ENGINE_VERSION
  doc.name = typeof doc.name === 'string' && doc.name.trim() ? doc.name.trim().slice(0, 60) : 'AI 场景'
  if (typeof doc.description !== 'string') doc.description = ''

  // ---- settings (a few keys are also accepted at the top level) ----
  const st: O = isObj(doc.settings) ? { ...doc.settings } : {}
  for (const k of ['gravity', 'duration', 'electric', 'magnetic', 'coulomb', 'regions', 'stopAt', 'integrator']) if (doc[k] !== undefined && st[k] === undefined) { st[k] = doc[k]; delete doc[k] }
  const g = st.gravity
  if (g === undefined) st.gravity = { ...base.settings.gravity }
  else if (fin(g)) st.gravity = { x: 0, y: -Math.abs(g) }
  else st.gravity = vec(g)
  if (st.duration === undefined) st.duration = null
  if (st.legacyDuration === undefined) st.legacyDuration = fin(st.duration) ? st.duration : base.settings.legacyDuration
  if (st.electric !== undefined && st.electric !== null) {
    const e = isObj(st.electric) && st.electric.E !== undefined ? st.electric.E : st.electric
    st.electric = { E: vec(e) }
  }
  if (fin(st.magnetic)) st.magnetic = { B: st.magnetic }
  if (st.coulomb === true) st.coulomb = { k: COULOMB_K }
  else if (fin(st.coulomb)) st.coulomb = { k: st.coulomb }
  else if (st.coulomb === false) delete st.coulomb
  if (Array.isArray(st.regions)) {
    st.regions = (st.regions as unknown[]).map((r, i) => {
      if (!isObj(r)) return r
      const o: O = { ...r }
      if (typeof o.id !== 'string') o.id = `region${i + 1}`
      if (Array.isArray(o.region) && o.region.length === 2) {
        const [p, q] = (o.region as unknown[]).map(vec)
        if (isVec(p) && isVec(q)) Object.assign(o, { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, w: Math.abs(q.x - p.x), h: Math.abs(q.y - p.y) })
        delete o.region
      }
      if (o.E !== undefined) o.E = vec(o.E)
      return o
    })
  }
  doc.settings = st

  // ---- bodies ----
  if (!Array.isArray(doc.bodies) || !doc.bodies.length) { errors.push('bodies must list the bodies of the scene (fixed surfaces and moving bodies)'); return { doc, rest: [], fitView: true } }
  const rest: string[] = []
  const seen = new Set<string>()
  const bodies = new Map<string, O>()
  doc.bodies = (doc.bodies as unknown[]).map((raw, i) => {
    const path = `bodies[${i}]`
    if (!isObj(raw)) { errors.push(`${path} must be an object`); return raw }
    const b: O = { ...raw }
    if (typeof b.id !== 'string' || !b.id) { b.id = `b${i + 1}`; notes.push(`${path}.id: "${b.id}" assigned`) }
    const id = b.id as string
    if (!ID.test(id)) errors.push(`${path}.id "${id}" must start with a letter and use only letters, digits and _ (it is part of quantity ids such as ${id}.v)`)
    if (seen.has(id)) errors.push(`${path}.id "${id}" is used twice`)
    seen.add(id)
    if (typeof b.name !== 'string' || !b.name) b.name = id
    // kind: rigid / particle / static (common synonyms accepted)
    const k = String(b.kind ?? '').toLowerCase()
    if (['dynamic', 'movable', 'moving', 'body'].includes(k)) b.kind = 'rigid'
    else if (['fixed', 'ground', 'wall', 'immovable'].includes(k) || b.static === true || b.fixed === true) b.kind = 'static'
    else if (!['rigid', 'particle', 'static'].includes(k)) b.kind = ['ground', 'incline', 'wall', 'conveyor'].includes(String(b.role)) ? 'static' : 'rigid'
    delete b.static; delete b.fixed
    // shape (a bare "ball" with a radius on the body is accepted)
    if (typeof b.shape === 'string') {
      const t = b.shape.toLowerCase()
      b.shape = { type: t, radius: b.radius, width: b.width ?? b.length, height: b.height, points: b.points, thickness: b.thickness, startDeg: b.startDeg, sweepDeg: b.sweepDeg }
      delete b.radius; delete b.width; delete b.length; delete b.height; delete b.points; delete b.thickness; delete b.startDeg; delete b.sweepDeg
    }
    if (b.shape === undefined && Array.isArray(b.parts)) { b.shape = { type: 'compound', parts: b.parts }; delete b.parts; notes.push(`${path}.parts read as ${path}.shape {"type":"compound"}`) }
    if (b.shape === undefined || b.shape === null) errors.push(`${path}.shape is missing (e.g. {"type":"box","width":0.2,"height":0.2})`)
    const shape = b.shape === undefined || b.shape === null ? null : bodyShape(b.shape, `${path}.shape`, errors, notes)
    if (shape) b.shape = shape
    b.position = vec(b.position)
    if (!isVec(b.position)) errors.push(`${path}.position must be {"x":…,"y":…} (m; the centre of mass of a moving body, the origin of a fixed one)`)
    if (fin(b.angleDeg)) { b.angle = b.angleDeg * DEG; delete b.angleDeg }
    radiansOf(b, 'angle', path, notes)
    if (b.velocity !== undefined) b.velocity = vec(b.velocity)
    if (fin(b.omega) && b.angularVelocity === undefined) { b.angularVelocity = b.omega; delete b.omega }
    // material: mu / e shorthands on the body or in the material
    const m: O = isObj(b.material) ? { ...b.material } : {}
    for (const key of ['mu', 'muS', 'muK', 'restitution', 'e', 'rolling']) if (b[key] !== undefined && m[key] === undefined) { m[key] = b[key]; delete b[key] }
    if (fin(m.mu)) { if (m.muS === undefined) m.muS = m.mu; if (m.muK === undefined) m.muK = m.mu }
    if (fin(m.e) && m.restitution === undefined) m.restitution = m.e
    if (fin(m.muS) && m.muK === undefined) m.muK = m.muS
    if (fin(m.muK) && m.muS === undefined) m.muS = m.muK
    delete m.mu; delete m.e
    b.material = m
    if (b.kind !== 'static' && !(fin(b.mass) && b.mass > 0)) errors.push(`${path}.mass must be a number > 0 (kg) for a moving body`)
    if (b.kind === 'static' && b.mass === undefined) b.mass = 0
    const sh = shape
    const role = typeof b.role === 'string' && (ROLES as readonly string[]).includes(b.role) ? (b.role as BodyRole)
      : b.kind === 'static' ? (sh?.type === 'polygon' ? 'incline' : 'ground') : sh?.type === 'circle' ? 'ball' : sh?.type === 'arc' ? 'generic' : 'block'
    b.role = role
    if (typeof b.color !== 'string') b.color = COLORS[role]
    if (fin(b.drag)) b.drag = { linear: b.drag, quadratic: 0 }
    if (b.rest === true || typeof b.restOn === 'string') { if (b.kind !== 'static') rest.push(id); else notes.push(`${path}.rest ignored (fixed body)`) }
    delete b.rest; delete b.restOn
    // A moving polygon, compound or arc turns about its centre of mass, which must be the body origin
    if (b.kind !== 'static' && sh && isVec(b.position)) recentre(b, sh, path, notes)
    bodies.set(id, b)
    return b
  })

  // ---- pulleys ----
  doc.pulleys = (Array.isArray(doc.pulleys) ? doc.pulleys : []).map((raw, i) => {
    const path = `pulleys[${i}]`
    if (!isObj(raw)) { errors.push(`${path} must be an object`); return raw }
    const p: O = { ...raw }
    if (typeof p.id !== 'string' || !p.id) p.id = `p${i + 1}`
    if (!ID.test(p.id as string)) errors.push(`${path}.id "${p.id}" must use letters, digits and _`)
    if (seen.has(p.id as string)) errors.push(`${path}.id "${p.id}" is already used by a body`)
    if (typeof p.name !== 'string') p.name = '滑轮'
    p.position = vec(p.position)
    if (!isVec(p.position)) errors.push(`${path}.position must be {"x":…,"y":…}`)
    if (p.radius === undefined) p.radius = 0.05
    if (typeof p.on === 'string' && p.body === undefined) { p.body = p.on }
    delete p.on
    if (p.body === null || p.body === '') delete p.body
    return p
  })
  const pulleyAt = new Map<string, V>()
  for (const p of doc.pulleys as O[]) {
    if (!isObj(p) || !isVec(p.position)) continue
    const carrier = typeof p.body === 'string' ? bodies.get(p.body) : undefined
    pulleyAt.set(p.id as string, carrier && isVec(carrier.position) ? (() => { const r = rot(p.position as V, fin(carrier.angle) ? carrier.angle : 0); return { x: (carrier.position as V).x + r.x, y: (carrier.position as V).y + r.y } })() : (p.position as V))
  }

  // ---- connectors ----
  const cids = new Set<string>()
  const counts: Record<string, number> = {}
  doc.connectors = (Array.isArray(doc.connectors) ? doc.connectors : []).map((raw, i) => {
    const path = `connectors[${i}]`
    if (!isObj(raw)) { errors.push(`${path} must be an object`); return raw }
    const c: O = { ...raw }
    const type = String(c.type ?? '').toLowerCase()
    if (!(CONNECTOR_TYPES as readonly string[]).includes(type)) { errors.push(`${path}.type "${c.type}" must be one of ${CONNECTOR_TYPES.join(', ')}`); return c }
    c.type = type
    counts[type] = (counts[type] ?? 0) + 1
    if (typeof c.id !== 'string' || !c.id) c.id = counts[type] > 1 ? `${type}${counts[type]}` : type
    if (!ID.test(c.id as string)) errors.push(`${path}.id "${c.id}" must use letters, digits and _ (it is part of quantity ids such as ${c.id}.T)`)
    if (cids.has(c.id as string) || seen.has(c.id as string)) errors.push(`${path}.id "${c.id}" is used twice`)
    cids.add(c.id as string)
    if (typeof c.name !== 'string' || !c.name) c.name = CONNECTOR_NAMES[type]
    // anchors (a force may name its body instead)
    if (c.a === undefined && typeof c.body === 'string') c.a = c.body
    delete c.body
    const a = anchorOf(c.a, `${path}.a`, errors)
    if (a) c.a = a
    if (!SINGLE.has(type)) {
      const b = anchorOf(c.b, `${path}.b`, errors)
      if (b) c.b = b
    } else delete c.b
    switch (type) {
      case 'rope': {
        const list = (Array.isArray(c.pulleys) ? c.pulleys : Array.isArray(c.via) ? c.via : []) as unknown[]
        delete c.via
        const ids = list.map(x => (typeof x === 'string' ? x : isObj(x) ? x.pulley : undefined))
        const bad = ids.filter(x => typeof x !== 'string' || !pulleyAt.has(x))
        if (bad.length) { errors.push(`${path}.pulleys: ${bad.map(String).join(', ')} is not a pulley id`); break }
        // Wrap direction of each wheel: given, or from the turn of the path a → wheels → b
        const pa = a && worldOf(a, bodies), pb = isObj(c.b) ? worldOf(c.b as unknown as Anchor, bodies) : null
        const path3: Array<V | null> = [pa ?? null, ...ids.map(x => pulleyAt.get(x as string)!), pb ?? null]
        c.pulleys = list.map((x, k) => {
          const given = isObj(x) && (x.wrap === 'cw' || x.wrap === 'ccw') ? x.wrap : null
          if (given) return { pulley: ids[k], wrap: given }
          const p0 = path3[k], p1 = path3[k + 1]!, p2 = path3[k + 2]
          let wrap: 'cw' | 'ccw' = 'cw'
          if (p0 && p2) wrap = (p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x) < 0 ? 'cw' : 'ccw'
          return { pulley: ids[k], wrap }
        })
        if (c.length === undefined) c.length = null
        break
      }
      case 'rod': if (c.length === undefined) c.length = null; break
      case 'spring':
        if (c.stiffness === undefined && fin(c.k)) { c.stiffness = c.k; delete c.k }
        // 26.60 r2 (D208): a spring the body is not fastened to, in the words a model may use
        if (c.pushOnly === undefined && (c.attached === false || c.fastened === false || c.detached === true || c.unilateral === true || c.compressionOnly === true)) { c.pushOnly = true; notes.push(`${path}: read as "pushOnly": true`) }
        for (const k of ['attached', 'fastened', 'detached', 'unilateral', 'compressionOnly']) delete c[k]
        if (c.pushOnly !== undefined && typeof c.pushOnly !== 'boolean') c.pushOnly = c.pushOnly === 'true' || c.pushOnly === 1
        if (c.restLength === undefined) c.restLength = fin(c.length) ? c.length : null
        delete c.length
        if (c.damping === undefined) c.damping = 0
        if (!(fin(c.stiffness) && c.stiffness > 0)) errors.push(`${path}.stiffness must be > 0 (N/m)`)
        break
      case 'damper': if (!fin(c.damping)) errors.push(`${path}.damping must be a number ≥ 0 (N·s/m)`); break
      case 'force': {
        const f = vec(c.force ?? c.F)
        delete c.F
        if (isObj(c.expr)) { c.force = isVec(f) ? f : { x: 0, y: 0 }; if (typeof c.expr.x !== 'string' || typeof c.expr.y !== 'string') errors.push(`${path}.expr must be {"x": "expression", "y": "expression"}`) }
        else if (fin(c.magnitude)) { const th = (fin(c.angleDeg) ? c.angleDeg : 0) * DEG; c.force = { x: c.magnitude * Math.cos(th), y: c.magnitude * Math.sin(th) }; c.expr = null }
        else if (isVec(f)) { c.force = f; c.expr = null }
        else errors.push(`${path}.force must be {"x": Fx, "y": Fy} (N)`)
        delete c.magnitude; delete c.angleDeg
        break
      }
      case 'slider':
        if (fin(c.axisDeg)) { c.axis = { x: Math.cos(c.axisDeg * DEG), y: Math.sin(c.axisDeg * DEG) }; delete c.axisDeg }
        c.axis = vec(c.axis ?? { x: 1, y: 0 })
        break
      case 'motor':
        if (c.mode !== 'torque') c.mode = 'speed'
        if (!fin(c.speed)) c.speed = 0
        if (!fin(c.torque)) c.torque = 0
        break
      case 'gear': if (!fin(c.ratio)) errors.push(`${path}.ratio must be a non-zero number`); break
      case 'central':
        if (!fin(c.k)) errors.push(`${path}.k must be a number`)
        if (!fin(c.n)) c.n = -2
        if (c.targets === undefined) c.targets = null
        break
    }
    return c
  })

  if (!Array.isArray(doc.contactPairs)) doc.contactPairs = []
  if (!Array.isArray(doc.annotations)) doc.annotations = []
  if (!Array.isArray(doc.watch)) doc.watch = []
  const fitView = !(isObj(doc.view) && isVec(vec((doc.view as O).center)) && fin((doc.view as O).pixelsPerMeter))
  if (!fitView) doc.view = { center: vec((doc.view as O).center), pixelsPerMeter: (doc.view as O).pixelsPerMeter }
  else delete doc.view
  delete doc.branches
  if (isObj(doc.extra)) { delete doc.extra.template; delete doc.extra.ai; delete doc.extra.questions; delete doc.extra.problem; if (!Object.keys(doc.extra).length) delete doc.extra }
  for (const k of ['questions', 'problem', 'title', 'stem']) delete doc[k]
  return { doc, rest, fitView }
}

/** A normalized part shape whose mass can be computed (the parser reports the others). */
function partOk(s: O): boolean {
  if (s.type === 'circle') return fin(s.radius)
  if (s.type === 'box') return fin(s.width) && fin(s.height)
  if (s.type === 'arc') return fin(s.radius) && fin(s.thickness) && fin(s.sweep) && fin(s.start) && (s.center === undefined || isVec(s.center))
  return s.type === 'polygon' && Array.isArray(s.points) && s.points.length >= 3 && (s.points as unknown[]).every(isVec)
}

/** Move a moving polygon, compound or arc so that its centre of mass is the body origin (the world shape stays). */
function recentre(b: O, sh: O, path: string, notes: string[]) {
  const angle = fin(b.angle) ? b.angle : 0
  const pos = b.position as V
  let c: V | null = null
  if (sh.type === 'polygon' && Array.isArray(sh.points) && (sh.points as unknown[]).every(isVec) && sh.points.length >= 3) {
    c = polygonMass(sh.points as V[]).c
    if (Math.hypot(c.x, c.y) > 1e-9) sh.points = (sh.points as V[]).map(p => ({ x: p.x - c!.x, y: p.y - c!.y }))
  } else if (sh.type === 'compound' && Array.isArray(sh.parts)) {
    let A = 0, cx = 0, cy = 0
    for (const p of sh.parts as Array<{ shape: PartShapeDef | ArcShapeDef; position: V; angle: number }>) {
      if (!isObj(p) || !isVec(p.position) || !isObj(p.shape) || !partOk(p.shape)) return
      const m = partMass(p.shape)
      const pc = rot(m.c, p.angle)
      A += m.area; cx += m.area * (p.position.x + pc.x); cy += m.area * (p.position.y + pc.y)
    }
    if (!(A > 0)) return
    c = { x: cx / A, y: cy / A }
    if (Math.hypot(c.x, c.y) > 1e-9) for (const p of sh.parts as Array<{ position: V }>) p.position = { x: p.position.x - c.x, y: p.position.y - c.y }
  } else if (sh.type === 'arc' && fin(sh.radius) && fin(sh.thickness) && fin(sh.sweep)) {
    // A moving arc without "center": its position names the circle's centre
    if (sh.center !== undefined) return
    const k = arcCentroid({ radius: sh.radius, thickness: sh.thickness, start: fin(sh.start) ? sh.start : 0, sweep: sh.sweep }).c
    sh.center = { x: -k.x, y: -k.y }
    c = k
    notes.push(`${path}: moving arc — its position was the circle's centre; the body origin is now its centre of mass`)
  }
  if (!c || Math.hypot(c.x, c.y) <= 1e-9) return
  const w = rot(c, angle)
  b.position = { x: pos.x + w.x, y: pos.y + w.y }
  if (sh.type !== 'arc') notes.push(`${path}: points re-centred on the centre of mass (position moved by (${w.x.toFixed(4)}, ${w.y.toFixed(4)}) m; the shape stays where it was)`)
}

/** Extreme extent of a shape along direction d (body frame at angle `a`): max over the shape of d·p (exact for arcs). */
function support(shape: ShapeDef, a: number, d: V): number {
  const pts: Array<{ p: V; r: number }> = []
  // Arcs (annular sectors): the end corners always; the outer circle where d points into the sector's span
  const arcs: Array<{ c: V; ro: number; start: number; sweep: number }> = []
  const add = (s: PartShapeDef | ArcShapeDef, off: V, ang: number) => {
    if (s.type === 'circle') pts.push({ p: off, r: s.radius })
    else if (s.type === 'box') for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const q = rot({ x: (sx * s.width) / 2, y: (sy * s.height) / 2 }, ang); pts.push({ p: { x: off.x + q.x, y: off.y + q.y }, r: 0 }) }
    else if (s.type === 'arc') {
      const cc = rot(s.center ?? { x: 0, y: 0 }, ang)
      const c = { x: off.x + cc.x, y: off.y + cc.y }
      const ro = s.radius + s.thickness
      for (const t of [s.start + ang, s.start + s.sweep + ang]) for (const r of [s.radius, ro]) pts.push({ p: { x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) }, r: 0 })
      arcs.push({ c, ro, start: s.start + ang, sweep: s.sweep })
    } else for (const v of s.points) { const q = rot(v, ang); pts.push({ p: { x: off.x + q.x, y: off.y + q.y }, r: 0 }) }
  }
  if (shape.type === 'compound') for (const part of shape.parts) add(part.shape, part.position, part.angle)
  else add(shape, { x: 0, y: 0 }, 0)
  let best = -Infinity
  for (const { p, r } of pts) { const w = rot(p, a); best = Math.max(best, w.x * d.x + w.y * d.y + r) }
  const dirIn = Math.atan2(d.y, d.x) - a
  for (const k of arcs) {
    const rel = (((dirIn - k.start) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
    if (rel <= k.sweep + 1e-12) { const w = rot(k.c, a); best = Math.max(best, w.x * d.x + w.y * d.y + k.ro * Math.hypot(d.x, d.y)) }
  }
  return best
}

/** Place the bodies marked "rest" on the surface under them, in file order (a stack is placed from the bottom). */
function placeResting(scene: Scene, rest: string[], errors: string[], notes: string[]) {
  const pending = new Set(rest)
  for (const id of rest) {
    const body = scene.bodies.find(b => b.id === id)!
    pending.delete(id)
    const probe: Scene = { ...scene, bodies: scene.bodies.filter(b => b.id !== id && !pending.has(b.id)), connectors: [], pulleys: [], settings: { ...scene.settings, regions: undefined, railLoops: undefined } }
    let surf: { foot: V; n: V; angle: number } | null = null
    let s: EngineSession | null = null
    try {
      s = EngineSession.create(probe)
      surf = s.call<{ surface: { foot: V; n: V; angle: number } | null }>({ op: 'surfaceBelow', x: body.position.x, y: body.position.y, reach: 5 }).surface
    } catch (e) {
      errors.push(`bodies "${id}".rest: the surfaces could not be compiled (${(e as Error).message})`)
      continue
    } finally { s?.free() }
    if (!surf) { errors.push(`bodies "${id}".rest: no upward-facing surface within 5 m below (${body.position.x.toFixed(3)}, ${body.position.y.toFixed(3)}) — give a position just above the surface it should rest on, or give its exact position without "rest"`); continue }
    // A box lies flat on the surface; a polygon or compound keeps its angle relative to the surface
    if (body.shape.type === 'box') body.angle = surf.angle
    else if (body.shape.type !== 'circle') body.angle = surf.angle + body.angle
    const h = support(body.shape, body.angle, { x: -surf.n.x, y: -surf.n.y })
    body.position = { x: surf.foot.x + surf.n.x * h, y: surf.foot.y + surf.n.y * h }
    notes.push(`"${id}" placed on the surface below it: position (${body.position.x.toFixed(4)}, ${body.position.y.toFixed(4)}) m, angle ${(body.angle / DEG).toFixed(2)}°`)
  }
}

/** A view that shows the scene (moving bodies first; wide grounds are cut). */
export function fitSceneView(scene: Scene): Scene['view'] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  const grow = (p: V, r: number) => { x0 = Math.min(x0, p.x - r); x1 = Math.max(x1, p.x + r); y0 = Math.min(y0, p.y - r); y1 = Math.max(y1, p.y + r) }
  for (const b of scene.bodies) {
    // Extents along ±x and ±y (exact for every shape, compounds and arcs included)
    const e = (d: V) => { try { const v = support(b.shape, b.angle, d); return Number.isFinite(v) ? v : 0.3 } catch { return 0.3 } }
    grow({ x: b.position.x + e({ x: 1, y: 0 }), y: b.position.y }, 0); grow({ x: b.position.x - e({ x: -1, y: 0 }), y: b.position.y }, 0)
    grow({ x: b.position.x, y: b.position.y + e({ x: 0, y: 1 }) }, 0); grow({ x: b.position.x, y: b.position.y - e({ x: 0, y: -1 }) }, 0)
  }
  for (const p of scene.pulleys) if (!p.body) grow(p.position, p.radius)
  const moving = scene.bodies.filter(b => b.kind !== 'static')
  if (moving.length) {
    const mx0 = Math.min(...moving.map(b => b.position.x)), mx1 = Math.max(...moving.map(b => b.position.x))
    x0 = Math.max(x0, mx0 - 4); x1 = Math.min(x1, mx1 + 4)
  }
  if (!Number.isFinite(x0) || !Number.isFinite(y0)) return { center: { x: 0, y: 1 }, pixelsPerMeter: 80 }
  const w = Math.max(0.5, x1 - x0) * 1.15, h = Math.max(0.5, y1 - y0) * 1.15
  return { center: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, pixelsPerMeter: Math.max(8, Math.min(400, Math.min(900 / w, 520 / h))) }
}

/** Unwrap what the AI sent: the file itself, or {scene, questions, title, stem}; a JSON text is parsed. */
export function unwrapAiScene(raw: unknown, questions?: unknown): { file: O | null; questions: unknown; title: string; stem: string; error?: string } {
  let v = raw
  if (typeof v === 'string') {
    try { v = JSON.parse(v) } catch {
      // 26.61: almost-JSON (a scene sent as text inside the tool arguments)
      const r = extractJsonObject(v as string, o => (Array.isArray(o.bodies) || isObj(o.scene) ? 10 : 0), () => {})
      if (!r) { const e = parseLoose(v as string); return { file: null, questions, title: '', stem: '', error: `the scene is not valid JSON${e.ok ? '' : ` (line ${e.line}, column ${e.column}: ${e.error}; near …${e.context}…)`}` } }
      v = r.value
    }
  }
  if (!isObj(v)) return { file: null, questions, title: '', stem: '', error: 'the scene must be one JSON object (the scene file)' }
  // Some models send nested arguments as JSON text
  if (typeof questions === 'string') { const r = parseLoose(questions); if (r.ok) questions = r.value }
  let file = v
  let qs = questions
  let title = '', stem = ''
  if (!Array.isArray(v.bodies) && isObj(v.scene)) {
    file = v.scene
    if (qs === undefined) qs = v.questions
    title = typeof v.title === 'string' ? v.title : ''
    stem = typeof v.stem === 'string' ? v.stem : ''
  }
  const pr = isObj(file.problem) ? file.problem : null
  if (qs === undefined) qs = file.questions ?? pr?.questions ?? (isObj(file.extra) ? (file.extra as O).questions : undefined)
  if (!title) title = typeof file.title === 'string' ? file.title : typeof pr?.title === 'string' ? pr.title : ''
  if (!stem) stem = typeof file.stem === 'string' ? file.stem : typeof pr?.stem === 'string' ? pr.stem : ''
  return { file, questions: qs, title: title.slice(0, 80), stem: stem.slice(0, 4000) }
}

/** Probe run length (s): long enough to resolve the start, short enough to stay instant. */
const PROBE_SECONDS = 0.25

/**
 * Prepare a scene file written by the AI: normalize, place resting bodies, parse, compile, probe and check the
 * questions. `raw`: the file (object or text) or {scene, questions, title, stem}.
 */
export function prepareAiScene(raw: unknown, rawQuestions?: unknown): PreparedScene {
  // 26.60 r2: never throws — a file the checks did not foresee comes back as a problem the AI can act on
  const notes: string[] = []
  try {
    return prepare(raw, rawQuestions, notes)
  } catch (e) {
    const where = ((e as Error).stack ?? '').split('\n').slice(1, 2).join('').replace(/^\s*at\s+/, '').replace(/\s*\(.*$/, '')
    return { ok: false, errors: [`the app could not read this file (${(e as Error).message}${where ? ` in ${where}` : ''}). Check its structure against the format: every shape has a "type" and its sizes, every compound part is {"shape": {…}, "position": {"x":…,"y":…}, "angle": 0}, every anchor names an existing body.`], notes }
  }
}

function prepare(raw: unknown, rawQuestions: unknown, notes: string[]): PreparedScene {
  const errors: string[] = []
  const u = unwrapAiScene(raw, rawQuestions)
  if (!u.file) return { ok: false, errors: [u.error ?? 'no scene'], notes }
  const { doc, rest, fitView } = normalize(u.file, errors, notes)
  if (errors.length) return { ok: false, errors, notes }
  let scene: Scene
  try { scene = parseScene(JSON.stringify(doc)).scene } catch (e) { return { ok: false, errors: [`scene file check: ${(e as Error).message}`], notes } }
  if (!scene.bodies.some(b => b.kind !== 'static')) return { ok: false, errors: ['the scene needs at least one moving body (kind "rigid" or "particle")'], notes }
  placeResting(scene, rest, errors, notes)
  if (errors.length) return { ok: false, errors, notes }
  if (fitView) scene.view = fitSceneView(scene)

  // Bodies that overlap at the start are pushed apart along the shortest way (D200), as the editor offers; overlaps
  // too deep for that go back to the AI
  const ov = findOverlaps(scene)
  if (ov?.pairs.length) {
    const name = (id: string) => scene.bodies.find(b => b.id === id)?.name ?? id
    if (ov.remaining.length || !ov.moved.length) {
      return { ok: false, errors: [`bodies overlap at the start and cannot be pushed apart automatically: ${(ov.remaining.length ? ov.remaining : ov.pairs).map(p => `${p.a}–${p.b} by ${(p.depth * 100).toFixed(1)} cm`).join(', ')}. Move them apart so that they just touch (or use "rest": true on the upper body).`], notes }
    }
    pushApart(scene, ov)
    notes.push(`overlapping bodies pushed apart: ${ov.pairs.map(p => `${name(p.a)}–${name(p.b)} ${(p.depth * 1000).toFixed(1)} mm`).join(', ')}`)
  }

  // Compile in the core, then a short probe run: deep overlaps at the start and solver errors come back to the AI
  const warnings: string[] = []
  let quantities = new Map<string, string>()
  let s: EngineSession | null = null
  try {
    s = EngineSession.create(scene)
    for (const q of listQuantities(s)) quantities.set(q.id, q.unit)
  } catch (e) {
    return { ok: false, errors: [`the engine cannot compile this scene: ${(e as Error).message}`], notes }
  } finally { s?.free() }
  let probe: EngineSession | null = null
  try {
    probe = EngineSession.simulate(scene, { duration: PROBE_SECONDS })
    const info = probe.call<{ warnings?: Message[]; error?: Message | string | null }>({ op: 'info' })
    for (const w of info.warnings ?? []) {
      const text = msgText(w)
      if (w.key === 'warn.initialDeepOverlap') errors.push(`bodies overlap at the start: ${text}. Move them apart so that they just touch (or use "rest": true on the upper body).`)
      else warnings.push(text)
    }
    if (info.error) errors.push(`the simulation fails at the start: ${msgText(info.error)}`)
  } catch (e) {
    errors.push(`the simulation fails at the start: ${(e as Error).message}`)
  } finally { probe?.free() }
  if (errors.length) return { ok: false, errors, notes }

  // Questions (optional): each must read a quantity the scene has
  const questions: CheckedQuestion[] = []
  if (rawQuestions !== undefined || u.questions !== undefined) {
    const list = u.questions
    if (list !== undefined && list !== null && !Array.isArray(list)) errors.push('questions must be a list [{"prompt": …, "target": {…}, "unit": …}]')
    const ids = new Set(scene.bodies.map(b => b.id))
    ;(Array.isArray(list) ? list : []).slice(0, 8).forEach((q, i) => {
      const w = `questions[${i}]`
      if (!isObj(q)) { errors.push(`${w} must be an object`); return }
      const prompt = typeof q.prompt === 'string' ? q.prompt.trim().slice(0, 300) : ''
      if (!prompt) errors.push(`${w}.prompt is empty`)
      const r = checkTarget(q.target, quantities, ids, w)
      errors.push(...r.errors)
      if (r.target && prompt) questions.push({ prompt, target: r.target, unit: typeof q.unit === 'string' ? q.unit.slice(0, 20) : undefined })
    })
    if (errors.length) {
      const sample = [...quantities.keys()].filter(k => !k.startsWith('ledger.') && !/\.(fx|fy|px|py|vt|P|Lz|lagr|ham)$/.test(k)).slice(0, 40)
      errors.push(`readable quantity ids of this scene include: ${sample.join(', ')}`)
      return { ok: false, errors, notes }
    }
  }
  quantities = new Map()

  // A problem needs a finite run that reaches every asked time
  if (questions.length) {
    let d = scene.settings.duration ?? scene.settings.legacyDuration
    for (const q of questions) if (q.target.kind === 'quantity') d = Math.max(d, q.target.t + 0.5)
    scene.settings.duration = Math.min(600, d)
    scene.settings.legacyDuration = scene.settings.duration
  }
  if (!scene.watch.length) {
    const asked = questions.flatMap(q => ('id' in q.target ? [q.target.id] : []))
    scene.watch = [...new Set([...asked, ...scene.bodies.filter(b => b.kind !== 'static').slice(0, 3).map(b => `${b.id}.v`)])].slice(0, 8)
  }
  return { ok: true, scene, questions, notes, warnings, title: u.title || scene.name, stem: u.stem }
}

/**
 * A scene as a short file for the AI: defaults left out (they are filled in again on the way back), numbers rounded
 * to 6 significant digits, no view or template link.
 */
export function compactSceneDoc(scene: Scene): O {
  const r = (v: number) => (Number.isFinite(v) ? Number(v.toPrecision(6)) : v)
  const deep = (v: unknown): unknown => (typeof v === 'number' ? r(v) : Array.isArray(v) ? v.map(deep) : isObj(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x)])) : v)
  const doc = JSON.parse(serializeScene(scene)) as O
  delete doc.view; delete doc.engine; delete doc.dimension
  const st = doc.settings as O
  for (const k of ['outputStep', 'relTol', 'absTol', 'energyZeroY']) delete st[k]
  if (st.integrator === 'dopri5') delete st.integrator
  if (st.stopAt === null) delete st.stopAt
  doc.bodies = (doc.bodies as O[]).map(b => {
    const o: O = { ...b }
    if (o.angle === 0) delete o.angle
    if (isVec(o.velocity) && o.velocity.x === 0 && o.velocity.y === 0) delete o.velocity
    if (o.angularVelocity === 0) delete o.angularVelocity
    if (o.inertia === null) delete o.inertia
    if (o.fixedRotation === false) delete o.fixedRotation
    if (o.beltSpeed === 0) delete o.beltSpeed
    if (o.kind === 'static') delete o.mass
    delete o.color
    return o
  })
  for (const k of ['contactPairs', 'annotations', 'pulleys', 'connectors', 'watch']) if (Array.isArray(doc[k]) && !(doc[k] as unknown[]).length) delete doc[k]
  if (isObj(doc.extra)) { delete doc.extra.template; delete doc.extra.ai; if (!Object.keys(doc.extra).length) delete doc.extra }
  if (doc.description === '') delete doc.description
  return deep(doc) as O
}

/** JSON code blocks of an answer that look like a scene file (or {scene, questions}). */
export function sceneBlocks(text: string): unknown[] {
  const out: unknown[] = []
  const re = /```(?:json|velophi|velophi-scene|jsonc)?\s*\n([\s\S]*?)```/gi
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const r = parseLoose(m[1].trim())
    const v = r.ok && !r.truncated ? r.value : null
    if (isObj(v) && (Array.isArray(v.bodies) || (isObj(v.scene) && Array.isArray((v.scene as O).bodies)))) out.push(v)
  }
  return out
}

/** The answer text without its scene code blocks. */
export function withoutSceneBlocks(text: string): string {
  return text.replace(/```(?:json|velophi|velophi-scene|jsonc)?\s*\n([\s\S]*?)```/gi, (all, body: string) => {
    const r = parseLoose(body.trim())
    const v = r.ok && !r.truncated ? r.value : null
    return isObj(v) && (Array.isArray(v.bodies) || isObj(v.scene)) ? '' : all
  }).replace(/\n{3,}/g, '\n\n').trim()
}
