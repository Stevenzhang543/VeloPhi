/**
 * 26.64 (D280): the sketch compiler. Every kind of surface, body, relation and connector is compiled from relations
 * alone and held against closed forms — positions exact to rounding (1e-12 m unless said otherwise), the engine's own
 * contact detection at t = 0 for "it rests where it was put", and textbook accelerations and forces from the engine's
 * run (relative 1e-6: the event-driven solver integrates to 1e-10). Dependency cycles and places fixed twice come back
 * as diagnostics.
 */
import { describe, expect, it } from 'vitest'
import { DEG, ask, body, bodyOf, codes, conn, contactAt0, extreme, firstEvent, ladder, sceneOf, sk, surface, val, valuesAt } from './helpers'
import { EngineSession } from '../../../src/engine/session'
import { frameView } from '../../../src/engine/views'

const G = 9.8
const near = (got: number, want: number, rel = 1e-6) => expect(Math.abs(got - want), `${got} vs ${want}`).toBeLessThanOrEqual(rel * Math.max(1, Math.abs(want)))

describe('surfaces and bodies on them', () => {
  it('a block on an incline (high end left or right): on the slope exactly, at the named place', () => {
    for (const side of ['left', 'right'] as const) {
      const th = 30 * DEG, L = 2
      const s = sk({
        surfaces: [surface('slope', 'incline', { side })],
        bodies: [body('A', 'block', 'on', 'slope', 'fromTop')],
        values: [val('slope', 'angle', 30, '°'), val('slope', 'length', 2, 'm'), val('A', 'mass', 2, 'kg'), val('A', 'distance', 50, 'cm'), val('A', 'width', 0.2, 'm'), val('A', 'height', 0.1, 'm'), val('A|slope', 'mu', 0.2)]
      })
      const scene = sceneOf(s)
      const A = bodyOf(scene, 'A')
      // the foot of the incline is the origin; the top is L·(∓cos θ, sin θ); the block's centre is 0.5 m down the slope and h/2 off it
      const sx = side === 'left' ? -1 : 1
      const top = { x: sx * L * Math.cos(th), y: L * Math.sin(th) }
      const want = { x: top.x - sx * 0.5 * Math.cos(th) - sx * 0.05 * Math.sin(th), y: top.y - 0.5 * Math.sin(th) + 0.05 * Math.cos(th) }
      expect(Math.abs(A.position.x - want.x)).toBeLessThan(1e-12)
      expect(Math.abs(A.position.y - want.y)).toBeLessThan(1e-12)
      near(A.angle, side === 'left' ? -th : th, 1e-12)
      // the engine agrees that it rests on the slope, and it slides with a = g(sin θ − μ cos θ)
      const c = contactAt0(scene, 'A', 'slope')
      expect(c.inContact).toBe(true)
      near(c.N, 2 * G * Math.cos(th))
      near(valuesAt(scene, ['A.a'], 0.2)[0], G * (Math.sin(th) - 0.2 * Math.cos(th)))
    }
  })

  it('places along a slope: top, bottom, middle, fromBottom, atHeight; one of length / height / base fixes its size', () => {
    const th = 37 * DEG
    const mk = (at: Parameters<typeof body>[4], extra = [] as ReturnType<typeof val>[], size = val('slope', 'height', 1.2, 'm')) => sceneOf(sk({
      surfaces: [surface('slope', 'incline', { side: 'left' })], bodies: [body('A', 'point', 'on', 'slope', at)],
      values: [val('slope', 'angle', 37, '°'), size, val('A', 'mass', 1, 'kg'), ...extra]
    }))
    const H = 1.2, L = H / Math.sin(th)
    // a point mass: its centre is the point of the slope
    const at = (sFromTop: number) => ({ x: -L * Math.cos(th) + sFromTop * Math.cos(th), y: H - sFromTop * Math.sin(th) })
    const check = (scene: ReturnType<typeof mk>, want: { x: number; y: number }) => { const p = bodyOf(scene, 'A').position; expect(Math.hypot(p.x - want.x, p.y - want.y)).toBeLessThan(1e-12) }
    // at an end a point mass stands 1 mm inside it (on the very corner it would rest on nothing)
    check(mk('top'), at(0.001))
    check(mk('bottom'), at(L - 0.001))
    check(mk('middle'), at(L / 2))
    check(mk('fromBottom', [val('A', 'distance', 0.5, 'm')]), at(L - 0.5))
    check(mk('atHeight', [val('A', 'heightAbove', 60, 'cm')]), at(L - 0.6 / Math.sin(th)))
    // base or length instead of height
    check(mk('fromTop', [val('A', 'distance', 0, 'm')], val('slope', 'base', 1.6, 'm')), { x: -1.6, y: 1.6 * Math.tan(th) })
    check(mk('fromTop', [val('A', 'distance', 0, 'm')], val('slope', 'length', 2, 'm')), { x: -2 * Math.cos(th), y: 2 * Math.sin(th) })
  })

  it('ground, table, wall and ceiling; a body next to a wall and next to another body', () => {
    const scene = sceneOf(sk({
      surfaces: [surface('floor', 'ground'), surface('table', 'table'), surface('wall', 'wall', { side: 'left' }), surface('top', 'ceiling')],
      bodies: [
        body('A', 'block', 'on', 'floor', 'rightOf', { ref2: 'wall' }), body('B', 'block', 'on', 'floor', 'rightOf', { ref2: 'A' }),
        body('C', 'ball', 'on', 'table', 'fromLeft'), body('D', 'cart', 'on', 'table', 'right')
      ],
      values: [val('table', 'height', 80, 'cm'), val('table', 'length', 1.5, 'm'), val('wall', 'distance', 1, 'm'), val('top', 'height', 3, 'm'),
        val('A', 'mass', 1, 'kg'), val('A', 'width', 0.3, 'm'), val('B', 'mass', 1, 'kg'), val('C', 'mass', 1, 'kg'), val('C', 'radius', 4, 'cm'), val('C', 'distance', 0.25, 'm'), val('D', 'mass', 1, 'kg')]
    }))
    // the wall's face is 1 m left of the origin; A stands against it, B against A
    near(bodyOf(scene, 'A').position.x, -1 + 0.15, 1e-12)
    near(bodyOf(scene, 'B').position.x, -1 + 0.3 + 0.1, 1e-12)
    near(bodyOf(scene, 'A').position.y, 0.1, 1e-12)
    // the ball: 0.25 m from the table's left end, its radius above the top; the cart flush with the right end
    expect(bodyOf(scene, 'C').position).toEqual({ x: 0.25, y: 0.8 + 0.04 })
    near(bodyOf(scene, 'D').position.x, 1.5 - 0.2, 1e-12)
    near(bodyOf(scene, 'D').position.y, 0.8 + 0.075, 1e-12)
    for (const [a, b] of [['A', 'floor'], ['B', 'floor'], ['C', 'table'], ['D', 'table']]) expect(contactAt0(scene, a, b).inContact, `${a} on ${b}`).toBe(true)
    // the ceiling's underside is 3 m up
    const top = bodyOf(scene, 'top')
    near(top.position.y - (top.shape.type === 'box' ? top.shape.height / 2 : 0), 3, 1e-12)
  })

  it('stacked bodies: a block on a board on the ground, and a block on a movable wedge', () => {
    const scene = sceneOf(sk({
      surfaces: [surface('floor', 'ground')],
      bodies: [body('board', 'board', 'on', 'floor', 'middle'), body('m', 'block', 'on', 'board', 'fromRight')],
      values: [val('board', 'mass', 2, 'kg'), val('board', 'length', 1.2, 'm'), val('board', 'height', 5, 'cm'), val('m', 'mass', 1, 'kg'), val('m', 'distance', 0.3, 'm')]
    }))
    expect(bodyOf(scene, 'board').position).toEqual({ x: 0, y: 0.025 })
    near(bodyOf(scene, 'm').position.x, 0.6 - 0.3, 1e-12)
    near(bodyOf(scene, 'm').position.y, 0.05 + 0.1, 1e-12)
    expect(contactAt0(scene, 'm', 'board').inContact).toBe(true)
    expect(contactAt0(scene, 'board', 'floor').N).toBeCloseTo(3 * G, 9)

    // a smooth wedge on a smooth floor: a_wedge = m g sinθ cosθ / (M + m sin²θ), away from the sliding block
    const th = 30 * DEG, M = 3, m = 1
    const w = sceneOf(sk({
      surfaces: [surface('floor', 'ground')],
      bodies: [body('wedge', 'wedge', 'on', 'floor', 'middle', { side: 'left' }), body('b', 'block', 'on', 'wedge', 'top')],
      values: [val('wedge', 'mass', M, 'kg'), val('wedge', 'slopeAngle', 30, '°'), val('wedge', 'base', 1.2, 'm'), val('b', 'mass', m, 'kg'), val('b', 'width', 0.12, 'm'), val('b', 'height', 0.08, 'm')]
    }))
    expect(contactAt0(w, 'b', 'wedge').inContact).toBe(true)
    expect(contactAt0(w, 'wedge', 'floor').inContact).toBe(true)
    near(valuesAt(w, ['wedge.ax'], 0.1)[0], -(m * G * Math.sin(th) * Math.cos(th)) / (M + m * Math.sin(th) ** 2))
    near(bodyOf(w, 'b').angle, -th, 1e-12)
  })

  it('round bodies roll: a disc and a ring on a rough incline', () => {
    const th = 30 * DEG
    const scene = sceneOf(sk({
      surfaces: [surface('slope', 'incline', { side: 'left' })],
      bodies: [body('disc', 'disc', 'on', 'slope', 'fromTop'), body('ring', 'ring', 'on', 'slope', 'fromTop')],
      values: [val('slope', 'angle', 30, '°'), val('slope', 'length', 4, 'm'), val('disc', 'mass', 1, 'kg'), val('disc', 'distance', 1.2, 'm'), val('ring', 'mass', 1, 'kg'), val('ring', 'distance', 0.4, 'm'), val('slope', 'mu', 0.8)]
    }))
    const [aDisc, aRing] = valuesAt(scene, ['disc.a', 'ring.a'], 0.2)
    near(aDisc, (2 / 3) * G * Math.sin(th))
    // a thin ring of finite thickness: between a hoop (½) and a little above it
    expect(aRing / (G * Math.sin(th))).toBeGreaterThan(0.5)
    expect(aRing / (G * Math.sin(th))).toBeLessThan(0.53)
  })

  it('a polygon stands on its lowest edge; steps carry a body on their landing', () => {
    const scene = sceneOf(sk({
      surfaces: [surface('floor', 'ground'), surface('stairs', 'steps', { side: 'right' })],
      bodies: [body('L', 'polygon', 'on', 'floor', 'fromLeft', { points: ['0 0', '0.4 0', '0.4 0.1', '0.1 0.1', '0.1 0.3', '0 0.3'] }), body('ball', 'ball', 'on', 'stairs', 'right', { moves: 'right' })],
      values: [val('L', 'mass', 1, 'kg'), val('L', 'distance', 1, 'm'), val('ball', 'mass', 0.1, 'kg'), val('ball', 'speed', 2, 'm/s'), val('stairs', 'count', 3), val('stairs', 'stepHeight', 20, 'cm'), val('stairs', 'stepDepth', 30, 'cm')]
    }))
    expect(contactAt0(scene, 'L', 'floor').inContact).toBe(true)
    // the landing is 3 × 0.2 m up; the ball leaves it and falls
    near(bodyOf(scene, 'ball').position.y, 0.6 + 0.05, 1e-12)
    expect(contactAt0(scene, 'ball', 'stairs').inContact).toBe(true)
    expect(bodyOf(scene, 'ball').velocity).toEqual({ x: 2, y: 0 })
  })
})

