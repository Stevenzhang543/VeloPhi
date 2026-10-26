//! Dynamics for a fixed contact/connector mode (port of `src/core/solver/dynamics.ts`). The solution of a mode
//! is written into a reusable `ModeSolution` (same values as a fresh one; only allocations are saved).

use crate::expr::{branch_of, fill_env, ENV_SIZE};
use crate::js::js_min;
use crate::kinematics::{
    anchor_state, compute_poses_into, contact_kin, distance_kin, equality_kins_into, pair_features, pair_probes, roll_kin, rope_kin, rope_path,
    slider_axis_kin, ConstraintKin, ContactFeature, ContactKin, EqualityKin, EqualityKind, FeatureB, Pose, Probe, RowJ, RowTerm,
};
use crate::linalg::{solve_dense_into, LinWork};
use crate::message::{Message, SimResult};
use crate::model::{central_force, central_potential, pair_key, pair_material, Model, SliderModel};
use crate::scene::Material;

/// Tolerances shared by the solver (TOL of dynamics.ts).
pub mod tol {
    pub const TOUCH: f64 = 1e-8;
    pub const DEEP: f64 = 1e-5;
    pub const EXT: f64 = 1e-9;
    pub const VEL: f64 = 1e-7;
    pub const ZENO: f64 = 1e-5;
    pub const FORCE: f64 = 1e-9;
    pub const ACC: f64 = 1e-9;
    pub const TIME: f64 = 1e-12;
    pub const DRIFT: f64 = 1e-12;
    pub const VEL_DRIFT: f64 = 1e-12;
}

/// A pair of bodies that can touch.
#[derive(Clone, Debug)]
pub struct PairInfo {
    pub index: usize,
    pub key: String,
    pub x: usize,
    pub y: usize,
    pub features: Vec<ContactFeature>,
    pub probes: Vec<Probe>,
    pub material: Material,
}

/// Friction state of a contact unit.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Friction {
    None,
    Stick,
    Slide,
}

impl Friction {
    /// Index in ['none', 'stick', 'slide'] (codec).
    pub fn code(self) -> u8 {
        match self {
            Friction::None => 0,
            Friction::Stick => 1,
            Friction::Slide => 2,
        }
    }
    /// From the codec index.
    pub fn from_code(c: f64) -> Friction {
        if c == 1.0 {
            Friction::Stick
        } else if c == 2.0 {
            Friction::Slide
        } else {
            Friction::None
        }
    }
}

/// Mode of one contact unit: features as indices into the pair's feature list.
#[derive(Clone, Debug, PartialEq)]
pub struct UnitMode {
    pub pair: usize,
    pub ref_: usize,
    pub points: Vec<usize>,
    pub open: Vec<usize>,
    pub friction: Friction,
    pub s: f64,
    /// Rolling resistance (26.52, D59): None without; 0 rolling rest, ±1 rolling direction.
    pub roll: Option<i8>,
}

/// Contact and connector mode; `sw` holds the frozen switch branches (None: the scene has no switches); `limit`
/// and `slip` (26.52) the end stops of the sliders and the torque-limited motors (None when the scene has none).
#[derive(Clone, Debug, PartialEq, Default)]
pub struct Mode {
    pub units: Vec<UnitMode>,
    pub taut: Vec<bool>,
    pub sw: Option<Vec<i8>>,
    pub limit: Option<Vec<i8>>,
    pub slip: Option<Vec<i8>>,
}

/// Kind of a constraint row.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RowKind {
    Hinge,
    /// Connectors of 26.51: weld, motor (pin rows), drive (speed motor), slider, gear.
    Weld,
    Motor,
    Drive,
    Rod,
    Slider,
    Gear,
    Rope,
    Normal,
    Tangent,
    /// 26.52: a closed slider end stop, rolling rest.
    Limit,
    Roll,
}

impl RowKind {
    /// Row kind of an equality constraint.
    pub fn of(k: EqualityKind) -> RowKind {
        match k {
            EqualityKind::Hinge => RowKind::Hinge,
            EqualityKind::Weld => RowKind::Weld,
            EqualityKind::Motor => RowKind::Motor,
            EqualityKind::Drive => RowKind::Drive,
            EqualityKind::Rod => RowKind::Rod,
            EqualityKind::Slider => RowKind::Slider,
            EqualityKind::Gear => RowKind::Gear,
        }
    }
}

/// One active constraint at acceleration level: J·a + c = 0.
#[derive(Clone, Debug)]
pub struct Row {
    pub kind: RowKind,
    pub owner: usize,
    pub sub: usize,
    pub j: RowJ,
    /// Force direction; None: the same as `j`.
    pub f: Option<RowJ>,
    pub c: f64,
    pub value: f64,
    pub vel: f64,
}

impl Row {
    /// Force direction of the row.
    #[inline]
    pub fn force(&self) -> &RowJ {
        self.f.as_ref().unwrap_or(&self.j)
    }
}

/// Forces and kinematics of a contact unit in a mode solution.
#[derive(Clone, Debug, Default)]
pub struct UnitState {
    pub normal: f64,
    pub tangent: f64,
    pub vt: f64,
    pub at: f64,
    pub ref_kin: ContactKin,
    pub point_kin: Vec<ContactKin>,
    pub point_lambda: Vec<f64>,
    pub open_kin: Vec<ContactKin>,
    /// Rolling resistance couple on A, relative rolling and its rate (26.52); the rolling kinematics when present.
    pub roll: f64,
    pub wr: f64,
    pub wra: f64,
    pub roll_kin: Option<ConstraintKin>,
}

/// Energy ledger rates (W).
#[derive(Clone, Debug, Default)]
pub struct Rates {
    pub heat: f64,
    pub applied_work: f64,
    pub damping: f64,
    pub belt_work: f64,
    pub pair_slide: Vec<f64>,
    pub pair_heat: Vec<f64>,
}

