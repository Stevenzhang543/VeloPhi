//! Crystals (26.64, D271): the conventional cell from a structure type and lattice constants or from an explicit basis,
//! its expansion to n₁ × n₂ × n₃ cells with the atoms on the far faces, nearest-neighbour bonds, the coordination
//! polyhedron of an atom, density and packing fraction.
//!
//! Neighbours. For every site of the basis the infinite lattice is searched for the shortest contact d_min; the first
//! shell is every neighbour within (1 + tolerance)·d_min. The default tolerance 0.13 joins the two sub-shells of a
//! hexagonal close packing with c/a away from the ideal value (ratio up to 1.11 for cadmium) and stays below the
//! second shell of the body-centred cubic lattice (ratio 2/√3 = 1.155). The size of the first shell is the
//! coordination number. A contact of the first shell of either atom is drawn as a bond when it is also no longer than
//! `bondScale` (default 1.3) times the sum of the two covalent radii — so the atoms of a noble-gas crystal have twelve
//! neighbours and no bonds.

use std::collections::{BTreeMap, BTreeSet};

use velophi_core::dmath;

use super::elements::{candidate_charges, ionic_radius, Element};
use super::shape::IONIC_FROM;
use super::vec3::{add, cross, dot, norm, scale, sub, unit, V3};

/// Mass of 1 u in grams (CODATA 2022).
pub const U_IN_GRAM: f64 = 1.66053906892e-24;

/// The conventional cell: lengths (Å), angles (degrees), the lattice vectors as rows, the volume (Å³).
#[derive(Clone, Debug)]
pub struct Cell {
    pub a: f64,
    pub b: f64,
    pub c: f64,
    pub alpha: f64,
    pub beta: f64,
    pub gamma: f64,
    pub vectors: [V3; 3],
    pub volume: f64,
}

/// cos of an angle in degrees, exact at 60°, 90° and 120°.
fn cos_deg(x: f64) -> f64 {
    if x == 90.0 {
        0.0
    } else if x == 60.0 {
        0.5
    } else if x == 120.0 {
        -0.5
    } else {
        dmath::cos(x * dmath::DEG)
    }
}

impl Cell {
    /// `None` when the lengths and angles do not span a cell.
    pub fn new(a: f64, b: f64, c: f64, alpha: f64, beta: f64, gamma: f64) -> Option<Cell> {
        let ok = |x: f64| x.is_finite() && x > 0.0;
        if !(ok(a) && ok(b) && ok(c) && ok(alpha) && ok(beta) && ok(gamma) && alpha < 180.0 && beta < 180.0 && gamma < 180.0) {
            return None;
        }
        let (ca, cb, cg) = (cos_deg(alpha), cos_deg(beta), cos_deg(gamma));
        let sg = (1.0 - cg * cg).sqrt();
        let cy = (ca - cb * cg) / sg;
        let cz2 = 1.0 - cb * cb - cy * cy;
        if cz2.is_nan() || cz2 <= 1e-12 {
            return None;
        }
        let vectors = [[a, 0.0, 0.0], [b * cg, b * sg, 0.0], [c * cb, c * cy, c * cz2.sqrt()]];
        let volume = dot(vectors[0], cross(vectors[1], vectors[2]));
        Some(Cell { a, b, c, alpha, beta, gamma, vectors, volume })
    }

    /// Cartesian position of fractional coordinates.
    pub fn cart(&self, f: V3) -> V3 {
        add(add(scale(self.vectors[0], f[0]), scale(self.vectors[1], f[1])), scale(self.vectors[2], f[2]))
    }
}

/// An atom of the basis: index into the species list and fractional coordinates in [0, 1).
#[derive(Clone, Debug)]
pub struct Site {
    pub species: usize,
    pub frac: V3,
}

#[derive(Clone, Debug)]
pub struct Crystal {
    pub cell: Cell,
    pub species: Vec<Element>,
    pub sites: Vec<Site>,
}

/// A fractional coordinate folded into [0, 1).
pub fn wrap(f: f64) -> f64 {
    let w = f - f.floor();
    if w >= 1.0 - 1e-9 || w <= 1e-9 {
        0.0
    } else {
        w
    }
}

const FCC: [V3; 4] = [[0.0, 0.0, 0.0], [0.5, 0.5, 0.0], [0.5, 0.0, 0.5], [0.0, 0.5, 0.5]];
const THIRD: f64 = 1.0 / 3.0;
const TWO_THIRDS: f64 = 2.0 / 3.0;

/// What a structure type needs besides the species.
pub struct Standard {
    /// Number of species the type places.
    pub species: usize,
    /// Sites as (species index, fractional coordinates).
    pub sites: Vec<(usize, V3)>,
    /// The type has a hexagonal cell (γ = 120°).
    pub hexagonal: bool,
}

