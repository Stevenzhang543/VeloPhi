//! Variable-force expressions (port of `src/formula/expr.ts` — parser and dimension inference — and of
//! `src/core/solver/forceExpr.ts` — checks and the compiled form). The parser follows the TypeScript one
//! character by character (positions count UTF-16 code units, as JavaScript string indices do).
//!
//! Compiled expressions live in an arena of nodes. Every piecewise function is a *switch* whose branch is frozen
//! in a mode; switches are numbered in the order the TypeScript compiler registers them, which is part of the
//! checkpoint layout.

use crate::dmath;
use crate::js::{js_max, js_min};
use crate::message::Message;

/// Comparison operator (only in the condition of `if`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CmpOp {
    Lt,
    Le,
    Gt,
    Ge,
}

impl CmpOp {
    fn text(self) -> &'static str {
        match self {
            CmpOp::Lt => "<",
            CmpOp::Le => "<=",
            CmpOp::Gt => ">",
            CmpOp::Ge => ">=",
        }
    }
}

/// Binary operator.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BinOp {
    Add,
    Sub,
    Mul,
    Div,
    Pow,
}

/// Expression tree.
#[derive(Clone, Debug, PartialEq)]
pub enum Node {
    Num(f64),
    Var(String),
    Neg(Box<Node>),
    Bin(BinOp, Box<Node>, Box<Node>),
    Call(String, Vec<Node>),
    Cmp(CmpOp, Box<Node>, Box<Node>),
}

/// Functions added for the formula language of the model registry (26.56, D106); force expressions do not accept
/// them (their compiled form has no switches or derivatives for these).
fn formula_func_arity(name: &str) -> Option<usize> {
    match name {
        "sinh" | "cosh" | "asinh" | "acosh" | "atanh" | "sinc" | "cbrt" | "floor" => Some(1),
        _ => func_arity(name),
    }
}

/// Functions of the language with their arity (formula/expr.ts FUNCS).
fn func_arity(name: &str) -> Option<usize> {
    Some(match name {
        "sin" | "cos" | "tan" | "asin" | "acos" | "atan" | "sqrt" | "abs" | "exp" | "tanh" | "ln" | "log" | "lg" | "sign" | "step" | "ellipK" => 1,
        "atan2" | "ellipF" | "min" | "max" => 2,
        "clamp" | "if" => 3,
        _ => return None,
    })
}

/// Variables of force expressions, in the order of the evaluation environment.
pub const FORCE_VARIABLES: [&str; 10] = ["t", "x", "y", "vx", "vy", "v", "theta", "omega", "m", "g"];
/// Length of the evaluation environment.
pub const ENV_SIZE: usize = 10;

const ALLOWED_FUNCTIONS: [&str; 19] =
    ["sin", "cos", "tan", "asin", "acos", "atan", "atan2", "exp", "ln", "log", "lg", "sqrt", "abs", "min", "max", "sign", "step", "clamp", "if"];

fn env_index(name: &str) -> Option<usize> {
    FORCE_VARIABLES.iter().position(|v| *v == name)
}

/// Constants of force expressions: pi and e.
fn force_constant(name: &str) -> Option<f64> {
    match name {
        "pi" => Some(dmath::PI_VALUE),
        "e" => Some(dmath::E_VALUE),
        _ => None,
    }
}

type EResult<T> = Result<T, Message>;

struct Parser<'a> {
    src: Vec<u16>,
    text: &'a str,
    pos: usize,
    /// Named constants: pi and e for force expressions, only pi for the formula language.
    constant: fn(&str) -> Option<f64>,
    /// The formula language (26.56: also sinh, cosh, asinh, acosh, atanh, sinc, cbrt, floor).
    ext: bool,
}

const SP: u16 = b' ' as u16;
const TAB: u16 = b'\t' as u16;

fn is_digit(c: u16) -> bool {
    (b'0' as u16..=b'9' as u16).contains(&c)
}
fn is_ident_start(c: u16) -> bool {
    (b'A' as u16..=b'Z' as u16).contains(&c) || (b'a' as u16..=b'z' as u16).contains(&c) || c == b'_' as u16
}
fn is_ident(c: u16) -> bool {
    is_ident_start(c) || is_digit(c)
}

impl<'a> Parser<'a> {
    fn at(&self, i: usize) -> Option<u16> {
        self.src.get(i).copied()
    }

    fn peek(&mut self) -> Option<u16> {
        while self.at(self.pos) == Some(SP) || self.at(self.pos) == Some(TAB) {
            self.pos += 1;
        }
        self.at(self.pos)
    }

    fn ch_text(c: u16) -> String {
        String::from_utf16_lossy(&[c])
    }

    fn err(&self, key: &'static str) -> Message {
        Message::new(key).num("pos", (self.pos + 1) as f64).text("src", self.text)
    }

    fn expect(&mut self, ch: u8) -> EResult<()> {
        if self.peek() != Some(ch as u16) {
            return Err(self.err("expr.expected").text("ch", (ch as char).to_string()));
        }
        self.pos += 1;
        Ok(())
    }

    /// Length of the number at `pos` per /^[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/ (0 when it does not match).
    fn number_len(&self) -> usize {
        let p = self.pos;
        let mut a = 0;
        while self.at(p + a).is_some_and(is_digit) {
            a += 1;
        }
        let mut len;
        if self.at(p + a) == Some(b'.' as u16) && self.at(p + a + 1).is_some_and(is_digit) {
            len = a + 1;
            while self.at(p + len).is_some_and(is_digit) {
                len += 1;
            }
        } else if a > 0 {
            len = a;
        } else {
            return 0;
        }
        // Optional exponent
        if matches!(self.at(p + len), Some(c) if c == b'e' as u16 || c == b'E' as u16) {
            let mut q = len + 1;
            if matches!(self.at(p + q), Some(c) if c == b'-' as u16 || c == b'+' as u16) {
                q += 1;
            }
            let digits0 = q;
            while self.at(p + q).is_some_and(is_digit) {
                q += 1;
            }
            if q > digits0 {
                len = q;
            }
        }
        len
    }

