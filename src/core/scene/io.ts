/**
 * Scene files (.verity.json): UTF-8 JSON with a fixed key order, numbers written with full precision
 * (shortest round-trip form), so a saved scene reloads bit-identically and diffs are readable. Older
 * versions are migrated step by step; unknown fields of newer files are kept in `extra`.
 */
import type { BodyDef, ConnectorDef, Scene } from './types'
import { ENGINE_VERSION, SCENE_FORMAT, SCENE_VERSION } from './types'
import { emptyScene } from './build'

export class SceneFileError extends Error {}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json }

const BODY_KEYS = ['id', 'name', 'kind', 'role', 'shape', 'position', 'angle', 'velocity', 'angularVelocity', 'mass', 'inertia', 'fixedRotation', 'material', 'beltSpeed', 'color'] as const
const SCENE_KEYS = ['format', 'version', 'dimension', 'engine', 'name', 'description', 'settings', 'bodies', 'pulleys', 'connectors', 'contactPairs', 'view', 'watch', 'extra'] as const

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
  if (typeof value === 'number' && !Number.isFinite(value)) throw new SceneFileError('场景中有非有限数值')
  return value as Json
}

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
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new SceneFileError(`${path} 应为数值`)
  return v
}
const str = (v: unknown, path: string, def?: string): string => {
  if (v === undefined && def !== undefined) return def
  if (typeof v !== 'string') throw new SceneFileError(`${path} 应为文本`)
  return v
}
const vec = (v: unknown, path: string, def?: { x: number; y: number }) => {
  if (v === undefined && def) return { ...def }
  const o = v as { x?: unknown; y?: unknown }
  if (!o || typeof o !== 'object') throw new SceneFileError(`${path} 应为向量`)
  return { x: num(o.x, `${path}.x`), y: num(o.y, `${path}.y`) }
}

/** Migrations from version k to k + 1. */
const MIGRATIONS: Record<number, (doc: Record<string, unknown>) => Record<string, unknown>> = {}

export function parseScene(text: string): { scene: Scene; warnings: string[] } {
  let raw: unknown
  try { raw = JSON.parse(text) } catch (e) { throw new SceneFileError(`不是有效的 JSON：${(e as Error).message}`) }
  if (!raw || typeof raw !== 'object') throw new SceneFileError('文件内容不是场景')
  let doc = raw as Record<string, unknown>
  if (doc.format !== SCENE_FORMAT) throw new SceneFileError('不是 Verity 场景文件（format 字段不符）')
  const warnings: string[] = []
  let version = num(doc.version, 'version')
  if (version > SCENE_VERSION) warnings.push(`文件来自更新的版本（格式 ${version}），未知字段已保留但可能不生效`)
  while (version < SCENE_VERSION) {
    const m = MIGRATIONS[version]
    if (!m) throw new SceneFileError(`无法从格式 ${version} 升级`)
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
      integrator: (['dopri5', 'rk4', 'euler'].includes(st.integrator as string) ? st.integrator : 'dopri5') as Scene['settings']['integrator'],
      relTol: num(st.relTol, 'settings.relTol', base.settings.relTol),
      absTol: num(st.absTol, 'settings.absTol', base.settings.absTol),
      duration: num(st.duration, 'settings.duration', base.settings.duration),
      energyZeroY: num(st.energyZeroY, 'settings.energyZeroY', 0)
    },
    bodies: ((doc.bodies ?? []) as unknown[]).map((b, i) => parseBody(b as Record<string, unknown>, `bodies[${i}]`)),
    pulleys: ((doc.pulleys ?? []) as Array<Record<string, unknown>>).map((p, i) => ({ id: str(p.id, `pulleys[${i}].id`), name: str(p.name, `pulleys[${i}].name`, '滑轮'), position: vec(p.position, `pulleys[${i}].position`), radius: num(p.radius, `pulleys[${i}].radius`, 0) })),
    connectors: ((doc.connectors ?? []) as unknown[]).map(c => c as ConnectorDef),
    contactPairs: ((doc.contactPairs ?? []) as Array<Record<string, unknown>>).map((p, i) => ({ a: str(p.a, `contactPairs[${i}].a`), b: str(p.b, `contactPairs[${i}].b`), muS: num(p.muS, 'muS'), muK: num(p.muK, 'muK'), restitution: num(p.restitution, 'restitution') })),
    view: { center: vec((doc.view as Record<string, unknown> | undefined)?.center, 'view.center', base.view.center), pixelsPerMeter: num((doc.view as Record<string, unknown> | undefined)?.pixelsPerMeter, 'view.pixelsPerMeter', base.view.pixelsPerMeter) },
    watch: Array.isArray(doc.watch) ? (doc.watch as unknown[]).filter((w): w is string => typeof w === 'string') : []
  }
  const known = new Set<string>(SCENE_KEYS)
  const extra: Record<string, unknown> = { ...((doc.extra as Record<string, unknown>) ?? {}) }
  for (const [k, v] of Object.entries(doc)) if (!known.has(k)) extra[k] = v
  if (Object.keys(extra).length) scene.extra = extra
  validateScene(scene)
  return { scene, warnings }
}

