//! Electrochemistry at the bench (26.64, D266): galvanic cells and electrolysis.
//!
//! An electrode in a vessel can carry every couple of the catalogue whose reactants are there. Its potential is
//! Nernst's, with the activities of the vessel's last equilibrium:
//!
//! ```text
//!   ox + n e⁻ → red        E = E° − (RT / nF) · ln( Π a_red^ν / Π a_ox^ν )
//! ```
//!
//! A species on the product side that is not there yet counts with a stated convention: a gas at 1 atm (it leaves as
//! bubbles), a solid or liquid at activity 1, a dissolved species at 10⁻⁶. Gas evolution carries an overpotential
//! that depends on the electrode (a table of stated approximations, below; the catalogue may override it). At a
//! cathode the couple with the highest effective potential runs, at an anode the one with the lowest — the discharge
//! order of the textbooks, including the electrode itself dissolving when it is the easiest thing to oxidise.
//!
//! Without a source, the cell runs in the direction that gives a positive electromotive force; with a source of
//! voltage U (its positive pole on electrode `a`) current flows when U exceeds the decomposition voltage. The current
//! follows from Ohm's law with the external resistance and an internal one estimated from the conductivity of the
//! solutions (flagged approximate); Faraday's law then moves the amounts. Two vessels need a salt bridge: it carries
//! potassium and nitrate ions so that each vessel stays neutral.

use std::collections::BTreeMap;

use serde_json::{json, Value};
use velophi_core::dmath;
use velophi_core::transport::jnum;

use crate::bench::{Ambient, Events, Vessel};
use crate::catalog::Electrode;
use crate::db::{Database, Phase, C_H2O, R_GAS};
use crate::equil::Failure;

/// Faraday constant, C/mol.
pub const FARADAY: f64 = 96_485.332_12;
/// Activity assumed for a dissolved product that is not there yet.
const TRACE: f64 = 1e-6;
/// Resistance of a salt bridge, Ω (a stated approximation).
const BRIDGE_OHM: f64 = 5.0;
/// Cell constant of two electrodes in a beaker, 1/m (a stated approximation: 2 cm² plates 4 cm apart).
const CELL_CONSTANT: f64 = 200.0;

/// One electrode: the vessel it dips into and what it is made of (`Zn(s)`, `Cu(s)`, `C(s)`, `Pt(s)` …).
#[derive(Clone, Debug, PartialEq)]
pub struct Pole {
    pub vessel: String,
    pub material: usize,
    /// What was deposited on it (+) or dissolved from it (−), mol by species.
    pub deposit: BTreeMap<usize, f64>,
}

/// A circuit: two electrodes, a load or a source.
#[derive(Clone, Debug, PartialEq)]
pub struct Circuit {
    pub id: String,
    pub a: Pole,
    pub b: Pole,
    pub bridge: bool,
    /// External resistance, Ω.
    pub load: f64,
    /// Voltage of a source with its positive pole on `a`, V (0: none).
    pub source: f64,
    pub on: bool,
    // The last evaluation
    /// Electromotive force (galvanic) or decomposition voltage (electrolysis), V.
    pub emf: f64,
    /// Current, A: positive when `a` is the anode (electrons leave `a`).
    pub current: f64,
    pub anode_couple: Option<usize>,
    pub cathode_couple: Option<usize>,
    pub internal: f64,
    /// Charge passed so far, C.
    pub charge: f64,
}

/// Overpotential of gas evolution, V: a short table of stated approximations (order of magnitude at small current
/// densities; hydrogen after the usual Tafel-plot values, oxygen and chlorine after textbook discharge-order tables).
fn overpotential(db: &Database, product: &str, electrode: usize) -> f64 {
    let metal = db.species.get(electrode).map(|s| s.id.as_str()).unwrap_or("");
    // The catalogue's table first (by gas and the electrode's element symbol), then the defaults below
    let gas = if product.starts_with("H2") && !product.starts_with("H2O") {
        "H2"
    } else if product.starts_with("O2") {
        "O2"
    } else if product.starts_with("Cl2") {
        "Cl2"
    } else {
        ""
    };
    let symbol = metal.split('(').next().unwrap_or("");
    if let Some(v) = db.cat.overpotential.get(&(gas.to_string(), symbol.to_string())) {
        return *v;
    }
    if product.starts_with("H2") && !product.starts_with("H2O") {
        match metal {
            "Pt(s)" => 0.05,
            "Fe(s)" | "Ni(s)" => 0.4,
            "Cu(s)" | "Ag(s)" => 0.5,
            "C(s)" => 0.6,
            "Zn(s)" | "Pb(s)" | "Sn(s)" => 0.75,
            _ => 0.4,
        }
    } else if product.starts_with("O2") {
        match metal {
            "Pt(s)" => 0.5,
            _ => 0.7,
        }
    } else if product.starts_with("Cl2") {
        0.1
    } else {
        0.0
    }
}

