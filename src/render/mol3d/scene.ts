/**
 * Draw lists of the 3D viewer (26.64, D271): what the WebGL renderer and the Canvas-2D fallback draw, built from the
 * core's results — a molecule with its shape analysis, a crystal block, an orbital cloud — for one of three styles
 * (ball-and-stick, space-filling, wireframe) and the switches of the viewer (lone pairs, dipole, bond polarity, cell
 * edges, coordination polyhedron, sign colours).
 *
 * Nothing here is a result: positions, radii, lone-pair directions, the dipole vector, bonds and polyhedra come from
 * `molShape`, `crystalBuild` and `orbitalSample`. This module decides how thick a stick is and where a double bond's
 * second stick goes.
 */
import type { CrystalBuild, MolShape, OrbitalSample } from '../../engine/mol'
import type { MolPalette, RGB } from './palette'
import { elementColour, mix } from './palette'
import type { Vec3 } from './vec'
import { add, cross, dot, length, lerp, normalize, perpendicular, scale, sub } from './vec'

export type MolStyle = 'ball' | 'space' | 'wire'

/** What the viewer shows: a molecule (with its analysis), a crystal block or an orbital. */
export type SceneInput =
  | { kind: 'molecule'; atoms: string[]; xyz: ArrayLike<number>; bonds: ArrayLike<number>; shape: MolShape }
  | { kind: 'crystal'; build: CrystalBuild }
  | { kind: 'orbital'; sample: OrbitalSample }

export interface SceneOptions {
  style: MolStyle
  /** Lone-pair lobes of the central atoms (not in the space-filling picture: they would lie inside the spheres). */
  lonePairs: boolean
  /** The dipole arrow (chemists' convention: it points to the negative end, the cross marks the positive one). */
  dipole: boolean
  /** Tint polar bonds from δ+ to δ− and mark the partial charges. */
  polarity: boolean
  /** Cell edges of a crystal; the axes of an orbital. */
  frame: boolean
  /** The coordination polyhedron of a crystal, when the block was built with one. */
  polyhedron: boolean
  /** Colour an orbital's points by the sign of ψ. */
  signs: boolean
  /** Text of the dipole label (the component formats the core's number). */
  dipoleText?: string
}

export const DEFAULT_OPTIONS: SceneOptions = { style: 'ball', lonePairs: false, dipole: false, polarity: false, frame: true, polyhedron: true, signs: true }

/** An atom as drawn: for picking, labels and the fallback. */
export interface SceneAtom { pos: Vec3; radius: number; element: string; colour: RGB }

export interface SceneLabel {
  pos: Vec3
  text: string
  /** `element`: on its atom; `charge`: δ+ / δ− beside its atom; `note`: free-standing. */
  kind: 'element' | 'charge' | 'note'
  atom?: number
}

/** Floats per sphere instance: centre (3), radius, long axis (3), stretch, colour (3), flags. */
export const SPHERE_STRIDE = 12
/** Floats per cylinder instance: end A (3), end B (3), radius, least radius in pixels, colour A (3), colour B (3), blend, flags. */
export const CYLINDER_STRIDE = 16
/** Floats per mesh vertex: position (3), normal (3), colour (4). */
export const MESH_STRIDE = 10
/** Cylinder flags. */
export const CAP_A = 1, CAP_B = 2, FLAT = 4

export interface Scene {
  kind: SceneInput['kind']
  style: MolStyle
  centre: Vec3
  /** Bounding radius of everything drawn, about the centre (Å). */
  radius: number
  /** Start orientation: rows that go to the screen's x, y and towards the viewer. */
  axes: number[]
  atoms: SceneAtom[]
  spheres: Float32Array
  sphereCount: number
  /** Translucent ellipsoids (lone pairs), same layout as the spheres. */
  lobes: Float32Array
  lobeCount: number
  cylinders: Float32Array
  cylinderCount: number
  /** Opaque triangles (arrow heads). */
  mesh: Float32Array
  meshVertices: number
  /** Translucent triangles (polyhedron faces). */
  faces: Float32Array
  faceVertices: number
  /** Orbital cloud: positions, colours, the diameter of a point (Å). */
  points: Float32Array
  pointColours: Float32Array
  pointCount: number
  pointSize: number
  labels: SceneLabel[]
  /** Depth cue: how far the back of the scene fades into the ground (0 … 1). */
  fog: number
  /** What was built (tests, and the viewer's summary line). */
  counts: { atoms: number; bonds: number; sticks: number; lobes: number; faces: number; points: number }
}

