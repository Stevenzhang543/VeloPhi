//! Operations of the reactor workshop (engine/CHEM.md, "Reactor operations").
//!
//! Every result that contains numbers of the model carries the diagnostic `reactor.teachingModel` (info): two-group
//! diffusion with homogenised cross-sections and lumped thermal hydraulics — a teaching model, not for design or
//! safety analysis (D278).

use serde_json::{json, Map, Value};
use velophi_core::dmath::log;
use velophi_core::message::{Message, SimResult};
use velophi_core::transport::{dnum, jnum, Blob};

use super::kinetics::{self, End, Kinetics, Options};
use super::layout::{self, solve, Doc, FEEDBACK, TOLERANCE};
use super::materials::{self, Conditions};
use super::poisons::Poisons;
use super::presets;
use super::reactor::{self, advance, kinetics_of, Controls, Model, Run, State, SERIES};

fn bad(what: impl Into<String>) -> Message {
    Message::new("err.internal").text("message", format!("reactor: {}", what.into()))
}

fn diagnostic(code: &str, severity: &str, params: Value) -> Value {
    json!({ "code": code, "severity": severity, "params": params })
}

fn teaching() -> Value {
    diagnostic("reactor.teachingModel", "info", json!({}))
}

fn num(req: &Value, key: &str) -> Option<f64> {
    req.get(key).filter(|x| !x.is_null()).map(dnum).filter(|x| x.is_finite())
}

fn nums(v: &[f64]) -> Vec<Value> {
    v.iter().map(|x| jnum(*x)).collect()
}

fn cell_name(doc: &Doc, cell: usize) -> String {
    format!("{},{}", cell % doc.nx, cell / doc.nx)
}

/// The conditions of a request: `conditions` (or `T`, the name of the interface draft), else cold.
fn conditions_of(req: &Value, doc: &Doc) -> Conditions {
    let cold = Conditions::cold(doc.lib().map(|l| l.t_ref).unwrap_or(293.0));
    Conditions::from_json(req.get("conditions").or_else(|| req.get("T")), cold)
}

fn rods_of(req: &Value, doc: &Doc) -> Vec<f64> {
    match req.get("insertions").and_then(|v| v.as_array()) {
        Some(a) if a.len() == doc.rods.len() => a.iter().map(|x| dnum(x).clamp(0.0, 1.0)).collect(),
        _ => doc.rod_insertions(),
    }
}

fn criticality(req: &Value, blob: &mut Blob) -> SimResult<Value> {
    let doc = Doc::parse(req)?;
    let state = match req.get("state").filter(|v| v.is_object()) {
        Some(s) => Some(State::from_json(s, &doc)?),
        None => None,
    };
    let (c, rods) = match &state {
        Some(s) => (Model::new(&doc).conditions(&s.temps, &s.poisons), s.rods.clone()),
        None => (conditions_of(req, &doc), rods_of(req, &doc)),
    };
    let tol = num(req, "tol").unwrap_or(TOLERANCE).clamp(1e-13, 1e-3);
    let (_, _, st) = solve(&doc, &c, &rods, tol)?;
    let mut diagnostics = vec![teaching()];
    if !st.converged {
        diagnostics.push(diagnostic("reactor.notConverged", "approx", json!({ "residual": st.residual, "k": st.k })));
    }
    let r = doc.refine;
    let fx = doc.nx * r;
    let detectors: Vec<Value> = doc
        .detectors
        .iter()
        .map(|cell| {
            let (cx, cy) = (cell % doc.nx, cell / doc.nx);
            let (mut f1, mut f2) = (0.0, 0.0);
            for y in cy * r..(cy + 1) * r {
                for x in cx * r..(cx + 1) * r {
                    f1 += st.flux1[y * fx + x];
                    f2 += st.flux2[y * fx + x];
                }
            }
            json!({ "cell": cell_name(&doc, *cell), "flux1": jnum(f1 / (r * r) as f64), "flux2": jnum(f2 / (r * r) as f64) })
        })
        .collect();
    let mut out = json!({
        "keff": jnum(st.k), "rho": jnum(1.0 - 1.0 / st.k),
        "nx": fx, "ny": doc.ny * r, "h_cm": jnum(doc.pitch / r as f64),
        "flux1": blob.f64s(&st.flux1), "flux2": blob.f64s(&st.flux2), "power": blob.f64s(&st.power), "cellPower": blob.f64s(&st.cell_power),
        "peak": jnum(st.peak), "iterations": st.applications, "restarts": st.restarts, "residual": jnum(st.residual), "converged": st.converged,
        "conditions": c.to_json(), "insertions": nums(&rods), "detectors": detectors,
        "diagnostics": diagnostics,
    });
    if req.get("feedback").and_then(|v| v.as_bool()).unwrap_or(false) {
        let s = layout::summary(&doc, &c, &rods)?;
        let kin = kinetics_of(&doc, s.generation);
        let mut alpha = Map::new();
        for (i, name) in FEEDBACK.iter().enumerate() {
            alpha.insert((*name).to_string(), jnum(s.alpha[i]));
        }
        out["feedback"] = json!({ "alpha": alpha, "generation": jnum(s.generation), "beta": jnum(kin.beta_total()), "fluxPerFission": jnum(s.flux_per_fission), "sourceWeight": jnum(s.source_weight), "adjointConverged": s.converged });
    }
    Ok(out)
}

