//! Aqueous equilibrium (26.64, D264): acid–base, complexation, precipitation and dissolution, gas solubility.
//!
//! One system of equations per vessel, in the unknowns of an ion-association model:
//!
//! ```text
//!   x_j = ln a_j        activity of each component that is present (H⁺ always)
//!   N_p                 amount of each solid in the assemblage (mol)
//!   N_g                 amount of gas, when a gas phase at fixed pressure exists (mol)
//! ```
//!
//! and the equations
//!
//! ```text
//!   Σ_i ν_ij n_i + Σ_p ν_pj N_p + Σ_g ν_gj n_g = T_j     mole balance of component j (for H⁺: the proton condition)
//!   W / M_w + Σ ν_iw n_i + … = T_w                        mole balance of water (a fixed-point update of W)
//!   ln K_p + Σ_j ν_pj x_j + ν_pw ln a_w = 0               each solid of the assemblage is saturated
//!   Σ_g p_g = P                                           the bubble has the pressure of its surroundings
//! ```
//!
//! with n_i = W·m_i, ln m_i = ln K_i + Σ_j ν_ij x_j + ν_iw ln a_w − ln γ_i. Newton's method with a step limit and a
//! backtracking line search; activity coefficients and the activity of water are updated after every accepted step.
//! The solid assemblage is an active set: the most supersaturated candidate enters, a solid whose amount reaches zero
//! leaves, one change at a time, so the order of events depends on the data only.
//!
//! The activity model is the one PHREEQC applies to the same data (`db::Gamma`), with one deliberate difference: the
//! Davies equation is evaluated at I = 1 mol/kg for higher ionic strengths (it has no meaning there and grows without
//! bound); the result is then flagged as approximate. The activity of water is 1 − 0.017·Σm.
//!
//! A solve either converges to the stated tolerances or fails: no unconverged numbers are returned (D264, §15).

use velophi_core::dmath;

use crate::db::{Database, Gamma, C_H, C_H2O, LN10, R_L_ATM};

/// Totals below this (mol) count as "the component is absent".
const ZERO_TOTAL: f64 = 1e-16;
/// Relative residual of a mole balance at convergence.
const TOL_BALANCE: f64 = 1e-12;
/// Residual of a saturation equation (in ln) at convergence.
const TOL_PHASE: f64 = 1e-11;
/// Largest change of a ln activity coefficient (and of ln a_w, ln W) between two updates at convergence.
const TOL_GAMMA: f64 = 1e-12;
/// A candidate solid enters above this saturation index.
const SI_ENTER: f64 = 1e-9;
/// Newton iterations per solve, and changes of the phase assemblage.
const MAX_ITER: usize = 600;
const MAX_CHANGES: usize = 400;
/// Updates of the activity coefficients per assemblage.
const MAX_OUTER: usize = 400;
/// Sweeps of the preconditioner per Newton solve, and the imbalance (in ln) above which it runs.
const MAX_PCF: usize = 80;
const PCF_START: f64 = 1.5;
/// Largest change of a ln activity in one step.
const STEP_X: f64 = 4.0;
/// The Davies equation is frozen above this ionic strength (mol/kg).
pub const DAVIES_MAX_I: f64 = 1.0;
/// Results above this ionic strength are flagged approximate.
pub const APPROX_I: f64 = 0.5;
/// Lower bound of the activity of water in the model.
const MIN_AW: f64 = 0.3;

/// How a gas phase in contact with the solution behaves.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum GasMode {
    /// A closed head space of this volume (litres): gas amounts follow from the partial pressures.
    FixedVolume(f64),
    /// A bubble at this total pressure (atm) of the listed gases: it exists only while their pressures add up to it.
    FixedPressure(f64),
}

/// The gas phase of a problem.
#[derive(Clone, Debug)]
pub struct GasSpec {
    pub mode: GasMode,
    /// Gas species (indices into the database) that exchange with the solution.
    pub species: Vec<usize>,
}

/// One equilibrium problem.
pub struct Problem<'a> {
    pub db: &'a Database,
    /// Temperature, K.
    pub t: f64,
    /// Total amount of every component (mol), index-aligned with `db.components`; water and everything dissolved,
    /// in the solids of the assemblage and in the gas phase. The H⁺ total may be negative.
    pub totals: &'a [f64],
    /// Solids that may be present: the ones in the vessel and the ones allowed to precipitate.
    pub solids: &'a [usize],
    pub gas: Option<GasSpec>,
    /// Solids that are in the vessel now, with their amounts (already counted in `totals`): the assemblage the
    /// iteration starts from. Candidates not named here start absent.
    pub start: &'a [(usize, f64)],
    /// ln activities of the components from an earlier solution of a similar problem (NaN: none).
    pub guess: Option<&'a [f64]>,
}

