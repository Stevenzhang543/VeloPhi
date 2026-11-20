//! Point kinetics with six groups of delayed neutrons, and the stiff integrator of the reactor model (26.64, D277).
//!
//!   dn/dt  = ((ρ − β)/Λ)·n + Σ λᵢcᵢ + q
//!   dcᵢ/dt = (βᵢ/Λ)·n − λᵢcᵢ
//!
//! n is the fission power relative to the nominal power, cᵢ the precursor concentrations in the same units, q an
//! external source. The system is stiff (the prompt mode decays with (β − ρ)/Λ, hundreds per second, while the
//! power changes over seconds to hours), so it is integrated implicitly: the linearly implicit Rosenbrock formula
//! of order 2 with an error estimate of order 3 (Shampine and Reichelt's ode23s; L-stable, no Newton iteration, so
//! the work of a step is fixed). The Jacobian is formed by forward differences in a fixed order; the step size
//! follows the error estimate by h·clamp(0.9·err^(−1/3), 0.2, 5) with `dmath::pow`, so the sequence of steps is the
//! same on every platform.
//!
//! **Range of validity.** Point kinetics with a fixed flux shape and a mean generation time describes slow
//! transients. The integration is stopped when the reactivity comes within `PROMPT_MARGIN` of β (prompt critical):
//! beyond that the power rises on the prompt-neutron time scale, which this model does not describe and the
//! workshop does not compute (D278).

use velophi_core::dmath::pow;

/// The integration stops at ρ ≥ (1 − PROMPT_MARGIN)·β.
pub const PROMPT_MARGIN: f64 = 0.1;

/// Delayed-neutron data and generation time of a core.
#[derive(Clone, Copy, Debug)]
pub struct Kinetics {
    pub beta: [f64; 6],
    pub lambda: [f64; 6],
    /// Mean generation time Λ (s).
    pub generation: f64,
}

impl Kinetics {
    pub fn beta_total(&self) -> f64 {
        self.beta.iter().sum()
    }

    /// The reactivity at which the model stops.
    pub fn limit(&self) -> f64 {
        (1.0 - PROMPT_MARGIN) * self.beta_total()
    }

    /// Precursor concentrations in equilibrium with the power n.
    pub fn equilibrium(&self, n: f64) -> [f64; 6] {
        let mut c = [0.0; 6];
        for i in 0..6 {
            c[i] = self.beta[i] * n / (self.generation * self.lambda[i]);
        }
        c
    }

    /// Right-hand side of the kinetics equations: (dn/dt, dc/dt).
    pub fn rates(&self, rho: f64, n: f64, c: &[f64], source: f64) -> (f64, [f64; 6]) {
        let mut dn = (rho - self.beta_total()) / self.generation * n + source;
        let mut dc = [0.0; 6];
        for i in 0..6 {
            dn += self.lambda[i] * c[i];
            dc[i] = self.beta[i] / self.generation * n - self.lambda[i] * c[i];
        }
        (dn, dc)
    }

    /// The in-hour equation ρ = Λω + Σ βᵢω/(ω + λᵢ): its algebraically largest root ω (1/s) for a reactivity
    /// below β. The stable period is 1/ω (negative for a negative reactivity; ω = 0 at ρ = 0).
    pub fn inhour(&self, rho: f64) -> f64 {
        if rho == 0.0 {
            return 0.0;
        }
        let f = |w: f64| -> f64 {
            let mut s = self.generation * w;
            for i in 0..6 {
                s += self.beta[i] * w / (w + self.lambda[i]);
            }
            s - rho
        };
        // the root lies between the pole at −λ_min and ρ/Λ; f rises monotonically there
        let lmin = self.lambda.iter().fold(f64::INFINITY, |m, &l| if l < m { l } else { m });
        let (mut lo, mut hi) = if rho > 0.0 { (0.0, rho / self.generation) } else { (-lmin * (1.0 - 1e-15), 0.0) };
        for _ in 0..200 {
            let mid = 0.5 * (lo + hi);
            if mid == lo || mid == hi {
                break;
            }
            if f(mid) > 0.0 {
                hi = mid;
            } else {
                lo = mid;
            }
        }
        0.5 * (lo + hi)
    }
}

/// Options of the stiff integrator.
#[derive(Clone, Debug)]
pub struct Options {
    pub rtol: f64,
    /// Absolute tolerance per component.
    pub atol: Vec<f64>,
    pub h_max: f64,
    pub max_steps: usize,
}

/// Why an integration ended.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum End {
    /// The end time was reached.
    Reached,
    /// The observer asked to stop after a step.
    Stopped,
    /// The step size fell below what the time can resolve, or the step limit was hit.
    Failed,
}

