/**
 * Scene files (.velophi.json): UTF-8 JSON with a fixed key order, numbers written with full precision
 * (shortest round-trip form), so a saved scene reloads bit-identically and diffs are readable. Older
 * versions are migrated step by step; unknown fields of newer files are kept in `extra`.
 */
import { tl } from '../../i18n'
import type { AnnotationDef, BodyDef, BranchDef, ConnectorDef, PartShapeDef, RailLoopDef, RegionDef, Scene, StartLedgerDef, StopAtDef, StopKind } from './types'
import { ENGINE_VERSION, LEGACY_SCENE_FORMATS, MAX_DURATION, SCENE_FORMAT, SCENE_VERSION, SCENE_VERSION_REGIONS, STOP_KINDS, sceneVersionOf } from './types'
import { emptyScene } from './build'
import { checkForceExpr, polygonIsSimple } from '../../engine/calc'

/** Invalid scene file; the message is user-facing. */
export class SceneFileError extends Error {}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json }

const BODY_KEYS = ['id', 'name', 'kind', 'role', 'shape', 'position', 'angle', 'velocity', 'angularVelocity', 'mass', 'inertia', 'fixedRotation', 'material', 'beltSpeed', 'color', 'drag', 'charge'] as const
const REGION_KEYS = ['id', 'name', 'kind', 'shape', 'x', 'y', 'w', 'h', 'r', 'E', 'B', 'omega', 'phase', 'density', 'depth', 'dragLinear', 'dragQuadratic', 'color'] as const
const RAIL_KEYS = ['id', 'name', 'body', 'angle', 'L', 'R', 'B'] as const
const SCENE_KEYS = ['format', 'version', 'dimension', 'engine', 'name', 'description', 'settings', 'bodies', 'pulleys', 'connectors', 'contactPairs', 'view', 'watch', 'annotations', 'customQuantities', 'branches', 'extra'] as const

function ordered(value: unknown, order?: readonly string[]): Json {
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) return value.map(v => ordered(v))
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const keys = order ? [...order.filter(k => k in obj), ...Object.keys(obj).filter(k => !order.includes(k)).sort()] : Object.keys(obj)
    const out: Record<string, Json> = {}
    for (const k of keys) if (obj[k] !== undefined) out[k] = ordered(obj[k])
    return out
  }
  if (typeof value === 'number' && !Number.isFinite(value)) throw new SceneFileError(tl('场景中有非有限数值'))
  return value as Json
}

/** Serialize a scene to the canonical file text (fixed key order, trailing newline). */
export function serializeScene(scene: Scene): string {
  return JSON.stringify(sceneDoc(scene), null, 2) + '\n'
}

/** The ordered JSON document of a scene (branches hold their own scenes as documents). */
function sceneDoc(scene: Scene): Json {
  const doc = {
    ...scene,
    // 26.54 (D78): format 6 only for scenes with charges or fields; 26.55: format 7 for regions, liquids and rail loops
    format: SCENE_FORMAT, version: sceneVersionOf(scene), engine: ENGINE_VERSION,
    // 26.55: regions and rail loops in a fixed key order (a reloaded scene writes the same text)
    settings: { ...scene.settings, ...(scene.settings.regions ? { regions: scene.settings.regions.map(r => ordered(r, REGION_KEYS)) } : {}), ...(scene.settings.railLoops ? { railLoops: scene.settings.railLoops.map(r => ordered(r, RAIL_KEYS)) } : {}) },
    bodies: scene.bodies.map(b => ordered(b, BODY_KEYS)),
    connectors: scene.connectors.map(c => ordered(c, ['id', 'name', 'type'])),
    ...(scene.branches ? { branches: scene.branches.map(b => ({ id: b.id, name: b.name, parent: b.parent, t: b.t, scene: sceneDoc(b.scene) })) } : {})
  }
  return ordered(doc, SCENE_KEYS)
}

const num = (v: unknown, path: string, def?: number): number => {
  if (v === undefined && def !== undefined) return def
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new SceneFileError(tl('{0} 应为数值', [path]))
  return v
}
const str = (v: unknown, path: string, def?: string): string => {
  if (v === undefined && def !== undefined) return def
  if (typeof v !== 'string') throw new SceneFileError(tl('{0} 应为文本', [path]))
  return v
}
const vec = (v: unknown, path: string, def?: { x: number; y: number }) => {
  if (v === undefined && def) return { ...def }
  const o = v as { x?: unknown; y?: unknown }
  if (!o || typeof o !== 'object') throw new SceneFileError(tl('{0} 应为向量', [path]))
  return { x: num(o.x, `${path}.x`), y: num(o.y, `${path}.y`) }
}

