/**
 * Situation recognizers. A recognizer reads the recording (scene, segments with their contact modes,
 * events) and reports textbook situations — "block sliding down an incline", "two smooth balls collide",
 * "pendulum" … — with the variables a formula needs (taken from the scene and the recorded state) and the
 * simulated measurements to compare against. Conditions say when a formula's assumptions hold.
 * Recognizers only read; they never change the recording.
 */
import type { Recording, Segment, SimEvent } from '../core/solver/simulation'
import { exactStateAt, ledgerAt } from '../core/solver/simulation'
import type { Mode, System, UnitMode } from '../core/solver/dynamics'
import { AUX_BELT, AUX_FIXED, AUX_WORK, kineticEnergy } from '../core/solver/dynamics'
import type { BodyModel, Model } from '../core/solver/model'
import { pairKey } from '../core/solver/model'
import { computePoses, contactKin, distanceKin, ropePath } from '../core/solver/kinematics'
import { ENV_SIZE } from '../core/solver/forceExpr'
import type { Node } from './expr'
import { integrate } from './quadrature'
import type { ObservationContext } from '../core/observe/quantities'
import { contactForces, makeContextFor } from '../core/observe/quantities'
import { atan2, acos, cos, sin, tan, DEG } from '../core/math/dmath'
import { crossings } from './measure'

/** Status of a condition: holds, holds approximately, or fails. */
export type CondStatus = 'ok' | 'approx' | 'fail'
/** An assumption of a formula with its status; `label` and `detail` are user-facing. */
export interface Condition { id: string; label: string; status: CondStatus; detail: string }
/** A variable of a situation: SI value, unit, KaTeX symbol and label. */
export interface VarValue { value: number; unit: string; symbol: string; label: string }
/** A simulated measurement (SI); null when the recording does not provide it. */
export interface Measure { value: number | null; unit: string; label: string; note?: string }
/** Variables, measurements and conditions of a situation at one time. */
export interface Sample { vars: Record<string, VarValue>; measures: Record<string, Measure>; conditions: Condition[] }

/** A recognised textbook situation over [t0, t1]. */
export interface Situation {
  key: string
  /** Situation type, matched by FormulaDef.situation. */
  type: string
  title: string
  t0: number
  t1: number
  /** Event-type situations (collisions) refer to this instant. */
  tEvent?: number
  bodies: string[]
  /** Variables, measurements and conditions at time t in [t0, t1]. */
  sample: (t: number) => Sample
}

const sq = (x: number) => x * x
const cond = (id: string, label: string, ok: boolean, detail = ''): Condition => ({ id, label, status: ok ? 'ok' : 'fail', detail })
const V = (value: number, unit: string, symbol: string, label: string): VarValue => ({ value, unit, symbol, label })
const M = (value: number | null, unit: string, label: string, note?: string): Measure => ({ value, unit, label, note })

/** Consecutive segments with the same signature. */
interface Run { sig: string; t0: number; t1: number; segs: Segment[] }

/** Merge consecutive segments with the same non-null signature into runs (zero-length segments skipped). */
function runs(rec: Recording, sig: (seg: Segment) => string | null): Run[] {
  const out: Run[] = []
  rec.segments.forEach((seg, i) => {
    const zero = seg.t1 - seg.t0 <= 1e-12 && i < rec.segments.length - 1
    if (zero) return
    // The Moreau–Jean fallback (reduced accuracy) gives no exact states to compare formulas with
    const s = seg.reduced ? null : sig(seg)
    const last = out[out.length - 1]
    if (s && last && last.sig === s && Math.abs(last.t1 - seg.t0) <= 1e-12) { last.t1 = seg.t1; last.segs.push(seg) } else if (s) out.push({ sig: s, t0: seg.t0, t1: seg.t1, segs: [seg] })
  })
  return out
}

/** The segment containing time t (the later one at a boundary). */
export function segmentAt(rec: Recording, t: number): Segment {
  let seg = rec.segments[0]
  for (const s of rec.segments) if (s.t0 <= t) seg = s
  return seg
}

/** Observation at time t (exact state, mode of the segment containing t). */
export function observeAt(rec: Recording, t: number): ObservationContext {
  const seg = segmentAt(rec, t)
  return makeContextFor(rec, exactStateAt(rec, t), seg.mode, seg.impactLoss)
}

function closedUnits(mode: Mode, id: string): UnitMode[] {
  return mode.units.filter(u => u.points.length > 0 && (u.pair.X.id === id || u.pair.Y.id === id))
}
function touchingUnits(mode: Mode, id: string): UnitMode[] {
  return mode.units.filter(u => (u.points.length > 0 || u.open.length > 0) && (u.pair.X.id === id || u.pair.Y.id === id))
}
function otherBody(u: UnitMode, id: string): BodyModel { return u.pair.X.id === id ? u.pair.Y : u.pair.X }

interface Attached { ropes: number[]; rods: number[]; springs: number[]; hinges: number[]; forces: number[] }
function attached(model: Model, id: string): Attached {
  const has = (a: { body: BodyModel | null }) => a.body?.id === id
  const idx = <T extends { a: { body: BodyModel | null }; b?: { body: BodyModel | null } }>(list: T[]) => list.map((c, i) => (has(c.a) || (c.b ? has(c.b) : false) ? i : -1)).filter(i => i >= 0)
  // A rope also acts on the bodies that carry its movable pulleys
  const ropes = model.ropes.map((r, i) => (has(r.a) || has(r.b) || r.pulleys.some(p => p.pulley.body?.id === id) ? i : -1)).filter(i => i >= 0)
  return { ropes, rods: idx(model.rods), springs: idx(model.springs), hinges: idx(model.hinges), forces: idx(model.forces) }
}
const noConnectors = (a: Attached) => a.ropes.length + a.rods.length + a.springs.length + a.hinges.length + a.forces.length === 0

function gravity(model: Model): { g: number; vertical: boolean } {
  const g = model.settings.gravity
  return { g: Math.sqrt(g.x * g.x + g.y * g.y), vertical: g.x === 0 && g.y < 0 }
}

/**
 * Contact geometry of a unit seen from body `id`: surface normal pointing towards the body, downhill
 * direction, belt surface velocity.
 */
function unitGeometry(sys: System, X: Float64Array, u: UnitMode, id: string) {
  const poses = computePoses(sys.model, X)
  const k = contactKin(u.ref, poses)
  const sign = u.ref.A.body.id === id ? 1 : -1
  const nx = sign * k.nx, ny = sign * k.ny
  const theta = atan2(Math.abs(nx), ny)
  // Downhill direction: gravity projected on the surface (for horizontal faces: +x)
  let dx = ny, dy = -nx
  if (Math.abs(nx) > 1e-12) { if (dy > 0) { dx = -dx; dy = -dy } } else if (dx < 0) { dx = -dx; dy = -dy }
  // Belt surface velocity = −beltSpeed·t_face (face owner B of the ref feature)
  const belt = u.ref.kind === 'pf' ? u.ref.B.body.beltSpeed : 0
  const surfVx = -belt * k.tx, surfVy = -belt * k.ty
  return { nx, ny, theta, dx, dy, belt, u: surfVx * dx + surfVy * dy, refSign: sign, k }
}

function bodyVel(sys: System, X: Float64Array, b: BodyModel) {
  const n = sys.n, i = b.index
  return { x: X[3 * i], y: X[3 * i + 1], th: X[3 * i + 2], vx: X[3 * n + 3 * i], vy: X[3 * n + 3 * i + 1], w: X[3 * n + 3 * i + 2] }
}

function eventAt(rec: Recording, t: number): SimEvent | undefined {
  return rec.events.find(e => Math.abs(e.t - t) <= 1e-12)
}

function pairAux(sys: System, X: Float64Array, a: string, b: string): { slide: number; heat: number } {
  const p = sys.pairByKey.get(pairKey(a, b))
  if (!p) return { slide: Number.NaN, heat: Number.NaN }
  const base = sys.auxBase + AUX_FIXED + 2 * p.index
  return { slide: X[base], heat: X[base + 1] }
}

function slideDirection(u: UnitMode, geomRefSign: number, k: { tx: number; ty: number }, d: { dx: number; dy: number }): number {
  // The relative velocity of the body against the surface along downhill has the sign s·(t·d)·refSign
  return Math.sign(u.s * (k.tx * d.dx + k.ty * d.dy) * geomRefSign) || 1
}

