//! Stateless chemistry operations (engine/CHEM.md, "Stateless operations").

use serde_json::{json, Value};
use velophi_core::dmath;
use velophi_core::message::{Message, SimResult};
use velophi_core::transport::{dnum, jnum, Blob};

use crate::db::{self, Database, Phase, C_H, C_H2O, LN10};
use crate::equil::{self, Failure, GasMode, GasSpec, Problem, Solution, APPROX_I};

/// A diagnostic `{ code, severity, path?, params? }` (engine/CHEM.md).
pub fn diagnostic(code: &str, severity: &str, params: Value) -> Value {
    json!({ "code": code, "severity": severity, "params": params })
}

fn num(v: &Value, k: &str, default: f64) -> f64 {
    match v.get(k) {
        None | Some(Value::Null) => default,
        Some(x) => {
            let d = dnum(x);
            if d.is_nan() {
                default
            } else {
                d
            }
        }
    }
}

fn unknown_species(id: &str) -> Message {
    Message::new("chem.unknownSpecies").text("id", id)
}

/// `(species, mol)` of an object `{ id: mol }`, in the order of the database.
pub fn amounts_of(db: &Database, v: Option<&Value>) -> SimResult<Vec<(usize, f64)>> {
    let mut out = Vec::new();
    if let Some(o) = v.and_then(|v| v.as_object()) {
        for (id, n) in o {
            let s = db.find(id).ok_or_else(|| unknown_species(id))?;
            let n = dnum(n);
            if n.is_finite() && n != 0.0 {
                out.push((s, n));
            }
        }
    }
    out.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(out)
}

fn failure_code(f: &Failure) -> &'static str {
    match f {
        Failure::NoWater => "equil.noWater",
        Failure::NegativeTotal(_) => "equil.negativeTotal",
        Failure::NotConverged => "equil.notConverged",
        Failure::Singular => "equil.singular",
    }
}

/// JSON of a solution.
pub fn solution_json(db: &Database, t: f64, s: &Solution, min_molality: f64) -> Value {
    let species: Vec<Value> = s
        .aqueous
        .iter()
        .filter(|x| x.1 >= min_molality)
        .map(|&(i, m, lg)| json!({ "id": db.species[i].id, "m": jnum(m), "n": jnum(m * s.water_kg), "gamma": jnum(dmath::exp(lg)), "a": jnum(m * dmath::exp(lg)) }))
        .collect();
    let mut diagnostics = Vec::new();
    if s.ionic_strength > APPROX_I {
        diagnostics.push(diagnostic("equil.concentrated", "approx", json!({ "I": jnum(s.ionic_strength) })));
    }
    if s.beyond_model {
        diagnostics.push(diagnostic("equil.beyondActivityModel", "approx", json!({ "I": jnum(s.ionic_strength) })));
    }
    if s.charge.abs() > 1e-9 * (1.0 + s.water_kg) {
        diagnostics.push(diagnostic("equil.charged", "info", json!({ "charge": jnum(s.charge) })));
    }
    json!({
        "ok": true,
        "T": jnum(t),
        "pH": jnum(s.ph()),
        "I": jnum(s.ionic_strength),
        "aw": jnum(s.activity_of_water()),
        "water_kg": jnum(s.water_kg),
        "charge": jnum(s.charge),
        "iterations": s.iterations,
        "species": species,
        "solids": s.solids.iter().map(|&(i, n)| json!({ "id": db.species[i].id, "n": jnum(n) })).collect::<Vec<_>>(),
        "gas": s.gas.iter().map(|&(i, n)| json!({ "id": db.species[i].id, "n": jnum(n) })).collect::<Vec<_>>(),
        "si": s.si.iter().map(|&(i, v)| json!({ "id": db.species[i].id, "si": jnum(v) })).collect::<Vec<_>>(),
        "pressures": s.pressure.iter().map(|&(i, p)| json!({ "id": db.species[i].id, "p": jnum(p) })).collect::<Vec<_>>(),
        "lnA": s.ln_a.iter().map(|v| if v.is_finite() { jnum(*v) } else { Value::Null }).collect::<Vec<_>>(),
        "diagnostics": diagnostics
    })
}

