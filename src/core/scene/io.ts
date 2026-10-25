/**
 * Scene files (.verity.json): UTF-8 JSON with a fixed key order, numbers written with full precision
 * (shortest round-trip form), so a saved scene reloads bit-identically and diffs are readable. Older
 * versions are migrated step by step; unknown fields of newer files are kept in `extra`.
 */
import { tl } from '../../i18n'
import type { AnnotationDef, BodyDef, ConnectorDef, Scene, StopAtDef, StopKind } from './types'
import { ENGINE_VERSION, MAX_DURATION, SCENE_FORMAT, SCENE_VERSION, STOP_KINDS } from './types'
import { emptyScene } from './build'
import { checkForceExpr } from '../solver/forceExpr'

/** Invalid scene file; the message is user-facing. */
export class SceneFileError extends Error {}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json }

const BODY_KEYS = ['id', 'name', 'kind', 'role', 'shape', 'position', 'angle', 'velocity', 'angularVelocity', 'mass', 'inertia', 'fixedRotation', 'material', 'beltSpeed', 'color'] as const
const SCENE_KEYS = ['format', 'version', 'dimension', 'engine', 'name', 'description', 'settings', 'bodies', 'pulleys', 'connectors', 'contactPairs', 'view', 'watch', 'annotations', 'extra'] as const

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
  const doc = {
    ...scene,
    format: SCENE_FORMAT, version: SCENE_VERSION, engine: ENGINE_VERSION,
    bodies: scene.bodies.map(b => ordered(b, BODY_KEYS)),
    connectors: scene.connectors.map(c => ordered(c, ['id', 'name', 'type']))
  }
  return JSON.stringify(ordered(doc, SCENE_KEYS), null, 2) + '\n'
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
  }
}

function parseStopAt(v: unknown): StopAtDef | null {
  if (v === null || v === undefined) return null
  const o = v as Record<string, unknown>
  if (!o || typeof o !== 'object' || !STOP_KINDS.includes(o.on as StopKind)) throw new SceneFileError(tl('settings.stopAt.on 未知'))
  return { on: o.on as StopKind, after: num(o.after, 'settings.stopAt.after') }
}

/** Parse, migrate and validate scene file text; `warnings` are user-facing messages. */
export function parseScene(text: string): { scene: Scene; warnings: string[] } {
  let raw: unknown
  try { raw = JSON.parse(text) } catch (e) { throw new SceneFileError(tl('不是有效的 JSON：{0}', [(e as Error).message])) }
  if (!raw || typeof raw !== 'object') throw new SceneFileError(tl('文件内容不是场景'))
  let doc = raw as Record<string, unknown>
  if (doc.format !== SCENE_FORMAT) throw new SceneFileError(tl('不是 Verity 场景文件（format 字段不符）'))
  const warnings: string[] = []
  let version = num(doc.version, 'version')
  if (version > SCENE_VERSION) warnings.push(tl('文件来自更新的版本（格式 {0}），未知字段已保留但可能不生效', [version]))
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
      integrator: (['dopri5', 'rk4', 'euler', 'moreau'].includes(st.integrator as string) ? st.integrator : 'dopri5') as Scene['settings']['integrator'],
      relTol: num(st.relTol, 'settings.relTol', base.settings.relTol),
      absTol: num(st.absTol, 'settings.absTol', base.settings.absTol),
      duration: st.duration === null || st.duration === undefined ? null : num(st.duration, 'settings.duration'),
      stopAt: parseStopAt(st.stopAt),
      legacyDuration: num(st.legacyDuration, 'settings.legacyDuration', typeof st.duration === 'number' ? st.duration : base.settings.legacyDuration),
      energyZeroY: num(st.energyZeroY, 'settings.energyZeroY', 0)
    },
    bodies: ((doc.bodies ?? []) as unknown[]).map((b, i) => parseBody(b as Record<string, unknown>, `bodies[${i}]`)),
    pulleys: ((doc.pulleys ?? []) as Array<Record<string, unknown>>).map((p, i) => ({ id: str(p.id, `pulleys[${i}].id`), name: str(p.name, `pulleys[${i}].name`, tl('滑轮')), position: vec(p.position, `pulleys[${i}].position`), radius: num(p.radius, `pulleys[${i}].radius`, 0), ...(typeof p.body === 'string' ? { body: p.body } : {}) })),
    connectors: ((doc.connectors ?? []) as unknown[]).map(c => c as ConnectorDef),
    contactPairs: ((doc.contactPairs ?? []) as Array<Record<string, unknown>>).map((p, i) => ({ a: str(p.a, `contactPairs[${i}].a`), b: str(p.b, `contactPairs[${i}].b`), muS: num(p.muS, 'muS'), muK: num(p.muK, 'muK'), restitution: num(p.restitution, 'restitution') })),
    view: { center: vec((doc.view as Record<string, unknown> | undefined)?.center, 'view.center', base.view.center), pixelsPerMeter: num((doc.view as Record<string, unknown> | undefined)?.pixelsPerMeter, 'view.pixelsPerMeter', base.view.pixelsPerMeter) },
    watch: Array.isArray(doc.watch) ? (doc.watch as unknown[]).filter((w): w is string => typeof w === 'string') : [],
    annotations: Array.isArray(doc.annotations) ? (doc.annotations as unknown[]).filter(isAnnotation) : []
  }
  const known = new Set<string>(SCENE_KEYS)
  const extra: Record<string, unknown> = { ...((doc.extra as Record<string, unknown>) ?? {}) }
  for (const [k, v] of Object.entries(doc)) if (!known.has(k)) extra[k] = v
  if (Object.keys(extra).length) scene.extra = extra
  validateScene(scene)
  return { scene, warnings }
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

