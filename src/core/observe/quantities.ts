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
 *   - `ledger.frictionHeat .appliedWork .damping .beltWork .impactLoss .balance`: energy ledger.
 */
import type { Pose } from '../solver/kinematics'
import { anchorState, computePoses, distanceKin, ropeKin } from '../solver/kinematics'
import type { Mode, ModeSolution, System } from '../solver/dynamics'
import { AUX_FIXED, energy, forceValue, solveMode } from '../solver/dynamics'
import type { Recording } from '../solver/simulation'
import { frameState, ledgerAt } from '../solver/simulation'
import { pairKey } from '../solver/model'
import { atan2 } from '../math/dmath'

/** Group of a quantity in the watch panel. */
export type QuantityGroup = '物体' | '接触' | '连接件' | '系统' | '能量账本'

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
}

/** Per-body quantities: key, label, KaTeX symbol, SI unit. */
const bodyQ: Array<[string, string, string, string]> = [
  ['x', '位置 x', 'x', 'm'], ['y', '位置 y', 'y', 'm'], ['angle', '角位置 θ', '\\theta', 'rad'],
  ['vx', '速度 vₓ', 'v_x', 'm/s'], ['vy', '速度 v_y', 'v_y', 'm/s'], ['v', '速率 |v|', '|v|', 'm/s'],
  ['omega', '角速度 ω', '\\omega', 'rad/s'],
  ['ax', '加速度 aₓ', 'a_x', 'm/s²'], ['ay', '加速度 a_y', 'a_y', 'm/s²'], ['a', '加速度大小 |a|', '|a|', 'm/s²'],
  ['alpha', '角加速度 β', '\\beta', 'rad/s²'],
  ['ek', '动能 Eₖ', 'E_k', 'J'], ['ep', '重力势能 Eₚ', 'E_p', 'J'],
  ['px', '动量 pₓ', 'p_x', 'kg·m/s'], ['py', '动量 p_y', 'p_y', 'kg·m/s']
]

