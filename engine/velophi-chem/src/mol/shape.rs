//! The shape of a molecule (26.64, D271): electron-pair counting around every central atom (VSEPR), the directions of
//! the lone pairs, bond polarity from Pauling electronegativities, the dipole moment, and the frame the viewer starts
//! from.
//!
//! Lone pairs come from valence counting with the bond orders given: a main-group atom with V valence electrons, formal
//! charge q and bond orders summing to B keeps ⌊(V − q − B) / 2⌋ pairs (aromatic bonds count 1.5, so a nitrogen whose
//! pair is part of the ring keeps none and stays planar). The class AXₙEₘ names the geometry. The same geometry is read
//! from the coordinates as a check; where the two differ (a delocalised pair, a radical) both are reported. Electron
//! counting says nothing about d- and f-block centres: their geometry is the one read from the coordinates and the
//! centre carries the diagnostic `mol.vseprNotApplicable`.

use serde_json::{json, Value};
use velophi_core::dmath;

use super::elements::Element;
use super::measure::neighbours;
use super::vec3::{add, angle, cross, degrees, dot, eigen_sym3, norm, perpendicular, scale, sub, unit, V3};

/// 1 e·Å in debye (1 D = 3.335 640 951… × 10⁻³⁰ C·m).
pub const E_ANGSTROM_DEBYE: f64 = 4.803204712570263;
/// Electronegativity difference below which a bond is called non-polar, and above which ionic (the school convention).
pub const POLAR_FROM: f64 = 0.4;
pub const IONIC_FROM: f64 = 1.7;
/// cos and sin of half the tetrahedral angle.
const TET_COS: f64 = 0.5773502691896258;
const TET_SIN: f64 = 0.816496580927726;
const SQRT3_2: f64 = 0.8660254037844386;

/// A central atom (two or more bonded neighbours).
#[derive(Clone, Debug)]
pub struct Centre {
    pub atom: usize,
    pub neighbours: Vec<usize>,
    pub lone_pairs: usize,
    /// AX2E2 …; empty where electron counting does not apply.
    pub class: String,
    /// Geometry of the atoms predicted by the class (key).
    pub geometry: Option<&'static str>,
    /// Geometry of the electron domains (key).
    pub electron_geometry: Option<&'static str>,
    /// Geometry read from the coordinates (key).
    pub observed: Option<&'static str>,
    /// All neighbours are the same element at the same distance (within 1 %) and there is no lone pair.
    pub regular: bool,
    /// Ideal angles between the electron domains (degrees).
    pub ideal: Vec<f64>,
    /// The angles between the bonds at this atom, ascending (degrees).
    pub angles: Vec<f64>,
    /// Unit directions of the lone-pair lobes.
    pub lobes: Vec<V3>,
}

/// Polarity of a bond.
#[derive(Clone, Debug)]
pub struct BondInfo {
    pub i: usize,
    pub j: usize,
    pub order: f64,
    pub length: f64,
    /// |Δχ| (Pauling); `None` when an atom has no electronegativity.
    pub delta: Option<f64>,
    /// The more electronegative atom (the δ− end); `None` for equal or unknown values.
    pub negative: Option<usize>,
    /// "nonpolar" | "polar" | "ionic" | "unknown".
    pub kind: &'static str,
    /// Pauling's ionic character 1 − exp(−Δχ² / 4).
    pub ionic_character: Option<f64>,
}

/// Dipole moment (debye), physics convention: from the negative to the positive charge.
#[derive(Clone, Debug)]
pub struct Dipole {
    pub vector: V3,
    pub magnitude: f64,
    /// "charges" | "bonds".
    pub source: &'static str,
    pub origin: V3,
}

#[derive(Clone, Debug)]
pub struct Shape {
    pub lone_pairs: Vec<usize>,
    pub centres: Vec<Centre>,
    pub bonds: Vec<BondInfo>,
    pub dipole: Option<Dipole>,
    /// Geometric centre of the atoms.
    pub centre: V3,
    /// Principal axes of the atom positions (rows, descending extent, right-handed).
    pub axes: [V3; 3],
    /// Root-mean-square extent along each axis (Å).
    pub extent: [f64; 3],
    /// Largest distance of a nucleus from the centre, and the same with the van der Waals radius added (Å).
    pub radius: f64,
    pub radius_vdw: f64,
    /// Molar mass (g/mol).
    pub mass: f64,
    pub diagnostics: Vec<Value>,
}

