//! Simulation driver (port of `src/core/solver/simulation.ts`): integrates mode by mode, locates events,
//! applies impacts, re-determines the mode and records the state on the output grid; chunks, checkpoints,
//! fingerprints and stop conditions as in docs/dev/STREAMING.md.
//!
//! Wall-clock deadlines of the TypeScript run are replaced by an iteration budget: `advance` returns at the
//! top of the loop once the budget is used up. Like the deadline, this never changes a result.

use std::collections::{BTreeMap, VecDeque};
use std::rc::Rc;

use crate::checkpoint::{decode_checkpoint, encode_checkpoint, Checkpoint, CheckpointSegment, CheckpointStats};
use crate::dmath::pow;
use crate::dynamics::{build_system, derivative, initial_state, solve_mode, Mode, ModeSolution, System};
use crate::events::{build_event_fns, event_margin_into, locate_event, rearm, EventFn, EventType, EventValue, Margin};
use crate::impact::{approaching, resolve_impact, ImpactKind, ImpactResult};
use crate::integrators::{dopri5_step, euler_step, gauss4_step, rk4_step, ErrorControl, Stages, StepResult};
use crate::js::{js_max, js_min, js_round, to_int32};
use crate::kinematics::compute_poses;
use crate::message::{Message, SimResult};
use crate::model::{compile_model, js_str_lt};
use crate::modes::{describe_mode, determine_mode, state_mode, unit_status, ModeChoice};
use crate::moreau::{moreau_step, STICK_SPEED, SUBSTEPS};
use crate::project::{project, resolve_initial_overlap, ProjectScratch, ProjectionInfo};
use crate::record::{chain_digest, chunk_summary, frames_per_chunk, hash_events, FrameChunk, CHAIN_START};
use crate::scene::{IntegratorKind, Scene, StopKind};
use crate::sha256::{to_hex, Sha256};

/// A time interval with one mode.
#[derive(Clone, Debug)]
pub struct Segment {
    pub index: usize,
    pub t0: f64,
    pub t1: f64,
    pub mode: Mode,
    pub x0: Vec<f64>,
    pub label: String,
    pub impact_loss: f64,
    pub reduced: bool,
}

/// Kind of a state change reported at an event.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ChangeType {
    Impact,
    Touch,
    Separate,
    Stick,
    Slip,
    Reverse,
    Leave,
    Slack,
    Taut,
    Switch,
    Timestep,
    /// A body reached the pulley its rope runs onto (26.51); the run ends.
    Pulley,
    /// 26.52 (D58, D59): slider end stops, torque-limited motors, rolling resistance.
    Limit,
    Unlimit,
    MotorSlip,
    MotorLock,
    RollStop,
    RollStart,
    /// 26.55 (D90): a charged body enters or leaves a field region.
    ZoneEnter,
    ZoneLeave,
}

impl ChangeType {
    /// Name as in the TypeScript engine.
    pub fn name(self) -> &'static str {
        match self {
            ChangeType::Impact => "impact",
            ChangeType::Touch => "touch",
            ChangeType::Separate => "separate",
            ChangeType::Stick => "stick",
            ChangeType::Slip => "slip",
            ChangeType::Reverse => "reverse",
            ChangeType::Leave => "leave",
            ChangeType::Slack => "slack",
            ChangeType::Taut => "taut",
            ChangeType::Switch => "switch",
            ChangeType::Timestep => "timestep",
            ChangeType::Pulley => "pulley",
            ChangeType::Limit => "limit",
            ChangeType::Unlimit => "unlimit",
            ChangeType::MotorSlip => "motorSlip",
            ChangeType::MotorLock => "motorLock",
            ChangeType::RollStop => "rollStop",
            ChangeType::RollStart => "rollStart",
            ChangeType::ZoneEnter => "zoneEnter",
            ChangeType::ZoneLeave => "zoneLeave",
        }
    }
}

/// One change at an event.
#[derive(Clone, Debug, Default)]
pub struct ChangeDetail {
    pub ty: Option<ChangeType>,
    pub subject: String,
    pub bodies: Vec<String>,
    pub impulse: Option<f64>,
    pub vn_before: Option<f64>,
    pub vn_after: Option<f64>,
    pub restitution: Option<f64>,
    pub point: Option<(f64, f64)>,
    pub normal: Option<(f64, f64)>,
    pub tangent_impulse: Option<f64>,
    pub vt_before: Option<f64>,
    pub vt_after: Option<f64>,
    pub switch_index: Option<usize>,
    pub branch: Option<i8>,
    pub kink: Option<bool>,
}

impl ChangeDetail {
    fn simple(ty: ChangeType, subject: &str, bodies: Vec<String>) -> Self {
        ChangeDetail { ty: Some(ty), subject: subject.to_string(), bodies, ..Default::default() }
    }
    /// The change type.
    pub fn kind(&self) -> ChangeType {
        self.ty.unwrap_or(ChangeType::Timestep)
    }
}

/// An event: the instant, the functions that fired, the changes and the states before and after.
#[derive(Clone, Debug)]
pub struct SimEvent {
    pub index: usize,
    pub t: f64,
    pub triggers: Vec<EventType>,
    pub changes: Vec<ChangeDetail>,
    pub before: Vec<f64>,
    pub after: Vec<f64>,
    pub impact: Option<ImpactResult>,
    pub segment: usize,
}

/// Solver statistics of a run.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct SimStats {
    pub steps: u64,
    pub rejected: u64,
    pub events: u64,
    pub locate_iterations: u64,
    pub max_position_correction: f64,
    pub max_velocity_correction: f64,
    pub ambiguous_modes: u64,
}

/// Why a run ended.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StopReason {
    Duration,
    StopAt,
    Rest,
    User,
    Error,
    /// A body reached the pulley its rope runs onto (26.51).
    Pulley,
    /// Approximate rest (26.51): every velocity and acceleration below REST_TOL for REST_HOLD seconds.
    RestApprox,
}

impl StopReason {
    /// Name as in the TypeScript engine.
    pub fn name(self) -> &'static str {
        match self {
            StopReason::Duration => "duration",
            StopReason::StopAt => "stopAt",
            StopReason::Rest => "rest",
            StopReason::User => "user",
            StopReason::Error => "error",
            StopReason::Pulley => "pulley",
            StopReason::RestApprox => "restApprox",
        }
    }
}

/// Event-storm fallback: more than `events` events within `window` seconds switch to Moreau–Jean.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Fallback {
    pub events: f64,
    pub window: f64,
}

/// Options of a run (the parts of SimOptions that define results).
#[derive(Clone, Debug, PartialEq)]
pub struct SimOptions {
    /// None: the scene's duration; Some(None): unbounded; Some(Some(d)): bounded to d.
    pub duration: Option<Option<f64>>,
    pub max_events_per_instant: f64,
    /// None: stop with an error instead of falling back.
    pub fallback: Option<Fallback>,
    pub chunk_seconds: f64,
}

impl Default for SimOptions {
    fn default() -> Self {
        SimOptions { duration: None, max_events_per_instant: 200.0, fallback: Some(Fallback { events: 400.0, window: 0.05 }), chunk_seconds: 1.0 }
    }
}

/// Accepted steps a bounded run may take.
pub const MAX_STEPS: u64 = 5_000_000;
/// Accepted steps an unbounded run may take within one chunk.
pub const MAX_STEPS_PER_CHUNK: u64 = 500_000;

/// A closed chunk: its frames are final and its digest is known.
#[derive(Clone, Debug)]
pub struct ClosedChunk {
    pub chunk: usize,
    pub first: u64,
    pub frames: usize,
    pub events_from: usize,
    pub events_to: usize,
    pub segments_to: usize,
    pub digest: [u8; 32],
    pub rolling: [u8; 32],
    pub summary: Vec<f64>,
    pub t: f64,
}

/// Rolling fingerprint up to time t.
#[derive(Clone, Debug, PartialEq)]
pub struct RollingFingerprint {
    pub hash: String,
    pub t: f64,
    pub chunks: usize,
}

