//! Situation recognizers of 26.48–26.50 (port of src/formula/situations.ts): surfaces and inclines, rolling, the
//! board–block model, collisions, projectiles, pendulums, springs, rotation about a hinge, pulleys, vertical
//! circles, movable pulleys, movable wedges, spring pairs, rolling with slipping, variable forces, and the
//! whole-run energy ledger and momentum. The 26.51 recognizers are in situations2651.rs.

use std::cell::RefCell;
use std::rc::Rc;

use super::*;
use crate::dmath::{acos, atan2, cos, sin, tan, DEG, PI_VALUE};
use crate::dynamics::{Friction, AUX_BELT, AUX_WORK};
use crate::expr::{parse, BinOp, Node, ENV_SIZE};
use crate::js::{js_max, js_min, js_num, js_round, js_to_precision};
use crate::kinematics::{distance_kin, rope_path_into};
use crate::message::Text;
use crate::model::ShapeModel;
use crate::numeric::integrate;
use crate::session::ledger_at;
use crate::t;

/// Everything `recognize` lists for a view: the motion phases, then the whole-run situations.
pub fn recognize(s: &mut Session, v: View) -> SimResult<Vec<Situation>> {
    let mut out = recognize_phases(s, v)?;
    out.extend(recognize_conservation(s, v)?);
    Ok(out)
}

/// The whole-run situations (energy ledger, momentum of a free system).
pub fn recognize_conservation(s: &mut Session, v: View) -> SimResult<Vec<Situation>> {
    let mut out = Vec::new();
    conservation_situations(&mut Rec::new(s, v), &mut out)?;
    Ok(out)
}

/// The situations of the motion phases, in order.
pub fn recognize_phases(s: &mut Session, v: View) -> SimResult<Vec<Situation>> {
    let mut out = Vec::new();
    let mut r = Rec::new(s, v);
    surface_situations(&mut r, &mut out)?;
    board_block_situations(&mut r, &mut out)?;
    impact_situations(&mut r, &mut out)?;
    projectile_situations(&mut r, &mut out)?;
    pendulum_situations(&mut r, &mut out)?;
    spring_situations(&mut r, &mut out)?;
    rotation_situations(&mut r, &mut out)?;
    pulley_situations(&mut r, &mut out)?;
    vertical_circle_situations(&mut r, &mut out)?;
    movable_pulley_situations(&mut r, &mut out)?;
    wedge_situations(&mut r, &mut out)?;
    spring_pair_situations(&mut r, &mut out)?;
    roll_slip_situations(&mut r, &mut out)?;
    variable_force_situations(&mut r, &mut out)?;
    super::situations2651::situations2651(&mut r, &mut out)?;
    // 26.54 (D78): charges in fields; formulas that assume only mechanical forces are dropped for charged bodies
    super::situations2654::situations2654(&mut r, &mut out)?;
    super::situations2654::filter_electric(&r.sys.model, &mut out);
    // 26.55 (D90–D92): regions, liquids and rail loops; formulas of other situations are dropped for their bodies
    super::situations2655::situations2655(&mut r, &mut out)?;
    super::situations2655::filter_regions(&r.sys.model, &mut out);
    Ok(out)
}

/// Lazily computed value shared by the samples of one situation.
pub type Lazy<T> = Rc<RefCell<Option<T>>>;

pub fn lazy<T>() -> Lazy<T> {
    Rc::new(RefCell::new(None))
}

// ---- Surfaces, inclines, rolling ----
fn surface_situations(r: &mut Rec, out: &mut Vec<Situation>) -> SimResult<()> {
    let sys = r.sys.clone();
    let model = &sys.model;
    let (g, vertical) = gravity(model);
    if !vertical {
        return Ok(());
    }
    let n = sys.n;
    for &bg in &model.dynamic {
        let b = &model.bodies[bg];
        if !attached(model, &b.id).none() {
            continue;
        }
        let rolling = matches!(b.shape, ShapeModel::Circle { .. }) && b.inv_inertia > 0.0;
        let list = runs(r, &mut |seg| {
            let us = closed_units(&sys, &seg.mode, &b.id);
            if us.len() != 1 || touching_units(&sys, &seg.mode, &b.id).len() != 1 {
                return None;
            }
            let u = us[0];
            let other = &model.bodies[other_body(&sys, u, &b.id)];
            if other.dynamic {
                return None;
            }
            let geo = unit_geometry(&sys, &seg.x0, u, &b.id);
            if geo.ny <= 1e-9 {
                return None;
            }
            // 26.52 (D59): the rolling formulas assume no rolling resistance
            if rolling && sys.pairs[u.pair].material.rolling > 0.0 {
                return None;
            }
            // Translation only: a polygon rests on a face (two points) and does not turn
            let is_polygon = matches!(b.shape, ShapeModel::Polygon { .. });
            if !rolling && (seg.x0[3 * n + 3 * b.index as usize + 2].abs() > 1e-9 || (is_polygon && u.points.len() != 2 && b.inv_inertia > 0.0)) {
                return None;
            }
            let mut status = friction_name(u.friction);
            if u.friction == Friction::Slide {
                status = if slide_direction(u, geo.ref_sign, &geo.k, geo.dx, geo.dy) > 0.0 { "down" } else { "up" };
            }
            if u.friction == Friction::None {
                status = "smooth";
            }
            // The face is part of the signature: a concave body offers several faces to one pair (26.52, D35)
            Some(format!("{}:{}:{}:{}", if rolling { "roll" } else { "surf" }, other.id, status, js_num(js_round(atan2(geo.ny, geo.nx) * 1e6))))
        });
        for run in list {
            let seg0 = r.seg(run.segs[0]).clone();
            let u = closed_units(&sys, &seg0.mode, &b.id)[0].clone();
            let og = other_body(&sys, &u, &b.id);
            let other = &model.bodies[og];
            let geo = unit_geometry(&sys, &seg0.x0, &u, &b.id);
            let status = run.sig.split(':').nth(2).unwrap_or("").to_string();
            let mat = sys.pairs[u.pair].material;
            let flat = geo.theta < 1e-9;
            let x0 = seg0.x0.clone();
            let s0 = body_vel(&sys, &x0, b);
            let v0 = s0.vx * geo.dx + s0.vy * geo.dy;
            let pair_key_u = sys.pairs[u.pair].key.clone();
            let ends_at_rest = r.event_at(run.t1).is_some_and(|e| {
                e.changes.iter().any(|c| c.subject == pair_key_u && matches!(c.kind(), crate::simulation::ChangeType::Stick | crate::simulation::ChangeType::Reverse))
            });
            let theta = geo.theta;
            let view = r.v;
            let (t0, t1) = (run.t0, run.t1);
            let (bid, oid) = (b.id.clone(), other.id.clone());
            if rolling {
                let inertia = b.inertia;
                let rr = match b.shape {
                    ShapeModel::Circle { radius } => radius,
                    _ => f64::NAN,
                };
                let mass = b.mass;
                let stick = status == "stick";
                let down = status == "down";
                let (dx, dy) = (geo.dx, geo.dy);
                let bidx = b.index as usize;
                let (bid2, oid2) = (bid.clone(), oid.clone());
                out.push(Situation {
                    key: format!("rolling:{}:{}", bid, js_num(t0)),
                    ty: "rolling",
                    title: t!("{0} 在{1}上{2}", b.name.clone(), other.name.clone(), if stick { t!("纯滚动") } else { t!("边滚边滑") }),
                    t0,
                    t1,
                    t_event: None,
                    bodies: vec![bid.clone(), oid.clone()],
                    sample: Rc::new(move |s, t| {
                        let mut r = Rec::new(s, view);
                        let sys = r.sys.clone();
                        let o = r.observe(t)?;
                        let st = body_vel(&sys, &o.x, &sys.model.bodies[bg]);
                        let a = o.sol.acc[3 * bidx] * dx + o.sol.acc[3 * bidx + 1] * dy;
                        let c = o.contact_forces(&sys, &bid2, &oid2);
                        Ok(Sample {
                            vars: vec![
                                ("m", var(mass, "kg", "m", t!("质量"))),
                                ("r", var(rr, "m", "r", t!("半径"))),
                                ("I", var(inertia, "kg·m²", "I", t!("对质心的转动惯量"))),
                                ("g", var(g, "m/s²", "g", t!("重力加速度"))),
                                ("theta", var(theta, "rad", "\\theta", t!("倾角"))),
                                ("muK", var(mat.mu_k, "", "\\mu_k", t!("动摩擦因数"))),
                                ("muS", var(mat.mu_s, "", "\\mu_s", t!("静摩擦因数"))),
                                ("omegaSim", var(st.w.abs(), "rad/s", "\\omega", t!("角速度（仿真）"))),
                            ],
                            measures: vec![
                                ("a", meas(Some(a), "m/s²", t!("沿斜面向下的加速度"))),
                                ("f", meas(Some(c.f), "N", t!("摩擦力"))),
                                ("v", meas(Some((st.vx * st.vx + st.vy * st.vy).sqrt()), "m/s", t!("质心速率"))),
                                ("beta", meas(Some(o.sol.acc[3 * bidx + 2].abs()), "rad/s²", t!("角加速度大小"))),
                            ],
                            conditions: vec![
                                cond(
                                    "pureRolling",
                                    t!("纯滚动（接触点无相对滑动）"),
                                    stick,
                                    if stick {
                                        t!("需 μs ≥ tanθ/(1 + mr²/I) = {0}，本例 μs = {1}", js_to_precision(tan(theta) / (1.0 + mass * rr * rr / inertia), 4), mat.mu_s)
                                    } else {
                                        t!("接触点有相对滑动")
                                    },
                                ),
                                cond("slipping", t!("边滚边滑（向下滑动）"), down, unless(down, t!("没有向下的相对滑动"))),
                            ],
                        })
                    }),
                });
                continue;
            }
            let ty: &'static str = if flat { "flat" } else { "incline" };
            let tag = match status.as_str() {
                "stick" => t!("相对静止"),
                "up" => t!("相对上滑"),
                "smooth" => t!("光滑滑动"),
                _ => t!("相对下滑"),
            };
            let title = if flat {
                t!("{0} 在{1}上{2}", b.name.clone(), other.name.clone(), if status == "stick" { t!("相对静止") } else { t!("滑动") })
            } else {
                t!("{0} 在{1}上（{2}）", b.name.clone(), other.name.clone(), tag)
            };
            // Theoretical acceleration along downhill for v = v0 + at
            let a_th = if flat {
                if status == "stick" {
                    0.0
                } else {
                    -sign_or1(v0 - geo.u) * mat.mu_k * g
                }
            } else if status == "up" {
                g * (sin(theta) + mat.mu_k * cos(theta))
            } else if status == "stick" {
                0.0
            } else {
                g * (sin(theta) - mat.mu_k * cos(theta))
            };
            let aux_start = pair_aux(&sys, &x0, &bid, &oid);
            let belt_start = x0[sys.aux_base + AUX_BELT];
            let end = if ends_at_rest { Some(r.exact(t1)?) } else { None };
            let bidx = b.index as usize;
            let mass = b.mass;
            let geo2 = geo.clone();
            let (bid2, oid2) = (bid.clone(), oid.clone());
            out.push(Situation {
                key: format!("{}:{}:{}", ty, bid, js_num(t0)),
                ty,
                title,
                t0,
                t1,
                t_event: None,
                bodies: vec![bid.clone(), oid.clone()],
                sample: Rc::new(move |s, t| {
                    let mut r = Rec::new(s, view);
                    let sys = r.sys.clone();
                    let o = r.observe(t)?;
                    let st = body_vel(&sys, &o.x, &sys.model.bodies[bg]);
                    let (ax, ay) = (o.sol.acc[3 * bidx], o.sol.acc[3 * bidx + 1]);
                    let c = o.contact_forces(&sys, &bid2, &oid2);
                    let mut vars = vec![
                        ("m", var(mass, "kg", "m", t!("质量"))),
                        ("g", var(g, "m/s²", "g", t!("重力加速度"))),
                        ("muK", var(mat.mu_k, "", "\\mu_k", t!("动摩擦因数"))),
                        ("muS", var(mat.mu_s, "", "\\mu_s", t!("静摩擦因数"))),
                        ("v0", var(v0, "m/s", "v_0", t!("本阶段初速度"))),
                        ("u", var(geo2.u, "m/s", "u", t!("接触面速度"))),
                        ("t", var(t - t0, "s", "t", t!("本阶段经过时间"))),
                        ("a", var(a_th, "m/s²", "a", t!("理论加速度"))),
                    ];
                    if !flat {
                        vars.push(("theta", var(theta, "rad", "\\theta", t!("倾角"))));
                    }
                    let along = if flat { ax.abs() } else { ax * geo2.dx + ay * geo2.dy };
                    let v = st.vx * geo2.dx + st.vy * geo2.dy;
                    let sdist = (st.x - s0.x) * geo2.dx + (st.y - s0.y) * geo2.dy;
                    let endv = end.as_ref().map(|e| body_vel(&sys, e, &sys.model.bodies[bg]));
                    let end_aux = end.as_ref().map(|e| pair_aux(&sys, e, &bid2, &oid2));
                    let measures = vec![
                        ("a", meas(Some(ax * geo2.dx + ay * geo2.dy), "m/s²", t!("沿斜面向下的加速度"))),
                        ("aMag", meas(Some(along), "m/s²", t!("加速度大小"))),
                        ("N", meas(Some(c.n), "N", t!("支持力"))),
                        ("f", meas(Some(c.f), "N", t!("摩擦力大小"))),
                        ("v", meas(Some(v), "m/s", t!("速度"))),
                        ("s", meas(Some(sdist), "m", t!("位移"))),
                        ("tEnd", meas(if ends_at_rest { Some(t1 - t0) } else { None }, "s", t!("相对滑动结束时刻（自本阶段开始）"))),
                        ("xEnd", meas(endv.map(|e| ((e.x - s0.x) * geo2.dx + (e.y - s0.y) * geo2.dy).abs()), "m", t!("滑动阶段位移"))),
                        ("slideEnd", meas(end_aux.map(|a| a.0 - aux_start.0), "m", t!("相对滑动距离"))),
                        ("heatEnd", meas(end_aux.map(|a| a.1 - aux_start.1), "J", t!("摩擦生热"))),
                        ("beltEnd", meas(end.as_ref().map(|e| e[sys.aux_base + AUX_BELT] - belt_start), "J", t!("电机做功"))),
                    ];
                    let tan_t = tan(theta);
                    let st_s = status.as_str();
                    Ok(Sample {
                        vars,
                        measures,
                        conditions: vec![
                            cond("contact", t!("保持接触"), true, Text::empty()),
                            cond("sliding", t!("相对滑动"), st_s != "stick", if st_s == "stick" { t!("物体与接触面相对静止") } else { Text::empty() }),
                            cond("slideDown", t!("相对接触面向下滑动"), st_s == "down" || st_s == "smooth", Text::empty()),
                            cond("slideUp", t!("相对接触面向上滑动"), st_s == "up", Text::empty()),
                            cond("stick", t!("相对静止"), st_s == "stick", Text::empty()),
                            cond("staticHolds", t!("最大静摩擦足以维持静止（μs ≥ tanθ）"), mat.mu_s >= tan_t - 1e-12, Text::Lit(format!("tanθ = {}", js_to_precision(tan_t, 4)))),
                            cond("belt", t!("接触面为传送带"), geo2.belt != 0.0, Text::empty()),
                            cond("endsAtCommon", t!("本阶段以“共速/相对静止”结束"), ends_at_rest, unless(ends_at_rest, t!("记录内未达到共速"))),
                            cond("endsAtRest", t!("本阶段以相对静止结束"), ends_at_rest, unless(ends_at_rest, t!("记录内未停止相对滑动"))),
                            cond("onlyGravity", t!("只受重力、支持力和摩擦力"), true, Text::empty()),
                        ],
                    })
                }),
            });
        }
    }
    Ok(())
}

