//! 26.58 (D126–D133): the many-body solver `softstep` checked against analytic results, conservation, stacking,
//! containment, tunnelling, determinism and checkpoint rebuilds (docs/DEV_MANUAL_26_58.md §8).

use serde_json::{json, Value};
use velophi_core::scene::parse_scene;
use velophi_core::simulation::{rebuild_chunk, simulate, SimOptions, SimulationRun, StopReason};

const G: f64 = 9.8;

fn mat(mu_s: f64, mu_k: f64, e: f64) -> Value {
    json!({"muS": mu_s, "muK": mu_k, "restitution": e})
}

fn body(id: &str, kind: &str, shape: Value, x: f64, y: f64, angle: f64, vx: f64, vy: f64, m: f64, material: Value) -> Value {
    json!({
        "id": id, "name": id, "kind": kind, "role": "block", "shape": shape,
        "position": {"x": x, "y": y}, "angle": angle, "velocity": {"x": vx, "y": vy}, "angularVelocity": 0,
        "mass": m, "inertia": null, "fixedRotation": false, "material": material, "beltSpeed": 0, "color": "#3b82f6"
    })
}

fn ball(id: &str, x: f64, y: f64, vx: f64, vy: f64, r: f64, m: f64, material: Value) -> Value {
    body(id, "rigid", json!({"type": "circle", "radius": r}), x, y, 0.0, vx, vy, m, material)
}

fn boxed(id: &str, x: f64, y: f64, w: f64, h: f64, m: f64, material: Value) -> Value {
    body(id, "rigid", json!({"type": "box", "width": w, "height": h}), x, y, 0.0, 0.0, 0.0, m, material)
}

fn wall(id: &str, x: f64, y: f64, w: f64, h: f64, material: Value) -> Value {
    body(id, "static", json!({"type": "box", "width": w, "height": h}), x, y, 0.0, 0.0, 0.0, 0.0, material)
}

fn scene(bodies: Vec<Value>, connectors: Vec<Value>, gravity: f64, duration: Option<f64>, extra: Value) -> String {
    let mut st = json!({
        "gravity": {"x": 0, "y": -gravity}, "outputStep": 1.0 / 60.0, "integrator": "softstep", "relTol": 1e-10,
        "absTol": 1e-12, "duration": duration, "stopAt": null, "legacyDuration": 5, "energyZeroY": 0
    });
    for (k, v) in extra.as_object().unwrap() {
        st[k] = v.clone();
    }
    json!({
        "format": "velophi-scene", "version": 7, "dimension": 2, "engine": "26.58.0", "name": "s", "description": "",
        "settings": st, "bodies": bodies, "pulleys": [], "connectors": connectors, "contactPairs": [],
        "view": {"center": {"x": 0, "y": 0}, "pixelsPerMeter": 80}, "watch": [], "annotations": []
    })
    .to_string()
}

fn run_with(text: &str, opts: SimOptions) -> SimulationRun {
    let (s, _) = parse_scene(text).expect("scene");
    let r = simulate(&s, opts).expect("run");
    assert!(r.error.is_none(), "run error: {:?}", r.error);
    r
}

fn run(text: &str) -> SimulationRun {
    run_with(text, SimOptions::default())
}

fn state(run: &SimulationRun, k: u64) -> Vec<f64> {
    let f = run.chunk_frames as u64;
    let c = run.frames[(k / f) as usize].as_ref().expect("chunk in memory");
    let j = (k - c.first) as usize;
    c.states[j * run.size..(j + 1) * run.size].to_vec()
}

fn last(run: &SimulationRun) -> Vec<f64> {
    state(run, run.k)
}

#[test]
fn free_fall_error_is_first_order() {
    let r = run(&scene(vec![ball("b", 0.0, 10.0, 0.0, 0.0, 0.1, 1.0, mat(0.0, 0.0, 0.0))], vec![], G, Some(1.0), json!({})));
    let x = last(&r);
    // semi-implicit Euler from rest with sub-step h: y = y0 − ½gt² − ½ght (two steps per frame, four sub-steps)
    let h = 1.0 / 480.0;
    let expected = 10.0 - 0.5 * G - 0.5 * G * h;
    assert!((x[1] - expected).abs() < 1e-9, "y = {} expected {}", x[1], expected);
    assert!((x[1] - (10.0 - 0.5 * G)).abs() <= 0.5 * G * h + 1e-9);
}

