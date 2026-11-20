//! The bench (26.64, D263, D268): vessels and what is in them, and the actions that change them.
//!
//! A vessel holds a solution (the totals of the components of the aqueous network, water included), dissolved
//! species outside the network, solids in their forms, separate liquids and — when it is closed — a head space of
//! gas. After every action the vessel *settles*: the network comes to equilibrium (fine solids and the gases take
//! part; coarse solids and declared reactions have rates and move in `advance`), and the enthalpy released or taken
//! up changes the temperature. A vessel that cannot be solved keeps its previous state: the action fails as a whole
//! and no unconverged number is shown.
//!
//! Volumes are additive (the volume of a mixture is the sum of the volumes poured together; solids and gases that
//! dissolve add none) — the assumption of school volumetric work, stated in the interface.

use std::collections::BTreeMap;

use serde_json::{json, Value};
use velophi_core::dmath;
use velophi_core::message::{Message, SimResult};
use velophi_core::sha256::Sha256;
use velophi_core::transport::{dnum, jnum};

use crate::catalog::ReagentKind;
use crate::db::{Database, Phase, C_H, C_H2O, R_L_ATM};
use crate::equil::{self, Failure, GasMode, GasSpec, Problem, Solution};

/// Molar heat capacity of liquid water, J/(mol·K).
const CP_WATER: f64 = 75.3;
/// Heat capacity per atom of a solid whose own value is unknown (Dulong–Petit), J/(mol·K).
const CP_ATOM: f64 = 24.9;
/// Molar heat capacity of a gas whose own value is unknown, J/(mol·K).
const CP_GAS: f64 = 29.1;
/// Volume of one drop, mL.
const DROP_ML: f64 = 0.05;
/// Forms of a solid that equilibrate with the solution at once.
fn is_fine(form: &str) -> bool {
    matches!(form, "powder" | "precipitate")
}

/// Mean molar mass of air, g/mol.
const AIR_MOLAR_MASS: f64 = 28.96;

/// How a vessel collects the gas delivered to it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Collect {
    /// It does not: gas arrives in its head space (closed) or bubbles through its liquid (open).
    None,
    /// Over water: the jar starts full of water and holds what arrives, up to its volume, at the room's pressure.
    Water,
    /// Upward displacement of air (the jar upright): for gases denser than air.
    Up,
    /// Downward displacement of air (the jar inverted): for gases lighter than air.
    Down,
}

impl Collect {
    pub fn name(self) -> &'static str {
        match self {
            Collect::None => "none",
            Collect::Water => "water",
            Collect::Up => "up",
            Collect::Down => "down",
        }
    }
    fn parse(s: &str) -> Collect {
        match s {
            "water" => Collect::Water,
            "up" => Collect::Up,
            "down" => Collect::Down,
            _ => Collect::None,
        }
    }
}

/// A solid in a vessel.
#[derive(Clone, Debug, PartialEq)]
pub struct Lot {
    pub species: usize,
    pub form: String,
    pub n: f64,
}

/// A vessel and its contents.
#[derive(Clone, Debug)]
pub struct Vessel {
    pub id: String,
    pub kind: String,
    /// Internal volume, L.
    pub capacity_l: f64,
    /// Stoppered: the head space is kept.
    pub closed: bool,
    /// Heat capacity of the glassware, J/K, and its heat loss to the room, W/K.
    pub heat_capacity: f64,
    pub loss: f64,
    /// Heating power, W.
    pub heater: f64,
    /// Held at this temperature by a bath (K).
    pub bath: Option<f64>,
    pub ignited: bool,
    pub lit: bool,
    /// The vessel its delivery tube leads to.
    pub outlet: Option<String>,
    pub collect: Collect,
    /// Temperature of the contents, K.
    pub t: f64,
    /// Volume of the solution, L.
    pub volume_l: f64,
    /// Totals of the network's components in the solution, mol (index 0: water).
    pub aq: Vec<f64>,
    /// Dissolved species outside the network, mol.
    pub solutes: BTreeMap<usize, f64>,
    pub solids: Vec<Lot>,
    /// Separate liquids, mol.
    pub liquids: BTreeMap<usize, f64>,
    /// Head space of a closed vessel, mol.
    pub gas: BTreeMap<usize, f64>,
    /// Gas that left an open vessel since the last read of events, mol.
    pub released: BTreeMap<usize, f64>,
    /// The last equilibrium (None: no solution, or not solved yet).
    pub sol: Option<Solution>,
    /// A reagent beyond the activity model was added.
    pub beyond_model: bool,
    /// 26.65 (D297 item 9), from the object: the volume to its brim (L; liquid above it runs over onto the bench), the
    /// overpressure its stopper holds (atm; above it the stopper is blown out), whether it may be heated directly, and
    /// the temperature difference its glass stands when something colder is poured in (K). None: not given (a
    /// document of 26.64 — the vessel then refuses what does not fit, keeps any pressure and never cracks).
    pub brim_l: Option<f64>,
    pub burst_atm: Option<f64>,
    pub heatable: bool,
    pub shock_k: Option<f64>,
    /// Broken: it held nothing since (what was in it ran out onto the bench).
    pub cracked: bool,
    /// Liquid that ran out of it onto the bench so far, L (it is gone from the bench's chemistry).
    pub spilled_l: f64,
}

/// What happened in an action, for the interface and the step checks of guided experiments.
pub type Events = Vec<Value>;

fn event(code: &str, vessel: &str, params: Value) -> Value {
    json!({ "code": code, "vessel": vessel, "params": params })
}

/// The room.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Ambient {
    pub t: f64,
    /// atm.
    pub p: f64,
}

impl Vessel {
    pub fn new(db: &Database, id: &str, kind: &str, capacity_l: f64, ambient: Ambient) -> Vessel {
        Vessel {
            id: id.to_string(),
            kind: kind.to_string(),
            capacity_l,
            closed: false,
            heat_capacity: 0.0,
            loss: 0.0,
            heater: 0.0,
            bath: None,
            ignited: false,
            lit: false,
            outlet: None,
            collect: Collect::None,
            t: ambient.t,
            volume_l: 0.0,
            aq: vec![0.0; db.components.len()],
            solutes: BTreeMap::new(),
            solids: Vec::new(),
            liquids: BTreeMap::new(),
            gas: BTreeMap::new(),
            released: BTreeMap::new(),
            sol: None,
            beyond_model: false,
            brim_l: None,
            burst_atm: None,
            heatable: true,
            shock_k: None,
            cracked: false,
            spilled_l: 0.0,
        }
    }

    /// The most liquid it holds before it runs over or is refused, L: its brim when the object gives one.
    pub fn limit_l(&self) -> f64 {
        self.brim_l.filter(|b| *b > self.capacity_l).unwrap_or(self.capacity_l)
    }

    /// Moles of liquid water.
    pub fn water(&self) -> f64 {
        self.aq[C_H2O]
    }

    pub fn is_empty(&self) -> bool {
        self.aq.iter().all(|v| v.abs() < 1e-300) && self.solutes.is_empty() && self.solids.is_empty() && self.liquids.is_empty() && self.gas.is_empty()
    }

    fn add_lot(&mut self, species: usize, form: &str, n: f64) {
        if !(n > 0.0) {
            return;
        }
        match self.solids.iter_mut().find(|l| l.species == species && l.form == form) {
            Some(l) => l.n += n,
            None => self.solids.push(Lot { species, form: form.to_string(), n }),
        }
        self.solids.sort_by(|a, b| a.species.cmp(&b.species).then_with(|| a.form.cmp(&b.form)));
    }

