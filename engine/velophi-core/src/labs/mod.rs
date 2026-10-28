//! The lab (26.54, D76): stateless calculations of the experiments that do not fit the 2D rigid-body runtime —
//! field lines and potentials, DC circuits, geometric optics, atoms and light, radioactive decay, special
//! relativity and heat. Each experiment is one or two `calc_call` operations (engine/CALC.md); the interface only
//! edits, draws and shows the numbers (D65).

pub mod atom;
pub mod circuit;
pub mod decay;
pub mod field;
pub mod heat;
pub mod optics;
pub mod relativity;
pub mod transient;
pub mod quantum;
pub mod waveoptics;
pub mod waves;
pub mod gas;
pub mod nuclear;
pub mod magnet;

use serde_json::{json, Value};

use crate::transport::{dnum, jnum, Blob};

fn num(v: &Value, k: &str, default: f64) -> f64 {
    match v.get(k) {
        None | Some(Value::Null) => default,
        Some(x) => {
            let d = dnum(x);
            if d.is_nan() {
                default
            } else {
                d
            }
        }
    }
}

fn opt_num(v: &Value, k: &str) -> Option<f64> {
    v.get(k).filter(|x| !x.is_null()).map(dnum).filter(|d| !d.is_nan())
}

fn string(v: &Value, k: &str) -> String {
    v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string()
}

fn opt_json(v: Option<f64>) -> Value {
    v.map(jnum).unwrap_or(Value::Null)
}

fn band_of(v: &Value) -> Option<usize> {
    match v.get("color").and_then(|x| x.as_str()) {
        Some("red") => Some(0),
        Some("green") => Some(1),
        Some("blue") => Some(2),
        _ => None,
    }
}

fn sources_of(req: &Value) -> field::FieldSources {
    let charges = req["charges"]
        .as_array()
        .map(|a| a.iter().map(|c| field::Charge { x: num(c, "x", 0.0), y: num(c, "y", 0.0), q: num(c, "q", 0.0), r: num(c, "r", 0.0) }).collect())
        .unwrap_or_default();
    let e = req.get("E").cloned().unwrap_or(Value::Null);
    field::FieldSources { charges, ex: num(&e, "x", 0.0), ey: num(&e, "y", 0.0), k: num(req, "k", 8.9875517923e9) }
}

fn circuit_elements(req: &Value) -> Vec<circuit::Element> {
    use circuit::Kind;
    req["elements"]
        .as_array()
        .map(|a| {
            a.iter()
                .map(|e| {
                    let kind = match e.get("kind").and_then(|k| k.as_str()).unwrap_or("wire") {
                        "switch" => Kind::Switch { closed: e.get("closed").and_then(|v| v.as_bool()).unwrap_or(true) },
                        "resistor" => Kind::Resistor { r: num(e, "R", 0.0) },
                        "lamp" => Kind::Lamp { u_rated: num(e, "U", 2.5), p_rated: num(e, "P", 0.5) },
                        "rheostat" => Kind::Rheostat { r_total: num(e, "R", 20.0), pos: num(e, "pos", 0.5) },
                        "battery" => Kind::Battery { emf: num(e, "E", 1.5), r: num(e, "r", 0.0) },
                        "ammeter" => Kind::Ammeter { r: num(e, "r", 0.0) },
                        "voltmeter" => Kind::Voltmeter { r: opt_num(e, "r").filter(|r| *r > 0.0) },
                        "capacitor" => Kind::Capacitor { c: num(e, "C", 1e-6) },
                        // 26.55 (D89)
                        "inductor" => Kind::Inductor { l: num(e, "L", 0.1), r: num(e, "r", 0.0).max(0.0) },
                        "ac" => Kind::AcSource { amp: num(e, "E", 5.0), freq: num(e, "f", 50.0), phase: num(e, "phase", 0.0), r: num(e, "r", 0.0).max(0.0) },
                        "diode" => Kind::Diode { vf: num(e, "U", 0.7).max(0.0), ron: num(e, "r", 0.0).max(0.0) },
                        "motor" => Kind::Motor {
                            ra: num(e, "R", 2.0).max(0.0),
                            k: num(e, "k", 0.05),
                            j: num(e, "J", 1e-4).max(1e-12),
                            b: num(e, "fr", 1e-5).max(0.0),
                            load: num(e, "load", 0.0).max(0.0),
                            drive: if e.get("generator").and_then(|v| v.as_bool()).unwrap_or(false) { Some(num(e, "omega", 100.0)) } else { None },
                        },
                        "transformer" => Kind::Transformer {
                            n1: num(e, "n1", 1000.0).max(1e-9),
                            n2: num(e, "n2", 100.0).max(1e-9),
                            lm: num(e, "L", 50.0).max(1e-9),
                            r1: num(e, "r", 0.0).max(0.0),
                            r2: num(e, "r2", 0.0).max(0.0),
                        },
                        "fuse" => Kind::Fuse { rating: num(e, "I", 1.0).max(1e-9) },
                        "rcd" => Kind::Rcd { trip: num(e, "I", 0.03).max(1e-9) },
                        "thermistor" => Kind::Thermistor { r25: num(e, "R", 10e3).max(1e-9), beta: num(e, "beta", 3950.0), temp: num(e, "T", 25.0).max(-273.0) },
                        "ldr" => Kind::Ldr { r10: num(e, "R", 20e3).max(1e-9), gamma: num(e, "gamma", 0.7), lux: num(e, "lux", 10.0).max(0.0) },
                        "fsr" => Kind::Fsr { r0: num(e, "R", 100e3).max(1e-9), f0: num(e, "F0", 1.0).max(1e-12), force: num(e, "F", 0.0).max(0.0) },
                        "galvanometer" => Kind::Galvanometer { rg: num(e, "r", 100.0).max(0.0), ig: num(e, "I", 1e-3).max(1e-15) },
                        "probe" => Kind::Probe { channel: num(e, "channel", 1.0).clamp(1.0, 2.0) as u8 },
                        _ => Kind::Wire,
                    };
                    let key = |k: &str| e.get(k).and_then(|v| v.as_str()).map(|s| s.to_string());
                    circuit::Element { id: string(e, "id"), kind, a: string(e, "a"), b: string(e, "b"), c: key("c"), d: key("d") }
                })
                .collect()
        })
        .unwrap_or_default()
}

