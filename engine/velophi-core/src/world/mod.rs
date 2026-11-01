//! Many-body solver “Soft Step” (26.58, D126–D133): the scene integrator `softstep`.
//!
//! Each step: sort-and-sweep broad phase, contact manifolds with feature ids (impulses carried over from the
//! previous step), then `substeps` sub-steps of: applied forces (the same `applied_forces_into` as the other
//! integrators, so every force, field and ledger entry works) → warm start → biased solve (soft joint rows;
//! contacts: normal only, soft + speculative bias) → integrate positions → relax (no soft bias; contacts with
//! friction and rolling resistance); after the sub-steps a restitution pass (Poisson-capped, never adds energy);
//! then the impulses are stored and islands may fall asleep.
//!
//! The design follows the algorithms published with Box2D v3 (Erin Catto, MIT) and Rapier (Dimforge,
//! Apache-2.0); the code is VeloΦ's own (docs/DEV_MANUAL_26_58.md §2, §5). Determinism (D132): transcendentals only
//! through `dmath`, no hash maps, fixed processing order; the persistent state (`SoftState`) is written into
//! checkpoints so that rebuilt chunks are bit-identical.

pub mod broad;
pub mod collide;

use crate::dmath::{cos, sin};
use crate::dynamics::{applied_forces_into, energy, limit_row, row_dot, row_minv_row, Rates, System, AUX_BELT, AUX_DAMP, AUX_WORK};
use crate::kinematics::{compute_poses_into, equality_kins_into, rope_kin, slider_axis_kin, EqualityKin, EqualityKind, Pose, RowJ};
use crate::message::SimResult;
use crate::model::{pair_material, Model, ShapeModel, ShapePiece};
use crate::scene::SceneSettings;
use broad::Sweep;
use collide::{add, collide as collide_pieces, cross, dot, scale, sub, Geom, Manifold, WPiece, V};

/// Parameters of the solver (D130).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SoftParams {
    pub substeps: usize,
    pub step_hz: f64,
    pub contact_hz: f64,
    pub contact_zeta: f64,
    pub joint_hz: f64,
    pub joint_zeta: f64,
    pub push_speed: f64,
    pub slop: f64,
    pub speculative: f64,
    pub restitution_threshold: f64,
    pub restitution_iters: usize,
    pub sleep: bool,
    pub sleep_speed: f64,
    pub sleep_time: f64,
}

impl SoftParams {
    /// Defaults with the scene's `softStep` settings applied; sleep only where nothing changes with time (D131).
    pub fn from_model(model: &Model) -> SoftParams {
        let st: &SceneSettings = &model.settings;
        let d = &st.soft_step;
        let sleep_ok = !model.has_expr
            && !model.timed
            && model.motors.is_empty()
            && !model.electric
            && model.liquids.is_empty()
            && model.rails.is_empty()
            && model.zones.is_empty()
            && model.g_const == 0.0;
        SoftParams {
            substeps: d.substeps,
            step_hz: d.step_hz,
            contact_hz: 60.0,
            contact_zeta: 10.0,
            joint_hz: 120.0,
            joint_zeta: 2.0,
            push_speed: 3.0,
            slop: 0.005,
            speculative: 0.02,
            restitution_threshold: 0.1,
            restitution_iters: 2,
            sleep: d.sleep && sleep_ok,
            sleep_speed: 0.05,
            sleep_time: 0.5,
        }
    }

    /// Steps per output interval: the step is at most 1/step_hz and divides the interval exactly.
    pub fn steps_per_frame(&self, output_step: f64) -> usize {
        let m = (output_step * self.step_hz - 1e-9).ceil();
        if m.is_finite() && m >= 1.0 {
            m as usize
        } else {
            1
        }
    }
}

/// A contact point's impulses kept from one step to the next.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CachedPoint {
    pub a: u32,
    pub b: u32,
    pub key: u32,
    pub id: u32,
    pub ln: f64,
    pub lt: f64,
}

/// The rolling impulse of a manifold.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CachedRoll {
    pub a: u32,
    pub b: u32,
    pub key: u32,
    pub lr: f64,
}

/// Persistent solver state (D132): written into checkpoints.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct SoftState {
    pub points: Vec<CachedPoint>,
    pub rolls: Vec<CachedRoll>,
    /// Joint row impulses by row key, sorted.
    pub joints: Vec<(u64, f64)>,
    /// Seconds below the sleep speed, by dynamic slot.
    pub sleep_time: Vec<f64>,
    /// −1: awake; else the island id (smallest dynamic slot of the island when it fell asleep).
    pub island: Vec<f64>,
}

/// Version of the encoded state.
const SOFT_FORMAT: f64 = 1.0;

impl SoftState {
    pub fn new(n: usize) -> SoftState {
        SoftState { points: Vec::new(), rolls: Vec::new(), joints: Vec::new(), sleep_time: vec![0.0; n], island: vec![-1.0; n] }
    }

    /// Flat encoding for a checkpoint.
    pub fn encode(&self) -> Vec<f64> {
        let mut out = Vec::with_capacity(8 + 6 * self.points.len() + 4 * self.rolls.len() + 2 * self.joints.len() + 2 * self.sleep_time.len());
        out.push(SOFT_FORMAT);
        out.push(self.points.len() as f64);
        for p in &self.points {
            out.extend_from_slice(&[p.a as f64, p.b as f64, p.key as f64, p.id as f64, p.ln, p.lt]);
        }
        out.push(self.rolls.len() as f64);
        for r in &self.rolls {
            out.extend_from_slice(&[r.a as f64, r.b as f64, r.key as f64, r.lr]);
        }
        out.push(self.joints.len() as f64);
        for (k, l) in &self.joints {
            // keys stay below 2^53
            out.push(*k as f64);
            out.push(*l);
        }
        out.push(self.sleep_time.len() as f64);
        out.extend_from_slice(&self.sleep_time);
        out.extend_from_slice(&self.island);
        out
    }

