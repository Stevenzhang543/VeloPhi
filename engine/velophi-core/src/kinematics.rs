//! Kinematics of bodies, contact features and connectors (port of `src/core/solver/kinematics.ts`). Every
//! expression keeps the TypeScript operand order and grouping.

use crate::dmath::{atan2 as atan2_det, cos, sin, PI_VALUE};
use crate::js::js_max;
use crate::model::{AnchorModel, BodyModel, Model, PulleyModel, RopeModel, ShapeModel, ShapePiece, SliderModel};
use crate::scene::Vec2;

/// Pose and velocity of a body; `th` is the angle whose cosine and sine are `c` and `s`.
#[derive(Clone, Copy, Debug, Default)]
pub struct Pose {
    pub x: f64,
    pub y: f64,
    pub c: f64,
    pub s: f64,
    pub vx: f64,
    pub vy: f64,
    pub w: f64,
    pub th: f64,
}

/// Poses of all bodies (global index) for state X, written into `out`. When `out` holds the poses of an earlier
/// call, the cosine and sine of an angle with the same bits are reused (they are a pure function of the angle).
pub fn compute_poses_into(model: &Model, x: &[f64], out: &mut Vec<Pose>) {
    let n = model.n;
    if out.len() != model.bodies.len() {
        out.clear();
        for b in &model.bodies {
            out.push(Pose { x: b.static_pos.x, y: b.static_pos.y, c: b.static_c, s: b.static_s, vx: 0.0, vy: 0.0, w: 0.0, th: b.static_angle });
            if b.index >= 0 {
                let i = b.index as usize;
                let th = x[3 * i + 2];
                let p = out.last_mut().expect("just pushed");
                p.th = th;
                p.c = cos(th);
                p.s = sin(th);
            }
        }
    }
    for (b, p) in model.bodies.iter().zip(out.iter_mut()) {
        if b.index < 0 {
            continue;
        }
        let i = b.index as usize;
        let th = x[3 * i + 2];
        if th.to_bits() != p.th.to_bits() {
            p.th = th;
            p.c = cos(th);
            p.s = sin(th);
        }
        p.x = x[3 * i];
        p.y = x[3 * i + 1];
        p.vx = x[3 * n + 3 * i];
        p.vy = x[3 * n + 3 * i + 1];
        p.w = x[3 * n + 3 * i + 2];
    }
}

/// Poses of all bodies (global index) for state X.
pub fn compute_poses(model: &Model, x: &[f64]) -> Vec<Pose> {
    let mut out = Vec::with_capacity(model.bodies.len());
    compute_poses_into(model, x, &mut out);
    out
}

/// A term of a Jacobian row on one dynamic body.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct RowTerm {
    pub i: i32,
    pub x: f64,
    pub y: f64,
    pub w: f64,
}

/// A row of the Jacobian: slots a and b (dynamic index or −1), extra terms of multi-body rows in `ex`.
#[derive(Clone, Debug, PartialEq)]
pub struct RowJ {
    pub ai: i32,
    pub ax: f64,
    pub ay: f64,
    pub aw: f64,
    pub bi: i32,
    pub bx: f64,
    pub by: f64,
    pub bw: f64,
    /// Present (non-empty) only for ropes over movable pulleys with more than two bodies.
    pub ex: Vec<RowTerm>,
}

impl Default for RowJ {
    fn default() -> Self {
        empty_row()
    }
}

/// A row with no terms.
pub const fn empty_row() -> RowJ {
    RowJ { ai: -1, ax: 0.0, ay: 0.0, aw: 0.0, bi: -1, bx: 0.0, by: 0.0, bw: 0.0, ex: Vec::new() }
}

/// Position, velocity and velocity-product acceleration of a material point of a body.
#[derive(Clone, Copy, Debug, Default)]
pub struct PointState {
    pub px: f64,
    pub py: f64,
    pub rx: f64,
    pub ry: f64,
    pub vx: f64,
    pub vy: f64,
    pub qx: f64,
    pub qy: f64,
}

/// State of the point at body coordinates `local`.
#[inline]
pub fn point_state(pose: &Pose, local: Vec2) -> PointState {
    let rx = pose.c * local.x - pose.s * local.y;
    let ry = pose.s * local.x + pose.c * local.y;
    let w = pose.w;
    PointState { px: pose.x + rx, py: pose.y + ry, rx, ry, vx: pose.vx - w * ry, vy: pose.vy + w * rx, qx: -w * w * rx, qy: -w * w * ry }
}

/// Anchor point: on a body, or fixed in the world.
#[inline]
pub fn anchor_state(poses: &[Pose], anchor: &AnchorModel) -> PointState {
    match anchor.body {
        None => PointState { px: anchor.local.x, py: anchor.local.y, ..Default::default() },
        Some(g) => point_state(&poses[g], anchor.local),
    }
}

// ---- Contact features ----
/// A point feature: circle centre or polygon vertex (`vertex` −1 for a circle centre) with its radius.
#[derive(Clone, Copy, Debug)]
pub struct PointFeature {
    pub body: usize,
    pub local: Vec2,
    pub radius: f64,
    pub vertex: i32,
    /// Convex piece of a complex body the point lies on (26.52; None otherwise).
    pub piece: Option<usize>,
}

/// A polygon face from e0 to e1 with its outward normal and length.
#[derive(Clone, Copy, Debug)]
pub struct FaceFeature {
    pub body: usize,
    pub face: usize,
    pub e0: Vec2,
    pub e1: Vec2,
    pub normal: Vec2,
    pub len: f64,
    /// Convex piece of a complex body the face belongs to (26.52; None otherwise).
    pub piece: Option<usize>,
}

/// The B side of a contact feature.
#[derive(Clone, Copy, Debug)]
pub enum FeatureB {
    /// Point against face.
    Face(FaceFeature),
    /// Point against point, with the vertex cone of B (n1, n2).
    Point(PointFeature, Option<(Vec2, Vec2)>),
}

/// A possible contact; `probe_key` is the key of the probe that watches A's point (featureProbeKey).
#[derive(Clone, Debug)]
pub struct ContactFeature {
    pub a: PointFeature,
    pub b: FeatureB,
    pub probe_key: String,
}

impl ContactFeature {
    /// Global index of the B body.
    #[inline]
    pub fn b_body(&self) -> usize {
        match &self.b {
            FeatureB::Face(f) => f.body,
            FeatureB::Point(p, _) => p.body,
        }
    }
    /// Point against face?
    #[inline]
    pub fn is_pf(&self) -> bool {
        matches!(self.b, FeatureB::Face(_))
    }
}

