/**
 * Object snapping (manual 26.51, D47): continuous moves, contact snaps within 6 px with release at 14 px,
 * a second contact against a wall, circles on surfaces and incline faces, point snapping, rotation magnets.
 */
import { describe, expect, it } from 'vitest'
import { addBody, addGround, addIncline, emptyScene } from '../../src/core/scene/build'
import type { BodyDef, Scene } from '../../src/core/scene/types'
import type { SnapMemory } from '../../src/app/editor/objectSnap'
import { contactSnaps, outlineOf, sceneFeatures, shifted, snapAngles, snapBodyMove, snapPointToObjects, snapRotation } from '../../src/app/editor/objectSnap'
import { worldVerts } from '../../src/app/editor/geometry'

const PPM = 100 // 1 px = 1 cm

function world(): { scene: Scene; ground: BodyDef; block: BodyDef } {
  const scene = emptyScene()
  const ground = addGround(scene, { top: 0, left: -5, right: 5 })
  const block = addBody(scene, { name: 'b', shape: { type: 'box', width: 0.4, height: 0.2 }, position: { x: 0, y: 0.5 }, mass: 1 })
  return { scene, ground, block }
}

/** Snap a raw displacement of the block (from its current definition) and return the corrected displacement. */
function move(scene: Scene, b: BodyDef, d: { x: number; y: number }, mem: SnapMemory) {
  const r = snapBodyMove(scene, b.id, shifted(outlineOf(b), d), PPM, mem)
  return { x: d.x + r.delta.x, y: d.y + r.delta.y, contacts: r.contacts }
}

describe('contact snapping of a moved body', () => {
  it('leaves a free move alone (continuous, no grid)', () => {
    const { scene, block } = world()
    const mem = { keys: [] }
    const r = move(scene, block, { x: 0.123456, y: -0.1 }, mem)
    expect(r).toMatchObject({ x: 0.123456, y: -0.1 })
    expect(r.contacts).toHaveLength(0)
  })

  it('puts the block exactly on the ground within 6 px, and lets go only past 14 px', () => {
    const { scene, block } = world()
    const mem = { keys: [] as string[] }
    // Bottom at 0.4 → raw bottom 0.04 above the ground (4 px): snaps
    let r = move(scene, block, { x: 0.3, y: -0.36 }, mem)
    expect(Math.abs(r.y - -0.4)).toBeLessThan(1e-12)
    expect(r.x).toBe(0.3)
    const bottom = Math.min(...worldVerts({ ...block, position: { x: block.position.x + r.x, y: block.position.y + r.y } }).map(p => p.y))
    expect(Math.abs(bottom)).toBeLessThan(1e-9)
    // 10 px above: still held (hysteresis)
    r = move(scene, block, { x: 0.3, y: -0.3 }, mem)
    expect(Math.abs(r.y - -0.4)).toBeLessThan(1e-12)
    // 16 px above: released, free again
    r = move(scene, block, { x: 0.3, y: -0.24 }, mem)
    expect(r.y).toBe(-0.24)
    // Coming back to 10 px does not engage (only within 6 px)
    r = move(scene, block, { x: 0.3, y: -0.3 }, mem)
    expect(r.y).toBe(-0.3)
  })

  it('resolves a small overlap the same way', () => {
    const { scene, block } = world()
    const r = move(scene, block, { x: 0, y: -0.43 }, { keys: [] })
    expect(Math.abs(r.y - -0.4)).toBeLessThan(1e-12)
  })

  it('slides along the surface when pushed into it (26.52, D57)', () => {
    const { scene, block } = world()
    const mem = { keys: [] as string[] }
    // Engage 4 px above the ground, then push the pointer 30 cm below the surface while moving sideways
    move(scene, block, { x: 0, y: -0.36 }, mem)
    for (const x of [0.2, 0.55, 1.3]) {
      const r = move(scene, block, { x, y: -0.7 }, mem)
      expect(Math.abs(r.y - -0.4), `x ${x}`).toBeLessThan(1e-12)
      expect(r.x).toBe(x)
      const bottom = Math.min(...worldVerts({ ...block, position: { x: block.position.x + r.x, y: block.position.y + r.y } }).map(p => p.y))
      expect(Math.abs(bottom)).toBeLessThan(1e-9)
    }
    // Moving away again lets go past 14 px
    expect(move(scene, block, { x: 1.3, y: -0.2 }, mem).y).toBe(-0.2)
  })

  it('catches a quick move that lands overlapping (up to half the body size)', () => {
    const { scene, block } = world()
    const r = move(scene, block, { x: 0.1, y: -0.52 }, { keys: [] }) // 12 cm into the ground in one move
    expect(Math.abs(r.y - -0.4)).toBeLessThan(1e-12)
  })

  it('adds a second contact against a wall, keeping the first', () => {
    const { scene, block } = world()
    addBody(scene, { name: 'b', kind: 'static', shape: { type: 'box', width: 0.2, height: 2 }, position: { x: 1.1, y: 1 } })
    // Wall face at x = 1.0; block right face raw at 0.2 + 0.77 = 0.97 (3 px) and bottom 3 px above the ground
    const r = move(scene, block, { x: 0.77, y: -0.37 }, { keys: [] })
    expect(r.contacts).toHaveLength(2)
    expect(Math.abs(r.y - -0.4)).toBeLessThan(1e-12)
    expect(Math.abs(r.x - 0.8)).toBeLessThan(1e-12)
  })

  it('makes a ball tangent to an incline face', () => {
    const scene = emptyScene()
    addIncline(scene, { angle: Math.PI / 6, base: 3 })
    const ball = addBody(scene, { name: 'b', kind: 'particle', shape: { type: 'circle', radius: 0.1 }, position: { x: 1, y: 2 }, mass: 0.5 })
    // Surface height at x = 1: the incline rises from (0,0)? Find the face distance directly
    const o = outlineOf(ball)
    const inc = scene.bodies[0]
    const near = contactSnaps(o, outlineOf(inc), inc.id, 10)
    expect(near.length).toBeGreaterThan(0)
    const c = near.reduce((a, b) => (Math.abs(a.gap) < Math.abs(b.gap) ? a : b))
    // Move to 3 px from the face and snap
    const raw = { x: c.delta.x + c.n.x * 0.03, y: c.delta.y + c.n.y * 0.03 }
    const r = move(scene, ball, raw, { keys: [] })
    const after = contactSnaps(shifted(o, { x: r.x, y: r.y }), outlineOf(inc), inc.id, 1)
    expect(Math.min(...after.map(a => Math.abs(a.gap)))).toBeLessThan(1e-9)
  })

  it('makes two balls touch', () => {
    const scene = emptyScene()
    const a = addBody(scene, { name: 'b', kind: 'particle', shape: { type: 'circle', radius: 0.1 }, position: { x: 0, y: 0 }, mass: 1 })
    const b = addBody(scene, { name: 'b', kind: 'particle', shape: { type: 'circle', radius: 0.2 }, position: { x: 0.33, y: 0 }, mass: 1 })
    const r = move(scene, a, { x: 0, y: 0 }, { keys: [] })
    expect(Math.abs(r.x - 0.03)).toBeLessThan(1e-12)
    expect(b.position.x).toBe(0.33)
  })
})

