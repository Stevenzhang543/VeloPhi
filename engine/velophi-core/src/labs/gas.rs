//! Ideal gas in a cylinder (26.55, D95): quasi-static processes and cycles in closed form.
//!
//! pV = nRT with a constant heat capacity C_V = R/(γ − 1). Work W is the work done *by* the gas, Q the heat taken
//! in, ΔU = nC_VΔT; every process satisfies Q = ΔU + W (the first law) by construction, and the work equals ∫p dV
//! along the curve (checked numerically in the tests).

use crate::dmath::{log, pow};

/// Molar gas constant (J/(mol·K)), exact since 2019.
pub const R: f64 = 8.314462618;

/// State of the gas.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct State {
    pub p: f64,
    pub v: f64,
    pub t: f64,
}

/// Kind of a quasi-static process.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Isothermal,
    Isobaric,
    Isochoric,
    Adiabatic,
}

impl Kind {
    pub fn name(self) -> &'static str {
        match self {
            Kind::Isothermal => "isothermal",
            Kind::Isobaric => "isobaric",
            Kind::Isochoric => "isochoric",
            Kind::Adiabatic => "adiabatic",
        }
    }
}

/// A process with its energies.
#[derive(Clone, Debug)]
pub struct Process {
    pub kind: Kind,
    pub from: State,
    pub to: State,
    pub work: f64,
    pub heat: f64,
    pub du: f64,
}

/// The gas: amount n (mol) and γ.
#[derive(Clone, Copy, Debug)]
pub struct Gas {
    pub n: f64,
    pub gamma: f64,
}

impl Gas {
    pub fn cv(&self) -> f64 {
        R / (self.gamma - 1.0)
    }
    pub fn state_pv(&self, p: f64, v: f64) -> State {
        State { p, v, t: p * v / (self.n * R) }
    }
    pub fn state_vt(&self, v: f64, t: f64) -> State {
        State { p: self.n * R * t / v, v, t }
    }
    pub fn state_pt(&self, p: f64, t: f64) -> State {
        State { p, v: self.n * R * t / p, t }
    }

    /// End state of a process from `a` to the target: the new volume (isothermal, isobaric, adiabatic) or the new
    /// temperature (isochoric).
    pub fn end(&self, kind: Kind, a: State, target: f64) -> State {
        match kind {
            Kind::Isothermal => self.state_vt(target, a.t),
            Kind::Isobaric => self.state_pv(a.p, target),
            Kind::Isochoric => self.state_vt(a.v, target),
            Kind::Adiabatic => self.state_pv(a.p * pow(a.v / target, self.gamma), target),
        }
    }

    /// Energies of a process from a to b (b must lie on the curve of the process through a).
    pub fn process(&self, kind: Kind, a: State, b: State) -> Process {
        let du = self.n * self.cv() * (b.t - a.t);
        let work = match kind {
            Kind::Isothermal => self.n * R * a.t * log(b.v / a.v),
            Kind::Isobaric => a.p * (b.v - a.v),
            Kind::Isochoric => 0.0,
            Kind::Adiabatic => (a.p * a.v - b.p * b.v) / (self.gamma - 1.0),
        };
        let heat = match kind {
            Kind::Adiabatic => 0.0,
            _ => du + work,
        };
        Process { kind, from: a, to: b, work, heat, du }
    }

    /// Pressure on the curve of a process through `a` at volume v.
    pub fn pressure_on(&self, kind: Kind, a: State, v: f64) -> f64 {
        match kind {
            Kind::Isothermal => a.p * a.v / v,
            Kind::Isobaric => a.p,
            Kind::Isochoric => a.p,
            Kind::Adiabatic => a.p * pow(a.v / v, self.gamma),
        }
    }

    /// Points (V, p) of the process curve (an isochoric process is a vertical segment).
    pub fn curve(&self, pr: &Process, samples: usize) -> Vec<(f64, f64)> {
        let m = samples.max(2);
        (0..m)
            .map(|k| {
                let f = k as f64 / (m - 1) as f64;
                if pr.kind == Kind::Isochoric {
                    (pr.from.v, pr.from.p + (pr.to.p - pr.from.p) * f)
                } else {
                    let v = pr.from.v + (pr.to.v - pr.from.v) * f;
                    (v, self.pressure_on(pr.kind, pr.from, v))
                }
            })
            .collect()
    }
}

/// A cycle: its processes, the heat taken in (Q > 0 parts) and given out, the net work and the efficiency.
#[derive(Clone, Debug)]
pub struct Cycle {
    pub processes: Vec<Process>,
    pub q_in: f64,
    pub q_out: f64,
    pub work: f64,
    pub efficiency: f64,
    /// Textbook efficiency of the ideal cycle (Carnot 1 − T_c/T_h, Otto 1 − r^(1−γ)).
    pub theory: f64,
}

fn close(processes: Vec<Process>, theory: f64) -> Cycle {
    let q_in: f64 = processes.iter().map(|p| p.heat.max(0.0)).sum();
    let q_out: f64 = processes.iter().map(|p| (-p.heat).max(0.0)).sum();
    let work: f64 = processes.iter().map(|p| p.work).sum();
    Cycle { efficiency: if q_in > 0.0 { work / q_in } else { 0.0 }, processes, q_in, q_out, work, theory }
}