/// Status of `advance`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Advance {
    /// The iteration budget is used up; call again.
    Budget,
    /// The pause frame is reached.
    Paused,
    /// The run has ended.
    Finished,
}

/// An incremental simulation (SimulationRun of simulation.ts).
pub struct SimulationRun {
    pub system: Rc<System>,
    pub dt: f64,
    pub size: usize,
    /// Number of output intervals; None for an unbounded run.
    pub k_max: Option<u64>,
    /// Simulated duration (s); +∞ for an unbounded run.
    pub t_end: f64,
    pub bounded: bool,
    pub chunk_frames: usize,
    /// Frame chunks by index (None: not created yet or released).
    pub frames: Vec<Option<FrameChunk>>,
    /// Serialized checkpoints by chunk index.
    pub checkpoints: Vec<Option<Vec<f64>>>,
    pub closed: Vec<ClosedChunk>,
    pub segments: Vec<Segment>,
    pub events: Vec<SimEvent>,
    pub warnings: Vec<Message>,
    pub stats: SimStats,
    pub error: Option<Message>,
    pub finished: bool,
    pub stop_reason: Option<StopReason>,
    pub reduced_from: Option<f64>,
    pub k: u64,
    pub t: f64,
    pub rolling: [u8; 32],
    /// Final fingerprint (set when the run has ended).
    pub hash: String,

    opts: SimOptions,
    integrator: IntegratorKind,
    proj_info: ProjectionInfo,
    impact_loss: f64,
    x: Vec<f64>,
    mode: Mode,
    sol: ModeSolution,
    fns: Vec<EventFn>,
    k1: Vec<f64>,
    h: f64,
    last_event_t: f64,
    events_at_instant: f64,
    toggles: BTreeMap<usize, Vec<f64>>,
    recent_events: VecDeque<f64>,
    ctl: ErrorControl,
    seg_base: usize,
    event_base: usize,
    first_chunk: usize,
    cp_frame: u64,
    pause_frame: f64,
    k_stop: f64,
    chunk_steps: u64,
    chunk_events: BTreeMap<usize, usize>,
    rest_allowed: bool,
    /// A stop decided inside a step (rest, approximate rest, a pulley reached), taken at the next loop top (26.51).
    pending_stop: Option<StopReason>,
    /// Consecutive recorded frames of approximate rest (26.51) and the number that ends the run.
    near_rest: u64,
    rest_hold: u64,
    state_hasher: Option<Sha256>,
    finished_once: bool,
    budget: u64,
    rhs_sol: ModeSolution,
    check_sol: ModeSolution,
    stages: Stages,
    proj_scratch: ProjectScratch,
    margin: Margin,
}

/// Approximate rest (26.51): speeds and accelerations at most this.
pub const REST_TOL: f64 = 1e-6;
/// Approximate rest must last this long (s of recorded frames).
pub const REST_HOLD: f64 = 1.0;

/// Are the first `count` components of the derivative all within REST_TOL?
#[allow(clippy::neg_cmp_op_on_partial_ord)]
/// Are the first `count` components of a state (positions and velocities) all finite?
fn finite_state(x: &[f64], count: usize) -> bool {
    x[..count].iter().all(|v| v.is_finite())
}

fn near_rest(f: &[f64], count: usize) -> bool {
    f[..count].iter().all(|&v| v.abs() <= REST_TOL)
}

/// Is the derivative exactly zero in every component?
fn at_rest(f: &[f64]) -> bool {
    f.iter().all(|&v| v == 0.0)
}

fn initial_step_guess(x: &[f64], f: &[f64], ctl: &ErrorControl, dt: f64) -> f64 {
    let mut d0 = 0.0;
    let mut d1 = 0.0;
    for i in 0..ctl.count {
        let sc = ctl.abs_tol + ctl.rel_tol * x[i].abs();
        let a = x[i] / sc;
        let b = f[i] / sc;
        d0 += a * a;
        d1 += b * b;
    }
    d0 = (d0 / js_max(1.0, ctl.count as f64)).sqrt();
    d1 = (d1 / js_max(1.0, ctl.count as f64)).sqrt();
    let h0 = if d0 < 1e-5 || d1 < 1e-5 { 1e-6 } else { 0.01 * d0 / d1 };
    js_max(1e-8, js_min(h0, dt))
}

/// One step of the scene's integrator from X0 with the mode's right-hand side; `sol` receives the solution of
/// the last evaluation (for Dormand–Prince: at the returned state).
#[allow(clippy::too_many_arguments)]
fn step_from(
    sys: &System,
    mode: &Mode,
    integrator: IntegratorKind,
    ctl: &ErrorControl,
    x0: &[f64],
    h: f64,
    k1: &[f64],
    sol: &mut ModeSolution,
    st: &mut Stages,
) -> SimResult<StepResult> {
    let slot = sys.time_slot;
    let mut rhs = |y: &[f64], out: &mut [f64]| derivative(sys, y, mode, out, sol);
    match integrator {
        IntegratorKind::Rk4 => rk4_step(&mut rhs, x0, h, Some(k1), slot),
        IntegratorKind::Euler => euler_step(&mut rhs, x0, h, 3 * sys.n, Some(k1), slot),
        IntegratorKind::Gauss4 => gauss4_step(&mut rhs, x0, h, Some(k1), slot),
        _ => dopri5_step(&mut rhs, x0, h, ctl, Some(k1), slot, st),
    }
}

fn rope_bodies(sys: &System, k: usize) -> Vec<String> {
    let r = &sys.model.ropes[k];
    let id = |b: Option<usize>| b.map(|g| sys.model.bodies[g].id.clone()).unwrap_or_default();
    [id(r.a.body), id(r.b.body)].into_iter().filter(|s| !s.is_empty()).collect()
}

