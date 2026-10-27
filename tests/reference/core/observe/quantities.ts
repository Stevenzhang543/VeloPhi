/**
 * Observable quantities: everything the watch panel, the charts, the CSV export and the formula layer read.
 * Each quantity is computed from a recorded state and the mode solution of its segment — never from a
 * separate model — so what is shown is exactly what the solver produced.
 *
 * Quantity ids:
 *   - `<body>.x .y .angle .vx .vy .v .omega .ax .ay .a .alpha .ek .ep .px .py`: body kinematics;
 *   - `<body>.angle@pivot`: angle from the downward vertical about scene.extra.pivot;
 *   - `contact.<on>|<by>.N .f .fx .fy .Nx .Ny .vt`: contact forces on body <on> exerted by <by>;
 *   - `pair.<a>|<b>.slide .heat`: relative sliding distance and friction heat of a pair;
 *   - `<rope>.T .len`, `<spring>.F .x`, `<hinge>.F .Fx .Fy`, `<rod>.F`: connectors;
 *   - `<force>.Fx .Fy .F .P`: applied (constant or variable) force and its power;
 *   - `system.ek .ep .es .e .px .py .Lz@pivot`: system totals;
 *   - `ledger.frictionHeat .appliedWork .damping .beltWork .impactLoss .balance`: energy ledger;
 *   - `custom.<id>`: custom (expression) quantities of the scene (26.51, see observe/custom).
 */
import { tl } from '../../../../src/i18n'
import type { Pose } from '../solver/kinematics'
import { anchorState, computePoses, distanceKin, ropeKin } from '../solver/kinematics'
import type { Mode, ModeSolution, System } from '../solver/dynamics'
import { AUX_FIXED, energy, forceValue, solveMode } from '../solver/dynamics'
import type { Recording } from '../solver/simulation'
import { frameImpactLoss, frameSegment, frameState, ledgerAt } from '../solver/simulation'
import { pairKey } from '../solver/model'
import { atan2, hypot } from '../../../../src/core/math/dmath'
import type { CompiledCustom, CustomQuantityDef } from './custom'
import { compileCustom, customSymbol, evaluateCustom } from './custom'

/** Group of a quantity in the watch panel. */
export type QuantityGroup = '物体' | '接触' | '连接件' | '系统' | '能量账本' | '自定义'

/** Display name of a quantity group. */
export function groupLabel(g: QuantityGroup): string {
  switch (g) {
    case '物体': return tl('物体')
    case '接触': return tl('接触')
    case '连接件': return tl('连接件')
    case '系统': return tl('系统')
    case '能量账本': return tl('能量账本')
    case '自定义': return tl('自定义')
  }
}

/** A quantity that can be watched, charted and exported. */
export interface QuantityDef {
  id: string
  /** Display label. */
  label: string
  /** KaTeX symbol. */
  symbol: string
  /** SI unit (the key into units/units.ts). */
  unit: string
  group: QuantityGroup
  /** Owner name for display (body / connector name). */
  owner: string
}

/** Everything needed to evaluate quantities at one state. */
export interface ObservationContext {
  sys: System
  X: Float64Array
  mode: Mode
  sol: ModeSolution
  poses: Pose[]
  /** Cumulative impact loss (J). */
  impactLoss: number
  rec: Recording
  /** Time of the state (s), when known (custom quantities read it as t). */
  t?: number
}

