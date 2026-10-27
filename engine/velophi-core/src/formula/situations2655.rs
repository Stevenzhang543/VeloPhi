//! Recognizers of 26.55 (D90–D92): a conductor rod on rails in a magnetic field ("rail"), a body in a liquid
//! ("float"), and a charged body inside a bounded field region — circular motion in a magnetic region ("zone-b")
//! and acceleration in a steady electric region ("zone-e"). Rust only (D77): scenes with regions, liquids or rail
//! loops are never compared with the TypeScript reference. Scenes without these features run nothing here.

use std::rc::Rc;

use super::*;
use crate::js::{js_max, js_num};
use crate::kinematics::compute_poses;
use crate::message::Text;
use crate::model::ShapeModel;
use crate::session::ledger_at;
use crate::t;

/// Situation types whose formulas stay valid for the bodies these features act on (the others assume that only
/// gravity, contacts and connectors act).
const REGION_SAFE: [&str; 6] = ["energy", "rail", "float", "zone-b", "zone-e", "collision"];

/// All recognizers of 26.55, in a stable order (nothing in scenes without regions, liquids or rail loops).
pub fn situations2655(r: &mut Rec, out: &mut Vec<Situation>) -> SimResult<()> {
    let m = &r.sys.model;
    if m.zone_pairs.is_empty() && m.liquids.is_empty() && m.rails.is_empty() {
        return Ok(());
    }
    rail_situations(r, out)?;
    float_situations(r, out)?;
    zone_situations(r, out)?;
    Ok(())
}

/// Bodies the 26.55 features act on: the charged bodies of the zone pairs, the rods of rail loops and, when the
/// scene has a liquid, every dynamic body (it may enter the liquid at any time).
fn affected(model: &Model) -> Vec<String> {
    let mut ids: Vec<String> = Vec::new();
    let mut add = |id: &str| {
        if !ids.iter().any(|x| x == id) {
            ids.push(id.to_string());
        }
    };
    for &(_, g) in &model.zone_pairs {
        add(&model.bodies[g].id);
    }
    for rl in &model.rails {
        add(&model.bodies[rl.body].id);
    }
    if !model.liquids.is_empty() {
        for &g in &model.dynamic {
            add(&model.bodies[g].id);
        }
    }
    ids
}

/// Drop the situations of other recognizers that involve a body the regions, liquids or rail loops act on.
pub fn filter_regions(model: &Model, out: &mut Vec<Situation>) {
    if model.zone_pairs.is_empty() && model.liquids.is_empty() && model.rails.is_empty() {
        return;
    }
    let ids = affected(model);
    out.retain(|s| REGION_SAFE.contains(&s.ty) || !s.bodies.iter().any(|b| ids.contains(b)));
}

/// The body has no ropes, rods, springs, hinges, welds, sliders, motors, gears or variable forces.
fn only_constant_forces(model: &Model, id: &str) -> bool {
    let a = attached(model, id);
    a.ropes.is_empty() && a.rods.is_empty() && a.springs.is_empty() && a.hinges.is_empty() && a.forces.iter().all(|&i| model.forces[i].expr.is_none())
}

/// Sum of the constant applied forces on body `id` (N).
fn applied_sum(model: &Model, id: &str) -> (f64, f64) {
    let a = attached(model, id);
    let (mut fx, mut fy) = (0.0, 0.0);
    for &i in &a.forces {
        fx += model.forces[i].force.x;
        fy += model.forces[i].force.y;
    }
    (fx, fy)
}