    /// Add an amount of a species to the phase it belongs to.
    fn add_species(&mut self, db: &Database, species: usize, n: f64, form: &str) {
        let s = &db.species[species];
        match s.phase {
            Phase::Aq if s.in_network() => db.add_to_totals(species, n, &mut self.aq),
            Phase::Aq => *self.solutes.entry(species).or_insert(0.0) += n,
            Phase::Solid => self.add_lot(species, form, n),
            Phase::Liquid => *self.liquids.entry(species).or_insert(0.0) += n,
            Phase::Gas => *self.gas.entry(species).or_insert(0.0) += n,
        }
    }

    /// Heat capacity of the contents and the glassware, J/K.
    pub fn heat_capacity_total(&self, db: &Database) -> f64 {
        let mut c = self.heat_capacity + self.water().max(0.0) * CP_WATER;
        let cp_of = |i: usize, default: f64| {
            let v = db.cat.extra[i].cp;
            if v.is_finite() {
                v
            } else {
                default
            }
        };
        for l in &self.solids {
            let atoms: f64 = db.species[l.species].comp.iter().map(|c| c.1).sum();
            c += l.n * cp_of(l.species, CP_ATOM * atoms.max(1.0));
        }
        for (&i, &n) in &self.liquids {
            let atoms: f64 = db.species[i].comp.iter().map(|c| c.1).sum();
            c += n * cp_of(i, CP_ATOM * atoms.max(1.0));
        }
        for (&i, &n) in &self.gas {
            c += n * cp_of(i, CP_GAS);
        }
        c
    }

    /// Chemical enthalpy Σ n·ΔfH° of the contents in their present distribution, J, and the species whose enthalpy
    /// of formation is unknown (they are left out of the sum).
    pub fn chemical_enthalpy(&self, db: &Database) -> (f64, Vec<usize>) {
        let mut h = 0.0;
        let mut unknown = Vec::new();
        let mut add = |i: usize, n: f64| {
            if n == 0.0 {
                return;
            }
            let hf = db.cat.extra[i].hf;
            if hf.is_finite() {
                h += n * hf;
            } else if !unknown.contains(&i) {
                unknown.push(i);
            }
        };
        match &self.sol {
            Some(s) => {
                add(db.components[C_H2O], s.water_kg / (db.species[db.components[C_H2O]].molar_mass * 1e-3));
                for &(i, m, _) in &s.aqueous {
                    add(i, m * s.water_kg);
                }
            }
            None => {
                // No equilibrium yet: the components as they were given
                for (j, &n) in self.aq.iter().enumerate() {
                    add(db.components[j], n);
                }
            }
        }
        for l in &self.solids {
            add(l.species, l.n);
        }
        for (&i, &n) in &self.solutes {
            add(i, n);
        }
        for (&i, &n) in &self.liquids {
            add(i, n);
        }
        for (&i, &n) in &self.gas {
            add(i, n);
        }
        // Gas that left an open vessel took its enthalpy of formation along: it stays in the balance, or carbon
        // dioxide escaping from an acid would look like 394 kJ/mol absorbed
        for (&i, &n) in &self.released {
            add(i, n);
        }
        unknown.sort_unstable();
        (h, unknown)
    }

    /// Volume of the head space of a closed vessel, L.
    fn gas_volume(&self) -> f64 {
        (self.capacity_l - self.volume_l).max(1e-6)
    }

    /// Solids that dissolve by the solubility table: each dissolves until the product of the molalities of what it
    /// brings reaches the product at saturation in pure water (the handbook solubility at this temperature), and
    /// crystallises above it. A concentration product, not an activity model — the textbook solubility curve.
    fn settle_tables(&mut self, db: &Database, events: &mut Events) {
        let kg_per_mol = db.species[db.components[C_H2O]].molar_mass * 1e-3;
        for _ in 0..8 {
            let mut moved = false;
            for salt in &db.cat.table {
                if !(self.water() > 1e-9) {
                    return;
                }
                let have: f64 = self.solids.iter().filter(|l| l.species == salt.species).map(|l| l.n).sum();
                let xi = if !salt.limited {
                    have
                } else {
                    if salt.comps.is_empty() {
                        continue;
                    }
                    // Nothing to do when the salt is absent and one of its ions is too
                    let most_back = salt.comps.iter().map(|&(j, nu)| self.aq[j].max(0.0) / nu).fold(f64::INFINITY, f64::min);
                    if have <= 0.0 && most_back <= 0.0 {
                        continue;
                    }
                    let table = &db.cat.extra[salt.species].solubility;
                    let s = interpolate(table, self.t);
                    let ln_k: f64 = salt.comps.iter().map(|&(_, nu)| nu * dmath::log(nu * s)).sum();
                    let ln_q = |xi: f64| -> f64 {
                        let w = ((self.aq[C_H2O] + salt.water * xi) * kg_per_mol).max(1e-12);
                        salt.comps.iter().map(|&(j, nu)| nu * dmath::log(((self.aq[j] + nu * xi) / w).max(1e-300))).sum()
                    };
                    let lo = -most_back * (1.0 - 1e-12);
                    if ln_q(have) <= ln_k {
                        have
                    } else if ln_q(lo) >= ln_k {
                        lo
                    } else {
                        let (mut a, mut b) = (lo, have);
                        for _ in 0..80 {
                            let mid = 0.5 * (a + b);
                            if ln_q(mid) > ln_k {
                                b = mid;
                            } else {
                                a = mid;
                            }
                        }
                        0.5 * (a + b)
                    }
                };
                let scale = have + salt.comps.iter().map(|&(j, _)| self.aq[j].abs()).sum::<f64>();
                if xi.abs() <= 1e-11 * scale.max(1e-9) {
                    continue;
                }
                moved = true;
                if xi > 0.0 {
                    let mut left = xi;
                    for l in self.solids.iter_mut().filter(|l| l.species == salt.species) {
                        let take = left.min(l.n);
                        l.n -= take;
                        left -= take;
                    }
                    self.solids.retain(|l| l.n > 1e-15);
                    if xi >= have * (1.0 - 1e-12) {
                        events.push(event("dissolved", &self.id, json!({ "species": db.species[salt.species].id, "n": jnum(xi) })));
                    }
                } else {
                    if have <= 0.0 {
                        events.push(event("precipitate", &self.id, json!({ "species": db.species[salt.species].id, "n": jnum(-xi) })));
                    }
                    self.add_lot(salt.species, "crystal", -xi);
                }
                for &(k, nu) in &salt.network {
                    db.add_to_totals(k, nu * xi, &mut self.aq);
                }
                for &(k, nu) in &salt.solutes {
                    let e = self.solutes.entry(k).or_insert(0.0);
                    *e = (*e + nu * xi).max(0.0);
                }
                for (j, v) in self.aq.iter_mut().enumerate() {
                    if j != C_H && *v < 0.0 && *v > -1e-12 {
                        *v = 0.0;
                    }
                }
            }
            if !moved {
                break;
            }
        }
    }

