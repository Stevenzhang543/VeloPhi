/**
 * Camera of the 3D viewer (26.64, D271): a trackball around a target point, with the projection in both directions
 * (world → screen for labels, screen → ray for picking) and the gestures that move it.
 *
 * Motion follows D256: a drag is followed immediately; after release the rotation keeps its velocity and loses it
 * exponentially (no spring, so nothing can bounce); wheel zoom and the reset run as critically damped approaches;
 * every one of them is cut short by the next touch, and none of them runs under reduced motion (`calm`). The frame loop
 * exists only while something moves — an untouched viewer draws nothing.
 */
import type { Mat4, Quat, Vec3 } from './vec'
import { QUAT_IDENTITY, add, cross, mat4Mul, mat4Ortho, mat4Perspective, mat4Point, mat4RotationTranslation, normalize, quatAngle, quatAxisAngle, quatConj, quatFromRows, quatMul, quatNormalize, quatRotate, quatSlerp, scale, sub } from './vec'

export interface Camera {
  /** Rotation world → view. */
  q: Quat
  /** The world point at the centre of the view. */
  target: Vec3
  /** Eye to target (Å). */
  distance: number
  /** Vertical field of view (rad). With `ortho` it only fixes the scale: the frame at the target is the same. */
  fov: number
  ortho: boolean
}

/** Size of the view in CSS pixels. */
export interface Viewport { width: number; height: number }

/** Field of view of the viewer: narrow, so spheres at the edge stay round and cells keep their look. */
export const FOV = 28 * Math.PI / 180

export function defaultCamera(): Camera { return { q: QUAT_IDENTITY, target: [0, 0, 0], distance: 10, fov: FOV, ortho: false } }

export const cloneCamera = (c: Camera): Camera => ({ q: [...c.q] as Quat, target: [...c.target] as Vec3, distance: c.distance, fov: c.fov, ortho: c.ortho })

/** World → view. */
export function toView(c: Camera, p: Vec3): Vec3 {
  const v = quatRotate(c.q, sub(p, c.target))
  return [v[0], v[1], v[2] - c.distance]
}

/** View → world. */
export function fromView(c: Camera, v: Vec3): Vec3 {
  return add(quatRotate(quatConj(c.q), [v[0], v[1], v[2] + c.distance]), c.target)
}

export function viewMatrix(c: Camera): Mat4 {
  const t = quatRotate(c.q, scale(c.target, -1))
  return mat4RotationTranslation(c.q, [t[0], t[1], t[2] - c.distance])
}

/** Near and far planes around a scene of bounding `radius` centred on the target. */
export function clipPlanes(c: Camera, radius: number): [number, number] {
  const r = Math.max(radius, 1e-3) * 1.05
  return [Math.max(c.distance - r, c.distance * 0.02), c.distance + r]
}

/** Half the height of the frame at the target (Å). */
export const halfHeight = (c: Camera): number => c.distance * Math.tan(c.fov / 2)

export function projectionMatrix(c: Camera, aspect: number, near: number, far: number): Mat4 {
  return c.ortho ? mat4Ortho(halfHeight(c) * aspect, halfHeight(c), near, far) : mat4Perspective(c.fov, aspect, near, far)
}

/** World length of one CSS pixel at view depth `z` (negative in front of the camera). */
export function pixelSize(c: Camera, vp: Viewport, z: number): number {
  return (c.ortho ? halfHeight(c) : -z * Math.tan(c.fov / 2)) * 2 / Math.max(1, vp.height)
}

/** World → screen: CSS pixels from the top-left corner, and the view depth z. */
export function project(c: Camera, vp: Viewport, p: Vec3): Vec3 {
  const v = toView(c, p)
  const s = pixelSize(c, vp, v[2])
  return [vp.width / 2 + v[0] / s, vp.height / 2 - v[1] / s, v[2]]
}

/** Screen and view depth → world (the inverse of `project`). */
export function unproject(c: Camera, vp: Viewport, sx: number, sy: number, z: number): Vec3 {
  const s = pixelSize(c, vp, z)
  return fromView(c, [(sx - vp.width / 2) * s, (vp.height / 2 - sy) * s, z])
}

