//! 26.62 (D220): a body on a fixed circular track — on the inside (vertical loop, bowl, quarter arc) and on the outside
//! (hump bridge, dome). The track is a static body touched through a round feature: an arc's concave inner side
//! (`FeatureB::Hollow`) or a convex circle (a fixed disc, an arc's outer side). Only gravity and the normal force act
//! (smooth contact, nothing attached), so mechanical energy is conserved and the formulas of the vertical circle apply
//! with the path radius ρ (the circle the body's centre moves on: the track radius ∓ the body's radius).
//!
//! Inside ("arc-inside"): N − mg cos φ = mv²/ρ with φ from the lowest point; the track can only push, like a rope can
//! only pull — the body goes round when v₀² ≥ 5gρ and leaves above the centre when 2gρ < v₀² < 5gρ.
//! Outside ("arc-outside"): mg cos θ − N = mv²/ρ with θ from the top; it leaves where N = 0,
//! cos θ = (v_t²/(gρ) + 2)/3 (v_t: the speed at the top by energy), at once when v_t ≥ √(gρ).
use std::rc::Rc;

use super::*;
use crate::js::{js_num, js_to_precision};
use crate::kinematics::{compute_poses, FeatureB, PointFeature};
use super::situations::{lazy, Lazy};
use crate::model::ShapeModel;
use crate::t;

/// The circle a body touches: centre (world), whether the body is inside it, the static body's id.
struct Track {
    inside: bool,
    cx: f64,
    cy: f64,
    other: String,
}

fn world(sys: &System, x: &[f64], p: &PointFeature) -> (f64, f64) {
    let poses = compute_poses(&sys.model, x);
    let q = &poses[p.body];
    (q.x + q.c * p.local.x - q.s * p.local.y, q.y + q.s * p.local.x + q.c * p.local.y)
}

/// The fixed circle of the single contact unit `u` of body `id`, when its reference feature is round.
fn track_of(sys: &System, x: &[f64], u: &UnitMode, id: &str) -> Option<Track> {
    let model = &sys.model;
    let f = sys.pairs[u.pair].features.get(u.ref_)?;
    let a_is_body = model.bodies[f.a.body].id == id;
    let (circle, inside) = match &f.b {
        FeatureB::Hollow(p) if a_is_body => (p, true),
        FeatureB::Point(p, _) if a_is_body && p.radius > 0.0 => (p, false),
        FeatureB::Point(p, _) if !a_is_body && model.bodies[p.body].id == id && f.a.radius > 0.0 => (&f.a, false),
        _ => return None,
    };
    let ob = &model.bodies[circle.body];
    if ob.dynamic {
        return None;
    }
    let (cx, cy) = world(sys, x, circle);
    Some(Track { inside, cx, cy, other: ob.id.clone() })
}

