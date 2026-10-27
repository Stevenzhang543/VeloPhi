/**
 * Elliptic integrals of the first kind, built only from IEEE-754 arithmetic and square roots (plus the
 * deterministic sine of dmath), so they give the same bits in every engine.
 *   K(k) = ∫₀^{π/2} dφ / √(1 − k² sin²φ)   complete, by the arithmetic–geometric mean;
 *   F(φ, k) = ∫₀^{φ} dψ / √(1 − k² sin²ψ)   incomplete, by Carlson's symmetric integral R_F.
 * k is the modulus. F also accepts k > 1 as long as k·sin φ ≤ 1 (needed for the slack point of a rope in
 * vertical circular motion).
 */
import { PI_VALUE, cos, sin } from '../../../src/core/math/dmath'

/** Complete integral K(k) by the AGM: K = π / (2·AGM(1, √(1 − k²))). Converges quadratically. */
export function ellipticK(k: number): number {
  if (!(Math.abs(k) < 1)) return Number.POSITIVE_INFINITY
  let a = 1, b = Math.sqrt(1 - k * k)
  for (let i = 0; i < 40 && Math.abs(a - b) > 1e-16 * a; i++) {
    const an = 0.5 * (a + b)
    b = Math.sqrt(a * b)
    a = an
  }
  return PI_VALUE / (2 * a)
}

/**
 * Carlson's R_F(x, y, z) = ½∫₀^∞ dt / √((t+x)(t+y)(t+z)) for x, y, z ≥ 0 (at most one zero), by the
 * duplication theorem with a fifth-order series at the end (relative error below 1e-16).
 */
export function carlsonRF(x0: number, y0: number, z0: number): number {
  if (!(x0 >= 0 && y0 >= 0 && z0 >= 0)) return Number.NaN
  let x = x0, y = y0, z = z0
  let ave = (x + y + z) / 3
  let dx = 0, dy = 0, dz = 0
  for (let i = 0; i < 200; i++) {
    const sx = Math.sqrt(x), sy = Math.sqrt(y), sz = Math.sqrt(z)
    const lam = sx * (sy + sz) + sy * sz
    x = 0.25 * (x + lam); y = 0.25 * (y + lam); z = 0.25 * (z + lam)
    ave = (x + y + z) / 3
    dx = (ave - x) / ave; dy = (ave - y) / ave; dz = (ave - z) / ave
    if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) <= 0.0025) break
  }
  const e2 = dx * dy - dz * dz, e3 = dx * dy * dz
  return (1 + (e2 / 24 - 0.1 - (3 / 44) * e3) * e2 + e3 / 14) / Math.sqrt(ave)
}

/** Incomplete integral F(φ, k) for any real φ (periodic extension F(φ + nπ) = F(φ) + 2nK). */
export function ellipticF(phi: number, k: number): number {
  if (!Number.isFinite(phi) || !Number.isFinite(k)) return Number.NaN
  const n = Math.round(phi / PI_VALUE)
  const r = phi - n * PI_VALUE
  const s = sin(r), c = cos(r)
  const q = 1 - k * k * s * s
  const part = s * carlsonRF(c * c, q < 0 && q > -1e-15 ? 0 : q, 1)
  if (n === 0) return part
  return 2 * n * carlsonRF(0, 1 - k * k, 1) + part
}
