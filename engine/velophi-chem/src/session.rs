//! The bench session (26.64, D268): a `velophi-bench` document — the objects on the bench, the room and the log of
//! actions — held in the core. Every action of the interface is one entry of the log; the session executes it and the
//! interface reads the state back to draw it. The same log gives the same state, bit for bit, on every build: that is
//! what share links, undo, reports and Copilot's bench tools rest on.
//!
//! The document:
//!
//! ```json
//! { "format": "velophi-bench", "version": 1, "engine": "26.64.0",
//!   "settings": { "ambientT": 298.15, "ambientP": 101325 },
//!   "objects": [ { "id": "flaskA", "kind": "erlenmeyer", "capacity_mL": 250, "x": 0.3, "y": 0 } ],
//!   "log": [ { "act": "add", "to": "flaskA", "reagent": "HCl_0.1M", "amount": { "value": 20, "unit": "mL" } },
//!            { "act": "wait", "seconds": 0.5, "times": 20 } ] }
//! ```
//!
//! Positions and other fields of an object the core does not know are kept as given: they only matter to the drawing.
//! So is the document's `fixtures` list (26.65): the things on the bench that are not vessels.
//! An entry of the log names its action with `act` (a request to the session names its operation with `op`).

use std::rc::Rc;

use serde_json::{json, Value};
use velophi_core::dmath;
use velophi_core::message::{Message, SimResult};
use velophi_core::transport::{dnum, jnum, Blob};

use crate::bench::{Ambient, Bench, Vessel};
use crate::db::{self, Database, C_H2O};
use crate::equil::APPROX_I;

/// Pascal per standard atmosphere.
const PA_PER_ATM: f64 = 101_325.0;
/// States kept for undo.
const HISTORY: usize = 200;

/// A state to return to: the bench, the objects and the log as they were.
#[derive(Clone)]
struct Snapshot {
    bench: Bench,
    objects: Vec<Value>,
    log: Vec<Value>,
}

/// A bench held by the core.
pub struct BenchSession {
    db: Rc<Database>,
    bench: Bench,
    objects: Vec<Value>,
    /// The objects and the room the document started with: what `document` writes, so that the log replays from
    /// the same beginning (objects placed later are in the log).
    initial_objects: Vec<Value>,
    initial_settings: Value,
    custom: Value,
    /// Things on the bench that are not vessels (26.65, D297: stands, tripods, burners, reagent bottles, tubes …):
    /// drawing only, kept as given and written back by `document`. Not chemistry, not in the log, not undone.
    fixtures: Vec<Value>,
    log: Vec<Value>,
    past: Vec<Snapshot>,
    future: Vec<Snapshot>,
    /// What could not be resolved in the file's own definitions.
    custom_notes: Vec<Value>,
}

fn object_id(o: &Value) -> &str {
    o.get("id").and_then(|v| v.as_str()).unwrap_or("")
}

impl BenchSession {
    /// Create a session from `{ bench? }`: the objects are placed and the log is replayed. A log entry that fails
    /// makes the whole request fail (a document is either loaded as it was or not at all).
    pub fn create(req: &Value) -> SimResult<BenchSession> {
        let mut db = db::database()?;
        let doc = req.get("bench").cloned().unwrap_or(Value::Null);
        // What the file defines for itself extends a copy of the database that belongs to this bench
        let mut custom_notes = Vec::new();
        if let Some(custom) = doc.get("custom").filter(|c| c.as_object().map(|o| !o.is_empty()).unwrap_or(false)) {
            let mut own = (*db).clone();
            custom_notes = crate::catalog::apply_custom(&mut own, custom)?;
            db = Rc::new(own);
        }
        let mut s = BenchSession { db, bench: Bench::new(), objects: Vec::new(), initial_objects: Vec::new(), initial_settings: Value::Null, custom: doc.get("custom").cloned().unwrap_or(Value::Null), fixtures: doc.get("fixtures").and_then(|v| v.as_array()).cloned().unwrap_or_default(), log: Vec::new(), past: Vec::new(), future: Vec::new(), custom_notes };
        if let Some(settings) = doc.get("settings") {
            if let Some(t) = settings.get("ambientT").map(dnum).filter(|v| v.is_finite() && *v > 100.0) {
                s.bench.ambient.t = t;
            }
            if let Some(p) = settings.get("ambientP").map(dnum).filter(|v| v.is_finite() && *v > 0.0) {
                s.bench.ambient.p = p / PA_PER_ATM;
            }
        }
        for o in doc.get("objects").and_then(|v| v.as_array()).cloned().unwrap_or_default() {
            s.bench.apply(&s.db.clone(), &json!({ "act": "place", "object": o }))?;
            s.objects.push(o.clone());
            s.initial_objects.push(o);
        }
        s.initial_settings = json!({ "ambientT": jnum(s.bench.ambient.t), "ambientP": jnum(s.bench.ambient.p * PA_PER_ATM) });
        for entry in doc.get("log").and_then(|v| v.as_array()).cloned().unwrap_or_default() {
            let times = entry.get("times").map(dnum).filter(|v| v.is_finite() && *v >= 1.0).unwrap_or(1.0) as usize;
            for _ in 0..times {
                s.run(&entry)?;
            }
            s.log.push(entry);
        }
        Ok(s)
    }