// ---- Recognizers ----
function surfaceSituations(rec: Recording, out: Situation[]) {
  const sys = rec.system, model = sys.model
  const { g, vertical } = gravity(model)
  if (!vertical) return
  for (const b of model.dynamic) {
    if (!noConnectors(attached(model, b.id))) continue
    const rolling = b.shape.kind === 'circle' && b.invInertia > 0
    const list = runs(rec, seg => {
      const us = closedUnits(seg.mode, b.id)
      if (us.length !== 1 || touchingUnits(seg.mode, b.id).length !== 1) return null
      const u = us[0], other = otherBody(u, b.id)
      if (other.dynamic) return null
      const geo = unitGeometry(sys, seg.X0, u, b.id)
      if (geo.ny <= 1e-9) return null
      // Translation only: a polygon rests on a face (two points) and does not turn
      if (!rolling && (Math.abs(seg.X0[3 * sys.n + 3 * b.index + 2]) > 1e-9 || (b.shape.kind === 'polygon' && u.points.length !== 2 && b.invInertia > 0))) return null
      let status: string = u.friction
      if (u.friction === 'slide') status = slideDirection(u, geo.refSign, geo.k, geo) > 0 ? 'down' : 'up'
      if (u.friction === 'none') status = 'smooth'
      return `${rolling ? 'roll' : 'surf'}:${other.id}:${status}`
    })
    for (const r of list) {
      const seg0 = r.segs[0]
      const u = closedUnits(seg0.mode, b.id)[0]
      const other = otherBody(u, b.id)
      const geo = unitGeometry(sys, seg0.X0, u, b.id)
      const status = r.sig.split(':')[2]
      const mat = u.pair.material
      const flat = geo.theta < 1e-9
      const X0 = seg0.X0
      const s0 = bodyVel(sys, X0, b)
      const v0 = s0.vx * geo.dx + s0.vy * geo.dy
      const endEvent = eventAt(rec, r.t1)
      const endsAtRest = !!endEvent?.changes.some(c => c.subject === u.pair.key && (c.type === 'stick' || c.type === 'reverse'))
      const theta = geo.theta
      if (rolling) {
        const I = b.inertia, rr = (b.shape as { radius: number }).radius
        out.push({
          key: `rolling:${b.id}:${r.t0}`, type: 'rolling', title: `${b.name} 在${other.name}上${status === 'stick' ? '纯滚动' : '边滚边滑'}`,
          t0: r.t0, t1: r.t1, bodies: [b.id, other.id],
          sample: t => {
            const o = observeAt(rec, t)
            const st = bodyVel(sys, o.X, b)
            const a = o.sol.acc[3 * b.index] * geo.dx + o.sol.acc[3 * b.index + 1] * geo.dy
            const c = contactForces(o, b.id, other.id)
            return {
              vars: {
                m: V(b.mass, 'kg', 'm', '质量'), r: V(rr, 'm', 'r', '半径'), I: V(I, 'kg·m²', 'I', '对质心的转动惯量'),
                g: V(g, 'm/s²', 'g', '重力加速度'), theta: V(theta, 'rad', '\\theta', '倾角'),
                muK: V(mat.muK, '', '\\mu_k', '动摩擦因数'), muS: V(mat.muS, '', '\\mu_s', '静摩擦因数'),
                omegaSim: V(Math.abs(st.w), 'rad/s', '\\omega', '角速度（仿真）')
              },
              measures: {
                a: M(a, 'm/s²', '沿斜面向下的加速度'), f: M(c.f, 'N', '摩擦力'), v: M(Math.sqrt(st.vx * st.vx + st.vy * st.vy), 'm/s', '质心速率'),
                beta: M(Math.abs(o.sol.acc[3 * b.index + 2]), 'rad/s²', '角加速度大小')
              },
              conditions: [
                cond('pureRolling', '纯滚动（接触点无相对滑动）', status === 'stick', status === 'stick' ? `需 μs ≥ tanθ/(1 + mr²/I) = ${(tan(theta) / (1 + b.mass * rr * rr / I)).toPrecision(4)}，本例 μs = ${mat.muS}` : '接触点有相对滑动'),
                cond('slipping', '边滚边滑（向下滑动）', status === 'down', status === 'down' ? '' : '没有向下的相对滑动')
              ]
            }
          }
        })
        continue
      }
      const type = flat ? 'flat' : 'incline'
      const tag = status === 'stick' ? '相对静止' : status === 'up' ? '相对上滑' : status === 'smooth' ? '光滑滑动' : '相对下滑'
      const title = flat ? `${b.name} 在${other.name}上${status === 'stick' ? '相对静止' : '滑动'}` : `${b.name} 在${other.name}上（${tag}）`
      // Theoretical acceleration along downhill for v = v0 + at
      const aTh = flat
        ? (status === 'stick' ? 0 : -Math.sign(v0 - geo.u || 1) * mat.muK * g)
        : status === 'up' ? g * (sin(theta) + mat.muK * cos(theta)) : status === 'stick' ? 0 : g * (sin(theta) - mat.muK * cos(theta))
      const auxStart = pairAux(sys, X0, b.id, other.id)
      const beltStart = X0[sys.auxBase + AUX_BELT]
      const end = endsAtRest ? exactStateAt(rec, r.t1) : null
      out.push({
        key: `${type}:${b.id}:${r.t0}`, type, title, t0: r.t0, t1: r.t1, bodies: [b.id, other.id],
        sample: t => {
          const o = observeAt(rec, t)
          const st = bodyVel(sys, o.X, b)
          const ax = o.sol.acc[3 * b.index], ay = o.sol.acc[3 * b.index + 1]
          const c = contactForces(o, b.id, other.id)
          const vars: Record<string, VarValue> = {
            m: V(b.mass, 'kg', 'm', '质量'), g: V(g, 'm/s²', 'g', '重力加速度'),
            muK: V(mat.muK, '', '\\mu_k', '动摩擦因数'), muS: V(mat.muS, '', '\\mu_s', '静摩擦因数'),
            v0: V(v0, 'm/s', 'v_0', '本阶段初速度'), u: V(geo.u, 'm/s', 'u', '接触面速度'),
            t: V(t - r.t0, 's', 't', '本阶段经过时间'), a: V(aTh, 'm/s²', 'a', '理论加速度')
          }
          if (!flat) vars.theta = V(theta, 'rad', '\\theta', '倾角')
          const along = flat ? Math.abs(ax) : ax * geo.dx + ay * geo.dy
          const v = st.vx * geo.dx + st.vy * geo.dy
          const s = (st.x - s0.x) * geo.dx + (st.y - s0.y) * geo.dy
          const measures: Record<string, Measure> = {
            a: M(ax * geo.dx + ay * geo.dy, 'm/s²', '沿斜面向下的加速度'), aMag: M(along, 'm/s²', '加速度大小'),
            N: M(c.N, 'N', '支持力'), f: M(c.f, 'N', '摩擦力大小'), v: M(v, 'm/s', '速度'), s: M(s, 'm', '位移'),
            tEnd: M(endsAtRest ? r.t1 - r.t0 : null, 's', '相对滑动结束时刻（自本阶段开始）'),
            xEnd: M(end ? Math.abs((bodyVel(sys, end, b).x - s0.x) * geo.dx + (bodyVel(sys, end, b).y - s0.y) * geo.dy) : null, 'm', '滑动阶段位移'),
            slideEnd: M(end ? pairAux(sys, end, b.id, other.id).slide - auxStart.slide : null, 'm', '相对滑动距离'),
            heatEnd: M(end ? pairAux(sys, end, b.id, other.id).heat - auxStart.heat : null, 'J', '摩擦生热'),
            beltEnd: M(end ? end[sys.auxBase + AUX_BELT] - beltStart : null, 'J', '电机做功')
          }
          const tanT = tan(theta)
          return {
            vars, measures,
            conditions: [
              cond('contact', '保持接触', true),
              cond('sliding', '相对滑动', status !== 'stick', status === 'stick' ? '物体与接触面相对静止' : ''),
              cond('slideDown', '相对接触面向下滑动', status === 'down' || status === 'smooth', ''),
              cond('slideUp', '相对接触面向上滑动', status === 'up', ''),
              cond('stick', '相对静止', status === 'stick', ''),
              cond('staticHolds', '最大静摩擦足以维持静止（μs ≥ tanθ）', mat.muS >= tanT - 1e-12, `tanθ = ${tanT.toPrecision(4)}`),
              cond('belt', '接触面为传送带', geo.belt !== 0, ''),
              cond('endsAtCommon', '本阶段以“共速/相对静止”结束', endsAtRest, endsAtRest ? '' : '记录内未达到共速'),
              cond('endsAtRest', '本阶段以相对静止结束', endsAtRest, endsAtRest ? '' : '记录内未停止相对滑动'),
              cond('onlyGravity', '只受重力、支持力和摩擦力', true)
            ]
          }
        }
      })
    }
  }
}

function boardBlockSituations(rec: Recording, out: Situation[]) {
  const sys = rec.system, model = sys.model
  const { g, vertical } = gravity(model)
  if (!vertical) return
  for (const B of model.dynamic) {
    for (const A of model.dynamic) {
      if (A === B) continue
      if (!noConnectors(attached(model, A.id)) || !noConnectors(attached(model, B.id))) continue
      const list = runs(rec, seg => {
        const ua = closedUnits(seg.mode, A.id), ub = closedUnits(seg.mode, B.id)
        if (ua.length !== 1 || otherBody(ua[0], A.id) !== B || ub.length !== 2) return null
        const ground = ub.find(u => u !== ua[0])!
        const S = otherBody(ground, B.id)
        if (S.dynamic) return null
        const gAB = unitGeometry(sys, seg.X0, ua[0], A.id), gBS = unitGeometry(sys, seg.X0, ground, B.id)
        if (gAB.theta > 1e-9 || gBS.theta > 1e-9 || gBS.belt !== 0) return null
        return `bb:${S.id}:${ua[0].friction}:${ground.friction}`
      })
      for (const r of list) {
        const seg0 = r.segs[0]
        const ua = closedUnits(seg0.mode, A.id)[0]
        const ground = closedUnits(seg0.mode, B.id).find(u => u !== ua)!
        const S = otherBody(ground, B.id)
        const mu1 = ua.pair.material.muK, mu2 = ground.pair.material.muK
        const sa = bodyVel(sys, seg0.X0, A), sb = bodyVel(sys, seg0.X0, B)
        const sigma = Math.sign(sa.vx - sb.vx) || 1
        const v1 = sa.vx * sigma, v2 = sb.vx * sigma
        const boardMoves = ground.friction === 'slide'
        const a2 = boardMoves ? (mu1 * A.mass * g - mu2 * (A.mass + B.mass) * g) / B.mass : 0
        const endEvent = eventAt(rec, r.t1)
        const endsAtCommon = !!endEvent?.changes.some(c => c.subject === ua.pair.key && c.type === 'stick')
        const end = endsAtCommon ? exactStateAt(rec, r.t1) : null
        const aux0 = pairAux(sys, seg0.X0, A.id, B.id)
        if (ua.friction === 'slide') {
          out.push({
            key: `bb:${A.id}:${B.id}:${r.t0}`, type: 'board-block', title: `${A.name} 在${B.name}上滑动（板块模型）`, t0: r.t0, t1: r.t1, bodies: [A.id, B.id, S.id],
            sample: t => {
              const o = observeAt(rec, t)
              return {
                vars: {
                  m: V(A.mass, 'kg', 'm', `${A.name}质量`), M: V(B.mass, 'kg', 'M', `${B.name}质量`),
                  mu1: V(mu1, '', '\\mu_1', `${A.name}与${B.name}间动摩擦因数`), mu2: V(mu2, '', '\\mu_2', `${B.name}与${S.name}间动摩擦因数`),
                  g: V(g, 'm/s²', 'g', '重力加速度'), v1: V(v1, 'm/s', 'v_1', `${A.name}初速度`), v2: V(v2, 'm/s', 'v_2', `${B.name}初速度`),
                  a2: V(a2, 'm/s²', 'a_2', `${B.name}理论加速度`)
                },
                measures: {
                  a1: M(Math.abs(o.sol.acc[3 * A.index]), 'm/s²', `${A.name}加速度大小`),
                  a2: M(o.sol.acc[3 * B.index] * sigma, 'm/s²', `${B.name}加速度`),
                  tEnd: M(endsAtCommon ? r.t1 - r.t0 : null, 's', '共速时刻（自本阶段开始）'),
                  vEnd: M(end ? bodyVel(sys, end, A).vx * sigma : null, 'm/s', '共同速度'),
                  slideEnd: M(end ? pairAux(sys, end, A.id, B.id).slide - aux0.slide : null, 'm', '相对滑动距离'),
                  heatEnd: M(end ? pairAux(sys, end, A.id, B.id).heat - aux0.heat : null, 'J', '摩擦生热')
                },
                conditions: [
                  cond('boardMoves', `${B.name}相对${S.name}滑动`, boardMoves, boardMoves ? '' : `μ₁m ≤ μ₂(M+m)，${B.name}保持静止`),
                  cond('boardRests', `${B.name}相对${S.name}静止`, ground.friction === 'stick'),
                  cond('endsAtCommon', '本阶段以共速结束', endsAtCommon, endsAtCommon ? '' : '记录内未达到共速')
                ]
              }
            }
          })
        } else if (ua.friction === 'stick') {
          out.push({
            key: `bt:${A.id}:${B.id}:${r.t0}`, type: 'board-together', title: `${A.name}与${B.name}共速后一起运动`, t0: r.t0, t1: r.t1, bodies: [A.id, B.id, S.id],
            sample: t => {
              const o = observeAt(rec, t)
              const c = contactForces(o, A.id, B.id)
              return {
                vars: {
                  m: V(A.mass, 'kg', 'm', `${A.name}质量`), M: V(B.mass, 'kg', 'M', `${B.name}质量`),
                  mu1: V(mu1, '', '\\mu_1', '物块与木板间动摩擦因数'), mu2: V(mu2, '', '\\mu_2', '木板与地面间动摩擦因数'), g: V(g, 'm/s²', 'g', '重力加速度')
                },
                measures: { aMag: M(Math.abs(o.sol.acc[3 * A.index]), 'm/s²', '整体加速度大小'), f: M(c.f, 'N', `${A.name}受到的静摩擦力`) },
                conditions: [
                  cond('together', '物块与木板相对静止', true, `需 μ₂ ≤ μ₁（本例 ${mu2} ≤ ${mu1}）`),
                  cond('groundSliding', `${B.name}相对${S.name}滑动`, ground.friction === 'slide', ground.friction === 'slide' ? '' : '整体已静止')
                ]
              }
            }
          })
        }
      }
    }
  }
}

