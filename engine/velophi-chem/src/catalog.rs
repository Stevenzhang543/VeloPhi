//! The catalogue (26.64, D262, D263; engine/CHEM.md "Data files"): substances outside the aqueous network, the
//! enthalpies of formation, the forms of solids, the shelf reagents, the declared reactions and the electrode
//! couples. Read once with `chemSetData`; ids it cannot resolve are reported, never guessed.

use std::collections::BTreeMap;

use serde_json::{json, Value};
use velophi_core::message::SimResult;
use velophi_core::transport::dnum;

use crate::db::{Database, Gamma, Phase, Species, C_H2O};

/// What the catalogue knows about a species beyond the network (index-aligned with `Database::species`).
#[derive(Clone, Debug)]
pub struct Extra {
    /// Standard enthalpy of formation at 298.15 K, J/mol (NaN: unknown).
    pub hf: f64,
    /// Molar heat capacity, J/(mol·K) (NaN: unknown).
    pub cp: f64,
    /// Density, g/cm³ (NaN: unknown).
    pub rho: f64,
    /// What one mole becomes in water: (species, ν). Empty: it does not dissolve by itself.
    pub dissolves: Vec<(usize, f64)>,
    /// A table salt: (T/K, molality of formula units at saturation), ascending in T.
    pub solubility: Vec<(f64, f64)>,
    /// Enthalpy of solution, J/mol (NaN: from the enthalpies of formation).
    pub hsol: f64,
    /// Melting and boiling points (K), enthalpies of fusion and vaporisation (J/mol); NaN: unknown.
    pub tm: f64,
    pub tb: f64,
    pub hfus: f64,
    pub hvap: f64,
    /// Ignition temperature in air (K); NaN: does not burn or unknown.
    pub tign: f64,
    /// Partition coefficients of solutes between this solvent and water: (solute, c_solvent / c_water).
    pub extracts: Vec<(usize, f64)>,
}

impl Default for Extra {
    fn default() -> Self {
        Extra { hf: f64::NAN, cp: f64::NAN, rho: f64::NAN, dissolves: Vec::new(), solubility: Vec::new(), hsol: f64::NAN, tm: f64::NAN, tb: f64::NAN, hfus: f64::NAN, hvap: f64::NAN, tign: f64::NAN, extracts: Vec::new() }
    }
}

/// Kind of a shelf reagent.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReagentKind {
    Solution,
    Solid,
    Liquid,
    Gas,
}

/// A bottle on the shelf.
#[derive(Clone, Debug)]
pub struct Reagent {
    pub id: String,
    pub kind: ReagentKind,
    /// Species per `water_kg` of water (a solution) or per mole of reagent (a pure substance).
    pub species: Vec<(usize, f64)>,
    /// Water of the recipe, kg (0 for a pure substance).
    pub water_kg: f64,
    /// Density of a solution or liquid, g/mL (NaN: unknown — 1 g/mL is then assumed and flagged).
    pub rho: f64,
    /// Form of a solid (`powder`, `granule` …).
    pub form: String,
    /// Outside the range of the aqueous activity model (concentrated sulfuric acid).
    pub beyond_model: bool,
}

/// Rate law of a declared reaction.
#[derive(Clone, Debug)]
pub enum Law {
    /// Declared not to happen (passivation, an inert pair): the interface can say why.
    None,
    /// Known to happen, but outside what the model computes (zinc with nitric acid: a mixture of products): the bench
    /// says "not modelled" for it.
    Unmodelled,
    /// To the limiting reagent, or — with an equilibrium constant (ln K = a + b/T) — to the extent at which the
    /// reaction quotient reaches it; `reversible`: it may also run backwards.
    Instant { ln_k: Option<(f64, f64)>, reversible: bool },
    /// mol/(kg water·s) = k(T)·Π a^n.
    Mass { k: f64, orders: Vec<(usize, f64)>, ea: f64, tref: f64 },
    /// mol/(m²·s) on the solid `on` (else the first solid of the equation).
    Surface { k: f64, orders: Vec<(usize, f64)>, ea: f64, tref: f64, on: Option<usize> },
    /// First-order decomposition, s⁻¹ = A·exp(−Ea/RT), of the species `of` (else the first reactant).
    Thermal { a: f64, ea: f64, of: Option<usize> },
    /// Like `Mass`, times the amount of catalyst (mol) per kg of water.
    Catalytic { catalyst: usize, k: f64, orders: Vec<(usize, f64)>, ea: f64, tref: f64 },
}

