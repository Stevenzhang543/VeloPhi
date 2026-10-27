//! Formula layer (26.53, ports of src/formula/situations.ts, situations2651.ts, measure.ts and match.ts of 26.52):
//! recognised textbook situations with their variables, measurements and conditions, and the formula cards that
//! compare theory with the simulation. Recognizers only read the recording.
//!
//! A situation's `sample` is a closure over what the recognizer found, evaluated later on the session (the TypeScript
//! closures captured the recording; here the session is passed in and the closure keeps the view of the recording
//! it was recognised on).

pub mod cards;
pub mod event_detail;
pub mod situations;
pub mod situations2651;
pub mod situations2654;
pub mod situations2655;

use std::rc::Rc;

use serde_json::{json, Map, Value};

use crate::dmath::{atan2, cos, sin};
use crate::dynamics::{solve_mode, Friction, Mode, ModeSolution, System, UnitMode, AUX_FIXED};
use crate::kinematics::{compute_poses, contact_kin, ContactKin, FeatureB};
use crate::message::{SimResult, Text};
use crate::model::{pair_key, AnchorModel, BodyModel, Model};
use crate::observe::{contact_forces_of, ContactForces};
use crate::session::{step_to, Session};
use crate::simulation::{Segment, SimEvent};
use crate::transport::jnum;

/// A variable of a situation: SI value, unit, KaTeX symbol and label.
#[derive(Clone, Debug)]
pub struct VarValue {
    pub value: f64,
    pub unit: &'static str,
    pub symbol: &'static str,
    pub label: Text,
}

/// A simulated measurement (SI); None when the recording does not provide it.
#[derive(Clone, Debug)]
pub struct Measure {
    pub value: Option<f64>,
    pub unit: &'static str,
    pub label: Text,
    pub note: Option<Text>,
}

/// Status of a condition.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CondStatus {
    Ok,
    Approx,
    Fail,
}

impl CondStatus {
    pub fn name(self) -> &'static str {
        match self {
            CondStatus::Ok => "ok",
            CondStatus::Approx => "approx",
            CondStatus::Fail => "fail",
        }
    }
}

/// An assumption of a formula with its status.
#[derive(Clone, Debug)]
pub struct Condition {
    pub id: String,
    pub label: Text,
    pub status: CondStatus,
    pub detail: Text,
}