// ---- Conductor rod on rails ----
fn rail_situations(r: &mut Rec, out: &mut Vec<Situation>) -> SimResult<()> {
    let sys = r.sys.clone();
    let model = &sys.model;
    for (k, rl) in model.rails.iter().enumerate() {
        let b = &model.bodies[rl.body];
        if !b.dynamic || !only_constant_forces(model, &b.id) || model.zone_pairs.iter().any(|&(_, g)| g == rl.body) {
            continue;
        }
        let a = attached(model, &b.id);
        // other extras than the rail itself (drag, gravitation, charge, motors…) change the force balance
        let others = a.extra.saturating_sub(usize::from(model.electric && b.charge != 0.0));
        if others > 0 || b.drag_lin > 0.0 || b.drag_quad > 0.0 {
            continue;
        }
        let list = runs(r, &mut |seg| if touching_units(&sys, &seg.mode, &b.id).is_empty() { Some(format!("rail:{}", rl.id)) } else { None });
        let (ux, uy) = (rl.ux, rl.uy);
        let gv = model.settings.gravity;
        let (fx, fy) = applied_sum(model, &b.id);
        let mass = b.mass;
        // driving force along the rails: the constant forces and the weight
        let drive = (fx + mass * gv.x) * ux + (fy + mass * gv.y) * uy;
        let side = ((fx + mass * gv.x) * -uy + (fy + mass * gv.y) * ux).abs();
        let bi = b.index as usize;
        let bg = rl.body;
        let (bb, ll, rr) = (rl.b, rl.l, rl.r);
        let kk = rl.k();
        let in_liquid = !model.liquids.is_empty();
        for run in list {
            if run.t1 - run.t0 < 1e-9 || in_liquid {
                continue;
            }
            let x0 = r.seg(run.segs[0]).x0.clone();
            let s0 = body_vel(&sys, &x0, b);
            let v0 = s0.vx * ux + s0.vy * uy;
            let v0_side = (s0.vx * -uy + s0.vy * ux).abs();
            let o0 = r.observe(run.t0)?;
            let joule0 = ledger_at(&sys, &o0.x, o0.impact_loss).extra.map_or(0.0, |e| e[crate::regions::X_JOULE]);
            // the rod moves along the rails: no force and no velocity across them, no rotation
            let along = side <= 1e-9 * js_max(1.0, drive.abs()) && v0_side <= 1e-12 * js_max(1.0, v0.abs()) && (b.inv_inertia == 0.0 || s0.w == 0.0);
            let view = r.v;
            let (t0, t1) = (run.t0, run.t1);
            let name = b.name.clone();
            out.push(Situation {
                key: format!("rail:{}:{}", rl.id, js_num(t0)),
                ty: "rail",
                title: t!("{0} 切割磁感线（导轨回路）", name),
                t0,
                t1,
                t_event: None,
                bodies: vec![b.id.clone()],
                sample: Rc::new(move |s, t| {
                    let mut r = Rec::new(s, view);
                    let sys = r.sys.clone();
                    let o = r.observe(t)?;
                    let st = body_vel(&sys, &o.x, &sys.model.bodies[bg]);
                    let poses = compute_poses(&sys.model, &o.x);
                    let (emf, cur, fa) = crate::regions::rail_values(&sys.model, k, &poses);
                    let v = st.vx * ux + st.vy * uy;
                    let sd = (st.x - s0.x) * ux + (st.y - s0.y) * uy;
                    let acc = o.sol.acc[3 * bi] * ux + o.sol.acc[3 * bi + 1] * uy;
                    let joule = ledger_at(&sys, &o.x, o.impact_loss).extra.map_or(0.0, |e| e[crate::regions::X_JOULE]) - joule0;
                    let tau = if kk > 0.0 { mass / kk } else { f64::INFINITY };
                    let left = ((t - t0) / tau).exp();
                    let late = 1.0 / left;
                    let terminal = Condition {
                        id: "terminal".into(),
                        label: t!("已接近收尾速度（e^(−t/τ) ≤ 10⁻⁶，τ = mR/(B²L²)）"),
                        status: if late <= 1e-6 {
                            CondStatus::Ok
                        } else if late <= 1e-2 {
                            CondStatus::Approx
                        } else {
                            CondStatus::Fail
                        },
                        detail: t!("t/τ = {0}", js_num(((t - t0) / tau * 1000.0).round() / 1000.0)),
                    };
                    Ok(Sample {
                        vars: vec![
                            ("B", var(bb, "T", "B", t!("磁感应强度"))),
                            ("L", var(ll, "m", "L", t!("导轨间距（导体棒的有效长度）"))),
                            ("R", var(rr, "Ω", "R", t!("回路电阻"))),
                            ("m", var(mass, "kg", "m", t!("导体棒质量"))),
                            ("F", var(drive, "N", "F", t!("沿导轨的恒定动力（外力与重力的分力）"))),
                            ("v0", var(v0, "m/s", "v_0", t!("初速度（沿导轨）"))),
                            ("t", var(t - t0, "s", "t", t!("运动时间"))),
                            ("v", var(v, "m/s", "v", t!("此刻的速度（仿真）"))),
                            ("s", var(sd, "m", "s", t!("沿导轨的位移（仿真）"))),
                        ],
                        measures: vec![
                            ("emf", meas(Some(emf), "V", t!("感应电动势"))),
                            ("I", meas(Some(cur), "A", t!("感应电流"))),
                            ("FA", meas(Some(fa.abs()), "N", t!("安培力大小"))),
                            ("a", meas(Some(acc), "m/s²", t!("沿导轨的加速度"))),
                            ("vt", meas(Some(v), "m/s", t!("沿导轨的速度"))),
                            ("Q", meas(Some(joule), "J", t!("焦耳热（自本阶段开始）"))),
                        ],
                        conditions: vec![
                            cond("along", t!("导体棒只沿导轨运动（垂直导轨方向不受力、不转动）"), along, unless(along, t!("有垂直于导轨的力或速度"))),
                            terminal,
                        ],
                    })
                }),
            });
        }
    }
    Ok(())
}