/** Migrations from version k to k + 1. */
const MIGRATIONS: Record<number, (doc: Record<string, unknown>) => Record<string, unknown>> = {
  // 26.48 -> 26.49: annotations, movable pulleys and expression forces are new optional fields
  1: doc => ({ ...doc, annotations: doc.annotations ?? [] }),
  // 26.49 -> 26.50: the duration may be null (unbounded) and there is an optional stop condition; old files keep
  // their numeric duration (and so their fingerprints), which is also their finite length for sweeps
  2: doc => {
    const st = { ...((doc.settings ?? {}) as Record<string, unknown>) }
    if (st.duration === null || st.duration === undefined) st.duration = 5
    st.legacyDuration = st.duration
    st.stopAt = null
    return { ...doc, settings: st }
  },
  // 26.50 -> 26.51: drag, gravitation and the new connectors are optional fields; nothing to change
  3: doc => doc,
  // 26.51 -> 26.52: compound and concave shapes, slider limits, motor torque limits, rolling resistance, central
  // fields and the Gauss–Legendre integrator are optional fields; nothing to change
  4: doc => doc
}

function parseStopAt(v: unknown): StopAtDef | null {
  if (v === null || v === undefined) return null
  const o = v as Record<string, unknown>
  if (!o || typeof o !== 'object' || !STOP_KINDS.includes(o.on as StopKind)) throw new SceneFileError(tl('settings.stopAt.on 未知'))
  return { on: o.on as StopKind, after: num(o.after, 'settings.stopAt.after') }
}

/**
 * A field region or liquid of `settings.regions` (26.55, D90, D92). Only the fields present are kept (the core
 * supplies the defaults), so a scene reloads to the same text.
 */
function parseRegion(o: Record<string, unknown>, path: string): RegionDef {
  if (!o || typeof o !== 'object') throw new SceneFileError(tl('{0} 应为对象', [path]))
  const r: RegionDef = { id: str(o.id, `${path}.id`), name: str(o.name, `${path}.name`, tl('区域')), kind: o.kind === 'liquid' ? 'liquid' : 'field', shape: o.shape === 'circle' ? 'circle' : 'rect', x: num(o.x, `${path}.x`, 0), y: num(o.y, `${path}.y`, 0) }
  const opt = (k: 'w' | 'h' | 'r' | 'B' | 'omega' | 'phase' | 'density' | 'depth' | 'dragLinear' | 'dragQuadratic') => { if (o[k] !== undefined && o[k] !== null) r[k] = num(o[k], `${path}.${k}`) }
  for (const k of ['w', 'h', 'r', 'B', 'omega', 'phase', 'density', 'depth', 'dragLinear', 'dragQuadratic'] as const) opt(k)
  if (o.E !== undefined && o.E !== null) r.E = vec(o.E, `${path}.E`)
  if (typeof o.color === 'string') r.color = o.color
  return r
}

/** A rail loop of `settings.railLoops` (26.55, D91). */
function parseRailLoop(o: Record<string, unknown>, path: string): RailLoopDef {
  if (!o || typeof o !== 'object') throw new SceneFileError(tl('{0} 应为对象', [path]))
  return { id: str(o.id, `${path}.id`), name: str(o.name, `${path}.name`, tl('导轨回路')), body: str(o.body, `${path}.body`), angle: num(o.angle, `${path}.angle`, 0), L: Math.abs(num(o.L, `${path}.L`, 0.5)), R: Math.abs(num(o.R, `${path}.R`, 1)), B: num(o.B, `${path}.B`, 1) }
}

