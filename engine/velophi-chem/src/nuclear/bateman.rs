//! Decay networks (26.64, D276): N' = A·N with A lower triangular in a topological order of the network
//! (A_ii = −λ_i, A_ij = b_ij·λ_j for a decay j → i with branching fraction b_ij).
//!
//! Two solutions, chosen value by value:
//!
//! 1. **The analytic Bateman solution** N_i(t) = Σ_k c_ik·e^{−λ_k t} for networks with branching: the coefficients
//!    follow from c_ik = Σ_j A_ij·c_jk / (λ_i − λ_k) (k < i) and c_ii = N_i(0) − Σ_k c_ik. The formula divides by
//!    differences of decay constants and sums terms of both signs, so equal or nearly equal constants and deep
//!    members at early times lose digits. Every coefficient therefore carries a running first-order bound of its
//!    rounding error, and a value is accepted only when its bound is below `TOLERANCE` (relative).
//!
//! 2. **The transition matrix exp(A·t) without subtraction**, for the values the bound rejects (and for equal
//!    constants, where the closed form does not exist): the off-diagonal entries of exp(A·τ) for a small τ are a
//!    series of non-negative terms (uniformisation: e^{−μτ}·Σ (A + μI)^m τ^m / m! with μ = max λ), and doubling the
//!    time keeps them non-negative: E_ij(2τ) = E_ij(τ)·(E_ii(τ) + E_jj(τ)) + Σ_{j<k<i} E_ik(τ)·E_kj(τ). The diagonal
//!    is never squared: E_ii(τ) = e^{−λ_i τ} is evaluated directly at every level, which keeps the slow members
//!    exact when the decay constants of a chain span more than 16 orders of magnitude (²³⁸U … ²¹⁴Po: 10²¹), where a
//!    plain scaling-and-squaring loses them. No entry is formed by cancellation; the relative error of an entry is
//!    bounded to first order by (n − 1)·(M·(n + 3) + s·(n + 2))·2⁻⁵³ for n members, M series terms and s doublings
//!    (about 10⁻¹¹ for the longest natural series; `fallback_bound`). Entries below about 10⁻²⁹⁰ of the initial
//!    amount may be lost to underflow.
//!
//! Only IEEE-754 basic operations and `dmath::exp`; loop counts depend on the data only.

use velophi_core::dmath::exp;

/// Unit round-off 2⁻⁵³.
const U: f64 = 1.1102230246251565e-16;

/// Relative bound below which an analytic value is accepted.
pub const TOLERANCE: f64 = 1e-11;

/// A decay network in topological order: member i is fed only by members j < i.
#[derive(Clone, Debug, Default)]
pub struct Network {
    /// Decay constants (1/s); 0 for a stable member.
    pub lambda: Vec<f64>,
    /// `feed[i]`: the members j < i that decay to i, with the rate b_ij·λ_j (sorted by j, each j once).
    pub feed: Vec<Vec<(usize, f64)>>,
}

impl Network {
    pub fn len(&self) -> usize {
        self.lambda.len()
    }
    pub fn is_empty(&self) -> bool {
        self.lambda.is_empty()
    }
}

/// The coefficients of the analytic solution with their error bounds.
pub struct Analytic {
    n: usize,
    lambda: Vec<f64>,
    /// c[i·n + k], k ≤ i.
    c: Vec<f64>,
    /// Bound of the rounding error of c[i·n + k].
    e: Vec<f64>,
    /// The closed form does not exist for this member (a decay constant equal to an ancestor's).
    degenerate: Vec<bool>,
}

