//! Hydrogen-like orbitals ψ_nlm = R_nl(r) · Y_lm(θ, φ) for n ≤ 4 (26.64, D271), closed forms only.
//!
//! Radial part: R_nl(r) = N ρˡ e^(−ρ/2) L^(2l+1)_(n−l−1)(ρ), ρ = 2Zr / (n a₀), N² = (2Z / n a₀)³ (n−l−1)! / (2n (n+l)!),
//! with the generalised Laguerre polynomial as its finite sum. Angular part: the real spherical harmonics as
//! polynomials of the direction cosines — m = 0 the zonal one, m > 0 the cos mφ combination, m < 0 the sin |m|φ one
//! (p: z, x, y; d: z², xz, yz, x²−y², xy; f: z³, xz², yz², z(x²−y²), xyz, x(x²−3y²), y(3x²−y²)).
//!
//! The point cloud is sampled from |ψ|² = [r²R²] · [Y²]: the radius by inverting the cumulative radial distribution
//! tabulated on a fixed grid (Simpson's rule), the direction by rejection against the bound of Y². The random numbers
//! come from a generator of our own — xoshiro256** seeded through SplitMix64 from the request's `seed` — so the same
//! request gives the same cloud on every build.

use velophi_core::dmath;

use super::vec3::V3;

/// Bohr radius (Å, CODATA 2022) and Rydberg energy (eV, CODATA 2022).
pub const BOHR: f64 = 0.529177210544;
pub const RYDBERG_EV: f64 = 13.605693122990;
/// Intervals of the radial grid (even: Simpson's rule).
pub const GRID: usize = 4096;

fn factorial(n: usize) -> f64 {
    (1..=n).fold(1.0, |f, k| f * k as f64)
}

fn binomial(n: usize, k: usize) -> f64 {
    if k > n {
        0.0
    } else {
        factorial(n) / (factorial(k) * factorial(n - k))
    }
}

fn powi(x: f64, n: usize) -> f64 {
    (0..n).fold(1.0, |p, _| p * x)
}

/// Generalised Laguerre polynomial L^α_k(x) = Σᵢ (−1)ⁱ C(k + α, k − i) xⁱ / i!.
pub fn laguerre(k: usize, alpha: usize, x: f64) -> f64 {
    let mut sum = 0.0;
    for i in (0..=k).rev() {
        let sign = if i % 2 == 0 { 1.0 } else { -1.0 };
        sum = sum * x + sign * binomial(k + alpha, k - i) / factorial(i);
    }
    sum
}

/// R_nl(r) in Å^(−3/2); r in Å.
pub fn radial(n: usize, l: usize, z: f64, r: f64) -> f64 {
    let k = 2.0 * z / (n as f64 * BOHR);
    let rho = k * r;
    let norm = (k * k * k * factorial(n - l - 1) / (2.0 * n as f64 * factorial(n + l))).sqrt();
    norm * powi(rho, l) * dmath::exp(-rho / 2.0) * laguerre(n - l - 1, 2 * l + 1, rho)
}

const PI: f64 = dmath::PI_VALUE;

/// Real spherical harmonic of the unit direction (x, y, z).
pub fn harmonic(l: usize, m: i32, d: V3) -> f64 {
    let (x, y, z) = (d[0], d[1], d[2]);
    match (l, m) {
        (0, _) => (1.0 / (4.0 * PI)).sqrt(),
        (1, 0) => (3.0 / (4.0 * PI)).sqrt() * z,
        (1, 1) => (3.0 / (4.0 * PI)).sqrt() * x,
        (1, -1) => (3.0 / (4.0 * PI)).sqrt() * y,
        (2, 0) => (5.0 / (16.0 * PI)).sqrt() * (3.0 * z * z - 1.0),
        (2, 1) => (15.0 / (4.0 * PI)).sqrt() * x * z,
        (2, -1) => (15.0 / (4.0 * PI)).sqrt() * y * z,
        (2, 2) => (15.0 / (16.0 * PI)).sqrt() * (x * x - y * y),
        (2, -2) => (15.0 / (4.0 * PI)).sqrt() * x * y,
        (3, 0) => (7.0 / (16.0 * PI)).sqrt() * (5.0 * z * z * z - 3.0 * z),
        (3, 1) => (21.0 / (32.0 * PI)).sqrt() * x * (5.0 * z * z - 1.0),
        (3, -1) => (21.0 / (32.0 * PI)).sqrt() * y * (5.0 * z * z - 1.0),
        (3, 2) => (105.0 / (16.0 * PI)).sqrt() * z * (x * x - y * y),
        (3, -2) => (105.0 / (4.0 * PI)).sqrt() * x * y * z,
        (3, 3) => (35.0 / (32.0 * PI)).sqrt() * x * (x * x - 3.0 * y * y),
        (3, -3) => (35.0 / (32.0 * PI)).sqrt() * y * (3.0 * x * x - y * y),
        _ => 0.0,
    }
}

