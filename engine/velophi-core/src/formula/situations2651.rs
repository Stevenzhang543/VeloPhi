//! Recognizers of 26.51 (port of src/formula/situations2651.ts): uniform motion, a block pulled by a constant force,
//! a lever in balance, uniform circular motion, orbits, falls with air drag, damped oscillation, a disc turned by a
//! torque motor and meshing gears.

use std::rc::Rc;

use super::situations::{lazy, Lazy};
use super::*;
use crate::dmath::{atan2, PI_VALUE};
use crate::dynamics::{Friction, AUX_WORK};
use crate::js::{js_max, js_num, js_to_precision};
use crate::message::Text;
use crate::model::{AnchorModel, ShapeModel};
use crate::t;

/// All recognizers of 26.51, in a stable order.
pub fn situations2651(r: &mut Rec, out: &mut Vec<Situation>) -> SimResult<()> {
    uniform_situations(r, out)?;
    const_force_situations(r, out)?;
    lever_situations(r, out)?;
    circle_situations(r, out)?;
    orbit_situations(r, out)?;
    drag_situations(r, out)?;
    damped_situations(r, out)?;
    spin_situations(r, out)?;
    gear_situations(r, out)?;
    Ok(())
}

fn zero_gravity(model: &Model) -> bool {
    model.settings.gravity.x == 0.0 && model.settings.gravity.y == 0.0
}

/// Connectors of 26.51 attached to a body, by kind.
struct Attached2651 {
    welds: Vec<usize>,
    sliders: Vec<usize>,
    motors: Vec<usize>,
    gears: Vec<usize>,
    dampers: Vec<usize>,
}

fn attached2651(model: &Model, id: &str) -> Attached2651 {
    let on = |a: &AnchorModel| a.body.is_some_and(|g| model.bodies[g].id == id);
    let gid = |b: Option<usize>| b.is_some_and(|g| model.bodies[g].id == id);
    Attached2651 {
        welds: model.welds.iter().enumerate().filter(|(_, w)| on(&w.a) || on(&w.b)).map(|(i, _)| i).collect(),
        sliders: model.sliders.iter().enumerate().filter(|(_, w)| on(&w.a) || on(&w.b)).map(|(i, _)| i).collect(),
        motors: model.motors.iter().enumerate().filter(|(_, w)| on(&w.a) || on(&w.b)).map(|(i, _)| i).collect(),
        gears: model.gears.iter().enumerate().filter(|(_, g)| gid(g.a) || gid(g.b)).map(|(i, _)| i).collect(),
        dampers: model.springs.iter().enumerate().filter(|(_, s)| (on(&s.a) || on(&s.b)) && s.damper).map(|(i, _)| i).collect(),
    }
}

fn has_drag(b: &BodyModel) -> bool {
    b.drag_lin > 0.0 || b.drag_quad > 0.0
}
fn attracted(model: &Model, b: &BodyModel) -> bool {
    model.g_const > 0.0 && b.attract > 0.0
}
fn is_zero_local(p: crate::scene::Vec2) -> bool {
    p.x.abs() <= 1e-12 && p.y.abs() <= 1e-12
}
fn on_body(model: &Model, a: &AnchorModel, id: &str) -> bool {
    a.body.is_some_and(|g| model.bodies[g].id == id)
}

// ---- Uniform motion (Newton's first law) ----
fn uniform_situations(r: &mut Rec, out: &mut Vec<Situation>) -> SimResult<()> {
    let sys = r.sys.clone();
    let model = &sys.model;
    let n = sys.n;
    let g0 = zero_gravity(model);
    for &bg in &model.dynamic {
        let b = &model.bodies[bg];
        if !attached(model, &b.id).none() {
            continue;
        }
        // An impact on the body changes its velocity without changing the mode: it starts a new run
        let impacts: Vec<f64> = r
            .events()
            .iter()
            .filter(|e| {
                e.impact.as_ref().is_some_and(|imp| {
                    e.changes.iter().any(|c| c.bodies.contains(&b.id))
                        || imp.points.iter().any(|p| p.pair.is_some_and(|pi| model.bodies[sys.pairs[pi].x].id == b.id || model.bodies[sys.pairs[pi].y].id == b.id))
                })
            })
            .map(|e| e.t)
            .collect();
        let list = runs(r, &mut |seg| {
            let us = closed_units(&sys, &seg.mode, &b.id);
            let k = impacts.iter().filter(|&&t| t <= seg.t0 + 1e-12).count();
            if us.is_empty() {
                return if g0 { Some(format!("uni:{}:{}", b.id, k)) } else { None };
            }
            if us.len() != 1 || model.bodies[other_body(&sys, us[0], &b.id)].dynamic || us[0].friction != Friction::None {
                return None;
            }
            Some(format!("uni:{}:{}", b.id, k))
        });
        let bi = b.index as usize;
        for run in list {
            let s0 = body_vel(&sys, &r.seg(run.segs[0]).x0, b);
            let v0 = (s0.vx * s0.vx + s0.vy * s0.vy).sqrt();
            if !(v0 > 1e-9) {
                continue;
            }
            let o0 = r.observe(run.t0)?;
            let a0 = (sq(o0.sol.acc[3 * bi]) + sq(o0.sol.acc[3 * bi + 1])).sqrt();
            if a0 > 1e-12 * js_max(1.0, v0) {
                continue;
            }
            let view = r.v;
            let (t0, t1) = (run.t0, run.t1);
            let mass = b.mass;
            out.push(Situation {
                key: format!("uni:{}:{}", b.id, js_num(t0)),
                ty: "uniform",
                title: t!("{0} 的匀速直线运动", b.name.clone()),
                t0,
                t1,
                t_event: None,
                bodies: vec![b.id.clone()],
                sample: Rc::new(move |s, t| {
                    let mut r = Rec::new(s, view);
                    let sys = r.sys.clone();
                    let o = r.observe(t)?;
                    let st = body_vel(&sys, &o.x, &sys.model.bodies[bg]);
                    let dist = (sq(st.x - s0.x) + sq(st.y - s0.y)).sqrt();
                    let (ax, ay) = (o.sol.acc[3 * bi], o.sol.acc[3 * bi + 1]);
                    Ok(Sample {
                        vars: vec![
                            ("v", var(v0, "m/s", "v", t!("速度大小"))),
                            ("t", var(t - t0, "s", "t", t!("经过的时间"))),
                            ("s", var(dist, "m", "s", t!("通过的路程（仿真）"))),
                            ("m", var(mass, "kg", "m", t!("质量"))),
                        ],
                        measures: vec![
                            ("s", meas(Some(dist), "m", t!("通过的路程"))),
                            ("v", meas(Some((sq(o.x[3 * n + 3 * bi]) + sq(o.x[3 * n + 3 * bi + 1])).sqrt()), "m/s", t!("此刻的速率"))),
                            ("F", meas(Some(mass * (ax * ax + ay * ay).sqrt()), "N", t!("合力大小 ma"))),
                        ],
                        conditions: vec![cond("balanced", t!("合力为零（光滑水平面或不受力）"), true, Text::empty())],
                    })
                }),
            });
        }
    }
    Ok(())
}

