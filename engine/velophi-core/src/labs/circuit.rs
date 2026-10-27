//! Direct-current circuits in the steady state (26.54, D80): modified nodal analysis.
//!
//! - Zero-resistance parts (wires, closed switches, ideal ammeters, 0 Ω resistors) merge their end nodes into one
//!   super-node; their currents are found afterwards from Kirchhoff's current law inside the super-node (with loops
//!   of wires, the split of least ∑I², i.e. equal small resistances).
//! - Unknowns: the potential of every super-node and the current of every ideal battery (r = 0). A battery with
//!   internal resistance is a Norton source; capacitors, ideal voltmeters and open switches carry no current.
//! - One equation per conducting component fixes its potential: V = 0 at the reference (the negative terminal of
//!   the first battery). A component that touches others only through capacitors keeps its net charge zero
//!   (two capacitors in series); one that touches nothing is "floating" and voltages across the gap are undefined.
//! - The system is solved with complete pivoting (`linalg::solve_dense_into`); an inconsistent system means ideal
//!   sources that contradict each other, a shorted ideal battery is reported before solving. In both cases there are
//!   no numbers, only the explanation.

use std::collections::HashMap;

use crate::linalg::{solve_dense, solve_dense_into, LinWork};

/// Kind of a circuit element with its parameters (SI units).
#[derive(Clone, Debug, PartialEq)]
pub enum Kind {
    Wire,
    Switch { closed: bool },
    Resistor { r: f64 },
    /// Small lamp with rated voltage and power; resistance U²/P.
    Lamp { u_rated: f64, p_rated: f64 },
    /// Rheostat of total resistance r_total with the slider at `pos` (0 … 1 from terminal a). With a slider terminal
    /// the parts a–c and c–b are pos·R and (1 − pos)·R; without one the element is pos·R between a and b.
    Rheostat { r_total: f64, pos: f64 },
    /// Battery: terminal a is +, b is −.
    Battery { emf: f64, r: f64 },
    Ammeter { r: f64 },
    /// Voltmeter with internal resistance (None: ideal).
    Voltmeter { r: Option<f64> },
    Capacitor { c: f64 },
    // ---- 26.55 (D89) ----
    /// Inductor with winding resistance r; a wire through r in the steady state.
    Inductor { l: f64, r: f64 },
    /// Alternating source u = amp·sin(2π·freq·t + phase) with internal resistance r (terminal a is + when u > 0).
    AcSource { amp: f64, freq: f64, phase: f64, r: f64 },
    /// Diode (piecewise linear): conducts a → b with forward voltage vf and on-resistance ron, else open.
    Diode { vf: f64, ron: f64 },
    /// DC motor: U = I·ra + k·ω, J·ω̇ = k·I − b·ω − load (load opposes the rotation, holds the rotor at rest
    /// while |k·I| ≤ load). `drive`: a generator turned at the given ω (rad/s). Stalled (ω = 0) in the steady state.
    Motor { ra: f64, k: f64, j: f64, b: f64, load: f64, drive: Option<f64> },
    /// Transformer: primary a–b with n1 turns, secondary c–d with n2; magnetizing inductance lm across the ideal
    /// primary and winding resistances r1, r2. In the steady state (DC) the primary is r1 and the secondary is dead.
    Transformer { n1: f64, n2: f64, lm: f64, r1: f64, r2: f64 },
    /// Fuse rated at `rating` A (rms): melts when the integral of I² − rating² (kept ≥ 0) exceeds rating²·FUSE_TIME (DC:
    /// when |I| > rating).
    Fuse { rating: f64 },
    /// Residual-current device: live a → b and neutral c → d (a, c on the supply side); trips (opens both) when
    /// the live and neutral currents differ by more than `trip` (rms).
    Rcd { trip: f64 },
    /// NTC thermistor: R = r25·exp(beta·(1/T − 1/298.15 K)) at `temp` °C.
    Thermistor { r25: f64, beta: f64, temp: f64 },
    /// Light-dependent resistor: R = r10·(lux/10)^(−gamma).
    Ldr { r10: f64, gamma: f64, lux: f64 },
    /// Force-sensing resistor: R = r0 / (1 + force/f0).
    Fsr { r0: f64, f0: f64, force: f64 },
    /// Galvanometer with internal resistance rg and full-scale current ig (deflection I/ig in `extra`).
    Galvanometer { rg: f64, ig: f64 },
    /// Oscilloscope probe (an ideal voltmeter on a channel).
    Probe { channel: u8 },
}

/// Melting time scale of a fuse (s): at twice the rating it melts after FUSE_TIME/3.
pub const FUSE_TIME: f64 = 0.1;

/// An element between nodes a and b (and the slider terminal c of a rheostat; c, d of a transformer or an RCD).
#[derive(Clone, Debug)]
pub struct Element {
    pub id: String,
    pub kind: Kind,
    pub a: String,
    pub b: String,
    pub c: Option<String>,
    pub d: Option<String>,
}

impl Kind {
    /// Resistance of a sensor or galvanometer at its current setting (Ω).
    pub fn sensor_resistance(&self) -> Option<f64> {
        match *self {
            Kind::Thermistor { r25, beta, temp } => Some(r25 * crate::dmath::exp(beta * (1.0 / (temp + 273.15) - 1.0 / 298.15))),
            Kind::Ldr { r10, gamma, lux } => Some(r10 * crate::dmath::pow(lux.max(1e-6) / 10.0, -gamma)),
            Kind::Fsr { r0, f0, force } => Some(r0 / (1.0 + force.max(0.0) / f0.max(1e-12))),
            Kind::Galvanometer { rg, .. } => Some(rg),
            _ => None,
        }
    }
    /// Four-terminal elements (c and d are terminals, not a slider).
    pub fn four_terminal(&self) -> bool {
        matches!(self, Kind::Transformer { .. } | Kind::Rcd { .. })
    }
}

