//! Numbers of the event detail view (26.53; the calculations of src/formula/eventDetail.ts of 26.52): the event
//! functions that fired, the effective inverse mass matrix of an impact with Stronge's phases, the velocity changes
//! and momenta, and the states, accelerations and energies before and after. The interface writes the texts and the
//! equations from these numbers.

use serde_json::{json, Map, Value};

use crate::dynamics::{add_row, energy, row_dot, row_minv_row, solve_mode, tol, Mode, System};
use crate::events::{build_event_fns, event_value, EventType, EventValue};
use crate::expr::SwitchKind;
use crate::impact::{ImpactKind, ImpactPoint};
use crate::kinematics::{compute_poses, contact_kin, distance_kin, hinge_kin, Pose, RowJ};
use crate::linalg::solve_dense;
use crate::js::js_max;
use crate::message::SimResult;
use crate::session::Session;
use crate::simulation::{ChangeType, Segment, SimEvent};
use crate::transport::{change_json, jnum};

fn name_of(sys: &System, id: &str) -> String {
    let m = &sys.model;
    if let Some(b) = m.bodies.iter().find(|b| b.id == id) {
        return b.name.clone();
    }
    if let Some(r) = m.ropes.iter().find(|r| r.id == id) {
        return r.name.clone();
    }
    if let Some(f) = m.forces.iter().find(|f| f.id == id) {
        return f.name.clone();
    }
    id.to_string()
}

fn segment_by_index(s: &Session, index: i64) -> Option<&Segment> {
    if index < 0 {
        return None;
    }
    s.segments.iter().find(|x| x.index as i64 == index)
}

/// The event functions of the mode that ended at the event, evaluated at the located state (firedValues).
fn fired_values(sys: &System, ev: &SimEvent, prev: &Segment) -> SimResult<Vec<Value>> {
    let model = &sys.model;
    let mode: &Mode = &prev.mode;
    let poses0 = compute_poses(model, &prev.x0);
    let sol0 = solve_mode(sys, &prev.x0, mode, None)?;
    let fns = build_event_fns(sys, mode, &poses0, &sol0, &prev.x0);
    let poses = compute_poses(model, &ev.before);
    let sol = solve_mode(sys, &ev.before, mode, Some(&poses))?;
    let values: Vec<f64> = fns.iter().map(|f| event_value(sys, mode, f, &poses, &sol, &ev.before)).collect();
    let who = |k: usize| -> String {
        let f = &fns[k];
        match f.value {
            EventValue::Liftoff { unit, .. }
            | EventValue::LeaveM1 { unit, .. }
            | EventValue::LeaveM2 { unit, .. }
            | EventValue::Slip { unit, .. }
            | EventValue::Stop { unit, .. }
            | EventValue::RollStart { unit, .. }
            | EventValue::RollStop { unit, .. } => {
                let p = &sys.pairs[mode.units[unit].pair];
                format!("{}–{}", model.bodies[p.x].name, model.bodies[p.y].name)
            }
            EventValue::Contact { pair, probe } => {
                let pr = &sys.pairs[pair].probes[probe];
                format!("{} → {}", model.bodies[pr.a].name, model.bodies[pr.b].name)
            }
            EventValue::Slack { rope } | EventValue::Taut { rope } | EventValue::Pulley { rope, .. } => model.ropes[rope].name.clone(),
            EventValue::Switch { k, .. } => model.forces[model.switch_force[k]].name.clone(),
            _ => String::new(),
        }
    };
    // A leave function of a point that is not point-against-face has no unit (an angle inside a vertex cone)
    let leave_not_pf = |k: usize| -> bool {
        match fns[k].value {
            EventValue::LeaveM1 { unit, point } | EventValue::LeaveM2 { unit, point } => {
                let u = &mode.units[unit];
                match u.points.get(point) {
                    Some(&fi) => !sys.pairs[u.pair].features[fi].is_pf(),
                    None => true,
                }
            }
            _ => false,
        }
    };
    let mut out = Vec::new();
    for &ty in &ev.triggers {
        let idx: Vec<usize> = (0..fns.len()).filter(|&k| fns[k].ty == ty).collect();
        let mut hit: Vec<usize> = idx.iter().copied().filter(|&k| values[k] < fns[k].threshold).collect();
        if hit.is_empty() && !idx.is_empty() {
            let mut best = idx[0];
            for &b in &idx[1..] {
                if values[b] - fns[b].threshold < values[best] - fns[best].threshold {
                    best = b;
                }
            }
            hit = vec![best];
        }
        for k in hit {
            out.push(json!({ "type": ty.name(), "who": who(k), "value": jnum(values[k]), "threshold": jnum(fns[k].threshold), "leaveNotPf": ty == EventType::Leave && leave_not_pf(k) }));
        }
    }
    Ok(out)
}

