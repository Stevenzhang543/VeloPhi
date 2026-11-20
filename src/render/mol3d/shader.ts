/**
 * What the shader programs of the 3D viewer share (26.64, D271): the per-frame uniforms, the GLSL every fragment
 * shader includes (the ray of a fragment, lighting with a contour, the fade into the ground, the depth of a hit), and
 * compiling.
 */

/** Values every program reads in a frame. */
export interface FrameUniforms {
  view: Float32Array
  proj: Float32Array
  ortho: number
  /** World size of one CSS pixel: `x · (−z) + y` at view depth z. */
  pixel: [number, number]
  /** Device pixels of the drawing buffer per CSS pixel. */
  ratio: number
  bg: [number, number, number]
  /** Start and end of the fade (view distance) and its strength. */
  fog: [number, number, number]
  /** Contour colour and strength. */
  outline: [number, number, number, number]
}

/** GLSL shared by the fragment shaders: the ray of a fragment, lighting with a contour, the fade, the depth of a hit. */
export const FRAGMENT_COMMON = `
uniform mat4 uProj;
uniform float uOrtho;
uniform vec2 uPixel;
uniform vec3 uBg;
uniform vec3 uFog;
uniform vec4 uOutline;
const vec3 LIGHT = vec3(-0.371, 0.557, 0.743);

void fragmentRay(vec3 onQuad, out vec3 ro, out vec3 rd) {
  if (uOrtho > 0.5) { ro = vec3(onQuad.xy, 0.0); rd = vec3(0.0, 0.0, -1.0); }
  else { ro = vec3(0.0); rd = normalize(onQuad); }
}

// Matte body with a soft highlight; towards the silhouette the contour colour takes over within about
// 1.3 CSS pixels, so the contour has the same width on a near atom and on a far one.
vec3 lit(vec3 base, vec3 n, vec3 toEye, float radius, float depth, float contour) {
  float wrap = 0.5 + 0.5 * dot(n, LIGHT);
  vec3 h = normalize(LIGHT + toEye);
  float spec = pow(max(dot(n, h), 0.0), 56.0) * 0.2;
  vec3 col = base * (0.36 + 0.64 * wrap * wrap) + spec;
  float px = radius / max(uPixel.x * depth + uPixel.y, 1e-9);
  float w = min(1.3, 0.34 * px) / max(px, 1e-6);
  float edge = sqrt(max(2.0 * w - w * w, 0.0));
  float facing = max(dot(n, toEye), 0.0);
  float k = (1.0 - smoothstep(edge * 0.7, edge * 1.2, facing)) * uOutline.a * contour;
  return mix(col, uOutline.rgb, k);
}

vec3 faded(vec3 col, float depth) {
  float f = clamp((depth - uFog.x) / max(uFog.y - uFog.x, 1e-6), 0.0, 1.0) * uFog.z;
  return mix(col, uBg, f);
}

float depthOf(vec3 p) {
  vec4 clip = uProj * vec4(p, 1.0);
  return 0.5 * clip.z / clip.w + 0.5;
}
`

export function compileProgram(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram {
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(`mol3d shader: ${gl.getShaderInfoLog(s)}`)
    return s
  }
  const p = gl.createProgram()!
  const vs = shader(gl.VERTEX_SHADER, vertex), fs = shader(gl.FRAGMENT_SHADER, fragment)
  gl.attachShader(p, vs)
  gl.attachShader(p, fs)
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(`mol3d program: ${gl.getProgramInfoLog(p)}`)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  return p
}

/** Set the uniforms of FRAGMENT_COMMON and the two matrices on the program in use. */
export function setFrameUniforms(gl: WebGL2RenderingContext, p: WebGLProgram, u: FrameUniforms) {
  const loc = (n: string) => gl.getUniformLocation(p, n)
  gl.uniformMatrix4fv(loc('uView'), false, u.view)
  gl.uniformMatrix4fv(loc('uProj'), false, u.proj)
  gl.uniform1f(loc('uOrtho'), u.ortho)
  gl.uniform2f(loc('uPixel'), u.pixel[0], u.pixel[1])
  gl.uniform3f(loc('uBg'), u.bg[0], u.bg[1], u.bg[2])
  gl.uniform3f(loc('uFog'), u.fog[0], u.fog[1], u.fog[2])
  gl.uniform4f(loc('uOutline'), u.outline[0], u.outline[1], u.outline[2], u.outline[3])
}
