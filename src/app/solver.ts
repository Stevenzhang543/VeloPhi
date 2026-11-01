/**
 * The solver a scene is computed with (26.58, D137), and the comparison of two runs of the same scene (D136).
 * Pure functions: the badge, the settings panel and the comparison dialog use them, the tests check them.
 */
import type { IntegratorKind, Scene } from '../core/scene/types'

/** Exact (event-driven), reduced (Moreau–Jean, chosen or fallen back to) or the many-body solver. */
export type SolverKind = 'exact' | 'reduced' | 'soft'

export function solverKind(integrator: IntegratorKind, reducedFrom: number | null): SolverKind {
  if (integrator === 'softstep') return 'soft'
  if (integrator === 'moreau' || reducedFrom !== null) return 'reduced'
  return 'exact'
}

/** A copy of the scene computed with another integrator (the comparison runs; the user's scene is not changed). */
export function withIntegrator(scene: Scene, integrator: IntegratorKind): Scene {
  const s: Scene = JSON.parse(JSON.stringify(scene))
  s.settings.integrator = integrator
  if (s.branches) delete s.branches
  return s
}

/** Positions of the dynamic bodies over time: frames × bodies × (x, y), sampled at the same times in both runs. */
export interface Track { t: number[]; xy: Float64Array[]; energy: number[] }

/** Difference of two tracks (D136): the largest |Δr| of any body per sample, and the energy difference. */
export interface Comparison {
  t: number[]
  dr: number[]
  dE: number[]
  maxDr: number
  maxDrAt: number
  maxDrBody: number
  maxDE: number
  maxDEAt: number
}

export function compareTracks(a: Track, b: Track): Comparison {
  const n = Math.min(a.t.length, b.t.length)
  const out: Comparison = { t: [], dr: [], dE: [], maxDr: 0, maxDrAt: 0, maxDrBody: -1, maxDE: 0, maxDEAt: 0 }
  for (let k = 0; k < n; k++) {
    const pa = a.xy[k], pb = b.xy[k]
    let worst = 0, who = -1
    for (let i = 0; 2 * i + 1 < Math.min(pa.length, pb.length); i++) {
      const d = Math.hypot(pa[2 * i] - pb[2 * i], pa[2 * i + 1] - pb[2 * i + 1])
      if (d > worst) { worst = d; who = i }
    }
    const de = b.energy[k] - a.energy[k]
    out.t.push(a.t[k]); out.dr.push(worst); out.dE.push(de)
    if (worst > out.maxDr) { out.maxDr = worst; out.maxDrAt = a.t[k]; out.maxDrBody = who }
    if (Math.abs(de) > Math.abs(out.maxDE)) { out.maxDE = de; out.maxDEAt = a.t[k] }
  }
  return out
}

/** Moving bodies above which the exact solver gets slow (D135). */
export const MANY_BODIES = 12
