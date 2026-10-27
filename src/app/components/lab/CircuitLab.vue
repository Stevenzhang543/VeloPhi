<script setup lang="ts">
/**
 * Circuit experiment (26.54, D80; 26.55, D89). Elements sit between two points of a grid (drag from one point to
 * another); elements meeting at a point are connected. Two ways to compute, both in the Rust core:
 *
 * - Steady state (`circuitSolve`, modified nodal analysis) after every change: voltages, currents, powers, series and
 *   parallel groups, equivalent resistance.
 * - Run (`circuitRun`, trapezoidal rule with error control): the circuit in time from its state — capacitors charge,
 *   inductors resist changes of current, alternating sources, diodes, motors, transformers, fuses and the RCD act as
 *   they do in time. Every animation frame asks for the next piece of simulated time (time scale × real time) with the
 *   state returned by the previous request, so a switch thrown during the run takes effect from that instant. Two probes
 *   (CH1, CH2) feed the oscilloscope; energies are integrated by the core.
 *
 * This component draws the circuit, the current (moving dots in the direction of the conventional current), lamps by
 * their power, meters with their readings, and lists every element's values with the textbook formulas.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { tl } from '../../../i18n'
import { state } from '../../store'
import { fmtQ } from '../../settings'
import { DARK, LIGHT } from '../../../render/renderer'
import { FONT, MONO } from '../../../render/style'
import type { CircuitElement, CircuitRun, CircuitSolution, ElemState } from '../../../engine/labs'
import { circuitResistance, circuitRun, circuitSolve } from '../../../engine/labs'
import { labRequest, labState } from '../../lab/state'
import type { EditorKind, El, Pt } from '../../lab/circuitPresets'
import { FOUR_TERMINAL, KINDS, KIND_INFO, PRESETS, PRESET_GROUPS, besides, defaultsOf, named } from '../../lab/circuitPresets'
import Icon from '../Icon.vue'
import NumField from '../NumField.vue'
import LabFormula from './LabFormula.vue'
import LabChart from './LabChart.vue'

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })

const S = labState('circuit', () => ({
  elements: named(PRESETS.series.build()), preset: 'series', showValues: true, showPotential: false, flow: true, nextId: 100,
  // 26.55 (D89): time domain
  mode: 'dc' as 'dc' | 'run', scale: 0.01, span: 0.05
}))

// ---- Editing ----
type ToolId = 'select' | 'measure' | EditorKind
const tool = ref<ToolId>('select')
const selected = ref<string | null>(null)
const sel = computed(() => S.elements.find(e => e.id === selected.value) ?? null)
const measure = ref<{ a: Pt | null; b: Pt | null }>({ a: null, b: null })
const groups = computed(() => (['basic', 'ac', 'sensor'] as const).map(g => KINDS.filter(k => KIND_INFO[k].group === g)))

function loadPreset(id: string) {
  const p = PRESETS[id]
  if (!p) return
  S.preset = id
  S.elements = named(p.build())
  selected.value = null
  resetRun()
  fit()
  if (p.run) { S.mode = 'run'; S.scale = p.run.scale; S.span = p.run.span; running.value = true } else S.mode = 'dc'
}
function nextName(kind: EditorKind): string {
  const pre = KIND_INFO[kind].prefix
  if (!pre) return ''
  let n = 1
  while (S.elements.some(e => e.name === `${pre}${n}`)) n++
  return `${pre}${n}`
}
function addElement(kind: EditorKind, a: Pt, b: Pt) {
  S.nextId++
  const e: El = { id: `e${S.nextId}`, kind, name: nextName(kind), a, b, ...defaultsOf(kind) }
  if (FOUR_TERMINAL.has(kind)) { const [c, d] = besides(a, b); e.c = c; e.d = d }
  S.elements.push(e)
  selected.value = e.id
}
function removeSelected() {
  if (!selected.value) return
  S.elements = S.elements.filter(e => e.id !== selected.value)
  selected.value = null
}
function reverse() { const e = sel.value; if (e) { const t = e.a; e.a = e.b; e.b = t; if (e.c && e.d) { const u = e.c; e.c = e.d; e.d = u } } }
function rotate() {
  const e = sel.value
  if (!e) return
  const rot = (p: Pt): Pt => { const x = p[0] - e.a[0], y = p[1] - e.a[1]; return [e.a[0] - y, e.a[1] + x] }
  e.b = rot(e.b)
  if (e.c) e.c = rot(e.c)
  if (e.d) e.d = rot(e.d)
}
function toggleDivider() {
  const e = sel.value
  if (!e || e.kind !== 'rheostat') return
  if (e.c) { e.c = null; return }
  const mx = (e.a[0] + e.b[0]) / 2, my = (e.a[1] + e.b[1]) / 2
  const dx = e.b[0] - e.a[0], dy = e.b[1] - e.a[1], l = Math.hypot(dx, dy) || 1
  e.c = [Math.round(mx - (dy / l) * 2), Math.round(my + (dx / l) * 2)]
}
const label = (e: El) => (e.kind === 'probe' ? `CH${e.channel ?? 1}` : e.label || e.name)

// ---- Requests to the core ----
const key = (p: Pt) => `${p[0]},${p[1]}`
/** Node key of the common earth. */
const EARTH = '⏚'
const PARAMS = ['E', 'r', 'R', 'U', 'P', 'pos', 'C', 'closed', 'L', 'f', 'phase', 'k', 'J', 'fr', 'load', 'generator', 'omega', 'n1', 'n2', 'r2', 'I', 'beta', 'T', 'gamma', 'lux', 'F0', 'F', 'channel'] as const
const request = computed<CircuitElement[]>(() => S.elements.map(e => {
  if (e.kind === 'ground') return { id: e.id, kind: 'wire', a: key(e.a), b: EARTH }
  const o: CircuitElement = { id: e.id, kind: e.kind, a: key(e.a), b: key(e.b) }
  if ((e.kind === 'rheostat' || FOUR_TERMINAL.has(e.kind)) && e.c) o.c = key(e.c)
  if (FOUR_TERMINAL.has(e.kind) && e.d) o.d = key(e.d)
  for (const k of PARAMS) if (e[k] !== undefined) (o as unknown as Record<string, unknown>)[k] = e[k]
  if (e.kind === 'voltmeter' && !(e.r && e.r > 0)) delete o.r
  return o
}))
const sol = computed<CircuitSolution | null>(() => {
  if (!S.elements.length || S.mode === 'run') return null
  try { return circuitSolve(request.value) } catch { return null }
})
const nameOf = (id: string | null) => { const e = S.elements.find(x => x.id === id); return e ? label(e) || KIND_INFO[e.kind].label : '' }
const ISSUE_TEXT: Record<string, string> = {
  shortIdeal: tl('理想电源被导线（或理想电流表）直接短路：电流将无穷大。请串联用电器，或给电源设置内阻。'),
  conflict: tl('几个理想电源的电压互相矛盾（例如电动势不同的理想电池并联）：没有解。'),
  noSource: tl('电路中没有电源。'),
  floating: tl('有一部分电路与其他部分没有导电连接，跨在两部分之间的电压不确定。'),
  meterReversed: tl('电表正负接线柱接反：读数为负，指针反偏。'),
  lampOver: tl('小灯泡的实际功率超过额定功率的 1.2 倍，可能烧坏。'),
  needsRun: tl('电路中有交流电源：稳态分析没有意义，点“运行”看随时间的变化。'),
  motorStalled: tl('稳态分析中电动机看作不转（相当于电阻 R_a）；点“运行”看它转起来后的电流。'),
  fuseBlown: tl('电流超过保险丝的额定电流，保险丝熔断。'),
  rcdTripped: tl('火线与零线的电流不相等（有电流经大地流走），漏电保护器跳闸。'),
  meterOver: tl('电流超过灵敏电流计的满偏电流，指针打到头。'),
  singular: tl('电路方程没有唯一解。'),
  tooManySteps: tl('这段时间内的计算步数太多（电路变化太快）：请减慢时间流速。'),
  badDuration: tl('时间步长无效。')
}
const measured = computed(() => {
  const m = measure.value
  if (!m.a || !m.b) return null
  try { return circuitResistance(request.value, key(m.a), key(m.b)) } catch { return null }
})

// ---- Run (time domain) ----
const running = ref(false)
const simT = ref(0)
let st: Record<string, ElemState> = {}
const live = ref<{ U: number[]; I: number[]; X: number[]; Y: number[] } | null>(null)
const energy = ref<Record<string, number>>({})
const mech = ref<Record<string, number>>({})
const jumpLoss = ref(0)
const runEvents = ref<Array<{ t: number; kind: string; element: string | null }>>([])
const runError = ref<string | null>(null)
const lastStats = ref({ steps: 0, minStep: 0, ms: 0 })
const buf = { t: [] as number[], ch1: [] as number[], ch2: [] as number[], u: [] as number[], i: [] as number[] }
const scopeTick = ref(0)
const angle: Record<string, number> = {}

function resetRun() {
  simT.value = 0; st = {}; live.value = null; energy.value = {}; mech.value = {}; jumpLoss.value = 0; runEvents.value = []; runError.value = null
  buf.t = []; buf.ch1 = []; buf.ch2 = []; buf.u = []; buf.i = []; scopeTick.value++
}
function setMode(m: 'dc' | 'run') {
  S.mode = m
  resetRun()
  running.value = m === 'run'
}
const acFreq = computed(() => Math.max(0, ...S.elements.filter(e => e.kind === 'ac').map(e => e.f ?? 0)))
/** Probe channels: element index of CH1 and CH2. */
const probes = computed(() => {
  const out: Array<number | null> = [null, null]
  S.elements.forEach((e, i) => { if (e.kind === 'probe') { const ch = (e.channel ?? 1) === 2 ? 1 : 0; if (out[ch] === null) out[ch] = i } })
  return out
})

