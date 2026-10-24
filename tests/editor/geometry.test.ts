/**
 * Editor geometry: convex hull, polygon validity, re-centring of dynamic polygons (anchors keep their world
 * points), box → polygon, translation of static polygons stored in world coordinates, movable-pulley centres.
 */
import { describe, expect, it } from 'vitest'
import { addBody, addIncline, addPulley, emptyScene } from '../../src/core/scene/build'
import type { BodyDef } from '../../src/core/scene/types'
import {
  boxToPolygon, captureAttachments, centroid, convexHull, isValidConvex, localVerts, pulleyWorld, signedArea, toLocalPt,
  toWorldPt, translateBody, worldVerts, writePolygon
} from '../../src/app/editor/geometry'

const close = (a: number, b: number, eps = 1e-12) => expect(Math.abs(a - b)).toBeLessThan(eps)

describe('convexHull', () => {
  it('drops interior and collinear points and returns a counter-clockwise outline', () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 1, y: 1 }, { x: 0.5, y: 1.5 }, { x: 2, y: 2 }]
    const h = convexHull(pts)
    expect(h).toHaveLength(4)
    expect(signedArea(h)).toBeCloseTo(4, 12)
    expect(isValidConvex(h)).toBe(true)
  })
  it('returns fewer than 3 points for degenerate input', () => {
    expect(convexHull([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }]).length).toBeLessThan(3)
  })
})

describe('isValidConvex', () => {
  const sq = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]
  it('accepts a convex counter-clockwise polygon, also with a collinear vertex', () => {
    expect(isValidConvex(sq)).toBe(true)
    expect(isValidConvex([{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }])).toBe(true)
  })
  it('rejects clockwise, concave, self-overlapping and degenerate polygons', () => {
    expect(isValidConvex(sq.slice().reverse())).toBe(false)
    expect(isValidConvex([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.4, y: 0.4 }, { x: 1, y: 1 }, { x: 0, y: 1 }])).toBe(false)
    const star = Array.from({ length: 5 }, (_, i) => ({ x: Math.cos((4 * Math.PI * i) / 5), y: Math.sin((4 * Math.PI * i) / 5) }))
    expect(isValidConvex(star)).toBe(false)
    expect(isValidConvex([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1e-5 }, { x: 1, y: 1 }])).toBe(false)
    expect(isValidConvex([{ x: 0, y: 0 }, { x: 1, y: 0 }])).toBe(false)
  })
})

describe('re-centring dynamic polygons', () => {
  it('moves the points to the centre of mass, shifts the position and keeps anchors at their world points', () => {
    const s = emptyScene()
    const b = addBody(s, { name: 'P', shape: { type: 'polygon', points: [{ x: -0.3, y: -0.2 }, { x: 0.3, y: -0.2 }, { x: 0.3, y: 0.2 }, { x: -0.3, y: 0.2 }] }, position: { x: 1, y: 2 }, angle: 0.4 })
    s.connectors.push({ id: 'f1', name: 'F', type: 'force', a: { body: b.id, local: { x: 0.3, y: 0 } }, force: { x: 1, y: 0 } })
    addPulley(s, { id: 'p1', position: { x: 0, y: 0.2 }, radius: 0.05 })
    s.pulleys[0].body = b.id
    const anchorWorld = toWorldPt(b, { x: 0.3, y: 0 })
    const pulleyBefore = pulleyWorld(s, s.pulleys[0])
    const orig: BodyDef = JSON.parse(JSON.stringify(b))
    // Pull the top-right vertex out: the centroid moves
    const verts = localVerts(orig)
    verts[2] = { x: 0.6, y: 0.5 }
    writePolygon(b, orig, verts, captureAttachments(s, b.id))
    if (b.shape.type !== 'polygon') throw new Error('polygon expected')
    const c = centroid(b.shape.points)
    close(c.x, 0); close(c.y, 0)
    // The outline did not move in the world
    const expected = verts.map(v => toWorldPt(orig, v))
    worldVerts(b).forEach((p, i) => { close(p.x, expected[i].x, 1e-12); close(p.y, expected[i].y, 1e-12) })
    // The anchor and the movable pulley stay where they were
    const f = s.connectors[0]
    const aw = toWorldPt(b, f.a.local)
    close(aw.x, anchorWorld.x); close(aw.y, anchorWorld.y)
    const pw = pulleyWorld(s, s.pulleys[0])
    close(pw.x, pulleyBefore.x); close(pw.y, pulleyBefore.y)
  })

  it('reads uncentred dynamic polygons the way the solver compiles them', () => {
    const s = emptyScene()
    const b = addBody(s, { name: 'T', shape: { type: 'polygon', points: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }] }, position: { x: 0, y: 0 } })
    const v = localVerts(b)
    expect(signedArea(v)).toBeGreaterThan(0)
    const c = centroid(v)
    close(c.x, 0); close(c.y, 0)
  })
})

describe('body helpers', () => {
  it('converts a box to the same polygon outline', () => {
    const s = emptyScene()
    const b = addBody(s, { name: 'B', shape: { type: 'box', width: 0.4, height: 0.2 }, position: { x: 1, y: 1 }, angle: 0.3 })
    const before = worldVerts(b)
    expect(boxToPolygon(b)).toBe(true)
    worldVerts(b).forEach((p, i) => { close(p.x, before[i].x); close(p.y, before[i].y) })
    expect(boxToPolygon(b)).toBe(false)
  })
  it('translates a static polygon stored in world coordinates by moving its points', () => {
    const s = emptyScene()
    const inc = addIncline(s, { angle: Math.PI / 6, base: 2 })
    translateBody(inc, 1, 0.5)
    expect(inc.position).toEqual({ x: 0, y: 0 })
    if (inc.shape.type !== 'polygon') throw new Error('polygon expected')
    expect(inc.shape.points[0]).toEqual({ x: 1, y: 0.5 })
  })
  it('maps between body and world coordinates', () => {
    const s = emptyScene()
    const b = addBody(s, { name: 'B', shape: { type: 'box', width: 1, height: 1 }, position: { x: 2, y: -1 }, angle: 1.1 })
    const w = toWorldPt(b, { x: 0.3, y: -0.2 })
    const l = toLocalPt(b, w)
    close(l.x, 0.3); close(l.y, -0.2)
  })
})