// ---- Board and block ----
fn board_block_situations(r: &mut Rec, out: &mut Vec<Situation>) -> SimResult<()> {
    let sys = r.sys.clone();
    let model = &sys.model;
    let (g, vertical) = gravity(model);
    if !vertical {
        return Ok(());
    }
    for &bgi in &model.dynamic {
        for &agi in &model.dynamic {
            if agi == bgi {
                continue;
            }
            let (a_b, b_b) = (&model.bodies[agi], &model.bodies[bgi]);
            if !attached(model, &a_b.id).none() || !attached(model, &b_b.id).none() {
                continue;
            }
            let list = runs(r, &mut |seg| {
                let ua = closed_units(&sys, &seg.mode, &a_b.id);
                let ub = closed_units(&sys, &seg.mode, &b_b.id);
                if ua.len() != 1 || other_body(&sys, ua[0], &a_b.id) != bgi || ub.len() != 2 {
                    return None;
                }
                let ground = *ub.iter().find(|u| !std::ptr::eq(**u, ua[0]))?;
                let sg = other_body(&sys, ground, &b_b.id);
                if model.bodies[sg].dynamic {
                    return None;
                }
                let g_ab = unit_geometry(&sys, &seg.x0, ua[0], &a_b.id);
                let g_bs = unit_geometry(&sys, &seg.x0, ground, &b_b.id);
                if g_ab.theta > 1e-9 || g_bs.theta > 1e-9 || g_bs.belt != 0.0 {
                    return None;
                }
                Some(format!("bb:{}:{}:{}", model.bodies[sg].id, friction_name(ua[0].friction), friction_name(ground.friction)))
            });
            for run in list {
                let seg0 = r.seg(run.segs[0]).clone();
                let ua = closed_units(&sys, &seg0.mode, &a_b.id)[0].clone();
                let ground = closed_units(&sys, &seg0.mode, &b_b.id).into_iter().find(|u| **u != ua).cloned();
                let Some(ground) = ground else { continue };
                let sgi = other_body(&sys, &ground, &b_b.id);
                let s_b = &model.bodies[sgi];
                let mu1 = sys.pairs[ua.pair].material.mu_k;
                let mu2 = sys.pairs[ground.pair].material.mu_k;
                let sa = body_vel(&sys, &seg0.x0, a_b);
                let sb = body_vel(&sys, &seg0.x0, b_b);
                let sigma = sign_or1(sa.vx - sb.vx);
                let (v1, v2) = (sa.vx * sigma, sb.vx * sigma);
                let board_moves = ground.friction == Friction::Slide;
                let a2 = if board_moves { (mu1 * a_b.mass * g - mu2 * (a_b.mass + b_b.mass) * g) / b_b.mass } else { 0.0 };
                let ua_key = sys.pairs[ua.pair].key.clone();
                let ends_at_common = r.event_at(run.t1).is_some_and(|e| e.changes.iter().any(|c| c.subject == ua_key && c.kind() == crate::simulation::ChangeType::Stick));
                let end = if ends_at_common { Some(r.exact(run.t1)?) } else { None };
                let aux0 = pair_aux(&sys, &seg0.x0, &a_b.id, &b_b.id);
                let view = r.v;
                let (t0, t1) = (run.t0, run.t1);
                let (an, bn, sn) = (a_b.name.clone(), b_b.name.clone(), s_b.name.clone());
                let (aid, bid) = (a_b.id.clone(), b_b.id.clone());
                let (am, bm) = (a_b.mass, b_b.mass);
                let (ai, bi) = (a_b.index as usize, b_b.index as usize);
                if ua.friction == Friction::Slide {
                    let ground_stick = ground.friction == Friction::Stick;
                    out.push(Situation {
                        key: format!("bb:{}:{}:{}", aid, bid, js_num(t0)),
                        ty: "board-block",
                        title: t!("{0} 在{1}上滑动（板块模型）", an.clone(), bn.clone()),
                        t0,
                        t1,
                        t_event: None,
                        bodies: vec![aid.clone(), bid.clone(), s_b.id.clone()],
                        sample: Rc::new(move |s, t| {
                            let mut r = Rec::new(s, view);
                            let sys = r.sys.clone();
                            let o = r.observe(t)?;
                            let endv = end.as_ref().map(|e| body_vel(&sys, e, &sys.model.bodies[agi]).vx * sigma);
                            let end_aux = end.as_ref().map(|e| pair_aux(&sys, e, &aid, &bid));
                            Ok(Sample {
                                vars: vec![
                                    ("m", var(am, "kg", "m", t!("{0}质量", an.clone()))),
                                    ("M", var(bm, "kg", "M", t!("{0}质量", bn.clone()))),
                                    ("mu1", var(mu1, "", "\\mu_1", t!("{0}与{1}间动摩擦因数", an.clone(), bn.clone()))),
                                    ("mu2", var(mu2, "", "\\mu_2", t!("{0}与{1}间动摩擦因数", bn.clone(), sn.clone()))),
                                    ("g", var(g, "m/s²", "g", t!("重力加速度"))),
                                    ("v1", var(v1, "m/s", "v_1", t!("{0}初速度", an.clone()))),
                                    ("v2", var(v2, "m/s", "v_2", t!("{0}初速度", bn.clone()))),
                                    ("a2", var(a2, "m/s²", "a_2", t!("{0}理论加速度", bn.clone()))),
                                ],
                                measures: vec![
                                    ("a1", meas(Some(o.sol.acc[3 * ai].abs()), "m/s²", t!("{0}加速度大小", an.clone()))),
                                    ("a2", meas(Some(o.sol.acc[3 * bi] * sigma), "m/s²", t!("{0}加速度", bn.clone()))),
                                    ("tEnd", meas(if ends_at_common { Some(t1 - t0) } else { None }, "s", t!("共速时刻（自本阶段开始）"))),
                                    ("vEnd", meas(endv, "m/s", t!("共同速度"))),
                                    ("slideEnd", meas(end_aux.map(|a| a.0 - aux0.0), "m", t!("相对滑动距离"))),
                                    ("heatEnd", meas(end_aux.map(|a| a.1 - aux0.1), "J", t!("摩擦生热"))),
                                ],
                                conditions: vec![
                                    cond("boardMoves", t!("{0}相对{1}滑动", bn.clone(), sn.clone()), board_moves, unless(board_moves, t!("μ₁m ≤ μ₂(M+m)，{0}保持静止", bn.clone()))),
                                    cond("boardRests", t!("{0}相对{1}静止", bn.clone(), sn.clone()), ground_stick, Text::empty()),
                                    cond("endsAtCommon", t!("本阶段以共速结束"), ends_at_common, unless(ends_at_common, t!("记录内未达到共速"))),
                                ],
                            })
                        }),
                    });
                } else if ua.friction == Friction::Stick {
                    let ground_slide = ground.friction == Friction::Slide;
                    out.push(Situation {
                        key: format!("bt:{}:{}:{}", aid, bid, js_num(t0)),
                        ty: "board-together",
                        title: t!("{0}与{1}共速后一起运动", an.clone(), bn.clone()),
                        t0,
                        t1,
                        t_event: None,
                        bodies: vec![aid.clone(), bid.clone(), s_b.id.clone()],
                        sample: Rc::new(move |s, t| {
                            let mut r = Rec::new(s, view);
                            let sys = r.sys.clone();
                            let o = r.observe(t)?;
                            let c = o.contact_forces(&sys, &aid, &bid);
                            Ok(Sample {
                                vars: vec![
                                    ("m", var(am, "kg", "m", t!("{0}质量", an.clone()))),
                                    ("M", var(bm, "kg", "M", t!("{0}质量", bn.clone()))),
                                    ("mu1", var(mu1, "", "\\mu_1", t!("物块与木板间动摩擦因数"))),
                                    ("mu2", var(mu2, "", "\\mu_2", t!("木板与地面间动摩擦因数"))),
                                    ("g", var(g, "m/s²", "g", t!("重力加速度"))),
                                ],
                                measures: vec![
                                    ("aMag", meas(Some(o.sol.acc[3 * ai].abs()), "m/s²", t!("整体加速度大小"))),
                                    ("f", meas(Some(c.f), "N", t!("{0}受到的静摩擦力", an.clone()))),
                                ],
                                conditions: vec![
                                    cond("together", t!("物块与木板相对静止"), true, t!("需 μ₂ ≤ μ₁（本例 {0} ≤ {1}）", mu2, mu1)),
                                    cond("groundSliding", t!("{0}相对{1}滑动", bn.clone(), sn.clone()), ground_slide, unless(ground_slide, t!("整体已静止"))),
                                ],
                            })
                        }),
                    });
                }
            }
        }
    }
    Ok(())
}

fn lz_about(sys: &System, x: &[f64], px: f64, py: f64, ids: &[&str]) -> f64 {
    let n = sys.n;
    let mut l = 0.0;
    for &g in &sys.model.dynamic {
        let b = &sys.model.bodies[g];
        if !ids.contains(&b.id.as_str()) {
            continue;
        }
        let i = b.index as usize;
        let (rx, ry) = (x[3 * i] - px, x[3 * i + 1] - py);
        l += b.mass * (rx * x[3 * n + 3 * i + 1] - ry * x[3 * n + 3 * i]) + if b.inv_inertia > 0.0 { b.inertia * x[3 * n + 3 * i + 2] } else { 0.0 };
    }
    l
}

/// The pivot of hinge `hi` when one side is the world or a static body and the other a dynamic body.
pub fn hinge_pivot(sys: &System, hi: usize) -> Option<(f64, f64, usize)> {
    let model = &sys.model;
    let h = &model.hinges[hi];
    let is_world = |a: &crate::model::AnchorModel| a.body.is_none_or(|g| !model.bodies[g].dynamic);
    let (world, body_side) = if is_world(&h.a) {
        (&h.a, &h.b)
    } else if is_world(&h.b) {
        (&h.b, &h.a)
    } else {
        return None;
    };
    let bg = body_side.body?;
    if !model.bodies[bg].dynamic {
        return None;
    }
    let (x, y) = anchor_world(model, world)?;
    Some((x, y, bg))
}

fn ke_of(sys: &System, x: &[f64], bodies: &[usize]) -> f64 {
    let n = sys.n;
    let mut k = 0.0;
    for &g in bodies {
        let b = &sys.model.bodies[g];
        let i = b.index as usize;
        let (vx, vy, w) = (x[3 * n + 3 * i], x[3 * n + 3 * i + 1], x[3 * n + 3 * i + 2]);
        k += 0.5 * b.mass * (vx * vx + vy * vy) + if b.inv_inertia > 0.0 { 0.5 * b.inertia * w * w } else { 0.0 };
    }
    k
}

fn constant(sample: Sample) -> SampleFn {
    Rc::new(move |_s, _t| Ok(sample.clone()))
}

