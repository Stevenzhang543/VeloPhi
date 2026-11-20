/**
 * The 3D viewer without a GPU (26.64, D271): draw lists for the three styles, the geometry of multiple bonds, the
 * camera's arithmetic (composition of turns, fit distance, projection there and back, handedness, motion without
 * overshoot), picking as the Canvas-2D fallback uses it, the painter's order of the fallback, the palette's contrast
 * on both grounds, and the three-language names of everything the core returns as a key.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CrystalBuild, MoleculeRecord } from '../../src/engine/mol'
import { crystalBuild, molShape, orbitalSample } from '../../src/engine/mol'
import { FOV, Trackball, cloneCamera, coastAngle, decayVelocity, defaultCamera, fitDistance, orientationFromAxes, project, projectByMatrix, rotateByDrag, screenRay, settle, toView, unproject } from '../../src/render/mol3d/camera'
import { drawFallback } from '../../src/render/mol3d/fallback2d'
import { sortTriangles, supersampling } from '../../src/render/mol3d/gl'
import { angleArc, occluded } from '../../src/render/mol3d/labels'
import { NAMED_ELEMENTS, contrast, elementColour, inkOn, molPalette, parseCss } from '../../src/render/mol3d/palette'
import { pickAtom, raySphere } from '../../src/render/mol3d/pick'
import type { SceneInput } from '../../src/render/mol3d/scene'
import { BALL_SCALE, CYLINDER_STRIDE, MESH_STRIDE, SPHERE_STRIDE, buildScene } from '../../src/render/mol3d/scene'
import { homeCamera, resolveSource } from '../../src/render/mol3d/source'
import type { Vec3 } from '../../src/render/mol3d/vec'
import { cross, dot, length, normalize, quatAngle, quatAxisAngle, quatMul, quatRotate, sub } from '../../src/render/mol3d/vec'
import { GEOMETRY_KEYS, POLYHEDRON_KEYS, classText, fixed, geometryName, lengthText, polyhedronName } from '../../src/app/components/chem/mol3dText'
import { locale } from '../../src/i18n/locale'

const dir = join(__dirname, '..', 'fixtures', 'chem', 'mol')
const molecules: MoleculeRecord[] = JSON.parse(readFileSync(join(dir, 'molecules.json'), 'utf8')).molecules
const crystals = JSON.parse(readFileSync(join(dir, 'crystals.json'), 'utf8')).crystals
const P = molPalette('light')
const input = (id: string): SceneInput => resolveSource({ kind: 'molecule', molecule: molecules.find(m => m.id === id)! }).input
const vp = { width: 640, height: 480 }

describe('mol3d scene', () => {
  it('builds the draw lists of the three styles', () => {
    const ethanol = input('ethanol')
    const ball = buildScene(ethanol, { style: 'ball' }, P)
    expect([ball.sphereCount, ball.cylinderCount, ball.counts.bonds, ball.atoms.length]).toEqual([9, 8, 8, 9])
    const space = buildScene(ethanol, { style: 'space', lonePairs: true }, P)
    // Space-filling: van der Waals spheres, no sticks, no lobes (they would be inside the spheres)
    expect([space.sphereCount, space.cylinderCount, space.lobeCount]).toEqual([9, 0, 0])
    expect(space.spheres[3]).toBeCloseTo(1.7, 6)
    expect(ball.spheres[3]).toBeCloseTo(BALL_SCALE * 1.7, 6)
    const wire = buildScene(ethanol, { style: 'wire' }, P)
    expect([wire.sphereCount, wire.cylinderCount]).toEqual([9, 8])
    // Wireframe sticks carry the two elements' colours; ball-and-stick sticks are neutral
    const c = wire.cylinders
    const twoColoured = (list: Float32Array, n: number) => Array.from({ length: n }, (_, k) => k * CYLINDER_STRIDE).filter(o => [0, 1, 2].some(j => list[o + 8 + j] !== list[o + 11 + j])).length
    // C–C is one colour; the six C–H, the C–O and the O–H are split
    expect([twoColoured(c, 8), twoColoured(ball.cylinders, 8)]).toEqual([7, 0])
    expect(Array.from(ball.cylinders.slice(8, 11))).toEqual(Array.from(ball.cylinders.slice(11, 14)))
    expect(space.radius).toBeGreaterThan(ball.radius)
    expect(ball.labels.filter(l => l.kind === 'element').length).toBe(9)
  })

  it('draws double, triple and aromatic bonds as such', () => {
    // CO2: two double bonds → four sticks, pairwise parallel and 2 × 0.105 Å apart
    const co2 = buildScene(input('carbon-dioxide'), {}, P)
    expect([co2.counts.bonds, co2.cylinderCount]).toEqual([2, 4])
    const a = (k: number): Vec3 => [co2.cylinders[k * CYLINDER_STRIDE], co2.cylinders[k * CYLINDER_STRIDE + 1], co2.cylinders[k * CYLINDER_STRIDE + 2]]
    const b = (k: number): Vec3 => [co2.cylinders[k * CYLINDER_STRIDE + 3], co2.cylinders[k * CYLINDER_STRIDE + 4], co2.cylinders[k * CYLINDER_STRIDE + 5]]
    expect(length(sub(a(0), a(1)))).toBeCloseTo(0.21, 6)
    expect(length(cross(normalize(sub(b(0), a(0))), normalize(sub(b(1), a(1)))))).toBeLessThan(1e-6)
    expect(dot(sub(a(0), a(1)), sub(b(0), a(0)))).toBeCloseTo(0, 6)
    // A triple bond: three sticks
    const n2: SceneInput = (() => { const m = { atoms: ['N', 'N'], xyz: [0, 0, 0, 1.098, 0, 0], bonds: [0, 1, 3] }; return { kind: 'molecule', ...m, shape: molShape(m) } })()
    expect(buildScene(n2, {}, P).cylinderCount).toBe(3)
    // Benzene: six aromatic bonds as a stick plus four dashes on the inner side, six single C–H sticks
    const benzene = buildScene(input('benzene'), {}, P)
    expect(benzene.cylinderCount).toBe(6 * 5 + 6)
    const cyl = benzene.cylinders
    for (let k = 0; k < 6; k++) {
      const solid = k * 5 * CYLINDER_STRIDE, dash = solid + CYLINDER_STRIDE
      const mid = (o: number) => Math.hypot((cyl[o] + cyl[o + 3]) / 2, (cyl[o + 1] + cyl[o + 4]) / 2)
      // The ring is centred on the origin: the dashes lie nearer the centre than the solid stick
      expect(mid(dash)).toBeLessThan(mid(solid) - 0.1)
    }
  })

  it('adds lone pairs, the dipole arrow, polarity marks, cells and polyhedra', () => {
    const water = input('water') as Extract<SceneInput, { kind: 'molecule' }>
    const s = buildScene(water, { lonePairs: true, dipole: true, polarity: true, dipoleText: 'μ = 2.42 D' }, P)
    // Two lobes, each with its two electrons as small spheres
    expect([s.lobeCount, s.sphereCount, s.counts.lobes]).toEqual([2, 3 + 4, 2])
    // Every lobe lies outside the oxygen ball: its inner end is beyond 70 % of the ball's radius, its centre well outside
    const ball = BALL_SCALE * 1.52
    for (let k = 0; k < 2; k++) {
      const o = k * SPHERE_STRIDE
      const d = Math.hypot(s.lobes[o] - water.xyz[0], s.lobes[o + 1] - water.xyz[1], s.lobes[o + 2] - water.xyz[2])
      expect(d - s.lobes[o + 3] * s.lobes[o + 7]).toBeGreaterThan(0.7 * ball)
      expect(d).toBeGreaterThan(ball + 0.2)
    }
    // Arrow: shaft and cross-bar, a cone of 20 segments (40 triangles), its label; δ− on O and δ+ on both H
    expect(s.cylinderCount).toBe(2 + 2)
    expect(s.meshVertices).toBe(120)
    expect(s.labels.filter(l => l.kind === 'charge').map(l => l.text)).toEqual(['δ−', 'δ+', 'δ+'])
    expect(s.labels.some(l => l.kind === 'note' && l.text === 'μ = 2.42 D')).toBe(true)
    // The arrow points to the negative end: from the hydrogens' side towards oxygen (−y in the fixture)
    const tip: Vec3 = [s.mesh[2 * MESH_STRIDE], s.mesh[2 * MESH_STRIDE + 1], s.mesh[2 * MESH_STRIDE + 2]]
    const base: Vec3 = [s.mesh[0], s.mesh[1], s.mesh[2]]
    expect(tip[1]).toBeLessThan(base[1])
    // Methane: no dipole worth an arrow
    expect(buildScene(input('methane'), { dipole: true }, P).meshVertices).toBe(0)

    const nacl = crystalBuild(crystals.find((c: { id: string }) => c.id === 'nacl'), { n: [2, 2, 2], polyhedron: 'auto' }) as CrystalBuild
    const c = buildScene({ kind: 'crystal', build: nacl }, {}, P)
    // 125 atoms, 300 bonds, 27 cell edges, 12 polyhedron edges; 8 faces as 8 triangles
    expect([c.sphereCount, c.counts.bonds, c.cylinderCount, c.faceVertices, c.counts.faces]).toEqual([125, 300, 300 + 27 + 12, 24, 8])
    expect(buildScene({ kind: 'crystal', build: nacl }, { frame: false, polyhedron: false, style: 'space' }, P).cylinderCount).toBe(0)
    // Ionic radii: chloride is drawn larger than sodium
    expect(c.atoms.find(a => a.element === 'Cl')!.radius).toBeGreaterThan(c.atoms.find(a => a.element === 'Na')!.radius)
    // A polyhedron at the edge of a single cell brings its outside neighbours along
    const edge = crystalBuild(crystals.find((x: { id: string }) => x.id === 'nacl'), { polyhedron: 0 }) as CrystalBuild
    expect(buildScene({ kind: 'crystal', build: edge }, {}, P).sphereCount).toBe(27 + Array.from(edge.polyhedron!.index).filter(i => i < 0).length)

    const orbital = buildScene({ kind: 'orbital', sample: orbitalSample(3, 2, 0, { count: 3000 }) }, {}, P)
    expect([orbital.pointCount, orbital.cylinderCount, orbital.labels.map(l => l.text).join('')]).toEqual([3000, 3, 'xyz'])
    expect(new Set(Array.from({ length: 3000 }, (_, i) => orbital.pointColours[3 * i].toFixed(3))).size).toBe(2)
  })

  it('stays within budget at two thousand atoms', () => {
    const big = crystalBuild({ structure: 'fcc', element: 'Cu', a: 3.615 }, { n: [7, 7, 7] }) as CrystalBuild
    expect(big.count).toBeGreaterThan(1600)
    const t0 = performance.now()
    const s = buildScene({ kind: 'crystal', build: big }, {}, P)
    // Building the lists is a one-off per change, not per frame: well under a tenth of a second
    expect(performance.now() - t0).toBeLessThan(400)
    expect(s.sphereCount).toBe(big.count)
    expect(s.labels.length).toBe(big.count)
  })
})

describe('mol3d camera', () => {
  it('composes turns and keeps the handedness', () => {
    // Dragging right by the shorter side of the view is half a turn about the screen's vertical axis
    const q = rotateByDrag([0, 0, 0, 1], 480, 0, vp)
    expect(quatAngle(q, quatAxisAngle([0, 1, 0], Math.PI))).toBeLessThan(1e-12)
    // Two quarter turns compose to the half turn; turns about different axes do not commute
    const half = rotateByDrag(rotateByDrag([0, 0, 0, 1], 240, 0, vp), 240, 0, vp)
    expect(quatAngle(half, q)).toBeLessThan(1e-12)
    const xy = rotateByDrag(rotateByDrag([0, 0, 0, 1], 240, 0, vp), 0, 240, vp), yx = rotateByDrag(rotateByDrag([0, 0, 0, 1], 0, 240, vp), 240, 0, vp)
    expect(quatAngle(xy, yx)).toBeGreaterThan(1)
    // A drag to the right moves the near side to the right; a drag down moves it down
    expect(quatRotate(rotateByDrag([0, 0, 0, 1], 60, 0, vp), [0, 0, 1])[0]).toBeGreaterThan(0)
    expect(quatRotate(rotateByDrag([0, 0, 0, 1], 0, 60, vp), [0, 0, 1])[1]).toBeLessThan(0)
    expect(quatAngle(quatMul(quatAxisAngle([1, 0, 0], 0.3), quatAxisAngle([1, 0, 0], 0.4)), quatAxisAngle([1, 0, 0], 0.7))).toBeLessThan(1e-12)
    // Right-handed on the screen: x to the right, y up, z towards the viewer
    const cam = defaultCamera()
    const o = project(cam, vp, [0, 0, 0]), x = project(cam, vp, [1, 0, 0]), y = project(cam, vp, [0, 1, 0]), z = project(cam, vp, [0, 0, 1])
    expect([x[0] > o[0], y[1] < o[1], z[2] > o[2]]).toEqual([true, true, true])
    // … for any orientation: the projected axes of a right-handed frame turn counter-clockwise when z faces the viewer
    for (const axes of [[1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 1, 0, 0, 0, 1, 1, 0, 0], [0.6, 0.8, 0, -0.8, 0.6, 0, 0, 0, 1]]) {
      const c2 = { ...defaultCamera(), q: orientationFromAxes(axes) }
      const vx = quatRotate(c2.q, [1, 0, 0]), vy = quatRotate(c2.q, [0, 1, 0]), vz = quatRotate(c2.q, [0, 0, 1])
      expect(dot(cross(vx, vy), vz)).toBeCloseTo(1, 12)
    }
    // The start orientation puts the longest axis across the screen and the flattest towards the viewer, tilted a little
    const start = orientationFromAxes([0, 0, 1, 1, 0, 0, 0, 1, 0])
    expect(quatRotate(start, [0, 0, 1])[0]).toBeGreaterThan(0.9)
    expect(quatRotate(start, [0, 1, 0])[2]).toBeGreaterThan(0.85)
  })

  it('fits a sphere to the view', () => {
    // Perspective: the outline of the sphere touches the nearer frame edges at margin 1
    for (const aspect of [4 / 3, 1, 0.5]) {
      const r = 3, d = fitDistance(r, FOV, aspect, false, 1)
      const tanSmall = Math.tan(FOV / 2) * Math.min(1, aspect)
      // Half-angle of the sphere's cone equals the smaller half-angle of the frame
      expect(Math.asin(r / d)).toBeCloseTo(Math.atan(tanSmall), 12)
      const ortho = fitDistance(r, FOV, aspect, true, 1)
      expect(ortho * tanSmall).toBeCloseTo(r, 12)
    }
    const scene = buildScene(input('benzene'), {}, P)
    const cam = homeCamera(scene, vp)
    // Every atom of the fitted scene is inside the view
    for (const a of scene.atoms) { const s = project(cam, vp, a.pos); expect(s[0] > 0 && s[0] < vp.width && s[1] > 0 && s[1] < vp.height).toBe(true) }
  })

  it('projects and unprojects consistently, like the matrices the shaders use', () => {
    const scene = buildScene(input('ethanol'), {}, P)
    for (const ortho of [false, true]) {
      const cam = { ...homeCamera(scene, vp, ortho), q: orientationFromAxes([0.36, 0.48, 0.8, -0.8, 0.6, 0, -0.48, -0.64, 0.6]) }
      for (const a of scene.atoms) {
        const s = project(cam, vp, a.pos)
        const back = unproject(cam, vp, s[0], s[1], s[2])
        expect(length(sub(back, a.pos))).toBeLessThan(1e-10)
        const m = projectByMatrix(cam, vp, a.pos, scene.radius)
        expect(Math.abs(m[0] - s[0]) + Math.abs(m[1] - s[1])).toBeLessThan(1e-9)
        expect(Math.abs(m[2])).toBeLessThan(1)
        // The ray through the atom's screen position passes through the atom
        const ray = screenRay(cam, vp, s[0], s[1])
        expect(length(cross(sub(a.pos, ray.origin), ray.dir))).toBeLessThan(1e-9)
      }
      expect(toView(cam, cam.target)).toEqual([0, 0, -cam.distance])
    }
  })

  it('coasts and settles without overshoot, and not at all under reduced motion', () => {
    // Free turning: the velocity decays, the total turn tends to ω τ from below
    let total = 0, w: Vec3 = [0, 2, 0]
    for (let k = 0; k < 400; k++) { const step = coastAngle(length(w), 1 / 60, 0.3); expect(step).toBeGreaterThanOrEqual(0); total += step; w = decayVelocity(w, 1 / 60, 0.3) }
    expect(total).toBeCloseTo(2 * 0.3, 6)
    // Critically damped approach: monotone from 0 to 1
    let last = 0
    for (let t = 0; t <= 2; t += 0.01) { const p = settle(t, 0.1); expect(p).toBeGreaterThanOrEqual(last); expect(p).toBeLessThanOrEqual(1); last = p }
    expect(last).toBeGreaterThan(0.9999)
    // The controller: a reset animates towards home and can be interrupted; calm jumps
    const home = defaultCamera()
    let calm = false, changes = 0
    const cam = { ...cloneCamera(home), q: quatAxisAngle([0, 1, 0], 1.2), distance: 25 }
    const tb = new Trackball(cam, { viewport: () => vp, calm: () => calm, home: () => home, onChange: () => { changes++ } })
    const raf = globalThis.requestAnimationFrame, caf = globalThis.cancelAnimationFrame
    globalThis.requestAnimationFrame = (() => 1) as typeof requestAnimationFrame
    globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame
    try {
      tb.home()
      expect(tb.moving).toBe(true)
      let angle = quatAngle(cam.q, home.q)
      for (let k = 0; k < 20; k++) { tb.advance(1 / 60); const a = quatAngle(cam.q, home.q); expect(a).toBeLessThanOrEqual(angle + 1e-12); angle = a }
      expect(angle).toBeGreaterThan(0)
      tb.stop()
      expect(tb.moving).toBe(false)
      const kept = quatAngle(cam.q, home.q)
      tb.advance(1)
      expect(quatAngle(cam.q, home.q)).toBe(kept)
      tb.home()
      for (let k = 0; k < 600 && tb.moving; k++) tb.advance(1 / 60)
      expect([quatAngle(cam.q, home.q) < 1e-9, cam.distance]).toEqual([true, home.distance])
      // Reduced motion: zoom and reset happen at once
      calm = true
      cam.q = quatAxisAngle([1, 0, 0], 1)
      tb.zoom(0.5)
      expect([tb.moving, cam.distance]).toEqual([false, home.distance * 0.5])
      tb.home()
      expect([tb.moving, quatAngle(cam.q, home.q), cam.distance]).toEqual([false, 0, home.distance])
      tb.nudge(Math.PI / 12, 0)
      expect(quatAngle(cam.q, home.q)).toBeCloseTo(Math.PI / 12, 12)
      expect(changes).toBeGreaterThan(2)
    } finally {
      globalThis.requestAnimationFrame = raf
      globalThis.cancelAnimationFrame = caf
    }
  })
})

/** A Canvas-2D context that records what is drawn (the test environment has no canvas). */
function recorder() {
  const calls: Array<{ op: string; args: number[]; fill: string }> = []
  const state: Record<string, unknown> = { fillStyle: '', strokeStyle: '', lineWidth: 1 }
  const gradient = { addColorStop() { /* a gradient is a colour here */ } }
  const ctx = new Proxy(state, {
    get(target, key: string) {
      if (key in target) return target[key]
      if (key === 'createRadialGradient' || key === 'createLinearGradient') return () => gradient
      return (...args: number[]) => { calls.push({ op: key, args, fill: String(target.fillStyle) }) }
    },
    set(target, key: string, value) { target[key] = value; return true }
  })
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
}