/** Per-body quantities: key, label, KaTeX symbol, SI unit. */
const bodyQ: Array<[string, string, string, string]> = [
  ['x', '位置 x', 'x', 'm'], ['y', '位置 y', 'y', 'm'], ['angle', '角位置 θ', '\\theta', 'rad'],
  ['vx', '速度 vₓ', 'v_x', 'm/s'], ['vy', '速度 v_y', 'v_y', 'm/s'], ['v', '速率 |v|', '|v|', 'm/s'],
  ['omega', '角速度 ω', '\\omega', 'rad/s'],
  ['ax', '加速度 aₓ', 'a_x', 'm/s²'], ['ay', '加速度 a_y', 'a_y', 'm/s²'], ['a', '加速度大小 |a|', '|a|', 'm/s²'],
  ['alpha', '角加速度 β', '\\beta', 'rad/s²'],
  ['ek', '动能 Eₖ', 'E_k', 'J'], ['ep', '重力势能 Eₚ', 'E_p', 'J'],
  ['px', '动量 pₓ', 'p_x', 'kg·m/s'], ['py', '动量 p_y', 'p_y', 'kg·m/s'],
  // 26.54 (D87): power of the resultant force (the readouts of the reference follow the Rust listing)
  ['P', '合力的功率 P', 'P', 'W']
]

/** Every quantity available for a system, in display order (custom quantities last). */
export function listQuantities(sys: System): QuantityDef[] {
  const out = builtinQuantities(sys)
  for (const c of customQuantities(sys)) {
    if (!c.compiled) continue
    out.push({ id: `custom.${c.def.id}`, label: c.def.name, symbol: customSymbol(c.def.id), unit: c.compiled.unit, group: '自定义', owner: tl('自定义') })
  }
  return out
}

/** A custom quantity of a system's scene and its compiled form (null with the error when it does not compile). */
export interface CustomEntry { def: CustomQuantityDef; compiled: CompiledCustom | null; error: string | null }

const customCache = new WeakMap<System, CustomEntry[]>()

/** The scope in which custom expressions of a system are compiled. */
export function customScope(sys: System) {
  const scene = sys.model.scene
  return {
    units: new Map(builtinQuantities(sys).map(q => [q.id, q.unit])),
    owners: [...scene.bodies, ...scene.connectors, ...scene.pulleys].map(o => ({ id: o.id, name: o.name })),
    canonical: canonicalQuantityId
  }
}

/** Custom quantities of a system's scene, compiled once per system. */
export function customQuantities(sys: System): CustomEntry[] {
  const hit = customCache.get(sys)
  if (hit) return hit
  const defs = sys.model.scene.customQuantities ?? []
  const scope = defs.length ? customScope(sys) : null
  const out = defs.map(def => {
    try { return { def, compiled: compileCustom(def.expr, scope!), error: null } } catch (e) { return { def, compiled: null, error: (e as Error).message } }
  })
  customCache.set(sys, out)
  return out
}