    /// Decode `encode`'s output; None when malformed.
    pub fn decode(d: &[f64]) -> Option<SoftState> {
        let mut o = 0usize;
        let next = |o: &mut usize| -> Option<f64> {
            let v = *d.get(*o)?;
            *o += 1;
            Some(v)
        };
        let count = |v: f64| -> Option<usize> {
            if v >= 0.0 && v.fract() == 0.0 && v < 1e9 {
                Some(v as usize)
            } else {
                None
            }
        };
        if next(&mut o)? != SOFT_FORMAT {
            return None;
        }
        let np = count(next(&mut o)?)?;
        let mut points = Vec::with_capacity(np);
        for _ in 0..np {
            let a = next(&mut o)? as u32;
            let b = next(&mut o)? as u32;
            let key = next(&mut o)? as u32;
            let id = next(&mut o)? as u32;
            let ln = next(&mut o)?;
            let lt = next(&mut o)?;
            points.push(CachedPoint { a, b, key, id, ln, lt });
        }
        let nr = count(next(&mut o)?)?;
        let mut rolls = Vec::with_capacity(nr);
        for _ in 0..nr {
            let a = next(&mut o)? as u32;
            let b = next(&mut o)? as u32;
            let key = next(&mut o)? as u32;
            let lr = next(&mut o)?;
            rolls.push(CachedRoll { a, b, key, lr });
        }
        let nj = count(next(&mut o)?)?;
        let mut joints = Vec::with_capacity(nj);
        for _ in 0..nj {
            let k = next(&mut o)? as u64;
            let l = next(&mut o)?;
            joints.push((k, l));
        }
        let nb = count(next(&mut o)?)?;
        if d.len() != o + 2 * nb {
            return None;
        }
        let sleep_time = d[o..o + nb].to_vec();
        let island = d[o + nb..o + 2 * nb].to_vec();
        Some(SoftState { points, rolls, joints, sleep_time, island })
    }
}

#[derive(Clone, Debug)]
enum LocalPiece {
    Circle { c: V, r: f64 },
    Poly { v: Vec<V>, n: Vec<V> },
}

fn local_pieces(shape: &ShapeModel) -> Vec<LocalPiece> {
    let poly = |verts: &[crate::scene::Vec2], normals: &[crate::scene::Vec2]| LocalPiece::Poly {
        v: verts.iter().map(|p| V::new(p.x, p.y)).collect(),
        n: normals.iter().map(|p| V::new(p.x, p.y)).collect(),
    };
    match shape {
        ShapeModel::Circle { radius } => vec![LocalPiece::Circle { c: V::default(), r: *radius }],
        ShapeModel::Polygon { verts, normals, .. } => vec![poly(verts, normals)],
        ShapeModel::Complex(cs) => cs
            .pieces
            .iter()
            .map(|p| match p {
                ShapePiece::Circle { center, radius } => LocalPiece::Circle { c: V::new(center.x, center.y), r: *radius },
                ShapePiece::Polygon { verts, normals } => poly(verts, normals),
            })
            .collect(),
    }
}

#[derive(Clone, Copy, Debug, Default)]
struct Soft {
    bias: f64,
    mass: f64,
    imp: f64,
}

/// Soft constraint coefficients for frequency `hz`, damping ratio `zeta` and sub-step `h` (Box2D's b2MakeSoft).
fn make_soft(hz: f64, zeta: f64, h: f64) -> Soft {
    if hz == 0.0 {
        return Soft { bias: 0.0, mass: 1.0, imp: 0.0 };
    }
    let omega = 2.0 * std::f64::consts::PI * hz;
    let a1 = 2.0 * zeta + h * omega;
    let a2 = h * omega * a1;
    let a3 = 1.0 / (1.0 + a2);
    Soft { bias: omega / a1, mass: a2 * a3, imp: a3 }
}

#[derive(Clone, Copy, Debug, Default)]
struct CPoint {
    id: u32,
    ra: V,
    rb: V,
    base: f64,
    nm: f64,
    tm: f64,
    ln: f64,
    lt: f64,
    total: f64,
    rest: f64,
    vrel: f64,
    mu: f64,
}

#[derive(Clone, Copy, Debug, Default)]
struct Contact {
    a: usize,
    b: usize,
    ia: i32,
    ib: i32,
    key: u32,
    n: V,
    t: V,
    ma: f64,
    ja: f64,
    mb: f64,
    jb: f64,
    e: f64,
    roll: f64,
    rmass: f64,
    lr: f64,
    tspeed: f64,
    stat: bool,
    count: usize,
    p: [CPoint; 2],
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum JKind {
    Eq,
    Drive,
    Uni,
}

#[derive(Clone, Debug)]
struct JRow {
    key: u64,
    j: RowJ,
    c: f64,
    m: f64,
    kind: JKind,
    speed: f64,
    lim: f64,
    lambda: f64,
    awake: bool,
}

/// Working memory (not part of any result).
#[derive(Clone, Debug, Default)]
pub struct SoftScratch {
    local: Vec<Vec<LocalPiece>>,
    geom: Geom,
    boxes: Vec<[f64; 4]>,
    sweep: Sweep,
    pairs: Vec<(usize, usize)>,
    found: Vec<(usize, usize, u32, Manifold)>,
    contacts: Vec<Contact>,
    poses: Vec<Pose>,
    q: Vec<f64>,
    rates: Rates,
    v: Vec<f64>,
    dp: Vec<f64>,
    dq: Vec<f64>,
    rot: Vec<(f64, f64)>,
    eqs: Vec<EqualityKin>,
    rows: Vec<JRow>,
    no_collide: Vec<(usize, usize)>,
    wake: Vec<f64>,
    parent: Vec<usize>,
}

/// Solver of one run: parameters, persistent state, working memory.
#[derive(Clone, Debug)]
pub struct SoftRun {
    pub params: SoftParams,
    pub state: SoftState,
    scratch: SoftScratch,
    /// Statistics of the last step (display only).
    pub last: SoftStepInfo,
}

/// What one step did.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct SoftStepInfo {
    /// Energy dissipated (or, with belts and solver artefacts, gained: negative) in the step.
    pub loss: f64,
    pub contacts: usize,
    pub awake: usize,
    pub all_asleep: bool,
}

