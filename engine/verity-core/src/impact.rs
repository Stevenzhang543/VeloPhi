//! Impacts (port of `src/core/solver/impact.ts`): Newton's restitution law for all touching contacts at once,
//! Stronge's energetic impact with Coulomb friction for a single frictional contact.

use crate::dynamics::{add_row, kinetic_energy, row_dot, row_minv_row, tol, System};
use crate::js::js_max;
use crate::kinematics::{compute_poses, equality_kins, rope_kin, ContactKin, RowJ};
use crate::linalg::solve_dense;
use crate::message::Message;
use crate::modes::touching_features;

/// Kind of an impact point.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ImpactKind {
    Contact,
    Rope,
}

/// One contact or rope in an impact.
#[derive(Clone, Debug)]
pub struct ImpactPoint {
    pub kind: ImpactKind,
    /// Pair index (contacts), None for ropes.
    pub pair: Option<usize>,
    /// Feature index in the pair (contacts).
    pub feature: Option<usize>,
    /// Rope index for a rope, −1 for a contact.
    pub rope: i32,
    pub vn_before: f64,
    pub vn_after: f64,
    pub impulse: f64,
    pub restitution: f64,
    pub cx: f64,
    pub cy: f64,
    pub nx: f64,
    pub ny: f64,
    pub tangent_impulse: Option<f64>,
    pub vt_before: Option<f64>,
    pub vt_after: Option<f64>,
    /// 'slip' | 'stick' | 'reverse'
    pub friction: Option<&'static str>,
}

/// Result of an impact.
#[derive(Clone, Debug)]
pub struct ImpactResult {
    pub x: Vec<f64>,
    pub points: Vec<ImpactPoint>,
    pub energy_before: f64,
    pub energy_after: f64,
    pub loss: f64,
    pub warning: Option<Message>,
}

struct IRow {
    j: RowJ,
    u: f64,
    target: f64,
    unilateral: bool,
    approach: bool,
    info: Option<ImpactPoint>,
    kin: Option<ContactKin>,
}

/// Warning recorded when friction impulses are left out of a multi-point impact.
pub fn multi_impact_warning() -> Message {
    Message::new("warn.multiImpactFriction")
}

/// Whether some touching contact or rope at full length is approaching.
pub fn approaching(sys: &System, x: &[f64]) -> bool {
    let poses = compute_poses(&sys.model, x);
    for t in touching_features(sys, &poses) {
        if t.kin.vn < -tol::VEL {
            return true;
        }
    }
    for r in &sys.model.ropes {
        let (k, _) = rope_kin(&sys.model, &poses, r);
        if k.value <= tol::TOUCH && k.vel < -tol::VEL {
            return true;
        }
    }
    false
}

fn advance(digits: &mut [u8]) -> bool {
    let mut k = digits.len() as isize - 1;
    while k >= 0 {
        let ku = k as usize;
        digits[ku] += 1;
        if digits[ku] < 2 {
            return true;
        }
        digits[ku] = 0;
        k -= 1;
    }
    false
}

/// Warning recorded when Newton's law at several points at once would add energy and the impact is made plastic.
pub fn multi_impact_plastic_warning() -> Message {
    Message::new("warn.multiImpactPlastic")
}

/// Resolve the impact at state X; None when nothing approaches. When the frictionless result of a multi-point
/// impact would add kinetic energy, the impact is solved again as plastic (26.51, D37).
pub fn resolve_impact(sys: &System, x: &[f64]) -> Option<ImpactResult> {
    let poses = compute_poses(&sys.model, x);
    let mut rows = impact_rows(sys, &poses, false)?;
    let res = solve_impact(sys, x, &mut rows);
    if res.frictionless && res.active >= 2 && res.result.energy_after > res.result.energy_before + 1e-12 * js_max(1.0, res.result.energy_before) {
        let mut plastic_rows = impact_rows(sys, &poses, true).expect("approaching rows found above");
        let mut plastic = solve_impact(sys, x, &mut plastic_rows);
        plastic.result.warning = Some(multi_impact_plastic_warning());
        return Some(plastic.result);
    }
    Some(res.result)
}

