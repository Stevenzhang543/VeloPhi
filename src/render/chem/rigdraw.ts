/**
 * The fixtures of the bench, drawn (26.65, D297 items 4–5): the iron stand with its clamp and ring, the tripod with its
 * gauze, the test-tube rack, the alcohol lamp with its cap, the blast burner, the hot plate, the baths. Drawn by code
 * in the bench's one stroke weight, side on, at the sizes of rig.ts. A fixture has a back (drawn before the vessels it
 * holds) and a front (after them: the clamp's jaws around a neck, the front board of a rack, the water of a bath in
 * front of the beaker standing in it).
 *
 * Flames burn while a burner is lit (its setting); the vessel above is heated only when the core says so — the flame
 * is the burner's, the heat is the core's.
 */
import type { Fixture } from '../../chem/rig'
import { RIG, clampX, flameOf, ringX } from '../../chem/rig'
import type { ChemPalette } from './palette'
import { STROKE } from './glass'

export interface RigView { sx: (x: number) => number; sy: (y: number) => number; ppc: number; line: number }

/** A vessel held by a fixture: where its wall is at the grip, for the jaws of a clamp (bench cm). */
export interface Held { x: number; gripY: number; outerR: number }

const round = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  const k = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + k, y); ctx.lineTo(x + w - k, y); ctx.quadraticCurveTo(x + w, y, x + w, y + k); ctx.lineTo(x + w, y + h - k); ctx.quadraticCurveTo(x + w, y + h, x + w - k, y + h)
  ctx.lineTo(x + k, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - k); ctx.lineTo(x, y + k); ctx.quadraticCurveTo(x, y, x + k, y); ctx.closePath()
}

/** The gauze of a tripod or a ring: a wire mesh with its ceramic centre, `half` cm each side of x, its top at y. */
function gauze(ctx: CanvasRenderingContext2D, P: ChemPalette, v: RigView, x: number, y: number, half: number) {
  const x0 = v.sx(x - half), x1 = v.sx(x + half), yt = v.sy(y), th = Math.max(2, 0.22 * v.ppc)
  ctx.fillStyle = P.tickMinor
  ctx.fillRect(x0, yt, x1 - x0, th)
  // the mesh: short hatch
  ctx.strokeStyle = P.ink3
  ctx.lineWidth = 0.75
  ctx.beginPath()
  const step = Math.max(3, 0.45 * v.ppc)
  for (let px = x0 + step / 2; px < x1; px += step) { ctx.moveTo(px, yt); ctx.lineTo(px + step * 0.5, yt + th) }
  ctx.stroke()
  // the ceramic centre: a slightly thicker pale disc seen edge on
  const c0 = v.sx(x - half * 0.55), c1 = v.sx(x + half * 0.55)
  ctx.fillStyle = P.pane
  round(ctx, c0, yt - th * 0.25, c1 - c0, th * 1.5, th * 0.6)
  ctx.fill()
  ctx.strokeStyle = P.ink3
  ctx.stroke()
  ctx.strokeStyle = P.steel
  ctx.lineWidth = STROKE * v.line * 0.8
  ctx.strokeRect(x0, yt, x1 - x0, th)
}

function tripod(ctx: CanvasRenderingContext2D, P: ChemPalette, v: RigView, f: Fixture, sel: boolean) {
  const T = RIG.tripod
  const top = f.y + T.h - 0.3
  ctx.save()
  ctx.lineCap = 'round'
  // the back leg, thinner and fainter
  ctx.strokeStyle = P.steel
  ctx.globalAlpha = 0.45
  ctx.lineWidth = Math.max(1.5, 0.22 * v.ppc)
  ctx.beginPath(); ctx.moveTo(v.sx(f.x + 0.8), v.sy(top)); ctx.lineTo(v.sx(f.x + 1.4), v.sy(f.y)); ctx.stroke()
  ctx.globalAlpha = 1
  ctx.strokeStyle = sel ? P.accent : P.steel
  ctx.lineWidth = Math.max(2, 0.3 * v.ppc)
  ctx.beginPath()
  ctx.moveTo(v.sx(f.x - T.half + 1.0), v.sy(top)); ctx.lineTo(v.sx(f.x - T.half), v.sy(f.y))
  ctx.moveTo(v.sx(f.x + T.half - 1.0), v.sy(top)); ctx.lineTo(v.sx(f.x + T.half), v.sy(f.y))
  ctx.stroke()
  // the ring under the gauze
  ctx.lineWidth = Math.max(2, 0.32 * v.ppc)
  ctx.beginPath(); ctx.moveTo(v.sx(f.x - T.half + 0.8), v.sy(top)); ctx.lineTo(v.sx(f.x + T.half - 0.8), v.sy(top)); ctx.stroke()
  gauze(ctx, P, v, f.x, f.y + T.h, T.gauze)
  ctx.restore()
}

