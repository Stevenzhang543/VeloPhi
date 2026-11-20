//! The reactor workshop against the reference data of `scripts/oracles/reactor.py`
//! (tests/fixtures/chem/reactor.json): analytic multiplication factors and critical sizes, the IAEA 2-D benchmark,
//! the in-hour equation, the exact solution of the kinetics equations, the xenon chain. Then the behaviour of the
//! whole model on the presets: steady states stay steady, the protection trips, the model stops before prompt
//! critical, and the same request gives the same bytes.

use serde_json::{json, Value};
use velophi_chem::api::calc_bytes;
use velophi_core::transport::{parse_container, read_f64s};

fn call(req: &Value) -> (Value, Vec<u8>) {
    let bytes = calc_bytes(req).unwrap_or_else(|m| panic!("{}: {:?}", req["op"], m));
    let (doc, blob) = parse_container(&bytes).expect("container");
    (doc, blob.to_vec())
}

fn load(path: &str) -> Value {
    let full = format!("{}/../../{}", env!("CARGO_MANIFEST_DIR"), path);
    serde_json::from_str(&std::fs::read_to_string(full).expect(path)).expect("json")
}

fn set_data() {
    call(&json!({ "op": "reactorSetData", "data": load("src/chem/data/xs2g.json") }));
}

fn series(r: &(Value, Vec<u8>), name: &str) -> Vec<f64> {
    read_f64s(&r.1, &r.0["series"][name]).unwrap()
}

fn preset(id: &str) -> Value {
    let p = call(&json!({ "op": "reactorPresets" })).0;
    p["presets"].as_array().unwrap().iter().find(|x| x["id"] == id).unwrap()["doc"].clone()
}

#[test]
fn reference_cases() {
    set_data();
    let fixture = load("tests/fixtures/chem/reactor.json");
    let mut count = 0;
    let mut worst: std::collections::BTreeMap<String, f64> = std::collections::BTreeMap::new();
    for case in fixture["cases"].as_array().unwrap() {
        let (id, kind, tol) = (case["id"].as_str().unwrap(), case["kind"].as_str().unwrap(), case["tol"].as_f64().unwrap());
        let expect = &case["expect"];
        let mut err = 0.0f64;
        let mut check = |what: &str, got: f64, want: f64, tol: f64| {
            let e = (got / want - 1.0).abs();
            assert!(e <= tol, "{id} {what}: {got} against {want} (relative {e:e}, tolerance {tol:e})");
            err = err.max(e);
        };
        match kind {
            "criticality" => {
                let r = call(&case["request"]).0;
                assert!(r["converged"] == true, "{id}");
                check("keff", r["keff"].as_f64().unwrap(), expect["keff"].as_f64().unwrap(), tol);
            }
            "iaea" => {
                // refinement 1, 2, 4 (cells of 10, 5 and 2.5 cm): the error falls by about four per halving
                let reference = expect["keff"].as_f64().unwrap();
                let mut k = Vec::new();
                for refine in [1, 2, 4] {
                    let mut req = case["request"].clone();
                    req["grid"]["refine"] = json!(refine);
                    let r = call(&req).0;
                    assert!(r["converged"] == true);
                    k.push(r["keff"].as_f64().unwrap());
                }
                let extrapolated = k[2] + (k[2] - k[1]) / 3.0;
                println!("iaea2d: k = {:.6}, {:.6}, {:.6} at 10, 5, 2.5 cm; extrapolated {extrapolated:.6}; reference {reference}", k[0], k[1], k[2]);
                // Mesh convergence: the three grids differ by 4.1e-4 and then 2.0e-4 (the differences halve; the
                // error changes sign between 10 cm and 5 cm, so the sequence is not monotonic), and every grid is
                // within the tolerance of the fixture (5e-4) of the reference; the finest within 2e-4.
                assert!((k[2] - k[1]).abs() < 0.6 * (k[1] - k[0]).abs());
                for v in &k {
                    check("keff", *v, reference, tol);
                }
                check("keff at 2.5 cm", k[2], reference, 2e-4);
                // and inside or just below the band FeenoX reports
                let band = expect["feenox"].as_array().unwrap();
                assert!(k[2] > band[0].as_f64().unwrap() - 4e-4 && k[2] < band[1].as_f64().unwrap() + 1e-4);
            }
            "inhour" => {
                let r = call(&case["request"]).0;
                check("omega", r["inhour"]["omega"].as_f64().unwrap(), expect["omega"].as_f64().unwrap(), tol);
                check("period", r["inhour"]["period"].as_f64().unwrap(), expect["period"].as_f64().unwrap(), tol);
            }
            "kinetics" => {
                let times = case["request"]["times"].as_array().unwrap();
                for (t, want) in times.iter().zip(expect["n"].as_array().unwrap()) {
                    let mut req = case["request"].clone();
                    req["duration"] = t.clone();
                    req["samples"] = json!(1);
                    req["rtol"] = json!(1e-9);
                    let r = call(&req);
                    let n = read_f64s(&r.1, &r.0["n"]).unwrap();
                    check("n", n[0], want.as_f64().unwrap(), tol);
                    check("promptJump", r.0["promptJump"].as_f64().unwrap(), expect["promptJump"].as_f64().unwrap(), 1e-12);
                }
            }
            "poisons" => {
                let hours: Vec<u64> = case["request"]["hours"].as_array().unwrap().iter().map(|h| h.as_u64().unwrap()).collect();
                let last = *hours.last().unwrap();
                let mut req = case["request"].clone();
                req["duration"] = json!(last as f64 * 3600.0);
                req["samples"] = json!(last);
                let r = call(&req);
                let x = read_f64s(&r.1, &r.0["xenon"]).unwrap();
                for (h, want) in hours.iter().zip(expect["xenon"].as_array().unwrap()) {
                    check("xenon(t)", x[*h as usize - 1], want.as_f64().unwrap(), tol);
                }
                check("iodine equilibrium", r.0["equilibrium"]["iodine"].as_f64().unwrap(), expect["iodineEq"].as_f64().unwrap(), 1e-12);
                check("xenon equilibrium", r.0["equilibrium"]["xenon"].as_f64().unwrap(), expect["xenonEq"].as_f64().unwrap(), 1e-12);
                check("samarium equilibrium", r.0["equilibrium"]["samarium"].as_f64().unwrap(), expect["samariumEq"].as_f64().unwrap(), 1e-12);
                check("xenon peak", r.0["peak"]["xenon"].as_f64().unwrap(), expect["peakXenon"].as_f64().unwrap(), 1e-10);
                if expect["peakAfter"].as_f64().unwrap() > 0.0 {
                    check("time of the peak", r.0["peak"]["after"].as_f64().unwrap(), expect["peakAfter"].as_f64().unwrap(), 1e-10);
                }
            }
            other => panic!("unknown kind {other}"),
        }
        let w = worst.entry(kind.to_string()).or_insert(0.0);
        *w = w.max(err);
        count += 1;
    }
    println!("reactor reference: {count} cases; worst relative deviation by kind {worst:?}");
    assert!(count >= 20);
}