/// The rows of an impact; None when nothing approaches.
fn impact_rows(sys: &System, poses: &[crate::kinematics::Pose], plastic: bool) -> Option<Vec<IRow>> {
    let model = &sys.model;
    let mut rows: Vec<IRow> = Vec::new();
    // Equality constraints (hinges, rods and the connectors of 26.51) stay satisfied at velocity level
    for e in equality_kins(model, poses) {
        rows.push(IRow { j: e.kin.j, u: e.kin.vel, target: 0.0, unilateral: false, approach: false, info: None, kin: None });
    }
    let mut any = false;
    for t in touching_features(sys, poses) {
        let u = t.kin.vn;
        let approach = u < -tol::VEL;
        if approach {
            any = true;
        }
        let e = if approach && -u >= tol::ZENO && !plastic { sys.pairs[t.pair].material.restitution } else { 0.0 };
        let info = ImpactPoint {
            kind: ImpactKind::Contact,
            pair: Some(t.pair),
            feature: Some(t.feature),
            rope: -1,
            vn_before: u,
            vn_after: u,
            impulse: 0.0,
            restitution: e,
            cx: t.kin.cx,
            cy: t.kin.cy,
            nx: t.kin.nx,
            ny: t.kin.ny,
            tangent_impulse: None,
            vt_before: None,
            vt_after: None,
            friction: None,
        };
        rows.push(IRow { j: t.kin.jn.clone(), u, target: if approach { -e * u } else { 0.0 }, unilateral: true, approach, info: Some(info), kin: Some(t.kin) });
    }
    for (k, r) in model.ropes.iter().enumerate() {
        let (rk, path) = rope_kin(model, poses, r);
        if rk.value > tol::TOUCH {
            continue;
        }
        let approach = rk.vel < -tol::VEL;
        if approach {
            any = true;
        }
        let pa = path.first_point;
        let info = ImpactPoint {
            kind: ImpactKind::Rope,
            pair: None,
            feature: None,
            rope: k as i32,
            vn_before: rk.vel,
            vn_after: rk.vel,
            impulse: 0.0,
            restitution: 0.0,
            cx: pa.x,
            cy: pa.y,
            nx: path.u1.x,
            ny: path.u1.y,
            tangent_impulse: None,
            vt_before: None,
            vt_after: None,
            friction: None,
        };
        rows.push(IRow { j: rk.j, u: rk.vel, target: 0.0, unilateral: true, approach, info: Some(info), kin: None });
    }
    if any {
        Some(rows)
    } else {
        None
    }
}

struct Solved {
    result: ImpactResult,
    frictionless: bool,
    active: usize,
}