/// Kinematics of a contact feature.
#[derive(Clone, Debug, Default)]
pub struct ContactKin {
    pub gap: f64,
    pub nx: f64,
    pub ny: f64,
    pub tx: f64,
    pub ty: f64,
    pub cx: f64,
    pub cy: f64,
    pub vn: f64,
    pub vt: f64,
    pub jn: RowJ,
    pub cn: f64,
    pub jt: RowJ,
    pub ct: f64,
    pub m1: f64,
    pub m2: f64,
}

#[allow(clippy::too_many_arguments)]
#[inline]
fn fill(a: &BodyModel, ax: f64, ay: f64, aw: f64, b: &BodyModel, bx: f64, by: f64, bw: f64) -> RowJ {
    RowJ { ai: a.index, ax, ay, aw, bi: b.index, bx, by, bw, ex: Vec::new() }
}

/// Kinematics of a contact feature at the given poses.
pub fn contact_kin(model: &Model, f: &ContactFeature, poses: &[Pose]) -> ContactKin {
    let a_body = &model.bodies[f.a.body];
    let pa_pose = &poses[a_body.global];
    let pa = point_state(pa_pose, f.a.local);
    let rad_a = f.a.radius;
    let w_a = pa_pose.w;
    match &f.b {
        FeatureB::Face(face) => {
            let b_body = &model.bodies[face.body];
            let pb_pose = &poses[b_body.global];
            let p0 = point_state(pb_pose, face.e0);
            let nx = pb_pose.c * face.normal.x - pb_pose.s * face.normal.y;
            let ny = pb_pose.s * face.normal.x + pb_pose.c * face.normal.y;
            let tx = -ny;
            let ty = nx;
            let w_b = pb_pose.w;
            let wx = pa.px - p0.px;
            let wy = pa.py - p0.py;
            let dwx = pa.vx - p0.vx;
            let dwy = pa.vy - p0.vy;
            let gap = nx * wx + ny * wy - rad_a;
            let t_w = tx * wx + ty * wy;
            let vn = w_b * t_w + nx * dwx + ny * dwy;
            let n_perp_ra = ny * pa.rx - nx * pa.ry;
            let n_perp_r0 = ny * p0.rx - nx * p0.ry;
            let jn = fill(a_body, nx, ny, n_perp_ra, b_body, -nx, -ny, t_w - n_perp_r0);
            let cn = -w_b * w_b * (nx * wx + ny * wy) + 2.0 * w_b * (tx * dwx + ty * dwy) + nx * (pa.qx - p0.qx) + ny * (pa.qy - p0.qy);
            let cx = pa.px - rad_a * nx;
            let cy = pa.py - rad_a * ny;
            let rho_ax = cx - pa_pose.x;
            let rho_ay = cy - pa_pose.y;
            let rho_bx = cx - pb_pose.x;
            let rho_by = cy - pb_pose.y;
            let v_ax = pa_pose.vx - w_a * rho_ay;
            let v_ay = pa_pose.vy + w_a * rho_ax;
            let v_bx = pb_pose.vx - w_b * rho_by;
            let v_by = pb_pose.vy + w_b * rho_bx;
            let dx = v_ax - v_bx;
            let dy = v_ay - v_by;
            let vt = tx * dx + ty * dy + b_body.belt_speed;
            let jt = fill(a_body, tx, ty, ty * rho_ax - tx * rho_ay, b_body, -tx, -ty, -(ty * rho_bx - tx * rho_by));
            let cdx = pa.vx - rad_a * w_b * tx;
            let cdy = pa.vy - rad_a * w_b * ty;
            let rd_ax = cdx - pa_pose.vx;
            let rd_ay = cdy - pa_pose.vy;
            let rd_bx = cdx - pb_pose.vx;
            let rd_by = cdy - pb_pose.vy;
            let ct = -w_b * (nx * dx + ny * dy) + w_a * (ty * rd_ax - tx * rd_ay) - w_b * (ty * rd_bx - tx * rd_by);
            let s = tx * wx + ty * wy;
            ContactKin { gap, nx, ny, tx, ty, cx, cy, vn, vt, jn, cn, jt, ct, m1: s, m2: face.len - s }
        }
        FeatureB::Point(pf, cone) => {
            let b_body = &model.bodies[pf.body];
            let pb_pose = &poses[b_body.global];
            let pb = point_state(pb_pose, pf.local);
            let rad_b = pf.radius;
            let w_b = pb_pose.w;
            let dx = pa.px - pb.px;
            let dy = pa.py - pb.py;
            let dist = (dx * dx + dy * dy).sqrt();
            let nx = if dist > 0.0 { dx / dist } else { 0.0 };
            let ny = if dist > 0.0 { dy / dist } else { 1.0 };
            let tx = -ny;
            let ty = nx;
            let gap = dist - rad_a - rad_b;
            let dvx = pa.vx - pb.vx;
            let dvy = pa.vy - pb.vy;
            let vn = nx * dvx + ny * dvy;
            let jn = fill(a_body, nx, ny, ny * pa.rx - nx * pa.ry, b_body, -nx, -ny, -(ny * pb.rx - nx * pb.ry));
            let perp_sq = dvx * dvx + dvy * dvy - vn * vn;
            let cn = nx * (pa.qx - pb.qx) + ny * (pa.qy - pb.qy) + if dist > 0.0 { perp_sq / dist } else { 0.0 };
            let cx = pa.px - rad_a * nx;
            let cy = pa.py - rad_a * ny;
            let rho_ax = cx - pa_pose.x;
            let rho_ay = cy - pa_pose.y;
            let rho_bx = cx - pb_pose.x;
            let rho_by = cy - pb_pose.y;
            let v_ax = pa_pose.vx - w_a * rho_ay;
            let v_ay = pa_pose.vy + w_a * rho_ax;
            let v_bx = pb_pose.vx - w_b * rho_by;
            let v_by = pb_pose.vy + w_b * rho_bx;
            let ddx = v_ax - v_bx;
            let ddy = v_ay - v_by;
            let vt = tx * ddx + ty * ddy;
            let jt = fill(a_body, tx, ty, ty * rho_ax - tx * rho_ay, b_body, -tx, -ty, -(ty * rho_bx - tx * rho_by));
            let ndx = if dist > 0.0 { (dvx - vn * nx) / dist } else { 0.0 };
            let ndy = if dist > 0.0 { (dvy - vn * ny) / dist } else { 0.0 };
            let tdx = -ndy;
            let tdy = ndx;
            let cdx = pa.vx - rad_a * ndx;
            let cdy = pa.vy - rad_a * ndy;
            let rd_ax = cdx - pa_pose.vx;
            let rd_ay = cdy - pa_pose.vy;
            let rd_bx = cdx - pb_pose.vx;
            let rd_by = cdy - pb_pose.vy;
            let ct = tdx * ddx + tdy * ddy + w_a * (ty * rd_ax - tx * rd_ay) - w_b * (ty * rd_bx - tx * rd_by);
            let mut m1 = 1.0;
            let mut m2 = 1.0;
            if let Some((n1, n2)) = cone {
                let n1x = pb_pose.c * n1.x - pb_pose.s * n1.y;
                let n1y = pb_pose.s * n1.x + pb_pose.c * n1.y;
                let n2x = pb_pose.c * n2.x - pb_pose.s * n2.y;
                let n2y = pb_pose.s * n2.x + pb_pose.c * n2.y;
                m1 = n1x * ny - n1y * nx;
                m2 = nx * n2y - ny * n2x;
            }
            ContactKin { gap, nx, ny, tx, ty, cx, cy, vn, vt, jn, cn, jt, ct, m1, m2 }
        }
    }
}

