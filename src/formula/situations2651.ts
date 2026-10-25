/**
 * Recognizers of 26.51 (manual 26.51, D44, D50, D51): the situations behind the graded formula library —
 * uniform motion and a block pulled by a constant force (lower and upper secondary), a lever in balance, uniform
 * circular motion, orbits, falls with air drag, damped oscillation, a disc turned by a torque motor and meshing
 * gears. Like situations.ts they only read the recording.
 */
import { tl } from '../i18n'
import type { Recording } from '../core/solver/simulation'
import { exactStateAt } from '../core/solver/simulation'
import { AUX_WORK } from '../core/solver/dynamics'
import type { BodyModel, Model } from '../core/solver/model'
import { computePoses } from '../core/solver/kinematics'
import { atan2 } from '../core/math/dmath'
import type { Condition, Situation } from './situations'
import { M, V, anchorWorld, attached, bodyVel, closedUnits, cond, noConnectors, observeAt, otherBody, rodForce, runs, singleLink, sq, touchingUnits } from './situations'
import { crossings } from './measure'

/** All recognizers of 26.51, in a stable order. */
export function situations2651(rec: Recording, out: Situation[]) {
  uniformSituations(rec, out)
  constForceSituations(rec, out)
  leverSituations(rec, out)
  circleSituations(rec, out)
  orbitSituations(rec, out)
  dragSituations(rec, out)
  dampedSituations(rec, out)
  spinSituations(rec, out)
  gearSituations(rec, out)
}

const zeroGravity = (model: Model) => model.settings.gravity.x === 0 && model.settings.gravity.y === 0
const verticalG = (model: Model) => {
  const g = model.settings.gravity
  return { g: Math.sqrt(g.x * g.x + g.y * g.y), vertical: g.x === 0 && g.y < 0 }
}
/** Connectors of 26.51 attached to a body, by kind. */
function attached2651(model: Model, id: string) {
  const on = (a: { body: BodyModel | null }) => a.body?.id === id
  return {
    welds: model.welds.map((w, i) => (on(w.a) || on(w.b) ? i : -1)).filter(i => i >= 0),
    sliders: model.sliders.map((w, i) => (on(w.a) || on(w.b) ? i : -1)).filter(i => i >= 0),
    motors: model.motors.map((w, i) => (on(w.a) || on(w.b) ? i : -1)).filter(i => i >= 0),
    gears: model.gears.map((g, i) => (g.a?.id === id || g.b?.id === id ? i : -1)).filter(i => i >= 0),
    dampers: model.springs.map((s, i) => ((on(s.a) || on(s.b)) && s.damper ? i : -1)).filter(i => i >= 0),
    cubic: model.springs.some(s => (on(s.a) || on(s.b)) && s.cubic !== 0)
  }
}
const hasDrag = (b: BodyModel) => b.dragLin > 0 || b.dragQuad > 0
const attracted = (model: Model, b: BodyModel) => model.G > 0 && b.attract > 0
const isZeroLocal = (p: { x: number; y: number }) => Math.abs(p.x) <= 1e-12 && Math.abs(p.y) <= 1e-12

// ---- Uniform motion (Newton's first law) ----
/**
 * A body with no connector moving at constant velocity: on a smooth fixed surface (weight balanced by the normal
 * force) or with no gravity and no contact. The acceleration at the start of the run must be zero.
 */
