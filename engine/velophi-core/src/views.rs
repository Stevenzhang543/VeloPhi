//! Views of a session for the interface (26.53, D65): the compiled model as a descriptor, and everything the
//! canvas draws at one instant — poses, pulley axles, connector anchors, rope paths (points and arcs), the forces
//! on each body with their kind and label, accelerations — plus the sampled data of trajectories, strobe images,
//! motion blur, vector scales and the particle emitters of impacts and sliding contacts. The interface only
//! transforms these to the screen; it never evaluates kinematics or dynamics itself.
//!
//! TypeScript reference: tests/reference/views.ts (the 26.52 drawing code with its numeric parts kept).

use serde_json::{json, Map, Value};

use crate::dmath::atan2 as atan2_det;
use crate::dynamics::{force_value, initial_state, solve_mode, switch_branches, Friction, Mode, ModeSolution, RowKind, System};
use crate::kinematics::{anchor_state, compute_poses, contact_kin, pulley_center, rope_kin, Pose};
use crate::impact::ImpactKind;
use crate::message::SimResult;
use crate::model::{central_force, AnchorModel, BodyModel, Model, RopeModel, ShapeModel, ShapePiece};
use crate::scene::{Material, Vec2};
use crate::session::Session;
use crate::transport::{jnum, Blob};

fn v2(v: Vec2) -> Value {
    json!({ "x": jnum(v.x), "y": jnum(v.y) })
}

fn anchor_json(a: &AnchorModel) -> Value {
    json!({ "body": a.body, "local": v2(a.local) })
}

fn material_json(m: &Material) -> Value {
    json!({ "muS": jnum(m.mu_s), "muK": jnum(m.mu_k), "restitution": jnum(m.restitution), "rolling": jnum(m.rolling) })
}

fn piece_json(p: &ShapePiece) -> Value {
    match p {
        ShapePiece::Circle { center, radius } => json!({ "kind": "circle", "center": v2(*center), "radius": jnum(*radius) }),
        ShapePiece::Polygon { verts, normals } => json!({ "kind": "polygon", "verts": verts.iter().map(|v| v2(*v)).collect::<Vec<_>>(), "normals": normals.iter().map(|v| v2(*v)).collect::<Vec<_>>() }),
    }
}

/// Compiled shape (the drawing parts; the contact features stay in the core).
pub fn shape_json(s: &ShapeModel) -> Value {
    match s {
        ShapeModel::Circle { radius } => json!({ "kind": "circle", "radius": jnum(*radius) }),
        ShapeModel::Polygon { verts, normals, lengths } => json!({
            "kind": "polygon", "verts": verts.iter().map(|v| v2(*v)).collect::<Vec<_>>(), "normals": normals.iter().map(|v| v2(*v)).collect::<Vec<_>>(),
            "lengths": lengths.iter().map(|v| jnum(*v)).collect::<Vec<_>>()
        }),
        ShapeModel::Complex(c) => json!({ "kind": "complex", "pieces": c.pieces.iter().map(piece_json).collect::<Vec<_>>(), "outline": c.outline.iter().map(piece_json).collect::<Vec<_>>() }),
    }
}

fn body_json(b: &BodyModel) -> Value {
    let mut v = json!({
        "global": b.global, "index": b.index, "id": b.id, "name": b.name, "dynamic": b.dynamic, "shape": shape_json(&b.shape),
        "mass": jnum(b.mass), "inertia": jnum(b.inertia), "invMass": jnum(b.inv_mass), "invInertia": jnum(b.inv_inertia),
        "material": material_json(&b.material), "beltSpeed": jnum(b.belt_speed), "bound": jnum(b.bound),
        "staticPos": v2(b.static_pos), "staticAngle": jnum(b.static_angle), "dragLin": jnum(b.drag_lin), "dragQuad": jnum(b.drag_quad),
        "attract": jnum(b.attract), "gravPos": v2(b.grav_pos)
    });
    // 26.54 (D78): only charged bodies carry the key (the descriptor of older scenes is unchanged)
    if b.charge != 0.0 {
        v["charge"] = jnum(b.charge);
    }
    v
}

/// The compiled model and the state layout of a system, by index (the interface links the indices into objects).
pub fn model_info(sys: &System) -> Value {
    let m = &sys.model;
    let named = |id: &str, name: &str| -> Map<String, Value> {
        let mut o = Map::new();
        o.insert("id".into(), json!(id));
        o.insert("name".into(), json!(name));
        o
    };
    let with = |mut o: Map<String, Value>, kv: Vec<(&str, Value)>| -> Value {
        for (k, v) in kv {
            o.insert(k.into(), v);
        }
        Value::Object(o)
    };
    let mut info = json!({
        "n": sys.n, "size": sys.size, "auxBase": sys.aux_base, "timeSlot": sys.time_slot.map(|s| s as i64).unwrap_or(-1),
        "bodies": m.bodies.iter().map(body_json).collect::<Vec<_>>(),
        "dynamic": m.dynamic,
        "pulleys": m.pulleys.iter().map(|p| with(named(&p.id, &p.name), vec![("position", v2(p.position)), ("radius", jnum(p.radius)), ("body", json!(p.body))])).collect::<Vec<_>>(),
        "ropes": m.ropes.iter().map(|r| with(named(&r.id, &r.name), vec![
            ("a", anchor_json(&r.a)), ("b", anchor_json(&r.b)),
            ("pulleys", Value::Array(r.pulleys.iter().map(|(p, w)| json!({ "pulley": p, "wrap": jnum(*w) })).collect())),
            ("length", jnum(r.length)), ("movable", json!(r.movable))
        ])).collect::<Vec<_>>(),
        "rods": m.rods.iter().map(|r| with(named(&r.id, &r.name), vec![("a", anchor_json(&r.a)), ("b", anchor_json(&r.b)), ("length", jnum(r.length))])).collect::<Vec<_>>(),
        "springs": m.springs.iter().map(|s| with(named(&s.id, &s.name), vec![
            ("a", anchor_json(&s.a)), ("b", anchor_json(&s.b)), ("stiffness", jnum(s.stiffness)), ("restLength", jnum(s.rest_length)),
            ("damping", jnum(s.damping)), ("cubic", jnum(s.cubic)), ("damper", json!(s.damper))
        ])).collect::<Vec<_>>(),
        "hinges": m.hinges.iter().map(|h| with(named(&h.id, &h.name), vec![("a", anchor_json(&h.a)), ("b", anchor_json(&h.b))])).collect::<Vec<_>>(),
        "forces": m.forces.iter().map(|f| with(named(&f.id, &f.name), vec![("a", anchor_json(&f.a)), ("force", v2(f.force)), ("expr", json!(f.expr.is_some()))])).collect::<Vec<_>>(),
        "welds": m.welds.iter().map(|w| with(named(&w.id, &w.name), vec![("a", anchor_json(&w.a)), ("b", anchor_json(&w.b)), ("angle0", jnum(w.angle0))])).collect::<Vec<_>>(),
        "sliders": m.sliders.iter().map(|s| with(named(&s.id, &s.name), vec![
            ("a", anchor_json(&s.a)), ("b", anchor_json(&s.b)), ("axis", v2(s.axis)), ("free", json!(s.free)), ("angle0", jnum(s.angle0)),
            ("limited", json!(s.limited)), ("lo", jnum(s.lo)), ("hi", jnum(s.hi)), ("e", jnum(s.e))
        ])).collect::<Vec<_>>(),
        "motors": m.motors.iter().map(|x| with(named(&x.id, &x.name), vec![
            ("a", anchor_json(&x.a)), ("b", anchor_json(&x.b)), ("mode", json!(if x.torque_mode { "torque" } else { "speed" })),
            ("speed", jnum(x.speed)), ("torque", jnum(x.torque)), ("maxTorque", jnum(x.max_torque)), ("limited", json!(x.limited))
        ])).collect::<Vec<_>>(),
        "gears": m.gears.iter().map(|g| with(named(&g.id, &g.name), vec![("a", json!(g.a)), ("b", json!(g.b)), ("ratio", jnum(g.ratio)), ("offset0", jnum(g.offset0))])).collect::<Vec<_>>(),
        "centrals": m.centrals.iter().map(|c| with(named(&c.id, &c.name), vec![("a", anchor_json(&c.a)), ("k", jnum(c.k)), ("n", jnum(c.n)), ("targets", json!(c.targets))])).collect::<Vec<_>>(),
        "hasLimits": m.has_limits, "hasSlip": m.has_slip, "G": jnum(m.g_const), "attractors": m.attractors,
        "noCollide": m.no_collide, "hasExpr": m.has_expr, "forceScale": jnum(m.force_scale), "accelScale": jnum(m.accel_scale),
        "warnings": m.warnings.iter().map(|w| w.to_json()).collect::<Vec<_>>(),
        "pairs": sys.pairs.iter().map(|p| json!({ "index": p.index, "key": p.key, "X": p.x, "Y": p.y, "material": material_json(&p.material) })).collect::<Vec<_>>()
    });
    // 26.54 (D78): the fields of an electric scene (absent otherwise)
    if m.electric {
        info["electric"] = json!({ "E": v2(m.e_field), "B": jnum(m.b_field), "k": jnum(m.k_coulomb), "charged": m.charged });
    }
    info
}

