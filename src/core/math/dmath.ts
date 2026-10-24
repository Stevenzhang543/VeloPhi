/**
 * Deterministic elementary functions.
 *
 * JavaScript rounds +, −, ×, ÷ and sqrt per IEEE-754 in every engine, but Math.sin, Math.atan2, Math.exp …
 * differ in the last bit between V8, SpiderMonkey and JavaScriptCore. Every transcendental function the
 * solver and the formula layer use comes from here: direct ports of the fdlibm kernels as used by musl,
 * built only from IEEE-754 operations, so a scene gives the same bits in every browser and in Node.
 * (sin/cos are carried over from Nova_A's `stableTrig`; atan, atan2, exp and log are new ports.)
 */

const f64 = new Float64Array(1)
const u32 = new Uint32Array(f64.buffer)
const HI = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1 ? 1 : 0 // Little-endian: high word second
const LO = 1 - HI

function highWord(x: number): number { f64[0] = x; return u32[HI] >>> 0 }
function lowWord(x: number): number { f64[0] = x; return u32[LO] >>> 0 }
function fromWords(hi: number, lo: number): number { u32[HI] = hi >>> 0; u32[LO] = lo >>> 0; return f64[0] }

// ---- Sine and cosine (musl __sin, __cos, __rem_pio2) ----
const S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03, S3 = -1.98412698298579493134e-04
const S4 = 2.75573137070700676789e-06, S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10
const C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03, C3 = 2.48015872894767294178e-05
const C4 = -2.75573143513906633035e-07, C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11
const TO_INT = 1.5 / 2.220446049250313e-16
const PIO4 = 7.85398163397448278999e-01
const INV_PIO2 = 6.36619772367581382433e-01
const PIO2_1 = 1.57079632673412561417e+00, PIO2_1T = 6.07710050650619224932e-11
const PIO2_2 = 6.07710050630396597660e-11, PIO2_2T = 2.02226624879595063154e-21
const PIO2_3 = 2.02226624871116645580e-21, PIO2_3T = 8.47842766036889956997e-32

function exponentOf(x: number): number { return (highWord(x) >>> 20) & 0x7ff }

function kernelSin(x: number, y: number, iy: 0 | 1): number {
  const z = x * x, w = z * z
  const r = S2 + z * (S3 + z * S4) + z * w * (S5 + z * S6)
  const v = z * x
  return iy === 0 ? x + v * (S1 + z * r) : x - ((z * (0.5 * y - v * r) - y) - v * S1)
}

function kernelCos(x: number, y: number): number {
  const z = x * x, w = z * z
  const r = z * (C1 + z * (C2 + z * C3)) + w * w * (C4 + z * (C5 + z * C6))
  const hz = 0.5 * z, one = 1.0 - hz
  return one + (((1.0 - one) - hz) + (z * r - x * y))
}

const reduced = [0, 0]
/**
 * Reduce x to n·π/2 + reduced[0] + reduced[1]; returns n, or null for |x| beyond about 1.6e6 (not used by the
 * solver).
 */
function remPio2(x: number, ix: number): number | null {
  const negative = x < 0
  const small = (k: number): number => {
    const z = negative ? x + k * PIO2_1 : x - k * PIO2_1
    reduced[0] = negative ? z + k * PIO2_1T : z - k * PIO2_1T
    reduced[1] = negative ? (z - reduced[0]) + k * PIO2_1T : (z - reduced[0]) - k * PIO2_1T
    return negative ? -k : k
  }
  if (ix <= 0x400f6a7a) {
    if ((ix & 0xfffff) !== 0x921fb) return small(ix <= 0x4002d97c ? 1 : 2)
  } else if (ix <= 0x401c463b) {
    if (ix <= 0x4015fdbc) { if (ix !== 0x4012d97c) return small(3) } else if (ix !== 0x401921fb) return small(4)
  } else if (ix >= 0x413921fb) return null
  let fn = x * INV_PIO2 + TO_INT - TO_INT
  let r = x - fn * PIO2_1, w = fn * PIO2_1T
  if (r - w < -PIO4) { fn--; r = x - fn * PIO2_1; w = fn * PIO2_1T } else if (r - w > PIO4) { fn++; r = x - fn * PIO2_1; w = fn * PIO2_1T }
  reduced[0] = r - w
  const ex = ix >>> 20
  if (ex - exponentOf(reduced[0]) > 16) {
    let t = r
    w = fn * PIO2_2; r = t - w; w = fn * PIO2_2T - ((t - r) - w)
    reduced[0] = r - w
    if (ex - exponentOf(reduced[0]) > 49) {
      t = r
      w = fn * PIO2_3; r = t - w; w = fn * PIO2_3T - ((t - r) - w)
      reduced[0] = r - w
    }
  }
  reduced[1] = (r - reduced[0]) - w
  return fn
}

/** Large arguments: reduce by 2π first (exact enough for the far range we never reach in practice). */
function reduceLarge(x: number): number { const turns = Math.floor(x / (2 * Math.PI)); return x - turns * (2 * Math.PI) }