impl Rates {
    /// Zeroed rates for `pairs` contact pairs.
    pub fn reset(&mut self, pairs: usize) {
        self.heat = 0.0;
        self.applied_work = 0.0;
        self.damping = 0.0;
        self.belt_work = 0.0;
        set_len(&mut self.pair_slide, pairs);
        self.pair_slide.fill(0.0);
        set_len(&mut self.pair_heat, pairs);
        self.pair_heat.fill(0.0);
    }
}

/// Kinematic values of a rope in a mode solution.
#[derive(Clone, Copy, Debug, Default)]
pub struct RopeState {
    pub value: f64,
    pub vel: f64,
    pub acc: f64,
}

/// Solution of the dynamics of a mode at one state.
#[derive(Clone, Debug, Default)]
pub struct ModeSolution {
    pub poses: Vec<Pose>,
    pub rows: Vec<Row>,
    pub lambda: Vec<f64>,
    pub acc: Vec<f64>,
    pub q: Vec<f64>,
    pub consistent: bool,
    pub residual: f64,
    pub rank: usize,
    pub units: Vec<UnitState>,
    pub rope_tension: Vec<f64>,
    pub rope_kin: Vec<RopeState>,
    pub rates: Rates,
    /// End-stop force per slider (26.52; empty without stops), motor torque on b and rate of e per motor (empty
    /// without torque-limited motors).
    pub limit_force: Vec<f64>,
    pub drive_torque: Vec<f64>,
    pub drive_acc: Vec<f64>,
    /// Scratch space of the solve (not part of the result).
    work: SolveWork,
}

#[derive(Clone, Debug, Default)]
struct SolveWork {
    a: Vec<f64>,
    rhs: Vec<f64>,
    a0: Vec<f64>,
    g: Vec<f64>,
    lin: LinWork,
    rope_rows: Vec<(RowJ, f64)>,
    eqs: Vec<EqualityKin>,
}

/// Set the length of a buffer whose entries are all written afterwards (no zeroing when it already fits).
#[inline]
fn set_len(v: &mut Vec<f64>, n: usize) {
    if v.len() != n {
        v.clear();
        v.resize(n, 0.0);
    }
}

/// Ledger offsets after `aux_base`.
pub const AUX_HEAT: usize = 0;
pub const AUX_WORK: usize = 1;
pub const AUX_DAMP: usize = 2;
pub const AUX_BELT: usize = 3;
pub const AUX_FIXED: usize = 4;

/// The compiled model plus the layout of the state vector.
#[derive(Clone, Debug)]
pub struct System {
    pub model: Model,
    pub n: usize,
    pub pairs: Vec<PairInfo>,
    pub aux_base: usize,
    /// Index of the time entry (scenes with variable forces), None otherwise.
    pub time_slot: Option<usize>,
    pub size: usize,
}

/// Build the system: contact pairs, state layout, and the lengths given as "initial".
pub fn build_system(model: Model) -> System {
    let mut pairs = Vec::new();
    let nb = model.bodies.len();
    for i in 0..nb {
        for j in i + 1..nb {
            let (xd, yd) = (model.bodies[i].dynamic, model.bodies[j].dynamic);
            if !xd && !yd {
                continue;
            }
            let key = pair_key(&model.bodies[i].id, &model.bodies[j].id);
            if model.no_collide.contains(&key) {
                continue;
            }
            let features = pair_features(&model, i, j);
            let probes = pair_probes(&model, i, j);
            let material = pair_material(&model, &model.bodies[i], &model.bodies[j]);
            pairs.push(PairInfo { index: pairs.len(), key, x: i, y: j, features, probes, material });
        }
    }
    let n = model.n;
    let aux_base = 6 * n;
    let time_slot = if model.has_expr { Some(aux_base + AUX_FIXED + 2 * pairs.len()) } else { None };
    let size = aux_base + AUX_FIXED + 2 * pairs.len() + usize::from(model.has_expr);
    let mut sys = System { model, n, pairs, aux_base, time_slot, size };
    let x0 = initial_state(&sys);
    let mut poses = Vec::new();
    compute_poses_into(&sys.model, &x0, &mut poses);
    let model = &mut sys.model;
    for k in 0..model.ropes.len() {
        if !model.ropes[k].length.is_finite() {
            let l = rope_path(model, &poses, &model.ropes[k]).length;
            model.ropes[k].length = l;
        }
    }
    for k in 0..model.rods.len() {
        if !model.rods[k].length.is_finite() {
            let (d, _, _) = distance_kin(model, &poses, &model.rods[k].a, &model.rods[k].b);
            model.rods[k].length = d.value;
        }
    }
    for k in 0..model.springs.len() {
        if !model.springs[k].rest_length.is_finite() {
            let (d, _, _) = distance_kin(model, &poses, &model.springs[k].a, &model.springs[k].b);
            model.springs[k].rest_length = d.value;
        }
    }
    // 26.51: the relative angles of welds and sliders, and the angle sum of gears, are kept as they start
    let th = |b: Option<usize>| match b {
        Some(g) => poses[g].th,
        None => 0.0,
    };
    for w in model.welds.iter_mut() {
        if !w.angle0.is_finite() {
            w.angle0 = th(w.b.body) - th(w.a.body);
        }
    }
    for sl in model.sliders.iter_mut() {
        if !sl.angle0.is_finite() {
            sl.angle0 = th(sl.b.body) - th(sl.a.body);
        }
    }
    for g in model.gears.iter_mut() {
        if !g.offset0.is_finite() {
            g.offset0 = th(g.a) + g.ratio * th(g.b);
        }
    }
    sys
}