// ---- Rope drawing ----

/// Drawn path of a rope: the points (A, the tangent points on each pulley in and out, B) as x, y pairs, and the
/// arcs on the wheels as (centre x, y, radius, start angle, end angle, wrap) — angles for drawing only.
pub fn rope_drawing(model: &Model, poses: &[Pose], rope: &RopeModel) -> (Vec<f64>, Vec<f64>) {
    let pa = anchor_state(poses, &rope.a);
    let pb = anchor_state(poses, &rope.b);
    let a = Vec2 { x: pa.px, y: pa.py };
    let b = Vec2 { x: pb.px, y: pb.py };
    if rope.pulleys.is_empty() {
        return (vec![a.x, a.y, b.x, b.y], Vec::new());
    }
    let circles: Vec<(Vec2, f64, f64, f64)> = rope
        .pulleys
        .iter()
        .map(|(pi, wrap)| {
            let p = &model.pulleys[*pi];
            (if rope.movable { pulley_center(poses, p) } else { p.position }, wrap * p.radius, p.radius, *wrap)
        })
        .collect();
    let mut points = vec![a.x, a.y];
    let mut arrivals = Vec::new();
    let mut departures = Vec::new();
    let first = tangent(a, 0.0, circles[0].0, circles[0].1);
    arrivals.push(first.1);
    points.extend([first.1.x, first.1.y]);
    for i in 0..circles.len() - 1 {
        let seg = tangent(circles[i].0, circles[i].1, circles[i + 1].0, circles[i + 1].1);
        departures.push(seg.0);
        arrivals.push(seg.1);
        points.extend([seg.0.x, seg.0.y, seg.1.x, seg.1.y]);
    }
    let last_c = circles[circles.len() - 1];
    let last = tangent(last_c.0, last_c.1, b, 0.0);
    departures.push(last.0);
    points.extend([last.0.x, last.0.y, b.x, b.y]);
    let mut arcs = Vec::new();
    for (i, c) in circles.iter().enumerate() {
        if c.2 <= 0.0 {
            continue;
        }
        let a0 = atan2_det(arrivals[i].y - c.0.y, arrivals[i].x - c.0.x);
        let a1 = atan2_det(departures[i].y - c.0.y, departures[i].x - c.0.x);
        arcs.extend([c.0.x, c.0.y, c.2, a0, a1, c.3]);
    }
    (points, arcs)
}

/// Tangent line between two signed circles (kinematics.ts `tangent`): departure, arrival.
fn tangent(c1: Vec2, rho1: f64, c2: Vec2, rho2: f64) -> (Vec2, Vec2) {
    let dx = c2.x - c1.x;
    let dy = c2.y - c1.y;
    let l = (dx * dx + dy * dy).sqrt();
    let k = (rho1 - rho2) / l;
    let q = crate::js::js_max(0.0, 1.0 - k * k).sqrt();
    let mut nx = (k * dx + q * -dy) / l;
    let mut ny = (k * dy + q * dx) / l;
    if -ny * dx + nx * dy < 0.0 {
        nx = (k * dx - q * -dy) / l;
        ny = (k * dy - q * dx) / l;
    }
    (Vec2 { x: c1.x + rho1 * nx, y: c1.y + rho1 * ny }, Vec2 { x: c2.x + rho2 * nx, y: c2.y + rho2 * ny })
}

// ---- Forces on a body ----

/// A force to draw: application point (m), components (N), kind and label (a source text of the interface).
#[derive(Clone, Debug)]
pub struct ForceArrow {
    pub x: f64,
    pub y: f64,
    pub fx: f64,
    pub fy: f64,
    pub kind: &'static str,
    pub label: String,
}

impl ForceArrow {
    pub fn to_json(&self) -> Value {
        json!({ "x": jnum(self.x), "y": jnum(self.y), "fx": jnum(self.fx), "fy": jnum(self.fy), "kind": self.kind, "label": self.label })
    }
}

fn arrow(x: f64, y: f64, fx: f64, fy: f64, kind: &'static str, label: &str) -> ForceArrow {
    ForceArrow { x, y, fx, fy, kind, label: label.to_string() }
}