/// Key of the probe of vertex `vertex` of A (−1: the circle centre) against B.
pub fn probe_key(a: &BodyModel, vertex: i32, b: &BodyModel) -> String {
    format!("{}#{}>{}", a.id, vertex, b.id)
}

/// A point of a body for contact features (index −1: a circle body's centre).
#[derive(Clone, Copy)]
struct BodyPoint {
    vertex: i32,
    local: Vec2,
    radius: f64,
    cone: Option<(Vec2, Vec2)>,
    piece: Option<usize>,
}

/// The point features of a body (see kinematics.ts bodyPoints).
fn body_points(b: &BodyModel) -> Vec<BodyPoint> {
    match &b.shape {
        ShapeModel::Circle { radius } => vec![BodyPoint { vertex: -1, local: Vec2::default(), radius: *radius, cone: None, piece: None }],
        ShapeModel::Polygon { verts, normals, .. } => {
            let m = verts.len();
            (0..m)
                .map(|i| BodyPoint { vertex: i as i32, local: verts[i], radius: 0.0, cone: Some((normals[(i + m - 1) % m], normals[i])), piece: None })
                .collect()
        }
        ShapeModel::Complex(c) => c
            .points
            .iter()
            .enumerate()
            .map(|(i, p)| BodyPoint { vertex: i as i32, local: p.local, radius: p.radius, cone: p.cone, piece: Some(p.piece) })
            .collect(),
    }
}

/// The faces of a body (none for a circle).
fn body_faces(b: &BodyModel) -> Vec<FaceFeature> {
    match &b.shape {
        ShapeModel::Circle { .. } => Vec::new(),
        ShapeModel::Polygon { verts, normals, lengths } => (0..verts.len())
            .map(|f| FaceFeature { body: b.global, face: f, e0: verts[f], e1: verts[(f + 1) % verts.len()], normal: normals[f], len: lengths[f], piece: None })
            .collect(),
        ShapeModel::Complex(c) => c
            .faces
            .iter()
            .enumerate()
            .map(|(i, f)| FaceFeature { body: b.global, face: i, e0: f.e0, e1: f.e1, normal: f.normal, len: f.len, piece: Some(f.piece) })
            .collect(),
    }
}

/// Key of the probe that watches A's point against B (against its piece for a complex B).
fn feature_probe_key(a: &BodyModel, vertex: i32, b: &BodyModel, piece: Option<usize>) -> String {
    match piece {
        Some(k) => format!("{}@{}", probe_key(a, vertex, b), k),
        None => probe_key(a, vertex, b),
    }
}

/// Contact features of a pair with a complex shape (26.52, D35; see kinematics.ts complexPairFeatures).
fn complex_pair_features(x: &BodyModel, y: &BodyModel) -> Vec<ContactFeature> {
    let mut out = Vec::new();
    let (px, py, fx, fy) = (body_points(x), body_points(y), body_faces(x), body_faces(y));
    let pf = |out: &mut Vec<ContactFeature>, a: &BodyModel, p: &BodyPoint, b: &BodyModel, f: &FaceFeature| {
        out.push(ContactFeature {
            a: PointFeature { body: a.global, local: p.local, radius: p.radius, vertex: p.vertex, piece: None },
            b: FeatureB::Face(*f),
            probe_key: feature_probe_key(a, p.vertex, b, f.piece),
        });
    };
    let pp = |out: &mut Vec<ContactFeature>, a: &BodyModel, p: &BodyPoint, b: &BodyModel, q: &BodyPoint| {
        out.push(ContactFeature {
            a: PointFeature { body: a.global, local: p.local, radius: p.radius, vertex: p.vertex, piece: None },
            b: FeatureB::Point(
                PointFeature { body: b.global, local: q.local, radius: q.radius, vertex: q.vertex, piece: q.piece },
                if q.radius > 0.0 { None } else { q.cone },
            ),
            probe_key: feature_probe_key(a, p.vertex, b, q.piece),
        });
    };
    for p in &px {
        for f in &fy {
            pf(&mut out, x, p, y, f);
        }
    }
    for p in &py {
        for f in &fx {
            pf(&mut out, y, p, x, f);
        }
    }
    let y_first = matches!(y.shape, ShapeModel::Circle { .. });
    for p in &px {
        #[allow(clippy::neg_cmp_op_on_partial_ord)]
        if !(p.radius > 0.0) {
            continue;
        }
        for q in &py {
            if q.radius > 0.0 && y_first {
                pp(&mut out, y, q, x, p);
            } else {
                pp(&mut out, x, p, y, q);
            }
        }
    }
    for p in &py {
        #[allow(clippy::neg_cmp_op_on_partial_ord)]
        if !(p.radius > 0.0) {
            continue;
        }
        for q in &px {
            #[allow(clippy::neg_cmp_op_on_partial_ord)]
            if !(q.radius > 0.0) {
                pp(&mut out, y, p, x, q);
            }
        }
    }
    out
}