function lzAbout(sys: System, X: Float64Array, px: number, py: number, ids?: string[]): number {
  const n = sys.n
  let L = 0
  for (const b of sys.model.dynamic) {
    if (ids && !ids.includes(b.id)) continue
    const i = b.index
    const rx = X[3 * i] - px, ry = X[3 * i + 1] - py
    L += b.mass * (rx * X[3 * n + 3 * i + 1] - ry * X[3 * n + 3 * i]) + (b.invInertia > 0 ? b.inertia * X[3 * n + 3 * i + 2] : 0)
  }
  return L
}

function hingePivot(sys: System, hingeIndex: number): { x: number; y: number; body: BodyModel } | null {
  const h = sys.model.hinges[hingeIndex]
  const world = !h.a.body || !h.a.body.dynamic ? h.a : !h.b.body || !h.b.body.dynamic ? h.b : null
  const bodySide = world === h.a ? h.b : h.a
  if (!world || !bodySide.body || !bodySide.body.dynamic) return null
  const p = world.body ? { x: world.body.staticPos.x + cos(world.body.staticAngle) * world.local.x - sin(world.body.staticAngle) * world.local.y, y: world.body.staticPos.y + sin(world.body.staticAngle) * world.local.x + cos(world.body.staticAngle) * world.local.y } : world.local
  return { x: p.x, y: p.y, body: bodySide.body }
}

function impactSituations(rec: Recording, out: Situation[]) {
  const sys = rec.system, model = sys.model
  const n = sys.n
  for (const ev of rec.events) {
    if (!ev.impact) continue
    const pts = ev.impact.points.filter(p => p.kind === 'contact' && p.impulse > 1e-15)
    if (pts.length !== 1) continue
    const p = pts[0]
    const pair = p.pair!, f = p.feature!
    const noFriction = !(p.tangentImpulse !== undefined && Math.abs(p.tangentImpulse) > 0)
    const frictionCond = cond('frictionless', '碰撞时接触面无摩擦冲量（光滑或无相对滑动趋势）', noFriction, noFriction ? '' : `摩擦冲量 ${Math.abs(p.tangentImpulse!).toPrecision(4)} N·s`)
    const next = rec.events.find(e => e.t > ev.t + 1e-12 && e.changes.some(c => c.bodies.includes(pair.X.id) || c.bodies.includes(pair.Y.id)))
    const t1 = next ? next.t : (rec.frameCount - 1) * rec.dt
    const nAB = { x: p.nx, y: p.ny } // From feature B to feature A
    const XA = f.A.body, XB = f.B.body
    const before = ev.before, after = ev.after
    const vel = (X: Float64Array, b: BodyModel) => ({ x: X[3 * n + 3 * b.index], y: X[3 * n + 3 * b.index + 1] })
    const central = (b: BodyModel) => {
      if (b.invInertia === 0) return true
      const bx = before[3 * b.index], by = before[3 * b.index + 1]
      return Math.abs((p.cx - bx) * nAB.y - (p.cy - by) * nAB.x) < 1e-9
    }
    if (XA.dynamic && XB.dynamic) {
      const atA = attached(model, XA.id), atB = attached(model, XB.id)
      const hingedA = atA.hinges.length === 1 && noConnectors({ ...atA, hinges: [] }), hingedB = atB.hinges.length === 1 && noConnectors({ ...atB, hinges: [] })
      if (noConnectors(atA) && noConnectors(atB) && central(XA) && central(XB)) {
        // Two free bodies: number them by scene order
        const [b1, b2] = XA.global < XB.global ? [XA, XB] : [XB, XA]
        const n12 = b1 === XB ? nAB : { x: -nAB.x, y: -nAB.y } // From body 1 to body 2
        const t12 = { x: -n12.y, y: n12.x }
        const v1 = vel(before, b1), v2 = vel(before, b2), w1a = vel(after, b1), w2a = vel(after, b2)
        const u1 = v1.x * n12.x + v1.y * n12.y, u2 = v2.x * n12.x + v2.y * n12.y
        const w1 = v1.x * t12.x + v1.y * t12.y, w2 = v2.x * t12.x + v2.y * t12.y
        const keOf = (X: Float64Array) => kineticEnergy({ ...sys, model: { ...model, dynamic: [b1, b2] } } as System, X)
        const oblique = Math.abs(w1) > 1e-9 || Math.abs(w2) > 1e-9
        const e = p.restitution
        const ang = (() => {
          const a = Math.sqrt(sq(w1a.x) + sq(w1a.y)), b = Math.sqrt(sq(w2a.x) + sq(w2a.y))
          if (a < 1e-12 || b < 1e-12) return null
          return acos(Math.max(-1, Math.min(1, (w1a.x * w2a.x + w1a.y * w2a.y) / (a * b))))
        })()
        const sample: Sample = {
          vars: {
            m1: V(b1.mass, 'kg', 'm_1', `${b1.name}质量`), m2: V(b2.mass, 'kg', 'm_2', `${b2.name}质量`), e: V(e, '', 'e', '恢复系数'),
            u1: V(u1, 'm/s', 'u_1', `碰前${b1.name}法向速度`), u2: V(u2, 'm/s', 'u_2', `碰前${b2.name}法向速度`),
            w1: V(w1, 'm/s', 'v_{1t}', `碰前${b1.name}切向速度`),
            p0x: V(b1.mass * v1.x + b2.mass * v2.x, 'kg·m/s', 'p_x', '碰前总动量 x'), p0y: V(b1.mass * v1.y + b2.mass * v2.y, 'kg·m/s', 'p_y', '碰前总动量 y')
          },
          measures: {
            v1: M(w1a.x * n12.x + w1a.y * n12.y, 'm/s', `碰后${b1.name}法向速度`), v2: M(w2a.x * n12.x + w2a.y * n12.y, 'm/s', `碰后${b2.name}法向速度`),
            px: M(b1.mass * w1a.x + b2.mass * w2a.x, 'kg·m/s', '碰后总动量 x'), py: M(b1.mass * w1a.y + b2.mass * w2a.y, 'kg·m/s', '碰后总动量 y'),
            dE: M(keOf(before) - keOf(after), 'J', '损失的动能'), w1after: M(w1a.x * t12.x + w1a.y * t12.y, 'm/s', `碰后${b1.name}切向速度`),
            angle: M(ang, 'rad', '碰后两速度夹角')
          },
          conditions: [
            cond('isolated', '碰撞瞬间系统不受外界冲量', true),
            cond('oblique', '斜碰（有切向分量）', oblique, oblique ? '' : '正碰'),
            cond('equalMassElasticRest', '等质量、弹性、被碰球静止', Math.abs(b1.mass - b2.mass) <= 1e-12 * b1.mass && e === 1 && Math.abs(u2) < 1e-12 && Math.abs(w2) < 1e-12),
            frictionCond
          ]
        }
        out.push({ key: `col:${ev.index}`, type: 'collision', title: `${b1.name}与${b2.name}碰撞（e = ${e}）`, t0: ev.t, t1, tEvent: ev.t, bodies: [b1.id, b2.id], sample: () => sample })
      } else if ((hingedA && noConnectors(atB) && central(XB)) || (hingedB && noConnectors(atA) && central(XA))) {
        const H = hingedA ? XA : XB, P = hingedA ? XB : XA
        const piv = hingePivot(sys, (hingedA ? atA : atB).hinges[0])
        if (!piv || piv.body !== H) continue
        // Normal pointing from the ball into the hinged body
        const nIn = P === XA ? { x: -nAB.x, y: -nAB.y } : nAB
        const vP = vel(before, P), vPa = vel(after, P)
        const d = Math.abs((p.cx - piv.x) * nIn.y - (p.cy - piv.y) * nIn.x)
        const hx = before[3 * H.index] - piv.x, hy = before[3 * H.index + 1] - piv.y
        const Ip = H.inertia + H.mass * (hx * hx + hy * hy)
        const omega0 = before[3 * n + 3 * H.index + 2]
        const sample: Sample = {
          vars: {
            m: V(P.mass, 'kg', 'm', `${P.name}质量`), Ip: V(Ip, 'kg·m²', 'I', `${H.name}对转轴的转动惯量`), d: V(d, 'm', 'd', '碰撞力作用线到转轴的距离'),
            v: V(vP.x * nIn.x + vP.y * nIn.y, 'm/s', 'v', `碰前${P.name}法向速度`), e: V(p.restitution, '', 'e', '恢复系数'),
            L0: V(lzAbout(sys, before, piv.x, piv.y, [P.id, H.id]), 'kg·m²/s', 'L', '碰前对转轴角动量')
          },
          measures: {
            vAfter: M(vPa.x * nIn.x + vPa.y * nIn.y, 'm/s', `碰后${P.name}法向速度`),
            omegaAfter: M(Math.abs(after[3 * n + 3 * H.index + 2]), 'rad/s', `碰后${H.name}角速度大小`),
            LAfter: M(lzAbout(sys, after, piv.x, piv.y, [P.id, H.id]), 'kg·m²/s', '碰后对转轴角动量')
          },
          conditions: [cond('rest', `${H.name}碰前静止`, Math.abs(omega0) < 1e-12), frictionCond]
        }
        out.push({ key: `hi:${ev.index}`, type: 'hinged-impact', title: `${P.name}撞击绕轴转动的${H.name}`, t0: ev.t, t1, tEvent: ev.t, bodies: [P.id, H.id], sample: () => sample })
      }
    } else {
      const D = XA.dynamic ? XA : XB
      if (!central(D) || !noConnectors(attached(model, D.id))) continue
      const nOut = D === XA ? nAB : { x: -nAB.x, y: -nAB.y }
      const vb = vel(before, D), va = vel(after, D)
      const S = D === XA ? XB : XA
      const sample: Sample = {
        vars: { e: V(p.restitution, '', 'e', '恢复系数'), u: V(vb.x * nOut.x + vb.y * nOut.y, 'm/s', 'v_n', '碰前法向速度') },
        measures: { v: M(va.x * nOut.x + va.y * nOut.y, 'm/s', '碰后法向速度') },
        conditions: [frictionCond]
      }
      out.push({ key: `bo:${ev.index}`, type: 'bounce', title: `${D.name}与${S.name}碰撞`, t0: ev.t, t1, tEvent: ev.t, bodies: [D.id, S.id], sample: () => sample })
    }
  }
}

