//! Field regions, liquids and rail loops (26.55, D90–D92): their generalized forces and the rates of their ledger
//! entries. Scenes without them never call into this module, so their results are unchanged.
//!
//! - Field region: a charged moving body whose centre is inside feels q(E + v × B) of the region; inside/outside is
//!   frozen in the mode (after the switches) and its change is an event located on the signed distance to the
//!   boundary, so the force is smooth within a segment. E may alternate as E·cos(ωt + φ). The work of E is not a
//!   potential energy (the region has edges): it goes to the external work of the ledger.
//! - Liquid: the part of a body below the surface inside the liquid's rectangle — polygons clipped exactly
//!   (Sutherland–Hodgman), circles intersected exactly (Green's theorem over the arcs and the clipped edges) —
//!   gives the buoyancy −ρ·A·t·g at the submerged centroid (t: the bodies' thickness perpendicular to the page) and a
//!   drag scaled by the submerged fraction. The buoyancy is continuous in the state; where its derivative jumps (a
//!   body touching the surface) the error control of the integrator takes care.
//! - Rail loop: emf ε = B·L·v∥, current I = ε/R, Ampère force −B·I·L along the rails: a linear damping B²L²/R of the
//!   motion along the rails, its power the Joule heat.

use crate::dynamics::{Rates, System};
use crate::kinematics::Pose;
use crate::model::{zone_depth, LiquidModel, Model, ShapeModel, ShapePiece};

/// Ledger extras (offsets in the extra block of the state).
pub const X_FIELD: usize = 0;
pub const X_BUOY: usize = 1;
pub const X_JOULE: usize = 2;
pub const X_LIQUID: usize = 3;
pub const EXTRA_LEN: usize = 4;

/// Inside (+1) or outside (−1) of zone pair k at the poses; on the boundary the side the body moves to.
pub fn zone_branch(model: &Model, k: usize, poses: &[Pose]) -> i8 {
    let (zi, g) = model.zone_pairs[k];
    let z = &model.zones[zi];
    let p = &poses[g];
    let d = z.depth(p.x, p.y);
    if d > 0.0 {
        1
    } else if d < 0.0 {
        -1
    } else {
        // moving inwards: inside
        let h = 1e-9;
        if z.depth(p.x + h * p.vx, p.y + h * p.vy) > 0.0 {
            1
        } else {
            -1
        }
    }
}

/// Signed distance (positive inside) of zone pair k.
pub fn zone_value(model: &Model, k: usize, poses: &[Pose]) -> f64 {
    let (zi, g) = model.zone_pairs[k];
    zone_depth(&model.zones[zi].shape, poses[g].x, poses[g].y)
}

/// Electric field of zone zi at absolute time t.
pub fn zone_e(model: &Model, zi: usize, t: f64) -> (f64, f64) {
    let z = &model.zones[zi];
    if z.omega == 0.0 && z.phase == 0.0 {
        (z.e.x, z.e.y)
    } else {
        let c = crate::dmath::cos(z.omega * t + z.phase);
        (z.e.x * c, z.e.y * c)
    }
}

/// Absolute time of state x.
pub fn time_of(sys: &System, x: &[f64]) -> f64 {
    sys.time_slot.map(|s| x[s]).unwrap_or(0.0) + sys.model.settings.start_time
}

/// Forces of the field regions; `inside` gives the frozen branch of each zone pair (None: exact).
pub fn zone_forces(sys: &System, poses: &[Pose], x: &[f64], inside: Option<&[i8]>, mut rates: Option<&mut Rates>, q: &mut [f64]) {
    let model = &sys.model;
    let t = time_of(sys, x);
    for (k, &(zi, g)) in model.zone_pairs.iter().enumerate() {
        let on = match inside {
            Some(s) => s[k] > 0,
            None => zone_branch(model, k, poses) > 0,
        };
        if !on {
            continue;
        }
        let b = &model.bodies[g];
        let p = &poses[g];
        let (ex, ey) = zone_e(model, zi, t);
        let bz = model.zones[zi].b;
        let i = b.index as usize;
        let fx = b.charge * (ex + p.vy * bz);
        let fy = b.charge * (ey - p.vx * bz);
        q[3 * i] += fx;
        q[3 * i + 1] += fy;
        if let Some(r) = rates.as_deref_mut() {
            let w = b.charge * (ex * p.vx + ey * p.vy);
            r.applied_work += w;
            r.extra[X_FIELD] += w;
        }
    }
}