// ---- Collisions ----
fn impact_situations(r: &mut Rec, out: &mut Vec<Situation>) -> SimResult<()> {
    let sys = r.sys.clone();
    let model = &sys.model;
    let n = sys.n;
    let frame_end = (r.v.frame_count as f64 - 1.0) * r.dt();
    let events: Vec<SimEvent> = r.events().to_vec();
    for (ei, ev) in events.iter().enumerate() {
        let Some(imp) = &ev.impact else { continue };
        let pts: Vec<&crate::impact::ImpactPoint> = imp.points.iter().filter(|p| p.kind == crate::impact::ImpactKind::Contact && p.impulse > 1e-15).collect();
        if pts.len() != 1 {
            continue;
        }
        let p = pts[0];
        let (Some(pi), Some(fi)) = (p.pair, p.feature) else { continue };
        let pair = &sys.pairs[pi];
        let f = &pair.features[fi];
        let no_friction = !p.tangent_impulse.is_some_and(|ti| ti.abs() > 0.0);
        let friction_cond = cond(
            "frictionless",
            t!("碰撞时接触面无摩擦冲量（光滑或无相对滑动趋势）"),
            no_friction,
            if no_friction { Text::empty() } else { t!("摩擦冲量 {0} N·s", js_to_precision(p.tangent_impulse.unwrap_or(f64::NAN).abs(), 4)) },
        );
        let (pxid, pyid) = (&model.bodies[pair.x].id, &model.bodies[pair.y].id);
        let next = events[ei + 1..].iter().chain(std::iter::empty()).find(|e| e.t > ev.t + 1e-12 && e.changes.iter().any(|c| c.bodies.contains(pxid) || c.bodies.contains(pyid)));
        // events before ev cannot have e.t > ev.t + 1e-12 in time order, but keep the TypeScript search over all events
        let next = next.or_else(|| events[..ei].iter().find(|e| e.t > ev.t + 1e-12 && e.changes.iter().any(|c| c.bodies.contains(pxid) || c.bodies.contains(pyid))));
        let t1 = match next {
            Some(e) => e.t,
            None => frame_end,
        };
        let n_ab = (p.nx, p.ny); // From feature B to feature A
        let (xa, xb) = (f.a.body, f.b_body());
        let (ba, bb) = (&model.bodies[xa], &model.bodies[xb]);
        let before = ev.before.clone();
        let after = ev.after.clone();
        let vel = |x: &[f64], b: &BodyModel| (x[3 * n + 3 * b.index as usize], x[3 * n + 3 * b.index as usize + 1]);
        let central = |b: &BodyModel| {
            if b.inv_inertia == 0.0 {
                return true;
            }
            let (bx, by) = (before[3 * b.index as usize], before[3 * b.index as usize + 1]);
            ((p.cx - bx) * n_ab.1 - (p.cy - by) * n_ab.0).abs() < 1e-9
        };
        if ba.dynamic && bb.dynamic {
            let at_a = attached(model, &ba.id);
            let at_b = attached(model, &bb.id);
            let hinged_a = at_a.hinges.len() == 1 && Attached { hinges: vec![], ..at_a.clone() }.none();
            let hinged_b = at_b.hinges.len() == 1 && Attached { hinges: vec![], ..at_b.clone() }.none();
            if at_a.none() && at_b.none() && central(ba) && central(bb) {
                // Two free bodies: number them by scene order
                let (b1, b2) = if ba.global < bb.global { (ba, bb) } else { (bb, ba) };
                let n12 = if std::ptr::eq(b1, bb) { n_ab } else { (-n_ab.0, -n_ab.1) };
                let t12 = (-n12.1, n12.0);
                let (v1, v2, w1a, w2a) = (vel(&before, b1), vel(&before, b2), vel(&after, b1), vel(&after, b2));
                let u1 = v1.0 * n12.0 + v1.1 * n12.1;
                let u2 = v2.0 * n12.0 + v2.1 * n12.1;
                let w1 = v1.0 * t12.0 + v1.1 * t12.1;
                let w2 = v2.0 * t12.0 + v2.1 * t12.1;
                let pair_bodies = [b1.global, b2.global];
                let oblique = w1.abs() > 1e-9 || w2.abs() > 1e-9;
                let e = p.restitution;
                let ang = {
                    let a = (sq(w1a.0) + sq(w1a.1)).sqrt();
                    let b = (sq(w2a.0) + sq(w2a.1)).sqrt();
                    if a < 1e-12 || b < 1e-12 {
                        None
                    } else {
                        Some(acos(js_max(-1.0, js_min(1.0, (w1a.0 * w2a.0 + w1a.1 * w2a.1) / (a * b)))))
                    }
                };
                let eq_mass = (b1.mass - b2.mass).abs() <= 1e-12 * b1.mass;
                let sample = Sample {
                    vars: vec![
                        ("m1", var(b1.mass, "kg", "m_1", t!("{0}质量", b1.name.clone()))),
                        ("m2", var(b2.mass, "kg", "m_2", t!("{0}质量", b2.name.clone()))),
                        ("e", var(e, "", "e", t!("恢复系数"))),
                        ("u1", var(u1, "m/s", "u_1", t!("碰前{0}法向速度", b1.name.clone()))),
                        ("u2", var(u2, "m/s", "u_2", t!("碰前{0}法向速度", b2.name.clone()))),
                        ("w1", var(w1, "m/s", "v_{1t}", t!("碰前{0}切向速度", b1.name.clone()))),
                        ("p0x", var(b1.mass * v1.0 + b2.mass * v2.0, "kg·m/s", "p_x", t!("碰前总动量 x"))),
                        ("p0y", var(b1.mass * v1.1 + b2.mass * v2.1, "kg·m/s", "p_y", t!("碰前总动量 y"))),
                    ],
                    measures: vec![
                        ("v1", meas(Some(w1a.0 * n12.0 + w1a.1 * n12.1), "m/s", t!("碰后{0}法向速度", b1.name.clone()))),
                        ("v2", meas(Some(w2a.0 * n12.0 + w2a.1 * n12.1), "m/s", t!("碰后{0}法向速度", b2.name.clone()))),
                        ("px", meas(Some(b1.mass * w1a.0 + b2.mass * w2a.0), "kg·m/s", t!("碰后总动量 x"))),
                        ("py", meas(Some(b1.mass * w1a.1 + b2.mass * w2a.1), "kg·m/s", t!("碰后总动量 y"))),
                        ("dE", meas(Some(ke_of(&sys, &before, &pair_bodies) - ke_of(&sys, &after, &pair_bodies)), "J", t!("损失的动能"))),
                        ("w1after", meas(Some(w1a.0 * t12.0 + w1a.1 * t12.1), "m/s", t!("碰后{0}切向速度", b1.name.clone()))),
                        ("angle", meas(ang, "rad", t!("碰后两速度夹角"))),
                    ],
                    conditions: vec![
                        cond("isolated", t!("碰撞瞬间系统不受外界冲量"), true, Text::empty()),
                        cond("oblique", t!("斜碰（有切向分量）"), oblique, unless(oblique, t!("正碰"))),
                        cond("equalMassElasticRest", t!("等质量、弹性、被碰球静止"), eq_mass && e == 1.0 && u2.abs() < 1e-12 && w2.abs() < 1e-12, Text::empty()),
                        friction_cond.clone(),
                        cond("elastic", t!("弹性碰撞（e = 1）"), e == 1.0, Text::Lit(format!("e = {}", js_num(e)))),
                        cond("perfectlyInelastic", t!("完全非弹性碰撞（e = 0，碰后共速）"), e == 0.0, Text::Lit(format!("e = {}", js_num(e)))),
                        cond("equalMass", t!("两球质量相等"), eq_mass, Text::empty()),
                    ],
                };
                out.push(Situation {
                    key: format!("col:{}", ev.index),
                    ty: "collision",
                    title: t!("{0}与{1}碰撞（e = {2}）", b1.name.clone(), b2.name.clone(), e),
                    t0: ev.t,
                    t1,
                    t_event: Some(ev.t),
                    bodies: vec![b1.id.clone(), b2.id.clone()],
                    sample: constant(sample),
                });
            } else if (hinged_a && at_b.none() && central(bb)) || (hinged_b && at_a.none() && central(ba)) {
                let (h, pb) = if hinged_a { (ba, bb) } else { (bb, ba) };
                let hi = if hinged_a { at_a.hinges[0] } else { at_b.hinges[0] };
                let Some((pvx, pvy, pbody)) = hinge_pivot(&sys, hi) else { continue };
                if pbody != h.global {
                    continue;
                }
                // Normal pointing from the ball into the hinged body
                let n_in = if std::ptr::eq(pb, ba) { (-n_ab.0, -n_ab.1) } else { n_ab };
                let (vp, vpa) = (vel(&before, pb), vel(&after, pb));
                let d = ((p.cx - pvx) * n_in.1 - (p.cy - pvy) * n_in.0).abs();
                let (hx, hy) = (before[3 * h.index as usize] - pvx, before[3 * h.index as usize + 1] - pvy);
                let ip = h.inertia + h.mass * (hx * hx + hy * hy);
                let omega0 = before[3 * n + 3 * h.index as usize + 2];
                let ids = [pb.id.as_str(), h.id.as_str()];
                let sample = Sample {
                    vars: vec![
                        ("m", var(pb.mass, "kg", "m", t!("{0}质量", pb.name.clone()))),
                        ("Ip", var(ip, "kg·m²", "I", t!("{0}对转轴的转动惯量", h.name.clone()))),
                        ("d", var(d, "m", "d", t!("碰撞力作用线到转轴的距离"))),
                        ("v", var(vp.0 * n_in.0 + vp.1 * n_in.1, "m/s", "v", t!("碰前{0}法向速度", pb.name.clone()))),
                        ("e", var(p.restitution, "", "e", t!("恢复系数"))),
                        ("L0", var(lz_about(&sys, &before, pvx, pvy, &ids), "kg·m²/s", "L", t!("碰前对转轴角动量"))),
                    ],
                    measures: vec![
                        ("vAfter", meas(Some(vpa.0 * n_in.0 + vpa.1 * n_in.1), "m/s", t!("碰后{0}法向速度", pb.name.clone()))),
                        ("omegaAfter", meas(Some(after[3 * n + 3 * h.index as usize + 2].abs()), "rad/s", t!("碰后{0}角速度大小", h.name.clone()))),
                        ("LAfter", meas(Some(lz_about(&sys, &after, pvx, pvy, &ids)), "kg·m²/s", t!("碰后对转轴角动量"))),
                    ],
                    conditions: vec![cond("rest", t!("{0}碰前静止", h.name.clone()), omega0.abs() < 1e-12, Text::empty()), friction_cond.clone()],
                };
                out.push(Situation {
                    key: format!("hi:{}", ev.index),
                    ty: "hinged-impact",
                    title: t!("{0}撞击绕轴转动的{1}", pb.name.clone(), h.name.clone()),
                    t0: ev.t,
                    t1,
                    t_event: Some(ev.t),
                    bodies: vec![pb.id.clone(), h.id.clone()],
                    sample: constant(sample),
                });
            }
        } else {
            let d_b = if ba.dynamic { ba } else { bb };
            if !central(d_b) || !attached(model, &d_b.id).none() {
                continue;
            }
            let n_out = if std::ptr::eq(d_b, ba) { n_ab } else { (-n_ab.0, -n_ab.1) };
            let (vb, va) = (vel(&before, d_b), vel(&after, d_b));
            let s_b = if std::ptr::eq(d_b, ba) { bb } else { ba };
            let sample = Sample {
                vars: vec![("e", var(p.restitution, "", "e", t!("恢复系数"))), ("u", var(vb.0 * n_out.0 + vb.1 * n_out.1, "m/s", "v_n", t!("碰前法向速度")))],
                measures: vec![("v", meas(Some(va.0 * n_out.0 + va.1 * n_out.1), "m/s", t!("碰后法向速度")))],
                conditions: vec![friction_cond.clone()],
            };
            out.push(Situation {
                key: format!("bo:{}", ev.index),
                ty: "bounce",
                title: t!("{0}与{1}碰撞", d_b.name.clone(), s_b.name.clone()),
                t0: ev.t,
                t1,
                t_event: Some(ev.t),
                bodies: vec![d_b.id.clone(), s_b.id.clone()],
                sample: constant(sample),
            });
        }
    }
    Ok(())
}