#[test]
fn lattices_behave_like_their_real_counterparts() {
    set_data();
    let k_inf = |fuel: &str, moderator: &str, pitch: f64, refine: usize, e: f64| -> f64 {
        let cells: Vec<Value> = (0..16).map(|i| json!(if (i % 4 + i / 4) % 2 == 0 { fuel } else { moderator })).collect();
        call(&json!({ "op": "reactorCriticality", "grid": { "nx": 4, "ny": 4, "pitch_cm": pitch, "refine": refine }, "cells": cells, "enrichment": e, "boundary": "reflective" })).0["keff"].as_f64().unwrap()
    };
    // natural uranium: critical with graphite and with heavy water, never with light water
    let graphite = k_inf("fuel_nat", "graphite", 12.0, 1, 0.72);
    let heavy = k_inf("fuel_nat", "heavy_water", 20.0, 2, 0.72);
    assert!(graphite > 1.03 && graphite < 1.10, "{graphite}");
    assert!(heavy > 1.12 && heavy < 1.25, "{heavy}");
    for pitch in [1.0, 2.0, 5.0, 20.0] {
        assert!(k_inf("fuel_nat", "water", pitch, 2, 0.72) < 0.5);
        assert!(k_inf("fuel_leu", "water", pitch.min(3.0), 1, 0.72) < 1.0);
    }
    // light water needs enrichment: k∞ rises with it and passes 1 between 1 % and 1.5 %
    let k: Vec<f64> = [1.0, 1.5, 3.0, 5.0].iter().map(|e| k_inf("fuel_leu", "water", 1.6, 1, *e)).collect();
    assert!(k[0] < 1.0 && k[1] > 1.0 && k[1] < k[2] && k[2] < k[3] && k[3] < 1.5, "{k:?}");
    // the enrichment is capped at 5 %: asking for more changes nothing
    assert_eq!(k_inf("fuel_leu", "water", 1.6, 1, 5.0), k_inf("fuel_leu", "water", 1.6, 1, 90.0));
    // a data file offering more is refused
    let mut data = load("src/chem/data/xs2g.json");
    data["materials"][1]["dep"]["max"] = json!(20.0);
    assert!(calc_bytes(&json!({ "op": "reactorSetData", "data": data })).is_err());
    set_data();

    // the presets: shut down with the rods in, supercritical with the rods out; negative fuel-temperature and
    // void coefficients
    for id in ["pwrLattice", "graphitePile", "heavyWater", "research"] {
        let mut req = preset(id);
        req["op"] = json!("reactorCriticality");
        req["feedback"] = json!(true);
        let rods = req["rods"].as_object().unwrap().len();
        let inserted = call(&req).0;
        req["insertions"] = json!(vec![0.0; rods]);
        let out = call(&req).0;
        let (k_in, k_out) = (inserted["keff"].as_f64().unwrap(), out["keff"].as_f64().unwrap());
        println!("{id}: k = {k_in:.4} rods in, {k_out:.4} rods out; alpha {}", out["feedback"]["alpha"]);
        assert!(k_in < 0.999 && k_out > 1.002, "{id}: {k_in} {k_out}");
        let alpha = &out["feedback"]["alpha"];
        assert!(alpha["fuelT"].as_f64().unwrap() < 0.0 && alpha["xenon"].as_f64().unwrap() < 0.0 && alpha["samarium"].as_f64().unwrap() < 0.0);
        assert!(alpha["moderatorVoid"].as_f64().unwrap() <= 0.0);
        assert!(out["diagnostics"].as_array().unwrap().iter().any(|d| d["code"] == "reactor.teachingModel"));
    }
}