describe('mol3d picking and the 2D fallback', () => {
  it('picks the nearest atom under the pointer', () => {
    const scene = buildScene(input('water'), {}, P)
    const cam = homeCamera(scene, vp)
    scene.atoms.forEach((a, i) => { const s = project(cam, vp, a.pos); expect(pickAtom(cam, vp, s[0], s[1], scene.atoms)).toBe(i) })
    expect(pickAtom(cam, vp, 3, 3, scene.atoms)).toBe(-1)
    // Just outside a hydrogen's outline: a miss, but a hit with a few pixels of slop
    const h = project(cam, vp, scene.atoms[1].pos)
    const r = scene.atoms[1].radius / (2 * cam.distance * Math.tan(FOV / 2) / vp.height)
    expect(pickAtom(cam, vp, h[0] + r + 12, h[1], scene.atoms)).toBe(-1)
    expect(pickAtom(cam, vp, h[0] + r + 3, h[1], scene.atoms, 6)).toBe(1)
    // Two atoms on one line of sight: the near one is picked, the far one is hidden for labelling
    const line: SceneInput = (() => { const m = { atoms: ['C', 'O'], xyz: [0, 0, 0, 0, 0, 1.2], bonds: [0, 1, 2] }; return { kind: 'molecule', ...m, shape: molShape(m) } })()
    const s2 = buildScene(line, {}, P)
    const front = { ...defaultCamera(), target: [0, 0, 0.6] as Vec3 }
    const c = project(front, vp, [0, 0, 0])
    expect(pickAtom(front, vp, c[0], c[1], s2.atoms)).toBe(1)
    expect([occluded(s2, front, vp, 0), occluded(s2, front, vp, 1)]).toEqual([true, false])
    expect(raySphere([0, 0, 5], [0, 0, -1], [0, 0, 0], 1)).toBe(4)
    expect(raySphere([0, 0, 5], [0, 0, 1], [0, 0, 0], 1)).toBe(null)
    // The same in the orthographic view
    const ortho = homeCamera(scene, vp, true)
    scene.atoms.forEach((a, i) => { const s = project(ortho, vp, a.pos); expect(pickAtom(ortho, vp, s[0], s[1], scene.atoms)).toBe(i) })
  })

  it('the fallback paints every primitive, back to front', () => {
    const scene = buildScene(input('water'), { lonePairs: true, dipole: true }, P)
    const cam = homeCamera(scene, vp)
    const { ctx, calls } = recorder()
    drawFallback(ctx, scene, cam, vp, P)
    // The ground, then: 7 discs (3 atoms + 4 electrons), 2 lobes, sticks in two halves, 40 triangles of the arrow head
    expect(calls[1].op).toBe('fillRect')
    expect(calls.filter(c => c.op === 'arc').length).toBe(7)
    expect(calls.filter(c => c.op === 'ellipse').length).toBe(2)
    expect(calls.filter(c => c.op === 'closePath').length).toBe(40)
    expect(calls.filter(c => c.op === 'moveTo').length).toBe(2 * scene.cylinderCount + 40)
    // Painter's order: of two atoms on a line of sight the far one is painted first
    const line: SceneInput = (() => { const m = { atoms: ['C', 'O'], xyz: [0, 0, 0, 0, 0, 1.2], bonds: [0, 1, 1] }; return { kind: 'molecule', ...m, shape: molShape(m) } })()
    const s2 = buildScene(line, {}, P)
    const rec = recorder()
    drawFallback(rec.ctx, s2, { ...defaultCamera(), target: [0, 0, 0.6] }, vp, P)
    const discs = rec.calls.filter(c => c.op === 'arc')
    // The nearer oxygen is larger on the screen and comes last
    expect(discs[1].args[2]).toBeGreaterThan(discs[0].args[2] * 0.8)
    expect(rec.calls.findIndex(c => c === discs[0])).toBeLessThan(rec.calls.findIndex(c => c === discs[1]))
    // A cloud is thinned to the fallback's limit
    const orbital = buildScene({ kind: 'orbital', sample: orbitalSample(2, 1, 0, { count: 14000 }) }, {}, P)
    const rec2 = recorder()
    drawFallback(rec2.ctx, orbital, homeCamera(orbital, vp), vp, P)
    expect(rec2.calls.filter(c => c.op === 'fillRect').length - 1).toBeLessThanOrEqual(6000)
    expect(rec2.calls.filter(c => c.op === 'fillRect').length - 1).toBeGreaterThan(4000)
  })

  it('sorts translucent triangles and chooses the supersampling', () => {
    const nacl = crystalBuild(crystals.find((c: { id: string }) => c.id === 'nacl'), { n: [2, 2, 2], polyhedron: 'auto' }) as CrystalBuild
    const scene = buildScene({ kind: 'crystal', build: nacl }, {}, P)
    const cam = homeCamera(scene, vp)
    const sorted = sortTriangles(scene.faces, cam)
    const depth = (t: number) => [0, 1, 2].reduce((z, v) => z + toView(cam, [sorted[(3 * t + v) * MESH_STRIDE], sorted[(3 * t + v) * MESH_STRIDE + 1], sorted[(3 * t + v) * MESH_STRIDE + 2]])[2], 0)
    for (let t = 1; t < 8; t++) expect(depth(t)).toBeGreaterThanOrEqual(depth(t - 1))
    expect([...sorted].sort()).toEqual([...scene.faces].sort())
    // Twice the device resolution for a small view, 1:1 for a full 4K screen
    expect(supersampling(480, 360, 1)).toBe(2)
    expect(supersampling(3840, 2160, 1)).toBe(1)
    expect(supersampling(1920, 1080, 1)).toBeGreaterThan(1.5)
    expect(angleArc([1, 0, 0], [0, 0, 0], [0, 2, 0]).length).toBe(17)
  })
})