/// A problem that prevents a solution (fatal) or that the user should know about.
#[derive(Clone, Debug, PartialEq)]
pub struct Issue {
    pub kind: &'static str,
    pub elements: Vec<String>,
    pub fatal: bool,
}

/// Values of one element (U = V(a) − V(b), I from a to b through the element, P = U·I absorbed).
#[derive(Clone, Debug, Default)]
pub struct ElementResult {
    pub u: Option<f64>,
    pub i: f64,
    pub p: Option<f64>,
    /// Rheostat with a slider: currents of the parts a–c and c–b.
    pub i_parts: Option<(f64, f64)>,
    /// Lamp: P / P_rated; capacitor: charge Q = C·U.
    pub extra: Option<f64>,
}

/// Solution of a circuit.
#[derive(Clone, Debug, Default)]
pub struct Solution {
    pub ok: bool,
    pub issues: Vec<Issue>,
    /// Potential of every node (None when undefined: a floating part, or no solution).
    pub nodes: Vec<(String, Option<f64>)>,
    pub elements: Vec<(String, ElementResult)>,
    /// Series and parallel groups of resistive elements.
    pub relations: Vec<(&'static str, Vec<String>)>,
}

#[derive(Clone, Copy, Debug)]
enum Branch {
    Short,
    Open,
    /// Conductance g with a Norton source: I(a→b) = g·(Va − Vb) − g·emf.
    Conductance { g: f64, emf: f64 },
    /// Ideal source: Va − Vb = emf; its current is an unknown.
    Ideal { emf: f64 },
}

struct Part {
    elem: usize,
    a: usize,
    b: usize,
    branch: Branch,
    /// Capacitance of an open capacitor branch (charge neutrality of floating parts).
    cap: f64,
}

struct Dsu(Vec<usize>);
impl Dsu {
    fn find(&mut self, x: usize) -> usize {
        let mut r = x;
        while self.0[r] != r {
            r = self.0[r];
        }
        let mut y = x;
        while self.0[y] != r {
            let nx = self.0[y];
            self.0[y] = r;
            y = nx;
        }
        r
    }
    fn union(&mut self, a: usize, b: usize) {
        let (ra, rb) = (self.find(a), self.find(b));
        if ra != rb {
            // the smaller index stays the root (stable reference choice)
            if ra < rb {
                self.0[rb] = ra;
            } else {
                self.0[ra] = rb;
            }
        }
    }
}

fn resistive(r: f64) -> Branch {
    if r <= 0.0 {
        Branch::Short
    } else {
        Branch::Conductance { g: 1.0 / r, emf: 0.0 }
    }
}

/// Lamp resistance from its rating.
pub fn lamp_resistance(u_rated: f64, p_rated: f64) -> f64 {
    if p_rated > 0.0 {
        u_rated * u_rated / p_rated
    } else {
        0.0
    }
}

/// States of the switching elements in a steady-state solve (26.55): diode on, fuse blown, RCD tripped.
#[derive(Clone, Debug, Default)]
struct Switching {
    on: Vec<bool>,
}

/// Solve a circuit in the steady state. Diodes, fuses and RCDs switch until the solution is consistent with their
/// states (26.55, D89): a diode conducts when its forward current is positive and blocks when its voltage is below
/// vf; a fuse whose current exceeds its rating melts; an RCD whose live and neutral currents differ by more than
/// its trip current opens.
pub fn solve(elements: &[Element]) -> Solution {
    let mut st = Switching { on: elements.iter().map(|e| !matches!(e.kind, Kind::Diode { .. })).collect() };
    let mut seen: Vec<Vec<bool>> = Vec::new();
    let mut melted: Vec<String> = Vec::new();
    let mut tripped: Vec<String> = Vec::new();
    for _ in 0..64 {
        let s = solve_states(elements, &st);
        if !s.ok {
            return s;
        }
        let mut next = st.on.clone();
        for (ei, e) in elements.iter().enumerate() {
            let r = &s.elements[ei].1;
            match e.kind {
                Kind::Diode { vf, .. } => {
                    if st.on[ei] && r.i < -1e-12 {
                        next[ei] = false;
                    } else if !st.on[ei] && r.u.is_some_and(|u| u > vf + 1e-12) {
                        next[ei] = true;
                    }
                }
                Kind::Fuse { rating } if st.on[ei] && r.i.abs() > rating => {
                    next[ei] = false;
                    melted.push(e.id.clone());
                }
                Kind::Rcd { trip } if st.on[ei] => {
                    if let Some((il, inn)) = r.i_parts {
                        if (il + inn).abs() > trip {
                            next[ei] = false;
                            tripped.push(e.id.clone());
                        }
                    }
                }
                _ => {}
            }
        }
        if next == st.on || seen.contains(&next) {
            let mut s = s;
            if !melted.is_empty() {
                s.issues.push(Issue { kind: "fuseBlown", elements: melted, fatal: false });
            }
            if !tripped.is_empty() {
                s.issues.push(Issue { kind: "rcdTripped", elements: tripped, fatal: false });
            }
            return s;
        }
        seen.push(st.on.clone());
        st.on = next;
    }
    solve_states(elements, &st)
}

/// Steady-state solve with the switching states fixed.
fn solve_states(elements: &[Element], st: &Switching) -> Solution {
    // ---- nodes and parts ----
    let mut keys: Vec<String> = Vec::new();
    let mut index: HashMap<String, usize> = HashMap::new();
    let mut node = |k: &str, keys: &mut Vec<String>| -> usize {
        if let Some(&i) = index.get(k) {
            return i;
        }
        keys.push(k.to_string());
        index.insert(k.to_string(), keys.len() - 1);
        keys.len() - 1
    };
    let mut parts: Vec<Part> = Vec::new();
    for (ei, e) in elements.iter().enumerate() {
        let a = node(&e.a, &mut keys);
        let b = node(&e.b, &mut keys);
        let mut push = |a: usize, b: usize, branch: Branch, cap: f64| parts.push(Part { elem: ei, a, b, branch, cap });
        match &e.kind {
            Kind::Wire => push(a, b, Branch::Short, 0.0),
            Kind::Switch { closed } => push(a, b, if *closed { Branch::Short } else { Branch::Open }, 0.0),
            Kind::Resistor { r } => push(a, b, resistive(*r), 0.0),
            Kind::Lamp { u_rated, p_rated } => push(a, b, resistive(lamp_resistance(*u_rated, *p_rated)), 0.0),
            Kind::Rheostat { r_total, pos } => {
                let p = pos.clamp(0.0, 1.0);
                match &e.c {
                    Some(c) => {
                        let c = node(c, &mut keys);
                        parts.push(Part { elem: ei, a, b: c, branch: resistive(p * r_total), cap: 0.0 });
                        parts.push(Part { elem: ei, a: c, b, branch: resistive((1.0 - p) * r_total), cap: 0.0 });
                    }
                    None => push(a, b, resistive(p * r_total), 0.0),
                }
            }
            Kind::Battery { emf, r } => push(a, b, if *r > 0.0 { Branch::Conductance { g: 1.0 / r, emf: *emf } } else { Branch::Ideal { emf: *emf } }, 0.0),
            Kind::Ammeter { r } => push(a, b, resistive(*r), 0.0),
            Kind::Voltmeter { r } => push(a, b, if let Some(r) = r { resistive(*r) } else { Branch::Open }, 0.0),
            Kind::Capacitor { c } => push(a, b, Branch::Open, *c),
            Kind::Inductor { r, .. } => push(a, b, resistive(*r), 0.0),
            // an alternating source in a steady-state solve: its value at no time; only its resistance counts
            Kind::AcSource { r, .. } => push(a, b, if *r > 0.0 { Branch::Conductance { g: 1.0 / r, emf: 0.0 } } else { Branch::Ideal { emf: 0.0 } }, 0.0),
            Kind::Diode { vf, ron } => push(a, b, if st.on[ei] { if *ron > 0.0 { Branch::Conductance { g: 1.0 / ron, emf: *vf } } else { Branch::Ideal { emf: *vf } } } else { Branch::Open }, 0.0),
            // a generator turned at ω is a source of emf k·ω behind ra; a motor at rest is the resistance ra
            Kind::Motor { ra, k, drive: Some(w), .. } => push(a, b, if *ra > 0.0 { Branch::Conductance { g: 1.0 / ra, emf: k * w } } else { Branch::Ideal { emf: k * w } }, 0.0),
            Kind::Motor { ra, .. } => push(a, b, resistive(*ra), 0.0),
            Kind::Transformer { r1, .. } => {
                let c = node(e.c.as_deref().unwrap_or(""), &mut keys);
                let d = node(e.d.as_deref().unwrap_or(""), &mut keys);
                parts.push(Part { elem: ei, a, b, branch: resistive(*r1), cap: 0.0 });
                parts.push(Part { elem: ei, a: c, b: d, branch: Branch::Open, cap: 0.0 });
            }
            Kind::Fuse { .. } => push(a, b, if st.on[ei] { Branch::Short } else { Branch::Open }, 0.0),
            Kind::Rcd { .. } => {
                let c = node(e.c.as_deref().unwrap_or(""), &mut keys);
                let d = node(e.d.as_deref().unwrap_or(""), &mut keys);
                let br = if st.on[ei] { Branch::Short } else { Branch::Open };
                parts.push(Part { elem: ei, a, b, branch: br, cap: 0.0 });
                parts.push(Part { elem: ei, a: c, b: d, branch: br, cap: 0.0 });
            }
            Kind::Thermistor { .. } | Kind::Ldr { .. } | Kind::Fsr { .. } | Kind::Galvanometer { .. } => push(a, b, resistive(e.kind.sensor_resistance().unwrap_or(0.0)), 0.0),
            Kind::Probe { .. } => push(a, b, Branch::Open, 0.0),
        }
    }
    let nn = keys.len();
    let mut sol = Solution::default();
    // ---- super-nodes ----
    let mut dsu = Dsu((0..nn).collect());
    for p in &parts {
        if matches!(p.branch, Branch::Short) {
            dsu.union(p.a, p.b);
        }
    }
    let mut sn_of = vec![usize::MAX; nn];
    let mut sn_count = 0;
    for i in 0..nn {
        let r = dsu.find(i);
        if sn_of[r] == usize::MAX {
            sn_of[r] = sn_count;
            sn_count += 1;
        }
        sn_of[i] = sn_of[r];
    }
    let sa = |p: &Part| sn_of[p.a];
    let sb = |p: &Part| sn_of[p.b];
    // a shorted ideal battery
    for p in &parts {
        if let Branch::Ideal { emf } = p.branch {
            if sa(p) == sb(p) && emf != 0.0 {
                sol.issues.push(Issue { kind: "shortIdeal", elements: vec![elements[p.elem].id.clone()], fatal: true });
            }
        }
    }
    // ---- conducting components (super-nodes joined by conductances and sources) ----
    let mut comp = Dsu((0..sn_count).collect());
    for p in &parts {
        if matches!(p.branch, Branch::Conductance { .. } | Branch::Ideal { .. }) {
            comp.union(sa(p), sb(p));
        }
    }
    let comp_of: Vec<usize> = (0..sn_count).map(|s| comp.find(s)).collect();
    // reference super-node of each component: the − terminal of its first battery, else its first super-node
    let mut reference: HashMap<usize, usize> = HashMap::new();
    let is_source = |k: &Kind| matches!(k, Kind::Battery { .. } | Kind::AcSource { .. } | Kind::Motor { drive: Some(_), .. });
    for p in &parts {
        if is_source(&elements[p.elem].kind) {
            reference.entry(comp_of[sb(p)]).or_insert(sb(p));
        }
    }
    for s in 0..sn_count {
        reference.entry(comp_of[s]).or_insert(s);
    }
    let first_battery = parts.iter().find(|p| is_source(&elements[p.elem].kind)).map(|p| comp_of[sb(p)]);
    if elements.iter().any(|e| matches!(e.kind, Kind::AcSource { .. })) {
        sol.issues.push(Issue { kind: "needsRun", elements: vec![], fatal: false });
    }
    let stalled: Vec<String> = elements.iter().filter(|e| matches!(e.kind, Kind::Motor { drive: None, .. })).map(|e| e.id.clone()).collect();
    if !stalled.is_empty() {
        sol.issues.push(Issue { kind: "motorStalled", elements: stalled, fatal: false });
    }
    if first_battery.is_none() && !elements.is_empty() {
        sol.issues.push(Issue { kind: "noSource", elements: vec![], fatal: false });
    }
    let global = first_battery.unwrap_or_else(|| if sn_count > 0 { comp_of[0] } else { 0 });
    // groups of components joined by capacitors
    let mut grp = Dsu((0..sn_count).collect());
    for p in &parts {
        if p.cap > 0.0 {
            grp.union(comp_of[sa(p)], comp_of[sb(p)]);
        }
    }
    let group_of: Vec<usize> = (0..sn_count).map(|s| grp.find(comp_of[s])).collect();
    let global_group = if sn_count > 0 { grp.find(global) } else { 0 };
    // the component that is pinned to V = 0 in each group: the global one, else the first of the group
    let mut pinned: HashMap<usize, usize> = HashMap::new();
    if sn_count > 0 {
        pinned.insert(global_group, global);
    }
    for s in 0..sn_count {
        pinned.entry(group_of[s]).or_insert(comp_of[s]);
    }
    let floating_group = |g: usize| g != global_group;
    if sol.issues.iter().any(|i| i.fatal) {
        return finish_fatal(sol, keys, elements);
    }
    // ---- equations ----
    let ideal: Vec<usize> = (0..parts.len()).filter(|&k| matches!(parts[k].branch, Branch::Ideal { .. })).collect();
    let n = sn_count + ideal.len();
    let mut a = vec![0.0; n * n];
    let mut rhs = vec![0.0; n];
    for p in &parts {
        let (i, j) = (sa(p), sb(p));
        if let Branch::Conductance { g, emf } = p.branch {
            a[i * n + i] += g;
            a[i * n + j] -= g;
            a[j * n + i] -= g;
            a[j * n + j] += g;
            rhs[i] += g * emf;
            rhs[j] -= g * emf;
        }
    }
    for (k, &pi) in ideal.iter().enumerate() {
        let p = &parts[pi];
        let (i, j) = (sa(p), sb(p));
        let col = sn_count + k;
        a[i * n + col] += 1.0;
        a[j * n + col] -= 1.0;
        a[col * n + i] += 1.0;
        a[col * n + j] -= 1.0;
        if let Branch::Ideal { emf } = p.branch {
            rhs[col] = emf;
        }
    }
    // replace the KCL row of each component's reference node
    let mut comps: Vec<usize> = reference.keys().copied().collect();
    comps.sort_unstable();
    for &c in &comps {
        let r = reference[&c];
        a[r * n..r * n + n].iter_mut().for_each(|v| *v = 0.0);
        rhs[r] = 0.0;
        if pinned.get(&group_of[r]) == Some(&c) {
            a[r * n + r] = 1.0;
        } else {
            // net charge of the component's capacitor plates is zero
            for p in &parts {
                if p.cap <= 0.0 {
                    continue;
                }
                let (i, j) = (sa(p), sb(p));
                let (ci, cj) = (comp_of[i], comp_of[j]);
                if ci == cj {
                    continue;
                }
                if ci == c {
                    a[r * n + i] += p.cap;
                    a[r * n + j] -= p.cap;
                } else if cj == c {
                    a[r * n + j] += p.cap;
                    a[r * n + i] -= p.cap;
                }
            }
        }
    }
    let mut x = vec![0.0; n];
    let mut work = LinWork::default();
    let weights = vec![1.0; n];
    let (_, _, consistent) = solve_dense_into(n, &mut a.clone(), &mut rhs.clone(), 1e-13, &mut x, &mut work, Some(&weights));
    if !consistent {
        let ids = ideal.iter().map(|&pi| elements[parts[pi].elem].id.clone()).collect();
        sol.issues.push(Issue { kind: "conflict", elements: ids, fatal: true });
        return finish_fatal(sol, keys, elements);
    }
    // ---- branch currents ----
    let mut cur = vec![0.0; parts.len()];
    for (k, p) in parts.iter().enumerate() {
        cur[k] = match p.branch {
            Branch::Conductance { g, emf } => g * (x[sa(p)] - x[sb(p)]) - g * emf,
            Branch::Ideal { .. } => x[sn_count + ideal.iter().position(|&q| q == k).expect("ideal")],
            _ => 0.0,
        };
    }
    // currents of the shorts inside each super-node: unit-conductance flow balancing the other branches
    let mut members: Vec<Vec<usize>> = vec![Vec::new(); sn_count];
    for i in 0..nn {
        members[sn_of[i]].push(i);
    }
    for (s, mem) in members.iter().enumerate() {
        let shorts: Vec<usize> = (0..parts.len()).filter(|&k| matches!(parts[k].branch, Branch::Short) && sn_of[parts[k].a] == s).collect();
        if shorts.is_empty() || mem.len() < 2 {
            continue;
        }
        let m = mem.len();
        let pos = |node: usize| mem.iter().position(|&q| q == node).expect("member");
        let mut l = vec![0.0; m * m];
        let mut inj = vec![0.0; m];
        for &k in &shorts {
            let (i, j) = (pos(parts[k].a), pos(parts[k].b));
            if i == j {
                continue;
            }
            l[i * m + i] += 1.0;
            l[i * m + j] -= 1.0;
            l[j * m + i] -= 1.0;
            l[j * m + j] += 1.0;
        }
        for (k, p) in parts.iter().enumerate() {
            if matches!(p.branch, Branch::Short) {
                continue;
            }
            if sn_of[p.a] == s {
                inj[pos(p.a)] -= cur[k];
            }
            if sn_of[p.b] == s {
                inj[pos(p.b)] += cur[k];
            }
        }
        // pin the first member
        l[..m].iter_mut().for_each(|v| *v = 0.0);
        l[0] = 1.0;
        inj[0] = 0.0;
        let phi = solve_dense(m, &l, &inj, 1e-13).x;
        for &k in &shorts {
            cur[k] = phi[pos(parts[k].a)] - phi[pos(parts[k].b)];
        }
    }
    // ---- results ----
    let defined = |s: usize, t: usize| group_of[s] == group_of[t] || (!floating_group(group_of[s]) && !floating_group(group_of[t]));
    let potential = |node: usize| -> Option<f64> {
        let s = sn_of[node];
        if floating_group(group_of[s]) {
            None
        } else {
            Some(x[s] + 0.0)
        }
    };
    let mut floating_any = false;
    for (ei, e) in elements.iter().enumerate() {
        let (na, nb) = (index[&e.a], index[&e.b]);
        let (s, t) = (sn_of[na], sn_of[nb]);
        let u = if defined(s, t) { Some(x[s] - x[t] + 0.0) } else { None };
        if u.is_none() {
            floating_any = true;
        }
        let mine: Vec<usize> = (0..parts.len()).filter(|&k| parts[k].elem == ei).collect();
        let i = if mine.len() == 2 {
            // rheostat with a slider: the current entering at a
            cur[mine[0]]
        } else {
            cur[mine[0]]
        };
        let mut r = ElementResult { u, i: i + 0.0, p: u.map(|u| u * i + 0.0), ..Default::default() };
        if mine.len() == 2 && e.kind.four_terminal() {
            // transformer, RCD: currents of the two windings / conductors, power of both
            r.i_parts = Some((cur[mine[0]] + 0.0, cur[mine[1]] + 0.0));
            let (sc, sd) = (sn_of[parts[mine[1]].a], sn_of[parts[mine[1]].b]);
            r.p = if defined(s, t) && defined(sc, sd) { Some((x[s] - x[t]) * cur[mine[0]] + (x[sc] - x[sd]) * cur[mine[1]] + 0.0) } else { None };
        } else if mine.len() == 2 {
            r.i_parts = Some((cur[mine[0]] + 0.0, cur[mine[1]] + 0.0));
            // power of both parts
            let c = index[e.c.as_ref().expect("slider")];
            let sc = sn_of[c];
            r.p = if defined(s, sc) && defined(sc, t) { Some((x[s] - x[sc]) * cur[mine[0]] + (x[sc] - x[t]) * cur[mine[1]] + 0.0) } else { None };
        }
        match &e.kind {
            Kind::Lamp { p_rated, .. } => {
                r.extra = r.p.map(|p| if *p_rated > 0.0 { p / p_rated } else { 0.0 });
                if r.extra.is_some_and(|x| x > 1.2) {
                    sol.issues.push(Issue { kind: "lampOver", elements: vec![e.id.clone()], fatal: false });
                }
            }
            Kind::Capacitor { c } => r.extra = u.map(|u| c * u + 0.0),
            Kind::Galvanometer { ig, .. } => {
                let ig = *ig;
                r.extra = Some(if ig > 0.0 { i / ig } else { 0.0 });
                if ig > 0.0 && i.abs() > 1.05 * ig {
                    sol.issues.push(Issue { kind: "meterOver", elements: vec![e.id.clone()], fatal: false });
                }
            }
            Kind::Thermistor { .. } | Kind::Ldr { .. } | Kind::Fsr { .. } => r.extra = e.kind.sensor_resistance(),
            Kind::Diode { .. } | Kind::Fuse { .. } | Kind::Rcd { .. } => r.extra = Some(if st.on[ei] { 1.0 } else { 0.0 }),
            Kind::Ammeter { .. } if i < -1e-12 => sol.issues.push(Issue { kind: "meterReversed", elements: vec![e.id.clone()], fatal: false }),
            Kind::Voltmeter { .. } if u.is_some_and(|u| u < -1e-12) => sol.issues.push(Issue { kind: "meterReversed", elements: vec![e.id.clone()], fatal: false }),
            _ => {}
        }
        sol.elements.push((e.id.clone(), r));
    }
    if floating_any {
        sol.issues.push(Issue { kind: "floating", elements: vec![], fatal: false });
    }
    sol.nodes = (0..nn).map(|i| (keys[i].clone(), potential(i))).collect();
    sol.relations = relations(elements, &parts, &sn_of);
    sol.ok = true;
    sol
}

fn finish_fatal(mut sol: Solution, keys: Vec<String>, elements: &[Element]) -> Solution {
    sol.ok = false;
    sol.nodes = keys.into_iter().map(|k| (k, None)).collect();
    sol.elements = elements.iter().map(|e| (e.id.clone(), ElementResult { u: None, i: f64::NAN, p: None, i_parts: None, extra: None })).collect();
    sol
}

/// Series and parallel groups of the resistive elements (resistors, lamps, two-terminal rheostats).
fn relations(elements: &[Element], parts: &[Part], sn_of: &[usize]) -> Vec<(&'static str, Vec<String>)> {
    let is_res = |e: &Element| match e.kind {
        Kind::Resistor { r } => r > 0.0,
        Kind::Lamp { .. } => true,
        Kind::Rheostat { r_total, pos } => e.c.is_none() && r_total * pos > 0.0,
        _ => false,
    };
    let res: Vec<usize> = (0..parts.len()).filter(|&k| is_res(&elements[parts[k].elem]) && !matches!(parts[k].branch, Branch::Short)).collect();
    let mut out = Vec::new();
    // parallel: the same pair of super-nodes
    let mut by_pair: Vec<((usize, usize), Vec<usize>)> = Vec::new();
    for &k in &res {
        let (i, j) = (sn_of[parts[k].a], sn_of[parts[k].b]);
        if i == j {
            continue;
        }
        let key = (i.min(j), i.max(j));
        match by_pair.iter_mut().find(|(p, _)| *p == key) {
            Some((_, v)) => v.push(k),
            None => by_pair.push((key, vec![k])),
        }
    }
    for (_, v) in &by_pair {
        if v.len() > 1 {
            out.push(("parallel", v.iter().map(|&k| elements[parts[k].elem].id.clone()).collect()));
        }
    }
    // series: a super-node with exactly two non-open branches, both resistive
    let mut degree: HashMap<usize, Vec<usize>> = HashMap::new();
    for (k, p) in parts.iter().enumerate() {
        if matches!(p.branch, Branch::Short | Branch::Open) {
            continue;
        }
        let (i, j) = (sn_of[p.a], sn_of[p.b]);
        if i == j {
            continue;
        }
        degree.entry(i).or_default().push(k);
        degree.entry(j).or_default().push(k);
    }
    let mut dsu = Dsu((0..parts.len()).collect());
    let mut joined = vec![false; parts.len()];
    let mut nodes: Vec<&usize> = degree.keys().collect();
    nodes.sort_unstable();
    for s in nodes {
        let v = &degree[s];
        if v.len() == 2 && res.contains(&v[0]) && res.contains(&v[1]) {
            dsu.union(v[0], v[1]);
            joined[v[0]] = true;
            joined[v[1]] = true;
        }
    }
    let mut groups: Vec<(usize, Vec<usize>)> = Vec::new();
    for k in 0..parts.len() {
        if !joined[k] {
            continue;
        }
        let r = dsu.find(k);
        match groups.iter_mut().find(|(g, _)| *g == r) {
            Some((_, v)) => v.push(k),
            None => groups.push((r, vec![k])),
        }
    }
    for (_, v) in groups {
        out.push(("series", v.iter().map(|&k| elements[parts[k].elem].id.clone()).collect()));
    }
    out
}

/// Equivalent resistance between nodes a and b (Ω) of the passive network: the batteries are taken out (so the
/// terminals of a battery give the resistance of the external circuit), a 1 V test source is applied. None: no
/// conducting path (infinite).
pub fn equivalent_resistance(elements: &[Element], a: &str, b: &str) -> Option<f64> {
    if a == b {
        return Some(0.0);
    }
    let mut list: Vec<Element> = elements.iter().filter(|e| !matches!(e.kind, Kind::Battery { .. } | Kind::AcSource { .. } | Kind::Motor { drive: Some(_), .. })).cloned().collect();
    list.push(Element { id: "\u{0}test".into(), kind: Kind::Battery { emf: 1.0, r: 0.0 }, a: a.into(), b: b.into(), c: None, d: None });
    let s = solve(&list);
    if !s.ok {
        // the test source is shorted: a and b are joined by wires
        return if s.issues.iter().any(|i| i.kind == "shortIdeal") { Some(0.0) } else { None };
    }
    let i = s.elements.last().map(|(_, r)| -r.i).unwrap_or(0.0);
    if i.abs() <= 1e-15 {
        None
    } else {
        Some(1.0 / i)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn el(id: &str, kind: Kind, a: &str, b: &str) -> Element {
        Element { id: id.into(), kind, a: a.into(), b: b.into(), c: None, d: None }
    }
    fn get<'a>(s: &'a Solution, id: &str) -> &'a ElementResult {
        &s.elements.iter().find(|(k, _)| k == id).unwrap().1
    }
    /// Kirchhoff's current law at every node from the element currents.
    fn kcl(elements: &[Element], s: &Solution) {
        let mut net: HashMap<String, f64> = HashMap::new();
        for e in elements {
            let r = get(s, &e.id);
            match (&e.c, r.i_parts) {
                (Some(c), Some((i1, i2))) => {
                    *net.entry(e.a.clone()).or_default() -= i1;
                    *net.entry(c.clone()).or_default() += i1 - i2;
                    *net.entry(e.b.clone()).or_default() += i2;
                }
                _ => {
                    *net.entry(e.a.clone()).or_default() -= r.i;
                    *net.entry(e.b.clone()).or_default() += r.i;
                }
            }
        }
        for (k, v) in net {
            assert!(v.abs() < 1e-9, "KCL at {k}: {v}");
        }
    }

