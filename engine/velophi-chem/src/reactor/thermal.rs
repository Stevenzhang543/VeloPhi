//! Lumped thermal hydraulics of the reactor workshop (26.64, D277): one fuel temperature, one coolant temperature,
//! one moderator temperature and the cold-leg temperature of a simple loop — pump, heat exchanger, turbine and
//! generator. Powers and temperatures only; no pressures, no two-phase flow. A teaching closure.
//!
//!   C_f·dT_f/dt  = (1 − f_m)·P − G_fc·(T_f − T_c)
//!   C_c·dT_c/dt  = G_fc·(T_f − T_c) + G_mc·(T_m − T_c) − W·(T_out − T_in) − G_amb·(T_c − T_amb)
//!   C_m·dT_m/dt  = f_m·P − G_mc·(T_m − T_c)
//!   τ_loop·dT_in/dt = T_ret − T_in,   T_out = 2T_c − T_in,   T_ret = T_out − ε·(T_out − T_sink)
//!
//! P is the thermal power: the prompt share of the fission power plus the decay heat. W = w·W_nom is the heat
//! capacity rate of the coolant with the flow fraction w (the pump setting, never below the natural circulation
//! w_nat); ε = 1 − exp(−NTU/w) is the effectiveness of the heat exchanger (0 when it is isolated). The conductances
//! and heat capacities follow from the design point of the document: at nominal power and full flow the fuel is
//! `dT_fuel` above the coolant, the coolant heats up by `dT_core`, and the time constants are those given.
//!
//! Decay heat: exponential groups fitted to P/P₀ = 0.066·t^−0.2 (data file); each group is fed in proportion to the
//! fission power and decays with its constant, so the operating history is carried by the state.
//!
//! Boiling: the void fraction of the coolant rises linearly from 0 at T_out = T_sat to `void_max` at T_sat + dT_boil.

use serde_json::{json, Value};
use velophi_core::dmath::exp;
use velophi_core::transport::{dnum, jnum};

/// The design point and the loop of a reactor document (`thermal` and `loop`).
#[derive(Clone, Debug, PartialEq)]
pub struct Plant {
    /// Nominal thermal power (W): the power n = 1 stands for.
    pub power: f64,
    /// Fuel minus coolant temperature at nominal power (K).
    pub dt_fuel: f64,
    /// Coolant temperature rise across the core at nominal power and full flow (K).
    pub dt_core: f64,
    /// Moderator minus coolant temperature at nominal power, for a moderator that is not the coolant (K).
    pub dt_moderator: f64,
    /// Cold-leg temperature at the design point (K).
    pub t_in: f64,
    /// Time constants (s): fuel, coolant in the core, moderator, loop transit.
    pub tau_fuel: f64,
    pub tau_coolant: f64,
    pub tau_moderator: f64,
    pub tau_loop: f64,
    /// Share of the power deposited in the moderator.
    pub moderator_share: f64,
    /// Heat exchanger: number of transfer units at full flow and the temperature of its cold side (K).
    pub ntu: f64,
    pub t_sink: f64,
    /// Saturation temperature of the coolant (K), width of the boiling ramp (K) and the largest void fraction.
    pub t_sat: f64,
    pub dt_boil: f64,
    pub void_max: f64,
    /// Surroundings (K) and the passive heat loss to them at the design point, as a fraction of the nominal power.
    pub t_ambient: f64,
    pub ambient_loss: f64,
    /// Flow fraction of natural circulation.
    pub natural_flow: f64,
    /// Turbine: fraction of the Carnot efficiency reached, condenser temperature (K).
    pub carnot_share: f64,
    pub t_condenser: f64,
}

impl Default for Plant {
    fn default() -> Plant {
        Plant {
            power: 1.0e6,
            dt_fuel: 300.0,
            dt_core: 30.0,
            dt_moderator: 40.0,
            t_in: 520.0,
            tau_fuel: 5.0,
            tau_coolant: 2.0,
            tau_moderator: 600.0,
            tau_loop: 10.0,
            moderator_share: 0.04,
            ntu: 1.3862943611198906,
            t_sink: f64::NAN,
            t_sat: 618.0,
            dt_boil: 30.0,
            void_max: 0.8,
            t_ambient: 293.0,
            ambient_loss: 0.002,
            natural_flow: 0.03,
            carnot_share: 0.6,
            t_condenser: 310.0,
        }
    }
}