/** Advance the run by `dt` seconds of simulated time. */
function advance(dtSim: number) {
  if (dtSim <= 0 || !S.elements.length) return
  // sample density: 400 points over the scope span, at least 200 per period of the fastest source
  const density = Math.max(400 / Math.max(S.span, 1e-9), 200 * acFreq.value)
  const samples = Math.max(1, Math.min(400, Math.ceil(dtSim * density)))
  const t0 = performance.now()
  let r: CircuitRun
  try { r = circuitRun(request.value, { t0: simT.value, duration: dtSim, samples, state: st }) } catch (e) { runError.value = (e as Error).message; running.value = false; return }
  lastStats.value = { steps: r.steps, minStep: r.minStep, ms: performance.now() - t0 }
  if (!r.ok) { runError.value = r.fatal ?? 'singular'; running.value = false }
  else runError.value = null
  const ne = S.elements.length
  const n = r.t.length
  if (n === 0) return
  st = r.state
  for (const [k, v] of Object.entries(r.energy)) energy.value[k] = (energy.value[k] ?? 0) + v
  for (const [k, v] of Object.entries(r.mech)) mech.value[k] = (mech.value[k] ?? 0) + v
  for (const ev of r.events) {
    if (ev.kind === 'jump') { jumpLoss.value += ev.energy; continue }
    runEvents.value.unshift({ t: ev.t, kind: ev.kind, element: ev.element })
  }
  if (runEvents.value.length > 30) runEvents.value.length = 30
  const [c1, c2] = probes.value
  const si = S.elements.findIndex(e => e.id === selected.value)
  // the first sample repeats the end of the previous request
  for (let s = buf.t.length ? 1 : 0; s < n; s++) {
    buf.t.push(r.t[s])
    buf.ch1.push(c1 === null ? NaN : r.U[s * ne + c1])
    buf.ch2.push(c2 === null ? NaN : r.U[s * ne + c2])
    buf.u.push(si < 0 ? NaN : r.U[s * ne + si])
    buf.i.push(si < 0 ? NaN : r.I[s * ne + si])
  }
  const last = n - 1
  const pick = (a: Float64Array) => Array.from(a.subarray(last * ne, last * ne + ne))
  live.value = { U: pick(r.U), I: pick(r.I), X: pick(r.X), Y: pick(r.Y) }
  // motors turn by their ω (shown at the simulated speed)
  S.elements.forEach((e, i) => { if (e.kind === 'motor') angle[e.id] = ((angle[e.id] ?? 0) + live.value!.X[i] * dtSim) % (2 * Math.PI) })
  simT.value = r.t[last]
  // keep two spans of history
  const keep = simT.value - 2 * S.span
  let cut = 0
  while (cut < buf.t.length && buf.t[cut] < keep) cut++
  if (cut > 0) for (const k of ['t', 'ch1', 'ch2', 'u', 'i'] as const) buf[k].splice(0, cut)
  scopeTick.value++
}
watch(selected, () => { buf.u = buf.t.map(() => NaN); buf.i = buf.t.map(() => NaN) })

/** Values of an element now: run (last sample) or steady state. */
function valuesOf(id: string): { U: number | null; I: number | null; P: number | null; X: number; Y: number } | null {
  const i = S.elements.findIndex(e => e.id === id)
  if (i < 0) return null
  if (S.mode === 'run') {
    const l = live.value
    if (!l) return null
    const U = Number.isFinite(l.U[i]) ? l.U[i] : null
    return { U, I: l.I[i], P: U === null ? null : U * l.I[i], X: l.X[i], Y: l.Y[i] }
  }
  const v = sol.value?.elements[id]
  if (!v) return null
  return { U: v.U, I: v.I, P: v.P, X: v.extra ?? 0, Y: v.Iparts?.[1] ?? 0 }
}

/** rms of a buffer over the last period of the fastest source (trapezoid over the samples of one period). */
function rms(series: number[]): number | null {
  const f = acFreq.value
  if (!(f > 0) || buf.t.length < 3) return null
  const T = 1 / f
  const tEnd = buf.t[buf.t.length - 1]
  if (tEnd - buf.t[0] < T * (1 - 1e-9)) return null
  let s = 0, k = buf.t.length - 1
  while (k > 0 && buf.t[k - 1] >= tEnd - T - 1e-15) { const h = buf.t[k] - buf.t[k - 1]; s += 0.5 * h * (series[k] ** 2 + series[k - 1] ** 2); k-- }
  return Math.sqrt(s / (tEnd - buf.t[k]))
}
const selRms = computed(() => { void scopeTick.value; return sel.value && S.mode === 'run' ? { U: rms(buf.u), I: rms(buf.i) } : null })

// ---- Energies of the run ----
const storedNow = computed(() => {
  void scopeTick.value
  let e = 0
  for (const el of S.elements) {
    const s = st[el.id]
    if (!s) continue
    if (el.kind === 'capacitor') e += 0.5 * (el.C ?? 0) * s[0] * s[0]
    if (el.kind === 'inductor') e += 0.5 * (el.L ?? 0) * s[0] * s[0]
    if (el.kind === 'transformer') e += 0.5 * (el.L ?? 0) * s[0] * s[0]
    if (el.kind === 'motor' && !el.generator) e += 0.5 * (el.J ?? 0) * s[1] * s[1]
  }
  return e
})
const ledger = computed(() => {
  void scopeTick.value
  let source = 0, heat = 0, mechW = 0
  for (const el of S.elements) {
    const w = energy.value[el.id] ?? 0
    if (el.kind === 'battery' || el.kind === 'ac' || (el.kind === 'motor' && el.generator)) source -= w
    else if (el.kind === 'motor') { mechW += mech.value[el.id] ?? 0; heat += w - (mech.value[el.id] ?? 0) }
    else if (el.kind === 'capacitor' || el.kind === 'inductor' || el.kind === 'transformer') { /* storage: from the states */ }
    else heat += w
  }
  return { source, heat, mech: mechW, stored: storedNow.value, jump: jumpLoss.value }
})

// ---- Summary of the steady state: the (first) battery and its external circuit ----
const battery = computed(() => S.elements.find(e => e.kind === 'battery') ?? null)
const summary = computed(() => {
  const b = battery.value, s = sol.value
  if (!b || !s || !s.ok) return null
  const v = s.elements[b.id]
  if (!v || v.U === null || v.I === null) return null
  let rext: number | null = null
  try { rext = circuitResistance(request.value, key(b.a), key(b.b)) } catch { rext = null }
  const I = -v.I
  return { E: b.E ?? 0, r: b.r ?? 0, U: v.U, I, Pout: v.U * I, Ptotal: (b.E ?? 0) * I, Rext: rext }
})

// ---- Canvas ----
const canvas = ref<HTMLCanvasElement | null>(null)
const wrap = ref<HTMLElement | null>(null)
const view = ref({ w: 600, h: 400, cell: 44, ox: 0, oy: 0 })
const toPx = (p: Pt): [number, number] => [view.value.w / 2 + view.value.ox + p[0] * view.value.cell, view.value.h / 2 + view.value.oy - p[1] * view.value.cell]
const toGrid = (x: number, y: number): Pt => [Math.round((x - view.value.w / 2 - view.value.ox) / view.value.cell), Math.round(-(y - view.value.h / 2 - view.value.oy) / view.value.cell)]

/** Zoom and pan so that the whole circuit fits the canvas (examples). */
/**
 * Whether a vertical meter's reading should go under its label (true) or on the other side: the side whose gap to
 * the next vertical element is larger, counting about 2.5 cells for that element's label when it faces this way.
 */
function readingBesideLabel(e: El, pa: Pt, pb: Pt, nx: number): boolean {
  const x = pa[0], lo = Math.min(pa[1], pb[1]), hi = Math.max(pa[1], pb[1])
  let left = Infinity, right = Infinity
  for (const o of S.elements) {
    if (o === e || o.kind === 'wire' || o.kind === 'ground') continue
    const segs: Array<[Pt, Pt]> = [[o.a, o.b]]
    if (FOUR_TERMINAL.has(o.kind) && o.c && o.d) segs.push([o.c, o.d])
    for (const [a, b] of segs) {
      if (a[0] !== b[0] || Math.min(hi, Math.max(a[1], b[1])) - Math.max(lo, Math.min(a[1], b[1])) <= 0) continue
      const dx = a[0] - x, faces = Math.sign(b[1] - a[1])
      if (dx > 0) right = Math.min(right, dx - (faces < 0 && o.kind !== 'transformer' ? 2.5 : 0))
      else if (dx < 0) left = Math.min(left, -dx - (faces > 0 && o.kind !== 'transformer' ? 2.5 : 0))
    }
  }
  const labelRight = nx > 0
  return labelRight ? right >= left : left >= right
}
function fit() {
  const pts = S.elements.flatMap(e => [e.a, e.b, ...(e.c ? [e.c] : []), ...(e.d ? [e.d] : [])])
  if (!pts.length) return
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
  // room for the labels beside the outermost elements (written sideways: a name or value, or a probe's reading, up to about four cells long)
  const [x0, x1, y0, y1] = [Math.min(...xs) - 4.5, Math.max(...xs) + 4.5, Math.min(...ys) - 2, Math.max(...ys) + 2]
  const W = wrap.value?.clientWidth || view.value.w, H = wrap.value?.clientHeight || view.value.h
  view.value.cell = Math.max(16, Math.min(56, Math.min(W / (x1 - x0), H / (y1 - y0))))
  view.value.ox = -((x0 + x1) / 2) * view.value.cell
  view.value.oy = ((y0 + y1) / 2) * view.value.cell
}
let drag: { from: Pt; to: Pt; pan?: { x: number; y: number; ox: number; oy: number }; pinch?: boolean } | null = null
let phase = 0
let raf = 0
let last = 0

function segDist(x: number, y: number, p: Pt, q: Pt) {
  const [x0, y0] = toPx(p), [x1, y1] = toPx(q)
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / l2))
  return Math.hypot(x0 + t * dx - x, y0 + t * dy - y)
}
function hit(x: number, y: number): El | null {
  let best: El | null = null, bd = 10
  for (const e of S.elements) {
    let d = e.kind === 'ground' ? Math.hypot(toPx(e.a)[0] - x, toPx(e.a)[1] + 12 - y) : segDist(x, y, e.a, e.b)
    if (FOUR_TERMINAL.has(e.kind) && e.c && e.d) {
      d = Math.min(d, segDist(x, y, e.c, e.d))
      // the body between the two windings / conductors
      const [ax, ay] = toPx(e.a), [bx, by] = toPx(e.b), [cx, cy] = toPx(e.c), [dx, dy] = toPx(e.d)
      const mx = (ax + bx + cx + dx) / 4, my = (ay + by + cy + dy) / 4
      d = Math.min(d, Math.hypot(mx - x, my - y) - 14)
    }
    if (d < bd) { bd = d; best = e }
  }
  return best
}

