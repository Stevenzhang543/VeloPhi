//! Circuits in time (26.55, D89): the circuit of the DC experiment, integrated from a given state.
//!
//! - Formulation: every branch has its current as an unknown (with the node potentials); a branch row is either a
//!   voltage relation `Va − Vb − r·I = e` (wires, sources, resistances, inductor companions), a Norton relation
//!   `I − g·(Va − Vb) = j` (capacitor companions) or `I = i₀`. One potential per conducting component is pinned to
//!   zero (the − terminal of its first source). Dense LU with partial pivoting after row and column equilibration; the factors
//!   are kept per step size, so a run mostly does back substitutions.
//! - Integration: trapezoidal rule (A-stable, keeps the energy of an LC circuit), step doubling for the error (one
//!   step against two half steps, relative tolerance `rtol`, the two-half-step result is kept); step sizes are the
//!   sample spacing divided by powers of two, so every sample is a step point and no value is interpolated.
//! - Discontinuities (start of a request, a switch thrown between requests, a diode, motor, fuse or RCD changing
//!   state): the currents of the capacitors and the voltages of the inductors at that instant are found from the
//!   circuit with capacitors as voltage sources and inductors as current sources ("consistent start"). When that
//!   circuit has no solution (a capacitor directly on an ideal source, an inductor current cut off), the state
//!   jumps: two backward-Euler steps of 10⁻⁹ of the sample spacing, or 10⁻⁷, 10⁻⁵ when that is too ill-conditioned (the
//!   energy lost in the jump is reported).
//! - State changes inside a step are located by bisection to 10⁻¹² of the sample spacing.
//! - Energies: ∫U·I dt per element with the product of the step's mean voltage and mean current, which for the
//!   trapezoidal companions equals the change of ½CU² and ½LI² exactly; by Tellegen's theorem the sum over all
//!   elements vanishes to rounding.

use super::circuit::{lamp_resistance, Element, Kind, FUSE_TIME};

/// Time constant of the RCD's rms filter of the residual current (s).
pub const RCD_TAU: f64 = 0.02;
const NONE: usize = usize::MAX;

/// Dynamic state of one element, carried between requests.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct ElemState {
    /// Capacitor voltage, inductor current or magnetizing current of a transformer.
    pub x: f64,
    /// Motor angular velocity (rad/s).
    pub w: f64,
    /// Switching state: diode 1 on / 0 off; fuse and RCD 1 closed / 0 open; motor 0 at rest, ±1 turning.
    pub s: f64,
    /// Fuse melting integral ∫(I² − I_r²)dt (A²·s) or the RCD's filtered residual current² (A²).
    pub m: f64,
}

/// Initial state of an element when the request does not give one.
pub fn default_state(kind: &Kind) -> ElemState {
    match *kind {
        Kind::Fuse { .. } | Kind::Rcd { .. } => ElemState { s: 1.0, ..Default::default() },
        Kind::Motor { drive: Some(w), .. } => ElemState { w, s: 0.0, ..Default::default() },
        Kind::Motor { load, .. } => ElemState { s: if load > 0.0 { 0.0 } else { 1.0 }, ..Default::default() },
        _ => ElemState::default(),
    }
}

/// Options of a run.
#[derive(Clone, Copy, Debug)]
pub struct RunOptions {
    pub t0: f64,
    pub duration: f64,
    /// Number of sample intervals (samples at t0 + k·duration/samples, k = 0 … samples).
    pub samples: usize,
    pub rtol: f64,
    pub max_steps: usize,
}

impl Default for RunOptions {
    fn default() -> Self {
        RunOptions { t0: 0.0, duration: 1e-3, samples: 100, rtol: 1e-11, max_steps: 4_000_000 }
    }
}

/// A state change during a run.
#[derive(Clone, Debug, PartialEq)]
pub struct Event {
    pub t: f64,
    pub kind: &'static str,
    pub element: usize,
    /// Energy lost in a jump (J), else 0.
    pub energy: f64,
}

/// Result of a run. Per sample and element: U (a − b, or the primary), I (a → b, or the primary), X and Y (see
/// `extra_values`); arrays are sample-major (sample k, element e at k·E + e).
#[derive(Clone, Debug, Default)]
pub struct Run {
    pub ok: bool,
    pub fatal: Option<&'static str>,
    pub t: Vec<f64>,
    pub u: Vec<f64>,
    pub i: Vec<f64>,
    pub xv: Vec<f64>,
    pub yv: Vec<f64>,
    /// Electrical energy absorbed by each element during the run (J; negative: delivered).
    pub energy: Vec<f64>,
    /// Motor: energy converted to mechanical work, ∫k·I·ω dt (J).
    pub mech: Vec<f64>,
    pub state: Vec<ElemState>,
    pub events: Vec<Event>,
    pub steps: usize,
    pub min_step: f64,
    pub max_step: f64,
}

// ---------------------------------------------------------------- network ----

/// Layout of the unknowns: node potentials first, then the branch unknowns of each element.
struct Net {
    nodes: usize,
    term: Vec<[usize; 4]>,
    /// Transformer: internal nodes P (after r1) and Q (after r2).
    inner: Vec<[usize; 2]>,
    first: Vec<usize>,
    n: usize,
}

fn branch_count(e: &Element) -> usize {
    match e.kind {
        Kind::Rheostat { .. } if e.c.is_some() => 2,
        Kind::Transformer { .. } => 4,
        Kind::Rcd { .. } | Kind::Motor { .. } => 2,
        _ => 1,
    }
}