/// Solve an impact: the frictionless impulses, then friction (one point: Stronge; several: multi_friction).
fn solve_impact(sys: &System, x: &[f64], rows: &mut [IRow]) -> Solved {
    let model = &sys.model;
    let n = sys.n;
    let m = rows.len();
    let mut w = vec![0.0; m * m];
    for r in 0..m {
        for k in 0..m {
            w[r * m + k] = row_minv_row(model, &rows[r].j, &rows[k].j);
        }
    }
    let uni: Vec<usize> = (0..m).filter(|&i| rows[i].unilateral).collect();
    let mut digits = vec![0u8; uni.len()];
    let mut best_p: Option<Vec<f64>> = None;
    let mut best_violation = f64::INFINITY;
    let scale_p = {
        let mut s = 0.0;
        for r in rows.iter() {
            for &bg in &model.dynamic {
                s = js_max(s, model.bodies[bg].mass * r.u.abs());
            }
        }
        js_max(s, 1e-12)
    };
    let tries_max = 1usize << uni.len().min(14);
    for _ in 0..tries_max {
        let mut active: Vec<bool> = rows.iter().map(|r| !r.unilateral).collect();
        for (k, &ri) in uni.iter().enumerate() {
            let prefer_active = rows[ri].approach;
            active[ri] = if digits[k] == 0 { prefer_active } else { !prefer_active };
        }
        let idx: Vec<usize> = (0..m).filter(|&i| active[i]).collect();
        let mut p = vec![0.0; m];
        if !idx.is_empty() {
            let q = idx.len();
            let mut a = vec![0.0; q * q];
            let mut b = vec![0.0; q];
            for (ai, &ri) in idx.iter().enumerate() {
                for (ci, &rk) in idx.iter().enumerate() {
                    a[ai * q + ci] = w[ri * m + rk];
                }
                b[ai] = rows[ri].target - rows[ri].u;
            }
            let sol = solve_dense(q, &a, &b, 1e-12);
            for (ai, &ri) in idx.iter().enumerate() {
                p[ri] = sol.x[ai];
            }
            if !sol.consistent {
                advance(&mut digits);
                continue;
            }
        }
        let mut violation = 0.0;
        for &ri in &uni {
            if active[ri] {
                if p[ri] < -1e-12 * scale_p {
                    violation += -p[ri] / scale_p;
                }
            } else {
                let mut v = rows[ri].u;
                for k in 0..m {
                    v += w[ri * m + k] * p[k];
                }
                if v < rows[ri].target - tol::VEL {
                    violation += rows[ri].target - v;
                }
            }
        }
        let done = violation == 0.0;
        if violation < best_violation {
            best_violation = violation;
            best_p = Some(p);
        }
        if done {
            break;
        }
        if !advance(&mut digits) {
            break;
        }
    }
    let p = best_p.unwrap_or_else(|| vec![0.0; m]);
    let mut active = 0usize;
    for &ri in &uni {
        if p[ri] > 0.0 {
            active += 1;
        }
    }
    let friction = friction_pass(sys, x, rows, &p, &w);
    let fallback = match friction {
        FrictionOutcome::Result(r) => return Solved { result: r, frictionless: false, active },
        FrictionOutcome::Fallback => true,
        FrictionOutcome::NotApplicable => false,
    };
    if !fallback && friction_acts(sys, x, rows, &p) {
        if let Some(multi) = multi_friction(sys, x, rows) {
            return Solved { result: multi, frictionless: false, active };
        }
    }
    let before = kinetic_energy(sys, x);
    let mut dv = vec![0.0; 3 * n];
    for (i, r) in rows.iter().enumerate() {
        if p[i] != 0.0 {
            add_row(&mut dv, &r.j, p[i]);
        }
    }
    let mut y = x.to_vec();
    for i in 0..n {
        let im = model.dyn_inv_mass[i];
        let ii = model.dyn_inv_inertia[i];
        y[3 * n + 3 * i] += dv[3 * i] * im;
        y[3 * n + 3 * i + 1] += dv[3 * i + 1] * im;
        y[3 * n + 3 * i + 2] += dv[3 * i + 2] * ii;
    }
    let after = kinetic_energy(sys, &y);
    let mut points = Vec::new();
    let mut friction_would_act = fallback;
    for (i, r) in rows.iter_mut().enumerate() {
        let Some(info) = r.info.as_mut() else { continue };
        info.impulse = p[i];
        info.vn_after = row_dot(&r.j, &y, 3 * n);
        if r.approach || p[i] > 0.0 {
            points.push(info.clone());
        }
        if p[i] > 0.0 {
            if let (Some(kin), Some(pair)) = (r.kin.as_ref(), info.pair) {
                let mat = sys.pairs[pair].material;
                if mat.mu_k > 0.0 || mat.mu_s > 0.0 {
                    let belt = kin.vt - row_dot(&kin.jt, x, 3 * n);
                    if js_max(kin.vt.abs(), (row_dot(&kin.jt, &y, 3 * n) + belt).abs()) > tol::VEL {
                        friction_would_act = true;
                    }
                }
            }
        }
    }
    Solved {
        result: ImpactResult {
            x: y,
            points,
            energy_before: before,
            energy_after: after,
            loss: before - after,
            warning: if friction_would_act { Some(multi_impact_warning()) } else { None },
        },
        frictionless: true,
        active,
    }
}

/// Outcome of Stronge's impact.
#[derive(Clone, Copy, Debug)]
pub struct StrongeResult {
    pub pn: f64,
    pub pt: f64,
    pub vn: f64,
    pub vt: f64,
    pub end: &'static str,
}

/// Stronge's energetic impact with Coulomb friction for one contact (closed form per phase).
// `!(a > b)` is not `a <= b`: NaN takes the negated branch, as in the TypeScript source
#[allow(clippy::too_many_arguments, clippy::neg_cmp_op_on_partial_ord)]
pub fn stronge_impact(vn0: f64, vt0: f64, wnn: f64, wnt: f64, wtt: f64, e: f64, mu_k: f64, mu_s: f64) -> Option<StrongeResult> {
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
    let mut s = if vt0.abs() > tol::VEL {
        if vt0 > 0.0 {
            1.0
        } else {
            -1.0
        }
    } else {
        after_zero()
    };
    let s0 = s;
    let mut pn = 0.0;
    let mut pt = 0.0;
    let mut vn = vn0;
    let mut vt = vt0;
    let mut work = 0.0;
    let mut compressing = vn < 0.0;
    let mut need = 0.0;
    if !compressing {
        return Some(StrongeResult { pn: 0.0, pt: 0.0, vn, vt, end: if s == 0.0 { "stick" } else { "slip" } });
    }
    for _phase in 0..8 {
        let slope = if s == 0.0 { -wnt / wtt } else { -mu_k * s };
        let kap = wnn + wnt * slope;
        let rho = if s == 0.0 { 0.0 } else { wnt + wtt * slope };
        let go = |d: f64, work: &mut f64, pn: &mut f64, pt: &mut f64, vn: &mut f64, vt: &mut f64| {
            *work += *vn * d + 0.5 * kap * d * d;
            *pn += d;
            *pt += slope * d;
            *vn += kap * d;
            *vt += rho * d;
        };
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
                go(d_trans, &mut work, &mut pn, &mut pt, &mut vn, &mut vt);
                vt = 0.0;
                s = after_zero();
                continue;
            }
            go(d_c, &mut work, &mut pn, &mut pt, &mut vn, &mut vt);
            vn = 0.0;
            compressing = false;
            need = -e * e * work;
            d_trans -= d_c;
            if !(need > 0.0) {
                break;
            }
        }
        let disc = vn * vn + 2.0 * kap * need;
        let d_r = if disc >= 0.0 { 2.0 * need / (vn + disc.sqrt()) } else { f64::INFINITY };
        if d_r <= d_trans {
            go(d_r, &mut work, &mut pn, &mut pt, &mut vn, &mut vt);
            need = 0.0;
            break;
        }
        if !d_trans.is_finite() {
            return None;
        }
        let before = work;
        go(d_trans, &mut work, &mut pn, &mut pt, &mut vn, &mut vt);
        vt = 0.0;
        need -= work - before;
        s = after_zero();
    }
    if compressing || need > 1e-12 * work.abs() {
        return None;
    }
    if !(pn <= 1e6 * (1.0 + e) * vn0.abs() / wnn) {
        return None;
    }
    let end = if s == 0.0 {
        "stick"
    } else if s == s0 {
        "slip"
    } else {
        "reverse"
    };
    Some(StrongeResult { pn, pt, vn, vt, end })
}