/// Submerged area, its first moments and the total area of a body in a liquid (m², m³).
pub fn submerged(model: &Model, g: usize, p: &Pose, l: &LiquidModel) -> (f64, f64, f64, f64) {
    let b = &model.bodies[g];
    let mut acc = (0.0, 0.0, 0.0, 0.0);
    let mut add = |piece: (f64, f64, f64), total: f64| {
        acc.0 += piece.0;
        acc.1 += piece.1;
        acc.2 += piece.2;
        acc.3 += total;
    };
    let world = |v: &crate::scene::Vec2| (p.x + p.c * v.x - p.s * v.y, p.y + p.s * v.x + p.c * v.y);
    match &b.shape {
        ShapeModel::Circle { radius } => add(circle_rect(p.x, p.y, *radius, l), std::f64::consts::PI * radius * radius),
        ShapeModel::Polygon { verts, .. } => {
            let pts: Vec<(f64, f64)> = verts.iter().map(world).collect();
            add(poly_rect(&pts, l), poly_area(&pts).0)
        }
        ShapeModel::Complex(cs) => {
            for piece in &cs.pieces {
                match piece {
                    ShapePiece::Circle { center, radius } => {
                        let (cx, cy) = world(center);
                        add(circle_rect(cx, cy, *radius, l), std::f64::consts::PI * radius * radius);
                    }
                    ShapePiece::Polygon { verts, .. } => {
                        let pts: Vec<(f64, f64)> = verts.iter().map(world).collect();
                        add(poly_rect(&pts, l), poly_area(&pts).0);
                    }
                }
            }
        }
    }
    acc
}

/// Area and first moments (A, ∫x dA, ∫y dA) of a counter-clockwise polygon (any orientation gives |A|).
fn poly_area(pts: &[(f64, f64)]) -> (f64, f64, f64) {
    let n = pts.len();
    let (mut a, mut mx, mut my) = (0.0, 0.0, 0.0);
    for i in 0..n {
        let (x0, y0) = pts[i];
        let (x1, y1) = pts[(i + 1) % n];
        let cr = x0 * y1 - x1 * y0;
        a += cr;
        mx += (x0 + x1) * cr;
        my += (y0 + y1) * cr;
    }
    let s = if a < 0.0 { -1.0 } else { 1.0 };
    (0.5 * a * s, mx / 6.0 * s, my / 6.0 * s)
}

/// Clip a polygon by the half-plane where `inside(p) ≥ 0` (linear in p) (Sutherland–Hodgman).
fn clip(pts: &[(f64, f64)], f: impl Fn((f64, f64)) -> f64) -> Vec<(f64, f64)> {
    let n = pts.len();
    let mut out = Vec::with_capacity(n + 2);
    for i in 0..n {
        let a = pts[i];
        let b = pts[(i + 1) % n];
        let (fa, fb) = (f(a), f(b));
        if fa >= 0.0 {
            out.push(a);
        }
        if (fa >= 0.0) != (fb >= 0.0) {
            let t = fa / (fa - fb);
            out.push((a.0 + t * (b.0 - a.0), a.1 + t * (b.1 - a.1)));
        }
    }
    out
}

/// A polygon intersected with the liquid rectangle: (A, ∫x dA, ∫y dA).
fn poly_rect(pts: &[(f64, f64)], l: &LiquidModel) -> (f64, f64, f64) {
    let mut p = clip(pts, |q| l.y1 - q.1);
    if p.len() >= 3 {
        p = clip(&p, |q| q.1 - l.y0);
    }
    if p.len() >= 3 {
        p = clip(&p, |q| q.0 - l.x0);
    }
    if p.len() >= 3 {
        p = clip(&p, |q| l.x1 - q.0);
    }
    if p.len() < 3 {
        return (0.0, 0.0, 0.0);
    }
    poly_area(&p)
}

