//! Compiled model (port of `src/core/solver/model.ts`): the scene turned into what the solver needs. Bodies,
//! pulleys and dynamic bodies are referred to by index (`global` index into `bodies`, dynamic slot `index`).

use crate::dmath::{cos, log, pow, sin};
use crate::expr::{ExprArena, ENV_SIZE};
use crate::js::{js_max, js_min};
use crate::message::{Message, SimResult};
use crate::scene::{BodyDef, BodyKind, ConnectorKind, Material, Scene, SceneSettings, ShapeDef, ShapePart, Vec2, Wrap};

/// Compiled shape of a body.
#[derive(Clone, Debug)]
pub enum ShapeModel {
    Circle {
        radius: f64,
    },
    /// Counter-clockwise vertices, outward edge normals and edge lengths.
    Polygon {
        verts: Vec<Vec2>,
        normals: Vec<Vec2>,
        lengths: Vec<f64>,
    },
    /// Concave polygon or compound shape (26.52, D35).
    Complex(ComplexShape),
}

/// A point feature of a complex shape: a circle part's centre or a convex vertex (with the normals of its faces).
#[derive(Clone, Copy, Debug)]
pub struct ShapePoint {
    pub local: Vec2,
    pub radius: f64,
    pub cone: Option<(Vec2, Vec2)>,
    pub piece: usize,
}

/// A face of a complex shape with its convex piece.
#[derive(Clone, Copy, Debug)]
pub struct ShapeFace {
    pub e0: Vec2,
    pub e1: Vec2,
    pub normal: Vec2,
    pub len: f64,
    pub piece: usize,
}

/// A convex piece (or a part outline) of a complex shape.
#[derive(Clone, Debug)]
pub enum ShapePiece {
    Circle { center: Vec2, radius: f64 },
    Polygon { verts: Vec<Vec2>, normals: Vec<Vec2> },
}

/// Compiled concave polygon or compound shape (see model.ts).
#[derive(Clone, Debug, Default)]
pub struct ComplexShape {
    pub points: Vec<ShapePoint>,
    pub faces: Vec<ShapeFace>,
    pub pieces: Vec<ShapePiece>,
    pub outline: Vec<ShapePiece>,
}

/// A body compiled for the solver.
#[derive(Clone, Debug)]
pub struct BodyModel {
    /// Index in `Model::bodies`.
    pub global: usize,
    /// Index among dynamic bodies (state slot), −1 for static bodies.
    pub index: i32,
    pub id: String,
    pub name: String,
    pub dynamic: bool,
    pub shape: ShapeModel,
    pub mass: f64,
    pub inertia: f64,
    pub inv_mass: f64,
    pub inv_inertia: f64,
    pub material: Material,
    /// Conveyor belt speed (m/s); 0 for dynamic bodies.
    pub belt_speed: f64,
    /// Radius of a circle around the body origin containing the shape (broad phase).
    pub bound: f64,
    pub static_pos: Vec2,
    pub static_angle: f64,
    pub static_c: f64,
    pub static_s: f64,
    /// Initial state from the scene.
    pub def_position: Vec2,
    pub def_angle: f64,
    pub def_velocity: Vec2,
    pub def_angular_velocity: f64,
    /// Drag coefficients (26.51): linear b (N·s/m) and quadratic c (N·s²/m²); 0 without drag.
    pub drag_lin: f64,
    pub drag_quad: f64,
    /// Gravitating mass (kg; 26.51): the body's mass when gravitation is on (static bodies too), else 0.
    pub attract: f64,
    /// Centre of attraction of a static body (world, m): its area centroid; dynamic bodies use their centre of mass.
    pub grav_pos: Vec2,
}

/// Anchor resolved to its body (global index; None: the world).
#[derive(Clone, Copy, Debug)]
pub struct AnchorModel {
    pub body: Option<usize>,
    pub local: Vec2,
}

/// Pulley: fixed at `position` (world) or carried by dynamic body `body` (`position` in its coordinates).
#[derive(Clone, Debug)]
pub struct PulleyModel {
    pub id: String,
    pub name: String,
    pub position: Vec2,
    pub radius: f64,
    pub body: Option<usize>,
}

/// Compiled rope; `wrap` is +1 for counter-clockwise, −1 for clockwise.
#[derive(Clone, Debug)]
pub struct RopeModel {
    pub id: String,
    pub name: String,
    pub a: AnchorModel,
    pub b: AnchorModel,
    /// (pulley index, wrap)
    pub pulleys: Vec<(usize, f64)>,
    /// NaN until build_system resolves it.
    pub length: f64,
    pub movable: bool,
}

/// Compiled rod.
#[derive(Clone, Debug)]
pub struct RodModel {
    pub id: String,
    pub name: String,
    pub a: AnchorModel,
    pub b: AnchorModel,
    pub length: f64,
}

/// Compiled spring.
#[derive(Clone, Debug)]
pub struct SpringModel {
    pub id: String,
    pub name: String,
    pub a: AnchorModel,
    pub b: AnchorModel,
    pub stiffness: f64,
    pub rest_length: f64,
    pub damping: f64,
    /// k₃ of a nonlinear spring (0: linear).
    pub cubic: f64,
    /// A damper (26.51): stiffness 0, no potential energy.
    pub damper: bool,
}

/// Compiled weld; `angle0` (rad) is NaN until build_system resolves it.
#[derive(Clone, Debug)]
pub struct WeldModel {
    pub id: String,
    pub name: String,
    pub a: AnchorModel,
    pub b: AnchorModel,
    pub angle0: f64,
}

