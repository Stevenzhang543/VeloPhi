/** Reproducibility: the same scene gives bit-identical recordings; saving and loading changes nothing. */
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { TEMPLATES, buildTemplate } from '../src/templates'
import { exactStateAt, frameState, recordingStates, simulate } from '../src/core/solver/simulation'
import { parseScene, serializeScene } from '../src/core/scene/io'
import { Sha256 } from '../src/core/record/sha256'

describe('determinism', () => {
  it('SHA-256 implementation matches node:crypto', () => {
    for (const len of [0, 3, 55, 56, 63, 64, 65, 1000]) {
      const data = new Uint8Array(len).map((_, i) => (i * 37 + 11) & 255)
      expect(new Sha256().update(data).digestHex()).toBe(createHash('sha256').update(data).digest('hex'))
    }
  })
  for (const t of TEMPLATES) {
    it(`${t.id}: two runs are bit-identical; reload keeps the hash`, () => {
      const scene = buildTemplate(t.id)
      const a = simulate(scene), b = simulate(buildTemplate(t.id))
      expect(a.hash).toBe(b.hash)
      expect(Buffer.from(recordingStates(a).buffer).equals(Buffer.from(recordingStates(b).buffer))).toBe(true)
      const reloaded = parseScene(serializeScene(scene)).scene
      expect(serializeScene(reloaded)).toBe(serializeScene(scene))
      expect(simulate(reloaded).hash).toBe(a.hash)
    })
  }
  it('exactStateAt at a frame time returns the frame; between frames it is repeatable', () => {
    const rec = simulate(buildTemplate('board-block'))
    const k = 333
    expect(Array.from(exactStateAt(rec, k * rec.dt))).toEqual(Array.from(frameState(rec, k)))
    const t = 0.123456789
    expect(Array.from(exactStateAt(rec, t))).toEqual(Array.from(exactStateAt(rec, t)))
  })
  it('fixed-step integrators are deterministic too and close to the adaptive result', () => {
    for (const integrator of ['rk4', 'euler'] as const) {
      const s = buildTemplate('spring'); s.settings.integrator = integrator
      const a = simulate(s), b = simulate(JSON.parse(JSON.stringify(s)))
      expect(a.hash).toBe(b.hash)
    }
  })
})
