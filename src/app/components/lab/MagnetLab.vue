<script setup lang="ts">
/**
 * Magnetic field experiment (26.55): straight wires perpendicular to the page (⊙ out, ⊗ in), coils and solenoids in
 * cross section, bar magnets, and a uniform field. The core (`magnetMap`) computes the field lines as contour lines of
 * the vector potential A_z (so their spacing shows the field strength exactly), the compass needles, the field at the
 * probe, the force per metre on every wire and the flux through a loop; this component draws and lets you drag. Moving
 * the loop changes the flux: the induced emf per metre of loop depth is −ΔΦ/Δt of the motion.
 */
import { computed, ref, watch } from 'vue'
import { tl } from '../../../i18n'
import { fmtQ } from '../../settings'
import type { MagnetMap } from '../../../engine/labs'
import { magnetMap } from '../../../engine/labs'
import { labState } from '../../lab/state'
import { useLabCanvas } from '../../lab/canvas'
import { FONT, MONO } from '../../../render/style'
import NumField from '../NumField.vue'
import LabFormula from './LabFormula.vue'

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })

interface Wire { kind: 'wire'; x: number; y: number; I: number }
interface Magnet { kind: 'magnet'; x: number; y: number; angle: number; length: number; thickness: number; M: number }
interface Coil { kind: 'solenoid'; x: number; y: number; angle: number; length: number; thickness: number; turns: number; I: number }
type Item = Wire | Magnet | Coil
const MU0 = 1.25663706212e-6

const PRESETS: Record<string, { label: string; items: Item[]; B?: number }> = {
  wire: { label: tl('通电直导线'), items: [{ kind: 'wire', x: 0, y: 0, I: 10 }] },
  same: { label: tl('两根同向电流'), items: [{ kind: 'wire', x: -0.05, y: 0, I: 10 }, { kind: 'wire', x: 0.05, y: 0, I: 10 }] },
  opposite: { label: tl('两根反向电流'), items: [{ kind: 'wire', x: -0.05, y: 0, I: 10 }, { kind: 'wire', x: 0.05, y: 0, I: -10 }] },
  loop: { label: tl('环形电流（截面）'), items: [{ kind: 'wire', x: 0, y: 0.04, I: 10 }, { kind: 'wire', x: 0, y: -0.04, I: -10 }] },
  solenoid: { label: tl('通电螺线管'), items: [{ kind: 'solenoid', x: 0, y: 0, angle: 0, length: 0.16, thickness: 0.05, turns: 12, I: 2 }] },
  bar: { label: tl('条形磁铁'), items: [{ kind: 'magnet', x: 0, y: 0, angle: 0, length: 0.12, thickness: 0.03, M: 8e5 }] },
  attract: { label: tl('异名磁极相对'), items: [{ kind: 'magnet', x: -0.09, y: 0, angle: 0, length: 0.1, thickness: 0.03, M: 8e5 }, { kind: 'magnet', x: 0.09, y: 0, angle: 0, length: 0.1, thickness: 0.03, M: 8e5 }] },
  repel: { label: tl('同名磁极相对'), items: [{ kind: 'magnet', x: -0.09, y: 0, angle: 0, length: 0.1, thickness: 0.03, M: 8e5 }, { kind: 'magnet', x: 0.09, y: 0, angle: Math.PI, length: 0.1, thickness: 0.03, M: 8e5 }] },
  horseshoe: { label: tl('蹄形磁铁'), items: [{ kind: 'magnet', x: -0.05, y: 0, angle: Math.PI / 2, length: 0.12, thickness: 0.03, M: 8e5 }, { kind: 'magnet', x: 0.05, y: 0, angle: -Math.PI / 2, length: 0.12, thickness: 0.03, M: 8e5 }] },
  inField: { label: tl('匀强磁场中的通电导线'), items: [{ kind: 'wire', x: 0, y: 0, I: 20 }], B: 2e-4 }
}
const S = labState('magnet', () => ({ items: PRESETS.bar.items.map(i => ({ ...i })) as Item[], B: 0, Bdir: 0, preset: 'bar', lines: 26, compass: true, scale: 1600, loop: null as null | { x1: number; y1: number; x2: number; y2: number } }))
function loadPreset(id: string) {
  const p = PRESETS[id]
  S.preset = id
  S.items = p.items.map(i => ({ ...i }))
  S.B = p.B ?? 0
  S.Bdir = 0
  selected.value = null
}