function uniformSituations(rec: Recording, out: Situation[]) {
  const sys = rec.system, model = sys.model, n = sys.n
  const g0 = zeroGravity(model)
  for (const b of model.dynamic) {
    if (!noConnectors(attached(model, b.id))) continue
    // An impact on the body changes its velocity without changing the mode: it starts a new run
    const impacts = rec.events.filter(e => e.impact && (e.changes.some(c => c.bodies.includes(b.id)) || e.impact.points.some(p => p.pair && (p.pair.X.id === b.id || p.pair.Y.id === b.id)))).map(e => e.t)
    const list = runs(rec, seg => {
      const us = closedUnits(seg.mode, b.id)
      const k = impacts.filter(t => t <= seg.t0 + 1e-12).length
      if (us.length === 0) return g0 ? `uni:${b.id}:${k}` : null
      if (us.length !== 1 || otherBody(us[0], b.id).dynamic || us[0].friction !== 'none') return null
      return `uni:${b.id}:${k}`
    })
    for (const r of list) {
      const s0 = bodyVel(sys, r.segs[0].X0, b)
      const v0 = Math.sqrt(s0.vx * s0.vx + s0.vy * s0.vy)
      if (!(v0 > 1e-9)) continue
      const o0 = observeAt(rec, r.t0)
      const a0 = Math.sqrt(sq(o0.sol.acc[3 * b.index]) + sq(o0.sol.acc[3 * b.index + 1]))
      if (a0 > 1e-12 * Math.max(1, v0)) continue
      out.push({
        key: `uni:${b.id}:${r.t0}`, type: 'uniform', title: tl('{0} 的匀速直线运动', [b.name]), t0: r.t0, t1: r.t1, bodies: [b.id],
        sample: t => {
          const o = observeAt(rec, t)
          const st = bodyVel(sys, o.X, b)
          const s = Math.sqrt(sq(st.x - s0.x) + sq(st.y - s0.y))
          const ax = o.sol.acc[3 * b.index], ay = o.sol.acc[3 * b.index + 1]
          return {
            vars: {
              v: V(v0, 'm/s', 'v', tl('速度大小')), t: V(t - r.t0, 's', 't', tl('经过的时间')), s: V(s, 'm', 's', tl('通过的路程（仿真）')), m: V(b.mass, 'kg', 'm', tl('质量'))
            },
            measures: {
              s: M(s, 'm', tl('通过的路程')), v: M(Math.sqrt(sq(o.X[3 * n + 3 * b.index]) + sq(o.X[3 * n + 3 * b.index + 1])), 'm/s', tl('此刻的速率')),
              F: M(b.mass * Math.sqrt(ax * ax + ay * ay), 'N', tl('合力大小 ma'))
            },
            conditions: [cond('balanced', tl('合力为零（光滑水平面或不受力）'), true)]
          }
        }
      })
    }
  }
}

// ---- A block pulled by a constant force on a horizontal surface ----
function constForceSituations(rec: Recording, out: Situation[]) {
  const sys = rec.system, model = sys.model
  const { g, vertical } = verticalG(model)
  if (!vertical || g <= 0) return
  for (const b of model.dynamic) {
    const at = attached(model, b.id)
    if (at.forces.length !== 1 || at.ropes.length + at.rods.length + at.springs.length + at.hinges.length + at.extra !== 0) continue
    const f = model.forces[at.forces[0]]
    if (f.expr || !isZeroLocal(f.a.local) || (f.force.x === 0 && f.force.y === 0)) continue
    const ex = f.force.x < 0 ? -1 : 1
    const F = Math.sqrt(f.force.x * f.force.x + f.force.y * f.force.y)
    const alpha = atan2(f.force.y, Math.abs(f.force.x))
    const list = runs(rec, seg => {
      const us = closedUnits(seg.mode, b.id)
      if (us.length !== 1) return null
      const u = us[0], other = otherBody(u, b.id)
      if (other.dynamic || other.beltSpeed !== 0 || u.friction === 'stick') return null
      return `cf:${b.id}:${u.pair.key}`
    })
    for (const r of list) {
      const seg0 = r.segs[0]
      const u = closedUnits(seg0.mode, b.id)[0]
      // Horizontal surface: the contact normal on the body is straight up
      const o0 = observeAt(rec, r.t0)
      const ui = o0.mode.units.indexOf(u)
      const kin = ui >= 0 ? o0.sol.units[ui].refKin : null
      if (!kin) continue
      const sign = u.ref.A.body.id === b.id ? 1 : -1
      if (Math.abs(sign * kin.nx) > 1e-12 || sign * kin.ny < 0) continue
      const s0 = bodyVel(sys, seg0.X0, b)
      const v0 = ex * s0.vx
      const muK = u.friction === 'slide' ? u.pair.material.muK : 0
      const W0 = seg0.X0[sys.auxBase + AUX_WORK]
      // Sliding forward: friction opposes motion along the force; a backward slide is a different formula
      const sMid = bodyVel(sys, exactStateAt(rec, (r.t0 + r.t1) / 2), b)
      const forward = v0 >= -1e-12 && ex * sMid.vx > 0 && Math.abs(s0.vy) < 1e-12
      const horizontal = f.force.y === 0
      out.push({
        key: `cf:${b.id}:${r.t0}`, type: 'const-force', title: tl('{0} 在恒力 F 作用下沿水平面运动', [b.name]), t0: r.t0, t1: r.t1, bodies: [b.id],
        sample: t => {
          const o = observeAt(rec, t)
          const st = bodyVel(sys, o.X, b)
          const s = ex * (st.x - s0.x)
          const v = ex * st.vx
          const cf = o.mode.units.findIndex(x => x.pair.key === u.pair.key && x.points.length > 0)
          const N = cf >= 0 ? o.sol.units[cf].normal : null
          return {
            vars: {
              F: V(F, 'N', 'F', tl('拉力大小')), alpha: V(alpha, 'rad', '\\alpha', tl('拉力与水平面的夹角')), m: V(b.mass, 'kg', 'm', tl('质量')),
              g: V(g, 'm/s²', 'g', tl('重力加速度')), muK: V(muK, '', '\\mu', tl('动摩擦因数')), v0: V(v0, 'm/s', 'v_0', tl('本阶段初速度')),
              t: V(t - r.t0, 's', 't', tl('本阶段经过时间')), s: V(s, 'm', 's', tl('位移（仿真）')), v: V(v, 'm/s', 'v', tl('速度（仿真）'))
            },
            measures: {
              a: M(ex * o.sol.acc[3 * b.index], 'm/s²', tl('沿拉力方向的加速度')), N: M(N, 'N', tl('支持力')),
              W: M(o.X[sys.auxBase + AUX_WORK] - W0, 'J', tl('拉力做的功（本阶段）')), P: M(o.sol.rates.appliedWork, 'W', tl('拉力的瞬时功率')),
              dEk: M(0.5 * b.mass * (sq(st.vx) + sq(st.vy) - sq(s0.vx) - sq(s0.vy)), 'J', tl('动能的增加量')),
              dp: M(b.mass * (v - v0), 'kg·m/s', tl('动量的增加量'))
            },
            conditions: [
              cond('forward', tl('沿拉力方向滑动（或光滑）'), forward),
              cond('horizontalForce', tl('拉力水平'), horizontal, horizontal ? '' : `α = ${(alpha * 180 / Math.PI).toPrecision(4)}°`)
            ]
          }
        }
      })
    }
  }
}

