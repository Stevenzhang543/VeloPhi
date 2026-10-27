//! One-dimensional quantum mechanics (26.55, D94).
//!
//! Units: ħ = m = 1 with the length unit 1 nm; for an electron the energy unit is ħ²/(mₑ·nm²) ≈ 0.0762 eV and the
//! time unit ħ/E₀ ≈ 8.64 fs (`units`). The interface shows nm, eV and fs.
//!
//! - Time evolution: split-operator Fourier method (Strang splitting e^{−iVΔt/2} e^{−iTΔt} e^{−iVΔt/2}) on a periodic
//!   grid of N = 2ᵏ points with a radix-2 FFT; every factor is unitary, so the norm is kept to rounding. Optional
//!   absorbing layers at the edges (the absorbed probability is reported).
//! - Infinite square well: exact evolution in the basis of its eigenstates (finite-difference eigenvectors with
//!   ψ = 0 at the walls), ψ(t) = Σ cₙ φₙ e^{−iEₙt}.
//! - Eigenstates: the finite-difference Hamiltonian is symmetric tridiagonal; its lowest eigenvalues by bisection
//!   with Sturm sequences (to rounding), eigenvectors by inverse iteration with partial pivoting.
//! - Square barrier: the plane-wave transmission T(E) and its average over the momentum distribution of a Gaussian
//!   packet, for comparison with the simulated packet.

use crate::dmath::{cos, exp, sin};

const PI: f64 = std::f64::consts::PI;

/// Units for an electron: (length m, energy eV, time s).
pub fn units() -> (f64, f64, f64) {
    let hbar = 1.054571817e-34;
    let me = 9.1093837015e-31;
    let e = 1.602176634e-19;
    let l0 = 1e-9;
    let e0 = hbar * hbar / (me * l0 * l0);
    (l0, e0 / e, hbar / e0)
}

/// A potential.
#[derive(Clone, Debug, PartialEq)]
pub enum Potential {
    Free,
    /// V0 inside |x − c| < w/2.
    Barrier { v0: f64, c: f64, w: f64 },
    /// V0 for x > c.
    Step { v0: f64, c: f64 },
    /// −depth inside |x − c| < w/2.
    Well { depth: f64, c: f64, w: f64 },
    /// ½ω²(x − c)².
    Harmonic { omega: f64, c: f64 },
    /// Two barriers of height V0 and width w with a gap g between them, centred at c.
    Double { v0: f64, c: f64, w: f64, gap: f64 },
    /// Infinite square well [c − w/2, c + w/2].
    Box { c: f64, w: f64 },
    /// Linear interpolation of points (x, V), constant beyond the ends.
    Points(Vec<(f64, f64)>),
}

impl Potential {
    pub fn at(&self, x: f64) -> f64 {
        match self {
            Potential::Free | Potential::Box { .. } => 0.0,
            Potential::Barrier { v0, c, w } => {
                if (x - c).abs() < 0.5 * w {
                    *v0
                } else {
                    0.0
                }
            }
            Potential::Step { v0, c } => {
                if x > *c {
                    *v0
                } else {
                    0.0
                }
            }
            Potential::Well { depth, c, w } => {
                if (x - c).abs() < 0.5 * w {
                    -depth
                } else {
                    0.0
                }
            }
            Potential::Harmonic { omega, c } => 0.5 * omega * omega * (x - c) * (x - c),
            Potential::Double { v0, c, w, gap } => {
                let d = (x - c).abs();
                if d > 0.5 * gap && d < 0.5 * gap + w {
                    *v0
                } else {
                    0.0
                }
            }
            Potential::Points(p) => {
                if p.is_empty() {
                    return 0.0;
                }
                if x <= p[0].0 {
                    return p[0].1;
                }
                for k in 1..p.len() {
                    if x <= p[k].0 {
                        let (x0, v0) = p[k - 1];
                        let (x1, v1) = p[k];
                        return if x1 > x0 { v0 + (v1 - v0) * (x - x0) / (x1 - x0) } else { v1 };
                    }
                }
                p[p.len() - 1].1
            }
        }
    }
}

/// A periodic grid of n = 2ᵏ points on [x0, x0 + length).
#[derive(Clone, Debug)]
pub struct Grid {
    pub n: usize,
    pub x0: f64,
    pub dx: f64,
}