/// Forces acting on body `g` (global index): gravity, contacts, connectors, drag, gravitation, applied and central
/// forces (renderer.ts `bodyForces`). Without a mode solution only the forces that do not need one are listed.
pub fn body_forces(sys: &System, mode: Option<&Mode>, sol: Option<&ModeSolution>, g: usize, poses: &[Pose], x: &[f64]) -> Vec<ForceArrow> {
    let model = &sys.model;
    let b = &model.bodies[g];
    let mut out = Vec::new();
    let grav = model.settings.gravity;
    let pose = poses[g];
    if grav.x != 0.0 || grav.y != 0.0 {
        out.push(arrow(pose.x, pose.y, b.mass * grav.x, b.mass * grav.y, "gravity", "G"));
    }
    if let (Some(mode), Some(sol)) = (mode, sol) {
        for (ui, u) in mode.units.iter().enumerate() {
            let pair = &sys.pairs[u.pair];
            if u.points.is_empty() || (pair.x != g && pair.y != g) {
                continue;
            }
            let st = &sol.units[ui];
            let np = u.points.len() as f64;
            let (mut cx, mut cy) = (0.0, 0.0);
            for (pi, fi) in u.points.iter().enumerate() {
                let k = &st.point_kin[pi];
                let f = &pair.features[*fi];
                let sign = if f.a.body == g { 1.0 } else { -1.0 };
                let l = st.point_lambda[pi];
                let label = if u.points.len() > 1 { format!("N{}", pi + 1) } else { "N".to_string() };
                out.push(ForceArrow { x: k.cx, y: k.cy, fx: sign * l * k.nx, fy: sign * l * k.ny, kind: "normal", label });
                cx += k.cx / np;
                cy += k.cy / np;
            }
            if u.friction != Friction::None && st.tangent.abs() > 1e-12 {
                let sign = if pair.features[u.ref_].a.body == g { 1.0 } else { -1.0 };
                out.push(arrow(cx, cy, sign * st.tangent * st.ref_kin.tx, sign * st.tangent * st.ref_kin.ty, "friction", "f"));
            }
        }
        for (k, r) in model.ropes.iter().enumerate() {
            if !mode.taut.get(k).copied().unwrap_or(false) {
                continue;
            }
            let t = sol.rope_tension[k];
            if t.abs() < 1e-12 {
                continue;
            }
            let (_, path) = rope_kin(model, poses, r);
            if r.a.body == Some(g) {
                let p = anchor_state(poses, &r.a);
                out.push(arrow(p.px, p.py, t * path.u1.x, t * path.u1.y, "tension", "T"));
            }
            if r.b.body == Some(g) {
                let p = anchor_state(poses, &r.b);
                out.push(arrow(p.px, p.py, -t * path.u_last.x, -t * path.u_last.y, "tension", "T"));
            }
        }
        // End stops of sliders on the carriage (and the reaction on the rail's body)
        for (k, row) in sol.rows.iter().enumerate() {
            if row.kind != RowKind::Limit {
                continue;
            }
            let sl = &model.sliders[row.owner];
            let l = sol.lambda[k];
            if l.abs() < 1e-12 {
                continue;
            }
            if sl.b.body == Some(g) {
                let p = anchor_state(poses, &sl.b);
                out.push(arrow(p.px, p.py, row.j.bx * l, row.j.by * l, "limit", "F限"));
            }
            if sl.a.body == Some(g) {
                let p = anchor_state(poses, &sl.a);
                out.push(arrow(p.px, p.py, row.j.ax * l, row.j.ay * l, "limit", "F限"));
            }
        }
        for (k, row) in sol.rows.iter().enumerate() {
            let (a, bb) = match row.kind {
                RowKind::Hinge => (&model.hinges[row.owner].a, &model.hinges[row.owner].b),
                RowKind::Weld => (&model.welds[row.owner].a, &model.welds[row.owner].b),
                RowKind::Motor => (&model.motors[row.owner].a, &model.motors[row.owner].b),
                RowKind::Slider => (&model.sliders[row.owner].a, &model.sliders[row.owner].b),
                RowKind::Rod => (&model.rods[row.owner].a, &model.rods[row.owner].b),
                _ => continue,
            };
            let pin = matches!(row.kind, RowKind::Hinge | RowKind::Weld | RowKind::Motor);
            if a.body != Some(g) && bb.body != Some(g) {
                continue;
            }
            if pin && row.sub != 0 {
                continue;
            }
            if row.kind == RowKind::Slider && row.sub != 0 {
                continue;
            }
            let on_a = a.body == Some(g);
            let side = if on_a { a } else { bb };
            let p = anchor_state(poses, side);
            if pin {
                let (mut fx, mut fy) = (0.0, 0.0);
                for (k2, r2) in sol.rows.iter().enumerate() {
                    if r2.kind == row.kind && r2.owner == row.owner {
                        if r2.sub == 0 {
                            fx = sol.lambda[k2];
                        } else if r2.sub == 1 {
                            fy = sol.lambda[k2];
                        }
                    }
                }
                let sign = if on_a { 1.0 } else { -1.0 };
                out.push(arrow(p.px, p.py, sign * fx, sign * fy, "pin", "F"));
            } else {
                let l = sol.lambda[k];
                let (fx, fy) = if on_a { (row.j.ax * l, row.j.ay * l) } else { (row.j.bx * l, row.j.by * l) };
                out.push(arrow(p.px, p.py, fx, fy, "pin", "F"));
            }
        }
    }
    for s in &model.springs {
        if s.a.body != Some(g) && s.b.body != Some(g) {
            continue;
        }
        let pa = anchor_state(poses, &s.a);
        let pb = anchor_state(poses, &s.b);
        let dx = pa.px - pb.px;
        let dy = pa.py - pb.py;
        let l = (dx * dx + dy * dy).sqrt();
        if l == 0.0 {
            continue;
        }
        let ux = dx / l;
        let uy = dy / l;
        let vrel = ux * (pa.vx - pb.vx) + uy * (pa.vy - pb.vy);
        let ext = l - s.rest_length;
        let mag = -s.stiffness * ext - s.cubic * ext * ext * ext - s.damping * vrel;
        let (label, kind) = if s.damper { ("F阻", "damper") } else { ("F弹", "spring") };
        if s.a.body == Some(g) {
            out.push(arrow(pa.px, pa.py, mag * ux, mag * uy, kind, label));
        } else {
            out.push(arrow(pb.px, pb.py, -mag * ux, -mag * uy, kind, label));
        }
    }
    if b.drag_lin > 0.0 || b.drag_quad > 0.0 {
        let sp = crate::dmath::hypot(pose.vx, pose.vy);
        let k = b.drag_lin + b.drag_quad * sp;
        if k * sp > 0.0 {
            out.push(arrow(pose.x, pose.y, -k * pose.vx, -k * pose.vy, "drag", "f阻"));
        }
    }
    if model.g_const > 0.0 && b.attract > 0.0 {
        let (mut fx, mut fy) = (0.0, 0.0);
        for &o in &model.attractors {
            if o == g {
                continue;
            }
            let ob = &model.bodies[o];
            let po = if ob.dynamic { Vec2 { x: poses[o].x, y: poses[o].y } } else { ob.grav_pos };
            let dx = po.x - pose.x;
            let dy = po.y - pose.y;
            let d2 = dx * dx + dy * dy;
            if d2 <= 0.0 || d2.is_nan() {
                continue;
            }
            let d = d2.sqrt();
            let rr = b.bound + ob.bound;
            let f = if d >= rr { model.g_const * b.attract * ob.attract / d2 } else { model.g_const * b.attract * ob.attract * d / (rr * rr * rr) };
            fx += f * dx / d;
            fy += f * dy / d;
        }
        if fx != 0.0 || fy != 0.0 {
            out.push(arrow(pose.x, pose.y, fx, fy, "attract", "F引"));
        }
    }
    // 26.54 (D78): electric field force, Lorentz force and Coulomb force on a charge
    if model.electric && b.charge != 0.0 {
        let parts = crate::dynamics::electric_parts(model, poses, g);
        for ((fx, fy), (kind, label)) in parts.into_iter().zip([("electric", "F电"), ("magnetic", "F洛"), ("coulomb", "F库")]) {
            if fx != 0.0 || fy != 0.0 {
                out.push(arrow(pose.x, pose.y, fx, fy, kind, label));
            }
        }
    }
    // 26.55 (D90–D92): field regions, liquids, rail loops
    if !model.zone_pairs.is_empty() && b.charge != 0.0 {
        let t = crate::regions::time_of(sys, x);
        let frozen = mode.and_then(|m| crate::dynamics::zone_sw(model, m.sw.as_deref()));
        for (k, &(zi, gz)) in model.zone_pairs.iter().enumerate() {
            if gz != g {
                continue;
            }
            let inside = match frozen {
                Some(s) => s[k] > 0,
                None => crate::regions::zone_branch(model, k, poses) > 0,
            };
            if !inside {
                continue;
            }
            let (ex, ey) = crate::regions::zone_e(model, zi, t);
            let bz = model.zones[zi].b;
            if ex != 0.0 || ey != 0.0 {
                out.push(arrow(pose.x, pose.y, b.charge * ex, b.charge * ey, "electric", "F电"));
            }
            if bz != 0.0 && (pose.vx != 0.0 || pose.vy != 0.0) {
                out.push(arrow(pose.x, pose.y, b.charge * pose.vy * bz, -b.charge * pose.vx * bz, "magnetic", "F洛"));
            }
        }
    }
    for l in &model.liquids {
        if !b.dynamic {
            break;
        }
        let (a, mx, my, total) = crate::regions::submerged(model, g, &pose, l);
        if !(a > 0.0) {
            continue;
        }
        let gv = model.settings.gravity;
        let vol = a * l.depth;
        let (cx, cy) = (mx / a, my / a);
        out.push(arrow(cx, cy, -l.rho * vol * gv.x, -l.rho * vol * gv.y, "buoyancy", "F浮"));
        let (rx, ry) = (cx - pose.x, cy - pose.y);
        let (vx, vy) = (pose.vx - pose.w * ry, pose.vy + pose.w * rx);
        let sp = crate::dmath::hypot(vx, vy);
        let k = if total > 0.0 { a / total } else { 0.0 } * (l.drag_lin + l.drag_quad * sp);
        if k * sp > 0.0 {
            out.push(arrow(cx, cy, -k * vx, -k * vy, "drag", "f阻"));
        }
    }
    for (k, rl) in model.rails.iter().enumerate() {
        if rl.body != g {
            continue;
        }
        let (_, _, f) = crate::regions::rail_values(model, k, poses);
        if f != 0.0 {
            out.push(arrow(pose.x, pose.y, f * rl.ux, f * rl.uy, "ampere", "F安"));
        }
    }
    let sw: Option<Vec<i8>> = match mode {
        Some(m) => m.sw.clone(),
        None if model.has_expr => Some(switch_branches(sys, x)),
        None => None,
    };
    for (k, f) in model.forces.iter().enumerate() {
        if f.a.body != Some(g) {
            continue;
        }
        let p = anchor_state(poses, &f.a);
        let (fx, fy) = force_value(sys, k, x, sw.as_deref()).unwrap_or((f.force.x, f.force.y));
        out.push(arrow(p.px, p.py, fx, fy, "applied", "F"));
    }
    for c in &model.centrals {
        let p0 = anchor_state(poses, &c.a);
        let (mut rx, mut ry) = (0.0, 0.0);
        for &t in &c.targets {
            let pt = poses[t];
            let dx = pt.x - p0.px;
            let dy = pt.y - p0.py;
            let r = crate::dmath::hypot(dx, dy);
            if r <= 0.0 || r.is_nan() {
                continue;
            }
            let ff = central_force(c.k, c.n, r, model.bodies[t].bound);
            let fx = -ff * dx / r;
            let fy = -ff * dy / r;
            if t == g {
                out.push(arrow(pt.x, pt.y, fx, fy, "central", "F心"));
            }
            rx -= fx;
            ry -= fy;
        }
        if c.a.body == Some(g) && (rx != 0.0 || ry != 0.0) {
            out.push(arrow(p0.px, p0.py, rx, ry, "central", "F心"));
        }
    }
    out
}

