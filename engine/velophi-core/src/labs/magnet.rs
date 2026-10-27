//! Magnetic fields in the plane (26.55): straight wires perpendicular to the page, coils and solenoids in cross
//! section, bar magnets and a uniform field.
//!
//! With all currents along z the field is described by the vector potential A_z: B = (∂A/∂y, −∂A/∂x). Field lines
//! are exactly the contour lines of A_z, and the flux per metre of depth between two points is A(P₁) − A(P₂), so
//! lines drawn at equal steps of A_z are spaced inversely to B — the picture of the textbook, computed exactly.
//!
//! - Wire of current I (+: out of the page) and radius r₀: A = −(μ₀I/2π)·ln r outside, uniform current inside.
//! - Bar magnet of magnetization M (A/m): the equivalent surface currents K = M on the two faces parallel to M
//!   (current sheets, A from the closed-form integral of ln r along a segment). A solenoid of N turns and current I
//!   is the same pair of sheets made of discrete wires.
//! - Uniform field B₀: A = B₀ₓy − B₀ᵧx.
//! - Force per metre on each wire: F = I·ẑ × B (from the other sources).

use crate::dmath::{atan, cos, log, sin};

/// Vacuum permeability (N/A²), CODATA 2018.
pub const MU0: f64 = 1.25663706212e-6;
const TWO_PI: f64 = 2.0 * std::f64::consts::PI;

#[derive(Clone, Copy, Debug)]
pub struct Wire {
    pub x: f64,
    pub y: f64,
    pub i: f64,
    pub r: f64,
}

/// A current sheet along the segment (x1, y1) – (x2, y2) with surface current K (A/m, +: out of the page).
#[derive(Clone, Copy, Debug)]
pub struct Sheet {
    pub x1: f64,
    pub y1: f64,
    pub x2: f64,
    pub y2: f64,
    pub k: f64,
}

#[derive(Clone, Debug, Default)]
pub struct Sources {
    pub wires: Vec<Wire>,
    pub sheets: Vec<Sheet>,
    pub bx: f64,
    pub by: f64,
}

impl Sources {
    /// A bar magnet (or the sheet pair of an ideal solenoid) centred at (x, y), axis at `angle`, length along the axis,
    /// thickness across it, magnetization M (A/m) from the S end to the N end.
    pub fn add_magnet(&mut self, x: f64, y: f64, angle: f64, length: f64, thickness: f64, m: f64) {
        let (ux, uy) = (cos(angle), sin(angle));
        let (nx, ny) = (-uy, ux);
        let (hl, ht) = (0.5 * length, 0.5 * thickness);
        // face at +n carries K = +M (out of the page), the face at −n carries −M
        for (s, k) in [(1.0, m), (-1.0, -m)] {
            let (cx, cy) = (x + s * ht * nx, y + s * ht * ny);
            self.sheets.push(Sheet { x1: cx - hl * ux, y1: cy - hl * uy, x2: cx + hl * ux, y2: cy + hl * uy, k });
        }
    }

    /// A solenoid of `turns` turns of wire (radius r each) and current I: wires on both faces.
    #[allow(clippy::too_many_arguments)]
    pub fn add_solenoid(&mut self, x: f64, y: f64, angle: f64, length: f64, thickness: f64, turns: usize, i: f64, r: f64) {
        let (ux, uy) = (cos(angle), sin(angle));
        let (nx, ny) = (-uy, ux);
        let n = turns.max(1);
        for t in 0..n {
            let s = if n == 1 { 0.0 } else { -0.5 * length + length * t as f64 / (n - 1) as f64 };
            for (side, sign) in [(1.0, 1.0), (-1.0, -1.0)] {
                self.wires.push(Wire { x: x + s * ux + side * 0.5 * thickness * nx, y: y + s * uy + side * 0.5 * thickness * ny, i: sign * i, r });
            }
        }
    }
}

/// ∫ ln √((s − u)² + v²) ds from s = 0 to L for a point at (u, v) in the frame of the segment.
fn ln_integral(len: f64, u: f64, v: f64) -> f64 {
    let f = |s: f64| {
        let d = s - u;
        let r2 = d * d + v * v;
        let lnr = if r2 > 0.0 { 0.5 * log(r2) } else { 0.0 };
        let at = if v != 0.0 { v * atan(d / v) } else { 0.0 };
        d * lnr - d + at
    };
    f(len) - f(0.0)
}