describe('point and angle snapping', () => {
  it('snaps points to vertices first, then to surfaces, and ignores excluded bodies', () => {
    const { scene, block } = world()
    const f = sceneFeatures(scene)
    const v = snapPointToObjects(scene, f, { x: 0.205, y: 0.395 }, PPM)
    expect(v?.kind).toBe('feature')
    expect(v?.p).toEqual({ x: 0.2, y: 0.4 })
    const s = snapPointToObjects(scene, f, { x: 2.5, y: 0.03 }, PPM)
    expect(s?.kind).toBe('surface')
    expect(Math.abs(s!.p.y)).toBeLessThan(1e-12)
    expect(snapPointToObjects(scene, sceneFeatures(scene, new Set([block.id])), { x: 0.205, y: 0.395 }, PPM, new Set([block.id]))).toBeNull()
  })

  it('rotates freely and snaps to 0°, 90° and a nearby slope', () => {
    const scene = emptyScene()
    addIncline(scene, { angle: Math.PI / 6, base: 3 })
    const b = addBody(scene, { name: 'b', shape: { type: 'box', width: 0.4, height: 0.2 }, position: { x: 1.5, y: 1 }, mass: 1 })
    const cands = snapAngles(scene, b, 3)
    expect(snapRotation(0.3, cands, Number.NaN).angle).toBe(0.3)
    expect(snapRotation(0.01, cands, Number.NaN).angle).toBe(0)
    // The slope runs from the top left down to the bottom right: −30°
    const slope = -Math.atan2(Math.tan(Math.PI / 6) * 3, 3)
    const r = snapRotation(slope + 0.015, cands, Number.NaN)
    expect(Math.abs(r.angle - slope)).toBeLessThan(1e-12)
    // Held: still snapped 3° away, free at 5°
    expect(Math.abs(snapRotation(slope + 0.05, cands, r.snapped).angle - slope)).toBeLessThan(1e-12)
    expect(snapRotation(slope + 0.09, cands, r.snapped).angle).toBe(slope + 0.09)
  })
})
