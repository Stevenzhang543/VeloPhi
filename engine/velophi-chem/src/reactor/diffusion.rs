//! Two-group neutron diffusion in two dimensions (26.64, D277): the multiplication factor k_eff, the flux and the
//! adjoint flux of a grid of homogenised cells.
//!
//!   −∇·D₁∇φ₁ + (Σa₁ + Σs₁₂ + D₁B_z²)φ₁ = (1/k)(νΣf₁φ₁ + νΣf₂φ₂)
//!   −∇·D₂∇φ₂ + (Σa₂ + D₂B_z²)φ₂       = Σs₁₂φ₁
//!
//! **Discretisation**: cell-centred finite volumes on square cells of side h. The current through a face between
//! two cells is D̃(φᵢ − φⱼ)/h with the harmonic mean D̃ = 2DᵢDⱼ/(Dᵢ + Dⱼ) (continuous current across a material
//! interface). An outer face with the condition −D∂φ/∂n = γφ gives the current φᵢ/(1/γ + h/(2D)): γ = 0.4692 is
//! the vacuum boundary of transport theory (extrapolation distance 0.7104 λ_tr, the condition of the IAEA
//! benchmarks), γ = 1/2 Marshak's, γ = 0 a reflecting face, γ → ∞ zero flux at the face. Second order in h.
//!
//! **Linear solver**: each group's operator is symmetric positive definite with half-bandwidth min(nx, ny); it is
//! factorised once by a banded Cholesky decomposition and every later solve is two triangular sweeps in a fixed
//! order. A direct factorisation has no convergence criterion at all, so it is identical on every platform by
//! construction; for the grids of the workshop (up to 128 × 128 cells) it is also faster than an iterative solver.
//!
//! **Eigenvalue**: the fission source s obeys T·s = k·s with T = F·A⁻¹ (one application: solve the fast group,
//! then the thermal group, then form the new fission source). Plain power iteration needs more than a thousand
//! applications for a large core (dominance ratio 0.99); this module uses the Arnoldi method restarted with the
//! Ritz vector — the same applications of T, combined optimally — which needs about a hundred. All arithmetic is
//! IEEE-754 `+ − × ÷ √` in a fixed order; the number of applications depends on the data only. The iteration
//! stops when the residual ‖T·s − k·s‖₂/‖k·s‖₂ falls below the tolerance.
//!
//! **Adjoint**: the same method on Tᵀ in the form ψ ↦ A₁⁻¹(νΣf₁ψ + Σs₁₂A₂⁻¹νΣf₂ψ), ψ = φ₁† (the importance of a
//! fission neutron); φ₂† = A₂⁻¹νΣf₂ψ/k. It weights the reactivity effect of a change of the cross-sections:
//! Δρ = ⟨φ†, (ΔF/k − ΔM)φ⟩ / ⟨φ†, Fφ⟩ (first-order perturbation theory, exact in the operators).

use velophi_core::message::{Message, SimResult};

use super::materials::Xs;

/// Vacuum boundary of transport theory: −D∂φ/∂n = 0.4692φ.
pub const GAMMA_VACUUM: f64 = 0.4692;

/// A grid of square cells with a cross-section set each.
#[derive(Clone, Debug)]
pub struct Problem {
    pub nx: usize,
    pub ny: usize,
    /// Side of a cell (cm).
    pub h: f64,
    /// Row-major: cell (x, y) is `xs[y·nx + x]`.
    pub xs: Vec<Xs>,
    /// γ of the faces left (x = 0), right, bottom (y = 0), top.
    pub bc: [f64; 4],
    /// Axial buckling B_z² (1/cm²).
    pub bz2: f64,
}

fn bad(what: impl Into<String>) -> Message {
    Message::new("err.internal").text("message", format!("reactor: {}", what.into()))
}

/// The discrete operators, in the solver's ordering (the shorter side of the grid is the band).
pub struct Operator {
    pub n: usize,
    nx: usize,
    ny: usize,
    /// Index of cell (x, y): x·sx + y·sy.
    sx: usize,
    sy: usize,
    band: usize,
    diag: [Vec<f64>; 2],
    /// Coupling to the neighbour at x + 1 and at y + 1 (0 at the last column or row).
    cx: [Vec<f64>; 2],
    cy: [Vec<f64>; 2],
    /// Σs₁₂·h², νΣf·h² and Σf·h² per cell.
    s12: Vec<f64>,
    nf: [Vec<f64>; 2],
    pub fis: [Vec<f64>; 2],
}