// ---- A block pulled by a constant force on a horizontal surface ----
fn const_force_situations(r: &mut Rec, out: &mut Vec<Situation>) -> SimResult<()> {
    let sys = r.sys.clone();
    let model = &sys.model;
    let (g, vertical) = gravity(model);
    if !vertical || g <= 0.0 {
        return Ok(());
    }
    for &bg in &model.dynamic {
        let b = &model.bodies[bg];
        let at = attached(model, &b.id);
        if at.forces.len() != 1 || at.ropes.len() + at.rods.len() + at.springs.len() + at.hinges.len() + at.extra != 0 {
            continue;
        }
        let f = &model.forces[at.forces[0]];
        if f.expr.is_some() || !is_zero_local(f.a.local) || (f.force.x == 0.0 && f.force.y == 0.0) {
            continue;
        }
        let ex = if f.force.x < 0.0 { -1.0 } else { 1.0 };
        let fmag = (f.force.x * f.force.x + f.force.y * f.force.y).sqrt();
        let alpha = atan2(f.force.y, f.force.x.abs());
        let list = runs(r, &mut |seg| {
            let us = closed_units(&sys, &seg.mode, &b.id);
            if us.len() != 1 {
                return None;
            }
            let u = us[0];
            let other = &model.bodies[other_body(&sys, u, &b.id)];
            if other.dynamic || other.belt_speed != 0.0 || u.friction == Friction::Stick {
                return None;
            }
            Some(format!("cf:{}:{}", b.id, sys.pairs[u.pair].key))
        });
        let bi = b.index as usize;
        for run in list {
            let seg_i = run.segs[0];
            let seg0 = r.seg(seg_i).clone();
            let units0 = closed_units(&sys, &seg0.mode, &b.id);
            let u = units0[0].clone();
            let u_pos = seg0.mode.units.iter().position(|x| std::ptr::eq(x, units0[0]));
            // Horizontal surface: the contact normal on the body is straight up
            let o0 = r.observe(run.t0)?;
            // TypeScript: o0.mode.units.indexOf(u) — u belongs to seg0's mode object, so the index is found only when
            // the segment observed at t0 is seg0 itself
            let ui = if r.segment_at(run.t0) == seg_i { u_pos } else { None };
            let Some(ui) = ui else { continue };
            let kin = &o0.sol.units[ui].ref_kin;
            let pair = &sys.pairs[u.pair];
            let sign = if model.bodies[pair.features[u.ref_].a.body].id == b.id { 1.0 } else { -1.0 };
            if (sign * kin.nx).abs() > 1e-12 || sign * kin.ny < 0.0 {
                continue;
            }
            let s0 = body_vel(&sys, &seg0.x0, b);
            let v0 = ex * s0.vx;
            let mu_k = if u.friction == Friction::Slide { pair.material.mu_k } else { 0.0 };
            let w0 = seg0.x0[sys.aux_base + AUX_WORK];
            // Sliding forward: friction opposes motion along the force; a backward slide is a different formula
            let s_mid = body_vel(&sys, &r.exact((run.t0 + run.t1) / 2.0)?, b);
            let forward = v0 >= -1e-12 && ex * s_mid.vx > 0.0 && s0.vy.abs() < 1e-12;
            let horizontal = f.force.y == 0.0;
            let view = r.v;
            let (t0, t1) = (run.t0, run.t1);
            let mass = b.mass;
            let ukey = pair.key.clone();
            out.push(Situation {
                key: format!("cf:{}:{}", b.id, js_num(t0)),
                ty: "const-force",
                title: t!("{0} 在恒力 F 作用下沿水平面运动", b.name.clone()),
                t0,
                t1,
                t_event: None,
                bodies: vec![b.id.clone()],
                sample: Rc::new(move |s, t| {
                    let mut r = Rec::new(s, view);
                    let sys = r.sys.clone();
                    let o = r.observe(t)?;
                    let st = body_vel(&sys, &o.x, &sys.model.bodies[bg]);
                    let sd = ex * (st.x - s0.x);
                    let v = ex * st.vx;
                    let cf = o.mode.units.iter().position(|x| sys.pairs[x.pair].key == ukey && !x.points.is_empty());
                    let nf = cf.map(|i| o.sol.units[i].normal);
                    Ok(Sample {
                        vars: vec![
                            ("F", var(fmag, "N", "F", t!("拉力大小"))),
                            ("alpha", var(alpha, "rad", "\\alpha", t!("拉力与水平面的夹角"))),
                            ("m", var(mass, "kg", "m", t!("质量"))),
                            ("g", var(g, "m/s²", "g", t!("重力加速度"))),
                            ("muK", var(mu_k, "", "\\mu", t!("动摩擦因数"))),
                            ("v0", var(v0, "m/s", "v_0", t!("本阶段初速度"))),
                            ("t", var(t - t0, "s", "t", t!("本阶段经过时间"))),
                            ("s", var(sd, "m", "s", t!("位移（仿真）"))),
                            ("v", var(v, "m/s", "v", t!("速度（仿真）"))),
                        ],
                        measures: vec![
                            ("a", meas(Some(ex * o.sol.acc[3 * bi]), "m/s²", t!("沿拉力方向的加速度"))),
                            ("N", meas(nf, "N", t!("支持力"))),
                            ("W", meas(Some(o.x[sys.aux_base + AUX_WORK] - w0), "J", t!("拉力做的功（本阶段）"))),
                            ("P", meas(Some(o.sol.rates.applied_work), "W", t!("拉力的瞬时功率"))),
                            ("dEk", meas(Some(0.5 * mass * (sq(st.vx) + sq(st.vy) - sq(s0.vx) - sq(s0.vy))), "J", t!("动能的增加量"))),
                            ("dp", meas(Some(mass * (v - v0)), "kg·m/s", t!("动量的增加量"))),
                        ],
                        conditions: vec![
                            cond("forward", t!("沿拉力方向滑动（或光滑）"), forward, Text::empty()),
                            cond("horizontalForce", t!("拉力水平"), horizontal, if horizontal { Text::empty() } else { Text::Lit(format!("α = {}°", js_to_precision(alpha * 180.0 / PI_VALUE, 4))) }),
                        ],
                    })
                }),
            });
        }
    }
    Ok(())
}