/// Variables, measurements and conditions of a situation at one time (insertion order kept, as in a JS object).
#[derive(Clone, Debug, Default)]
pub struct Sample {
    pub vars: Vec<(&'static str, VarValue)>,
    pub measures: Vec<(&'static str, Measure)>,
    pub conditions: Vec<Condition>,
}

impl Sample {
    pub fn var(&self, name: &str) -> Option<&VarValue> {
        self.vars.iter().find(|(k, _)| *k == name).map(|(_, v)| v)
    }
    pub fn measure(&self, name: &str) -> Option<&Measure> {
        self.measures.iter().find(|(k, _)| *k == name).map(|(_, v)| v)
    }
    pub fn condition(&self, id: &str) -> Option<&Condition> {
        self.conditions.iter().find(|c| c.id == id)
    }

    /// JSON for the interface and the parity harness.
    pub fn to_json(&self) -> Value {
        let mut vars = Map::new();
        for (k, v) in &self.vars {
            vars.insert((*k).into(), json!({ "value": jnum(v.value), "unit": v.unit, "symbol": v.symbol, "label": v.label.to_json() }));
        }
        let mut measures = Map::new();
        for (k, m) in &self.measures {
            let mut o = Map::new();
            o.insert("value".into(), m.value.map(jnum).unwrap_or(Value::Null));
            o.insert("unit".into(), json!(m.unit));
            o.insert("label".into(), m.label.to_json());
            if let Some(n) = &m.note {
                o.insert("note".into(), n.to_json());
            }
            measures.insert((*k).into(), Value::Object(o));
        }
        json!({ "vars": vars, "measures": measures, "conditions": self.conditions.iter().map(condition_json).collect::<Vec<_>>() })
    }
}

/// Condition as JSON.
pub fn condition_json(c: &Condition) -> Value {
    json!({ "id": c.id, "label": c.label.to_json(), "status": c.status.name(), "detail": c.detail.to_json() })
}

/// The part of a recording a recognizer saw: segments [seg_lo, seg_hi), events [ev_lo, ev_hi) and the frames
/// received then. Windows of a growing recording (incremental recognition) and the whole recording alike.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct View {
    pub seg_lo: usize,
    pub seg_hi: usize,
    pub ev_lo: usize,
    pub ev_hi: usize,
    pub frame_count: u64,
    pub reduced_from: Option<f64>,
}

impl View {
    /// The whole recording as it is now.
    pub fn whole(s: &Session) -> View {
        View { seg_lo: 0, seg_hi: s.segments.len(), ev_lo: 0, ev_hi: s.events.len(), frame_count: s.frame_count, reduced_from: s.reduced_from }
    }
}

/// Values sampled by a situation at time t.
pub type SampleFn = Rc<dyn Fn(&mut Session, f64) -> SimResult<Sample>>;

/// A recognised textbook situation over [t0, t1].
#[derive(Clone)]
pub struct Situation {
    pub key: String,
    /// Situation type, matched by the formulas' situation.
    pub ty: &'static str,
    pub title: Text,
    pub t0: f64,
    pub t1: f64,
    /// Event-type situations refer to this instant.
    pub t_event: Option<f64>,
    pub bodies: Vec<String>,
    pub sample: SampleFn,
}

impl Situation {
    /// JSON without the sample.
    pub fn to_json(&self) -> Value {
        let mut o = Map::new();
        o.insert("key".into(), json!(self.key));
        o.insert("type".into(), json!(self.ty));
        o.insert("title".into(), self.title.to_json());
        o.insert("t0".into(), jnum(self.t0));
        o.insert("t1".into(), jnum(self.t1));
        if let Some(t) = self.t_event {
            o.insert("tEvent".into(), jnum(t));
        }
        o.insert("bodies".into(), json!(self.bodies));
        Value::Object(o)
    }
}

pub fn var(value: f64, unit: &'static str, symbol: &'static str, label: Text) -> VarValue {
    VarValue { value, unit, symbol, label }
}
pub fn meas(value: Option<f64>, unit: &'static str, label: Text) -> Measure {
    Measure { value, unit, label, note: None }
}
pub fn meas_note(value: Option<f64>, unit: &'static str, label: Text, note: Option<Text>) -> Measure {
    Measure { value, unit, label, note }
}
pub fn cond(id: &str, label: Text, ok: bool, detail: Text) -> Condition {
    Condition { id: id.to_string(), label, status: if ok { CondStatus::Ok } else { CondStatus::Fail }, detail }
}
pub fn sq(x: f64) -> f64 {
    x * x
}
/// `Math.sign(x) || 1`.
pub fn sign_or1(x: f64) -> f64 {
    if x > 0.0 {
        1.0
    } else if x < 0.0 {
        -1.0
    } else {
        1.0
    }
}
/// `x ? '' : text` of the TypeScript recognizers.
pub fn unless(ok: bool, t: Text) -> Text {
    if ok {
        Text::empty()
    } else {
        t
    }
}
/// `x ? text : ''`.
pub fn when(ok: bool, t: Text) -> Text {
    if ok {
        t
    } else {
        Text::empty()
    }
}

/// An observation at a state in a mode (ObservationContext of the TypeScript recognizers).
pub struct Obs {
    pub x: Vec<f64>,
    pub mode: Mode,
    pub sol: ModeSolution,
    pub impact_loss: f64,
}

impl Obs {
    pub fn contact_forces(&self, sys: &System, on: &str, by: &str) -> ContactForces {
        contact_forces_of(sys, &self.mode, &self.sol, on, by)
    }
    /// λ of the hinge rows (x, y) of hinge `hi`.
    pub fn hinge_force(&self, hi: usize) -> (f64, f64) {
        let (mut fx, mut fy) = (0.0, 0.0);
        for (k, row) in self.sol.rows.iter().enumerate() {
            if row.kind == crate::dynamics::RowKind::Hinge && row.owner == hi {
                if row.sub == 0 {
                    fx = self.sol.lambda[k];
                } else {
                    fy = self.sol.lambda[k];
                }
            }
        }
        (fx, fy)
    }
}

/// Recording access of a recognizer or a sample: the session seen through a view.
pub struct Rec<'a> {
    pub s: &'a mut Session,
    pub v: View,
    pub sys: Rc<System>,
}