/** Parse, migrate and validate scene file text; `warnings` are user-facing messages. */
export function parseScene(text: string): { scene: Scene; warnings: string[] } {
  let raw: unknown
  try { raw = JSON.parse(text) } catch (e) { throw new SceneFileError(tl('不是有效的 JSON：{0}', [(e as Error).message])) }
  if (!raw || typeof raw !== 'object') throw new SceneFileError(tl('文件内容不是场景'))
  let doc = raw as Record<string, unknown>
  if (doc.format !== SCENE_FORMAT && !LEGACY_SCENE_FORMATS.includes(String(doc.format))) throw new SceneFileError(tl('不是 VeloPhi 场景文件（format 字段不符）'))
  const warnings: string[] = []
  let version = num(doc.version, 'version')
  if (version > SCENE_VERSION_REGIONS) warnings.push(tl('文件来自更新的版本（格式 {0}），未知字段已保留但可能不生效', [version]))
  // Formats 6 (26.54) and 7 (26.55) only add optional fields to format 5
  while (version < SCENE_VERSION) {
    const m = MIGRATIONS[version]
    if (!m) throw new SceneFileError(tl('无法从格式 {0} 升级', [version]))
    doc = m(doc); version++
  }
  const base = emptyScene()
  const st = (doc.settings ?? {}) as Record<string, unknown>
  const scene: Scene = {
    format: SCENE_FORMAT, version: SCENE_VERSION, dimension: 2, engine: str(doc.engine, 'engine', ENGINE_VERSION),
    name: str(doc.name, 'name', base.name), description: str(doc.description, 'description', ''),
    settings: {
      gravity: vec(st.gravity, 'settings.gravity', base.settings.gravity),
      outputStep: num(st.outputStep, 'settings.outputStep', base.settings.outputStep),
      integrator: (['dopri5', 'rk4', 'euler', 'moreau', 'gauss4'].includes(st.integrator as string) ? st.integrator : 'dopri5') as Scene['settings']['integrator'],
      relTol: num(st.relTol, 'settings.relTol', base.settings.relTol),
      absTol: num(st.absTol, 'settings.absTol', base.settings.absTol),
      duration: st.duration === null || st.duration === undefined ? null : num(st.duration, 'settings.duration'),
      stopAt: parseStopAt(st.stopAt),
      legacyDuration: num(st.legacyDuration, 'settings.legacyDuration', typeof st.duration === 'number' ? st.duration : base.settings.legacyDuration),
      energyZeroY: num(st.energyZeroY, 'settings.energyZeroY', 0),
      ...(st.gravitation && typeof st.gravitation === 'object' ? { gravitation: { G: num((st.gravitation as Record<string, unknown>).G, 'settings.gravitation.G') } } : {}),
      ...(st.startTime !== undefined && st.startTime !== null ? { startTime: num(st.startTime, 'settings.startTime') } : {}),
      ...(st.startLedger && typeof st.startLedger === 'object' ? { startLedger: parseStartLedger(st.startLedger as Record<string, unknown>) } : {}),
      // 26.54 (D78): uniform fields and the Coulomb interaction
      ...(st.electric && typeof st.electric === 'object' ? { electric: { E: vec((st.electric as Record<string, unknown>).E, 'settings.electric.E') } } : {}),
      ...(st.magnetic && typeof st.magnetic === 'object' ? { magnetic: { B: num((st.magnetic as Record<string, unknown>).B, 'settings.magnetic.B') } } : {}),
      ...(st.coulomb && typeof st.coulomb === 'object' ? { coulomb: { k: num((st.coulomb as Record<string, unknown>).k, 'settings.coulomb.k') } } : {}),
      // 26.55 (D90–D92): bounded field regions, liquids and rail loops
      ...(Array.isArray(st.regions) && st.regions.length ? { regions: (st.regions as Array<Record<string, unknown>>).map((r, i) => parseRegion(r, `settings.regions[${i}]`)) } : {}),
      ...(Array.isArray(st.railLoops) && st.railLoops.length ? { railLoops: (st.railLoops as Array<Record<string, unknown>>).map((r, i) => parseRailLoop(r, `settings.railLoops[${i}]`)) } : {})
    },
    bodies: ((doc.bodies ?? []) as unknown[]).map((b, i) => parseBody(b as Record<string, unknown>, `bodies[${i}]`)),
    pulleys: ((doc.pulleys ?? []) as Array<Record<string, unknown>>).map((p, i) => ({ id: str(p.id, `pulleys[${i}].id`), name: str(p.name, `pulleys[${i}].name`, tl('滑轮')), position: vec(p.position, `pulleys[${i}].position`), radius: num(p.radius, `pulleys[${i}].radius`, 0), ...(typeof p.body === 'string' ? { body: p.body } : {}) })),
    connectors: ((doc.connectors ?? []) as unknown[]).map(c => c as ConnectorDef),
    contactPairs: ((doc.contactPairs ?? []) as Array<Record<string, unknown>>).map((p, i) => ({ a: str(p.a, `contactPairs[${i}].a`), b: str(p.b, `contactPairs[${i}].b`), muS: num(p.muS, 'muS'), muK: num(p.muK, 'muK'), restitution: num(p.restitution, 'restitution'), ...(p.rolling !== undefined && p.rolling !== null ? { rolling: num(p.rolling, `contactPairs[${i}].rolling`) } : {}) })),
    view: { center: vec((doc.view as Record<string, unknown> | undefined)?.center, 'view.center', base.view.center), pixelsPerMeter: num((doc.view as Record<string, unknown> | undefined)?.pixelsPerMeter, 'view.pixelsPerMeter', base.view.pixelsPerMeter) },
    watch: Array.isArray(doc.watch) ? (doc.watch as unknown[]).filter((w): w is string => typeof w === 'string') : [],
    annotations: Array.isArray(doc.annotations) ? (doc.annotations as unknown[]).filter(isAnnotation) : [],
    ...(Array.isArray(doc.branches) && doc.branches.length ? { branches: (doc.branches as Array<Record<string, unknown>>).map((b, i) => parseBranch(b, i)) } : {}),
    ...(Array.isArray(doc.customQuantities) && doc.customQuantities.length ? { customQuantities: (doc.customQuantities as Array<Record<string, unknown>>).map((q, i) => ({ id: str(q?.id, `customQuantities[${i}].id`), name: str(q?.name, `customQuantities[${i}].name`, ''), expr: str(q?.expr, `customQuantities[${i}].expr`) })) } : {})
  }
  const known = new Set<string>(SCENE_KEYS)
  const extra: Record<string, unknown> = { ...((doc.extra as Record<string, unknown>) ?? {}) }
  for (const [k, v] of Object.entries(doc)) if (!known.has(k)) extra[k] = v
  if (Object.keys(extra).length) scene.extra = extra
  scene.version = sceneVersionOf(scene)
  validateScene(scene)
  return { scene, warnings }
}