// ---- Projectiles ----
fn projectile_situations(r: &mut Rec, out: &mut Vec<Situation>) -> SimResult<()> {
    let sys = r.sys.clone();
    let model = &sys.model;
    let (g, vertical) = gravity(model);
    if !vertical || g <= 0.0 {
        return Ok(());
    }
    let n = sys.n;
    for &bg in &model.dynamic {
        let b = &model.bodies[bg];
        if !attached(model, &b.id).none() {
            continue;
        }
        // 26.55: a flight ends at an impact of the body (a bounce starts a new one, as in the mode of a contact)
        let hits = impact_times(r, &b.id);
        let list = runs(r, &mut |seg| if closed_units(&sys, &seg.mode, &b.id).is_empty() { Some(format!("proj:{}:{}", b.id, hits.iter().filter(|&&t| t <= seg.t0).count())) } else { None });
        for run in list {
            if run.t1 - run.t0 < 1e-9 {
                continue;
            }
            let s0 = body_vel(&sys, &r.seg(run.segs[0]).x0, b);
            let end_before = r.event_at(run.t1).filter(|e| e.changes.iter().any(|c| matches!(c.kind(), crate::simulation::ChangeType::Impact | crate::simulation::ChangeType::Touch) && c.bodies.contains(&b.id))).map(|e| e.before.clone());
            let lands = end_before.is_some();
            let s_end = body_vel(&sys, &match end_before {
                Some(x) => x,
                None => r.exact(run.t1)?,
            }, b);
            let apex: Lazy<Option<(f64, f64)>> = lazy();
            let view = r.v;
            let (t0, t1) = (run.t0, run.t1);
            let bi = b.index as usize;
            let mass = b.mass;
            out.push(Situation {
                key: format!("proj:{}:{}", b.id, js_num(t0)),
                ty: "projectile",
                title: t!("{0} 的抛体运动", b.name.clone()),
                t0,
                t1,
                t_event: None,
                bodies: vec![b.id.clone()],
                sample: Rc::new(move |s, t| {
                    let mut r = Rec::new(s, view);
                    let sys = r.sys.clone();
                    let st = body_vel(&sys, &r.exact(t)?, &sys.model.bodies[bg]);
                    if apex.borrow().is_none() {
                        let mut found = None;
                        if s0.vy > 0.0 {
                            let ts = crossings(&mut r, &mut |_, x, _| Ok(-x[3 * n + 3 * bi + 1]), t0, t1, 1, 1)?;
                            if let Some(&ta) = ts.first() {
                                found = Some((ta, body_vel(&sys, &r.exact(ta)?, &sys.model.bodies[bg]).y));
                            }
                        }
                        *apex.borrow_mut() = Some(found);
                    }
                    let ap = apex.borrow().expect("computed");
                    let speed = (st.vx * st.vx + st.vy * st.vy).sqrt();
                    let from_rest = s0.vx == 0.0 && s0.vy == 0.0;
                    Ok(Sample {
                        vars: vec![
                            ("x0", var(s0.x, "m", "x_0", t!("初始水平位置"))),
                            ("y0", var(s0.y, "m", "y_0", t!("初始高度"))),
                            ("vx0", var(s0.vx, "m/s", "v_{0x}", t!("初速度水平分量"))),
                            ("vy0", var(s0.vy, "m/s", "v_{0y}", t!("初速度竖直分量"))),
                            ("g", var(g, "m/s²", "g", t!("重力加速度"))),
                            ("t", var(t - t0, "s", "t", t!("飞行时间"))),
                            ("y1", var(s_end.y, "m", "y_1", t!("落点高度（质心）"))),
                            ("m", var(mass, "kg", "m", t!("质量"))),
                            ("y", var(st.y, "m", "y", t!("当前高度（仿真）"))),
                            ("h", var(s0.y - st.y, "m", "h", t!("下落高度（仿真）"))),
                        ],
                        measures: vec![
                            ("x", meas(Some(st.x), "m", t!("水平位置"))),
                            ("y", meas(Some(st.y), "m", t!("竖直位置"))),
                            ("vx", meas(Some(st.vx), "m/s", t!("水平速度"))),
                            ("vy", meas(Some(st.vy), "m/s", t!("竖直速度"))),
                            ("T", meas(if lands { Some(t1 - t0) } else { None }, "s", t!("飞行时间（到落地事件）"))),
                            ("R", meas(if lands { Some(s_end.x - s0.x) } else { None }, "m", t!("水平射程"))),
                            ("H", meas(ap.map(|a| a.1), "m", t!("最高点高度（质心）"))),
                            ("speed", meas(Some(speed), "m/s", t!("速率"))),
                            ("drop", meas(Some(s0.y - st.y), "m", t!("下落高度"))),
                            ("E", meas(Some(0.5 * mass * speed * speed + mass * g * st.y), "J", t!("机械能 ½mv² + mgy"))),
                        ],
                        conditions: vec![
                            cond("lands", t!("记录内落到接触面"), lands, unless(lands, t!("记录内没有落地"))),
                            cond("rises", t!("向上抛出且到达最高点"), s0.vy > 0.0 && ap.is_some(), Text::empty()),
                            cond("fromRest", t!("由静止释放（自由落体）"), from_rest, unless(from_rest, t!("有初速度"))),
                        ],
                    })
                }),
            });
        }
    }
    Ok(())
}

// ---- Pendulums ----
fn pendulum_situations(r: &mut Rec, out: &mut Vec<Situation>) -> SimResult<()> {
    let sys = r.sys.clone();
    let model = &sys.model;
    let (g, vertical) = gravity(model);
    if !vertical || g <= 0.0 {
        return Ok(());
    }
    let n = sys.n;
    for &bg in &model.dynamic {
        let b = &model.bodies[bg];
        let at = attached(model, &b.id);
        let single = at.ropes.len() + at.rods.len() == 1 && at.springs.len() + at.hinges.len() + at.forces.len() + at.extra == 0;
        if !single {
            continue;
        }
        let is_rope = at.ropes.len() == 1;
        let (ca, cb, length) = if is_rope {
            let c = &model.ropes[at.ropes[0]];
            (&c.a, &c.b, c.length)
        } else {
            let c = &model.rods[at.rods[0]];
            (&c.a, &c.b, c.length)
        };
        if is_rope && !model.ropes[at.ropes[0]].pulleys.is_empty() {
            continue;
        }
        let mine_a = ca.body.is_some_and(|x| model.bodies[x].id == b.id);
        let (mine, fixed) = if mine_a { (ca, cb) } else { (cb, ca) };
        let Some(pivot) = anchor_world(model, fixed) else { continue };
        if mine.local.x.abs() > 1e-12 || mine.local.y.abs() > 1e-12 {
            continue;
        }
        let rope_i = if is_rope { Some(at.ropes[0]) } else { None };
        // 26.55: an impact of the bob (a collision with another body) starts a new swing
        let hits = impact_times(r, &b.id);
        let list = runs(r, &mut |seg| {
            if !touching_units(&sys, &seg.mode, &b.id).is_empty() {
                return None;
            }
            if let Some(ri) = rope_i {
                if !seg.mode.taut[ri] {
                    return None;
                }
            }
            Some(format!("pend:{}:{}", b.id, hits.iter().filter(|&&t| t <= seg.t0).count()))
        });
        let bi = b.index as usize;
        for run in list {
            let l = length;
            let phi_of = |x: &[f64]| atan2(x[3 * bi] - pivot.0, pivot.1 - x[3 * bi + 1]);
            let x0 = r.seg(run.segs[0]).x0.clone();
            let v0sq = sq(x0[3 * n + 3 * bi]) + sq(x0[3 * n + 3 * bi + 1]);
            let cos_m = cos(phi_of(&x0)) - v0sq / (2.0 * g * l);
            // A rope rising above the horizontal goes slack, a rod that passes the top turns round: both are
            // vertical circular motion (vertical_circle_situations), not a pendulum
            if if is_rope { cos_m < 0.0 } else { cos_m <= -1.0 } {
                continue;
            }
            let oscillates = cos_m > -1.0;
            let theta0 = if oscillates { acos(js_min(1.0, cos_m)) } else { PI_VALUE };
            let cache: Lazy<(Option<f64>, Option<f64>, Option<f64>)> = lazy();
            let deg = theta0 / DEG;
            let small = Condition {
                id: "smallAngle".into(),
                label: t!("小角度近似（θ₀ ≤ 5°）"),
                status: if deg <= 5.0 {
                    CondStatus::Ok
                } else if deg <= 10.0 {
                    CondStatus::Approx
                } else {
                    CondStatus::Fail
                },
                detail: Text::Lit(format!("θ₀ = {}°", js_to_precision(deg, 4))),
            };
            let view = r.v;
            let (t0, t1) = (run.t0, run.t1);
            let mass = b.mass;
            out.push(Situation {
                key: format!("pend:{}:{}", b.id, js_num(t0)),
                ty: "pendulum",
                title: t!("{0} 的单摆运动", b.name.clone()),
                t0,
                t1,
                t_event: None,
                bodies: vec![b.id.clone()],
                sample: Rc::new(move |s, _t| {
                    if cache.borrow().is_none() {
                        let mut r = Rec::new(s, view);
                        let ts = crossings(&mut r, &mut |_, x, _| Ok(x[3 * bi] - pivot.0), t0, t1, 1, 3)?;
                        let (mut vb, mut tb) = (None, None);
                        let all = crossings(&mut r, &mut |_, x, _| Ok(x[3 * bi] - pivot.0), t0, t1, 0, 1)?;
                        if let Some(&ta) = all.first() {
                            let o = r.observe(ta)?;
                            vb = Some((sq(o.x[3 * n + 3 * bi]) + sq(o.x[3 * n + 3 * bi + 1])).sqrt());
                            tb = rope_i.map(|ri| o.sol.rope_tension[ri]);
                        }
                        *cache.borrow_mut() = Some((if ts.len() >= 2 { Some(ts[1] - ts[0]) } else { None }, vb, tb));
                    }
                    let (per, vb, tb) = cache.borrow().expect("measured");
                    Ok(Sample {
                        vars: vec![
                            ("L", var(l, "m", "L", t!("摆长（到球心）"))),
                            ("m", var(mass, "kg", "m", t!("摆球质量"))),
                            ("g", var(g, "m/s²", "g", t!("重力加速度"))),
                            ("theta0", var(theta0, "rad", "\\theta_0", t!("振幅（最大摆角）"))),
                        ],
                        measures: vec![
                            ("T", meas_note(per, "s", t!("周期（相邻两次同向过最低点）"), if per.is_none() { Some(t!("记录时长不足一个完整周期")) } else { None })),
                            ("vBottom", meas(vb, "m/s", t!("过最低点的速率"))),
                            ("TBottom", meas(tb, "N", t!("过最低点时绳的拉力"))),
                        ],
                        conditions: vec![small.clone(), cond("taut", t!("绳始终张紧"), true, Text::empty()), cond("oscillates", t!("往复摆动（未做圆周运动）"), oscillates, Text::empty())],
                    })
                }),
            });
        }
    }
    Ok(())
}

// ---- Spring oscillators ----
fn spring_situations(r: &mut Rec, out: &mut Vec<Situation>) -> SimResult<()> {
    let sys = r.sys.clone();
    let model = &sys.model;
    let gv = model.settings.gravity;
    let n = sys.n;
    for &bg in &model.dynamic {
        let b = &model.bodies[bg];
        let at = attached(model, &b.id);
        if at.springs.len() != 1 || at.ropes.len() + at.rods.len() + at.hinges.len() + at.forces.len() + at.extra > 0 {
            continue;
        }
        let si = at.springs[0];
        let sp = &model.springs[si];
        if sp.damping != 0.0 {
            continue;
        }
        let mine_a = sp.a.body.is_some_and(|x| model.bodies[x].id == b.id);
        let (mine, fixed) = if mine_a { (&sp.a, &sp.b) } else { (&sp.b, &sp.a) };
        let Some(pp) = anchor_world(model, fixed) else { continue };
        let list = runs(r, &mut |seg| {
            let us = closed_units(&sys, &seg.mode, &b.id);
            if us.iter().any(|u| u.friction != Friction::None || model.bodies[other_body(&sys, u, &b.id)].dynamic) {
                return None;
            }
            Some(format!("spring:{}", b.id))
        });
        let bi = b.index as usize;
        let ml = mine.local;
        for run in list {
            let x0 = r.seg(run.segs[0]).x0.clone();
            let poses = compute_poses(model, &x0);
            let pa = &poses[b.global];
            let ax = pa.x + pa.c * ml.x - pa.s * ml.y;
            let ay = pa.y + pa.s * ml.x + pa.c * ml.y;
            let len = (sq(ax - pp.0) + sq(ay - pp.1)).sqrt();
            let (ux, uy) = ((ax - pp.0) / len, (ay - pp.1) / len);
            let supported = !closed_units(&sys, &r.seg(run.segs[0]).mode, &b.id).is_empty();
            let g_along = gv.x * ux + gv.y * uy;
            let ext_eq = if supported { 0.0 } else { b.mass * g_along / sp.stiffness };
            let (vx, vy) = (x0[3 * n + 3 * bi], x0[3 * n + 3 * bi + 1]);
            let v_along = vx * ux + vy * uy;
            let v_perp = -vx * uy + vy * ux;
            let omega = (sp.stiffness / b.mass).sqrt();
            let xd0 = len - sp.rest_length - ext_eq;
            let amp = (xd0 * xd0 + sq(v_along / omega)).sqrt();
            let one_dim = v_perp.abs() < 1e-12 && x0[3 * n + 3 * bi + 2].abs() < 1e-12 && if supported { g_along.abs() < 1e-12 } else { (gv.x * uy - gv.y * ux).abs() < 1e-12 };
            if !one_dim {
                continue;
            }
            let rest = sp.rest_length;
            let cache: Lazy<(Option<f64>, Option<f64>, Option<f64>)> = lazy();
            let view = r.v;
            let (t0, t1) = (run.t0, run.t1);
            let (k, mass) = (sp.stiffness, b.mass);
            out.push(Situation {
                key: format!("spring:{}:{}", b.id, js_num(t0)),
                ty: "spring",
                title: t!("{0} 的简谐振动", b.name.clone()),
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
                        let ts = crossings(&mut r, &mut |_, x, _| Ok(disp(x)), t0, t1, 1, 3)?;
                        let any = crossings(&mut r, &mut |_, x, _| Ok(disp(x)), t0, t1, 0, 1)?;
                        let turn = crossings(&mut r, &mut |_, x, _| Ok(x[3 * n + 3 * bi] * ux + x[3 * n + 3 * bi + 1] * uy), t0, t1, 0, 1)?;
                        let (mut vmax, mut amax) = (None, None);
                        if let Some(&ta) = any.first() {
                            let x = r.exact(ta)?;
                            vmax = Some((sq(x[3 * n + 3 * bi]) + sq(x[3 * n + 3 * bi + 1])).sqrt());
                        }
                        let t_turn = match turn.first() {
                            Some(&tt) => Some(tt),
                            None => {
                                if v_along.abs() < 1e-12 {
                                    Some(t0)
                                } else {
                                    None
                                }
                            }
                        };
                        if let Some(tt) = t_turn {
                            let o = r.observe(tt)?;
                            amax = Some((o.sol.acc[3 * bi] * ux + o.sol.acc[3 * bi + 1] * uy).abs());
                        }
                        *cache.borrow_mut() = Some((if ts.len() >= 2 { Some(ts[1] - ts[0]) } else { None }, vmax, amax));
                    }
                    let (per, vmax, amax) = cache.borrow().expect("measured");
                    Ok(Sample {
                        vars: vec![("k", var(k, "N/m", "k", t!("劲度系数"))), ("m", var(mass, "kg", "m", t!("振子质量"))), ("A", var(amp, "m", "A", t!("振幅")))],
                        measures: vec![
                            ("T", meas_note(per, "s", t!("周期"), if per.is_none() { Some(t!("记录时长不足一个完整周期")) } else { None })),
                            ("vmax", meas(vmax, "m/s", t!("过平衡位置的速率"))),
                            ("amax", meas(amax, "m/s²", t!("最大位移处加速度大小"))),
                        ],
                        conditions: vec![cond("undamped", t!("无阻尼、无摩擦"), true, Text::empty())],
                    })
                }),
            });
        }
    }
    Ok(())
}