/// Bilateral rows (hinges, rods) at the given poses, in the order of resolveImpact.
fn bilateral_rows(sys: &System, poses: &[Pose]) -> Vec<RowJ> {
    let model = &sys.model;
    let mut rows = Vec::new();
    for h in &model.hinges {
        for k in hinge_kin(model, poses, &h.a, &h.b) {
            rows.push(k.j);
        }
    }
    for r in &model.rods {
        rows.push(distance_kin(model, poses, &r.a, &r.b).0.j);
    }
    rows
}

/// Effective inverse mass matrix of the rows `d` with the bilateral rows kept satisfied (effectiveW).
fn effective_w(sys: &System, poses: &[Pose], d: &[RowJ]) -> (Vec<Vec<f64>>, bool) {
    let model = &sys.model;
    let n = sys.n;
    let bil = bilateral_rows(sys, poses);
    let nb = bil.len();
    let mut wbb = vec![0.0; nb * nb];
    for x in 0..nb {
        for y in 0..nb {
            wbb[x * nb + y] = row_minv_row(model, &bil[x], &bil[y]);
        }
    }
    let response = |row: &RowJ| -> Vec<f64> {
        let mut g = vec![0.0; 3 * n];
        add_row(&mut g, row, 1.0);
        if nb > 0 {
            let rhs: Vec<f64> = (0..nb).map(|x| -row_minv_row(model, &bil[x], row)).collect();
            let lam = solve_dense(nb, &wbb, &rhs, 1e-12).x;
            for (x, l) in lam.iter().enumerate().take(nb) {
                add_row(&mut g, &bil[x], *l);
            }
        }
        for (i, _) in model.dynamic.iter().enumerate() {
            g[3 * i] *= model.dyn_inv_mass[i];
            g[3 * i + 1] *= model.dyn_inv_mass[i];
            g[3 * i + 2] *= model.dyn_inv_inertia[i];
        }
        g
    };
    let r: Vec<Vec<f64>> = d.iter().map(response).collect();
    let w: Vec<Vec<f64>> = d.iter().map(|di| r.iter().map(|rj| row_dot(di, rj, 0)).collect()).collect();
    let constrained = bil.iter().any(|b| d.iter().any(|di| row_minv_row(model, b, di).abs() > 0.0));
    (w, constrained)
}

/// One phase of Stronge's impulse path.
struct Phase {
    compression: bool,
    s: f64,
    d_pn: f64,
    pn: f64,
    pt: f64,
    vn: f64,
    vt: f64,
}

