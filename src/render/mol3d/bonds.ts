/**
 * Impostor cylinders (26.64, D271): sticks of bonds, cell edges, polyhedron edges, arrow shafts. Each is one instanced
 * box around the cylinder; the fragment shader intersects the pixel's ray with the cylinder (or a flat end cap),
 * shades the hit and writes its depth — so a stick is round at any zoom and meets a ball in the exact curve of their
 * intersection, with no seam and no gap.
 *
 * A stick carries the colours of its two ends: split in the middle (wireframe, one colour per element) or blended
 * across it (bond polarity). Double and triple bonds are two and three sticks side by side, an aromatic bond a stick
 * with a dashed companion — the scene places them. A stick may ask for a least radius in pixels, so thin lines do not
 * break up when the view is zoomed out.
 */
import { CYLINDER_STRIDE } from './scene'
import type { FrameUniforms } from './shader'
import { FRAGMENT_COMMON, compileProgram, setFrameUniforms } from './shader'

const VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aBox;      // corner of the unit box: x along the axis, y and z across
layout(location = 1) in vec3 aA;
layout(location = 2) in vec3 aB;
layout(location = 3) in vec2 aRadius;   // radius, least radius in CSS pixels
layout(location = 4) in vec3 aColourA;
layout(location = 5) in vec3 aColourB;
layout(location = 6) in vec2 aBlend;    // blend half-width, flags
uniform mat4 uView;
uniform mat4 uProj;
uniform vec2 uPixel;
out vec3 vOnBox;
flat out vec3 vA;
flat out vec3 vB;
flat out float vRadius;
flat out vec3 vColourA;
flat out vec3 vColourB;
flat out vec2 vBlend;

