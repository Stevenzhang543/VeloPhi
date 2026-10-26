//! Scene document (port of `src/core/scene/types.ts` and the reading half of `io.ts`): the JSON the TypeScript
//! app writes — files of format 1–3 and the in-memory scene the worker receives — parsed, migrated and validated
//! with the same defaults and checks. Only what the solver needs is kept (names, ids, physics, settings).
//!
//! JSON cannot carry −0 (`JSON.stringify(-0)` is "0"); the string "-0" is read as −0 wherever a number is
//! expected, so the loader can pass the scene object of a structured clone bit for bit (engine/ABI.md).

use crate::expr::check_force_expr;
use crate::message::Message;
use crate::model::polygon_is_simple;
use serde_json::Value;

/// A 2D vector or point (m, m/s, N …).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Vec2 {
    pub x: f64,
    pub y: f64,
}

impl Vec2 {
    /// Construct a vector.
    pub const fn new(x: f64, y: f64) -> Self {
        Vec2 { x, y }
    }
}

/// Shape of a body in body coordinates (m).
#[derive(Clone, Debug, PartialEq)]
pub enum ShapeDef {
    Circle {
        radius: f64,
    },
    Box {
        width: f64,
        height: f64,
    },
    /// Simple polygon (convex, or since 26.52 concave), counter-clockwise.
    Polygon {
        points: Vec<Vec2>,
    },
    /// Compound shape (26.52, D35): parts (never compound themselves) placed in body coordinates.
    Compound {
        parts: Vec<ShapePart>,
    },
}

/// A part of a compound shape: its shape, the position of its origin and its angle.
#[derive(Clone, Debug, PartialEq)]
pub struct ShapePart {
    pub shape: ShapeDef,
    pub position: Vec2,
    pub angle: f64,
}

/// Particle (translation only), rigid body, or static body.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BodyKind {
    Particle,
    Rigid,
    Static,
}

/// Contact material of a body.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Material {
    pub mu_s: f64,
    pub mu_k: f64,
    pub restitution: f64,
    /// Rolling resistance coefficient C_rr (26.52, D59); 0: none (absent in the file).
    pub rolling: f64,
}

/// Air drag on a body (26.51, D50): F = −(linear + quadratic·|v|)·v at the centre of mass.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct DragDef {
    pub linear: f64,
    pub quadratic: f64,
}

/// A body as authored.
#[derive(Clone, Debug, PartialEq)]
pub struct BodyDef {
    pub id: String,
    pub name: String,
    pub kind: BodyKind,
    pub shape: ShapeDef,
    pub position: Vec2,
    pub angle: f64,
    pub velocity: Vec2,
    pub angular_velocity: f64,
    pub mass: f64,
    pub inertia: Option<f64>,
    pub fixed_rotation: bool,
    pub material: Material,
    pub belt_speed: f64,
    /// Air drag (26.51); None: none.
    pub drag: Option<DragDef>,
}

/// Pulley wheel: fixed in the world, or carried by a body (`body`).
#[derive(Clone, Debug, PartialEq)]
pub struct PulleyDef {
    pub id: String,
    pub name: String,
    pub position: Vec2,
    pub radius: f64,
    pub body: Option<String>,
}

/// A point on a body (local coordinates) or in the world (body None).
#[derive(Clone, Debug, PartialEq)]
pub struct Anchor {
    pub body: Option<String>,
    pub local: Vec2,
}

/// Wrap direction of a rope around a pulley.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Wrap {
    Cw,
    Ccw,
}

/// A connector between anchors.
#[derive(Clone, Debug, PartialEq)]
pub enum ConnectorKind {
    Rope {
        a: Anchor,
        b: Anchor,
        pulleys: Vec<(String, Wrap)>,
        length: Option<f64>,
    },
    Rod {
        a: Anchor,
        b: Anchor,
        length: Option<f64>,
    },
    /// `cubic`: k₃ of a nonlinear spring (26.51; 0: linear).
    Spring {
        a: Anchor,
        b: Anchor,
        stiffness: f64,
        rest_length: Option<f64>,
        damping: f64,
        cubic: f64,
    },
    Hinge {
        a: Anchor,
        b: Anchor,
    },
    Force {
        a: Anchor,
        force: Vec2,
        expr: Option<(String, String)>,
    },
    /// Connectors of 26.51 (D51): damper, weld, slider (prismatic joint), motor and gear.
    Damper {
        a: Anchor,
        b: Anchor,
        damping: f64,
    },
    Weld {
        a: Anchor,
        b: Anchor,
    },
    /// `limits` (26.52, D58): (min, max, restitution) of the end stops, None for a side without one.
    Slider {
        a: Anchor,
        b: Anchor,
        axis: Vec2,
        free: bool,
        limits: Option<(Option<f64>, Option<f64>, f64)>,
    },
    /// `torque_mode`: constant torque `torque`; otherwise constant relative angular velocity `speed`, at most
    /// `max_torque` (26.52, D58; None: unlimited).
    Motor {
        a: Anchor,
        b: Anchor,
        torque_mode: bool,
        speed: f64,
        torque: f64,
        max_torque: Option<f64>,
    },
    Gear {
        a: Anchor,
        b: Anchor,
        ratio: f64,
    },
    /// Central field (26.52, D60): F = k·rⁿ towards `a` on the targets (None: every dynamic body but the carrier).
    Central {
        a: Anchor,
        k: f64,
        n: f64,
        targets: Option<Vec<String>>,
    },
}

