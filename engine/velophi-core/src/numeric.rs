//! Numerical helpers of the formula layer (26.53, ports of formula/elliptic.ts and formula/quadrature.ts): elliptic
//! integrals of the first kind and adaptive Gauss–Kronrod quadrature. Only IEEE arithmetic, square roots and the
//! deterministic sine and cosine, in the TypeScript evaluation order.

use crate::dmath::{cos, sin, PI_VALUE};
use crate::js::{js_max, js_round};

/// Complete integral K(k) by the AGM: K = π / (2·AGM(1, √(1 − k²))).
pub fn elliptic_k(k: f64) -> f64 {
    if !(k.abs() < 1.0) {
        return f64::INFINITY;
    }
    let mut a = 1.0;
    let mut b = (1.0 - k * k).sqrt();
    let mut i = 0;
    while i < 40 && (a - b).abs() > 1e-16 * a {
        let an = 0.5 * (a + b);
        b = (a * b).sqrt();
        a = an;
        i += 1;
    }
    PI_VALUE / (2.0 * a)
}

/// Carlson's R_F(x, y, z) by the duplication theorem with a fifth-order series at the end.
pub fn carlson_rf(x0: f64, y0: f64, z0: f64) -> f64 {
    if !(x0 >= 0.0 && y0 >= 0.0 && z0 >= 0.0) {
        return f64::NAN;
    }
    let (mut x, mut y, mut z) = (x0, y0, z0);
    let mut ave = (x + y + z) / 3.0;
    let (mut dx, mut dy, mut dz) = (0.0, 0.0, 0.0);
    for _ in 0..200 {
        let (sx, sy, sz) = (x.sqrt(), y.sqrt(), z.sqrt());
        let lam = sx * (sy + sz) + sy * sz;
        x = 0.25 * (x + lam);
        y = 0.25 * (y + lam);
        z = 0.25 * (z + lam);
        ave = (x + y + z) / 3.0;
        dx = (ave - x) / ave;
        dy = (ave - y) / ave;
        dz = (ave - z) / ave;
        if js_max(js_max(dx.abs(), dy.abs()), dz.abs()) <= 0.0025 {
            break;
        }
    }
    let e2 = dx * dy - dz * dz;
    let e3 = dx * dy * dz;
    (1.0 + (e2 / 24.0 - 0.1 - (3.0 / 44.0) * e3) * e2 + e3 / 14.0) / ave.sqrt()
}

/// Incomplete integral F(φ, k) for any real φ (periodic extension F(φ + nπ) = F(φ) + 2nK).
pub fn elliptic_f(phi: f64, k: f64) -> f64 {
    if !phi.is_finite() || !k.is_finite() {
        return f64::NAN;
    }
    let n = js_round(phi / PI_VALUE);
    let r = phi - n * PI_VALUE;
    let (s, c) = (sin(r), cos(r));
    let q = 1.0 - k * k * s * s;
    let part = s * carlson_rf(c * c, if q < 0.0 && q > -1e-15 { 0.0 } else { q }, 1.0);
    if n == 0.0 {
        return part;
    }
    2.0 * n * carlson_rf(0.0, 1.0 - k * k, 1.0) + part
}

const XGK: [f64; 8] = [
    0.991455371120812639206854697526329,
    0.949107912342758524526189684047851,
    0.864864423359769072789712788640926,
    0.741531185599394439863864773280788,
    0.586087235467691130294144845693013,
    0.405845151377397166906606412076961,
    0.207784955007898467600689403773245,
    0.0,
];
const WGK: [f64; 8] = [
    0.022935322010529224963732008058970,
    0.063092092629978553290700663189204,
    0.104790010322250183839876322541518,
    0.140653259715525918745189590510238,
    0.169004726639267902826583426598550,
    0.190350578064785409913256402421014,
    0.204432940075298892414161999234649,
    0.209482141084727828012999174891714,
];
const WG: [f64; 4] = [0.129484966168869693270611432679082, 0.279705391489276667901467771423780, 0.381830050505118944950369775488975, 0.417959183673469387755102040816327];

fn gk15(f: &mut dyn FnMut(f64) -> f64, a: f64, b: f64) -> (f64, f64) {
    let c = 0.5 * (a + b);
    let h = 0.5 * (b - a);
    let fc = f(c);
    let mut res_k = fc * WGK[7];
    let mut res_g = fc * WG[3];
    for j in 0..7 {
        let dx = h * XGK[j];
        let f1 = f(c - dx);
        let f2 = f(c + dx);
        res_k += WGK[j] * (f1 + f2);
        if j % 2 == 1 {
            res_g += WG[(j - 1) / 2] * (f1 + f2);
        }
    }
    (res_k * h, ((res_k - res_g) * h).abs())
}

/// Integral of f over [a, b] by adaptive bisection (formula/quadrature.ts integrate).
pub fn integrate(f: &mut dyn FnMut(f64) -> f64, a: f64, b: f64, breaks: &[f64], tol: f64) -> f64 {
    if !(b > a) {
        return 0.0;
    }
    let mut inner: Vec<f64> = breaks.iter().copied().filter(|&x| x > a && x < b).collect();
    inner.sort_by(|x, y| x.partial_cmp(y).unwrap_or(std::cmp::Ordering::Equal));
    let mut pts = vec![a];
    pts.extend(inner);
    pts.push(b);
    let mut total = 0.0;
    for i in 0..pts.len() - 1 {
        total += adapt(f, pts[i], pts[i + 1], tol, 0);
    }
    total
}

fn adapt(f: &mut dyn FnMut(f64) -> f64, a: f64, b: f64, tol: f64, depth: u32) -> f64 {
    let (value, error) = gk15(f, a, b);
    if !value.is_finite() {
        return f64::NAN;
    }
    if error <= tol * js_max(1.0, value.abs()) || depth >= 40 || b - a <= 1e-14 * js_max(1.0, a.abs()) {
        return value;
    }
    let m = 0.5 * (a + b);
    adapt(f, a, m, tol, depth + 1) + adapt(f, m, b, tol, depth + 1)
}