// ---- Lever ----
/**
 * A lever: a body on a hinge to the world at its centre of mass (its weight has no moment), carrying one load
 * welded to it and held by one rope to a fixed point, at rest. F₁ is the rope's pull, F₂ the load's weight.
 */
function leverSituations(rec: Recording, out: Situation[]) {
  const sys = rec.system, model = sys.model, n = sys.n
  const { g, vertical } = verticalG(model)
  if (!vertical || g <= 0) return
  model.hinges.forEach((h, hi) => {
    const sideB = h.a.body?.dynamic ? h.a : h.b.body?.dynamic ? h.b : null
    if (!sideB || !sideB.body) return
    const fixedSide = sideB === h.a ? h.b : h.a
    const pivot = anchorWorld(fixedSide)
    if (!pivot || !isZeroLocal(sideB.local)) return
    const B = sideB.body
    const at = attached(model, B.id), at2 = attached2651(model, B.id)
    if (at.hinges.length !== 1 || at.ropes.length !== 1 || at.rods.length + at.springs.length + at.forces.length !== 0) return
    if (at2.welds.length !== 1 || at2.sliders.length + at2.motors.length + at2.gears.length + at2.dampers.length !== 0 || hasDrag(B) || attracted(model, B)) return
    const rope = model.ropes[at.ropes[0]]
    if (rope.pulleys.length) return
    const ropeOnB = rope.a.body?.id === B.id ? rope.a : rope.b, ropeFixed = ropeOnB === rope.a ? rope.b : rope.a
    const P = anchorWorld(ropeFixed)
    if (!P) return
    const w = model.welds[at2.welds[0]]
    const L = w.a.body?.id === B.id ? w.b.body : w.a.body
    if (!L || !L.dynamic) return
    const atL = attached(model, L.id), at2L = attached2651(model, L.id)
    if (atL.ropes.length + atL.rods.length + atL.springs.length + atL.hinges.length + atL.forces.length !== 0) return
    if (at2L.welds.length !== 1 || at2L.sliders.length + at2L.motors.length + at2L.gears.length + at2L.dampers.length !== 0 || hasDrag(L) || attracted(model, L)) return
    const ri = at.ropes[0]
    const list = runs(rec, seg => (touchingUnits(seg.mode, B.id).length + touchingUnits(seg.mode, L.id).length === 0 && seg.mode.taut[ri] ? `lever:${B.id}` : null))
    for (const r of list) {
      const o0 = observeAt(rec, r.t0)
      const w0 = o0.X[3 * n + 3 * B.index + 2], beta0 = o0.sol.acc[3 * B.index + 2]
      if (Math.abs(w0) > 1e-12 || Math.abs(beta0) > 1e-9) continue
      const poses = computePoses(model, o0.X)
      const pb = poses[B.global]
      const ax = pb.x + pb.c * ropeOnB.local.x - pb.s * ropeOnB.local.y, ay = pb.y + pb.s * ropeOnB.local.x + pb.c * ropeOnB.local.y
      const dl = Math.sqrt(sq(P.x - ax) + sq(P.y - ay))
      const ux = (P.x - ax) / dl, uy = (P.y - ay) / dl
      const l1 = Math.abs((ax - pivot.x) * uy - (ay - pivot.y) * ux)
      const l2 = Math.abs(poses[L.global].x - pivot.x)
      const verticalRope = Math.abs(ux) < 1e-12 && uy < 0
      out.push({
        key: `lever:${B.id}:${r.t0}`, type: 'lever', title: tl('{0} 的杠杆平衡', [B.name]), t0: r.t0, t1: r.t1, bodies: [B.id, L.id],
        sample: t => {
          const o = observeAt(rec, t)
          let Fx = 0, Fy = 0
          o.sol.rows.forEach((row, k) => { if (row.kind === 'hinge' && row.owner === hi) { if (row.sub === 0) Fx = o.sol.lambda[k]; else Fy = o.sol.lambda[k] } })
          return {
            vars: {
              m: V(L.mass, 'kg', 'm', tl('{0}质量（阻力 F₂ = mg）', [L.name])), M: V(B.mass, 'kg', 'M', tl('{0}质量', [B.name])), g: V(g, 'm/s²', 'g', tl('重力加速度')),
              l1: V(l1, 'm', 'l_1', tl('动力臂（支点到绳的距离）')), l2: V(l2, 'm', 'l_2', tl('阻力臂（支点到重物重力作用线的距离）'))
            },
            measures: {
              T: M(o.sol.ropeTension[ri], 'N', tl('绳的拉力（动力 F₁）')), N: M(Math.sqrt(Fx * Fx + Fy * Fy), 'N', tl('支点对杠杆的作用力'))
            },
            conditions: [
              cond('balanced', tl('杠杆静止（处于平衡）'), true),
              cond('verticalRope', tl('绳竖直向下拉'), verticalRope)
            ]
          }
        }
      })
    }
  })
}

