// 26.59 fix 3 (D193–D195): arc tracks — scene format, Rust-only marking, templates against the textbook results,
// preset parts and the drawing loops.
import { describe, expect, it } from 'vitest'
import { TEMPLATES, buildTemplate, referenceTemplates } from '../../src/templates'
import { simulate, frameState } from '../../src/engine/recording'
import { parseScene, serializeScene } from '../../src/core/scene/io'
import { sceneVersionOf, usesArcs, SCENE_VERSION_ARCS } from '../../src/core/scene/types'
import { arcCentroid, arcDeg, centeredArc, placeArc } from '../../src/core/scene/arc'
import { compoundMass, shapeOutline } from '../../src/engine/calc'
import { arcLoops } from '../../src/engine/model'
import { emptyScene, addBody } from '../../src/core/scene/build'
import { placePreset, PRESET_TOOLS, MATERIALS, materialPreset } from '../../src/app/editor/presets'
import { bodyBounds } from '../../src/app/editor/geometry'
import { compileSceneSpec } from '../../src/ai/import/sceneSpec'
import { structureOf, templateStructure } from '../../src/ai/import/catalog'

const ARC_TEMPLATES = ['arc-slide', 'vertical-loop', 'hump-bridge', 'groove-momentum', 'hoop-disc']