    fn primary(&mut self) -> EResult<Node> {
        let ch = self.peek();
        match ch {
            Some(c) if c == b'(' as u16 => {
                self.pos += 1;
                let e = self.sum()?;
                self.expect(b')')?;
                Ok(e)
            }
            Some(c) if c == b'-' as u16 => {
                self.pos += 1;
                Ok(Node::Neg(Box::new(self.power()?)))
            }
            Some(c) if c == b'+' as u16 => {
                self.pos += 1;
                self.power()
            }
            Some(c) if is_digit(c) || c == b'.' as u16 => {
                let len = self.number_len();
                if len == 0 {
                    return Err(self.err("expr.badNumber"));
                }
                let s = String::from_utf16_lossy(&self.src[self.pos..self.pos + len]);
                self.pos += len;
                let norm = if s.starts_with('.') { format!("0{s}") } else { s };
                let value: f64 = norm.parse().map_err(|_| self.err("expr.badNumber"))?;
                Ok(Node::Num(value))
            }
            Some(c) if is_ident_start(c) => {
                let start = self.pos;
                while self.at(self.pos).is_some_and(is_ident) {
                    self.pos += 1;
                }
                let name = String::from_utf16_lossy(&self.src[start..self.pos]);
                if self.peek() == Some(b'(' as u16) {
                    self.pos += 1;
                    let arity = match if self.ext { formula_func_arity(&name) } else { func_arity(&name) } {
                        Some(a) => a,
                        None => return Err(Message::new("expr.unknownFunction").text("name", name)),
                    };
                    let mut args = Vec::new();
                    if name == "if" {
                        args.push(self.comparison()?);
                        while self.peek() == Some(b',' as u16) {
                            self.pos += 1;
                            args.push(self.sum()?);
                        }
                    } else if self.peek() != Some(b')' as u16) {
                        args.push(self.sum()?);
                        while self.peek() == Some(b',' as u16) {
                            self.pos += 1;
                            args.push(self.sum()?);
                        }
                    }
                    self.expect(b')')?;
                    if arity != args.len() {
                        return Err(Message::new("expr.arity").text("name", name).num("arity", arity as f64).num("count", args.len() as f64));
                    }
                    return Ok(Node::Call(name, args));
                }
                let constant = (self.constant)(&name);
                if (if self.ext { formula_func_arity(&name) } else { func_arity(&name) }).is_some() && constant.is_none() {
                    return Err(Message::new("expr.functionNeedsParens").text("name", name));
                }
                if let Some(v) = constant {
                    return Ok(Node::Num(v));
                }
                Ok(Node::Var(name))
            }
            Some(c) if c == b'<' as u16 || c == b'>' as u16 => Err(self.err("expr.comparisonOnlyInIf")),
            None => Err(Message::new("expr.incomplete").text("src", self.text)),
            Some(c) => Err(self.err("expr.badChar").text("ch", Self::ch_text(c))),
        }
    }

    fn power(&mut self) -> EResult<Node> {
        let base = self.primary()?;
        if self.peek() == Some(b'^' as u16) {
            self.pos += 1;
            return Ok(Node::Bin(BinOp::Pow, Box::new(base), Box::new(self.power()?)));
        }
        if self.at(self.pos) == Some(b'*' as u16) && self.at(self.pos + 1) == Some(b'*' as u16) {
            self.pos += 2;
            return Ok(Node::Bin(BinOp::Pow, Box::new(base), Box::new(self.power()?)));
        }
        Ok(base)
    }

    fn product(&mut self) -> EResult<Node> {
        let mut left = self.power()?;
        loop {
            let ch = self.peek();
            let star = ch == Some(b'*' as u16) && self.at(self.pos + 1) != Some(b'*' as u16);
            if star || ch == Some(b'/' as u16) {
                self.pos += 1;
                let op = if star { BinOp::Mul } else { BinOp::Div };
                left = Node::Bin(op, Box::new(left), Box::new(self.power()?));
            } else {
                return Ok(left);
            }
        }
    }

    fn sum(&mut self) -> EResult<Node> {
        let mut left = self.product()?;
        loop {
            let ch = self.peek();
            if ch == Some(b'+' as u16) || ch == Some(b'-' as u16) {
                self.pos += 1;
                let op = if ch == Some(b'+' as u16) { BinOp::Add } else { BinOp::Sub };
                left = Node::Bin(op, Box::new(left), Box::new(self.product()?));
            } else {
                return Ok(left);
            }
        }
    }

    fn comparison(&mut self) -> EResult<Node> {
        let left = self.sum()?;
        let ch = self.peek();
        let less = ch == Some(b'<' as u16);
        if !less && ch != Some(b'>' as u16) {
            return Err(Message::new("expr.ifNeedsComparison"));
        }
        self.pos += 1;
        let mut op = if less { CmpOp::Lt } else { CmpOp::Gt };
        if self.at(self.pos) == Some(b'=' as u16) {
            self.pos += 1;
            op = if less { CmpOp::Le } else { CmpOp::Ge };
        }
        let right = self.sum()?;
        Ok(Node::Cmp(op, Box::new(left), Box::new(right)))
    }
}

/// Parse an expression with the force constants (pi, e).
pub fn parse(src: &str) -> EResult<Node> {
    if src.trim().is_empty() {
        return Err(Message::new("expr.empty"));
    }
    parse_with(src, force_constant, false)
}

/// Constants of the formula language (formula/expr.ts DEFAULT_CONSTANTS): only pi.
fn formula_constant(name: &str) -> Option<f64> {
    match name {
        "pi" => Some(dmath::PI_VALUE),
        _ => None,
    }
}

/// Parse an expression of the formula language (library formulas, custom quantities): constant pi only.
pub fn parse_formula(src: &str) -> EResult<Node> {
    if src.trim().is_empty() {
        return Err(Message::new("expr.empty"));
    }
    parse_with(src, formula_constant, true)
}

fn parse_with(src: &str, constant: fn(&str) -> Option<f64>, ext: bool) -> EResult<Node> {
    let mut p = Parser { src: src.encode_utf16().collect(), text: src, pos: 0, constant, ext };
    let node = p.sum()?;
    if let Some(ch) = p.peek() {
        if ch == b'<' as u16 || ch == b'>' as u16 {
            return Err(p.err("expr.comparisonOnlyInIf"));
        }
        if ch == b')' as u16 {
            return Err(p.err("expr.unbalanced"));
        }
        return Err(p.err("expr.trailing").text("ch", Parser::ch_text(ch)));
    }
    Ok(node)
}

// ---- Dimensions ----
/// Physical dimension as exponents of the seven SI base quantities (26.56, D99): length L, mass M, time T, electric
/// current I, thermodynamic temperature Θ, amount of substance N and luminous intensity J. Angles are dimensionless;
/// whether a temperature is absolute or a difference is a semantic type of the quantity, not a dimension.
pub type Dim = [f64; 7];
pub const DIMLESS: Dim = [0.0; 7];
const FORCE_DIM: Dim = d3(1.0, 1.0, -2.0);

/// A mechanical dimension (L, M, T).
pub const fn d3(l: f64, m: f64, t: f64) -> Dim {
    [l, m, t, 0.0, 0.0, 0.0, 0.0]
}
/// A dimension with electric current (L, M, T, I).
pub const fn d4(l: f64, m: f64, t: f64, i: f64) -> Dim {
    [l, m, t, i, 0.0, 0.0, 0.0]
}
/// A full dimension (L, M, T, I, Θ, N, J).
pub const fn d7(l: f64, m: f64, t: f64, i: f64, th: f64, n: f64, j: f64) -> Dim {
    [l, m, t, i, th, n, j]
}