    #[test]
    fn series_with_internal_resistance() {
        // E = 6 V, r = 1 Ω, R1 = 2 Ω, R2 = 3 Ω in series: I = E/(R + r) = 1 A
        let c = vec![
            el("E", Kind::Battery { emf: 6.0, r: 1.0 }, "p", "n"),
            el("R1", Kind::Resistor { r: 2.0 }, "p", "m"),
            el("A", Kind::Ammeter { r: 0.0 }, "m", "k"),
            el("R2", Kind::Resistor { r: 3.0 }, "k", "q"),
            el("w", Kind::Wire, "q", "n"),
            el("V", Kind::Voltmeter { r: None }, "p", "n"),
        ];
        let s = solve(&c);
        assert!(s.ok);
        kcl(&c, &s);
        assert!((get(&s, "R1").i - 1.0).abs() < 1e-12);
        assert!((get(&s, "A").i - 1.0).abs() < 1e-12);
        assert!((get(&s, "V").u.unwrap() - 5.0).abs() < 1e-12, "terminal voltage U = E − Ir");
        assert!((get(&s, "E").i + 1.0).abs() < 1e-12, "the current leaves at +");
        assert!((get(&s, "R2").p.unwrap() - 3.0).abs() < 1e-12);
        assert!(s.relations.iter().any(|(k, v)| *k == "series" && v.contains(&"R1".to_string()) && v.contains(&"R2".to_string())));
        // power balance: the battery delivers what the resistors take
        let total: f64 = s.elements.iter().map(|(_, r)| r.p.unwrap_or(0.0)).sum();
        assert!(total.abs() < 1e-12);
    }

