/**
 * Solids in a vessel (26.64, D267). Fine solids — powders, fresh precipitates, small crystals — lie as a settled
 * layer whose look follows the texture key of the catalogue (`powder`, `crystal`, `floc`, `gel`); pieces of metal and
 * rock are drawn by their form (`granule`, `pellet`, `chip`, `ribbon`, `foil`, `sheet`, `lump`, `wire`, `rod`). Colours are the catalogue's
 * (`display[id].color`); a solid without one gets the neutral solid tone. How much room a solid takes is drawing
 * only: mass over density times a packing factor per texture.
 */
import type { VesselShape } from '../../chem/apparatus'
import { levelOf, radiusAt } from '../../chem/apparatus'
import type { ChemPalette } from './palette'
import type { Frame } from './glass'
import { cavityPath, fy } from './glass'

export interface SolidDraw { id: string; form: string; g: number; colour: string | null; texture: string | null; rho: number | null }

const PIECES = new Set(['granule', 'pellet', 'chip', 'ribbon', 'foil', 'sheet', 'lump', 'wire', 'rod'])
/** Bulk volume of a settled solid over the volume of the solid itself. */
const PACK: Record<string, number> = { powder: 2.2, crystal: 1.7, floc: 6, gel: 8 }

const isPiece = (s: SolidDraw) => PIECES.has(s.form)
const lookOf = (s: SolidDraw) => (s.texture && s.texture in PACK ? s.texture : s.form === 'crystal' ? 'crystal' : 'powder')

/** Volume (mL) the settled fine solids take at the bottom: the liquid stands on it. */
export function settledVolume(solids: SolidDraw[]): number {
  let v = 0
  for (const s of solids) if (!isPiece(s) && s.g > 0) v += (s.g / (s.rho ?? 2.5)) * PACK[lookOf(s)]
  return v
}

/** A small deterministic generator: the same solid is drawn the same way every frame. */
function rng(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000 }
}

/**
 * Draw the solids of a vessel. Returns the screen points gas would rise from (the pieces, or the top of the settled
 * layer), for the bubbles.
 */
