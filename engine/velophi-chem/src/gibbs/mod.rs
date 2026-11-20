//! High-temperature gas equilibrium (26.64, D264): Gibbs energy minimisation with NASA polynomials, adiabatic flame temperatures.
//!
//! An ideal gas mixture of the species of `gas.json`. The composition at a temperature and a pressure (or a volume)
//! minimises the Gibbs (Helmholtz) energy under the element balances; the iteration is the one of Gordon & McBride
//! (NASA RP-1311, 1994, chapter 2): Newton's method in the logarithms of the amounts, reduced to one equation per
//! element (and one for the total amount at fixed pressure), with their step control. An adiabatic state is the
//! temperature at which the enthalpy (fixed pressure) or the internal energy (fixed volume) of the equilibrium
//! mixture equals that of the reactants, found by bisection — every step a full equilibrium.
//!
//! Not modelled: condensed phases (liquid water, soot), real-gas effects, ions.

pub mod api;

use std::cell::RefCell;
use std::collections::BTreeMap;
use std::rc::Rc;

use serde_json::Value;
use velophi_core::dmath;
use velophi_core::message::{Message, SimResult};
use velophi_core::transport::dnum;

use crate::db::R_GAS;

/// Pa per atm.
pub const ATM: f64 = 101325.0;
/// Range of temperatures searched for an adiabatic state, K.
pub const T_LOW: f64 = 200.0;
pub const T_HIGH: f64 = 6000.0;

#[derive(Clone, Debug)]
pub struct Range {
    pub t_min: f64,
    pub t_max: f64,
    pub a: [f64; 7],
}

#[derive(Clone, Debug)]
pub struct GasSpecies {
    pub id: String,
    /// (element index, atoms).
    pub comp: Vec<(usize, f64)>,
    pub molar_mass: f64,
    pub ranges: Vec<Range>,
}

/// Standard-state values of one species at a temperature: cp and s in J/(mol·K), h in J/mol (with the enthalpy of formation).
#[derive(Clone, Copy, Debug)]
pub struct Thermo {
    pub cp: f64,
    pub h: f64,
    pub s: f64,
    /// The temperature is outside the range of the polynomials.
    pub extrapolated: bool,
}

impl GasSpecies {
    pub fn thermo(&self, t: f64) -> Thermo {
        let last = self.ranges.len() - 1;
        let k = self.ranges.iter().position(|r| t <= r.t_max).unwrap_or(last);
        let a = &self.ranges[k].a;
        let (t2, t3, t4) = (t * t, t * t * t, t * t * t * t);
        let cp = a[0] + a[1] * t + a[2] * t2 + a[3] * t3 + a[4] * t4;
        let h = a[0] + a[1] * t / 2.0 + a[2] * t2 / 3.0 + a[3] * t3 / 4.0 + a[4] * t4 / 5.0 + a[5] / t;
        let s = a[0] * dmath::log(t) + a[1] * t + a[2] * t2 / 2.0 + a[3] * t3 / 3.0 + a[4] * t4 / 4.0 + a[6];
        Thermo { cp: cp * R_GAS, h: h * R_GAS * t, s: s * R_GAS, extrapolated: t < self.ranges[0].t_min || t > self.ranges[last].t_max }
    }
}

#[derive(Clone, Debug, Default)]
pub struct GasData {
    pub elements: Vec<String>,
    pub species: Vec<GasSpecies>,
    pub by_id: BTreeMap<String, usize>,
    /// Standard-state pressure, Pa.
    pub p0: f64,
}