/// Compiled slider; `axis` is the unit direction in a's body frame (world when a has no dynamic body). End stops
/// (26.52, D58): `lo` ≤ s ≤ `hi` (±∞: none), restitution `e`; `limited` when either stop exists.
#[derive(Clone, Debug)]
pub struct SliderModel {
    pub id: String,
    pub name: String,
    pub a: AnchorModel,
    pub b: AnchorModel,
    pub axis: Vec2,
    pub free: bool,
    pub angle0: f64,
    pub limited: bool,
    pub lo: f64,
    pub hi: f64,
    pub e: f64,
}

/// Compiled motor (a pin joint with a drive); `max_torque` (26.52) is +∞ when unlimited, `limited` for a speed motor
/// with a finite one.
#[derive(Clone, Debug)]
pub struct MotorModel {
    pub id: String,
    pub name: String,
    pub a: AnchorModel,
    pub b: AnchorModel,
    pub torque_mode: bool,
    pub speed: f64,
    pub torque: f64,
    pub max_torque: f64,
    pub limited: bool,
}

/// Compiled central field (26.52, D60): F = k·rⁿ towards the centre `a` on each target (global body indices, dynamic,
/// never the carrier of the centre).
#[derive(Clone, Debug)]
pub struct CentralModel {
    pub id: String,
    pub name: String,
    pub a: AnchorModel,
    pub k: f64,
    pub n: f64,
    pub targets: Vec<usize>,
}

/// Compiled gear: ω_a + ratio·ω_b = 0 between dynamic bodies (None: the world); `offset0` resolved at build.
#[derive(Clone, Debug)]
pub struct GearModel {
    pub id: String,
    pub name: String,
    pub a: Option<usize>,
    pub b: Option<usize>,
    pub ratio: f64,
    pub offset0: f64,
}

/// Compiled pin joint.
#[derive(Clone, Debug)]
pub struct HingeModel {
    pub id: String,
    pub name: String,
    pub a: AnchorModel,
    pub b: AnchorModel,
}

/// Compiled applied force; `expr` holds the arena roots of the x and y components.
#[derive(Clone, Debug)]
pub struct ForceModel {
    pub id: String,
    pub name: String,
    pub a: AnchorModel,
    pub force: Vec2,
    pub expr: Option<(usize, usize)>,
}

/// The compiled model of a scene.
#[derive(Clone, Debug)]
pub struct Model {
    pub settings: SceneSettings,
    pub bodies: Vec<BodyModel>,
    /// Global indices of the dynamic bodies, by dynamic slot.
    pub dynamic: Vec<usize>,
    pub pulleys: Vec<PulleyModel>,
    pub ropes: Vec<RopeModel>,
    pub rods: Vec<RodModel>,
    pub springs: Vec<SpringModel>,
    pub hinges: Vec<HingeModel>,
    pub forces: Vec<ForceModel>,
    /// Connectors of 26.51 (D51).
    pub welds: Vec<WeldModel>,
    pub sliders: Vec<SliderModel>,
    pub motors: Vec<MotorModel>,
    pub gears: Vec<GearModel>,
    /// Central fields (26.52, D60).
    pub centrals: Vec<CentralModel>,
    /// Some slider has an end stop (the mode then carries `limit`).
    pub has_limits: bool,
    /// Some speed motor has a torque limit (the mode then carries `slip`).
    pub has_slip: bool,
    /// Gravitational constant when gravitation is on (26.51, D50), else 0.
    pub g_const: f64,
    /// Global indices of the bodies with a gravitating mass, in scene order.
    pub attractors: Vec<usize>,
    pub n: usize,
    /// Pair keys of bodies that never collide (joined by a hinge), in insertion order.
    pub no_collide: Vec<String>,
    /// Compiled expressions and the switch list.
    pub arena: ExprArena,
    /// Force index of each switch.
    pub switch_force: Vec<usize>,
    pub has_expr: bool,
    pub force_scale: f64,
    pub accel_scale: f64,
    pub warnings: Vec<Message>,
    /// Pair material overrides (scene.contactPairs).
    pub contact_pairs: Vec<crate::scene::ContactPairDef>,
    /// Some static body has a belt speed ≠ 0 (scene.bodies.some(…)).
    pub running_belt: bool,
    /// 1 / mass and 1 / inertia by dynamic slot.
    pub dyn_inv_mass: Vec<f64>,
    pub dyn_inv_inertia: Vec<f64>,
}

/// JavaScript string comparison `a < b` (UTF-16 code units).
pub fn js_str_lt(a: &str, b: &str) -> bool {
    a.encode_utf16().lt(b.encode_utf16())
}

/// Order-independent key of a body pair.
pub fn pair_key(a: &str, b: &str) -> String {
    if js_str_lt(a, b) {
        format!("{a}|{b}")
    } else {
        format!("{b}|{a}")
    }
}

fn cross(a: Vec2, b: Vec2) -> f64 {
    a.x * b.y - a.y * b.x
}
fn dot(a: Vec2, b: Vec2) -> f64 {
    a.x * b.x + a.y * b.y
}
fn sub(a: Vec2, b: Vec2) -> Vec2 {
    Vec2 { x: a.x - b.x, y: a.y - b.y }
}
fn length(a: Vec2) -> f64 {
    (a.x * a.x + a.y * a.y).sqrt()
}

fn box_polygon(width: f64, height: f64) -> Vec<Vec2> {
    let w = width / 2.0;
    let h = height / 2.0;
    vec![Vec2::new(-w, -h), Vec2::new(w, -h), Vec2::new(w, h), Vec2::new(-w, h)]
}

fn polygon_area(points: &[Vec2]) -> f64 {
    let mut a = 0.0;
    for i in 0..points.len() {
        a += cross(points[i], points[(i + 1) % points.len()]);
    }
    a / 2.0
}

