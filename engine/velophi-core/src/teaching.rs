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
    // 26.61: refined between frames and at the events (extreme_in); the frames alone miss a smooth extreme by up to
    // ~(ω·Δt)²/8 of the value and the side of an event by up to one frame
    Ok(extreme_in(s, id, max, None, None)?.0)
}

/// 26.61: the extreme between frames. Around the best frame (one frame each side, cut at events) the exact quantity is
/// searched by golden section; the values just before and after the events near it are candidates too (an extreme at
/// an impact sits exactly on its side). Returns the better of the frame value and these.
fn refine_extreme(s: &mut Session, id: &str, max: bool, best: f64, at: f64, lo: f64, hi: f64) -> SimResult<(f64, f64)> {
    let dt = s.dt;
    if !(dt > 0.0) || !best.is_finite() || !at.is_finite() {
        return Ok((best, at));
    }
    let better = |x: f64, b: f64| x.is_finite() && if max { x > b } else { x < b };
    let (mut best, mut at_t) = (best, at);
    let a0 = js_max(lo, at - dt);
    let b0 = js_min(hi, at + dt);
    let near: Vec<(usize, f64)> = s.events.iter().enumerate().filter(|(_, e)| e.t >= a0 - dt && e.t <= b0 + dt && e.t >= lo - 1e-12 && e.t <= hi + 1e-12).map(|(i, e)| (i, e.t)).collect();
    let ids = [id.to_string()];
    for &(i, t) in &near {
        for after in [false, true] {
            let v = event_values(s, i, after, &ids)?[0];
            if better(v, best) {
                best = v;
                at_t = t;
            }
        }
    }
    let mut cuts = vec![a0];
    for &(_, t) in &near {
        if t > a0 && t < b0 {
            cuts.push(t);
        }
    }
    cuts.push(b0);
    let terms = [(id.to_string(), 1.0)];
    for w in cuts.windows(2) {
        // Open interval: an event's own instant belongs to its sides (above)
        let eps = 1e-9 * dt;
        let (mut a, mut b) = (w[0] + eps, w[1] - eps);
        if b - a < 1e-12 * js_max(1.0, dt) {
            continue;
        }
        // Golden section on −q (max) or q (min); 60 steps shrink the bracket by 0.618⁶⁰ ≈ 3e-13
        let sign = if max { -1.0 } else { 1.0 };
        let r = 0.618_033_988_749_894_9;
        let mut c = b - r * (b - a);
        let mut d = a + r * (b - a);
        let mut fc = sign * combo_at(s, &terms, c)?.0;
        let mut fd = sign * combo_at(s, &terms, d)?.0;
        if !fc.is_finite() || !fd.is_finite() {
            continue;
        }
        for _ in 0..60 {
            if fc < fd {
                b = d;
                d = c;
                fd = fc;
                c = b - r * (b - a);
                fc = sign * combo_at(s, &terms, c)?.0;
            } else {
                a = c;
                c = d;
                fc = fd;
                d = a + r * (b - a);
                fd = sign * combo_at(s, &terms, d)?.0;
            }
            if !fc.is_finite() || !fd.is_finite() {
                break;
            }
        }
        let (t, v) = if fc < fd { (c, sign * fc) } else { (d, sign * fd) };
        if better(v, best) {
            best = v;
            at_t = t;
        }
    }
    Ok((best, at_t))
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

// ---- 26.57 (D111, D113): evaluation points of a task ----

/// The value of Σ cᵢ·qᵢ at an arbitrary time t: exact state of the recording (one step from the frame or event
/// before t, in that mode), observed in the mode of the segment at t.
fn combo_at(s: &mut Session, terms: &[(String, f64)], t: f64) -> SimResult<(f64, Vec<f64>)> {
    let x = s.exact_state_at(t)?;
    let seg = s.segment_at_time(t);
    let k = s.frame_at(t);
    let loss = s.impact_loss(k)?;
    let sys = s.system.clone();
    let meta = s.meta.clone();
    let customs = s.customs().to_vec();
    let mode = s.segments[seg].mode.clone();
    let obs = Observation::new(&sys, &meta, &customs, &x, &mode, loss, Some(t))?;
    let vals: Vec<f64> = terms.iter().map(|(id, _)| obs.value(id)).collect();
    let g = terms.iter().zip(&vals).fold(0.0, |acc, ((_, c), v)| acc + c * v);
    Ok((g, vals))
}

/// Most frames one crossing search may scan.
pub const CROSSING_MAX_FRAMES: u64 = 2_000_000;

/// Times in [t0, t1] where g(t) = Σ cᵢ·qᵢ(t) − level changes sign (a task's condition “s = 2 m”, “y = h”, “v = 0”).
/// Frames are scanned for a sign change in the wanted direction; a bracket without an event inside is refined by
/// bisection on the exact state until it is shorter than `tol` (or 200 halvings); a bracket that contains an event
/// (a state jump) is reported as a crossing at the event when the jump itself goes through the level (`kind`:
/// "event"), otherwise the continuous part on either side is searched. `complete` is false when the recording ends
/// before t1, so “no crossing” is not a claim about the rest of the motion (T28).
pub fn crossing(s: &mut Session, terms: &[(String, f64)], level: f64, t0_in: f64, t1_in: f64, all: bool, direction: i32, tol_in: f64) -> SimResult<Value> {
    let empty = || json!({ "crossings": [], "complete": false, "scanned": 0, "tEnd": 0.0 });
    if s.frame_count < 2 || terms.is_empty() {
        return Ok(empty());
    }
    let t_end = (s.frame_count - 1) as f64 * s.dt;
    let (t0, t1) = if t1_in < t0_in { (t1_in, t0_in) } else { (t0_in, t1_in) };
    let t0 = js_max(0.0, t0);
    // The search covers the asked interval, or the whole of a finished bounded recording
    let complete = t1 <= t_end + 1e-12 * js_max(1.0, t_end) || s.duration.map_or(false, |d| s.t >= d - 1e-9 * js_max(1.0, d));
    let t1 = js_min(t1, t_end);
    if t1 <= t0 {
        return Ok(json!({ "crossings": [], "complete": complete, "scanned": 0, "tEnd": jnum(t_end) }));
    }
    let tol = if tol_in > 0.0 { tol_in } else { 1e-12 * js_max(1.0, t1) };
    let k0 = (t0 / s.dt).ceil() as u64;
    let k1 = js_min((s.frame_count - 1) as f64, (t1 / s.dt).floor()) as u64;
    if k1 >= k0 && k1 - k0 > CROSSING_MAX_FRAMES {
        return Err(crate::message::Message::new("err.internal").text("message", format!("calc crossing: more than {CROSSING_MAX_FRAMES} frames")));
    }
    // Sample points: t0 (exact), the frames inside, t1 (exact)
    let ids: Vec<String> = terms.iter().map(|(id, _)| id.clone()).collect();
    let mut pts: Vec<(f64, f64)> = Vec::new();
    let (g0, _) = combo_at(s, terms, t0)?;
    pts.push((t0, g0 - level));
    if k1 >= k0 {
        let (tk, vals) = crate::observe::quantity_series(s, &ids, k0, k1, 1)?;
        for (j, t) in tk.iter().enumerate() {
            if *t <= t0 || *t >= t1 {
                continue;
            }
            let g = terms.iter().enumerate().fold(0.0, |acc, (i, (_, c))| acc + c * vals[i][j]);
            pts.push((*t, g - level));
        }
    }
    let (g1, _) = combo_at(s, terms, t1)?;
    pts.push((t1, g1 - level));
    let wants = |a: f64, b: f64| -> bool {
        // a → b goes through zero in the wanted direction (a zero end point counts once, at its own side)
        let up = a < 0.0 && b >= 0.0;
        let down = a > 0.0 && b <= 0.0;
        match direction {
            1 => up,
            -1 => down,
            _ => up || down,
        }
    };
    let event_times: Vec<(usize, f64)> = s.events.iter().enumerate().map(|(i, e)| (i, e.t)).collect();
    let mut out: Vec<Value> = Vec::new();
    // A zero exactly at t0 is a crossing only when nothing before t0 is asked (the start of the interval)
    if pts[0].1 == 0.0 && direction == 0 {
        let (_, vals) = combo_at(s, terms, t0)?;
        out.push(json!({ "t": jnum(t0), "residual": 0.0, "kind": "start", "values": vals.iter().map(|v| jnum(*v)).collect::<Vec<_>>() }));
        if !all {
            return Ok(json!({ "crossings": out, "complete": complete, "scanned": pts.len(), "tEnd": jnum(t_end) }));
        }
    }
    for w in 0..pts.len() - 1 {
        let (ta, ga) = pts[w];
        let (tb, gb) = pts[w + 1];
        // Events strictly inside (ta, tb]
        let inside: Vec<(usize, f64)> = event_times.iter().copied().filter(|(_, te)| *te > ta && *te <= tb).collect();
        let mut found: Vec<Value> = Vec::new();
        if inside.is_empty() {
            if wants(ga, gb) {
                let (mut lo, mut hi, mut glo) = (ta, tb, ga);
                let mut n = 0;
                while hi - lo > tol && n < 200 {
                    let mid = 0.5 * (lo + hi);
                    if mid <= lo || mid >= hi {
                        break;
                    }
                    let (gm, _) = combo_at(s, terms, mid)?;
                    let gm = gm - level;
                    if (glo < 0.0 && gm >= 0.0) || (glo > 0.0 && gm <= 0.0) {
                        hi = mid;
                    } else {
                        lo = mid;
                        glo = gm;
                    }
                    n += 1;
                }
                let (gh, vals) = combo_at(s, terms, hi)?;
                found.push(json!({ "t": jnum(hi), "residual": jnum(gh - level), "bracket": jnum(hi - lo), "kind": "continuous", "values": vals.iter().map(|v| jnum(*v)).collect::<Vec<_>>() }));
            }
        } else {
            // Split at the events: continuous pieces, and the jumps themselves
            let mut left = (ta, ga);
            for (ei, te) in inside {
                let before = event_values(s, ei, false, &ids)?;
                let after = event_values(s, ei, true, &ids)?;
                let gbef = terms.iter().enumerate().fold(0.0, |acc, (i, (_, c))| acc + c * before[i]) - level;
                let gaft = terms.iter().enumerate().fold(0.0, |acc, (i, (_, c))| acc + c * after[i]) - level;
                if wants(left.1, gbef) {
                    // A continuous crossing between the left point and the event: bisection on [left.t, te)
                    let (mut lo, mut hi, mut glo) = (left.0, te, left.1);
                    let mut n = 0;
                    while hi - lo > tol && n < 200 {
                        let mid = 0.5 * (lo + hi);
                        if mid <= lo || mid >= hi {
                            break;
                        }
                        let (gm, _) = combo_at(s, terms, mid)?;
                        let gm = gm - level;
                        if (glo < 0.0 && gm >= 0.0) || (glo > 0.0 && gm <= 0.0) {
                            hi = mid;
                        } else {
                            lo = mid;
                            glo = gm;
                        }
                        n += 1;
                    }
                    let (gh, vals) = combo_at(s, terms, hi)?;
                    found.push(json!({ "t": jnum(hi), "residual": jnum(gh - level), "bracket": jnum(hi - lo), "kind": "continuous", "values": vals.iter().map(|v| jnum(*v)).collect::<Vec<_>>() }));
                } else if wants(gbef, gaft) {
                    found.push(json!({ "t": jnum(te), "residual": jnum(gaft), "kind": "event", "event": ei, "values": after.iter().map(|v| jnum(*v)).collect::<Vec<_>>() }));
                }
                left = (te, gaft);
            }
            if wants(left.1, gb) && tb > left.0 {
                let (mut lo, mut hi, mut glo) = (left.0, tb, left.1);
                let mut n = 0;
                while hi - lo > tol && n < 200 {
                    let mid = 0.5 * (lo + hi);
                    if mid <= lo || mid >= hi {
                        break;
                    }
                    let (gm, _) = combo_at(s, terms, mid)?;
                    let gm = gm - level;
                    if (glo < 0.0 && gm >= 0.0) || (glo > 0.0 && gm <= 0.0) {
                        hi = mid;
                    } else {
                        lo = mid;
                        glo = gm;
                    }
                    n += 1;
                }
                let (gh, vals) = combo_at(s, terms, hi)?;
                found.push(json!({ "t": jnum(hi), "residual": jnum(gh - level), "bracket": jnum(hi - lo), "kind": "continuous", "values": vals.iter().map(|v| jnum(*v)).collect::<Vec<_>>() }));
            }
        }
        for f in found {
            out.push(f);
            if !all {
                return Ok(json!({ "crossings": out, "complete": complete, "scanned": pts.len(), "tEnd": jnum(t_end) }));
            }
        }
    }
    Ok(json!({ "crossings": out, "complete": complete, "scanned": pts.len(), "tEnd": jnum(t_end) }))
}

/// Largest or smallest finite value of a quantity over frames in [t0, t1] (the whole recording by default) and the
/// time of the first frame that has it (26.57: the “interval” evaluation point of a task).
pub fn extreme_in(s: &mut Session, id: &str, max: bool, t0: Option<f64>, t1: Option<f64>) -> SimResult<(f64, f64)> {
    if s.frame_count == 0 {
        return Ok((f64::NAN, f64::NAN));
    }
    let last = s.frame_count - 1;
    let k0 = t0.map(|t| js_max(0.0, js_min(last as f64, (t / s.dt).ceil())) as u64).unwrap_or(0);
    let k1 = t1.map(|t| js_max(0.0, js_min(last as f64, (t / s.dt).floor())) as u64).unwrap_or(last);
    if k1 < k0 {
        return Ok((f64::NAN, f64::NAN));
    }
    let (tk, values) = crate::observe::quantity_series(s, &[id.to_string()], k0, k1, 1)?;
    let mut best = if max { f64::NEG_INFINITY } else { f64::INFINITY };
    let mut at = f64::NAN;
    for (j, &x) in values[0].iter().enumerate() {
        if x.is_finite() && ((max && x > best) || (!max && x < best)) {
            best = x;
            at = tk[j];
        }
    }
    if !best.is_finite() {
        return Ok((f64::NAN, f64::NAN));
    }
    let (lo, hi) = (k0 as f64 * s.dt, k1 as f64 * s.dt);
    refine_extreme(s, id, max, best, at, lo, hi)
}
