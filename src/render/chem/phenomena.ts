/**
 * The phenomena the core reports, drawn (26.65, D297 item 2). A declared reaction of the catalogue carries `effects`
 * (flame, smoke, fog, glow, light, spark, pop, explosion, melt, molten, dart, deposit, mirror, char …); when the core's
 * event says the reaction turned over, the bench store keeps the effect alive for a moment (src/chem/bench.ts,
 * `effectsOf`) and this module draws it on the vessel. A coloured gas that leaves an open vessel (the core's `gas`
 * event; its colour is the core's colour of that gas) rises from the mouth as a wisp. Nothing here decides that
 * anything happens: an effect is drawn only while the core's events say so, its strength follows the amount turned over.
 *
 * Cost: a few dozen small shapes per vessel at most (particles are capped per vessel and kind); under reduced motion
 * every effect is a still picture.
 */
import type { ChemPalette } from './palette'

/** An effect the store keeps alive for a vessel. */
export interface ActiveEffect {
  key: string
  /** 0 … 1, from the amount the reaction turned over. */
  strength: number
  /** Seconds since it began (an impulse — a pop, an explosion — plays once over its life). */
  age: number
  /** Seconds it lasts in all (Infinity: as long as the state holds it, a mirror). */
  life: number
  /** A CSS colour: of the product (smoke), of the flame, of a gas. */
  colour?: string
  /** The catalogue's flame colour key (`pale`, `paleBlue`, `blue`, `yellow`, `white`, `lilac`). */
  flame?: string
  /** The solid that reacts (a piece that melts and darts) and the one that forms. */
  reactant?: string
  product?: string
}

/** Where on the screen an effect of a vessel happens. */
export interface Anchor {
  /** Centre of the mouth, and its half width (px). */
  mouthX: number
  mouthY: number
  mouthR: number
  /** The liquid surface (px y) and its half width; null without liquid. */
  surfaceY: number | null
  surfaceR: number
  /** Where the solid is (px), or null; and every piece of it. */
  solid: [number, number] | null
  pieces: Array<[number, number]>
  /** Pixels per cm. */
  ppc: number
  /** Opening up (false for a vessel on its mouth). */
  open: boolean
  /** The surface it stands on (px y), for what runs over. */
  floorY: number
}

/** The line of a crack down the glass from the rim (a fixed zigzag: the same every frame). */
export function crackPath(ctx: CanvasRenderingContext2D, a: Anchor) {
  const x0 = a.mouthX + a.mouthR * 0.55, y0 = a.mouthY + 2
  const len = Math.max(20, (a.floorY - a.mouthY) * 0.7)
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  const steps = [[0.18, 0.12], [-0.1, 0.27], [0.14, 0.43], [-0.06, 0.6], [0.1, 0.78], [-0.04, 1]]
  for (const [dx, dy] of steps) ctx.lineTo(x0 + dx * a.mouthR, y0 + dy * len)
  ctx.moveTo(x0 + 0.14 * a.mouthR, y0 + 0.43 * len); ctx.lineTo(x0 + 0.42 * a.mouthR, y0 + 0.52 * len)
}

interface Particle { x: number; y: number; vx: number; vy: number; age: number; life: number; r: number }
interface Pool { list: Particle[]; owed: number; seed: number }

const CAP = 36

/** CSS colour of a flame of the catalogue's colour key (the drawing's own tones, per theme). */
export function flameTone(P: ChemPalette, key: string | undefined): string {
  return (key && P.flameKeys[key]) || P.flameOuter
}

export class Phenomena {
  private pools = new Map<string, Pool>()
  /** Effects time, s. */
  time = 0

  step(dt: number) { this.time += dt }
  keep(ids: Set<string>) { for (const k of this.pools.keys()) if (!ids.has(k.split('|')[0])) this.pools.delete(k) }
  busy(): boolean { for (const p of this.pools.values()) if (p.list.length) return true; return false }