fn optics_elements(req: &Value) -> Vec<optics::Element> {
    use optics::Element as E;
    req["elements"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|e| {
                    let n = num(e, "n", 1.5);
                    let disp = num(e, "disp", 0.0);
                    Some(match e.get("type").and_then(|t| t.as_str())? {
                        "mirror" => E::Mirror { x1: num(e, "x1", 0.0), y1: num(e, "y1", 0.0), x2: num(e, "x2", 0.0), y2: num(e, "y2", 0.0) },
                        "screen" => E::Screen { x1: num(e, "x1", 0.0), y1: num(e, "y1", 0.0), x2: num(e, "x2", 0.0), y2: num(e, "y2", 0.0) },
                        "arcMirror" => E::ArcMirror { x: num(e, "x", 0.0), y: num(e, "y", 0.0), angle: num(e, "angle", 0.0), r: num(e, "R", 1.0), half: num(e, "half", 0.3) },
                        "lens" => E::Lens { x: num(e, "x", 0.0), y: num(e, "y", 0.0), angle: num(e, "angle", 0.0), f: num(e, "f", 1.0), half: num(e, "half", 0.3) },
                        "glass" => E::Glass { points: e["points"].as_array()?.iter().map(|p| (num(p, "x", 0.0), num(p, "y", 0.0))).collect(), n, disp },
                        "halfDisc" => E::HalfDisc { x: num(e, "x", 0.0), y: num(e, "y", 0.0), r: num(e, "r", 0.3), angle: num(e, "angle", 0.0), n, disp },
                        "disc" => E::Disc { x: num(e, "x", 0.0), y: num(e, "y", 0.0), r: num(e, "r", 0.3), n, disp },
                        _ => return None,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn optics_sources(req: &Value) -> Vec<optics::Source> {
    use optics::Source as S;
    req["sources"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|s| {
                    let (x, y, angle, band) = (num(s, "x", 0.0), num(s, "y", 0.0), num(s, "angle", 0.0), band_of(s));
                    let count = num(s, "count", 7.0).clamp(1.0, 400.0) as usize;
                    Some(match s.get("type").and_then(|t| t.as_str())? {
                        "ray" => S::Ray { x, y, angle, band },
                        "beam" => S::Beam { x, y, angle, width: num(s, "width", 0.3), count, band },
                        "point" => S::Point { x, y, angle, spread: num(s, "spread", std::f64::consts::PI / 3.0), count, band },
                        _ => return None,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn line_json(l: &atom::Line) -> Value {
    json!({ "upper": l.upper, "lower": l.lower, "energy": jnum(l.energy), "frequency": jnum(l.frequency), "wavelength": jnum(l.wavelength), "series": l.series, "visible": l.visible })
}

fn nums(v: &Value, k: &str) -> Vec<f64> {
    v.get(k).and_then(|x| x.as_array()).map(|a| a.iter().map(dnum).map(|d| if d.is_nan() { 0.0 } else { d }).collect()).unwrap_or_default()
}

fn wave_end(v: &Value) -> waves::End {
    match v.get("type").and_then(|t| t.as_str()).unwrap_or("fixed") {
        "free" => waves::End::Free,
        "absorb" => waves::End::Absorbing,
        "driven" => waves::End::Driven { amp: num(v, "amp", 0.05), freq: num(v, "freq", 2.0), phase: num(v, "phase", 0.0), pulse: num(v, "pulse", 0.0).max(0.0) },
        _ => waves::End::Fixed,
    }
}

fn potential_of(v: &Value) -> quantum::Potential {
    use quantum::Potential as P;
    match v.get("kind").and_then(|t| t.as_str()).unwrap_or("free") {
        "barrier" => P::Barrier { v0: num(v, "V0", 1.0), c: num(v, "c", 0.0), w: num(v, "w", 1.0).max(0.0) },
        "step" => P::Step { v0: num(v, "V0", 1.0), c: num(v, "c", 0.0) },
        "well" => P::Well { depth: num(v, "V0", 1.0), c: num(v, "c", 0.0), w: num(v, "w", 1.0).max(0.0) },
        "harmonic" => P::Harmonic { omega: num(v, "omega", 1.0), c: num(v, "c", 0.0) },
        "double" => P::Double { v0: num(v, "V0", 1.0), c: num(v, "c", 0.0), w: num(v, "w", 0.5).max(0.0), gap: num(v, "gap", 2.0).max(0.0) },
        "box" => P::Box { c: num(v, "c", 0.0), w: num(v, "w", 2.0).max(1e-6) },
        "points" => P::Points(v["points"].as_array().map(|a| a.iter().map(|p| (num(p, "x", 0.0), num(p, "V", 0.0))).collect()).unwrap_or_default()),
        _ => P::Free,
    }
}

fn particle_of(v: &Value) -> Option<nuclear::Particle> {
    use nuclear::Particle as P;
    Some(match v.get("kind").and_then(|t| t.as_str()).unwrap_or("nuclide") {
        "n" => P::Neutron,
        "e-" => P::Electron,
        "e+" => P::Positron,
        "gamma" => P::Gamma,
        "nu" => P::Neutrino,
        _ => {
            let z = num(v, "Z", -1.0);
            let a = num(v, "A", -1.0);
            if !(z >= 0.0 && a >= 1.0 && z <= 103.0 && a <= 300.0 && z <= a) {
                return None;
            }
            P::Nuclide { z: z as u32, a: a as u32 }
        }
    })
}

fn magnet_sources(req: &Value) -> magnet::Sources {
    let mut s = magnet::Sources::default();
    for w in req["wires"].as_array().cloned().unwrap_or_default() {
        s.wires.push(magnet::Wire { x: num(&w, "x", 0.0), y: num(&w, "y", 0.0), i: num(&w, "I", 1.0), r: num(&w, "r", 0.002).max(1e-6) });
    }
    for m in req["magnets"].as_array().cloned().unwrap_or_default() {
        s.add_magnet(num(&m, "x", 0.0), num(&m, "y", 0.0), num(&m, "angle", 0.0), num(&m, "length", 0.1).max(1e-6), num(&m, "thickness", 0.02).max(1e-6), num(&m, "M", 8e5));
    }
    for c in req["solenoids"].as_array().cloned().unwrap_or_default() {
        s.add_solenoid(num(&c, "x", 0.0), num(&c, "y", 0.0), num(&c, "angle", 0.0), num(&c, "length", 0.1).max(1e-6), num(&c, "thickness", 0.03).max(1e-6), num(&c, "turns", 10.0).clamp(1.0, 400.0) as usize, num(&c, "I", 1.0), num(&c, "r", 0.0015).max(1e-6));
    }
    let b = req.get("B").cloned().unwrap_or(Value::Null);
    s.bx = num(&b, "x", 0.0);
    s.by = num(&b, "y", 0.0);
    s.mu0 = constants_set(req).map(|set| crate::constants::value(set, "mu0"));
    s
}

/// The constant set named by a request (26.56, D100); None for requests of files before 26.56 (legacy values).
fn constants_set(req: &Value) -> Option<&'static str> {
    req.get("constantsSet").and_then(|v| v.as_str()).map(|s| crate::constants::normalize(Some(s), crate::constants::LEGACY))
}

fn gas_kind(v: &str) -> gas::Kind {
    match v {
        "isobaric" => gas::Kind::Isobaric,
        "isochoric" => gas::Kind::Isochoric,
        "adiabatic" => gas::Kind::Adiabatic,
        _ => gas::Kind::Isothermal,
    }
}

fn process_json(g: &gas::Gas, pr: &gas::Process, samples: usize) -> Value {
    let curve: Vec<f64> = g.curve(pr, samples).into_iter().flat_map(|(v, p)| [v, p]).collect();
    json!({
        "kind": pr.kind.name(),
        "from": { "p": jnum(pr.from.p), "V": jnum(pr.from.v), "T": jnum(pr.from.t) },
        "to": { "p": jnum(pr.to.p), "V": jnum(pr.to.v), "T": jnum(pr.to.t) },
        "W": jnum(pr.work), "Q": jnum(pr.heat), "dU": jnum(pr.du),
        "curve": curve.iter().map(|x| jnum(*x)).collect::<Vec<_>>()
    })
}

/// Run one lab operation; None when `op` is not one of them.
pub fn call(op: &str, req: &Value, blob: &mut Blob) -> Option<Value> {
    Some(match op {
        "fieldMap" => {
            let s = sources_of(req);
            let r = req.get("region").cloned().unwrap_or(Value::Null);
            let o = field::MapOptions {
                x0: num(&r, "x0", -1.0),
                y0: num(&r, "y0", -1.0),
                x1: num(&r, "x1", 1.0),
                y1: num(&r, "y1", 1.0),
                per_charge: num(req, "perCharge", 12.0).clamp(2.0, 64.0) as usize,
                grid: num(req, "grid", 120.0).clamp(8.0, 400.0) as usize,
                levels: num(req, "levels", 10.0).clamp(0.0, 60.0) as usize,
            };
            let m = field::field_map(&s, &o);
            json!({
                "lines": { "xy": blob.f64s(&m.line_xy), "starts": m.line_starts, "charge": m.line_charge },
                "contours": { "levels": m.levels.iter().map(|v| jnum(*v)).collect::<Vec<_>>(), "segs": blob.f64s(&m.seg_xyxy), "starts": m.seg_starts }
            })
        }
        "fieldAt" => {
            let s = sources_of(req);
            let pts = req["points"].as_array().cloned().unwrap_or_default();
            let (mut e, mut v) = (Vec::new(), Vec::new());
            for p in &pts {
                let (x, y) = (num(p, "x", 0.0), num(p, "y", 0.0));
                let (fx, fy) = field::field_at(&s, x, y);
                e.push(json!({ "x": jnum(fx), "y": jnum(fy) }));
                v.push(jnum(field::potential_at(&s, x, y)));
            }
            json!({ "E": e, "V": v })
        }
        "circuitSolve" => {
            let els = circuit_elements(req);
            let s = circuit::solve(&els);
            let elements: serde_json::Map<String, Value> = s
                .elements
                .iter()
                .map(|(id, r)| {
                    let mut o = json!({ "U": opt_json(r.u), "I": if s.ok { jnum(r.i) } else { Value::Null }, "P": opt_json(r.p) });
                    if let Some((a, b)) = r.i_parts {
                        o["Iparts"] = json!([jnum(a), jnum(b)]);
                    }
                    if let Some(x) = r.extra {
                        o["extra"] = jnum(x);
                    }
                    (id.clone(), o)
                })
                .collect();
            let nodes: serde_json::Map<String, Value> = s.nodes.iter().map(|(k, v)| (k.clone(), opt_json(*v))).collect();
            json!({
                "ok": s.ok,
                "issues": s.issues.iter().map(|i| json!({ "kind": i.kind, "elements": i.elements, "fatal": i.fatal })).collect::<Vec<_>>(),
                "nodes": nodes,
                "elements": elements,
                "relations": s.relations.iter().map(|(k, v)| json!({ "kind": k, "elements": v })).collect::<Vec<_>>()
            })
        }
        "circuitRun" => {
            // 26.55 (D89): the circuit in time from a given state
            let els = circuit_elements(req);
            let st_req = req.get("state").cloned().unwrap_or(Value::Null);
            let state: Vec<Option<transient::ElemState>> = els
                .iter()
                .map(|e| {
                    st_req.get(&e.id).and_then(|v| v.as_array()).map(|a| {
                        let g = |k: usize| a.get(k).map(dnum).filter(|d| !d.is_nan()).unwrap_or(0.0);
                        transient::ElemState { x: g(0), w: g(1), s: g(2), m: g(3) }
                    })
                })
                .collect();
            let opts = transient::RunOptions {
                t0: num(req, "t0", 0.0),
                duration: num(req, "duration", 1e-3),
                samples: num(req, "samples", 100.0).clamp(1.0, 20000.0) as usize,
                rtol: num(req, "rtol", 1e-11).clamp(1e-14, 1e-4),
                max_steps: num(req, "maxSteps", 2_000_000.0).clamp(1.0, 20_000_000.0) as usize,
            };
            let r = transient::run(&els, &state, &opts);
            let ids: Vec<&str> = els.iter().map(|e| e.id.as_str()).collect();
            let by_id = |v: &[f64]| -> serde_json::Map<String, Value> { ids.iter().zip(v.iter()).map(|(k, x)| (k.to_string(), jnum(*x))).collect() };
            let state_out: serde_json::Map<String, Value> = ids.iter().zip(r.state.iter()).map(|(k, s)| (k.to_string(), json!([jnum(s.x), jnum(s.w), jnum(s.s), jnum(s.m)]))).collect();
            json!({
                "ok": r.ok,
                "fatal": r.fatal,
                "t": blob.f64s(&r.t),
                "U": blob.f64s(&r.u),
                "I": blob.f64s(&r.i),
                "X": blob.f64s(&r.xv),
                "Y": blob.f64s(&r.yv),
                "energy": by_id(&r.energy),
                "mech": by_id(&r.mech),
                "stored": jnum(transient::stored_energy(&els, &r.state)),
                "state": state_out,
                "events": r.events.iter().map(|e| json!({ "t": jnum(e.t), "kind": e.kind, "element": ids.get(e.element).copied(), "energy": jnum(e.energy) })).collect::<Vec<_>>(),
                "steps": r.steps,
                "minStep": jnum(r.min_step),
                "maxStep": jnum(r.max_step)
            })
        }
        "circuitResistance" => {
            let els = circuit_elements(req);
            json!({ "R": opt_json(circuit::equivalent_resistance(&els, &string(req, "a"), &string(req, "b"))) })
        }
        "opticsImage" => {
            let kind = if string(req, "element") == "mirror" { optics::Imager::Mirror } else { optics::Imager::Lens };
            let im = optics::image(kind, num(req, "f", 1.0), num(req, "u", 2.0), num(req, "h", 0.5));
            json!({
                "v": opt_json(im.v),
                "m": opt_json(im.m),
                "tip": im.tip.map(|(x, y)| json!({ "x": jnum(x), "y": jnum(y) })),
                "real": im.real,
                "upright": im.upright,
                "rays": im.rays.iter().map(|r| r.iter().map(|s| json!({ "x1": jnum(s.x1), "y1": jnum(s.y1), "x2": jnum(s.x2), "y2": jnum(s.y2), "virtual": s.virtual_ })).collect::<Vec<_>>()).collect::<Vec<_>>()
            })
        }
        "opticsTrace" => {
            let els = optics_elements(req);
            let src = optics_sources(req);
            let o = optics::TraceOptions { partial: req.get("partial").and_then(|v| v.as_bool()).unwrap_or(true), far: num(req, "far", 50.0), ..Default::default() };
            let t = optics::trace(&els, &src, &o);
            let mut segs = Vec::with_capacity(t.segments.len() * 6);
            for s in &t.segments {
                segs.extend_from_slice(&[s.x1, s.y1, s.x2, s.y2, s.band as f64, s.intensity]);
            }
            json!({
                "segments": blob.f64s(&segs),
                "interactions": t.interactions.iter().map(|i| json!({ "x": jnum(i.x), "y": jnum(i.y), "kind": i.kind, "nx": jnum(i.nx), "ny": jnum(i.ny), "incidence": jnum(i.incidence), "outgoing": jnum(i.outgoing), "n1": jnum(i.n1), "n2": jnum(i.n2) })).collect::<Vec<_>>(),
                "hits": t.hits.iter().map(|h| json!([jnum(h.0), jnum(h.1), h.2, jnum(h.3)])).collect::<Vec<_>>()
            })
        }
        "hydrogen" => {
            let max_n = num(req, "maxN", 6.0).clamp(2.0, 12.0) as u32;
            let mut out = json!({
                "levels": (1..=max_n).map(|n| jnum(atom::level(n))).collect::<Vec<_>>(),
                "lines": atom::spectrum(max_n).iter().map(line_json).collect::<Vec<_>>()
            });
            if let (Some(u), Some(l)) = (opt_num(req, "upper"), opt_num(req, "lower")) {
                let (u, l) = (u as u32, l as u32);
                if u > l && l >= 1 {
                    out["line"] = line_json(&atom::line(u, l));
                }
            }
            if let Some(e) = opt_num(req, "energy") {
                let from = num(req, "from", 1.0).max(1.0) as u32;
                let photon = req.get("by").and_then(|v| v.as_str()) != Some("electron");
                let x = atom::excite(from, e, photon, max_n);
                out["excite"] = json!({ "levels": x.levels, "ionizes": x.ionizes, "free": opt_json(x.free_energy) });
            }
            out
        }
        "photoelectric" => {
            let freq = match opt_num(req, "frequency") {
                Some(f) => f,
                None => atom::frequency_of(num(req, "wavelength", 400.0)),
            };
            let p = atom::photoelectric(num(req, "W", 2.29), freq, num(req, "power", 1e-3), num(req, "efficiency", 0.05));
            let (u0, u1) = (num(req, "uMin", -4.0), num(req, "uMax", 8.0));
            let n = num(req, "samples", 201.0).clamp(2.0, 4001.0) as usize;
            let mut curve = Vec::with_capacity(2 * n);
            for k in 0..n {
                let u = u0 + (u1 - u0) * k as f64 / (n - 1) as f64;
                curve.push(u);
                curve.push(atom::current(&p, u));
            }
            json!({
                "frequency": jnum(freq),
                "wavelength": jnum(atom::C / freq * 1e9),
                "photon": jnum(p.photon),
                "work": jnum(p.work),
                "ekMax": jnum(p.ek_max),
                "stopVoltage": jnum(p.stop_voltage),
                "thresholdFrequency": jnum(p.threshold_frequency),
                "thresholdWavelength": jnum(p.threshold_wavelength),
                "photonRate": jnum(p.photon_rate),
                "saturation": jnum(p.saturation),
                "emits": p.emits,
                "current": opt_num(req, "U").map(|u| jnum(atom::current(&p, u))),
                "curve": blob.f64s(&curve)
            })
        }
        "decay" => {
            let n0 = num(req, "n0", 400.0).clamp(1.0, 200000.0) as u32;
            let steps = num(req, "steps", 200.0).clamp(1.0, 100000.0) as u32;
            let r = decay::decay(n0, num(req, "halfLife", 1.0), num(req, "dt", 0.05), steps, num(req, "seed", 1.0).max(0.0) as u64);
            let step_of: Vec<f64> = r.step_of.iter().map(|&s| s as f64).collect();
            let counts: Vec<f64> = r.counts.iter().map(|&c| c as f64).collect();
            json!({
                "p": jnum(r.p),
                "stepOf": blob.f64s(&step_of),
                "counts": blob.f64s(&counts),
                "theory": blob.f64s(&r.theory),
                "halvings": r.halvings.iter().map(|h| opt_json(*h)).collect::<Vec<_>>()
            })
        }
        "relativity" => {
            let beta = num(req, "beta", 0.6).clamp(-0.999999, 0.999999);
            let g = relativity::gamma(beta);
            let events: Vec<Value> = req["events"]
                .as_array()
                .map(|a| {
                    a.iter()
                        .map(|e| {
                            let (x, t) = relativity::lorentz(beta, num(e, "x", 0.0), num(e, "t", 0.0));
                            json!({ "x": jnum(x), "t": jnum(t) })
                        })
                        .collect()
                })
                .unwrap_or_default();
            let d = relativity::dynamics(num(req, "mass", 1.0), beta);
            let n = 200;
            let mut curve = Vec::with_capacity(2 * n);
            for k in 0..n {
                let b = 0.995 * k as f64 / (n - 1) as f64;
                curve.push(b);
                curve.push(relativity::gamma(b));
            }
            json!({
                "beta": jnum(beta),
                "gamma": jnum(g),
                "dilated": jnum(g * num(req, "properTime", 1.0)),
                "contracted": jnum(num(req, "properLength", 1.0) / g),
                "events": events,
                "u": jnum(relativity::add_velocity(num(req, "uPrime", 0.5).clamp(-1.0, 1.0), beta)),
                "dynamics": { "gamma": jnum(d.gamma), "p": jnum(d.p), "pClassical": jnum(d.p_classical), "E": jnum(d.e), "E0": jnum(d.e0), "Ek": jnum(d.ek), "EkClassical": jnum(d.ek_classical) },
                "curve": blob.f64s(&curve)
            })
        }
        "heatingCurve" => {
            let s = req.get("substance").cloned().unwrap_or(Value::Null);
            let soften = match (opt_num(&s, "softFrom"), opt_num(&s, "softTo")) {
                (Some(a), Some(b)) if b > a => Some((a, b)),
                _ => None,
            };
            let sub = heat::Substance {
                c_solid: num(&s, "cSolid", heat::WATER.c_solid),
                c_liquid: num(&s, "cLiquid", heat::WATER.c_liquid),
                c_gas: num(&s, "cGas", heat::WATER.c_gas),
                t_melt: num(&s, "tMelt", heat::WATER.t_melt),
                t_boil: num(&s, "tBoil", heat::WATER.t_boil),
                l_fusion: num(&s, "lFusion", heat::WATER.l_fusion),
                l_vapour: num(&s, "lVapour", heat::WATER.l_vapour),
                soften,
            };
            let st = heat::heating_curve(&sub, num(req, "m", 1.0), num(req, "P", 1000.0), num(req, "t0", -10.0), num(req, "tEnd", 110.0));
            json!({ "stages": st.iter().map(|s| json!({ "t0": jnum(s.t0), "t1": jnum(s.t1), "temp0": jnum(s.temp0), "temp1": jnum(s.temp1), "phase": s.phase, "heat": jnum(s.heat) })).collect::<Vec<_>>() })
        }
        "heatMix" => {
            let (c1, m1, t1) = (num(req, "c1", 4200.0), num(req, "m1", 0.2), num(req, "t1", 80.0));
            let (c2, m2, t2) = (num(req, "c2", 4200.0), num(req, "m2", 0.3), num(req, "t2", 20.0));
            let mx = heat::mix(c1, m1, t1, c2, m2, t2, num(req, "k", 20.0));
            let duration = num(req, "duration", 5.0 * mx.tau);
            let n = num(req, "samples", 201.0).clamp(2.0, 4001.0) as usize;
            let mut curve = Vec::with_capacity(3 * n);
            for k in 0..n {
                let t = duration * k as f64 / (n - 1) as f64;
                let (a, b) = heat::mix_at(&mx, t1, t2, c1 * m1, c2 * m2, t);
                curve.extend_from_slice(&[t, a, b]);
            }
            json!({ "tEq": jnum(mx.t_eq), "tau": jnum(mx.tau), "heat": jnum(mx.heat), "curve": blob.f64s(&curve) })
        }
        // ---- 26.55 ----
        "waveRun" => {
            let spec = waves::StringSpec {
                n: num(req, "n", 401.0).clamp(3.0, 20001.0) as usize,
                length: num(req, "length", 4.0).max(1e-9),
                c1: num(req, "c1", 2.0).abs().max(1e-9),
                c2: num(req, "c2", num(req, "c1", 2.0)).abs().max(1e-9),
                split: num(req, "split", 1.0).clamp(0.0, 1.0),
                damping: num(req, "damping", 0.0).max(0.0),
                left: wave_end(&req["left"]),
                right: wave_end(&req["right"]),
            };
            let n = spec.n;
            let fit = |mut v: Vec<f64>| {
                v.resize(n, 0.0);
                v
            };
            let t0 = num(req, "t0", 0.0);
            let mut st = if req.get("prev").is_some_and(|v| v.is_array()) {
                waves::WaveState { t: t0, u: fit(nums(req, "u")), prev: fit(nums(req, "prev")) }
            } else {
                waves::at_rest(&spec, fit(nums(req, "u")), t0)
            };
            let dt = spec.dt();
            let frames = num(req, "frames", 1.0).clamp(1.0, 2000.0) as usize;
            let per = (num(req, "duration", dt) / frames as f64 / dt).round().max(1.0) as usize;
            let mut out = Vec::with_capacity(frames * n);
            let mut times = Vec::with_capacity(frames);
            let mut buf = Vec::new();
            for _ in 0..frames {
                for _ in 0..per {
                    waves::step(&spec, &mut st, &mut buf);
                }
                out.extend_from_slice(&st.u);
                times.push(st.t);
            }
            json!({
                "dt": jnum(dt), "dx": jnum(spec.dx()), "stepsPerFrame": per,
                "frames": blob.f64s(&out), "t": times.iter().map(|x| jnum(*x)).collect::<Vec<_>>(),
                "u": st.u.iter().map(|x| jnum(*x)).collect::<Vec<_>>(), "prev": st.prev.iter().map(|x| jnum(*x)).collect::<Vec<_>>(),
                "energy": jnum(waves::energy(&spec, &st))
            })
        }
        "doppler" => {
            let (f, c, vs, vo) = (num(req, "f", 10.0), num(req, "c", 340.0).max(1e-9), num(req, "vs", 0.0), num(req, "vo", 0.0));
            let fr: Vec<f64> = waves::fronts(f, c, vs, num(req, "t", 1.0).max(0.0), num(req, "max", 60.0).clamp(1.0, 500.0) as usize).into_iter().flat_map(|(x, r)| [x, r]).collect();
            json!({
                "ahead": opt_json(waves::doppler(f, c, vs, -vo)),
                "behind": opt_json(waves::doppler(f, c, -vs, vo)),
                "mach": jnum(vs.abs() / c),
                "fronts": fr.iter().map(|x| jnum(*x)).collect::<Vec<_>>()
            })
        }
        "sound" => {
            let f = num(req, "f", 440.0).max(1e-6);
            let (note, octave, cents) = waves::note(f);
            let v = num(req, "v", 343.0).max(1e-9);
            let (i, level) = waves::sound_level(f, num(req, "amp", 1e-6).abs(), num(req, "rho", 1.204).max(1e-12), v);
            json!({ "note": note, "octave": octave, "cents": jnum(cents), "intensity": jnum(i), "level": jnum(level), "wavelength": jnum(v / f), "period": jnum(1.0 / f) })
        }
        "waveOptics" => {
            let setup = string(req, "setup");
            let lam = num(req, "lambda", 600.0) * 1e-9;
            let white = req.get("white").and_then(|v| v.as_bool()).unwrap_or(false);
            let samples = num(req, "samples", 801.0).clamp(2.0, 8001.0) as usize;
            match setup.as_str() {
                "film" => {
                    let (n0, n1, n2) = (num(req, "n0", 1.0), num(req, "n1", 1.33), num(req, "n2", 1.0));
                    let (ta, tb) = (num(req, "t0", 0.0) * 1e-9, num(req, "t1", 1000.0) * 1e-9);
                    let ts: Vec<f64> = (0..samples).map(|k| ta + (tb - ta) * k as f64 / (samples - 1) as f64).collect();
                    let r: Vec<f64> = ts.iter().map(|&t| waveoptics::film_reflectance(lam, n0, n1, n2, t)).collect();
                    let rgb: Vec<f64> = if white {
                        waveoptics::white_colours(samples, |k, l| waveoptics::film_reflectance(l * 1e-9, n0, n1, n2, ts[k]), 0.0).into_iter().flatten().collect()
                    } else {
                        let c = waveoptics::wavelength_rgb(lam * 1e9);
                        r.iter().flat_map(|&v| [c[0] * v.sqrt(), c[1] * v.sqrt(), c[2] * v.sqrt()]).collect()
                    };
                    let t_here = num(req, "t", 100.0) * 1e-9;
                    json!({ "t": blob.f64s(&ts), "R": blob.f64s(&r), "rgb": blob.f64s(&rgb), "Rat": jnum(waveoptics::film_reflectance(lam, n0, n1, n2, t_here)) })
                }
                "polarizer" => {
                    let angles = nums(req, "angles");
                    let input = opt_num(req, "input");
                    json!({ "I": waveoptics::polarizers(input, &angles).iter().map(|x| jnum(*x)).collect::<Vec<_>>() })
                }
                _ => {
                    let (a, d, l, half) = (num(req, "a", 0.02e-3), num(req, "d", 0.25e-3), num(req, "L", 2.0), num(req, "half", 0.03));
                    let ns = match setup.as_str() {
                        "single" => 1,
                        "double" => 2,
                        _ => num(req, "N", 6.0).clamp(1.0, 2000.0) as usize,
                    };
                    let xs: Vec<f64> = (0..samples).map(|k| -half + 2.0 * half * k as f64 / (samples - 1) as f64).collect();
                    let it: Vec<f64> = xs.iter().map(|&x| waveoptics::slits(x, lam, a, d, ns, l)).collect();
                    let rgb: Vec<f64> = if white {
                        waveoptics::white_colours(samples, |k, lw| waveoptics::slits(xs[k], lw * 1e-9, a, d, ns, l), 1.0).into_iter().flatten().collect()
                    } else {
                        let c = waveoptics::wavelength_rgb(lam * 1e9);
                        it.iter().flat_map(|&v| [c[0] * v.sqrt(), c[1] * v.sqrt(), c[2] * v.sqrt()]).collect()
                    };
                    let mx = if ns >= 2 { waveoptics::maxima(lam, d, l, half) } else { Vec::new() };
                    let mn = waveoptics::slit_minima(lam, a, l, half);
                    json!({
                        "x": blob.f64s(&xs), "I": blob.f64s(&it), "rgb": blob.f64s(&rgb),
                        "maxima": mx.iter().map(|(m, x)| json!([m, jnum(*x)])).collect::<Vec<_>>(),
                        "minima": mn.iter().map(|(m, x)| json!([m, jnum(*x)])).collect::<Vec<_>>(),
                        "spacing": jnum(lam * l / d), "centralWidth": jnum(2.0 * lam * l / a),
                        "color": waveoptics::wavelength_rgb(lam * 1e9).iter().map(|x| jnum(*x)).collect::<Vec<_>>()
                    })
                }
            }
        }
        "quantumSetup" => {
            let pot = potential_of(&req["potential"]);
            let count = num(req, "states", 6.0).clamp(0.0, 60.0) as usize;
            let (l0, e0, t0) = quantum::units();
            let units = json!({ "length": jnum(l0), "energy": jnum(e0), "time": jnum(t0) });
            if let quantum::Potential::Box { c, w } = pot {
                let n = num(req, "n", 511.0).clamp(16.0, 8191.0) as usize;
                let dx = w / (n + 1) as f64;
                let xs: Vec<f64> = (0..n).map(|i| c - 0.5 * w + (i + 1) as f64 * dx).collect();
                let (vals, vecs) = quantum::eigen(&vec![0.0; n], dx, count);
                let flat: Vec<f64> = vecs.into_iter().flatten().collect();
                json!({ "units": units, "x": blob.f64s(&xs), "V": blob.f64s(&vec![0.0; n]), "dx": jnum(dx), "energies": vals.iter().map(|x| jnum(*x)).collect::<Vec<_>>(), "states": blob.f64s(&flat) })
            } else {
                let n = num(req, "n", 1024.0).clamp(16.0, 16384.0) as usize;
                let n = n.next_power_of_two();
                let (xa, xb) = (num(req, "x0", -50.0), num(req, "x1", 50.0));
                let g = quantum::Grid::new(xa, (xb - xa).max(1e-9), n);
                let xs: Vec<f64> = (0..n).map(|j| g.x(j)).collect();
                let v: Vec<f64> = xs.iter().map(|&x| pot.cell(x, g.dx)).collect();
                // eigenstates with ψ = 0 one step beyond the ends of the window
                let (vals, vecs) = quantum::eigen(&v, g.dx, count);
                let flat: Vec<f64> = vecs.into_iter().flatten().collect();
                json!({ "units": units, "x": blob.f64s(&xs), "V": blob.f64s(&v), "dx": jnum(g.dx), "energies": vals.iter().map(|x| jnum(*x)).collect::<Vec<_>>(), "states": blob.f64s(&flat) })
            }
        }
        "quantumRun" => {
            let pot = potential_of(&req["potential"]);
            let frames = num(req, "frames", 1.0).clamp(1.0, 400.0) as usize;
            let duration = num(req, "duration", 1.0).max(0.0);
            let t0 = num(req, "t0", 0.0);
            if let quantum::Potential::Box { c, w } = pot {
                // exact evolution in the eigenbasis: coefficients (re, im) of the lowest states
                let n = num(req, "n", 511.0).clamp(16.0, 8191.0) as usize;
                let dx = w / (n + 1) as f64;
                let cre = nums(req, "cre");
                let cim = nums(req, "cim");
                let k = cre.len().min(60);
                let (vals, vecs) = quantum::eigen(&vec![0.0; n], dx, k);
                let mut prob = Vec::with_capacity(frames * n);
                let mut re_out = Vec::with_capacity(frames * n);
                let mut im_out = Vec::with_capacity(frames * n);
                let mut ex = Vec::new();
                for f in 0..frames {
                    let t = t0 + duration * (f + 1) as f64 / frames as f64;
                    let mut re = vec![0.0; n];
                    let mut im = vec![0.0; n];
                    for s in 0..k {
                        let ph = -vals[s] * t;
                        let (cs, sn) = (crate::dmath::cos(ph), crate::dmath::sin(ph));
                        let (a, b) = (cre[s] * cs - cim.get(s).copied().unwrap_or(0.0) * sn, cre[s] * sn + cim.get(s).copied().unwrap_or(0.0) * cs);
                        for i in 0..n {
                            re[i] += a * vecs[s][i];
                            im[i] += b * vecs[s][i];
                        }
                    }
                    let (mut sx, mut sxx, mut nn) = (0.0, 0.0, 0.0);
                    for i in 0..n {
                        let p = re[i] * re[i] + im[i] * im[i];
                        let x = c - 0.5 * w + (i + 1) as f64 * dx;
                        sx += p * x;
                        sxx += p * x * x;
                        nn += p;
                        prob.push(p);
                    }
                    let mean = if nn > 0.0 { sx / nn } else { 0.0 };
                    let energy: f64 = (0..k).map(|s| (cre[s] * cre[s] + cim.get(s).copied().unwrap_or(0.0).powi(2)) * vals[s]).sum();
                    ex.push(json!({ "t": jnum(t), "norm": jnum(nn * dx), "x": jnum(mean), "dx": jnum((sxx / nn.max(1e-300) - mean * mean).max(0.0).sqrt()), "energy": jnum(energy) }));
                    re_out.extend_from_slice(&re);
                    im_out.extend_from_slice(&im);
                }
                json!({ "prob": blob.f64s(&prob), "re": blob.f64s(&re_out), "im": blob.f64s(&im_out), "expect": ex, "absorbed": 0, "energies": vals.iter().map(|x| jnum(*x)).collect::<Vec<_>>() })
            } else {
                let n = (num(req, "n", 1024.0).clamp(16.0, 16384.0) as usize).next_power_of_two();
                let (xa, xb) = (num(req, "x0", -50.0), num(req, "x1", 50.0));
                let g = quantum::Grid::new(xa, (xb - xa).max(1e-9), n);
                let v: Vec<f64> = (0..n).map(|j| pot.cell(g.x(j), g.dx)).collect();
                let (mut re, mut im) = if req.get("re").is_some_and(|x| x.is_array()) {
                    let mut r = nums(req, "re");
                    let mut i = nums(req, "im");
                    r.resize(n, 0.0);
                    i.resize(n, 0.0);
                    (r, i)
                } else {
                    let p = req.get("packet").cloned().unwrap_or(Value::Null);
                    quantum::packet(&g, num(&p, "x0", -20.0), num(&p, "sigma", 2.0).max(1e-6), num(&p, "k0", 2.0))
                };
                // time step: the kinetic phase of the highest mode at most π/4 per step, or the request's
                let kmax = std::f64::consts::PI / g.dx;
                let dt_max = 0.25 * std::f64::consts::PI / (0.5 * kmax * kmax);
                let per_frame = duration / frames as f64;
                let steps = ((per_frame / num(req, "dt", dt_max).min(dt_max)).ceil() as usize).max(1);
                let dt = per_frame / steps as f64;
                let prop = quantum::Propagator::new(g.clone(), &v, dt, num(req, "absorb", 0.1).clamp(0.0, 0.4));
                let split = num(req, "split", f64::NAN);
                let mut prob = Vec::with_capacity(frames * n);
                let mut re_out = Vec::with_capacity(frames * n);
                let mut im_out = Vec::with_capacity(frames * n);
                let mut ex = Vec::new();
                let mut absorbed = 0.0;
                for f in 0..frames {
                    if per_frame > 0.0 {
                        absorbed += prop.run(&mut re, &mut im, steps);
                    }
                    let e = quantum::expect(&g, prop.fft(), &v, &re, &im);
                    let (mut left, mut right) = (0.0, 0.0);
                    for j in 0..n {
                        let p = re[j] * re[j] + im[j] * im[j];
                        prob.push(p);
                        if split.is_finite() {
                            if g.x(j) < split {
                                left += p * g.dx;
                            } else {
                                right += p * g.dx;
                            }
                        }
                    }
                    re_out.extend_from_slice(&re);
                    im_out.extend_from_slice(&im);
                    ex.push(json!({ "t": jnum(t0 + per_frame * (f + 1) as f64), "norm": jnum(e.norm), "x": jnum(e.x), "dx": jnum(e.dx), "p": jnum(e.p), "dp": jnum(e.dp), "energy": jnum(e.energy), "left": jnum(left), "right": jnum(right) }));
                }
                let mut out = json!({ "prob": blob.f64s(&prob), "re": blob.f64s(&re_out), "im": blob.f64s(&im_out), "expect": ex, "absorbed": jnum(absorbed), "dt": jnum(dt), "steps": steps * frames });
                if let quantum::Potential::Barrier { v0, w, .. } = pot {
                    if let Some(p) = req.get("packet") {
                        out["theoryT"] = jnum(quantum::packet_t(num(p, "k0", 2.0), num(p, "sigma", 2.0).max(1e-6), v0, w));
                    }
                }
                out
            }
        }
        "barrierT" => {
            let (v0, w) = (num(req, "V0", 1.0), num(req, "w", 1.0));
            let es = nums(req, "E");
            json!({ "T": es.iter().map(|&e| jnum(quantum::barrier_t(e, v0, w))).collect::<Vec<_>>() })
        }
        "gasProcess" => {
            let g = gas::Gas { n: num(req, "n", 1.0).max(1e-12), gamma: num(req, "gamma", 5.0 / 3.0).max(1.0 + 1e-9) };
            let a = g.state_pv(num(req, "p", 101325.0).max(1e-9), num(req, "V", 0.0224).max(1e-15));
            let kind = gas_kind(&string(req, "kind"));
            let b = g.end(kind, a, num(req, "target", if kind == gas::Kind::Isochoric { 2.0 * a.t } else { 2.0 * a.v }).max(1e-15));
            let pr = g.process(kind, a, b);
            process_json(&g, &pr, num(req, "samples", 101.0).clamp(2.0, 2001.0) as usize)
        }
        "gasCycle" => {
            let g = gas::Gas { n: num(req, "n", 1.0).max(1e-12), gamma: num(req, "gamma", 1.4).max(1.0 + 1e-9) };
            let c = match string(req, "kind").as_str() {
                "otto" => gas::otto(g, num(req, "T1", 300.0).max(1e-9), num(req, "V1", 1e-3).max(1e-15), num(req, "r", 8.0).max(1.0 + 1e-9), num(req, "T3", 1800.0).max(1e-9)),
                "rectangle" => gas::rectangle(g, num(req, "p1", 2e5), num(req, "p2", 1e5), num(req, "V1", 1e-3), num(req, "V2", 3e-3)),
                _ => gas::carnot(g, num(req, "Th", 600.0).max(1e-9), num(req, "Tc", 300.0).max(1e-9), num(req, "V1", 1e-3).max(1e-15), num(req, "V2", 3e-3).max(1e-15)),
            };
            let samples = num(req, "samples", 61.0).clamp(2.0, 2001.0) as usize;
            json!({
                "processes": c.processes.iter().map(|p| process_json(&g, p, samples)).collect::<Vec<_>>(),
                "Qin": jnum(c.q_in), "Qout": jnum(c.q_out), "W": jnum(c.work), "efficiency": jnum(c.efficiency), "theory": jnum(c.theory)
            })
        }
        "decayChain" => {
            let hl = nums(req, "halfLives");
            let lam: Vec<f64> = hl.iter().map(|&h| if h > 0.0 && h.is_finite() { std::f64::consts::LN_2 / h } else { 0.0 }).take(8).collect();
            let n0 = nums(req, "n0");
            let ch = nuclear::chain(&lam, &n0);
            let samples = num(req, "samples", 301.0).clamp(2.0, 5001.0) as usize;
            let t_end = num(req, "tEnd", 10.0).max(1e-300);
            let ts: Vec<f64> = (0..samples).map(|k| t_end * k as f64 / (samples - 1) as f64).collect();
            let mut nn = Vec::with_capacity(lam.len() * samples);
            let mut aa = Vec::with_capacity(lam.len() * samples);
            for (k, c) in ch.iter().enumerate() {
                for &t in &ts {
                    let v = c.at(t);
                    nn.push(v);
                    aa.push(lam[k] * v);
                }
            }
            let at = opt_num(req, "t").map(|t| ch.iter().map(|c| jnum(c.at(t))).collect::<Vec<_>>());
            json!({ "t": blob.f64s(&ts), "N": blob.f64s(&nn), "A": blob.f64s(&aa), "lambda": lam.iter().map(|x| jnum(*x)).collect::<Vec<_>>(), "at": at })
        }
        "binding" => {
            let measured: Vec<Value> = nuclear::TABLE
                .iter()
                .filter(|e| e.1 >= 2)
                .map(|e| {
                    let (b, _) = nuclear::binding(e.0, e.1);
                    json!({ "Z": e.0, "A": e.1, "symbol": e.3, "B": jnum(b), "BA": jnum(b / e.1 as f64) })
                })
                .collect();
            // the semi-empirical curve along the line of stability Z ≈ A/(2 + 0.0153 A^(2/3))
            let mut curve = Vec::new();
            for a in 2..=260u32 {
                let af = a as f64;
                let z = (af / (2.0 + 0.0153 * crate::dmath::pow(af, 2.0 / 3.0))).round().max(1.0) as u32;
                curve.push(json!([a, z, jnum(nuclear::semf(z, a) / af)]));
            }
            let picked = req["nuclides"].as_array().cloned().unwrap_or_default().iter().filter_map(|v| {
                let (z, a) = (num(v, "Z", -1.0), num(v, "A", -1.0));
                if !(z >= 0.0 && a >= 1.0 && z <= a && z <= 103.0) { return None; }
                let (z, a) = (z as u32, a as u32);
                let (b, m) = nuclear::binding(z, a);
                let (d, _) = nuclear::mass_excess(z, a);
                Some(json!({ "Z": z, "A": a, "symbol": nuclear::SYMBOLS[z as usize], "B": jnum(b), "BA": jnum(if a > 0 { b / a as f64 } else { 0.0 }), "measured": m, "massExcess": jnum(d), "mass": jnum(a as f64 + d / constants_set(req).map(|s| crate::constants::nuclear(s).u).unwrap_or(nuclear::U_MEV)) }))
            }).collect::<Vec<_>>();
            json!({ "measured": measured, "semf": curve, "nuclides": picked })
        }
        "reaction" => {
            let side = |k: &str| -> Option<Vec<nuclear::Particle>> { req[k].as_array().map(|a| a.iter().map(particle_of).collect::<Option<Vec<_>>>()).unwrap_or(Some(Vec::new())) };
            match (side("before"), side("after")) {
                (Some(b), Some(a)) => {
                    let r = match constants_set(req) {
                        Some(set) => nuclear::reaction_with(&b, &a, crate::constants::nuclear(set).me),
                        None => nuclear::reaction(&b, &a),
                    };
                    // 26.56: the mass defect in u by the u c² of the request's set (the interface computes nothing)
                    let u = constants_set(req).map(|s| crate::constants::nuclear(s).u).unwrap_or(nuclear::U_MEV);
                    json!({ "valid": true, "A": [r.nucleons.0, r.nucleons.1], "Z": [r.charge.0, r.charge.1], "balanced": r.balanced, "Q": opt_json(r.q), "dm": opt_json(r.q.map(|q| q / u)), "uMeV": jnum(u), "estimated": r.estimated })
                }
                _ => json!({ "valid": false }),
            }
        }
        // 26.56 (D100): a general particle process against charge, baryon and lepton-family numbers and energy
        "particleProcess" => {
            let set = crate::constants::normalize(req.get("constantsSet").and_then(|v| v.as_str()), crate::constants::DEFAULT);
            let items = |k: &str| -> Vec<crate::particles::Item> {
                req[k].as_array().cloned().unwrap_or_default().iter().map(|v| match v.as_str() {
                    Some(id) => crate::particles::Item::Particle(id.to_string()),
                    None => crate::particles::Item::Nuclide { z: num(v, "Z", 0.0).max(0.0) as u32, a: num(v, "A", 0.0).max(0.0) as u32 },
                }).collect()
            };
            let c = crate::particles::check(&items("before"), &items("after"), set);
            json!({
                "known": c.known, "allowed": c.allowed, "violations": c.violations,
                "charge": [c.charge.0, c.charge.1], "baryon": [c.baryon.0, c.baryon.1], "lepton": [c.lepton.0, c.lepton.1],
                "strangeness": [c.strangeness.0, c.strangeness.1], "strangenessChanges": c.strangeness_changes,
                "mass": [jnum(c.mass.0), jnum(c.mass.1)], "Q": c.q.map(jnum), "threshold": c.threshold.map(jnum),
                "estimated": c.estimated, "constantsSet": set, "catalogue": crate::particles::catalogue(),
            })
        }
        "compton" => {
            let lam = num(req, "lambda", 71.0) * 1e-12;
            // 26.56 (D100): with a constant set, λ_C, hc and mₑc² of that set; without, the values of the old files
            let (lc, hc, me) = match constants_set(req) {
                Some(set) => (crate::constants::value(set, "lambda_C"), crate::constants::value(set, "h_planck") * crate::constants::value(set, "c_light") / crate::constants::value(set, "e_charge") * 1e-6, crate::constants::nuclear(set).me),
                None => (nuclear::COMPTON, 1.23984198e-12, nuclear::ME_MEV),
            };
            let cp = |l: f64, th: f64| nuclear::compton_with(l, th, lc, hc, me);
            let (l2, e2, ek, phi) = cp(lam, num(req, "theta", std::f64::consts::FRAC_PI_2));
            let n = 181;
            let mut curve = Vec::with_capacity(2 * n);
            for k in 0..n {
                let th = std::f64::consts::PI * k as f64 / (n - 1) as f64;
                curve.push(th);
                curve.push((cp(lam, th).0 - lam) * 1e12);
            }
            json!({ "lambda2": jnum(l2 * 1e12), "shift": jnum((l2 - lam) * 1e12), "E1": jnum(hc / lam), "E2": jnum(e2), "Ek": jnum(ek), "phi": jnum(phi), "compton": jnum(lc * 1e12), "constantsSet": constants_set(req).unwrap_or("CODATA2018-rounded"), "curve": blob.f64s(&curve) })
        }
        "magnetMap" => {
            let s = magnet_sources(req);
            let r = req.get("region").cloned().unwrap_or(Value::Null);
            let (x0, y0, x1, y1) = (num(&r, "x0", -0.2), num(&r, "y0", -0.15), num(&r, "x1", 0.2), num(&r, "y1", 0.15));
            let (lv, segs, starts) = magnet::contours(&s, x0, y0, x1, y1, num(req, "grid", 160.0).clamp(8.0, 600.0) as usize, num(req, "lines", 24.0).clamp(0.0, 120.0) as usize);
            // compass grid
            let ac = num(req, "arrows", 16.0).clamp(0.0, 80.0) as usize;
            let mut arrows = Vec::new();
            if ac > 0 {
                let (w, h) = (x1 - x0, y1 - y0);
                let step = w.max(h) / ac as f64;
                let (nx, ny) = ((w / step).floor() as usize, (h / step).floor() as usize);
                for j in 0..ny {
                    for i in 0..nx {
                        let (x, y) = (x0 + (i as f64 + 0.5) * step, y0 + (j as f64 + 0.5) * step);
                        let (bx, by) = magnet::field(&s, x, y);
                        arrows.extend_from_slice(&[x, y, bx, by]);
                    }
                }
            }
            let probes: Vec<Value> = req["probes"].as_array().cloned().unwrap_or_default().iter().map(|p| {
                let (x, y) = (num(p, "x", 0.0), num(p, "y", 0.0));
                let (bx, by) = magnet::field(&s, x, y);
                json!({ "Bx": jnum(bx), "By": jnum(by), "A": jnum(magnet::potential(&s, x, y)) })
            }).collect();
            let forces: Vec<Value> = (0..req["wires"].as_array().map_or(0, |a| a.len())).map(|k| { let (fx, fy) = magnet::wire_force(&s, k); json!({ "x": jnum(fx), "y": jnum(fy) }) }).collect();
            let flux = req.get("loop").filter(|l| l.is_object()).map(|l| jnum(magnet::potential(&s, num(l, "x1", 0.0), num(l, "y1", 0.0)) - magnet::potential(&s, num(l, "x2", 0.0), num(l, "y2", 0.0))));
            json!({
                "contours": { "levels": lv.iter().map(|v| jnum(*v)).collect::<Vec<_>>(), "segs": blob.f64s(&segs), "starts": starts },
                "arrows": blob.f64s(&arrows), "probes": probes, "forces": forces, "flux": flux,
                "wires": s.wires.iter().map(|w| json!([jnum(w.x), jnum(w.y), jnum(w.i)])).collect::<Vec<_>>()
            })
        }
        "plateCapacitor" => {
            // C = ε_r ε₀ S / d; connected to a battery U is fixed, isolated Q is fixed (26.56: ε₀ of the request's set;
            // absent: the CODATA 2018 value of old files)
            let eps0 = constants_set(req).map(|set| crate::constants::value(set, "eps0")).unwrap_or(8.8541878128e-12);
            let cap = |s: f64, d: f64, er: f64| er * eps0 * s / d;
            let (s, d, er) = (num(req, "S", 0.01).max(1e-12), num(req, "d", 1e-3).max(1e-12), num(req, "er", 1.0).max(1.0));
            let (s0, d0, er0) = (num(req, "S0", s).max(1e-12), num(req, "d0", d).max(1e-12), num(req, "er0", er).max(1.0));
            let (c0, c1) = (cap(s0, d0, er0), cap(s, d, er));
            let battery = string(req, "mode") != "isolated";
            let (q0, u0) = if battery { let u = num(req, "U", 10.0); (c0 * u, u) } else { let q = num(req, "Q", c0 * num(req, "U", 10.0)); (q, q / c0) };
            let (q1, u1) = if battery { (c1 * u0, u0) } else { (q0, q0 / c1) };
            let (w0, w1) = (0.5 * q0 * u0, 0.5 * q1 * u1);
            // work by the battery (U·ΔQ) and by the hand (ΔW_field − battery work)
            let wb = if battery { u0 * (q1 - q0) } else { 0.0 };
            json!({
                "C": jnum(c1), "C0": jnum(c0), "Q": jnum(q1), "Q0": jnum(q0), "U": jnum(u1), "U0": jnum(u0),
                "E": jnum(u1 / d), "E0": jnum(u0 / d0), "sigma": jnum(q1 / s), "energy": jnum(w1), "energy0": jnum(w0),
                "batteryWork": jnum(wb), "handWork": jnum(w1 - w0 - wb), "density": jnum(0.5 * er * eps0 * (u1 / d) * (u1 / d))
            })
        }
        _ => return None,
    })
}