/// Vector potential A_z (T·m) at (x, y).
pub fn potential(s: &Sources, x: f64, y: f64) -> f64 {
    let c = MU0 / TWO_PI;
    let mut a = s.bx * y - s.by * x;
    for w in &s.wires {
        let r2 = (x - w.x) * (x - w.x) + (y - w.y) * (y - w.y);
        let r0 = w.r.max(1e-12);
        a += if r2 >= r0 * r0 {
            -c * w.i * 0.5 * log(r2)
        } else {
            // uniform current density: A = −(μ₀I/2π)(ln r₀ + (r² − r₀²)/(2r₀²))
            -c * w.i * (log(r0) + 0.5 * (r2 - r0 * r0) / (r0 * r0))
        };
    }
    for sh in &s.sheets {
        let (dx, dy) = (sh.x2 - sh.x1, sh.y2 - sh.y1);
        let len = (dx * dx + dy * dy).sqrt();
        if len == 0.0 {
            continue;
        }
        let (ux, uy) = (dx / len, dy / len);
        let (px, py) = (x - sh.x1, y - sh.y1);
        let u = px * ux + py * uy;
        let v = -px * uy + py * ux;
        a += -c * sh.k * ln_integral(len, u, v);
    }
    a
}

/// Field B (T) at (x, y), from the analytic gradient of A.
pub fn field(s: &Sources, x: f64, y: f64) -> (f64, f64) {
    let c = MU0 / TWO_PI;
    let (mut bx, mut by) = (s.bx, s.by);
    for w in &s.wires {
        let (dx, dy) = (x - w.x, y - w.y);
        let r2 = dx * dx + dy * dy;
        let r0 = w.r.max(1e-12);
        // ∂A/∂x = −cI·dx/r² outside, −cI·dx/r₀² inside
        let f = if r2 >= r0 * r0 { c * w.i / r2 } else { c * w.i / (r0 * r0) };
        bx += -f * dy;
        by += f * dx;
    }
    for sh in &s.sheets {
        let (dx, dy) = (sh.x2 - sh.x1, sh.y2 - sh.y1);
        let len = (dx * dx + dy * dy).sqrt();
        if len == 0.0 {
            continue;
        }
        let (ux, uy) = (dx / len, dy / len);
        let (px, py) = (x - sh.x1, y - sh.y1);
        let u = px * ux + py * uy;
        let v = -px * uy + py * ux;
        // ∂/∂u ∫ln r ds = −[ln r]₀ᴸ, ∂/∂v ∫ln r ds = [atan((s−u)/v)]₀ᴸ
        let lr = |s: f64| 0.5 * log(((s - u) * (s - u) + v * v).max(1e-300));
        let at = |s: f64| atan((s - u) / v);
        let da_du = -c * sh.k * -(lr(len) - lr(0.0));
        let da_dv = -c * sh.k * if v == 0.0 { 0.0 } else { at(len) - at(0.0) };
        // back to x, y: ∂A/∂x = ux·∂u + (−uy)·∂v, ∂A/∂y = uy·∂u + ux·∂v
        let ax = ux * da_du - uy * da_dv;
        let ay = uy * da_du + ux * da_dv;
        bx += ay;
        by += -ax;
    }
    (bx, by)
}

/// Force per metre on wire k from all the other sources: F = I ẑ × B = I·(−B_y, B_x).
pub fn wire_force(s: &Sources, k: usize) -> (f64, f64) {
    let w = s.wires[k];
    let mut others = s.clone();
    others.wires.remove(k);
    let (bx, by) = field(&others, w.x, w.y);
    (-w.i * by, w.i * bx)
}

