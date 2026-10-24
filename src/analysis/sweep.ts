/**
 * Parameter sweep (the "参数扫描" dialog): run the scene for N values of one parameter and measure one result
 * per run — the time of the first event of a kind, a quantity at a time, its maximum / minimum over the run or
 * its final value — e.g. the time of common velocity as a function of μ₁.
 *
 * Parameters are offered through a catalogue built from the scene (masses, friction, restitution, initial
 * velocities and angles, spring constants, forces, gravity, and — for an unedited template scene — the
 * template's own parameters such as the incline angle). All values are SI; the UI converts for display.
 *
 * Runs are sequential through an injectable runner (the app passes `startSimulation`, the tests `simulate`),
 * the loop yields between runs so the interface stays responsive, and it stops at the next opportunity when
 * cancelled. Pure (no DOM, no Vue).
 */
import type { Scene } from '../core/scene/types'
import type { ChangeType, Recording } from '../core/solver/simulation'
import { cloneScene, serializeScene, validateScene } from '../core/scene/io'
import { evaluateQuantity, listQuantities, makeContext } from '../core/observe/quantities'
import { observeAt } from '../formula/situations'
import { buildTemplate, templateById } from '../templates'
import { firstEvent } from './prediction'

/** Largest number of values in a sweep. */
export const MAX_SWEEP_POINTS = 50

/** A sweepable scene parameter. */
export interface SweepParam {
  id: string
  /** Group shown in the picker (a body, a contact pair, a connector, the template parameters …). */
  group: string
  label: string
  /** SI unit ('' for dimensionless). */
  unit: string
  /** Allowed SI range (inclusive) where the model requires one. */
  min?: number
  max?: number
  /** Read the parameter from a scene (SI). */
  get(scene: Scene): number
  /** Write the parameter into a scene (SI). */
  set(scene: Scene, v: number): void
}

const DEG = Math.PI / 180

/** Scene content that a template rebuild would reproduce (name, view, watch and extras excluded). */
function physics(scene: Scene): string {
  const s = JSON.parse(serializeScene(scene)) as Record<string, unknown>
  return JSON.stringify([s.settings, s.bodies, s.pulleys, s.connectors, s.contactPairs])
}

/** The template a scene was built from, when it has not been edited physically since. */
export function unchangedTemplate(scene: Scene): { id: string; values: Record<string, number> } | null {
  const tpl = (scene.extra as { template?: { id?: unknown; values?: unknown } } | undefined)?.template
  if (!tpl || typeof tpl.id !== 'string' || !tpl.values || typeof tpl.values !== 'object' || !templateById(tpl.id)) return null
  const values = tpl.values as Record<string, number>
  try {
    return physics(buildTemplate(tpl.id, values)) === physics(scene) ? { id: tpl.id, values } : null
  } catch {
    return null
  }
}

function templateUnit(u: string): { unit: string; toSi: number } {
  if (u === '°') return { unit: 'rad', toSi: DEG }
  return { unit: u, toSi: 1 }
}