/** The iron stand: its base and rod (back); the boss heads and arms of the clamp and ring. */
function standBack(ctx: CanvasRenderingContext2D, P: ChemPalette, v: RigView, f: Fixture, sel: boolean, held: Held | null) {
  const S = RIG.stand
  const side = f.side ?? 1
  ctx.save()
  const bx0 = Math.min(f.x - S.baseL * side, f.x + S.baseR * side), bx1 = Math.max(f.x - S.baseL * side, f.x + S.baseR * side)
  // base plate
  ctx.fillStyle = P.ink2
  round(ctx, v.sx(bx0), v.sy(f.y + 1.2), v.sx(bx1) - v.sx(bx0), 1.2 * v.ppc, 0.35 * v.ppc)
  ctx.fill()
  // rod with its highlight
  const rw = Math.max(3, 0.75 * v.ppc), xr = v.sx(f.x)
  ctx.fillStyle = sel ? P.accent : P.steel
  ctx.fillRect(xr - rw / 2, v.sy(f.y + S.rod), rw, (S.rod - 1.2) * v.ppc)
  ctx.fillStyle = P.glassLight
  ctx.fillRect(xr - rw / 2 + rw * 0.18, v.sy(f.y + S.rod) + 2, Math.max(1, rw * 0.18), (S.rod - 1.6) * v.ppc)
  ctx.fillStyle = P.ink2
  round(ctx, xr - rw * 0.75, v.sy(f.y + S.rod) - rw * 0.4, rw * 1.5, rw * 0.6, rw * 0.3)
  ctx.fill()
  // ring: boss, arm, the ring seen edge on with its gauze
  if (typeof f.ring === 'number') {
    const y = f.y + f.ring, rx = ringX(f)
    boss(ctx, P, v, f.x, y)
    ctx.strokeStyle = P.steel
    ctx.lineWidth = Math.max(2, 0.3 * v.ppc)
    ctx.beginPath(); ctx.moveTo(xr, v.sy(y)); ctx.lineTo(v.sx(rx - side * S.ringR), v.sy(y)); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(v.sx(rx - S.ringR), v.sy(y)); ctx.lineTo(v.sx(rx + S.ringR), v.sy(y)); ctx.stroke()
    gauze(ctx, P, v, rx, y + 0.15, S.ringR + 0.6)
  }
  // clamp: boss and arm (the jaws are drawn in front of what they hold)
  if (typeof f.clamp === 'number') {
    const y = f.y + f.clamp
    boss(ctx, P, v, f.x, y)
    ctx.strokeStyle = P.steel
    ctx.lineWidth = Math.max(2, 0.3 * v.ppc)
    const reachTo = held ? held.x - side * (held.outerR + 0.25) : clampX(f) - side * 0.9
    ctx.beginPath(); ctx.moveTo(xr, v.sy(y)); ctx.lineTo(v.sx(reachTo), v.sy(y)); ctx.stroke()
  }
  ctx.restore()
}

/** The boss head that fixes an arm to the rod: a small block with its screw (the handle to move it up and down). */
function boss(ctx: CanvasRenderingContext2D, P: ChemPalette, v: RigView, x: number, y: number) {
  const k = Math.max(5, 0.8 * v.ppc)
  ctx.fillStyle = P.ink2
  round(ctx, v.sx(x) - k * 0.75, v.sy(y) - k * 0.6, k * 1.5, k * 1.2, k * 0.2)
  ctx.fill()
  ctx.strokeStyle = P.steel
  ctx.lineWidth = Math.max(1.5, 0.18 * v.ppc)
  ctx.beginPath(); ctx.moveTo(v.sx(x) - k * 1.25, v.sy(y)); ctx.lineTo(v.sx(x) - k * 0.75, v.sy(y)); ctx.stroke()
}

