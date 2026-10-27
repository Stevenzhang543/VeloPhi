/**
 * Concave and compound bodies (26.52, D35): mass properties, contact geometry (signed distance, features, contact units
 * along several normals), whole runs that settle without penetration, file round trips and chunk rebuilds.
 */
import { describe, expect, it } from 'vitest'
import { addBody, addGround, emptyScene } from '../src/core/scene/build'
import type { Scene, ShapeDef } from '../src/core/scene/types'
import { compileModel, polygonIsConvex, polygonIsSimple } from './reference/core/solver/model'
import { computePoses, pairFeatures, signedDistance } from './reference/core/solver/kinematics'
import { buildSystem, initialState } from './reference/core/solver/dynamics'
import { SimulationRun, frameLedger, frameState, rebuildChunk, simulate } from './reference/core/solver/simulation'
import { parseScene, serializeScene, SceneFileError } from '../src/core/scene/io'

const L_SHAPE = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 0, y: 2 }]
/** The L shape about its centroid (5/6, 5/6). */
const L_CENTRED = L_SHAPE.map(p => ({ x: p.x - 5 / 6, y: p.y - 5 / 6 }))

function base(name: string, duration: number): Scene {
  const s = emptyScene(name)
  s.settings.gravity = { x: 0, y: -9.8 }
  s.settings.duration = duration
  return s
}

describe('polygon checks', () => {
  it('tells convex, concave and self-intersecting polygons apart', () => {
    expect(polygonIsConvex([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }])).toBe(true)
    expect(polygonIsConvex(L_SHAPE)).toBe(false)
    expect(polygonIsSimple(L_SHAPE)).toBe(true)
    expect(polygonIsSimple([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 1 }])).toBe(false)
    expect(polygonIsSimple([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }])).toBe(false)
  })

  it('a self-intersecting polygon is rejected when the scene is loaded', () => {
    const s = base('bow', 1)
    addBody(s, { id: 'b', name: '领结', shape: { type: 'polygon', points: [{ x: -1, y: -1 }, { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }] }, position: { x: 0, y: 2 }, mass: 1 })
    expect(() => parseScene(serializeScene(s))).toThrow(SceneFileError)
  })
})

describe('mass properties', () => {
  it('a concave L: area centroid and moment of inertia as the sum of its two rectangles', () => {
    const s = base('L', 1)
    addBody(s, { id: 'L', name: 'L', shape: { type: 'polygon', points: L_CENTRED }, position: { x: 0, y: 3 }, mass: 3 })
    const m = compileModel(s)
    const b = m.dynamic[0]
    expect(b.shape.kind).toBe('complex')
    expect(b.inertia).toBeCloseTo(11 / 6, 12)
    expect(m.warnings).toEqual([])
  })

  it('a compound: parts placed and rotated, centre of mass and inertia by the parallel-axis theorem', () => {
    const shape: ShapeDef = {
      type: 'compound',
      parts: [
        { shape: { type: 'box', width: 2, height: 1 }, position: { x: 1, y: 0.5 }, angle: 0 },
        { shape: { type: 'box', width: 2, height: 1 }, position: { x: 0.5, y: 1 }, angle: Math.PI / 2 }
      ]
    }
    const s = base('C', 1)
    addBody(s, { id: 'C', name: 'C', kind: 'static', shape, position: { x: 0, y: 0 } })
    addBody(s, { id: 'D', name: 'D', shape, position: { x: 5, y: 5 }, mass: 4 })
    const m = compileModel(s)
    // Two 2×1 boxes overlapping in the unit square [0,1]²: centroid of the two box centres, overlap counted twice
    const dyn = m.dynamic[0]
    const I = 2 * (2 * 5 / 12 + 2 * (0.25 * 0.25 + 0.25 * 0.25))
    expect(dyn.inertia).toBeCloseTo(I, 12)
    expect(m.warnings.some(w => w.key === 'warn.compoundCentred')).toBe(true)
    // Static: centre of attraction at the area centroid (0.75, 0.75)
    expect(m.bodies[0].gravPos.x).toBeCloseTo(0.75, 12)
    expect(m.bodies[0].gravPos.y).toBeCloseTo(0.75, 12)
  })
})

describe('contact geometry', () => {
  it('signed distance to a concave polygon: the notch is outside the body, the reflex corner is no point feature', () => {
    const s = base('sd', 1)
    addBody(s, { id: 'L', name: 'L', kind: 'static', shape: { type: 'polygon', points: L_SHAPE }, position: { x: 0, y: 0 } })
    addBody(s, { id: 'p', name: 'p', shape: { type: 'circle', radius: 0.1 }, position: { x: 5, y: 5 }, mass: 1 })
    const m = compileModel(s)
    const sys = buildSystem(m)
    const poses = computePoses(m, initialState(sys))
    const L = m.bodies[0]
    expect(signedDistance(L, poses[0], 1.5, 1.5)).toBeCloseTo(0.5, 12) // the notch corner (1, 1) is the nearest point
    // Inside: negative (the depth inside one convex piece; exact signed distances are only needed outside)
    expect(signedDistance(L, poses[0], 0.5, 0.5)).toBeLessThanOrEqual(0)
    expect(signedDistance(L, poses[0], 1.5, 0.9)).toBeLessThan(0)
    expect(signedDistance(L, poses[0], 0.4, 1.7)).toBeLessThan(0)
    expect(signedDistance(L, poses[0], 2.5, 0.5)).toBeCloseTo(0.5, 12)
    // Point features: the reflex corner (1, 1) is not one of them
    const f = pairFeatures(m.bodies[1], L)
    expect(f.length).toBeGreaterThan(0)
    expect(L.shape.kind === 'complex' && L.shape.points.some(p => p.local.x === 1 && p.local.y === 1)).toBe(false)
  })
})