/// Stronge's frictional impact step by step (strongeTrace): None where strongeImpact would give none.
#[allow(clippy::too_many_arguments)]
#[allow(unused_assignments)]
fn stronge_trace(vn0: f64, vt0: f64, wnn: f64, wnt: f64, wtt: f64, e: f64, mu_k: f64, mu_s: f64) -> Option<(Vec<Phase>, f64, f64, f64, &'static str)> {
    if ![vn0, vt0, wnn, wnt, wtt, e, mu_k, mu_s].iter().all(|v| v.is_finite()) || !(wnn > 0.0) || !(wtt > 0.0) {
        return None;
    }
    let stickable = wnt.abs() <= mu_s * wtt;
    let after_zero = || -> f64 {
        if stickable {
            0.0
        } else if wnt > 0.0 {
            1.0
        } else {
            -1.0
        }
    };
    let mut s = if vt0.abs() > tol::VEL { if vt0 > 0.0 { 1.0 } else { -1.0 } } else { after_zero() };
    let s0 = s;
    let (mut pn, mut pt, mut vn, mut vt, mut work, mut work_c) = (0.0, 0.0, vn0, vt0, 0.0, 0.0);
    let mut compressing = vn < 0.0;
    let mut need = 0.0;
    let mut phases: Vec<Phase> = Vec::new();
    if !compressing {
        return Some((phases, 0.0, 0.0, 0.0, if s == 0.0 { "stick" } else { "slip" }));
    }
    for _ in 0..8 {
        let slope = if s == 0.0 { -wnt / wtt } else { -mu_k * s };
        let kap = wnn + wnt * slope;
        let rho = if s == 0.0 { 0.0 } else { wnt + wtt * slope };
        macro_rules! go {
            ($d:expr) => {{
                let d = $d;
                work += vn * d + 0.5 * kap * d * d;
                pn += d;
                pt += slope * d;
                vn += kap * d;
                vt += rho * d;
                phases.push(Phase { compression: compressing, s, d_pn: d, pn, pt, vn, vt });
            }};
        }
        macro_rules! fix {
            () => {{
                let p = phases.last_mut().expect("phase");
                p.vn = vn;
                p.vt = vt;
            }};
        }
        let mut d_trans = if s != 0.0 && s * rho < 0.0 { -vt / rho } else { f64::INFINITY };
        if s == 0.0 && !(kap > 1e-9 * wnn) {
            if compressing && vn < -1e-9 * (vn0.abs() + vt0.abs()) {
                return None;
            }
            compressing = false;
            need = 0.0;
            vn = js_max(vn, 0.0);
            break;
        }
        if compressing {
            let d_c = if kap > 0.0 { -vn / kap } else { f64::INFINITY };
            if !(d_c <= d_trans) {
                if !d_trans.is_finite() {
                    return None;
                }
                go!(d_trans);
                vt = 0.0;
                fix!();
                s = after_zero();
                continue;
            }
            go!(d_c);
            vn = 0.0;
            fix!();
            compressing = false;
            work_c = work;
            need = -e * e * work;
            d_trans -= d_c;
            if !(need > 0.0) {
                break;
            }
        }
        let disc = vn * vn + 2.0 * kap * need;
        let d_r = if disc >= 0.0 { 2.0 * need / (vn + disc.sqrt()) } else { f64::INFINITY };
        if d_r <= d_trans {
            go!(d_r);
            need = 0.0;
            break;
        }
        if !d_trans.is_finite() {
            return None;
        }
        let before = work;
        go!(d_trans);
        vt = 0.0;
        fix!();
        need -= work - before;
        s = after_zero();
    }
    if compressing || need > 1e-12 * work.abs() {
        return None;
    }
    let end = if s == 0.0 {
        "stick"
    } else if s == s0 {
        "slip"
    } else {
        "reverse"
    };
    Some((phases, pn, pt, work_c, end))
}

/// W_nn written with textbook terms when each body is free or turns about one fixed hinge (hingedTerms):
/// the terms and their sum; None when a body is constrained otherwise.
#[allow(clippy::too_many_arguments)]
fn hinged_terms(sys: &System, poses: &[Pose], a: Option<usize>, b: Option<usize>, wa: f64, wb: f64, cx: f64, cy: f64, nx: f64, ny: f64) -> Option<(Vec<Value>, f64)> {
    let model = &sys.model;
    let mut terms = Vec::new();
    let mut value = 0.0;
    for (bg, w, label) in [(a, wa, "A"), (b, wb, "B")] {
        let Some(bg) = bg else { continue };
        let body = &model.bodies[bg];
        if !body.dynamic {
            continue;
        }
        let on = |x: &crate::model::AnchorModel| x.body.is_some_and(|g| model.bodies[g].id == body.id);
        let hinges: Vec<&crate::model::HingeModel> = model.hinges.iter().filter(|h| on(&h.a) || on(&h.b)).collect();
        if model.rods.iter().any(|r| on(&r.a) || on(&r.b)) || model.ropes.iter().any(|r| on(&r.a) || on(&r.b)) {
            return None;
        }
        if hinges.is_empty() {
            value += body.inv_mass;
            let rot = body.inv_inertia > 0.0 && w.abs() > 1e-12;
            if rot {
                value += w * w * body.inv_inertia;
            }
            terms.push(json!({ "label": label, "kind": "free", "mass": jnum(body.mass), "inertia": jnum(body.inertia), "w": jnum(w), "rotates": rot }));
            continue;
        }
        if hinges.len() != 1 {
            return None;
        }
        let h = hinges[0];
        let other = if on(&h.a) { &h.b } else { &h.a };
        if other.body.is_some_and(|g| model.bodies[g].dynamic) {
            return None;
        }
        let mine = if on(&h.a) { &h.a } else { &h.b };
        let pose = &poses[body.global];
        let ox = pose.x + pose.c * mine.local.x - pose.s * mine.local.y;
        let oy = pose.y + pose.s * mine.local.x + pose.c * mine.local.y;
        let (rx, ry) = (cx - ox, cy - oy);
        let arm = rx * ny - ry * nx;
        let io = body.inertia + body.mass * ((pose.x - ox) * (pose.x - ox) + (pose.y - oy) * (pose.y - oy));
        terms.push(json!({ "label": label, "kind": "hinge", "arm": jnum(arm), "IO": jnum(io) }));
        value += arm * arm / io;
    }
    if terms.is_empty() {
        None
    } else {
        Some((terms, value))
    }
}