/// Name of the angular part ("s", "pz", "dx2-y2" …).
pub fn orbital_key(l: usize, m: i32) -> &'static str {
    match (l, m) {
        (0, _) => "s",
        (1, 0) => "pz",
        (1, 1) => "px",
        (1, -1) => "py",
        (2, 0) => "dz2",
        (2, 1) => "dxz",
        (2, -1) => "dyz",
        (2, 2) => "dx2-y2",
        (2, -2) => "dxy",
        (3, 0) => "fz3",
        (3, 1) => "fxz2",
        (3, -1) => "fyz2",
        (3, 2) => "fz(x2-y2)",
        (3, -2) => "fxyz",
        (3, 3) => "fx(x2-3y2)",
        (3, -3) => "fy(3x2-y2)",
        _ => "",
    }
}

/// ψ_nlm at a point (Å) in Å^(−3/2).
pub fn psi(n: usize, l: usize, m: i32, z: f64, p: V3) -> f64 {
    let r = (p[0] * p[0] + p[1] * p[1] + p[2] * p[2]).sqrt();
    if r == 0.0 {
        return if l == 0 { radial(n, 0, z, 0.0) * harmonic(0, 0, [0.0, 0.0, 1.0]) } else { 0.0 };
    }
    radial(n, l, z, r) * harmonic(l, m, [p[0] / r, p[1] / r, p[2] / r])
}

/// xoshiro256** (Blackman and Vigna), state filled by SplitMix64 from the seed.
pub struct Rng {
    s: [u64; 4],
}

impl Rng {
    pub fn new(seed: u64) -> Rng {
        let mut x = seed;
        let mut next = || {
            x = x.wrapping_add(0x9E3779B97F4A7C15);
            let mut z = x;
            z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
            z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
            z ^ (z >> 31)
        };
        Rng { s: [next(), next(), next(), next()] }
    }

    pub fn next_u64(&mut self) -> u64 {
        let result = self.s[1].wrapping_mul(5).rotate_left(7).wrapping_mul(9);
        let t = self.s[1] << 17;
        self.s[2] ^= self.s[0];
        self.s[3] ^= self.s[1];
        self.s[1] ^= self.s[2];
        self.s[0] ^= self.s[3];
        self.s[2] ^= t;
        self.s[3] = self.s[3].rotate_left(45);
        result
    }

    /// Uniform in [0, 1): the top 53 bits.
    pub fn uniform(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 * (1.0 / 9007199254740992.0)
    }
}

/// The radial functions on the grid and what follows from them.
pub struct Radial {
    pub r_max: f64,
    /// Grid radii, R(r) and P(r) = r² R², GRID + 1 values each.
    pub r: Vec<f64>,
    pub big_r: Vec<f64>,
    pub p: Vec<f64>,
    /// Cumulative probability at the grid radii.
    pub cdf: Vec<f64>,
    /// ∫₀^r_max P dr (Simpson) — 1 up to the neglected tail.
    pub enclosed: f64,
    /// Radii of the radial nodes (Å), counted from the sign changes of R on the grid and refined by bisection.
    pub nodes: Vec<f64>,
    /// Radius of the largest maximum of P (Å).
    pub peak: f64,
}