describe('arc tracks (26.59 fix 3)', () => {
  it('templates with arcs are Rust-only scenes written as format 9 and survive a save', () => {
    const ref = new Set(referenceTemplates().map(t => t.id))
    for (const id of ARC_TEMPLATES) {
      expect(TEMPLATES.some(t => t.id === id)).toBe(true)
      const s = buildTemplate(id)
      expect(usesArcs(s)).toBe(true)
      expect(ref.has(id)).toBe(false)
      expect(sceneVersionOf(s)).toBe(SCENE_VERSION_ARCS)
      const back = parseScene(serializeScene(s))
      expect(back.warnings).toEqual([])
      expect(back.scene.bodies.map(b => b.shape)).toEqual(s.bodies.map(b => b.shape))
    }
  })

  it('runs are bit-identical and a reloaded scene keeps the fingerprint (Rust core)', () => {
    for (const id of ARC_TEMPLATES) {
      const a = simulate(buildTemplate(id)), b = simulate(parseScene(serializeScene(buildTemplate(id))).scene)
      expect(a.hash, id).toBe(b.hash)
      expect(a.hash.length).toBe(64)
      a.session.free(); b.session.free()
    }
  })

  it('rejects an arc without size', () => {
    const s = emptyScene('x')
    addBody(s, { name: 'a', kind: 'static', shape: { type: 'arc', radius: 1, thickness: 0, start: 0, sweep: 1 }, position: { x: 0, y: 0 } })
    expect(() => parseScene(serializeScene(s))).toThrow()
  })

  it('centroid and centring agree with the core', () => {
    const shape = arcDeg(0.5, 0.1, 180, 180)
    const { c } = arcCentroid(shape)
    const core = compoundMass(shape, 1)
    expect(core.centroid.x).toBeCloseTo(c.x, 12)
    expect(core.centroid.y).toBeCloseTo(c.y, 12)
    expect(core.area).toBeCloseTo((Math.PI / 2) * (0.6 * 0.6 - 0.25), 12)
    const centred = centeredArc(shape)
    expect(compoundMass(centred, 1).centroid.y).toBeCloseTo(0, 12)
    // A static arc made dynamic stays where it is
    const s = emptyScene('x')
    const b = addBody(s, { name: 'g', kind: 'static', shape, position: { x: 1, y: 2 } })
    b.kind = 'rigid'
    placeArc(b)
    expect(b.position.y).toBeCloseTo(2 + c.y, 12)
    expect(b.shape.type === 'arc' && b.shape.center!.y).toBeCloseTo(-c.y, 12)
  })

  it('a ball slides down the smooth quarter arc with v = √(2g(R − r))', () => {
    const rec = simulate(buildTemplate('arc-slide', { R: 0.8, m: 0.2, g: 9.8 }))
    expect(rec.error).toBeNull()
    let best = { y: Infinity, v: 0 }
    const n = rec.system.n
    for (let k = 0; k < rec.frameCount; k++) {
      const X = frameState(rec, k)
      if (X[1] < best.y && X[0] < 0) best = { y: X[1], v: Math.hypot(X[3 * n], X[3 * n + 1]) }
    }
    const rho = 0.8 - 0.03
    expect(best.v).toBeGreaterThan(Math.sqrt(2 * 9.8 * rho) * 0.995)
    expect(best.v).toBeLessThanOrEqual(Math.sqrt(2 * 9.8 * rho) + 1e-6)
    // On the floor afterwards the speed is exactly √(2gρ)
    const last = frameState(rec, rec.frameCount - 1)
    expect(Math.hypot(last[3 * n], last[3 * n + 1])).toBeCloseTo(Math.sqrt(2 * 9.8 * rho), 6)
    rec.session.free()
  })

  it('the vertical loop: fast enough goes round, too slow leaves the wall', () => {
    const fast = simulate(buildTemplate('vertical-loop', { R: 0.5, v0: 5, m: 0.1, g: 9.8 }))
    expect(fast.events.some(e => e.changes.some(c => c.type === 'separate'))).toBe(false)
    fast.session.free()
    const slow = simulate(buildTemplate('vertical-loop', { R: 0.5, v0: 4, m: 0.1, g: 9.8 }))
    const sep = slow.events.find(e => e.changes.some(c => c.type === 'separate'))
    expect(sep).toBeTruthy()
    // cos φ = (2gρ − v₀²)/(3gρ), φ from the bottom
    const rho = 0.5 - 0.03, X = frameState(slow, Math.round(sep!.t / slow.dt))
    const cosPhi = -(X[1] - 0.5) / Math.hypot(X[0], X[1] - 0.5)
    expect(cosPhi).toBeCloseTo((2 * 9.8 * rho - 16) / (3 * 9.8 * rho), 2)
    slow.session.free()
  })

  it('the movable groove keeps horizontal momentum and the hoop loses to the disc', () => {
    const rec = simulate(buildTemplate('groove-momentum', { R: 0.5, M: 2, m: 0.5, g: 9.8 }))
    const n = rec.system.n
    for (let k = 0; k < rec.frameCount; k += 7) {
      const X = frameState(rec, k)
      expect(Math.abs(2 * X[3 * n] + 0.5 * X[3 * n + 3])).toBeLessThan(1e-7)
    }
    rec.session.free()
    const race = simulate(buildTemplate('hoop-disc', { theta: 30, mu: 0.5, g: 9.8 }))
    const m = race.system.n
    // At 0.5 s both still roll on the incline: a = ⅔g sinθ for the disc, g sinθ/(1 + I/mr²) for the hoop
    const X = frameState(race, Math.round(0.5 / race.dt))
    const dv = race.system.model.dynamic.map(b => b.id)
    const v = (id: string) => { const i = dv.indexOf(id); return Math.hypot(X[3 * m + 3 * i], X[3 * m + 3 * i + 1]) }
    const g = 9.8 * 0.5, ri = 0.15 - 0.012, ro = 0.15
    expect(v('disc')).toBeCloseTo((2 / 3) * g * 0.5, 3)
    expect(v('hoop')).toBeCloseTo((g / (1 + (ri * ri + ro * ro) / (2 * ro * ro))) * 0.5, 3)
    race.session.free()
  })

  it('preset parts are placed with finite bounds and run', () => {
    for (const tool of PRESET_TOOLS) {
      const s = emptyScene('p')
      const id = placePreset(s, tool, { x: 1, y: 2 }, null)
      expect(id).toBeTruthy()
      const b = s.bodies.find(x => x.id === id)!
      const bb = bodyBounds(b)
      expect(Number.isFinite(bb.minX + bb.maxX + bb.minY + bb.maxY)).toBe(true)
      const back = parseScene(serializeScene(s))
      expect(back.scene.bodies.length).toBe(s.bodies.length)
      s.settings.legacyDuration = 0.2
      const rec = simulate(s)
      expect(rec.error).toBeNull()
      expect(rec.warnings.filter(w => w.key === 'warn.arcCentred' || w.key === 'warn.compoundCentred')).toEqual([])
      rec.session.free()
    }
    expect(materialPreset(MATERIALS[2].m)).toBe(MATERIALS[2].id)
  })

  it('arcs are drawn as polygon loops (a ring as outer loop and hole)', () => {
    const ring = arcLoops({ kind: 'arc', center: { x: 0, y: 0 }, rIn: 1, rOut: 1.1, start: 0, sweep: 2 * Math.PI })
    expect(ring.length).toBe(2)
    const open = shapeOutline(arcDeg(1, 0.1, 180, 90), false)
    expect(open.length).toBe(1)
    expect(open[0].kind).toBe('polygon')
    const v = (open[0] as { verts: Array<{ x: number; y: number }> }).verts
    expect(Math.min(...v.map(p => p.y))).toBeCloseTo(-1.1, 9)
  })

  it('AI scenes can describe arc tracks, grooves and hoops; the structure counts them', () => {
    const scene = compileSceneSpec({
      surfaces: [{ type: 'ground', id: 'floor', top: 0, left: -3, right: 6 }, { type: 'arc', id: 'track', center: [0, 1], radius: 1, startDeg: 180, sweepDeg: 90, side: 'inside' }],
      bodies: [
        { id: 'ball', shape: 'ball', radius: 0.05, mass: 0.2, on: { surface: 'track', angleDeg: 180 } },
        { id: 'g', shape: 'groove', radius: 0.4, mass: 2, on: { surface: 'floor', x: 3 }, fixedRotation: true },
        { id: 'h', shape: 'hoop', radius: 0.2, mass: 1, on: { surface: 'floor', x: -2 } }
      ],
      duration: 1.2
    })
    const ball = scene.bodies.find(b => b.id === 'ball')!
    expect(ball.position.x).toBeCloseTo(-0.95, 12)
    expect(ball.position.y).toBeCloseTo(1, 12)
    expect(structureOf(scene).arcs).toBe(3)
    expect(templateStructure('vertical-loop')!.arcs).toBe(1)
    const rec = simulate(scene)
    expect(rec.error).toBeNull()
    // The groove stands on the floor: its lowest outer point is at y = 0
    const n = rec.system.n, dyn = rec.system.model.dynamic.map(b => b.id), gi = dyn.indexOf('g')
    const X = frameState(rec, 3)
    expect(X[3 * gi + 1] - (0.5 - 0)).toBeLessThan(0.1)
    expect(Math.abs(X[3 * n + 3 * gi + 1])).toBeLessThan(1e-6)
    rec.session.free()
  })
})