/// Whether a body is attached to a hinge, rod or rope (connectors that act with impulses).
fn attached_impulsive(sys: &System, id: &str) -> bool {
    let m = &sys.model;
    let on = |a: &crate::model::AnchorModel| a.body.is_some_and(|g| m.bodies[g].id == id);
    m.hinges.iter().any(|h| on(&h.a) || on(&h.b))
        || m.rods.iter().any(|r| on(&r.a) || on(&r.b))
        || m.ropes.iter().any(|r| on(&r.a) || on(&r.b) || r.pulleys.iter().any(|&(pi, _)| m.pulleys[pi].body.is_some_and(|g| m.bodies[g].id == id)))
}

fn momentum(sys: &System, x: &[f64], idx: &[usize]) -> (f64, f64) {
    let n = sys.n;
    let (mut px, mut py) = (0.0, 0.0);
    for &i in idx {
        let b = &sys.model.bodies[sys.model.dynamic[i]];
        px += b.mass * x[3 * n + 3 * i];
        py += b.mass * x[3 * n + 3 * i + 1];
    }
    (px, py)
}

fn close(a: f64, b: f64) -> bool {
    (a - b).abs() <= 1e-6 * js_max(js_max(a.abs(), b.abs()), 1e-12)
}

fn opt(v: Option<f64>) -> Value {
    v.map(jnum).unwrap_or(Value::Null)
}