/** Every sweepable numeric field of a scene. */
export function listSweepParams(scene: Scene): SweepParam[] {
  const out: SweepParam[] = []
  const tpl = unchangedTemplate(scene)
  if (tpl) {
    const info = templateById(tpl.id)!
    for (const p of info.params) {
      const { unit, toSi } = templateUnit(p.unit)
      out.push({
        id: `template:${p.key}`, group: `模板参数（${info.name}，按模板重建场景）`, label: p.label, unit,
        min: p.min !== undefined ? p.min * toSi : undefined, max: p.max !== undefined ? p.max * toSi : undefined,
        get: s => {
          const v = (s.extra as { template?: { values?: Record<string, number> } } | undefined)?.template?.values?.[p.key]
          return (v ?? p.value) * toSi
        },
        set: (s, v) => {
          const cur = (s.extra as { template?: { values?: Record<string, number> } } | undefined)?.template?.values ?? tpl.values
          const rebuilt = buildTemplate(tpl.id, { ...cur, [p.key]: v / toSi })
          // Keep what the user sees and names; replace the physics
          rebuilt.name = s.name; rebuilt.description = s.description; rebuilt.view = s.view; rebuilt.watch = s.watch; rebuilt.annotations = s.annotations
          rebuilt.extra = { ...(s.extra ?? {}), ...(rebuilt.extra ?? {}) }
          Object.assign(s, rebuilt)
        }
      })
    }
  }
  const body = (s: Scene, id: string) => { const b = s.bodies.find(x => x.id === id); if (!b) throw new Error(`物体 ${id} 不存在`); return b }
  for (const b0 of scene.bodies) {
    const id = b0.id, g = `物体：${b0.name}`
    if (b0.kind !== 'static') {
      out.push({ id: `body:${id}:mass`, group: g, label: '质量 m', unit: 'kg', min: 1e-9, get: s => body(s, id).mass, set: (s, v) => { body(s, id).mass = v } })
      out.push({ id: `body:${id}:vx`, group: g, label: '初速度 vₓ', unit: 'm/s', get: s => body(s, id).velocity.x, set: (s, v) => { body(s, id).velocity.x = v } })
      out.push({ id: `body:${id}:vy`, group: g, label: '初速度 v_y', unit: 'm/s', get: s => body(s, id).velocity.y, set: (s, v) => { body(s, id).velocity.y = v } })
      out.push({
        id: `body:${id}:speed`, group: g, label: '初速度大小 |v₀|（方向不变）', unit: 'm/s', min: 0,
        get: s => Math.hypot(body(s, id).velocity.x, body(s, id).velocity.y),
        set: (s, v) => { const b = body(s, id); const a = Math.atan2(b.velocity.y, b.velocity.x); b.velocity = { x: v * Math.cos(a), y: v * Math.sin(a) } }
      })
      out.push({
        id: `body:${id}:dir`, group: g, label: '初速度方向角 α（大小不变）', unit: 'rad',
        get: s => Math.atan2(body(s, id).velocity.y, body(s, id).velocity.x),
        set: (s, v) => { const b = body(s, id); const m = Math.hypot(b.velocity.x, b.velocity.y); b.velocity = { x: m * Math.cos(v), y: m * Math.sin(v) } }
      })
      if (b0.kind === 'rigid' && !b0.fixedRotation) out.push({ id: `body:${id}:omega`, group: g, label: '初角速度 ω₀', unit: 'rad/s', get: s => body(s, id).angularVelocity, set: (s, v) => { body(s, id).angularVelocity = v } })
    }
    out.push({ id: `body:${id}:angle`, group: g, label: '初始角度 θ', unit: 'rad', get: s => body(s, id).angle, set: (s, v) => { body(s, id).angle = v } })
    out.push({ id: `body:${id}:mu`, group: g, label: '摩擦因数 μs = μk', unit: '', min: 0, get: s => body(s, id).material.muK, set: (s, v) => { const m = body(s, id).material; m.muS = v; m.muK = v } })
    out.push({ id: `body:${id}:muS`, group: g, label: '静摩擦因数 μs', unit: '', min: 0, get: s => body(s, id).material.muS, set: (s, v) => { body(s, id).material.muS = v } })
    out.push({ id: `body:${id}:muK`, group: g, label: '动摩擦因数 μk', unit: '', min: 0, get: s => body(s, id).material.muK, set: (s, v) => { body(s, id).material.muK = v } })
    out.push({ id: `body:${id}:e`, group: g, label: '恢复系数 e', unit: '', min: 0, max: 1, get: s => body(s, id).material.restitution, set: (s, v) => { body(s, id).material.restitution = v } })
    if (b0.kind === 'static' && (b0.role === 'conveyor' || b0.beltSpeed !== 0)) out.push({ id: `body:${id}:belt`, group: g, label: '传送带速度 u', unit: 'm/s', get: s => body(s, id).beltSpeed, set: (s, v) => { body(s, id).beltSpeed = v } })
  }
  scene.contactPairs.forEach((p0, i) => {
    const name = (bid: string) => scene.bodies.find(b => b.id === bid)?.name ?? bid
    const g = `接触对：${name(p0.a)}–${name(p0.b)}`
    const pair = (s: Scene) => { const p = s.contactPairs[i]; if (!p) throw new Error('接触对不存在'); return p }
    out.push({ id: `pair:${p0.a}|${p0.b}:mu`, group: g, label: '摩擦因数 μs = μk', unit: '', min: 0, get: s => pair(s).muK, set: (s, v) => { const p = pair(s); p.muS = v; p.muK = v } })
    out.push({ id: `pair:${p0.a}|${p0.b}:muS`, group: g, label: '静摩擦因数 μs', unit: '', min: 0, get: s => pair(s).muS, set: (s, v) => { pair(s).muS = v } })
    out.push({ id: `pair:${p0.a}|${p0.b}:muK`, group: g, label: '动摩擦因数 μk', unit: '', min: 0, get: s => pair(s).muK, set: (s, v) => { pair(s).muK = v } })
    out.push({ id: `pair:${p0.a}|${p0.b}:e`, group: g, label: '恢复系数 e', unit: '', min: 0, max: 1, get: s => pair(s).restitution, set: (s, v) => { pair(s).restitution = v } })
  })
  for (const c0 of scene.connectors) {
    const id = c0.id
    const conn = (s: Scene) => { const c = s.connectors.find(x => x.id === id); if (!c) throw new Error(`连接件 ${id} 不存在`); return c }
    const g = `连接件：${c0.name}`
    if (c0.type === 'spring') {
      out.push({ id: `spring:${id}:k`, group: g, label: '劲度系数 k', unit: 'N/m', min: 1e-9, get: s => (conn(s) as typeof c0).stiffness, set: (s, v) => { (conn(s) as typeof c0).stiffness = v } })
      out.push({ id: `spring:${id}:c`, group: g, label: '阻尼系数 c', unit: 'N·s/m', min: 0, get: s => (conn(s) as typeof c0).damping, set: (s, v) => { (conn(s) as typeof c0).damping = v } })
      if (c0.restLength !== null) out.push({ id: `spring:${id}:L0`, group: g, label: '原长 L₀', unit: 'm', min: 0, get: s => (conn(s) as typeof c0).restLength ?? 0, set: (s, v) => { (conn(s) as typeof c0).restLength = v } })
    } else if ((c0.type === 'rope' || c0.type === 'rod') && c0.length !== null) {
      out.push({ id: `${c0.type}:${id}:L`, group: g, label: c0.type === 'rope' ? '绳长 L' : '杆长 L', unit: 'm', min: 1e-6, get: s => (conn(s) as typeof c0).length ?? 0, set: (s, v) => { (conn(s) as typeof c0).length = v } })
    } else if (c0.type === 'force' && !c0.expr) {
      out.push({ id: `force:${id}:fx`, group: g, label: '力 Fₓ', unit: 'N', get: s => (conn(s) as typeof c0).force.x, set: (s, v) => { (conn(s) as typeof c0).force.x = v } })
      out.push({ id: `force:${id}:fy`, group: g, label: '力 F_y', unit: 'N', get: s => (conn(s) as typeof c0).force.y, set: (s, v) => { (conn(s) as typeof c0).force.y = v } })
    }
  }
  out.push({
    id: 'gravity:g', group: '场景', label: '重力加速度 g（方向不变）', unit: 'm/s²', min: 0,
    get: s => Math.hypot(s.settings.gravity.x, s.settings.gravity.y),
    set: (s, v) => {
      const g = s.settings.gravity, m = Math.hypot(g.x, g.y)
      s.settings.gravity = m > 0 ? { x: g.x / m * v, y: g.y / m * v } : { x: 0, y: -v }
    }
  })
  return out
}