impl GasData {
    /// Read a `velophi-chemgas` document.
    pub fn from_json(doc: &Value) -> SimResult<GasData> {
        let bad = |what: &str| Message::new("chem.badData").text("what", what);
        if doc.get("format").and_then(|v| v.as_str()) != Some("velophi-chemgas") {
            return Err(bad("format"));
        }
        let mut data = GasData { p0: doc.get("P0").map(dnum).filter(|p| p.is_finite() && *p > 0.0).unwrap_or(1.0e5), ..GasData::default() };
        let mut elements: BTreeMap<String, usize> = BTreeMap::new();
        let list = doc.get("species").and_then(|v| v.as_array()).ok_or_else(|| bad("species"))?;
        // Elements in alphabetical order, whatever the order of the species
        for s in list {
            for (el, _) in s.get("comp").and_then(|v| v.as_object()).ok_or_else(|| bad("comp"))? {
                elements.insert(el.clone(), 0);
            }
        }
        for (k, (el, index)) in elements.iter_mut().enumerate() {
            *index = k;
            data.elements.push(el.clone());
        }
        for s in list {
            let id = s.get("id").and_then(|v| v.as_str()).ok_or_else(|| bad("id"))?.to_string();
            let mut comp: Vec<(usize, f64)> = s["comp"].as_object().map(|o| o.iter().map(|(el, n)| (elements[el], dnum(n))).collect()).unwrap_or_default();
            comp.sort_by(|a, b| a.0.cmp(&b.0));
            let mut ranges = Vec::new();
            for r in s.get("ranges").and_then(|v| v.as_array()).ok_or_else(|| bad(&id))? {
                let values: Vec<f64> = r.get("a").and_then(|v| v.as_array()).map(|a| a.iter().map(dnum).collect()).unwrap_or_default();
                let (t_min, t_max) = (r.get("Tmin").map(dnum).unwrap_or(f64::NAN), r.get("Tmax").map(dnum).unwrap_or(f64::NAN));
                if values.len() != 7 || values.iter().any(|x| !x.is_finite()) || !(t_min > 0.0 && t_max >= t_min) {
                    return Err(bad(&id));
                }
                let mut a = [0.0; 7];
                a.copy_from_slice(&values);
                ranges.push(Range { t_min, t_max, a });
            }
            if ranges.is_empty() || comp.is_empty() || comp.iter().any(|c| !(c.1 > 0.0)) || data.by_id.contains_key(&id) {
                return Err(bad(&id));
            }
            data.by_id.insert(id.clone(), data.species.len());
            data.species.push(GasSpecies { id, comp, molar_mass: s.get("M").map(dnum).unwrap_or(f64::NAN), ranges });
        }
        Ok(data)
    }

    pub fn find(&self, id: &str) -> Option<usize> {
        self.by_id.get(id).copied()
    }
}

thread_local! {
    static GAS: RefCell<Option<Rc<GasData>>> = const { RefCell::new(None) };
}

pub fn set_data(data: GasData) -> Rc<GasData> {
    let rc = Rc::new(data);
    GAS.with(|d| *d.borrow_mut() = Some(Rc::clone(&rc)));
    rc
}

pub fn data() -> SimResult<Rc<GasData>> {
    GAS.with(|d| d.borrow().clone()).ok_or_else(|| Message::new("chem.noData"))
}

/// What is held fixed besides the temperature (or the energy).
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Hold {
    /// Pa.
    Pressure(f64),
    /// m³.
    Volume(f64),
}

#[derive(Clone, Debug, PartialEq)]
pub enum Failure {
    /// No candidate species can hold the elements given.
    NoSpecies,
    NotConverged,
    /// The adiabatic temperature is outside `T_LOW … T_HIGH`: `true` when above.
    OutOfRange(bool),
}

#[derive(Clone, Debug)]
pub struct GasState {
    pub t: f64,
    /// Pa.
    pub p: f64,
    /// m³.
    pub v: f64,
    /// mol of every species of the data (zero: not a candidate).
    pub n: Vec<f64>,
    pub iterations: usize,
}

impl GasState {
    pub fn total(&self) -> f64 {
        self.n.iter().sum()
    }
    /// Enthalpy, J.
    pub fn enthalpy(&self, data: &GasData) -> f64 {
        self.n.iter().enumerate().filter(|x| *x.1 > 0.0).map(|(i, n)| n * data.species[i].thermo(self.t).h).sum()
    }
    /// Internal energy, J.
    pub fn energy(&self, data: &GasData) -> f64 {
        self.enthalpy(data) - self.total() * R_GAS * self.t
    }
    /// Entropy, J/K.
    pub fn entropy(&self, data: &GasData) -> f64 {
        let total = self.total();
        self.n.iter().enumerate().filter(|x| *x.1 > 0.0).map(|(i, n)| n * (data.species[i].thermo(self.t).s - R_GAS * dmath::log(n / total * self.p / data.p0))).sum()
    }
    /// Heat capacity at constant pressure with the composition frozen, J/K.
    pub fn heat_capacity(&self, data: &GasData) -> f64 {
        self.n.iter().enumerate().filter(|x| *x.1 > 0.0).map(|(i, n)| n * data.species[i].thermo(self.t).cp).sum()
    }
}

/// Element totals (mol of atoms) of amounts `(species, mol)`.
pub fn elements_of(data: &GasData, amounts: &[(usize, f64)]) -> Vec<f64> {
    let mut b = vec![0.0; data.elements.len()];
    for &(i, n) in amounts {
        for &(e, a) in &data.species[i].comp {
            b[e] += a * n;
        }
    }
    b
}

