//! The model registry calculator (26.56, D106): restricted analytic models of the 180 model families.
//!
//! The registry is data written in the interface (`src/content/models`), handed over once with `setModels` like
//! the formula library: every model has typed inputs (SI units, optional domain bounds), intermediate quantities
//! (`lets`), conditions and outputs, all expressions of the formula language (expr.rs), dimension-checked against
//! the seven SI base dimensions when the registry is installed. The interface never computes a model answer; it
//! shows what this module returns.
//!
//! Conditions have four states (FOR04): applicable, notApplicable, insufficient (a needed value is missing or
//! cannot be evaluated) and approximate (the strict condition fails but the looser one holds). An output may
//! require conditions (its value is then withheld when one does not apply), may be one branch of several outputs
//! with the same id (`when`: the first branch whose condition holds is taken and named), or may be the roots of an
//! equation in a range (`solve`: no solution, one or several, filtered by `accept`). Non-finite results are never
//! returned as numbers: their state says why.
//!
//! Physical constants are variables named by their ids (`constants.rs`), taken from the requested set
//! (CODATA 2022 by default); the result lists the constants an evaluation used with their set.

use std::cell::RefCell;
use std::rc::Rc;

use serde_json::{json, Map, Value};

use crate::constants;
use crate::expr::{dim_equal, evaluate, evaluate_trace, format_dim, parse_formula, unit_dim, variables, Dim, Node, DIMLESS};
use crate::message::Message;
use crate::transport::{dnum, jnum};

/// State of a condition or an output.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum State {
    Applicable,
    NotApplicable,
    Insufficient,
    Approximate,
}

impl State {
    pub fn name(self) -> &'static str {
        match self {
            State::Applicable => "applicable",
            State::NotApplicable => "notApplicable",
            State::Insufficient => "insufficient",
            State::Approximate => "approximate",
        }
    }
    /// The state of something that needs both.
    fn and(self, o: State) -> State {
        use State::*;
        match (self, o) {
            (NotApplicable, _) | (_, NotApplicable) => NotApplicable,
            (Insufficient, _) | (_, Insufficient) => Insufficient,
            (Approximate, _) | (_, Approximate) => Approximate,
            _ => Applicable,
        }
    }
}

#[derive(Clone, Debug)]
struct Input {
    id: String,
    unit: String,
    min: Option<f64>,
    max: Option<f64>,
    /// The bounds exclude their value (a positive length: min 0, open).
    open: bool,
}

#[derive(Clone, Debug)]
struct Let {
    id: String,
    unit: String,
    node: Node,
}

#[derive(Clone, Debug)]
struct Cond {
    id: String,
    /// Strict condition (applicable when it holds).
    node: Node,
    /// Looser condition: approximately applicable when only this holds.
    approx: Option<Node>,
}

#[derive(Clone, Debug)]
struct Solve {
    var: String,
    f: Node,
    lo: Node,
    hi: Node,
    accept: Option<Node>,
    samples: usize,
}

#[derive(Clone, Debug)]
struct Output {
    id: String,
    unit: String,
    node: Option<Node>,
    requires: Vec<String>,
    when: Option<String>,
    branch: Option<String>,
    solve: Option<Solve>,
}

#[derive(Clone, Debug)]
pub struct ModelDef {
    id: String,
    inputs: Vec<Input>,
    lets: Vec<Let>,
    conds: Vec<Cond>,
    outputs: Vec<Output>,
}

thread_local! {
    static REGISTRY: RefCell<Rc<Vec<ModelDef>>> = RefCell::new(Rc::new(Vec::new()));
}

fn s_of(v: &Value, k: &str) -> String {
    v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string()
}

fn opt_num(v: &Value, k: &str) -> Option<f64> {
    v.get(k).filter(|x| !x.is_null()).map(dnum)
}

