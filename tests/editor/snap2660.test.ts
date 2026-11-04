/**
 * 26.60 (D202): snapping a moved body by exact signed gaps between the shapes' convex pieces and arc bands.
 * - Stacking a block on another keeps its sideways position (26.59 jumped sideways: a corner on the line of the other
 *   block's top was taken for a deep overlap through its side face).
 * - Corners line up flush along the surface when within 6 px; arcs snap by their true circles and corners.
 * - Grid snapping puts a feature of the body (an edge, a corner, an arc's end) on a grid line, and contacts still apply
 *   with the grid on.
 */
import { describe, expect, it } from 'vitest'
import { addBody, emptyScene } from '../../src/core/scene/build'
import { arcDeg } from '../../src/core/scene/arc'
import type { BodyDef, Scene } from '../../src/core/scene/types'
import { snapBodyMove, snapPointToObjects, sceneFeatures } from '../../src/app/editor/objectSnap'
import type { SnapMemory } from '../../src/app/editor/objectSnap'
import { bodyGap, piecesOf } from '../../src/engine/pieces'

const PPM = 100 // 1 px = 1 cm

function blocks(): { s: Scene; g: BodyDef; a: BodyDef; b: BodyDef } {
  const s = emptyScene('snap')
  const g = addBody(s, { id: 'g', name: 'g', kind: 'static', shape: { type: 'box', width: 6, height: 0.4 }, position: { x: 0, y: -0.2 } })
  const a = addBody(s, { id: 'a', name: 'a', shape: { type: 'box', width: 0.4, height: 0.4 }, position: { x: 0, y: 0.2 }, mass: 1 })
  const b = addBody(s, { id: 'b', name: 'b', shape: { type: 'box', width: 0.4, height: 0.4 }, position: { x: 1.2, y: 1.2 }, mass: 1 })
  return { s, g, a, b }
}

/** Final position of body `id` after a raw move to (x, y) (absolute), with the snap applied. */
function moveTo(s: Scene, id: string, x: number, y: number, mem: SnapMemory = { keys: [] }, grid = 0) {
  const def = s.bodies.find(b => b.id === id)!
  const shift = { x: x - def.position.x, y: y - def.position.y }
  const r = snapBodyMove(s, id, shift, PPM, mem, { grid })
  return { x: def.position.x + shift.x + r.delta.x, y: def.position.y + shift.y + r.delta.y, contacts: r.contacts }
}

const gapBetween = (s: Scene, a: string, b: string) => bodyGap(piecesOf(s.bodies.find(x => x.id === a)!), piecesOf(s.bodies.find(x => x.id === b)!))!.d

describe('stacking and sides (D202)', () => {
  it('a block set on another keeps its sideways offset (no jump to the other block\'s edge)', () => {
    const { s } = blocks()
    // 3 px above a's top, 8 cm (8 px) to the right of centre
    const r = moveTo(s, 'b', 0.08, 0.63)
    expect(r.y).toBeCloseTo(0.6, 12)
    expect(r.x).toBeCloseTo(0.08, 12)
  })

  it('lines the edges up flush when within 6 px along the surface, and shows a guide', () => {
    const { s } = blocks()
    const r = moveTo(s, 'b', 0.04, 0.63)
    expect(r.y).toBeCloseTo(0.6, 12)
    expect(r.x).toBeCloseTo(0, 12)
    expect(r.contacts.some(c => c.key.endsWith(':align'))).toBe(true)
  })

  it('beside a block on the ground: two contacts, exactly touching both', () => {
    const { s } = blocks()
    const r = moveTo(s, 'b', 0.43, 0.22)
    expect(r.x).toBeCloseTo(0.4, 12)
    expect(r.y).toBeCloseTo(0.2, 12)
    expect(r.contacts.length).toBe(2)
  })

  it('a quick move landing in the side of a block is pushed out sideways, not onto its top', () => {
    const { s } = blocks()
    const r = moveTo(s, 'b', 0.35, 0.5)
    expect(r.x).toBeCloseTo(0.4, 12)
    expect(r.y).toBe(0.5)
  })

  it('a held contact slides along the top, then comes round the corner to the side', () => {
    const { s } = blocks()
    const mem: SnapMemory = { keys: [] }
    let r = moveTo(s, 'b', 0, 0.63, mem)
    expect(r.y).toBeCloseTo(0.6, 12)
    // Pushed down into a while still above it: stays on top
    r = moveTo(s, 'b', 0.15, 0.5, mem)
    expect(r.y).toBeCloseTo(0.6, 12)
    expect(r.x).toBeCloseTo(0.15, 12)
    // Pointer to the side and low: the contact is now with a's side and the ground (the corner has been passed)
    r = moveTo(s, 'b', 0.45, 0.25, mem)
    expect(r.x).toBeCloseTo(0.4, 12)
    expect(r.y).toBeCloseTo(0.2, 12)
  })
})