/// Outer radius of the grid in Bohr radii for Z = 1: beyond it P integrates to less than 10⁻⁹.
fn r_max_bohr(n: usize) -> f64 {
    (n * (3 * n + 10)) as f64
}

pub fn radial_table(n: usize, l: usize, z: f64) -> Radial {
    let r_max = r_max_bohr(n) * BOHR / z;
    let h = r_max / GRID as f64;
    let r: Vec<f64> = (0..=GRID).map(|i| i as f64 * h).collect();
    let big_r: Vec<f64> = r.iter().map(|x| radial(n, l, z, *x)).collect();
    let p: Vec<f64> = r.iter().zip(&big_r).map(|(x, y)| x * x * y * y).collect();
    // Cumulative Simpson: exact panels over pairs of intervals, the odd points by the three-point rule of the half panel
    let mut cdf = vec![0.0; GRID + 1];
    for i in (2..=GRID).step_by(2) {
        cdf[i] = cdf[i - 2] + h / 3.0 * (p[i - 2] + 4.0 * p[i - 1] + p[i]);
        cdf[i - 1] = cdf[i - 2] + h / 12.0 * (5.0 * p[i - 2] + 8.0 * p[i - 1] - p[i]);
    }
    let enclosed = cdf[GRID];
    let mut nodes = Vec::new();
    for i in 1..GRID {
        // A node between two grid points, or exactly on one
        let (a, b) = (big_r[i], big_r[i + 1]);
        if (a < 0.0 && b > 0.0) || (a > 0.0 && b < 0.0) {
            let (mut lo, mut hi, flo) = (r[i], r[i + 1], a);
            for _ in 0..60 {
                let mid = 0.5 * (lo + hi);
                let f = radial(n, l, z, mid);
                if (f < 0.0) == (flo < 0.0) {
                    lo = mid;
                } else {
                    hi = mid;
                }
            }
            nodes.push(0.5 * (lo + hi));
        } else if a == 0.0 && big_r[i - 1] * b < 0.0 {
            nodes.push(r[i]);
        }
    }
    let mut peak = 0;
    for i in 1..=GRID {
        if p[i] > p[peak] {
            peak = i;
        }
    }
    Radial { r_max, peak: r[peak], r, big_r, p, cdf, enclosed, nodes }
}

impl Radial {
    /// The radius below which the fraction `q` of the probability lies.
    pub fn quantile(&self, q: f64) -> f64 {
        let target = q * self.enclosed;
        let (mut lo, mut hi) = (0usize, GRID);
        while hi - lo > 1 {
            let mid = (lo + hi) / 2;
            if self.cdf[mid] <= target {
                lo = mid;
            } else {
                hi = mid;
            }
        }
        let span = self.cdf[hi] - self.cdf[lo];
        let t = if span > 0.0 { (target - self.cdf[lo]) / span } else { 0.0 };
        self.r[lo] + t * (self.r[hi] - self.r[lo])
    }
}

/// ⟨r⟩ = a₀ (3n² − l(l+1)) / (2Z) (Å).
pub fn mean_radius(n: usize, l: usize, z: f64) -> f64 {
    BOHR * (3.0 * (n * n) as f64 - (l * (l + 1)) as f64) / (2.0 * z)
}

/// Eₙ = −Z² Ry / n² (eV).
pub fn energy_ev(n: usize, z: f64) -> f64 {
    -z * z * RYDBERG_EV / (n * n) as f64
}

/// Upper bound of Y² over the sphere (the zonal harmonic reaches (2l+1)/4π at the pole; the others stay below twice
/// that).
fn harmonic_bound(l: usize, m: i32) -> f64 {
    let zonal = (2 * l + 1) as f64 / (4.0 * PI);
    if m == 0 {
        zonal
    } else {
        2.0 * zonal
    }
}