pub fn dim_equal(a: &Dim, b: &Dim) -> bool {
    a.iter().zip(b.iter()).all(|(x, y)| (x - y).abs() < 1e-12)
}
pub fn dim_mul(a: &Dim, b: &Dim) -> Dim {
    let mut r = DIMLESS;
    for k in 0..7 {
        r[k] = a[k] + b[k];
    }
    r
}
pub fn dim_pow(a: &Dim, p: f64) -> Dim {
    let mut r = DIMLESS;
    for k in 0..7 {
        r[k] = a[k] * p;
    }
    r
}

/// Units of the formula language with their dimensions, in display preference order (the first unit of a
/// dimension is its display unit). The same table as src/formula/units.ts (tests/units.test.ts compares them).
pub const UNITS: &[(&str, Dim)] = &[
    ("", DIMLESS),
    ("rad", DIMLESS),
    ("m", d3(1.0, 0.0, 0.0)),
    ("kg", d3(0.0, 1.0, 0.0)),
    ("s", d3(0.0, 0.0, 1.0)),
    ("m/s", d3(1.0, 0.0, -1.0)),
    ("m/s²", d3(1.0, 0.0, -2.0)),
    ("rad/s", d3(0.0, 0.0, -1.0)),
    ("rad/s²", d3(0.0, 0.0, -2.0)),
    ("N", d3(1.0, 1.0, -2.0)),
    ("N/m", d3(0.0, 1.0, -2.0)),
    ("J", d3(2.0, 1.0, -2.0)),
    ("kg·m/s", d3(1.0, 1.0, -1.0)),
    ("kg·m²", d3(2.0, 1.0, 0.0)),
    ("kg·m²/s", d3(2.0, 1.0, -1.0)),
    ("N·s", d3(1.0, 1.0, -1.0)),
    ("N·s/m", d3(0.0, 1.0, -1.0)),
    ("W", d3(2.0, 1.0, -3.0)),
    ("N·m", d3(2.0, 1.0, -2.0)),
    ("Hz", d3(0.0, 0.0, -1.0)),
    ("1/s", d3(0.0, 0.0, -1.0)),
    // 26.51: drag, gravitation, areal velocity, nonlinear springs
    ("N·s²/m²", d3(-1.0, 1.0, 0.0)),
    ("N·m²/kg²", d3(3.0, -1.0, -2.0)),
    ("m²/s", d3(2.0, 0.0, -1.0)),
    ("m²", d3(2.0, 0.0, 0.0)),
    ("N/m³", d3(-2.0, 1.0, -2.0)),
    // 26.54: electricity and magnetism (26.56: in SI base dimensions, C = A·s)
    ("C", d4(0.0, 0.0, 1.0, 1.0)),
    ("V/m", d4(1.0, 1.0, -3.0, -1.0)),
    ("T", d4(0.0, 1.0, -2.0, -1.0)),
    ("V", d4(2.0, 1.0, -3.0, -1.0)),
    ("A", d4(0.0, 0.0, 0.0, 1.0)),
    ("Ω", d4(2.0, 1.0, -3.0, -2.0)),
    ("F", d4(-2.0, -1.0, 4.0, 2.0)),
    ("N·m²/C²", d4(3.0, 1.0, -4.0, -2.0)),
    ("C/kg", d4(0.0, -1.0, 1.0, 1.0)),
    // 26.55: liquids and induction
    ("kg/m³", d3(-3.0, 1.0, 0.0)),
    ("m³", d3(3.0, 0.0, 0.0)),
    ("Wb", d4(2.0, 1.0, -2.0, -1.0)),
    // 26.56 (D99): temperature, amount of substance, luminous intensity and the units of the model registry
    ("K", d7(0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0)),
    ("mol", d7(0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0)),
    ("cd", d7(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0)),
    ("Pa", d3(-1.0, 1.0, -2.0)),
    ("J/K", d7(2.0, 1.0, -2.0, 0.0, -1.0, 0.0, 0.0)),
    ("J/(kg·K)", d7(2.0, 0.0, -2.0, 0.0, -1.0, 0.0, 0.0)),
    ("J/(mol·K)", d7(2.0, 1.0, -2.0, 0.0, -1.0, -1.0, 0.0)),
    ("J/kg", d3(2.0, 0.0, -2.0)),
    ("J/mol", d7(2.0, 1.0, -2.0, 0.0, 0.0, -1.0, 0.0)),
    ("W/(m·K)", d7(1.0, 1.0, -3.0, 0.0, -1.0, 0.0, 0.0)),
    ("W/m²", d3(0.0, 1.0, -3.0)),
    ("W/(m²·K⁴)", d7(0.0, 1.0, -3.0, 0.0, -4.0, 0.0, 0.0)),
    ("m·K", d7(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0)),
    ("1/K", d7(0.0, 0.0, 0.0, 0.0, -1.0, 0.0, 0.0)),
    ("kg/mol", d7(0.0, 1.0, 0.0, 0.0, 0.0, -1.0, 0.0)),
    ("1/mol", d7(0.0, 0.0, 0.0, 0.0, 0.0, -1.0, 0.0)),
    ("Pa·s", d3(-1.0, 1.0, -1.0)),
    ("m³/s", d3(3.0, 0.0, -1.0)),
    ("kg/m", d3(-1.0, 1.0, 0.0)),
    ("kg/s", d3(0.0, 1.0, -1.0)),
    ("1/m", d3(-1.0, 0.0, 0.0)),
    ("1/m³", d3(-3.0, 0.0, 0.0)),
    ("J·s", d3(2.0, 1.0, -1.0)),
    ("m³/(kg·s²)", d3(3.0, -1.0, -2.0)),
    ("m³/s²", d3(3.0, 0.0, -2.0)),
    ("H", d4(2.0, 1.0, -2.0, -2.0)),
    ("H/m", d4(1.0, 1.0, -2.0, -2.0)),
    ("F/m", d4(-3.0, -1.0, 4.0, 2.0)),
    ("C/m²", d4(-2.0, 0.0, 1.0, 1.0)),
    ("A/m", d4(-1.0, 0.0, 0.0, 1.0)),
    ("A/s", d4(0.0, 0.0, -1.0, 1.0)),
    ("V/s", d4(2.0, 1.0, -4.0, -1.0)),
    ("T/s", d4(0.0, 1.0, -3.0, -1.0)),
    ("Wb/s", d4(2.0, 1.0, -3.0, -1.0)),
    ("V/(m·s)", d4(1.0, 1.0, -4.0, -1.0)),
    ("Wb/m", d4(1.0, 1.0, -2.0, -1.0)),
    ("N/A²", d4(1.0, 1.0, -2.0, -2.0)),
    ("C·m", d4(1.0, 0.0, 1.0, 1.0)),
    ("V·m", d4(3.0, 1.0, -3.0, -1.0)),
    ("Ω·m", d4(3.0, 1.0, -3.0, -2.0)),
    ("S", d4(-2.0, -1.0, 3.0, 2.0)),
    ("Gy", d3(2.0, 0.0, -2.0)),
    ("Bq", d3(0.0, 0.0, -1.0)),
    ("N/m²", d3(-1.0, 1.0, -2.0)),
    ("kg/(m·s)", d3(-1.0, 1.0, -1.0)),
    ("s²", d7(0.0, 0.0, 2.0, 0.0, 0.0, 0.0, 0.0)),
    ("m·s", d7(1.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0)),
    ("N/s", d7(1.0, 1.0, -3.0, 0.0, 0.0, 0.0, 0.0)),
    ("m⁴", d7(4.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)),
    ("1/s²", d7(0.0, 0.0, -2.0, 0.0, 0.0, 0.0, 0.0)),
    ("kg/C", d7(0.0, 1.0, -1.0, -1.0, 0.0, 0.0, 0.0)),
    ("m³/C", d7(3.0, 0.0, -1.0, -1.0, 0.0, 0.0, 0.0)),
    ("V·s", d7(2.0, 1.0, -2.0, -1.0, 0.0, 0.0, 0.0)),
    ("J/m³", d7(-1.0, 1.0, -2.0, 0.0, 0.0, 0.0, 0.0)),
    ("W/m³", d7(-1.0, 1.0, -3.0, 0.0, 0.0, 0.0, 0.0)),
    ("K/W", d7(-2.0, -1.0, 3.0, 0.0, 1.0, 0.0, 0.0)),
    ("J·m", d7(3.0, 1.0, -2.0, 0.0, 0.0, 0.0, 0.0)),
    ("C/m³", d7(-3.0, 0.0, 1.0, 1.0, 0.0, 0.0, 0.0)),
];