fn incline_scene(theta: f64, mu_s: f64, mu_k: f64) -> (String, (f64, f64)) {
    let base = 4.0;
    let hgt = base * theta.tan();
    let incline = body(
        "incline",
        "static",
        json!({"type": "polygon", "points": [{"x": 0, "y": 0}, {"x": base, "y": 0}, {"x": 0, "y": hgt}]}),
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
        mat(mu_s, mu_k, 0.0),
    );
    let (w, hh) = (0.4, 0.2);
    let d = (theta.cos(), -theta.sin());
    let nrm = (theta.sin(), theta.cos());
    let s0 = 0.6;
    let cx = s0 * d.0 + 0.5 * hh * nrm.0;
    let cy = hgt + s0 * d.1 + 0.5 * hh * nrm.1;
    let mut b = boxed("blk", cx, cy, w, hh, 1.0, mat(mu_s, mu_k, 0.0));
    b["angle"] = json!(-theta);
    (scene(vec![incline, b], vec![], G, Some(1.0), json!({"softStep": {"sleep": false}})), d)
}

#[test]
fn block_on_incline_sticks_below_mu_s() {
    let theta = 30f64.to_radians();
    let (text, d) = incline_scene(theta, 0.7, 0.6);
    let r = run(&text);
    let x0 = state(&r, 0);
    let x1 = last(&r);
    let s = (x1[0] - x0[0]) * d.0 + (x1[1] - x0[1]) * d.1;
    assert!(s.abs() < 1e-3, "slid {s} m");
}

#[test]
fn block_slides_with_kinetic_friction() {
    let theta = 30f64.to_radians();
    let (text, d) = incline_scene(theta, 0.2, 0.2);
    let r = run(&text);
    let x0 = state(&r, 0);
    let s = |k: u64| {
        let x = state(&r, k);
        (x[0] - x0[0]) * d.0 + (x[1] - x0[1]) * d.1
    };
    let a = 8.0 / 3.0 * (s(60) - s(30));
    let expected = G * (theta.sin() - 0.2 * theta.cos());
    assert!(((a - expected) / expected).abs() < 0.01, "a = {a}, expected {expected}");
}

fn collision(e: f64) -> SimulationRun {
    run(&scene(
        vec![ball("a", -0.5, 0.0, 2.0, 0.0, 0.1, 1.0, mat(0.0, 0.0, e)), ball("b", 0.5, 0.0, -2.0, 0.0, 0.1, 1.0, mat(0.0, 0.0, e))],
        vec![],
        0.0,
        Some(0.5),
        json!({}),
    ))
}

#[test]
fn head_on_collisions_conserve_momentum_and_never_gain_energy() {
    for e in [1.0, 0.5] {
        let r = collision(e);
        let x = last(&r);
        let n = r.system.n;
        let (va, vb) = (x[3 * n], x[3 * n + 3]);
        assert!((va + vb).abs() < 1e-9, "momentum {}", va + vb);
        assert!(((vb - 2.0 * e) / (2.0 * e)).abs() < 0.01, "e = {e}: vb = {vb}");
        assert!(0.5 * (va * va + vb * vb) <= 4.0 + 1e-9, "energy gained");
    }
}

#[test]
fn pendulum_period_and_rod_length() {
    let l = 1.0;
    let th0 = 5f64.to_radians();
    let (bx, by) = (l * th0.sin(), -l * th0.cos());
    let rod = json!({"type": "rod", "id": "c1", "name": "杆", "a": {"body": "p", "local": {"x": 0, "y": 0}}, "b": {"body": null, "local": {"x": 0, "y": 0}}});
    let r = run(&scene(vec![ball("p", bx, by, 0.0, 0.0, 0.05, 0.5, mat(0.0, 0.0, 0.0))], vec![rod], G, Some(21.0), json!({})));
    // zero crossings of x (linear interpolation between frames)
    let mut crossings = Vec::new();
    let mut prev = state(&r, 0);
    let mut max_drift: f64 = 0.0;
    for k in 1..=r.k {
        let x = state(&r, k);
        max_drift = max_drift.max(((x[0] * x[0] + x[1] * x[1]).sqrt() - l).abs());
        if prev[0] > 0.0 && x[0] <= 0.0 {
            let t = (k - 1) as f64 / 60.0 + prev[0] / (prev[0] - x[0]) / 60.0;
            crossings.push(t);
        }
        prev = x;
    }
    assert!(crossings.len() >= 10, "{} crossings", crossings.len());
    let period = (crossings[crossings.len() - 1] - crossings[0]) / (crossings.len() - 1) as f64;
    let expected = 2.0 * std::f64::consts::PI * (l / G).sqrt() * (1.0 + th0 * th0 / 16.0);
    assert!(((period - expected) / expected).abs() < 0.005, "T = {period}, expected {expected}");
    assert!(max_drift < 1e-3, "rod length drift {max_drift}");
}