/// All contact features between two bodies (the point side is always A; circles are always points).
pub fn pair_features(model: &Model, xi: usize, yi: usize) -> Vec<ContactFeature> {
    let mut out = Vec::new();
    let x = &model.bodies[xi];
    let y = &model.bodies[yi];
    if matches!(x.shape, ShapeModel::Complex(_)) || matches!(y.shape, ShapeModel::Complex(_)) {
        return complex_pair_features(x, y);
    }
    let pf = |out: &mut Vec<ContactFeature>, a: &BodyModel, vi: i32, local: Vec2, radius: f64, b: &BodyModel| {
        if let ShapeModel::Polygon { verts, normals, lengths } = &b.shape {
            for f in 0..verts.len() {
                out.push(ContactFeature {
                    a: PointFeature { body: a.global, local, radius, vertex: vi, piece: None },
                    b: FeatureB::Face(FaceFeature {
                        body: b.global,
                        face: f,
                        e0: verts[f],
                        e1: verts[(f + 1) % verts.len()],
                        normal: normals[f],
                        len: lengths[f],
                        piece: None,
                    }),
                    probe_key: probe_key(a, vi, b),
                });
            }
        }
    };
    let pv = |out: &mut Vec<ContactFeature>, a: &BodyModel, local: Vec2, radius: f64, b: &BodyModel| {
        if let ShapeModel::Polygon { verts, normals, .. } = &b.shape {
            let m = verts.len();
            for v in 0..m {
                out.push(ContactFeature {
                    a: PointFeature { body: a.global, local, radius, vertex: -1, piece: None },
                    b: FeatureB::Point(
                        PointFeature { body: b.global, local: verts[v], radius: 0.0, vertex: v as i32, piece: None },
                        Some((normals[(v + m - 1) % m], normals[v])),
                    ),
                    probe_key: probe_key(a, -1, b),
                });
            }
        }
    };
    let origin = Vec2::default();
    match (&x.shape, &y.shape) {
        (ShapeModel::Circle { radius: rx }, ShapeModel::Circle { radius: ry }) => {
            out.push(ContactFeature {
                a: PointFeature { body: x.global, local: origin, radius: *rx, vertex: -1, piece: None },
                b: FeatureB::Point(PointFeature { body: y.global, local: origin, radius: *ry, vertex: -1, piece: None }, None),
                probe_key: probe_key(x, -1, y),
            });
        }
        (ShapeModel::Circle { radius }, _) => {
            pf(&mut out, x, -1, origin, *radius, y);
            pv(&mut out, x, origin, *radius, y);
        }
        (_, ShapeModel::Circle { radius }) => {
            pf(&mut out, y, -1, origin, *radius, x);
            pv(&mut out, y, origin, *radius, x);
        }
        (ShapeModel::Polygon { verts: vx, .. }, ShapeModel::Polygon { verts: vy, .. }) => {
            for (i, v) in vx.iter().enumerate() {
                pf(&mut out, x, i as i32, *v, 0.0, y);
            }
            for (i, v) in vy.iter().enumerate() {
                pf(&mut out, y, i as i32, *v, 0.0, x);
            }
        }
        _ => {}
    }
    out
}

// ---- Connectors ----
/// Value, rate, Jacobian row and velocity-product term of a scalar constraint.
#[derive(Clone, Debug)]
pub struct ConstraintKin {
    pub value: f64,
    pub vel: f64,
    pub j: RowJ,
    pub c: f64,
}

#[inline]
fn anchor_row(model: &Model, row: &mut RowJ, side_a: bool, anchor: &AnchorModel, gx: f64, gy: f64, p: &PointState) {
    let Some(g) = anchor.body else { return };
    let idx = model.bodies[g].index;
    if idx < 0 {
        return;
    }
    let w = p.rx * gy - p.ry * gx;
    if side_a {
        row.ai = idx;
        row.ax = gx;
        row.ay = gy;
        row.aw = w;
    } else {
        row.bi = idx;
        row.bx = gx;
        row.by = gy;
        row.bw = w;
    }
}

/// Distance between two anchors: value = |PA − PB|; also returns the unit direction.
pub fn distance_kin(model: &Model, poses: &[Pose], a: &AnchorModel, b: &AnchorModel) -> (ConstraintKin, f64, f64) {
    let pa = anchor_state(poses, a);
    let pb = anchor_state(poses, b);
    let dx = pa.px - pb.px;
    let dy = pa.py - pb.py;
    let d = (dx * dx + dy * dy).sqrt();
    let ux = if d > 0.0 { dx / d } else { 0.0 };
    let uy = if d > 0.0 { dy / d } else { 0.0 };
    let dvx = pa.vx - pb.vx;
    let dvy = pa.vy - pb.vy;
    let vel = ux * dvx + uy * dvy;
    let mut row = empty_row();
    anchor_row(model, &mut row, true, a, ux, uy, &pa);
    anchor_row(model, &mut row, false, b, -ux, -uy, &pb);
    let perp_sq = dvx * dvx + dvy * dvy - vel * vel;
    let c = ux * (pa.qx - pb.qx) + uy * (pa.qy - pb.qy) + if d > 0.0 { perp_sq / d } else { 0.0 };
    (ConstraintKin { value: d, vel, j: row, c }, ux, uy)
}

/// Hinge: the two rows (x and y) of PA − PB = 0.
pub fn hinge_kin(model: &Model, poses: &[Pose], a: &AnchorModel, b: &AnchorModel) -> [ConstraintKin; 2] {
    let pa = anchor_state(poses, a);
    let pb = anchor_state(poses, b);
    let mut rx = empty_row();
    let mut ry = empty_row();
    anchor_row(model, &mut rx, true, a, 1.0, 0.0, &pa);
    anchor_row(model, &mut rx, false, b, -1.0, 0.0, &pb);
    anchor_row(model, &mut ry, true, a, 0.0, 1.0, &pa);
    anchor_row(model, &mut ry, false, b, 0.0, -1.0, &pb);
    [
        ConstraintKin { value: pa.px - pb.px, vel: pa.vx - pb.vx, j: rx, c: pa.qx - pb.qx },
        ConstraintKin { value: pa.py - pb.py, vel: pa.vy - pb.vy, j: ry, c: pa.qy - pb.qy },
    ]
}

// ---- Connectors of 26.51 (D51) ----

/// Angle θ (rad) and angular velocity ω of a body (the world: 0, 0).
#[inline]
fn angular(poses: &[Pose], body: Option<usize>) -> (f64, f64) {
    match body {
        None => (0.0, 0.0),
        Some(g) => (poses[g].th, poses[g].w),
    }
}

/// Put generalized angle coefficients ka (body a) and kb (body b) into a row.
fn angle_row(model: &Model, a: Option<usize>, ka: f64, b: Option<usize>, kb: f64) -> RowJ {
    let mut row = empty_row();
    let ia = dyn_index(model, a);
    if ia >= 0 {
        row.ai = ia;
        row.aw = ka;
    }
    let ib = dyn_index(model, b);
    if ib >= 0 {
        row.bi = ib;
        row.bw = kb;
    }
    row
}

/// Relative angle: value = (θ_b − θ_a) − offset, J = (−1 on θ_a, +1 on θ_b), no velocity-product term.
pub fn rel_angle_kin(model: &Model, poses: &[Pose], a: Option<usize>, b: Option<usize>, offset: f64) -> ConstraintKin {
    let (tha, wa) = angular(poses, a);
    let (thb, wb) = angular(poses, b);
    ConstraintKin { value: thb - tha - offset, vel: wb - wa, j: angle_row(model, a, -1.0, b, 1.0), c: 0.0 }
}