// pointers: one finger draws or selects, two fingers pan and zoom (26.55, D42)
const pointers = new Map<number, [number, number]>()
let pinch0: { d: number; cell: number; mx: number; my: number; ox: number; oy: number } | null = null
function pointer(e: PointerEvent): [number, number] {
  const r = canvas.value!.getBoundingClientRect()
  return [e.clientX - r.left, e.clientY - r.top]
}
function onDown(e: PointerEvent) {
  const [x, y] = pointer(e)
  canvas.value!.setPointerCapture(e.pointerId)
  pointers.set(e.pointerId, [x, y])
  if (pointers.size === 2) {
    const [[x1, y1], [x2, y2]] = [...pointers.values()]
    pinch0 = { d: Math.hypot(x2 - x1, y2 - y1), cell: view.value.cell, mx: (x1 + x2) / 2, my: (y1 + y2) / 2, ox: view.value.ox, oy: view.value.oy }
    drag = null
    return
  }
  if (e.button === 1 || e.button === 2 || (tool.value === 'select' && !hit(x, y) && (e.shiftKey || e.pointerType === 'touch'))) {
    drag = { from: [0, 0], to: [0, 0], pan: { x, y, ox: view.value.ox, oy: view.value.oy } }
    return
  }
  if (tool.value === 'select') {
    const h = hit(x, y)
    if (h && h.kind === 'switch' && selected.value === h.id) h.closed = !h.closed
    selected.value = h?.id ?? null
    return
  }
  if (tool.value === 'measure') {
    const g = toGrid(x, y)
    const m = measure.value
    measure.value = !m.a || m.b ? { a: g, b: null } : { a: m.a, b: g }
    return
  }
  const g = toGrid(x, y)
  if (tool.value === 'ground') { addElement('ground', g, g); tool.value = 'select'; return }
  drag = { from: g, to: g }
}
function onMove(e: PointerEvent) {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, pointer(e))
  if (pinch0 && pointers.size === 2) {
    const [[x1, y1], [x2, y2]] = [...pointers.values()]
    const d = Math.hypot(x2 - x1, y2 - y1)
    view.value.cell = Math.max(22, Math.min(90, pinch0.cell * d / Math.max(1, pinch0.d)))
    view.value.ox = pinch0.ox + (x1 + x2) / 2 - pinch0.mx
    view.value.oy = pinch0.oy + (y1 + y2) / 2 - pinch0.my
    return
  }
  if (!drag) return
  const [x, y] = pointer(e)
  if (drag.pan) { view.value.ox = drag.pan.ox + x - drag.pan.x; view.value.oy = drag.pan.oy + y - drag.pan.y; return }
  drag.to = toGrid(x, y)
}
function onUp(e: PointerEvent) {
  pointers.delete(e.pointerId)
  if (pointers.size < 2) pinch0 = null
  const d = drag
  drag = null
  if (!d || d.pan || tool.value === 'select' || tool.value === 'measure') return
  let to = d.to
  if (to[0] === d.from[0] && to[1] === d.from[1]) to = [d.from[0] + (tool.value === 'wire' ? 1 : 2), d.from[1]]
  addElement(tool.value as EditorKind, d.from, to)
  if (tool.value !== 'wire') tool.value = 'select'
}
function onWheel(e: WheelEvent) {
  e.preventDefault()
  view.value.cell = Math.max(22, Math.min(90, view.value.cell * (e.deltaY < 0 ? 1.1 : 1 / 1.1)))
}
function onKey(e: KeyboardEvent) {
  if (!props.active) return
  const t = e.target as HTMLElement
  if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return
  if ((e.key === 'Delete' || e.key === 'Backspace') && selected.value) { e.preventDefault(); removeSelected() }
  if (e.key === 'Escape') { tool.value = 'select'; drag = null; measure.value = { a: null, b: null } }
  if (e.key.toLowerCase() === 'r' && selected.value && !e.ctrlKey && !e.metaKey) rotate()
  if (e.key === ' ' && S.mode === 'run') { e.preventDefault(); running.value = !running.value }
  // arrow keys move the selection (keyboard use, D43)
  if (selected.value && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
    e.preventDefault()
    const el = sel.value!
    const [dx, dy] = e.key === 'ArrowLeft' ? [-1, 0] : e.key === 'ArrowRight' ? [1, 0] : e.key === 'ArrowUp' ? [0, 1] : [0, -1]
    const mv = (p: Pt): Pt => [p[0] + dx, p[1] + dy]
    el.a = mv(el.a); el.b = mv(el.b); if (el.c) el.c = mv(el.c); if (el.d) el.d = mv(el.d)
  }
}

function colorOfPotential(v: number, lo: number, hi: number): string {
  const f = hi > lo ? (v - lo) / (hi - lo) : 0.5
  const r = Math.round(37 + f * (220 - 37)), g = Math.round(99 + f * (38 - 99)), b = Math.round(235 + f * (38 - 235))
  return `rgb(${r},${g},${b})`
}

/** Coil (bumps) from −h to h along x. */
function coil(ctx: CanvasRenderingContext2D, h: number, turns = 4, side = -1) {
  const w = (2 * h) / turns
  ctx.beginPath(); ctx.moveTo(-h, 0)
  for (let i = 0; i < turns; i++) ctx.arc(-h + w * (i + 0.5), 0, w / 2, Math.PI, 0, side > 0)
  ctx.stroke()
}

function drawElement(ctx: CanvasRenderingContext2D, e: El, P: typeof LIGHT, ink: string, h: number, v: ReturnType<typeof valuesOf>) {
  ctx.strokeStyle = ink; ctx.fillStyle = P.bg; ctx.lineWidth = 2
  const leads = (gap: number) => { ctx.beginPath(); ctx.moveTo(-h, 0); ctx.lineTo(-gap, 0); ctx.moveTo(gap, 0); ctx.lineTo(h, 0); ctx.stroke() }
  const box = () => { ctx.beginPath(); ctx.rect(-h, -7, 2 * h, 14); ctx.fill(); ctx.stroke() }
  const circleSym = (txt: string) => {
    leads(12); ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    if (!txt) return
    // upright text: undo the rotation of the element
    ctx.save(); ctx.rotate(-Math.atan2(ctx.getTransform().b, ctx.getTransform().a)); ctx.fillStyle = ink; ctx.font = `bold 12px ${FONT}`; ctx.fillText(txt, -ctx.measureText(txt).width / 2, 4.5); ctx.restore()
  }
  switch (e.kind) {
    case 'battery': {
      leads(4)
      ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-4, -13); ctx.lineTo(-4, 13); ctx.stroke()
      ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(4, -7); ctx.lineTo(4, 7); ctx.stroke()
      ctx.fillStyle = P.positive ?? '#dc2626'; ctx.font = `bold 12px ${FONT}`; ctx.fillText('+', -16, -9)
      break
    }
    case 'resistor': case 'rheostat': case 'thermistor': case 'ldr': case 'fsr': case 'fuse': {
      box()
      if (e.kind === 'rheostat') {
        const sx = -h + 2 * h * (e.pos ?? 0.5)
        ctx.strokeStyle = P.accent
        ctx.beginPath(); ctx.moveTo(sx, -20); ctx.lineTo(sx, -8); ctx.moveTo(sx - 4, -12); ctx.lineTo(sx, -8); ctx.lineTo(sx + 4, -12); ctx.stroke()
      }
      if (e.kind === 'thermistor') { ctx.beginPath(); ctx.moveTo(-h * 0.8, 12); ctx.lineTo(h * 0.8, -12); ctx.lineTo(h * 0.8 + 6, -12); ctx.stroke() }
      if (e.kind === 'ldr') { ctx.beginPath(); for (const o of [-6, 4]) { ctx.moveTo(o - 6, -20); ctx.lineTo(o, -10); ctx.moveTo(o, -10); ctx.lineTo(o - 1, -14); ctx.moveTo(o, -10); ctx.lineTo(o - 4, -12) } ctx.stroke() }
      if (e.kind === 'fsr') { ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(0, -9); ctx.moveTo(-4, -13); ctx.lineTo(0, -9); ctx.lineTo(4, -13); ctx.stroke() }
      if (e.kind === 'fuse') {
        const blown = v ? v.X === 0 : false
        ctx.beginPath()
        if (blown) { ctx.moveTo(-h, 0); ctx.lineTo(-4, 0); ctx.moveTo(4, -3); ctx.lineTo(h, 0) } else { ctx.moveTo(-h, 0); ctx.lineTo(h, 0) }
        ctx.strokeStyle = blown ? P.friction : ink; ctx.stroke()
      }
      break
    }
    case 'lamp': {
      const br = Math.max(0, Math.min(1.4, v?.X ?? 0))
      if (br > 0.005) {
        const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 14 + 24 * Math.min(1, br))
        g.addColorStop(0, `rgba(253, 224, 71, ${0.25 + 0.65 * Math.min(1, br)})`); g.addColorStop(1, 'rgba(253, 224, 71, 0)')
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 14 + 24 * Math.min(1, br), 0, Math.PI * 2); ctx.fill()
      }
      ctx.fillStyle = P.bg; ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(-7.8, -7.8); ctx.lineTo(7.8, 7.8); ctx.moveTo(7.8, -7.8); ctx.lineTo(-7.8, 7.8); ctx.stroke()
      leads(11)
      break
    }
    case 'switch': {
      leads(10)
      ctx.beginPath(); ctx.moveTo(-10, 0)
      if (e.closed) ctx.lineTo(10, 0); else ctx.lineTo(8, -12)
      ctx.stroke()
      ctx.fillStyle = ink
      ctx.beginPath(); ctx.arc(-10, 0, 2.5, 0, Math.PI * 2); ctx.arc(10, 0, 2.5, 0, Math.PI * 2); ctx.fill()
      break
    }
    case 'ammeter': case 'voltmeter': circleSym(e.kind === 'ammeter' ? 'A' : 'V'); break
    case 'galvanometer': {
      circleSym('')
      // needle: deflection I/ig (−1 … 1 maps to −60° … 60°)
      const f = Math.max(-1.1, Math.min(1.1, v?.X ?? 0))
      ctx.save(); ctx.rotate(-Math.atan2(ctx.getTransform().b, ctx.getTransform().a))
      ctx.strokeStyle = P.friction; ctx.lineWidth = 1.6
      ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(9 * Math.sin(f * Math.PI / 3), 8 - 15 * Math.cos(f * Math.PI / 3)); ctx.stroke()
      ctx.fillStyle = ink; ctx.font = `bold 9px ${FONT}`; ctx.fillText('G', -3, 10)
      ctx.restore()
      break
    }
    case 'capacitor': {
      leads(4)
      ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-4, -12); ctx.lineTo(-4, 12); ctx.moveTo(4, -12); ctx.lineTo(4, 12); ctx.stroke()
      break
    }
    case 'inductor': { leads(Math.min(h, 18)); ctx.lineWidth = 2; ctx.save(); ctx.translate(0, 0); coil(ctx, Math.min(h, 18), 4); ctx.restore(); break }
    case 'ac': {
      leads(12); ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(-7, 0); ctx.bezierCurveTo(-4, -9, -1, -9, 0, 0); ctx.bezierCurveTo(1, 9, 4, 9, 7, 0); ctx.stroke()
      break
    }
    case 'diode': {
      leads(7)
      ctx.fillStyle = v && v.X ? (P.accent) : ink
      ctx.beginPath(); ctx.moveTo(-7, -8); ctx.lineTo(-7, 8); ctx.lineTo(7, 0); ctx.closePath(); ctx.fill()
      ctx.beginPath(); ctx.moveTo(7, -8); ctx.lineTo(7, 8); ctx.stroke()
      break
    }
    case 'motor': {
      leads(13); ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      const a = angle[e.id] ?? 0
      ctx.save(); ctx.rotate(a); ctx.strokeStyle = P.accent; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(9, 0); ctx.moveTo(0, -9); ctx.lineTo(0, 9); ctx.stroke(); ctx.restore()
      ctx.save(); ctx.rotate(-Math.atan2(ctx.getTransform().b, ctx.getTransform().a)); ctx.fillStyle = ink; ctx.font = `bold 11px ${FONT}`
      const t = e.generator ? 'G' : 'M'; ctx.fillText(t, -ctx.measureText(t).width / 2, 4); ctx.restore()
      break
    }
    case 'probe': {
      ctx.setLineDash([3, 3]); leads(6); ctx.setLineDash([])
      const col = (e.channel ?? 1) === 2 ? '#0891b2' : '#d97706'
      ctx.strokeStyle = col; ctx.fillStyle = col
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.arc(-h, 0, 3, 0, Math.PI * 2); ctx.fill()
      break
    }
    default: break
  }
}