/// Solve `m·x = r` in place by elimination with partial pivoting; a direction without a pivot (dependent element
/// balances) gets zero.
fn solve_linear(m: &mut [Vec<f64>], r: &mut [f64]) -> Vec<f64> {
    let n = r.len();
    let scale = m.iter().flat_map(|row| row.iter()).fold(0.0f64, |a, x| a.max(x.abs()));
    let mut pivot_of = vec![usize::MAX; n];
    let mut used = vec![false; n];
    for col in 0..n {
        let mut best = usize::MAX;
        let mut size = 1e-14 * scale;
        for row in 0..n {
            if !used[row] && m[row][col].abs() > size {
                size = m[row][col].abs();
                best = row;
            }
        }
        if best == usize::MAX {
            continue;
        }
        used[best] = true;
        pivot_of[col] = best;
        for row in 0..n {
            if row != best && m[row][col] != 0.0 {
                let f = m[row][col] / m[best][col];
                for k in col..n {
                    let v = m[best][k];
                    m[row][k] -= f * v;
                }
                r[row] -= f * r[best];
            }
        }
    }
    (0..n).map(|col| if pivot_of[col] == usize::MAX { 0.0 } else { r[pivot_of[col]] / m[pivot_of[col]][col] }).collect()
}

/// The candidates that can exist with these element totals, and the elements present.
fn active(data: &GasData, candidates: &[usize], b: &[f64]) -> (Vec<usize>, Vec<usize>) {
    let elements: Vec<usize> = (0..b.len()).filter(|&e| b[e] > 0.0).collect();
    let mut species: Vec<usize> = candidates.iter().copied().filter(|&i| data.species[i].comp.iter().all(|c| b[c.0] > 0.0)).collect();
    species.sort_unstable();
    species.dedup();
    (species, elements)
}

const MAX_ITERATIONS: usize = 400;
/// Smallest ln(n_i / N) kept.
const FLOOR: f64 = -250.0;
/// Mole fractions below this are not determined reliably and not reported (ln 10⁻¹²).
pub const LN_REPORTED: f64 = -27.631021;
/// Below this ln(n_i / N) a species is a trace species for the step control (RP-1311, eq. 3.2).
const SIZE: f64 = -18.420681;

/// Working state of an equilibrium: logarithms of the scaled amounts of the active species.
#[derive(Clone, Debug)]
pub struct Start {
    species: Vec<usize>,
    ln_n: Vec<f64>,
    ln_total: f64,
}