/** Ball radius as a fraction of the van der Waals radius; of the ionic radius in an ionic crystal. */
export const BALL_SCALE = 0.26
export const ION_SCALE = 0.3
/** Stick radii (Å). */
const STICK = 0.105
const STICK_DOUBLE = 0.07
const STICK_TRIPLE = 0.055
const WIRE = 0.04
const LOBE_SHORT = 0.2
const LOBE_STRETCH = 1.7

class Builder {
  spheres: number[] = []
  lobes: number[] = []
  cylinders: number[] = []
  mesh: number[] = []
  faces: number[] = []
  labels: SceneLabel[] = []
  atoms: SceneAtom[] = []
  sticks = 0

  sphere(c: Vec3, r: number, colour: RGB, flags = 0) { this.spheres.push(c[0], c[1], c[2], r, 0, 0, 0, 1, colour[0], colour[1], colour[2], flags) }

  lobe(c: Vec3, short: number, axis: Vec3, stretch: number, colour: RGB) { this.lobes.push(c[0], c[1], c[2], short, axis[0], axis[1], axis[2], stretch, colour[0], colour[1], colour[2], 1) }

  cylinder(a: Vec3, b: Vec3, r: number, ca: RGB, cb: RGB = ca, o: { minPx?: number; blend?: number; flags?: number } = {}) {
    this.cylinders.push(a[0], a[1], a[2], b[0], b[1], b[2], r, o.minPx ?? 0, ca[0], ca[1], ca[2], cb[0], cb[1], cb[2], o.blend ?? 0, o.flags ?? 0)
  }

  private vertex(list: number[], p: Vec3, n: Vec3, c: RGB, alpha: number) { list.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], alpha) }

  triangle(list: number[], a: Vec3, b: Vec3, c: Vec3, na: Vec3, nb: Vec3, nc: Vec3, colour: RGB, alpha: number) {
    this.vertex(list, a, na, colour, alpha); this.vertex(list, b, nb, colour, alpha); this.vertex(list, c, nc, colour, alpha)
  }

  /** A cone from the centre of its base to its tip, with a closed base. */
  cone(base: Vec3, tip: Vec3, radius: number, colour: RGB, segments = 20) {
    const axis = normalize(sub(tip, base)), h = length(sub(tip, base))
    const u = perpendicular(axis), v = cross(axis, u)
    const rim = (k: number): Vec3 => { const t = 2 * Math.PI * k / segments; return add(base, add(scale(u, radius * Math.cos(t)), scale(v, radius * Math.sin(t)))) }
    // The normal of the mantle leans towards the tip by the cone's half angle
    const slope = (k: number): Vec3 => { const t = 2 * Math.PI * k / segments; return normalize(add(scale(add(scale(u, Math.cos(t)), scale(v, Math.sin(t))), h), scale(axis, radius))) }
    const back = scale(axis, -1)
    for (let k = 0; k < segments; k++) {
      this.triangle(this.mesh, rim(k), rim(k + 1), tip, slope(k), slope(k + 1), slope(k + 0.5), colour, 1)
      this.triangle(this.mesh, base, rim(k + 1), rim(k), back, back, back, colour, 1)
    }
  }
}

/** The shortest ring through a bond: the atoms of the shortest path from `i` to `j` that does not use the bond itself. */
function ringThrough(i: number, j: number, nb: number[][]): number[] | null {
  const prev = new Map<number, number>([[i, -1]])
  let frontier = [i]
  while (frontier.length) {
    const next: number[] = []
    for (const a of frontier) {
      for (const b of nb[a]) {
        if ((a === i && b === j) || prev.has(b)) continue
        prev.set(b, a)
        if (b === j) {
          const ring: number[] = []
          for (let x = j; x !== -1; x = prev.get(x)!) ring.push(x)
          return ring
        }
        next.push(b)
      }
    }
    frontier = next
  }
  return null
}