/// State vector of the scene's initial positions and velocities (ledger entries 0).
pub fn initial_state(sys: &System) -> Vec<f64> {
    let mut x = vec![0.0; sys.size];
    let n = sys.n;
    for &g in &sys.model.dynamic {
        let b = &sys.model.bodies[g];
        let i = b.index as usize;
        x[3 * i] = b.def_position.x;
        x[3 * i + 1] = b.def_position.y;
        x[3 * i + 2] = b.def_angle;
        x[3 * n + 3 * i] = b.def_velocity.x;
        x[3 * n + 3 * i + 1] = b.def_velocity.y;
        x[3 * n + 3 * i + 2] = if b.inv_inertia > 0.0 { b.def_angular_velocity } else { 0.0 };
    }
    // A branch (D52) continues its parent's energy ledger
    if let Some(l) = &sys.model.settings.start_ledger {
        let a = sys.aux_base;
        x[a + AUX_HEAT] = l.friction_heat;
        x[a + AUX_WORK] = l.applied_work;
        x[a + AUX_DAMP] = l.damping;
        x[a + AUX_BELT] = l.belt_work;
        for p in &sys.pairs {
            if let Some((_, slide, heat)) = l.pairs.iter().find(|(k, _, _)| *k == p.key) {
                x[a + AUX_FIXED + 2 * p.index] = *slide;
                x[a + AUX_FIXED + 2 * p.index + 1] = *heat;
            }
        }
    }
    x
}

// ---- Helpers ----
/// Product j · M⁻¹ · fᵀ of two rows.
pub fn row_minv_row(model: &Model, j: &RowJ, f: &RowJ) -> f64 {
    let im = &model.dyn_inv_mass;
    let ii = &model.dyn_inv_inertia;
    let mut s = 0.0;
    if j.ai >= 0 {
        let a = j.ai as usize;
        if j.ai == f.ai {
            s += im[a] * (j.ax * f.ax + j.ay * f.ay) + ii[a] * j.aw * f.aw;
        }
        if j.ai == f.bi {
            s += im[a] * (j.ax * f.bx + j.ay * f.by) + ii[a] * j.aw * f.bw;
        }
    }
    if j.bi >= 0 {
        let b = j.bi as usize;
        if j.bi == f.ai {
            s += im[b] * (j.bx * f.ax + j.by * f.ay) + ii[b] * j.bw * f.aw;
        }
        if j.bi == f.bi {
            s += im[b] * (j.bx * f.bx + j.by * f.by) + ii[b] * j.bw * f.bw;
        }
    }
    if !j.ex.is_empty() || !f.ex.is_empty() {
        s += extra_minv(model, j, f);
    }
    s
}

/// All terms of a row (slots a and b first, unused slots with index −1).
pub fn row_terms(j: &RowJ) -> Vec<RowTerm> {
    let mut out = vec![RowTerm { i: j.ai, x: j.ax, y: j.ay, w: j.aw }, RowTerm { i: j.bi, x: j.bx, y: j.by, w: j.bw }];
    out.extend_from_slice(&j.ex);
    out
}

fn extra_minv(model: &Model, j: &RowJ, f: &RowJ) -> f64 {
    let jt = row_terms(j);
    let ft = row_terms(f);
    let mut s = 0.0;
    for (a, p) in jt.iter().enumerate() {
        for (c, q) in ft.iter().enumerate() {
            if a < 2 && c < 2 {
                continue;
            }
            if p.i < 0 || p.i != q.i {
                continue;
            }
            let i = p.i as usize;
            s += model.dyn_inv_mass[i] * (p.x * q.x + p.y * q.y) + model.dyn_inv_inertia[i] * p.w * q.w;
        }
    }
    s
}

/// Product j · v with a generalized vector v (3n entries from `offset`).
#[inline]
pub fn row_dot(j: &RowJ, v: &[f64], offset: usize) -> f64 {
    let mut s = 0.0;
    if j.ai >= 0 {
        let a = offset + 3 * j.ai as usize;
        s += j.ax * v[a] + j.ay * v[a + 1] + j.aw * v[a + 2];
    }
    if j.bi >= 0 {
        let b = offset + 3 * j.bi as usize;
        s += j.bx * v[b] + j.by * v[b + 1] + j.bw * v[b + 2];
    }
    for t in &j.ex {
        let o = offset + 3 * t.i as usize;
        s += t.x * v[o] + t.y * v[o + 1] + t.w * v[o + 2];
    }
    s
}

/// Add λ · fᵀ (the generalized force of a row) to `out`.
#[inline]
pub fn add_row(out: &mut [f64], f: &RowJ, lambda: f64) {
    if f.ai >= 0 {
        let a = 3 * f.ai as usize;
        out[a] += f.ax * lambda;
        out[a + 1] += f.ay * lambda;
        out[a + 2] += f.aw * lambda;
    }
    if f.bi >= 0 {
        let b = 3 * f.bi as usize;
        out[b] += f.bx * lambda;
        out[b + 1] += f.by * lambda;
        out[b + 2] += f.bw * lambda;
    }
    for t in &f.ex {
        let o = 3 * t.i as usize;
        out[o] += t.x * lambda;
        out[o + 1] += t.y * lambda;
        out[o + 2] += t.w * lambda;
    }
}

/// Row a + k·b; both rows act on the same two bodies (contact rows of one pair).
pub fn combine(a: &RowJ, b: &RowJ, k: f64) -> RowJ {
    let mut r = a.clone();
    let mut put = |bi: i32, x: f64, y: f64, w: f64| {
        if bi < 0 {
            return;
        }
        if r.ai == bi {
            r.ax += k * x;
            r.ay += k * y;
            r.aw += k * w;
        } else if r.bi == bi {
            r.bx += k * x;
            r.by += k * y;
            r.bw += k * w;
        } else if r.ai < 0 {
            r.ai = bi;
            r.ax = k * x;
            r.ay = k * y;
            r.aw = k * w;
        } else {
            r.bi = bi;
            r.bx = k * x;
            r.by = k * y;
            r.bw = k * w;
        }
    };
    put(b.ai, b.ax, b.ay, b.aw);
    put(b.bi, b.bx, b.by, b.bw);
    r
}

/// |g| of the scene.
#[inline]
fn gravity_size(model: &Model) -> f64 {
    let g = model.settings.gravity;
    (g.x * g.x + g.y * g.y).sqrt()
}

/// Frozen branches to use: `sw` when it covers every switch, else None (exact evaluation).
#[inline]
fn effective_sw<'a>(model: &Model, sw: Option<&'a [i8]>) -> Option<&'a [i8]> {
    sw.filter(|s| s.len() == model.arena.switches.len())
}

