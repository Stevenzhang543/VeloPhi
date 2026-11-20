//! What takes time at the bench (26.64, D265): the declared reactions with their rate laws, the dissolution of coarse
//! solids, heating, cooling and boiling.
//!
//! A step of `advance_vessel`: rates from the present state (activities of the last equilibrium) → a midpoint step of
//! the extents (second order; no reactant is taken below zero) → the network settles → the enthalpy of what changed
//! and the heat from the burner and to the room act on the temperature → at the boiling point the surplus evaporates
//! water. The step length is chosen from the data alone (a reaction may use at most 4 % of its limiting reactant
//! per step, the temperature may move at most one kelvin), so the same log gives the same state on every build.
//!
//! A reaction without rate data does not happen (D273): only what `catalog.reactions` declares runs here.

use serde_json::json;
use velophi_core::dmath;
use velophi_core::transport::jnum;

use crate::bench::{boiling_point, water_vaporisation, Ambient, Events, Vessel};
use crate::catalog::{Law, Reaction};
use crate::db::{Database, Phase, C_H, C_H2O, LN10, R_GAS, R_L_ATM};
use crate::equil::Failure;

/// Share of its limiting reactant a reaction may use in one step.
const STEP_SHARE: f64 = 0.04;
/// Largest temperature change of one step, K.
const STEP_KELVIN: f64 = 1.0;
/// Amounts below this (mol) do not control the step length.
const TRACE: f64 = 1e-7;
/// Steps per call; beyond it the remaining time is taken in equal steps (flagged by the caller's diagnostics).
const MAX_STEPS: usize = 4000;
/// Mole fraction of oxygen in the room's air.
const AIR_O2: f64 = 0.2095;

fn is_fine(form: &str) -> bool {
    matches!(form, "powder" | "precipitate")
}

fn arrhenius(k: f64, ea: f64, tref: f64, t: f64) -> f64 {
    k * dmath::exp(-ea / R_GAS * (1.0 / t - 1.0 / tref))
}

/// Activity of a species in the vessel: dissolved species from the last equilibrium, a pure solid or liquid 1 when
/// present, a gas its partial pressure in atm (the room's air for an open vessel).
pub(crate) fn activity(db: &Database, v: &Vessel, ambient: Ambient, species: usize) -> f64 {
    let s = &db.species[species];
    match s.phase {
        Phase::Aq => {
            let Some(sol) = &v.sol else { return 0.0 };
            if species == db.components[C_H2O] {
                return sol.activity_of_water();
            }
            if s.in_network() {
                sol.aqueous.iter().find(|x| x.0 == species).map(|x| x.1 * dmath::exp(x.2)).unwrap_or(0.0)
            } else {
                v.solutes.get(&species).copied().unwrap_or(0.0) / sol.water_kg
            }
        }
        Phase::Solid => f64::from(u8::from(v.solids.iter().any(|l| l.species == species && l.n > 0.0))),
        Phase::Liquid => f64::from(u8::from(v.liquids.get(&species).copied().unwrap_or(0.0) > 0.0)),
        Phase::Gas => {
            if v.closed {
                v.gas.get(&species).copied().unwrap_or(0.0) * R_L_ATM * v.t / (v.capacity_l - v.volume_l).max(1e-6)
            } else if s.id == "O2(g)" {
                AIR_O2 * ambient.p
            } else if s.id == "N2(g)" {
                (1.0 - AIR_O2) * ambient.p
            } else {
                0.0
            }
        }
    }
}

/// What the vessel holds of a component where a reaction in the solution can reach it, mol: the solution and the
/// fine solids of the network, which the equilibrium dissolves as the solution is depleted (iron(II) hydroxide
/// feeding the oxidation of dissolved iron(II)).
fn pool(db: &Database, v: &Vessel, component: usize) -> f64 {
    let mut n = v.aq[component];
    for l in &v.solids {
        let s = &db.species[l.species];
        if is_fine(&l.form) && s.in_network() && !db.cat.table.iter().any(|t| t.species == l.species) {
            n += l.n * s.rxn.iter().filter(|x| x.0 == component).map(|x| x.1).sum::<f64>();
        }
    }
    n
}