fn face(gamma: f64, d: f64, h: f64) -> f64 {
    if gamma == 0.0 {
        0.0
    } else if gamma == f64::INFINITY {
        2.0 * d
    } else {
        2.0 * d * gamma * h / (2.0 * d + gamma * h)
    }
}

impl Operator {
    pub fn new(p: &Problem) -> SimResult<Operator> {
        let (nx, ny, h) = (p.nx, p.ny, p.h);
        let n = nx * ny;
        if n == 0 || p.xs.len() != n || !(h > 0.0) || !h.is_finite() {
            return Err(bad("the grid is empty or its cross-sections do not match"));
        }
        let (sx, sy, band) = if nx <= ny { (1, nx, nx) } else { (ny, 1, ny) };
        let h2 = h * h;
        let mut op = Operator {
            n,
            nx,
            ny,
            sx,
            sy,
            band,
            diag: [vec![0.0; n], vec![0.0; n]],
            cx: [vec![0.0; n], vec![0.0; n]],
            cy: [vec![0.0; n], vec![0.0; n]],
            s12: vec![0.0; n],
            nf: [vec![0.0; n], vec![0.0; n]],
            fis: [vec![0.0; n], vec![0.0; n]],
        };
        for y in 0..ny {
            for x in 0..nx {
                let c = &p.xs[y * nx + x];
                let q = x * sx + y * sy;
                let d = [c.d1, c.d2];
                let removal = [c.a1 + c.s12 + c.d1 * p.bz2, c.a2 + c.d2 * p.bz2];
                for g in 0..2 {
                    if !(d[g] > 0.0) || !d[g].is_finite() || !(removal[g] >= 0.0) {
                        return Err(bad(format!("cell {x},{y}: cross-sections of group {} are not valid", g + 1)));
                    }
                    let mut diag = removal[g] * h2;
                    if x == 0 {
                        diag += face(p.bc[0], d[g], h);
                    }
                    if x + 1 == nx {
                        diag += face(p.bc[1], d[g], h);
                    } else {
                        let e = &p.xs[y * nx + x + 1];
                        let de = if g == 0 { e.d1 } else { e.d2 };
                        op.cx[g][q] = 2.0 * d[g] * de / (d[g] + de);
                    }
                    if y == 0 {
                        diag += face(p.bc[2], d[g], h);
                    }
                    if y + 1 == ny {
                        diag += face(p.bc[3], d[g], h);
                    } else {
                        let e = &p.xs[(y + 1) * nx + x];
                        let de = if g == 0 { e.d1 } else { e.d2 };
                        op.cy[g][q] = 2.0 * d[g] * de / (d[g] + de);
                    }
                    op.diag[g][q] = diag;
                }
                op.s12[q] = c.s12 * h2;
                op.nf[0][q] = c.nf1 * h2;
                op.nf[1][q] = c.nf2 * h2;
                op.fis[0][q] = c.f1 * h2;
                op.fis[1][q] = c.f2 * h2;
            }
        }
        // the couplings enter the diagonals of both neighbours
        for g in 0..2 {
            for y in 0..ny {
                for x in 0..nx {
                    let q = x * sx + y * sy;
                    let (cx, cy) = (op.cx[g][q], op.cy[g][q]);
                    if x + 1 < nx {
                        op.diag[g][q] += cx;
                        op.diag[g][q + sx] += cx;
                    }
                    if y + 1 < ny {
                        op.diag[g][q] += cy;
                        op.diag[g][q + sy] += cy;
                    }
                }
            }
        }
        Ok(op)
    }

    /// Index of cell (x, y) in the solver's ordering.
    pub fn index(&self, x: usize, y: usize) -> usize {
        x * self.sx + y * self.sy
    }

    /// A vector of the solver's ordering in row-major order.
    pub fn row_major(&self, v: &[f64]) -> Vec<f64> {
        let mut out = vec![0.0; self.n];
        for y in 0..self.ny {
            for x in 0..self.nx {
                out[y * self.nx + x] = v[self.index(x, y)];
            }
        }
        out
    }

    /// out = A_g·φ (leakage and removal of group g, integrated over the cells).
    pub fn loss(&self, g: usize, phi: &[f64], out: &mut [f64]) {
        for q in 0..self.n {
            out[q] = self.diag[g][q] * phi[q];
        }
        for y in 0..self.ny {
            for x in 0..self.nx {
                let q = x * self.sx + y * self.sy;
                if x + 1 < self.nx {
                    let c = self.cx[g][q];
                    out[q] -= c * phi[q + self.sx];
                    out[q + self.sx] -= c * phi[q];
                }
                if y + 1 < self.ny {
                    let c = self.cy[g][q];
                    out[q] -= c * phi[q + self.sy];
                    out[q + self.sy] -= c * phi[q];
                }
            }
        }
    }