void main() {
  vec3 a = (uView * vec4(aA, 1.0)).xyz;
  vec3 b = (uView * vec4(aB, 1.0)).xyz;
  vec3 axis = b - a;
  float len = max(length(axis), 1e-9);
  axis /= len;
  float depth = -0.5 * (a.z + b.z);
  float r = max(aRadius.x, aRadius.y * (uPixel.x * depth + uPixel.y));
  vec3 e = abs(axis.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vec3 u = normalize(cross(axis, e));
  vec3 v = cross(axis, u);
  vec3 p = mix(a, b, aBox.x * 0.5 + 0.5) + (u * aBox.y + v * aBox.z) * r;
  vOnBox = p;
  vA = a;
  vB = b;
  vRadius = r;
  vColourA = aColourA;
  vColourB = aColourB;
  vBlend = aBlend;
  gl_Position = uProj * vec4(p, 1.0);
}
`

const FRAGMENT = `#version 300 es
precision highp float;
in vec3 vOnBox;
flat in vec3 vA;
flat in vec3 vB;
flat in float vRadius;
flat in vec3 vColourA;
flat in vec3 vColourB;
flat in vec2 vBlend;
out vec4 frag;
${FRAGMENT_COMMON}
void main() {
  vec3 ro, rd;
  fragmentRay(vOnBox, ro, rd);
  vec3 axis = vB - vA;
  float len = length(axis);
  axis /= len;
  vec3 oc = ro - vA;
  float dAxis = dot(rd, axis);
  float oAxis = dot(oc, axis);
  vec3 dp = rd - dAxis * axis;
  vec3 op = oc - oAxis * axis;
  float A = dot(dp, dp);
  float B = dot(dp, op);
  float C = dot(op, op) - vRadius * vRadius;
  int flags = int(vBlend.y + 0.5);
  float t = 0.0;
  float s = 0.0;
  vec3 n = vec3(0.0);
  bool hit = false;
  if (A > 1e-12) {
    float disc = B * B - A * C;
    if (disc >= 0.0) {
      float t0 = (-B - sqrt(disc)) / A;
      float s0 = oAxis + t0 * dAxis;
      if (s0 >= 0.0 && s0 <= len) { t = t0; s = s0; n = normalize(op + t0 * dp); hit = true; }
    }
  }
  // The ray misses the mantle between the ends: it may enter through a flat cap
  if (!hit && (flags & 1) != 0 && dAxis > 1e-9) {
    float tc = -oAxis / dAxis;
    vec3 pp = op + tc * dp;
    if (dot(pp, pp) <= vRadius * vRadius) { t = tc; s = 0.0; n = -axis; hit = true; }
  }
  if (!hit && (flags & 2) != 0 && dAxis < -1e-9) {
    float tc = (len - oAxis) / dAxis;
    vec3 pp = op + tc * dp;
    if (dot(pp, pp) <= vRadius * vRadius) { t = tc; s = len; n = axis; hit = true; }
  }
  if (!hit) discard;
  vec3 p = ro + t * rd;
  float f = s / len;
  float w = vBlend.x > 0.0 ? smoothstep(0.5 - vBlend.x, 0.5 + vBlend.x, f) : step(0.5, f);
  vec3 base = mix(vColourA, vColourB, w);
  float depth = -p.z;
  vec3 col = (flags & 4) != 0 ? base : lit(base, n, -rd, vRadius, depth, 1.0);
  frag = vec4(faded(col, depth), 1.0);
  gl_FragDepth = depthOf(p);
}
`

/** The unit box: 8 corners, 12 triangles, counter-clockwise seen from outside. */
const BOX = new Float32Array([-1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1])
const BOX_INDEX = new Uint16Array([
  0, 2, 1, 0, 3, 2, // z = −1
  4, 5, 6, 4, 6, 7, // z = +1
  0, 1, 5, 0, 5, 4, // y = −1
  3, 6, 2, 3, 7, 6, // y = +1
  0, 4, 7, 0, 7, 3, // x = −1
  1, 2, 6, 1, 6, 5 // x = +1
])

export class CylinderProgram {
  private program: WebGLProgram
  private vao: WebGLVertexArrayObject
  private box: WebGLBuffer
  private index: WebGLBuffer
  private instances: WebGLBuffer
  private count = 0

  constructor(private gl: WebGL2RenderingContext) {
    this.program = compileProgram(gl, VERTEX, FRAGMENT)
    this.vao = gl.createVertexArray()!
    this.box = gl.createBuffer()!
    this.index = gl.createBuffer()!
    this.instances = gl.createBuffer()!
    gl.bindVertexArray(this.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.box)
    gl.bufferData(gl.ARRAY_BUFFER, BOX, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.index)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, BOX_INDEX, gl.STATIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instances)
    const bytes = CYLINDER_STRIDE * 4
    // A (3), B (3), radius + least pixels (2), colour A (3), colour B (3), blend + flags (2)
    const layout: Array<[number, number]> = [[3, 0], [3, 3], [2, 6], [3, 8], [3, 11], [2, 14]]
    layout.forEach(([size, offset], k) => {
      gl.enableVertexAttribArray(1 + k)
      gl.vertexAttribPointer(1 + k, size, gl.FLOAT, false, bytes, offset * 4)
      gl.vertexAttribDivisor(1 + k, 1)
    })
    gl.bindVertexArray(null)
  }

  upload(data: Float32Array, count: number) {
    const gl = this.gl
    this.count = count
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instances)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
  }

  /** Draw the instances (the caller culls back faces: each pixel of a box is shaded once). */
  draw(u: FrameUniforms) {
    if (!this.count) return
    const gl = this.gl
    gl.useProgram(this.program)
    setFrameUniforms(gl, this.program, u)
    gl.bindVertexArray(this.vao)
    gl.drawElementsInstanced(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0, this.count)
    gl.bindVertexArray(null)
  }

  dispose() {
    const gl = this.gl
    gl.deleteProgram(this.program)
    gl.deleteVertexArray(this.vao)
    gl.deleteBuffer(this.box)
    gl.deleteBuffer(this.index)
    gl.deleteBuffer(this.instances)
  }
}
