//! Two-group cross-section sets of the reactor workshop (26.64, D277) and how they follow the state of the core.
//!
//! The 12 materials are data (`src/chem/data/xs2g.json`, built by `scripts/chem/build_xs2g.py`, every value with
//! its source), handed over once with `reactorSetData` and global to the core instance. They are **teaching
//! values**: two groups, homogenised cells, no spectrum calculation. A request may add materials of its own with
//! fixed cross-sections (`materials: [{ id, D1, D2, a1, a2, s12, nf1, nf2, f1?, f2? }]`), which is how the
//! benchmark problems are posed.
//!
//! Dependence on the state (`Conditions`):
//! - fuel: enrichment (linear in the weight percent of U-235), Doppler broadening of the U-238 resonance capture
//!   Σc(T) = Σc·[1 + β(√T_fuel − √T_ref)], thermal absorption and fission ∝ 1/v of the neutron temperature (the
//!   moderator's), and the absorption of xenon-135 and samarium-149;
//! - liquids (light water, heavy water, the water share of a coolant channel): density
//!   ρ/ρ_ref = (1 − c₁ΔT − c₂ΔT²)(1 − void); the Σ follow the density, D its inverse, thermal absorption also 1/v;
//! - graphite: thermal absorption 1/v;
//! - structure, absorbers, cavity, source: constant.

use std::cell::RefCell;
use std::rc::Rc;

use serde_json::{json, Value};
use velophi_core::message::{Message, SimResult};
use velophi_core::transport::{dnum, jnum};

/// A two-group set (cm, 1/cm): diffusion coefficients, absorption, down-scattering, ν·fission and fission.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Xs {
    pub d1: f64,
    pub d2: f64,
    pub a1: f64,
    pub a2: f64,
    pub s12: f64,
    pub nf1: f64,
    pub nf2: f64,
    pub f1: f64,
    pub f2: f64,
}

/// Neutrons per fission used when a request's material gives ν·Σf only.
const NU: f64 = 2.43;

impl Xs {
    fn from_json(v: &Value, what: &str) -> SimResult<Xs> {
        let get = |k: &str| -> f64 {
            match v.get(k) {
                None | Some(Value::Null) => f64::NAN,
                Some(x) => dnum(x),
            }
        };
        let need = |k: &str| -> SimResult<f64> {
            let x = get(k);
            if x.is_finite() && x >= 0.0 {
                Ok(x)
            } else {
                Err(bad(format!("{what}: {k} must be a number ≥ 0")))
            }
        };
        let or_zero = |k: &str| -> SimResult<f64> {
            let x = get(k);
            if x.is_nan() {
                Ok(0.0)
            } else if x.is_finite() && x >= 0.0 {
                Ok(x)
            } else {
                Err(bad(format!("{what}: {k} must be a number ≥ 0")))
            }
        };
        let (nf1, nf2) = (or_zero("nf1")?, or_zero("nf2")?);
        let f1 = if get("f1").is_nan() { nf1 / NU } else { or_zero("f1")? };
        let f2 = if get("f2").is_nan() { nf2 / NU } else { or_zero("f2")? };
        let xs = Xs { d1: need("D1")?, d2: need("D2")?, a1: or_zero("a1")?, a2: or_zero("a2")?, s12: or_zero("s12")?, nf1, nf2, f1, f2 };
        if !(xs.d1 > 0.0 && xs.d2 > 0.0) {
            return Err(bad(format!("{what}: D1 and D2 must be > 0")));
        }
        Ok(xs)
    }

    pub fn to_json(&self) -> Value {
        json!({ "D1": jnum(self.d1), "D2": jnum(self.d2), "a1": jnum(self.a1), "a2": jnum(self.a2), "s12": jnum(self.s12), "nf1": jnum(self.nf1), "nf2": jnum(self.nf2), "f1": jnum(self.f1), "f2": jnum(self.f2) })
    }

