/**
 * Still images of a recording (key-moment screenshots for courseware and reports), drawn with the same
 * `renderFrame` as the viewport and the video so every output looks like the screen. Values are read from the
 * exact state at the requested time (`exact: true`); effects are visual only.
 *
 * The camera follows the viewport ("what you see is what you export"): the visible height is kept and the
 * width follows the output aspect ratio. Drawing happens in CSS-pixel units at a reference height of 720 px,
 * scaled to the output, so labels and strokes keep their on-screen proportions at any resolution.
 */
import { tl } from '../i18n'
import type { Recording } from '../engine/recording'
import type { FrameView } from '../engine/views'
import type { AnnotationDef } from '../core/scene/types'
import type { Camera, DrawOptions, Palette, Trajectories } from '../render/renderer'
import { LIGHT, computeTrajectories, vectorScales } from '../render/renderer'
import type { FrameEffects, RenderStyle } from '../render/frame'
import { renderFrame } from '../render/frame'
import type { UnitChoice } from '../units/units'

/** Background of a still: the theme colour, white, or none. */
export type ImageBackground = 'theme' | 'white' | 'transparent'

/** Viewport camera to reproduce: centre (m), pixels per metre at the viewport height, viewport height (px). */
export interface ExportView { cx: number; cy: number; ppmAtHeight: number; viewHeight: number }

/** Text drawn over a still or video frame. */
export interface OverlayText {
  title?: string
  /** Lines under the title (time, values …). */
  lines?: string[]
  /** Small text in the bottom-right corner (version, fingerprint). */
  footer?: string
}

/** Options of drawStill. */
export interface StillOptions {
  /** Output size in pixels. */
  width: number
  height: number
  view: ExportView
  options: DrawOptions
  /** Palette of the current theme; `background` may override it. */
  palette: Palette
  background: ImageBackground
  /** Significant digits of the numbers drawn. */
  digits: number
  selectedId?: string | null
  effects?: FrameEffects | null
  /** Teacher annotations of the scene (drawn like on screen). */
  annotations?: AnnotationDef[]
  /** Display units of the numbers on the canvas (SI when absent). */
  units?: UnitChoice | null
  /** Font and line scale (`PROJECTOR_STYLE` in projector mode); also scales the overlay text. */
  style?: RenderStyle | null
  overlay?: OverlayText | null
  /** Precomputed per recording (optional; computed when absent). */
  trajectories?: Trajectories | null
  scales?: { v: number; a: number; f: number }
}

/** Reference height of the CSS-pixel drawing space. */
export const REFERENCE_HEIGHT = 720

/**
 * Palette for a still image. 'white' uses the light palette on pure white (dark-theme colours would be
 * unreadable on white); 'transparent' keeps the theme colours without a background fill.
 */
export function backgroundPalette(theme: Palette, bg: ImageBackground): Palette {
  if (bg === 'white') return { ...LIGHT, bg: '#ffffff' }
  if (bg === 'transparent') return { ...theme, bg: 'rgba(0,0,0,0)' }
  return theme
}

/** Camera in CSS-pixel units for an output of `width` × `height` pixels, and the CSS → output scale. */
export function exportCamera(view: ExportView, width: number, height: number): { cam: Camera; scale: number } {
  const scale = height / REFERENCE_HEIGHT
  const cssW = width / scale, cssH = height / scale
  const ppm = view.ppmAtHeight * (cssH / Math.max(1, view.viewHeight))
  return { cam: { cx: view.cx, cy: view.cy, ppm, width: cssW, height: cssH }, scale }
}

/** Vector scales of the screen adapted to the export camera (arrows keep their length relative to the scene). */
export function exportScales(rec: Recording, view: ExportView, scales?: { v: number; a: number; f: number }) {
  const s = scales ?? vectorScales(rec)
  const k = REFERENCE_HEIGHT / Math.max(1, view.viewHeight)
  return { v: s.v * k, a: s.a * k, f: s.f * k }
}

const UI_FONT = '"Segoe UI","Noto Sans SC Variable","Microsoft YaHei UI",sans-serif'
const MONO_FONT = '"JetBrains Mono Variable","Noto Sans SC Variable",Consolas,monospace'

/** Title, text lines and footer drawn over a frame (CSS-pixel units, after the scale transform). */
export function drawOverlay(ctx: CanvasRenderingContext2D, o: OverlayText, palette: Palette, cssWidth: number, cssHeight: number, fontScale = 1) {
  const k = fontScale
  const pad = 18
  ctx.save()
  ctx.textBaseline = 'alphabetic'
  let y = pad + 16 * k
  if (o.title) {
    ctx.font = `600 ${20 * k}px ${UI_FONT}`
    ctx.fillStyle = palette.text
    ctx.fillText(o.title, pad, y)
    y += 26 * k
  }
  if (o.lines?.length) {
    o.lines.forEach((line, i) => {
      ctx.font = i === 0 ? `600 ${17 * k}px ${MONO_FONT}` : `${15 * k}px ${MONO_FONT}`
      ctx.fillStyle = palette.text
      ctx.fillText(line, pad, y)
      y += (i === 0 ? 26 : 22) * k
    })
  }
  if (o.footer) {
    ctx.font = `${12 * k}px ${UI_FONT}`
    ctx.fillStyle = palette.text2
    ctx.fillText(o.footer, cssWidth - ctx.measureText(o.footer).width - pad, cssHeight - pad * 0.7)
  }
  ctx.restore()
}

/** Draw the recording at time t into `ctx` (output pixels). Returns the drawn view. */
export function drawStill(ctx: CanvasRenderingContext2D, rec: Recording, t: number, o: StillOptions): FrameView {
  const { cam, scale } = exportCamera(o.view, o.width, o.height)
  const palette = backgroundPalette(o.palette, o.background)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, o.width, o.height)
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  const X = renderFrame(ctx, cam, {
    rec, time: t, options: o.options, palette, digits: o.digits,
    scales: exportScales(rec, o.view, o.scales),
    trajectories: o.trajectories === undefined ? computeTrajectories(rec) : o.trajectories,
    selectedId: o.selectedId ?? null, hoverId: null, exact: true,
    effects: o.effects ?? null, annotations: o.annotations, units: o.units ?? null, style: o.style ?? null
  })
  if (o.overlay) drawOverlay(ctx, o.overlay, palette, cam.width, cam.height, o.style?.font ?? 1)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  return X
}

/** A canvas with the recording at time t. */
export function renderStill(rec: Recording, t: number, o: StillOptions): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(2, Math.round(o.width))
  canvas.height = Math.max(2, Math.round(o.height))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error(tl('无法创建画布'))
  drawStill(ctx, rec, t, { ...o, width: canvas.width, height: canvas.height })
  return canvas
}

/** PNG bytes of a canvas. */
export async function canvasPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error(tl('PNG 编码失败'))
  return new Uint8Array(await blob.arrayBuffer())
}

/** PNG of the recording at time t. */
export async function stillPng(rec: Recording, t: number, o: StillOptions): Promise<{ png: Uint8Array; width: number; height: number }> {
  const canvas = renderStill(rec, t, o)
  return { png: await canvasPng(canvas), width: canvas.width, height: canvas.height }
}