impl Net {
    fn new(els: &[Element]) -> (Net, Vec<String>) {
        let mut keys: Vec<String> = Vec::new();
        let node = |k: &str, keys: &mut Vec<String>| -> usize {
            if let Some(i) = keys.iter().position(|x| x == k) {
                return i;
            }
            keys.push(k.to_string());
            keys.len() - 1
        };
        let mut term = Vec::with_capacity(els.len());
        for e in els {
            let a = node(&e.a, &mut keys);
            let b = node(&e.b, &mut keys);
            let c = match (&e.c, e.kind.four_terminal() || matches!(e.kind, Kind::Rheostat { .. })) {
                (Some(c), true) => node(c, &mut keys),
                _ => NONE,
            };
            let d = match (&e.d, e.kind.four_terminal()) {
                (Some(d), true) => node(d, &mut keys),
                _ => NONE,
            };
            term.push([a, b, c, d]);
        }
        let mut nodes = keys.len();
        let mut inner = vec![[NONE; 2]; els.len()];
        for (k, e) in els.iter().enumerate() {
            if matches!(e.kind, Kind::Transformer { .. }) {
                inner[k] = [nodes, nodes + 1];
                nodes += 2;
            }
        }
        let mut first = Vec::with_capacity(els.len());
        let mut n = nodes;
        for e in els {
            first.push(n);
            n += branch_count(e);
        }
        (Net { nodes, term, inner, first, n }, keys)
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum Method {
    /// Capacitors as voltage sources, inductors as current sources (currents and voltages at an instant).
    Start,
    Trap,
    Euler,
}

/// Values of the previous step point needed by the companions: capacitor current, inductor voltage, motor current
/// (per element; transformer: the magnetizing branch).
#[derive(Clone, Debug)]
struct Point {
    t: f64,
    st: Vec<ElemState>,
    /// History: capacitor current, inductor / magnetizing voltage, motor current.
    hist: Vec<f64>,
    /// Full solution vector at this point.
    x: Vec<f64>,
}

/// A linear system being assembled (dense, row-major).
struct Sys {
    n: usize,
    a: Vec<f64>,
    b: Vec<f64>,
}

impl Sys {
    fn new(n: usize) -> Sys {
        Sys { n, a: vec![0.0; n * n], b: vec![0.0; n] }
    }
    #[inline]
    fn add(&mut self, r: usize, c: usize, v: f64) {
        if r != NONE && c != NONE {
            self.a[r * self.n + c] += v;
        }
    }
    /// Branch k from node a to node b: KCL contributions (+I leaves a, enters b).
    fn kcl(&mut self, k: usize, a: usize, b: usize, f: f64) {
        self.add(a, k, f);
        self.add(b, k, -f);
    }
    /// Va − Vb − r·I = e.
    fn vsrc(&mut self, k: usize, a: usize, b: usize, r: f64, e: f64) {
        self.kcl(k, a, b, 1.0);
        self.add(k, a, 1.0);
        self.add(k, b, -1.0);
        self.add(k, k, -r);
        self.b[k] = e;
    }
    /// I − g·(Va − Vb) = j.
    fn norton(&mut self, k: usize, a: usize, b: usize, g: f64, j: f64) {
        self.kcl(k, a, b, 1.0);
        self.add(k, k, 1.0);
        self.add(k, a, -g);
        self.add(k, b, g);
        self.b[k] = j;
    }
    /// I = i0 (an open branch is i0 = 0).
    fn isrc(&mut self, k: usize, a: usize, b: usize, i0: f64) {
        if i0 != 0.0 {
            self.kcl(k, a, b, 1.0);
        }
        self.add(k, k, 1.0);
        self.b[k] = i0;
    }
}

/// LU factors with partial pivoting of the equilibrated matrix Dr·A·Dc (rows, then columns scaled to a largest
/// entry of 1), so that tiny step sizes (huge companion conductances and resistances) do not look singular.
struct Lu {
    n: usize,
    lu: Vec<f64>,
    piv: Vec<usize>,
    rs: Vec<f64>,
    cs: Vec<f64>,
}

impl Lu {
    fn factor(n: usize, a: &[f64]) -> Option<Lu> {
        let mut lu = a.to_vec();
        let mut rs = vec![1.0; n];
        let mut cs = vec![1.0; n];
        for r in 0..n {
            let m = lu[r * n..r * n + n].iter().fold(0.0f64, |m, v| m.max(v.abs()));
            if m == 0.0 {
                return None;
            }
            rs[r] = 1.0 / m;
            for v in &mut lu[r * n..r * n + n] {
                *v *= rs[r];
            }
        }
        for c in 0..n {
            let m = (0..n).fold(0.0f64, |m, r| m.max(lu[r * n + c].abs()));
            if m == 0.0 {
                return None;
            }
            cs[c] = 1.0 / m;
            for r in 0..n {
                lu[r * n + c] *= cs[c];
            }
        }
        let mut piv: Vec<usize> = (0..n).collect();
        for k in 0..n {
            let mut p = k;
            let mut best = lu[k * n + k].abs();
            for r in k + 1..n {
                let v = lu[r * n + k].abs();
                if v > best {
                    best = v;
                    p = r;
                }
            }
            if best <= 1e-13 {
                return None;
            }
            if p != k {
                for c in 0..n {
                    lu.swap(k * n + c, p * n + c);
                }
                piv.swap(k, p);
            }
            let d = lu[k * n + k];
            for r in k + 1..n {
                let f = lu[r * n + k] / d;
                if f == 0.0 {
                    continue;
                }
                lu[r * n + k] = f;
                for c in k + 1..n {
                    lu[r * n + c] -= f * lu[k * n + c];
                }
            }
        }
        Some(Lu { n, lu, piv, rs, cs })
    }

    fn solve(&self, b: &[f64], x: &mut [f64]) {
        let n = self.n;
        for r in 0..n {
            x[r] = b[self.piv[r]] * self.rs[self.piv[r]];
        }
        for r in 0..n {
            let mut s = x[r];
            for c in 0..r {
                s -= self.lu[r * n + c] * x[c];
            }
            x[r] = s;
        }
        for r in (0..n).rev() {
            let mut s = x[r];
            for c in r + 1..n {
                s -= self.lu[r * n + c] * x[c];
            }
            x[r] = s / self.lu[r * n + r];
        }
        for c in 0..n {
            x[c] *= self.cs[c];
        }
    }
}

struct Ctx<'a> {
    els: &'a [Element],
    net: Net,
    /// Union-find roots of the conducting components for the current switching states, and their pinned nodes.
    pinned: Vec<usize>,
    /// Element spans two components (an open element across a gap: its voltage is undefined).
    across: Vec<bool>,
}

fn find(p: &mut [usize], x: usize) -> usize {
    let mut r = x;
    while p[r] != r {
        r = p[r];
    }
    let mut y = x;
    while p[y] != r {
        let nx = p[y];
        p[y] = r;
        y = nx;
    }
    r
}

fn rheostat_parts(r_total: f64, pos: f64) -> (f64, f64) {
    let p = pos.clamp(0.0, 1.0);
    (p * r_total, (1.0 - p) * r_total)
}

/// Whether an element conducts (joins its terminals) in the given state.
fn conducts(kind: &Kind, st: &ElemState) -> bool {
    match *kind {
        Kind::Switch { closed } => closed,
        Kind::Voltmeter { r } => r.is_some(),
        Kind::Probe { .. } => false,
        Kind::Capacitor { c } => c > 0.0,
        Kind::Diode { .. } | Kind::Fuse { .. } | Kind::Rcd { .. } => st.s != 0.0,
        _ => true,
    }
}

impl<'a> Ctx<'a> {
    fn new(els: &'a [Element]) -> Ctx<'a> {
        let (net, _) = Net::new(els);
        Ctx { els, net, pinned: Vec::new(), across: vec![false; els.len()] }
    }

    /// Conducting components for the switching states `st`: pinned reference node of each.
    fn components(&mut self, st: &[ElemState]) {
        let nn = self.net.nodes;
        let mut p: Vec<usize> = (0..nn).collect();
        let join = |p: &mut Vec<usize>, a: usize, b: usize| {
            if a == NONE || b == NONE {
                return;
            }
            let (ra, rb) = (find(p, a), find(p, b));
            if ra != rb {
                if ra < rb {
                    p[rb] = ra;
                } else {
                    p[ra] = rb;
                }
            }
        };
        for (k, e) in self.els.iter().enumerate() {
            let [a, b, c, d] = self.net.term[k];
            match e.kind {
                Kind::Transformer { .. } => {
                    let [pp, q] = self.net.inner[k];
                    join(&mut p, a, pp);
                    join(&mut p, pp, b);
                    join(&mut p, c, q);
                    join(&mut p, q, d);
                }
                Kind::Rcd { .. } => {
                    if st[k].s != 0.0 {
                        join(&mut p, a, b);
                        join(&mut p, c, d);
                    }
                }
                Kind::Rheostat { .. } if c != NONE => {
                    join(&mut p, a, c);
                    join(&mut p, c, b);
                }
                _ => {
                    if conducts(&e.kind, &st[k]) {
                        join(&mut p, a, b);
                    }
                }
            }
        }
        let mut pinned = vec![NONE; nn];
        // the − terminal of the first source of each component
        for (k, e) in self.els.iter().enumerate() {
            if matches!(e.kind, Kind::Battery { .. } | Kind::AcSource { .. } | Kind::Motor { drive: Some(_), .. }) {
                let b = self.net.term[k][1];
                let r = find(&mut p, b);
                if pinned[r] == NONE {
                    pinned[r] = b;
                }
            }
        }
        let mut refs = Vec::new();
        for i in 0..nn {
            let r = find(&mut p, i);
            if pinned[r] == NONE {
                pinned[r] = i;
            }
            if i == r {
                refs.push(pinned[r]);
            }
        }
        self.pinned = refs;
        for (k, e) in self.els.iter().enumerate() {
            let [a, b, ..] = self.net.term[k];
            self.across[k] = !e.kind.four_terminal() && find(&mut p, a) != find(&mut p, b);
        }
    }

    /// Assemble the system for a step from `prev` to time t (or the instant `prev.t` for Start).
    fn assemble(&self, m: Method, h: f64, t: f64, prev: &Point) -> Sys {
        let mut s = Sys::new(self.net.n);
        for (k, e) in self.els.iter().enumerate() {
            let [a, b, c, d] = self.net.term[k];
            let k0 = self.net.first[k];
            let st = &prev.st[k];
            let hist = prev.hist[k];
            match e.kind {
                Kind::Wire => s.vsrc(k0, a, b, 0.0, 0.0),
                Kind::Switch { closed } => {
                    if closed {
                        s.vsrc(k0, a, b, 0.0, 0.0)
                    } else {
                        s.isrc(k0, a, b, 0.0)
                    }
                }
                Kind::Resistor { r } | Kind::Ammeter { r } => s.vsrc(k0, a, b, r.max(0.0), 0.0),
                Kind::Lamp { u_rated, p_rated } => s.vsrc(k0, a, b, lamp_resistance(u_rated, p_rated), 0.0),
                Kind::Rheostat { r_total, pos } => {
                    let (r1, r2) = rheostat_parts(r_total, pos);
                    if c != NONE {
                        s.vsrc(k0, a, c, r1, 0.0);
                        s.vsrc(k0 + 1, c, b, r2, 0.0);
                    } else {
                        s.vsrc(k0, a, b, r1, 0.0);
                    }
                }
                Kind::Battery { emf, r } => s.vsrc(k0, a, b, r.max(0.0), emf),
                Kind::AcSource { amp, freq, phase, r } => s.vsrc(k0, a, b, r.max(0.0), amp * crate::dmath::sin(2.0 * std::f64::consts::PI * freq * t + phase)),
                Kind::Voltmeter { r: Some(r) } => s.vsrc(k0, a, b, r, 0.0),
                Kind::Voltmeter { r: None } | Kind::Probe { .. } => s.isrc(k0, a, b, 0.0),
                Kind::Capacitor { c: cap } => {
                    if cap <= 0.0 {
                        s.isrc(k0, a, b, 0.0);
                    } else {
                        match m {
                            Method::Start => s.vsrc(k0, a, b, 0.0, st.x),
                            Method::Trap => s.norton(k0, a, b, 2.0 * cap / h, -(2.0 * cap / h) * st.x - hist),
                            Method::Euler => s.norton(k0, a, b, cap / h, -(cap / h) * st.x),
                        }
                    }
                }
                Kind::Inductor { l, r } => inductor(&mut s, m, h, k0, a, b, l, r, st.x, hist),
                Kind::Diode { vf, ron } => {
                    if st.s != 0.0 {
                        s.vsrc(k0, a, b, ron, vf)
                    } else {
                        s.isrc(k0, a, b, 0.0)
                    }
                }
                Kind::Fuse { .. } => {
                    if st.s != 0.0 {
                        s.vsrc(k0, a, b, 0.0, 0.0)
                    } else {
                        s.isrc(k0, a, b, 0.0)
                    }
                }
                Kind::Rcd { .. } => {
                    if st.s != 0.0 {
                        s.vsrc(k0, a, b, 0.0, 0.0);
                        s.vsrc(k0 + 1, c, d, 0.0, 0.0);
                    } else {
                        s.isrc(k0, a, b, 0.0);
                        s.isrc(k0 + 1, c, d, 0.0);
                    }
                }
                Kind::Thermistor { .. } | Kind::Ldr { .. } | Kind::Fsr { .. } | Kind::Galvanometer { .. } => s.vsrc(k0, a, b, e.kind.sensor_resistance().unwrap_or(0.0), 0.0),
                Kind::Motor { ra, k: km, j, b: bf, load, drive } => {
                    // branch: Va − Vb − ra·I − k·ω = 0; row k0 + 1: the rotor
                    let (ki, kw) = (k0, k0 + 1);
                    s.kcl(ki, a, b, 1.0);
                    s.add(ki, a, 1.0);
                    s.add(ki, b, -1.0);
                    s.add(ki, ki, -ra);
                    s.add(ki, kw, -km);
                    let fixed = match (m, drive) {
                        (_, Some(wd)) => Some(wd),
                        (Method::Start, None) => Some(st.w),
                        (_, None) if st.s == 0.0 => Some(0.0),
                        _ => None,
                    };
                    match fixed {
                        Some(w) => {
                            s.add(kw, kw, 1.0);
                            s.b[kw] = w;
                        }
                        None => {
                            let tl = load * st.s;
                            if m == Method::Trap {
                                s.add(kw, kw, j / h + 0.5 * bf);
                                s.add(kw, ki, -0.5 * km);
                                s.b[kw] = (j / h - 0.5 * bf) * st.w + 0.5 * km * hist - tl;
                            } else {
                                s.add(kw, kw, j / h + bf);
                                s.add(kw, ki, -km);
                                s.b[kw] = (j / h) * st.w - tl;
                            }
                        }
                    }
                }
                Kind::Transformer { n1, n2, lm, r1, r2 } => {
                    let [pp, q] = self.net.inner[k];
                    let n = n1 / n2;
                    s.vsrc(k0, a, pp, r1, 0.0);
                    inductor(&mut s, m, h, k0 + 1, pp, b, lm, 0.0, st.x, hist);
                    // ideal: V_P − V_B − n·(V_Q − V_D) = 0; It enters P, leaves B; n·It enters Q from the winding
                    let kt = k0 + 2;
                    s.add(pp, kt, 1.0);
                    s.add(b, kt, -1.0);
                    s.add(q, kt, -n);
                    s.add(d, kt, n);
                    s.add(kt, pp, 1.0);
                    s.add(kt, b, -1.0);
                    s.add(kt, q, -n);
                    s.add(kt, d, n);
                    s.vsrc(k0 + 3, c, q, r2, 0.0);
                }
            }
        }
        // pin one node of each component
        for &r in &self.pinned {
            let n = s.n;
            s.a[r * n..r * n + n].iter_mut().for_each(|v| *v = 0.0);
            s.a[r * n + r] = 1.0;
            s.b[r] = 0.0;
        }
        s
    }
}

/// Inductor companion between a and b (current unknown k): Start: I = i_n; trapezoidal and backward Euler.
#[allow(clippy::too_many_arguments)]
fn inductor(s: &mut Sys, m: Method, h: f64, k: usize, a: usize, b: usize, l: f64, r: f64, i_n: f64, v_n: f64) {
    match m {
        Method::Start => {
            s.kcl(k, a, b, 1.0);
            s.add(k, k, 1.0);
            s.b[k] = i_n;
        }
        Method::Trap => s.vsrc(k, a, b, 2.0 * l / h + r, -(2.0 * l / h - r) * i_n - v_n),
        Method::Euler => s.vsrc(k, a, b, l / h + r, -(l / h) * i_n),
    }
}

// ---------------------------------------------------------------- values ----

/// U, I, X, Y of element k from a solution vector.
fn values(ctx: &Ctx, k: usize, x: &[f64], st: &ElemState) -> [f64; 4] {
    let e = &ctx.els[k];
    let [a, b, c, d] = ctx.net.term[k];
    let v = |i: usize| if i == NONE { 0.0 } else { x[i] };
    let k0 = ctx.net.first[k];
    let u = if ctx.across[k] { f64::NAN } else { v(a) - v(b) };
    let i = x[k0];
    match e.kind {
        Kind::Transformer { .. } => {
            // secondary current out of terminal c into the external circuit
            [v(a) - v(b), x[k0], v(c) - v(d), -x[k0 + 3]]
        }
        Kind::Rcd { .. } => [v(a) - v(b), i, x[k0 + 1], st.s],
        Kind::Rheostat { .. } if c != NONE => [u, i, x[k0 + 1], 0.0],
        Kind::Motor { .. } => [u, i, x[k0 + 1], st.s],
        Kind::Lamp { p_rated, .. } => [u, i, if p_rated > 0.0 { u * i / p_rated } else { 0.0 }, 0.0],
        Kind::Capacitor { c: cap } => [u, i, cap * u, 0.0],
        Kind::Galvanometer { ig, .. } => [u, i, if ig > 0.0 { i / ig } else { 0.0 }, 0.0],
        Kind::Thermistor { .. } | Kind::Ldr { .. } | Kind::Fsr { .. } => [u, i, e.kind.sensor_resistance().unwrap_or(0.0), 0.0],
        Kind::Diode { .. } => [u, i, st.s, 0.0],
        Kind::Fuse { rating } => [u, i, st.s, st.m / (rating * rating * FUSE_TIME)],
        Kind::Inductor { .. } => [u, i, st.x, 0.0],
        _ => [u, i, 0.0, 0.0],
    }
}

/// Energy absorbed by element k over a step from x0 to x1 (method-consistent product rule).
fn step_energy(ctx: &Ctx, k: usize, m: Method, h: f64, x0: &[f64], x1: &[f64]) -> f64 {
    let e = &ctx.els[k];
    let [a, b, c, d] = ctx.net.term[k];
    let k0 = ctx.net.first[k];
    // list of (from, to, current index) of the element's ports
    let mut ports: [(usize, usize, usize); 2] = [(a, b, k0), (NONE, NONE, NONE)];
    match e.kind {
        Kind::Transformer { .. } => ports[1] = (c, d, NONE),
        Kind::Rcd { .. } => ports[1] = (c, d, k0 + 1),
        Kind::Rheostat { .. } if c != NONE => {
            ports[0] = (a, c, k0);
            ports[1] = (c, b, k0 + 1);
        }
        _ => {}
    }
    let mut w = 0.0;
    for (pi, &(p, q, ci)) in ports.iter().enumerate() {
        if p == NONE && q == NONE {
            continue;
        }
        let v = |x: &[f64]| (if p == NONE { 0.0 } else { x[p] }) - (if q == NONE { 0.0 } else { x[q] });
        let cur = |x: &[f64]| -> f64 {
            if pi == 1 && matches!(e.kind, Kind::Transformer { .. }) {
                // secondary: current into c from the external circuit is the current of r2 (c → Q)
                x[k0 + 3]
            } else {
                x[ci]
            }
        };
        if m == Method::Euler {
            w += h * v(x1) * cur(x1);
        } else {
            w += h * 0.5 * (v(x0) + v(x1)) * 0.5 * (cur(x0) + cur(x1));
        }
    }
    w
}

/// History values (capacitor current, inductor voltage, motor current) from a solution.
fn history(ctx: &Ctx, x: &[f64], out: &mut [f64]) {
    for (k, e) in ctx.els.iter().enumerate() {
        let [a, b, ..] = ctx.net.term[k];
        let v = |i: usize| if i == NONE { 0.0 } else { x[i] };
        let k0 = ctx.net.first[k];
        out[k] = match e.kind {
            Kind::Capacitor { .. } | Kind::Motor { .. } => x[k0],
            Kind::Inductor { .. } => v(a) - v(b),
            Kind::Transformer { .. } => {
                let [pp, _] = ctx.net.inner[k];
                v(pp) - v(b)
            }
            _ => 0.0,
        };
    }
}

/// Dynamic states after a step (capacitor voltages, inductor currents, ω, melt and rcd integrals).
fn advance_states(ctx: &Ctx, m: Method, h: f64, x0: &[f64], x1: &[f64], st0: &[ElemState], out: &mut [ElemState]) {
    for (k, e) in ctx.els.iter().enumerate() {
        let [a, b, c, d] = ctx.net.term[k];
        let v = |x: &[f64], i: usize| if i == NONE { 0.0 } else { x[i] };
        let k0 = ctx.net.first[k];
        let mut s = st0[k];
        match e.kind {
            Kind::Capacitor { .. } => s.x = v(x1, a) - v(x1, b),
            Kind::Inductor { .. } => s.x = x1[k0],
            Kind::Transformer { .. } => s.x = x1[k0 + 1],
            Kind::Motor { .. } => s.w = x1[k0 + 1],
            Kind::Fuse { rating } if s.s != 0.0 => {
                // heating ∝ I², cooling ∝ I_r²: the melt integral grows while the current (rms) is above the rating
                let f = |i: f64| i * i - rating * rating;
                s.m = (s.m + if m == Method::Euler { h * f(x1[k0]) } else { 0.5 * h * (f(x0[k0]) + f(x1[k0])) }).max(0.0);
            }
            Kind::Rcd { .. } if s.s != 0.0 => {
                let r0 = x0[k0] + x0[k0 + 1];
                let r1 = x1[k0] + x1[k0 + 1];
                let _ = (c, d);
                s.m = if m == Method::Euler { (s.m + h / RCD_TAU * r1 * r1) / (1.0 + h / RCD_TAU) } else { (s.m * (1.0 - 0.5 * h / RCD_TAU) + 0.5 * h / RCD_TAU * (r0 * r0 + r1 * r1)) / (1.0 + 0.5 * h / RCD_TAU) };
            }
            _ => {}
        }
        out[k] = s;
    }
}

/// Event functions of the switching elements (a change of sign means a change of state).
fn event_values(ctx: &Ctx, x: &[f64], st: &[ElemState], out: &mut Vec<(usize, f64)>) {
    out.clear();
    for (k, e) in ctx.els.iter().enumerate() {
        let [a, b, ..] = ctx.net.term[k];
        let v = |i: usize| if i == NONE { 0.0 } else { x[i] };
        let k0 = ctx.net.first[k];
        match e.kind {
            Kind::Diode { vf, .. } => out.push((k, if st[k].s != 0.0 { x[k0] } else { vf - (v(a) - v(b)) })),
            Kind::Motor { k: km, load, drive: None, .. } if load > 0.0 => {
                out.push((k, if st[k].s == 0.0 { load - (km * x[k0]).abs() } else { st[k].s * x[k0 + 1] }));
            }
            Kind::Fuse { rating } if st[k].s != 0.0 => out.push((k, rating * rating * FUSE_TIME - st[k].m)),
            Kind::Rcd { trip } if st[k].s != 0.0 => out.push((k, trip * trip - st[k].m)),
            _ => {}
        }
    }
}

/// New switching state of element k after its event function crossed zero at solution x.
fn switch_state(ctx: &Ctx, k: usize, x: &[f64], st: &mut ElemState) -> &'static str {
    let k0 = ctx.net.first[k];
    match ctx.els[k].kind {
        Kind::Diode { .. } => {
            st.s = if st.s != 0.0 { 0.0 } else { 1.0 };
            if st.s != 0.0 {
                "diodeOn"
            } else {
                "diodeOff"
            }
        }
        Kind::Motor { k: km, load, .. } => {
            if st.s == 0.0 {
                st.s = if km * x[k0] >= 0.0 { 1.0 } else { -1.0 };
                "motorStart"
            } else if (km * x[k0]).abs() > load {
                // the rotor passes through rest and turns the other way
                st.s = -st.s;
                st.w = 0.0;
                "motorReverse"
            } else {
                st.s = 0.0;
                st.w = 0.0;
                "motorStop"
            }
        }
        Kind::Fuse { .. } => {
            st.s = 0.0;
            "fuseBlown"
        }
        Kind::Rcd { .. } => {
            st.s = 0.0;
            "rcdTripped"
        }
        _ => "",
    }
}

// ---------------------------------------------------------------- run ----

struct Stepper<'a> {
    ctx: Ctx<'a>,
    /// Cached factors per (method, step size bits); cleared when a switching state changes.
    cache: Vec<(Method, u64, Lu)>,
}

