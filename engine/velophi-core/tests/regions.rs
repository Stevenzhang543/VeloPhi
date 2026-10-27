//! 26.55 (D90–D92): field regions (mass spectrometer, cyclotron), rail loops and liquids, checked against the
//! analytic results and the energy ledger. Scenes without these features are untouched (their fingerprints are
//! checked by the parity tests).

use serde_json::{json, Value};
use velophi_core::scene::parse_scene;
use velophi_core::session::ledger_at;
use velophi_core::simulation::{simulate, ChangeType, SimOptions, SimulationRun};

fn particle(id: &str, x: f64, y: f64, vx: f64, vy: f64, m: f64, q: f64, r: f64) -> Value {
    json!({
        "id": id, "name": id, "kind": "particle", "role": "block",
        "shape": {"type": "circle", "radius": r},
        "position": {"x": x, "y": y}, "angle": 0, "velocity": {"x": vx, "y": vy}, "angularVelocity": 0,
        "mass": m, "inertia": null, "fixedRotation": false,
        "material": {"muS": 0, "muK": 0, "restitution": 1}, "beltSpeed": 0, "color": "#3b82f6", "charge": q
    })
}

fn block(id: &str, x: f64, y: f64, w: f64, h: f64, m: f64, vx: f64, vy: f64, fixed_rotation: bool) -> Value {
    json!({
        "id": id, "name": id, "kind": "rigid", "role": "block",
        "shape": {"type": "box", "width": w, "height": h},
        "position": {"x": x, "y": y}, "angle": 0, "velocity": {"x": vx, "y": vy}, "angularVelocity": 0,
        "mass": m, "inertia": null, "fixedRotation": fixed_rotation,
        "material": {"muS": 0, "muK": 0, "restitution": 0}, "beltSpeed": 0, "color": "#3b82f6"
    })
}

fn scene(bodies: Vec<Value>, connectors: Vec<Value>, settings: Value, duration: f64) -> String {
    let mut st = json!({
        "gravity": {"x": 0, "y": 0}, "outputStep": 0.01, "integrator": "dopri5", "relTol": 1e-10, "absTol": 1e-12,
        "duration": duration, "stopAt": null, "legacyDuration": 5, "energyZeroY": 0
    });
    for (k, v) in settings.as_object().unwrap() {
        st[k] = v.clone();
    }
    json!({
        "format": "velophi-scene", "version": 6, "dimension": 2, "engine": "26.55.0", "name": "r", "description": "",
        "settings": st, "bodies": bodies, "pulleys": [], "connectors": connectors, "contactPairs": [],
        "view": {"center": {"x": 0, "y": 0}, "pixelsPerMeter": 80}, "watch": [], "annotations": []
    })
    .to_string()
}

fn run(text: &str) -> SimulationRun {
    let (s, _) = parse_scene(text).expect("scene");
    simulate(&s, SimOptions::default()).expect("run")
}

fn last_state(run: &SimulationRun) -> Vec<f64> {
    let size = run.size;
    let c = run.frames.iter().flatten().last().unwrap();
    c.states[(c.count - 1) * size..c.count * size].to_vec()
}

#[test]
fn mass_spectrometer_lands_at_twice_the_radius() {
    // accelerated from rest through U = E·d = 1 V, then a half circle in B = 1 T: lands at y = −2r with
    // r = √(2mU/q)/B. Two masses: 1 kg and 4 kg (radius ratio 2).
    for m in [1.0, 4.0] {
        let regions = json!([
            {"id": "acc", "name": "加速电场", "kind": "field", "shape": "rect", "x": -0.5, "y": 0, "w": 1, "h": 2, "E": {"x": 1, "y": 0}, "B": 0},
            {"id": "mag", "name": "偏转磁场", "kind": "field", "shape": "rect", "x": 5, "y": 0, "w": 10, "h": 20, "E": {"x": 0, "y": 0}, "B": 1}
        ]);
        let r = run(&scene(vec![particle("p", -1.0 + 1e-9, 0.0, 0.0, 0.0, m, 1.0, 0.01)], vec![], json!({"regions": regions}), 30.0));
        // the event where the particle leaves the magnetic region again
        let ev = r
            .events
            .iter()
            .filter(|e| e.changes.iter().any(|c| c.ty == Some(ChangeType::ZoneLeave) && c.subject == "mag"))
            .next()
            .expect("leaves the magnetic region");
        let n = r.system.n;
        let (x, y) = (ev.after[0], ev.after[1]);
        let _ = n;
        let u = 1.0 - 1e-9;
        let v = (2.0 * u / m).sqrt();
        let radius = m * v / 1.0;
        assert!(x.abs() < 1e-9, "on the boundary: x = {x}");
        assert!((y + 2.0 * radius).abs() < 1e-8 * radius, "m = {m}: y = {y}, expected {}", -2.0 * radius);
        // the time in the field is half a period πm/(qB)
        let enter = r.events.iter().find(|e| e.changes.iter().any(|c| c.ty == Some(ChangeType::ZoneEnter) && c.subject == "mag")).unwrap();
        assert!(((ev.t - enter.t) - std::f64::consts::PI * m).abs() < 1e-8, "half period");
    }
}