describe('arc tracks', () => {
  it('inside a bowl at an angle from its lowest point; the centre runs on the radius of the problem', () => {
    const R = 0.5, phi = 60 * DEG
    const scene = sceneOf(sk({
      surfaces: [surface('bowl', 'arc', { span: 'bowl' })], bodies: [body('ball', 'ball', 'inside', 'bowl', 'leftOfBottom')],
      values: [val('bowl', 'radius', 50, 'cm'), val('ball', 'mass', 0.2, 'kg'), val('ball', 'angle', 60, '°'), val('ball', 'radius', 2, 'cm')]
    }))
    const c = bodyOf(scene, 'bowl').position, p = bodyOf(scene, 'ball').position
    near(Math.hypot(p.x - c.x, p.y - c.y), R, 1e-12)
    near(p.x - c.x, -R * Math.sin(phi), 1e-12)
    expect(contactAt0(scene, 'ball', 'bowl').inContact).toBe(true)
    // released from rest: v at the bottom = √(2gR(1 − cos φ)), N = mg(3 − 2 cos φ)
    near(extreme(scene, 'ball.v', 'max', 1.2), Math.sqrt(2 * G * R * (1 - Math.cos(phi))))
    near(extreme(scene, 'contact.ball|bowl.N', 'max', 1.2), 0.2 * G * (3 - 2 * Math.cos(phi)))
  })

  it('a full loop entered at the bottom, a standing half circle, and a hump with the body outside', () => {
    const R = 0.5, v0 = 6, m = 0.1
    const loop = sceneOf(sk({
      surfaces: [surface('loop', 'arc', { span: 'full' })], bodies: [body('ball', 'point', 'inside', 'loop', 'bottom', { moves: 'right' })],
      values: [val('loop', 'radius', 0.5, 'm'), val('ball', 'mass', m, 'kg'), val('ball', 'speed', v0, 'm/s')]
    }))
    // at the bottom N = mg + m v₀²/R; at the top v² = v₀² − 4gR and the smallest N = m v²/R − mg
    near(contactAt0(loop, 'ball', 'loop').N, m * G + (m * v0 * v0) / R)
    near(extreme(loop, 'contact.ball|loop.N', 'min', 1), (m * (v0 * v0 - 4 * G * R)) / R - m * G, 1e-5)

    const half = sceneOf(sk({
      surfaces: [surface('floor', 'ground'), surface('track', 'arc', { span: 'half', side: 'right' })], bodies: [body('ball', 'point', 'inside', 'track', 'bottom', { moves: 'right' })],
      values: [val('track', 'radius', 0.4, 'm'), val('ball', 'mass', m, 'kg'), val('ball', 'speed', 5, 'm/s')]
    }))
    // the track's lower end is let into the floor: the ball starts on the floor and glides onto the track, round to its
    // upper end at 2R (v² there = v₀² − 4gR > gR), losing nothing that shows in six digits
    near(contactAt0(half, 'ball', 'track').N, m * G + (m * 25) / 0.4)
    near(extreme(half, 'ball.y', 'max', 0.5), 0.8)
    near(valuesAt(half, ['system.e'], 0.3)[0], 0.5 * m * 25)

    const hump = sceneOf(sk({
      surfaces: [surface('floor', 'ground'), surface('bridge', 'arc', { span: 'hump' })], bodies: [body('car', 'ball', 'outside', 'bridge', 'top', { moves: 'right' })],
      values: [val('bridge', 'radius', 5, 'm'), val('car', 'mass', 1, 'kg'), val('car', 'speed', 3, 'm/s')]
    }))
    // on top of the hump: mg − N = m v²/R
    near(contactAt0(hump, 'car', 'bridge').N, 1 * G - (1 * 9) / 5)
  })
})