enum FrictionOutcome {
    Result(ImpactResult),
    Fallback,
    NotApplicable,
}

// `!(a > b)` is not `a <= b`: NaN takes the negated branch, as in the TypeScript source
#[allow(clippy::neg_cmp_op_on_partial_ord)]
fn friction_pass(sys: &System, x: &[f64], rows: &mut [IRow], p: &[f64], w: &[f64]) -> FrictionOutcome {
    let model = &sys.model;
    let n = sys.n;
    let m = rows.len();
    let active: Vec<usize> = (0..m).filter(|&i| rows[i].unilateral && p[i] > 0.0).collect();
    if active.len() != 1 {
        return FrictionOutcome::NotApplicable;
    }
    let ri = active[0];
    let (kin, pair) = {
        let row = &rows[ri];
        let (Some(kin), Some(info)) = (row.kin.as_ref(), row.info.as_ref()) else { return FrictionOutcome::NotApplicable };
        let Some(pair) = info.pair else { return FrictionOutcome::NotApplicable };
        if !row.approach {
            return FrictionOutcome::NotApplicable;
        }
        (kin.clone(), pair)
    };
    let mat = sys.pairs[pair].material;
    if !(mat.mu_k > 0.0 || mat.mu_s > 0.0) {
        return FrictionOutcome::NotApplicable;
    }
    let mu_k = mat.mu_k;
    let mu_s = js_max(mat.mu_s, mat.mu_k);
    let bil: Vec<usize> = (0..m).filter(|&i| !rows[i].unilateral).collect();
    let nb = bil.len();
    let mut wbb = vec![0.0; nb * nb];
    for (xi, &a) in bil.iter().enumerate() {
        for (yi, &b) in bil.iter().enumerate() {
            wbb[xi * nb + yi] = w[a * m + b];
        }
    }
    let response = |d: Option<&RowJ>, extra: Option<&[f64]>| -> Vec<f64> {
        let mut g = vec![0.0; 3 * n];
        if let Some(d) = d {
            add_row(&mut g, d, 1.0);
        }
        if nb > 0 {
            let mut rhs = vec![0.0; nb];
            for xi in 0..nb {
                let a = match d {
                    Some(d) => -row_minv_row(model, &rows[bil[xi]].j, d),
                    None => 0.0,
                };
                let b = match extra {
                    Some(e) => e[xi],
                    None => 0.0,
                };
                rhs[xi] = a + b;
            }
            let lam = solve_dense(nb, &wbb, &rhs, 1e-12).x;
            for xi in 0..nb {
                add_row(&mut g, &rows[bil[xi]].j, lam[xi]);
            }
        }
        for i in 0..n {
            let im = model.dyn_inv_mass[i];
            let ii = model.dyn_inv_inertia[i];
            g[3 * i] *= im;
            g[3 * i + 1] *= im;
            g[3 * i + 2] *= ii;
        }
        g
    };
    let mut v = x[3 * n..6 * n].to_vec();
    if nb > 0 {
        let mut rhs = vec![0.0; nb];
        for xi in 0..nb {
            rhs[xi] = -row_dot(&rows[bil[xi]].j, &v, 0);
        }
        let d0 = response(None, Some(&rhs));
        for k in 0..3 * n {
            v[k] += d0[k];
        }
    }
    let dn = response(Some(&kin.jn), None);
    let dtv = response(Some(&kin.jt), None);
    let wnn = row_dot(&kin.jn, &dn, 0);
    let wnt = row_dot(&kin.jn, &dtv, 0);
    let wtn = row_dot(&kin.jt, &dn, 0);
    let wtt = row_dot(&kin.jt, &dtv, 0);
    let belt = kin.vt - row_dot(&kin.jt, x, 3 * n);
    let vn0 = row_dot(&kin.jn, &v, 0);
    let vt0 = row_dot(&kin.jt, &v, 0) + belt;
    let restitution = rows[ri].info.as_ref().map(|i| i.restitution).unwrap_or(0.0);
    let Some(res) = stronge_impact(vn0, vt0, wnn, 0.5 * (wnt + wtn), wtt, restitution, mu_k, mu_s) else { return FrictionOutcome::Fallback };
    for k in 0..3 * n {
        v[k] += res.pn * dn[k] + res.pt * dtv[k];
    }
    let mut y = x.to_vec();
    y[3 * n..6 * n].copy_from_slice(&v);
    if row_dot(&kin.jn, &y, 3 * n) < -tol::VEL {
        return FrictionOutcome::Fallback;
    }
    for (i, r) in rows.iter().enumerate() {
        if i == ri || !r.unilateral {
            continue;
        }
        if row_dot(&r.j, &y, 3 * n) < r.target - tol::VEL {
            return FrictionOutcome::Fallback;
        }
    }
    let before = kinetic_energy(sys, x);
    let after = kinetic_energy(sys, &y);
    if !(after <= before - belt * res.pt + 1e-12 * js_max(1.0, before)) {
        return FrictionOutcome::Fallback;
    }
    let info = rows[ri].info.as_mut().expect("checked above");
    info.impulse = res.pn;
    info.vn_after = row_dot(&kin.jn, &y, 3 * n);
    info.tangent_impulse = Some(res.pt);
    info.vt_before = Some(vt0);
    info.vt_after = Some(row_dot(&kin.jt, &y, 3 * n) + belt);
    info.friction = Some(res.end);
    let point = info.clone();
    FrictionOutcome::Result(ImpactResult { x: y, points: vec![point], energy_before: before, energy_after: after, loss: before - after, warning: None })
}