/// Data of one impact point (impactBlocks).
fn impact_point(sys: &System, ev: &SimEvent, p: &ImpactPoint, single: bool, change: Option<usize>) -> Value {
    let model = &sys.model;
    let n = sys.n;
    let poses = compute_poses(model, &ev.before);
    let mut o = Map::new();
    o.insert("change".into(), json!(change.map(|c| c as i64).unwrap_or(-1)));
    o.insert("kind".into(), json!(match p.kind {
        ImpactKind::Contact => "contact",
        ImpactKind::Rope => "rope",
        ImpactKind::Limit => "limit",
    }));
    o.insert("vnBefore".into(), jnum(p.vn_before));
    o.insert("vnAfter".into(), jnum(p.vn_after));
    o.insert("impulse".into(), jnum(p.impulse));
    o.insert("restitution".into(), jnum(p.restitution));
    o.insert("nx".into(), jnum(p.nx));
    o.insert("ny".into(), jnum(p.ny));
    o.insert("cx".into(), jnum(p.cx));
    o.insert("cy".into(), jnum(p.cy));
    if let Some(v) = p.tangent_impulse {
        o.insert("tangentImpulse".into(), jnum(v));
    }
    if let Some(v) = p.vt_before {
        o.insert("vtBefore".into(), jnum(v));
    }
    if let Some(v) = p.vt_after {
        o.insert("vtAfter".into(), jnum(v));
    }
    if let Some(f) = p.friction {
        o.insert("friction".into(), json!(f));
    }
    if p.kind == ImpactKind::Rope {
        let rope = model.ropes.get(p.rope.max(0) as usize).filter(|_| p.rope >= 0);
        o.insert("ropeName".into(), json!(rope.map(|r| r.name.clone()).unwrap_or_default()));
        if single {
            if let Some(rope) = rope {
                let (k, _) = crate::kinematics::rope_kin(model, &poses, rope);
                let (w, _) = effective_w(sys, &poses, &[k.j]);
                o.insert("W".into(), jnum(w[0][0]));
            }
        }
        return Value::Object(o);
    }
    let feature = match (p.pair, p.feature) {
        (Some(pi), Some(fi)) => Some(&sys.pairs[pi].features[fi]),
        _ => None,
    };
    let (ag, bg) = match feature {
        Some(f) => (Some(f.a.body), Some(f.b_body())),
        None => (None, None),
    };
    o.insert("nameA".into(), json!(ag.map(|g| model.bodies[g].name.clone()).unwrap_or_default()));
    o.insert("nameB".into(), json!(bg.map(|g| model.bodies[g].name.clone()).unwrap_or_default()));
    let mat = p.pair.map(|pi| sys.pairs[pi].material);
    let mu_k = mat.map(|m| m.mu_k).unwrap_or(0.0);
    let mu_s = js_max(mat.map(|m| m.mu_s).unwrap_or(0.0), mu_k);
    o.insert("muK".into(), jnum(mu_k));
    o.insert("muS".into(), jnum(mu_s));
    let frictional = p.tangent_impulse.is_some();
    if single {
        if let Some(f) = feature {
            let kin = contact_kin(model, f, &poses);
            let rows: Vec<RowJ> = if frictional { vec![kin.jn.clone(), kin.jt.clone()] } else { vec![kin.jn.clone()] };
            let (w, constrained) = effective_w(sys, &poses, &rows);
            let wnn = w[0][0];
            o.insert("W".into(), Value::Array(w.iter().map(|r| Value::Array(r.iter().map(|v| jnum(*v)).collect())).collect()));
            o.insert("constrained".into(), json!(constrained));
            if constrained {
                let hinged = hinged_terms(sys, &poses, ag, bg, kin.jn.aw, -kin.jn.bw, p.cx, p.cy, p.nx, p.ny);
                o.insert("hinged".into(), match hinged {
                    Some((terms, value)) if close(value, wnn) => json!({ "terms": terms, "value": jnum(value) }),
                    _ => Value::Null,
                });
            } else {
                let mut terms = Vec::new();
                for (b, w, label) in [(ag, kin.jn.aw, "A"), (bg, -kin.jn.bw, "B")] {
                    let Some(b) = b else { continue };
                    let body = &model.bodies[b];
                    if !body.dynamic {
                        continue;
                    }
                    terms.push(json!({ "label": label, "mass": jnum(body.mass), "inertia": jnum(body.inertia), "w": jnum(w), "rotates": body.inv_inertia > 0.0 && w.abs() > 1e-12 }));
                }
                o.insert("wTerms".into(), Value::Array(terms));
            }
            if frictional && w.len() >= 2 {
                let (wnt, wtt) = (0.5 * (w[0][1] + w[1][0]), w[1][1]);
                let vt0 = p.vt_before.unwrap_or(0.0);
                let tr = stronge_trace(p.vn_before, vt0, wnn, wnt, wtt, p.restitution, mu_k, mu_s);
                let jt = p.tangent_impulse.unwrap_or(0.0);
                o.insert("stronge".into(), match tr {
                    Some((phases, pn, pt, work_c, end)) if close(pn, p.impulse) && close(pt, jt) && !phases.is_empty() => json!({
                        "phases": phases.iter().map(|ph| json!({ "compression": ph.compression, "s": jnum(ph.s), "dPn": jnum(ph.d_pn), "Pn": jnum(ph.pn), "Pt": jnum(ph.pt), "vn": jnum(ph.vn), "vt": jnum(ph.vt) })).collect::<Vec<_>>(),
                        "Pn": jnum(pn), "Pt": jnum(pt), "workC": jnum(work_c), "end": end
                    }),
                    _ => Value::Null,
                });
            }
            if !constrained {
                let jt = p.tangent_impulse.unwrap_or(0.0);
                let (tx, ty) = (-p.ny, p.nx);
                let mut dv = Vec::new();
                for (b, sign, label) in [(ag, 1.0, "A"), (bg, -1.0, "B")] {
                    let Some(b) = b else { continue };
                    let body = &model.bodies[b];
                    if !body.dynamic {
                        continue;
                    }
                    let i = body.index as usize;
                    let vx = sign * (p.impulse * p.nx + jt * tx) / body.mass;
                    let vy = sign * (p.impulse * p.ny + jt * ty) / body.mass;
                    let dw = if body.inv_inertia > 0.0 { Some(ev.after[3 * n + 3 * i + 2] - ev.before[3 * n + 3 * i + 2]) } else { None };
                    dv.push(json!({ "label": label, "sign": jnum(sign), "mass": jnum(body.mass), "vx": jnum(vx), "vy": jnum(vy), "dw": opt(dw) }));
                }
                o.insert("dv".into(), Value::Array(dv));
                let both = match (ag, bg) {
                    (Some(a), Some(b)) => model.bodies[a].dynamic && model.bodies[b].dynamic && !attached_impulsive(sys, &model.bodies[a].id) && !attached_impulsive(sys, &model.bodies[b].id),
                    _ => false,
                };
                if both {
                    let idx = [model.bodies[ag.expect("a")].index as usize, model.bodies[bg.expect("b")].index as usize];
                    let p0 = momentum(sys, &ev.before, &idx);
                    let p1 = momentum(sys, &ev.after, &idx);
                    o.insert("momentum".into(), json!({ "p0": [jnum(p0.0), jnum(p0.1)], "p1": [jnum(p1.0), jnum(p1.1)] }));
                }
            }
        }
    }
    Value::Object(o)
}