// ---- Uniform circular motion (no gravity: seen from above) ----
function circleSituations(rec: Recording, out: Situation[]) {
  const sys = rec.system, model = sys.model
  if (!zeroGravity(model)) return
  for (const b of model.dynamic) {
    const link = singleLink(model, b)
    if (!link) continue
    const list = runs(rec, seg => {
      if (touchingUnits(seg.mode, b.id).length > 0) return null
      if (link.isRope && !seg.mode.taut[link.index]) return null
      return `circ:${b.id}`
    })
    for (const r of list) {
      const s0 = bodyVel(sys, r.segs[0].X0, b)
      const rx = s0.x - link.pivot.x, ry = s0.y - link.pivot.y
      const R = Math.sqrt(rx * rx + ry * ry), v = Math.sqrt(s0.vx * s0.vx + s0.vy * s0.vy)
      if (!(v > 1e-9) || Math.abs(rx * s0.vx + ry * s0.vy) > 1e-9 * R * v) continue
      const ccw = rx * s0.vy - ry * s0.vx > 0
      let T: number | null | undefined
      const period = () => {
        if (T !== undefined) return T
        // Full turns: the position crosses the starting radius line from behind
        const ts = crossings(rec, X => (ccw ? 1 : -1) * ((rx * (X[3 * b.index + 1] - link.pivot.y) - ry * (X[3 * b.index] - link.pivot.x)) / R), r.t0, r.t1, 1, 1)
        T = ts.length ? ts[0] - r.t0 : null
        return T
      }
      out.push({
        key: `circ:${b.id}:${r.t0}`, type: 'circle', title: tl('{0} 的匀速圆周运动', [b.name]), t0: r.t0, t1: r.t1, bodies: [b.id],
        sample: t => {
          const o = observeAt(rec, t)
          const st = bodyVel(sys, o.X, b)
          const qx = st.x - link.pivot.x, qy = st.y - link.pivot.y
          const w = (qx * st.vy - qy * st.vx) / (qx * qx + qy * qy)
          const ax = o.sol.acc[3 * b.index], ay = o.sol.acc[3 * b.index + 1]
          const per = period()
          return {
            vars: { r: V(link.length, 'm', 'r', tl('圆周半径')), v: V(v, 'm/s', 'v', tl('线速度大小')), m: V(b.mass, 'kg', 'm', tl('质量')) },
            measures: {
              omega: M(Math.abs(w), 'rad/s', tl('角速度大小')), T: M(per, 's', tl('转一周的时间'), per === null ? tl('记录时长不足一周') : undefined),
              a: M(Math.sqrt(ax * ax + ay * ay), 'm/s²', tl('向心加速度大小')),
              F: M(link.isRope ? o.sol.ropeTension[link.index] : rodForce(o, link.index), 'N', link.isRope ? tl('绳的拉力（向心力）') : tl('杆的拉力（向心力）'))
            },
            conditions: [cond('uniformCircle', tl('匀速圆周运动（不受重力，速度与半径垂直）'), true)]
          }
        }
      })
    }
  }
}