impl<'a> Stepper<'a> {
    /// One step of size h from `prev` (method m); None when the system is singular.
    fn step(&mut self, m: Method, h: f64, prev: &Point) -> Option<Point> {
        let t = prev.t + h;
        let s = self.ctx.assemble(m, h, t, prev);
        let key = h.to_bits();
        let i = match self.cache.iter().position(|(mm, hh, _)| *mm == m && *hh == key) {
            Some(i) => i,
            None => {
                let lu = Lu::factor(s.n, &s.a)?;
                if self.cache.len() >= 8 {
                    self.cache.remove(0);
                }
                self.cache.push((m, key, lu));
                self.cache.len() - 1
            }
        };
        let mut x = vec![0.0; s.n];
        self.cache[i].2.solve(&s.b, &mut x);
        if x.iter().any(|v| !v.is_finite()) {
            return None;
        }
        let mut st = prev.st.clone();
        advance_states(&self.ctx, m, h, &prev.x, &x, &prev.st, &mut st);
        let mut hist = vec![0.0; prev.hist.len()];
        history(&self.ctx, &x, &mut hist);
        Some(Point { t, st, hist, x })
    }

    /// Currents and voltages at the instant of `p` from its states (consistent start); None when inconsistent.
    fn start(&mut self, p: &Point) -> Option<Point> {
        let s = self.ctx.assemble(Method::Start, 0.0, p.t, p);
        let lu = Lu::factor(s.n, &s.a)?;
        let mut x = vec![0.0; s.n];
        lu.solve(&s.b, &mut x);
        if x.iter().any(|v| !v.is_finite()) {
            return None;
        }
        let mut hist = vec![0.0; p.hist.len()];
        history(&self.ctx, &x, &mut hist);
        Some(Point { t: p.t, st: p.st.clone(), hist, x })
    }
}