const selected = ref<number | null>(null)
const sel = computed(() => (selected.value === null ? null : S.items[selected.value] ?? null))
const tool = ref<'select' | 'out' | 'in' | 'magnet' | 'solenoid' | 'loop'>('select')
const probe = ref<{ x: number; y: number } | null>(null)

const sources = computed(() => ({
  wires: S.items.filter((i): i is Wire => i.kind === 'wire').map(w => ({ x: w.x, y: w.y, I: w.I, r: 0.004 })),
  magnets: S.items.filter((i): i is Magnet => i.kind === 'magnet').map(m => ({ x: m.x, y: m.y, angle: m.angle, length: m.length, thickness: m.thickness, M: m.M })),
  solenoids: S.items.filter((i): i is Coil => i.kind === 'solenoid').map(c => ({ x: c.x, y: c.y, angle: c.angle, length: c.length, thickness: c.thickness, turns: c.turns, I: c.I, r: 0.002 })),
  B: { x: S.B * Math.cos(S.Bdir), y: S.B * Math.sin(S.Bdir) }
}))

let map: MagnetMap | null = null
let mapKey = ''
const probeInfo = ref<{ Bx: number; By: number; A: number } | null>(null)
const forces = ref<Array<{ x: number; y: number }>>([])
const flux = ref<number | null>(null)
// emf of the moving loop: −ΔΦ/Δt between pointer moves
const emf = ref<number | null>(null)
let lastFlux: { phi: number; t: number } | null = null

