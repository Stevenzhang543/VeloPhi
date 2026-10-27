//! Formula cards (port of src/formula/match.ts): for a moment t, the situations active at t, every formula of each
//! evaluated with the situation's variables and compared with the simulated measurement.
//!   exact formulas    relative error ≤ 1e-6 (energy ledger 1e-8), or absolute ≤ 1e-9 × max(1, |theory|) → match,
//!                     otherwise deviate
//!   approximations    graded by their approximation condition: approx-ok / approx / approx-invalid
//!   conditions fail   → not-applicable;  no measurement → no-measure
//!
//! The formula library (titles, LaTeX, derivations) lives in the interface; the fields that take part in the
//! calculation are handed over once (`set_library`).

use std::cell::RefCell;
use std::rc::Rc;

use serde_json::{json, Map, Value};

use super::{condition_json, CondStatus, Condition, Sample, Situation};
use crate::expr::{evaluate, evaluate_trace, parse_formula, Node};
use crate::js::js_max;
use crate::message::{t_join, t_paren, Message, Text};
use crate::t;
use crate::transport::jnum;

/// Limits of 'match'.
pub const EXACT_REL: f64 = 1e-6;
pub const EXACT_ABS: f64 = 1e-9;
pub const ENERGY_REL: f64 = 1e-8;

/// The calculation fields of a library formula.
#[derive(Clone, Debug)]
pub struct FormulaDef {
    pub id: String,
    pub situation: String,
    pub expr: String,
    pub unit: String,
    pub measure: String,
    /// 'exact' or 'approx'.
    pub approx: bool,
    pub requires: Vec<String>,
    pub approx_of: Option<String>,
    /// Possible causes of a deviation (Chinese source texts).
    pub causes: Option<Vec<&'static str>>,
    pub node: Result<Node, Message>,
}

thread_local! {
    static LIBRARY: RefCell<Rc<Vec<FormulaDef>>> = RefCell::new(Rc::new(Vec::new()));
}

/// Install the library from its JSON form: [{ id, situation, expr, unit, measure, kind, requires?, approxOf?, causes? }].
pub fn set_library(v: &Value) -> usize {
    let list: Vec<FormulaDef> = v
        .as_array()
        .map(|a| {
            a.iter()
                .map(|f| {
                    let s = |k: &str| f.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string();
                    let expr = s("expr");
                    FormulaDef {
                        id: s("id"),
                        situation: s("situation"),
                        unit: s("unit"),
                        measure: s("measure"),
                        approx: f.get("kind").and_then(|x| x.as_str()) == Some("approx"),
                        requires: f.get("requires").and_then(|x| x.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default(),
                        approx_of: f.get("approxOf").and_then(|x| x.as_str()).map(String::from),
                        // Texts of the library are interface keys; they live as long as the program
                        causes: f.get("causes").and_then(|x| x.as_array()).map(|a| a.iter().filter_map(|x| x.as_str()).map(|x| &*Box::leak(x.to_string().into_boxed_str())).collect()),
                        node: parse_formula(&expr),
                        expr,
                    }
                })
                .collect()
        })
        .unwrap_or_default();
    let n = list.len();
    LIBRARY.with(|l| *l.borrow_mut() = Rc::new(list));
    n
}

/// The installed library.
pub fn library() -> Rc<Vec<FormulaDef>> {
    LIBRARY.with(|l| l.borrow().clone())
}

/// Grade of a card.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Verdict {
    Match,
    Deviate,
    ApproxOk,
    Approx,
    ApproxInvalid,
    NotApplicable,
    NoMeasure,
}

impl Verdict {
    pub fn name(self) -> &'static str {
        match self {
            Verdict::Match => "match",
            Verdict::Deviate => "deviate",
            Verdict::ApproxOk => "approx-ok",
            Verdict::Approx => "approx",
            Verdict::ApproxInvalid => "approx-invalid",
            Verdict::NotApplicable => "not-applicable",
            Verdict::NoMeasure => "no-measure",
        }
    }
}

/// A formula evaluated for a situation and compared with the simulation.
#[derive(Clone, Debug)]
pub struct Card {
    pub key: String,
    pub formula: String,
    pub situation: String,
    pub verdict: Verdict,
    pub conditions: Vec<Condition>,
    pub theory: Option<f64>,
    pub sim: Option<f64>,
    pub abs_error: Option<f64>,
    pub rel_error: Option<f64>,
    pub reason: Text,
    pub measure_label: Text,
    pub measure_note: Option<Text>,
    /// Value of every node of the expression in pre-order (for the step-by-step solution); empty when not evaluated.
    pub trace: Vec<f64>,
}

impl Card {
    pub fn to_json(&self, with_trace: bool) -> Value {
        let o = |v: Option<f64>| v.map(jnum).unwrap_or(Value::Null);
        let mut m = Map::new();
        m.insert("key".into(), json!(self.key));
        m.insert("formula".into(), json!(self.formula));
        m.insert("situation".into(), json!(self.situation));
        m.insert("verdict".into(), json!(self.verdict.name()));
        m.insert("conditions".into(), Value::Array(self.conditions.iter().map(condition_json).collect()));
        m.insert("theory".into(), o(self.theory));
        m.insert("sim".into(), o(self.sim));
        m.insert("absError".into(), o(self.abs_error));
        m.insert("relError".into(), o(self.rel_error));
        m.insert("reason".into(), self.reason.to_json());
        m.insert("measureLabel".into(), self.measure_label.to_json());
        if let Some(n) = &self.measure_note {
            m.insert("measureNote".into(), n.to_json());
        }
        if with_trace {
            m.insert("trace".into(), Value::Array(self.trace.iter().map(|v| jnum(*v)).collect()));
        }
        Value::Object(m)
    }
}