/// Area centroid of a polygon; the origin for a degenerate one.
pub fn polygon_centroid(points: &[Vec2]) -> Vec2 {
    let mut a = 0.0;
    let mut cx = 0.0;
    let mut cy = 0.0;
    for i in 0..points.len() {
        let p = points[i];
        let q = points[(i + 1) % points.len()];
        let c = cross(p, q);
        a += c;
        cx += (p.x + q.x) * c;
        cy += (p.y + q.y) * c;
    }
    if a == 0.0 {
        Vec2::default()
    } else {
        Vec2 { x: cx / (3.0 * a), y: cy / (3.0 * a) }
    }
}

/// Moment of inertia of a uniform shape about its centre of mass (kg·m²).
pub fn shape_inertia(shape: &ShapeDef, mass: f64) -> f64 {
    match shape {
        ShapeDef::Circle { radius } => 0.5 * mass * radius * radius,
        ShapeDef::Box { width, height } => mass * (width * width + height * height) / 12.0,
        ShapeDef::Compound { parts } => compound_mass(parts, mass).2,
        ShapeDef::Polygon { points } => {
            let c = polygon_centroid(points);
            let pts: Vec<Vec2> = points.iter().map(|p| sub(*p, c)).collect();
            let mut num = 0.0;
            let mut den = 0.0;
            for i in 0..pts.len() {
                let p = pts[i];
                let q = pts[(i + 1) % pts.len()];
                let cr = cross(p, q);
                num += cr * (dot(p, p) + dot(p, q) + dot(q, q));
                den += cr;
            }
            if den == 0.0 {
                0.0
            } else {
                mass * num / (6.0 * den)
            }
        }
    }
}

/// Relative tolerance of the convexity test of a polygon corner.
const CONVEX_TOL: f64 = 1e-9;

/// Whether corner i of a counter-clockwise polygon is convex or flat.
fn convex_corner(verts: &[Vec2], i: usize) -> bool {
    let m = verts.len();
    let a = verts[(i + m - 1) % m];
    let b = verts[i];
    let c = verts[(i + 1) % m];
    let e1 = sub(b, a);
    let e2 = sub(c, b);
    cross(e1, e2) >= -CONVEX_TOL * length(e1) * length(e2)
}

/// Whether a counter-clockwise polygon is convex (every corner convex or flat).
pub fn polygon_is_convex(verts: &[Vec2]) -> bool {
    (0..verts.len()).all(|i| convex_corner(verts, i))
}

/// Whether a polygon is simple (see model.ts).
pub fn polygon_is_simple(points: &[Vec2]) -> bool {
    let m = points.len();
    #[allow(clippy::neg_cmp_op_on_partial_ord)]
    if m < 3 || !(polygon_area(points).abs() > 0.0) {
        return false;
    }
    let orient = |a: Vec2, b: Vec2, c: Vec2| (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    let on_seg = |a: Vec2, b: Vec2, p: Vec2| js_min(a.x, b.x) <= p.x && p.x <= js_max(a.x, b.x) && js_min(a.y, b.y) <= p.y && p.y <= js_max(a.y, b.y);
    for i in 0..m {
        let a = points[i];
        let b = points[(i + 1) % m];
        for j in i + 1..m {
            if j == i + 1 || (i == 0 && j == m - 1) {
                continue;
            }
            let c = points[j];
            let d = points[(j + 1) % m];
            let (o1, o2, o3, o4) = (orient(a, b, c), orient(a, b, d), orient(c, d, a), orient(c, d, b));
            if ((o1 > 0.0 && o2 < 0.0) || (o1 < 0.0 && o2 > 0.0)) && ((o3 > 0.0 && o4 < 0.0) || (o3 < 0.0 && o4 > 0.0)) {
                return false;
            }
            if (o1 == 0.0 && on_seg(a, b, c)) || (o2 == 0.0 && on_seg(a, b, d)) || (o3 == 0.0 && on_seg(c, d, a)) || (o4 == 0.0 && on_seg(c, d, b)) {
                return false;
            }
        }
    }
    true
}

/// Counter-clockwise vertices of a polygon or box part, placed in body coordinates.
fn part_polygon(part: &ShapePart) -> Vec<Vec2> {
    let mut verts = match &part.shape {
        ShapeDef::Box { width, height } => box_polygon(*width, *height),
        ShapeDef::Polygon { points } => points.clone(),
        _ => Vec::new(),
    };
    if polygon_area(&verts) < 0.0 {
        verts.reverse();
    }
    let c = cos(part.angle);
    let sn = sin(part.angle);
    verts.iter().map(|v| Vec2 { x: part.position.x + c * v.x - sn * v.y, y: part.position.y + sn * v.x + c * v.y }).collect()
}

/// Area, area centroid and moment of inertia of a compound shape of uniform density (see model.ts).
pub fn compound_mass(parts: &[ShapePart], mass: f64) -> (f64, Vec2, f64) {
    let list: Vec<(f64, Vec2, f64)> = parts
        .iter()
        .map(|p| match &p.shape {
            ShapeDef::Circle { radius } => (std::f64::consts::PI * radius * radius, p.position, 0.5 * radius * radius),
            _ => {
                let verts = part_polygon(p);
                let unit = shape_inertia(&ShapeDef::Polygon { points: verts.clone() }, 1.0);
                (polygon_area(&verts), polygon_centroid(&verts), unit)
            }
        })
        .collect();
    let mut area = 0.0;
    let mut cx = 0.0;
    let mut cy = 0.0;
    for q in &list {
        area += q.0;
        cx += q.0 * q.1.x;
        cy += q.0 * q.1.y;
    }
    let centroid = if area > 0.0 { Vec2 { x: cx / area, y: cy / area } } else { Vec2::default() };
    let mut inertia = 0.0;
    for q in &list {
        let dx = q.1.x - centroid.x;
        let dy = q.1.y - centroid.y;
        inertia += (if area > 0.0 { mass * q.0 / area } else { 0.0 }) * (q.2 + dx * dx + dy * dy);
    }
    (area, centroid, inertia)
}

/// Outward unit normals of the edges of a counter-clockwise polygon.
fn edge_normals(verts: &[Vec2]) -> Vec<Vec2> {
    let m = verts.len();
    (0..m)
        .map(|i| {
            let e = sub(verts[(i + 1) % m], verts[i]);
            let l = length(e);
            if l > 0.0 {
                Vec2 { x: e.y / l, y: -e.x / l }
            } else {
                Vec2::default()
            }
        })
        .collect()
}

/// Convex decomposition of a simple counter-clockwise polygon (ear clipping, then merging; see model.ts).
pub fn convex_pieces(v: &[Vec2]) -> Vec<Vec<usize>> {
    if polygon_is_convex(v) {
        return vec![(0..v.len()).collect()];
    }
    let cr = |a: usize, b: usize, c: usize| (v[b].x - v[a].x) * (v[c].y - v[a].y) - (v[b].y - v[a].y) * (v[c].x - v[a].x);
    let mut idx: Vec<usize> = (0..v.len()).collect();
    let mut pieces: Vec<Vec<usize>> = Vec::new();
    while idx.len() > 3 {
        let k = idx.len();
        let mut ear: Option<usize> = None;
        for i in 0..k {
            let (a, b, c) = (idx[(i + k - 1) % k], idx[i], idx[(i + 1) % k]);
            #[allow(clippy::neg_cmp_op_on_partial_ord)]
            if !(cr(a, b, c) > 0.0) {
                continue;
            }
            let mut ok = true;
            for &q in &idx {
                if q == a || q == b || q == c {
                    continue;
                }
                if cr(a, b, q) >= 0.0 && cr(b, c, q) >= 0.0 && cr(c, a, q) >= 0.0 {
                    ok = false;
                    break;
                }
            }
            if ok {
                ear = Some(i);
                break;
            }
        }
        // A degenerate remainder (collinear vertices) has no ear: clip its first corner anyway
        let e = ear.unwrap_or(0);
        pieces.push(vec![idx[(e + k - 1) % k], idx[e], idx[(e + 1) % k]]);
        idx.remove(e);
    }
    pieces.push(idx);
    let mut merged = true;
    while merged {
        merged = false;
        'outer: for a in 0..pieces.len() {
            for b in a + 1..pieces.len() {
                if let Some(m) = merge_pieces(v, &pieces[a], &pieces[b]) {
                    pieces[a] = m;
                    pieces.remove(b);
                    merged = true;
                    break 'outer;
                }
            }
        }
    }
    pieces
}