/// Whether the frictionless impulses leave several unilateral rows active and friction would act on one of them.
#[allow(clippy::neg_cmp_op_on_partial_ord)]
fn friction_acts(sys: &System, x: &[f64], rows: &[IRow], p: &[f64]) -> bool {
    let model = &sys.model;
    let n = sys.n;
    let mut active = 0usize;
    for (i, r) in rows.iter().enumerate() {
        if r.unilateral && p[i] > 0.0 {
            active += 1;
        }
    }
    if active < 2 {
        return false;
    }
    let mut dv = vec![0.0; 3 * n];
    for (i, r) in rows.iter().enumerate() {
        if p[i] != 0.0 {
            add_row(&mut dv, &r.j, p[i]);
        }
    }
    let mut y = x.to_vec();
    for i in 0..n {
        let im = model.dyn_inv_mass[i];
        let ii = model.dyn_inv_inertia[i];
        y[3 * n + 3 * i] += dv[3 * i] * im;
        y[3 * n + 3 * i + 1] += dv[3 * i + 1] * im;
        y[3 * n + 3 * i + 2] += dv[3 * i + 2] * ii;
    }
    for (i, r) in rows.iter().enumerate() {
        if !(p[i] > 0.0) {
            continue;
        }
        let (Some(kin), Some(info)) = (r.kin.as_ref(), r.info.as_ref()) else { continue };
        let Some(pair) = info.pair else { continue };
        let mat = sys.pairs[pair].material;
        if !(mat.mu_k > 0.0 || mat.mu_s > 0.0) {
            continue;
        }
        let belt = kin.vt - row_dot(&kin.jt, x, 3 * n);
        if js_max(kin.vt.abs(), (row_dot(&kin.jt, &y, 3 * n) + belt).abs()) > tol::VEL {
            return true;
        }
    }
    false
}

/// Most frictional contact points of a simultaneous frictional impact (D37).
pub const MULTI_FRICTION_POINTS: usize = 8;
/// Most combinations tried by one enumeration of multi_friction (3⁸).
pub const MULTI_FRICTION_TRIES: usize = 6561;

struct FrictionRows {
    ext: Vec<RowJ>,
    ext_u: Vec<f64>,
    w: Vec<f64>,
    tan: Vec<isize>,
    belt: Vec<f64>,
    mu_k: Vec<f64>,
    mu_s: Vec<f64>,
    dir: Vec<f64>,
    scale_p: f64,
}