/// A connector with its id and name.
#[derive(Clone, Debug, PartialEq)]
pub struct ConnectorDef {
    pub id: String,
    pub name: String,
    pub kind: ConnectorKind,
}

/// Material override for a pair of bodies.
#[derive(Clone, Debug, PartialEq)]
pub struct ContactPairDef {
    pub a: String,
    pub b: String,
    pub mu_s: f64,
    pub mu_k: f64,
    pub restitution: f64,
    /// Rolling resistance of the pair (26.52); None: the larger of the two bodies' values.
    pub rolling: Option<f64>,
}

/// Integrator of the scene.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum IntegratorKind {
    Dopri5,
    Rk4,
    Euler,
    Moreau,
    /// Two-stage Gauss–Legendre (26.52, D61).
    Gauss4,
}

/// Kind of state change after which a run may stop.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StopKind {
    Stick,
    Slip,
    Separate,
    Touch,
    Impact,
    Slack,
    Taut,
}

impl StopKind {
    fn parse(s: &str) -> Option<StopKind> {
        Some(match s {
            "stick" => StopKind::Stick,
            "slip" => StopKind::Slip,
            "separate" => StopKind::Separate,
            "touch" => StopKind::Touch,
            "impact" => StopKind::Impact,
            "slack" => StopKind::Slack,
            "taut" => StopKind::Taut,
            _ => return None,
        })
    }

    /// The change type of the same name.
    pub fn name(self) -> &'static str {
        match self {
            StopKind::Stick => "stick",
            StopKind::Slip => "slip",
            StopKind::Separate => "separate",
            StopKind::Touch => "touch",
            StopKind::Impact => "impact",
            StopKind::Slack => "slack",
            StopKind::Taut => "taut",
        }
    }
}

/// Stop `after` seconds after the first event with a change of kind `on`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct StopAtDef {
    pub on: StopKind,
    pub after: f64,
}

/// Longest finite duration and stop delay (s).
pub const MAX_DURATION: f64 = 3600.0;

/// Global simulation settings.
#[derive(Clone, Debug, PartialEq)]
pub struct SceneSettings {
    pub gravity: Vec2,
    pub output_step: f64,
    pub integrator: IntegratorKind,
    pub rel_tol: f64,
    pub abs_tol: f64,
    /// None: unbounded.
    pub duration: Option<f64>,
    pub stop_at: Option<StopAtDef>,
    pub legacy_duration: f64,
    pub energy_zero_y: f64,
    /// Gravitational constant G of gravitation between bodies (26.51, D50); None: off.
    pub gravitation: Option<f64>,
    /// Start time of a branch (26.51, D52): variable forces see start_time + t; 0 for ordinary scenes.
    pub start_time: f64,
    /// Energy ledger at the start of a branch (D52); None: all zero.
    pub start_ledger: Option<StartLedger>,
}

/// Initial values of the energy ledger (26.51, D52).
#[derive(Clone, Debug, PartialEq)]
pub struct StartLedger {
    pub friction_heat: f64,
    pub applied_work: f64,
    pub damping: f64,
    pub belt_work: f64,
    pub impact_loss: f64,
    /// (pair key, sliding distance, friction heat) in file order.
    pub pairs: Vec<(String, f64, f64)>,
}

impl SceneSettings {
    /// The duration of a bounded run: `duration`, or `legacyDuration` when unbounded.
    pub fn finite_duration(&self) -> f64 {
        self.duration.unwrap_or(self.legacy_duration)
    }
}

/// The parts of a scene the solver uses.
#[derive(Clone, Debug, PartialEq)]
pub struct Scene {
    pub name: String,
    pub settings: SceneSettings,
    pub bodies: Vec<BodyDef>,
    pub pulleys: Vec<PulleyDef>,
    pub connectors: Vec<ConnectorDef>,
    pub contact_pairs: Vec<ContactPairDef>,
}

/// Current scene file format version.
pub const SCENE_VERSION: f64 = 5.0;
/// Default gravity magnitude of new scenes (m/s²).
pub const DEFAULT_G: f64 = 9.8;

type PResult<T> = Result<T, Message>;

fn err_path(key: &'static str, path: &str) -> Message {
    Message::new(key).text("path", path)
}

/// A number: a JSON number, or the string "-0" (−0, which JSON cannot carry).
fn as_number(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => n.as_f64(),
        Value::String(s) if s == "-0" => Some(-0.0),
        _ => None,
    }
}

fn num(v: Option<&Value>, path: &str, def: Option<f64>) -> PResult<f64> {
    match v {
        None => def.ok_or_else(|| err_path("scene.notNumber", path)),
        Some(v) => match as_number(v) {
            Some(x) if x.is_finite() => Ok(x),
            _ => Err(err_path("scene.notNumber", path)),
        },
    }
}