/// A circle intersected with the liquid rectangle, exactly: Green's theorem over the rectangle edges inside the
/// circle and the arcs inside the rectangle. (A, ∫x dA, ∫y dA).
fn circle_rect(cx: f64, cy: f64, r: f64, l: &LiquidModel) -> (f64, f64, f64) {
    let (x0, y0, x1, y1) = (l.x0, l.y0, l.x1, l.y1);
    if r <= 0.0 || cx + r <= x0 || cx - r >= x1 || cy + r <= y0 || cy - r >= y1 {
        return (0.0, 0.0, 0.0);
    }
    if cx - r >= x0 && cx + r <= x1 && cy - r >= y0 && cy + r <= y1 {
        let a = std::f64::consts::PI * r * r;
        return (a, a * cx, a * cy);
    }
    let (mut a, mut mx, mut my) = (0.0, 0.0, 0.0);
    // rectangle edges, counter-clockwise, clipped to the circle
    let edges = [((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))];
    for &((ax, ay), (bx, by)) in &edges {
        let (dx, dy) = (bx - ax, by - ay);
        let (fx, fy) = (ax - cx, ay - cy);
        let qa = dx * dx + dy * dy;
        let qb = 2.0 * (fx * dx + fy * dy);
        let qc = fx * fx + fy * fy - r * r;
        let disc = qb * qb - 4.0 * qa * qc;
        if disc <= 0.0 {
            continue;
        }
        let sq = disc.sqrt();
        let t0 = ((-qb - sq) / (2.0 * qa)).max(0.0);
        let t1 = ((-qb + sq) / (2.0 * qa)).min(1.0);
        if t1 <= t0 {
            continue;
        }
        let (px, py) = (ax + t0 * dx, ay + t0 * dy);
        let (qx, qy) = (ax + t1 * dx, ay + t1 * dy);
        // straight piece: ½∮(x dy − y dx), ½∮x² dy, −½∮y² dx (exact for a segment)
        a += 0.5 * (px * qy - qx * py);
        mx += (qy - py) * (px * px + px * qx + qx * qx) / 6.0;
        my -= (qx - px) * (py * py + py * qy + qy * qy) / 6.0;
    }
    // arcs of the circle inside the rectangle
    let mut th: Vec<f64> = Vec::with_capacity(8);
    for &xv in &[x0, x1] {
        let c = (xv - cx) / r;
        if c.abs() < 1.0 {
            let a0 = crate::dmath::acos(c);
            th.push(a0);
            th.push(2.0 * std::f64::consts::PI - a0);
        }
    }
    for &yv in &[y0, y1] {
        let s = (yv - cy) / r;
        if s.abs() < 1.0 {
            let a0 = crate::dmath::asin(s);
            th.push(if a0 < 0.0 { a0 + 2.0 * std::f64::consts::PI } else { a0 });
            th.push(std::f64::consts::PI - a0);
        }
    }
    th.sort_by(|p, q| p.partial_cmp(q).unwrap());
    let m = th.len();
    let inside = |t: f64| {
        let (x, y) = (cx + r * crate::dmath::cos(t), cy + r * crate::dmath::sin(t));
        x >= x0 && x <= x1 && y >= y0 && y <= y1
    };
    let arc = |t0: f64, t1: f64| -> (f64, f64, f64) {
        let (s0, c0, s1, c1) = (crate::dmath::sin(t0), crate::dmath::cos(t0), crate::dmath::sin(t1), crate::dmath::cos(t1));
        let da = 0.5 * (r * cx * (s1 - s0) - r * cy * (c1 - c0) + r * r * (t1 - t0));
        // ½r∫(cx² cosθ + 2cx r cos²θ + r² cos³θ)dθ
        let ic2 = |t: f64, s: f64, c: f64| 0.5 * t + 0.5 * s * c;
        let ic3 = |s: f64| s - s * s * s / 3.0;
        let dmx = 0.5 * r * (cx * cx * (s1 - s0) + 2.0 * cx * r * (ic2(t1, s1, c1) - ic2(t0, s0, c0)) + r * r * (ic3(s1) - ic3(s0)));
        // ½r∫(cy² sinθ + 2cy r sin²θ + r² sin³θ)dθ
        let is2 = |t: f64, s: f64, c: f64| 0.5 * t - 0.5 * s * c;
        let is3 = |c: f64| -c + c * c * c / 3.0;
        let dmy = 0.5 * r * (cy * cy * (-(c1 - c0)) + 2.0 * cy * r * (is2(t1, s1, c1) - is2(t0, s0, c0)) + r * r * (is3(c1) - is3(c0)));
        (da, dmx, dmy)
    };
    if m == 0 {
        // no crossing: the circle is inside (handled above) or contains the rectangle
        let w = x1 - x0;
        let h = y1 - y0;
        let ar = w * h;
        return (ar, ar * 0.5 * (x0 + x1), ar * 0.5 * (y0 + y1));
    }
    for k in 0..m {
        let t0 = th[k];
        let t1 = if k + 1 < m { th[k + 1] } else { th[0] + 2.0 * std::f64::consts::PI };
        if t1 - t0 <= 0.0 {
            continue;
        }
        if inside(0.5 * (t0 + t1)) {
            let (da, dmx, dmy) = arc(t0, t1);
            a += da;
            mx += dmx;
            my += dmy;
        }
    }
    (a, mx, my)
}