fn run_json(doc: &Doc, state: &State, run: &Run, blob: &mut Blob) -> Value {
    let count = run.samples.len();
    let t: Vec<f64> = run.samples.iter().map(|s| s.t).collect();
    let mut series = Map::new();
    let mut column = vec![0.0; count];
    for (j, name) in SERIES.iter().enumerate() {
        for (k, s) in run.samples.iter().enumerate() {
            column[k] = s.values()[j];
        }
        series.insert((*name).to_string(), blob.f64s(&column));
    }
    // detector readings: thermal flux (1/(cm² s)) = flux per fission-rate density × fission-rate density
    let model = Model::new(doc);
    let mut detectors = Vec::new();
    if let Some(core) = &state.core {
        for (d, cell) in doc.detectors.iter().enumerate() {
            detectors.push(json!({ "cell": cell_name(doc, *cell), "flux": jnum(core.detectors[d] * state.n.max(0.0) * model.fission_nominal * 1e24) }));
        }
    }
    let mut diagnostics = vec![teaching()];
    diagnostics.extend(run.diagnostics.iter().cloned());
    json!({
        "state": state.to_json(), "t": blob.f64s(&t), "series": series, "samples": count,
        "events": run.events, "detectors": detectors, "solves": run.solves, "steps": run.steps, "partial": run.partial,
        "beta": jnum(kinetics_of(doc, 1.0).beta_total()),
        "diagnostics": diagnostics,
    })
}

fn advance_op(req: &Value, blob: &mut Blob) -> SimResult<Value> {
    let doc = Doc::parse(req)?;
    if doc.lib.is_none() {
        return Err(bad("reactorAdvance needs the reactor data (reactorSetData)"));
    }
    let mut run = Run::default();
    let mut state = match req.get("state").filter(|v| v.is_object()) {
        Some(s) => State::from_json(s, &doc)?,
        None => {
            let init = req.get("init").cloned().unwrap_or(Value::Null);
            State::initial(&doc, num(&init, "power"), num(&init, "coldT").unwrap_or(doc.plant.t_ambient).clamp(250.0, 1000.0), num(&init, "rods"), init.get("search").and_then(|v| v.as_bool()).unwrap_or(false), &mut run)?
        }
    };
    let dt = num(req, "dt").unwrap_or(0.0);
    if !(dt >= 0.0) || dt > 1e9 {
        return Err(bad("dt must be 0 … 1e9 s"));
    }
    let controls = Controls::from_json(req.get("controls"), &doc)?;
    let budget = num(req, "maxSolves").unwrap_or(40.0).clamp(1.0, 400.0) as usize;
    if dt > 0.0 {
        let solves = run.solves;
        let mut more = advance(&doc, &mut state, dt, num(req, "samples").unwrap_or(50.0).max(1.0) as usize, &controls, budget)?;
        more.solves += solves;
        more.diagnostics.splice(0..0, run.diagnostics.drain(..));
        run = more;
    }
    Ok(run_json(&doc, &state, &run, blob))
}