// ---- Lever ----
fn lever_situations(r: &mut Rec, out: &mut Vec<Situation>) -> SimResult<()> {
    let sys = r.sys.clone();
    let model = &sys.model;
    let n = sys.n;
    let (g, vertical) = gravity(model);
    if !vertical || g <= 0.0 {
        return Ok(());
    }
    for (hi, h) in model.hinges.iter().enumerate() {
        let dynamic = |a: &AnchorModel| a.body.is_some_and(|g| model.bodies[g].dynamic);
        let (side_b, fixed_side) = if dynamic(&h.a) {
            (&h.a, &h.b)
        } else if dynamic(&h.b) {
            (&h.b, &h.a)
        } else {
            continue;
        };
        let Some(bg) = side_b.body else { continue };
        let Some(pivot) = anchor_world(model, fixed_side) else { continue };
        if !is_zero_local(side_b.local) {
            continue;
        }
        let bb = &model.bodies[bg];
        let at = attached(model, &bb.id);
        let at2 = attached2651(model, &bb.id);
        if at.hinges.len() != 1 || at.ropes.len() != 1 || at.rods.len() + at.springs.len() + at.forces.len() != 0 {
            continue;
        }
        if at2.welds.len() != 1 || at2.sliders.len() + at2.motors.len() + at2.gears.len() + at2.dampers.len() != 0 || has_drag(bb) || attracted(model, bb) {
            continue;
        }
        let rope = &model.ropes[at.ropes[0]];
        if !rope.pulleys.is_empty() {
            continue;
        }
        let rope_on_a = on_body(model, &rope.a, &bb.id);
        let (rope_on_b, rope_fixed) = if rope_on_a { (&rope.a, &rope.b) } else { (&rope.b, &rope.a) };
        let Some(pp) = anchor_world(model, rope_fixed) else { continue };
        let w = &model.welds[at2.welds[0]];
        let lg = if on_body(model, &w.a, &bb.id) { w.b.body } else { w.a.body };
        let Some(lg) = lg else { continue };
        let lb = &model.bodies[lg];
        if !lb.dynamic {
            continue;
        }
        let at_l = attached(model, &lb.id);
        let at2_l = attached2651(model, &lb.id);
        if at_l.ropes.len() + at_l.rods.len() + at_l.springs.len() + at_l.hinges.len() + at_l.forces.len() != 0 {
            continue;
        }
        if at2_l.welds.len() != 1 || at2_l.sliders.len() + at2_l.motors.len() + at2_l.gears.len() + at2_l.dampers.len() != 0 || has_drag(lb) || attracted(model, lb) {
            continue;
        }
        let ri = at.ropes[0];
        let list = runs(r, &mut |seg| {
            if touching_units(&sys, &seg.mode, &bb.id).len() + touching_units(&sys, &seg.mode, &lb.id).len() == 0 && seg.mode.taut[ri] {
                Some(format!("lever:{}", bb.id))
            } else {
                None
            }
        });
        let bi = bb.index as usize;
        let rl = rope_on_b.local;
        for run in list {
            let o0 = r.observe(run.t0)?;
            let (w0, beta0) = (o0.x[3 * n + 3 * bi + 2], o0.sol.acc[3 * bi + 2]);
            if w0.abs() > 1e-12 || beta0.abs() > 1e-9 {
                continue;
            }
            let poses = compute_poses(model, &o0.x);
            let pb = &poses[bb.global];
            let ax = pb.x + pb.c * rl.x - pb.s * rl.y;
            let ay = pb.y + pb.s * rl.x + pb.c * rl.y;
            let dl = (sq(pp.0 - ax) + sq(pp.1 - ay)).sqrt();
            let (ux, uy) = ((pp.0 - ax) / dl, (pp.1 - ay) / dl);
            let l1 = ((ax - pivot.0) * uy - (ay - pivot.1) * ux).abs();
            let l2 = (poses[lb.global].x - pivot.0).abs();
            let vertical_rope = ux.abs() < 1e-12 && uy < 0.0;
            let view = r.v;
            let (t0, t1) = (run.t0, run.t1);
            let (lm, bm) = (lb.mass, bb.mass);
            let (ln, bn) = (lb.name.clone(), bb.name.clone());
            out.push(Situation {
                key: format!("lever:{}:{}", bb.id, js_num(t0)),
                ty: "lever",
                title: t!("{0} 的杠杆平衡", bn.clone()),
                t0,
                t1,
                t_event: None,
                bodies: vec![bb.id.clone(), lb.id.clone()],
                sample: Rc::new(move |s, t| {
                    let mut r = Rec::new(s, view);
                    let o = r.observe(t)?;
                    let (fx, fy) = o.hinge_force(hi);
                    Ok(Sample {
                        vars: vec![
                            ("m", var(lm, "kg", "m", t!("{0}质量（阻力 F₂ = mg）", ln.clone()))),
                            ("M", var(bm, "kg", "M", t!("{0}质量", bn.clone()))),
                            ("g", var(g, "m/s²", "g", t!("重力加速度"))),
                            ("l1", var(l1, "m", "l_1", t!("动力臂（支点到绳的距离）"))),
                            ("l2", var(l2, "m", "l_2", t!("阻力臂（支点到重物重力作用线的距离）"))),
                        ],
                        measures: vec![
                            ("T", meas(Some(o.sol.rope_tension[ri]), "N", t!("绳的拉力（动力 F₁）"))),
                            ("N", meas(Some((fx * fx + fy * fy).sqrt()), "N", t!("支点对杠杆的作用力"))),
                        ],
                        conditions: vec![cond("balanced", t!("杠杆静止（处于平衡）"), true, Text::empty()), cond("verticalRope", t!("绳竖直向下拉"), vertical_rope, Text::empty())],
                    })
                }),
            });
        }
    }
    Ok(())
}