/// How much of a species a reaction can take, mol (infinite for the room's air and for protons and water, whose
/// supply is a matter of the rate law).
pub(crate) fn available(db: &Database, v: &Vessel, species: usize) -> f64 {
    let s = &db.species[species];
    match s.phase {
        Phase::Aq if s.in_network() => {
            let mut most = f64::INFINITY;
            for &(j, nu) in &s.rxn {
                if j != C_H2O && j != C_H && nu > 0.0 {
                    most = most.min(pool(db, v, j).max(0.0) / nu);
                }
            }
            if most.is_infinite() && species == db.components[C_H2O] {
                most = v.aq[C_H2O].max(0.0);
            }
            most
        }
        Phase::Aq => v.solutes.get(&species).copied().unwrap_or(0.0),
        Phase::Solid => v.solids.iter().filter(|l| l.species == species).map(|l| l.n).sum(),
        Phase::Liquid => v.liquids.get(&species).copied().unwrap_or(0.0),
        Phase::Gas => {
            if !v.closed && (s.id == "O2(g)" || s.id == "N2(g)") {
                f64::INFINITY
            } else {
                v.gas.get(&species).copied().unwrap_or(0.0)
            }
        }
    }
}

/// Change the amount of a species by `dn` (negative: taken out of the phase it is in).
pub(crate) fn change(db: &Database, v: &mut Vessel, species: usize, dn: f64) {
    let s = &db.species[species];
    match s.phase {
        Phase::Aq if s.in_network() => db.add_to_totals(species, dn, &mut v.aq),
        Phase::Aq => {
            let e = v.solutes.entry(species).or_insert(0.0);
            *e = (*e + dn).max(0.0);
        }
        Phase::Solid => {
            if dn >= 0.0 {
                let form = if s.in_network() { "precipitate" } else { "powder" };
                match v.solids.iter_mut().find(|l| l.species == species) {
                    Some(l) => l.n += dn,
                    None => {
                        v.solids.push(crate::bench::Lot { species, form: form.to_string(), n: dn });
                        v.solids.sort_by(|a, b| a.species.cmp(&b.species).then_with(|| a.form.cmp(&b.form)));
                    }
                }
            } else {
                let mut left = -dn;
                for l in v.solids.iter_mut().filter(|l| l.species == species) {
                    let take = left.min(l.n);
                    l.n -= take;
                    left -= take;
                }
                v.solids.retain(|l| l.n > 1e-18);
            }
        }
        Phase::Liquid => {
            let e = v.liquids.entry(species).or_insert(0.0);
            *e = (*e + dn).max(0.0);
        }
        Phase::Gas => {
            if v.closed {
                let e = v.gas.entry(species).or_insert(0.0);
                *e = (*e + dn).max(0.0);
            } else if dn > 0.0 {
                *v.released.entry(species).or_insert(0.0) += dn;
            }
        }
    }
}

/// The activity a threshold of `needs` is compared with. For a gas in a closed vessel it is its share of the head
/// space at the room's pressure, not its partial pressure: a flammability limit is a composition, and must not
/// switch a burning mixture off because the flame raised the pressure.
fn threshold_activity(db: &Database, v: &Vessel, ambient: Ambient, species: usize) -> f64 {
    if db.species[species].phase == Phase::Gas && v.closed {
        let total: f64 = v.gas.values().sum();
        return if total > 0.0 { v.gas.get(&species).copied().unwrap_or(0.0) / total * ambient.p } else { 0.0 };
    }
    activity(db, v, ambient, species)
}

/// ln of the saturation ratio of a network solid in the vessel's solution (negative: undersaturated).
fn ln_saturation(db: &Database, v: &Vessel, species: usize) -> f64 {
    let Some(sol) = &v.sol else { return f64::NEG_INFINITY };
    let s = &db.species[species];
    let mut ln_q = s.log_k_at(v.t) * LN10;
    for &(j, nu) in &s.rxn {
        let x = sol.ln_a[j];
        if !x.is_finite() {
            return f64::NEG_INFINITY;
        }
        ln_q += nu * x;
    }
    ln_q
}

pub(crate) fn conditions_hold(db: &Database, v: &Vessel, ambient: Ambient, r: &Reaction) -> bool {
    if v.t < r.needs.t_min || v.t > r.needs.t_max || (r.needs.ignite && !v.ignited) || (r.needs.light && !v.lit) {
        return false;
    }
    r.needs.min.iter().all(|&(s, least)| threshold_activity(db, v, ambient, s) >= least)
        && r.needs.max.iter().all(|&(s, most)| threshold_activity(db, v, ambient, s) <= most)
        && r.needs.unsaturated.iter().all(|&s| ln_saturation(db, v, s) < -1e-9)
}

