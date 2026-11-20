//! Operations (engine/CHEM.md, "Gas equilibrium operations").

use serde_json::{json, Value};
use velophi_core::message::{Message, SimResult};
use velophi_core::transport::{dnum, jnum, Blob};

use super::{adiabatic, data, elements_of, equilibrium, set_data, Failure, GasData, GasState, Hold, ATM, T_HIGH, T_LOW};
use crate::db::R_GAS;
use crate::ops::diagnostic;

fn unknown(id: &str) -> Message {
    Message::new("chem.unknownSpecies").text("id", id)
}

fn number(req: &Value, key: &str) -> Option<f64> {
    req.get(key).filter(|v| !v.is_null()).map(dnum)
}

/// `gasSetData`: load the `velophi-chemgas` document.
fn load(req: &Value) -> SimResult<Value> {
    let d = set_data(GasData::from_json(req.get("gas").unwrap_or(&Value::Null))?);
    Ok(json!({ "species": d.species.len(), "elements": d.elements }))
}

/// `gasSpecies`: what the data holds.
fn list() -> SimResult<Value> {
    let d = data()?;
    let species: Vec<Value> = d
        .species
        .iter()
        .map(|s| {
            let comp: serde_json::Map<String, Value> = s.comp.iter().map(|&(e, n)| (d.elements[e].clone(), jnum(n))).collect();
            json!({ "id": s.id, "comp": comp, "M": jnum(s.molar_mass), "Tmin": jnum(s.ranges[0].t_min), "Tmax": jnum(s.ranges[s.ranges.len() - 1].t_max) })
        })
        .collect();
    Ok(json!({ "species": species, "elements": d.elements, "P0": jnum(d.p0) }))
}

fn temperature(req: &Value, default: f64) -> SimResult<f64> {
    let t = number(req, "T").unwrap_or(default);
    if !(t.is_finite() && t > 0.0) {
        return Err(Message::new("chem.badAmount").text("what", "T"));
    }
    Ok(t)
}

/// `gasThermo`: standard-state values of species at a temperature.
fn thermo(req: &Value) -> SimResult<Value> {
    let d = data()?;
    let t = temperature(req, 298.15)?;
    let mut values = Vec::new();
    for id in req.get("ids").and_then(|v| v.as_array()).cloned().unwrap_or_default() {
        let id = id.as_str().unwrap_or("");
        let th = d.species[d.find(id).ok_or_else(|| unknown(id))?].thermo(t);
        values.push(json!({ "id": id, "cp": jnum(th.cp), "h": jnum(th.h), "s": jnum(th.s), "g": jnum(th.h - t * th.s), "extrapolated": th.extrapolated }));
    }
    Ok(json!({ "T": jnum(t), "P0": jnum(d.p0), "values": values }))
}

/// `gasReaction`: standard changes and the equilibrium constant of a gas reaction `{ id: ν }` (products positive).
fn reaction(req: &Value) -> SimResult<Value> {
    let d = data()?;
    let t = temperature(req, 298.15)?;
    let (mut dh, mut ds, mut dn) = (0.0, 0.0, 0.0);
    let mut atoms = vec![0.0; d.elements.len()];
    let mut extrapolated = false;
    for (id, nu) in req.get("species").and_then(|v| v.as_object()).cloned().unwrap_or_default() {
        let s = &d.species[d.find(&id).ok_or_else(|| unknown(&id))?];
        let nu = dnum(&nu);
        if !nu.is_finite() {
            return Err(Message::new("chem.badAmount").text("what", &id));
        }
        let th = s.thermo(t);
        extrapolated |= th.extrapolated;
        dh += nu * th.h;
        ds += nu * th.s;
        dn += nu;
        for &(e, a) in &s.comp {
            atoms[e] += nu * a;
        }
    }
    let dg = dh - t * ds;
    let ln_k = -dg / (R_GAS * t);
    Ok(json!({
        "T": jnum(t), "dH": jnum(dh), "dS": jnum(ds), "dG": jnum(dg), "lnK": jnum(ln_k), "log10K": jnum(ln_k / crate::db::LN10), "dn": jnum(dn),
        "balanced": atoms.iter().all(|a| a.abs() < 1e-9), "extrapolated": extrapolated
    }))
}

fn state_json(d: &GasData, s: &GasState, min_fraction: f64) -> Value {
    let total = s.total();
    let mut species: Vec<Value> = s.n.iter().enumerate().filter(|x| *x.1 > 0.0 && *x.1 / total >= min_fraction).map(|(i, &n)| json!({ "id": d.species[i].id, "n": jnum(n), "x": jnum(n / total) })).collect();
    species.sort_by(|a, b| dnum(&b["n"]).total_cmp(&dnum(&a["n"])));
    let mass: f64 = s.n.iter().enumerate().map(|(i, n)| n * d.species[i].molar_mass).sum::<f64>() * 1e-3;
    let h = s.enthalpy(d);
    let entropy = s.entropy(d);
    json!({
        "T": jnum(s.t), "P_atm": jnum(s.p / ATM), "V_L": jnum(s.v * 1e3), "n": jnum(total), "species": species,
        "H": jnum(h), "U": jnum(s.energy(d)), "S": jnum(entropy), "G": jnum(h - s.t * entropy), "cp": jnum(s.heat_capacity(d)),
        "mass_g": jnum(mass * 1e3), "density": jnum(mass / s.v), "iterations": s.iterations
    })
}

