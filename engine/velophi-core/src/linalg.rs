//! Dense linear solves for the small systems of the constraint solver (port of `src/core/math/linalg.ts`).
//! Gaussian elimination with complete pivoting; loop order, pivot choice (first maximum wins) and every
//! floating-point operation are those of the TypeScript version, so the result is bit-identical. The loops are
//! written over slices (no bounds checks in the inner loops); that changes no operation.

use crate::js::js_max;

/// Result of `solve_dense`.
#[derive(Clone, Debug, Default)]
pub struct SolveResult {
    /// Solution; unknowns of columns that never got a pivot are 0.
    pub x: Vec<f64>,
    /// Number of pivots found.
    pub rank: usize,
    /// Largest residual of a dependent row, relative to the scale of the system.
    pub residual: f64,
    /// Whether the dependent rows hold within a relative residual of 1e-8.
    pub consistent: bool,
}

/// Scratch space of `solve_dense_into`, reusable between calls.
#[derive(Clone, Debug, Default)]
pub struct LinWork {
    col: Vec<usize>,
    y: Vec<f64>,
}

/// Solve A·x = b (n×n, row-major) in place: `a` and `b` are used as work space.
pub fn solve_dense_in_place(n: usize, a: &mut [f64], b: &mut [f64], relative_tolerance: f64) -> SolveResult {
    let mut x = vec![0.0; n];
    let (rank, residual, consistent) = solve_dense_into(n, a, b, relative_tolerance, &mut x, &mut LinWork::default());
    SolveResult { x, rank, residual, consistent }
}

/// Solve A·x = b without touching the inputs.
pub fn solve_dense(n: usize, a: &[f64], b: &[f64], relative_tolerance: f64) -> SolveResult {
    let mut a2 = a.to_vec();
    let mut b2 = b.to_vec();
    solve_dense_in_place(n, &mut a2, &mut b2, relative_tolerance)
}

/// The elimination itself, writing the solution into `x` (length n). Returns (rank, relative residual,
/// consistent).
pub fn solve_dense_into(n: usize, a: &mut [f64], b: &mut [f64], relative_tolerance: f64, x: &mut [f64], work: &mut LinWork) -> (usize, f64, bool) {
    let a = &mut a[..n * n];
    let b = &mut b[..n];
    let x = &mut x[..n];
    work.col.clear();
    work.col.extend(0..n);
    work.y.clear();
    work.y.resize(n, 0.0);
    let col = &mut work.col[..];
    let y = &mut work.y[..];
    let mut scale = 0.0f64;
    for v in a.iter() {
        let v = v.abs();
        if v > scale {
            scale = v;
        }
    }
    let mut b_scale = 0.0f64;
    for v in b.iter() {
        let v = v.abs();
        if v > b_scale {
            b_scale = v;
        }
    }
    let tol = (if scale > 0.0 { scale } else { 1.0 }) * relative_tolerance * js_max(1.0, n as f64);
    let mut rank = 0usize;
    for k in 0..n {
        let mut best = -1.0f64;
        let mut bi = usize::MAX;
        let mut bj = usize::MAX;
        for (ri, row) in a.chunks_exact(n).enumerate().skip(k) {
            for (cj, v) in row[k..].iter().enumerate() {
                let v = v.abs();
                if v > best {
                    best = v;
                    bi = ri;
                    bj = k + cj;
                }
            }
        }
        if best <= tol {
            break;
        }
        if bi != k {
            let (top, bottom) = a.split_at_mut(bi * n);
            top[k * n..k * n + n].swap_with_slice(&mut bottom[..n]);
            b.swap(k, bi);
        }
        if bj != k {
            for row in a.chunks_exact_mut(n) {
                row.swap(k, bj);
            }
            col.swap(k, bj);
        }
        let (upper, lower) = a.split_at_mut((k + 1) * n);
        let pivot_row = &upper[k * n..];
        let pivot = pivot_row[k];
        let (b_upper, b_lower) = b.split_at_mut(k + 1);
        let bk = b_upper[k];
        for (row, bi) in lower.chunks_exact_mut(n).zip(b_lower.iter_mut()) {
            let f = row[k] / pivot;
            if f == 0.0 {
                continue;
            }
            row[k] = 0.0;
            for (v, p) in row[k + 1..].iter_mut().zip(&pivot_row[k + 1..]) {
                *v -= f * p;
            }
            *bi -= f * bk;
        }
        rank += 1;
    }
    let mut residual = 0.0f64;
    for v in b[rank..].iter() {
        let r = v.abs();
        if r > residual {
            residual = r;
        }
    }
    let rel_residual = residual / js_max(js_max(b_scale, scale), 1e-300);
    let consistent = rel_residual <= 1e-8;
    for k in (0..rank).rev() {
        let row = &a[k * n..k * n + n];
        let mut s = b[k];
        for (av, yv) in row[k + 1..rank].iter().zip(&y[k + 1..rank]) {
            s -= av * yv;
        }
        y[k] = s / row[k];
    }
    for k in 0..n {
        x[col[k]] = y[k];
    }
    (rank, rel_residual, consistent)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn solves_and_detects_rank() {
        let r = solve_dense(2, &[2.0, 1.0, 1.0, 3.0], &[3.0, 5.0], 1e-12);
        assert_eq!(r.rank, 2);
        assert!((r.x[0] - 0.8).abs() < 1e-15 && (r.x[1] - 1.4).abs() < 1e-15);
        let r = solve_dense(2, &[1.0, 1.0, 1.0, 1.0], &[1.0, 1.0], 1e-12);
        assert_eq!(r.rank, 1);
        assert!(r.consistent);
    }
}