// ---- Uniform circular motion (no gravity: seen from above) ----
fn circle_situations(r: &mut Rec, out: &mut Vec<Situation>) -> SimResult<()> {
    let sys = r.sys.clone();
    let model = &sys.model;
    if !zero_gravity(model) {
        return Ok(());
    }
    for &bg in &model.dynamic {
        let b = &model.bodies[bg];
        let Some(link) = single_link(model, b) else { continue };
        let list = runs(r, &mut |seg| {
            if !touching_units(&sys, &seg.mode, &b.id).is_empty() {
                return None;
            }
            if link.is_rope && !seg.mode.taut[link.index] {
                return None;
            }
            Some(format!("circ:{}", b.id))
        });
        let bi = b.index as usize;
        for run in list {
            let s0 = body_vel(&sys, &r.seg(run.segs[0]).x0, b);
            let (rx, ry) = (s0.x - link.pivot.0, s0.y - link.pivot.1);
            let rad = (rx * rx + ry * ry).sqrt();
            let v = (s0.vx * s0.vx + s0.vy * s0.vy).sqrt();
            if !(v > 1e-9) || (rx * s0.vx + ry * s0.vy).abs() > 1e-9 * rad * v {
                continue;
            }
            let ccw = rx * s0.vy - ry * s0.vx > 0.0;
            let period: Lazy<Option<f64>> = lazy();
            let view = r.v;
            let (t0, t1) = (run.t0, run.t1);
            let mass = b.mass;
            out.push(Situation {
                key: format!("circ:{}:{}", b.id, js_num(t0)),
                ty: "circle",
                title: t!("{0} 的匀速圆周运动", b.name.clone()),
                t0,
                t1,
                t_event: None,
                bodies: vec![b.id.clone()],
                sample: Rc::new(move |s, t| {
                    let mut r = Rec::new(s, view);
                    let sys = r.sys.clone();
                    let o = r.observe(t)?;
                    let st = body_vel(&sys, &o.x, &sys.model.bodies[bg]);
                    let (qx, qy) = (st.x - link.pivot.0, st.y - link.pivot.1);
                    let w = (qx * st.vy - qy * st.vx) / (qx * qx + qy * qy);
                    let (ax, ay) = (o.sol.acc[3 * bi], o.sol.acc[3 * bi + 1]);
                    if period.borrow().is_none() {
                        // Full turns: the position crosses the starting radius line from behind
                        let sg = if ccw { 1.0 } else { -1.0 };
                        let ts = crossings(&mut r, &mut |_, x, _| Ok(sg * ((rx * (x[3 * bi + 1] - link.pivot.1) - ry * (x[3 * bi] - link.pivot.0)) / rad)), t0, t1, 1, 1)?;
                        *period.borrow_mut() = Some(ts.first().map(|&tt| tt - t0));
                    }
                    let per = period.borrow().expect("measured");
                    Ok(Sample {
                        vars: vec![("r", var(link.length, "m", "r", t!("圆周半径"))), ("v", var(v, "m/s", "v", t!("线速度大小"))), ("m", var(mass, "kg", "m", t!("质量")))],
                        measures: vec![
                            ("omega", meas(Some(w.abs()), "rad/s", t!("角速度大小"))),
                            ("T", meas_note(per, "s", t!("转一周的时间"), if per.is_none() { Some(t!("记录时长不足一周")) } else { None })),
                            ("a", meas(Some((ax * ax + ay * ay).sqrt()), "m/s²", t!("向心加速度大小"))),
                            (
                                "F",
                                meas(
                                    Some(if link.is_rope { o.sol.rope_tension[link.index] } else { rod_force(&o, link.index) }),
                                    "N",
                                    if link.is_rope { t!("绳的拉力（向心力）") } else { t!("杆的拉力（向心力）") },
                                ),
                            ),
                        ],
                        conditions: vec![cond("uniformCircle", t!("匀速圆周运动（不受重力，速度与半径垂直）"), true, Text::empty())],
                    })
                }),
            });
        }
    }
    Ok(())
}

