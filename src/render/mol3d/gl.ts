/**
 * WebGL2 side of the 3D viewer (26.64, D271): the context, the shader programs' common parts, and the renderer that
 * draws a scene's lists in order — sticks and balls as impostors (a few vertices per atom, the surface found per pixel
 * in the fragment shader, with its true depth), opaque meshes, the orbital cloud, then the translucent faces and lobes
 * back to front.
 *
 * A viewer draws when asked and never on its own: there is no loop here. Browsers allow only a handful of live
 * contexts, so a viewer holds one only while it is visible (`dispose` gives it back at once) and thumbnails share a
 * single off-screen renderer (thumbnail.ts). A context the browser takes away is rebuilt when it comes back.
 */
import type { Camera, Viewport } from './camera'
import { clipPlanes, halfHeight, projectionMatrix, toView, viewMatrix } from './camera'
import type { MolPalette } from './palette'
import type { Scene } from './scene'
import { MESH_STRIDE } from './scene'
import { SphereProgram } from './spheres'
import { CylinderProgram } from './bonds'
import { CloudProgram, MeshProgram } from './mesh'
import type { FrameUniforms } from './shader'

export type { FrameUniforms } from './shader'

/** A WebGL2 context for the viewer, or null where there is none. */
export function createContext(canvas: HTMLCanvasElement | OffscreenCanvas): WebGL2RenderingContext | null {
  try {
    // Opaque and without the browser's multisampling: the impostors' edges come out of the fragment shader, where
    // multisampling cannot smooth them — the renderer supersamples instead (see `supersampling`)
    return canvas.getContext('webgl2', { alpha: false, antialias: false, depth: true, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'default' }) as WebGL2RenderingContext | null
  } catch {
    return null
  }
}

let support: boolean | null = null

/** True where WebGL2 is available (probed once with a throw-away canvas, whose context is given back at once). */
export function webgl2Supported(): boolean {
  if (support !== null) return support
  if (typeof document === 'undefined') return (support = false)
  const c = document.createElement('canvas')
  const gl = createContext(c)
  support = !!gl
  gl?.getExtension('WEBGL_lose_context')?.loseContext()
  return support
}

/**
 * Supersampling factor for a view of `width × height` CSS pixels on a display of `dpr`: the edges of the impostors and
 * the curves where a stick meets a ball are decided per pixel, so the picture is drawn at up to twice the device
 * resolution and scaled down by the browser. The drawing buffer is kept below `budget` pixels (a full-screen viewer on
 * a 4K display draws 1:1).
 */
export function supersampling(width: number, height: number, dpr: number, budget = 6e6): number {
  const device = Math.max(1, width * height * dpr * dpr)
  return Math.max(1, Math.min(2, Math.sqrt(budget / device)))
}

interface Programs { spheres: SphereProgram; lobes: SphereProgram; cylinders: CylinderProgram; mesh: MeshProgram; faces: MeshProgram; cloud: CloudProgram }