/// Activity of a species at an electrode for the Nernst equation; None when it is not available.
fn activity(db: &Database, v: &Vessel, ambient: Ambient, species: usize, pole: &Pole) -> Option<f64> {
    if species == pole.material || pole.deposit.get(&species).copied().unwrap_or(0.0) > 1e-12 {
        return Some(1.0);
    }
    // A gas as a reactant counts with the pressure it has in equilibrium with the solution (hydrogen or oxygen fed to
    // a fuel-cell electrode, chlorine dissolved in brine) — the room's air above an open beaker does not reach the
    // electrode fast enough to be the cathode reaction of a textbook cell
    let a = if db.species[species].phase == Phase::Gas {
        let _ = ambient;
        v.sol.as_ref().and_then(|s| s.pressure.iter().find(|p| p.0 == species)).map(|p| p.1).filter(|p| *p > 1e-9).unwrap_or(0.0)
    } else {
        crate::kinetics::activity(db, v, ambient, species)
    };
    if a > 0.0 {
        Some(a)
    } else {
        None
    }
}

/// Potential of a couple at an electrode, V, for the direction asked: `reduce` (ox → red) or oxidise. None when a
/// reactant of that direction is missing or the couple is declared inert.
fn potential(db: &Database, v: &Vessel, ambient: Ambient, c: &Electrode, pole: &Pole, reduce: bool) -> Option<(f64, f64)> {
    if c.inert || !(c.n > 0.0) || !c.e0.is_finite() || v.sol.is_none() {
        return None;
    }
    let mut ln_q = 0.0;
    let mut eta = 0.0f64;
    let (reactants, products, sign) = if reduce { (&c.ox, &c.red, -1.0) } else { (&c.red, &c.ox, 1.0) };
    for &(s, nu) in reactants {
        let a = activity(db, v, ambient, s, pole)?;
        ln_q += sign * nu * dmath::log(a);
    }
    for &(s, nu) in products {
        let sp = &db.species[s];
        let dissolved_gas = sp.phase == Phase::Aq && matches!(sp.id.as_str(), "H2" | "O2" | "Cl2");
        let a = if sp.phase == Phase::Gas || dissolved_gas {
            eta = eta.max(overpotential(db, &sp.id, pole.material));
            1.0
        } else {
            match activity(db, v, ambient, s, pole) {
                Some(a) => a,
                None => match sp.phase {
                    Phase::Aq => TRACE,
                    _ => 1.0,
                },
            }
        };
        ln_q -= sign * nu * dmath::log(a);
    }
    // ln_q is ln(Π a_red / Π a_ox) with the conventions above
    let e = c.e0 - R_GAS * v.t / (c.n * FARADAY) * ln_q;
    Some((e, eta))
}

