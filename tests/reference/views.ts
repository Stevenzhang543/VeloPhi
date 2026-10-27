/**
 * Views and teaching of 26.52 as the reference of the Rust view operations (26.53, D69): the drawing state between
 * frames (render/interp.ts), the frame's geometry and force arrows (render/renderer.ts `bodyForces`, the connector
 * part of `drawScene`, render/frame.ts), the free-body diagram (teaching/fbd.ts `fbdData`), the ticker tape
 * (teaching/tape.ts `tapeData`), the area under a curve (teaching/area.ts `areaUnder`) and the arrow scales
 * (renderer.ts `computeScales`). The code is that of 26.52 with two kinds of changes only: `Math.hypot/atan2`
 * replaced by `dmath` (as in the core), and the 26.53 fix that a variable force is drawn with its current value
 * (26.52 drew the scene's constant value) — both engines changed together. Results are shaped like the Rust results
 * (engine/CALC.md); labels are the source texts.
 */
import type { Recording, Segment } from './core/solver/simulation'
import { exactStateAt, frameIsCheap, frameState } from './core/solver/simulation'
import type { Mode, ModeSolution, System } from './core/solver/dynamics'
import { forceValue, initialState, solveMode, switchBranches } from './core/solver/dynamics'
import type { Pose } from './core/solver/kinematics'
import { anchorState, computePoses, pulleyCenter, ropeKin } from './core/solver/kinematics'
import type { BodyModel } from './core/solver/model'
import { centralForce } from './core/solver/model'
import { quantitySeries } from './core/observe/quantities'
import { atan2, hypot } from '../../src/core/math/dmath'

type ForceKind = 'gravity' | 'normal' | 'limit' | 'friction' | 'tension' | 'pin' | 'spring' | 'damper' | 'drag' | 'attract' | 'central' | 'applied'
interface ForceArrow { x: number; y: number; fx: number; fy: number; kind: ForceKind; label: string }

// ---- render/interp.ts ----

function firstEventAfter(rec: Recording, t: number): number {
  let lo = 0, hi = rec.events.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (rec.events[mid].t > t) hi = mid
    else lo = mid + 1
  }
  return lo
}

/** Drawing state at time t (clamped to the recorded range). */
export function displayStateAt(rec: Recording, t: number): Float64Array {
  const last = rec.frameCount - 1
  const tMax = last * rec.dt
  const size = rec.size
  const X = new Float64Array(size)
  if (!(t > 0)) { X.set(frameState(rec, 0)); return X }
  if (t >= tMax) { X.set(frameState(rec, last)); return X }
  const k = Math.min(last - 1, Math.floor(t / rec.dt))
  const t0 = k * rec.dt
  const t1 = t0 + rec.dt
  const s = (t - t0) / rec.dt
  if (s <= 1e-12) { X.set(frameState(rec, k)); return X }
  const i = firstEventAfter(rec, t0)
  if (i < rec.events.length && rec.events[i].t < t1) { X.set(exactStateAt(rec, t)); return X }
  const A = frameState(rec, k), B = frameState(rec, k + 1)
  const n3 = 3 * rec.system.n
  const h = rec.dt
  const s2 = s * s, s3 = s2 * s
  const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2
  for (let j = 0; j < n3; j++) X[j] = h00 * A[j] + h10 * h * A[n3 + j] + h01 * B[j] + h11 * h * B[n3 + j]
  for (let j = n3; j < size; j++) X[j] = A[j] + s * (B[j] - A[j])
  return X
}

/** render/frame.ts: the last segment with t0 ≤ t. */
function segmentAtTime(rec: Recording, t: number): Segment {
  const s = rec.segments
  let lo = 0, hi = s.length
  while (lo < hi) { const mid = (lo + hi) >> 1; if (s[mid].t0 <= t) lo = mid + 1; else hi = mid }
  return s[Math.max(0, lo - 1)]
}

// ---- render/renderer.ts `bodyForces` ----