// ---- Display states ----

/// Index of the first event with time > t.
fn first_event_after(s: &Session, t: f64) -> usize {
    s.events.partition_point(|e| e.t <= t)
}

/// Drawing state at time t (render/interp.ts `displayStateAt`): Hermite interpolation of positions between two
/// frames with no event in between, the exact state otherwise.
pub fn display_state_at(s: &mut Session, t: f64) -> SimResult<Vec<f64>> {
    let last = s.frame_count.saturating_sub(1);
    let t_max = last as f64 * s.dt;
    if t <= 0.0 || t.is_nan() {
        return Ok(s.state(0)?.to_vec());
    }
    if t >= t_max {
        return Ok(s.state(last)?.to_vec());
    }
    let k = (last - 1).min((t / s.dt).floor() as u64);
    let t0 = k as f64 * s.dt;
    let t1 = t0 + s.dt;
    let u = (t - t0) / s.dt;
    if u <= 1e-12 {
        return Ok(s.state(k)?.to_vec());
    }
    let i = first_event_after(s, t0);
    if i < s.events.len() && s.events[i].t < t1 {
        return s.exact_state_at(t);
    }
    let a = s.state(k)?.to_vec();
    let b = s.state(k + 1)?.to_vec();
    let n3 = 3 * s.system.n;
    let h = s.dt;
    let s2 = u * u;
    let s3 = s2 * u;
    let h00 = 2.0 * s3 - 3.0 * s2 + 1.0;
    let h10 = s3 - 2.0 * s2 + u;
    let h01 = -2.0 * s3 + 3.0 * s2;
    let h11 = s3 - s2;
    let mut x = vec![0.0; s.size];
    for i in 0..n3 {
        x[i] = h00 * a[i] + h10 * h * a[n3 + i] + h01 * b[i] + h11 * h * b[n3 + i];
    }
    for i in n3..s.size {
        x[i] = a[i] + u * (b[i] - a[i]);
    }
    Ok(x)
}

/// Poses as 8 numbers per body (x, y, cos, sin, vx, vy, ω, θ), all bodies by global index.
pub fn pose_numbers(poses: &[Pose], out: &mut Vec<f64>) {
    for p in poses {
        out.extend([p.x, p.y, p.c, p.s, p.vx, p.vy, p.w, p.th]);
    }
}

/// Which bodies get their forces listed in a frame view.
pub enum ForceBodies {
    None,
    All,
    Ids(Vec<String>),
}

impl ForceBodies {
    pub fn from_json(v: &Value) -> ForceBodies {
        match v {
            Value::String(s) if s == "all" => ForceBodies::All,
            Value::Array(a) => ForceBodies::Ids(a.iter().filter_map(|x| x.as_str().map(String::from)).collect()),
            _ => ForceBodies::None,
        }
    }
}