export class MolRenderer {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas
  gl: WebGL2RenderingContext | null
  /** The browser took the context away (it may come back). */
  lost = false
  /** Called when a lost context has been rebuilt: draw again. */
  onRestored: (() => void) | null = null
  onLost: (() => void) | null = null
  /** Time the last frame took on this thread, with the GPU's work waited for (ms). */
  frameMs = 0
  private programs: Programs | null = null
  private scene: Scene | null = null
  private disposed = false

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas) {
    this.canvas = canvas
    this.gl = createContext(canvas)
    canvas.addEventListener('webglcontextlost', this.handleLost as EventListener)
    canvas.addEventListener('webglcontextrestored', this.handleRestored as EventListener)
    if (this.gl) this.build()
  }

  /** A usable context is there. */
  get ready(): boolean { return !!this.gl && !this.lost && !this.disposed && !!this.programs }

  private handleLost = (e: Event) => {
    // Without this the browser never restores the context
    e.preventDefault()
    this.lost = true
    this.programs = null
    if (!this.disposed) this.onLost?.()
  }

  private handleRestored = () => {
    if (this.disposed) return
    this.lost = false
    this.build()
    if (this.scene) this.upload(this.scene)
    this.onRestored?.()
  }

  private build() {
    const gl = this.gl!
    this.programs = { spheres: new SphereProgram(gl), lobes: new SphereProgram(gl), cylinders: new CylinderProgram(gl), mesh: new MeshProgram(gl), faces: new MeshProgram(gl), cloud: new CloudProgram(gl) }
  }

  private upload(s: Scene) {
    const p = this.programs
    if (!p) return
    p.spheres.upload(s.spheres, s.sphereCount)
    p.lobes.upload(s.lobes, s.lobeCount)
    p.cylinders.upload(s.cylinders, s.cylinderCount)
    p.mesh.upload(s.mesh, s.meshVertices)
    p.faces.upload(s.faces, s.faceVertices)
    p.cloud.upload(s.points, s.pointColours, s.pointCount)
  }

  setScene(s: Scene) {
    this.scene = s
    if (this.ready) this.upload(s)
  }

  /**
   * Draw the scene. `ratio` is the number of drawing-buffer pixels per CSS pixel (device pixel ratio times the
   * supersampling); the canvas' buffer is resized to it. Returns false when there is no context to draw with.
   */
  render(camera: Camera, vp: Viewport, ratio: number, P: MolPalette, measure = false): boolean {
    const gl = this.gl, s = this.scene, p = this.programs
    if (!gl || !s || !p || !this.ready || gl.isContextLost()) return false
    const t0 = measure ? performance.now() : 0
    const w = Math.max(1, Math.round(vp.width * ratio)), h = Math.max(1, Math.round(vp.height * ratio))
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h }
    gl.viewport(0, 0, w, h)
    gl.clearColor(P.bg[0], P.bg[1], P.bg[2], 1)
    gl.clearDepth(1)
    gl.depthMask(true)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)
    gl.disable(gl.BLEND)

    // The clip planes hug the scene wherever the target has been panned to
    const off = Math.hypot(camera.target[0] - s.centre[0], camera.target[1] - s.centre[1], camera.target[2] - s.centre[2])
    const [near, far] = clipPlanes(camera, s.radius + off)
    const u: FrameUniforms = {
      view: new Float32Array(viewMatrix(camera)), proj: new Float32Array(projectionMatrix(camera, vp.width / vp.height, near, far)), ortho: camera.ortho ? 1 : 0,
      pixel: camera.ortho ? [0, 2 * halfHeight(camera) / vp.height] : [2 * Math.tan(camera.fov / 2) / vp.height, 0], ratio,
      bg: P.bg, fog: [camera.distance - s.radius * 0.35, camera.distance + s.radius * 1.05 + off, s.fog], outline: [P.outline[0], P.outline[1], P.outline[2], P.outlineStrength]
    }

    // Opaque: sticks first (the balls then hide their ends), balls, arrow heads, the cloud
    gl.enable(gl.CULL_FACE)
    gl.cullFace(gl.BACK)
    p.cylinders.draw(u)
    gl.disable(gl.CULL_FACE)
    p.spheres.draw(u, 1)
    p.mesh.draw(u)
    p.cloud.draw(u, s.pointSize)

    // Translucent, back to front, without writing depth
    if (s.faceVertices > 0 || s.lobeCount > 0) {
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      gl.depthMask(false)
      if (s.faceVertices > 0) {
        p.faces.upload(sortTriangles(s.faces, camera), s.faceVertices, true)
        p.faces.draw(u)
      }
      if (s.lobeCount > 0) p.lobes.draw(u, 0.55)
      gl.depthMask(true)
      gl.disable(gl.BLEND)
    }
    if (measure) {
      // Wait for the GPU so the time is the frame's, not just the time to queue it
      // (browsers run GL in another process: only reading a pixel back blocks until the frame is drawn)
      gl.finish()
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4))
      this.frameMs = performance.now() - t0
    }
    return true
  }

  /** The graphics adapter as the browser names it (performance reports). */
  adapter(): string {
    const gl = this.gl
    if (!gl || gl.isContextLost()) return ''
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
  }

  /** Give the context back to the browser now (hidden or unmounted viewer). */
  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.canvas.removeEventListener('webglcontextlost', this.handleLost as EventListener)
    this.canvas.removeEventListener('webglcontextrestored', this.handleRestored as EventListener)
    const gl = this.gl
    if (gl && !gl.isContextLost()) {
      for (const prog of Object.values(this.programs ?? {})) prog.dispose()
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
    this.programs = null
    this.gl = null
    this.scene = null
  }
}

/** The triangles of a translucent mesh ordered from the farthest to the nearest centroid. */
export function sortTriangles(data: Float32Array, camera: Camera): Float32Array {
  const tri = MESH_STRIDE * 3
  const count = data.length / tri
  if (count < 2) return data
  const depth = new Float64Array(count)
  for (let t = 0; t < count; t++) {
    let z = 0
    for (let v = 0; v < 3; v++) { const k = t * tri + v * MESH_STRIDE; z += toView(camera, [data[k], data[k + 1], data[k + 2]])[2] }
    depth[t] = z
  }
  const order = Array.from({ length: count }, (_, i) => i).sort((a, b) => depth[a] - depth[b] || a - b)
  const out = new Float32Array(data.length)
  order.forEach((t, k) => out.set(data.subarray(t * tri, (t + 1) * tri), k * tri))
  return out
}