/** The built-in quantities of a system, in display order. */
function builtinQuantities(sys: System): QuantityDef[] {
  const out: QuantityDef[] = []
  const model = sys.model
  const pivot = pivotOf(sys)
  for (const b of model.dynamic) {
    for (const [k, label, sym, unit] of bodyQ) {
      if ((k === 'angle' || k === 'omega' || k === 'alpha') && b.invInertia === 0) continue
      out.push({ id: `${b.id}.${k}`, label: tl(label), symbol: sym, unit, group: '物体', owner: b.name })
    }
    if (pivot) out.push({ id: `${b.id}.angle@pivot`, label: tl('摆角（相对竖直）'), symbol: '\\varphi', unit: 'rad', group: '物体', owner: b.name })
    // 26.51: air drag and gravitation on the body
    if (b.dragLin > 0 || b.dragQuad > 0) out.push({ id: `${b.id}.fd`, label: tl('空气阻力大小 f'), symbol: 'f_d', unit: 'N', group: '物体', owner: b.name })
    if (model.G > 0 && b.attract > 0 && model.attractors.length > 1) out.push({ id: `${b.id}.Fg`, label: tl('受到的引力大小'), symbol: 'F_g', unit: 'N', group: '物体', owner: b.name })
    // 26.55 (D92b): mechanical efficiency with lifting this body as the useful work (follows the Rust listing)
    const gv = model.settings.gravity
    if ((model.hasExpr || model.forces.length > 0 || model.motors.length > 0) && (gv.x !== 0 || gv.y !== 0)) {
      out.push({ id: `${b.id}.Wuse`, label: tl('有用功（提升该物体，自开始）'), symbol: 'W_u', unit: 'J', group: '物体', owner: b.name })
      out.push({ id: `${b.id}.eta`, label: tl('机械效率 η（有用功：提升该物体）'), symbol: '\\eta', unit: '', group: '物体', owner: b.name })
    }
  }
  for (const pair of sys.pairs) {
    for (const [on, by] of [[pair.X, pair.Y], [pair.Y, pair.X]]) {
      if (!on.dynamic) continue
      const id = `contact.${on.id}|${by.id}`
      const owner = `${by.name}→${on.name}`
      out.push({ id: `${id}.N`, label: tl('支持力（压力）N'), symbol: 'N', unit: 'N', group: '接触', owner })
      out.push({ id: `${id}.f`, label: tl('摩擦力大小 f'), symbol: 'f', unit: 'N', group: '接触', owner })
      out.push({ id: `${id}.fx`, label: tl('摩擦力 fₓ'), symbol: 'f_x', unit: 'N', group: '接触', owner })
      out.push({ id: `${id}.fy`, label: tl('摩擦力 f_y'), symbol: 'f_y', unit: 'N', group: '接触', owner })
      out.push({ id: `${id}.vt`, label: tl('相对滑动速度'), symbol: 'v_{\\text{rel}}', unit: 'm/s', group: '接触', owner })
    }
    // Canonical order (pairKey), the same as canonicalQuantityId: ids written as pair.b|a are found too
    const pk = `pair.${pairKey(pair.X.id, pair.Y.id)}`
    out.push({ id: `${pk}.slide`, label: tl('相对滑动路程 Δs'), symbol: '\\Delta s', unit: 'm', group: '接触', owner: `${pair.X.name}–${pair.Y.name}` })
    out.push({ id: `${pk}.heat`, label: tl('摩擦生热 Q'), symbol: 'Q', unit: 'J', group: '接触', owner: `${pair.X.name}–${pair.Y.name}` })
  }
  for (const r of model.ropes) {
    out.push({ id: `${r.id}.T`, label: tl('绳张力 T'), symbol: 'T', unit: 'N', group: '连接件', owner: r.name })
    out.push({ id: `${r.id}.len`, label: tl('绳路径长度'), symbol: '\\ell', unit: 'm', group: '连接件', owner: r.name })
  }
  for (const s of model.springs) {
    if (s.damper) { out.push({ id: `${s.id}.F`, label: tl('阻尼力（拉为正）F'), symbol: 'F', unit: 'N', group: '连接件', owner: s.name }); continue }
    out.push({ id: `${s.id}.F`, label: tl('弹力（拉为正）F'), symbol: 'F', unit: 'N', group: '连接件', owner: s.name })
    out.push({ id: `${s.id}.x`, label: tl('形变量 x'), symbol: 'x', unit: 'm', group: '连接件', owner: s.name })
  }
  // 26.51 connectors: pin forces of welds and motors, the torque and power of motors, the normal force of sliders
  for (const w of model.welds) {
    out.push({ id: `${w.id}.F`, label: tl('焊接点作用力大小'), symbol: 'F', unit: 'N', group: '连接件', owner: w.name })
    out.push({ id: `${w.id}.M`, label: tl('焊接点力矩'), symbol: 'M', unit: 'N·m', group: '连接件', owner: w.name })
  }
  for (const m of model.motors) {
    out.push({ id: `${m.id}.M`, label: tl('马达力矩 M'), symbol: 'M', unit: 'N·m', group: '连接件', owner: m.name })
    out.push({ id: `${m.id}.P`, label: tl('马达功率 P'), symbol: 'P', unit: 'W', group: '连接件', owner: m.name })
    out.push({ id: `${m.id}.w`, label: tl('相对角速度 ω'), symbol: '\\omega', unit: 'rad/s', group: '连接件', owner: m.name })
    out.push({ id: `${m.id}.F`, label: tl('转轴作用力大小'), symbol: 'F', unit: 'N', group: '连接件', owner: m.name })
  }
  for (const sl of model.sliders) {
    out.push({ id: `${sl.id}.N`, label: tl('滑轨支持力 N'), symbol: 'N', unit: 'N', group: '连接件', owner: sl.name })
    out.push({ id: `${sl.id}.s`, label: tl('沿滑轨的位移 s'), symbol: 's', unit: 'm', group: '连接件', owner: sl.name })
  }
  for (const g of model.gears) out.push({ id: `${g.id}.M`, label: tl('齿轮传递的力矩'), symbol: 'M', unit: 'N·m', group: '连接件', owner: g.name })
  for (const h of model.hinges) {
    out.push({ id: `${h.id}.F`, label: tl('铰链力大小'), symbol: 'F', unit: 'N', group: '连接件', owner: h.name })
    out.push({ id: `${h.id}.Fx`, label: tl('铰链力 Fₓ'), symbol: 'F_x', unit: 'N', group: '连接件', owner: h.name })
    out.push({ id: `${h.id}.Fy`, label: tl('铰链力 F_y'), symbol: 'F_y', unit: 'N', group: '连接件', owner: h.name })
  }
  for (const r of model.rods) out.push({ id: `${r.id}.F`, label: tl('杆的拉力（拉为正）'), symbol: 'F', unit: 'N', group: '连接件', owner: r.name })
  for (const f of model.forces) {
    if (!f.a.body?.dynamic) continue
    out.push({ id: `${f.id}.Fx`, label: tl('外力 Fₓ'), symbol: 'F_x', unit: 'N', group: '连接件', owner: f.name })
    out.push({ id: `${f.id}.Fy`, label: tl('外力 F_y'), symbol: 'F_y', unit: 'N', group: '连接件', owner: f.name })
    out.push({ id: `${f.id}.F`, label: tl('外力大小 |F|'), symbol: '|F|', unit: 'N', group: '连接件', owner: f.name })
    out.push({ id: `${f.id}.P`, label: tl('外力的功率 P'), symbol: 'P', unit: 'W', group: '连接件', owner: f.name })
  }
  const sysQ: Array<[string, string, string, string]> = [
    ['system.ek', tl('总动能'), 'E_k', 'J'], ['system.ep', tl('总重力势能'), 'E_p', 'J'], ['system.es', tl('弹性势能'), 'E_s', 'J'],
    ['system.e', tl('机械能'), 'E', 'J'], ['system.px', tl('总动量 pₓ'), 'p_x', 'kg·m/s'], ['system.py', tl('总动量 p_y'), 'p_y', 'kg·m/s']
  ]
  // 26.54 (D87): angular momentum about the origin, the Lagrangian and the Hamiltonian
  sysQ.push(['system.Lz', tl('对原点的角动量 L'), 'L_z', 'kg·m²/s'], ['system.lagr', tl('拉格朗日量 L = T − V'), '\\mathcal{L}', 'J'], ['system.ham', tl('哈密顿量 H = T + V'), 'H', 'J'])
  for (const [id, label, sym, unit] of sysQ) out.push({ id, label, symbol: sym, unit, group: '系统', owner: tl('系统') })
  if (pivot) out.push({ id: 'system.Lz@pivot', label: tl('对转轴角动量'), symbol: 'L', unit: 'kg·m²/s', group: '系统', owner: tl('系统') })
  const led: Array<[string, string, string]> = [
    ['ledger.frictionHeat', tl('摩擦生热（累计）'), 'Q_f'], ['ledger.appliedWork', tl('外力做功（累计）'), 'W_F'],
    ['ledger.damping', tl('阻尼耗散（累计）'), 'Q_d'], ['ledger.beltWork', tl('电机与传送带做功（累计）'), 'W_{\\mathrm{belt}}'],
    ['ledger.impactLoss', tl('碰撞损失动能（累计）'), '\\Delta E_{\\mathrm{coll}}'], ['ledger.balance', tl('能量账本合计（应守恒）'), 'E_{\\Sigma}']
  ]
  for (const [id, label, sym] of led) out.push({ id, label, symbol: sym, unit: 'J', group: '能量账本', owner: tl('系统') })
  return out
}