fn cat(a: Text, b: Text) -> Text {
    if b.is_empty() {
        return a;
    }
    if a.is_empty() {
        return b;
    }
    t_join(vec![a, b], "none")
}

/// Evaluate one formula for a situation sample and grade it (evaluateCard).
pub fn evaluate_card(f: &FormulaDef, sit: &Situation, sample: &Sample, with_trace: bool) -> Card {
    let conds = &sample.conditions;
    let required: Vec<Condition> = f
        .requires
        .iter()
        .map(|id| match conds.iter().find(|c| &c.id == id) {
            Some(c) => c.clone(),
            None => Condition { id: id.clone(), label: Text::Lit(id.clone()), status: CondStatus::Fail, detail: t!("情形未提供该条件") },
        })
        .collect();
    let approx = f.approx_of.as_ref().and_then(|id| conds.iter().find(|c| &c.id == id)).cloned();
    let lookup = |name: &str| sample.var(name).map(|v| v.value);
    let measure = sample.measure(&f.measure);
    let mut theory: Option<f64> = None;
    let mut reason = Text::empty();
    let mut trace = Vec::new();
    match &f.node {
        Err(e) => reason = Text::Msg(e.clone()),
        Ok(node) => {
            let res = if with_trace { evaluate_trace(node, &lookup).map(|tr| (tr[0], tr)) } else { evaluate(node, &lookup).map(|v| (v, Vec::new())) };
            match res {
                Ok((v, tr)) => {
                    theory = Some(v);
                    trace = tr;
                }
                Err(e) => reason = Text::Msg(e),
            }
        }
    }
    let sim = measure.and_then(|m| m.value).filter(|v| v.is_finite());
    let (mut abs_error, mut rel_error) = (None, None);
    if let (Some(th), Some(sv)) = (theory, sim) {
        let a = sv - th;
        abs_error = Some(a);
        let scale = js_max(th.abs(), sv.abs());
        rel_error = Some(if scale > 0.0 { a.abs() / scale } else { 0.0 });
    }
    let failed: Vec<&Condition> = required.iter().filter(|c| c.status == CondStatus::Fail).collect();
    let verdict;
    if !failed.is_empty() {
        verdict = Verdict::NotApplicable;
        let items: Vec<Text> = failed.iter().map(|c| if c.detail.is_empty() { c.label.clone() } else { t_join(vec![c.label.clone(), t_paren(c.detail.clone())], "none") }).collect();
        reason = t!("条件不满足：{0}", t_join(items, "semi"));
    } else if theory.is_none() {
        verdict = Verdict::NotApplicable;
    } else if !theory.is_some_and(|v| v.is_finite()) {
        // 0/0 at the start of a phase (v = s/t at t = 0) and similar: no value to compare
        verdict = Verdict::NotApplicable;
        reason = t!("此刻理论值无定义（如除以零），请在其他时刻查看");
    } else if sim.is_none() {
        verdict = Verdict::NoMeasure;
        reason = measure.and_then(|m| m.note.clone()).unwrap_or_else(|| t!("仿真中没有可比较的测量值"));
    } else if f.approx {
        let st = approx.as_ref().map(|c| c.status).unwrap_or(CondStatus::Ok);
        verdict = match st {
            CondStatus::Ok => Verdict::ApproxOk,
            CondStatus::Approx => Verdict::Approx,
            CondStatus::Fail => Verdict::ApproxInvalid,
        };
        reason = match &approx {
            Some(c) => t_join(vec![c.label.clone(), c.detail.clone()], "colon"),
            None => Text::empty(),
        };
    } else {
        let rel = if f.situation == "energy" { ENERGY_REL } else { EXACT_REL };
        let th = theory.unwrap_or(f64::NAN);
        let ok = rel_error.unwrap_or(1.0) <= rel || abs_error.unwrap_or(1.0).abs() <= EXACT_ABS * js_max(1.0, th.abs());
        verdict = if ok { Verdict::Match } else { Verdict::Deviate };
        if !ok {
            let causes: Vec<Text> = match &f.causes {
                Some(c) => c.iter().map(|k| Text::Msg(Message::new(k))).collect(),
                None => vec![t!("数值积分误差"), t!("模型假设与场景不符（请检查条件）")],
            };
            reason = t!("偏差超过阈值（相对 {0}）。可能原因：{1}", rel, t_join(causes, "semi"));
        }
    }
    if required.iter().any(|c| c.status == CondStatus::Approx) && verdict == Verdict::Match {
        reason = cat(reason, t!("（条件近似成立）"));
    }
    let mut conditions = Vec::new();
    if let Some(a) = approx {
        conditions.push(a);
    }
    conditions.extend(required);
    Card {
        key: format!("{}/{}", sit.key, f.id),
        formula: f.id.clone(),
        situation: sit.key.clone(),
        verdict,
        conditions,
        theory,
        sim,
        abs_error,
        rel_error,
        reason,
        measure_label: measure.map(|m| m.label.clone()).unwrap_or_else(|| Text::Lit(f.measure.clone())),
        measure_note: measure.and_then(|m| m.note.clone()),
        trace,
    }
}

/// Situations active at t: from their event time (if any, else t0) to t1.
pub fn active_situations(sits: &[Situation], t: f64) -> Vec<usize> {
    sits.iter()
        .enumerate()
        .filter(|(_, s)| match s.t_event {
            Some(te) => t >= te - 1e-12 && t <= s.t1 + 1e-12,
            None => t >= s.t0 - 1e-12 && t <= s.t1 + 1e-12,
        })
        .map(|(i, _)| i)
        .collect()
}