/// The most a reaction can advance before one of its reactants runs out, mol.
fn limit(db: &Database, v: &Vessel, r: &Reaction) -> f64 {
    let mut most = f64::INFINITY;
    for &(s, nu) in &r.eq {
        if nu < 0.0 {
            most = most.min(available(db, v, s) / -nu);
        }
    }
    most
}

/// Area of the lots of a solid, m².
fn area(db: &Database, v: &Vessel, species: usize) -> f64 {
    let s = &db.species[species];
    let rho = Some(db.cat.extra[species].rho).filter(|r| r.is_finite() && *r > 0.0).unwrap_or(3.0);
    v.solids.iter().filter(|l| l.species == species).map(|l| l.n * s.molar_mass / rho * db.cat.forms.get(&l.form).copied().unwrap_or(600.0)).sum()
}

/// Rate of a declared reaction, mol/s (0 when it does not run now).
fn rate(db: &Database, v: &Vessel, ambient: Ambient, r: &Reaction) -> f64 {
    if !conditions_hold(db, v, ambient, r) {
        return 0.0;
    }
    let product = |orders: &[(usize, f64)]| orders.iter().map(|&(s, n)| dmath::pow(activity(db, v, ambient, s).max(0.0), n)).product::<f64>();
    let water_kg = v.sol.as_ref().map(|s| s.water_kg).unwrap_or(0.0);
    let value = match &r.law {
        Law::None | Law::Unmodelled | Law::Instant { .. } => 0.0,
        Law::Mass { k, orders, ea, tref } => arrhenius(*k, *ea, *tref, v.t) * product(orders) * water_kg,
        Law::Surface { k, orders, ea, tref, on } => match on.or_else(|| r.eq.iter().find(|x| x.1 < 0.0 && db.species[x.0].phase == Phase::Solid).map(|x| x.0)) {
            Some(solid) => arrhenius(*k, *ea, *tref, v.t) * product(orders) * area(db, v, solid),
            None => 0.0,
        },
        Law::Thermal { a, ea, of } => {
            let species = of.filter(|s| r.eq.iter().any(|x| x.0 == *s && x.1 < 0.0)).or_else(|| r.eq.iter().find(|x| x.1 < 0.0).map(|x| x.0));
            match species.and_then(|s| r.eq.iter().find(|x| x.0 == s)) {
                Some(&(first, nu)) => a * dmath::exp(-ea / (R_GAS * v.t)) * available(db, v, first) / -nu,
                None => 0.0,
            }
        }
        Law::Catalytic { catalyst, k, orders, ea, tref } => arrhenius(*k, *ea, *tref, v.t) * product(orders) * available(db, v, *catalyst),
    };
    if value.is_finite() && value > 0.0 {
        value
    } else {
        0.0
    }
}

/// Rate of dissolution of the coarse lots of a network solid, mol/s; None when the catalogue has no data for it.
fn dissolution_rate(db: &Database, v: &Vessel, species: usize) -> Option<f64> {
    let d = db.cat.dissolution.get(&species)?;
    let sol = v.sol.as_ref()?;
    let s = &db.species[species];
    let mut ln_q = s.log_k_at(v.t) * LN10;
    for &(j, nu) in &s.rxn {
        let x = sol.ln_a[j];
        if !x.is_finite() {
            // A component of the solid is absent from the solution: far from saturation
            ln_q = f64::NEG_INFINITY;
            break;
        }
        ln_q += nu * x;
    }
    let omega = dmath::exp(ln_q.min(50.0));
    if omega >= 1.0 {
        return Some(0.0);
    }
    let a_h = dmath::exp(sol.ln_a[C_H]);
    let mut k = arrhenius(d.k_acid, d.ea_acid, 298.15, v.t) * dmath::pow(a_h, d.n_acid) + arrhenius(d.k_neutral, d.ea_neutral, 298.15, v.t);
    if d.k_carbonate > 0.0 {
        // The carbonate mechanism of Palandri and Kharaka: with the pressure of carbon dioxide the solution is in
        // equilibrium with
        let p_co2 = db.find("CO2(g)").and_then(|g| sol.pressure.iter().find(|p| p.0 == g)).map(|p| p.1).unwrap_or(0.0);
        if p_co2 > 0.0 {
            k += arrhenius(d.k_carbonate, d.ea_carbonate, 298.15, v.t) * dmath::pow(p_co2, d.n_carbonate);
        }
    }
    let rho = Some(db.cat.extra[species].rho).filter(|r| r.is_finite() && *r > 0.0).unwrap_or(2.7);
    let area: f64 = v.solids.iter().filter(|l| l.species == species && !is_fine(&l.form)).map(|l| l.n * s.molar_mass / rho * db.cat.forms.get(&l.form).copied().unwrap_or(600.0)).sum();
    Some(k * area * (1.0 - omega))
}