/// The basis of a standard structure type in its conventional cell. `u` is the internal parameter of wurtzite
/// (default 3/8) and rutile (default 0.305). `None` for a type that is only known by an explicit basis.
pub fn standard(structure: &str, u: Option<f64>) -> Option<Standard> {
    let shifted = |species: usize, d: V3| -> Vec<(usize, V3)> { FCC.iter().map(|p| (species, [wrap(p[0] + d[0]), wrap(p[1] + d[1]), wrap(p[2] + d[2])])).collect() };
    let on = |species: usize, sites: &[V3]| -> Vec<(usize, V3)> { sites.iter().map(|p| (species, *p)).collect() };
    let (species, sites, hexagonal) = match structure {
        "sc" | "simple-cubic" => (1, on(0, &[[0.0; 3]]), false),
        "fcc" | "ccp" => (1, shifted(0, [0.0; 3]), false),
        "bcc" | "bct" => (1, on(0, &[[0.0; 3], [0.5, 0.5, 0.5]]), false),
        "hcp" => (1, on(0, &[[0.0; 3], [THIRD, TWO_THIRDS, 0.5]]), true),
        "dhcp" => (1, on(0, &[[0.0; 3], [0.0, 0.0, 0.5], [THIRD, TWO_THIRDS, 0.25], [TWO_THIRDS, THIRD, 0.75]]), true),
        "diamond" => (1, [shifted(0, [0.0; 3]), shifted(0, [0.25, 0.25, 0.25])].concat(), false),
        "white-tin" => (1, on(0, &[[0.0; 3], [0.5, 0.0, 0.25], [0.5, 0.5, 0.5], [0.0, 0.5, 0.75]]), false),
        "graphite" => (1, on(0, &[[0.0, 0.0, 0.25], [0.0, 0.0, 0.75], [THIRD, TWO_THIRDS, 0.25], [TWO_THIRDS, THIRD, 0.75]]), true),
        "rock-salt" => (2, [shifted(0, [0.0; 3]), shifted(1, [0.5, 0.5, 0.5])].concat(), false),
        "caesium-chloride" => (2, vec![(0, [0.0; 3]), (1, [0.5, 0.5, 0.5])], false),
        "zinc-blende" => (2, [shifted(0, [0.0; 3]), shifted(1, [0.25, 0.25, 0.25])].concat(), false),
        "wurtzite" => {
            let u = u.unwrap_or(0.375);
            (2, vec![(0, [THIRD, TWO_THIRDS, 0.0]), (0, [TWO_THIRDS, THIRD, 0.5]), (1, [THIRD, TWO_THIRDS, wrap(u)]), (1, [TWO_THIRDS, THIRD, wrap(0.5 + u)])], true)
        }
        "fluorite" | "antifluorite" => {
            let mut s = shifted(0, [0.0; 3]);
            for x in [0.25, 0.75] {
                for y in [0.25, 0.75] {
                    for z in [0.25, 0.75] {
                        s.push((1, [x, y, z]));
                    }
                }
            }
            (2, s, false)
        }
        "rutile" => {
            let u = u.unwrap_or(0.305);
            (2, vec![(0, [0.0; 3]), (0, [0.5, 0.5, 0.5]), (1, [u, u, 0.0]), (1, [1.0 - u, 1.0 - u, 0.0]), (1, [0.5 + u, 0.5 - u, 0.5]), (1, [0.5 - u, 0.5 + u, 0.5])], false)
        }
        "perovskite" => (3, vec![(0, [0.0; 3]), (1, [0.5, 0.5, 0.5]), (2, [0.5, 0.5, 0.0]), (2, [0.5, 0.0, 0.5]), (2, [0.0, 0.5, 0.5])], false),
        _ => return None,
    };
    Some(Standard { species, sites, hexagonal })
}

/// A neighbour of a site in the infinite lattice.
#[derive(Clone, Debug)]
pub struct Neighbour {
    pub site: usize,
    /// Cell of the neighbour relative to the cell of the site.
    pub offset: [i32; 3],
    /// Vector from the site to the neighbour (Å).
    pub vector: V3,
    pub distance: f64,
    /// Short enough for the radii: drawn as a bond.
    pub bonded: bool,
}

/// First shells of the sites of the basis.
#[derive(Clone, Debug)]
pub struct Shells {
    /// Shortest contact of each site (Å).
    pub nearest: Vec<f64>,
    pub shell: Vec<Vec<Neighbour>>,
}