impl Grid {
    pub fn new(x0: f64, length: f64, n: usize) -> Grid {
        Grid { n, x0, dx: length / n as f64 }
    }
    pub fn x(&self, j: usize) -> f64 {
        self.x0 + j as f64 * self.dx
    }
    pub fn k(&self, j: usize) -> f64 {
        let n = self.n as i64;
        let m = if (j as i64) < n / 2 { j as i64 } else { j as i64 - n };
        2.0 * PI * m as f64 / (self.n as f64 * self.dx)
    }
}

/// Overlap length of [a0, a1] and [b0, b1].
fn overlap(a0: f64, a1: f64, b0: f64, b1: f64) -> f64 {
    (a1.min(b1) - a0.max(b0)).max(0.0)
}

impl Potential {
    /// Mean of V over the cell [x − dx/2, x + dx/2]: exact for the piecewise constant potentials (so a barrier of
    /// any width has its true area on the grid), the midpoint value for the smooth ones.
    pub fn cell(&self, x: f64, dx: f64) -> f64 {
        let (a, b) = (x - 0.5 * dx, x + 0.5 * dx);
        match self {
            Potential::Barrier { v0, c, w } => v0 * overlap(a, b, c - 0.5 * w, c + 0.5 * w) / dx,
            Potential::Well { depth, c, w } => -depth * overlap(a, b, c - 0.5 * w, c + 0.5 * w) / dx,
            Potential::Step { v0, c } => v0 * overlap(a, b, *c, f64::INFINITY) / dx,
            Potential::Double { v0, c, w, gap } => v0 * (overlap(a, b, c - 0.5 * gap - w, c - 0.5 * gap) + overlap(a, b, c + 0.5 * gap, c + 0.5 * gap + w)) / dx,
            _ => self.at(x),
        }
    }
}

// ---- FFT ----

/// In-place radix-2 FFT (inverse: sign +1 and no scaling).
pub struct Fft {
    n: usize,
    cos: Vec<f64>,
    sin: Vec<f64>,
    rev: Vec<usize>,
}

impl Fft {
    pub fn new(n: usize) -> Fft {
        assert!(n.is_power_of_two() && n >= 2);
        let bits = n.trailing_zeros();
        let rev = (0..n).map(|i| i.reverse_bits() >> (usize::BITS - bits)).collect();
        let cos = (0..n / 2).map(|k| crate::dmath::cos(2.0 * PI * k as f64 / n as f64)).collect();
        let sin = (0..n / 2).map(|k| crate::dmath::sin(2.0 * PI * k as f64 / n as f64)).collect();
        Fft { n, cos, sin, rev }
    }

    /// Forward (sign −1) or inverse (sign +1) transform of (re, im).
    pub fn run(&self, re: &mut [f64], im: &mut [f64], inverse: bool) {
        let n = self.n;
        for i in 0..n {
            let j = self.rev[i];
            if j > i {
                re.swap(i, j);
                im.swap(i, j);
            }
        }
        let sg = if inverse { 1.0 } else { -1.0 };
        let mut len = 2;
        while len <= n {
            let step = n / len;
            for start in (0..n).step_by(len) {
                for k in 0..len / 2 {
                    let (wr, wi) = (self.cos[k * step], sg * self.sin[k * step]);
                    let (a, b) = (start + k, start + k + len / 2);
                    let tr = re[b] * wr - im[b] * wi;
                    let ti = re[b] * wi + im[b] * wr;
                    re[b] = re[a] - tr;
                    im[b] = im[a] - ti;
                    re[a] += tr;
                    im[a] += ti;
                }
            }
            len <<= 1;
        }
    }
}

// ---- wave functions ----

/// A Gaussian packet e^{−(x−x0)²/(4σ²) + ik0x}, normalized on the grid.
pub fn packet(g: &Grid, x0: f64, sigma: f64, k0: f64) -> (Vec<f64>, Vec<f64>) {
    let mut re = vec![0.0; g.n];
    let mut im = vec![0.0; g.n];
    for j in 0..g.n {
        let x = g.x(j);
        let a = exp(-(x - x0) * (x - x0) / (4.0 * sigma * sigma));
        re[j] = a * cos(k0 * x);
        im[j] = a * sin(k0 * x);
    }
    normalize(&mut re, &mut im, g.dx);
    (re, im)
}

pub fn norm(re: &[f64], im: &[f64], dx: f64) -> f64 {
    re.iter().zip(im.iter()).map(|(a, b)| a * a + b * b).sum::<f64>() * dx
}