/// Bodies an event concerns (dynamic slots; all dynamic bodies for a solver switch), at most four.
fn involved_bodies(sys: &System, ev: &SimEvent) -> Vec<usize> {
    let model = &sys.model;
    let mut ids: Vec<String> = Vec::new();
    let mut add = |id: &str| {
        if !ids.iter().any(|x| x == id) {
            ids.push(id.to_string());
        }
    };
    for ch in &ev.changes {
        for id in &ch.bodies {
            add(id);
        }
        if ch.kind() == ChangeType::Switch {
            if let Some(f) = model.forces.iter().find(|x| x.id == ch.subject) {
                if let Some(g) = f.a.body {
                    add(&model.bodies[g].id.clone());
                }
            }
        }
        if matches!(ch.kind(), ChangeType::Slack | ChangeType::Taut) {
            if let Some(r) = model.ropes.iter().find(|x| x.id == ch.subject) {
                for a in [&r.a, &r.b] {
                    if let Some(g) = a.body {
                        add(&model.bodies[g].id.clone());
                    }
                }
            }
        }
    }
    let mut list: Vec<usize> = ids.iter().filter_map(|id| model.bodies.iter().find(|b| &b.id == id)).filter(|b| b.dynamic).map(|b| b.index as usize).collect();
    if list.is_empty() {
        list = model.dynamic.iter().map(|&g| model.bodies[g].index as usize).collect();
    }
    list.truncate(4);
    list
}

fn energies(sys: &System, x: &[f64]) -> Value {
    let e = energy(sys, x, &compute_poses(&sys.model, x));
    json!({ "kinetic": jnum(e.kinetic), "gravity": jnum(e.gravity), "spring": jnum(e.spring), "total": jnum(e.total) })
}