pub fn format_dim(d: &Dim) -> String {
    let names = ["m", "kg", "s", "A", "K", "mol", "cd"];
    let mut parts = Vec::new();
    for (i, e) in d.iter().enumerate() {
        if e.abs() > 1e-12 {
            parts.push(if *e == 1.0 { names[i].to_string() } else { format!("{}^{}", names[i], e) });
        }
    }
    if parts.is_empty() {
        "1".into()
    } else {
        parts.join("·")
    }
}

/// Unit text of a dimension for message parameters ("" for dimensionless).
fn dim_name(d: &Dim) -> String {
    if dim_equal(d, &DIMLESS) {
        return String::new();
    }
    for (u, dim) in UNITS.iter() {
        if *u != "rad" && dim_equal(dim, d) {
            return (*u).to_string();
        }
    }
    format_dim(d)
}

fn var_dim(name: &str) -> Option<Dim> {
    Some(match name {
        "t" => d3(0.0, 0.0, 1.0),
        "x" | "y" => d3(1.0, 0.0, 0.0),
        "vx" | "vy" | "v" => d3(1.0, 0.0, -1.0),
        "theta" => DIMLESS,
        "omega" => d3(0.0, 0.0, -1.0),
        "m" => d3(0.0, 1.0, 0.0),
        "g" => d3(1.0, 0.0, -2.0),
        _ => return None,
    })
}

fn exponent_of(node: &Node) -> Option<f64> {
    match node {
        Node::Num(v) => Some(*v),
        Node::Neg(a) => match a.as_ref() {
            Node::Num(v) => Some(-*v),
            _ => None,
        },
        _ => None,
    }
}

fn unify(list: &[Option<Dim>], what: &'static str) -> EResult<Option<Dim>> {
    let mut fixed: Option<Dim> = None;
    for d in list.iter().flatten() {
        match fixed {
            None => fixed = Some(*d),
            Some(f) => {
                if !dim_equal(&f, d) {
                    return Err(Message::new("expr.dimMismatch").text("what", what).text("a", dim_name(&f)).text("b", dim_name(d)));
                }
            }
        }
    }
    Ok(fixed)
}

fn dimless(d: Option<Dim>, func: &str) -> EResult<()> {
    if let Some(d) = d {
        if !dim_equal(&d, &DIMLESS) {
            return Err(Message::new("expr.argumentNotDimensionless").text("function", func).text("dim", dim_name(&d)));
        }
    }
    Ok(())
}

/// Dimension with numbers as coefficients of unspecified unit (formula/expr.ts inferDimension).
fn infer_dimension(node: &Node) -> EResult<Option<Dim>> {
    match node {
        Node::Num(_) => Ok(None),
        Node::Var(name) => var_dim(name).map(Some).ok_or_else(|| Message::new("expr.unknownVariable").text("name", name.clone())),
        Node::Neg(a) => infer_dimension(a),
        Node::Cmp(op, l, r) => {
            let a = infer_dimension(l)?;
            let b = infer_dimension(r)?;
            unify(&[a, b], op.text())?;
            Ok(Some(DIMLESS))
        }
        Node::Bin(op, l, r) => {
            let a = infer_dimension(l)?;
            if *op == BinOp::Pow {
                if let Some(p) = exponent_of(r) {
                    return Ok(a.map(|a| dim_pow(&a, p)));
                }
                dimless(infer_dimension(r)?, "^")?;
                if let Some(a) = a {
                    if !dim_equal(&a, &DIMLESS) {
                        return Err(Message::new("expr.dimensionedPower").text("dim", dim_name(&a)));
                    }
                }
                return Ok(Some(DIMLESS));
            }
            let b = infer_dimension(r)?;
            if *op == BinOp::Add || *op == BinOp::Sub {
                return unify(&[a, b], if *op == BinOp::Add { "+" } else { "-" });
            }
            match (a, b) {
                (Some(a), Some(b)) => Ok(Some(if *op == BinOp::Mul { dim_mul(&a, &b) } else { dim_mul(&a, &dim_pow(&b, -1.0)) })),
                _ => Ok(None),
            }
        }
        Node::Call(f, args) => {
            if f == "if" {
                infer_dimension(&args[0])?;
                let a = infer_dimension(&args[1])?;
                let b = infer_dimension(&args[2])?;
                return unify(&[a, b], "if");
            }
            let mut dims = Vec::with_capacity(args.len());
            for a in args {
                dims.push(infer_dimension(a)?);
            }
            match f.as_str() {
                "sqrt" => return Ok(dims[0].map(|d| dim_pow(&d, 0.5))),
                "abs" => return Ok(dims[0]),
                "sign" | "step" => return Ok(Some(DIMLESS)),
                "min" => return unify(&dims, "min"),
                "max" => return unify(&dims, "max"),
                "clamp" => return unify(&dims, "clamp"),
                "atan2" => {
                    unify(&dims, "atan2")?;
                    return Ok(Some(DIMLESS));
                }
                _ => {}
            }
            for d in dims {
                dimless(d, f)?;
            }
            Ok(Some(DIMLESS))
        }
    }
}

fn check_node(node: &Node) -> EResult<()> {
    match node {
        Node::Var(name) => {
            if env_index(name).is_none() {
                return Err(Message::new("expr.unknownVariable").text("name", name.clone()));
            }
            Ok(())
        }
        Node::Neg(a) => check_node(a),
        Node::Bin(_, l, r) | Node::Cmp(_, l, r) => {
            check_node(l)?;
            check_node(r)
        }
        Node::Call(f, args) => {
            if !ALLOWED_FUNCTIONS.contains(&f.as_str()) {
                return Err(Message::new("expr.functionNotAllowed").text("name", f.clone()));
            }
            for a in args {
                check_node(a)?;
            }
            Ok(())
        }
        Node::Num(_) => Ok(()),
    }
}