impl<'a> Rec<'a> {
    pub fn new(s: &'a mut Session, v: View) -> Rec<'a> {
        let sys = s.system.clone();
        Rec { s, v, sys }
    }
    pub fn dt(&self) -> f64 {
        self.s.dt
    }
    pub fn nseg(&self) -> usize {
        self.v.seg_hi - self.v.seg_lo
    }
    /// Segment i of the view.
    pub fn seg(&self, i: usize) -> &Segment {
        &self.s.segments[self.v.seg_lo + i]
    }
    /// Events of the view.
    pub fn events(&self) -> &[SimEvent] {
        &self.s.events[self.v.ev_lo..self.v.ev_hi]
    }

    /// Index (in the view) of the segment containing time t (the later one at a boundary).
    pub fn segment_at(&self, t: f64) -> usize {
        let mut seg = 0;
        for i in 0..self.nseg() {
            if self.seg(i).t0 <= t {
                seg = i;
            }
        }
        seg
    }

    /// State of frame k.
    pub fn frame_state(&mut self, k: u64) -> SimResult<Vec<f64>> {
        Ok(self.s.state(k)?.to_vec())
    }

    /// State at time t (exactStateAt on the view).
    pub fn exact(&mut self, t: f64) -> SimResult<Vec<f64>> {
        let dt = self.s.dt;
        let fc = self.v.frame_count as f64;
        let mut k = (fc - 1.0).min(0f64.max((t / dt).floor()));
        if k + 1.0 < fc && (k + 1.0) * dt <= t {
            k += 1.0;
        }
        while k > 0.0 && k * dt > t {
            k -= 1.0;
        }
        let k = k as u64;
        let tk = k as f64 * dt;
        if t == tk {
            return self.frame_state(k);
        }
        let si = self.segment_at(t);
        if self.seg(si).reduced {
            if k + 1 >= self.v.frame_count {
                return self.frame_state(k);
            }
            let a = self.frame_state(k)?;
            let b = self.frame_state(k + 1)?;
            let sfrac = (t - tk) / dt;
            let mut out: Vec<f64> = (0..a.len()).map(|i| a[i] + sfrac * (b[i] - a[i])).collect();
            if let Some(slot) = self.sys.time_slot {
                out[slot] = t;
            }
            return Ok(out);
        }
        let (x0, t0) = if self.seg(si).t0 > tk { (self.seg(si).x0.clone(), self.seg(si).t0) } else { (self.frame_state(k)?, tk) };
        if t == t0 {
            return Ok(x0);
        }
        let mode = self.seg(si).mode.clone();
        let sys = self.sys.clone();
        step_to(&sys, &mode, &x0, t - t0, t)
    }

    /// Observation at time t: exact state, mode and impact loss of the segment containing t (observeAt).
    pub fn observe(&mut self, t: f64) -> SimResult<Obs> {
        let si = self.segment_at(t);
        let mode = self.seg(si).mode.clone();
        let loss = self.seg(si).impact_loss;
        let x = self.exact(t)?;
        self.observe_state(x, mode, loss)
    }

    /// Observation of a given state in a mode (makeContextFor).
    pub fn observe_state(&self, x: Vec<f64>, mode: Mode, impact_loss: f64) -> SimResult<Obs> {
        let sol = solve_mode(&self.sys, &x, &mode, None)?;
        Ok(Obs { x, mode, sol, impact_loss })
    }

    /// The event of the view at time t (within 1e-12 s).
    pub fn event_at(&self, t: f64) -> Option<&SimEvent> {
        self.events().iter().find(|e| (e.t - t).abs() <= 1e-12)
    }
}

/// A scalar function of a state at time t, with access to the recording (crossings).
pub type StateFn<'f> = dyn FnMut(&mut Rec, &[f64], f64) -> SimResult<f64> + 'f;

/// Times in [t0, t1] where f crosses zero in the given direction (+1 rising, −1 falling, 0 both); brackets from
/// frames, refined with the Illinois method on exact states (formula/measure.ts crossings).
pub fn crossings(r: &mut Rec, f: &mut StateFn, t0: f64, t1: f64, direction: i32, max: usize) -> SimResult<Vec<f64>> {
    let mut out = Vec::new();
    let dt = r.dt();
    let k0 = 0f64.max((t0 / dt - 1e-9).ceil());
    let k1 = (r.v.frame_count as f64 - 1.0).min((t1 / dt + 1e-9).floor());
    let mut t_prev = t0;
    let x0 = r.exact(t0)?;
    let mut f_prev = f(r, &x0, t0)?;
    let mut k = k0;
    while k <= k1 + 1.0 && out.len() < max {
        let t = if k <= k1 { k * dt } else { t1 };
        if t <= t_prev {
            k += 1.0;
            continue;
        }
        let x = if k <= k1 { r.frame_state(k as u64)? } else { r.exact(t)? };
        let fv = f(r, &x, t)?;
        let rising = f_prev < 0.0 && fv >= 0.0;
        let falling = f_prev > 0.0 && fv <= 0.0;
        if (rising && direction >= 0) || (falling && direction <= 0) {
            out.push(refine(r, f, t_prev, t, f_prev, fv)?);
        }
        t_prev = t;
        f_prev = fv;
        k += 1.0;
    }
    Ok(out)
}

fn refine(r: &mut Rec, f: &mut StateFn, a0: f64, b0: f64, fa0: f64, fb0: f64) -> SimResult<f64> {
    let (mut a, mut b, mut fa, mut fb) = (a0, b0, fa0, fb0);
    let mut side = 0;
    let mut i = 0;
    while i < 100 && b - a > 1e-13 {
        let mut m = (a * fb - b * fa) / (fb - fa);
        if !(m > a && m < b) || i % 6 == 5 {
            m = 0.5 * (a + b);
        }
        let xm = r.exact(m)?;
        let fm = f(r, &xm, m)?;
        if fm == 0.0 {
            return Ok(m);
        }
        if (fm < 0.0) == (fa < 0.0) {
            a = m;
            fa = fm;
            if side == 1 {
                fb /= 2.0;
            }
            side = 1;
        } else {
            b = m;
            fb = fm;
            if side == -1 {
                fa /= 2.0;
            }
            side = -1;
        }
        i += 1;
    }
    Ok(if fa.abs() < fb.abs() { a } else { b })
}

// ---- Shared helpers of the recognizers (situations.ts) ----

/// Consecutive segments with the same signature: their indices in the view.
pub struct Run {
    pub sig: String,
    pub t0: f64,
    pub t1: f64,
    pub segs: Vec<usize>,
}

/// Times of the impacts of body `id` in the view (26.55: a flight or a swing ends at one).
pub fn impact_times(r: &Rec, id: &str) -> Vec<f64> {
    r.events()
        .iter()
        .filter(|e| e.changes.iter().any(|c| c.kind() == crate::simulation::ChangeType::Impact && c.bodies.iter().any(|x| x == id)))
        .map(|e| e.t)
        .collect()
}

/// Merge consecutive segments with the same non-None signature into runs (zero-length segments skipped).
pub fn runs(r: &Rec, sig: &mut dyn FnMut(&Segment) -> Option<String>) -> Vec<Run> {
    let mut out: Vec<Run> = Vec::new();
    let n = r.nseg();
    for i in 0..n {
        let seg = r.seg(i);
        let zero = seg.t1 - seg.t0 <= 1e-12 && i < n - 1;
        if zero {
            continue;
        }
        // The Moreau–Jean fallback (reduced accuracy) gives no exact states to compare formulas with
        let s = if seg.reduced { None } else { sig(seg) };
        let Some(s) = s else { continue };
        if let Some(last) = out.last_mut() {
            if last.sig == s && (last.t1 - seg.t0).abs() <= 1e-12 {
                last.t1 = seg.t1;
                last.segs.push(i);
                continue;
            }
        }
        out.push(Run { sig: s, t0: seg.t0, t1: seg.t1, segs: vec![i] });
    }
    out
}

/// Pair body ids of a unit.
fn unit_ids<'m>(sys: &'m System, u: &UnitMode) -> (&'m str, &'m str) {
    let p = &sys.pairs[u.pair];
    (&sys.model.bodies[p.x].id, &sys.model.bodies[p.y].id)
}