#[test]
fn perturbation_matches_a_new_solution() {
    // the adjoint-weighted coefficients against the difference of two full solutions
    set_data();
    let mut req = preset("research");
    req["op"] = json!("reactorCriticality");
    req["feedback"] = json!(true);
    let rods = req["rods"].as_object().unwrap().len();
    req["insertions"] = json!(vec![0.3; rods]);
    let base = call(&req).0;
    let rho0 = base["rho"].as_f64().unwrap();
    for (key, step, cond) in [("fuelT", 20.0, json!({ "fuelT": 313.0 })), ("moderatorT", 5.0, json!({ "moderatorT": 298.0, "coolantT": 298.0 })), ("xenon", 2e-10, json!({ "xenon": 2e-10 })), ("moderatorVoid", 0.01, json!({ "void": 0.01 }))] {
        let mut changed = req.clone();
        changed["conditions"] = cond;
        changed["feedback"] = json!(false);
        let rho1 = call(&changed).0["rho"].as_f64().unwrap();
        let mut alpha = base["feedback"]["alpha"][key].as_f64().unwrap();
        if key == "moderatorVoid" {
            // the request sets the void of moderator and coolant alike
            alpha += base["feedback"]["alpha"]["coolantVoid"].as_f64().unwrap();
        }
        if key == "moderatorT" {
            alpha += base["feedback"]["alpha"]["coolantT"].as_f64().unwrap();
        }
        let exact = (rho1 - rho0) / step;
        // first order: within 5 % of the secant for these small steps (the cross-sections are not linear in T)
        assert!((alpha / exact - 1.0).abs() < 0.05, "{key}: perturbation {alpha:e}, two solutions {exact:e}");
    }
}