/// Parse a force component: syntax, known variables and functions, dimension of force.
pub fn parse_force_expr(src: &str) -> EResult<Node> {
    let node = parse(src)?;
    check_node(&node)?;
    if let Some(d) = infer_dimension(&node)? {
        if !dim_equal(&d, &FORCE_DIM) {
            return Err(Message::new("expr.notForce").text("dim", dim_name(&d)));
        }
    }
    Ok(node)
}

/// Check one force component expression (checkForceExpr).
pub fn check_force_expr(src: &str) -> EResult<()> {
    if src.trim().is_empty() {
        return Err(Message::new("expr.emptyComponent"));
    }
    parse_force_expr(src).map(|_| ())
}

// ---- Compiled form ----
/// Kind of piecewise function behind a switch.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SwitchKind {
    Step,
    Sign,
    If,
    Abs,
    Min,
    Max,
}

/// Unary functions evaluated through dmath.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Func1 {
    Sin,
    Cos,
    Tan,
    Asin,
    Acos,
    Atan,
    Sqrt,
    Exp,
    Ln,
    Lg,
}

/// A node of the compiled arena; children are arena indices.
#[derive(Clone, Debug)]
enum ENode {
    Const(f64),
    Var(usize),
    Neg(usize),
    Add(usize, usize),
    Sub(usize, usize),
    Mul(usize, usize),
    Div(usize, usize),
    Pow(usize, usize),
    If { k: usize, op: CmpOp, l: usize, r: usize, p: usize, q: usize },
    Min { k: usize, a: usize, b: usize },
    Max { k: usize, a: usize, b: usize },
    Abs { k: usize, a: usize },
    Sign { k: usize, a: usize },
    Step { k: usize, a: usize },
    F1(Func1, usize),
    Atan2(usize, usize),
}

/// Switching argument: a − b, or a single expression.
#[derive(Clone, Copy, Debug)]
enum SwitchArg {
    Diff(usize, usize),
    Single(usize),
}

/// A piecewise point of an expression; its argument is ≥ 0 on branch +1 and < 0 on branch −1.
#[derive(Clone, Debug)]
pub struct SwitchDef {
    pub kind: SwitchKind,
    /// True for jumps (step, sign, if); false for kinks (abs, min, max, clamp).
    pub jump: bool,
    /// Branch when the argument is exactly 0.
    pub zero: i8,
    arg: SwitchArg,
}

/// Arena of compiled expressions of a model, with the switch list.
#[derive(Clone, Debug, Default)]
pub struct ExprArena {
    nodes: Vec<ENode>,
    /// Switches of all variable forces in registration order (model.switches).
    pub switches: Vec<SwitchDef>,
}

/// `log(10)` for lg.
fn ln10() -> f64 {
    dmath::log(10.0)
}

impl ExprArena {
    fn push(&mut self, n: ENode) -> usize {
        self.nodes.push(n);
        self.nodes.len() - 1
    }

    fn add_switch(&mut self, kind: SwitchKind, jump: bool, zero: i8, arg: SwitchArg) -> usize {
        self.switches.push(SwitchDef { kind, jump, zero, arg });
        self.switches.len() - 1
    }

    /// Compile a checked node (compileNode); switches are appended to the arena's list.
    fn compile(&mut self, node: &Node) -> EResult<usize> {
        Ok(match node {
            Node::Num(v) => self.push(ENode::Const(*v)),
            Node::Var(name) => {
                let i = env_index(name).ok_or_else(|| Message::new("expr.unknownVariable").text("name", name.clone()))?;
                self.push(ENode::Var(i))
            }
            Node::Neg(a) => {
                let a = self.compile(a)?;
                self.push(ENode::Neg(a))
            }
            Node::Cmp(..) => return Err(Message::new("expr.comparisonOnlyInIf")),
            Node::Bin(op, l, r) => {
                let a = self.compile(l)?;
                let b = self.compile(r)?;
                self.push(match op {
                    BinOp::Add => ENode::Add(a, b),
                    BinOp::Sub => ENode::Sub(a, b),
                    BinOp::Mul => ENode::Mul(a, b),
                    BinOp::Div => ENode::Div(a, b),
                    BinOp::Pow => ENode::Pow(a, b),
                })
            }
            Node::Call(f, args) => match f.as_str() {
                "if" => {
                    let (op, cl, cr) = match &args[0] {
                        Node::Cmp(op, l, r) => (*op, l, r),
                        _ => return Err(Message::new("expr.ifNeedsComparison")),
                    };
                    let l = self.compile(cl)?;
                    let r = self.compile(cr)?;
                    let less = matches!(op, CmpOp::Lt | CmpOp::Le);
                    let arg = if less { SwitchArg::Diff(r, l) } else { SwitchArg::Diff(l, r) };
                    let zero = if matches!(op, CmpOp::Lt | CmpOp::Gt) { -1 } else { 1 };
                    let k = self.add_switch(SwitchKind::If, true, zero, arg);
                    let p = self.compile(&args[1])?;
                    let q = self.compile(&args[2])?;
                    self.push(ENode::If { k, op, l, r, p, q })
                }
                "clamp" => {
                    let x = self.compile(&args[0])?;
                    let lo = self.compile(&args[1])?;
                    let hi = self.compile(&args[2])?;
                    let k1 = self.add_switch(SwitchKind::Max, false, 1, SwitchArg::Diff(x, lo));
                    let inner = self.push(ENode::Max { k: k1, a: x, b: lo });
                    let k2 = self.add_switch(SwitchKind::Min, false, 1, SwitchArg::Diff(hi, inner));
                    self.push(ENode::Min { k: k2, a: inner, b: hi })
                }
                "min" | "max" => {
                    let a = self.compile(&args[0])?;
                    let b = self.compile(&args[1])?;
                    if f == "min" {
                        let k = self.add_switch(SwitchKind::Min, false, 1, SwitchArg::Diff(b, a));
                        self.push(ENode::Min { k, a, b })
                    } else {
                        let k = self.add_switch(SwitchKind::Max, false, 1, SwitchArg::Diff(a, b));
                        self.push(ENode::Max { k, a, b })
                    }
                }
                "abs" => {
                    let a = self.compile(&args[0])?;
                    let k = self.add_switch(SwitchKind::Abs, false, 1, SwitchArg::Single(a));
                    self.push(ENode::Abs { k, a })
                }
                "sign" => {
                    let a = self.compile(&args[0])?;
                    let k = self.add_switch(SwitchKind::Sign, true, 0, SwitchArg::Single(a));
                    self.push(ENode::Sign { k, a })
                }
                "step" => {
                    let a = self.compile(&args[0])?;
                    let k = self.add_switch(SwitchKind::Step, true, 1, SwitchArg::Single(a));
                    self.push(ENode::Step { k, a })
                }
                "atan2" => {
                    let a = self.compile(&args[0])?;
                    let b = self.compile(&args[1])?;
                    self.push(ENode::Atan2(a, b))
                }
                name => {
                    let func = match name {
                        "sin" => Func1::Sin,
                        "cos" => Func1::Cos,
                        "tan" => Func1::Tan,
                        "asin" => Func1::Asin,
                        "acos" => Func1::Acos,
                        "atan" => Func1::Atan,
                        "sqrt" => Func1::Sqrt,
                        "exp" => Func1::Exp,
                        "ln" | "log" => Func1::Ln,
                        "lg" => Func1::Lg,
                        _ => return Err(Message::new("expr.functionNotAllowed").text("name", name.to_string())),
                    };
                    let a = self.compile(&args[0])?;
                    self.push(ENode::F1(func, a))
                }
            },
        })
    }