/** The applied force k at state X in mode `mode` (26.53: the current value of a variable force). */
function appliedValue(sys: System, k: number, X: Float64Array, mode: Mode | null): { x: number; y: number } {
  const sw = mode ? (mode.sw ?? null) : sys.model.switches.length ? switchBranches(sys, X) : null
  try { return forceValue(sys, k, X, sw) } catch { return sys.model.forces[k].force }
}

export function bodyForces(sys: System, X: Float64Array, mode: Mode | null, sol: ModeSolution | null, b: BodyModel, poses: Pose[]): ForceArrow[] {
  const out: ForceArrow[] = []
  const g = sys.model.settings.gravity
  const pose = poses[b.global]
  if (g.x !== 0 || g.y !== 0) out.push({ x: pose.x, y: pose.y, fx: b.mass * g.x, fy: b.mass * g.y, label: 'G', kind: 'gravity' })
  if (sol && mode) {
    mode.units.forEach((u, ui) => {
      if (u.points.length === 0 || (u.pair.X !== b && u.pair.Y !== b)) return
      const st = sol.units[ui]
      let cx = 0, cy = 0
      u.points.forEach((p, pi) => {
        const k = st.pointKin[pi]
        const sign = p.A.body === b ? 1 : -1
        const l = st.pointLambda[pi]
        out.push({ x: k.cx, y: k.cy, fx: sign * l * k.nx, fy: sign * l * k.ny, label: u.points.length > 1 ? `N${pi + 1}` : 'N', kind: 'normal' })
        cx += k.cx / u.points.length; cy += k.cy / u.points.length
      })
      if (u.friction !== 'none' && Math.abs(st.tangent) > 1e-12) {
        const sign = u.ref.A.body === b ? 1 : -1
        out.push({ x: cx, y: cy, fx: sign * st.tangent * st.refKin.tx, fy: sign * st.tangent * st.refKin.ty, label: 'f', kind: 'friction' })
      }
    })
    sys.model.ropes.forEach((r, k) => {
      if (!mode.taut[k]) return
      const T = sol.ropeTension[k]
      if (Math.abs(T) < 1e-12) return
      const rk = ropeKin(poses, r)
      if (r.a.body === b) { const p = anchorState(poses, r.a); out.push({ x: p.px, y: p.py, fx: T * rk.path.u1.x, fy: T * rk.path.u1.y, label: 'T', kind: 'tension' }) }
      if (r.b.body === b) { const p = anchorState(poses, r.b); out.push({ x: p.px, y: p.py, fx: -T * rk.path.uLast.x, fy: -T * rk.path.uLast.y, label: 'T', kind: 'tension' }) }
    })
    sol.rows.forEach((row, k) => {
      if (row.kind !== 'limit') return
      const sl = sys.model.sliders[row.owner]
      const l = sol.lambda[k]
      if (Math.abs(l) < 1e-12) return
      if (sl.b.body === b) { const p = anchorState(poses, sl.b); out.push({ x: p.px, y: p.py, fx: row.j.bx * l, fy: row.j.by * l, label: 'F限', kind: 'limit' }) }
      if (sl.a.body === b) { const p = anchorState(poses, sl.a); out.push({ x: p.px, y: p.py, fx: row.j.ax * l, fy: row.j.ay * l, label: 'F限', kind: 'limit' }) }
    })
    sol.rows.forEach((row, k) => {
      if (row.kind !== 'hinge' && row.kind !== 'rod' && row.kind !== 'weld' && row.kind !== 'motor' && row.kind !== 'slider') return
      const pin = row.kind === 'hinge' || row.kind === 'weld' || row.kind === 'motor'
      const c = row.kind === 'hinge' ? sys.model.hinges[row.owner] : row.kind === 'weld' ? sys.model.welds[row.owner] : row.kind === 'motor' ? sys.model.motors[row.owner] : row.kind === 'slider' ? sys.model.sliders[row.owner] : sys.model.rods[row.owner]
      if (c.a.body !== b && c.b.body !== b) return
      if (pin && row.sub !== 0) return
      if (row.kind === 'slider' && row.sub !== 0) return
      if (pin) {
        let Fx = 0, Fy = 0
        sol.rows.forEach((r2, k2) => { if (r2.kind === row.kind && r2.owner === row.owner) { if (r2.sub === 0) Fx = sol.lambda[k2]; else if (r2.sub === 1) Fy = sol.lambda[k2] } })
        const side = c.a.body === b ? c.a : c.b
        const sign = c.a.body === b ? 1 : -1
        const p = anchorState(poses, side)
        out.push({ x: p.px, y: p.py, fx: sign * Fx, fy: sign * Fy, label: 'F', kind: 'pin' })
      } else {
        const side = c.a.body === b ? c.a : c.b
        const p = anchorState(poses, side)
        const l = sol.lambda[k]
        const fx = side === c.a ? row.j.ax * l : row.j.bx * l, fy = side === c.a ? row.j.ay * l : row.j.by * l
        out.push({ x: p.px, y: p.py, fx, fy, label: 'F', kind: 'pin' })
      }
    })
  }
  for (const s of sys.model.springs) {
    if (s.a.body !== b && s.b.body !== b) continue
    const pa = anchorState(poses, s.a), pb = anchorState(poses, s.b)
    const dx = pa.px - pb.px, dy = pa.py - pb.py, L = Math.sqrt(dx * dx + dy * dy)
    if (L === 0) continue
    const ux = dx / L, uy = dy / L
    const vrel = ux * (pa.vx - pb.vx) + uy * (pa.vy - pb.vy)
    const ext = L - s.restLength
    const mag = -s.stiffness * ext - s.cubic * ext * ext * ext - s.damping * vrel
    const label = s.damper ? 'F阻' : 'F弹', kind: ForceKind = s.damper ? 'damper' : 'spring'
    if (s.a.body === b) out.push({ x: pa.px, y: pa.py, fx: mag * ux, fy: mag * uy, label, kind })
    else out.push({ x: pb.px, y: pb.py, fx: -mag * ux, fy: -mag * uy, label, kind })
  }
  if (b.dragLin > 0 || b.dragQuad > 0) {
    const sp = hypot(pose.vx, pose.vy), k = b.dragLin + b.dragQuad * sp
    if (k * sp > 0) out.push({ x: pose.x, y: pose.y, fx: -k * pose.vx, fy: -k * pose.vy, label: 'f阻', kind: 'drag' })
  }
  if (sys.model.G > 0 && b.attract > 0) {
    let fx = 0, fy = 0
    for (const o of sys.model.attractors) {
      if (o === b) continue
      const po = o.dynamic ? poses[o.global] : o.gravPos
      const dx = po.x - pose.x, dy = po.y - pose.y, d2 = dx * dx + dy * dy
      if (!(d2 > 0)) continue
      const d = Math.sqrt(d2), R = b.bound + o.bound, f = d >= R ? sys.model.G * b.attract * o.attract / d2 : sys.model.G * b.attract * o.attract * d / (R * R * R)
      fx += f * dx / d; fy += f * dy / d
    }
    if (fx !== 0 || fy !== 0) out.push({ x: pose.x, y: pose.y, fx, fy, label: 'F引', kind: 'attract' })
  }
  sys.model.forces.forEach((f, k) => {
    if (f.a.body !== b) return
    const p = anchorState(poses, f.a)
    const F = appliedValue(sys, k, X, mode)
    out.push({ x: p.px, y: p.py, fx: F.x, fy: F.y, label: 'F', kind: 'applied' })
  })
  for (const c of sys.model.centrals) {
    const P0 = anchorState(poses, c.a)
    let rx = 0, ry = 0
    for (const t of c.targets) {
      const pt = poses[t.global]
      const dx = pt.x - P0.px, dy = pt.y - P0.py, r = hypot(dx, dy)
      if (!(r > 0)) continue
      const F = centralForce(c.k, c.n, r, t.bound)
      const fx = -F * dx / r, fy = -F * dy / r
      if (t === b) out.push({ x: pt.x, y: pt.y, fx, fy, label: 'F心', kind: 'central' })
      rx -= fx; ry -= fy
    }
    if (c.a.body === b && (rx !== 0 || ry !== 0)) out.push({ x: P0.px, y: P0.py, fx: rx, fy: ry, label: 'F心', kind: 'central' })
  }
  return out
}

