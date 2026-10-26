//! Mode determination (port of `src/core/solver/modes.ts`). Features are referred to by their index in the
//! pair's feature list; the TypeScript identity comparisons of touches and features become index comparisons.

use crate::dynamics::{roll_radius, row_dot, solve_mode_into, switch_branches, tol, Friction, Mode, ModeSolution, PairInfo, System, UnitMode};
use crate::kinematics::{compute_poses, contact_kin, drive_kin, rope_kin, slider_axis_kin, ContactKin, Pose};
use crate::message::SimResult;
use crate::model::ShapeModel;

/// A touching feature with its kinematics.
#[derive(Clone, Debug)]
pub struct Touch {
    pub pair: usize,
    pub feature: usize,
    pub kin: ContactKin,
}

/// Whether a contact lies within its feature's region, up to TOL.ext.
#[inline]
pub fn in_region(k: &ContactKin) -> bool {
    k.m1 >= -tol::EXT && k.m2 >= -tol::EXT
}

/// Broad phase: can the two bodies of a pair be within `margin` of each other?
#[inline]
pub fn pair_may_touch(sys: &System, pair: &PairInfo, poses: &[Pose], margin: f64) -> bool {
    let a = &poses[pair.x];
    let b = &poses[pair.y];
    let dx = a.x - b.x;
    let dy = a.y - b.y;
    let r = sys.model.bodies[pair.x].bound + sys.model.bodies[pair.y].bound + margin;
    dx * dx + dy * dy <= r * r
}

/// Touching features (gap ≈ 0 within the feature's region), deduplicated by contact point.
pub fn touching_features(sys: &System, poses: &[Pose]) -> Vec<Touch> {
    let mut out: Vec<Touch> = Vec::new();
    for pair in &sys.pairs {
        if !pair_may_touch(sys, pair, poses, 1e-6) {
            continue;
        }
        let start = out.len();
        for (fi, f) in pair.features.iter().enumerate() {
            let k = contact_kin(&sys.model, f, poses);
            if !in_region(&k) || k.gap > tol::TOUCH || k.gap < -tol::DEEP {
                continue;
            }
            if out[start..].iter().any(|t| (t.kin.cx - k.cx).abs() <= 1e-9 && (t.kin.cy - k.cy).abs() <= 1e-9) {
                continue;
            }
            out.push(Touch { pair: pair.index, feature: fi, kin: k });
        }
    }
    out
}

/// Touches of a pair split into contact units (26.52, D35; see modes.ts contactClusters).
fn contact_clusters<'a>(sys: &System, pair: &PairInfo, list: &[&'a Touch]) -> Vec<Vec<&'a Touch>> {
    let complex = |g: usize| matches!(sys.model.bodies[g].shape, ShapeModel::Complex(_));
    if !complex(pair.x) && !complex(pair.y) {
        return vec![list.to_vec()];
    }
    let mut out: Vec<(f64, f64, Vec<&Touch>)> = Vec::new();
    for &t in list {
        let sg = if pair.features[t.feature].a.body == pair.x { 1.0 } else { -1.0 };
        let nx = sg * t.kin.nx;
        let ny = sg * t.kin.ny;
        match out.iter_mut().find(|o| (o.0 * ny - o.1 * nx).abs() <= 1e-6 && o.0 * nx + o.1 * ny > 0.0) {
            Some(c) => c.2.push(t),
            None => out.push((nx, ny, vec![t])),
        }
    }
    out.into_iter().map(|o| o.2).collect()
}

/// The reference of a unit: a face on a static body is preferred (index into `list`).
fn pick_reference(sys: &System, list: &[&Touch]) -> usize {
    let pair = &sys.pairs[list[0].pair];
    for (i, t) in list.iter().enumerate() {
        if !sys.model.bodies[pair.features[t.feature].b_body()].dynamic {
            return i;
        }
    }
    for (i, t) in list.iter().enumerate() {
        let f = &pair.features[t.feature];
        if sys.model.bodies[f.a.body].dynamic && f.is_pf() {
            return i;
        }
    }
    0
}