/// Contour lines of A at `levels` equally spaced values between the 2 % and 98 % quantiles over a grid (cells inside
/// wires excluded): segments x1 y1 x2 y2 per level.
pub fn contours(s: &Sources, x0: f64, y0: f64, x1: f64, y1: f64, grid: usize, levels: usize) -> (Vec<f64>, Vec<f64>, Vec<usize>) {
    let (w, h) = (x1 - x0, y1 - y0);
    let mut lv = Vec::new();
    let mut segs = Vec::new();
    let mut starts = Vec::new();
    if !(w > 0.0 && h > 0.0) || levels == 0 {
        starts.push(0);
        return (lv, segs, starts);
    }
    let cell = w.max(h) / grid.max(8) as f64;
    let nx = (w / cell).ceil() as usize + 1;
    let ny = (h / cell).ceil() as usize + 1;
    let mut a = vec![0.0; nx * ny];
    let mut usable = Vec::new();
    for j in 0..ny {
        for i in 0..nx {
            let (x, y) = (x0 + i as f64 * cell, y0 + j as f64 * cell);
            let v = potential(s, x, y);
            a[j * nx + i] = v;
            let inside = s.wires.iter().any(|wr| (x - wr.x).powi(2) + (y - wr.y).powi(2) < (2.0 * wr.r).powi(2));
            if !inside && v.is_finite() {
                usable.push(v);
            }
        }
    }
    if usable.len() < 2 {
        starts.push(0);
        return (lv, segs, starts);
    }
    usable.sort_by(|p, q| p.partial_cmp(q).unwrap());
    let q = |f: f64| usable[((usable.len() - 1) as f64 * f).round() as usize];
    let (lo, hi) = (q(0.02), q(0.98));
    if !(hi > lo) {
        starts.push(0);
        return (lv, segs, starts);
    }
    for l in 0..levels {
        let level = lo + (hi - lo) * (l as f64 + 0.5) / levels as f64;
        lv.push(level);
        starts.push(segs.len() / 4);
        for j in 0..ny - 1 {
            for i in 0..nx - 1 {
                let c = [a[j * nx + i], a[j * nx + i + 1], a[(j + 1) * nx + i + 1], a[(j + 1) * nx + i]];
                let corners = [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)];
                let mut pts: Vec<(f64, f64)> = Vec::with_capacity(4);
                for e in 0..4 {
                    let (p, r) = (c[e], c[(e + 1) % 4]);
                    if (p < level) != (r < level) {
                        let f = (level - p) / (r - p);
                        let (ia, ja) = corners[e];
                        let (ib, jb) = corners[(e + 1) % 4];
                        pts.push((x0 + cell * (ia as f64 + f * (ib as f64 - ia as f64)), y0 + cell * (ja as f64 + f * (jb as f64 - ja as f64))));
                    }
                }
                if pts.len() == 2 {
                    segs.extend_from_slice(&[pts[0].0, pts[0].1, pts[1].0, pts[1].1]);
                } else if pts.len() == 4 {
                    let centre = 0.25 * (c[0] + c[1] + c[2] + c[3]);
                    if (centre < level) == (c[0] < level) {
                        segs.extend_from_slice(&[pts[0].0, pts[0].1, pts[3].0, pts[3].1, pts[1].0, pts[1].1, pts[2].0, pts[2].1]);
                    } else {
                        segs.extend_from_slice(&[pts[0].0, pts[0].1, pts[1].0, pts[1].1, pts[2].0, pts[2].1, pts[3].0, pts[3].1]);
                    }
                }
            }
        }
    }
    starts.push(segs.len() / 4);
    (lv, segs, starts)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn straight_wire_and_parallel_wires() {
        let mut s = Sources::default();
        s.wires.push(Wire { x: 0.0, y: 0.0, i: 10.0, r: 0.001 });
        // B = μ₀I/(2πr), counter-clockwise for current out of the page
        let (bx, by) = field(&s, 0.05, 0.0);
        assert!(bx.abs() < 1e-18 && (by - MU0 * 10.0 / (TWO_PI * 0.05)).abs() < 1e-15);
        // A gradient agrees with B (finite differences)
        let h = 1e-6;
        let (x, y) = (0.03, -0.02);
        let dax = (potential(&s, x + h, y) - potential(&s, x - h, y)) / (2.0 * h);
        let day = (potential(&s, x, y + h) - potential(&s, x, y - h)) / (2.0 * h);
        let (bx, by) = field(&s, x, y);
        assert!((bx - day).abs() < 1e-9 * bx.abs().max(1e-12) && (by + dax).abs() < 1e-9 * by.abs().max(1e-12));
        // two parallel currents attract: F/ℓ = μ₀I₁I₂/(2πd)
        s.wires.push(Wire { x: 0.1, y: 0.0, i: 5.0, r: 0.001 });
        let (fx, fy) = wire_force(&s, 1);
        assert!((fx + MU0 * 50.0 / (TWO_PI * 0.1)).abs() < 1e-15 && fy.abs() < 1e-20);
    }

    #[test]
    fn long_sheet_pair_is_a_solenoid() {
        // two long sheets 2 cm apart, K = 1000 A/m: B ≈ μ₀K inside, along the axis; flux A(P1) − A(P2)
        let mut s = Sources::default();
        s.add_magnet(0.0, 0.0, 0.0, 10.0, 0.02, 1000.0);
        let (bx, by) = field(&s, 0.0, 0.0);
        assert!((bx - MU0 * 1000.0).abs() < 2e-3 * MU0 * 1000.0 && by.abs() < 1e-12, "{bx} {by}");
        // sheet field from the gradient of the closed-form potential
        let h = 1e-6;
        let (x, y) = (0.3, 0.004);
        let day = (potential(&s, x, y + h) - potential(&s, x, y - h)) / (2.0 * h);
        let dax = (potential(&s, x + h, y) - potential(&s, x - h, y)) / (2.0 * h);
        let (bx, by) = field(&s, x, y);
        assert!((bx - day).abs() < 1e-6 * bx.abs() && (by + dax).abs() < 1e-6 * bx.abs(), "{bx} {day} {by} {dax}");
        // flux per metre across the gap ≈ B·d
        let phi = potential(&s, 0.0, 0.01) - potential(&s, 0.0, -0.01);
        assert!((phi.abs() - MU0 * 1000.0 * 0.02).abs() < 1e-2 * MU0 * 1000.0 * 0.02, "{phi}");
        // contour lines exist and stay inside the region
        let (lv, segs, starts) = contours(&s, -1.0, -0.5, 1.0, 0.5, 120, 12);
        assert_eq!(lv.len(), 12);
        assert_eq!(starts.len(), 13);
        assert!(segs.len() > 100);
    }
}