function standFront(ctx: CanvasRenderingContext2D, P: ChemPalette, v: RigView, f: Fixture, held: Held | null) {
  if (typeof f.clamp !== 'number') return
  const side = f.side ?? 1
  const y = f.y + f.clamp
  const cx = held ? held.x : clampX(f), r = held ? held.outerR + 0.25 : 0.9
  ctx.save()
  // two jaws round the neck, lined with cork
  ctx.strokeStyle = P.rubber
  ctx.lineWidth = Math.max(2.5, 0.32 * v.ppc)
  ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(v.sx(cx - r), v.sy(y + 0.55)); ctx.lineTo(v.sx(cx - r), v.sy(y - 0.55)); ctx.moveTo(v.sx(cx + r), v.sy(y + 0.55)); ctx.lineTo(v.sx(cx + r), v.sy(y - 0.55)); ctx.stroke()
  ctx.strokeStyle = P.steel
  ctx.lineWidth = Math.max(1.5, 0.2 * v.ppc)
  ctx.beginPath()
  ctx.moveTo(v.sx(cx - side * (r + 0.2)), v.sy(y + 0.8)); ctx.quadraticCurveTo(v.sx(cx), v.sy(y + 1.25), v.sx(cx + side * (r + 0.25)), v.sy(y + 0.65))
  ctx.moveTo(v.sx(cx - side * (r + 0.2)), v.sy(y - 0.8)); ctx.quadraticCurveTo(v.sx(cx), v.sy(y - 1.25), v.sx(cx + side * (r + 0.25)), v.sy(y - 0.65))
  ctx.stroke()
  // the screw that closes the clamp
  ctx.beginPath(); ctx.moveTo(v.sx(cx + side * (r + 0.25)), v.sy(y)); ctx.lineTo(v.sx(cx + side * (r + 1.0)), v.sy(y)); ctx.stroke()
  ctx.restore()
}

function rackBack(ctx: CanvasRenderingContext2D, P: ChemPalette, v: RigView, f: Fixture, sel: boolean) {
  const R = RIG.rack
  const x0 = v.sx(f.x - R.w / 2), x1 = v.sx(f.x + R.w / 2)
  ctx.save()
  ctx.fillStyle = P.rack
  ctx.strokeStyle = sel ? P.accent : P.ink3
  ctx.lineWidth = STROKE * v.line * 0.8
  // side posts and the bottom board
  for (const x of [f.x - R.w / 2, f.x + R.w / 2 - 0.7]) { ctx.beginPath(); ctx.rect(v.sx(x), v.sy(f.y + R.h), 0.7 * v.ppc, R.h * v.ppc); ctx.fill(); ctx.stroke() }
  ctx.beginPath(); ctx.rect(x0, v.sy(f.y + R.floor), x1 - x0, R.floor * v.ppc); ctx.fill(); ctx.stroke()
  ctx.restore()
}

function rackFront(ctx: CanvasRenderingContext2D, P: ChemPalette, v: RigView, f: Fixture, sel: boolean) {
  const R = RIG.rack
  const x0 = v.sx(f.x - R.w / 2), x1 = v.sx(f.x + R.w / 2), y0 = v.sy(f.y + R.hold + 0.6), hh = 0.6 * v.ppc
  ctx.save()
  ctx.fillStyle = P.rack
  ctx.strokeStyle = sel ? P.accent : P.ink3
  ctx.lineWidth = STROKE * v.line * 0.8
  ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, hh); ctx.fill(); ctx.stroke()
  // the holes, seen as small dark slots on the board's edge
  ctx.fillStyle = P.ink3
  for (let i = 0; i < R.slots; i++) { const x = f.x + (i - (R.slots - 1) / 2) * R.pitch; ctx.globalAlpha = 0.35; ctx.fillRect(v.sx(x - 0.95), y0 + 1, 1.9 * v.ppc, Math.max(1, hh * 0.25)) }
  ctx.restore()
}