function parseBranch(b: Record<string, unknown>, i: number): BranchDef {
  if (!b || typeof b !== 'object' || !b.scene || typeof b.scene !== 'object') throw new SceneFileError(tl('{0} 应为分支', [`branches[${i}]`]))
  const scene = parseScene(JSON.stringify(b.scene)).scene
  delete scene.branches
  return { id: str(b.id, `branches[${i}].id`), name: str(b.name, `branches[${i}].name`, ''), parent: b.parent === null || b.parent === undefined ? null : str(b.parent, `branches[${i}].parent`), t: num(b.t, `branches[${i}].t`), scene }
}

function parseStartLedger(o: Record<string, unknown>): StartLedgerDef {
  const out: StartLedgerDef = {
    frictionHeat: num(o.frictionHeat, 'settings.startLedger.frictionHeat', 0), appliedWork: num(o.appliedWork, 'settings.startLedger.appliedWork', 0),
    damping: num(o.damping, 'settings.startLedger.damping', 0), beltWork: num(o.beltWork, 'settings.startLedger.beltWork', 0),
    impactLoss: num(o.impactLoss, 'settings.startLedger.impactLoss', 0)
  }
  // 26.55: the counters of regions, liquids and rail loops
  for (const k of ['fieldWork', 'buoyancyWork', 'jouleHeat', 'liquidHeat'] as const) if (o[k] !== undefined && o[k] !== null) out[k] = num(o[k], `settings.startLedger.${k}`)
  if (o.pairs && typeof o.pairs === 'object') {
    const pairs: Record<string, [number, number]> = {}
    for (const [k, v] of Object.entries(o.pairs as Record<string, unknown>)) {
      if (!Array.isArray(v) || v.length !== 2) throw new SceneFileError(tl('{0} 应为数值', [`settings.startLedger.pairs.${k}`]))
      pairs[k] = [num(v[0], `settings.startLedger.pairs.${k}`), num(v[1], `settings.startLedger.pairs.${k}`)]
    }
    out.pairs = pairs
  }
  return out
}