function parseBody(b: Record<string, unknown>, path: string): BodyDef {
  const shape = b.shape as Record<string, unknown>
  if (!shape || typeof shape !== 'object') throw new SceneFileError(tl('{0}.shape 缺失', [path]))
  let s: BodyDef['shape']
  if (shape.type === 'circle') s = { type: 'circle', radius: num(shape.radius, `${path}.shape.radius`) }
  else if (shape.type === 'box') s = { type: 'box', width: num(shape.width, `${path}.shape.width`), height: num(shape.height, `${path}.shape.height`) }
  else if (shape.type === 'polygon') s = { type: 'polygon', points: (shape.points as unknown[]).map((p, i) => vec(p, `${path}.shape.points[${i}]`)) }
  else throw new SceneFileError(tl('{0}.shape.type 未知', [path]))
  const mat = (b.material ?? {}) as Record<string, unknown>
  const kind = (['particle', 'rigid', 'static'].includes(b.kind as string) ? b.kind : 'rigid') as BodyDef['kind']
  return {
    id: str(b.id, `${path}.id`), name: str(b.name, `${path}.name`, tl('物体')), kind, role: (b.role as BodyDef['role']) ?? 'generic', shape: s,
    position: vec(b.position, `${path}.position`), angle: num(b.angle, `${path}.angle`, 0),
    velocity: vec(b.velocity, `${path}.velocity`, { x: 0, y: 0 }), angularVelocity: num(b.angularVelocity, `${path}.angularVelocity`, 0),
    mass: num(b.mass, `${path}.mass`, kind === 'static' ? 0 : 1), inertia: b.inertia === null || b.inertia === undefined ? null : num(b.inertia, `${path}.inertia`),
    fixedRotation: !!b.fixedRotation,
    material: { muS: num(mat.muS, `${path}.material.muS`, 0), muK: num(mat.muK, `${path}.material.muK`, 0), restitution: num(mat.restitution, `${path}.material.restitution`, 0) },
    beltSpeed: num(b.beltSpeed, `${path}.beltSpeed`, 0), color: str(b.color, `${path}.color`, '#2563eb')
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
    const m = b.material
    if (m.muS < 0 || m.muK < 0 || m.restitution < 0 || m.restitution > 1) throw new SceneFileError(tl('{0}：摩擦因数应 ≥ 0，恢复系数应在 0…1', [b.name]))
  }
  const pulleys = new Set(scene.pulleys.map(p => p.id))
  for (const p of scene.pulleys) if (p.body && !ids.has(p.body)) throw new SceneFileError(tl('{0}：所在的物体 {1} 不存在', [p.name, p.body]))
  for (const c of scene.connectors) {
    for (const a of c.type === 'force' ? [c.a] : [c.a, c.b]) if (a.body && !ids.has(a.body)) throw new SceneFileError(tl('{0}：连接的物体 {1} 不存在', [c.name, a.body]))
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
}

function bodyName(scene: Scene, id: string): string { return scene.bodies.find(b => b.id === id)?.name ?? id }

/** Deep copy of a scene (through JSON). */
export function cloneScene(scene: Scene): Scene { return JSON.parse(JSON.stringify(scene)) as Scene }
