//! The chemistry database of a core instance (26.64, D262, D263): components, species and their formation reactions,
//! read once from the data files the front end hands over (`chemSetData`). Nothing here is compiled in.
//!
//! The aqueous network (`src/chem/data/aqueous.json`, built by `scripts/chem/build_aqueous.py` from the PHREEQC
//! database files) describes every species as a formation reaction from *components*
//!
//! ```text
//!   species = Σ_j ν_j · component_j        log K(T) = A1 + A2·T + A3/T + A4·log10 T + A5/T² + A6·T²
//! ```
//!
//! Component 0 is water and component 1 is H⁺. Oxidation states are components of their own (Fe²⁺ and Fe³⁺, NO₃⁻
//! and NH₄⁺ …): electron transfer is a declared reaction with a rate, never an instant equilibrium (D264, D265).

use std::cell::RefCell;
use std::collections::BTreeMap;
use std::rc::Rc;

use serde_json::Value;
use velophi_core::dmath;
use velophi_core::message::{Message, SimResult};
use velophi_core::transport::dnum;

/// ln 10.
pub const LN10: f64 = std::f64::consts::LN_10;
/// Gas constant, J/(mol·K) (CODATA 2018, exact).
pub const R_GAS: f64 = 8.314462618;
/// Gas constant, L·atm/(mol·K).
pub const R_L_ATM: f64 = 0.082057366080960;
/// Molar mass of water, kg/mol (as PHREEQC uses it: 18.016 g/mol would differ; the data file's own H2O entry wins).
pub const WATER_KG_PER_MOL: f64 = 0.018015;
/// Index of water among the components.
pub const C_H2O: usize = 0;
/// Index of H⁺ among the components.
pub const C_H: usize = 1;

/// Phase of a species.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Phase {
    Aq,
    Solid,
    Liquid,
    Gas,
}

impl Phase {
    pub fn name(self) -> &'static str {
        match self {
            Phase::Aq => "aq",
            Phase::Solid => "s",
            Phase::Liquid => "l",
            Phase::Gas => "g",
        }
    }
    fn parse(s: &str) -> Option<Phase> {
        Some(match s {
            "aq" => Phase::Aq,
            "s" => Phase::Solid,
            "l" => Phase::Liquid,
            "g" => Phase::Gas,
            _ => return None,
        })
    }
}

/// Activity-coefficient model of an aqueous species, chosen exactly as PHREEQC chooses it from the data (checked
/// against the reference program species by species): ion-size parameters given → the WATEQ Debye–Hückel form
/// log γ = −A z² √I / (1 + a B √I) + b I (with a = b = 0 this is the limiting law, as for most species of
/// minteq.v4.dat); none given and no charge → log γ = 0.1·I; none given and charged → the Davies equation.
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Gamma {
    Davies,
    Wateq { a: f64, b: f64 },
    Neutral,
}

/// A chemical species.
#[derive(Clone, Debug)]
pub struct Species {
    pub id: String,
    pub phase: Phase,
    /// Charge number.
    pub z: f64,
    /// Elements and their counts, sorted by symbol.
    pub comp: Vec<(String, f64)>,
    /// Molar mass, g/mol.
    pub molar_mass: f64,
    /// Index among the components when the species is one.
    pub component: Option<usize>,
    /// Formation from components: (component index, coefficient), sorted by index. Empty for a species outside the
    /// aqueous network (a metal, an organic liquid …): it only takes part in declared reactions.
    pub rxn: Vec<(usize, f64)>,
    /// Analytic coefficients of log10 K(T) of the formation reaction.
    pub log_k: [f64; 6],
    pub gamma: Gamma,
    /// A solid that forms from solution at the bench (fresh precipitates); other solids only dissolve.
    pub forms: bool,
    /// Where the data come from.
    pub src: String,
}

impl Species {
    /// log10 K of the formation reaction at T (K).
    pub fn log_k_at(&self, t: f64) -> f64 {
        let a = &self.log_k;
        a[0] + a[1] * t + a[2] / t + a[3] * (dmath::log(t) / LN10) + a[4] / (t * t) + a[5] * t * t
    }

    /// Enthalpy of the formation reaction at T, J/mol: ΔH = R·T²·d ln K/dT.
    pub fn delta_h_at(&self, t: f64) -> f64 {
        let a = &self.log_k;
        let dlog = a[1] - a[2] / (t * t) + a[3] / (t * LN10) - 2.0 * a[4] / (t * t * t) + 2.0 * a[5] * t;
        R_GAS * t * t * LN10 * dlog
    }

    /// True when the species belongs to the aqueous equilibrium network.
    pub fn in_network(&self) -> bool {
        !self.rxn.is_empty()
    }
}

