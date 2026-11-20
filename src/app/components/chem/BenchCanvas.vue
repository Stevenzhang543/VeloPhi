<script setup lang="ts">
/**
 * The bench surface (26.64, D268; 26.65, D297): the stage of the chemistry panel. It draws what the core holds
 * (src/render/chem) and turns gestures into actions of the log:
 *
 * - drag a vessel anywhere: let go and it comes to rest on what is under it — the bench, a tripod's gauze, a hot
 *   plate, a bath, a slot of a rack, a stand's ring — or in a stand's clamp it is brought to; the place it would take
 *   is marked while it is carried. Over another vessel's mouth it tips and pours while it is held, the amount shown
 *   beside the stream; letting go is one pour (a quick drop, or a drop on the vessel's body, asks for the amount).
 *   A burette or separating funnel dropped on a vessel is clamped over it and delivers into it;
 * - drag a fixture (a stand, a tripod, a burner, a rack, a bath) along the bench, with what it holds; drag the boss of
 *   a stand's clamp or ring up and down; tap a burner or a hot plate to work it (an alcohol lamp: cap off, light, cap
 *   on); geometry that decides chemistry — a lit burner under a vessel, a vessel in a bath — becomes actions of the log
 *   when the hand lets go (src/chem/bench.ts, `gesture`);
 * - drag the empty bench to pan, wheel or pinch to zoom; double-click the bench to fit;
 * - tap a vessel to select it; with something being carried (a reagent, an instrument, a transfer) the tap puts it
 *   there — the way of working on a phone, where nothing is dragged; double-click a vessel to pour into it from the
 *   one selected before, with an exact amount;
 * - keys: ← → choose a vessel or fixture, Shift + ← → move it, Shift + ↑ ↓ lift a vessel to the next support up or
 *   down (on a stand: its clamp), Enter opens a vessel's actions or works a fixture, Delete removes it (undo brings
 *   it back), Escape puts down what is being carried.
 *
 * Mouse and touch share one path (Pointer Events). Notes about what happened and the “未建模” mark are small
 * elements over the canvas, so they take the interface's type and can be read by a screen reader; they are placed so
 * that they do not cover one another.
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { tl, activeLang } from '../../../i18n'
import { usePageActive } from '../../live'
import { useLabCanvas } from '../../lab/canvas'
import { calmMotion, settings, sysEnv } from '../../settings'
import { showToast } from '../../store'
import { useBench } from '../../../chem/bench'
import { kindName, kindOf } from '../../../chem/apparatus'
import { catalogue, speciesColour, speciesTexture, substanceOf } from '../../../chem/catalog'
import { isApproxNote, markLabel, phenomenonText } from '../../../chem/benchText'
import { chemPalette, rgb } from '../../../render/chem/palette'
import { Effects, Phenomena, benchExtent, bottomOf, drawBench, layoutBench, mouthOf, pourLip, tubeEndAt, vesselAt } from '../../../render/chem/scene'
import type { Placed, PourView, View, Zone } from '../../../render/chem/scene'
import { handlesOf } from '../../../render/chem/rigdraw'
import { levelOf } from '../../../chem/apparatus'
import { DropMeter, PourMeter, SOLID_RATE, TIP_S, addAmount, inMouthZone, mouthZone, pourAmount } from '../../../chem/pouring'
import { RIG, bottleShapeKind, fixtureBox, isBurner, spotsFor } from '../../../chem/rig'
import { chemColour, chemEquilibrium, chemSpecies } from '../../../engine/chem'
import { reagentName, reagentOf } from '../../../chem/catalog'
import type { BottleLook } from '../../../render/chem/rigdraw'
import type { Fixture, Spot } from '../../../chem/rig'
import { qty } from '../../../chem/format'
import { benchUi, dropOn, flameTest, ruleNote } from './benchUi'
import { dropInto, hand, handTap, stirring } from './hand'
import Icon from '../Icon.vue'

const emit = defineEmits<{ (e: 'inspect'): void }>()

const bench = useBench()
const pageActive = usePageActive()
const fxs = new Effects()
/** The particles of the phenomena the core reports (D297 item 2). */
const phen = new Phenomena()

/** The view: bench x at the middle of the canvas, pixels per cm, and a vertical shift (cm). */
const cam = reactive({ x: 0, y: 0, ppc: 14, manual: false })
const size = reactive({ w: 0, h: 0 })
/**
 * Something being carried: a vessel (its offset from where it stands, cm; the vessel it would be dropped on; the
 * place it would come to rest; while held over another vessel's mouth, the pour being chosen), a fixture (its offset
 * along the bench), or the boss of a stand's clamp or ring (its new height).
 */
interface Drag {
  what: 'vessel' | 'fixture' | 'handle' | 'tubeEnd'
  id: string
  handle?: 'clamp' | 'ring'
  /** The end of a tube being carried. */
  end?: 'a' | 'b'
  /** Where it was: x and bottom of a vessel, x of a fixture, the height of a clamp or ring. */
  x0: number; y0: number
  dx: number; dy: number; moved: boolean; over: string | null
  pourTo: string | null; meter: PourMeter | null; tip: number; fine: boolean; fromLeft: boolean
  spot: Spot | null
  /** A stock bottle being carried (D297 item 6): its reagent, what flows from it, the drops of a dropper. */
  bottle?: { reagent: string; unit: 'mL' | 'g' | 'drop'; drops: DropMeter | null; warned: boolean }
}
const dragging = ref<Drag | null>(null)
/** The amount of the pour being held, beside its stream. */
const pourLabel = ref<{ text: string; left: string; top: string } | null>(null)
const stats = { frames: 0, totalMs: 0, maxMs: 0 }
let zones: Zone[] = []
let placedNow: Placed[] = []

const placed = computed<Placed[]>(() => {
  void bench.revision.value
  const s = bench.state.value
  return s ? layoutBench(s, bench.objects.value) : []
})
const fixtures = computed<Fixture[]>(() => { void bench.revision.value; return bench.fixtures.value })

/** The bench top sits low in the stage: most of the room is above it, where things stand. */
const BENCH_AT = 0.84
const view = computed<View>(() => ({ ox: size.w / 2 - cam.x * cam.ppc, oy: Math.round(size.h * BENCH_AT) + cam.y * cam.ppc, ppc: cam.ppc }))

