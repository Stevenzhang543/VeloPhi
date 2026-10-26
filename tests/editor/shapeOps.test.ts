/**
 * 26.52 shape operations (D35): cutting polygons along a line (convex and concave), cutting bodies (mass by area,
 * rigid velocities, anchors handed over), combining bodies into a compound and splitting it again, and object
 * snapping with concave and compound outlines.
 */
import { describe, expect, it } from 'vitest'
import { addBody, addConnector, addGround, emptyScene } from '../../src/core/scene/build'
import type { BodyDef, RopeDef } from '../../src/core/scene/types'
import { combineBodies, cutBodies, explodeCompound, splitPolygonByLine } from '../../src/app/editor/shapeOps'
import { signedArea, worldVerts } from '../../src/app/editor/geometry'
import { outlinesOf, shifted, snapBodyMove } from '../../src/app/editor/objectSnap'

const area = (p: Array<{ x: number; y: number }>) => Math.abs(signedArea(p))
const SQUARE = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]
/** A U shape open at the top: two arms of width 1 on a base of height 1. */
const U = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }, { x: 2, y: 3 }, { x: 2, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 3 }, { x: 0, y: 3 }]

describe('splitting a polygon along a line', () => {
  it('halves a square and leaves it whole when the line misses', () => {
    const pieces = splitPolygonByLine(SQUARE, { x: 0.5, y: -1 }, { x: 0.5, y: 2 })
    expect(pieces).toHaveLength(2)
    for (const p of pieces) { expect(area(p)).toBeCloseTo(0.5, 12); expect(signedArea(p)).toBeGreaterThan(0) }
    expect(splitPolygonByLine(SQUARE, { x: 2, y: -1 }, { x: 2, y: 2 })).toHaveLength(1)
  })

  it('cuts a concave U across both arms into three pieces with the same total area', () => {
    const pieces = splitPolygonByLine(U, { x: -1, y: 2 }, { x: 4, y: 2 })
    expect(pieces).toHaveLength(3)
    expect(pieces.reduce((s, p) => s + area(p), 0)).toBeCloseTo(area(U), 12)
    expect(pieces.map(area).sort()).toEqual([1, 1, 5])
  })
})

describe('cutting, combining and splitting bodies', () => {
  it('cuts a moving box: masses by area, rigid-body velocities, the rope goes to the piece holding its anchor', () => {
    const s = emptyScene('cut')
    const box = addBody(s, { id: 'b', name: '板', shape: { type: 'box', width: 2, height: 0.5 }, position: { x: 0, y: 1 }, mass: 4, velocity: { x: 1, y: 0 }, angularVelocity: 2 })
    addConnector<RopeDef>(s, { id: 'r', name: '绳', type: 'rope', a: { body: null, local: { x: 0.8, y: 3 } }, b: { body: box.id, local: { x: 0.8, y: 0 } }, pulleys: [], length: null })
    const made = cutBodies(s, { x: 0.5, y: -1 }, { x: 0.5, y: 3 })
    expect(made).toHaveLength(2)
    const pieces = made.map(id => s.bodies.find(b => b.id === id)!)
    expect(pieces.reduce((t, b) => t + b.mass, 0)).toBeCloseTo(4, 12)
    const right = pieces.find(b => b.position.x > 0.5)!, left = pieces.find(b => b.position.x < 0.5)!
    expect(right.mass).toBeCloseTo(1, 12)
    expect(left.mass).toBeCloseTo(3, 12)
    // v = v₀ + ω × r at each centroid
    expect(right.velocity.x).toBeCloseTo(1, 12)
    expect(right.velocity.y).toBeCloseTo(2 * 0.75, 12)
    expect(left.velocity.y).toBeCloseTo(2 * -0.25, 12)
    const rope = s.connectors.find(c => c.id === 'r') as RopeDef
    expect(rope.b.body).toBe(right.id)
    expect(s.bodies.some(b => b.id === 'b')).toBe(false)
  })

  it('combines two boxes into a compound at their area centroid and splits it back', () => {
    const s = emptyScene('combine')
    addGround(s, { id: 'g', top: 0 })
    const a = addBody(s, { id: 'a', name: 'A', shape: { type: 'box', width: 1, height: 1 }, position: { x: 0, y: 0.5 }, mass: 1 })
    const b = addBody(s, { id: 'b', name: 'B', shape: { type: 'box', width: 2, height: 1 }, position: { x: 1.5, y: 0.5 }, mass: 3, velocity: { x: 2, y: 0 } })
    addConnector<RopeDef>(s, { id: 'r', name: '绳', type: 'rope', a: { body: a.id, local: { x: 0, y: 0 } }, b: { body: b.id, local: { x: 0, y: 0 } }, pulleys: [], length: null })
    const r = combineBodies(s, [a.id, b.id])
    expect('id' in r).toBe(true)
    const c = s.bodies.find(x => x.id === (r as { id: string }).id)!
    expect(c.shape.type).toBe('compound')
    expect(c.mass).toBe(4)
    // Area centroid: (1·0 + 2·1.5)/3 = 1
    expect(c.position.x).toBeCloseTo(1, 12)
    expect(c.velocity.x).toBeCloseTo(1.5, 12)
    // The rope between the two would join the body to itself
    expect(s.connectors).toHaveLength(0)
    const first = explodeCompound(s, c.id)
    expect(first).not.toBeNull()
    const parts = s.bodies.filter(x => x.kind !== 'static')
    expect(parts).toHaveLength(2)
    const xs = parts.map(p => p.position.x).sort((p, q) => p - q)
    expect(xs[0]).toBeCloseTo(0, 12)
    expect(xs[1]).toBeCloseTo(1.5, 12)
    // Masses by area of the combined body (uniform density)
    expect(parts.find(p => p.position.x > 1)!.mass).toBeCloseTo(4 * 2 / 3, 12)
  })

  it('does not mix fixed and moving bodies, and needs two', () => {
    const s = emptyScene('mix')
    const g = addGround(s, { id: 'g', top: 0 })
    const a = addBody(s, { id: 'a', name: 'A', shape: { type: 'box', width: 1, height: 1 }, position: { x: 0, y: 0.5 }, mass: 1 })
    expect('error' in combineBodies(s, [g.id, a.id])).toBe(true)
    expect('error' in combineBodies(s, [a.id])).toBe(true)
  })
})

