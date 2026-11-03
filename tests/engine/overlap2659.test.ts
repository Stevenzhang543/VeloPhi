/**
 * 26.59 fix 3: overlapping bodies before a run (D200) and the clamp at a wedge tip (D201).
 * - The overlap check sees overlaps the solver's vertex probes miss (two equal boxes pushed into each other), pushes
 *   bodies apart along the shortest way (shared by inverse mass, upward on a tie), leaves touching bodies, welded
 *   bodies and arcs with a ball resting on them alone, and finds nothing in any template or built-in problem.
 * - A block that ends wrapped around the sharp tip of a wedge is no longer held there for ever by two opposite contact
 *   rows (the run used to stop "at rest" with a normal force of hundreds of newtons on a 1 kg block).
 */
import { describe, expect, it } from 'vitest'
import { emptyScene, addBody, addConnector } from '../../src/core/scene/build'
import { arcDeg } from '../../src/core/scene/arc'
import type { DamperDef, Scene } from '../../src/core/scene/types'
import { findOverlaps, pushApart } from '../../src/engine/overlaps'
import { simulate } from '../../src/engine/recording'
import { TEMPLATES, buildTemplate } from '../../src/templates'
import { BUILTIN_PROBLEMS, builtinProblem } from '../../src/teaching/problemBank'
import { describeOverlaps, depthText } from '../../src/app/overlapGate'

type B = [id: string, x: number, y: number, w: number, h: number, mass: number | null]
function floorScene(bodies: B[]): Scene {
  const s = emptyScene('o')
  addBody(s, { id: 'floor', name: '地面', kind: 'static', shape: { type: 'box', width: 6, height: 0.4 }, position: { x: 0, y: -0.2 } })
  for (const [id, x, y, w, h, m] of bodies) addBody(s, { id, name: id, kind: m === null ? 'static' : 'rigid', shape: { type: 'box', width: w, height: h }, position: { x, y }, mass: m ?? 0 })
  return s
}

describe('overlap check before a run (D200)', () => {
  it('finds a block sunk into the ground and pushes it out upward, just touching', () => {
    const s = floorScene([['a', 0, 0.05, 0.4, 0.4, 1]])
    const r = findOverlaps(s)!
    expect(r.pairs).toEqual([{ a: 'floor', b: 'a', depth: expect.closeTo(0.15, 9) }])
    expect(r.remaining).toEqual([])
    pushApart(s, r)
    expect(s.bodies[1].position.y).toBeCloseTo(0.2, 6)
    expect(findOverlaps(s)!.pairs).toEqual([])
  })

  it('a block entirely inside the ground comes out on top', () => {
    const s = floorScene([['a', 0, -0.2, 0.2, 0.2, 1]])
    const r = findOverlaps(s)!
    pushApart(s, r)
    expect(s.bodies[1].position.y).toBeCloseTo(0.1, 6)
  })

  it('sees two equal boxes pushed into each other (no corner of one inside the other) and splits the push by mass', () => {
    const s = floorScene([['a', 0, 0.2, 0.4, 0.4, 1], ['b', 0.3, 0.2, 0.4, 0.4, 3]])
    const r = findOverlaps(s)!
    expect(r.pairs).toEqual([{ a: 'a', b: 'b', depth: expect.closeTo(0.1, 9) }])
    pushApart(s, r)
    // The lighter box moves three times as far
    expect(s.bodies[1].position.x).toBeCloseTo(-0.075, 6)
    expect(s.bodies[2].position.x).toBeCloseTo(0.325, 6)
    expect(s.bodies[2].position.x - s.bodies[1].position.x).toBeCloseTo(0.4, 6)
  })

  it('leaves touching, welded and fixed bodies alone', () => {
    expect(findOverlaps(floorScene([['a', 0, 0.2, 0.4, 0.4, 1], ['b', 0.4, 0.2, 0.4, 0.4, 1]]))!.pairs).toEqual([])
    const w = floorScene([['a', 0, 1, 0.4, 0.4, 1], ['b', 0.2, 1, 0.4, 0.4, 1]])
    addConnector(w, { type: 'weld', name: 'w', a: { body: 'a', local: { x: 0, y: 0 } }, b: { body: 'b', local: { x: 0, y: 0 } } } as never)
    expect(findOverlaps(w)!.pairs).toEqual([])
    expect(findOverlaps(floorScene([['wall', 0, 0, 0.2, 1, null], ['a', 2, 0.2, 0.4, 0.4, 1]]))!.pairs).toEqual([])
  })

  it('a ball on an arc track: exact for a resting ball, pushed out radially when sunk in', () => {
    const s = emptyScene('arc')
    addBody(s, { id: 'track', name: '轨道', kind: 'static', shape: arcDeg(1, 0.1, 180, 180), position: { x: 0, y: 1 } })
    const ball = addBody(s, { id: 'ball', name: '小球', kind: 'particle', shape: { type: 'circle', radius: 0.05 }, position: { x: 0, y: 0.05 }, mass: 1 })
    expect(findOverlaps(s)!.pairs).toEqual([])
    ball.position = { x: Math.sin(0.5) * 0.98, y: 1 - Math.cos(0.5) * 0.98 }
    const r = findOverlaps(s)!
    expect(r.pairs[0].depth).toBeCloseTo(0.03, 6)
    pushApart(s, r)
    expect(Math.hypot(ball.position.x, ball.position.y - 1)).toBeCloseTo(0.95, 6)
  })

  it('a box poking into an arc is found and pushed out', () => {
    const s = emptyScene('hump')
    addBody(s, { id: 'hump', name: '拱', kind: 'static', shape: arcDeg(1.9, 0.1, 30, 120), position: { x: 0, y: 0 } })
    addBody(s, { id: 'box', name: '方块', shape: { type: 'box', width: 0.2, height: 0.2 }, position: { x: 0, y: 2.05 }, mass: 1 })
    const r = findOverlaps(s)!
    expect(r.pairs[0].depth).toBeCloseTo(0.05, 3)
    pushApart(s, r)
    expect(findOverlaps(s)!.pairs).toEqual([])
    expect(s.bodies[1].position.y).toBeGreaterThan(2.09)
  })

  it('no template, built-in problem or many-body scene asks', () => {
    const asks: string[] = []
    for (const t of TEMPLATES) if (findOverlaps(buildTemplate(t.id))?.pairs.length) asks.push(t.id)
    for (const p of BUILTIN_PROBLEMS) if (findOverlaps(builtinProblem(p).scene)?.pairs.length) asks.push(p.id)
    expect(asks).toEqual([])
    const pile = floorScene([['a', 0, 0.1, 0.4, 0.4, 1]])
    pile.settings.integrator = 'softstep'
    expect(findOverlaps(pile)).toBeNull()
  })

  it('describes the overlaps for the dialog', () => {
    const s = floorScene([['a', 0, 0.05, 0.4, 0.4, 1]])
    const d = describeOverlaps(s, findOverlaps(s)!, (a, b, depth) => `${a} 与 ${b}：${depth}`)
    expect(d.lines).toEqual(['地面 与 a：15.0 cm'])
    expect(d.canPush).toBe(true)
    expect(depthText(0.0032)).toBe('3.2 mm')
  })
})

