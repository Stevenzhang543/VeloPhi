//! 26.59 fix 3 (D193): exact circular arc tracks — the concave inner side (groove, loop, bowl) and the convex outer
//! side (hump) — checked against the textbook results. Scenes without arcs are untouched (parity tests).

use serde_json::{json, Value};
use velophi_core::scene::parse_scene;
use velophi_core::simulation::{simulate, ChangeType, SimOptions, SimulationRun};

const G: f64 = 9.8;
const PI: f64 = std::f64::consts::PI;

fn ball(id: &str, x: f64, y: f64, vx: f64, vy: f64, r: f64, kind: &str) -> Value {
    json!({
        "id": id, "name": id, "kind": kind, "role": "block",
        "shape": {"type": "circle", "radius": r},
        "position": {"x": x, "y": y}, "angle": 0, "velocity": {"x": vx, "y": vy}, "angularVelocity": 0,
        "mass": 1, "inertia": null, "fixedRotation": false,
        "material": {"muS": 0, "muK": 0, "restitution": 0}, "beltSpeed": 0, "color": "#3b82f6"
    })
}

#[allow(clippy::too_many_arguments)]
fn arc(id: &str, kind: &str, x: f64, y: f64, radius: f64, thickness: f64, start: f64, sweep: f64, center: (f64, f64), mass: f64, fixed_rotation: bool) -> Value {
    json!({
        "id": id, "name": id, "kind": kind, "role": "ground",
        "shape": {"type": "arc", "radius": radius, "thickness": thickness, "start": start, "sweep": sweep, "center": {"x": center.0, "y": center.1}},
        "position": {"x": x, "y": y}, "angle": 0, "velocity": {"x": 0, "y": 0}, "angularVelocity": 0,
        "mass": mass, "inertia": null, "fixedRotation": fixed_rotation,
        "material": {"muS": 0, "muK": 0, "restitution": 0}, "beltSpeed": 0, "color": "#94a3b8"
    })
}

fn block(id: &str, x: f64, y: f64, w: f64, h: f64, kind: &str) -> Value {
    json!({
        "id": id, "name": id, "kind": kind, "role": "block",
        "shape": {"type": "box", "width": w, "height": h},
        "position": {"x": x, "y": y}, "angle": 0, "velocity": {"x": 0, "y": 0}, "angularVelocity": 0,
        "mass": 1, "inertia": null, "fixedRotation": false,
        "material": {"muS": 0, "muK": 0, "restitution": 0}, "beltSpeed": 0, "color": "#3b82f6"
    })
}

fn scene(bodies: Vec<Value>, duration: f64) -> String {
    json!({
        "format": "velophi-scene", "version": 6, "dimension": 2, "engine": "26.59.0", "name": "arc", "description": "",
        "settings": {
            "gravity": {"x": 0, "y": -G}, "outputStep": 0.002, "integrator": "dopri5", "relTol": 1e-10, "absTol": 1e-12,
            "duration": duration, "stopAt": null, "legacyDuration": 5, "energyZeroY": 0
        },
        "bodies": bodies, "pulleys": [], "connectors": [], "contactPairs": [],
        "view": {"center": {"x": 0, "y": 0}, "pixelsPerMeter": 80}, "watch": [], "annotations": []
    })
    .to_string()
}

fn run(text: &str) -> SimulationRun {
    let (s, _) = parse_scene(text).expect("scene");
    simulate(&s, SimOptions::default()).expect("run")
}

/// Every output state (t, x).
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

fn has(run: &SimulationRun, ty: ChangeType) -> Vec<&velophi_core::simulation::SimEvent> {
    run.events.iter().filter(|e| e.changes.iter().any(|c| c.ty == Some(ty))).collect()
}