fn balance(req: &Value) -> SimResult<Value> {
    let doc = Doc::parse(req)?;
    let state = match req.get("state").filter(|v| v.is_object()) {
        Some(s) => Some(State::from_json(s, &doc)?),
        None => None,
    };
    let t_ref = doc.lib().map(|l| l.t_ref).unwrap_or(293.0);
    let cold = Conditions::cold(t_ref);
    let (now, rods, shim) = match &state {
        Some(s) => (Model::new(&doc).conditions(&s.temps, &s.poisons), s.rods.clone(), s.shim),
        None => (conditions_of(req, &doc), rods_of(req, &doc), 0.0),
    };
    let out_rods = vec![0.0; doc.rods.len()];
    // one change at a time, from the cold clean core with the rods out to the core as it is
    let steps: [(&str, Conditions); 5] = [
        ("excess", cold),
        ("fuelTemperature", Conditions { fuel_t: now.fuel_t, ..cold }),
        ("moderatorTemperature", Conditions { xenon: 0.0, samarium: 0.0, ..now }),
        ("xenon", Conditions { samarium: 0.0, ..now }),
        ("samarium", now),
    ];
    let mut entries = Vec::new();
    let mut solves = 0;
    let mut last: Option<(Conditions, f64, f64)> = None;
    for (id, c) in steps {
        let (k, rho) = match last {
            Some((lc, k, rho)) if lc == c => (k, rho),
            _ => {
                let (_, _, st) = solve(&doc, &c, &out_rods, TOLERANCE)?;
                solves += 1;
                (st.k, 1.0 - 1.0 / st.k)
            }
        };
        let before = last.map(|l| l.2).unwrap_or(0.0);
        entries.push(json!({ "id": id, "rho": jnum(rho - before), "k": jnum(k) }));
        last = Some((c, k, rho));
    }
    let before = last.map(|l| l.2).unwrap_or(0.0);
    let (k, rho) = if rods.iter().all(|x| *x == 0.0) {
        (last.map(|l| l.1).unwrap_or(1.0), before)
    } else {
        let (_, _, st) = solve(&doc, &now, &rods, TOLERANCE)?;
        solves += 1;
        (st.k, 1.0 - 1.0 / st.k)
    };
    entries.push(json!({ "id": "rods", "rho": jnum(rho - before), "k": jnum(k) }));
    entries.push(json!({ "id": "shim", "rho": jnum(shim), "k": jnum(k) }));
    Ok(json!({
        "entries": entries, "keff": jnum(k), "rhoStatic": jnum(rho), "rho": jnum(rho + shim), "beta": jnum(kinetics_of(&doc, 1.0).beta_total()),
        "conditions": now.to_json(), "insertions": nums(&rods), "solves": solves, "diagnostics": [teaching()],
    }))
}