#[derive(Clone, Copy, Debug)]
pub struct Outcome {
    pub end: End,
    pub t: f64,
    pub steps: usize,
    pub rejected: usize,
}

/// LU factorisation with partial pivoting in place (row-major n×n); false when singular.
fn lu_factor(n: usize, a: &mut [f64], piv: &mut [usize]) -> bool {
    for k in 0..n {
        let mut p = k;
        let mut best = a[k * n + k].abs();
        for i in k + 1..n {
            let v = a[i * n + k].abs();
            if v > best {
                best = v;
                p = i;
            }
        }
        if !(best > 0.0) {
            return false;
        }
        piv[k] = p;
        if p != k {
            for j in 0..n {
                a.swap(k * n + j, p * n + j);
            }
        }
        let d = a[k * n + k];
        for i in k + 1..n {
            let m = a[i * n + k] / d;
            a[i * n + k] = m;
            if m != 0.0 {
                for j in k + 1..n {
                    a[i * n + j] -= m * a[k * n + j];
                }
            }
        }
    }
    true
}

fn lu_solve(n: usize, a: &[f64], piv: &[usize], b: &mut [f64]) {
    for k in 0..n {
        b.swap(k, piv[k]);
        let bk = b[k];
        for i in k + 1..n {
            b[i] -= a[i * n + k] * bk;
        }
    }
    for k in (0..n).rev() {
        let mut s = b[k];
        for j in k + 1..n {
            s -= a[k * n + j] * b[j];
        }
        b[k] = s / a[k * n + k];
    }
}