    /// Fission source νΣf₁φ₁ + νΣf₂φ₂ (integrated over the cells).
    pub fn fission(&self, phi1: &[f64], phi2: &[f64], out: &mut [f64]) {
        for q in 0..self.n {
            out[q] = self.nf[0][q] * phi1[q] + self.nf[1][q] * phi2[q];
        }
    }

    pub fn has_fission(&self) -> bool {
        self.nf[0].iter().chain(self.nf[1].iter()).any(|v| *v > 0.0)
    }
}

/// Banded Cholesky factor L of a group's operator (A = L·Lᵀ): row i holds the columns i − band … i.
pub struct Banded {
    n: usize,
    w: usize,
    l: Vec<f64>,
}

impl Banded {
    pub fn factor(op: &Operator, g: usize) -> SimResult<Banded> {
        let (n, w) = (op.n, op.band);
        let width = w + 1;
        let mut l = vec![0.0; n * width];
        // fill the lower band: the entry of column c in row i sits at i·width + (c + w − i)
        let near = if op.sx == 1 { &op.cx[g] } else { &op.cy[g] };
        let far = if op.sx == 1 { &op.cy[g] } else { &op.cx[g] };
        for i in 0..n {
            l[i * width + w] = op.diag[g][i];
            if i >= 1 && w >= 1 {
                // the coupling stored at the lower-index cell; 0 across the end of a line of the grid
                l[i * width + w - 1] = -near[i - 1];
            }
            if i >= w {
                let v = -far[i - w];
                if w == 1 {
                    l[i * width + w - 1] += v;
                } else {
                    l[i * width] = v;
                }
            }
        }
        for i in 0..n {
            let lo = i.saturating_sub(w);
            let row_i = i * width + w - i; // index of column 0 of row i (virtual)
            for j in lo..=i {
                let klo = lo.max(j.saturating_sub(w));
                let row_j = j * width + w - j;
                let mut s = l[row_i + j];
                let (a, b) = (&l[row_i + klo..row_i + j], &l[row_j + klo..row_j + j]);
                for k in 0..a.len() {
                    s -= a[k] * b[k];
                }
                if j == i {
                    if !(s > 0.0) || !s.is_finite() {
                        return Err(bad(format!("the diffusion operator of group {} is singular (no absorption and no leakage)", g + 1)));
                    }
                    l[row_i + i] = s.sqrt();
                } else {
                    l[row_i + j] = s / l[row_j + j];
                }
            }
        }
        Ok(Banded { n, w, l })
    }

    /// Solve A·x = b in place.
    pub fn solve(&self, b: &mut [f64]) {
        let (n, w) = (self.n, self.w);
        let width = w + 1;
        for i in 0..n {
            let lo = i.saturating_sub(w);
            let row = i * width + w - i;
            let mut s = b[i];
            let (a, y) = (&self.l[row + lo..row + i], &b[lo..i]);
            for k in 0..a.len() {
                s -= a[k] * y[k];
            }
            b[i] = s / self.l[row + i];
        }
        for i in (0..n).rev() {
            let lo = i.saturating_sub(w);
            let row = i * width + w - i;
            let x = b[i] / self.l[row + i];
            b[i] = x;
            let a = &self.l[row + lo..row + i];
            let y = &mut b[lo..i];
            for k in 0..a.len() {
                y[k] -= a[k] * x;
            }
        }
    }
}

fn dot(a: &[f64], b: &[f64]) -> f64 {
    let mut s = 0.0;
    for k in 0..a.len() {
        s += a[k] * b[k];
    }
    s
}

/// Result of the Arnoldi iteration.
pub struct Dominant {
    pub value: f64,
    pub vector: Vec<f64>,
    pub applications: usize,
    pub restarts: usize,
    pub residual: f64,
    pub converged: bool,
}

/// Dimension of the Krylov space between restarts.
const KRYLOV: usize = 24;

