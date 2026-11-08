//! 26.60 r2 (D208): a spring that is not fastened to the body (不粘连) pushes it away and lets go at its rest length; a
//! body sliding back presses on it again. Checked against x·√(k/m), the quarter period and energy conservation.

use serde_json::json;
use velophi_core::scene::parse_scene;
use velophi_core::simulation::{simulate, ChangeType, SimOptions, SimulationRun};

fn scene(push_only: bool, block_x: f64, vx: f64, duration: f64) -> String {
    let floor = json!({
        "id": "floor", "name": "floor", "kind": "static", "role": "ground", "shape": {"type": "box", "width": 20, "height": 1},
        "position": {"x": 5, "y": -0.5}, "angle": 0, "velocity": {"x": 0, "y": 0}, "angularVelocity": 0, "mass": 0, "inertia": null,
        "fixedRotation": false, "material": {"muS": 0, "muK": 0, "restitution": 0}, "beltSpeed": 0, "color": "#94a3b8"
    });
    let block = json!({
        "id": "block", "name": "block", "kind": "rigid", "role": "block", "shape": {"type": "box", "width": 0.2, "height": 0.2},
        "position": {"x": block_x, "y": 0.1}, "angle": 0, "velocity": {"x": vx, "y": 0}, "angularVelocity": 0, "mass": 1, "inertia": null,
        "fixedRotation": true, "material": {"muS": 0, "muK": 0, "restitution": 0}, "beltSpeed": 0, "color": "#3b82f6"
    });
    let mut spring = json!({
        "id": "sp", "name": "spring", "type": "spring", "a": {"body": null, "local": {"x": 0, "y": 0.1}}, "b": {"body": "block", "local": {"x": -0.1, "y": 0}},
        "stiffness": 100, "restLength": 0.5, "damping": 0
    });
    if push_only {
        spring["pushOnly"] = json!(true);
    }
    json!({
        "format": "velophi-scene", "version": 6, "dimension": 2, "engine": "26.60.0", "name": "push", "description": "",
        "settings": {"gravity": {"x": 0, "y": -9.8}, "outputStep": 0.002, "integrator": "dopri5", "relTol": 1e-10, "absTol": 1e-12,
            "duration": duration, "stopAt": null, "legacyDuration": 2, "energyZeroY": 0},
        "bodies": [floor, block], "pulleys": [], "connectors": [spring], "contactPairs": [],
        "view": {"center": {"x": 0, "y": 0}, "pixelsPerMeter": 80}, "watch": [], "annotations": []
    })
    .to_string()
}

fn run(text: &str) -> SimulationRun {
    let (s, _) = parse_scene(text).expect("scene");
    simulate(&s, SimOptions::default()).expect("run")
}

fn states(run: &SimulationRun) -> Vec<(f64, Vec<f64>)> {
    let size = run.size;
    let mut out = Vec::new();
    for c in run.frames.iter().flatten() {
        for k in 0..c.count {
            out.push(((c.first + k as u64) as f64, c.states[k * size..(k + 1) * size].to_vec()));
        }
    }
    out
}

fn times(run: &SimulationRun, ty: ChangeType) -> Vec<f64> {
    run.events.iter().filter(|e| e.changes.iter().any(|c| c.ty == Some(ty))).map(|e| e.t).collect()
}

#[test]
fn compressed_spring_lets_go_at_its_rest_length() {
    // Compressed by 0.2 m (k = 100 N/m, m = 1 kg): it lets go after a quarter period π/20 s at v = 0.2·10 = 2 m/s
    let r = run(&scene(true, 0.4, 0.0, 1.0));
    let rel = times(&r, ChangeType::SpringRelease);
    assert_eq!(rel.len(), 1, "one release: {rel:?}");
    assert!((rel[0] - std::f64::consts::PI / 20.0).abs() < 1e-7, "released at {}", rel[0]);
    let n = r.system.n;
    let st = states(&r);
    let last = &st.last().unwrap().1;
    assert!((last[3 * n] - 2.0).abs() < 1e-7, "speed after {}", last[3 * n]);
    // A fastened spring pulls it back instead
    let r2 = run(&scene(false, 0.4, 0.0, 1.0));
    assert!(times(&r2, ChangeType::SpringRelease).is_empty());
    let max_x = states(&r2).iter().map(|(_, x)| x[0]).fold(f64::NEG_INFINITY, f64::max);
    assert!((max_x - 0.8).abs() < 1e-6, "the fastened spring pulls it back at 0.8 m, not {max_x}");
}

#[test]
fn block_coming_back_presses_on_the_free_end() {
    // At 0.9 m (free end at 0.5 m) moving left at 1 m/s: touches after 0.3 s, comes back after half a period π/10 s,
    // leaves again at 1 m/s
    let r = run(&scene(true, 0.9, -1.0, 1.2));
    let press = times(&r, ChangeType::SpringPress);
    let rel = times(&r, ChangeType::SpringRelease);
    assert_eq!(press.len(), 1, "{press:?}");
    assert_eq!(rel.len(), 1, "{rel:?}");
    assert!((press[0] - 0.3).abs() < 1e-7, "pressed at {}", press[0]);
    assert!((rel[0] - press[0] - std::f64::consts::PI / 10.0).abs() < 1e-7, "released at {}", rel[0]);
    let n = r.system.n;
    let st = states(&r);
    assert!((st.last().unwrap().1[3 * n] - 1.0).abs() < 1e-7);
    // The block never goes further than the compression v·√(m/k) = 0.1 m
    let min_x = st.iter().map(|(_, x)| x[0]).fold(f64::INFINITY, f64::min);
    assert!((min_x - 0.5).abs() < 1e-4, "closest {min_x}");
}