/** Show everything on the bench, as large as it fits (a single beaker is not blown up beyond a calm size). */
function fit() {
  if (!size.w || !size.h) return
  const e = benchExtent(placed.value, fixtures.value)
  const room = size.h * BENCH_AT - 56
  // on a narrow screen the glass is kept large enough to work with (about three fifths of the height): the bench is
  // panned instead
  const narrow = size.w < 600
  cam.ppc = narrow
    ? Math.max(9, Math.min(16, (room / Math.max(16, e.y1)) * 0.6))
    : Math.max(5, Math.min(24, (size.w - 40) / Math.max(24, e.x1 - e.x0), room / Math.max(16, e.y1)))
  const wide = (e.x1 - e.x0) * cam.ppc > size.w - 40
  // what does not fit: the left end shows (the first thing put down), the rest is reached by panning
  cam.x = wide ? e.x0 + (size.w / 2 - 20) / cam.ppc : (e.x0 + e.x1) / 2
  cam.y = 0
  cam.manual = false
}

/** A press of a loaded dropper over a vessel: the drops it lets fall while held (one action when let go). */
let handDrops: { to: string; meter: DropMeter } | null = null

/** The tool in the hand as the scene draws it: at the pointer, or at the mouth of the vessel under it. */
function handView(list: Placed[]) {
  if (!hand.tool || !hand.over) return null
  const mouth = hand.tool === 'glassRod' ? null : pourTargetAt(list, hand.x, hand.y) ?? (handDrops ? list.find(p => p.id === handDrops!.to) ?? null : null)
  const x = mouth ? mouth.x : hand.x, y = mouth ? mouth.mouth + 1.2 : hand.y
  const floor = mouth ? mouth.base + levelOf(mouth.shape, Math.max(0, mouth.v.volume_mL)) : 0
  const l = hand.load
  const look = l?.from === 'bottle' && l.reagent ? bottleLook(l.reagent) : null
  return { tool: hand.tool, x, y, loaded: !!l, liquid: l?.from === 'vessel' ? l.colour ?? null : look?.colour ?? null, solid: l?.solid ? rgb(l.solid) : look?.solid ?? null, squeezed: !!handDrops && handDrops.meter.drops > 0, floor, flare: !!hand.splint && hand.splint.relit && hand.splint.until > Date.now() }
}

const calm = () => calmMotion()
const moving = () => {
  if (!pageActive.value || sysEnv.hidden) return false
  if (dragging.value || benchUi.carry?.dragging || hand.tool) return true
  if (calm()) return false
  if (fxs.busy() || phen.busy() || bench.effectsBusy() || (bench.running.value && bench.activity.size > 0)) return true
  for (const v of bench.vessels.value) if (v.heater > 0 || v.ignited) return true
  for (const f of fixtures.value) if (isBurner(f.kind) && f.lit) return true
  if (Object.keys(benchUi.flames).length) return true
  for (const c of bench.circuits.value) if (c.on && c.connected && Math.abs(c.I) > 1e-9 && bench.running.value) return true
  return false
}

const solidInfo = (id: string) => {
  const c = speciesColour(id)
  return { colour: c ? rgb(c) : null, texture: speciesTexture(id), rho: substanceOf(id)?.rho ?? null }
}
const GAS = /^(H2|O2|Cl2|N2|NO|NO2|CO2|SO2|Br2|F2)(\(g\))?$/
/** Does a couple give a gas on the side that forms there: the reduced side at the cathode, the oxidised at the anode? */
function gasAt(couple: string | null, side: 'cathode' | 'anode'): boolean {
  if (!couple) return false
  const c = catalogue.value?.couples?.find(k => k.id === couple)
  const ids = c ? Object.keys(side === 'cathode' ? c.red : c.ox) : [couple.split('/')[side === 'cathode' ? 1 : 0] ?? '']
  return ids.some(id => GAS.test(id))
}

/** The drawing as it is while something is carried: the carried thing, and what it holds, moved. */
function carriedScene(): { list: Placed[]; rig: Fixture[] } {
  let list = placed.value
  let rig = fixtures.value
  const d = dragging.value
  if (!d?.moved) return { list, rig }
  const shift = (p: Placed, dx: number, dy: number) => ({ ...p, x: p.x + dx, left: p.left + dx, right: p.right + dx, base: p.base + dy, top: p.top + dy, mouth: p.mouth + dy })
  if (d.what === 'vessel') list = list.map(p => (p.id === d.id ? shift(p, d.dx, d.dy) : p))
  else if (d.what === 'tubeEnd') rig = rig.map(f => (f.id === d.id ? { ...f, [d.end!]: { x: d.x0 + d.dx, y: d.y0 + d.dy, vessel: null, at: null } } : f))
  else if (d.what === 'fixture') {
    list = list.map(p => (p.e.on === d.id ? shift(p, d.dx, 0) : p))
    // a dropper bottle stays where it stands: its dropper is what the hand carries
    if (d.bottle?.unit !== 'drop') rig = rig.map(f => (f.id === d.id ? { ...f, x: f.x + d.dx, y: f.y + (d.bottle ? d.dy : 0) } : f))
  } else {
    const h = handleHeight(d)
    const f = rig.find(x => x.id === d.id)
    const was = d.handle === 'clamp' ? f?.clamp : f?.ring
    const dy = typeof was === 'number' ? h - was : 0
    list = list.map(p => (p.e.on === d.id && p.e.at === d.handle ? shift(p, 0, dy) : p))
    rig = rig.map(x => (x.id === d.id ? { ...x, [d.handle!]: h } : x))
  }
  return { list, rig }
}

