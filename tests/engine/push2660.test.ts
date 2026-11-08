/**
 * 26.60 r2: a spring the body is not fastened to (D208, "pushOnly") and the point mass without volume (D209), through
 * the scene file, the Copilot's builder and the readouts; and the surface formulas are not applied on curved tracks.
 */
import { describe, expect, it } from 'vitest'
import { simulate, frameState } from '../../src/engine/recording'
import { parseScene, serializeScene } from '../../src/core/scene/io'
import { emptyScene, addBody, addConnector } from '../../src/core/scene/build'
import type { Scene, SpringDef } from '../../src/core/scene/types'
import { buildTemplate } from '../../src/templates'
import { prepareAiScene } from '../../src/ai/copilot/simScene'
import { EngineSession } from '../../src/engine/session'
import { placePreset } from '../../src/app/editor/presets'

const SMOOTH = { muS: 0, muK: 0, restitution: 0 }

function launcher(pushOnly: boolean): Scene {
  const s = emptyScene('launcher')
  s.settings.gravity = { x: 0, y: -9.8 }
  addBody(s, { id: 'floor', name: 'floor', kind: 'static', role: 'ground', shape: { type: 'box', width: 20, height: 1 }, position: { x: 5, y: -0.5 }, material: SMOOTH })
  addBody(s, { id: 'block', name: 'block', shape: { type: 'box', width: 0.2, height: 0.2 }, position: { x: 0.4, y: 0.1 }, mass: 1, fixedRotation: true, material: SMOOTH })
  addConnector<SpringDef>(s, { id: 'sp', name: 'spring', type: 'spring', a: { body: null, local: { x: 0, y: 0.1 } }, b: { body: 'block', local: { x: -0.1, y: 0 } }, stiffness: 100, restLength: 0.5, damping: 0, ...(pushOnly ? { pushOnly: true } : {}) })
  s.settings.duration = 1
  return s
}

describe('a spring that only pushes (D208)', () => {
  it('lets the block go at its rest length with v = x√(k/m), and reads zero force after', () => {
    const s = launcher(true)
    expect(parseScene(serializeScene(s)).scene.connectors[0]).toMatchObject({ pushOnly: true })
    const rec = simulate(s)
    const rel = rec.events.find(e => e.changes.some(c => c.type === 'springRelease'))
    expect(rel).toBeTruthy()
    expect(rel!.t).toBeCloseTo(Math.PI / 20, 7)
    const n = rec.system.n
    const last = frameState(rec, rec.frameCount - 1)
    expect(last[3 * n]).toBeCloseTo(2, 7)
    const v = rec.session.call<{ values: Float64Array }>({ op: 'evaluate', t: 0.8, ids: ['sp.F', 'sp.x', 'system.es'] }).values
    expect(Array.from(v)).toEqual([0, 0, 0])
    const before = rec.session.call<{ values: Float64Array }>({ op: 'evaluate', t: 0, ids: ['sp.F', 'system.es'] }).values
    expect(before[0]).toBeCloseTo(-20, 9)
    expect(before[1]).toBeCloseTo(0.5 * 100 * 0.04, 9)
    rec.session.free()
  })

  it('the launcher preset releases its block at v = x√(k/m)', () => {
    const s = emptyScene('launcher')
    addBody(s, { id: 'floor', name: 'floor', kind: 'static', role: 'ground', shape: { type: 'box', width: 20, height: 1 }, position: { x: 5, y: -0.5 }, material: SMOOTH })
    const id = placePreset(s, 'add-launcher', { x: 0, y: 0 }, { foot: { x: 0, y: 0 }, n: { x: 0, y: 1 }, angle: 0 })!
    expect(s.connectors[0]).toMatchObject({ type: 'spring', pushOnly: true })
    s.settings.duration = 0.5
    const rec = simulate(s)
    const rel = rec.events.find(e => e.changes.some(c => c.type === 'springRelease'))
    expect(rel!.t).toBeCloseTo((Math.PI / 2) / Math.sqrt(200), 7)
    const v = rec.session.call<{ values: Float64Array }>({ op: 'evaluate', t: 0.4, ids: [`${id}.vx`] }).values[0]
    expect(v).toBeCloseTo(0.1 * Math.sqrt(200), 7)
    rec.session.free()
  })

  it('the builder reads "not fastened" and asks for the release', () => {
    const r = prepareAiScene({
      name: 'launcher', settings: { gravity: { x: 0, y: -9.8 } },
      bodies: [
        { id: 'floor', kind: 'static', shape: { type: 'box', width: 20, height: 1 }, position: [5, -0.5] },
        { id: 'block', mass: 1, fixedRotation: true, shape: { type: 'box', width: 0.2, height: 0.2 }, position: [0.4, 0.1] }
      ],
      connectors: [{ id: 'sp', type: 'spring', a: { body: null, local: [0, 0.1] }, b: { body: 'block', local: [-0.1, 0] }, k: 100, restLength: 0.5, attached: false }],
      questions: [{ prompt: '离开弹簧时的速度', target: { kind: 'atEvent', id: 'block.v', event: 'springRelease', side: 'after' }, unit: 'm/s' }]
    })
    if (!r.ok) throw new Error(r.errors.join('; '))
    expect(r.scene.connectors[0]).toMatchObject({ type: 'spring', pushOnly: true, stiffness: 100 })
    expect(r.questions[0].target).toMatchObject({ kind: 'atEvent', event: 'springRelease' })
  })
})

describe('a point mass without volume (D209)', () => {
  it('slides down a smooth incline with exactly g sin θ and is refused as a rigid body', () => {
    const r = prepareAiScene({
      name: 'point', settings: { gravity: { x: 0, y: -10 } },
      bodies: [
        { id: 'slope', kind: 'static', shape: { type: 'polygon', points: [[0, 0], [4, 0], [0, 4 * Math.tan(Math.PI / 6)]] }, position: [0, 0] },
        { id: 'p', kind: 'particle', mass: 1, shape: { type: 'circle', radius: 0 }, position: [0.5, 3.5 * Math.tan(Math.PI / 6)] }
      ]
    })
    if (!r.ok) throw new Error(r.errors.join('; '))
    const s = EngineSession.simulate(r.scene, { duration: 0.6 })
    try {
      const a = s.call<{ values: Float64Array }>({ op: 'evaluate', t: 0.3, ids: ['p.a'] }).values[0]
      expect(a).toBeCloseTo(10 * 0.5, 7)
    } finally { s.free() }
    const bad = prepareAiScene({ bodies: [{ id: 'q', kind: 'rigid', mass: 1, shape: { type: 'circle', radius: 0 }, position: [0, 1] }] })
    expect(bad.ok).toBe(false)
  })
})

describe('curved tracks (26.60 r2)', () => {
  it('a ball in the vertical loop gets no flat-surface formula cards', () => {
    const rec = simulate(buildTemplate('vertical-loop'))
    const types = rec.session.call<{ situations: Array<{ type: string }> }>({ op: 'situations' })
    expect(JSON.stringify(types)).not.toMatch(/"flat"|"incline"/)
    rec.session.free()
  })
})