// ---- Rotation about a fixed hinge ----
fn rotation_situations(r: &mut Rec, out: &mut Vec<Situation>) -> SimResult<()> {
    let sys = r.sys.clone();
    let model = &sys.model;
    let (g, vertical) = gravity(model);
    if !vertical {
        return Ok(());
    }
    let n = sys.n;
    for hi in 0..model.hinges.len() {
        let Some((pvx, pvy, bg)) = hinge_pivot(&sys, hi) else { continue };
        let b = &model.bodies[bg];
        let at = attached(model, &b.id);
        if at.hinges.len() != 1 || at.ropes.len() + at.rods.len() + at.springs.len() + at.forces.len() + at.extra > 0 || b.inv_inertia == 0.0 {
            continue;
        }
        let list = runs(r, &mut |seg| if touching_units(&sys, &seg.mode, &b.id).is_empty() { Some(format!("rot:{}", b.id)) } else { None });
        let bi = b.index as usize;
        for run in list {
            let x0 = r.seg(run.segs[0]).x0.clone();
            let (dx0, dy0) = (x0[3 * bi] - pvx, x0[3 * bi + 1] - pvy);
            let d = (dx0 * dx0 + dy0 * dy0).sqrt();
            let ip = b.inertia + b.mass * d * d;
            let phi0 = atan2(dx0, -dy0);
            let omega0 = x0[3 * n + 3 * bi + 2];
            let lrod = 2.0 * d;
            let thin = (b.inertia - b.mass * lrod * lrod / 12.0).abs() <= 1e-9 * b.inertia;
            let from_horizontal = (phi0.abs() - PI_VALUE / 2.0).abs() < 1e-9 && omega0.abs() < 1e-12;
            let cache: Lazy<Option<f64>> = lazy();
            let view = r.v;
            let (t0, t1) = (run.t0, run.t1);
            let mass = b.mass;
            out.push(Situation {
                key: format!("rot:{}:{}", b.id, js_num(t0)),
                ty: "rotation",
                title: t!("{0} 绕固定轴转动", b.name.clone()),
                t0,
                t1,
                t_event: None,
                bodies: vec![b.id.clone()],
                sample: Rc::new(move |s, t| {
                    let mut r = Rec::new(s, view);
                    let o = r.observe(t)?;
                    let phi = atan2(o.x[3 * bi] - pvx, -(o.x[3 * bi + 1] - pvy));
                    if cache.borrow().is_none() {
                        let ts = crossings(&mut r, &mut |_, x, _| Ok(x[3 * bi] - pvx), t0, t1, 0, 4)?;
                        let mut tb = None;
                        for tc in ts {
                            if r.exact(tc)?[3 * bi + 1] < pvy {
                                tb = Some(tc);
                                break;
                            }
                        }
                        *cache.borrow_mut() = Some(tb);
                    }
                    let tb = cache.borrow().expect("measured");
                    let (mut omega_b, mut fb) = (None, None);
                    if let Some(tbv) = tb {
                        let ob = r.observe(tbv)?;
                        omega_b = Some(ob.x[3 * n + 3 * bi + 2].abs());
                        let (fx, fy) = ob.hinge_force(hi);
                        fb = Some((fx * fx + fy * fy).sqrt());
                    }
                    Ok(Sample {
                        vars: vec![
                            ("m", var(mass, "kg", "m", t!("质量"))),
                            ("Ip", var(ip, "kg·m²", "I", t!("对转轴的转动惯量 I = I_C + md²"))),
                            ("d", var(d, "m", "d", t!("质心到转轴距离"))),
                            ("g", var(g, "m/s²", "g", t!("重力加速度"))),
                            ("phi", var(phi, "rad", "\\varphi", t!("当前偏角"))),
                            ("phi0", var(phi0, "rad", "\\varphi_0", t!("初始偏角"))),
                            ("omega0", var(omega0, "rad/s", "\\omega_0", t!("初始角速度"))),
                            ("L", var(lrod, "m", "L", t!("杆长"))),
                        ],
                        measures: vec![
                            ("alpha", meas(Some(o.sol.acc[3 * bi + 2]), "rad/s²", t!("角加速度"))),
                            ("omegaBottom", meas(omega_b, "rad/s", t!("最低点角速度大小"))),
                            ("FBottom", meas(fb, "N", t!("最低点铰链力大小"))),
                        ],
                        conditions: vec![
                            cond("reachesBottom", t!("记录内转到最低点"), tb.is_some(), Text::empty()),
                            cond("thinRodFromHorizontal", t!("匀质细杆、从水平位置静止释放"), thin && from_horizontal, unless(thin, t!("转动惯量不是 mL²/12"))),
                        ],
                    })
                }),
            });
        }
    }
    Ok(())
}

// ---- Pulleys: Atwood machine, block on a table ----
fn pulley_situations(r: &mut Rec, out: &mut Vec<Situation>) -> SimResult<()> {
    let sys = r.sys.clone();
    let model = &sys.model;
    let (g, vertical) = gravity(model);
    if !vertical {
        return Ok(());
    }
    'ropes: for (ri, rope) in model.ropes.iter().enumerate() {
        let (Some(ag), Some(bg)) = (rope.a.body, rope.b.body) else { continue };
        if rope.pulleys.is_empty() || !model.bodies[ag].dynamic || !model.bodies[bg].dynamic {
            continue;
        }
        let (a_b, b_b) = (&model.bodies[ag], &model.bodies[bg]);
        for x in [a_b, b_b] {
            let at = attached(model, &x.id);
            if at.ropes.len() != 1 || at.rods.len() + at.springs.len() + at.hinges.len() + at.forces.len() + at.extra > 0 {
                continue 'ropes;
            }
        }
        let list = runs(r, &mut |seg| {
            if !seg.mode.taut[ri] {
                return None;
            }
            let ua = closed_units(&sys, &seg.mode, &a_b.id);
            let ub = closed_units(&sys, &seg.mode, &b_b.id);
            if touching_units(&sys, &seg.mode, &a_b.id).len() > ua.len() || touching_units(&sys, &seg.mode, &b_b.id).len() > ub.len() {
                return None;
            }
            if ua.is_empty() && ub.is_empty() {
                return Some("atwood".into());
            }
            if ua.len() + ub.len() != 1 {
                return None;
            }
            let (u, on_table) = if !ua.is_empty() { (ua[0], a_b) } else { (ub[0], b_b) };
            if model.bodies[other_body(&sys, u, &on_table.id)].dynamic {
                return None;
            }
            let geo = unit_geometry(&sys, &seg.x0, u, &on_table.id);
            if geo.theta > 1e-9 || geo.belt != 0.0 {
                return None;
            }
            Some(format!("table:{}:{}", on_table.id, friction_name(u.friction)))
        });
        for run in list {
            let view = r.v;
            let (t0, t1) = (run.t0, run.t1);
            if run.sig == "atwood" {
                let (an, bn) = (a_b.name.clone(), b_b.name.clone());
                let (am, bm) = (a_b.mass, b_b.mass);
                let bi = b_b.index as usize;
                out.push(Situation {
                    key: format!("atw:{}:{}", ri, js_num(t0)),
                    ty: "atwood",
                    title: t!("{0}与{1}跨过定滑轮（阿特伍德机）", an.clone(), bn.clone()),
                    t0,
                    t1,
                    t_event: None,
                    bodies: vec![a_b.id.clone(), b_b.id.clone()],
                    sample: Rc::new(move |s, t| {
                        let mut r = Rec::new(s, view);
                        let o = r.observe(t)?;
                        Ok(Sample {
                            vars: vec![("m1", var(am, "kg", "m_1", t!("{0}质量", an.clone()))), ("m2", var(bm, "kg", "m_2", t!("{0}质量", bn.clone()))), ("g", var(g, "m/s²", "g", t!("重力加速度")))],
                            measures: vec![
                                ("a", meas(Some(-o.sol.acc[3 * bi + 1]), "m/s²", t!("{0}向下的加速度", bn.clone()))),
                                ("T", meas(Some(o.sol.rope_tension[ri]), "N", t!("绳的拉力"))),
                            ],
                            conditions: vec![],
                        })
                    }),
                });
                continue;
            }
            let parts: Vec<&str> = run.sig.split(':').collect();
            let (table_id, fr) = (parts[1].to_string(), parts[2].to_string());
            let t1b = if a_b.id == table_id { a_b } else { b_b };
            let hb = if std::ptr::eq(t1b, a_b) { b_b } else { a_b };
            let seg0 = r.seg(run.segs[0]).clone();
            let u = closed_units(&sys, &seg0.mode, &t1b.id)[0].clone();
            let mu = sys.pairs[u.pair].material.mu_k;
            let (tn, hn) = (t1b.name.clone(), hb.name.clone());
            let (tm, hm) = (t1b.mass, hb.mass);
            let hi = hb.index as usize;
            out.push(Situation {
                key: format!("pul:{}:{}", ri, js_num(t0)),
                ty: "pulley",
                title: t!("{0}与{1}通过定滑轮相连", tn.clone(), hn.clone()),
                t0,
                t1,
                t_event: None,
                bodies: vec![t1b.id.clone(), hb.id.clone()],
                sample: Rc::new(move |s, t| {
                    let mut r = Rec::new(s, view);
                    let o = r.observe(t)?;
                    Ok(Sample {
                        vars: vec![
                            ("m1", var(tm, "kg", "m_1", t!("{0}质量（桌上）", tn.clone()))),
                            ("m2", var(hm, "kg", "m_2", t!("{0}质量（悬挂）", hn.clone()))),
                            ("mu", var(mu, "", "\\mu", t!("桌面动摩擦因数"))),
                            ("g", var(g, "m/s²", "g", t!("重力加速度"))),
                        ],
                        measures: vec![
                            ("a", meas(Some(-o.sol.acc[3 * hi + 1]), "m/s²", t!("{0}向下的加速度", hn.clone()))),
                            ("T", meas(Some(o.sol.rope_tension[ri]), "N", t!("绳的拉力"))),
                        ],
                        conditions: vec![cond("moving", t!("系统在运动（桌上物块滑动）"), fr == "slide" || fr == "none", when(fr == "stick", t!("静摩擦足以使系统静止")))],
                    })
                }),
            });
        }
    }
    Ok(())
}