// ---- Orbits ----
fn orbit_situations(r: &mut Rec, out: &mut Vec<Situation>) -> SimResult<()> {
    let sys = r.sys.clone();
    let model = &sys.model;
    let n = sys.n;
    if !(model.g_const > 0.0) || !zero_gravity(model) || model.attractors.len() != 2 {
        return Ok(());
    }
    let Some(&sg) = model.attractors.iter().find(|&&g| !model.bodies[g].dynamic) else { return Ok(()) };
    let Some(&bg) = model.attractors.iter().find(|&&g| model.bodies[g].dynamic) else { return Ok(()) };
    let (sb, b) = (&model.bodies[sg], &model.bodies[bg]);
    let at = attached(model, &b.id);
    let at2 = attached2651(model, &b.id);
    if at.ropes.len() + at.rods.len() + at.springs.len() + at.hinges.len() + at.forces.len() != 0 {
        return Ok(());
    }
    if at2.welds.len() + at2.sliders.len() + at2.motors.len() + at2.gears.len() + at2.dampers.len() != 0 || has_drag(b) {
        return Ok(());
    }
    let gc = model.g_const;
    let mc = sb.attract;
    let mu = gc * mc;
    let c = sb.grav_pos;
    let list = runs(r, &mut |seg| if touching_units(&sys, &seg.mode, &b.id).is_empty() { Some(format!("orbit:{}", b.id)) } else { None });
    let bi = b.index as usize;
    for run in list {
        let s0 = body_vel(&sys, &r.seg(run.segs[0]).x0, b);
        let (rx, ry) = (s0.x - c.x, s0.y - c.y);
        let r0 = (rx * rx + ry * ry).sqrt();
        let v0 = (s0.vx * s0.vx + s0.vy * s0.vy).sqrt();
        let eps = v0 * v0 / 2.0 - mu / r0;
        let h = rx * s0.vy - ry * s0.vx;
        let bound = eps < 0.0;
        let a = if bound { -mu / (2.0 * eps) } else { f64::NAN };
        let ecc = js_max(0.0, 1.0 + 2.0 * eps * h * h / (mu * mu)).sqrt();
        let circular = (v0 * v0 * r0 / mu - 1.0).abs() < 1e-9 && (rx * s0.vx + ry * s0.vy).abs() < 1e-9 * r0 * v0;
        let cache: Lazy<(Option<f64>, Option<f64>)> = lazy();
        let view = r.v;
        let (t0, t1) = (run.t0, run.t1);
        let mass = b.mass;
        let (sname, bname) = (sb.name.clone(), b.name.clone());
        out.push(Situation {
            key: format!("orbit:{}:{}", b.id, js_num(t0)),
            ty: "orbit",
            title: t!("{0} 绕 {1} 运动", bname.clone(), sname.clone()),
            t0,
            t1,
            t_event: None,
            bodies: vec![b.id.clone()],
            sample: Rc::new(move |s, t| {
                let mut r = Rec::new(s, view);
                let sys = r.sys.clone();
                let st = body_vel(&sys, &r.exact(t)?, &sys.model.bodies[bg]);
                let (qx, qy) = (st.x - c.x, st.y - c.y);
                let dist = (qx * qx + qy * qy).sqrt();
                let speed = (st.vx * st.vx + st.vy * st.vy).sqrt();
                if cache.borrow().is_none() {
                    let sgn = if h >= 0.0 { 1.0 } else { -1.0 };
                    let turn = crossings(&mut r, &mut |_, x, _| Ok(sgn * ((rx * (x[3 * bi + 1] - c.y) - ry * (x[3 * bi] - c.x)) / r0)), t0, t1, 1, 1)?;
                    // Apsides: the radial velocity changes sign (the start counts when it is one)
                    let radial = |x: &[f64]| (x[3 * bi] - c.x) * x[3 * n + 3 * bi] + (x[3 * bi + 1] - c.y) * x[3 * n + 3 * bi + 1];
                    let dist_of = |x: &[f64]| (sq(x[3 * bi] - c.x) + sq(x[3 * bi + 1] - c.y)).sqrt();
                    let ts = crossings(&mut r, &mut |_, x, _| Ok(radial(x)), t0, t1, 0, 2)?;
                    let mut aps = Vec::new();
                    for ta in ts {
                        aps.push(dist_of(&r.exact(ta)?));
                    }
                    if (rx * s0.vx + ry * s0.vy).abs() <= 1e-12 * r0 * js_max(v0, 1e-300) {
                        aps.insert(0, r0);
                    }
                    *cache.borrow_mut() = Some((turn.first().map(|&tt| tt - t0), if aps.len() >= 2 { Some((aps[0] - aps[1]).abs() / (aps[0] + aps[1])) } else { None }));
                }
                let (per, e_meas) = cache.borrow().expect("measured");
                Ok(Sample {
                    vars: vec![
                        ("G", var(gc, "N·m²/kg²", "G", t!("引力常量"))),
                        ("M", var(mc, "kg", "M", t!("{0}质量", sname.clone()))),
                        ("m", var(mass, "kg", "m", t!("{0}质量", bname.clone()))),
                        ("r", var(dist, "m", "r", t!("到中心的距离（仿真）"))),
                        ("r0", var(r0, "m", "r_0", t!("初始距离"))),
                        ("v0", var(v0, "m/s", "v_0", t!("初速度大小"))),
                        ("a", var(a, "m", "a", t!("轨道半长轴（由初始条件）"))),
                        ("L", var(mass * h.abs(), "kg·m²/s", "L", t!("对中心的角动量（由初始条件）"))),
                    ],
                    measures: vec![
                        ("F", meas(Some(gc * mc * mass / (dist * dist)), "N", t!("受到的引力大小"))),
                        ("v", meas(Some(speed), "m/s", t!("速率"))),
                        ("T", meas_note(per, "s", t!("公转周期"), if per.is_none() { Some(t!("记录时长不足一周")) } else { None })),
                        ("E", meas(Some(0.5 * mass * speed * speed - gc * mc * mass / dist), "J", t!("机械能 ½mv² − GMm/r"))),
                        ("areal", meas(Some((qx * st.vy - qy * st.vx).abs() / 2.0), "m²/s", t!("掠面速度 |r × v|/2"))),
                        ("ecc", meas_note(e_meas, "", t!("偏心率（由近、远点距离）"), if e_meas.is_none() { Some(t!("记录内没有经过近点和远点")) } else { None })),
                    ],
                    conditions: vec![
                        cond("bound", t!("束缚轨道（机械能为负）"), bound, Text::empty()),
                        cond("circular", t!("圆轨道（v₀ = √(GM/r₀)，速度垂直于半径）"), circular, Text::empty()),
                        cond("elliptic", t!("椭圆轨道（偏心率明显大于零）"), bound && ecc > 1e-3, Text::Lit(format!("e = {}", js_to_precision(ecc, 4)))),
                    ],
                })
            }),
        });
    }
    Ok(())
}

