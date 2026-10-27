//! Electric field lines and equipotential lines (26.54, D79) of point charges plus a uniform field. Used by the
//! canvas of the workbench (charges of the current frame) and by the field experiment of the lab.
//!
//! - A charge of radius r is a uniformly charged ball: outside k·q/d, inside the softened potential of
//!   `model::coulomb_potential` (so the field is finite everywhere and matches the forces of the runtime).
//! - Field lines start on the positive charges (as many as |q| shares of `per_charge`, evenly around the charge)
//!   and are integrated along E/|E| with a step that shrinks near charges; they end on a negative charge, at the
//!   border of the region, where the field vanishes, or at a length limit. Negative charges that received fewer
//!   lines than their share get the missing ones traced backwards from them. With only negative charges, all lines
//!   are traced backwards.
//! - Equipotential lines: potential on a grid, marching squares at levels between the 5 % and 95 % quantiles of
//!   the grid values (charge interiors excluded).

/// A point charge: centre, charge (C) and radius (m) of the softening ball.
#[derive(Clone, Copy, Debug)]
pub struct Charge {
    pub x: f64,
    pub y: f64,
    pub q: f64,
    pub r: f64,
}

/// The sources of a field.
#[derive(Clone, Debug, Default)]
pub struct FieldSources {
    pub charges: Vec<Charge>,
    /// Uniform field (V/m).
    pub ex: f64,
    pub ey: f64,
    /// Coulomb constant k (N·m²/C²).
    pub k: f64,
}

/// Field E (V/m) at a point.
pub fn field_at(s: &FieldSources, x: f64, y: f64) -> (f64, f64) {
    let (mut fx, mut fy) = (s.ex, s.ey);
    for c in &s.charges {
        let (dx, dy) = (x - c.x, y - c.y);
        let d = (dx * dx + dy * dy).sqrt();
        if d == 0.0 {
            continue;
        }
        // magnitude k q / d² outside, k q d / r³ inside (uniform ball)
        let m = if d >= c.r || c.r <= 0.0 { s.k * c.q / (d * d * d) } else { s.k * c.q / (c.r * c.r * c.r) };
        fx += m * dx;
        fy += m * dy;
    }
    (fx, fy)
}

/// Potential V (V) at a point, zero at the origin for the uniform field and at infinity for the charges.
pub fn potential_at(s: &FieldSources, x: f64, y: f64) -> f64 {
    let mut v = -(s.ex * x + s.ey * y);
    for c in &s.charges {
        let d = ((x - c.x).powi(2) + (y - c.y).powi(2)).sqrt();
        v += if d >= c.r || c.r <= 0.0 { s.k * c.q / d } else { s.k * c.q * (3.0 * c.r * c.r - d * d) / (2.0 * c.r * c.r * c.r) };
    }
    v
}

/// Region and resolution of a field map.
#[derive(Clone, Copy, Debug)]
pub struct MapOptions {
    pub x0: f64,
    pub y0: f64,
    pub x1: f64,
    pub y1: f64,
    /// Lines of the largest charge.
    pub per_charge: usize,
    /// Grid cells along the longer side for the equipotentials.
    pub grid: usize,
    /// Number of equipotential levels.
    pub levels: usize,
}

/// Field lines (polylines) and equipotentials (segments per level).
#[derive(Clone, Debug, Default)]
pub struct FieldMap {
    /// Points of all lines, x y interleaved; line i is points starts[i] .. starts[i + 1].
    pub line_xy: Vec<f64>,
    pub line_starts: Vec<usize>,
    /// Index of the charge a line starts from (or ends at, when traced backwards).
    pub line_charge: Vec<usize>,
    pub levels: Vec<f64>,
    /// Segments x1 y1 x2 y2 of all levels; level i is segments seg_starts[i] .. seg_starts[i + 1].
    pub seg_xyxy: Vec<f64>,
    pub seg_starts: Vec<usize>,
}