describe('pulleys and ropes', () => {
  const table = (extra: Partial<Parameters<typeof sk>[0]> = {}) => sk({
    surfaces: [surface('floor', 'ground'), surface('table', 'table')],
    bodies: [body('A', 'block', 'on', 'table', 'middle'), body('B', 'block', 'hanging', 'rope1', 'below', { ref2: 'floor' })],
    pulleys: [{ id: 'P', name: 'P', at: 'table.rightEnd' }],
    connectors: [conn('rope1', 'rope', ['A.right', 'P', 'B.top'], 'taut')],
    values: [val('A', 'mass', 2, 'kg'), val('A|table', 'mu', 0.2), val('B', 'mass', 1, 'kg'), val('B', 'heightAbove', 0.6, 'm'), val('B', 'width', 0.14, 'm'), val('B', 'height', 0.14, 'm')],
    ...extra
  })

  it('a pulley at the table\'s edge: tangent to the rope along the table, the hanging block plumb and clear of the edge', () => {
    const scene = sceneOf(table())
    const A = bodyOf(scene, 'A'), B = bodyOf(scene, 'B'), P = scene.pulleys[0]
    // the rope leaves A's right face at its mid-height: the wheel's top is at that height
    near(P.position.y + P.radius, A.position.y, 1e-12)
    // B hangs under the wheel's right side, its bottom 0.6 m above the floor, clear of the table's edge (x = 2)
    near(B.position.x, P.position.x + P.radius, 1e-12)
    near(B.position.y, 0.6 + 0.07, 1e-12)
    expect(B.position.x - 0.07).toBeGreaterThan(2)
    expect(scene.connectors[0]).toMatchObject({ type: 'rope', pulleys: [{ pulley: 'P', wrap: 'cw' }], length: null })
    // the engine's rope: taut, horizontal to the wheel, vertical from it
    const s = EngineSession.create(scene)
    const r = frameView(s, 0).ropes[0]
    s.free()
    expect(r.taut).toBe(true)
    const p = Array.from(r.points)
    expect(Math.abs(p[1] - p[3])).toBeLessThan(1e-12)
    expect(Math.abs(p[4] - p[6])).toBeLessThan(1e-12)
    // a = (m_B − μ m_A) g / (m_A + m_B) = 1.96 m/s², T = m_B (g − a) = 7.84 N
    const [a, T] = valuesAt(scene, ['A.a', 'rope1.T'], 0.2)
    near(a, 1.96)
    near(T, 7.84)
  })

  it('a pulley at the top of an incline; an Atwood machine under the ceiling', () => {
    const th = 30 * DEG, m1 = 1, m2 = 1, mu = 0.1
    const scene = sceneOf(sk({
      surfaces: [surface('floor', 'ground'), surface('slope', 'incline', { side: 'right' })],
      bodies: [body('A', 'block', 'on', 'slope', 'middle'), body('B', 'block', 'hanging', 'rope1', 'below')],
      pulleys: [{ id: 'P', name: 'P', at: 'slope.top' }],
      connectors: [conn('rope1', 'rope', ['A.center', 'P', 'B.top'])],
      values: [val('slope', 'angle', 30, '°'), val('slope', 'length', 2, 'm'), val('A', 'mass', m1, 'kg'), val('B', 'mass', m2, 'kg'), val('A|slope', 'mu', mu)]
    }))
    // B hangs beyond the high end; the rope runs up the slope parallel to it
    expect(bodyOf(scene, 'B').position.x).toBeGreaterThan(2 * Math.cos(th))
    near(valuesAt(scene, ['A.a'], 0.1)[0], ((m2 - m1 * Math.sin(th) - mu * m1 * Math.cos(th)) * G) / (m1 + m2))

    const atwood = sceneOf(sk({
      surfaces: [surface('top', 'ceiling')],
      bodies: [body('m1', 'block', 'hanging', 'rope', 'below'), body('m2', 'block', 'hanging', 'rope', 'below')],
      pulleys: [{ id: 'P', name: 'P', at: 'top' }],
      connectors: [conn('rope', 'rope', ['m1.top', 'P', 'm2.top'])],
      values: [val('m1', 'mass', 1, 'kg'), val('m2', 'mass', 1.5, 'kg'), val('P', 'radius', 12, 'cm')]
    }))
    const P = atwood.pulleys[0]
    near(bodyOf(atwood, 'm1').position.x, P.position.x - 0.12, 1e-12)
    near(bodyOf(atwood, 'm2').position.x, P.position.x + 0.12, 1e-12)
    near(valuesAt(atwood, ['m2.a', 'rope.T'], 0.1)[0], (0.5 * G) / 2.5)
    near(valuesAt(atwood, ['m2.a', 'rope.T'], 0.1)[1], (2 * 1 * 1.5 * G) / 2.5)
  })

  it('a given rope length moves the hanging body until the engine measures that length', () => {
    const s = table({ values: [val('A', 'mass', 2, 'kg'), val('B', 'mass', 1, 'kg'), val('rope1', 'length', 1.5, 'm')] })
    s.bodies[1].ref2 = ''
    const scene = sceneOf(s)
    const e = EngineSession.create(scene)
    const len = frameView(e, 0).ropes[0].length
    e.free()
    near(len, 1.5, 1e-9)
  })

  it('a pendulum from a fixed point, deflected by an angle; the rope is as long as given', () => {
    const L = 1, th = 30 * DEG
    const scene = sceneOf(sk({
      bodies: [body('bob', 'ball', 'hanging', 'rope', 'left')],
      connectors: [conn('rope', 'rope', ['fixed', 'bob.center'])],
      values: [val('bob', 'mass', 0.5, 'kg'), val('bob', 'angle', 30, '°'), val('rope', 'length', 100, 'cm')]
    }))
    const rope = scene.connectors[0]
    if (rope.type !== 'rope') throw new Error('rope expected')
    const pivot = rope.a.local, p = bodyOf(scene, 'bob').position
    near(p.x - pivot.x, -L * Math.sin(th), 1e-12)
    near(pivot.y - p.y, L * Math.cos(th), 1e-12)
    near(extreme(scene, 'bob.v', 'max', 1.2), Math.sqrt(2 * G * L * (1 - Math.cos(th))))
  })
})