function isAnnotation(a: unknown): a is AnnotationDef {
  if (!a || typeof a !== 'object') return false
  const o = a as Record<string, unknown>
  const v = (p: unknown) => !!p && typeof p === 'object' && Number.isFinite((p as { x: unknown }).x) && Number.isFinite((p as { y: unknown }).y)
  if (typeof o.id !== 'string') return false
  switch (o.type) {
    case 'text': return v(o.at) && typeof o.text === 'string'
    case 'arrow': case 'ruler': return v(o.from) && v(o.to)
    case 'angle': return v(o.vertex) && v(o.a) && v(o.b)
    default: return false
  }
}

/** A shape that may be a part of a compound shape. */
function parsePartShape(shape: Record<string, unknown>, path: string): PartShapeDef {
  if (shape.type === 'circle') return { type: 'circle', radius: num(shape.radius, `${path}.radius`) }
  if (shape.type === 'box') return { type: 'box', width: num(shape.width, `${path}.width`), height: num(shape.height, `${path}.height`) }
  if (shape.type === 'polygon') {
    if (!Array.isArray(shape.points)) throw new SceneFileError(tl('{0} 应为列表', [`${path}.points`]))
    return { type: 'polygon', points: (shape.points as unknown[]).map((p, i) => vec(p, `${path}.points[${i}]`)) }
  }
  throw new SceneFileError(tl('{0}.shape.type 未知', [path.replace(/\.shape$/, '')]))
}

function parseBody(b: Record<string, unknown>, path: string): BodyDef {
  const shape = b.shape as Record<string, unknown>
  if (!shape || typeof shape !== 'object') throw new SceneFileError(tl('{0}.shape 缺失', [path]))
  let s: BodyDef['shape']
  if (shape.type === 'compound') {
    // 26.52 (D35): parts with their placement
    if (!Array.isArray(shape.parts)) throw new SceneFileError(tl('{0} 应为列表', [`${path}.shape.parts`]))
    s = {
      type: 'compound',
      parts: (shape.parts as Array<Record<string, unknown>>).map((p, i) => {
        const pp = `${path}.shape.parts[${i}]`
        if (!p || typeof p !== 'object' || !p.shape || typeof p.shape !== 'object') throw new SceneFileError(tl('{0}.shape 缺失', [pp]))
        return { shape: parsePartShape(p.shape as Record<string, unknown>, `${pp}.shape`), position: vec(p.position, `${pp}.position`, { x: 0, y: 0 }), angle: num(p.angle, `${pp}.angle`, 0) }
      })
    }
  } else s = parsePartShape(shape, `${path}.shape`)
  const mat = (b.material ?? {}) as Record<string, unknown>
  const kind = (['particle', 'rigid', 'static'].includes(b.kind as string) ? b.kind : 'rigid') as BodyDef['kind']
  return {
    id: str(b.id, `${path}.id`), name: str(b.name, `${path}.name`, tl('物体')), kind, role: (b.role as BodyDef['role']) ?? 'generic', shape: s,
    position: vec(b.position, `${path}.position`), angle: num(b.angle, `${path}.angle`, 0),
    velocity: vec(b.velocity, `${path}.velocity`, { x: 0, y: 0 }), angularVelocity: num(b.angularVelocity, `${path}.angularVelocity`, 0),
    mass: num(b.mass, `${path}.mass`, kind === 'static' ? 0 : 1), inertia: b.inertia === null || b.inertia === undefined ? null : num(b.inertia, `${path}.inertia`),
    fixedRotation: !!b.fixedRotation,
    material: { muS: num(mat.muS, `${path}.material.muS`, 0), muK: num(mat.muK, `${path}.material.muK`, 0), restitution: num(mat.restitution, `${path}.material.restitution`, 0), ...(mat.rolling !== undefined && mat.rolling !== null ? { rolling: num(mat.rolling, `${path}.material.rolling`) } : {}) },
    beltSpeed: num(b.beltSpeed, `${path}.beltSpeed`, 0), color: str(b.color, `${path}.color`, '#2563eb'),
    ...(b.drag && typeof b.drag === 'object' ? { drag: { linear: num((b.drag as Record<string, unknown>).linear, `${path}.drag.linear`, 0), quadratic: num((b.drag as Record<string, unknown>).quadratic, `${path}.drag.quadratic`, 0) } } : {}),
    // 26.54 (D78): neutral bodies keep no key
    ...(b.charge !== undefined && b.charge !== null && b.charge !== 0 ? { charge: num(b.charge, `${path}.charge`) } : {})
  }
}