    /// Volume-weighted mixture with another set (`share` of the other): the Σ add, the transport cross-sections
    /// 1/(3D) add. A control rod inserted to `share` of the height of the cell.
    pub fn mixed(&self, other: &Xs, share: f64) -> Xs {
        let s = share.clamp(0.0, 1.0);
        let a = 1.0 - s;
        Xs {
            d1: 1.0 / (a / self.d1 + s / other.d1),
            d2: 1.0 / (a / self.d2 + s / other.d2),
            a1: a * self.a1 + s * other.a1,
            a2: a * self.a2 + s * other.a2,
            s12: a * self.s12 + s * other.s12,
            nf1: a * self.nf1 + s * other.nf1,
            nf2: a * self.nf2 + s * other.nf2,
            f1: a * self.f1 + s * other.f1,
            f2: a * self.f2 + s * other.f2,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Kind {
    Fuel,
    Moderator,
    Coolant,
    Solid,
    Structure,
    Absorber,
    Void,
    Source,
    /// A material of the request with fixed cross-sections.
    Custom,
}

impl Kind {
    pub fn name(self) -> &'static str {
        match self {
            Kind::Fuel => "fuel",
            Kind::Moderator => "moderator",
            Kind::Coolant => "coolant",
            Kind::Solid => "solid",
            Kind::Structure => "structure",
            Kind::Absorber => "absorber",
            Kind::Void => "void",
            Kind::Source => "source",
            Kind::Custom => "custom",
        }
    }
}

/// How a fuel follows enrichment and temperature.
#[derive(Clone, Debug)]
pub struct FuelDep {
    /// Reference enrichment (weight percent U-235) and the range when it is adjustable.
    pub enrichment: f64,
    pub adjustable: bool,
    pub min: f64,
    pub max: f64,
    /// The set at enrichment 0 and its change per weight percent.
    pub base: Xs,
    pub per: Xs,
    /// U-238 resonance capture at enrichment 0 (1/cm) and the Doppler coefficient β (K^-1/2).
    pub c28: f64,
    pub doppler: f64,
    /// Fuel temperature above which the fuel is damaged (K).
    pub damage: f64,
}

#[derive(Clone, Debug)]
pub struct Material {
    pub id: String,
    pub kind: Kind,
    /// The set at the reference state.
    pub xs: Xs,
    pub fuel: Option<FuelDep>,
    /// Density fit of a liquid: ρ/ρ_ref = 1 − c₁ΔT − c₂ΔT².
    pub density: Option<(f64, f64)>,
    pub one_over_v: bool,
    /// Share of the liquid in the thermal absorption and in the down-scattering of a mixed cell (coolant channel).
    pub liquid_share: Option<(f64, f64)>,
    /// Name, note and sources of the data file, passed through to the interface.
    pub meta: Value,
}

/// The state of the core that the cross-sections follow.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Conditions {
    pub fuel_t: f64,
    pub moderator_t: f64,
    pub coolant_t: f64,
    pub moderator_void: f64,
    pub coolant_void: f64,
    /// Number densities in the fuel cells, 1/(barn·cm) = 10²⁴ cm⁻³.
    pub xenon: f64,
    pub samarium: f64,
}

impl Conditions {
    pub fn cold(t: f64) -> Conditions {
        Conditions { fuel_t: t, moderator_t: t, coolant_t: t, moderator_void: 0.0, coolant_void: 0.0, xenon: 0.0, samarium: 0.0 }
    }

    pub fn to_json(&self) -> Value {
        json!({ "fuelT": jnum(self.fuel_t), "moderatorT": jnum(self.moderator_t), "coolantT": jnum(self.coolant_t), "moderatorVoid": jnum(self.moderator_void), "coolantVoid": jnum(self.coolant_void), "xenon": jnum(self.xenon), "samarium": jnum(self.samarium) })
    }

