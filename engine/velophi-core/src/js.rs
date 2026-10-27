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


/// Shortest round-trip decimal digits and exponent of a finite positive x: (digits, n) with x = 0.d₁d₂… × 10ⁿ
/// (the s, k, n of ECMAScript Number::toString).
fn shortest_digits(x: f64) -> (Vec<u8>, i32) {
    let e = format!("{:e}", x);
    let (mant, exp) = e.split_once('e').expect("exponent");
    let exp: i32 = exp.parse().expect("exponent digits");
    let digits: Vec<u8> = mant.bytes().filter(|c| c.is_ascii_digit()).collect();
    (digits, exp + 1)
}

/// `String(x)` / template-literal text of a number (ECMAScript Number::toString, radix 10).
pub fn js_num(x: f64) -> String {
    if x.is_nan() {
        return "NaN".into();
    }
    if x == 0.0 {
        return "0".into();
    }
    if x.is_infinite() {
        return if x > 0.0 { "Infinity".into() } else { "-Infinity".into() };
    }
    if x < 0.0 {
        return format!("-{}", js_num(-x));
    }
    let (d, n) = shortest_digits(x);
    let k = d.len() as i32;
    let ds = String::from_utf8(d.clone()).expect("ascii");
    if k <= n && n <= 21 {
        let mut s = ds;
        for _ in 0..(n - k) {
            s.push('0');
        }
        return s;
    }
    if 0 < n && n <= 21 {
        return format!("{}.{}", &ds[..n as usize], &ds[n as usize..]);
    }
    if -6 < n && n <= 0 {
        let mut s = String::from("0.");
        for _ in 0..(-n) {
            s.push('0');
        }
        s.push_str(&ds);
        return s;
    }
    let e = n - 1;
    let sign = if e < 0 { '-' } else { '+' };
    if k == 1 {
        format!("{}e{}{}", ds, sign, e.abs())
    } else {
        format!("{}.{}e{}{}", &ds[..1], &ds[1..], sign, e.abs())
    }
}

/// Exact decimal digits of a finite positive x rounded to p significant digits, ties away from zero (ECMAScript
/// picks the larger n): (digits, e) with x ≈ d₁.d₂… × 10ᵉ.
fn precision_digits(x: f64, p: usize) -> (Vec<u8>, i32) {
    // Rust prints the exact binary value with as many digits as asked; 800 covers every double
    let exact = format!("{:.800e}", x);
    let (mant, exp) = exact.split_once('e').expect("exponent");
    let mut e: i32 = exp.parse().expect("exponent digits");
    let all: Vec<u8> = mant.bytes().filter(|c| c.is_ascii_digit()).map(|c| c - b'0').collect();
    let mut d: Vec<u8> = all[..p].to_vec();
    let rest = &all[p..];
    let round_up = match rest.first() {
        Some(&r) if r > 5 => true,
        Some(&5) => true, // exactly half or more: up (ties to the larger)
        _ => false,
    };
    if round_up {
        let mut i = p;
        loop {
            if i == 0 {
                d.insert(0, 1);
                d.truncate(p);
                e += 1;
                break;
            }
            i -= 1;
            if d[i] == 9 {
                d[i] = 0;
            } else {
                d[i] += 1;
                break;
            }
        }
    }
    (d, e)
}

/// `x.toPrecision(p)` (1 ≤ p ≤ 100).
pub fn js_to_precision(x: f64, p: usize) -> String {
    if !x.is_finite() {
        return js_num(x);
    }
    if x == 0.0 {
        let mut s = String::from("0");
        if p > 1 {
            s.push('.');
            for _ in 1..p {
                s.push('0');
            }
        }
        return s;
    }
    if x < 0.0 {
        return format!("-{}", js_to_precision(-x, p));
    }
    let (d, e) = precision_digits(x, p);
    let ds: String = d.iter().map(|c| (b'0' + c) as char).collect();
    if e < -6 || e >= p as i32 {
        let sign = if e < 0 { '-' } else { '+' };
        return if p == 1 { format!("{}e{}{}", ds, sign, e.abs()) } else { format!("{}.{}e{}{}", &ds[..1], &ds[1..], sign, e.abs()) };
    }
    if e == p as i32 - 1 {
        return ds;
    }
    if e >= 0 {
        let k = (e + 1) as usize;
        return format!("{}.{}", &ds[..k], &ds[k..]);
    }
    let mut s = String::from("0.");
    for _ in 0..(-(e + 1)) {
        s.push('0');
    }
    s.push_str(&ds);
    s
}

/// `x.toExponential(f)` (0 ≤ f ≤ 100).
pub fn js_to_exponential(x: f64, f: usize) -> String {
    if !x.is_finite() {
        return js_num(x);
    }
    if x < 0.0 {
        return format!("-{}", js_to_exponential(-x, f));
    }
    let (d, e) = if x == 0.0 { (vec![0u8; f + 1], 0) } else { precision_digits(x, f + 1) };
    let ds: String = d.iter().map(|c| (b'0' + c) as char).collect();
    let sign = if e < 0 { '-' } else { '+' };
    if f == 0 {
        format!("{}e{}{}", ds, sign, e.abs())
    } else {
        format!("{}.{}e{}{}", &ds[..1], &ds[1..], sign, e.abs())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn number_texts() {
        assert_eq!(js_num(0.1 + 0.2), "0.30000000000000004");
        assert_eq!(js_num(-0.0), "0");
        assert_eq!(js_num(1e21), "1e+21");
        assert_eq!(js_num(123456789012345680000.0), "123456789012345680000");
        assert_eq!(js_num(1.5e-7), "1.5e-7");
        assert_eq!(js_num(0.000001), "0.000001");
        assert_eq!(js_num(2.0), "2");
        assert_eq!(js_num(-12.5), "-12.5");
        assert_eq!(js_to_precision(0.125, 2), "0.13");
        assert_eq!(js_to_precision(123.456, 4), "123.5");
        assert_eq!(js_to_precision(0.000123456, 3), "0.000123");
        assert_eq!(js_to_precision(1234567.0, 3), "1.23e+6");
        assert_eq!(js_to_precision(99.99, 3), "100");
        assert_eq!(js_to_precision(0.0, 4), "0.000");
        assert_eq!(js_to_precision(1e-7, 2), "1.0e-7");
        assert_eq!(js_to_precision(5.0, 1), "5");
        assert_eq!(js_to_exponential(12345.0, 2), "1.23e+4");
        assert_eq!(js_to_exponential(0.0, 2), "0.00e+0");
    }

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