// ---- Orbits ----
/** One moving body attracted by one fixed body (gravitation on, no other force). */
function orbitSituations(rec: Recording, out: Situation[]) {
  const sys = rec.system, model = sys.model, n = sys.n
  if (!(model.G > 0) || !zeroGravity(model) || model.attractors.length !== 2) return
  const S = model.attractors.find(b => !b.dynamic), b = model.attractors.find(x => x.dynamic)
  if (!S || !b) return
  const at = attached(model, b.id), at2 = attached2651(model, b.id)
  if (at.ropes.length + at.rods.length + at.springs.length + at.hinges.length + at.forces.length !== 0) return
  if (at2.welds.length + at2.sliders.length + at2.motors.length + at2.gears.length + at2.dampers.length !== 0 || hasDrag(b)) return
  const G = model.G, Mc = S.attract, mu = G * Mc
  const C = S.gravPos
  const list = runs(rec, seg => (touchingUnits(seg.mode, b.id).length === 0 ? `orbit:${b.id}` : null))
  for (const r of list) {
    const s0 = bodyVel(sys, r.segs[0].X0, b)
    const rx = s0.x - C.x, ry = s0.y - C.y
    const r0 = Math.sqrt(rx * rx + ry * ry), v0 = Math.sqrt(s0.vx * s0.vx + s0.vy * s0.vy)
    const eps = v0 * v0 / 2 - mu / r0
    const h = rx * s0.vy - ry * s0.vx
    const bound = eps < 0
    const a = bound ? -mu / (2 * eps) : Number.NaN
    const ecc = Math.sqrt(Math.max(0, 1 + 2 * eps * h * h / (mu * mu)))
    const circular = Math.abs(v0 * v0 * r0 / mu - 1) < 1e-9 && Math.abs(rx * s0.vx + ry * s0.vy) < 1e-9 * r0 * v0
    let cache: { T: number | null; e: number | null } | undefined
    const measure = () => {
      if (cache) return cache
      const sgn = h >= 0 ? 1 : -1
      const turn = crossings(rec, X => sgn * ((rx * (X[3 * b.index + 1] - C.y) - ry * (X[3 * b.index] - C.x)) / r0), r.t0, r.t1, 1, 1)
      // Apsides: the radial velocity changes sign (the start counts when it is one)
      const radial = (X: Float64Array) => ((X[3 * b.index] - C.x) * X[3 * n + 3 * b.index] + (X[3 * b.index + 1] - C.y) * X[3 * n + 3 * b.index + 1])
      const dist = (X: Float64Array) => Math.sqrt(sq(X[3 * b.index] - C.x) + sq(X[3 * b.index + 1] - C.y))
      const aps = crossings(rec, radial, r.t0, r.t1, 0, 2).map(t => dist(exactStateAt(rec, t)))
      if (Math.abs(rx * s0.vx + ry * s0.vy) <= 1e-12 * r0 * Math.max(v0, 1e-300)) aps.unshift(r0)
      cache = { T: turn.length ? turn[0] - r.t0 : null, e: aps.length >= 2 ? Math.abs(aps[0] - aps[1]) / (aps[0] + aps[1]) : null }
      return cache
    }
    out.push({
      key: `orbit:${b.id}:${r.t0}`, type: 'orbit', title: tl('{0} 绕 {1} 运动', [b.name, S.name]), t0: r.t0, t1: r.t1, bodies: [b.id],
      sample: t => {
        const st = bodyVel(sys, exactStateAt(rec, t), b)
        const qx = st.x - C.x, qy = st.y - C.y
        const dist = Math.sqrt(qx * qx + qy * qy), speed = Math.sqrt(st.vx * st.vx + st.vy * st.vy)
        const m = measure()
        return {
          vars: {
            G: V(G, 'N·m²/kg²', 'G', tl('引力常量')), M: V(Mc, 'kg', 'M', tl('{0}质量', [S.name])), m: V(b.mass, 'kg', 'm', tl('{0}质量', [b.name])),
            r: V(dist, 'm', 'r', tl('到中心的距离（仿真）')), r0: V(r0, 'm', 'r_0', tl('初始距离')), v0: V(v0, 'm/s', 'v_0', tl('初速度大小')),
            a: V(a, 'm', 'a', tl('轨道半长轴（由初始条件）')), L: V(b.mass * Math.abs(h), 'kg·m²/s', 'L', tl('对中心的角动量（由初始条件）'))
          },
          measures: {
            F: M(G * Mc * b.mass / (dist * dist), 'N', tl('受到的引力大小')), v: M(speed, 'm/s', tl('速率')),
            T: M(m.T, 's', tl('公转周期'), m.T === null ? tl('记录时长不足一周') : undefined),
            E: M(0.5 * b.mass * speed * speed - G * Mc * b.mass / dist, 'J', tl('机械能 ½mv² − GMm/r')),
            areal: M(Math.abs(qx * st.vy - qy * st.vx) / 2, 'm²/s', tl('掠面速度 |r × v|/2')),
            ecc: M(m.e, '', tl('偏心率（由近、远点距离）'), m.e === null ? tl('记录内没有经过近点和远点') : undefined)
          },
          conditions: [
            cond('bound', tl('束缚轨道（机械能为负）'), bound),
            cond('circular', tl('圆轨道（v₀ = √(GM/r₀)，速度垂直于半径）'), circular),
            cond('elliptic', tl('椭圆轨道（偏心率明显大于零）'), bound && ecc > 1e-3, `e = ${ecc.toPrecision(4)}`)
          ]
        }
      }
    })
  }
}