pub fn normalize(re: &mut [f64], im: &mut [f64], dx: f64) {
    let s = norm(re, im, dx).sqrt();
    if s > 0.0 {
        re.iter_mut().for_each(|v| *v /= s);
        im.iter_mut().for_each(|v| *v /= s);
    }
}

/// Expectation values of a state on a periodic grid.
#[derive(Clone, Copy, Debug, Default)]
pub struct Expect {
    pub norm: f64,
    pub x: f64,
    pub dx: f64,
    pub p: f64,
    pub dp: f64,
    pub energy: f64,
}

/// ⟨x⟩, Δx (position space), ⟨p⟩, Δp (momentum space via the FFT), ⟨H⟩.
pub fn expect(g: &Grid, fft: &Fft, v: &[f64], re: &[f64], im: &[f64]) -> Expect {
    let mut e = Expect::default();
    let (mut sx, mut sxx, mut sv) = (0.0, 0.0, 0.0);
    let mut n = 0.0;
    for j in 0..g.n {
        let p = re[j] * re[j] + im[j] * im[j];
        n += p;
        sx += p * g.x(j);
        sxx += p * g.x(j) * g.x(j);
        sv += p * v[j];
    }
    e.norm = n * g.dx;
    if n <= 0.0 {
        return e;
    }
    e.x = sx / n;
    e.dx = (sxx / n - e.x * e.x).max(0.0).sqrt();
    let (mut fr, mut fi) = (re.to_vec(), im.to_vec());
    fft.run(&mut fr, &mut fi, false);
    let (mut m, mut sk, mut skk) = (0.0, 0.0, 0.0);
    for j in 0..g.n {
        let p = fr[j] * fr[j] + fi[j] * fi[j];
        let k = g.k(j);
        m += p;
        sk += p * k;
        skk += p * k * k;
    }
    e.p = sk / m;
    e.dp = (skk / m - e.p * e.p).max(0.0).sqrt();
    e.energy = 0.5 * skk / m + sv / n;
    e
}

/// The split-operator propagator for a fixed Δt.
pub struct Propagator {
    pub g: Grid,
    fft: Fft,
    /// e^{−iVΔt/2}
    vr: Vec<f64>,
    vi: Vec<f64>,
    /// e^{−ik²Δt/2}
    kr: Vec<f64>,
    ki: Vec<f64>,
    /// Absorbing mask per step (1 where there is no layer).
    mask: Vec<f64>,
    pub dt: f64,
}

impl Propagator {
    pub fn new(g: Grid, v: &[f64], dt: f64, absorb: f64) -> Propagator {
        let n = g.n;
        let fft = Fft::new(n);
        let (mut vr, mut vi, mut kr, mut ki) = (vec![0.0; n], vec![0.0; n], vec![0.0; n], vec![0.0; n]);
        for j in 0..n {
            let a = -0.5 * v[j] * dt;
            vr[j] = cos(a);
            vi[j] = sin(a);
            let k = g.k(j);
            let b = -0.5 * k * k * dt;
            kr[j] = cos(b);
            ki[j] = sin(b);
        }
        // absorbing layers: the outer `absorb` fraction of each side, strength rising as s²
        let mut mask = vec![1.0; n];
        if absorb > 0.0 {
            let layer = (absorb * n as f64).round().max(1.0) as usize;
            let rate = 40.0 / (layer as f64 * g.dx).max(1e-12);
            for j in 0..layer.min(n / 2) {
                let s = (layer - j) as f64 / layer as f64;
                let m = exp(-rate * s * s * dt);
                mask[j] = m;
                mask[n - 1 - j] = m;
            }
        }
        Propagator { g, fft, vr, vi, kr, ki, mask, dt }
    }

    fn mul(re: &mut [f64], im: &mut [f64], fr: &[f64], fi: &[f64]) {
        for j in 0..re.len() {
            let (a, b) = (re[j], im[j]);
            re[j] = a * fr[j] - b * fi[j];
            im[j] = a * fi[j] + b * fr[j];
        }
    }