function draw(now: number) {
  const c = canvas.value, w = wrap.value
  if (!c || !w) return
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 0
  last = now
  if (S.mode === 'run' && running.value && dt > 0) advance(dt * S.scale)
  phase += dt
  const W = w.clientWidth, H = w.clientHeight
  if (W <= 0 || H <= 0) return
  view.value.w = W; view.value.h = H
  const dpr = window.devicePixelRatio || 1
  if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); c.style.width = `${W}px`; c.style.height = `${H}px` }
  const ctx = c.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const P = state.theme === 'dark' ? DARK : LIGHT
  ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H)
  const cell = view.value.cell
  ctx.fillStyle = P.gridMajor
  const [gx0, gy0] = toGrid(0, 0), [gx1, gy1] = toGrid(W, H)
  for (let i = gx0 - 1; i <= gx1 + 1; i++) for (let j = gy1 - 1; j <= gy0 + 1; j++) { const [x, y] = toPx([i, j]); ctx.fillRect(x - 1, y - 1, 2, 2) }
  const s = sol.value
  const pots = s && s.ok ? Object.values(s.nodes).filter((v): v is number => v !== null) : []
  const lo = pots.length ? Math.min(...pots) : 0, hi = pots.length ? Math.max(...pots) : 0
  const ok = S.mode === 'run' ? !!live.value : !!s?.ok
  // centre of the circuit (grid units): meter readings go on the side facing away from it
  const allPts = S.elements.flatMap(e => [e.a, e.b, ...(e.c ? [e.c] : []), ...(e.d ? [e.d] : [])])
  const centre: Pt = allPts.length ? [(Math.min(...allPts.map(p => p[0])) + Math.max(...allPts.map(p => p[0]))) / 2, (Math.min(...allPts.map(p => p[1])) + Math.max(...allPts.map(p => p[1]))) / 2] : [0, 0]
  for (const e of S.elements) {
    const isSel = e.id === selected.value
    const ink = isSel ? P.accent : P.text
    const v = valuesOf(e.id)
    if (e.kind === 'ground') {
      const [x, y] = toPx(e.a)
      ctx.strokeStyle = ink; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 10); ctx.moveTo(x - 10, y + 10); ctx.lineTo(x + 10, y + 10); ctx.moveTo(x - 6, y + 14); ctx.lineTo(x + 6, y + 14); ctx.moveTo(x - 2, y + 18); ctx.lineTo(x + 2, y + 18); ctx.stroke()
      continue
    }
    const pairs: Array<[Pt, Pt, number]> = [[e.a, e.b, 0]]
    if (FOUR_TERMINAL.has(e.kind) && e.c && e.d) pairs.push([e.c, e.d, 1])
    for (const [pa, pb, part] of pairs) {
      const [x0, y0] = toPx(pa), [x1, y1] = toPx(pb)
      const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2
      const half = e.kind === 'wire' || e.kind === 'rcd' ? 0 : Math.min(L / 2 - 2, cell * 0.42)
      ctx.lineWidth = 2; ctx.lineCap = 'round'
      const lead = (xa: number, ya: number, xb: number, yb: number, node: Pt) => {
        ctx.strokeStyle = S.showPotential && s?.ok && s.nodes[key(node)] !== null && s.nodes[key(node)] !== undefined ? colorOfPotential(s.nodes[key(node)]!, lo, hi) : ink
        ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xb, yb); ctx.stroke()
      }
      if (e.kind === 'wire' || e.kind === 'rcd') lead(x0, y0, x1, y1, pa)
      else { lead(x0, y0, mx - ux * half, my - uy * half, pa); lead(mx + ux * half, my + uy * half, x1, y1, pb) }
      ctx.save(); ctx.translate(mx, my); ctx.rotate(Math.atan2(dy, dx))
      if (e.kind === 'transformer') {
        ctx.strokeStyle = ink; ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(-half, 0); ctx.lineTo(-Math.min(half, 18), 0); ctx.moveTo(Math.min(half, 18), 0); ctx.lineTo(half, 0); ctx.stroke()
        coil(ctx, Math.min(half, 18), 4, part === 0 ? 1 : -1)
      } else drawElement(ctx, e, P, ink, half, v)
      ctx.restore()
      if (e.kind === 'transformer' && e.c && e.d) {
        // turns beside each winding, upright, on the side facing the other winding (the core): the outer sides carry
        // the name and the neighbours' labels. n₁ a little above the middle, n₂ a little below, so they never meet.
        const nx = -uy, ny = ux
        const [o0, o1] = part === 0 ? [toPx(e.c), toPx(e.d)] : [toPx(e.a), toPx(e.b)]
        const side = nx * ((o0[0] + o1[0]) / 2 - mx) + ny * ((o0[1] + o1[1]) / 2 - my) >= 0 ? 1 : -1
        const t = part === 0 ? `n₁ = ${e.n1}` : `n₂ = ${e.n2}`
        ctx.font = `11px ${FONT}`; ctx.fillStyle = isSel ? P.accent : P.text2
        const tw = ctx.measureText(t).width
        const tx = mx + side * nx * 12, ty = my + side * ny * 12 + (part === 0 ? -10 : 14)
        ctx.fillText(t, Math.abs(nx) > Math.abs(ny) ? (side * nx > 0 ? tx : tx - tw) : tx - tw / 2, ty + 4)
      }
      // current dots: a → b for I > 0 (the second pair: Y of the run, Iparts of the steady state)
      const I = part === 0 ? v?.I ?? null : e.kind === 'transformer' ? (S.mode === 'run' ? v?.Y ?? null : 0) : e.kind === 'rcd' ? (S.mode === 'run' ? live.value?.X[S.elements.indexOf(e)] ?? null : sol.value?.elements[e.id]?.Iparts?.[1] ?? null) : null
      if (S.flow && ok && I !== null && Number.isFinite(I) && Math.abs(I) > 1e-9 && e.kind !== 'capacitor' && e.kind !== 'probe') {
        const sign = e.kind === 'transformer' && part === 1 ? -1 : 1
        const speed = sign * Math.sign(I) * Math.min(160, 30 + 40 * Math.log10(1 + Math.abs(I) * 100))
        const gap = 18
        const off = ((phase * speed) % gap + gap) % gap
        ctx.fillStyle = P.accent
        for (let dd = off; dd < L; dd += gap) { ctx.beginPath(); ctx.arc(x0 + ux * dd, y0 + uy * dd, 2, 0, Math.PI * 2); ctx.fill() }
      }
      if (part === 1) continue
      // labels
      // (an RCD writes its name beside its body, below)
      if (e.kind !== 'wire' && e.kind !== 'rcd') {
        const nx = -uy, ny = ux
        const lx = mx + nx * 24, ly = my + ny * 24
        ctx.font = `12px ${FONT}`; ctx.fillStyle = isSel ? P.accent : P.text2
        const parts = [label(e)]
        // a transformer shows its turns beside each winding instead
        if (S.showValues && e.kind !== 'transformer') parts.push(paramText(e))
        const vertical = Math.abs(nx) > Math.abs(ny)
        // beside a vertical element the name and the value go on two lines (half as wide: elements three or four
        // cells apart no longer run into each other's labels); under a horizontal one, on one line
        const lines = vertical ? parts.filter(Boolean) : [parts.filter(Boolean).join('  ')]
        const l0 = ly + 4 - (lines.length - 1) * 7
        lines.forEach((text, i) => {
          const tw = ctx.measureText(text).width
          ctx.fillText(text, vertical ? (nx > 0 ? lx : lx - tw) : lx - tw / 2, l0 + i * 14)
        })
        const below = l0 + (lines.length - 1) * 14 - 4
        // meter readings
        if ((e.kind === 'ammeter' || e.kind === 'voltmeter' || e.kind === 'galvanometer' || e.kind === 'probe') && v) {
          const rv = e.kind === 'ammeter' || e.kind === 'galvanometer' ? v.I : v.U
          const rt = rv === null ? '—' : fmtQ(rv, e.kind === 'ammeter' || e.kind === 'galvanometer' ? 'A' : 'V', 4)
          ctx.font = `bold 12px ${MONO}`
          const rw = ctx.measureText(rt).width
          // the reading goes on the side with more free room: under the label when that is the label's side, else
          // opposite the label (a meter beside another element would otherwise put its reading on top of that
          // element's label). Vertical meters compare the gaps to their neighbours; horizontal ones face away from
          // the circuit's centre.
          const [ccx, ccy] = toPx(centre)
          const outer = vertical ? readingBesideLabel(e, pa, pb, nx) : nx * (mx - ccx) + ny * (my - ccy) >= 0
          const rx = outer ? (vertical ? (nx > 0 ? lx : lx - rw) : lx - rw / 2) : vertical ? (nx > 0 ? mx - 26 - rw : mx + 26) : mx - rw / 2
          const ry = outer ? below + 16 : my - ny * 26
          const probe = e.kind === 'probe'
          ctx.fillStyle = P.labelBg; ctx.fillRect(rx - 4, ry - 9, rw + 8, 17)
          ctx.fillStyle = rv !== null && rv < -1e-12 && !probe ? P.friction : P.accent
          ctx.fillText(rt, rx, ry + 4)
        }
      }
    }
    if (e.kind === 'rcd' && e.c && e.d) {
      // the device body spans the live and the neutral conductor
      const pts = [e.a, e.b, e.c, e.d].map(toPx)
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
      const bx0 = Math.min(...xs) + 0.25 * (Math.max(...xs) - Math.min(...xs)), bx1 = Math.max(...xs) - 0.25 * (Math.max(...xs) - Math.min(...xs))
      const by0 = Math.min(...ys) - 8, by1 = Math.max(...ys) + 8
      const tripped = v ? (S.mode === 'run' ? v.Y === 0 : v.X === 0) : false
      ctx.fillStyle = P.bg; ctx.strokeStyle = tripped ? P.friction : ink; ctx.lineWidth = 2
      const rx0 = Math.min(bx0, bx1) - (Math.abs(bx1 - bx0) < 30 ? 15 : 0), rx1 = Math.max(bx0, bx1) + (Math.abs(bx1 - bx0) < 30 ? 15 : 0)
      ctx.beginPath(); ctx.rect(rx0, by0, rx1 - rx0, by1 - by0); ctx.fill(); ctx.stroke()
      ctx.fillStyle = tripped ? P.friction : ink; ctx.font = `bold 11px ${FONT}`
      const t = tripped ? tl('跳闸') : 'RCD'
      ctx.fillText(t, (rx0 + rx1) / 2 - ctx.measureText(t).width / 2, (by0 + by1) / 2 + 4)
      ctx.fillStyle = isSel ? P.accent : P.text2; ctx.font = `12px ${FONT}`
      // below the live conductor, beside the body
      ctx.fillText(label(e), rx1 + 6, by0 + 26)
      if (S.showValues) ctx.fillText(paramText(e), rx1 + 6, by0 + 40)
    }
  }
  // junction dots
  const ends = new Map<string, number>()
  for (const e of S.elements) for (const p of [e.a, e.b, ...(e.c ? [e.c] : []), ...(e.d ? [e.d] : [])]) if (e.kind !== 'ground') ends.set(key(p), (ends.get(key(p)) ?? 0) + 1)
  ctx.fillStyle = P.text
  for (const [k, n] of ends) {
    if (n < 3) continue
    const [i, j] = k.split(',').map(Number)
    const [x, y] = toPx([i, j])
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill()
  }
  if (drag && !drag.pan) {
    const [x0, y0] = toPx(drag.from), [x1, y1] = toPx(drag.to)
    ctx.strokeStyle = P.accent; ctx.setLineDash([6, 4]); ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([])
  }
  for (const p of [measure.value.a, measure.value.b]) {
    if (!p) continue
    const [x, y] = toPx(p)
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.stroke()
  }
  if (S.mode === 'run') {
    ctx.font = `bold 13px ${MONO}`; ctx.fillStyle = P.text2
    ctx.fillText(`t = ${fmtQ(simT.value, 's', 5)}`, 10, 18)
  }
}