    /// Bring the network to equilibrium at the vessel's temperature. Fine solids and the gases take part.
    pub fn settle(&mut self, db: &Database, ambient: Ambient, events: &mut Events) -> Result<(), Failure> {
        if !(self.water() > 1e-9) {
            self.sol = None;
            return Ok(());
        }
        self.settle_tables(db, events);
        let by_table = |i: usize| db.cat.table.iter().any(|t| t.species == i);
        let mut totals = self.aq.clone();
        let mut start: Vec<(usize, f64)> = Vec::new();
        let mut candidates: Vec<usize> = db.solids.iter().copied().filter(|&i| db.species[i].forms && !by_table(i)).collect();
        for l in &self.solids {
            if is_fine(&l.form) && db.species[l.species].in_network() && !by_table(l.species) {
                db.add_to_totals(l.species, l.n, &mut totals);
                match start.iter_mut().find(|s| s.0 == l.species) {
                    Some(s) => s.1 += l.n,
                    None => start.push((l.species, l.n)),
                }
                candidates.push(l.species);
            }
        }
        candidates.sort_unstable();
        candidates.dedup();
        let water_vapour = db.find("H2O(g)");
        let gas_species: Vec<usize> = if self.closed { db.gases.clone() } else { db.gases.iter().copied().filter(|&g| Some(g) != water_vapour).collect() };
        let mode = if self.closed {
            for (&g, &n) in &self.gas {
                if db.species[g].in_network() {
                    db.add_to_totals(g, n, &mut totals);
                }
            }
            GasMode::FixedVolume(self.gas_volume())
        } else {
            // An open vessel: dissolved gases leave as bubbles once their pressures add up to that of the room less
            // the vapour pressure of the water
            let pw = water_vapour_pressure(self.t.clamp(273.15, 640.0));
            GasMode::FixedPressure((ambient.p - pw).max(0.02 * ambient.p))
        };
        let guess = self.sol.as_ref().map(|s| s.ln_a.clone());
        let problem = Problem { db, t: self.t, totals: &totals, solids: &candidates, gas: Some(GasSpec { mode, species: gas_species }), start: &start, guess: guess.as_deref() };
        let s = equil::solve(&problem)?;
        // What the equilibrium left in the solids and the gas goes back to those phases; the rest is the solution
        let mut aq = totals;
        let before: Vec<(usize, f64)> = start.clone();
        self.solids.retain(|l| !(is_fine(&l.form) && db.species[l.species].in_network() && !by_table(l.species)));
        for &(i, n) in &s.solids {
            for &(j, nu) in &db.species[i].rxn {
                aq[j] -= nu * n;
            }
            let was = before.iter().find(|b| b.0 == i).map(|b| b.1).unwrap_or(0.0);
            if was == 0.0 {
                events.push(event("precipitate", &self.id, json!({ "species": db.species[i].id, "n": jnum(n) })));
            }
            self.add_lot(i, if was > 0.0 { "powder" } else { "precipitate" }, n);
        }
        for &(i, was) in &before {
            if was > 0.0 && !s.solids.iter().any(|x| x.0 == i) {
                events.push(event("dissolved", &self.id, json!({ "species": db.species[i].id, "n": jnum(was) })));
            }
        }
        for &(g, n) in &s.gas {
            for &(j, nu) in &db.species[g].rxn {
                aq[j] -= nu * n;
            }
        }
        if self.closed {
            self.gas.retain(|g, _| !db.species[*g].in_network());
            for &(g, n) in &s.gas {
                if n > 0.0 {
                    self.gas.insert(g, n);
                }
            }
        } else {
            for &(g, n) in &s.gas {
                if n > 1e-15 {
                    *self.released.entry(g).or_insert(0.0) += n;
                    events.push(event("gas", &self.id, json!({ "species": db.species[g].id, "n": jnum(n) })));
                }
            }
        }
        // Rounding can leave a component a hair below zero when all of it went into a solid
        for (j, v) in aq.iter_mut().enumerate() {
            if j != C_H && *v < 0.0 && *v > -1e-12 {
                *v = 0.0;
            }
        }
        self.aq = aq;
        self.sol = Some(s);
        Ok(())
    }

    /// Settle, and let the enthalpy of what changed act on the temperature (`h_before`: the chemical enthalpy of
    /// everything that is now in the vessel, before it reacted). The composition depends on the temperature and the
    /// temperature on the composition (a salt that cools the water as it dissolves is less soluble in the colder
    /// water), so this is a root search: the temperature T at which
    ///
    /// ```text
    ///   g(T) = (T − T₀) + (H(T) − H_before) / C(T) = 0
    /// ```
    ///
    /// with the vessel settled at T. A bracket is found by stepping, then narrowed by bisection; every trial runs on
    /// a copy, so gases that leave and solids that form are counted once, for the state that is kept.
    fn settle_with_heat(&mut self, db: &Database, ambient: Ambient, h_before: f64, events: &mut Events) -> Result<(), Failure> {
        let base = self.clone();
        let t0 = base.t;
        let eval = |t: f64| -> Result<(Vessel, f64, Events), Failure> {
            let mut v = base.clone();
            v.t = t;
            let mut ev = Events::new();
            v.settle(db, ambient, &mut ev)?;
            crate::kinetics::react_instant(db, &mut v, ambient, &mut ev)?;
            let c = v.heat_capacity_total(db);
            let g = if c > 0.0 { (t - t0) + (v.chemical_enthalpy(db).0 - h_before) / c } else { 0.0 };
            Ok((v, g, ev))
        };
        let (first, g0, ev0) = eval(t0)?;
        if self.bath.is_some() || g0.abs() < 1e-5 {
            *self = first;
            events.extend(ev0);
            return Ok(());
        }
        let clamp = |t: f64| t.clamp(150.0, 6000.0);
        // Step until the sign of g changes: (ta, ga) and (tb, gb) then bracket the root
        let (mut ta, mut ga) = (t0, g0);
        let mut found: Option<(Vessel, f64, f64, Events)> = None;
        let mut bracket: Option<(f64, f64)> = None;
        let mut tb = clamp(t0 - g0);
        for _ in 0..12 {
            let (v, gb, ev) = eval(tb)?;
            if gb.abs() < 1e-5 {
                found = Some((v, tb, gb, ev));
                break;
            }
            if (gb > 0.0) != (ga > 0.0) {
                bracket = Some((tb, gb));
                break;
            }
            ta = tb;
            ga = gb;
            let next = clamp(tb - gb);
            if next == tb {
                found = Some((v, tb, gb, ev));
                break;
            }
            tb = next;
        }
        if found.is_none() {
            let (mut tb, mut gb) = bracket.ok_or(Failure::NotConverged)?;
            for _ in 0..60 {
                let mid = 0.5 * (ta + tb);
                let (v, gm, ev) = eval(mid)?;
                if gm.abs() < 1e-5 || (tb - ta).abs() < 1e-6 {
                    found = Some((v, mid, gm, ev));
                    break;
                }
                if (gm > 0.0) == (ga > 0.0) {
                    ta = mid;
                    ga = gm;
                } else {
                    tb = mid;
                    gb = gm;
                }
            }
            let _ = gb;
        }
        let (v, _, _, ev) = found.ok_or(Failure::NotConverged)?;
        *self = v;
        events.extend(ev);
        Ok(())
    }

    /// Mass of the contents, g.
    pub fn mass(&self, db: &Database) -> f64 {
        let mut m = 0.0;
        for (j, &n) in self.aq.iter().enumerate() {
            m += n * db.species[db.components[j]].molar_mass;
        }
        for l in &self.solids {
            m += l.n * db.species[l.species].molar_mass;
        }
        for (&i, &n) in self.solutes.iter().chain(self.liquids.iter()).chain(self.gas.iter()) {
            m += n * db.species[i].molar_mass;
        }
        m
    }