/// Two pieces that share an edge, joined into one when the result is convex.
fn merge_pieces(v: &[Vec2], p: &[usize], q: &[usize]) -> Option<Vec<usize>> {
    let (np, nq) = (p.len(), q.len());
    for s in 0..np {
        let (u, w) = (p[s], p[(s + 1) % np]);
        for t in 0..nq {
            if q[t] != w || q[(t + 1) % nq] != u {
                continue;
            }
            let mut out: Vec<usize> = (1..=np).map(|i| p[(s + i) % np]).collect();
            out.extend((2..nq).map(|i| q[(t + i) % nq]));
            let pts: Vec<Vec2> = out.iter().map(|&i| v[i]).collect();
            return if polygon_is_convex(&pts) { Some(out) } else { None };
        }
    }
    None
}

/// Point and face features of a counter-clockwise polygon part with its convex pieces.
fn add_polygon_part(out: &mut ComplexShape, verts: Vec<Vec2>) {
    let m = verts.len();
    let normals = edge_normals(&verts);
    let base = out.pieces.len();
    let pieces = convex_pieces(&verts);
    for p in &pieces {
        let pv: Vec<Vec2> = p.iter().map(|&i| verts[i]).collect();
        let pn = edge_normals(&pv);
        out.pieces.push(ShapePiece::Polygon { verts: pv, normals: pn });
    }
    let piece_of_edge = |i: usize| -> usize {
        for (k, p) in pieces.iter().enumerate() {
            for j in 0..p.len() {
                if p[j] == i && p[(j + 1) % p.len()] == (i + 1) % m {
                    return base + k;
                }
            }
        }
        base
    };
    let piece_of_vertex = |i: usize| -> usize { pieces.iter().position(|p| p.contains(&i)).map_or(base, |k| base + k) };
    for i in 0..m {
        out.faces.push(ShapeFace {
            e0: verts[i],
            e1: verts[(i + 1) % m],
            normal: normals[i],
            len: length(sub(verts[(i + 1) % m], verts[i])),
            piece: piece_of_edge(i),
        });
    }
    for i in 0..m {
        if convex_corner(&verts, i) {
            out.points.push(ShapePoint { local: verts[i], radius: 0.0, cone: Some((normals[(i + m - 1) % m], normals[i])), piece: piece_of_vertex(i) });
        }
    }
    out.outline.push(ShapePiece::Polygon { verts, normals });
}

/// Compile a concave polygon (counter-clockwise, already centred) or a compound shape.
fn complex_shape(polygon: Option<Vec<Vec2>>, parts: &[ShapePart], shift: Vec2) -> ComplexShape {
    let mut out = ComplexShape::default();
    if let Some(p) = polygon {
        add_polygon_part(&mut out, p);
        return out;
    }
    for part in parts {
        if let ShapeDef::Circle { radius } = &part.shape {
            let center = Vec2 { x: part.position.x - shift.x, y: part.position.y - shift.y };
            let piece = out.pieces.len();
            out.points.push(ShapePoint { local: center, radius: *radius, cone: None, piece });
            out.pieces.push(ShapePiece::Circle { center, radius: *radius });
            out.outline.push(ShapePiece::Circle { center, radius: *radius });
        } else {
            let verts = part_polygon(part).into_iter().map(|v| Vec2 { x: v.x - shift.x, y: v.y - shift.y }).collect();
            add_polygon_part(&mut out, verts);
        }
    }
    out
}