function paramText(e: El): string {
  switch (e.kind) {
    case 'battery': return `${fmtQ(e.E ?? 0, 'V', 3)}${e.r ? ` r=${fmtQ(e.r, 'Ω', 3)}` : ''}`
    case 'resistor': return fmtQ(e.R ?? 0, 'Ω', 3)
    case 'rheostat': return fmtQ(!e.c ? (e.R ?? 0) * (e.pos ?? 0.5) : e.R ?? 0, 'Ω', 3)
    case 'lamp': return `${fmtQ(e.U ?? 0, 'V', 3)} ${fmtQ(e.P ?? 0, 'W', 3)}`
    case 'capacitor': return fmtQ(e.C ?? 0, 'F', 3)
    case 'inductor': return `${fmtQ(e.L ?? 0, 'H', 3)}${e.r ? ` r=${fmtQ(e.r, 'Ω', 3)}` : ''}`
    case 'ac': return `${fmtQ(e.E ?? 0, 'V', 3)} ${fmtQ(e.f ?? 0, 'Hz', 3)}`
    case 'diode': return fmtQ(e.U ?? 0, 'V', 2)
    case 'motor': return e.generator ? `ω=${fmtQ(e.omega ?? 0, 'rad/s', 3)}` : `R=${fmtQ(e.R ?? 0, 'Ω', 3)}`
    case 'transformer': return `${e.n1}:${e.n2}`
    case 'fuse': return fmtQ(e.I ?? 0, 'A', 3)
    case 'rcd': return fmtQ(e.I ?? 0, 'A', 2)
    case 'thermistor': return `${fmtQ(e.T ?? 0, '°C', 3)}`
    case 'ldr': return `${e.lux ?? 0} lx`
    case 'fsr': return fmtQ(e.F ?? 0, 'N', 3)
    case 'galvanometer': return `${fmtQ(e.I ?? 0, 'A', 2)}`
    default: return ''
  }
}

function loop(now: number) {
  if (props.active) draw(now)
  else last = 0
  raf = requestAnimationFrame(loop)
}
onMounted(() => { raf = requestAnimationFrame(loop); window.addEventListener('keydown', onKey); requestAnimationFrame(fit) })
onBeforeUnmount(() => { cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey) })
watch(() => props.active, on => { if (on) last = 0 })

// ---- Scope ----
const scope = computed(() => {
  void scopeTick.value
  const t1 = simT.value, t0 = Math.max(0, t1 - S.span)
  const i0 = buf.t.findIndex(t => t >= t0)
  const sl = <T,>(a: T[]) => (i0 < 0 ? [] : a.slice(i0))
  return { t: sl(buf.t), ch1: sl(buf.ch1), ch2: sl(buf.ch2), u: sl(buf.u), i: sl(buf.i), range: [t0, Math.max(t1, t0 + S.span)] as [number, number] }
})
const SCALES = [1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001, 5e-4, 2e-4, 1e-4]
const SPANS = [10, 5, 2, 1, 0.5, 0.2, 0.1, 0.06, 0.05, 0.04, 0.02, 0.01, 0.005, 0.004, 0.002, 0.001]

