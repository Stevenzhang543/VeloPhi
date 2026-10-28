/**
 * Convergence study of the quantum lab (26.56, D108; UX task "university: Gaussian packet convergence"): the free
 * Gaussian packet of model Q08 simulated by the core's split-operator solver (`quantumRun`) on grids of increasing
 * size, compared with the model's independent closed form (`modelEval` Q08, moments by quadrature in its oracle);
 * and the time-step study in a harmonic potential, where splitting errors exist, as self-convergence (successive
 * halvings of Δt; no independent reference, labelled so). The core computes every value; this module only forms
 * differences and observed orders. Units ħ = m = 1 (lengths in the lab's nm).
 */
import { quantumRun } from '../engine/labs'
import { evalModel } from '../engine/models'

/** Errors below this are rounding (double precision with a few thousand operations). */
export const ROUNDING = 1e-13

export interface GridRow { n: number; dx: number; x: number; sx: number; norm: number; errX: number; errS: number; errNorm: number; order: number | null }
export interface StepRow { dt: number; steps: number; x: number; sx: number; diff: number | null; order: number | null }

export interface PacketCase { x0: number; p0: number; s0: number; t: number; L: number }
export const DEFAULT_CASE: PacketCase = { x0: -5, p0: 2, s0: 1, t: 2, L: 80 }

/** Reference of model Q08 from the core (⟨x⟩ and σ_x at time t). */
export function packetReference(c: PacketCase): { x: number; sx: number; sp: number } {
  const r = evalModel('Q08', { x0: c.x0, p0: c.p0, s0: c.s0, t: c.t, m: 1, hb: 1 })
  const v = (id: string) => r.outputs.find(o => o.id === id)?.value ?? NaN
  return { x: v('x'), sx: v('sx'), sp: v('sp') }
}

/** Grid study: the free packet on [−L/2, L/2] with n points (no absorbing layer). */
export function gridStudy(c: PacketCase = DEFAULT_CASE, sizes: number[] = [64, 128, 256, 512, 1024]): { reference: ReturnType<typeof packetReference>; rows: GridRow[] } {
  const ref = packetReference(c)
  const rows: GridRow[] = []
  for (const n of sizes) {
    const r = quantumRun({ potential: { kind: 'free' }, x0: -c.L / 2, x1: c.L / 2, n, packet: { x0: c.x0, sigma: c.s0, k0: c.p0 }, t0: 0, duration: c.t, frames: 1, absorb: 0 })
    const e = r.expect[r.expect.length - 1]
    const errX = Math.abs(e.x - ref.x) / Math.max(Math.abs(ref.x), c.s0)
    const errS = Math.abs(e.dx - ref.sx) / ref.sx
    const prev = rows.at(-1)
    const err = Math.max(errX, errS)
    const prevErr = prev ? Math.max(prev.errX, prev.errS) : null
    // no order once the error has reached rounding (it is then noise)
    rows.push({ n, dx: c.L / n, x: e.x, sx: e.dx, norm: e.norm, errX, errS, errNorm: Math.abs(e.norm - 1), order: prevErr !== null && err > ROUNDING && prevErr > ROUNDING ? Math.log2(prevErr / err) : null })
  }
  return { reference: ref, rows }
}

/**
 * Time-step study: the packet in a harmonic potential (ω) on [−L/2, L/2] with n points, run with N, 2N, 4N … steps
 * (Δt = t/N, below the solver's stability limit); differences of successive runs and the observed order.
 */
export function stepStudy(c: PacketCase = DEFAULT_CASE, omega = 0.5, n = 256, L = 40, counts: number[] = [600, 1200, 2400, 4800]): StepRow[] {
  const rows: StepRow[] = []
  let prevX: number | null = null
  let prevDiff: number | null = null
  for (const N of counts) {
    const r = quantumRun({ potential: { kind: 'harmonic', omega }, x0: -L / 2, x1: L / 2, n, packet: { x0: c.x0, sigma: c.s0, k0: c.p0 }, t0: 0, duration: c.t, frames: 1, absorb: 0, dt: c.t / N })
    const e = r.expect[r.expect.length - 1]
    const diff = prevX === null ? null : Math.abs(e.x - prevX)
    rows.push({ dt: r.dt ?? c.t / N, steps: r.steps ?? N, x: e.x, sx: e.dx, diff, order: diff !== null && prevDiff !== null && diff > ROUNDING && prevDiff > ROUNDING ? Math.log2(prevDiff / diff) : null })
    prevX = e.x
    prevDiff = diff
  }
  return rows
}
