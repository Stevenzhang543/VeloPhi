//! Moreau–Jean time stepping, the reduced-accuracy fallback (port of `src/core/solver/moreau.ts`).

use crate::dynamics::{applied_forces_into, energy, limit_row, roll_radius, row_dot, row_minv_row, tol, Rates, System, AUX_BELT, AUX_DAMP, AUX_WORK};
use crate::js::{js_max, js_min};
use crate::kinematics::{compute_poses, contact_kin, equality_kins, roll_kin, rope_kin, slider_axis_kin, ContactKin, EqualityKind, Pose, RowJ};
use crate::message::SimResult;
use crate::modes::{in_region, pair_may_touch};
use crate::project::correction;

/// Steps per output interval.
pub const SUBSTEPS: usize = 4;
/// Gauss–Seidel sweeps per step.
pub const SWEEPS: usize = 60;
/// Penetration and joint drift left after the projection (m).
pub const SLOP: f64 = 1e-9;
/// Relative tangential speed treated as sticking (m/s).
pub const STICK_SPEED: f64 = 1e-6;

#[derive(Clone, Copy, PartialEq, Eq)]
enum PKind {
    Eq,
    Normal,
    Tangent,
}

struct PRow {
    j: RowJ,
    d: f64,
    target: f64,
    kind: PKind,
    normal: usize,
    mu: f64,
    lambda: f64,
    /// Bound |λ| ≤ lim of an equality row (the drive of a torque-limited motor, 26.52).
    lim: Option<f64>,
}

fn add_vel(sys: &System, v: &mut [f64], j: &RowJ, dl: f64) {
    let im = &sys.model.dyn_inv_mass;
    let ii = &sys.model.dyn_inv_inertia;
    if j.ai >= 0 {
        let a = j.ai as usize;
        v[3 * a] += im[a] * j.ax * dl;
        v[3 * a + 1] += im[a] * j.ay * dl;
        v[3 * a + 2] += ii[a] * j.aw * dl;
    }
    if j.bi >= 0 {
        let b = j.bi as usize;
        v[3 * b] += im[b] * j.bx * dl;
        v[3 * b + 1] += im[b] * j.by * dl;
        v[3 * b + 2] += ii[b] * j.bw * dl;
    }
    for t in &j.ex {
        let i = t.i as usize;
        v[3 * i] += im[i] * t.x * dl;
        v[3 * i + 1] += im[i] * t.y * dl;
        v[3 * i + 2] += ii[i] * t.w * dl;
    }
}

fn contact_candidates(sys: &System, poses: &[Pose], h: f64, v_star: &[f64]) -> Vec<(usize, ContactKin, usize)> {
    let model = &sys.model;
    let mut out = Vec::new();
    for pair in &sys.pairs {
        let a = &poses[pair.x];
        let b = &poses[pair.y];
        let reach = h
            * (a.vx.abs()
                + a.vy.abs()
                + a.w.abs() * model.bodies[pair.x].bound
                + b.vx.abs()
                + b.vy.abs()
                + b.w.abs() * model.bodies[pair.y].bound
                + model.accel_scale * h);
        if !pair_may_touch(sys, pair, poses, 2.0 * reach + 1e-6) {
            continue;
        }
        let start = out.len();
        for (fi, f) in pair.features.iter().enumerate() {
            let k = contact_kin(model, f, poses);
            if !in_region(&k) || k.gap < -0.05 {
                continue;
            }
            if k.gap > tol::TOUCH && k.gap + h * js_min(k.vn, row_dot(&k.jn, v_star, 0)) > 0.0 {
                continue;
            }
            let dup = out[start..].iter().any(|(_, o, _): &(usize, ContactKin, usize)| (o.cx - k.cx).abs() <= 1e-9 && (o.cy - k.cy).abs() <= 1e-9);
            if dup {
                continue;
            }
            out.push((pair.index, k, fi));
        }
    }
    out
}

/// Result of one Moreau–Jean step.
pub struct MoreauStepResult {
    pub x: Vec<f64>,
    pub loss: f64,
}

