//! Element properties of the geometry operations. The built-in table (`elements_data.rs`, generated from sourced data
//! by `scripts/oracles/mol.py --elements`) holds what valence counting, bond polarity, bond detection and densities
//! need; a request may override any property per symbol with `elements: { "Na": { mass, en, rcov, rvdw, rion } }`, so
//! the encyclopedia's data file stays the one source when the interface passes it on (engine/CHEM.md).

use std::collections::BTreeMap;

use serde_json::Value;
use velophi_core::transport::dnum;

use super::elements_data::{ELEMENTS, IONIC_RADII, OXIDATION_STATES};

/// One row of the built-in table.
#[derive(Clone, Copy, Debug)]
pub struct ElementData {
    pub symbol: &'static str,
    /// Standard atomic weight (u); the mass number of the longest-lived isotope where there is none.
    pub mass: f64,
    /// Pauling electronegativity; 0 when none is assigned.
    pub en: f64,
    /// Covalent radius (Å).
    pub rcov: f64,
    /// Van der Waals radius (Å).
    pub rvdw: f64,
    /// Group 1 … 18; 0 in the f block.
    pub group: u8,
    /// `b's'`, `b'p'`, `b'd'` or `b'f'`.
    pub block: u8,
}

/// An element as one request sees it.
#[derive(Clone, Debug)]
pub struct Element {
    pub symbol: String,
    /// Atomic number; 0 for a symbol the table does not know.
    pub z: u32,
    pub mass: f64,
    pub en: Option<f64>,
    pub rcov: f64,
    pub rvdw: f64,
    /// Ionic radius given by the request (Å).
    pub rion: Option<f64>,
    pub group: u8,
    pub block: u8,
}

impl Element {
    /// Valence electrons of a main-group element (the group rule); `None` in the d and f blocks, where counting
    /// electron pairs does not predict the shape.
    pub fn valence(&self) -> Option<u32> {
        match self.block {
            b's' => Some(if self.z == 2 { 2 } else { self.group as u32 }),
            b'p' => Some(self.group as u32 - 10),
            _ => None,
        }
    }

    pub fn known(&self) -> bool {
        self.z > 0
    }
}

/// The table of a request.
pub struct Table {
    overrides: BTreeMap<String, Value>,
}

impl Table {
    /// The built-in table with the overrides of `req.elements`.
    pub fn from_request(req: &Value) -> Table {
        let mut overrides = BTreeMap::new();
        if let Some(o) = req.get("elements").and_then(|v| v.as_object()) {
            for (k, v) in o {
                overrides.insert(k.clone(), v.clone());
            }
        }
        Table { overrides }
    }

    /// The built-in table alone.
    pub fn builtin() -> Table {
        Table { overrides: BTreeMap::new() }
    }

    pub fn get(&self, symbol: &str) -> Element {
        // Deuterium and tritium are hydrogen with another mass
        let (lookup, isotope_mass) = match symbol {
            "D" => ("H", Some(2.014101778)),
            "T" => ("H", Some(3.016049281)),
            s => (s, None),
        };
        let mut e = match ELEMENTS.iter().position(|d| d.symbol == lookup) {
            Some(i) => {
                let d = &ELEMENTS[i];
                Element { symbol: symbol.to_string(), z: i as u32 + 1, mass: isotope_mass.unwrap_or(d.mass), en: if d.en > 0.0 { Some(d.en) } else { None }, rcov: d.rcov, rvdw: d.rvdw, rion: None, group: d.group, block: d.block }
            }
            None => Element { symbol: symbol.to_string(), z: 0, mass: 0.0, en: None, rcov: 0.75, rvdw: 1.8, rion: None, group: 0, block: b'?' },
        };
        if let Some(o) = self.overrides.get(symbol) {
            let read = |k: &str| o.get(k).filter(|x| !x.is_null()).map(dnum).filter(|d| d.is_finite() && *d > 0.0);
            if let Some(v) = read("mass") {
                e.mass = v;
            }
            if let Some(v) = read("en") {
                e.en = Some(v);
            }
            if let Some(v) = read("rcov") {
                e.rcov = v;
            }
            if let Some(v) = read("rvdw") {
                e.rvdw = v;
            }
            e.rion = read("rion");
        }
        e
    }
}

/// Shannon's effective ionic radius (Å) of an ion, at coordination number 6 or the nearest listed one.
pub fn ionic_radius(symbol: &str, charge: i32) -> Option<f64> {
    IONIC_RADII.iter().find(|(s, q, _)| *s == symbol && *q as i32 == charge).map(|(_, _, r)| *r)
}

/// Charges to try for an element when the ions of a crystal are assigned: its main oxidation states first, then the
/// other charges that have an ionic radius.
pub fn candidate_charges(symbol: &str) -> Vec<i32> {
    let mut out: Vec<i32> = OXIDATION_STATES.iter().find(|(s, _)| *s == symbol).map(|(_, q)| q.iter().map(|x| *x as i32).collect()).unwrap_or_default();
    for (s, q, _) in IONIC_RADII.iter() {
        if *s == symbol && !out.contains(&(*q as i32)) {
            out.push(*q as i32);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn table_and_overrides() {
        let t = Table::builtin();
        let o = t.get("O");
        assert_eq!((o.z, o.valence(), o.en), (8, Some(6), Some(3.44)));
        assert_eq!(t.get("He").valence(), Some(2));
        assert_eq!(t.get("Xe").valence(), Some(8));
        assert_eq!(t.get("Fe").valence(), None);
        assert!(!t.get("Zz").known());
        assert_eq!(t.get("D").z, 1);
        let t = Table::from_request(&json!({ "elements": { "Na": { "en": 1.0, "rion": 1.02 } } }));
        assert_eq!((t.get("Na").en, t.get("Na").rion, t.get("Na").mass), (Some(1.0), Some(1.02), 22.98976928));
        assert_eq!(ionic_radius("Cl", -1), Some(1.81));
        assert_eq!(candidate_charges("Cu")[0], 2);
        assert!(candidate_charges("Cu").contains(&1));
    }
}
