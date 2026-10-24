/**
 * One-step integrators for the smooth motion inside a mode. The right-hand side does not depend on time
 * explicitly in 26.48 (constant forces). All loops run in a fixed order, so a step is a pure function of
 * (X0, h) and can be repeated exactly — the event locator and exactStateAt rely on that.
 */
export type Rhs = (X: Float64Array, out: Float64Array) => void

const C = {
  a21: 1 / 5,
  a31: 3 / 40, a32: 9 / 40,
  a41: 44 / 45, a42: -56 / 15, a43: 32 / 9,
  a51: 19372 / 6561, a52: -25360 / 2187, a53: 64448 / 6561, a54: -212 / 729,
  a61: 9017 / 3168, a62: -355 / 33, a63: 46732 / 5247, a64: 49 / 176, a65: -5103 / 18656,
  b1: 35 / 384, b3: 500 / 1113, b4: 125 / 192, b5: -2187 / 6784, b6: 11 / 84,
  e1: 71 / 57600, e3: -71 / 16695, e4: 71 / 1920, e5: -17253 / 339200, e6: 22 / 525, e7: -1 / 40
}

export interface StepResult {
  X: Float64Array
  /** Scaled error norm (≤ 1 accepted); 0 for fixed-step methods. */
  err: number
}

export interface ErrorControl { relTol: number; absTol: number; /** Number of leading entries in the norm. */ count: number }

/** Dormand–Prince 5(4). k1 = f(X0) may be passed in (first-same-as-last is not used: X1 is projected). */
export function dopri5Step(f: Rhs, X0: Float64Array, h: number, ctl: ErrorControl, k1In?: Float64Array): StepResult {
  const N = X0.length
  const k1 = k1In ?? new Float64Array(N)
  if (!k1In) f(X0, k1)
  const k2 = new Float64Array(N), k3 = new Float64Array(N), k4 = new Float64Array(N)
  const k5 = new Float64Array(N), k6 = new Float64Array(N), k7 = new Float64Array(N)
  const Y = new Float64Array(N)
  for (let i = 0; i < N; i++) Y[i] = X0[i] + h * (C.a21 * k1[i])
  f(Y, k2)
  for (let i = 0; i < N; i++) Y[i] = X0[i] + h * (C.a31 * k1[i] + C.a32 * k2[i])
  f(Y, k3)
  for (let i = 0; i < N; i++) Y[i] = X0[i] + h * (C.a41 * k1[i] + C.a42 * k2[i] + C.a43 * k3[i])
  f(Y, k4)
  for (let i = 0; i < N; i++) Y[i] = X0[i] + h * (C.a51 * k1[i] + C.a52 * k2[i] + C.a53 * k3[i] + C.a54 * k4[i])
  f(Y, k5)
  for (let i = 0; i < N; i++) Y[i] = X0[i] + h * (C.a61 * k1[i] + C.a62 * k2[i] + C.a63 * k3[i] + C.a64 * k4[i] + C.a65 * k5[i])
  f(Y, k6)
  const X1 = new Float64Array(N)
  for (let i = 0; i < N; i++) X1[i] = X0[i] + h * (C.b1 * k1[i] + C.b3 * k3[i] + C.b4 * k4[i] + C.b5 * k5[i] + C.b6 * k6[i])
  f(X1, k7)
  let sum = 0
  for (let i = 0; i < ctl.count; i++) {
    const e = h * (C.e1 * k1[i] + C.e3 * k3[i] + C.e4 * k4[i] + C.e5 * k5[i] + C.e6 * k6[i] + C.e7 * k7[i])
    const sc = ctl.absTol + ctl.relTol * Math.max(Math.abs(X0[i]), Math.abs(X1[i]))
    const r = e / sc
    sum += r * r
  }
  return { X: X1, err: Math.sqrt(sum / Math.max(1, ctl.count)) }
}

/** Classical Runge–Kutta, fixed step. */
export function rk4Step(f: Rhs, X0: Float64Array, h: number, k1In?: Float64Array): StepResult {
  const N = X0.length
  const k1 = k1In ?? new Float64Array(N)
  if (!k1In) f(X0, k1)
  const k2 = new Float64Array(N), k3 = new Float64Array(N), k4 = new Float64Array(N)
  const Y = new Float64Array(N)
  for (let i = 0; i < N; i++) Y[i] = X0[i] + 0.5 * h * k1[i]
  f(Y, k2)
  for (let i = 0; i < N; i++) Y[i] = X0[i] + 0.5 * h * k2[i]
  f(Y, k3)
  for (let i = 0; i < N; i++) Y[i] = X0[i] + h * k3[i]
  f(Y, k4)
  const X1 = new Float64Array(N)
  for (let i = 0; i < N; i++) X1[i] = X0[i] + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])
  return { X: X1, err: 0 }
}

/**
 * Semi-implicit (symplectic) Euler: v₁ = v₀ + h·a(X₀), q₁ = q₀ + h·v₁. First order; offered for teaching
 * how integrator choice affects energy drift.
 */
export function eulerStep(f: Rhs, X0: Float64Array, h: number, nq: number, k1In?: Float64Array): StepResult {
  const N = X0.length
  const k1 = k1In ?? new Float64Array(N)
  if (!k1In) f(X0, k1)
  const X1 = new Float64Array(N)
  for (let i = 0; i < nq; i++) X1[nq + i] = X0[nq + i] + h * k1[nq + i]
  for (let i = 0; i < nq; i++) X1[i] = X0[i] + h * X1[nq + i]
  for (let i = 2 * nq; i < N; i++) X1[i] = X0[i] + h * k1[i]
  return { X: X1, err: 0 }
}