impl Plant {
    /// Read `thermal` of a document over the defaults (`start`).
    pub fn from_json(v: Option<&Value>, start: Plant) -> Plant {
        let mut p = start;
        if let Some(v) = v.filter(|v| v.is_object()) {
            let set = |key: &str, field: &mut f64, lo: f64, hi: f64| {
                if let Some(x) = v.get(key).filter(|x| !x.is_null()).map(dnum).filter(|x| x.is_finite()) {
                    *field = x.clamp(lo, hi);
                }
            };
            set("power_W", &mut p.power, 1e-3, 1e11);
            set("dT_fuel", &mut p.dt_fuel, 1.0, 3000.0);
            set("dT_core", &mut p.dt_core, 0.1, 1000.0);
            set("dT_moderator", &mut p.dt_moderator, 0.1, 1000.0);
            set("T_in", &mut p.t_in, 250.0, 1500.0);
            set("tau_fuel", &mut p.tau_fuel, 0.05, 1e5);
            set("tau_coolant", &mut p.tau_coolant, 0.05, 1e5);
            set("tau_moderator", &mut p.tau_moderator, 0.05, 1e7);
            set("tau_loop", &mut p.tau_loop, 0.05, 1e5);
            set("moderatorShare", &mut p.moderator_share, 0.0, 0.5);
            set("NTU", &mut p.ntu, 0.01, 20.0);
            set("T_sink", &mut p.t_sink, 250.0, 1500.0);
            set("T_sat", &mut p.t_sat, 250.0, 3000.0);
            set("dT_boil", &mut p.dt_boil, 1.0, 500.0);
            set("voidMax", &mut p.void_max, 0.0, 0.95);
            set("T_ambient", &mut p.t_ambient, 200.0, 400.0);
            set("ambientLoss", &mut p.ambient_loss, 0.0, 1.0);
            set("naturalFlow", &mut p.natural_flow, 1e-4, 1.0);
            set("carnotShare", &mut p.carnot_share, 0.0, 1.0);
            set("T_condenser", &mut p.t_condenser, 250.0, 600.0);
        }
        if p.t_sink.is_nan() {
            // the cold side that returns the coolant at T_in at the design point
            let eff = 1.0 - exp(-p.ntu);
            p.t_sink = p.t_in + p.dt_core - p.dt_core / eff;
        }
        p
    }

    pub fn to_json(&self) -> Value {
        json!({
            "power_W": jnum(self.power), "dT_fuel": jnum(self.dt_fuel), "dT_core": jnum(self.dt_core), "dT_moderator": jnum(self.dt_moderator), "T_in": jnum(self.t_in),
            "tau_fuel": jnum(self.tau_fuel), "tau_coolant": jnum(self.tau_coolant), "tau_moderator": jnum(self.tau_moderator), "tau_loop": jnum(self.tau_loop),
            "moderatorShare": jnum(self.moderator_share), "NTU": jnum(self.ntu), "T_sink": jnum(self.t_sink), "T_sat": jnum(self.t_sat), "dT_boil": jnum(self.dt_boil), "voidMax": jnum(self.void_max),
            "T_ambient": jnum(self.t_ambient), "ambientLoss": jnum(self.ambient_loss), "naturalFlow": jnum(self.natural_flow), "carnotShare": jnum(self.carnot_share), "T_condenser": jnum(self.t_condenser),
        })
    }

    fn g_fuel(&self) -> f64 {
        self.power / self.dt_fuel
    }
    fn w_nominal(&self) -> f64 {
        self.power / self.dt_core
    }
    fn g_moderator(&self) -> f64 {
        (self.moderator_share * self.power / self.dt_moderator).max(1e-9 * self.power)
    }
    fn g_ambient(&self) -> f64 {
        let rise = (self.t_in + 0.5 * self.dt_core - self.t_ambient).max(1.0);
        self.ambient_loss * self.power / rise
    }
}

/// What the operator sets on the loop.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Loop {
    /// Pump setting 0 … 1.
    pub pump: f64,
    pub exchanger: bool,
    pub turbine: bool,
}

/// Temperatures of the lumped model (K).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Temperatures {
    pub fuel: f64,
    pub coolant: f64,
    pub moderator: f64,
    pub inlet: f64,
}

/// Flows of heat at a state (W) and what follows from them.
#[derive(Clone, Copy, Debug)]
pub struct Heat {
    pub outlet: f64,
    pub flow: f64,
    /// Heat carried out of the core by the coolant, heat given to the secondary side, electric power.
    pub removed: f64,
    pub to_secondary: f64,
    pub electric: f64,
    pub efficiency: f64,
    pub void: f64,
}

impl Plant {
    pub fn flow(&self, l: &Loop) -> f64 {
        l.pump.clamp(0.0, 1.0).max(self.natural_flow)
    }

    fn effectiveness(&self, l: &Loop, flow: f64) -> f64 {
        if l.exchanger {
            1.0 - exp(-self.ntu / flow)
        } else {
            0.0
        }
    }

    /// Void fraction of the coolant for an outlet temperature.
    pub fn void(&self, outlet: f64) -> f64 {
        ((outlet - self.t_sat) / self.dt_boil).clamp(0.0, 1.0) * self.void_max
    }