/// Class name AXₙEₘ.
pub fn class_name(x: usize, e: usize) -> String {
    let part = |letter: &str, n: usize| match n {
        0 => String::new(),
        1 => letter.to_string(),
        _ => format!("{letter}{n}"),
    };
    format!("A{}{}", part("X", x), part("E", e))
}

/// Geometry of the atoms for X bonded neighbours and E lone pairs.
pub fn vsepr_geometry(x: usize, e: usize) -> Option<&'static str> {
    Some(match (x, e) {
        (2, 0) | (2, 3) => "linear",
        (2, 1) | (2, 2) => "bent",
        (3, 0) => "trigonalPlanar",
        (3, 1) => "trigonalPyramidal",
        (3, 2) => "tShaped",
        (4, 0) => "tetrahedral",
        (4, 1) => "seesaw",
        (4, 2) => "squarePlanar",
        (5, 0) => "trigonalBipyramidal",
        (5, 1) => "squarePyramidal",
        (5, 2) => "pentagonalPlanar",
        (6, 0) => "octahedral",
        (6, 1) => "pentagonalPyramidal",
        (7, 0) => "pentagonalBipyramidal",
        _ => return None,
    })
}

/// Geometry of the electron domains for a steric number, with the ideal angles between domains.
pub fn domain_geometry(steric: usize) -> Option<(&'static str, &'static [f64])> {
    Some(match steric {
        2 => ("linear", &[180.0]),
        3 => ("trigonalPlanar", &[120.0]),
        4 => ("tetrahedral", &[109.47122063449069]),
        5 => ("trigonalBipyramidal", &[90.0, 120.0, 180.0]),
        6 => ("octahedral", &[90.0, 180.0]),
        7 => ("pentagonalBipyramidal", &[72.0, 90.0, 180.0]),
        _ => return None,
    })
}

/// Geometry read from the directions to the neighbours (unit vectors).
pub fn observed_geometry(u: &[V3]) -> Option<&'static str> {
    let mut angles = Vec::new();
    for i in 0..u.len() {
        for j in i + 1..u.len() {
            angles.push(degrees(angle(u[i], u[j])));
        }
    }
    let wide = angles.iter().filter(|a| **a >= 150.0).count();
    let widest = angles.iter().fold(0.0f64, |m, a| m.max(*a));
    Some(match u.len() {
        2 => {
            if widest >= 170.0 {
                "linear"
            } else {
                "bent"
            }
        }
        3 => {
            if widest >= 150.0 {
                "tShaped"
            } else if angles.iter().sum::<f64>() >= 355.0 {
                "trigonalPlanar"
            } else {
                "trigonalPyramidal"
            }
        }
        4 => match wide {
            0 => "tetrahedral",
            1 => "seesaw",
            _ => "squarePlanar",
        },
        5 => match wide {
            1 => "trigonalBipyramidal",
            2 => "squarePyramidal",
            _ => return None,
        },
        6 => {
            if wide == 3 {
                "octahedral"
            } else {
                "trigonalPrismatic"
            }
        }
        7 => "pentagonalBipyramidal",
        _ => return None,
    })
}

/// The two directions of largest mutual angle among `u` (first such pair).
fn widest_pair(u: &[V3]) -> (usize, usize) {
    let (mut best, mut pair) = (-1.0, (0, 1));
    for i in 0..u.len() {
        for j in i + 1..u.len() {
            let a = angle(u[i], u[j]);
            if a > best + 1e-12 {
                best = a;
                pair = (i, j);
            }
        }
    }
    pair
}

/// The direction least covered by `u`: the eigenvector of Σ u uᵀ with the smallest eigenvalue (the normal of the plane
/// the neighbours lie in).
fn plane_normal(u: &[V3]) -> V3 {
    let mut m = [[0.0; 3]; 3];
    for v in u {
        for i in 0..3 {
            for j in 0..3 {
                m[i][j] += v[i] * v[j];
            }
        }
    }
    eigen_sym3(m).1[2]
}