/// Keep at most two points per unit: the extremes along the tangent. `list` starts with the reference.
fn reduce_points<'a>(list: &[&'a Touch], r: &Touch) -> Vec<&'a Touch> {
    if list.len() <= 2 {
        return list.to_vec();
    }
    let proj = |t: &Touch| r.kin.tx * t.kin.cx + r.kin.ty * t.kin.cy;
    let mut lo = 0usize;
    let mut hi = 0usize;
    for (i, t) in list.iter().enumerate() {
        if proj(t) < proj(list[lo]) {
            lo = i;
        }
        if proj(t) > proj(list[hi]) {
            hi = i;
        }
    }
    if lo == hi {
        vec![list[lo]]
    } else {
        vec![list[lo], list[hi]]
    }
}

/// Reference and points (at most two, the reference among them) of the touches of one pair.
fn unit_points<'a>(sys: &System, list: &[&'a Touch]) -> (&'a Touch, Vec<&'a Touch>) {
    let ri = pick_reference(sys, list);
    let r = list[ri];
    let mut ordered: Vec<&Touch> = Vec::with_capacity(list.len());
    ordered.push(r);
    for (i, t) in list.iter().enumerate() {
        if i != ri {
            ordered.push(t);
        }
    }
    let mut points = reduce_points(&ordered, r);
    if !points.iter().any(|t| std::ptr::eq(*t, r)) {
        points.insert(0, r);
    }
    points.truncate(2);
    (r, points)
}

/// `wr`: relative rolling ω_A − ω_B, NaN when the unit has no rolling resistance (26.52).
struct UnitCandidate<'a> {
    pair: usize,
    r: &'a Touch,
    points: Vec<&'a Touch>,
    vt: f64,
    wr: f64,
}

#[derive(Clone, Copy)]
struct UnitOption {
    closed: &'static [usize],
    friction: Friction,
    s: f64,
    roll: Option<i8>,
}

/// Relative rolling of a unit with rolling resistance, NaN without (26.52).
fn unit_rolling(sys: &System, pair: &PairInfo, r: &Touch, poses: &[Pose]) -> f64 {
    let f = &pair.features[r.feature];
    #[allow(clippy::neg_cmp_op_on_partial_ord)]
    if !(pair.material.rolling > 0.0) || !(roll_radius(&sys.model, f) > 0.0) {
        return f64::NAN;
    }
    poses[f.a.body].w - poses[f.b_body()].w
}

/// Which entities started at rest at their boundary (26.52 adds rolling, motors and end stops).
pub struct FromRest {
    pub slide: Vec<bool>,
    pub slack: Vec<bool>,
    pub roll: Option<Vec<bool>>,
    pub slip: Option<Vec<bool>>,
    pub limit: Option<Vec<i8>>,
}

