//! Teaching representations computed from a recording (26.53, D65; TypeScript reference
//! tests/reference/teaching.ts): the free-body diagram of one body at one instant, the ticker tape of a body, the
//! area under a quantity's curve, the extreme value of a quantity, and quantities at the two sides of an event.
//! Drawing (SVG, colours, labels) stays in the interface.

use serde_json::{json, Value};

use crate::dmath::{atan2 as atan2_det, hypot};
use crate::js::{js_max, js_min, js_round};
use crate::message::SimResult;
use crate::observe::Observation;
use crate::session::Session;
use crate::transport::jnum;
use crate::views::body_forces;

/// One force of a free-body diagram (world coordinates, N).
#[derive(Clone, Debug)]
pub struct FbdForce {
    pub kind: &'static str,
    pub label: String,
    pub sub: String,
    pub x: f64,
    pub y: f64,
    pub fx: f64,
    pub fy: f64,
}

fn kind_order(kind: &str) -> i32 {
    match kind {
        "gravity" => 0,
        "normal" => 1,
        "limit" => 2,
        "friction" => 3,
        "tension" => 4,
        "pin" => 5,
        "spring" => 6,
        "damper" => 7,
        "drag" => 8,
        "attract" => 9,
        "central" => 10,
        "applied" => 11,
        // 26.54 (D78)
        "electric" => 12,
        "magnetic" => 13,
        "coulomb" => 14,
        // 26.55 (D91, D92)
        "buoyancy" => 15,
        "ampere" => 16,
        _ => 17,
    }
}

fn is_numbered_normal(label: &str) -> bool {
    label.len() > 1 && label.starts_with('N') && label[1..].chars().all(|c| c.is_ascii_digit())
}