describe('springs, rods, hinges and forces', () => {
  it('a spring of given compression fixes where the block stands; the engine reads that deformation', () => {
    const scene = sceneOf(sk({
      surfaces: [surface('floor', 'ground'), surface('wall', 'wall', { side: 'left' })],
      bodies: [body('A', 'block', 'on', 'floor', 'connector')],
      connectors: [conn('s', 'spring', ['wall', 'A.left'], 'fastened')],
      values: [val('s', 'stiffness', 100, 'N/m'), val('s', 'naturalLength', 40, 'cm'), val('s', 'compression', 10, 'cm'), val('A', 'mass', 0.5, 'kg'), val('wall', 'distance', 1, 'm')]
    }))
    // wall face at −1 m; the spring is 0.3 m long; the block's left face is there
    near(bodyOf(scene, 'A').position.x, -1 + 0.3 + 0.1, 1e-12)
    const [x, ax] = valuesAt(scene, ['s.x', 'A.ax'], 0)
    near(x, -0.1, 1e-9)
    near(ax, (100 * 0.1) / 0.5)
    near(extreme(scene, 'A.v', 'max', 1), 0.1 * Math.sqrt(100 / 0.5))
  })

  it('a spring that is not fastened lets go at its natural length; two blocks joined by a spring', () => {
    const scene = sceneOf(sk({
      surfaces: [surface('floor', 'ground'), surface('wall', 'wall', { side: 'left' })],
      bodies: [body('A', 'block', 'on', 'floor', 'connector')],
      connectors: [conn('s', 'spring', ['wall', 'A.left'], 'notFastened')],
      values: [val('s', 'stiffness', 200, 'N/m'), val('s', 'compression', 0.1, 'm'), val('A', 'mass', 0.5, 'kg')]
    }))
    expect(scene.connectors[0]).toMatchObject({ type: 'spring', pushOnly: true, b: { body: 'A' } })
    // ½kx² = ½mv²: it leaves the spring at v = x√(k/m) and keeps that speed
    expect(firstEvent(scene, 'springRelease', 1)).toBeGreaterThan(0)
    near(valuesAt(scene, ['A.v'], 0.8)[0], 0.1 * Math.sqrt(200 / 0.5))

    const two = sceneOf(sk({
      surfaces: [surface('floor', 'ground')],
      bodies: [body('b1', 'block', 'on', 'floor', 'fromLeft', { moves: 'right' }), body('b2', 'block', 'on', 'floor', 'connector')],
      connectors: [conn('s', 'spring', ['b1.right', 'b2.left'])],
      values: [val('b1', 'mass', 1, 'kg'), val('b1', 'distance', 0.5, 'm'), val('b1', 'speed', 2, 'm/s'), val('b2', 'mass', 2, 'kg'), val('s', 'stiffness', 50, 'N/m'), val('s', 'naturalLength', 0.5, 'm')]
    }))
    near(bodyOf(two, 'b2').position.x - bodyOf(two, 'b1').position.x, 0.5 + 0.2, 1e-12)
    // the spring is shortest at the common velocity m₁v₀/(m₁ + m₂): ½·(m₁m₂/(m₁+m₂))·v₀² = ½ k x²
    near(extreme(two, 's.x', 'min', 2), -2 * Math.sqrt((1 * 2) / 3 / 50))
  })

  it('a body hanging from a vertical spring, and standing on one, at equilibrium: it stays there', () => {
    const hang = sceneOf(sk({
      surfaces: [surface('top', 'ceiling')],
      bodies: [body('m', 'ball', 'hanging', 's', 'equilibrium')],
      connectors: [conn('s', 'spring', ['top', 'm.top'])],
      values: [val('m', 'mass', 0.5, 'kg'), val('s', 'stiffness', 20, 'N/m'), val('s', 'naturalLength', 0.5, 'm')]
    }))
    // x₀ = mg/k below the natural length, and no acceleration
    near(valuesAt(hang, ['s.x', 'm.a'], 0)[0], (0.5 * G) / 20, 1e-9)
    expect(Math.abs(valuesAt(hang, ['s.x', 'm.a'], 0)[1])).toBeLessThan(1e-9)
    const stand = sceneOf(sk({
      surfaces: [surface('floor', 'ground')],
      bodies: [body('m', 'block', 'on', 's', 'equilibrium')],
      connectors: [conn('s', 'spring', ['floor', 'm.bottom'])],
      values: [val('m', 'mass', 1, 'kg'), val('s', 'stiffness', 400, 'N/m'), val('s', 'naturalLength', 0.3, 'm')]
    }))
    near(bodyOf(stand, 'm').position.y, 0.3 - G / 400 + 0.1, 1e-12)
    expect(Math.abs(valuesAt(stand, ['m.a'], 0)[0])).toBeLessThan(1e-9)
  })

  it('a rod hinged at its end and released level; a light rod as a connector; forces by direction', () => {
    const L = 1
    const scene = sceneOf(sk({
      bodies: [body('rod', 'rod', 'hanging', 'pin', 'right')],
      connectors: [conn('pin', 'hinge', ['fixed', 'rod.left'])],
      values: [val('rod', 'mass', 1, 'kg'), val('rod', 'length', 1, 'm')]
    }))
    expect(Math.abs(bodyOf(scene, 'rod').angle)).toBeLessThan(1e-12)
    // a thin rod about its end: α = 3g/(2L)
    near(Math.abs(valuesAt(scene, ['rod.alpha'], 0)[0]), (3 * G) / (2 * L))

    const pend = sceneOf(sk({
      bodies: [body('bob', 'point', 'hanging', 'r', 'below', { moves: 'right' })],
      connectors: [conn('r', 'rod', ['fixed', 'bob.center'])],
      values: [val('bob', 'mass', 0.2, 'kg'), val('bob', 'speed', 4.5, 'm/s'), val('r', 'length', 0.5, 'm')]
    }))
    // a ball on a light rod: at the top v² = v₀² − 4gL (the rod can push)
    near(extreme(pend, 'bob.v', 'min', 2), Math.sqrt(4.5 * 4.5 - 4 * G * 0.5))

    const th = 37 * DEG
    const pull = sceneOf(sk({
      surfaces: [surface('floor', 'ground'), surface('slope', 'incline', { side: 'left', at: 'floor x=-3m' })],
      bodies: [body('A', 'block', 'on', 'floor', 'middle'), body('B', 'block', 'on', 'slope', 'bottom')],
      connectors: [conn('F', 'force', ['A.center'], 'angle'), conn('F2', 'force', ['B.center'], 'upSlope')],
      values: [val('A', 'mass', 2, 'kg'), val('A|floor', 'mu', 0.5), val('F', 'magnitude', 20, 'N'), val('F', 'angle', 37, '°'), val('B', 'mass', 1, 'kg'), val('slope', 'angle', 30, '°'), val('slope', 'length', 2, 'm'), val('F2', 'magnitude', 10, 'N')]
    }))
    // a = (F cos α − μ (mg − F sin α)) / m on the floor; (F − mg sin θ)/m up the smooth slope
    const [a, aB] = valuesAt(pull, ['A.ax', 'B.a'], 0.1)
    near(a, (20 * Math.cos(th) - 0.5 * (2 * G - 20 * Math.sin(th))) / 2)
    near(aB, (10 - 1 * G * Math.sin(30 * DEG)) / 1)
  })

  it('two blocks side by side pushed by a force: the push between them', () => {
    const scene = sceneOf(sk({
      surfaces: [surface('floor', 'ground')],
      bodies: [body('A', 'block', 'on', 'floor', 'middle'), body('B', 'block', 'on', 'floor', 'rightOf', { ref2: 'A' })],
      connectors: [conn('F', 'force', ['A.left'], 'right')],
      values: [val('A', 'mass', 2, 'kg'), val('B', 'mass', 1, 'kg'), val('F', 'magnitude', 6, 'N')]
    }))
    const [a, N] = valuesAt(scene, ['A.ax', 'contact.B|A.N'], 0.1)
    near(a, 2)
    near(N, 2)
  })
})

