//! Measurements on a geometry: distance, bond angle, dihedral, and all bond lengths and bond angles of a molecule.

use velophi_core::dmath;

use super::vec3::{angle, cross, degrees, dot, norm, scale, sub, unit, V3};

/// Distance between two points (Å).
pub fn distance(a: V3, b: V3) -> f64 {
    norm(sub(a, b))
}

/// The angle a–b–c at `b` in degrees, 0 … 180.
pub fn angle_deg(a: V3, b: V3, c: V3) -> f64 {
    degrees(angle(sub(a, b), sub(c, b)))
}

/// The dihedral a–b–c–d in degrees, −180 … 180, with the IUPAC sign: positive when, looking from b to c, the bond
/// c–d is turned clockwise from the bond b–a. `None` when a or d lies on the axis b–c.
pub fn dihedral_deg(a: V3, b: V3, c: V3, d: V3) -> Option<f64> {
    let axis = unit(sub(c, b));
    let (b0, b2) = (sub(a, b), sub(d, c));
    let v = sub(b0, scale(axis, dot(b0, axis)));
    let w = sub(b2, scale(axis, dot(b2, axis)));
    if norm(v) < 1e-9 || norm(w) < 1e-9 || norm(axis) == 0.0 {
        return None;
    }
    Some(degrees(dmath::atan2(dot(cross(axis, v), w), dot(v, w))))
}

/// Neighbour lists (ascending) of a bond list `(i, j, order)`.
pub fn neighbours(count: usize, bonds: &[(usize, usize, f64)]) -> Vec<Vec<usize>> {
    let mut nb = vec![Vec::new(); count];
    for &(i, j, _) in bonds {
        if i != j && i < count && j < count && !nb[i].contains(&j) {
            nb[i].push(j);
            nb[j].push(i);
        }
    }
    for list in nb.iter_mut() {
        list.sort_unstable();
    }
    nb
}

/// Every bond angle i–j–k (j the vertex, i < k) of a molecule, by vertex then by neighbours: the index triples and the
/// angles in degrees.
pub fn all_angles(xyz: &[V3], nb: &[Vec<usize>]) -> (Vec<i32>, Vec<f64>) {
    let (mut ijk, mut deg) = (Vec::new(), Vec::new());
    for (j, list) in nb.iter().enumerate() {
        for (a, &i) in list.iter().enumerate() {
            for &k in &list[a + 1..] {
                ijk.extend_from_slice(&[i as i32, j as i32, k as i32]);
                deg.push(angle_deg(xyz[i], xyz[j], xyz[k]));
            }
        }
    }
    (ijk, deg)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tetrahedral_angle() {
        // arccos(−1/3) = 109.4712206…°; tolerance 1e-12°
        let c = [0.0, 0.0, 0.0];
        let h = [[1.0, 1.0, 1.0], [1.0, -1.0, -1.0], [-1.0, 1.0, -1.0], [-1.0, -1.0, 1.0]];
        for i in 0..4 {
            for j in i + 1..4 {
                assert!((angle_deg(h[i], c, h[j]) - 109.47122063449069).abs() < 1e-12);
            }
        }
        assert!((distance(h[0], h[1]) - 8f64.sqrt()).abs() < 1e-15);
    }

    #[test]
    fn dihedral_sign_and_range() {
        // Looking from b to c (along +z) the far bond is a quarter turn clockwise from the near bond: +90°
        let (a, b, c) = ([1.0, 0.0, 0.0], [0.0, 0.0, 0.0], [0.0, 0.0, 1.0]);
        assert!((dihedral_deg(a, b, c, [0.0, 1.0, 1.0]).unwrap() - 90.0).abs() < 1e-13);
        assert!((dihedral_deg(a, b, c, [0.0, -1.0, 1.0]).unwrap() + 90.0).abs() < 1e-13);
        assert!((dihedral_deg(a, b, c, [-1.0, 0.0, 1.0]).unwrap().abs() - 180.0).abs() < 1e-13);
        assert_eq!(dihedral_deg(a, b, c, [2.0, 0.0, 1.0]).unwrap(), 0.0);
        // Gauche butane-like +60° and its mirror image
        let d = [0.5, 3f64.sqrt() / 2.0, 1.0];
        assert!((dihedral_deg(a, b, c, d).unwrap() - 60.0).abs() < 1e-13);
        assert!(dihedral_deg(a, b, c, [0.0, 0.0, 2.0]).is_none());
    }

    #[test]
    fn water_from_its_coordinates() {
        // r(OH) = 0.9572 Å, ∠HOH = 104.52° placed by trigonometry; the measurement returns both (1e-12)
        let half = 104.52f64.to_radians() / 2.0;
        let o = [0.0, 0.0, 0.0];
        let h1 = [0.9572 * half.sin(), 0.9572 * half.cos(), 0.0];
        let h2 = [-0.9572 * half.sin(), 0.9572 * half.cos(), 0.0];
        assert!((distance(o, h1) - 0.9572).abs() < 1e-15);
        assert!((angle_deg(h1, o, h2) - 104.52).abs() < 1e-12);
        let nb = neighbours(3, &[(0, 1, 1.0), (0, 2, 1.0)]);
        let (ijk, deg) = all_angles(&[o, h1, h2], &nb);
        assert_eq!(ijk, vec![1, 0, 2]);
        assert!((deg[0] - 104.52).abs() < 1e-12);
    }
}
