/**
 * Picking atoms in the 3D viewer (26.64, D271): the ray through the pointer is tested against the atoms' spheres on
 * this thread — exact, independent of what was drawn, and the same for the WebGL picture and the Canvas-2D fallback
 * (a few thousand ray–sphere tests per click cost nothing). The nearest hit wins; a miss within `slop` pixels of an
 * atom's outline still counts, so small hydrogens can be hit on a touch screen.
 */
import type { Camera, Viewport } from './camera'
import { pixelSize, screenRay, toView } from './camera'
import type { SceneAtom } from './scene'
import type { Vec3 } from './vec'
import { dot, sub } from './vec'

/** Distance along a ray to a sphere; null for a miss or a sphere behind the origin. */
export function raySphere(origin: Vec3, dir: Vec3, centre: Vec3, radius: number): number | null {
  const oc = sub(origin, centre)
  const b = dot(oc, dir)
  const c = dot(oc, oc) - radius * radius
  const disc = b * b - c
  if (disc < 0) return null
  const t = -b - Math.sqrt(disc)
  return t > 0 ? t : null
}

/**
 * The atom under a screen point: index into `atoms`, or −1. `slop` widens every atom by that many CSS pixels.
 */
export function pickAtom(camera: Camera, vp: Viewport, x: number, y: number, atoms: readonly SceneAtom[], slop = 0): number {
  const { origin, dir } = screenRay(camera, vp, x, y)
  // An exact hit first: only when the pointer is on no atom at all do the widened spheres get a say
  for (const widen of slop > 0 ? [0, slop] : [0]) {
    let best = -1, bestT = Infinity
    for (let i = 0; i < atoms.length; i++) {
      const a = atoms[i]
      const extra = widen > 0 ? widen * pixelSize(camera, vp, toView(camera, a.pos)[2]) : 0
      const t = raySphere(origin, dir, a.pos, a.radius + extra)
      if (t !== null && t < bestT) { bestT = t; best = i }
    }
    if (best >= 0) return best
  }
  return -1
}