/// A redox couple the sources define: `species = Σ ν·component + n·e⁻` with log K(T) (for electrode potentials).
#[derive(Clone, Debug)]
pub struct Couple {
    pub species: usize,
    pub rxn: Vec<(usize, f64)>,
    pub electrons: f64,
    pub log_k: [f64; 6],
}

/// The database of a core instance.
#[derive(Clone, Debug, Default)]
pub struct Database {
    /// Species index of each component (0: water, 1: H⁺).
    pub components: Vec<usize>,
    pub species: Vec<Species>,
    pub by_id: BTreeMap<String, usize>,
    pub couples: Vec<Couple>,
    /// Debye–Hückel A(T) and B(T): values at `dh_t0 + k·dh_dt`.
    pub dh_t0: f64,
    pub dh_dt: f64,
    pub dh_a: Vec<f64>,
    pub dh_b: Vec<f64>,
    /// Aqueous species (network members) and gases and solids of the network, in index order.
    pub aqueous: Vec<usize>,
    pub solids: Vec<usize>,
    pub gases: Vec<usize>,
    /// The catalogue: substances outside the network, reagents, declared reactions (`catalog.rs`).
    pub cat: crate::catalog::Catalog,
}

fn bad(what: impl Into<String>) -> Message {
    Message::new("err.internal").text("message", format!("chemistry data: {}", what.into()))
}

fn coeffs(v: &Value) -> [f64; 6] {
    let mut out = [0.0; 6];
    if let Some(a) = v.as_array() {
        for (i, x) in a.iter().take(6).enumerate() {
            out[i] = dnum(x);
        }
    }
    out
}

impl Database {
    /// Read the aqueous network (`velophi-chemdb` version 1).
    pub fn from_aqueous(doc: &Value) -> SimResult<Database> {
        if doc.get("format").and_then(|v| v.as_str()) != Some("velophi-chemdb") {
            return Err(bad("not a velophi-chemdb document"));
        }
        let mut db = Database::default();
        let list = doc.get("species").and_then(|v| v.as_array()).ok_or_else(|| bad("no species"))?;
        // First pass: ids, so reactions can refer to components by index
        let comp_ids: Vec<String> = doc.get("components").and_then(|v| v.as_array()).ok_or_else(|| bad("no components"))?.iter().map(|v| v.as_str().unwrap_or("").to_string()).collect();
        if comp_ids.len() < 2 || comp_ids[C_H2O] != "H2O" || comp_ids[C_H] != "H+" {
            return Err(bad("the first two components must be H2O and H+"));
        }
        let comp_index: BTreeMap<&str, usize> = comp_ids.iter().enumerate().map(|(i, s)| (s.as_str(), i)).collect();
        db.components = vec![usize::MAX; comp_ids.len()];
        for s in list {
            let id = s.get("id").and_then(|v| v.as_str()).ok_or_else(|| bad("a species without an id"))?.to_string();
            let phase = s.get("phase").and_then(|v| v.as_str()).and_then(Phase::parse).ok_or_else(|| bad(format!("{id}: unknown phase")))?;
            let z = s.get("z").map(dnum).unwrap_or(0.0);
            let mut comp: Vec<(String, f64)> = s.get("comp").and_then(|v| v.as_object()).map(|o| o.iter().map(|(k, v)| (k.clone(), dnum(v))).collect()).unwrap_or_default();
            comp.sort_by(|a, b| a.0.cmp(&b.0));
            let component = if s.get("component").and_then(|v| v.as_bool()).unwrap_or(false) { Some(*comp_index.get(id.as_str()).ok_or_else(|| bad(format!("{id}: marked as a component but not listed")))?) } else { None };
            let mut rxn: Vec<(usize, f64)> = Vec::new();
            if let Some(c) = component {
                rxn.push((c, 1.0));
            } else if let Some(o) = s.get("rxn").and_then(|v| v.as_object()) {
                for (k, v) in o {
                    let j = *comp_index.get(k.as_str()).ok_or_else(|| bad(format!("{id}: reaction names the unknown component {k}")))?;
                    rxn.push((j, dnum(v)));
                }
                rxn.sort_by(|a, b| a.0.cmp(&b.0));
            }
            let gamma = match s.get("gamma").and_then(|v| v.as_array()) {
                Some(g) if g.len() >= 2 => Gamma::Wateq { a: dnum(&g[0]), b: dnum(&g[1]) },
                _ => {
                    if z == 0.0 {
                        Gamma::Neutral
                    } else {
                        Gamma::Davies
                    }
                }
            };
            let index = db.species.len();
            if db.by_id.insert(id.clone(), index).is_some() {
                return Err(bad(format!("{id}: defined twice")));
            }
            if let Some(c) = component {
                db.components[c] = index;
            }
            db.species.push(Species {
                id,
                phase,
                z,
                comp,
                molar_mass: s.get("M").map(dnum).unwrap_or(0.0),
                component,
                rxn,
                log_k: s.get("logK").map(coeffs).unwrap_or([0.0; 6]),
                gamma,
                forms: s.get("forms").and_then(|v| v.as_bool()).unwrap_or(false),
                src: s.get("src").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            });
        }
        if let Some(j) = db.components.iter().position(|&i| i == usize::MAX) {
            return Err(bad(format!("component {} has no species", comp_ids[j])));
        }
        for c in doc.get("couples").and_then(|v| v.as_array()).cloned().unwrap_or_default() {
            let Some(&species) = c.get("id").and_then(|v| v.as_str()).and_then(|id| db.by_id.get(id)) else { continue };
            let mut rxn = Vec::new();
            let mut electrons = 0.0;
            let mut ok = true;
            for (k, v) in c.get("rxn").and_then(|v| v.as_object()).cloned().unwrap_or_default() {
                if k == "e-" {
                    electrons = dnum(&v);
                } else if let Some(&j) = comp_index.get(k.as_str()) {
                    rxn.push((j, dnum(&v)));
                } else {
                    ok = false;
                }
            }
            if ok {
                rxn.sort_by(|a, b| a.0.cmp(&b.0));
                db.couples.push(Couple { species, rxn, electrons, log_k: c.get("logK").map(coeffs).unwrap_or([0.0; 6]) });
            }
        }
        let dh = doc.get("dh").ok_or_else(|| bad("no Debye–Hückel table"))?;
        db.dh_t0 = dnum(&dh["t0"]);
        db.dh_dt = dnum(&dh["dt"]);
        db.dh_a = dh["A"].as_array().map(|a| a.iter().map(dnum).collect()).unwrap_or_default();
        db.dh_b = dh["B"].as_array().map(|a| a.iter().map(dnum).collect()).unwrap_or_default();
        if db.dh_a.len() < 2 || db.dh_a.len() != db.dh_b.len() || !(db.dh_dt > 0.0) {
            return Err(bad("the Debye–Hückel table is incomplete"));
        }
        db.cat.extra = vec![crate::catalog::Extra::default(); db.species.len()];
        db.index();
        Ok(db)
    }

