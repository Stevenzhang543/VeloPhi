//! Narrow phase of the many-body solver (26.58, D129): contact manifolds between convex pieces in world
//! coordinates — circle–circle, polygon–circle and polygon–polygon (separating axes, reference / incident edge
//! clipping, at most two points). Written for VeloΦ after the algorithms published with Box2D v3 (MIT) and
//! Rapier/Parry (Apache-2.0); no code is copied. Only `+ − × ÷` and `sqrt` are used (IEEE-exact), so native and
//! WebAssembly agree bit for bit.

/// A 2-vector.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct V {
    pub x: f64,
    pub y: f64,
}

impl V {
    #[inline]
    pub const fn new(x: f64, y: f64) -> V {
        V { x, y }
    }
}

#[inline]
pub fn add(a: V, b: V) -> V {
    V::new(a.x + b.x, a.y + b.y)
}
#[inline]
pub fn sub(a: V, b: V) -> V {
    V::new(a.x - b.x, a.y - b.y)
}
#[inline]
pub fn scale(s: f64, a: V) -> V {
    V::new(s * a.x, s * a.y)
}
#[inline]
pub fn dot(a: V, b: V) -> f64 {
    a.x * b.x + a.y * b.y
}
#[inline]
pub fn cross(a: V, b: V) -> f64 {
    a.x * b.y - a.y * b.x
}
#[inline]
pub fn neg(a: V) -> V {
    V::new(-a.x, -a.y)
}
#[inline]
fn lerp(a: V, b: V, t: f64) -> V {
    V::new(a.x + t * (b.x - a.x), a.y + t * (b.y - a.y))
}

/// A convex piece in world coordinates: a circle, or a counter-clockwise polygon whose vertices and outward
/// normals are `verts[start..start + len]`, `norms[start..start + len]` of the owning [`Geom`].
#[derive(Clone, Copy, Debug)]
pub struct WPiece {
    pub circle: bool,
    pub c: V,
    pub r: f64,
    pub start: usize,
    pub len: usize,
    pub lo: V,
    pub hi: V,
}

/// World geometry of all bodies for one step.
#[derive(Clone, Debug, Default)]
pub struct Geom {
    pub verts: Vec<V>,
    pub norms: Vec<V>,
    pub pieces: Vec<WPiece>,
    /// Pieces of body g: `pieces[body[g].0 .. body[g].1]`.
    pub body: Vec<(usize, usize)>,
    /// Bounding box of body g (without margins): min x, min y, max x, max y.
    pub aabb: Vec<[f64; 4]>,
}

/// A contact point: world position (midway between the surfaces), separation (negative: overlap) and feature id.
#[derive(Clone, Copy, Debug, Default)]
pub struct MPoint {
    pub p: V,
    pub sep: f64,
    pub id: u32,
}

/// A manifold between two pieces: the normal points from piece A to piece B.
#[derive(Clone, Copy, Debug, Default)]
pub struct Manifold {
    pub n: V,
    pub pts: [MPoint; 2],
    pub count: usize,
}

impl Manifold {
    fn push(&mut self, p: V, sep: f64, id: u32) {
        if self.count < 2 {
            self.pts[self.count] = MPoint { p, sep, id };
            self.count += 1;
        }
    }
}

/// Feature ids: bit 15 marks a flipped reference (B's face), bits 8–14 the reference feature, bits 0–7 the
/// incident feature; distinct kinds get their own high bits so that a change of kind does not inherit impulses.
const ID_VERTEX: u32 = 1 << 20;
const ID_FACE: u32 = 2 << 20;

fn make_id(a: usize, b: usize) -> u32 {
    (((a & 0x7f) as u32) << 8) | ((b & 0xff) as u32)
}

/// Manifold of two pieces whose separation is below `margin` (speculative contacts), else `count == 0`.
pub fn collide(g: &Geom, pa: &WPiece, pb: &WPiece, margin: f64, slop: f64) -> Manifold {
    match (pa.circle, pb.circle) {
        (true, true) => circles(pa.c, pa.r, pb.c, pb.r, margin),
        (false, true) => polygon_circle(g, pa, pb.c, pb.r, margin),
        (true, false) => {
            let mut m = polygon_circle(g, pb, pa.c, pa.r, margin);
            m.n = neg(m.n);
            m
        }
        (false, false) => polygons(g, pa, pb, margin, slop),
    }
}