#[test]
fn half_pipe_keeps_energy_and_speed_at_the_bottom() {
    // Half pipe of inner radius R about (0, R); a small ball (r) starts at rest touching the left rim at the centre's
    // height. Smooth and a particle: at the bottom v = √(2g(R − r)); it rises to the same height on the right.
    let (rr, r) = (1.0, 0.05);
    let rho = rr - r;
    let text = scene(vec![arc("pipe", "static", 0.0, rr, rr, 0.1, PI, PI, (0.0, 0.0), 0.0, false), ball("b", -rho, rr, 0.0, 0.0, r, "particle")], 1.2);
    let run = run(&text);
    let st = states(&run);
    let n = run.system.n;
    assert_eq!(n, 1);
    let mut lowest = (f64::INFINITY, 0.0);
    let mut right_top: f64 = f64::NEG_INFINITY;
    for (_, x) in &st {
        let (px, py, vx, vy) = (x[0], x[1], x[3], x[4]);
        // The ball's centre stays on the circle of radius R − r while it is in the pipe
        let d = (px * px + (py - rr) * (py - rr)).sqrt();
        assert!((d - rho).abs() < 1e-6, "off the circle: {d} at ({px}, {py})");
        if py < lowest.0 {
            lowest = (py, (vx * vx + vy * vy).sqrt());
        }
        if px > 0.0 {
            right_top = right_top.max(py);
        }
    }
    let v_bottom = (2.0 * G * rho).sqrt();
    assert!((lowest.0 - r).abs() < 1e-4, "lowest point {}", lowest.0);
    assert!((lowest.1 - v_bottom).abs() < 1e-3, "speed at the bottom {} vs {v_bottom}", lowest.1);
    assert!((right_top - rr).abs() < 1e-5, "rises to {right_top} (released at {rr})");
    // It can only leave the wall at a rim, where the normal force has fallen to zero
    for e in has(&run, ChangeType::Separate) {
        assert!((e.after[1] - rr).abs() < 1e-5, "left the wall at y = {}", e.after[1]);
    }
}

#[test]
fn ball_leaves_a_hump_where_cos_theta_is_two_thirds() {
    // Ball on top of a smooth convex arc (outer radius R) with a tiny push: it leaves the surface where
    // cos θ = (v₀²/(gρ) + 2)/3, ρ = R + r.
    let (r_out, r, v0) = (1.0, 0.05, 0.05);
    let rho = r_out + r;
    let text = scene(vec![arc("hump", "static", 0.0, 0.0, 0.9, 0.1, 0.0, PI, (0.0, 0.0), 0.0, false), ball("b", 0.0, rho, v0, 0.0, r, "particle")], 2.0);
    let run = run(&text);
    let sep = has(&run, ChangeType::Separate);
    assert!(!sep.is_empty(), "the ball leaves the hump");
    let x = &sep[0].after;
    let cos_t = x[1] / (x[0] * x[0] + x[1] * x[1]).sqrt();
    let expect = (v0 * v0 / (G * rho) + 2.0) / 3.0;
    assert!((cos_t - expect).abs() < 1e-6, "leaves at cos θ = {cos_t}, expected {expect}");
    // Afterwards the ball is never inside the hump
    for (_, s) in states(&run) {
        let d = (s[0] * s[0] + s[1] * s[1]).sqrt();
        if s[1] > 0.0 {
            assert!(d > rho - 1e-7, "inside the hump: {d}");
        }
    }
}

#[test]
fn loop_too_slow_leaves_at_cos_minus_two_thirds() {
    // Full ring (vertical loop) of inner radius R about (0, R); a ball at the bottom with v₀² = 4gρ (less than the
    // 5gρ needed) leaves the wall where cos φ = −2/3 (φ from the bottom).
    let (rr, r) = (1.0, 0.05);
    let rho = rr - r;
    let v0 = (4.0 * G * rho).sqrt();
    let text = scene(vec![arc("loop", "static", 0.0, rr, rr, 0.1, 0.0, 2.0 * PI, (0.0, 0.0), 0.0, false), ball("b", 0.0, rr - rho, v0, 0.0, r, "particle")], 1.5);
    let run = run(&text);
    let sep = has(&run, ChangeType::Separate);
    assert!(!sep.is_empty(), "the ball leaves the wall");
    let x = &sep[0].after;
    let (dx, dy) = (x[0], x[1] - rr);
    let cos_phi = -dy / (dx * dx + dy * dy).sqrt();
    assert!((cos_phi + 2.0 / 3.0).abs() < 1e-6, "leaves at cos φ = {cos_phi}");
}