/// The dominant eigenpair of a linear operator by the Arnoldi method, restarted with the Ritz vector.
pub fn dominant(n: usize, apply: &mut dyn FnMut(&[f64], &mut [f64]), start: &[f64], tol: f64, max_restarts: usize) -> Dominant {
    let m = KRYLOV.min(n);
    let mut v = vec![0.0; (m + 1) * n];
    let mut h = vec![0.0; (m + 1) * m];
    let mut w = vec![0.0; n];
    let mut x = start.to_vec();
    let norm0 = dot(&x, &x).sqrt();
    if !(norm0 > 0.0) || m == 0 {
        return Dominant { value: 0.0, vector: x, applications: 0, restarts: 0, residual: f64::INFINITY, converged: false };
    }
    for q in x.iter_mut() {
        *q /= norm0;
    }
    let mut out = Dominant { value: 0.0, vector: Vec::new(), applications: 0, restarts: 0, residual: f64::INFINITY, converged: false };
    let mut y = vec![0.0; m];
    let mut z = vec![0.0; m];
    for restart in 0..=max_restarts {
        v[..n].copy_from_slice(&x);
        for e in h.iter_mut() {
            *e = 0.0;
        }
        let mut size = m;
        let mut closed = false;
        for j in 0..m {
            apply(&v[j * n..(j + 1) * n], &mut w);
            out.applications += 1;
            let scale = dot(&w, &w).sqrt();
            // modified Gram–Schmidt, twice
            for _ in 0..2 {
                for i in 0..=j {
                    let vi = &v[i * n..(i + 1) * n];
                    let d = dot(&w, vi);
                    h[i * m + j] += d;
                    for q in 0..n {
                        w[q] -= d * vi[q];
                    }
                }
            }
            let hn = dot(&w, &w).sqrt();
            h[(j + 1) * m + j] = hn;
            if !(hn > 1e-13 * scale) {
                // the Krylov space is invariant: the Ritz pair is exact
                size = j + 1;
                closed = true;
                break;
            }
            let next = &mut v[(j + 1) * n..(j + 2) * n];
            for q in 0..n {
                next[q] = w[q] / hn;
            }
        }
        // dominant eigenpair of the Hessenberg matrix by power iteration from e₁ (the current estimate)
        for e in y.iter_mut() {
            *e = 0.0;
        }
        y[0] = 1.0;
        let mut theta = h[0];
        for _ in 0..50000 {
            for i in 0..size {
                let mut s = 0.0;
                for j in i.saturating_sub(1)..size {
                    s += h[i * m + j] * y[j];
                }
                z[i] = s;
            }
            theta = dot(&y[..size], &z[..size]);
            let nz = dot(&z[..size], &z[..size]).sqrt();
            if !(nz > 0.0) {
                break;
            }
            let mut change = 0.0f64;
            for i in 0..size {
                let t = z[i] / nz;
                let d = (t - y[i]).abs();
                if d > change {
                    change = d;
                }
                y[i] = t;
            }
            if change < 1e-15 {
                break;
            }
        }
        // Ritz vector
        for q in x.iter_mut() {
            *q = 0.0;
        }
        for i in 0..size {
            let vi = &v[i * n..(i + 1) * n];
            let c = y[i];
            for q in 0..n {
                x[q] += c * vi[q];
            }
        }
        let mut sum = 0.0;
        for q in x.iter() {
            sum += *q;
        }
        let nx = dot(&x, &x).sqrt();
        let sign = if sum < 0.0 { -1.0 } else { 1.0 };
        for q in x.iter_mut() {
            *q = sign * *q / nx;
        }
        out.value = theta;
        out.restarts = restart;
        out.residual = if closed { 0.0 } else { (h[size * m + size - 1] * y[size - 1]).abs() / theta.abs() };
        if out.residual <= tol {
            out.converged = true;
            break;
        }
    }
    out.vector = x;
    out
}

/// k_eff and the flux of a problem.
pub struct Solution {
    pub k: f64,
    /// Fluxes in the solver's ordering, scaled so that the fission rate summed over the grid (Σf·φ·h²) is 1.
    pub flux: [Vec<f64>; 2],
    pub applications: usize,
    pub restarts: usize,
    pub residual: f64,
    pub converged: bool,
}

/// The factorised operators of a problem.
pub struct Solver {
    pub op: Operator,
    a: [Banded; 2],
}

impl Solver {
    pub fn new(p: &Problem) -> SimResult<Solver> {
        let op = Operator::new(p)?;
        let a = [Banded::factor(&op, 0)?, Banded::factor(&op, 1)?];
        Ok(Solver { op, a })
    }