// ---- Fall with air drag ----
fn drag_situations(r: &mut Rec, out: &mut Vec<Situation>) -> SimResult<()> {
    let sys = r.sys.clone();
    let model = &sys.model;
    let (g, vertical) = gravity(model);
    if !vertical || g <= 0.0 {
        return Ok(());
    }
    for &bg in &model.dynamic {
        let b = &model.bodies[bg];
        if !has_drag(b) || attracted(model, b) {
            continue;
        }
        let at = attached(model, &b.id);
        if at.ropes.len() + at.rods.len() + at.springs.len() + at.hinges.len() + at.forces.len() != 0 || at.extra != 1 {
            continue;
        }
        let list = runs(r, &mut |seg| if touching_units(&sys, &seg.mode, &b.id).is_empty() { Some(format!("drag:{}", b.id)) } else { None });
        for run in list {
            let s0 = body_vel(&sys, &r.seg(run.segs[0]).x0, b);
            if s0.vx != 0.0 || s0.vy > 0.0 {
                continue;
            }
            let (bl, cq, m) = (b.drag_lin, b.drag_quad, b.mass);
            let vt = if cq > 0.0 { (-bl + (bl * bl + 4.0 * cq * m * g).sqrt()) / (2.0 * cq) } else { m * g / bl };
            let view = r.v;
            let (t0, t1) = (run.t0, run.t1);
            out.push(Situation {
                key: format!("drag:{}:{}", b.id, js_num(t0)),
                ty: "drag",
                title: t!("{0} 在空气阻力下下落", b.name.clone()),
                t0,
                t1,
                t_event: None,
                bodies: vec![b.id.clone()],
                sample: Rc::new(move |s, t| {
                    let mut r = Rec::new(s, view);
                    let sys = r.sys.clone();
                    let st = body_vel(&sys, &r.exact(t)?, &sys.model.bodies[bg]);
                    let v = -st.vy;
                    let near = (v - vt).abs() / vt;
                    let terminal = Condition {
                        id: "nearTerminal".into(),
                        label: t!("已接近终端速度"),
                        status: if near <= 1e-3 {
                            CondStatus::Ok
                        } else if near <= 3e-2 {
                            CondStatus::Approx
                        } else {
                            CondStatus::Fail
                        },
                        detail: t!("与终端速度相差 {0}%", js_to_precision(near * 100.0, 3)),
                    };
                    Ok(Sample {
                        vars: vec![
                            ("m", var(m, "kg", "m", t!("质量"))),
                            ("g", var(g, "m/s²", "g", t!("重力加速度"))),
                            ("b", var(bl, "N·s/m", "b", t!("线性阻力系数"))),
                            ("c", var(cq, "N·s²/m²", "c", t!("平方阻力系数"))),
                            ("t", var(t - t0, "s", "t", t!("下落时间"))),
                            ("v", var(v, "m/s", "v", t!("下落速度（仿真）"))),
                        ],
                        measures: vec![("speed", meas(Some(v), "m/s", t!("下落速度"))), ("F", meas(Some((bl + cq * v.abs()) * v.abs()), "N", t!("空气阻力大小")))],
                        conditions: vec![
                            cond("linearDrag", t!("只有线性阻力（c = 0）"), cq == 0.0 && bl > 0.0, Text::empty()),
                            cond("quadDrag", t!("只有平方阻力（b = 0）"), bl == 0.0 && cq > 0.0, Text::empty()),
                            cond("fromRest", t!("由静止开始下落"), s0.vy == 0.0, Text::empty()),
                            terminal,
                        ],
                    })
                }),
            });
        }
    }
    Ok(())
}