    /// `steps` steps; returns the probability absorbed in the layers.
    pub fn run(&self, re: &mut [f64], im: &mut [f64], steps: usize) -> f64 {
        let n = self.g.n as f64;
        let mut absorbed = 0.0;
        for _ in 0..steps {
            Self::mul(re, im, &self.vr, &self.vi);
            self.fft.run(re, im, false);
            Self::mul(re, im, &self.kr, &self.ki);
            self.fft.run(re, im, true);
            for j in 0..re.len() {
                re[j] /= n;
                im[j] /= n;
            }
            Self::mul(re, im, &self.vr, &self.vi);
            if self.mask.iter().any(|&m| m < 1.0) {
                let before = norm(re, im, self.g.dx);
                for j in 0..re.len() {
                    re[j] *= self.mask[j];
                    im[j] *= self.mask[j];
                }
                absorbed += before - norm(re, im, self.g.dx);
            }
        }
        absorbed
    }

    pub fn fft(&self) -> &Fft {
        &self.fft
    }
}

// ---- eigenstates ----

/// Number of eigenvalues of the symmetric tridiagonal matrix (d, e) below λ.
fn sturm(d: &[f64], e2: &[f64], lambda: f64) -> usize {
    let mut count = 0;
    let mut q = d[0] - lambda;
    if q < 0.0 {
        count += 1;
    }
    for i in 1..d.len() {
        let qq = if q == 0.0 { 1e-300 } else { q };
        q = d[i] - lambda - e2[i - 1] / qq;
        if q < 0.0 {
            count += 1;
        }
    }
    count
}

/// Solve (T − λI)y = b for the tridiagonal T (diagonal d, off-diagonal e) with partial pivoting.
fn tri_solve(d: &[f64], e: &[f64], lambda: f64, b: &[f64]) -> Vec<f64> {
    let n = d.len();
    // rows: (sub, diag, sup, sup2) after elimination
    let mut dg: Vec<f64> = d.iter().map(|v| v - lambda).collect();
    let mut up: Vec<f64> = e.to_vec();
    up.push(0.0);
    let mut up2 = vec![0.0; n];
    let mut lo: Vec<f64> = e.to_vec();
    let mut rhs = b.to_vec();
    for i in 0..n - 1 {
        if lo[i].abs() > dg[i].abs() {
            // swap rows i and i+1
            let (a0, a1, a2) = (dg[i], up[i], up2[i]);
            dg[i] = lo[i];
            up[i] = dg[i + 1];
            up2[i] = up[i + 1];
            rhs.swap(i, i + 1);
            let f = a0 / dg[i];
            dg[i + 1] = a1 - f * up[i];
            up[i + 1] = a2 - f * up2[i];
            rhs[i + 1] -= f * rhs[i];
            lo[i] = f;
        } else {
            let piv = if dg[i] == 0.0 { 1e-300 } else { dg[i] };
            dg[i] = piv;
            let f = lo[i] / piv;
            dg[i + 1] -= f * up[i];
            if i + 1 < n - 1 {
                // up[i+1] unchanged (up2[i] = 0)
            }
            rhs[i + 1] -= f * rhs[i];
            lo[i] = f;
        }
    }
    if dg[n - 1] == 0.0 {
        dg[n - 1] = 1e-300;
    }
    let mut y = vec![0.0; n];
    for i in (0..n).rev() {
        let mut s = rhs[i];
        if i + 1 < n {
            s -= up[i] * y[i + 1];
        }
        if i + 2 < n {
            s -= up2[i] * y[i + 2];
        }
        y[i] = s / dg[i];
    }
    y
}