describe('mol3d palette and texts', () => {
  it('keeps every element readable on the light and on the dark ground', () => {
    for (const theme of ['light', 'dark'] as const) {
      const p = molPalette(theme)
      // The contour alone carries a shape: at least 7:1 against the ground
      expect(contrast(p.outline, p.bg)).toBeGreaterThan(7)
      for (const s of [...NAMED_ELEMENTS, 'Fr', 'Og', 'Ce', 'Rh']) {
        const c = elementColour(s, theme)
        // Fill or contour stands out from the ground
        expect(Math.max(contrast(c, p.bg), contrast(p.outline, p.bg)), s).toBeGreaterThan(3)
        // … where the fill is close to the ground (white hydrogen on white), the contour is far from the fill
        if (contrast(c, p.bg) < 2) expect(contrast(c, p.outline), `${s} ${theme}`).toBeGreaterThan(4)
        // The symbol drawn on the ball
        expect(contrast(inkOn(c), c), `${s} ${theme}`).toBeGreaterThan(4)
      }
      // Dark carbon on the dark ground and the sticks are visible by their fill as well
      expect(contrast(elementColour('C', theme), p.bg)).toBeGreaterThan(theme === 'dark' ? 5 : 7)
      expect(contrast(p.bond, p.bg)).toBeGreaterThan(1.9)
      expect(contrast(p.text, p.bg)).toBeGreaterThan(12)
      for (const k of ['positive', 'negative', 'accent', 'dipole', 'cell', 'polyhedronEdge', 'deltaPlus', 'deltaMinus'] as const) expect(contrast(p[k], p.bg), k).toBeGreaterThan(3)
    }
    // Hydrogen on the light ground has almost no contrast of its own — the reason for the contour
    expect(contrast(elementColour('H', 'light'), molPalette('light').bg)).toBeLessThan(1.3)
    expect(parseCss('rgba(20, 25, 32, 0.5)')).toEqual([20 / 255, 25 / 255, 32 / 255])
    expect(molPalette('dark', { bg: [0, 0, 0] }).bg).toEqual([0, 0, 0])
  })

  it('names every geometry and polyhedron in three languages and typesets numbers', () => {
    try {
      const seen = new Set<string>()
      for (const lang of ['zh', 'en', 'de'] as const) {
        locale.lang = lang
        for (const k of GEOMETRY_KEYS) { const n = geometryName(k); expect(n.length).toBeGreaterThan(1); if (lang === 'zh') expect(/[一-鿿]/.test(n)).toBe(true); seen.add(`${lang}:${n}`) }
        for (const k of POLYHEDRON_KEYS) { const n = polyhedronName(k); expect(n.length).toBeGreaterThan(1) }
        if (lang !== 'zh') expect(/[一-鿿]/.test(GEOMETRY_KEYS.map(k => geometryName(k, true)).join('') + POLYHEDRON_KEYS.map(k => polyhedronName(k)).join(''))).toBe(false)
      }
      expect(seen.size).toBe(3 * GEOMETRY_KEYS.length)
      locale.lang = 'zh'
      expect([geometryName('tetrahedral', true), geometryName('tetrahedral'), geometryName('bent'), geometryName('trigonalPyramidal')]).toEqual(['正四面体形', '四面体形', 'V 形', '三角锥形'])
      expect(classText('AX2E2')).toBe('AX₂E₂')
      expect(fixed(-0.004, 2)).toBe('0.00')
      expect(fixed(-61.25, 1)).toBe('−61.3')
      expect(lengthText(0.9572)).toBe('95.7 pm (0.957 Å)')
    } finally {
      locale.lang = 'zh'
    }
  })
})