/// Closed units (with contact points) of body `id`.
pub fn closed_units<'m>(sys: &System, mode: &'m Mode, id: &str) -> Vec<&'m UnitMode> {
    mode.units
        .iter()
        .filter(|u| {
            let (x, y) = unit_ids(sys, u);
            !u.points.is_empty() && (x == id || y == id)
        })
        .collect()
}

/// Units of body `id` with contact points or open points.
pub fn touching_units<'m>(sys: &System, mode: &'m Mode, id: &str) -> Vec<&'m UnitMode> {
    mode.units
        .iter()
        .filter(|u| {
            let (x, y) = unit_ids(sys, u);
            (!u.points.is_empty() || !u.open.is_empty()) && (x == id || y == id)
        })
        .collect()
}

/// The other body of a unit (global index).
pub fn other_body(sys: &System, u: &UnitMode, id: &str) -> usize {
    let p = &sys.pairs[u.pair];
    if sys.model.bodies[p.x].id == id {
        p.y
    } else {
        p.x
    }
}

/// Connectors acting on a body (see situations.ts `attached`).
#[derive(Clone, Debug, Default)]
pub struct Attached {
    pub ropes: Vec<usize>,
    pub rods: Vec<usize>,
    pub springs: Vec<usize>,
    pub hinges: Vec<usize>,
    pub forces: Vec<usize>,
    pub extra: usize,
}