/// Integrate the circuit from `state` (per element; None: the defaults) for `opts.duration`.
pub fn run(els: &[Element], state: &[Option<ElemState>], opts: &RunOptions) -> Run {
    let ne = els.len();
    let mut out = Run { min_step: f64::INFINITY, ..Default::default() };
    let st0: Vec<ElemState> = (0..ne).map(|k| state.get(k).copied().flatten().unwrap_or_else(|| default_state(&els[k].kind))).collect();
    let mut sp = Stepper { ctx: Ctx::new(els), cache: Vec::new() };
    sp.ctx.components(&st0);
    let n = sp.ctx.net.n;
    let samples = opts.samples.max(1);
    let dt = opts.duration / samples as f64;
    let mut cur = Point { t: opts.t0, st: st0, hist: vec![0.0; ne], x: vec![0.0; n] };
    out.energy = vec![0.0; ne];
    out.mech = vec![0.0; ne];
    let rtol = opts.rtol.max(1e-14);
    // scale of each integrated quantity for the error test: the largest magnitude so far, at least a floor
    // (switching integrals: their thresholds)
    let floor_m: Vec<f64> = els
        .iter()
        .map(|e| match e.kind {
            Kind::Fuse { rating } => rating * rating * FUSE_TIME,
            Kind::Rcd { trip } => trip * trip,
            _ => 1e-300,
        })
        .collect();
    let mut peak = vec![0.0f64; 3 * ne];
    for k in 0..ne {
        peak[3 * k] = cur.st[k].x.abs();
        peak[3 * k + 1] = cur.st[k].w.abs();
        peak[3 * k + 2] = floor_m[k];
    }
    out.state = cur.st.clone();
    if dt.partial_cmp(&0.0) != Some(std::cmp::Ordering::Greater) {
        out.fatal = Some("badDuration");
        return out;
    }
    if !settle(&mut sp, &mut cur, &mut out, dt) {
        out.fatal = Some(classify_singular(els));
        return out;
    }
    let mut level: u32 = 0; // step = dt / 2^level
    let mut pos: f64 = 0.0; // position in units of dt
    let mut ev_a: Vec<(usize, f64)> = Vec::new();
    let mut ev_b: Vec<(usize, f64)> = Vec::new();
    let mut next_sample = 0usize;
    loop {
        // samples reached
        while next_sample <= samples && pos >= next_sample as f64 - 1e-12 {
            pos = pos.max(next_sample as f64);
            cur.t = opts.t0 + dt * next_sample as f64;
            push_sample(&mut out, &sp.ctx, &cur);
            next_sample += 1;
        }
        if next_sample > samples {
            break;
        }
        if out.steps >= opts.max_steps {
            out.fatal = Some("tooManySteps");
            break;
        }
        let grid = (0.5f64).powi(level as i32);
        let target = (((pos / grid) + 1e-9).floor() + 1.0) * grid;
        let target = target.min(next_sample as f64);
        let h = (target - pos) * dt;
        // one step against two half steps
        let (Some(full), Some(half1)) = (sp.step(Method::Trap, h, &cur), sp.step(Method::Trap, 0.5 * h, &cur)) else {
            out.fatal = Some(classify_singular(els));
            break;
        };
        let Some(half2) = sp.step(Method::Trap, 0.5 * h, &half1) else {
            out.fatal = Some(classify_singular(els));
            break;
        };
        let mut err = 0.0f64;
        for k in 0..ne {
            let pairs = [(full.st[k].x, half2.st[k].x), (full.st[k].w, half2.st[k].w), (full.st[k].m, half2.st[k].m)];
            for (j, (a, b)) in pairs.iter().enumerate() {
                let scale = peak[3 * k + j].max(b.abs()).max(1e-300);
                err = err.max((a - b).abs() / 3.0 / (rtol * scale));
            }
        }
        if err > 1.0 && level < 60 {
            level += 1;
            continue;
        }
        // state changes between cur and half2
        event_values(&sp.ctx, &cur.x, &cur.st, &mut ev_a);
        event_values(&sp.ctx, &half2.x, &half2.st, &mut ev_b);
        if ev_a.iter().zip(ev_b.iter()).any(|(a, b)| crosses(a.1, b.1)) {
            // locate the first change by bisection on the step size (single trapezoidal steps)
            let (mut lo, mut hi) = (0.0f64, h);
            let mut best: Option<Point> = None;
            for _ in 0..90 {
                if hi - lo <= 1e-12 * dt {
                    break;
                }
                let mid = 0.5 * (lo + hi);
                let Some(p) = sp.step(Method::Trap, mid, &cur) else { break };
                event_values(&sp.ctx, &p.x, &p.st, &mut ev_b);
                if ev_a.iter().zip(ev_b.iter()).any(|(a, b)| crosses(a.1, b.1)) {
                    hi = mid;
                    best = Some(p);
                } else {
                    lo = mid;
                }
            }
            let p = match best.or_else(|| sp.step(Method::Trap, hi, &cur)) {
                Some(p) => p,
                None => {
                    out.fatal = Some(classify_singular(els));
                    break;
                }
            };
            event_values(&sp.ctx, &p.x, &p.st, &mut ev_b);
            for k in 0..ne {
                out.energy[k] += step_energy(&sp.ctx, k, Method::Trap, hi, &cur.x, &p.x);
                out.mech[k] += mech_energy(&sp.ctx, k, hi, &cur.x, &p.x);
            }
            let fired: Vec<usize> = ev_a.iter().zip(ev_b.iter()).filter(|(a, b)| crosses(a.1, b.1)).map(|(a, _)| a.0).collect();
            let mut np = p;
            for k in fired {
                let mut s = np.st[k];
                let kind = switch_state(&sp.ctx, k, &np.x, &mut s);
                np.st[k] = s;
                out.events.push(Event { t: np.t, kind, element: k, energy: 0.0 });
            }
            pos += hi / dt;
            out.steps += 1;
            out.min_step = out.min_step.min(hi);
            sp.cache.clear();
            sp.ctx.components(&np.st);
            cur = np;
            if !settle(&mut sp, &mut cur, &mut out, dt) {
                out.fatal = Some(classify_singular(els));
                break;
            }
            continue;
        }
        // accept the two half steps
        for k in 0..ne {
            out.energy[k] += step_energy(&sp.ctx, k, Method::Trap, 0.5 * h, &cur.x, &half1.x) + step_energy(&sp.ctx, k, Method::Trap, 0.5 * h, &half1.x, &half2.x);
            out.mech[k] += mech_energy(&sp.ctx, k, 0.5 * h, &cur.x, &half1.x) + mech_energy(&sp.ctx, k, 0.5 * h, &half1.x, &half2.x);
            peak[3 * k] = peak[3 * k].max(half2.st[k].x.abs());
            peak[3 * k + 1] = peak[3 * k + 1].max(half2.st[k].w.abs());
            peak[3 * k + 2] = peak[3 * k + 2].max(half2.st[k].m.abs());
        }
        out.steps += 1;
        out.min_step = out.min_step.min(h);
        out.max_step = out.max_step.max(h);
        cur = half2;
        pos = target;
        // larger steps when the error is small and the position is on the coarser grid
        if err < 0.05 && level > 0 && ((pos / (2.0 * grid)).fract()).abs() < 1e-12 {
            level -= 1;
        }
    }
    out.state = cur.st.clone();
    out.ok = out.fatal.is_none();
    if !out.min_step.is_finite() {
        out.min_step = 0.0;
    }
    out
}

