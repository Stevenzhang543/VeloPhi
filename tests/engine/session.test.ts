import { describe, expect, it } from 'vitest'
import { TEMPLATES, buildTemplate } from '../../src/templates'
import { simulate, frameState } from '../../src/engine/recording'
import { EngineSession } from '../../src/engine/session'

describe('engine session', () => {
  it('simulates a template and reads views', () => {
    const t = TEMPLATES[0]
    const rec = simulate(buildTemplate(t.id))
    expect(rec.frameCount).toBeGreaterThan(10)
    expect(rec.hash.length).toBe(64)
    expect(rec.system.model.bodies.length).toBeGreaterThan(0)
    const X = frameState(rec, 5)
    expect(X.length).toBe(rec.size)
    const v = rec.session.call<{ poses: Float64Array; forces: unknown[] }>({ op: 'frameView', t: 0.5, forces: 'all' })
    expect(v.poses.length).toBe(8 * rec.system.model.bodies.length)
    expect(v.forces.length).toBe(rec.system.model.dynamic.length)
    const sits = rec.session.call<{ situations: unknown[] }>({ op: 'situations' })
    expect(Array.isArray(sits.situations)).toBe(true)
    rec.session.free()
  })
  it('scene session for the editor', () => {
    const s = EngineSession.create(buildTemplate(TEMPLATES[1].id))
    expect(s.frameCount).toBe(0)
    const v = s.call<{ poses: Float64Array }>({ op: 'frameView', t: 0 })
    expect(v.poses.length).toBe(8 * s.system.model.bodies.length)
    s.free()
  })
})