fn species_json(db: &Database, i: usize) -> Value {
    let s = &db.species[i];
    let comp: serde_json::Map<String, Value> = s.comp.iter().map(|(k, v)| (k.clone(), jnum(*v))).collect();
    let rxn: serde_json::Map<String, Value> = s.rxn.iter().map(|&(j, v)| (db.species[db.components[j]].id.clone(), jnum(v))).collect();
    json!({
        "id": s.id, "phase": s.phase.name(), "z": jnum(s.z), "comp": comp, "M": jnum(s.molar_mass), "component": s.component.is_some(),
        "rxn": rxn, "logK25": jnum(s.log_k_at(298.15)), "dH25": jnum(s.delta_h_at(298.15)), "forms": s.forms, "src": s.src
    })
}

fn equilibrium(req: &Value) -> SimResult<Value> {
    let db = db::database()?;
    let t = num(req, "T", 298.15);
    let mut amounts = amounts_of(&db, req.get("amounts"))?;
    if let Some(kg) = req.get("water_kg").map(dnum).filter(|v| v.is_finite() && *v > 0.0) {
        let water = db.components[C_H2O];
        amounts.push((water, kg / (db.species[water].molar_mass * 1e-3)));
    }
    let (totals, outside) = equil::totals_of(&db, &amounts);
    // Candidate solids: the ones given, plus what the request allows to precipitate
    let mut solids: Vec<usize> = amounts.iter().map(|a| a.0).filter(|&i| db.species[i].phase == Phase::Solid && db.species[i].in_network()).collect();
    match req.get("solids") {
        Some(Value::String(s)) if s == "all" => solids.extend(db.solids.iter().copied()),
        Some(Value::String(s)) if s == "none" => {}
        Some(Value::Array(a)) => {
            for id in a {
                let id = id.as_str().unwrap_or("");
                solids.push(db.find(id).ok_or_else(|| unknown_species(id))?);
            }
        }
        _ => solids.extend(db.solids.iter().copied().filter(|&i| db.species[i].forms)),
    }
    solids.sort_unstable();
    solids.dedup();
    let gas = match req.get("gas") {
        Some(g) if g.is_object() => {
            let mut species: Vec<usize> = match g.get("species").and_then(|v| v.as_array()) {
                Some(a) => {
                    let mut out = Vec::new();
                    for id in a {
                        let id = id.as_str().unwrap_or("");
                        out.push(db.find(id).ok_or_else(|| unknown_species(id))?);
                    }
                    out
                }
                None => db.gases.clone(),
            };
            species.sort_unstable();
            species.dedup();
            let mode = match (g.get("volume_L").map(dnum), g.get("pressure_atm").map(dnum)) {
                (Some(v), _) if v.is_finite() && v >= 0.0 => GasMode::FixedVolume(v),
                (_, Some(p)) if p.is_finite() && p > 0.0 => GasMode::FixedPressure(p),
                _ => return Err(Message::new("err.internal").text("message", "chemEquilibrium: gas needs volume_L or pressure_atm")),
            };
            Some(GasSpec { mode, species })
        }
        _ => None,
    };
    let guess: Option<Vec<f64>> = req.get("guess").and_then(|v| v.as_array()).map(|a| a.iter().map(|x| if x.is_null() { f64::NAN } else { dnum(x) }).collect());
    let start: Vec<(usize, f64)> = amounts.iter().copied().filter(|a| db.species[a.0].phase == Phase::Solid && db.species[a.0].in_network()).collect();
    let problem = Problem { db: &db, t, totals: &totals, solids: &solids, gas, start: &start, guess: guess.as_deref() };
    Ok(match equil::solve(&problem) {
        Ok(s) => {
            let mut out = solution_json(&db, t, &s, num(req, "minMolality", 0.0));
            if !outside.is_empty() {
                let ids: Vec<&str> = outside.iter().map(|&i| db.species[i].id.as_str()).collect();
                out["diagnostics"].as_array_mut().expect("diagnostics").push(diagnostic("equil.outsideNetwork", "unmodelled", json!({ "species": ids })));
            }
            out
        }
        Err(f) => {
            let params = match &f {
                Failure::NegativeTotal(j) => json!({ "component": db.species[db.components[*j]].id }),
                _ => json!({}),
            };
            json!({ "ok": false, "T": jnum(t), "diagnostics": [diagnostic(failure_code(&f), "error", params)] })
        }
    })
}