/// Area centroid of a compiled complex shape (its parts) in body coordinates.
fn complex_centroid(shape: &ComplexShape) -> Vec2 {
    let mut area = 0.0;
    let mut cx = 0.0;
    let mut cy = 0.0;
    for p in &shape.outline {
        let (a, c) = match p {
            ShapePiece::Circle { center, radius } => (std::f64::consts::PI * radius * radius, *center),
            ShapePiece::Polygon { verts, .. } => (polygon_area(verts), polygon_centroid(verts)),
        };
        area += a;
        cx += a * c.x;
        cy += a * c.y;
    }
    if area > 0.0 {
        Vec2 { x: cx / area, y: cy / area }
    } else {
        Vec2::default()
    }
}

fn compile_shape(shape: &ShapeDef, dynamic: bool, warnings: &mut Vec<Message>, name: &str) -> ShapeModel {
    let mut verts = match shape {
        ShapeDef::Circle { radius } => return ShapeModel::Circle { radius: *radius },
        ShapeDef::Box { width, height } => box_polygon(*width, *height),
        ShapeDef::Polygon { points } => points.clone(),
        ShapeDef::Compound { parts } => {
            // 26.52 (D35): parts about the area centroid of the whole for a dynamic body
            let mut shift = Vec2::default();
            if dynamic {
                let c = compound_mass(parts, 1.0).1;
                if c.x.abs() > 1e-12 || c.y.abs() > 1e-12 {
                    warnings.push(Message::new("warn.compoundCentred").text("body", name));
                    shift = c;
                }
            }
            return ShapeModel::Complex(complex_shape(None, parts, shift));
        }
    };
    if polygon_area(&verts) < 0.0 {
        verts.reverse();
    }
    if dynamic && matches!(shape, ShapeDef::Polygon { .. }) {
        let c = polygon_centroid(&verts);
        if c.x.abs() > 1e-12 || c.y.abs() > 1e-12 {
            warnings.push(Message::new("warn.polygonCentred").text("body", name));
            verts = verts.iter().map(|p| sub(*p, c)).collect();
        }
    }
    // 26.52 (D35): a concave polygon becomes a complex shape
    if matches!(shape, ShapeDef::Polygon { .. }) && !polygon_is_convex(&verts) {
        return ShapeModel::Complex(complex_shape(Some(verts), &[], Vec2::default()));
    }
    let mut normals = Vec::with_capacity(verts.len());
    let mut lengths = Vec::with_capacity(verts.len());
    for i in 0..verts.len() {
        let e = sub(verts[(i + 1) % verts.len()], verts[i]);
        let l = length(e);
        lengths.push(l);
        normals.push(if l > 0.0 { Vec2 { x: e.y / l, y: -e.x / l } } else { Vec2::default() });
    }
    ShapeModel::Polygon { verts, normals, lengths }
}

fn bound_radius(shape: &ShapeModel) -> f64 {
    match shape {
        ShapeModel::Circle { radius } => *radius,
        ShapeModel::Polygon { verts, .. } => {
            let mut r = 0.0;
            for v in verts {
                r = js_max(r, length(*v));
            }
            r
        }
        ShapeModel::Complex(c) => {
            let mut r = 0.0;
            for p in &c.outline {
                match p {
                    ShapePiece::Circle { center, radius } => r = js_max(r, length(*center) + radius),
                    ShapePiece::Polygon { verts, .. } => {
                        for v in verts {
                            r = js_max(r, length(*v));
                        }
                    }
                }
            }
            r
        }
    }
}

fn find_body(bodies: &[BodyModel], id: &str) -> Option<usize> {
    // Map semantics of the TypeScript byId: the last body with the id wins (ids are unique after validation)
    bodies.iter().rposition(|b| b.id == id)
}