/// The forces on body `body_id` at time t of the recording (teaching/fbd.ts `fbdData`); null for a static or
/// unknown body. Contact points of one unit merge into one normal force at their centre of pressure; whatever the
/// list misses (m·a − ΣF) is added as "other constraint forces" (label F其他).
pub fn fbd(s: &mut Session, time: f64, body_id: &str) -> SimResult<Value> {
    let sys = s.system.clone();
    let model = &sys.model;
    let Some(g) = model.bodies.iter().position(|b| b.id == body_id) else { return Ok(Value::Null) };
    let b = &model.bodies[g];
    if !b.dynamic || s.frame_count == 0 {
        return Ok(Value::Null);
    }
    let t_max = js_max(0.0, (s.frame_count - 1) as f64 * s.dt);
    let t = js_max(0.0, js_min(t_max, time));
    let x = s.exact_state_at(t)?;
    let mut si = 0;
    for (i, sg) in s.segments.iter().enumerate() {
        if sg.t0 <= t {
            si = i;
        } else {
            break;
        }
    }
    let mode = s.segments[si].mode.clone();
    let sol = crate::dynamics::solve_mode(&sys, &x, &mode, None)?;
    let raw = body_forces(&sys, Some(&mode), Some(&sol), g, &sol.poses, &x);
    let pose = sol.poses[g];
    let mut merged: Vec<FbdForce> = Vec::new();
    let mut i = 0;
    while i < raw.len() {
        let a = &raw[i];
        if a.kind == "normal" && is_numbered_normal(&a.label) {
            let (mut fx, mut fy, mut wx, mut wy, mut w) = (0.0, 0.0, 0.0, 0.0, 0.0);
            let mut j = i;
            while j < raw.len() && raw[j].kind == "normal" && is_numbered_normal(&raw[j].label) && (j == i || raw[j].label != "N1") {
                let r = &raw[j];
                let m = hypot(r.fx, r.fy);
                fx += r.fx;
                fy += r.fy;
                wx += r.x * m;
                wy += r.y * m;
                w += m;
                j += 1;
            }
            let cnt = (j - i) as f64;
            let (cx, cy) = if w > 0.0 { (wx / w, wy / w) } else { (raw[i..j].iter().fold(0.0, |s, r| s + r.x) / cnt, raw[i..j].iter().fold(0.0, |s, r| s + r.y) / cnt) };
            merged.push(FbdForce { kind: "normal", label: "N".into(), sub: String::new(), x: cx, y: cy, fx, fy });
            i = j;
            continue;
        }
        merged.push(FbdForce { kind: a.kind, label: a.label.clone(), sub: String::new(), x: a.x, y: a.y, fx: a.fx, fy: a.fy });
        i += 1;
    }
    let mut forces: Vec<FbdForce> = merged.into_iter().filter(|f| hypot(f.fx, f.fy) > 0.0).collect();
    let i3 = 3 * b.index as usize;
    let ma = (b.mass * sol.acc[i3], b.mass * sol.acc[i3 + 1]);
    let (mut sx, mut sy) = (0.0, 0.0);
    let mut big = hypot(ma.0, ma.1);
    for f in &forces {
        sx += f.fx;
        sy += f.fy;
        big = js_max(big, hypot(f.fx, f.fy));
    }
    let rx = ma.0 - sx;
    let ry = ma.1 - sy;
    if hypot(rx, ry) > 1e-6 * js_max(big, 1e-9) && hypot(rx, ry) > 1e-12 {
        forces.push(FbdForce { kind: "other", label: "F其他".into(), sub: String::new(), x: pose.x, y: pose.y, fx: rx, fy: ry });
        sx += rx;
        sy += ry;
    }
    // Stable sort by the textbook order (Array.prototype.sort is stable)
    forces.sort_by_key(|f| kind_order(f.kind));
    let mut count: Vec<(String, usize)> = Vec::new();
    for f in &forces {
        match count.iter_mut().find(|(l, _)| *l == f.label) {
            Some(c) => c.1 += 1,
            None => count.push((f.label.clone(), 1)),
        }
    }
    let mut seen: Vec<(String, usize)> = Vec::new();
    for f in forces.iter_mut() {
        if count.iter().find(|(l, _)| *l == f.label).map(|c| c.1).unwrap_or(0) < 2 {
            continue;
        }
        let k = match seen.iter_mut().find(|(l, _)| *l == f.label) {
            Some(c) => {
                c.1 += 1;
                c.1
            }
            None => {
                seen.push((f.label.clone(), 1));
                1
            }
        };
        f.sub = k.to_string();
    }
    let mut incline: Option<f64> = None;
    let mut best = 0.0;
    for f in &forces {
        if f.kind != "normal" {
            continue;
        }
        let m = hypot(f.fx, f.fy);
        if m > best {
            best = m;
            incline = Some(atan2_det(f.fy, f.fx) - std::f64::consts::PI / 2.0);
        }
    }
    if let Some(mut a) = incline {
        while a > std::f64::consts::PI / 2.0 {
            a -= std::f64::consts::PI;
        }
        while a <= -std::f64::consts::PI / 2.0 {
            a += std::f64::consts::PI;
        }
        incline = Some(a);
    }
    Ok(json!({
        "bodyId": b.id, "name": b.name, "time": jnum(t), "mass": jnum(b.mass), "x": jnum(pose.x), "y": jnum(pose.y), "c": jnum(pose.c), "s": jnum(pose.s),
        "shape": crate::views::shape_json(&b.shape),
        "forces": forces.iter().map(|f| json!({ "kind": f.kind, "label": f.label, "sub": f.sub, "x": jnum(f.x), "y": jnum(f.y), "fx": jnum(f.fx), "fy": jnum(f.fy) })).collect::<Vec<_>>(),
        "net": { "x": jnum(sx), "y": jnum(sy) }, "ma": { "x": jnum(ma.0), "y": jnum(ma.1) }, "incline": incline.map(jnum)
    }))
}

/// Velocity component a tape measures at state X (dynamic slot i).
fn speed_of(x: &[f64], n: usize, i: usize, dir: &str) -> f64 {
    let vx = x[3 * n + 3 * i];
    let vy = x[3 * n + 3 * i + 1];
    match dir {
        "x" => vx,
        "y" => vy,
        _ => hypot(vx, vy),
    }
}

