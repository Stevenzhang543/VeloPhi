//! The decay network below a set of parents (26.64, D276): members in a topological order, the decays between
//! them and what is not followed (fission products, daughters outside the table, branches below the requested
//! minimum, intensities that are not published). The part that is not followed is kept as one extra member
//! "untracked" of the Bateman network, so the number of nuclei stays conserved and the loss can be shown.

use std::collections::BTreeMap;

use serde_json::{json, Value};
use velophi_core::message::{Message, SimResult};
use velophi_core::transport::dnum;

use super::bateman::Network;
use super::nuclides::{Feeding, Table, Target, LN2};

/// A member of a decay network.
#[derive(Clone, Debug)]
pub struct Member {
    pub id: String,
    /// Index in the nuclide table; None for a member of a network given in the request.
    pub index: Option<usize>,
    /// Decay constant used (1/s); 0 for stable members and for members whose half-life is not known.
    pub lambda: f64,
    /// Half-life (s): +∞ stable, NaN not known.
    pub half_life: f64,
    /// 0 for the parents, else 1 + the largest generation of a parent of this member.
    pub generation: u32,
}

/// A decay between two members.
#[derive(Clone, Debug)]
pub struct Edge {
    pub from: usize,
    pub to: usize,
    pub mode: String,
    pub fraction: f64,
    /// Q value (keV); NaN when not known.
    pub q: f64,
}

/// A part of the decays of a member that is not followed.
#[derive(Clone, Debug)]
pub struct Lost {
    pub from: usize,
    /// "fission", "outside", "pruned", "unknown" or "deficit".
    pub reason: &'static str,
    pub fraction: f64,
}

#[derive(Clone, Debug, Default)]
pub struct Chain {
    pub members: Vec<Member>,
    pub edges: Vec<Edge>,
    pub lost: Vec<Lost>,
    pub diagnostics: Vec<Value>,
}

fn bad(what: impl Into<String>) -> Message {
    Message::new("err.internal").text("message", format!("decay network: {}", what.into()))
}

pub fn diagnostic(code: &str, severity: &str, params: Value) -> Value {
    json!({ "code": code, "severity": severity, "params": params })
}

/// Order the members by generation (longest path from a parent), ties by their first-seen order; an error when the
/// decays form a cycle.
fn order(count: usize, edges: &[(usize, usize)]) -> SimResult<(Vec<usize>, Vec<u32>)> {
    let mut indegree = vec![0usize; count];
    let mut children: Vec<Vec<usize>> = vec![Vec::new(); count];
    for &(a, b) in edges {
        indegree[b] += 1;
        children[a].push(b);
    }
    let mut generation = vec![0u32; count];
    let mut queue: Vec<usize> = (0..count).filter(|i| indegree[*i] == 0).collect();
    let mut head = 0;
    while head < queue.len() {
        let a = queue[head];
        head += 1;
        for &b in &children[a] {
            if generation[b] < generation[a] + 1 {
                generation[b] = generation[a] + 1;
            }
            indegree[b] -= 1;
            if indegree[b] == 0 {
                queue.push(b);
            }
        }
    }
    if queue.len() != count {
        return Err(bad("the decays form a cycle"));
    }
    let mut sorted: Vec<usize> = (0..count).collect();
    sorted.sort_by_key(|i| (generation[*i], *i));
    Ok((sorted, generation))
}