impl Attached {
    /// Ropes, rods, springs, hinges, forces and extras all absent (noConnectors).
    pub fn none(&self) -> bool {
        self.ropes.len() + self.rods.len() + self.springs.len() + self.hinges.len() + self.forces.len() + self.extra == 0
    }
}

fn on_anchor(model: &Model, a: &AnchorModel, id: &str) -> bool {
    a.body.is_some_and(|g| model.bodies[g].id == id)
}

/// Connectors acting on body `id`.
pub fn attached(model: &Model, id: &str) -> Attached {
    let has = |a: &AnchorModel| on_anchor(model, a, id);
    let ropes: Vec<usize> = model
        .ropes
        .iter()
        .enumerate()
        .filter(|(_, r)| has(&r.a) || has(&r.b) || r.pulleys.iter().any(|&(pi, _)| model.pulleys[pi].body.is_some_and(|g| model.bodies[g].id == id)))
        .map(|(i, _)| i)
        .collect();
    let springs: Vec<usize> = model.springs.iter().enumerate().filter(|(_, c)| has(&c.a) || has(&c.b)).map(|(i, _)| i).collect();
    let mut extra = 0;
    extra += model.welds.iter().filter(|c| has(&c.a) || has(&c.b)).count();
    extra += model.sliders.iter().filter(|c| has(&c.a) || has(&c.b)).count();
    extra += model.motors.iter().filter(|c| has(&c.a) || has(&c.b)).count();
    extra += model.gears.iter().filter(|g| g.a.is_some_and(|x| model.bodies[x].id == id) || g.b.is_some_and(|x| model.bodies[x].id == id)).count();
    for &i in &springs {
        if model.springs[i].stiffness == 0.0 || model.springs[i].cubic != 0.0 {
            extra += 1;
        }
    }
    let body = model.bodies.iter().find(|b| b.id == id);
    if let Some(b) = body {
        if b.drag_lin > 0.0 || b.drag_quad > 0.0 {
            extra += 1;
        }
        if model.g_const > 0.0 && b.attract > 0.0 {
            extra += 1;
        }
        // 26.54 (D78): the charge of a body in an electric scene (absent in older scenes)
        if model.electric && b.charge != 0.0 {
            extra += 1;
        }
    }
    Attached {
        ropes,
        rods: model.rods.iter().enumerate().filter(|(_, c)| has(&c.a) || has(&c.b)).map(|(i, _)| i).collect(),
        springs: springs.into_iter().filter(|&i| model.springs[i].stiffness > 0.0 && model.springs[i].cubic == 0.0).collect(),
        hinges: model.hinges.iter().enumerate().filter(|(_, c)| has(&c.a) || has(&c.b)).map(|(i, _)| i).collect(),
        forces: model.forces.iter().enumerate().filter(|(_, c)| has(&c.a)).map(|(i, _)| i).collect(),
        extra,
    }
}

/// |g| and whether gravity points straight down.
pub fn gravity(model: &Model) -> (f64, bool) {
    let g = model.settings.gravity;
    ((g.x * g.x + g.y * g.y).sqrt(), g.x == 0.0 && g.y < 0.0)
}

/// Contact geometry of a unit seen from body `id` (unitGeometry).
#[derive(Clone, Debug)]
pub struct Geometry {
    pub nx: f64,
    pub ny: f64,
    pub theta: f64,
    pub dx: f64,
    pub dy: f64,
    pub belt: f64,
    pub u: f64,
    pub ref_sign: f64,
    pub k: ContactKin,
}