/// Equilibrium composition at a temperature for the element totals `b` among the candidates.
pub fn equilibrium(data: &GasData, candidates: &[usize], b: &[f64], t: f64, hold: Hold, start: Option<&Start>) -> Result<(GasState, Start), Failure> {
    let (species, elements) = active(data, candidates, b);
    let scale: f64 = b.iter().sum();
    if species.is_empty() || !(scale > 0.0) || !(t > 0.0) {
        return Err(Failure::NoSpecies);
    }
    // Every element present needs a species
    if elements.iter().any(|&e| !species.iter().any(|&i| data.species[i].comp.iter().any(|c| c.0 == e))) {
        return Err(Failure::NoSpecies);
    }
    let ns = species.len();
    let ne = elements.len();
    let at_pressure = matches!(hold, Hold::Pressure(_));
    let rows: Vec<Vec<f64>> = species.iter().map(|&i| elements.iter().map(|&e| data.species[i].comp.iter().find(|c| c.0 == e).map(|c| c.1).unwrap_or(0.0)).collect()).collect();
    let target: Vec<f64> = elements.iter().map(|&e| b[e] / scale).collect();
    let g0: Vec<f64> = species.iter().map(|&i| { let th = data.species[i].thermo(t); th.h / (R_GAS * t) - th.s / R_GAS }).collect();
    // ln(P/P0) at fixed pressure; ln(R T / (V P0)) for the scaled amounts at fixed volume
    let offset = match hold {
        Hold::Pressure(p) => dmath::log(p / data.p0),
        Hold::Volume(v) => dmath::log(R_GAS * t * scale / (v * data.p0)),
    };
    let (mut ln_n, mut ln_total) = match start {
        Some(s) if s.species == species => (s.ln_n.clone(), s.ln_total),
        _ => (vec![dmath::log(0.1 / ns as f64); ns], dmath::log(0.1)),
    };
    let size = ne + usize::from(at_pressure);
    let mut iterations = 0;
    let mut done = false;
    while iterations < MAX_ITERATIONS {
        iterations += 1;
        let n: Vec<f64> = ln_n.iter().map(|&x| dmath::exp(x)).collect();
        let sum: f64 = n.iter().sum();
        if !at_pressure {
            ln_total = dmath::log(sum);
        }
        let total = dmath::exp(ln_total);
        let g: Vec<f64> = (0..ns).map(|i| g0[i] + ln_n[i] + offset - if at_pressure { ln_total } else { 0.0 }).collect();
        let mut m = vec![vec![0.0; size]; size];
        let mut r = vec![0.0; size];
        for i in 0..ns {
            for k in 0..ne {
                let w = rows[i][k] * n[i];
                if w == 0.0 {
                    continue;
                }
                for j in 0..ne {
                    m[k][j] += w * rows[i][j];
                }
                if at_pressure {
                    m[k][ne] += w;
                    m[ne][k] += w;
                }
                r[k] += w * g[i] - w;
            }
            if at_pressure {
                r[ne] += n[i] * g[i];
            }
        }
        for k in 0..ne {
            r[k] += target[k];
        }
        if at_pressure {
            m[ne][ne] = sum - total;
            r[ne] += total - sum;
        }
        let x = solve_linear(&mut m, &mut r);
        let d_total = if at_pressure { x[ne] } else { 0.0 };
        let d: Vec<f64> = (0..ns).map(|i| -g[i] + (0..ne).map(|j| rows[i][j] * x[j]).sum::<f64>() + d_total).collect();
        if d.iter().any(|v| !v.is_finite()) || !d_total.is_finite() {
            return Err(Failure::NotConverged);
        }
        // Step control of RP-1311 (eqs. 3.1 – 3.3)
        let mut largest = 5.0 * d_total.abs();
        let mut lambda2 = 1.0f64;
        for i in 0..ns {
            let rel = ln_n[i] - ln_total;
            if rel > SIZE {
                largest = largest.max(d[i].abs());
            } else if d[i] >= 0.0 {
                let denom = d[i] - d_total;
                if denom != 0.0 {
                    lambda2 = lambda2.min(((-rel - 9.2103404) / denom).abs());
                }
            }
        }
        let lambda = (if largest > 2.0 { 2.0 / largest } else { 1.0 }).min(lambda2);
        // Settled: no correction left for anything above the reporting limit. Below it the element balances no
        // longer determine the amounts in double precision (a stoichiometric mixture burnt out at room temperature
        // leaves 10⁻³⁰ of the reactants), so those species are not asked to settle — and are not reported.
        let mut settled = !at_pressure || d_total.abs() < 1e-11;
        for i in 0..ns {
            if ln_n[i] - ln_total > LN_REPORTED && d[i].abs() > 1e-10 {
                settled = false;
            }
            ln_n[i] += lambda * d[i];
        }
        if at_pressure {
            ln_total += lambda * d_total;
        }
        for x in &mut ln_n {
            if *x < ln_total + FLOOR {
                *x = ln_total + FLOOR;
            }
        }
        if settled {
            // The element balances hold to rounding once the corrections vanish; check them
            let n: Vec<f64> = ln_n.iter().map(|&x| dmath::exp(x)).collect();
            let worst = (0..ne).map(|k| ((0..ns).map(|i| rows[i][k] * n[i]).sum::<f64>() - target[k]).abs()).fold(0.0f64, f64::max);
            if worst < 1e-11 {
                done = true;
                break;
            }
        }
    }
    if !done {
        return Err(Failure::NotConverged);
    }
    let mut amounts = vec![0.0; data.species.len()];
    let mut sum = 0.0;
    for (k, &i) in species.iter().enumerate() {
        amounts[i] = dmath::exp(ln_n[k]) * scale;
        sum += amounts[i];
    }
    let (p, v) = match hold {
        Hold::Pressure(p) => (p, sum * R_GAS * t / p),
        Hold::Volume(v) => (sum * R_GAS * t / v, v),
    };
    Ok((GasState { t, p, v, n: amounts, iterations }, Start { species, ln_n, ln_total }))
}

/// The equilibrium state whose enthalpy (fixed pressure) or internal energy (fixed volume) is `energy` (J).
pub fn adiabatic(data: &GasData, candidates: &[usize], b: &[f64], energy: f64, hold: Hold) -> Result<GasState, Failure> {
    let mut iterations = 0;
    let mut start: Option<Start> = None;
    let at = |t: f64, start: &mut Option<Start>, iterations: &mut usize| -> Result<(f64, GasState), Failure> {
        let (state, s) = equilibrium(data, candidates, b, t, hold, start.as_ref())?;
        *start = Some(s);
        *iterations += state.iterations;
        let e = match hold {
            Hold::Pressure(_) => state.enthalpy(data),
            Hold::Volume(_) => state.energy(data),
        };
        Ok((e - energy, state))
    };
    let (mut lo, mut hi) = (T_LOW, T_HIGH);
    if at(lo, &mut start, &mut iterations)?.0 > 0.0 {
        return Err(Failure::OutOfRange(false));
    }
    start = None;
    if at(hi, &mut start, &mut iterations)?.0 < 0.0 {
        return Err(Failure::OutOfRange(true));
    }
    let mut last = None;
    for _ in 0..60 {
        let mid = 0.5 * (lo + hi);
        let (f, state) = at(mid, &mut start, &mut iterations)?;
        last = Some(state);
        if f > 0.0 {
            hi = mid;
        } else {
            lo = mid;
        }
        if hi - lo < 1e-9 {
            break;
        }
    }
    let mut state = last.ok_or(Failure::NotConverged)?;
    state.iterations = iterations;
    Ok(state)
}