describe('runs', () => {
  it('an L-shaped block falls and comes to rest on its long side without penetrating', () => {
    const s = base('L-drop', 2)
    addGround(s, { id: 'g', top: 0, material: { muS: 0.6, muK: 0.5, restitution: 0 } })
    addBody(s, { id: 'L', name: 'L', shape: { type: 'polygon', points: L_CENTRED }, position: { x: 0, y: 5 / 6 + 0.3 }, mass: 3, material: { muS: 0.6, muK: 0.5, restitution: 0 } })
    const rec = simulate(s)
    expect(rec.error).toBeNull()
    const X = frameState(rec, rec.frameCount - 1)
    expect(X[1]).toBeCloseTo(5 / 6, 7)
    expect(Math.abs(X[2])).toBeLessThan(1e-7)
    const L0 = frameLedger(rec, 0), L1 = frameLedger(rec, rec.frameCount - 1)
    expect(Math.abs(L1.balance - L0.balance) / Math.abs(L0.gravity)).toBeLessThan(1e-7)
  })

  it('a ball in a V-notch rests on both faces: two contact units of one pair', () => {
    const s = base('V', 2)
    // A static block with a 90° V-notch, vertex at the origin
    const notch = [{ x: -2, y: -1 }, { x: 2, y: -1 }, { x: 2, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 0 }, { x: -1, y: 1 }, { x: -2, y: 1 }]
    addBody(s, { id: 'V', name: 'V', kind: 'static', shape: { type: 'polygon', points: notch }, position: { x: 0, y: 0 }, material: { muS: 0.5, muK: 0.4, restitution: 0 } })
    const r = 0.2
    addBody(s, { id: 'ball', name: '球', shape: { type: 'circle', radius: r }, position: { x: 0.05, y: r * Math.SQRT2 + 0.2 }, mass: 1, material: { muS: 0.5, muK: 0.4, restitution: 0 } })
    const rec = simulate(s)
    expect(rec.error).toBeNull()
    const X = frameState(rec, rec.frameCount - 1)
    expect(X[0]).toBeCloseTo(0, 6)
    expect(X[1]).toBeCloseTo(r * Math.SQRT2, 6)
    const last = rec.segments[rec.segments.length - 1]
    expect(last.mode.units.filter(u => u.points.length > 0).length).toBe(2)
  })

  it('a compound dumbbell lands on both balls', () => {
    const s = base('dumbbell', 2)
    addGround(s, { id: 'g', top: 0, material: { muS: 0.5, muK: 0.4, restitution: 0 } })
    const shape: ShapeDef = {
      type: 'compound',
      parts: [
        { shape: { type: 'circle', radius: 0.15 }, position: { x: -0.5, y: 0 }, angle: 0 },
        { shape: { type: 'box', width: 1, height: 0.06 }, position: { x: 0, y: 0 }, angle: 0 },
        { shape: { type: 'circle', radius: 0.15 }, position: { x: 0.5, y: 0 }, angle: 0 }
      ]
    }
    addBody(s, { id: 'd', name: '哑铃', shape, position: { x: 0, y: 0.5 }, angle: 0.2, mass: 2, material: { muS: 0.5, muK: 0.4, restitution: 0 } })
    const rec = simulate(s)
    expect(rec.error).toBeNull()
    const X = frameState(rec, rec.frameCount - 1)
    expect(X[1]).toBeCloseTo(0.15, 6)
    expect(Math.abs(Math.sin(X[2]))).toBeLessThan(1e-6)
  })

  it('round-trips a compound through the scene file and rebuilds its chunks bit for bit', () => {
    const s = base('rt', 1.5)
    addGround(s, { id: 'g', top: 0 })
    const shape: ShapeDef = { type: 'compound', parts: [{ shape: { type: 'polygon', points: L_CENTRED }, position: { x: 0, y: 0 }, angle: 0.3 }, { shape: { type: 'circle', radius: 0.3 }, position: { x: 1, y: 0.2 }, angle: 0 }] }
    addBody(s, { id: 'c', name: 'c', shape, position: { x: 0, y: 2 }, mass: 1, angularVelocity: 2 })
    const back = parseScene(serializeScene(s)).scene
    expect(back.bodies[1].shape).toEqual(shape)
    const run = new SimulationRun(back, { duration: 1.5, chunkSeconds: 0.5 })
    run.advance(Infinity)
    const rec = run.result()
    for (let c = 0; c < run.checkpoints.length; c++) {
      const end = Math.min((c + 1) * run.chunkFrames, rec.frameCount - 1)
      const again = rebuildChunk(back, rec.system, run.checkpoints[c]!, { duration: 1.5, chunkSeconds: 0.5 }, end)
      const orig = run.frames.chunks[c]!
      expect(again.chunk.states.subarray(0, orig.count * rec.size)).toEqual(orig.states.subarray(0, orig.count * rec.size))
    }
  })
})