/**
 * The listed form of a quantity id. A pair is unordered, so `pair.a|b.x` and `pair.b|a.x` are the same quantity;
 * listQuantities names it in pairKey order and every lookup by id should go through this function (scene files
 * and templates may use either order). Other ids are returned unchanged.
 */
export function canonicalQuantityId(id: string): string {
  if (!id.startsWith('pair.')) return id
  const dot = id.lastIndexOf('.')
  if (dot <= 5) return id
  const bodies = id.slice(5, dot).split('|')
  if (bodies.length !== 2) return id
  return `pair.${pairKey(bodies[0], bodies[1])}${id.slice(dot)}`
}

/** Pivot of the @pivot quantities (scene.extra.pivot), or null. */
export function pivotOf(sys: System): { x: number; y: number } | null {
  const extra = sys.model.scene.extra as { pivot?: { x: number; y: number } } | undefined
  if (extra?.pivot && Number.isFinite(extra.pivot.x) && Number.isFinite(extra.pivot.y)) return extra.pivot
  return null
}

/** Force vectors of a contact unit on body `on` by body `by` (zero when not in contact). */
export function contactForces(ctx: ObservationContext, onId: string, byId: string): { Nx: number; Ny: number; N: number; fx: number; fy: number; f: number; vt: number; inContact: boolean; status: string } {
  const key = pairKey(onId, byId)
  const units = ctx.sol.units
  const mode = ctx.mode
  for (let ui = 0; ui < mode.units.length; ui++) {
    const u = mode.units[ui]
    if (u.pair.key !== key || u.points.length === 0) continue
    const st = units[ui]
    let Nx = 0, Ny = 0
    u.points.forEach((p, pi) => {
      const k = st.pointKin[pi], l = st.pointLambda[pi]
      const sign = p.A.body.id === onId ? 1 : -1
      Nx += sign * l * k.nx; Ny += sign * l * k.ny
    })
    const refSign = u.ref.A.body.id === onId ? 1 : -1
    const fx = refSign * st.tangent * st.refKin.tx, fy = refSign * st.tangent * st.refKin.ty
    const status = u.friction === 'slide' ? tl('滑动') : u.friction === 'stick' ? tl('相对静止') : tl('光滑接触')
    return { Nx, Ny, N: st.normal, fx, fy, f: Math.abs(st.tangent), vt: refSign * st.vt, inContact: true, status }
  }
  return { Nx: 0, Ny: 0, N: 0, fx: 0, fy: 0, f: 0, vt: Number.NaN, inContact: false, status: tl('未接触') }
}