    /// k_eff and the flux. `tol`: relative residual of the fission source.
    pub fn criticality(&self, tol: f64, max_restarts: usize) -> SimResult<Solution> {
        let op = &self.op;
        let n = op.n;
        if !op.has_fission() {
            return Err(bad("no cell contains fuel"));
        }
        let start: Vec<f64> = (0..n).map(|q| if op.nf[0][q] > 0.0 || op.nf[1][q] > 0.0 { 1.0 } else { 0.0 }).collect();
        let mut phi1 = vec![0.0; n];
        let mut phi2 = vec![0.0; n];
        let mut apply = |s: &[f64], out: &mut [f64]| {
            phi1.copy_from_slice(s);
            self.a[0].solve(&mut phi1);
            for q in 0..n {
                phi2[q] = op.s12[q] * phi1[q];
            }
            self.a[1].solve(&mut phi2);
            op.fission(&phi1, &phi2, out);
        };
        let d = dominant(n, &mut apply, &start, tol, max_restarts);
        if !(d.value > 0.0) || !d.value.is_finite() {
            return Err(bad("the eigenvalue iteration did not find a positive multiplication factor"));
        }
        // the flux of the converged source
        let mut f1 = d.vector.clone();
        self.a[0].solve(&mut f1);
        let mut f2: Vec<f64> = (0..n).map(|q| op.s12[q] * f1[q]).collect();
        self.a[1].solve(&mut f2);
        let mut rate = 0.0;
        for q in 0..n {
            rate += op.fis[0][q] * f1[q] + op.fis[1][q] * f2[q];
        }
        if !(rate > 0.0) {
            // fission cross-sections not given (ν·Σf only): scale by the fission source
            rate = 0.0;
            for q in 0..n {
                rate += op.nf[0][q] * f1[q] + op.nf[1][q] * f2[q];
            }
        }
        for q in 0..n {
            f1[q] /= rate;
            f2[q] /= rate;
        }
        Ok(Solution { k: d.value, flux: [f1, f2], applications: d.applications, restarts: d.restarts, residual: d.residual, converged: d.converged })
    }

    /// The adjoint flux for a known k (scaled so that ⟨φ†, Fφ⟩ = 1 with the flux of `forward`).
    pub fn adjoint(&self, forward: &Solution, tol: f64, max_restarts: usize) -> Solution {
        let op = &self.op;
        let n = op.n;
        let mut t1 = vec![0.0; n];
        let mut t2 = vec![0.0; n];
        let mut apply = |psi: &[f64], out: &mut [f64]| {
            for q in 0..n {
                t2[q] = op.nf[1][q] * psi[q];
            }
            self.a[1].solve(&mut t2);
            for q in 0..n {
                t1[q] = op.nf[0][q] * psi[q] + op.s12[q] * t2[q];
            }
            self.a[0].solve(&mut t1);
            out.copy_from_slice(&t1);
        };
        let d = dominant(n, &mut apply, &forward.flux[0], tol, max_restarts);
        let k = if d.value > 0.0 { d.value } else { forward.k };
        let mut a1 = d.vector.clone();
        let mut a2: Vec<f64> = (0..n).map(|q| op.nf[1][q] * a1[q] / k).collect();
        self.a[1].solve(&mut a2);
        // ⟨φ†, Fφ⟩ = Σ φ₁†(νΣf₁φ₁ + νΣf₂φ₂)
        let mut norm = 0.0;
        for q in 0..n {
            norm += a1[q] * (op.nf[0][q] * forward.flux[0][q] + op.nf[1][q] * forward.flux[1][q]);
        }
        if norm > 0.0 {
            for q in 0..n {
                a1[q] /= norm;
                a2[q] /= norm;
            }
        }
        Solution { k, flux: [a1, a2], applications: d.applications, restarts: d.restarts, residual: d.residual, converged: d.converged }
    }
}

/// Change of the reactivity ρ = 1 − 1/k when the operators of `base` are replaced by those of `changed`:
/// ⟨φ†, (ΔF/k − ΔM)φ⟩ / ⟨φ†, Fφ⟩ with the flux and adjoint of the base problem (the adjoint scaled by `adjoint`).
pub fn perturbation(base: &Operator, changed: &Operator, k: f64, flux: &[Vec<f64>; 2], adjoint: &[Vec<f64>; 2]) -> f64 {
    let n = base.n;
    let (mut l0, mut l1) = (vec![0.0; n], vec![0.0; n]);
    let mut num = 0.0;
    // fission
    for q in 0..n {
        let df = (changed.nf[0][q] - base.nf[0][q]) * flux[0][q] + (changed.nf[1][q] - base.nf[1][q]) * flux[1][q];
        num += adjoint[0][q] * df / k;
        // scattering source of the thermal group
        num += adjoint[1][q] * (changed.s12[q] - base.s12[q]) * flux[0][q];
    }
    // losses of both groups
    for g in 0..2 {
        base.loss(g, &flux[g], &mut l0);
        changed.loss(g, &flux[g], &mut l1);
        for q in 0..n {
            num -= adjoint[g][q] * (l1[q] - l0[q]);
        }
    }
    num
}