    #[test]
    fn parallel_and_mixed() {
        // ideal 12 V; R1 = 4 Ω in series with (R2 = 6 Ω ∥ R3 = 12 Ω = 4 Ω): I = 1.5 A, U23 = 6 V
        let c = vec![
            el("E", Kind::Battery { emf: 12.0, r: 0.0 }, "a", "g"),
            el("R1", Kind::Resistor { r: 4.0 }, "a", "b"),
            el("R2", Kind::Resistor { r: 6.0 }, "b", "g"),
            el("R3", Kind::Resistor { r: 12.0 }, "b", "h"),
            el("w", Kind::Wire, "h", "g"),
        ];
        let s = solve(&c);
        assert!(s.ok);
        kcl(&c, &s);
        assert!((get(&s, "R1").i - 1.5).abs() < 1e-12);
        assert!((get(&s, "R2").u.unwrap() - 6.0).abs() < 1e-12);
        assert!((get(&s, "R3").i - 0.5).abs() < 1e-12);
        assert!((get(&s, "w").i - 0.5).abs() < 1e-12);
        assert!(s.relations.iter().any(|(k, v)| *k == "parallel" && v.len() == 2));
        assert!((equivalent_resistance(&c, "a", "g").unwrap() - 8.0).abs() < 1e-12);
        assert!((equivalent_resistance(&c, "b", "g").unwrap() - 4.0).abs() < 1e-12, "R2 ∥ R3 (R1 hangs open without the battery)");
        assert!(equivalent_resistance(&c[1..2], "a", "g").is_none(), "no path");
    }