    /// Compile a force component; returns the root node. Its switches are appended to `switches`.
    pub fn compile_force_expr(&mut self, src: &str) -> EResult<usize> {
        let node = parse_force_expr(src)?;
        self.compile(&node)
    }

    /// Evaluate node `id`: env holds the variables, sw the frozen switch branches (None: exact evaluation).
    pub fn eval(&self, id: usize, env: &[f64; ENV_SIZE], sw: Option<&[i8]>) -> f64 {
        match &self.nodes[id] {
            ENode::Const(v) => *v,
            ENode::Var(i) => env[*i],
            ENode::Neg(a) => -self.eval(*a, env, sw),
            ENode::Add(a, b) => self.eval(*a, env, sw) + self.eval(*b, env, sw),
            ENode::Sub(a, b) => self.eval(*a, env, sw) - self.eval(*b, env, sw),
            ENode::Mul(a, b) => self.eval(*a, env, sw) * self.eval(*b, env, sw),
            ENode::Div(a, b) => self.eval(*a, env, sw) / self.eval(*b, env, sw),
            ENode::Pow(a, b) => {
                let x = self.eval(*a, env, sw);
                let y = self.eval(*b, env, sw);
                dmath::pow(x, y)
            }
            ENode::If { k, op, l, r, p, q } => {
                let take = match sw {
                    Some(s) => s[*k] > 0,
                    None => {
                        let lv = self.eval(*l, env, sw);
                        let rv = self.eval(*r, env, sw);
                        match op {
                            CmpOp::Lt => lv < rv,
                            CmpOp::Le => lv <= rv,
                            CmpOp::Gt => lv > rv,
                            CmpOp::Ge => lv >= rv,
                        }
                    }
                };
                if take {
                    self.eval(*p, env, sw)
                } else {
                    self.eval(*q, env, sw)
                }
            }
            ENode::Min { k, a, b } => match sw {
                Some(s) => {
                    if s[*k] > 0 {
                        self.eval(*a, env, sw)
                    } else {
                        self.eval(*b, env, sw)
                    }
                }
                None => {
                    let x = self.eval(*a, env, sw);
                    let y = self.eval(*b, env, sw);
                    js_min(x, y)
                }
            },
            ENode::Max { k, a, b } => match sw {
                Some(s) => {
                    if s[*k] > 0 {
                        self.eval(*a, env, sw)
                    } else {
                        self.eval(*b, env, sw)
                    }
                }
                None => {
                    let x = self.eval(*a, env, sw);
                    let y = self.eval(*b, env, sw);
                    js_max(x, y)
                }
            },
            ENode::Abs { k, a } => match sw {
                Some(s) => {
                    if s[*k] > 0 {
                        self.eval(*a, env, sw)
                    } else {
                        -self.eval(*a, env, sw)
                    }
                }
                None => self.eval(*a, env, sw).abs(),
            },
            ENode::Sign { k, a } => match sw {
                Some(s) => s[*k] as f64,
                None => {
                    let x = self.eval(*a, env, sw);
                    if x > 0.0 {
                        1.0
                    } else if x < 0.0 {
                        -1.0
                    } else if x == 0.0 {
                        0.0
                    } else {
                        f64::NAN
                    }
                }
            },
            ENode::Step { k, a } => match sw {
                Some(s) => {
                    if s[*k] > 0 {
                        1.0
                    } else {
                        0.0
                    }
                }
                None => {
                    let x = self.eval(*a, env, sw);
                    if x >= 0.0 {
                        1.0
                    } else if x < 0.0 {
                        0.0
                    } else {
                        f64::NAN
                    }
                }
            },
            ENode::F1(f, a) => {
                let x = self.eval(*a, env, sw);
                match f {
                    Func1::Sin => dmath::sin(x),
                    Func1::Cos => dmath::cos(x),
                    Func1::Tan => dmath::tan(x),
                    Func1::Asin => dmath::asin(x),
                    Func1::Acos => dmath::acos(x),
                    Func1::Atan => dmath::atan(x),
                    Func1::Sqrt => x.sqrt(),
                    Func1::Exp => dmath::exp(x),
                    Func1::Ln => dmath::log(x),
                    Func1::Lg => dmath::log(x) / ln10(),
                }
            }
            ENode::Atan2(a, b) => {
                let y = self.eval(*a, env, sw);
                let x = self.eval(*b, env, sw);
                dmath::atan2(y, x)
            }
        }
    }

    /// Switching argument of switch `s` (dynamics.switchArg's expression part).
    pub fn switch_arg(&self, s: usize, env: &[f64; ENV_SIZE], sw: Option<&[i8]>) -> f64 {
        match self.switches[s].arg {
            SwitchArg::Diff(a, b) => self.eval(a, env, sw) - self.eval(b, env, sw),
            SwitchArg::Single(a) => self.eval(a, env, sw),
        }
    }
}

/// Branch of a switch for an argument value.
pub fn branch_of(def: &SwitchDef, arg: f64) -> i8 {
    if arg > 0.0 {
        1
    } else if arg < 0.0 {
        -1
    } else {
        def.zero
    }
}

/// Fill the environment of a force acting on dynamic body `i` at state X.
#[inline]
pub fn fill_env(env: &mut [f64; ENV_SIZE], x: &[f64], n: usize, i: usize, time_slot: Option<usize>, mass: f64, g: f64) {
    let vx = x[3 * n + 3 * i];
    let vy = x[3 * n + 3 * i + 1];
    env[0] = match time_slot {
        Some(s) => x[s],
        None => 0.0,
    };
    env[1] = x[3 * i];
    env[2] = x[3 * i + 1];
    env[3] = vx;
    env[4] = vy;
    env[5] = (vx * vx + vy * vy).sqrt();
    env[6] = x[3 * i + 2];
    env[7] = x[3 * n + 3 * i + 2];
    env[8] = mass;
    env[9] = g;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_evaluates() {
        let mut a = ExprArena::default();
        let r = a.compile_force_expr("10*sin(2*pi*t)").unwrap();
        let mut env = [0.0; ENV_SIZE];
        env[0] = 0.25;
        let v = a.eval(r, &env, None);
        assert!((v - 10.0).abs() < 1e-12);
        let r = a.compile_force_expr("if(t < 0.4, 6, -1) + 2*step(t - 0.9)").unwrap();
        assert_eq!(a.switches.len(), 2);
        assert_eq!(a.eval(r, &env, None), 6.0);
        assert!(check_force_expr("x + vx").is_err());
        assert!(check_force_expr("sin(t)").is_err());
        assert!(check_force_expr("2*vx").is_ok());
        assert!(check_force_expr("5.").is_err());
        assert!(check_force_expr(".5*m*g").is_ok());
        assert!(check_force_expr("1e3*m*g").is_ok());
    }
}