fn strs(v: &Value, k: &str) -> Vec<String> {
    v.get(k).and_then(|x| x.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default()
}

/// A registry problem found while installing (shown by the registry test, never at run time).
fn problem(model: &str, what: &str, detail: String) -> Value {
    json!({ "model": model, "what": what, "detail": detail })
}

fn parse_expr(model: &str, what: &str, src: &str, problems: &mut Vec<Value>) -> Option<Node> {
    match parse_formula(src) {
        Ok(n) => Some(n),
        Err(e) => {
            problems.push(problem(model, what, format!("{} ({src})", e.key)));
            None
        }
    }
}

/// A condition in the formula language: comparisons may stand alone and be joined by `&&` and `||` (`&&` binds
/// tighter; no parentheses around them), e.g. `h0 >= 0 && v0 > 0`. Each comparison becomes `if(c, 1, 0)`, `&&` the
/// minimum and `||` the maximum, so the result is 1 (holds) or 0.
pub fn condition_source(src: &str) -> String {
    fn split_top(s: &str, sep: &str) -> Vec<String> {
        let mut out = Vec::new();
        let mut depth = 0i32;
        let mut cur = String::new();
        let b: Vec<char> = s.chars().collect();
        let sepc: Vec<char> = sep.chars().collect();
        let mut i = 0;
        while i < b.len() {
            let c = b[i];
            if c == '(' {
                depth += 1;
            } else if c == ')' {
                depth -= 1;
            }
            if depth == 0 && b[i..].starts_with(&sepc) {
                out.push(cur.trim().to_string());
                cur.clear();
                i += sepc.len();
                continue;
            }
            cur.push(c);
            i += 1;
        }
        out.push(cur.trim().to_string());
        out
    }
    let has_cmp = |t: &str| {
        let mut depth = 0i32;
        for c in t.chars() {
            match c {
                '(' => depth += 1,
                ')' => depth -= 1,
                '<' | '>' if depth == 0 => return true,
                _ => {}
            }
        }
        false
    };
    let ors: Vec<String> = split_top(src, "||")
        .into_iter()
        .map(|o| {
            let ands: Vec<String> = split_top(&o, "&&").into_iter().map(|a| if has_cmp(&a) { format!("if({a}, 1, 0)") } else { a }).collect();
            ands.into_iter().reduce(|x, y| format!("min({x}, {y})")).unwrap_or_default()
        })
        .collect();
    ors.into_iter().reduce(|x, y| format!("max({x}, {y})")).unwrap_or_default()
}

/// Dimensions of the names visible to a model's expressions.
struct Scope {
    names: Vec<(String, Dim)>,
}

impl Scope {
    fn dim(&self, name: &str) -> Option<Dim> {
        self.names.iter().rev().find(|(n, _)| n == name).map(|(_, d)| *d)
    }
}

/// Dimension of a registry expression. Like `expr::dimension`, except that the number 0 fits any dimension
/// (`t - dt >= 0`, `if(x > 0, v, 0)`): the result is (dimension, is a free zero).
fn reg_dimension(node: &Node, scope: &Scope) -> Result<(Dim, bool), Message> {
    fn go(node: &Node, scope: &Scope) -> Result<(Dim, bool), Message> {
        use crate::expr::BinOp;
        let same = |a: (Dim, bool), b: (Dim, bool), what: &str| -> Result<(Dim, bool), Message> {
            if a.1 {
                return Ok(b);
            }
            if b.1 || dim_equal(&a.0, &b.0) {
                return Ok(a);
            }
            Err(Message::new("model.dimMismatch").text("what", what.to_string()).text("a", format_dim(&a.0)).text("b", format_dim(&b.0)))
        };
        Ok(match node {
            Node::Num(v) => (DIMLESS, *v == 0.0),
            Node::Var(n) => (scope.dim(n).ok_or_else(|| Message::new("model.unknownName").text("name", n.clone()))?, false),
            Node::Neg(a) => go(a, scope)?,
            Node::Cmp(_, l, r) => {
                same(go(l, scope)?, go(r, scope)?, "compare")?;
                (DIMLESS, false)
            }
            Node::Bin(op, l, r) => {
                let a = go(l, scope)?;
                if *op == BinOp::Pow {
                    let p = match r.as_ref() {
                        Node::Num(v) => Some(*v),
                        Node::Neg(x) => match x.as_ref() {
                            Node::Num(v) => Some(-*v),
                            _ => None,
                        },
                        _ => None,
                    };
                    return match p {
                        Some(p) => Ok((crate::expr::dim_pow(&a.0, p), a.1)),
                        None => {
                            let b = go(r, scope)?;
                            if !b.1 && !dim_equal(&b.0, &DIMLESS) {
                                return Err(Message::new("model.dimensionedExponent"));
                            }
                            if !a.1 && !dim_equal(&a.0, &DIMLESS) {
                                return Err(Message::new("model.dimensionedPower"));
                            }
                            Ok((DIMLESS, false))
                        }
                    };
                }
                let b = go(r, scope)?;
                match op {
                    BinOp::Add | BinOp::Sub => same(a, b, "+")?,
                    BinOp::Mul => (crate::expr::dim_mul(&a.0, &b.0), a.1 || b.1),
                    _ => (crate::expr::dim_mul(&a.0, &crate::expr::dim_pow(&b.0, -1.0)), a.1),
                }
            }
            Node::Call(f, args) => {
                let mut d = Vec::with_capacity(args.len());
                for a in args {
                    d.push(go(a, scope)?);
                }
                match f.as_str() {
                    "if" => same(d[1], d[2], "if")?,
                    "sqrt" => (crate::expr::dim_pow(&d[0].0, 0.5), d[0].1),
                    "cbrt" => (crate::expr::dim_pow(&d[0].0, 1.0 / 3.0), d[0].1),
                    "abs" => d[0],
                    "sign" | "step" => (DIMLESS, false),
                    "min" | "max" => same(d[0], d[1], f)?,
                    "clamp" => same(same(d[0], d[1], f)?, d[2], f)?,
                    "atan2" => {
                        same(d[0], d[1], f)?;
                        (DIMLESS, false)
                    }
                    _ => {
                        for x in &d {
                            if !x.1 && !dim_equal(&x.0, &DIMLESS) {
                                return Err(Message::new("model.argumentNotDimensionless").text("function", f.clone()).text("dim", format_dim(&x.0)));
                            }
                        }
                        (DIMLESS, false)
                    }
                }
            }
        })
    }
    go(node, scope)
}

fn check_dim(model: &str, what: &str, node: &Node, unit: Option<&str>, scope: &Scope, problems: &mut Vec<Value>) {
    match reg_dimension(node, scope).map(|(d, free)| if free { unit.and_then(unit_dim).unwrap_or(d) } else { d }) {
        Err(e) => problems.push(problem(model, what, format!("{} {}", e.key, e.params.iter().map(|(k, v)| format!("{k}={v:?}")).collect::<Vec<_>>().join(" ")))),
        Ok(d) => {
            if let Some(u) = unit {
                match unit_dim(u) {
                    None => problems.push(problem(model, what, format!("unknown unit {u}"))),
                    Some(ud) => {
                        if !dim_equal(&ud, &d) {
                            problems.push(problem(model, what, format!("dimension {} ≠ unit {u} ({})", format_dim(&d), format_dim(&ud))));
                        }
                    }
                }
            } else if !dim_equal(&d, &DIMLESS) {
                problems.push(problem(model, what, format!("condition of dimension {}", format_dim(&d))));
            }
        }
    }
}

/// Install the registry: `[{ id, inputs [{id, unit, min?, max?, open?}], lets [{id, expr, unit}], conditions [{id,
/// expr, approx?}], outputs [{id, unit, expr?, requires?, when?, branch?, solve? {var, f, lo, hi, accept?,
/// samples?}}] }]`. Returns the number of models and the problems found (parse errors, unknown units, dimension
/// mismatches, unknown names).
pub fn set_models(v: &Value) -> Value {
    let mut problems: Vec<Value> = Vec::new();
    let consts = constants::all(constants::DEFAULT);
    let mut list = Vec::new();
    for m in v.as_array().map(|a| a.as_slice()).unwrap_or(&[]) {
        let id = s_of(m, "id");
        let mut scope = Scope { names: consts.iter().map(|k| (k.id.to_string(), unit_dim(k.unit).unwrap_or(DIMLESS))).collect() };
        let mut inputs = Vec::new();
        for i in m.get("inputs").and_then(|x| x.as_array()).map(|a| a.as_slice()).unwrap_or(&[]) {
            let inp = Input { id: s_of(i, "id"), unit: s_of(i, "unit"), min: opt_num(i, "min"), max: opt_num(i, "max"), open: i.get("open").and_then(|x| x.as_bool()).unwrap_or(false) };
            match unit_dim(&inp.unit) {
                Some(d) => scope.names.push((inp.id.clone(), d)),
                None => problems.push(problem(&id, &format!("input {}", inp.id), format!("unknown unit {}", inp.unit))),
            }
            inputs.push(inp);
        }
        let mut lets = Vec::new();
        for l in m.get("lets").and_then(|x| x.as_array()).map(|a| a.as_slice()).unwrap_or(&[]) {
            let lid = s_of(l, "id");
            let unit = s_of(l, "unit");
            if let Some(node) = parse_expr(&id, &format!("let {lid}"), &s_of(l, "expr"), &mut problems) {
                check_dim(&id, &format!("let {lid}"), &node, Some(&unit), &scope, &mut problems);
                scope.names.push((lid.clone(), unit_dim(&unit).unwrap_or(DIMLESS)));
                lets.push(Let { id: lid, unit, node });
            }
        }
        let mut conds = Vec::new();
        for c in m.get("conditions").and_then(|x| x.as_array()).map(|a| a.as_slice()).unwrap_or(&[]) {
            let cid = s_of(c, "id");
            let node = parse_expr(&id, &format!("condition {cid}"), &condition_source(&s_of(c, "expr")), &mut problems);
            let approx = c.get("approx").and_then(|x| x.as_str()).and_then(|src| parse_expr(&id, &format!("condition {cid} approx"), &condition_source(src), &mut problems));
            if let Some(n) = &node {
                check_dim(&id, &format!("condition {cid}"), n, None, &scope, &mut problems);
            }
            if let Some(n) = &approx {
                check_dim(&id, &format!("condition {cid} approx"), n, None, &scope, &mut problems);
            }
            if let Some(node) = node {
                conds.push(Cond { id: cid, node, approx });
            }
        }
        let mut outputs = Vec::new();
        for o in m.get("outputs").and_then(|x| x.as_array()).map(|a| a.as_slice()).unwrap_or(&[]) {
            let oid = s_of(o, "id");
            let unit = s_of(o, "unit");
            let requires = strs(o, "requires");
            let when = o.get("when").and_then(|x| x.as_str()).map(String::from);
            for r in requires.iter().chain(when.iter()) {
                if !conds.iter().any(|c| &c.id == r) {
                    problems.push(problem(&id, &format!("output {oid}"), format!("unknown condition {r}")));
                }
            }
            let node = o.get("expr").and_then(|x| x.as_str()).and_then(|src| parse_expr(&id, &format!("output {oid}"), src, &mut problems));
            if let Some(n) = &node {
                check_dim(&id, &format!("output {oid}"), n, Some(&unit), &scope, &mut problems);
            }
            let solve = o.get("solve").and_then(|sv| {
                let var = s_of(sv, "var");
                let mut sc = Scope { names: scope.names.clone() };
                sc.names.push((var.clone(), unit_dim(&unit).unwrap_or(DIMLESS)));
                let f = parse_expr(&id, &format!("output {oid} f"), &s_of(sv, "f"), &mut problems)?;
                let lo = parse_expr(&id, &format!("output {oid} lo"), &s_of(sv, "lo"), &mut problems)?;
                let hi = parse_expr(&id, &format!("output {oid} hi"), &s_of(sv, "hi"), &mut problems)?;
                let accept = sv.get("accept").and_then(|x| x.as_str()).and_then(|src| parse_expr(&id, &format!("output {oid} accept"), &condition_source(src), &mut problems));
                if let Err(e) = reg_dimension(&f, &sc) {
                    problems.push(problem(&id, &format!("output {oid} f"), e.key.to_string()));
                }
                check_dim(&id, &format!("output {oid} lo"), &lo, Some(&unit), &scope, &mut problems);
                check_dim(&id, &format!("output {oid} hi"), &hi, Some(&unit), &scope, &mut problems);
                if let Some(a) = &accept {
                    check_dim(&id, &format!("output {oid} accept"), a, None, &sc, &mut problems);
                }
                Some(Solve { var, f, lo, hi, accept, samples: sv.get("samples").and_then(|x| x.as_u64()).unwrap_or(400) as usize })
            });
            if node.is_none() && solve.is_none() {
                problems.push(problem(&id, &format!("output {oid}"), "no expression".into()));
            }
            outputs.push(Output { id: oid, unit, node, requires, when, branch: o.get("branch").and_then(|x| x.as_str()).map(String::from), solve });
        }
        list.push(ModelDef { id, inputs, lets, conds, outputs });
    }
    let n = list.len();
    REGISTRY.with(|r| *r.borrow_mut() = Rc::new(list));
    json!({ "models": n, "problems": problems })
}

fn registry() -> Rc<Vec<ModelDef>> {
    REGISTRY.with(|r| r.borrow().clone())
}

/// Values known to an evaluation: inputs, then lets, then constants of the set.
struct Env {
    vals: Vec<(String, f64)>,
    consts: Vec<constants::Constant>,
    used: RefCell<Vec<String>>,
}

impl Env {
    fn get(&self, name: &str) -> Option<f64> {
        if let Some((_, v)) = self.vals.iter().rev().find(|(n, _)| n == name) {
            return Some(*v);
        }
        let k = self.consts.iter().find(|k| k.id == name)?;
        let mut u = self.used.borrow_mut();
        if !u.iter().any(|x| x == name) {
            u.push(name.to_string());
        }
        Some(k.value)
    }
}

/// Evaluate a condition: (state, missing variable).
fn eval_cond(c: &Cond, env: &Env) -> (State, Option<String>) {
    let look = |n: &str| env.get(n);
    let truth = |n: &Node| -> Result<bool, Option<String>> {
        match evaluate(n, &look) {
            Ok(v) if v.is_nan() => Err(None),
            Ok(v) => Ok(v != 0.0),
            Err(e) => Err(e.params.iter().find(|(k, _)| *k == "name").map(|(_, v)| match v {
                crate::message::Param::Str(s) => s.clone(),
                other => format!("{other:?}"),
            })),
        }
    };
    match truth(&c.node) {
        Err(missing) => (State::Insufficient, missing),
        Ok(true) => (State::Applicable, None),
        Ok(false) => match &c.approx {
            None => (State::NotApplicable, None),
            Some(a) => match truth(a) {
                Err(missing) => (State::Insufficient, missing),
                Ok(true) => (State::Approximate, None),
                Ok(false) => (State::NotApplicable, None),
            },
        },
    }
}

fn missing_of(e: &Message) -> Option<String> {
    e.params.iter().find(|(k, _)| *k == "name").map(|(_, v)| match v {
        crate::message::Param::Str(s) => s.clone(),
        other => format!("{other:?}"),
    })
}

/// Roots of f(var) = 0 for var in [lo, hi]: sign changes on a grid refined by bisection, plus exact zeros.
fn roots(s: &Solve, env: &Env) -> Result<Vec<f64>, Message> {
    let look = |n: &str| env.get(n);
    let lo = evaluate(&s.lo, &look)?;
    let hi = evaluate(&s.hi, &look)?;
    if !(lo.is_finite() && hi.is_finite() && hi > lo) {
        return Ok(Vec::new());
    }
    let f = |x: f64| -> f64 {
        let look2 = |n: &str| if n == s.var { Some(x) } else { env.get(n) };
        evaluate(&s.f, &look2).unwrap_or(f64::NAN)
    };
    let n = s.samples.max(8);
    let mut out: Vec<f64> = Vec::new();
    let mut xa = lo;
    let mut fa = f(xa);
    for k in 1..=n {
        let xb = lo + (hi - lo) * (k as f64) / (n as f64);
        let fb = f(xb);
        if fa == 0.0 {
            out.push(xa);
        } else if fa.is_finite() && fb.is_finite() && fb != 0.0 && (fa < 0.0) != (fb < 0.0) {
            let (mut a, mut b, mut fa2) = (xa, xb, fa);
            for _ in 0..200 {
                let m = 0.5 * (a + b);
                if m <= a || m >= b {
                    break;
                }
                let fm = f(m);
                if fm == 0.0 {
                    a = m;
                    b = m;
                    break;
                }
                if (fm < 0.0) == (fa2 < 0.0) {
                    a = m;
                    fa2 = fm;
                } else {
                    b = m;
                }
            }
            out.push(0.5 * (a + b));
        }
        if k == n && fb == 0.0 {
            out.push(xb);
        }
        xa = xb;
        fa = fb;
    }
    out.dedup_by(|a, b| (*a - *b).abs() <= 1e-12 * a.abs().max(b.abs()).max(1e-300));
    Ok(out)
}

/// Result of one model evaluation.
pub struct Evaluation {
    pub json: Value,
}

fn state_json(st: State) -> Value {
    json!(st.name())
}

/// Evaluate a model for given inputs (SI). Missing inputs make the conditions and outputs that need them
/// 'insufficient'; inputs outside their domain are reported and make every output not applicable.
pub fn evaluate_model(id: &str, inputs: &Map<String, Value>, set: &str, with_trace: bool) -> Result<Value, Message> {
    let reg = registry();
    let Some(m) = reg.iter().find(|m| m.id == id) else {
        return Err(Message::new("model.unknown").text("model", id));
    };
    let consts = constants::all(set);
    let mut env = Env { vals: Vec::new(), consts, used: RefCell::new(Vec::new()) };
    // inputs and their domains
    let mut domain = Vec::new();
    let mut domain_ok = true;
    for i in &m.inputs {
        let Some(v) = inputs.get(&i.id).filter(|x| !x.is_null()) else { continue };
        let x = dnum(v);
        let mut st = if x.is_finite() { State::Applicable } else { State::NotApplicable };
        if let Some(lo) = i.min {
            if x < lo || (i.open && x == lo) {
                st = State::NotApplicable;
            }
        }
        if let Some(hi) = i.max {
            if x > hi || (i.open && x == hi) {
                st = State::NotApplicable;
            }
        }
        if st != State::Applicable {
            domain_ok = false;
            domain.push(json!({ "input": i.id, "value": jnum(x), "min": i.min.map(jnum), "max": i.max.map(jnum), "open": i.open }));
        }
        env.vals.push((i.id.clone(), x));
    }
    // intermediate quantities (a missing value leaves the let unset)
    let mut lets = Vec::new();
    for l in &m.lets {
        let look = |n: &str| env.get(n);
        match evaluate(&l.node, &look) {
            Ok(v) => {
                lets.push(json!({ "id": l.id, "value": jnum(v), "unit": l.unit }));
                if v.is_finite() {
                    env.vals.push((l.id.clone(), v));
                }
            }
            Err(e) => lets.push(json!({ "id": l.id, "value": Value::Null, "unit": l.unit, "missing": missing_of(&e) })),
        }
    }
    // conditions
    let mut cstates: Vec<(String, State)> = Vec::new();
    let mut conds = Vec::new();
    for c in &m.conds {
        let (st, missing) = eval_cond(c, &env);
        cstates.push((c.id.clone(), st));
        let mut o = Map::new();
        o.insert("id".into(), json!(c.id));
        o.insert("state".into(), state_json(st));
        if let Some(mv) = missing {
            o.insert("missing".into(), json!(mv));
        }
        conds.push(Value::Object(o));
    }
    let cstate = |id: &str| cstates.iter().find(|(c, _)| c == id).map(|(_, s)| *s).unwrap_or(State::Insufficient);
    // outputs: one entry per id; branches by `when`
    let mut ids: Vec<&str> = Vec::new();
    for o in &m.outputs {
        if !ids.contains(&o.id.as_str()) {
            ids.push(&o.id);
        }
    }
    let mut outs = Vec::new();
    for oid in ids {
        let cands: Vec<&Output> = m.outputs.iter().filter(|o| o.id == oid).collect();
        // choose the branch: the first whose `when` holds (approximately counts); else report why none applies
        let mut chosen: Option<(&Output, State)> = None;
        let mut branch_state = State::NotApplicable;
        for o in &cands {
            match &o.when {
                None => {
                    chosen = Some((o, State::Applicable));
                    break;
                }
                Some(w) => {
                    let st = cstate(w);
                    if st == State::Applicable || st == State::Approximate {
                        chosen = Some((o, st));
                        break;
                    }
                    if st == State::Insufficient {
                        branch_state = State::Insufficient;
                    }
                }
            }
        }
        let unit = cands[0].unit.clone();
        let mut e = Map::new();
        e.insert("id".into(), json!(oid));
        e.insert("unit".into(), json!(unit));
        let Some((o, wst)) = chosen else {
            e.insert("state".into(), state_json(branch_state));
            e.insert("value".into(), Value::Null);
            e.insert("reason".into(), json!(if branch_state == State::Insufficient { "branchInsufficient" } else { "noBranch" }));
            outs.push(Value::Object(e));
            continue;
        };
        if let Some(b) = &o.branch {
            e.insert("branch".into(), json!(b));
        }
        let mut st = wst;
        let mut failed: Vec<String> = Vec::new();
        for r in &o.requires {
            let cs = cstate(r);
            if cs == State::NotApplicable || cs == State::Insufficient {
                failed.push(r.clone());
            }
            st = st.and(cs);
        }
        if !domain_ok {
            st = State::NotApplicable;
            e.insert("reason".into(), json!("domain"));
        }
        if !failed.is_empty() {
            e.insert("failed".into(), json!(failed));
        }
        let look = |n: &str| env.get(n);
        if let Some(sv) = &o.solve {
            match roots(sv, &env) {
                Err(err) => {
                    st = st.and(State::Insufficient);
                    if let Some(mv) = missing_of(&err) {
                        e.insert("missing".into(), json!(mv));
                    }
                    e.insert("roots".into(), json!([]));
                    e.insert("value".into(), Value::Null);
                }
                Ok(rs) => {
                    let mut kept = Vec::new();
                    let mut rejected = Vec::new();
                    for r in rs {
                        let ok = match &sv.accept {
                            None => true,
                            Some(a) => {
                                let look2 = |n: &str| if n == sv.var { Some(r) } else { env.get(n) };
                                evaluate(a, &look2).map(|v| v != 0.0 && !v.is_nan()).unwrap_or(false)
                            }
                        };
                        if ok {
                            kept.push(r);
                        } else {
                            rejected.push(r);
                        }
                    }
                    let count = kept.len();
                    e.insert("roots".into(), Value::Array(kept.iter().map(|x| jnum(*x)).collect()));
                    if !rejected.is_empty() {
                        e.insert("rejected".into(), Value::Array(rejected.iter().map(|x| jnum(*x)).collect()));
                    }
                    e.insert("solutions".into(), json!(match count {
                        0 => "none",
                        1 => "one",
                        _ => "multiple",
                    }));
                    let ok_state = st == State::Applicable || st == State::Approximate;
                    e.insert("value".into(), if count == 1 && ok_state { jnum(kept[0]) } else { Value::Null });
                    if count == 1 && !ok_state {
                        e.insert("raw".into(), jnum(kept[0]));
                    }
                }
            }
        } else if let Some(node) = &o.node {
            let res = if with_trace { evaluate_trace(node, &look).map(|t| (t[0], t)) } else { evaluate(node, &look).map(|v| (v, Vec::new())) };
            match res {
                Err(err) => {
                    st = st.and(State::Insufficient);
                    if let Some(mv) = missing_of(&err) {
                        e.insert("missing".into(), json!(mv));
                    }
                    e.insert("value".into(), Value::Null);
                }
                Ok((v, tr)) => {
                    let ok_state = st == State::Applicable || st == State::Approximate;
                    if !v.is_finite() {
                        // never a number for an undefined result (division by zero, a root of a negative number …);
                        // 'undefined' only when the conditions held (otherwise the failed condition is the reason)
                        e.insert("value".into(), Value::Null);
                        if ok_state {
                            e.insert("reason".into(), json!("undefined"));
                            st = State::NotApplicable;
                        }
                    } else if ok_state {
                        e.insert("value".into(), jnum(v));
                    } else {
                        e.insert("value".into(), Value::Null);
                        e.insert("raw".into(), jnum(v));
                    }
                    if with_trace {
                        e.insert("trace".into(), Value::Array(tr.iter().map(|x| jnum(*x)).collect()));
                    }
                }
            }
        }
        e.insert("state".into(), state_json(st));
        outs.push(Value::Object(e));
    }
    let used: Vec<Value> = env
        .used
        .borrow()
        .iter()
        .filter_map(|n| env.consts.iter().find(|k| k.id == n))
        .map(|k| json!({ "id": k.id, "value": jnum(k.value), "unit": k.unit, "u": jnum(k.u), "exact": k.exact, "origin": k.origin }))
        .collect();
    Ok(json!({
        "model": id,
        "constantsSet": set,
        "constantsSource": constants::source(set),
        "domain": domain,
        "lets": lets,
        "conditions": conds,
        "outputs": outs,
        "constants": used,
    }))
}

/// Solve a model for one unknown input: the values of `unknown` in [lo, hi] for which output `target` equals
/// `value` (scan of `samples` points, bisection of sign changes), each with the conditions there.
pub fn solve_model(id: &str, inputs: &Map<String, Value>, set: &str, unknown: &str, target: &str, value: f64, lo: f64, hi: f64, samples: usize, log_scale: bool) -> Result<Value, Message> {
    let reg = registry();
    let Some(m) = reg.iter().find(|m| m.id == id) else {
        return Err(Message::new("model.unknown").text("model", id));
    };
    if !m.inputs.iter().any(|i| i.id == unknown) {
        return Err(Message::new("model.unknownInput").text("model", id).text("input", unknown));
    }
    let g = |x: f64| -> f64 {
        let mut ins = inputs.clone();
        ins.insert(unknown.to_string(), jnum(x));
        match evaluate_model(id, &ins, set, false) {
            Ok(r) => r["outputs"].as_array().and_then(|a| a.iter().find(|o| o["id"] == target)).map(|o| if o["value"].is_null() { f64::NAN } else { dnum(&o["value"]) - value }).unwrap_or(f64::NAN),
            Err(_) => f64::NAN,
        }
    };
    let n = samples.clamp(8, 20000);
    let at = |k: usize| -> f64 {
        let s = k as f64 / n as f64;
        if log_scale && lo > 0.0 && hi > 0.0 {
            lo * (hi / lo).powf(s)
        } else {
            lo + (hi - lo) * s
        }
    };
    let mut roots: Vec<f64> = Vec::new();
    let mut xa = at(0);
    let mut fa = g(xa);
    for k in 1..=n {
        let xb = at(k);
        let fb = g(xb);
        if fa == 0.0 {
            roots.push(xa);
        } else if fa.is_finite() && fb.is_finite() && fb != 0.0 && (fa < 0.0) != (fb < 0.0) {
            let (mut a, mut b, mut fa2) = (xa, xb, fa);
            for _ in 0..200 {
                let mid = 0.5 * (a + b);
                if mid <= a || mid >= b {
                    break;
                }
                let fm = g(mid);
                if fm == 0.0 || !fm.is_finite() {
                    a = mid;
                    b = mid;
                    break;
                }
                if (fm < 0.0) == (fa2 < 0.0) {
                    a = mid;
                    fa2 = fm;
                } else {
                    b = mid;
                }
            }
            roots.push(0.5 * (a + b));
        }
        if k == n && fb == 0.0 {
            roots.push(xb);
        }
        xa = xb;
        fa = fb;
    }
    roots.dedup_by(|a, b| (*a - *b).abs() <= 1e-12 * a.abs().max(b.abs()).max(1e-300));
    let mut list = Vec::new();
    for r in &roots {
        let mut ins = inputs.clone();
        ins.insert(unknown.to_string(), jnum(*r));
        let ev = evaluate_model(id, &ins, set, false)?;
        list.push(json!({ "value": jnum(*r), "conditions": ev["conditions"], "output": ev["outputs"].as_array().and_then(|a| a.iter().find(|o| o["id"] == target)).cloned() }));
    }
    Ok(json!({
        "model": id,
        "unknown": unknown,
        "target": target,
        "solutions": match roots.len() { 0 => "none", 1 => "one", _ => "multiple" },
        "roots": list,
        "range": [jnum(lo), jnum(hi)],
    }))
}

/// Ids, inputs and outputs of the installed registry (the interface checks its own copy against this).
pub fn list_models() -> Value {
    let reg = registry();
    Value::Array(
        reg.iter()
            .map(|m| {
                json!({
                    "id": m.id,
                    "inputs": m.inputs.iter().map(|i| json!({ "id": i.id, "unit": i.unit })).collect::<Vec<_>>(),
                    "outputs": m.outputs.iter().map(|o| json!({ "id": o.id, "unit": o.unit, "branch": o.branch })).collect::<Vec<_>>(),
                    "conditions": m.conds.iter().map(|c| c.id.clone()).collect::<Vec<_>>(),
                })
            })
            .collect(),
    )
}

/// Names used by an expression that are not visible in the model (inputs, lets, constants).
#[allow(dead_code)]
fn unknown_names(node: &Node, scope: &Scope) -> Vec<String> {
    let mut vs = Vec::new();
    variables(node, &mut vs);
    vs.into_iter().filter(|v| scope.dim(v).is_none()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn install() {
        let reg = json!([{
            "id": "T-PROJ",
            "inputs": [{ "id": "v0", "unit": "m/s", "min": 0, "open": true }, { "id": "theta", "unit": "rad" }, { "id": "g", "unit": "m/s²", "min": 0, "open": true }, { "id": "h0", "unit": "m" }],
            "lets": [{ "id": "vy", "expr": "v0*sin(theta)", "unit": "m/s" }],
            "conditions": [
                { "id": "sameHeight", "expr": "abs(h0) <= 1e-9*v0^2/g" },
                { "id": "small", "expr": "theta < 0.05", "approx": "theta < 0.3" }
            ],
            "outputs": [
                { "id": "R", "unit": "m", "expr": "v0^2*sin(2*theta)/g", "requires": ["sameHeight"] },
                { "id": "T", "unit": "s", "solve": { "var": "t", "f": "h0 + vy*t - g*t^2/2", "lo": "0", "hi": "10*(v0 + sqrt(2*g*abs(h0)))/g", "accept": "t > 0" } },
                { "id": "f", "unit": "N", "expr": "2*g*1", "when": "small", "branch": "a" },
                { "id": "z", "unit": "N", "expr": "0*g" }
            ]
        }, {
            "id": "T-BAD",
            "inputs": [{ "id": "U", "unit": "V" }, { "id": "a", "unit": "m/s²" }, { "id": "L", "unit": "m" }],
            "outputs": [{ "id": "x", "unit": "V", "expr": "U + a" }, { "id": "y", "unit": "", "expr": "ln(L)" }]
        }]);
        let r = set_models(&reg);
        assert_eq!(r["models"], 2);
        let p = r["problems"].as_array().unwrap();
        // T-PROJ: output f is m/s² declared N → one problem (a product with the number 0 is a free zero and fits N); T-BAD: two
        assert!(p.iter().any(|x| x["model"] == "T-BAD" && x["what"] == "output x"), "{p:?}");
        assert!(p.iter().any(|x| x["model"] == "T-BAD" && x["what"] == "output y"), "{p:?}");
        assert!(p.iter().any(|x| x["model"] == "T-PROJ" && x["what"] == "output f"), "{p:?}");
        assert!(!p.iter().any(|x| x["model"] == "T-PROJ" && x["what"] == "output z"), "{p:?}");
    }

    fn eval(inputs: Value) -> Value {
        evaluate_model("T-PROJ", inputs.as_object().unwrap(), "CODATA2022", false).unwrap()
    }

    fn out<'a>(r: &'a Value, id: &str) -> &'a Value {
        r["outputs"].as_array().unwrap().iter().find(|o| o["id"] == id).unwrap()
    }

    #[test]
    fn four_states_branches_and_roots() {
        install();
        let r = eval(json!({ "v0": 20.0, "theta": 0.5235987755982988, "g": 9.8, "h0": 0.0 }));
        assert_eq!(out(&r, "R")["state"], "applicable");
        let rr = dnum(&out(&r, "R")["value"]);
        assert!((rr - 400.0 * (std::f64::consts::PI / 3.0).sin() / 9.8).abs() < 1e-12);
        // same height: t = 0 is a root but rejected by t > 0, so one solution remains
        assert_eq!(out(&r, "T")["solutions"], "one");
        let t = dnum(&out(&r, "T")["value"]);
        assert!((t - 2.0 * 10.0 / 9.8).abs() < 1e-9, "{t}");
        // from a 10 m platform the same-height range formula is not applicable, the root is still one
        let r = eval(json!({ "v0": 20.0, "theta": 0.5235987755982988, "g": 9.8, "h0": 10.0 }));
        assert_eq!(out(&r, "R")["state"], "notApplicable");
        assert!(out(&r, "R")["value"].is_null() && out(&r, "R")["raw"].is_number());
        assert_eq!(out(&r, "T")["solutions"], "one");
        // missing input → insufficient; approx condition → approximate branch
        let r = eval(json!({ "v0": 20.0, "theta": 0.2, "g": 9.8 }));
        assert_eq!(out(&r, "R")["state"], "insufficient");
        assert_eq!(r["conditions"][0]["state"], "insufficient");
        assert_eq!(r["conditions"][1]["state"], "approximate");
        assert_eq!(out(&r, "f")["state"], "approximate");
        let r = eval(json!({ "v0": 20.0, "theta": 0.5, "g": 9.8, "h0": 0.0 }));
        assert_eq!(out(&r, "f")["state"], "notApplicable");
        // a negative speed is outside the domain
        let r = eval(json!({ "v0": -1.0, "theta": 0.5, "g": 9.8, "h0": 0.0 }));
        assert_eq!(r["domain"].as_array().unwrap().len(), 1);
        assert_eq!(out(&r, "R")["state"], "notApplicable");
    }

    #[test]
    fn solving_for_an_unknown_finds_both_angles() {
        install();
        // R = 30 m at v0 = 20 m/s: two launch angles (θ and 90° − θ)
        let ins = json!({ "v0": 20.0, "g": 9.8, "h0": 0.0 });
        let r = solve_model("T-PROJ", ins.as_object().unwrap(), "CODATA2022", "theta", "R", 30.0, 0.0, std::f64::consts::FRAC_PI_2, 400, false).unwrap();
        assert_eq!(r["solutions"], "multiple");
        let a = dnum(&r["roots"][0]["value"]);
        let b = dnum(&r["roots"][1]["value"]);
        assert!((a + b - std::f64::consts::FRAC_PI_2).abs() < 1e-9, "{a} {b}");
        let r = solve_model("T-PROJ", ins.as_object().unwrap(), "CODATA2022", "theta", "R", 100.0, 0.0, std::f64::consts::FRAC_PI_2, 400, false).unwrap();
        assert_eq!(r["solutions"], "none");
    }
}