/// Everything drawn at state X: poses, axles, anchors, rope paths, accelerations and forces.
pub fn state_view(sys: &System, x: &[f64], mode: Option<&Mode>, forces: &ForceBodies, blob: &mut Blob) -> Value {
    let model = &sys.model;
    let poses = compute_poses(model, x);
    let mut pn = Vec::with_capacity(8 * poses.len());
    pose_numbers(&poses, &mut pn);
    let mut pul = Vec::with_capacity(2 * model.pulleys.len());
    for p in &model.pulleys {
        let c = pulley_center(&poses, p);
        pul.extend([c.x, c.y]);
    }
    let two = |list: &mut Vec<f64>, a: &AnchorModel| {
        let p = anchor_state(&poses, a);
        list.extend([p.px, p.py]);
    };
    let mut springs = Vec::new();
    for s in &model.springs {
        two(&mut springs, &s.a);
        two(&mut springs, &s.b);
    }
    let mut rods = Vec::new();
    for r in &model.rods {
        two(&mut rods, &r.a);
        two(&mut rods, &r.b);
    }
    let mut sliders = Vec::new();
    for sl in &model.sliders {
        two(&mut sliders, &sl.a);
        two(&mut sliders, &sl.b);
        let (ax, ay) = match sl.a.body.filter(|g| model.bodies[*g].dynamic) {
            Some(g) => (poses[g].c * sl.axis.x - poses[g].s * sl.axis.y, poses[g].s * sl.axis.x + poses[g].c * sl.axis.y),
            None => (sl.axis.x, sl.axis.y),
        };
        sliders.extend([ax, ay]);
    }
    let mut centrals = Vec::new();
    for c in &model.centrals {
        two(&mut centrals, &c.a);
    }
    let mut welds = Vec::new();
    for w in &model.welds {
        two(&mut welds, &w.a);
    }
    let mut motors = Vec::new();
    for m in &model.motors {
        two(&mut motors, &m.a);
    }
    let mut hinges = Vec::new();
    for h in &model.hinges {
        two(&mut hinges, &h.a);
    }
    let sw: Option<Vec<i8>> = match mode {
        Some(m) => m.sw.clone(),
        None if model.has_expr => Some(switch_branches(sys, x)),
        None => None,
    };
    let mut applied = Vec::new();
    for (k, f) in model.forces.iter().enumerate() {
        two(&mut applied, &f.a);
        let (fx, fy) = force_value(sys, k, x, sw.as_deref()).unwrap_or((f.force.x, f.force.y));
        applied.extend([fx, fy]);
    }
    let ropes: Vec<Value> = model
        .ropes
        .iter()
        .enumerate()
        .map(|(k, r)| {
            let (points, arcs) = rope_drawing(model, &poses, r);
            let (_, path) = rope_kin(model, &poses, r);
            let taut = mode.map(|m| m.taut.get(k).copied().unwrap_or(false)).unwrap_or(true);
            json!({ "points": blob.f64s(&points), "arcs": blob.f64s(&arcs), "length": jnum(path.length), "taut": taut })
        })
        .collect();
    let mut solve_error = Value::Null;
    let sol = match mode {
        Some(m) => match solve_mode(sys, x, m, Some(&poses)) {
            Ok(s) => Some(s),
            Err(e) => {
                solve_error = e.to_json();
                None
            }
        },
        None => None,
    };
    let targets: Vec<usize> = match forces {
        ForceBodies::None => Vec::new(),
        ForceBodies::All => model.dynamic.clone(),
        ForceBodies::Ids(ids) => model.dynamic.iter().copied().filter(|g| ids.iter().any(|id| *id == model.bodies[*g].id)).collect(),
    };
    let force_list: Vec<Value> = targets
        .iter()
        .map(|&g| json!({ "body": g, "forces": body_forces(sys, mode, sol.as_ref(), g, &poses, x).iter().map(|f| f.to_json()).collect::<Vec<_>>() }))
        .collect();
    let acc = sol.as_ref().map(|s| blob.f64s(&s.acc)).unwrap_or(Value::Null);
    json!({
        "X": blob.f64s(x), "poses": blob.f64s(&pn), "pulleys": blob.f64s(&pul),
        "anchors": {
            "springs": blob.f64s(&springs), "rods": blob.f64s(&rods), "sliders": blob.f64s(&sliders), "centrals": blob.f64s(&centrals),
            "welds": blob.f64s(&welds), "motors": blob.f64s(&motors), "hinges": blob.f64s(&hinges), "forces": blob.f64s(&applied)
        },
        "ropes": ropes, "acc": acc, "forces": force_list, "solveError": solve_error
    })
}

/// Frame view of a recording at time t (render/frame.ts): the display state (interpolated, or exact for exports)
/// and its view in the segment's mode. A session without frames (the editor) shows the scene's initial state.
pub fn frame_view(s: &mut Session, t: f64, exact: bool, forces: &ForceBodies, blob: &mut Blob) -> SimResult<Value> {
    if s.frame_count == 0 {
        let sys = s.system.clone();
        let x = initial_state(&sys);
        let mut v = state_view(&sys, &x, None, forces, blob);
        v["t"] = json!(0);
        v["frame"] = json!(-1);
        v["segment"] = json!(-1);
        return Ok(v);
    }
    let t_max = (s.frame_count - 1) as f64 * s.dt;
    let tc = crate::js::js_max(0.0, crate::js::js_min(t_max, t));
    let x = if exact { s.exact_state_at(tc)? } else { display_state_at(s, tc)? };
    let seg = s.segment_at_time(tc);
    let frame = ((s.frame_count - 1) as f64).min((tc / s.dt + 1e-9).floor());
    let sys = s.system.clone();
    let mode = s.segments[seg].mode.clone();
    let mut v = state_view(&sys, &x, Some(&mode), forces, blob);
    v["t"] = jnum(tc);
    v["frame"] = json!(frame as i64);
    v["segment"] = json!(seg);
    Ok(v)
}

/// Poses of all bodies at several instants: exact states (`exact`), display states, or recorded frames.
pub fn poses_at(s: &mut Session, times: &[f64], frames: &[f64], exact: bool) -> SimResult<Vec<f64>> {
    let sys = s.system.clone();
    let mut out = Vec::new();
    for &t in times {
        let x = if exact { s.exact_state_at(t)? } else { display_state_at(s, t)? };
        pose_numbers(&compute_poses(&sys.model, &x), &mut out);
    }
    for &k in frames {
        let x = s.state(k as u64)?.to_vec();
        pose_numbers(&compute_poses(&sys.model, &x), &mut out);
    }
    Ok(out)
}

/// Centre-of-mass positions of the dynamic bodies at frames from..to (every `stride`-th frame and the last one;
/// frames of evicted chunks are skipped). Returns the frame numbers and, per frame, x and y of every dynamic body.
pub fn positions(s: &mut Session, from: u64, to: u64, stride: u64, cheap_only: bool) -> SimResult<(Vec<f64>, Vec<f64>)> {
    let n = s.system.n;
    let mut ks = Vec::new();
    let mut xy = Vec::new();
    let stride = stride.max(1);
    let mut k = from;
    while k < to {
        let last = k + 1 == to;
        if k % stride == 0 || last {
            if !cheap_only || s.cheap(k) {
                let x = s.state(k)?;
                ks.push(k as f64);
                for i in 0..n {
                    xy.push(x[3 * i]);
                    xy.push(x[3 * i + 1]);
                }
            }
        }
        k += 1;
    }
    Ok((ks, xy))
}

