/**
 * Dense linear solves for the small systems of the constraint solver (tens of rows).
 * Gaussian elimination with complete pivoting, so rank deficiency (redundant contacts, statically
 * indeterminate supports) is detected rather than amplified: unknowns of columns that never get a pivot
 * are set to 0 and the remaining equations are checked for consistency. Loop order and pivot choice are
 * fixed (first maximum wins), so the result is deterministic.
 */

/** Result of `solveDense`. */
export interface SolveResult {
  /** Solution; unknowns of columns that never got a pivot are 0. */
  x: Float64Array
  /** Number of pivots found. */
  rank: number
  /** Rows whose equation was satisfied only up to the residual (dependent rows). */
  dependent: number[]
  /** Largest residual of a dependent row, relative to the scale of the system. */
  residual: number
  /** Whether the dependent rows hold within a relative residual of 1e-8. */
  consistent: boolean
}

/**
 * Solve A·x = b (n×n, row-major). With `consume` the inputs are used as work space (the caller does not
 * need them afterwards); the result is the same either way.
 */
export function solveDense(n: number, matrix: Float64Array, rhs: Float64Array, relativeTolerance = 1e-12, consume = false): SolveResult {
  const a = consume ? matrix : Float64Array.from(matrix)
  const b = consume ? rhs : Float64Array.from(rhs)
  const colOrder = new Int32Array(n)
  for (let i = 0; i < n; i++) colOrder[i] = i
  let scale = 0
  for (let i = 0; i < n * n; i++) { const v = Math.abs(a[i]); if (v > scale) scale = v }
  let bScale = 0
  for (let i = 0; i < n; i++) { const v = Math.abs(b[i]); if (v > bScale) bScale = v }
  const tol = (scale > 0 ? scale : 1) * relativeTolerance * Math.max(1, n)
  let rank = 0
  for (let k = 0; k < n; k++) {
    let best = -1, bi = -1, bj = -1
    for (let i = k; i < n; i++) {
      for (let j = k; j < n; j++) {
        const v = Math.abs(a[i * n + j])
        if (v > best) { best = v; bi = i; bj = j }
      }
    }
    if (best <= tol) break
    if (bi !== k) {
      for (let j = 0; j < n; j++) { const t = a[k * n + j]; a[k * n + j] = a[bi * n + j]; a[bi * n + j] = t }
      const t = b[k]; b[k] = b[bi]; b[bi] = t
    }
    if (bj !== k) {
      for (let i = 0; i < n; i++) { const t = a[i * n + k]; a[i * n + k] = a[i * n + bj]; a[i * n + bj] = t }
      const t = colOrder[k]; colOrder[k] = colOrder[bj]; colOrder[bj] = t
    }
    const pivot = a[k * n + k]
    for (let i = k + 1; i < n; i++) {
      const f = a[i * n + k] / pivot
      if (f === 0) continue
      a[i * n + k] = 0
      for (let j = k + 1; j < n; j++) a[i * n + j] -= f * a[k * n + j]
      b[i] -= f * b[k]
    }
    rank++
  }
  // Dependent rows: their eliminated right-hand side must vanish
  const dependent: number[] = []
  let residual = 0
  for (let i = rank; i < n; i++) {
    dependent.push(i)
    const r = Math.abs(b[i])
    if (r > residual) residual = r
  }
  const relResidual = residual / Math.max(bScale, scale, 1e-300)
  const consistent = relResidual <= 1e-8
  const y = new Float64Array(n)
  for (let k = rank - 1; k >= 0; k--) {
    let s = b[k]
    for (let j = k + 1; j < rank; j++) s -= a[k * n + j] * y[j]
    y[k] = s / a[k * n + k]
  }
  const x = new Float64Array(n)
  for (let k = 0; k < n; k++) x[colOrder[k]] = y[k]
  return { x, rank, dependent, residual: relResidual, consistent }
}