// ---- Run provenance (26.56, D104) ----

/// Physics and solver versions of the computing backends. `physics` changes only when a correction changes the
/// results of the same input (then the old behaviour stays available, D97/D104); `solver` names the method.
pub const BACKENDS: &[(&str, &str, &str)] = &[
    ("rigid", "26.55", "rigid-body DAE with event location; adaptive integrators (RK, Gauss–Legendre), Moreau–Jean fallback"),
    ("regions", "26.55", "field regions, liquids and rail loops on the rigid-body solver (D90–D92)"),
    ("circuit", "26.55", "modified nodal analysis; trapezoidal companion models with step-doubling control (D89)"),
    ("field", "26.54", "superposition of point charges and uniform fields; marching squares"),
    ("magnet", "26.55", "2D magnetic vector potential per metre of depth; constants by set (26.56)"),
    ("optics", "26.54", "ray tracing, thin-lens imaging"),
    ("waveoptics", "26.55", "Fraunhofer intensities, thin films, polarizers"),
    ("waves", "26.55", "leapfrog string, Doppler, sound"),
    ("gas", "26.55", "ideal-gas processes (closed forms) with integrated work"),
    ("heat", "26.54", "heating curves, two-body exchange"),
    ("atom", "26.54", "Bohr levels, photoelectric equation"),
    ("decay", "26.54", "Monte Carlo decay with seed"),
    ("nuclear", "26.55", "Bateman chains (confluent cases), AME2020 table (1 keV) and SEMF estimates; constants by set (26.56)"),
    ("quantum", "26.55", "split-step Fourier (own FFT), Sturm bisection eigenvalues"),
    ("relativity", "26.54", "special relativity closed forms"),
    ("models", "26.56", "model registry: restricted expressions, four-state conditions, bisection roots (D106)"),
    ("particles", "26.56", "conservation rules of particle processes (D107)"),
];