// ---- The frame (render/frame.ts, the geometry of drawScene) ----

/** The frame view at t: geometry, accelerations and forces as the Rust `frameView` operation returns them. */
export function frameViewRef(rec: Recording, time: number, exact: boolean, forces: 'all' | string[] | null): Record<string, unknown> {
  const sys = rec.system, model = sys.model
  let X: Float64Array, mode: Mode | null = null, extra: Record<string, unknown>
  if (rec.frameCount === 0) {
    X = initialState(sys)
    extra = { t: 0, frame: -1, segment: -1 }
  } else {
    const tMax = (rec.frameCount - 1) * rec.dt
    const t = Math.max(0, Math.min(tMax, time))
    X = exact ? exactStateAt(rec, t) : displayStateAt(rec, t)
    const seg = segmentAtTime(rec, t)
    mode = seg.mode
    extra = { t, frame: Math.min(rec.frameCount - 1, Math.floor(t / rec.dt + 1e-9)), segment: seg.index }
  }
  const poses = computePoses(model, X)
  const pn: number[] = []
  for (const p of poses) pn.push(p.x, p.y, p.c, p.s, p.vx, p.vy, p.w, p.th)
  const pul: number[] = []
  for (const p of model.pulleys) { const c = pulleyCenter(poses, p); pul.push(c.x, c.y) }
  const two = (list: number[], a: Parameters<typeof anchorState>[1]) => { const p = anchorState(poses, a); list.push(p.px, p.py) }
  const springs: number[] = [], rods: number[] = [], sliders: number[] = [], centrals: number[] = [], welds: number[] = [], motors: number[] = [], hinges: number[] = [], applied: number[] = []
  for (const s of model.springs) { two(springs, s.a); two(springs, s.b) }
  for (const r of model.rods) { two(rods, r.a); two(rods, r.b) }
  for (const sl of model.sliders) {
    two(sliders, sl.a); two(sliders, sl.b)
    const A = sl.a.body && sl.a.body.dynamic ? poses[sl.a.body.global] : null
    sliders.push(A ? A.c * sl.axis.x - A.s * sl.axis.y : sl.axis.x, A ? A.s * sl.axis.x + A.c * sl.axis.y : sl.axis.y)
  }
  for (const c of model.centrals) two(centrals, c.a)
  for (const w of model.welds) two(welds, w.a)
  for (const m of model.motors) two(motors, m.a)
  for (const h of model.hinges) two(hinges, h.a)
  model.forces.forEach((f, k) => { two(applied, f.a); const F = appliedValue(sys, k, X, mode); applied.push(F.x, F.y) })
  const ropes = model.ropes.map((r, k) => {
    const path = ropeKin(poses, r).path
    const points: number[] = []
    for (const p of path.points) points.push(p.x, p.y)
    const arcs: number[] = []
    for (const a of path.arcs) arcs.push(a.x, a.y, a.r, a.from, a.to, a.wrap)
    return { points: Float64Array.from(points), arcs: Float64Array.from(arcs), length: path.length, taut: mode ? mode.taut[k] : true }
  })
  let sol: ModeSolution | null = null, solveError: unknown = null
  if (mode) { try { sol = solveMode(sys, X, mode, poses) } catch (e) { solveError = (e as { msg?: unknown }).msg ?? String(e) } }
  const targets = forces === null ? [] : model.dynamic.filter(b => forces === 'all' || forces.includes(b.id))
  return {
    X: Float64Array.from(X), poses: Float64Array.from(pn), pulleys: Float64Array.from(pul),
    anchors: { springs: Float64Array.from(springs), rods: Float64Array.from(rods), sliders: Float64Array.from(sliders), centrals: Float64Array.from(centrals), welds: Float64Array.from(welds), motors: Float64Array.from(motors), hinges: Float64Array.from(hinges), forces: Float64Array.from(applied) },
    ropes, acc: sol ? Float64Array.from(sol.acc) : null,
    forces: targets.map(b => ({ body: b.global, forces: bodyForces(sys, X, mode, sol, b, poses) })),
    solveError, ...extra
  }
}

