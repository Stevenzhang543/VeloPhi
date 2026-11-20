//! The four preset reactors of the workshop and the checks of its six tasks (26.64, D277).
//!
//! Presets are reactor documents (handoff 15.6) built here so that their numbers stay with the model they were
//! tuned for: a tight lattice of low-enriched fuel in light water, a pile of natural uranium in graphite, natural
//! uranium in heavy water, and a small pool-type research reactor. The interface names them by `id`.
//!
//! The task checks only read numbers the core computed (k_eff of a layout, the state, a recorded series); each
//! returns the list of its conditions with value and limit, so the interface can show what is still missing.

use serde_json::{json, Map, Value};
use velophi_core::message::{Message, SimResult};
use velophi_core::transport::{dnum, jnum};

use super::layout::{solve, Doc, TOLERANCE};
use super::materials::Conditions;
use super::reactor::{kinetics_of, Model, State};

fn bad(what: impl Into<String>) -> Message {
    Message::new("err.internal").text("message", format!("reactor task: {}", what.into()))
}

/// A square core of `core` × `core` cells in the middle of an `n` × `n` grid: fuel where `fuel(x, y)` (coordinates
/// within the core), `moderator` elsewhere in the core, `reflector` in a ring of `ring` cells, `outside` beyond.
#[allow(clippy::too_many_arguments)]
fn square(n: usize, core: usize, ring: usize, fuel_id: &str, moderator: &str, reflector: &str, outside: &str, fuel: &dyn Fn(usize, usize) -> bool) -> Vec<Value> {
    let lo = (n - core) / 2;
    let hi = lo + core;
    let mut cells = Vec::with_capacity(n * n);
    for y in 0..n {
        for x in 0..n {
            let inside = x >= lo && x < hi && y >= lo && y < hi;
            let near = x + ring >= lo && x < hi + ring && y + ring >= lo && y < hi + ring;
            let id = if inside {
                if fuel(x - lo, y - lo) {
                    fuel_id
                } else {
                    moderator
                }
            } else if near {
                reflector
            } else {
                outside
            };
            cells.push(Value::String(id.to_string()));
        }
    }
    cells
}

fn rods(cells: &[(usize, usize)], material: &str, insertion: f64) -> Value {
    let mut m = Map::new();
    for (x, y) in cells {
        m.insert(format!("{x},{y}"), json!({ "material": material, "insertion": insertion }));
    }
    Value::Object(m)
}