/** Deterministic sine. */
export function sin(x: number): number {
  const ix = highWord(x) & 0x7fffffff
  if (ix <= 0x3fe921fb) return ix < 0x3e500000 ? x : kernelSin(x, 0, 0)
  if (ix >= 0x7ff00000) return x - x
  const n = remPio2(x, ix)
  if (n === null) return sin(reduceLarge(x))
  switch (n & 3) {
    case 0: return kernelSin(reduced[0], reduced[1], 1)
    case 1: return kernelCos(reduced[0], reduced[1])
    case 2: return -kernelSin(reduced[0], reduced[1], 1)
    default: return -kernelCos(reduced[0], reduced[1])
  }
}

/** Deterministic cosine. */
export function cos(x: number): number {
  const ix = highWord(x) & 0x7fffffff
  if (ix <= 0x3fe921fb) return ix < 0x3e46a09e ? 1.0 : kernelCos(x, 0)
  if (ix >= 0x7ff00000) return x - x
  const n = remPio2(x, ix)
  if (n === null) return cos(reduceLarge(x))
  switch (n & 3) {
    case 0: return kernelCos(reduced[0], reduced[1])
    case 1: return -kernelSin(reduced[0], reduced[1], 1)
    case 2: return -kernelCos(reduced[0], reduced[1])
    default: return kernelSin(reduced[0], reduced[1], 1)
  }
}

/** Deterministic tangent, sin(x) / cos(x). */
export function tan(x: number): number { return sin(x) / cos(x) }

// ---- Arctangent (musl atan.c, atan2.c) ----
const ATANHI = [4.63647609000806093515e-01, 7.85398163397448278999e-01, 9.82793723247329054082e-01, 1.57079632679489655800e+00]
const ATANLO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17]
const AT = [
  3.33333333333329318027e-01, -1.99999999998764832476e-01, 1.42857142725034663711e-01, -1.11111104054623557880e-01,
  9.09088713343650656196e-02, -7.69187620504482999495e-02, 6.66107313738753120669e-02, -5.83357013379057348645e-02,
  4.97687799461593236017e-02, -3.65315727442169155270e-02, 1.62858201153657823623e-02
]

/** Deterministic arctangent (rad). */
export function atan(input: number): number {
  let x = input
  const hx = highWord(x)
  const sign = hx >>> 31
  const ix = hx & 0x7fffffff
  let id: number
  if (ix >= 0x44100000) {
    if (x !== x) return x
    const z = ATANHI[3] + ATANLO[3]
    return sign ? -z : z
  }
  if (ix < 0x3fdc0000) {
    if (ix < 0x3e400000) return x
    id = -1
  } else {
    x = Math.abs(x)
    if (ix < 0x3ff30000) {
      if (ix < 0x3fe60000) { id = 0; x = (2.0 * x - 1.0) / (2.0 + x) } else { id = 1; x = (x - 1.0) / (x + 1.0) }
    } else if (ix < 0x40038000) { id = 2; x = (x - 1.5) / (1.0 + 1.5 * x) } else { id = 3; x = -1.0 / x }
  }
  const z = x * x, w = z * z
  const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))))
  const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))))
  if (id < 0) return x - x * (s1 + s2)
  const r = ATANHI[id] - ((x * (s1 + s2) - ATANLO[id]) - x)
  return sign ? -r : r
}

const PI = 3.1415926535897931160e+00, PI_LO = 1.2246467991473531772e-16

/** Deterministic angle of the point (x, y) (rad, −π … π). */
export function atan2(y: number, x: number): number {
  if (x !== x || y !== y) return x + y
  let ix = highWord(x); const lx = lowWord(x)
  let iy = highWord(y); const ly = lowWord(y)
  if (((ix - 0x3ff00000) | lx) === 0) return atan(y)
  const m = ((iy >>> 31) & 1) | ((ix >>> 30) & 2)
  ix &= 0x7fffffff; iy &= 0x7fffffff
  if ((iy | ly) === 0) {
    switch (m) { case 0: case 1: return y; case 2: return PI; default: return -PI }
  }
  if ((ix | lx) === 0) return (m & 1) ? -PI / 2 : PI / 2
  if (ix === 0x7ff00000) {
    if (iy === 0x7ff00000) {
      switch (m) { case 0: return PI / 4; case 1: return -PI / 4; case 2: return 3 * PI / 4; default: return -3 * PI / 4 }
    }
    switch (m) { case 0: return 0.0; case 1: return -0.0; case 2: return PI; default: return -PI }
  }
  if (ix + (64 << 20) < iy || iy === 0x7ff00000) return (m & 1) ? -PI / 2 : PI / 2
  let z: number
  if ((m & 2) && iy + (64 << 20) < ix) z = 0
  else z = atan(Math.abs(y / x))
  switch (m) {
    case 0: return z
    case 1: return -z
    case 2: return PI - (z - PI_LO)
    default: return (z - PI_LO) - PI
  }
}

/** Deterministic arcsine via atan2; NaN outside [−1, 1]. */
export function asin(x: number): number {
  if (x > 1 || x < -1) return Number.NaN
  return atan2(x, Math.sqrt((1 - x) * (1 + x)))
}