/// The instant reactions run to their limiting reagent, in the order of the catalogue, until none can advance.
/// Returns whether anything reacted.
pub fn react_instant(db: &Database, v: &mut Vessel, ambient: Ambient, events: &mut Events) -> Result<bool, Failure> {
    let mut any = false;
    for _ in 0..24 {
        let mut advanced = false;
        for r in &db.cat.reactions {
            let Law::Instant { ln_k, reversible } = &r.law else { continue };
            if r.eq.is_empty() || !conditions_hold(db, v, ambient, r) {
                continue;
            }
            let forward = limit(db, v, r);
            if !forward.is_finite() {
                continue;
            }
            let most = match ln_k {
                None => forward,
                Some((a, b)) => {
                    // To the extent ξ at which ln Q(ξ) = ln K: Q grows with ξ, so a bisection between the most the
                    // reaction can go backwards (only when declared reversible) and forwards; each trial settles a
                    // copy of the vessel
                    let target = a + b / v.t;
                    let ln_q_at = |xi: f64| -> Option<f64> {
                        let mut trial = v.clone();
                        for &(s, nu) in &r.eq {
                            change(db, &mut trial, s, nu * xi);
                        }
                        let mut quiet = Vec::new();
                        trial.settle(db, ambient, &mut quiet).ok()?;
                        Some(r.eq.iter().map(|&(s, nu)| nu * dmath::log(activity(db, &trial, ambient, s).max(1e-300))).sum())
                    };
                    let backward = if *reversible { r.eq.iter().filter(|x| x.1 > 0.0).map(|&(s, nu)| available(db, v, s) / nu).fold(f64::INFINITY, f64::min) } else { 0.0 };
                    let backward = if backward.is_finite() { backward } else { 0.0 };
                    let (mut lo, mut hi) = (-backward * (1.0 - 1e-9), forward * (1.0 - 1e-9));
                    let (Some(q_lo), Some(q_hi)) = (ln_q_at(lo), ln_q_at(hi)) else { continue };
                    if q_hi <= target {
                        hi
                    } else if q_lo >= target {
                        lo
                    } else {
                        for _ in 0..48 {
                            let mid = 0.5 * (lo + hi);
                            match ln_q_at(mid) {
                                Some(q) if q > target => hi = mid,
                                Some(_) => lo = mid,
                                None => break,
                            }
                        }
                        0.5 * (lo + hi)
                    }
                }
            };
            let scale = forward.abs().max(1e-12);
            if !(most.abs() > 1e-9 * scale) || !most.is_finite() {
                continue;
            }
            for &(s, nu) in &r.eq {
                change(db, v, s, nu * most);
            }
            events.push(json!({ "code": "reaction", "vessel": v.id, "params": { "id": r.id, "extent": jnum(most), "effects": r.effects } }));
            let mut quiet = Vec::new();
            v.settle(db, ambient, &mut quiet)?;
            events.extend(quiet);
            advanced = true;
            any = true;
        }
        if !advanced {
            break;
        }
    }
    Ok(any)
}

/// Coarse network solids without dissolution data dissolve like fine ones (and the interface is told once).
fn release_undocumented_solids(db: &Database, v: &mut Vessel, events: &mut Events) {
    for l in v.solids.iter_mut() {
        let by_table = db.cat.table.iter().any(|t| t.species == l.species);
        if !is_fine(&l.form) && db.species[l.species].in_network() && !by_table && !db.cat.dissolution.contains_key(&l.species) && v.aq[C_H2O] > 1e-9 {
            events.push(json!({ "code": "kinetics.noDissolutionRate", "vessel": v.id, "params": { "species": db.species[l.species].id } }));
            l.form = "powder".to_string();
        }
    }
}