function projectileSituations(rec: Recording, out: Situation[]) {
  const sys = rec.system, model = sys.model
  const { g, vertical } = gravity(model)
  if (!vertical || g <= 0) return
  for (const b of model.dynamic) {
    if (!noConnectors(attached(model, b.id))) continue
    const list = runs(rec, seg => (closedUnits(seg.mode, b.id).length === 0 ? `proj:${b.id}` : null))
    for (const r of list) {
      if (r.t1 - r.t0 < 1e-9) continue
      const s0 = bodyVel(sys, r.segs[0].X0, b)
      const endEvent = eventAt(rec, r.t1)
      const lands = !!endEvent?.changes.some(c => (c.type === 'impact' || c.type === 'touch') && c.bodies.includes(b.id))
      const sEnd = bodyVel(sys, lands ? endEvent!.before : exactStateAt(rec, r.t1), b)
      let apex: { t: number; y: number } | null | undefined
      const findApex = () => {
        if (apex !== undefined) return apex
        apex = null
        if (s0.vy > 0) {
          const ts = crossings(rec, X => -X[3 * sys.n + 3 * b.index + 1], r.t0, r.t1, 1, 1)
          if (ts.length) apex = { t: ts[0], y: bodyVel(sys, exactStateAt(rec, ts[0]), b).y }
        }
        return apex
      }
      out.push({
        key: `proj:${b.id}:${r.t0}`, type: 'projectile', title: `${b.name} 的抛体运动`, t0: r.t0, t1: r.t1, bodies: [b.id],
        sample: t => {
          const st = bodyVel(sys, exactStateAt(rec, t), b)
          const ap = findApex()
          return {
            vars: {
              x0: V(s0.x, 'm', 'x_0', '初始水平位置'), y0: V(s0.y, 'm', 'y_0', '初始高度'), vx0: V(s0.vx, 'm/s', 'v_{0x}', '初速度水平分量'),
              vy0: V(s0.vy, 'm/s', 'v_{0y}', '初速度竖直分量'), g: V(g, 'm/s²', 'g', '重力加速度'), t: V(t - r.t0, 's', 't', '飞行时间'),
              y1: V(sEnd.y, 'm', 'y_1', '落点高度（质心）')
            },
            measures: {
              x: M(st.x, 'm', '水平位置'), y: M(st.y, 'm', '竖直位置'), vx: M(st.vx, 'm/s', '水平速度'), vy: M(st.vy, 'm/s', '竖直速度'),
              T: M(lands ? r.t1 - r.t0 : null, 's', '飞行时间（到落地事件）'), R: M(lands ? sEnd.x - s0.x : null, 'm', '水平射程'),
              H: M(ap ? ap.y : null, 'm', '最高点高度（质心）')
            },
            conditions: [
              cond('lands', '记录内落到接触面', lands, lands ? '' : '记录内没有落地'),
              cond('rises', '向上抛出且到达最高点', s0.vy > 0 && !!ap)
            ]
          }
        }
      })
    }
  }
}

function anchorWorld(a: { body: BodyModel | null; local: { x: number; y: number } }): { x: number; y: number } | null {
  if (!a.body) return a.local
  if (a.body.dynamic) return null
  const c = cos(a.body.staticAngle), s = sin(a.body.staticAngle)
  return { x: a.body.staticPos.x + c * a.local.x - s * a.local.y, y: a.body.staticPos.y + s * a.local.x + c * a.local.y }
}

function pendulumSituations(rec: Recording, out: Situation[]) {
  const sys = rec.system, model = sys.model
  const { g, vertical } = gravity(model)
  if (!vertical || g <= 0) return
  const n = sys.n
  for (const b of model.dynamic) {
    const at = attached(model, b.id)
    const single = at.ropes.length + at.rods.length === 1 && at.springs.length + at.hinges.length + at.forces.length === 0
    if (!single) continue
    const isRope = at.ropes.length === 1
    const c = isRope ? model.ropes[at.ropes[0]] : model.rods[at.rods[0]]
    if (isRope && model.ropes[at.ropes[0]].pulleys.length > 0) continue
    const mine = c.a.body?.id === b.id ? c.a : c.b, fixed = mine === c.a ? c.b : c.a
    const pivot = anchorWorld(fixed)
    if (!pivot || Math.abs(mine.local.x) > 1e-12 || Math.abs(mine.local.y) > 1e-12) continue
    const list = runs(rec, seg => {
      if (touchingUnits(seg.mode, b.id).length > 0) return null
      if (isRope && !seg.mode.taut[at.ropes[0]]) return null
      return `pend:${b.id}`
    })
    for (const r of list) {
      const L = c.length
      const phiOf = (X: Float64Array) => atan2(X[3 * b.index] - pivot.x, pivot.y - X[3 * b.index + 1])
      const X0 = r.segs[0].X0
      const v0sq = sq(X0[3 * n + 3 * b.index]) + sq(X0[3 * n + 3 * b.index + 1])
      const cosM = cos(phiOf(X0)) - v0sq / (2 * g * L)
      // A rope rising above the horizontal goes slack, a rod that passes the top turns round: both are
      // vertical circular motion (verticalCircleSituations), not a pendulum
      if (isRope ? cosM < 0 : cosM <= -1) continue
      const oscillates = cosM > -1
      const theta0 = oscillates ? acos(Math.min(1, cosM)) : Math.PI
      let cache: { T: number | null; vB: number | null; TB: number | null } | null = null
      const measure = () => {
        if (cache) return cache
        const ts = crossings(rec, X => X[3 * b.index] - pivot.x, r.t0, r.t1, 1, 3)
        let vB: number | null = null, TB: number | null = null
        const all = crossings(rec, X => X[3 * b.index] - pivot.x, r.t0, r.t1, 0, 1)
        if (all.length) {
          const o = observeAt(rec, all[0])
          vB = Math.sqrt(sq(o.X[3 * n + 3 * b.index]) + sq(o.X[3 * n + 3 * b.index + 1]))
          TB = isRope ? o.sol.ropeTension[at.ropes[0]] : null
        }
        cache = { T: ts.length >= 2 ? ts[1] - ts[0] : null, vB, TB }
        return cache
      }
      const deg = theta0 / DEG
      const small: Condition = { id: 'smallAngle', label: '小角度近似（θ₀ ≤ 5°）', status: deg <= 5 ? 'ok' : deg <= 10 ? 'approx' : 'fail', detail: `θ₀ = ${deg.toPrecision(4)}°` }
      out.push({
        key: `pend:${b.id}:${r.t0}`, type: 'pendulum', title: `${b.name} 的单摆运动`, t0: r.t0, t1: r.t1, bodies: [b.id],
        sample: () => {
          const m = measure()
          return {
            vars: { L: V(L, 'm', 'L', '摆长（到球心）'), m: V(b.mass, 'kg', 'm', '摆球质量'), g: V(g, 'm/s²', 'g', '重力加速度'), theta0: V(theta0, 'rad', '\\theta_0', '振幅（最大摆角）') },
            measures: {
              T: M(m.T, 's', '周期（相邻两次同向过最低点）', m.T === null ? '记录时长不足一个完整周期' : undefined),
              vBottom: M(m.vB, 'm/s', '过最低点的速率'), TBottom: M(m.TB, 'N', '过最低点时绳的拉力')
            },
            conditions: [small, cond('taut', '绳始终张紧', true), cond('oscillates', '往复摆动（未做圆周运动）', oscillates)]
          }
        }
      })
    }
  }
}

function springSituations(rec: Recording, out: Situation[]) {
  const sys = rec.system, model = sys.model
  const gv = model.settings.gravity
  const n = sys.n
  for (const b of model.dynamic) {
    const at = attached(model, b.id)
    if (at.springs.length !== 1 || at.ropes.length + at.rods.length + at.hinges.length + at.forces.length > 0) continue
    const sp = model.springs[at.springs[0]]
    if (sp.damping !== 0) continue
    const mine = sp.a.body?.id === b.id ? sp.a : sp.b, fixed = mine === sp.a ? sp.b : sp.a
    const P = anchorWorld(fixed)
    if (!P) continue
    const list = runs(rec, seg => {
      const us = closedUnits(seg.mode, b.id)
      if (us.some(u => u.friction !== 'none' || otherBody(u, b.id).dynamic)) return null
      return `spring:${b.id}`
    })
    for (const r of list) {
      const X0 = r.segs[0].X0
      const poses = computePoses(model, X0)
      const pa = poses[b.global]
      const ax = pa.x + pa.c * mine.local.x - pa.s * mine.local.y, ay = pa.y + pa.s * mine.local.x + pa.c * mine.local.y
      const len = Math.sqrt(sq(ax - P.x) + sq(ay - P.y))
      const ux = (ax - P.x) / len, uy = (ay - P.y) / len
      const supported = closedUnits(r.segs[0].mode, b.id).length > 0
      const gAlong = gv.x * ux + gv.y * uy
      const extEq = supported ? 0 : b.mass * gAlong / sp.stiffness
      const vx = X0[3 * n + 3 * b.index], vy = X0[3 * n + 3 * b.index + 1]
      const vAlong = vx * ux + vy * uy, vPerp = -vx * uy + vy * ux
      const omega = Math.sqrt(sp.stiffness / b.mass)
      const x0 = len - sp.restLength - extEq
      const A = Math.sqrt(x0 * x0 + sq(vAlong / omega))
      const oneDim = Math.abs(vPerp) < 1e-12 && Math.abs(X0[3 * n + 3 * b.index + 2]) < 1e-12 &&
        (supported ? Math.abs(gAlong) < 1e-12 : Math.abs(gv.x * uy - gv.y * ux) < 1e-12)
      const disp = (X: Float64Array) => {
        const ps = computePoses(model, X)[b.global]
        const qx = ps.x + ps.c * mine.local.x - ps.s * mine.local.y, qy = ps.y + ps.s * mine.local.x + ps.c * mine.local.y
        return Math.sqrt(sq(qx - P.x) + sq(qy - P.y)) - sp.restLength - extEq
      }
      let cache: { T: number | null; vmax: number | null; amax: number | null } | null = null
      const measure = () => {
        if (cache) return cache
        const ts = crossings(rec, disp, r.t0, r.t1, 1, 3)
        const any = crossings(rec, disp, r.t0, r.t1, 0, 1)
        const turn = crossings(rec, X => X[3 * n + 3 * b.index] * ux + X[3 * n + 3 * b.index + 1] * uy, r.t0, r.t1, 0, 1)
        let vmax: number | null = null, amax: number | null = null
        if (any.length) { const X = exactStateAt(rec, any[0]); vmax = Math.sqrt(sq(X[3 * n + 3 * b.index]) + sq(X[3 * n + 3 * b.index + 1])) }
        const tTurn = turn.length ? turn[0] : (Math.abs(vAlong) < 1e-12 ? r.t0 : null)
        if (tTurn !== null) { const o = observeAt(rec, tTurn); amax = Math.abs(o.sol.acc[3 * b.index] * ux + o.sol.acc[3 * b.index + 1] * uy) }
        cache = { T: ts.length >= 2 ? ts[1] - ts[0] : null, vmax, amax }
        return cache
      }
      if (!oneDim) continue
      out.push({
        key: `spring:${b.id}:${r.t0}`, type: 'spring', title: `${b.name} 的简谐振动`, t0: r.t0, t1: r.t1, bodies: [b.id],
        sample: () => {
          const m = measure()
          return {
            vars: { k: V(sp.stiffness, 'N/m', 'k', '劲度系数'), m: V(b.mass, 'kg', 'm', '振子质量'), A: V(A, 'm', 'A', '振幅') },
            measures: {
              T: M(m.T, 's', '周期', m.T === null ? '记录时长不足一个完整周期' : undefined), vmax: M(m.vmax, 'm/s', '过平衡位置的速率'), amax: M(m.amax, 'm/s²', '最大位移处加速度大小')
            },
            conditions: [cond('undamped', '无阻尼、无摩擦', true)]
          }
        }
      })
    }
  }
}

