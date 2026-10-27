//! Calculation interface of a session (26.53, D67): one JSON request `{ op, … }` → one result container (JSON +
//! binary blob, transport.rs). The same dispatcher serves the WebAssembly ABI (`session_call`), the native desktop
//! engine and `velophi-cli calc` (the parity harness). Operations are listed in engine/CALC.md.

use serde_json::{json, Map, Value};

use crate::message::{Message, SimResult};
use crate::observe::{custom_errors, list_quantities, quantity_series, Observation};
use crate::session::Session;
use crate::sha256::to_hex;
use crate::transport::{change_json, dnum, jnum, Blob};

fn bad(op: &str, what: &str) -> Message {
    Message::new("err.internal").text("message", format!("calc {op}: {what}"))
}

fn arg_f64(req: &Value, key: &str) -> Option<f64> {
    req.get(key).map(dnum).filter(|v| !v.is_nan())
}

fn arg_u64(req: &Value, key: &str) -> Option<u64> {
    arg_f64(req, key).map(|v| v.max(0.0) as u64)
}

fn arg_strings(req: &Value, key: &str) -> Vec<String> {
    req.get(key).and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|s| s.as_str().map(String::from)).collect()).unwrap_or_default()
}

fn arg_f64s(req: &Value, key: &str) -> Vec<f64> {
    req.get(key).and_then(|v| v.as_array()).map(|a| a.iter().map(dnum).collect()).unwrap_or_default()
}

/// Segment as the interface reads it (no mode objects, no X0).
fn segment_info(s: &crate::simulation::Segment) -> Value {
    let mut o = Map::new();
    o.insert("index".into(), json!(s.index));
    o.insert("t0".into(), jnum(s.t0));
    o.insert("t1".into(), jnum(s.t1));
    o.insert("label".into(), json!(s.label));
    o.insert("impactLoss".into(), jnum(s.impact_loss));
    if s.reduced {
        o.insert("reduced".into(), json!(true));
    }
    Value::Object(o)
}

/// Event as the interface reads it (states through `event`): the changes, a summary of the impact (points with
/// their pair or rope, loss and energies) and the point where the canvas labels it (the first change's point, else
/// the position of its first moving body before the event).
fn event_info(sys: &crate::dynamics::System, e: &crate::simulation::SimEvent) -> Value {
    let impact = e.impact.as_ref().map(|imp| {
        json!({
            "loss": jnum(imp.loss), "energyBefore": jnum(imp.energy_before), "energyAfter": jnum(imp.energy_after),
            "points": imp.points.iter().map(|p| json!({
                "kind": match p.kind { crate::impact::ImpactKind::Contact => "contact", crate::impact::ImpactKind::Rope => "rope", crate::impact::ImpactKind::Limit => "limit" },
                "pair": p.pair.map(|i| sys.pairs[i].key.clone()), "rope": p.rope, "friction": p.friction,
                "vnBefore": jnum(p.vn_before), "vnAfter": jnum(p.vn_after), "impulse": jnum(p.impulse), "cx": jnum(p.cx), "cy": jnum(p.cy)
            })).collect::<Vec<_>>()
        })
    });
    let model = &sys.model;
    let at = e.changes.first().and_then(|c| {
        let g = c.bodies.iter().find_map(|id| model.bodies.iter().find(|b| &b.id == id && b.dynamic))?;
        Some(match c.point {
            Some((x, y)) => json!([jnum(x), jnum(y)]),
            None => json!([jnum(e.before[3 * g.index as usize]), jnum(e.before[3 * g.index as usize + 1])]),
        })
    });
    json!({
        "index": e.index, "t": jnum(e.t), "triggers": e.triggers.iter().map(|t| t.name()).collect::<Vec<_>>(),
        "changes": e.changes.iter().map(change_json).collect::<Vec<_>>(), "segment": e.segment, "impact": impact, "at": at
    })
}