const { canvas, wrap, redraw, at } = useLabCanvas(() => pageActive.value, (ctx, w, h, dt) => {
  if (w !== size.w || h !== size.h) { size.w = w; size.h = h; if (!cam.manual) fit() }
  const s = bench.state.value
  const P = chemPalette()
  ctx.fillStyle = P.bg
  ctx.fillRect(0, 0, w, h)
  if (!s) return
  const t0 = performance.now()
  const still = calm()
  fxs.step(still ? 0 : dt)
  phen.step(still ? 0 : dt)
  const { list, rig } = carriedScene()
  const d = dragging.value
  placedNow = list
  fxs.keep(new Set(list.map(p => p.id)))
  phen.keep(new Set(list.map(p => p.id)))
  const nowS = performance.now() / 1000
  // a pour being held: the time over the mouth becomes the amount (wall time, also under reduced motion)
  let pour: PourView | null = null
  if (d?.meter || d?.bottle?.drops) {
    const drops = d.bottle?.drops ? d.bottle.drops.step(d.pourTo, dt) : 0
    const ml = d.meter ? d.meter.step(d.pourTo, dt, d.fine) : drops
    d.tip = still ? (d.pourTo ? 1 : 0) : Math.max(0, Math.min(1, d.tip + (d.pourTo ? 1 : -1) * dt / TIP_S))
    if (d.pourTo) {
      const rate = d.meter ? d.meter.rate(d.meter.held, d.fine) : drops > 0 ? 1 : 0
      const f = d.bottle ? rig.find(x => x.id === d.id) : undefined
      pour = { from: d.id, to: d.pourTo, mL: ml, tip: d.tip, rate, fromLeft: d.fromLeft, time: fxs.time, bottle: f ? { f, look: bottleLook(f.reagent ?? '') } : null, unit: d.bottle?.unit ?? 'mL' }
      const to = list.find(p => p.id === d.pourTo)
      if (to) {
        const lip = pourLip(to, d.fromLeft)
        const v = view.value
        const unit = d.bottle?.unit ?? 'mL'
        const text = unit === 'drop' ? (drops === 1 ? tl('1 滴') : tl('{0} 滴', [drops])) : unit === 'g' ? qty(ml, 'g', 1) : d.meter && !d.bottle && d.meter.all ? tl('全部 {0}', [qty(ml, 'mL', 1)]) : qty(ml, 'mL', 1)
        pourLabel.value = { text, left: `${v.ox + (lip.x - lip.side * 2.2) * v.ppc}px`, top: `${v.oy - (lip.y + (unit === 'drop' ? 7.5 : 2.6)) * v.ppc}px` }
      }
    } else pourLabel.value = null
  }
  zones = drawBench(ctx, P, view.value, {
    state: s, placed: list, selected: bench.selected.value, target: d?.over ?? hover.value, activity: bench.activity, name: bench.vesselName, solid: solidInfo, layers: () => null, gasAt, flameOf: id => benchUi.flames[id]?.colour ?? null,
    litmus: st => (st === 'red' ? tl('变红') : st === 'blue' ? tl('变蓝') : tl('不变色')), dt: still ? 0 : dt, calm: still, line: settings.projector ? 1.4 : 1, width: w, height: h, pour,
    effectsOf: v => bench.effectsOf(v).map(e => ({ key: e.key, strength: e.strength, age: nowS - e.since, life: e.until - e.since, colour: e.colour, flame: e.flame, reactant: e.reactant, product: e.product })), phen,
    fixtures: rig, selectedFixture: bench.selectedFixture.value, spot: d?.what === 'vessel' && !d.pourTo && !d.over ? d.spot : null, bottleLook,
    dropper: d?.bottle?.unit === 'drop' ? { bottle: d.id, at: d.pourTo ? null : dropperAt(d) } : null,
    hand: handView(list), stirring, tubed: bench.tubed()
  }, fxs)
  if (handDrops) {
    const n = handDrops.meter.step(handDrops.to, dt)
    const to = list.find(p => p.id === handDrops!.to)
    if (to) pourLabel.value = { text: n <= 1 ? tl('1 滴') : tl('{0} 滴', [n]), left: `${view.value.ox + (to.x + 2.2) * view.value.ppc}px`, top: `${view.value.oy - (to.mouth + 7.5) * view.value.ppc}px` }
  }
  const ms = performance.now() - t0
  stats.frames++; stats.totalMs += ms; stats.maxMs = Math.max(stats.maxMs, ms)
}, moving)

watch(() => [bench.revision.value, bench.selected.value, bench.selectedFixture.value, cam.x, cam.y, cam.ppc, activeLang(), settings.projector, benchUi.carry?.dragging, calm(), benchUi.flames], redraw)
// what stands on the bench changed: show all of it again, unless the user chose a view
watch(() => bench.vessels.value.length + fixtures.value.length * 1000, (_n, old) => { if (!cam.manual || !old) fit(); redraw() })
watch(() => benchUi.transfer.n, () => {
  const t = benchUi.transfer
  const to = placed.value.find(p => p.id === t.to)
  if (!to || to.flip) return
  const from = t.from ? placed.value.find(p => p.id === t.from) : null
  const top = from && from.e.above === to.id ? from.base - 2.6 : to.mouth + 5
  fxs.pour(to.x, top, to.base + levelOf(to.shape, to.v.volume_mL), chemPalette().water, t.drops)
  redraw()
})

// ---- from the window to the bench ----

const toBench = (px: number, py: number) => ({ x: (px - view.value.ox) / view.value.ppc, y: (view.value.oy - py) / view.value.ppc })
const hover = ref<string | null>(null)

/** The fixture under a bench point (the last drawn first), by its outline's box. */
function fixtureAt(x: number, y: number): Fixture | null {
  const list = fixtures.value
  for (let i = list.length - 1; i >= 0; i--) {
    const f = list[i], b = fixtureBox(f)
    if (f.kind === 'stand') {
      // a stand is its rod and its base (and the arms): the rest of its box is air
      const onRod = Math.abs(x - f.x) <= 0.8 && y >= f.y && y <= b.y1
      const onBase = x >= b.x0 && x <= b.x1 && y >= f.y - 0.3 && y <= f.y + 1.5
      if (onRod || onBase) return f
      continue
    }
    if (x >= b.x0 - 0.3 && x <= b.x1 + 0.3 && y >= b.y0 - 0.3 && y <= b.y1 + 0.3) return f
  }
  return null
}

/** The end of a delivery tube under a bench point (free ends, and the ends of the selected tube). */
function tubeEndUnder(x: number, y: number): { id: string; which: 'a' | 'b'; x: number; y: number } | null {
  const byId = new Map(placedNow.map(p => [p.id, p]))
  for (const f of fixtures.value) {
    if (f.kind !== 'tube') continue
    for (const which of ['b', 'a'] as const) {
      const e = tubeEndAt(f[which], byId)
      if (f[which]?.vessel && bench.selectedFixture.value !== f.id && which === 'a') continue
      if (Math.hypot(x - e.x, y - e.y) <= 1.0) return { id: f.id, which, x: e.x, y: e.y }
    }
  }
  return null
}

/** The boss of a stand's clamp or ring under a bench point. */
function handleAt(x: number, y: number): { id: string; what: 'clamp' | 'ring'; h: number } | null {
  for (const f of fixtures.value) for (const hd of handlesOf(f)) if (Math.abs(x - hd.x) <= 1.1 && Math.abs(y - hd.y) <= 0.9) return { id: f.id, what: hd.what, h: hd.what === 'clamp' ? f.clamp! : f.ring! }
  return null
}