const { canvas, wrap, redraw, at } = useLabCanvas(() => props.active, (ctx, w, h, _dt, P) => {
  const sc = S.scale
  const X = (x: number) => w / 2 + x * sc, Y = (y: number) => h / 2 - y * sc
  const region = { x0: -w / 2 / sc, y0: -h / 2 / sc, x1: w / 2 / sc, y1: h / 2 / sc }
  const k = JSON.stringify([sources.value, region, S.lines, S.compass, probe.value, S.loop])
  if (k !== mapKey) {
    try {
      map = magnetMap(sources.value, { region, grid: 170, lines: S.lines, arrows: S.compass ? 18 : 0, probes: probe.value ? [probe.value] : [], loop: S.loop })
      probeInfo.value = map.probes[0] ?? null
      forces.value = map.forces
      flux.value = map.flux
    } catch { map = null }
    mapKey = k
  }
  // grid (1 cm)
  ctx.strokeStyle = P.gridMinor; ctx.lineWidth = 1
  const step = 0.01
  for (let x = Math.ceil(region.x0 / step) * step; x <= region.x1; x += step) { ctx.beginPath(); ctx.moveTo(X(x), 0); ctx.lineTo(X(x), h); ctx.stroke() }
  for (let y = Math.ceil(region.y0 / step) * step; y <= region.y1; y += step) { ctx.beginPath(); ctx.moveTo(0, Y(y)); ctx.lineTo(w, Y(y)); ctx.stroke() }
  if (map) {
    // field lines
    ctx.strokeStyle = P.magnetic ?? '#a16207'; ctx.lineWidth = 1.4
    const { segs, starts } = map.contours
    ctx.beginPath()
    for (let s = 0; s < (starts[starts.length - 1] ?? 0); s++) { ctx.moveTo(X(segs[4 * s]), Y(segs[4 * s + 1])); ctx.lineTo(X(segs[4 * s + 2]), Y(segs[4 * s + 3])) }
    ctx.stroke()
    // compass needles (direction only), north half red
    if (S.compass) {
      const a = map.arrows
      const len = Math.min(w, h) / 40
      for (let i = 0; i + 3 < a.length; i += 4) {
        const bx = a[i + 2], by = a[i + 3], m = Math.hypot(bx, by)
        if (!(m > 0)) continue
        const ux = bx / m, uy = by / m, cx = X(a[i]), cy = Y(a[i + 1])
        ctx.lineWidth = 2.2
        ctx.strokeStyle = '#dc2626'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + ux * len, cy - uy * len); ctx.stroke()
        ctx.strokeStyle = '#2563eb'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - ux * len, cy + uy * len); ctx.stroke()
      }
    }
  }
  // sources
  S.items.forEach((it, i) => {
    const on = selected.value === i
    if (it.kind === 'wire') {
      const cx = X(it.x), cy = Y(it.y)
      ctx.fillStyle = P.bg; ctx.strokeStyle = on ? P.accent : P.text; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      if (it.I >= 0) { ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(cx, cy, 2.6, 0, Math.PI * 2); ctx.fill() } else { ctx.beginPath(); ctx.moveTo(cx - 5, cy - 5); ctx.lineTo(cx + 5, cy + 5); ctx.moveTo(cx + 5, cy - 5); ctx.lineTo(cx - 5, cy + 5); ctx.stroke() }
      ctx.font = `11px ${FONT}`; ctx.fillStyle = P.text2; ctx.fillText(fmtQ(Math.abs(it.I), 'A', 3), cx + 12, cy - 10)
      // force per metre
      const wi = S.items.slice(0, i + 1).filter(x => x.kind === 'wire').length - 1
      const f = forces.value[wi]
      if (f && (Math.abs(f.x) + Math.abs(f.y)) > 0) {
        const m = Math.hypot(f.x, f.y), L = 40
        ctx.strokeStyle = P.applied; ctx.fillStyle = P.applied; ctx.lineWidth = 2
        const ex = cx + (f.x / m) * L, ey = cy - (f.y / m) * L
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke()
        const ang = Math.atan2(ey - cy, ex - cx)
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - 8 * Math.cos(ang - 0.4), ey - 8 * Math.sin(ang - 0.4)); ctx.lineTo(ex - 8 * Math.cos(ang + 0.4), ey - 8 * Math.sin(ang + 0.4)); ctx.closePath(); ctx.fill()
      }
    } else {
      const c = Math.cos(it.angle), s = Math.sin(it.angle)
      ctx.save(); ctx.translate(X(it.x), Y(it.y)); ctx.rotate(-it.angle)
      const L = it.length * sc, T = it.thickness * sc
      if (it.kind === 'magnet') {
        ctx.fillStyle = '#2563eb'; ctx.fillRect(-L / 2, -T / 2, L / 2, T)
        ctx.fillStyle = '#dc2626'; ctx.fillRect(0, -T / 2, L / 2, T)
        ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.max(10, Math.min(16, T * 0.6))}px ${FONT}`
        ctx.fillText('S', -L / 4 - 4, 5); ctx.fillText('N', L / 4 - 5, 5)
      } else {
        ctx.strokeStyle = P.text2; ctx.lineWidth = 1.2; ctx.setLineDash([4, 3]); ctx.strokeRect(-L / 2, -T / 2, L, T); ctx.setLineDash([])
        const n = Math.max(1, it.turns)
        for (let t = 0; t < n; t++) {
          const px = n === 1 ? 0 : -L / 2 + (L * t) / (n - 1)
          for (const [side, out] of [[-1, true], [1, false]] as Array<[number, boolean]>) {
            const py = side * T / 2
            const o = it.I >= 0 ? out : !out
            ctx.fillStyle = P.bg; ctx.strokeStyle = P.text; ctx.lineWidth = 1.4
            ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
            if (o) { ctx.fillStyle = P.text; ctx.beginPath(); ctx.arc(px, py, 1.3, 0, Math.PI * 2); ctx.fill() } else { ctx.beginPath(); ctx.moveTo(px - 2.5, py - 2.5); ctx.lineTo(px + 2.5, py + 2.5); ctx.moveTo(px + 2.5, py - 2.5); ctx.lineTo(px - 2.5, py + 2.5); ctx.stroke() }
          }
        }
      }
      if (on) { ctx.strokeStyle = P.accent; ctx.lineWidth = 2; ctx.strokeRect(-L / 2 - 3, -T / 2 - 3, L + 6, T + 6) }
      ctx.restore()
      void c; void s
    }
  })
  // loop (a rectangular loop seen edge-on: two sides through the page)
  if (S.loop) {
    const l = S.loop
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2; ctx.setLineDash([6, 4])
    ctx.beginPath(); ctx.moveTo(X(l.x1), Y(l.y1)); ctx.lineTo(X(l.x2), Y(l.y2)); ctx.stroke(); ctx.setLineDash([])
    for (const [x, y] of [[l.x1, l.y1], [l.x2, l.y2]]) { ctx.fillStyle = P.accent; ctx.beginPath(); ctx.arc(X(x), Y(y), 5, 0, Math.PI * 2); ctx.fill() }
  }
  if (probe.value && probeInfo.value) {
    const p = probe.value, b = probeInfo.value, m = Math.hypot(b.Bx, b.By)
    ctx.fillStyle = P.accent; ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), 3.5, 0, Math.PI * 2); ctx.fill()
    ctx.font = `12px ${MONO}`; ctx.fillStyle = P.text
    ctx.fillText(`B = ${fmtQ(m, 'T', 3)}`, X(p.x) + 10, Y(p.y) - 8)
  }
})
watch(() => [sources.value, S.lines, S.compass, S.loop, S.scale], redraw, { deep: true })

// ---- pointer ----
let drag: { i: number; dx: number; dy: number } | null = null
let loopDrag: { which: 0 | 1 | 2; x: number; y: number; l0: { x1: number; y1: number; x2: number; y2: number } } | null = null
let loopStart: { x: number; y: number } | null = null
function world(e: PointerEvent): { x: number; y: number } {
  const [px, py] = at(e), c = canvas.value!
  return { x: (px - c.clientWidth / 2) / S.scale, y: -(py - c.clientHeight / 2) / S.scale }
}
function itemAt(p: { x: number; y: number }): number | null {
  const tol = 12 / S.scale
  for (let i = S.items.length - 1; i >= 0; i--) {
    const it = S.items[i]
    if (it.kind === 'wire') { if (Math.hypot(p.x - it.x, p.y - it.y) < tol) return i; continue }
    const c = Math.cos(it.angle), s = Math.sin(it.angle)
    const u = (p.x - it.x) * c + (p.y - it.y) * s, v = -(p.x - it.x) * s + (p.y - it.y) * c
    if (Math.abs(u) <= it.length / 2 + tol && Math.abs(v) <= it.thickness / 2 + tol) return i
  }
  return null
}
function onDown(e: PointerEvent) {
  const p = world(e)
  canvas.value!.setPointerCapture(e.pointerId)
  if (tool.value === 'out' || tool.value === 'in') { S.items.push({ kind: 'wire', x: p.x, y: p.y, I: tool.value === 'out' ? 10 : -10 }); selected.value = S.items.length - 1; tool.value = 'select'; return }
  if (tool.value === 'magnet') { S.items.push({ kind: 'magnet', x: p.x, y: p.y, angle: 0, length: 0.1, thickness: 0.03, M: 8e5 }); selected.value = S.items.length - 1; tool.value = 'select'; return }
  if (tool.value === 'solenoid') { S.items.push({ kind: 'solenoid', x: p.x, y: p.y, angle: 0, length: 0.14, thickness: 0.05, turns: 10, I: 2 }); selected.value = S.items.length - 1; tool.value = 'select'; return }
  if (tool.value === 'loop') { loopStart = p; S.loop = { x1: p.x, y1: p.y, x2: p.x, y2: p.y }; return }
  // the loop: drag an end or the whole loop
  if (S.loop) {
    const l = S.loop, tol = 10 / S.scale
    const which = Math.hypot(p.x - l.x1, p.y - l.y1) < tol ? 1 : Math.hypot(p.x - l.x2, p.y - l.y2) < tol ? 2 : distSeg(p, l) < tol ? 0 : -1
    if (which >= 0) { loopDrag = { which: which as 0 | 1 | 2, x: p.x, y: p.y, l0: { ...l } }; lastFlux = flux.value === null ? null : { phi: flux.value, t: performance.now() }; return }
  }
  const i = itemAt(p)
  selected.value = i
  if (i !== null) drag = { i, dx: p.x - S.items[i].x, dy: p.y - S.items[i].y }
  else probe.value = p
}
function distSeg(p: { x: number; y: number }, l: { x1: number; y1: number; x2: number; y2: number }) {
  const dx = l.x2 - l.x1, dy = l.y2 - l.y1, L2 = dx * dx + dy * dy || 1e-30
  const t = Math.max(0, Math.min(1, ((p.x - l.x1) * dx + (p.y - l.y1) * dy) / L2))
  return Math.hypot(l.x1 + t * dx - p.x, l.y1 + t * dy - p.y)
}
function onMove(e: PointerEvent) {
  const p = world(e)
  if (loopStart && S.loop) { S.loop = { x1: loopStart.x, y1: loopStart.y, x2: p.x, y2: p.y }; return }
  if (loopDrag && S.loop) {
    const d = { x: p.x - loopDrag.x, y: p.y - loopDrag.y }, l0 = loopDrag.l0
    S.loop = loopDrag.which === 1 ? { ...l0, x1: l0.x1 + d.x, y1: l0.y1 + d.y } : loopDrag.which === 2 ? { ...l0, x2: l0.x2 + d.x, y2: l0.y2 + d.y } : { x1: l0.x1 + d.x, y1: l0.y1 + d.y, x2: l0.x2 + d.x, y2: l0.y2 + d.y }
    return
  }
  if (drag) { const it = S.items[drag.i]; it.x = p.x - drag.dx; it.y = p.y - drag.dy; return }
  if (e.buttons === 0 && tool.value === 'select') probe.value = p
}
function onUp() { drag = null; loopDrag = null; if (loopStart) { loopStart = null; tool.value = 'select' } }
watch(flux, phi => {
  // emf from the change of flux while the loop is dragged (per metre of loop depth)
  const now = performance.now()
  if (phi === null || !loopDrag) { emf.value = null; lastFlux = phi === null ? null : { phi, t: now }; return }
  if (lastFlux && now > lastFlux.t) emf.value = -(phi - lastFlux.phi) / ((now - lastFlux.t) / 1000)
  lastFlux = { phi, t: now }
})
function onWheel(e: WheelEvent) { e.preventDefault(); S.scale = Math.max(200, Math.min(12000, S.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1))) }
function remove() { if (selected.value !== null) { S.items.splice(selected.value, 1); selected.value = null } }

const Bmag = computed(() => (probeInfo.value ? Math.hypot(probeInfo.value.Bx, probeInfo.value.By) : null))
/** The single wire (if the scene is one wire): B = μ₀I/(2πr) at the probe. */
const wireFormula = computed(() => {
  const ws = S.items.filter((i): i is Wire => i.kind === 'wire')
  if (ws.length !== 1 || S.items.length !== 1 || !probe.value || Bmag.value === null || S.B !== 0) return null
  const r = Math.hypot(probe.value.x - ws[0].x, probe.value.y - ws[0].y)
  return { I: Math.abs(ws[0].I), r }
})
const pairFormula = computed(() => {
  const ws = S.items.filter((i): i is Wire => i.kind === 'wire')
  if (ws.length !== 2 || S.items.length !== 2 || S.B !== 0 || !forces.value[1]) return null
  return { I1: ws[0].I, I2: ws[1].I, d: Math.hypot(ws[1].x - ws[0].x, ws[1].y - ws[0].y), F: Math.hypot(forces.value[1].x, forces.value[1].y) }
})
const solenoidFormula = computed(() => {
  const cs = S.items.filter((i): i is Coil => i.kind === 'solenoid')
  if (cs.length !== 1 || S.items.length !== 1 || S.B !== 0) return null
  const c = cs[0]
  // field at the centre from the core
  try {
    const m = magnetMap(sources.value, { region: { x0: -1e-3, y0: -1e-3, x1: 1e-3, y1: 1e-3 }, grid: 8, lines: 0, arrows: 0, probes: [{ x: c.x, y: c.y }] })
    const b = m.probes[0]
    return { n: (c.turns - 1) / c.length, I: c.I, B: Math.hypot(b.Bx, b.By), ratio: c.length / c.thickness }
  } catch { return null }
})
</script>

<template>
  <div class="lab-shell">
    <div class="lab-stage">
      <div class="lab-bar">
        <select class="field small" :value="S.preset" :aria-label="tl('示例')" @change="loadPreset(($event.target as HTMLSelectElement).value)">
          <option v-for="(p, id) in PRESETS" :key="id" :value="id">{{ p.label }}</option>
        </select>
        <div class="lab-seg">
          <button :class="{ on: tool === 'select' }" @click="tool = 'select'">{{ tl('选择') }}</button>
          <button :class="{ on: tool === 'out' }" :title="tl('电流垂直纸面向外')" @click="tool = 'out'">⊙ {{ tl('导线') }}</button>
          <button :class="{ on: tool === 'in' }" :title="tl('电流垂直纸面向里')" @click="tool = 'in'">⊗ {{ tl('导线') }}</button>
          <button :class="{ on: tool === 'magnet' }" @click="tool = 'magnet'">{{ tl('磁铁') }}</button>
          <button :class="{ on: tool === 'solenoid' }" @click="tool = 'solenoid'">{{ tl('螺线管') }}</button>
          <button :class="{ on: tool === 'loop' }" :title="tl('拖出一个线框（垂直纸面，深 1 m），读穿过它的磁通量')" @click="tool = 'loop'">{{ tl('线框') }}</button>
        </div>
        <span class="grow" />
        <label class="ctl"><input v-model="S.compass" type="checkbox" />{{ tl('小磁针') }}</label>
        <label class="ctl">{{ tl('磁感线') }}<input v-model.number="S.lines" type="range" min="0" max="60" step="2" :aria-label="tl('磁感线条数')" /></label>
      </div>
      <div ref="wrap" class="lab-canvas">
        <canvas ref="canvas" @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointerleave="onUp" @wheel="onWheel" />
        <div class="hint tiny muted">{{ tl('拖动导线、磁铁或线框；在空白处移动看该点的磁感应强度；滚轮缩放') }}</div>
      </div>
    </div>
    <aside class="lab-side">
      <section class="lab-block">
        <div class="lab-btitle">{{ tl('探测点') }}</div>
        <div class="lab-kv">
          <span>{{ tl('磁感应强度 B') }}</span><b class="big">{{ Bmag === null ? '—' : fmtQ(Bmag, 'T', 4) }}</b>
          <span>{{ tl('方向（与 x 轴）') }}</span><b>{{ probeInfo ? (Math.atan2(probeInfo.By, probeInfo.Bx) * 180 / Math.PI).toFixed(1) + '°' : '—' }}</b>
        </div>
      </section>
      <section v-if="S.loop" class="lab-block">
        <div class="lab-btitle">{{ tl('线框') }}</div>
        <div class="lab-kv">
          <span>{{ tl('磁通量（每米深度）') }}</span><b>{{ flux === null ? '—' : fmtQ(flux, 'Wb', 4) }}</b>
          <span>{{ tl('拖动时的感应电动势') }}</span><b>{{ emf === null ? '—' : fmtQ(emf, 'V', 3) }}</b>
        </div>
        <button class="btn ghost small" @click="S.loop = null">{{ tl('移除线框') }}</button>
        <p class="tiny muted lab-note">{{ tl('磁通量 Φ 等于两侧边处磁矢势之差（每米深度）。拖动线框时 Φ 改变，感应电动势 E = −ΔΦ/Δt；方向由楞次定律决定：感应电流的磁场阻碍磁通量的变化。') }}</p>
      </section>
      <section v-if="sel" class="lab-block">
        <div class="lab-btitle">{{ sel.kind === 'wire' ? tl('通电导线') : sel.kind === 'magnet' ? tl('条形磁铁') : tl('螺线管') }}</div>
        <div class="lab-fields">
          <template v-if="sel.kind === 'wire' || sel.kind === 'solenoid'">
            <label>{{ tl('电流 I（向外为正）') }}</label><NumField :model-value="sel.I" unit="A" @update:model-value="v => ((sel as Wire).I = v)" />
          </template>
          <template v-if="sel.kind === 'magnet'">
            <label>{{ tl('磁化强度 M') }}</label><NumField :model-value="sel.M" unit="A/m" @update:model-value="v => ((sel as Magnet).M = v)" />
          </template>
          <template v-if="sel.kind !== 'wire'">
            <label>{{ tl('长度') }}</label><NumField :model-value="sel.length" unit="m" :min="0.001" @update:model-value="v => ((sel as Magnet).length = v)" />
            <label>{{ tl('宽度') }}</label><NumField :model-value="sel.thickness" unit="m" :min="0.001" @update:model-value="v => ((sel as Magnet).thickness = v)" />
            <label>{{ tl('方向') }}</label><input :value="sel.angle * 180 / Math.PI" type="range" min="-180" max="180" step="5" :aria-label="tl('方向')" @input="(sel as Magnet).angle = Number(($event.target as HTMLInputElement).value) * Math.PI / 180" />
          </template>
          <template v-if="sel.kind === 'solenoid'"><label>{{ tl('匝数') }}</label><NumField :model-value="sel.turns" :min="1" :max="200" :step="1" @update:model-value="v => ((sel as Coil).turns = Math.round(v))" /></template>
        </div>
        <button class="btn ghost small danger" @click="remove">{{ tl('删除') }}</button>
      </section>
      <section class="lab-block">
        <div class="lab-btitle">{{ tl('匀强磁场（纸面内）') }}</div>
        <div class="lab-fields">
          <label>{{ tl('大小') }}</label><NumField :model-value="S.B" unit="T" :min="0" @update:model-value="v => (S.B = v)" />
          <label>{{ tl('方向') }}</label><input :value="S.Bdir * 180 / Math.PI" type="range" min="-180" max="180" step="5" :aria-label="tl('方向')" @input="S.Bdir = Number(($event.target as HTMLInputElement).value) * Math.PI / 180" />
        </div>
      </section>
      <section class="lab-block">
        <LabFormula v-if="wireFormula" :title="tl('通电直导线周围的磁场')" tex="B = \dfrac{\mu_0 I}{2\pi r}" expr="mu0*I/(2*pi*r)" :vars="[{ name: 'mu0', symbol: '\mu_0', value: MU0, unit: 'N/A²' }, { name: 'I', symbol: 'I', value: wireFormula.I, unit: 'A' }, { name: 'r', symbol: 'r', value: wireFormula.r, unit: 'm' }]" unit="T" lhs="B" :result="wireFormula.r > 0.004 ? Bmag : null" />
        <LabFormula v-if="pairFormula" :title="tl('平行通电导线间的作用力（每米）')" tex="\dfrac{F}{l} = \dfrac{\mu_0 I_1 I_2}{2\pi d}" expr="mu0*abs(I1*I2)/(2*pi*d)" :vars="[{ name: 'mu0', symbol: '\mu_0', value: MU0, unit: 'N/A²' }, { name: 'I1', symbol: 'I_1', value: pairFormula.I1, unit: 'A' }, { name: 'I2', symbol: 'I_2', value: pairFormula.I2, unit: 'A' }, { name: 'd', symbol: 'd', value: pairFormula.d, unit: 'm' }]" unit="N/m" lhs="F/l" :result="pairFormula.F" />
        <div v-if="pairFormula" class="tiny muted">{{ pairFormula.I1 * pairFormula.I2 > 0 ? tl('同向电流相互吸引') : tl('反向电流相互排斥') }}</div>
        <LabFormula v-if="solenoidFormula" :title="tl('长直螺线管内部的磁场')" tex="B = \mu_0 n I" expr="mu0*n*I" :vars="[{ name: 'mu0', symbol: '\mu_0', value: MU0, unit: 'N/A²' }, { name: 'n', symbol: 'n', value: solenoidFormula.n, unit: '1/m' }, { name: 'I', symbol: 'I', value: Math.abs(solenoidFormula.I), unit: 'A' }]" unit="T" lhs="B" :result="solenoidFormula.B" />
        <div v-if="solenoidFormula" class="tiny muted">{{ tl('长度是直径的 {0} 倍：越长，中心的磁场越接近 μ₀nI。', [solenoidFormula.ratio.toFixed(1)]) }}</div>
      </section>
      <details class="lab-block lab-details">
        <summary>{{ tl('原理') }}</summary>
        <p class="tiny muted lab-note">{{ tl('电流都垂直于纸面时，磁场可以用磁矢势 A 描述，磁感线就是 A 的等值线，相邻两条线之间的磁通量相等，所以线越密磁场越强。条形磁铁用等效的表面电流（安培分子电流）代替：磁铁与同形状的螺线管磁场相同。导线受力 F = IL × B 由其他电流的磁场算出。') }}</p>
      </details>
    </aside>
  </div>
</template>