/// Compile a scene into the solver model.
pub fn compile_model(scene: &Scene) -> SimResult<Model> {
    let mut warnings = Vec::new();
    let mut bodies: Vec<BodyModel> = Vec::new();
    let mut dynamic: Vec<usize> = Vec::new();
    for def in &scene.bodies {
        let is_dynamic = def.kind != BodyKind::Static;
        let shape = compile_shape(&def.shape, is_dynamic, &mut warnings, &def.name);
        let mass = if is_dynamic { js_max(def.mass, 1e-12) } else { 0.0 };
        let fixed = def.kind == BodyKind::Particle || def.fixed_rotation;
        let inertia = if is_dynamic { def.inertia.unwrap_or_else(|| shape_inertia(&def.shape, mass)) } else { 0.0 };
        let bound = bound_radius(&shape);
        let mut model = body_model(def, bodies.len(), if is_dynamic { dynamic.len() as i32 } else { -1 }, shape, mass, inertia, fixed, bound);
        model.attract = if scene.settings.gravitation.is_some() && def.mass > 0.0 { def.mass } else { 0.0 };
        if !is_dynamic {
            // Centre of attraction of a static polygon (or complex shape): its centroid in the world
            let c = match &model.shape {
                ShapeModel::Polygon { verts, .. } => Some(polygon_centroid(verts)),
                ShapeModel::Complex(cs) => Some(complex_centroid(cs)),
                ShapeModel::Circle { .. } => None,
            };
            if let Some(c) = c {
                model.grav_pos =
                    Vec2 { x: def.position.x + model.static_c * c.x - model.static_s * c.y, y: def.position.y + model.static_s * c.x + model.static_c * c.y };
            }
        }
        if def.material.mu_s < def.material.mu_k {
            warnings.push(Message::new("warn.muSBelowMuK").text("body", def.name.clone()));
        }
        if is_dynamic {
            dynamic.push(bodies.len());
        }
        bodies.push(model);
    }
    let anchor = |a: &crate::scene::Anchor| AnchorModel { body: a.body.as_deref().and_then(|id| find_body(&bodies, id)), local: a.local };
    let mut pulleys = Vec::new();
    for p in &scene.pulleys {
        let carrier = p.body.as_deref().and_then(|id| find_body(&bodies, id));
        if let Some(ci) = carrier.filter(|&ci| !bodies[ci].dynamic) {
            let cb = &bodies[ci];
            let c = cos(cb.static_angle);
            let s = sin(cb.static_angle);
            let position = Vec2 { x: cb.static_pos.x + c * p.position.x - s * p.position.y, y: cb.static_pos.y + s * p.position.x + c * p.position.y };
            pulleys.push(PulleyModel { id: p.id.clone(), name: p.name.clone(), position, radius: js_max(0.0, p.radius), body: None });
        } else {
            pulleys.push(PulleyModel { id: p.id.clone(), name: p.name.clone(), position: p.position, radius: js_max(0.0, p.radius), body: carrier });
        }
    }
    let pulley_by_id = |id: &str| pulleys.iter().rposition(|p| p.id == id);
    let mut arena = ExprArena::default();
    let mut switch_force = Vec::new();
    let mut ropes = Vec::new();
    let mut rods = Vec::new();
    let mut springs = Vec::new();
    let mut hinges = Vec::new();
    let mut forces: Vec<ForceModel> = Vec::new();
    let mut welds = Vec::new();
    let mut sliders = Vec::new();
    let mut motors = Vec::new();
    let mut gears = Vec::new();
    let mut centrals: Vec<CentralModel> = Vec::new();
    let mut no_collide: Vec<String> = Vec::new();
    let no_collide_add = |a: &crate::scene::Anchor, b: &crate::scene::Anchor, list: &mut Vec<String>| {
        if let (Some(x), Some(y)) = (&a.body, &b.body) {
            let key = pair_key(x, y);
            if !list.contains(&key) {
                list.push(key);
            }
        }
    };
    for c in &scene.connectors {
        match &c.kind {
            ConnectorKind::Rope { a, b, pulleys: list, length } => {
                let list: Vec<(usize, f64)> =
                    list.iter().filter_map(|(pid, wrap)| pulley_by_id(pid).map(|pi| (pi, if *wrap == Wrap::Ccw { 1.0 } else { -1.0 }))).collect();
                let movable = list.iter().any(|(pi, _)| pulleys[*pi].body.is_some());
                ropes.push(RopeModel {
                    id: c.id.clone(),
                    name: c.name.clone(),
                    a: anchor(a),
                    b: anchor(b),
                    pulleys: list,
                    length: length.unwrap_or(f64::NAN),
                    movable,
                });
            }
            ConnectorKind::Rod { a, b, length } => {
                rods.push(RodModel { id: c.id.clone(), name: c.name.clone(), a: anchor(a), b: anchor(b), length: length.unwrap_or(f64::NAN) });
            }
            ConnectorKind::Spring { a, b, stiffness, rest_length, damping, cubic } => springs.push(SpringModel {
                id: c.id.clone(),
                name: c.name.clone(),
                a: anchor(a),
                b: anchor(b),
                stiffness: *stiffness,
                rest_length: rest_length.unwrap_or(f64::NAN),
                damping: *damping,
                cubic: *cubic,
                damper: false,
            }),
            ConnectorKind::Damper { a, b, damping } => springs.push(SpringModel {
                id: c.id.clone(),
                name: c.name.clone(),
                a: anchor(a),
                b: anchor(b),
                stiffness: 0.0,
                rest_length: f64::NAN,
                damping: *damping,
                cubic: 0.0,
                damper: true,
            }),
            ConnectorKind::Weld { a, b } => {
                welds.push(WeldModel { id: c.id.clone(), name: c.name.clone(), a: anchor(a), b: anchor(b), angle0: f64::NAN });
                no_collide_add(a, b, &mut no_collide);
            }
            ConnectorKind::Motor { a, b, torque_mode, speed, torque, max_torque } => {
                let max_torque = match max_torque {
                    Some(t) if *t > 0.0 => *t,
                    _ => f64::INFINITY,
                };
                motors.push(MotorModel {
                    id: c.id.clone(),
                    name: c.name.clone(),
                    a: anchor(a),
                    b: anchor(b),
                    torque_mode: *torque_mode,
                    speed: *speed,
                    torque: *torque,
                    max_torque,
                    limited: !*torque_mode && max_torque.is_finite(),
                });
                no_collide_add(a, b, &mut no_collide);
            }
            ConnectorKind::Slider { a, b, axis, free, limits } => {
                let am = anchor(a);
                let l = (axis.x * axis.x + axis.y * axis.y).sqrt();
                let mut ax = Vec2 { x: axis.x / l, y: axis.y / l };
                // On a static body (or the world) the axis is fixed in the world
                if let Some(g) = am.body.filter(|&g| !bodies[g].dynamic) {
                    let cb = &bodies[g];
                    ax = Vec2 { x: cb.static_c * ax.x - cb.static_s * ax.y, y: cb.static_s * ax.x + cb.static_c * ax.y };
                }
                let lo = limits.and_then(|l| l.0).unwrap_or(f64::NEG_INFINITY);
                let hi = limits.and_then(|l| l.1).unwrap_or(f64::INFINITY);
                sliders.push(SliderModel {
                    id: c.id.clone(),
                    name: c.name.clone(),
                    a: am,
                    b: anchor(b),
                    axis: ax,
                    free: *free,
                    angle0: f64::NAN,
                    limited: lo > f64::NEG_INFINITY || hi < f64::INFINITY,
                    lo,
                    hi,
                    e: limits.map(|l| l.2).unwrap_or(0.0),
                });
                no_collide_add(a, b, &mut no_collide);
            }
            ConnectorKind::Gear { a, b, ratio } => {
                let ga = a.body.as_deref().and_then(|id| find_body(&bodies, id)).filter(|&g| bodies[g].dynamic);
                let gb = b.body.as_deref().and_then(|id| find_body(&bodies, id)).filter(|&g| bodies[g].dynamic);
                gears.push(GearModel { id: c.id.clone(), name: c.name.clone(), a: ga, b: gb, ratio: *ratio, offset0: f64::NAN });
                // Meshing gears overlap at their teeth: the two bodies do not collide
                no_collide_add(a, b, &mut no_collide);
            }
            ConnectorKind::Central { a, k, n, targets } => {
                let mut am = anchor(a);
                let carrier = am.body;
                // A centre on a static body is fixed in the world
                if let Some(g) = carrier.filter(|&g| !bodies[g].dynamic) {
                    let cb = &bodies[g];
                    am.local = Vec2 {
                        x: cb.static_pos.x + cb.static_c * am.local.x - cb.static_s * am.local.y,
                        y: cb.static_pos.y + cb.static_s * am.local.x + cb.static_c * am.local.y,
                    };
                    am.body = None;
                }
                let list: Vec<usize> = match targets {
                    Some(ids) => ids.iter().filter_map(|id| find_body(&bodies, id)).collect(),
                    None => dynamic.clone(),
                };
                let list = list.into_iter().filter(|&g| bodies[g].dynamic && Some(g) != carrier).collect();
                centrals.push(CentralModel { id: c.id.clone(), name: c.name.clone(), a: am, k: *k, n: *n, targets: list });
            }
            ConnectorKind::Hinge { a, b } => {
                hinges.push(HingeModel { id: c.id.clone(), name: c.name.clone(), a: anchor(a), b: anchor(b) });
                no_collide_add(a, b, &mut no_collide);
            }
            ConnectorKind::Force { a, force, expr } => {
                let mut compiled = None;
                if let Some((ex, ey)) = expr {
                    let before = arena.switches.len();
                    let x = arena.compile_force_expr(ex)?;
                    for _ in before..arena.switches.len() {
                        switch_force.push(forces.len());
                    }
                    let before = arena.switches.len();
                    let y = arena.compile_force_expr(ey)?;
                    for _ in before..arena.switches.len() {
                        switch_force.push(forces.len());
                    }
                    compiled = Some((x, y));
                }
                forces.push(ForceModel { id: c.id.clone(), name: c.name.clone(), a: anchor(a), force: *force, expr: compiled });
            }
        }
    }
    let gv = scene.settings.gravity;
    let g = (gv.x * gv.x + gv.y * gv.y).sqrt();
    let mut force_scale = 0.0;
    for &bi in &dynamic {
        force_scale += bodies[bi].mass * js_max(g, 1.0);
    }
    for f in &forces {
        let Some((ex, ey)) = f.expr else {
            force_scale += (f.force.x * f.force.x + f.force.y * f.force.y).sqrt();
            continue;
        };
        let Some(bi) = f.a.body else { continue };
        let body = &bodies[bi];
        if !body.dynamic {
            continue;
        }
        let mut env = [0.0; ENV_SIZE];
        env[1] = body.def_position.x;
        env[2] = body.def_position.y;
        env[3] = body.def_velocity.x;
        env[4] = body.def_velocity.y;
        env[5] = (body.def_velocity.x * body.def_velocity.x + body.def_velocity.y * body.def_velocity.y).sqrt();
        env[6] = body.def_angle;
        env[7] = if body.inv_inertia > 0.0 { body.def_angular_velocity } else { 0.0 };
        env[8] = body.mass;
        env[9] = g;
        let fx = arena.eval(ex, &env, None);
        let fy = arena.eval(ey, &env, None);
        let size = (fx * fx + fy * fy).sqrt();
        if size.is_finite() {
            force_scale += size;
        }
    }
    for s in &springs {
        force_scale += s.stiffness * 0.1;
    }
    // 26.51: motors and gravitation add to the force scale (absent in older scenes, so their tolerances are unchanged)
    for m in &motors {
        if m.torque_mode {
            force_scale += m.torque.abs();
        }
    }
    let g_const = scene.settings.gravitation.unwrap_or(0.0);
    let attractors: Vec<usize> = (0..bodies.len()).filter(|&k| bodies[k].attract > 0.0).collect();
    for i in 0..attractors.len() {
        for j in i + 1..attractors.len() {
            let a = &bodies[attractors[i]];
            let b = &bodies[attractors[j]];
            if !a.dynamic && !b.dynamic {
                continue;
            }
            let dx = b.grav_pos.x - a.grav_pos.x;
            let dy = b.grav_pos.y - a.grav_pos.y;
            let d2 = dx * dx + dy * dy;
            let rr = a.bound + b.bound;
            let d = d2.sqrt();
            if d2 > 0.0 {
                force_scale += if d >= rr { g_const * a.attract * b.attract / d2 } else { g_const * a.attract * b.attract * d / (rr * rr * rr) };
            }
        }
    }
    // 26.52: central fields at the start (absent in older scenes)
    for c in &centrals {
        let (mut px, mut py) = (c.a.local.x, c.a.local.y);
        if let Some(cb) = c.a.body {
            let d = &bodies[cb];
            let cc = cos(d.def_angle);
            let ss = sin(d.def_angle);
            px = d.def_position.x + cc * c.a.local.x - ss * c.a.local.y;
            py = d.def_position.y + ss * c.a.local.x + cc * c.a.local.y;
        }
        for &t in &c.targets {
            let tb = &bodies[t];
            let dx = tb.def_position.x - px;
            let dy = tb.def_position.y - py;
            let r = (dx * dx + dy * dy).sqrt();
            let f = central_force(c.k, c.n, r, tb.bound).abs();
            if f.is_finite() {
                force_scale += f;
            }
        }
    }
    force_scale = js_max(force_scale, 1e-6);
    let mut accel_scale = js_max(g, 1.0);
    if g_const > 0.0 || !centrals.is_empty() {
        for &bg in &dynamic {
            accel_scale = js_max(accel_scale, force_scale * bodies[bg].inv_mass);
        }
    }
    let has_expr = forces.iter().any(|f| f.expr.is_some());
    let has_limits = sliders.iter().any(|s| s.limited);
    let has_slip = motors.iter().any(|m| m.limited);
    let dyn_inv_mass = dynamic.iter().map(|&g| bodies[g].inv_mass).collect();
    let dyn_inv_inertia = dynamic.iter().map(|&g| bodies[g].inv_inertia).collect();
    let running_belt = scene.bodies.iter().any(|b| b.kind == BodyKind::Static && b.belt_speed != 0.0);
    Ok(Model {
        settings: scene.settings.clone(),
        n: dynamic.len(),
        bodies,
        dynamic,
        pulleys,
        ropes,
        rods,
        springs,
        hinges,
        forces,
        welds,
        sliders,
        motors,
        gears,
        has_limits,
        has_slip,
        centrals,
        g_const,
        attractors,
        no_collide,
        arena,
        switch_force,
        has_expr,
        force_scale,
        accel_scale,
        warnings,
        contact_pairs: scene.contact_pairs.clone(),
        running_belt,
        dyn_inv_mass,
        dyn_inv_inertia,
    })
}