/// Integrate the autonomous system y' = f(y) from `t0` to `t1` (the system keeps its own clock if it needs one).
/// `h` is the step to try first and receives the step to try next. `observe(t, y)` is called after every accepted
/// step and may return true to stop there.
pub fn integrate(f: &mut dyn FnMut(&[f64], &mut [f64]), t0: f64, t1: f64, y: &mut [f64], h: &mut f64, opts: &Options, observe: &mut dyn FnMut(f64, &[f64]) -> bool) -> Outcome {
    let n = y.len();
    let d = 1.0 / (2.0 + std::f64::consts::SQRT_2);
    let e32 = 6.0 + std::f64::consts::SQRT_2;
    let mut t = t0;
    let mut out = Outcome { end: End::Reached, t, steps: 0, rejected: 0 };
    let (mut f0, mut f1, mut f2) = (vec![0.0; n], vec![0.0; n], vec![0.0; n]);
    let (mut k1, mut k2, mut k3) = (vec![0.0; n], vec![0.0; n], vec![0.0; n]);
    let (mut yt, mut ynew, mut fp) = (vec![0.0; n], vec![0.0; n], vec![0.0; n]);
    let mut jac = vec![0.0; n * n];
    let mut w = vec![0.0; n * n];
    let mut piv = vec![0usize; n];
    let mut sc = vec![1.0; n];
    f(y, &mut f0);
    if !(*h > 0.0) || !h.is_finite() {
        *h = (t1 - t0) * 1e-3;
    }
    let mut fresh = false;
    while t < t1 {
        if out.steps + out.rejected >= opts.max_steps {
            out.end = End::Failed;
            break;
        }
        let mut step = if *h > opts.h_max { opts.h_max } else { *h };
        let mut last = false;
        if t + step >= t1 || t1 - (t + step) < 1e-12 * (t1 - t0).abs() {
            step = t1 - t;
            last = true;
        }
        let resolution = 1e-13 * t.abs().max(t1.abs()).max(1e-300);
        if last && !(step > resolution) {
            // what is left is below the resolution of the clock: the end is reached
            t = t1;
            break;
        }
        if !(step > resolution) {
            out.end = End::Failed;
            break;
        }
        if !fresh {
            // Jacobian by forward differences, one column per variable
            for j in 0..n {
                let save = y[j];
                let delta = 1.4901161193847656e-8 * save.abs().max(opts.atol[j] * 1e3).max(1e-30);
                y[j] = save + delta;
                f(y, &mut fp);
                y[j] = save;
                for i in 0..n {
                    jac[i * n + j] = (fp[i] - f0[i]) / delta;
                }
            }
            fresh = true;
        }
        // The unknowns differ by twenty orders of magnitude (temperatures, concentrations in 10²⁴ cm⁻³, joules):
        // the linear system is solved in units of each component's tolerance, so that the rounding of the
        // elimination stays below every tolerance.
        for i in 0..n {
            sc[i] = opts.atol[i] + opts.rtol * y[i].abs();
        }
        for i in 0..n {
            for j in 0..n {
                w[i * n + j] = -step * d * jac[i * n + j] * sc[j] / sc[i];
            }
            w[i * n + i] += 1.0;
        }
        if !lu_factor(n, &mut w, &mut piv) {
            *h = step * 0.5;
            out.rejected += 1;
            continue;
        }
        for i in 0..n {
            k1[i] = f0[i] / sc[i];
        }
        lu_solve(n, &w, &piv, &mut k1);
        for i in 0..n {
            k1[i] *= sc[i];
        }
        for i in 0..n {
            yt[i] = y[i] + 0.5 * step * k1[i];
        }
        f(&yt, &mut f1);
        for i in 0..n {
            k2[i] = (f1[i] - k1[i]) / sc[i];
        }
        lu_solve(n, &w, &piv, &mut k2);
        for i in 0..n {
            k2[i] = k2[i] * sc[i] + k1[i];
            ynew[i] = y[i] + step * k2[i];
        }
        f(&ynew, &mut f2);
        for i in 0..n {
            k3[i] = (f2[i] - e32 * (k2[i] - f1[i]) - 2.0 * (k1[i] - f0[i])) / sc[i];
        }
        lu_solve(n, &w, &piv, &mut k3);
        for i in 0..n {
            k3[i] *= sc[i];
        }
        let mut err = 0.0f64;
        let mut finite = true;
        for i in 0..n {
            let e = step / 6.0 * (k1[i] - 2.0 * k2[i] + k3[i]);
            let scale = opts.atol[i] + opts.rtol * y[i].abs().max(ynew[i].abs());
            let r = (e / scale).abs();
            if !r.is_finite() || !ynew[i].is_finite() {
                finite = false;
            }
            if r > err {
                err = r;
            }
        }
        if !finite {
            *h = step * 0.25;
            out.rejected += 1;
            continue;
        }
        let factor = if err > 0.0 { (0.9 * pow(err, -1.0 / 3.0)).clamp(0.2, 5.0) } else { 5.0 };
        if err > 1.0 {
            *h = step * factor;
            out.rejected += 1;
            continue;
        }
        // accepted
        t = if last { t1 } else { t + step };
        y.copy_from_slice(&ynew);
        std::mem::swap(&mut f0, &mut f2);
        fresh = false;
        out.steps += 1;
        // a step shortened to hit the end time says nothing about the next step: keep the larger proposal
        let proposal = step * factor;
        *h = if last && proposal < *h { *h } else { proposal };
        out.t = t;
        if observe(t, y) {
            if t < t1 {
                out.end = End::Stopped;
            }
            break;
        }
    }
    out.t = t;
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn data() -> Kinetics {
        Kinetics { beta: crate::reactor::reactor::BETA, lambda: crate::reactor::reactor::LAMBDA, generation: 2e-5 }
    }

    #[test]
    fn inhour_roots() {
        let k = data();
        for rho in [1e-4, 1e-3, 3e-3, -1e-3, -5e-2] {
            let w = k.inhour(rho);
            let mut s = k.generation * w;
            for i in 0..6 {
                s += k.beta[i] * w / (w + k.lambda[i]);
            }
            assert!((s - rho).abs() < 1e-12 * rho.abs(), "rho {rho}: {s}");
            assert!((w > 0.0) == (rho > 0.0));
        }
        // a large negative reactivity: the period tends to −1/λ₁ (about −80 s)
        assert!((1.0 / k.inhour(-0.5) + 1.0 / 0.013).abs() < 2.0);
    }

    #[test]
    fn stable_period_after_a_step() {
        // step of +0.1 β from equilibrium: after the transients the power rises as e^{ωt} with ω of the in-hour equation
        let k = data();
        let rho = 0.1 * k.beta_total();
        let mut y = vec![1.0; 7];
        y[1..7].copy_from_slice(&k.equilibrium(1.0));
        let mut f = |y: &[f64], dy: &mut [f64]| {
            let (dn, dc) = k.rates(rho, y[0], &y[1..7], 0.0);
            dy[0] = dn;
            dy[1..7].copy_from_slice(&dc);
        };
        let opts = Options { rtol: 1e-8, atol: vec![1e-14; 7], h_max: 1e9, max_steps: 2_000_000 };
        let mut h = 1e-6;
        let mut never = |_: f64, _: &[f64]| false;
        let o = integrate(&mut f, 0.0, 300.0, &mut y, &mut h, &opts, &mut never);
        assert_eq!(o.end, End::Reached);
        let n300 = y[0];
        let o = integrate(&mut f, 300.0, 400.0, &mut y, &mut h, &opts, &mut never);
        assert_eq!(o.end, End::Reached);
        let omega = (y[0] / n300).ln() / 100.0;
        assert!((omega / k.inhour(rho) - 1.0).abs() < 1e-5, "{omega} {}", k.inhour(rho));
    }
}