/// Why a solve failed.
#[derive(Clone, Debug, PartialEq)]
pub enum Failure {
    /// No liquid water.
    NoWater,
    /// A component total is negative (the amounts given are impossible).
    NegativeTotal(usize),
    /// The iteration did not converge.
    NotConverged,
    /// The linear system of an iteration was singular.
    Singular,
}

/// An equilibrium state.
#[derive(Clone, Debug, Default)]
pub struct Solution {
    /// Mass of water, kg.
    pub water_kg: f64,
    /// ln activity of each component (NaN: absent); for water ln a_w.
    pub ln_a: Vec<f64>,
    pub ionic_strength: f64,
    /// Aqueous species present: (species, molality, ln γ).
    pub aqueous: Vec<(usize, f64, f64)>,
    /// Solids of the assemblage: (species, mol).
    pub solids: Vec<(usize, f64)>,
    /// Gas phase: (species, mol).
    pub gas: Vec<(usize, f64)>,
    /// Saturation index (log10) of every candidate solid.
    pub si: Vec<(usize, f64)>,
    /// Equilibrium partial pressure (atm) of every listed gas species.
    pub pressure: Vec<(usize, f64)>,
    /// Net charge of the solution (mol of charge); zero for amounts built from neutral substances.
    pub charge: f64,
    pub iterations: usize,
    /// The Davies equation was frozen, or the activity of water hit its floor.
    pub beyond_model: bool,
}

impl Solution {
    pub fn ph(&self) -> f64 {
        -self.ln_a[C_H] / LN10
    }
    pub fn activity_of_water(&self) -> f64 {
        dmath::exp(self.ln_a[C_H2O])
    }
}

/// Solve a dense linear system in place with row scaling and partial pivoting. False when singular.
fn linsolve(n: usize, a: &mut [f64], b: &mut [f64]) -> bool {
    for r in 0..n {
        let mut big = 0.0f64;
        for c in 0..n {
            big = big.max(a[r * n + c].abs());
        }
        if !(big > 0.0) || !big.is_finite() {
            return false;
        }
        for c in 0..n {
            a[r * n + c] /= big;
        }
        b[r] /= big;
    }
    for k in 0..n {
        let mut piv = k;
        let mut best = a[k * n + k].abs();
        for r in k + 1..n {
            let v = a[r * n + k].abs();
            if v > best {
                best = v;
                piv = r;
            }
        }
        if !(best > 1e-300) {
            return false;
        }
        if piv != k {
            for c in 0..n {
                a.swap(k * n + c, piv * n + c);
            }
            b.swap(k, piv);
        }
        let d = a[k * n + k];
        for r in k + 1..n {
            let f = a[r * n + k] / d;
            if f != 0.0 {
                for c in k..n {
                    a[r * n + c] -= f * a[k * n + c];
                }
                b[r] -= f * b[k];
            }
        }
    }
    for k in (0..n).rev() {
        let mut s = b[k];
        for c in k + 1..n {
            s -= a[k * n + c] * b[c];
        }
        b[k] = s / a[k * n + k];
        if !b[k].is_finite() {
            return false;
        }
    }
    true
}

/// A species of the working system: its stoichiometry over the active columns, ln K at T, and what it needs for γ.
struct Term {
    species: usize,
    /// (column, ν) over the active components (water excluded).
    nu: Vec<(usize, f64)>,
    /// ν of water.
    nu_w: f64,
    ln_k: f64,
    z: f64,
    gamma: Gamma,
}

struct Work<'a> {
    p: &'a Problem<'a>,
    /// Components of the columns.
    comps: Vec<usize>,
    aq: Vec<Term>,
    solids: Vec<Term>,
    gas: Vec<Term>,
    dh_a: f64,
    dh_b: f64,
    /// Capacity of a fixed-volume gas phase: mol per atm.
    gas_cap: f64,
    gas_p: f64,
    // State
    x: Vec<f64>,
    ln_w: f64,
    ln_aw: f64,
    ln_gamma: Vec<f64>,
    /// Amount of each candidate solid; `in_set` tells which are in the assemblage.
    n_solid: Vec<f64>,
    in_set: Vec<bool>,
    bubble: bool,
    n_bubble: f64,
    // Derived by `speciate`
    m: Vec<f64>,
    p_gas: Vec<f64>,
    beyond: bool,
}