fn push_sample(out: &mut Run, ctx: &Ctx, p: &Point) {
    out.t.push(p.t);
    for k in 0..ctx.els.len() {
        let v = values(ctx, k, &p.x, &p.st[k]);
        out.u.push(v[0]);
        out.i.push(v[1]);
        out.xv.push(v[2]);
        out.yv.push(v[3]);
    }
}

/// Consistent start at `cur`; when the circuit with capacitors as sources and inductors as current sources has no
/// solution, the state jumps (two backward-Euler steps of 10⁻⁹ of the sample spacing) and the energy lost in the
/// jump is reported. False when not even the jump has a solution.
fn settle(sp: &mut Stepper, cur: &mut Point, out: &mut Run, dt: f64) -> bool {
    if let Some(p) = sp.start(cur) {
        *cur = p;
        return true;
    }
    let els = sp.ctx.els;
    let ne = els.len();
    let t_before = cur.t;
    let before = stored_energy(els, &cur.st);
    let mut absorbed = 0.0;
    sp.cache.clear();
    for pass in 0..2 {
        // the shortest step whose system is still well conditioned (a node held only by an inductor's companion
        // resistance L/h looks singular when h is extremely small)
        let mut stepped = None;
        for f in [1e-9, 1e-7, 1e-5] {
            let h = dt * f;
            if let Some(p) = sp.step(Method::Euler, h, cur) {
                stepped = Some((h, p));
                break;
            }
        }
        let Some((h, p)) = stepped else { return false };
        for k in 0..ne {
            let w = step_energy(&sp.ctx, k, Method::Euler, h, &cur.x, &p.x);
            out.energy[k] += w;
            if is_storage(&els[k].kind) {
                absorbed += w;
            }
        }
        *cur = p;
        if pass == 0 {
            if let Some(p) = sp.start(cur) {
                *cur = p;
                break;
            }
        }
    }
    sp.cache.clear();
    // the jump takes no time on the clock of the run
    cur.t = t_before;
    let after = stored_energy(els, &cur.st);
    let lost = absorbed - (after - before);
    if lost > 1e-12 * (before.abs() + after.abs() + absorbed.abs()) {
        out.events.push(Event { t: cur.t, kind: "jump", element: usize::MAX, energy: lost });
    }
    true
}

