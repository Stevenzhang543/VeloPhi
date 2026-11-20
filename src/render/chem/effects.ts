/**
 * What moves on the bench (26.64, D267): bubbles, the stream of a transfer, flames, steam. These are pictures of
 * numbers the core gave — the bubbles of a vessel come at a rate that follows the gas the last steps of the clock
 * released per second, steam appears while the core reports boiling, a flame burns while the vessel's heater is on —
 * and never the other way round. Under reduced motion every effect is a still picture; when the page is hidden
 * nothing is stepped. A full bench costs well under 2 ms a frame: at most a few dozen small shapes per vessel.
 *
 * Bubbles live in the vessel's own coordinates (cm from its axis and its bottom), so they stay in their liquid when
 * the bench is panned or zoomed.
 */
import type { ChemPalette } from './palette'
import type { Frame } from './glass'
import { fx, fy } from './glass'

interface Bubble { x: number; h: number; r: number; v: number; phase: number }
interface Pool { bubbles: Bubble[]; owed: number; seed: number }

/** Bubbles a second for a gas release (mol/s): three at 10⁻⁷, five more per decade, between 1.5 and 30. */
export function bubbleRate(molPerSecond: number): number {
  if (!(molPerSecond > 1e-9)) return 0
  return Math.min(30, Math.max(1.5, 3 + 5 * Math.log10(molPerSecond / 1e-7)))
}

export interface BubbleRegion {
  f: Frame
  /** Height of the liquid surface and of the floor the bubbles start from, cm. */
  surface: number
  floor: number
  /** Inner radius at a height, cm. */
  radius: (h: number) => number
  /** Where gas forms (screen points: pieces of solid, an electrode, the end of a tube); empty: anywhere on the floor. */
  sources: Array<[number, number]>
}

/** A stream or drops of a transfer, in bench coordinates (cm). */
interface Pour { x: number; top: number; bottom: number; t0: number; duration: number; tint: string; drops: boolean }

export class Effects {
  private pools = new Map<string, Pool>()
  private pours: Pour[] = []
  /** Time of the effects, s: stands still under reduced motion. */
  time = 0

  /** Let `dt` seconds pass (0 under reduced motion and while hidden). */
  step(dt: number) { this.time += dt }

  /** Forget the bubbles of vessels that are gone. */
  keep(ids: Set<string>) { for (const id of this.pools.keys()) if (!ids.has(id.split('#')[0])) this.pools.delete(id) }

  /** True while something is moving: the canvas keeps drawing. */
  busy(): boolean {
    if (this.pours.length) return true
    for (const p of this.pools.values()) if (p.bubbles.length) return true
    return false
  }

