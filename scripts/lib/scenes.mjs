/**
 * Scene generators shared by the parity harnesses (scripts/parity.mjs, scripts/calc-parity.mjs): the golden and
 * special scenes and the random scenes of 26.50–26.52. `V` is the TypeScript bundle of the harness (scene builders,
 * templates).
 */
export function sceneGenerators(V) {
  /** The golden scenes of tests/golden.test.ts and the special scenes of tests/streaming.test.ts. */
  function goldenScenes() {
    const { emptyScene, addGround, addBody, addConnector, anchor } = V
    const out = []
    {
      const s = emptyScene('stack'); s.settings.gravity = { x: 0, y: -9.8 }
      addGround(s, { top: 0, material: { muS: 0.5, muK: 0.4 } })
      for (let i = 0; i < 4; i++) addBody(s, { name: `b${i}`, shape: { type: 'box', width: 0.4, height: 0.2 }, position: { x: 0, y: 0.1 + 0.2 * i }, mass: 1, material: { muS: 0.5, muK: 0.4 } })
      s.settings.duration = 2
      out.push(['golden/stack', s, 'a6166126217a71a732c4ced8af1e3b7d58ba283e00a60eb0570ebf1f382d9152'])
    }
    {
      const s = emptyScene('bounce'); s.settings.gravity = { x: 0, y: -9.8 }
      addGround(s, { top: 0, material: { restitution: 1 } })
      addBody(s, { name: 'ball', kind: 'particle', shape: { type: 'circle', radius: 0.05 }, position: { x: 0, y: 1 }, mass: 0.2, material: { restitution: 0.8 } })
      s.settings.duration = 12
      out.push(['golden/bounce', s, '37a3457ffc375e0e6b9ccce5b661cb50353a3a9083f86b760b94a72502a5a8ee'])
    }
    {
      const s = emptyScene('edge'); s.settings.gravity = { x: 0, y: -9.8 }
      addGround(s, { top: 0, left: -3, right: 3 })
      addBody(s, { name: 'table', kind: 'static', shape: { type: 'box', width: 1, height: 0.8 }, position: { x: -0.5, y: 0.4 }, material: { muS: 0.2, muK: 0.2 } })
      addBody(s, { name: 'block', shape: { type: 'box', width: 0.2, height: 0.1 }, position: { x: -0.5, y: 0.85 }, velocity: { x: 2, y: 0 }, mass: 1, material: { muS: 0.2, muK: 0.2 } })
      s.settings.duration = 1.5
      out.push(['golden/edge', s, '596b7fb6f7ff400cc4d9434725915158e5c46fab834fd193ef557f18bbbd1fcb'])
    }
    {
      const s = emptyScene('spring2'); s.settings.gravity = { x: 0, y: -9.8 }
      addGround(s, { top: 0, material: { muS: 0.3, muK: 0.2 } })
      const a = addBody(s, { name: 'a', shape: { type: 'box', width: 0.2, height: 0.2 }, position: { x: 0, y: 0.1 }, mass: 1, velocity: { x: -1, y: 0 }, material: { muS: 0.3, muK: 0.2 } })
      const b = addBody(s, { name: 'b', shape: { type: 'box', width: 0.2, height: 0.2 }, position: { x: 0.7, y: 0.1 }, mass: 2, velocity: { x: 1, y: 0 }, material: { muS: 0.3, muK: 0.2 } })
      addConnector(s, { name: 'k', type: 'spring', a: anchor(a, { x: 0.1, y: 0 }), b: anchor(b, { x: -0.1, y: 0 }), stiffness: 40, restLength: null, damping: 0 })
      s.settings.duration = 4
      out.push(['golden/spring2', s, '80348bded52c5e5b3642766932cfe2d8d4c7fac3d8ee98fb43778f27c3e1df3e'])
    }
    {
      const s = emptyScene('mixed'); s.settings.gravity = { x: 0, y: -9.8 }
      addGround(s, { id: 'ground', top: 0, left: -5, right: 20, material: { muS: 0.4, muK: 0.3, restitution: 1 } })
      const b = addBody(s, { id: 'box', name: '物块', shape: { type: 'box', width: 0.2, height: 0.2 }, position: { x: 0, y: 0.1 }, mass: 1, material: { muS: 0.4, muK: 0.3 } })
      addConnector(s, { id: 'F', name: 'F', type: 'force', a: anchor(b), force: { x: 0, y: 0 }, expr: { x: 'if(t < 0.4, 6, -1) + 2*step(t - 0.9)', y: '0' } })
      addBody(s, { id: 'disc', name: '圆盘', shape: { type: 'circle', radius: 0.08 }, position: { x: 2, y: 0.6 }, velocity: { x: 1, y: 0 }, angularVelocity: 12, mass: 0.5, material: { muS: 0.5, muK: 0.4, restitution: 0.6 } })
      s.settings.legacyDuration = 1.6
      out.push(['special/mixed', s, null])
    }
    {
      const s = emptyScene('pile'); s.settings.gravity = { x: 0, y: -9.8 }
      const mat = { muS: 0.5, muK: 0.4, restitution: 0.3 }
      addGround(s, { top: 0, left: -4, right: 4, material: mat })
      for (let i = 0; i < 3; i++) addBody(s, { name: `底${i}`, shape: { type: 'box', width: 0.2, height: 0.2 }, position: { x: -0.22 + 0.22 * i, y: 0.1 }, mass: 1, material: mat })
      for (let i = 0; i < 2; i++) addBody(s, { name: `块${i}`, shape: { type: 'box', width: 0.14, height: 0.1 }, position: { x: -0.1 + 0.21 * i, y: 0.6 + 0.1 * i }, angle: 0.3 * i, mass: 0.5, material: mat })
      s.settings.legacyDuration = 0.6
      s.settings.integrator = 'moreau'
      out.push(['special/pile', s, null])
    }
    {
      const s = V.buildTemplate('board-block')
      s.settings.stopAt = { on: 'stick', after: 1 }
      out.push(['special/board-block-stopAt', s, null, null])
    }
    {
      const s = emptyScene('bounce-unbounded'); s.settings.gravity = { x: 0, y: -9.8 }
      addGround(s, { top: 0, material: { restitution: 1 } })
      addBody(s, { name: 'ball', kind: 'particle', shape: { type: 'circle', radius: 0.05 }, position: { x: 0, y: 1 }, mass: 0.2, material: { restitution: 0.8 } })
      s.settings.legacyDuration = 12
      out.push(['special/bounce-rest', s, null, null])
    }
    return out
  }

  /** A random scene: boxes, circles, a triangle, ground or incline (maybe a belt), ropes, springs, rods, hinges,
   * pulleys, constant and expression forces, random materials and integrators; bounded, 1–3 s. */
  function randomScene(rng, idx) {
    const { emptyScene, addGround, addBody, addConnector, addIncline, addPulley, anchor } = V
    const r = (a, b) => a + (b - a) * rng()
    const pick = a => a[Math.floor(rng() * a.length)]
    const chance = p => rng() < p
    const round = (x, d = 3) => Math.round(x * 10 ** d) / 10 ** d
    const s = emptyScene(`random-${idx}`)
    s.settings.gravity = { x: chance(0.1) ? round(r(-1, 1)) : 0, y: -pick([9.8, 9.81, 10, 1.62, 9.8]) }
    s.settings.duration = round(r(1, 3), 2)
    s.settings.integrator = chance(0.82) ? 'dopri5' : pick(['rk4', 'euler', 'moreau'])
    s.settings.outputStep = chance(0.8) ? 1 / 600 : pick([1 / 300, 1 / 1000, 0.01, 1 / 240])
    if (chance(0.15)) { s.settings.relTol = pick([1e-8, 1e-9, 1e-11]); s.settings.absTol = pick([1e-10, 1e-12]) }
    const mat = () => {
      const muS = chance(0.3) ? 0 : round(r(0, 0.9), 2)
      return { muS, muK: chance(0.85) ? round(muS * r(0.5, 1), 2) : round(r(0, 0.9), 2), restitution: chance(0.4) ? 0 : round(r(0, 1), 2) }
    }
    let groundTop = 0
    if (chance(0.78)) {
      groundTop = round(r(-0.2, 0.2), 2)
      addGround(s, { id: 'ground', top: groundTop, left: -6, right: 12, material: mat(), beltSpeed: chance(0.12) ? round(r(-3, 3), 2) : 0, role: 'ground' })
    } else {
      addIncline(s, { id: 'slope', angle: r(0.15, 0.8), base: round(r(2, 5), 2), material: mat(), beltSpeed: chance(0.1) ? round(r(-2, 2), 2) : 0 })
      addGround(s, { id: 'floor', top: 0, left: -1, right: 12, material: mat() })
    }
    const n = 1 + Math.floor(rng() * 4)
    const bodies = []
    for (let i = 0; i < n; i++) {
      const kind = rng()
      const x = round(-1.5 + i * r(0.7, 1.1), 3)
      let body
      if (kind < 0.45) {
        const w = round(r(0.1, 0.4)), h = round(r(0.1, 0.35))
        const resting = chance(0.4)
        body = addBody(s, { id: `b${i}`, name: `块${i}`, shape: { type: 'box', width: w, height: h }, position: { x, y: resting ? groundTop + h / 2 : round(groundTop + h / 2 + r(0.05, 1.2)) }, angle: chance(0.3) ? round(r(-0.6, 0.6)) : 0, velocity: { x: chance(0.5) ? round(r(-3, 3)) : 0, y: chance(0.3) ? round(r(-2, 2)) : 0 }, angularVelocity: chance(0.2) ? round(r(-5, 5)) : 0, mass: round(r(0.1, 3)), fixedRotation: chance(0.15), material: mat() })
      } else if (kind < 0.85) {
        const rad = round(r(0.04, 0.2))
        body = addBody(s, { id: `b${i}`, name: `球${i}`, kind: chance(0.4) ? 'particle' : 'rigid', role: 'ball', shape: { type: 'circle', radius: rad }, position: { x, y: chance(0.3) ? groundTop + rad : round(groundTop + rad + r(0.05, 1.5)) }, velocity: { x: chance(0.6) ? round(r(-4, 4)) : 0, y: chance(0.3) ? round(r(-2, 3)) : 0 }, angularVelocity: chance(0.3) ? round(r(-10, 10)) : 0, mass: round(r(0.05, 2)), material: mat() })
      } else {
        const a = round(r(0.15, 0.35)), b = round(r(0.1, 0.3))
        const off = chance(0.3) ? round(r(0.01, 0.05)) : 0
        body = addBody(s, { id: `b${i}`, name: `楔${i}`, shape: { type: 'polygon', points: [{ x: -a / 3 + off, y: -b / 3 }, { x: 2 * a / 3 + off, y: -b / 3 }, { x: -a / 3 + off, y: 2 * b / 3 }] }, position: { x, y: round(groundTop + b / 3 + r(0, 0.8)) }, mass: round(r(0.2, 2)), fixedRotation: chance(0.3), material: mat() })
      }
      bodies.push(body)
    }
    // Connectors
    const nc = Math.floor(rng() * 3.5)
    for (let c = 0; c < nc; c++) {
      const b = pick(bodies), o = pick(bodies)
      const kind = rng()
      if (kind < 0.25) {
        addConnector(s, { id: `k${c}`, name: `弹簧${c}`, type: 'spring', a: anchor(b), b: o !== b && chance(0.6) ? anchor(o) : anchor(null, { x: b.position.x + round(r(-0.5, 0.5)), y: b.position.y + round(r(0.3, 1)) }), stiffness: round(r(5, 150)), restLength: chance(0.5) ? null : round(r(0.2, 1)), damping: chance(0.5) ? 0 : round(r(0, 2)) })
      } else if (kind < 0.45) {
        addConnector(s, { id: `r${c}`, name: `绳${c}`, type: 'rope', a: anchor(null, { x: b.position.x + round(r(-0.4, 0.4)), y: b.position.y + round(r(0.3, 1.2)) }), b: anchor(b), pulleys: [], length: chance(0.6) ? null : round(r(0.3, 1.5)) })
      } else if (kind < 0.55 && o !== b) {
        const px = (b.position.x + o.position.x) / 2, py = Math.max(b.position.y, o.position.y) + round(r(0.5, 1.2))
        const p = addPulley(s, { id: `p${c}`, name: `滑轮${c}`, position: { x: round(px), y: round(py) }, radius: chance(0.3) ? 0 : round(r(0.03, 0.1)) })
        addConnector(s, { id: `r${c}`, name: `绳${c}`, type: 'rope', a: anchor(b), b: anchor(o), pulleys: [{ pulley: p.id, wrap: pick(['cw', 'ccw']) }], length: null })
      } else if (kind < 0.6 && o !== b && chance(0.5)) {
        // Movable pulley on b, rope from the ceiling under it and over a fixed pulley to o
        const rad = round(r(0.03, 0.08))
        const pm = addPulley(s, { id: `pm${c}`, name: `动滑轮${c}`, position: { x: 0, y: round(r(0.05, 0.15)) }, radius: rad, body: b.id })
        const pf = addPulley(s, { id: `pf${c}`, name: `定滑轮${c}`, position: { x: round(b.position.x + 2 * rad), y: round(b.position.y + r(0.8, 1.4)) }, radius: rad })
        addConnector(s, { id: `r${c}`, name: `绳${c}`, type: 'rope', a: anchor(null, { x: round(b.position.x - rad), y: round(b.position.y + r(0.8, 1.4)) }), b: anchor(o), pulleys: [{ pulley: pm.id, wrap: 'ccw' }, { pulley: pf.id, wrap: 'cw' }], length: null })
      } else if (kind < 0.65) {
        if (o !== b && chance(0.4)) addConnector(s, { id: `d${c}`, name: `杆${c}`, type: chance(0.5) ? 'rod' : 'rope', a: anchor(b), b: anchor(o), length: null, pulleys: [] })
        else addConnector(s, { id: `d${c}`, name: `杆${c}`, type: 'rod', a: anchor(null, { x: b.position.x + round(r(-0.3, 0.3)), y: b.position.y + round(r(0.3, 0.9)) }), b: anchor(b), length: null })
      } else if (kind < 0.75) {
        const local = { x: round(r(-0.05, 0.05)), y: round(r(-0.05, 0.05)) }
        const c0 = Math.cos(b.angle), s0 = Math.sin(b.angle)
        const world = { x: b.position.x + c0 * local.x - s0 * local.y, y: b.position.y + s0 * local.x + c0 * local.y }
        addConnector(s, { id: `h${c}`, name: `铰${c}`, type: 'hinge', a: anchor(b, local), b: anchor(null, world) })
      } else if (kind < 0.85) {
        addConnector(s, { id: `f${c}`, name: `力${c}`, type: 'force', a: anchor(b, chance(0.3) ? { x: round(r(-0.05, 0.05)), y: round(r(-0.05, 0.05)) } : { x: 0, y: 0 }), force: { x: round(r(-5, 5)), y: round(r(-3, 8)) } })
      } else {
        const ex = pick(['sqrt(1.5 - t)*2', '1/(t - 1.3)', '5*sin(3*t)', 'if(t < 0.5, 2, -1)', '-0.5*vx', '2*step(t - 0.7)', 'clamp(10*t, -3, 3)', 'abs(2*sin(4*t))', 'min(3, 4*t)', 'max(-2, -5*t)', '4*exp(-2*t)', '3*cos(2*pi*t)', 'm*g*0.3*sign(t - 1)', '-2*vy', '1.5*(1 - t)', 'if(vx > 0, -1, 1)*0.5', 'm*g*0.5', '0'])
        const ey = pick(['0', '0', '3*sin(2*t)', 'if(t >= 1, 5, 0)', 'm*g*0.5', '-y*4', '2*step(1.2 - t)'])
        addConnector(s, { id: `f${c}`, name: `变力${c}`, type: 'force', a: anchor(b), force: { x: 0, y: 0 }, expr: { x: ex, y: ey } })
      }
    }
    if (chance(0.08)) s.settings.stopAt = { on: pick(['stick', 'slip', 'separate', 'touch', 'impact', 'slack', 'taut']), after: round(r(0, 0.5), 2) }
    if (chance(0.15)) s.contactPairs.push({ a: bodies[0].id, b: s.bodies[0].id, muS: round(r(0, 1), 2), muK: round(r(0, 0.8), 2), restitution: round(r(0, 1), 2) })
    return s
  }

  /**
   * Random scene with the physics of 26.51 (D50, D51): drag, gravitation (with a static attracting body), cubic
   * springs, dampers, welds, sliders, speed and torque motors and gears, mixed with the older connectors. A separate
   * generator, so the scenes of `randomScene` (and their fingerprints) stay as they were.
   */
  /** Blocks and polygons landing flat, tilted, in a corner or on each other on rough ground (D37). */
  function randomImpactScene(rng, idx) {
    const { emptyScene, addGround, addBody } = V
    const r = (a, b) => a + (b - a) * rng()
    const chance = p => rng() < p
    const round = (x, d = 3) => Math.round(x * 10 ** d) / 10 ** d
    const s = emptyScene(`impacts-${idx}`)
    s.settings.duration = round(r(0.6, 1.5), 2)
    s.settings.gravity = { x: 0, y: -9.8 }
    const mat = () => { const muS = round(r(0.1, 1.2), 2); return { muS, muK: round(muS * r(0.6, 1), 2), restitution: chance(0.3) ? 0 : round(r(0.1, 0.9), 2) } }
    addGround(s, { id: 'ground', top: 0, left: -4, right: 6, material: mat(), role: 'ground' })
    const corner = chance(0.4)
    if (corner) addBody(s, { id: 'wall', name: '墙', kind: 'static', role: 'wall', shape: { type: 'box', width: 0.4, height: 3 }, position: { x: -1.2, y: 0.5 }, material: mat() })
    const n = 1 + Math.floor(rng() * 3)
    let stackTop = 0
    for (let i = 0; i < n; i++) {
      const w = round(r(0.15, 0.5)), h = round(r(0.1, 0.35))
      const stack = i > 0 && chance(0.4)
      const x = stack ? s.bodies[s.bodies.length - 1].position.x + round(r(-0.05, 0.05)) : corner && i === 0 ? round(-1 + w / 2 + r(0, 0.05)) : round(-0.5 + i * r(0.7, 1.1))
      const y = (stack ? stackTop : 0) + h / 2 + round(r(0.002, 0.4))
      const tilt = chance(0.5) ? 0 : round(r(-0.4, 0.4))
      const shape = chance(0.75) ? { type: 'box', width: w, height: h } : { type: 'polygon', points: [{ x: -w / 2, y: -h / 2 }, { x: w / 2, y: -h / 2 }, { x: w / 3, y: h / 2 }, { x: -w / 3, y: h / 2 }] }
      addBody(s, { id: `b${i}`, name: `块${i}`, shape, position: { x, y }, angle: tilt, velocity: { x: chance(0.7) ? round(r(-3, 3)) : 0, y: chance(0.4) ? round(r(-2, 0)) : 0 }, angularVelocity: chance(0.3) ? round(r(-4, 4)) : 0, mass: round(r(0.2, 3)), material: mat() })
      stackTop = y + h / 2
    }
    return s
  }

  function randomScene2651(rng, idx) {
    const { emptyScene, addGround, addBody, addConnector, anchor } = V
    const r = (a, b) => a + (b - a) * rng()
    const pick = a => a[Math.floor(rng() * a.length)]
    const chance = p => rng() < p
    const round = (x, d = 3) => Math.round(x * 10 ** d) / 10 ** d
    const s = emptyScene(`random2651-${idx}`)
    s.settings.duration = round(r(1, 2.5), 2)
    s.settings.integrator = chance(0.85) ? 'dopri5' : pick(['rk4', 'euler', 'moreau'])
    const mat = () => {
      const muS = chance(0.3) ? 0 : round(r(0, 0.9), 2)
      return { muS, muK: round(muS * r(0.5, 1), 2), restitution: chance(0.5) ? 0 : round(r(0, 0.9), 2) }
    }
    const orbit = chance(0.2)
    let groundTop = 0
    if (orbit) {
      s.settings.gravity = { x: 0, y: chance(0.6) ? 0 : -1 }
      s.settings.gravitation = { G: pick([1, 0.5, 2]) }
      addBody(s, { id: 'sun', name: '恒星', kind: 'static', shape: { type: chance(0.7) ? 'circle' : 'box', radius: 0.3, width: 0.5, height: 0.4 }, position: { x: 0, y: 0 }, mass: round(r(20, 200), 1) })
    } else {
      s.settings.gravity = { x: 0, y: -pick([9.8, 10, 9.81]) }
      if (chance(0.15)) s.settings.gravitation = { G: pick([0.5, 5]) }
      groundTop = round(r(-0.2, 0.2), 2)
      addGround(s, { id: 'ground', top: groundTop, left: -6, right: 12, material: mat(), role: 'ground' })
    }
    const n = 1 + Math.floor(rng() * 3)
    const bodies = []
    for (let i = 0; i < n; i++) {
      const drag = chance(0.4) ? { linear: chance(0.5) ? round(r(0, 1.5), 2) : 0, quadratic: chance(0.6) ? round(r(0, 0.4), 2) : 0 } : undefined
      let body
      if (orbit) {
        const rad = round(r(1.2, 3), 2), ang = r(0, 2 * Math.PI)
        const v = Math.sqrt(s.settings.gravitation.G * s.bodies[0].mass / rad) * r(0.7, 1.15)
        const pos = { x: round(rad * Math.cos(ang)), y: round(rad * Math.sin(ang)) }
        body = addBody(s, { id: `b${i}`, name: `行星${i}`, kind: chance(0.5) ? 'particle' : 'rigid', role: 'ball', shape: { type: 'circle', radius: round(r(0.03, 0.08)) }, position: pos, velocity: { x: round(-v * Math.sin(ang)), y: round(v * Math.cos(ang)) }, mass: round(r(0.05, 2)), material: mat(), drag })
      } else if (chance(0.5)) {
        const w = round(r(0.1, 0.4)), h = round(r(0.1, 0.3))
        body = addBody(s, { id: `b${i}`, name: `块${i}`, shape: { type: 'box', width: w, height: h }, position: { x: round(-1.5 + i * r(0.6, 1)), y: chance(0.4) ? groundTop + h / 2 : round(groundTop + h / 2 + r(0.05, 1.2)) }, angle: chance(0.3) ? round(r(-0.6, 0.6)) : 0, velocity: { x: chance(0.5) ? round(r(-3, 3)) : 0, y: 0 }, angularVelocity: chance(0.2) ? round(r(-5, 5)) : 0, mass: round(r(0.1, 3)), fixedRotation: chance(0.1), material: mat(), drag })
      } else {
        const rad = round(r(0.05, 0.25))
        body = addBody(s, { id: `b${i}`, name: `轮${i}`, kind: chance(0.25) ? 'particle' : 'rigid', role: 'wheel', shape: { type: 'circle', radius: rad }, position: { x: round(-1.5 + i * r(0.6, 1)), y: chance(0.4) ? groundTop + rad : round(groundTop + rad + r(0.05, 1.5)) }, velocity: { x: chance(0.5) ? round(r(-3, 3)) : 0, y: chance(0.3) ? round(r(-2, 3)) : 0 }, angularVelocity: chance(0.3) ? round(r(-8, 8)) : 0, mass: round(r(0.05, 2)), material: mat(), drag })
      }
      bodies.push(body)
    }
    /** Body coordinates of a world point. */
    const localOf = (b, w) => { const c = Math.cos(b.angle), sn = Math.sin(b.angle), dx = w.x - b.position.x, dy = w.y - b.position.y; return { x: c * dx + sn * dy, y: -sn * dx + c * dy } }
    const nc = 1 + Math.floor(rng() * 3)
    for (let c = 0; c < nc; c++) {
      const b = pick(bodies), o = pick(bodies)
      const other = o !== b
      const kind = rng()
      const above = () => ({ x: round(b.position.x + r(-0.4, 0.4)), y: round(b.position.y + r(0.3, 1)) })
      if (kind < 0.14) {
        addConnector(s, { id: `k${c}`, name: `弹簧${c}`, type: 'spring', a: anchor(b), b: other && chance(0.5) ? anchor(o) : anchor(null, above()), stiffness: round(r(5, 120)), cubic: chance(0.7) ? round(r(-20, 300)) : 0, restLength: chance(0.5) ? null : round(r(0.2, 1)), damping: chance(0.5) ? 0 : round(r(0, 1.5)) })
      } else if (kind < 0.26) {
        addConnector(s, { id: `c${c}`, name: `阻尼器${c}`, type: 'damper', a: anchor(b), b: other && chance(0.5) ? anchor(o) : anchor(null, above()), damping: round(r(0, 3)) })
      } else if (kind < 0.38 && other) {
        const mid = { x: (b.position.x + o.position.x) / 2, y: (b.position.y + o.position.y) / 2 }
        addConnector(s, { id: `w${c}`, name: `焊接${c}`, type: 'weld', a: anchor(b, localOf(b, mid)), b: anchor(o, localOf(o, mid)) })
      } else if (kind < 0.52) {
        const th = r(-Math.PI, Math.PI)
        const free = chance(0.4)
        if (other && chance(0.4)) addConnector(s, { id: `s${c}`, name: `滑轨${c}`, type: 'slider', a: anchor(o, localOf(o, b.position)), b: anchor(b), axis: { x: round(Math.cos(th)), y: round(Math.sin(th)) }, free })
        else addConnector(s, { id: `s${c}`, name: `滑轨${c}`, type: 'slider', a: anchor(null, { ...b.position }), b: anchor(b), axis: { x: round(Math.cos(th)), y: round(Math.sin(th)) }, free })
      } else if (kind < 0.68) {
        const torque = chance(0.5)
        const a = other && chance(0.5) ? anchor(o, localOf(o, b.position)) : anchor(null, { ...b.position })
        addConnector(s, { id: `m${c}`, name: `马达${c}`, type: 'motor', a, b: anchor(b), mode: torque ? 'torque' : 'speed', speed: round(r(-6, 6)), torque: round(r(-2, 2)) })
      } else if (kind < 0.8) {
        addConnector(s, { id: `g${c}`, name: `齿轮${c}`, type: 'gear', a: anchor(b), b: other && chance(0.7) ? anchor(o) : anchor(null, { x: 0, y: 0 }), ratio: pick([1, 2, 0.5, -1.5, 3]) })
      } else if (kind < 0.88) {
        const local = { x: round(r(-0.05, 0.05)), y: round(r(-0.05, 0.05)) }
        const c0 = Math.cos(b.angle), s0 = Math.sin(b.angle)
        addConnector(s, { id: `h${c}`, name: `铰${c}`, type: 'hinge', a: anchor(b, local), b: anchor(null, { x: b.position.x + c0 * local.x - s0 * local.y, y: b.position.y + s0 * local.x + c0 * local.y }) })
      } else if (kind < 0.94) {
        addConnector(s, { id: `d${c}`, name: `杆${c}`, type: 'rod', a: anchor(null, above()), b: anchor(b), length: null })
      } else {
        addConnector(s, { id: `f${c}`, name: `力${c}`, type: 'force', a: anchor(b), force: { x: round(r(-5, 5)), y: round(r(-3, 8)) } })
      }
    }
    return s
  }

  /**
   * Random scene with the physics of 26.52 (D58–D61): sliders with end stops, torque-limited speed motors, rolling
   * resistance of round bodies, central fields (on the world or a body, all or some targets) and the Gauss–Legendre
   * integrator, mixed with older connectors. A separate generator, so the earlier scenes stay as they were.
   */
  function randomScene2652(rng, idx) {
    const { emptyScene, addGround, addBody, addConnector, anchor } = V
    const r = (a, b) => a + (b - a) * rng()
    const pick = a => a[Math.floor(rng() * a.length)]
    const chance = p => rng() < p
    const round = (x, d = 3) => Math.round(x * 10 ** d) / 10 ** d
    const s = emptyScene(`random2652-${idx}`)
    s.settings.duration = round(r(1, 2.5), 2)
    s.settings.integrator = chance(0.7) ? 'dopri5' : pick(['gauss4', 'gauss4', 'rk4', 'moreau'])
    const crr = () => (chance(0.6) ? round(r(0.005, 0.1), 3) : undefined)
    const mat = () => {
      const muS = chance(0.2) ? 0 : round(r(0.1, 0.9), 2)
      const m = { muS, muK: round(muS * r(0.5, 1), 2), restitution: chance(0.5) ? 0 : round(r(0, 0.9), 2) }
      const c = crr()
      if (c !== undefined) m.rolling = c
      return m
    }
    const field = chance(0.25)
    let groundTop = 0
    if (field) s.settings.gravity = { x: 0, y: chance(0.6) ? 0 : -2 }
    else {
      s.settings.gravity = { x: 0, y: -pick([9.8, 10]) }
      groundTop = round(r(-0.2, 0.2), 2)
      addGround(s, { id: 'ground', top: groundTop, left: -6, right: 12, material: mat(), role: 'ground' })
    }
    // 26.52 (D35): a static concave body on the ground (a V-notch or a channel)
    if (!field && chance(0.3)) {
      const w = round(r(0.6, 1.4)), h = round(r(0.2, 0.6)), x0 = round(r(-0.5, 1.5))
      const pts = chance(0.5)
        ? [{ x: -w, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: round(w / 2), y: h }, { x: 0, y: round(h * r(0.1, 0.6)) }, { x: round(-w / 2), y: h }, { x: -w, y: h }]
        : [{ x: -w, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: round(w * 0.7), y: h }, { x: round(w * 0.7), y: round(h * 0.3) }, { x: round(-w * 0.7), y: round(h * 0.3) }, { x: round(-w * 0.7), y: h }, { x: -w, y: h }]
      addBody(s, { id: 'terrain', name: '凹槽', kind: 'static', role: 'ground', shape: { type: 'polygon', points: pts }, position: { x: x0, y: groundTop }, material: mat() })
    }
    const n = 1 + Math.floor(rng() * 3)
    const bodies = []
    for (let i = 0; i < n; i++) {
      let body
      const kindPick = rng()
      if (kindPick < 0.2) {
        // A concave L or chevron about its centroid
        const a = round(r(0.15, 0.35)), b = round(r(0.08, 0.2))
        const pts = chance(0.5)
          ? [{ x: 0, y: 0 }, { x: a, y: 0 }, { x: a, y: b }, { x: b, y: b }, { x: b, y: a }, { x: 0, y: a }]
          : [{ x: 0, y: 0 }, { x: a, y: b }, { x: 2 * a, y: 0 }, { x: 2 * a, y: b }, { x: a, y: 2 * b }, { x: 0, y: b }]
        let A = 0, cx = 0, cy = 0
        for (let k = 0; k < pts.length; k++) { const p = pts[k], q = pts[(k + 1) % pts.length], c = p.x * q.y - q.x * p.y; A += c; cx += (p.x + q.x) * c; cy += (p.y + q.y) * c }
        cx /= 3 * A; cy /= 3 * A
        body = addBody(s, { id: `b${i}`, name: `凹块${i}`, shape: { type: 'polygon', points: pts.map(p => ({ x: round(p.x - cx, 6), y: round(p.y - cy, 6) })) }, position: { x: round(-1.5 + i * r(0.7, 1.1)), y: round(groundTop + a + r(0.05, 1)) }, angle: round(r(-1, 1)), velocity: { x: chance(0.5) ? round(r(-2, 2)) : 0, y: 0 }, angularVelocity: chance(0.3) ? round(r(-4, 4)) : 0, mass: round(r(0.2, 2)), material: mat() })
        bodies.push(body)
        continue
      }
      if (kindPick < 0.32) {
        // A compound: dumbbell, hammer or T
        const k = rng()
        const parts = k < 0.4
          ? [{ shape: { type: 'circle', radius: round(r(0.05, 0.12)) }, position: { x: -0.25, y: 0 }, angle: 0 }, { shape: { type: 'box', width: 0.5, height: 0.04 }, position: { x: 0, y: 0 }, angle: 0 }, { shape: { type: 'circle', radius: round(r(0.05, 0.12)) }, position: { x: 0.25, y: 0 }, angle: 0 }]
          : k < 0.7
            ? [{ shape: { type: 'box', width: 0.06, height: 0.5 }, position: { x: 0, y: 0 }, angle: 0 }, { shape: { type: 'circle', radius: round(r(0.06, 0.12)) }, position: { x: 0, y: 0.27 }, angle: 0 }]
            : [{ shape: { type: 'box', width: 0.4, height: 0.08 }, position: { x: 0, y: 0.2 }, angle: 0 }, { shape: { type: 'box', width: 0.08, height: 0.36 }, position: { x: 0, y: 0 }, angle: round(r(-0.2, 0.2)) }]
        body = addBody(s, { id: `b${i}`, name: `组合${i}`, shape: { type: 'compound', parts }, position: { x: round(-1.5 + i * r(0.7, 1.1)), y: round(groundTop + 0.4 + r(0.05, 1)) }, angle: round(r(-1.5, 1.5)), velocity: { x: chance(0.5) ? round(r(-2, 2)) : 0, y: 0 }, angularVelocity: chance(0.3) ? round(r(-4, 4)) : 0, mass: round(r(0.2, 2)), material: mat() })
        bodies.push(body)
        continue
      }
      if (chance(0.55)) {
        const rad = round(r(0.05, 0.25))
        const onGround = !field && chance(0.6)
        const v = chance(0.6) ? round(r(-3, 3)) : 0
        body = addBody(s, { id: `b${i}`, name: `轮${i}`, kind: chance(0.15) ? 'particle' : 'rigid', role: 'wheel', shape: { type: 'circle', radius: rad }, position: { x: round(-1.5 + i * r(0.6, 1.1)), y: onGround ? groundTop + rad : round(groundTop + rad + r(0.05, 1.2)) }, velocity: { x: v, y: field ? round(r(-1, 1)) : 0 }, angularVelocity: onGround && chance(0.6) ? round(-v / rad * r(0.5, 1.5)) : chance(0.2) ? round(r(-6, 6)) : 0, mass: round(r(0.1, 2)), material: mat() })
      } else {
        const w = round(r(0.1, 0.4)), h = round(r(0.1, 0.3))
        body = addBody(s, { id: `b${i}`, name: `块${i}`, shape: { type: 'box', width: w, height: h }, position: { x: round(-1.5 + i * r(0.6, 1.1)), y: chance(0.4) ? groundTop + h / 2 : round(groundTop + h / 2 + r(0.05, 1.2)) }, angle: chance(0.2) ? round(r(-0.5, 0.5)) : 0, velocity: { x: chance(0.5) ? round(r(-3, 3)) : 0, y: 0 }, mass: round(r(0.1, 3)), material: mat() })
      }
      bodies.push(body)
    }
    const localOf = (b, w) => { const c = Math.cos(b.angle), sn = Math.sin(b.angle), dx = w.x - b.position.x, dy = w.y - b.position.y; return { x: c * dx + sn * dy, y: -sn * dx + c * dy } }
    const nc = 1 + Math.floor(rng() * 3)
    // At most one joint (slider or motor) per body: two would usually contradict each other
    const jointed = new Set()
    for (let c = 0; c < nc; c++) {
      const b = pick(bodies), o = pick(bodies)
      const other = o !== b
      let kind = rng()
      if (kind < 0.55 && jointed.has(b.id)) kind = 0.6 + 0.4 * kind
      if (kind < 0.55) jointed.add(b.id)
      if (kind < 0.3) {
        const th = chance(0.4) ? pick([0, Math.PI / 2, -Math.PI / 2]) : r(-Math.PI, Math.PI)
        const lo = chance(0.8) ? round(-r(0.05, 0.8)) : null, hi = chance(0.8) ? round(r(0.05, 0.8)) : null
        const limits = { min: lo, max: hi, restitution: chance(0.4) ? 0 : round(r(0, 1), 2) }
        if (other && chance(0.3)) addConnector(s, { id: `s${c}`, name: `滑轨${c}`, type: 'slider', a: anchor(o, localOf(o, b.position)), b: anchor(b), axis: { x: round(Math.cos(th)), y: round(Math.sin(th)) }, free: chance(0.4), limits })
        else addConnector(s, { id: `s${c}`, name: `滑轨${c}`, type: 'slider', a: anchor(null, { ...b.position }), b: anchor(b), axis: { x: round(Math.cos(th)), y: round(Math.sin(th)) }, free: chance(0.4), limits })
      } else if (kind < 0.55) {
        const a = other && chance(0.4) ? anchor(o, localOf(o, b.position)) : anchor(null, { ...b.position })
        addConnector(s, { id: `m${c}`, name: `马达${c}`, type: 'motor', a, b: anchor(b), mode: chance(0.85) ? 'speed' : 'torque', speed: round(r(-8, 8)), torque: round(r(-2, 2)), maxTorque: chance(0.8) ? round(r(0.05, 3)) : null })
      } else if (kind < 0.8) {
        const onBody = other && chance(0.3)
        const ctr = onBody ? anchor(o) : anchor(null, { x: round(r(-1, 1)), y: round(groundTop + r(0.5, 2)) })
        addConnector(s, { id: `z${c}`, name: `中心${c}`, type: 'central', a: ctr, k: round(r(-4, 15)), n: pick([1, -2, -1, 0, 2, 0.5]), targets: chance(0.5) ? null : [b.id] })
      } else if (kind < 0.9) {
        addConnector(s, { id: `k${c}`, name: `弹簧${c}`, type: 'spring', a: anchor(b), b: anchor(null, { x: round(b.position.x + r(-0.4, 0.4)), y: round(b.position.y + r(0.3, 1)) }), stiffness: round(r(5, 80)), restLength: null, damping: chance(0.5) ? 0 : round(r(0, 1)) })
      } else {
        addConnector(s, { id: `f${c}`, name: `力${c}`, type: 'force', a: anchor(b), force: { x: round(r(-5, 5)), y: round(r(-3, 8)) } })
      }
    }
    if (chance(0.15) && s.bodies.length > 1) s.contactPairs.push({ a: bodies[0].id, b: s.bodies[0].id, muS: round(r(0, 1), 2), muK: round(r(0, 0.8), 2), restitution: round(r(0, 1), 2), ...(chance(0.5) ? { rolling: round(r(0, 0.1), 3) } : {}) })
    return s
  }

  return { goldenScenes, randomScene, randomImpactScene, randomScene2651, randomScene2652 }
}