/** The vessel under a point of the window (shelf drags are followed by the page, which asks here). */
function hitClient(clientX: number, clientY: number): { vessel: string | null; at: { x: number; y: number }; inside: boolean } {
  const r = canvas.value?.getBoundingClientRect()
  if (!r) return { vessel: null, at: { x: 0, y: 0 }, inside: false }
  const p = toBench(clientX - r.left, clientY - r.top)
  return { vessel: vesselAt(placedNow, p.x, p.y)?.id ?? null, at: p, inside: clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom }
}
/** Where a vessel is in the window (client px): its axis, its mouth and its middle — for the interface tests. */
function where(id: string): { x: number; mouthY: number; midY: number; baseY: number; half: number } | null {
  const p = placed.value.find(q => q.id === id)
  const r = canvas.value?.getBoundingClientRect()
  if (!p || !r) return null
  const v = view.value
  return { x: r.left + v.ox + p.x * v.ppc, mouthY: r.top + v.oy - p.mouth * v.ppc, midY: r.top + v.oy - (p.base + p.shape.top / 2) * v.ppc, baseY: r.top + v.oy - p.base * v.ppc, half: (p.right - p.x) * v.ppc }
}
/** Where a point of the bench is in the window (client px), for the interface tests. */
function screenOf(x: number, y: number): { x: number; y: number } | null {
  const r = canvas.value?.getBoundingClientRect()
  if (!r) return null
  return { x: r.left + view.value.ox + x * view.value.ppc, y: r.top + view.value.oy - y * view.value.ppc }
}
/** The bench as drawn now, as a PNG (the canvas's own pixels). */
function snapshot(): Promise<Uint8Array | null> {
  const c = canvas.value
  if (!c) return Promise.resolve(null)
  redraw()
  return new Promise(res => c.toBlob(b => { if (!b) { res(null); return } void b.arrayBuffer().then(a => res(new Uint8Array(a))) }, 'image/png'))
}
defineExpose({ hitClient, setHover: (id: string | null) => { if (hover.value !== id) { hover.value = id; redraw() } }, fit, stats, where, screenOf, snapshot })

// ---- pointers ----

const pointers = new Map<number, { x: number; y: number }>()
let down: { id: number; x: number; y: number; vessel: string | null; fixture: string | null; handle: { id: string; what: 'clamp' | 'ring'; h: number } | null; zone: Zone | null; pan: boolean; camX: number; camY: number; tubeEnd?: { id: string; which: 'a' | 'b'; x: number; y: number } | null } | null = null
let pinch: { d: number; ppc: number } | null = null

function zoneAt(x: number, y: number): Zone | null {
  for (let i = zones.length - 1; i >= 0; i--) { const z = zones[i]; if (x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1) return z }
  return null
}

function onDown(e: PointerEvent) {
  if (e.button > 0 && e.pointerType === 'mouse') return
  wrap.value?.focus({ preventScroll: true })
  const [px, py] = at(e)
  pointers.set(e.pointerId, { x: px, y: py })
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  benchUi.menu = null; benchUi.chooser = null
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), ppc: cam.ppc }
    down = null; dragging.value = null
    return
  }
  const p = toBench(px, py)
  if (hand.tool === 'dropper' && hand.load) {
    const t = pourTargetAt(placedNow, p.x, p.y) ?? vesselAt(placedNow, p.x, p.y)
    if (t && !(hand.load.from === 'vessel' && hand.load.id === t.id)) { handDrops = { to: t.id, meter: new DropMeter() }; down = { id: e.pointerId, x: px, y: py, vessel: t.id, fixture: null, handle: null, zone: null, pan: false, camX: cam.x, camY: cam.y }; return }
  }
  const tubeEnd = tubeEndUnder(p.x, p.y)
  if (tubeEnd) { down = { id: e.pointerId, x: px, y: py, vessel: null, fixture: tubeEnd.id, handle: null, zone: null, pan: false, camX: cam.x, camY: cam.y, tubeEnd }; return }
  const handle = handleAt(p.x, p.y)
  const zone = handle ? null : zoneAt(p.x, p.y)
  const hit = handle || zone ? null : vesselAt(placedNow, p.x, p.y)
  const fx = handle || zone || hit ? null : fixtureAt(p.x, p.y)
  down = { id: e.pointerId, x: px, y: py, vessel: hit?.id ?? null, fixture: fx?.id ?? null, handle, zone, pan: !hit && !zone && !fx && !handle, camX: cam.x, camY: cam.y }
}

/** The height a clamp or ring is dragged to, within the rod. */
function handleHeight(d: Drag): number {
  const min = d.handle === 'clamp' ? RIG.stand.clampMin : RIG.stand.ringMin, max = d.handle === 'clamp' ? RIG.stand.clampMax : RIG.stand.ringMax
  return Math.round(Math.max(min, Math.min(max, d.y0 + d.dy)) * 10) / 10
}