/// Value of variable force k at state X (world components, N); an error when not finite.
pub fn force_value(sys: &System, k: usize, x: &[f64], sw: Option<&[i8]>) -> SimResult<(f64, f64)> {
    let model = &sys.model;
    let f = &model.forces[k];
    let Some((ex, ey)) = f.expr else { return Ok((f.force.x, f.force.y)) };
    let Some(g) = f.a.body else { return Ok((0.0, 0.0)) };
    let body = &model.bodies[g];
    if body.index < 0 {
        return Ok((0.0, 0.0));
    }
    let mut env = [0.0; ENV_SIZE];
    fill_env(&mut env, x, sys.n, body.index as usize, sys.time_slot, body.mass, gravity_size(model));
    // A branch (D52) runs from 0 on its own clock; its variable forces see the absolute time
    let t0 = model.settings.start_time;
    if t0 != 0.0 {
        env[0] += t0;
    }
    let s = effective_sw(model, sw);
    let fx = model.arena.eval(ex, &env, s);
    let fy = model.arena.eval(ey, &env, s);
    if !fx.is_finite() || !fy.is_finite() {
        let t = env[0];
        return Err(Message::new("err.forceNotFinite").text("force", f.name.clone()).num("t", t).num("fx", fx).num("fy", fy));
    }
    Ok((fx, fy))
}

/// Switching argument of switch s at state X with the frozen branches sw (None: exact).
pub fn switch_arg(sys: &System, s: usize, x: &[f64], sw: Option<&[i8]>) -> f64 {
    let model = &sys.model;
    let f = &model.forces[model.switch_force[s]];
    let Some(g) = f.a.body else { return 1.0 };
    let body = &model.bodies[g];
    if body.index < 0 {
        return 1.0;
    }
    let mut env = [0.0; ENV_SIZE];
    fill_env(&mut env, x, sys.n, body.index as usize, sys.time_slot, body.mass, gravity_size(model));
    let t0 = model.settings.start_time;
    if t0 != 0.0 {
        env[0] += t0;
    }
    model.arena.switch_arg(s, &env, effective_sw(model, sw))
}

/// Branches of all switches at state X (exact evaluation of the arguments).
pub fn switch_branches(sys: &System, x: &[f64]) -> Vec<i8> {
    let model = &sys.model;
    (0..model.arena.switches.len()).map(|s| branch_of(&model.arena.switches[s], switch_arg(sys, s, x, None))).collect()
}

/// Applied generalized forces into `q` (3n): gravity, constant and variable forces, springs.
pub fn applied_forces_into(sys: &System, poses: &[Pose], mut rates: Option<&mut Rates>, x: &[f64], sw: Option<&[i8]>, q: &mut Vec<f64>) -> SimResult<()> {
    let model = &sys.model;
    q.clear();
    q.resize(3 * sys.n, 0.0);
    let g = model.settings.gravity;
    for &bg in &model.dynamic {
        let b = &model.bodies[bg];
        let i = b.index as usize;
        q[3 * i] = b.mass * g.x;
        q[3 * i + 1] = b.mass * g.y;
    }
    // 26.51 (D50): drag on the centre of mass, F = −(b + c|v|)v; its power is dissipated (damping entry)
    for &bg in &model.dynamic {
        let b = &model.bodies[bg];
        if b.drag_lin == 0.0 && b.drag_quad == 0.0 {
            continue;
        }
        let p = &poses[bg];
        let sp = (p.vx * p.vx + p.vy * p.vy).sqrt();
        let k = b.drag_lin + b.drag_quad * sp;
        let i = b.index as usize;
        q[3 * i] -= k * p.vx;
        q[3 * i + 1] -= k * p.vy;
        if let Some(r) = rates.as_deref_mut() {
            r.damping += k * sp * sp;
        }
    }
    // 26.51 (D50): gravitation between every pair of bodies with mass, at least one of them moving
    if model.g_const > 0.0 {
        let at = &model.attractors;
        for i in 0..at.len() {
            for j in i + 1..at.len() {
                let a = &model.bodies[at[i]];
                let b = &model.bodies[at[j]];
                if !a.dynamic && !b.dynamic {
                    continue;
                }
                let (pax, pay) = if a.dynamic { (poses[at[i]].x, poses[at[i]].y) } else { (a.grav_pos.x, a.grav_pos.y) };
                let (pbx, pby) = if b.dynamic { (poses[at[j]].x, poses[at[j]].y) } else { (b.grav_pos.x, b.grav_pos.y) };
                let dx = pbx - pax;
                let dy = pby - pay;
                let d2 = dx * dx + dy * dy;
                #[allow(clippy::neg_cmp_op_on_partial_ord)]
                if !(d2 > 0.0) {
                    continue;
                }
                let d = d2.sqrt();
                // Softened inside the sum of the bounding radii (see dynamics.ts)
                let rr = a.bound + b.bound;
                let f = if d >= rr { model.g_const * a.attract * b.attract / d2 } else { model.g_const * a.attract * b.attract * d / (rr * rr * rr) };
                let fx = f * dx / d;
                let fy = f * dy / d;
                if a.dynamic {
                    let k = a.index as usize;
                    q[3 * k] += fx;
                    q[3 * k + 1] += fy;
                }
                if b.dynamic {
                    let k = b.index as usize;
                    q[3 * k] -= fx;
                    q[3 * k + 1] -= fy;
                }
            }
        }
    }
    // 26.52 (D60): central fields; conservative (the potential is part of the mechanical energy)
    for c in &model.centrals {
        let p = anchor_state(poses, &c.a);
        let ci = c.a.body.map_or(-1, |g| model.bodies[g].index);
        for &t in &c.targets {
            let pt = &poses[t];
            let dx = pt.x - p.px;
            let dy = pt.y - p.py;
            let r = (dx * dx + dy * dy).sqrt();
            #[allow(clippy::neg_cmp_op_on_partial_ord)]
            if !(r > 0.0) {
                continue;
            }
            let f = central_force(c.k, c.n, r, model.bodies[t].bound);
            let fx = -f * dx / r;
            let fy = -f * dy / r;
            let ti = model.bodies[t].index as usize;
            q[3 * ti] += fx;
            q[3 * ti + 1] += fy;
            if ci >= 0 {
                let k = ci as usize;
                q[3 * k] -= fx;
                q[3 * k + 1] -= fy;
                q[3 * k + 2] -= p.rx * fy - p.ry * fx;
            }
        }
    }
    // 26.51 (D51): torque motors act on b and react on a; their power is motor work
    for m in &model.motors {
        if !m.torque_mode {
            continue;
        }
        let ib = m.b.body.map_or(-1, |g| model.bodies[g].index);
        let ia = m.a.body.map_or(-1, |g| model.bodies[g].index);
        if ib >= 0 {
            q[3 * ib as usize + 2] += m.torque;
        }
        if ia >= 0 {
            q[3 * ia as usize + 2] -= m.torque;
        }
        if let Some(r) = rates.as_deref_mut() {
            let wb = m.b.body.map_or(0.0, |g| poses[g].w);
            let wa = m.a.body.map_or(0.0, |g| poses[g].w);
            r.belt_work += m.torque * (wb - wa);
        }
    }
    for k in 0..model.forces.len() {
        let f = &model.forces[k];
        let Some(bg) = f.a.body else { continue };
        let idx = model.bodies[bg].index;
        if idx < 0 {
            continue;
        }
        let p = anchor_state(poses, &f.a);
        let i = idx as usize;
        let (fx, fy) = if f.expr.is_some() { force_value(sys, k, x, sw)? } else { (f.force.x, f.force.y) };
        q[3 * i] += fx;
        q[3 * i + 1] += fy;
        q[3 * i + 2] += p.rx * fy - p.ry * fx;
        if let Some(r) = rates.as_deref_mut() {
            r.applied_work += fx * p.vx + fy * p.vy;
        }
    }
    for s in &model.springs {
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
        let mag = if s.cubic != 0.0 { -s.stiffness * ext - s.cubic * ext * ext * ext - s.damping * vrel } else { -s.stiffness * ext - s.damping * vrel };
        if let Some(bg) = s.a.body {
            let idx = model.bodies[bg].index;
            if idx >= 0 {
                let i = idx as usize;
                q[3 * i] += mag * ux;
                q[3 * i + 1] += mag * uy;
                q[3 * i + 2] += pa.rx * mag * uy - pa.ry * mag * ux;
            }
        }
        if let Some(bg) = s.b.body {
            let idx = model.bodies[bg].index;
            if idx >= 0 {
                let i = idx as usize;
                q[3 * i] -= mag * ux;
                q[3 * i + 1] -= mag * uy;
                q[3 * i + 2] -= pb.rx * mag * uy - pb.ry * mag * ux;
            }
        }
        if let Some(r) = rates.as_deref_mut() {
            r.damping += s.damping * vrel * vrel;
        }
    }
    Ok(())
}