// ---- Formula language: evaluation, variables, dimensions (formula/expr.ts, 26.53) ----

/// The display unit of a dimension (first match in UNITS, else the base-unit form) — formula/units.ts unitFor.
pub fn unit_for(d: &Dim) -> String {
    for (u, dim) in UNITS.iter() {
        if *u != "rad" && dim_equal(dim, d) {
            return (*u).to_string();
        }
    }
    format_dim(d)
}

/// Dimension of a unit of UNITS (None for unknown units).
pub fn unit_dim(unit: &str) -> Option<Dim> {
    UNITS.iter().find(|(u, _)| *u == unit).map(|(_, d)| *d)
}

fn sign_of(x: f64) -> f64 {
    if x > 0.0 {
        1.0
    } else if x < 0.0 {
        -1.0
    } else if x == 0.0 {
        0.0
    } else {
        f64::NAN
    }
}

fn step_of(x: f64) -> f64 {
    if x >= 0.0 {
        1.0
    } else if x < 0.0 {
        0.0
    } else {
        f64::NAN
    }
}

/// Hyperbolic tangent through the deterministic exp (stable for large |x|).
pub fn tanh_of(x: f64) -> f64 {
    let e = dmath::exp(-2.0 * x.abs());
    (if x < 0.0 { -1.0 } else { 1.0 }) * (1.0 - e) / (1.0 + e)
}

/// sinh through the deterministic exp; the series near 0 avoids the cancellation of e^x − e^−x.
fn sinh_of(x: f64) -> f64 {
    if x.abs() < 0.1 {
        let x2 = x * x;
        return x * (1.0 + x2 / 6.0 * (1.0 + x2 / 20.0 * (1.0 + x2 / 42.0 * (1.0 + x2 / 72.0))));
    }
    0.5 * (dmath::exp(x) - dmath::exp(-x))
}

/// asinh with the series near 0.
fn asinh_of(x: f64) -> f64 {
    let a = x.abs();
    let r = if a < 0.1 {
        let a2 = a * a;
        a * (1.0 - a2 / 6.0 + 3.0 * a2 * a2 / 40.0 - 15.0 * a2 * a2 * a2 / 336.0 + 105.0 * a2 * a2 * a2 * a2 / 3456.0)
    } else {
        dmath::log(a + (a * a + 1.0).sqrt())
    };
    if x < 0.0 {
        -r
    } else {
        r
    }
}

/// atanh with the series near 0 (NaN outside (−1, 1)).
fn atanh_of(x: f64) -> f64 {
    if !(x > -1.0 && x < 1.0) {
        return f64::NAN;
    }
    if x.abs() < 0.1 {
        let x2 = x * x;
        return x * (1.0 + x2 / 3.0 + x2 * x2 / 5.0 + x2 * x2 * x2 / 7.0 + x2 * x2 * x2 * x2 / 9.0 + x2 * x2 * x2 * x2 * x2 / 11.0);
    }
    0.5 * dmath::log((1.0 + x) / (1.0 - x))
}

/// A function of the formula language applied to evaluated arguments (FUNCS[fn].fn).
pub fn apply_function(name: &str, a: &[f64]) -> f64 {
    match name {
        "sin" => dmath::sin(a[0]),
        "cos" => dmath::cos(a[0]),
        "tan" => dmath::tan(a[0]),
        "asin" => dmath::asin(a[0]),
        "acos" => dmath::acos(a[0]),
        "atan" => dmath::atan(a[0]),
        "atan2" => dmath::atan2(a[0], a[1]),
        "sqrt" => a[0].sqrt(),
        "abs" => a[0].abs(),
        "exp" => dmath::exp(a[0]),
        "tanh" => tanh_of(a[0]),
        "ln" | "log" => dmath::log(a[0]),
        "lg" => dmath::log(a[0]) / dmath::log(10.0),
        "sign" => sign_of(a[0]),
        "step" => step_of(a[0]),
        "clamp" => js_min(js_max(a[0], a[1]), a[2]),
        "ellipK" => crate::numeric::elliptic_k(a[0]),
        "sinh" => sinh_of(a[0]),
        "cosh" => 0.5 * (dmath::exp(a[0]) + dmath::exp(-a[0])),
        "asinh" => asinh_of(a[0]),
        "acosh" => if a[0] >= 1.0 { dmath::log(a[0] + (a[0] * a[0] - 1.0).sqrt()) } else { f64::NAN },
        "atanh" => atanh_of(a[0]),
        "sinc" => if a[0].abs() < 1e-4 { 1.0 - a[0] * a[0] / 6.0 } else { dmath::sin(a[0]) / a[0] },
        "cbrt" => if a[0] < 0.0 { -dmath::pow(-a[0], 1.0 / 3.0) } else { dmath::pow(a[0], 1.0 / 3.0) },
        "floor" => a[0].floor(),
        "ellipF" => crate::numeric::elliptic_f(a[0], a[1]),
        "min" => js_min(a[0], a[1]),
        "max" => js_max(a[0], a[1]),
        _ => f64::NAN,
    }
}

fn compare(op: CmpOp, a: f64, b: f64) -> bool {
    match op {
        CmpOp::Lt => a < b,
        CmpOp::Le => a <= b,
        CmpOp::Gt => a > b,
        CmpOp::Ge => a >= b,
    }
}

/// Evaluate with variable values from `vars` (deterministic math); an unset variable is an error
/// (`expr.unsetVariable`).
pub fn evaluate(node: &Node, vars: &dyn Fn(&str) -> Option<f64>) -> EResult<f64> {
    Ok(match node {
        Node::Num(v) => *v,
        Node::Var(name) => return vars(name).ok_or_else(|| Message::new("expr.unsetVariable").text("name", name.clone())),
        Node::Neg(a) => -evaluate(a, vars)?,
        Node::Bin(op, l, r) => {
            let a = evaluate(l, vars)?;
            let b = evaluate(r, vars)?;
            match op {
                BinOp::Add => a + b,
                BinOp::Sub => a - b,
                BinOp::Mul => a * b,
                BinOp::Div => a / b,
                BinOp::Pow => dmath::pow(a, b),
            }
        }
        Node::Cmp(op, l, r) => {
            if compare(*op, evaluate(l, vars)?, evaluate(r, vars)?) {
                1.0
            } else {
                0.0
            }
        }
        Node::Call(f, args) => {
            if f == "if" {
                // JavaScript truthiness of the condition: 0 and NaN are false
                let c = evaluate(&args[0], vars)?;
                return if c != 0.0 && !c.is_nan() { evaluate(&args[1], vars) } else { evaluate(&args[2], vars) };
            }
            let mut v = Vec::with_capacity(args.len());
            for a in args {
                v.push(evaluate(a, vars)?);
            }
            apply_function(f, &v)
        }
    })
}