    /// Execute one action on the bench (and keep the objects in step with `place` and `remove`).
    fn run(&mut self, action: &Value) -> SimResult<Vec<Value>> {
        let db = Rc::clone(&self.db);
        let events = self.bench.apply(&db, action)?;
        match action.get("act").and_then(|v| v.as_str()) {
            Some("place") => {
                if let Some(o) = action.get("object") {
                    self.objects.push(o.clone());
                }
            }
            Some("remove") => {
                let id = action.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                self.objects.retain(|o| object_id(o) != id);
            }
            _ => {}
        }
        Ok(events)
    }

    fn snapshot(&self) -> Snapshot {
        Snapshot { bench: self.bench.clone(), objects: self.objects.clone(), log: self.log.clone() }
    }

    fn restore(&mut self, s: Snapshot) {
        self.bench = s.bench;
        self.objects = s.objects;
        self.log = s.log;
    }

    fn remember(&mut self, before: Snapshot) {
        self.past.push(before);
        if self.past.len() > HISTORY {
            self.past.remove(0);
        }
        self.future.clear();
    }

    fn document(&self) -> Value {
        json!({
            "format": "velophi-bench",
            "version": 1,
            "engine": env!("CARGO_PKG_VERSION"),
            "settings": self.initial_settings,
            "objects": self.initial_objects,
            "custom": self.custom,
            "fixtures": self.fixtures,
            "log": self.log
        })
    }

    fn vessel_summary(&self, v: &Vessel) -> Value {
        let db = &self.db;
        let ambient = self.bench.ambient;
        let solids: Vec<Value> = v.solids.iter().map(|l| json!({ "id": db.species[l.species].id, "form": l.form, "n": jnum(l.n), "g": jnum(l.n * db.species[l.species].molar_mass) })).collect();
        let map = |m: &std::collections::BTreeMap<usize, f64>| m.iter().filter(|x| *x.1 > 0.0).map(|(&i, &n)| json!({ "id": db.species[i].id, "n": jnum(n) })).collect::<Vec<_>>();
        let mut out = json!({
            "id": v.id, "kind": v.kind, "T": jnum(v.t), "volume_mL": jnum(v.volume_l * 1e3), "capacity_mL": jnum(v.capacity_l * 1e3), "mass_g": jnum(v.mass(db)),
            "closed": v.closed, "P": jnum(v.pressure(ambient) * PA_PER_ATM), "heater": jnum(v.heater), "bath": v.bath.map(jnum).unwrap_or(Value::Null), "ignited": v.ignited, "lit": v.lit,
            "cracked": v.cracked, "spilled_mL": jnum(v.spilled_l * 1e3),
            "solids": solids, "liquids": map(&v.liquids), "gas": map(&v.gas), "released": map(&v.released), "solutes": map(&v.solutes)
        });
        out["outlet"] = v.outlet.clone().map(Value::String).unwrap_or(Value::Null);
        out["collect"] = json!(v.collect.name());
        // Volume of the gas held, measured at the room's pressure and the vessel's temperature
        out["gas_mL"] = jnum(v.gas.values().sum::<f64>() * crate::db::R_L_ATM * v.t / ambient.p * 1e3);
        if let Some(s) = &v.sol {
            out["pH"] = jnum(s.ph());
            out["I"] = jnum(s.ionic_strength);
            out["water_g"] = jnum(s.water_kg * 1e3);
        }
        // What it looks like (D267): white light through the width of the vessel
        let width = crate::color::width_cm(v);
        out["width_cm"] = jnum(width);
        if let Some(a) = crate::color::solution(db, v) {
            let c = crate::color::transmitted(&crate::color::through(&a, width));
            out["colour"] = json!([c[0], c[1], c[2]]);
            out["absorbance"] = a.iter().map(|&x| jnum(x)).collect();
        }
        if let Some(a) = crate::color::head_space(db, v) {
            let c = crate::color::transmitted(&crate::color::through(&a, width));
            out["gasColour"] = json!([c[0], c[1], c[2]]);
        }
        out
    }

