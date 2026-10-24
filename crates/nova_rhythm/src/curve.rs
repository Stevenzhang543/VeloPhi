//! Eased event curves (a judgement line's position, rotation and opacity) and the scroll curve: the
//! integral of a line's speed over time ("floor position"), which places every note on its line however
//! the speed changes, also backwards.

use crate::ease::Easing;

#[derive(Clone, Debug, PartialEq)]
pub struct CurveEvent {
    pub start: f64,
    pub end: f64,
    pub from: f64,
    pub to: f64,
    pub ease: Easing,
}

impl CurveEvent {
    fn value(&self, time: f64) -> f64 {
        if self.end <= self.start {
            return if time >= self.end { self.to } else { self.from };
        }
        let progress = ((time - self.start) / (self.end - self.start)).clamp(0.0, 1.0);
        self.from + (self.to - self.from) * self.ease.apply(progress)
    }
}

/// A value over time: `base` without events; before the first event its start value; between events
/// the previous event's end value.
#[derive(Clone, Debug, PartialEq)]
pub struct Curve {
    pub base: f64,
    events: Vec<CurveEvent>,
}

impl Curve {
    pub fn new(base: f64, mut events: Vec<CurveEvent>) -> Curve {
        events.retain(|e| {
            e.start.is_finite() && e.end.is_finite() && e.from.is_finite() && e.to.is_finite()
        });
        events.sort_by(|a, b| a.start.total_cmp(&b.start).then(a.end.total_cmp(&b.end)));
        Curve {
            base: if base.is_finite() { base } else { 0.0 },
            events,
        }
    }

    pub fn constant(value: f64) -> Curve {
        Curve::new(value, Vec::new())
    }

    pub fn events(&self) -> &[CurveEvent] {
        &self.events
    }

    /// Index of the last event starting at or before `time`, if any.
    fn index_at(&self, time: f64) -> Option<usize> {
        match self.events.binary_search_by(|e| e.start.total_cmp(&time)) {
            Ok(mut i) => {
                while i + 1 < self.events.len() && self.events[i + 1].start <= time {
                    i += 1;
                }
                Some(i)
            }
            Err(0) => None,
            Err(i) => Some(i - 1),
        }
    }

    /// True once `time` reaches the first event's start (false without events).
    pub fn started(&self, time: f64) -> bool {
        self.events
            .first()
            .map(|e| time >= e.start)
            .unwrap_or(false)
    }

    pub fn value(&self, time: f64) -> f64 {
        if self.events.is_empty() {
            return self.base;
        }
        match self.index_at(time) {
            None => self.events[0].from,
            Some(i) => self.events[i].value(time),
        }
    }
}

/// Samples per event for integrating an eased speed change (exact for linear and constant segments).
const INTEGRAL_SAMPLES: usize = 32;

#[derive(Clone, Debug, PartialEq)]
struct SpeedPiece {
    start: f64,
    end: f64,
    from: f64,
    to: f64,
    ease: Easing,
    /// Floor position at `start`.
    floor: f64,
    /// Cumulative integral of the eased progress at INTEGRAL_SAMPLES + 1 points (for eased curves).
    table: Vec<f64>,
}

/// Speed over time (units of the line's scroll per second, 1 = normal) and its integral.
#[derive(Clone, Debug, PartialEq)]
pub struct SpeedCurve {
    base: f64,
    pieces: Vec<SpeedPiece>,
    /// Floor position at the first piece's start (time before it runs at the first `from` speed).
    origin: f64,
}

