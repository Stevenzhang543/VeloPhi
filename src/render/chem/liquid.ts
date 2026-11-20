/**
 * Liquids in glassware (26.64, D267): the fill reaches the level the vessel's profile gives for the volume — the
 * exact inverse of the volume (`levelOf`) — and is clipped by the vessel's inner space, so it sits in its glass at
 * every shape and size. The surface is a meniscus in narrow tubes. The colour is the core's (`colour`: white light
 * through the vessel's width, D267) — never a preset per reagent. Clear water would be white on a white bench, so a
 * liquid is painted in two coats: the neutral water tint, thinner the more the solution absorbs, and the solution's
 * own colour, denser the more it absorbs. A second liquid is a layer of its own.
 */
import type { VesselShape } from '../../chem/apparatus'
import { levelOf, radiusAt } from '../../chem/apparatus'
import type { ChemPalette } from './palette'
import type { Frame } from './glass'
import { cavityPath, fx, fy, uGap } from './glass'

/** One liquid layer from the bottom up: a share of the liquid volume and its tint. */
export interface LiquidLayer { share: number; tint: string; line?: string }

export interface LiquidOptions {
  uTube?: boolean
  /** Layers from the bottom up (their shares sum to 1); default: one layer of the neutral water tint. */
  layers?: LiquidLayer[]
  /** Volume below the liquid taken by settled solids, mL (the liquid stands on them). */
  under_mL?: number
  line?: number
  /** The solution's colour from the core (sRGB 0–255); absent: a clear liquid. */
  colour?: readonly [number, number, number] | null
}

/** How strongly a transmitted colour differs from white (0 … 1): the share of light the darkest channel lost. */
export function absorption(c: readonly [number, number, number]): number { return 1 - Math.min(c[0], c[1], c[2]) / 255 }

/**
 * Fill a vessel with `volume_mL` of liquid. Returns the height (cm from the inner bottom) of the surface, or null
 * when there is no liquid.
 */
export function drawLiquid(ctx: CanvasRenderingContext2D, P: ChemPalette, shape: VesselShape, f: Frame, volume_mL: number, o: LiquidOptions = {}): number | null {
  if (!(volume_mL > 0)) return null
  const under = Math.max(0, o.under_mL ?? 0)
  const top = levelOf(shape, volume_mL + under)
  const a = o.colour ? absorption(o.colour) : 0
  const own = o.colour && a > 0.004 ? `rgba(${o.colour[0]}, ${o.colour[1]}, ${o.colour[2]}, ${Math.min(0.94, Math.pow(a, 0.55)).toFixed(3)})` : null
  const layers = o.layers?.length ? o.layers : [{ share: 1, tint: P.water, line: P.waterLine }]
  /** Paint a region of liquid: the water tint (fading as the solution absorbs more), then the solution's colour. */
  const coat = (tint: string, draw: () => void) => {
    if (own && !o.layers?.length) { ctx.globalAlpha = Math.max(0.15, 1 - a); ctx.fillStyle = tint; draw(); ctx.globalAlpha = 1; ctx.fillStyle = own; draw() }
    else { ctx.fillStyle = tint; draw() }
  }
  ctx.save()
  cavityPath(ctx, shape, f, o.uTube)
  ctx.clip()
  const left = fx(f, -(o.uTube ? uGap(shape) / 2 + shape.r[0] : shape.rMax) - 1), width = (fx(f, 1) - fx(f, 0)) * 2 * ((o.uTube ? uGap(shape) / 2 + shape.r[0] : shape.rMax) + 1)
  let done = 0
  for (let i = 0; i < layers.length; i++) {
    const h0 = i === 0 ? shape.h[0] - (o.uTube ? uGap(shape) : 0) : levelOf(shape, under + volume_mL * done)
    done += layers[i].share
    const h1 = i === layers.length - 1 ? top : levelOf(shape, under + volume_mL * done)
    const ya = fy(f, h0), yb = fy(f, h1)
    coat(layers[i].tint, () => ctx.fillRect(left, Math.min(ya, yb), width, Math.abs(ya - yb)))
    // the boundary between two layers
    if (i < layers.length - 1) { ctx.strokeStyle = layers[i].line ?? P.waterLine; ctx.lineWidth = Math.max(0.75, o.line ?? 1); ctx.beginPath(); ctx.moveTo(left, yb); ctx.lineTo(left + width, yb); ctx.stroke() }
  }
  // the surface: a meniscus where the tube is narrow, a level line elsewhere
  const y = fy(f, top)
  ctx.strokeStyle = layers[layers.length - 1].line ?? P.waterLine
  ctx.lineWidth = Math.max(1, (o.line ?? 1) * 1.25)
  const surface = (cx: number, r: number) => {
    const half = r * f.ppc
    // the level is the bottom of the meniscus; the liquid climbs the wall by `rise`
    const rise = r < 1.7 && !f.flip ? Math.min(half * 0.3, 0.16 * f.ppc) : 0
    if (rise) {
      coat(layers[layers.length - 1].tint, () => { ctx.beginPath(); ctx.moveTo(cx - half, y - rise); ctx.quadraticCurveTo(cx, y + rise, cx + half, y - rise); ctx.lineTo(cx + half, y); ctx.lineTo(cx - half, y); ctx.closePath(); ctx.fill() })
    }
    ctx.beginPath()
    ctx.moveTo(cx - half, y - rise)
    if (rise) ctx.quadraticCurveTo(cx, y + rise, cx + half, y - rise)
    else ctx.lineTo(cx + half, y)
    ctx.stroke()
  }
  if (o.uTube) { const g = uGap(shape) / 2; surface(fx(f, -g), shape.r[0]); surface(fx(f, g), shape.r[0]) } else surface(f.cx, radiusAt(shape, top))
  ctx.restore()
  return top
}