/// Arrow scales (pixels per m/s, per m/s², per N) chosen once per recording (renderer.ts `vectorScales`).
pub fn vector_scales(s: &mut Session, with_recording: bool) -> SimResult<(f64, f64, f64)> {
    let sys = s.system.clone();
    let model = &sys.model;
    let n = sys.n;
    let g = crate::dmath::hypot(model.settings.gravity.x, model.settings.gravity.y);
    let (mut vmax, mut amax) = (0.0f64, 0.0f64);
    if with_recording && s.frame_count > 0 {
        let stride = 1u64.max((s.frame_count as f64 / 400.0).floor() as u64);
        let mut k = 0;
        while k < s.frame_count {
            if s.cheap(k) {
                let x = s.state(k)?;
                for &bg in &model.dynamic {
                    let o = 3 * n + 3 * model.bodies[bg].index as usize;
                    vmax = crate::js::js_max(vmax, crate::dmath::hypot(x[o], x[o + 1]));
                }
            }
            k += stride;
        }
        amax = crate::js::js_max(g, 1.0);
    } else {
        for &bg in &model.dynamic {
            let b = &model.bodies[bg];
            vmax = crate::js::js_max(vmax, crate::dmath::hypot(b.def_velocity.x, b.def_velocity.y));
        }
    }
    let mut fmax = 0.0f64;
    for &bg in &model.dynamic {
        let b = &model.bodies[bg];
        let ga = gravitation_at(model, bg);
        if with_recording && s.frame_count > 0 {
            amax = crate::js::js_max(amax, ga);
        }
        fmax = crate::js::js_max(fmax, b.mass * crate::js::js_max(crate::js::js_max(1.0, g), ga));
        // 26.54 (D78): the electric force at the start sets the scale too (absent in older scenes)
        if model.electric && b.charge != 0.0 {
            let fe = electric_scale(model, bg);
            fmax = crate::js::js_max(fmax, fe);
            if with_recording && s.frame_count > 0 {
                amax = crate::js::js_max(amax, fe * b.inv_mass);
            }
        }
    }
    Ok((70.0 / crate::js::js_max(vmax, 0.5), 55.0 / crate::js::js_max(amax, 0.5), 90.0 / crate::js::js_max(fmax, 1e-6)))
}

/// Magnitude of the electric and Coulomb force on charge g at the initial positions (26.54).
fn electric_scale(model: &Model, g: usize) -> f64 {
    let b = &model.bodies[g];
    let (mut fx, mut fy) = (b.charge * model.e_field.x, b.charge * model.e_field.y);
    if model.k_coulomb > 0.0 {
        for &o in &model.charged {
            if o == g {
                continue;
            }
            let ob = &model.bodies[o];
            let dx = ob.grav_pos.x - b.grav_pos.x;
            let dy = ob.grav_pos.y - b.grav_pos.y;
            let d = crate::dmath::hypot(dx, dy);
            if d <= 0.0 || d.is_nan() {
                continue;
            }
            let f = crate::model::coulomb_scalar(model.k_coulomb, b.charge, ob.charge, d, b.bound + ob.bound);
            fx += f * dx / d;
            fy += f * dy / d;
        }
    }
    let v = crate::dmath::hypot(b.def_velocity.x, b.def_velocity.y);
    crate::dmath::hypot(fx, fy) + (b.charge * v * model.b_field).abs()
}

/// Magnitude of the gravitational acceleration of body g at the initial positions (0 without gravitation).
fn gravitation_at(model: &Model, g: usize) -> f64 {
    let b = &model.bodies[g];
    if model.g_const <= 0.0 || model.g_const.is_nan() || b.attract <= 0.0 || b.attract.is_nan() {
        return 0.0;
    }
    let (mut ax, mut ay) = (0.0, 0.0);
    for &o in &model.attractors {
        if o == g {
            continue;
        }
        let ob = &model.bodies[o];
        let dx = ob.grav_pos.x - b.grav_pos.x;
        let dy = ob.grav_pos.y - b.grav_pos.y;
        let d = crate::dmath::hypot(dx, dy);
        if d <= 0.0 || d.is_nan() {
            continue;
        }
        let rr = b.bound + ob.bound;
        let a = if d >= rr { model.g_const * ob.attract / (d * d) } else { model.g_const * ob.attract * d / (rr * rr * rr) };
        ax += a * dx / d;
        ay += a * dy / d;
    }
    crate::dmath::hypot(ax, ay)
}

// ---- Particle emitters (render/effects.ts) ----

/// Length of an emitter block (s of simulated time), emission interval of sliding dust, dust rate and the most
/// emitters of a block — as in render/effects.ts.
pub const BLOCK: f64 = 2.0;
const SLIDE_DT: f64 = 1.0 / 120.0;
const SLIDE_RATE: f64 = 36.0;
const MAX_EMITTERS: usize = 40000;
const SPARK: u8 = 0;
const DUST: u8 = 1;
const PUFF: u8 = 2;

/// 32-bit integer hash of two integers (effects.ts `hash2`, with JavaScript's Math.imul and >>> semantics).
pub fn hash2(a: i32, b: i32) -> u32 {
    let imul = |x: i32, y: u32| x.wrapping_mul(y as i32);
    let mut h = imul(a ^ 0x9e3779b9u32 as i32, 0x85ebca6b) ^ imul(b.wrapping_add(0x632be59b), 0xc2b2ae35);
    h ^= ((h as u32) >> 16) as i32;
    h = imul(h, 0x7feb352d);
    h ^= ((h as u32) >> 15) as i32;
    h = imul(h, 0x846ca68b);
    h ^= ((h as u32) >> 16) as i32;
    h as u32
}

/// One particle emitter: time, position, mean direction and spread, speed, count, kind (0 spark, 1 dust, 2 puff),
/// seed, life and the outward normal of the surface.
#[derive(Clone, Debug)]
pub struct Emitter {
    pub t: f64,
    pub x: f64,
    pub y: f64,
    pub ang: f64,
    pub spread: f64,
    pub speed: f64,
    pub count: f64,
    pub kind: u8,
    pub seed: u32,
    pub life: f64,
    pub nx: f64,
    pub ny: f64,
}

/// Number of fields of an emitter in the packed form.
pub const EMITTER_FIELDS: usize = 12;

impl Emitter {
    fn pack(&self, out: &mut Vec<f64>) {
        out.extend([self.t, self.x, self.y, self.ang, self.spread, self.speed, self.count, self.kind as f64, self.seed as f64, self.life, self.nx, self.ny]);
    }
}

/// Outward normal (away from the static body, if any) and whether both bodies move.
fn outward(model: &Model, f: Option<&crate::kinematics::ContactFeature>, nx: f64, ny: f64) -> (f64, f64, bool) {
    let Some(f) = f else { return (nx, ny, false) };
    let a_dyn = model.bodies[f.a.body].dynamic;
    let b_dyn = model.bodies[f.b_body()].dynamic;
    if !a_dyn {
        return (-nx, -ny, false);
    }
    (nx, ny, a_dyn && b_dyn)
}

fn js_round_half_up(v: f64) -> f64 {
    crate::js::js_round(v)
}