    /// Pressure of the head space of a closed vessel, atm; the room's for an open one.
    pub fn pressure(&self, ambient: Ambient) -> f64 {
        if !self.closed {
            return ambient.p;
        }
        let n: f64 = self.gas.values().sum();
        n * R_L_ATM * self.t / self.gas_volume()
    }

    /// Take the fraction `f` of the liquid (and, with `with_solids`, of the suspended fine solids) out as a portion.
    fn take(&mut self, db: &Database, f: f64, with_solids: bool) -> Vessel {
        let f = f.clamp(0.0, 1.0);
        let mut out = Vessel::new(db, "", "", 0.0, Ambient { t: self.t, p: 1.0 });
        out.t = self.t;
        out.beyond_model = self.beyond_model;
        for j in 0..self.aq.len() {
            out.aq[j] = self.aq[j] * f;
            self.aq[j] -= out.aq[j];
        }
        out.volume_l = self.volume_l * f;
        self.volume_l -= out.volume_l;
        for (&i, n) in self.solutes.iter_mut() {
            out.solutes.insert(i, *n * f);
            *n -= *n * f;
        }
        for (&i, n) in self.liquids.iter_mut() {
            out.liquids.insert(i, *n * f);
            *n -= *n * f;
        }
        if with_solids {
            for l in self.solids.iter_mut().filter(|l| is_fine(&l.form)) {
                out.solids.push(Lot { species: l.species, form: l.form.clone(), n: l.n * f });
                l.n -= l.n * f;
            }
        }
        if f >= 1.0 {
            self.solutes.clear();
            self.liquids.clear();
            self.solids.retain(|l| !(with_solids && is_fine(&l.form)));
        }
        out.sol = None;
        out
    }

    /// The vessel cracks (26.65, D297 item 9): what was in it runs out onto the bench, it heats no more and holds nothing.
    fn crack(&mut self, db: &Database, reason: &str, events: &mut Events) {
        let out = self.take(db, 1.0, true);
        self.spilled_l += out.volume_l;
        self.solids.clear();
        self.gas.clear();
        self.sol = None;
        self.closed = false;
        self.heater = 0.0;
        self.cracked = true;
        events.push(event("vessel.cracked", &self.id, json!({ "reason": reason, "volume_mL": jnum(out.volume_l * 1e3) })));
    }

    /// Merge a portion into this vessel: amounts add, temperatures mix by heat capacity.
    fn merge(&mut self, db: &Database, other: &Vessel) {
        let (c1, c2) = (self.heat_capacity_total(db), other.heat_capacity_total(db));
        if c1 + c2 > 0.0 && self.bath.is_none() {
            self.t = (c1 * self.t + c2 * other.t) / (c1 + c2);
        }
        for j in 0..self.aq.len() {
            self.aq[j] += other.aq[j];
        }
        self.volume_l += other.volume_l;
        for (&i, &n) in &other.solutes {
            *self.solutes.entry(i).or_insert(0.0) += n;
        }
        for (&i, &n) in &other.liquids {
            *self.liquids.entry(i).or_insert(0.0) += n;
        }
        for l in &other.solids {
            self.add_lot(l.species, &l.form, l.n);
        }
        for (&i, &n) in &other.gas {
            *self.gas.entry(i).or_insert(0.0) += n;
        }
        self.beyond_model |= other.beyond_model;
    }
}

/// Piecewise-linear interpolation in a table of (x, y) ascending in x; the end values outside it.
fn interpolate(table: &[(f64, f64)], x: f64) -> f64 {
    match table {
        [] => f64::NAN,
        [only] => only.1,
        _ => {
            if x <= table[0].0 {
                return table[0].1;
            }
            for w in table.windows(2) {
                if x <= w[1].0 {
                    return w[0].1 + (w[1].1 - w[0].1) * (x - w[0].0) / (w[1].0 - w[0].0);
                }
            }
            table[table.len() - 1].1
        }
    }
}

/// Parse `{ value, unit }`.
fn amount_of(v: Option<&Value>) -> Option<(f64, String)> {
    let v = v?;
    let value = dnum(v.get("value")?);
    if !value.is_finite() || value < 0.0 {
        return None;
    }
    Some((value, v.get("unit").and_then(|u| u.as_str()).unwrap_or("").to_string()))
}

fn bad_amount(what: &str) -> Message {
    Message::new("chem.badAmount").text("what", what)
}

fn not_solved(vessel: &str, f: &Failure) -> Message {
    let reason = match f {
        Failure::NoWater => "noWater",
        Failure::NegativeTotal(_) => "negativeTotal",
        Failure::NotConverged => "notConverged",
        Failure::Singular => "singular",
    };
    Message::new("chem.notSolved").text("vessel", vessel).text("reason", reason)
}

/// The state of a bench: the room and the vessels, in the order of their ids.
#[derive(Clone, Debug)]
pub struct Bench {
    pub ambient: Ambient,
    pub vessels: BTreeMap<String, Vessel>,
    /// Electrodes wired into circuits (`echem.rs`).
    pub circuits: BTreeMap<String, crate::echem::Circuit>,
    /// Simulated time, s.
    pub time: f64,
}

impl Bench {
    pub fn new() -> Bench {
        Bench { ambient: Ambient { t: 298.15, p: 1.0 }, vessels: BTreeMap::new(), circuits: BTreeMap::new(), time: 0.0 }
    }

    fn vessel(&mut self, id: &str) -> SimResult<&mut Vessel> {
        self.vessels.get_mut(id).ok_or_else(|| Message::new("chem.unknownVessel").text("id", id))
    }

