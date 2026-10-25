//! Dynamics for a fixed contact/connector mode (port of `src/core/solver/dynamics.ts`). The solution of a mode
//! is written into a reusable `ModeSolution` (same values as a fresh one; only allocations are saved).

use crate::expr::{branch_of, fill_env, ENV_SIZE};
use crate::kinematics::{
    anchor_state, compute_poses_into, contact_kin, distance_kin, hinge_kin, pair_features, pair_probes, rope_kin, rope_path, ContactFeature, ContactKin,
    FeatureB, Pose, Probe, RowJ, RowTerm,
};
use crate::linalg::{solve_dense_into, LinWork};
use crate::message::{Message, SimResult};
use crate::model::{pair_key, pair_material, Model};
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
}

/// Contact and connector mode; `sw` holds the frozen switch branches (None: the scene has no switches).
#[derive(Clone, Debug, PartialEq, Default)]
pub struct Mode {
    pub units: Vec<UnitMode>,
    pub taut: Vec<bool>,
    pub sw: Option<Vec<i8>>,
}

/// Kind of a constraint row.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RowKind {
    Hinge,
    Rod,
    Rope,
    Normal,
    Tangent,
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
    let s = effective_sw(model, sw);
    let fx = model.arena.eval(ex, &env, s);
    let fy = model.arena.eval(ey, &env, s);
    if !fx.is_finite() || !fy.is_finite() {
        let t = match sys.time_slot {
            Some(slot) => x[slot],
            None => 0.0,
        };
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
        let mag = -s.stiffness * (l - s.rest_length) - s.damping * vrel;
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

/// Build the active constraint rows of a mode into `sol` (rows, unit kinematics) and the rope kinematics into
/// `ropes` (value, vel, row and c of every rope).
pub(crate) fn build_rows_into(sys: &System, poses: &[Pose], mode: &Mode, sol: &mut ModeSolution) {
    let model = &sys.model;
    sol.rows.clear();
    for (k, h) in model.hinges.iter().enumerate() {
        let [rx, ry] = hinge_kin(model, poses, &h.a, &h.b);
        sol.rows.push(Row { kind: RowKind::Hinge, owner: k, sub: 0, j: rx.j, f: None, c: rx.c, value: rx.value, vel: rx.vel });
        sol.rows.push(Row { kind: RowKind::Hinge, owner: k, sub: 1, j: ry.j, f: None, c: ry.c, value: ry.value, vel: ry.vel });
    }
    for (k, r) in model.rods.iter().enumerate() {
        let (d, _, _) = distance_kin(model, poses, &r.a, &r.b);
        sol.rows.push(Row { kind: RowKind::Rod, owner: k, sub: 0, j: d.j, f: None, c: d.c, value: d.value - r.length, vel: d.vel });
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
        for (pi, k) in st.point_kin.iter().enumerate() {
            let f = if u.friction == Friction::Slide { Some(combine(&k.jn, &st.ref_kin.jt, -mu_k * u.s)) } else { None };
            sol.rows.push(Row { kind: RowKind::Normal, owner: ui, sub: pi, j: k.jn.clone(), f, c: k.cn, value: k.gap, vel: k.vn });
        }
        if u.friction == Friction::Stick && !u.points.is_empty() {
            let rk = &st.ref_kin;
            sol.rows.push(Row { kind: RowKind::Tangent, owner: ui, sub: 0, j: rk.jt.clone(), f: None, c: rk.ct, value: 0.0, vel: rk.vt });
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
        st.normal = normal;
        st.tangent = tangent;
        st.vt = vt;
        st.at = at;
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
        let pa = anchor_state(poses, &s.a);
        let pb = anchor_state(poses, &s.b);
        let dx = pa.px - pb.px;
        let dy = pa.py - pb.py;
        let e = (dx * dx + dy * dy).sqrt() - s.rest_length;
        spring += 0.5 * s.stiffness * e * e;
    }
    EnergyParts { kinetic, gravity, spring, total: kinetic + gravity + spring }
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