/// Surface speed of the face owner of a feature (conveyors).
#[inline]
pub fn belt_of(model: &Model, f: &ContactFeature) -> f64 {
    match &f.b {
        FeatureB::Face(face) => model.bodies[face.body].belt_speed,
        FeatureB::Point(..) => 0.0,
    }
}

/// Radius of the rolling body of a contact (26.52, D59): the round side's (the smaller when both are round), 0 when
/// neither side is round or neither body can turn.
pub fn roll_radius(model: &Model, f: &ContactFeature) -> f64 {
    let ra = f.a.radius;
    let rb = match &f.b {
        FeatureB::Point(p, _) => p.radius,
        FeatureB::Face(_) => 0.0,
    };
    let r = if ra > 0.0 && rb > 0.0 {
        js_min(ra, rb)
    } else if ra > 0.0 {
        ra
    } else {
        rb
    };
    #[allow(clippy::neg_cmp_op_on_partial_ord)]
    if !(r > 0.0) {
        return 0.0;
    }
    if model.bodies[f.a.body].inv_inertia > 0.0 || model.bodies[f.b_body()].inv_inertia > 0.0 {
        r
    } else {
        0.0
    }
}

/// The end-stop row of slider k on side −1 (lower) or +1 (upper): g = s − lo or hi − s ≥ 0 (26.52).
pub fn limit_row(sl: &SliderModel, k: usize, side: i8, kin: &ConstraintKin) -> Row {
    if side < 0 {
        return Row { kind: RowKind::Limit, owner: k, sub: 0, j: kin.j.clone(), f: None, c: kin.c, value: kin.value - sl.lo, vel: kin.vel };
    }
    let j = neg_row(&kin.j);
    Row { kind: RowKind::Limit, owner: k, sub: 1, j, f: None, c: -kin.c, value: sl.hi - kin.value, vel: -kin.vel }
}

/// A row with every coefficient negated.
pub fn neg_row(r: &RowJ) -> RowJ {
    RowJ {
        ai: r.ai,
        ax: -r.ax,
        ay: -r.ay,
        aw: -r.aw,
        bi: r.bi,
        bx: -r.bx,
        by: -r.by,
        bw: -r.bw,
        ex: r.ex.iter().map(|t| RowTerm { i: t.i, x: -t.x, y: -t.y, w: -t.w }).collect(),
    }
}

/// Applied torques of slipping torque-limited motors (26.52, D58), with their power as motor work.
fn slip_torques(model: &Model, poses: &[Pose], slip: &[i8], q: &mut [f64], rates: &mut Rates) {
    for (k, mo) in model.motors.iter().enumerate() {
        let d = slip[k];
        if d == 0 {
            continue;
        }
        let tq = -f64::from(d) * mo.max_torque;
        let ib = mo.b.body.map_or(-1, |g| model.bodies[g].index);
        let ia = mo.a.body.map_or(-1, |g| model.bodies[g].index);
        if ib >= 0 {
            q[3 * ib as usize + 2] += tq;
        }
        if ia >= 0 {
            q[3 * ia as usize + 2] -= tq;
        }
        let wb = mo.b.body.map_or(0.0, |g| poses[g].w);
        let wa = mo.a.body.map_or(0.0, |g| poses[g].w);
        rates.belt_work += tq * (wb - wa);
    }
}