function parseBody(b: Record<string, unknown>, path: string): BodyDef {
  const shape = b.shape as Record<string, unknown>
  if (!shape || typeof shape !== 'object') throw new SceneFileError(`${path}.shape 缺失`)
  let s: BodyDef['shape']
  if (shape.type === 'circle') s = { type: 'circle', radius: num(shape.radius, `${path}.shape.radius`) }
  else if (shape.type === 'box') s = { type: 'box', width: num(shape.width, `${path}.shape.width`), height: num(shape.height, `${path}.shape.height`) }
  else if (shape.type === 'polygon') s = { type: 'polygon', points: (shape.points as unknown[]).map((p, i) => vec(p, `${path}.shape.points[${i}]`)) }
  else throw new SceneFileError(`${path}.shape.type 未知`)
  const mat = (b.material ?? {}) as Record<string, unknown>
  const kind = (['particle', 'rigid', 'static'].includes(b.kind as string) ? b.kind : 'rigid') as BodyDef['kind']
  return {
    id: str(b.id, `${path}.id`), name: str(b.name, `${path}.name`, '物体'), kind, role: (b.role as BodyDef['role']) ?? 'generic', shape: s,
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
    if (ids.has(b.id)) throw new SceneFileError(`物体 id 重复：${b.id}`)
    ids.add(b.id)
    if (b.kind !== 'static' && !(b.mass > 0)) throw new SceneFileError(`${b.name}：质量必须大于 0`)
    if (b.shape.type === 'circle' && !(b.shape.radius > 0)) throw new SceneFileError(`${b.name}：半径必须大于 0`)
    if (b.shape.type === 'box' && !(b.shape.width > 0 && b.shape.height > 0)) throw new SceneFileError(`${b.name}：宽高必须大于 0`)
    if (b.shape.type === 'polygon' && b.shape.points.length < 3) throw new SceneFileError(`${b.name}：多边形至少需要 3 个顶点`)
    const m = b.material
    if (m.muS < 0 || m.muK < 0 || m.restitution < 0 || m.restitution > 1) throw new SceneFileError(`${b.name}：摩擦因数应 ≥ 0，恢复系数应在 0…1`)
  }
  const pulleys = new Set(scene.pulleys.map(p => p.id))
  for (const c of scene.connectors) {
    for (const a of c.type === 'force' ? [c.a] : [c.a, c.b]) if (a.body && !ids.has(a.body)) throw new SceneFileError(`${c.name}：连接的物体 ${a.body} 不存在`)
    if (c.type === 'rope') for (const p of c.pulleys) if (!pulleys.has(p.pulley)) throw new SceneFileError(`${c.name}：滑轮 ${p.pulley} 不存在`)
    if (c.type === 'spring' && !(c.stiffness > 0)) throw new SceneFileError(`${c.name}：劲度系数必须大于 0`)
  }
  const s = scene.settings
  if (!(s.outputStep > 0 && s.outputStep <= 0.1)) throw new SceneFileError('时间步长应在 (0, 0.1] s')
  if (!(s.duration > 0 && s.duration <= 600)) throw new SceneFileError('仿真时长应在 (0, 600] s')
  if (!(s.relTol > 0 && s.absTol > 0)) throw new SceneFileError('容差必须大于 0')
}

export function cloneScene(scene: Scene): Scene { return JSON.parse(JSON.stringify(scene)) as Scene }
