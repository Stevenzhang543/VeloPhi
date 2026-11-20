/**
 * Impostor spheres (26.64, D271): every atom is one instanced quad that exactly covers the sphere's outline on the
 * screen; the fragment shader intersects the pixel's ray with the sphere, shades the hit and writes its depth. Two
 * triangles per atom whatever its size, perfectly round at any zoom, and the curve where a stick enters a ball comes
 * out of the depth test — thousands of atoms stay cheap.
 *
 * The same program draws ellipsoids (the lone-pair lobes): a sphere squeezed along one axis, intersected in the
 * squeezed space.
 */
import { SPHERE_STRIDE } from './scene'
import type { FrameUniforms } from './shader'
import { FRAGMENT_COMMON, compileProgram, setFrameUniforms } from './shader'

const VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aCentre;   // xyz, short radius
layout(location = 2) in vec4 aAxis;     // long axis (world), stretch
layout(location = 3) in vec4 aColour;   // rgb, flags
uniform mat4 uView;
uniform mat4 uProj;
uniform float uOrtho;
out vec3 vOnQuad;
flat out vec3 vCentre;
flat out float vRadius;
flat out vec4 vAxis;
flat out vec4 vColour;

// Slopes x / (−z) of the two tangents from the eye to a circle in the plane of one screen axis: the exact extent of
// a sphere's perspective image (it is wider than its radius away from the centre of the view).
vec2 extent(float c, float z, float r) {
  float t = sqrt(max(c * c + z * z - r * r, 1e-12));
  float lo = (c * t + z * r) / max(-(z * t - c * r), 1e-9);
  float hi = (c * t - z * r) / max(-(z * t + c * r), 1e-9);
  return vec2(lo, hi);
}

void main() {
  vec3 c = (uView * vec4(aCentre.xyz, 1.0)).xyz;
  float bound = aCentre.w * aAxis.w;
  vec3 p;
  if (uOrtho > 0.5) {
    p = vec3(c.xy + aCorner * bound, c.z + bound);
  } else {
    // The quad lies in the plane of the sphere's nearest point, so it is in front of every hit
    float zq = min(c.z + bound, -1e-4);
    vec2 ex = extent(c.x, c.z, bound);
    vec2 ey = extent(c.y, c.z, bound);
    vec2 t = aCorner * 0.5 + 0.5;
    p = vec3(mix(ex.x, ex.y, t.x) * -zq, mix(ey.x, ey.y, t.y) * -zq, zq);
  }
  vOnQuad = p;
  vCentre = c;
  vRadius = aCentre.w;
  vAxis = vec4(mat3(uView) * aAxis.xyz, aAxis.w);
  vColour = aColour;
  gl_Position = uProj * vec4(p, 1.0);
}
`

const FRAGMENT = `#version 300 es
precision highp float;
in vec3 vOnQuad;
flat in vec3 vCentre;
flat in float vRadius;
flat in vec4 vAxis;
flat in vec4 vColour;
uniform float uAlpha;
out vec4 frag;
${FRAGMENT_COMMON}
void main() {
  vec3 ro, rd;
  fragmentRay(vOnQuad, ro, rd);
  vec3 oc = ro - vCentre;
  // Squeeze space along the long axis: the ellipsoid becomes a sphere of the short radius
  float k = 1.0 / vAxis.w - 1.0;
  vec3 a = vAxis.xyz;
  vec3 o2 = oc + k * dot(oc, a) * a;
  vec3 d2 = rd + k * dot(rd, a) * a;
  float A = dot(d2, d2);
  float B = dot(o2, d2);
  float C = dot(o2, o2) - vRadius * vRadius;
  float disc = B * B - A * C;
  if (disc < 0.0) discard;
  float t = (-B - sqrt(disc)) / A;
  vec3 p = ro + t * rd;
  vec3 q = o2 + t * d2;
  vec3 n = normalize(q + k * dot(q, a) * a);
  float depth = -p.z;
  vec3 col = lit(vColour.rgb, n, -rd, vRadius, depth, vColour.a > 0.5 ? 0.0 : 1.0);
  col = faded(col, depth);
  frag = vec4(col * uAlpha, uAlpha);
  gl_FragDepth = depthOf(p);
}
`

export class SphereProgram {
  private program: WebGLProgram
  private vao: WebGLVertexArrayObject
  private corners: WebGLBuffer
  private instances: WebGLBuffer
  private count = 0

  constructor(private gl: WebGL2RenderingContext) {
    this.program = compileProgram(gl, VERTEX, FRAGMENT)
    this.vao = gl.createVertexArray()!
    this.corners = gl.createBuffer()!
    this.instances = gl.createBuffer()!
    gl.bindVertexArray(this.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.corners)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instances)
    const bytes = SPHERE_STRIDE * 4
    for (let k = 0; k < 3; k++) {
      gl.enableVertexAttribArray(1 + k)
      gl.vertexAttribPointer(1 + k, 4, gl.FLOAT, false, bytes, k * 16)
      gl.vertexAttribDivisor(1 + k, 1)
    }
    gl.bindVertexArray(null)
  }

  upload(data: Float32Array, count: number) {
    const gl = this.gl
    this.count = count
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instances)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
  }

  /** Draw the instances; `alpha` < 1 for the translucent pass (colours premultiplied). */
  draw(u: FrameUniforms, alpha: number) {
    if (!this.count) return
    const gl = this.gl
    gl.useProgram(this.program)
    setFrameUniforms(gl, this.program, u)
    gl.uniform1f(gl.getUniformLocation(this.program, 'uAlpha'), alpha)
    gl.bindVertexArray(this.vao)
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count)
    gl.bindVertexArray(null)
  }

  dispose() {
    const gl = this.gl
    gl.deleteProgram(this.program)
    gl.deleteVertexArray(this.vao)
    gl.deleteBuffer(this.corners)
    gl.deleteBuffer(this.instances)
  }
}