/// Emitters of block `block` ([block·BLOCK, (block + 1)·BLOCK) of simulated time), sorted by time, packed
/// EMITTER_FIELDS numbers each; and whether the block is final (inside the computed range).
pub fn emitters(s: &mut Session, block: u64) -> SimResult<(Vec<f64>, bool)> {
    let sys = s.system.clone();
    let model = &sys.model;
    let mut em: Vec<Emitter> = Vec::new();
    let b_start = block as f64 * BLOCK;
    let b_end = (block as f64 + 1.0) * BLOCK;
    let e0 = s.events.partition_point(|e| e.t < b_start);
    let pi_ = std::f64::consts::PI;
    let mut ei = e0;
    while ei < s.events.len() && s.events[ei].t < b_end {
        if em.len() > MAX_EMITTERS {
            break;
        }
        let (et, has_impact) = (s.events[ei].t, s.events[ei].impact.is_some());
        let mut rope_puff = false;
        if has_impact {
            let points = s.events[ei].impact.as_ref().map(|i| i.points.clone()).unwrap_or_default();
            let after = s.events[ei].after.clone();
            for (pi, p) in points.iter().enumerate() {
                let vn = -p.vn_before;
                if p.kind == ImpactKind::Contact {
                    if vn < 0.05 {
                        continue;
                    }
                    let feature = p.pair.and_then(|pa| p.feature.map(|fi| sys.pairs[pa].features[fi].clone()));
                    let (ox, oy, both) = outward(model, feature.as_ref(), p.nx, p.ny);
                    let count = crate::js::js_max(3.0, crate::js::js_min(32.0, js_round_half_up(3.0 + 8.0 * vn)));
                    em.push(Emitter {
                        t: et, x: p.cx, y: p.cy, ang: oy.atan2(ox), spread: if both { pi_ * 2.0 } else { pi_ * 0.8 },
                        speed: crate::js::js_min(4.0, 0.25 + 0.45 * vn), count, kind: if vn > 1.2 { SPARK } else { DUST }, seed: hash2(ei as i32, pi as i32),
                        life: if vn > 1.2 { 0.55 } else { 0.7 }, nx: if both { 0.0 } else { ox }, ny: if both { 0.0 } else { oy },
                    });
                } else if p.kind == ImpactKind::Rope && vn > 0.02 {
                    let ri = p.rope.max(0) as usize;
                    let Some(r) = model.ropes.get(ri) else { continue };
                    let poses = compute_poses(model, &after);
                    for (side, a) in [(0, &r.a), (1, &r.b)] {
                        if !a.body.is_some_and(|g| model.bodies[g].dynamic) {
                            continue;
                        }
                        let st = anchor_state(&poses, a);
                        em.push(Emitter {
                            t: et, x: st.px, y: st.py, ang: pi_ / 2.0, spread: pi_ * 2.0, speed: 0.2 + 0.25 * crate::js::js_min(4.0, vn),
                            count: crate::js::js_max(5.0, crate::js::js_min(14.0, js_round_half_up(5.0 + 4.0 * vn))), kind: PUFF,
                            seed: hash2(ei as i32, 1000 + ri as i32 * 2 + side), life: 0.45, nx: 0.0, ny: 0.0,
                        });
                    }
                    rope_puff = true;
                }
            }
        }
        if !rope_puff {
            let changes = s.events[ei].changes.clone();
            let after = s.events[ei].after.clone();
            for c in changes.iter().filter(|c| c.kind().name() == "taut") {
                let Some(r) = model.ropes.iter().find(|x| x.id == c.subject) else { continue };
                let poses = compute_poses(model, &after);
                for (side, a) in [(0, &r.a), (1, &r.b)] {
                    if !a.body.is_some_and(|g| model.bodies[g].dynamic) {
                        continue;
                    }
                    let st = anchor_state(&poses, a);
                    em.push(Emitter { t: et, x: st.px, y: st.py, ang: pi_ / 2.0, spread: pi_ * 2.0, speed: 0.18, count: 4.0, kind: PUFF, seed: hash2(ei as i32, 2000 + side), life: 0.35, nx: 0.0, ny: 0.0 });
                }
            }
        }
        ei += 1;
    }
    // Dust at sliding contacts
    let t_end = (s.frame_count.saturating_sub(1)) as f64 * s.dt;
    let s0 = s.segments.partition_point(|x| x.t0 <= b_start);
    let mut si = s0.saturating_sub(1);
    'segs: while si < s.segments.len() && s.segments[si].t0 < b_end {
        let seg_t0 = s.segments[si].t0;
        let t1 = crate::js::js_min(s.segments[si].t1, t_end);
        let mode = s.segments[si].mode.clone();
        for (ui, u) in mode.units.iter().enumerate() {
            if u.friction != Friction::Slide || u.points.is_empty() {
                continue;
            }
            let pair = &sys.pairs[u.pair];
            let mut m = crate::js::js_max((seg_t0 / SLIDE_DT - 1e-9).ceil(), (b_start / SLIDE_DT).floor() - 1.0);
            while m * SLIDE_DT < t1 {
                if em.len() > MAX_EMITTERS {
                    break 'segs;
                }
                let te = m * SLIDE_DT;
                if te >= b_end {
                    break;
                }
                if !(te >= b_start && te < b_end) {
                    m += 1.0;
                    continue;
                }
                let mut k = crate::js::js_min((s.frame_count - 1) as f64, js_round_half_up(te / s.dt));
                if k * s.dt < seg_t0 - 1e-12 && k + 1.0 < s.frame_count as f64 {
                    k += 1.0;
                }
                if k * s.dt > t1 + 1e-12 {
                    break;
                }
                let x = s.state(k as u64)?.to_vec();
                let poses = compute_poses(model, &x);
                let rf = &pair.features[u.ref_];
                let refk = contact_kin(model, rf, &poses);
                let slip = refk.vt.abs();
                if slip < 0.03 {
                    m += 1.0;
                    continue;
                }
                let seed = hash2(100000 + si as i32 * 64 + ui as i32, m as i32);
                let count = (SLIDE_RATE * slip * SLIDE_DT + (seed >> 8) as f64 / 16777216.0).floor();
                if count <= 0.0 {
                    m += 1.0;
                    continue;
                }
                let (mut cx, mut cy) = (0.0, 0.0);
                for fi in &u.points {
                    let kk = contact_kin(model, &pair.features[*fi], &poses);
                    cx += kk.cx;
                    cy += kk.cy;
                }
                cx /= u.points.len() as f64;
                cy /= u.points.len() as f64;
                let (ox, oy, _) = outward(model, Some(rf), refk.nx, refk.ny);
                let sg = (if model.bodies[rf.a.body].dynamic { 1.0 } else { -1.0 }) * crate::js::js_sign(refk.vt);
                let mx = sg * refk.tx;
                let my = sg * refk.ty;
                let dx = -0.75 * mx + 0.65 * ox;
                let dy = -0.75 * my + 0.65 * oy;
                em.push(Emitter { t: te, x: cx, y: cy, ang: dy.atan2(dx), spread: 1.4, speed: crate::js::js_min(1.2, 0.15 + 0.3 * slip), count: crate::js::js_min(4.0, count), kind: DUST, seed, life: 0.55, nx: ox, ny: oy });
                m += 1.0;
            }
        }
        si += 1;
    }
    em.sort_by(|a, b| a.t.partial_cmp(&b.t).unwrap_or(std::cmp::Ordering::Equal).then(a.seed.cmp(&b.seed)));
    let mut out = Vec::with_capacity(em.len() * EMITTER_FIELDS);
    for e in &em {
        e.pack(&mut out);
    }
    Ok((out, b_end <= t_end))
}

// ---- Editor (scene sessions) ----

fn dist_to_segment(px: f64, py: f64, ax: f64, ay: f64, bx: f64, by: f64) -> f64 {
    let ex = bx - ax;
    let ey = by - ay;
    let ee = ex * ex + ey * ey;
    let mut u = if ee > 0.0 { ((px - ax) * ex + (py - ay) * ey) / ee } else { 0.0 };
    u = crate::js::js_max(0.0, crate::js::js_min(1.0, u));
    crate::dmath::hypot(px - ax - u * ex, py - ay - u * ey)
}

