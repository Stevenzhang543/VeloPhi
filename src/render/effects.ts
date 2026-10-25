/**
 * Purely visual playback effects, derived from recorded data only (they never change a value that is read
 * as a result):
 *
 *  - motion blur: 6–12 sub-frame samples of the moving bodies across [t − shutter, t] (interpolated display
 *    states), each filled with a small alpha so they accumulate into a smear behind the sharp body;
 *  - fading trails behind the moving bodies over the last few tenths of a second;
 *  - particles: impact sparks and dust, dust at sliding contacts and a puff where a rope jerks taut.
 *
 * Particles are stateless: emitters are built once per recording from its events and segments, and the
 * position of every particle at time t is a closed-form function of (t − emitTime) and a hash of
 * (emitter seed, particle index). Scrubbing backwards, slow motion and video export therefore show exactly
 * the same particles.
 */
import type { Recording } from '../core/solver/simulation'
import { frameState } from '../core/solver/simulation'
import type { ContactFeature, Pose } from '../core/solver/kinematics'
import { anchorState, computePoses, contactKin } from '../core/solver/kinematics'
import type { BodyModel } from '../core/solver/model'
import type { Camera, Palette } from './renderer'
import { bodyPath } from './renderer'
import { displayStateAt } from './interp'
import { lw } from './style'

/** Which visual effects are on, with their time windows. */
export interface FrameEffects {
  motionBlur: boolean
  /** Exposure interval for motion blur (s of simulated time). */
  shutterSeconds: number
  particles: boolean
  trails: boolean
  /** Length of the trails (s of simulated time). */
  trailSeconds: number
}

/** Upper bound of particles drawn in one frame. */
export const MAX_PARTICLES = 400

// ---- Scratch buffers ----

const pool: Float64Array[] = []
function scratch(i: number, size: number): Float64Array {
  let b = pool[i]
  if (!b || b.length !== size) { b = new Float64Array(size); pool[i] = b }
  return b
}

// ---- Motion blur ----

/**
 * Ghost images of the moving bodies over [t − shutter, t], drawn under the sharp frame. Bodies that moved
 * less than about a pixel are skipped, and nothing is drawn when no body moved.
 */