struct FrictionSolution {
    p: Vec<f64>,
    y: Vec<f64>,
    after: f64,
    fr: Vec<usize>,
    states: Vec<u8>,
}

#[allow(clippy::neg_cmp_op_on_partial_ord)]
fn friction_rows(sys: &System, x: &[f64], rows: &[IRow]) -> Option<FrictionRows> {
    let model = &sys.model;
    let n = sys.n;
    let m = rows.len();
    let mut ext: Vec<RowJ> = rows.iter().map(|r| r.j.clone()).collect();
    let mut u: Vec<f64> = rows.iter().map(|r| r.u).collect();
    let mut tan = vec![-1isize; m];
    let mut belt = vec![0.0; m];
    let mut mu_k = vec![0.0; m];
    let mut mu_s = vec![0.0; m];
    let mut dir = vec![0.0; m];
    let mut frictional = 0usize;
    for (i, r) in rows.iter().enumerate() {
        if !r.unilateral {
            continue;
        }
        let (Some(kin), Some(info)) = (r.kin.as_ref(), r.info.as_ref()) else { continue };
        let Some(pair) = info.pair else { continue };
        let mat = sys.pairs[pair].material;
        if !(mat.mu_k > 0.0 || mat.mu_s > 0.0) {
            continue;
        }
        frictional += 1;
        tan[i] = ext.len() as isize;
        let ut = row_dot(&kin.jt, x, 3 * n);
        ext.push(kin.jt.clone());
        u.push(ut);
        belt[i] = kin.vt - ut;
        mu_k[i] = mat.mu_k;
        mu_s[i] = js_max(mat.mu_s, mat.mu_k);
        dir[i] = if kin.vt < 0.0 { -1.0 } else { 1.0 };
    }
    if frictional == 0 || frictional > MULTI_FRICTION_POINTS {
        return None;
    }
    let me = ext.len();
    let mut w = vec![0.0; me * me];
    for r in 0..me {
        for k in 0..me {
            w[r * me + k] = row_minv_row(model, &ext[r], &ext[k]);
        }
    }
    let mut sc = 0.0;
    for &v in &u {
        for &bg in &model.dynamic {
            sc = js_max(sc, model.bodies[bg].mass * v.abs());
        }
    }
    Some(FrictionRows { ext, ext_u: u, w, tan, belt, mu_k, mu_s, dir, scale_p: js_max(sc, 1e-12) })
}

fn apply_ext(sys: &System, x: &[f64], ext: &[RowJ], p: &[f64]) -> Vec<f64> {
    let model = &sys.model;
    let n = sys.n;
    let mut dv = vec![0.0; 3 * n];
    for (k, j) in ext.iter().enumerate() {
        if p[k] != 0.0 {
            add_row(&mut dv, j, p[k]);
        }
    }
    let mut y = x.to_vec();
    for i in 0..n {
        let im = model.dyn_inv_mass[i];
        let ii = model.dyn_inv_inertia[i];
        y[3 * n + 3 * i] += dv[3 * i] * im;
        y[3 * n + 3 * i + 1] += dv[3 * i + 1] * im;
        y[3 * n + 3 * i + 2] += dv[3 * i + 2] * ii;
    }
    y
}

fn belt_work_of(fx: &FrictionRows, fr: &[usize], p: &[f64]) -> f64 {
    let mut w = 0.0;
    for &i in fr {
        w -= fx.belt[i] * p[fx.tan[i] as usize];
    }
    w
}

/// Simultaneous frictional impact at several points (D37): Newton, then Poisson, then plastic (see impact.ts).
fn multi_friction(sys: &System, x: &[f64], rows: &mut [IRow]) -> Option<ImpactResult> {
    let fx = friction_rows(sys, x, rows)?;
    let before = kinetic_energy(sys, x);
    let m = rows.len();
    let newton: Vec<f64> = rows.iter().map(|r| r.target).collect();
    if let Some(sol) = enumerate_friction(sys, x, rows, &fx, &newton, before) {
        return Some(friction_result(sys, rows, &fx, &sol, before));
    }
    let zero = vec![0.0; m];
    let plastic = enumerate_friction(sys, x, rows, &fx, &zero, before)?;
    if let Some(poisson) = poisson_step(sys, x, rows, &fx, &plastic, before) {
        return Some(friction_result(sys, rows, &fx, &poisson, before));
    }
    for r in rows.iter_mut() {
        if let Some(info) = r.info.as_mut() {
            info.restitution = 0.0;
        }
    }
    let mut out = friction_result(sys, rows, &fx, &plastic, before);
    out.warning = Some(multi_impact_plastic_warning());
    Some(out)
}

