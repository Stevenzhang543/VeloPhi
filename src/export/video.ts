/**
 * Video export: every video frame is drawn from the exact recorded state at its simulated time (one
 * integration step from the nearest recorded frame when the time falls between frames), with the same
 * renderer as the screen, then encoded with WebCodecs and muxed by Mediabunny — MP4 (H.264) where the
 * platform has an H.264 encoder, otherwise WebM (VP9).
 */
import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, WebMOutputFormat, getFirstEncodableVideoCodec } from 'mediabunny'
import type { Recording } from '../core/solver/simulation'
import { exactStateAt } from '../core/solver/simulation'
import { solveMode } from '../core/solver/dynamics'
import type { Camera, DrawOptions, Palette } from '../render/renderer'
import { computeTrajectories, drawScene, vectorScales } from '../render/renderer'
import { evaluateQuantity, listQuantities, makeContextFor } from '../core/observe/quantities'
import { segmentAt } from '../formula/situations'
import { ENGINE_VERSION } from '../core/scene/types'

export interface VideoOptions {
  width: number
  height: number
  fps: number
  /** Simulated seconds per video second. */
  speed: number
  t0: number
  t1: number
  view: { cx: number; cy: number; ppmAtHeight: number; viewHeight: number }
  options: DrawOptions
  palette: Palette
  selectedId: string | null
  digits: number
  overlayIds: string[]
  title: string
}

export interface VideoResult { data: Uint8Array; extension: 'mp4' | 'webm'; mime: string; frames: number }

export async function exportVideo(rec: Recording, o: VideoOptions, progress: (p: number) => void, cancelled: () => boolean): Promise<VideoResult> {
  const width = o.width - (o.width % 2), height = o.height - (o.height % 2)
  const codec = await getFirstEncodableVideoCodec(['avc', 'vp9', 'vp8'], { width, height })
  if (!codec) throw new Error('此系统没有可用的视频编码器（需要 WebCodecs 支持 H.264 或 VP9）')
  const mp4 = codec === 'avc'
  const output = new Output({ format: mp4 ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(), target: new BufferTarget() })
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  // explicit bitrate (≈0.15 bit per pixel per frame): thin lines and small labels must stay sharp
  const bitrate = Math.round(Math.min(40e6, Math.max(4e6, width * height * o.fps * 0.15)))
  const source = new CanvasSource(canvas, { codec, bitrate, keyFrameInterval: 1 })
  output.addVideoTrack(source, { frameRate: o.fps })
  await output.start()

  const scale = height / o.view.viewHeight
  const cam: Camera = { cx: o.view.cx, cy: o.view.cy, ppm: o.view.ppmAtHeight * scale, width, height }
  const trajectories = computeTrajectories(rec)
  const scales = vectorScales(rec, rec.system)
  const s = { v: scales.v * scale, a: scales.a * scale, f: scales.f * scale }
  const defs = new Map(listQuantities(rec.system).map(q => [q.id, q]))
  const tEnd = Math.min(o.t1, (rec.frameCount - 1) * rec.dt)
  const count = Math.max(1, Math.floor(((tEnd - o.t0) / o.speed) * o.fps + 1e-9) + 1)
  const fontScale = height / 720
  for (let i = 0; i < count; i++) {
    if (cancelled()) throw new Error('已取消')
    const t = Math.min(tEnd, o.t0 + (i / o.fps) * o.speed)
    const X = exactStateAt(rec, t)
    const seg = segmentAt(rec, t)
    const sol = solveMode(rec.system, X, seg.mode)
    const frame = Math.min(rec.frameCount - 1, Math.floor(t / rec.dt + 1e-9))
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.save()
    // the renderer draws in CSS-pixel units; scale its fonts and strokes with the video height
    ctx.scale(fontScale, fontScale)
    drawScene(ctx, { ...cam, ppm: cam.ppm / fontScale, width: width / fontScale, height: height / fontScale }, {
      sys: rec.system, X, mode: seg.mode, sol, rec, frame, time: t, options: o.options, selectedId: o.selectedId, hoverId: null,
      palette: o.palette, scales: { v: s.v / fontScale, a: s.a / fontScale, f: s.f / fontScale }, trajectories, editing: false, pending: null, digits: o.digits
    })
    ctx.restore()
    // overlay
    const pad = 18 * fontScale
    ctx.font = `600 ${20 * fontScale}px "Segoe UI","Noto Sans SC Variable","Microsoft YaHei UI",sans-serif`
    ctx.fillStyle = o.palette.text
    ctx.fillText(o.title, pad, pad + 16 * fontScale)
    ctx.font = `600 ${18 * fontScale}px "JetBrains Mono Variable",Consolas,monospace`
    ctx.fillText(`t = ${t.toFixed(3)} s${o.speed !== 1 ? `   (${o.speed}× 速度)` : ''}`, pad, pad + 42 * fontScale)
    if (o.overlayIds.length) {
      const c = makeContextFor(rec, X, seg.mode, seg.impactLoss)
      ctx.font = `${15 * fontScale}px "JetBrains Mono Variable","Noto Sans SC Variable",Consolas,monospace`
      o.overlayIds.slice(0, 6).forEach((id, k) => {
        const q = defs.get(id)
        if (!q) return
        const v = evaluateQuantity(c, id)
        ctx.fillText(`${q.owner} ${q.label} = ${Number.isFinite(v) ? Number(v.toPrecision(Math.min(o.digits, 8))) : '—'} ${q.unit}`, pad, pad + (70 + 22 * k) * fontScale)
      })
    }
    ctx.font = `${12 * fontScale}px "Segoe UI","Noto Sans SC Variable",sans-serif`
    ctx.fillStyle = o.palette.text2
    const foot = `Verity ${ENGINE_VERSION} · 仿真结果可复现 · ${rec.hash.slice(0, 12)}`
    ctx.fillText(foot, width - ctx.measureText(foot).width - pad, height - pad * 0.7)
    await source.add(i / o.fps, 1 / o.fps)
    if (i % 10 === 0) progress(i / count)
  }
  await output.finalize()
  const buf = (output.target as BufferTarget).buffer
  if (!buf) throw new Error('视频编码失败')
  progress(1)
  return { data: new Uint8Array(buf), extension: mp4 ? 'mp4' : 'webm', mime: mp4 ? 'video/mp4' : 'video/webm', frames: count }
}