fn text(v: Option<&Value>, path: &str, def: Option<&str>) -> PResult<String> {
    match v {
        None => def.map(|s| s.to_string()).ok_or_else(|| err_path("scene.notText", path)),
        Some(Value::String(s)) => Ok(s.clone()),
        Some(_) => Err(err_path("scene.notText", path)),
    }
}

fn vec2(v: Option<&Value>, path: &str, def: Option<Vec2>) -> PResult<Vec2> {
    match v {
        None => def.ok_or_else(|| err_path("scene.notVector", path)),
        Some(Value::Object(o)) => Ok(Vec2 { x: num(o.get("x"), &format!("{path}.x"), None)?, y: num(o.get("y"), &format!("{path}.y"), None)? }),
        Some(_) => Err(err_path("scene.notVector", path)),
    }
}

/// JavaScript truthiness of a JSON value (`!!value`).
fn truthy(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().is_some_and(|x| x != 0.0 && !x.is_nan()),
        Some(Value::String(s)) => !s.is_empty(),
        Some(_) => true,
    }
}

/// `value ?? fallback` for objects: missing and null give None.
fn present(v: Option<&Value>) -> Option<&Value> {
    match v {
        None | Some(Value::Null) => None,
        Some(v) => Some(v),
    }
}

/// Parse, migrate and validate scene JSON text. Returns the scene and the warnings of loading.
pub fn parse_scene(text_in: &str) -> PResult<(Scene, Vec<Message>)> {
    let raw: Value = serde_json::from_str(text_in).map_err(|e| Message::new("scene.invalidJson").text("detail", e.to_string()))?;
    parse_scene_value(&raw)
}