  /** Bubbles of one vessel (or one source in it: `key` = vessel id, or id#part). `rate`: bubbles a second. */
  bubbles(ctx: CanvasRenderingContext2D, P: ChemPalette, key: string, region: BubbleRegion, rate: number, dt: number, calm: boolean) {
    const { f, surface, floor } = region
    if (surface - floor < 0.15) { this.pools.delete(key); return }
    let pool = this.pools.get(key)
    if (!pool) { if (rate <= 0) return; pool = { bubbles: [], owed: 0, seed: key.length * 7919 + 13 }; this.pools.set(key, pool) }
    const rand = () => { pool!.seed = (pool!.seed * 1664525 + 1013904223) >>> 0; return pool!.seed / 4294967296 }
    const spawn = (h?: number) => {
      const src = region.sources.length ? region.sources[Math.floor(rand() * region.sources.length)] : null
      const h0 = h ?? (src ? Math.abs(src[1] - f.base) / f.ppc : floor)
      const x0 = src ? (src[0] - f.cx) / f.ppc + (rand() - 0.5) * 0.25 : (rand() * 2 - 1) * region.radius(h0) * 0.8
      const r = 0.05 + rand() * 0.11
      pool!.bubbles.push({ x: x0, h: Math.min(Math.max(h0, floor), surface), r, v: 4 + 30 * r + rand() * 2, phase: rand() * 6.28 })
    }
    if (calm) {
      // a still picture of the same thing: a few bubbles on their way up
      pool.bubbles.length = 0
      const n = Math.min(9, Math.ceil(rate / 3))
      for (let i = 0; i < n; i++) spawn(floor + ((i + 0.5) / n) * (surface - floor))
    } else {
      pool.owed += rate * dt
      while (pool.owed >= 1 && pool.bubbles.length < 42) { pool.owed -= 1; spawn() }
      if (pool.owed > 3) pool.owed = 3
      for (const b of pool.bubbles) { b.h += b.v * dt; b.x += Math.sin(this.time * 9 + b.phase) * 0.35 * dt }
      pool.bubbles = pool.bubbles.filter(b => b.h < surface - b.r)
      if (!pool.bubbles.length && rate <= 0) { this.pools.delete(key); return }
    }
    ctx.save()
    ctx.strokeStyle = P.bubble
    ctx.lineWidth = 1
    for (const b of pool.bubbles) {
      const lim = Math.max(0, region.radius(b.h) - b.r)
      const x = Math.max(-lim, Math.min(lim, b.x))
      ctx.beginPath()
      ctx.arc(fx(f, x), fy(f, b.h), Math.max(1, b.r * f.ppc), 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.restore()
  }

  /** A flame with its base centred at (x, y): `size` px wide. Two flat tones, no gradient. */
  flame(ctx: CanvasRenderingContext2D, P: ChemPalette, x: number, y: number, size: number, kind: 'soft' | 'blast', calm: boolean, colour?: string) {
    const t = calm ? 0 : this.time
    const h = size * (kind === 'blast' ? 3.1 : 2.3) * (1 + 0.07 * Math.sin(t * 13.1) + 0.05 * Math.sin(t * 7.3 + 1))
    const sway = size * 0.12 * Math.sin(t * 5.7)
    const tongue = (w: number, hh: number, fill: string) => {
      ctx.beginPath()
      ctx.moveTo(x - w / 2, y)
      ctx.bezierCurveTo(x - w * 0.75, y - hh * 0.45, x - w * 0.1 + sway, y - hh * 0.7, x + sway, y - hh)
      ctx.bezierCurveTo(x + w * 0.1 + sway, y - hh * 0.7, x + w * 0.75, y - hh * 0.45, x + w / 2, y)
      ctx.closePath()
      ctx.fillStyle = fill
      ctx.fill()
    }
    // a flame test: the flame takes the colour the core computed from the lines of the elements
    tongue(size, h, colour ?? (kind === 'blast' ? P.flameBlue : P.flameOuter))
    tongue(size * 0.5, h * 0.55, kind === 'blast' ? P.glassLight : P.flameInner)
  }

  /** Steam rising from a mouth `width` px wide at (x, y). */
  steam(ctx: CanvasRenderingContext2D, P: ChemPalette, x: number, y: number, width: number, calm: boolean) {
    const t = calm ? 0 : this.time
    ctx.save()
    ctx.strokeStyle = P.steam
    ctx.lineCap = 'round'
    ctx.lineWidth = Math.max(2, width * 0.09)
    const rise = Math.max(28, width * 1.1)
    for (let k = -1; k <= 1; k++) {
      const x0 = x + k * width * 0.28
      const shift = ((t * 0.55 + (k + 1) * 0.37) % 1) * rise * 0.35
      ctx.beginPath()
      for (let i = 0; i <= 10; i++) {
        const s = i / 10
        const px = x0 + Math.sin(s * 5 + t * 2.2 + k) * width * 0.1 * (0.4 + s), py = y - 4 - s * rise - shift
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py)
      }
      ctx.globalAlpha = 0.9 - 0.25 * Math.abs(k)
      ctx.stroke()
    }
    ctx.restore()
  }

  /** Show a transfer: a stream (or drops) falling at bench x from `top` to `bottom` (cm). */
  pour(x: number, top: number, bottom: number, tint: string, drops = false, duration = 0.7) {
    this.pours.push({ x, top, bottom, t0: this.time, duration, tint, drops })
    if (this.pours.length > 6) this.pours.shift()
  }

  /** Draw the running transfers; `sx`, `sy` map bench coordinates to the screen. */
  drawPours(ctx: CanvasRenderingContext2D, P: ChemPalette, sx: (x: number) => number, sy: (y: number) => number, ppc: number, calm: boolean) {
    if (!this.pours.length) return
    // a still picture cannot play out: under reduced motion the stream is skipped (the level simply changes)
    if (calm) { this.pours.length = 0; return }
    this.pours = this.pours.filter(p => this.time - p.t0 < p.duration)
    ctx.save()
    for (const p of this.pours) {
      const u = (this.time - p.t0) / p.duration
      const x = sx(p.x), y0 = sy(p.top), y1 = sy(p.bottom)
      ctx.fillStyle = p.tint
      ctx.strokeStyle = P.waterLine
      ctx.lineWidth = 1
      if (p.drops) {
        for (let k = 0; k < 3; k++) {
          const s = (u * 1.6 + k * 0.33) % 1
          const y = y0 + (y1 - y0) * s * s
          ctx.beginPath(); ctx.ellipse(x, y, Math.max(1.5, 0.09 * ppc), Math.max(2, 0.14 * ppc), 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
        }
      } else {
        // the stream grows down, then its upper end falls away
        const head = y0 + (y1 - y0) * Math.min(1, u * 3), tail = y0 + (y1 - y0) * Math.max(0, u * 3 - 2)
        const w = Math.max(2, 0.22 * ppc)
        ctx.fillRect(x - w / 2, tail, w, head - tail)
        ctx.beginPath(); ctx.moveTo(x - w / 2, tail); ctx.lineTo(x - w / 2, head); ctx.moveTo(x + w / 2, tail); ctx.lineTo(x + w / 2, head); ctx.stroke()
      }
    }
    ctx.restore()
  }
}