/** A unit vector across a bond, in the plane of its neighbours: where the second stick of a double bond goes. */
function bondSide(i: number, j: number, pos: Vec3[], nb: number[][]): Vec3 {
  const axis = normalize(sub(pos[j], pos[i]))
  for (const [a, other] of [[i, j], [j, i]] as const) {
    for (const k of nb[a]) {
      if (k === other) continue
      const v = sub(pos[k], pos[a])
      const p = sub(v, scale(axis, dot(v, axis)))
      if (length(p) > 0.1) return normalize(p)
    }
  }
  return perpendicular(axis)
}

interface StickStyle { radius: number; minPx: number; flags: number }

/** The sticks of one bond: one, two or three side by side; an aromatic bond is a stick with a dashed companion on the ring's side. */
function addBond(b: Builder, pa: Vec3, pb: Vec3, order: number, side: Vec3, ca: RGB, cb: RGB, blend: number, style: MolStyle, thin: boolean) {
  const wire = style === 'wire'
  const base: StickStyle = wire ? { radius: WIRE, minPx: 0.9, flags: CAP_A | CAP_B } : { radius: thin ? 0.07 : STICK, minPx: 0, flags: 0 }
  const stick = (offset: number, radius: number) => {
    const d = scale(side, offset)
    b.cylinder(add(pa, d), add(pb, d), radius, ca, cb, { minPx: base.minPx, blend, flags: base.flags })
    b.sticks++
  }
  if (order === 1.5) {
    const gap = wire ? 0.07 : 0.1
    stick(-gap * 0.6, wire ? WIRE : 0.075)
    // The dashed companion towards the centre of the ring: four dashes between the balls
    const d = scale(side, gap * 1.25)
    const [t0, t1, n] = [0.2, 0.8, 4]
    for (let k = 0; k < n; k++) {
      const s0 = t0 + (t1 - t0) * (k + 0.18) / n, s1 = t0 + (t1 - t0) * (k + 0.82) / n
      const mid = (s0 + s1) / 2
      b.cylinder(add(lerp(pa, pb, s0), d), add(lerp(pa, pb, s1), d), wire ? WIRE * 0.9 : 0.05, mid < 0.5 ? ca : cb, mid < 0.5 ? ca : cb, { minPx: base.minPx, flags: CAP_A | CAP_B })
    }
    b.sticks += n
  } else if (order >= 2.5) {
    const gap = wire ? 0.12 : 0.155
    stick(0, wire ? WIRE : STICK_TRIPLE)
    stick(gap, wire ? WIRE : STICK_TRIPLE)
    stick(-gap, wire ? WIRE : STICK_TRIPLE)
  } else if (order >= 1.75) {
    const gap = wire ? 0.07 : 0.105
    stick(gap, wire ? WIRE : STICK_DOUBLE)
    stick(-gap, wire ? WIRE : STICK_DOUBLE)
  } else {
    stick(0, base.radius)
  }
}

