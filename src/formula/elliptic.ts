/**
 * Complete elliptic integral of the first kind K(k) = ∫₀^{π/2} dφ / √(1 − k² sin²φ), modulus k (|k| < 1),
 * by the arithmetic–geometric mean: K = π / (2·AGM(1, √(1 − k²))). Converges quadratically; ~5 iterations
 * reach double precision for the amplitudes of teaching problems.
 */
import { PI_VALUE } from '../core/math/dmath'

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