/// Search the lattice around every site (cells −2 … 2 in each direction: the first shell is never further than the
/// shortest lattice translation times 1 + tolerance).
pub fn shells(c: &Crystal, tolerance: f64, bond_scale: f64) -> Shells {
    let pos: Vec<V3> = c.sites.iter().map(|s| c.cell.cart(s.frac)).collect();
    let mut nearest = Vec::with_capacity(pos.len());
    let mut shell = Vec::with_capacity(pos.len());
    for (s, ps) in pos.iter().enumerate() {
        let mut all: Vec<Neighbour> = Vec::new();
        let mut dmin = f64::INFINITY;
        for i in -2i32..=2 {
            for j in -2i32..=2 {
                for k in -2i32..=2 {
                    let shift = c.cell.cart([i as f64, j as f64, k as f64]);
                    for (t, pt) in pos.iter().enumerate() {
                        if t == s && i == 0 && j == 0 && k == 0 {
                            continue;
                        }
                        let vector = sub(add(*pt, shift), *ps);
                        let distance = norm(vector);
                        if distance < 1e-6 {
                            continue;
                        }
                        dmin = dmin.min(distance);
                        all.push(Neighbour { site: t, offset: [i, j, k], vector, distance, bonded: false });
                    }
                }
            }
        }
        let limit = dmin * (1.0 + tolerance);
        let rs = c.species[c.sites[s].species].rcov;
        let mut first: Vec<Neighbour> = all.into_iter().filter(|n| n.distance <= limit).collect();
        for n in first.iter_mut() {
            n.bonded = n.distance <= bond_scale * (rs + c.species[c.sites[n.site].species].rcov);
        }
        nearest.push(if dmin.is_finite() { dmin } else { 0.0 });
        shell.push(first);
    }
    Shells { nearest, shell }
}

/// An atom of the expanded block.
#[derive(Clone, Debug)]
pub struct BlockAtom {
    pub site: usize,
    pub cell: [i32; 3],
    pub pos: V3,
}

/// The crystal expanded to n₁ × n₂ × n₃ cells.
#[derive(Clone, Debug)]
pub struct Block {
    pub n: [usize; 3],
    pub atoms: Vec<BlockAtom>,
    index: BTreeMap<([i32; 3], usize), usize>,
    /// Bonds between displayed atoms `(i, j, length)`, i < j, ascending.
    pub bonds: Vec<(usize, usize, f64)>,
    /// Cell edges as segments; the first `outer_edges` are the twelve edges of the block.
    pub edges: Vec<[f64; 6]>,
    pub outer_edges: usize,
    pub centre: V3,
    /// Largest distance of a nucleus from the centre (Å).
    pub radius: f64,
}

/// Expand: every atom whose fractional coordinates lie in [0, nᵢ] — the atoms on the far faces, edges and corners
/// included, so each face of the block shows the same atoms as its opposite.
pub fn expand(c: &Crystal, sh: &Shells, n: [usize; 3]) -> Block {
    let mut atoms = Vec::new();
    let mut index = BTreeMap::new();
    for i in 0..=n[0] {
        for j in 0..=n[1] {
            for k in 0..=n[2] {
                for (t, s) in c.sites.iter().enumerate() {
                    let f = [i as f64 + s.frac[0], j as f64 + s.frac[1], k as f64 + s.frac[2]];
                    if f[0] > n[0] as f64 + 1e-9 || f[1] > n[1] as f64 + 1e-9 || f[2] > n[2] as f64 + 1e-9 {
                        continue;
                    }
                    let cell = [i as i32, j as i32, k as i32];
                    index.insert((cell, t), atoms.len());
                    atoms.push(BlockAtom { site: t, cell, pos: c.cell.cart(f) });
                }
            }
        }
    }
    let mut pairs: BTreeSet<(usize, usize)> = BTreeSet::new();
    let mut lengths: BTreeMap<(usize, usize), f64> = BTreeMap::new();
    for (a, atom) in atoms.iter().enumerate() {
        for nb in sh.shell[atom.site].iter().filter(|nb| nb.bonded) {
            let cell = [atom.cell[0] + nb.offset[0], atom.cell[1] + nb.offset[1], atom.cell[2] + nb.offset[2]];
            if let Some(&b) = index.get(&(cell, nb.site)) {
                let key = (a.min(b), a.max(b));
                if pairs.insert(key) {
                    lengths.insert(key, nb.distance);
                }
            }
        }
    }
    let bonds = pairs.iter().map(|k| (k.0, k.1, lengths[k])).collect();

    // Cell edges: one segment per lattice line through the block; the twelve outer ones first
    let size = [n[0] as f64, n[1] as f64, n[2] as f64];
    let (mut outer, mut inner) = (Vec::new(), Vec::new());
    for axis in 0..3 {
        let (p, q) = ((axis + 1) % 3, (axis + 2) % 3);
        for u in 0..=n[p] {
            for v in 0..=n[q] {
                let mut f0 = [0.0; 3];
                f0[p] = u as f64;
                f0[q] = v as f64;
                let mut f1 = f0;
                f1[axis] = size[axis];
                let (a, b) = (c.cell.cart(f0), c.cell.cart(f1));
                let seg = [a[0], a[1], a[2], b[0], b[1], b[2]];
                if (u == 0 || u == n[p]) && (v == 0 || v == n[q]) {
                    outer.push(seg);
                } else {
                    inner.push(seg);
                }
            }
        }
    }
    let outer_edges = outer.len();
    outer.extend(inner);
    let centre = c.cell.cart([size[0] / 2.0, size[1] / 2.0, size[2] / 2.0]);
    let radius = atoms.iter().fold(norm(sub(c.cell.cart(size), centre)), |r, a| r.max(norm(sub(a.pos, centre))));
    Block { n, atoms, index, bonds, edges: outer, outer_edges, centre, radius }
}