export function drawSolids(ctx: CanvasRenderingContext2D, P: ChemPalette, shape: VesselShape, f: Frame, solids: SolidDraw[], uTube = false, line = 1): Array<[number, number]> {
  const sources: Array<[number, number]> = []
  if (!solids.some(s => s.g > 0)) return sources
  ctx.save()
  cavityPath(ctx, shape, f, uTube)
  ctx.clip()
  const span = (shape.rMax + 1) * f.ppc
  let below = 0
  for (const s of solids) {
    if (isPiece(s) || !(s.g > 0)) continue
    const look = lookOf(s)
    const vol = (s.g / (s.rho ?? 2.5)) * PACK[look]
    const h0 = levelOf(shape, below)
    below += vol
    let h1 = levelOf(shape, below)
    // a trace of solid is still seen: at least two pixels
    if ((h1 - h0) * f.ppc < 2) h1 = h0 + 2 / f.ppc
    const y0 = fy(f, h0), y1 = fy(f, h1)
    const top = Math.min(y0, y1), hgt = Math.abs(y0 - y1)
    const rand = rng(s.id + look)
    ctx.fillStyle = s.colour ?? P.solid
    ctx.globalAlpha = look === 'gel' ? 0.55 : look === 'floc' ? 0.8 : 1
    if (look === 'floc' || look === 'gel') {
      // an uneven top: lobes for a floc, a slow wave for a gel
      ctx.beginPath()
      ctx.moveTo(f.cx - span, y0)
      const n = look === 'floc' ? 9 : 4
      for (let i = 0; i <= n; i++) {
        const x = f.cx - span + (2 * span * i) / n
        const lift = (look === 'floc' ? 0.35 + rand() * 0.9 : 0.5 + 0.5 * Math.sin(i * 1.7)) * Math.min(hgt * 0.5, 0.35 * f.ppc)
        ctx.quadraticCurveTo(x - span / n, top - lift * (f.flip ? -1 : 1), x, top)
      }
      ctx.lineTo(f.cx + span, y0)
      ctx.closePath()
      ctx.fill()
    } else ctx.fillRect(f.cx - span, top, span * 2, hgt)
    ctx.globalAlpha = 1
    // texture marks and the top edge, in ink so that a white solid shows on a white bench
    ctx.strokeStyle = P.ink3
    ctx.fillStyle = P.ink3
    ctx.lineWidth = Math.max(0.75, line * 0.7)
    const r = radiusAt(shape, h1) * f.ppc
    const marks = Math.min(60, Math.round((r * 2 * hgt) / 26))
    ctx.globalAlpha = 0.5
    for (let i = 0; i < marks; i++) {
      const x = f.cx + (rand() * 2 - 1) * r, y = top + rand() * hgt
      if (look === 'crystal') { const k = 1.6 + rand() * 1.4; ctx.beginPath(); ctx.moveTo(x, y - k); ctx.lineTo(x + k, y); ctx.lineTo(x, y + k); ctx.lineTo(x - k, y); ctx.closePath(); ctx.stroke() }
      else if (look === 'powder') ctx.fillRect(x, y, 1, 1)
    }
    ctx.globalAlpha = 0.8
    if (look === 'powder' || look === 'crystal') { ctx.beginPath(); ctx.moveTo(f.cx - r, y1); ctx.lineTo(f.cx + r, y1); ctx.stroke() }
    ctx.globalAlpha = 1
    sources.push([f.cx - r * 0.4, y1], [f.cx + r * 0.3, y1])
  }
  // pieces rest on what has settled
  const floor = levelOf(shape, below)
  for (const s of solids) {
    if (!isPiece(s) || !(s.g > 0)) continue
    const rand = rng(s.id + s.form)
    const size = Math.max(2.5, Math.min(0.26 * f.ppc, radiusAt(shape, floor + 0.3) * f.ppc * 0.45))
    ctx.fillStyle = s.colour ?? P.metal
    ctx.strokeStyle = P.ink2
    ctx.lineWidth = Math.max(0.75, line * 0.8)
    const yFloor = fy(f, floor), up = f.flip ? 1 : -1
    const rAt = (lift: number) => Math.max(size, radiusAt(shape, floor + lift / f.ppc) * f.ppc - size)
    if (s.form === 'granule' || s.form === 'pellet' || s.form === 'chip') {
      const n = Math.max(1, Math.min(14, Math.round(s.g / (s.form === 'chip' ? 0.4 : 0.25))))
      for (let i = 0; i < n; i++) {
        const row = i < 8 ? 0 : 1
        const x = f.cx + (rand() * 2 - 1) * rAt(size * (1 + row * 1.6)), y = yFloor + up * size * (0.9 + row * 1.6)
        ctx.beginPath()
        if (s.form !== 'chip') ctx.ellipse(x, y, size * (0.8 + rand() * 0.4), size * (0.7 + rand() * 0.3), rand() * 3, 0, Math.PI * 2)
        else { const a = rand() * 6; for (let k = 0; k < 5; k++) { const q = a + (k * Math.PI * 2) / 5, d = size * (0.7 + rand() * 0.6); if (k) ctx.lineTo(x + Math.cos(q) * d, y + Math.sin(q) * d); else ctx.moveTo(x + Math.cos(q) * d, y + Math.sin(q) * d) } ctx.closePath() }
        ctx.fill(); ctx.stroke()
        if (i < 4) sources.push([x, y + up * size])
      }
    } else if (s.form === 'lump') {
      const d = Math.min(rAt(0), Math.max(size * 1.6, Math.cbrt(s.g / (s.rho ?? 2.5)) * 0.62 * f.ppc))
      ctx.beginPath()
      for (let k = 0; k < 7; k++) { const q = (k * Math.PI * 2) / 7, e = d * (0.8 + rand() * 0.35); const x = f.cx + Math.cos(q) * e, y = yFloor + up * d * 0.9 + Math.sin(q) * e * 0.85; if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y) }
      ctx.closePath(); ctx.fill(); ctx.stroke()
      sources.push([f.cx, yFloor + up * d * 1.8])
    } else {
      // ribbon, foil, wire: a strip standing in the vessel, longer with more of it
      const len = Math.min((shape.full - floor) * 0.8, 1.5 + s.g * (s.form === 'wire' ? 4 : 2.5)) * f.ppc
      const w = s.form === 'foil' || s.form === 'sheet' ? size * 2.2 : s.form === 'wire' ? Math.max(1.5, size * 0.35) : size * 0.9
      const lean = rAt(len) * 0.5
      ctx.beginPath()
      ctx.moveTo(f.cx - lean - w / 2, yFloor); ctx.quadraticCurveTo(f.cx - lean * 0.2, yFloor + up * len * 0.5, f.cx + lean - w / 2, yFloor + up * len)
      ctx.lineTo(f.cx + lean + w / 2, yFloor + up * len); ctx.quadraticCurveTo(f.cx - lean * 0.2 + w, yFloor + up * len * 0.5, f.cx - lean + w / 2, yFloor)
      ctx.closePath(); ctx.fill(); ctx.stroke()
      sources.push([f.cx - lean * 0.2, yFloor + up * len * 0.5], [f.cx + lean * 0.5, yFloor + up * len * 0.8])
    }
  }
  ctx.restore()
  return sources
}