    pub(crate) fn index(&mut self) {
        self.aqueous = (0..self.species.len()).filter(|&i| self.species[i].phase == Phase::Aq && self.species[i].in_network()).collect();
        self.solids = (0..self.species.len()).filter(|&i| self.species[i].phase == Phase::Solid && self.species[i].in_network()).collect();
        self.gases = (0..self.species.len()).filter(|&i| self.species[i].phase == Phase::Gas && self.species[i].in_network()).collect();
    }

    /// Mark the solids that form from solution at the bench (the curated list of fresh precipitates).
    pub fn set_forms(&mut self, ids: &[String]) -> Vec<String> {
        let mut unknown = Vec::new();
        for id in ids {
            match self.by_id.get(id) {
                Some(&i) if self.species[i].phase == Phase::Solid => self.species[i].forms = true,
                _ => unknown.push(id.clone()),
            }
        }
        unknown
    }

    /// The species with this id.
    pub fn find(&self, id: &str) -> Option<usize> {
        self.by_id.get(id).copied()
    }

    /// Debye–Hückel A and B at T (K), linearly interpolated in the table; outside it the end values (the aqueous
    /// model is for 0 … 100 °C at about one atmosphere).
    pub fn dh(&self, t: f64) -> (f64, f64) {
        let n = self.dh_a.len();
        let u = ((t - self.dh_t0) / self.dh_dt).clamp(0.0, (n - 1) as f64);
        let k = (u.floor() as usize).min(n - 2);
        let f = u - k as f64;
        (self.dh_a[k] + f * (self.dh_a[k + 1] - self.dh_a[k]), self.dh_b[k] + f * (self.dh_b[k + 1] - self.dh_b[k]))
    }

    /// Component totals (moles) of an amount of a network species, added to `totals`.
    pub fn add_to_totals(&self, species: usize, moles: f64, totals: &mut [f64]) {
        for &(j, nu) in &self.species[species].rxn {
            totals[j] += nu * moles;
        }
    }
}

thread_local! {
    static DB: RefCell<Option<Rc<Database>>> = const { RefCell::new(None) };
}

/// Install the database of this core instance.
pub fn set_database(db: Database) -> Rc<Database> {
    let rc = Rc::new(db);
    DB.with(|d| *d.borrow_mut() = Some(Rc::clone(&rc)));
    rc
}

/// The database, or the error "chemistry data not loaded".
pub fn database() -> SimResult<Rc<Database>> {
    DB.with(|d| d.borrow().clone()).ok_or_else(|| Message::new("chem.noData"))
}

/// Replace the database after changing it (the curated flags are set after the network is read).
pub fn update_database(f: impl FnOnce(&mut Database)) -> SimResult<Rc<Database>> {
    let mut db = (*database()?).clone();
    f(&mut db);
    db.index();
    Ok(set_database(db))
}