pub fn situations2662(r: &mut Rec, out: &mut Vec<Situation>) -> SimResult<()> {
    let sys = r.sys.clone();
    let model = &sys.model;
    let (g, vertical) = gravity(model);
    if !vertical || g <= 0.0 {
        return Ok(());
    }
    let n = sys.n;
    for &bg in &model.dynamic {
        let b = &model.bodies[bg];
        // A round body or a point, nothing attached
        if !matches!(b.shape, ShapeModel::Circle { .. }) || !attached(model, &b.id).none() {
            continue;
        }
        let bid = b.id.clone();
        let list = runs(r, &mut |seg| {
            let us = closed_units(&sys, &seg.mode, &bid);
            if us.len() != 1 || touching_units(&sys, &seg.mode, &bid).len() != 1 {
                return None;
            }
            let tr = track_of(&sys, &seg.x0, us[0], &bid)?;
            if sys.pairs[us[0].pair].material.mu_k > 0.0 || sys.pairs[us[0].pair].material.mu_s > 0.0 {
                return None;
            }
            Some(format!("arc:{}:{}:{}", bid, tr.other, if tr.inside { "in" } else { "out" }))
        });
        let bi = b.index as usize;
        for run in list {
            if run.t1 - run.t0 < 1e-9 {
                continue;
            }
            let x0 = r.seg(run.segs[0]).x0.clone();
            let us = closed_units(&sys, &r.seg(run.segs[0]).mode, &bid).into_iter().cloned().collect::<Vec<_>>();
            let Some(tr) = us.first().and_then(|u| track_of(&sys, &x0, u, &bid)) else { continue };
            let (cx, cy, inside, other) = (tr.cx, tr.cy, tr.inside, tr.other.clone());
            let s0 = body_vel(&sys, &x0, b);
            let rho = ((s0.x - cx).powi(2) + (s0.y - cy).powi(2)).sqrt();
            if rho <= 1e-9 {
                continue;
            }
            let v2 = s0.vx * s0.vx + s0.vy * s0.vy;
            // Inside: speed at the lowest point; outside: at the top (both by energy)
            let vref2 = if inside { v2 + 2.0 * g * (s0.y - (cy - rho)) } else { v2 - 2.0 * g * ((cy + rho) - s0.y) };
            if vref2 < -1e-9 * g * rho {
                continue;
            }
            let vref = vref2.max(0.0).sqrt();
            let phi_of = move |x: &[f64]| if inside { atan2((x[3 * bi] - cx).abs(), cy - x[3 * bi + 1]) } else { atan2((x[3 * bi] - cx).abs(), x[3 * bi + 1] - cy) };
            let phi0 = phi_of(&x0);
            let speed = move |x: &[f64]| (sq(x[3 * n + 3 * bi]) + sq(x[3 * n + 3 * bi + 1])).sqrt();
            // The run ends with the body leaving the track (a separation of this pair)
            let leave = r
                .event_at(run.t1)
                .filter(|e| e.changes.iter().any(|c| c.kind() == crate::simulation::ChangeType::Separate && ((c.bodies.iter().any(|x| x == &bid) && c.bodies.iter().any(|x| x == &other)) || (c.subject.contains(bid.as_str()) && c.subject.contains(other.as_str())))))
                .map(|e| e.before.clone());
            type ArcCache = (Option<(f64, f64)>, Option<(f64, f64)>);
            let cache: Lazy<ArcCache> = lazy();
            let view = r.v;
            let (t0, t1) = (run.t0, run.t1);
            let (bid2, oid2) = (bid.clone(), other.clone());
            // (speed, normal force) at the lowest and at the highest point of the circle the run passes
            let measure = move |s: &mut Session, cache: &Lazy<ArcCache>| -> SimResult<ArcCache> {
                if let Some(c) = *cache.borrow() {
                    return Ok(c);
                }
                let mut r = Rec::new(s, view);
                let at = |r: &mut Rec, t: f64| -> SimResult<(f64, f64)> {
                    let o = r.observe(t)?;
                    Ok((speed(&o.x), o.contact_forces(&r.sys, &bid2, &oid2).n))
                };
                let (mut low, mut high) = (None, None);
                if phi0.abs() < 1e-9 {
                    let v = at(&mut r, t0)?;
                    if inside { low = Some(v) } else { high = Some(v) }
                }
                for tc in crossings(&mut r, &mut |_, x, _| Ok(x[3 * bi] - cx), t0, t1, 0, 8)? {
                    let below = r.exact(tc)?[3 * bi + 1] < cy;
                    if below && low.is_none() {
                        low = Some(at(&mut r, tc)?);
                    }
                    if !below && high.is_none() {
                        high = Some(at(&mut r, tc)?);
                    }
                }
                // A track that ends exactly at the lowest point (a quarter arc onto the floor)
                if low.is_none() && inside {
                    let x = r.exact(t1)?;
                    if (x[3 * bi] - cx).abs() <= 1e-7 * rho.max(1.0) && x[3 * bi + 1] < cy {
                        let tb = t1 - 1e-9 * (t1 - t0).max(1e-9);
                        low = Some(at(&mut r, tb)?);
                    }
                }
                let c = (low, high);
                *cache.borrow_mut() = Some(c);
                Ok(c)
            };
            let mass = b.mass;
            let leave_phi = leave.as_ref().map(|x| phi_of(x));
            let leave_h = leave.as_ref().map(|x| x[3 * bi + 1] - cy);
            let leave_v = leave.as_ref().map(|x| speed(x));
            let left = leave.is_some();
            let common = move || {
                vec![
                    ("rho", var(rho, "m", "\\rho", t!("轨迹半径（圆心到物体中心）"))),
                    ("m", var(mass, "kg", "m", t!("质量"))),
                    ("g", var(g, "m/s²", "g", t!("重力加速度"))),
                ]
            };
            if inside {
                let full = vref2 >= 5.0 * g * rho * (1.0 - 1e-9);
                out.push(Situation {
                    key: format!("arcin:{}:{}", bid, js_num(t0)),
                    ty: "arc-inside",
                    title: t!("{0} 沿圆轨道内侧运动", b.name.clone()),
                    t0,
                    t1,
                    t_event: None,
                    bodies: vec![bid.clone(), other.clone()],
                    sample: Rc::new(move |s, _t| {
                        let m = measure(s, &cache)?;
                        let mut vars = common();
                        vars.push(("v0", var_derived(vref, "m/s", "v_0", t!("最低点速率（由本段机械能推算）"))));
                        vars.push(("phi0", var_phase(phi0, "rad", "\\varphi_0", t!("本段起点的位置角（自最低点）"))));
                        if let Some(p) = leave_phi {
                            vars.push(("phiS", var_sim(p, "rad", "\\varphi_s", t!("脱离处的位置角（仿真）"))));
                        }
                        let crit = (5.0 * g * rho).sqrt();
                        Ok(Sample {
                            vars,
                            measures: vec![
                                ("NBottom", meas(m.0.map(|x| x.1), "N", t!("最低点轨道的支持力"))),
                                ("vTop", meas(m.1.map(|x| x.0), "m/s", t!("最高点速率"))),
                                ("NTop", meas(m.1.map(|x| x.1), "N", t!("最高点轨道的支持力"))),
                                ("v0crit", meas_note(None, "m/s", t!("临界初速度"), Some(t!("临界值：与本例 v₀ = {0} m/s 比较", js_to_precision(vref, 4))))),
                                ("vLeave", meas(leave_v, "m/s", t!("脱离轨道时的速率"))),
                                ("hLeave", meas(leave_h, "m", t!("脱离点高出圆心"))),
                            ],
                            conditions: vec![
                                cond("fullCircle", t!("能通过最高点（v₀ ≥ √(5gρ) = {0} m/s）", js_to_precision(crit, 4)), full, t!("本例 v₀ = {0} m/s", js_to_precision(vref, 4))),
                                cond("leaves", t!("在上半圆脱离轨道（√(2gρ) < v₀ < √(5gρ)）"), left && !full, unless(left, t!("记录内没有脱离轨道"))),
                                cond("atBottom", t!("经过最低点"), m.0.is_some(), unless(m.0.is_some(), t!("本段未经过最低点"))),
                                cond("reachesTop", t!("到达最高点"), m.1.is_some(), unless(m.1.is_some(), t!("本段未到达最高点"))),
                            ],
                        })
                    }),
                });
            } else {
                out.push(Situation {
                    key: format!("arcout:{}:{}", bid, js_num(t0)),
                    ty: "arc-outside",
                    title: t!("{0} 沿圆弧外侧运动", b.name.clone()),
                    t0,
                    t1,
                    t_event: None,
                    bodies: vec![bid.clone(), other.clone()],
                    sample: Rc::new(move |s, _t| {
                        let m = measure(s, &cache)?;
                        let mut vars = common();
                        vars.push(("vt", var_derived(vref, "m/s", "v_t", t!("最高点速率（由本段机械能推算）"))));
                        vars.push(("theta0", var_phase(phi0, "rad", "\\theta_0", t!("本段起点的位置角（自最高点）"))));
                        let crit = (g * rho).sqrt();
                        Ok(Sample {
                            vars,
                            measures: vec![
                                ("NTop", meas(m.1.map(|x| x.1), "N", t!("最高点轨道的支持力"))),
                                ("vtCrit", meas_note(None, "m/s", t!("在最高点就离开的临界速率"), Some(t!("临界值：与本例 v_t = {0} m/s 比较", js_to_precision(vref, 4))))),
                                ("thetaLeave", meas(leave_phi, "rad", t!("脱离处的位置角（自最高点）"))),
                                ("vLeave", meas(leave_v, "m/s", t!("脱离轨道时的速率"))),
                                ("hLeave", meas(leave_h, "m", t!("脱离点高出圆心"))),
                            ],
                            conditions: vec![
                                cond("atTop", t!("经过最高点"), m.1.is_some(), unless(m.1.is_some(), t!("本段未经过最高点"))),
                                cond("leaves", t!("在圆弧上脱离（N 减小到零）"), left, unless(left, t!("记录内没有脱离圆弧"))),
                                cond("below", t!("最高点速率小于 √(gρ) = {0} m/s，先沿圆弧滑下", js_to_precision(crit, 4)), vref < crit, t!("本例 v_t = {0} m/s", js_to_precision(vref, 4))),
                            ],
                        })
                    }),
                });
            }
        }
    }
    Ok(())
}
