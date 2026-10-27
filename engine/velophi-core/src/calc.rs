//! Stateless calculations of the interface (26.53, D65): mass properties and outlines of shapes, polygon checks and
//! force-expression checks — what the editor and the inspector need without a session. One JSON request
//! `{ op, … }` → one result (the same container format as session calls).

use serde_json::{json, Value};

use crate::message::{Message, SimResult};
use crate::model::{compound_mass, polygon_centroid, polygon_is_simple, shape_inertia, shape_outline, ShapePiece};
use crate::scene::{parse_shape_value, ShapeDef, ShapePart, Vec2};
use crate::transport::{dnum, jnum, Blob};

fn bad(op: &str, what: &str) -> Message {
    Message::new("err.internal").text("message", format!("calc {op}: {what}"))
}

fn points(v: &Value) -> Vec<Vec2> {
    v.as_array().map(|a| a.iter().map(|p| Vec2 { x: dnum(&p["x"]), y: dnum(&p["y"]) }).collect()).unwrap_or_default()
}

fn v2(v: Vec2) -> Value {
    json!({ "x": jnum(v.x), "y": jnum(v.y) })
}

fn piece_json(p: &ShapePiece) -> Value {
    match p {
        ShapePiece::Circle { center, radius } => json!({ "kind": "circle", "center": v2(*center), "radius": jnum(*radius) }),
        ShapePiece::Polygon { verts, normals } => json!({ "kind": "polygon", "verts": verts.iter().map(|v| v2(*v)).collect::<Vec<_>>(), "normals": normals.iter().map(|v| v2(*v)).collect::<Vec<_>>() }),
    }
}

fn parts_of(shape: &ShapeDef) -> Vec<ShapePart> {
    match shape {
        ShapeDef::Compound { parts } => parts.clone(),
        other => vec![ShapePart { shape: other.clone(), position: Vec2::default(), angle: 0.0 }],
    }
}

/// Run one stateless request.
pub fn call(req: &Value) -> SimResult<(Value, Blob)> {
    let op = req.get("op").and_then(|v| v.as_str()).unwrap_or("");
    let mut blob = Blob::default();
    // 26.54 (D76): the experiments of the lab
    if let Some(out) = crate::labs::call(op, req, &mut blob) {
        return Ok((out, blob));
    }
    let out = match op {
        "shapeOutline" => {
            let shape = parse_shape_value(&req["shape"])?;
            let dynamic = req.get("dynamic").and_then(|v| v.as_bool()).unwrap_or(true);
            json!({ "outline": shape_outline(&shape, dynamic).iter().map(piece_json).collect::<Vec<_>>() })
        }
        "compoundMass" => {
            let shape = parse_shape_value(&req["shape"])?;
            let mass = req.get("mass").map(dnum).unwrap_or(1.0);
            let (area, c, inertia) = compound_mass(&parts_of(&shape), mass);
            json!({ "area": jnum(area), "centroid": v2(c), "inertia": jnum(inertia) })
        }
        "shapeInertia" => {
            let shape = parse_shape_value(&req["shape"])?;
            json!({ "inertia": jnum(shape_inertia(&shape, req.get("mass").map(dnum).unwrap_or(1.0))) })
        }
        "polygonIsSimple" => json!({ "simple": polygon_is_simple(&points(&req["points"])) }),
        "polygonCentroid" => json!({ "centroid": v2(polygon_centroid(&points(&req["points"]))) }),
        "checkForceExpr" => {
            let src = req.get("src").and_then(|v| v.as_str()).unwrap_or("");
            match crate::expr::check_force_expr(src) {
                Ok(()) => json!({ "ok": true }),
                Err(m) => json!({ "ok": false, "message": m.to_json() }),
            }
        }
        "evaluateExpr" => {
            // An expression of the formula language with given variable values: its value and the value of every
            // node in pre-order (the steps of a worked solution)
            let src = req.get("expr").and_then(|v| v.as_str()).unwrap_or("");
            let vars = req.get("vars").and_then(|v| v.as_object()).cloned().unwrap_or_default();
            let lookup = |name: &str| vars.get(name).map(dnum);
            match crate::expr::parse_formula(src).and_then(|n| crate::expr::evaluate_trace(&n, &lookup)) {
                Ok(tr) => json!({ "value": jnum(tr[0]), "trace": tr.iter().map(|v| jnum(*v)).collect::<Vec<_>>() }),
                Err(e) => json!({ "error": e.to_json() }),
            }
        }
        "simpson" => {
            // Composite Simpson rule over equally spaced values (3/8 rule for an odd interval count): the area tool
            let v: Vec<f64> = req["values"].as_array().map(|a| a.iter().map(dnum).collect()).unwrap_or_default();
            json!({ "value": jnum(crate::teaching::simpson(&v, dnum(&req["h"]))) })
        }
        "setLibrary" => json!({ "formulas": crate::formula::cards::set_library(&req["formulas"]) }),
        "version" => json!({ "core": env!("CARGO_PKG_VERSION"), "scene": crate::scene::SCENE_VERSION }),
        _ => return Err(bad(op, "unknown operation")),
    };
    Ok((out, blob))
}

/// Run one request and encode the result container.
pub fn call_bytes(req: &Value) -> SimResult<Vec<u8>> {
    let (doc, blob) = call(req)?;
    Ok(blob.finish(&doc))
}