fn safe_exp(v: f64) -> f64 {
    dmath::exp(v.clamp(-700.0, 60.0))
}

impl<'a> Work<'a> {
    fn term(db: &Database, col: &[usize], species: usize, t: f64) -> Option<Term> {
        let s = &db.species[species];
        let mut nu = Vec::with_capacity(s.rxn.len());
        let mut nu_w = 0.0;
        for &(j, v) in &s.rxn {
            if j == C_H2O {
                nu_w = v;
            } else if col[j] == usize::MAX {
                return None;
            } else {
                nu.push((col[j], v));
            }
        }
        Some(Term { species, nu, nu_w, ln_k: s.log_k_at(t) * LN10, z: s.z, gamma: s.gamma })
    }

    fn new(p: &'a Problem<'a>) -> Result<Work<'a>, Failure> {
        let db = p.db;
        let nc = db.components.len();
        if !(p.totals[C_H2O] > 1e-9) {
            return Err(Failure::NoWater);
        }
        let mut col = vec![usize::MAX; nc];
        let mut comps = Vec::new();
        for j in 1..nc {
            let t = p.totals[j];
            if j != C_H && t < -1e-12 {
                return Err(Failure::NegativeTotal(j));
            }
            if j == C_H || t > ZERO_TOTAL {
                col[j] = comps.len();
                comps.push(j);
            }
        }
        let water = db.components[C_H2O];
        let aq: Vec<Term> = db.aqueous.iter().filter(|&&i| i != water).filter_map(|&i| Self::term(db, &col, i, p.t)).collect();
        let solids: Vec<Term> = p.solids.iter().filter_map(|&i| Self::term(db, &col, i, p.t)).collect();
        let (gas, gas_cap, gas_p) = match &p.gas {
            None => (Vec::new(), 0.0, 0.0),
            Some(g) => {
                let terms: Vec<Term> = g.species.iter().filter_map(|&i| Self::term(db, &col, i, p.t)).collect();
                match g.mode {
                    GasMode::FixedVolume(v) => (terms, v.max(0.0) / (R_L_ATM * p.t), 0.0),
                    GasMode::FixedPressure(pr) => (terms, 0.0, pr),
                }
            }
        };
        let (dh_a, dh_b) = db.dh(p.t);
        let w0 = p.totals[C_H2O] * db.species[water].molar_mass * 1e-3;
        let mut x = vec![0.0; comps.len()];
        for (c, &j) in comps.iter().enumerate() {
            let known = p.guess.and_then(|g| g.get(j).copied()).filter(|v| v.is_finite());
            x[c] = match known {
                Some(v) => v,
                None if j == C_H => {
                    let th = p.totals[C_H] / w0;
                    if th > 1e-7 {
                        dmath::log(th)
                    } else if th < -1e-7 {
                        dmath::log(1e-14 / -th)
                    } else {
                        dmath::log(1e-7)
                    }
                }
                None => dmath::log(p.totals[j] / w0) - 1.0,
            };
        }
        let n_aq = aq.len();
        let n_sol = solids.len();
        let n_gas = gas.len();
        Ok(Work {
            p,
            comps,
            aq,
            solids,
            gas,
            dh_a,
            dh_b,
            gas_cap,
            gas_p,
            x,
            ln_w: dmath::log(w0),
            ln_aw: 0.0,
            ln_gamma: vec![0.0; n_aq],
            n_solid: vec![0.0; n_sol],
            in_set: vec![false; n_sol],
            bubble: false,
            n_bubble: 0.0,
            m: vec![0.0; n_aq],
            p_gas: vec![0.0; n_gas],
            beyond: false,
        })
    }

    fn ln_q(&self, t: &Term) -> f64 {
        let mut v = t.ln_k + t.nu_w * self.ln_aw;
        for &(c, nu) in &t.nu {
            v += nu * self.x[c];
        }
        v
    }

    /// Molalities and gas pressures of the current unknowns.
    fn speciate(&mut self) {
        for i in 0..self.aq.len() {
            self.m[i] = safe_exp(self.ln_q(&self.aq[i]) - self.ln_gamma[i]);
        }
        for g in 0..self.gas.len() {
            self.p_gas[g] = safe_exp(self.ln_q(&self.gas[g]));
        }
    }

    /// Update ln γ and ln a_w from the molalities, moving the fraction `relax` of the way; returns the largest
    /// change made.
    fn update_activity(&mut self, relax: f64) -> f64 {
        let mut mu = 0.0;
        let mut sum = 0.0;
        for (i, t) in self.aq.iter().enumerate() {
            mu += 0.5 * t.z * t.z * self.m[i];
            sum += self.m[i];
        }
        let root = mu.sqrt();
        let mu_d = mu.min(DAVIES_MAX_I);
        let root_d = mu_d.sqrt();
        let mut change = 0.0f64;
        let mut beyond = mu > DAVIES_MAX_I;
        for (i, t) in self.aq.iter().enumerate() {
            let lg = match t.gamma {
                Gamma::Davies => -self.dh_a * t.z * t.z * (root_d / (1.0 + root_d) - 0.3 * mu_d),
                Gamma::Wateq { a, b } => -self.dh_a * t.z * t.z * root / (1.0 + a * self.dh_b * root) + b * mu,
                Gamma::Neutral => 0.1 * mu,
            } * LN10;
            let lg = self.ln_gamma[i] + relax * (lg - self.ln_gamma[i]);
            change = change.max((lg - self.ln_gamma[i]).abs());
            self.ln_gamma[i] = lg;
        }
        let mut aw = 1.0 - 0.017 * sum;
        if aw < MIN_AW {
            aw = MIN_AW;
            beyond = true;
        }
        let ln_aw = self.ln_aw + relax * (dmath::log(aw) - self.ln_aw);
        change = change.max((ln_aw - self.ln_aw).abs());
        self.ln_aw = ln_aw;
        self.beyond = beyond;
        change
    }

    fn ionic_strength(&self) -> f64 {
        self.aq.iter().enumerate().map(|(i, t)| 0.5 * t.z * t.z * self.m[i]).sum()
    }

    /// Unknown layout: components, the solids of the assemblage, the bubble. (The mass of water is not a Newton
    /// unknown: with it fixed, the equations are the optimality conditions of a convex problem — minimise
    /// Σ n_i(x) − Σ T_j x_j subject to the saturation of the solids — and Newton's method with a line search on the
    /// residual norm converges from any start. The water balance is a fixed-point update after every step.)
    fn layout(&self) -> (usize, Vec<usize>, Option<usize>, usize) {
        let nx = self.comps.len();
        let set: Vec<usize> = (0..self.solids.len()).filter(|&s| self.in_set[s]).collect();
        let bub = if self.bubble { Some(nx + set.len()) } else { None };
        let n = nx + set.len() + usize::from(self.bubble);
        (n, set, bub, nx)
    }

    /// Amount of gas species g in the gas phase.
    fn gas_amount(&self, g: usize) -> f64 {
        if self.gas_cap > 0.0 {
            self.gas_cap * self.p_gas[g]
        } else if self.bubble {
            self.n_bubble * self.p_gas[g] / self.gas_p
        } else {
            0.0
        }
    }

    /// Water bound in dissolved species, solids and gas (mol): T_w minus this is the free water.
    fn water_bound(&self) -> f64 {
        let w = dmath::exp(self.ln_w);
        let mut bound = 0.0;
        for (i, t) in self.aq.iter().enumerate() {
            bound += t.nu_w * w * self.m[i];
        }
        for (s, t) in self.solids.iter().enumerate() {
            if self.in_set[s] {
                bound += t.nu_w * self.n_solid[s];
            }
        }
        for (g, t) in self.gas.iter().enumerate() {
            bound += t.nu_w * self.gas_amount(g);
        }
        bound
    }

    /// One fixed-point update of the mass of water; returns the relative change, or None when no free water is left.
    fn update_water(&mut self) -> Option<f64> {
        let db = self.p.db;
        let kg_per_mol = db.species[db.components[C_H2O]].molar_mass * 1e-3;
        let total = self.p.totals[C_H2O];
        if !(total > 1e-12) {
            return None;
        }
        let free = total - self.water_bound();
        if !(free > 1e-9 * total) {
            return None;
        }
        let ln_new = dmath::log(free * kg_per_mol);
        let change = (ln_new - self.ln_w).abs();
        self.ln_w = ln_new;
        Some(change)
    }

    /// Residuals of the current state and the size of each row (the sum of the magnitudes of its terms).
    fn residual(&self, f: &mut Vec<f64>, scale: &mut Vec<f64>) {
        let (n, set, bub, nx) = self.layout();
        f.clear();
        f.resize(n, 0.0);
        scale.clear();
        scale.resize(n, 1.0);
        let w = dmath::exp(self.ln_w);
        for (c, &j) in self.comps.iter().enumerate() {
            f[c] = -self.p.totals[j];
            scale[c] = self.p.totals[j].abs();
        }
        for (i, t) in self.aq.iter().enumerate() {
            let ni = w * self.m[i];
            for &(c, nu) in &t.nu {
                f[c] += nu * ni;
                scale[c] += (nu * ni).abs();
            }
        }
        for (k, &s) in set.iter().enumerate() {
            let t = &self.solids[s];
            for &(c, nu) in &t.nu {
                f[c] += nu * self.n_solid[s];
                scale[c] += (nu * self.n_solid[s]).abs();
            }
            f[nx + k] = self.ln_q(t);
        }
        for (g, t) in self.gas.iter().enumerate() {
            let ng = self.gas_amount(g);
            if ng != 0.0 {
                for &(c, nu) in &t.nu {
                    f[c] += nu * ng;
                    scale[c] += (nu * ng).abs();
                }
            }
        }
        if let Some(b) = bub {
            f[b] = self.p_gas.iter().sum::<f64>() / self.gas_p - 1.0;
        }
        for item in scale.iter_mut().take(nx) {
            *item = item.max(1e-300);
        }
    }

    /// Largest residual in units of its tolerance (≤ 1: converged).
    fn worst(f: &[f64], scale: &[f64], nx: usize) -> f64 {
        let mut worst = 0.0f64;
        for r in 0..f.len() {
            let v = if r < nx { (f[r] / scale[r]).abs() / TOL_BALANCE } else { f[r].abs() / TOL_PHASE };
            worst = worst.max(v);
        }
        worst
    }

    /// Squared norm of the residuals with fixed row weights (the merit function of the line search).
    fn merit(f: &[f64], weight: &[f64]) -> f64 {
        f.iter().zip(weight.iter()).map(|(v, w)| (v * w) * (v * w)).sum()
    }

    fn jacobian(&self, a: &mut Vec<f64>) {
        let (n, set, bub, nx) = self.layout();
        a.clear();
        a.resize(n * n, 0.0);
        let w = dmath::exp(self.ln_w);
        for (i, t) in self.aq.iter().enumerate() {
            let ni = w * self.m[i];
            if ni == 0.0 {
                continue;
            }
            for &(c, nu) in &t.nu {
                for &(k, nuk) in &t.nu {
                    a[c * n + k] += nu * nuk * ni;
                }
            }
        }
        for (k, &s) in set.iter().enumerate() {
            let t = &self.solids[s];
            let col = nx + k;
            for &(c, nu) in &t.nu {
                a[c * n + col] += nu;
                a[col * n + c] += nu;
            }
        }
        for (g, t) in self.gas.iter().enumerate() {
            let ng = self.gas_amount(g);
            if ng != 0.0 {
                for &(c, nu) in &t.nu {
                    for &(k, nuk) in &t.nu {
                        a[c * n + k] += nu * nuk * ng;
                    }
                }
            }
            if let Some(b) = bub {
                let share = self.p_gas[g] / self.gas_p;
                for &(c, nu) in &t.nu {
                    a[c * n + b] += nu * share;
                    a[b * n + c] += nu * share;
                }
            }
        }
    }

    /// One sweep of the preconditioner (positive continuous fractions; Carrayrou, Mosé and Behra, AIChE J. 48, 894,
    /// 2002): every mole balance is written as "positive terms = negative terms" and the activity of its component is
    /// moved by the logarithm of their ratio. Far from the solution — a species overshooting its total by many orders
    /// of magnitude — Newton's matrix is dominated by that one species and numerically singular; this brings every
    /// balance within a small factor first. Returns the largest imbalance found (in ln); the unknowns are changed
    /// only when it exceeds `PCF_START`.
    fn precondition(&mut self) -> f64 {
        let nx = self.comps.len();
        let w = dmath::exp(self.ln_w);
        // Per column: positive and negative sums, their parts from species that follow the activities, and the
        // coefficient of the largest such term on each side
        let mut pos = vec![0.0f64; nx];
        let mut neg = vec![0.0f64; nx];
        let mut sp_pos = vec![0.0f64; nx];
        let mut sp_neg = vec![0.0f64; nx];
        let mut dom_pos = vec![(0.0f64, 1.0f64); nx];
        let mut dom_neg = vec![(0.0f64, 1.0f64); nx];
        for (c, &j) in self.comps.iter().enumerate() {
            let t = self.p.totals[j];
            if t >= 0.0 {
                neg[c] += t;
            } else {
                pos[c] -= t;
            }
        }
        let mut add = |c: usize, nu: f64, amount: f64, follows: bool| {
            let term = nu.abs() * amount;
            if nu > 0.0 {
                pos[c] += term;
                if follows {
                    sp_pos[c] += term;
                    if term > dom_pos[c].0 {
                        dom_pos[c] = (term, nu.abs());
                    }
                }
            } else {
                neg[c] += term;
                if follows {
                    sp_neg[c] += term;
                    if term > dom_neg[c].0 {
                        dom_neg[c] = (term, nu.abs());
                    }
                }
            }
        };
        for (i, t) in self.aq.iter().enumerate() {
            for &(c, nu) in &t.nu {
                add(c, nu, w * self.m[i], true);
            }
        }
        for (g, t) in self.gas.iter().enumerate() {
            let ng = self.gas_amount(g);
            for &(c, nu) in &t.nu {
                add(c, nu, ng, true);
            }
        }
        for (s, t) in self.solids.iter().enumerate() {
            if self.in_set[s] {
                for &(c, nu) in &t.nu {
                    add(c, nu, self.n_solid[s], false);
                }
            }
        }
        let mut worst = 0.0f64;
        let mut delta = vec![0.0f64; nx];
        for c in 0..nx {
            if !(pos[c] > 0.0 && neg[c] > 0.0) {
                continue;
            }
            let r = dmath::log(neg[c] / pos[c]);
            // The side that is too large is reduced through its dominant species when species make up most of it;
            // otherwise the other side is raised through its dominant species
            let (big, sp_big, dom_big, sp_small, dom_small) = if r < 0.0 { (pos[c], sp_pos[c], dom_pos[c], sp_neg[c], dom_neg[c]) } else { (neg[c], sp_neg[c], dom_neg[c], sp_pos[c], dom_pos[c]) };
            let coef = if sp_big >= 0.5 * big {
                dom_big.1
            } else if sp_small > 0.0 {
                dom_small.1
            } else {
                continue;
            };
            worst = worst.max(r.abs());
            delta[c] = (r / coef).clamp(-STEP_X, STEP_X);
        }
        if worst > PCF_START {
            for c in 0..nx {
                self.x[c] += delta[c];
            }
        }
        worst
    }

    /// Newton iterations for the current assemblage at fixed activity coefficients and a fixed mass of water (the
    /// convex problem). Ok(true): converged; Ok(false): the assemblage changed (a solid or the bubble left).
    fn newton(&mut self, iterations: &mut usize) -> Result<bool, Failure> {
        let mut f = Vec::new();
        let mut scale = Vec::new();
        let mut a = Vec::new();
        let mut trial_f = Vec::new();
        let mut trial_s = Vec::new();
        let mut stalls = 0;
        let mut sweeps = 0;
        loop {
            if sweeps < MAX_PCF && self.precondition() > PCF_START {
                sweeps += 1;
                self.speciate();
                continue;
            }
            sweeps = MAX_PCF;
            self.residual(&mut f, &mut scale);
            let (n, set, bub, nx) = self.layout();
            if Self::worst(&f, &scale, nx) <= 0.5 {
                return Ok(true);
            }
            if *iterations >= MAX_ITER {
                return Err(Failure::NotConverged);
            }
            *iterations += 1;
            self.jacobian(&mut a);
            let mut rhs: Vec<f64> = f.iter().map(|v| -v).collect();
            if !linsolve(n, &mut a, &mut rhs) {
                return Err(Failure::Singular);
            }
            // Step limit: activities change by a bounded factor per iteration
            let mut lim = 1.0f64;
            for value in rhs.iter().take(nx) {
                if value.abs() > STEP_X {
                    lim = lim.min(STEP_X / value.abs());
                }
            }
            // Amounts of solids and of the bubble stay non-negative: the first one to reach zero ends the step
            let mut leaves: Option<usize> = None;
            let mut bubble_leaves = false;
            for (k, &s) in set.iter().enumerate() {
                let d = rhs[nx + k];
                if d < 0.0 && self.n_solid[s] + lim * d < 0.0 {
                    lim = (self.n_solid[s] / -d).max(0.0);
                    leaves = Some(s);
                    bubble_leaves = false;
                }
            }
            if let Some(b) = bub {
                let d = rhs[b];
                if d < 0.0 && self.n_bubble + lim * d < 0.0 {
                    lim = (self.n_bubble / -d).max(0.0);
                    leaves = None;
                    bubble_leaves = true;
                }
            }
            if lim <= 0.0 {
                // Already at zero and still shrinking: the phase is not part of the equilibrium
                if bubble_leaves {
                    self.bubble = false;
                    self.n_bubble = 0.0;
                } else if let Some(s) = leaves {
                    self.in_set[s] = false;
                    self.n_solid[s] = 0.0;
                }
                return Ok(false);
            }
            // Backtracking on the residual norm with the row weights of this iterate
            let weight: Vec<f64> = (0..n).map(|r| if r < nx { 1.0 / scale[r] } else { 1.0 }).collect();
            let phi0 = Self::merit(&f, &weight);
            let x0 = self.x.clone();
            let ns0 = self.n_solid.clone();
            let nb0 = self.n_bubble;
            let mut step = lim;
            let mut tries = 0;
            loop {
                for c in 0..nx {
                    self.x[c] = x0[c] + step * rhs[c];
                }
                for (k, &s) in set.iter().enumerate() {
                    self.n_solid[s] = (ns0[s] + step * rhs[nx + k]).max(0.0);
                }
                if let Some(b) = bub {
                    self.n_bubble = (nb0 + step * rhs[b]).max(0.0);
                }
                self.speciate();
                self.residual(&mut trial_f, &mut trial_s);
                let phi = Self::merit(&trial_f, &weight);
                if phi <= (1.0 - 2e-4 * step) * phi0 {
                    stalls = 0;
                    break;
                }
                if tries >= 40 {
                    // No decrease along the Newton direction: rounding at the level of the tolerances; a few of
                    // these in a row is a failure
                    stalls += 1;
                    if stalls > 8 {
                        return Err(Failure::NotConverged);
                    }
                    break;
                }
                step *= 0.5;
                tries += 1;
            }
            if step == lim {
                if bubble_leaves {
                    self.bubble = false;
                    self.n_bubble = 0.0;
                    return Ok(false);
                }
                if let Some(s) = leaves {
                    self.in_set[s] = false;
                    self.n_solid[s] = 0.0;
                    return Ok(false);
                }
            }
        }
    }

    /// Solve for the current assemblage: Newton at fixed activity coefficients, then an update of the coefficients,
    /// the activity of water and the mass of water, until those no longer change (a fixed-point iteration, relaxed
    /// when it does not contract). Ok(false): the assemblage changed and the caller iterates again.
    fn iterate(&mut self, iterations: &mut usize) -> Result<bool, Failure> {
        let mut f = Vec::new();
        let mut scale = Vec::new();
        let mut relax = 1.0f64;
        let mut previous = f64::INFINITY;
        for _ in 0..MAX_OUTER {
            self.speciate();
            if !self.newton(iterations)? {
                return Ok(false);
            }
            let d_act = self.update_activity(relax);
            let d_water = self.update_water().ok_or(Failure::NoWater)?;
            self.speciate();
            self.residual(&mut f, &mut scale);
            if Self::worst(&f, &scale, self.comps.len()) <= 1.0 && d_act <= TOL_GAMMA && d_water <= TOL_GAMMA {
                return Ok(true);
            }
            if d_act > 0.9 * previous {
                relax = (relax * 0.5).max(0.05);
            }
            previous = d_act;
        }
        Err(Failure::NotConverged)
    }
}