/// Ticker tape of a body (teaching/tape.ts `tapeData`); null for a static or unknown body or a run too short.
pub fn tape(s: &mut Session, body_id: &str, direction: &str, period_in: f64, every_in: f64, start_in: f64, intervals_in: Option<f64>) -> SimResult<Value> {
    let sys = s.system.clone();
    let model = &sys.model;
    let Some(b) = model.bodies.iter().find(|b| b.id == body_id) else { return Ok(Value::Null) };
    if !b.dynamic || s.frame_count == 0 {
        return Ok(Value::Null);
    }
    let n = model.n;
    let i = b.index as usize;
    let period = if period_in > 0.0 { period_in } else { 0.02 };
    let every = js_max(1.0, js_round(every_in));
    let tt = period * every;
    let t_end = (s.frame_count - 1) as f64 * s.dt;
    let start = js_max(0.0, js_min(t_end, start_in));
    let max_intervals = ((t_end - start) / tt + 1e-9).floor();
    let intervals = js_min(max_intervals, js_max(1.0, js_round(intervals_in.unwrap_or(6.0))));
    if intervals < 1.0 || intervals.is_nan() {
        return Ok(Value::Null);
    }
    let dot_count = (intervals * every + 1.0) as usize;
    let mut dots: Vec<(f64, f64)> = Vec::new();
    let x0s = s.exact_state_at(start)?;
    let x0 = x0s[3 * i];
    let y0 = x0s[3 * i + 1];
    let mut dist_s = 0.0;
    const SUB: usize = 4;
    let mut prev = x0s.clone();
    for k in 0..dot_count {
        let t = start + k as f64 * period;
        let mut x = prev.clone();
        if k > 0 {
            if direction == "path" {
                let h = period / SUB as f64;
                let mut v = vec![speed_of(&prev, n, i, "path")];
                for j in 1..=SUB {
                    x = s.exact_state_at(js_min(t_end, start + (k - 1) as f64 * period + j as f64 * h))?;
                    v.push(speed_of(&x, n, i, "path"));
                }
                dist_s += h / 3.0 * (v[0] + 4.0 * v[1] + 2.0 * v[2] + 4.0 * v[3] + v[4]);
            } else {
                x = s.exact_state_at(js_min(t_end, t))?;
            }
        }
        let d = match direction {
            "x" => x[3 * i] - x0,
            "y" => x[3 * i + 1] - y0,
            _ => dist_s,
        };
        dots.push((t, d));
        prev = x;
    }
    let every_u = every as usize;
    let counts: Vec<(f64, f64)> = (0..=intervals as usize).map(|c| dots[c * every_u]).collect();
    let lengths: Vec<f64> = counts[1..].iter().enumerate().map(|(j, c)| c.1 - counts[j].1).collect();
    let mut velocities = Vec::new();
    for c in 1..lengths.len() {
        let t = counts[c].0;
        let xs = s.exact_state_at(t)?;
        velocities.push(json!({ "n": c, "t": jnum(t), "tape": jnum((lengths[c - 1] + lengths[c]) / (2.0 * tt)), "sim": jnum(speed_of(&xs, n, i, direction)) }));
    }
    let m = lengths.len() / 2;
    let (mut accel, mut sim_accel) = (Value::Null, Value::Null);
    if m >= 1 {
        let (mut a1, mut a2) = (0.0, 0.0);
        for j in 0..m {
            a1 += lengths[j];
            a2 += lengths[m + j];
        }
        accel = jnum((a2 - a1) / (m as f64 * m as f64 * tt * tt));
        let t1 = counts[2 * m].0;
        let x1 = s.exact_state_at(t1)?;
        sim_accel = jnum((speed_of(&x1, n, i, direction) - speed_of(&x0s, n, i, direction)) / (t1 - start));
    }
    Ok(json!({
        "bodyId": b.id, "name": b.name, "direction": direction, "period": jnum(period), "every": jnum(every), "T": jnum(tt),
        "dots": dots.iter().map(|d| json!({ "t": jnum(d.0), "s": jnum(d.1) })).collect::<Vec<_>>(),
        "lengths": lengths.iter().map(|v| jnum(*v)).collect::<Vec<_>>(), "velocities": velocities, "accel": accel, "used": 2 * m, "simAccel": sim_accel
    }))
}

/// Quantity key → the key of its integral over time (same body).
fn integral_of(key: &str) -> Option<&'static str> {
    match key {
        "vx" => Some("x"),
        "vy" => Some("y"),
        "ax" => Some("vx"),
        "ay" => Some("vy"),
        "omega" => Some("angle"),
        "alpha" => Some("omega"),
        _ => None,
    }
}

/// ∫ over equally spaced samples (spacing h): Simpson, the last three intervals by 3/8 when their count is odd.
pub fn simpson(v: &[f64], h: f64) -> f64 {
    if v.len() < 2 {
        return 0.0;
    }
    let n = v.len() - 1;
    if n == 1 {
        return h * (v[0] + v[1]) / 2.0;
    }
    let part = |a: usize, b: usize| {
        let mut s = v[a] + v[b];
        for i in a + 1..b {
            s += if (i - a) % 2 == 1 { 4.0 * v[i] } else { 2.0 * v[i] };
        }
        s * h / 3.0
    };
    if n % 2 == 0 {
        return part(0, n);
    }
    let m = n - 3;
    let tail = 3.0 * h / 8.0 * (v[m] + 3.0 * v[m + 1] + 3.0 * v[m + 2] + v[m + 3]);
    (if m > 0 { part(0, m) } else { 0.0 }) + tail
}

