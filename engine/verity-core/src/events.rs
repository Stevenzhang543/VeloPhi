//! Event functions of a mode (port of `src/core/solver/events.ts`). The TypeScript closures become an enum
//! evaluated against the mode solution; order, hysteresis and re-arming are unchanged.

use crate::dynamics::{solve_mode_into, switch_arg, tol, Friction, Mode, ModeSolution, System};
use crate::js::{js_max, js_min};
use crate::kinematics::{compute_poses, probe_value, rope_path, Pose};
use crate::message::SimResult;

/// Kind of event function.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EventType {
    Contact,
    Liftoff,
    Leave,
    Slip,
    Stop,
    Slack,
    Taut,
    Switch,
    /// A body on a rope end reaches the pulley the rope runs onto (26.51).
    Pulley,
}

/// A rope end closer than this to the pulley it runs onto has reached it (m).
pub const PULLEY_REACH: f64 = 1e-3;

impl EventType {
    /// Name as in the TypeScript engine.
    pub fn name(self) -> &'static str {
        match self {
            EventType::Contact => "contact",
            EventType::Liftoff => "liftoff",
            EventType::Leave => "leave",
            EventType::Slip => "slip",
            EventType::Stop => "stop",
            EventType::Slack => "slack",
            EventType::Taut => "taut",
            EventType::Switch => "switch",
            EventType::Pulley => "pulley",
        }
    }
}

/// What an event function evaluates.
#[derive(Clone, Copy, Debug)]
pub enum EventValue {
    Liftoff {
        unit: usize,
        point: usize,
    },
    LeaveM1 {
        unit: usize,
        point: usize,
    },
    LeaveM2 {
        unit: usize,
        point: usize,
    },
    Slip {
        unit: usize,
        mu_s: f64,
    },
    Stop {
        unit: usize,
        sgn: f64,
    },
    Contact {
        pair: usize,
        probe: usize,
    },
    Slack {
        rope: usize,
    },
    Taut {
        rope: usize,
    },
    Switch {
        k: usize,
        b: i8,
    },
    /// End segment of rope `rope` (end 0: a, 1: b).
    Pulley {
        rope: usize,
        end: u8,
    },
}

/// An event function of the current mode with its hysteresis state.
#[derive(Clone, Debug)]
pub struct EventFn {
    pub ty: EventType,
    /// Rope index of slack/taut functions, −1 otherwise.
    pub rope: i32,
    pub eps: f64,
    pub threshold: f64,
    pub start: f64,
    pub value: EventValue,
}

/// Hysteresis of switch events.
const SWITCH_EPS: f64 = 1e-11;

/// Value of an event function at (poses, solution, state).
#[inline]
pub fn event_value(sys: &System, mode: &Mode, f: &EventFn, poses: &[Pose], s: &ModeSolution, x: &[f64]) -> f64 {
    match f.value {
        EventValue::Liftoff { unit, point } => s.units[unit].point_lambda[point],
        EventValue::LeaveM1 { unit, point } => s.units[unit].point_kin[point].m1,
        EventValue::LeaveM2 { unit, point } => s.units[unit].point_kin[point].m2,
        EventValue::Slip { unit, mu_s } => mu_s * s.units[unit].normal - s.units[unit].tangent.abs(),
        EventValue::Stop { unit, sgn } => sgn * s.units[unit].vt,
        EventValue::Contact { pair, probe } => probe_value(&sys.model, &sys.pairs[pair].probes[probe], poses),
        EventValue::Slack { rope } => s.rope_tension[rope],
        EventValue::Taut { rope } => s.rope_kin[rope].value,
        EventValue::Pulley { rope, end } => {
            let p = rope_path(&sys.model, poses, &sys.model.ropes[rope]);
            (if end == 0 { p.s1 } else { p.s_last }) - PULLEY_REACH
        }
        EventValue::Switch { k, b } => {
            let a = switch_arg(sys, k, x, mode.sw.as_deref());
            if b != 0 {
                b as f64 * a
            } else {
                -a.abs()
            }
        }
    }
}