fn is_storage(kind: &Kind) -> bool {
    matches!(kind, Kind::Capacitor { .. } | Kind::Inductor { .. } | Kind::Transformer { .. })
}

#[inline]
fn crosses(a: f64, b: f64) -> bool {
    a >= 0.0 && b < 0.0
}

fn mech_energy(ctx: &Ctx, k: usize, h: f64, x0: &[f64], x1: &[f64]) -> f64 {
    match ctx.els[k].kind {
        Kind::Motor { k: km, .. } => {
            let k0 = ctx.net.first[k];
            h * km * 0.5 * (x0[k0] + x1[k0]) * 0.5 * (x0[k0 + 1] + x1[k0 + 1])
        }
        _ => 0.0,
    }
}

/// Energy stored in capacitors, inductors and rotors (J); elements without a state count as empty.
pub fn stored_energy(els: &[Element], st: &[ElemState]) -> f64 {
    let mut e = 0.0;
    for (el, s) in els.iter().zip(st.iter()) {
        e += match el.kind {
            Kind::Capacitor { c } => 0.5 * c * s.x * s.x,
            Kind::Inductor { l, .. } => 0.5 * l * s.x * s.x,
            Kind::Transformer { lm, .. } => 0.5 * lm * s.x * s.x,
            Kind::Motor { j, drive: None, .. } => 0.5 * j * s.w * s.w,
            _ => 0.0,
        };
    }
    e
}