/// Gear or belt: value = θ_a + r·θ_b − offset, J = (1 on θ_a, r on θ_b).
pub fn gear_kin(model: &Model, poses: &[Pose], a: Option<usize>, b: Option<usize>, r: f64, offset: f64) -> ConstraintKin {
    let (tha, wa) = angular(poses, a);
    let (thb, wb) = angular(poses, b);
    ConstraintKin { value: tha + r * thb - offset, vel: wa + r * wb, j: angle_row(model, a, 1.0, b, r), c: 0.0 }
}

/// Speed drive of a motor: ω_b − ω_a = speed (velocity level only: value 0, vel = ω_b − ω_a − speed).
pub fn drive_kin(model: &Model, poses: &[Pose], a: Option<usize>, b: Option<usize>, speed: f64) -> ConstraintKin {
    let (_, wa) = angular(poses, a);
    let (_, wb) = angular(poses, b);
    ConstraintKin { value: 0.0, vel: wb - wa - speed, j: angle_row(model, a, -1.0, b, 1.0), c: 0.0 }
}

/// Slider: anchor b stays on the line through anchor a along the axis (see kinematics.ts).
pub fn slider_kin(model: &Model, poses: &[Pose], s: &SliderModel) -> ConstraintKin {
    slider_line(model, poses, s, true)
}

/// Displacement of a slider along its axis (26.52, D58): s = u·(P_b − P_a), the axis turning with a's body.
pub fn slider_axis_kin(model: &Model, poses: &[Pose], s: &SliderModel) -> ConstraintKin {
    slider_line(model, poses, s, false)
}

/// Relative rolling of a contact (26.52, D59): ω_A − ω_B, J = (+1 on θ_A, −1 on θ_B), velocity level only.
pub fn roll_kin(model: &Model, poses: &[Pose], a: usize, b: usize) -> ConstraintKin {
    let wa = poses[a].w;
    let wb = poses[b].w;
    let mut row = empty_row();
    let ia = model.bodies[a].index;
    let ib = model.bodies[b].index;
    row.ai = ia;
    row.aw = if ia >= 0 { 1.0 } else { 0.0 };
    row.bi = ib;
    row.bw = if ib >= 0 { -1.0 } else { 0.0 };
    ConstraintKin { value: 0.0, vel: wa - wb, j: row, c: 0.0 }
}

/// g = d·(P_b − P_a) for the slider's normal (`normal`) or axis direction d, turning with a's body.
fn slider_line(model: &Model, poses: &[Pose], s: &SliderModel, normal: bool) -> ConstraintKin {
    let pa = anchor_state(poses, &s.a);
    let pb = anchor_state(poses, &s.b);
    let ga = s.a.body.filter(|&g| model.bodies[g].index >= 0);
    let (ax, ay) = match ga {
        Some(g) => {
            let p = &poses[g];
            (p.c * s.axis.x - p.s * s.axis.y, p.s * s.axis.x + p.c * s.axis.y)
        }
        None => (s.axis.x, s.axis.y),
    };
    // Normal n = (−a_y, a_x) (or the axis itself) and k×n = (−n_y, n_x)
    let nx = if normal { -ay } else { ax };
    let ny = if normal { ax } else { ay };
    let knx = -ny;
    let kny = nx;
    let dx = pb.px - pa.px;
    let dy = pb.py - pa.py;
    let dvx = pb.vx - pa.vx;
    let dvy = pb.vy - pa.vy;
    let wa = match ga {
        Some(g) => poses[g].w,
        None => 0.0,
    };
    let mut row = empty_row();
    if let Some(g) = ga {
        let p = &poses[g];
        row.ai = model.bodies[g].index;
        row.ax = -nx;
        row.ay = -ny;
        row.aw = knx * (pb.px - p.x) + kny * (pb.py - p.y);
    }
    let ib = dyn_index(model, s.b.body);
    if ib >= 0 {
        row.bi = ib;
        row.bx = nx;
        row.by = ny;
        row.bw = nx * -pb.ry + ny * pb.rx;
    }
    let value = nx * dx + ny * dy;
    let vel = wa * (knx * dx + kny * dy) + nx * dvx + ny * dvy;
    let c = -wa * wa * value + 2.0 * wa * (knx * dvx + kny * dvy) + nx * (pb.qx - pa.qx) + ny * (pb.qy - pa.qy);
    ConstraintKin { value, vel, j: row, c }
}

/// Kind of an equality constraint row.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EqualityKind {
    Hinge,
    Weld,
    Motor,
    Drive,
    Rod,
    Slider,
    Gear,
}

/// An equality constraint row of a connector: kind, connector index, sub-row, kinematics, position-level or not.
#[derive(Clone, Debug)]
pub struct EqualityKin {
    pub kind: EqualityKind,
    pub owner: usize,
    pub sub: usize,
    pub kin: ConstraintKin,
    pub holonomic: bool,
}

/// All equality rows of the connectors in a fixed order: hinges, welds, motors, rods, sliders, gears. Rods carry
/// value = distance − length. Scenes without the connectors of 26.51 get exactly the rows of 26.50.
pub fn equality_kins_into(model: &Model, poses: &[Pose], out: &mut Vec<EqualityKin>) {
    out.clear();
    let push = |out: &mut Vec<EqualityKin>, kind: EqualityKind, owner: usize, sub: usize, kin: ConstraintKin, holonomic: bool| {
        out.push(EqualityKin { kind, owner, sub, kin, holonomic });
    };
    for (k, h) in model.hinges.iter().enumerate() {
        let [rx, ry] = hinge_kin(model, poses, &h.a, &h.b);
        push(out, EqualityKind::Hinge, k, 0, rx, true);
        push(out, EqualityKind::Hinge, k, 1, ry, true);
    }
    for (k, w) in model.welds.iter().enumerate() {
        let [rx, ry] = hinge_kin(model, poses, &w.a, &w.b);
        push(out, EqualityKind::Weld, k, 0, rx, true);
        push(out, EqualityKind::Weld, k, 1, ry, true);
        push(out, EqualityKind::Weld, k, 2, rel_angle_kin(model, poses, w.a.body, w.b.body, w.angle0), true);
    }
    for (k, m) in model.motors.iter().enumerate() {
        let [rx, ry] = hinge_kin(model, poses, &m.a, &m.b);
        push(out, EqualityKind::Motor, k, 0, rx, true);
        push(out, EqualityKind::Motor, k, 1, ry, true);
        if !m.torque_mode {
            push(out, EqualityKind::Drive, k, 2, drive_kin(model, poses, m.a.body, m.b.body, m.speed), false);
        }
    }
    for (k, r) in model.rods.iter().enumerate() {
        let (d, _, _) = distance_kin(model, poses, &r.a, &r.b);
        let kin = ConstraintKin { value: d.value - r.length, vel: d.vel, j: d.j, c: d.c };
        push(out, EqualityKind::Rod, k, 0, kin, true);
    }
    for (k, sl) in model.sliders.iter().enumerate() {
        push(out, EqualityKind::Slider, k, 0, slider_kin(model, poses, sl), true);
        if !sl.free {
            push(out, EqualityKind::Slider, k, 1, rel_angle_kin(model, poses, sl.a.body, sl.b.body, sl.angle0), true);
        }
    }
    for (k, g) in model.gears.iter().enumerate() {
        push(out, EqualityKind::Gear, k, 0, gear_kin(model, poses, g.a, g.b, g.ratio, g.offset0), true);
    }
}