describe('bodies in the air', () => {
  it('a height above a surface, or coordinates; launched at an angle', () => {
    const scene = sceneOf(sk({
      surfaces: [surface('floor', 'ground')],
      bodies: [body('a', 'ball', 'air', '', '', { ref2: 'floor', moves: 'angle' }), body('b', 'point', 'air', '', '')],
      values: [val('a', 'mass', 0.1, 'kg'), val('a', 'heightAbove', 2, 'm'), val('a', 'speed', 6, 'm/s'), val('a', 'launchAngle', 30, '°'), val('a', 'radius', 3, 'cm'), val('b', 'mass', 1, 'kg'), val('b', 'x', 4, 'm'), val('b', 'y', 150, 'cm')],
      questions: [ask('t', 'event', { event: 'impact', body: 'a' })]
    }))
    expect(bodyOf(scene, 'a').position).toEqual({ x: 0, y: 2.03 })
    near(bodyOf(scene, 'a').velocity.x, 6 * Math.cos(30 * DEG), 1e-12)
    expect(bodyOf(scene, 'b').position).toEqual({ x: 4, y: 1.5 })
    // b falls 1.5 m: t = √(2h/g); a: 2 + 3t − ½gt² = 0
    near(firstEvent(scene, 'impact', 2), Math.sqrt(3 / G), 1e-9)
  })
})

