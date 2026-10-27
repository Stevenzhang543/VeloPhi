//! Recognizers of 26.54 (D78): a charged body in uniform electric and magnetic fields (deflection in E, circular
//! motion in B, the velocity selector, motion in both fields) and two charges interacting by the Coulomb force.
//! Rust only (D77): the TypeScript reference knows no charges, so scenes with these situations are never compared
//! with it. In scenes without charges in fields nothing here runs.

use std::rc::Rc;

use super::situations::{lazy, Lazy};
use super::*;
use crate::js::{js_max, js_num};
use crate::kinematics::compute_poses;
use crate::message::Text;
use crate::model::BodyModel;
use crate::t;

/// Situation types whose formulas stay valid for a charged body in an electric scene: the others assume that
/// only the mechanical forces act (gravity, contacts, connectors), so they are dropped for charged bodies.
const ELECTRIC_SAFE: [&str; 10] = ["uniform", "collision", "bounce", "charge-e", "charge-b", "charge-eb", "selector", "coulomb", "energy", "momentum"];

/// All recognizers of 26.54, in a stable order (nothing without charges in fields).
pub fn situations2654(r: &mut Rec, out: &mut Vec<Situation>) -> SimResult<()> {
    if !r.sys.model.electric {
        return Ok(());
    }
    field_situations(r, out)?;
    coulomb_situations(r, out)?;
    Ok(())
}

/// Drop the situations of other recognizers that involve a charged body of an electric scene (see ELECTRIC_SAFE).
pub fn filter_electric(model: &Model, out: &mut Vec<Situation>) {
    if !model.electric {
        return;
    }
    let charged: Vec<&str> = model.charged.iter().map(|&g| model.bodies[g].id.as_str()).collect();
    out.retain(|s| ELECTRIC_SAFE.contains(&s.ty) || !s.bodies.iter().any(|b| charged.contains(&b.as_str())));
}

/// The body moves freely apart from the fields: no connectors, applied forces, drag or gravitation. (`attached`
/// counts the charge of an electric scene as one extra.)
fn free_charge(model: &Model, b: &BodyModel) -> bool {
    let a = attached(model, &b.id);
    a.ropes.len() + a.rods.len() + a.springs.len() + a.hinges.len() + a.forces.len() == 0 && a.extra == 1
}

fn speed_of(st: &BodyVel) -> f64 {
    (st.vx * st.vx + st.vy * st.vy).sqrt()
}