// ---- Formulas for the selected element ----
interface F { title: string; tex: string; expr: string; vars: Array<{ name: string; symbol: string; value: number; unit: string }>; unit: string; lhs: string; result: number | null }
const selFormulas = computed<F[]>(() => {
  void scopeTick.value
  const e = sel.value, v = e ? valuesOf(e.id) : null
  if (!e || !v || v.U === null || v.I === null) return []
  const U = v.U, I = v.I
  const out: F[] = []
  const R = e.kind === 'resistor' ? e.R! : e.kind === 'lamp' ? (e.U! * e.U!) / e.P! : e.kind === 'rheostat' && !e.c ? e.R! * (e.pos ?? 0.5) : (e.kind === 'thermistor' || e.kind === 'ldr' || e.kind === 'fsr') ? v.X : null
  if (R !== null && R > 0) {
    out.push({ title: tl('欧姆定律'), tex: 'I = \\dfrac{U}{R}', expr: 'U/R', vars: [{ name: 'U', symbol: 'U', value: Math.abs(U), unit: 'V' }, { name: 'R', symbol: 'R', value: R, unit: 'Ω' }], unit: 'A', lhs: 'I', result: Math.abs(I) })
    out.push({ title: tl('电功率'), tex: 'P = UI = I^2R', expr: 'I^2*R', vars: [{ name: 'I', symbol: 'I', value: Math.abs(I), unit: 'A' }, { name: 'R', symbol: 'R', value: R, unit: 'Ω' }], unit: 'W', lhs: 'P', result: Math.abs(U * I) })
  }
  if (e.kind === 'thermistor') out.push({ title: tl('热敏电阻（B 值公式）'), tex: 'R = R_{25}\\,e^{B\\left(\\frac{1}{T} - \\frac{1}{298.15\\,\\mathrm{K}}\\right)}', expr: 'R25*exp(B*(1/(T + 273.15) - 1/298.15))', vars: [{ name: 'R25', symbol: 'R_{25}', value: e.R!, unit: 'Ω' }, { name: 'B', symbol: 'B', value: e.beta!, unit: '' }, { name: 'T', symbol: 't', value: e.T!, unit: '°C' }], unit: 'Ω', lhs: 'R', result: v.X })
  if (e.kind === 'galvanometer') out.push({ title: tl('指针偏转'), tex: '\\dfrac{I}{I_g}', expr: 'I/Ig', vars: [{ name: 'I', symbol: 'I', value: I, unit: 'A' }, { name: 'Ig', symbol: 'I_g', value: e.I!, unit: 'A' }], unit: '', lhs: '\\theta/\\theta_{max}', result: v.X })
  if (S.mode === 'dc' && e.kind === 'battery' && summary.value && e.id === battery.value?.id && summary.value.Rext !== null) {
    const sm = summary.value
    out.push({ title: tl('闭合电路欧姆定律'), tex: 'I = \\dfrac{E}{R + r}', expr: 'E/(R + r)', vars: [{ name: 'E', symbol: 'E', value: sm.E, unit: 'V' }, { name: 'R', symbol: 'R', value: sm.Rext!, unit: 'Ω' }, { name: 'r', symbol: 'r', value: sm.r, unit: 'Ω' }], unit: 'A', lhs: 'I', result: sm.I })
    out.push({ title: tl('路端电压'), tex: 'U = E - Ir', expr: 'E - I*r', vars: [{ name: 'E', symbol: 'E', value: sm.E, unit: 'V' }, { name: 'I', symbol: 'I', value: sm.I, unit: 'A' }, { name: 'r', symbol: 'r', value: sm.r, unit: 'Ω' }], unit: 'V', lhs: 'U', result: sm.U })
  }
  if (e.kind === 'capacitor') {
    out.push({ title: tl('电容的定义'), tex: 'Q = CU', expr: 'C*U', vars: [{ name: 'C', symbol: 'C', value: e.C!, unit: 'F' }, { name: 'U', symbol: 'U', value: U, unit: 'V' }], unit: 'C', lhs: 'Q', result: v.X })
    if (S.mode === 'run') out.push({ title: tl('电容器储存的能量'), tex: 'E_C = \\tfrac12 CU^2', expr: '0.5*C*U^2', vars: [{ name: 'C', symbol: 'C', value: e.C!, unit: 'F' }, { name: 'U', symbol: 'U', value: U, unit: 'V' }], unit: 'J', lhs: 'E_C', result: null })
  }
  if (S.mode === 'run') {
    if (e.kind === 'inductor') out.push({ title: tl('线圈储存的磁场能'), tex: 'E_L = \\tfrac12 LI^2', expr: '0.5*L*I^2', vars: [{ name: 'L', symbol: 'L', value: e.L!, unit: 'H' }, { name: 'I', symbol: 'I', value: I, unit: 'A' }], unit: 'J', lhs: 'E_L', result: null })
    const r = selRms.value
    if (r && r.U !== null && e.kind === 'ac') out.push({ title: tl('正弦交流电的有效值'), tex: 'U = \\dfrac{U_m}{\\sqrt2}', expr: 'Um/sqrt(2)', vars: [{ name: 'Um', symbol: 'U_m', value: e.E!, unit: 'V' }], unit: 'V', lhs: 'U', result: r.U })
    if (e.kind === 'transformer') {
      out.push({ title: tl('变压器的电压比'), tex: '\\dfrac{U_2}{U_1} = \\dfrac{n_2}{n_1}', expr: 'U1*n2/n1', vars: [{ name: 'U1', symbol: 'U_1', value: U, unit: 'V' }, { name: 'n1', symbol: 'n_1', value: e.n1!, unit: '' }, { name: 'n2', symbol: 'n_2', value: e.n2!, unit: '' }], unit: 'V', lhs: 'U_2', result: v.X })
    }
    if (e.kind === 'motor' && !e.generator) {
      out.push({ title: tl('电动机的反电动势'), tex: "E' = U - IR_a = k\\omega", expr: 'k*w', vars: [{ name: 'k', symbol: 'k', value: e.k!, unit: '' }, { name: 'w', symbol: '\\omega', value: v.X, unit: 'rad/s' }], unit: 'V', lhs: "E'", result: U - I * (e.R ?? 0) })
      out.push({ title: tl('电动机的功率'), tex: 'UI = I^2R_a + P_{\\mathrm{mech}}', expr: 'U*I - I^2*Ra', vars: [{ name: 'U', symbol: 'U', value: U, unit: 'V' }, { name: 'I', symbol: 'I', value: I, unit: 'A' }, { name: 'Ra', symbol: 'R_a', value: e.R!, unit: 'Ω' }], unit: 'W', lhs: 'P_{\\mathrm{mech}}', result: (e.k ?? 0) * I * v.X })
    }
  }
  return out
})
const relationText = computed(() => (sol.value?.ok ? sol.value.relations.map(r => `${r.kind === 'series' ? tl('串联') : tl('并联')}：${r.elements.map(nameOf).join(tl('、'))}`) : []))
const EVENT_TEXT: Record<string, string> = {
  diodeOn: tl('二极管导通'), diodeOff: tl('二极管截止'), motorStart: tl('电动机开始转动'), motorStop: tl('电动机停转'), motorReverse: tl('电动机反转'),
  fuseBlown: tl('保险丝熔断'), rcdTripped: tl('漏电保护器跳闸')
}
const presetIds = (g: string) => Object.keys(PRESETS).filter(k => PRESETS[k].group === g)
// 26.55 (D96): the learning path and the global search open the circuit lab at a preset
watch(() => labRequest.seq, () => { if (labRequest.lab === 'circuit' && labRequest.preset) { const id = labRequest.preset; labRequest.preset = null; loadPreset(id) } }, { immediate: true, flush: 'post' })
</script>

