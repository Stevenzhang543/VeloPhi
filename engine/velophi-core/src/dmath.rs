//! Deterministic elementary functions: a line-by-line port of `src/core/math/dmath.ts` (fdlibm kernels as used
//! by musl, built only from IEEE-754 operations). Same algorithm, same operation order, so every function
//! returns the same bits as the TypeScript version (decision D30, rule 1). The standard library's
//! transcendental functions are never used by the solver.

// The constants are copied digit for digit from musl/fdlibm so they can be checked against the C sources
#![allow(clippy::excessive_precision, clippy::approx_constant)]

use crate::js::js_is_integer;

#[inline(always)]
fn high_word(x: f64) -> u32 {
    (x.to_bits() >> 32) as u32
}
#[inline(always)]
fn low_word(x: f64) -> u32 {
    x.to_bits() as u32
}
#[inline(always)]
fn from_words(hi: u32, lo: u32) -> f64 {
    f64::from_bits(((hi as u64) << 32) | lo as u64)
}

// ---- Sine and cosine (musl __sin, __cos, __rem_pio2) ----
const S1: f64 = -1.66666666666666324348e-01;
const S2: f64 = 8.33333333332248946124e-03;
const S3: f64 = -1.98412698298579493134e-04;
const S4: f64 = 2.75573137070700676789e-06;
const S5: f64 = -2.50507602534068634195e-08;
const S6: f64 = 1.58969099521155010221e-10;
const C1: f64 = 4.16666666666666019037e-02;
const C2: f64 = -1.38888888888741095749e-03;
const C3: f64 = 2.48015872894767294178e-05;
const C4: f64 = -2.75573143513906633035e-07;
const C5: f64 = 2.08757232129817482790e-09;
const C6: f64 = -1.13596475577881948265e-11;
const TO_INT: f64 = 1.5 / 2.220446049250313e-16;
const PIO4: f64 = 7.85398163397448278999e-01;
const INV_PIO2: f64 = 6.36619772367581382433e-01;
const PIO2_1: f64 = 1.57079632673412561417e+00;
const PIO2_1T: f64 = 6.07710050650619224932e-11;
const PIO2_2: f64 = 6.07710050630396597660e-11;
const PIO2_2T: f64 = 2.02226624879595063154e-21;
const PIO2_3: f64 = 2.02226624871116645580e-21;
const PIO2_3T: f64 = 8.47842766036889956997e-32;

#[inline(always)]
fn exponent_of(x: f64) -> i64 {
    ((high_word(x) >> 20) & 0x7ff) as i64
}

#[inline(always)]
fn kernel_sin(x: f64, y: f64, iy: u8) -> f64 {
    let z = x * x;
    let w = z * z;
    let r = S2 + z * (S3 + z * S4) + z * w * (S5 + z * S6);
    let v = z * x;
    if iy == 0 {
        x + v * (S1 + z * r)
    } else {
        x - ((z * (0.5 * y - v * r) - y) - v * S1)
    }
}

#[inline(always)]
fn kernel_cos(x: f64, y: f64) -> f64 {
    let z = x * x;
    let w = z * z;
    let r = z * (C1 + z * (C2 + z * C3)) + w * w * (C4 + z * (C5 + z * C6));
    let hz = 0.5 * z;
    let one = 1.0 - hz;
    one + (((1.0 - one) - hz) + (z * r - x * y))
}

/// Reduce x to n·π/2 + y0 + y1; returns (n, y0, y1), or None for |x| beyond about 1.6e6.
fn rem_pio2(x: f64, ix: u32) -> Option<(i64, f64, f64)> {
    let negative = x < 0.0;
    let small = |k: f64| -> (i64, f64, f64) {
        let z = if negative { x + k * PIO2_1 } else { x - k * PIO2_1 };
        let y0 = if negative { z + k * PIO2_1T } else { z - k * PIO2_1T };
        let y1 = if negative { (z - y0) + k * PIO2_1T } else { (z - y0) - k * PIO2_1T };
        let n = k as i64;
        (if negative { -n } else { n }, y0, y1)
    };
    if ix <= 0x400f6a7a {
        if (ix & 0xfffff) != 0x921fb {
            return Some(small(if ix <= 0x4002d97c { 1.0 } else { 2.0 }));
        }
    } else if ix <= 0x401c463b {
        if ix <= 0x4015fdbc {
            if ix != 0x4012d97c {
                return Some(small(3.0));
            }
        } else if ix != 0x401921fb {
            return Some(small(4.0));
        }
    } else if ix >= 0x413921fb {
        return None;
    }
    let mut fnum = x * INV_PIO2 + TO_INT - TO_INT;
    let mut r = x - fnum * PIO2_1;
    let mut w = fnum * PIO2_1T;
    if r - w < -PIO4 {
        fnum -= 1.0;
        r = x - fnum * PIO2_1;
        w = fnum * PIO2_1T;
    } else if r - w > PIO4 {
        fnum += 1.0;
        r = x - fnum * PIO2_1;
        w = fnum * PIO2_1T;
    }
    let mut y0 = r - w;
    let ex = (ix >> 20) as i64;
    if ex - exponent_of(y0) > 16 {
        let mut t = r;
        w = fnum * PIO2_2;
        r = t - w;
        w = fnum * PIO2_2T - ((t - r) - w);
        y0 = r - w;
        if ex - exponent_of(y0) > 49 {
            t = r;
            w = fnum * PIO2_3;
            r = t - w;
            w = fnum * PIO2_3T - ((t - r) - w);
            y0 = r - w;
        }
    }
    let y1 = (r - y0) - w;
    Some((fnum as i64, y0, y1))
}