describe('a block on the tip of a wedge (D201)', () => {
  it('is no longer clamped there: it falls off instead of resting with huge opposite normal forces', () => {
    const s = emptyScene('wedge tip')
    addBody(s, { id: 'slope', name: '斜面', kind: 'static', shape: { type: 'polygon', points: [{ x: -1.5, y: 1.0 }, { x: 2.2, y: 1.95 }, { x: 2.2, y: 2.6 }, { x: -0.2, y: 2.65 }] }, position: { x: 0, y: 0 }, material: { muS: 1, muK: 1, restitution: 1 } })
    const b = addBody(s, { id: 'block', name: '物块', shape: { type: 'box', width: 0.8, height: 0.4 }, position: { x: 0.3, y: 3.6 }, mass: 1, material: { muS: 0.3, muK: 0.3, restitution: 0 } })
    const ball = addBody(s, { id: 'ball', name: '小球', kind: 'particle', shape: { type: 'circle', radius: 0.2 }, position: { x: 0.5, y: 3.0 }, mass: 0.5, material: { muS: 0.3, muK: 0.3, restitution: 0.6 } })
    addConnector<DamperDef>(s, { type: 'damper', name: '阻尼器', a: { body: b.id, local: { x: 0.1, y: -0.2 } }, b: { body: ball.id, local: { x: 0, y: 0 } }, damping: 2 })
    s.settings.duration = null
    const rec = simulate(s, { until: 7 })
    const info = rec.session.call<{ t: number; stopReason: string }>({ op: 'info' })
    // 26.59 before this fix: stopped "at rest" at t = 5.105 s, the block hanging under the tip (N = 367 N)
    expect(info.t).toBeGreaterThan(6.9)
    const st = rec.session.state(rec.frameCount - 1)
    expect(st[1]).toBeLessThan(0)
  })

  it('no block dropped on or near the tip of a wedge ends clamped (sweep of tip angles, positions, tilts and friction)', () => {
    const clamped: string[] = []
    for (const tipDeg of [15, 37, 70]) {
      const a0 = 10 * Math.PI / 180, a1 = a0 + tipDeg * Math.PI / 180
      const points = [{ x: 0, y: 0 }, { x: 3 * Math.cos(a0), y: 3 * Math.sin(a0) }, { x: 3 * Math.cos(a1), y: 3 * Math.sin(a1) }]
      for (const x of [-0.1, 0.2, 0.5, 0.8]) for (const angle of [0, 0.3, -0.3]) for (const mu of [0.3, 1]) {
        const s = emptyScene('tip')
        addBody(s, { id: 'wedge', name: 'w', kind: 'static', shape: { type: 'polygon', points }, position: { x: 0, y: 0 }, material: { muS: 1, muK: 1, restitution: 0.3 } })
        addBody(s, { id: 'b', name: 'b', shape: { type: 'box', width: 0.8, height: 0.4 }, position: { x, y: Math.tan(a1) * Math.max(x, 0) + 0.8 }, angle, mass: 1, material: { muS: mu, muK: mu, restitution: 0 } })
        s.settings.duration = null
        const rec = simulate(s, { until: 6 })
        const t = rec.session.call<{ t: number }>({ op: 'info' }).t
        const N = rec.session.call<{ N: number }>({ op: 'contactForces', frame: rec.frameCount - 1, on: 'b', by: 'wedge' }).N
        // A block at rest on the wedge carries its weight (≈ 9.8 N); a clamp carries hundreds
        if (t < 5.99 && N > 30) clamped.push(`${tipDeg}° x=${x} angle=${angle} μ=${mu}: t=${t.toFixed(3)} N=${N.toFixed(0)}`)
      }
    }
    expect(clamped).toEqual([])
  })
})
