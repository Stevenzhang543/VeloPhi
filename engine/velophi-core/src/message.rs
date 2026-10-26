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