/// Let `seconds` pass in one vessel.
pub fn advance_vessel(db: &Database, v: &mut Vessel, ambient: Ambient, seconds: f64, events: &mut Events) -> Result<(), Failure> {
    if !(seconds > 0.0) {
        return Ok(());
    }
    release_undocumented_solids(db, v, events);
    let mut quiet = Vec::new();
    v.settle(db, ambient, &mut quiet)?;
    events.extend(quiet);
    let mut remaining = seconds;
    let mut steps = 0usize;
    let mut extents = vec![0.0f64; db.cat.reactions.len()];
    let mut boiled = 0.0f64;
    let mut nearly_dry = false;
    let coarse: Vec<usize> = {
        let mut list: Vec<usize> = v.solids.iter().filter(|l| !is_fine(&l.form) && db.species[l.species].in_network()).map(|l| l.species).collect();
        list.sort_unstable();
        list.dedup();
        list
    };
    while remaining > 0.0 {
        // Rates at the start of the step
        let rates: Vec<f64> = db.cat.reactions.iter().map(|r| rate(db, v, ambient, r)).collect();
        let dissolving: Vec<f64> = coarse.iter().map(|&s| dissolution_rate(db, v, s).unwrap_or(0.0)).collect();
        let c = v.heat_capacity_total(db);
        // Boiled down to a film (under 0.02 mL): the model does not take a solution to dryness — what is left is
        // a saturated drop on the crystals. Heating it further does nothing here, and the vessel says so once.
        let film = !v.closed && v.heater > 0.0 && v.sol.is_some() && v.volume_l < 2.0e-5;
        if film && !nearly_dry {
            nearly_dry = true;
            events.push(json!({ "code": "nearlyDry", "vessel": v.id, "params": { "volume_mL": jnum(v.volume_l * 1e3) } }));
        }
        let power = if v.bath.is_some() || film { 0.0 } else { v.heater - v.loss * (v.t - ambient.t) };
        // Step length
        let mut dt = remaining;
        for (k, r) in db.cat.reactions.iter().enumerate() {
            if rates[k] > 0.0 {
                let most = limit(db, v, r);
                // A reaction that lives on a trace of an intermediate (the nitrogen dioxide that copper and nitric
                // acid just made) does not set the step: it takes what is there, step after step. Letting it would
                // cut every second into thousands of steps for amounts nobody can see.
                if most.is_finite() && most > TRACE {
                    dt = dt.min(STEP_SHARE * most / rates[k]);
                }
            }
        }
        for (k, &s) in coarse.iter().enumerate() {
            if dissolving[k] > 0.0 {
                let have: f64 = v.solids.iter().filter(|l| l.species == s && !is_fine(&l.form)).map(|l| l.n).sum();
                dt = dt.min(STEP_SHARE * have / dissolving[k]);
            }
        }
        if power != 0.0 && c > 0.0 {
            // On the boiling plateau the temperature does not move: the step is then set by the water that
            // evaporates in it, not by a kelvin of heating (a few millilitres over a burner would otherwise be cut
            // into hundredths of a second)
            let plateau = if power > 0.0 && !v.closed {
                v.sol.as_ref().and_then(|sol| boiling_point(sol.activity_of_water(), ambient.p)).filter(|tb| v.t >= tb - 1e-6)
            } else {
                None
            };
            match plateau {
                Some(tb) => dt = dt.min((STEP_SHARE * v.aq[C_H2O] * water_vaporisation(tb) / power).max(1e-3)),
                None => dt = dt.min(STEP_KELVIN * c / power.abs()),
            }
        }
        // A floor so that the call ends: the rest of the time in the steps that are left
        let floor = remaining / (MAX_STEPS.saturating_sub(steps).max(1)) as f64;
        dt = dt.max(floor).min(remaining);
        steps += 1;
        let h0 = v.chemical_enthalpy(db).0;
        let any_chemistry = rates.iter().any(|r| *r > 0.0) || dissolving.iter().any(|r| *r > 0.0);
        if any_chemistry {
            // Midpoint rule: a half step with the first rates, then the whole step with the rates found there
            let mut half = v.clone();
            step_extents(db, &mut half, &rates, &coarse, &dissolving, 0.5 * dt, None);
            let mut quiet = Vec::new();
            let (mut rates2, dissolving2) = match half.settle(db, ambient, &mut quiet) {
                Ok(()) => (db.cat.reactions.iter().map(|r| rate(db, &half, ambient, r)).collect::<Vec<_>>(), coarse.iter().map(|&s| dissolution_rate(db, &half, s).unwrap_or(0.0)).collect::<Vec<_>>()),
                Err(_) => (rates.clone(), dissolving.clone()),
            };
            // A reaction that used up its trace of a reactant in the half step has no midpoint rate: it runs with
            // the rate of the start (and is capped by what is there), or the last 10⁻⁷ mol would never go
            for (k, r) in db.cat.reactions.iter().enumerate() {
                if rates[k] > 0.0 && rates2[k] == 0.0 && limit(db, v, r) <= TRACE {
                    rates2[k] = rates[k];
                }
            }
            step_extents(db, v, &rates2, &coarse, &dissolving2, dt, Some(&mut extents));
            let mut quiet = Vec::new();
            v.settle(db, ambient, &mut quiet)?;
            events.extend(quiet);
        }
        // Instant reactions whose conditions hold now (an ignited mixture, an equilibrium that shifted)
        react_instant(db, v, ambient, events)?;
        // Heat: what the chemistry released, the burner, the room
        if v.bath.is_none() && c > 0.0 {
            let h1 = v.chemical_enthalpy(db).0;
            let before = v.t;
            v.t += (-(h1 - h0) + power * dt) / v.heat_capacity_total(db).max(1e-9);
            // Boiling in an open vessel: the temperature stays at the boiling point and the surplus evaporates water
            if !v.closed {
                if let Some(sol) = &v.sol {
                    if let Some(tb) = boiling_point(sol.activity_of_water(), ambient.p) {
                        if v.t > tb {
                            let surplus = (v.t - tb) * v.heat_capacity_total(db);
                            let gone = (surplus / water_vaporisation(tb)).min((v.aq[C_H2O] - 1e-6).max(0.0));
                            v.t = tb;
                            let water = &db.species[db.components[C_H2O]];
                            v.aq[C_H2O] -= gone;
                            v.volume_l = (v.volume_l - gone * water.molar_mass * 1e-3).max(0.0);
                            // The steam is matter that left: it is booked with the gases released (conservation)
                            if let Some(steam) = db.find("H2O(g)") {
                                *v.released.entry(steam).or_insert(0.0) += gone;
                            }
                            boiled += gone;
                        }
                    }
                }
            }
            v.t = v.t.clamp(150.0, 6000.0);
            if (v.t - before).abs() > 0.02 || boiled > 0.0 {
                let mut quiet = Vec::new();
                v.settle(db, ambient, &mut quiet)?;
                events.extend(quiet);
                // Equilibria declared as reversible reactions follow the temperature (NO2 and N2O4)
                react_instant(db, v, ambient, events)?;
            }
        }
        remaining -= dt;
        if remaining < 1e-12 * seconds {
            break;
        }
    }
    for (k, r) in db.cat.reactions.iter().enumerate() {
        // An event is something to notice: a reaction that turned over less than a tenth of a nanomole in this
        // call (zinc with the 10⁻¹³ mol/kg of hydroxide in an acid) still happened in the amounts, without a report
        if extents[k] > 1e-10 {
            events.push(json!({ "code": "reaction", "vessel": v.id, "params": { "id": r.id, "extent": jnum(extents[k]), "effects": r.effects, "teaching": r.teaching } }));
        }
    }
    if boiled > 0.0 {
        events.push(json!({ "code": "boiling", "vessel": v.id, "params": { "water": jnum(boiled) } }));
    }
    if steps >= MAX_STEPS {
        events.push(json!({ "code": "kinetics.coarseSteps", "vessel": v.id, "params": { "steps": steps } }));
    }
    Ok(())
}

/// Advance the declared reactions and the dissolution of coarse solids by `dt` with the given rates. No reactant is
/// taken below zero: a reaction stops at its limiting reagent.
fn step_extents(db: &Database, v: &mut Vessel, rates: &[f64], coarse: &[usize], dissolving: &[f64], dt: f64, mut total: Option<&mut Vec<f64>>) {
    for (k, r) in db.cat.reactions.iter().enumerate() {
        if rates[k] > 0.0 {
            let extent = (rates[k] * dt).min(limit(db, v, r));
            if extent > 0.0 && extent.is_finite() {
                for &(s, nu) in &r.eq {
                    change(db, v, s, nu * extent);
                }
                if let Some(t) = total.as_deref_mut() {
                    t[k] += extent;
                }
            }
        }
    }
    for (k, &s) in coarse.iter().enumerate() {
        if dissolving[k] > 0.0 {
            let mut left = dissolving[k] * dt;
            for l in v.solids.iter_mut().filter(|l| l.species == s && !is_fine(&l.form)) {
                let take = left.min(l.n);
                l.n -= take;
                left -= take;
                db.add_to_totals(s, take, &mut v.aq);
            }
            v.solids.retain(|l| l.n > 1e-18);
        }
    }
}