#[test]
fn cyclotron_gains_energy_each_gap_crossing() {
    // B = 1 T in two dees, an alternating E in the gap at ω = qB/m: each crossing adds about qU
    let regions = json!([
        {"id": "d1", "name": "D1", "kind": "field", "shape": "rect", "x": -2.05, "y": 0, "w": 4, "h": 8, "B": 1},
        {"id": "d2", "name": "D2", "kind": "field", "shape": "rect", "x": 2.05, "y": 0, "w": 4, "h": 8, "B": 1},
        {"id": "gap", "name": "加速缝", "kind": "field", "shape": "rect", "x": 0, "y": 0, "w": 0.1, "h": 8, "E": {"x": 10, "y": 0}, "omega": 1, "phase": 0}
    ]);
    let r = run(&scene(vec![particle("p", -0.04, 0.0, 0.0, 0.0, 1.0, 1.0, 0.005)], vec![], json!({"regions": regions}), 20.0));
    assert!(r.error.is_none(), "{:?}", r.error);
    let x = last_state(&r);
    let ek = 0.5 * (x[3] * x[3] + x[4] * x[4]);
    // several crossings at a fraction of the peak voltage 1 V each: clearly gained energy
    assert!(ek > 2.0, "Ek = {ek}");
    // the ledger: the work of the gap field equals the kinetic energy (B does no work)
    let l = ledger_at(&r.system, &x, 0.0);
    let e = l.extra.unwrap();
    assert!((e[0] - ek).abs() < 1e-7 * ek, "field work {} vs Ek {ek}", e[0]);
    assert!((l.applied_work - e[0]).abs() < 1e-12);
}

#[test]
fn rail_loop_terminal_velocity_and_energy() {
    // a rod of 0.5 kg on horizontal rails pulled by a constant 2 N; B = 1 T, L = 0.5 m, R = 0.25 Ω:
    // k = B²L²/R = 1 N·s/m, terminal speed F/k = 2 m/s; v(t) = 2(1 − e^(−kt/m))
    let rod = block("rod", 0.0, 0.0, 0.1, 0.5, 0.5, 0.0, 0.0, true);
    let force = json!({"id": "f", "name": "F", "type": "force", "a": {"body": "rod", "local": {"x": 0, "y": 0}}, "force": {"x": 2, "y": 0}});
    let rails = json!([{"id": "rl", "name": "导轨", "body": "rod", "angle": 0, "L": 0.5, "R": 0.25, "B": 1}]);
    let r = run(&scene(vec![rod], vec![force], json!({"railLoops": rails}), 5.0));
    assert!(r.error.is_none(), "{:?}", r.error);
    let x = last_state(&r);
    let t = 5.0;
    let v = 2.0 * (1.0 - (-2.0f64 * t).exp());
    assert!((x[3] - v).abs() < 1e-8, "v = {}", x[3]);
    // F·s = ½mv² + Joule heat
    let l = ledger_at(&r.system, &x, 0.0);
    let joule = l.extra.unwrap()[2];
    assert!((l.applied_work - (0.5 * 0.5 * x[3] * x[3] + joule)).abs() < 1e-8, "balance {}", l.balance);
    let x0 = velophi_core::dynamics::initial_state(&r.system);
    assert!((l.balance - ledger_at(&r.system, &x0, 0.0).balance).abs() < 1e-8);
}

#[test]
fn floating_block_draft_and_archimedes() {
    // a block 0.2 m × 0.1 m of 6 kg with thickness 0.1 m: density 6000/(0.02·0.1)… use 1.2 kg: density 600 kg/m³ in
    // water (1000): it floats with 60 % of its height submerged
    let b = block("b", 0.0, 0.2, 0.2, 0.1, 1.2, 0.0, 0.0, true);
    let regions = json!([{"id": "w", "name": "水", "kind": "liquid", "shape": "rect", "x": 0, "y": -0.5, "w": 4, "h": 1, "density": 1000, "depth": 0.1, "dragLinear": 20, "dragQuadratic": 0}]);
    let r = run(&scene(vec![b], vec![], json!({"gravity": {"x": 0, "y": -9.8}, "regions": regions}), 20.0));
    assert!(r.error.is_none(), "{:?}", r.error);
    let x = last_state(&r);
    // centre at depth: draft 0.06 below the surface → centre at y = 0.05 − 0.06 = −0.01
    assert!((x[1] + 0.01).abs() < 1e-6, "y = {}", x[1]);
    assert!(x[4].abs() < 1e-6, "at rest");
    // the energy ledger closes: E_mech + liquid drag heat − buoyancy work is constant
    let l = ledger_at(&r.system, &x, 0.0);
    let x0 = velophi_core::dynamics::initial_state(&r.system);
    let l0 = ledger_at(&r.system, &x0, 0.0);
    assert!((l.balance - l0.balance).abs() < 1e-6, "balance {} → {}", l0.balance, l.balance);
    let e = l.extra.unwrap();
    assert!(e[1] < 0.0 && e[3] > 0.0, "buoyancy did negative work on the sinking block, drag heated the water");
}