// ---- Fall with air drag ----
function dragSituations(rec: Recording, out: Situation[]) {
  const sys = rec.system, model = sys.model
  const { g, vertical } = verticalG(model)
  if (!vertical || g <= 0) return
  for (const b of model.dynamic) {
    if (!hasDrag(b) || attracted(model, b)) continue
    const at = attached(model, b.id)
    if (at.ropes.length + at.rods.length + at.springs.length + at.hinges.length + at.forces.length !== 0 || at.extra !== 1) continue
    const list = runs(rec, seg => (touchingUnits(seg.mode, b.id).length === 0 ? `drag:${b.id}` : null))
    for (const r of list) {
      const s0 = bodyVel(sys, r.segs[0].X0, b)
      if (s0.vx !== 0 || s0.vy > 0) continue
      const B = b.dragLin, Cq = b.dragQuad, m = b.mass
      const vt = Cq > 0 ? (-B + Math.sqrt(B * B + 4 * Cq * m * g)) / (2 * Cq) : m * g / B
      out.push({
        key: `drag:${b.id}:${r.t0}`, type: 'drag', title: tl('{0} 在空气阻力下下落', [b.name]), t0: r.t0, t1: r.t1, bodies: [b.id],
        sample: t => {
          const st = bodyVel(sys, exactStateAt(rec, t), b)
          const v = -st.vy
          const near = Math.abs(v - vt) / vt
          const terminal: Condition = { id: 'nearTerminal', label: tl('已接近终端速度'), status: near <= 1e-3 ? 'ok' : near <= 3e-2 ? 'approx' : 'fail', detail: tl('与终端速度相差 {0}%', [(near * 100).toPrecision(3)]) }
          return {
            vars: {
              m: V(m, 'kg', 'm', tl('质量')), g: V(g, 'm/s²', 'g', tl('重力加速度')), b: V(B, 'N·s/m', 'b', tl('线性阻力系数')), c: V(Cq, 'N·s²/m²', 'c', tl('平方阻力系数')),
              t: V(t - r.t0, 's', 't', tl('下落时间')), v: V(v, 'm/s', 'v', tl('下落速度（仿真）'))
            },
            measures: { speed: M(v, 'm/s', tl('下落速度')), F: M((B + Cq * Math.abs(v)) * Math.abs(v), 'N', tl('空气阻力大小')) },
            conditions: [
              cond('linearDrag', tl('只有线性阻力（c = 0）'), Cq === 0 && B > 0),
              cond('quadDrag', tl('只有平方阻力（b = 0）'), B === 0 && Cq > 0),
              cond('fromRest', tl('由静止开始下落'), s0.vy === 0),
              terminal
            ]
          }
        }
      })
    }
  }
}