/** Observation context of recorded frame k. */
export function makeContext(rec: Recording, k: number): ObservationContext {
  const X = frameState(rec, k)
  const seg = rec.segments[frameSegment(rec, k)]
  return makeContextFor(rec, X, seg.mode, frameImpactLoss(rec, k), k * rec.dt)
}

/** Observation context of any state in a given mode (event pre/post states, exactStateAt); `t`: its time, when known. */
export function makeContextFor(rec: Recording, X: Float64Array, mode: Mode, impactLoss: number, t?: number): ObservationContext {
  const sol = solveMode(rec.system, X, mode, computePoses(rec.system.model, X))
  return { sys: rec.system, X, mode, sol, poses: sol.poses, impactLoss, rec, ...(t !== undefined ? { t } : {}) }
}

/** Value of quantity `id` in a context; NaN for unknown ids. */
export function evaluateQuantity(ctx: ObservationContext, id: string): number {
  const sys = ctx.sys, model = sys.model, n = sys.n, X = ctx.X
  const dot = id.lastIndexOf('.')
  const head = id.slice(0, dot), q = id.slice(dot + 1)
  if (head === 'custom') {
    const c = customQuantities(sys).find(e => e.def.id === q)?.compiled
    if (!c) return Number.NaN
    return evaluateCustom(c, ref => evaluateQuantity(ctx, ref), g => {
      if (g === 't') return ctx.t ?? (sys.timeSlot >= 0 ? X[sys.timeSlot] : Number.NaN)
      if (g === 'g') return hypot(model.settings.gravity.x, model.settings.gravity.y)
      return evaluateQuantity(ctx, ({ E: 'system.e', Ek: 'system.ek', Ep: 'system.ep', Es: 'system.es', Px: 'system.px', Py: 'system.py' } as Record<string, string>)[g] ?? '')
    })
  }
  if (head.startsWith('contact.')) {
    const [on, by] = head.slice(8).split('|')
    const c = contactForces(ctx, on, by)
    switch (q) {
      case 'N': return c.N
      case 'Nx': return c.Nx
      case 'Ny': return c.Ny
      case 'f': return c.f
      case 'fx': return c.fx
      case 'fy': return c.fy
      case 'vt': return c.vt
    }
    return Number.NaN
  }
  if (head.startsWith('pair.')) {
    const [a, b] = head.slice(5).split('|')
    const pair = sys.pairByKey.get(pairKey(a, b))
    if (!pair) return Number.NaN
    const base = sys.auxBase + AUX_FIXED + 2 * pair.index
    return q === 'slide' ? X[base] : q === 'heat' ? X[base + 1] : Number.NaN
  }
  if (head === 'system') {
    const e = energy(sys, X, ctx.poses)
    let px = 0, py = 0
    for (const b of model.dynamic) { px += b.mass * X[3 * n + 3 * b.index]; py += b.mass * X[3 * n + 3 * b.index + 1] }
    switch (q) {
      case 'ek': return e.kinetic
      case 'ep': return e.gravity
      case 'es': return e.spring
      case 'e': return e.total
      case 'px': return px
      case 'py': return py
      // 26.54 (D87)
      case 'Lz': {
        let L = 0
        for (const b of model.dynamic) {
          const i = b.index
          const vx = X[3 * n + 3 * i], vy = X[3 * n + 3 * i + 1]
          L += b.mass * (X[3 * i] * vy - X[3 * i + 1] * vx) + (b.invInertia > 0 ? b.inertia * X[3 * n + 3 * i + 2] : 0)
        }
        return L
      }
      case 'lagr': return e.kinetic - (e.total - e.kinetic)
      case 'ham': return e.total
      case 'Lz@pivot': {
        const pv = pivotOf(sys)
        if (!pv) return Number.NaN
        let L = 0
        for (const b of model.dynamic) {
          const i = b.index
          const rx = X[3 * i] - pv.x, ry = X[3 * i + 1] - pv.y
          const vx = X[3 * n + 3 * i], vy = X[3 * n + 3 * i + 1]
          L += b.mass * (rx * vy - ry * vx) + (b.invInertia > 0 ? b.inertia * X[3 * n + 3 * i + 2] : 0)
        }
        return L
      }
    }
    return Number.NaN
  }
  if (head === 'ledger') {
    const l = ledgerAt(ctx.rec, X, ctx.impactLoss)
    return (l as unknown as Record<string, number>)[q] ?? Number.NaN
  }
  const body = model.byId.get(head)
  if (body && body.dynamic) {
    const i = body.index
    const vx = X[3 * n + 3 * i], vy = X[3 * n + 3 * i + 1], w = X[3 * n + 3 * i + 2]
    const ax = ctx.sol.acc[3 * i], ay = ctx.sol.acc[3 * i + 1]
    const g = model.settings.gravity
    switch (q) {
      case 'x': return X[3 * i]
      case 'y': return X[3 * i + 1]
      case 'angle': return X[3 * i + 2]
      case 'vx': return vx
      case 'vy': return vy
      case 'v': return Math.sqrt(vx * vx + vy * vy)
      case 'omega': return w
      case 'ax': return ax
      case 'ay': return ay
      case 'a': return Math.sqrt(ax * ax + ay * ay)
      case 'alpha': return ctx.sol.acc[3 * i + 2]
      case 'ek': return 0.5 * body.mass * (vx * vx + vy * vy) + (body.invInertia > 0 ? 0.5 * body.inertia * w * w : 0)
      case 'ep': return -body.mass * (g.x * X[3 * i] + g.y * (X[3 * i + 1] - model.settings.energyZeroY))
      case 'px': return body.mass * vx
      case 'py': return body.mass * vy
      case 'P': return body.mass * (ax * vx + ay * vy) + (body.invInertia > 0 ? body.inertia * ctx.sol.acc[3 * i + 2] * w : 0)
      case 'fd': { const sp = Math.sqrt(vx * vx + vy * vy); return (body.dragLin + body.dragQuad * sp) * sp }
      case 'Fg': {
        let fx = 0, fy = 0
        const p = ctx.poses[body.global]
        for (const o of model.attractors) {
          if (o === body) continue
          const po = o.dynamic ? ctx.poses[o.global] : o.gravPos
          const dx = po.x - p.x, dy = po.y - p.y, d2 = dx * dx + dy * dy
          if (!(d2 > 0)) continue
          const d = Math.sqrt(d2), R = body.bound + o.bound, f = d >= R ? model.G * body.attract * o.attract / d2 : model.G * body.attract * o.attract * d / (R * R * R)
          fx += f * dx / d; fy += f * dy / d
        }
        return Math.sqrt(fx * fx + fy * fy)
      }
      case 'angle@pivot': {
        const pv = pivotOf(sys)
        if (!pv) return Number.NaN
        return atan2(X[3 * i] - pv.x, pv.y - X[3 * i + 1])
      }
      // 26.55 (D92b): the same operations as the Rust core
      case 'Wuse': case 'eta': {
        const wuse = -body.mass * (g.x * (X[3 * i] - body.def.position.x) + g.y * (X[3 * i + 1] - body.def.position.y))
        if (q === 'Wuse') return wuse
        const l = ledgerAt(ctx.rec, X, ctx.impactLoss)
        const s0 = model.settings.startLedger
        const w0 = s0 ? s0.appliedWork : 0, b0 = s0 ? s0.beltWork : 0
        const total = (l.appliedWork - w0) + (l.beltWork - b0)
        return Math.abs(total) > 1e-12 ? wuse / total : Number.NaN
      }
    }
    return Number.NaN
  }
  const rIdx = model.ropes.findIndex(r => r.id === head)
  if (rIdx >= 0) {
    if (q === 'T') return ctx.sol.ropeTension[rIdx]
    if (q === 'len') return ropeKin(ctx.poses, model.ropes[rIdx]).path.length
  }
  const sp = model.springs.find(s => s.id === head)
  if (sp) {
    const d = distanceKin(ctx.poses, sp.a, sp.b)
    const ext = d.value - sp.restLength
    if (q === 'x') return ext
    if (q === 'F') {
      const pa = anchorState(ctx.poses, sp.a), pb = anchorState(ctx.poses, sp.b)
      const vrel = d.ux * (pa.vx - pb.vx) + d.uy * (pa.vy - pb.vy)
      return sp.stiffness * ext + sp.cubic * ext * ext * ext + sp.damping * vrel
    }
  }
  // 26.51 connectors: constraint forces from the rows of the mode solution
  const rowLambda = (kind: string, owner: number, sub: number) => {
    for (let k = 0; k < ctx.sol.rows.length; k++) { const r = ctx.sol.rows[k]; if (r.kind === kind && r.owner === owner && r.sub === sub) return ctx.sol.lambda[k] }
    return 0
  }
  const wIdx = model.welds.findIndex(w => w.id === head)
  if (wIdx >= 0) {
    if (q === 'F') return hypot(rowLambda('weld', wIdx, 0), rowLambda('weld', wIdx, 1))
    if (q === 'M') return rowLambda('weld', wIdx, 2)
  }
  const mIdx = model.motors.findIndex(m => m.id === head)
  if (mIdx >= 0) {
    const mo = model.motors[mIdx]
    const wa = mo.a.body ? ctx.poses[mo.a.body.global].w : 0, wb = mo.b.body ? ctx.poses[mo.b.body.global].w : 0
    const M = mo.mode === 'torque' ? mo.torque : rowLambda('drive', mIdx, 2)
    if (q === 'M') return M
    if (q === 'P') return M * (wb - wa)
    if (q === 'w') return wb - wa
    if (q === 'F') return hypot(rowLambda('motor', mIdx, 0), rowLambda('motor', mIdx, 1))
  }
  const sIdx = model.sliders.findIndex(sl => sl.id === head)
  if (sIdx >= 0) {
    const sl = model.sliders[sIdx]
    if (q === 'N') return Math.abs(rowLambda('slider', sIdx, 0))
    if (q === 's') {
      const pa = anchorState(ctx.poses, sl.a), pb = anchorState(ctx.poses, sl.b)
      const A = sl.a.body && sl.a.body.dynamic ? ctx.poses[sl.a.body.global] : null
      const ax = A ? A.c * sl.axis.x - A.s * sl.axis.y : sl.axis.x, ay = A ? A.s * sl.axis.x + A.c * sl.axis.y : sl.axis.y
      return ax * (pb.px - pa.px) + ay * (pb.py - pa.py)
    }
  }
  const gIdx = model.gears.findIndex(g => g.id === head)
  if (gIdx >= 0 && q === 'M') return rowLambda('gear', gIdx, 0)
  const hIdx = model.hinges.findIndex(h => h.id === head)
  if (hIdx >= 0) {
    let Fx = 0, Fy = 0
    ctx.sol.rows.forEach((r, k) => {
      if (r.kind !== 'hinge' || r.owner !== hIdx) return
      if (r.sub === 0) Fx = ctx.sol.lambda[k]; else Fy = ctx.sol.lambda[k]
    })
    // λ of the x/y rows is the force the hinge exerts on body a
    if (q === 'Fx') return Fx
    if (q === 'Fy') return Fy
    if (q === 'F') return Math.sqrt(Fx * Fx + Fy * Fy)
  }
  const rodIdx = model.rods.findIndex(r => r.id === head)
  if (rodIdx >= 0 && q === 'F') {
    let F = 0
    ctx.sol.rows.forEach((r, k) => { if (r.kind === 'rod' && r.owner === rodIdx) F = -ctx.sol.lambda[k] })
    return F
  }
  const fIdx = model.forces.findIndex(f => f.id === head)
  if (fIdx >= 0 && model.forces[fIdx].a.body?.dynamic) {
    // Variable forces with the branches of the current segment, exactly as the solver applied them
    const F = forceValue(sys, fIdx, X, ctx.mode.sw ?? null)
    switch (q) {
      case 'Fx': return F.x
      case 'Fy': return F.y
      case 'F': return Math.sqrt(F.x * F.x + F.y * F.y)
      case 'P': { const p = anchorState(ctx.poses, model.forces[fIdx].a); return F.x * p.vx + F.y * p.vy }
    }
  }
  return Number.NaN
}

/** All frames of a set of quantities (one solve per frame). */
export function quantitySeries(rec: Recording, ids: string[], from = 0, to = rec.frameCount - 1, stride = 1): { t: Float64Array; values: Float64Array[] } {
  const count = Math.floor((to - from) / stride) + 1
  const t = new Float64Array(count)
  const values = ids.map(() => new Float64Array(count))
  for (let c = 0; c < count; c++) {
    const k = from + c * stride
    const ctx = makeContext(rec, k)
    t[c] = k * rec.dt
    ids.forEach((id, j) => { values[j][c] = evaluateQuantity(ctx, id) })
  }
  return { t, values }
}

/** SI unit of a quantity id ('' when unknown). */
export function unitOf(sys: System, id: string): string {
  const key = canonicalQuantityId(id)
  return listQuantities(sys).find(q => q.id === key)?.unit ?? ''
}