describe('object snapping with concave and compound outlines', () => {
  it('a compound dumbbell lands on the ground with its balls', () => {
    const s = emptyScene('snap')
    addGround(s, { id: 'g', top: 0, left: -5, right: 5 })
    const d: BodyDef = addBody(s, {
      id: 'd', name: 'D', mass: 1, position: { x: 0, y: 0.5 },
      shape: { type: 'compound', parts: [{ shape: { type: 'circle', radius: 0.2 }, position: { x: -0.5, y: 0 }, angle: 0 }, { shape: { type: 'box', width: 1, height: 0.05 }, position: { x: 0, y: 0 }, angle: 0 }, { shape: { type: 'circle', radius: 0.2 }, position: { x: 0.5, y: 0 }, angle: 0 }] }
    })
    expect(outlinesOf(d)).toHaveLength(3)
    // Raw move down to 3 cm above the ground (3 px at 100 px/m): snaps the balls onto it
    const raw = outlinesOf(d).map(o => shifted(o, { x: 0, y: -0.27 }))
    const r = snapBodyMove(s, d.id, raw, 100, { keys: [] })
    expect(r.contacts.length).toBeGreaterThan(0)
    expect(-0.27 + r.delta.y).toBeCloseTo(-0.3, 12)
  })

  it('a ball snaps into the notch of a concave body from inside the notch', () => {
    const s = emptyScene('notch')
    addBody(s, { id: 'u', name: 'U', kind: 'static', shape: { type: 'polygon', points: U }, position: { x: 0, y: 0 } })
    const ball = addBody(s, { id: 'ball', name: 'o', shape: { type: 'circle', radius: 0.3 }, position: { x: 1.5, y: 2 }, mass: 1 })
    // Ball in the notch, 3 cm above its floor (y = 1): snaps down onto the floor, not out of the U
    const raw = outlinesOf(ball).map(o => shifted(o, { x: 0, y: -0.67 }))
    const r = snapBodyMove(s, ball.id, raw, 100, { keys: [] })
    expect(r.contacts.length).toBeGreaterThan(0)
    expect(2 - 0.67 + r.delta.y).toBeCloseTo(1.3, 12)
    expect(worldVerts(s.bodies[0])).toHaveLength(8)
  })
})