impl SpeedCurve {
    pub fn new(base: f64, events: Vec<CurveEvent>) -> SpeedCurve {
        let curve = Curve::new(base, events);
        let base = curve.base;
        let events = curve.events;
        let mut pieces: Vec<SpeedPiece> = Vec::with_capacity(events.len() * 2);
        // Pieces cover [event.start, event.end] with the eased change, and gaps with the previous end value.
        // The floor position is defined as 0 at time 0.
        if events.is_empty() {
            return SpeedCurve {
                base,
                pieces,
                origin: 0.0,
            };
        }
        let mut cursor_time = events[0].start;
        let mut floor = 0.0;
        for (index, event) in events.iter().enumerate() {
            let start = event.start.max(cursor_time);
            if start > cursor_time && index > 0 {
                // Gap: constant at the previous event's end value.
                let speed = events[index - 1].to;
                pieces.push(SpeedPiece {
                    start: cursor_time,
                    end: start,
                    from: speed,
                    to: speed,
                    ease: Easing::Linear,
                    floor,
                    table: Vec::new(),
                });
                floor += speed * (start - cursor_time);
            }
            let end = event.end.max(start);
            let table = if matches!(event.ease, Easing::Linear) || end <= start {
                Vec::new()
            } else {
                // Trapezoid integral of ease(t) over [0, 1] in INTEGRAL_SAMPLES steps.
                let mut table = Vec::with_capacity(INTEGRAL_SAMPLES + 1);
                let mut sum = 0.0;
                table.push(0.0);
                let step = 1.0 / INTEGRAL_SAMPLES as f64;
                let mut previous = event.ease.apply(0.0);
                for k in 1..=INTEGRAL_SAMPLES {
                    let current = event.ease.apply(k as f64 * step);
                    sum += (previous + current) * 0.5 * step;
                    table.push(sum);
                    previous = current;
                }
                table
            };
            let piece = SpeedPiece {
                start,
                end,
                from: event.from,
                to: event.to,
                ease: event.ease,
                floor,
                table,
            };
            floor += piece.integral_to(end);
            pieces.push(piece);
            cursor_time = end;
        }
        let mut curve = SpeedCurve {
            base,
            pieces,
            origin: 0.0,
        };
        // Re-anchor so that floor(0) == 0.
        curve.origin = -curve.raw_floor(0.0);
        curve
    }

    pub fn speed(&self, time: f64) -> f64 {
        if self.pieces.is_empty() {
            return self.base;
        }
        let first = &self.pieces[0];
        if time < first.start {
            return first.from;
        }
        let index = self.piece_index(time);
        let piece = &self.pieces[index];
        if time >= piece.end {
            return piece.to;
        }
        let progress = if piece.end > piece.start {
            (time - piece.start) / (piece.end - piece.start)
        } else {
            1.0
        };
        piece.from + (piece.to - piece.from) * piece.ease.apply(progress)
    }

    fn piece_index(&self, time: f64) -> usize {
        match self.pieces.binary_search_by(|p| p.start.total_cmp(&time)) {
            Ok(i) => i,
            Err(0) => 0,
            Err(i) => i - 1,
        }
    }

    fn raw_floor(&self, time: f64) -> f64 {
        if self.pieces.is_empty() {
            return self.base * time;
        }
        let first = &self.pieces[0];
        if time < first.start {
            return first.floor - first.from * (first.start - time);
        }
        let piece = &self.pieces[self.piece_index(time)];
        if time >= piece.end {
            return piece.floor + piece.integral_to(piece.end) + piece.to * (time - piece.end);
        }
        piece.floor + piece.integral_to(time)
    }

    /// Scroll distance travelled from time 0 to `time` (negative before 0 or with negative speeds).
    pub fn floor(&self, time: f64) -> f64 {
        if !time.is_finite() {
            return 0.0;
        }
        self.raw_floor(time) + self.origin
    }
}

impl SpeedPiece {
    /// Integral of the speed from `start` to `time` (time within [start, end]).
    fn integral_to(&self, time: f64) -> f64 {
        let span = self.end - self.start;
        let elapsed = (time - self.start).clamp(0.0, span.max(0.0));
        if span <= 0.0 {
            return 0.0;
        }
        let delta = self.to - self.from;
        if self.table.is_empty() {
            // Linear: from * e + delta * e^2 / (2 span).
            return self.from * elapsed + delta * elapsed * elapsed / (2.0 * span);
        }
        let u = elapsed / span;
        let scaled = u * INTEGRAL_SAMPLES as f64;
        let k = (scaled.floor() as usize).min(INTEGRAL_SAMPLES - 1);
        let frac = scaled - k as f64;
        let eased_integral = self.table[k] + (self.table[k + 1] - self.table[k]) * frac;
        self.from * elapsed + delta * eased_integral * span
    }
}