/// Compute the field lines and equipotentials of the sources in the region.
pub fn field_map(s: &FieldSources, o: &MapOptions) -> FieldMap {
    let mut m = FieldMap::default();
    lines(s, o, &mut m);
    equipotentials(s, o, &mut m);
    m
}

fn inside_charge(s: &FieldSources, x: f64, y: f64, sign: f64) -> Option<usize> {
    s.charges.iter().position(|c| c.q * sign > 0.0 && (x - c.x).powi(2) + (y - c.y).powi(2) <= (c.r * 1.0001).powi(2))
}

/// Trace one line from (x, y) along `dir`·E/|E| (dir = ±1). Returns the points and the charge it ended in.
fn trace(s: &FieldSources, o: &MapOptions, x: f64, y: f64, dir: f64, skip: usize) -> (Vec<f64>, Option<usize>) {
    let w = o.x1 - o.x0;
    let h = o.y1 - o.y0;
    let size = w.max(h);
    let (mx, my) = (0.1 * w, 0.1 * h);
    let h_max = size / 150.0;
    let h_min = size / 20000.0;
    let limit = 4.0 * (w * w + h * h).sqrt();
    let unit = |x: f64, y: f64| -> Option<(f64, f64)> {
        let (fx, fy) = field_at(s, x, y);
        let n = (fx * fx + fy * fy).sqrt();
        if !(n > 0.0) || !n.is_finite() {
            None
        } else {
            Some((dir * fx / n, dir * fy / n))
        }
    };
    let mut pts = vec![x, y];
    let (mut px, mut py) = (x, y);
    let mut len = 0.0;
    let mut steps = 0;
    while len < limit && steps < 6000 {
        steps += 1;
        // step from the distance to the nearest charge (finer near charges)
        let near = s.charges.iter().map(|c| ((px - c.x).powi(2) + (py - c.y).powi(2)).sqrt() - c.r).fold(f64::INFINITY, f64::min);
        let step = (0.2 * near.max(0.0) + h_min).clamp(h_min, h_max);
        // classical RK4 on the unit direction field
        let Some(k1) = unit(px, py) else { break };
        let Some(k2) = unit(px + 0.5 * step * k1.0, py + 0.5 * step * k1.1) else { break };
        let Some(k3) = unit(px + 0.5 * step * k2.0, py + 0.5 * step * k2.1) else { break };
        let Some(k4) = unit(px + step * k3.0, py + step * k3.1) else { break };
        let nx = px + step / 6.0 * (k1.0 + 2.0 * k2.0 + 2.0 * k3.0 + k4.0);
        let ny = py + step / 6.0 * (k1.1 + 2.0 * k2.1 + 2.0 * k3.1 + k4.1);
        // a stagnation point (field direction reverses within one step): stop
        if (nx - px) * k1.0 + (ny - py) * k1.1 <= 0.0 {
            break;
        }
        len += ((nx - px).powi(2) + (ny - py).powi(2)).sqrt();
        px = nx;
        py = ny;
        pts.push(px);
        pts.push(py);
        // into a charge of the opposite sense (a sink when tracing forwards)
        if let Some(c) = inside_charge(s, px, py, -dir) {
            if c != skip {
                let ch = s.charges[c];
                // end on the surface of the ball
                let d = ((px - ch.x).powi(2) + (py - ch.y).powi(2)).sqrt();
                if d > 0.0 {
                    let l = pts.len();
                    pts[l - 2] = ch.x + (px - ch.x) * ch.r / d;
                    pts[l - 1] = ch.y + (py - ch.y) * ch.r / d;
                }
                return (pts, Some(c));
            }
        }
        if px < o.x0 - mx || px > o.x1 + mx || py < o.y0 - my || py > o.y1 + my {
            break;
        }
    }
    (pts, None)
}

fn push_line(m: &mut FieldMap, pts: &[f64], charge: usize) {
    if pts.len() < 4 {
        return;
    }
    m.line_starts.push(m.line_xy.len() / 2);
    m.line_xy.extend_from_slice(pts);
    m.line_charge.push(charge);
}