/// `count` points distributed as |ψ|², with the sign of ψ at each (1: positive, 0: negative).
pub fn sample(l: usize, m: i32, table: &Radial, count: usize, seed: u64) -> (Vec<f64>, Vec<u8>) {
    let mut rng = Rng::new(seed);
    let bound = harmonic_bound(l, m);
    let mut xyz = Vec::with_capacity(count * 3);
    let mut sign = Vec::with_capacity(count);
    for _ in 0..count {
        let r = table.quantile(rng.uniform());
        let (d, y) = loop {
            let cz = 2.0 * rng.uniform() - 1.0;
            let phi = 2.0 * PI * rng.uniform();
            let s = (1.0 - cz * cz).max(0.0).sqrt();
            let d = [s * dmath::cos(phi), s * dmath::sin(phi), cz];
            let y = harmonic(l, m, d);
            if rng.uniform() * bound < y * y {
                break (d, y);
            }
        };
        xyz.extend_from_slice(&[r * d[0], r * d[1], r * d[2]]);
        // R is positive at the nucleus and changes sign at every radial node
        let crossed = table.nodes.iter().filter(|x| **x < r).count();
        sign.push(u8::from((crossed % 2 == 0) == (y >= 0.0)));
    }
    (xyz, sign)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn states() -> Vec<(usize, usize, i32)> {
        let mut v = Vec::new();
        for n in 1..=4usize {
            for l in 0..n {
                for m in -(l as i32)..=(l as i32) {
                    v.push((n, l, m));
                }
            }
        }
        v
    }

    #[test]
    fn radial_normalisation_and_nodes() {
        // ∫ r² R² dr = 1 by Simpson's rule on the 4096-interval grid: tolerance 1e-8 (truncated tail < 1e-9, rule error
        // O(h⁴)); the radial nodes counted on the grid are n − l − 1
        for n in 1..=4usize {
            for l in 0..n {
                for z in [1.0, 2.0, 26.0] {
                    let t = radial_table(n, l, z);
                    assert!((t.enclosed - 1.0).abs() < 1e-8, "{n}{l} Z={z}: {}", t.enclosed);
                    assert_eq!(t.nodes.len(), n - l - 1, "{n}{l}");
                    for r in &t.nodes {
                        assert!(radial(n, l, z, *r).abs() < 1e-9);
                    }
                }
            }
        }
        // Known radii for hydrogen: the 1s maximum at a₀, the 2s node at 2a₀, the 2p maximum at 4a₀, 3s nodes at
        // (9 ∓ 3√3)a₀/2 (grid resolution for the maxima, 1e-10 for the nodes)
        let s1 = radial_table(1, 0, 1.0);
        assert!((s1.peak - BOHR).abs() < s1.r_max / GRID as f64);
        assert!((radial_table(2, 0, 1.0).nodes[0] - 2.0 * BOHR).abs() < 1e-10);
        let p2 = radial_table(2, 1, 1.0);
        assert!((p2.peak - 4.0 * BOHR).abs() < p2.r_max / GRID as f64);
        let s3 = radial_table(3, 0, 1.0);
        assert!((s3.nodes[0] - (9.0 - 3.0 * 3f64.sqrt()) / 2.0 * BOHR).abs() < 1e-10 && (s3.nodes[1] - (9.0 + 3.0 * 3f64.sqrt()) / 2.0 * BOHR).abs() < 1e-10);
        // 1s in closed form: R = 2 a₀^(−3/2) e^(−r/a₀)
        assert!((radial(1, 0, 1.0, 0.7) - 2.0 / (BOHR * BOHR.sqrt()) * (-0.7 / BOHR).exp()).abs() < 1e-13);
        assert_eq!(energy_ev(2, 1.0), -RYDBERG_EV / 4.0);
    }

    #[test]
    fn harmonics_are_orthonormal() {
        // ∫ Y_a Y_b dΩ = δ_ab: Simpson's rule with 200 intervals in cos θ (the integrand is a polynomial of degree ≤ 6
        // there, error O(h⁴) ≈ 1e-7) times 32 equal steps in φ (exact for trigonometric polynomials of degree ≤ 6);
        // tolerance 1e-6
        let all: Vec<(usize, i32)> = states().into_iter().filter(|s| s.0 == 4).map(|s| (s.1, s.2)).collect();
        let (nz, np) = (200, 32);
        for (ia, a) in all.iter().enumerate() {
            for b in &all[ia..] {
                let mut sum = 0.0;
                for i in 0..=nz {
                    let cz = -1.0 + i as f64 * 2.0 / nz as f64;
                    let s = (1.0 - cz * cz).max(0.0).sqrt();
                    let w = if i == 0 || i == nz { 1.0 } else if i % 2 == 1 { 4.0 } else { 2.0 };
                    for j in 0..np {
                        let phi = (j as f64 + 0.5) * 2.0 * PI / np as f64;
                        let d = [s * phi.cos(), s * phi.sin(), cz];
                        sum += w * harmonic(a.0, a.1, d) * harmonic(b.0, b.1, d);
                    }
                }
                sum *= 2.0 / nz as f64 / 3.0 * 2.0 * PI / np as f64;
                let want = if a == b { 1.0 } else { 0.0 };
                assert!((sum - want).abs() < 1e-6, "{a:?} {b:?}: {sum}");
            }
        }
        // The rejection bound really bounds Y² (scan of 200 × 400 directions)
        for (l, m) in &all {
            let mut top = 0.0f64;
            for i in 0..=200 {
                let cz = -1.0 + i as f64 / 100.0;
                let s = (1.0 - cz * cz).max(0.0).sqrt();
                for j in 0..400 {
                    let phi = j as f64 * 2.0 * PI / 400.0;
                    let y = harmonic(*l, *m, [s * phi.cos(), s * phi.sin(), cz]);
                    top = top.max(y * y);
                }
            }
            assert!(top <= harmonic_bound(*l, *m) * (1.0 + 1e-12), "{l} {m}: {top}");
        }
    }

    #[test]
    fn sampled_cloud_follows_the_density() {
        // 40 000 points: the mean radius is ⟨r⟩ = a₀(3n² − l(l+1))/2 within 2 % (the standard error is below 0.3 %),
        // the signs split evenly for l ≥ 1 (within 2 %), every point carries the sign of ψ, and the cloud is
        // reproducible from its seed
        for (n, l, m) in states() {
            let t = radial_table(n, l, 1.0);
            let count = 40_000;
            let (xyz, sign) = sample(l, m, &t, count, 20261113);
            assert_eq!((xyz.len(), sign.len()), (3 * count, count));
            let mut mean = 0.0;
            let mut positive = 0usize;
            for i in 0..count {
                let p = [xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2]];
                mean += (p[0] * p[0] + p[1] * p[1] + p[2] * p[2]).sqrt();
                let v = psi(n, l, m, 1.0, p);
                if v.abs() > 1e-9 {
                    assert_eq!(sign[i] == 1, v > 0.0, "{n}{l}{m} at {p:?}: ψ = {v}");
                }
                positive += sign[i] as usize;
            }
            mean /= count as f64;
            assert!((mean / mean_radius(n, l, 1.0) - 1.0).abs() < 0.02, "{n}{l}{m}: {mean}");
            if l % 2 == 1 {
                assert!((positive as f64 / count as f64 - 0.5).abs() < 0.02, "{n}{l}{m}: {positive}");
            }
            let again = sample(l, m, &t, 100, 20261113);
            assert_eq!(again.0[..], xyz[..300]);
            assert_ne!(sample(l, m, &t, 100, 7).0[..], xyz[..300]);
        }
    }

    #[test]
    fn generator_matches_the_reference_sequence() {
        // xoshiro256** from the state SplitMix64(0) gives: first outputs published with the reference implementation
        let mut r = Rng::new(0);
        assert_eq!(r.s[0], 0xE220A8397B1DCDAF);
        assert_eq!(r.s[1], 0x6E789E6AA1B965F4);
        let u = r.uniform();
        assert!((0.0..1.0).contains(&u));
        // 90 % of the 1s density lies within 2.661 a₀ (1 − e^(−2x)(1 + 2x + 2x²) = 0.9)
        let t = radial_table(1, 0, 1.0);
        assert!((t.quantile(0.9) / BOHR - 2.6612).abs() < 1e-3);
    }
}
