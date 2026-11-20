//! The reactor in time (26.64, D277): point kinetics, the lumped thermal model, the poisons and the decay heat,
//! integrated together; the reactivity comes from the static solution of the layout (quasi-static).
//!
//! **Reactivity.** ρ(t) = ρ_static + Σ α·(x − x_base) + shim. ρ_static = 1 − 1/k_eff of the layout with the rods where
//! they are, solved at a base state of the core; the α are the adjoint-weighted first-order effects of the fuel
//! temperature, the moderator and coolant temperatures and void, xenon and samarium around that base state. When
//! the feedback has moved the reactivity by more than `REBASE` (a fifth of β), the layout is solved again at the
//! current state, so the linearisation never reaches far (far below critical the limit widens to a tenth of the reactivity). While rods move, the layout is solved again at every
//! `ROD_STEP` of travel and ρ_static is interpolated linearly in between. `shim` is a uniform reactivity bias under
//! the operator's control (the soluble absorber of a power reactor), not resolved in space.
//!
//! **Protection.** With `protection` in the document, the reactor trips when the power exceeds its limit, when the
//! period is shorter than its limit while the power rises, or when the peak fuel temperature exceeds its limit:
//! all rods drop in `SCRAM_TIME`.
//!
//! **Outcomes.** `coreDamage`: the peak fuel temperature exceeded the damage temperature of the fuel — the
//! simulation ends and says why. `validity`: the reactivity came within a tenth of β of prompt critical — the
//! simulation stops, because the model does not describe what follows (D278); nothing is extrapolated.
//!
//! The state is plain data: it goes out with every result and comes back with the next request, like the state of
//! `circuitRun`. Nothing is kept between calls.

use serde_json::{json, Value};
use velophi_core::message::{Message, SimResult};
use velophi_core::sha256::Sha256;
use velophi_core::transport::{dnum, jnum};

use super::kinetics::{self, End, Kinetics, Options};
use super::layout::{summary, summary_key, Doc, Summary};
use super::materials::{Conditions, PoisonData};
use super::poisons::Poisons;
use super::thermal::{Loop, Temperatures};

/// The layout is solved again when the feedback has moved the reactivity by this fraction of β.
pub const REBASE: f64 = 0.2;
/// … and at every such step of rod travel.
pub const ROD_STEP: f64 = 0.1;
/// Time of a full rod drop (s) and the default speed of a driven rod (fraction of the travel per second).
pub const SCRAM_TIME: f64 = 2.0;
pub const ROD_SPEED: f64 = 0.005;
/// Neutrons per fission, for the strength of the source relative to the fission rate.
const NU: f64 = 2.43;

fn bad(what: impl Into<String>) -> Message {
    Message::new("err.internal").text("message", format!("reactor: {}", what.into()))
}

/// Six-group data without a data file (the values of the data file, docs/research/2664/chemistry.md §5).
pub const BETA: [f64; 6] = [2.584e-4, 1.520e-3, 1.391e-3, 3.070e-3, 1.102e-3, 2.584e-4];
// 0.318 /s is the decay constant of the fourth group, not an approximation of 1/π
#[allow(clippy::approx_constant)]
pub const LAMBDA: [f64; 6] = [0.013, 0.032, 0.119, 0.318, 1.403, 3.929];