/// The first shell of a displayed atom as a polyhedron.
#[derive(Clone, Debug)]
pub struct Polyhedron {
    pub atom: usize,
    pub number: usize,
    /// Shortest and longest centre–vertex distance (Å).
    pub distance: (f64, f64),
    /// Vertices: displayed atom index (`None` outside the block), site, position.
    pub vertices: Vec<(Option<usize>, usize, V3)>,
    /// Faces as vertex loops, counter-clockwise seen from outside.
    pub faces: Vec<Vec<usize>>,
    /// Name key of the polyhedron; "" when it has none here.
    pub shape: &'static str,
}

/// Faces of the convex hull of a few points: every supporting plane through three of them, with all the points lying
/// on it ordered around the outward normal (so a square face is one loop, not two triangles).
pub fn hull_faces(p: &[V3]) -> Vec<Vec<usize>> {
    let n = p.len();
    if n < 3 {
        return Vec::new();
    }
    let centroid = scale(p.iter().fold([0.0; 3], |s, v| add(s, *v)), 1.0 / n as f64);
    let size = p.iter().fold(0.0f64, |m, v| m.max(norm(sub(*v, centroid))));
    let eps = 1e-6 * size.max(1e-12);
    let mut seen: BTreeSet<Vec<usize>> = BTreeSet::new();
    let mut faces = Vec::new();
    for i in 0..n {
        for j in i + 1..n {
            for k in j + 1..n {
                let mut normal = cross(sub(p[j], p[i]), sub(p[k], p[i]));
                if norm(normal) < 1e-9 * size * size {
                    continue;
                }
                normal = unit(normal);
                let side: Vec<f64> = p.iter().map(|v| dot(normal, sub(*v, p[i]))).collect();
                let above = side.iter().any(|s| *s > eps);
                let below = side.iter().any(|s| *s < -eps);
                if above && below {
                    continue;
                }
                if above {
                    normal = scale(normal, -1.0);
                }
                let members: Vec<usize> = (0..n).filter(|m| side[*m].abs() <= eps).collect();
                if !seen.insert(members.clone()) {
                    continue;
                }
                // Order around the face centre, counter-clockwise about the outward normal
                let fc = scale(members.iter().fold([0.0; 3], |s, m| add(s, p[*m])), 1.0 / members.len() as f64);
                let e1 = unit(sub(p[members[0]], fc));
                let e2 = cross(normal, e1);
                let mut loop_: Vec<(f64, usize)> = members.iter().map(|m| (dmath::atan2(dot(sub(p[*m], fc), e2), dot(sub(p[*m], fc), e1)), *m)).collect();
                loop_.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal).then(a.1.cmp(&b.1)));
                // Start every loop at its lowest index so the output does not depend on the triple that found it
                let start = loop_.iter().enumerate().min_by_key(|(_, v)| v.1).map(|(q, _)| q).unwrap_or(0);
                let ordered: Vec<usize> = (0..loop_.len()).map(|q| loop_[(start + q) % loop_.len()].1).collect();
                faces.push(ordered);
                // A planar set has one face (seen from both sides it is the same loop)
                if !above && !below {
                    return faces;
                }
            }
        }
    }
    faces.sort();
    faces
}