    #[test]
    fn shorted_ideal_battery_and_conflict() {
        let s = solve(&[el("E", Kind::Battery { emf: 3.0, r: 0.0 }, "a", "b"), el("w", Kind::Wire, "a", "b")]);
        assert!(!s.ok && s.issues[0].kind == "shortIdeal");
        assert!(s.elements.iter().all(|(_, r)| r.u.is_none()));
        // a battery with internal resistance may be shorted: I = E/r
        let s = solve(&[el("E", Kind::Battery { emf: 3.0, r: 0.5 }, "a", "b"), el("w", Kind::Wire, "a", "b")]);
        assert!(s.ok && (get(&s, "w").i - 6.0).abs() < 1e-12);
        let s = solve(&[el("E1", Kind::Battery { emf: 3.0, r: 0.0 }, "a", "b"), el("E2", Kind::Battery { emf: 1.5, r: 0.0 }, "a", "b"), el("R", Kind::Resistor { r: 1.0 }, "a", "b")]);
        assert!(!s.ok && s.issues[0].kind == "conflict");
        // equal ideal batteries in parallel share the current equally (least ∑I²)
        let s = solve(&[el("E1", Kind::Battery { emf: 3.0, r: 0.0 }, "a", "b"), el("E2", Kind::Battery { emf: 3.0, r: 0.0 }, "a", "b"), el("R", Kind::Resistor { r: 1.0 }, "a", "b")]);
        assert!(s.ok && (get(&s, "E1").i + 1.5).abs() < 1e-9 && (get(&s, "E2").i + 1.5).abs() < 1e-9);
    }