function rotationSituations(rec: Recording, out: Situation[]) {
  const sys = rec.system, model = sys.model
  const { g, vertical } = gravity(model)
  if (!vertical) return
  const n = sys.n
  model.hinges.forEach((_, hi) => {
    const piv = hingePivot(sys, hi)
    if (!piv) return
    const b = piv.body
    const at = attached(model, b.id)
    if (at.hinges.length !== 1 || at.ropes.length + at.rods.length + at.springs.length + at.forces.length > 0 || b.invInertia === 0) return
    const list = runs(rec, seg => (touchingUnits(seg.mode, b.id).length === 0 ? `rot:${b.id}` : null))
    for (const r of list) {
      const X0 = r.segs[0].X0
      const dx0 = X0[3 * b.index] - piv.x, dy0 = X0[3 * b.index + 1] - piv.y
      const d = Math.sqrt(dx0 * dx0 + dy0 * dy0)
      const Ip = b.inertia + b.mass * d * d
      const phi0 = atan2(dx0, -dy0)
      const omega0 = X0[3 * n + 3 * b.index + 2]
      const Lrod = 2 * d
      const thin = Math.abs(b.inertia - b.mass * Lrod * Lrod / 12) <= 1e-9 * b.inertia
      const fromHorizontal = Math.abs(Math.abs(phi0) - Math.PI / 2) < 1e-9 && Math.abs(omega0) < 1e-12
      let cache: { tB: number | null } | null = null
      const bottom = () => {
        if (cache) return cache
        const ts = crossings(rec, X => X[3 * b.index] - piv.x, r.t0, r.t1, 0, 4).filter(t => exactStateAt(rec, t)[3 * b.index + 1] < piv.y)
        cache = { tB: ts.length ? ts[0] : null }
        return cache
      }
      out.push({
        key: `rot:${b.id}:${r.t0}`, type: 'rotation', title: `${b.name} 绕固定轴转动`, t0: r.t0, t1: r.t1, bodies: [b.id],
        sample: t => {
          const o = observeAt(rec, t)
          const phi = atan2(o.X[3 * b.index] - piv.x, -(o.X[3 * b.index + 1] - piv.y))
          const bt = bottom()
          let omegaB: number | null = null, FB: number | null = null
          if (bt.tB !== null) {
            const ob = observeAt(rec, bt.tB)
            omegaB = Math.abs(ob.X[3 * n + 3 * b.index + 2])
            let Fx = 0, Fy = 0
            ob.sol.rows.forEach((row, k) => { if (row.kind === 'hinge' && row.owner === hi) { if (row.sub === 0) Fx = ob.sol.lambda[k]; else Fy = ob.sol.lambda[k] } })
            FB = Math.sqrt(Fx * Fx + Fy * Fy)
          }
          return {
            vars: {
              m: V(b.mass, 'kg', 'm', '质量'), Ip: V(Ip, 'kg·m²', 'I', '对转轴的转动惯量 I = I_C + md²'), d: V(d, 'm', 'd', '质心到转轴距离'),
              g: V(g, 'm/s²', 'g', '重力加速度'), phi: V(phi, 'rad', '\\varphi', '当前偏角'), phi0: V(phi0, 'rad', '\\varphi_0', '初始偏角'),
              omega0: V(omega0, 'rad/s', '\\omega_0', '初始角速度'), L: V(Lrod, 'm', 'L', '杆长')
            },
            measures: {
              alpha: M(o.sol.acc[3 * b.index + 2], 'rad/s²', '角加速度'),
              omegaBottom: M(omegaB, 'rad/s', '最低点角速度大小'), FBottom: M(FB, 'N', '最低点铰链力大小')
            },
            conditions: [
              cond('reachesBottom', '记录内转到最低点', bt.tB !== null),
              cond('thinRodFromHorizontal', '匀质细杆、从水平位置静止释放', thin && fromHorizontal, thin ? '' : '转动惯量不是 mL²/12')
            ]
          }
        }
      })
    }
  })
}

function pulleySituations(rec: Recording, out: Situation[]) {
  const sys = rec.system, model = sys.model
  const { g, vertical } = gravity(model)
  if (!vertical) return
  model.ropes.forEach((rope, ri) => {
    if (rope.pulleys.length === 0 || !rope.a.body?.dynamic || !rope.b.body?.dynamic) return
    const A = rope.a.body, B = rope.b.body
    for (const b of [A, B]) { const at = attached(model, b.id); if (at.ropes.length !== 1 || at.rods.length + at.springs.length + at.hinges.length + at.forces.length > 0) return }
    const list = runs(rec, seg => {
      if (!seg.mode.taut[ri]) return null
      const ua = closedUnits(seg.mode, A.id), ub = closedUnits(seg.mode, B.id)
      if (touchingUnits(seg.mode, A.id).length > ua.length || touchingUnits(seg.mode, B.id).length > ub.length) return null
      if (ua.length === 0 && ub.length === 0) return 'atwood'
      if (ua.length + ub.length !== 1) return null
      const u = ua[0] ?? ub[0], onTable = ua.length ? A : B
      if (otherBody(u, onTable.id).dynamic) return null
      const geo = unitGeometry(sys, seg.X0, u, onTable.id)
      if (geo.theta > 1e-9 || geo.belt !== 0) return null
      return `table:${onTable.id}:${u.friction}`
    })
    for (const r of list) {
      const seg0 = r.segs[0]
      if (r.sig === 'atwood') {
        out.push({
          key: `atw:${ri}:${r.t0}`, type: 'atwood', title: `${A.name}与${B.name}跨过定滑轮（阿特伍德机）`, t0: r.t0, t1: r.t1, bodies: [A.id, B.id],
          sample: t => {
            const o = observeAt(rec, t)
            return {
              vars: { m1: V(A.mass, 'kg', 'm_1', `${A.name}质量`), m2: V(B.mass, 'kg', 'm_2', `${B.name}质量`), g: V(g, 'm/s²', 'g', '重力加速度') },
              measures: { a: M(-o.sol.acc[3 * B.index + 1], 'm/s²', `${B.name}向下的加速度`), T: M(o.sol.ropeTension[ri], 'N', '绳的拉力') },
              conditions: []
            }
          }
        })
        continue
      }
      const [, tableId, fr] = r.sig.split(':')
      const T1 = model.byId.get(tableId)!, H = T1 === A ? B : A
      const u = closedUnits(seg0.mode, T1.id)[0]
      const mu = u.pair.material.muK
      out.push({
        key: `pul:${ri}:${r.t0}`, type: 'pulley', title: `${T1.name}与${H.name}通过定滑轮相连`, t0: r.t0, t1: r.t1, bodies: [T1.id, H.id],
        sample: t => {
          const o = observeAt(rec, t)
          return {
            vars: { m1: V(T1.mass, 'kg', 'm_1', `${T1.name}质量（桌上）`), m2: V(H.mass, 'kg', 'm_2', `${H.name}质量（悬挂）`), mu: V(mu, '', '\\mu', '桌面动摩擦因数'), g: V(g, 'm/s²', 'g', '重力加速度') },
            measures: { a: M(-o.sol.acc[3 * H.index + 1], 'm/s²', `${H.name}向下的加速度`), T: M(o.sol.ropeTension[ri], 'N', '绳的拉力') },
            conditions: [cond('moving', '系统在运动（桌上物块滑动）', fr === 'slide' || fr === 'none', fr === 'stick' ? '静摩擦足以使系统静止' : '')]
          }
        }
      })
    }
  })
}

function conservationSituations(rec: Recording, out: Situation[]) {
  const sys = rec.system, model = sys.model
  const T = rec.reducedFrom != null ? Math.min(rec.reducedFrom, (rec.frameCount - 1) * rec.dt) : (rec.frameCount - 1) * rec.dt
  if (T <= 0 && rec.reducedFrom != null) return
  const balance0 = ledgerBalance(rec, observeAt(rec, 0))
  out.push({
    key: 'energy', type: 'energy', title: '能量账本', t0: 0, t1: T, bodies: [],
    sample: t => {
      const o = observeAt(rec, t)
      return { vars: { E0: V(balance0, 'J', 'E_0', '初始总能量') }, measures: { balance: M(ledgerBalance(rec, o), 'J', '当前账本合计') }, conditions: [] }
    }
  })
  const gv = model.settings.gravity
  const free = gv.x === 0 && gv.y === 0 && model.forces.length === 0 &&
    [...model.ropes, ...model.rods, ...model.springs, ...model.hinges].every(c => !!c.a.body?.dynamic && !!c.b.body?.dynamic) &&
    rec.segments.every(s => s.mode.units.every(u => u.points.length === 0 || (u.pair.X.dynamic && u.pair.Y.dynamic))) &&
    rec.events.every(e => !e.impact || e.impact.points.every(p => !p.pair || (p.pair.X.dynamic && p.pair.Y.dynamic)))
  if (free && model.dynamic.length > 0) {
    const n = sys.n
    const p = (X: Float64Array) => { let px = 0, py = 0; for (const b of model.dynamic) { px += b.mass * X[3 * n + 3 * b.index]; py += b.mass * X[3 * n + 3 * b.index + 1] } return { px, py } }
    const p0 = p(exactStateAt(rec, 0))
    out.push({
      key: 'momentum', type: 'momentum', title: '系统动量（不受外力）', t0: 0, t1: T, bodies: model.dynamic.map(b => b.id),
      sample: t => { const q = p(exactStateAt(rec, t)); return { vars: { p0x: V(p0.px, 'kg·m/s', 'p_{x0}', '初始总动量 x'), p0y: V(p0.py, 'kg·m/s', 'p_{y0}', '初始总动量 y') }, measures: { px: M(q.px, 'kg·m/s', '总动量 x'), py: M(q.py, 'kg·m/s', '总动量 y') }, conditions: [] } }
    })
  }
}