/** An alcohol lamp: a squat glass bottle half full of spirit, a porcelain wick holder, the wick, the glass cap. */
function alcoholLamp(ctx: CanvasRenderingContext2D, P: ChemPalette, v: RigView, f: Fixture, sel: boolean) {
  const x = f.x, y = f.y
  const pt = (dx: number, h: number): [number, number] => [v.sx(x + dx), v.sy(y + h)]
  const outline = () => {
    ctx.beginPath()
    const p = [pt(-2.9, 0), pt(-3.1, 0.5), pt(-3.1, 3.4)]
    ctx.moveTo(...p[0]); ctx.lineTo(...p[1]); ctx.lineTo(...p[2])
    ctx.bezierCurveTo(...pt(-3.1, 5.4), ...pt(-1.2, 5.6), ...pt(-1.05, 6.6))
    ctx.lineTo(...pt(-1.05, 7.2)); ctx.lineTo(...pt(1.05, 7.2)); ctx.lineTo(...pt(1.05, 6.6))
    ctx.bezierCurveTo(...pt(1.2, 5.6), ...pt(3.1, 5.4), ...pt(3.1, 3.4))
    ctx.lineTo(...pt(3.1, 0.5)); ctx.lineTo(...pt(2.9, 0)); ctx.closePath()
  }
  ctx.save()
  ctx.lineJoin = 'round'
  outline(); ctx.fillStyle = P.glassBody; ctx.fill()
  // the spirit, about half full
  ctx.save(); outline(); ctx.clip(); ctx.fillStyle = P.spirit; ctx.fillRect(v.sx(x - 3.2), v.sy(y + 3.0), 6.4 * v.ppc, 3.0 * v.ppc); ctx.restore()
  outline(); ctx.strokeStyle = sel ? P.accent : P.ink2; ctx.lineWidth = STROKE * v.line; ctx.stroke()
  // highlight
  ctx.strokeStyle = P.glassLight; ctx.lineWidth = Math.max(1.5, 0.16 * v.ppc)
  ctx.beginPath(); ctx.moveTo(...pt(-2.5, 1.0)); ctx.lineTo(...pt(-2.5, 3.6)); ctx.stroke()
  // porcelain wick holder and the wick
  ctx.fillStyle = P.pane; ctx.strokeStyle = P.ink2; ctx.lineWidth = STROKE * v.line * 0.8
  ctx.beginPath(); ctx.moveTo(...pt(-1.0, 7.2)); ctx.lineTo(...pt(-0.6, 8.2)); ctx.lineTo(...pt(0.6, 8.2)); ctx.lineTo(...pt(1.0, 7.2)); ctx.closePath(); ctx.fill(); ctx.stroke()
  ctx.fillStyle = P.wick
  ctx.beginPath(); ctx.rect(...pt(-0.28, RIG.alcoholBurner.h), 0.56 * v.ppc, 0.4 * v.ppc); ctx.fill()
  // the cap: on the wick, or standing beside the lamp
  const cap = (cx: number, base: number) => {
    ctx.beginPath(); ctx.moveTo(...pt(cx - 1.45, base)); ctx.lineTo(...pt(cx - 0.95, base + 2.9)); ctx.quadraticCurveTo(...pt(cx, base + 3.3), ...pt(cx + 0.95, base + 2.9)); ctx.lineTo(...pt(cx + 1.45, base)); ctx.closePath()
    ctx.fillStyle = P.glassBody; ctx.fill(); ctx.strokeStyle = P.ink2; ctx.lineWidth = STROKE * v.line * 0.9; ctx.stroke()
  }
  if (f.cap !== false) cap(0, 6.9)
  else cap(4.6, 0)
  ctx.restore()
}

function blastBurner(ctx: CanvasRenderingContext2D, P: ChemPalette, v: RigView, f: Fixture, sel: boolean) {
  const B = RIG.blastBurner
  ctx.save()
  ctx.strokeStyle = sel ? P.accent : P.ink2
  ctx.lineWidth = STROKE * v.line
  // base, the spirit cup with its feed, the tube
  ctx.fillStyle = P.steel
  round(ctx, v.sx(f.x - B.half), v.sy(f.y + 0.8), B.half * 2 * v.ppc, 0.8 * v.ppc, 0.3 * v.ppc); ctx.fill(); ctx.stroke()
  ctx.fillStyle = P.metal
  round(ctx, v.sx(f.x - 2.2), v.sy(f.y + 4.2), 4.4 * v.ppc, 3.4 * v.ppc, 0.6 * v.ppc); ctx.fill(); ctx.stroke()
  ctx.beginPath(); ctx.rect(v.sx(f.x - 0.45), v.sy(f.y + B.h), 0.9 * v.ppc, (B.h - 4.2) * v.ppc); ctx.fill(); ctx.stroke()
  ctx.beginPath(); ctx.rect(v.sx(f.x - 0.8), v.sy(f.y + 9.5), 1.6 * v.ppc, 1.2 * v.ppc); ctx.fill(); ctx.stroke()
  ctx.restore()
}

