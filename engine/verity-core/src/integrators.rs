//! One-step integrators (port of `src/core/solver/integrators.ts`). The clock entry (scenes with variable
//! forces) is set exactly to t₀ + cᵢ·h at every stage.

use crate::js::js_max;
use crate::message::SimResult;

/// Right-hand side f of Ẋ = f(X), written into `out`.
pub type Rhs<'a> = dyn FnMut(&[f64], &mut [f64]) -> SimResult<()> + 'a;

const A21: f64 = 1.0 / 5.0;
const A31: f64 = 3.0 / 40.0;
const A32: f64 = 9.0 / 40.0;
const A41: f64 = 44.0 / 45.0;
const A42: f64 = -56.0 / 15.0;
const A43: f64 = 32.0 / 9.0;
const A51: f64 = 19372.0 / 6561.0;
const A52: f64 = -25360.0 / 2187.0;
const A53: f64 = 64448.0 / 6561.0;
const A54: f64 = -212.0 / 729.0;
const A61: f64 = 9017.0 / 3168.0;
const A62: f64 = -355.0 / 33.0;
const A63: f64 = 46732.0 / 5247.0;
const A64: f64 = 49.0 / 176.0;
const A65: f64 = -5103.0 / 18656.0;
const B1: f64 = 35.0 / 384.0;
const B3: f64 = 500.0 / 1113.0;
const B4: f64 = 125.0 / 192.0;
const B5: f64 = -2187.0 / 6784.0;
const B6: f64 = 11.0 / 84.0;
const E1: f64 = 71.0 / 57600.0;
const E3: f64 = -71.0 / 16695.0;
const E4: f64 = 71.0 / 1920.0;
const E5: f64 = -17253.0 / 339200.0;
const E6: f64 = 22.0 / 525.0;
const E7: f64 = -1.0 / 40.0;
const C89: f64 = 8.0 / 9.0;

/// Result of one integrator step.
#[derive(Clone, Debug)]
pub struct StepResult {
    pub x: Vec<f64>,
    pub err: f64,
    /// Dormand–Prince: f(X) at the end of the step.
    pub k7: Option<Vec<f64>>,
}

/// Error control of an adaptive step.
#[derive(Clone, Copy, Debug)]
pub struct ErrorControl {
    pub rel_tol: f64,
    pub abs_tol: f64,
    pub count: usize,
}

/// Stage buffers reused between steps (their contents never leak into a result).
#[derive(Default, Clone, Debug)]
pub struct Stages {
    k: [Vec<f64>; 6],
    k1: Vec<f64>,
}

impl Stages {
    fn ensure(&mut self, n: usize) {
        for b in self.k.iter_mut() {
            if b.len() != n {
                *b = vec![0.0; n];
            }
        }
        if self.k1.len() != n {
            self.k1 = vec![0.0; n];
        }
    }
}

