/**
 * TypeScript reference of the event detail numbers (26.53): the data the Rust session returns for `eventData`
 * (engine/velophi-core/src/formula/event_detail.rs), computed with the 26.52 TypeScript engine and the helpers of the
 * legacy event detail view (tests/reference/legacy/eventDetail.ts). Used by the parity harness and by the test that the
 * new presentation module renders exactly what the legacy view rendered.
 */
import type { Recording, Segment } from './core/solver/simulation'
import type { ImpactPoint } from './core/solver/impact'
import { computePoses, contactKin, ropeKin } from './core/solver/kinematics'
import { energy, solveMode } from './core/solver/dynamics'
import { hypot } from '../../src/core/math/dmath'
import type { Ctx } from './legacy/eventDetail'
import { attachedImpulsive, close, effectiveW, firedValues, hingedTerms, involvedBodies, momentum, nameOf, segmentByIndex, strongeTrace } from './legacy/eventDetail'
import type { EventData, EventImpactPoint } from '../../src/formula/eventDetail'
import { defaultChoice } from '../../src/units/units'

function ctxOf(rec: Recording): Ctx {
  return { rec, sys: rec.system, lang: 'zh', digits: 4, units: defaultChoice(), tr: t => t.zh, q: () => '' }
}

function point(rec: Recording, ev: Recording['events'][number], p: ImpactPoint, single: boolean, change: number): EventImpactPoint {
  const sys = rec.system, model = sys.model, n = sys.n
  const poses = computePoses(model, ev.before)
  const o: EventImpactPoint = { change, kind: p.kind, vnBefore: p.vnBefore, vnAfter: p.vnAfter, impulse: p.impulse, restitution: p.restitution, nx: p.nx, ny: p.ny, cx: p.cx, cy: p.cy }
  if (p.tangentImpulse !== undefined) o.tangentImpulse = p.tangentImpulse
  if (p.vtBefore !== undefined) o.vtBefore = p.vtBefore
  if (p.vtAfter !== undefined) o.vtAfter = p.vtAfter
  if (p.friction !== undefined) o.friction = p.friction
  if (p.kind === 'rope') {
    const rope = model.ropes[p.rope]
    o.ropeName = rope?.name ?? ''
    if (single && rope) o.W = effectiveW(sys, poses, [ropeKin(poses, rope).j]).W[0][0]
    return o
  }
  const feature = p.feature
  const A = feature?.A.body, B = feature?.B.body
  o.nameA = A?.name ?? ''
  o.nameB = B?.name ?? ''
  const mat = p.pair?.material
  const muK = mat?.muK ?? 0, muS = Math.max(mat?.muS ?? 0, muK)
  o.muK = muK
  o.muS = muS
  const frictional = p.tangentImpulse !== undefined
  if (single && feature) {
    const kin = contactKin(feature, poses)
    const rows = frictional ? [kin.jn, kin.jt] : [kin.jn]
    const { W, constrained } = effectiveW(sys, poses, rows)
    const Wnn = W[0][0]
    o.W = W
    o.constrained = constrained
    if (constrained) {
      const c = ctxOf(rec)
      const h = hingedTerms(c, poses, A, B, kin.jn.aw, -kin.jn.bw, p.cx, p.cy, p.nx, p.ny)
      if (h && close(h.value, Wnn)) {
        // The terms as numbers (the legacy view printed them directly)
        const terms: NonNullable<EventImpactPoint['hinged']>['terms'] = []
        for (const [b, w, label] of [[A, kin.jn.aw, 'A'], [B, -kin.jn.bw, 'B']] as const) {
          if (!b || !b.dynamic) continue
          const on = (a: { body: { id: string } | null }) => a.body?.id === b.id
          const hinges = model.hinges.filter(x => on(x.a) || on(x.b))
          if (hinges.length === 0) { terms.push({ label, kind: 'free', mass: b.mass, inertia: b.inertia, w, rotates: b.invInertia > 0 && Math.abs(w) > 1e-12 }); continue }
          const hh = hinges[0]
          const mine = on(hh.a) ? hh.a : hh.b
          const pose = poses[b.global]
          const ox = pose.x + pose.c * mine.local.x - pose.s * mine.local.y, oy = pose.y + pose.s * mine.local.x + pose.c * mine.local.y
          const rx = p.cx - ox, ry = p.cy - oy
          terms.push({ label, kind: 'hinge', arm: rx * p.ny - ry * p.nx, IO: b.inertia + b.mass * ((pose.x - ox) * (pose.x - ox) + (pose.y - oy) * (pose.y - oy)) })
        }
        o.hinged = { terms, value: h.value }
      } else o.hinged = null
    } else {
      o.wTerms = []
      for (const [b, w, label] of [[A, kin.jn.aw, 'A'], [B, -kin.jn.bw, 'B']] as const) {
        if (!b || !b.dynamic) continue
        o.wTerms.push({ label, mass: b.mass, inertia: b.inertia, w, rotates: b.invInertia > 0 && Math.abs(w) > 1e-12 })
      }
    }
    if (frictional && W.length >= 2) {
      const Wnt = 0.5 * (W[0][1] + W[1][0]), Wtt = W[1][1]
      const tr = strongeTrace(p.vnBefore, p.vtBefore ?? 0, Wnn, Wnt, Wtt, p.restitution, muK, muS)
      const Jt = p.tangentImpulse ?? 0
      o.stronge = tr && close(tr.Pn, p.impulse) && close(tr.Pt, Jt) && tr.phases.length
        ? { phases: tr.phases.map(ph => ({ compression: ph.compression, s: ph.s, dPn: ph.dPn, Pn: ph.Pn, Pt: ph.Pt, vn: ph.vn, vt: ph.vt })), Pn: tr.Pn, Pt: tr.Pt, workC: tr.workC, end: tr.end }
        : null
    }
    if (!constrained) {
      const Jt = p.tangentImpulse ?? 0
      const tx = -p.ny, ty = p.nx
      o.dv = []
      for (const [b, sign, label] of [[A, 1, 'A'], [B, -1, 'B']] as const) {
        if (!b || !b.dynamic) continue
        const i = b.index
        const vx = sign * (p.impulse * p.nx + Jt * tx) / b.mass, vy = sign * (p.impulse * p.ny + Jt * ty) / b.mass
        o.dv.push({ label, sign, mass: b.mass, vx, vy, dw: b.invInertia > 0 ? ev.after[3 * n + 3 * i + 2] - ev.before[3 * n + 3 * i + 2] : null })
      }
      if (A?.dynamic && B?.dynamic && !attachedImpulsive(sys, A.id) && !attachedImpulsive(sys, B.id)) {
        o.momentum = { p0: momentum(sys, ev.before, [A.index, B.index]), p1: momentum(sys, ev.after, [A.index, B.index]) }
      }
    }
  }
  return o
}