/// All equality rows of the connectors (see `equality_kins_into`).
pub fn equality_kins(model: &Model, poses: &[Pose]) -> Vec<EqualityKin> {
    let mut out = Vec::new();
    equality_kins_into(model, poses, &mut out);
    out
}

/// Geometry of a rope's path over its pulleys (the drawing-only parts are left out).
#[derive(Clone, Debug, Default)]
pub struct RopePath {
    pub length: f64,
    /// First point (anchor A) of the path.
    pub first_point: Vec2,
    pub u1: Vec2,
    pub u_last: Vec2,
    pub s1: f64,
    pub s_last: f64,
}

/// Tangent line between two signed circles: departure, arrival and unit direction.
fn tangent(c1: Vec2, rho1: f64, c2: Vec2, rho2: f64) -> (Vec2, Vec2, Vec2) {
    let dx = c2.x - c1.x;
    let dy = c2.y - c1.y;
    let l2 = dx * dx + dy * dy;
    let l = l2.sqrt();
    let k = (rho1 - rho2) / l;
    let q = js_max(0.0, 1.0 - k * k).sqrt();
    let mut nx = (k * dx + q * -dy) / l;
    let mut ny = (k * dy + q * dx) / l;
    if -ny * dx + nx * dy < 0.0 {
        nx = (k * dx - q * -dy) / l;
        ny = (k * dy - q * dx) / l;
    }
    let p1 = Vec2 { x: c1.x + rho1 * nx, y: c1.y + rho1 * ny };
    let p2 = Vec2 { x: c2.x + rho2 * nx, y: c2.y + rho2 * ny };
    (p1, p2, Vec2 { x: -ny, y: nx })
}

#[inline]
fn dist2(ax: f64, bx: f64, ay: f64, by: f64) -> f64 {
    let dx = ax - bx;
    let dy = ay - by;
    (dx * dx + dy * dy).sqrt()
}

/// Axle of a pulley: fixed in the world, or a point of the dynamic body carrying it.
pub fn pulley_state(poses: &[Pose], pulley: &PulleyModel) -> PointState {
    match pulley.body {
        None => PointState { px: pulley.position.x, py: pulley.position.y, ..Default::default() },
        Some(g) => point_state(&poses[g], pulley.position),
    }
}

/// World position of a pulley's axle.
pub fn pulley_center(poses: &[Pose], pulley: &PulleyModel) -> Vec2 {
    if pulley.body.is_none() {
        return pulley.position;
    }
    let p = pulley_state(poses, pulley);
    Vec2 { x: p.px, y: p.py }
}

/// Arc lengths of the wheels of a rope, kept until all free segments are summed (the TypeScript order of the
/// additions); inline for up to 8 pulleys.
struct ArcBuf {
    small: [f64; 8],
    n: usize,
    more: Vec<f64>,
}

impl ArcBuf {
    fn push(&mut self, v: f64) {
        if self.n < 8 {
            self.small[self.n] = v;
        } else {
            self.more.push(v);
        }
        self.n += 1;
    }
    fn get(&self, i: usize) -> f64 {
        if i < 8 {
            self.small[i]
        } else {
            self.more[i - 8]
        }
    }
}

/// Length r·|sweep| of the rope on a wheel from the arrival to the departure point (None for an ideal point).
fn wheel_arc(c: Vec2, r: f64, wrap: f64, arrival: Vec2, departure: Vec2) -> Option<f64> {
    if r <= 0.0 {
        return None;
    }
    let ux = arrival.x - c.x;
    let uy = arrival.y - c.y;
    let vx = departure.x - c.x;
    let vy = departure.y - c.y;
    let cr = ux * vy - uy * vx;
    let dt = ux * vx + uy * vy;
    let mut sweep = atan2_det(cr, dt);
    if wrap > 0.0 && sweep < 0.0 {
        sweep += 2.0 * PI_VALUE;
    }
    if wrap < 0.0 && sweep > 0.0 {
        sweep -= 2.0 * PI_VALUE;
    }
    Some(r * sweep.abs())
}

/// Path of a rope at the given poses. The free segments are written to `segs` when given (movable pulleys).
pub fn rope_path_into(model: &Model, poses: &[Pose], rope: &RopeModel, mut segs: Option<&mut Vec<(Vec2, f64)>>) -> RopePath {
    let pa = anchor_state(poses, &rope.a);
    let pb = anchor_state(poses, &rope.b);
    let a = Vec2 { x: pa.px, y: pa.py };
    let b = Vec2 { x: pb.px, y: pb.py };
    if let Some(s) = segs.as_deref_mut() {
        s.clear();
    }
    if rope.pulleys.is_empty() {
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = (dx * dx + dy * dy).sqrt();
        let u = if d > 0.0 { Vec2 { x: dx / d, y: dy / d } } else { Vec2::default() };
        if let Some(s) = segs.as_deref_mut() {
            s.push((u, d));
        }
        return RopePath { length: d, first_point: a, u1: u, u_last: u, s1: d, s_last: d };
    }
    // Circle i: centre, signed radius ρ = wrap·r, radius r, wrap
    let circle = |i: usize| -> (Vec2, f64, f64, f64) {
        let (pi, wrap) = rope.pulleys[i];
        let p = &model.pulleys[pi];
        (if rope.movable { pulley_center(poses, p) } else { p.position }, wrap * p.radius, p.radius, wrap)
    };
    let np = rope.pulleys.len();
    let mut arcs = ArcBuf { small: [0.0; 8], n: 0, more: Vec::new() };
    let mut has_arc = [false; 8];
    let mut has_arc_more: Vec<bool> = Vec::new();
    let mut push_arc = |arcs: &mut ArcBuf, v: Option<f64>| {
        let i = arcs.n;
        arcs.push(v.unwrap_or(0.0));
        if i < 8 {
            has_arc[i] = v.is_some();
        } else {
            has_arc_more.push(v.is_some());
        }
    };
    let mut length = 0.0;
    let mut cur = circle(0);
    let first = tangent(a, 0.0, cur.0, cur.1);
    length += dist2(first.1.x, a.x, first.1.y, a.y);
    let u1 = first.2;
    let s1 = length;
    if let Some(s) = segs.as_deref_mut() {
        s.push((u1, s1));
    }
    let mut arrival = first.1;
    for i in 0..np - 1 {
        let next = circle(i + 1);
        let seg = tangent(cur.0, cur.1, next.0, next.1);
        push_arc(&mut arcs, wheel_arc(cur.0, cur.2, cur.3, arrival, seg.0));
        arrival = seg.1;
        let sk = dist2(seg.1.x, seg.0.x, seg.1.y, seg.0.y);
        if let Some(s) = segs.as_deref_mut() {
            s.push((seg.2, sk));
        }
        length += sk;
        cur = next;
    }
    let last = tangent(cur.0, cur.1, b, 0.0);
    push_arc(&mut arcs, wheel_arc(cur.0, cur.2, cur.3, arrival, last.0));
    let s_last = dist2(b.x, last.0.x, b.y, last.0.y);
    if let Some(s) = segs {
        s.push((last.2, s_last));
    }
    length += s_last;
    for i in 0..arcs.n {
        let present = if i < 8 { has_arc[i] } else { has_arc_more[i - 8] };
        if present {
            length += arcs.get(i);
        }
    }
    RopePath { length, first_point: a, u1, u_last: last.2, s1, s_last }
}

