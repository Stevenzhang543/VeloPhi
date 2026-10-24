/**
 * Selection handles and snapping: a corner resize keeps the opposite corner fixed, rotation snaps to the angle
 * step, invalid vertex positions are refused, vertices are inserted and deleted, grid rounding has no float
 * noise, and editing operations on movable pulleys and their bodies.
 */
import { describe, expect, it } from 'vitest'
import { addBody, addIncline, addPulley, emptyScene } from '../../src/core/scene/build'
import type { BodyDef, RopeDef } from '../../src/core/scene/types'
import { applyHandleDrag, bodyHandles, deleteVertex, edgeAt, insertVertex, startHandleDrag } from '../../src/app/editor/handles'
import type { DragOptions } from '../../src/app/editor/handles'
import { roundTo, snapLength } from '../../src/app/editor/snap'
import { localVerts, pulleyWorld, toWorldPt, worldVerts } from '../../src/app/editor/geometry'
import { deleteObject, moveObject } from '../../src/app/editing'

const opts = (o: Partial<DragOptions> = {}): DragOptions => ({ snap: false, step: 0.1, shift: false, angleSnap: Math.PI / 12, fmtLen: v => `${v}`, fmtAng: v => `${v}`, ...o })

function boxScene(angle = 0) {
  const s = emptyScene()
  const b = addBody(s, { id: 'b', name: 'B', shape: { type: 'box', width: 0.4, height: 0.2 }, position: { x: 1, y: 1 }, angle })
  return { s, b }
}

describe('box handles', () => {
  it('has 8 resize handles and a rotation handle when large on screen, corners only when small', () => {
    const { b } = boxScene()
    expect(bodyHandles(b, 400)).toHaveLength(9)
    expect(bodyHandles(b, 100).filter(h => h.id.kind === 'edge')).toHaveLength(0)
  })

  it('a corner drag keeps the opposite corner fixed (rotated box) and scales anchors', () => {
    const { s, b } = boxScene(0.5)
    s.connectors.push({ id: 'f', name: 'F', type: 'force', a: { body: 'b', local: { x: 0.2, y: 0 } }, force: { x: 1, y: 0 } })
    const fixed = toWorldPt(b, { x: -0.2, y: -0.1 })
    const corner = toWorldPt(b, { x: 0.2, y: 0.1 })
    const d = startHandleDrag(s, { body: 'b' }, { kind: 'corner', sx: 1, sy: 1 }, corner)!
    const target = toWorldPt(b, { x: 0.4, y: 0.3 })
    applyHandleDrag(s, d, target, opts())
    const nb = s.bodies[0]
    expect(nb.shape).toEqual({ type: 'box', width: 0.6, height: 0.4 })
    const f2 = toWorldPt(nb, { x: -0.3, y: -0.2 })
    expect(f2.x).toBeCloseTo(fixed.x, 9); expect(f2.y).toBeCloseTo(fixed.y, 9)
    // The anchor on the right edge stays on the right edge
    expect(s.connectors[0].a.local.x).toBeCloseTo(0.3, 12)
  })

  it('rotation snaps to the angle step unless Shift is held', () => {
    const { s, b } = boxScene()
    const handle = bodyHandles(b, 400).find(h => h.id.kind === 'rotate')!
    const d = startHandleDrag(s, { body: 'b' }, handle.id, handle.at)
    // Pointer turned by ~37° about the centre
    const a = Math.PI / 2 + 0.65
    applyHandleDrag(s, d!, { x: 1 + Math.cos(a), y: 1 + Math.sin(a) }, opts())
    expect(s.bodies[0].angle).toBeCloseTo((Math.PI / 12) * Math.round(0.65 / (Math.PI / 12)), 12)
    applyHandleDrag(s, d!, { x: 1 + Math.cos(a), y: 1 + Math.sin(a) }, opts({ shift: true }))
    expect(s.bodies[0].angle).toBeCloseTo(0.65, 9)
  })
})