/// Unit directions of `pairs` lone pairs around an atom whose neighbours lie along the unit vectors `u`: the free
/// corners of the electron-domain polyhedron.
pub fn lobe_directions(u: &[V3], pairs: usize) -> Vec<V3> {
    let sum = u.iter().fold([0.0; 3], |s, v| add(s, *v));
    let away = unit(scale(sum, -1.0));
    let away_ok = norm(sum) > 1e-6;
    match (u.len(), pairs) {
        (_, 0) => Vec::new(),
        (2, 1) => vec![if away_ok { away } else { perpendicular(u[0]) }],
        (2, 2) => {
            let n = unit(cross(u[0], u[1]));
            if !away_ok || norm(n) == 0.0 {
                return Vec::new();
            }
            vec![unit(add(scale(away, TET_COS), scale(n, TET_SIN))), unit(sub(scale(away, TET_COS), scale(n, TET_SIN)))]
        }
        (2, 3) => {
            let axis = unit(sub(u[0], u[1]));
            let p = perpendicular(axis);
            let q = cross(axis, p);
            vec![p, unit(add(scale(p, -0.5), scale(q, SQRT3_2))), unit(sub(scale(p, -0.5), scale(q, SQRT3_2)))]
        }
        (3, 1) => vec![if away_ok { away } else { plane_normal(u) }],
        (3, 2) => {
            // T shape: the two lobes share the equatorial plane with the ligand that is not on the axis
            let (i, j) = widest_pair(u);
            let k = 3 - i - j;
            let axis = unit(sub(u[i], u[j]));
            let e = unit(sub(u[k], scale(axis, dot(u[k], axis))));
            let q = cross(axis, e);
            vec![unit(add(scale(e, -0.5), scale(q, SQRT3_2))), unit(sub(scale(e, -0.5), scale(q, SQRT3_2)))]
        }
        (4, 2) | (5, 2) => {
            let n = plane_normal(u);
            vec![n, scale(n, -1.0)]
        }
        (_, 1) => {
            if away_ok {
                vec![away]
            } else {
                Vec::new()
            }
        }
        _ => Vec::new(),
    }
}