function onMove(e: PointerEvent) {
  const [px, py] = at(e)
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: px, y: py })
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    cam.ppc = Math.max(4, Math.min(48, pinch.ppc * (Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch.d))))
    cam.manual = true
    return
  }
  if (hand.tool) { const p = toBench(px, py); hand.x = p.x; hand.y = p.y; hand.over = true; redraw() }
  if (!down || down.id !== e.pointerId) {
    if (e.pointerType === 'mouse' && wrap.value) {
      const p = toBench(px, py)
      wrap.value.style.cursor = handleAt(p.x, p.y) ? 'ns-resize' : zoneAt(p.x, p.y) ? 'pointer' : vesselAt(placedNow, p.x, p.y) ? (benchUi.carry ? 'copy' : 'grab') : fixtureAt(p.x, p.y) ? 'grab' : ''
    }
    return
  }
  const dx = px - down.x, dy = py - down.y
  if (down.pan) {
    if (Math.hypot(dx, dy) > 4) { cam.x = down.camX - dx / cam.ppc; cam.y = down.camY + dy / cam.ppc; cam.manual = true }
    return
  }
  // a tube's end can be dragged while its tap path waits for the target (it is the same choice)
  if ((benchUi.carry && !down.tubeEnd) || hand.tool) return
  if (!dragging.value && Math.hypot(dx, dy) > 6) {
    if (down.tubeEnd) {
      benchUi.carry = null
      bench.selectFixture(down.tubeEnd.id)
      dragging.value = { what: 'tubeEnd', id: down.tubeEnd.id, end: down.tubeEnd.which, x0: down.tubeEnd.x, y0: down.tubeEnd.y, dx: 0, dy: 0, moved: true, over: null, pourTo: null, meter: null, tip: 0, fine: false, fromLeft: true, spot: null }
    } else if (down.vessel) {
      bench.select(down.vessel)
      const v = bench.vesselOf(down.vessel)
      const p0 = placed.value.find(q => q.id === down!.vessel)
      const meter = v && canPourFrom(down.vessel) ? new PourMeter(v.capacity_mL, v.volume_mL) : null
      dragging.value = { what: 'vessel', id: down.vessel, x0: bench.extras(down.vessel).x, y0: p0 ? bottomOf(p0) : 0, dx: 0, dy: 0, moved: true, over: null, pourTo: null, meter, tip: 0, fine: false, fromLeft: true, spot: null }
    } else if (down.handle) {
      bench.selectFixture(down.handle.id)
      dragging.value = { what: 'handle', id: down.handle.id, handle: down.handle.what, x0: 0, y0: down.handle.h, dx: 0, dy: 0, moved: true, over: null, pourTo: null, meter: null, tip: 0, fine: false, fromLeft: true, spot: null }
    } else if (down.fixture) {
      const f = bench.fixtureOf(down.fixture)
      bench.selectFixture(down.fixture)
      if (f && f.kind === 'alcoholBurner' && f.lit) ruleNote(tl('规则：不要移动燃着的酒精灯'))
      const r = f?.kind === 'reagentBottle' ? reagentOf(f.reagent ?? '') : undefined
      const unit: 'mL' | 'g' | 'drop' = f?.style === 'dropper' ? 'drop' : r?.kind === 'solid' ? 'g' : 'mL'
      const cap = bottleShapeKind(f?.style).capacity_mL
      const meter = f?.kind !== 'reagentBottle' || unit === 'drop' ? null : new PourMeter(cap, Infinity, unit === 'g' ? SOLID_RATE : undefined)
      dragging.value = { what: 'fixture', id: down.fixture, x0: f?.x ?? 0, y0: 0, dx: 0, dy: 0, moved: true, over: null, pourTo: null, meter, tip: 0, fine: false, fromLeft: true, spot: null, bottle: f?.kind === 'reagentBottle' ? { reagent: f.reagent ?? '', unit, drops: unit === 'drop' ? new DropMeter() : null, warned: false } : undefined }
    }
  }
  const d = dragging.value
  if (!d) return
  d.dx = dx / cam.ppc
  d.dy = -dy / cam.ppc
  d.fine = e.shiftKey
  if (d.bottle) { bottleOver(d, toBench(px, py)); redraw(); return }
  if (d.what !== 'vessel') { redraw(); return }
  const p = toBench(px, py)
  const others = placed.value.filter(q => q.id !== d.id)
  // over a mouth: pour there (the source tips at it); over a vessel's body: drop on it; else: the place it would take
  const mouth = d.meter ? pourTargetAt(others, p.x, p.y) : null
  const src = placed.value.find(q => q.id === d.id)
  d.pourTo = mouth?.id ?? null
  if (mouth && src) d.fromLeft = src.x <= mouth.x
  const over = mouth ?? vesselAt(others, p.x, p.y, 0.2)
  d.over = over && over.e.above !== d.id ? over.id : null
  d.spot = d.over ? null : bench.spotFor(d.id, d.x0 + d.dx, d.y0 + d.dy)
  if (!d.pourTo) pourLabel.value = null
  redraw()
}

/** A stock bottle carried over the bench: over a mouth it pours (a stoppered one first has to be opened — the rule is said). */
function bottleOver(d: Drag, p: { x: number; y: number }) {
  const f = bench.fixtureOf(d.id)
  const b = d.bottle!
  const mouth = pourTargetAt(placed.value, p.x, p.y)
  if (mouth && f && f.style !== 'dropper' && !f.open) {
    if (!b.warned) { ruleNote(tl('规则：先取下瓶塞，倒放在桌面上')); b.warned = true }
    d.pourTo = null
  } else {
    if (mouth && mouth.id !== d.pourTo && d.meter) { const v = bench.vesselOf(mouth.id); d.meter.available_mL = v ? Math.max(0, bench.limitOf(v) - v.volume_mL) : 0; if (b.unit === 'g') d.meter.available_mL = Infinity }
    d.pourTo = mouth?.id ?? null
    if (mouth && f) d.fromLeft = f.x <= mouth.x
  }
  d.over = d.pourTo
  if (!d.pourTo) pourLabel.value = null
}

/** Where the dropper of a dropper bottle is carried (bench cm): above the bottle, moved by the hand. */
function dropperAt(d: Drag): { x: number; y: number } | null {
  const f = bench.fixtureOf(d.id)
  if (!f) return null
  return { x: f.x + d.dx, y: f.y + 9 + d.dy }
}

/** What a stock bottle shows: the core's colour of the solution in it (its recipe brought to equilibrium by the core), the catalogue's colour of a solid; its label. */
const looks = new Map<string, BottleLook>()
function bottleLook(reagent: string): BottleLook {
  const key = `${activeLang()}|${reagent}`
  const hit = looks.get(key)
  if (hit) return hit
  const r = reagentOf(reagent)
  let colour: BottleLook['colour'] = null, solid: string | null = null
  const ids = Object.keys(r?.recipe?.species ?? {})
  // a white solid would vanish in its bottle on a white bench: it is drawn in the neutral tone of solids
  if (r?.kind === 'solid') { const c = ids.length ? speciesColour(ids[0]) : null; solid = c && Math.min(c[0], c[1], c[2]) < 225 ? rgb(c) : chemPalette().solid }
  else if (r?.kind === 'solution' && ids.length) {
    try {
      // the bottle's own equilibrium (an indicator is in its acid form there), then mol/L over its volume (its mass
      // over the catalogue's density) through the width of the bottle
      const water = r.recipe.water_kg ?? 1
      const eq = chemEquilibrium({ amounts: r.recipe.species, water_kg: water })
      const M = new Map(chemSpecies({ ids }).species.map(x => [x.id, x.M]))
      const grams = water * 1000 + ids.reduce((g, id) => g + (r.recipe.species[id] ?? 0) * (M.get(id) ?? 0), 0)
      const litres = grams / (r.rho ?? 1) / 1000
      const conc = eq.ok ? Object.fromEntries(eq.species.filter(x => x.n > 1e-12).map(x => [x.id, x.n / litres])) : Object.fromEntries(ids.map(id => [id, (r.recipe.species[id] ?? 0) / litres]))
      const c = chemColour(conc, 6).rgb
      colour = c ? [c[0], c[1], c[2]] : null
    } catch { colour = null }
  } else if (ids.length) { const c = speciesColour(ids[0]); colour = c ? [c[0], c[1], c[2]] : null }
  const look: BottleLook = { colour, solid, name: reagentName(r, reagent), label: r?.kind === 'solution' ? r.label ?? '' : '' }
  looks.set(key, look)
  return look
}

/** May this vessel be tipped to pour? Not a burette or a funnel with a tap (they are clamped), not stoppered, not empty. */
function canPourFrom(id: string): boolean {
  const v = bench.vesselOf(id)
  const k = kindOf(v?.kind ?? '')?.vessel
  return !!v && !!k && !k.tap && !v.closed && v.collect !== 'water' && v.collect !== 'down' && v.volume_mL > 0.01
}