/// `gasEquilibrium`: the equilibrium mixture at a temperature, or adiabatically from the reactants at `T`.
fn solve(req: &Value) -> SimResult<Value> {
    let d = data()?;
    let t = temperature(req, 298.15)?;
    let mut amounts = Vec::new();
    for (id, n) in req.get("amounts").and_then(|v| v.as_object()).cloned().unwrap_or_default() {
        let n = dnum(&n);
        if !(n.is_finite() && n >= 0.0) {
            return Err(Message::new("chem.badAmount").text("what", &id));
        }
        if n > 0.0 {
            amounts.push((d.find(&id).ok_or_else(|| unknown(&id))?, n));
        }
    }
    let total: f64 = amounts.iter().map(|a| a.1).sum();
    if !(total > 0.0) {
        return Err(Message::new("chem.badAmount").text("what", "amounts"));
    }
    let hold = match (number(req, "volume_L"), number(req, "pressure_atm")) {
        (Some(v), _) if v.is_finite() && v > 0.0 => Hold::Volume(v * 1e-3),
        (Some(_), _) => return Err(Message::new("chem.badAmount").text("what", "volume_L")),
        (None, Some(p)) if p.is_finite() && p > 0.0 => Hold::Pressure(p * ATM),
        (None, Some(_)) => return Err(Message::new("chem.badAmount").text("what", "pressure_atm")),
        (None, None) => Hold::Pressure(ATM),
    };
    let candidates: Vec<usize> = match req.get("species").and_then(|v| v.as_array()) {
        Some(list) => {
            let mut out = Vec::new();
            for id in list {
                let id = id.as_str().unwrap_or("");
                out.push(d.find(id).ok_or_else(|| unknown(id))?);
            }
            // What was put in is always a candidate
            out.extend(amounts.iter().map(|a| a.0));
            out
        }
        None => (0..d.species.len()).collect(),
    };
    let b = elements_of(&d, &amounts);
    let is_adiabatic = req.get("adiabatic").and_then(|v| v.as_bool()).unwrap_or(false);
    let mut diagnostics = Vec::new();
    // The reactants as they are: an unreacted mixture at T (its pressure or volume from the ideal gas law)
    let mut initial = GasState { t, p: 0.0, v: 0.0, n: vec![0.0; d.species.len()], iterations: 0 };
    for &(i, n) in &amounts {
        initial.n[i] += n;
    }
    match hold {
        Hold::Pressure(p) => { initial.p = p; initial.v = total * R_GAS * t / p; }
        Hold::Volume(v) => { initial.v = v; initial.p = total * R_GAS * t / v; }
    }
    let result = if is_adiabatic {
        let energy = match hold {
            Hold::Pressure(_) => initial.enthalpy(&d),
            Hold::Volume(_) => initial.energy(&d),
        };
        adiabatic(&d, &candidates, &b, energy, hold)
    } else {
        equilibrium(&d, &candidates, &b, t, hold, None).map(|x| x.0)
    };
    let state = match result {
        Ok(s) => s,
        Err(f) => {
            let (code, params) = match f {
                Failure::NoSpecies => ("gas.noSpecies", json!({})),
                Failure::NotConverged => ("gas.notConverged", json!({})),
                Failure::OutOfRange(above) => ("gas.adiabaticOutOfRange", json!({ "above": above, "Tmin": jnum(T_LOW), "Tmax": jnum(T_HIGH) })),
            };
            return Ok(json!({ "ok": false, "diagnostics": [diagnostic(code, "error", params)] }));
        }
    };
    let outside: Vec<&str> = state.n.iter().enumerate().filter(|x| *x.1 > 0.0 && d.species[x.0].thermo(state.t).extrapolated).map(|x| d.species[x.0].id.as_str()).collect();
    if !outside.is_empty() {
        diagnostics.push(diagnostic("gas.extrapolated", "approx", json!({ "T": jnum(state.t), "species": outside })));
    }
    // Water vapour above its saturation pressure would condense: the model has no liquid
    if let Some(w) = d.find("H2O(g)") {
        if state.t < 640.0 && state.t > 273.15 {
            let partial = state.n[w] / state.total() * state.p / ATM;
            let saturation = crate::bench::water_vapour_pressure(state.t);
            if partial > saturation {
                diagnostics.push(diagnostic("gas.wouldCondense", "approx", json!({ "species": "H2O(g)", "p": jnum(partial), "saturation": jnum(saturation) })));
            }
        }
    }
    if state.p > 10.0 * ATM {
        diagnostics.push(diagnostic("gas.highPressure", "approx", json!({ "P_atm": jnum(state.p / ATM) })));
    }
    let min_fraction = number(req, "minFraction").filter(|x| x.is_finite()).unwrap_or(0.0).max(1e-12);
    let mut out = state_json(&d, &state, min_fraction);
    out["ok"] = json!(true);
    out["adiabatic"] = json!(is_adiabatic);
    out["initial"] = json!({ "T": jnum(t), "P_atm": jnum(initial.p / ATM), "V_L": jnum(initial.v * 1e3), "H": jnum(initial.enthalpy(&d)), "U": jnum(initial.energy(&d)) });
    out["diagnostics"] = Value::Array(diagnostics);
    Ok(out)
}

/// Run one operation of this module; `None` when `op` is not one of them.
pub fn call(op: &str, req: &Value, _blob: &mut Blob) -> Option<SimResult<Value>> {
    match op {
        "gasSetData" => Some(load(req)),
        "gasSpecies" => Some(list()),
        "gasThermo" => Some(thermo(req)),
        "gasReaction" => Some(reaction(req)),
        "gasEquilibrium" => Some(solve(req)),
        _ => None,
    }
}