describe('what cannot be placed is said, not guessed', () => {
  it('a cycle of places', () => {
    const l = ladder(sk({
      surfaces: [surface('floor', 'ground')],
      bodies: [body('A', 'block', 'on', 'B', 'middle'), body('B', 'block', 'on', 'A', 'middle')],
      values: [val('A', 'mass', 1, 'kg'), val('B', 'mass', 1, 'kg')]
    }))
    expect(codes(l)).toEqual(['L2.cycle'])
    expect(l.diagnostics[0].got).toMatch(/A, B wait for each other/)
    expect(l.scene).toBeNull()
    expect(l.placed).toEqual(['floor'])
    expect(l.unplaced).toEqual(['A', 'B'])
    // two blocks that each stand where the spring between them puts them
    const l2 = ladder(sk({
      surfaces: [surface('floor', 'ground')],
      bodies: [body('A', 'block', 'on', 'floor', 'connector'), body('B', 'block', 'on', 'floor', 'connector')],
      connectors: [conn('s', 'spring', ['A.right', 'B.left'])],
      values: [val('A', 'mass', 1, 'kg'), val('B', 'mass', 1, 'kg'), val('s', 'stiffness', 10, 'N/m')]
    }))
    expect(codes(l2)).toEqual(['L2.cycle'])
  })

  it('places fixed twice: sizes of an incline that disagree, a rod longer than the distance of its ends', () => {
    const l = ladder(sk({
      surfaces: [surface('slope', 'incline', { side: 'left' })], bodies: [body('A', 'block', 'on', 'slope', 'top')],
      values: [val('slope', 'angle', 30, '°'), val('slope', 'length', 2, 'm'), val('slope', 'height', 1.5, 'm'), val('A', 'mass', 1, 'kg')]
    }))
    expect(codes(l)).toEqual(['L2.overconstrained'])
    expect(l.diagnostics[0]).toMatchObject({ path: 'values[2]', got: '1.5 m' })
    expect(l.diagnostics[0].expected).toContain('height = 1 m')
    const l2 = ladder(sk({
      surfaces: [surface('floor', 'ground')],
      bodies: [body('A', 'block', 'on', 'floor', 'fromLeft'), body('B', 'block', 'on', 'floor', 'fromLeft')],
      connectors: [conn('r', 'rod', ['A.right', 'B.left'])],
      values: [val('A', 'mass', 1, 'kg'), val('A', 'distance', 0.5, 'm'), val('B', 'mass', 1, 'kg'), val('B', 'distance', 1.5, 'm'), val('r', 'length', 0.5, 'm')]
    }))
    expect(codes(l2)).toEqual(['L2.overconstrained'])
    expect(l2.diagnostics[0].expected).toContain('0.8 m')
  })

  it('a place beyond the support, a body larger than its support', () => {
    const l = ladder(sk({
      surfaces: [surface('table', 'table')], bodies: [body('A', 'block', 'on', 'table', 'fromLeft')],
      values: [val('table', 'length', 2, 'm'), val('A', 'mass', 1, 'kg'), val('A', 'distance', 5, 'm')]
    }))
    expect(codes(l)).toEqual(['L2.offSupport'])
    expect(l.diagnostics[0]).toMatchObject({ path: 'bodies[0]', got: '5 m from its left end' })
    const l2 = ladder(sk({
      surfaces: [surface('floor', 'ground')], bodies: [body('board', 'board', 'on', 'floor', 'middle'), body('A', 'block', 'on', 'board', 'left')],
      values: [val('board', 'mass', 1, 'kg'), val('board', 'length', 0.3, 'm'), val('A', 'mass', 1, 'kg'), val('A', 'width', 0.5, 'm')]
    }))
    expect(codes(l2)).toEqual(['L2.offSupport'])
  })
})