fn circles(ca: V, ra: f64, cb: V, rb: f64, margin: f64) -> Manifold {
    let mut m = Manifold::default();
    let d = sub(cb, ca);
    let dist = dot(d, d).sqrt();
    let sep = dist - ra - rb;
    if sep > margin {
        return m;
    }
    let n = if dist > 0.0 { scale(1.0 / dist, d) } else { V::new(0.0, 1.0) };
    let pa = add(ca, scale(ra, n));
    let pb = sub(cb, scale(rb, n));
    m.n = n;
    m.push(scale(0.5, add(pa, pb)), sep, 0);
    m
}

/// Polygon A against circle B (normal from A to B).
fn polygon_circle(g: &Geom, pa: &WPiece, c: V, r: f64, margin: f64) -> Manifold {
    let mut m = Manifold::default();
    let vs = &g.verts[pa.start..pa.start + pa.len];
    let ns = &g.norms[pa.start..pa.start + pa.len];
    let count = vs.len();
    let mut best = 0;
    let mut sep = f64::NEG_INFINITY;
    for i in 0..count {
        let s = dot(ns[i], sub(c, vs[i]));
        if s > sep {
            sep = s;
            best = i;
        }
    }
    if sep - r > margin {
        return m;
    }
    let v1 = vs[best];
    let v2 = vs[if best + 1 < count { best + 1 } else { 0 }];
    let u1 = dot(sub(c, v1), sub(v2, v1));
    let u2 = dot(sub(c, v2), sub(v1, v2));
    let eps = 1e-12;
    let vertex = |v: V, k: usize, m: &mut Manifold| {
        let d = sub(c, v);
        let dist = dot(d, d).sqrt();
        let s = dist - r;
        if s > margin {
            return;
        }
        let n = if dist > 0.0 { scale(1.0 / dist, d) } else { ns[best] };
        let cb = sub(c, scale(r, n));
        m.n = n;
        m.push(scale(0.5, add(v, cb)), s, ID_VERTEX | make_id(k, 0));
    };
    if u1 < 0.0 && sep > eps {
        vertex(v1, best, &mut m);
    } else if u2 < 0.0 && sep > eps {
        vertex(v2, if best + 1 < count { best + 1 } else { 0 }, &mut m);
    } else {
        let n = ns[best];
        let pa_s = sub(c, scale(sep, n));
        let pb_s = sub(c, scale(r, n));
        m.n = n;
        m.push(scale(0.5, add(pa_s, pb_s)), sep - r, ID_FACE | make_id(best, 0));
    }
    m
}

/// Largest separation of poly2 from the faces of poly1: (face index, separation).
fn max_separation(g: &Geom, p1: &WPiece, p2: &WPiece) -> (usize, f64) {
    let v1 = &g.verts[p1.start..p1.start + p1.len];
    let n1 = &g.norms[p1.start..p1.start + p1.len];
    let v2 = &g.verts[p2.start..p2.start + p2.len];
    let mut best = 0;
    let mut max = f64::NEG_INFINITY;
    for i in 0..v1.len() {
        let mut si = f64::INFINITY;
        for w in v2 {
            let s = dot(n1[i], sub(*w, v1[i]));
            if s < si {
                si = s;
            }
        }
        if si > max {
            max = si;
            best = i;
        }
    }
    (best, max)
}