/// Parse, migrate and validate a scene given as a JSON value (see `parse_scene`).
pub fn parse_scene_value(raw: &Value) -> PResult<(Scene, Vec<Message>)> {
    let mut doc = match raw {
        Value::Object(o) => o.clone(),
        _ => return Err(Message::new("scene.notScene")),
    };
    // "verity-scene": files saved before the rename to VeloPhi (26.52, D53)
    if !matches!(doc.get("format").and_then(|v| v.as_str()), Some("velophi-scene") | Some("verity-scene")) {
        return Err(Message::new("scene.wrongFormat"));
    }
    let mut warnings = Vec::new();
    let mut version = num(doc.get("version"), "version", None)?;
    if version > SCENE_VERSION {
        warnings.push(Message::new("scene.newerVersion").num("version", version));
    }
    while version < SCENE_VERSION {
        if version == 1.0 {
            if present(doc.get("annotations")).is_none() {
                doc.insert("annotations".into(), Value::Array(vec![]));
            }
        } else if version == 2.0 {
            let mut st = match doc.get("settings") {
                Some(Value::Object(o)) => o.clone(),
                _ => serde_json::Map::new(),
            };
            if present(st.get("duration")).is_none() {
                st.insert("duration".into(), Value::from(5));
            }
            let d = st.get("duration").cloned().unwrap_or(Value::Null);
            st.insert("legacyDuration".into(), d);
            st.insert("stopAt".into(), Value::Null);
            doc.insert("settings".into(), Value::Object(st));
        } else if version == 3.0 || version == 4.0 {
            // 26.50 -> 26.51 and 26.51 -> 26.52: the new physics are optional fields; nothing to change
        } else {
            return Err(Message::new("scene.cannotMigrate").num("version", version));
        }
        version += 1.0;
    }
    let empty = serde_json::Map::new();
    let st = match doc.get("settings") {
        Some(Value::Object(o)) => o,
        _ => &empty,
    };
    let integrator = match st.get("integrator").and_then(|v| v.as_str()) {
        Some("rk4") => IntegratorKind::Rk4,
        Some("euler") => IntegratorKind::Euler,
        Some("moreau") => IntegratorKind::Moreau,
        Some("gauss4") => IntegratorKind::Gauss4,
        _ => IntegratorKind::Dopri5,
    };
    let duration = match st.get("duration") {
        None | Some(Value::Null) => None,
        v => Some(num(v, "settings.duration", None)?),
    };
    let stop_at = match st.get("stopAt") {
        None | Some(Value::Null) => None,
        Some(Value::Object(o)) => {
            let on = o.get("on").and_then(|v| v.as_str()).and_then(StopKind::parse).ok_or_else(|| Message::new("scene.stopAtUnknown"))?;
            Some(StopAtDef { on, after: num(o.get("after"), "settings.stopAt.after", None)? })
        }
        Some(_) => return Err(Message::new("scene.stopAtUnknown")),
    };
    let legacy_default = match st.get("duration").and_then(as_number) {
        Some(d) if matches!(st.get("duration"), Some(Value::Number(_))) => d,
        _ => 5.0,
    };
    let settings = SceneSettings {
        gravity: vec2(st.get("gravity"), "settings.gravity", Some(Vec2::new(0.0, -DEFAULT_G)))?,
        output_step: num(st.get("outputStep"), "settings.outputStep", Some(1.0 / 600.0))?,
        integrator,
        rel_tol: num(st.get("relTol"), "settings.relTol", Some(1e-10))?,
        abs_tol: num(st.get("absTol"), "settings.absTol", Some(1e-12))?,
        duration,
        stop_at,
        legacy_duration: num(st.get("legacyDuration"), "settings.legacyDuration", Some(legacy_default))?,
        energy_zero_y: num(st.get("energyZeroY"), "settings.energyZeroY", Some(0.0))?,
        gravitation: match st.get("gravitation") {
            Some(Value::Object(o)) => Some(num(o.get("G"), "settings.gravitation.G", None)?),
            _ => None,
        },
        start_time: match st.get("startTime") {
            None | Some(Value::Null) => 0.0,
            v => num(v, "settings.startTime", None)?,
        },
        start_ledger: match st.get("startLedger") {
            Some(Value::Object(o)) => {
                let mut pairs = Vec::new();
                if let Some(Value::Object(ps)) = o.get("pairs") {
                    for (k, v) in ps {
                        let path = format!("settings.startLedger.pairs.{k}");
                        let arr = v.as_array().filter(|a| a.len() == 2).ok_or_else(|| err_path("scene.notNumber", &path))?;
                        pairs.push((k.clone(), num(arr.first(), &path, None)?, num(arr.get(1), &path, None)?));
                    }
                }
                Some(StartLedger {
                    friction_heat: num(o.get("frictionHeat"), "settings.startLedger.frictionHeat", Some(0.0))?,
                    applied_work: num(o.get("appliedWork"), "settings.startLedger.appliedWork", Some(0.0))?,
                    damping: num(o.get("damping"), "settings.startLedger.damping", Some(0.0))?,
                    belt_work: num(o.get("beltWork"), "settings.startLedger.beltWork", Some(0.0))?,
                    impact_loss: num(o.get("impactLoss"), "settings.startLedger.impactLoss", Some(0.0))?,
                    pairs,
                })
            }
            _ => None,
        },
    };
    let mut bodies = Vec::new();
    if let Some(list) = present(doc.get("bodies")) {
        let list = list.as_array().ok_or_else(|| Message::new("scene.notList").text("path", "bodies"))?;
        for (i, b) in list.iter().enumerate() {
            bodies.push(parse_body(b, &format!("bodies[{i}]"))?);
        }
    }
    let mut pulleys = Vec::new();
    if let Some(list) = present(doc.get("pulleys")) {
        let list = list.as_array().ok_or_else(|| Message::new("scene.notList").text("path", "pulleys"))?;
        for (i, p) in list.iter().enumerate() {
            let o = p.as_object().ok_or_else(|| err_path("scene.notObject", &format!("pulleys[{i}]")))?;
            pulleys.push(PulleyDef {
                id: text(o.get("id"), &format!("pulleys[{i}].id"), None)?,
                name: text(o.get("name"), &format!("pulleys[{i}].name"), Some("滑轮"))?,
                position: vec2(o.get("position"), &format!("pulleys[{i}].position"), None)?,
                radius: num(o.get("radius"), &format!("pulleys[{i}].radius"), Some(0.0))?,
                body: match o.get("body") {
                    Some(Value::String(s)) if !s.is_empty() => Some(s.clone()),
                    _ => None,
                },
            });
        }
    }
    let mut connectors = Vec::new();
    if let Some(list) = present(doc.get("connectors")) {
        let list = list.as_array().ok_or_else(|| Message::new("scene.notList").text("path", "connectors"))?;
        for (i, c) in list.iter().enumerate() {
            connectors.push(parse_connector(c, &format!("connectors[{i}]"))?);
        }
    }
    let mut contact_pairs = Vec::new();
    if let Some(list) = present(doc.get("contactPairs")) {
        let list = list.as_array().ok_or_else(|| Message::new("scene.notList").text("path", "contactPairs"))?;
        for (i, p) in list.iter().enumerate() {
            let o = p.as_object().ok_or_else(|| err_path("scene.notObject", &format!("contactPairs[{i}]")))?;
            contact_pairs.push(ContactPairDef {
                a: text(o.get("a"), &format!("contactPairs[{i}].a"), None)?,
                b: text(o.get("b"), &format!("contactPairs[{i}].b"), None)?,
                mu_s: num(o.get("muS"), "muS", None)?,
                mu_k: num(o.get("muK"), "muK", None)?,
                restitution: num(o.get("restitution"), "restitution", None)?,
                rolling: opt_num(o.get("rolling"), &format!("contactPairs[{i}].rolling"))?,
            });
        }
    }
    let scene = Scene { name: text(doc.get("name"), "name", Some("未命名场景"))?, settings, bodies, pulleys, connectors, contact_pairs };
    validate_scene(&scene)?;
    Ok((scene, warnings))
}

/// A shape that may be a part of a compound shape (`path` ends in ".shape").
fn parse_part_shape(shape: &serde_json::Map<String, Value>, path: &str) -> PResult<ShapeDef> {
    Ok(match shape.get("type").and_then(|v| v.as_str()) {
        Some("circle") => ShapeDef::Circle { radius: num(shape.get("radius"), &format!("{path}.radius"), None)? },
        Some("box") => ShapeDef::Box {
            width: num(shape.get("width"), &format!("{path}.width"), None)?,
            height: num(shape.get("height"), &format!("{path}.height"), None)?,
        },
        Some("polygon") => {
            let pts = shape.get("points").and_then(|p| p.as_array()).ok_or_else(|| err_path("scene.notList", &format!("{path}.points")))?;
            let mut points = Vec::with_capacity(pts.len());
            for (i, p) in pts.iter().enumerate() {
                points.push(vec2(Some(p), &format!("{path}.points[{i}]"), None)?);
            }
            ShapeDef::Polygon { points }
        }
        _ => return Err(err_path("scene.shapeUnknown", &format!("{path}.type"))),
    })
}