/// The couple that runs at an electrode as cathode (highest effective potential) or anode (lowest).
fn discharge(db: &Database, v: &Vessel, ambient: Ambient, pole: &Pole, cathode: bool, driven: bool) -> Option<(usize, f64)> {
    let mut best: Option<(usize, f64)> = None;
    for (k, c) in db.cat.electrodes.iter().enumerate() {
        if !c.at_electrode {
            continue;
        }
        // Under an external source a couple that would consume a gas is left out: the reduction of dissolved oxygen
        // at the cathode and the oxidation of dissolved hydrogen at the anode are limited by the diffusion of a
        // gas of a millimole per litre and never carry the current of an electrolysis (in a stoppered vessel they
        // would otherwise take all of it: first the air, then the hydrogen just made). In a cell without a source
        // they are the oxygen and the hydrogen electrode.
        let consumed = if cathode { &c.ox } else { &c.red };
        if driven && consumed.iter().any(|x| db.species[x.0].phase == Phase::Gas || matches!(db.species[x.0].id.as_str(), "H2" | "O2" | "Cl2")) {
            continue;
        }
        let Some((e, eta)) = potential(db, v, ambient, c, pole, cathode) else { continue };
        let eff = if cathode { e - eta } else { e + eta };
        let better = match best {
            None => true,
            Some((_, b)) => {
                if cathode {
                    eff > b
                } else {
                    eff < b
                }
            }
        };
        if better {
            best = Some((k, eff));
        }
    }
    // The classroom rule for chloride (catalogue, `electrolysis.chloride`): where oxygen would form at the anode and
    // the solution holds chloride above the threshold, chlorine forms instead. In a real cell the anode layer turns
    // acid within seconds and oxygen falls behind; the well-mixed vessel of the model cannot show that, and without
    // the rule a brine would switch to oxygen as soon as the cathode has made the solution alkaline.
    if !cathode {
        if let (Some((k, _)), Some((chlorine, threshold))) = (best, db.cat.chloride_rule) {
            let makes_oxygen = db.cat.electrodes[k].ox.iter().any(|x| matches!(db.species[x.0].id.as_str(), "O2(g)" | "O2"));
            let chloride = db.find("Cl-").and_then(|s| v.sol.as_ref().and_then(|sol| sol.aqueous.iter().find(|x| x.0 == s).map(|x| x.1))).unwrap_or(0.0);
            if makes_oxygen && chloride >= threshold {
                if let Some((e, eta)) = potential(db, v, ambient, &db.cat.electrodes[chlorine], pole, false) {
                    best = Some((chlorine, e + eta));
                }
            }
        }
    }
    best
}

/// Internal resistance of a vessel's solution between two electrodes, Ω: from the ionic strength with one molar
/// conductivity for all ions (12 mS·m²/mol per unit of ionic strength — the order of magnitude of common salts).
fn solution_resistance(v: &Vessel) -> f64 {
    let Some(s) = &v.sol else { return f64::INFINITY };
    let litres = v.volume_l.max(1e-9);
    let ionic = s.ionic_strength * s.water_kg / litres * 1e3;
    let kappa = 0.012 * ionic;
    if kappa > 0.0 {
        CELL_CONSTANT / kappa
    } else {
        f64::INFINITY
    }
}

impl Circuit {
    pub fn new(id: &str, a: Pole, b: Pole) -> Circuit {
        Circuit { id: id.to_string(), a, b, bridge: false, load: 10.0, source: 0.0, on: true, emf: 0.0, current: 0.0, anode_couple: None, cathode_couple: None, internal: 0.0, charge: 0.0 }
    }

    fn connected(&self) -> bool {
        self.a.vessel == self.b.vessel || self.bridge
    }

    /// Evaluate the circuit: which couples run, the electromotive force and the current.
    pub fn evaluate(&mut self, db: &Database, vessels: &BTreeMap<String, Vessel>, ambient: Ambient) {
        self.current = 0.0;
        self.emf = 0.0;
        self.anode_couple = None;
        self.cathode_couple = None;
        let (Some(va), Some(vb)) = (vessels.get(&self.a.vessel), vessels.get(&self.b.vessel)) else { return };
        if !self.connected() {
            return;
        }
        self.internal = if self.a.vessel == self.b.vessel { solution_resistance(va) } else { solution_resistance(va) + solution_resistance(vb) + BRIDGE_OHM };
        let driven = self.source > 0.0;
        let (ca, aa) = (discharge(db, va, ambient, &self.a, true, driven), discharge(db, va, ambient, &self.a, false, driven));
        let (cb, ab) = (discharge(db, vb, ambient, &self.b, true, driven), discharge(db, vb, ambient, &self.b, false, driven));
        let resistance = self.load.max(0.0) + self.internal;
        if self.source > 0.0 {
            // Electrolysis: the source's positive pole is on `a`, which becomes the anode
            let (Some((ka, ea)), Some((kb, eb))) = (aa, cb) else { return };
            self.emf = ea - eb;
            self.anode_couple = Some(ka);
            self.cathode_couple = Some(kb);
            if self.on && resistance.is_finite() && self.source > self.emf {
                self.current = (self.source - self.emf) / resistance.max(1e-9);
            }
            return;
        }
        // Galvanic: the direction with the larger electromotive force
        let forward = match (aa, cb) {
            (Some((ka, ea)), Some((kb, eb))) => Some((eb - ea, ka, kb)),
            _ => None,
        };
        let backward = match (ab, ca) {
            (Some((kb, eb)), Some((ka, ea))) => Some((ea - eb, kb, ka)),
            _ => None,
        };
        let pick_forward = match (forward, backward) {
            (Some(f), Some(b)) => f.0 >= b.0,
            (Some(_), None) => true,
            _ => false,
        };
        if let Some((emf, anode, cathode)) = if pick_forward { forward } else { backward } {
            self.emf = emf;
            self.anode_couple = Some(anode);
            self.cathode_couple = Some(cathode);
            if self.on && emf > 0.0 && resistance.is_finite() {
                let i = emf / resistance.max(1e-9);
                self.current = if pick_forward { i } else { -i };
            }
        }
    }