#[test]
fn loop_fast_enough_goes_round() {
    // v₀² = 6gρ: never leaves, and at the top v² = 2gρ.
    let (rr, r) = (1.0, 0.05);
    let rho = rr - r;
    let v0 = (6.0 * G * rho).sqrt();
    let text = scene(vec![arc("loop", "static", 0.0, rr, rr, 0.1, 0.0, 2.0 * PI, (0.0, 0.0), 0.0, false), ball("b", 0.0, rr - rho, v0, 0.0, r, "particle")], 1.0);
    let run = run(&text);
    assert!(has(&run, ChangeType::Separate).is_empty(), "stays on the wall");
    let st = states(&run);
    let top = st.iter().max_by(|a, b| a.1[1].partial_cmp(&b.1[1]).unwrap()).unwrap();
    let v2 = top.1[3] * top.1[3] + top.1[4] * top.1[4];
    assert!((top.1[1] - (rr + rho)).abs() < 1e-4, "top at {}", top.1[1]);
    assert!((v2 - 2.0 * G * rho).abs() < 1e-2, "v² at the top {v2}");
}

#[test]
fn ball_dropped_on_a_hump_lands_on_its_surface() {
    // Dropped next to the top of a convex arc: the impact is found on the arc, not inside it.
    let text = scene(vec![arc("hump", "static", 0.0, 0.0, 0.9, 0.1, 0.0, PI, (0.0, 0.0), 0.0, false), ball("b", 0.3, 2.0, 0.0, 0.0, 0.05, "particle")], 1.0);
    let run = run(&text);
    let imp = has(&run, ChangeType::Impact);
    assert!(!imp.is_empty(), "hits the hump");
    let x = &imp[0].before;
    let d = (x[0] * x[0] + x[1] * x[1]).sqrt();
    assert!((d - 1.05).abs() < 1e-7, "impact at distance {d}");
}

#[test]
fn box_dropped_on_a_hump_meets_the_outer_side() {
    // A box falls flat onto the top of a convex arc: its bottom face meets the arc's outer side (not a corner).
    let text = scene(vec![arc("hump", "static", 0.0, 0.0, 0.9, 0.1, 0.0, PI, (0.0, 0.0), 0.0, false), block("k", 0.0, 1.5, 0.4, 0.2, "rigid")], 0.5);
    let run = run(&text);
    let imp = has(&run, ChangeType::Impact);
    assert!(!imp.is_empty(), "hits the hump");
    let y = imp[0].before[1];
    assert!((y - 1.1).abs() < 1e-7, "box centre at impact {y} (outer radius 1 + half height 0.1)");
}

#[test]
fn box_rests_in_a_bowl_on_two_corners() {
    // A box lowered into a bowl (half ring below its centre) settles on two corners and stays there.
    let (rr, w, h): (f64, f64, f64) = (1.0, 0.8, 0.2);
    // Corners touch the circle: (w/2)² + (y − h/2)² = R² below the centre
    let y_rest = -(rr * rr - w * w / 4.0).sqrt() + h / 2.0;
    let text = scene(vec![arc("bowl", "static", 0.0, 0.0, rr, 0.1, PI, PI, (0.0, 0.0), 0.0, false), block("k", 0.0, y_rest + 0.05, w, h, "rigid")], 2.0);
    let run = run(&text);
    let st = states(&run);
    let last = &st.last().unwrap().1;
    assert!((last[0]).abs() < 1e-6 && (last[1] - y_rest).abs() < 1e-6 && last[2].abs() < 1e-6, "rests at {:?}, expected y {y_rest}", &last[..3]);
}