function ledgerBalance(rec: Recording, o: ObservationContext): number { return ledgerAt(rec, o.X, o.impactLoss).balance }

/** All situations of a recording, in a stable order. */
export function recognize(rec: Recording): Situation[] {
  const out: Situation[] = []
  surfaceSituations(rec, out)
  boardBlockSituations(rec, out)
  impactSituations(rec, out)
  projectileSituations(rec, out)
  pendulumSituations(rec, out)
  springSituations(rec, out)
  rotationSituations(rec, out)
  pulleySituations(rec, out)
  verticalCircleSituations(rec, out)
  movablePulleySituations(rec, out)
  wedgeSituations(rec, out)
  springPairSituations(rec, out)
  rollSlipSituations(rec, out)
  variableForceSituations(rec, out)
  conservationSituations(rec, out)
  return out
}

// ---- 26.49 models ----
/** A body hanging from a fixed point by exactly one rope (no pulleys) or rod, attached at its centre. */
function singleLink(model: Model, b: BodyModel): { isRope: boolean; index: number; length: number; pivot: { x: number; y: number } } | null {
  const at = attached(model, b.id)
  if (at.ropes.length + at.rods.length !== 1 || at.springs.length + at.hinges.length + at.forces.length !== 0) return null
  const isRope = at.ropes.length === 1
  const c = isRope ? model.ropes[at.ropes[0]] : model.rods[at.rods[0]]
  if (isRope && model.ropes[at.ropes[0]].pulleys.length > 0) return null
  const mine = c.a.body?.id === b.id ? c.a : c.b, fixed = mine === c.a ? c.b : c.a
  const pivot = anchorWorld(fixed)
  if (!pivot || Math.abs(mine.local.x) > 1e-12 || Math.abs(mine.local.y) > 1e-12) return null
  return { isRope, index: isRope ? at.ropes[0] : at.rods[0], length: c.length, pivot }
}

/** Force of rod k on its bodies, pulling (tension) positive — as the readout `<rod>.F`. */
function rodForce(o: ObservationContext, k: number): number {
  let F = 0
  o.sol.rows.forEach((r, i) => { if (r.kind === 'rod' && r.owner === k) F = -o.sol.lambda[i] })
  return F
}

/**
 * Ball on a rope or a rod moving in a vertical circle: a rope run whose energy lifts the ball above the
 * horizontal (it goes slack unless v₀ ≥ √(5gL)), a rod run that passes the top. v₀ is the speed at the
 * lowest point, from the energy of the run (equal to the initial speed when the run starts at the bottom).
 */
function verticalCircleSituations(rec: Recording, out: Situation[]) {
  const sys = rec.system, model = sys.model
  const { g, vertical } = gravity(model)
  if (!vertical || g <= 0) return
  const n = sys.n
  for (const b of model.dynamic) {
    const link = singleLink(model, b)
    if (!link) continue
    const { isRope, index, pivot } = link
    const L = link.length
    const list = runs(rec, seg => {
      if (touchingUnits(seg.mode, b.id).length > 0) return null
      if (isRope && !seg.mode.taut[index]) return null
      return `vc:${b.id}`
    })
    for (const r of list) {
      if (r.t1 - r.t0 < 1e-9) continue
      const X0 = r.segs[0].X0
      const s0 = bodyVel(sys, X0, b)
      const rx = s0.x - pivot.x, ry = s0.y - pivot.y
      const dir = Math.sign(rx * s0.vy - ry * s0.vx) || 1
      const vb2 = s0.vx * s0.vx + s0.vy * s0.vy + 2 * g * (L + ry)
      if (isRope ? vb2 <= 2 * g * L * (1 + 1e-9) : vb2 <= 4 * g * L * (1 + 1e-9)) continue
      const v0 = Math.sqrt(vb2)
      /** Angle from the lowest point, positive in the direction of motion (−π … π). */
      const phiOf = (X: Float64Array) => dir * atan2(X[3 * b.index] - pivot.x, pivot.y - X[3 * b.index + 1])
      const phi0 = phiOf(X0)
      const speed = (X: Float64Array) => Math.sqrt(sq(X[3 * n + 3 * b.index]) + sq(X[3 * n + 3 * b.index + 1]))
      const force = (o: ObservationContext) => (isRope ? o.sol.ropeTension[index] : rodForce(o, index))
      const endEvent = eventAt(rec, r.t1)
      const slack = isRope && !!endEvent?.changes.some(c => c.type === 'slack' && c.subject === model.ropes[index].id)
      const fullCircle = isRope ? vb2 >= 5 * g * L : true
      let cache: null | { bottom: { v: number; F: number } | null; top: { v: number; F: number } | null; zero: { v: number; phi: number } | null } = null
      const measure = () => {
        if (cache) return cache
        const xs = (X: Float64Array) => X[3 * b.index] - pivot.x
        let bottom: { v: number; F: number } | null = null, top: { v: number; F: number } | null = null
        const at = (t: number) => { const o = observeAt(rec, t); return { v: speed(o.X), F: force(o) } }
        if (Math.abs(phi0) < 1e-9) bottom = at(r.t0)
        for (const t of crossings(rec, xs, r.t0, r.t1, 0, 8)) {
          const below = exactStateAt(rec, t)[3 * b.index + 1] < pivot.y
          if (below && !bottom) bottom = at(t)
          if (!below && !top) top = at(t)
          if (bottom && top) break
        }
        let zero: { v: number; phi: number } | null = null
        if (!isRope) {
          const Fz = (X: Float64Array, t: number) => force(makeContextFor(rec, X, segmentAt(rec, t).mode, 0))
          const ts = crossings(rec, Fz, r.t0, r.t1, 0, 1)
          if (ts.length) { const X = exactStateAt(rec, ts[0]); zero = { v: speed(X), phi: phiOf(X) } }
        }
        cache = { bottom, top, zero }
        return cache
      }
      const slackState = slack ? endEvent!.before : null
      const common = (m: ReturnType<typeof measure>) => ({
        L: V(L, 'm', 'L', isRope ? '绳长' : '杆长'), m: V(b.mass, 'kg', 'm', '小球质量'), g: V(g, 'm/s²', 'g', '重力加速度'),
        v0: V(v0, 'm/s', 'v_0', '最低点速率（由本段机械能推算）'), phi0: V(phi0, 'rad', '\\varphi_0', '本段起点的位置角'),
        ...(m.zero ? { phiZ: V(m.zero.phi, 'rad', '\\varphi', '杆力为零处的位置角（仿真）') } : {}),
        ...(slackState ? { phiS: V(phiOf(slackState), 'rad', '\\varphi_s', '松弛处的位置角（仿真）') } : {})
      })
      if (isRope) {
        out.push({
          key: `vcr:${b.id}:${r.t0}`, type: 'vcircle-rope', title: `${b.name} 在竖直面内的圆周运动（绳）`, t0: r.t0, t1: r.t1, bodies: [b.id],
          sample: () => {
            const m = measure()
            const crit = Math.sqrt(5 * g * L)
            return {
              vars: common(m),
              measures: {
                TBottom: M(m.bottom?.F ?? null, 'N', '最低点绳的拉力'), vTop: M(m.top?.v ?? null, 'm/s', '最高点速率'), TTop: M(m.top?.F ?? null, 'N', '最高点绳的拉力'),
                v0crit: M(null, 'm/s', '临界初速度', `临界值：与本例 v₀ = ${v0.toPrecision(4)} m/s 比较`),
                tSlack: M(slack ? r.t1 - r.t0 : null, 's', '绳松弛时刻（自本段开始）'),
                phiSlack: M(slackState ? phiOf(slackState) : null, 'rad', '松弛处的位置角（自最低点）'),
                hSlack: M(slackState ? slackState[3 * b.index + 1] - pivot.y : null, 'm', '松弛点高出圆心'),
                vSlack: M(slackState ? speed(slackState) : null, 'm/s', '松弛时的速率')
              },
              conditions: [
                cond('fullCircle', `能通过最高点（v₀ ≥ √(5gL) = ${crit.toPrecision(4)} m/s）`, fullCircle, `本例 v₀ = ${v0.toPrecision(4)} m/s`),
                cond('slack', `绳在上半圆松弛（√(2gL) < v₀ < √(5gL)）`, slack && !fullCircle, slack ? '' : '记录内绳未松弛'),
                cond('atBottom', '经过最低点', !!m.bottom, m.bottom ? '' : '本段未经过最低点'),
                cond('reachesTop', '到达最高点', !!m.top, m.top ? '' : '本段未到达最高点')
              ]
            }
          }
        })
      } else {
        out.push({
          key: `vcd:${b.id}:${r.t0}`, type: 'vcircle-rod', title: `${b.name} 在竖直面内的圆周运动（杆）`, t0: r.t0, t1: r.t1, bodies: [b.id],
          sample: () => {
            const m = measure()
            return {
              vars: common(m),
              measures: {
                FBottom: M(m.bottom?.F ?? null, 'N', '最低点杆的拉力'), vTop: M(m.top?.v ?? null, 'm/s', '最高点速率'),
                FTop: M(m.top?.F ?? null, 'N', '最高点杆对球的力（拉为正，推为负）'), vZero: M(m.zero?.v ?? null, 'm/s', '杆力为零时的速率')
              },
              conditions: [
                cond('atBottom', '经过最低点', !!m.bottom, m.bottom ? '' : '本段未经过最低点'),
                cond('reachesTop', '到达最高点', !!m.top, m.top ? '' : '本段未到达最高点'),
                cond('forceZero', '杆力在本段改变方向', !!m.zero, m.zero ? '' : '本段杆力未过零'),
                cond('pushAtTop', `最高点杆对球为推力（v_top < √(gL) = ${Math.sqrt(g * L).toPrecision(4)} m/s）`, vb2 - 4 * g * L < g * L, '')
              ]
            }
          }
        })
      }
    }
  }
}

/**
 * Movable pulley: a rope fixed at one end runs around one movable pulley (carried by body P) and on over
 * fixed pulleys to a hanging body B; the free segments at P and at B are vertical. Then x_B = 2x_P
 * (a₁ = 2a₂), and with masses m₁ (B) and m₂ (P): a₂ = (2m₁ − m₂)g/(4m₁ + m₂), T = 3m₁m₂g/(4m₁ + m₂).
 */
