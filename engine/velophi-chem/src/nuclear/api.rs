//! Operations of the nuclide table and the decay chains (engine/CHEM.md, "Nuclear operations").

use serde_json::{json, Value};
use velophi_core::message::{Message, SimResult};
use velophi_core::transport::{dnum, jnum, Blob};

use super::bateman;
use super::chain::{diagnostic, Chain};
use super::nuclides::{self, Nuclide, Table, Target, AVOGADRO, F_MASS_EST, F_MODES_OPEN, F_T_EST, F_T_LIMIT, F_UNBOUND, MODES, SYMBOLS, U_KEV};

fn bad(what: impl Into<String>) -> Message {
    Message::new("err.internal").text("message", format!("nuclide: {}", what.into()))
}

fn opt(v: f64) -> Value {
    if v.is_nan() {
        Value::Null
    } else {
        jnum(v)
    }
}

fn num_or(req: &Value, key: &str, default: f64) -> f64 {
    match req.get(key) {
        None | Some(Value::Null) => default,
        Some(v) => {
            let d = dnum(v);
            if d.is_nan() {
                default
            } else {
                d
            }
        }
    }
}

fn record(table: &Table, i: usize, extra: &[nuclides::Feeding]) -> Value {
    let n: &Nuclide = &table.nuclides[i];
    let branches = table.branches(i, extra);
    let binding = table.binding(i);
    json!({
        "id": n.id(),
        "symbol": SYMBOLS[n.z as usize],
        "Z": n.z, "A": n.a, "N": n.a - n.z, "state": n.state,
        "massExcess": opt(n.mass_excess),
        "mass": opt(n.mass_u()),
        "binding": opt(binding),
        "bindingPerNucleon": opt(binding / n.a as f64),
        "stable": n.stable(),
        "halfLife": if n.stable() { Value::Null } else { opt(n.half_life) },
        "lambda": if n.stable() { jnum(0.0) } else { opt(n.lambda()) },
        "abundance": jnum(n.abundance),
        "flags": {
            "massEstimated": n.flags & F_MASS_EST != 0,
            "halfLifeEstimated": n.flags & F_T_EST != 0,
            "halfLifeLimit": n.flags & F_T_LIMIT != 0,
            "particleUnstable": n.flags & F_UNBOUND != 0,
            "modesOpen": n.flags & F_MODES_OPEN != 0,
        },
        "decays": n.decays.iter().map(|d| json!({ "mode": MODES[d.0].name, "intensity": opt(d.1) })).collect::<Vec<_>>(),
        "branches": branches.list.iter().map(|b| {
            let (to, sink) = match b.target {
                Target::Nuclide(j) => (Value::String(table.nuclides[j].id()), Value::Null),
                Target::Fission => (Value::Null, Value::String("fission".into())),
                Target::Outside(..) => (Value::Null, Value::String("outside".into())),
            };
            json!({ "mode": b.mode, "to": to, "sink": sink, "fraction": jnum(b.fraction), "Q": opt(b.q), "isomerUnknown": b.isomer_unknown.map(|j| table.nuclides[j].id()) })
        }).collect::<Vec<_>>(),
        "branchSum": jnum(branches.sum),
    })
}

/// The decay network of a request: `network` given in the request, or the table below `parents`.
fn chain_of(req: &Value, parents: &[String]) -> SimResult<(Chain, Option<std::rc::Rc<Table>>)> {
    if let Some(net) = req.get("network").filter(|v| v.is_object()) {
        return Ok((Chain::from_request(net)?, None));
    }
    let table = nuclides::table()?;
    let extra = nuclides::request_feeding(req)?;
    let mut idx = Vec::new();
    for p in parents {
        idx.push(table.find_id(p).ok_or_else(|| bad(format!("'{p}' is not in the table")))?);
    }
    if idx.is_empty() {
        return Err(bad("no parent nuclide given"));
    }
    let min_branch = num_or(req, "minBranch", 1e-6).clamp(0.0, 1.0);
    let max_members = num_or(req, "maxNuclides", 150.0).clamp(1.0, 400.0) as usize;
    let chain = Chain::from_table(&table, &idx, &extra, min_branch, max_members)?;
    Ok((chain, Some(table)))
}