fn classify_singular(els: &[Element]) -> &'static str {
    let dc = super::circuit::solve(els);
    if let Some(i) = dc.issues.iter().find(|i| i.fatal) {
        i.kind
    } else {
        "singular"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn el(id: &str, kind: Kind, a: &str, b: &str) -> Element {
        Element { id: id.into(), kind, a: a.into(), b: b.into(), c: None, d: None }
    }
    fn idx(els: &[Element], id: &str) -> usize {
        els.iter().position(|e| e.id == id).unwrap()
    }

    #[test]
    fn rc_charging_and_energy() {
        // E = 10 V, R = 1 kΩ, C = 1 µF: τ = 1 ms; U_C = E(1 − e^(−t/τ))
        let els = vec![el("E", Kind::Battery { emf: 10.0, r: 0.0 }, "p", "g"), el("R", Kind::Resistor { r: 1000.0 }, "p", "m"), el("C", Kind::Capacitor { c: 1e-6 }, "m", "g")];
        let r = run(&els, &[], &RunOptions { duration: 5e-3, samples: 200, ..Default::default() });
        assert!(r.ok, "{:?}", r.fatal);
        let c = idx(&els, "C");
        let mut worst = 0.0f64;
        for (s, &t) in r.t.iter().enumerate() {
            let exact = 10.0 * (1.0 - (-t / 1e-3).exp());
            worst = worst.max((r.u[s * 3 + c] - exact).abs() / 10.0);
        }
        assert!(worst <= 1e-6, "worst relative error {worst}");
        // the source delivers what the resistor turns into heat plus what the capacitor stores
        let src = -r.energy[idx(&els, "E")];
        let heat = r.energy[idx(&els, "R")];
        let stored = 0.5 * 1e-6 * r.state[c].x * r.state[c].x;
        assert!((r.energy[c] - stored).abs() <= 1e-12 * src);
        assert!((src - heat - stored).abs() <= 1e-6 * src, "balance {}", src - heat - stored);
        // E·Q = heat + stored, heat = stored for charging through a resistor (to 1e-6 at t = 5τ)
        let q = 1e-6 * r.state[c].x;
        assert!((src - 10.0 * q).abs() <= 1e-6 * src);
    }

    #[test]
    fn rl_and_discharge() {
        // RL: E = 5 V, R = 10 Ω, L = 0.1 H: τ = 10 ms, I = E/R (1 − e^(−t/τ))
        let els = vec![el("E", Kind::Battery { emf: 5.0, r: 0.0 }, "p", "g"), el("R", Kind::Resistor { r: 10.0 }, "p", "m"), el("L", Kind::Inductor { l: 0.1, r: 0.0 }, "m", "g")];
        let r = run(&els, &[], &RunOptions { duration: 0.05, samples: 100, ..Default::default() });
        let l = idx(&els, "L");
        for (s, &t) in r.t.iter().enumerate() {
            let exact = 0.5 * (1.0 - (-t / 0.01).exp());
            assert!((r.i[s * 3 + l] - exact).abs() <= 1e-6 * 0.5, "t {t}: {} vs {exact}", r.i[s * 3 + l]);
        }
        // a charged capacitor discharging through a resistor, run in four requests
        let els = vec![el("R", Kind::Resistor { r: 2000.0 }, "p", "g"), el("C", Kind::Capacitor { c: 5e-7 }, "p", "g")];
        let mut st = vec![None, Some(ElemState { x: 8.0, ..Default::default() })];
        let mut t0 = 0.0;
        for _ in 0..4 {
            let r = run(&els, &st, &RunOptions { t0, duration: 1e-3, samples: 50, ..Default::default() });
            for (s, &t) in r.t.iter().enumerate() {
                let exact = 8.0 * (-t / 1e-3).exp();
                assert!((r.u[s * 2 + 1] - exact).abs() <= 1e-6 * 8.0, "t {t}");
            }
            st = r.state.iter().map(|s| Some(*s)).collect();
            t0 += 1e-3;
        }
    }

    #[test]
    fn lc_oscillation_keeps_energy_and_period() {
        // C = 1 µF charged to 1 V, L = 10 mH: ω = 1/√(LC) = 10⁴ rad/s
        let els = vec![el("C", Kind::Capacitor { c: 1e-6 }, "p", "g"), el("L", Kind::Inductor { l: 0.01, r: 0.0 }, "p", "g")];
        let st = vec![Some(ElemState { x: 1.0, ..Default::default() }), None];
        let period = 2.0 * std::f64::consts::PI * 1e-4;
        let r = run(&els, &st, &RunOptions { duration: 5.0 * period, samples: 500, ..Default::default() });
        assert!(r.ok);
        for (s, &t) in r.t.iter().enumerate() {
            let u = r.u[s * 2];
            assert!((u - (1e4 * t).cos()).abs() <= 1e-6, "t {t}: {u} err {}", u - (1e4 * t).cos());
        }
        let e_end = stored_energy(&els, &r.state);
        assert!((e_end - 0.5e-6).abs() <= 1e-9 * 0.5e-6, "energy {e_end}");
    }

    #[test]
    fn ac_rms_phase_and_rectifier() {
        // AC 10 V amplitude, 50 Hz through 100 Ω and 31.83 µF (ωRC = 1): in the steady state the capacitor voltage
        // has amplitude 10/√2 and lags by 45°
        let f = 50.0;
        let w = 2.0 * std::f64::consts::PI * f;
        let c = 1.0 / (w * 100.0);
        let els = vec![el("S", Kind::AcSource { amp: 10.0, freq: f, phase: 0.0, r: 0.0 }, "p", "g"), el("R", Kind::Resistor { r: 100.0 }, "p", "m"), el("C", Kind::Capacitor { c }, "m", "g")];
        // start in the steady state: u_C(0) = (10/√2)·sin(−45°)
        let u0 = 10.0 / 2f64.sqrt() * (-std::f64::consts::FRAC_PI_4).sin();
        let r = run(&els, &[None, None, Some(ElemState { x: u0, ..Default::default() })], &RunOptions { duration: 0.02, samples: 400, ..Default::default() });
        for (s, &t) in r.t.iter().enumerate() {
            let exact = 10.0 / 2f64.sqrt() * (w * t - std::f64::consts::FRAC_PI_4).sin();
            assert!((r.u[s * 3 + 2] - exact).abs() <= 1e-6 * 10.0, "t {t}");
        }
        // rms of the source over one period from the samples (trapezoid on a period is exact for sin²)
        let ms: f64 = (0..400).map(|s| 0.5 * (r.u[s * 3].powi(2) + r.u[(s + 1) * 3].powi(2))).sum::<f64>() / 400.0;
        assert!((ms.sqrt() - 10.0 / 2f64.sqrt()).abs() < 1e-9);
        // half-wave rectifier: ideal diode with 0.7 V, 1 kΩ load: u_R = max(0, u − 0.7)
        let els = vec![el("S", Kind::AcSource { amp: 5.0, freq: 50.0, phase: 0.0, r: 0.0 }, "p", "g"), el("D", Kind::Diode { vf: 0.7, ron: 0.0 }, "p", "m"), el("R", Kind::Resistor { r: 1000.0 }, "m", "g")];
        let r = run(&els, &[], &RunOptions { duration: 0.04, samples: 800, ..Default::default() });
        assert!(r.ok);
        for (s, &t) in r.t.iter().enumerate() {
            let exact = (5.0 * (w * t).sin() - 0.7).max(0.0);
            assert!((r.u[s * 3 + 2] - exact).abs() <= 1e-6 * 5.0, "t {t}: {} vs {exact}", r.u[s * 3 + 2]);
        }
        let on: Vec<f64> = r.events.iter().filter(|e| e.kind == "diodeOn").map(|e| e.t).collect();
        let t_on = (0.7f64 / 5.0).asin() / w;
        assert!((on[0] - t_on).abs() < 1e-9, "on at {} vs {t_on}", on[0]);
    }

    #[test]
    fn motor_reaches_its_speed() {
        // U = 6 V, Ra = 2 Ω, k = 0.05 V·s, J = 1e-4, b = 1e-5: steady ω = U·k/(Ra·b + k²)
        let els = vec![el("E", Kind::Battery { emf: 6.0, r: 0.0 }, "p", "g"), el("M", Kind::Motor { ra: 2.0, k: 0.05, j: 1e-4, b: 1e-5, load: 0.0, drive: None }, "p", "g")];
        let r = run(&els, &[], &RunOptions { duration: 2.0, samples: 100, ..Default::default() });
        assert!(r.ok);
        let w = 6.0 * 0.05 / (2.0 * 1e-5 + 0.05 * 0.05);
        assert!((r.state[1].w - w).abs() < 1e-6 * w, "ω {} vs {w}", r.state[1].w);
        // starting current U/Ra (no back emf at rest), falling as it speeds up
        assert!((r.i[1] - 3.0).abs() < 1e-12);
        // energy: electrical input = copper heat + mechanical; mechanical = friction + rotor energy
        let e_in = r.energy[1];
        assert!(e_in > 0.0 && r.mech[1] < e_in);
        // with a load torque larger than k·U/Ra the rotor never starts
        let els2 = vec![els[0].clone(), el("M", Kind::Motor { ra: 2.0, k: 0.05, j: 1e-4, b: 1e-5, load: 0.2, drive: None }, "p", "g")];
        let r = run(&els2, &[], &RunOptions { duration: 0.5, samples: 10, ..Default::default() });
        assert!(r.state[1].w == 0.0 && r.state[1].s == 0.0);
    }

    #[test]
    fn transformer_ratio_and_dc() {
        // r1 = r2 = 0: u2 = u1·n2/n1 at every instant
        let tr = |r1: f64| Element { id: "T".into(), kind: Kind::Transformer { n1: 1000.0, n2: 100.0, lm: 10.0, r1, r2: 0.0 }, a: "p".into(), b: "g".into(), c: Some("s".into()), d: Some("t".into()) };
        let els = vec![el("S", Kind::AcSource { amp: 311.0, freq: 50.0, phase: 0.0, r: 0.0 }, "p", "g"), tr(0.0), el("R", Kind::Resistor { r: 10.0 }, "s", "t")];
        let r = run(&els, &[], &RunOptions { duration: 0.02, samples: 100, ..Default::default() });
        assert!(r.ok, "{:?}", r.fatal);
        for s in 0..r.t.len() {
            let u1 = r.u[s * 3];
            let u2 = r.xv[s * 3 + 1];
            assert!((u2 - u1 / 10.0).abs() < 1e-9 * 311.0, "{u2} vs {}", u1 / 10.0);
            // power in = power out (no losses but the magnetizing current, which takes no energy over time)
            let i2 = r.yv[s * 3 + 1];
            assert!((i2 - u2 / 10.0).abs() < 1e-9 * 3.0);
        }
        // on a battery with internal resistance the secondary voltage dies away with τ = Lm/r
        let els = vec![el("E", Kind::Battery { emf: 12.0, r: 2.0 }, "p", "g"), tr(0.0), el("R", Kind::Resistor { r: 10.0 }, "s", "t")];
        let r = run(&els, &[], &RunOptions { duration: 100.0, samples: 100, ..Default::default() });
        assert!(r.ok);
        assert!(r.xv[100 * 3 + 1].abs() < 1e-3, "secondary {}", r.xv[100 * 3 + 1]);
    }

    #[test]
    fn fuse_and_rcd_times() {
        // twice the rating: ∫(I² − Ir²)dt = 3·Ir²·t reaches Ir²·FUSE_TIME at FUSE_TIME/3
        let els = vec![el("E", Kind::Battery { emf: 4.0, r: 0.0 }, "p", "g"), el("F", Kind::Fuse { rating: 1.0 }, "p", "m"), el("R", Kind::Resistor { r: 2.0 }, "m", "g")];
        let r = run(&els, &[], &RunOptions { duration: 0.1, samples: 50, ..Default::default() });
        let ev = r.events.iter().find(|e| e.kind == "fuseBlown").expect("melts");
        assert!((ev.t - FUSE_TIME / 3.0).abs() < 1e-9, "{}", ev.t);
        assert!(r.i[50 * 3 + 2].abs() == 0.0);
        // 50 mA leaking to earth (DC): filtered residual² = I²(1 − e^(−t/τ)) reaches (30 mA)² at −τ·ln(1 − 0.36)
        let els = vec![
            el("E", Kind::Battery { emf: 100.0, r: 0.0 }, "L", "N"),
            Element { id: "Q".into(), kind: Kind::Rcd { trip: 0.03 }, a: "L".into(), b: "l".into(), c: Some("N".into()), d: Some("n".into()) },
            el("R", Kind::Resistor { r: 1000.0 }, "l", "n"),
            el("earth", Kind::Wire, "N", "gnd"),
            el("body", Kind::Resistor { r: 2000.0 }, "l", "gnd"),
        ];
        let r = run(&els, &[], &RunOptions { duration: 0.05, samples: 50, ..Default::default() });
        let ev = r.events.iter().find(|e| e.kind == "rcdTripped").expect("trips");
        let exact = -RCD_TAU * (1.0f64 - 0.36).ln();
        assert!((ev.t - exact).abs() < 1e-8, "{} vs {exact}", ev.t);
    }

    #[test]
    fn capacitor_on_ideal_source_jumps() {
        // closing an ideal 9 V source onto an empty capacitor: it charges at once; half the energy is lost
        let els = vec![el("E", Kind::Battery { emf: 9.0, r: 0.0 }, "p", "g"), el("C", Kind::Capacitor { c: 1e-3 }, "p", "g")];
        let r = run(&els, &[], &RunOptions { duration: 1e-3, samples: 10, ..Default::default() });
        assert!(r.ok, "{:?}", r.fatal);
        assert!((r.state[1].x - 9.0).abs() < 1e-6);
        assert!(r.events.iter().any(|e| e.kind == "jump"));
    }
}
#[cfg(test)]
mod lc_chunks {
    use super::*;
    fn el(id: &str, kind: Kind, a: &str, b: &str) -> Element {
        Element { id: id.into(), kind, a: a.into(), b: b.into(), c: None, d: None }
    }
    /// The LC example of the experiment as the page runs it (short requests, an inductor held only by its own branch).
    #[test]
    fn lc_example_in_short_requests() {
        let els = vec![
            el("E", Kind::Battery { emf: 5.0, r: 0.0 }, "-6,2", "-6,-2"),
            el("S1", Kind::Switch { closed: true }, "-6,2", "-3,2"),
            el("w1", Kind::Wire, "-3,2", "0,2"),
            el("C", Kind::Capacitor { c: 1e-6 }, "0,2", "0,-2"),
            el("w2", Kind::Wire, "0,-2", "-6,-2"),
            el("S2", Kind::Switch { closed: false }, "0,2", "3,2"),
            el("L", Kind::Inductor { l: 0.1, r: 0.0 }, "3,2", "3,-2"),
            el("w3", Kind::Wire, "3,-2", "0,-2"),
            el("P", Kind::Probe { channel: 1 }, "5,2", "5,-2"),
            el("w4", Kind::Wire, "3,2", "5,2"),
            el("w5", Kind::Wire, "3,-2", "5,-2"),
        ];
        let r = run(&els, &[], &RunOptions { duration: 3.2e-5, samples: 4, ..Default::default() });
        assert!(r.ok, "{:?}", r.fatal);
        // the capacitor jumps to the battery voltage, half of the energy E·Q is lost in the jump
        assert!((r.state[3].x - 5.0).abs() < 1e-9);
        let jump: f64 = r.events.iter().filter(|e| e.kind == "jump").map(|e| e.energy).sum();
        assert!((jump - 0.5 * 1e-6 * 25.0).abs() < 1e-12);
        // then closing S2 and opening S1: an oscillation of period 2π√(LC) from the next request on
        let mut els2 = els.clone();
        els2[1].kind = Kind::Switch { closed: false };
        els2[5].kind = Kind::Switch { closed: true };
        let st: Vec<Option<ElemState>> = r.state.iter().map(|s| Some(*s)).collect();
        let period = 2.0 * std::f64::consts::PI * (0.1f64 * 1e-6).sqrt();
        let r2 = run(&els2, &st, &RunOptions { duration: period, samples: 200, ..Default::default() });
        assert!(r2.ok, "{:?}", r2.fatal);
        let w = 2.0 * std::f64::consts::PI / period;
        for (s, &t) in r2.t.iter().enumerate() {
            assert!((r2.u[s * els.len() + 3] - 5.0 * (w * t).cos()).abs() < 1e-5 * 5.0, "t {t}");
        }
    }
}