/// Conditions of a declared reaction.
#[derive(Clone, Debug, Default)]
pub struct Needs {
    /// Lowest temperature, K (0: none).
    pub t_min: f64,
    /// Highest temperature, K (infinite: none).
    pub t_max: f64,
    /// Highest activity of each named species (nitrate must be absent for a metal to give hydrogen …).
    pub max: Vec<(usize, f64)>,
    /// Solids that must not be saturated (lead stops dissolving once its chloride or sulfate coats it).
    pub unsaturated: Vec<usize>,
    pub ignite: bool,
    pub light: bool,
    /// Lowest activity (dissolved species) or amount per kg water of each named species.
    pub min: Vec<(usize, f64)>,
}

/// A declared reaction.
#[derive(Clone, Debug)]
pub struct Reaction {
    pub id: String,
    /// (species, ν), negative: consumed.
    pub eq: Vec<(usize, f64)>,
    /// The species a "none" or "unmodelled" entry is about.
    pub between: Vec<usize>,
    pub law: Law,
    pub needs: Needs,
    pub effects: Vec<String>,
    pub teaching: bool,
}

/// An electrode couple: ox + n e⁻ → red.
#[derive(Clone, Debug)]
pub struct Electrode {
    pub id: String,
    pub ox: Vec<(usize, f64)>,
    pub red: Vec<(usize, f64)>,
    pub n: f64,
    pub e0: f64,
    /// Thermodynamically possible but too slow to count at an electrode (nitrate, sulfate, perchlorate in dilute
    /// solution): never chosen in the discharge order.
    pub inert: bool,
    /// Runs at an electrode (false: a couple that needs oxygen transfer or an unstable intermediate — chlorate,
    /// peroxide, copper(I) — and is too slow to compete in the discharge order).
    pub at_electrode: bool,
}

/// Dissolution kinetics of a network solid in a coarse form: mol/(m²·s) = (k_acid·a_H^n + k_neutral)·(1 − Ω).
#[derive(Clone, Copy, Debug)]
pub struct Dissolution {
    pub k_acid: f64,
    pub n_acid: f64,
    pub ea_acid: f64,
    pub k_neutral: f64,
    pub ea_neutral: f64,
    /// The carbonate mechanism: k·p(CO2)^n.
    pub k_carbonate: f64,
    pub n_carbonate: f64,
    pub ea_carbonate: f64,
}

/// A solid that dissolves by the solubility table (or completely, when it has none): what one mole adds to the
/// solution.
#[derive(Clone, Debug)]
pub struct TableSalt {
    pub species: usize,
    /// Components of the network it brings, water and protons left out: (component, ν). Their molalities form the
    /// concentration product that is compared with the product at saturation.
    pub comps: Vec<(usize, f64)>,
    /// Network species per mole (water of crystallisation included) and dissolved species outside the network.
    pub network: Vec<(usize, f64)>,
    pub solutes: Vec<(usize, f64)>,
    /// Moles of water per mole.
    pub water: f64,
    /// False: no table — it dissolves completely.
    pub limited: bool,
}

/// The catalogue of a core instance.
#[derive(Clone, Debug, Default)]
pub struct Catalog {
    /// Solids that dissolve by table, in the order of the species.
    pub table: Vec<TableSalt>,
    pub extra: Vec<Extra>,
    /// Specific area of each form, m² per cm³ of solid.
    pub forms: BTreeMap<String, f64>,
    pub reagents: BTreeMap<String, Reagent>,
    pub reactions: Vec<Reaction>,
    pub electrodes: Vec<Electrode>,
    pub dissolution: BTreeMap<usize, Dissolution>,
    /// Overpotential of gas evolution, V: (gas, electrode metal symbol) → value.
    pub overpotential: BTreeMap<(String, String), f64>,
    /// The classroom rule for chloride at an anode: (index of the chlorine couple, molality of chloride from which
    /// chlorine forms instead of oxygen).
    pub chloride_rule: Option<(usize, f64)>,
    /// Display spectra: molar absorption coefficients at 400, 420, … 700 nm, L/(mol·cm) (D267).
    pub spectra: BTreeMap<usize, [f64; crate::color::BANDS]>,
    /// Flame tests: element symbol → lines (wavelength in nm, relative power).
    pub flames: BTreeMap<String, Vec<(f64, f64)>>,
}