/// Lowest `count` eigenpairs of −½ψ'' + Vψ on the points `v` (spacing dx, ψ = 0 one step beyond both ends).
/// Eigenvectors are normalized (Σψ²dx = 1) with a positive first lobe.
pub fn eigen(v: &[f64], dx: f64, count: usize) -> (Vec<f64>, Vec<Vec<f64>>) {
    let n = v.len();
    let count = count.min(n);
    let off = -0.5 / (dx * dx);
    let d: Vec<f64> = v.iter().map(|vi| 1.0 / (dx * dx) + vi).collect();
    let e = vec![off; n - 1];
    let e2: Vec<f64> = e.iter().map(|x| x * x).collect();
    let (mut lo, mut hi) = (f64::INFINITY, f64::NEG_INFINITY);
    for i in 0..n {
        let r = if i > 0 { off.abs() } else { 0.0 } + if i + 1 < n { off.abs() } else { 0.0 };
        lo = lo.min(d[i] - r);
        hi = hi.max(d[i] + r);
    }
    let mut vals = Vec::with_capacity(count);
    for k in 0..count {
        let (mut a, mut b) = (lo, hi);
        for _ in 0..200 {
            let m = 0.5 * (a + b);
            if m <= a || m >= b {
                break;
            }
            if sturm(&d, &e2, m) > k {
                b = m;
            } else {
                a = m;
            }
        }
        vals.push(0.5 * (a + b));
    }
    let mut vecs: Vec<Vec<f64>> = Vec::with_capacity(count);
    for (k, &lam) in vals.iter().enumerate() {
        let shift = lam + 1e-13 * lam.abs().max(1e-300);
        let mut y: Vec<f64> = (0..n).map(|i| 1.0 + 0.37 * sin(1.3 * i as f64 + k as f64)).collect();
        for _ in 0..3 {
            y = tri_solve(&d, &e, shift, &y);
            // orthogonal to nearly degenerate earlier vectors
            for (j, w) in vecs.iter().enumerate() {
                if (vals[j] - lam).abs() <= 1e-8 * lam.abs().max(1.0) {
                    let p: f64 = y.iter().zip(w.iter()).map(|(a, b)| a * b).sum::<f64>() * dx;
                    y.iter_mut().zip(w.iter()).for_each(|(a, b)| *a -= p * b);
                }
            }
            let s = (y.iter().map(|a| a * a).sum::<f64>() * dx).sqrt();
            y.iter_mut().for_each(|a| *a /= s);
        }
        // sign: the first value above 1 % of the maximum is positive
        let m = y.iter().fold(0.0f64, |m, a| m.max(a.abs()));
        if let Some(f) = y.iter().find(|a| a.abs() > 0.01 * m) {
            if *f < 0.0 {
                y.iter_mut().for_each(|a| *a = -*a);
            }
        }
        vecs.push(y);
    }
    (vals, vecs)
}

// ---- barrier transmission ----

/// Plane-wave transmission of a square barrier V0 of width w at energy E = k²/2.
pub fn barrier_t(e: f64, v0: f64, w: f64) -> f64 {
    if e <= 0.0 {
        return 0.0;
    }
    if (e - v0).abs() < 1e-12 * v0.abs().max(1e-300) {
        return 1.0 / (1.0 + v0 * w * w / 2.0);
    }
    if e < v0 {
        let kappa = (2.0 * (v0 - e)).sqrt();
        let sh = 0.5 * (exp(kappa * w) - exp(-kappa * w));
        1.0 / (1.0 + v0 * v0 * sh * sh / (4.0 * e * (v0 - e)))
    } else {
        let k2 = (2.0 * (e - v0)).sqrt();
        let s = sin(k2 * w);
        1.0 / (1.0 + v0 * v0 * s * s / (4.0 * e * (e - v0)))
    }
}