/// One Moreau–Jean step of size h from state X.
// `!(a > b)` is not `a <= b`: NaN takes the negated branch, as in the TypeScript source
#[allow(clippy::neg_cmp_op_on_partial_ord)]
pub fn moreau_step(sys: &System, x: &[f64], h: f64) -> SimResult<MoreauStepResult> {
    let model = &sys.model;
    let n = sys.n;
    let poses = compute_poses(model, x);
    let mut rates = Rates::default();
    rates.reset(sys.pairs.len());
    let mut q = Vec::new();
    applied_forces_into(sys, &poses, Some(&mut rates), x, None, &mut q)?;
    let e0 = energy(sys, x, &poses).total;
    let mut v = x[3 * n..6 * n].to_vec();
    for i in 0..n {
        let im = model.dyn_inv_mass[i];
        let ii = model.dyn_inv_inertia[i];
        v[3 * i] += h * q[3 * i] * im;
        v[3 * i + 1] += h * q[3 * i + 1] * im;
        v[3 * i + 2] += h * q[3 * i + 2] * ii;
    }
    let mut rows: Vec<PRow> = Vec::new();
    // Equality rows keep their velocity target: 0, or a motor's speed (vel = J·v − speed)
    let mut drives: Vec<usize> = Vec::new();
    for e in equality_kins(model, &poses) {
        if e.kind == EqualityKind::Drive {
            drives.push(rows.len());
        }
        let target = if e.kind == EqualityKind::Drive { model.motors[e.owner].speed } else { 0.0 };
        let d = row_minv_row(model, &e.kin.j, &e.kin.j);
        let lim = if e.kind == EqualityKind::Drive && model.motors[e.owner].limited { Some(h * model.motors[e.owner].max_torque) } else { None };
        rows.push(PRow { j: e.kin.j, d, target, kind: PKind::Eq, normal: usize::MAX, mu: 0.0, lambda: 0.0, lim });
    }
    for r in &model.ropes {
        let (k, _) = rope_kin(model, &poses, r);
        if k.value > tol::TOUCH && k.value + 2.0 * h * k.vel > 0.0 {
            continue;
        }
        let d = row_minv_row(model, &k.j, &k.j);
        let target = if k.value > tol::TOUCH { -k.value / h } else { 0.0 };
        rows.push(PRow { j: k.j, d, target, kind: PKind::Normal, normal: usize::MAX, mu: 0.0, lambda: 0.0, lim: None });
    }
    let v_rest = js_max(tol::ZENO, 2.0 * model.accel_scale * h);
    for (pi, k, fi) in contact_candidates(sys, &poses, h, &v) {
        let pair = &sys.pairs[pi];
        let reaches = k.gap <= tol::TOUCH || k.gap + h * k.vn <= 0.0;
        let e = if k.vn < -v_rest { pair.material.restitution } else { 0.0 };
        let target = if reaches { js_max(-e * k.vn, if k.gap > tol::TOUCH { -k.gap / h } else { 0.0 }) } else { -k.gap / h };
        let ni = rows.len();
        let d = row_minv_row(model, &k.jn, &k.jn);
        rows.push(PRow { j: k.jn.clone(), d, target, kind: PKind::Normal, normal: usize::MAX, mu: 0.0, lambda: 0.0, lim: None });
        let mat = pair.material;
        if mat.mu_s > 0.0 || mat.mu_k > 0.0 {
            let belt = k.vt - row_dot(&k.jt, x, 3 * n);
            let mu = if k.vt.abs() <= STICK_SPEED { js_max(mat.mu_s, mat.mu_k) } else { mat.mu_k };
            let d = row_minv_row(model, &k.jt, &k.jt);
            rows.push(PRow { j: k.jt.clone(), d, target: -belt, kind: PKind::Tangent, normal: ni, mu, lambda: 0.0, lim: None });
        }
        // 26.52: rolling resistance, a friction-like row on the relative rolling
        let crr = pair.material.rolling;
        if crr > 0.0 {
            let f = &pair.features[fi];
            let rr = roll_radius(model, f);
            if rr > 0.0 {
                let rk = roll_kin(model, &poses, f.a.body, f.b_body());
                let d = row_minv_row(model, &rk.j, &rk.j);
                rows.push(PRow { j: rk.j, d, target: 0.0, kind: PKind::Tangent, normal: ni, mu: crr * rr, lambda: 0.0, lim: None });
            }
        }
    }
    // 26.52: slider end stops that touch or that the motion reaches within the step
    if model.has_limits {
        for (k, sl) in model.sliders.iter().enumerate() {
            if !sl.limited {
                continue;
            }
            let kin = slider_axis_kin(model, &poses, sl);
            for side in [-1i8, 1] {
                if if side < 0 { !(sl.lo > f64::NEG_INFINITY) } else { !(sl.hi < f64::INFINITY) } {
                    continue;
                }
                let row = limit_row(sl, k, side, &kin);
                if row.value > tol::TOUCH && row.value + 2.0 * h * row.vel > 0.0 {
                    continue;
                }
                let reaches = row.value <= tol::TOUCH || row.value + h * row.vel <= 0.0;
                let e = if row.vel < -v_rest { sl.e } else { 0.0 };
                let target = if reaches { js_max(-e * row.vel, if row.value > tol::TOUCH { -row.value / h } else { 0.0 }) } else { -row.value / h };
                let d = row_minv_row(model, &row.j, &row.j);
                rows.push(PRow { j: row.j, d, target, kind: PKind::Normal, normal: usize::MAX, mu: 0.0, lambda: 0.0, lim: None });
            }
        }
    }
    for _ in 0..SWEEPS {
        for ri in 0..rows.len() {
            let r = &rows[ri];
            if !(r.d > 0.0) {
                continue;
            }
            let vel = row_dot(&r.j, &v, 0);
            let mut next = r.lambda + (r.target - vel) / r.d;
            if r.kind == PKind::Normal {
                next = js_max(0.0, next);
            } else if r.kind == PKind::Tangent {
                let lim = r.mu * rows[r.normal].lambda;
                next = js_min(lim, js_max(-lim, next));
            } else if let Some(lim) = r.lim {
                next = js_min(lim, js_max(-lim, next));
            }
            let dl = next - r.lambda;
            if dl != 0.0 {
                add_vel(sys, &mut v, &rows[ri].j, dl);
                rows[ri].lambda = next;
            }
        }
    }
    // Motor work (26.51): torque motors (their power over the step) and the impulses of speed drives at their speed
    let mut motor = h * rates.belt_work;
    for &k in &drives {
        motor += rows[k].lambda * rows[k].target;
    }
    let mut y = x.to_vec();
    for k in 0..3 * n {
        y[3 * n + k] = v[k];
        y[k] = x[k] + h * v[k];
    }
    y[sys.aux_base + AUX_WORK] = x[sys.aux_base + AUX_WORK] + h * rates.applied_work;
    y[sys.aux_base + AUX_DAMP] = x[sys.aux_base + AUX_DAMP] + h * rates.damping;
    if motor != 0.0 {
        y[sys.aux_base + AUX_BELT] = x[sys.aux_base + AUX_BELT] + motor;
    }
    if let Some(ts) = sys.time_slot {
        y[ts] = x[ts] + h;
    }
    // 26.55: ledger extras of field regions, liquids and rail loops
    if let Some(e) = sys.extra_slot {
        for k in 0..crate::regions::EXTRA_LEN {
            y[e + k] = x[e + k] + h * rates.extra[k];
        }
    }
    let z = project_positions(sys, y);
    let poses1 = compute_poses(model, &z);
    let e1 = energy(sys, &z, &poses1).total;
    // Scenes without motors keep the expression of 26.50 (bit for bit)
    let loss = if motor != 0.0 { e0 + h * rates.applied_work + motor - h * rates.damping - e1 } else { e0 + h * rates.applied_work - h * rates.damping - e1 };
    Ok(MoreauStepResult { x: z, loss })
}