/// Run one stateless chemistry operation; `None` when `op` is not one of them.
pub fn call(op: &str, req: &Value, _blob: &mut Blob) -> Option<SimResult<Value>> {
    Some(match op {
        "chemSetData" => (|| {
            let mut database = Database::from_aqueous(req.get("aqueous").unwrap_or(&Value::Null))?;
            let forms: Vec<String> = req.get("forms").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect()).unwrap_or_default();
            let unknown = database.set_forms(&forms);
            let mut diagnostics = Vec::new();
            if let Some(cat) = req.get("catalog").filter(|c| c.is_object()) {
                diagnostics = crate::catalog::apply(&mut database, cat)?;
                database.index();
            }
            let d = db::set_database(database);
            Ok(json!({ "components": d.components.len(), "species": d.species.len(), "aqueous": d.aqueous.len(), "solids": d.solids.len(), "gases": d.gases.len(), "reagents": d.cat.reagents.len(), "reactions": d.cat.reactions.len(), "couples": d.cat.electrodes.len(), "unknownForms": unknown, "diagnostics": diagnostics }))
        })(),
        "chemSpecies" => (|| {
            let d = db::database()?;
            let list: Vec<Value> = match req.get("ids").and_then(|v| v.as_array()) {
                Some(ids) => {
                    let mut out = Vec::new();
                    for id in ids {
                        let id = id.as_str().unwrap_or("");
                        out.push(species_json(&d, d.find(id).ok_or_else(|| unknown_species(id))?));
                    }
                    out
                }
                None => {
                    let phase = req.get("phase").and_then(|v| v.as_str());
                    (0..d.species.len()).filter(|&i| phase.map(|p| d.species[i].phase.name() == p).unwrap_or(true)).map(|i| species_json(&d, i)).collect()
                }
            };
            Ok(json!({ "species": list, "components": d.components.iter().map(|&i| d.species[i].id.clone()).collect::<Vec<_>>() }))
        })(),
        "chemEquilibrium" => equilibrium(req),
        "chemBalance" => {
            // The database is optional here: without it, terms are read as formulas
            let d = db::database().ok();
            let side = |k: &str| -> Result<Vec<crate::balance::Composition>, String> {
                let mut out = Vec::new();
                for t in req.get(k).and_then(|v| v.as_array()).cloned().unwrap_or_default() {
                    let text = t.as_str().unwrap_or("");
                    out.push(crate::balance::composition(d.as_deref(), text).map_err(|_| text.to_string())?);
                }
                Ok(out)
            };
            Ok(match (side("reactants"), side("products")) {
                (Ok(r), Ok(p)) => match crate::balance::balance(&r, &p) {
                    crate::balance::Balance::Balanced(c) => json!({ "balanced": true, "coefficients": c }),
                    crate::balance::Balance::Impossible => json!({ "balanced": false, "reason": "impossible" }),
                    crate::balance::Balance::NotUnique(n) => json!({ "balanced": false, "reason": "notUnique", "independent": n }),
                },
                (Err(t), _) | (_, Err(t)) => json!({ "balanced": false, "reason": "formula", "term": t }),
            })
        }
        "chemLogK" => (|| {
            // log10 K and ΔH of the formation reactions at a temperature (reference checks, the encyclopedia)
            let d = db::database()?;
            let t = num(req, "T", 298.15);
            let mut out = Vec::new();
            for id in req.get("ids").and_then(|v| v.as_array()).cloned().unwrap_or_default() {
                let id = id.as_str().unwrap_or("");
                let s = &d.species[d.find(id).ok_or_else(|| unknown_species(id))?];
                out.push(json!({ "id": s.id, "logK": jnum(s.log_k_at(t)), "dH": jnum(s.delta_h_at(t)) }));
            }
            let (a, b) = d.dh(t);
            Ok(json!({ "T": jnum(t), "values": out, "dhA": jnum(a), "dhB": jnum(b), "ln10": jnum(LN10), "hIndex": C_H }))
        })(),
        _ => return None,
    })
}