/** Evenly spaced values from a to b; n is clamped to 1 … MAX_SWEEP_POINTS (n = 1: just a). */
export function linspace(a: number, b: number, n: number): number[] {
  const k = Math.max(1, Math.min(MAX_SWEEP_POINTS, Math.round(n)))
  if (k === 1) return [a]
  // Rounded to 12 significant digits: 0.45, not 0.44999999999999996
  return Array.from({ length: k }, (_, i) => (i === k - 1 ? b : Number((a + (b - a) * (i / (k - 1))).toPrecision(12))))
}

/** Scene with the parameter set (a validated copy; the original is not touched). */
export function sceneWith(base: Scene, param: SweepParam, value: number): Scene {
  if (!Number.isFinite(value)) throw new Error('参数值不是有限数')
  if (param.min !== undefined && value < param.min - 1e-15) throw new Error(`参数值应 ≥ ${param.min}`)
  if (param.max !== undefined && value > param.max + 1e-15) throw new Error(`参数值应 ≤ ${param.max}`)
  const s = cloneScene(base)
  param.set(s, value)
  validateScene(s)
  return s
}

/** The result measured in each run of a sweep. */
export type SweepMeasure =
  | { kind: 'eventTime'; event: ChangeType; body?: string | null }
  | { kind: 'valueAt'; id: string; t: number }
  | { kind: 'max' | 'min' | 'final'; id: string }