/// Coefficients of N_i(t) = Σ_k c_ik·e^{−λ_k t} for the initial amounts `n0`.
pub fn analytic(net: &Network, n0: &[f64]) -> Analytic {
    let n = net.len();
    let mut c = vec![0.0; n * n];
    let mut e = vec![0.0; n * n];
    let mut degenerate = vec![false; n];
    for i in 0..n {
        degenerate[i] = net.feed[i].iter().any(|&(j, r)| r > 0.0 && degenerate[j]);
        let (mut sum, mut sum_abs, mut sum_e) = (0.0, 0.0, 0.0);
        for k in 0..i {
            let (mut s, mut s_abs, mut s_e, mut terms) = (0.0, 0.0, 0.0, 0usize);
            for &(j, r) in &net.feed[i] {
                if j < k {
                    continue;
                }
                let cjk = c[j * n + k];
                let ejk = e[j * n + k];
                if cjk == 0.0 && ejk == 0.0 {
                    continue;
                }
                s += r * cjk;
                s_abs += (r * cjk).abs();
                s_e += r * ejk;
                terms += 1;
            }
            if terms == 0 {
                continue;
            }
            let d = net.lambda[i] - net.lambda[k];
            if d == 0.0 {
                degenerate[i] = true;
                continue;
            }
            let cik = s / d;
            let eik = (s_e + (terms + 1) as f64 * U * s_abs) / d.abs() + 2.0 * U * cik.abs();
            c[i * n + k] = cik;
            e[i * n + k] = eik;
            sum += cik;
            sum_abs += cik.abs();
            sum_e += eik;
        }
        let start = n0.get(i).copied().unwrap_or(0.0);
        c[i * n + i] = start - sum;
        e[i * n + i] = sum_e + (i + 1) as f64 * U * (start.abs() + sum_abs);
    }
    Analytic { n, lambda: net.lambda.clone(), c, e, degenerate }
}

impl Analytic {
    /// Amounts at time t and, per member, whether the value is accepted; returns the largest accepted relative bound.
    /// `decay` is work space of length n.
    pub fn at(&self, t: f64, value: &mut [f64], accepted: &mut [bool], decay: &mut [f64]) -> f64 {
        let n = self.n;
        for k in 0..n {
            decay[k] = exp(-self.lambda[k] * t);
        }
        let mut worst = 0.0f64;
        for i in 0..n {
            let (mut v, mut b) = (0.0, 0.0);
            for k in 0..=i {
                let cik = self.c[i * n + k];
                v += cik * decay[k];
                b += (self.e[i * n + k] + (i + 3) as f64 * U * cik.abs()) * decay[k];
            }
            value[i] = v;
            accepted[i] = !self.degenerate[i] && ((v == 0.0 && b == 0.0) || (v > 0.0 && b <= TOLERANCE * v));
            if accepted[i] && v > 0.0 {
                let rel = b / v;
                if rel > worst {
                    worst = rel;
                }
            }
        }
        worst
    }
}

/// exp(A·t) of a network (row-major n×n, lower triangular), every entry a sum of non-negative terms; also the number
/// of series terms and of doublings used (for the error bound).
pub fn transition(net: &Network, t: f64) -> (Vec<f64>, usize, usize) {
    let n = net.len();
    let mut e = vec![0.0; n * n];
    for i in 0..n {
        e[i * n + i] = 1.0;
    }
    let mu = net.lambda.iter().fold(0.0f64, |m, &l| if l > m { l } else { m });
    if !(t > 0.0) || !t.is_finite() || mu == 0.0 {
        return (e, 0, 0);
    }
    // τ = t / 2^s with μτ ≤ 1/2 (halving is exact)
    let mut tau = t;
    let mut s = 0usize;
    while mu * tau > 0.5 && s < 2000 {
        tau *= 0.5;
        s += 1;
    }
    // B = A + μI ≥ 0
    let mut b = vec![0.0; n * n];
    for i in 0..n {
        b[i * n + i] = mu - net.lambda[i];
        for &(j, r) in &net.feed[i] {
            b[i * n + j] = r;
        }
    }
    // Σ (Bτ)^m / m!
    let mut term = e.clone();
    let mut next = vec![0.0; n * n];
    let mut terms = 0usize;
    for m in 1..=60usize {
        let f = tau / m as f64;
        let mut small = true;
        for i in 0..n {
            for j in 0..=i {
                let mut acc = 0.0;
                for k in j..=i {
                    acc += term[i * n + k] * b[k * n + j];
                }
                let v = acc * f;
                next[i * n + j] = v;
                let sum = e[i * n + j] + v;
                e[i * n + j] = sum;
                if v > 1e-19 * sum {
                    small = false;
                }
            }
        }
        std::mem::swap(&mut term, &mut next);
        terms = m;
        if small {
            break;
        }
    }
    let f = exp(-mu * tau);
    for v in e.iter_mut() {
        *v *= f;
    }
    // the diagonal directly, then s doublings of the off-diagonal part
    let mut time = tau;
    for i in 0..n {
        e[i * n + i] = exp(-net.lambda[i] * time);
    }
    let mut sq = vec![0.0; n * n];
    for _ in 0..s {
        double(n, &e, &mut sq);
        time *= 2.0;
        for i in 0..n {
            sq[i * n + i] = exp(-net.lambda[i] * time);
        }
        std::mem::swap(&mut e, &mut sq);
    }
    (e, terms, s)
}