/** Every quantity available for a system, in display order. */
export function listQuantities(sys: System): QuantityDef[] {
  const out: QuantityDef[] = []
  const model = sys.model
  const pivot = pivotOf(sys)
  for (const b of model.dynamic) {
    for (const [k, label, sym, unit] of bodyQ) {
      if ((k === 'angle' || k === 'omega' || k === 'alpha') && b.invInertia === 0) continue
      out.push({ id: `${b.id}.${k}`, label, symbol: sym, unit, group: '物体', owner: b.name })
    }
    if (pivot) out.push({ id: `${b.id}.angle@pivot`, label: '摆角（相对竖直）', symbol: '\\varphi', unit: 'rad', group: '物体', owner: b.name })
  }
  for (const pair of sys.pairs) {
    for (const [on, by] of [[pair.X, pair.Y], [pair.Y, pair.X]]) {
      if (!on.dynamic) continue
      const id = `contact.${on.id}|${by.id}`
      const owner = `${by.name}→${on.name}`
      out.push({ id: `${id}.N`, label: '支持力（压力）N', symbol: 'N', unit: 'N', group: '接触', owner })
      out.push({ id: `${id}.f`, label: '摩擦力大小 f', symbol: 'f', unit: 'N', group: '接触', owner })
      out.push({ id: `${id}.fx`, label: '摩擦力 fₓ', symbol: 'f_x', unit: 'N', group: '接触', owner })
      out.push({ id: `${id}.fy`, label: '摩擦力 f_y', symbol: 'f_y', unit: 'N', group: '接触', owner })
      out.push({ id: `${id}.vt`, label: '相对滑动速度', symbol: 'v_{\\text{rel}}', unit: 'm/s', group: '接触', owner })
    }
    // Canonical order (pairKey), the same as canonicalQuantityId: ids written as pair.b|a are found too
    const pk = `pair.${pairKey(pair.X.id, pair.Y.id)}`
    out.push({ id: `${pk}.slide`, label: '相对滑动路程 Δs', symbol: '\\Delta s', unit: 'm', group: '接触', owner: `${pair.X.name}–${pair.Y.name}` })
    out.push({ id: `${pk}.heat`, label: '摩擦生热 Q', symbol: 'Q', unit: 'J', group: '接触', owner: `${pair.X.name}–${pair.Y.name}` })
  }
  for (const r of model.ropes) {
    out.push({ id: `${r.id}.T`, label: '绳张力 T', symbol: 'T', unit: 'N', group: '连接件', owner: r.name })
    out.push({ id: `${r.id}.len`, label: '绳路径长度', symbol: '\\ell', unit: 'm', group: '连接件', owner: r.name })
  }
  for (const s of model.springs) {
    out.push({ id: `${s.id}.F`, label: '弹力（拉为正）F', symbol: 'F', unit: 'N', group: '连接件', owner: s.name })
    out.push({ id: `${s.id}.x`, label: '形变量 x', symbol: 'x', unit: 'm', group: '连接件', owner: s.name })
  }
  for (const h of model.hinges) {
    out.push({ id: `${h.id}.F`, label: '铰链力大小', symbol: 'F', unit: 'N', group: '连接件', owner: h.name })
    out.push({ id: `${h.id}.Fx`, label: '铰链力 Fₓ', symbol: 'F_x', unit: 'N', group: '连接件', owner: h.name })
    out.push({ id: `${h.id}.Fy`, label: '铰链力 F_y', symbol: 'F_y', unit: 'N', group: '连接件', owner: h.name })
  }
  for (const r of model.rods) out.push({ id: `${r.id}.F`, label: '杆的拉力（拉为正）', symbol: 'F', unit: 'N', group: '连接件', owner: r.name })
  for (const f of model.forces) {
    if (!f.a.body?.dynamic) continue
    out.push({ id: `${f.id}.Fx`, label: '外力 Fₓ', symbol: 'F_x', unit: 'N', group: '连接件', owner: f.name })
    out.push({ id: `${f.id}.Fy`, label: '外力 F_y', symbol: 'F_y', unit: 'N', group: '连接件', owner: f.name })
    out.push({ id: `${f.id}.F`, label: '外力大小 |F|', symbol: '|F|', unit: 'N', group: '连接件', owner: f.name })
    out.push({ id: `${f.id}.P`, label: '外力的功率 P', symbol: 'P', unit: 'W', group: '连接件', owner: f.name })
  }
  const sysQ: Array<[string, string, string, string]> = [
    ['system.ek', '总动能', 'E_k', 'J'], ['system.ep', '总重力势能', 'E_p', 'J'], ['system.es', '弹性势能', 'E_s', 'J'],
    ['system.e', '机械能', 'E', 'J'], ['system.px', '总动量 pₓ', 'p_x', 'kg·m/s'], ['system.py', '总动量 p_y', 'p_y', 'kg·m/s']
  ]
  for (const [id, label, sym, unit] of sysQ) out.push({ id, label, symbol: sym, unit, group: '系统', owner: '系统' })
  if (pivot) out.push({ id: 'system.Lz@pivot', label: '对转轴角动量', symbol: 'L', unit: 'kg·m²/s', group: '系统', owner: '系统' })
  const led: Array<[string, string, string]> = [
    ['ledger.frictionHeat', '摩擦生热（累计）', 'Q_f'], ['ledger.appliedWork', '外力做功（累计）', 'W_F'],
    ['ledger.damping', '阻尼耗散（累计）', 'Q_d'], ['ledger.beltWork', '传送带电机做功（累计）', 'W_{\\text{带}}'],
    ['ledger.impactLoss', '碰撞损失动能（累计）', '\\Delta E_{\\text{碰}}'], ['ledger.balance', '能量账本合计（应守恒）', 'E_{\\Sigma}']
  ]
  for (const [id, label, sym] of led) out.push({ id, label, symbol: sym, unit: 'J', group: '能量账本', owner: '系统' })
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
    const status = u.friction === 'slide' ? '滑动' : u.friction === 'stick' ? '相对静止' : '光滑接触'
    return { Nx, Ny, N: st.normal, fx, fy, f: Math.abs(st.tangent), vt: refSign * st.vt, inContact: true, status }
  }
  return { Nx: 0, Ny: 0, N: 0, fx: 0, fy: 0, f: 0, vt: Number.NaN, inContact: false, status: '未接触' }
}

/** Observation context of recorded frame k. */
export function makeContext(rec: Recording, k: number): ObservationContext {
  const X = frameState(rec, k)
  const seg = rec.segments[rec.frameSegment[k]]
  return makeContextFor(rec, X, seg.mode, rec.impactLoss[k])
}

/** Observation context of any state in a given mode (event pre/post states, exactStateAt). */
export function makeContextFor(rec: Recording, X: Float64Array, mode: Mode, impactLoss: number): ObservationContext {
  const sol = solveMode(rec.system, X, mode, computePoses(rec.system.model, X))
  return { sys: rec.system, X, mode, sol, poses: sol.poses, impactLoss, rec }
}

/** Value of quantity `id` in a context; NaN for unknown ids. */
export function evaluateQuantity(ctx: ObservationContext, id: string): number {
  const sys = ctx.sys, model = sys.model, n = sys.n, X = ctx.X
  const dot = id.lastIndexOf('.')
  const head = id.slice(0, dot), q = id.slice(dot + 1)
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
      case 'angle@pivot': {
        const pv = pivotOf(sys)
        if (!pv) return Number.NaN
        return atan2(X[3 * i] - pv.x, pv.y - X[3 * i + 1])
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
      return sp.stiffness * ext + sp.damping * vrel
    }
  }
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