    /// Everything about one vessel: the three representations read from here (D267).
    fn read(&self, v: &Vessel) -> Value {
        let db = &self.db;
        let mut out = self.vessel_summary(v);
        let mut diagnostics = Vec::new();
        if let Some(s) = &v.sol {
            let litres = v.volume_l.max(1e-12);
            let mut species: Vec<Value> = s
                .aqueous
                .iter()
                .filter(|x| x.1 * s.water_kg > 1e-18)
                .map(|&(i, m, lg)| json!({ "id": db.species[i].id, "z": jnum(db.species[i].z), "n": jnum(m * s.water_kg), "m": jnum(m), "c": jnum(m * s.water_kg / litres), "a": jnum(m * dmath::exp(lg)) }))
                .collect();
            species.sort_by(|a, b| dnum(&b["n"]).total_cmp(&dnum(&a["n"])));
            out["species"] = Value::Array(species);
            out["water_mol"] = jnum(s.water_kg / (db.species[db.components[C_H2O]].molar_mass * 1e-3));
            out["aw"] = jnum(s.activity_of_water());
            out["si"] = s.si.iter().filter(|x| x.1 > -3.0).map(|&(i, v)| json!({ "id": db.species[i].id, "si": jnum(v) })).collect();
            out["pressures"] = s.pressure.iter().filter(|x| x.1 > 1e-12).map(|&(i, p)| json!({ "id": db.species[i].id, "p": jnum(p) })).collect();
            if s.ionic_strength > APPROX_I {
                diagnostics.push(crate::ops::diagnostic("equil.concentrated", "approx", json!({ "I": jnum(s.ionic_strength) })));
            }
            if s.beyond_model {
                diagnostics.push(crate::ops::diagnostic("equil.beyondActivityModel", "approx", json!({ "I": jnum(s.ionic_strength) })));
            }
        }
        if v.beyond_model {
            diagnostics.push(crate::ops::diagnostic("bench.beyondModel", "approx", json!({})));
        }
        // Declared "does not react" and "happens but is not modelled" entries whose species are all here
        for r in &db.cat.reactions {
            let kind = match r.law {
                crate::catalog::Law::None => ("reaction.none", "info"),
                crate::catalog::Law::Unmodelled => ("reaction.unmodelled", "unmodelled"),
                _ => continue,
            };
            if !r.between.is_empty() && r.between.iter().all(|&s| crate::kinetics::activity(db, v, self.bench.ambient, s) > 0.0) && crate::kinetics::conditions_hold(db, v, self.bench.ambient, r) {
                diagnostics.push(crate::ops::diagnostic(kind.0, kind.1, json!({ "id": r.id })));
            }
        }
        for (oxidant, reductant, volts) in crate::echem::unmodelled_pairs(db, v, self.bench.ambient, 0.25) {
            diagnostics.push(crate::ops::diagnostic("redox.unmodelled", "unmodelled", json!({ "oxidant": oxidant, "reductant": reductant, "volts": jnum(volts) })));
        }
        let (_, unknown) = v.chemical_enthalpy(db);
        if !unknown.is_empty() {
            let ids: Vec<&str> = unknown.iter().map(|&i| db.species[i].id.as_str()).collect();
            diagnostics.push(crate::ops::diagnostic("thermal.unknownEnthalpy", "approx", json!({ "species": ids })));
        }
        out["heatCapacity"] = jnum(v.heat_capacity_total(db));
        out["diagnostics"] = Value::Array(diagnostics);
        out
    }

    fn state(&self) -> Value {
        json!({
            "time": jnum(self.bench.time),
            "ambient": { "T": jnum(self.bench.ambient.t), "P": jnum(self.bench.ambient.p * PA_PER_ATM) },
            "vessels": self.bench.vessels.values().map(|v| self.vessel_summary(v)).collect::<Vec<_>>(),
            "circuits": self.bench.circuits.values().map(|c| c.json(&self.db)).collect::<Vec<_>>(),
            "log": self.log.len(),
            "custom": self.custom_notes,
            "canUndo": !self.past.is_empty(),
            "canRedo": !self.future.is_empty()
        })
    }

    /// One operation as a result container.
    pub fn call_bytes(&mut self, req: &Value) -> SimResult<Vec<u8>> {
        let mut blob = Blob::default();
        let out = call(self, req, &mut blob)?;
        Ok(blob.finish(&out))
    }
}