/// Off-diagonal entries of E(2τ) from E(τ) (the diagonal of `out` is left for the caller).
fn double(n: usize, e: &[f64], out: &mut [f64]) {
    for i in 0..n {
        for j in 0..i {
            let mut acc = e[i * n + j] * (e[i * n + i] + e[j * n + j]);
            for k in j + 1..i {
                acc += e[i * n + k] * e[k * n + j];
            }
            out[i * n + j] = acc;
        }
    }
}

fn apply(n: usize, e: &[f64], v: &[f64], out: &mut [f64]) {
    for i in 0..n {
        let mut acc = 0.0;
        for j in 0..=i {
            acc += e[i * n + j] * v[j];
        }
        out[i] = acc;
    }
}

/// First-order bound of the relative error of an entry of `transition` (module text).
pub fn fallback_bound(n: usize, terms: usize, doublings: usize) -> f64 {
    let n1 = if n > 1 { (n - 1) as f64 } else { 1.0 };
    n1 * ((terms * (n + 3)) as f64 + (doublings * (n + 2)) as f64) * U
}

/// The amounts of a network at a list of times.
#[derive(Clone, Debug, Default)]
pub struct Outcome {
    /// Row-major by member: `amounts[i·T + k]` is member i at time k.
    pub amounts: Vec<f64>,
    /// Number of values from the analytic solution and from the transition matrix.
    pub analytic: usize,
    pub fallback: usize,
    /// Largest relative error bound of a returned value (first order).
    pub bound: f64,
}

/// Amounts at arbitrary times t ≥ 0.
pub fn solve_times(net: &Network, n0: &[f64], times: &[f64]) -> Outcome {
    let n = net.len();
    let count = times.len();
    let mut out = Outcome { amounts: vec![0.0; n * count], ..Default::default() };
    if n == 0 {
        return out;
    }
    let start: Vec<f64> = (0..n).map(|i| n0.get(i).copied().unwrap_or(0.0)).collect();
    let closed = analytic(net, &start);
    let (mut value, mut ok, mut work, mut exact) = (vec![0.0; n], vec![false; n], vec![0.0; n], vec![0.0; n]);
    for (k, &t) in times.iter().enumerate() {
        let worst = closed.at(t, &mut value, &mut ok, &mut work);
        if worst > out.bound {
            out.bound = worst;
        }
        if ok.iter().any(|a| !a) {
            let (e, terms, doublings) = transition(net, t);
            apply(n, &e, &start, &mut exact);
            let b = fallback_bound(n, terms, doublings);
            if b > out.bound {
                out.bound = b;
            }
        }
        for i in 0..n {
            if ok[i] {
                out.amounts[i * count + k] = value[i];
                out.analytic += 1;
            } else {
                out.amounts[i * count + k] = exact[i];
                out.fallback += 1;
            }
        }
    }
    out
}