fn opt(v: &Value, k: &str) -> f64 {
    match v.get(k) {
        None | Some(Value::Null) => f64::NAN,
        Some(x) => dnum(x),
    }
}

/// `(species, ν)` of `{ id: ν }`; unknown ids go to `missing`.
fn pairs(db: &Database, v: Option<&Value>, missing: &mut Vec<String>) -> Vec<(usize, f64)> {
    let mut out = Vec::new();
    if let Some(o) = v.and_then(|v| v.as_object()) {
        for (id, n) in o {
            match db.find(id) {
                Some(s) => out.push((s, dnum(n))),
                None => missing.push(id.clone()),
            }
        }
    }
    out.sort_by(|a, b| a.0.cmp(&b.0));
    out
}

/// Formation enthalpies of the network species from those of the components and the reaction enthalpies.
fn derive_network_enthalpies(db: &mut Database) {
    let n = db.species.len();
    for i in 0..n {
        if db.species[i].component.is_some() || !db.species[i].in_network() || db.cat.extra[i].hf.is_finite() {
            continue;
        }
        let mut hf = db.species[i].delta_h_at(298.15);
        for &(j, nu) in &db.species[i].rxn {
            hf += nu * db.cat.extra[db.components[j]].hf;
        }
        db.cat.extra[i].hf = hf;
    }
}

/// What a bench file defines for itself (D263 "用户可以自定义"): acids and bases by their pKa values, and — in the
/// catalogue's own format — substances, reagents, declared reactions and couples. It extends a copy of the database
/// that belongs to that bench alone; everything defined here is marked `user` as its source, and the interface says
/// so wherever it shows.
///
/// An acid: `{ "base": "Lac-", "z": -1, "M": 89.07, "pKa": [3.86], "forms"?: ["HLac"] }` — the fully deprotonated
/// form becomes a component, and each protonated form H_kB a species with the cumulative constant (pKa values in the
/// order of dissociation, strongest first). Enthalpies are unknown: heat effects of these species are not counted,
/// and the bench reports that.
pub fn apply_custom(db: &mut Database, custom: &Value) -> SimResult<Vec<Value>> {
    let mut notes = Vec::new();
    for a in custom.get("acids").and_then(|v| v.as_array()).cloned().unwrap_or_default() {
        let Some(base) = a.get("base").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) else { continue };
        let pkas: Vec<f64> = a.get("pKa").and_then(|v| v.as_array()).map(|x| x.iter().map(dnum).collect()).unwrap_or_default();
        if db.by_id.contains_key(base) || pkas.is_empty() || pkas.iter().any(|p| !p.is_finite()) || pkas.len() > 6 {
            notes.push(json!({ "code": "custom.invalid", "severity": "error", "params": { "in": base } }));
            continue;
        }
        let z = a.get("z").map(dnum).filter(|v| v.is_finite()).unwrap_or(-(pkas.len() as f64));
        let molar = a.get("M").map(dnum).filter(|v| v.is_finite() && *v > 0.0).unwrap_or(0.0);
        let hydrogen = 1.008;
        let component = db.components.len();
        let index = db.species.len();
        db.by_id.insert(base.to_string(), index);
        db.components.push(index);
        db.species.push(Species { id: base.to_string(), phase: Phase::Aq, z, comp: Vec::new(), molar_mass: molar, component: Some(component), rxn: vec![(component, 1.0)], log_k: [0.0; 6], gamma: if z == 0.0 { Gamma::Neutral } else { Gamma::Davies }, forms: false, src: "user".to_string() });
        let names: Vec<String> = a.get("forms").and_then(|v| v.as_array()).map(|x| x.iter().filter_map(|s| s.as_str().map(|s| s.to_string())).collect()).unwrap_or_default();
        let mut beta = 0.0;
        for k in 1..=pkas.len() {
            // The k-th proton taken up is the one lost last: cumulative protonation constants
            beta += pkas[pkas.len() - k];
            let zk = z + k as f64;
            let id = names.get(k - 1).cloned().unwrap_or_else(|| format!("H{}{}", if k > 1 { k.to_string() } else { String::new() }, base));
            if db.by_id.contains_key(&id) {
                notes.push(json!({ "code": "custom.invalid", "severity": "error", "params": { "in": id } }));
                continue;
            }
            let i = db.species.len();
            db.by_id.insert(id.clone(), i);
            db.species.push(Species { id, phase: Phase::Aq, z: zk, comp: Vec::new(), molar_mass: molar + k as f64 * hydrogen, component: None, rxn: vec![(crate::db::C_H, k as f64), (component, 1.0)], log_k: [beta, 0.0, 0.0, 0.0, 0.0, 0.0], gamma: if zk == 0.0 { Gamma::Neutral } else { Gamma::Davies }, forms: false, src: "user".to_string() });
        }
    }
    db.cat.extra.resize(db.species.len(), Extra::default());
    notes.extend(apply(db, custom)?);
    db.index();
    Ok(notes)
}