/// Large arguments: reduce by 2π first.
fn reduce_large(x: f64) -> f64 {
    let two_pi = 2.0 * PI;
    let turns = (x / two_pi).floor();
    x - turns * two_pi
}

/// Deterministic sine.
pub fn sin(x: f64) -> f64 {
    let ix = high_word(x) & 0x7fffffff;
    if ix <= 0x3fe921fb {
        return if ix < 0x3e500000 { x } else { kernel_sin(x, 0.0, 0) };
    }
    if ix >= 0x7ff00000 {
        // NaN for ±∞ and NaN, as in musl
        #[allow(clippy::eq_op)]
        return x - x;
    }
    match rem_pio2(x, ix) {
        None => sin(reduce_large(x)),
        Some((n, y0, y1)) => match n & 3 {
            0 => kernel_sin(y0, y1, 1),
            1 => kernel_cos(y0, y1),
            2 => -kernel_sin(y0, y1, 1),
            _ => -kernel_cos(y0, y1),
        },
    }
}

/// Deterministic cosine.
pub fn cos(x: f64) -> f64 {
    let ix = high_word(x) & 0x7fffffff;
    if ix <= 0x3fe921fb {
        return if ix < 0x3e46a09e { 1.0 } else { kernel_cos(x, 0.0) };
    }
    if ix >= 0x7ff00000 {
        // NaN for ±∞ and NaN, as in musl
        #[allow(clippy::eq_op)]
        return x - x;
    }
    match rem_pio2(x, ix) {
        None => cos(reduce_large(x)),
        Some((n, y0, y1)) => match n & 3 {
            0 => kernel_cos(y0, y1),
            1 => -kernel_sin(y0, y1, 1),
            2 => -kernel_cos(y0, y1),
            _ => kernel_sin(y0, y1, 1),
        },
    }
}

/// Deterministic tangent, sin(x) / cos(x).
pub fn tan(x: f64) -> f64 {
    sin(x) / cos(x)
}

// ---- Arctangent (musl atan.c, atan2.c) ----
const ATANHI: [f64; 4] = [4.63647609000806093515e-01, 7.85398163397448278999e-01, 9.82793723247329054082e-01, 1.57079632679489655800e+00];
const ATANLO: [f64; 4] = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
const AT: [f64; 11] = [
    3.33333333333329318027e-01,
    -1.99999999998764832476e-01,
    1.42857142725034663711e-01,
    -1.11111104054623557880e-01,
    9.09088713343650656196e-02,
    -7.69187620504482999495e-02,
    6.66107313738753120669e-02,
    -5.83357013379057348645e-02,
    4.97687799461593236017e-02,
    -3.65315727442169155270e-02,
    1.62858201153657823623e-02,
];

/// Deterministic arctangent (rad).
pub fn atan(input: f64) -> f64 {
    let mut x = input;
    let hx = high_word(x);
    let sign = hx >> 31;
    let ix = hx & 0x7fffffff;
    let id: i32;
    if ix >= 0x44100000 {
        if x.is_nan() {
            return x;
        }
        let z = ATANHI[3] + ATANLO[3];
        return if sign != 0 { -z } else { z };
    }
    if ix < 0x3fdc0000 {
        if ix < 0x3e400000 {
            return x;
        }
        id = -1;
    } else {
        x = x.abs();
        if ix < 0x3ff30000 {
            if ix < 0x3fe60000 {
                id = 0;
                x = (2.0 * x - 1.0) / (2.0 + x);
            } else {
                id = 1;
                x = (x - 1.0) / (x + 1.0);
            }
        } else if ix < 0x40038000 {
            id = 2;
            x = (x - 1.5) / (1.0 + 1.5 * x);
        } else {
            id = 3;
            x = -1.0 / x;
        }
    }
    let z = x * x;
    let w = z * z;
    let s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
    let s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
    if id < 0 {
        return x - x * (s1 + s2);
    }
    let i = id as usize;
    let r = ATANHI[i] - ((x * (s1 + s2) - ATANLO[i]) - x);
    if sign != 0 {
        -r
    } else {
        r
    }
}