/** Deterministic arccosine via atan2; NaN outside [−1, 1]. */
export function acos(x: number): number {
  if (x > 1 || x < -1) return Number.NaN
  return atan2(Math.sqrt((1 - x) * (1 + x)), x)
}

// ---- Exponential and logarithm (musl exp.c, log.c) ----
const LN2HI = 6.93147180369123816490e-01, LN2LO = 1.90821492927058770002e-10, INVLN2 = 1.44269504088896338700e+00
const P1 = 1.66666666666666019037e-01, P2 = -2.77777777770155933842e-03, P3 = 6.61375632143793436117e-05
const P4 = -1.65339022054652515390e-06, P5 = 4.13813679705723846039e-08

function twoTo(n: number): number { return fromWords(((0x3ff + n) << 20) >>> 0, 0) }

/** Scale by a power of two: value · 2^exponent (musl scalbn). */
export function scalbn(value: number, exponent: number): number {
  let y = value, n = exponent
  if (n > 1023) {
    y *= twoTo(1023); n -= 1023
    if (n > 1023) { y *= twoTo(1023); n -= 1023; if (n > 1023) n = 1023 }
  } else if (n < -1022) {
    y *= twoTo(-1022) * twoTo(53); n += 1022 - 53
    if (n < -1022) { y *= twoTo(-1022) * twoTo(53); n += 1022 - 53; if (n < -1022) n = -1022 }
  }
  return y * twoTo(n)
}

/** Deterministic natural exponential. */
export function exp(input: number): number {
  let x = input
  let hx = highWord(x)
  const sign = hx >>> 31
  hx &= 0x7fffffff
  if (hx >= 0x4086232b) {
    if (x !== x) return x
    if (x > 709.782712893383973096) return Number.POSITIVE_INFINITY
    if (x < -745.13321910194110842) return 0
  }
  let hi: number, lo: number, k: number
  if (hx > 0x3fd62e42) {
    if (hx >= 0x3ff0a2b2) k = Math.trunc(INVLN2 * x + (sign ? -0.5 : 0.5))
    else k = 1 - sign - sign
    hi = x - k * LN2HI
    lo = k * LN2LO
    x = hi - lo
  } else if (hx > 0x3e300000) {
    k = 0; hi = x; lo = 0
  } else {
    return 1 + x
  }
  const xx = x * x
  const c = x - xx * (P1 + xx * (P2 + xx * (P3 + xx * (P4 + xx * P5))))
  const y = 1 + (x * c / (2 - c) - lo + hi)
  return k === 0 ? y : scalbn(y, k)
}

const LG1 = 6.666666666666735130e-01, LG2 = 3.999999999940941908e-01, LG3 = 2.857142874366239149e-01
const LG4 = 2.222219843214978396e-01, LG5 = 1.818357216161805012e-01, LG6 = 1.531383769920937332e-01
const LG7 = 1.479819860511658591e-01

/** Deterministic natural logarithm. */
export function log(input: number): number {
  let x = input
  let hx = highWord(x)
  let k = 0
  if (hx < 0x00100000 || (hx >>> 31)) {
    if (x === 0) return Number.NEGATIVE_INFINITY
    if (hx >>> 31) return Number.NaN
    k -= 54
    x *= twoTo(54)
    hx = highWord(x)
  } else if (hx >= 0x7ff00000) {
    return x
  } else if (hx === 0x3ff00000 && lowWord(x) === 0) {
    return 0
  }
  hx += 0x3ff00000 - 0x3fe6a09e
  k += (hx >>> 20) - 0x3ff
  hx = (hx & 0x000fffff) + 0x3fe6a09e
  x = fromWords(hx, lowWord(x))
  const f = x - 1.0
  const hfsq = 0.5 * f * f
  const s = f / (2.0 + f)
  const z = s * s, w = z * z
  const t1 = w * (LG2 + w * (LG4 + w * LG6))
  const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)))
  const r = t2 + t1
  const dk = k
  return s * (hfsq + r) + dk * LN2LO - hfsq + f + dk * LN2HI
}

/**
 * Power x^y. Integer exponents up to 64 in magnitude use repeated squaring; others exp(y·log x)
 * (deterministic, not correctly rounded).
 */
export function pow(x: number, y: number): number {
  if (Number.isInteger(y) && Math.abs(y) <= 64) {
    let n = Math.abs(y), base = x, result = 1
    while (n > 0) { if (n & 1) result *= base; base *= base; n >>= 1 }
    return y < 0 ? 1 / result : result
  }
  if (x === 0) return y > 0 ? 0 : Number.POSITIVE_INFINITY
  if (x < 0) return Number.NaN
  return exp(y * log(x))
}

/** Square root; IEEE-754 rounds it exactly, so Math.sqrt is deterministic. */
export const sqrt = Math.sqrt
/** Euclidean norm √(x² + y²), built from IEEE-754 operations only. */
export function hypot(x: number, y: number): number { return Math.sqrt(x * x + y * y) }

/** π as a double. */
export const PI_VALUE = PI
/** One degree (rad). */
export const DEG = PI / 180
