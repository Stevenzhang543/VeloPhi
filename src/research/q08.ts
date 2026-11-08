/**
 * Research Preview, case Q08 (26.61, phase D): the free Gaussian wave packet as a versioned verification package —
 * inputs, settings, the independent reference (closed form of model Q08), at least three resolutions, the error
 * definitions, the boundary sensitivity, the tolerance with its reason, and how to recompute it elsewhere. Every
 * number comes from the core (`quantumRun`, `modelEval`); this module only forms differences.
 *
 * Scope of the preview: only this case and these conditions are claimed (a free packet, ħ = m = 1, periodic
 * split-operator grid without an absorbing layer, t ≤ 2). The time-step study in a harmonic potential is
 * self-convergence (differences of successive halvings) and is listed apart — it has no independent reference.
 */
import { quantumRun } from '../engine/labs'
import { DEFAULT_CASE, ROUNDING, gridStudy, packetReference, stepStudy } from '../teaching/convergence'
import type { PacketCase } from '../teaching/convergence'
import { ENGINE_VERSION } from '../core/scene/types'

export const RESEARCH_FORMAT = 'velophi-research-case'
export const RESEARCH_VERSION = 1

/** Acceptance: the three finest grids reach the reference within this (relative), and the norm stays 1 within it. */
export const Q08_TOL = 1e-10
/** Grid spacing of the domain study (the packet resolved; only the domain size changes). */
export const DOMAIN_DX = 0.0625

export interface DomainRow { L: number; n: number; edge: number; errX: number; errS: number; errNorm: number }

/**
 * Domain study: the same spacing on [−L/2, L/2] for growing L. `edge` is the distance from the packet's centre at
 * the end to the nearer boundary, in units of its width σ(t); a periodic grid wraps the tails that reach the edge.
 */
export function domainStudy(c: PacketCase = DEFAULT_CASE, sizes: number[] = [16, 32, 64, 128]): DomainRow[] {
  const ref = packetReference(c)
  return sizes.map(L => {
    const n = Math.round(L / DOMAIN_DX)
    const r = quantumRun({ potential: { kind: 'free' }, x0: -L / 2, x1: L / 2, n, packet: { x0: c.x0, sigma: c.s0, k0: c.p0 }, t0: 0, duration: c.t, frames: 1, absorb: 0 })
    const e = r.expect[r.expect.length - 1]
    const edge = Math.min(Math.abs(ref.x + L / 2), Math.abs(L / 2 - ref.x), Math.abs(c.x0 + L / 2)) / ref.sx
    return { L, n, edge, errX: Math.abs(e.x - ref.x) / Math.max(Math.abs(ref.x), c.s0), errS: Math.abs(e.dx - ref.sx) / ref.sx, errNorm: Math.abs(e.norm - 1) }
  })
}

/** The whole package (JSON-ready). `env` names where it was computed (host, platform). */
export function researchQ08(env: Record<string, string> = {}) {
  const c = DEFAULT_CASE
  const grid = gridStudy(c)
  const domain = domainStudy(c)
  const steps = stepStudy(c)
  const finest = grid.rows.slice(-3)
  const worst = Math.max(...finest.map(r => Math.max(r.errX, r.errS, r.errNorm)))
  return {
    format: RESEARCH_FORMAT, version: RESEARCH_VERSION, id: 'Q08-free-gaussian', engine: ENGINE_VERSION, env,
    model: 'Q08 — free Gaussian wave packet',
    units: 'reduced units ħ = m = 1; lengths in nm (the lab\'s unit), times in the matching unit',
    inputs: { x0: c.x0, p0: c.p0, sigma0: c.s0, t: c.t },
    settings: { solver: 'split-operator (Strang), Fourier spectral in space', domain: [-c.L / 2, c.L / 2], boundary: 'periodic grid, no absorbing layer', potential: 'free', frames: 1 },
    reference: {
      source: 'closed form of model Q08 (modelEval Q08 in the core): ⟨x⟩(t) = x₀ + p₀t/m, σx(t) = σ₀√(1 + (ħt/(2mσ₀²))²)',
      x: grid.reference.x, sx: grid.reference.sx, sp: grid.reference.sp
    },
    errors: {
      errX: '|⟨x⟩ − ⟨x⟩ref| / max(|⟨x⟩ref|, σ₀)',
      errS: '|σx − σx,ref| / σx,ref',
      errNorm: '|∫|ψ|² dx − 1|',
      rounding: `errors ≤ ${ROUNDING} are rounding (double precision)`
    },
    resolutions: grid.rows.map(r => ({ n: r.n, dx: r.dx, x: r.x, sx: r.sx, norm: r.norm, errX: r.errX, errS: r.errS, errNorm: r.errNorm })),
    domain,
    selfConvergence: { note: 'harmonic potential ω = 0.5, n = 256, L = 40: differences of successive step halvings (no independent reference)', rows: steps },
    tolerance: { value: Q08_TOL, rule: 'the three finest grids within the tolerance of the reference, the norm within it', reason: 'a spectral grid that resolves the packet is exact up to rounding; 1e-10 leaves four orders above double-precision rounding of a few thousand FFTs' },
    verdict: { pass: worst <= Q08_TOL, worst },
    scope: 'only this case: a free packet in a periodic box at least 32 nm wide for these inputs (see domain); not a claim for other potentials, boundaries or longer times',
    recompute: [
      'npm ci',
      'node scripts/build-napi.mjs',
      'VELOPHI_RESEARCH_OUT=q08.json npx vitest run tests/research2661.test.ts',
      'node scripts/research-compare.mjs docs/research/q08-reference.json q08.json'
    ]
  }
}

export type ResearchCase = ReturnType<typeof researchQ08>