fn unit_options(sys: &System, u: &UnitCandidate) -> Vec<UnitOption> {
    let subsets: &[&'static [usize]] = if u.points.len() == 1 { &[&[0]] } else { &[&[0, 1], &[0], &[1]] };
    let mat = sys.pairs[u.pair].material;
    let mut frictions: Vec<(Friction, f64)> = Vec::new();
    if mat.mu_s <= 0.0 && mat.mu_k <= 0.0 {
        frictions.push((Friction::None, 0.0));
    } else if u.vt.abs() > tol::VEL {
        frictions.push((Friction::Slide, if u.vt > 0.0 { 1.0 } else { -1.0 }));
    } else {
        frictions.push((Friction::Stick, 0.0));
        frictions.push((Friction::Slide, 1.0));
        frictions.push((Friction::Slide, -1.0));
    }
    // 26.52: rolling rest before rolling either way, or the rolling direction
    let rolls: Option<Vec<i8>> = if u.wr.is_nan() {
        None
    } else if u.wr.abs() > tol::VEL {
        Some(vec![if u.wr > 0.0 { 1 } else { -1 }])
    } else {
        Some(vec![0, 1, -1])
    };
    let mut out = Vec::new();
    for sub in subsets {
        for &(friction, s) in &frictions {
            match &rolls {
                Some(list) => {
                    for &r in list {
                        out.push(UnitOption { closed: sub, friction, s, roll: Some(r) });
                    }
                }
                None => out.push(UnitOption { closed: sub, friction, s, roll: None }),
            }
        }
    }
    out.push(UnitOption { closed: &[], friction: Friction::None, s: 0.0, roll: None });
    out
}

/// Result of determine_mode.
#[derive(Clone, Debug)]
pub struct ModeChoice {
    pub mode: Mode,
    pub solution: ModeSolution,
    pub violation: f64,
    pub tried: usize,
    pub ambiguous: bool,
}

fn row_acc(k: &ContactKin, sol: &ModeSolution) -> f64 {
    let mut s = k.cn;
    let j = &k.jn;
    if j.ai >= 0 {
        let a = 3 * j.ai as usize;
        s += j.ax * sol.acc[a] + j.ay * sol.acc[a + 1] + j.aw * sol.acc[a + 2];
    }
    if j.bi >= 0 {
        let b = 3 * j.bi as usize;
        s += j.bx * sol.acc[b] + j.by * sol.acc[b + 1] + j.bw * sol.acc[b + 2];
    }
    s
}

/// Sum of normalized violations of the complementarity conditions (0: valid).
pub fn mode_violation(sys: &System, mode: &Mode, sol: &ModeSolution, rest: &FromRest) -> f64 {
    let slide_from_rest = &rest.slide;
    let slack_candidates = &rest.slack;
    let eps_f = tol::FORCE * sys.model.force_scale;
    let eps_a = tol::ACC * sys.model.accel_scale;
    let f = sys.model.force_scale;
    let acc = sys.model.accel_scale;
    let mut v = 0.0;
    if !sol.consistent {
        v += 1.0 + sol.residual;
    }
    for (ui, u) in mode.units.iter().enumerate() {
        let st = &sol.units[ui];
        for &l in &st.point_lambda {
            if l < -eps_f {
                v += -l / f;
            }
        }
        for k in &st.open_kin {
            let ga = row_acc(k, sol);
            if ga < -eps_a {
                v += -ga / acc;
            }
        }
        if !u.points.is_empty() {
            if u.friction == Friction::Stick {
                let margin = sys.pairs[u.pair].material.mu_s * st.normal - st.tangent.abs();
                if margin < -eps_f {
                    v += -margin / f;
                }
            } else if u.friction == Friction::Slide && slide_from_rest[ui] {
                let sa = u.s * st.at;
                if sa < -eps_a {
                    v += -sa / acc;
                }
            }
            // 26.52: rolling resistance
            if u.roll == Some(0) {
                let pair = &sys.pairs[u.pair];
                let margin = pair.material.rolling * roll_radius(&sys.model, &pair.features[u.ref_]) * st.normal - st.roll.abs();
                if margin < -eps_f {
                    v += -margin / f;
                }
            } else if let Some(r) = u.roll {
                if rest.roll.as_ref().is_some_and(|rr| rr[ui]) {
                    let ra = f64::from(r) * st.wra;
                    if ra < -eps_a {
                        v += -ra / acc;
                    }
                }
            }
        }
    }
    for (k, &taut) in mode.taut.iter().enumerate() {
        if taut {
            let t = sol.rope_tension[k];
            if t < -eps_f {
                v += -t / f;
            }
        } else if slack_candidates[k] {
            let a = sol.rope_kin[k].acc;
            if a < -eps_a {
                v += -a / acc;
            }
        }
    }
    // 26.52: end stops of sliders
    if let Some(lim) = &mode.limit {
        let model = &sys.model;
        for (k, &side) in lim.iter().enumerate() {
            if side != 0 {
                let l = sol.limit_force[k];
                if l < -eps_f {
                    v += -l / f;
                }
                continue;
            }
            let cand = rest.limit.as_ref().map_or(0, |c| c[k]);
            if cand == 0 {
                continue;
            }
            let kin = slider_axis_kin(model, &sol.poses, &model.sliders[k]);
            let a = f64::from(cand) * -(row_dot(&kin.j, &sol.acc, 0) + kin.c);
            if a < -eps_a {
                v += -a / acc;
            }
        }
    }
    // 26.52: torque-limited motors
    if let Some(slip) = &mode.slip {
        let model = &sys.model;
        for (k, &d) in slip.iter().enumerate() {
            let mo = &model.motors[k];
            if !mo.limited {
                continue;
            }
            if d == 0 {
                let margin = mo.max_torque - sol.drive_torque[k].abs();
                if margin < -eps_f {
                    v += -margin / f;
                }
            } else if rest.slip.as_ref().is_some_and(|s| s[k]) {
                let a = f64::from(d) * sol.drive_acc[k];
                if a < -eps_a {
                    v += -a / acc;
                }
            }
        }
    }
    v
}

/// Touches grouped by pair, in the order of `sys.pairs`.
fn group_by_pair<'a>(sys: &System, touches: &'a [Touch]) -> Vec<Vec<&'a Touch>> {
    let mut by_pair: Vec<Vec<&Touch>> = vec![Vec::new(); sys.pairs.len()];
    for t in touches {
        by_pair[t.pair].push(t);
    }
    by_pair
}