const PI: f64 = 3.1415926535897931160e+00;
const PI_LO: f64 = 1.2246467991473531772e-16;

/// Deterministic angle of the point (x, y) (rad, −π … π).
pub fn atan2(y: f64, x: f64) -> f64 {
    if x.is_nan() || y.is_nan() {
        return x + y;
    }
    let mut ix = high_word(x) as i64;
    let lx = low_word(x) as i64;
    let mut iy = high_word(y) as i64;
    let ly = low_word(y) as i64;
    if ix == 0x3ff00000 && lx == 0 {
        return atan(y);
    }
    let m = ((iy >> 31) & 1) | ((ix >> 30) & 2);
    ix &= 0x7fffffff;
    iy &= 0x7fffffff;
    if iy == 0 && ly == 0 {
        return match m {
            0 | 1 => y,
            2 => PI,
            _ => -PI,
        };
    }
    if ix == 0 && lx == 0 {
        return if m & 1 != 0 { -PI / 2.0 } else { PI / 2.0 };
    }
    if ix == 0x7ff00000 {
        if iy == 0x7ff00000 {
            return match m {
                0 => PI / 4.0,
                1 => -PI / 4.0,
                2 => 3.0 * PI / 4.0,
                _ => -3.0 * PI / 4.0,
            };
        }
        return match m {
            0 => 0.0,
            1 => -0.0,
            2 => PI,
            _ => -PI,
        };
    }
    if ix + (64 << 20) < iy || iy == 0x7ff00000 {
        return if m & 1 != 0 { -PI / 2.0 } else { PI / 2.0 };
    }
    let z = if (m & 2) != 0 && iy + (64 << 20) < ix { 0.0 } else { atan((y / x).abs()) };
    match m {
        0 => z,
        1 => -z,
        2 => PI - (z - PI_LO),
        _ => (z - PI_LO) - PI,
    }
}

/// Deterministic arcsine via atan2; NaN outside [−1, 1].
pub fn asin(x: f64) -> f64 {
    // Not a range test: NaN must fall through to atan2, as in dmath.ts
    #[allow(clippy::manual_range_contains)]
    if x > 1.0 || x < -1.0 {
        return f64::NAN;
    }
    atan2(x, ((1.0 - x) * (1.0 + x)).sqrt())
}

/// Deterministic arccosine via atan2; NaN outside [−1, 1].
pub fn acos(x: f64) -> f64 {
    // Not a range test: NaN must fall through to atan2, as in dmath.ts
    #[allow(clippy::manual_range_contains)]
    if x > 1.0 || x < -1.0 {
        return f64::NAN;
    }
    atan2(((1.0 - x) * (1.0 + x)).sqrt(), x)
}

// ---- Exponential and logarithm (musl exp.c, log.c) ----
const LN2HI: f64 = 6.93147180369123816490e-01;
const LN2LO: f64 = 1.90821492927058770002e-10;
const INVLN2: f64 = 1.44269504088896338700e+00;
const P1: f64 = 1.66666666666666019037e-01;
const P2: f64 = -2.77777777770155933842e-03;
const P3: f64 = 6.61375632143793436117e-05;
const P4: f64 = -1.65339022054652515390e-06;
const P5: f64 = 4.13813679705723846039e-08;

#[inline(always)]
fn two_to(n: i64) -> f64 {
    from_words(((0x3ff + n) << 20) as u32, 0)
}

/// Scale by a power of two: value · 2^exponent (musl scalbn).
pub fn scalbn(value: f64, exponent: i64) -> f64 {
    let mut y = value;
    let mut n = exponent;
    if n > 1023 {
        y *= two_to(1023);
        n -= 1023;
        if n > 1023 {
            y *= two_to(1023);
            n -= 1023;
            if n > 1023 {
                n = 1023;
            }
        }
    } else if n < -1022 {
        y *= two_to(-1022) * two_to(53);
        n += 1022 - 53;
        if n < -1022 {
            y *= two_to(-1022) * two_to(53);
            n += 1022 - 53;
            if n < -1022 {
                n = -1022;
            }
        }
    }
    y * two_to(n)
}

