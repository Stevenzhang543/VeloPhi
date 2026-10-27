//! 26.54 (D78): charges in uniform electric and magnetic fields and the Coulomb force, checked against the
//! analytic solutions (circular motion in B, parabola in E, velocity selector) and against energy conservation
//! (Coulomb scattering with electric potential energy). The TypeScript reference has none of this (D77).

use serde_json::{json, Value};
use velophi_core::dynamics::energy;
use velophi_core::kinematics::compute_poses;
use velophi_core::scene::parse_scene;
use velophi_core::simulation::{simulate, SimOptions, SimulationRun};

fn particle(id: &str, x: f64, y: f64, vx: f64, vy: f64, m: f64, q: f64, r: f64) -> Value {
    json!({
        "id": id, "name": id, "kind": "particle", "role": "block",
        "shape": {"type": "circle", "radius": r},
        "position": {"x": x, "y": y}, "angle": 0, "velocity": {"x": vx, "y": vy}, "angularVelocity": 0,
        "mass": m, "inertia": null, "fixedRotation": false,
        "material": {"muS": 0, "muK": 0, "restitution": 1}, "beltSpeed": 0, "color": "#3b82f6", "charge": q
    })
}

fn fixed_charge(id: &str, x: f64, y: f64, q: f64, r: f64) -> Value {
    json!({
        "id": id, "name": id, "kind": "static", "role": "block",
        "shape": {"type": "circle", "radius": r},
        "position": {"x": x, "y": y}, "angle": 0, "velocity": {"x": 0, "y": 0}, "angularVelocity": 0,
        "mass": 0, "inertia": null, "fixedRotation": false,
        "material": {"muS": 0, "muK": 0, "restitution": 1}, "beltSpeed": 0, "color": "#ef4444", "charge": q
    })
}

fn scene(bodies: Vec<Value>, settings: Value, duration: f64) -> String {
    let mut st = json!({
        "gravity": {"x": 0, "y": 0}, "outputStep": 0.01, "integrator": "dopri5", "relTol": 1e-10, "absTol": 1e-12,
        "duration": duration, "stopAt": null, "legacyDuration": 5, "energyZeroY": 0
    });
    for (k, v) in settings.as_object().unwrap() {
        st[k] = v.clone();
    }
    json!({
        "format": "velophi-scene", "version": 6, "dimension": 2, "engine": "26.54.0", "name": "e", "description": "",
        "settings": st, "bodies": bodies, "pulleys": [], "connectors": [], "contactPairs": [],
        "view": {"center": {"x": 0, "y": 0}, "pixelsPerMeter": 80}, "watch": [], "annotations": []
    })
    .to_string()
}

/// Every recorded frame as (t, x) where x is the state vector.
fn frames(run: &SimulationRun) -> Vec<(f64, Vec<f64>)> {
    let size = run.size;
    let x_len = 6 * run.system.n;
    let mut out = Vec::new();
    for c in run.frames.iter().flatten() {
        for k in 0..c.count {
            let t = (c.first + k as u64) as f64 * run.dt;
            out.push((t, c.states[k * size..k * size + x_len].to_vec()));
        }
    }
    out
}

fn run(text: &str) -> SimulationRun {
    let (s, _) = parse_scene(text).expect("scene");
    simulate(&s, SimOptions::default()).expect("run")
}

#[test]
fn cyclotron_radius_and_period() {
    // m = 1 kg, q = 1 C, B = 2 T (out of the page), v = 1 m/s → r = mv/(|q|B) = 0.5 m, T = 2πm/(|q|B) = π s.
    // F = q v × B: at v = (1, 0) the force is (0, −2), so the centre is (0, −0.5) and the motion is clockwise.
    let run = run(&scene(vec![particle("p", 0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.02)], json!({"magnetic": {"B": 2}}), 2.0 * std::f64::consts::PI));
    let fr = frames(&run);
    assert!(fr.len() > 600);
    for (t, x) in &fr {
        let (px, py) = (x[0], x[1]);
        let r = (px * px + (py + 0.5) * (py + 0.5)).sqrt();
        assert!((r - 0.5).abs() / 0.5 < 1e-6, "t = {t}: r = {r}");
        let v = (x[3] * x[3] + x[4] * x[4]).sqrt();
        assert!((v - 1.0).abs() < 1e-6, "Lorentz force does no work: v = {v}");
        // analytic position: angle −t·qB/m from the top of the circle
        let (ex, ey) = ((2.0 * t).sin() * 0.5, (2.0 * t).cos() * 0.5 - 0.5);
        assert!(((px - ex).powi(2) + (py - ey).powi(2)).sqrt() < 1e-6 * 0.5, "t = {t}");
    }
}

