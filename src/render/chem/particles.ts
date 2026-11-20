/**
 * The micro view (26.64, D267): a schematic of the particles in a solution. The numbers of particles of each species
 * are in the proportion of their amounts in the core's species list — at most a few dozen particles in all, so a
 * species below about 2 % of the solutes cannot be shown and is listed as "trace" by the caller. Positions and
 * motion mean nothing and the interface says so ("示意"); the solvent is not drawn.
 */
import type { ChemPalette } from './palette'

export interface ParticleKind { id: string; label: string; z: number; n: number }
export interface ParticleShare { id: string; label: string; z: number; count: number; colour: string }

/** Most particles the schematic draws. */
export const MAX_PARTICLES = 36

/**
 * How many particles of each species to draw: proportional to the amounts (largest remainders), at most `max` in all.
 * A species whose share rounds to nothing gets none; the caller lists those as traces.
 */
export function particleShares(species: ParticleKind[], P: Pick<ChemPalette, 'series'>, max = MAX_PARTICLES): ParticleShare[] {
  const list = species.filter(s => s.n > 0).sort((a, b) => b.n - a.n).slice(0, P.series.length)
  const total = list.reduce((t, s) => t + s.n, 0)
  if (!(total > 0)) return []
  const exact = list.map(s => (s.n / total) * max)
  const counts = exact.map(Math.floor)
  let left = max - counts.reduce((a, b) => a + b, 0)
  const order = exact.map((x, i) => [x - Math.floor(x), i] as [number, number]).sort((a, b) => b[0] - a[0])
  for (const [frac, i] of order) { if (left <= 0 || frac < 0.5) break; counts[i]++; left-- }
  return list.map((s, i) => ({ id: s.id, label: s.label, z: s.z, count: counts[i], colour: P.series[i] })).filter(s => s.count > 0)
}

function hash(i: number, salt: number): number {
  let h = Math.imul(i + 1, 2654435761) ^ Math.imul(salt + 7, 40503)
  h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13
  return ((h >>> 0) % 100000) / 100000
}

/** Draw the schematic into a w × h box. `time` (s) drifts the particles; pass 0 for a still picture. */
export function drawParticles(ctx: CanvasRenderingContext2D, P: ChemPalette, w: number, h: number, shares: ParticleShare[], time: number) {
  ctx.save()
  ctx.fillStyle = P.water
  ctx.fillRect(0, 0, w, h)
  const total = shares.reduce((t, s) => t + s.count, 0)
  if (!total) { ctx.restore(); return }
  // a jittered grid keeps particles apart without any dynamics
  const cols = Math.ceil(Math.sqrt((total * w) / h)), rows = Math.ceil(total / cols)
  const cw = w / cols, ch = h / rows
  const r = Math.max(7, Math.min(13, Math.min(cw, ch) * 0.3))
  const cells = Array.from({ length: cols * rows }, (_x, i) => i).sort((a, b) => hash(a, 3) - hash(b, 3))
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  let k = 0
  for (const s of shares) {
    for (let i = 0; i < s.count; i++, k++) {
      const cell = cells[k % cells.length]
      const cx = (cell % cols + 0.5) * cw + (hash(k, 1) - 0.5) * (cw - 2 * r) * 0.8 + Math.sin(time * (0.5 + hash(k, 5)) + k) * 2.5
      const cy = (Math.floor(cell / cols) + 0.5) * ch + (hash(k, 2) - 0.5) * (ch - 2 * r) * 0.8 + Math.cos(time * (0.4 + hash(k, 6)) + k * 1.3) * 2.5
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fillStyle = P.pane
      ctx.fill()
      ctx.strokeStyle = s.colour
      ctx.lineWidth = 1.5
      // ions are drawn solid-edged, neutral particles dashed: charge is not told by colour alone
      ctx.setLineDash(s.z === 0 ? [3, 2] : [])
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = s.colour
      ctx.font = `600 ${Math.max(9, r * 0.95)}px ${P.font}`
      ctx.fillText(s.z > 0 ? '+' : s.z < 0 ? '−' : '·', cx, cy + 0.5)
    }
  }
  ctx.restore()
}