/// The preset documents: `[{ id, doc }]`.
pub fn presets() -> Vec<Value> {
    let checker = |x: usize, y: usize| (x + y).is_multiple_of(2);
    let mut out = Vec::new();
    // 1. Low-enriched fuel in light water: pitch 1.6 cm, fuel and water cells alternating, water reflector
    {
        let n = 56;
        let cells = square(n, 46, 5, "fuel_leu", "water", "water", "water", &checker);
        // rods in water positions of the core (odd x + y), every third cell
        let mut at = Vec::new();
        for j in (7..50usize).step_by(3) {
            for i in (7..50usize).step_by(3) {
                at.push((if (i + j) % 2 == 1 { i } else { i - 1 }, j));
            }
        }
        out.push(json!({ "id": "pwrLattice", "doc": {
            "format": "velophi-reactor", "version": 1,
            "grid": { "nx": n, "ny": n, "pitch_cm": 1.6, "refine": 1 },
            "cells": cells, "enrichment": 3.0, "rods": rods(&at, "b4c", 1.0),
            "boundary": "vacuum", "height_cm": 150.0, "power_W": 5.0e7,
            "thermal": { "T_in": 560.0, "dT_core": 30.0, "dT_fuel": 500.0, "tau_fuel": 5.0, "tau_coolant": 2.0, "tau_loop": 10.0, "T_sat": 618.0, "T_ambient": 293.0 },
            "loop": { "pump": 1.0, "exchanger": true, "turbine": true },
            "protection": { "power": 1.2, "period_s": 10.0, "fuelT_K": 1800.0 },
            "detectors": ["2,28"], "source_n_per_s": 1.0e7
        } }));
    }
    // 2. Natural uranium in graphite: pitch 12 cm, a rod channel in every second cell, graphite reflector, air cooled
    {
        let n = 64;
        let cells = square(n, 58, 3, "fuel_nat", "graphite", "graphite", "graphite", &checker);
        let at = [(20usize, 21usize), (43, 20), (21, 44), (42, 43), (32, 31), (31, 12), (32, 51), (12, 31), (51, 32)];
        out.push(json!({ "id": "graphitePile", "doc": {
            "format": "velophi-reactor", "version": 1,
            "grid": { "nx": n, "ny": n, "pitch_cm": 12.0, "refine": 1 },
            "cells": cells, "rods": rods(&at, "b4c", 1.0),
            "boundary": "vacuum", "height_cm": 900.0, "power_W": 2.0e5,
            "thermal": { "T_in": 310.0, "dT_core": 20.0, "dT_fuel": 60.0, "dT_moderator": 15.0, "tau_fuel": 40.0, "tau_coolant": 120.0, "tau_moderator": 3600.0, "tau_loop": 60.0, "T_sat": 2000.0, "ambientLoss": 1.0, "T_ambient": 293.0 },
            "loop": { "pump": 0.0, "exchanger": false, "turbine": false },
            "protection": { "power": 1.5, "period_s": 20.0, "fuelT_K": 700.0 },
            "detectors": ["1,32"], "source_n_per_s": 1.0e6
        } }));
    }
    // 3. Natural uranium in heavy water (a low-temperature tank reactor): pitch 20 cm, fuel channels alternating with
    // heavy water, heavy-water reflector
    {
        let n = 22;
        let cells = square(n, 16, 3, "fuel_nat", "heavy_water", "heavy_water", "heavy_water", &checker);
        let at = [(8usize, 9usize), (13, 12)];
        out.push(json!({ "id": "heavyWater", "doc": {
            "format": "velophi-reactor", "version": 1,
            "grid": { "nx": n, "ny": n, "pitch_cm": 20.0, "refine": 2 },
            "cells": cells, "rods": rods(&at, "agincd", 1.0),
            "boundary": "vacuum", "height_cm": 400.0, "power_W": 1.0e7,
            "thermal": { "T_in": 315.0, "dT_core": 25.0, "dT_fuel": 200.0, "tau_fuel": 8.0, "tau_coolant": 30.0, "tau_loop": 60.0, "T_sat": 375.0, "T_ambient": 293.0 },
            "loop": { "pump": 1.0, "exchanger": true, "turbine": false },
            "protection": { "power": 1.2, "period_s": 10.0, "fuelT_K": 900.0 },
            "detectors": ["1,11"], "source_n_per_s": 1.0e7
        } }));
    }
    // 4. A small pool-type research reactor: 5 % fuel in light water, graphite reflector, open pool
    {
        let n = 36;
        let mut cells = square(n, 22, 5, "fuel_leu", "water", "graphite", "water", &checker);
        cells[18 * n + 17] = Value::String("source".into());
        let mut at = Vec::new();
        for j in [9usize, 13, 17, 21, 25] {
            for i in [9usize, 13, 17, 21, 25] {
                if !(i == 17 && j == 17) {
                    at.push((if (i + j) % 2 == 1 { i } else { i + 1 }, j));
                }
            }
        }
        out.push(json!({ "id": "research", "doc": {
            "format": "velophi-reactor", "version": 1,
            "grid": { "nx": n, "ny": n, "pitch_cm": 1.6, "refine": 1 },
            "cells": cells, "enrichment": 5.0, "rods": rods(&at, "b4c", 1.0),
            "boundary": "vacuum", "height_cm": 80.0, "power_W": 2.5e5,
            "thermal": { "T_in": 300.0, "dT_core": 10.0, "dT_fuel": 40.0, "tau_fuel": 3.0, "tau_coolant": 20.0, "tau_loop": 120.0, "T_sat": 385.0, "ambientLoss": 0.05, "T_ambient": 293.0, "naturalFlow": 0.1 },
            "loop": { "pump": 1.0, "exchanger": true, "turbine": false },
            "protection": { "power": 1.2, "period_s": 5.0, "fuelT_K": 500.0 },
            "detectors": ["3,18"], "source_n_per_s": 1.0e6
        } }));
    }
    out
}