<template>
  <div class="lab-shell">
    <div class="stage">
      <div class="bar" role="toolbar" :aria-label="tl('电路元件')">
        <button class="tb" :class="{ on: tool === 'select' }" :title="tl('选择元件（点开关两次可通断；Delete 删除，R 旋转，方向键移动）')" @click="tool = 'select'"><Icon name="select" :size="18" /></button>
        <template v-for="(g, gi) in groups" :key="gi">
          <span class="sep" />
          <button v-for="k in g" :key="k" class="tb" :class="{ on: tool === k }" :title="tl('{0}：从一个格点拖到另一个格点', [KIND_INFO[k].label])" :aria-label="KIND_INFO[k].label" @click="tool = k"><Icon :name="KIND_INFO[k].icon" :size="18" /></button>
        </template>
        <button class="tb" :class="{ on: tool === 'measure' }" :title="tl('等效电阻：依次点击两个格点')" @click="tool = 'measure'; measure = { a: null, b: null }"><Icon name="ruler" :size="18" /></button>
      </div>
      <div class="bar">
        <select class="field small" :value="S.preset" :aria-label="tl('示例电路')" @change="loadPreset(($event.target as HTMLSelectElement).value)">
          <optgroup v-for="g in PRESET_GROUPS" :key="g.id" :label="g.label">
            <option v-for="id in presetIds(g.id)" :key="id" :value="id">{{ PRESETS[id].label }}</option>
          </optgroup>
        </select>
        <button class="btn ghost small" :title="tl('清空电路')" @click="S.elements = []; selected = null; resetRun()"><Icon name="trash" :size="15" /></button>
        <span class="sep" />
        <div class="lab-seg" role="tablist">
          <button :class="{ on: S.mode === 'dc' }" :title="tl('稳态：电容器充满、电感中电流恒定之后的电压与电流')" @click="setMode('dc')">{{ tl('稳态') }}</button>
          <button :class="{ on: S.mode === 'run' }" :title="tl('随时间运行：电容充放电、自感、交流电、电动机')" @click="setMode('run')">{{ tl('运行') }}</button>
        </div>
        <template v-if="S.mode === 'run'">
          <button class="btn small primary" @click="running = !running">{{ running ? tl('暂停') : tl('继续') }}</button>
          <button class="btn ghost small" :title="tl('回到 t = 0（电容不带电、线圈中没有电流）')" @click="resetRun()">{{ tl('重来') }}</button>
          <label class="ctl small">{{ tl('时间流速') }}
            <select v-model.number="S.scale" class="field small">
              <option v-for="s in SCALES" :key="s" :value="s">{{ s >= 1 ? `${s}×` : `1/${Math.round(1 / s)}` }}</option>
            </select>
          </label>
        </template>
      </div>
      <div ref="wrap" class="canvas-wrap">
        <canvas ref="canvas" @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp" @wheel="onWheel" @contextmenu.prevent />
        <div class="hint tiny muted">{{ tool === 'select' ? tl('点选元件查看与修改；Shift 或右键拖动平移，滚轮或双指缩放') : tool === 'measure' ? tl('依次点击两个格点，求它们之间的等效电阻（电源不计入）') : tool === 'ground' ? tl('点击一个格点接地') : tl('从一个格点拖到另一个格点放置{0}；端点重合即连通', [KIND_INFO[tool as EditorKind].label]) }}</div>
      </div>
      <div v-if="S.mode === 'run'" class="scope">
        <div class="scope-head small">
          <Icon name="scope" :size="15" /><b>{{ tl('示波器') }}</b>
          <span class="ch ch1">CH1</span><span class="ch ch2">CH2</span>
          <span v-if="sel" class="ch chi">{{ tl('{0} 的电流', [label(sel)]) }}</span>
          <span class="grow" />
          <label class="ctl">{{ tl('时间跨度') }}
            <select v-model.number="S.span" class="field small"><option v-for="s in SPANS" :key="s" :value="s">{{ fmtQ(s, 's', 3) }}</option></select>
          </label>
        </div>
        <div class="scope-charts">
          <LabChart :series="[{ x: scope.t, y: scope.ch1, color: '#d97706', label: 'CH1' }, { x: scope.t, y: scope.ch2, color: '#0891b2', label: 'CH2' }]" :x-range="scope.range" :x-label="tl('t（s）')" :y-label="tl('U（V）')" :height="130" />
          <LabChart v-if="sel" :series="[{ x: scope.t, y: scope.i, color: '#7c3aed', label: tl('{0} 的电流', [label(sel)]) }]" :x-range="scope.range" :x-label="tl('t（s）')" :y-label="tl('I（A）')" :height="110" />
        </div>
      </div>
    </div>
    <aside class="side">
      <div v-if="runError" class="issue small fatal">{{ ISSUE_TEXT[runError] ?? runError }}</div>
      <div v-if="sol && sol.issues.length" class="issues">
        <div v-for="(i, k) in sol.issues" :key="k" class="issue small" :class="{ fatal: i.fatal }">
          <b v-if="i.elements.length">{{ i.elements.map(nameOf).join(tl('、')) }}：</b>{{ ISSUE_TEXT[i.kind] }}
        </div>
      </div>
      <section v-if="summary && S.mode === 'dc'" class="block">
        <div class="btitle">{{ tl('电源与外电路') }}</div>
        <div class="kv small">
          <span>{{ tl('电动势 E') }}</span><b class="mono">{{ fmtQ(summary.E, 'V') }}</b>
          <span>{{ tl('内阻 r') }}</span><b class="mono">{{ fmtQ(summary.r, 'Ω') }}</b>
          <span>{{ tl('干路电流 I') }}</span><b class="mono">{{ fmtQ(summary.I, 'A') }}</b>
          <span>{{ tl('路端电压 U') }}</span><b class="mono">{{ fmtQ(summary.U, 'V') }}</b>
          <span>{{ tl('外电路电阻 R') }}</span><b class="mono">{{ summary.Rext === null ? '∞' : fmtQ(summary.Rext, 'Ω') }}</b>
          <span>{{ tl('输出功率 P出') }}</span><b class="mono">{{ fmtQ(summary.Pout, 'W') }}</b>
          <span>{{ tl('总功率 EI') }}</span><b class="mono">{{ fmtQ(summary.Ptotal, 'W') }}</b>
        </div>
      </section>
      <section v-if="S.mode === 'run'" class="block">
        <div class="btitle">{{ tl('能量（从 t = 0 起）') }}</div>
        <div class="kv small">
          <span>{{ tl('电源输出') }}</span><b class="mono">{{ fmtQ(ledger.source, 'J') }}</b>
          <span>{{ tl('电阻发热（焦耳热）') }}</span><b class="mono">{{ fmtQ(ledger.heat, 'J') }}</b>
          <span>{{ tl('电容、线圈与转子储能') }}</span><b class="mono">{{ fmtQ(ledger.stored, 'J') }}</b>
          <template v-if="ledger.mech"><span>{{ tl('电动机输出的机械能') }}</span><b class="mono">{{ fmtQ(ledger.mech, 'J') }}</b></template>
          <template v-if="ledger.jump"><span>{{ tl('突变中损失（火花）') }}</span><b class="mono">{{ fmtQ(ledger.jump, 'J') }}</b></template>
          <span>{{ tl('差额') }}</span><b class="mono">{{ fmtQ(ledger.source - ledger.heat - ledger.stored - ledger.mech - ledger.jump, 'J') }}</b>
        </div>
        <div class="tiny muted">{{ tl('计算：{0} 步，最小步长 {1}', [lastStats.steps, fmtQ(lastStats.minStep, 's', 3)]) }}</div>
      </section>
      <section v-if="S.mode === 'run' && runEvents.length" class="block">
        <div class="btitle">{{ tl('事件') }}</div>
        <div v-for="(ev, k) in runEvents.slice(0, 8)" :key="k" class="small ev"><span class="mono">{{ fmtQ(ev.t, 's', 6) }}</span> {{ nameOf(ev.element) }} {{ EVENT_TEXT[ev.kind] ?? ev.kind }}</div>
      </section>
      <section v-if="measure.a && measure.b && S.mode === 'dc'" class="block">
        <div class="btitle">{{ tl('等效电阻') }}</div>
        <div class="small">R = <b class="mono">{{ measured === null ? tl('∞（两点之间没有通路）') : fmtQ(measured, 'Ω') }}</b></div>
      </section>
      <section v-if="sel" class="block">
        <div class="btitle">{{ KIND_INFO[sel.kind].label }} <span class="muted">{{ label(sel) }}</span></div>
        <div class="fields">
          <template v-if="sel.kind === 'battery'">
            <label>{{ tl('电动势 E') }}</label><NumField :model-value="sel.E ?? 0" unit="V" @update:model-value="v => (sel!.E = v)" />
            <label>{{ tl('内阻 r') }}</label><NumField :model-value="sel.r ?? 0" unit="Ω" :min="0" @update:model-value="v => (sel!.r = v)" />
          </template>
          <template v-if="sel.kind === 'resistor'"><label>{{ tl('电阻 R') }}</label><NumField :model-value="sel.R ?? 0" unit="Ω" :min="0" @update:model-value="v => (sel!.R = v)" /></template>
          <template v-if="sel.kind === 'lamp'">
            <label>{{ tl('额定电压') }}</label><NumField :model-value="sel.U ?? 0" unit="V" :min="1e-6" @update:model-value="v => (sel!.U = v)" />
            <label>{{ tl('额定功率') }}</label><NumField :model-value="sel.P ?? 0" unit="W" :min="1e-9" @update:model-value="v => (sel!.P = v)" />
          </template>
          <template v-if="sel.kind === 'rheostat'">
            <label>{{ tl('总电阻') }}</label><NumField :model-value="sel.R ?? 0" unit="Ω" :min="0" @update:model-value="v => (sel!.R = v)" />
            <label>{{ tl('滑片位置') }}</label><input v-model.number="sel.pos" type="range" min="0" max="1" step="0.0005" :aria-label="tl('滑片位置')" />
          </template>
          <template v-if="sel.kind === 'capacitor'"><label>{{ tl('电容 C') }}</label><NumField :model-value="sel.C ?? 0" unit="F" :min="0" @update:model-value="v => (sel!.C = v)" /></template>
          <template v-if="sel.kind === 'ammeter' || sel.kind === 'voltmeter'">
            <label>{{ tl('内阻') }}</label><NumField :model-value="sel.r ?? 0" unit="Ω" :min="0" @update:model-value="v => (sel!.r = v)" />
            <span />
            <span class="tiny muted">{{ sel.kind === 'ammeter' ? tl('0 表示理想电流表（内阻为零）') : tl('0 表示理想电压表（内阻无穷大）') }}</span>
          </template>
          <template v-if="sel.kind === 'switch'"><label>{{ tl('状态') }}</label><label class="check"><input v-model="sel.closed" type="checkbox" />{{ tl('闭合') }}</label></template>
          <template v-if="sel.kind === 'inductor'">
            <label>{{ tl('自感系数 L') }}</label><NumField :model-value="sel.L ?? 0" unit="H" :min="1e-12" @update:model-value="v => (sel!.L = v)" />
            <label>{{ tl('线圈电阻') }}</label><NumField :model-value="sel.r ?? 0" unit="Ω" :min="0" @update:model-value="v => (sel!.r = v)" />
          </template>
          <template v-if="sel.kind === 'ac'">
            <label>{{ tl('峰值 U_m') }}</label><NumField :model-value="sel.E ?? 0" unit="V" @update:model-value="v => (sel!.E = v)" />
            <label>{{ tl('频率 f') }}</label><NumField :model-value="sel.f ?? 0" unit="Hz" :min="0" @update:model-value="v => (sel!.f = v)" />
            <label>{{ tl('初相位') }}</label><NumField :model-value="sel.phase ?? 0" unit="rad" @update:model-value="v => (sel!.phase = v)" />
            <label>{{ tl('内阻 r') }}</label><NumField :model-value="sel.r ?? 0" unit="Ω" :min="0" @update:model-value="v => (sel!.r = v)" />
          </template>
          <template v-if="sel.kind === 'diode'">
            <label>{{ tl('导通电压') }}</label><NumField :model-value="sel.U ?? 0" unit="V" :min="0" @update:model-value="v => (sel!.U = v)" />
            <label>{{ tl('导通电阻') }}</label><NumField :model-value="sel.r ?? 0" unit="Ω" :min="0" @update:model-value="v => (sel!.r = v)" />
          </template>
          <template v-if="sel.kind === 'motor'">
            <label>{{ tl('用作') }}</label>
            <div class="lab-seg"><button :class="{ on: !sel.generator }" @click="sel!.generator = false">{{ tl('电动机') }}</button><button :class="{ on: sel.generator }" @click="sel!.generator = true">{{ tl('发电机') }}</button></div>
            <label>{{ tl('线圈电阻 R_a') }}</label><NumField :model-value="sel.R ?? 0" unit="Ω" :min="0" @update:model-value="v => (sel!.R = v)" />
            <label>{{ tl('电机常数 k') }}</label><NumField :model-value="sel.k ?? 0" unit="V·s" :min="1e-9" @update:model-value="v => (sel!.k = v)" />
            <template v-if="sel.generator"><label>{{ tl('转速 ω') }}</label><NumField :model-value="sel.omega ?? 0" unit="rad/s" @update:model-value="v => (sel!.omega = v)" /></template>
            <template v-else>
              <label>{{ tl('转动惯量 J') }}</label><NumField :model-value="sel.J ?? 0" unit="kg·m²" :min="1e-12" @update:model-value="v => (sel!.J = v)" />
              <label>{{ tl('摩擦系数 b') }}</label><NumField :model-value="sel.fr ?? 0" unit="N·m·s" :min="0" @update:model-value="v => (sel!.fr = v)" />
              <label>{{ tl('负载转矩') }}</label><NumField :model-value="sel.load ?? 0" unit="N·m" :min="0" @update:model-value="v => (sel!.load = v)" />
            </template>
          </template>
          <template v-if="sel.kind === 'transformer'">
            <label>{{ tl('原线圈匝数 n₁') }}</label><NumField :model-value="sel.n1 ?? 0" :min="1" :step="10" @update:model-value="v => (sel!.n1 = v)" />
            <label>{{ tl('副线圈匝数 n₂') }}</label><NumField :model-value="sel.n2 ?? 0" :min="1" :step="10" @update:model-value="v => (sel!.n2 = v)" />
            <label>{{ tl('励磁电感') }}</label><NumField :model-value="sel.L ?? 0" unit="H" :min="1e-9" @update:model-value="v => (sel!.L = v)" />
            <label>{{ tl('原线圈电阻') }}</label><NumField :model-value="sel.r ?? 0" unit="Ω" :min="0" @update:model-value="v => (sel!.r = v)" />
            <label>{{ tl('副线圈电阻') }}</label><NumField :model-value="sel.r2 ?? 0" unit="Ω" :min="0" @update:model-value="v => (sel!.r2 = v)" />
          </template>
          <template v-if="sel.kind === 'fuse'"><label>{{ tl('额定电流') }}</label><NumField :model-value="sel.I ?? 0" unit="A" :min="1e-6" @update:model-value="v => (sel!.I = v)" /></template>
          <template v-if="sel.kind === 'rcd'"><label>{{ tl('动作电流') }}</label><NumField :model-value="sel.I ?? 0" unit="A" :min="1e-6" @update:model-value="v => (sel!.I = v)" /></template>
          <template v-if="sel.kind === 'thermistor'">
            <label>{{ tl('25 °C 时的电阻') }}</label><NumField :model-value="sel.R ?? 0" unit="Ω" :min="1e-6" @update:model-value="v => (sel!.R = v)" />
            <label>{{ tl('B 值') }}</label><NumField :model-value="sel.beta ?? 0" unit="K" @update:model-value="v => (sel!.beta = v)" />
            <label>{{ tl('温度') }}</label><input v-model.number="sel.T" type="range" min="-20" max="120" step="1" :aria-label="tl('温度')" />
          </template>
          <template v-if="sel.kind === 'ldr'">
            <label>{{ tl('10 lx 时的电阻') }}</label><NumField :model-value="sel.R ?? 0" unit="Ω" :min="1e-6" @update:model-value="v => (sel!.R = v)" />
            <label>{{ tl('光照强度') }}</label><input :value="Math.log10(Math.max(1, sel.lux ?? 1))" type="range" min="0" max="5" step="0.05" :aria-label="tl('光照强度')" @input="sel!.lux = Math.round(10 ** Number(($event.target as HTMLInputElement).value))" />
          </template>
          <template v-if="sel.kind === 'fsr'">
            <label>{{ tl('无压力时的电阻') }}</label><NumField :model-value="sel.R ?? 0" unit="Ω" :min="1e-6" @update:model-value="v => (sel!.R = v)" />
            <label>{{ tl('压力') }}</label><input v-model.number="sel.F" type="range" min="0" max="50" step="0.1" :aria-label="tl('压力')" />
          </template>
          <template v-if="sel.kind === 'galvanometer'">
            <label>{{ tl('内阻 R_g') }}</label><NumField :model-value="sel.r ?? 0" unit="Ω" :min="0" @update:model-value="v => (sel!.r = v)" />
            <label>{{ tl('满偏电流 I_g') }}</label><NumField :model-value="sel.I ?? 0" unit="A" :min="1e-12" @update:model-value="v => (sel!.I = v)" />
          </template>
          <template v-if="sel.kind === 'probe'">
            <label>{{ tl('通道') }}</label>
            <div class="lab-seg"><button :class="{ on: (sel.channel ?? 1) === 1 }" @click="sel!.channel = 1">CH1</button><button :class="{ on: sel.channel === 2 }" @click="sel!.channel = 2">CH2</button></div>
          </template>
        </div>
        <div class="actions">
          <button class="btn ghost small" :title="tl('旋转 90°（R）')" @click="rotate">{{ tl('旋转') }}</button>
          <button class="btn ghost small" :title="tl('交换两端（电源正负极、电表接线柱）')" @click="reverse">{{ tl('反向') }}</button>
          <button v-if="sel.kind === 'rheostat'" class="btn ghost small" @click="toggleDivider">{{ sel.c ? tl('改为限流接法') : tl('改为分压接法') }}</button>
          <button class="btn ghost small danger" @click="removeSelected">{{ tl('删除') }}</button>
        </div>
        <div v-if="valuesOf(sel.id)" class="kv small">
          <span>{{ S.mode === 'run' ? tl('电压 u（此刻）') : tl('电压 U') }}</span><b class="mono">{{ valuesOf(sel.id)!.U === null ? '—' : fmtQ(valuesOf(sel.id)!.U!, 'V') }}</b>
          <span>{{ S.mode === 'run' ? tl('电流 i（此刻）') : tl('电流 I') }}</span><b class="mono">{{ fmtQ(valuesOf(sel.id)!.I ?? 0, 'A') }}</b>
          <template v-if="selRms && selRms.U !== null"><span>{{ tl('电压有效值') }}</span><b class="mono">{{ fmtQ(selRms.U, 'V') }}</b><span>{{ tl('电流有效值') }}</span><b class="mono">{{ fmtQ(selRms.I, 'A') }}</b></template>
          <span>{{ sel.kind === 'battery' ? tl('输出功率') : tl('功率 P') }}</span><b class="mono">{{ valuesOf(sel.id)!.P === null ? '—' : fmtQ(Math.abs(valuesOf(sel.id)!.P!), 'W') }}</b>
          <template v-if="sel.kind === 'lamp'"><span>{{ tl('实际功率 / 额定功率') }}</span><b class="mono">{{ (valuesOf(sel.id)!.X * 100).toFixed(1) }}%</b></template>
          <template v-if="sel.kind === 'capacitor'"><span>{{ tl('电荷量 Q') }}</span><b class="mono">{{ fmtQ(valuesOf(sel.id)!.X, 'C') }}</b></template>
          <template v-if="sel.kind === 'motor' && S.mode === 'run'"><span>{{ sel.generator ? tl('转速 ω（给定）') : tl('转速 ω') }}</span><b class="mono">{{ fmtQ(valuesOf(sel.id)!.X, 'rad/s') }}</b></template>
          <template v-if="sel.kind === 'transformer' && S.mode === 'run'"><span>{{ tl('副线圈电压 U₂') }}</span><b class="mono">{{ fmtQ(valuesOf(sel.id)!.X, 'V') }}</b><span>{{ tl('副线圈电流 I₂') }}</span><b class="mono">{{ fmtQ(valuesOf(sel.id)!.Y, 'A') }}</b></template>
          <template v-if="sel.kind === 'galvanometer'"><span>{{ tl('偏转（满偏的）') }}</span><b class="mono">{{ (valuesOf(sel.id)!.X * 100).toFixed(1) }}%</b></template>
          <template v-if="sel.kind === 'thermistor' || sel.kind === 'ldr' || sel.kind === 'fsr'"><span>{{ tl('此时的电阻') }}</span><b class="mono">{{ fmtQ(valuesOf(sel.id)!.X, 'Ω') }}</b></template>
          <template v-if="sel.kind === 'fuse'"><span>{{ tl('状态') }}</span><b>{{ valuesOf(sel.id)!.X ? tl('完好') : tl('已熔断') }}</b></template>
        </div>
        <LabFormula v-for="f in selFormulas" :key="f.title" :title="f.title" :tex="f.tex" :expr="f.expr" :vars="f.vars" :unit="f.unit" :lhs="f.lhs" :result="f.result" />
      </section>
      <section v-if="relationText.length && S.mode === 'dc'" class="block">
        <div class="btitle">{{ tl('串联与并联') }}</div>
        <div v-for="t in relationText" :key="t" class="small">{{ t }}</div>
      </section>
      <section class="block">
        <div class="btitle">{{ tl('显示') }}</div>
        <label class="check small"><input v-model="S.showValues" type="checkbox" />{{ tl('元件参数') }}</label>
        <label class="check small"><input v-model="S.flow" type="checkbox" />{{ tl('电流动画（正电荷移动方向）') }}</label>
        <label v-if="S.mode === 'dc'" class="check small"><input v-model="S.showPotential" type="checkbox" />{{ tl('按电势给导线着色（红高蓝低）') }}</label>
      </section>
      <details class="block notes">
        <summary class="small">{{ tl('原理') }}</summary>
        <p class="tiny muted">{{ tl('Rust 核心用改进节点分析求解：未知量是各节点电势和理想电源的电流，方程是每个节点的基尔霍夫电流定律和每个电源的电压关系。导线、闭合开关和理想电流表把两端合成一个节点；电容器和理想电压表中没有电流（稳态）。') }}</p>
        <p class="tiny muted">{{ tl('“运行”时，核心按梯形法对时间积分（电容、电感的伴随模型），每一步与两个半步比较来控制误差（相对 10⁻¹¹）；二极管通断、保险丝熔断、漏电保护跳闸的时刻用二分法定位。线圈中的电流被切断、电容直接接到理想电源上时，状态突变，损失的能量在“能量”中列出。') }}</p>
      </details>
    </aside>
  </div>