fn chain_json(chain: &Chain) -> Value {
    json!({
        "nuclides": chain.members.iter().map(|m| json!({
            "id": m.id,
            "stable": m.half_life == f64::INFINITY,
            "halfLife": if m.half_life == f64::INFINITY { Value::Null } else { opt(m.half_life) },
            "lambda": jnum(m.lambda),
            "generation": m.generation,
        })).collect::<Vec<_>>(),
        "edges": chain.edges.iter().map(|e| json!({ "from": e.from, "to": e.to, "mode": e.mode, "fraction": jnum(e.fraction), "Q": opt(e.q) })).collect::<Vec<_>>(),
        "untracked": chain.lost.iter().map(|l| json!({ "from": l.from, "reason": l.reason, "fraction": jnum(l.fraction) })).collect::<Vec<_>>(),
        "diagnostics": chain.diagnostics,
    })
}

fn strings(v: Option<&Value>) -> Vec<String> {
    match v {
        Some(Value::String(s)) => vec![s.clone()],
        Some(Value::Array(a)) => a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect(),
        _ => Vec::new(),
    }
}

/// Run one nuclear operation; `None` when `op` is not one of them.
pub fn call(op: &str, req: &Value, blob: &mut Blob) -> Option<SimResult<Value>> {
    Some(match op {
        "nuclideSetData" => match req.get("data") {
            Some(data) => nuclides::set(data),
            None => Err(bad("nuclideSetData needs data")),
        },
        "nuclideInfo" => (|| {
            let table = nuclides::table()?;
            let extra = nuclides::request_feeding(req)?;
            let mut found: Vec<usize> = Vec::new();
            let mut missing: Vec<String> = Vec::new();
            for id in strings(req.get("ids")) {
                match table.find_id(&id) {
                    Some(i) => found.push(i),
                    None => missing.push(id),
                }
            }
            // every state of (Z, A), or every nuclide of an element
            let z = match req.get("element").and_then(|v| v.as_str()) {
                Some(sym) => Some(SYMBOLS.iter().position(|s| s.eq_ignore_ascii_case(sym)).ok_or_else(|| bad(format!("element '{sym}'")))? as u16),
                None => req.get("Z").map(dnum).filter(|z| *z >= 0.0 && *z < 119.0).map(|z| z as u16),
            };
            if let Some(z) = z {
                let a = req.get("A").map(dnum).filter(|a| *a >= 1.0 && *a < 400.0).map(|a| a as u16);
                for (i, n) in table.nuclides.iter().enumerate() {
                    if n.z == z && a.is_none_or(|a| n.a == a) {
                        found.push(i);
                    }
                }
            }
            Ok(json!({ "nuclides": found.iter().map(|i| record(&table, *i, &extra)).collect::<Vec<_>>(), "missing": missing, "count": table.nuclides.len() }))
        })(),
        "nuclideChart" => (|| {
            let table = nuclides::table()?;
            let n = table.nuclides.len();
            let (mut z, mut nn, mut state, mut mode) = (Vec::with_capacity(n), Vec::with_capacity(n), Vec::with_capacity(n), Vec::with_capacity(n));
            let (mut half, mut excess, mut abundance) = (Vec::with_capacity(n), Vec::with_capacity(n), Vec::with_capacity(n));
            for x in &table.nuclides {
                z.push(x.z as i32);
                nn.push((x.a - x.z) as i32);
                state.push(x.state as i32);
                half.push(x.half_life);
                excess.push(x.mass_excess);
                abundance.push(x.abundance);
                // the main mode: the largest published intensity (the first listed when none is quantified)
                let mut best: Option<(usize, f64)> = None;
                for &(m, f) in &x.decays {
                    let f = if f.is_nan() { 0.0 } else { f };
                    if best.is_none_or(|b| f > b.1) {
                        best = Some((m, f));
                    }
                }
                mode.push(best.map(|b| b.0 as i32).unwrap_or(-1));
            }
            Ok(json!({
                "count": n,
                "Z": blob.i32s(&z), "N": blob.i32s(&nn), "state": blob.i32s(&state),
                "halfLife": blob.f64s(&half), "massExcess": blob.f64s(&excess), "abundance": blob.f64s(&abundance),
                "mode": blob.i32s(&mode),
                "modes": MODES.iter().map(|m| m.name).collect::<Vec<_>>(),
                "citations": table.citations,
            }))
        })(),
        "nuclideChain" => (|| {
            let mut parents = strings(req.get("parents"));
            parents.extend(strings(req.get("parent")));
            let (chain, _) = chain_of(req, &parents)?;
            Ok(chain_json(&chain))
        })(),
        "nuclideDecay" => (|| {
            let inventory = req.get("inventory").and_then(|v| v.as_object()).ok_or_else(|| bad("nuclideDecay needs inventory"))?;
            // the parents in the order of the request (serde_json keeps object keys sorted: deterministic)
            let parents: Vec<String> = inventory.keys().cloned().collect();
            let (chain, table) = chain_of(req, &parents)?;
            let n = chain.members.len();
            let unit = req.get("unit").and_then(|v| v.as_str()).unwrap_or("N");
            let mut n0 = vec![0.0; n + 1];
            for (name, amount) in inventory {
                let amount = dnum(amount);
                if !(amount >= 0.0) || !amount.is_finite() {
                    return Err(bad(format!("amount of '{name}' must be a number ≥ 0")));
                }
                let i = match &table {
                    Some(t) => {
                        let ti = t.find_id(name).ok_or_else(|| bad(format!("'{name}' is not in the table")))?;
                        chain.members.iter().position(|m| m.index == Some(ti))
                    }
                    None => chain.members.iter().position(|m| &m.id == name),
                }
                .ok_or_else(|| bad(format!("'{name}' is not a member of the network")))?;
                let member = &chain.members[i];
                n0[i] += match unit {
                    "N" => amount,
                    "mol" => amount * AVOGADRO,
                    "Bq" => {
                        if member.lambda > 0.0 {
                            amount / member.lambda
                        } else if amount == 0.0 {
                            0.0
                        } else {
                            return Err(bad(format!("'{name}' does not decay: an activity cannot be given")));
                        }
                    }
                    "g" => {
                        let t = table.as_ref().ok_or_else(|| bad("unit g needs the nuclide table"))?;
                        let mass = member.index.map(|ti| t.nuclides[ti].mass_u()).unwrap_or(f64::NAN);
                        if !(mass > 0.0) {
                            return Err(bad(format!("the mass of '{name}' is not known")));
                        }
                        amount / mass * AVOGADRO
                    }
                    _ => return Err(bad(format!("unit '{unit}' (N, mol, g or Bq)"))),
                };
            }
            let net = chain.network();
            let (times, outcome) = match req.get("grid").filter(|v| v.is_object()) {
                Some(g) => {
                    let t_end = num_or(g, "tEnd", f64::NAN);
                    if !(t_end > 0.0) || !t_end.is_finite() {
                        return Err(bad("grid.tEnd must be > 0"));
                    }
                    bateman::solve_grid(&net, &n0, t_end, num_or(g, "samples", 201.0).clamp(2.0, 20001.0) as usize)
                }
                None => {
                    let times: Vec<f64> = req.get("times").and_then(|v| v.as_array()).map(|a| a.iter().map(dnum).collect()).unwrap_or_default();
                    if times.is_empty() || times.len() > 20001 || times.iter().any(|t| !(*t >= 0.0) || !t.is_finite()) {
                        return Err(bad("times must be 1 to 20001 numbers ≥ 0 (or give grid)"));
                    }
                    let o = bateman::solve_times(&net, &n0, &times);
                    (times, o)
                }
            };
            let count = times.len();
            let amounts = &outcome.amounts[..n * count];
            let mut activity = Vec::with_capacity(n * count);
            for (i, m) in chain.members.iter().enumerate() {
                for k in 0..count {
                    activity.push(m.lambda * amounts[i * count + k]);
                }
            }
            let mut diagnostics = chain.diagnostics.clone();
            if outcome.fallback > 0 {
                diagnostics.push(diagnostic("nuclide.matrixSolution", "info", json!({ "values": outcome.fallback, "of": outcome.analytic + outcome.fallback })));
            }
            Ok(json!({
                "nuclides": chain.members.iter().map(|m| m.id.clone()).collect::<Vec<_>>(),
                "lambda": chain.members.iter().map(|m| jnum(m.lambda)).collect::<Vec<_>>(),
                "t": blob.f64s(&times),
                "N": blob.f64s(amounts),
                "A": blob.f64s(&activity),
                "untracked": blob.f64s(&outcome.amounts[n * count..]),
                "total": jnum(n0.iter().sum::<f64>()),
                "analytic": outcome.analytic,
                "fallback": outcome.fallback,
                "errorBound": jnum(outcome.bound),
                "massUnit": jnum(U_KEV),
                "chain": chain_json(&chain),
                "diagnostics": diagnostics,
            }))
        })(),
        _ => return None,
    })
}
