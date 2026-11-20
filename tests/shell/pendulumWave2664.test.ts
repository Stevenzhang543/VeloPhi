/**
 * 26.64 (D257): the pendulum wave behind the home page is solved by the core, not drawn from a formula. This test
 * solves the wave exactly as the page does (app/decor/pendulumWave.ts: one tiny scene per pendulum, `sessionSimulate`,
 * the `series` of the bob) and compares what comes back with closed forms:
 *
 *   - lengths: L_k = g (Γ / (2π (N₀ + k)))², the pendulum-wave ratio L_k / L_0 = (N₀ / (N₀ + k))²;
 *   - the rod keeps its length: |r_k(t)| = L_k (tolerance 2·10⁻⁶ relative — the positions are stored as float32);
 *   - period of each pendulum against the exact large-angle period T = 4 √(L/g) K(sin(θ₀/2)), K by the
 *     arithmetic–geometric mean (tolerance 2·10⁻⁵ relative: zero crossings are located by linear interpolation
 *     between frames 1/30 s apart, averaged over more than twenty periods);
 *   - the pattern repeats at Γ · (2/π) K(sin(θ₀/2)) — the same factor for every pendulum, which is why the loop is
 *     exact — and the loop frame the page uses is that time to within one stored frame.
 */
import { describe, expect, it } from 'vitest'
import { WAVE, WAVE_DURATION, findLoopFrame, pendulumScene, solveWave, waveAt, waveLength } from '../../src/app/decor/pendulumWave'

/** Complete elliptic integral of the first kind, K(k) = π / (2 AGM(1, √(1 − k²))). */
function ellipticK(k: number): number {
  let a = 1, b = Math.sqrt(1 - k * k)
  for (let i = 0; i < 40 && Math.abs(a - b) > 1e-16; i++) { const m = (a + b) / 2; b = Math.sqrt(a * b); a = m }
  return Math.PI / (2 * a)
}
/** T(θ₀) / T(small angle). */
const stretch = (2 / Math.PI) * ellipticK(Math.sin(WAVE.release / 2))

const wave = solveWave()

describe('pendulum wave (26.64, D257)', () => {
  it('the apparatus: fifteen pendulums in the pendulum-wave ratio', () => {
    expect(wave.tracks.length).toBe(15)
    for (let k = 0; k < WAVE.count; k++) {
      expect(waveLength(k) / waveLength(0)).toBeCloseTo((WAVE.first / (WAVE.first + k)) ** 2, 14)
      // small-angle period Γ / (N₀ + k)
      expect(2 * Math.PI * Math.sqrt(waveLength(k) / WAVE.gravity)).toBeCloseTo(WAVE.cycle / (WAVE.first + k), 12)
    }
    const s = pendulumScene(3)
    expect(s.bodies.length).toBe(1); expect(s.connectors.length).toBe(1); expect(s.connectors[0].type).toBe('rod')
    expect(s.bodies[0].velocity).toEqual({ x: 0, y: 0 })
    expect(Math.atan2(s.bodies[0].position.x, -s.bodies[0].position.y)).toBeCloseTo(WAVE.release, 12)
  })

  it('the core returns the whole run, and the rod keeps its length', () => {
    expect(wave.frames).toBe(Math.round(WAVE_DURATION / WAVE.step) + 1)
    for (let k = 0; k < WAVE.count; k++) {
      const t = wave.tracks[k], L = wave.lengths[k]
      let worst = 0
      for (let f = 0; f < wave.frames; f++) worst = Math.max(worst, Math.abs(Math.hypot(t[2 * f], t[2 * f + 1]) - L) / L)
      expect(worst, `pendulum ${k}`).toBeLessThan(2e-6)
      // released at +θ₀, it never swings beyond ±θ₀
      let maxX = 0
      for (let f = 0; f < wave.frames; f++) maxX = Math.max(maxX, Math.abs(t[2 * f]))
      expect(maxX / (L * Math.sin(WAVE.release))).toBeLessThan(1 + 2e-6)
    }
  })

  it('each pendulum has the exact large-angle period', () => {
    for (let k = 0; k < WAVE.count; k++) {
      const t = wave.tracks[k]
      // times of the downward zero crossings of x (one per period)
      const zeros: number[] = []
      for (let f = 1; f < wave.frames; f++) {
        const a = t[2 * (f - 1)], b = t[2 * f]
        if (a > 0 && b <= 0) zeros.push((f - 1 + a / (a - b)) * wave.step)
      }
      expect(zeros.length).toBeGreaterThan(20)
      const measured = (zeros[zeros.length - 1] - zeros[0]) / (zeros.length - 1)
      const exact = (WAVE.cycle / (WAVE.first + k)) * stretch
      expect(Math.abs(measured - exact) / exact, `pendulum ${k}: ${measured} s against ${exact} s`).toBeLessThan(2e-5)
    }
  })

  it('the pattern repeats where the closed form says, and the loop closes on itself', () => {
    const exact = WAVE.cycle * stretch
    expect(stretch).toBeGreaterThan(1); expect(stretch).toBeLessThan(1.002)
    expect(wave.loopFrame).toBe(findLoopFrame(wave.tracks, wave.step))
    expect(Math.abs(wave.loopFrame * wave.step - exact)).toBeLessThanOrEqual(wave.step)
    // at the loop frame every bob is back at its release point: within the distance it moves in one frame from rest
    for (let k = 0; k < WAVE.count; k++) {
      const t = wave.tracks[k], f = wave.loopFrame
      const d = Math.hypot(t[2 * f] - t[0], t[2 * f + 1] - t[1])
      const perFrame = 0.5 * WAVE.gravity * Math.sin(WAVE.release) * wave.step * wave.step
      expect(d, `pendulum ${k}`).toBeLessThan(2 * perFrame)
    }
  })

  it('the page reads positions between frames, and across the seam, without a jump', () => {
    const p: [number, number] = [0, 0]
    for (let k = 0; k < WAVE.count; k++) {
      const t = wave.tracks[k]
      expect(waveAt(wave, k, 0)).toEqual([t[0], t[1]])
      // halfway between frames 10 and 11
      waveAt(wave, k, 10.5 * wave.step, p)
      expect(p[0]).toBeCloseTo((t[20] + t[22]) / 2, 6)
      expect(p[1]).toBeCloseTo((t[21] + t[23]) / 2, 6)
      // one loop later is the same place; just before the seam is next to the start
      const span = wave.loopFrame * wave.step
      expect(waveAt(wave, k, span + 3.25)).toEqual(waveAt(wave, k, 3.25))
      const before = waveAt(wave, k, span - 1e-4), start = waveAt(wave, k, 0)
      expect(Math.hypot(before[0] - start[0], before[1] - start[1])).toBeLessThan(1e-3 * wave.lengths[k])
    }
  })
})
