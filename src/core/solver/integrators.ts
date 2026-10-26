/**
 * One-step integrators for the smooth motion inside a mode. Time enters the right-hand side only through
 * the optional clock entry of the state (scenes with variable forces): `clock` is its index, and every
 * stage sets it exactly to t₀ + cᵢ·h instead of integrating dt/dt = 1. All loops run in a fixed order, so
 * a step is a pure function of (X0, h) and can be repeated exactly — the event locator and exactStateAt
 * rely on that.
 */
/** Right-hand side f of Ẋ = f(X), written into `out`. */
export type Rhs = (X: Float64Array, out: Float64Array) => void

/** Dormand–Prince 5(4) coefficients: stages a, solution weights b, error weights e. */
const C = {
  a21: 1 / 5,
  a31: 3 / 40, a32: 9 / 40,
  a41: 44 / 45, a42: -56 / 15, a43: 32 / 9,
  a51: 19372 / 6561, a52: -25360 / 2187, a53: 64448 / 6561, a54: -212 / 729,
  a61: 9017 / 3168, a62: -355 / 33, a63: 46732 / 5247, a64: 49 / 176, a65: -5103 / 18656,
  b1: 35 / 384, b3: 500 / 1113, b4: 125 / 192, b5: -2187 / 6784, b6: 11 / 84,
  e1: 71 / 57600, e3: -71 / 16695, e4: 71 / 1920, e5: -17253 / 339200, e6: 22 / 525, e7: -1 / 40
}

/** Result of one integrator step. */
export interface StepResult {
  /** State at the end of the step. */
  X: Float64Array
  /** Scaled error norm (≤ 1 accepted); 0 for fixed-step methods. */
  err: number
  /** Dormand–Prince: f(X) at the end of the step (equals the next step's k1 when X is kept as it is). */
  k7?: Float64Array
}

/** Error control of an adaptive step; `count` is the number of leading state entries in the error norm. */
export interface ErrorControl { relTol: number; absTol: number; count: number }

/** Stage buffers of dopri5Step, reused between calls (never returned; a step does not call itself). */
const stageWork = new Map<number, Float64Array[]>()
function stages(N: number): Float64Array[] {
  let w = stageWork.get(N)
  if (!w) { w = [0, 1, 2, 3, 4, 5].map(() => new Float64Array(N)); stageWork.set(N, w) }
  return w
}

/**
 * Dormand–Prince 5(4). k1 = f(X0) may be passed in. The result carries k7 = f(X1), which the driver
 * reuses as the next k1 when X1 is kept unchanged (first same as last).
 */
export function dopri5Step(f: Rhs, X0: Float64Array, h: number, ctl: ErrorControl, k1In?: Float64Array, clock = -1): StepResult {
  const N = X0.length
  const k1 = k1In ?? new Float64Array(N)
  if (!k1In) f(X0, k1)
  // Stage values are overwritten completely before use, so scratch buffers give the same bits as fresh ones
  const [k2, k3, k4, k5, k6, Y] = stages(N)
  const k7 = new Float64Array(N)
  const t0 = clock >= 0 ? X0[clock] : 0
  for (let i = 0; i < N; i++) Y[i] = X0[i] + h * (C.a21 * k1[i])
  if (clock >= 0) Y[clock] = t0 + 0.2 * h
  f(Y, k2)
  for (let i = 0; i < N; i++) Y[i] = X0[i] + h * (C.a31 * k1[i] + C.a32 * k2[i])
  if (clock >= 0) Y[clock] = t0 + 0.3 * h
  f(Y, k3)
  for (let i = 0; i < N; i++) Y[i] = X0[i] + h * (C.a41 * k1[i] + C.a42 * k2[i] + C.a43 * k3[i])
  if (clock >= 0) Y[clock] = t0 + 0.8 * h
  f(Y, k4)
  for (let i = 0; i < N; i++) Y[i] = X0[i] + h * (C.a51 * k1[i] + C.a52 * k2[i] + C.a53 * k3[i] + C.a54 * k4[i])
  if (clock >= 0) Y[clock] = t0 + (8 / 9) * h
  f(Y, k5)
  for (let i = 0; i < N; i++) Y[i] = X0[i] + h * (C.a61 * k1[i] + C.a62 * k2[i] + C.a63 * k3[i] + C.a64 * k4[i] + C.a65 * k5[i])
  if (clock >= 0) Y[clock] = t0 + h
  f(Y, k6)
  const X1 = new Float64Array(N)
  for (let i = 0; i < N; i++) X1[i] = X0[i] + h * (C.b1 * k1[i] + C.b3 * k3[i] + C.b4 * k4[i] + C.b5 * k5[i] + C.b6 * k6[i])
  if (clock >= 0) X1[clock] = t0 + h
  f(X1, k7)
  let sum = 0
  for (let i = 0; i < ctl.count; i++) {
    const e = h * (C.e1 * k1[i] + C.e3 * k3[i] + C.e4 * k4[i] + C.e5 * k5[i] + C.e6 * k6[i] + C.e7 * k7[i])
    const sc = ctl.absTol + ctl.relTol * Math.max(Math.abs(X0[i]), Math.abs(X1[i]))
    const r = e / sc
    sum += r * r
  }
  return { X: X1, err: Math.sqrt(sum / Math.max(1, ctl.count)), k7 }
}

