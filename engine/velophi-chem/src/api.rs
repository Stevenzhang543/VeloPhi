//! Dispatch of the chemistry operations (engine/CHEM.md). `calc` is tried before the physics core's stateless
//! operations by the ABI layer (`velophi-wasm`): an operation that is not one of chemistry falls through to
//! `velophi_core::calc`.

use serde_json::Value;
use velophi_core::message::SimResult;
use velophi_core::transport::Blob;

/// Run one stateless chemistry operation; `None` when `op` is not one of them.
pub fn calc(op: &str, req: &Value, blob: &mut Blob) -> Option<SimResult<Value>> {
    if let Some(r) = crate::ops::call(op, req, blob) {
        return Some(r);
    }
    if let Some(r) = crate::gibbs::api::call(op, req, blob) {
        return Some(r);
    }
    if let Some(r) = crate::color::api::call(op, req, blob) {
        return Some(r);
    }
    if let Some(r) = crate::mol::api::call(op, req, blob) {
        return Some(r);
    }
    if let Some(r) = crate::nuclear::api::call(op, req, blob) {
        return Some(r);
    }
    if let Some(r) = crate::reactor::api::call(op, req, blob) {
        return Some(r);
    }
    None
}

/// One stateless request `{ op, … }` of either core, as a result container.
pub fn calc_bytes(req: &Value) -> SimResult<Vec<u8>> {
    let op = req.get("op").and_then(|v| v.as_str()).unwrap_or("");
    let mut blob = Blob::default();
    match calc(op, req, &mut blob) {
        Some(r) => Ok(blob.finish(&r?)),
        None => velophi_core::calc::call_bytes(req),
    }
}
