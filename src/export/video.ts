/**
 * Video export: every video frame is drawn from the exact recorded state at its simulated time (one
 * integration step from the nearest recorded frame when the time falls between frames), through the same
 * `renderFrame` as the screen (including the optional visual effects), then encoded with WebCodecs and muxed by
 * Mediabunny — MP4 (H.264) where the platform has an H.264 encoder, otherwise WebM (VP9).
 *
 * Overlay values are shown in the display units of `units` (SI when absent); the numbers themselves are
 * read from the exact state, never from the effects.
 */
import { tl } from '../i18n'
import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, WebMOutputFormat, getFirstEncodableVideoCodec } from 'mediabunny'
import type { Recording } from '../core/solver/simulation'
import type { AnnotationDef } from '../core/scene/types'
import type { DrawOptions, Palette } from '../render/renderer'
import { computeTrajectories, vectorScales } from '../render/renderer'
import type { FrameEffects, RenderStyle } from '../render/frame'
import { evaluateQuantity, listQuantities } from '../core/observe/quantities'
import { observeAt } from '../formula/situations'
import { ENGINE_VERSION } from '../core/scene/types'
import type { UnitChoice } from '../units/units'
import { shownTime } from '../units/clock'
import { defaultChoice, displayLabel, formatQuantity, toDisplay } from '../units/units'
import { drawStill } from './still'
import { fingerprintShort } from './fingerprint'

/** Options of exportVideo. */
export interface VideoOptions {
  width: number
  height: number
  fps: number
  /** Simulated seconds per video second. */
  speed: number
  /** Simulated time range (s). */
  t0: number
  t1: number
  /** Viewport camera to reproduce (see ExportView). */
  view: { cx: number; cy: number; ppmAtHeight: number; viewHeight: number }
  options: DrawOptions
  palette: Palette
  selectedId: string | null
  /** Significant digits of the numbers drawn. */
  digits: number
  /** Quantities listed under the time (at most six). */
  overlayIds: string[]
  title: string
  /** Display units of the overlay values and of the numbers drawn on the canvas (default SI). */
  units?: UnitChoice
  /** Visual effects (motion blur, particles, trails); null or absent: none. */
  effects?: FrameEffects | null
  annotations?: AnnotationDef[]
  /** Font and line scale (`PROJECTOR_STYLE` in projector mode). */
  style?: RenderStyle | null
  /** Bits per second; 0 or absent: automatic (≈ 0.15 bit per pixel per frame). */
  bitrate?: number
}

/** Encoded video and its container format. */
export interface VideoResult { data: Uint8Array; extension: 'mp4' | 'webm'; mime: string; frames: number }

/** Time label such as "t = 1.250 s" in the display time unit (recording clock as shown, see units/clock). */
export function timeLabel(t: number, units: UnitChoice): string {
  const label = displayLabel('s', units)
  const v = toDisplay(shownTime(t), 's', units)
  return `t = ${v.toFixed(label === 'ms' ? 0 : 3)} ${label}`
}

/** Number of video frames for a time range. */
export function videoFrameCount(t0: number, t1: number, speed: number, fps: number): number {
  return Math.max(1, Math.floor(((t1 - t0) / speed) * fps + 1e-9) + 1)
}

/** Render and encode [t0, t1] of a recording; rejects when cancelled. */
export async function exportVideo(rec: Recording, o: VideoOptions, progress: (p: number) => void, cancelled: () => boolean): Promise<VideoResult> {
  const width = o.width - (o.width % 2), height = o.height - (o.height % 2)
  const codec = await getFirstEncodableVideoCodec(['avc', 'vp9', 'vp8'], { width, height })
  if (!codec) throw new Error(tl('此系统没有可用的视频编码器（需要 WebCodecs 支持 H.264 或 VP9）'))
  const mp4 = codec === 'avc'
  const output = new Output({ format: mp4 ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(), target: new BufferTarget() })
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  // Explicit bitrate (≈ 0.15 bit per pixel per frame): thin lines and small labels must stay sharp
  const bitrate = o.bitrate && o.bitrate > 0 ? o.bitrate : Math.round(Math.min(40e6, Math.max(4e6, width * height * o.fps * 0.15)))
  const source = new CanvasSource(canvas, { codec, bitrate, keyFrameInterval: 1 })
  output.addVideoTrack(source, { frameRate: o.fps })
  await output.start()

  const units = o.units ?? defaultChoice()
  const trajectories = computeTrajectories(rec)
  const scales = vectorScales(rec, rec.system)
  const defs = new Map(listQuantities(rec.system).map(q => [q.id, q]))
  const tEnd = Math.min(o.t1, (rec.frameCount - 1) * rec.dt)
  const count = videoFrameCount(o.t0, tEnd, o.speed, o.fps)
  const footer = tl('VeloPhi {0} · 仿真结果可复现 · {1}', [ENGINE_VERSION, fingerprintShort(rec)])
  const overlayIds = o.overlayIds.filter(id => defs.has(id)).slice(0, 6)
  try {
    for (let i = 0; i < count; i++) {
      if (cancelled()) throw new Error(tl('已取消'))
      const t = Math.min(tEnd, o.t0 + (i / o.fps) * o.speed)
      const lines = [`${timeLabel(t, units)}${o.speed !== 1 ? tl('   ({0}× 速度)', [o.speed]) : ''}`]
      if (overlayIds.length) {
        const c = observeAt(rec, t)
        for (const id of overlayIds) {
          const q = defs.get(id)!
          lines.push(`${q.owner} ${q.label} = ${formatQuantity(evaluateQuantity(c, id), q.unit, units, Math.min(o.digits, 8))}`)
        }
      }
      drawStill(ctx, rec, t, {
        width, height, view: o.view, options: o.options, palette: o.palette, background: 'theme', digits: o.digits,
        selectedId: o.selectedId, effects: o.effects ?? null, annotations: o.annotations, units, style: o.style ?? null, trajectories, scales,
        overlay: { title: o.title, lines, footer }
      })
      await source.add(i / o.fps, 1 / o.fps)
      if (i % 10 === 0) progress(i / count)
    }
    await output.finalize()
  } catch (e) {
        try { await output.cancel() } catch { /* Already closed */ }
    throw e
  }
  const buf = (output.target as BufferTarget).buffer
  if (!buf) throw new Error(tl('视频编码失败'))
  progress(1)
  return { data: new Uint8Array(buf), extension: mp4 ? 'mp4' : 'webm', mime: mp4 ? 'video/mp4' : 'video/webm', frames: count }
}