function movablePulleySituations(rec: Recording, out: Situation[]) {
  const sys = rec.system, model = sys.model
  const { g, vertical } = gravity(model)
  if (!vertical) return
  model.ropes.forEach((rope, ri) => {
    if (!rope.movable) return
    const mov = rope.pulleys.map((p, i) => ({ p: p.pulley, i })).filter(x => x.p.body)
    if (mov.length !== 1) return
    const P = mov[0].p.body!, pi = mov[0].i
    const aFixed = !rope.a.body || !rope.a.body.dynamic, bFixed = !rope.b.body || !rope.b.body.dynamic
    if (aFixed === bFixed) return
    const B = (aFixed ? rope.b.body : rope.a.body)!
    if (B === P) return
    for (const body of [P, B]) {
      const at = attached(model, body.id)
      if (at.ropes.length !== 1 || at.rods.length + at.springs.length + at.hinges.length + at.forces.length > 0) return
    }
    if (P.invInertia > 0 && Math.abs(mov[0].p.position.x) > 1e-12) return
    const list = runs(rec, seg => {
      if (!seg.mode.taut[ri]) return null
      if (touchingUnits(seg.mode, P.id).length || touchingUnits(seg.mode, B.id).length) return null
      const path = ropePath(computePoses(model, seg.X0), rope)
      const uIn = path.segs[pi].u, uOut = path.segs[pi + 1].u
      const uB = aFixed ? path.segs[path.segs.length - 1].u : path.segs[0].u
      // The wheel hangs in the loop (rope comes down to it and goes up), B hangs below its segment
      if (Math.abs(uIn.x) > 1e-9 || Math.abs(uOut.x) > 1e-9 || Math.abs(uB.x) > 1e-9) return null
      if (!(uIn.y < 0 && uOut.y > 0)) return null
      if (aFixed ? !(uB.y < 0) : !(uB.y > 0)) return null
      return `mp:${ri}`
    })
    for (const r of list) {
      out.push({
        key: `mp:${ri}:${r.t0}`, type: 'movable-pulley', title: `${P.name}挂在动滑轮上，${B.name}挂在绳的另一端`, t0: r.t0, t1: r.t1, bodies: [B.id, P.id],
        sample: t => {
          const o = observeAt(rec, t)
          const a1 = -o.sol.acc[3 * B.index + 1], a2 = o.sol.acc[3 * P.index + 1]
          return {
            vars: {
              m1: V(B.mass, 'kg', 'm_1', `${B.name}质量（绳端）`), m2: V(P.mass, 'kg', 'm_2', `${P.name}质量（动滑轮下）`), g: V(g, 'm/s²', 'g', '重力加速度'),
              a1sim: V(a1, 'm/s²', 'a_1', `${B.name}向下的加速度（仿真）`), a2sim: V(a2, 'm/s²', 'a_2', `${P.name}向上的加速度（仿真）`)
            },
            measures: { a1: M(a1, 'm/s²', `${B.name}向下的加速度`), a2: M(a2, 'm/s²', `${P.name}向上的加速度`), T: M(o.sol.ropeTension[ri], 'N', '绳的拉力') },
            conditions: [cond('vertical', '动滑轮两侧及绳端的绳竖直', true)]
          }
        }
      })
    }
  })
}

/**
 * Movable wedge: block A slides on the smooth slope of wedge W, which slides on a smooth horizontal floor;
 * neither turns. Horizontal momentum is conserved and
 *   A_W = mg sinθ cosθ/(M + m sin²θ),  a_rel = (M + m)g sinθ/(M + m sin²θ),  N = Mmg cosθ/(M + m sin²θ).
 */
function wedgeSituations(rec: Recording, out: Situation[]) {
  const sys = rec.system, model = sys.model
  const { g, vertical } = gravity(model)
  if (!vertical) return
  const n = sys.n
  for (const W of model.dynamic) {
    for (const A of model.dynamic) {
      if (A === W || !noConnectors(attached(model, A.id)) || !noConnectors(attached(model, W.id))) continue
      const list = runs(rec, seg => {
        const ua = closedUnits(seg.mode, A.id), uw = closedUnits(seg.mode, W.id)
        if (ua.length !== 1 || otherBody(ua[0], A.id) !== W || touchingUnits(seg.mode, A.id).length !== 1) return null
        if (uw.length !== 2 || touchingUnits(seg.mode, W.id).length !== 2) return null
        const floor = uw.find(u => u !== ua[0])!
        const S = otherBody(floor, W.id)
        if (S.dynamic || ua[0].friction !== 'none' || floor.friction !== 'none') return null
        const gw = unitGeometry(sys, seg.X0, floor, W.id), ga = unitGeometry(sys, seg.X0, ua[0], A.id)
        if (gw.theta > 1e-9 || ga.theta < 1e-6 || gw.belt !== 0) return null
        if ((W.invInertia > 0 || A.invInertia > 0) && (Math.abs(seg.X0[3 * n + 3 * W.index + 2]) > 1e-12 || Math.abs(seg.X0[3 * n + 3 * A.index + 2]) > 1e-12)) return null
        if (W.invInertia > 0 || A.invInertia > 0) return null
        return `wd:${S.id}`
      })
      for (const r of list) {
        const seg0 = r.segs[0]
        const ua = closedUnits(seg0.mode, A.id)[0]
        const ga = unitGeometry(sys, seg0.X0, ua, A.id)
        const theta = ga.theta
        const S = model.byId.get(r.sig.split(':')[1])!
        const px = (X: Float64Array) => A.mass * X[3 * n + 3 * A.index] + W.mass * X[3 * n + 3 * W.index]
        const p0 = px(seg0.X0)
        out.push({
          key: `wd:${A.id}:${W.id}:${r.t0}`, type: 'wedge', title: `${A.name}沿可动的${W.name}下滑（${S.name}光滑）`, t0: r.t0, t1: r.t1, bodies: [A.id, W.id],
          sample: t => {
            const o = observeAt(rec, t)
            const aw = o.sol.acc[3 * W.index], aax = o.sol.acc[3 * A.index], aay = o.sol.acc[3 * A.index + 1]
            const relx = aax - aw, rely = aay
            const c = contactForces(o, A.id, W.id)
            return {
              vars: {
                M: V(W.mass, 'kg', 'M', `${W.name}质量`), m: V(A.mass, 'kg', 'm', `${A.name}质量`), theta: V(theta, 'rad', '\\theta', '斜面倾角'),
                g: V(g, 'm/s²', 'g', '重力加速度'), p0x: V(p0, 'kg·m/s', 'p_{x0}', '本阶段开始时的水平总动量')
              },
              measures: {
                A: M(Math.abs(aw), 'm/s²', `${W.name}的加速度大小`), arel: M(Math.sqrt(relx * relx + rely * rely), 'm/s²', `${A.name}相对${W.name}的加速度大小`),
                N: M(c.N, 'N', `${W.name}对${A.name}的支持力`), px: M(px(o.X), 'kg·m/s', '水平总动量')
              },
              conditions: [cond('smooth', '斜面与地面均光滑', true), cond('noRotation', '斜面与物块都不转动', true)]
            }
          }
        })
      }
    }
  }
}

/**
 * Two bodies joined by an undamped spring, free or on smooth horizontal surfaces, moving along the spring:
 * momentum is conserved, at the extreme deformation they have the common velocity and the spring stores
 * E = ½kx₀² + μ(v₁ − v₂)²/2 (μ the reduced mass); the relative motion has period 2π√(μ/k).
 */
function springPairSituations(rec: Recording, out: Situation[]) {
  const sys = rec.system, model = sys.model
  const gv = model.settings.gravity
  const n = sys.n
  model.springs.forEach((sp, si) => {
    const A = sp.a.body, B = sp.b.body
    if (!A || !B || !A.dynamic || !B.dynamic || A === B || sp.damping !== 0) return
    for (const body of [A, B]) {
      const at = attached(model, body.id)
      if (at.springs.length !== 1 || at.ropes.length + at.rods.length + at.hinges.length + at.forces.length > 0) return
    }
    const list = runs(rec, seg => {
      for (const body of [A, B]) {
        const us = closedUnits(seg.mode, body.id)
        if (touchingUnits(seg.mode, body.id).length !== us.length) return null
        for (const u of us) {
          if (u.friction !== 'none' || otherBody(u, body.id).dynamic) return null
          if (unitGeometry(sys, seg.X0, u, body.id).theta > 1e-9) return null
        }
        if (us.length === 0 && (gv.x !== 0 || gv.y !== 0)) return null
      }
      return `sp2:${si}`
    })
    for (const r of list) {
      const X0 = r.segs[0].X0
      const d0 = distanceKin(computePoses(model, X0), sp.a, sp.b)
      // Axis from A towards B
      const ux = -d0.ux, uy = -d0.uy
      const vAlong = (X: Float64Array, b: BodyModel) => X[3 * n + 3 * b.index] * ux + X[3 * n + 3 * b.index + 1] * uy
      const vPerp = (X: Float64Array, b: BodyModel) => -X[3 * n + 3 * b.index] * uy + X[3 * n + 3 * b.index + 1] * ux
      const oneDim = Math.abs(vPerp(X0, A)) < 1e-12 && Math.abs(vPerp(X0, B)) < 1e-12 && Math.abs(X0[3 * n + 3 * A.index + 2]) < 1e-12 && Math.abs(X0[3 * n + 3 * B.index + 2]) < 1e-12
      if (!oneDim) continue
      const v1 = vAlong(X0, A), v2 = vAlong(X0, B)
      const x0 = d0.value - sp.restLength
      const rel = (X: Float64Array) => vAlong(X, A) - vAlong(X, B)
      let cache: null | { ext: { t: number; v: number; E: number; x: number } | null; T: number | null } = null
      const measure = () => {
        if (cache) return cache
        const ts = crossings(rec, rel, r.t0, r.t1, 0, 3)
        let ext: { t: number; v: number; E: number; x: number } | null = null
        if (ts.length) {
          const X = exactStateAt(rec, ts[0])
          const dx = distanceKin(computePoses(model, X), sp.a, sp.b).value - sp.restLength
          ext = { t: ts[0], v: vAlong(X, A), E: 0.5 * sp.stiffness * dx * dx, x: dx }
        }
        cache = { ext, T: ts.length >= 3 ? ts[2] - ts[0] : null }
        return cache
      }
      out.push({
        key: `sp2:${si}:${r.t0}`, type: 'spring-pair', title: `${A.name}与${B.name}通过弹簧相互作用`, t0: r.t0, t1: r.t1, bodies: [A.id, B.id],
        sample: t => {
          const X = exactStateAt(rec, t)
          const m = measure()
          return {
            vars: {
              m1: V(A.mass, 'kg', 'm_1', `${A.name}质量`), m2: V(B.mass, 'kg', 'm_2', `${B.name}质量`), k: V(sp.stiffness, 'N/m', 'k', '劲度系数'),
              v1: V(v1, 'm/s', 'v_1', `本段开始时${A.name}的速度（沿弹簧）`), v2: V(v2, 'm/s', 'v_2', `本段开始时${B.name}的速度（沿弹簧）`),
              x0: V(x0, 'm', 'x_0', '本段开始时弹簧的形变量')
            },
            measures: {
              p: M(A.mass * vAlong(X, A) + B.mass * vAlong(X, B), 'kg·m/s', '沿弹簧方向的总动量'),
              vCommon: M(m.ext?.v ?? null, 'm/s', `形变最大时${A.name}的速度`), EpMax: M(m.ext?.E ?? null, 'J', '弹性势能最大值'),
              xMax: M(m.ext ? Math.abs(m.ext.x) : null, 'm', '最大形变量'), T: M(m.T, 's', '相对振动的周期', m.T === null ? '记录时长不足一个周期' : undefined)
            },
            conditions: [
              cond('restStart', '本段开始时弹簧为原长', Math.abs(x0) <= 1e-12 * Math.max(1, sp.restLength), `x₀ = ${x0.toPrecision(3)} m`),
              cond('smooth', '水平面光滑、无阻尼', true)
            ]
          }
        }
      })
    }
  })
}