/// Point kinetics alone: a reactivity that is constant or a list of steps `[[t, ρ], …]`.
fn point_kinetics(req: &Value, blob: &mut Blob) -> SimResult<Value> {
    let lib = materials::library_opt();
    let six = |key: &str, default: [f64; 6]| -> SimResult<[f64; 6]> {
        match req.get(key).and_then(|v| v.as_array()) {
            None => Ok(default),
            Some(a) if a.len() == 6 => {
                let mut out = [0.0; 6];
                for (i, x) in a.iter().enumerate() {
                    out[i] = dnum(x);
                    if !(out[i] > 0.0) || !out[i].is_finite() {
                        return Err(bad(format!("{key}[{i}] must be > 0")));
                    }
                }
                Ok(out)
            }
            Some(_) => Err(bad(format!("{key} must hold six numbers"))),
        }
    };
    let (b0, l0) = match &lib {
        Some(l) => (l.beta, l.lambda),
        None => (reactor::BETA, reactor::LAMBDA),
    };
    let kin = Kinetics { beta: six("beta", b0)?, lambda: six("lambda", l0)?, generation: num(req, "generation").unwrap_or(2e-5) };
    if !(kin.generation > 0.0) {
        return Err(bad("generation must be > 0"));
    }
    let duration = num(req, "duration").unwrap_or(10.0);
    let samples = num(req, "samples").unwrap_or(200.0).clamp(1.0, 20000.0) as usize;
    if !(duration > 0.0) || duration > 1e9 {
        return Err(bad("duration must be > 0"));
    }
    // reactivity steps, sorted by time
    let mut steps: Vec<(f64, f64)> = match req.get("steps").and_then(|v| v.as_array()) {
        Some(a) => a.iter().filter_map(|p| p.as_array().filter(|p| p.len() == 2).map(|p| (dnum(&p[0]), dnum(&p[1])))).collect(),
        None => vec![(0.0, num(req, "rho").unwrap_or(0.0))],
    };
    if steps.is_empty() || steps.iter().any(|s| !s.0.is_finite() || !s.1.is_finite() || s.0 < 0.0) {
        return Err(bad("steps must be pairs [t ≥ 0, ρ]"));
    }
    steps.sort_by(|a, b| a.0.total_cmp(&b.0));
    let source = num(req, "source").unwrap_or(0.0).max(0.0);
    let n0 = num(req, "n0").unwrap_or(1.0);
    if !(n0 > 0.0) {
        return Err(bad("n0 must be > 0"));
    }
    let rho_at = |t: f64| -> f64 {
        let mut rho = 0.0;
        for s in &steps {
            if s.0 <= t {
                rho = s.1;
            }
        }
        rho
    };
    let limit = kin.limit();
    let mut y = vec![0.0; 7];
    y[0] = n0;
    y[1..7].copy_from_slice(&kin.equilibrium(n0));
    let opts = Options { rtol: num(req, "rtol").unwrap_or(1e-8).clamp(1e-12, 1e-3), atol: vec![1e-300; 7], h_max: f64::INFINITY, max_steps: 2_000_000 };
    let mut h = 1e-6;
    let (mut ts, mut ns, mut rhos, mut periods) = (Vec::new(), Vec::new(), Vec::new(), Vec::new());
    let mut precursors: Vec<f64> = Vec::new();
    let mut t = 0.0;
    let mut ended: Option<(f64, f64)> = None;
    let mut total_steps = 0;
    'samples: for k in 1..=samples {
        let target = if k == samples { duration } else { duration * k as f64 / samples as f64 };
        while t < target {
            let rho = rho_at(t);
            if rho >= limit {
                ended = Some((t, rho));
                break 'samples;
            }
            // up to the next step of the reactivity or the sample
            let mut stop = target;
            for s in &steps {
                if s.0 > t && s.0 < stop {
                    stop = s.0;
                }
            }
            let mut f = |y: &[f64], dy: &mut [f64]| {
                let (dn, dc) = kin.rates(rho, y[0], &y[1..7], source);
                dy[0] = dn;
                dy[1..7].copy_from_slice(&dc);
            };
            let mut never = |_: f64, _: &[f64]| false;
            let out = kinetics::integrate(&mut f, t, stop, &mut y, &mut h, &opts, &mut never);
            total_steps += out.steps;
            if out.end == End::Failed {
                return Err(bad(format!("the integration stalled at t = {} s", out.t)));
            }
            t = stop;
            // a step change of the reactivity restarts the step size
            if stop < target {
                h = 1e-6;
            }
        }
        let rho = rho_at(t);
        let (dn, _) = kin.rates(rho, y[0], &y[1..7], source);
        ts.push(t);
        ns.push(y[0]);
        rhos.push(rho);
        periods.push(if dn != 0.0 { y[0] / dn } else { f64::INFINITY });
        precursors.extend_from_slice(&y[1..7]);
    }
    let last = steps.last().map(|s| s.1).unwrap_or(0.0);
    let omega = if last < limit { kin.inhour(last) } else { f64::NAN };
    let beta = kin.beta_total();
    let mut diagnostics = vec![teaching()];
    if let Some((te, rho)) = ended {
        diagnostics.push(diagnostic("reactor.promptCritical", "unmodelled", json!({ "t": te, "rho": rho, "limit": limit })));
    }
    Ok(json!({
        "t": blob.f64s(&ts), "n": blob.f64s(&ns), "rho": blob.f64s(&rhos), "period": blob.f64s(&periods), "precursors": blob.f64s(&precursors),
        "samples": ts.len(), "steps": total_steps,
        "beta": jnum(beta), "limit": jnum(limit), "generation": jnum(kin.generation),
        "inhour": { "rho": jnum(last), "omega": if omega.is_nan() { Value::Null } else { jnum(omega) }, "period": if omega.is_nan() || omega == 0.0 { Value::Null } else { jnum(1.0 / omega) } },
        // the power right after a step from critical equilibrium, once the prompt neutrons have settled: n·β/(β − ρ)
        "promptJump": if last < limit { jnum(beta / (beta - last)) } else { Value::Null },
        "ended": ended.map(|(te, rho)| json!({ "reason": "validity", "t": jnum(te), "value": jnum(rho), "limit": jnum(limit) })),
        "diagnostics": diagnostics,
    }))
}