fn pyramid(rows: usize, duration: Option<f64>) -> String {
    let m = mat(0.6, 0.5, 0.0);
    let mut bodies = vec![wall("ground", 0.0, -0.2, 20.0, 0.4, m.clone())];
    for r in 0..rows {
        for c in 0..rows - r {
            let x = (c as f64 - (rows - r - 1) as f64 / 2.0) * 0.52;
            bodies.push(boxed(&format!("b{r}_{c}"), x, 0.25 + r as f64 * 0.5, 0.5, 0.5, 1.0, m.clone()));
        }
    }
    scene(bodies, vec![], G, duration, json!({}))
}

#[test]
fn pyramid_stands_and_falls_asleep() {
    let r = run(&pyramid(10, Some(3.0)));
    let x0 = state(&r, 0);
    let x1 = last(&r);
    let n = r.system.n;
    assert_eq!(n, 55);
    let mut worst: f64 = 0.0;
    for i in 0..n {
        worst = worst.max(((x1[3 * i] - x0[3 * i]).powi(2) + (x1[3 * i + 1] - x0[3 * i + 1]).powi(2)).sqrt());
    }
    assert!(worst < 5e-3, "largest displacement {worst} m");
    let soft = r.soft.as_ref().expect("soft solver");
    assert!(soft.state.island.iter().all(|&i| i >= 0.0), "not all asleep");
}

#[test]
fn unbounded_pile_stops_at_rest() {
    let (s, _) = parse_scene(&pyramid(4, None)).expect("scene");
    let mut r = SimulationRun::new(&s, SimOptions { duration: Some(None), ..SimOptions::default() }).expect("run");
    r.advance(u64::MAX, 600.0);
    assert_eq!(r.stop_reason, Some(StopReason::Rest));
    assert!(r.t < 2.0, "stopped at {}", r.t);
}

fn ball_pit(count: usize) -> String {
    let m = mat(0.3, 0.3, 0.2);
    let mut bodies = vec![wall("ground", 0.0, -0.2, 6.4, 0.4, m.clone()), wall("L", -3.1, 3.0, 0.2, 6.0, m.clone()), wall("R", 3.1, 3.0, 0.2, 6.0, m.clone())];
    for i in 0..count {
        let x = -2.5 + (i % 15) as f64 * 0.35 + ((i / 15) % 2) as f64 * 0.1;
        let y = 1.0 + (i / 15) as f64 * 0.4;
        bodies.push(ball(&format!("b{i}"), x, y, 0.0, 0.0, 0.15, 0.2, m.clone()));
    }
    scene(bodies, vec![], G, Some(3.0), json!({}))
}

#[test]
fn balls_stay_in_the_container_without_deep_overlap() {
    let r = run(&ball_pit(100));
    let x = last(&r);
    let n = r.system.n;
    for i in 0..n {
        let (px, py) = (x[3 * i], x[3 * i + 1]);
        assert!(px > -3.0 && px < 3.0 && py > 0.15 - 0.01, "ball {i} at ({px}, {py})");
        for j in i + 1..n {
            let d = ((px - x[3 * j]).powi(2) + (py - x[3 * j + 1]).powi(2)).sqrt();
            assert!(d > 0.3 - 0.01, "balls {i} and {j} overlap: {d}");
        }
    }
}

#[test]
fn fast_ball_does_not_tunnel_through_a_thin_wall() {
    let r = run(&scene(
        vec![ball("b", 0.0, 0.0, 30.0, 0.0, 0.05, 0.1, mat(0.0, 0.0, 0.0)), wall("w", 1.0, 0.0, 0.02, 2.0, mat(0.0, 0.0, 0.0))],
        vec![],
        0.0,
        Some(0.2),
        json!({}),
    ));
    let x = last(&r);
    assert!(x[0] < 1.0 - 0.01 - 0.05 + 0.005, "ball passed: x = {}", x[0]);
}

