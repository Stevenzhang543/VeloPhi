//! Operations (engine/CHEM.md, "Colour operations").

use serde_json::{json, Value};
use velophi_core::message::{Message, SimResult};
use velophi_core::transport::{dnum, jnum, Blob};

use super::{add, emitted, through, transmitted, wavelength, BANDS};
use crate::db;

fn rgb(c: [u8; 3]) -> Value {
    json!([c[0], c[1], c[2]])
}

/// `chemColour`: the colour of a layer of solution or gas from the concentrations of its species.
fn colour(req: &Value) -> SimResult<Value> {
    let db = db::database()?;
    let path = req.get("path_cm").map(dnum).unwrap_or(1.0);
    if !(path.is_finite() && path >= 0.0) {
        return Err(Message::new("chem.badAmount").text("what", "path_cm"));
    }
    let mut per_cm = [0.0; BANDS];
    let mut unknown = Vec::new();
    let mut colourless = Vec::new();
    if let Some(o) = req.get("species").and_then(|v| v.as_object()) {
        for (id, c) in o {
            match db.find(id) {
                None => unknown.push(id.clone()),
                Some(s) => {
                    if db.cat.spectra.contains_key(&s) {
                        add(&db, &mut per_cm, s, dnum(c));
                    } else {
                        colourless.push(id.clone());
                    }
                }
            }
        }
    }
    if let Some(id) = unknown.first() {
        return Err(Message::new("chem.unknownSpecies").text("id", id));
    }
    let a = through(&per_cm, path);
    Ok(json!({
        "rgb": rgb(transmitted(&a)),
        "absorbance": a.iter().map(|&x| jnum(x)).collect::<Vec<_>>(),
        "wavelengths": (0..BANDS).map(|i| jnum(wavelength(i))).collect::<Vec<_>>(),
        "colourless": colourless
    }))
}

/// `chemSpectrum`: the stored spectrum of one species.
fn spectrum(req: &Value) -> SimResult<Value> {
    let db = db::database()?;
    let id = req.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let s = db.find(id).ok_or_else(|| Message::new("chem.unknownSpecies").text("id", id))?;
    Ok(match db.cat.spectra.get(&s) {
        Some(e) => json!({ "id": id, "wavelengths": (0..BANDS).map(|i| jnum(wavelength(i))).collect::<Vec<_>>(), "epsilon": e.iter().map(|&x| jnum(x)).collect::<Vec<_>>() }),
        None => json!({ "id": id, "epsilon": Value::Null }),
    })
}

/// `chemFlame`: the colour of a flame that holds these elements.
fn flame(req: &Value) -> SimResult<Value> {
    let db = db::database()?;
    let mut all = Vec::new();
    let mut lines = Vec::new();
    let mut none = Vec::new();
    for e in req.get("elements").and_then(|v| v.as_array()).cloned().unwrap_or_default() {
        let Some(el) = e.as_str() else { continue };
        match db.cat.flames.get(el) {
            None => none.push(el.to_string()),
            Some(list) => {
                for &(nm, power) in list {
                    all.push((nm, power));
                    lines.push(json!({ "element": el, "nm": jnum(nm), "power": jnum(power), "rgb": emitted(&[(nm, 1.0)]).map(rgb).unwrap_or(Value::Null) }));
                }
            }
        }
    }
    Ok(json!({ "rgb": emitted(&all).map(rgb).unwrap_or(Value::Null), "lines": lines, "none": none }))
}

/// Run one operation of this module; `None` when `op` is not one of them.
pub fn call(op: &str, req: &Value, _blob: &mut Blob) -> Option<SimResult<Value>> {
    match op {
        "chemColour" => Some(colour(req)),
        "chemSpectrum" => Some(spectrum(req)),
        "chemFlame" => Some(flame(req)),
        _ => None,
    }
}