    /// Conditions of a request (`{ fuelT, moderatorT, coolantT, void, moderatorVoid, coolantVoid, xenon, samarium }`),
    /// absent values from `default`.
    pub fn from_json(v: Option<&Value>, default: Conditions) -> Conditions {
        let Some(v) = v.filter(|v| v.is_object()) else {
            return default;
        };
        let num = |k: &str, d: f64| match v.get(k) {
            None | Some(Value::Null) => d,
            Some(x) => {
                let x = dnum(x);
                if x.is_finite() {
                    x
                } else {
                    d
                }
            }
        };
        let void = num("void", f64::NAN);
        let moderator_t = num("moderatorT", default.moderator_t);
        Conditions {
            fuel_t: num("fuelT", default.fuel_t).clamp(200.0, 6000.0),
            moderator_t: moderator_t.clamp(200.0, 6000.0),
            coolant_t: num("coolantT", moderator_t).clamp(200.0, 6000.0),
            moderator_void: num("moderatorVoid", if void.is_nan() { default.moderator_void } else { void }).clamp(0.0, 0.98),
            coolant_void: num("coolantVoid", if void.is_nan() { default.coolant_void } else { void }).clamp(0.0, 0.98),
            xenon: num("xenon", default.xenon).max(0.0),
            samarium: num("samarium", default.samarium).max(0.0),
        }
    }
}

/// Fission-product poison data.
#[derive(Clone, Copy, Debug, Default)]
pub struct PoisonData {
    pub gamma_i: f64,
    pub gamma_xe: f64,
    pub gamma_pm: f64,
    pub lambda_i: f64,
    pub lambda_xe: f64,
    pub lambda_pm: f64,
    /// Absorption cross-sections (barn).
    pub sigma_xe: f64,
    pub sigma_sm: f64,
}

/// The installed data.
#[derive(Clone, Debug)]
pub struct Library {
    pub materials: Vec<Material>,
    pub t_ref: f64,
    /// Group speeds (cm/s) at the reference temperature.
    pub v1: f64,
    pub v2: f64,
    pub beta: [f64; 6],
    pub lambda: [f64; 6],
    /// Energy per fission (J).
    pub fission_energy: f64,
    pub poisons: PoisonData,
    /// Decay-heat groups: decay constants (1/s) and equilibrium shares of the power.
    pub decay_heat: Vec<(f64, f64)>,
    pub teaching: String,
    pub sources: Value,
}

impl Library {
    pub fn beta_total(&self) -> f64 {
        self.beta.iter().sum()
    }
    pub fn find(&self, id: &str) -> Option<usize> {
        self.materials.iter().position(|m| m.id == id)
    }
}

thread_local! {
    static LIBRARY: RefCell<Option<Rc<Library>>> = const { RefCell::new(None) };
}

fn bad(what: impl Into<String>) -> Message {
    Message::new("err.internal").text("message", format!("reactor data: {}", what.into()))
}

/// The installed data; an error while none has been handed over.
pub fn library() -> SimResult<Rc<Library>> {
    LIBRARY.with(|l| l.borrow().clone()).ok_or_else(|| bad("not loaded (reactorSetData)"))
}

/// The installed data, if any (requests that bring all their materials need none).
pub fn library_opt() -> Option<Rc<Library>> {
    LIBRARY.with(|l| l.borrow().clone())
}

fn six(v: &Value, key: &str) -> SimResult<[f64; 6]> {
    let a = v.get(key).and_then(|x| x.as_array()).filter(|a| a.len() == 6).ok_or_else(|| bad(format!("kinetics.{key} must hold six numbers")))?;
    let mut out = [0.0; 6];
    for (i, x) in a.iter().enumerate() {
        out[i] = dnum(x);
        if !(out[i] > 0.0) || !out[i].is_finite() {
            return Err(bad(format!("kinetics.{key}[{i}]")));
        }
    }
    Ok(out)
}

fn positive(v: &Value, key: &str, what: &str) -> SimResult<f64> {
    let x = v.get(key).map(dnum).unwrap_or(f64::NAN);
    if x > 0.0 && x.is_finite() {
        Ok(x)
    } else {
        Err(bad(format!("{what}.{key} must be > 0")))
    }
}

/// Install `src/chem/data/xs2g.json`; returns the ids of its materials.
pub fn set(data: &Value) -> SimResult<Value> {
    if data.get("format").and_then(|v| v.as_str()) != Some("velophi-xs2g") {
        return Err(bad("format is not velophi-xs2g"));
    }
    let groups = data.get("groups").ok_or_else(|| bad("groups missing"))?;
    let kin = data.get("kinetics").ok_or_else(|| bad("kinetics missing"))?;
    let poi = data.get("poisons").ok_or_else(|| bad("poisons missing"))?;
    let dh = data.get("decayHeat").ok_or_else(|| bad("decayHeat missing"))?;
    let lam: Vec<f64> = dh.get("lambda").and_then(|v| v.as_array()).map(|a| a.iter().map(dnum).collect()).unwrap_or_default();
    let amp: Vec<f64> = dh.get("a").and_then(|v| v.as_array()).map(|a| a.iter().map(dnum).collect()).unwrap_or_default();
    if lam.len() != amp.len() || lam.len() > 40 || lam.iter().chain(amp.iter()).any(|x| !(*x > 0.0) || !x.is_finite()) {
        return Err(bad("decayHeat: lambda and a must be equally long lists of positive numbers"));
    }
    let mut materials = Vec::new();
    for m in data.get("materials").and_then(|v| v.as_array()).ok_or_else(|| bad("materials missing"))? {
        let id = m.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if id.is_empty() || materials.iter().any(|x: &Material| x.id == id) {
            return Err(bad(format!("material id '{id}' is empty or used twice")));
        }
        let kind = match m.get("kind").and_then(|v| v.as_str()).unwrap_or("") {
            "fuel" => Kind::Fuel,
            "moderator" => Kind::Moderator,
            "coolant" => Kind::Coolant,
            "solid" => Kind::Solid,
            "structure" => Kind::Structure,
            "absorber" => Kind::Absorber,
            "void" => Kind::Void,
            "source" => Kind::Source,
            other => return Err(bad(format!("material {id}: kind '{other}'"))),
        };
        let xs = Xs::from_json(m.get("xs").unwrap_or(&Value::Null), &id)?;
        let dep = m.get("dep").cloned().unwrap_or(Value::Null);
        let fuel = if kind == Kind::Fuel {
            let base = Xs::from_json(dep.get("base").unwrap_or(&Value::Null), &id)?;
            let p = dep.get("perPercent").ok_or_else(|| bad(format!("material {id}: dep.perPercent")))?;
            // slopes may be negative: read them as plain numbers
            let s = |k: &str| p.get(k).map(dnum).filter(|x| x.is_finite()).unwrap_or(0.0);
            let per = Xs { d1: 0.0, d2: 0.0, a1: s("a1"), a2: s("a2"), s12: 0.0, nf1: s("nf1"), nf2: s("nf2"), f1: s("f1"), f2: s("f2") };
            let enrichment = positive(&dep, "enrichment", &id)?;
            let adjustable = dep.get("adjustable").and_then(|v| v.as_bool()).unwrap_or(false);
            let (min, max) = if adjustable { (positive(&dep, "min", &id)?, positive(&dep, "max", &id)?) } else { (enrichment, enrichment) };
            // the boundary of the model: no highly enriched fuel
            if max > 5.0 || min > max {
                return Err(bad(format!("material {id}: enrichment range must lie within 5 %")));
            }
            Some(FuelDep { enrichment, adjustable, min, max, base, per, c28: dep.get("c28").map(dnum).filter(|x| *x >= 0.0).unwrap_or(0.0), doppler: dep.get("doppler").map(dnum).filter(|x| *x >= 0.0).unwrap_or(0.0), damage: positive(&dep, "damage_K", &id)? })
        } else {
            None
        };
        let density = dep.get("density").and_then(|v| v.as_array()).filter(|a| a.len() == 2).map(|a| (dnum(&a[0]), dnum(&a[1])));
        let liquid_share = dep.get("liquidShare").filter(|v| v.is_object()).map(|v| (v.get("a2").map(dnum).unwrap_or(1.0).clamp(0.0, 1.0), v.get("s12").map(dnum).unwrap_or(1.0).clamp(0.0, 1.0)));
        let meta = json!({ "name": m.get("name").cloned().unwrap_or(Value::Null), "note": m.get("note").cloned().unwrap_or(Value::Null), "src": m.get("src").cloned().unwrap_or(Value::Null) });
        materials.push(Material { id, kind, xs, fuel, density, one_over_v: dep.get("oneOverV").and_then(|v| v.as_bool()).unwrap_or(false), liquid_share, meta });
    }
    let lib = Library {
        materials,
        t_ref: positive(groups, "T_ref_K", "groups")?,
        v1: positive(groups, "v1_cm_s", "groups")?,
        v2: positive(groups, "v2_cm_s", "groups")?,
        beta: six(kin, "beta")?,
        lambda: six(kin, "lambda")?,
        fission_energy: positive(data.get("fission").unwrap_or(&Value::Null), "energy_J", "fission")?,
        poisons: PoisonData {
            gamma_i: positive(poi, "gammaI", "poisons")?,
            gamma_xe: positive(poi, "gammaXe", "poisons")?,
            gamma_pm: positive(poi, "gammaPm", "poisons")?,
            lambda_i: positive(poi, "lambdaI", "poisons")?,
            lambda_xe: positive(poi, "lambdaXe", "poisons")?,
            lambda_pm: positive(poi, "lambdaPm", "poisons")?,
            sigma_xe: positive(poi, "sigmaXe_b", "poisons")?,
            sigma_sm: positive(poi, "sigmaSm_b", "poisons")?,
        },
        decay_heat: lam.into_iter().zip(amp).collect(),
        teaching: data.get("teaching").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        sources: data.get("sources").cloned().unwrap_or(Value::Null),
    };
    let out = json!({ "materials": lib.materials.iter().map(|m| m.id.clone()).collect::<Vec<_>>(), "teaching": lib.teaching });
    LIBRARY.with(|l| *l.borrow_mut() = Some(Rc::new(lib)));
    Ok(out)
}

/// A material of a request with fixed cross-sections.
pub fn custom(v: &Value, index: usize) -> SimResult<Material> {
    let id = v.get("id").and_then(|x| x.as_str()).map(|s| s.to_string()).unwrap_or_else(|| format!("#{index}"));
    let xs = Xs::from_json(v, &format!("material {id}"))?;
    Ok(Material { id, kind: Kind::Custom, xs, fuel: None, density: None, one_over_v: false, liquid_share: None, meta: Value::Null })
}

impl Material {
    /// Enrichment used for this material when the document asks for `wanted` (weight percent).
    pub fn enrichment(&self, wanted: Option<f64>) -> f64 {
        match &self.fuel {
            Some(f) if f.adjustable => wanted.filter(|e| e.is_finite()).unwrap_or(f.enrichment).clamp(f.min, f.max),
            Some(f) => f.enrichment,
            None => 0.0,
        }
    }

