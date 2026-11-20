/**
 * Canvas-2D picture of a scene (26.64, D271), for machines without WebGL2: the same draw lists, painted back to front
 * — balls as shaded discs with a contour, sticks as thick lines in two halves, lone-pair lobes as ellipses, polyhedron
 * faces as translucent polygons, an orbital cloud as dots.
 *
 * What the painter's order cannot do, and the WebGL picture does: two shapes that pass through each other are not cut
 * along their true intersection (a stick ends at the outline of its ball, which is right, but overlapping
 * space-filling spheres show whole discs); the cloud's dots are not sorted against each other and are thinned to
 * `CLOUD_LIMIT`; shading is a gradient, not per-pixel lighting. Picking, labels and measurements are the same code as
 * for WebGL and work unchanged.
 */
import type { Camera, Viewport } from './camera'
import { pixelSize, project, toView } from './camera'
import type { MolPalette, RGB } from './palette'
import { mix, toCss } from './palette'
import type { Scene } from './scene'
import { CAP_A, CAP_B, CYLINDER_STRIDE, FLAT, MESH_STRIDE, SPHERE_STRIDE } from './scene'
import type { Vec3 } from './vec'
import { add, length, normalize, scale, sub } from './vec'

/** Most dots of a cloud the fallback draws. */
export const CLOUD_LIMIT = 6000
/** Up to this many balls get a gradient; beyond it a flat fill keeps the frame time down. */
const GRADIENT_LIMIT = 600
const LIGHT: Vec3 = [-0.371, 0.557, 0.743]

interface Item { z: number; draw: () => void }

/** Ball radius at each end of the sticks, looked up once per scene: a stick is drawn from surface to surface. */
const trims = new WeakMap<Scene, Float32Array>()