fn lines(s: &FieldSources, o: &MapOptions, m: &mut FieldMap) {
    let qmax = s.charges.iter().map(|c| c.q.abs()).fold(0.0, f64::max);
    if !(qmax > 0.0) || s.k <= 0.0 {
        m.line_starts.push(0);
        return;
    }
    let share = |c: &Charge| ((o.per_charge as f64) * c.q.abs() / qmax).round().max(2.0) as usize;
    let any_positive = s.charges.iter().any(|c| c.q > 0.0);
    // forwards from the positive charges (backwards from the negative ones when there is no positive charge)
    let sources: f64 = if any_positive { 1.0 } else { -1.0 };
    let mut arrived: Vec<Vec<f64>> = vec![Vec::new(); s.charges.len()];
    for (ci, c) in s.charges.iter().enumerate() {
        if c.q * sources <= 0.0 {
            continue;
        }
        let nl = share(c);
        for j in 0..nl {
            let a = 2.0 * std::f64::consts::PI * (j as f64 + 0.5) / nl as f64;
            let (sx, sy) = (c.x + c.r * 1.001 * a.cos(), c.y + c.r * 1.001 * a.sin());
            let (pts, end) = trace(s, o, sx, sy, sources, ci);
            if let Some(e) = end {
                let l = pts.len();
                arrived[e].push((pts[l - 1] - s.charges[e].y).atan2(pts[l - 2] - s.charges[e].x));
            }
            let mut pts = pts;
            // seed on the surface
            pts[0] = c.x + c.r * a.cos();
            pts[1] = c.y + c.r * a.sin();
            if sources < 0.0 {
                reverse_points(&mut pts);
            }
            push_line(m, &pts, ci);
        }
    }
    // sinks that got fewer lines than their share: trace the missing ones from them, away from the arrivals
    for (ci, c) in s.charges.iter().enumerate() {
        if c.q * sources >= 0.0 {
            continue;
        }
        let nl = share(c);
        let have = arrived[ci].len();
        if have >= nl {
            continue;
        }
        let spacing = 2.0 * std::f64::consts::PI / nl as f64;
        let mut added = 0;
        for j in 0..nl {
            if have + added >= nl {
                break;
            }
            let a = spacing * (j as f64 + 0.5);
            let close = arrived[ci].iter().any(|&b| {
                let d = (a - b).rem_euclid(2.0 * std::f64::consts::PI);
                d.min(2.0 * std::f64::consts::PI - d) < 0.5 * spacing
            });
            if close {
                continue;
            }
            let (sx, sy) = (c.x + c.r * 1.001 * a.cos(), c.y + c.r * 1.001 * a.sin());
            let (mut pts, _) = trace(s, o, sx, sy, -sources, ci);
            pts[0] = c.x + c.r * a.cos();
            pts[1] = c.y + c.r * a.sin();
            if sources > 0.0 {
                reverse_points(&mut pts);
            }
            push_line(m, &pts, ci);
            added += 1;
        }
    }
    m.line_starts.push(m.line_xy.len() / 2);
}

fn reverse_points(p: &mut [f64]) {
    let n = p.len() / 2;
    for i in 0..n / 2 {
        let j = n - 1 - i;
        p.swap(2 * i, 2 * j);
        p.swap(2 * i + 1, 2 * j + 1);
    }
}