/// Changes between two modes (and the points of an impact).
fn diff_modes(sys: &System, prev: Option<&Mode>, next: &Mode, impact: Option<&ImpactResult>) -> Vec<ChangeDetail> {
    let mut out: Vec<ChangeDetail> = Vec::new();
    if let Some(imp) = impact {
        for p in &imp.points {
            match (p.kind, p.pair) {
                (ImpactKind::Contact, Some(pi)) => {
                    if p.vn_before < 0.0 {
                        let pair = &sys.pairs[pi];
                        let mut c =
                            ChangeDetail::simple(ChangeType::Impact, &pair.key, vec![sys.model.bodies[pair.x].id.clone(), sys.model.bodies[pair.y].id.clone()]);
                        c.impulse = Some(p.impulse);
                        c.vn_before = Some(p.vn_before);
                        c.vn_after = Some(p.vn_after);
                        c.restitution = Some(p.restitution);
                        c.point = Some((p.cx, p.cy));
                        c.normal = Some((p.nx, p.ny));
                        if let Some(ti) = p.tangent_impulse {
                            c.tangent_impulse = Some(ti);
                            c.vt_before = p.vt_before;
                            c.vt_after = p.vt_after;
                        }
                        out.push(c);
                    }
                }
                (ImpactKind::Rope, _) if p.vn_before < 0.0 => {
                    let r = &sys.model.ropes[p.rope as usize];
                    let mut c = ChangeDetail::simple(ChangeType::Taut, &r.id, rope_bodies(sys, p.rope as usize));
                    c.impulse = Some(p.impulse);
                    c.vn_before = Some(p.vn_before);
                    c.vn_after = Some(p.vn_after);
                    out.push(c);
                }
                (ImpactKind::Limit, _) if p.vn_before < 0.0 => {
                    let sl = &sys.model.sliders[p.rope as usize];
                    let mut c = ChangeDetail::simple(ChangeType::Limit, &sl.id, anchor_bodies(sys, sl.a.body, sl.b.body));
                    c.impulse = Some(p.impulse);
                    c.vn_before = Some(p.vn_before);
                    c.vn_after = Some(p.vn_after);
                    c.restitution = Some(p.restitution);
                    c.point = Some((p.cx, p.cy));
                    c.normal = Some((p.nx, p.ny));
                    out.push(c);
                }
                _ => {}
            }
        }
    }
    let Some(prev) = prev else { return out };
    let status = |m: &Mode| -> Vec<(String, &'static str, Vec<String>)> {
        let mut v: Vec<(String, &'static str, Vec<String>)> = Vec::new();
        for u in &m.units {
            if u.points.is_empty() {
                continue;
            }
            let pair = &sys.pairs[u.pair];
            let entry = (pair.key.clone(), unit_status(u), vec![sys.model.bodies[pair.x].id.clone(), sys.model.bodies[pair.y].id.clone()]);
            match v.iter_mut().find(|e| e.0 == entry.0) {
                Some(e) => *e = entry,
                None => v.push(entry),
            }
        }
        v
    };
    let a = status(prev);
    let b = status(next);
    let mut keys: Vec<String> = Vec::new();
    for e in a.iter().chain(b.iter()) {
        if !keys.contains(&e.0) {
            keys.push(e.0.clone());
        }
    }
    keys.sort_by(|x, y| {
        if js_str_lt(x, y) {
            std::cmp::Ordering::Less
        } else if js_str_lt(y, x) {
            std::cmp::Ordering::Greater
        } else {
            std::cmp::Ordering::Equal
        }
    });
    for key in &keys {
        let pa = a.iter().find(|e| &e.0 == key);
        let pb = b.iter().find(|e| &e.0 == key);
        let bodies = pa.or(pb).map(|e| e.2.clone()).unwrap_or_default();
        match (pa, pb) {
            (None, Some(_)) => {
                if !out.iter().any(|c| c.kind() == ChangeType::Impact && &c.subject == key) {
                    out.push(ChangeDetail::simple(ChangeType::Touch, key, bodies));
                }
            }
            (Some(_), None) => out.push(ChangeDetail::simple(ChangeType::Separate, key, bodies)),
            (Some(pa), Some(pb)) if pa.1 != pb.1 => {
                let was = pa.1;
                let now = pb.1;
                if was.starts_with("slide") && now == "stick" {
                    out.push(ChangeDetail::simple(ChangeType::Stick, key, bodies));
                } else if was == "stick" && now.starts_with("slide") {
                    out.push(ChangeDetail::simple(ChangeType::Slip, key, bodies));
                } else if was.starts_with("slide") && now.starts_with("slide") {
                    out.push(ChangeDetail::simple(ChangeType::Reverse, key, bodies));
                }
            }
            _ => {}
        }
    }
    for (k, r) in sys.model.ropes.iter().enumerate() {
        let bodies = rope_bodies(sys, k);
        if prev.taut[k] && !next.taut[k] {
            out.push(ChangeDetail::simple(ChangeType::Slack, &r.id, bodies));
        } else if !prev.taut[k] && next.taut[k] && !out.iter().any(|c| c.kind() == ChangeType::Taut && c.subject == r.id) {
            out.push(ChangeDetail::simple(ChangeType::Taut, &r.id, bodies));
        }
    }
    let model = &sys.model;
    if let (Some(psw), Some(nsw)) = (&prev.sw, &next.sw) {
        let ns = model.arena.switches.len();
        for (k, branch) in nsw.iter().enumerate() {
            if psw.get(k) == Some(branch) {
                continue;
            }
            if k >= ns {
                // 26.55 (D90): a field region
                let Some(&(zi, g)) = model.zone_pairs.get(k - ns) else { continue };
                let ty = if *branch > 0 { ChangeType::ZoneEnter } else { ChangeType::ZoneLeave };
                out.push(ChangeDetail::simple(ty, &model.zones[zi].id, vec![model.bodies[g].id.clone()]));
                continue;
            }
            let f = &model.forces[model.switch_force[k]];
            let def = &model.arena.switches[k];
            let mut c = ChangeDetail::simple(ChangeType::Switch, &f.id, f.a.body.map(|g| vec![model.bodies[g].id.clone()]).unwrap_or_default());
            c.switch_index = Some(k);
            c.branch = Some(*branch);
            c.kink = Some(!def.jump);
            out.push(c);
        }
    }
    // 26.52: rolling resistance of closed units of the same pair in both modes, in unit order
    for u in &next.units {
        let Some(r1) = u.roll.filter(|_| !u.points.is_empty()) else { continue };
        let Some(r0) = prev.units.iter().find(|q| q.pair == u.pair && !q.points.is_empty() && q.roll.is_some()).and_then(|q| q.roll) else { continue };
        if r0 == r1 {
            continue;
        }
        let pair = &sys.pairs[u.pair];
        let bodies = vec![model.bodies[pair.x].id.clone(), model.bodies[pair.y].id.clone()];
        if r1 == 0 {
            out.push(ChangeDetail::simple(ChangeType::RollStop, &pair.key, bodies));
        } else if r0 == 0 {
            out.push(ChangeDetail::simple(ChangeType::RollStart, &pair.key, bodies));
        }
    }
    // 26.52: slider end stops and torque-limited motors
    if let (Some(pl), Some(nl)) = (&prev.limit, &next.limit) {
        for (k, sl) in model.sliders.iter().enumerate() {
            let (a, b) = (pl[k], nl[k]);
            if a == b {
                continue;
            }
            let bodies = anchor_bodies(sys, sl.a.body, sl.b.body);
            if b != 0 && !out.iter().any(|c| c.kind() == ChangeType::Limit && c.subject == sl.id) {
                out.push(ChangeDetail::simple(ChangeType::Limit, &sl.id, bodies));
            } else if b == 0 {
                out.push(ChangeDetail::simple(ChangeType::Unlimit, &sl.id, bodies));
            }
        }
    }
    if let (Some(ps), Some(ns)) = (&prev.slip, &next.slip) {
        for (k, mo) in model.motors.iter().enumerate() {
            let (a, b) = (ps[k], ns[k]);
            if a == b {
                continue;
            }
            let bodies = anchor_bodies(sys, mo.a.body, mo.b.body);
            out.push(ChangeDetail::simple(if b == 0 { ChangeType::MotorLock } else { ChangeType::MotorSlip }, &mo.id, bodies));
        }
    }
    out
}

/// Ids of the bodies of two anchors (the world left out).
fn anchor_bodies(sys: &System, a: Option<usize>, b: Option<usize>) -> Vec<String> {
    let id = |g: Option<usize>| g.map(|g| sys.model.bodies[g].id.clone()).unwrap_or_default();
    [id(a), id(b)].into_iter().filter(|s| !s.is_empty()).collect()
}

/// Does a change match a stop kind? 'touch' also matches an impact.
pub fn change_matches(c: &ChangeDetail, on: StopKind) -> bool {
    c.kind().name() == on.name() || (on == StopKind::Touch && c.kind() == ChangeType::Impact)
}

struct Settled {
    x: Vec<f64>,
    choice: ModeChoice,
    impact: Option<ImpactResult>,
}

impl SimulationRun {
    /// Start a run of a scene (the constructor of simulation.ts without a resume point).
    pub fn new(scene: &Scene, opts: SimOptions) -> SimResult<SimulationRun> {
        let model = compile_model(scene)?;
        let warnings = model.warnings.clone();
        let sys = Rc::new(build_system(model));
        let mut run = SimulationRun::blank(sys, opts, warnings, false);
        run.first_chunk = 0;
        run.chunk_events.insert(0, 0);
        let sys = run.system.clone();
        run.impact_loss = sys.model.settings.start_ledger.as_ref().map(|l| l.impact_loss).unwrap_or(0.0);
        let mut x = initial_state(&sys);
        let overlap = resolve_initial_overlap(&sys, &x, 0.05);
        if overlap.removed > 0.0 {
            x = overlap.x;
            run.warnings.push(Message::new("warn.initialOverlapRemoved").num("mm", overlap.removed * 1000.0));
        }
        if !overlap.deep.is_empty() {
            run.warnings.push(Message::new("warn.initialDeepOverlap").list("pairs", overlap.deep));
        }
        let first = run.settle(x, &[], &[])?;
        let x = first.x;
        run.mode = first.choice.mode;
        run.sol = first.choice.solution;
        run.segments.push(Segment {
            index: 0,
            t0: 0.0,
            t1: run.t_end,
            mode: run.mode.clone(),
            x0: x.clone(),
            label: describe_mode(&sys, &run.mode),
            impact_loss: run.impact_loss,
            reduced: false,
        });
        if let Some(imp) = first.impact {
            let changes = diff_modes(&sys, None, &run.mode, Some(&imp));
            run.check_stop_at(&changes, 0.0);
            run.events.push(SimEvent {
                index: 0,
                t: 0.0,
                triggers: vec![EventType::Contact],
                changes,
                before: initial_state(&sys),
                after: x.clone(),
                impact: Some(imp),
                segment: 0,
            });
        }
        run.x = x;
        let x0 = run.x.clone();
        run.record(0, &x0);
        let poses = compute_poses(&sys.model, &run.x);
        run.fns = build_event_fns(&sys, &run.mode, &poses, &run.sol, &run.x);
        run.k1 = vec![0.0; run.size];
        derivative(&sys, &run.x, &run.mode, &mut run.k1, &mut run.rhs_sol)?;
        run.h = if run.integrator == IntegratorKind::Dopri5 { js_min(run.dt, initial_step_guess(&run.x, &run.k1, &run.ctl, run.dt)) } else { run.dt };
        if run.k_max == Some(0) {
            run.finished = true;
            run.stop_reason = Some(StopReason::Duration);
        }
        if run.integrator == IntegratorKind::Moreau && !run.finished {
            run.start_reduced(Message::new("reason.moreauSelected"));
        }
        if run.finished {
            run.finish();
        }
        Ok(run)
    }

    /// Continue from a checkpoint of an earlier run of the same scene and options (resumed run).
    pub fn resume(system: Rc<System>, opts: SimOptions, checkpoint: &[f64]) -> SimResult<SimulationRun> {
        let cp = decode_checkpoint(checkpoint).map_err(|e| Message::new("err.internal").text("message", e.0))?;
        let mut run = SimulationRun::blank(system, opts, Vec::new(), true);
        run.restore(cp)?;
        Ok(run)
    }

    fn blank(system: Rc<System>, opts: SimOptions, warnings: Vec<Message>, resumed: bool) -> SimulationRun {
        let st = &system.model.settings;
        let dt = st.output_step;
        let duration = match opts.duration {
            Some(d) => d,
            None => st.duration,
        };
        let bounded = duration.is_some();
        let k_max = duration.map(|d| js_max(0.0, js_round(d / dt)) as u64);
        let size = system.size;
        let chunk_frames = frames_per_chunk(dt, opts.chunk_seconds);
        let ctl = ErrorControl { rel_tol: st.rel_tol, abs_tol: st.abs_tol, count: 6 * system.n };
        let rest_allowed = !bounded && system.time_slot.is_none() && !system.model.running_belt;
        let integrator = st.integrator;
        SimulationRun {
            dt,
            size,
            k_max,
            t_end: duration.unwrap_or(f64::INFINITY),
            bounded,
            chunk_frames,
            frames: Vec::new(),
            checkpoints: Vec::new(),
            closed: Vec::new(),
            segments: Vec::new(),
            events: Vec::new(),
            warnings,
            stats: SimStats::default(),
            error: None,
            finished: false,
            stop_reason: None,
            reduced_from: None,
            k: 0,
            t: 0.0,
            rolling: CHAIN_START,
            hash: String::new(),
            opts,
            integrator,
            proj_info: ProjectionInfo::default(),
            impact_loss: 0.0,
            x: Vec::new(),
            mode: Mode::default(),
            sol: ModeSolution::default(),
            fns: Vec::new(),
            k1: Vec::new(),
            h: 0.0,
            last_event_t: -1.0,
            events_at_instant: 0.0,
            toggles: BTreeMap::new(),
            recent_events: VecDeque::new(),
            ctl,
            seg_base: 0,
            event_base: 0,
            first_chunk: 0,
            cp_frame: 0,
            pause_frame: f64::INFINITY,
            k_stop: f64::INFINITY,
            chunk_steps: 0,
            chunk_events: BTreeMap::new(),
            rest_allowed,
            pending_stop: None,
            near_rest: 0,
            rest_hold: js_max(1.0, js_round(REST_HOLD / dt)) as u64,
            state_hasher: if bounded && !resumed { Some(Sha256::new()) } else { None },
            finished_once: false,
            budget: u64::MAX,
            rhs_sol: ModeSolution::default(),
            check_sol: ModeSolution::default(),
            stages: Stages::default(),
            proj_scratch: ProjectScratch::default(),
            margin: Margin::default(),
            system,
        }
    }

    /// Number of valid frames.
    pub fn frame_count(&self) -> u64 {
        self.k + 1
    }

    /// Global count of segments and events.
    pub fn segment_count(&self) -> usize {
        self.seg_base + self.segments.len()
    }
    pub fn event_count(&self) -> usize {
        self.event_base + self.events.len()
    }
    /// Global index of segments[0] and events[0].
    pub fn segment_base(&self) -> usize {
        self.seg_base
    }
    pub fn event_base(&self) -> usize {
        self.event_base
    }
    /// First chunk this run computes.
    pub fn first_chunk(&self) -> usize {
        self.first_chunk
    }
    /// The run's options.
    pub fn options(&self) -> &SimOptions {
        &self.opts
    }

    fn start_reduced(&mut self, reason: Message) {
        let sys = self.system.clone();
        self.reduced_from = Some(self.t);
        self.warnings.push(Message::new("warn.reducedAccuracy").num("t", self.t).msg("reason", reason));
        let mode = state_mode(&sys, &self.x, STICK_SPEED);
        self.mode = mode.clone();
        let label = describe_mode(&sys, &mode);
        let mut seg = Segment {
            index: self.seg_base + self.segments.len(),
            t0: self.t,
            t1: self.t_end,
            mode,
            x0: self.x.clone(),
            label,
            impact_loss: self.impact_loss,
            reduced: true,
        };
        let last = self.segments.len() - 1;
        if self.segments[last].t0 == self.t {
            seg.index = self.segments[last].index;
            self.segments[last] = seg;
        } else {
            self.segments[last].t1 = self.t;
            self.segments.push(seg);
        }
        self.events.push(SimEvent {
            index: self.event_base + self.events.len(),
            t: self.t,
            triggers: Vec::new(),
            changes: vec![ChangeDetail::simple(ChangeType::Timestep, "solver", Vec::new())],
            before: self.x.clone(),
            after: self.x.clone(),
            impact: None,
            segment: self.seg_base + self.segments.len() - 1,
        });
        self.stats.events += 1;
    }

    /// Moreau–Jean steps (substeps per output interval, frames on the grid).
    fn reduced_loop(&mut self) -> SimResult<Advance> {
        let sys = self.system.clone();
        let dt = self.dt;
        loop {
            if self.k == self.cp_frame {
                self.checkpoint()?;
            }
            if let Some(r) = self.end_check() {
                return Ok(r);
            }
            if self.k as f64 >= self.pause_frame {
                return Ok(Advance::Paused);
            }
            if self.budget == 0 {
                return Ok(Advance::Budget);
            }
            self.budget -= 1;
            let t_next = (self.k + 1) as f64 * dt;
            let t0 = self.t;
            let s = SUBSTEPS;
            let mut x = std::mem::take(&mut self.x);
            let mut i = 1;
            while i <= s && t_next > t0 {
                let t1 = if i == s { t_next } else { t0 + (t_next - t0) * i as f64 / s as f64 };
                let r = moreau_step(&sys, &x, t1 - self.t)?;
                // 26.52: a state that is no longer finite ends the run
                if !finite_state(&r.x, 6 * sys.n) {
                    self.x = x;
                    self.fail(Message::new("err.stateNotFinite").num("t", self.t), StopReason::Error);
                    return Ok(Advance::Finished);
                }
                x = r.x;
                self.impact_loss += r.loss;
                self.t = t1;
                if let Some(slot) = sys.time_slot {
                    x[slot] = t1;
                }
                self.stats.steps += 1;
                i += 1;
            }
            self.x = x;
            let mode = state_mode(&sys, &self.x, STICK_SPEED);
            let label = describe_mode(&sys, &mode);
            let last = self.segments.len() - 1;
            if label != self.segments[last].label {
                self.segments[last].t1 = t_next;
                self.mode = mode.clone();
                self.segments.push(Segment {
                    index: self.seg_base + self.segments.len(),
                    t0: t_next,
                    t1: self.t_end,
                    mode,
                    x0: self.x.clone(),
                    label,
                    impact_loss: self.impact_loss,
                    reduced: true,
                });
            }
            self.k += 1;
            let xr = std::mem::take(&mut self.x);
            self.record(self.k, &xr);
            self.x = xr;
        }
    }

    /// The end checks of the loop top (duration, stop condition).
    fn end_check(&mut self) -> Option<Advance> {
        let at_k = self.k_max.is_some_and(|kk| self.k >= kk);
        if at_k || self.k as f64 >= self.k_stop || self.pending_stop.is_some() {
            let reason = self.pending_stop.unwrap_or(if at_k { StopReason::Duration } else { StopReason::StopAt });
            self.end(reason);
            return Some(Advance::Finished);
        }
        None
    }

    /// Too many events recently (simulated time)?
    fn event_storm(&mut self, t: f64) -> bool {
        let Some(fb) = self.opts.fallback else { return false };
        self.recent_events.push_back(t);
        while let Some(&front) = self.recent_events.front() {
            if front < t - fb.window {
                self.recent_events.pop_front();
            } else {
                break;
            }
        }
        self.recent_events.len() as f64 > fb.events
    }

    /// Impacts, then the mode, then projection; returns the post-event state.
    fn settle(&mut self, x_in: Vec<f64>, slack: &[usize], unlimit: &[usize]) -> SimResult<Settled> {
        let sys = self.system.clone();
        let mut xc = x_in;
        let mut combined: Option<ImpactResult> = None;
        let mut k = 0;
        while k < 8 && approaching(&sys, &xc) {
            let Some(imp) = resolve_impact(&sys, &xc) else { break };
            xc = imp.x.clone();
            self.impact_loss += imp.loss;
            if let Some(w) = &imp.warning {
                if !self.warnings.contains(w) {
                    self.warnings.push(w.clone());
                }
            }
            combined = Some(match combined {
                None => imp,
                Some(c) => {
                    let mut points = c.points;
                    points.extend(imp.points.iter().cloned());
                    ImpactResult {
                        x: imp.x,
                        points,
                        energy_before: c.energy_before,
                        energy_after: imp.energy_after,
                        loss: c.loss + imp.loss,
                        warning: imp.warning,
                    }
                }
            });
            k += 1;
        }
        let mut choice = determine_mode(&sys, &xc, 20000, slack, unlimit)?;
        let moving = sliding_speeds(&sys, &xc, &choice.mode);
        if let Some(px) = project(&sys, &xc, &choice.mode, &mut self.proj_info, &mut self.proj_scratch) {
            xc = px;
        }
        // 26.53 (D73): a unit taken as sliding whose relative tangential velocity the projection brought to rest (the
        // other contacts fix the body) is decided again at the projected state, where it may stick
        if !moving.is_empty() {
            let after = sliding_speeds(&sys, &xc, &choice.mode);
            if after.iter().zip(&moving).any(|(v, m)| m.abs() > crate::dynamics::tol::VEL && v.abs() <= crate::dynamics::tol::VEL) {
                choice = determine_mode(&sys, &xc, 20000, slack, unlimit)?;
                if let Some(px) = project(&sys, &xc, &choice.mode, &mut self.proj_info, &mut self.proj_scratch) {
                    xc = px;
                }
            }
        }
        choice.solution = solve_mode(&sys, &xc, &choice.mode, None)?;
        if choice.ambiguous {
            self.stats.ambiguous_modes += 1;
            if self.stats.ambiguous_modes <= 3 {
                self.warnings.push(Message::new("warn.ambiguousMode").num("violation", choice.violation));
            }
        }
        Ok(Settled { x: xc, choice, impact: combined })
    }

    /// Store frame `index` (the next one) in its chunk.
    fn record(&mut self, index: u64, xr: &[f64]) {
        let f = self.chunk_frames as u64;
        let ci = (index / f) as usize;
        if self.frames.len() <= ci {
            self.frames.resize_with(ci + 1, || None);
        }
        if self.frames[ci].is_none() {
            let first = ci as u64 * f;
            let cap = match self.k_max {
                Some(kk) if self.bounded => (f.min(kk + 1 - first)) as usize,
                _ => f as usize,
            };
            self.frames[ci] = Some(FrameChunk::new(ci, first, cap, self.size));
        }
        let seg = to_int32((self.seg_base + self.segments.len() - 1) as f64);
        let loss = self.impact_loss;
        let size = self.size;
        let c = self.frames[ci].as_mut().expect("chunk exists");
        let j = (index - c.first) as usize;
        c.states[j * size..(j + 1) * size].copy_from_slice(xr);
        c.segment[j] = seg;
        c.impact_loss[j] = loss;
        c.count = j + 1;
    }

    /// A switch of a variable force that keeps toggling cannot be integrated.
    fn check_toggles(&mut self, changes: &[ChangeDetail]) -> Option<Message> {
        for c in changes {
            if c.kind() != ChangeType::Switch {
                continue;
            }
            let Some(si) = c.switch_index else { continue };
            let t = self.t;
            let list = self.toggles.entry(si).or_default();
            list.push(t);
            while !list.is_empty() && list[0] < t - 1e-6 {
                list.remove(0);
            }
            if list.len() > 40 {
                let name = self.system.model.forces.iter().find(|f| f.id == c.subject).map(|f| f.name.clone()).unwrap_or_else(|| c.subject.clone());
                return Some(Message::new("err.switchChatter").text("force", name).num("t", t));
            }
        }
        None
    }

    /// The first event with a change of the kind of settings.stopAt arms the stop.
    fn check_stop_at(&mut self, changes: &[ChangeDetail], t_e: f64) {
        let Some(sa) = self.system.model.settings.stop_at else { return };
        if self.k_stop != f64::INFINITY {
            return;
        }
        if !changes.iter().any(|c| change_matches(c, sa.on)) {
            return;
        }
        self.k_stop = js_max(self.k as f64, ((t_e + sa.after) / self.dt).ceil());
    }

    /// Run until `budget` loop iterations are used, the frame `until_frame` is reached (paused) or the run ends.
    pub fn advance(&mut self, budget: u64, until_frame: f64) -> Advance {
        if self.finished {
            return Advance::Finished;
        }
        self.pause_frame = until_frame;
        self.budget = budget;
        let r = if self.reduced_from.is_some() { self.reduced_loop() } else { self.event_loop() };
        let status = match r {
            Ok(s) => s,
            Err(e) => {
                self.fail(e, StopReason::Error);
                Advance::Finished
            }
        };
        if self.finished {
            self.finish();
            return Advance::Finished;
        }
        status
    }

    fn fail(&mut self, message: Message, reason: StopReason) {
        self.error = Some(message);
        self.finished = true;
        if self.stop_reason.is_none() {
            self.stop_reason = Some(reason);
        }
    }

    fn end(&mut self, reason: StopReason) {
        self.finished = true;
        if self.stop_reason.is_none() {
            self.stop_reason = Some(reason);
        }
    }

    /// Event-driven integration until the budget, a pause or the end of the run.
    fn event_loop(&mut self) -> SimResult<Advance> {
        let sys = self.system.clone();
        let integrator = self.integrator;
        let dt = self.dt;
        let t_end = self.t_end;
        let slot = sys.time_slot;
        let max_at_instant = self.opts.max_events_per_instant;
        loop {
            if self.k == self.cp_frame {
                self.checkpoint()?;
            }
            if let Some(r) = self.end_check() {
                return Ok(r);
            }
            if self.k as f64 >= self.pause_frame {
                return Ok(Advance::Paused);
            }
            if self.budget == 0 {
                return Ok(Advance::Budget);
            }
            self.budget -= 1;
            let t = self.t;
            let t_next = (self.k + 1) as f64 * dt;
            let remaining = t_next - t;
            let clipped = self.h >= remaining;
            let h_try = if clipped { remaining } else { self.h };
            let r = step_from(&sys, &self.mode, integrator, &self.ctl, &self.x, h_try, &self.k1, &mut self.rhs_sol, &mut self.stages)?;
            // 26.52: a state that is no longer finite (a body driven off to infinity in finite time): smaller steps, else stop
            if !finite_state(&r.x, 6 * sys.n) {
                if integrator == IntegratorKind::Dopri5 {
                    self.stats.rejected += 1;
                    self.h = h_try * 0.2;
                    if self.h < 1e-14 {
                        self.fail(Message::new("err.stepTooSmall").num("t", t), StopReason::Error);
                        return Ok(Advance::Finished);
                    }
                    continue;
                }
                self.fail(Message::new("err.stateNotFinite").num("t", t), StopReason::Error);
                return Ok(Advance::Finished);
            }
            if integrator == IntegratorKind::Dopri5 && r.err > 1.0 {
                self.stats.rejected += 1;
                self.h = h_try * js_max(0.2, 0.9 * pow(r.err, -0.2));
                if self.h < 1e-14 {
                    self.fail(Message::new("err.stepTooSmall").num("t", t), StopReason::Error);
                    return Ok(Advance::Finished);
                }
                continue;
            }
            // The last right-hand side of a Dormand–Prince step was evaluated at r.x (identity cache)
            let pre = if integrator == IntegratorKind::Dopri5 { Some(&self.rhs_sol) } else { None };
            let mut check = std::mem::take(&mut self.margin);
            event_margin_into(&sys, &self.fns, &self.mode, &r.x, pre, &mut self.check_sol, &mut check)?;
            if check.margin < 0.0 {
                // ---- Event ----
                let x0 = std::mem::take(&mut self.x);
                let loc = {
                    let mode = &self.mode;
                    let k1 = &self.k1;
                    let ctl = self.ctl;
                    let rhs_sol = &mut self.rhs_sol;
                    let stages = &mut self.stages;
                    let x0r = &x0;
                    let mut step = |hh: f64| -> SimResult<Vec<f64>> {
                        if hh == 0.0 {
                            return Ok(x0r.clone());
                        }
                        Ok(step_from(&sys, mode, integrator, &ctl, x0r, hh, k1, rhs_sol, stages)?.x)
                    };
                    locate_event(&sys, &self.fns, &self.mode, &mut step, x0r, h_try, check.margin, &mut self.check_sol)?
                };
                self.x = x0;
                self.stats.locate_iterations += loc.iterations as u64;
                let t_e = if loc.h >= remaining { t_next } else { t + loc.h };
                let mut before = loc.x;
                if let Some(s) = slot {
                    before[s] = t_e;
                }
                let slack: Vec<usize> = loc.fired.iter().filter(|&&i| self.fns[i].ty == EventType::Slack).map(|&i| self.fns[i].rope as usize).collect();
                let unlimit: Vec<usize> = loc.fired.iter().filter(|&&i| self.fns[i].ty == EventType::Unlimit).map(|&i| self.fns[i].item as usize).collect();
                let mut triggers: Vec<EventType> = Vec::new();
                for &i in &loc.fired {
                    let ty = self.fns[i].ty;
                    if !triggers.contains(&ty) {
                        triggers.push(ty);
                    }
                }
                let settled = self.settle(before.clone(), &slack, &unlimit)?;
                let prev_mode = std::mem::replace(&mut self.mode, settled.choice.mode);
                self.sol = settled.choice.solution;
                self.x = settled.x;
                self.t = t_e;
                let last = self.segments.len() - 1;
                self.segments[last].t1 = t_e;
                self.segments.push(Segment {
                    index: self.seg_base + self.segments.len(),
                    t0: t_e,
                    t1: t_end,
                    mode: self.mode.clone(),
                    x0: self.x.clone(),
                    label: describe_mode(&sys, &self.mode),
                    impact_loss: self.impact_loss,
                    reduced: false,
                });
                let mut changes = diff_modes(&sys, Some(&prev_mode), &self.mode, settled.impact.as_ref());
                // 26.51: a body reached the pulley its rope runs onto; the run ends at this event
                let mut reached = false;
                for &i in &loc.fired {
                    if let EventValue::Pulley { rope, end } = self.fns[i].value {
                        reached = true;
                        let r = &sys.model.ropes[rope];
                        let a = if end == 0 { &r.a } else { &r.b };
                        changes.push(ChangeDetail::simple(ChangeType::Pulley, &r.id, a.body.map(|g| vec![sys.model.bodies[g].id.clone()]).unwrap_or_default()));
                    }
                }
                self.events.push(SimEvent {
                    index: self.event_base + self.events.len(),
                    t: t_e,
                    triggers,
                    changes: changes.clone(),
                    before,
                    after: self.x.clone(),
                    impact: settled.impact,
                    segment: self.seg_base + self.segments.len() - 1,
                });
                self.stats.events += 1;
                if t_e == t_next {
                    self.k += 1;
                    let xr = std::mem::take(&mut self.x);
                    self.record(self.k, &xr);
                    self.x = xr;
                }
                if reached {
                    self.pending_stop = Some(StopReason::Pulley);
                }
                self.check_stop_at(&changes, t_e);
                let chatter = if !sys.model.arena.switches.is_empty() { self.check_toggles(&changes) } else { None };
                if let Some(msg) = chatter {
                    self.fail(msg, StopReason::Error);
                    return Ok(Advance::Finished);
                }
                if t_e - self.last_event_t <= 1e-12 {
                    self.events_at_instant += 1.0;
                    if self.events_at_instant > max_at_instant {
                        if self.opts.fallback.is_none() {
                            let m = Message::new("err.eventChatter").num("t", t_e).num("count", self.events_at_instant);
                            self.fail(m, StopReason::Error);
                            return Ok(Advance::Finished);
                        }
                        let reason = Message::new("reason.eventsAtInstant").num("t", t_e).num("count", self.events_at_instant);
                        self.start_reduced(reason);
                        return self.reduced_loop();
                    }
                } else {
                    self.events_at_instant = 0.0;
                }
                self.last_event_t = t_e;
                if self.event_storm(t_e) {
                    let window = self.opts.fallback.map(|f| f.window).unwrap_or(0.05);
                    let reason = Message::new("reason.eventStorm").num("count", self.recent_events.len() as f64).num("window", window);
                    self.start_reduced(reason);
                    return self.reduced_loop();
                }
                let poses = compute_poses(&sys.model, &self.x);
                self.fns = build_event_fns(&sys, &self.mode, &poses, &self.sol, &self.x);
                derivative(&sys, &self.x, &self.mode, &mut self.k1, &mut self.rhs_sol)?;
                if integrator != IntegratorKind::Dopri5 {
                    self.h = dt;
                }
                continue;
            }
            // ---- Accept ----
            self.stats.steps += 1;
            rearm(&mut self.fns, &check.values);
            self.margin = check;
            let StepResult { x: rx, err, k7 } = r;
            let (mut xn, mut reuse) = match project(&sys, &rx, &self.mode, &mut self.proj_info, &mut self.proj_scratch) {
                Some(p) => (p, false),
                None => (rx, k7.is_some()),
            };
            if clipped {
                self.t = t_next;
                if let Some(s) = slot {
                    if xn[s] != t_next {
                        xn[s] = t_next;
                        reuse = false;
                    }
                }
                self.k += 1;
                self.record(self.k, &xn);
            } else {
                self.t = t + h_try;
                if let Some(s) = slot {
                    if xn[s] != self.t {
                        xn[s] = self.t;
                        reuse = false;
                    }
                }
            }
            self.x = xn;
            if integrator == IntegratorKind::Dopri5 {
                let grow = if err == 0.0 { 5.0 } else { js_min(5.0, js_max(0.2, 0.9 * pow(err, -0.2))) };
                let proposal = h_try * grow;
                self.h = js_min(dt, if clipped { js_max(self.h, proposal) } else { proposal });
            } else {
                self.h = dt;
            }
            if reuse {
                self.k1 = k7.expect("reuse implies k7");
            } else {
                derivative(&sys, &self.x, &self.mode, &mut self.k1, &mut self.rhs_sol)?;
            }
            if clipped && self.rest_allowed {
                if at_rest(&self.k1) {
                    self.pending_stop = Some(StopReason::Rest);
                    continue;
                }
                if near_rest(&self.k1, 6 * sys.n) {
                    self.near_rest += 1;
                    if self.near_rest >= self.rest_hold {
                        self.pending_stop = Some(StopReason::RestApprox);
                        continue;
                    }
                } else {
                    self.near_rest = 0;
                }
            }
            let over = if self.bounded { self.stats.steps > MAX_STEPS } else { self.stats.steps - self.chunk_steps > MAX_STEPS_PER_CHUNK };
            if over {
                let m = if self.bounded {
                    Message::new("err.stepLimit")
                } else {
                    Message::new("err.chunkStepLimit").num("t", self.t).num("limit", MAX_STEPS_PER_CHUNK as f64)
                };
                self.fail(m, StopReason::Error);
                return Ok(Advance::Finished);
            }
        }
    }

    // ---- Chunks and checkpoints ----

    fn checkpoint(&mut self) -> SimResult<()> {
        let f = self.chunk_frames as u64;
        let c = (self.k / f) as usize;
        if c > self.first_chunk {
            self.close_chunk(c - 1)?;
        }
        let ev = if c == 0 { 0 } else { self.event_base + self.events.len() };
        self.chunk_events.insert(c, ev);
        let cp = encode_checkpoint(&self.snapshot_state(c));
        if self.checkpoints.len() <= c {
            self.checkpoints.resize_with(c + 1, || None);
        }
        self.checkpoints[c] = Some(cp);
        self.chunk_steps = self.stats.steps;
        self.cp_frame += f;
        Ok(())
    }

    /// Segment index recorded for frame k (it must be in memory).
    fn frame_segment(&self, k: u64) -> i32 {
        let ci = (k / self.chunk_frames as u64) as usize;
        let c = self.frames[ci].as_ref().expect("frame in memory");
        c.segment[(k - c.first) as usize]
    }

    fn snapshot_state(&self, c: usize) -> Checkpoint {
        let seg = &self.segments[self.segments.len() - 1];
        let reduced = self.reduced_from.is_some();
        Checkpoint {
            chunk: c as f64,
            k: self.k as f64,
            t: self.t,
            h: if reduced { 0.0 } else { self.h },
            impact_loss: self.impact_loss,
            last_event_t: if reduced { 0.0 } else { self.last_event_t },
            events_at_instant: if reduced { 0.0 } else { self.events_at_instant },
            reduced_from: self.reduced_from,
            k_stop: self.k_stop,
            event_count: (self.event_base + self.events.len()) as f64,
            frame_segment: self.frame_segment(self.k) as f64,
            segment: CheckpointSegment { index: seg.index as f64, t0: seg.t0, impact_loss: seg.impact_loss, reduced: seg.reduced, x0: seg.x0.clone() },
            stats: CheckpointStats {
                steps: self.stats.steps as f64,
                rejected: self.stats.rejected as f64,
                events: self.stats.events as f64,
                locate_iterations: self.stats.locate_iterations as f64,
                ambiguous_modes: self.stats.ambiguous_modes as f64,
            },
            projection: (self.proj_info.position, self.proj_info.velocity),
            x: self.x.clone(),
            k1: if reduced { vec![0.0; self.size] } else { self.k1.clone() },
            mode: self.mode.clone(),
            thresholds: if reduced { Vec::new() } else { self.fns.iter().map(|f| f.threshold).collect() },
            starts: if reduced { Vec::new() } else { self.fns.iter().map(|f| f.start).collect() },
            recent_events: if reduced { Vec::new() } else { self.recent_events.iter().copied().collect() },
            toggles: if reduced { Vec::new() } else { self.toggles.iter().map(|(&i, t)| (i as f64, t.clone())).collect() },
        }
    }

    fn restore(&mut self, cp: Checkpoint) -> SimResult<()> {
        let sys = self.system.clone();
        let internal = |m: &'static str| Message::new("err.internal").text("message", m);
        if cp.x.len() != self.size {
            return Err(internal("checkpoint: state size differs from the scene"));
        }
        for u in &cp.mode.units {
            let ok = u.pair < sys.pairs.len() && {
                let nf = sys.pairs[u.pair].features.len();
                u.ref_ < nf && u.points.iter().chain(u.open.iter()).all(|&p| p < nf)
            };
            if !ok {
                return Err(internal("checkpoint: mode does not fit the scene"));
            }
        }
        if cp.mode.taut.len() != sys.model.ropes.len() {
            return Err(internal("checkpoint: mode does not fit the scene"));
        }
        let mode = cp.mode.clone();
        self.k = cp.k as u64;
        self.t = cp.t;
        self.x = cp.x.clone();
        self.mode = mode.clone();
        self.impact_loss = cp.impact_loss;
        self.reduced_from = cp.reduced_from;
        self.k_stop = cp.k_stop;
        self.stats.steps = cp.stats.steps as u64;
        self.stats.rejected = cp.stats.rejected as u64;
        self.stats.events = cp.stats.events as u64;
        self.stats.locate_iterations = cp.stats.locate_iterations as u64;
        self.stats.ambiguous_modes = cp.stats.ambiguous_modes as u64;
        self.proj_info.position = cp.projection.0;
        self.proj_info.velocity = cp.projection.1;
        self.seg_base = cp.segment.index as usize;
        self.event_base = cp.event_count as usize;
        self.segments.push(Segment {
            index: cp.segment.index as usize,
            t0: cp.segment.t0,
            t1: self.t_end,
            mode: mode.clone(),
            x0: cp.segment.x0.clone(),
            label: describe_mode(&sys, &mode),
            impact_loss: cp.segment.impact_loss,
            reduced: cp.segment.reduced,
        });
        let f = self.chunk_frames as u64;
        let c = cp.chunk as usize;
        if c as u64 * f != self.k {
            return Err(internal("checkpoint: chunk length differs from the run"));
        }
        let cap = match self.k_max {
            Some(kk) if self.bounded => f.min(kk + 1 - self.k) as usize,
            _ => f as usize,
        };
        let mut chunk = FrameChunk::new(c, self.k, cap, self.size);
        chunk.states[..self.size].copy_from_slice(&cp.x);
        chunk.segment[0] = to_int32(cp.frame_segment);
        chunk.impact_loss[0] = cp.impact_loss;
        chunk.count = 1;
        self.frames.resize_with(c + 1, || None);
        self.frames[c] = Some(chunk);
        self.chunk_events.insert(c, if c == 0 { 0 } else { cp.event_count as usize });
        self.chunk_steps = cp.stats.steps as u64;
        self.cp_frame = self.k;
        self.first_chunk = c;
        if cp.reduced_from.is_none() {
            self.h = cp.h;
            self.k1 = cp.k1.clone();
            self.last_event_t = cp.last_event_t;
            self.events_at_instant = cp.events_at_instant;
            self.recent_events = cp.recent_events.iter().copied().collect();
            for (i, times) in &cp.toggles {
                self.toggles.insert(*i as usize, times.clone());
            }
            self.sol = solve_mode(&sys, &self.x, &mode, None)?;
            let poses = compute_poses(&sys.model, &self.x);
            self.fns = build_event_fns(&sys, &mode, &poses, &self.sol, &self.x);
            if self.fns.len() != cp.thresholds.len() {
                return Err(internal("checkpoint: event functions differ from the mode"));
            }
            for (i, f) in self.fns.iter_mut().enumerate() {
                f.threshold = cp.thresholds[i];
                f.start = cp.starts[i];
            }
        } else {
            self.k1 = vec![0.0; self.size];
        }
        Ok(())
    }

    /// Close chunk c: digest, chain, summary and the streamed bounded fingerprint.
    fn close_chunk(&mut self, c: usize) -> SimResult<()> {
        let size = self.size;
        let Some(chunk) = self.frames.get(c).and_then(|x| x.as_ref()) else {
            return Err(Message::new("err.internal").text("message", format!("chunk {c} was released before it was closed")));
        };
        let states = &chunk.states[..chunk.count * size];
        let events_from = *self.chunk_events.get(&c).unwrap_or(&0);
        let events_to = self.event_base + self.events.len();
        let local = events_from as isize - self.event_base as isize;
        let from = local.max(0) as usize;
        let mut hasher = Sha256::new();
        hasher.update_f64(states);
        hash_events(&mut hasher, self.events[from..].iter().map(|e| (e.t, e.after.as_slice())));
        let digest = hasher.digest();
        self.rolling = chain_digest(&self.rolling, &digest);
        if let Some(h) = self.state_hasher.as_mut() {
            h.update_f64(states);
        }
        let info = ClosedChunk {
            chunk: c,
            first: chunk.first,
            frames: chunk.count,
            events_from,
            events_to,
            segments_to: self.seg_base + self.segments.len(),
            digest,
            rolling: self.rolling,
            summary: chunk_summary(chunk, size),
            t: (chunk.first + chunk.count as u64 - 1) as f64 * self.dt,
        };
        self.closed.push(info);
        Ok(())
    }

    /// Drop the frames of a closed chunk (they were handed to the receiver).
    pub fn release_chunk(&mut self, c: usize) -> bool {
        match self.closed.last() {
            Some(last) if last.chunk >= c => {
                if let Some(slot) = self.frames.get_mut(c) {
                    *slot = None;
                }
                true
            }
            _ => false,
        }
    }

    /// Drop segments and events already handed to the receiver (unbounded runs only).
    pub fn forget(&mut self, segments_before: usize, events_before: usize) {
        if self.bounded {
            return;
        }
        let seg_drop = (segments_before as isize - self.seg_base as isize).min(self.segments.len() as isize - 1);
        if seg_drop > 0 {
            self.segments.drain(0..seg_drop as usize);
            self.seg_base += seg_drop as usize;
        }
        let open_chunk = (self.k / self.chunk_frames as u64) as usize;
        let open = *self.chunk_events.get(&open_chunk).unwrap_or(&0);
        let ev_drop = events_before.min(open) as isize - self.event_base as isize;
        if ev_drop > 0 {
            self.events.drain(0..ev_drop as usize);
            self.event_base += ev_drop as usize;
        }
    }

    /// The rolling fingerprint up to the last closed chunk.
    pub fn rolling_fingerprint(&self) -> Option<RollingFingerprint> {
        self.closed.last().map(|last| RollingFingerprint { hash: to_hex(&last.rolling), t: last.t, chunks: self.closed.len() })
    }

    /// Stop the run with an error message (cancelled).
    pub fn cancel(&mut self, message: Option<Message>) {
        self.end_with_error(message.unwrap_or_else(|| Message::new("err.cancelled")), StopReason::User);
    }

    /// End the run with an error decided outside the core (e.g. a wall-clock budget), keeping what was computed.
    pub fn end_with_error(&mut self, message: Message, reason: StopReason) {
        if self.finished {
            return;
        }
        self.fail(message, reason);
        self.finish();
    }

    /// Frame at which `advance` pauses (+∞: none).
    pub fn pause_frame(&self) -> f64 {
        self.pause_frame
    }

    /// Set the frame at which `advance` pauses; never changes a result.
    pub fn set_pause_frame(&mut self, frame: f64) {
        self.pause_frame = frame;
    }

    /// End the run here without an error (user stop of an unbounded run).
    pub fn stop(&mut self) {
        if self.finished {
            return;
        }
        self.end(StopReason::User);
        self.finish();
    }

    fn finish(&mut self) {
        if self.finished_once {
            return;
        }
        self.finished_once = true;
        let last = self.segments.len() - 1;
        self.segments[last].t1 = js_min(self.t_end, self.t);
        self.stats.max_position_correction = self.proj_info.position;
        self.stats.max_velocity_correction = self.proj_info.velocity;
        let last_chunk = (self.k / self.chunk_frames as u64) as usize;
        if self.closed.last().is_none_or(|c| c.chunk < last_chunk) && self.frames.get(last_chunk).is_some_and(|c| c.is_some()) {
            // A missing chunk cannot happen here (frames are only released once closed)
            let _ = self.close_chunk(last_chunk);
        }
        if let Some(mut h) = self.state_hasher.take() {
            hash_events(&mut h, self.events.iter().map(|e| (e.t, e.after.as_slice())));
            self.hash = h.digest_hex();
        } else if !self.bounded && self.first_chunk == 0 {
            self.hash = to_hex(&self.rolling);
        }
        if self.stop_reason.is_none() {
            self.stop_reason = Some(StopReason::Duration);
        }
    }

    /// Whether the run ended without an error.
    pub fn completed(&self) -> bool {
        self.error.is_none()
    }

    /// The chunk holding frame k, if it is in memory.
    pub fn chunk_of(&self, k: u64) -> Option<&FrameChunk> {
        let ci = (k / self.chunk_frames as u64) as usize;
        self.frames.get(ci).and_then(|c| c.as_ref()).filter(|c| k >= c.first && ((k - c.first) as usize) < c.count)
    }
}

/// Result of `rebuild_chunk`.
pub struct RebuiltChunk {
    pub chunk: FrameChunk,
    pub events: Vec<SimEvent>,
    /// Checkpoint taken at the end (chunk + 1), when the run got there.
    pub next: Option<Vec<f64>>,
    /// The checkpoint of the chunk as the rebuilt run took it again.
    pub again: Option<Vec<f64>>,
    pub segments: Vec<Segment>,
    pub run_error: Option<Message>,
}

/// Recompute one chunk from its checkpoint through the same code path as the original run.
pub fn rebuild_chunk(system: Rc<System>, checkpoint: &[f64], opts: SimOptions, end_frame: u64) -> SimResult<RebuiltChunk> {
    let mut run = SimulationRun::resume(system, opts, checkpoint)?;
    let c = run.first_chunk;
    run.advance(u64::MAX, end_frame as f64);
    let chunk = run.frames.get_mut(c).and_then(|x| x.take()).ok_or_else(|| Message::new("err.internal").text("message", "rebuild: chunk missing"))?;
    Ok(RebuiltChunk {
        chunk,
        events: std::mem::take(&mut run.events),
        next: run.checkpoints.get_mut(c + 1).and_then(|x| x.take()),
        again: run.checkpoints.get_mut(c).and_then(|x| x.take()),
        segments: std::mem::take(&mut run.segments),
        run_error: run.error.take(),
    })
}

/// Simulate a scene to the end (always bounded: an unbounded scene runs for its legacyDuration).
pub fn simulate(scene: &Scene, mut opts: SimOptions) -> SimResult<SimulationRun> {
    if opts.duration.is_none() || opts.duration == Some(None) {
        opts.duration = Some(Some(scene.settings.finite_duration()));
    }
    let mut run = SimulationRun::new(scene, opts)?;
    run.advance(u64::MAX, f64::INFINITY);
    Ok(run)
}

/// Relative tangential velocities of the sliding units of a mode at state X (26.53, D73).
fn sliding_speeds(sys: &System, x: &[f64], mode: &Mode) -> Vec<f64> {
    let sliding = |u: &&crate::dynamics::UnitMode| !u.points.is_empty() && u.friction == crate::dynamics::Friction::Slide;
    if !mode.units.iter().any(|u| sliding(&u)) {
        return Vec::new();
    }
    let model = &sys.model;
    let poses = compute_poses(model, x);
    mode.units.iter().filter(sliding).map(|u| crate::kinematics::contact_kin(model, &sys.pairs[u.pair].features[u.ref_], &poses).vt).collect()
}