/** The ray through a screen point, in world coordinates. */
export function screenRay(c: Camera, vp: Viewport, sx: number, sy: number): { origin: Vec3; dir: Vec3 } {
  if (c.ortho) {
    const s = pixelSize(c, vp, -1)
    const origin = fromView(c, [(sx - vp.width / 2) * s, (vp.height / 2 - sy) * s, 0])
    return { origin, dir: normalize(quatRotate(quatConj(c.q), [0, 0, -1])) }
  }
  const origin = fromView(c, [0, 0, 0])
  return { origin, dir: normalize(sub(unproject(c, vp, sx, sy, -1), origin)) }
}

/** The same projection as the matrices give (tests: the shader and the labels agree). */
export function projectByMatrix(c: Camera, vp: Viewport, p: Vec3, radius: number): Vec3 {
  const [near, far] = clipPlanes(c, radius)
  const ndc = mat4Point(mat4Mul(projectionMatrix(c, vp.width / vp.height, near, far), viewMatrix(c)), p)
  return [(ndc[0] + 1) / 2 * vp.width, (1 - ndc[1]) / 2 * vp.height, ndc[2]]
}

/**
 * The distance from which a sphere of `radius` around the target fills the frame with `margin` to spare: in
 * perspective the sphere's outline touches the nearer pair of frame edges, d = r / sin θ with θ the smaller half
 * angle; in the orthographic view the frame's smaller half side equals r.
 */
export function fitDistance(radius: number, fov: number, aspect: number, ortho = false, margin = 1.1): number {
  const r = Math.max(radius, 1e-3) * margin
  const tanV = Math.tan(fov / 2)
  const tanSmall = Math.min(tanV, tanV * aspect)
  return ortho ? r / tanSmall : r / Math.sin(Math.atan(tanSmall))
}

/**
 * The start orientation from the principal axes of the object (rows; the core gives them by descending extent): the
 * longest axis lies along the screen's x, the second along y, the flattest faces the viewer — then a small turn so
 * that the depth shows (a planar molecule is not seen exactly face-on, the back of a cell not exactly behind its front).
 */
export function orientationFromAxes(axes: ArrayLike<number>, tilt: [number, number] = [-0.3, 0.32]): Quat {
  const r0 = normalize([axes[0], axes[1], axes[2]]), r1 = normalize([axes[3], axes[4], axes[5]])
  const r2 = normalize(cross(r0, r1))
  const base = r2.every(x => x === 0) ? QUAT_IDENTITY : quatFromRows(r0, normalize(cross(r2, r0)), r2)
  const turn = quatMul(quatAxisAngle([1, 0, 0], -tilt[0]), quatAxisAngle([0, 1, 0], tilt[1]))
  return quatNormalize(quatMul(turn, base))
}

/** Trackball: a drag of (dx, dy) pixels turns the scene about the screen axis perpendicular to the drag. */
export function rotateByDrag(q: Quat, dx: number, dy: number, vp: Viewport): Quat {
  const d = Math.hypot(dx, dy)
  if (d === 0) return q
  // Across the shorter side of the view: half a turn
  const angle = d / Math.max(1, Math.min(vp.width, vp.height)) * Math.PI
  return quatNormalize(quatMul(quatAxisAngle([dy / d, dx / d, 0], angle), q))
}

/** Turn about an axis fixed to the screen. */
export function rotateAbout(q: Quat, axis: Vec3, angle: number): Quat {
  return quatNormalize(quatMul(quatAxisAngle(axis, angle), q))
}

/** Move the target so that the scene follows a drag of (dx, dy) pixels. */
export function panByDrag(c: Camera, dx: number, dy: number, vp: Viewport): Vec3 {
  const s = pixelSize(c, vp, -c.distance)
  return sub(c.target, quatRotate(quatConj(c.q), [dx * s, -dy * s, 0]))
}

/** Angular velocity (rad/s, an axis fixed to the screen times the rate) left after `dt` seconds of free turning. */
export function decayVelocity(omega: Vec3, dt: number, tau: number): Vec3 {
  return scale(omega, Math.exp(-dt / tau))
}