export function drawMotionBlur(ctx: CanvasRenderingContext2D, cam: Camera, rec: Recording, t: number, shutter: number, X: Float64Array) {
  const model = rec.system.model
  if (!(shutter > 0) || model.dynamic.length === 0) return
  const t0 = Math.max(0, t - shutter)
  if (t - t0 < 1e-9) return
  const X0 = displayStateAt(rec, t0, scratch(0, rec.size))
  let maxPx = 0
  const moving: Array<{ b: BodyModel; px: number; size: number }> = []
  for (const b of model.dynamic) {
    const i = 3 * b.index
    const dth = X[i + 2] - X0[i + 2]
    const px = Math.hypot(X[i] - X0[i], X[i + 1] - X0[i + 1]) * cam.ppm + Math.abs(dth) * b.bound * cam.ppm
    if (px < 1) continue
    moving.push({ b, px, size: Math.max(2, 2 * b.bound * cam.ppm) })
    if (px > maxPx) maxPx = px
  }
  if (moving.length === 0) return
  const N = Math.max(6, Math.min(12, Math.round(maxPx / 3)))
  for (let s = 0; s < N; s++) {
    const tau = t0 + ((t - t0) * s) / N
    const Xs = s === 0 ? X0 : displayStateAt(rec, tau, scratch(1, rec.size))
    const poses = computePoses(model, Xs)
    const w = (s + 1) / N
    for (const m of moving) {
      // About k ghosts cover a point of the smear; choose the alpha so they add up to ~0.55
      const k = Math.max(1, Math.min(N, (N * m.size) / m.px))
      const a = 1 - Math.pow(0.45, 1 / k)
      ctx.globalAlpha = Math.min(0.6, a * (0.35 + 1.3 * w))
      bodyPath(ctx, cam, m.b, poses[m.b.global])
      ctx.fillStyle = m.b.def.color
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1
}

// ---- Trails ----

/** Trails are drawn in this many pieces of increasing opacity and width. */
const TRAIL_CHUNKS = 12

/** Fading, tapering trails over [t − seconds, t] from the recorded positions (plus the drawn position at t). */
export function drawTrails(ctx: CanvasRenderingContext2D, cam: Camera, rec: Recording, t: number, seconds: number, poses: Pose[]) {
  if (!(seconds > 0)) return
  const k1 = Math.min(rec.frameCount - 1, Math.floor(t / rec.dt + 1e-9))
  const k0 = Math.max(0, Math.ceil((t - seconds) / rec.dt - 1e-9))
  if (k1 - k0 < 1) return
  const stride = Math.max(1, Math.floor((k1 - k0) / 96))
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // Sampled frames from old to new (one state each), ending at the drawn position
  const count = Math.floor((k1 - k0) / stride) + 1
  const states: Float64Array[] = []
  for (let j = 0; j < count; j++) states.push(frameState(rec, k0 + j * stride))
  for (const b of rec.system.model.dynamic) {
    const pose = poses[b.global]
    const total = count + 1
    const sx = (j: number) => (j < count ? states[j][3 * b.index] : pose.x)
    const sy = (j: number) => (j < count ? states[j][3 * b.index + 1] : pose.y)
    // Skip bodies at rest
    if (Math.hypot(sx(0) - pose.x, sy(0) - pose.y) * cam.ppm < 2) continue
    ctx.strokeStyle = b.def.color
    const per = Math.max(1, Math.ceil((total - 1) / TRAIL_CHUNKS))
    for (let c = 0; c * per < total - 1; c++) {
      const j0 = c * per, j1 = Math.min(total - 1, j0 + per)
      const f = (j1 / (total - 1))
      ctx.globalAlpha = 0.6 * f * f
      ctx.lineWidth = lw(0.8 + 3.2 * f)
      ctx.beginPath()
      for (let j = j0; j <= j1; j++) {
        const x = cam.width / 2 + (sx(j) - cam.cx) * cam.ppm, y = cam.height / 2 - (sy(j) - cam.cy) * cam.ppm
        if (j === j0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
  }
  ctx.globalAlpha = 1
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'miter'
}

// ---- Particles ----

/** Particle kinds. */
const SPARK = 0, DUST = 1, PUFF = 2

interface Emitter {
  t: number
  x: number; y: number
  /** Mean emission direction (rad) and spread (rad, full width). */
  ang: number; spread: number
  /** Mean speed (m/s). */
  speed: number
  count: number
  kind: number
  seed: number
  /** Longest particle life (s of simulated time). */
  life: number
  /** Outward normal of the surface the particles leave (0, 0: none); particles that cross it have landed. */
  nx: number; ny: number
}

/** Emitters of one block of simulated time [b·BLOCK, (b + 1)·BLOCK), sorted by time. */
interface ParticleBlock { frames: number; events: number; final: boolean; emitters: Emitter[]; times: Float64Array }

/**
 * Emitters are built per block of simulated time, on demand, so that a long (growing) recording only builds what
 * is drawn. Blocks are cached per frame store: the snapshots of one streaming run share them, and a block that
 * lies inside the computed range is final.
 */
const particleCaches = new WeakMap<object, Map<number, ParticleBlock>>()

/** Length of an emitter block (s of simulated time). */
const BLOCK = 2
/** Longest particle life of any emitter (s); emitters older than this are never drawn. */
const MAX_LIFE = 0.7

/** 32-bit integer hash of two integers (deterministic on every platform). */
export function hash2(a: number, b: number): number {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be59b, 0xc2b2ae35)
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d)
  h ^= h >>> 15; h = Math.imul(h, 0x846ca68b)
  h ^= h >>> 16
  return h >>> 0
}

/** Emission interval of sliding dust (s of simulated time). */
const SLIDE_DT = 1 / 120
/** Dust particles per second of sliding per m/s of slip speed. */
const SLIDE_RATE = 36
/** Most emitters built per block (very long slides stop adding dust). */
const MAX_EMITTERS = 40000

/** Outward normal (away from the static body, if any) and whether both bodies move. */
function outward(f: ContactFeature | null, nx: number, ny: number): { x: number; y: number; both: boolean } {
  if (!f) return { x: nx, y: ny, both: false }
  const aDyn = f.A.body.dynamic, bDyn = f.B.body.dynamic
  if (!aDyn) return { x: -nx, y: -ny, both: false }
  return { x: nx, y: ny, both: aDyn && bDyn }
}

/** Emitters of one block of a recording: impacts, rope jerks and dust along sliding contacts, sorted by time. */
function buildBlock(rec: Recording, block: number): ParticleBlock {
  const model = rec.system.model
  const em: Emitter[] = []
  const bStart = block * BLOCK, bEnd = (block + 1) * BLOCK
  const inBlock = (t: number) => t >= bStart && t < bEnd
  // Impacts and rope jerks (events are sorted by time)
  let e0 = 0, e1 = rec.events.length
  while (e0 < e1) { const mid = (e0 + e1) >> 1; if (rec.events[mid].t < bStart) e0 = mid + 1; else e1 = mid }
  for (let ei = e0; ei < rec.events.length && rec.events[ei].t < bEnd; ei++) {
    const e = rec.events[ei]
    if (em.length > MAX_EMITTERS) break
    const pts = e.impact?.points ?? []
    let ropePuff = false
    pts.forEach((p, pi) => {
      const vn = -p.vnBefore
      if (p.kind === 'contact') {
        if (vn < 0.05) return
        const o = outward(p.feature, p.nx, p.ny)
        const count = Math.max(3, Math.min(32, Math.round(3 + 8 * vn)))
        em.push({
          t: e.t, x: p.cx, y: p.cy, ang: Math.atan2(o.y, o.x), spread: o.both ? Math.PI * 2 : Math.PI * 0.8,
          speed: Math.min(4, 0.25 + 0.45 * vn), count, kind: vn > 1.2 ? SPARK : DUST, seed: hash2(ei, pi), life: vn > 1.2 ? 0.55 : 0.7,
          nx: o.both ? 0 : o.x, ny: o.both ? 0 : o.y
        })
      } else if (p.kind === 'rope' && vn > 0.02) {
        const r = model.ropes[p.rope]
        if (!r) return
        const poses = computePoses(model, e.after)
        for (const a of [r.a, r.b]) {
          if (!a.body?.dynamic) continue
          const s = anchorState(poses, a)
          em.push({ t: e.t, x: s.px, y: s.py, ang: Math.PI / 2, spread: Math.PI * 2, speed: 0.2 + 0.25 * Math.min(4, vn), count: Math.max(5, Math.min(14, Math.round(5 + 4 * vn))), kind: PUFF, seed: hash2(ei, 1000 + p.rope * 2 + (a === r.a ? 0 : 1)), life: 0.45, nx: 0, ny: 0 })
        }
        ropePuff = true
      }
    })
    // A rope that becomes taut without a jerk still gets a small puff
    if (!ropePuff) {
      for (const c of e.changes) {
        if (c.type !== 'taut') continue
        const r = model.ropes.find(x => x.id === c.subject)
        if (!r) continue
        const poses = computePoses(model, e.after)
        for (const a of [r.a, r.b]) {
          if (!a.body?.dynamic) continue
          const s = anchorState(poses, a)
          em.push({ t: e.t, x: s.px, y: s.py, ang: Math.PI / 2, spread: Math.PI * 2, speed: 0.18, count: 4, kind: PUFF, seed: hash2(ei, 2000 + (a === r.a ? 0 : 1)), life: 0.35, nx: 0, ny: 0 })
        }
      }
    }
  }
  // Dust at sliding contacts: emission times m·SLIDE_DT inside the block, of the segments overlapping it
  const tEnd = (rec.frameCount - 1) * rec.dt
  let s0 = 0, s1 = rec.segments.length
  while (s0 < s1) { const mid = (s0 + s1) >> 1; if (rec.segments[mid].t0 <= bStart) s0 = mid + 1; else s1 = mid }
  for (let si = Math.max(0, s0 - 1); si < rec.segments.length && rec.segments[si].t0 < bEnd; si++) {
    const seg = rec.segments[si]
    const t1 = Math.min(seg.t1, tEnd)
    seg.mode.units.forEach((u, ui) => {
      if (u.friction !== 'slide' || u.points.length === 0) return
      for (let m = Math.max(Math.ceil(seg.t0 / SLIDE_DT - 1e-9), Math.floor(bStart / SLIDE_DT) - 1); m * SLIDE_DT < t1; m++) {
        if (em.length > MAX_EMITTERS) return
        const te = m * SLIDE_DT
        if (te >= bEnd) break
        if (!inBlock(te)) continue
        let k = Math.min(rec.frameCount - 1, Math.round(te / rec.dt))
        if (k * rec.dt < seg.t0 - 1e-12 && k + 1 < rec.frameCount) k++
        if (k * rec.dt > t1 + 1e-12) break
        const poses = computePoses(model, frameState(rec, k))
        const ref = contactKin(u.ref, poses)
        const slip = Math.abs(ref.vt)
        if (slip < 0.03) continue
        const seed = hash2(100000 + si * 64 + ui, m)
        const count = Math.floor(SLIDE_RATE * slip * SLIDE_DT + (seed >>> 8) / 16777216)
        if (count <= 0) continue
        let cx = 0, cy = 0
        for (const pf of u.points) { const kk = contactKin(pf, poses); cx += kk.cx; cy += kk.cy }
        cx /= u.points.length; cy /= u.points.length
        const o = outward(u.ref, ref.nx, ref.ny)
        // Motion of the sliding (dynamic) body relative to the surface; dust is kicked out behind it
        const sg = (u.ref.A.body.dynamic ? 1 : -1) * Math.sign(ref.vt)
        const mx = sg * ref.tx, my = sg * ref.ty
        const dx = -0.75 * mx + 0.65 * o.x, dy = -0.75 * my + 0.65 * o.y
        em.push({ t: te, x: cx, y: cy, ang: Math.atan2(dy, dx), spread: 1.4, speed: Math.min(1.2, 0.15 + 0.3 * slip), count: Math.min(4, count), kind: DUST, seed, life: 0.55, nx: o.x, ny: o.y })
      }
    })
  }
  em.sort((a, b) => a.t - b.t || a.seed - b.seed)
  const times = new Float64Array(em.length)
  em.forEach((e, i) => { times[i] = e.t })
  return { frames: rec.frameCount, events: rec.events.length, final: bEnd <= tEnd, emitters: em, times }
}

/** The emitter block b of a recording (cached per frame store; rebuilt while it still grows). */
function blockOf(rec: Recording, b: number): ParticleBlock {
  let blocks = particleCaches.get(rec.frames)
  if (!blocks) { blocks = new Map(); particleCaches.set(rec.frames, blocks) }
  let c = blocks.get(b)
  if (!c || (!c.final && (c.frames !== rec.frameCount || c.events !== rec.events.length))) { c = buildBlock(rec, b); blocks.set(b, c) }
  return c
}

/** Number of emitters of a recording (for tests and diagnostics). */
export function particleEmitterCount(rec: Recording): number {
  const tEnd = (rec.frameCount - 1) * rec.dt
  let n = 0
  for (let b = 0; b * BLOCK <= tEnd; b++) n += blockOf(rec, b).emitters.length
  return n
}

/** Position of a particle with linear drag k (1/s) and acceleration (gx, gy), closed form in tau. */
function dragPos(out: { x: number; y: number }, x0: number, y0: number, vx: number, vy: number, gx: number, gy: number, k: number, tau: number) {
  if (k <= 0) { out.x = x0 + vx * tau + 0.5 * gx * tau * tau; out.y = y0 + vy * tau + 0.5 * gy * tau * tau; return }
  const e = (1 - Math.exp(-k * tau)) / k
  const gt = (tau - e) / k
  out.x = x0 + vx * e + gx * gt
  out.y = y0 + vy * e + gy * gt
}

const P0 = { x: 0, y: 0 }, P1 = { x: 0, y: 0 }

/**
 * Draw the particles alive at time t. Returns the number drawn (at most `limit`). Everything is a function of
 * t and the recording, so any time can be drawn in any order.
 */
export function drawParticles(ctx: CanvasRenderingContext2D, cam: Camera, rec: Recording, t: number, P: Palette, limit = MAX_PARTICLES): number {
  const tMin = t - MAX_LIFE
  const g = rec.system.model.settings.gravity
  const c = { gx: g.x, gy: g.y }
  const spark = P.spark ?? P.acceleration, dust = P.dust ?? P.text2
  const W2 = cam.width / 2, H2 = cam.height / 2, ppm = cam.ppm
  const lineScale = lw(1)
  let drawn = 0
  ctx.lineCap = 'round'
  for (let b = Math.max(0, Math.floor(tMin / BLOCK)); b <= Math.floor(t / BLOCK); b++) {
    const blk = blockOf(rec, b)
    const n = blk.emitters.length
    // First emitter of the block that can still be alive
    let lo = 0, hi = n
    while (lo < hi) { const mid = (lo + hi) >> 1; if (blk.times[mid] < tMin) lo = mid + 1; else hi = mid }
    for (let i = lo; i < n && blk.times[i] <= t; i++) {
      const e = blk.emitters[i]
      const tau = t - e.t
      if (tau > e.life) continue
      for (let j = 0; j < e.count; j++) {
        const h1 = hash2(e.seed, 2 * j), h2 = hash2(e.seed, 2 * j + 1)
        const r1 = (h1 & 0xffff) / 65536, r2 = (h1 >>> 16) / 65536, r3 = (h2 & 0xffff) / 65536, r4 = (h2 >>> 16) / 65536
        const life = e.life * (0.5 + 0.5 * r1)
        if (tau > life) continue
        const kind = e.kind === SPARK && j % 3 === 2 ? DUST : e.kind
        const ang = e.ang + (r2 - 0.5) * e.spread
        const sp = e.speed * (0.35 + 0.65 * r3) * (kind === SPARK ? 1.6 : 1)
        const vx = Math.cos(ang) * sp, vy = Math.sin(ang) * sp
        const f = 1 - tau / life
        if (kind === SPARK) {
          const d = Math.min(tau, 0.028)
          dragPos(P1, e.x, e.y, vx, vy, c.gx, c.gy, 0, tau)
          if ((P1.x - e.x) * e.nx + (P1.y - e.y) * e.ny < 0) continue // Landed
          dragPos(P0, e.x, e.y, vx, vy, c.gx, c.gy, 0, tau - d)
          ctx.globalAlpha = Math.pow(f, 0.6)
          ctx.strokeStyle = spark
          ctx.lineWidth = lineScale * (1 + 0.8 * r4)
          ctx.beginPath()
          ctx.moveTo(W2 + (P0.x - cam.cx) * ppm, H2 - (P0.y - cam.cy) * ppm)
          ctx.lineTo(W2 + (P1.x - cam.cx) * ppm + 0.01, H2 - (P1.y - cam.cy) * ppm)
          ctx.stroke()
        } else {
          const k = kind === PUFF ? 7 : 4.5
          const gs = kind === PUFF ? -0.04 : 0.35
          dragPos(P1, e.x, e.y, vx, vy, c.gx * gs, c.gy * gs, k, tau)
          if ((P1.x - e.x) * e.nx + (P1.y - e.y) * e.ny < 0) continue // Settled on the surface
          const rad = lineScale * (kind === PUFF ? 2 + 7 * (1 - f) : 1.4 + 3.8 * (1 - f)) * (0.7 + 0.6 * r4)
          ctx.globalAlpha = (kind === PUFF ? 0.32 : 0.5) * f
          ctx.fillStyle = dust
          ctx.beginPath()
          ctx.arc(W2 + (P1.x - cam.cx) * ppm, H2 - (P1.y - cam.cy) * ppm, rad, 0, Math.PI * 2)
          ctx.fill()
        }
        if (++drawn >= limit) { ctx.globalAlpha = 1; ctx.lineCap = 'butt'; return drawn }
      }
    }
  }
  ctx.globalAlpha = 1
  ctx.lineCap = 'butt'
  return drawn
}