// ---- teaching/fbd.ts `fbdData` ----

const ORDER: Record<string, number> = { gravity: 0, normal: 1, limit: 2, friction: 3, tension: 4, pin: 5, spring: 6, damper: 7, drag: 8, attract: 9, central: 10, applied: 11, other: 12 }

export function fbdRef(rec: Recording, time: number, bodyId: string): Record<string, unknown> | null {
  const sys = rec.system
  const b = sys.model.bodies.find(o => o.id === bodyId)
  if (!b || !b.dynamic) return null
  const tMax = Math.max(0, (rec.frameCount - 1) * rec.dt)
  const t = Math.max(0, Math.min(tMax, time))
  const X = exactStateAt(rec, t)
  const segs = rec.segments
  let seg = segs[0]
  for (const s of segs) { if (s.t0 <= t) seg = s; else break }
  const sol = solveMode(sys, X, seg.mode)
  const raw = bodyForces(sys, X, seg.mode, sol, b, sol.poses)
  const pose = sol.poses[b.global]
  type F = { kind: string; label: string; sub: string; x: number; y: number; fx: number; fy: number }
  const merged: F[] = []
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i]
    if (a.kind === 'normal' && /^N\d+$/.test(a.label)) {
      let fx = 0, fy = 0, wx = 0, wy = 0, w = 0, j = i
      while (j < raw.length && raw[j].kind === 'normal' && /^N\d+$/.test(raw[j].label) && (j === i || raw[j].label !== 'N1')) {
        const r = raw[j], m = hypot(r.fx, r.fy)
        fx += r.fx; fy += r.fy; wx += r.x * m; wy += r.y * m; w += m
        j++
      }
      const cx = w > 0 ? wx / w : raw.slice(i, j).reduce((s, r) => s + r.x, 0) / (j - i)
      const cy = w > 0 ? wy / w : raw.slice(i, j).reduce((s, r) => s + r.y, 0) / (j - i)
      merged.push({ kind: 'normal', label: 'N', sub: '', x: cx, y: cy, fx, fy })
      i = j - 1
      continue
    }
    merged.push({ kind: a.kind, label: a.label, sub: '', x: a.x, y: a.y, fx: a.fx, fy: a.fy })
  }
  const forces = merged.filter(f => hypot(f.fx, f.fy) > 0)
  const i3 = 3 * b.index
  const ma = { x: b.mass * sol.acc[i3], y: b.mass * sol.acc[i3 + 1] }
  let sx = 0, sy = 0, big = hypot(ma.x, ma.y)
  for (const f of forces) { sx += f.fx; sy += f.fy; big = Math.max(big, hypot(f.fx, f.fy)) }
  const rx = ma.x - sx, ry = ma.y - sy
  if (hypot(rx, ry) > 1e-6 * Math.max(big, 1e-9) && hypot(rx, ry) > 1e-12) {
    forces.push({ kind: 'other', label: 'F其他', sub: '', x: pose.x, y: pose.y, fx: rx, fy: ry })
    sx += rx; sy += ry
  }
  forces.sort((p, q) => ORDER[p.kind] - ORDER[q.kind])
  const count = new Map<string, number>()
  for (const f of forces) count.set(f.label, (count.get(f.label) ?? 0) + 1)
  const seen = new Map<string, number>()
  for (const f of forces) {
    if ((count.get(f.label) ?? 0) < 2) continue
    const k = (seen.get(f.label) ?? 0) + 1
    seen.set(f.label, k)
    f.sub = String(k)
  }
  let incline: number | null = null, best = 0
  for (const f of forces) {
    if (f.kind !== 'normal') continue
    const m = hypot(f.fx, f.fy)
    if (m > best) { best = m; incline = atan2(f.fy, f.fx) - Math.PI / 2 }
  }
  if (incline !== null) {
    while (incline > Math.PI / 2) incline -= Math.PI
    while (incline <= -Math.PI / 2) incline += Math.PI
  }
  return { bodyId: b.id, name: b.name, time: t, mass: b.mass, x: pose.x, y: pose.y, c: pose.c, s: pose.s, forces, net: { x: sx, y: sy }, ma, incline }
}