#[allow(clippy::too_many_arguments)]
fn body_model(def: &BodyDef, global: usize, index: i32, shape: ShapeModel, mass: f64, inertia: f64, fixed: bool, bound: f64) -> BodyModel {
    let is_dynamic = def.kind != BodyKind::Static;
    BodyModel {
        global,
        index,
        id: def.id.clone(),
        name: def.name.clone(),
        dynamic: is_dynamic,
        shape,
        mass,
        inertia,
        inv_mass: if is_dynamic { 1.0 / mass } else { 0.0 },
        inv_inertia: if is_dynamic && !fixed && inertia > 0.0 { 1.0 / inertia } else { 0.0 },
        material: def.material,
        belt_speed: if def.kind == BodyKind::Static { def.belt_speed } else { 0.0 },
        bound,
        static_pos: def.position,
        static_angle: def.angle,
        static_c: cos(def.angle),
        static_s: sin(def.angle),
        def_position: def.position,
        def_angle: def.angle,
        def_velocity: def.velocity,
        def_angular_velocity: def.angular_velocity,
        drag_lin: match def.drag {
            Some(d) if is_dynamic => js_max(0.0, d.linear),
            _ => 0.0,
        },
        drag_quad: match def.drag {
            Some(d) if is_dynamic => js_max(0.0, d.quadratic),
            _ => 0.0,
        },
        attract: 0.0,
        grav_pos: def.position,
    }
}

