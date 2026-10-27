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
  /** The basic solution before the D73 correction (only when `weights` moved the solution). */
  basic?: Float64Array
}

/**
 * Solve A·x = b (n×n, row-major). With `consume` the inputs are used as work space (the caller does not
 * need them afterwards); the result is the same either way.
 *
 * 26.53 (D73): with `weights`, a rank-deficient consistent system gets, among all its solutions, the one whose
 * unknowns of weight above 1 are least (sum of squares), and among those the one whose other unknowns are least
 * (`minNormCorrection`); the basic solution is returned as `basic`. Full-rank systems are unchanged.
 */
export function solveDense(n: number, matrix: Float64Array, rhs: Float64Array, relativeTolerance = 1e-12, consume = false, weights: Float64Array | null = null): SolveResult {
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
  if (weights && rank < n && rank > 0 && consistent) {
    const basic = Float64Array.from(x)
    minNormCorrection(n, rank, a, colOrder, weights, x)
    return { x, rank, dependent, residual: relResidual, consistent, basic }
  }
  return { x, rank, dependent, residual: relResidual, consistent }
}

/** The elimination of `solveDense` with its column order (for the null space of the D73 correction). */
function eliminate(n: number, a: Float64Array, b: Float64Array, relativeTolerance: number): { x: Float64Array; rank: number; colOrder: Int32Array } {
  const colOrder = new Int32Array(n)
  for (let i = 0; i < n; i++) colOrder[i] = i
  let scale = 0
  for (let i = 0; i < n * n; i++) { const v = Math.abs(a[i]); if (v > scale) scale = v }
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
  const y = new Float64Array(n)
  for (let k = rank - 1; k >= 0; k--) {
    let s = b[k]
    for (let j = k + 1; j < rank; j++) s -= a[k * n + j] * y[j]
    y[k] = s / a[k * n + k]
  }
  const x = new Float64Array(n)
  for (let k = 0; k < n; k++) x[colOrder[k]] = y[k]
  return { x, rank, colOrder }
}

/** Null-space basis of an eliminated system (one column per free unknown), n × (n − rank) row-major. */
function nullBasis(n: number, rank: number, a: Float64Array, colOrder: Int32Array): Float64Array {
  const d = n - rank
  const Z = new Float64Array(n * d)
  const yz = new Float64Array(n)
  for (let q = 0; q < d; q++) {
    const j = rank + q
    yz.fill(0)
    yz[j] = 1
    for (let k = rank - 1; k >= 0; k--) {
      let s = -a[k * n + j]
      for (let jj = k + 1; jj < rank; jj++) s -= a[k * n + jj] * yz[jj]
      yz[k] = s / a[k * n + k]
    }
    for (let k = 0; k < n; k++) Z[colOrder[k] * d + q] = yz[k]
  }
  return Z
}

/**
 * D73: move the basic solution x along the null space (x = x_b + Z s) so that first the unknowns with a weight
 * above 1 (friction), then the others are as small as possible in the least-squares sense, each stage in the freedom
 * the previous one leaves (26.53: one system with weights 10¹² and 1 lost the second stage to the pivot tolerance).
 */
function minNormCorrection(n: number, rank: number, a: Float64Array, colOrder: Int32Array, w: Float64Array, x: Float64Array) {
  const d = n - rank
  const Z = nullBasis(n, rank, a, colOrder)
  const s = new Float64Array(d)
  // Remaining freedom: s + B·u, B d × k
  let k = d
  let B = new Float64Array(d * d)
  for (let q = 0; q < d; q++) B[q * d + q] = 1
  for (let stage = 0; stage < 2; stage++) {
    if (k === 0) break
    const rows: number[] = []
    for (let i = 0; i < n; i++) if ((w[i] > 1) === (stage === 0)) rows.push(i)
    const m = rows.length
    const Y = new Float64Array(m * k)
    const e = new Float64Array(m)
    for (let ri = 0; ri < m; ri++) {
      const i = rows[ri]
      for (let p = 0; p < k; p++) {
        let acc = 0
        for (let q = 0; q < d; q++) acc += Z[i * d + q] * B[q * k + p]
        Y[ri * k + p] = acc
      }
      let acc = x[i]
      for (let q = 0; q < d; q++) acc += Z[i * d + q] * s[q]
      e[ri] = acc
    }
    const G = new Float64Array(k * k)
    const r = new Float64Array(k)
    for (let p = 0; p < k; p++) {
      for (let p2 = 0; p2 < k; p2++) {
        let acc = 0
        for (let ri = 0; ri < m; ri++) acc += Y[ri * k + p] * Y[ri * k + p2]
        G[p * k + p2] = acc
      }
      let acc = 0
      for (let ri = 0; ri < m; ri++) acc -= Y[ri * k + p] * e[ri]
      r[p] = acc
    }
    const el = eliminate(k, G, r, 1e-12)
    const u = el.x
    for (let q = 0; q < d; q++) {
      let acc = s[q]
      for (let p = 0; p < k; p++) acc += B[q * k + p] * u[p]
      s[q] = acc
    }
    const N = nullBasis(k, el.rank, G, el.colOrder)
    const k2 = k - el.rank
    const B2 = new Float64Array(d * k2)
    for (let q = 0; q < d; q++) {
      for (let c = 0; c < k2; c++) {
        let acc = 0
        for (let p = 0; p < k; p++) acc += B[q * k + p] * N[p * k2 + c]
        B2[q * k2 + c] = acc
      }
    }
    B = B2
    k = k2
  }
  for (let i = 0; i < n; i++) {
    let acc = x[i]
    for (let q = 0; q < d; q++) acc += Z[i * d + q] * s[q]
    x[i] = acc
  }
}