    /// A portion of a shelf reagent as a vessel of its own, settled at its temperature.
    fn portion(&self, db: &Database, reagent: &str, amount: (f64, String), t: f64) -> SimResult<Vessel> {
        let r = db.cat.reagents.get(reagent).ok_or_else(|| Message::new("chem.unknownReagent").text("id", reagent))?;
        let (value, unit) = (amount.0, amount.1.as_str());
        let mut p = Vessel::new(db, "", "", 0.0, self.ambient);
        p.t = t;
        p.beyond_model = r.beyond_model;
        let water = db.components[C_H2O];
        let water_molar = db.species[water].molar_mass;
        match r.kind {
            ReagentKind::Solution => {
                let rho = if r.rho.is_finite() && r.rho > 0.0 { r.rho } else { 1.0 };
                let recipe_g = r.water_kg * 1e3 + r.species.iter().map(|&(i, n)| n * db.species[i].molar_mass).sum::<f64>();
                let grams = match unit {
                    "mL" => value * rho,
                    "L" => value * 1e3 * rho,
                    "drop" => value * DROP_ML * rho,
                    "g" => value,
                    "mg" => value * 1e-3,
                    "kg" => value * 1e3,
                    _ => return Err(bad_amount(unit)),
                };
                if !(recipe_g > 0.0) {
                    return Err(bad_amount(reagent));
                }
                let f = grams / recipe_g;
                p.aq[C_H2O] += f * r.water_kg * 1e3 / water_molar;
                for &(i, n) in &r.species {
                    p.add_species(db, i, f * n, &r.form);
                }
                p.volume_l = grams / rho * 1e-3;
            }
            ReagentKind::Solid | ReagentKind::Liquid | ReagentKind::Gas => {
                let molar: f64 = r.species.iter().map(|&(i, n)| n * db.species[i].molar_mass).sum();
                let rho = r.species.first().map(|s| db.cat.extra[s.0].rho).filter(|v| v.is_finite() && *v > 0.0).or(Some(r.rho).filter(|v| v.is_finite() && *v > 0.0));
                let moles = match unit {
                    "mol" => value,
                    "mmol" => value * 1e-3,
                    "g" => value / molar,
                    "mg" => value * 1e-3 / molar,
                    "kg" => value * 1e3 / molar,
                    "mL" | "L" | "drop" => {
                        let ml = match unit {
                            "L" => value * 1e3,
                            "drop" => value * DROP_ML,
                            _ => value,
                        };
                        match r.kind {
                            // A gas by volume: at the temperature and pressure of the room
                            ReagentKind::Gas => ml * 1e-3 * self.ambient.p / (R_L_ATM * self.ambient.t),
                            _ => ml * rho.ok_or_else(|| bad_amount(unit))? / molar,
                        }
                    }
                    _ => return Err(bad_amount(unit)),
                };
                if !moles.is_finite() {
                    return Err(bad_amount(reagent));
                }
                for &(i, n) in &r.species {
                    let s = &db.species[i];
                    let dissolves = &db.cat.extra[i].dissolves;
                    if s.phase == Phase::Liquid && !dissolves.is_empty() {
                        // A liquid that mixes with water arrives as what it becomes there
                        for &(k, nu) in dissolves {
                            p.add_species(db, k, moles * n * nu, "powder");
                        }
                        if let Some(rho) = rho {
                            p.volume_l += moles * n * s.molar_mass / rho * 1e-3;
                        }
                    } else {
                        p.add_species(db, i, moles * n, &r.form);
                    }
                }
            }
        }
        if p.water() > 1e-9 && !r.beyond_model {
            // The bottle's own equilibrium: its species as they are in the bottle, so that only what happens in
            // the vessel shows up as heat there. A reagent the model cannot settle goes in as written.
            let mut closed = p.clone();
            closed.closed = true;
            closed.capacity_l = closed.volume_l + 1e-6;
            let mut quiet = Vec::new();
            if closed.settle(db, self.ambient, &mut quiet).is_ok() {
                p.sol = closed.sol;
            }
        }
        Ok(p)
    }

    /// Apply one action of the log. On failure the bench is unchanged.
    pub fn apply(&mut self, db: &Database, action: &Value) -> SimResult<Events> {
        let mut next = self.clone();
        let events = next.perform(db, action)?;
        *self = next;
        Ok(events)
    }