/// The factor r with a = r·b for two stoichiometries over the same columns; None when they are not proportional.
fn proportional(a: &[(usize, f64)], b: &[(usize, f64)]) -> Option<f64> {
    if a.len() != b.len() || a.is_empty() {
        return None;
    }
    let r = a[0].1 / b[0].1;
    for (x, y) in a.iter().zip(b.iter()) {
        if x.0 != y.0 || (x.1 - r * y.1).abs() > 1e-12 * x.1.abs().max(1.0) {
            return None;
        }
    }
    if r.is_finite() && r > 0.0 {
        Some(r)
    } else {
        None
    }
}

/// Solve an equilibrium problem.
pub fn solve(p: &Problem) -> Result<Solution, Failure> {
    let mut w = Work::new(p)?;
    let db = p.db;
    // Solids in the vessel start in the assemblage with their amounts; a solid that is not saturated leaves as soon as
    // its amount reaches zero
    let mut iterations = 0usize;
    let mut entered = vec![0u32; w.solids.len()];
    for &(species, amount) in p.start {
        if let Some(s) = w.solids.iter().position(|t| t.species == species) {
            if amount > 0.0 {
                w.in_set[s] = true;
                w.n_solid[s] = amount;
            }
        }
    }
    let mut changes = 0usize;
    loop {
        if !w.iterate(&mut iterations)? {
            changes += 1;
            if changes > MAX_CHANGES {
                return Err(Failure::NotConverged);
            }
            continue;
        }
        // Converged for this assemblage: does a candidate want in?
        let mut best: Option<(usize, f64)> = None;
        for s in 0..w.solids.len() {
            if w.in_set[s] {
                continue;
            }
            let si = w.ln_q(&w.solids[s]) / LN10;
            if si > SI_ENTER && best.map(|b| si > b.1).unwrap_or(true) {
                best = Some((s, si));
            }
        }
        let bubble_wants = !w.bubble && w.gas_p > 0.0 && w.p_gas.iter().sum::<f64>() > w.gas_p * (1.0 + 1e-10);
        if best.is_none() && !bubble_wants {
            break;
        }
        changes += 1;
        if changes > MAX_CHANGES {
            return Err(Failure::NotConverged);
        }
        if let Some((s, _)) = best {
            entered[s] += 1;
            if entered[s] > 12 {
                return Err(Failure::NotConverged);
            }
            w.in_set[s] = true;
            w.n_solid[s] = 0.0;
            // A solid of the assemblage with the same composition up to water (an oxide and its hydroxide, a salt and
            // its hydrate) cannot coexist with the one entering — their saturation equations differ only by the
            // activity of water, and the linear system would be singular. The one entering is the more stable
            // (it is supersaturated while the other is just saturated): it takes over the other's amount.
            for p in 0..w.solids.len() {
                if p == s || !w.in_set[p] {
                    continue;
                }
                if let Some(ratio) = proportional(&w.solids[p].nu, &w.solids[s].nu) {
                    w.n_solid[s] += w.n_solid[p] * ratio;
                    w.n_solid[p] = 0.0;
                    w.in_set[p] = false;
                }
            }
        } else {
            w.bubble = true;
            w.n_bubble = 0.0;
        }
    }
    let water_kg = dmath::exp(w.ln_w);
    let nc = db.components.len();
    let mut ln_a = vec![f64::NAN; nc];
    ln_a[C_H2O] = w.ln_aw;
    for (c, &j) in w.comps.iter().enumerate() {
        ln_a[j] = w.x[c];
    }
    let mut charge = 0.0;
    let mut aqueous = Vec::with_capacity(w.aq.len());
    for (i, t) in w.aq.iter().enumerate() {
        charge += t.z * w.m[i] * water_kg;
        aqueous.push((t.species, w.m[i], w.ln_gamma[i]));
    }
    let solids = (0..w.solids.len()).filter(|&s| w.in_set[s] && w.n_solid[s] > 0.0).map(|s| (w.solids[s].species, w.n_solid[s])).collect();
    let si = (0..w.solids.len()).map(|s| (w.solids[s].species, w.ln_q(&w.solids[s]) / LN10)).collect();
    let gas = (0..w.gas.len()).map(|g| (w.gas[g].species, w.gas_amount(g))).filter(|x| x.1 > 0.0).collect();
    let pressure = (0..w.gas.len()).map(|g| (w.gas[g].species, w.p_gas[g])).collect();
    Ok(Solution { water_kg, ln_a, ionic_strength: w.ionic_strength(), aqueous, solids, gas, si, pressure, charge, iterations, beyond_model: w.beyond })
}

/// Component totals of amounts of network species: `(species, mol)` pairs. Species outside the network are skipped
/// and returned.
pub fn totals_of(db: &Database, amounts: &[(usize, f64)]) -> (Vec<f64>, Vec<usize>) {
    let mut totals = vec![0.0; db.components.len()];
    let mut outside = Vec::new();
    for &(s, n) in amounts {
        if db.species[s].in_network() {
            db.add_to_totals(s, n, &mut totals);
        } else {
            outside.push(s);
        }
    }
    (totals, outside)
}