/** The vessel whose mouth zone holds a bench point (the nearest mouth when two zones overlap). */
function pourTargetAt(list: Placed[], x: number, y: number): Placed | null {
  let best: Placed | null = null, dist = Infinity
  for (const q of list) {
    if (q.flip || q.v.closed || q.kind.vessel?.draw.lid) continue
    const m = mouthOf(q)
    if (!inMouthZone(mouthZone(m.x, m.y, m.r), x, y)) continue
    const dd = Math.abs(x - m.x) + Math.abs(y - m.y) * 0.3
    if (dd < dist) { dist = dd; best = q }
  }
  return best
}

function onUp(e: PointerEvent) {
  pointers.delete(e.pointerId)
  if (pointers.size < 2) pinch = null
  const d = dragging.value
  const was = down
  if (!was || was.id !== e.pointerId) return
  down = null
  dragging.value = null
  const [px, py] = at(e)
  const p = toBench(px, py)
  if (d) {
    pourLabel.value = null
    if (d.what === 'tubeEnd') bench.moveTubeEnd(d.id, d.end!, d.x0 + d.dx, d.y0 + d.dy)
    else if (d.what === 'fixture' && d.bottle && d.pourTo) {
      const b = d.bottle
      const amount = b.unit === 'drop' ? (b.drops && b.drops.drops > 0 ? { value: b.drops.drops, unit: 'drop' as const } : null) : addAmount(d.meter?.mL ?? 0, b.unit)
      if (amount) bench.add(d.pourTo, b.reagent, amount)
      else benchUi.dialog = { mode: 'add', to: d.pourTo, reagent: b.reagent }
    } else if (d.what === 'fixture') dropFixture(d)
    else if (d.what === 'handle') bench.setFixture(d.id, { [d.handle!]: handleHeight(d) })
    else {
      const isTap = !!kindOf(bench.objectOf(d.id)?.kind ?? '')?.vessel?.tap
      if (d.pourTo && d.meter) {
        // the hand lets go: the amount held becomes one pour of the log; a drop without holding asks for the amount
        const amount = pourAmount(d.meter.mL, d.meter.available_mL)
        if (amount === null) benchUi.dialog = { mode: 'pour', from: d.id, to: d.pourTo }
        else bench.pour(d.id, d.pourTo, amount === 'all' ? undefined : amount)
      } else if (d.over) {
        if (isTap) bench.setExtras(d.id, { above: d.over, on: null, at: null })
        else if (canPourFrom(d.id)) benchUi.dialog = { mode: 'pour', from: d.id, to: d.over }
      } else bench.moveVessel(d.id, d.x0 + d.dx, d.y0 + d.dy)
    }
    redraw()
    return
  }
  if (handDrops) { const h = handDrops; handDrops = null; pourLabel.value = null; dropInto(h.to, Math.max(1, h.meter.drops)); return }
  if (was.pan && Math.hypot(px - was.x, py - was.y) > 4) return
  // a tap
  if (hand.tool) { handTap({ vessel: was.vessel ?? pourTargetAt(placedNow, p.x, p.y)?.id ?? null, fixture: was.fixture }); redraw(); return }
  if (benchUi.carry) { dropOn(was.vessel, p); return }
  if (was.zone) { tapZone(was.zone); return }
  if (was.fixture || was.handle) { tapOnFixture((was.fixture ?? was.handle!.id)); return }
  if (!was.vessel) { bench.select(null); bench.selectFixture(null); return }
  const again = bench.selected.value === was.vessel
  if (!again) selectedBefore = bench.selected.value
  bench.select(was.vessel)
  // a second tap on a vessel with a tap delivers from it
  const o = bench.objectOf(was.vessel)
  const below = o ? bench.extras(was.vessel).above : null
  if (again && below && kindOf(o!.kind)?.vessel?.tap) benchUi.dialog = { mode: 'pour', from: was.vessel, to: below }
}

/** A fixture let go along the bench: it moves there with what it holds; the rules of the alcohol lamp are said. */
function dropFixture(d: Drag) {
  const f = bench.fixtureOf(d.id)
  if (!f) return
  const x = d.x0 + d.dx
  if (f.kind === 'alcoholBurner' && f.lit) {
    // a lit lamp carried to another lamp's wick: the rule forbids lighting one from the other (said, not done)
    const other = fixtures.value.find(g => g.id !== f.id && g.kind === 'alcoholBurner' && !g.lit && Math.abs(g.x - x) < 4.5)
    if (other) ruleNote(tl('规则：禁止用燃着的酒精灯去点燃另一盏'))
  }
  bench.moveFixture(d.id, x)
}

/** A tap on a fixture selects it; a burner or a hot plate is worked as well (the inspector has its settings). */
function tapOnFixture(id: string) {
  const f = bench.fixtureOf(id)
  if (!f) return
  const again = bench.selectedFixture.value === id
  bench.selectFixture(id)
  if (isBurner(f.kind) || f.kind === 'hotPlate' || (f.kind === 'reagentBottle' && f.style !== 'dropper' && again)) bench.tapFixture(id)
}

function onCancel(e: PointerEvent) { pointers.delete(e.pointerId); pinch = null; down = null; dragging.value = null; handDrops = null; pourLabel.value = null; redraw() }
function onLeave() { if (hand.tool) { hand.over = false; redraw() } }

function tapZone(z: Zone) {
  if (z.part.startsWith('circuit:')) {
    const c = bench.circuits.value.find(x => x.id === z.part.slice(8))
    if (c) bench.setCircuit(c.id, { on: !c.on })
    return
  }
  bench.select(z.vessel)
  if (kindOf(z.part)?.tool?.action === 'flame') flameTest(z.vessel)
  else bench.useTool(z.vessel, z.part)
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  const [px, py] = at(e)
  const before = toBench(px, py)
  cam.ppc = Math.max(4, Math.min(48, cam.ppc * Math.exp(-e.deltaY * 0.0015)))
  // keep the point under the pointer where it is
  cam.x = before.x - (px - size.w / 2) / cam.ppc
  cam.y = (py - Math.round(size.h * BENCH_AT)) / cam.ppc + before.y
  cam.manual = true
}

/**
 * A double click on the bench fits the view; on a vessel it asks for an exact amount: of what is carried, or poured from
 * the vessel that was selected before (select the source, double-click the target).
 */
let selectedBefore: string | null = null
function onDouble(e: MouseEvent) {
  const [px, py] = at(e)
  const p = toBench(px, py)
  const hit = vesselAt(placedNow, p.x, p.y)
  if (!hit) { if (!fixtureAt(p.x, p.y)) fit(); return }
  if (benchUi.carry) { dropOn(hit.id, p); return }
  const from = selectedBefore
  if (from && from !== hit.id && canPourFrom(from)) benchUi.dialog = { mode: 'pour', from, to: hit.id }
}
function onContext(e: MouseEvent) {
  const [px, py] = at(e)
  const p = toBench(px, py)
  const hit = vesselAt(placedNow, p.x, p.y)
  if (!hit) { const f = fixtureAt(p.x, p.y); if (f) { e.preventDefault(); bench.selectFixture(f.id); emit('inspect') } return }
  e.preventDefault()
  bench.select(hit.id)
  benchUi.menu = hit.id
}