// ---- Whole run: energy ledger and momentum ----
fn conservation_situations(r: &mut Rec, out: &mut Vec<Situation>) -> SimResult<()> {
    let sys = r.sys.clone();
    let model = &sys.model;
    let fc_t = (r.v.frame_count as f64 - 1.0) * r.dt();
    let t_end = match r.v.reduced_from {
        Some(rf) => js_min(rf, fc_t),
        None => fc_t,
    };
    if t_end <= 0.0 && r.v.reduced_from.is_some() {
        return Ok(());
    }
    let o0 = r.observe(0.0)?;
    let balance0 = ledger_at(&sys, &o0.x, o0.impact_loss).balance;
    let view = r.v;
    out.push(Situation {
        key: "energy".into(),
        ty: "energy",
        title: t!("能量账本"),
        t0: 0.0,
        t1: t_end,
        t_event: None,
        bodies: vec![],
        sample: Rc::new(move |s, t| {
            let mut r = Rec::new(s, view);
            let o = r.observe(t)?;
            let sys = r.sys.clone();
            Ok(Sample {
                vars: vec![("E0", var(balance0, "J", "E_0", t!("初始总能量")))],
                measures: vec![("balance", meas(Some(ledger_at(&sys, &o.x, o.impact_loss).balance), "J", t!("当前账本合计")))],
                conditions: vec![],
            })
        }),
    });
    let gv = model.settings.gravity;
    let dyn_anchor = |a: &crate::model::AnchorModel| a.body.is_some_and(|g| model.bodies[g].dynamic);
    let mut free = gv.x == 0.0 && gv.y == 0.0 && model.forces.is_empty();
    // 26.54 (D78): uniform fields and fixed charges are external forces (absent in older scenes)
    free = free && !model.electric_external();
    // 26.55: field regions, liquids and rail loops are external forces
    free = free && model.zone_pairs.is_empty() && model.liquids.is_empty() && model.rails.is_empty();
    free = free
        && model.ropes.iter().all(|c| dyn_anchor(&c.a) && dyn_anchor(&c.b))
        && model.rods.iter().all(|c| dyn_anchor(&c.a) && dyn_anchor(&c.b))
        && model.springs.iter().all(|c| dyn_anchor(&c.a) && dyn_anchor(&c.b))
        && model.hinges.iter().all(|c| dyn_anchor(&c.a) && dyn_anchor(&c.b));
    // 26.54: gravitation of fixed bodies, central fields with a fixed centre, air drag and connectors to the world are
    // external forces too (the momentum card of the orbit template deviated since 26.51)
    free = free
        && !(model.g_const > 0.0 && model.attractors.iter().any(|&g| !model.bodies[g].dynamic))
        && model.centrals.iter().all(|c| dyn_anchor(&c.a))
        && model.dynamic.iter().all(|&g| !(model.bodies[g].drag_lin > 0.0 || model.bodies[g].drag_quad > 0.0))
        && model.welds.iter().all(|c| dyn_anchor(&c.a) && dyn_anchor(&c.b))
        && model.sliders.iter().all(|c| dyn_anchor(&c.a) && dyn_anchor(&c.b))
        && model.motors.iter().all(|c| dyn_anchor(&c.a) && dyn_anchor(&c.b));
    free = free
        && (0..r.nseg()).all(|i| {
            r.seg(i).mode.units.iter().all(|u| {
                let p = &sys.pairs[u.pair];
                u.points.is_empty() || (model.bodies[p.x].dynamic && model.bodies[p.y].dynamic)
            })
        });
    free = free
        && r.events().iter().all(|e| match &e.impact {
            None => true,
            Some(imp) => imp.points.iter().all(|p| match p.pair {
                None => true,
                Some(pi) => model.bodies[sys.pairs[pi].x].dynamic && model.bodies[sys.pairs[pi].y].dynamic,
            }),
        });
    if free && !model.dynamic.is_empty() {
        let n = sys.n;
        let p_of = move |sys: &System, x: &[f64]| {
            let (mut px, mut py) = (0.0, 0.0);
            for &g in &sys.model.dynamic {
                let b = &sys.model.bodies[g];
                px += b.mass * x[3 * n + 3 * b.index as usize];
                py += b.mass * x[3 * n + 3 * b.index as usize + 1];
            }
            (px, py)
        };
        let p0 = p_of(&sys, &r.exact(0.0)?);
        out.push(Situation {
            key: "momentum".into(),
            ty: "momentum",
            title: t!("系统动量（不受外力）"),
            t0: 0.0,
            t1: t_end,
            t_event: None,
            bodies: model.dynamic.iter().map(|&g| model.bodies[g].id.clone()).collect(),
            sample: Rc::new(move |s, t| {
                let mut r = Rec::new(s, view);
                let sys = r.sys.clone();
                let q = p_of(&sys, &r.exact(t)?);
                Ok(Sample {
                    vars: vec![("p0x", var(p0.0, "kg·m/s", "p_{x0}", t!("初始总动量 x"))), ("p0y", var(p0.1, "kg·m/s", "p_{y0}", t!("初始总动量 y")))],
                    measures: vec![("px", meas(Some(q.0), "kg·m/s", t!("总动量 x"))), ("py", meas(Some(q.1), "kg·m/s", t!("总动量 y")))],
                    conditions: vec![],
                })
            }),
        });
    }
    Ok(())
}

// ---- Vertical circles (rope and rod) ----
#[derive(Clone, Copy)]
struct VF {
    v: f64,
    f: f64,
}

fn vertical_circle_situations(r: &mut Rec, out: &mut Vec<Situation>) -> SimResult<()> {
    let sys = r.sys.clone();
    let model = &sys.model;
    let (g, vertical) = gravity(model);
    if !vertical || g <= 0.0 {
        return Ok(());
    }
    let n = sys.n;
    for &bg in &model.dynamic {
        let b = &model.bodies[bg];
        let Some(link) = single_link(model, b) else { continue };
        let (is_rope, index, pivot) = (link.is_rope, link.index, link.pivot);
        let l = link.length;
        let list = runs(r, &mut |seg| {
            if !touching_units(&sys, &seg.mode, &b.id).is_empty() {
                return None;
            }
            if is_rope && !seg.mode.taut[index] {
                return None;
            }
            Some(format!("vc:{}", b.id))
        });
        let bi = b.index as usize;
        for run in list {
            if run.t1 - run.t0 < 1e-9 {
                continue;
            }
            let x0 = r.seg(run.segs[0]).x0.clone();
            let s0 = body_vel(&sys, &x0, b);
            let (rx, ry) = (s0.x - pivot.0, s0.y - pivot.1);
            let dir = sign_or1(rx * s0.vy - ry * s0.vx);
            let vb2 = s0.vx * s0.vx + s0.vy * s0.vy + 2.0 * g * (l + ry);
            if if is_rope { vb2 <= 2.0 * g * l * (1.0 + 1e-9) } else { vb2 <= 4.0 * g * l * (1.0 + 1e-9) } {
                continue;
            }
            let v0 = vb2.sqrt();
            let phi_of = move |x: &[f64]| dir * atan2(x[3 * bi] - pivot.0, pivot.1 - x[3 * bi + 1]);
            let phi0 = phi_of(&x0);
            let speed = move |x: &[f64]| (sq(x[3 * n + 3 * bi]) + sq(x[3 * n + 3 * bi + 1])).sqrt();
            let force = move |o: &Obs| if is_rope { o.sol.rope_tension[index] } else { rod_force(o, index) };
            let rope_id = if is_rope { model.ropes[index].id.clone() } else { String::new() };
            let end_before = r.event_at(run.t1).filter(|e| is_rope && e.changes.iter().any(|c| c.kind() == crate::simulation::ChangeType::Slack && c.subject == rope_id)).map(|e| e.before.clone());
            let slack = end_before.is_some();
            let full_circle = if is_rope { vb2 >= 5.0 * g * l } else { true };
            type VcCache = (Option<VF>, Option<VF>, Option<(f64, f64)>);
            let cache: Lazy<VcCache> = lazy();
            let view = r.v;
            let (t0, t1) = (run.t0, run.t1);
            let measure = move |s: &mut Session, cache: &Lazy<VcCache>| -> SimResult<VcCache> {
                if let Some(c) = *cache.borrow() {
                    return Ok(c);
                }
                let mut r = Rec::new(s, view);
                let mut bottom: Option<VF> = None;
                let mut top: Option<VF> = None;
                let at = |r: &mut Rec, t: f64| -> SimResult<VF> {
                    let o = r.observe(t)?;
                    Ok(VF { v: speed(&o.x), f: force(&o) })
                };
                if phi0.abs() < 1e-9 {
                    bottom = Some(at(&mut r, t0)?);
                }
                for tc in crossings(&mut r, &mut |_, x, _| Ok(x[3 * bi] - pivot.0), t0, t1, 0, 8)? {
                    let below = r.exact(tc)?[3 * bi + 1] < pivot.1;
                    if below && bottom.is_none() {
                        bottom = Some(at(&mut r, tc)?);
                    }
                    if !below && top.is_none() {
                        top = Some(at(&mut r, tc)?);
                    }
                    if bottom.is_some() && top.is_some() {
                        break;
                    }
                }
                let mut zero = None;
                if !is_rope {
                    let ts = crossings(
                        &mut r,
                        &mut |r, x, t| {
                            let si = r.segment_at(t);
                            let mode = r.seg(si).mode.clone();
                            let o = r.observe_state(x.to_vec(), mode, 0.0)?;
                            Ok(force(&o))
                        },
                        t0,
                        t1,
                        0,
                        1,
                    )?;
                    if let Some(&tz) = ts.first() {
                        let x = r.exact(tz)?;
                        zero = Some((speed(&x), phi_of(&x)));
                    }
                }
                let c = (bottom, top, zero);
                *cache.borrow_mut() = Some(c);
                Ok(c)
            };
            let slack_state = end_before.clone();
            let mass = b.mass;
            let common = move |m: &VcCache| {
                let mut v = vec![
                    ("L", var(l, "m", "L", if is_rope { t!("绳长") } else { t!("杆长") })),
                    ("m", var(mass, "kg", "m", t!("小球质量"))),
                    ("g", var(g, "m/s²", "g", t!("重力加速度"))),
                    ("v0", var(v0, "m/s", "v_0", t!("最低点速率（由本段机械能推算）"))),
                    ("phi0", var(phi0, "rad", "\\varphi_0", t!("本段起点的位置角"))),
                ];
                if let Some(z) = m.2 {
                    v.push(("phiZ", var(z.1, "rad", "\\varphi", t!("杆力为零处的位置角（仿真）"))));
                }
                v
            };
            if is_rope {
                let slack_phi = slack_state.as_ref().map(|x| phi_of(x));
                let slack_h = slack_state.as_ref().map(|x| x[3 * bi + 1] - pivot.1);
                let slack_v = slack_state.as_ref().map(|x| speed(x));
                out.push(Situation {
                    key: format!("vcr:{}:{}", b.id, js_num(t0)),
                    ty: "vcircle-rope",
                    title: t!("{0} 在竖直面内的圆周运动（绳）", b.name.clone()),
                    t0,
                    t1,
                    t_event: None,
                    bodies: vec![b.id.clone()],
                    sample: Rc::new(move |s, _t| {
                        let m = measure(s, &cache)?;
                        let crit = (5.0 * g * l).sqrt();
                        let mut vars = common(&m);
                        if let Some(ps) = slack_phi {
                            vars.push(("phiS", var(ps, "rad", "\\varphi_s", t!("松弛处的位置角（仿真）"))));
                        }
                        Ok(Sample {
                            vars,
                            measures: vec![
                                ("TBottom", meas(m.0.map(|x| x.f), "N", t!("最低点绳的拉力"))),
                                ("vTop", meas(m.1.map(|x| x.v), "m/s", t!("最高点速率"))),
                                ("TTop", meas(m.1.map(|x| x.f), "N", t!("最高点绳的拉力"))),
                                ("v0crit", meas_note(None, "m/s", t!("临界初速度"), Some(t!("临界值：与本例 v₀ = {0} m/s 比较", js_to_precision(v0, 4))))),
                                ("tSlack", meas(if slack { Some(t1 - t0) } else { None }, "s", t!("绳松弛时刻（自本段开始）"))),
                                ("phiSlack", meas(slack_phi, "rad", t!("松弛处的位置角（自最低点）"))),
                                ("hSlack", meas(slack_h, "m", t!("松弛点高出圆心"))),
                                ("vSlack", meas(slack_v, "m/s", t!("松弛时的速率"))),
                            ],
                            conditions: vec![
                                cond("fullCircle", t!("能通过最高点（v₀ ≥ √(5gL) = {0} m/s）", js_to_precision(crit, 4)), full_circle, t!("本例 v₀ = {0} m/s", js_to_precision(v0, 4))),
                                cond("slack", t!("绳在上半圆松弛（√(2gL) < v₀ < √(5gL)）"), slack && !full_circle, unless(slack, t!("记录内绳未松弛"))),
                                cond("atBottom", t!("经过最低点"), m.0.is_some(), unless(m.0.is_some(), t!("本段未经过最低点"))),
                                cond("reachesTop", t!("到达最高点"), m.1.is_some(), unless(m.1.is_some(), t!("本段未到达最高点"))),
                            ],
                        })
                    }),
                });
            } else {
                out.push(Situation {
                    key: format!("vcd:{}:{}", b.id, js_num(t0)),
                    ty: "vcircle-rod",
                    title: t!("{0} 在竖直面内的圆周运动（杆）", b.name.clone()),
                    t0,
                    t1,
                    t_event: None,
                    bodies: vec![b.id.clone()],
                    sample: Rc::new(move |s, _t| {
                        let m = measure(s, &cache)?;
                        Ok(Sample {
                            vars: common(&m),
                            measures: vec![
                                ("FBottom", meas(m.0.map(|x| x.f), "N", t!("最低点杆的拉力"))),
                                ("vTop", meas(m.1.map(|x| x.v), "m/s", t!("最高点速率"))),
                                ("FTop", meas(m.1.map(|x| x.f), "N", t!("最高点杆对球的力（拉为正，推为负）"))),
                                ("vZero", meas(m.2.map(|z| z.0), "m/s", t!("杆力为零时的速率"))),
                            ],
                            conditions: vec![
                                cond("atBottom", t!("经过最低点"), m.0.is_some(), unless(m.0.is_some(), t!("本段未经过最低点"))),
                                cond("reachesTop", t!("到达最高点"), m.1.is_some(), unless(m.1.is_some(), t!("本段未到达最高点"))),
                                cond("forceZero", t!("杆力在本段改变方向"), m.2.is_some(), unless(m.2.is_some(), t!("本段杆力未过零"))),
                                cond("pushAtTop", t!("最高点杆对球为推力（v_top < √(gL) = {0} m/s）", js_to_precision((g * l).sqrt(), 4)), vb2 - 4.0 * g * l < g * l, Text::empty()),
                            ],
                        })
                    }),
                });
            }
        }
    }
    Ok(())
}