/// Determine the mode at state X; `prefer_slack` lists ropes whose slack event located X, `prefer_unlimit`
/// sliders whose end-stop release event did (26.52).
pub fn determine_mode(sys: &System, x: &[f64], max_tries: usize, prefer_slack: &[usize], prefer_unlimit: &[usize]) -> SimResult<ModeChoice> {
    let model = &sys.model;
    let poses = compute_poses(model, x);
    let touches: Vec<Touch> = touching_features(sys, &poses).into_iter().filter(|t| t.kin.vn <= tol::VEL).collect();
    let by_pair = group_by_pair(sys, &touches);
    let mut candidates: Vec<UnitCandidate> = Vec::new();
    for pair in &sys.pairs {
        let all = &by_pair[pair.index];
        if all.is_empty() {
            continue;
        }
        for list in contact_clusters(sys, pair, all) {
            let (r, points) = unit_points(sys, &list);
            candidates.push(UnitCandidate { pair: pair.index, r, points, vt: r.kin.vt, wr: unit_rolling(sys, pair, r, &poses) });
        }
    }
    let mut rope_candidate = Vec::with_capacity(model.ropes.len());
    for r in &model.ropes {
        let (k, _) = rope_kin(model, &poses, r);
        rope_candidate.push(k.value <= tol::TOUCH && k.vel.abs() <= tol::VEL);
    }
    let options: Vec<Vec<UnitOption>> = candidates.iter().map(|c| unit_options(sys, c)).collect();
    let rope_options: Vec<Vec<bool>> = rope_candidate
        .iter()
        .enumerate()
        .map(|(k, &c)| {
            if c {
                if prefer_slack.contains(&k) {
                    vec![false, true]
                } else {
                    vec![true, false]
                }
            } else {
                vec![false]
            }
        })
        .collect();
    // 26.52 (D58): a slider at rest at an end stop may stay there or leave it (open first after its release event fired)
    let limit_cand: Vec<i8> = if model.has_limits {
        model
            .sliders
            .iter()
            .map(|sl| {
                if !sl.limited {
                    return 0;
                }
                let kin = slider_axis_kin(model, &poses, sl);
                if kin.vel.abs() > tol::VEL {
                    0
                } else if kin.value - sl.lo <= tol::TOUCH {
                    -1
                } else if sl.hi - kin.value <= tol::TOUCH {
                    1
                } else {
                    0
                }
            })
            .collect()
    } else {
        Vec::new()
    };
    let limit_options: Vec<Vec<i8>> = limit_cand
        .iter()
        .enumerate()
        .map(|(k, &side)| {
            if side == 0 {
                vec![0]
            } else if prefer_unlimit.contains(&k) {
                vec![0, side]
            } else {
                vec![side, 0]
            }
        })
        .collect();
    // A torque-limited motor at its speed may stay locked or slip either way; otherwise it slips against e
    let slip_e: Vec<f64> = if model.has_slip {
        model.motors.iter().map(|mo| if mo.limited { drive_kin(model, &poses, mo.a.body, mo.b.body, mo.speed).vel } else { 0.0 }).collect()
    } else {
        Vec::new()
    };
    let slip_options: Vec<Vec<i8>> = if model.has_slip {
        model
            .motors
            .iter()
            .enumerate()
            .map(|(k, mo)| {
                if !mo.limited {
                    vec![0]
                } else if slip_e[k].abs() > tol::VEL {
                    vec![if slip_e[k] > 0.0 { 1 } else { -1 }]
                } else {
                    vec![0, 1, -1]
                }
            })
            .collect()
    } else {
        Vec::new()
    };
    let radices: Vec<usize> = options
        .iter()
        .map(|o| o.len())
        .chain(rope_options.iter().map(|o| o.len()))
        .chain(limit_options.iter().map(|o| o.len()))
        .chain(slip_options.iter().map(|o| o.len()))
        .collect();
    let mut digits = vec![0usize; radices.len()];
    let slide_from_rest: Vec<bool> = candidates.iter().map(|c| c.vt.abs() <= tol::VEL).collect();
    let rest = FromRest {
        slide: slide_from_rest,
        slack: rope_candidate.clone(),
        roll: if candidates.iter().any(|c| !c.wr.is_nan()) { Some(candidates.iter().map(|c| c.wr.abs() <= tol::VEL).collect()) } else { None },
        slip: if model.has_slip { Some(model.motors.iter().enumerate().map(|(k, mo)| mo.limited && slip_e[k].abs() <= tol::VEL).collect()) } else { None },
        limit: if model.has_limits { Some(limit_cand.clone()) } else { None },
    };
    let (nu, nr, nl) = (candidates.len(), rope_options.len(), limit_options.len());
    let sw = if !model.arena.switches.is_empty() { Some(switch_branches(sys, x)) } else { None };
    let mut best: Option<ModeChoice> = None;
    let mut tried = 0usize;
    let mut sol = ModeSolution::default();
    loop {
        let mut units = Vec::with_capacity(candidates.len());
        for (ui, c) in candidates.iter().enumerate() {
            let opt = options[ui][digits[ui]];
            let closed: Vec<usize> = opt.closed.iter().map(|&i| c.points[i].feature).collect();
            let open: Vec<usize> = c.points.iter().enumerate().filter(|(i, _)| !opt.closed.contains(i)).map(|(_, t)| t.feature).collect();
            if closed.is_empty() {
                units.push(UnitMode { pair: c.pair, ref_: c.r.feature, points: Vec::new(), open, friction: Friction::None, s: 0.0, roll: None });
            } else {
                units.push(UnitMode { pair: c.pair, ref_: c.r.feature, points: closed, open, friction: opt.friction, s: opt.s, roll: opt.roll });
            }
        }
        let taut: Vec<bool> = rope_options.iter().enumerate().map(|(k, o)| o[digits[nu + k]]).collect();
        let limit = if model.has_limits { Some(limit_options.iter().enumerate().map(|(k, o)| o[digits[nu + nr + k]]).collect()) } else { None };
        let slip = if model.has_slip { Some(slip_options.iter().enumerate().map(|(k, o)| o[digits[nu + nr + nl + k]]).collect()) } else { None };
        let mode = Mode { units, taut, sw: sw.clone(), limit, slip };
        solve_mode_into(sys, x, &mode, Some(&poses), &mut sol)?;
        let violation = mode_violation(sys, &mode, &sol, &rest);
        tried += 1;
        let better = match &best {
            None => true,
            Some(b) => violation < b.violation,
        };
        let done = violation == 0.0;
        if better {
            best = Some(ModeChoice { mode, solution: std::mem::take(&mut sol), violation, tried, ambiguous: false });
        }
        if done {
            break;
        }
        let mut k = radices.len() as isize - 1;
        while k >= 0 {
            let ku = k as usize;
            digits[ku] += 1;
            if digits[ku] < radices[ku] {
                break;
            }
            digits[ku] = 0;
            k -= 1;
        }
        if k < 0 || tried >= max_tries {
            break;
        }
    }
    let mut chosen = best.expect("at least one mode is tried");
    chosen.tried = tried;
    chosen.ambiguous = chosen.violation > 0.0;
    Ok(chosen)
}

