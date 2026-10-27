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
    /// The basic solution before the D73 correction (empty when no correction was made).
    basic: Vec<f64>,
}

impl LinWork {
    /// The basic solution of the last solve when `weights` moved it along the null space (D73), else empty.
    pub fn basic(&self) -> &[f64] {
        &self.basic
    }
}

/// Solve A·x = b (n×n, row-major) in place: `a` and `b` are used as work space.
pub fn solve_dense_in_place(n: usize, a: &mut [f64], b: &mut [f64], relative_tolerance: f64) -> SolveResult {
    let mut x = vec![0.0; n];
    let (rank, residual, consistent) = solve_dense_into(n, a, b, relative_tolerance, &mut x, &mut LinWork::default(), None);
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
///
/// 26.53 (D73): with `weights`, a rank-deficient consistent system gets, among all its solutions, the one whose
/// unknowns of weight above 1 are least (sum of squares), and among those the one whose other unknowns are least;
/// see `min_norm_correction`. Full-rank systems are unchanged.
pub fn solve_dense_into(n: usize, a: &mut [f64], b: &mut [f64], relative_tolerance: f64, x: &mut [f64], work: &mut LinWork, weights: Option<&[f64]>) -> (usize, f64, bool) {
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
    work.basic.clear();
    if let Some(w) = weights {
        if rank < n && rank > 0 && consistent {
            work.basic.extend_from_slice(x);
            min_norm_correction(n, rank, a, col, w, x);
        }
    }
    (rank, rel_residual, consistent)
}

/// Basis of the null space of an eliminated n×n system of rank `rank` (`a` and `col` as `solve_dense_into` leaves
/// them): one column per free unknown, n × (n − rank) row-major.
fn null_basis(n: usize, rank: usize, a: &[f64], col: &[usize]) -> Vec<f64> {
    let d = n - rank;
    let mut z = vec![0.0; n * d];
    let mut yz = vec![0.0; n];
    for q in 0..d {
        let j = rank + q;
        yz.iter_mut().for_each(|v| *v = 0.0);
        yz[j] = 1.0;
        for k in (0..rank).rev() {
            let mut s = -a[k * n + j];
            for jj in k + 1..rank {
                s -= a[k * n + jj] * yz[jj];
            }
            yz[k] = s / a[k * n + k];
        }
        for k in 0..n {
            z[col[k] * d + q] = yz[k];
        }
    }
    z
}

/// D73: move the basic solution x along the null space (x = x_b + Z s) so that first the unknowns with a weight
/// above 1 (friction), then the others are as small as possible in the least-squares sense. The two stages are
/// solved one after the other, each in the freedom the previous one leaves (26.53: one system with weights 10¹² and 1
/// lost the second stage to the relative pivot tolerance, so the choice among the remaining solutions followed the
/// pivoting and jumped from one evaluation to the next).
fn min_norm_correction(n: usize, rank: usize, a: &[f64], col: &[usize], w: &[f64], x: &mut [f64]) {
    let d = n - rank;
    let z = null_basis(n, rank, a, col);
    let mut s = vec![0.0; d];
    // Remaining freedom: s + B·u, B d × k
    let mut k = d;
    let mut bm = vec![0.0; d * d];
    for q in 0..d {
        bm[q * d + q] = 1.0;
    }
    for stage in 0..2 {
        if k == 0 {
            break;
        }
        let rows: Vec<usize> = (0..n).filter(|&i| (w[i] > 1.0) == (stage == 0)).collect();
        let m = rows.len();
        let mut yv = vec![0.0; m * k];
        let mut e = vec![0.0; m];
        for (ri, &i) in rows.iter().enumerate() {
            for p in 0..k {
                let mut acc = 0.0;
                for q in 0..d {
                    acc += z[i * d + q] * bm[q * k + p];
                }
                yv[ri * k + p] = acc;
            }
            let mut acc = x[i];
            for q in 0..d {
                acc += z[i * d + q] * s[q];
            }
            e[ri] = acc;
        }
        let mut g = vec![0.0; k * k];
        let mut r = vec![0.0; k];
        for p in 0..k {
            for p2 in 0..k {
                let mut acc = 0.0;
                for ri in 0..m {
                    acc += yv[ri * k + p] * yv[ri * k + p2];
                }
                g[p * k + p2] = acc;
            }
            let mut acc = 0.0;
            for ri in 0..m {
                acc -= yv[ri * k + p] * e[ri];
            }
            r[p] = acc;
        }
        let mut u = vec![0.0; k];
        let mut lw = LinWork::default();
        let (rk, _, _) = solve_dense_into(k, &mut g, &mut r, 1e-12, &mut u, &mut lw, None);
        for q in 0..d {
            let mut acc = s[q];
            for p in 0..k {
                acc += bm[q * k + p] * u[p];
            }
            s[q] = acc;
        }
        let nb = null_basis(k, rk, &g, &lw.col);
        let k2 = k - rk;
        let mut b2 = vec![0.0; d * k2];
        for q in 0..d {
            for c in 0..k2 {
                let mut acc = 0.0;
                for p in 0..k {
                    acc += bm[q * k + p] * nb[p * k2 + c];
                }
                b2[q * k2 + c] = acc;
            }
        }
        bm = b2;
        k = k2;
    }
    for i in 0..n {
        let mut acc = x[i];
        for q in 0..d {
            acc += z[i * d + q] * s[q];
        }
        x[i] = acc;
    }
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

    #[test]
    fn redundant_systems_take_the_least_first_unknowns_then_the_least_others() {
        // t + n1 + n2 = 2 (three times the same row): t is minimised first, then n1 and n2 share
        let a = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
        let mut x = vec![0.0; 3];
        let (rank, _, consistent) = solve_dense_into(3, &mut a.to_vec(), &mut vec![2.0; 3], 1e-12, &mut x, &mut LinWork::default(), Some(&[1e12, 1.0, 1.0]));
        assert_eq!((rank, consistent), (1, true));
        assert!(x[0].abs() < 1e-15 && (x[1] - 1.0).abs() < 1e-15 && (x[2] - 1.0).abs() < 1e-15, "{x:?}");
        // The second stage is not lost when the first-stage unknowns are large in the null space (10¹² against 1)
        let a = [1.0, 2.0, 1.0, 1.0, 2.0, 1.0, 2.0, 4.0, 2.0];
        let (_, _, _) = solve_dense_into(3, &mut a.to_vec(), &mut vec![4.0, 4.0, 8.0], 1e-12, &mut x, &mut LinWork::default(), Some(&[1.0, 1e12, 1.0]));
        assert!(x[1].abs() < 1e-15 && (x[0] - 2.0).abs() < 1e-14 && (x[2] - 2.0).abs() < 1e-14, "{x:?}");
    }
}