/// Analyse a molecule. `bonds` are `(i, j, order)` with valid, distinct indices; `charges` are partial charges (e) and
/// `formal` formal charges per atom when present.
pub fn analyse(atoms: &[Element], xyz: &[V3], bonds: &[(usize, usize, f64)], charges: Option<&[f64]>, formal: Option<&[f64]>) -> Shape {
    let n = atoms.len();
    let nb = neighbours(n, bonds);
    let mut diagnostics = Vec::new();
    let mut unknown: Vec<&str> = atoms.iter().filter(|a| !a.known()).map(|a| a.symbol.as_str()).collect();
    unknown.sort_unstable();
    unknown.dedup();
    for s in unknown {
        diagnostics.push(json!({ "code": "mol.unknownElement", "severity": "unmodelled", "params": { "symbol": s } }));
    }

    // Lone pairs by valence counting
    let mut order_sum = vec![0.0; n];
    for &(i, j, o) in bonds {
        order_sum[i] += o;
        order_sum[j] += o;
    }
    let lone_pairs: Vec<usize> = (0..n)
        .map(|i| match atoms[i].valence() {
            Some(v) if atoms[i].known() => {
                let q = formal.map(|f| f[i]).unwrap_or(0.0);
                let free = v as f64 - q - order_sum[i];
                if free > 0.0 {
                    ((free / 2.0 + 1e-9).floor() as usize).min(4)
                } else {
                    0
                }
            }
            _ => 0,
        })
        .collect();

    // Central atoms
    let mut centres = Vec::new();
    for a in 0..n {
        let x = nb[a].len();
        if x < 2 {
            continue;
        }
        let u: Vec<V3> = nb[a].iter().map(|&j| unit(sub(xyz[j], xyz[a]))).collect();
        let mut angles = Vec::new();
        for i in 0..x {
            for j in i + 1..x {
                angles.push(degrees(angle(u[i], u[j])));
            }
        }
        angles.sort_by(|p, q| p.partial_cmp(q).unwrap_or(std::cmp::Ordering::Equal));
        let observed = observed_geometry(&u);
        let applies = atoms[a].known() && atoms[a].valence().is_some();
        let e = lone_pairs[a];
        let (class, geometry, electron_geometry, ideal) = if applies {
            let dom = domain_geometry(x + e);
            (class_name(x, e), vsepr_geometry(x, e), dom.map(|d| d.0), dom.map(|d| d.1.to_vec()).unwrap_or_default())
        } else {
            (String::new(), observed, None, Vec::new())
        };
        if !applies {
            diagnostics.push(json!({ "code": "mol.vseprNotApplicable", "severity": "unmodelled", "path": format!("centres/{}", centres.len()), "params": { "atom": a, "element": atoms[a].symbol } }));
        } else if geometry.is_none() {
            diagnostics.push(json!({ "code": "mol.vseprNoClass", "severity": "unmodelled", "path": format!("centres/{}", centres.len()), "params": { "atom": a, "class": class } }));
        } else if observed.is_some() && observed != geometry {
            diagnostics.push(json!({ "code": "mol.geometryDiffers", "severity": "info", "path": format!("centres/{}", centres.len()), "params": { "atom": a, "predicted": geometry, "observed": observed } }));
        }
        let lengths: Vec<f64> = nb[a].iter().map(|&j| norm(sub(xyz[j], xyz[a]))).collect();
        let (lmin, lmax) = lengths.iter().fold((f64::INFINITY, 0.0f64), |(lo, hi), l| (lo.min(*l), hi.max(*l)));
        let same = nb[a].iter().all(|&j| atoms[j].symbol == atoms[nb[a][0]].symbol);
        let regular = same && e == 0 && lmax <= lmin * 1.01 && observed == geometry;
        let lobes = if applies { lobe_directions(&u, e) } else { Vec::new() };
        centres.push(Centre { atom: a, neighbours: nb[a].clone(), lone_pairs: e, class, geometry, electron_geometry, observed, regular, ideal, angles, lobes });
    }

    // Bond polarity
    let bond_info: Vec<BondInfo> = bonds
        .iter()
        .map(|&(i, j, order)| {
            let length = norm(sub(xyz[i], xyz[j]));
            match (atoms[i].en, atoms[j].en) {
                (Some(a), Some(b)) => {
                    let d = (a - b).abs();
                    let kind = if d < POLAR_FROM {
                        "nonpolar"
                    } else if d <= IONIC_FROM {
                        "polar"
                    } else {
                        "ionic"
                    };
                    let negative = if d < 1e-9 { None } else if a > b { Some(i) } else { Some(j) };
                    BondInfo { i, j, order, length, delta: Some(d), negative, kind, ionic_character: Some(1.0 - dmath::exp(-d * d / 4.0)) }
                }
                _ => BondInfo { i, j, order, length, delta: None, negative: None, kind: "unknown", ionic_character: None },
            }
        })
        .collect();

    // Centre, principal axes, radii
    let centre = if n > 0 { scale(xyz.iter().fold([0.0; 3], |s, p| add(s, *p)), 1.0 / n as f64) } else { [0.0; 3] };
    let mut cov = [[0.0; 3]; 3];
    for p in xyz {
        let d = sub(*p, centre);
        for i in 0..3 {
            for j in 0..3 {
                cov[i][j] += d[i] * d[j];
            }
        }
    }
    let (w, axes) = eigen_sym3(cov);
    let extent = [0, 1, 2].map(|k| if n > 0 { (w[k].max(0.0) / n as f64).sqrt() } else { 0.0 });
    let (mut radius, mut radius_vdw) = (0.0f64, 0.0f64);
    for (p, a) in xyz.iter().zip(atoms) {
        let d = norm(sub(*p, centre));
        radius = radius.max(d);
        radius_vdw = radius_vdw.max(d + a.rvdw);
    }
    let mass: f64 = atoms.iter().map(|a| a.mass).sum();

    // Dipole moment
    let dipole = match charges {
        Some(q) => {
            let total: f64 = q.iter().sum();
            // A net charge makes the moment depend on the origin: the centre of mass is the convention
            let origin = if total.abs() > 1e-6 && mass > 0.0 {
                diagnostics.push(json!({ "code": "mol.dipoleOfIon", "severity": "info", "params": { "charge": total } }));
                scale(xyz.iter().zip(atoms).fold([0.0; 3], |s, (p, a)| add(s, scale(*p, a.mass))), 1.0 / mass)
            } else {
                centre
            };
            let mu = xyz.iter().zip(q).fold([0.0; 3], |s, (p, qi)| add(s, scale(sub(*p, origin), *qi)));
            let vector = scale(mu, E_ANGSTROM_DEBYE);
            Some(Dipole { vector, magnitude: norm(vector), source: "charges", origin })
        }
        None if !bond_info.is_empty() => {
            // Each bond carries Pauling's ionic character as a charge separation; lone pairs are left out
            let mut mu = [0.0; 3];
            let mut missing = false;
            for b in &bond_info {
                match (b.ionic_character, b.negative) {
                    (Some(c), Some(neg)) => {
                        let pos = if neg == b.i { b.j } else { b.i };
                        mu = add(mu, scale(sub(xyz[pos], xyz[neg]), c));
                    }
                    (None, _) => missing = true,
                    _ => {}
                }
            }
            diagnostics.push(json!({ "code": "mol.dipoleEstimated", "severity": "approx" }));
            if missing {
                diagnostics.push(json!({ "code": "mol.dipoleIncomplete", "severity": "unmodelled" }));
            }
            let vector = scale(mu, E_ANGSTROM_DEBYE);
            Some(Dipole { vector, magnitude: norm(vector), source: "bonds", origin: centre })
        }
        None => None,
    };

    Shape { lone_pairs, centres, bonds: bond_info, dipole, centre, axes, extent, radius, radius_vdw, mass, diagnostics }
}