fn parse_body(v: &Value, path: &str) -> PResult<BodyDef> {
    let b = v.as_object().ok_or_else(|| err_path("scene.notObject", path))?;
    let shape = match b.get("shape") {
        Some(Value::Object(o)) => o,
        _ => return Err(err_path("scene.shapeMissing", &format!("{path}.shape"))),
    };
    let s = if shape.get("type").and_then(|v| v.as_str()) == Some("compound") {
        // 26.52 (D35): parts with their placement
        let list = shape.get("parts").and_then(|p| p.as_array()).ok_or_else(|| err_path("scene.notList", &format!("{path}.shape.parts")))?;
        let mut parts = Vec::with_capacity(list.len());
        for (i, p) in list.iter().enumerate() {
            let pp = format!("{path}.shape.parts[{i}]");
            let o = p.as_object().ok_or_else(|| err_path("scene.shapeMissing", &format!("{pp}.shape")))?;
            let ps = match o.get("shape") {
                Some(Value::Object(x)) => x,
                _ => return Err(err_path("scene.shapeMissing", &format!("{pp}.shape"))),
            };
            parts.push(ShapePart {
                shape: parse_part_shape(ps, &format!("{pp}.shape"))?,
                position: vec2(o.get("position"), &format!("{pp}.position"), Some(Vec2::default()))?,
                angle: num(o.get("angle"), &format!("{pp}.angle"), Some(0.0))?,
            });
        }
        ShapeDef::Compound { parts }
    } else {
        parse_part_shape(shape, &format!("{path}.shape"))?
    };
    let empty = serde_json::Map::new();
    let mat = match present(b.get("material")) {
        Some(Value::Object(o)) => o,
        _ => &empty,
    };
    let kind = match b.get("kind").and_then(|v| v.as_str()) {
        Some("particle") => BodyKind::Particle,
        Some("static") => BodyKind::Static,
        _ => BodyKind::Rigid,
    };
    Ok(BodyDef {
        id: text(b.get("id"), &format!("{path}.id"), None)?,
        name: text(b.get("name"), &format!("{path}.name"), Some("物体"))?,
        kind,
        shape: s,
        position: vec2(b.get("position"), &format!("{path}.position"), None)?,
        angle: num(b.get("angle"), &format!("{path}.angle"), Some(0.0))?,
        velocity: vec2(b.get("velocity"), &format!("{path}.velocity"), Some(Vec2::default()))?,
        angular_velocity: num(b.get("angularVelocity"), &format!("{path}.angularVelocity"), Some(0.0))?,
        mass: num(b.get("mass"), &format!("{path}.mass"), Some(if kind == BodyKind::Static { 0.0 } else { 1.0 }))?,
        inertia: match b.get("inertia") {
            None | Some(Value::Null) => None,
            v => Some(num(v, &format!("{path}.inertia"), None)?),
        },
        fixed_rotation: truthy(b.get("fixedRotation")),
        material: Material {
            mu_s: num(mat.get("muS"), &format!("{path}.material.muS"), Some(0.0))?,
            mu_k: num(mat.get("muK"), &format!("{path}.material.muK"), Some(0.0))?,
            restitution: num(mat.get("restitution"), &format!("{path}.material.restitution"), Some(0.0))?,
            rolling: opt_num(mat.get("rolling"), &format!("{path}.material.rolling"))?.unwrap_or(0.0),
        },
        belt_speed: num(b.get("beltSpeed"), &format!("{path}.beltSpeed"), Some(0.0))?,
        drag: match b.get("drag") {
            Some(Value::Object(d)) => Some(DragDef {
                linear: num(d.get("linear"), &format!("{path}.drag.linear"), Some(0.0))?,
                quadratic: num(d.get("quadratic"), &format!("{path}.drag.quadratic"), Some(0.0))?,
            }),
            _ => None,
        },
    })
}

fn parse_anchor(v: Option<&Value>, path: &str) -> PResult<Anchor> {
    let o = match v {
        Some(Value::Object(o)) => o,
        _ => return Err(err_path("scene.notObject", path)),
    };
    let body = match o.get("body") {
        Some(Value::String(s)) if !s.is_empty() => Some(s.clone()),
        _ => None,
    };
    Ok(Anchor { body, local: vec2(o.get("local"), &format!("{path}.local"), None)? })
}

/// A length that may be null ("the initial value").
fn opt_num(v: Option<&Value>, path: &str) -> PResult<Option<f64>> {
    match v {
        None | Some(Value::Null) => Ok(None),
        v => Ok(Some(num(v, path, None)?)),
    }
}