function moleculeScene(input: Extract<SceneInput, { kind: 'molecule' }>, o: SceneOptions, P: MolPalette, b: Builder) {
  const { atoms, shape } = input
  const n = atoms.length
  const pos: Vec3[] = Array.from({ length: n }, (_, i) => [input.xyz[3 * i], input.xyz[3 * i + 1], input.xyz[3 * i + 2]])
  const nb: number[][] = Array.from({ length: n }, () => [])
  for (const bd of shape.bonds) { nb[bd.i].push(bd.j); nb[bd.j].push(bd.i) }
  const colour = atoms.map(s => elementColour(s, P.theme))
  const ball = (i: number) => (o.style === 'space' ? shape.radii.vdw[i] : o.style === 'ball' ? BALL_SCALE * shape.radii.vdw[i] : nb[i].length ? WIRE : 0.22)
  for (let i = 0; i < n; i++) {
    b.sphere(pos[i], ball(i), colour[i])
    // In the wireframe an atom is picked within a ball's radius of its joint
    b.atoms.push({ pos: pos[i], radius: o.style === 'wire' ? Math.max(ball(i), 0.3) : ball(i), element: atoms[i], colour: colour[i] })
    b.labels.push({ pos: pos[i], text: atoms[i], kind: 'element', atom: i })
  }
  // Net pull on each atom's electrons, from the core's bond polarities: the sign decides δ+ or δ−
  const pull = new Array<number>(n).fill(0)
  if (o.style !== 'space') {
    for (const bd of shape.bonds) {
      let side = bondSide(bd.i, bd.j, pos, nb)
      if (bd.order === 1.5) {
        const ring = ringThrough(bd.i, bd.j, nb)
        if (ring) {
          const centre = scale(ring.reduce<Vec3>((s, a) => add(s, pos[a]), [0, 0, 0]), 1 / ring.length)
          const axis = normalize(sub(pos[bd.j], pos[bd.i]))
          const v = sub(centre, lerp(pos[bd.i], pos[bd.j], 0.5))
          const inward = sub(v, scale(axis, dot(v, axis)))
          if (length(inward) > 1e-6) side = normalize(inward)
        }
      }
      let ca: RGB = o.style === 'wire' ? colour[bd.i] : P.bond, cb: RGB = o.style === 'wire' ? colour[bd.j] : P.bond
      let blend = 0
      if (o.polarity && bd.negative !== null && bd.kind !== 'nonpolar' && bd.ionicCharacter !== null) {
        const strength = Math.min(1, 0.45 + bd.ionicCharacter)
        const minus = mix(P.bond, P.deltaMinus, strength), plus = mix(P.bond, P.deltaPlus, strength)
        ca = bd.negative === bd.i ? minus : plus
        cb = bd.negative === bd.j ? minus : plus
        blend = 0.3
        pull[bd.negative] -= bd.ionicCharacter
        pull[bd.negative === bd.i ? bd.j : bd.i] += bd.ionicCharacter
      }
      addBond(b, pos[bd.i], pos[bd.j], bd.order, side, ca, cb, blend, o.style, false)
    }
    if (o.polarity) for (let i = 0; i < n; i++) if (Math.abs(pull[i]) > 0.04) b.labels.push({ pos: pos[i], text: pull[i] > 0 ? 'δ+' : 'δ−', kind: 'charge', atom: i })
  }
  let lobes = 0
  if (o.lonePairs && o.style !== 'space') {
    for (const c of shape.centres) {
      for (const d of c.lobes) {
        const long = LOBE_SHORT * LOBE_STRETCH
        // The lobe grows out of the ball: its inner end sits a quarter of the ball's radius below the surface
        const start = o.style === 'ball' ? 0.75 * ball(c.atom) : 0.1
        const centre = add(pos[c.atom], scale(d, start + long))
        b.lobe(centre, LOBE_SHORT, d, LOBE_STRETCH, P.lonePair)
        // The pair itself: two dots inside the outer half of the lobe
        const across = perpendicular(d)
        for (const s of [-1, 1]) b.sphere(add(centre, add(scale(d, long * 0.3), scale(across, s * 0.075))), 0.045, P.text, 1)
        lobes++
      }
    }
  }
  if (o.dipole && shape.dipole && shape.dipole.magnitude >= 0.05) {
    // Beside the molecule, parallel to the moment: along the principal axis that is most nearly perpendicular to it
    const dir = normalize(scale(shape.dipole.vector, -1))
    const rows: Vec3[] = [0, 1, 2].map(k => [shape.axes[3 * k], shape.axes[3 * k + 1], shape.axes[3 * k + 2]])
    let side = rows[0]
    for (const r of rows) if (Math.abs(dot(r, dir)) < Math.abs(dot(side, dir)) - 1e-6) side = r
    side = normalize(sub(side, scale(dir, dot(side, dir))))
    let reach = 0
    for (let i = 0; i < n; i++) reach = Math.max(reach, dot(sub(pos[i], shape.centre), side) + (o.style === 'wire' ? 0.15 : ball(i)))
    const len = Math.min(3.2, Math.max(0.9, 0.85 * shape.dipole.magnitude))
    const mid = add(shape.centre, scale(side, reach + 0.55))
    const tail = sub(mid, scale(dir, len / 2)), tip = add(mid, scale(dir, len / 2))
    const neck = sub(tip, scale(dir, 0.34))
    b.cylinder(tail, neck, 0.05, P.dipole, P.dipole, { flags: CAP_A | CAP_B, minPx: 0.8 })
    b.cone(neck, tip, 0.14, P.dipole)
    // The cross at the positive end
    const bar = add(tail, scale(dir, 0.2))
    b.cylinder(sub(bar, scale(side, 0.17)), add(bar, scale(side, 0.17)), 0.05, P.dipole, P.dipole, { flags: CAP_A | CAP_B, minPx: 0.8 })
    if (o.dipoleText) b.labels.push({ pos: sub(tail, scale(dir, 0.28)), text: o.dipoleText, kind: 'note' })
  }
  return { centre: shape.centre as Vec3, axes: Array.from(shape.axes), bonds: shape.bonds.length, lobes, fog: 0.1 }
}