/// Event functions of a mode at the start of a segment, with thresholds set from their start values.
pub fn build_event_fns(sys: &System, mode: &Mode, poses: &[Pose], sol: &ModeSolution, x: &[f64]) -> Vec<EventFn> {
    let model = &sys.model;
    let eps_f = tol::FORCE * model.force_scale;
    let mut fns: Vec<EventFn> = Vec::new();
    let mut add = |ty: EventType, eps: f64, value: EventValue, rope: i32| {
        fns.push(EventFn { ty, rope, eps, threshold: 0.0, start: 0.0, value });
    };
    let mut closed_probes: Vec<&str> = Vec::new();
    for (ui, u) in mode.units.iter().enumerate() {
        let pair = &sys.pairs[u.pair];
        for (pi, &p) in u.points.iter().enumerate() {
            let key = pair.features[p].probe_key.as_str();
            if !closed_probes.contains(&key) {
                closed_probes.push(key);
            }
            add(EventType::Liftoff, eps_f, EventValue::Liftoff { unit: ui, point: pi }, -1);
            add(EventType::Leave, tol::EXT, EventValue::LeaveM1 { unit: ui, point: pi }, -1);
            add(EventType::Leave, tol::EXT, EventValue::LeaveM2 { unit: ui, point: pi }, -1);
        }
        if !u.points.is_empty() && u.friction == Friction::Stick {
            add(EventType::Slip, eps_f, EventValue::Slip { unit: ui, mu_s: pair.material.mu_s }, -1);
        }
        if !u.points.is_empty() && u.friction == Friction::Slide {
            add(EventType::Stop, 1e-10, EventValue::Stop { unit: ui, sgn: u.s }, -1);
        }
    }
    for pair in &sys.pairs {
        for (pi, probe) in pair.probes.iter().enumerate() {
            if closed_probes.contains(&probe.key.as_str()) {
                continue;
            }
            add(EventType::Contact, tol::EXT, EventValue::Contact { pair: pair.index, probe: pi }, -1);
        }
    }
    for (k, &taut) in mode.taut.iter().enumerate() {
        if taut {
            add(EventType::Slack, eps_f, EventValue::Slack { rope: k }, k as i32);
        } else {
            add(EventType::Taut, tol::EXT, EventValue::Taut { rope: k }, k as i32);
        }
    }
    // A body on a rope end reaching the pulley the rope runs onto
    for (k, r) in model.ropes.iter().enumerate() {
        if r.pulleys.is_empty() {
            continue;
        }
        if r.a.body.is_some_and(|g| model.bodies[g].dynamic) {
            add(EventType::Pulley, tol::EXT, EventValue::Pulley { rope: k, end: 0 }, k as i32);
        }
        if r.b.body.is_some_and(|g| model.bodies[g].dynamic) {
            add(EventType::Pulley, tol::EXT, EventValue::Pulley { rope: k, end: 1 }, k as i32);
        }
    }
    if let Some(sw) = &mode.sw {
        if sw.len() == model.arena.switches.len() {
            for (k, &b) in sw.iter().enumerate() {
                add(EventType::Switch, SWITCH_EPS, EventValue::Switch { k, b }, -1);
            }
        }
    }
    // Probes that start at contact but are already separating need no hysteresis
    let n = sys.n;
    let dt = 1e-7;
    let mut y = x.to_vec();
    for k in 0..3 * n {
        y[k] += dt * x[3 * n + k];
    }
    let ahead = compute_poses(model, &y);
    for f in fns.iter_mut() {
        let g0 = event_value(sys, mode, f, poses, sol, x);
        f.start = g0;
        f.threshold = if g0 > f.eps { 0.0 } else { js_min(g0, 0.0) - f.eps };
        if f.ty == EventType::Contact && f.threshold < 0.0 {
            let rate = (event_value(sys, mode, f, &ahead, sol, x) - g0) / dt;
            if rate > 1e-9 {
                f.threshold = js_min(0.0, g0);
            }
        }
    }
    fns
}

/// Result of event_margin.
#[derive(Clone, Debug, Default)]
pub struct Margin {
    pub margin: f64,
    /// Indices of the functions that fired.
    pub fired: Vec<usize>,
    pub values: Vec<f64>,
}