/// Build the active constraint rows of a mode into `sol` (rows, unit kinematics) and the rope kinematics into
/// `ropes` (value, vel, row and c of every rope).
pub(crate) fn build_rows_into(sys: &System, poses: &[Pose], mode: &Mode, sol: &mut ModeSolution) {
    let model = &sys.model;
    sol.rows.clear();
    let mut eqs = std::mem::take(&mut sol.work.eqs);
    equality_kins_into(model, poses, &mut eqs);
    for e in eqs.drain(..) {
        // A slipping torque-limited motor (26.52) drives with ±τmax, not with its speed row
        if e.kind == EqualityKind::Drive {
            if let Some(slip) = &mode.slip {
                if slip[e.owner] != 0 {
                    continue;
                }
            }
        }
        sol.rows.push(Row { kind: RowKind::of(e.kind), owner: e.owner, sub: e.sub, j: e.kin.j, f: None, c: e.kin.c, value: e.kin.value, vel: e.kin.vel });
    }
    sol.work.eqs = eqs;
    // 26.52: closed end stops of sliders
    if let Some(lim) = &mode.limit {
        for (k, sl) in model.sliders.iter().enumerate() {
            if lim[k] != 0 {
                let kin = slider_axis_kin(model, poses, sl);
                sol.rows.push(limit_row(sl, k, lim[k], &kin));
            }
        }
    }
    sol.rope_kin.clear();
    sol.work.rope_rows.clear();
    for (k, r) in model.ropes.iter().enumerate() {
        let (rk, _) = rope_kin(model, poses, r);
        if mode.taut[k] {
            sol.rows.push(Row { kind: RowKind::Rope, owner: k, sub: 0, j: rk.j.clone(), f: None, c: rk.c, value: rk.value, vel: rk.vel });
        }
        sol.rope_kin.push(RopeState { value: rk.value, vel: rk.vel, acc: 0.0 });
        sol.work.rope_rows.push((rk.j, rk.c));
    }
    let nu = mode.units.len();
    if sol.units.len() > nu {
        sol.units.truncate(nu);
    }
    while sol.units.len() < nu {
        sol.units.push(UnitState::default());
    }
    for (ui, u) in mode.units.iter().enumerate() {
        let pair = &sys.pairs[u.pair];
        let st = &mut sol.units[ui];
        st.ref_kin = contact_kin(model, &pair.features[u.ref_], poses);
        st.point_kin.clear();
        for &p in &u.points {
            let k = if p == u.ref_ { st.ref_kin.clone() } else { contact_kin(model, &pair.features[p], poses) };
            st.point_kin.push(k);
        }
        st.open_kin.clear();
        for &p in &u.open {
            st.open_kin.push(contact_kin(model, &pair.features[p], poses));
        }
        let mu_k = pair.material.mu_k;
        // 26.52 (D59): rolling resistance; while rolling its couple −sign·C_rr·R·N is folded into the normal rows
        let rf = &pair.features[u.ref_];
        st.roll_kin = match u.roll {
            Some(_) if !u.points.is_empty() => Some(roll_kin(model, poses, rf.a.body, rf.b_body())),
            _ => None,
        };
        let rr = match (&st.roll_kin, u.roll) {
            (Some(_), Some(r)) if r != 0 => -f64::from(r) * pair.material.rolling * roll_radius(model, rf),
            _ => 0.0,
        };
        for (pi, k) in st.point_kin.iter().enumerate() {
            let mut f = if u.friction == Friction::Slide { Some(combine(&k.jn, &st.ref_kin.jt, -mu_k * u.s)) } else { None };
            if rr != 0.0 {
                let rk = st.roll_kin.as_ref().unwrap();
                f = Some(combine(f.as_ref().unwrap_or(&k.jn), &rk.j, rr));
            }
            sol.rows.push(Row { kind: RowKind::Normal, owner: ui, sub: pi, j: k.jn.clone(), f, c: k.cn, value: k.gap, vel: k.vn });
        }
        if u.friction == Friction::Stick && !u.points.is_empty() {
            let rk = &st.ref_kin;
            sol.rows.push(Row { kind: RowKind::Tangent, owner: ui, sub: 0, j: rk.jt.clone(), f: None, c: rk.ct, value: 0.0, vel: rk.vt });
        }
        if let (Some(rk), Some(0)) = (&st.roll_kin, u.roll) {
            sol.rows.push(Row { kind: RowKind::Roll, owner: ui, sub: 0, j: rk.j.clone(), f: None, c: 0.0, value: 0.0, vel: rk.vel });
        }
    }
}

/// The active constraint rows of a mode at given poses (for projection).
pub fn build_rows(sys: &System, poses: &[Pose], mode: &Mode) -> Vec<Row> {
    let mut sol = ModeSolution::default();
    build_rows_into(sys, poses, mode, &mut sol);
    sol.rows
}