/// Deterministic natural exponential.
pub fn exp(input: f64) -> f64 {
    let mut x = input;
    let mut hx = high_word(x);
    let sign = (hx >> 31) as i64;
    hx &= 0x7fffffff;
    if hx >= 0x4086232b {
        if x.is_nan() {
            return x;
        }
        if x > 709.782712893383973096 {
            return f64::INFINITY;
        }
        if x < -745.13321910194110842 {
            return 0.0;
        }
    }
    let hi: f64;
    let lo: f64;
    let k: f64;
    if hx > 0x3fd62e42 {
        if hx >= 0x3ff0a2b2 {
            k = (INVLN2 * x + if sign != 0 { -0.5 } else { 0.5 }).trunc();
        } else {
            k = (1 - sign - sign) as f64;
        }
        hi = x - k * LN2HI;
        lo = k * LN2LO;
        x = hi - lo;
    } else if hx > 0x3e300000 {
        k = 0.0;
        hi = x;
        lo = 0.0;
    } else {
        return 1.0 + x;
    }
    let xx = x * x;
    let c = x - xx * (P1 + xx * (P2 + xx * (P3 + xx * (P4 + xx * P5))));
    let y = 1.0 + (x * c / (2.0 - c) - lo + hi);
    if k == 0.0 {
        y
    } else {
        scalbn(y, k as i64)
    }
}

const LG1: f64 = 6.666666666666735130e-01;
const LG2: f64 = 3.999999999940941908e-01;
const LG3: f64 = 2.857142874366239149e-01;
const LG4: f64 = 2.222219843214978396e-01;
const LG5: f64 = 1.818357216161805012e-01;
const LG6: f64 = 1.531383769920937332e-01;
const LG7: f64 = 1.479819860511658591e-01;

/// Deterministic natural logarithm.
pub fn log(input: f64) -> f64 {
    let mut x = input;
    let mut hx = high_word(x);
    let mut k: i64 = 0;
    if hx < 0x00100000 || (hx >> 31) != 0 {
        if x == 0.0 {
            return f64::NEG_INFINITY;
        }
        if (hx >> 31) != 0 {
            return f64::NAN;
        }
        k -= 54;
        x *= two_to(54);
        hx = high_word(x);
    } else if hx >= 0x7ff00000 {
        return x;
    } else if hx == 0x3ff00000 && low_word(x) == 0 {
        return 0.0;
    }
    hx += 0x3ff00000 - 0x3fe6a09e;
    k += (hx >> 20) as i64 - 0x3ff;
    hx = (hx & 0x000fffff) + 0x3fe6a09e;
    x = from_words(hx, low_word(x));
    let f = x - 1.0;
    let hfsq = 0.5 * f * f;
    let s = f / (2.0 + f);
    let z = s * s;
    let w = z * z;
    let t1 = w * (LG2 + w * (LG4 + w * LG6));
    let t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
    let r = t2 + t1;
    let dk = k as f64;
    s * (hfsq + r) + dk * LN2LO - hfsq + f + dk * LN2HI
}

/// Power x^y. Integer exponents up to 64 in magnitude use repeated squaring; others exp(y·log x).
pub fn pow(x: f64, y: f64) -> f64 {
    if js_is_integer(y) && y.abs() <= 64.0 {
        let mut n = y.abs() as u32;
        let mut base = x;
        let mut result = 1.0;
        while n > 0 {
            if n & 1 != 0 {
                result *= base;
            }
            base *= base;
            n >>= 1;
        }
        return if y < 0.0 { 1.0 / result } else { result };
    }
    if x == 0.0 {
        return if y > 0.0 { 0.0 } else { f64::INFINITY };
    }
    if x < 0.0 {
        return f64::NAN;
    }
    exp(y * log(x))
}

/// Euclidean norm √(x² + y²), built from IEEE-754 operations only.
#[inline(always)]
pub fn hypot(x: f64, y: f64) -> f64 {
    (x * x + y * y).sqrt()
}

/// π as a double.
pub const PI_VALUE: f64 = PI;
/// One degree (rad).
pub const DEG: f64 = PI / 180.0;
/// `Math.E`.
pub const E_VALUE: f64 = std::f64::consts::E;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_values() {
        assert_eq!(sin(0.0), 0.0);
        assert_eq!(cos(0.0), 1.0);
        assert_eq!(exp(0.0), 1.0);
        assert_eq!(log(1.0), 0.0);
        assert_eq!(atan2(0.0, -1.0), PI);
        assert!((sin(1.0) - 0.8414709848078965).abs() < 1e-16);
        assert!((exp(1.0) - std::f64::consts::E).abs() < 1e-15);
        assert_eq!(pow(2.0, 10.0), 1024.0);
        assert_eq!(pow(2.0, -2.0), 0.25);
    }
}