fn parse_connector(v: &Value, path: &str) -> PResult<ConnectorDef> {
    let c = v.as_object().ok_or_else(|| err_path("scene.notObject", path))?;
    let id = text(c.get("id"), &format!("{path}.id"), None)?;
    let name = text(c.get("name"), &format!("{path}.name"), Some(""))?;
    let kind = match c.get("type").and_then(|v| v.as_str()) {
        Some("rope") => {
            let list = c.get("pulleys").and_then(|p| p.as_array()).ok_or_else(|| err_path("scene.notList", &format!("{path}.pulleys")))?;
            let mut pulleys = Vec::with_capacity(list.len());
            for (i, p) in list.iter().enumerate() {
                let o = p.as_object().ok_or_else(|| err_path("scene.notObject", &format!("{path}.pulleys[{i}]")))?;
                let pid = text(o.get("pulley"), &format!("{path}.pulleys[{i}].pulley"), None)?;
                let wrap = if o.get("wrap").and_then(|w| w.as_str()) == Some("ccw") { Wrap::Ccw } else { Wrap::Cw };
                pulleys.push((pid, wrap));
            }
            ConnectorKind::Rope {
                a: parse_anchor(c.get("a"), &format!("{path}.a"))?,
                b: parse_anchor(c.get("b"), &format!("{path}.b"))?,
                pulleys,
                length: opt_num(c.get("length"), &format!("{path}.length"))?,
            }
        }
        Some("rod") => ConnectorKind::Rod {
            a: parse_anchor(c.get("a"), &format!("{path}.a"))?,
            b: parse_anchor(c.get("b"), &format!("{path}.b"))?,
            length: opt_num(c.get("length"), &format!("{path}.length"))?,
        },
        Some("spring") => ConnectorKind::Spring {
            a: parse_anchor(c.get("a"), &format!("{path}.a"))?,
            b: parse_anchor(c.get("b"), &format!("{path}.b"))?,
            stiffness: num(c.get("stiffness"), &format!("{path}.stiffness"), None)?,
            rest_length: opt_num(c.get("restLength"), &format!("{path}.restLength"))?,
            damping: num(c.get("damping"), &format!("{path}.damping"), Some(0.0))?,
            cubic: match c.get("cubic") {
                None => 0.0,
                Some(v) => as_number(v).filter(|x| x.is_finite()).ok_or_else(|| Message::new("scene.cubicNotFinite").text("connector", name.clone()))?,
            },
        },
        Some("damper") => ConnectorKind::Damper {
            a: parse_anchor(c.get("a"), &format!("{path}.a"))?,
            b: parse_anchor(c.get("b"), &format!("{path}.b"))?,
            damping: num(c.get("damping"), &format!("{path}.damping"), None)?,
        },
        Some("weld") => ConnectorKind::Weld { a: parse_anchor(c.get("a"), &format!("{path}.a"))?, b: parse_anchor(c.get("b"), &format!("{path}.b"))? },
        Some("slider") => ConnectorKind::Slider {
            a: parse_anchor(c.get("a"), &format!("{path}.a"))?,
            b: parse_anchor(c.get("b"), &format!("{path}.b"))?,
            axis: vec2(c.get("axis"), &format!("{path}.axis"), None)?,
            free: truthy(c.get("free")),
            limits: match present(c.get("limits")) {
                Some(Value::Object(o)) => Some((
                    opt_num(o.get("min"), &format!("{path}.limits.min"))?,
                    opt_num(o.get("max"), &format!("{path}.limits.max"))?,
                    num(o.get("restitution"), &format!("{path}.limits.restitution"), Some(0.0))?,
                )),
                _ => None,
            },
        },
        Some("motor") => ConnectorKind::Motor {
            a: parse_anchor(c.get("a"), &format!("{path}.a"))?,
            b: parse_anchor(c.get("b"), &format!("{path}.b"))?,
            torque_mode: c.get("mode").and_then(|m| m.as_str()) == Some("torque"),
            speed: num(c.get("speed"), &format!("{path}.speed"), None)?,
            torque: num(c.get("torque"), &format!("{path}.torque"), None)?,
            max_torque: opt_num(c.get("maxTorque"), &format!("{path}.maxTorque"))?,
        },
        Some("central") => ConnectorKind::Central {
            a: parse_anchor(c.get("a"), &format!("{path}.a"))?,
            k: num(c.get("k"), &format!("{path}.k"), None)?,
            n: num(c.get("n"), &format!("{path}.n"), None)?,
            targets: match present(c.get("targets")) {
                Some(Value::Array(list)) => {
                    let mut out = Vec::with_capacity(list.len());
                    for (i, t) in list.iter().enumerate() {
                        out.push(text(Some(t), &format!("{path}.targets[{i}]"), None)?);
                    }
                    Some(out)
                }
                _ => None,
            },
        },
        Some("gear") => ConnectorKind::Gear {
            a: parse_anchor(c.get("a"), &format!("{path}.a"))?,
            b: parse_anchor(c.get("b"), &format!("{path}.b"))?,
            ratio: num(c.get("ratio"), &format!("{path}.ratio"), None)?,
        },
        Some("hinge") => ConnectorKind::Hinge { a: parse_anchor(c.get("a"), &format!("{path}.a"))?, b: parse_anchor(c.get("b"), &format!("{path}.b"))? },
        Some("force") => {
            let expr = match present(c.get("expr")) {
                Some(Value::Object(o)) => Some((text(o.get("x"), &format!("{path}.expr.x"), None)?, text(o.get("y"), &format!("{path}.expr.y"), None)?)),
                _ => None,
            };
            let force = vec2(c.get("force"), &format!("{path}.force"), if expr.is_some() { Some(Vec2::default()) } else { None })?;
            ConnectorKind::Force { a: parse_anchor(c.get("a"), &format!("{path}.a"))?, force, expr }
        }
        _ => return Err(err_path("scene.connectorUnknown", &format!("{path}.type"))),
    };
    Ok(ConnectorDef { id, name, kind })
}