/// Closest points of segments p1–q1 and p2–q2: (point on 1, point on 2, s, t, squared distance).
fn segment_distance(p1: V, q1: V, p2: V, q2: V) -> (V, V, f64, f64, f64) {
    let d1 = sub(q1, p1);
    let d2 = sub(q2, p2);
    let r = sub(p1, p2);
    let dd1 = dot(d1, d1);
    let dd2 = dot(d2, d2);
    let rd1 = dot(r, d1);
    let rd2 = dot(r, d2);
    let eps_sq = 1e-24;
    let (mut s, mut t);
    if dd1 < eps_sq || dd2 < eps_sq {
        if dd1 >= eps_sq {
            s = (-rd1 / dd1).clamp(0.0, 1.0);
            t = 0.0;
        } else if dd2 >= eps_sq {
            s = 0.0;
            t = (rd2 / dd2).clamp(0.0, 1.0);
        } else {
            s = 0.0;
            t = 0.0;
        }
    } else {
        let d12 = dot(d1, d2);
        let denom = dd1 * dd2 - d12 * d12;
        s = if denom != 0.0 { ((d12 * rd2 - rd1 * dd2) / denom).clamp(0.0, 1.0) } else { 0.0 };
        t = (d12 * s + rd2) / dd2;
        if t < 0.0 {
            t = 0.0;
            s = (-rd1 / dd1).clamp(0.0, 1.0);
        } else if t > 1.0 {
            t = 1.0;
            s = ((d12 - rd1) / dd1).clamp(0.0, 1.0);
        }
    }
    let c1 = add(p1, scale(s, d1));
    let c2 = add(p2, scale(t, d2));
    let d = sub(c2, c1);
    (c1, c2, s, t, dot(d, d))
}

fn polygons(g: &Geom, pa: &WPiece, pb: &WPiece, margin: f64, slop: f64) -> Manifold {
    let none = Manifold::default();
    let (ea, sa) = max_separation(g, pa, pb);
    if sa > margin {
        return none;
    }
    let (eb, sb) = max_separation(g, pb, pa);
    if sb > margin {
        return none;
    }
    // Reference face: A's unless B's separates clearly more (the tolerance keeps the choice from flickering)
    let flip = sb > sa + 0.1 * slop;
    let (p1, p2, i11) = if flip { (pb, pa, eb) } else { (pa, pb, ea) };
    let v1 = &g.verts[p1.start..p1.start + p1.len];
    let n1 = &g.norms[p1.start..p1.start + p1.len];
    let v2 = &g.verts[p2.start..p2.start + p2.len];
    let n2 = &g.norms[p2.start..p2.start + p2.len];
    let normal = n1[i11];
    // Incident edge: the face of the other polygon most anti-parallel to the reference normal
    let mut i21 = 0;
    let mut min_dot = f64::INFINITY;
    for (i, n) in n2.iter().enumerate() {
        let d = dot(normal, *n);
        if d < min_dot {
            min_dot = d;
            i21 = i;
        }
    }
    let i12 = if i11 + 1 < v1.len() { i11 + 1 } else { 0 };
    let i22 = if i21 + 1 < v2.len() { i21 + 1 } else { 0 };
    let v11 = v1[i11];
    let v12 = v1[i12];
    let v21 = v2[i21];
    let v22 = v2[i22];

    let mut m = Manifold::default();
    let flip_bit: u32 = if flip { 1 << 15 } else { 0 };
    let n_ab = if flip { neg(normal) } else { normal };
    // Clip the incident edge to the side planes of the reference edge
    let edge = sub(v12, v11);
    let elen = dot(edge, edge).sqrt();
    if elen > 0.0 {
        let tangent = scale(1.0 / elen, edge);
        let lower1 = 0.0;
        let upper1 = elen;
        let upper2 = dot(sub(v21, v11), tangent);
        let lower2 = dot(sub(v22, v11), tangent);
        if !(upper2 < lower1 || upper1 < lower2) {
            let span = upper2 - lower2;
            let v_lower = if lower2 < lower1 && span > 1e-15 { lerp(v22, v21, (lower1 - lower2) / span) } else { v22 };
            let v_upper = if upper2 > upper1 && span > 1e-15 { lerp(v22, v21, (upper1 - lower2) / span) } else { v21 };
            let s_lower = dot(sub(v_lower, v11), normal);
            let s_upper = dot(sub(v_upper, v11), normal);
            m.n = n_ab;
            // midpoints between the surfaces
            let p_lower = add(v_lower, scale(-0.5 * s_lower, normal));
            let p_upper = add(v_upper, scale(-0.5 * s_upper, normal));
            if s_lower <= margin {
                m.push(p_lower, s_lower, ID_FACE | flip_bit | make_id(i11, i22));
            }
            if s_upper <= margin {
                m.push(p_upper, s_upper, ID_FACE | flip_bit | make_id(i12, i21));
            }
        }
    }
    // Separated polygons: when the closest features are two vertices, one point along their joining line
    // separates much more than the face normal says (Box2D v3's vertex–vertex case; avoids ghost collisions)
    if sa.max(sb) > 0.1 * slop {
        let (c1, c2, s, t, d2) = segment_distance(v11, v12, v21, v22);
        let dist = d2.sqrt();
        let vertex_vertex = (s == 0.0 || s == 1.0) && (t == 0.0 || t == 1.0);
        let mut min_sep = f64::INFINITY;
        for k in 0..m.count {
            min_sep = min_sep.min(m.pts[k].sep);
        }
        if dist > 0.0 && vertex_vertex && (m.count == 0 || dist > min_sep + 0.1 * slop) {
            let mut v = Manifold::default();
            if dist > margin {
                return v;
            }
            let dir = scale(1.0 / dist, sub(c2, c1));
            v.n = if flip { neg(dir) } else { dir };
            let k1 = if s == 0.0 { i11 } else { i12 };
            let k2 = if t == 0.0 { i21 } else { i22 };
            v.push(scale(0.5, add(c1, c2)), dist, ID_VERTEX | flip_bit | make_id(k1, k2));
            return v;
        }
    }
    m
}

