/**
 * 26.61 phase D: the Research Preview case Q08 (src/research/q08.ts). The three finest grids agree with the closed
 * form within 1e-10, the norm is kept, a too small periodic box shows its error (the sensitivity is real, not hidden),
 * and the package carries what another environment needs to recompute it. With VELOPHI_RESEARCH_OUT=<file> the
 * package is written there (the recompute command of docs/research/Q08_FREE_GAUSSIAN.md).
 */
import { describe, expect, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { Q08_TOL, RESEARCH_FORMAT, researchQ08 } from '../src/research/q08'

describe('Research Preview Q08 (26.61 D)', () => {
  it('agrees with the independent reference at three resolutions; the box size matters below 32 nm', () => {
    const pkg = researchQ08({ host: 'vitest', platform: process.platform, node: process.version })
    expect(pkg.format).toBe(RESEARCH_FORMAT)
    expect(pkg.resolutions.length).toBeGreaterThanOrEqual(3)
    for (const r of pkg.resolutions.slice(-3)) {
      expect(r.errX, `n = ${r.n}`).toBeLessThanOrEqual(Q08_TOL)
      expect(r.errS, `n = ${r.n}`).toBeLessThanOrEqual(Q08_TOL)
      expect(r.errNorm, `n = ${r.n}`).toBeLessThanOrEqual(Q08_TOL)
    }
    expect(pkg.verdict.pass).toBe(true)
    // The coarsest grid does not resolve the packet: its error is visible
    expect(Math.max(pkg.resolutions[0].errX, pkg.resolutions[0].errS)).toBeGreaterThan(1e-6)
    // Domain: the smallest box wraps the tails (error far above the tolerance), the larger ones agree
    const [small, ...rest] = pkg.domain
    expect(Math.max(small.errX, small.errS)).toBeGreaterThan(1e-6)
    for (const d of rest) expect(Math.max(d.errX, d.errS), `L = ${d.L}`).toBeLessThanOrEqual(Q08_TOL)
    // Self-convergence of the time step is second order (Strang splitting)
    const orders = pkg.selfConvergence.rows.map(r => r.order).filter((o): o is number => o !== null)
    for (const o of orders) expect(Math.abs(o - 2)).toBeLessThan(0.2)
    expect(pkg.recompute.join('\n')).toContain('tests/research2661.test.ts')
    const out = process.env.VELOPHI_RESEARCH_OUT
    if (out) writeFileSync(out, JSON.stringify(pkg, null, 1))
  })
})
