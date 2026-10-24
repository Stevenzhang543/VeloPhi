//! Robert Penner's easing equations (t from 0 to 1), the same 31 curves as the runtime's tweens
//! (`src/runtime/tweens.ts`), so a chart event and a tween with the same name move identically.

use std::f64::consts::PI;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Easing {
    Linear,
    In(Shape),
    Out(Shape),
    InOut(Shape),
    /// Holds the start value until the end of the event, then jumps.
    Step,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Shape {
    Quad,
    Cubic,
    Quart,
    Quint,
    Sine,
    Expo,
    Circ,
    Back,
    Elastic,
    Bounce,
}

const C1: f64 = 1.70158;
const C2: f64 = C1 * 1.525;
const C3: f64 = C1 + 1.0;
const C4: f64 = (2.0 * PI) / 3.0;
const C5: f64 = (2.0 * PI) / 4.5;

fn bounce_out(t: f64) -> f64 {
    let n1 = 7.5625;
    let d1 = 2.75;
    if t < 1.0 / d1 {
        n1 * t * t
    } else if t < 2.0 / d1 {
        let t = t - 1.5 / d1;
        n1 * t * t + 0.75
    } else if t < 2.5 / d1 {
        let t = t - 2.25 / d1;
        n1 * t * t + 0.9375
    } else {
        let t = t - 2.625 / d1;
        n1 * t * t + 0.984375
    }
}

impl Shape {
    fn ease_in(self, t: f64) -> f64 {
        match self {
            Shape::Quad => t * t,
            Shape::Cubic => t * t * t,
            Shape::Quart => t * t * t * t,
            Shape::Quint => t * t * t * t * t,
            Shape::Sine => 1.0 - (t * PI / 2.0).cos(),
            Shape::Expo => {
                if t == 0.0 {
                    0.0
                } else {
                    2f64.powf(10.0 * t - 10.0)
                }
            }
            Shape::Circ => 1.0 - (1.0 - t * t).max(0.0).sqrt(),
            Shape::Back => C3 * t * t * t - C1 * t * t,
            Shape::Elastic => {
                if t == 0.0 || t == 1.0 {
                    t
                } else {
                    -(2f64.powf(10.0 * t - 10.0)) * ((t * 10.0 - 10.75) * C4).sin()
                }
            }
            Shape::Bounce => 1.0 - bounce_out(1.0 - t),
        }
    }
}

impl Easing {
    /// Parses "linear", "quad_out", "ease-out-quad", "EaseOutQuad", "step"; unknown names are linear.
    pub fn parse(name: &str) -> Easing {
        let raw = name.trim();
        if raw.is_empty() {
            return Easing::Linear;
        }
        let mut words: Vec<String> = Vec::new();
        let mut current = String::new();
        for ch in raw.chars() {
            if ch == '_' || ch == '-' || ch == ' ' {
                if !current.is_empty() {
                    words.push(std::mem::take(&mut current));
                }
            } else if ch.is_ascii_uppercase() && !current.is_empty() {
                words.push(std::mem::take(&mut current));
                current.push(ch.to_ascii_lowercase());
            } else {
                current.push(ch.to_ascii_lowercase());
            }
        }
        if !current.is_empty() {
            words.push(current);
        }
        let words: Vec<&str> = words
            .iter()
            .map(String::as_str)
            .filter(|w| *w != "ease")
            .collect();
        if words == ["linear"] {
            return Easing::Linear;
        }
        if words == ["step"] || words == ["constant"] || words == ["hold"] {
            return Easing::Step;
        }
        let shape = words.iter().find_map(|w| match *w {
            "quad" => Some(Shape::Quad),
            "cubic" => Some(Shape::Cubic),
            "quart" => Some(Shape::Quart),
            "quint" => Some(Shape::Quint),
            "sine" => Some(Shape::Sine),
            "expo" => Some(Shape::Expo),
            "circ" => Some(Shape::Circ),
            "back" => Some(Shape::Back),
            "elastic" => Some(Shape::Elastic),
            "bounce" => Some(Shape::Bounce),
            _ => None,
        });
        let has_in = words.contains(&"in") || words.contains(&"inout");
        let has_out = words.contains(&"out") || words.contains(&"inout");
        match (shape, has_in, has_out) {
            (Some(shape), true, true) => Easing::InOut(shape),
            (Some(shape), true, false) => Easing::In(shape),
            (Some(shape), false, true) => Easing::Out(shape),
            _ => Easing::Linear,
        }
    }

    /// Eased progress for t in [0, 1] (clamped).
    pub fn apply(self, t: f64) -> f64 {
        let t = if t.is_finite() {
            t.clamp(0.0, 1.0)
        } else {
            0.0
        };
        match self {
            Easing::Linear => t,
            Easing::Step => {
                if t >= 1.0 {
                    1.0
                } else {
                    0.0
                }
            }
            Easing::In(shape) => shape.ease_in(t),
            Easing::Out(shape) => match shape {
                Shape::Elastic => {
                    if t == 0.0 || t == 1.0 {
                        t
                    } else {
                        2f64.powf(-10.0 * t) * ((t * 10.0 - 0.75) * C4).sin() + 1.0
                    }
                }
                Shape::Bounce => bounce_out(t),
                _ => 1.0 - shape.ease_in(1.0 - t),
            },
            Easing::InOut(shape) => match shape {
                Shape::Sine => -((PI * t).cos() - 1.0) / 2.0,
                Shape::Expo => {
                    if t == 0.0 || t == 1.0 {
                        t
                    } else if t < 0.5 {
                        2f64.powf(20.0 * t - 10.0) / 2.0
                    } else {
                        (2.0 - 2f64.powf(-20.0 * t + 10.0)) / 2.0
                    }
                }
                Shape::Back => {
                    if t < 0.5 {
                        ((2.0 * t).powi(2) * ((C2 + 1.0) * 2.0 * t - C2)) / 2.0
                    } else {
                        ((2.0 * t - 2.0).powi(2) * ((C2 + 1.0) * (t * 2.0 - 2.0) + C2) + 2.0) / 2.0
                    }
                }
                Shape::Elastic => {
                    if t == 0.0 || t == 1.0 {
                        t
                    } else if t < 0.5 {
                        -(2f64.powf(20.0 * t - 10.0) * ((20.0 * t - 11.125) * C5).sin()) / 2.0
                    } else {
                        (2f64.powf(-20.0 * t + 10.0) * ((20.0 * t - 11.125) * C5).sin()) / 2.0 + 1.0
                    }
                }
                Shape::Bounce => {
                    if t < 0.5 {
                        (1.0 - bounce_out(1.0 - 2.0 * t)) / 2.0
                    } else {
                        (1.0 + bounce_out(2.0 * t - 1.0)) / 2.0
                    }
                }
                _ => {
                    if t < 0.5 {
                        shape.ease_in(2.0 * t) / 2.0
                    } else {
                        1.0 - shape.ease_in(2.0 - 2.0 * t) / 2.0
                    }
                }
            },
        }
    }
}