/// Structural checks of `validateScene` (io.ts), in the same order.
// `!(a > b)` is not `a <= b`: NaN takes the negated branch, as in the TypeScript source
#[allow(clippy::neg_cmp_op_on_partial_ord)]
pub fn validate_scene(scene: &Scene) -> PResult<()> {
    let mut ids: Vec<&str> = Vec::new();
    for b in &scene.bodies {
        if ids.contains(&b.id.as_str()) {
            return Err(Message::new("scene.duplicateBodyId").text("id", b.id.clone()));
        }
        ids.push(&b.id);
        if b.kind != BodyKind::Static && !(b.mass > 0.0) {
            return Err(Message::new("scene.massNotPositive").text("body", b.name.clone()));
        }
        match &b.shape {
            ShapeDef::Circle { radius } if !(*radius > 0.0) => {
                return Err(Message::new("scene.radiusNotPositive").text("body", b.name.clone()));
            }
            ShapeDef::Box { width, height } if !(*width > 0.0 && *height > 0.0) => {
                return Err(Message::new("scene.sizeNotPositive").text("body", b.name.clone()));
            }
            ShapeDef::Polygon { points } if points.len() < 3 => {
                return Err(Message::new("scene.polygonTooFew").text("body", b.name.clone()));
            }
            // 26.52 (D35): concave polygons are allowed, self-intersecting ones are not
            ShapeDef::Polygon { points } if !polygon_is_simple(points) => {
                return Err(Message::new("scene.polygonNotSimple").text("body", b.name.clone()));
            }
            ShapeDef::Compound { parts } => {
                if parts.is_empty() {
                    return Err(Message::new("scene.compoundEmpty").text("body", b.name.clone()));
                }
                for p in parts {
                    let bad = match &p.shape {
                        ShapeDef::Circle { radius } => !(*radius > 0.0),
                        ShapeDef::Box { width, height } => !(*width > 0.0 && *height > 0.0),
                        ShapeDef::Polygon { points } => !polygon_is_simple(points),
                        ShapeDef::Compound { .. } => true,
                    };
                    if bad {
                        return Err(Message::new("scene.compoundPartInvalid").text("body", b.name.clone()));
                    }
                }
            }
            _ => {}
        }
        let m = b.material;
        if m.mu_s < 0.0 || m.mu_k < 0.0 || m.restitution < 0.0 || m.restitution > 1.0 {
            return Err(Message::new("scene.materialRange").text("body", b.name.clone()));
        }
        if !(m.rolling >= 0.0 && m.rolling <= 1.0) {
            return Err(Message::new("scene.rollingRange").text("body", b.name.clone()));
        }
    }
    for p in &scene.contact_pairs {
        if let Some(r) = p.rolling {
            if !(0.0..=1.0).contains(&r) {
                return Err(Message::new("scene.rollingRange").text("body", format!("{}–{}", p.a, p.b)));
            }
        }
    }
    for p in &scene.pulleys {
        if let Some(body) = &p.body {
            if !body.is_empty() && !ids.contains(&body.as_str()) {
                return Err(Message::new("scene.pulleyBodyMissing").text("pulley", p.name.clone()).text("body", body.clone()));
            }
        }
    }
    let body_name = |id: &str| -> String { scene.bodies.iter().find(|b| b.id == id).map(|b| b.name.clone()).unwrap_or_else(|| id.to_string()) };
    for c in &scene.connectors {
        let anchors: Vec<&Anchor> = match &c.kind {
            ConnectorKind::Force { a, .. } | ConnectorKind::Central { a, .. } => vec![a],
            ConnectorKind::Rope { a, b, .. }
            | ConnectorKind::Rod { a, b, .. }
            | ConnectorKind::Spring { a, b, .. }
            | ConnectorKind::Hinge { a, b }
            | ConnectorKind::Damper { a, b, .. }
            | ConnectorKind::Weld { a, b }
            | ConnectorKind::Slider { a, b, .. }
            | ConnectorKind::Motor { a, b, .. }
            | ConnectorKind::Gear { a, b, .. } => vec![a, b],
        };
        for a in anchors {
            if let Some(body) = &a.body {
                if !ids.contains(&body.as_str()) {
                    return Err(Message::new("scene.connectorBodyMissing").text("connector", c.name.clone()).text("body", body.clone()));
                }
            }
        }
        if let ConnectorKind::Rope { a, b, pulleys, .. } = &c.kind {
            for (pid, _) in pulleys {
                if !scene.pulleys.iter().any(|p| &p.id == pid) {
                    return Err(Message::new("scene.ropePulleyMissing").text("connector", c.name.clone()).text("pulley", pid.clone()));
                }
            }
            let find = |id: &str| scene.pulleys.iter().find(|p| p.id == id);
            let first = pulleys.first().and_then(|p| find(&p.0));
            let last = pulleys.last().and_then(|p| find(&p.0));
            if let Some(f) = first {
                if let Some(fb) = f.body.as_ref().filter(|s| !s.is_empty()) {
                    if a.body.as_ref() == Some(fb) {
                        return Err(Message::new("scene.ropeEndOnPulleyBody")
                            .text("connector", c.name.clone())
                            .text("body", body_name(fb))
                            .text("pulley", f.name.clone()));
                    }
                }
            }
            if let Some(l) = last {
                if let Some(lb) = l.body.as_ref().filter(|s| !s.is_empty()) {
                    if b.body.as_ref() == Some(lb) {
                        return Err(Message::new("scene.ropeEndOnPulleyBody")
                            .text("connector", c.name.clone())
                            .text("body", body_name(lb))
                            .text("pulley", l.name.clone()));
                    }
                }
            }
            for i in 0..pulleys.len().saturating_sub(1) {
                if pulleys[i].0 == pulleys[i + 1].0 {
                    return Err(Message::new("scene.ropeSamePulleyTwice").text("connector", c.name.clone()));
                }
            }
        }
        if let ConnectorKind::Spring { stiffness, .. } = &c.kind {
            if !(*stiffness > 0.0) {
                return Err(Message::new("scene.stiffnessNotPositive").text("connector", c.name.clone()));
            }
        }
        match &c.kind {
            ConnectorKind::Damper { damping, .. } if !(*damping >= 0.0) => {
                return Err(Message::new("scene.damperNegative").text("connector", c.name.clone()));
            }
            ConnectorKind::Slider { axis, .. } if axis.x == 0.0 && axis.y == 0.0 => {
                return Err(Message::new("scene.sliderAxisZero").text("connector", c.name.clone()));
            }
            ConnectorKind::Gear { a, ratio, .. } if a.body.is_none() || *ratio == 0.0 => {
                return Err(Message::new("scene.gearInvalid").text("connector", c.name.clone()));
            }
            _ => {}
        }
        // 26.52 (D58, D60)
        if let ConnectorKind::Motor { max_torque: Some(t), .. } = &c.kind {
            if !(*t > 0.0 && t.is_finite()) {
                return Err(Message::new("scene.motorMaxTorque").text("connector", c.name.clone()));
            }
        }
        if let ConnectorKind::Slider { limits: Some((min, max, e)), .. } = &c.kind {
            if let (Some(lo), Some(hi)) = (min, max) {
                if !(lo < hi) {
                    return Err(Message::new("scene.sliderLimits").text("connector", c.name.clone()));
                }
            }
            if !(*e >= 0.0 && *e <= 1.0) {
                return Err(Message::new("scene.sliderLimitRestitution").text("connector", c.name.clone()));
            }
        }
        if let ConnectorKind::Central { k, n, targets, .. } = &c.kind {
            if !(k.is_finite() && n.is_finite() && n.abs() <= 4.0) {
                return Err(Message::new("scene.centralInvalid").text("connector", c.name.clone()));
            }
            for t in targets.iter().flatten() {
                if !ids.contains(&t.as_str()) {
                    return Err(Message::new("scene.centralTargetMissing").text("connector", c.name.clone()).text("body", t.clone()));
                }
            }
        }
        if let ConnectorKind::Force { a, expr: Some((ex, ey)), .. } = &c.kind {
            if a.body.is_none() {
                return Err(Message::new("scene.variableForceNeedsBody").text("connector", c.name.clone()));
            }
            for (comp, src) in [("x", ex), ("y", ey)] {
                if let Err(e) = check_force_expr(src) {
                    return Err(Message::new("scene.forceExprInvalid").text("connector", c.name.clone()).text("component", comp).msg("reason", e));
                }
            }
        }
    }
    let s = &scene.settings;
    if !(s.output_step > 0.0 && s.output_step <= 0.1) {
        return Err(Message::new("scene.outputStepRange"));
    }
    if let Some(d) = s.duration {
        if !(d > 0.0 && d <= MAX_DURATION) {
            return Err(Message::new("scene.durationRange").num("max", MAX_DURATION));
        }
    }
    if !(s.legacy_duration > 0.0 && s.legacy_duration <= MAX_DURATION) {
        return Err(Message::new("scene.legacyDurationRange").num("max", MAX_DURATION));
    }
    if let Some(sa) = s.stop_at {
        if !(sa.after >= 0.0 && sa.after <= MAX_DURATION) {
            return Err(Message::new("scene.stopAtDelayRange").num("max", MAX_DURATION));
        }
    }
    if !(s.rel_tol > 0.0 && s.abs_tol > 0.0) {
        return Err(Message::new("scene.tolerancesNotPositive"));
    }
    if let Some(g) = s.gravitation {
        if !(g > 0.0) {
            return Err(Message::new("scene.gravitationNotPositive"));
        }
    }
    for b in &scene.bodies {
        if let Some(d) = b.drag {
            if !(d.linear >= 0.0 && d.quadratic >= 0.0) {
                return Err(Message::new("scene.dragNegative").text("body", b.name.clone()));
            }
        }
    }
    Ok(())
}
