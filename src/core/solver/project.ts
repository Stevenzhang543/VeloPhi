/**
 * Constraint projection. The integrator keeps the constraints only up to its local error; when the drift of
 * an active constraint exceeds TOL.drift, positions and velocities are moved back onto the constraint
 * manifold along the mass-weighted shortest path (Δq = −M⁻¹Jᵀ(JM⁻¹Jᵀ)⁻¹g). The size of every correction is
 * recorded so the user can see it.
 */
import { solveDense } from '../math/linalg'
import type { RowJ } from './kinematics'
import { computePoses, contactKin, featureProbeKey, probeValue } from './kinematics'
import type { Mode, Row, System } from './dynamics'
import { TOL, addRow, buildRows, rowMinvRow } from './dynamics'
import { inRegion } from './modes'

export interface ProjectionInfo { position: number; velocity: number }

function correction(sys: System, rows: Array<{ j: RowJ; err: number }>): Float64Array | null {
  const m = rows.length
  if (m === 0) return null
  const W = new Float64Array(m * m), b = new Float64Array(m)
  for (let r = 0; r < m; r++) {
    for (let k = 0; k < m; k++) W[r * m + k] = rowMinvRow(sys.model, rows[r].j, rows[k].j)
    b[r] = -rows[r].err
  }
  const res = solveDense(m, W, b)
  const G = new Float64Array(3 * sys.n)
  rows.forEach((r, i) => addRow(G, r.j, res.x[i]))
  for (const body of sys.model.dynamic) {
    const i = body.index
    G[3 * i] *= body.invMass; G[3 * i + 1] *= body.invMass; G[3 * i + 2] *= body.invInertia
  }
  return G
}

function positionRows(rows: Row[]): Array<{ j: RowJ; err: number }> {
  return rows.filter(r => r.kind !== 'tangent').map(r => ({ j: r.j, err: r.value }))
}

/** Project X (in place copy) onto the constraints of the mode. */
export function project(sys: System, Xin: Float64Array, mode: Mode, info?: ProjectionInfo): Float64Array {
  const n = sys.n
  let X = Xin
  for (let iter = 0; iter < 4; iter++) {
    const poses = computePoses(sys.model, X)
    const { rows } = buildRows(sys, poses, mode)
    const pr = positionRows(rows)
    let worst = 0
    for (const r of pr) worst = Math.max(worst, Math.abs(r.err))
    if (worst <= TOL.drift) break
    const d = correction(sys, pr)
    if (!d) break
    if (X === Xin) X = Float64Array.from(Xin)
    for (let k = 0; k < 3 * n; k++) X[k] += d[k]
    if (info) info.position = Math.max(info.position, worst)
  }
  for (let iter = 0; iter < 2; iter++) {
    const poses = computePoses(sys.model, X)
    const { rows } = buildRows(sys, poses, mode)
    let worst = 0
    for (const r of rows) worst = Math.max(worst, Math.abs(r.vel))
    if (worst <= TOL.velDrift) break
    const d = correction(sys, rows.map(r => ({ j: r.j, err: r.vel })))
    if (!d) break
    if (X === Xin) X = Float64Array.from(Xin)
    for (let k = 0; k < 3 * n; k++) X[3 * n + k] += d[k]
    if (info) info.velocity = Math.max(info.velocity, worst)
  }
  return X
}

/**
 * Initial overlaps (up to `limit`, e.g. a block drawn slightly into the ground) are removed by projecting
 * the penetrating contact points to zero gap. Returns the corrected state and the largest overlap removed.
 */
export function resolveInitialOverlap(sys: System, Xin: Float64Array, limit = 0.05): { X: Float64Array; removed: number; deep: string[] } {
  let X = Float64Array.from(Xin)
  let removed = 0
  for (let iter = 0; iter < 20; iter++) {
    const poses = computePoses(sys.model, X)
    // for each point (probe key) keep the feature with the largest gap among its in-region features
    const best = new Map<string, { j: RowJ; gap: number }>()
    for (const pair of sys.pairs) {
      const inside = new Set(pair.probes.filter(p => { const v = probeValue(p, poses); return v < -TOL.drift && v >= -limit }).map(p => p.key))
      if (inside.size === 0) continue
      for (const f of pair.features) {
        const key = featureProbeKey(f)
        if (!inside.has(key)) continue
        const k = contactKin(f, poses)
        if (!inRegion(k) || k.gap >= -TOL.drift || k.gap < -limit) continue
        const cur = best.get(key)
        if (!cur || k.gap > cur.gap) best.set(key, { j: k.jn, gap: k.gap })
      }
    }
    const rows = [...best.values()].map(b => ({ j: b.j, err: b.gap }))
    if (rows.length === 0) break
    for (const r of rows) removed = Math.max(removed, -r.err)
    const d = correction(sys, rows)
    if (!d) break
    for (let k = 0; k < 3 * sys.n; k++) X[k] += d[k]
  }
  if (removed === 0) X = Xin
  // overlaps deeper than the limit are not resolved; report the pairs
  const deep: string[] = []
  const poses = computePoses(sys.model, X)
  for (const pair of sys.pairs) {
    if (pair.probes.some(p => probeValue(p, poses) < -limit)) deep.push(`${pair.X.name}–${pair.Y.name}`)
  }
  return { X, removed, deep }
}