#[cfg(test)]
mod tests {
    use super::super::elements::Table;
    use super::*;

    type Molecule = (Vec<Element>, Vec<V3>, Vec<(usize, usize, f64)>);
    /// centre, ligand, ligand directions, bond order, expected class, geometry and lone pairs
    type Case = (&'static str, &'static str, Vec<V3>, f64, &'static str, &'static str, usize);

    fn star(centre: &str, ligand: &str, dirs: &[V3], r: f64, order: f64) -> Molecule {
        let t = Table::builtin();
        let mut atoms = vec![t.get(centre)];
        let mut xyz = vec![[0.0; 3]];
        let mut bonds = Vec::new();
        for (k, d) in dirs.iter().enumerate() {
            atoms.push(t.get(ligand));
            xyz.push(scale(unit(*d), r));
            bonds.push((0, k + 1, order));
        }
        (atoms, xyz, bonds)
    }

    fn deg(a: f64) -> (f64, f64) {
        (a.to_radians().sin(), a.to_radians().cos())
    }

    /// Thirteen classes on idealised geometries: class, geometry and lone pairs of the central atom.
    #[test]
    fn vsepr_classes() {
        let (s52, c52) = deg(52.26);
        let (s60, c60) = deg(60.0);
        let tet = [[1.0, 1.0, 1.0], [1.0, -1.0, -1.0], [-1.0, 1.0, -1.0], [-1.0, -1.0, 1.0]];
        let tri = [[1.0, 0.0, 0.0], [-c60, s60, 0.0], [-c60, -s60, 0.0]];
        let cases: Vec<Case> = vec![
            ("C", "O", vec![[1.0, 0.0, 0.0], [-1.0, 0.0, 0.0]], 2.0, "AX2", "linear", 0),
            ("B", "F", tri.to_vec(), 1.0, "AX3", "trigonalPlanar", 0),
            ("S", "O", vec![[s60, c60, 0.0], [-s60, c60, 0.0]], 2.0, "AX2E", "bent", 1),
            ("C", "H", tet.to_vec(), 1.0, "AX4", "tetrahedral", 0),
            ("N", "H", tet[..3].to_vec(), 1.0, "AX3E", "trigonalPyramidal", 1),
            ("O", "H", vec![[s52, c52, 0.0], [-s52, c52, 0.0]], 1.0, "AX2E2", "bent", 2),
            ("P", "Cl", vec![tri[0], tri[1], tri[2], [0.0, 0.0, 1.0], [0.0, 0.0, -1.0]], 1.0, "AX5", "trigonalBipyramidal", 0),
            ("S", "F", vec![tri[0], tri[1], [0.0, 0.0, 1.0], [0.0, 0.0, -1.0]], 1.0, "AX4E", "seesaw", 1),
            ("Cl", "F", vec![tri[0], [0.0, 0.0, 1.0], [0.0, 0.0, -1.0]], 1.0, "AX3E2", "tShaped", 2),
            ("Xe", "F", vec![[0.0, 0.0, 1.0], [0.0, 0.0, -1.0]], 1.0, "AX2E3", "linear", 3),
            ("S", "F", vec![[1.0, 0.0, 0.0], [-1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, -1.0, 0.0], [0.0, 0.0, 1.0], [0.0, 0.0, -1.0]], 1.0, "AX6", "octahedral", 0),
            ("Br", "F", vec![[1.0, 0.0, 0.0], [-1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, -1.0, 0.0], [0.0, 0.0, 1.0]], 1.0, "AX5E", "squarePyramidal", 1),
            ("Xe", "F", vec![[1.0, 0.0, 0.0], [-1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, -1.0, 0.0]], 1.0, "AX4E2", "squarePlanar", 2),
        ];
        for (centre, ligand, dirs, order, class, geometry, pairs) in cases {
            let (atoms, xyz, bonds) = star(centre, ligand, &dirs, 1.5, order);
            let s = analyse(&atoms, &xyz, &bonds, None, None);
            let c = &s.centres[0];
            assert_eq!((c.class.as_str(), c.geometry, c.lone_pairs), (class, Some(geometry), pairs), "{centre}{ligand}");
            assert_eq!(c.observed, Some(geometry), "{class} from coordinates");
            assert_eq!(c.lobes.len(), pairs, "{class} lobes");
            // Every lobe keeps clear of the bonds: at least 85° from each (90° in the octahedral family)
            for l in &c.lobes {
                assert!((norm(*l) - 1.0).abs() < 1e-12);
                for d in &dirs {
                    assert!(degrees(angle(*l, unit(*d))) > 85.0, "{class}: lobe {:?} too close to {:?}", l, d);
                }
            }
            assert!(!s.diagnostics.iter().any(|d| d["code"] == "mol.geometryDiffers"), "{class}");
        }
    }