/// The poison chains alone for a given fission rate and flux, with an optional shutdown.
fn poison_run(req: &Value, blob: &mut Blob) -> SimResult<Value> {
    let lib = materials::library()?;
    let data = lib.poisons;
    let fission = num(req, "fissionRate").unwrap_or(0.0);
    let flux = num(req, "flux").unwrap_or(0.0);
    let duration = num(req, "duration").unwrap_or(0.0);
    if !(fission >= 0.0 && flux >= 0.0 && duration > 0.0) || duration > 1e9 {
        return Err(bad("reactorPoisons needs fissionRate ≥ 0 (1/(cm³ s)), flux ≥ 0 (1/(cm² s)) and duration > 0 (s)"));
    }
    let samples = num(req, "samples").unwrap_or(200.0).clamp(1.0, 20000.0) as usize;
    let shutdown = num(req, "shutdownAt").filter(|t| *t >= 0.0);
    // 10²⁴ units inside (see poisons.rs)
    let (f24, phi24) = (fission * 1e-24, flux * 1e-24);
    let eq = data.equilibrium(f24, phi24);
    let mut p = if req.get("start").and_then(|v| v.as_str()) == Some("equilibrium") { eq } else { Poisons::default() };
    let mut y = vec![p.iodine, p.xenon, p.promethium, p.samarium];
    let scale = (data.gamma_i * f24 / data.lambda_i).max(1e-30);
    let opts = Options { rtol: num(req, "rtol").unwrap_or(1e-9).clamp(1e-12, 1e-3), atol: vec![1e-12 * scale; 4], h_max: f64::INFINITY, max_steps: 2_000_000 };
    let mut h = 1.0;
    let mut t = 0.0;
    let (mut ts, mut cols) = (Vec::new(), vec![Vec::new(), Vec::new(), Vec::new(), Vec::new()]);
    let mut at_shutdown: Option<Poisons> = if shutdown == Some(0.0) { Some(p) } else { None };
    for k in 1..=samples {
        let target = if k == samples { duration } else { duration * k as f64 / samples as f64 };
        while t < target {
            let on = shutdown.is_none_or(|s| t < s);
            let stop = match shutdown {
                Some(s) if s > t && s < target => s,
                _ => target,
            };
            let (f, phi) = if on { (f24, phi24) } else { (0.0, 0.0) };
            let mut rhs = |y: &[f64], dy: &mut [f64]| {
                let d = data.rates(&Poisons { iodine: y[0], xenon: y[1], promethium: y[2], samarium: y[3] }, f, phi);
                dy[0] = d.iodine;
                dy[1] = d.xenon;
                dy[2] = d.promethium;
                dy[3] = d.samarium;
            };
            let mut never = |_: f64, _: &[f64]| false;
            let out = kinetics::integrate(&mut rhs, t, stop, &mut y, &mut h, &opts, &mut never);
            if out.end == End::Failed {
                return Err(bad(format!("the integration stalled at t = {} s", out.t)));
            }
            t = stop;
            p = Poisons { iodine: y[0], xenon: y[1], promethium: y[2], samarium: y[3] };
            if shutdown == Some(t) {
                at_shutdown = Some(p);
                h = 1.0;
            }
        }
        ts.push(t);
        for (c, v) in cols.iter_mut().zip(y.iter()) {
            c.push(*v * 1e24);
        }
    }
    // the xenon peak after the shutdown, from the state at the shutdown (closed form of the two-member chain)
    let peak = at_shutdown.map(|s| {
        let (li, lx) = (data.lambda_i, data.lambda_xe);
        let arg = li * li * s.iodine / (lx * (s.xenon * (li - lx) + li * s.iodine));
        if arg > 1.0 {
            let tp = log(arg) / (li - lx);
            let ex = velophi_core::dmath::exp(-lx * tp);
            let ei = velophi_core::dmath::exp(-li * tp);
            let x = s.xenon * ex + li * s.iodine / (li - lx) * (ex - ei);
            json!({ "after": jnum(tp), "xenon": jnum(x * 1e24), "ratio": jnum(if s.xenon > 0.0 { x / s.xenon } else { f64::INFINITY }) })
        } else {
            json!({ "after": jnum(0.0), "xenon": jnum(s.xenon * 1e24), "ratio": jnum(1.0) })
        }
    });
    let units = |p: &Poisons| json!({ "iodine": jnum(p.iodine * 1e24), "xenon": jnum(p.xenon * 1e24), "promethium": jnum(p.promethium * 1e24), "samarium": jnum(p.samarium * 1e24) });
    Ok(json!({
        "t": blob.f64s(&ts), "iodine": blob.f64s(&cols[0]), "xenon": blob.f64s(&cols[1]), "promethium": blob.f64s(&cols[2]), "samarium": blob.f64s(&cols[3]),
        "equilibrium": units(&eq), "atShutdown": at_shutdown.as_ref().map(units), "peak": peak,
        // macroscopic absorption of equilibrium xenon per cm of fuel cell
        "xenonAbsorption": jnum(data.sigma_xe * eq.xenon),
        "data": { "gammaI": jnum(data.gamma_i), "gammaXe": jnum(data.gamma_xe), "gammaPm": jnum(data.gamma_pm), "lambdaI": jnum(data.lambda_i), "lambdaXe": jnum(data.lambda_xe), "lambdaPm": jnum(data.lambda_pm), "sigmaXe_b": jnum(data.sigma_xe), "sigmaSm_b": jnum(data.sigma_sm) },
        "diagnostics": [teaching()],
    }))
}