/**
 * Rolling with slipping in the plane: a round body (uniform cylinder — a disc in 2D — or any I) slides on a
 * rough horizontal surface. Friction μk·mg acts against the slip u = v + ωr until u = 0 at
 * t₁ = |u₀| / (μk g (1 + mr²/I)); then it rolls at v₁ = v₀ − u₀/(1 + mr²/I). For the uniform cylinder
 * (I = ½mr²) with ω₀ = 0: t₁ = v₀/(3μk g), v₁ = 2v₀/3. (The solid sphere's 2v₀/(7μg) is a 3D result.)
 */
function rollSlipSituations(rec: Recording, out: Situation[]) {
  const sys = rec.system, model = sys.model
  const { g, vertical } = gravity(model)
  if (!vertical) return
  for (const b of model.dynamic) {
    if (b.shape.kind !== 'circle' || b.invInertia === 0 || !noConnectors(attached(model, b.id))) continue
    const rr = b.shape.radius
    const list = runs(rec, seg => {
      const us = closedUnits(seg.mode, b.id)
      if (us.length !== 1 || touchingUnits(seg.mode, b.id).length !== 1) return null
      const u = us[0], other = otherBody(u, b.id)
      if (other.dynamic || u.friction !== 'slide') return null
      const geo = unitGeometry(sys, seg.X0, u, b.id)
      if (geo.theta > 1e-9 || geo.belt !== 0) return null
      return `rs:${other.id}`
    })
    for (const r of list) {
      const X0 = r.segs[0].X0
      const s0 = bodyVel(sys, X0, b)
      const other = model.byId.get(r.sig.split(':')[1])!
      const u = closedUnits(r.segs[0].mode, b.id)[0]
      const muK = u.pair.material.muK
      const endEvent = eventAt(rec, r.t1)
      const rolls = !!endEvent?.changes.some(c => c.type === 'stick' && c.subject === u.pair.key)
      const end = rolls ? exactStateAt(rec, r.t1) : null
      const heat0 = pairAux(sys, X0, b.id, other.id).heat
      const uniform = Math.abs(b.inertia - 0.5 * b.mass * rr * rr) <= 1e-12 * b.inertia
      out.push({
        key: `rs:${b.id}:${r.t0}`, type: 'roll-slip', title: `${b.name} 在${other.name}上边滚边滑`, t0: r.t0, t1: r.t1, bodies: [b.id, other.id],
        sample: t => {
          const o = observeAt(rec, t)
          return {
            vars: {
              m: V(b.mass, 'kg', 'm', '质量'), r: V(rr, 'm', 'r', '半径'), I: V(b.inertia, 'kg·m²', 'I', '对质心的转动惯量'),
              muK: V(muK, '', '\\mu_k', '动摩擦因数'), g: V(g, 'm/s²', 'g', '重力加速度'),
              v0: V(s0.vx, 'm/s', 'v_0', '本段开始时质心速度'), omega0: V(s0.w, 'rad/s', '\\omega_0', '本段开始时角速度（逆时针为正）')
            },
            measures: {
              a: M(o.sol.acc[3 * b.index], 'm/s²', '质心加速度'), beta: M(o.sol.acc[3 * b.index + 2], 'rad/s²', '角加速度'),
              tEnd: M(rolls ? r.t1 - r.t0 : null, 's', '开始纯滚动的时刻（自本段开始）'),
              vEnd: M(end ? bodyVel(sys, end, b).vx : null, 'm/s', '开始纯滚动时的速度'),
              heatEnd: M(end ? pairAux(sys, end, b.id, other.id).heat - heat0 : null, 'J', '打滑阶段的摩擦生热')
            },
            conditions: [
              cond('rolls', '记录内转为纯滚动', rolls, rolls ? '' : '记录内未停止打滑'),
              cond('uniformDisc', '匀质圆柱（圆盘）I = ½mr²', uniform, uniform ? '' : `本例 I = ${b.inertia.toPrecision(4)} kg·m²`),
              cond('noSpin', '放上时不转动（ω₀ = 0）且 v₀ > 0', Math.abs(s0.w) <= 1e-12 && s0.vx > 0)
            ]
          }
        }
      })
    }
  }
}

/** Recognizes F = F0·sin(ω·t) (either factor order) in the x component of a force expression. */
function sinusoid(node: Node): { F0: number; omega: number } | null {
  const numOf = (x: Node): number | null => (x.type === 'num' ? x.value : x.type === 'neg' && x.arg.type === 'num' ? -x.arg.value : null)
  if (node.type !== 'bin' || node.op !== '*') return null
  const pick = (k: Node, c: Node) => {
    const F0 = numOf(k)
    if (F0 === null || c.type !== 'call' || c.fn !== 'sin') return null
    const a = c.args[0]
    if (a.type !== 'bin' || a.op !== '*') return null
    const w = a.left.type === 'var' && a.left.name === 't' ? numOf(a.right) : a.right.type === 'var' && a.right.name === 't' ? numOf(a.left) : null
    return w === null ? null : { F0, omega: w }
  }
  return pick(node.left, node.right) ?? pick(node.right, node.left)
}

/**
 * A body driven by one variable force whose x component depends on time only, free or on a smooth
 * horizontal surface: m·aₓ = Fₓ(t). The impulse ∫Fₓdt and the displacement integral are computed
 * independently of the solver (adaptive Gauss–Kronrod on the expression, split at the recorded switches).
 */
function variableForceSituations(rec: Recording, out: Situation[]) {
  const sys = rec.system, model = sys.model
  const gv = model.settings.gravity
  if (gv.x !== 0) return
  const n = sys.n
  model.forces.forEach((f, fi) => {
    const b = f.a.body
    if (!f.expr || !b || !b.dynamic) return
    const at = attached(model, b.id)
    if (at.forces.length !== 1 || at.ropes.length + at.rods.length + at.springs.length + at.hinges.length > 0) return
    const timeOnly = f.expr.x.uses.every(u => u === 't' || u === 'm' || u === 'g')
    const list = runs(rec, seg => {
      const us = closedUnits(seg.mode, b.id)
      if (touchingUnits(seg.mode, b.id).length !== us.length || us.length > 1) return null
      for (const u of us) {
        if (u.friction !== 'none' || otherBody(u, b.id).dynamic) return null
        const geo = unitGeometry(sys, seg.X0, u, b.id)
        if (geo.theta > 1e-9 || geo.belt !== 0) return null
      }
      return `vf:${fi}`
    })
    const env = new Float64Array(ENV_SIZE)
    env[8] = b.mass; env[9] = Math.sqrt(gv.x * gv.x + gv.y * gv.y)
    const Fx = (t: number) => { env[0] = t; return f.expr!.x.fn(env, null) }
    const sw = sinusoid(f.expr.x.node)
    for (const r of list) {
      const X0 = r.segs[0].X0
      const s0 = bodyVel(sys, X0, b)
      const breaks = rec.events.filter(e => e.t > r.t0 && e.t < r.t1 && e.changes.some(c => c.type === 'switch' && c.subject === f.id)).map(e => e.t)
      const W0 = X0[sys.auxBase + AUX_WORK]
      out.push({
        key: `vf:${fi}:${r.t0}`, type: 'var-force', title: `${b.name} 受变力 ${f.name} 作用`, t0: r.t0, t1: r.t1, bodies: [b.id],
        sample: t => {
          const X = exactStateAt(rec, t)
          const J = timeOnly ? integrate(Fx, r.t0, t, breaks) : Number.NaN
          const dx = timeOnly ? integrate(s => (t - s) * Fx(s), r.t0, t, breaks) / b.mass : Number.NaN
          const vars: Record<string, VarValue> = {
            m: V(b.mass, 'kg', 'm', '质量'), v0: V(s0.vx, 'm/s', 'v_0', '本段开始时的速度 vₓ'), x0: V(s0.x, 'm', 'x_0', '本段开始时的位置 x'),
            t: V(t, 's', 't', '时刻'), t0: V(r.t0, 's', 't_0', '本段开始时刻'),
            J: V(J, 'N·s', 'I', '冲量 ∫Fₓdt（对表达式数值积分）'), dx: V(dx, 'm', '\\Delta x_F', '(1/m)∫(t−s)Fₓ(s)ds（对表达式数值积分）')
          }
          if (sw) { vars.F0 = V(sw.F0, 'N', 'F_0', '力的幅值'); vars.omega = V(sw.omega, 'rad/s', '\\omega', '角频率') }
          return {
            vars,
            measures: {
              dp: M(b.mass * (X[3 * n + 3 * b.index] - s0.vx), 'N·s', '动量变化 mΔvₓ'), v: M(X[3 * n + 3 * b.index], 'm/s', '速度 vₓ'),
              x: M(X[3 * b.index], 'm', '位置 x'), W: M(X[sys.auxBase + AUX_WORK] - W0, 'J', '变力做的功（能量账本）')
            },
            conditions: [
              cond('timeOnly', 'Fₓ 只随时间变化', timeOnly, timeOnly ? '' : `Fₓ = ${f.expr!.x.src} 含状态量，积分式不适用`),
              cond('sinusoid', 'F = F₀ sin(ωt)', !!sw, sw ? '' : `Fₓ = ${f.expr!.x.src}`),
              cond('smooth', '水平方向只受该力（光滑水平面或悬空）', true),
              cond('noVerticalWork', '竖直方向无位移（只有 Fₓ 做功）', Math.abs(s0.vy) < 1e-12 && closedUnits(r.segs[0].mode, b.id).length === 1)
            ]
          }
        }
      })
    }
  })
}