// ---- A body in a liquid ----
fn float_situations(r: &mut Rec, out: &mut Vec<Situation>) -> SimResult<()> {
    let sys = r.sys.clone();
    let model = &sys.model;
    if model.liquids.len() != 1 {
        return Ok(());
    }
    let liq = model.liquids[0].clone();
    let gv = model.settings.gravity;
    let g = (gv.x * gv.x + gv.y * gv.y).sqrt();
    if !(g > 0.0) || gv.x != 0.0 {
        return Ok(());
    }
    for &bg in &model.dynamic {
        let b = &model.bodies[bg];
        if !only_constant_forces(model, &b.id) || !attached(model, &b.id).forces.is_empty() || model.rails.iter().any(|rl| rl.body == bg) {
            continue;
        }
        if model.zone_pairs.iter().any(|&(_, x)| x == bg) || b.drag_lin > 0.0 || b.drag_quad > 0.0 {
            continue;
        }
        let list = runs(r, &mut |seg| if touching_units(&sys, &seg.mode, &b.id).is_empty() { Some(format!("float:{}", b.id)) } else { None });
        // total area: the submerged area of the body inside a liquid that covers it
        let total = {
            let p0 = compute_poses(model, &crate::dynamics::initial_state(&sys));
            let big = crate::model::LiquidModel { x0: -1e9, y0: -1e9, x1: 1e9, y1: 1e9, ..liq.clone() };
            crate::regions::submerged(model, bg, &p0[bg], &big).3
        };
        if !(total > 0.0) {
            continue;
        }
        let mass = b.mass;
        let rho_b = mass / (total * liq.depth);
        // an upright box: its width for the draft
        let width = match &b.shape {
            ShapeModel::Polygon { verts, .. } if verts.len() == 4 => {
                let xs: Vec<f64> = verts.iter().map(|v| v.x).collect();
                let ys: Vec<f64> = verts.iter().map(|v| v.y).collect();
                let (w, h) = (xs.iter().cloned().fold(f64::MIN, f64::max) - xs.iter().cloned().fold(f64::MAX, f64::min), ys.iter().cloned().fold(f64::MIN, f64::max) - ys.iter().cloned().fold(f64::MAX, f64::min));
                if (w * h - total).abs() <= 1e-12 * total {
                    Some(w)
                } else {
                    None
                }
            }
            _ => None,
        };
        let bi = b.index as usize;
        let no_drag = liq.drag_lin == 0.0 && liq.drag_quad == 0.0;
        for run in list {
            if run.t1 - run.t0 < 1e-9 {
                continue;
            }
            let view = r.v;
            let (t0, t1) = (run.t0, run.t1);
            let name = b.name.clone();
            let lname = liq.name.clone();
            let (rho, depth) = (liq.rho, liq.depth);
            out.push(Situation {
                key: format!("float:{}:{}", b.id, js_num(t0)),
                ty: "float",
                title: t!("{0} 在{1}中（浮力）", name, lname),
                t0,
                t1,
                t_event: None,
                bodies: vec![b.id.clone()],
                sample: Rc::new(move |s, t| {
                    let mut r = Rec::new(s, view);
                    let sys = r.sys.clone();
                    let o = r.observe(t)?;
                    let poses = compute_poses(&sys.model, &o.x);
                    let (_, area) = crate::regions::buoyancy_of(&sys.model, bg, &poses);
                    let st = body_vel(&sys, &o.x, &sys.model.bodies[bg]);
                    let (ax, ay) = (o.sol.acc[3 * bi], o.sol.acc[3 * bi + 1]);
                    let amag = (ax * ax + ay * ay).sqrt();
                    let speed = (st.vx * st.vx + st.vy * st.vy).sqrt();
                    // buoyancy from the motion: the only other force is the weight (no drag)
                    let fb_motion = if no_drag { Some(mass * (ay - gv.y)) } else { None };
                    let ang = st.th.rem_euclid(std::f64::consts::FRAC_PI_2);
                    let is_upright = ang.min(std::f64::consts::FRAC_PI_2 - ang) <= 1e-9;
                    let floating = area > 0.0 && area < total * (1.0 - 1e-9);
                    let submerged = area >= total * (1.0 - 1e-9);
                    let rest_ratio = js_max(speed / js_max(1e-12, (g * total.sqrt()).sqrt()), amag / g);
                    let rest = Condition {
                        id: "rest".into(),
                        label: t!("物体已静止（平衡）"),
                        status: if rest_ratio <= 1e-9 {
                            CondStatus::Ok
                        } else if rest_ratio <= 1e-3 {
                            CondStatus::Approx
                        } else {
                            CondStatus::Fail
                        },
                        detail: t!("v = {0} m/s，a = {1} m/s²", js_num(js_to_precision3(speed)), js_num(js_to_precision3(amag))),
                    };
                    let draft = width.map(|w| area / w);
                    Ok(Sample {
                        vars: vec![
                            ("rho", var(rho, "kg/m³", "\\rho_f", t!("液体密度"))),
                            ("g", var(g, "m/s²", "g", t!("重力加速度"))),
                            ("m", var(mass, "kg", "m", t!("物体质量"))),
                            ("d", var(depth, "m", "d", t!("物体厚度（垂直纸面）"))),
                            ("A", var(area, "m²", "A", t!("浸入部分的面积（仿真）"))),
                            ("S", var(total, "m²", "S", t!("物体的截面积"))),
                            ("rhoB", var(rho_b, "kg/m³", "\\rho_b", t!("物体的平均密度"))),
                            ("w", var(width.unwrap_or(f64::NAN), "m", "w", t!("物体宽度"))),
                        ],
                        measures: vec![
                            ("Fb", meas_note(fb_motion, "N", t!("浮力（由运动求得：m(a + g)）"), if no_drag { None } else { Some(t!("有液体阻力时不能由运动分离出浮力")) })),
                            ("FbA", meas(Some(rho * g * area * depth), "N", t!("浮力 ρ液gV排（V排 取仿真值）"))),
                            ("frac", meas(Some(area / total), "", t!("浸入体积占总体积的比例"))),
                            ("draft", meas(draft, "m", t!("吃水深度"))),
                            ("a", meas(Some(ay), "m/s²", t!("竖直方向的加速度"))),
                        ],
                        conditions: vec![
                            rest,
                            cond("floating", t!("部分浸入（漂浮）"), floating, unless(floating, if submerged { t!("全部浸没") } else { t!("没有浸入液体") })),
                            cond("submerged", t!("全部浸没"), submerged, Text::empty()),
                            cond("noDrag", t!("液体阻力为零"), no_drag, unless(no_drag, t!("有液体阻力"))),
                            cond("box", t!("竖直放置的长方体"), width.is_some() && is_upright, unless(width.is_some() && is_upright, t!("不是竖直放置的长方体"))),
                        ],
                    })
                }),
            });
        }
    }
    Ok(())
}