#[test]
fn movable_groove_keeps_horizontal_momentum() {
    // A half-pipe groove (mass 3) on a smooth floor, free to slide but not to turn, and a ball (mass 1) released at
    // its rim: total horizontal momentum stays zero, and the ball reaches the other rim at the same height.
    let (rr, r, t): (f64, f64, f64) = (1.0, 0.05, 0.1);
    // The groove's centre of mass is the body origin: the arc centre lies d above it
    let a: f64 = PI / 2.0;
    let d = 2.0 / 3.0 * ((rr + t).powi(3) - rr.powi(3)) / ((rr + t).powi(2) - rr * rr) * a.sin() / a;
    let gy = rr + t - d; // the groove's lowest point (outer radius below the arc centre) rests on the floor at y = 0
    let floor = json!({
        "id": "floor", "name": "floor", "kind": "static", "role": "ground",
        "shape": {"type": "box", "width": 20, "height": 1}, "position": {"x": 0, "y": -0.5}, "angle": 0,
        "velocity": {"x": 0, "y": 0}, "angularVelocity": 0, "mass": 0, "inertia": null, "fixedRotation": false,
        "material": {"muS": 0, "muK": 0, "restitution": 0}, "beltSpeed": 0, "color": "#94a3b8"
    });
    let mut groove = arc("groove", "rigid", 0.0, gy, rr, t, PI, PI, (0.0, d), 3.0, true);
    groove["role"] = json!("block");
    let rho = rr - r;
    let text = scene(vec![floor, groove, ball("b", -rho, gy + d, 0.0, 0.0, r, "particle")], 1.5);
    let run = run(&text);
    let st = states(&run);
    let n = run.system.n;
    let gi = 0; // dynamic slot of the groove (bodies in order: groove, ball)
    let bi = 1;
    let mut max_rise: f64 = f64::NEG_INFINITY;
    for (_, x) in &st {
        let p = 3.0 * x[3 * n + 3 * gi] + x[3 * n + 3 * bi];
        assert!(p.abs() < 1e-7, "horizontal momentum {p}");
        if x[3 * bi] - x[3 * gi] > 0.0 {
            max_rise = max_rise.max(x[3 * bi + 1] - x[3 * gi + 1]);
        }
        // The groove stays on the floor
        assert!((x[3 * gi + 1] - gy).abs() < 1e-7, "groove lifted to {}", x[3 * gi + 1]);
    }
    assert!((max_rise - d).abs() < 1e-5, "rises to {max_rise} above the groove's origin (released at {d})");
}

#[test]
fn rolling_disc_in_a_half_pipe() {
    // A disc (I = ½mr²) rolling without slipping inside the pipe: at the bottom v² = (4/3)·g·(R − r), ω = v/r.
    let (rr, r) = (1.0, 0.1);
    let rho = rr - r;
    let mut pipe = arc("pipe", "static", 0.0, rr, rr, 0.1, PI, PI, (0.0, 0.0), 0.0, false);
    pipe["material"] = json!({"muS": 0.8, "muK": 0.6, "restitution": 0});
    let mut b = ball("b", -rho * (PI / 3.0).cos(), rr - rho * (PI / 3.0).sin(), 0.0, 0.0, r, "rigid");
    b["material"] = json!({"muS": 0.8, "muK": 0.6, "restitution": 0});
    // Released at 60° below the horizontal: the centre drops by ρ·(1 − sin 60°)
    let text = scene(vec![pipe, b], 0.8);
    let run = run(&text);
    assert!(has(&run, ChangeType::Slip).is_empty(), "rolls without slipping");
    let st = states(&run);
    let low = st.iter().min_by(|a, b| a.1[1].partial_cmp(&b.1[1]).unwrap()).unwrap();
    let h = rho * (1.0 - (PI / 3.0).sin());
    let v = (low.1[3] * low.1[3] + low.1[4] * low.1[4]).sqrt();
    assert!((v * v - 4.0 / 3.0 * G * h).abs() < 1e-3, "v² at the bottom {} vs {}", v * v, 4.0 / 3.0 * G * h);
    assert!((low.1[5].abs() - v / r).abs() < 1e-2, "ω {} vs v/r {}", low.1[5], v / r);
}

#[test]
fn many_body_world_keeps_balls_in_a_bowl() {
    // The many-body solver sees an arc as thin convex pieces: balls dropped into a bowl stay inside it.
    let mut bodies = vec![arc("bowl", "static", 0.0, 1.0, 1.0, 0.1, PI, PI, (0.0, 0.0), 0.0, false)];
    for i in 0..6 {
        let mut b = ball(&format!("b{i}"), -0.5 + 0.2 * i as f64, 1.5 + 0.1 * i as f64, 0.0, 0.0, 0.08, "rigid");
        b["material"] = json!({"muS": 0.3, "muK": 0.2, "restitution": 0.1});
        bodies.push(b);
    }
    let mut v: Value = serde_json::from_str(&scene(bodies, 4.0)).unwrap();
    v["settings"]["integrator"] = json!("softstep");
    v["settings"]["outputStep"] = json!(1.0 / 60.0);
    let run = run(&v.to_string());
    let st = states(&run);
    let last = &st.last().unwrap().1;
    for i in 0..6 {
        let (x, y) = (last[3 * i], last[3 * i + 1]);
        let d = (x * x + (y - 1.0) * (y - 1.0)).sqrt();
        assert!(d < 1.0 - 0.08 + 0.01 && y < 1.0, "ball {i} at ({x}, {y}), {d} from the centre");
    }
}