/// Effective friction and restitution of a pair: the pair override, else the smaller of the two bodies' values.
/// Rolling resistance (26.52): the override's value, else the larger of the two bodies' values (0: none).
pub fn pair_material(model: &Model, a: &BodyModel, b: &BodyModel) -> Material {
    let rolling = js_max(a.material.rolling, b.material.rolling);
    for p in &model.contact_pairs {
        if (p.a == a.id && p.b == b.id) || (p.a == b.id && p.b == a.id) {
            let r = p.rolling.unwrap_or(rolling);
            return Material { mu_s: p.mu_s, mu_k: p.mu_k, restitution: p.restitution, rolling: if r > 0.0 { r } else { 0.0 } };
        }
    }
    Material {
        mu_s: js_min(a.material.mu_s, b.material.mu_s),
        mu_k: js_min(a.material.mu_k, b.material.mu_k),
        restitution: js_min(a.material.restitution, b.material.restitution),
        rolling: if rolling > 0.0 { rolling } else { 0.0 },
    }
}

/// Size of the central force F(r) = k·rⁿ (26.52, D60), positive towards the centre; linear inside the bounding radius R.
pub fn central_force(k: f64, n: f64, r: f64, rr: f64) -> f64 {
    if r >= rr {
        return k * pow(r, n);
    }
    if rr > 0.0 {
        k * pow(rr, n) * (r / rr)
    } else {
        0.0
    }
}

/// Potential of the central force (J): k·rⁿ⁺¹/(n + 1), k·ln r for n = −1; quadratic inside R.
pub fn central_potential(k: f64, n: f64, r: f64, rr: f64) -> f64 {
    let outer = |x: f64| if n == -1.0 { k * log(x) } else { k * pow(x, n + 1.0) / (n + 1.0) };
    if r >= rr {
        return outer(r);
    }
    // `!(R > 0)` as in the TypeScript source (NaN takes this branch)
    #[allow(clippy::neg_cmp_op_on_partial_ord)]
    if !(rr > 0.0) {
        return 0.0;
    }
    outer(rr) + k * pow(rr, n - 1.0) * (r * r - rr * rr) / 2.0
}