// ---- Damped oscillation ----
fn damped_situations(r: &mut Rec, out: &mut Vec<Situation>) -> SimResult<()> {
    let sys = r.sys.clone();
    let model = &sys.model;
    let n = sys.n;
    let gv = model.settings.gravity;
    for &bg in &model.dynamic {
        let b = &model.bodies[bg];
        if has_drag(b) || attracted(model, b) {
            continue;
        }
        let at = attached(model, &b.id);
        if at.springs.len() != 1 || at.ropes.len() + at.rods.len() + at.hinges.len() + at.forces.len() + at.extra > 0 {
            continue;
        }
        let sp = &model.springs[at.springs[0]];
        if !(sp.damping > 0.0) || sp.damping * sp.damping >= 4.0 * sp.stiffness * b.mass {
            continue;
        }
        let mine_a = on_body(model, &sp.a, &b.id);
        let (mine, fixed) = if mine_a { (&sp.a, &sp.b) } else { (&sp.b, &sp.a) };
        let Some(pp) = anchor_world(model, fixed) else { continue };
        let list = runs(r, &mut |seg| {
            let us = closed_units(&sys, &seg.mode, &b.id);
            if us.iter().any(|u| u.friction != Friction::None || model.bodies[other_body(&sys, u, &b.id)].dynamic) {
                return None;
            }
            Some(format!("damped:{}", b.id))
        });
        let bi = b.index as usize;
        let ml = mine.local;
        for run in list {
            let x0 = r.seg(run.segs[0]).x0.clone();
            let pa = compute_poses(model, &x0)[b.global];
            let ax = pa.x + pa.c * ml.x - pa.s * ml.y;
            let ay = pa.y + pa.s * ml.x + pa.c * ml.y;
            let len = (sq(ax - pp.0) + sq(ay - pp.1)).sqrt();
            let (ux, uy) = ((ax - pp.0) / len, (ay - pp.1) / len);
            let supported = !closed_units(&sys, &r.seg(run.segs[0]).mode, &b.id).is_empty();
            let g_along = gv.x * ux + gv.y * uy;
            let ext_eq = if supported { 0.0 } else { b.mass * g_along / sp.stiffness };
            let (vx, vy) = (x0[3 * n + 3 * bi], x0[3 * n + 3 * bi + 1]);
            let one_dim = (-vx * uy + vy * ux).abs() < 1e-12 && x0[3 * n + 3 * bi + 2].abs() < 1e-12 && if supported { g_along.abs() < 1e-12 } else { (gv.x * uy - gv.y * ux).abs() < 1e-12 };
            if !one_dim {
                continue;
            }
            let rest = sp.rest_length;
            let cache: Lazy<(Option<f64>, Option<f64>)> = lazy();
            let view = r.v;
            let (t0, t1) = (run.t0, run.t1);
            let (k, mass, c) = (sp.stiffness, b.mass, sp.damping);
            out.push(Situation {
                key: format!("damped:{}:{}", b.id, js_num(t0)),
                ty: "damped",
                title: t!("{0} 的阻尼振动", b.name.clone()),
                t0,
                t1,
                t_event: None,
                bodies: vec![b.id.clone()],
                sample: Rc::new(move |s, _t| {
                    if cache.borrow().is_none() {
                        let mut r = Rec::new(s, view);
                        let sys = r.sys.clone();
                        let disp = |x: &[f64]| {
                            let ps = &compute_poses(&sys.model, x)[bg];
                            let qx = ps.x + ps.c * ml.x - ps.s * ml.y;
                            let qy = ps.y + ps.s * ml.x + ps.c * ml.y;
                            (sq(qx - pp.0) + sq(qy - pp.1)).sqrt() - rest - ext_eq
                        };
                        let zeros = crossings(&mut r, &mut |_, x, _| Ok(disp(x)), t0, t1, 1, 2)?;
                        // Maxima of the extension: the velocity along the spring falls through zero
                        let tm = crossings(&mut r, &mut |_, x, _| Ok(x[3 * n + 3 * bi] * ux + x[3 * n + 3 * bi + 1] * uy), t0, t1, -1, 2)?;
                        let mut maxima = Vec::new();
                        for t in tm {
                            maxima.push(disp(&r.exact(t)?));
                        }
                        *cache.borrow_mut() = Some((if zeros.len() >= 2 { Some(zeros[1] - zeros[0]) } else { None }, if maxima.len() >= 2 { Some(maxima[1] / maxima[0]) } else { None }));
                    }
                    let (per, ratio) = cache.borrow().expect("measured");
                    Ok(Sample {
                        vars: vec![("k", var(k, "N/m", "k", t!("劲度系数"))), ("m", var(mass, "kg", "m", t!("振子质量"))), ("c", var(c, "N·s/m", "c", t!("阻尼系数")))],
                        measures: vec![
                            ("Td", meas_note(per, "s", t!("周期（相邻两次同向过平衡位置）"), if per.is_none() { Some(t!("记录时长不足一个完整周期")) } else { None })),
                            ("ratio", meas_note(ratio, "", t!("相邻两次最大位移之比"), if ratio.is_none() { Some(t!("记录内不足两次最大位移")) } else { None })),
                        ],
                        conditions: vec![cond("underdamped", t!("欠阻尼（c² < 4km）"), true, Text::empty())],
                    })
                }),
            });
        }
    }
    Ok(())
}

// ---- A disc turned by a torque motor ----
fn spin_situations(r: &mut Rec, out: &mut Vec<Situation>) -> SimResult<()> {
    let sys = r.sys.clone();
    let model = &sys.model;
    for &bg in &model.dynamic {
        let b = &model.bodies[bg];
        if b.inv_inertia == 0.0 || has_drag(b) || attracted(model, b) {
            continue;
        }
        let at = attached(model, &b.id);
        let at2 = attached2651(model, &b.id);
        if at.ropes.len() + at.rods.len() + at.springs.len() + at.hinges.len() + at.forces.len() != 0 {
            continue;
        }
        if at2.motors.len() != 1 || at2.welds.len() + at2.sliders.len() + at2.gears.len() + at2.dampers.len() != 0 {
            continue;
        }
        let mo = &model.motors[at2.motors[0]];
        if !mo.torque_mode {
            continue;
        }
        let mine_b = on_body(model, &mo.b, &b.id);
        let (mine, other) = if mine_b { (&mo.b, &mo.a) } else { (&mo.a, &mo.b) };
        if anchor_world(model, other).is_none() || !is_zero_local(mine.local) {
            continue;
        }
        let mt = if mine_b { mo.torque } else { -mo.torque };
        let list = runs(r, &mut |seg| if touching_units(&sys, &seg.mode, &b.id).is_empty() { Some(format!("spin:{}", b.id)) } else { None });
        let bi = b.index as usize;
        for run in list {
            let s0 = body_vel(&sys, &r.seg(run.segs[0]).x0, b);
            let view = r.v;
            let (t0, t1) = (run.t0, run.t1);
            let inertia = b.inertia;
            out.push(Situation {
                key: format!("spin:{}:{}", b.id, js_num(t0)),
                ty: "spin",
                title: t!("{0} 在恒定力矩下转动", b.name.clone()),
                t0,
                t1,
                t_event: None,
                bodies: vec![b.id.clone()],
                sample: Rc::new(move |s, t| {
                    let mut r = Rec::new(s, view);
                    let sys = r.sys.clone();
                    let o = r.observe(t)?;
                    let st = body_vel(&sys, &o.x, &sys.model.bodies[bg]);
                    Ok(Sample {
                        vars: vec![
                            ("M", var(mt, "N·m", "M", t!("马达力矩"))),
                            ("I", var(inertia, "kg·m²", "I", t!("对转轴的转动惯量"))),
                            ("omega0", var(s0.w, "rad/s", "\\omega_0", t!("初角速度"))),
                            ("t", var(t - t0, "s", "t", t!("经过的时间"))),
                            ("theta", var(st.th - s0.th, "rad", "\\theta", t!("转过的角度（仿真）"))),
                        ],
                        measures: vec![
                            ("beta", meas(Some(o.sol.acc[3 * bi + 2]), "rad/s²", t!("角加速度"))),
                            ("omega", meas(Some(st.w), "rad/s", t!("角速度"))),
                            ("theta", meas(Some(st.th - s0.th), "rad", t!("转过的角度"))),
                            ("dEk", meas(Some(0.5 * inertia * (st.w * st.w - s0.w * s0.w)), "J", t!("转动动能的增加量"))),
                        ],
                        conditions: vec![cond("fixedAxis", t!("绕过质心的固定轴转动"), true, Text::empty())],
                    })
                }),
            });
        }
    }
    Ok(())
}