/** SI unit of a measure (needs the quantity catalogue of the scene). */
export function measureUnit(m: SweepMeasure, unitOf: (id: string) => string): string {
  return m.kind === 'eventTime' ? 's' : unitOf(m.id)
}

/**
 * The measured result of one run. Max / min / final are taken over the recorded frames (Δt grid); a value at a
 * time and event times are exact.
 */
export function measureRecording(rec: Recording, m: SweepMeasure): number | null {
  if (m.kind === 'eventTime') return firstEvent(rec, m.event, m.body)?.t ?? null
  if (!listQuantities(rec.system).some(q => q.id === m.id)) return null
  const tMax = (rec.frameCount - 1) * rec.dt
  if (m.kind === 'valueAt') {
    if (m.t < 0 || m.t > tMax + 1e-12) return null
    const v = evaluateQuantity(observeAt(rec, m.t), m.id)
    return Number.isFinite(v) ? v : null
  }
  if (m.kind === 'final') {
    const v = evaluateQuantity(makeContext(rec, rec.frameCount - 1), m.id)
    return Number.isFinite(v) ? v : null
  }
  let best: number | null = null
  for (let k = 0; k < rec.frameCount; k++) {
    const v = evaluateQuantity(makeContext(rec, k), m.id)
    if (!Number.isFinite(v)) continue
    if (best === null || (m.kind === 'max' ? v > best : v < best)) best = v
  }
  return best
}

/** One run of a sweep. */
export interface SweepPoint {
  /** Parameter value (SI). */
  value: number
  /** Measured result (SI) or null (no event, out of range, failed run). */
  result: number | null
  /** The run stopped at its time budget before the scene's duration. */
  incomplete: boolean
  /** User-facing error of the run. */
  error?: string
  hash?: string
}

/** Runs one simulation; `done` resolves with null when cancelled. */
export type SweepRunner = (scene: Scene, onProgress: (fraction: number) => void) => { cancel(): void; done: Promise<Recording | null> }

/** Callbacks of runSweep. */
export interface SweepCallbacks {
  onPoint?: (p: SweepPoint, index: number) => void
  /** Overall progress 0…1. */
  onProgress?: (p: number) => void
  /** Polled before and during every run. */
  cancelled: () => boolean
}

/** What to sweep and what to measure. */
export interface SweepSpec { param: SweepParam; values: number[]; measure: SweepMeasure }

const yieldToUi = () => new Promise<void>(r => setTimeout(r, 0))

/** Run the sweep. Resolves with the points computed so far (all of them unless cancelled). */
export async function runSweep(base: Scene, spec: SweepSpec, runner: SweepRunner, cb: SweepCallbacks): Promise<SweepPoint[]> {
  const out: SweepPoint[] = []
  const n = spec.values.length
  for (let i = 0; i < n; i++) {
    if (cb.cancelled()) break
    const value = spec.values[i]
    let point: SweepPoint
    try {
      const scene = sceneWith(base, spec.param, value)
      const handle = runner(scene, f => cb.onProgress?.((i + Math.max(0, Math.min(1, f))) / n))
      // Cancel the running simulation as soon as the sweep is cancelled
      const poll = setInterval(() => { if (cb.cancelled()) handle.cancel() }, 50)
      let rec: Recording | null
      try { rec = await handle.done } finally { clearInterval(poll) }
      if (!rec) break
      point = { value, result: measureRecording(rec, spec.measure), incomplete: !rec.completed, hash: rec.hash, error: rec.error ?? undefined }
    } catch (e) {
      point = { value, result: null, incomplete: false, error: (e as Error).message }
    }
    out.push(point)
    cb.onPoint?.(point, i)
    cb.onProgress?.((i + 1) / n)
    await yieldToUi()
  }
  return out
}