/// The mode a state is in, without enumeration (Moreau–Jean readouts).
pub fn state_mode(sys: &System, x: &[f64], stick_speed: f64) -> Mode {
    let model = &sys.model;
    let poses = compute_poses(model, x);
    let touches = touching_features(sys, &poses);
    let by_pair = group_by_pair(sys, &touches);
    let mut units = Vec::new();
    for pair in &sys.pairs {
        let all = &by_pair[pair.index];
        if all.is_empty() {
            continue;
        }
        for list in contact_clusters(sys, pair, all) {
            let (r, points) = unit_points(sys, &list);
            let vt = r.kin.vt;
            let mat = pair.material;
            let friction = if mat.mu_s <= 0.0 && mat.mu_k <= 0.0 {
                Friction::None
            } else if vt.abs() <= stick_speed {
                Friction::Stick
            } else {
                Friction::Slide
            };
            let s = if friction == Friction::Slide {
                if vt > 0.0 {
                    1.0
                } else {
                    -1.0
                }
            } else {
                0.0
            };
            let wr = unit_rolling(sys, pair, r, &poses);
            let roll = if wr.is_nan() {
                None
            } else if wr.abs() <= stick_speed {
                Some(0)
            } else if wr > 0.0 {
                Some(1)
            } else {
                Some(-1)
            };
            units.push(UnitMode { pair: pair.index, ref_: r.feature, points: points.iter().map(|t| t.feature).collect(), open: Vec::new(), friction, s, roll });
        }
    }
    let taut = model.ropes.iter().map(|r| rope_kin(model, &poses, r).0.value <= tol::TOUCH).collect();
    let sw = if !model.arena.switches.is_empty() { Some(switch_branches(sys, x)) } else { None };
    let limit = if model.has_limits {
        Some(
            model
                .sliders
                .iter()
                .map(|sl| {
                    if !sl.limited {
                        return 0;
                    }
                    let v = slider_axis_kin(model, &poses, sl).value;
                    if v - sl.lo <= tol::TOUCH {
                        -1
                    } else if sl.hi - v <= tol::TOUCH {
                        1
                    } else {
                        0
                    }
                })
                .collect(),
        )
    } else {
        None
    };
    let slip = if model.has_slip {
        Some(
            model
                .motors
                .iter()
                .map(|mo| {
                    if !mo.limited {
                        return 0;
                    }
                    let e = drive_kin(model, &poses, mo.a.body, mo.b.body, mo.speed).vel;
                    if e.abs() <= stick_speed {
                        0
                    } else if e > 0.0 {
                        1
                    } else {
                        -1
                    }
                })
                .collect(),
        )
    } else {
        None
    };
    Mode { units, taut, sw, limit, slip }
}

