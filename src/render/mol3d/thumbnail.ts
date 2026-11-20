/**
 * Still pictures of molecules, crystals and orbitals (26.64, D271): lists and cards show thumbnails, not live viewers
 * — a browser gives a page only a handful of WebGL contexts. All thumbnails are drawn by ONE shared off-screen
 * renderer and copied into ordinary 2D canvases; without WebGL2 the Canvas-2D painter draws them directly.
 */
import { webgl2Supported, MolRenderer } from './gl'
import { drawFallback } from './fallback2d'
import { EMPTY_OVERLAY, drawOverlay } from './labels'
import type { OverlayState } from './labels'
import type { MolPalette, MolTheme } from './palette'
import { molPalette } from './palette'
import type { SceneInput, SceneOptions } from './scene'
import { buildScene } from './scene'
import type { Camera } from './camera'
import type { Mol3DSource } from './source'
import { homeCamera, resolveSource } from './source'

export interface ThumbnailOptions {
  theme?: MolTheme
  palette?: MolPalette
  /** Scene switches (style, lone pairs …). */
  options?: Partial<SceneOptions>
  /** Draw into this canvas instead of a new one. */
  target?: HTMLCanvasElement
  /** Height when the picture is not square (`size` is then the width). */
  height?: number
  /** Device pixels per CSS pixel of the result (default: the display's, at most 2). */
  dpr?: number
  /** Element symbols and other labels. */
  overlay?: Partial<OverlayState>
  /** A camera other than the scene's own. */
  camera?: Camera
  /** Never use WebGL (tests of the fallback). */
  forceFallback?: boolean
}

let shared: MolRenderer | null = null
let created = 0

function sharedRenderer(): MolRenderer | null {
  if (shared && shared.ready) return shared
  if (shared && shared.lost) return null
  if (!webgl2Supported()) return null
  const r = new MolRenderer(document.createElement('canvas'))
  if (!r.ready) { r.dispose(); return null }
  shared = r
  created++
  // If the browser takes the context away it builds itself again; a picture asked for meanwhile uses the painter
  return shared
}

/** How many shared contexts have been created since the page loaded (tests: it stays 1 however many thumbnails). */
export function thumbnailContextCount(): number { return created }

/** Give the shared context back (the last page with thumbnails closed). */
export function releaseThumbnailContext() {
  shared?.dispose()
  shared = null
}

/**
 * Draw a still picture `size` CSS pixels wide into a 2D canvas (a new one, or `target`). Synchronous: the result can
 * be shown at once.
 */
export function renderThumbnail(data: SceneInput | Mol3DSource, size: number, opts: ThumbnailOptions = {}): HTMLCanvasElement {
  const width = Math.max(1, Math.round(size)), height = Math.max(1, Math.round(opts.height ?? size))
  const dpr = opts.dpr ?? Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1)
  const P = opts.palette ?? molPalette(opts.theme ?? 'light')
  // A source (a record of the data files) is resolved by the core first; resolved data is drawn as it is
  const input: SceneInput = 'shape' in data || 'build' in data || 'sample' in data ? data : resolveSource(data).input
  const scene = buildScene(input, opts.options ?? {}, P)
  const vp = { width, height }
  const camera = opts.camera ?? homeCamera(scene, vp)
  const out = opts.target ?? document.createElement('canvas')
  out.width = Math.round(width * dpr)
  out.height = Math.round(height * dpr)
  const ctx = out.getContext('2d')!
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  const renderer = opts.forceFallback ? null : sharedRenderer()
  let drawn = false
  if (renderer) {
    renderer.setScene(scene)
    // Twice the result's resolution, scaled down by the copy: smooth outlines and joints
    drawn = renderer.render(camera, vp, dpr * 2, P)
    if (drawn) {
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(renderer.canvas as HTMLCanvasElement, 0, 0, out.width, out.height)
    }
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  if (!drawn) drawFallback(ctx, scene, camera, vp, P)
  if (opts.overlay) drawOverlay(ctx, scene, camera, vp, P, { ...EMPTY_OVERLAY, ...opts.overlay })
  return out
}