/// Evaluate and record the value of every node in pre-order (node, then its children left to right); nodes that
/// are not evaluated (the branch of an `if` not taken) get NaN. The trace lets the interface print a step-by-step
/// solution with the exact doubles of every subtree (formula/solve.ts).
pub fn evaluate_trace(node: &Node, vars: &dyn Fn(&str) -> Option<f64>) -> EResult<Vec<f64>> {
    fn count(n: &Node) -> usize {
        1 + match n {
            Node::Num(_) | Node::Var(_) => 0,
            Node::Neg(a) => count(a),
            Node::Bin(_, l, r) | Node::Cmp(_, l, r) => count(l) + count(r),
            Node::Call(_, args) => args.iter().map(count).sum(),
        }
    }
    fn go(n: &Node, vars: &dyn Fn(&str) -> Option<f64>, out: &mut Vec<f64>, at: usize) -> EResult<f64> {
        let mut child = at + 1;
        let v = match n {
            Node::Num(v) => *v,
            Node::Var(name) => vars(name).ok_or_else(|| Message::new("expr.unsetVariable").text("name", name.clone()))?,
            Node::Neg(a) => -go(a, vars, out, child)?,
            Node::Bin(op, l, r) => {
                let a = go(l, vars, out, child)?;
                child += count(l);
                let b = go(r, vars, out, child)?;
                match op {
                    BinOp::Add => a + b,
                    BinOp::Sub => a - b,
                    BinOp::Mul => a * b,
                    BinOp::Div => a / b,
                    BinOp::Pow => dmath::pow(a, b),
                }
            }
            Node::Cmp(op, l, r) => {
                let a = go(l, vars, out, child)?;
                child += count(l);
                let b = go(r, vars, out, child)?;
                if compare(*op, a, b) {
                    1.0
                } else {
                    0.0
                }
            }
            Node::Call(f, args) => {
                if f == "if" {
                    let c = go(&args[0], vars, out, child)?;
                    let c1 = child + count(&args[0]);
                    let c2 = c1 + count(&args[1]);
                    if c != 0.0 && !c.is_nan() {
                        go(&args[1], vars, out, c1)?
                    } else {
                        go(&args[2], vars, out, c2)?
                    }
                } else {
                    let mut v = Vec::with_capacity(args.len());
                    for a in args {
                        v.push(go(a, vars, out, child)?);
                        child += count(a);
                    }
                    apply_function(f, &v)
                }
            }
        };
        out[at] = v;
        Ok(v)
    }
    let mut out = vec![f64::NAN; count(node)];
    go(node, vars, &mut out, 0)?;
    Ok(out)
}

/// Names of the variables used, in first-use order (a JavaScript Set).
pub fn variables(node: &Node, out: &mut Vec<String>) {
    match node {
        Node::Var(name) => {
            if !out.iter().any(|v| v == name) {
                out.push(name.clone());
            }
        }
        Node::Neg(a) => variables(a, out),
        Node::Bin(_, l, r) | Node::Cmp(_, l, r) => {
            variables(l, out);
            variables(r, out);
        }
        Node::Call(_, args) => {
            for a in args {
                variables(a, out);
            }
        }
        Node::Num(_) => {}
    }
}

/// Unit name of a dimension for formula messages ('无量纲' for pure numbers) — formula/expr.ts dimName.
fn formula_dim_name(d: &Dim) -> String {
    if dim_equal(d, &DIMLESS) {
        "无量纲".into()
    } else {
        unit_for(d)
    }
}

/// Physical dimension of a library expression; errors on inconsistent sums or dimensioned function arguments
/// (formula/expr.ts dimension).
pub fn dimension(node: &Node, dims: &dyn Fn(&str) -> Option<Dim>) -> EResult<Dim> {
    fn same(args: &[Dim], what: String) -> EResult<Dim> {
        for a in args {
            if !dim_equal(a, &args[0]) {
                return Err(Message::new("{0} 的参数量纲不同：{1} 与 {2}").text("0", what).text("1", formula_dim_name(&args[0])).text("2", formula_dim_name(a)));
            }
        }
        Ok(args[0])
    }
    match node {
        Node::Num(_) => Ok(DIMLESS),
        Node::Var(name) => dims(name).ok_or_else(|| Message::new("变量 {0} 没有量纲").text("0", name.clone())),
        Node::Neg(a) => dimension(a, dims),
        Node::Cmp(op, l, r) => {
            let a = dimension(l, dims)?;
            let b = dimension(r, dims)?;
            same(&[a, b], format!("比较 {}", op.text()))?;
            Ok(DIMLESS)
        }
        Node::Bin(op, l, r) => {
            let a = dimension(l, dims)?;
            if *op == BinOp::Pow {
                return match exponent_of(r) {
                    None => {
                        if !dim_equal(&a, &DIMLESS) {
                            return Err(Message::new("有量纲的量只能取数字次幂"));
                        }
                        Ok(DIMLESS)
                    }
                    Some(p) => Ok(dim_pow(&a, p)),
                };
            }
            let b = dimension(r, dims)?;
            match op {
                BinOp::Add | BinOp::Sub => {
                    if !dim_equal(&a, &b) {
                        return Err(Message::new("量纲不一致：{0} {1} {2}").text("0", format_dim(&a)).text("1", if *op == BinOp::Add { "+" } else { "-" }).text("2", format_dim(&b)));
                    }
                    Ok(a)
                }
                BinOp::Mul => Ok(dim_mul(&a, &b)),
                _ => Ok(dim_mul(&a, &dim_pow(&b, -1.0))),
            }
        }
        Node::Call(f, args) => {
            if f == "if" {
                dimension(&args[0], dims)?;
                let a = dimension(&args[1], dims)?;
                let b = dimension(&args[2], dims)?;
                return same(&[a, b], "if".into());
            }
            let mut d = Vec::with_capacity(args.len());
            for a in args {
                d.push(dimension(a, dims)?);
            }
            match f.as_str() {
                "sqrt" => Ok(dim_pow(&d[0], 0.5)),
                "cbrt" => Ok(dim_pow(&d[0], 1.0 / 3.0)),
                "abs" => Ok(d[0]),
                "sign" | "step" => Ok(DIMLESS),
                "min" | "max" | "clamp" => same(&d, f.clone()),
                "atan2" => {
                    same(&d, f.clone())?;
                    Ok(DIMLESS)
                }
                _ => {
                    for a in &d {
                        if !dim_equal(a, &DIMLESS) {
                            return Err(Message::new("{0} 的参数必须无量纲，实为 {1}").text("0", f.clone()).text("1", format_dim(a)));
                        }
                    }
                    Ok(DIMLESS)
                }
            }
        }
    }
}