fn check(id: &str, ok: bool, value: f64, limit: f64) -> Value {
    json!({ "id": id, "ok": ok, "value": jnum(value), "limit": jnum(limit) })
}

fn k_of(doc: &Doc, state: Option<&State>) -> SimResult<(f64, f64)> {
    let (c, rods) = match state {
        Some(s) => (Model::new(doc).conditions(&s.temps, &s.poisons), s.rods.clone()),
        None => (Conditions::cold(doc.lib().map(|l| l.t_ref).unwrap_or(293.0)), doc.rod_insertions()),
    };
    let (_, _, st) = solve(doc, &c, &rods, TOLERANCE)?;
    Ok((st.k, st.peak))
}

/// Number of cells in which two layouts of the same grid differ (material, enrichment, rod or its insertion).
fn changes(a: &Doc, b: &Doc) -> SimResult<(usize, usize)> {
    if a.nx != b.nx || a.ny != b.ny || a.pitch != b.pitch {
        return Err(bad("the two documents have different grids"));
    }
    let rod = |d: &Doc, cell: usize| d.rods.iter().find(|r| r.cell == cell).map(|r| (d.materials[r.material].id.clone(), r.insertion));
    let (mut all, mut fuel) = (0, 0);
    for c in 0..a.cells.len() {
        let (ma, mb) = (&a.materials[a.cells[c]], &b.materials[b.cells[c]]);
        let different = ma.id != mb.id || a.enrichment_of(c) != b.enrichment_of(c) || rod(a, c) != rod(b, c);
        if different {
            all += 1;
            if mb.fissile() {
                fuel += 1;
            }
        }
    }
    Ok((all, fuel))
}