    fn perform(&mut self, db: &Database, action: &Value) -> SimResult<Events> {
        let act = action.get("act").and_then(|v| v.as_str()).unwrap_or("");
        let text = |k: &str| action.get(k).and_then(|v| v.as_str()).unwrap_or("").to_string();
        let ambient = self.ambient;
        let mut events = Events::new();
        match act {
            "place" => {
                let o = action.get("object").cloned().unwrap_or(Value::Null);
                let id = o.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                if id.is_empty() || self.vessels.contains_key(&id) {
                    return Err(Message::new("chem.unknownVessel").text("id", id));
                }
                let mut v = Vessel::new(db, &id, o.get("kind").and_then(|v| v.as_str()).unwrap_or(""), o.get("capacity_mL").map(dnum).filter(|x| x.is_finite() && *x > 0.0).unwrap_or(250.0) * 1e-3, ambient);
                v.heat_capacity = o.get("heat_J_K").map(dnum).filter(|x| x.is_finite() && *x >= 0.0).unwrap_or(0.0);
                v.loss = o.get("loss_W_K").map(dnum).filter(|x| x.is_finite() && *x >= 0.0).unwrap_or(0.0);
                v.closed = o.get("closed").and_then(|x| x.as_bool()).unwrap_or(false);
                v.collect = Collect::parse(o.get("collect").and_then(|x| x.as_str()).unwrap_or(""));
                v.brim_l = o.get("brim_mL").map(dnum).filter(|x| x.is_finite() && *x > 0.0).map(|x| x * 1e-3);
                v.burst_atm = o.get("burst_kPa").map(dnum).filter(|x| x.is_finite() && *x > 0.0).map(|x| x * 1e3 / 101_325.0);
                v.heatable = o.get("heatable").and_then(|x| x.as_bool()).unwrap_or(true);
                v.shock_k = o.get("shock_K").map(dnum).filter(|x| x.is_finite() && *x > 0.0);
                if v.closed || matches!(v.collect, Collect::Up | Collect::Down) {
                    // A closed vessel, or a jar set up to collect by displacing air, starts full of the room's air
                    // (nitrogen and oxygen; the rest is left out)
                    let n = ambient.p * v.capacity_l / (R_L_ATM * ambient.t);
                    for (id, x) in [("N2(g)", 0.7905), ("O2(g)", 0.2095)] {
                        if let Some(g) = db.find(id) {
                            v.gas.insert(g, n * x);
                        }
                    }
                }
                self.vessels.insert(id, v);
            }
            "remove" => {
                let id = text("id");
                self.vessels.remove(&id).ok_or_else(|| Message::new("chem.unknownVessel").text("id", id))?;
            }
            "add" => {
                let to = text("to");
                let amount = amount_of(action.get("amount")).ok_or_else(|| bad_amount("amount"))?;
                let t = action.get("T").map(dnum).filter(|v| v.is_finite() && *v > 0.0).unwrap_or(ambient.t);
                let portion = self.portion(db, &text("reagent"), amount, t)?;
                let v = self.vessel(&to)?;
                if v.cracked {
                    return Err(Message::new("chem.cracked").text("id", to));
                }
                let shocked = v.shock_k.map(|k| v.t - portion.t > k).unwrap_or(false);
                let h = v.chemical_enthalpy(db).0 + portion.chemical_enthalpy(db).0;
                v.merge(db, &portion);
                v.settle_with_heat(db, ambient, h, &mut events).map_err(|f| not_solved(&to, &f))?;
                if shocked {
                    v.crack(db, "shock", &mut events);
                }
            }
            "pour" | "filter" => {
                let (from, to) = (text("from"), text("to"));
                if from == to {
                    return Err(Message::new("chem.unknownVessel").text("id", to));
                }
                let with_solids = act == "pour" && action.get("solids").and_then(|v| v.as_bool()).unwrap_or(true);
                let source = self.vessel(&from)?;
                let fraction = match amount_of(action.get("amount")) {
                    None => 1.0,
                    Some((value, unit)) => match unit.as_str() {
                        "fraction" => value,
                        "mL" => value * 1e-3 / source.volume_l.max(1e-12),
                        "L" => value / source.volume_l.max(1e-12),
                        "drop" => value * DROP_ML * 1e-3 / source.volume_l.max(1e-12),
                        _ => return Err(bad_amount(&unit)),
                    },
                };
                let mut portion = source.take(db, fraction, with_solids);
                // What is poured carries the share of the source's equilibrium, so its enthalpy is known
                let h_portion = {
                    let mut tmp = portion.clone();
                    tmp.closed = true;
                    tmp.capacity_l = tmp.volume_l + 1e-6;
                    let mut quiet = Vec::new();
                    if tmp.settle(db, ambient, &mut quiet).is_ok() {
                        portion.sol = tmp.sol.clone();
                    }
                    portion.chemical_enthalpy(db).0
                };
                let mut quiet = Vec::new();
                source.settle(db, ambient, &mut quiet).map_err(|f| not_solved(&from, &f))?;
                let v = self.vessel(&to)?;
                if v.cracked {
                    return Err(Message::new("chem.cracked").text("id", to));
                }
                let shocked = v.shock_k.map(|k| v.t - portion.t > k).unwrap_or(false);
                let h = v.chemical_enthalpy(db).0 + h_portion;
                v.merge(db, &portion);
                v.settle_with_heat(db, ambient, h, &mut events).map_err(|f| not_solved(&to, &f))?;
                if shocked {
                    v.crack(db, "shock", &mut events);
                }
            }
            "empty" => {
                let id = text("vessel");
                let v = self.vessel(&id)?;
                let fresh = Vessel { heat_capacity: v.heat_capacity, loss: v.loss, closed: v.closed, ..Vessel::new(db, &v.id, &v.kind, v.capacity_l, ambient) };
                *v = fresh;
            }
            "heat" => {
                let id = text("vessel");
                let power = action.get("power").map(dnum).filter(|v| v.is_finite() && *v >= 0.0).ok_or_else(|| bad_amount("power"))?;
                self.vessel(&id)?.heater = power;
            }
            "bath" => {
                let id = text("vessel");
                let t = action.get("T").filter(|v| !v.is_null()).map(dnum).filter(|v| v.is_finite() && *v > 0.0);
                let v = self.vessel(&id)?;
                v.bath = t;
                if let Some(t) = t {
                    v.t = t;
                    v.settle(db, ambient, &mut events).map_err(|f| not_solved(&id, &f))?;
                    crate::kinetics::react_instant(db, v, ambient, &mut events).map_err(|f| not_solved(&id, &f))?;
                }
            }
            "stopper" => {
                let id = text("vessel");
                let on = action.get("on").and_then(|v| v.as_bool()).unwrap_or(true);
                let v = self.vessel(&id)?;
                if on && !v.closed {
                    // Closing traps the room's air in the part of the head space that the gas already held (a jar
                    // of collected oxygen) does not fill
                    let held: f64 = v.gas.values().sum();
                    let n = (ambient.p * v.gas_volume() / (R_L_ATM * v.t) - held).max(0.0);
                    for (gid, x) in [("N2(g)", 0.7905), ("O2(g)", 0.2095)] {
                        if let Some(g) = db.find(gid) {
                            *v.gas.entry(g).or_insert(0.0) += n * x;
                        }
                    }
                } else if !on && v.closed {
                    for (&g, &n) in &v.gas.clone() {
                        *v.released.entry(g).or_insert(0.0) += n;
                    }
                    v.gas.clear();
                }
                v.closed = on;
                v.settle(db, ambient, &mut events).map_err(|f| not_solved(&id, &f))?;
            }
            "connect" => {
                let (from, to) = (text("from"), text("to"));
                if from == to || !self.vessels.contains_key(&to) {
                    return Err(Message::new("chem.unknownVessel").text("id", to));
                }
                self.vessel(&from)?.outlet = Some(to);
            }
            "disconnect" => self.vessel(&text("from"))?.outlet = None,
            "collector" => {
                let id = text("vessel");
                let mode = Collect::parse(&text("mode"));
                let v = self.vessel(&id)?;
                v.collect = mode;
                v.gas.clear();
                if matches!(mode, Collect::Up | Collect::Down) {
                    let n = ambient.p * v.capacity_l / (R_L_ATM * v.t);
                    for (gid, x) in [("N2(g)", 0.7905), ("O2(g)", 0.2095)] {
                        if let Some(g) = db.find(gid) {
                            v.gas.insert(g, n * x);
                        }
                    }
                }
            }
            "circuit" => {
                // { id, a: { vessel, electrode }, b: { vessel, electrode }, bridge?, load?, source? }
                let id = text("id");
                let mut poles = Vec::new();
                for key in ["a", "b"] {
                    let p = action.get(key).cloned().unwrap_or(Value::Null);
                    let vessel = p.get("vessel").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    if !self.vessels.contains_key(&vessel) {
                        return Err(Message::new("chem.unknownVessel").text("id", vessel));
                    }
                    let material = p.get("electrode").and_then(|v| v.as_str()).unwrap_or("");
                    let material = db.find(material).ok_or_else(|| Message::new("chem.unknownSpecies").text("id", material))?;
                    poles.push(crate::echem::Pole { vessel, material, deposit: BTreeMap::new() });
                }
                let b = poles.pop().expect("pole");
                let a = poles.pop().expect("pole");
                let mut c = crate::echem::Circuit::new(&id, a, b);
                c.bridge = action.get("bridge").and_then(|v| v.as_bool()).unwrap_or(false);
                c.load = action.get("load").map(dnum).filter(|v| v.is_finite() && *v >= 0.0).unwrap_or(10.0);
                c.source = action.get("source").map(dnum).filter(|v| v.is_finite() && *v >= 0.0).unwrap_or(0.0);
                self.circuits.insert(id, c);
            }
            "circuitSet" => {
                let id = text("id");
                let c = self.circuits.get_mut(&id).ok_or_else(|| Message::new("chem.unknownVessel").text("id", id))?;
                if let Some(v) = action.get("load").map(dnum).filter(|v| v.is_finite() && *v >= 0.0) {
                    c.load = v;
                }
                if let Some(v) = action.get("source").map(dnum).filter(|v| v.is_finite() && *v >= 0.0) {
                    c.source = v;
                }
                if let Some(v) = action.get("bridge").and_then(|v| v.as_bool()) {
                    c.bridge = v;
                }
                if let Some(v) = action.get("on").and_then(|v| v.as_bool()) {
                    c.on = v;
                }
            }
            "circuitRemove" => {
                let id = text("id");
                self.circuits.remove(&id).ok_or_else(|| Message::new("chem.unknownVessel").text("id", id))?;
            }
            "ignite" | "light" => {
                let id = text("vessel");
                let on = action.get("on").and_then(|v| v.as_bool()).unwrap_or(true);
                let v = self.vessel(&id)?;
                if act == "ignite" {
                    v.ignited = on;
                } else {
                    v.lit = on;
                }
                // What is already there reacts at once when its condition is met (a mixture of hydrogen and air)
                if on {
                    let h = v.chemical_enthalpy(db).0;
                    v.settle_with_heat(db, ambient, h, &mut events).map_err(|f| not_solved(&id, &f))?;
                }
            }
            "ambient" => {
                if let Some(t) = action.get("T").map(dnum).filter(|v| v.is_finite() && *v > 100.0) {
                    self.ambient.t = t;
                }
                if let Some(p) = action.get("P").map(dnum).filter(|v| v.is_finite() && *v > 0.0) {
                    self.ambient.p = p;
                }
            }
            "wait" => {
                let seconds = action.get("seconds").map(dnum).filter(|v| v.is_finite() && *v >= 0.0).ok_or_else(|| bad_amount("seconds"))?;
                events = self.advance(db, seconds)?;
            }
            _ => return Err(Message::new("chem.unknownAction").text("act", act)),
        }
        // A vessel removed takes the tubes that led to it along
        let ids: Vec<String> = self.vessels.keys().cloned().collect();
        for v in self.vessels.values_mut() {
            if v.outlet.as_ref().map(|o| !ids.contains(o)).unwrap_or(false) {
                v.outlet = None;
            }
        }
        self.circuits.retain(|_, c| ids.contains(&c.a.vessel) && ids.contains(&c.b.vessel));
        self.route(db, &mut events)?;
        self.consequences(db, &mut events).map_err(|(id, f)| not_solved(&id, &f))?;
        let vessels = &self.vessels;
        for c in self.circuits.values_mut() {
            c.evaluate(db, vessels, ambient);
        }
        Ok(events)
    }