// ---- Meshing gears ----
fn gear_situations(r: &mut Rec, out: &mut Vec<Situation>) -> SimResult<()> {
    let sys = r.sys.clone();
    let model = &sys.model;
    let n = sys.n;
    'gears: for (gi, gr) in model.gears.iter().enumerate() {
        let (Some(ag), Some(bg)) = (gr.a, gr.b) else { continue };
        let (ab, bb) = (&model.bodies[ag], &model.bodies[bg]);
        let mut drive_m = 0.0;
        let mut driven = false;
        for x in [ab, bb] {
            let at = attached(model, &x.id);
            let at2 = attached2651(model, &x.id);
            if at.ropes.len() + at.rods.len() + at.springs.len() + at.forces.len() != 0 || has_drag(x) || attracted(model, x) {
                continue 'gears;
            }
            if at2.gears.len() != 1 || at2.welds.len() + at2.sliders.len() + at2.dampers.len() != 0 {
                continue 'gears;
            }
            let pins: Vec<(&AnchorModel, &AnchorModel)> = at.hinges.iter().map(|&i| (&model.hinges[i].a, &model.hinges[i].b)).chain(at2.motors.iter().map(|&i| (&model.motors[i].a, &model.motors[i].b))).collect();
            if pins.len() != 1 {
                continue 'gears;
            }
            let (pa, pb) = pins[0];
            let (mine, other) = if on_body(model, pa, &x.id) { (pa, pb) } else { (pb, pa) };
            if anchor_world(model, other).is_none() || !is_zero_local(mine.local) {
                continue 'gears;
            }
            if !at2.motors.is_empty() {
                let mo = &model.motors[at2.motors[0]];
                if !mo.torque_mode || !std::ptr::eq(x, ab) {
                    continue 'gears;
                }
                drive_m = if on_body(model, &mo.b, &x.id) { mo.torque } else { -mo.torque };
                driven = true;
            }
        }
        let radius = |x: &BodyModel| match x.shape {
            ShapeModel::Circle { radius } => radius,
            _ => f64::NAN,
        };
        let discs = matches!(ab.shape, ShapeModel::Circle { .. }) && matches!(bb.shape, ShapeModel::Circle { .. }) && (gr.ratio - radius(bb) / radius(ab)).abs() <= 1e-12 * gr.ratio.abs();
        let list = runs(r, &mut |seg| {
            if touching_units(&sys, &seg.mode, &ab.id).len() + touching_units(&sys, &seg.mode, &bb.id).len() == 0 {
                Some(format!("gear:{}", gi))
            } else {
                None
            }
        });
        let (ai, bi) = (ab.index as usize, bb.index as usize);
        let (ra, rb) = (radius(ab), radius(bb));
        for run in list {
            let view = r.v;
            let (t0, t1) = (run.t0, run.t1);
            let ratio = gr.ratio;
            let (ia, ib) = (ab.inertia, bb.inertia);
            let (an, bn) = (ab.name.clone(), bb.name.clone());
            out.push(Situation {
                key: format!("gear:{}:{}", gr.id, js_num(t0)),
                ty: "gear",
                title: t!("{0} 与 {1} 齿轮传动", an.clone(), bn.clone()),
                t0,
                t1,
                t_event: None,
                bodies: vec![ab.id.clone(), bb.id.clone()],
                sample: Rc::new(move |s, t| {
                    let mut r = Rec::new(s, view);
                    let o = r.observe(t)?;
                    let (wa, wb) = (o.x[3 * n + 3 * ai + 2], o.x[3 * n + 3 * bi + 2]);
                    Ok(Sample {
                        vars: vec![
                            ("r", var(ratio, "", "r", t!("传动比 r_B / r_A"))),
                            ("omegaA", var(wa, "rad/s", "\\omega_A", t!("{0}的角速度（仿真）", an.clone()))),
                            ("rA", var(ra, "m", "r_A", t!("{0}的半径", an.clone()))),
                            ("IA", var(ia, "kg·m²", "I_A", t!("{0}的转动惯量", an.clone()))),
                            ("IB", var(ib, "kg·m²", "I_B", t!("{0}的转动惯量", bn.clone()))),
                            ("M", var(drive_m, "N·m", "M", t!("驱动力矩"))),
                        ],
                        measures: vec![
                            ("omegaB", meas(Some(wb), "rad/s", t!("{0}的角速度", bn.clone()))),
                            ("vB", meas(Some(wb.abs() * rb), "m/s", t!("{0}边缘的线速度", bn.clone()))),
                            ("betaA", meas(Some(o.sol.acc[3 * ai + 2]), "rad/s²", t!("{0}的角加速度", an.clone()))),
                        ],
                        conditions: vec![cond("discs", t!("两轮都是圆盘，传动比等于半径比"), discs, Text::empty()), cond("driven", t!("主动轮受恒定力矩驱动"), driven, Text::empty())],
                    })
                }),
            });
        }
    }
    Ok(())
}