fn materials_op(req: &Value) -> SimResult<Value> {
    let lib = materials::library()?;
    let c = Conditions::from_json(req.get("conditions"), Conditions::cold(lib.t_ref));
    let enrichment = num(req, "enrichment");
    let list: Vec<Value> = lib
        .materials
        .iter()
        .map(|m| {
            let mut o = json!({
                "id": m.id, "kind": m.kind.name(), "xs": m.evaluate(Some(&lib), enrichment, &c).to_json(), "reference": m.xs.to_json(),
                "name": m.meta["name"], "note": m.meta["note"], "src": m.meta["src"],
            });
            if let Some(f) = &m.fuel {
                o["fuel"] = json!({ "enrichment": jnum(m.enrichment(enrichment)), "adjustable": f.adjustable, "min": jnum(f.min), "max": jnum(f.max), "damage_K": jnum(f.damage) });
                // k∞ of the fuel cell alone: without a moderator there is no thermal source, only the fast group
                let x = m.evaluate(Some(&lib), enrichment, &c);
                o["kInfinity"] = jnum(if x.a1 + x.s12 > 0.0 { (x.nf1 + if x.a2 > 0.0 { x.nf2 * x.s12 / x.a2 } else { 0.0 }) / (x.a1 + x.s12) } else { 0.0 });
            }
            o
        })
        .collect();
    Ok(json!({
        "materials": list, "conditions": c.to_json(), "teaching": lib.teaching, "sources": lib.sources,
        "kinetics": { "beta": nums(&lib.beta), "lambda": nums(&lib.lambda), "betaTotal": jnum(lib.beta_total()) },
        "groups": { "T_ref_K": jnum(lib.t_ref), "v1_cm_s": jnum(lib.v1), "v2_cm_s": jnum(lib.v2) },
        "decayHeat": { "lambda": lib.decay_heat.iter().map(|d| jnum(d.0)).collect::<Vec<_>>(), "a": lib.decay_heat.iter().map(|d| jnum(d.1)).collect::<Vec<_>>() },
        "limits": { "promptMargin": jnum(kinetics::PROMPT_MARGIN), "rebase": jnum(reactor::REBASE), "scramTime_s": jnum(reactor::SCRAM_TIME) },
        "diagnostics": [teaching()],
    }))
}

/// Run one reactor operation; `None` when `op` is not one of them.
pub fn call(op: &str, req: &Value, blob: &mut Blob) -> Option<SimResult<Value>> {
    Some(match op {
        "reactorSetData" => match req.get("data") {
            Some(data) => materials::set(data),
            None => Err(bad("reactorSetData needs data")),
        },
        "reactorMaterials" => materials_op(req),
        "reactorCriticality" => criticality(req, blob),
        "reactorAdvance" => advance_op(req, blob),
        "reactorBalance" => balance(req),
        "reactorKinetics" => point_kinetics(req, blob),
        "reactorPoisons" => poison_run(req, blob),
        "reactorPresets" => Ok(json!({ "presets": presets::presets() })),
        "reactorTaskCheck" => (|| {
            let doc = Doc::parse(req)?;
            let state = match req.get("state").filter(|v| v.is_object()) {
                Some(s) => Some(State::from_json(s, &doc)?),
                None => None,
            };
            let start = match req.get("start").filter(|v| v.is_object()) {
                Some(s) => Some(Doc::parse(s)?),
                None => None,
            };
            let name = req.get("task").and_then(|v| v.as_str()).unwrap_or("");
            let mut out = presets::task(name, req, &doc, state.as_ref(), start.as_ref())?;
            out["diagnostics"] = json!([teaching()]);
            Ok(out)
        })(),
        _ => return None,
    })
}