/// Name of a coordination polyhedron from its vertices (relative to the central atom) and faces.
pub fn polyhedron_shape(v: &[V3], faces: &[Vec<usize>]) -> &'static str {
    let tri = faces.iter().filter(|f| f.len() == 3).count();
    let quad = faces.iter().filter(|f| f.len() == 4).count();
    let planar = faces.len() == 1;
    // Every vertex has its opposite: the polyhedron has a centre of symmetry at the atom
    let size = v.iter().fold(0.0f64, |m, p| m.max(norm(*p)));
    let centred = v.iter().all(|p| v.iter().any(|q| norm(add(*p, *q)) < 1e-6 * size.max(1e-12)));
    match (v.len(), faces.len()) {
        (2, _) => "linear",
        (3, _) => "triangle",
        (4, _) if planar => "square",
        (4, 4) => "tetrahedron",
        (5, 6) => "trigonalBipyramid",
        (5, 5) => "squarePyramid",
        (6, 8) if tri == 8 => "octahedron",
        (6, 5) => "trigonalPrism",
        (8, 6) if quad == 6 => "cube",
        (8, 10) => "squareAntiprism",
        (12, 14) if tri == 8 && quad == 6 => {
            if centred {
                "cuboctahedron"
            } else {
                "anticuboctahedron"
            }
        }
        (12, 20) => "icosahedron",
        _ => "",
    }
}

impl Block {
    /// Displayed atom at a site of a cell.
    pub fn find(&self, cell: [i32; 3], site: usize) -> Option<usize> {
        self.index.get(&(cell, site)).copied()
    }

    /// The first shell of a displayed atom.
    pub fn polyhedron(&self, sh: &Shells, atom: usize) -> Option<Polyhedron> {
        let a = self.atoms.get(atom)?;
        let shell = &sh.shell[a.site];
        if shell.is_empty() {
            return None;
        }
        let vertices: Vec<(Option<usize>, usize, V3)> = shell.iter().map(|nb| (self.find([a.cell[0] + nb.offset[0], a.cell[1] + nb.offset[1], a.cell[2] + nb.offset[2]], nb.site), nb.site, add(a.pos, nb.vector))).collect();
        let rel: Vec<V3> = shell.iter().map(|nb| nb.vector).collect();
        let faces = hull_faces(&rel);
        let shape = polyhedron_shape(&rel, &faces);
        let distance = shell.iter().fold((f64::INFINITY, 0.0f64), |(lo, hi), nb| (lo.min(nb.distance), hi.max(nb.distance)));
        Some(Polyhedron { atom, number: shell.len(), distance, vertices, faces, shape })
    }

    /// The atom to show a polyhedron for when none is chosen: among the atoms whose whole first shell is displayed,
    /// the one nearest the centre of the block (then the least electronegative species, then the lowest index).
    pub fn default_polyhedron_atom(&self, c: &Crystal, sh: &Shells) -> Option<usize> {
        let mut best: Option<(f64, f64, usize)> = None;
        for (i, a) in self.atoms.iter().enumerate() {
            let shell = &sh.shell[a.site];
            if shell.len() < 2 || !shell.iter().all(|nb| self.find([a.cell[0] + nb.offset[0], a.cell[1] + nb.offset[1], a.cell[2] + nb.offset[2]], nb.site).is_some()) {
                continue;
            }
            let d = norm(sub(a.pos, self.centre));
            let en = c.species[c.sites[a.site].species].en.unwrap_or(9.0);
            let better = match best {
                None => true,
                Some((bd, ben, _)) => d < bd - 1e-6 || (d < bd + 1e-6 && en < ben - 1e-9),
            };
            if better {
                best = Some((d, en, i));
            }
        }
        best.map(|b| b.2)
    }
}

impl Crystal {
    /// Number of atoms of each species in the cell.
    pub fn counts(&self) -> Vec<usize> {
        let mut n = vec![0; self.species.len()];
        for s in &self.sites {
            n[s.species] += 1;
        }
        n
    }

    /// Mass of the cell contents (u).
    pub fn cell_mass(&self) -> f64 {
        self.sites.iter().map(|s| self.species[s.species].mass).sum()
    }

    /// Density (g/cm³) from the cell contents and the atomic masses.
    pub fn density(&self) -> f64 {
        self.cell_mass() * U_IN_GRAM / (self.cell.volume * 1e-24)
    }

    /// Formula units per cell: the greatest common divisor of the species counts.
    pub fn formula_units(&self) -> usize {
        fn gcd(a: usize, b: usize) -> usize {
            if b == 0 {
                a
            } else {
                gcd(b, a % b)
            }
        }
        self.counts().into_iter().fold(0, gcd).max(1)
    }

    /// Packing fraction of a crystal of one element: touching hard spheres of radius d_min / 2.
    pub fn packing(&self, sh: &Shells) -> Option<f64> {
        if self.species.len() != 1 || self.sites.is_empty() {
            return None;
        }
        let r = sh.nearest.iter().fold(f64::INFINITY, |m, d| m.min(*d)) / 2.0;
        Some(self.sites.len() as f64 * 4.0 / 3.0 * dmath::PI_VALUE * r * r * r / self.cell.volume)
    }