/// Most frames one area may integrate.
pub const AREA_MAX_FRAMES: u64 = 200_000;

/// ∫ id dt over [t0, t1] snapped to frames (teaching/area.ts `areaUnder`); null for fewer than two frames or more
/// than AREA_MAX_FRAMES.
pub fn area(s: &mut Session, id: &str, t0_in: f64, t1_in: f64) -> SimResult<Value> {
    if s.frame_count == 0 {
        return Ok(Value::Null);
    }
    let last = (s.frame_count - 1) as f64;
    let (t0, t1) = if t1_in < t0_in { (t1_in, t0_in) } else { (t0_in, t1_in) };
    let k0 = js_max(0.0, js_min(last, js_round(t0 / s.dt)));
    let k1 = js_max(0.0, js_min(last, js_round(t1 / s.dt)));
    if k1 - k0 < 1.0 || k1 - k0 > AREA_MAX_FRAMES as f64 {
        return Ok(Value::Null);
    }
    let dot = id.rfind('.');
    let key = dot.map(|d| &id[d + 1..]).unwrap_or("");
    let compare_id = match (dot, integral_of(key)) {
        (Some(d), Some(integ)) => Some(format!("{}.{}", &id[..d], integ)),
        _ => None,
    };
    let mut ids = vec![id.to_string()];
    if let Some(c) = &compare_id {
        ids.push(c.clone());
    }
    let (_, values) = crate::observe::quantity_series(s, &ids, k0 as u64, k1 as u64, 1)?;
    let v = &values[0];
    let pos: Vec<f64> = v.iter().map(|x| if *x > 0.0 { *x } else { 0.0 }).collect();
    let neg: Vec<f64> = v.iter().map(|x| if *x < 0.0 { *x } else { 0.0 }).collect();
    let positive = simpson(&pos, s.dt);
    let negative = simpson(&neg, s.dt);
    let mut compare: Option<f64> = None;
    if compare_id.is_some() {
        let c = &values[1];
        let d = c[c.len() - 1] - c[0];
        compare = if d.is_finite() { Some(d) } else { None };
    }
    Ok(json!({
        "id": id, "t0": jnum(k0 * s.dt), "t1": jnum(k1 * s.dt), "area": jnum(positive + negative), "positive": jnum(positive), "negative": jnum(negative),
        "compareId": if compare.is_some() { json!(compare_id) } else { Value::Null }, "compare": compare.map(jnum)
    }))
}

/// Largest or smallest finite value of a quantity over the whole recording (NaN when there is none).
pub fn extreme(s: &mut Session, id: &str, max: bool) -> SimResult<f64> {
    if s.frame_count == 0 {
        return Ok(f64::NAN);
    }
    let (_, values) = crate::observe::quantity_series(s, &[id.to_string()], 0, s.frame_count - 1, 1)?;
    let mut best = if max { f64::NEG_INFINITY } else { f64::INFINITY };
    for &x in &values[0] {
        if x.is_finite() {
            best = if max { js_max(best, x) } else { js_min(best, x) };
        }
    }
    Ok(if best.is_finite() { best } else { f64::NAN })
}

/// Quantities just before (`after` false) or after an event (teaching/problems.ts): the state before or after the
/// jump, in the mode of the segment on that side, with the impact loss of the neighbouring frame.
pub fn event_values(s: &mut Session, index: usize, after: bool, ids: &[String]) -> SimResult<Vec<f64>> {
    let Some(e) = s.events.get(index) else { return Ok(ids.iter().map(|_| f64::NAN).collect()) };
    let (t, seg_i, x) = (e.t, e.segment, if after { e.after.clone() } else { e.before.clone() });
    let si = if after { seg_i } else { seg_i.saturating_sub(1) };
    let si = if si < s.segments.len() { si } else { 0 };
    let k = js_min((s.frame_count - 1) as f64, (t / s.dt + 1e-9).floor() + if after { 1.0 } else { 0.0 }) as u64;
    let loss = s.impact_loss(k)?;
    let sys = s.system.clone();
    let meta = s.meta.clone();
    let customs = s.customs().to_vec();
    let mode = s.segments[si].mode.clone();
    let obs = Observation::new(&sys, &meta, &customs, &x, &mode, loss, Some(t))?;
    Ok(ids.iter().map(|id| obs.value(id)).collect())
}