function crystalScene(input: Extract<SceneInput, { kind: 'crystal' }>, o: SceneOptions, P: MolPalette, b: Builder) {
  const c = input.build
  const colours = c.species.map(s => elementColour(s.symbol, P.theme))
  const ionic = c.radiusModel === 'ionic' || c.radiusModel === 'given'
  const radius = c.species.map(s => (o.style === 'space' ? s.rfill : o.style === 'ball' ? (ionic ? ION_SCALE * s.rfill : BALL_SCALE * s.rvdw) : WIRE))
  const pos = (i: number): Vec3 => [c.xyz[3 * i], c.xyz[3 * i + 1], c.xyz[3 * i + 2]]
  const drawAtom = (p: Vec3, kind: number, label: boolean) => {
    const bonded = o.style !== 'wire'
    b.sphere(p, bonded ? radius[kind] : WIRE * 1.6, colours[kind])
    b.atoms.push({ pos: p, radius: o.style === 'wire' ? 0.3 : radius[kind], element: c.species[kind].symbol, colour: colours[kind] })
    if (label) b.labels.push({ pos: p, text: c.species[kind].symbol, kind: 'element', atom: b.atoms.length - 1 })
  }
  for (let i = 0; i < c.count; i++) drawAtom(pos(i), c.kind[i], true)
  if (o.style !== 'space') {
    for (let k = 0; k < c.bonds.ij.length; k += 2) {
      const i = c.bonds.ij[k], j = c.bonds.ij[k + 1]
      const ca = o.style === 'wire' ? colours[c.kind[i]] : P.bond, cb = o.style === 'wire' ? colours[c.kind[j]] : P.bond
      addBond(b, pos(i), pos(j), 1, [0, 0, 0], ca, cb, 0, o.style, true)
    }
  }
  if (o.frame) {
    const e = c.edges.xyz
    for (let k = 0; k * 6 < e.length; k++) {
      const outer = k < c.edges.outer
      const col = outer ? P.cell : P.cellInner
      b.cylinder([e[6 * k], e[6 * k + 1], e[6 * k + 2]], [e[6 * k + 3], e[6 * k + 4], e[6 * k + 5]], 0.012, col, col, { minPx: outer ? 0.85 : 0.6, flags: FLAT | CAP_A | CAP_B })
    }
  }
  let faces = 0
  const poly = c.polyhedron
  if (o.polyhedron && poly) {
    const v = (k: number): Vec3 => [poly.vertices[3 * k], poly.vertices[3 * k + 1], poly.vertices[3 * k + 2]]
    // Neighbours outside the block are drawn too: a polyhedron's corner is never empty
    for (let k = 0; k < poly.index.length; k++) if (poly.index[k] < 0) drawAtom(v(k), poly.kind[k], false)
    const edges = new Set<string>()
    for (const loop of poly.faces) {
      const normal = normalize(cross(sub(v(loop[1]), v(loop[0])), sub(v(loop[2]), v(loop[0]))))
      for (let k = 1; k + 1 < loop.length; k++) b.triangle(b.faces, v(loop[0]), v(loop[k]), v(loop[k + 1]), normal, normal, normal, P.polyhedron, 0.3)
      faces++
      for (let k = 0; k < loop.length; k++) {
        const p = loop[k], q = loop[(k + 1) % loop.length]
        const key = p < q ? `${p}-${q}` : `${q}-${p}`
        if (edges.has(key)) continue
        edges.add(key)
        b.cylinder(v(p), v(q), 0.03, P.polyhedronEdge, P.polyhedronEdge, { minPx: 0.9, flags: FLAT })
      }
    }
  }
  // c up, b to the right, a towards the viewer: the way cells are drawn in textbooks
  return { centre: c.centre as Vec3, axes: [0, 1, 0, 0, 0, 1, 1, 0, 0], bonds: c.bonds.ij.length / 2, lobes: 0, faces, fog: 0.3 }
}

