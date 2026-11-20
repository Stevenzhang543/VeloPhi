/**
 * Vectors, quaternions and 4 × 4 matrices of the 3D viewer (26.64, D271). Plain arrays of doubles; matrices are
 * column-major like WebGL's. View space is right-handed: x to the right, y up, the camera looks down −z — so a
 * molecule keeps its handedness on the screen (an L-amino acid stays an L-amino acid).
 *
 * This is drawing arithmetic only: what the user reads as a number (a distance, an angle) is computed by the core.
 */

export type Vec3 = [number, number, number]
/** x, y, z, w. */
export type Quat = [number, number, number, number]
/** Column-major. */
export type Mat4 = number[]

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2])
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/** Unit vector along `a` (the zero vector stays zero). */
export function normalize(a: Vec3): Vec3 {
  const n = length(a)
  return n > 1e-12 ? [a[0] / n, a[1] / n, a[2] / n] : [0, 0, 0]
}

/** A unit vector perpendicular to `a` (cross product with the axis along which `a` is smallest). */
export function perpendicular(a: Vec3): Vec3 {
  const ax = Math.abs(a[0]), ay = Math.abs(a[1]), az = Math.abs(a[2])
  const e: Vec3 = ax <= ay && ax <= az ? [1, 0, 0] : ay <= az ? [0, 1, 0] : [0, 0, 1]
  return normalize(cross(a, e))
}

export const QUAT_IDENTITY: Quat = [0, 0, 0, 1]

/** Rotation by `angle` (rad) about the unit `axis`, counter-clockwise seen against the axis (right-hand rule). */
export function quatAxisAngle(axis: Vec3, angle: number): Quat {
  const s = Math.sin(angle / 2)
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)]
}

/** The rotation `a` after `b` (apply b first). */
export function quatMul(a: Quat, b: Quat): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
  ]
}

export function quatNormalize(q: Quat): Quat {
  const n = Math.hypot(q[0], q[1], q[2], q[3])
  return n > 1e-12 ? [q[0] / n, q[1] / n, q[2] / n, q[3] / n] : [0, 0, 0, 1]
}

export const quatConj = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]]

/** Rotate a vector. */
export function quatRotate(q: Quat, v: Vec3): Vec3 {
  // v + 2 u × (u × v + w v), u the vector part
  const u: Vec3 = [q[0], q[1], q[2]]
  const t = add(cross(u, v), scale(v, q[3]))
  return add(v, scale(cross(u, t), 2))
}

/** The rotation whose matrix has the unit, right-handed `rows` (rows are the images of the axes under the inverse). */
export function quatFromRows(r0: Vec3, r1: Vec3, r2: Vec3): Quat {
  const m00 = r0[0], m01 = r0[1], m02 = r0[2], m10 = r1[0], m11 = r1[1], m12 = r1[2], m20 = r2[0], m21 = r2[1], m22 = r2[2]
  const tr = m00 + m11 + m22
  let q: Quat
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2
    q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4]
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2
    q = [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2
    q = [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s]
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2
    q = [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s]
  }
  return quatNormalize(q)
}

/** Shortest-arc interpolation between two rotations. */
export function quatSlerp(a: Quat, b: Quat, t: number): Quat {
  let c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]
  const bb: Quat = c < 0 ? [-b[0], -b[1], -b[2], -b[3]] : b
  c = Math.abs(c)
  if (c > 0.9995) return quatNormalize([a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t, a[2] + (bb[2] - a[2]) * t, a[3] + (bb[3] - a[3]) * t])
  const th = Math.acos(Math.min(1, c)), s = Math.sin(th)
  const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s
  return [a[0] * wa + bb[0] * wb, a[1] * wa + bb[1] * wb, a[2] * wa + bb[2] * wb, a[3] * wa + bb[3] * wb]
}

/** Angle (rad) of the rotation between two orientations. */
export function quatAngle(a: Quat, b: Quat): number {
  const c = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])
  return 2 * Math.acos(Math.min(1, c))
}

/** The matrix of a rotation followed by a translation. */
export function mat4RotationTranslation(q: Quat, t: Vec3): Mat4 {
  const [x, y, z, w] = q
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
    t[0], t[1], t[2], 1
  ]
}

/** Perspective projection (vertical field of view in rad), depth to −1 … 1. */
export function mat4Perspective(fov: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fov / 2)
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0]
}

/** Orthographic projection of the box ±halfWidth × ±halfHeight. */
export function mat4Ortho(halfWidth: number, halfHeight: number, near: number, far: number): Mat4 {
  return [1 / halfWidth, 0, 0, 0, 0, 1 / halfHeight, 0, 0, 0, 0, 2 / (near - far), 0, 0, 0, (far + near) / (near - far), 1]
}

export function mat4Mul(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]
  return out
}

/** A point through a matrix, with the perspective division. */
export function mat4Point(m: Mat4, p: Vec3): Vec3 {
  const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15]
  return [(m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w, (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w, (m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]) / w]
}