/// Friction status text of a unit ('none', 'stick', 'slide+', 'slide-').
pub fn unit_status(u: &UnitMode) -> &'static str {
    match u.friction {
        Friction::Slide => {
            if u.s > 0.0 {
                "slide+"
            } else {
                "slide-"
            }
        }
        Friction::Stick => "stick",
        Friction::None => "none",
    }
}

/// Compact text form of a mode, used as the segment label.
pub fn describe_mode(sys: &System, mode: &Mode) -> String {
    let mut parts: Vec<String> = Vec::new();
    for u in &mode.units {
        if u.points.is_empty() {
            continue;
        }
        let roll = match u.roll {
            None => "",
            Some(0) => "/rest",
            Some(r) if r > 0 => "/roll+",
            Some(_) => "/roll-",
        };
        parts.push(format!("{}:{}{}{}", sys.pairs[u.pair].key, u.points.len(), unit_status(u), roll));
    }
    for (k, t) in mode.taut.iter().enumerate() {
        parts.push(format!("rope{}:{}", k, if *t { "taut" } else { "slack" }));
    }
    if let Some(sw) = &mode.sw {
        if !sw.is_empty() {
            let s: String = sw
                .iter()
                .map(|&b| {
                    if b > 0 {
                        '+'
                    } else if b < 0 {
                        '-'
                    } else {
                        '0'
                    }
                })
                .collect();
            parts.push(format!("sw:{s}"));
        }
    }
    let signs = |v: &[i8]| -> String {
        v.iter()
            .map(|&b| {
                if b > 0 {
                    '+'
                } else if b < 0 {
                    '-'
                } else {
                    '0'
                }
            })
            .collect()
    };
    if let Some(l) = &mode.limit {
        if !l.is_empty() {
            parts.push(format!("lim:{}", signs(l)));
        }
    }
    if let Some(m) = &mode.slip {
        if !m.is_empty() {
            parts.push(format!("mot:{}", signs(m)));
        }
    }
    parts.join(" ")
}