/// Transmission of a Gaussian packet (momentum spread 1/(2σ) around k0) averaged over its momentum distribution.
pub fn packet_t(k0: f64, sigma: f64, v0: f64, w: f64) -> f64 {
    let sk = 1.0 / (2.0 * sigma);
    let (mut num, mut den) = (0.0, 0.0);
    let m = 4001;
    for i in 0..m {
        let k = k0 + sk * (-8.0 + 16.0 * i as f64 / (m - 1) as f64);
        let p = exp(-(k - k0) * (k - k0) / (2.0 * sk * sk));
        den += p;
        if k > 0.0 {
            num += p * barrier_t(0.5 * k * k, v0, w);
        }
    }
    num / den
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn units_of_an_electron() {
        let (_, e0, t0) = units();
        assert!((e0 - 0.0761996).abs() < 1e-6, "{e0}");
        assert!((t0 - 8.638e-15).abs() < 1e-17, "{t0}");
    }

    #[test]
    fn fft_round_trip_and_parseval() {
        let n = 64;
        let f = Fft::new(n);
        let mut re: Vec<f64> = (0..n).map(|i| sin(0.3 * i as f64) + 0.1 * i as f64).collect();
        let mut im: Vec<f64> = (0..n).map(|i| cos(1.7 * i as f64)).collect();
        let (r0, i0) = (re.clone(), im.clone());
        f.run(&mut re, &mut im, false);
        let e1: f64 = re.iter().zip(&im).map(|(a, b)| a * a + b * b).sum::<f64>() / n as f64;
        let e0: f64 = r0.iter().zip(&i0).map(|(a, b)| a * a + b * b).sum();
        assert!((e1 - e0).abs() < 1e-12 * e0);
        f.run(&mut re, &mut im, true);
        for i in 0..n {
            assert!((re[i] / n as f64 - r0[i]).abs() < 1e-13 && (im[i] / n as f64 - i0[i]).abs() < 1e-13);
        }
    }

    #[test]
    fn infinite_well_and_oscillator_levels() {
        // well of width 1 (ψ = 0 at the walls), 1999 interior points
        let n = 1999;
        let dx = 1.0 / (n + 1) as f64;
        let (vals, vecs) = eigen(&vec![0.0; n], dx, 5);
        for (k, &e) in vals.iter().enumerate() {
            let m = (k + 1) as f64;
            let exact = m * m * PI * PI / 2.0;
            assert!(((e - exact) / exact).abs() <= 1e-4, "E{} {e} vs {exact}", k + 1);
            // the finite-difference value itself, to rounding: (2/dx²) sin²(mπdx/2)
            let fd = 2.0 / (dx * dx) * sin(m * PI * dx / 2.0).powi(2);
            assert!(((e - fd) / fd).abs() <= 1e-8, "{e} vs {fd}");
            // eigenvector ∝ sin(mπx)
            let s = (2.0f64).sqrt();
            let worst = (0..n).map(|i| (vecs[k][i] - s * sin(m * PI * (i + 1) as f64 * dx)).abs()).fold(0.0, f64::max);
            assert!(worst < 1e-6, "vector {k}: {worst}");
        }
        // harmonic oscillator ω = 1: Eₙ = n + ½
        let n = 2000;
        let dx = 20.0 / n as f64;
        let v: Vec<f64> = (0..n).map(|i| { let x = -10.0 + (i + 1) as f64 * dx; 0.5 * x * x }).collect();
        let (vals, _) = eigen(&v, dx, 6);
        for (k, &e) in vals.iter().enumerate() {
            assert!((e - (k as f64 + 0.5)).abs() < 1e-4 * (k as f64 + 0.5), "{k}: {e}");
        }
    }

    #[test]
    fn norm_is_kept_and_packets_move() {
        let g = Grid::new(-50.0, 100.0, 1024);
        let v = vec![0.0; 1024];
        let p = Propagator::new(g.clone(), &v, 0.005, 0.0);
        let (mut re, mut im) = packet(&g, -20.0, 2.0, 3.0);
        p.run(&mut re, &mut im, 2000);
        let e = expect(&g, p.fft(), &v, &re, &im);
        assert!((e.norm - 1.0).abs() <= 1e-10, "norm {}", e.norm);
        // free packet: ⟨x⟩ = x0 + k0·t, Δx(t) = σ√(1 + (t/(2σ²))²)
        let t = 10.0;
        assert!((e.x - (-20.0 + 3.0 * t)).abs() < 1e-6, "{}", e.x);
        assert!((e.p - 3.0).abs() < 1e-9);
        let sx = 2.0 * (1.0f64 + (t / 8.0) * (t / 8.0)).sqrt();
        assert!((e.dx - sx).abs() < 1e-6, "{} vs {sx}", e.dx);
    }

    #[test]
    fn barrier_transmission_matches_the_average() {
        // packet k0 = 2 (E = 2) on a barrier V0 = 2.2 of width 0.6: tunnelling
        let g = Grid::new(-100.0, 200.0, 2048);
        let pot = Potential::Barrier { v0: 2.2, c: 0.0, w: 0.6 };
        let v: Vec<f64> = (0..g.n).map(|j| pot.cell(g.x(j), g.dx)).collect();
        let p = Propagator::new(g.clone(), &v, 0.005, 0.0);
        let (sigma, k0) = (5.0, 2.0);
        let (mut re, mut im) = packet(&g, -40.0, sigma, k0);
        p.run(&mut re, &mut im, 8000); // t = 40
        let tr: f64 = (0..g.n).filter(|&j| g.x(j) > 0.3).map(|j| re[j] * re[j] + im[j] * im[j]).sum::<f64>() * g.dx;
        let exact = packet_t(k0, sigma, 2.2, 0.6);
        assert!(((tr - exact) / exact).abs() < 0.01, "T {tr} vs {exact}");
        assert!(exact > 0.2 && exact < 0.8);
    }
}