function orbitalScene(input: Extract<SceneInput, { kind: 'orbital' }>, o: SceneOptions, P: MolPalette, b: Builder) {
  const s = input.sample
  const reach = s.r99
  if (o.frame) {
    const names = ['x', 'y', 'z']
    for (let k = 0; k < 3; k++) {
      const d: Vec3 = [0, 0, 0]
      d[k] = reach * 1.12
      b.cylinder(scale(d, -1), d, reach * 0.002, P.cellInner, P.cellInner, { minPx: 0.6, flags: FLAT | CAP_A | CAP_B })
      b.labels.push({ pos: scale(d, 1.06), text: names[k], kind: 'note' })
    }
  }
  const colours = new Float32Array(s.count * 3)
  const single = mix(P.negative, P.text, 0.15)
  for (let i = 0; i < s.count; i++) colours.set(o.signs ? (s.sign[i] ? P.positive : P.negative) : single, 3 * i)
  return { centre: [0, 0, 0] as Vec3, axes: [0, 1, 0, 0, 0, 1, 1, 0, 0], bonds: 0, lobes: 0, fog: 0.45, points: Float32Array.from(s.xyz), colours, size: reach * 0.013, reach }
}

/** Build the draw lists of an input for a palette and a set of options. */
export function buildScene(input: SceneInput, options: Partial<SceneOptions>, P: MolPalette): Scene {
  const o: SceneOptions = { ...DEFAULT_OPTIONS, ...options }
  const b = new Builder()
  let part: { centre: Vec3; axes: number[]; bonds: number; lobes: number; fog: number; faces?: number; points?: Float32Array; colours?: Float32Array; size?: number; reach?: number }
  if (input.kind === 'molecule') part = moleculeScene(input, o, P, b)
  else if (input.kind === 'crystal') part = crystalScene(input, o, P, b)
  else part = orbitalScene(input, o, P, b)

  // The bounding radius of everything that is drawn
  const c = part.centre
  let radius = part.reach ?? 0
  const reach = (p: number[], k: number, r: number) => { radius = Math.max(radius, Math.hypot(p[k] - c[0], p[k + 1] - c[1], p[k + 2] - c[2]) + r) }
  for (let k = 0; k < b.spheres.length; k += SPHERE_STRIDE) reach(b.spheres, k, b.spheres[k + 3])
  for (let k = 0; k < b.lobes.length; k += SPHERE_STRIDE) reach(b.lobes, k, b.lobes[k + 3] * b.lobes[k + 7])
  for (let k = 0; k < b.cylinders.length; k += CYLINDER_STRIDE) { reach(b.cylinders, k, b.cylinders[k + 6]); reach(b.cylinders, k + 3, b.cylinders[k + 6]) }
  for (let k = 0; k < b.mesh.length; k += MESH_STRIDE) reach(b.mesh, k, 0)
  for (const l of b.labels) if (l.kind === 'note') radius = Math.max(radius, length(sub(l.pos, c)))

  return {
    kind: input.kind, style: o.style, centre: c, radius: Math.max(radius, 0.5), axes: part.axes, atoms: b.atoms,
    spheres: Float32Array.from(b.spheres), sphereCount: b.spheres.length / SPHERE_STRIDE,
    lobes: Float32Array.from(b.lobes), lobeCount: b.lobes.length / SPHERE_STRIDE,
    cylinders: Float32Array.from(b.cylinders), cylinderCount: b.cylinders.length / CYLINDER_STRIDE,
    mesh: Float32Array.from(b.mesh), meshVertices: b.mesh.length / MESH_STRIDE,
    faces: Float32Array.from(b.faces), faceVertices: b.faces.length / MESH_STRIDE,
    points: part.points ?? new Float32Array(0), pointColours: part.colours ?? new Float32Array(0), pointCount: (part.points?.length ?? 0) / 3, pointSize: part.size ?? 0,
    labels: b.labels, fog: part.fog,
    counts: { atoms: b.atoms.length, bonds: part.bonds, sticks: b.sticks, lobes: part.lobes, faces: part.faces ?? 0, points: (part.points?.length ?? 0) / 3 }
  }
}