/// Path of a rope at the given poses.
pub fn rope_path(model: &Model, poses: &[Pose], rope: &RopeModel) -> RopePath {
    rope_path_into(model, poses, rope, None)
}

/// Accumulates the terms of a row over any number of bodies (each body once, in order of appearance).
struct RowBuilder<'a> {
    terms: &'a mut Vec<RowTerm>,
}

impl RowBuilder<'_> {
    fn add(&mut self, i: i32, gx: f64, gy: f64, p: &PointState) {
        if i < 0 {
            return;
        }
        let w = p.rx * gy - p.ry * gx;
        for t in self.terms.iter_mut() {
            if t.i == i {
                t.x += gx;
                t.y += gy;
                t.w += w;
                return;
            }
        }
        self.terms.push(RowTerm { i, x: gx, y: gy, w });
    }

    fn row(&self) -> RowJ {
        let mut r = empty_row();
        let t = &self.terms;
        if !t.is_empty() {
            r.ai = t[0].i;
            r.ax = t[0].x;
            r.ay = t[0].y;
            r.aw = t[0].w;
        }
        if t.len() > 1 {
            r.bi = t[1].i;
            r.bx = t[1].x;
            r.by = t[1].y;
            r.bw = t[1].w;
        }
        if t.len() > 2 {
            r.ex = t[2..].to_vec();
        }
        r
    }
}

/// Reused buffers of `rope_kin` for ropes over movable pulleys (26.55, D97: no allocations per evaluation; the
/// arithmetic and its order are unchanged).
#[derive(Default)]
struct RopeScratch {
    segs: Vec<(Vec2, f64)>,
    ends: Vec<(i32, PointState)>,
    terms: Vec<RowTerm>,
}

thread_local! {
    static ROPE_SCRATCH: std::cell::RefCell<RopeScratch> = std::cell::RefCell::new(RopeScratch::default());
}

/// Dynamic index of an optional body (−1 for the world or a static body).
#[inline]
fn dyn_index(model: &Model, body: Option<usize>) -> i32 {
    match body {
        Some(g) => model.bodies[g].index,
        None => -1,
    }
}

/// Rope as a unilateral constraint g = L − ℓ ≥ 0, with its path.
pub fn rope_kin(model: &Model, poses: &[Pose], rope: &RopeModel) -> (ConstraintKin, RopePath) {
    if rope.movable {
        return ROPE_SCRATCH.with(|cell| {
            let mut scratch = cell.borrow_mut();
            let RopeScratch { segs, ends, terms } = &mut *scratch;
            let path = rope_path_into(model, poses, rope, Some(segs));
            ends.clear();
            ends.push((dyn_index(model, rope.a.body), anchor_state(poses, &rope.a)));
            for &(pi, _) in &rope.pulleys {
                let p = &model.pulleys[pi];
                ends.push((dyn_index(model, p.body), pulley_state(poses, p)));
            }
            ends.push((dyn_index(model, rope.b.body), anchor_state(poses, &rope.b)));
            terms.clear();
            let mut rb = RowBuilder { terms };
            let mut len_rate = 0.0;
            let mut c = 0.0;
            for (k, &(u, s)) in segs.iter().enumerate() {
                let (i0, e0) = ends[k];
                let (i1, e1) = ends[k + 1];
                let ux = u.x;
                let uy = u.y;
                rb.add(i0, ux, uy, &e0);
                rb.add(i1, -ux, -uy, &e1);
                let dvx = e1.vx - e0.vx;
                let dvy = e1.vy - e0.vy;
                let along = ux * dvx + uy * dvy;
                len_rate += along;
                let perp_sq = dvx * dvx + dvy * dvy - along * along;
                c += ux * (e1.qx - e0.qx) + uy * (e1.qy - e0.qy) + if s > 0.0 { perp_sq / s } else { 0.0 };
            }
            let value = rope.length - path.length;
            (ConstraintKin { value, vel: -len_rate, j: rb.row(), c: -c }, path)
        });
    }
    if rope.pulleys.is_empty() {
        let (k, _, _) = distance_kin(model, poses, &rope.a, &rope.b);
        let row = &k.j;
        let neg = RowJ { ai: row.ai, ax: -row.ax, ay: -row.ay, aw: -row.aw, bi: row.bi, bx: -row.bx, by: -row.by, bw: -row.bw, ex: Vec::new() };
        let path = rope_path(model, poses, rope);
        return (ConstraintKin { value: rope.length - k.value, vel: -k.vel, j: neg, c: -k.c }, path);
    }
    let path = rope_path(model, poses, rope);
    let pa = anchor_state(poses, &rope.a);
    let pb = anchor_state(poses, &rope.b);
    let u1 = path.u1;
    let ul = path.u_last;
    let mut row = empty_row();
    anchor_row(model, &mut row, true, &rope.a, u1.x, u1.y, &pa);
    anchor_row(model, &mut row, false, &rope.b, -ul.x, -ul.y, &pb);
    let vel = u1.x * pa.vx + u1.y * pa.vy - (ul.x * pb.vx + ul.y * pb.vy);
    let va_par = u1.x * pa.vx + u1.y * pa.vy;
    let vb_par = ul.x * pb.vx + ul.y * pb.vy;
    let va_perp_sq = pa.vx * pa.vx + pa.vy * pa.vy - va_par * va_par;
    let vb_perp_sq = pb.vx * pb.vx + pb.vy * pb.vy - vb_par * vb_par;
    let c = u1.x * pa.qx + u1.y * pa.qy
        - (ul.x * pb.qx + ul.y * pb.qy)
        - (if path.s1 > 0.0 { va_perp_sq / path.s1 } else { 0.0 })
        - (if path.s_last > 0.0 { vb_perp_sq / path.s_last } else { 0.0 });
    (ConstraintKin { value: rope.length - path.length, vel, j: row, c }, path)
}