// ---- Movable pulley ----
fn movable_pulley_situations(r: &mut Rec, out: &mut Vec<Situation>) -> SimResult<()> {
    let sys = r.sys.clone();
    let model = &sys.model;
    let (g, vertical) = gravity(model);
    if !vertical {
        return Ok(());
    }
    'ropes: for (ri, rope) in model.ropes.iter().enumerate() {
        if !rope.movable {
            continue;
        }
        let mov: Vec<(usize, usize)> = rope.pulleys.iter().enumerate().filter(|(_, (p, _))| model.pulleys[*p].body.is_some()).map(|(i, (p, _))| (*p, i)).collect();
        if mov.len() != 1 {
            continue;
        }
        let (pidx, pi) = mov[0];
        let Some(pg) = model.pulleys[pidx].body else { continue };
        let fixed = |a: &crate::model::AnchorModel| a.body.is_none_or(|x| !model.bodies[x].dynamic);
        let (a_fixed, b_fixed) = (fixed(&rope.a), fixed(&rope.b));
        if a_fixed == b_fixed {
            continue;
        }
        let Some(bg) = (if a_fixed { rope.b.body } else { rope.a.body }) else { continue };
        if bg == pg {
            continue;
        }
        let (pb, bb) = (&model.bodies[pg], &model.bodies[bg]);
        for x in [pb, bb] {
            let at = attached(model, &x.id);
            if at.ropes.len() != 1 || at.rods.len() + at.springs.len() + at.hinges.len() + at.forces.len() + at.extra > 0 {
                continue 'ropes;
            }
        }
        if pb.inv_inertia > 0.0 && model.pulleys[pidx].position.x.abs() > 1e-12 {
            continue;
        }
        let list = runs(r, &mut |seg| {
            if !seg.mode.taut[ri] {
                return None;
            }
            if !touching_units(&sys, &seg.mode, &pb.id).is_empty() || !touching_units(&sys, &seg.mode, &bb.id).is_empty() {
                return None;
            }
            let mut segs = Vec::new();
            rope_path_into(model, &compute_poses(model, &seg.x0), rope, Some(&mut segs));
            let u_in = segs[pi].0;
            let u_out = segs[pi + 1].0;
            let u_b = if a_fixed { segs[segs.len() - 1].0 } else { segs[0].0 };
            // The wheel hangs in the loop (rope comes down to it and goes up), B hangs below its segment
            if u_in.x.abs() > 1e-9 || u_out.x.abs() > 1e-9 || u_b.x.abs() > 1e-9 {
                return None;
            }
            if !(u_in.y < 0.0 && u_out.y > 0.0) {
                return None;
            }
            if if a_fixed { !(u_b.y < 0.0) } else { !(u_b.y > 0.0) } {
                return None;
            }
            Some(format!("mp:{}", ri))
        });
        for run in list {
            let view = r.v;
            let (t0, t1) = (run.t0, run.t1);
            let (pn, bn) = (pb.name.clone(), bb.name.clone());
            let (pm, bm) = (pb.mass, bb.mass);
            let (pix, bix) = (pb.index as usize, bb.index as usize);
            out.push(Situation {
                key: format!("mp:{}:{}", ri, js_num(t0)),
                ty: "movable-pulley",
                title: t!("{0}挂在动滑轮上，{1}挂在绳的另一端", pn.clone(), bn.clone()),
                t0,
                t1,
                t_event: None,
                bodies: vec![bb.id.clone(), pb.id.clone()],
                sample: Rc::new(move |s, t| {
                    let mut r = Rec::new(s, view);
                    let o = r.observe(t)?;
                    let a1 = -o.sol.acc[3 * bix + 1];
                    let a2 = o.sol.acc[3 * pix + 1];
                    Ok(Sample {
                        vars: vec![
                            ("m1", var(bm, "kg", "m_1", t!("{0}质量（绳端）", bn.clone()))),
                            ("m2", var(pm, "kg", "m_2", t!("{0}质量（动滑轮下）", pn.clone()))),
                            ("g", var(g, "m/s²", "g", t!("重力加速度"))),
                            ("a1sim", var(a1, "m/s²", "a_1", t!("{0}向下的加速度（仿真）", bn.clone()))),
                            ("a2sim", var(a2, "m/s²", "a_2", t!("{0}向上的加速度（仿真）", pn.clone()))),
                        ],
                        measures: vec![
                            ("a1", meas(Some(a1), "m/s²", t!("{0}向下的加速度", bn.clone()))),
                            ("a2", meas(Some(a2), "m/s²", t!("{0}向上的加速度", pn.clone()))),
                            ("T", meas(Some(o.sol.rope_tension[ri]), "N", t!("绳的拉力"))),
                        ],
                        conditions: vec![cond("vertical", t!("动滑轮两侧及绳端的绳竖直"), true, Text::empty())],
                    })
                }),
            });
        }
    }
    Ok(())
}

// ---- Movable wedge ----
fn wedge_situations(r: &mut Rec, out: &mut Vec<Situation>) -> SimResult<()> {
    let sys = r.sys.clone();
    let model = &sys.model;
    let (g, vertical) = gravity(model);
    if !vertical {
        return Ok(());
    }
    let n = sys.n;
    for &wg in &model.dynamic {
        for &ag in &model.dynamic {
            let (wb, ab) = (&model.bodies[wg], &model.bodies[ag]);
            if ag == wg || !attached(model, &ab.id).none() || !attached(model, &wb.id).none() {
                continue;
            }
            let (wi, ai) = (wb.index as usize, ab.index as usize);
            let list = runs(r, &mut |seg| {
                let ua = closed_units(&sys, &seg.mode, &ab.id);
                let uw = closed_units(&sys, &seg.mode, &wb.id);
                if ua.len() != 1 || other_body(&sys, ua[0], &ab.id) != wg || touching_units(&sys, &seg.mode, &ab.id).len() != 1 {
                    return None;
                }
                if uw.len() != 2 || touching_units(&sys, &seg.mode, &wb.id).len() != 2 {
                    return None;
                }
                let floor = *uw.iter().find(|u| !std::ptr::eq(**u, ua[0]))?;
                let sg = other_body(&sys, floor, &wb.id);
                if model.bodies[sg].dynamic || ua[0].friction != Friction::None || floor.friction != Friction::None {
                    return None;
                }
                let gw = unit_geometry(&sys, &seg.x0, floor, &wb.id);
                let ga = unit_geometry(&sys, &seg.x0, ua[0], &ab.id);
                if gw.theta > 1e-9 || ga.theta < 1e-6 || gw.belt != 0.0 {
                    return None;
                }
                if (wb.inv_inertia > 0.0 || ab.inv_inertia > 0.0) && (seg.x0[3 * n + 3 * wi + 2].abs() > 1e-12 || seg.x0[3 * n + 3 * ai + 2].abs() > 1e-12) {
                    return None;
                }
                if wb.inv_inertia > 0.0 || ab.inv_inertia > 0.0 {
                    return None;
                }
                Some(format!("wd:{}", model.bodies[sg].id))
            });
            for run in list {
                let seg0 = r.seg(run.segs[0]).clone();
                let ua = closed_units(&sys, &seg0.mode, &ab.id)[0].clone();
                let ga = unit_geometry(&sys, &seg0.x0, &ua, &ab.id);
                let theta = ga.theta;
                let sid = run.sig.split(':').nth(1).unwrap_or("").to_string();
                let sname = model.bodies.iter().find(|x| x.id == sid).map(|x| x.name.clone()).unwrap_or_default();
                let (am, wm) = (ab.mass, wb.mass);
                let px = move |x: &[f64]| am * x[3 * n + 3 * ai] + wm * x[3 * n + 3 * wi];
                let p0 = px(&seg0.x0);
                let view = r.v;
                let (t0, t1) = (run.t0, run.t1);
                let (an, wn) = (ab.name.clone(), wb.name.clone());
                let (aid, wid) = (ab.id.clone(), wb.id.clone());
                out.push(Situation {
                    key: format!("wd:{}:{}:{}", aid, wid, js_num(t0)),
                    ty: "wedge",
                    title: t!("{0}沿可动的{1}下滑（{2}光滑）", an.clone(), wn.clone(), sname),
                    t0,
                    t1,
                    t_event: None,
                    bodies: vec![aid.clone(), wid.clone()],
                    sample: Rc::new(move |s, t| {
                        let mut r = Rec::new(s, view);
                        let sys = r.sys.clone();
                        let o = r.observe(t)?;
                        let aw = o.sol.acc[3 * wi];
                        let (aax, aay) = (o.sol.acc[3 * ai], o.sol.acc[3 * ai + 1]);
                        let (relx, rely) = (aax - aw, aay);
                        let c = o.contact_forces(&sys, &aid, &wid);
                        Ok(Sample {
                            vars: vec![
                                ("M", var(wm, "kg", "M", t!("{0}质量", wn.clone()))),
                                ("m", var(am, "kg", "m", t!("{0}质量", an.clone()))),
                                ("theta", var(theta, "rad", "\\theta", t!("斜面倾角"))),
                                ("g", var(g, "m/s²", "g", t!("重力加速度"))),
                                ("p0x", var(p0, "kg·m/s", "p_{x0}", t!("本阶段开始时的水平总动量"))),
                            ],
                            measures: vec![
                                ("A", meas(Some(aw.abs()), "m/s²", t!("{0}的加速度大小", wn.clone()))),
                                ("arel", meas(Some((relx * relx + rely * rely).sqrt()), "m/s²", t!("{0}相对{1}的加速度大小", an.clone(), wn.clone()))),
                                ("N", meas(Some(c.n), "N", t!("{0}对{1}的支持力", wn.clone(), an.clone()))),
                                ("px", meas(Some(px(&o.x)), "kg·m/s", t!("水平总动量"))),
                            ],
                            conditions: vec![cond("smooth", t!("斜面与地面均光滑"), true, Text::empty()), cond("noRotation", t!("斜面与物块都不转动"), true, Text::empty())],
                        })
                    }),
                });
            }
        }
    }
    Ok(())
}

// ---- Two bodies joined by a spring ----
fn spring_pair_situations(r: &mut Rec, out: &mut Vec<Situation>) -> SimResult<()> {
    let sys = r.sys.clone();
    let model = &sys.model;
    let gv = model.settings.gravity;
    let n = sys.n;
    'springs: for (si, sp) in model.springs.iter().enumerate() {
        let (Some(ag), Some(bg)) = (sp.a.body, sp.b.body) else { continue };
        let (ab, bb) = (&model.bodies[ag], &model.bodies[bg]);
        if !ab.dynamic || !bb.dynamic || ag == bg || sp.damping != 0.0 {
            continue;
        }
        for x in [ab, bb] {
            let at = attached(model, &x.id);
            if at.springs.len() != 1 || at.ropes.len() + at.rods.len() + at.hinges.len() + at.forces.len() + at.extra > 0 {
                continue 'springs;
            }
        }
        let list = runs(r, &mut |seg| {
            for x in [ab, bb] {
                let us = closed_units(&sys, &seg.mode, &x.id);
                if touching_units(&sys, &seg.mode, &x.id).len() != us.len() {
                    return None;
                }
                for u in &us {
                    if u.friction != Friction::None || model.bodies[other_body(&sys, u, &x.id)].dynamic {
                        return None;
                    }
                    if unit_geometry(&sys, &seg.x0, u, &x.id).theta > 1e-9 {
                        return None;
                    }
                }
                if us.is_empty() && (gv.x != 0.0 || gv.y != 0.0) {
                    return None;
                }
            }
            Some(format!("sp2:{}", si))
        });
        let (ai, bi) = (ab.index as usize, bb.index as usize);
        for run in list {
            let x0 = r.seg(run.segs[0]).x0.clone();
            let (d0, d0ux, d0uy) = distance_kin(model, &compute_poses(model, &x0), &sp.a, &sp.b);
            // Axis from A towards B
            let (ux, uy) = (-d0ux, -d0uy);
            let v_along = move |x: &[f64], i: usize| x[3 * n + 3 * i] * ux + x[3 * n + 3 * i + 1] * uy;
            let v_perp = move |x: &[f64], i: usize| -x[3 * n + 3 * i] * uy + x[3 * n + 3 * i + 1] * ux;
            let one_dim = v_perp(&x0, ai).abs() < 1e-12 && v_perp(&x0, bi).abs() < 1e-12 && x0[3 * n + 3 * ai + 2].abs() < 1e-12 && x0[3 * n + 3 * bi + 2].abs() < 1e-12;
            if !one_dim {
                continue;
            }
            let (v1, v2) = (v_along(&x0, ai), v_along(&x0, bi));
            let xd0 = d0.value - sp.rest_length;
            type SpCache = (Option<(f64, f64, f64, f64)>, Option<f64>);
            let cache: Lazy<SpCache> = lazy();
            let view = r.v;
            let (t0, t1) = (run.t0, run.t1);
            let (am, bm, k, rest) = (ab.mass, bb.mass, sp.stiffness, sp.rest_length);
            let (an, bn) = (ab.name.clone(), bb.name.clone());
            out.push(Situation {
                key: format!("sp2:{}:{}", si, js_num(t0)),
                ty: "spring-pair",
                title: t!("{0}与{1}通过弹簧相互作用", an.clone(), bn.clone()),
                t0,
                t1,
                t_event: None,
                bodies: vec![ab.id.clone(), bb.id.clone()],
                sample: Rc::new(move |s, t| {
                    let mut r = Rec::new(s, view);
                    let sys = r.sys.clone();
                    let x = r.exact(t)?;
                    if cache.borrow().is_none() {
                        let ts = crossings(&mut r, &mut |_, x, _| Ok(v_along(x, ai) - v_along(x, bi)), t0, t1, 0, 3)?;
                        let mut ext = None;
                        if let Some(&te) = ts.first() {
                            let xe = r.exact(te)?;
                            let spm = &sys.model.springs[si];
                            let dx = distance_kin(&sys.model, &compute_poses(&sys.model, &xe), &spm.a, &spm.b).0.value - rest;
                            ext = Some((te, v_along(&xe, ai), 0.5 * k * dx * dx, dx));
                        }
                        *cache.borrow_mut() = Some((ext, if ts.len() >= 3 { Some(ts[2] - ts[0]) } else { None }));
                    }
                    let (ext, per) = cache.borrow().expect("measured");
                    Ok(Sample {
                        vars: vec![
                            ("m1", var(am, "kg", "m_1", t!("{0}质量", an.clone()))),
                            ("m2", var(bm, "kg", "m_2", t!("{0}质量", bn.clone()))),
                            ("k", var(k, "N/m", "k", t!("劲度系数"))),
                            ("v1", var(v1, "m/s", "v_1", t!("本段开始时{0}的速度（沿弹簧）", an.clone()))),
                            ("v2", var(v2, "m/s", "v_2", t!("本段开始时{0}的速度（沿弹簧）", bn.clone()))),
                            ("x0", var(xd0, "m", "x_0", t!("本段开始时弹簧的形变量"))),
                        ],
                        measures: vec![
                            ("p", meas(Some(am * v_along(&x, ai) + bm * v_along(&x, bi)), "kg·m/s", t!("沿弹簧方向的总动量"))),
                            ("vCommon", meas(ext.map(|e| e.1), "m/s", t!("形变最大时{0}的速度", an.clone()))),
                            ("EpMax", meas(ext.map(|e| e.2), "J", t!("弹性势能最大值"))),
                            ("xMax", meas(ext.map(|e| e.3.abs()), "m", t!("最大形变量"))),
                            ("T", meas_note(per, "s", t!("相对振动的周期"), if per.is_none() { Some(t!("记录时长不足一个周期")) } else { None })),
                        ],
                        conditions: vec![
                            cond("restStart", t!("本段开始时弹簧为原长"), xd0.abs() <= 1e-12 * js_max(1.0, rest), Text::Lit(format!("x₀ = {} m", js_to_precision(xd0, 3)))),
                            cond("smooth", t!("水平面光滑、无阻尼"), true, Text::empty()),
                        ],
                    })
                }),
            });
        }
    }
    Ok(())
}

