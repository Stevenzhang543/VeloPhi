//! Three-component vectors of the geometry operations: IEEE-754 basic operations and `sqrt`, angles through
//! `velophi_core::dmath`, and a Jacobi eigen-decomposition of a symmetric 3 × 3 matrix whose sweep count depends on the
//! data only.

use velophi_core::dmath;

/// A point or a direction (ångström).
pub type V3 = [f64; 3];

pub fn add(a: V3, b: V3) -> V3 {
    [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

pub fn sub(a: V3, b: V3) -> V3 {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

pub fn scale(a: V3, s: f64) -> V3 {
    [a[0] * s, a[1] * s, a[2] * s]
}

pub fn dot(a: V3, b: V3) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

pub fn cross(a: V3, b: V3) -> V3 {
    [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

pub fn norm(a: V3) -> f64 {
    dot(a, a).sqrt()
}

/// The unit vector along `a`; the zero vector when `a` has no direction.
pub fn unit(a: V3) -> V3 {
    let n = norm(a);
    if n > 1e-12 {
        scale(a, 1.0 / n)
    } else {
        [0.0; 3]
    }
}

/// A unit vector perpendicular to `a`: the cross product with the coordinate axis along which `a` is smallest (the
/// first such axis), so the choice is the same on every build.
pub fn perpendicular(a: V3) -> V3 {
    let (ax, ay, az) = (a[0].abs(), a[1].abs(), a[2].abs());
    let e = if ax <= ay && ax <= az {
        [1.0, 0.0, 0.0]
    } else if ay <= az {
        [0.0, 1.0, 0.0]
    } else {
        [0.0, 0.0, 1.0]
    };
    unit(cross(a, e))
}

/// The angle between two directions in radians, 0 … π. `atan2(|u × v|, u · v)` keeps its accuracy near 0° and 180°,
/// where the arc cosine of the normalised dot product loses half the digits.
pub fn angle(u: V3, v: V3) -> f64 {
    dmath::atan2(norm(cross(u, v)), dot(u, v))
}

/// Radians to degrees.
pub fn degrees(rad: f64) -> f64 {
    rad * 180.0 / dmath::PI_VALUE
}

/// Eigenvalues (descending) and unit eigenvectors (rows, a right-handed set) of a symmetric matrix by cyclic Jacobi
/// rotations. Each eigenvector is signed so that its largest component is positive; the third is the cross product of
/// the first two.
pub fn eigen_sym3(m: [[f64; 3]; 3]) -> ([f64; 3], [V3; 3]) {
    let mut a = m;
    let mut v = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]];
    for _sweep in 0..48 {
        let off = a[0][1] * a[0][1] + a[0][2] * a[0][2] + a[1][2] * a[1][2];
        let diag = a[0][0] * a[0][0] + a[1][1] * a[1][1] + a[2][2] * a[2][2];
        if off == 0.0 || off <= 1e-30 * diag {
            break;
        }
        for (p, q) in [(0usize, 1usize), (0, 2), (1, 2)] {
            if a[p][q] == 0.0 {
                continue;
            }
            let theta = (a[q][q] - a[p][p]) / (2.0 * a[p][q]);
            let t = if theta >= 0.0 { 1.0 / (theta + (theta * theta + 1.0).sqrt()) } else { -1.0 / (-theta + (theta * theta + 1.0).sqrt()) };
            let c = 1.0 / (t * t + 1.0).sqrt();
            let s = t * c;
            for row in a.iter_mut() {
                let (kp, kq) = (row[p], row[q]);
                row[p] = c * kp - s * kq;
                row[q] = s * kp + c * kq;
            }
            let (rp, rq) = (a[p], a[q]);
            a[p] = [0, 1, 2].map(|k| c * rp[k] - s * rq[k]);
            a[q] = [0, 1, 2].map(|k| s * rp[k] + c * rq[k]);
            for row in v.iter_mut() {
                let (kp, kq) = (row[p], row[q]);
                row[p] = c * kp - s * kq;
                row[q] = s * kp + c * kq;
            }
        }
    }
    let mut order = [0usize, 1, 2];
    // Descending eigenvalues; equal values keep their index order
    order.sort_by(|&i, &j| a[j][j].partial_cmp(&a[i][i]).unwrap_or(std::cmp::Ordering::Equal).then(i.cmp(&j)));
    let column = |k: usize| -> V3 {
        let c = unit([v[0][k], v[1][k], v[2][k]]);
        let mut big = 0;
        for i in 1..3 {
            if c[i].abs() > c[big].abs() + 1e-12 {
                big = i;
            }
        }
        if c[big] < 0.0 {
            scale(c, -1.0)
        } else {
            c
        }
    };
    let e0 = column(order[0]);
    let e1 = column(order[1]);
    let e2 = unit(cross(e0, e1));
    ([a[order[0]][order[0]], a[order[1]][order[1]], a[order[2]][order[2]]], [e0, e1, e2])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn eigen_decomposition_reconstructs_the_matrix() {
        // Tolerance 1e-12: Jacobi rotations converge quadratically to rounding error
        let m = [[4.0, 1.0, -2.0], [1.0, 3.0, 0.5], [-2.0, 0.5, 5.0]];
        let (w, e) = eigen_sym3(m);
        assert!(w[0] >= w[1] && w[1] >= w[2]);
        for i in 0..3 {
            for j in 0..3 {
                let r: f64 = (0..3).map(|k| w[k] * e[k][i] * e[k][j]).sum();
                assert!((r - m[i][j]).abs() < 1e-12, "{i}{j}: {r}");
            }
        }
        // Right-handed and orthonormal
        assert!((dot(cross(e[0], e[1]), e[2]) - 1.0).abs() < 1e-12);
        assert!((w[0] + w[1] + w[2] - 12.0).abs() < 1e-12);
    }

    #[test]
    fn angle_is_accurate_at_the_ends() {
        assert_eq!(degrees(angle([1.0, 0.0, 0.0], [-2.0, 0.0, 0.0])), 180.0);
        assert_eq!(angle([1.0, 0.0, 0.0], [3.0, 0.0, 0.0]), 0.0);
        assert!((degrees(angle([1.0, 0.0, 0.0], [0.0, 5.0, 0.0])) - 90.0).abs() < 1e-13);
        let p = perpendicular([0.3, -0.2, 0.9]);
        assert!(dot(p, [0.3, -0.2, 0.9]).abs() < 1e-15 && (norm(p) - 1.0).abs() < 1e-15);
    }
}