describe('arcs (D202)', () => {
  function arcScene() {
    const s = emptyScene('arc')
    // Ground top at y = 0 from x = 0 to 4
    addBody(s, { id: 'g', name: 'g', kind: 'static', shape: { type: 'box', width: 4, height: 0.4 }, position: { x: 2, y: -0.2 } })
    // Quarter arc, inner radius 1, 0.1 thick, from the left rim down to the bottom; its circle's centre at (x, 1)
    const arc = addBody(s, { id: 'q', name: 'q', kind: 'static', shape: arcDeg(1, 0.1, 180, 90), position: { x: -0.37, y: 1.03 } })
    return { s, arc }
  }

  it('the end face of a quarter arc meets the ground\'s side and its inner bottom lines up with the ground\'s top', () => {
    const { s } = arcScene()
    // Raw: the end face 3 cm left of the ground's side (x = 0) and the inner corner 3 cm above the ground's top
    const r = moveTo(s, 'q', -0.03, 1.03)
    expect(r.x).toBeCloseTo(0, 12)
    expect(r.y).toBeCloseTo(1, 12)
    // Inner bottom corner of the arc at (0, 0): level with the top of the ground, end face against its side
    const moved = { ...s.bodies[1], position: { x: r.x, y: r.y } }
    expect(Math.abs(bodyGap(piecesOf(s.bodies[0]), piecesOf(moved))!.d)).toBeLessThan(1e-9)
  })

  it('with the grid on, the arc\'s end goes to a grid line and the contact still wins', () => {
    const { s } = arcScene()
    const free = moveTo(s, 'q', -0.62, 1.47, { keys: [] }, 0.1)
    // Away from the ground: the end of the arc (x of its circle centre) and its top rim land on grid lines
    expect(Math.abs(free.x * 10 - Math.round(free.x * 10))).toBeLessThan(1e-9)
    expect(Math.abs(free.y * 10 - Math.round(free.y * 10))).toBeLessThan(1e-9)
    const near = moveTo(s, 'q', -0.03, 1.03, { keys: [] }, 0.1)
    expect(near.x).toBeCloseTo(0, 12)
  })

  it('a ball snaps onto the inside of a quarter arc by its true circle', () => {
    const s = emptyScene('bowl')
    addBody(s, { id: 'q', name: 'q', kind: 'static', shape: arcDeg(1, 0.1, 180, 90), position: { x: 0, y: 1 } })
    addBody(s, { id: 'ball', name: 'o', kind: 'particle', shape: { type: 'circle', radius: 0.1 }, position: { x: 0, y: 0 }, mass: 1 })
    // Raw: 3 cm inside the track's inner surface along the 225° radius
    const u = Math.SQRT1_2, rr = 0.9 - 0.03
    const r = moveTo(s, 'ball', -u * rr, 1 - u * rr)
    expect(Math.hypot(r.x, r.y - 1)).toBeCloseTo(0.9, 12)
  })

  it('a block snaps onto the outer side of an arched bridge', () => {
    const s = emptyScene('hump')
    addBody(s, { id: 'h', name: 'h', kind: 'static', shape: arcDeg(1.9, 0.1, 30, 120), position: { x: 0, y: 0 } })
    addBody(s, { id: 'b', name: 'b', shape: { type: 'box', width: 0.2, height: 0.2 }, position: { x: 0, y: 3 }, mass: 1 })
    const r = moveTo(s, 'b', 0, 2.13)
    expect(r.y).toBeCloseTo(2.1, 12)
    expect(r.x).toBe(0)
  })

  it('points snap to an arc\'s circles and corners', () => {
    const { s } = arcScene()
    const f = sceneFeatures(s)
    // The inner bottom corner is a feature
    const c = snapPointToObjects(s, f, { x: -0.37 + 0.004, y: 0.03 + 0.004 }, PPM)
    expect(c?.kind).toBe('feature')
    // A point 3 cm from the inner surface snaps onto it
    const p = snapPointToObjects(s, f, { x: -0.37 - 0.97 * Math.SQRT1_2, y: 1.03 - 0.97 * Math.SQRT1_2 }, PPM)
    expect(p?.kind).toBe('surface')
    expect(Math.hypot(p!.p.x + 0.37, p!.p.y - 1.03)).toBeCloseTo(1, 12)
  })
})

describe('grid snapping by features (D202)', () => {
  it('puts an edge of an off-grid block on the grid', () => {
    const s = emptyScene('grid')
    addBody(s, { id: 'b', name: 'b', shape: { type: 'box', width: 0.45, height: 0.3 }, position: { x: 0.013, y: 0.27 }, mass: 1 })
    const r = moveTo(s, 'b', 1.013, 1.27, { keys: [] }, 0.1)
    const left = r.x - 0.225, right = r.x + 0.225, bottom = r.y - 0.15, top = r.y + 0.15
    const onGrid = (v: number) => Math.abs(v * 10 - Math.round(v * 10)) < 1e-9
    expect(onGrid(left) || onGrid(right) || onGrid(r.x)).toBe(true)
    expect(onGrid(bottom) || onGrid(top) || onGrid(r.y)).toBe(true)
  })

  it('leaves the gaps exact when blocks touch with the grid on', () => {
    const { s } = blocks()
    const r = moveTo(s, 'b', 0.42, 0.21, { keys: [] }, 0.1)
    expect(r.x).toBeCloseTo(0.4, 12)
    expect(r.y).toBeCloseTo(0.2, 12)
    s.bodies[2].position = { x: r.x, y: r.y }
    expect(Math.abs(gapBetween(s, 'a', 'b'))).toBeLessThan(1e-9)
  })
})