#[test]
fn deflection_in_uniform_electric_field() {
    // m = 2 kg, q = 0.5 C, E = (0, 4) V/m → a = qE/m = 1 m/s²; v0 = (3, 0): x = 3t, y = t²/2.
    let run = run(&scene(vec![particle("p", 0.0, 0.0, 3.0, 0.0, 2.0, 0.5, 0.02)], json!({"electric": {"E": {"x": 0, "y": 4}}}), 2.0));
    for (t, x) in frames(&run) {
        let (ex, ey) = (3.0 * t, 0.5 * t * t);
        let err = ((x[0] - ex).powi(2) + (x[1] - ey).powi(2)).sqrt();
        assert!(err <= 1e-6 * (ex * ex + ey * ey).sqrt().max(1e-3), "t = {t}: err = {err}");
    }
    // the energy including −qE·r is conserved
    check_energy(&run, 1e-9);
}

#[test]
fn velocity_selector_goes_straight() {
    // E = (0, −2) V/m, B = −1 T (into the page), q = 1 C, v = (2, 0): Fy = q·Ey − q·vx·B = −2 + 2 = 0, so the
    // particle goes straight at v = E/|B|.
    let run = run(&scene(vec![particle("p", 0.0, 0.0, 2.0, 0.0, 1.0, 1.0, 0.02)], json!({"electric": {"E": {"x": 0, "y": -2}}, "magnetic": {"B": -1}}), 3.0));
    for (t, x) in frames(&run) {
        assert!((x[1]).abs() < 1e-9, "t = {t}: y = {}", x[1]);
        assert!((x[0] - 2.0 * t).abs() < 1e-9, "t = {t}");
    }
}

#[test]
fn coulomb_scattering_conserves_energy() {
    // α-like particle scattered by a fixed positive charge: energy (kinetic + Coulomb) conserved, the particle
    // leaves with its initial speed and is deflected away from the nucleus.
    let k = 1.0;
    let run = run(&scene(
        vec![fixed_charge("n", 0.0, 0.0, 1.0, 0.01), particle("a", -6.0, 0.4, 2.0, 0.0, 1.0, 1.0, 0.01)],
        json!({"coulomb": {"k": k}}),
        6.0,
    ));
    check_energy(&run, 1e-7);
    let fr = frames(&run);
    let (_, last) = fr.last().unwrap();
    let n = run.system.n;
    let (vx, vy) = (last[3 * n], last[3 * n + 1]);
    let r: f64 = (last[0] * last[0] + last[1] * last[1]).sqrt();
    // far away: ½mv² + kq₁q₂/r = ½m·v0² + kq₁q₂/r0
    let e0 = 0.5 * 4.0 + k / (36.0f64 + 0.16).sqrt();
    let e1 = 0.5 * (vx * vx + vy * vy) + k / r;
    assert!((e1 - e0).abs() / e0 < 1e-7, "{e0} vs {e1}");
    // Rutherford: tan(θ/2) = k q₁q₂ / (m v0² b) with impact parameter b = 0.4 (for r → ∞; check the angle
    // grows away from the axis: vy > 0)
    assert!(vy > 0.0);
    let theta = vy.atan2(vx);
    let expect = 2.0 * (k / (1.0 * 4.0 * 0.4)).atan();
    // the particle is still at finite distance, so the angle is a little smaller than the asymptotic one
    assert!(theta > 0.8 * expect && theta < expect * 1.0001, "θ = {theta}, Rutherford {expect}");
}

#[test]
fn no_field_scenes_are_not_electric() {
    // a charge without fields or partners leaves the model non-electric (26.53 behaviour, same fingerprint)
    let a = run(&scene(vec![particle("p", 0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.02)], json!({}), 1.0));
    assert!(!a.system.model.electric);
    let b = run(&scene(vec![particle("p", 0.0, 0.0, 1.0, 0.0, 1.0, 0.0, 0.02)], json!({}), 1.0));
    assert_eq!(a.hash, b.hash);
}

fn check_energy(run: &SimulationRun, tol: f64) {
    let model = &run.system.model;
    let mut e0 = None;
    for (t, x) in frames(run) {
        let poses = compute_poses(model, &x);
        let e = energy(&run.system, &x, &poses);
        let base = *e0.get_or_insert(e.total);
        assert!((e.total - base).abs() <= tol * base.abs().max(1.0), "t = {t}: {} vs {base}", e.total);
    }
}