    /// Radii for the space-filling picture, per species, and the model they come from:
    /// "given" (ionic radii of the request), "touching" (one element: half the shortest contact), "ionic" (Shannon radii
    /// of the charges that make the cell neutral, when the bonded species differ by at least 1.7 in electronegativity),
    /// "vdw" otherwise. With "ionic" the charges are returned too.
    pub fn fill_radii(&self, sh: &Shells) -> (Vec<f64>, &'static str, Vec<Option<i32>>) {
        let none = vec![None; self.species.len()];
        if !self.species.is_empty() && self.species.iter().all(|e| e.rion.is_some()) {
            return (self.species.iter().map(|e| e.rion.unwrap_or(e.rvdw)).collect(), "given", none);
        }
        if self.species.len() == 1 {
            let r = sh.nearest.iter().fold(f64::INFINITY, |m, d| m.min(*d)) / 2.0;
            if r.is_finite() && r > 0.0 {
                return (vec![r], "touching", none);
            }
        }
        let vdw = || (self.species.iter().map(|e| e.rvdw).collect::<Vec<f64>>(), "vdw", vec![None; self.species.len()]);
        // Ionic when two species in contact differ enough in electronegativity
        let mut delta = 0.0f64;
        for (s, shell) in sh.shell.iter().enumerate() {
            for nb in shell {
                if let (Some(a), Some(b)) = (self.species[self.sites[s].species].en, self.species[self.sites[nb.site].species].en) {
                    delta = delta.max((a - b).abs());
                }
            }
        }
        if delta < IONIC_FROM {
            return vdw();
        }
        let counts = self.counts();
        let options: Vec<Vec<i32>> = self.species.iter().map(|e| candidate_charges(&e.symbol).into_iter().filter(|q| ionic_radius(&e.symbol, *q).is_some()).collect()).collect();
        if options.iter().any(|o| o.is_empty()) {
            return vdw();
        }
        // First neutral assignment in the order of the candidates, anions more electronegative than cations
        let mut pick = vec![0usize; options.len()];
        loop {
            let q: Vec<i32> = pick.iter().zip(&options).map(|(k, o)| o[*k]).collect();
            let total: i64 = q.iter().zip(&counts).map(|(qi, n)| *qi as i64 * *n as i64).sum();
            let en = |i: usize| self.species[i].en.unwrap_or(0.0);
            let ordered = (0..q.len()).all(|i| (0..q.len()).all(|j| !(q[i] < 0 && q[j] > 0) || en(i) > en(j)));
            if total == 0 && ordered && q.iter().any(|x| *x < 0) {
                let radii = q.iter().zip(&self.species).map(|(qi, e)| ionic_radius(&e.symbol, *qi).unwrap_or(e.rvdw)).collect();
                return (radii, "ionic", q.into_iter().map(Some).collect());
            }
            let mut k = options.len();
            loop {
                if k == 0 {
                    return vdw();
                }
                k -= 1;
                pick[k] += 1;
                if pick[k] < options[k].len() {
                    break;
                }
                pick[k] = 0;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::super::elements::Table;
    use super::*;

    fn build(structure: &str, species: &[&str], a: f64, c: Option<f64>) -> (Crystal, Shells) {
        let t = Table::builtin();
        let st = standard(structure, None).unwrap();
        assert_eq!(st.species, species.len());
        let cell = if st.hexagonal { Cell::new(a, a, c.unwrap(), 90.0, 90.0, 120.0) } else { Cell::new(a, a, c.unwrap_or(a), 90.0, 90.0, 90.0) }.unwrap();
        let cr = Crystal { cell, species: species.iter().map(|s| t.get(s)).collect(), sites: st.sites.iter().map(|(s, f)| Site { species: *s, frac: *f }).collect() };
        let sh = shells(&cr, 0.13, 1.3);
        (cr, sh)
    }

    #[test]
    fn coordination_numbers_and_packing_fractions() {
        // Closed forms: fcc π/(3√2) = 0.7405, bcc π√3/8 = 0.6802, ideal hcp 0.7405, diamond π√3/16 = 0.3401; tolerance 1e-12
        let pi = dmath::PI_VALUE;
        let ideal = (8.0f64 / 3.0).sqrt();
        // structure, element, a, c, coordination number, packing fraction, nearest-neighbour distance
        type Case = (&'static str, &'static str, f64, Option<f64>, usize, f64, f64);
        let cases: [Case; 4] = [
            ("fcc", "Cu", 3.615, None, 12, pi / (3.0 * 2f64.sqrt()), 3.615 / 2f64.sqrt()),
            ("bcc", "Fe", 2.866, None, 8, pi * 3f64.sqrt() / 8.0, 2.866 * 3f64.sqrt() / 2.0),
            ("hcp", "Mg", 3.2, Some(3.2 * ideal), 12, pi / (3.0 * 2f64.sqrt()), 3.2),
            ("diamond", "C", 3.567, None, 4, pi * 3f64.sqrt() / 16.0, 3.567 * 3f64.sqrt() / 4.0),
        ];
        for (structure, el, a, c, cn, packing, nearest) in cases {
            let (cr, sh) = build(structure, &[el], a, c);
            for s in 0..cr.sites.len() {
                assert_eq!(sh.shell[s].len(), cn, "{structure} site {s}");
                assert!((sh.nearest[s] - nearest).abs() < 1e-12, "{structure}");
            }
            assert!((cr.packing(&sh).unwrap() - packing).abs() < 1e-12, "{structure}: {}", cr.packing(&sh).unwrap());
            let (r, model, _) = cr.fill_radii(&sh);
            assert_eq!(model, "touching");
            assert!((r[0] - nearest / 2.0).abs() < 1e-12);
        }
        assert!((pi / (3.0 * 2f64.sqrt()) - 0.7405).abs() < 5e-5 && (pi * 3f64.sqrt() / 8.0 - 0.6802).abs() < 5e-5 && (pi * 3f64.sqrt() / 16.0 - 0.3401).abs() < 5e-5);
        // Real hexagonal metals keep twelve neighbours although c/a is not ideal (Mg 1.624, Zn 1.856, Cd 1.886)
        for (a, c) in [(3.209, 5.211), (2.665, 4.947), (2.979, 5.618)] {
            let (_, sh) = build("hcp", &["Mg"], a, Some(c));
            assert_eq!(sh.shell[0].len(), 12);
        }
    }

    #[test]
    fn rock_salt_density_and_octahedron() {
        // ρ = 4 M / (N_A a³) with a = 5.640 Å: 2.1636 g/cm³ (handbook 2.165); tolerance 2e-3 against the handbook value
        let (cr, sh) = build("rock-salt", &["Na", "Cl"], 5.640, None);
        let closed = 4.0 * (22.98976928 + 35.45) * U_IN_GRAM / (5.640f64 * 5.640 * 5.640 * 1e-24);
        assert!((cr.density() - closed).abs() < 1e-12);
        assert!((cr.density() - 2.165).abs() < 2e-3, "{}", cr.density());
        assert_eq!((cr.formula_units(), cr.counts()), (4, vec![4, 4]));
        assert!(cr.packing(&sh).is_none());
        let (r, model, q) = cr.fill_radii(&sh);
        assert_eq!((model, q), ("ionic", vec![Some(1), Some(-1)]));
        assert_eq!(r, vec![1.02, 1.81]);
        // One cell: 14 Na (corners and faces) + 13 Cl (edges and centre)
        let b = expand(&cr, &sh, [1, 1, 1]);
        assert_eq!(b.atoms.len(), 27);
        assert_eq!(b.atoms.iter().filter(|a| cr.sites[a.site].species == 0).count(), 14);
        assert_eq!(b.bonds.len(), 54);
        assert!(b.bonds.iter().all(|x| (x.2 - 2.82).abs() < 1e-12));
        assert_eq!((b.edges.len(), b.outer_edges), (12, 12));
        // 2 × 2 × 2: 5³ = 125 atoms; the atom at the centre is sodium inside an octahedron of chlorine
        let b = expand(&cr, &sh, [2, 2, 2]);
        assert_eq!(b.atoms.len(), 125);
        assert_eq!((b.edges.len(), b.outer_edges), (27, 12));
        let centre = b.default_polyhedron_atom(&cr, &sh).unwrap();
        assert!(norm(sub(b.atoms[centre].pos, b.centre)) < 1e-12);
        let p = b.polyhedron(&sh, centre).unwrap();
        assert_eq!((p.number, p.shape, p.faces.len()), (6, "octahedron", 8));
        assert!(p.vertices.iter().all(|v| v.0.is_some() && cr.sites[v.1].species != cr.sites[b.atoms[centre].site].species));
        assert!((p.distance.0 - 2.82).abs() < 1e-12 && (p.distance.1 - 2.82).abs() < 1e-12);
        // Outward faces: every face normal points away from the central atom
        let pos = b.atoms[centre].pos;
        for f in &p.faces {
            let (a, bb, c) = (sub(p.vertices[f[0]].2, pos), sub(p.vertices[f[1]].2, pos), sub(p.vertices[f[2]].2, pos));
            assert!(dot(cross(sub(bb, a), sub(c, a)), a) > 0.0);
        }
    }

    #[test]
    fn polyhedra_of_the_standard_types() {
        let shape_of = |structure: &str, species: &[&str], a: f64, c: Option<f64>, site: usize| -> (usize, &'static str) {
            let (cr, sh) = build(structure, species, a, c);
            let b = expand(&cr, &sh, [2, 2, 2]);
            let atom = b.atoms.iter().position(|x| x.site == site && x.cell == [1, 1, 1]).unwrap();
            let p = b.polyhedron(&sh, atom).unwrap();
            (p.number, p.shape)
        };
        assert_eq!(shape_of("fcc", &["Cu"], 3.615, None, 0), (12, "cuboctahedron"));
        assert_eq!(shape_of("hcp", &["Mg"], 3.209, Some(5.211), 0), (12, "anticuboctahedron"));
        assert_eq!(shape_of("bcc", &["Fe"], 2.866, None, 0), (8, "cube"));
        assert_eq!(shape_of("diamond", &["C"], 3.567, None, 0), (4, "tetrahedron"));
        assert_eq!(shape_of("caesium-chloride", &["Cs", "Cl"], 4.123, None, 0), (8, "cube"));
        assert_eq!(shape_of("zinc-blende", &["Zn", "S"], 5.409, None, 4), (4, "tetrahedron"));
        assert_eq!(shape_of("fluorite", &["Ca", "F"], 5.463, None, 0), (8, "cube"));
        assert_eq!(shape_of("fluorite", &["Ca", "F"], 5.463, None, 4), (4, "tetrahedron"));
        assert_eq!(shape_of("rutile", &["Ti", "O"], 4.594, Some(2.959), 0), (6, "octahedron"));
        assert_eq!(shape_of("rutile", &["Ti", "O"], 4.594, Some(2.959), 2), (3, "triangle"));
        assert_eq!(shape_of("perovskite", &["Sr", "Ti", "O"], 3.905, None, 1), (6, "octahedron"));
        assert_eq!(shape_of("perovskite", &["Sr", "Ti", "O"], 3.905, None, 0), (12, "cuboctahedron"));
        assert_eq!(shape_of("graphite", &["C"], 2.461, Some(6.708), 0), (3, "triangle"));
        assert_eq!(shape_of("wurtzite", &["Zn", "O"], 3.25, Some(5.207), 0), (4, "tetrahedron"));
        assert_eq!(shape_of("sc", &["Po"], 3.359, None, 0), (6, "octahedron"));
    }

    #[test]
    fn hexagonal_cell_and_noble_gas() {
        // V = (√3/2) a² c; the cell vectors keep the lengths and the 120° angle
        let c = Cell::new(3.0, 3.0, 5.0, 90.0, 90.0, 120.0).unwrap();
        assert!((c.volume - 3f64.sqrt() / 2.0 * 45.0).abs() < 1e-12);
        assert!((norm(c.vectors[1]) - 3.0).abs() < 1e-15 && (dot(c.vectors[0], c.vectors[1]) + 4.5).abs() < 1e-15);
        // A general triclinic cell against V = abc √(1 − cos²α − cos²β − cos²γ + 2 cos α cos β cos γ)
        let t = Cell::new(4.0, 5.0, 6.0, 80.0, 95.0, 105.0).unwrap();
        let (ca, cb, cg) = (80f64.to_radians().cos(), 95f64.to_radians().cos(), 105f64.to_radians().cos());
        assert!((t.volume - 120.0 * (1.0 - ca * ca - cb * cb - cg * cg + 2.0 * ca * cb * cg).sqrt()).abs() < 1e-10);
        assert!(Cell::new(1.0, 1.0, 1.0, 30.0, 30.0, 170.0).is_none());
        // Solid argon: twelve neighbours at 3.72 Å, far beyond the covalent radii — no bonds drawn
        let (cr, sh) = build("fcc", &["Ar"], 5.256, None);
        assert_eq!(sh.shell[0].len(), 12);
        assert!(expand(&cr, &sh, [1, 1, 1]).bonds.is_empty());
        assert_eq!(wrap(-0.25), 0.75);
        assert_eq!(wrap(1.0), 0.0);
    }

    #[test]
    fn hull_of_a_cube_has_six_square_faces() {
        let mut p = Vec::new();
        for x in [-1.0, 1.0] {
            for y in [-1.0, 1.0] {
                for z in [-1.0, 1.0] {
                    p.push([x, y, z]);
                }
            }
        }
        let f = hull_faces(&p);
        assert_eq!(f.len(), 6);
        assert!(f.iter().all(|l| l.len() == 4));
        // A loop walks the square: consecutive vertices differ in one coordinate
        for l in &f {
            for k in 0..4 {
                assert!((norm(sub(p[l[k]], p[l[(k + 1) % 4]])) - 2.0).abs() < 1e-12);
            }
        }
        assert_eq!(hull_faces(&[[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [-1.0, 0.0, 0.0], [0.0, -1.0, 0.0]]).len(), 1);
    }
}