/// Solve the dynamics of a mode at state X into `sol`. With `poses_in` the poses are taken as given.
pub fn solve_mode_into(sys: &System, x: &[f64], mode: &Mode, poses_in: Option<&[Pose]>, sol: &mut ModeSolution) -> SimResult<()> {
    let model = &sys.model;
    let n = sys.n;
    match poses_in {
        Some(p) => {
            sol.poses.clear();
            sol.poses.extend_from_slice(p);
        }
        None => compute_poses_into(model, x, &mut sol.poses),
    }
    sol.rates.reset(sys.pairs.len());
    {
        let ModeSolution { poses, rates, q, .. } = sol;
        applied_forces_into(sys, poses, Some(rates), x, mode.sw.as_deref(), q)?;
        // 26.52 (D58): slipping torque-limited motors drive with −sign(e)·τmax
        if let Some(slip) = &mode.slip {
            slip_torques(model, poses, slip, q, rates);
        }
    }
    let poses = std::mem::take(&mut sol.poses);
    build_rows_into(sys, &poses, mode, sol);
    sol.poses = poses;
    let m = sol.rows.len();
    let w = &mut sol.work;
    set_len(&mut w.a0, 3 * n);
    for i in 0..n {
        let im = model.dyn_inv_mass[i];
        let ii = model.dyn_inv_inertia[i];
        w.a0[3 * i] = sol.q[3 * i] * im;
        w.a0[3 * i + 1] = sol.q[3 * i + 1] * im;
        w.a0[3 * i + 2] = sol.q[3 * i + 2] * ii;
    }
    set_len(&mut sol.lambda, m);
    sol.consistent = true;
    sol.residual = 0.0;
    sol.rank = 0;
    if m > 0 {
        set_len(&mut w.a, m * m);
        set_len(&mut w.rhs, m);
        for r in 0..m {
            let jr = &sol.rows[r].j;
            for k in 0..m {
                w.a[r * m + k] = row_minv_row(model, jr, sol.rows[k].force());
            }
            w.rhs[r] = -(row_dot(jr, &w.a0, 0) + sol.rows[r].c);
        }
        let (rank, residual, consistent) = solve_dense_into(m, &mut w.a, &mut w.rhs, 1e-12, &mut sol.lambda, &mut w.lin);
        sol.rank = rank;
        sol.residual = residual;
        sol.consistent = consistent;
    }
    set_len(&mut w.g, 3 * n);
    w.g.copy_from_slice(&sol.q);
    for r in 0..m {
        add_row(&mut w.g, sol.rows[r].force(), sol.lambda[r]);
    }
    set_len(&mut sol.acc, 3 * n);
    for i in 0..n {
        let im = model.dyn_inv_mass[i];
        let ii = model.dyn_inv_inertia[i];
        sol.acc[3 * i] = w.g[3 * i] * im;
        sol.acc[3 * i + 1] = w.g[3 * i + 1] * im;
        sol.acc[3 * i + 2] = w.g[3 * i + 2] * ii;
    }
    for (ui, u) in mode.units.iter().enumerate() {
        let pair = &sys.pairs[u.pair];
        let st = &mut sol.units[ui];
        st.point_lambda.clear();
        let mut normal = 0.0;
        let mut tangent = 0.0;
        let mut roll = 0.0;
        for r in 0..m {
            let row = &sol.rows[r];
            if row.owner != ui {
                continue;
            }
            if row.kind == RowKind::Normal {
                st.point_lambda.push(sol.lambda[r]);
                normal += sol.lambda[r];
            } else if row.kind == RowKind::Tangent {
                tangent = sol.lambda[r];
            } else if row.kind == RowKind::Roll {
                roll = sol.lambda[r];
            }
        }
        if u.friction == Friction::Slide {
            tangent = -pair.material.mu_k * u.s * normal;
        }
        let vt = st.ref_kin.vt;
        let at = row_dot(&st.ref_kin.jt, &sol.acc, 0) + st.ref_kin.ct;
        if !u.points.is_empty() {
            let heat = -tangent * vt;
            sol.rates.heat += heat;
            sol.rates.belt_work += -belt_of(model, &pair.features[u.ref_]) * tangent;
            if u.friction == Friction::Slide {
                sol.rates.pair_slide[pair.index] += vt.abs();
                sol.rates.pair_heat[pair.index] += heat;
            }
        }
        let mut wr = 0.0;
        let mut wra = 0.0;
        if let Some(rk) = &st.roll_kin {
            wr = rk.vel;
            wra = row_dot(&rk.j, &sol.acc, 0) + rk.c;
            if let Some(r) = u.roll.filter(|&r| r != 0) {
                roll = -f64::from(r) * pair.material.rolling * roll_radius(model, &pair.features[u.ref_]) * normal;
            }
            // The couple's work is friction heat (26.52: booked with the friction of the pair)
            let rh = -roll * wr;
            sol.rates.heat += rh;
            sol.rates.pair_heat[pair.index] += rh;
        }
        st.normal = normal;
        st.tangent = tangent;
        st.vt = vt;
        st.at = at;
        st.roll = roll;
        st.wr = wr;
        st.wra = wra;
    }
    // 26.51: the drive of a speed motor delivers λ·(ω_b − ω_a) (motor work)
    for r in 0..m {
        let row = &sol.rows[r];
        if row.kind != RowKind::Drive {
            continue;
        }
        let mo = &model.motors[row.owner];
        let wa = mo.a.body.map_or(0.0, |g| sol.poses[g].w);
        let wb = mo.b.body.map_or(0.0, |g| sol.poses[g].w);
        sol.rates.belt_work += sol.lambda[r] * (wb - wa);
    }
    sol.rope_tension.clear();
    for k in 0..model.ropes.len() {
        let mut t = 0.0;
        for r in 0..m {
            if sol.rows[r].kind == RowKind::Rope && sol.rows[r].owner == k {
                t = sol.lambda[r];
                break;
            }
        }
        sol.rope_tension.push(t);
    }
    for (k, (j, c)) in sol.work.rope_rows.iter().enumerate() {
        sol.rope_kin[k].acc = row_dot(j, &sol.acc, 0) + c;
    }
    // 26.52: end-stop forces and motor torques
    sol.limit_force.clear();
    if model.has_limits {
        sol.limit_force.resize(model.sliders.len(), 0.0);
        for r in 0..m {
            if sol.rows[r].kind == RowKind::Limit {
                sol.limit_force[sol.rows[r].owner] = sol.lambda[r];
            }
        }
    }
    sol.drive_torque.clear();
    sol.drive_acc.clear();
    if model.has_slip {
        for (k, mo) in model.motors.iter().enumerate() {
            let ib = mo.b.body.map_or(-1, |g| model.bodies[g].index);
            let ia = mo.a.body.map_or(-1, |g| model.bodies[g].index);
            let ab = if ib >= 0 { sol.acc[3 * ib as usize + 2] } else { 0.0 };
            let aa = if ia >= 0 { sol.acc[3 * ia as usize + 2] } else { 0.0 };
            sol.drive_acc.push(ab - aa);
            if mo.torque_mode {
                sol.drive_torque.push(mo.torque);
                continue;
            }
            let d = mode.slip.as_ref().map_or(0, |s| s[k]);
            if d != 0 {
                sol.drive_torque.push(-f64::from(d) * mo.max_torque);
                continue;
            }
            let mut tq = 0.0;
            for r in 0..m {
                if sol.rows[r].kind == RowKind::Drive && sol.rows[r].owner == k {
                    tq = sol.lambda[r];
                }
            }
            sol.drive_torque.push(tq);
        }
    }
    Ok(())
}