/// Read a `velophi-chemcat` document into the database. Returns diagnostics about what could not be resolved.
pub fn apply(db: &mut Database, doc: &Value) -> SimResult<Vec<Value>> {
    let mut notes = Vec::new();
    // Substances: new species outside the network
    for s in doc.get("substances").and_then(|v| v.as_array()).cloned().unwrap_or_default() {
        let Some(id) = s.get("id").and_then(|v| v.as_str()) else { continue };
        if db.by_id.contains_key(id) {
            continue;
        }
        let phase = match s.get("phase").and_then(|v| v.as_str()) {
            Some("s") => Phase::Solid,
            Some("l") => Phase::Liquid,
            Some("g") => Phase::Gas,
            _ => Phase::Aq,
        };
        let mut comp: Vec<(String, f64)> = s.get("comp").and_then(|v| v.as_object()).map(|o| o.iter().map(|(k, v)| (k.clone(), dnum(v))).collect()).unwrap_or_default();
        comp.sort_by(|a, b| a.0.cmp(&b.0));
        let index = db.species.len();
        db.by_id.insert(id.to_string(), index);
        db.species.push(Species { id: id.to_string(), phase, z: 0.0, comp, molar_mass: opt(&s, "M"), component: None, rxn: Vec::new(), log_k: [0.0; 6], gamma: Gamma::Neutral, forms: false, src: s.get("src").and_then(|v| v.as_str()).unwrap_or("").to_string() });
    }
    db.cat.extra.resize(db.species.len(), Extra::default());
    for s in doc.get("substances").and_then(|v| v.as_array()).cloned().unwrap_or_default() {
        let Some(index) = s.get("id").and_then(|v| v.as_str()).and_then(|id| db.find(id)) else { continue };
        let mut missing = Vec::new();
        let dissolves = pairs(db, s.get("dissolves"), &mut missing);
        let extracts = pairs(db, s.get("extracts"), &mut missing);
        if !missing.is_empty() {
            notes.push(json!({ "code": "catalog.unknownSpecies", "severity": "error", "params": { "in": db.species[index].id, "ids": missing } }));
        }
        let molar = db.species[index].molar_mass;
        // g of the anhydrous salt per 100 g water → molality of formula units; the anhydrous molar mass is the
        // salt's without its water of crystallisation
        let water_per_formula: f64 = dissolves.iter().filter(|d| d.0 == db.components[C_H2O]).map(|d| d.1).sum();
        let anhydrous = molar - water_per_formula * db.species[db.components[C_H2O]].molar_mass;
        let mut solubility: Vec<(f64, f64)> = s
            .get("solubility")
            .and_then(|v| v.get("points"))
            .and_then(|v| v.as_array())
            .map(|a| a.iter().filter_map(|p| p.as_array()).filter(|p| p.len() >= 2).map(|p| (dnum(&p[0]), dnum(&p[1]) * 10.0 / anhydrous)).collect())
            .unwrap_or_default();
        solubility.retain(|p| p.0.is_finite() && p.1.is_finite() && p.1 > 0.0);
        solubility.sort_by(|a, b| a.0.total_cmp(&b.0));
        let kj = |k: &str| opt(&s, k) * 1e3;
        db.cat.extra[index] = Extra { hf: kj("Hf"), cp: opt(&s, "cp"), rho: opt(&s, "rho"), dissolves, solubility, hsol: kj("Hsol"), tm: opt(&s, "Tm"), tb: opt(&s, "Tb"), hfus: kj("Hfus"), hvap: kj("Hvap"), tign: opt(&s, "Tign"), extracts };
    }
    // Enthalpies of formation of the components, then of the whole network
    if let Some(o) = doc.get("thermo").and_then(|t| t.get("Hf")).and_then(|v| v.as_object()) {
        for (id, v) in o {
            if let Some(i) = db.find(id) {
                if !v.is_null() {
                    db.cat.extra[i].hf = dnum(v) * 1e3;
                }
            }
        }
    }
    derive_network_enthalpies(db);
    // An enthalpy of solution fixes the enthalpy of formation of a solid whose own is not given; then the table salts
    db.cat.table.clear();
    for i in 0..db.species.len() {
        let e = db.cat.extra[i].clone();
        if e.dissolves.is_empty() || db.species[i].phase != Phase::Solid {
            continue;
        }
        if !e.hf.is_finite() && e.hsol.is_finite() {
            let products: f64 = e.dissolves.iter().map(|&(k, nu)| nu * db.cat.extra[k].hf).sum();
            db.cat.extra[i].hf = products - e.hsol;
        }
        // A solid of the network has its solubility product there (with pH, complexes and the common-ion effect).
        // For a sparingly soluble one that is the better description: a handbook table on top of it would
        // precipitate calcium hydroxide from calcium chloride by taking the hydroxide out of the water. For a freely
        // soluble salt (copper sulfate, 1.4 mol/kg) the activity model is out of its range at saturation, and the
        // handbook table is what the bench follows. The line between them: 0.1 mol of formula units per kg of water
        // near room temperature.
        if db.species[i].in_network() {
            let near_room = e.solubility.iter().min_by(|a, b| (a.0 - 298.15).abs().total_cmp(&(b.0 - 298.15).abs())).map(|p| p.1);
            let molality = near_room.unwrap_or(0.0);
            if !(molality >= 0.1) {
                continue;
            }
        }
        let mut totals = vec![0.0; db.components.len()];
        let (mut network, mut solutes) = (Vec::new(), Vec::new());
        for &(k, nu) in &e.dissolves {
            if db.species[k].in_network() {
                db.add_to_totals(k, nu, &mut totals);
                network.push((k, nu));
            } else {
                solutes.push((k, nu));
            }
        }
        let comps: Vec<(usize, f64)> = totals.iter().enumerate().filter(|&(j, v)| j > crate::db::C_H && *v > 0.0).map(|(j, v)| (j, *v)).collect();
        db.cat.table.push(TableSalt { species: i, comps, network, solutes, water: totals[C_H2O], limited: !e.solubility.is_empty() });
    }
    // Forms and precipitates
    if let Some(forms) = doc.get("forms") {
        for (k, v) in forms.as_object().cloned().unwrap_or_default() {
            if k != "precipitates" && v.is_number() {
                db.cat.forms.insert(k, dnum(&v));
            }
        }
        let list: Vec<String> = forms.get("precipitates").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect()).unwrap_or_default();
        let unknown = db.set_forms(&list);
        if !unknown.is_empty() {
            notes.push(json!({ "code": "catalog.unknownSpecies", "severity": "error", "params": { "in": "forms.precipitates", "ids": unknown } }));
        }
    }
    // Reagents
    for r in doc.get("reagents").and_then(|v| v.as_array()).cloned().unwrap_or_default() {
        let Some(id) = r.get("id").and_then(|v| v.as_str()) else { continue };
        let kind = match r.get("kind").and_then(|v| v.as_str()) {
            Some("solid") => ReagentKind::Solid,
            Some("liquid") => ReagentKind::Liquid,
            Some("gas") => ReagentKind::Gas,
            _ => ReagentKind::Solution,
        };
        let recipe = r.get("recipe").cloned().unwrap_or(Value::Null);
        let mut missing = Vec::new();
        let species = pairs(db, recipe.get("species"), &mut missing);
        if !missing.is_empty() {
            notes.push(json!({ "code": "catalog.unknownSpecies", "severity": "error", "params": { "in": id, "ids": missing } }));
            continue;
        }
        let water_kg = recipe.get("water_kg").map(dnum).filter(|v| v.is_finite()).unwrap_or(0.0);
        db.cat.reagents.insert(id.to_string(), Reagent { id: id.to_string(), kind, species, water_kg, rho: opt(&r, "rho"), form: r.get("form").and_then(|v| v.as_str()).unwrap_or("powder").to_string(), beyond_model: r.get("beyondModel").and_then(|v| v.as_bool()).unwrap_or(false) });
    }
    // Declared reactions
    for r in doc.get("reactions").and_then(|v| v.as_array()).cloned().unwrap_or_default() {
        let Some(id) = r.get("id").and_then(|v| v.as_str()) else { continue };
        let mut missing = Vec::new();
        let eq = pairs(db, r.get("eq"), &mut missing);
        let rate = r.get("rate").cloned().unwrap_or(Value::Null);
        let orders = pairs(db, rate.get("orders"), &mut missing);
        let (k, ea, tref) = (opt(&rate, "k"), opt(&rate, "Ea") * 1e3, rate.get("Tref").map(dnum).filter(|v| v.is_finite()).unwrap_or(298.15));
        let ea = if ea.is_finite() { ea } else { 0.0 };
        let law = match rate.get("law").and_then(|v| v.as_str()).unwrap_or("none") {
            "instant" => Law::Instant { ln_k: rate.get("lnK").and_then(|v| v.as_array()).filter(|a| a.len() >= 2).map(|a| (dnum(&a[0]), dnum(&a[1]))), reversible: rate.get("reversible").and_then(|v| v.as_bool()).unwrap_or(false) },
            "mass" => Law::Mass { k, orders, ea, tref },
            "surface" => Law::Surface { k, orders, ea, tref, on: rate.get("on").and_then(|v| v.as_str()).and_then(|x| db.find(x)) },
            "thermal" => Law::Thermal { a: opt(&rate, "A"), ea, of: rate.get("of").and_then(|v| v.as_str()).and_then(|x| db.find(x)) },
            "unmodelled" => Law::Unmodelled,
            "catalytic" => match rate.get("catalyst").and_then(|v| v.as_str()).and_then(|c| db.find(c)) {
                Some(catalyst) => Law::Catalytic { catalyst, k, orders, ea, tref },
                None => {
                    missing.push(rate.get("catalyst").and_then(|v| v.as_str()).unwrap_or("?").to_string());
                    Law::None
                }
            },
            _ => Law::None,
        };
        let n = r.get("needs").cloned().unwrap_or(Value::Null);
        let unsaturated: Vec<usize> = n.get("unsaturated").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|x| x.as_str()).filter_map(|x| db.find(x)).collect()).unwrap_or_default();
        let between: Vec<usize> = r.get("between").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|x| x.as_str()).filter_map(|x| db.find(x)).collect()).unwrap_or_default();
        let needs = Needs { t_max: n.get("Tmax").map(dnum).filter(|v| v.is_finite()).unwrap_or(f64::INFINITY), max: pairs(db, n.get("max"), &mut missing), unsaturated, t_min: n.get("Tmin").map(dnum).filter(|v| v.is_finite()).unwrap_or(0.0), ignite: n.get("ignite").and_then(|v| v.as_bool()).unwrap_or(false), light: n.get("light").and_then(|v| v.as_bool()).unwrap_or(false), min: pairs(db, n.get("min"), &mut missing) };
        if !missing.is_empty() {
            notes.push(json!({ "code": "catalog.unknownSpecies", "severity": "error", "params": { "in": id, "ids": missing } }));
            continue;
        }
        let effects = r.get("effects").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect()).unwrap_or_default();
        db.cat.reactions.push(Reaction { id: id.to_string(), eq, between, law, needs, effects, teaching: r.get("teaching").and_then(|v| v.as_bool()).unwrap_or(false) });
    }
    // Dissolution kinetics of coarse network solids
    if let Some(o) = doc.get("dissolution").and_then(|v| v.as_object()) {
        for (id, d) in o {
            match db.find(id) {
                Some(s) => {
                    let z = |k: &str| {
                        let v = opt(d, k);
                        if v.is_finite() {
                            v
                        } else {
                            0.0
                        }
                    };
                    db.cat.dissolution.insert(s, Dissolution { k_acid: z("kAcid"), n_acid: z("nAcid"), ea_acid: z("EaAcid") * 1e3, k_neutral: z("kNeutral"), ea_neutral: z("EaNeutral") * 1e3, k_carbonate: z("kCarbonate"), n_carbonate: z("nCarbonate"), ea_carbonate: z("EaCarbonate") * 1e3 });
                }
                None => notes.push(json!({ "code": "catalog.unknownSpecies", "severity": "error", "params": { "in": "dissolution", "ids": [id] } })),
            }
        }
    }
    // Overpotentials of gas evolution: { "H2": { "Pt": 0.05, … }, … }
    if let Some(o) = doc.get("electrolysis").and_then(|e| e.get("overpotential")).and_then(|v| v.as_object()) {
        for (gas, by_metal) in o {
            for (metal, v) in by_metal.as_object().cloned().unwrap_or_default() {
                if v.is_number() {
                    db.cat.overpotential.insert((gas.clone(), metal), dnum(&v));
                }
            }
        }
    }
    // Display spectra and flame lines
    if let Some(o) = doc.get("spectra").and_then(|v| v.as_object()) {
        for (id, list) in o {
            let values: Vec<f64> = list.as_array().map(|a| a.iter().map(dnum).collect()).unwrap_or_default();
            match db.find(id) {
                Some(s) if values.len() == crate::color::BANDS && values.iter().all(|x| x.is_finite() && *x >= 0.0) => {
                    let mut e = [0.0; crate::color::BANDS];
                    e.copy_from_slice(&values);
                    db.cat.spectra.insert(s, e);
                }
                Some(_) => notes.push(json!({ "code": "catalog.invalid", "severity": "error", "params": { "in": "spectra", "ids": [id] } })),
                None => notes.push(json!({ "code": "catalog.unknownSpecies", "severity": "error", "params": { "in": "spectra", "ids": [id] } })),
            }
        }
    }
    if let Some(o) = doc.get("flames").and_then(|v| v.as_object()) {
        for (element, list) in o {
            let lines: Vec<(f64, f64)> = list.as_array().map(|a| a.iter().map(|l| (l.get(0).map(dnum).unwrap_or(f64::NAN), l.get(1).map(dnum).unwrap_or(f64::NAN))).filter(|l| l.0.is_finite() && l.1.is_finite() && l.1 > 0.0).collect()).unwrap_or_default();
            db.cat.flames.insert(element.clone(), lines);
        }
    }
    // Electrode couples
    for c in doc.get("couples").and_then(|v| v.as_array()).cloned().unwrap_or_default() {
        let Some(id) = c.get("id").and_then(|v| v.as_str()) else { continue };
        let mut missing = Vec::new();
        let ox = pairs(db, c.get("ox"), &mut missing);
        let red = pairs(db, c.get("red"), &mut missing);
        if !missing.is_empty() {
            notes.push(json!({ "code": "catalog.unknownSpecies", "severity": "info", "params": { "in": id, "ids": missing } }));
            continue;
        }
        db.cat.electrodes.push(Electrode { id: id.to_string(), ox, red, n: opt(&c, "n"), e0: opt(&c, "E0"), inert: c.get("inert").and_then(|v| v.as_bool()).unwrap_or(false), at_electrode: c.get("electrode").and_then(|v| v.as_bool()).unwrap_or(true) });
    }
    // The chloride rule names a couple: resolved once the couples are read
    if let Some(rule) = doc.get("electrolysis").and_then(|e| e.get("chloride")) {
        let id = rule.get("couple").and_then(|v| v.as_str()).unwrap_or("");
        let threshold = opt(rule, "threshold");
        db.cat.chloride_rule = db.cat.electrodes.iter().position(|c| c.id == id).filter(|_| threshold > 0.0).map(|k| (k, threshold));
    }
    Ok(notes)
}