#[test]
fn the_reactor_in_time() {
    set_data();
    let doc = preset("research");
    let run = |state: Option<&Value>, dt: f64, controls: Value, init: Value, doc: &Value| -> (Value, Vec<u8>) {
        let mut req = json!({ "op": "reactorAdvance", "doc": doc, "dt": dt, "samples": 20, "controls": controls, "init": init, "maxSolves": 120 });
        if let Some(s) = state {
            req["state"] = s.clone();
        }
        call(&req)
    };
    // in equilibrium at full power (the rod position is searched): the power stays within 5e-4 for an hour
    // (the integrator works to a relative tolerance of 1e-6 per step)
    let r = run(None, 3600.0, json!({}), json!({ "power": 1.0, "search": true }), &doc);
    let n = series(&r, "n");
    assert!(n.iter().all(|x| (x - 1.0).abs() < 5e-4), "{n:?}");
    let s = r.0["state"].clone();
    assert!(s["shim"].as_f64().unwrap().abs() < 1e-4 && s["trip"].is_null() && s["ended"].is_null());
    assert!(series(&r, "decayHeat").iter().all(|h| (h - 0.0713).abs() < 2e-4));
    // the same request again: the same bytes; and the state carries a fingerprint
    let again = run(None, 3600.0, json!({}), json!({ "power": 1.0, "search": true }), &doc);
    assert_eq!(r.0, again.0);
    assert_eq!(r.1, again.1);
    assert_eq!(s["hash"].as_str().unwrap().len(), 64);
    // continuing in two halves or in one piece ends at the same time with the same power to the tolerance of the integrator
    let one = run(Some(&s), 100.0, json!({ "rods": 0.0, "rodSpeed": 0.00001 }), json!({}), &doc);
    let half = run(Some(&s), 50.0, json!({ "rods": 0.0, "rodSpeed": 0.00001 }), json!({}), &doc);
    let two = run(Some(&half.0["state"]), 50.0, json!({}), json!({}), &doc);
    let (a, b) = (one.0["state"]["n"].as_f64().unwrap(), two.0["state"]["n"].as_f64().unwrap());
    assert!(one.0["state"]["trip"].is_null() && (a / b - 1.0).abs() < 1e-3, "{a} {b} {} {}", one.0["state"]["trip"], one.0["events"]);
    // withdrawing rods raises the power; the fuel heats up and the feedback is negative
    assert!(a > 1.003 && *series(&one, "rhoFeedback").last().unwrap() < 0.0, "{a}");
    // a faster withdrawal trips the protection on power or period: the rods drop and the power falls
    let trip = run(Some(&s), 120.0, json!({ "rods": 0.0, "rodSpeed": 0.002 }), json!({}), &doc);
    let st = &trip.0["state"];
    assert!(st["trip"]["reason"] == "power" || st["trip"]["reason"] == "period", "{}", st["trip"]);
    assert!(st["scram"] == true && st["n"].as_f64().unwrap() < 0.1 && st["rods"][0].as_f64().unwrap() == 1.0);
    assert!(trip.0["events"].as_array().unwrap().iter().any(|e| e["kind"] == "trip"));
    // decay heat after the shutdown: still several percent after a minute
    assert!(*series(&trip, "decayHeat").last().unwrap() > 0.02);

    // without protection a fast withdrawal at power overheats the fuel: the simulation ends with the reason
    let mut bare = doc.clone();
    bare["protection"] = json!({ "enabled": false });
    let fast = run(Some(&s), 600.0, json!({ "rods": 0.0, "rodSpeed": 0.05 }), json!({}), &bare);
    let st = &fast.0["state"];
    assert_eq!(st["ended"]["reason"], "coreDamage", "{}", st["ended"]);
    assert!(st["ended"]["value"].as_f64().unwrap() > 3120.0 && st["ended"]["limit"] == 3120.0);
    assert!(fast.0["diagnostics"].as_array().unwrap().iter().any(|d| d["code"] == "reactor.coreDamage" && d["severity"] == "error"));
    // from the cold shut-down core the same withdrawal runs towards prompt critical before any power could hold it
    // back: the model stops at 0.9 β and says that it is not valid beyond
    let cold = run(None, 1.0, json!({}), json!({}), &bare);
    let fast = run(Some(&cold.0["state"]), 600.0, json!({ "rods": 0.0, "rodSpeed": 0.05 }), json!({}), &bare);
    let st = &fast.0["state"];
    assert_eq!(st["ended"]["reason"], "validity", "{}", st["ended"]);
    let limit = st["ended"]["limit"].as_f64().unwrap();
    assert!((limit / (0.9 * 0.0075998) - 1.0).abs() < 1e-9 && st["ended"]["value"].as_f64().unwrap() >= limit);
    assert!(fast.0["diagnostics"].as_array().unwrap().iter().any(|d| d["code"] == "reactor.promptCritical" && d["severity"] == "unmodelled"));
    // nothing is computed beyond: every recorded reactivity is below the limit, the power is still a trace, and a
    // further call returns the same state
    assert!(series(&fast, "rho").iter().all(|x| *x < limit) && st["n"].as_f64().unwrap() < 1e-3);
    let after = run(Some(st), 10.0, json!({}), json!({}), &bare);
    assert_eq!(after.0["state"]["t"], st["t"]);
    assert_eq!(after.0["samples"], 0);

    // cooling lost without protection: the negative feedback alone brings the power down, the fuel stays whole
    let lost = run(Some(&s), 1800.0, json!({ "pump": 0.0, "exchanger": false }), json!({}), &bare);
    let st = &lost.0["state"];
    assert!(st["ended"].is_null() && st["n"].as_f64().unwrap() < 0.2, "{}", st["n"]);
    let check = call(&json!({ "op": "reactorTaskCheck", "task": "lossOfCooling", "doc": bare, "state": st })).0;
    assert_eq!(check["passed"], true, "{check}");

    // xenon after a shutdown from power: it rises above its value at the shutdown and peaks after some hours
    let pwr = preset("pwrLattice");
    let hot = run(None, 10.0, json!({}), json!({ "power": 1.0, "search": true }), &pwr);
    let down = run(Some(&hot.0["state"]), 3600.0 * 30.0, json!({ "scram": true }), json!({}), &pwr);
    let x = series(&down, "xenon");
    let t = read_f64s(&down.1, &down.0["t"]).unwrap();
    let (mut peak, mut at) = (0.0, 0.0);
    for (xi, ti) in x.iter().zip(t.iter()) {
        if *xi > peak {
            peak = *xi;
            at = *ti - 10.0;
        }
    }
    let x0 = hot.0["state"]["xenon"].as_f64().unwrap();
    assert!(peak > 1.5 * x0 && at > 4.0 * 3600.0 && at < 14.0 * 3600.0, "peak {peak} ({x0} before) after {at} s");
}