  private pool(key: string): Pool {
    let p = this.pools.get(key)
    if (!p) { p = { list: [], owed: 0, seed: (key.length * 7919 + 17) >>> 0 }; this.pools.set(key, p) }
    return p
  }
  private rand(p: Pool) { p.seed = (p.seed * 1664525 + 1013904223) >>> 0; return p.seed / 4294967296 }

  /**
   * Particles of one kind: spawned at `rate` a second by `spawn`, moved by their velocity and `gravity` (px/s²),
   * dropped when old. Under reduced motion a still set of them is laid out along their paths.
   */
  private particles(key: string, rate: number, dt: number, calm: boolean, spawn: (p: Particle, r: () => number) => void, gravity = 0): Particle[] {
    const pool = this.pool(key)
    const r = () => this.rand(pool)
    if (calm) {
      pool.list.length = 0
      const n = Math.min(CAP, Math.max(0, Math.round(rate * 0.6)))
      for (let i = 0; i < n; i++) {
        const q: Particle = { x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, r: 1 }
        spawn(q, r)
        const t = ((i + 0.5) / n) * q.life
        q.x += q.vx * t; q.y += q.vy * t + 0.5 * gravity * t * t; q.age = t
        pool.list.push(q)
      }
      return pool.list
    }
    pool.owed += rate * dt
    while (pool.owed >= 1 && pool.list.length < CAP) {
      pool.owed -= 1
      const q: Particle = { x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, r: 1 }
      spawn(q, r)
      pool.list.push(q)
    }
    if (pool.owed > 3) pool.owed = 3
    for (const q of pool.list) { q.age += dt; q.vy += gravity * dt; q.x += q.vx * dt; q.y += q.vy * dt }
    pool.list = pool.list.filter(q => q.age < q.life)
    return pool.list
  }

  /** Draw what goes on inside the vessel (under its glass, clipped to its inner space by the caller): a mirror, a deposit, char. */
  drawInside(ctx: CanvasRenderingContext2D, P: ChemPalette, id: string, effects: ActiveEffect[], a: Anchor, wall: (h: number) => [number, number] | null, bottomY: number) {
    for (const e of effects) {
      if (e.key === 'mirror' && a.surfaceY !== null) {
        // the silver coat on the inner wall below the surface: two strokes, dark and bright, along the wall
        ctx.save()
        ctx.lineCap = 'round'
        const pts: Array<{ y: number; l: number; r: number }> = []
        for (let y = bottomY; y >= a.surfaceY; y -= 3) { const w = wall(y); if (w) pts.push({ y, l: w[0], r: w[1] }) }
        for (const [tone, width] of [[P.mirrorDark, Math.max(3, 0.32 * a.ppc)], [P.mirrorLight, Math.max(1.2, 0.1 * a.ppc)]] as const) {
          ctx.strokeStyle = tone
          ctx.lineWidth = width
          for (const side of ['l', 'r'] as const) {
            ctx.beginPath()
            pts.forEach((w, i) => { if (i) ctx.lineTo(w[side], w.y); else ctx.moveTo(w[side], w.y) })
            ctx.stroke()
          }
        }
        ctx.restore()
      } else if (e.key === 'char' && a.solid) {
        // the sugar turns black and swells: a porous dark column growing with the effect's age
        const grow = Math.min(1, e.age / 6)
        const [x, y] = a.solid
        const h = (1.5 + 3.5 * grow) * a.ppc, w = Math.max(a.surfaceR, a.mouthR) * 0.9
        ctx.save()
        ctx.fillStyle = P.char
        ctx.beginPath()
        ctx.moveTo(x - w, y)
        for (let i = 0; i <= 8; i++) { const s = i / 8; ctx.quadraticCurveTo(x - w + 2 * w * (s - 0.06), y - h - Math.sin(i * 1.9) * 0.4 * a.ppc, x - w + 2 * w * s, y - h + Math.cos(i * 2.3) * 0.25 * a.ppc) }
        ctx.lineTo(x + w, y)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      } else if (e.key === 'deposit' && a.solid) {
        // a coat of the metal that comes out of solution on the piece: fine dots of its colour
        const pool = this.pool(`${id}|deposit`)
        ctx.save()
        ctx.fillStyle = e.colour ?? P.metal
        ctx.strokeStyle = P.ink3
        ctx.lineWidth = 0.75
        const seed = pool.seed
        const k = Math.max(1.4, 0.13 * a.ppc)
        for (const [x, y] of a.pieces.length ? a.pieces : [a.solid]) {
          for (let i = 0; i < 7; i++) { const q = this.rand(pool) * Math.PI * 2, d = (0.15 + this.rand(pool) * 0.35) * a.ppc; ctx.beginPath(); ctx.arc(x + Math.cos(q) * d, y + Math.sin(q) * d * 0.7, k * (0.7 + this.rand(pool) * 0.6), 0, Math.PI * 2); ctx.fill(); ctx.stroke() }
        }
        pool.seed = seed
        ctx.restore()
      }
    }
  }