/// Buoyancy and liquid drag on every dynamic body.
pub fn liquid_forces(sys: &System, poses: &[Pose], mut rates: Option<&mut Rates>, q: &mut [f64]) {
    let model = &sys.model;
    let g = model.settings.gravity;
    for l in &model.liquids {
        for &bg in &model.dynamic {
            let p = &poses[bg];
            let b = &model.bodies[bg];
            if p.y - b.bound >= l.y1 || p.y + b.bound <= l.y0 || p.x + b.bound <= l.x0 || p.x - b.bound >= l.x1 {
                continue;
            }
            let (a, mx, my, total) = submerged(model, bg, p, l);
            if !(a > 0.0) {
                continue;
            }
            let (cx, cy) = (mx / a, my / a);
            let (rx, ry) = (cx - p.x, cy - p.y);
            // velocity of the material point at the submerged centroid
            let (vx, vy) = (p.vx - p.w * ry, p.vy + p.w * rx);
            let vol = a * l.depth;
            let (fbx, fby) = (-l.rho * vol * g.x, -l.rho * vol * g.y);
            let f = if total > 0.0 { a / total } else { 0.0 };
            let sp = (vx * vx + vy * vy).sqrt();
            let k = f * (l.drag_lin + l.drag_quad * sp);
            let (fdx, fdy) = (-k * vx, -k * vy);
            // rotation in the liquid: the linear coefficient on the radius of gyration
            let rg2 = if b.inv_mass > 0.0 && b.inv_inertia > 0.0 { b.inv_mass / b.inv_inertia } else { 0.0 };
            let tau = -f * l.drag_lin * rg2 * p.w;
            let i = b.index as usize;
            q[3 * i] += fbx + fdx;
            q[3 * i + 1] += fby + fdy;
            q[3 * i + 2] += rx * (fby + fdy) - ry * (fbx + fdx) + tau;
            if let Some(r) = rates.as_deref_mut() {
                let wb = fbx * vx + fby * vy;
                r.applied_work += wb;
                r.extra[X_BUOY] += wb;
                let loss = k * sp * sp - tau * p.w;
                r.damping += loss;
                r.extra[X_LIQUID] += loss;
            }
        }
    }
}