/// Topmost object under a world point (app/editing.ts `hitTest`): `(kind, id)` with kind body | pulley | connector.
pub fn pick(sys: &System, poses: &[Pose], px: f64, py: f64, tol: f64) -> Option<(&'static str, String)> {
    use crate::kinematics::signed_distance;
    let model = &sys.model;
    let h = crate::dmath::hypot;
    for pl in &model.pulleys {
        let c = pulley_center(poses, pl);
        if h(px - c.x, py - c.y) <= pl.radius + tol {
            return Some(("pulley", pl.id.clone()));
        }
    }
    let pins = model.hinges.iter().map(|c| (&c.a, &c.id)).chain(model.welds.iter().map(|c| (&c.a, &c.id))).chain(model.motors.iter().map(|c| (&c.a, &c.id)));
    for (a, id) in pins {
        let p = anchor_state(poses, a);
        if h(px - p.px, py - p.py) <= tol * 1.2 {
            return Some(("connector", id.clone()));
        }
    }
    for c in &model.sliders {
        let p = anchor_state(poses, &c.b);
        if h(px - p.px, py - p.py) <= tol * 1.2 {
            return Some(("connector", c.id.clone()));
        }
    }
    for f in &model.forces {
        let p = anchor_state(poses, &f.a);
        if h(px - p.px, py - p.py) <= tol * 1.2 {
            return Some(("connector", f.id.clone()));
        }
    }
    for &g in model.dynamic.iter().rev() {
        if signed_distance(&model.bodies[g], &poses[g], px, py) <= tol * 0.5 {
            return Some(("body", model.bodies[g].id.clone()));
        }
    }
    for r in &model.ropes {
        let (pts, _) = rope_drawing(model, poses, r);
        let mut i = 0;
        while i + 3 < pts.len() {
            if dist_to_segment(px, py, pts[i], pts[i + 1], pts[i + 2], pts[i + 3]) <= tol {
                return Some(("connector", r.id.clone()));
            }
            i += 4;
        }
    }
    let lines = model.rods.iter().map(|c| (&c.a, &c.b, &c.id)).chain(model.springs.iter().map(|c| (&c.a, &c.b, &c.id)));
    for (a, b, id) in lines {
        let pa = anchor_state(poses, a);
        let pb = anchor_state(poses, b);
        if dist_to_segment(px, py, pa.px, pa.py, pb.px, pb.py) <= tol {
            return Some(("connector", id.clone()));
        }
    }
    for g in &model.gears {
        let a = g.a.map(|i| poses[i]);
        let b = g.b.map(|i| poses[i]);
        if let (Some(a), Some(b)) = (a, b) {
            if dist_to_segment(px, py, a.x, a.y, b.x, b.y) <= tol {
                return Some(("connector", g.id.clone()));
            }
        }
        if let (Some(a), None) = (a, b) {
            if h(px - a.x, py - a.y) <= tol * 1.5 {
                return Some(("connector", g.id.clone()));
            }
        }
    }
    for b in model.bodies.iter().rev() {
        if !b.dynamic && signed_distance(b, &poses[b.global], px, py) <= 0.0 {
            return Some(("body", b.id.clone()));
        }
    }
    None
}

/// Topmost body containing the point within `tol` (m), dynamic bodies first (app/editing.ts `bodyAt`).
pub fn body_at(sys: &System, poses: &[Pose], px: f64, py: f64, tol: f64, dynamic_only: bool) -> Option<usize> {
    use crate::kinematics::signed_distance;
    let model = &sys.model;
    let mut list: Vec<usize> = model.dynamic.iter().rev().copied().collect();
    if !dynamic_only {
        list.extend(model.bodies.iter().rev().filter(|b| !b.dynamic).map(|b| b.global));
    }
    list.into_iter().find(|&g| signed_distance(&model.bodies[g], &poses[g], px, py) <= tol)
}

/// Dynamic bodies containing the point (topmost first).
pub fn bodies_at(sys: &System, poses: &[Pose], px: f64, py: f64) -> Vec<usize> {
    use crate::kinematics::signed_distance;
    let model = &sys.model;
    model.dynamic.iter().rev().copied().filter(|&g| signed_distance(&model.bodies[g], &poses[g], px, py) <= 0.0).collect()
}

/// Surface under the point: an upward-facing face within reach, as foot point, outward normal and angle
/// (app/editing.ts `surfaceBelow`).
pub fn surface_below(sys: &System, poses: &[Pose], px: f64, py: f64, reach: f64) -> Option<(f64, f64, f64, f64, f64)> {
    let model = &sys.model;
    let mut best: Option<(f64, f64, f64, f64, f64)> = None;
    for b in &model.bodies {
        let faces: Vec<(Vec2, Vec2, f64)> = match &b.shape {
            ShapeModel::Circle { .. } => continue,
            ShapeModel::Polygon { verts, normals, lengths } => verts.iter().enumerate().map(|(f, v)| (*v, normals[f], lengths[f])).collect(),
            ShapeModel::Complex(c) => c.faces.iter().map(|fc| (fc.e0, fc.normal, fc.len)).collect(),
        };
        let pose = poses[b.global];
        for (v, nl, len) in faces {
            let nx = pose.c * nl.x - pose.s * nl.y;
            let ny = pose.s * nl.x + pose.c * nl.y;
            if ny < 0.25 {
                continue;
            }
            let e0x = pose.x + pose.c * v.x - pose.s * v.y;
            let e0y = pose.y + pose.s * v.x + pose.c * v.y;
            let (tx, ty) = (-ny, nx);
            let along = (px - e0x) * tx + (py - e0y) * ty;
            let d = (px - e0x) * nx + (py - e0y) * ny;
            if along < 0.0 || along > len || d < -0.15 || d > reach {
                continue;
            }
            if best.is_none_or(|bb| d.abs() < bb.4.abs()) {
                best = Some((e0x + tx * along, e0y + ty * along, nx, ny, d));
            }
        }
    }
    best.map(|(fx, fy, nx, ny, _)| (fx, fy, nx, ny, atan2_det(-nx, ny)))
}

/// Feature points at the drawn state for measuring snaps (app/editor/snap.ts `featurePoints`): centres of moving
/// bodies and circles, polygon vertices, pulley axles, fixed anchors.
pub fn feature_points(sys: &System, poses: &[Pose]) -> Vec<f64> {
    let model = &sys.model;
    let mut out = Vec::new();
    for b in &model.bodies {
        let ps = poses[b.global];
        if b.dynamic || matches!(b.shape, ShapeModel::Circle { .. }) {
            out.extend([ps.x, ps.y]);
        }
        if let ShapeModel::Polygon { verts, .. } = &b.shape {
            for v in verts {
                out.extend([ps.x + ps.c * v.x - ps.s * v.y, ps.y + ps.s * v.x + ps.c * v.y]);
            }
        }
    }
    for p in &model.pulleys {
        let c = pulley_center(poses, p);
        out.extend([c.x, c.y]);
    }
    let anchors = model
        .ropes
        .iter()
        .map(|c| (&c.a, &c.b))
        .chain(model.rods.iter().map(|c| (&c.a, &c.b)))
        .chain(model.springs.iter().map(|c| (&c.a, &c.b)))
        .chain(model.hinges.iter().map(|c| (&c.a, &c.b)));
    for (a, b) in anchors {
        for x in [a, b] {
            if x.body.is_none() {
                out.extend([x.local.x, x.local.y]);
            }
        }
    }
    out
}