// ---- Probes ----
/// A probe watches one point of body A against the whole of body B.
#[derive(Clone, Debug)]
pub struct Probe {
    pub key: String,
    pub a: usize,
    pub local: Vec2,
    pub radius: f64,
    pub vertex: i32,
    pub b: usize,
    /// Convex piece of a complex B the probe watches (26.52); None: the whole of B.
    pub piece: Option<usize>,
}

/// Probes of a pair with a complex shape: each point of one body against each piece of the other (26.52, D35).
fn complex_pair_probes(x: &BodyModel, y: &BodyModel) -> Vec<Probe> {
    let mut out = Vec::new();
    let add = |out: &mut Vec<Probe>, a: &BodyModel, b: &BodyModel| {
        for p in body_points(a) {
            let key = probe_key(a, p.vertex, b);
            match &b.shape {
                ShapeModel::Complex(c) => {
                    for k in 0..c.pieces.len() {
                        out.push(Probe {
                            key: format!("{key}@{k}"),
                            a: a.global,
                            local: p.local,
                            radius: p.radius,
                            vertex: p.vertex,
                            b: b.global,
                            piece: Some(k),
                        });
                    }
                }
                _ => out.push(Probe { key, a: a.global, local: p.local, radius: p.radius, vertex: p.vertex, b: b.global, piece: None }),
            }
        }
    };
    if matches!(y.shape, ShapeModel::Circle { .. }) {
        add(&mut out, y, x);
    } else if matches!(x.shape, ShapeModel::Circle { .. }) {
        add(&mut out, x, y);
    } else {
        add(&mut out, x, y);
        add(&mut out, y, x);
    }
    out
}

/// Probes of a body pair.
pub fn pair_probes(model: &Model, xi: usize, yi: usize) -> Vec<Probe> {
    let x = &model.bodies[xi];
    let y = &model.bodies[yi];
    if matches!(x.shape, ShapeModel::Complex(_)) || matches!(y.shape, ShapeModel::Complex(_)) {
        return complex_pair_probes(x, y);
    }
    let mut out = Vec::new();
    let add = |out: &mut Vec<Probe>, a: &BodyModel, b: &BodyModel| match &a.shape {
        ShapeModel::Circle { radius } => {
            out.push(Probe { key: probe_key(a, -1, b), a: a.global, local: Vec2::default(), radius: *radius, vertex: -1, b: b.global, piece: None })
        }
        ShapeModel::Polygon { verts, .. } => {
            for (i, v) in verts.iter().enumerate() {
                out.push(Probe { key: probe_key(a, i as i32, b), a: a.global, local: *v, radius: 0.0, vertex: i as i32, b: b.global, piece: None });
            }
        }
        ShapeModel::Complex(_) => {}
    };
    let xc = matches!(x.shape, ShapeModel::Circle { .. });
    let yc = matches!(y.shape, ShapeModel::Circle { .. });
    if xc || !yc {
        if xc || yc {
            add(&mut out, x, y);
        } else {
            add(&mut out, x, y);
            add(&mut out, y, x);
        }
    } else {
        add(&mut out, y, x);
    }
    out
}

/// Signed distance from a world point to body B (negative inside).
pub fn signed_distance(b: &BodyModel, pose: &Pose, px: f64, py: f64) -> f64 {
    let dx = px - pose.x;
    let dy = py - pose.y;
    let lx = pose.c * dx + pose.s * dy;
    let ly = -pose.s * dx + pose.c * dy;
    match &b.shape {
        ShapeModel::Circle { radius } => (lx * lx + ly * ly).sqrt() - radius,
        ShapeModel::Polygon { verts, normals, .. } => convex_distance(verts, normals, lx, ly),
        ShapeModel::Complex(c) => {
            // 26.52 (D35): the smallest signed distance over the convex pieces
            let mut best = f64::INFINITY;
            for p in &c.pieces {
                let d = piece_distance(p, lx, ly);
                if d < best {
                    best = d;
                }
            }
            best
        }
    }
}

/// Signed distance from a local point to a convex piece of a complex shape.
fn piece_distance(p: &ShapePiece, lx: f64, ly: f64) -> f64 {
    match p {
        ShapePiece::Circle { center, radius } => {
            let dx = lx - center.x;
            let dy = ly - center.y;
            (dx * dx + dy * dy).sqrt() - radius
        }
        ShapePiece::Polygon { verts, normals } => convex_distance(verts, normals, lx, ly),
    }
}

/// Signed distance from a local point to a convex polygon.
fn convex_distance(verts: &[Vec2], normals: &[Vec2], lx: f64, ly: f64) -> f64 {
    let mut max_gap = f64::NEG_INFINITY;
    for f in 0..verts.len() {
        let g = normals[f].x * (lx - verts[f].x) + normals[f].y * (ly - verts[f].y);
        if g > max_gap {
            max_gap = g;
        }
    }
    if max_gap <= 0.0 {
        return max_gap;
    }
    let mut best = f64::INFINITY;
    for f in 0..verts.len() {
        let a = verts[f];
        let bb = verts[(f + 1) % verts.len()];
        let ex = bb.x - a.x;
        let ey = bb.y - a.y;
        let wx = lx - a.x;
        let wy = ly - a.y;
        let ee = ex * ex + ey * ey;
        let mut u = if ee > 0.0 { (wx * ex + wy * ey) / ee } else { 0.0 };
        // The branches of kinematics.ts, kept line for line
        #[allow(clippy::manual_clamp)]
        if u < 0.0 {
            u = 0.0;
        } else if u > 1.0 {
            u = 1.0;
        }
        let qx = wx - u * ex;
        let qy = wy - u * ey;
        let d2 = qx * qx + qy * qy;
        if d2 < best {
            best = d2;
        }
    }
    best.sqrt()
}

/// Value of a probe: signed distance from its point to B (or to its piece) minus its radius (m).
pub fn probe_value(model: &Model, p: &Probe, poses: &[Pose]) -> f64 {
    let pa = &poses[p.a];
    let px = pa.x + pa.c * p.local.x - pa.s * p.local.y;
    let py = pa.y + pa.s * p.local.x + pa.c * p.local.y;
    if let (Some(k), ShapeModel::Complex(c)) = (p.piece, &model.bodies[p.b].shape) {
        let pose = &poses[p.b];
        let dx = px - pose.x;
        let dy = py - pose.y;
        let lx = pose.c * dx + pose.s * dy;
        let ly = -pose.s * dx + pose.c * dy;
        return piece_distance(&c.pieces[k], lx, ly) - p.radius;
    }
    signed_distance(&model.bodies[p.b], &poses[p.b], px, py) - p.radius
}