  /** Draw the effects that happen at and above the vessel: flames, smoke, fog, glow, light, sparks, pops, a gas leaving. */
  draw(ctx: CanvasRenderingContext2D, P: ChemPalette, id: string, effects: ActiveEffect[], a: Anchor, dt: number, calm: boolean, flame: (x: number, y: number, size: number, colour: string) => void) {
    const t = calm ? 0 : this.time
    const at: [number, number] = a.solid ?? (a.surfaceY !== null ? [a.mouthX, a.surfaceY] : [a.mouthX, a.mouthY])
    for (const e of effects) {
      const s = Math.max(0.15, Math.min(1, e.strength))
      switch (e.key) {
        case 'flame': {
          // a burning solid burns where it lies; a gas burns at the mouth
          const [x, y] = a.solid ?? [a.mouthX, a.mouthY]
          flame(x, y, (0.7 + 0.9 * s) * a.ppc, flameTone(P, e.flame))
          break
        }
        case 'glow': {
          const [x, y] = at
          const k = calm ? 1 : 0.85 + 0.15 * Math.sin(t * 7.1)
          ctx.save()
          for (let i = 3; i >= 1; i--) { ctx.globalAlpha = (0.12 + 0.1 * s) * k * (4 - i) / 3; ctx.fillStyle = P.glow; ctx.beginPath(); ctx.arc(x, y, (0.35 + 0.45 * i * s) * a.ppc, 0, Math.PI * 2); ctx.fill() }
          ctx.restore()
          break
        }
        case 'light': {
          // a dazzling white light: rays and a bright core, flickering
          const [x, y] = at
          const k = calm ? 1 : 0.8 + 0.2 * Math.sin(t * 23)
          ctx.save()
          ctx.strokeStyle = P.light
          ctx.fillStyle = P.light
          ctx.lineCap = 'round'
          ctx.lineWidth = Math.max(1.5, 0.12 * a.ppc)
          const R = (1.2 + 1.8 * s) * a.ppc * k
          ctx.globalAlpha = 0.9
          ctx.beginPath()
          for (let i = 0; i < 12; i++) { const q = (i / 12) * Math.PI * 2 + t * 0.7, r0 = R * 0.35, r1 = R * (i % 2 ? 0.75 : 1); ctx.moveTo(x + Math.cos(q) * r0, y + Math.sin(q) * r0); ctx.lineTo(x + Math.cos(q) * r1, y + Math.sin(q) * r1) }
          ctx.stroke()
          ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(x, y, R * 0.55, 0, Math.PI * 2); ctx.fill()
          ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(x, y, R * 0.2, 0, Math.PI * 2); ctx.fill()
          ctx.restore()
          break
        }
        case 'smoke':
        case 'fog': {
          // smoke: particles of the product rising and spreading from where it forms, out of an open mouth; fog: finer,
          // paler, hanging over the mouth
          const fog = e.key === 'fog'
          const list = this.particles(`${id}|${e.key}`, (fog ? 10 : 14) * s, dt, calm, (q, r) => {
            const [x0, y0] = fog ? [a.mouthX, a.mouthY] : at
            q.x = x0 + (r() - 0.5) * a.mouthR * 1.2; q.y = y0 - r() * 4
            q.vx = (r() - 0.5) * 10; q.vy = -(fog ? 6 + r() * 6 : 16 + r() * 14)
            q.life = fog ? 2.2 + r() : 2.6 + r() * 1.2; q.r = (fog ? 0.35 : 0.22 + r() * 0.2) * a.ppc
          })
          ctx.save()
          ctx.fillStyle = e.colour ?? (fog ? P.fog : P.smoke)
          for (const q of list) { const u = q.age / q.life; ctx.globalAlpha = (fog ? 0.5 : 0.75) * (1 - u) * Math.min(1, u * 6); ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (1 + u * (fog ? 2.5 : 1.8)), 0, Math.PI * 2); ctx.fill() }
          ctx.restore()
          break
        }
        case 'gas': {
          // a coloured gas leaving an open vessel: soft wisps of its colour rising from the mouth and thinning out
          if (!a.open) break
          const list = this.particles(`${id}|gas`, 10 * s, dt, calm, (q, r) => {
            q.x = a.mouthX + (r() - 0.5) * a.mouthR * 1.2; q.y = a.mouthY - 1
            q.vx = (r() - 0.5) * 0.5 * a.ppc + 0.25 * a.ppc; q.vy = -(0.5 + r() * 0.6) * a.ppc; q.life = 3.2 + r() * 1.6; q.r = (0.3 + r() * 0.25) * a.ppc
          })
          ctx.save()
          ctx.fillStyle = e.colour ?? P.smoke
          for (const q of list) { const u = q.age / q.life; ctx.globalAlpha = 0.32 * (1 - u) * Math.min(1, u * 4); ctx.beginPath(); ctx.arc(q.x + Math.sin(q.age * 1.3 + q.r) * 0.25 * a.ppc, q.y, q.r * (1 + u * 3), 0, Math.PI * 2); ctx.fill() }
          ctx.restore()
          break
        }
        case 'spark':
        case 'molten': {
          // sparks fly out and fall; molten drops fall from the burning piece
          const spark = e.key === 'spark'
          const [x0, y0] = at
          if (spark) {
            ctx.save()
            for (let i = 3; i >= 1; i--) { ctx.globalAlpha = 0.18 * (4 - i); ctx.fillStyle = P.spark; ctx.beginPath(); ctx.arc(x0, y0, (0.18 + 0.22 * i) * a.ppc, 0, Math.PI * 2); ctx.fill() }
            ctx.restore()
          }
          const list = this.particles(`${id}|${e.key}`, (spark ? 40 : 5) * s, dt, calm, (q, r) => {
            const ang = -Math.PI / 2 + (r() - 0.5) * Math.PI * 1.6, v = (spark ? (4 + r() * 7) * a.ppc : 5 + r() * 10)
            q.x = x0; q.y = y0; q.vx = Math.cos(ang) * v; q.vy = Math.sin(ang) * v * (spark ? 1 : 0.2); q.life = spark ? 0.45 + r() * 0.35 : 0.9 + r() * 0.5; q.r = spark ? 1 : Math.max(1.5, 0.12 * a.ppc)
          }, spark ? 220 : 160)
          ctx.save()
          ctx.lineCap = 'round'
          for (const q of list) {
            const u = q.age / q.life
            ctx.globalAlpha = 1 - u * 0.7
            if (spark) { ctx.strokeStyle = P.spark; ctx.lineWidth = Math.max(1.4, 0.1 * a.ppc); ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - q.vx * 0.045, q.y - q.vy * 0.045); ctx.stroke() }
            else { ctx.fillStyle = P.spark; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx.fill() }
          }
          ctx.restore()
          break
        }
        case 'blown': {
          // a stopper blown out: it flies up off the mouth, turning, with a flash (D297 item 9)
          const u = calm ? 0.5 : Math.min(1, e.age / e.life)
          const yy = a.mouthY - (0.6 + 9 * u - 4 * u * u) * a.ppc, xx = a.mouthX + 3 * u * a.ppc
          ctx.save()
          if (u < 0.3) { ctx.globalAlpha = (0.3 - u) * 3; ctx.fillStyle = P.flash; ctx.beginPath(); ctx.arc(a.mouthX, a.mouthY - 0.4 * a.ppc, (0.8 + 2 * u) * a.ppc, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1 }
          ctx.translate(xx, yy); ctx.rotate(u * 5)
          const w = Math.max(4, a.mouthR * 1.15), h = Math.max(4, 0.7 * a.ppc)
          ctx.fillStyle = P.rubber; ctx.strokeStyle = P.ink2; ctx.lineWidth = 1.25
          ctx.beginPath(); ctx.moveTo(-w * 0.85, -h / 2); ctx.lineTo(w, -h / 2); ctx.lineTo(w * 0.85, h / 2); ctx.lineTo(-w * 0.7, h / 2); ctx.closePath(); ctx.fill(); ctx.stroke()
          ctx.restore()
          break
        }
        case 'spill': {
          // liquid running over the rim and down the outside
          const u = calm ? 0.5 : Math.min(1, e.age / e.life)
          ctx.save()
          ctx.fillStyle = P.stream
          const x0 = a.mouthX - a.mouthR - 2, y0 = a.mouthY, y1 = a.floorY
          const head = y0 + (y1 - y0) * Math.min(1, u * 2.5), tail = y0 + (y1 - y0) * Math.max(0, u * 2.5 - 1.5)
          ctx.fillRect(x0 - 1.5, tail, 3, Math.max(0, head - tail))
          ctx.restore()
          break
        }
        case 'crack': {
          // the moment it cracks: a bright line along the crack
          const u = calm ? 0.5 : Math.min(1, e.age / e.life)
          if (u >= 1) break
          ctx.save(); ctx.globalAlpha = 1 - u; ctx.strokeStyle = P.light; ctx.lineWidth = 2.5
          crackPath(ctx, a); ctx.stroke(); ctx.restore()
          break
        }
        case 'pop':
        case 'explosion': {
          // an impulse: a flash that grows and fades once over the effect's life (a still star under reduced motion)
          const big = e.key === 'explosion'
          const u = calm ? 0.35 : Math.min(1, e.age / Math.min(e.life, big ? 0.9 : 0.5))
          if (u >= 1) break
          const [x, y] = big ? at : [a.mouthX, a.mouthY - 0.6 * a.ppc]
          const R = (big ? 3 + 7 * u : 0.8 + 2.2 * u) * a.ppc * (0.6 + 0.4 * s)
          ctx.save()
          ctx.globalAlpha = (1 - u) * 0.85
          ctx.fillStyle = P.flash
          ctx.beginPath(); ctx.arc(x, y, R * 0.6, 0, Math.PI * 2); ctx.fill()
          ctx.strokeStyle = P.flashEdge
          ctx.lineWidth = Math.max(1.5, (big ? 0.25 : 0.12) * a.ppc)
          ctx.lineCap = 'round'
          ctx.beginPath()
          const n = big ? 14 : 8
          for (let i = 0; i < n; i++) { const q = (i / n) * Math.PI * 2 + 0.3, r0 = R * 0.7, r1 = R * (i % 2 ? 0.95 : 1.2); ctx.moveTo(x + Math.cos(q) * r0, y + Math.sin(q) * r0); ctx.lineTo(x + Math.cos(q) * r1, y + Math.sin(q) * r1) }
          ctx.stroke()
          ctx.restore()
          break
        }
        default: break
      }
    }
  }
}