/// Check one of the six tasks. `series`: `{ t[], n[] }` recorded by the interface from `reactorAdvance`.
pub fn task(name: &str, req: &Value, doc: &Doc, state: Option<&State>, start: Option<&Doc>) -> SimResult<Value> {
    let num = |k: &str, d: f64| req.get(k).filter(|x| !x.is_null()).map(dnum).filter(|x| x.is_finite()).unwrap_or(d);
    let series = |k: &str| -> Vec<f64> { req.get("series").and_then(|s| s.get(k)).and_then(|v| v.as_array()).map(|a| a.iter().map(dnum).collect()).unwrap_or_default() };
    let mut checks = Vec::new();
    match name {
        // 1. reach criticality: the layout as it stands (with the state, if the reactor runs) has |ρ| below the limit
        "critical" => {
            let (k, _) = k_of(doc, state)?;
            let rho = 1.0 - 1.0 / k + state.map(|s| s.shim).unwrap_or(0.0);
            let limit = num("tolerance", 0.1 * kinetics_of(doc, 1.0).beta_total());
            checks.push(check("reactivity", rho.abs() <= limit, rho, limit));
            if let Some(s) = state {
                checks.push(check("notTripped", s.trip.is_none() && s.ended.is_none(), if s.trip.is_some() { 1.0 } else { 0.0 }, 0.0));
            }
        }
        // 2. raise the power to the target and hold it within the band for the hold time
        "power" => {
            let s = state.ok_or_else(|| bad("power needs the state"))?;
            let (target, band, hold) = (num("target", 1.0), num("band", 0.02), num("hold_s", 60.0));
            let (t, n) = (series("t"), series("n"));
            let end = t.last().copied().unwrap_or(f64::NAN);
            let mut worst = 0.0f64;
            let mut covered = 0.0;
            for (ti, ni) in t.iter().zip(n.iter()) {
                if *ti >= end - hold {
                    worst = worst.max((ni / target - 1.0).abs());
                    covered = end - ti;
                }
            }
            let recorded = t.len() == n.len() && t.len() >= 2 && t.first().copied().unwrap_or(f64::NAN) <= end - hold;
            checks.push(check("held", recorded && covered >= 0.0 && worst <= band, worst, band));
            checks.push(check("recorded", recorded, end - t.first().copied().unwrap_or(end), hold));
            checks.push(check("now", (s.n / target - 1.0).abs() <= band, s.n, target));
            checks.push(check("notTripped", s.trip.is_none() && s.ended.is_none(), if s.trip.is_some() { 1.0 } else { 0.0 }, 0.0));
        }
        // 3. restart after a shutdown while the xenon is above its value at the shutdown (the iodine pit)
        "xenonRestart" => {
            let s = state.ok_or_else(|| bad("xenonRestart needs the state"))?;
            let (wait, level) = (num("wait_s", 3600.0), num("level", 0.05));
            let since = s.t - s.stats.t_scram;
            checks.push(check("shutDown", since >= wait, since, wait));
            checks.push(check("xenonAbove", s.poisons.xenon > s.stats.xenon_at_scram, s.poisons.xenon, s.stats.xenon_at_scram));
            checks.push(check("running", s.n >= level && !s.scram && s.ended.is_none(), s.n, level));
        }
        // 4. cooling lost, no shutdown by the rods: the negative feedback alone brings the power down and the fuel stays whole
        "lossOfCooling" => {
            let s = state.ok_or_else(|| bad("lossOfCooling needs the state"))?;
            let (wait, fraction) = (num("wait_s", 300.0), num("fraction", 0.2));
            let since = s.t - s.stats.t_cooling_lost;
            let limit = Model::new(doc).damage;
            checks.push(check("coolingLost", since >= wait, since, wait));
            checks.push(check("noScram", !s.scram && s.trip.is_none(), if s.scram { 1.0 } else { 0.0 }, 0.0));
            checks.push(check("powerFell", s.n <= fraction * s.stats.power_at_cooling_lost, s.n, fraction * s.stats.power_at_cooling_lost));
            checks.push(check("fuelWhole", s.ended.is_none() && s.stats.max_fuel_t < limit, s.stats.max_fuel_t, limit));
        }
        // 5. the smallest change that makes a subcritical layout critical
        "minimalChange" => {
            let start = start.ok_or_else(|| bad("minimalChange needs start"))?;
            let (k0, _) = k_of(start, None)?;
            let (k1, _) = k_of(doc, None)?;
            let (all, _) = changes(start, doc)?;
            let allowed = num("maxChanges", 1.0);
            checks.push(check("startSubcritical", k0 < 1.0, k0, 1.0));
            checks.push(check("critical", k1 >= 1.0, k1, 1.0));
            checks.push(check("changes", all >= 1 && all as f64 <= allowed, all as f64, allowed));
        }
        // 6. refuelling: replace some fuel cells once, the core must be critical again without a hot spot
        "refuel" => {
            let start = start.ok_or_else(|| bad("refuel needs start"))?;
            let (k0, _) = k_of(start, None)?;
            let (k1, peak) = k_of(doc, None)?;
            let (all, fuel) = changes(start, doc)?;
            let (allowed, hot, wanted) = (num("maxChanges", 8.0), num("maxPeak", 2.5), num("k", 1.0));
            checks.push(check("startSubcritical", k0 < wanted, k0, wanted));
            checks.push(check("critical", k1 >= wanted, k1, wanted));
            checks.push(check("onlyFuel", all == fuel && fuel >= 1, (all - fuel) as f64, 0.0));
            checks.push(check("changes", fuel as f64 <= allowed, fuel as f64, allowed));
            checks.push(check("peak", peak <= hot, peak, hot));
        }
        other => return Err(bad(format!("unknown task '{other}' (critical, power, xenonRestart, lossOfCooling, minimalChange, refuel)"))),
    }
    let passed = checks.iter().all(|c| c["ok"] == Value::Bool(true));
    Ok(json!({ "task": name, "passed": passed, "checks": checks }))
}