// ---- teaching/tape.ts `tapeData` ----

type TapeDirection = 'path' | 'x' | 'y'
function speedOf(X: Float64Array, n: number, i: number, dir: TapeDirection): number {
  const vx = X[3 * n + 3 * i], vy = X[3 * n + 3 * i + 1]
  return dir === 'x' ? vx : dir === 'y' ? vy : hypot(vx, vy)
}

export function tapeRef(rec: Recording, o: { body: string; direction: TapeDirection; period: number; every: number; start: number; intervals?: number }): Record<string, unknown> | null {
  const model = rec.system.model
  const b = model.bodies.find(x => x.id === o.body)
  if (!b || !b.dynamic || rec.frameCount === 0) return null
  const n = model.n, i = b.index
  const period = o.period > 0 ? o.period : 0.02
  const every = Math.max(1, Math.round(o.every))
  const T = period * every
  const tEnd = (rec.frameCount - 1) * rec.dt
  const start = Math.max(0, Math.min(tEnd, o.start))
  const maxIntervals = Math.floor((tEnd - start) / T + 1e-9)
  const intervals = Math.min(maxIntervals, Math.max(1, Math.round(o.intervals ?? 6)))
  if (intervals < 1) return null
  const dotCount = intervals * every + 1
  const dots: Array<{ t: number; s: number }> = []
  const X0 = exactStateAt(rec, start)
  const x0 = X0[3 * i], y0 = X0[3 * i + 1]
  let s = 0
  const SUB = 4
  let prev = X0
  for (let k = 0; k < dotCount; k++) {
    const t = start + k * period
    let X = prev
    if (k > 0) {
      if (o.direction === 'path') {
        const h = period / SUB
        const v: number[] = [speedOf(prev, n, i, 'path')]
        for (let j = 1; j <= SUB; j++) { X = exactStateAt(rec, Math.min(tEnd, start + (k - 1) * period + j * h)); v.push(speedOf(X, n, i, 'path')) }
        s += h / 3 * (v[0] + 4 * v[1] + 2 * v[2] + 4 * v[3] + v[4])
      } else {
        X = exactStateAt(rec, Math.min(tEnd, t))
      }
    }
    const dist = o.direction === 'x' ? X[3 * i] - x0 : o.direction === 'y' ? X[3 * i + 1] - y0 : s
    dots.push({ t, s: dist })
    prev = X
  }
  const counts = Array.from({ length: intervals + 1 }, (_v, c) => dots[c * every])
  const lengths = counts.slice(1).map((c, j) => c.s - counts[j].s)
  const velocities: Array<{ n: number; t: number; tape: number; sim: number }> = []
  for (let c = 1; c < lengths.length; c++) {
    const t = counts[c].t
    velocities.push({ n: c, t, tape: (lengths[c - 1] + lengths[c]) / (2 * T), sim: speedOf(exactStateAt(rec, t), n, i, o.direction) })
  }
  const m = Math.floor(lengths.length / 2)
  let accel: number | null = null, simAccel: number | null = null
  if (m >= 1) {
    let a1 = 0, a2 = 0
    for (let j = 0; j < m; j++) { a1 += lengths[j]; a2 += lengths[m + j] }
    accel = (a2 - a1) / (m * m * T * T)
    const t1 = counts[2 * m].t
    simAccel = (speedOf(exactStateAt(rec, t1), n, i, o.direction) - speedOf(X0, n, i, o.direction)) / (t1 - start)
  }
  return { bodyId: b.id, name: b.name, direction: o.direction, period, every, T, dots, lengths, velocities, accel, used: 2 * m, simAccel }
}