describe('vertex editing', () => {
  it('refuses a vertex position that would make the polygon concave and keeps the last valid shape', () => {
    const s = emptyScene()
    const inc = addIncline(s, { id: 'inc', angle: Math.PI / 6, base: 2 })
    const before = JSON.stringify(inc.shape)
    const d = startHandleDrag(s, { body: 'inc' }, { kind: 'vertex', index: 2 }, worldVerts(inc)[2])!
    const fb = applyHandleDrag(s, d, { x: 1.5, y: -1 }, opts())
    expect(fb.invalid).not.toBeNull()
    expect(JSON.stringify(s.bodies[0].shape)).toBe(before)
    const ok = applyHandleDrag(s, d, { x: 0.2, y: 1.5 }, opts())
    expect(ok.invalid).toBeNull()
    expect(worldVerts(s.bodies[0])[2]).toEqual({ x: 0.2, y: 1.5 })
  })

  it('inserts on an edge (a box becomes a polygon) and deletes down to three vertices', () => {
    const { s, b } = boxScene()
    const e = edgeAt(b, { x: 1.2, y: 1.0 }, 0.01)!
    expect(e).not.toBeNull()
    insertVertex(b, e.index, e.local)
    expect(b.shape.type).toBe('polygon')
    expect(localVerts(b)).toHaveLength(5)
    expect(deleteVertex(s, b, 0)).toBe(true)
    expect(deleteVertex(s, b, 0)).toBe(true)
    expect(localVerts(b)).toHaveLength(3)
    expect(deleteVertex(s, b, 0)).toBe(false)
  })
})

describe('snapping', () => {
  it('rounds to the step without floating noise', () => {
    expect(roundTo(0.30000000000000004, 0.1)).toBe(0.3)
    expect(roundTo(-1.43, 0.2)).toBe(-1.4)
    expect(roundTo(0.0123, 0.005)).toBe(0.01)
    expect(snapLength(0.01, 100, false)).toBeGreaterThan(0)
  })
})

describe('movable pulleys', () => {
  function pulleyScene() {
    const s = emptyScene()
    const b: BodyDef = addBody(s, { id: 'm', name: 'M', shape: { type: 'box', width: 0.2, height: 0.2 }, position: { x: 1, y: 1 }, angle: Math.PI / 2 })
    addPulley(s, { id: 'pm', position: { x: 0, y: 0.2 }, radius: 0.05 })
    s.pulleys[0].body = b.id
    addPulley(s, { id: 'pf', position: { x: 0, y: 2 }, radius: 0.05 })
    s.connectors.push({ id: 'r', name: 'R', type: 'rope', a: { body: null, local: { x: -1, y: 2 } }, b: { body: null, local: { x: 2, y: 2 } }, pulleys: [{ pulley: 'pm', wrap: 'ccw' }, { pulley: 'pf', wrap: 'cw' }], length: null } as RopeDef)
    return s
  }

  it('moves a movable pulley by a world displacement expressed in the body frame', () => {
    const s = pulleyScene()
    const w0 = pulleyWorld(s, s.pulleys[0])
    moveObject(s, { kind: 'pulley', id: 'pm' }, 0.1, 0)
    const w1 = pulleyWorld(s, s.pulleys[0])
    expect(w1.x - w0.x).toBeCloseTo(0.1, 12)
    expect(w1.y - w0.y).toBeCloseTo(0, 12)
  })

  it('deleting the carrying body removes its pulleys and the rope references to them', () => {
    const s = pulleyScene()
    deleteObject(s, { kind: 'body', id: 'm' })
    expect(s.pulleys.map(p => p.id)).toEqual(['pf'])
    const rope = s.connectors.find(c => c.id === 'r') as RopeDef
    expect(rope.pulleys.map(p => p.pulley)).toEqual(['pf'])
  })
})