/** The turn made during `dt` seconds while the velocity decays: ω τ (1 − e^(−dt/τ)) about the direction of ω. */
export function coastAngle(speed: number, dt: number, tau: number): number {
  return speed * tau * (1 - Math.exp(-dt / tau))
}

/** Critically damped approach of x to 1 from 0 with zero start velocity, after `t` seconds: no overshoot. */
export function settle(t: number, tau: number): number {
  const k = t / tau
  return 1 - (1 + k) * Math.exp(-k)
}

export interface TrackballOptions {
  viewport: () => Viewport
  /** Reduced motion: no inertia, no animated zoom or reset. */
  calm: () => boolean
  /** The camera a reset returns to. */
  home: () => Camera
  /** Something changed: draw a frame. */
  onChange: () => void
  /** A press and release without a drag (picking). */
  onTap?: (x: number, y: number, e: PointerEvent) => void
  /** The pointer moved without a button (hover). */
  onHover?: (x: number, y: number) => void
  /** Zoom limits as multiples of the home distance. */
  zoomRange?: [number, number]
  /** May the wheel zoom now? (False: the event is left to the page, which scrolls.) Pinch on a trackpad always zooms. */
  wheel?: () => boolean
}

/** Time constants (s): how long a released turn coasts, how fast zoom and reset settle. */
const COAST_TAU = 0.32
const ZOOM_TAU = 0.07
const RESET_TAU = 0.11
const TAP_SLOP = 5

/**
 * Pointer, wheel and touch handling of one viewer. Mouse: drag turns, Shift-drag or the right or middle button pans,
 * the wheel zooms, a double click resets. Touch: one finger turns, two fingers pinch, pan and twist, a double tap
 * resets.
 */
export class Trackball {
  camera: Camera
  private el: HTMLElement | null = null
  private pointers = new Map<number, { x: number; y: number; t: number }>()
  private mode: 'none' | 'rotate' | 'pan' | 'gesture' = 'none'
  private moved = 0
  private lastTap = { x: 0, y: 0, t: -1e9 }
  /** Screen-fixed angular velocity (rad/s). */
  private omega: Vec3 = [0, 0, 0]
  private coasting = false
  private zoomTo: number | null = null
  private reset: { from: Camera; to: Camera; t: number } | null = null
  private raf = 0
  private lastFrame = 0
  private gesture = { dist: 0, cx: 0, cy: 0, angle: 0 }

  constructor(camera: Camera, private opts: TrackballOptions) { this.camera = camera }

  attach(el: HTMLElement) {
    this.detach()
    this.el = el
    el.addEventListener('pointerdown', this.onDown)
    el.addEventListener('pointermove', this.onMove)
    el.addEventListener('pointerup', this.onUp)
    el.addEventListener('pointercancel', this.onUp)
    el.addEventListener('wheel', this.onWheel, { passive: false })
    el.addEventListener('dblclick', this.onDouble)
    el.addEventListener('contextmenu', this.onContext)
  }

  detach() {
    const el = this.el
    if (el) {
      el.removeEventListener('pointerdown', this.onDown)
      el.removeEventListener('pointermove', this.onMove)
      el.removeEventListener('pointerup', this.onUp)
      el.removeEventListener('pointercancel', this.onUp)
      el.removeEventListener('wheel', this.onWheel)
      el.removeEventListener('dblclick', this.onDouble)
      el.removeEventListener('contextmenu', this.onContext)
    }
    this.el = null
    this.stop()
    this.pointers.clear()
    this.mode = 'none'
  }

  /** True while an animation of the camera is running. */
  get moving(): boolean { return this.coasting || this.zoomTo !== null || this.reset !== null }

  /** True while a finger or a button is down on the view. */
  get dragging(): boolean { return this.pointers.size > 0 }

