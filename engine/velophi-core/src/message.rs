//! User-facing messages as keys with parameters (decision D27). The core never writes natural language: every
//! warning and error is `{ key, params }`, translated by the interface. `engine/MESSAGES.md` lists every key
//! with the Chinese text of the TypeScript engine it replaces.

use serde_json::{Map, Value};

/// A message parameter.
#[derive(Clone, Debug, PartialEq)]
pub enum Param {
    /// A number in SI units (formatting is the interface's business).
    Num(f64),
    /// A name or id.
    Str(String),
    /// A list of names (joined by the interface).
    List(Vec<String>),
    /// A nested message (e.g. the reason of a fallback).
    Msg(Box<Message>),
}

/// A warning or error: a key and named parameters, in a fixed order.
#[derive(Clone, Debug, PartialEq)]
pub struct Message {
    pub key: &'static str,
    pub params: Vec<(&'static str, Param)>,
}

impl Message {
    /// A message without parameters.
    pub fn new(key: &'static str) -> Self {
        Message { key, params: Vec::new() }
    }

    /// Add a numeric parameter.
    pub fn num(mut self, name: &'static str, v: f64) -> Self {
        self.params.push((name, Param::Num(v)));
        self
    }

    /// Add a text parameter.
    pub fn text(mut self, name: &'static str, v: impl Into<String>) -> Self {
        self.params.push((name, Param::Str(v.into())));
        self
    }

    /// Add a list parameter.
    pub fn list(mut self, name: &'static str, v: Vec<String>) -> Self {
        self.params.push((name, Param::List(v)));
        self
    }

    /// Add a nested message.
    pub fn msg(mut self, name: &'static str, m: Message) -> Self {
        self.params.push((name, Param::Msg(Box::new(m))));
        self
    }

    /// JSON form `{ "key": …, "params": { … } }`; non-finite numbers are written as the strings "Infinity",
    /// "-Infinity" and "NaN".
    pub fn to_json(&self) -> Value {
        let mut params = Map::new();
        for (name, p) in &self.params {
            params.insert((*name).to_string(), param_json(p));
        }
        let mut m = Map::new();
        m.insert("key".into(), Value::String(self.key.to_string()));
        m.insert("params".into(), Value::Object(params));
        Value::Object(m)
    }
}

fn param_json(p: &Param) -> Value {
    match p {
        Param::Num(v) => num_json(*v),
        Param::Str(s) => Value::String(s.clone()),
        Param::List(l) => Value::Array(l.iter().map(|s| Value::String(s.clone())).collect()),
        Param::Msg(m) => m.to_json(),
    }
}

/// A number as JSON; non-finite values become the strings "Infinity", "-Infinity", "NaN".
pub fn num_json(v: f64) -> Value {
    if v.is_finite() {
        serde_json::Number::from_f64(v).map(Value::Number).unwrap_or(Value::Null)
    } else if v.is_nan() {
        Value::String("NaN".into())
    } else if v > 0.0 {
        Value::String("Infinity".into())
    } else {
        Value::String("-Infinity".into())
    }
}

/// Result type of the solver: errors are messages.
pub type SimResult<T> = Result<T, Message>;

/// A translatable text whose key is the Chinese source text (26.53, D67): the interface renders it with `tl(key,
/// params)`, positional parameters named "0", "1", …. `scripts/i18n-keys.mjs` collects the keys from `tx("…")`.
pub fn tx(key: &'static str) -> Message {
    Message::new(key)
}

/// A text shown to the user: a literal (names, ids, symbols) or a translatable message.
#[derive(Clone, Debug, PartialEq)]
pub enum Text {
    Lit(String),
    Msg(Message),
}

impl Text {
    /// JSON: a string for a literal, `{ key, params }` for a message.
    pub fn to_json(&self) -> Value {
        match self {
            Text::Lit(s) => Value::String(s.clone()),
            Text::Msg(m) => m.to_json(),
        }
    }
}

impl From<Message> for Text {
    fn from(m: Message) -> Self {
        Text::Msg(m)
    }
}

impl From<String> for Text {
    fn from(s: String) -> Self {
        Text::Lit(s)
    }
}

impl From<&str> for Text {
    fn from(s: &str) -> Self {
        Text::Lit(s.to_string())
    }
}

const POSITIONAL: [&str; 32] = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31"];

impl From<&str> for Param {
    fn from(s: &str) -> Self {
        Param::Str(s.to_string())
    }
}
impl From<&String> for Param {
    fn from(s: &String) -> Self {
        Param::Str(s.clone())
    }
}
impl From<String> for Param {
    fn from(s: String) -> Self {
        Param::Str(s)
    }
}
impl From<f64> for Param {
    fn from(v: f64) -> Self {
        Param::Num(v)
    }
}
impl From<Message> for Param {
    fn from(m: Message) -> Self {
        Param::Msg(Box::new(m))
    }
}
impl From<Text> for Param {
    fn from(t: Text) -> Self {
        match t {
            Text::Lit(s) => Param::Str(s),
            Text::Msg(m) => Param::Msg(Box::new(m)),
        }
    }
}

impl Message {
    /// Add positional parameter `i` ("0" … "31").
    pub fn arg(mut self, i: usize, v: impl Into<Param>) -> Self {
        self.params.push((POSITIONAL[i], v.into()));
        self
    }
}

impl Text {
    /// The empty text.
    pub fn empty() -> Text {
        Text::Lit(String::new())
    }
    /// Is this the empty literal?
    pub fn is_empty(&self) -> bool {
        matches!(self, Text::Lit(s) if s.is_empty())
    }
}

/// A translatable text with positional parameters: `t!("{0}质量", name)`.
#[macro_export]
macro_rules! t {
    ($k:expr) => { $crate::message::Text::Msg($crate::message::tx($k)) };
    ($k:expr, $($a:expr),+ $(,)?) => {{
        let mut m = $crate::message::tx($k);
        let mut i = 0usize;
        $( m = m.arg(i, $a); i += 1; )+
        let _ = i;
        $crate::message::Text::Msg(m)
    }};
}

/// Texts joined for the interface: `$join` with a separator kind (semi '；'/'; ', list '、'/', ', colon '：'/': ',
/// none) — rendered by the interface in the current language.
pub fn t_join(items: Vec<Text>, sep: &'static str) -> Text {
    let mut m = Message::new("$join").text("sep", sep);
    for (i, it) in items.into_iter().enumerate() {
        m = m.arg(i, it);
    }
    Text::Msg(m)
}

/// A text in parentheses ('（x）' in Chinese, ' (x)' otherwise).
pub fn t_paren(x: Text) -> Text {
    Text::Msg(Message::new("$paren").arg(0, x))
}