/// The numbers of the detail view of event `index` (None when there is no such event).
pub fn event_data(s: &Session, index: usize) -> Option<Value> {
    let ev = s.events.get(index)?;
    let sys = s.system.clone();
    let model = &sys.model;
    let n = sys.n;
    let prev = if ev.index == 0 && ev.t == 0.0 && ev.segment == 0 { None } else { segment_by_index(s, ev.segment as i64 - 1) };
    let next = segment_by_index(s, ev.segment as i64);
    let reduced = s.reduced_from.is_some_and(|r| ev.t > r + 1e-12);
    let mut o = Map::new();
    o.insert("index".into(), json!(ev.index));
    o.insert("t".into(), jnum(ev.t));
    o.insert("triggers".into(), json!(ev.triggers.iter().map(|t| t.name()).collect::<Vec<_>>()));
    o.insert("changes".into(), Value::Array(ev.changes.iter().map(change_json).collect()));
    o.insert("segment".into(), json!(ev.segment));
    o.insert("hasPrev".into(), json!(prev.is_some()));
    o.insert("prevReduced".into(), json!(prev.is_some_and(|p| p.reduced)));
    o.insert("reduced".into(), json!(reduced));
    o.insert("dt".into(), jnum(s.dt));
    // Names of the objects the changes refer to, and the forces of switch changes
    let mut names = Map::new();
    let mut switches = Vec::new();
    for (ci, ch) in ev.changes.iter().enumerate() {
        for id in ch.bodies.iter().chain(std::iter::once(&ch.subject)) {
            names.insert(id.clone(), json!(name_of(&sys, id)));
        }
        if ch.kind() == ChangeType::Switch {
            let f = model.forces.iter().find(|x| x.id == ch.subject);
            let def = ch.switch_index.and_then(|k| model.arena.switches.get(k));
            let expr = f.and_then(|f| {
                let c = s.meta.doc.get("connectors")?.as_array()?.iter().find(|c| c.get("id").and_then(|v| v.as_str()) == Some(&f.id))?;
                let e = c.get("expr")?;
                Some(format!("Fx = {}, Fy = {}", e.get("x")?.as_str()?, e.get("y")?.as_str()?))
            });
            switches.push(json!({
                "change": ci, "force": f.map(|f| f.name.clone()).unwrap_or_else(|| ch.subject.clone()),
                "kind": def.map(|d| match d.kind { SwitchKind::Step => "step", SwitchKind::Sign => "sign", SwitchKind::If => "if", SwitchKind::Abs => "abs", SwitchKind::Min => "min", SwitchKind::Max => "max" }).unwrap_or(""),
                "expr": expr.unwrap_or_default()
            }));
        }
    }
    o.insert("names".into(), Value::Object(names));
    o.insert("switches".into(), Value::Array(switches));
    let fired = match prev {
        Some(p) if !p.reduced && !ev.triggers.is_empty() => fired_values(&sys, ev, p).ok().map(Value::Array).unwrap_or(Value::Null),
        _ => Value::Null,
    };
    o.insert("fired".into(), fired);
    // Impact
    o.insert(
        "impact".into(),
        match &ev.impact {
            None => Value::Null,
            Some(imp) => {
                let single = imp.points.len() == 1;
                let points: Vec<Value> = imp
                    .points
                    .iter()
                    .map(|p| {
                        let ch = ev.changes.iter().position(|x| match p.kind {
                            ImpactKind::Contact => x.kind() == ChangeType::Impact && p.pair.is_some_and(|pi| x.subject == sys.pairs[pi].key),
                            _ => x.kind() == ChangeType::Taut && p.rope >= 0 && model.ropes.get(p.rope as usize).is_some_and(|r| x.subject == r.id),
                        });
                        impact_point(&sys, ev, p, single, ch)
                    })
                    .collect();
                let warning = s.impact_warnings.iter().find(|(i, _)| *i == ev.index).map(|(_, w)| w.clone()).unwrap_or(Value::Null);
                json!({
                    "single": single, "points": points, "warning": warning,
                    "energyBefore": jnum(imp.energy_before), "energyAfter": jnum(imp.energy_after), "loss": jnum(imp.loss)
                })
            }
        },
    );
    // States, accelerations and energies before and after
    let acc = |seg: Option<&Segment>, x: &[f64]| -> Option<Vec<f64>> { seg.and_then(|sg| solve_mode(&sys, x, &sg.mode, None).ok()).map(|sol| sol.acc) };
    let a0 = acc(prev, &ev.before);
    let a1 = acc(next, &ev.after);
    let mut bodies = Vec::new();
    for i in involved_bodies(&sys, ev) {
        let b = &model.bodies[model.dynamic[i]];
        let st = |x: &[f64]| vec![jnum(x[3 * i]), jnum(x[3 * i + 1]), jnum(x[3 * i + 2]), jnum(x[3 * n + 3 * i]), jnum(x[3 * n + 3 * i + 1]), jnum(x[3 * n + 3 * i + 2])];
        let speed = |x: &[f64]| crate::dmath::hypot(x[3 * n + 3 * i], x[3 * n + 3 * i + 1]);
        let ek = |x: &[f64]| 0.5 * b.mass * (x[3 * n + 3 * i] * x[3 * n + 3 * i] + x[3 * n + 3 * i + 1] * x[3 * n + 3 * i + 1]) + 0.5 * b.inertia * if b.inv_inertia > 0.0 { x[3 * n + 3 * i + 2] * x[3 * n + 3 * i + 2] } else { 0.0 };
        let accj = |a: &Option<Vec<f64>>| a.as_ref().map(|a| json!([jnum(a[3 * i]), jnum(a[3 * i + 1]), jnum(a[3 * i + 2])])).unwrap_or(Value::Null);
        bodies.push(json!({
            "index": i, "name": b.name, "rotates": b.inv_inertia > 0.0,
            "before": st(&ev.before), "after": st(&ev.after), "speedBefore": jnum(speed(&ev.before)), "speedAfter": jnum(speed(&ev.after)),
            "accBefore": accj(&a0), "accAfter": accj(&a1), "ekBefore": jnum(ek(&ev.before)), "ekAfter": jnum(ek(&ev.after))
        }));
    }
    o.insert("state".into(), json!({ "bodies": bodies, "before": energies(&sys, &ev.before), "after": energies(&sys, &ev.after) }));
    Some(Value::Object(o))
}