// ---- Charged body in uniform fields ----
fn field_situations(r: &mut Rec, out: &mut Vec<Situation>) -> SimResult<()> {
    let sys = r.sys.clone();
    let model = &sys.model;
    let (ex, ey, bz) = (model.e_field.x, model.e_field.y, model.b_field);
    let e_mag = (ex * ex + ey * ey).sqrt();
    let (has_e, has_b) = (e_mag > 0.0, bz != 0.0);
    // Two or more charges with the Coulomb force: the field formulas do not hold
    if !(has_e || has_b) || (model.k_coulomb > 0.0 && model.charged.len() > 1) {
        return Ok(());
    }
    let gv = model.settings.gravity;
    let no_gravity = gv.x == 0.0 && gv.y == 0.0;
    for &bg in &model.charged {
        let b = &model.bodies[bg];
        if !b.dynamic || !free_charge(model, b) {
            continue;
        }
        let list = runs(r, &mut |seg| if touching_units(&sys, &seg.mode, &b.id).is_empty() { Some(format!("q:{}", b.id)) } else { None });
        let bi = b.index as usize;
        let (q, mass) = (b.charge, b.mass);
        for run in list {
            if run.t1 - run.t0 < 1e-9 {
                continue;
            }
            let s0 = body_vel(&sys, &r.seg(run.segs[0]).x0, b);
            let v0 = speed_of(&s0);
            let o0 = r.observe(run.t0)?;
            let a0 = (sq(o0.sol.acc[3 * bi]) + sq(o0.sol.acc[3 * bi + 1])).sqrt();
            let ty: &'static str = if has_e && !has_b {
                "charge-e"
            } else if has_b && !has_e && no_gravity {
                if !(v0 > 1e-9) {
                    continue;
                }
                "charge-b"
            } else if has_e && has_b && no_gravity && v0 > 1e-9 && a0 <= 1e-9 * js_max(1.0, q.abs() * e_mag / mass) {
                "selector"
            } else {
                "charge-eb"
            };
            let view = r.v;
            let (t0, t1) = (run.t0, run.t1);
            let name = b.name.clone();
            let title = match ty {
                "charge-e" => t!("{0} 在匀强电场中运动", name),
                "charge-b" => t!("{0} 在匀强磁场中做匀速圆周运动", name),
                "selector" => t!("{0} 通过速度选择器", name),
                _ => t!("{0} 在电场和磁场中运动", name),
            };
            let ek0 = 0.5 * mass * v0 * v0;
            // circular motion in B: centre of curvature at the start, for the period
            let (cx, cy, ccw) = {
                let (ax, ay) = (o0.sol.acc[3 * bi], o0.sol.acc[3 * bi + 1]);
                let rr = if a0 > 0.0 { v0 * v0 / a0 } else { 0.0 };
                let (ux, uy) = if a0 > 0.0 { (ax / a0, ay / a0) } else { (0.0, 0.0) };
                (s0.x + rr * ux, s0.y + rr * uy, s0.vx * ay - s0.vy * ax > 0.0)
            };
            let period: Lazy<Option<f64>> = lazy();
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
                    let v = speed_of(&st);
                    let (sx, sy) = (st.x - s0.x, st.y - s0.y);
                    let ek = 0.5 * mass * v * v;
                    let poses = compute_poses(&sys.model, &o.x);
                    let parts = crate::dynamics::electric_parts(&sys.model, &poses, bg);
                    let fb = (parts[1].0 * parts[1].0 + parts[1].1 * parts[1].1).sqrt();
                    let lorentz_power = parts[1].0 * st.vx + parts[1].1 * st.vy;
                    let mut vars = vec![
                        ("q", var(q, "C", "q", t!("电荷量"))),
                        ("m", var(mass, "kg", "m", t!("质量"))),
                        ("t", var(t - t0, "s", "t", t!("运动时间"))),
                    ];
                    let mut measures = Vec::new();
                    let mut conditions = Vec::new();
                    match ty {
                        "charge-e" => {
                            // Direction of the field and of the initial velocity: drift along E, length along v0
                            let (eux, euy) = (ex / e_mag, ey / e_mag);
                            let perp = v0 > 1e-9 && (s0.vx * eux + s0.vy * euy).abs() <= 1e-9 * v0;
                            let (pux, puy) = if v0 > 0.0 { (s0.vx / v0, s0.vy / v0) } else { (0.0, 0.0) };
                            let along = st.vx * pux + st.vy * puy;
                            let across = (st.vx * eux + st.vy * euy).abs();
                            vars.extend([
                                ("E", var(e_mag, "V/m", "E", t!("电场强度大小"))),
                                ("Ex", var(ex, "V/m", "E_x", t!("电场强度 x 分量"))),
                                ("Ey", var(ey, "V/m", "E_y", t!("电场强度 y 分量"))),
                                ("gx", var(gv.x, "m/s²", "g_x", t!("重力加速度 x 分量"))),
                                ("gy", var(gv.y, "m/s²", "g_y", t!("重力加速度 y 分量"))),
                                ("vx0", var(s0.vx, "m/s", "v_{0x}", t!("初速度 x 分量"))),
                                ("vy0", var(s0.vy, "m/s", "v_{0y}", t!("初速度 y 分量"))),
                                ("v0", var(v0, "m/s", "v_0", t!("初速度大小"))),
                                ("sx", var(sx, "m", "s_x", t!("x 方向位移（仿真）"))),
                                ("sy", var(sy, "m", "s_y", t!("y 方向位移（仿真）"))),
                                ("L", var(sx * pux + sy * puy, "m", "L", t!("沿初速度方向的位移（仿真）"))),
                            ]);
                            measures.extend([
                                ("a", meas(Some(a), "m/s²", t!("加速度大小"))),
                                ("dx", meas(Some(sx), "m", t!("x 方向位移"))),
                                ("dy", meas(Some(sy), "m", t!("y 方向位移"))),
                                ("vx", meas(Some(st.vx), "m/s", t!("x 方向速度"))),
                                ("vy", meas(Some(st.vy), "m/s", t!("y 方向速度"))),
                                ("drift", meas(Some((sx * eux + sy * euy).abs()), "m", t!("沿电场方向的偏移量"))),
                                ("tan", meas(if perp && along.abs() > 0.0 { Some(across / along.abs()) } else { None }, "", t!("偏转角的正切 v⊥/v∥"))),
                                ("dEk", meas(Some(ek - ek0), "J", t!("动能的增加"))),
                            ]);
                            let from_rest = v0 == 0.0;
                            conditions.extend([
                                cond("noGravity", t!("不计重力"), no_gravity, unless(no_gravity, t!("有重力"))),
                                cond("perp", t!("垂直于电场方向射入"), perp, unless(perp, t!("初速度与电场不垂直"))),
                                cond("fromRest", t!("由静止释放"), from_rest, unless(from_rest, t!("有初速度"))),
                            ]);
                        }
                        "charge-b" => {
                            if period.borrow().is_none() {
                                let (rx, ry) = (s0.x - cx, s0.y - cy);
                                let rad = (rx * rx + ry * ry).sqrt();
                                let sg = if ccw { 1.0 } else { -1.0 };
                                let ts = crossings(&mut r, &mut |_, x, _| Ok(sg * ((rx * (x[3 * bi + 1] - cy) - ry * (x[3 * bi] - cx)) / rad)), t0, t1, 1, 1)?;
                                *period.borrow_mut() = Some(ts.first().map(|&tt| tt - t0));
                            }
                            let per = period.borrow().expect("measured");
                            let cross = (st.vx * ay - st.vy * ax).abs();
                            vars.extend([("B", var(bz.abs(), "T", "B", t!("磁感应强度大小"))), ("v", var(v0, "m/s", "v", t!("速度大小")))]);
                            measures.extend([
                                ("F", meas(Some(fb), "N", t!("洛伦兹力大小"))),
                                ("r", meas(if cross > 0.0 { Some(v * v * v / cross) } else { None }, "m", t!("轨迹的曲率半径"))),
                                ("T", meas_note(per, "s", t!("转一周的时间"), if per.is_none() { Some(t!("记录时长不足一周")) } else { None })),
                                ("speed", meas(Some(v), "m/s", t!("此刻的速率"))),
                                ("P", meas(Some(lorentz_power), "W", t!("洛伦兹力的功率 F·v"))),
                            ]);
                            conditions.push(cond("perp", t!("速度垂直于磁场（平面运动）"), true, Text::empty()));
                        }
                        "selector" => {
                            vars.extend([
                                ("E", var(e_mag, "V/m", "E", t!("电场强度大小"))),
                                ("B", var(bz.abs(), "T", "B", t!("磁感应强度大小"))),
                            ]);
                            let fe = (parts[0].0 * parts[0].0 + parts[0].1 * parts[0].1).sqrt();
                            measures.extend([
                                ("speed", meas(Some(v), "m/s", t!("此刻的速率"))),
                                ("FE", meas(Some(fe), "N", t!("电场力大小"))),
                                ("FB", meas(Some(fb), "N", t!("洛伦兹力大小"))),
                            ]);
                            conditions.push(cond("balanced", t!("电场力与洛伦兹力平衡（匀速直线运动）"), true, Text::empty()));
                        }
                        _ => {
                            vars.extend([
                                ("Ex", var(ex, "V/m", "E_x", t!("电场强度 x 分量"))),
                                ("Ey", var(ey, "V/m", "E_y", t!("电场强度 y 分量"))),
                                ("gx", var(gv.x, "m/s²", "g_x", t!("重力加速度 x 分量"))),
                                ("gy", var(gv.y, "m/s²", "g_y", t!("重力加速度 y 分量"))),
                                ("sx", var(sx, "m", "s_x", t!("x 方向位移（仿真）"))),
                                ("sy", var(sy, "m", "s_y", t!("y 方向位移（仿真）"))),
                            ]);
                            measures.extend([("dEk", meas(Some(ek - ek0), "J", t!("动能的增加"))), ("P", meas(Some(lorentz_power), "W", t!("洛伦兹力的功率 F·v")))]);
                        }
                    }
                    Ok(Sample { vars, measures, conditions })
                }),
            });
        }
    }
    Ok(())
}