// ---- Damped oscillation ----
/** A spring oscillator with viscous damping c > 0, underdamped, moving along the spring. */
function dampedSituations(rec: Recording, out: Situation[]) {
  const sys = rec.system, model = sys.model, n = sys.n
  const gv = model.settings.gravity
  for (const b of model.dynamic) {
    if (hasDrag(b) || attracted(model, b)) continue
    const at = attached(model, b.id)
    if (at.springs.length !== 1 || at.ropes.length + at.rods.length + at.hinges.length + at.forces.length + at.extra > 0) continue
    const sp = model.springs[at.springs[0]]
    if (!(sp.damping > 0) || sp.damping * sp.damping >= 4 * sp.stiffness * b.mass) continue
    const mine = sp.a.body?.id === b.id ? sp.a : sp.b, fixed = mine === sp.a ? sp.b : sp.a
    const P = anchorWorld(fixed)
    if (!P) continue
    const list = runs(rec, seg => {
      const us = closedUnits(seg.mode, b.id)
      if (us.some(u => u.friction !== 'none' || otherBody(u, b.id).dynamic)) return null
      return `damped:${b.id}`
    })
    for (const r of list) {
      const X0 = r.segs[0].X0
      const pa = computePoses(model, X0)[b.global]
      const ax = pa.x + pa.c * mine.local.x - pa.s * mine.local.y, ay = pa.y + pa.s * mine.local.x + pa.c * mine.local.y
      const len = Math.sqrt(sq(ax - P.x) + sq(ay - P.y))
      const ux = (ax - P.x) / len, uy = (ay - P.y) / len
      const supported = closedUnits(r.segs[0].mode, b.id).length > 0
      const gAlong = gv.x * ux + gv.y * uy
      const extEq = supported ? 0 : b.mass * gAlong / sp.stiffness
      const vx = X0[3 * n + 3 * b.index], vy = X0[3 * n + 3 * b.index + 1]
      const oneDim = Math.abs(-vx * uy + vy * ux) < 1e-12 && Math.abs(X0[3 * n + 3 * b.index + 2]) < 1e-12 &&
        (supported ? Math.abs(gAlong) < 1e-12 : Math.abs(gv.x * uy - gv.y * ux) < 1e-12)
      if (!oneDim) continue
      const disp = (X: Float64Array) => {
        const ps = computePoses(model, X)[b.global]
        const qx = ps.x + ps.c * mine.local.x - ps.s * mine.local.y, qy = ps.y + ps.s * mine.local.x + ps.c * mine.local.y
        return Math.sqrt(sq(qx - P.x) + sq(qy - P.y)) - sp.restLength - extEq
      }
      const along = (X: Float64Array) => X[3 * n + 3 * b.index] * ux + X[3 * n + 3 * b.index + 1] * uy
      let cache: { T: number | null; ratio: number | null } | undefined
      const measure = () => {
        if (cache) return cache
        const zeros = crossings(rec, disp, r.t0, r.t1, 1, 2)
        // Maxima of the extension: the velocity along the spring falls through zero
        const maxima = crossings(rec, along, r.t0, r.t1, -1, 2).map(t => disp(exactStateAt(rec, t)))
        cache = { T: zeros.length >= 2 ? zeros[1] - zeros[0] : null, ratio: maxima.length >= 2 ? maxima[1] / maxima[0] : null }
        return cache
      }
      out.push({
        key: `damped:${b.id}:${r.t0}`, type: 'damped', title: tl('{0} 的阻尼振动', [b.name]), t0: r.t0, t1: r.t1, bodies: [b.id],
        sample: () => {
          const m = measure()
          return {
            vars: { k: V(sp.stiffness, 'N/m', 'k', tl('劲度系数')), m: V(b.mass, 'kg', 'm', tl('振子质量')), c: V(sp.damping, 'N·s/m', 'c', tl('阻尼系数')) },
            measures: {
              Td: M(m.T, 's', tl('周期（相邻两次同向过平衡位置）'), m.T === null ? tl('记录时长不足一个完整周期') : undefined),
              ratio: M(m.ratio, '', tl('相邻两次最大位移之比'), m.ratio === null ? tl('记录内不足两次最大位移') : undefined)
            },
            conditions: [cond('underdamped', tl('欠阻尼（c² < 4km）'), true)]
          }
        }
      })
    }
  }
}

// ---- A disc turned by a torque motor ----
function spinSituations(rec: Recording, out: Situation[]) {
  const sys = rec.system, model = sys.model
  for (const b of model.dynamic) {
    if (b.invInertia === 0 || hasDrag(b) || attracted(model, b)) continue
    const at = attached(model, b.id), at2 = attached2651(model, b.id)
    if (at.ropes.length + at.rods.length + at.springs.length + at.hinges.length + at.forces.length !== 0) continue
    if (at2.motors.length !== 1 || at2.welds.length + at2.sliders.length + at2.gears.length + at2.dampers.length !== 0) continue
    const mo = model.motors[at2.motors[0]]
    if (mo.mode !== 'torque') continue
    const mine = mo.b.body?.id === b.id ? mo.b : mo.a, other = mine === mo.b ? mo.a : mo.b
    if (!anchorWorld(other) || !isZeroLocal(mine.local)) continue
    const Mt = mine === mo.b ? mo.torque : -mo.torque
    const list = runs(rec, seg => (touchingUnits(seg.mode, b.id).length === 0 ? `spin:${b.id}` : null))
    for (const r of list) {
      const s0 = bodyVel(sys, r.segs[0].X0, b)
      out.push({
        key: `spin:${b.id}:${r.t0}`, type: 'spin', title: tl('{0} 在恒定力矩下转动', [b.name]), t0: r.t0, t1: r.t1, bodies: [b.id],
        sample: t => {
          const o = observeAt(rec, t)
          const st = bodyVel(sys, o.X, b)
          return {
            vars: {
              M: V(Mt, 'N·m', 'M', tl('马达力矩')), I: V(b.inertia, 'kg·m²', 'I', tl('对转轴的转动惯量')), omega0: V(s0.w, 'rad/s', '\\omega_0', tl('初角速度')),
              t: V(t - r.t0, 's', 't', tl('经过的时间')), theta: V(st.th - s0.th, 'rad', '\\theta', tl('转过的角度（仿真）'))
            },
            measures: {
              beta: M(o.sol.acc[3 * b.index + 2], 'rad/s²', tl('角加速度')), omega: M(st.w, 'rad/s', tl('角速度')), theta: M(st.th - s0.th, 'rad', tl('转过的角度')),
              dEk: M(0.5 * b.inertia * (st.w * st.w - s0.w * s0.w), 'J', tl('转动动能的增加量'))
            },
            conditions: [cond('fixedAxis', tl('绕过质心的固定轴转动'), true)]
          }
        }
      })
    }
  }
}