fn equipotentials(s: &FieldSources, o: &MapOptions, m: &mut FieldMap) {
    let (w, h) = (o.x1 - o.x0, o.y1 - o.y0);
    if !(w > 0.0 && h > 0.0) || o.levels == 0 || (s.charges.is_empty() && s.ex == 0.0 && s.ey == 0.0) {
        m.seg_starts.push(0);
        return;
    }
    let cell = w.max(h) / o.grid.max(8) as f64;
    let nx = (w / cell).ceil() as usize + 1;
    let ny = (h / cell).ceil() as usize + 1;
    let mut v = vec![0.0; nx * ny];
    let mut usable = Vec::new();
    for j in 0..ny {
        for i in 0..nx {
            let (x, y) = (o.x0 + i as f64 * cell, o.y0 + j as f64 * cell);
            let p = potential_at(s, x, y);
            v[j * nx + i] = p;
            let inside = s.charges.iter().any(|c| (x - c.x).powi(2) + (y - c.y).powi(2) < (1.5 * c.r).powi(2));
            if !inside && p.is_finite() {
                usable.push(p);
            }
        }
    }
    if usable.len() < 2 {
        m.seg_starts.push(0);
        return;
    }
    usable.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let q = |f: f64| usable[((usable.len() - 1) as f64 * f).round() as usize];
    let (lo, hi) = (q(0.05), q(0.95));
    if !(hi > lo) {
        m.seg_starts.push(0);
        return;
    }
    let k = o.levels;
    for l in 0..k {
        let level = lo + (hi - lo) * (l as f64 + 0.5) / k as f64;
        m.levels.push(level);
        m.seg_starts.push(m.seg_xyxy.len() / 4);
        for j in 0..ny - 1 {
            for i in 0..nx - 1 {
                let c = [v[j * nx + i], v[j * nx + i + 1], v[(j + 1) * nx + i + 1], v[(j + 1) * nx + i]];
                let corners = [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)];
                // crossings on the four edges
                let mut pts: Vec<(f64, f64)> = Vec::with_capacity(4);
                for e in 0..4 {
                    let (a, b) = (c[e], c[(e + 1) % 4]);
                    if (a < level) != (b < level) {
                        let f = (level - a) / (b - a);
                        let (ia, ja) = corners[e];
                        let (ib, jb) = corners[(e + 1) % 4];
                        let x = o.x0 + cell * (ia as f64 + f * (ib as f64 - ia as f64));
                        let y = o.y0 + cell * (ja as f64 + f * (jb as f64 - ja as f64));
                        pts.push((x, y));
                    }
                }
                if pts.len() == 2 {
                    m.seg_xyxy.extend_from_slice(&[pts[0].0, pts[0].1, pts[1].0, pts[1].1]);
                } else if pts.len() == 4 {
                    // saddle: decide by the centre value
                    let centre = 0.25 * (c[0] + c[1] + c[2] + c[3]);
                    if (centre < level) == (c[0] < level) {
                        m.seg_xyxy.extend_from_slice(&[pts[0].0, pts[0].1, pts[3].0, pts[3].1, pts[1].0, pts[1].1, pts[2].0, pts[2].1]);
                    } else {
                        m.seg_xyxy.extend_from_slice(&[pts[0].0, pts[0].1, pts[1].0, pts[1].1, pts[2].0, pts[2].1, pts[3].0, pts[3].1]);
                    }
                }
            }
        }
    }
    m.seg_starts.push(m.seg_xyxy.len() / 4);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts() -> MapOptions {
        MapOptions { x0: -2.0, y0: -1.5, x1: 2.0, y1: 1.5, per_charge: 12, grid: 120, levels: 10 }
    }

    #[test]
    fn single_charge_field_is_coulomb() {
        let s = FieldSources { charges: vec![Charge { x: 0.0, y: 0.0, q: 2.0, r: 0.1 }], ex: 0.0, ey: 0.0, k: 9.0 };
        let (fx, fy) = field_at(&s, 3.0, 4.0);
        assert!((fx - 9.0 * 2.0 / 25.0 * 0.6).abs() < 1e-12 && (fy - 9.0 * 2.0 / 25.0 * 0.8).abs() < 1e-12);
        assert!((potential_at(&s, 3.0, 4.0) - 9.0 * 2.0 / 5.0).abs() < 1e-12);
        // inside: continuous at the surface
        let (a, _) = field_at(&s, 0.1, 0.0);
        let (b, _) = field_at(&s, 0.1 - 1e-12, 0.0);
        assert!((a - b).abs() / a < 1e-9);
        assert!((potential_at(&s, 0.1, 0.0) - potential_at(&s, 0.1 - 1e-12, 0.0)).abs() < 1e-6);
    }

    #[test]
    fn dipole_lines_go_from_plus_to_minus() {
        let s = FieldSources { charges: vec![Charge { x: -0.6, y: 0.0, q: 1.0, r: 0.08 }, Charge { x: 0.6, y: 0.0, q: -1.0, r: 0.08 }], ex: 0.0, ey: 0.0, k: 8.99e9 };
        let m = field_map(&s, &opts());
        assert_eq!(m.line_charge.len(), m.line_starts.len() - 1);
        // most lines from + end at −; lines are tangent to E everywhere
        let mut ended = 0;
        for i in 0..m.line_charge.len() {
            let (a, b) = (m.line_starts[i], m.line_starts[i + 1]);
            let (ex, ey) = (m.line_xy[2 * (b - 1)], m.line_xy[2 * (b - 1) + 1]);
            if ((ex - 0.6).powi(2) + ey * ey).sqrt() < 0.081 {
                ended += 1;
            }
            for k in a + 1..b - 1 {
                let (x0, y0, x1, y1) = (m.line_xy[2 * k], m.line_xy[2 * k + 1], m.line_xy[2 * k + 2], m.line_xy[2 * k + 3]);
                let (fx, fy) = field_at(&s, 0.5 * (x0 + x1), 0.5 * (y0 + y1));
                let (dx, dy) = (x1 - x0, y1 - y0);
                let cos = (fx * dx + fy * dy) / ((fx * fx + fy * fy).sqrt() * (dx * dx + dy * dy).sqrt());
                assert!(cos > 0.999, "line {i} step {k}: cos = {cos}");
            }
        }
        assert!(ended >= 8, "{ended} lines end on the negative charge");
        // equipotentials: every segment end has the level's potential (to the interpolation error of the grid)
        let spread = m.levels[m.levels.len() - 1] - m.levels[0];
        for l in 0..m.levels.len() {
            assert!(m.seg_starts[l + 1] > m.seg_starts[l], "level {l} has segments");
            for sgi in m.seg_starts[l]..m.seg_starts[l + 1] {
                let p = &m.seg_xyxy[4 * sgi..4 * sgi + 4];
                let v = potential_at(&s, p[0], p[1]);
                assert!((v - m.levels[l]).abs() <= 0.05 * spread, "{v} vs {}", m.levels[l]);
            }
        }
        // the symmetry plane x = 0 is an equipotential of V = 0: a level near 0 exists
        assert!(m.levels.iter().any(|l| l.abs() < 0.2 * m.levels.iter().fold(0.0f64, |a, b| a.max(b.abs()))));
    }

    #[test]
    fn uniform_field_equipotentials_are_straight() {
        let s = FieldSources { charges: vec![], ex: 0.0, ey: 100.0, k: 8.99e9 };
        let m = field_map(&s, &opts());
        assert_eq!(m.line_charge.len(), 0);
        for l in 0..m.levels.len() {
            for sgi in m.seg_starts[l]..m.seg_starts[l + 1] {
                let p = &m.seg_xyxy[4 * sgi..4 * sgi + 4];
                assert!((p[1] - p[3]).abs() < 1e-9 && (p[1] + m.levels[l] / 100.0).abs() < 1e-9);
            }
        }
    }

    #[test]
    fn negative_only_lines_are_traced_backwards() {
        let s = FieldSources { charges: vec![Charge { x: 0.0, y: 0.0, q: -1.0, r: 0.1 }], ex: 0.0, ey: 0.0, k: 1.0 };
        let m = field_map(&s, &opts());
        assert_eq!(m.line_charge.len(), 12);
        // each line points towards the charge: its last point is on the surface
        for i in 0..12 {
            let b = m.line_starts[i + 1];
            let (x, y) = (m.line_xy[2 * (b - 1)], m.line_xy[2 * (b - 1) + 1]);
            assert!(((x * x + y * y).sqrt() - 0.1).abs() < 1e-9);
        }
    }
}