/// Amounts on the uniform grid t_k = t_end·k/(samples − 1); returns the times too. Values the analytic bound rejects
/// come from the transition matrices of the step and its doublings (N(k·dt) is the product of the matrices of the
/// binary digits of k applied to N(0): no more than log₂ k products).
pub fn solve_grid(net: &Network, n0: &[f64], t_end: f64, samples: usize) -> (Vec<f64>, Outcome) {
    let n = net.len();
    let samples = samples.max(2);
    let times: Vec<f64> = (0..samples).map(|k| t_end * k as f64 / (samples - 1) as f64).collect();
    let mut out = Outcome { amounts: vec![0.0; n * samples], ..Default::default() };
    if n == 0 {
        return (times, out);
    }
    let start: Vec<f64> = (0..n).map(|i| n0.get(i).copied().unwrap_or(0.0)).collect();
    let closed = analytic(net, &start);
    let (mut value, mut ok, mut work) = (vec![0.0; n], vec![false; n], vec![0.0; n]);
    let (mut exact, mut tmp) = (vec![0.0; n], vec![0.0; n]);
    // transition matrices of dt·2^l, built when first needed
    let mut levels: Vec<Vec<f64>> = Vec::new();
    let mut level_bound = 0.0;
    for (k, &t) in times.iter().enumerate() {
        let worst = closed.at(t, &mut value, &mut ok, &mut work);
        if worst > out.bound {
            out.bound = worst;
        }
        if ok.iter().any(|a| !a) {
            if levels.is_empty() {
                let dt = t_end / (samples - 1) as f64;
                let (e, terms, doublings) = transition(net, dt);
                let mut bits = 0usize;
                while (1usize << bits) < samples {
                    bits += 1;
                }
                level_bound = fallback_bound(n, terms, doublings + bits) * (bits.max(1)) as f64;
                levels.push(e);
                let mut time = dt;
                for l in 1..bits.max(1) {
                    let mut sq = vec![0.0; n * n];
                    double(n, &levels[l - 1], &mut sq);
                    time *= 2.0;
                    for i in 0..n {
                        sq[i * n + i] = exp(-net.lambda[i] * time);
                    }
                    levels.push(sq);
                }
            }
            exact.copy_from_slice(&start);
            let mut rest = k;
            let mut l = 0;
            while rest > 0 {
                if rest & 1 == 1 {
                    apply(n, &levels[l], &exact, &mut tmp);
                    std::mem::swap(&mut exact, &mut tmp);
                }
                rest >>= 1;
                l += 1;
            }
            if level_bound > out.bound {
                out.bound = level_bound;
            }
        }
        for i in 0..n {
            if ok[i] {
                out.amounts[i * samples + k] = value[i];
                out.analytic += 1;
            } else {
                out.amounts[i * samples + k] = exact[i];
                out.fallback += 1;
            }
        }
    }
    (times, out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chain(lambda: &[f64]) -> Network {
        let n = lambda.len();
        Network { lambda: lambda.to_vec(), feed: (0..n).map(|i| if i > 0 { vec![(i - 1, lambda[i - 1])] } else { Vec::new() }).collect() }
    }

    #[test]
    fn two_members_closed_form() {
        // A → B → C: N_B = N₀ λ₁/(λ₂ − λ₁) (e^{−λ₁t} − e^{−λ₂t})
        let net = chain(&[1.0, 3.0, 0.0]);
        let times = [0.0, 0.1, 0.7, 2.0, 5.0, 40.0];
        let r = solve_times(&net, &[1000.0, 0.0, 0.0], &times);
        for (k, &t) in times.iter().enumerate() {
            let nb = 1000.0 * 0.5 * ((-t).exp() - (-3.0 * t).exp());
            assert!((r.amounts[times.len() + k] - nb).abs() <= 1e-12 * nb.max(1e-300), "t {t}: {} {}", r.amounts[times.len() + k], nb);
            let total: f64 = (0..3).map(|i| r.amounts[i * times.len() + k]).sum();
            assert!((total - 1000.0).abs() < 1e-12 * 1000.0);
        }
    }

    #[test]
    fn equal_and_nearly_equal_constants() {
        // equal: N₂ = N₀λt e^{−λt}, N₃ = N₀(λt)²/2 e^{−λt} — the closed form does not exist, the matrix does
        let net = chain(&[0.5, 0.5, 0.5, 0.0]);
        let times = [0.3, 1.0, 4.0, 30.0];
        let r = solve_times(&net, &[1.0, 0.0, 0.0, 0.0], &times);
        assert!(r.fallback > 0);
        for (k, &t) in times.iter().enumerate() {
            let x: f64 = 0.5 * t;
            let e = (-x).exp();
            assert!((r.amounts[times.len() + k] - x * e).abs() < 1e-14 * x * e, "t {t}");
            assert!((r.amounts[2 * times.len() + k] - x * x / 2.0 * e).abs() < 1e-14 * x * x * e);
            let total: f64 = (0..4).map(|i| r.amounts[i * times.len() + k]).sum();
            assert!((total - 1.0).abs() < 1e-14);
        }
        // nearly equal (relative difference 10⁻⁹): N₂ = N₀ λ₁ t e^{−λ₁t}·(1 − e^{−δt})/(δt)
        let (l1, d) = (0.7f64, 0.7e-9f64);
        let net = chain(&[l1, l1 + d, 0.0]);
        let r = solve_times(&net, &[1.0, 0.0, 0.0], &[2.0]);
        let x = d * 2.0;
        let reference = l1 * 2.0 * (-l1 * 2.0).exp() * (1.0 - x / 2.0 + x * x / 6.0);
        assert!((r.amounts[1] - reference).abs() < 1e-13 * reference, "{} {}", r.amounts[1], reference);
    }

    #[test]
    fn stiff_chain_keeps_the_slow_member() {
        // decay constants 21 orders of magnitude apart: the parent must still decay, the daughter sit in secular
        // equilibrium λ₁N₁ = λ₂N₂
        let (l1, l2) = (4.9e-18, 4.2e3);
        let net = chain(&[l1, l2, 0.0]);
        let t = 1.0e17;
        let (e, _, _) = transition(&net, t);
        assert!((e[0] - (-l1 * t).exp()).abs() < 1e-15);
        let n2 = e[3];
        let reference = l1 / (l2 - l1) * (-l1 * t).exp();
        assert!((n2 - reference).abs() < 1e-12 * reference, "{n2} {reference}");
        let total = e[0] + e[3] + e[6];
        assert!((total - 1.0).abs() < 1e-13, "{total}");
    }

    #[test]
    fn branching_and_grid() {
        // A → B (30 %), A → C (70 %), B → D, C → D
        let net = Network { lambda: vec![2.0, 0.3, 5.0, 0.0], feed: vec![vec![], vec![(0, 0.6)], vec![(0, 1.4)], vec![(1, 0.3), (2, 5.0)]] };
        let (times, grid) = solve_grid(&net, &[10.0, 0.0, 0.0, 0.0], 12.0, 49);
        let free = solve_times(&net, &[10.0, 0.0, 0.0, 0.0], &times);
        for k in 0..times.len() {
            let t = times[k];
            let nb = 10.0 * 0.6 / (0.3 - 2.0) * ((-2.0 * t).exp() - (-0.3 * t).exp());
            assert!((grid.amounts[times.len() + k] - nb).abs() <= 1e-12 * nb.abs().max(1e-300), "t {t}");
            for i in 0..4 {
                let (a, b) = (grid.amounts[i * times.len() + k], free.amounts[i * times.len() + k]);
                assert!((a - b).abs() <= 1e-11 * b.abs(), "member {i} t {t}: {a} {b}");
            }
            let total: f64 = (0..4).map(|i| grid.amounts[i * times.len() + k]).sum();
            assert!((total - 10.0).abs() < 1e-12 * 10.0);
        }
    }
}