#[test]
fn deterministic_and_rebuilds_bit_identical() {
    let text = ball_pit(40);
    let opts = SimOptions { chunk_seconds: 0.5, ..SimOptions::default() };
    let a = run_with(&text, opts.clone());
    let b = run_with(&text, opts.clone());
    assert_eq!(a.hash, b.hash);
    let mut rebuilt = 0;
    for (c, cp) in a.checkpoints.iter().enumerate() {
        let Some(cp) = cp else { continue };
        let orig = a.frames[c].as_ref().expect("chunk");
        let end = orig.first + orig.count as u64 - 1;
        let rb = rebuild_chunk(a.system.clone(), cp, opts.clone(), end).expect("rebuild");
        assert_eq!(rb.chunk.count, orig.count);
        for (u, v) in rb.chunk.states[..orig.count * a.size].iter().zip(&orig.states[..orig.count * a.size]) {
            assert_eq!(u.to_bits(), v.to_bits(), "chunk {c} differs");
        }
        rebuilt += 1;
    }
    assert!(rebuilt >= 5);
}

#[test]
fn hinge_chain_and_spring_run_with_joints() {
    // a chain of four boxes joined by hinges hanging from the world, released sideways: rows stay together
    let m = mat(0.0, 0.0, 0.0);
    let mut bodies = Vec::new();
    let mut conns = Vec::new();
    for i in 0..4 {
        bodies.push(boxed(&format!("l{i}"), 0.25 + 0.5 * i as f64, 2.0, 0.5, 0.1, 0.5, m.clone()));
        let a = json!({"body": format!("l{i}"), "local": {"x": -0.25, "y": 0}});
        let b = if i == 0 { json!({"body": null, "local": {"x": 0, "y": 2}}) } else { json!({"body": format!("l{}", i - 1), "local": {"x": 0.25, "y": 0}}) };
        conns.push(json!({"type": "hinge", "id": format!("h{i}"), "name": "铰链", "a": a, "b": b}));
    }
    let r = run(&scene(bodies, conns, G, Some(2.0), json!({})));
    let x = last(&r);
    // hinge gaps (joint ends within 2 mm)
    let end = |i: usize, s: f64| {
        let (cx, cy, th) = (x[3 * i], x[3 * i + 1], x[3 * i + 2]);
        (cx + s * th.cos(), cy + s * th.sin())
    };
    let first = end(0, -0.25);
    let g0 = ((first.0).powi(2) + (first.1 - 2.0).powi(2)).sqrt();
    assert!(g0 < 2e-3, "pivot gap {g0}; state {:?}", &x[..12]);
    for i in 1..4 {
        let (p, q) = (end(i, -0.25), end(i - 1, 0.25));
        let gap = ((p.0 - q.0).powi(2) + (p.1 - q.1).powi(2)).sqrt();
        assert!(gap < 2e-3, "joint {i} opened: {gap}");
    }
}

#[test]
fn heavy_on_light_stack_mass_ratio_100() {
    let m = mat(0.5, 0.5, 0.0);
    let bodies = vec![
        wall("ground", 0.0, -0.2, 10.0, 0.4, m.clone()),
        boxed("light", 0.0, 0.25, 0.5, 0.5, 1.0, m.clone()),
        boxed("heavy", 0.0, 0.75, 0.5, 0.5, 100.0, m.clone()),
    ];
    let r = run(&scene(bodies, vec![], G, Some(3.0), json!({})));
    let x = last(&r);
    // the light box keeps its height within 1 cm and the heavy one does not sink into it by more than 1 cm
    assert!((x[1] - 0.25).abs() < 0.01, "light box at {}", x[1]);
    assert!(x[4] - x[1] > 0.5 - 0.01, "heavy box sank: {}", x[4] - x[1]);
}

#[test]
fn conveyor_belt_drags_a_box_to_its_speed() {
    let m = mat(0.5, 0.5, 0.0);
    let mut belt = wall("belt", 0.0, -0.2, 40.0, 0.4, m.clone());
    belt["beltSpeed"] = json!(1.0);
    let r = run(&scene(vec![belt, boxed("box", 0.0, 0.1, 0.4, 0.2, 1.0, m.clone())], vec![], G, Some(1.0), json!({"softStep": {"sleep": false}})));
    let x = last(&r);
    let n = r.system.n;
    assert!((x[3 * n] - 1.0).abs() < 0.01, "box speed {}", x[3 * n]);
}