/// One operation `{ op, … }` on a bench (engine/CHEM.md, "Bench session operations").
pub fn call(s: &mut BenchSession, req: &Value, _blob: &mut Blob) -> SimResult<Value> {
    let op = req.get("op").and_then(|v| v.as_str()).unwrap_or("");
    Ok(match op {
        "document" => json!({ "bench": s.document() }),
        "state" => s.state(),
        "apply" => {
            let action = req.get("action").cloned().unwrap_or(Value::Null);
            let before = s.snapshot();
            // An action that fails, or that would overfill a vessel, leaves the bench as it was
            let events = match s.run(&action) {
                Ok(e) => e,
                Err(m) => {
                    s.restore(before);
                    return Err(m);
                }
            };
            // a vessel with a brim has run over by now (26.65); one without, or a closed one, refuses what does not fit
            if let Some(v) = s.bench.vessels.values().find(|v| v.volume_l > v.limit_l() * (1.0 + 1e-9)) {
                let m = Message::new("chem.vesselFull").text("id", v.id.clone()).num("capacity", v.capacity_l * 1e3).num("volume", v.volume_l * 1e3);
                s.restore(before);
                return Err(m);
            }
            s.remember(before);
            s.log.push(action);
            json!({ "events": events, "state": s.state() })
        }
        "advance" => {
            // Time passing in real time arrives as many equal waits: they are one log entry with a count, and one
            // step of undo
            let seconds = req.get("seconds").map(dnum).filter(|v| v.is_finite() && *v >= 0.0).ok_or_else(|| Message::new("chem.badAmount").text("what", "seconds"))?;
            let action = json!({ "act": "wait", "seconds": jnum(seconds) });
            let repeats = s.log.last().map(|e| e.get("act").and_then(|v| v.as_str()) == Some("wait") && e.get("seconds").map(dnum) == Some(seconds)).unwrap_or(false);
            let before = s.snapshot();
            let events = s.run(&action)?;
            if repeats {
                let last = s.log.last_mut().expect("log");
                let times = last.get("times").map(dnum).filter(|v| v.is_finite()).unwrap_or(1.0);
                last["times"] = jnum(times + 1.0);
                s.future.clear();
            } else {
                s.remember(before);
                s.log.push(action);
            }
            json!({ "events": events, "state": s.state() })
        }
        "undo" => {
            let Some(snap) = s.past.pop() else { return Err(Message::new("chem.nothingToUndo")) };
            let now = s.snapshot();
            s.future.push(now);
            s.restore(snap);
            json!({ "state": s.state() })
        }
        "redo" => {
            let Some(snap) = s.future.pop() else { return Err(Message::new("chem.nothingToUndo")) };
            let now = s.snapshot();
            s.past.push(now);
            s.restore(snap);
            json!({ "state": s.state() })
        }
        "read" => {
            let id = req.get("vessel").and_then(|v| v.as_str()).unwrap_or("");
            let v = s.bench.vessels.get(id).ok_or_else(|| Message::new("chem.unknownVessel").text("id", id))?;
            s.read(v)
        }
        "clearReleased" => {
            for v in s.bench.vessels.values_mut() {
                v.released.clear();
            }
            json!({})
        }
        "layout" => {
            // Positions and other drawing fields of the objects: not chemistry, not in the log
            for o in req.get("objects").and_then(|v| v.as_array()).cloned().unwrap_or_default() {
                let id = object_id(&o);
                // The same fields on the object as it is now, as the document started with it, and as the log placed it
                let mut targets: Vec<&mut Value> = s.objects.iter_mut().filter(|x| object_id(x) == id).collect();
                targets.extend(s.initial_objects.iter_mut().filter(|x| object_id(x) == id));
                targets.extend(s.log.iter_mut().filter(|e| e.get("act").and_then(|v| v.as_str()) == Some("place")).filter_map(|e| e.get_mut("object")).filter(|x| object_id(x) == id));
                for mine in targets {
                    if let (Some(a), Some(b)) = (mine.as_object_mut(), o.as_object()) {
                        for (k, v) in b {
                            if !matches!(k.as_str(), "id" | "kind" | "capacity_mL" | "heat_J_K" | "loss_W_K" | "closed") {
                                a.insert(k.clone(), v.clone());
                            }
                        }
                    }
                }
            }
            // The things that are not vessels: the whole list, when it is given (26.65)
            if let Some(list) = req.get("fixtures").and_then(|v| v.as_array()) {
                s.fixtures = list.clone();
            }
            json!({ "objects": s.objects, "fixtures": s.fixtures })
        }
        "hash" => json!({ "hash": s.bench.hash(&s.db), "ambient": ambient_json(s.bench.ambient) }),
        _ => return Err(Message::new("err.internal").text("message", format!("bench {op}: unknown operation"))),
    })
}

fn ambient_json(a: Ambient) -> Value {
    json!({ "T": jnum(a.t), "P": jnum(a.p * PA_PER_ATM) })
}