    #[test]
    fn lamps_switch_rheostat_and_capacitors() {
        // two "6 V 3 W" lamps (12 Ω) in parallel on 6 V: each at rated power; open switch removes one
        let mut c = vec![
            el("E", Kind::Battery { emf: 6.0, r: 0.0 }, "a", "g"),
            el("L1", Kind::Lamp { u_rated: 6.0, p_rated: 3.0 }, "a", "g"),
            el("S", Kind::Switch { closed: true }, "a", "s"),
            el("L2", Kind::Lamp { u_rated: 6.0, p_rated: 3.0 }, "s", "g"),
        ];
        let s = solve(&c);
        assert!((get(&s, "L2").extra.unwrap() - 1.0).abs() < 1e-12);
        c[2].kind = Kind::Switch { closed: false };
        let s = solve(&c);
        assert!(get(&s, "L2").extra.unwrap().abs() < 1e-12 && (get(&s, "S").u.unwrap() - 6.0).abs() < 1e-12, "open switch takes the whole voltage");
        // potentiometer (divider): slider at 0.25 of 100 Ω on 10 V, no load: U(c) = 7.5 V above the − end at b
        let c = vec![
            el("E", Kind::Battery { emf: 10.0, r: 0.0 }, "a", "b"),
            Element { id: "P".into(), kind: Kind::Rheostat { r_total: 100.0, pos: 0.25 }, a: "a".into(), b: "b".into(), c: Some("c".into()), d: None },
            el("V", Kind::Voltmeter { r: None }, "c", "b"),
        ];
        let s = solve(&c);
        kcl(&c, &s);
        assert!((get(&s, "V").u.unwrap() - 7.5).abs() < 1e-12);
        // two capacitors in series on 12 V: 2 µF and 4 µF share the charge, U1 = 8 V, U2 = 4 V
        let c = vec![
            el("E", Kind::Battery { emf: 12.0, r: 0.0 }, "a", "g"),
            el("C1", Kind::Capacitor { c: 2e-6 }, "a", "m"),
            el("C2", Kind::Capacitor { c: 4e-6 }, "m", "g"),
        ];
        let s = solve(&c);
        assert!(s.ok);
        assert!((get(&s, "C1").u.unwrap() - 8.0).abs() < 1e-9 && (get(&s, "C2").u.unwrap() - 4.0).abs() < 1e-9);
        assert!((get(&s, "C1").extra.unwrap() - get(&s, "C2").extra.unwrap()).abs() < 1e-15);
        // RC branch in steady state: U_C = E, no current
        let c = vec![el("E", Kind::Battery { emf: 5.0, r: 1.0 }, "a", "g"), el("R", Kind::Resistor { r: 10.0 }, "a", "m"), el("C", Kind::Capacitor { c: 1e-3 }, "m", "g")];
        let s = solve(&c);
        assert!((get(&s, "C").u.unwrap() - 5.0).abs() < 1e-12 && get(&s, "R").i.abs() < 1e-15);
        // voltmeter in series: reads E, no current
        let c = vec![el("E", Kind::Battery { emf: 3.0, r: 0.0 }, "a", "g"), el("V", Kind::Voltmeter { r: None }, "a", "m"), el("R", Kind::Resistor { r: 5.0 }, "m", "g")];
        let s = solve(&c);
        assert!((get(&s, "V").u.unwrap() - 3.0).abs() < 1e-12);
        // a separate part without connection: voltages across the gap are undefined
        let c = vec![el("E", Kind::Battery { emf: 3.0, r: 0.0 }, "a", "g"), el("R", Kind::Resistor { r: 5.0 }, "a", "g"), el("R2", Kind::Resistor { r: 5.0 }, "x", "y"), el("V", Kind::Voltmeter { r: None }, "a", "x")];
        let s = solve(&c);
        assert!(s.ok && get(&s, "V").u.is_none() && s.issues.iter().any(|i| i.kind == "floating"));
    }