/// Ampère force of the rail loops.
pub fn rail_forces(sys: &System, poses: &[Pose], mut rates: Option<&mut Rates>, q: &mut [f64]) {
    let model = &sys.model;
    for rl in &model.rails {
        let p = &poses[rl.body];
        let b = &model.bodies[rl.body];
        let v = p.vx * rl.ux + p.vy * rl.uy;
        let k = rl.k();
        let i = b.index as usize;
        q[3 * i] -= k * v * rl.ux;
        q[3 * i + 1] -= k * v * rl.uy;
        if let Some(r) = rates.as_deref_mut() {
            let heat = k * v * v;
            r.damping += heat;
            r.extra[X_JOULE] += heat;
        }
    }
}

/// emf (V), current (A) and Ampère force along the rails (N) of rail loop k at the poses.
pub fn rail_values(model: &Model, k: usize, poses: &[Pose]) -> (f64, f64, f64) {
    let rl = &model.rails[k];
    let p = &poses[rl.body];
    let v = p.vx * rl.ux + p.vy * rl.uy;
    let emf = rl.b * rl.l * v;
    let i = if rl.r > 0.0 { emf / rl.r } else { 0.0 };
    (emf, i, -rl.b * i * rl.l)
}

/// Buoyancy (N, along −g) and submerged area (m²) of body g in all liquids.
pub fn buoyancy_of(model: &Model, g: usize, poses: &[Pose]) -> (f64, f64) {
    let gm = (model.settings.gravity.x * model.settings.gravity.x + model.settings.gravity.y * model.settings.gravity.y).sqrt();
    let (mut f, mut area) = (0.0, 0.0);
    for l in &model.liquids {
        let (a, _, _, _) = submerged(model, g, &poses[g], l);
        f += l.rho * a * l.depth * gm;
        area += a;
    }
    (f, area)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn liquid(x0: f64, y0: f64, x1: f64, y1: f64) -> LiquidModel {
        LiquidModel { id: "w".into(), name: "w".into(), x0, y0, x1, y1, rho: 1000.0, depth: 0.1, drag_lin: 0.0, drag_quad: 0.0 }
    }

    #[test]
    fn circle_segment_and_corner() {
        // half a circle below the surface
        let l = liquid(-10.0, -10.0, 10.0, 0.0);
        let (a, _, my) = circle_rect(0.0, 0.0, 1.0, &l);
        assert!((a - std::f64::consts::PI / 2.0).abs() < 1e-14);
        assert!((my / a + 4.0 / (3.0 * std::f64::consts::PI)).abs() < 1e-14, "centroid of a half disc");
        // a circular segment of height h: area r²acos(1 − h/r) − (r − h)√(2rh − h²)
        let h = 0.3;
        let (a, _, _) = circle_rect(0.0, 1.0 - h, 1.0, &l);
        let exact = crate::dmath::acos(1.0 - h) - (1.0 - h) * (2.0 * h - h * h).sqrt();
        assert!((a - exact).abs() < 1e-14, "{a} vs {exact}");
        // quarter disc in a corner
        let l2 = liquid(0.0, 0.0, 5.0, 5.0);
        let (a, mx, my) = circle_rect(0.0, 0.0, 1.0, &l2);
        assert!((a - std::f64::consts::PI / 4.0).abs() < 1e-14);
        assert!((mx / a - 4.0 / (3.0 * std::f64::consts::PI)).abs() < 1e-14 && (my / a - 4.0 / (3.0 * std::f64::consts::PI)).abs() < 1e-14);
    }

    #[test]
    fn polygon_clip() {
        // a unit square from y = −0.4 to 0.6 in water up to y = 0: area 0.4, centroid y = −0.2
        let l = liquid(-10.0, -10.0, 10.0, 0.0);
        let pts = [(-0.5, -0.4), (0.5, -0.4), (0.5, 0.6), (-0.5, 0.6)];
        let (a, mx, my) = poly_rect(&pts, &l);
        assert!((a - 0.4).abs() < 1e-15 && mx.abs() < 1e-15 && (my / a + 0.2).abs() < 1e-15);
    }
}
