//! JavaScript number semantics that the solver relies on (decision D30, rule 2).
//!
//! Rust's `f64::min`/`f64::max` ignore NaN and do not order the zeros; `Math.min`/`Math.max` return NaN when an
//! argument is NaN and treat −0 as smaller than +0. Every `Math.min`/`Math.max` of the TypeScript solver is
//! ported through these helpers, even where the arguments are known to be ordinary numbers.

/// `Math.min(a, b)`: NaN when either is NaN; −0 is smaller than +0.
#[inline(always)]
pub fn js_min(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        return f64::NAN;
    }
    if a < b {
        a
    } else if b < a {
        b
    } else if a == 0.0 && (a.is_sign_negative() || b.is_sign_negative()) {
        -0.0
    } else {
        a
    }
}

/// `Math.max(a, b)`: NaN when either is NaN; +0 is larger than −0.
#[inline(always)]
pub fn js_max(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        return f64::NAN;
    }
    if a > b {
        a
    } else if b > a {
        b
    } else if a == 0.0 && (a.is_sign_positive() || b.is_sign_positive()) {
        0.0
    } else {
        a
    }
}

/// `Math.round(x)`: the nearest integer, halves towards +∞; −0 for −0.5 ≤ x ≤ −0.
pub fn js_round(x: f64) -> f64 {
    if !x.is_finite() || x == 0.0 {
        return x;
    }
    let r = x.floor();
    let out = if x - r >= 0.5 { r + 1.0 } else { r };
    if out == 0.0 && x < 0.0 {
        -0.0
    } else {
        out
    }
}

/// `Math.sign(x)`: −1, −0, +0, +1 or NaN.
pub fn js_sign(x: f64) -> f64 {
    if x > 0.0 {
        1.0
    } else if x < 0.0 {
        -1.0
    } else {
        x
    }
}

/// `Number.isInteger(x)`.
pub fn js_is_integer(x: f64) -> bool {
    x.is_finite() && x.floor() == x
}

/// `ToInt32(x)` (the conversion of the bitwise operators and of `Int32Array` stores).
pub fn to_int32(x: f64) -> i32 {
    if !x.is_finite() || x == 0.0 {
        return 0;
    }
    let t = x.trunc();
    let m = t.rem_euclid(4_294_967_296.0);
    let u = m as u64 as u32;
    u as i32
}

/// Decimal text of a non-negative integer index as JavaScript prints it (template literals of labels and keys).
pub fn int_text(i: usize) -> String {
    i.to_string()
}

/// Same bits (−0 ≠ +0; NaN equals itself only with the same payload).
pub fn same_bits(a: f64, b: f64) -> bool {
    a.to_bits() == b.to_bits()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn min_max_zeros_and_nan() {
        assert!(js_min(0.0, -0.0).is_sign_negative());
        assert!(js_min(-0.0, 0.0).is_sign_negative());
        assert!(js_max(0.0, -0.0).is_sign_positive());
        assert!(js_max(-0.0, 0.0).is_sign_positive());
        assert!(js_min(f64::NAN, 1.0).is_nan());
        assert!(js_max(1.0, f64::NAN).is_nan());
        assert_eq!(js_min(1.0, 2.0), 1.0);
        assert_eq!(js_max(1.0, 2.0), 2.0);
    }

    #[test]
    fn round_like_math_round() {
        assert_eq!(js_round(2.5), 3.0);
        assert_eq!(js_round(-2.5), -2.0);
        assert_eq!(js_round(0.49999999999999994), 0.0);
        assert!(js_round(-0.4).is_sign_negative());
        assert_eq!(js_round(599.9999999999999), 600.0);
    }

    #[test]
    fn int32() {
        assert_eq!(to_int32(-1.0), -1);
        assert_eq!(to_int32(4_294_967_295.0), -1);
        assert_eq!(to_int32(2_147_483_648.0), -2_147_483_648);
        assert_eq!(to_int32(3.9), 3);
        assert_eq!(to_int32(-3.9), -3);
    }
}