fn advance_base(digits: &mut [u8], base: u8) -> bool {
    let mut k = digits.len() as isize - 1;
    while k >= 0 {
        let ku = k as usize;
        digits[ku] += 1;
        if digits[ku] < base {
            return true;
        }
        digits[ku] = 0;
        k -= 1;
    }
    false
}

fn enumerate_friction(sys: &System, x: &[f64], rows: &[IRow], fx: &FrictionRows, targets: &[f64], before: f64) -> Option<FrictionSolution> {
    let m = rows.len();
    let uni: Vec<usize> = (0..m).filter(|&i| rows[i].unilateral).collect();
    let mut digits = vec![0u8; uni.len()];
    let mut tries = 0usize;
    let outer_max = 1usize << uni.len().min(14);
    for _ in 0..outer_max {
        let mut active: Vec<bool> = rows.iter().map(|r| !r.unilateral).collect();
        for (k, &ri) in uni.iter().enumerate() {
            let prefer_active = rows[ri].approach;
            active[ri] = if digits[k] == 0 { prefer_active } else { !prefer_active };
        }
        let fr: Vec<usize> = (0..m).filter(|&i| active[i] && fx.tan[i] >= 0).collect();
        let mut states = vec![0u8; fr.len()];
        if !fr.is_empty() {
            loop {
                tries += 1;
                if tries > MULTI_FRICTION_TRIES {
                    return None;
                }
                if let Some(sol) = try_combination(sys, x, rows, fx, targets, &active, &fr, &states, before) {
                    return Some(sol);
                }
                if !advance_base(&mut states, 3) {
                    break;
                }
            }
        }
        if !advance(&mut digits) {
            break;
        }
    }
    None
}

// `!(a <= b)` is not `a > b`: NaN takes the negated branch, as in the TypeScript source
#[allow(clippy::too_many_arguments, clippy::neg_cmp_op_on_partial_ord)]
fn try_combination(
    sys: &System,
    x: &[f64],
    rows: &[IRow],
    fx: &FrictionRows,
    targets: &[f64],
    active: &[bool],
    fr: &[usize],
    states: &[u8],
    before: f64,
) -> Option<FrictionSolution> {
    let m = rows.len();
    let me = fx.ext.len();
    let w = &fx.w;
    let tan = &fx.tan;
    let mut coef = vec![0.0; m];
    let mut stick: Vec<usize> = Vec::new();
    for (k, &i) in fr.iter().enumerate() {
        if states[k] == 0 {
            stick.push(i);
        } else {
            coef[i] = -fx.mu_k[i] * (if states[k] == 1 { fx.dir[i] } else { -fx.dir[i] });
        }
    }
    let cols: Vec<usize> = (0..m).filter(|&i| active[i]).collect();
    let nc = cols.len();
    let q = nc + stick.len();
    let mut a = vec![0.0; q * q];
    let mut b = vec![0.0; q];
    for ai in 0..q {
        let ra = if ai < nc { cols[ai] } else { tan[stick[ai - nc]] as usize };
        for ci in 0..q {
            a[ai * q + ci] = if ci < nc {
                let rc = cols[ci];
                if coef[rc] != 0.0 {
                    w[ra * me + rc] + coef[rc] * w[ra * me + tan[rc] as usize]
                } else {
                    w[ra * me + rc]
                }
            } else {
                w[ra * me + tan[stick[ci - nc]] as usize]
            };
        }
        b[ai] = if ai < nc { targets[ra] - fx.ext_u[ra] } else { -fx.belt[stick[ai - nc]] - fx.ext_u[ra] };
    }
    let sol = solve_dense(q, &a, &b, 1e-12);
    if !sol.consistent {
        return None;
    }
    let mut p = vec![0.0; me];
    for (ci, &ri) in cols.iter().enumerate() {
        p[ri] = sol.x[ci];
        if coef[ri] != 0.0 {
            p[tan[ri] as usize] = coef[ri] * sol.x[ci];
        }
    }
    for (k, &ri) in stick.iter().enumerate() {
        p[tan[ri] as usize] = sol.x[nc + k];
    }
    let vel = |r: usize, p: &[f64]| -> f64 {
        let mut v = fx.ext_u[r];
        for k in 0..me {
            v += w[r * me + k] * p[k];
        }
        v
    };
    for i in 0..m {
        if !rows[i].unilateral {
            continue;
        }
        if active[i] {
            if p[i] < -1e-12 * fx.scale_p {
                return None;
            }
        } else if vel(i, &p) < targets[i] - tol::VEL {
            return None;
        }
    }
    for (k, &i) in fr.iter().enumerate() {
        let pn = js_max(p[i], 0.0);
        let ti = tan[i] as usize;
        if states[k] == 0 {
            if p[ti].abs() > fx.mu_s[i] * pn + 1e-12 * fx.scale_p {
                return None;
            }
        } else {
            let s = if states[k] == 1 { fx.dir[i] } else { -fx.dir[i] };
            if s * (vel(ti, &p) + fx.belt[i]) < -tol::VEL {
                return None;
            }
        }
    }
    let y = apply_ext(sys, x, &fx.ext, &p);
    let after = kinetic_energy(sys, &y);
    if !(after <= before + belt_work_of(fx, fr, &p) + 1e-12 * js_max(1.0, before)) {
        return None;
    }
    Some(FrictionSolution { p, y, after, fr: fr.to_vec(), states: states.to_vec() })
}

