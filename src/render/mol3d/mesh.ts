/**
 * The two ordinary programs of the 3D viewer (26.64, D271): triangles with normals (arrow heads; the translucent faces
 * of a coordination polyhedron, lit from both sides) and the points of an orbital cloud (round dots whose size follows
 * the zoom).
 */
import { MESH_STRIDE } from './scene'
import type { FrameUniforms } from './shader'
import { FRAGMENT_COMMON, compileProgram, setFrameUniforms } from './shader'

const MESH_VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec4 aColour;
uniform mat4 uView;
uniform mat4 uProj;
out vec3 vPosition;
out vec3 vNormal;
out vec4 vColour;
void main() {
  vec4 p = uView * vec4(aPosition, 1.0);
  vPosition = p.xyz;
  vNormal = mat3(uView) * aNormal;
  vColour = aColour;
  gl_Position = uProj * p;
}
`

const MESH_FRAGMENT = `#version 300 es
precision highp float;
in vec3 vPosition;
in vec3 vNormal;
in vec4 vColour;
out vec4 frag;
${FRAGMENT_COMMON}
void main() {
  vec3 toEye = uOrtho > 0.5 ? vec3(0.0, 0.0, 1.0) : normalize(-vPosition);
  vec3 n = normalize(vNormal);
  // A face seen from behind is lit as its other side
  if (dot(n, toEye) < 0.0) n = -n;
  float wrap = 0.5 + 0.5 * dot(n, LIGHT);
  vec3 col = vColour.rgb * (0.5 + 0.5 * wrap * wrap);
  col = faded(col, -vPosition.z);
  frag = vec4(col * vColour.a, vColour.a);
}
`

export class MeshProgram {
  private program: WebGLProgram
  private vao: WebGLVertexArrayObject
  private buffer: WebGLBuffer
  private count = 0

  constructor(private gl: WebGL2RenderingContext) {
    this.program = compileProgram(gl, MESH_VERTEX, MESH_FRAGMENT)
    this.vao = gl.createVertexArray()!
    this.buffer = gl.createBuffer()!
    gl.bindVertexArray(this.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    const bytes = MESH_STRIDE * 4
    const layout: Array<[number, number]> = [[3, 0], [3, 3], [4, 6]]
    layout.forEach(([size, offset], k) => {
      gl.enableVertexAttribArray(k)
      gl.vertexAttribPointer(k, size, gl.FLOAT, false, bytes, offset * 4)
    })
    gl.bindVertexArray(null)
  }

  /** `dynamic`: the data is replaced every frame (triangles re-sorted by depth). */
  upload(data: Float32Array, vertices: number, dynamic = false) {
    const gl = this.gl
    this.count = vertices
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    gl.bufferData(gl.ARRAY_BUFFER, data, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW)
  }

  draw(u: FrameUniforms) {
    if (!this.count) return
    const gl = this.gl
    gl.useProgram(this.program)
    setFrameUniforms(gl, this.program, u)
    gl.bindVertexArray(this.vao)
    gl.drawArrays(gl.TRIANGLES, 0, this.count)
    gl.bindVertexArray(null)
  }

  dispose() {
    const gl = this.gl
    gl.deleteProgram(this.program)
    gl.deleteVertexArray(this.vao)
    gl.deleteBuffer(this.buffer)
  }
}

const CLOUD_VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aColour;
uniform mat4 uView;
uniform mat4 uProj;
uniform vec2 uPixel;
uniform float uSize;
uniform float uRatio;
out vec3 vColour;
out float vDepth;
void main() {
  vec4 p = uView * vec4(aPosition, 1.0);
  vColour = aColour;
  vDepth = -p.z;
  gl_Position = uProj * p;
  // Diameter in CSS pixels, never below 1.6 so a zoomed-out cloud stays a cloud
  float px = max(uSize / max(uPixel.x * vDepth + uPixel.y, 1e-9), 1.6);
  gl_PointSize = px * uRatio;
}
`

const CLOUD_FRAGMENT = `#version 300 es
precision highp float;
in vec3 vColour;
in float vDepth;
out vec4 frag;
${FRAGMENT_COMMON}
void main() {
  vec2 d = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(d, d);
  if (r2 > 1.0) discard;
  vec3 col = vColour * (0.72 + 0.28 * sqrt(1.0 - r2));
  frag = vec4(faded(col, vDepth), 1.0);
}
`

export class CloudProgram {
  private program: WebGLProgram
  private vao: WebGLVertexArrayObject
  private positions: WebGLBuffer
  private colours: WebGLBuffer
  private count = 0

  constructor(private gl: WebGL2RenderingContext) {
    this.program = compileProgram(gl, CLOUD_VERTEX, CLOUD_FRAGMENT)
    this.vao = gl.createVertexArray()!
    this.positions = gl.createBuffer()!
    this.colours = gl.createBuffer()!
    gl.bindVertexArray(this.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positions)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colours)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)
  }

  upload(positions: Float32Array, colours: Float32Array, count: number) {
    const gl = this.gl
    this.count = count
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positions)
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colours)
    gl.bufferData(gl.ARRAY_BUFFER, colours, gl.STATIC_DRAW)
  }

  /** `size`: diameter of a point in ångström. */
  draw(u: FrameUniforms, size: number) {
    if (!this.count) return
    const gl = this.gl
    gl.useProgram(this.program)
    setFrameUniforms(gl, this.program, u)
    gl.uniform1f(gl.getUniformLocation(this.program, 'uSize'), size)
    gl.uniform1f(gl.getUniformLocation(this.program, 'uRatio'), u.ratio)
    gl.bindVertexArray(this.vao)
    gl.drawArrays(gl.POINTS, 0, this.count)
    gl.bindVertexArray(null)
  }

  dispose() {
    const gl = this.gl
    gl.deleteProgram(this.program)
    gl.deleteVertexArray(this.vao)
    gl.deleteBuffer(this.positions)
    gl.deleteBuffer(this.colours)
  }
}