/// Solve the dynamics of a mode at state X (fresh solution).
pub fn solve_mode(sys: &System, x: &[f64], mode: &Mode, poses_in: Option<&[Pose]>) -> SimResult<ModeSolution> {
    let mut sol = ModeSolution::default();
    solve_mode_into(sys, x, mode, poses_in, &mut sol)?;
    Ok(sol)
}

/// Time derivative of the state for a fixed mode, using `sol` as the solution buffer.
pub fn derivative(sys: &System, x: &[f64], mode: &Mode, out: &mut [f64], sol: &mut ModeSolution) -> SimResult<()> {
    solve_mode_into(sys, x, mode, None, sol)?;
    let n = sys.n;
    out[..3 * n].copy_from_slice(&x[3 * n..6 * n]);
    out[3 * n..6 * n].copy_from_slice(&sol.acc[..3 * n]);
    let base = sys.aux_base;
    out[base..sys.size].fill(0.0);
    out[base + AUX_HEAT] = sol.rates.heat;
    out[base + AUX_WORK] = sol.rates.applied_work;
    out[base + AUX_DAMP] = sol.rates.damping;
    out[base + AUX_BELT] = sol.rates.belt_work;
    for p in 0..sol.rates.pair_slide.len() {
        out[base + AUX_FIXED + 2 * p] = sol.rates.pair_slide[p];
        out[base + AUX_FIXED + 2 * p + 1] = sol.rates.pair_heat[p];
    }
    if let Some(slot) = sys.time_slot {
        out[slot] = 1.0;
    }
    Ok(())
}

// ---- Energy ----
/// Mechanical energy (J).
#[derive(Clone, Copy, Debug, Default)]
pub struct EnergyParts {
    pub kinetic: f64,
    pub gravity: f64,
    pub spring: f64,
    /// Potential of the central fields (26.52, D60).
    pub field: f64,
    pub total: f64,
}

/// Mechanical energy of state X.
pub fn energy(sys: &System, x: &[f64], poses: &[Pose]) -> EnergyParts {
    let model = &sys.model;
    let n = sys.n;
    let mut kinetic = 0.0;
    let mut gravity = 0.0;
    let mut spring = 0.0;
    let g = model.settings.gravity;
    let y0 = model.settings.energy_zero_y;
    for &bg in &model.dynamic {
        let b = &model.bodies[bg];
        let i = b.index as usize;
        let vx = x[3 * n + 3 * i];
        let vy = x[3 * n + 3 * i + 1];
        let w = x[3 * n + 3 * i + 2];
        kinetic += 0.5 * b.mass * (vx * vx + vy * vy) + if b.inv_inertia > 0.0 { 0.5 * b.inertia * w * w } else { 0.0 };
        gravity += -b.mass * (g.x * x[3 * i] + g.y * (x[3 * i + 1] - y0));
    }
    for s in &model.springs {
        if s.damper {
            continue;
        }
        let pa = anchor_state(poses, &s.a);
        let pb = anchor_state(poses, &s.b);
        let dx = pa.px - pb.px;
        let dy = pa.py - pb.py;
        let e = (dx * dx + dy * dy).sqrt() - s.rest_length;
        spring += if s.cubic != 0.0 { 0.5 * s.stiffness * e * e + 0.25 * s.cubic * e * e * e * e } else { 0.5 * s.stiffness * e * e };
    }
    // 26.51: potential energy of gravitation, −G·m₁m₂/r per pair (counted with gravity)
    if model.g_const > 0.0 {
        let at = &model.attractors;
        for i in 0..at.len() {
            for j in i + 1..at.len() {
                let a = &model.bodies[at[i]];
                let b = &model.bodies[at[j]];
                if !a.dynamic && !b.dynamic {
                    continue;
                }
                let (pax, pay) = if a.dynamic { (poses[at[i]].x, poses[at[i]].y) } else { (a.grav_pos.x, a.grav_pos.y) };
                let (pbx, pby) = if b.dynamic { (poses[at[j]].x, poses[at[j]].y) } else { (b.grav_pos.x, b.grav_pos.y) };
                let dx = pbx - pax;
                let dy = pby - pay;
                let d = (dx * dx + dy * dy).sqrt();
                let rr = a.bound + b.bound;
                if d >= rr && d > 0.0 {
                    gravity -= model.g_const * a.attract * b.attract / d;
                } else if d < rr {
                    gravity -= model.g_const * a.attract * b.attract * (3.0 * rr * rr - d * d) / (2.0 * rr * rr * rr);
                }
            }
        }
    }
    // 26.52 (D60): potential of the central fields (scenes without them keep the sum of 26.51)
    let mut field = 0.0;
    for c in &model.centrals {
        let p = anchor_state(poses, &c.a);
        for &t in &c.targets {
            let pt = &poses[t];
            let dx = pt.x - p.px;
            let dy = pt.y - p.py;
            field += central_potential(c.k, c.n, (dx * dx + dy * dy).sqrt(), model.bodies[t].bound);
        }
    }
    let total = if model.centrals.is_empty() { kinetic + gravity + spring } else { kinetic + gravity + spring + field };
    EnergyParts { kinetic, gravity, spring, field, total }
}

/// Kinetic energy of state X (J).
pub fn kinetic_energy(sys: &System, x: &[f64]) -> f64 {
    let n = sys.n;
    let mut k = 0.0;
    for &bg in &sys.model.dynamic {
        let b = &sys.model.bodies[bg];
        let i = b.index as usize;
        let vx = x[3 * n + 3 * i];
        let vy = x[3 * n + 3 * i + 1];
        let w = x[3 * n + 3 * i + 2];
        k += 0.5 * b.mass * (vx * vx + vy * vy) + if b.inv_inertia > 0.0 { 0.5 * b.inertia * w * w } else { 0.0 };
    }
    k
}