#[allow(clippy::neg_cmp_op_on_partial_ord)]
fn poisson_step(sys: &System, x: &[f64], rows: &[IRow], fx: &FrictionRows, plastic: &FrictionSolution, before: f64) -> Option<FrictionSolution> {
    let m = rows.len();
    let me = fx.ext.len();
    let w = &fx.w;
    let mut p = plastic.p.clone();
    let mut any = false;
    for i in 0..m {
        let e = rows[i].info.as_ref().map(|f| f.restitution).unwrap_or(0.0);
        if !rows[i].unilateral || !(e > 0.0) || !(p[i] > 0.0) {
            continue;
        }
        any = true;
        p[i] *= 1.0 + e;
        if fx.tan[i] >= 0 {
            p[fx.tan[i] as usize] *= 1.0 + e;
        }
    }
    if !any {
        return None;
    }
    let bil: Vec<usize> = (0..m).filter(|&i| !rows[i].unilateral).collect();
    if !bil.is_empty() {
        let nb = bil.len();
        let mut a = vec![0.0; nb * nb];
        let mut b = vec![0.0; nb];
        for (ai, &ra) in bil.iter().enumerate() {
            for (ci, &rc) in bil.iter().enumerate() {
                a[ai * nb + ci] = w[ra * me + rc];
            }
            let mut v = fx.ext_u[ra];
            for k in 0..me {
                if k >= m || rows[k].unilateral {
                    v += w[ra * me + k] * p[k];
                }
            }
            b[ai] = -v;
        }
        let sol = solve_dense(nb, &a, &b, 1e-12);
        if !sol.consistent {
            return None;
        }
        for (ai, &ri) in bil.iter().enumerate() {
            p[ri] = sol.x[ai];
        }
    }
    for i in 0..m {
        if !rows[i].unilateral {
            continue;
        }
        let mut v = fx.ext_u[i];
        for k in 0..me {
            v += w[i * me + k] * p[k];
        }
        if v < -tol::VEL {
            return None;
        }
    }
    let y = apply_ext(sys, x, &fx.ext, &p);
    let after = kinetic_energy(sys, &y);
    if !(after <= before + belt_work_of(fx, &plastic.fr, &p) + 1e-12 * js_max(1.0, before)) {
        return None;
    }
    Some(FrictionSolution { p, y, after, fr: plastic.fr.clone(), states: plastic.states.clone() })
}

#[allow(clippy::neg_cmp_op_on_partial_ord)]
fn friction_result(sys: &System, rows: &mut [IRow], fx: &FrictionRows, sol: &FrictionSolution, before: f64) -> ImpactResult {
    let n = sys.n;
    let mut points = Vec::new();
    for (i, r) in rows.iter_mut().enumerate() {
        let Some(info) = r.info.as_mut() else { continue };
        if !(r.approach || sol.p[i] > 0.0) {
            continue;
        }
        // + 0.0: a zero impulse is reported as +0 (as in the TypeScript engine)
        info.impulse = sol.p[i] + 0.0;
        info.vn_after = row_dot(&r.j, &sol.y, 3 * n);
        if let (Some(k), Some(kin)) = (sol.fr.iter().position(|&f| f == i), r.kin.as_ref()) {
            info.tangent_impulse = Some(sol.p[fx.tan[i] as usize] + 0.0);
            info.vt_before = Some(kin.vt);
            info.vt_after = Some(row_dot(&kin.jt, &sol.y, 3 * n) + fx.belt[i]);
            info.friction = Some(if sol.states[k] == 0 {
                "stick"
            } else if sol.states[k] == 1 || kin.vt.abs() <= tol::VEL {
                "slip"
            } else {
                "reverse"
            });
        }
        points.push(info.clone());
    }
    ImpactResult { x: sol.y.clone(), points, energy_before: before, energy_after: sol.after, loss: before - sol.after, warning: None }
}