    pub fn heat(&self, t: &Temperatures, l: &Loop) -> Heat {
        let flow = self.flow(l);
        let outlet = 2.0 * t.coolant - t.inlet;
        let w = flow * self.w_nominal();
        let eff = self.effectiveness(l, flow);
        let to_secondary = w * eff * (outlet - self.t_sink);
        let efficiency = if l.turbine && l.exchanger && self.t_sink > self.t_condenser { self.carnot_share * (1.0 - self.t_condenser / self.t_sink) } else { 0.0 };
        Heat { outlet, flow, removed: w * (outlet - t.inlet), to_secondary, electric: if to_secondary > 0.0 { efficiency * to_secondary } else { 0.0 }, efficiency, void: self.void(outlet) }
    }

    /// Time derivatives of the temperatures for the thermal power `p` (W). `separate`: the moderator has a
    /// temperature of its own (it is not the coolant); otherwise its share of the power goes to the coolant and
    /// T_m follows T_c.
    pub fn rates(&self, t: &Temperatures, l: &Loop, p: f64, separate: bool) -> Temperatures {
        let (gf, gm, ga) = (self.g_fuel(), self.g_moderator(), self.g_ambient());
        let h = self.heat(t, l);
        let w = h.flow * self.w_nominal();
        let eff = self.effectiveness(l, h.flow);
        let returned = h.outlet - eff * (h.outlet - self.t_sink);
        let cf = self.tau_fuel * gf;
        let cc = self.tau_coolant * 2.0 * self.w_nominal();
        let q_fc = gf * (t.fuel - t.coolant);
        let (q_mc, d_moderator, to_fuel) = if separate {
            let q = gm * (t.moderator - t.coolant);
            (q, (self.moderator_share * p - q) / (self.tau_moderator * gm), (1.0 - self.moderator_share) * p)
        } else {
            // the moderator is the coolant: one temperature
            (0.0, f64::NAN, p)
        };
        let d_coolant = (q_fc + q_mc - w * (h.outlet - t.inlet) - ga * (t.coolant - self.t_ambient)) / cc;
        Temperatures { fuel: (to_fuel - q_fc) / cf, coolant: d_coolant, moderator: if separate { d_moderator } else { d_coolant }, inlet: (returned - t.inlet) / self.tau_loop }
    }

    /// The steady temperatures at the thermal power `p` (the linear balance solved in closed form).
    pub fn steady(&self, l: &Loop, p: f64, separate: bool) -> Temperatures {
        let flow = self.flow(l);
        let w = flow * self.w_nominal();
        let eff = self.effectiveness(l, flow);
        let ga = self.g_ambient();
        // unknowns: T_c and the rise r = T_out − T_in. Loop: r = ε·(T_out − T_sink) with T_out = T_c + r/2.
        // Core: P = W·r + G_amb·(T_c − T_amb).
        let coolant = if eff > 0.0 {
            // r = ε(T_c − T_sink)/(1 − ε/2);  P = W·ε/(1 − ε/2)·(T_c − T_sink) + G_amb·(T_c − T_amb)
            let a = w * eff / (1.0 - 0.5 * eff);
            (p + a * self.t_sink + ga * self.t_ambient) / (a + ga)
        } else {
            self.t_ambient + p / ga.max(1e-300)
        };
        let rise = if eff > 0.0 { eff * (coolant - self.t_sink) / (1.0 - 0.5 * eff) } else { 0.0 };
        let to_fuel = if separate { (1.0 - self.moderator_share) * p } else { p };
        Temperatures {
            fuel: coolant + to_fuel / self.g_fuel(),
            coolant,
            moderator: if separate { coolant + self.moderator_share * p / self.g_moderator() } else { coolant },
            inlet: coolant - 0.5 * rise,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn design_point_is_steady() {
        let p = Plant::from_json(None, Plant { ambient_loss: 0.0, ..Plant::default() });
        let l = Loop { pump: 1.0, exchanger: true, turbine: true };
        let t = p.steady(&l, p.power, false);
        assert!((t.inlet - p.t_in).abs() < 1e-9, "{t:?}");
        assert!((t.coolant - (p.t_in + 0.5 * p.dt_core)).abs() < 1e-9);
        assert!((t.fuel - t.coolant - p.dt_fuel).abs() < 1e-9);
        let r = p.rates(&t, &l, p.power, false);
        assert!(r.fuel.abs() < 1e-9 && r.coolant.abs() < 1e-9 && r.inlet.abs() < 1e-9, "{r:?}");
        let h = p.heat(&t, &l);
        assert!((h.removed - p.power).abs() < 1e-6 * p.power && (h.to_secondary - p.power).abs() < 1e-6 * p.power);
        assert!(h.electric > 0.2 * p.power && h.electric < 0.4 * p.power);
        // with a moderator of its own
        let t = p.steady(&l, p.power, true);
        let r = p.rates(&t, &l, p.power, true);
        assert!(r.fuel.abs() < 1e-9 && r.coolant.abs() < 1e-9 && r.moderator.abs() < 1e-12 && r.inlet.abs() < 1e-9, "{r:?}");
        assert!((t.moderator - t.coolant - p.dt_moderator).abs() < 1e-9);
    }
}