/// Data sets with their versions.
pub const DATA_SETS: &[(&str, &str)] = &[
    ("AME2020-1keV", "mass excesses of the example nuclides, AME2020 rounded to 1 keV (labs/nuclear.rs)"),
    ("SEMF-BW", "semi-empirical mass formula (Bethe–Weizsäcker) estimates, marked as estimates"),
    ("PDG-2024-masses", "particle masses of the process checker (labs/particles.rs)"),
];

/// Provenance record of a run or a calculation: versions of the core, the scene format, the backend, the constant
/// set and the data sets, and the SHA-256 of the canonical input (`input`, a string the interface serialises).
pub fn manifest(req: &Value) -> Value {
    let backend = req.get("backend").and_then(|v| v.as_str()).unwrap_or("rigid");
    let set = constants::normalize(req.get("constantsSet").and_then(|v| v.as_str()), constants::DEFAULT);
    let b = BACKENDS.iter().find(|(id, _, _)| *id == backend);
    let input = req.get("input").and_then(|v| v.as_str()).unwrap_or("");
    json!({
        "core": env!("CARGO_PKG_VERSION"),
        "sceneFormat": crate::scene::SCENE_VERSION,
        "backend": backend,
        "physicsVersion": b.map(|x| x.1),
        "solver": b.map(|x| x.2),
        "constantsSet": set,
        "constantsSource": constants::source(set),
        "dataSets": DATA_SETS.iter().map(|(id, d)| json!({ "id": id, "description": d })).collect::<Vec<_>>(),
        "inputSha256": if input.is_empty() { Value::Null } else { json!(crate::sha256::sha256_hex(input.as_bytes())) },
        "backends": BACKENDS.iter().map(|(id, p, s)| json!({ "id": id, "physicsVersion": p, "solver": s })).collect::<Vec<_>>(),
    })
}