pub fn unit_geometry(sys: &System, x: &[f64], u: &UnitMode, id: &str) -> Geometry {
    let model = &sys.model;
    let poses = compute_poses(model, x);
    let pair = &sys.pairs[u.pair];
    let f = &pair.features[u.ref_];
    let k = contact_kin(model, f, &poses);
    let sign = if model.bodies[f.a.body].id == id { 1.0 } else { -1.0 };
    let (nx, ny) = (sign * k.nx, sign * k.ny);
    let theta = atan2(nx.abs(), ny);
    let (mut dx, mut dy) = (ny, -nx);
    if nx.abs() > 1e-12 {
        if dy > 0.0 {
            dx = -dx;
            dy = -dy;
        }
    } else if dx < 0.0 {
        dx = -dx;
        dy = -dy;
    }
    let belt = match f.b {
        FeatureB::Face(_) => model.bodies[f.b_body()].belt_speed,
        FeatureB::Point(..) => 0.0,
    };
    let (svx, svy) = (-belt * k.tx, -belt * k.ty);
    Geometry { nx, ny, theta, dx, dy, belt, u: svx * dx + svy * dy, ref_sign: sign, k }
}

/// Position and velocity of a dynamic body in state X.
#[derive(Clone, Copy, Debug)]
pub struct BodyVel {
    pub x: f64,
    pub y: f64,
    pub th: f64,
    pub vx: f64,
    pub vy: f64,
    pub w: f64,
}

pub fn body_vel(sys: &System, x: &[f64], b: &BodyModel) -> BodyVel {
    let n = sys.n;
    let i = b.index as usize;
    BodyVel { x: x[3 * i], y: x[3 * i + 1], th: x[3 * i + 2], vx: x[3 * n + 3 * i], vy: x[3 * n + 3 * i + 1], w: x[3 * n + 3 * i + 2] }
}

/// Relative sliding distance and friction heat of a pair in state X (NaN when the pair does not exist).
pub fn pair_aux(sys: &System, x: &[f64], a: &str, b: &str) -> (f64, f64) {
    let key = pair_key(a, b);
    match sys.pairs.iter().find(|p| p.key == key) {
        None => (f64::NAN, f64::NAN),
        Some(p) => {
            let base = sys.aux_base + AUX_FIXED + 2 * p.index;
            (x[base], x[base + 1])
        }
    }
}

/// Direction of sliding along downhill (slideDirection).
pub fn slide_direction(u: &UnitMode, ref_sign: f64, k: &ContactKin, dx: f64, dy: f64) -> f64 {
    sign_or1(u.s * (k.tx * dx + k.ty * dy) * ref_sign)
}

/// World point of an anchor on a static body or in the world (None on a dynamic body).
pub fn anchor_world(model: &Model, a: &AnchorModel) -> Option<(f64, f64)> {
    match a.body {
        None => Some((a.local.x, a.local.y)),
        Some(g) => {
            let b = &model.bodies[g];
            if b.dynamic {
                return None;
            }
            let (c, s) = (cos(b.static_angle), sin(b.static_angle));
            Some((b.static_pos.x + c * a.local.x - s * a.local.y, b.static_pos.y + s * a.local.x + c * a.local.y))
        }
    }
}

/// A body hanging from a fixed point by exactly one rope (no pulleys) or rod, attached at its centre.
#[derive(Clone, Copy, Debug)]
pub struct Link {
    pub is_rope: bool,
    pub index: usize,
    pub length: f64,
    pub pivot: (f64, f64),
}

pub fn single_link(model: &Model, b: &BodyModel) -> Option<Link> {
    let at = attached(model, &b.id);
    if at.ropes.len() + at.rods.len() != 1 || at.springs.len() + at.hinges.len() + at.forces.len() + at.extra != 0 {
        return None;
    }
    let is_rope = at.ropes.len() == 1;
    let (ca, cb, length) = if is_rope {
        let r = &model.ropes[at.ropes[0]];
        if !r.pulleys.is_empty() {
            return None;
        }
        (&r.a, &r.b, r.length)
    } else {
        let r = &model.rods[at.rods[0]];
        (&r.a, &r.b, r.length)
    };
    let mine_is_a = on_anchor(model, ca, &b.id);
    let (mine, fixed) = if mine_is_a { (ca, cb) } else { (cb, ca) };
    let pivot = anchor_world(model, fixed)?;
    if mine.local.x.abs() > 1e-12 || mine.local.y.abs() > 1e-12 {
        return None;
    }
    Some(Link { is_rope, index: if is_rope { at.ropes[0] } else { at.rods[0] }, length, pivot })
}