impl SoftRun {
    pub fn new(sys: &System) -> SoftRun {
        let model = &sys.model;
        let mut scratch = SoftScratch { local: model.bodies.iter().map(|b| local_pieces(&b.shape)).collect(), ..Default::default() };
        let mut ids: Vec<(&str, usize)> = model.bodies.iter().enumerate().map(|(g, b)| (b.id.as_str(), g)).collect();
        ids.sort();
        let find = |id: &str| ids.binary_search_by(|p| p.0.cmp(id)).ok().map(|k| ids[k].1);
        for key in &model.no_collide {
            if let Some((a, b)) = key.split_once('|') {
                if let (Some(ga), Some(gb)) = (find(a), find(b)) {
                    scratch.no_collide.push((ga.min(gb), ga.max(gb)));
                }
            }
        }
        scratch.no_collide.sort_unstable();
        SoftRun { params: SoftParams::from_model(model), state: SoftState::new(sys.n), scratch, last: SoftStepInfo::default() }
    }

    /// Restore the persistent state (from a checkpoint).
    pub fn restore(&mut self, state: SoftState) {
        self.state = state;
    }
}

fn add_row(model: &Model, v: &mut [f64], j: &RowJ, dl: f64) {
    let im = &model.dyn_inv_mass;
    let ii = &model.dyn_inv_inertia;
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

fn row_bodies(j: &RowJ, out: &mut Vec<usize>) {
    out.clear();
    if j.ai >= 0 {
        out.push(j.ai as usize);
    }
    if j.bi >= 0 {
        out.push(j.bi as usize);
    }
    for t in &j.ex {
        out.push(t.i as usize);
    }
}

fn kind_code(k: EqualityKind) -> u64 {
    match k {
        EqualityKind::Hinge => 0,
        EqualityKind::Weld => 1,
        EqualityKind::Motor | EqualityKind::Drive => 2,
        EqualityKind::Rod => 3,
        EqualityKind::Slider => 4,
        EqualityKind::Gear => 5,
    }
}

/// Joint rows at the given poses (sorted by key), impulses carried over from `old` (sorted by key).
#[allow(clippy::too_many_arguments)]
fn build_rows(
    model: &Model,
    poses: &[Pose],
    h: f64,
    island: &[f64],
    eqs: &mut Vec<EqualityKin>,
    old_rows: &[JRow],
    old_cache: &[(u64, f64)],
    out: &mut Vec<JRow>,
) {
    out.clear();
    let mut push = |key: u64, j: RowJ, c: f64, kind: JKind, speed: f64, lim: f64| {
        let k = row_minv_row(model, &j, &j);
        let m = if k > 0.0 { 1.0 / k } else { 0.0 };
        let awake = (j.ai >= 0 && island[j.ai as usize] < 0.0) || (j.bi >= 0 && island[j.bi as usize] < 0.0) || j.ex.iter().any(|t| island[t.i as usize] < 0.0);
        out.push(JRow { key, j, c, m, kind, speed, lim, lambda: 0.0, awake });
    };
    equality_kins_into(model, poses, eqs);
    for e in eqs.drain(..) {
        let key = (1u64 << 52) | (kind_code(e.kind) << 44) | ((e.owner as u64) << 8) | e.sub as u64;
        if e.kind == EqualityKind::Drive {
            let m = &model.motors[e.owner];
            let lim = if m.limited { h * m.max_torque } else { f64::INFINITY };
            push(key, e.kin.j, 0.0, JKind::Drive, m.speed, lim);
        } else {
            push(key, e.kin.j, e.kin.value, JKind::Eq, 0.0, 0.0);
        }
    }
    for (k, r) in model.ropes.iter().enumerate() {
        let (kin, _) = rope_kin(model, poses, r);
        push((2u64 << 52) | k as u64, kin.j, kin.value, JKind::Uni, 0.0, 0.0);
    }
    if model.has_limits {
        for (k, sl) in model.sliders.iter().enumerate() {
            if !sl.limited {
                continue;
            }
            let kin = slider_axis_kin(model, poses, sl);
            for side in [-1i8, 1] {
                let finite = if side < 0 { sl.lo > f64::NEG_INFINITY } else { sl.hi < f64::INFINITY };
                if !finite {
                    continue;
                }
                let row = limit_row(sl, k, side, &kin);
                push((3u64 << 52) | ((k as u64) << 1) | u64::from(side > 0), row.j, row.value, JKind::Uni, 0.0, 0.0);
            }
        }
    }
    out.sort_by_key(|r| r.key);
    for r in out.iter_mut() {
        if !old_rows.is_empty() {
            if let Ok(i) = old_rows.binary_search_by_key(&r.key, |o| o.key) {
                r.lambda = old_rows[i].lambda;
            }
        } else if let Ok(i) = old_cache.binary_search_by_key(&r.key, |o| o.0) {
            r.lambda = old_cache[i].1;
        }
    }
}

fn solve_rows(model: &Model, rows: &mut [JRow], v: &mut [f64], soft: Soft, h: f64, biased: bool) {
    for r in rows.iter_mut() {
        if !r.awake || r.m == 0.0 {
            continue;
        }
        let cdot = row_dot(&r.j, v, 0) - r.speed;
        let old = r.lambda;
        let next = match r.kind {
            JKind::Eq => {
                let (bias, ms, is) = if biased { (soft.bias * r.c, soft.mass, soft.imp) } else { (0.0, 1.0, 0.0) };
                old - r.m * ms * (cdot + bias) - is * old
            }
            JKind::Drive => (old - r.m * cdot).clamp(-r.lim, r.lim),
            JKind::Uni => {
                let (bias, ms, is) = if r.c > 0.0 {
                    (r.c / h, 1.0, 0.0)
                } else if biased {
                    (soft.bias * r.c, soft.mass, soft.imp)
                } else {
                    (0.0, 1.0, 0.0)
                };
                (old - r.m * ms * (cdot + bias) - is * old).max(0.0)
            }
        };
        let dl = next - old;
        if dl != 0.0 {
            add_row(model, v, &r.j, dl);
            r.lambda = next;
        }
    }
}

/// Body velocity (dynamic slot or none).
#[inline]
fn vel(v: &[f64], i: i32) -> (V, f64) {
    if i < 0 {
        (V::default(), 0.0)
    } else {
        let i = i as usize;
        (V::new(v[3 * i], v[3 * i + 1]), v[3 * i + 2])
    }
}

#[inline]
fn set_vel(v: &mut [f64], i: i32, lin: V, w: f64) {
    if i >= 0 {
        let i = i as usize;
        v[3 * i] = lin.x;
        v[3 * i + 1] = lin.y;
        v[3 * i + 2] = w;
    }
}

#[inline]
fn cross_sv(w: f64, r: V) -> V {
    V::new(-w * r.y, w * r.x)
}

#[inline]
fn rotate(cs: (f64, f64), r: V) -> V {
    V::new(cs.0 * r.x - cs.1 * r.y, cs.1 * r.x + cs.0 * r.y)
}

/// Current separation of a point from the position deltas since the step began.
#[inline]
fn separation(c: &Contact, p: &CPoint, dp: &[f64], rot: &[(f64, f64)]) -> f64 {
    let (dpa, ra) = if c.ia >= 0 {
        let i = c.ia as usize;
        (V::new(dp[2 * i], dp[2 * i + 1]), rotate(rot[i], p.ra))
    } else {
        (V::default(), p.ra)
    };
    let (dpb, rb) = if c.ib >= 0 {
        let i = c.ib as usize;
        (V::new(dp[2 * i], dp[2 * i + 1]), rotate(rot[i], p.rb))
    } else {
        (V::default(), p.rb)
    };
    let ds = add(sub(dpb, dpa), sub(rb, ra));
    p.base + dot(ds, c.n)
}

fn warm_start(contacts: &[Contact], v: &mut [f64]) {
    for c in contacts {
        let (mut va, mut wa) = vel(v, c.ia);
        let (mut vb, mut wb) = vel(v, c.ib);
        for k in 0..c.count {
            let p = &c.p[k];
            let imp = add(scale(p.ln, c.n), scale(p.lt, c.t));
            wa -= c.ja * cross(p.ra, imp);
            va = sub(va, scale(c.ma, imp));
            wb += c.jb * cross(p.rb, imp);
            vb = add(vb, scale(c.mb, imp));
        }
        wa -= c.ja * c.lr;
        wb += c.jb * c.lr;
        set_vel(v, c.ia, va, wa);
        set_vel(v, c.ib, vb, wb);
    }
}

fn add_totals(contacts: &mut [Contact]) {
    for c in contacts.iter_mut() {
        for k in 0..c.count {
            c.p[k].total += c.p[k].ln;
        }
    }
}

/// Normal impulses with the soft and speculative bias (no friction).
#[allow(clippy::too_many_arguments)]
fn push(contacts: &mut [Contact], v: &mut [f64], dp: &[f64], rot: &[(f64, f64)], cs: Soft, ss: Soft, inv_h: f64, push_speed: f64) {
    for c in contacts.iter_mut() {
        let (mut va, mut wa) = vel(v, c.ia);
        let (mut vb, mut wb) = vel(v, c.ib);
        let soft = if c.stat { ss } else { cs };
        for k in 0..c.count {
            let s = separation(c, &c.p[k], dp, rot);
            let p = &mut c.p[k];
            let (bias, ms, is) = if s > 0.0 { (s * inv_h, 1.0, 0.0) } else { ((soft.mass * soft.bias * s).max(-push_speed), soft.mass, soft.imp) };
            let dv = sub(add(vb, cross_sv(wb, p.rb)), add(va, cross_sv(wa, p.ra)));
            let vn = dot(dv, c.n);
            let imp = (-p.nm * (ms * vn + bias) - is * p.ln).max(-p.ln);
            p.ln += imp;
            p.total += imp;
            let pv = scale(imp, c.n);
            va = sub(va, scale(c.ma, pv));
            wa -= c.ja * cross(p.ra, pv);
            vb = add(vb, scale(c.mb, pv));
            wb += c.jb * cross(p.rb, pv);
        }
        set_vel(v, c.ia, va, wa);
        set_vel(v, c.ib, vb, wb);
    }
}

/// Normal (speculative bias only), rolling resistance and friction.
fn relax(contacts: &mut [Contact], v: &mut [f64], dp: &[f64], rot: &[(f64, f64)], inv_h: f64) {
    for c in contacts.iter_mut() {
        let (mut va, mut wa) = vel(v, c.ia);
        let (mut vb, mut wb) = vel(v, c.ib);
        let mut total_n = 0.0;
        for k in 0..c.count {
            let s = separation(c, &c.p[k], dp, rot);
            let p = &mut c.p[k];
            let bias = if s > 0.0 { s * inv_h } else { 0.0 };
            let dv = sub(add(vb, cross_sv(wb, p.rb)), add(va, cross_sv(wa, p.ra)));
            let vn = dot(dv, c.n);
            let imp = (-p.nm * (vn + bias)).max(-p.ln);
            p.ln += imp;
            p.total += imp;
            total_n += p.ln;
            let pv = scale(imp, c.n);
            va = sub(va, scale(c.ma, pv));
            wa -= c.ja * cross(p.ra, pv);
            vb = add(vb, scale(c.mb, pv));
            wb += c.jb * cross(p.rb, pv);
        }
        if c.roll > 0.0 && c.rmass > 0.0 {
            let cdot = wb - wa;
            let old = c.lr;
            let max = c.roll * total_n;
            c.lr = (old - c.rmass * cdot).clamp(-max, max);
            let d = c.lr - old;
            wa -= c.ja * d;
            wb += c.jb * d;
        }
        for k in 0..c.count {
            let p = &mut c.p[k];
            let dv = sub(add(vb, cross_sv(wb, p.rb)), add(va, cross_sv(wa, p.ra)));
            let vt = dot(dv, c.t) - c.tspeed;
            let max = p.mu * p.ln;
            let old = p.lt;
            p.lt = (old - p.tm * vt).clamp(-max, max);
            let imp = p.lt - old;
            let pv = scale(imp, c.t);
            va = sub(va, scale(c.ma, pv));
            wa -= c.ja * cross(p.ra, pv);
            vb = add(vb, scale(c.mb, pv));
            wb += c.jb * cross(p.rb, pv);
        }
        set_vel(v, c.ia, va, wa);
        set_vel(v, c.ib, vb, wb);
    }
}

/// Restitution after the sub-steps: towards −e·(approach speed), Poisson-capped (no energy gain).
fn restitution(contacts: &mut [Contact], v: &mut [f64], dp: &[f64], rot: &[(f64, f64)], inv_h: f64, threshold: f64) {
    for c in contacts.iter_mut() {
        if c.e == 0.0 {
            continue;
        }
        let (mut va, mut wa) = vel(v, c.ia);
        let (mut vb, mut wb) = vel(v, c.ib);
        for k in 0..c.count {
            let s = separation(c, &c.p[k], dp, rot);
            let p = &mut c.p[k];
            let compression = p.total - p.rest;
            let armed = p.vrel < -threshold && compression > 0.0;
            let bias = if armed {
                c.e * p.vrel
            } else if s > 0.0 {
                s * inv_h
            } else {
                0.0
            };
            let dv = sub(add(vb, cross_sv(wb, p.rb)), add(va, cross_sv(wa, p.ra)));
            let vn = dot(dv, c.n);
            let mut imp = -p.nm * (vn + bias);
            let next = (p.ln + imp).max(0.0);
            imp = next - p.ln;
            let approach = (-p.nm * vn).max(0.0).min(imp.max(0.0));
            if armed {
                let allowance = c.e * (compression + approach) - p.rest;
                imp = imp.min(approach + allowance.max(0.0));
            }
            p.ln += imp;
            p.rest += imp - approach;
            p.total += imp;
            let pv = scale(imp, c.n);
            va = sub(va, scale(c.ma, pv));
            wa -= c.ja * cross(p.ra, pv);
            vb = add(vb, scale(c.mb, pv));
            wb += c.jb * cross(p.rb, pv);
        }
        set_vel(v, c.ia, va, wa);
        set_vel(v, c.ib, vb, wb);
    }
}

fn find(parent: &mut [usize], mut i: usize) -> usize {
    while parent[i] != i {
        parent[i] = parent[parent[i]];
        i = parent[i];
    }
    i
}

fn union(parent: &mut [usize], a: usize, b: usize) {
    let ra = find(parent, a);
    let rb = find(parent, b);
    if ra != rb {
        // the smaller slot is the root: the island id does not depend on the union order
        let (lo, hi) = if ra < rb { (ra, rb) } else { (rb, ra) };
        parent[hi] = lo;
    }
}

/// Build the world geometry of all bodies at the given poses.
fn build_geom(model: &Model, local: &[Vec<LocalPiece>], poses: &[Pose], g: &mut Geom) {
    g.verts.clear();
    g.norms.clear();
    g.pieces.clear();
    g.body.clear();
    g.aabb.clear();
    for (gi, pieces) in local.iter().enumerate() {
        let p = &poses[gi];
        let _ = model;
        let start = g.pieces.len();
        let mut lo = V::new(f64::INFINITY, f64::INFINITY);
        let mut hi = V::new(f64::NEG_INFINITY, f64::NEG_INFINITY);
        for lp in pieces {
            match lp {
                LocalPiece::Circle { c, r } => {
                    let w = V::new(p.x + p.c * c.x - p.s * c.y, p.y + p.s * c.x + p.c * c.y);
                    let plo = V::new(w.x - r, w.y - r);
                    let phi = V::new(w.x + r, w.y + r);
                    g.pieces.push(WPiece { circle: true, c: w, r: *r, start: 0, len: 0, lo: plo, hi: phi });
                    lo = V::new(lo.x.min(plo.x), lo.y.min(plo.y));
                    hi = V::new(hi.x.max(phi.x), hi.y.max(phi.y));
                }
                LocalPiece::Poly { v, n } => {
                    let s0 = g.verts.len();
                    let mut plo = V::new(f64::INFINITY, f64::INFINITY);
                    let mut phi = V::new(f64::NEG_INFINITY, f64::NEG_INFINITY);
                    for k in 0..v.len() {
                        let w = V::new(p.x + p.c * v[k].x - p.s * v[k].y, p.y + p.s * v[k].x + p.c * v[k].y);
                        plo = V::new(plo.x.min(w.x), plo.y.min(w.y));
                        phi = V::new(phi.x.max(w.x), phi.y.max(w.y));
                        g.verts.push(w);
                        g.norms.push(V::new(p.c * n[k].x - p.s * n[k].y, p.s * n[k].x + p.c * n[k].y));
                    }
                    g.pieces.push(WPiece { circle: false, c: V::default(), r: 0.0, start: s0, len: v.len(), lo: plo, hi: phi });
                    lo = V::new(lo.x.min(plo.x), lo.y.min(plo.y));
                    hi = V::new(hi.x.max(phi.x), hi.y.max(phi.y));
                }
            }
        }
        g.body.push((start, g.pieces.len()));
        g.aabb.push([lo.x, lo.y, hi.x, hi.y]);
    }
}

/// One step of length `dt` from state `x` (updated in place).
pub fn soft_step(sys: &System, x: &mut [f64], dt: f64, run: &mut SoftRun) -> SimResult<SoftStepInfo> {
    let model = &sys.model;
    let n = sys.n;
    let prm = run.params;
    let ns = prm.substeps.max(1);
    let h = dt / ns as f64;
    let inv_h = 1.0 / h;
    let sc = &mut run.scratch;
    let st = &mut run.state;
    if st.sleep_time.len() != n {
        *st = SoftState::new(n);
    }
    let cs = make_soft(prm.contact_hz.min(0.125 * inv_h), prm.contact_zeta, h);
    let ss = make_soft((2.0 * prm.contact_hz).min(0.25 * inv_h), prm.contact_zeta, h);
    let js = make_soft(prm.joint_hz.min(0.25 * inv_h), prm.joint_zeta, h);

    compute_poses_into(model, x, &mut sc.poses);
    let e0 = energy(sys, x, &sc.poses).total;
    sc.v.clear();
    sc.v.extend_from_slice(&x[3 * n..6 * n]);
    sc.dp.clear();
    sc.dp.resize(2 * n, 0.0);
    sc.dq.clear();
    sc.dq.resize(n, 0.0);
    sc.rot.clear();
    sc.rot.resize(n, (1.0, 0.0));

    // ---- broad phase ----
    build_geom(model, &sc.local, &sc.poses, &mut sc.geom);
    sc.boxes.clear();
    for (g, b) in model.bodies.iter().enumerate() {
        let mut bx = sc.geom.aabb[g];
        let mut m = prm.speculative;
        if b.index >= 0 {
            let i = b.index as usize;
            let speed = (sc.v[3 * i] * sc.v[3 * i] + sc.v[3 * i + 1] * sc.v[3 * i + 1]).sqrt() + sc.v[3 * i + 2].abs() * b.bound;
            m += dt * speed;
        }
        bx[0] -= m;
        bx[1] -= m;
        bx[2] += m;
        bx[3] += m;
        sc.boxes.push(bx);
    }
    {
        let island = &st.island;
        let awake_dyn = |g: usize| {
            let i = model.bodies[g].index;
            i >= 0 && island[i as usize] < 0.0
        };
        let nc = &sc.no_collide;
        sc.sweep.pairs(&sc.boxes, |_| false, |a, b| (awake_dyn(a) || awake_dyn(b)) && nc.binary_search(&(a, b)).is_err(), &mut sc.pairs);
    }

    // ---- narrow phase ----
    sc.found.clear();
    sc.wake.clear();
    for &(a, b) in &sc.pairs {
        let ba = &model.bodies[a];
        let bb = &model.bodies[b];
        let (va, wa) = vel(&sc.v, ba.index);
        let (vb, wb) = vel(&sc.v, bb.index);
        let dv = sub(vb, va);
        let margin = prm.speculative + dt * (dot(dv, dv).sqrt() + wa.abs() * ba.bound + wb.abs() * bb.bound);
        let (sa, ea) = sc.geom.body[a];
        let (sb, eb) = sc.geom.body[b];
        for pa in sa..ea {
            for pb in sb..eb {
                let (pa_, pb_) = (&sc.geom.pieces[pa], &sc.geom.pieces[pb]);
                if pa_.lo.x > pb_.hi.x + margin || pb_.lo.x > pa_.hi.x + margin || pa_.lo.y > pb_.hi.y + margin || pb_.lo.y > pa_.hi.y + margin {
                    continue;
                }
                let m = collide_pieces(&sc.geom, pa_, pb_, margin, prm.slop);
                if m.count == 0 {
                    continue;
                }
                let key = (((pa - sa) as u32) << 16) | (pb - sb) as u32;
                // an awake moving body touching a sleeping one wakes its island
                let ia = ba.index;
                let ib = bb.index;
                let asleep_a = ia >= 0 && st.island[ia as usize] >= 0.0;
                let asleep_b = ib >= 0 && st.island[ib as usize] >= 0.0;
                if asleep_a != asleep_b {
                    let (sleeper, other) = if asleep_a { (ia, ib) } else { (ib, ia) };
                    let moving = other >= 0 && st.island[other as usize] < 0.0 && st.sleep_time[other as usize] == 0.0;
                    let touching = (0..m.count).any(|k| m.pts[k].sep < prm.slop);
                    if moving && touching {
                        sc.wake.push(st.island[sleeper as usize]);
                    }
                }
                sc.found.push((a, b, key, m));
            }
        }
    }
    if !sc.wake.is_empty() {
        for i in 0..n {
            if st.island[i] >= 0.0 && sc.wake.contains(&st.island[i]) {
                st.island[i] = -1.0;
                st.sleep_time[i] = 0.0;
            }
        }
    }

    // ---- prepare contacts ----
    sc.contacts.clear();
    for &(a, b, key, m) in &sc.found {
        let ba = &model.bodies[a];
        let bb = &model.bodies[b];
        let awake = |i: i32| if i >= 0 && st.island[i as usize] < 0.0 { i } else { -1 };
        let ia = awake(ba.index);
        let ib = awake(bb.index);
        if ia < 0 && ib < 0 {
            continue;
        }
        let mat = pair_material(model, ba, bb);
        let (ma, ja) = if ia >= 0 { (model.dyn_inv_mass[ia as usize], model.dyn_inv_inertia[ia as usize]) } else { (0.0, 0.0) };
        let (mb, jb) = if ib >= 0 { (model.dyn_inv_mass[ib as usize], model.dyn_inv_inertia[ib as usize]) } else { (0.0, 0.0) };
        let nrm = m.n;
        let t = V::new(nrm.y, -nrm.x);
        let pos_a = V::new(sc.poses[a].x, sc.poses[a].y);
        let pos_b = V::new(sc.poses[b].x, sc.poses[b].y);
        let (va, wa) = vel(&sc.v, ia);
        let (vb, wb) = vel(&sc.v, ib);
        let tspeed = ba.belt_speed + bb.belt_speed;
        let piece_a = &sc.geom.pieces[sc.geom.body[a].0 + (key >> 16) as usize];
        let piece_b = &sc.geom.pieces[sc.geom.body[b].0 + (key & 0xffff) as usize];
        let r_roll = if piece_b.circle && ib >= 0 {
            piece_b.r
        } else if piece_a.circle && ia >= 0 {
            piece_a.r
        } else if piece_b.circle {
            piece_b.r
        } else if piece_a.circle {
            piece_a.r
        } else {
            0.0
        };
        let k_roll = ja + jb;
        let mut c = Contact {
            a,
            b,
            ia,
            ib,
            key,
            n: nrm,
            t,
            ma,
            ja,
            mb,
            jb,
            e: mat.restitution,
            roll: mat.rolling * r_roll,
            rmass: if k_roll > 0.0 { 1.0 / k_roll } else { 0.0 },
            lr: 0.0,
            tspeed,
            stat: ia < 0 || ib < 0,
            count: m.count,
            p: [CPoint::default(); 2],
        };
        let (ua, ub, uk) = (a as u32, b as u32, key);
        if let Ok(ri) = st.rolls.binary_search_by(|r| (r.a, r.b, r.key).cmp(&(ua, ub, uk))) {
            c.lr = st.rolls[ri].lr;
        }
        for k in 0..m.count {
            let mp = m.pts[k];
            let ra = sub(mp.p, pos_a);
            let rb = sub(mp.p, pos_b);
            let rna = cross(ra, nrm);
            let rnb = cross(rb, nrm);
            let kn = ma + mb + ja * rna * rna + jb * rnb * rnb;
            let rta = cross(ra, t);
            let rtb = cross(rb, t);
            let kt = ma + mb + ja * rta * rta + jb * rtb * rtb;
            let dvp = sub(add(vb, cross_sv(wb, rb)), add(va, cross_sv(wa, ra)));
            let vt = dot(dvp, t) - tspeed;
            let mu = if vt.abs() <= 0.01 { mat.mu_s.max(mat.mu_k) } else { mat.mu_k };
            let mut p = CPoint {
                id: mp.id,
                ra,
                rb,
                base: mp.sep - dot(sub(rb, ra), nrm),
                nm: if kn > 0.0 { 1.0 / kn } else { 0.0 },
                tm: if kt > 0.0 { 1.0 / kt } else { 0.0 },
                ln: 0.0,
                lt: 0.0,
                total: 0.0,
                rest: 0.0,
                vrel: dot(dvp, nrm),
                mu,
            };
            if let Ok(pi) = st.points.binary_search_by(|q| (q.a, q.b, q.key, q.id).cmp(&(ua, ub, uk, mp.id))) {
                p.ln = st.points[pi].ln;
                p.lt = st.points[pi].lt;
            }
            c.p[k] = p;
        }
        sc.contacts.push(c);
    }

    // ---- sub-steps ----
    let has_rows = !model.hinges.is_empty()
        || !model.welds.is_empty()
        || !model.motors.is_empty()
        || !model.rods.is_empty()
        || !model.sliders.is_empty()
        || !model.gears.is_empty()
        || !model.ropes.is_empty();
    let aux = sys.aux_base;
    let mut work = 0.0;
    let mut damp = 0.0;
    let mut motor = 0.0;
    sc.rows.clear();
    for s in 0..ns {
        if s > 0 {
            x[3 * n..6 * n].copy_from_slice(&sc.v);
            compute_poses_into(model, x, &mut sc.poses);
        }
        sc.rates.reset(0);
        applied_forces_into(sys, &sc.poses, Some(&mut sc.rates), x, None, &mut sc.q)?;
        work += h * sc.rates.applied_work;
        damp += h * sc.rates.damping;
        motor += h * sc.rates.belt_work;
        x[aux + AUX_WORK] += h * sc.rates.applied_work;
        x[aux + AUX_DAMP] += h * sc.rates.damping;
        if let Some(e) = sys.extra_slot {
            for k in 0..crate::regions::EXTRA_LEN {
                x[e + k] += h * sc.rates.extra[k];
            }
        }
        for i in 0..n {
            if st.island[i] >= 0.0 {
                continue;
            }
            sc.v[3 * i] += h * sc.q[3 * i] * model.dyn_inv_mass[i];
            sc.v[3 * i + 1] += h * sc.q[3 * i + 1] * model.dyn_inv_mass[i];
            sc.v[3 * i + 2] += h * sc.q[3 * i + 2] * model.dyn_inv_inertia[i];
        }
        if has_rows {
            let old = std::mem::take(&mut sc.rows);
            build_rows(model, &sc.poses, h, &st.island, &mut sc.eqs, &old, &st.joints, &mut sc.rows);
            for r in &sc.rows {
                if r.awake && r.lambda != 0.0 {
                    add_row(model, &mut sc.v, &r.j, r.lambda);
                }
            }
        }
        warm_start(&sc.contacts, &mut sc.v);
        add_totals(&mut sc.contacts);
        if has_rows {
            solve_rows(model, &mut sc.rows, &mut sc.v, js, h, true);
        }
        push(&mut sc.contacts, &mut sc.v, &sc.dp, &sc.rot, cs, ss, inv_h, prm.push_speed);
        // integrate positions
        for i in 0..n {
            if st.island[i] >= 0.0 {
                continue;
            }
            x[3 * i] += h * sc.v[3 * i];
            x[3 * i + 1] += h * sc.v[3 * i + 1];
            x[3 * i + 2] += h * sc.v[3 * i + 2];
            sc.dp[2 * i] += h * sc.v[3 * i];
            sc.dp[2 * i + 1] += h * sc.v[3 * i + 1];
            sc.dq[i] += h * sc.v[3 * i + 2];
            sc.rot[i] = if sc.dq[i] == 0.0 { (1.0, 0.0) } else { (cos(sc.dq[i]), sin(sc.dq[i])) };
        }
        if let Some(ts) = sys.time_slot {
            x[ts] += h;
        }
        if has_rows {
            x[3 * n..6 * n].copy_from_slice(&sc.v);
            compute_poses_into(model, x, &mut sc.poses);
            let old = std::mem::take(&mut sc.rows);
            build_rows(model, &sc.poses, h, &st.island, &mut sc.eqs, &old, &st.joints, &mut sc.rows);
            solve_rows(model, &mut sc.rows, &mut sc.v, js, h, false);
            for r in &sc.rows {
                if r.kind == JKind::Drive {
                    motor += r.lambda * r.speed;
                }
            }
        }
        relax(&mut sc.contacts, &mut sc.v, &sc.dp, &sc.rot, inv_h);
    }
    for _ in 0..prm.restitution_iters {
        restitution(&mut sc.contacts, &mut sc.v, &sc.dp, &sc.rot, inv_h, prm.restitution_threshold);
    }
    if motor != 0.0 {
        x[aux + AUX_BELT] += motor;
    }

    // ---- store impulses ----
    st.points.clear();
    st.rolls.clear();
    let mut points = 0;
    for c in &sc.contacts {
        let (a, b, key) = (c.a as u32, c.b as u32, c.key);
        for k in 0..c.count {
            st.points.push(CachedPoint { a, b, key, id: c.p[k].id, ln: c.p[k].ln, lt: c.p[k].lt });
        }
        points += c.count;
        if c.lr != 0.0 {
            st.rolls.push(CachedRoll { a, b, key, lr: c.lr });
        }
    }
    st.points.sort_by_key(|p| (p.a, p.b, p.key, p.id));
    st.rolls.sort_by_key(|p| (p.a, p.b, p.key));
    st.joints.clear();
    for r in &sc.rows {
        st.joints.push((r.key, r.lambda));
    }

    // ---- islands and sleep ----
    let mut awake = 0;
    let mut all_asleep = n > 0;
    if prm.sleep {
        for i in 0..n {
            if st.island[i] >= 0.0 {
                continue;
            }
            let g = model.dynamic[i];
            let speed = (sc.v[3 * i] * sc.v[3 * i] + sc.v[3 * i + 1] * sc.v[3 * i + 1]).sqrt().max(sc.v[3 * i + 2].abs() * model.bodies[g].bound);
            st.sleep_time[i] = if speed > prm.sleep_speed { 0.0 } else { st.sleep_time[i] + dt };
        }
        sc.parent.clear();
        sc.parent.extend(0..n);
        for c in &sc.contacts {
            if c.ia >= 0 && c.ib >= 0 && (0..c.count).any(|k| c.p[k].ln > 0.0) {
                union(&mut sc.parent, c.ia as usize, c.ib as usize);
            }
        }
        let mut members = Vec::new();
        for r in &sc.rows {
            row_bodies(&r.j, &mut members);
            for w in members.windows(2) {
                union(&mut sc.parent, w[0], w[1]);
            }
        }
        for sp in &model.springs {
            if let (Some(a), Some(b)) = (sp.a.body, sp.b.body) {
                let (ia, ib) = (model.bodies[a].index, model.bodies[b].index);
                if ia >= 0 && ib >= 0 {
                    union(&mut sc.parent, ia as usize, ib as usize);
                }
            }
        }
        // the least sleep time of each island (by root)
        let mut least = vec![f64::INFINITY; n];
        for i in 0..n {
            if st.island[i] >= 0.0 {
                continue;
            }
            let r = find(&mut sc.parent, i);
            least[r] = least[r].min(st.sleep_time[i]);
        }
        for i in 0..n {
            if st.island[i] >= 0.0 {
                continue;
            }
            let r = find(&mut sc.parent, i);
            if least[r] >= prm.sleep_time {
                st.island[i] = r as f64;
                sc.v[3 * i] = 0.0;
                sc.v[3 * i + 1] = 0.0;
                sc.v[3 * i + 2] = 0.0;
            }
        }
    }
    for i in 0..n {
        if st.island[i] < 0.0 {
            awake += 1;
            all_asleep = false;
        }
    }
    if !prm.sleep {
        all_asleep = false;
    }
    x[3 * n..6 * n].copy_from_slice(&sc.v);
    compute_poses_into(model, x, &mut sc.poses);
    let e1 = energy(sys, x, &sc.poses).total;
    let loss = if motor != 0.0 { e0 + work + motor - damp - e1 } else { e0 + work - damp - e1 };
    let info = SoftStepInfo { loss, contacts: points, awake, all_asleep };
    run.last = info;
    Ok(info)
}

/// Contact points of a state, for drawing (D133): position, normal and separation of every manifold point
/// within the contact slop, by pair. Geometry only (no forces).
pub fn contact_points(sys: &System, x: &[f64]) -> Vec<(usize, usize, f64, f64, f64, f64, f64)> {
    let model = &sys.model;
    let mut poses = Vec::new();
    compute_poses_into(model, x, &mut poses);
    let local: Vec<Vec<LocalPiece>> = model.bodies.iter().map(|b| local_pieces(&b.shape)).collect();
    let mut g = Geom::default();
    build_geom(model, &local, &poses, &mut g);
    let slop = 0.005;
    let boxes: Vec<[f64; 4]> = g.aabb.iter().map(|b| [b[0] - slop, b[1] - slop, b[2] + slop, b[3] + slop]).collect();
    let mut sweep = Sweep::default();
    let mut pairs = Vec::new();
    sweep.pairs(&boxes, |_| false, |a, b| model.bodies[a].index >= 0 || model.bodies[b].index >= 0, &mut pairs);
    let mut out = Vec::new();
    for (a, b) in pairs {
        let (sa, ea) = g.body[a];
        let (sb, eb) = g.body[b];
        for pa in sa..ea {
            for pb in sb..eb {
                let m = collide_pieces(&g, &g.pieces[pa], &g.pieces[pb], slop, slop);
                for k in 0..m.count {
                    out.push((a, b, m.pts[k].p.x, m.pts[k].p.y, m.n.x, m.n.y, m.pts[k].sep));
                }
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn state_round_trip() {
        let mut s = SoftState::new(3);
        s.points.push(CachedPoint { a: 0, b: 4, key: 65537, id: (2 << 20) | 5, ln: 0.25, lt: -0.125 });
        s.rolls.push(CachedRoll { a: 0, b: 4, key: 1, lr: 1e-3 });
        s.joints.push(((1u64 << 52) | 7, 2.5));
        s.sleep_time[1] = 0.3;
        s.island[2] = 2.0;
        let d = s.encode();
        assert_eq!(SoftState::decode(&d), Some(s));
        assert_eq!(SoftState::decode(&d[..d.len() - 1]), None);
    }

    #[test]
    fn soft_coefficients_sum_to_one() {
        let s = make_soft(30.0, 10.0, 1.0 / 480.0);
        assert!((s.mass + s.imp - 1.0).abs() < 1e-15);
        assert!(s.bias > 0.0);
    }
}