// ---- Rolling with slipping ----
fn roll_slip_situations(r: &mut Rec, out: &mut Vec<Situation>) -> SimResult<()> {
    let sys = r.sys.clone();
    let model = &sys.model;
    let (g, vertical) = gravity(model);
    if !vertical {
        return Ok(());
    }
    for &bg in &model.dynamic {
        let b = &model.bodies[bg];
        let ShapeModel::Circle { radius: rr } = b.shape else { continue };
        if b.inv_inertia == 0.0 || !attached(model, &b.id).none() {
            continue;
        }
        let list = runs(r, &mut |seg| {
            let us = closed_units(&sys, &seg.mode, &b.id);
            if us.len() != 1 || touching_units(&sys, &seg.mode, &b.id).len() != 1 {
                return None;
            }
            let u = us[0];
            let og = other_body(&sys, u, &b.id);
            if model.bodies[og].dynamic || u.friction != Friction::Slide {
                return None;
            }
            let geo = unit_geometry(&sys, &seg.x0, u, &b.id);
            if geo.theta > 1e-9 || geo.belt != 0.0 {
                return None;
            }
            Some(format!("rs:{}", model.bodies[og].id))
        });
        let bi = b.index as usize;
        for run in list {
            let seg0 = r.seg(run.segs[0]).clone();
            let x0 = seg0.x0.clone();
            let s0 = body_vel(&sys, &x0, b);
            let oid = run.sig.split(':').nth(1).unwrap_or("").to_string();
            let oname = model.bodies.iter().find(|x| x.id == oid).map(|x| x.name.clone()).unwrap_or_default();
            let u = closed_units(&sys, &seg0.mode, &b.id)[0].clone();
            let mu_k = sys.pairs[u.pair].material.mu_k;
            let ukey = sys.pairs[u.pair].key.clone();
            let rolls = r.event_at(run.t1).is_some_and(|e| e.changes.iter().any(|c| c.kind() == crate::simulation::ChangeType::Stick && c.subject == ukey));
            let end = if rolls { Some(r.exact(run.t1)?) } else { None };
            let heat0 = pair_aux(&sys, &x0, &b.id, &oid).1;
            let uniform = (b.inertia - 0.5 * b.mass * rr * rr).abs() <= 1e-12 * b.inertia;
            let view = r.v;
            let (t0, t1) = (run.t0, run.t1);
            let (mass, inertia) = (b.mass, b.inertia);
            let (bid, oid2) = (b.id.clone(), oid.clone());
            out.push(Situation {
                key: format!("rs:{}:{}", b.id, js_num(t0)),
                ty: "roll-slip",
                title: t!("{0} 在{1}上边滚边滑", b.name.clone(), oname),
                t0,
                t1,
                t_event: None,
                bodies: vec![b.id.clone(), oid.clone()],
                sample: Rc::new(move |s, t| {
                    let mut r = Rec::new(s, view);
                    let sys = r.sys.clone();
                    let o = r.observe(t)?;
                    let v_end = end.as_ref().map(|e| body_vel(&sys, e, &sys.model.bodies[bg]).vx);
                    let heat_end = end.as_ref().map(|e| pair_aux(&sys, e, &bid, &oid2).1 - heat0);
                    Ok(Sample {
                        vars: vec![
                            ("m", var(mass, "kg", "m", t!("质量"))),
                            ("r", var(rr, "m", "r", t!("半径"))),
                            ("I", var(inertia, "kg·m²", "I", t!("对质心的转动惯量"))),
                            ("muK", var(mu_k, "", "\\mu_k", t!("动摩擦因数"))),
                            ("g", var(g, "m/s²", "g", t!("重力加速度"))),
                            ("v0", var(s0.vx, "m/s", "v_0", t!("本段开始时质心速度"))),
                            ("omega0", var(s0.w, "rad/s", "\\omega_0", t!("本段开始时角速度（逆时针为正）"))),
                        ],
                        measures: vec![
                            ("a", meas(Some(o.sol.acc[3 * bi]), "m/s²", t!("质心加速度"))),
                            ("beta", meas(Some(o.sol.acc[3 * bi + 2]), "rad/s²", t!("角加速度"))),
                            ("tEnd", meas(if rolls { Some(t1 - t0) } else { None }, "s", t!("开始纯滚动的时刻（自本段开始）"))),
                            ("vEnd", meas(v_end, "m/s", t!("开始纯滚动时的速度"))),
                            ("heatEnd", meas(heat_end, "J", t!("打滑阶段的摩擦生热"))),
                        ],
                        conditions: vec![
                            cond("rolls", t!("记录内转为纯滚动"), rolls, unless(rolls, t!("记录内未停止打滑"))),
                            cond("uniformDisc", t!("匀质圆柱（圆盘）I = ½mr²"), uniform, unless(uniform, t!("本例 I = {0} kg·m²", js_to_precision(inertia, 4)))),
                            cond("noSpin", t!("放上时不转动（ω₀ = 0）且 v₀ > 0"), s0.w.abs() <= 1e-12 && s0.vx > 0.0, Text::empty()),
                        ],
                    })
                }),
            });
        }
    }
    Ok(())
}

// ---- A body driven by a variable force ----
/// Recognizes F = F0·sin(ω·t) (either factor order) in the x component of a force expression.
fn sinusoid(node: &Node) -> Option<(f64, f64)> {
    let num_of = |x: &Node| match x {
        Node::Num(v) => Some(*v),
        Node::Neg(a) => match a.as_ref() {
            Node::Num(v) => Some(-*v),
            _ => None,
        },
        _ => None,
    };
    let Node::Bin(BinOp::Mul, l, rgt) = node else { return None };
    let pick = |k: &Node, c: &Node| -> Option<(f64, f64)> {
        let f0 = num_of(k)?;
        let Node::Call(fname, args) = c else { return None };
        if fname != "sin" {
            return None;
        }
        let Node::Bin(BinOp::Mul, al, ar) = &args[0] else { return None };
        let w = if matches!(al.as_ref(), Node::Var(v) if v == "t") {
            num_of(ar)
        } else if matches!(ar.as_ref(), Node::Var(v) if v == "t") {
            num_of(al)
        } else {
            None
        }?;
        Some((f0, w))
    };
    pick(l, rgt).or_else(|| pick(rgt, l))
}

/// Source text of the x component of a force connector of the scene document.
fn force_expr_x(doc: &serde_json::Value, id: &str) -> Option<String> {
    doc.get("connectors")?.as_array()?.iter().find(|c| c.get("id").and_then(|v| v.as_str()) == Some(id))?.get("expr")?.get("x")?.as_str().map(String::from)
}

fn variable_force_situations(r: &mut Rec, out: &mut Vec<Situation>) -> SimResult<()> {
    let sys = r.sys.clone();
    let model = &sys.model;
    let gv = model.settings.gravity;
    if gv.x != 0.0 {
        return Ok(());
    }
    let n = sys.n;
    for (fi, f) in model.forces.iter().enumerate() {
        let Some((ex, _)) = f.expr else { continue };
        let Some(bg) = f.a.body else { continue };
        let b = &model.bodies[bg];
        if !b.dynamic {
            continue;
        }
        let at = attached(model, &b.id);
        if at.forces.len() != 1 || at.ropes.len() + at.rods.len() + at.springs.len() + at.hinges.len() + at.extra > 0 {
            continue;
        }
        let src = force_expr_x(&r.s.meta.doc, &f.id).unwrap_or_default();
        let node = parse(&src).ok();
        let mut uses = Vec::new();
        if let Some(nd) = &node {
            crate::expr::variables(nd, &mut uses);
        }
        let time_only = uses.iter().all(|u| u == "t" || u == "m" || u == "g");
        let list = runs(r, &mut |seg| {
            let us = closed_units(&sys, &seg.mode, &b.id);
            if touching_units(&sys, &seg.mode, &b.id).len() != us.len() || us.len() > 1 {
                return None;
            }
            for u in &us {
                if u.friction != Friction::None || model.bodies[other_body(&sys, u, &b.id)].dynamic {
                    return None;
                }
                let geo = unit_geometry(&sys, &seg.x0, u, &b.id);
                if geo.theta > 1e-9 || geo.belt != 0.0 {
                    return None;
                }
            }
            Some(format!("vf:{}", fi))
        });
        let mass = b.mass;
        let gmag = (gv.x * gv.x + gv.y * gv.y).sqrt();
        let sw = node.as_ref().and_then(sinusoid);
        let bi = b.index as usize;
        for run in list {
            let seg0 = r.seg(run.segs[0]).clone();
            let x0 = seg0.x0.clone();
            let s0 = body_vel(&sys, &x0, b);
            let fid = f.id.clone();
            let breaks: Vec<f64> = r
                .events()
                .iter()
                .filter(|e| e.t > run.t0 && e.t < run.t1 && e.changes.iter().any(|c| c.kind() == crate::simulation::ChangeType::Switch && c.subject == fid))
                .map(|e| e.t)
                .collect();
            let w0 = x0[sys.aux_base + AUX_WORK];
            let no_vertical_work = s0.vy.abs() < 1e-12 && closed_units(&sys, &seg0.mode, &b.id).len() == 1;
            let view = r.v;
            let (t0, t1) = (run.t0, run.t1);
            let src2 = src.clone();
            out.push(Situation {
                key: format!("vf:{}:{}", fi, js_num(t0)),
                ty: "var-force",
                title: t!("{0} 受变力 {1} 作用", b.name.clone(), f.name.clone()),
                t0,
                t1,
                t_event: None,
                bodies: vec![b.id.clone()],
                sample: Rc::new(move |s, t| {
                    let mut r = Rec::new(s, view);
                    let sys = r.sys.clone();
                    let x = r.exact(t)?;
                    let fx = |tt: f64| {
                        let mut env = [0.0; ENV_SIZE];
                        env[8] = mass;
                        env[9] = gmag;
                        env[0] = tt;
                        sys.model.arena.eval(ex, &env, None)
                    };
                    let j = if time_only { integrate(&mut |tt| fx(tt), t0, t, &breaks, 1e-13) } else { f64::NAN };
                    let dx = if time_only { integrate(&mut |sv| (t - sv) * fx(sv), t0, t, &breaks, 1e-13) / mass } else { f64::NAN };
                    let mut vars = vec![
                        ("m", var(mass, "kg", "m", t!("质量"))),
                        ("v0", var(s0.vx, "m/s", "v_0", t!("本段开始时的速度 vₓ"))),
                        ("x0", var(s0.x, "m", "x_0", t!("本段开始时的位置 x"))),
                        ("t", var(t, "s", "t", t!("时刻"))),
                        ("t0", var(t0, "s", "t_0", t!("本段开始时刻"))),
                        ("J", var(j, "N·s", "I", t!("冲量 ∫Fₓdt（对表达式数值积分）"))),
                        ("dx", var(dx, "m", "\\Delta x_F", t!("(1/m)∫(t−s)Fₓ(s)ds（对表达式数值积分）"))),
                    ];
                    if let Some((f0, w)) = sw {
                        vars.push(("F0", var(f0, "N", "F_0", t!("力的幅值"))));
                        vars.push(("omega", var(w, "rad/s", "\\omega", t!("角频率"))));
                    }
                    Ok(Sample {
                        vars,
                        measures: vec![
                            ("dp", meas(Some(mass * (x[3 * n + 3 * bi] - s0.vx)), "N·s", t!("动量变化 mΔvₓ"))),
                            ("v", meas(Some(x[3 * n + 3 * bi]), "m/s", t!("速度 vₓ"))),
                            ("x", meas(Some(x[3 * bi]), "m", t!("位置 x"))),
                            ("W", meas(Some(x[sys.aux_base + AUX_WORK] - w0), "J", t!("变力做的功（能量账本）"))),
                        ],
                        conditions: vec![
                            cond("timeOnly", t!("Fₓ 只随时间变化"), time_only, unless(time_only, t!("Fₓ = {0} 含状态量，积分式不适用", src2.clone()))),
                            cond("sinusoid", Text::Lit("F = F₀ sin(ωt)".into()), sw.is_some(), if sw.is_some() { Text::empty() } else { Text::Lit(format!("Fₓ = {}", src2)) }),
                            cond("smooth", t!("水平方向只受该力（光滑水平面或悬空）"), true, Text::empty()),
                            cond("noVerticalWork", t!("竖直方向无位移（只有 Fₓ 做功）"), no_vertical_work, Text::empty()),
                        ],
                    })
                }),
            });
        }
    }
    Ok(())
}