function hotPlate(ctx: CanvasRenderingContext2D, P: ChemPalette, v: RigView, f: Fixture, sel: boolean, hot: boolean) {
  const H = RIG.hotPlate
  ctx.save()
  ctx.strokeStyle = sel ? P.accent : P.ink2
  ctx.lineWidth = STROKE * v.line
  ctx.fillStyle = P.tickMinor
  round(ctx, v.sx(f.x - H.half), v.sy(f.y + H.h - 0.4), H.half * 2 * v.ppc, (H.h - 0.4) * v.ppc, 0.4 * v.ppc); ctx.fill(); ctx.stroke()
  // the heating plate on top: red while it is on
  ctx.fillStyle = f.on && hot ? P.plateHot : P.ink2
  ctx.fillRect(v.sx(f.x - H.top), v.sy(f.y + H.h), H.top * 2 * v.ppc, 0.4 * v.ppc)
  // knob and lamp on the front
  ctx.fillStyle = P.pane
  ctx.beginPath(); ctx.arc(v.sx(f.x - H.half + 2), v.sy(f.y + 1.8), Math.max(3, 0.55 * v.ppc), 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.fillStyle = f.on ? P.danger : P.ink3
  ctx.beginPath(); ctx.arc(v.sx(f.x + H.half - 1.4), v.sy(f.y + 1.8), Math.max(2, 0.28 * v.ppc), 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

/** A bath: its back wall and the water behind what stands in it. */
function bathBack(ctx: CanvasRenderingContext2D, P: ChemPalette, v: RigView, f: Fixture) {
  const B = RIG.bath
  ctx.save()
  ctx.fillStyle = f.kind === 'iceBath' ? P.ice : P.water
  ctx.fillRect(v.sx(f.x - B.half + 0.2), v.sy(f.y + B.water), (B.half - 0.2) * 2 * v.ppc, (B.water - 0.2) * v.ppc)
  ctx.restore()
}

function bathFront(ctx: CanvasRenderingContext2D, P: ChemPalette, v: RigView, f: Fixture, sel: boolean, font: string) {
  const B = RIG.bath
  ctx.save()
  // the water in front of the beaker, and the basin
  ctx.fillStyle = f.kind === 'iceBath' ? P.ice : P.water
  ctx.globalAlpha = 0.75
  ctx.fillRect(v.sx(f.x - B.half + 0.2), v.sy(f.y + B.water), (B.half - 0.2) * 2 * v.ppc, (B.water - 0.2) * v.ppc)
  ctx.globalAlpha = 1
  ctx.strokeStyle = P.waterLine; ctx.lineWidth = Math.max(1, v.line)
  ctx.beginPath(); ctx.moveTo(v.sx(f.x - B.half + 0.2), v.sy(f.y + B.water)); ctx.lineTo(v.sx(f.x + B.half - 0.2), v.sy(f.y + B.water)); ctx.stroke()
  if (f.kind === 'iceBath') {
    // ice floating at the surface
    ctx.fillStyle = P.pane; ctx.strokeStyle = P.ink3; ctx.lineWidth = 0.75
    for (let i = 0; i < 5; i++) { const x = f.x - B.half + 1.4 + i * 2.9 + (i % 2 ? 0.4 : -0.3), k = 0.55; ctx.beginPath(); ctx.rect(v.sx(x - k), v.sy(f.y + B.water + 0.25), 2 * k * v.ppc, 1.2 * k * v.ppc); ctx.fill(); ctx.stroke() }
  }
  ctx.strokeStyle = sel ? P.accent : P.ink2; ctx.lineWidth = STROKE * v.line
  ctx.beginPath()
  ctx.moveTo(v.sx(f.x - B.half), v.sy(f.y + B.h)); ctx.lineTo(v.sx(f.x - B.half), v.sy(f.y + 0.4)); ctx.quadraticCurveTo(v.sx(f.x - B.half), v.sy(f.y), v.sx(f.x - B.half + 0.4), v.sy(f.y))
  ctx.lineTo(v.sx(f.x + B.half - 0.4), v.sy(f.y)); ctx.quadraticCurveTo(v.sx(f.x + B.half), v.sy(f.y), v.sx(f.x + B.half), v.sy(f.y + 0.4)); ctx.lineTo(v.sx(f.x + B.half), v.sy(f.y + B.h))
  ctx.stroke()
  // the setting, on the basin's front (the vessel's own temperature is the core's, in the inspector)
  if (f.kind === 'waterBath' && typeof f.T === 'number') {
    ctx.font = `500 ${Math.round(11 * v.line)}px ${font}`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = P.ink2
    ctx.textAlign = 'right'
    ctx.fillText(`${Math.round(f.T - 273.15)} °C`, v.sx(f.x + B.half - 0.5), v.sy(f.y + B.h + 0.9))
  }
  ctx.restore()
}

/** A pneumatic trough (D297 item 8): its water behind what stands in it, its shelf. */
function troughBack(ctx: CanvasRenderingContext2D, P: ChemPalette, v: RigView, f: Fixture) {
  const T = RIG.trough
  ctx.save()
  ctx.fillStyle = P.water
  ctx.fillRect(v.sx(f.x - T.half + 0.2), v.sy(f.y + T.water), (T.half - 0.2) * 2 * v.ppc, (T.water - 0.2) * v.ppc)
  // the shelf the jar stands on, with its notch for the tube
  ctx.fillStyle = P.tickMinor; ctx.strokeStyle = P.ink3; ctx.lineWidth = 0.75
  ctx.beginPath(); ctx.rect(v.sx(f.x + T.half * 0.05), v.sy(f.y + T.shelf), T.half * 0.6 * v.ppc, T.shelf * v.ppc); ctx.fill(); ctx.stroke()
  ctx.restore()
}
function troughFront(ctx: CanvasRenderingContext2D, P: ChemPalette, v: RigView, f: Fixture, sel: boolean) {
  const T = RIG.trough
  ctx.save()
  ctx.fillStyle = P.water; ctx.globalAlpha = 0.6
  ctx.fillRect(v.sx(f.x - T.half + 0.2), v.sy(f.y + T.water), (T.half - 0.2) * 2 * v.ppc, (T.water - 0.2) * v.ppc)
  ctx.globalAlpha = 1
  ctx.strokeStyle = P.waterLine; ctx.lineWidth = Math.max(1, v.line)
  ctx.beginPath(); ctx.moveTo(v.sx(f.x - T.half + 0.2), v.sy(f.y + T.water)); ctx.lineTo(v.sx(f.x + T.half - 0.2), v.sy(f.y + T.water)); ctx.stroke()
  ctx.strokeStyle = sel ? P.accent : P.ink2; ctx.lineWidth = STROKE * v.line
  ctx.beginPath(); ctx.moveTo(v.sx(f.x - T.half), v.sy(f.y + T.h)); ctx.lineTo(v.sx(f.x - T.half), v.sy(f.y)); ctx.lineTo(v.sx(f.x + T.half), v.sy(f.y)); ctx.lineTo(v.sx(f.x + T.half), v.sy(f.y + T.h)); ctx.stroke()
  ctx.restore()
}

/** Everything of a fixture behind the vessels. `held`: what its clamp holds; `hot`: a hot plate's vessel is being heated. */
export function drawFixtureBack(ctx: CanvasRenderingContext2D, P: ChemPalette, v: RigView, f: Fixture, o: { selected: boolean; held: Held | null; hot: boolean }) {
  switch (f.kind) {
    case 'tripod': tripod(ctx, P, v, f, o.selected); break
    case 'stand': standBack(ctx, P, v, f, o.selected, o.held); break
    case 'testTubeRack': rackBack(ctx, P, v, f, o.selected); break
    case 'alcoholBurner': alcoholLamp(ctx, P, v, f, o.selected); break
    case 'blastBurner': blastBurner(ctx, P, v, f, o.selected); break
    case 'hotPlate': hotPlate(ctx, P, v, f, o.selected, o.hot); break
    case 'waterBath': case 'iceBath': bathBack(ctx, P, v, f); break
    case 'pneumaticTrough': troughBack(ctx, P, v, f); break
  }
}

export function drawFixtureFront(ctx: CanvasRenderingContext2D, P: ChemPalette, v: RigView, f: Fixture, o: { selected: boolean; held: Held | null; font: string }) {
  switch (f.kind) {
    case 'stand': standFront(ctx, P, v, f, o.held); break
    case 'testTubeRack': rackFront(ctx, P, v, f, o.selected); break
    case 'waterBath': case 'iceBath': bathFront(ctx, P, v, f, o.selected, o.font); break
    case 'pneumaticTrough': troughFront(ctx, P, v, f, o.selected); break
  }
}

/** Where a lit burner's flame stands (screen), and its size in px, for the flame drawing. */
export function flameAt(v: RigView, f: Fixture): { x: number; y: number; size: number; blast: boolean } | null {
  const fl = flameOf(f)
  if (!fl || !f.lit) return null
  // the drawn flame is as tall as the flame's reach (the soft flame's height is 2.3 sizes, the blast flame's 3.1)
  return { x: v.sx(fl.x), y: v.sy(fl.wick), size: (fl.reach / (f.kind === 'blastBurner' ? 3.1 : 2.3)) * v.ppc * 0.95, blast: f.kind === 'blastBurner' }
}

/** Where the boss head of a stand's clamp or ring is (bench cm): the handle that moves it. */
export function handlesOf(f: Fixture): Array<{ what: 'clamp' | 'ring'; x: number; y: number }> {
  if (f.kind !== 'stand') return []
  const out: Array<{ what: 'clamp' | 'ring'; x: number; y: number }> = []
  if (typeof f.clamp === 'number') out.push({ what: 'clamp', x: f.x, y: f.y + f.clamp })
  if (typeof f.ring === 'number') out.push({ what: 'ring', x: f.x, y: f.y + f.ring })
  return out
}

/** What a reagent bottle shows: the colour of its contents (the core's, or the catalogue's for a solid) and its label. */
export interface BottleLook { colour: readonly [number, number, number] | null; solid: string | null; name: string; label: string }

/** A line of text fitted into a width: smaller type down to `min` px, then cut with an ellipsis (the full name is in the inspector). */
function fitText(ctx: CanvasRenderingContext2D, text: string, width: number, size: number, min: number, weight: number, font: string): number {
  let s = size
  ctx.font = `${weight} ${s}px ${font}`
  while (s > min && ctx.measureText(text).width > width) { s -= 0.5; ctx.font = `${weight} ${s}px ${font}` }
  return s
}
function cut(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > width) t = t.slice(0, -1)
  return `${t}…`
}

/**
 * A reagent bottle of the shelf on the bench (D297 item 6): the narrow or wide bottle's profile with its contents, a
 * ground-glass stopper (laid upside down beside the bottle when it is off) or a dropper, and its label. `body` draws the
 * glass and the contents (the scene's own functions, so a bottle is glassware like any other).
 */
export function drawBottle(ctx: CanvasRenderingContext2D, P: ChemPalette, v: RigView & { font: string }, f: Fixture, look: BottleLook, o: { selected: boolean; top: number; neck: number; rMax: number; body: () => void }) {
  const x = f.x, y = f.y
  ctx.save()
  o.body()
  const sx = (dx: number) => v.sx(x + dx), sy = (h: number) => v.sy(y + h)
  ctx.lineJoin = 'round'
  ctx.strokeStyle = P.ink2
  ctx.lineWidth = STROKE * v.line * 0.9
  // the stopper, or the dropper
  if (f.style === 'dropper' && f.open) {
    // its dropper is in the hand: the open neck
    ctx.fillStyle = P.ink2
    round(ctx, sx(-o.neck - 0.15), sy(o.top + 0.5), (o.neck + 0.15) * 2 * v.ppc, 0.75 * v.ppc, 0.15 * v.ppc); ctx.fill()
  } else if (f.style === 'dropper') {
    ctx.fillStyle = P.glassBody
    ctx.beginPath(); ctx.rect(sx(-0.22), sy(o.top + 0.3), 0.44 * v.ppc, (o.top * 0.6 + 0.3) * v.ppc); ctx.fill(); ctx.stroke()
    ctx.fillStyle = P.ink2
    round(ctx, sx(-o.neck - 0.15), sy(o.top + 0.5), (o.neck + 0.15) * 2 * v.ppc, 0.75 * v.ppc, 0.15 * v.ppc); ctx.fill()
    ctx.fillStyle = P.rubber
    ctx.beginPath(); ctx.ellipse(sx(0), sy(o.top + 1.7), 0.62 * v.ppc, 1.05 * v.ppc, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  } else {
    const stopper = (cx: number, base: number, up: 1 | -1) => {
      // a ground plug in the neck and a flat head: drawn head up in the bottle, head down beside it
      const w = o.neck * 0.92, head = f.style === 'wide' ? o.neck * 1.15 : o.neck * 1.45
      const pts: Array<[number, number]> = [[-w, 0], [-w * 0.86, 1.0], [-head, 1.15], [-head, 1.55], [head, 1.55], [head, 1.15], [w * 0.86, 1.0], [w, 0]]
      ctx.beginPath()
      pts.forEach(([dx, dh], i) => { const px = v.sx(x + cx + dx), py = v.sy(y + base + up * dh); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py) })
      ctx.closePath()
      ctx.fillStyle = P.glassBody; ctx.fill(); ctx.stroke()
    }
    if (f.open) stopper(o.rMax + 2.0, 1.55, -1)
    else stopper(0, o.top - 1.0, 1)
  }
  // the label: white, across the body, the name over the concentration
  const lw = o.rMax * 1.62, lh = Math.min(o.top * 0.34, 3.6)
  const ly = o.top * (f.style === 'dropper' ? 0.18 : 0.2)
  ctx.fillStyle = P.label
  ctx.strokeStyle = P.ink3
  ctx.lineWidth = 0.75
  round(ctx, sx(-lw / 2), sy(ly + lh), lw * v.ppc, lh * v.ppc, 0.15 * v.ppc); ctx.fill(); ctx.stroke()
  ctx.fillStyle = P.labelInk
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const width = lw * v.ppc - 6
  const big = Math.max(9, Math.min(13, lh * v.ppc * 0.3)) * Math.min(1.25, v.line)
  // the name on one line, or broken in two at a space or after a hyphen (German compounds), the concentration below
  let lines = [look.name]
  ctx.font = `600 ${big}px ${v.font}`
  if (ctx.measureText(look.name).width > width) {
    // break points: a space, after a hyphen, or (a German compound without either) before one of its common last words
    const cuts: Array<{ at: number; dash: boolean }> = []
    for (let i = 1; i < look.name.length; i++) if (look.name[i - 1] === '-' || look.name[i] === ' ' || look.name[i] === '（' || look.name[i] === '(') cuts.push({ at: i, dash: false })
    if (!cuts.length) {
      const m = /(lösung|wasser|säure|lauge|pulver|granalien|späne|draht|blech|band|stab)$/i.exec(look.name)
      if (m && m.index > 2) cuts.push({ at: m.index, dash: true })
    }
    let best: string[] | null = null, bw = Infinity
    for (const c of cuts) { const pair = [look.name.slice(0, c.at).trim() + (c.dash ? '-' : ''), look.name.slice(c.at).trim()]; const w = Math.max(...pair.map(t => ctx.measureText(t).width)); if (w < bw) { bw = w; best = pair } }
    if (best) lines = best
  }
  const rows = lines.length + (look.label ? 1 : 0)
  const room = lh * v.ppc
  let size = Math.min(big, (room - 4) / (rows * 1.15))
  ctx.font = `600 ${size}px ${v.font}`
  while (size > 8 && lines.some(t => ctx.measureText(t).width > width)) { size -= 0.5; ctx.font = `600 ${size}px ${v.font}` }
  const step = size * 1.15, mid = sy(ly + lh / 2), first = mid - ((rows - 1) * step) / 2
  lines.forEach((t, i) => ctx.fillText(cut(ctx, t, width), sx(0), first + i * step))
  if (look.label) {
    fitText(ctx, look.label, width, size * 0.9, 8, 500, v.font)
    ctx.fillText(cut(ctx, look.label, width), sx(0), first + lines.length * step)
  }
  if (o.selected) {
    ctx.strokeStyle = P.accent
    ctx.lineWidth = Math.max(1.5, STROKE * v.line)
    ctx.setLineDash([4, 3])
    round(ctx, sx(-o.rMax - 0.6), sy(o.top + (f.style === 'dropper' ? 3 : 1.4)), (o.rMax + 0.6) * 2 * v.ppc, (o.top + (f.style === 'dropper' ? 3 : 1.4) + 0.3) * v.ppc, 0.4 * v.ppc)
    ctx.stroke()
    ctx.setLineDash([])
  }
  ctx.restore()
}