/** Structural checks; throws with a readable message. */
export function validateScene(scene: Scene) {
  const ids = new Set<string>()
  for (const b of scene.bodies) {
    if (ids.has(b.id)) throw new SceneFileError(tl('物体 id 重复：{0}', [b.id]))
    ids.add(b.id)
    if (b.kind !== 'static' && !(b.mass > 0)) throw new SceneFileError(tl('{0}：质量必须大于 0', [b.name]))
    if (b.shape.type === 'circle' && !(b.shape.radius > 0)) throw new SceneFileError(tl('{0}：半径必须大于 0', [b.name]))
    if (b.shape.type === 'box' && !(b.shape.width > 0 && b.shape.height > 0)) throw new SceneFileError(tl('{0}：宽高必须大于 0', [b.name]))
    if (b.shape.type === 'polygon' && b.shape.points.length < 3) throw new SceneFileError(tl('{0}：多边形至少需要 3 个顶点', [b.name]))
    // 26.52 (D35): concave polygons are allowed, self-intersecting ones are not; compound parts are checked one by one
    if (b.shape.type === 'polygon' && !polygonIsSimple(b.shape.points)) throw new SceneFileError(tl('{0}：多边形的边不能相交，面积不能为零', [b.name]))
    if (b.shape.type === 'compound') {
      if (b.shape.parts.length === 0) throw new SceneFileError(tl('{0}：复合体至少需要一个部分', [b.name]))
      for (const p of b.shape.parts) {
        const ps = p.shape
        if ((ps.type === 'circle' && !(ps.radius > 0)) || (ps.type === 'box' && !(ps.width > 0 && ps.height > 0)) || (ps.type === 'polygon' && !polygonIsSimple(ps.points))) {
          throw new SceneFileError(tl('{0}：复合体的部分无效（半径、宽高须大于 0，多边形须为简单多边形）', [b.name]))
        }
      }
    }
    const m = b.material
    if (m.muS < 0 || m.muK < 0 || m.restitution < 0 || m.restitution > 1) throw new SceneFileError(tl('{0}：摩擦因数应 ≥ 0，恢复系数应在 0…1', [b.name]))
    if (m.rolling !== undefined && !(m.rolling >= 0 && m.rolling <= 1)) throw new SceneFileError(tl('{0}：滚动阻力系数应在 0…1', [b.name]))
  }
  for (const p of scene.contactPairs) {
    if (p.rolling !== undefined && !(p.rolling >= 0 && p.rolling <= 1)) throw new SceneFileError(tl('{0}：滚动阻力系数应在 0…1', [`${p.a}–${p.b}`]))
  }
  const pulleys = new Set(scene.pulleys.map(p => p.id))
  for (const p of scene.pulleys) if (p.body && !ids.has(p.body)) throw new SceneFileError(tl('{0}：所在的物体 {1} 不存在', [p.name, p.body]))
  for (const c of scene.connectors) {
    for (const a of c.type === 'force' || c.type === 'central' ? [c.a] : [c.a, c.b]) if (a.body && !ids.has(a.body)) throw new SceneFileError(tl('{0}：连接的物体 {1} 不存在', [c.name, a.body]))
    if (c.type === 'rope') {
      for (const p of c.pulleys) if (!pulleys.has(p.pulley)) throw new SceneFileError(tl('{0}：滑轮 {1} 不存在', [c.name, p.pulley]))
      // A rope end cannot sit on the body that carries the very wheel it runs onto
      const first = c.pulleys.length ? scene.pulleys.find(p => p.id === c.pulleys[0].pulley) : undefined
      const last = c.pulleys.length ? scene.pulleys.find(p => p.id === c.pulleys[c.pulleys.length - 1].pulley) : undefined
      if (first?.body && c.a.body === first.body) throw new SceneFileError(tl('{0}：绳端固定在{1}上，不能直接绕过同一物体上的{2}（请把绳端系在别处，或去掉该滑轮）', [c.name, bodyName(scene, first.body), first.name]))
      if (last?.body && c.b.body === last.body) throw new SceneFileError(tl('{0}：绳端固定在{1}上，不能直接绕过同一物体上的{2}（请把绳端系在别处，或去掉该滑轮）', [c.name, bodyName(scene, last.body), last.name]))
      for (let i = 0; i + 1 < c.pulleys.length; i++) {
        if (c.pulleys[i].pulley === c.pulleys[i + 1].pulley) throw new SceneFileError(tl('{0}：连续两次绕过同一个滑轮', [c.name]))
      }
    }
    if (c.type === 'spring' && !(c.stiffness > 0)) throw new SceneFileError(tl('{0}：劲度系数必须大于 0', [c.name]))
    if (c.type === 'spring' && c.cubic !== undefined && !Number.isFinite(c.cubic)) throw new SceneFileError(tl('{0}：三次项系数应为有限数', [c.name]))
    if (c.type === 'damper' && !(c.damping >= 0)) throw new SceneFileError(tl('{0}：阻尼系数应 ≥ 0', [c.name]))
    if (c.type === 'slider' && !(Math.hypot(c.axis?.x ?? 0, c.axis?.y ?? 0) > 0)) throw new SceneFileError(tl('{0}：滑轨方向不能为零向量', [c.name]))
    if (c.type === 'motor' && !(Number.isFinite(c.speed) && Number.isFinite(c.torque))) throw new SceneFileError(tl('{0}：马达的转速和力矩应为有限数', [c.name]))
    if (c.type === 'motor' && c.maxTorque !== undefined && c.maxTorque !== null && !(c.maxTorque > 0 && Number.isFinite(c.maxTorque))) throw new SceneFileError(tl('{0}：马达的力矩上限应大于 0', [c.name]))
    if (c.type === 'slider' && c.limits) {
      const { min, max, restitution } = c.limits
      if ((min !== null && !Number.isFinite(min)) || (max !== null && !Number.isFinite(max)) || (min !== null && max !== null && !(min < max))) throw new SceneFileError(tl('{0}：滑轨限位应满足 下限 < 上限', [c.name]))
      if (!(restitution >= 0 && restitution <= 1)) throw new SceneFileError(tl('{0}：限位的恢复系数应在 0…1', [c.name]))
    }
    if (c.type === 'central') {
      if (!(Number.isFinite(c.k) && Number.isFinite(c.n) && Math.abs(c.n) <= 4)) throw new SceneFileError(tl('{0}：有心力的强度应为有限数，指数应在 −4…4', [c.name]))
      for (const t of c.targets ?? []) if (!ids.has(t)) throw new SceneFileError(tl('{0}：作用对象 {1} 不存在', [c.name, t]))
    }
    if (c.type === 'gear' && (!c.a.body || !(Number.isFinite(c.ratio) && c.ratio !== 0))) throw new SceneFileError(tl('{0}：齿轮需要连接物体，传动比不能为 0', [c.name]))
    if (c.type === 'force' && c.expr) {
      if (!c.a.body) throw new SceneFileError(tl('{0}：变力必须作用在物体上', [c.name]))
      for (const comp of ['x', 'y'] as const) {
        const r = checkForceExpr(c.expr[comp])
        if (!r.ok) throw new SceneFileError(tl('{0}：F{1} 表达式有误：{2}', [c.name, comp, r.message]))
      }
    }
  }
  const s = scene.settings
  if (!(s.outputStep > 0 && s.outputStep <= 0.1)) throw new SceneFileError(tl('时间步长应在 (0, 0.1] s'))
  if (s.duration !== null && !(s.duration > 0 && s.duration <= MAX_DURATION)) throw new SceneFileError(tl('仿真时长应在 (0, {0}] s，或不限时长', [MAX_DURATION]))
  if (!(s.legacyDuration > 0 && s.legacyDuration <= MAX_DURATION)) throw new SceneFileError(tl('有限计算时长应在 (0, {0}] s', [MAX_DURATION]))
  if (s.stopAt) {
    if (!STOP_KINDS.includes(s.stopAt.on)) throw new SceneFileError(tl('停止条件的事件类型未知'))
    if (!(s.stopAt.after >= 0 && s.stopAt.after <= MAX_DURATION)) throw new SceneFileError(tl('停止条件的延时应在 [0, {0}] s', [MAX_DURATION]))
  }
  if (!(s.relTol > 0 && s.absTol > 0)) throw new SceneFileError(tl('容差必须大于 0'))
  if (s.gravitation && !(s.gravitation.G > 0)) throw new SceneFileError(tl('引力常量 G 必须大于 0'))
  if (s.startTime !== undefined && !(s.startTime >= 0 && s.startTime <= MAX_DURATION)) throw new SceneFileError(tl('分支起始时刻应在 [0, {0}] s', [MAX_DURATION]))
  for (const b of scene.bodies) if (b.drag && !(b.drag.linear >= 0 && b.drag.quadratic >= 0)) throw new SceneFileError(tl('{0}：阻力系数应 ≥ 0', [b.name]))
  // 26.54 (D78): charges and fields
  for (const b of scene.bodies) if (b.charge !== undefined && !Number.isFinite(b.charge)) throw new SceneFileError(tl('{0}：电荷量应为有限数', [b.name]))
  if (s.electric && !(Number.isFinite(s.electric.E.x) && Number.isFinite(s.electric.E.y))) throw new SceneFileError(tl('电场强度应为有限数'))
  if (s.magnetic && !Number.isFinite(s.magnetic.B)) throw new SceneFileError(tl('磁感应强度应为有限数'))
  if (s.coulomb && !(s.coulomb.k > 0 && Number.isFinite(s.coulomb.k))) throw new SceneFileError(tl('静电力常量 k 必须大于 0'))
  // 26.55 (D90–D92): regions and rail loops
  const regionIds = new Set<string>()
  for (const r of s.regions ?? []) {
    if (!r.id || regionIds.has(r.id)) throw new SceneFileError(tl('区域 id 无效或重复：{0}', [r.id]))
    regionIds.add(r.id)
    if (r.shape === 'circle' ? !((r.r ?? 1) > 0) : !((r.w ?? 1) > 0 && (r.h ?? 1) > 0)) throw new SceneFileError(tl('{0}：区域的尺寸必须大于 0', [r.name]))
    if (r.kind === 'liquid' && r.shape !== 'rect') throw new SceneFileError(tl('{0}：液体区域只能是矩形', [r.name]))
    if (r.kind === 'liquid' && !((r.depth ?? 0.1) > 0)) throw new SceneFileError(tl('{0}：物体的厚度必须大于 0', [r.name]))
    if (r.kind === 'liquid' && !((r.density ?? 1000) >= 0 && (r.dragLinear ?? 0) >= 0 && (r.dragQuadratic ?? 0) >= 0)) throw new SceneFileError(tl('{0}：密度和阻力系数不能为负', [r.name]))
  }
  for (const l of s.railLoops ?? []) {
    if (!l.id || regionIds.has(l.id)) throw new SceneFileError(tl('区域 id 无效或重复：{0}', [l.id]))
    regionIds.add(l.id)
    if (!ids.has(l.body)) throw new SceneFileError(tl('{0}：导体棒 {1} 不存在', [l.name, l.body]))
    if (!(l.R > 0)) throw new SceneFileError(tl('{0}：回路电阻必须大于 0', [l.name]))
  }
  const branchIds = new Set<string>()
  for (const b of scene.branches ?? []) {
    if (!b.id || branchIds.has(b.id)) throw new SceneFileError(tl('分支 id 无效或重复：{0}', [b.id]))
    if (b.parent !== null && !branchIds.has(b.parent)) throw new SceneFileError(tl('分支 {0} 的父分支 {1} 不存在（父分支须排在前面）', [b.id, b.parent]))
    branchIds.add(b.id)
  }
  const custom = new Set<string>()
  for (const q of scene.customQuantities ?? []) {
    if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(q.id) || custom.has(q.id)) throw new SceneFileError(tl('自定义量的 id 无效或重复：{0}', [q.id]))
    custom.add(q.id)
  }
}

function bodyName(scene: Scene, id: string): string { return scene.bodies.find(b => b.id === id)?.name ?? id }

/** Deep copy of a scene (through JSON). */
export function cloneScene(scene: Scene): Scene { return JSON.parse(JSON.stringify(scene)) as Scene }