// ---- keys ----

function removeSelected() {
  const id = bench.selected.value
  const fid = bench.selectedFixture.value
  if (fid) { const name = kindName(kindOf(bench.fixtureOf(fid)?.kind ?? '')); bench.removeFixture(fid); showToast(tl('已移走{0}', [name])); return }
  if (!id) return
  const name = bench.vesselName(id)
  if (bench.removeVessel(id)) showToast(tl('已移走{0}', [name]), false, { label: tl('撤销'), run: () => bench.undo() })
}

/** Lift the selected vessel to the next support up or down at its place (the keyboard's way of putting it on a tripod, into a rack …). */
function liftSelected(dir: 1 | -1) {
  const id = bench.selected.value
  const v = id ? bench.vesselOf(id) : undefined
  if (!id || !v) return
  const e = bench.extras(id)
  const spots = [{ x: e.x, y: 0, on: null, what: 'bench' as const }, ...spotsFor(fixtures.value, bench.rigVessels(), v)].filter(s => Math.abs(s.x - e.x) <= 8)
  spots.sort((a, b) => a.y - b.y)
  const next = dir > 0 ? spots.find(s => s.y > e.y + 0.05) : [...spots].reverse().find(s => s.y < e.y - 0.05)
  if (next) bench.moveVessel(id, next.x, next.y)
}

function onKey(e: KeyboardEvent) {
  if (e.ctrlKey || e.metaKey || e.altKey) return
  type Item = { id: string; x: number; fixture: boolean }
  const order: Item[] = [...placed.value.map(p => ({ id: p.id, x: p.x, fixture: false })), ...fixtures.value.map(f => ({ id: f.id, x: f.x, fixture: true }))].sort((a, b) => a.x - b.x || Number(a.fixture) - Number(b.fixture))
  const cur = bench.selectedFixture.value ?? bench.selected.value
  const i = order.findIndex(p => p.id === cur)
  const pick = (it: Item) => (it.fixture ? bench.selectFixture(it.id) : bench.select(it.id))
  const fid = bench.selectedFixture.value
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    const step = e.key === 'ArrowRight' ? 1 : -1
    if (e.shiftKey && i >= 0) {
      const it = order[i]
      if (it.fixture) bench.moveFixture(it.id, it.x + step)
      else { const ex = bench.extras(it.id); bench.moveVessel(it.id, ex.x + step, ex.y) }
    } else if (order.length) pick(order[i < 0 ? (step > 0 ? 0 : order.length - 1) : (i + step + order.length) % order.length])
    e.preventDefault()
  } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.shiftKey) {
    const dir = e.key === 'ArrowUp' ? 1 : -1
    const f = fid ? bench.fixtureOf(fid) : undefined
    if (f?.kind === 'stand' && typeof f.clamp === 'number') bench.setFixture(f.id, { clamp: Math.max(RIG.stand.clampMin, Math.min(RIG.stand.clampMax, f.clamp + dir)) })
    else liftSelected(dir)
    e.preventDefault()
  } else if (e.key === 'Enter' && hand.tool && (bench.selected.value || fid)) {
    handTap({ vessel: bench.selected.value, fixture: fid })
    e.preventDefault()
  } else if (e.key === 'Enter' && (bench.selected.value || fid)) {
    if (fid) { tapOnFixture(fid); emit('inspect') }
    else if (benchUi.carry) dropOn(bench.selected.value)
    else benchUi.menu = benchUi.menu ? null : bench.selected.value
    e.preventDefault()
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && (bench.selected.value || fid)) { removeSelected(); e.preventDefault() }
  else if (e.key === 'Escape') {
    if (benchUi.menu || benchUi.chooser) { benchUi.menu = null; benchUi.chooser = null } else if (hand.tool) { hand.tool = null; hand.load = null } else if (benchUi.carry) benchUi.carry = null
    else if (bench.selected.value || fid) { bench.select(null); bench.selectFixture(null) }
    else return
    e.preventDefault(); e.stopPropagation()
  } else if (e.key === ' ') { bench.toggle(); e.preventDefault() }
}

// ---- overlays: notes, marks, the handle of the selected vessel ----

const clock = ref(0)
let timer = 0
onMounted(() => { timer = window.setInterval(() => { if (bench.phenomena.value.length || benchUi.rule) clock.value++ }, 400) })
onBeforeUnmount(() => window.clearInterval(timer))

const anchor = (p: Placed) => ({ x: view.value.ox + p.x * view.value.ppc, top: view.value.oy - p.top * view.value.ppc, half: (p.right - p.x) * view.value.ppc })

/** A rectangle on the canvas (px) that a note must not cover. */
type Box = { l: number; t: number; r: number; b: number }
const overlaps = (a: Box, b: Box) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b
/** Width of a note, px (its text in the interface's small type, with its padding). */
const noteWidth = (text: string) => Math.min(280, 20 + [...text].reduce((w, ch) => w + (/[　-鿿＀-￯]/.test(ch) ? 13 : 7), 0))

/**
 * What happened, beside each vessel: at most two notes a vessel (the inspector lists them all), placed above its
 * vessel and moved up, or to the side, until they cover neither another note nor the top of a vessel.
 */