    pub fn json(&self, db: &Database) -> Value {
        let name = |k: Option<usize>| k.map(|k| Value::String(db.cat.electrodes[k].id.clone())).unwrap_or(Value::Null);
        let pole = |p: &Pole| {
            let grams: f64 = p.deposit.iter().map(|(&s, &n)| n * db.species[s].molar_mass).sum();
            json!({ "vessel": p.vessel, "material": db.species[p.material].id, "massChange_g": jnum(grams),
                "deposit": p.deposit.iter().filter(|x| x.1.abs() > 1e-15).map(|(&s, &n)| json!({ "id": db.species[s].id, "n": jnum(n) })).collect::<Vec<_>>() })
        };
        let u_load = self.current.abs() * self.load;
        json!({
            "id": self.id, "a": pole(&self.a), "b": pole(&self.b), "bridge": self.bridge, "load": jnum(self.load), "source": jnum(self.source), "on": self.on,
            "connected": self.connected(), "emf": jnum(self.emf), "I": jnum(self.current), "U": jnum(u_load), "P": jnum(u_load * self.current.abs()),
            "internal": if self.internal.is_finite() { jnum(self.internal) } else { Value::Null }, "charge": jnum(self.charge),
            "anode": if self.current == 0.0 && self.source == 0.0 && self.emf <= 0.0 { Value::Null } else if self.source > 0.0 || self.current >= 0.0 { json!("a") } else { json!("b") },
            "anodeCouple": name(self.anode_couple), "cathodeCouple": name(self.cathode_couple)
        })
    }
}

/// Pairs of an oxidant and a reductant that are both in the vessel, would react by more than `margin` volts, and are
/// covered by no declared reaction: the bench then says "not modelled" for this pair instead of showing a mixture
/// that quietly does nothing (D273). The oxidation of water itself is left out (it is the reason permanganate
/// solutions keep), and so are couples the catalogue marks as inert. Returns (oxidant couple, reductant couple, volts),
/// strongest first.
pub fn unmodelled_pairs(db: &Database, v: &Vessel, ambient: Ambient, margin: f64) -> Vec<(String, String, f64)> {
    let nobody = Pole { vessel: String::new(), material: usize::MAX, deposit: BTreeMap::new() };
    let water = db.components[C_H2O];
    let proton = db.components[crate::db::C_H];
    let plain = |s: usize| s != water && s != proton;
    let mut oxidants: Vec<(usize, f64)> = Vec::new();
    let mut reductants: Vec<(usize, f64)> = Vec::new();
    for (k, c) in db.cat.electrodes.iter().enumerate() {
        // Only what is really there counts as an oxidant or a reductant (a species present, not a trace assumed)
        if c.ox.iter().any(|x| plain(x.0)) {
            if let Some((e, _)) = potential(db, v, ambient, c, &nobody, true) {
                oxidants.push((k, e));
            }
        }
        if c.red.iter().any(|x| plain(x.0)) {
            if let Some((e, _)) = potential(db, v, ambient, c, &nobody, false) {
                reductants.push((k, e));
            }
        }
    }
    let mut out: Vec<(String, String, f64)> = Vec::new();
    for &(ko, eo) in &oxidants {
        for &(kr, er) in &reductants {
            if ko == kr || eo - er <= margin {
                continue;
            }
            let (ox, red) = (&db.cat.electrodes[ko], &db.cat.electrodes[kr]);
            let covered = db.cat.reactions.iter().any(|r| {
                let takes = |s: usize| r.eq.iter().any(|x| x.0 == s && x.1 < 0.0) || r.between.contains(&s);
                ox.ox.iter().any(|x| plain(x.0) && takes(x.0)) && red.red.iter().any(|x| plain(x.0) && takes(x.0))
            });
            if !covered {
                out.push((ox.id.clone(), red.id.clone(), eo - er));
            }
        }
    }
    out.sort_by(|a, b| b.2.total_cmp(&a.2).then_with(|| a.0.cmp(&b.0)).then_with(|| a.1.cmp(&b.1)));
    out.truncate(4);
    out
}