    /// What follows by itself from the state (26.65, D297 item 9), in the order of the vessels' ids: liquid above the
    /// brim of an open vessel runs over onto the bench (`overflow`); a stopper whose overpressure is exceeded is blown
    /// out and the head space leaves (`stopper.blown`); a vessel that may not be heated cracks once a heat source has
    /// warmed it 15 K above the room (`vessel.cracked`, reason `heated`). Only vessels whose object gave the limits.
    fn consequences(&mut self, db: &Database, events: &mut Events) -> Result<(), (String, Failure)> {
        let ambient = self.ambient;
        for (id, v) in self.vessels.iter_mut() {
            if let Some(brim) = v.brim_l {
                if !v.closed && !v.cracked && v.volume_l > brim * (1.0 + 1e-9) {
                    let f = (v.volume_l - brim) / v.volume_l;
                    let out = v.take(db, f, true);
                    v.spilled_l += out.volume_l;
                    events.push(event("overflow", id, json!({ "volume_mL": jnum(out.volume_l * 1e3), "mass_g": jnum(out.mass(db)) })));
                    let mut quiet = Vec::new();
                    v.settle(db, ambient, &mut quiet).map_err(|f| (id.clone(), f))?;
                }
            }
            if let Some(burst) = v.burst_atm {
                let p = v.pressure(ambient);
                if v.closed && p - ambient.p > burst {
                    for (&g, &n) in &v.gas.clone() {
                        *v.released.entry(g).or_insert(0.0) += n;
                    }
                    v.gas.clear();
                    v.closed = false;
                    events.push(event("stopper.blown", id, json!({ "P": jnum(p * 101_325.0) })));
                    let mut quiet = Vec::new();
                    v.settle(db, ambient, &mut quiet).map_err(|f| (id.clone(), f))?;
                }
            }
            if !v.heatable && !v.cracked && v.heater > 0.0 && v.t > ambient.t + 15.0 {
                v.crack(db, "heated", events);
            }
        }
        Ok(())
    }

    /// Henry solubility of a network gas at the vessel's temperature, mol/(kg·atm): from the dissolved species with the
    /// same composition; infinite for a gas that only exists as ions in water (hydrogen chloride).
    fn gas_solubility(db: &Database, gas: usize, t: f64) -> f64 {
        let g = &db.species[gas];
        if !g.in_network() {
            return 0.0;
        }
        match db.aqueous.iter().find(|&&i| db.species[i].rxn == g.rxn) {
            Some(&twin) => dmath::exp((db.species[twin].log_k_at(t) - g.log_k_at(t)) * crate::db::LN10),
            None => f64::INFINITY,
        }
    }

    /// Move gas along the delivery tubes: a stoppered vessel with an outlet keeps the room's pressure by venting its
    /// head space, an open one passes on what bubbled out; the target collects it over water, by displacing air, in
    /// its closed head space, or lets it bubble through its own liquid.
    fn route(&mut self, db: &Database, events: &mut Events) -> SimResult<()> {
        let ambient = self.ambient;
        for _ in 0..4 {
            let mut any = false;
            let ids: Vec<String> = self.vessels.keys().cloned().collect();
            for id in ids {
                let (target, sent) = {
                    let v = self.vessels.get_mut(&id).expect("vessel");
                    let Some(target) = v.outlet.clone() else { continue };
                    let mut sent: Vec<(usize, f64)> = Vec::new();
                    if v.closed {
                        let room = ambient.p * v.gas_volume() / (R_L_ATM * v.t);
                        let total: f64 = v.gas.values().sum();
                        if total > room * (1.0 + 1e-12) {
                            let f = (total - room) / total;
                            for (&g, n) in v.gas.iter_mut() {
                                sent.push((g, *n * f));
                                *n -= *n * f;
                            }
                        }
                    } else {
                        sent = v.released.iter().map(|(&g, &n)| (g, n)).filter(|x| x.1 > 0.0).collect();
                        v.released.clear();
                    }
                    (target, sent)
                };
                if sent.is_empty() || !self.vessels.contains_key(&target) {
                    continue;
                }
                any = true;
                let t = self.vessels.get_mut(&target).expect("target");
                let room = ambient.p * t.capacity_l / (R_L_ATM * t.t);
                match t.collect {
                    Collect::Water => {
                        for (g, n) in sent {
                            if db.species[g].id == "H2O(g)" {
                                // Water vapour condenses in the trough: nothing to report
                                continue;
                            }
                            if Self::gas_solubility(db, g, t.t) > 0.5 {
                                // Too soluble to collect over water: it is lost to the trough
                                events.push(event("collect.dissolved", &target, json!({ "species": db.species[g].id, "n": jnum(n) })));
                                continue;
                            }
                            let held: f64 = t.gas.values().sum();
                            let fits = n.min((room - held).max(0.0));
                            if fits > 0.0 {
                                *t.gas.entry(g).or_insert(0.0) += fits;
                            }
                            if n > fits {
                                *t.released.entry(g).or_insert(0.0) += n - fits;
                                events.push(event("collect.full", &target, json!({ "species": db.species[g].id })));
                            }
                        }
                    }
                    Collect::Up | Collect::Down => {
                        let total: f64 = sent.iter().map(|x| x.1).sum();
                        let mass: f64 = sent.iter().map(|&(g, n)| n * db.species[g].molar_mass).sum();
                        let heavier = mass / total.max(1e-300) > AIR_MOLAR_MASS;
                        if heavier != (t.collect == Collect::Up) {
                            // A gas lighter than air into an upright jar (or a heavier one into an inverted jar) escapes
                            for (g, n) in sent {
                                *t.released.entry(g).or_insert(0.0) += n;
                            }
                            events.push(event("collect.wrongWay", &target, json!({})));
                            continue;
                        }
                        // What comes in pushes out what was there: the air first, then the rest in proportion
                        let mut push = total.min(t.gas.values().sum());
                        for air in ["N2(g)", "O2(g)"].iter().filter_map(|a| db.find(a)) {
                            if let Some(n) = t.gas.get_mut(&air) {
                                let out = push.min(*n);
                                *n -= out;
                                push -= out;
                            }
                        }
                        let rest: f64 = t.gas.values().sum();
                        if push > 0.0 && rest > 0.0 {
                            let f = (push / rest).min(1.0);
                            for n in t.gas.values_mut() {
                                *n -= *n * f;
                            }
                        }
                        t.gas.retain(|_, n| *n > 1e-18);
                        let held: f64 = t.gas.values().sum();
                        let scale = ((room - held).max(0.0) / total.max(1e-300)).min(1.0);
                        for (g, n) in sent {
                            *t.gas.entry(g).or_insert(0.0) += n * scale;
                            if scale < 1.0 {
                                *t.released.entry(g).or_insert(0.0) += n * (1.0 - scale);
                            }
                        }
                    }
                    Collect::None => {
                        if t.closed || !(t.water() > 1e-9) {
                            for (g, n) in sent {
                                if t.closed {
                                    *t.gas.entry(g).or_insert(0.0) += n;
                                } else {
                                    *t.released.entry(g).or_insert(0.0) += n;
                                }
                            }
                        } else {
                            // Bubbling through the liquid of an open vessel: what dissolves stays, the rest leaves
                            let h = t.chemical_enthalpy(db).0 + sent.iter().map(|&(g, n)| if db.cat.extra[g].hf.is_finite() { n * db.cat.extra[g].hf } else { 0.0 }).sum::<f64>();
                            for (g, n) in sent {
                                if db.species[g].in_network() {
                                    db.add_to_totals(g, n, &mut t.aq);
                                } else {
                                    *t.released.entry(g).or_insert(0.0) += n;
                                }
                            }
                            t.settle_with_heat(db, ambient, h, events).map_err(|f| not_solved(&target, &f))?;
                            continue;
                        }
                        if t.closed {
                            t.settle(db, ambient, events).map_err(|f| not_solved(&target, &f))?;
                        }
                    }
                }
            }
            if !any {
                break;
            }
        }
        Ok(())
    }