fn js_to_precision3(v: f64) -> f64 {
    if v == 0.0 || !v.is_finite() {
        return v;
    }
    let e = v.abs().log10().floor();
    let f = 10f64.powf(2.0 - e);
    (v * f).round() / f
}

// ---- Charged body in a field region ----
fn zone_situations(r: &mut Rec, out: &mut Vec<Situation>) -> SimResult<()> {
    let sys = r.sys.clone();
    let model = &sys.model;
    let gv = model.settings.gravity;
    let no_gravity = gv.x == 0.0 && gv.y == 0.0;
    // global fields or the Coulomb force between charges: the region formulas do not hold
    if model.e_field.x != 0.0 || model.e_field.y != 0.0 || model.b_field != 0.0 || (model.k_coulomb > 0.0 && model.charged.len() > 1) {
        return Ok(());
    }
    let nsw = model.arena.switches.len();
    for (k, &(zi, bg)) in model.zone_pairs.iter().enumerate() {
        let b = &model.bodies[bg];
        let a = attached(model, &b.id);
        if !(a.ropes.is_empty() && a.rods.is_empty() && a.springs.is_empty() && a.hinges.is_empty() && a.forces.is_empty()) || b.drag_lin > 0.0 || b.drag_quad > 0.0 {
            continue;
        }
        let z = model.zones[zi].clone();
        let e_mag = (z.e.x * z.e.x + z.e.y * z.e.y).sqrt();
        let ty: &'static str = if z.b != 0.0 && e_mag == 0.0 && no_gravity {
            "zone-b"
        } else if z.b == 0.0 && e_mag > 0.0 && z.omega == 0.0 {
            "zone-e"
        } else {
            continue;
        };
        // inside this region and in no other region with a field
        let pairs_of_body: Vec<usize> = model.zone_pairs.iter().enumerate().filter(|(_, p)| p.1 == bg).map(|(j, _)| j).collect();
        let list = runs(r, &mut |seg| {
            let sw = seg.mode.sw.as_ref()?;
            if sw.len() != nsw + model.zone_pairs.len() || sw[nsw + k] <= 0 {
                return None;
            }
            if pairs_of_body.iter().any(|&j| j != k && sw[nsw + j] > 0) {
                return None;
            }
            if !touching_units(&sys, &seg.mode, &b.id).is_empty() {
                return None;
            }
            Some(format!("zone:{k}"))
        });
        let bi = b.index as usize;
        let (q, mass) = (b.charge, b.mass);
        for run in list {
            if run.t1 - run.t0 < 1e-9 {
                continue;
            }
            let x0 = r.seg(run.segs[0]).x0.clone();
            let s0 = body_vel(&sys, &x0, b);
            let v0 = (s0.vx * s0.vx + s0.vy * s0.vy).sqrt();
            if ty == "zone-b" && !(v0 > 1e-9) {
                continue;
            }
            // the run ends where the body leaves the region (an event), not at the end of the recording
            let leaves = r.events().iter().any(|e| (e.t - run.t1).abs() <= 1e-12 && e.changes.iter().any(|c| c.ty == Some(crate::simulation::ChangeType::ZoneLeave)));
            let x1 = if leaves { Some(r.exact(run.t1)?) } else { None };
            // entering at right angles through a straight edge (a rectangle side)
            let perp = match z.shape {
                crate::scene::RegionShape::Rect { x: cx, y: cy, w, h } => {
                    let (dx, dy) = ((s0.x - cx).abs() - 0.5 * w, (s0.y - cy).abs() - 0.5 * h);
                    // the edge the body is on: the nearer one
                    let (nx, ny) = if dx.abs() <= dy.abs() { (1.0, 0.0) } else { (0.0, 1.0) };
                    let along_edge = (s0.vx * ny - s0.vy * nx).abs();
                    let on_edge = dx.abs().min(dy.abs()) <= 1e-9 * js_max(1.0, w.max(h));
                    on_edge && along_edge <= 1e-9 * js_max(1.0, v0)
                }
                _ => false,
            };
            // ... and the half circle lies inside the region, so the body leaves through the same edge after half a
            // turn (otherwise it leaves through another side earlier, as in a cyclotron once the radius has grown)
            let fits = perp
                && match z.shape {
                    crate::scene::RegionShape::Rect { x: cx, y: cy, w, h } if ty == "zone-b" && q != 0.0 => {
                        let rad = mass * v0 / (q.abs() * z.b.abs());
                        // unit vector towards the centre of the circle: the direction of q v × B at entry
                        let sg = if q * z.b > 0.0 { 1.0 } else { -1.0 };
                        let (fx, fy) = (sg * s0.vy / v0, -sg * s0.vx / v0);
                        let (ux, uy) = (s0.vx / v0, s0.vy / v0);
                        let tol = 1e-9 * js_max(1.0, w.max(h));
                        let inside = |px: f64, py: f64| (px - cx).abs() <= 0.5 * w + tol && (py - cy).abs() <= 0.5 * h + tol;
                        // the corners of the half circle's bounding box (the rectangle is convex)
                        [(0.0, 1.0), (2.0, 0.0), (2.0, 1.0)].iter().all(|&(kf, ku)| inside(s0.x + rad * (kf * fx + ku * ux), s0.y + rad * (kf * fy + ku * uy)))
                    }
                    _ => false,
                };
            let view = r.v;
            let (t0, t1) = (run.t0, run.t1);
            let name = b.name.clone();
            let zname = z.name.clone();
            let title = if ty == "zone-b" { t!("{0} 在{1}中做圆周运动", name, zname) } else { t!("{0} 在{1}中加速", name, zname) };
            let z2 = z.clone();
            out.push(Situation {
                key: format!("{}:{}:{}", ty, b.id, js_num(t0)),
                ty,
                title,
                t0,
                t1,
                t_event: None,
                bodies: vec![b.id.clone()],
                sample: Rc::new(move |s, t| {
                    let mut r = Rec::new(s, view);
                    let sys = r.sys.clone();
                    let o = r.observe(t)?;
                    let st = body_vel(&sys, &o.x, &sys.model.bodies[bg]);
                    let (ax, ay) = (o.sol.acc[3 * bi], o.sol.acc[3 * bi + 1]);
                    let a = (ax * ax + ay * ay).sqrt();
                    let v = (st.vx * st.vx + st.vy * st.vy).sqrt();
                    let (sx, sy) = (st.x - s0.x, st.y - s0.y);
                    let mut vars = vec![("q", var(q, "C", "q", t!("电荷量"))), ("m", var(mass, "kg", "m", t!("质量"))), ("t", var(t - t0, "s", "t", t!("在区域内的时间")))];
                    let mut measures = Vec::new();
                    let mut conditions = Vec::new();
                    if ty == "zone-b" {
                        let cross = (st.vx * ay - st.vy * ax).abs();
                        vars.extend([("B", var(z2.b.abs(), "T", "B", t!("磁感应强度大小"))), ("v", var(v0, "m/s", "v", t!("进入时的速度大小")))]);
                        let (tin, chord) = match &x1 {
                            Some(x) => {
                                let e = body_vel(&sys, x, &sys.model.bodies[bg]);
                                (Some(t1 - t0), Some(((e.x - s0.x).powi(2) + (e.y - s0.y).powi(2)).sqrt()))
                            }
                            None => (None, None),
                        };
                        let note = if tin.is_none() { Some(t!("记录内没有离开区域")) } else { None };
                        measures.extend([
                            ("F", meas(Some(mass * a), "N", t!("洛伦兹力大小（由运动求得 ma）"))),
                            ("r", meas(if cross > 0.0 { Some(v * v * v / cross) } else { None }, "m", t!("轨迹的曲率半径"))),
                            ("speed", meas(Some(v), "m/s", t!("此刻的速率"))),
                            ("tin", meas_note(tin, "s", t!("在区域内运动的时间"), note.clone())),
                            ("chord", meas_note(chord, "m", t!("入射点与出射点的距离"), note)),
                        ]);
                        let why = if !perp { t!("不是垂直于直边界射入") } else { t!("半个圆周超出了区域，会从另一条边界提前射出") };
                        conditions.push(cond("semi", t!("垂直于边界射入（转过半周后射出）"), fits, unless(fits, why)));
                    } else {
                        let (ex, ey) = (z2.e.x, z2.e.y);
                        let e_mag = (ex * ex + ey * ey).sqrt();
                        let (eux, euy) = (ex / e_mag, ey / e_mag);
                        let from_rest = v0 == 0.0;
                        // the force on the charge points along the initial velocity (it speeds up in a straight line)
                        let along = from_rest || ((s0.vx * euy - s0.vy * eux).abs() <= 1e-9 * v0 && q * (s0.vx * eux + s0.vy * euy) > 0.0);
                        vars.extend([
                            ("E", var(e_mag, "V/m", "E", t!("电场强度大小"))),
                            ("Ex", var(ex, "V/m", "E_x", t!("电场强度 x 分量"))),
                            ("Ey", var(ey, "V/m", "E_y", t!("电场强度 y 分量"))),
                            ("gx", var(gv.x, "m/s²", "g_x", t!("重力加速度 x 分量"))),
                            ("gy", var(gv.y, "m/s²", "g_y", t!("重力加速度 y 分量"))),
                            ("v0", var(v0, "m/s", "v_0", t!("进入时的速度大小"))),
                            ("sx", var(sx, "m", "s_x", t!("x 方向位移（仿真）"))),
                            ("sy", var(sy, "m", "s_y", t!("y 方向位移（仿真）"))),
                            ("d", var((sx * eux + sy * euy).abs(), "m", "d", t!("沿电场方向移动的距离（仿真）"))),
                        ]);
                        measures.extend([
                            ("a", meas(Some(a), "m/s²", t!("加速度大小"))),
                            ("speed", meas(Some(v), "m/s", t!("此刻的速率"))),
                            ("dEk", meas(Some(0.5 * mass * (v * v - v0 * v0)), "J", t!("动能的增加"))),
                        ]);
                        conditions.extend([
                            cond("noGravity", t!("不计重力"), no_gravity, unless(no_gravity, t!("有重力"))),
                            cond("along", t!("由静止释放，或初速度与电场力同向"), along, unless(along, t!("初速度与电场力不同向"))),
                        ]);
                    }
                    Ok(Sample { vars, measures, conditions })
                }),
            });
        }
    }
    Ok(())
}