/// Carnot cycle between T_h and T_c: isothermal expansion V1 → V2 at T_h, adiabatic to T_c, isothermal
/// compression, adiabatic back.
pub fn carnot(gas: Gas, t_hot: f64, t_cold: f64, v1: f64, v2: f64) -> Cycle {
    let a = gas.state_vt(v1, t_hot);
    let b = gas.state_vt(v2, t_hot);
    // adiabatic: T V^(γ−1) = const
    let k = 1.0 / (gas.gamma - 1.0);
    let c = gas.state_vt(v2 * pow(t_hot / t_cold, k), t_cold);
    let d = gas.state_vt(v1 * pow(t_hot / t_cold, k), t_cold);
    let ps = vec![gas.process(Kind::Isothermal, a, b), gas.process(Kind::Adiabatic, b, c), gas.process(Kind::Isothermal, c, d), gas.process(Kind::Adiabatic, d, a)];
    close(ps, 1.0 - t_cold / t_hot)
}

/// Otto cycle: adiabatic compression V1 → V1/r from T1, isochoric heating to T3, adiabatic expansion, isochoric
/// cooling.
pub fn otto(gas: Gas, t1: f64, v1: f64, r: f64, t3: f64) -> Cycle {
    let a = gas.state_vt(v1, t1);
    let b = gas.end(Kind::Adiabatic, a, v1 / r);
    let c = gas.state_vt(v1 / r, t3);
    let d = gas.end(Kind::Adiabatic, c, v1);
    let ps = vec![gas.process(Kind::Adiabatic, a, b), gas.process(Kind::Isochoric, b, c), gas.process(Kind::Adiabatic, c, d), gas.process(Kind::Isochoric, d, a)];
    close(ps, 1.0 - pow(r, 1.0 - gas.gamma))
}

/// A rectangle on the p–V diagram (two isobars, two isochores), the textbook "work is the enclosed area" cycle.
pub fn rectangle(gas: Gas, p1: f64, p2: f64, v1: f64, v2: f64) -> Cycle {
    let a = gas.state_pv(p1, v1);
    let b = gas.state_pv(p1, v2);
    let c = gas.state_pv(p2, v2);
    let d = gas.state_pv(p2, v1);
    let ps = vec![gas.process(Kind::Isobaric, a, b), gas.process(Kind::Isochoric, b, c), gas.process(Kind::Isobaric, c, d), gas.process(Kind::Isochoric, d, a)];
    let w = (p1 - p2) * (v2 - v1);
    let qin: f64 = ps.iter().map(|p| p.heat.max(0.0)).sum();
    close(ps, if qin > 0.0 { w / qin } else { 0.0 })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// ∫p dV along the process curve by Simpson's rule.
    fn integral(gas: &Gas, pr: &Process) -> f64 {
        if pr.kind == Kind::Isochoric {
            return 0.0;
        }
        let m = 20000;
        let h = (pr.to.v - pr.from.v) / m as f64;
        let mut s = 0.0;
        for k in 0..=m {
            let v = pr.from.v + h * k as f64;
            let w = if k == 0 || k == m { 1.0 } else if k % 2 == 1 { 4.0 } else { 2.0 };
            s += w * gas.pressure_on(pr.kind, pr.from, v);
        }
        s * h / 3.0
    }

    #[test]
    fn processes_satisfy_the_first_law_and_the_integral() {
        let gas = Gas { n: 1.0, gamma: 5.0 / 3.0 };
        let a = gas.state_pt(101325.0, 300.0);
        for (kind, target) in [(Kind::Isothermal, 2.0 * a.v), (Kind::Isobaric, 1.5 * a.v), (Kind::Isochoric, 450.0), (Kind::Adiabatic, 2.0 * a.v)] {
            let b = gas.end(kind, a, target);
            let pr = gas.process(kind, a, b);
            assert!((pr.heat - pr.du - pr.work).abs() <= 1e-9 * pr.work.abs().max(pr.du.abs()));
            let w = integral(&gas, &pr);
            assert!((w - pr.work).abs() <= 1e-10 * pr.work.abs().max(1.0), "{kind:?}: {w} vs {}", pr.work);
            assert!((b.p * b.v - gas.n * R * b.t).abs() <= 1e-9 * b.p * b.v);
        }
        // adiabatic: p V^γ constant, T V^(γ−1) constant
        let b = gas.end(Kind::Adiabatic, a, 3.0 * a.v);
        assert!((b.p * pow(b.v, gas.gamma) - a.p * pow(a.v, gas.gamma)).abs() <= 1e-12 * a.p * pow(a.v, gas.gamma));
    }

    #[test]
    fn cycle_efficiencies() {
        let gas = Gas { n: 0.5, gamma: 1.4 };
        let c = carnot(gas, 600.0, 300.0, 1e-3, 3e-3);
        assert!((c.efficiency - 0.5).abs() < 1e-12, "{}", c.efficiency);
        assert!((c.work - (c.q_in - c.q_out)).abs() < 1e-9 * c.q_in);
        let o = otto(gas, 300.0, 1e-3, 8.0, 1800.0);
        assert!((o.efficiency - o.theory).abs() < 1e-12, "{} vs {}", o.efficiency, o.theory);
        assert!((o.theory - (1.0 - pow(8.0, -0.4))).abs() < 1e-15);
        let r = rectangle(gas, 2e5, 1e5, 1e-3, 3e-3);
        assert!((r.work - 200.0).abs() < 1e-9);
    }
}