/// Dormand–Prince 5(4); k1 = f(X0) may be passed in.
pub fn dopri5_step(f: &mut Rhs, x0: &[f64], h: f64, ctl: &ErrorControl, k1_in: Option<&[f64]>, clock: Option<usize>, st: &mut Stages) -> SimResult<StepResult> {
    let n = x0.len();
    let x0 = &x0[..n];
    st.ensure(n);
    let Stages { k, k1: k1_own } = st;
    let k1: &[f64] = match k1_in {
        Some(k1) => k1,
        None => {
            f(x0, k1_own)?;
            k1_own
        }
    };
    let [k2, k3, k4, k5, k6, y] = k;
    let (k1, k2, k3, k4, k5, k6, y) = (&k1[..n], &mut k2[..n], &mut k3[..n], &mut k4[..n], &mut k5[..n], &mut k6[..n], &mut y[..n]);
    let mut k7 = vec![0.0; n];
    let t0 = match clock {
        Some(c) => x0[c],
        None => 0.0,
    };
    for ((yi, &x), &a) in y.iter_mut().zip(x0).zip(k1.iter()) {
        *yi = x + h * (A21 * a);
    }
    if let Some(c) = clock {
        y[c] = t0 + 0.2 * h;
    }
    f(y, k2)?;
    for i in 0..n {
        y[i] = x0[i] + h * (A31 * k1[i] + A32 * k2[i]);
    }
    if let Some(c) = clock {
        y[c] = t0 + 0.3 * h;
    }
    f(y, k3)?;
    for i in 0..n {
        y[i] = x0[i] + h * (A41 * k1[i] + A42 * k2[i] + A43 * k3[i]);
    }
    if let Some(c) = clock {
        y[c] = t0 + 0.8 * h;
    }
    f(y, k4)?;
    for i in 0..n {
        y[i] = x0[i] + h * (A51 * k1[i] + A52 * k2[i] + A53 * k3[i] + A54 * k4[i]);
    }
    if let Some(c) = clock {
        y[c] = t0 + C89 * h;
    }
    f(y, k5)?;
    for i in 0..n {
        y[i] = x0[i] + h * (A61 * k1[i] + A62 * k2[i] + A63 * k3[i] + A64 * k4[i] + A65 * k5[i]);
    }
    if let Some(c) = clock {
        y[c] = t0 + h;
    }
    f(y, k6)?;
    let mut x1 = vec![0.0; n];
    for i in 0..n {
        x1[i] = x0[i] + h * (B1 * k1[i] + B3 * k3[i] + B4 * k4[i] + B5 * k5[i] + B6 * k6[i]);
    }
    if let Some(c) = clock {
        x1[c] = t0 + h;
    }
    f(&x1, &mut k7)?;
    let mut sum = 0.0;
    for i in 0..ctl.count {
        let e = h * (E1 * k1[i] + E3 * k3[i] + E4 * k4[i] + E5 * k5[i] + E6 * k6[i] + E7 * k7[i]);
        let sc = ctl.abs_tol + ctl.rel_tol * js_max(x0[i].abs(), x1[i].abs());
        let r = e / sc;
        sum += r * r;
    }
    Ok(StepResult { x: x1, err: (sum / js_max(1.0, ctl.count as f64)).sqrt(), k7: Some(k7) })
}

/// Classical Runge–Kutta, fixed step.
pub fn rk4_step(f: &mut Rhs, x0: &[f64], h: f64, k1_in: Option<&[f64]>, clock: Option<usize>) -> SimResult<StepResult> {
    let n = x0.len();
    let k1_own;
    let k1: &[f64] = match k1_in {
        Some(k1) => k1,
        None => {
            let mut v = vec![0.0; n];
            f(x0, &mut v)?;
            k1_own = v;
            &k1_own
        }
    };
    let mut k2 = vec![0.0; n];
    let mut k3 = vec![0.0; n];
    let mut k4 = vec![0.0; n];
    let mut y = vec![0.0; n];
    let t0 = match clock {
        Some(c) => x0[c],
        None => 0.0,
    };
    for i in 0..n {
        y[i] = x0[i] + 0.5 * h * k1[i];
    }
    if let Some(c) = clock {
        y[c] = t0 + 0.5 * h;
    }
    f(&y, &mut k2)?;
    for i in 0..n {
        y[i] = x0[i] + 0.5 * h * k2[i];
    }
    if let Some(c) = clock {
        y[c] = t0 + 0.5 * h;
    }
    f(&y, &mut k3)?;
    for i in 0..n {
        y[i] = x0[i] + h * k3[i];
    }
    if let Some(c) = clock {
        y[c] = t0 + h;
    }
    f(&y, &mut k4)?;
    let mut x1 = vec![0.0; n];
    for i in 0..n {
        x1[i] = x0[i] + (h / 6.0) * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i]);
    }
    if let Some(c) = clock {
        x1[c] = t0 + h;
    }
    Ok(StepResult { x: x1, err: 0.0, k7: None })
}

/// Semi-implicit (symplectic) Euler.
pub fn euler_step(f: &mut Rhs, x0: &[f64], h: f64, nq: usize, k1_in: Option<&[f64]>, clock: Option<usize>) -> SimResult<StepResult> {
    let n = x0.len();
    let k1_own;
    let k1: &[f64] = match k1_in {
        Some(k1) => k1,
        None => {
            let mut v = vec![0.0; n];
            f(x0, &mut v)?;
            k1_own = v;
            &k1_own
        }
    };
    let mut x1 = vec![0.0; n];
    for i in 0..nq {
        x1[nq + i] = x0[nq + i] + h * k1[nq + i];
    }
    for i in 0..nq {
        x1[i] = x0[i] + h * x1[nq + i];
    }
    for i in 2 * nq..n {
        x1[i] = x0[i] + h * k1[i];
    }
    if let Some(c) = clock {
        x1[c] = x0[c] + h;
    }
    Ok(StepResult { x: x1, err: 0.0, k7: None })
}