/// Remove penetration, joint drift and rope overstretch (positions only).
fn project_positions(sys: &System, x_in: Vec<f64>) -> Vec<f64> {
    let model = &sys.model;
    let n = sys.n;
    let mut x = x_in;
    for _ in 0..6 {
        let poses = compute_poses(model, &x);
        let mut rows: Vec<(RowJ, f64)> = Vec::new();
        for e in equality_kins(model, &poses) {
            if e.holonomic && e.kin.value.abs() > SLOP {
                rows.push((e.kin.j, e.kin.value));
            }
        }
        for r in &model.ropes {
            let (k, _) = rope_kin(model, &poses, r);
            if k.value < -SLOP {
                rows.push((k.j, k.value));
            }
        }
        // 26.52: slider end stops
        if model.has_limits {
            for (k, sl) in model.sliders.iter().enumerate() {
                if !sl.limited {
                    continue;
                }
                let kin = slider_axis_kin(model, &poses, sl);
                if kin.value - sl.lo < -SLOP {
                    let r = limit_row(sl, k, -1, &kin);
                    rows.push((r.j, r.value));
                } else if sl.hi - kin.value < -SLOP {
                    let r = limit_row(sl, k, 1, &kin);
                    rows.push((r.j, r.value));
                }
            }
        }
        for pair in &sys.pairs {
            if !pair_may_touch(sys, pair, &poses, 1e-6) {
                continue;
            }
            let mut seen: Vec<(f64, f64)> = Vec::new();
            for f in &pair.features {
                let k = contact_kin(model, f, &poses);
                if !in_region(&k) || k.gap >= -SLOP || k.gap < -0.05 {
                    continue;
                }
                if seen.iter().any(|p| (p.0 - k.cx).abs() <= 1e-9 && (p.1 - k.cy).abs() <= 1e-9) {
                    continue;
                }
                seen.push((k.cx, k.cy));
                rows.push((k.jn, k.gap));
            }
        }
        if rows.is_empty() {
            break;
        }
        let refs: Vec<(&RowJ, f64)> = rows.iter().map(|r| (&r.0, r.1)).collect();
        let Some(d) = correction(sys, &refs) else { break };
        for k in 0..3 * n {
            x[k] += d[k];
        }
    }
    x
}