    #[test]
    fn water_lone_pairs_are_tetrahedral() {
        // With the ideal H–O–H angle the two lobes complete a regular tetrahedron: every domain angle 109.4712° (1e-9)
        let h = [[1.0, 1.0, 1.0], [1.0, -1.0, -1.0]];
        let (atoms, xyz, bonds) = star("O", "H", &h, 0.96, 1.0);
        let s = analyse(&atoms, &xyz, &bonds, None, None);
        let c = &s.centres[0];
        let mut all: Vec<V3> = h.iter().map(|d| unit(*d)).collect();
        all.extend(c.lobes.iter().copied());
        for i in 0..4 {
            for j in i + 1..4 {
                assert!((degrees(angle(all[i], all[j])) - 109.47122063449069).abs() < 1e-9);
            }
        }
        assert_eq!(c.electron_geometry, Some("tetrahedral"));
        assert_eq!(s.lone_pairs, vec![2, 0, 0]);
    }

    #[test]
    fn polarity_and_dipoles() {
        let t = Table::builtin();
        // Hydrogen chloride from charges ±0.2 e at 1.2746 Å: μ = q·d = 0.2 × 1.2746 × 4.8032 D, pointing from Cl to H
        let atoms = vec![t.get("H"), t.get("Cl")];
        let xyz = vec![[0.0, 0.0, 0.0], [1.2746, 0.0, 0.0]];
        let s = analyse(&atoms, &xyz, &[(0, 1, 1.0)], Some(&[0.2, -0.2]), None);
        let d = s.dipole.unwrap();
        assert!((d.magnitude - 0.2 * 1.2746 * E_ANGSTROM_DEBYE).abs() < 1e-12);
        assert!(d.vector[0] < 0.0 && d.source == "charges");
        assert_eq!((s.bonds[0].kind, s.bonds[0].negative), ("polar", Some(1)));
        assert!((s.bonds[0].delta.unwrap() - 0.96).abs() < 1e-12);
        // Without charges: the estimate, flagged; carbon dioxide and methane cancel to zero, water does not
        let s = analyse(&atoms, &xyz, &[(0, 1, 1.0)], None, None);
        let d = s.dipole.unwrap();
        assert_eq!(d.source, "bonds");
        assert!((d.magnitude - (1.0 - (-0.96f64 * 0.96 / 4.0).exp()) * 1.2746 * E_ANGSTROM_DEBYE).abs() < 1e-12);
        assert!(s.diagnostics.iter().any(|x| x["code"] == "mol.dipoleEstimated" && x["severity"] == "approx"));
        let (atoms, xyz, bonds) = star("C", "O", &[[1.0, 0.0, 0.0], [-1.0, 0.0, 0.0]], 1.16, 2.0);
        assert!(analyse(&atoms, &xyz, &bonds, None, None).dipole.unwrap().magnitude < 1e-12);
        let (atoms, xyz, bonds) = star("C", "H", &[[1.0, 1.0, 1.0], [1.0, -1.0, -1.0], [-1.0, 1.0, -1.0], [-1.0, -1.0, 1.0]], 1.087, 1.0);
        let s = analyse(&atoms, &xyz, &bonds, None, None);
        assert!(s.dipole.unwrap().magnitude < 1e-12);
        assert_eq!(s.bonds[0].kind, "nonpolar");
        assert!(s.centres[0].regular);
        let (s52, c52) = deg(52.26);
        let (atoms, xyz, bonds) = star("O", "H", &[[s52, c52, 0.0], [-s52, c52, 0.0]], 0.9572, 1.0);
        let s = analyse(&atoms, &xyz, &bonds, None, None);
        let d = s.dipole.unwrap();
        // The estimate lands near the measured 1.85 D (it is an estimate: within 0.3 D), along the bisector towards H
        assert!((d.magnitude - 1.85).abs() < 0.3, "{}", d.magnitude);
        assert!(d.vector[1] > 0.0 && d.vector[0].abs() < 1e-12);
        // A sodium–chlorine contact is ionic by the 1.7 rule
        let s = analyse(&[t.get("Na"), t.get("Cl")], &xyz[..2], &[(0, 1, 1.0)], None, None);
        assert_eq!(s.bonds[0].kind, "ionic");
    }