/// Smallest g − threshold over all functions. `pre` is the mode solution at X when the caller already has it;
/// otherwise it is computed into `scratch`.
pub fn event_margin(sys: &System, fns: &[EventFn], mode: &Mode, x: &[f64], pre: Option<&ModeSolution>, scratch: &mut ModeSolution) -> SimResult<Margin> {
    let mut out = Margin::default();
    event_margin_into(sys, fns, mode, x, pre, scratch, &mut out)?;
    Ok(out)
}

/// `event_margin` into a reusable result.
pub fn event_margin_into(
    sys: &System,
    fns: &[EventFn],
    mode: &Mode,
    x: &[f64],
    pre: Option<&ModeSolution>,
    scratch: &mut ModeSolution,
    out: &mut Margin,
) -> SimResult<()> {
    let sol: &ModeSolution = match pre {
        Some(p) => p,
        None => {
            solve_mode_into(sys, x, mode, None, scratch)?;
            scratch
        }
    };
    let poses = &sol.poses;
    out.margin = f64::INFINITY;
    out.fired.clear();
    out.values.clear();
    for (i, f) in fns.iter().enumerate() {
        let g = event_value(sys, mode, f, poses, sol, x);
        out.values.push(g);
        let d = g - f.threshold;
        if d < out.margin {
            out.margin = d;
        }
        if d < 0.0 {
            out.fired.push(i);
        }
    }
    Ok(())
}

/// Re-arming of functions that started at their boundary.
pub fn rearm(fns: &mut [EventFn], values: &[f64]) {
    for (i, f) in fns.iter_mut().enumerate() {
        if f.threshold >= 0.0 {
            continue;
        }
        if values[i] > 2.0 * f.eps {
            f.threshold = 0.0;
        } else if values[i] > f.start + 1e-3 * f.eps {
            f.threshold = js_max(f.threshold, js_min(0.0, f.start));
        }
    }
}

/// Result of locate_event.
pub struct Located {
    pub h: f64,
    pub x: Vec<f64>,
    pub fired: Vec<usize>,
    pub iterations: usize,
}

/// Locate the first event in a step of size h from X0 (Illinois iteration on the step size). `step(0)` must
/// return X0; `step_h` is the state of the full step (already computed by the caller, bit-identical to step(h)).
// Same parameters as locateEvent in events.ts, plus the caller's scratch solution
#[allow(clippy::too_many_arguments)]
pub fn locate_event(
    sys: &System,
    fns: &[EventFn],
    mode: &Mode,
    step: &mut dyn FnMut(f64) -> SimResult<Vec<f64>>,
    x0: &[f64],
    h: f64,
    margin_at_h: f64,
    scratch: &mut ModeSolution,
) -> SimResult<Located> {
    let mut lo = 0.0;
    let mut hi = h;
    let mut fhi = margin_at_h;
    let mut x_hi = step(h)?;
    let mut fired_hi = event_margin(sys, fns, mode, &x_hi, None, scratch)?.fired;
    let mut side = 0i32;
    let mut it = 0usize;
    let mut flo = 1.0;
    {
        let m0 = event_margin(sys, fns, mode, x0, None, scratch)?.margin;
        if m0.is_finite() {
            flo = m0;
        }
    }
    while hi - lo > tol::TIME && it < 200 {
        it += 1;
        let mut mid = if flo.is_finite() && fhi.is_finite() && flo != fhi { lo + (hi - lo) * flo / (flo - fhi) } else { 0.5 * (lo + hi) };
        if !(mid > lo && mid < hi) {
            mid = 0.5 * (lo + hi);
        }
        if it.is_multiple_of(8) {
            mid = 0.5 * (lo + hi);
        }
        let xm = step(mid)?;
        let r = event_margin(sys, fns, mode, &xm, None, scratch)?;
        if r.margin < 0.0 {
            hi = mid;
            fhi = r.margin;
            x_hi = xm;
            fired_hi = r.fired;
            if side == -1 {
                flo /= 2.0;
            }
            side = -1;
        } else {
            lo = mid;
            flo = r.margin;
            if side == 1 {
                fhi /= 2.0;
            }
            side = 1;
        }
    }
    Ok(Located { h: hi, x: x_hi, fired: fired_hi, iterations: it })
}