/** The numbers of the detail view of event `index`, or null. */
export function eventDataRef(rec: Recording, index: number): EventData | null {
  const ev = rec.events[index]
  if (!ev) return null
  const sys = rec.system, model = sys.model, n = sys.n
  const prev: Segment | null = ev.index === 0 && ev.t === 0 && ev.segment === 0 ? null : segmentByIndex(rec, ev.segment - 1)
  const next = segmentByIndex(rec, ev.segment)
  const names: Record<string, string> = {}
  const switches: EventData['switches'] = []
  ev.changes.forEach((ch, ci) => {
    for (const id of [...ch.bodies, ch.subject]) names[id] = nameOf(sys, id)
    if (ch.type === 'switch') {
      const f = model.forces.find(x => x.id === ch.subject)
      const def = ch.switchIndex !== undefined ? model.switches[ch.switchIndex] : undefined
      switches.push({ change: ci, force: f?.name ?? ch.subject, kind: def?.kind ?? '', expr: f?.expr ? `Fx = ${f.expr.x.src}, Fy = ${f.expr.y.src}` : '' })
    }
  })
  let fired: EventData['fired'] = null
  if (prev && !prev.reduced && ev.triggers.length) {
    try { fired = firedValues(ctxOf(rec), ev, prev).map(f => ({ type: f.type, who: f.who, value: f.value, threshold: f.threshold, leaveNotPf: f.type === 'leave' && f.unit === '' })) } catch { fired = null }
  }
  let impact: EventData['impact'] = null
  if (ev.impact) {
    const imp = ev.impact
    const single = imp.points.length === 1
    impact = {
      single,
      points: imp.points.map(p => {
        const ch = ev.changes.findIndex(x => (p.kind === 'contact' ? x.type === 'impact' && x.subject === p.pair?.key : x.type === 'taut' && x.subject === model.ropes[p.rope]?.id))
        return point(rec, ev, p, single, ch)
      }),
      warning: imp.warning ?? null,
      energyBefore: imp.energyBefore, energyAfter: imp.energyAfter, loss: imp.loss
    }
  }
  const acc = (seg: Segment | null, X: Float64Array): Float64Array | null => {
    if (!seg) return null
    try { return solveMode(sys, X, seg.mode).acc } catch { return null }
  }
  const a0 = acc(prev, ev.before), a1 = acc(next, ev.after)
  const bodies: EventData['state']['bodies'] = []
  for (const i of involvedBodies(ctxOf(rec), ev)) {
    const b = model.dynamic[i]
    const st = (X: Float64Array) => [X[3 * i], X[3 * i + 1], X[3 * i + 2], X[3 * n + 3 * i], X[3 * n + 3 * i + 1], X[3 * n + 3 * i + 2]]
    const ek = (X: Float64Array) => 0.5 * b.mass * (X[3 * n + 3 * i] * X[3 * n + 3 * i] + X[3 * n + 3 * i + 1] * X[3 * n + 3 * i + 1]) + 0.5 * b.inertia * (b.invInertia > 0 ? X[3 * n + 3 * i + 2] * X[3 * n + 3 * i + 2] : 0)
    const accj = (a: Float64Array | null) => (a ? [a[3 * i], a[3 * i + 1], a[3 * i + 2]] : null)
    bodies.push({
      index: i, name: b.name, rotates: b.invInertia > 0, before: st(ev.before), after: st(ev.after),
      speedBefore: hypot(ev.before[3 * n + 3 * i], ev.before[3 * n + 3 * i + 1]), speedAfter: hypot(ev.after[3 * n + 3 * i], ev.after[3 * n + 3 * i + 1]),
      accBefore: accj(a0), accAfter: accj(a1), ekBefore: ek(ev.before), ekAfter: ek(ev.after)
    })
  }
  const en = (X: Float64Array) => { const e = energy(sys, X); return { kinetic: e.kinetic, gravity: e.gravity, spring: e.spring, total: e.total } }
  return {
    index: ev.index, t: ev.t, triggers: ev.triggers.slice(), changes: JSON.parse(JSON.stringify(ev.changes)), segment: ev.segment,
    hasPrev: !!prev, prevReduced: !!prev?.reduced, reduced: rec.reducedFrom != null && ev.t > rec.reducedFrom + 1e-12, dt: rec.dt,
    names, switches, fired, impact,
    state: { bodies, before: en(ev.before), after: en(ev.after) }
  }
}