    /// The cross-sections at a state of the core (see the module text).
    pub fn evaluate(&self, lib: Option<&Library>, enrichment: Option<f64>, c: &Conditions) -> Xs {
        let Some(lib) = lib else {
            return self.xs;
        };
        let t_ref = lib.t_ref;
        let one_over_v = |t: f64| (t_ref / t.max(1.0)).sqrt();
        let density = |fit: (f64, f64), t: f64, void: f64| {
            let dt = (t - t_ref).max(0.0);
            ((1.0 - fit.0 * dt - fit.1 * dt * dt) * (1.0 - void)).clamp(0.02, 1.2)
        };
        match self.kind {
            Kind::Fuel => {
                let f = self.fuel.as_ref().expect("fuel data");
                let e = self.enrichment(enrichment);
                let w = if self.one_over_v { one_over_v(c.moderator_t) } else { 1.0 };
                let doppler = f.c28 * (1.0 - e / 100.0) * f.doppler * (c.fuel_t.max(1.0).sqrt() - t_ref.sqrt());
                Xs {
                    d1: f.base.d1,
                    d2: f.base.d2,
                    a1: (f.base.a1 + f.per.a1 * e + doppler).max(0.0),
                    a2: (f.base.a2 + f.per.a2 * e) * w + lib.poisons.sigma_xe * c.xenon + lib.poisons.sigma_sm * c.samarium,
                    s12: f.base.s12,
                    nf1: f.base.nf1 + f.per.nf1 * e,
                    nf2: f.per.nf2 * e * w,
                    f1: f.base.f1 + f.per.f1 * e,
                    f2: f.per.f2 * e * w,
                }
            }
            Kind::Moderator | Kind::Coolant => {
                let (t, void) = if self.kind == Kind::Coolant { (c.coolant_t, c.coolant_void) } else { (c.moderator_t, c.moderator_void) };
                let r = self.density.map(|fit| density(fit, t, void)).unwrap_or(1.0);
                let w = if self.one_over_v { one_over_v(t) } else { 1.0 };
                match self.liquid_share {
                    // a mixed cell: only the liquid share follows the state; D is kept
                    Some((sa, ss)) => Xs { a2: self.xs.a2 * ((1.0 - sa) + sa * r * w), s12: self.xs.s12 * ((1.0 - ss) + ss * r), ..self.xs },
                    None => Xs { d1: self.xs.d1 / r, d2: self.xs.d2 / r, a1: self.xs.a1 * r, a2: self.xs.a2 * r * w, s12: self.xs.s12 * r, ..self.xs },
                }
            }
            Kind::Solid => Xs { a2: self.xs.a2 * if self.one_over_v { one_over_v(c.moderator_t) } else { 1.0 }, ..self.xs },
            _ => self.xs,
        }
    }

    pub fn fissile(&self) -> bool {
        self.kind == Kind::Fuel || self.xs.nf1 > 0.0 || self.xs.nf2 > 0.0
    }
}