/// Take `xi` moles of the couple's reaction at a pole: `reduce` turns ox into red. Electrode metal that forms is
/// deposited on the pole; the electrode itself dissolving is booked as a negative deposit.
fn transform(db: &Database, v: &mut Vessel, pole: &mut Pole, c: &Electrode, xi: f64, reduce: bool) {
    let (consumed, produced) = if reduce { (&c.ox, &c.red) } else { (&c.red, &c.ox) };
    for &(s, nu) in consumed {
        if s == pole.material || pole.deposit.get(&s).copied().unwrap_or(0.0) > 0.0 {
            *pole.deposit.entry(s).or_insert(0.0) -= nu * xi;
        } else {
            crate::kinetics::change(db, v, s, -nu * xi);
        }
    }
    for &(s, nu) in produced {
        if db.species[s].phase == Phase::Solid && !db.species[s].in_network() {
            *pole.deposit.entry(s).or_insert(0.0) += nu * xi;
        } else {
            crate::kinetics::change(db, v, s, nu * xi);
        }
    }
}

/// How much of a couple's reaction a pole can still take, mol.
fn room(db: &Database, v: &Vessel, pole: &Pole, c: &Electrode, reduce: bool) -> f64 {
    let consumed = if reduce { &c.ox } else { &c.red };
    let mut most = f64::INFINITY;
    for &(s, nu) in consumed {
        if s == pole.material || s == db.components[C_H2O] {
            continue;
        }
        let have = pole.deposit.get(&s).copied().filter(|n| *n > 0.0).unwrap_or_else(|| crate::kinetics::available(db, v, s));
        most = most.min(have / nu);
    }
    most
}

/// Let the circuits run for `seconds`: Faraday's law in a few substeps, the vessels settling after each.
pub fn advance(db: &Database, circuits: &mut BTreeMap<String, Circuit>, vessels: &mut BTreeMap<String, Vessel>, ambient: Ambient, seconds: f64, events: &mut Events) -> Result<(), (String, Failure)> {
    let bridge_ions = (db.find("K+"), db.find("NO3-"));
    for c in circuits.values_mut() {
        let steps = 8;
        let dt = seconds / steps as f64;
        for _ in 0..steps {
            c.evaluate(db, vessels, ambient);
            let (Some(ka), Some(kc)) = (c.anode_couple, c.cathode_couple) else { break };
            if c.current == 0.0 || !(dt > 0.0) {
                break;
            }
            let a_is_anode = c.source > 0.0 || c.current > 0.0;
            let (anode, cathode) = (db.cat.electrodes[ka].clone(), db.cat.electrodes[kc].clone());
            let mut electrons = c.current.abs() * dt / FARADAY;
            {
                let (pa, pc) = if a_is_anode { (&c.a, &c.b) } else { (&c.b, &c.a) };
                let (va, vc) = (&vessels[&pa.vessel], &vessels[&pc.vessel]);
                electrons = electrons.min(room(db, va, pa, &anode, false) * anode.n).min(room(db, vc, pc, &cathode, true) * cathode.n);
            }
            if !(electrons > 0.0) {
                break;
            }
            let (pa, pc) = if a_is_anode { (&mut c.a, &mut c.b) } else { (&mut c.b, &mut c.a) };
            let (ida, idc) = (pa.vessel.clone(), pc.vessel.clone());
            transform(db, vessels.get_mut(&ida).expect("vessel"), pa, &anode, electrons / anode.n, false);
            transform(db, vessels.get_mut(&idc).expect("vessel"), pc, &cathode, electrons / cathode.n, true);
            if ida != idc {
                // The salt bridge keeps both solutions neutral: nitrate to the anode side, potassium to the cathode side
                if let (Some(k), Some(n)) = bridge_ions {
                    crate::kinetics::change(db, vessels.get_mut(&ida).expect("vessel"), n, electrons);
                    crate::kinetics::change(db, vessels.get_mut(&idc).expect("vessel"), k, electrons);
                }
            }
            c.charge += electrons * FARADAY;
            for id in [&ida, &idc] {
                let v = vessels.get_mut(id).expect("vessel");
                let mut quiet = Vec::new();
                v.settle(db, ambient, &mut quiet).map_err(|f| (id.clone(), f))?;
                events.extend(quiet);
                if ida == idc {
                    break;
                }
            }
        }
        c.evaluate(db, vessels, ambient);
    }
    Ok(())
}