#[test]
fn tasks_and_balance() {
    set_data();
    let doc = preset("research");
    // the budget adds up to the reactivity of the layout as it stands
    let b = call(&json!({ "op": "reactorBalance", "doc": doc })).0;
    let sum: f64 = b["entries"].as_array().unwrap().iter().map(|e| e["rho"].as_f64().unwrap()).sum();
    assert!((sum - b["rho"].as_f64().unwrap()).abs() < 1e-12);
    let entry = |id: &str| b["entries"].as_array().unwrap().iter().find(|e| e["id"] == id).unwrap()["rho"].as_f64().unwrap();
    assert!(entry("excess") > 0.0 && entry("rods") < 0.0 && entry("xenon") == 0.0);
    // critical: not as the preset stands (shut down), but with the rods where the search puts them
    let c = call(&json!({ "op": "reactorTaskCheck", "task": "critical", "doc": doc })).0;
    assert_eq!(c["passed"], false);
    let r = call(&json!({ "op": "reactorAdvance", "doc": doc, "dt": 0, "init": { "power": 1e-6, "search": true } })).0;
    let c = call(&json!({ "op": "reactorTaskCheck", "task": "critical", "doc": doc, "state": r["state"] })).0;
    assert_eq!(c["passed"], true, "{c}");
    // minimal change: one more fuel cell in a core that is just subcritical … here: one rod withdrawn
    let mut start = doc.clone();
    let rods: Vec<String> = start["rods"].as_object().unwrap().keys().cloned().collect();
    for k in &rods {
        start["rods"][k]["insertion"] = json!(0.36);
    }
    let mut changed = start.clone();
    changed["rods"][&rods[0]]["insertion"] = json!(0.0);
    let c = call(&json!({ "op": "reactorTaskCheck", "task": "minimalChange", "doc": changed, "start": start })).0;
    let k: Vec<f64> = c["checks"].as_array().unwrap().iter().map(|x| x["value"].as_f64().unwrap()).collect();
    assert!(k[0] < k[1] && k[2] == 1.0, "{c}");
    // refuelling: replacing fuel cells by fresh fuel raises k; cells of another kind do not count as refuelling
    let mut spent = doc.clone();
    spent["enrichment"] = json!(1.2);
    for k in &rods {
        spent["rods"][k]["insertion"] = json!(0.0);
    }
    let mut fresh = spent.clone();
    fresh["enrich"] = json!({ "12,12": 5.0, "14,14": 5.0, "16,16": 5.0, "18,18": 5.0 });
    let c = call(&json!({ "op": "reactorTaskCheck", "task": "refuel", "doc": fresh, "start": spent, "k": 0.5 })).0;
    let find = |id: &str| c["checks"].as_array().unwrap().iter().find(|x| x["id"] == id).unwrap().clone();
    assert!(find("changes")["value"] == 4.0 && find("onlyFuel")["ok"] == true && find("critical")["value"].as_f64().unwrap() > find("startSubcritical")["value"].as_f64().unwrap(), "{c}");
    assert!(calc_bytes(&json!({ "op": "reactorTaskCheck", "task": "nothing", "doc": doc })).is_err());
}