    /// Let time pass: heating and cooling, boiling, and (in `kinetics`) the declared reactions.
    pub fn advance(&mut self, db: &Database, seconds: f64) -> SimResult<Events> {
        let mut events = Events::new();
        let ambient = self.ambient;
        let ids: Vec<String> = self.vessels.keys().cloned().collect();
        for id in ids {
            let v = self.vessels.get_mut(&id).expect("vessel");
            // A vessel whose chemistry cannot be solved (boiled almost dry, say) stands still and says so; the clock
            // of the bench and the other vessels go on
            let before = v.clone();
            let mut own = Events::new();
            match crate::kinetics::advance_vessel(db, v, ambient, seconds, &mut own) {
                Ok(()) => events.extend(own),
                Err(f) => {
                    *v = before;
                    let reason = match f {
                        Failure::NoWater => "noWater",
                        Failure::NegativeTotal(_) => "negativeTotal",
                        Failure::NotConverged => "notConverged",
                        Failure::Singular => "singular",
                    };
                    events.push(event("stalled", &id, json!({ "reason": reason })));
                }
            }
        }
        crate::echem::advance(db, &mut self.circuits, &mut self.vessels, ambient, seconds, &mut events).map_err(|(id, f)| not_solved(&id, &f))?;
        self.consequences(db, &mut events).map_err(|(id, f)| not_solved(&id, &f))?;
        self.time += seconds;
        Ok(events)
    }

    /// A fingerprint of the state: SHA-256 over every number, in a fixed order.
    pub fn hash(&self, db: &Database) -> String {
        let mut h = Sha256::new();
        let mut nums: Vec<f64> = vec![self.ambient.t, self.ambient.p, self.time];
        for (id, v) in &self.vessels {
            h.update(id.as_bytes());
            h.update(v.kind.as_bytes());
            h.update(v.outlet.as_deref().unwrap_or("").as_bytes());
            h.update(v.collect.name().as_bytes());
            nums.extend([v.capacity_l, f64::from(u8::from(v.closed)), v.heat_capacity, v.loss, v.heater, v.bath.unwrap_or(-1.0), f64::from(u8::from(v.ignited)), f64::from(u8::from(v.lit)), v.t, v.volume_l]);
            // 26.65: what happened to the vessel itself (a vessel of 26.64 adds nothing, so its fingerprint is unchanged)
            if v.cracked || v.spilled_l > 0.0 {
                nums.extend([f64::from(u8::from(v.cracked)), v.spilled_l]);
            }
            nums.extend(v.aq.iter().copied());
            for (&i, &n) in v.solutes.iter().chain(v.liquids.iter()).chain(v.gas.iter()) {
                h.update(db.species[i].id.as_bytes());
                nums.push(n);
            }
            for l in &v.solids {
                h.update(db.species[l.species].id.as_bytes());
                h.update(l.form.as_bytes());
                nums.push(l.n);
            }
            if let Some(s) = &v.sol {
                nums.push(s.ph());
                nums.push(s.ionic_strength);
            }
        }
        for (id, c) in &self.circuits {
            h.update(id.as_bytes());
            nums.extend([c.load, c.source, c.charge, c.current, c.emf, f64::from(u8::from(c.bridge)), f64::from(u8::from(c.on))]);
            for p in [&c.a, &c.b] {
                h.update(p.vessel.as_bytes());
                h.update(db.species[p.material].id.as_bytes());
                nums.extend(p.deposit.values().copied());
            }
        }
        h.update_f64(&nums);
        h.digest_hex()
    }
}

impl Default for Bench {
    fn default() -> Self {
        Bench::new()
    }
}

/// Saturation pressure of pure water, atm (IAPWS-IF97, region 4: the Wagner–Kretzschmar equation, valid from 273.15 K
/// to the critical point; it reproduces the IAPWS-95 saturation line to about 0.03 %). The bench takes boiling and
/// evaporation from here: the vapour-pressure line of the PHREEQC database is about 1 % low at 100 °C, which would
/// put the boiling point of water at 100.3 °C.
pub fn water_vapour_pressure(t: f64) -> f64 {
    const N: [f64; 10] = [0.11670521452767e4, -0.72421316703206e6, -0.17073846940092e2, 0.12020824702470e5, -0.32325550322333e7, 0.14915108613530e2, -0.48232657361591e4, 0.40511340542057e6, -0.23855557567849, 0.65017534844798e3];
    let theta = t + N[8] / (t - N[9]);
    let a = theta * theta + N[0] * theta + N[1];
    let b = N[2] * theta * theta + N[3] * theta + N[4];
    let c = N[5] * theta * theta + N[6] * theta + N[7];
    let root = 2.0 * c / (-b + (b * b - 4.0 * a * c).sqrt());
    let mpa = root * root * root * root;
    mpa * 1e6 / 101_325.0
}

/// Boiling point of the solution at the room's pressure, K: where a_w·p°(T) reaches it (Raoult's law with the
/// activity of water; None outside 0 … 200 °C).
pub fn boiling_point(aw: f64, p_atm: f64) -> Option<f64> {
    let f = |t: f64| aw * water_vapour_pressure(t) - p_atm;
    let (mut lo, mut hi) = (273.15, 473.15);
    if f(lo) > 0.0 || f(hi) < 0.0 {
        return None;
    }
    for _ in 0..60 {
        let mid = 0.5 * (lo + hi);
        if f(mid) > 0.0 {
            hi = mid;
        } else {
            lo = mid;
        }
    }
    Some(0.5 * (lo + hi))
}

/// Enthalpy of vaporisation of water at T, J/mol: a quadratic through the IAPWS-95 values at 0, 25, 50 and 100 °C
/// (45.054, 43.990, 42.911 and 40.657 kJ/mol; within 0.05 % between them).
pub fn water_vaporisation(t: f64) -> f64 {
    let c = (t - 273.15).clamp(0.0, 200.0);
    (45.054 - 0.04213 * c - 1.8e-5 * c * c) * 1e3
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saturation_pressure_matches_the_verification_values_of_if97() {
        // IAPWS-IF97, table 35: T/K → p/MPa
        for (t, mpa) in [(300.0, 0.353658941e-2), (500.0, 0.263889776e1), (600.0, 0.123443146e2)] {
            let got = water_vapour_pressure(t) * 101_325.0 / 1e6;
            assert!((got / mpa - 1.0).abs() < 1e-8, "{t} K: {got} MPa, expected {mpa}");
        }
        // Water boils at 99.974 °C at one standard atmosphere (ITS-90)
        let tb = boiling_point(1.0, 1.0).unwrap();
        assert!((tb - 373.124).abs() < 0.01, "boiling point {tb}");
        assert!((water_vaporisation(373.15) - 40_657.0).abs() < 30.0);
        assert!((water_vaporisation(298.15) - 43_990.0).abs() < 30.0);
    }
}