/// Force of rod k on its bodies, pulling positive (the readout `<rod>.F`).
pub fn rod_force(o: &Obs, k: usize) -> f64 {
    let mut f = 0.0;
    for (i, r) in o.sol.rows.iter().enumerate() {
        if r.kind == crate::dynamics::RowKind::Rod && r.owner == k {
            f = -o.sol.lambda[i];
        }
    }
    f
}

/// Friction state as the TypeScript string ('none' | 'stick' | 'slide').
pub fn friction_name(f: Friction) -> &'static str {
    match f {
        Friction::None => "none",
        Friction::Stick => "stick",
        Friction::Slide => "slide",
    }
}

/// Index of a unit in a mode (by identity in the TypeScript code: same pair and the same reference feature).
pub fn unit_index(mode: &Mode, u: &UnitMode) -> Option<usize> {
    mode.units.iter().position(|x| x == u)
}

/// Situations of a session: recognised incrementally while the recording grows (analysis/recognition.ts of 26.52),
/// over the whole recording once it has ended.
#[derive(Default)]
pub struct Recognition {
    done: Vec<Situation>,
    done_keys: Vec<String>,
    open: Vec<Situation>,
    whole: Vec<Situation>,
    window_seg: usize,
    frontier: f64,
    seen: (u64, usize, usize),
    /// Passes of the incremental recognizer (diagnostics).
    pub passes: usize,
    /// The final list of an ended recording, with the revision it was made for.
    fin: Option<(u64, Vec<Situation>)>,
    started: bool,
}

impl Recognition {
    /// The current situations of the session (recognised again when the recording changed).
    pub fn situations(s: &mut Session) -> SimResult<Vec<Situation>> {
        let mut rec = std::mem::take(&mut s.recognition);
        let out = rec.update(s);
        s.recognition = rec;
        out
    }

    fn update(&mut self, s: &mut Session) -> SimResult<Vec<Situation>> {
        if s.end.is_some() {
            if let Some((rev, list)) = &self.fin {
                if *rev == s.revision {
                    return Ok(list.clone());
                }
            }
            let list = situations::recognize(s, View::whole(s))?;
            self.fin = Some((s.revision, list.clone()));
            return Ok(list);
        }
        if !self.started {
            self.started = true;
            self.frontier = f64::NEG_INFINITY;
            self.seen = (u64::MAX, usize::MAX, usize::MAX);
        }
        let nseg = s.segments.len();
        if nseg == 0 {
            return Ok(Vec::new());
        }
        let seen = (s.frame_count, nseg, s.events.len());
        if seen == self.seen {
            return Ok(self.current());
        }
        self.seen = seen;
        self.passes += 1;
        let s0 = self.window_seg.min(nseg - 1);
        let f_start = s.segments[nseg - 1].t0;
        // The view starting at segment s0, with the events from its start on
        let t0 = s.segments[s0].t0;
        let (mut lo, mut hi) = (0usize, s.events.len());
        while lo < hi {
            let mid = (lo + hi) >> 1;
            if s.events[mid].t < t0 - 1e-12 {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        let window = View { seg_lo: s0, seg_hi: nseg, ev_lo: if s0 == 0 { 0 } else { lo }, ev_hi: s.events.len(), frame_count: s.frame_count, reduced_from: s.reduced_from };
        let mut open = Vec::new();
        for sit in situations::recognize_phases(s, window)? {
            if sit.t1 >= f_start - 1e-12 {
                open.push(sit);
                continue;
            }
            if sit.t1 >= self.frontier - 1e-12 && !self.done_keys.contains(&sit.key) {
                self.done_keys.push(sit.key.clone());
                self.done.push(sit);
            }
        }
        let mut t_start = f_start;
        for o in &open {
            t_start = crate::js::js_min(t_start, o.t0);
        }
        self.open = open;
        let mut i = s0;
        while i < nseg - 1 && s.segments[i].t0 < t_start - 1e-12 {
            i += 1;
        }
        self.window_seg = i;
        self.frontier = f_start;
        self.whole = situations::recognize_conservation(s, View::whole(s))?;
        Ok(self.current())
    }

    fn current(&self) -> Vec<Situation> {
        let mut v = self.done.clone();
        v.extend(self.open.iter().cloned());
        v.extend(self.whole.iter().cloned());
        v
    }
}