// ---- Two charges and the Coulomb force ----
fn coulomb_situations(r: &mut Rec, out: &mut Vec<Situation>) -> SimResult<()> {
    let sys = r.sys.clone();
    let model = &sys.model;
    let n = sys.n;
    let gv = model.settings.gravity;
    if !(model.k_coulomb > 0.0) || model.charged.len() != 2 || model.e_field.x != 0.0 || model.e_field.y != 0.0 || model.b_field != 0.0 || gv.x != 0.0 || gv.y != 0.0 {
        return Ok(());
    }
    let (g1, g2) = (model.charged[0], model.charged[1]);
    let (b1, b2) = (&model.bodies[g1], &model.bodies[g2]);
    if [b1, b2].iter().any(|b| b.dynamic && !free_charge(model, b)) {
        return Ok(());
    }
    // The moving charge whose motion is described (the first dynamic one)
    let (mg, og) = if b1.dynamic { (g1, g2) } else { (g2, g1) };
    let (mb, ob) = (&model.bodies[mg], &model.bodies[og]);
    let other_fixed = !ob.dynamic;
    let k = model.k_coulomb;
    let (q1, q2) = (mb.charge, ob.charge);
    let rr = mb.bound + ob.bound;
    let ids: Vec<String> = [b1, b2].iter().filter(|b| b.dynamic).map(|b| b.id.clone()).collect();
    let list = runs(r, &mut |seg| if ids.iter().all(|id| touching_units(&sys, &seg.mode, id).is_empty()) { Some("coulomb".into()) } else { None });
    let dyn_ids: Vec<usize> = [g1, g2].into_iter().filter(|&g| model.bodies[g].dynamic).collect();
    let ke = move |sys: &System, x: &[f64]| -> f64 {
        dyn_ids
            .iter()
            .map(|&g| {
                let b = &sys.model.bodies[g];
                let i = b.index as usize;
                0.5 * b.mass * (sq(x[3 * n + 3 * i]) + sq(x[3 * n + 3 * i + 1]))
            })
            .sum()
    };
    let ke = Rc::new(ke);
    for run in list {
        if run.t1 - run.t0 < 1e-9 {
            continue;
        }
        let x0 = r.seg(run.segs[0]).x0.clone();
        let p0 = compute_poses(model, &x0);
        let (ax0, ay0) = crate::dynamics::charge_pos(model, &p0, mg);
        let (bx0, by0) = crate::dynamics::charge_pos(model, &p0, og);
        let r0 = ((bx0 - ax0).powi(2) + (by0 - ay0).powi(2)).sqrt();
        let e0 = ke(&sys, &x0) + k * q1 * q2 / r0;
        let s0 = body_vel(&sys, &x0, mb);
        let v0 = speed_of(&s0);
        // head-on: the velocity points at the fixed charge (impact parameter 0) and the charges repel
        let head_on = other_fixed && v0 > 1e-9 && q1 * q2 > 0.0 && ((bx0 - ax0) * s0.vy - (by0 - ay0) * s0.vx).abs() <= 1e-9 * r0 * v0 && (bx0 - ax0) * s0.vx + (by0 - ay0) * s0.vy > 0.0;
        let rmin: Lazy<Option<f64>> = lazy();
        let view = r.v;
        let (t0, t1) = (run.t0, run.t1);
        let ke = ke.clone();
        let mi = mb.index as usize;
        let mass = mb.mass;
        out.push(Situation {
            key: format!("coulomb:{}", js_num(t0)),
            ty: "coulomb",
            title: t!("{0} 与 {1} 的库仑相互作用", b1.name.clone(), b2.name.clone()),
            t0,
            t1,
            t_event: None,
            bodies: vec![b1.id.clone(), b2.id.clone()],
            sample: Rc::new(move |s, t| {
                let mut r = Rec::new(s, view);
                let sys = r.sys.clone();
                let x = r.exact(t)?;
                let poses = compute_poses(&sys.model, &x);
                let (ax, ay) = crate::dynamics::charge_pos(&sys.model, &poses, mg);
                let (bx, by) = crate::dynamics::charge_pos(&sys.model, &poses, og);
                let d = ((bx - ax).powi(2) + (by - ay).powi(2)).sqrt();
                let fc = crate::dynamics::electric_parts(&sys.model, &poses, mg)[2];
                if head_on && rmin.borrow().is_none() {
                    // turning point: the radial velocity changes sign
                    let ts = crossings(&mut r, &mut |_, x, _| Ok(-((x[3 * mi] - bx0) * x[3 * n + 3 * mi] + (x[3 * mi + 1] - by0) * x[3 * n + 3 * mi + 1])), t0, t1, 1, 1)?;
                    let v = match ts.first() {
                        Some(&tt) => {
                            let xt = r.exact(tt)?;
                            Some((sq(xt[3 * mi] - bx0) + sq(xt[3 * mi + 1] - by0)).sqrt())
                        }
                        None => None,
                    };
                    *rmin.borrow_mut() = Some(v);
                }
                let rm = rmin.borrow().unwrap_or(None);
                Ok(Sample {
                    vars: vec![
                        ("k", var(k, "N·m²/C²", "k", t!("静电力常量"))),
                        ("q1", var(q1, "C", "q_1", t!("{0}的电荷量", sys.model.bodies[mg].name.clone()))),
                        ("q2", var(q2, "C", "q_2", t!("{0}的电荷量", sys.model.bodies[og].name.clone()))),
                        ("m", var(mass, "kg", "m", t!("{0}质量", sys.model.bodies[mg].name.clone()))),
                        ("r", var(d, "m", "r", t!("两电荷间的距离（仿真）"))),
                        ("r0", var(r0, "m", "r_0", t!("初始距离"))),
                        ("v0", var(v0, "m/s", "v_0", t!("初速度大小"))),
                        ("E0", var(e0, "J", "E_0", t!("初始的动能与电势能之和"))),
                    ],
                    measures: vec![
                        ("F", meas(Some((fc.0 * fc.0 + fc.1 * fc.1).sqrt()), "N", t!("库仑力大小"))),
                        ("E", meas(Some(ke(&sys, &x) + k * q1 * q2 / d), "J", t!("动能与电势能之和 Ek + kq₁q₂/r"))),
                        ("rmin", meas_note(rm, "m", t!("最近距离"), if head_on && rm.is_none() { Some(t!("记录内没有到达最近点")) } else { None })),
                    ],
                    conditions: vec![
                        cond("apart", t!("两电荷的包围圆不相交（点电荷）"), d >= rr, unless(d >= rr, t!("距离小于两物体半径之和，力按均匀带电球减小"))),
                        cond("headOn", t!("正对固定电荷射入且相互排斥"), head_on, Text::empty()),
                    ],
                })
            }),
        });
    }
    Ok(())
}