impl Chain {
    /// The network below `parents` (indices of the table). Branches with a fraction below `min_branch` are not
    /// followed; more than `max_members` members is an error.
    pub fn from_table(table: &Table, parents: &[usize], extra: &[Feeding], min_branch: f64, max_members: usize) -> SimResult<Chain> {
        // discovery (breadth first, deterministic): table index → position
        let mut seen: BTreeMap<usize, usize> = BTreeMap::new();
        let mut list: Vec<usize> = Vec::new();
        for &p in parents {
            if let std::collections::btree_map::Entry::Vacant(e) = seen.entry(p) {
                e.insert(list.len());
                list.push(p);
            }
        }
        let mut raw_edges: Vec<(usize, usize, &'static str, f64, f64)> = Vec::new();
        let mut raw_lost: Vec<(usize, &'static str, f64)> = Vec::new();
        let mut diagnostics = Vec::new();
        let mut head = 0;
        while head < list.len() {
            let i = list[head];
            let here = head;
            head += 1;
            let nuclide = &table.nuclides[i];
            if nuclide.stable() {
                continue;
            }
            if nuclide.half_life.is_nan() {
                diagnostics.push(diagnostic("nuclide.halfLifeUnknown", "unmodelled", json!({ "nuclide": nuclide.id() })));
                continue;
            }
            let br = table.branches(i, extra);
            if br.unknown || (br.list.is_empty() && !nuclide.decays.is_empty()) || nuclide.decays.is_empty() {
                raw_lost.push((here, "unknown", 1.0));
                diagnostics.push(diagnostic("nuclide.branchUnknown", "unmodelled", json!({ "nuclide": nuclide.id() })));
                continue;
            }
            let mut followed = 0.0;
            for b in &br.list {
                followed += b.fraction;
                match b.target {
                    Target::Fission => raw_lost.push((here, "fission", b.fraction)),
                    Target::Outside(..) => raw_lost.push((here, "outside", b.fraction)),
                    Target::Nuclide(_) if b.fraction < min_branch => raw_lost.push((here, "pruned", b.fraction)),
                    Target::Nuclide(j) => {
                        let pos = match seen.get(&j) {
                            Some(p) => *p,
                            None => {
                                if list.len() >= max_members {
                                    return Err(bad(format!("more than {max_members} nuclides; raise minBranch or maxNuclides")));
                                }
                                seen.insert(j, list.len());
                                list.push(j);
                                list.len() - 1
                            }
                        };
                        raw_edges.push((here, pos, b.mode, b.fraction, b.q));
                        if let Some(iso) = b.isomer_unknown {
                            diagnostics.push(diagnostic("nuclide.isomerFeeding", "approx", json!({ "nuclide": nuclide.id(), "mode": b.mode, "isomer": table.nuclides[iso].id(), "assumed": table.nuclides[j].id() })));
                        }
                    }
                }
            }
            if followed < 1.0 - 1e-9 {
                raw_lost.push((here, "deficit", 1.0 - followed));
                if followed < 1.0 - 1e-3 {
                    diagnostics.push(diagnostic("nuclide.branchSum", "approx", json!({ "nuclide": nuclide.id(), "sum": followed })));
                }
            }
        }
        let pairs: Vec<(usize, usize)> = raw_edges.iter().map(|e| (e.0, e.1)).collect();
        let (sorted, generation) = order(list.len(), &pairs)?;
        let mut position = vec![0usize; list.len()];
        for (new, &old) in sorted.iter().enumerate() {
            position[old] = new;
        }
        let members = sorted
            .iter()
            .map(|&old| {
                let n = &table.nuclides[list[old]];
                Member { id: n.id(), index: Some(list[old]), lambda: if n.half_life.is_nan() { 0.0 } else { n.lambda() }, half_life: n.half_life, generation: generation[old] }
            })
            .collect();
        let mut edges: Vec<Edge> = raw_edges.iter().map(|e| Edge { from: position[e.0], to: position[e.1], mode: e.2.to_string(), fraction: e.3, q: e.4 }).collect();
        edges.sort_by(|a, b| (a.from, a.to).cmp(&(b.from, b.to)));
        let mut lost: Vec<Lost> = raw_lost.iter().map(|l| Lost { from: position[l.0], reason: l.1, fraction: l.2 }).collect();
        lost.sort_by_key(|l| l.from);
        Ok(Chain { members, edges, lost, diagnostics })
    }

    /// A network given in the request: `{ nuclides: [{ id, halfLife? | lambda? }], decays: [{ from, to, fraction, mode? }] }`
    /// (half-life in seconds; absent, null or 0: stable).
    pub fn from_request(network: &Value) -> SimResult<Chain> {
        let rows = network.get("nuclides").and_then(|v| v.as_array()).ok_or_else(|| bad("network.nuclides missing"))?;
        if rows.is_empty() || rows.len() > 400 {
            return Err(bad("network.nuclides must hold 1 to 400 entries"));
        }
        let mut ids: Vec<String> = Vec::new();
        let mut lambda = Vec::new();
        let mut half = Vec::new();
        for r in rows {
            let id = r.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            if id.is_empty() || ids.contains(&id) {
                return Err(bad(format!("network: id '{id}' is empty or used twice")));
            }
            let l = match (r.get("lambda").filter(|v| !v.is_null()), r.get("halfLife").filter(|v| !v.is_null())) {
                (Some(l), _) => dnum(l),
                (None, Some(h)) => {
                    let h = dnum(h);
                    if h == 0.0 || h == f64::INFINITY {
                        0.0
                    } else {
                        LN2 / h
                    }
                }
                (None, None) => 0.0,
            };
            if !(l >= 0.0) || !l.is_finite() {
                return Err(bad(format!("network: decay constant of '{id}'")));
            }
            ids.push(id);
            lambda.push(l);
            half.push(if l > 0.0 { LN2 / l } else { f64::INFINITY });
        }
        let mut raw: Vec<(usize, usize, String, f64)> = Vec::new();
        let mut sums = vec![0.0; ids.len()];
        for d in network.get("decays").and_then(|v| v.as_array()).map(|a| a.as_slice()).unwrap_or(&[]) {
            let name = |k: &str| d.get(k).and_then(|v| v.as_str()).unwrap_or("");
            let from = ids.iter().position(|x| x == name("from")).ok_or_else(|| bad(format!("network: decay from unknown '{}'", name("from"))))?;
            let to = ids.iter().position(|x| x == name("to")).ok_or_else(|| bad(format!("network: decay to unknown '{}'", name("to"))))?;
            let fraction = d.get("fraction").filter(|v| !v.is_null()).map(dnum).unwrap_or(1.0);
            if !(fraction >= 0.0) || !fraction.is_finite() || from == to {
                return Err(bad(format!("network: decay {} → {}", name("from"), name("to"))));
            }
            if lambda[from] == 0.0 {
                return Err(bad(format!("network: '{}' is stable and cannot decay", name("from"))));
            }
            sums[from] += fraction;
            raw.push((from, to, name("mode").to_string(), fraction));
        }
        // rounded fractions of a published data set may exceed 1 by parts per million; they are used as given
        if let Some(i) = sums.iter().position(|s| *s > 1.0 + 1e-4) {
            return Err(bad(format!("network: the fractions of '{}' add up to more than 1", ids[i])));
        }
        let pairs: Vec<(usize, usize)> = raw.iter().map(|e| (e.0, e.1)).collect();
        let (sorted, generation) = order(ids.len(), &pairs)?;
        let mut position = vec![0usize; ids.len()];
        for (new, &old) in sorted.iter().enumerate() {
            position[old] = new;
        }
        let members = sorted.iter().map(|&old| Member { id: ids[old].clone(), index: None, lambda: lambda[old], half_life: half[old], generation: generation[old] }).collect();
        let mut edges: Vec<Edge> = raw.iter().map(|e| Edge { from: position[e.0], to: position[e.1], mode: e.2.clone(), fraction: e.3, q: f64::NAN }).collect();
        edges.sort_by(|a, b| (a.from, a.to).cmp(&(b.from, b.to)));
        let mut lost = Vec::new();
        for (old, s) in sums.iter().enumerate() {
            if lambda[old] > 0.0 && *s < 1.0 - 1e-9 {
                lost.push(Lost { from: position[old], reason: "deficit", fraction: 1.0 - s });
            }
        }
        lost.sort_by_key(|l: &Lost| l.from);
        Ok(Chain { members, edges, lost, diagnostics: Vec::new() })
    }

    /// The Bateman network: the members and, as the last member, the untracked part.
    pub fn network(&self) -> Network {
        let n = self.members.len();
        let mut lambda: Vec<f64> = self.members.iter().map(|m| m.lambda).collect();
        lambda.push(0.0);
        let mut feed: Vec<BTreeMap<usize, f64>> = vec![BTreeMap::new(); n + 1];
        for e in &self.edges {
            *feed[e.to].entry(e.from).or_insert(0.0) += e.fraction * self.members[e.from].lambda;
        }
        for l in &self.lost {
            *feed[n].entry(l.from).or_insert(0.0) += l.fraction * self.members[l.from].lambda;
        }
        Network { lambda, feed: feed.into_iter().map(|m| m.into_iter().filter(|x| x.1 > 0.0).collect()).collect() }
    }
}