    #[test]
    fn wire_loops_share_current() {
        let c = vec![el("E", Kind::Battery { emf: 2.0, r: 0.0 }, "a", "g"), el("R", Kind::Resistor { r: 1.0 }, "a", "m"), el("w1", Kind::Wire, "m", "g"), el("w2", Kind::Wire, "m", "g")];
        let s = solve(&c);
        kcl(&c, &s);
        assert!((get(&s, "w1").i - 1.0).abs() < 1e-12 && (get(&s, "w2").i - 1.0).abs() < 1e-12);
    }

    #[test]
    fn diodes_fuses_rcd_sensors_2655() {
        // half of a bridge: the diode conducts forward (U = vf + I·ron) and blocks backward
        let fwd = vec![
            el("E", Kind::Battery { emf: 5.0, r: 0.0 }, "a", "g"),
            el("D", Kind::Diode { vf: 0.7, ron: 0.0 }, "a", "m"),
            el("R", Kind::Resistor { r: 100.0 }, "m", "g"),
        ];
        let s = solve(&fwd);
        assert!(s.ok);
        assert!((get(&s, "R").i - 0.043).abs() < 1e-12 && get(&s, "D").extra == Some(1.0));
        let mut rev = fwd.clone();
        rev[1] = el("D", Kind::Diode { vf: 0.7, ron: 0.0 }, "m", "a");
        let s = solve(&rev);
        assert!(get(&s, "R").i.abs() < 1e-15 && (get(&s, "D").u.unwrap() + 5.0).abs() < 1e-12 && get(&s, "D").extra == Some(0.0));
        // a fuse rated 1 A melts at 2 A; the lamp goes dark
        let c = vec![el("E", Kind::Battery { emf: 4.0, r: 0.0 }, "a", "g"), el("F", Kind::Fuse { rating: 1.0 }, "a", "m"), el("R", Kind::Resistor { r: 2.0 }, "m", "g")];
        let s = solve(&c);
        assert!(get(&s, "R").i.abs() < 1e-15 && get(&s, "F").extra == Some(0.0));
        assert!(s.issues.iter().any(|i| i.kind == "fuseBlown" && i.elements == vec!["F".to_string()]));
        // an RCD trips when current leaks to earth instead of returning through the neutral
        let rcd = |leak: bool| {
            let mut c = vec![
                el("E", Kind::Battery { emf: 220.0, r: 0.0 }, "L", "N"),
                Element { id: "Q".into(), kind: Kind::Rcd { trip: 0.03 }, a: "L".into(), b: "l".into(), c: Some("N".into()), d: Some("n".into()) },
                el("R", Kind::Resistor { r: 1000.0 }, "l", "n"),
                el("earth", Kind::Wire, "N", "gnd"),
            ];
            if leak {
                c.push(el("body", Kind::Resistor { r: 2000.0 }, "l", "gnd"));
            }
            solve(&c)
        };
        let s = rcd(false);
        assert!((get(&s, "R").i - 0.22).abs() < 1e-12 && get(&s, "Q").extra == Some(1.0));
        let s = rcd(true);
        assert!(get(&s, "Q").extra == Some(0.0) && get(&s, "body").i.abs() < 1e-15 && s.issues.iter().any(|i| i.kind == "rcdTripped"));
        // NTC thermistor at 25 °C is r25, warmer is lower; galvanometer deflection I/ig
        let th = Kind::Thermistor { r25: 10e3, beta: 3950.0, temp: 25.0 };
        assert!((th.sensor_resistance().unwrap() - 10e3).abs() < 1e-9);
        assert!(Kind::Thermistor { r25: 10e3, beta: 3950.0, temp: 50.0 }.sensor_resistance().unwrap() < 4e3);
        let c = vec![el("E", Kind::Battery { emf: 1.5, r: 0.0 }, "a", "g"), el("G", Kind::Galvanometer { rg: 100.0, ig: 1e-3 }, "a", "m"), el("R", Kind::Resistor { r: 2900.0 }, "m", "g")];
        let s = solve(&c);
        assert!((get(&s, "G").extra.unwrap() - 0.5).abs() < 1e-12);
        // a generator turned at ω: emf kω behind ra; a motor at rest is ra
        let c = vec![el("M", Kind::Motor { ra: 1.0, k: 0.1, j: 1e-3, b: 0.0, load: 0.0, drive: Some(100.0) }, "a", "g"), el("R", Kind::Resistor { r: 9.0 }, "a", "g")];
        let s = solve(&c);
        assert!((get(&s, "R").i - 1.0).abs() < 1e-12);
        // transformer on DC: primary current E/(r + r1), secondary dead
        let c = vec![
            el("E", Kind::Battery { emf: 6.0, r: 1.0 }, "a", "g"),
            Element { id: "T".into(), kind: Kind::Transformer { n1: 100.0, n2: 50.0, lm: 1.0, r1: 2.0, r2: 0.0 }, a: "a".into(), b: "g".into(), c: Some("s".into()), d: Some("t".into()) },
            el("R", Kind::Resistor { r: 10.0 }, "s", "t"),
        ];
        let s = solve(&c);
        assert!(s.ok && (get(&s, "T").i - 2.0).abs() < 1e-12 && get(&s, "R").i.abs() < 1e-15);
    }
}