// ---- Meshing gears ----
/** Two bodies on pins at their centres, joined by a gear; body A may be driven by a torque motor. */
function gearSituations(rec: Recording, out: Situation[]) {
  const sys = rec.system, model = sys.model, n = sys.n
  model.gears.forEach((gr, gi) => {
    const A = gr.a, B = gr.b
    if (!A || !B) return
    let driveM = 0, driven = false
    for (const X of [A, B]) {
      const at = attached(model, X.id), at2 = attached2651(model, X.id)
      if (at.ropes.length + at.rods.length + at.springs.length + at.forces.length !== 0 || hasDrag(X) || attracted(model, X)) return
      if (at2.gears.length !== 1 || at2.welds.length + at2.sliders.length + at2.dampers.length !== 0) return
      const pins = [...at.hinges.map(i => model.hinges[i]), ...at2.motors.map(i => model.motors[i])]
      if (pins.length !== 1) return
      const pin = pins[0]
      const mine = pin.a.body?.id === X.id ? pin.a : pin.b, other = mine === pin.a ? pin.b : pin.a
      if (!anchorWorld(other) || !isZeroLocal(mine.local)) return
      if (at2.motors.length) {
        const mo = model.motors[at2.motors[0]]
        if (mo.mode !== 'torque' || X !== A) return
        driveM = mo.b.body?.id === X.id ? mo.torque : -mo.torque
        driven = true
      }
    }
    const radius = (X: BodyModel) => (X.shape.kind === 'circle' ? X.shape.radius : Number.NaN)
    const discs = A.shape.kind === 'circle' && B.shape.kind === 'circle' && Math.abs(gr.ratio - radius(B) / radius(A)) <= 1e-12 * Math.abs(gr.ratio)
    const list = runs(rec, seg => (touchingUnits(seg.mode, A.id).length + touchingUnits(seg.mode, B.id).length === 0 ? `gear:${gi}` : null))
    for (const r of list) {
      out.push({
        key: `gear:${gr.id}:${r.t0}`, type: 'gear', title: tl('{0} 与 {1} 齿轮传动', [A.name, B.name]), t0: r.t0, t1: r.t1, bodies: [A.id, B.id],
        sample: t => {
          const o = observeAt(rec, t)
          const wA = o.X[3 * n + 3 * A.index + 2], wB = o.X[3 * n + 3 * B.index + 2]
          return {
            vars: {
              r: V(gr.ratio, '', 'r', tl('传动比 r_B / r_A')), omegaA: V(wA, 'rad/s', '\\omega_A', tl('{0}的角速度（仿真）', [A.name])),
              rA: V(radius(A), 'm', 'r_A', tl('{0}的半径', [A.name])), IA: V(A.inertia, 'kg·m²', 'I_A', tl('{0}的转动惯量', [A.name])),
              IB: V(B.inertia, 'kg·m²', 'I_B', tl('{0}的转动惯量', [B.name])), M: V(driveM, 'N·m', 'M', tl('驱动力矩'))
            },
            measures: {
              omegaB: M(wB, 'rad/s', tl('{0}的角速度', [B.name])), vB: M(Math.abs(wB) * radius(B), 'm/s', tl('{0}边缘的线速度', [B.name])),
              betaA: M(o.sol.acc[3 * A.index + 2], 'rad/s²', tl('{0}的角加速度', [A.name]))
            },
            conditions: [
              cond('discs', tl('两轮都是圆盘，传动比等于半径比'), discs),
              cond('driven', tl('主动轮受恒定力矩驱动'), driven)
            ]
          }
        }
      })
    }
  })
}