#[cfg(test)]
mod tests {
    use super::*;

    fn geom_with(polys: &[Vec<V>]) -> (Geom, Vec<WPiece>) {
        let mut g = Geom::default();
        let mut out = Vec::new();
        for p in polys {
            let start = g.verts.len();
            for i in 0..p.len() {
                let a = p[i];
                let b = p[(i + 1) % p.len()];
                let e = sub(b, a);
                let l = dot(e, e).sqrt();
                g.verts.push(a);
                g.norms.push(V::new(e.y / l, -e.x / l));
            }
            out.push(WPiece { circle: false, c: V::default(), r: 0.0, start, len: p.len(), lo: V::default(), hi: V::default() });
        }
        (g, out)
    }

    fn square(cx: f64, cy: f64, h: f64) -> Vec<V> {
        vec![V::new(cx - h, cy - h), V::new(cx + h, cy - h), V::new(cx + h, cy + h), V::new(cx - h, cy + h)]
    }

    #[test]
    fn box_on_box_two_points() {
        let (g, p) = geom_with(&[square(0.0, 0.0, 1.0), square(0.2, 1.99, 1.0)]);
        let m = collide(&g, &p[0], &p[1], 0.02, 0.005);
        assert_eq!(m.count, 2);
        assert!((m.n.y - 1.0).abs() < 1e-12);
        for k in 0..2 {
            assert!((m.pts[k].sep + 0.01).abs() < 1e-12);
        }
    }

    #[test]
    fn speculative_and_far() {
        let (g, p) = geom_with(&[square(0.0, 0.0, 1.0), square(0.0, 2.015, 1.0)]);
        assert_eq!(collide(&g, &p[0], &p[1], 0.02, 0.005).count, 2);
        let (g, p) = geom_with(&[square(0.0, 0.0, 1.0), square(0.0, 2.5, 1.0)]);
        assert_eq!(collide(&g, &p[0], &p[1], 0.02, 0.005).count, 0);
    }

    #[test]
    fn circle_on_polygon_face_and_vertex() {
        let (g, p) = geom_with(&[square(0.0, 0.0, 1.0)]);
        let m = polygon_circle(&g, &p[0], V::new(0.3, 1.5), 0.5, 0.02);
        assert_eq!(m.count, 1);
        assert!(m.pts[0].sep.abs() < 1e-12 && (m.n.y - 1.0).abs() < 1e-12);
        let m = polygon_circle(&g, &p[0], V::new(1.3, 1.3), 0.4, 0.05);
        assert_eq!(m.count, 1);
        let d = (0.3f64 * 0.3 * 2.0).sqrt() - 0.4;
        assert!((m.pts[0].sep - d).abs() < 1e-12);
    }

    #[test]
    fn segment_distance_cases() {
        let (_, _, s, t, d2) = segment_distance(V::new(0.0, 0.0), V::new(1.0, 0.0), V::new(2.0, 1.0), V::new(3.0, 1.0));
        assert_eq!((s, t), (1.0, 0.0));
        assert!((d2 - 2.0).abs() < 1e-12);
    }
}