const notes = computed(() => {
  void clock.value; void bench.revision.value
  const lang = activeLang()
  const out: Array<{ key: string; text: string; approx: boolean; swatch: string; rule?: boolean; left: string; top: string }> = []
  const taken: Box[] = placed.value.map(p => { const a = anchor(p); return { l: a.x - a.half, t: a.top - 4, r: a.x + a.half, b: a.top + 12 } })
  // the actions button of the selected vessel is not covered either
  const hb = handle.value
  if (hb) { const l = parseFloat(hb.left), t = parseFloat(hb.top); taken.push({ l: l - 4, t: t - 4, r: l + 40, b: t + 40 }) }
  const H = 26
  const put = (key: string, text: string, x: number, top: number, extra: { approx: boolean; swatch: string; rule?: boolean }) => {
    const w = noteWidth(text)
    const cx = Math.max(w / 2 + 8, Math.min(size.w - w / 2 - 8, x))
    for (let k = 0; k < 8; k++) {
      for (const shift of [0, w * 0.6, -w * 0.6]) {
        const l = cx + shift - w / 2, b = top - k * (H + 2)
        if (l < 4 || l + w > size.w - 4 || b - H < 56) continue
        const box = { l, t: b - H, r: l + w, b }
        if (taken.some(t => overlaps(t, box))) continue
        taken.push(box)
        out.push({ key, text, ...extra, left: `${l + w / 2}px`, top: `${b}px` })
        return
      }
    }
  }
  const count = new Map<string, number>()
  for (const n of bench.notesNow()) {
    const p = placed.value.find(q => q.id === n.vessel)
    if (!p) continue
    const k = count.get(n.vessel) ?? 0
    // two notes a vessel; one on a narrow screen (the inspector lists them all)
    if (k >= (size.w < 600 ? 1 : 2)) continue
    count.set(n.vessel, k + 1)
    const a = anchor(p)
    put(n.key, phenomenonText(n, lang), a.x, a.top - 10, { approx: isApproxNote(n), swatch: '' })
  }
  for (const [id, fl] of Object.entries(benchUi.flames)) {
    const p = placed.value.find(q => q.id === id)
    if (!p) continue
    const a = anchor(p)
    put(`flame-${id}`, fl.colour ? tl('焰色：{0}', [fl.elements.join(' ')]) : tl('火焰无色'), a.x, a.top - 10, { approx: false, swatch: fl.colour })
  }
  // a rule of the bench (the alcohol lamp's): said near the top, labelled as a rule, not as a result of the model
  if (benchUi.rule && benchUi.rule.until > Date.now()) put('rule', benchUi.rule.text, size.w / 2, 64 + H, { approx: false, swatch: '', rule: true })
  return out
})

/** The “未建模” mark under a vessel whose mixture the model does not cover (“近似” is said in the inspector only). */
const marks = computed(() => {
  const out: Array<{ id: string; kind: 'unmodelled'; left: string; top: string }> = []
  for (const p of placed.value) {
    const d = bench.diagnostics.value.get(p.id)
    if (!d?.some(x => x.severity === 'unmodelled')) continue
    const a = anchor(p)
    out.push({ id: p.id, kind: 'unmodelled', left: `${a.x}px`, top: `${Math.min(size.h - 24, view.value.oy + 30)}px` })
  }
  return out
})

const handle = computed(() => {
  const p = placed.value.find(q => q.id === bench.selected.value)
  if (!p || dragging.value) return null
  const a = anchor(p)
  const mid = view.value.oy - (p.base + p.shape.top * 0.5) * view.value.ppc
  return { id: p.id, left: `${Math.min(size.w - 44, a.x + a.half + 8)}px`, top: `${Math.max(60, Math.min(size.h - 44, mid - 16))}px` }
})

const spoken = computed(() => {
  const id = bench.selected.value
  const f = bench.fixtureOf(bench.selectedFixture.value)
  return id ? tl('已选中{0}', [bench.vesselName(id)]) : f ? tl('已选中{0}', [kindName(kindOf(f.kind))]) : ''
})

function openMark(id: string) { bench.select(id); emit('inspect') }
</script>

<template>
  <div
    ref="wrap" class="bench" tabindex="0" role="application" :aria-label="tl('实验台')" data-ui="chem-bench"
     @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onCancel" @pointerleave="onLeave" @wheel="onWheel" @dblclick="onDouble" @contextmenu="onContext" @keydown="onKey"
  >
    <canvas ref="canvas" />
    <div class="sr-only" role="status" aria-live="polite">{{ spoken }}</div>
    <span v-for="n in notes" :key="n.key" class="note" :class="{ approx: n.approx, rule: n.rule }" :style="{ left: n.left, top: n.top }" :data-ui="n.rule ? 'chem-rule' : undefined"><i v-if="n.swatch" class="sw" :style="{ background: n.swatch }" />{{ n.text }}</span>
    <span v-if="pourLabel" class="pourl num" :style="{ left: pourLabel.left, top: pourLabel.top }" data-ui="chem-pour-amount">{{ pourLabel.text }}</span>
    <button v-for="m in marks" :key="m.id" type="button" class="mark" :class="m.kind" :style="{ left: m.left, top: m.top }" :data-ui="`chem-mark-${m.kind}`" @pointerdown.stop @click="openMark(m.id)">{{ markLabel(m.kind) }}</button>
    <button v-if="handle" type="button" class="btn icon handle" :style="{ left: handle.left, top: handle.top }" :title="tl('操作')" :aria-label="tl('操作')" aria-haspopup="menu" data-ui="chem-actions" @pointerdown.stop @click="benchUi.menu = benchUi.menu ? null : handle.id"><Icon name="more" /></button>
    <slot :anchor="handle" />
  </div>
</template>

<style scoped>
.bench { position: relative; flex: 1; min-height: 0; min-width: 0; overflow: hidden; touch-action: none; outline: none; user-select: none; -webkit-user-select: none; }
.bench:focus-visible { box-shadow: inset 0 0 0 2px var(--accent); }
canvas { position: absolute; left: 0; top: 0; display: block; }
/* What happened, beside the vessel: brief, never in the way of a tap */
.note { position: absolute; transform: translate(-50%, -100%); max-width: min(280px, 70%); padding: 3px 9px; border-radius: var(--radius-pill); background: var(--pane); box-shadow: var(--elev-2); font-size: var(--type-small); color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; transition: opacity var(--dur-fast) ease; }
@starting-style { .note { opacity: 0; } }
.note.approx { color: var(--warning); }
/* a rule of the bench (not a result of the model): its own tone */
.note.rule { color: var(--warning); font-weight: var(--weight-strong); }
/* the amount of a pour being held: beside the stream, in the interface's figures */
.pourl { position: absolute; transform: translate(-50%, -100%); padding: 2px 8px; border-radius: var(--radius-pill); background: var(--pane); box-shadow: var(--elev-2); font-size: var(--type-body); font-weight: var(--weight-strong); color: var(--text); white-space: nowrap; pointer-events: none; }
.sw { display: inline-block; width: 10px; height: 10px; margin-right: 6px; border-radius: var(--radius-round); box-shadow: 0 0 0 1px var(--border); vertical-align: -1px; }
.mark { position: absolute; transform: translateX(-50%); height: 20px; padding: 0 7px; border: 0; border-radius: var(--radius-pill); font: inherit; font-size: var(--type-tiny); font-weight: var(--weight-strong); cursor: pointer; white-space: nowrap; }
/* the soft grounds lie on the pane colour, the pair the contrast register knows */
.mark.unmodelled { background: linear-gradient(var(--danger-soft), var(--danger-soft)), var(--pane); color: var(--danger); }
.mark.approx { background: linear-gradient(var(--warning-soft), var(--warning-soft)), var(--pane); color: var(--warning); }
.handle { position: absolute; background: var(--pane); box-shadow: var(--elev-2); }
@media (pointer: coarse) { .mark { height: 28px; } }
</style>