function stickTrims(scene: Scene): Float32Array {
  let t = trims.get(scene)
  if (t) return t
  const cell = 0.6
  const key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`
  const grid = new Map<string, number[]>()
  const s = scene.spheres
  for (let i = 0; i < scene.sphereCount; i++) {
    const k = key(s[i * SPHERE_STRIDE], s[i * SPHERE_STRIDE + 1], s[i * SPHERE_STRIDE + 2])
    const list = grid.get(k)
    if (list) list.push(i); else grid.set(k, [i])
  }
  const radiusAt = (x: number, y: number, z: number): number => {
    let best = 0, bestD = 0.25
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const i of grid.get(key(x + dx * cell, y + dy * cell, z + dz * cell)) ?? []) {
        const d = Math.hypot(s[i * SPHERE_STRIDE] - x, s[i * SPHERE_STRIDE + 1] - y, s[i * SPHERE_STRIDE + 2] - z)
        if (d < bestD) { bestD = d; best = s[i * SPHERE_STRIDE + 3] }
      }
    }
    return best
  }
  t = new Float32Array(scene.cylinderCount * 2)
  const c = scene.cylinders
  for (let i = 0; i < scene.cylinderCount; i++) {
    const k = i * CYLINDER_STRIDE, flags = c[k + 15]
    t[2 * i] = flags & CAP_A ? 0 : radiusAt(c[k], c[k + 1], c[k + 2])
    t[2 * i + 1] = flags & CAP_B ? 0 : radiusAt(c[k + 3], c[k + 4], c[k + 5])
  }
  trims.set(scene, t)
  return t
}

/** Paint the scene into a context whose units are CSS pixels (the caller clears nothing: the ground is filled here). */
export function drawFallback(ctx: CanvasRenderingContext2D, scene: Scene, camera: Camera, vp: Viewport, P: MolPalette) {
  ctx.save()
  ctx.fillStyle = toCss(P.bg)
  ctx.fillRect(0, 0, vp.width, vp.height)
  const fogNear = camera.distance - scene.radius * 0.35, fogFar = camera.distance + scene.radius * 1.05
  const fade = (c: RGB, z: number): RGB => mix(c, P.bg, Math.min(1, Math.max(0, (-z - fogNear) / Math.max(1e-6, fogFar - fogNear))) * scene.fog)
  const outline = toCss(P.outline, P.outlineStrength)
  const items: Item[] = []

  // Balls
  const s = scene.spheres
  const gradients = scene.sphereCount <= GRADIENT_LIMIT
  for (let i = 0; i < scene.sphereCount; i++) {
    const k = i * SPHERE_STRIDE
    const p = project(camera, vp, [s[k], s[k + 1], s[k + 2]])
    const r = s[k + 3] / pixelSize(camera, vp, p[2])
    const base = fade([s[k + 8], s[k + 9], s[k + 10]], p[2])
    const plain = s[k + 11] > 0.5
    items.push({
      z: p[2],
      draw: () => {
        ctx.beginPath()
        ctx.arc(p[0], p[1], Math.max(r, 0.6), 0, 2 * Math.PI)
        if (gradients && r > 3) {
          const g = ctx.createRadialGradient(p[0] - r * 0.34, p[1] - r * 0.4, r * 0.08, p[0], p[1], r)
          g.addColorStop(0, toCss(mix(base, [1, 1, 1], 0.42)))
          g.addColorStop(0.45, toCss(base))
          g.addColorStop(1, toCss(mix(base, [0, 0, 0], 0.3)))
          ctx.fillStyle = g
        } else ctx.fillStyle = toCss(base)
        ctx.fill()
        if (!plain && r > 1.5) { ctx.lineWidth = Math.min(1.3, r * 0.34); ctx.strokeStyle = outline; ctx.stroke() }
      }
    })
  }

  // Sticks: two halves, each at its own depth, from ball surface to ball surface
  const c = scene.cylinders
  const trim = stickTrims(scene)
  for (let i = 0; i < scene.cylinderCount; i++) {
    const k = i * CYLINDER_STRIDE
    let a: Vec3 = [c[k], c[k + 1], c[k + 2]], b: Vec3 = [c[k + 3], c[k + 4], c[k + 5]]
    const full = length(sub(b, a))
    if (full < 1e-9) continue
    const dir = normalize(sub(b, a))
    const ta = Math.min(trim[2 * i] * 0.92, full * 0.45), tb = Math.min(trim[2 * i + 1] * 0.92, full * 0.45)
    const a0 = a, b0 = b
    a = add(a, scale(dir, ta)); b = sub(b, scale(dir, tb))
    const mid = scale(add(a0, b0), 0.5)
    const flat = (c[k + 15] & FLAT) !== 0
    const blend = c[k + 14] > 0
    const ca: RGB = [c[k + 8], c[k + 9], c[k + 10]], cb: RGB = [c[k + 11], c[k + 12], c[k + 13]]
    const half = (from: Vec3, to: Vec3, c0: RGB, c1: RGB) => {
      const p = project(camera, vp, from), q = project(camera, vp, to)
      const z = (p[2] + q[2]) / 2
      const width = Math.max(2 * c[k + 6] / pixelSize(camera, vp, z), 2 * c[k + 7], 0.8)
      items.push({
        z,
        draw: () => {
          ctx.lineCap = 'butt'
          ctx.beginPath()
          ctx.moveTo(p[0], p[1])
          ctx.lineTo(q[0], q[1])
          if (!flat && width > 2.5) { ctx.lineWidth = width + 1.6; ctx.strokeStyle = outline; ctx.stroke() }
          ctx.lineWidth = width
          if (blend) {
            const g = ctx.createLinearGradient(p[0], p[1], q[0], q[1])
            g.addColorStop(0, toCss(fade(c0, z)))
            g.addColorStop(1, toCss(fade(c1, z)))
            ctx.strokeStyle = g
          } else ctx.strokeStyle = toCss(fade(c0, z))
          ctx.stroke()
        }
      })
    }
    // With a blend the colour runs from one end to the other; otherwise each half has its end's colour
    half(a, mid, ca, blend ? mix(ca, cb, 0.5) : ca)
    half(mid, b, blend ? mix(ca, cb, 0.5) : cb, cb)
  }

  // Lone-pair lobes: ellipses along the projected axis
  const l = scene.lobes
  for (let i = 0; i < scene.lobeCount; i++) {
    const k = i * SPHERE_STRIDE
    const centre: Vec3 = [l[k], l[k + 1], l[k + 2]], axis: Vec3 = [l[k + 4], l[k + 5], l[k + 6]]
    const short = l[k + 3], long = short * l[k + 7]
    const p = project(camera, vp, centre), tip = project(camera, vp, add(centre, scale(axis, long)))
    const ps = pixelSize(camera, vp, p[2])
    const along = Math.hypot(tip[0] - p[0], tip[1] - p[1])
    const col = toCss(fade([l[k + 8], l[k + 9], l[k + 10]], p[2]), 0.55)
    items.push({
      // Just behind its own centre, so the pair's two dots (drawn as balls) show through
      z: p[2] + 1e-3,
      draw: () => {
        ctx.beginPath()
        ctx.ellipse(p[0], p[1], Math.max(along, short / ps), short / ps, Math.atan2(tip[1] - p[1], tip[0] - p[0]), 0, 2 * Math.PI)
        ctx.fillStyle = col
        ctx.fill()
      }
    })
  }

  // Triangles: opaque (arrow heads) and translucent (polyhedron faces)
  const triangles = (data: Float32Array, vertices: number, translucent: boolean) => {
    for (let v = 0; v + 2 < vertices; v += 3) {
      const pts: Vec3[] = [0, 1, 2].map(j => project(camera, vp, [data[(v + j) * MESH_STRIDE], data[(v + j) * MESH_STRIDE + 1], data[(v + j) * MESH_STRIDE + 2]]))
      const k = v * MESH_STRIDE
      const n = toView({ ...camera, target: [0, 0, 0], distance: 0 }, [data[k + 3], data[k + 4], data[k + 5]])
      const facing = n[2] < 0 ? scale(n, -1) : n
      const wrap = 0.5 + 0.5 * (facing[0] * LIGHT[0] + facing[1] * LIGHT[1] + facing[2] * LIGHT[2])
      const z = (pts[0][2] + pts[1][2] + pts[2][2]) / 3
      const col = fade(scale([data[k + 6], data[k + 7], data[k + 8]], 0.5 + 0.5 * wrap * wrap) as RGB, z)
      const alpha = data[k + 9]
      items.push({
        z: translucent ? z - 1e-3 : z,
        draw: () => {
          ctx.beginPath()
          ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[1][0], pts[1][1]); ctx.lineTo(pts[2][0], pts[2][1])
          ctx.closePath()
          ctx.fillStyle = toCss(col, alpha)
          ctx.fill()
          // Opaque neighbours share an edge: a hairline in the same colour closes the seam
          if (!translucent) { ctx.lineWidth = 0.6; ctx.strokeStyle = toCss(col); ctx.stroke() }
        }
      })
    }
  }
  triangles(scene.mesh, scene.meshVertices, false)
  triangles(scene.faces, scene.faceVertices, true)

  items.sort((p, q) => p.z - q.z)
  for (const it of items) it.draw()

  // The cloud: every n-th point, unsorted
  if (scene.pointCount) {
    const step = Math.max(1, Math.ceil(scene.pointCount / CLOUD_LIMIT))
    const size = Math.max(1.6, scene.pointSize / pixelSize(camera, vp, -camera.distance))
    for (let i = 0; i < scene.pointCount; i += step) {
      const p = project(camera, vp, [scene.points[3 * i], scene.points[3 * i + 1], scene.points[3 * i + 2]])
      ctx.fillStyle = toCss(fade([scene.pointColours[3 * i], scene.pointColours[3 * i + 1], scene.pointColours[3 * i + 2]], p[2]))
      ctx.fillRect(p[0] - size / 2, p[1] - size / 2, size, size)
    }
  }
  ctx.restore()
}