// ---- teaching/area.ts `areaUnder` ----

const INTEGRAL_OF: Record<string, string> = { vx: 'x', vy: 'y', ax: 'vx', ay: 'vy', omega: 'angle', alpha: 'omega' }

function simpson(v: ArrayLike<number>, h: number): number {
  const n = v.length - 1
  if (n <= 0) return 0
  if (n === 1) return h * (v[0] + v[1]) / 2
  const part = (a: number, b: number) => {
    let s = v[a] + v[b]
    for (let i = a + 1; i < b; i++) s += (i - a) % 2 === 1 ? 4 * v[i] : 2 * v[i]
    return s * h / 3
  }
  if (n % 2 === 0) return part(0, n)
  const m = n - 3
  const tail = 3 * h / 8 * (v[m] + 3 * v[m + 1] + 3 * v[m + 2] + v[m + 3])
  return (m > 0 ? part(0, m) : 0) + tail
}

export function areaRef(rec: Recording, id: string, t0: number, t1: number): Record<string, unknown> | null {
  if (rec.frameCount === 0) return null
  const last = rec.frameCount - 1
  if (t1 < t0) [t0, t1] = [t1, t0]
  const k0 = Math.max(0, Math.min(last, Math.round(t0 / rec.dt)))
  const k1 = Math.max(0, Math.min(last, Math.round(t1 / rec.dt)))
  if (k1 - k0 < 1 || k1 - k0 > 200_000) return null
  const dot = id.lastIndexOf('.')
  const key = dot >= 0 ? id.slice(dot + 1) : ''
  const integ = INTEGRAL_OF[key]
  const compareId = integ ? `${id.slice(0, dot)}.${integ}` : null
  const s = quantitySeries(rec, compareId ? [id, compareId] : [id], k0, k1)
  const v = s.values[0]
  const pos = Float64Array.from(v, x => (x > 0 ? x : 0)), neg = Float64Array.from(v, x => (x < 0 ? x : 0))
  const positive = simpson(pos, rec.dt), negative = simpson(neg, rec.dt)
  let compare: number | null = null
  if (compareId) {
    const c = s.values[1]
    compare = c[c.length - 1] - c[0]
    if (!Number.isFinite(compare)) compare = null
  }
  return { id, t0: k0 * rec.dt, t1: k1 * rec.dt, area: positive + negative, positive, negative, compareId: compare === null ? null : compareId, compare }
}

