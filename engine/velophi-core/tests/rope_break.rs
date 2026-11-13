//! 26.63 (D231): a rope with a tension limit (`maxTension`) breaks when the tension reaches it and never pulls again.
//! Checked on a pendulum released from the horizontal, where T = 3·m·g·cos φ (φ from the vertical): with a limit of
//! 2·m·g the rope breaks at cos φ = 2/3 and the ball goes on as a projectile.

use serde_json::{json, Value};
use velophi_core::scene::parse_scene;
use velophi_core::simulation::{simulate, ChangeType, SimOptions, SimulationRun};

const G: f64 = 9.8;

fn scene(integrator: &str, step: f64, limit: Option<f64>, x0: f64, y0: f64, duration: f64) -> String {
    let ball = json!({
        "id": "ball", "name": "ball", "kind": "rigid", "role": "block", "shape": {"type": "circle", "radius": 0.05},
        "position": {"x": x0, "y": y0}, "angle": 0, "velocity": {"x": 0, "y": 0}, "angularVelocity": 0, "mass": 1, "inertia": null,
        "fixedRotation": true, "material": {"muS": 0, "muK": 0, "restitution": 0}, "beltSpeed": 0, "color": "#3b82f6"
    });
    let mut rope = json!({
        "id": "rope", "name": "rope", "type": "rope", "a": {"body": null, "local": {"x": 0, "y": 2}}, "b": {"body": "ball", "local": {"x": 0, "y": 0}},
        "pulleys": [], "length": 1
    });
    if let Some(v) = limit {
        rope["maxTension"] = json!(v);
    }
    json!({
        "format": "velophi-scene", "version": 7, "dimension": 2, "engine": "26.63.0", "name": "break", "description": "",
        "settings": {"gravity": {"x": 0, "y": -G}, "outputStep": step, "integrator": integrator, "relTol": 1e-10, "absTol": 1e-12,
            "duration": duration, "stopAt": null, "legacyDuration": 2, "energyZeroY": 0},
        "bodies": [ball], "pulleys": [], "connectors": [rope], "contactPairs": [],
        "view": {"center": {"x": 0, "y": 0}, "pixelsPerMeter": 80}, "watch": [], "annotations": []
    })
    .to_string()
}

fn run(text: &str) -> SimulationRun {
    let (s, _) = parse_scene(text).expect("scene");
    let r = simulate(&s, SimOptions::default()).expect("run");
    assert!(r.error.is_none(), "run error: {:?}", r.error);
    r
}

fn states(run: &SimulationRun) -> Vec<Vec<f64>> {
    let size = run.size;
    let mut out = Vec::new();
    for c in run.frames.iter().flatten() {
        for k in 0..c.count {
            out.push(c.states[k * size..(k + 1) * size].to_vec());
        }
    }
    out
}

fn breaks(run: &SimulationRun) -> Vec<(f64, Vec<f64>)> {
    run.events.iter().filter(|e| e.changes.iter().any(|c| c.ty == Some(ChangeType::Break))).map(|e| (e.t, e.after.clone())).collect()
}

fn energy(x: &[f64]) -> f64 {
    0.5 * (x[3] * x[3] + x[4] * x[4]) + G * x[1]
}

#[test]
fn pendulum_rope_breaks_where_the_tension_reaches_the_limit() {
    let r = run(&scene("dopri5", 0.002, Some(2.0 * G), 1.0, 2.0, 1.5));
    let b = breaks(&r);
    assert_eq!(b.len(), 1, "one break");
    let (t, x) = (&b[0].0, &b[0].1);
    // cos φ = 2/3: height 2 − 2/3, speed² = 2·g·(2/3), velocity along the tangent
    let c = 2.0 / 3.0;
    let s = (1.0f64 - c * c).sqrt();
    let v = (2.0 * G * c).sqrt();
    assert!((x[1] - (2.0 - c)).abs() < 1e-6, "height at the break {}", x[1]);
    assert!((x[0] - s).abs() < 1e-6, "x at the break {}", x[0]);
    assert!((x[3] + v * c).abs() < 1e-6 && (x[4] + v * s).abs() < 1e-6, "velocity at the break {} {}", x[3], x[4]);
    // afterwards a projectile: constant horizontal velocity, free fall, energy kept, and the rope never pulls again
    let after: Vec<Vec<f64>> = states(&r).into_iter().filter(|q| q[r.size - 1].is_finite()).collect();
    let last = after.last().unwrap();
    let dt = 1.5 - t;
    assert!((last[3] + v * c).abs() < 1e-7, "vx stays {}", last[3]);
    assert!((last[4] - (-v * s - G * dt)).abs() < 1e-6, "vy in free fall {}", last[4]);
    assert!((last[0] - (s - v * c * dt)).abs() < 1e-6, "x of the projectile {}", last[0]);
    assert!((energy(last) - G * 2.0).abs() < 1e-6, "energy {}", energy(last));
    // far outside the rope's reach at the end
    let d = (last[0].powi(2) + (last[1] - 2.0).powi(2)).sqrt();
    assert!(d > 1.5, "distance from the anchor {d}");
    assert!(r.events.iter().all(|e| !e.changes.iter().any(|c| c.ty == Some(ChangeType::Taut))), "a broken rope does not go taut");
}

#[test]
fn a_rope_without_a_limit_or_below_it_holds() {
    for limit in [None, Some(3.5 * G)] {
        let r = run(&scene("dopri5", 0.002, limit, 1.0, 2.0, 1.5));
        assert!(breaks(&r).is_empty());
        let last = states(&r).pop().unwrap();
        let d = (last[0].powi(2) + (last[1] - 2.0).powi(2)).sqrt();
        assert!((d - 1.0).abs() < 1e-6, "still on the rope: {d}");
    }
}

#[test]
fn a_rope_loaded_beyond_its_limit_from_the_start_breaks_at_once() {
    // hanging at rest: T = m·g = 9.8 N > 5 N
    let r = run(&scene("dopri5", 0.002, Some(5.0), 0.0, 1.0, 0.5));
    let b = breaks(&r);
    assert_eq!(b.len(), 1);
    assert_eq!(b[0].0, 0.0);
    let last = states(&r).pop().unwrap();
    assert!((last[1] - (1.0 - 0.5 * G * 0.25)).abs() < 1e-7, "free fall from the start: {}", last[1]);
}

#[test]
fn the_stepping_solvers_break_the_rope_within_a_step() {
    let c = 2.0 / 3.0;
    for integrator in ["moreau", "softstep"] {
        let r = run(&scene(integrator, 0.001, Some(2.0 * G), 1.0, 2.0, 1.5));
        let last = states(&r).pop().unwrap();
        let d = (last[0].powi(2) + (last[1] - 2.0).powi(2)).sqrt();
        assert!(d > 1.4, "{integrator}: the ball left the rope ({d})");
        // horizontal velocity of the projectile: −v·cos φ at the break, to the accuracy of the step
        let v = (2.0 * G * c).sqrt();
        assert!((last[3] + v * c).abs() < 0.05, "{integrator}: vx {}", last[3]);
        // and with a rope that holds the ball stays on it
        let hold: Value = serde_json::from_str(&scene(integrator, 0.001, Some(3.5 * G), 1.0, 2.0, 1.5)).unwrap();
        let r2 = run(&hold.to_string());
        let l2 = states(&r2).pop().unwrap();
        let d2 = (l2[0].powi(2) + (l2[1] - 2.0).powi(2)).sqrt();
        assert!(d2 < 1.01, "{integrator}: holds ({d2})");
    }
}