/** Classical Runge–Kutta, fixed step. */
export function rk4Step(f: Rhs, X0: Float64Array, h: number, k1In?: Float64Array, clock = -1): StepResult {
  const N = X0.length
  const k1 = k1In ?? new Float64Array(N)
  if (!k1In) f(X0, k1)
  const k2 = new Float64Array(N), k3 = new Float64Array(N), k4 = new Float64Array(N)
  const Y = new Float64Array(N)
  const t0 = clock >= 0 ? X0[clock] : 0
  for (let i = 0; i < N; i++) Y[i] = X0[i] + 0.5 * h * k1[i]
  if (clock >= 0) Y[clock] = t0 + 0.5 * h
  f(Y, k2)
  for (let i = 0; i < N; i++) Y[i] = X0[i] + 0.5 * h * k2[i]
  if (clock >= 0) Y[clock] = t0 + 0.5 * h
  f(Y, k3)
  for (let i = 0; i < N; i++) Y[i] = X0[i] + h * k3[i]
  if (clock >= 0) Y[clock] = t0 + h
  f(Y, k4)
  const X1 = new Float64Array(N)
  for (let i = 0; i < N; i++) X1[i] = X0[i] + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])
  if (clock >= 0) X1[clock] = t0 + h
  return { X: X1, err: 0 }
}

/**
 * Semi-implicit (symplectic) Euler: v₁ = v₀ + h·a(X₀), q₁ = q₀ + h·v₁. First order; offered for teaching
 * how integrator choice affects energy drift.
 */
export function eulerStep(f: Rhs, X0: Float64Array, h: number, nq: number, k1In?: Float64Array, clock = -1): StepResult {
  const N = X0.length
  const k1 = k1In ?? new Float64Array(N)
  if (!k1In) f(X0, k1)
  const X1 = new Float64Array(N)
  for (let i = 0; i < nq; i++) X1[nq + i] = X0[nq + i] + h * k1[nq + i]
  for (let i = 0; i < nq; i++) X1[i] = X0[i] + h * X1[nq + i]
  for (let i = 2 * nq; i < N; i++) X1[i] = X0[i] + h * k1[i]
  if (clock >= 0) X1[clock] = X0[clock] + h
  return { X: X1, err: 0 }
}

/** Two-stage Gauss–Legendre coefficients (order 4): nodes c, matrix A, weights ½, ½. */
const S3 = Math.sqrt(3)
const GL = { c1: 0.5 - S3 / 6, c2: 0.5 + S3 / 6, a11: 0.25, a12: 0.25 - S3 / 6, a21: 0.25 + S3 / 6, a22: 0.25 }
/** Fixed-point iterations of the Gauss–Legendre stage equations at most. */
export const GAUSS_ITERATIONS = 50
/** Convergence of a stage component: |change| ≤ GAUSS_TOL·max(1, |value|). */
export const GAUSS_TOL = 4 * Number.EPSILON

/**
 * Two-stage Gauss–Legendre (26.52, D61): implicit, fourth order, symplectic — the energy of a conservative system stays
 * bounded over long runs instead of drifting. The stage equations Kᵢ = f(X₀ + h·Σⱼ aᵢⱼKⱼ) are solved by fixed-point
 * iteration from Kᵢ = f(X₀): every component must change by at most GAUSS_TOL·max(1, |Kᵢ|) in an iteration, or
 * GAUSS_ITERATIONS are done. Every loop runs in a fixed order, so the step is a pure function of (X₀, h).
 */
export function gauss4Step(f: Rhs, X0: Float64Array, h: number, k1In?: Float64Array, clock = -1): StepResult {
  const N = X0.length
  const k0 = k1In ?? new Float64Array(N)
  if (!k1In) f(X0, k0)
  const K1 = Float64Array.from(k0), K2 = Float64Array.from(k0)
  const N1 = new Float64Array(N), N2 = new Float64Array(N), Y = new Float64Array(N)
  const t0 = clock >= 0 ? X0[clock] : 0
  for (let it = 0; it < GAUSS_ITERATIONS; it++) {
    for (let i = 0; i < N; i++) Y[i] = X0[i] + h * (GL.a11 * K1[i] + GL.a12 * K2[i])
    if (clock >= 0) Y[clock] = t0 + GL.c1 * h
    f(Y, N1)
    for (let i = 0; i < N; i++) Y[i] = X0[i] + h * (GL.a21 * K1[i] + GL.a22 * K2[i])
    if (clock >= 0) Y[clock] = t0 + GL.c2 * h
    f(Y, N2)
    let done = true
    for (let i = 0; i < N; i++) {
      if (!(Math.abs(N1[i] - K1[i]) <= GAUSS_TOL * Math.max(1, Math.abs(N1[i])))) done = false
      if (!(Math.abs(N2[i] - K2[i]) <= GAUSS_TOL * Math.max(1, Math.abs(N2[i])))) done = false
    }
    K1.set(N1); K2.set(N2)
    if (done) break
  }
  const X1 = new Float64Array(N)
  for (let i = 0; i < N; i++) X1[i] = X0[i] + h * (0.5 * K1[i] + 0.5 * K2[i])
  if (clock >= 0) X1[clock] = t0 + h
  return { X: X1, err: 0 }
}