// ---- renderer.ts `computeScales` ----

function gravitationAt(sys: System, b: BodyModel): number {
  if (!(sys.model.G > 0) || !(b.attract > 0)) return 0
  let ax = 0, ay = 0
  for (const o of sys.model.attractors) {
    if (o === b) continue
    const dx = o.gravPos.x - b.gravPos.x, dy = o.gravPos.y - b.gravPos.y, d = hypot(dx, dy)
    if (!(d > 0)) continue
    const R = b.bound + o.bound, a = d >= R ? sys.model.G * o.attract / (d * d) : sys.model.G * o.attract * d / (R * R * R)
    ax += a * dx / d; ay += a * dy / d
  }
  return hypot(ax, ay)
}

export function vectorScalesRef(rec: Recording | null, sys: System): { v: number; a: number; f: number } {
  let vmax = 0, amax = 0
  const n = sys.n
  const g = hypot(sys.model.settings.gravity.x, sys.model.settings.gravity.y)
  const withRec = rec !== null && rec.frameCount > 0
  if (withRec) {
    const stride = Math.max(1, Math.floor(rec!.frameCount / 400))
    for (let k = 0; k < rec!.frameCount; k += stride) {
      if (!frameIsCheap(rec!, k)) continue
      const X = frameState(rec!, k)
      for (const b of sys.model.dynamic) {
        const o = 3 * n + 3 * b.index
        vmax = Math.max(vmax, hypot(X[o], X[o + 1]))
      }
    }
    amax = Math.max(g, 1)
  } else {
    for (const b of sys.model.dynamic) vmax = Math.max(vmax, hypot(b.def.velocity.x, b.def.velocity.y))
  }
  let fmax = 0
  for (const b of sys.model.dynamic) {
    const ga = gravitationAt(sys, b)
    if (withRec) amax = Math.max(amax, ga)
    fmax = Math.max(fmax, b.mass * Math.max(1, g, ga))
  }
  return { v: 70 / Math.max(vmax, 0.5), a: 55 / Math.max(amax, 0.5), f: 90 / Math.max(fmax, 1e-6) }
}