</template>

<style scoped>
.lab-shell { display: grid; grid-template-columns: minmax(0, 1fr) calc(300px * var(--zoom)); gap: 8px; min-height: 0; height: 100%; }
.stage { display: flex; flex-direction: column; min-width: 0; min-height: 0; background: var(--pane); border-radius: var(--radius-pane, 12px); overflow: hidden; }
.bar { display: flex; align-items: center; gap: 2px; padding: 4px 8px; border-bottom: 1px solid var(--separator); flex-wrap: wrap; }
.bar .ctl { display: inline-flex; align-items: center; gap: 4px; color: var(--text-2); margin-left: 6px; }
.tb { width: 32px; height: 30px; border: 0; background: transparent; border-radius: 8px; display: grid; place-items: center; cursor: pointer; color: var(--text-2); }
.tb:hover { background: var(--fill); }
.tb.on { background: var(--accent); color: var(--on-accent); }
.sep { width: 1px; height: 20px; background: var(--separator); margin: 0 4px; }
.canvas-wrap { flex: 1; min-height: 160px; position: relative; }
canvas { position: absolute; inset: 0; touch-action: none; cursor: crosshair; }
.hint { position: absolute; left: 10px; bottom: 6px; pointer-events: none; }
.scope { border-top: 1px solid var(--separator); padding: 4px 10px 6px; }
.scope-head { display: flex; align-items: center; gap: 8px; color: var(--text-2); }
.scope-head .grow { flex: 1; }
.scope-head .ctl { display: inline-flex; align-items: center; gap: 4px; }
.ch { font-size: 11px; border-radius: 999px; padding: 0 6px; }
.ch1 { background: color-mix(in srgb, #d97706 18%, transparent); color: #b45309; }
.ch2 { background: color-mix(in srgb, #0891b2 18%, transparent); color: #0e7490; }
.chi { background: color-mix(in srgb, #7c3aed 16%, transparent); color: #6d28d9; }
.side { min-height: 0; overflow: auto; background: var(--pane); border-radius: var(--radius-pane, 12px); padding: 8px 12px; }
.block { margin-bottom: 12px; }
.btitle { font-weight: 600; font-size: var(--type-small); margin-bottom: 4px; }
.kv { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 4px 0 8px; }
.kv b { text-align: right; font-weight: 600; }
.fields { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 8px; align-items: center; margin-bottom: 6px; }
.fields > label { font-size: var(--type-small); color: var(--text-2); }
.actions { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
.danger { color: var(--danger); }
.issues { margin-bottom: 10px; }
.issue { background: var(--warning-soft); border-radius: 8px; padding: 6px 8px; margin-bottom: 4px; line-height: 1.45; }
.issue.fatal { background: color-mix(in srgb, var(--danger) 14%, transparent); }
.ev { line-height: 1.6; }
.notes summary { cursor: pointer; }
.notes p { line-height: 1.5; }
@media (max-width: 1100px) { .lab-shell { grid-template-columns: minmax(0, 1fr) calc(260px * var(--zoom)); } }
@media (max-width: 760px) { .lab-shell { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(320px, 1fr) auto; overflow: auto; } }
</style>