    #[test]
    fn frame_of_a_planar_molecule() {
        // Benzene ring in a tilted plane: the third axis is the plane normal, extents (r/√2, r/√2, 0)
        let t = Table::builtin();
        let (e1, e2) = (unit([1.0, 1.0, 0.0]), unit([-1.0, 1.0, 1.0]));
        let normal = cross(e1, e2);
        let mut xyz = Vec::new();
        for k in 0..6 {
            let a = (60.0 * k as f64).to_radians();
            xyz.push(add([3.0, -2.0, 1.0], add(scale(e1, 1.397 * a.cos()), scale(e2, 1.397 * a.sin()))));
        }
        let atoms: Vec<Element> = (0..6).map(|_| t.get("C")).collect();
        let bonds: Vec<(usize, usize, f64)> = (0..6).map(|k| (k, (k + 1) % 6, 1.5)).collect();
        let s = analyse(&atoms, &xyz, &bonds, None, None);
        assert!(norm(sub(s.centre, [3.0, -2.0, 1.0])) < 1e-12);
        assert!(dot(s.axes[2], normal).abs() > 1.0 - 1e-12);
        assert!((s.extent[0] - 1.397 / 2f64.sqrt()).abs() < 1e-12 && s.extent[2] < 1e-7);
        assert!((s.radius - 1.397).abs() < 1e-12 && (s.radius_vdw - 1.397 - 1.7).abs() < 1e-12);
        // Ring carbons without their hydrogens: two neighbours; 4 − 2 × 1.5 leaves one electron, no pair
        assert!(s.centres.iter().all(|c| c.class == "AX2" && c.lone_pairs == 0 && c.observed == Some("bent")));
        assert!((s.mass - 6.0 * 12.011).abs() < 1e-12);
    }

    #[test]
    fn transition_metal_centres_are_flagged() {
        let (atoms, xyz, bonds) = star("Cu", "N", &[[1.0, 0.0, 0.0], [-1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, -1.0, 0.0]], 2.0, 1.0);
        let s = analyse(&atoms, &xyz, &bonds, None, None);
        assert_eq!((s.centres[0].class.as_str(), s.centres[0].geometry), ("", Some("squarePlanar")));
        assert!(s.diagnostics.iter().any(|d| d["code"] == "mol.vseprNotApplicable" && d["severity"] == "unmodelled"));
    }
}