/// Run one request on a session.
pub fn call(s: &mut Session, req: &Value) -> SimResult<(Value, Blob)> {
    let op = req.get("op").and_then(|v| v.as_str()).unwrap_or("");
    let mut blob = Blob::default();
    let out = match op {
        "info" => {
            let rolling = s.rolling_fingerprint().map(|(h, t, c)| json!({ "hash": h, "t": jnum(t), "chunks": c }));
            json!({
                "frameCount": s.frame_count, "dt": jnum(s.dt), "size": s.size, "chunkFrames": s.chunk_frames,
                "t": jnum(s.t), "T": jnum(s.t_total), "duration": s.duration.map(jnum),
                "segments": s.segments.len(), "events": s.events.len(),
                "reducedFrom": s.reduced_from.map(jnum), "warnings": s.warnings.clone(), "stats": s.stats.clone(),
                "ended": s.end.is_some(), "completed": s.end.as_ref().map(|e| e.completed), "error": s.end.as_ref().map(|e| e.error.clone()),
                "stopReason": s.end.as_ref().and_then(|e| e.stop_reason.clone()), "hash": s.hash,
                "rolling": rolling, "memory": s.memory_json(), "closedChunks": s.closed_chunks(), "revision": s.revision
            })
        }
        "frames" => {
            let from = arg_u64(req, "from").unwrap_or(0);
            let last = s.frame_count.saturating_sub(1);
            let to = arg_u64(req, "to").unwrap_or(last).min(last);
            let stride = arg_u64(req, "stride").unwrap_or(1).max(1);
            let mut states = Vec::new();
            let mut seg = Vec::new();
            let mut loss = Vec::new();
            let mut k = from;
            while k <= to && s.frame_count > 0 {
                states.extend_from_slice(s.state(k)?);
                seg.push(s.segment(k)? as i32);
                loss.push(s.impact_loss(k)?);
                k += stride;
            }
            json!({ "count": seg.len(), "states": blob.f64s(&states), "segment": blob.i32s(&seg), "impactLoss": blob.f64s(&loss) })
        }
        "exactStates" => {
            let times = arg_f64s(req, "times");
            let mut states = Vec::with_capacity(times.len() * s.size);
            for t in &times {
                states.extend(s.exact_state_at(*t)?);
            }
            json!({ "states": blob.f64s(&states) })
        }
        "ledger" => {
            let mut list = Vec::new();
            for k in arg_f64s(req, "frames") {
                list.push(s.frame_ledger(k as u64)?.to_json());
            }
            json!({ "ledger": list })
        }
        "segments" => {
            let from = arg_u64(req, "from").unwrap_or(0) as usize;
            json!({ "segments": s.segments.iter().skip(from).map(segment_info).collect::<Vec<_>>() })
        }
        "events" => {
            let from = arg_u64(req, "from").unwrap_or(0) as usize;
            let sys = s.system.clone();
            json!({ "events": s.events.iter().skip(from).map(|e| event_info(&sys, e)).collect::<Vec<_>>() })
        }
        "event" => {
            let i = arg_u64(req, "index").ok_or_else(|| bad(op, "index"))? as usize;
            let sys = s.system.clone();
            let e = s.events.get(i).ok_or_else(|| bad(op, "no such event"))?;
            let mut v = event_info(&sys, e);
            v["before"] = blob.f64s(&e.before);
            v["after"] = blob.f64s(&e.after);
            v
        }
        "quantities" => {
            let sys = s.system.clone();
            let meta = s.meta.clone();
            let customs = s.customs().to_vec();
            let list = list_quantities(&sys, &meta, &customs);
            json!({ "quantities": list.iter().map(|q| q.to_json()).collect::<Vec<_>>(), "custom": custom_errors(&customs) })
        }
        "evaluate" => {
            let ids = arg_strings(req, "ids");
            let sys = s.system.clone();
            let meta = s.meta.clone();
            let customs = s.customs().to_vec();
            if let Some(ei) = arg_u64(req, "event") {
                let after = req.get("side").and_then(|v| v.as_str()) == Some("after");
                let values = crate::teaching::event_values(s, ei as usize, after, &ids)?;
                return Ok((json!({ "values": blob.f64s(&values) }), blob));
            }
            let (x, seg, loss, t) = if let Some(k) = arg_u64(req, "frame") {
                let seg = s.segment(k)?;
                (s.state(k)?.to_vec(), seg, s.impact_loss(k)?, k as f64 * s.dt)
            } else {
                let t = arg_f64(req, "t").ok_or_else(|| bad(op, "frame or t"))?;
                let x = s.exact_state_at(t)?;
                let seg = s.segment_at_time(t);
                let k = s.frame_at(t);
                (x, seg, s.impact_loss(k)?, t)
            };
            let mode = s.segments[seg].mode.clone();
            let obs = Observation::new(&sys, &meta, &customs, &x, &mode, loss, Some(t))?;
            let values: Vec<f64> = ids.iter().map(|id| obs.value(id)).collect();
            json!({ "values": blob.f64s(&values) })
        }
        "series" if req.get("frames").is_some() => {
            // Quantities at a list of frames (the overview of a long recording: chunk starts)
            let ids = arg_strings(req, "ids");
            let frames = arg_f64s(req, "frames");
            let mut t = Vec::with_capacity(frames.len());
            let mut values: Vec<Vec<f64>> = ids.iter().map(|_| Vec::with_capacity(frames.len())).collect();
            for k in frames {
                let (tk, v) = crate::observe::quantity_series(s, &ids, k as u64, k as u64, 1)?;
                t.extend(tk);
                for (j, x) in v.into_iter().enumerate() {
                    values[j].extend(x);
                }
            }
            json!({ "t": blob.f64s(&t), "values": values.iter().map(|v| blob.f64s(v)).collect::<Vec<_>>() })
        }
        "series" => {
            let ids = arg_strings(req, "ids");
            let last = s.frame_count.saturating_sub(1);
            let from = arg_u64(req, "from").unwrap_or(0);
            let to = arg_u64(req, "to").unwrap_or(last).min(last);
            let stride = arg_u64(req, "stride").unwrap_or(1);
            let (t, values) = quantity_series(s, &ids, from, to, stride)?;
            json!({ "t": blob.f64s(&t), "values": values.iter().map(|v| blob.f64s(v)).collect::<Vec<_>>() })
        }
        "contactForces" => {
            let k = arg_u64(req, "frame").ok_or_else(|| bad(op, "frame"))?;
            let on = req.get("on").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let by = req.get("by").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let sys = s.system.clone();
            let meta = s.meta.clone();
            let customs = s.customs().to_vec();
            let seg = s.segment(k)?;
            let x = s.state(k)?.to_vec();
            let loss = s.impact_loss(k)?;
            let mode = s.segments[seg].mode.clone();
            let obs = Observation::new(&sys, &meta, &customs, &x, &mode, loss, Some(k as f64 * s.dt))?;
            let c = obs.contact_forces(&on, &by);
            json!({ "Nx": jnum(c.nx), "Ny": jnum(c.ny), "N": jnum(c.n), "fx": jnum(c.fx), "fy": jnum(c.fy), "f": jnum(c.f), "vt": jnum(c.vt), "inContact": c.in_contact, "status": c.status })
        }
        "checkCustom" => {
            // Compile a custom-quantity expression against this scene's quantities (the watch panel's live check)
            let expr = req.get("expr").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let sys = s.system.clone();
            let meta = s.meta.clone();
            let units = crate::observe::builtin_quantities(&sys, &meta).into_iter().map(|q| (q.id, q.unit)).collect();
            let scope = crate::observe::CustomScope { units, owners: &meta.owners };
            match crate::observe::compile_custom(&expr, &scope) {
                Ok(c) => json!({ "ok": true, "unit": c.unit }),
                Err(e) => json!({ "ok": false, "error": e.to_json() }),
            }
        }
        "setLibrary" => json!({ "formulas": crate::formula::cards::set_library(&req["formulas"]) }),
        "situations" => {
            let list = crate::formula::Recognition::situations(s)?;
            json!({ "situations": list.iter().map(|x| x.to_json()).collect::<Vec<_>>(), "passes": s.recognition.passes })
        }
        "sample" => {
            let key = req.get("key").and_then(|v| v.as_str()).unwrap_or("");
            let t = arg_f64(req, "t").unwrap_or(0.0);
            let list = crate::formula::Recognition::situations(s)?;
            let sit = list.iter().find(|x| x.key == key).ok_or_else(|| bad(op, "no such situation"))?;
            let tc = crate::js::js_min(crate::js::js_max(t, sit.t0), sit.t1);
            let sample = (sit.sample)(s, tc)?;
            json!({ "sample": sample.to_json() })
        }
        "cards" => {
            // `moment`: the cards of an exported moment (export/moments.ts) sample a phase just before its end
            let t = arg_f64(req, "t").unwrap_or(0.0);
            let trace = req.get("trace").and_then(|v| v.as_bool()).unwrap_or(false);
            let moment = req.get("moment").and_then(|v| v.as_bool()).unwrap_or(false);
            let list = crate::formula::Recognition::situations(s)?;
            let lib = crate::formula::cards::library();
            let mut groups = Vec::new();
            for i in crate::formula::cards::active_situations(&list, t) {
                let sit = &list[i];
                let mut tc = crate::js::js_min(crate::js::js_max(t, sit.t0), sit.t1);
                if moment && sit.t_event.is_none() && sit.t1 > sit.t0 && tc >= sit.t1 - 1e-12 {
                    tc = sit.t1 - crate::js::js_min((sit.t1 - sit.t0) / 2.0, 1e-7);
                }
                let sample = (sit.sample)(s, tc)?;
                let cards: Vec<Value> = lib.iter().filter(|f| f.situation == sit.ty).map(|f| crate::formula::cards::evaluate_card(f, sit, &sample, trace).to_json(trace)).collect();
                groups.push(json!({ "situation": sit.to_json(), "sample": sample.to_json(), "cards": cards, "t": jnum(tc) }));
            }
            json!({ "groups": groups })
        }
        "eventData" => {
            let i = arg_u64(req, "index").ok_or_else(|| bad(op, "index"))? as usize;
            json!({ "event": crate::formula::event_detail::event_data(s, i) })
        }
        "card" => {
            // One formula of one situation at time t, with the sample and the value of every node of its expression
            let key = req.get("situation").and_then(|v| v.as_str()).unwrap_or("");
            let fid = req.get("formula").and_then(|v| v.as_str()).unwrap_or("");
            let t = arg_f64(req, "t").unwrap_or(0.0);
            let list = crate::formula::Recognition::situations(s)?;
            let Some(sit) = list.iter().find(|x| x.key == key) else { return Ok((json!({ "card": null }), blob)) };
            let lib = crate::formula::cards::library();
            let Some(f) = lib.iter().find(|f| f.id == fid) else { return Ok((json!({ "card": null }), blob)) };
            let tc = crate::js::js_min(crate::js::js_max(t, sit.t0), sit.t1);
            let sample = (sit.sample)(s, tc)?;
            let card = crate::formula::cards::evaluate_card(f, sit, &sample, true);
            json!({ "card": card.to_json(true), "situation": sit.to_json(), "sample": sample.to_json(), "t": jnum(tc) })
        }
        "timeline" => {
            // Formula timeline (D71): every situation with the verdicts of its formulas at a representative time
            let list = crate::formula::Recognition::situations(s)?;
            let lib = crate::formula::cards::library();
            let mut out = Vec::new();
            for sit in list.iter() {
                let t = sit.t_event.unwrap_or((sit.t0 + sit.t1) / 2.0);
                let tc = crate::js::js_min(crate::js::js_max(t, sit.t0), sit.t1);
                let sample = (sit.sample)(s, tc)?;
                let verdicts: Vec<Value> = lib
                    .iter()
                    .filter(|f| f.situation == sit.ty)
                    .map(|f| {
                        let c = crate::formula::cards::evaluate_card(f, sit, &sample, false);
                        json!({ "formula": f.id, "verdict": c.verdict.name() })
                    })
                    .collect();
                out.push(json!({ "situation": sit.to_json(), "t": jnum(tc), "cards": verdicts }));
            }
            json!({ "timeline": out })
        }
        "modelInfo" => {
            let sys = s.system.clone();
            json!({ "model": crate::views::model_info(&sys), "chunkFrames": s.chunk_frames, "dt": jnum(s.dt) })
        }
        "frameView" => {
            let t = arg_f64(req, "t").unwrap_or(0.0);
            let exact = req.get("exact").and_then(|v| v.as_bool()).unwrap_or(false);
            let forces = crate::views::ForceBodies::from_json(req.get("forces").unwrap_or(&Value::Null));
            crate::views::frame_view(s, t, exact, &forces, &mut blob)?
        }
        "poses" => {
            let exact = req.get("exact").and_then(|v| v.as_bool()).unwrap_or(false);
            let p = crate::views::poses_at(s, &arg_f64s(req, "times"), &arg_f64s(req, "frames"), exact)?;
            json!({ "poses": blob.f64s(&p), "bodies": s.system.model.bodies.len() })
        }
        "positions" => {
            let from = arg_u64(req, "from").unwrap_or(0);
            let to = arg_u64(req, "to").unwrap_or(s.frame_count).min(s.frame_count);
            let stride = arg_u64(req, "stride").unwrap_or(1);
            let cheap = req.get("cheapOnly").and_then(|v| v.as_bool()).unwrap_or(true);
            let (ks, xy) = crate::views::positions(s, from, to, stride, cheap)?;
            json!({ "frames": blob.f64s(&ks), "xy": blob.f64s(&xy), "n": s.system.n })
        }
        "vectorScales" => {
            let rec = req.get("recording").and_then(|v| v.as_bool()).unwrap_or(true);
            let (v, a, f) = crate::views::vector_scales(s, rec)?;
            json!({ "v": jnum(v), "a": jnum(a), "f": jnum(f) })
        }
        "emitters" => {
            let b = arg_u64(req, "block").unwrap_or(0);
            let (list, fin) = crate::views::emitters(s, b)?;
            json!({ "emitters": blob.f64s(&list), "fields": crate::views::EMITTER_FIELDS, "final": fin, "frames": s.frame_count, "events": s.events.len() })
        }
        "envelope" => {
            let r = crate::lod::EnvelopeRequest {
                ids: arg_strings(req, "ids"),
                k0: arg_f64(req, "k0").unwrap_or(0.0),
                k1: arg_f64(req, "k1").unwrap_or(0.0),
                columns: arg_f64(req, "columns").unwrap_or(1.0),
                budget: arg_u64(req, "budget").unwrap_or(4000) as usize,
                rebuild: req.get("rebuild").and_then(|v| v.as_bool()).unwrap_or(false),
                level: req.get("level").and_then(|v| v.as_str()).map(String::from),
            };
            crate::lod::envelope(s, &r, &mut blob)?
        }
        "stateComponent" => json!({ "component": crate::lod::state_component(&s.system.clone(), req.get("id").and_then(|v| v.as_str()).unwrap_or("")) }),
        "fbd" => {
            let t = arg_f64(req, "t").unwrap_or(0.0);
            let id = req.get("body").and_then(|v| v.as_str()).unwrap_or("").to_string();
            json!({ "fbd": crate::teaching::fbd(s, t, &id)? })
        }
        "tape" => {
            let id = req.get("body").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let dir = req.get("direction").and_then(|v| v.as_str()).unwrap_or("path").to_string();
            let tape = crate::teaching::tape(s, &id, &dir, arg_f64(req, "period").unwrap_or(0.02), arg_f64(req, "every").unwrap_or(5.0), arg_f64(req, "start").unwrap_or(0.0), arg_f64(req, "intervals"))?;
            json!({ "tape": tape })
        }
        "area" => {
            let id = req.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            json!({ "area": crate::teaching::area(s, &id, arg_f64(req, "t0").unwrap_or(0.0), arg_f64(req, "t1").unwrap_or(0.0))? })
        }
        "extreme" => {
            let id = req.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let max = req.get("which").and_then(|v| v.as_str()) != Some("min");
            json!({ "value": jnum(crate::teaching::extreme(s, &id, max)?) })
        }
        "pick" | "bodyAt" | "bodiesAt" | "surfaceBelow" | "featurePoints" => {
            // Editor queries at the drawn state: the initial state of a scene session, else the state at t
            let sys = s.system.clone();
            let xs = if s.frame_count == 0 { crate::dynamics::initial_state(&sys) } else { crate::views::display_state_at(s, arg_f64(req, "t").unwrap_or(0.0))? };
            let poses = crate::kinematics::compute_poses(&sys.model, &xs);
            let (px, py) = (arg_f64(req, "x").unwrap_or(0.0), arg_f64(req, "y").unwrap_or(0.0));
            let id = |g: usize| sys.model.bodies[g].id.clone();
            match op {
                "pick" => match crate::views::pick(&sys, &poses, px, py, arg_f64(req, "tol").unwrap_or(0.0)) {
                    Some((kind, oid)) => json!({ "hit": { "kind": kind, "id": oid } }),
                    None => json!({ "hit": null }),
                },
                "bodyAt" => {
                    let dyn_only = req.get("dynamicOnly").and_then(|v| v.as_bool()).unwrap_or(false);
                    json!({ "body": crate::views::body_at(&sys, &poses, px, py, arg_f64(req, "tol").unwrap_or(0.0), dyn_only).map(id) })
                }
                "bodiesAt" => json!({ "bodies": crate::views::bodies_at(&sys, &poses, px, py).into_iter().map(id).collect::<Vec<_>>() }),
                "surfaceBelow" => match crate::views::surface_below(&sys, &poses, px, py, arg_f64(req, "reach").unwrap_or(0.6)) {
                    Some((fx, fy, nx, ny, a)) => json!({ "surface": { "foot": { "x": jnum(fx), "y": jnum(fy) }, "n": { "x": jnum(nx), "y": jnum(ny) }, "angle": jnum(a) } }),
                    None => json!({ "surface": null }),
                },
                _ => json!({ "points": blob.f64s(&crate::views::feature_points(&sys, &poses)) }),
            }
        }
        "prefetch" => {
            // Work for a remote rebuilder when chunk c is evicted and closed (the host computes it and installs it)
            let c = arg_u64(req, "chunk").unwrap_or(0) as usize;
            match s.prefetch_request(c) {
                Some(r) => json!({ "request": { "chunk": r.chunk, "checkpoint": blob.f64s(&r.checkpoint), "endFrame": r.end_frame } }),
                None => json!({ "request": null }),
            }
        }
        "branchState" => {
            // Initial conditions of a branch from frame k (core/scene/branch.ts): body states, resolved lengths,
            // the ledger and the per-pair sliding distance and heat
            let k = arg_u64(req, "frame").ok_or_else(|| bad(op, "frame"))?;
            let sys = s.system.clone();
            let x = s.state(k)?.to_vec();
            let loss = s.impact_loss(k)?;
            let l = s.ledger_at(&x, loss);
            let model = &sys.model;
            let n = sys.n;
            let bodies: Vec<Value> = model
                .dynamic
                .iter()
                .map(|&g| {
                    let b = &model.bodies[g];
                    let i = b.index as usize;
                    json!({
                        "id": b.id, "x": jnum(x[3 * i]), "y": jnum(x[3 * i + 1]), "angle": jnum(x[3 * i + 2]), "vx": jnum(x[3 * n + 3 * i]), "vy": jnum(x[3 * n + 3 * i + 1]),
                        "omega": if b.inv_inertia > 0.0 { jnum(x[3 * n + 3 * i + 2]) } else { Value::Null }
                    })
                })
                .collect();
            // In the order of the system's pairs (as the scene file lists them): [key, sliding distance, heat]
            let mut pairs = Vec::new();
            for p in &sys.pairs {
                let base = sys.aux_base + crate::dynamics::AUX_FIXED + 2 * p.index;
                if x[base] != 0.0 || x[base + 1] != 0.0 {
                    pairs.push(json!([p.key, jnum(x[base]), jnum(x[base + 1])]));
                }
            }
            let mut ledger = json!({ "frictionHeat": jnum(l.friction_heat), "appliedWork": jnum(l.applied_work), "damping": jnum(l.damping), "beltWork": jnum(l.belt_work), "impactLoss": jnum(l.impact_loss) });
            // 26.55: the region, buoyancy, Joule and liquid counters continue in the branch
            if let Some(e) = l.extra {
                ledger["fieldWork"] = jnum(e[0]);
                ledger["buoyancyWork"] = jnum(e[1]);
                ledger["jouleHeat"] = jnum(e[2]);
                ledger["liquidHeat"] = jnum(e[3]);
            }
            json!({
                "bodies": bodies,
                "ropes": model.ropes.iter().map(|r| json!([r.id, jnum(r.length)])).collect::<Vec<_>>(),
                "rods": model.rods.iter().map(|r| json!([r.id, jnum(r.length)])).collect::<Vec<_>>(),
                "springs": model.springs.iter().map(|r| json!([r.id, jnum(r.rest_length)])).collect::<Vec<_>>(),
                "ledger": ledger,
                "pairs": pairs
            })
        }
        "remoteFailed" => {
            s.remote_failed(arg_u64(req, "chunk").unwrap_or(0) as usize);
            json!({})
        }
        "setBudget" => {
            s.set_budget(arg_f64(req, "bytes").unwrap_or(s.budget_bytes));
            json!({ "memory": s.memory_json() })
        }
        "evict" => {
            let c = arg_u64(req, "chunk").unwrap_or(0) as usize;
            json!({ "evicted": s.evict_chunk(c) })
        }
        "chunkDigest" => {
            let c = arg_u64(req, "chunk").unwrap_or(0) as usize;
            json!({ "summary": s.summary(c).map(|x| blob.f64s(x)), "resident": s.is_resident(c) })
        }
        _ => return Err(bad(op, "unknown operation")),
    };
    let _ = to_hex;
    Ok((out, blob))
}

/// Run one request and encode the result container.
pub fn call_bytes(s: &mut Session, req: &Value) -> SimResult<Vec<u8>> {
    let (doc, blob) = call(s, req)?;
    Ok(blob.finish(&doc))
}