pub fn kinetics_of(doc: &Doc, generation: f64) -> Kinetics {
    match doc.lib() {
        Some(l) => Kinetics { beta: l.beta, lambda: l.lambda, generation },
        None => Kinetics { beta: BETA, lambda: LAMBDA, generation },
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Trip {
    /// "power", "period", "fuelTemperature" or "manual".
    pub reason: String,
    pub t: f64,
    pub value: f64,
    pub limit: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Ended {
    /// "coreDamage" or "validity".
    pub reason: String,
    pub t: f64,
    pub value: f64,
    pub limit: f64,
}

/// Marks along the way, for the checks of the tasks.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Stats {
    pub max_power: f64,
    pub max_fuel_t: f64,
    /// Time and xenon concentration when the rods last dropped (NaN: never).
    pub t_scram: f64,
    pub xenon_at_scram: f64,
    /// Time and power when the cooling was last lost — pump stopped or exchanger isolated (NaN: never or restored).
    pub t_cooling_lost: f64,
    pub power_at_cooling_lost: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct State {
    pub t: f64,
    /// Fission power relative to nominal.
    pub n: f64,
    pub c: [f64; 6],
    pub temps: Temperatures,
    pub poisons: Poisons,
    /// Decay-heat groups (fractions of the nominal power).
    pub decay: Vec<f64>,
    /// Rod insertions now and where they are driven to (one per rod of the document, in the order of the cells).
    pub rods: Vec<f64>,
    pub targets: Vec<f64>,
    pub rod_speed: f64,
    pub loop_: Loop,
    pub shim: f64,
    pub scram: bool,
    /// Thermal and electric energy since the start (J).
    pub energy: f64,
    pub electric: f64,
    pub trip: Option<Trip>,
    pub ended: Option<Ended>,
    /// Step size the integrator tries next (s).
    pub step: f64,
    pub stats: Stats,
    pub core: Option<Summary>,
}

/// What the request changes before the time advances.
#[derive(Clone, Debug, Default)]
pub struct Controls {
    /// Targets by rod (index in the order of the cells) and for all rods.
    pub rods: Vec<(usize, f64)>,
    pub all_rods: Option<f64>,
    pub rod_speed: Option<f64>,
    pub pump: Option<f64>,
    pub exchanger: Option<bool>,
    pub turbine: Option<bool>,
    pub shim: Option<f64>,
    pub scram: bool,
    pub reset_trip: bool,
}

impl Controls {
    pub fn from_json(v: Option<&Value>, doc: &Doc) -> SimResult<Controls> {
        let mut c = Controls::default();
        let Some(v) = v.filter(|v| v.is_object()) else {
            return Ok(c);
        };
        let num = |k: &str| v.get(k).filter(|x| !x.is_null()).map(dnum).filter(|x| x.is_finite());
        match v.get("rods") {
            Some(Value::Object(map)) => {
                for (cell, target) in map {
                    let index = cell_index(cell, doc).and_then(|c| doc.rods.iter().position(|r| r.cell == c)).ok_or_else(|| bad(format!("controls.rods: no rod at '{cell}'")))?;
                    c.rods.push((index, dnum(target).clamp(0.0, 1.0)));
                }
            }
            Some(x) if !x.is_null() => c.all_rods = Some(dnum(x).clamp(0.0, 1.0)),
            _ => {}
        }
        c.rod_speed = num("rodSpeed").map(|s| s.clamp(1e-7, 1.0));
        c.pump = num("pump").map(|p| p.clamp(0.0, 1.0));
        c.exchanger = v.get("exchanger").and_then(|x| x.as_bool());
        c.turbine = v.get("turbine").and_then(|x| x.as_bool());
        c.shim = num("shim").map(|s| s.clamp(-1.0, 1.0));
        c.scram = v.get("scram").and_then(|x| x.as_bool()).unwrap_or(false);
        c.reset_trip = v.get("resetTrip").and_then(|x| x.as_bool()).unwrap_or(false);
        Ok(c)
    }
}

fn cell_index(text: &str, doc: &Doc) -> Option<usize> {
    let mut it = text.split(',');
    let x: usize = it.next()?.trim().parse().ok()?;
    let y: usize = it.next()?.trim().parse().ok()?;
    if x >= doc.nx || y >= doc.ny {
        return None;
    }
    Some(y * doc.nx + x)
}

/// The constants of the dynamic model for a document.
pub struct Model<'a> {
    pub doc: &'a Doc,
    pub poison: PoisonData,
    /// Decay-heat groups: (decay constant, equilibrium share).
    pub decay: Vec<(f64, f64)>,
    pub decay_share: f64,
    /// The moderator has a temperature of its own.
    pub separate: bool,
    /// Fission-rate density of the fuel cells at nominal power (10²⁴ cm⁻³ s⁻¹).
    pub fission_nominal: f64,
    /// Fission rate at nominal power (1/s).
    pub fissions_per_second: f64,
    pub damage: f64,
}

impl<'a> Model<'a> {
    pub fn new(doc: &'a Doc) -> Model<'a> {
        let (poison, decay, energy) = match doc.lib() {
            Some(l) => (l.poisons, l.decay_heat.clone(), l.fission_energy),
            None => (PoisonData::default(), Vec::new(), 3.204e-11),
        };
        let fissions = doc.plant.power / energy;
        Model {
            doc,
            poison,
            decay_share: decay.iter().map(|d| d.1).sum(),
            decay,
            separate: !doc.moderator_is_coolant(),
            fission_nominal: fissions / doc.fuel_volume() * 1e-24,
            fissions_per_second: fissions,
            damage: doc.damage_limit(),
        }
    }

    /// The state of the core the cross-sections see.
    pub fn conditions(&self, t: &Temperatures, p: &Poisons) -> Conditions {
        let outlet = 2.0 * t.coolant - t.inlet;
        let void = self.doc.plant.void(outlet);
        if self.separate {
            Conditions { fuel_t: t.fuel, moderator_t: t.moderator, coolant_t: t.coolant, moderator_void: 0.0, coolant_void: void, xenon: p.xenon, samarium: p.samarium }
        } else {
            Conditions { fuel_t: t.fuel, moderator_t: t.coolant, coolant_t: t.coolant, moderator_void: void, coolant_void: void, xenon: p.xenon, samarium: p.samarium }
        }
    }

    /// Thermal power (W) for a fission power n and the decay-heat groups.
    pub fn thermal_power(&self, n: f64, decay: &[f64]) -> f64 {
        let mut p = (1.0 - self.decay_share) * n.max(0.0);
        for h in decay {
            p += *h;
        }
        p * self.doc.plant.power
    }

    /// Peak fuel temperature: the hot cell's fuel is `peak` times as far above the coolant as the average.
    pub fn peak_fuel(&self, t: &Temperatures, peak: f64) -> f64 {
        t.coolant + peak.max(1.0) * (t.fuel - t.coolant)
    }

    /// Source term q of the kinetics equation: source neutrons per second, weighted by their importance, relative
    /// to the neutron production at nominal power.
    pub fn source(&self, core: &Summary) -> f64 {
        if self.doc.source > 0.0 {
            self.doc.source * core.source_weight / (core.generation * NU * self.fissions_per_second)
        } else {
            0.0
        }
    }
}

// layout of the vector of unknowns
const N: usize = 0;
const C: usize = 1;
const TF: usize = 7;
const TC: usize = 8;
const TM: usize = 9;
const TI: usize = 10;
const PI: usize = 11;
const PX: usize = 12;
const PP: usize = 13;
const PS: usize = 14;
const DH: usize = 15;

/// Quantities of one instant, for the series and the checks.
#[derive(Clone, Copy, Debug, Default)]
pub struct Sample {
    pub t: f64,
    pub n: f64,
    pub rho: f64,
    pub rho_static: f64,
    pub rho_feedback: f64,
    /// n / (dn/dt) (s); ±∞ at steady power.
    pub period: f64,
    pub fuel: f64,
    pub fuel_peak: f64,
    pub coolant: f64,
    pub moderator: f64,
    pub inlet: f64,
    pub outlet: f64,
    pub void: f64,
    pub iodine: f64,
    pub xenon: f64,
    pub promethium: f64,
    pub samarium: f64,
    pub decay_heat: f64,
    pub thermal: f64,
    pub electric: f64,
    pub flow: f64,
    pub rods: f64,
    pub precursors: f64,
}

pub const SERIES: [&str; 22] = ["n", "rho", "rhoStatic", "rhoFeedback", "period", "fuelT", "fuelPeakT", "coolantT", "moderatorT", "inletT", "outletT", "void", "iodine", "xenon", "promethium", "samarium", "decayHeat", "thermal_W", "electric_W", "flow", "rods", "precursors"];

impl Sample {
    pub fn values(&self) -> [f64; 22] {
        [self.n, self.rho, self.rho_static, self.rho_feedback, self.period, self.fuel, self.fuel_peak, self.coolant, self.moderator, self.inlet, self.outlet, self.void, self.iodine, self.xenon, self.promethium, self.samarium, self.decay_heat, self.thermal, self.electric, self.flow, self.rods, self.precursors]
    }
}

/// Result of `advance`.
#[derive(Default)]
pub struct Run {
    pub samples: Vec<Sample>,
    pub events: Vec<Value>,
    pub diagnostics: Vec<Value>,
    /// Static solutions of the layout computed in this call.
    pub solves: usize,
    pub steps: usize,
    /// The time asked for was not reached (budget of static solutions).
    pub partial: bool,
}

fn diagnostic(code: &str, severity: &str, params: Value) -> Value {
    json!({ "code": code, "severity": severity, "params": params })
}

impl State {
    fn pack(&self, groups: usize) -> Vec<f64> {
        let mut y = vec![0.0; DH + groups + 3];
        y[N] = self.n;
        y[C..C + 6].copy_from_slice(&self.c);
        y[TF] = self.temps.fuel;
        y[TC] = self.temps.coolant;
        y[TM] = self.temps.moderator;
        y[TI] = self.temps.inlet;
        y[PI] = self.poisons.iodine;
        y[PX] = self.poisons.xenon;
        y[PP] = self.poisons.promethium;
        y[PS] = self.poisons.samarium;
        for (j, h) in self.decay.iter().enumerate().take(groups) {
            y[DH + j] = *h;
        }
        y[DH + groups] = self.energy;
        y[DH + groups + 1] = self.electric;
        y[DH + groups + 2] = self.t;
        y
    }

    fn unpack(&mut self, y: &[f64], groups: usize) {
        self.n = y[N];
        self.c.copy_from_slice(&y[C..C + 6]);
        self.temps = temps_of(y);
        self.poisons = poisons_of(y);
        self.decay = y[DH..DH + groups].to_vec();
        self.energy = y[DH + groups];
        self.electric = y[DH + groups + 1];
        self.t = y[DH + groups + 2];
    }

    /// A fresh state for a document. `power` = None: cold and shut down as the document describes it (rods where
    /// the document has them, everything at the cold temperature, no poisons); Some(p): in equilibrium at the
    /// fission power p with `shim` set so that the reactor is critical.
    ///
    /// `insertion`: all rods at this insertion instead of the document's. `search` (with a power): the common
    /// insertion of all rods at which the reactor is critical at that power is found by bisection (14 static
    /// solutions); `shim` then only takes up what is left.
    pub fn initial(doc: &Doc, power: Option<f64>, cold: f64, insertion: Option<f64>, search: bool, run: &mut Run) -> SimResult<State> {
        let model = Model::new(doc);
        let rods = match insertion {
            Some(x) => vec![x.clamp(0.0, 1.0); doc.rods.len()],
            None => doc.rod_insertions(),
        };
        let groups = model.decay.len();
        let mut s = State {
            t: 0.0,
            n: 0.0,
            c: [0.0; 6],
            temps: Temperatures { fuel: cold, coolant: cold, moderator: cold, inlet: cold },
            poisons: Poisons::default(),
            decay: vec![0.0; groups],
            targets: rods.clone(),
            rods,
            rod_speed: ROD_SPEED,
            loop_: doc.loop_,
            shim: 0.0,
            scram: false,
            energy: 0.0,
            electric: 0.0,
            trip: None,
            ended: None,
            step: 1e-4,
            stats: Stats { max_power: 0.0, max_fuel_t: cold, t_scram: f64::NAN, xenon_at_scram: f64::NAN, t_cooling_lost: f64::NAN, power_at_cooling_lost: f64::NAN },
            core: None,
        };
        match power {
            None => {
                let core = summary(doc, &model.conditions(&s.temps, &s.poisons), &s.rods)?;
                run.solves += 1;
                let kin = kinetics_of(doc, core.generation);
                let q = model.source(&core);
                // subcritical with a source: the multiplied source level; otherwise a trace of power to start from
                s.n = if q > 0.0 && core.rho < 0.0 { -q * core.generation / core.rho } else { 1e-9 };
                s.c = kin.equilibrium(s.n);
                s.core = Some(core);
            }
            Some(p) => {
                let p = p.clamp(1e-12, 10.0);
                s.n = p;
                s.temps = doc.plant.steady(&s.loop_, p * doc.plant.power, model.separate);
                for (j, d) in model.decay.iter().enumerate() {
                    s.decay[j] = d.1 * p;
                }
                // the poisons depend on the flux per fission of the solution they change: two passes
                let mut core = summary(doc, &model.conditions(&s.temps, &s.poisons), &s.rods)?;
                run.solves += 1;
                for _ in 0..2 {
                    let f = p * model.fission_nominal;
                    s.poisons = model.poison.equilibrium(f, f * core.flux_per_fission);
                    core = summary(doc, &model.conditions(&s.temps, &s.poisons), &s.rods)?;
                    run.solves += 1;
                }
                if search && !doc.rods.is_empty() {
                    let now = model.conditions(&s.temps, &s.poisons);
                    let at = |x: f64, run: &mut Run| -> SimResult<Summary> {
                        run.solves += 1;
                        summary(doc, &now, &vec![x; doc.rods.len()])
                    };
                    let (out, full) = (at(0.0, run)?, at(1.0, run)?);
                    core = if out.rho <= 0.0 {
                        out
                    } else if full.rho >= 0.0 {
                        full
                    } else {
                        let (mut lo, mut hi, mut best) = (0.0, 1.0, out);
                        for _ in 0..12 {
                            let mid = 0.5 * (lo + hi);
                            let c = at(mid, run)?;
                            if c.rho > 0.0 {
                                lo = mid;
                            } else {
                                hi = mid;
                            }
                            best = c;
                        }
                        best
                    };
                    s.rods = core.rods.clone();
                    s.targets = core.rods.clone();
                }
                s.shim = -core.rho;
                if s.shim > 0.0 {
                    // the layout is subcritical at this power with the rods where they are: the bias that makes it
                    // critical is positive, which no absorber can provide
                    run.diagnostics.push(diagnostic("reactor.shimPositive", "approx", json!({ "shim": s.shim, "k": core.k })));
                }
                s.c = kinetics_of(doc, core.generation).equilibrium(p);
                s.stats.max_power = p;
                s.stats.max_fuel_t = model.peak_fuel(&s.temps, core.peak);
                s.core = Some(core);
            }
        }
        Ok(s)
    }

    pub fn hash(&self) -> String {
        let mut h = Sha256::new();
        h.update(b"velophi-reactor-state-1");
        h.update_f64(&[self.t, self.n, self.temps.fuel, self.temps.coolant, self.temps.moderator, self.temps.inlet, self.poisons.iodine, self.poisons.xenon, self.poisons.promethium, self.poisons.samarium, self.shim, self.energy, self.electric, self.loop_.pump, self.rod_speed]);
        h.update_f64(&self.c);
        h.update_f64(&self.decay);
        h.update_f64(&self.rods);
        h.update_f64(&self.targets);
        h.update(&[self.scram as u8, self.loop_.exchanger as u8, self.loop_.turbine as u8, self.trip.is_some() as u8, self.ended.is_some() as u8]);
        if let Some(c) = &self.core {
            h.update(c.key.as_bytes());
            h.update_f64(&[c.k]);
        }
        h.digest_hex()
    }

    pub fn to_json(&self) -> Value {
        let list = |v: &[f64]| v.iter().map(|x| jnum(*x)).collect::<Vec<_>>();
        let mark = |x: f64| if x.is_nan() { Value::Null } else { jnum(x) };
        json!({
            "format": "velophi-reactor-state", "version": 1,
            "t": jnum(self.t), "n": jnum(self.n), "c": list(&self.c),
            "fuelT": jnum(self.temps.fuel), "coolantT": jnum(self.temps.coolant), "moderatorT": jnum(self.temps.moderator), "inletT": jnum(self.temps.inlet),
            "iodine": jnum(self.poisons.iodine), "xenon": jnum(self.poisons.xenon), "promethium": jnum(self.poisons.promethium), "samarium": jnum(self.poisons.samarium),
            "decay": list(&self.decay), "rods": list(&self.rods), "targets": list(&self.targets), "rodSpeed": jnum(self.rod_speed),
            "loop": { "pump": jnum(self.loop_.pump), "exchanger": self.loop_.exchanger, "turbine": self.loop_.turbine },
            "shim": jnum(self.shim), "scram": self.scram, "energy_J": jnum(self.energy), "electric_J": jnum(self.electric),
            "trip": self.trip.as_ref().map(|t| json!({ "reason": t.reason, "t": jnum(t.t), "value": jnum(t.value), "limit": jnum(t.limit) })),
            "ended": self.ended.as_ref().map(|e| json!({ "reason": e.reason, "t": jnum(e.t), "value": jnum(e.value), "limit": jnum(e.limit) })),
            "step": jnum(self.step),
            "stats": { "maxPower": jnum(self.stats.max_power), "maxFuelT": jnum(self.stats.max_fuel_t), "tScram": mark(self.stats.t_scram), "xenonAtScram": mark(self.stats.xenon_at_scram), "tCoolingLost": mark(self.stats.t_cooling_lost), "powerAtCoolingLost": mark(self.stats.power_at_cooling_lost) },
            "core": self.core.as_ref().map(|c| c.to_json()),
            "hash": self.hash(),
        })
    }

    pub fn from_json(v: &Value, doc: &Doc) -> SimResult<State> {
        if v.get("format").and_then(|x| x.as_str()) != Some("velophi-reactor-state") {
            return Err(bad("state: format is not velophi-reactor-state"));
        }
        let f = |k: &str| -> SimResult<f64> { v.get(k).map(dnum).filter(|x| x.is_finite()).ok_or_else(|| bad(format!("state.{k}"))) };
        let list = |k: &str, len: usize| -> SimResult<Vec<f64>> {
            let a: Vec<f64> = v.get(k).and_then(|x| x.as_array()).map(|a| a.iter().map(dnum).collect()).unwrap_or_default();
            if a.len() != len || a.iter().any(|x| !x.is_finite()) {
                return Err(bad(format!("state.{k} must hold {len} numbers")));
            }
            Ok(a)
        };
        let groups = doc.lib().map(|l| l.decay_heat.len()).unwrap_or(0);
        let c = list("c", 6)?;
        let lp = v.get("loop").cloned().unwrap_or(Value::Null);
        let event = |k: &str| -> Option<(String, f64, f64, f64)> {
            let e = v.get(k).filter(|e| e.is_object())?;
            Some((e.get("reason")?.as_str()?.to_string(), dnum(e.get("t")?), e.get("value").map(dnum).unwrap_or(f64::NAN), e.get("limit").map(dnum).unwrap_or(f64::NAN)))
        };
        let st = v.get("stats").cloned().unwrap_or(Value::Null);
        let mark = |k: &str| st.get(k).filter(|x| !x.is_null()).map(dnum).unwrap_or(f64::NAN);
        let rods = list("rods", doc.rods.len())?;
        let mut s = State {
            t: f("t")?,
            n: f("n")?,
            c: [c[0], c[1], c[2], c[3], c[4], c[5]],
            temps: Temperatures { fuel: f("fuelT")?, coolant: f("coolantT")?, moderator: f("moderatorT")?, inlet: f("inletT")? },
            poisons: Poisons { iodine: f("iodine")?, xenon: f("xenon")?, promethium: f("promethium")?, samarium: f("samarium")? },
            decay: list("decay", groups)?,
            targets: list("targets", doc.rods.len())?,
            rods,
            rod_speed: f("rodSpeed")?.clamp(1e-7, 1.0),
            loop_: Loop { pump: lp.get("pump").map(dnum).filter(|x| x.is_finite()).unwrap_or(1.0).clamp(0.0, 1.0), exchanger: lp.get("exchanger").and_then(|x| x.as_bool()).unwrap_or(true), turbine: lp.get("turbine").and_then(|x| x.as_bool()).unwrap_or(true) },
            shim: f("shim")?,
            scram: v.get("scram").and_then(|x| x.as_bool()).unwrap_or(false),
            energy: f("energy_J")?,
            electric: f("electric_J")?,
            trip: event("trip").map(|(reason, t, value, limit)| Trip { reason, t, value, limit }),
            ended: event("ended").map(|(reason, t, value, limit)| Ended { reason, t, value, limit }),
            step: f("step")?.max(1e-12),
            stats: Stats { max_power: mark("maxPower"), max_fuel_t: mark("maxFuelT"), t_scram: mark("tScram"), xenon_at_scram: mark("xenonAtScram"), t_cooling_lost: mark("tCoolingLost"), power_at_cooling_lost: mark("powerAtCoolingLost") },
            core: None,
        };
        for r in s.rods.iter_mut().chain(s.targets.iter_mut()) {
            *r = r.clamp(0.0, 1.0);
        }
        // the summary is taken over only when it belongs to this document and these rod positions
        if let Some(core) = v.get("core").and_then(Summary::from_json) {
            if core.key == summary_key(doc, &core.base, &s.rods) && core.detectors.len() == doc.detectors.len() {
                s.core = Some(core);
            }
        }
        Ok(s)
    }
}

fn temps_of(y: &[f64]) -> Temperatures {
    Temperatures { fuel: y[TF], coolant: y[TC], moderator: y[TM], inlet: y[TI] }
}

fn poisons_of(y: &[f64]) -> Poisons {
    Poisons { iodine: y[PI], xenon: y[PX], promethium: y[PP], samarium: y[PS] }
}

/// One stretch of the integration: constant controls, static reactivity linear in time between two solutions.
struct Stretch<'a> {
    model: &'a Model<'a>,
    core: &'a Summary,
    kin: Kinetics,
    loop_: Loop,
    shim: f64,
    source: f64,
    t_a: f64,
    t_b: f64,
    rho_a: f64,
    rho_b: f64,
    groups: usize,
}

impl Stretch<'_> {
    fn rho_static(&self, t: f64) -> f64 {
        if self.t_b > self.t_a {
            self.rho_a + (self.rho_b - self.rho_a) * ((t - self.t_a) / (self.t_b - self.t_a)).clamp(0.0, 1.0)
        } else {
            self.rho_b
        }
    }

    /// (static, feedback, total) reactivity at a state.
    fn rho(&self, y: &[f64]) -> (f64, f64, f64) {
        let st = self.rho_static(y[DH + self.groups + 2]);
        let fb = self.core.feedback(&self.model.conditions(&temps_of(y), &poisons_of(y)));
        (st, fb, st + fb + self.shim)
    }

    fn rhs(&self, y: &[f64], dy: &mut [f64]) {
        let m = self.model;
        let g = self.groups;
        let temps = temps_of(y);
        let (_, _, rho) = self.rho(y);
        let (dn, dc) = self.kin.rates(rho, y[N], &y[C..C + 6], self.source);
        dy[N] = dn;
        dy[C..C + 6].copy_from_slice(&dc);
        let power = m.thermal_power(y[N], &y[DH..DH + g]);
        let dt = m.doc.plant.rates(&temps, &self.loop_, power, m.separate);
        dy[TF] = dt.fuel;
        dy[TC] = dt.coolant;
        dy[TM] = dt.moderator;
        dy[TI] = dt.inlet;
        let f = y[N].max(0.0) * m.fission_nominal;
        let dp = m.poison.rates(&poisons_of(y), f, f * self.core.flux_per_fission);
        dy[PI] = dp.iodine;
        dy[PX] = dp.xenon;
        dy[PP] = dp.promethium;
        dy[PS] = dp.samarium;
        for (j, d) in m.decay.iter().enumerate() {
            dy[DH + j] = d.0 * (d.1 * y[N].max(0.0) - y[DH + j]);
        }
        dy[DH + g] = power;
        dy[DH + g + 1] = m.doc.plant.heat(&temps, &self.loop_).electric;
        dy[DH + g + 2] = 1.0;
    }

    fn sample(&self, y: &[f64], rods: f64) -> Sample {
        let m = self.model;
        let g = self.groups;
        let temps = temps_of(y);
        let (st, fb, rho) = self.rho(y);
        let (dn, _) = self.kin.rates(rho, y[N], &y[C..C + 6], self.source);
        let heat = m.doc.plant.heat(&temps, &self.loop_);
        let mut decay = 0.0;
        for h in &y[DH..DH + g] {
            decay += *h;
        }
        let mut precursors = 0.0;
        for i in 0..6 {
            precursors += self.kin.lambda[i] * y[C + i];
        }
        Sample {
            t: y[DH + g + 2],
            n: y[N],
            rho,
            rho_static: st,
            rho_feedback: fb,
            period: if dn != 0.0 { y[N] / dn } else { f64::INFINITY },
            fuel: temps.fuel,
            fuel_peak: m.peak_fuel(&temps, self.core.peak),
            coolant: temps.coolant,
            moderator: if m.separate { temps.moderator } else { temps.coolant },
            inlet: temps.inlet,
            outlet: heat.outlet,
            void: heat.void,
            iodine: y[PI],
            xenon: y[PX],
            promethium: y[PP],
            samarium: y[PS],
            decay_heat: decay,
            thermal: m.thermal_power(y[N], &y[DH..DH + g]),
            electric: heat.electric,
            flow: heat.flow,
            rods,
            // delayed-neutron source Σλc relative to the prompt loss βn/Λ at the same power: 1 in equilibrium
            precursors: if y[N] > 0.0 { precursors * self.kin.generation / (self.kin.beta_total() * y[N]) } else { 0.0 },
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
enum Stop {
    None,
    Validity(f64),
    Damage(f64),
    Trip(&'static str, f64, f64),
    Rebase,
}

fn mean(v: &[f64]) -> f64 {
    if v.is_empty() {
        return 0.0;
    }
    v.iter().sum::<f64>() / v.len() as f64
}

/// Advance the state by `dt` seconds, recording `samples` equally spaced instants. At most `max_solves` static
/// solutions are computed; when that budget ends first, the state stops earlier (`Run::partial`).
pub fn advance(doc: &Doc, state: &mut State, dt: f64, samples: usize, controls: &Controls, max_solves: usize) -> SimResult<Run> {
    let mut run = Run::default();
    let model = Model::new(doc);
    let groups = model.decay.len();
    if state.decay.len() != groups || state.rods.len() != doc.rods.len() {
        return Err(bad("state does not belong to this document"));
    }
    // controls
    if controls.reset_trip && state.ended.is_none() {
        state.trip = None;
        state.scram = false;
    }
    if let Some(s) = controls.rod_speed {
        state.rod_speed = s;
    }
    if !state.scram {
        if let Some(t) = controls.all_rods {
            for x in state.targets.iter_mut() {
                *x = t;
            }
        }
        for &(i, t) in &controls.rods {
            state.targets[i] = t;
        }
    }
    let had_cooling = state.loop_.pump > 0.0 && state.loop_.exchanger;
    if let Some(p) = controls.pump {
        state.loop_.pump = p;
    }
    if let Some(e) = controls.exchanger {
        state.loop_.exchanger = e;
    }
    if let Some(t) = controls.turbine {
        state.loop_.turbine = t;
    }
    let has_cooling = state.loop_.pump > 0.0 && state.loop_.exchanger;
    if had_cooling && !has_cooling {
        state.stats.t_cooling_lost = state.t;
        state.stats.power_at_cooling_lost = state.n;
    } else if has_cooling && !had_cooling {
        state.stats.t_cooling_lost = f64::NAN;
        state.stats.power_at_cooling_lost = f64::NAN;
    }
    if let Some(s) = controls.shim {
        state.shim = s;
    }
    if controls.scram && !state.scram {
        scram(state, "manual", 0.0, 0.0, &mut run);
    }
    if let Some(e) = &state.ended {
        run.diagnostics.push(ended_diagnostic(e));
        return Ok(run);
    }
    let samples = samples.clamp(1, 20000);
    let t0 = state.t;
    let t_end = t0 + dt;
    let mut y = state.pack(groups);
    let mut atol = vec![1e-14; y.len()];
    for a in &mut atol[TF..=TI] {
        *a = 1e-7;
    }
    for a in &mut atol[PI..=PS] {
        *a = 1e-24;
    }
    atol[DH + groups] = 1e-6;
    atol[DH + groups + 1] = 1e-6;
    atol[DH + groups + 2] = 1e-9;
    let opts = Options { rtol: 1e-6, atol, h_max: f64::INFINITY, max_steps: 400_000 };
    let mut next = 1usize;
    'outer: while state.t < t_end && state.ended.is_none() {
        if t_end - state.t <= 1e-12 * t_end.abs().max(1.0) {
            state.t = t_end;
            break;
        }
        // the static solution for where the rods are
        let now = model.conditions(&state.temps, &state.poisons);
        let valid = state.core.as_ref().is_some_and(|c| c.key == summary_key(doc, &c.base, &state.rods));
        if !valid {
            if run.solves >= max_solves {
                run.partial = true;
                break;
            }
            state.core = Some(summary(doc, &now, &state.rods)?);
            run.solves += 1;
        }
        let core_a = state.core.clone().expect("summary");
        if !core_a.converged {
            run.diagnostics.push(diagnostic("reactor.notConverged", "approx", json!({ "k": core_a.k })));
        }
        let kin = kinetics_of(doc, core_a.generation);
        let limit = kin.limit();
        // rods on the move: the layout at the end of this stretch
        let speed = if state.scram { 1.0 / SCRAM_TIME } else { state.rod_speed };
        let mut travel = 0.0f64;
        for (x, t) in state.rods.iter_mut().zip(state.targets.iter()) {
            if (*t - *x).abs() <= 1e-12 {
                *x = *t;
            }
            travel = travel.max((*t - *x).abs());
        }
        let moving = travel > 0.0;
        let (t_b, core_b) = if moving {
            let stretch = (travel.min(ROD_STEP) / speed).min(t_end - state.t);
            let rods_b = moved(&state.rods, &state.targets, speed * stretch);
            if run.solves >= max_solves {
                run.partial = true;
                break;
            }
            let c = summary(doc, &core_a.base, &rods_b)?;
            run.solves += 1;
            (state.t + stretch, Some(c))
        } else {
            (t_end, None)
        };
        let t_a = state.t;
        let stretch = Stretch { model: &model, core: &core_a, kin, loop_: state.loop_, shim: state.shim, source: model.source(&core_a), t_a, t_b, rho_a: core_a.rho, rho_b: core_b.as_ref().map(|c| c.rho).unwrap_or(core_a.rho), groups };
        // before any step: is the model valid here at all?
        let (_, _, rho_now) = stretch.rho(&y);
        if rho_now >= limit {
            state.ended = Some(Ended { reason: "validity".into(), t: state.t, value: rho_now, limit });
            break;
        }
        let rods_a = state.rods.clone();
        let mut stop = Stop::None;
        // sample by sample up to the end of the stretch
        loop {
            let t_sample = if next >= samples { t_end } else { t0 + dt * next as f64 / samples as f64 };
            let target = t_sample.min(t_b);
            if target > state.t {
                let protection = doc.protection;
                let scrammed = state.scram;
                let mut stats = state.stats;
                let mut step = state.step;
                let mut observe = |_: f64, y: &[f64]| -> bool {
                    let (_, fb, rho) = stretch.rho(y);
                    let temps = temps_of(y);
                    let peak = model.peak_fuel(&temps, core_a.peak);
                    if y[N] > stats.max_power {
                        stats.max_power = y[N];
                    }
                    if peak > stats.max_fuel_t {
                        stats.max_fuel_t = peak;
                    }
                    if rho >= limit {
                        stop = Stop::Validity(rho);
                    } else if peak > model.damage {
                        stop = Stop::Damage(peak);
                    } else if protection.enabled && !scrammed {
                        let (dn, _) = stretch.kin.rates(rho, y[N], &y[C..C + 6], stretch.source);
                        if y[N] > protection.power {
                            stop = Stop::Trip("power", y[N], protection.power);
                        } else if dn > 0.0 && y[N] > 1e-8 && y[N] / dn < protection.period {
                            stop = Stop::Trip("period", y[N] / dn, protection.period);
                        } else if peak > protection.fuel_t {
                            stop = Stop::Trip("fuelTemperature", peak, protection.fuel_t);
                        }
                    }
                    // near critical the linearisation is kept within a fifth of β; far below critical, where the
                    // power follows the reactivity only weakly, within a tenth of the reactivity itself
                    if stop == Stop::None && fb.abs() > REBASE * stretch.kin.beta_total() + 0.1 * rho.abs() {
                        stop = Stop::Rebase;
                    }
                    stop != Stop::None
                };
                let mut f = |y: &[f64], dy: &mut [f64]| stretch.rhs(y, dy);
                let out = kinetics::integrate(&mut f, state.t, target, &mut y, &mut step, &opts, &mut observe);
                run.steps += out.steps;
                state.stats = stats;
                state.step = step;
                state.unpack(&y, groups);
                // the clock of the vector and the integrator's agree up to rounding: keep the integrator's
                state.t = out.t;
                y[DH + groups + 2] = out.t;
                if out.end == End::Failed {
                    return Err(bad(format!("the integration stalled at t = {} s", out.t)));
                }
            }
            if moving {
                state.rods = moved(&rods_a, &state.targets, speed * (state.t - t_a));
            }
            if stop != Stop::None {
                break;
            }
            if state.t >= t_sample && next <= samples {
                run.samples.push(stretch.sample(&y, mean(&state.rods)));
                next += 1;
            }
            if state.t >= t_b {
                break;
            }
        }
        // the summary that holds from here on
        match stop {
            Stop::None => {
                if let Some(c) = core_b {
                    state.rods = c.rods.clone();
                    state.core = Some(c);
                }
            }
            _ => {
                if moving {
                    state.core = None;
                }
            }
        }
        match stop {
            Stop::None => {}
            Stop::Rebase => state.core = None,
            Stop::Validity(rho) => {
                state.ended = Some(Ended { reason: "validity".into(), t: state.t, value: rho, limit });
                break 'outer;
            }
            Stop::Damage(peak) => {
                state.ended = Some(Ended { reason: "coreDamage".into(), t: state.t, value: peak, limit: model.damage });
                break 'outer;
            }
            Stop::Trip(reason, value, limit) => scram(state, reason, value, limit, &mut run),
        }
    }
    if let Some(e) = &state.ended {
        run.events.push(json!({ "t": jnum(e.t), "kind": e.reason, "value": jnum(e.value), "limit": jnum(e.limit) }));
        run.diagnostics.push(ended_diagnostic(e));
    }
    if run.partial {
        run.diagnostics.push(diagnostic("reactor.solveBudget", "info", json!({ "t": state.t, "solves": run.solves })));
    }
    Ok(run)
}

fn moved(rods: &[f64], targets: &[f64], travel: f64) -> Vec<f64> {
    rods.iter().zip(targets.iter()).map(|(x, t)| if (t - x).abs() <= travel + 1e-12 { *t } else if t > x { x + travel } else { x - travel }).collect()
}

fn scram(state: &mut State, reason: &str, value: f64, limit: f64, run: &mut Run) {
    state.scram = true;
    for t in state.targets.iter_mut() {
        *t = 1.0;
    }
    state.trip = Some(Trip { reason: reason.to_string(), t: state.t, value, limit });
    state.stats.t_scram = state.t;
    state.stats.xenon_at_scram = state.poisons.xenon;
    run.events.push(json!({ "t": jnum(state.t), "kind": "trip", "reason": reason, "value": jnum(value), "limit": jnum(limit) }));
    run.diagnostics.push(diagnostic("reactor.trip", "info", json!({ "reason": reason, "t": state.t, "value": value, "limit": limit })));
}

fn ended_diagnostic(e: &Ended) -> Value {
    if e.reason == "validity" {
        diagnostic("reactor.promptCritical", "unmodelled", json!({ "t": e.t, "rho": e.value, "limit": e.limit }))
    } else {
        diagnostic("reactor.coreDamage", "error", json!({ "t": e.t, "fuelT": e.value, "limit": e.limit }))
    }
}