  /** Stop every running motion where it is. */
  stop() {
    this.coasting = false
    this.omega = [0, 0, 0]
    this.zoomTo = null
    this.reset = null
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  /** Turn by fixed angles about the screen's vertical and horizontal axes (keyboard). */
  nudge(yaw: number, pitch: number) {
    this.stop()
    this.camera.q = rotateAbout(rotateAbout(this.camera.q, [0, 1, 0], yaw), [1, 0, 0], pitch)
    this.opts.onChange()
  }

  /** Zoom by a factor of the distance (< 1: closer). */
  zoom(factor: number, animate = true) {
    const home = this.opts.home().distance
    const [lo, hi] = this.opts.zoomRange ?? [0.15, 6]
    const to = Math.min(home * hi, Math.max(home * lo, (this.zoomTo ?? this.camera.distance) * factor))
    this.coasting = false
    this.reset = null
    if (!animate || this.opts.calm()) {
      this.zoomTo = null
      this.camera.distance = to
      this.opts.onChange()
    } else {
      this.zoomTo = to
      this.run()
    }
  }

  /** Back to the home camera. */
  home() {
    this.stop()
    const to = cloneCamera(this.opts.home())
    if (this.opts.calm() || quatAngle(this.camera.q, to.q) + Math.abs(Math.log(this.camera.distance / to.distance)) < 1e-3 && Math.hypot(...sub(this.camera.target, to.target)) < 1e-3) {
      Object.assign(this.camera, to, { ortho: this.camera.ortho })
      this.opts.onChange()
      return
    }
    this.reset = { from: cloneCamera(this.camera), to, t: 0 }
    this.run()
  }

  private local(e: { clientX: number; clientY: number }): [number, number] {
    const r = this.el!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }

  private run() {
    if (this.raf) return
    this.lastFrame = 0
    this.raf = requestAnimationFrame(this.frame)
  }

  private frame = (now: number) => {
    this.raf = 0
    const dt = this.lastFrame ? Math.min(0.05, (now - this.lastFrame) / 1000) : 1 / 60
    this.lastFrame = now
    this.advance(dt)
    this.opts.onChange()
    if (this.moving) this.raf = requestAnimationFrame(this.frame)
  }

  /** One step of the running motions (exposed for tests: no clock inside). */
  advance(dt: number) {
    const c = this.camera
    if (this.coasting) {
      const speed = Math.hypot(...this.omega)
      const angle = coastAngle(speed, dt, COAST_TAU)
      if (speed > 0) c.q = rotateAbout(c.q, scale(this.omega, 1 / speed), angle)
      this.omega = decayVelocity(this.omega, dt, COAST_TAU)
      // Below a twentieth of a degree per frame nobody sees it turn
      if (Math.hypot(...this.omega) < 0.05) { this.coasting = false; this.omega = [0, 0, 0] }
    }
    if (this.zoomTo !== null) {
      const k = 1 - Math.exp(-dt / ZOOM_TAU)
      c.distance += (this.zoomTo - c.distance) * k
      if (Math.abs(this.zoomTo - c.distance) < 1e-3 * this.zoomTo) { c.distance = this.zoomTo; this.zoomTo = null }
    }
    if (this.reset) {
      const r = this.reset
      r.t += dt
      const p = settle(r.t, RESET_TAU)
      if (p > 0.9995) {
        Object.assign(c, r.to, { ortho: c.ortho })
        this.reset = null
      } else {
        c.q = quatSlerp(r.from.q, r.to.q, p)
        c.distance = r.from.distance + (r.to.distance - r.from.distance) * p
        c.target = add(r.from.target, scale(sub(r.to.target, r.from.target), p))
      }
    }
  }

  private onContext = (e: Event) => { e.preventDefault() }

  private onDown = (e: PointerEvent) => {
    if (!this.el) return
    this.stop()
    const [x, y] = this.local(e)
    this.pointers.set(e.pointerId, { x, y, t: e.timeStamp })
    try { this.el.setPointerCapture(e.pointerId) } catch { /* a synthetic event has no capture */ }
    if (this.pointers.size === 1) {
      this.mode = e.pointerType !== 'touch' && (e.button === 1 || e.button === 2 || e.shiftKey) ? 'pan' : 'rotate'
      this.moved = 0
    } else if (this.pointers.size === 2) {
      this.mode = 'gesture'
      this.moved = TAP_SLOP + 1
      this.gesture = this.twoFingers()
    }
  }

  private twoFingers() {
    const [a, b] = [...this.pointers.values()]
    return { dist: Math.hypot(b.x - a.x, b.y - a.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, angle: Math.atan2(b.y - a.y, b.x - a.x) }
  }

  private onMove = (e: PointerEvent) => {
    if (!this.el) return
    const [x, y] = this.local(e)
    const p = this.pointers.get(e.pointerId)
    if (!p) {
      if (e.pointerType !== 'touch') this.opts.onHover?.(x, y)
      return
    }
    const dx = x - p.x, dy = y - p.y
    const dt = Math.max(1e-3, (e.timeStamp - p.t) / 1000)
    p.x = x; p.y = y; p.t = e.timeStamp
    const vp = this.opts.viewport()
    const c = this.camera
    if (this.mode === 'gesture' && this.pointers.size >= 2) {
      const g = this.twoFingers()
      if (this.gesture.dist > 0 && g.dist > 0) {
        const home = this.opts.home().distance
        const [lo, hi] = this.opts.zoomRange ?? [0.15, 6]
        c.distance = Math.min(home * hi, Math.max(home * lo, c.distance * this.gesture.dist / g.dist))
      }
      c.target = panByDrag(c, g.cx - this.gesture.cx, g.cy - this.gesture.cy, vp)
      let twist = g.angle - this.gesture.angle
      if (twist > Math.PI) twist -= 2 * Math.PI
      if (twist < -Math.PI) twist += 2 * Math.PI
      // Screen y points down: a clockwise twist on the screen is a negative turn about the viewing axis
      c.q = rotateAbout(c.q, [0, 0, 1], -twist)
      this.gesture = g
      this.opts.onChange()
      return
    }
    this.moved += Math.hypot(dx, dy)
    if (this.moved <= TAP_SLOP) return
    if (this.mode === 'pan') {
      c.target = panByDrag(c, dx, dy, vp)
    } else if (this.mode === 'rotate') {
      c.q = rotateByDrag(c.q, dx, dy, vp)
      // Velocity of the last 80 ms or so, as a moving average: a pause before release leaves nothing to coast on
      const d = Math.hypot(dx, dy)
      const rate = d / Math.max(1, Math.min(vp.width, vp.height)) * Math.PI / dt
      const w: Vec3 = d > 0 ? [dy / d * rate, dx / d * rate, 0] : [0, 0, 0]
      const k = Math.min(1, dt / 0.08)
      this.omega = add(scale(this.omega, 1 - k), scale(w, k))
    }
    this.opts.onChange()
  }

  private onUp = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId)
    if (!p || !this.el) return
    this.pointers.delete(e.pointerId)
    try { this.el.releasePointerCapture(e.pointerId) } catch { /* not captured */ }
    if (this.pointers.size > 0) {
      // One finger left of a two-finger gesture: carry on turning from where it is
      if (this.pointers.size === 1) { this.mode = 'rotate'; this.omega = [0, 0, 0] }
      return
    }
    const wasRotate = this.mode === 'rotate'
    this.mode = 'none'
    if (e.type === 'pointercancel') return
    if (this.moved <= TAP_SLOP) {
      const [x, y] = this.local(e)
      // A second tap of a touch close to the first is the double tap; mice send dblclick themselves
      if (e.pointerType === 'touch' && e.timeStamp - this.lastTap.t < 320 && Math.hypot(x - this.lastTap.x, y - this.lastTap.y) < 28) {
        this.lastTap.t = -1e9
        this.home()
        return
      }
      this.lastTap = { x, y, t: e.timeStamp }
      this.opts.onTap?.(x, y, e)
      return
    }
    // Held still before letting go: the hand has stopped the ball
    const idle = (e.timeStamp - p.t) / 1000
    if (wasRotate && !this.opts.calm() && idle < 0.08 && Math.hypot(...this.omega) > 0.6) {
      this.coasting = true
      this.run()
    } else {
      this.omega = [0, 0, 0]
    }
  }

  private onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey && this.opts.wheel && !this.opts.wheel()) return
    e.preventDefault()
    const unit = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? 400 : 1
    // Pinch on a trackpad arrives as a wheel with the Ctrl key and small deltas
    const k = e.ctrlKey ? 0.01 : 0.0014
    this.zoom(Math.exp(Math.max(-240, Math.min(240, e.deltaY * unit)) * k))
  }

  private onDouble = (e: MouseEvent) => {
    e.preventDefault()
    this.home()
  }
}
