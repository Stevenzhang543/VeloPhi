<script setup lang="ts">
/**
 * Electric field experiment (26.54, D79): point charges (drag to move, add or remove) and an optional uniform field.
 * The core computes the field lines, the equipotentials (`fieldMap`) and the field and potential at the pointer
 * (`fieldAt`); this component draws them and shows Coulomb's law and the superposition at the probe.
 *
 * 26.57 (D121; manual §4.3 items 7–8, T25): what to look at is chosen first — direction (field lines), equipotentials,
 * or probe measurement — and the other layer is drawn faintly; a test charge of either sign shows the force qE (a
 * negative charge is pushed against the field); a second probe B (Shift+click) gives the potential difference U_AB;
 * the empty state says what to do; a task opens the lab with its charges and its field point.
 */
import { computed, ref, watch } from 'vue'
import { tl } from '../../../i18n'
import { fmtQ } from '../../settings'
import type { FieldMap } from '../../../engine/labs'
import { fieldAt, fieldMap } from '../../../engine/labs'
import { COULOMB_K } from '../../../core/scene/types'
import { labRequest, labState, labTaskRequest } from '../../lab/state'
import { useLabCanvas } from '../../lab/canvas'
import { FONT, MONO } from '../../../render/style'
import NumField from '../NumField.vue'
import LabFormula from './LabFormula.vue'

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })

interface Q { x: number; y: number; q: number }
const PRESETS: Record<string, { label: string; charges: Q[]; E: number }> = {
  single: { label: tl('单个正电荷'), charges: [{ x: 0, y: 0, q: 1e-9 }], E: 0 },
  dipole: { label: tl('等量异种电荷'), charges: [{ x: -0.6, y: 0, q: 1e-9 }, { x: 0.6, y: 0, q: -1e-9 }], E: 0 },
  pair: { label: tl('等量同种电荷'), charges: [{ x: -0.6, y: 0, q: 1e-9 }, { x: 0.6, y: 0, q: 1e-9 }], E: 0 },
  unequal: { label: tl('不等量异种电荷'), charges: [{ x: -0.5, y: 0, q: 2e-9 }, { x: 0.6, y: 0, q: -1e-9 }], E: 0 },
  plates: { label: tl('平行板（匀强电场）'), charges: [], E: 200 },
  field: { label: tl('匀强电场中的点电荷'), charges: [{ x: 0, y: 0, q: 1e-9 }], E: 60 }
}
const S = labState('field', () => ({ charges: PRESETS.dipole.charges.map(c => ({ ...c })), E: 0, Edir: 0, lines: true, equip: true, preset: 'dipole', radius: 0.06, scale: 160, focus: 'direction' as Focus, testQ: 1e-9 }))
/** What the picture is for (26.57): the field direction, the equipotentials, or measuring at probes. */
type Focus = 'direction' | 'equip' | 'probe'
const FOCI: Array<{ id: Focus; label: string; tip: string }> = [
  { id: 'direction', label: tl('看方向'), tip: tl('电场线表示各点场强的方向；等势线淡化') },
  { id: 'equip', label: tl('看等势'), tip: tl('等势线：同一条线上各点电势相等；电场线淡化') },
  { id: 'probe', label: tl('探针测量'), tip: tl('点击放置探针 A，Shift+点击放置探针 B，比较场强、电势与受力') }
]
function setFocus(f: Focus) {
  S.focus = f
  if (f === 'direction') { S.lines = true }
  if (f === 'equip') { S.equip = true }
  if (f === 'probe' && !probe.value) placeAtMidpoint()
}
function loadPreset(id: string) {
  const p = PRESETS[id]
  S.preset = id
  S.charges = p.charges.map(c => ({ ...c }))
  S.E = p.E
  S.Edir = id === 'plates' ? -Math.PI / 2 : 0
  selected.value = null
}

const selected = ref<number | null>(null)
const probe = ref<{ x: number; y: number } | null>(null)
/** Second probe (Shift+click): the potential difference between A and B. */
const probeB = ref<{ x: number; y: number } | null>(null)
/** A probe where it says something: the midpoint of the first two charges (or beside a single one). */
function placeAtMidpoint() {
  const c = S.charges
  probe.value = c.length >= 2 ? { x: (c[0].x + c[1].x) / 2, y: (c[0].y + c[1].y) / 2 + 0.15 } : c.length === 1 ? { x: c[0].x + 0.3, y: c[0].y } : { x: 0, y: 0 }
  S.focus = 'probe'
}
// 26.57: a package or the learning path opens a preset (dipole, single, pair …) by name
watch(() => labRequest.seq, () => { if (labRequest.lab === 'field' && labRequest.preset && PRESETS[labRequest.preset]) { const id = labRequest.preset; labRequest.preset = null; loadPreset(id); probe.value = null; probeB.value = null; setFocus('direction') } }, { immediate: true, flush: 'post' })
// a task opens the lab with its charges, its field point and its test charge
watch(() => labTaskRequest.seq, () => {
  const p = labTaskRequest.payload
  if (labTaskRequest.lab !== 'field' || !p) return
  labTaskRequest.payload = null
  S.charges = (p.charges as Q[]).map(c => ({ ...c }))
  S.E = 0
  S.preset = 'task'
  S.focus = 'probe'
  if (typeof p.testQ === 'number') S.testQ = p.testQ
  probe.value = p.probe as { x: number; y: number }
  probeB.value = null
  // fit the charges and the point into the view
  const xs = [...S.charges.map(c => Math.abs(c.x)), Math.abs(probe.value.x)], ys = [...S.charges.map(c => Math.abs(c.y)), Math.abs(probe.value.y)]
  const span = Math.max(0.05, ...xs, ...ys)
  S.scale = Math.max(40, Math.min(600, 260 / span))
  S.radius = Math.min(S.radius, 0.15 * span)
}, { immediate: true, flush: 'post' })
const sources = computed(() => ({
  charges: S.charges.map(c => ({ x: c.x, y: c.y, q: c.q, r: S.radius })),
  E: { x: S.E * Math.cos(S.Edir), y: S.E * Math.sin(S.Edir) },
  k: COULOMB_K
}))

let map: FieldMap | null = null
let mapKey = ''
const { canvas, wrap, redraw, at } = useLabCanvas(() => props.active, (ctx, w, h, _dt, P) => {
  const sc = S.scale
  const X = (x: number) => w / 2 + x * sc, Y = (y: number) => h / 2 - y * sc
  // world region of the canvas
  const region = { x0: -w / 2 / sc, y0: -h / 2 / sc, x1: w / 2 / sc, y1: h / 2 / sc }
  const k = JSON.stringify([sources.value, region, S.lines, S.equip])
  if (k !== mapKey) {
    try { map = fieldMap(sources.value, region, { perCharge: 14, grid: 140, levels: S.equip ? 12 : 0 }) } catch { map = null }
    mapKey = k
  }
  // grid
  ctx.strokeStyle = P.gridMinor; ctx.lineWidth = 1
  const step = 0.1
  for (let x = Math.ceil(region.x0 / step) * step; x <= region.x1; x += step) { ctx.beginPath(); ctx.moveTo(X(x), 0); ctx.lineTo(X(x), h); ctx.stroke() }
  for (let y = Math.ceil(region.y0 / step) * step; y <= region.y1; y += step) { ctx.beginPath(); ctx.moveTo(0, Y(y)); ctx.lineTo(w, Y(y)); ctx.stroke() }
  if (map) {
    if (S.equip) {
      ctx.strokeStyle = P.text2; ctx.globalAlpha = S.focus === 'equip' ? 0.8 : 0.3; ctx.lineWidth = S.focus === 'equip' ? 1.4 : 1; ctx.setLineDash([4, 3])
      const { segs, starts } = map.contours
      ctx.beginPath()
      for (let s = 0; s < (starts[starts.length - 1] ?? 0); s++) { ctx.moveTo(X(segs[4 * s]), Y(segs[4 * s + 1])); ctx.lineTo(X(segs[4 * s + 2]), Y(segs[4 * s + 3])) }
      ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1
    }
    if (S.lines) {
      const col = P.electric ?? '#0f766e'
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.5
      ctx.globalAlpha = S.focus === 'direction' ? 1 : 0.35
      const { xy, starts } = map.lines
      for (let i = 0; i + 1 < starts.length; i++) {
        const a = starts[i], b = starts[i + 1]
        ctx.beginPath(); ctx.moveTo(X(xy[2 * a]), Y(xy[2 * a + 1]))
        let len = 0, next = 70, px = X(xy[2 * a]), py = Y(xy[2 * a + 1])
        const marks: number[][] = []
        for (let j = a + 1; j < b; j++) {
          const sx = X(xy[2 * j]), sy = Y(xy[2 * j + 1]), d = Math.hypot(sx - px, sy - py)
          len += d
          if (len > next && d > 0) { marks.push([sx, sy, (sx - px) / d, (sy - py) / d]); next += 150 }
          ctx.lineTo(sx, sy); px = sx; py = sy
        }
        ctx.stroke()
        for (const [x, y, ux, uy] of marks) {
          ctx.beginPath(); ctx.moveTo(x + ux * 6, y + uy * 6); ctx.lineTo(x - ux * 4 - uy * 4, y - uy * 4 + ux * 4); ctx.lineTo(x - ux * 4 + uy * 4, y - uy * 4 - ux * 4); ctx.closePath(); ctx.fill()
        }
      }
      // uniform field alone: straight lines
      if (!S.charges.length && S.E > 0) {
        const ux = Math.cos(S.Edir), uy = -Math.sin(S.Edir)
        for (let d = -1000; d <= 1000; d += 50) {
          const cx = w / 2 - uy * d, cy = h / 2 + ux * d
          ctx.beginPath(); ctx.moveTo(cx - ux * 2000, cy - uy * 2000); ctx.lineTo(cx + ux * 2000, cy + uy * 2000); ctx.stroke()
          for (let s = -900; s <= 900; s += 160) { const x = cx + ux * s, y = cy + uy * s; ctx.beginPath(); ctx.moveTo(x + ux * 6, y + uy * 6); ctx.lineTo(x - ux * 4 - uy * 4, y - uy * 4 + ux * 4); ctx.lineTo(x - ux * 4 + uy * 4, y - uy * 4 - ux * 4); ctx.closePath(); ctx.fill() }
        }
      }
    }
  }
  ctx.globalAlpha = 1
  // charges
  S.charges.forEach((c, i) => {
    const x = X(c.x), y = Y(c.y), r = Math.max(9, S.radius * sc)
    const col = c.q > 0 ? P.positive ?? '#dc2626' : P.negative ?? '#2563eb'
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    if (i === selected.value) { ctx.strokeStyle = P.accent; ctx.lineWidth = 3; ctx.stroke() }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.2
    ctx.beginPath(); ctx.moveTo(x - r * 0.5, y); ctx.lineTo(x + r * 0.5, y); if (c.q > 0) { ctx.moveTo(x, y - r * 0.5); ctx.lineTo(x, y + r * 0.5) } ctx.stroke()
    // the value on its own background, so lines do not run through it
    ctx.font = `12px ${MONO}`
    const label = `${c.q > 0 ? '+' : ''}${fmtQ(c.q, 'C', 3)}`
    const tw = ctx.measureText(label).width
    ctx.fillStyle = P.labelBg; ctx.beginPath(); ctx.roundRect(x + r + 2, y - r - 13, tw + 8, 17, 4); ctx.fill()
    ctx.fillStyle = col; ctx.fillText(label, x + r + 6, y - r)
  })
  // probe
  if (probe.value && probeValues.value) {
    const { x, y } = probe.value, E = probeValues.value.E
    const m = Math.hypot(E.x, E.y)
    if (m > 0) {
      const L = 46, ux = E.x / m, uy = -E.y / m
      ctx.strokeStyle = P.acceleration; ctx.fillStyle = P.acceleration; ctx.lineWidth = 2.4
      ctx.beginPath(); ctx.moveTo(X(x), Y(y)); ctx.lineTo(X(x) + ux * L, Y(y) + uy * L); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(X(x) + ux * (L + 6), Y(y) + uy * (L + 6)); ctx.lineTo(X(x) + ux * L - uy * 5, Y(y) + uy * L + ux * 5); ctx.lineTo(X(x) + ux * L + uy * 5, Y(y) + uy * L - ux * 5); ctx.closePath(); ctx.fill()
    }
    ctx.fillStyle = P.acceleration; ctx.beginPath(); ctx.arc(X(x), Y(y), 3, 0, Math.PI * 2); ctx.fill()
    ctx.font = `12px ${FONT}`; ctx.fillText('A', X(x) + 6, Y(y) + 14)
    // the force on the test charge: along the field for q > 0, against it for q < 0 (T25)
    if (m > 0 && S.focus === 'probe' && S.testQ !== 0) {
      const sgn = Math.sign(S.testQ), L = 34, ux = sgn * E.x / m, uy = -sgn * E.y / m
      const fc = P.applied ?? '#7c3aed'
      ctx.strokeStyle = fc; ctx.fillStyle = fc; ctx.lineWidth = 2; ctx.setLineDash([5, 3])
      ctx.beginPath(); ctx.moveTo(X(x), Y(y)); ctx.lineTo(X(x) + ux * L, Y(y) + uy * L); ctx.stroke(); ctx.setLineDash([])
      ctx.beginPath(); ctx.moveTo(X(x) + ux * (L + 6), Y(y) + uy * (L + 6)); ctx.lineTo(X(x) + ux * L - uy * 5, Y(y) + uy * L + ux * 5); ctx.lineTo(X(x) + ux * L + uy * 5, Y(y) + uy * L - ux * 5); ctx.closePath(); ctx.fill()
    }
  }
  if (probeB.value) {
    ctx.fillStyle = P.velocity; ctx.beginPath(); ctx.arc(X(probeB.value.x), Y(probeB.value.y), 3.5, 0, Math.PI * 2); ctx.fill()
    ctx.font = `12px ${FONT}`; ctx.fillText('B', X(probeB.value.x) + 6, Y(probeB.value.y) + 14)
  }
  // scale bar
  ctx.fillStyle = P.text2; ctx.font = `11px ${FONT}`
  ctx.fillRect(12, h - 14, 0.5 * sc, 2)
  ctx.fillText(fmtQ(0.5, 'm', 2), 12, h - 20)
})
watch(() => [S.charges, S.E, S.Edir, S.lines, S.equip, S.scale, S.radius, S.focus, S.testQ, probeB.value], redraw, { deep: true })

const probeValues = computed(() => {
  const p = probe.value
  if (!p) return null
  try {
    const r = fieldAt(sources.value, [p])
    return { E: r.E[0], V: r.V[0] }
  } catch { return null }
})
watch(probeValues, redraw)
const probeBValues = computed(() => {
  const p = probeB.value
  if (!p) return null
  try { const r = fieldAt(sources.value, [p]); return { E: r.E[0], V: r.V[0] } } catch { return null }
})
/** Force on the test charge at A (N) and whether it points against the field. */
const force = computed(() => {
  const v = probeValues.value
  if (!v) return null
  return { F: Math.abs(S.testQ) * Math.hypot(v.E.x, v.E.y), against: S.testQ < 0 }
})

let dragging: number | null = null
function toWorld(px: number, py: number) {
  const c = canvas.value!
  const w = c.clientWidth, h = c.clientHeight
  return { x: (px - w / 2) / S.scale, y: -(py - h / 2) / S.scale }
}
function onDown(e: PointerEvent) {
  const [px, py] = at(e)
  const p = toWorld(px, py)
  const hitR = Math.max(12, S.radius * S.scale) / S.scale
  const i = S.charges.findIndex(c => Math.hypot(c.x - p.x, c.y - p.y) < hitR)
  if (i >= 0) { dragging = i; selected.value = i; canvas.value!.setPointerCapture(e.pointerId) } else if (e.shiftKey) { probeB.value = p; selected.value = null } else { probe.value = p; selected.value = null }
}
function onMove(e: PointerEvent) {
  const [px, py] = at(e)
  const p = toWorld(px, py)
  if (dragging !== null) { S.charges[dragging].x = Math.round(p.x * 100) / 100; S.charges[dragging].y = Math.round(p.y * 100) / 100 } else if (e.buttons === 1) probe.value = p
}
function onUp() { dragging = null }
function onWheel(e: WheelEvent) { e.preventDefault(); S.scale = Math.max(40, Math.min(600, S.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1))) }
function addCharge(sign: 1 | -1) { S.charges.push({ x: 0.2 * (S.charges.length % 5) - 0.4, y: 0.4, q: sign * 1e-9 }); selected.value = S.charges.length - 1 }
function removeSelected() { if (selected.value !== null) { S.charges.splice(selected.value, 1); selected.value = null } }
const sel = computed(() => (selected.value !== null ? S.charges[selected.value] ?? null : null))

/** Coulomb's law at the probe for the first charge, and the superposition (the core's field). */
const probeFormula = computed(() => {
  const p = probe.value, v = probeValues.value
  if (!p || !v || S.charges.length !== 1 || S.E !== 0) return null
  const c = S.charges[0]
  const r = Math.hypot(p.x - c.x, p.y - c.y)
  if (!(r > S.radius)) return null
  return { r, q: Math.abs(c.q), E: Math.hypot(v.E.x, v.E.y), V: v.V, qs: c.q }
})
</script>

<template>
  <div class="lab-shell">
    <div class="lab-stage">
      <div class="lab-bar">
        <select class="field small" :value="S.preset" :aria-label="tl('示例')" @change="loadPreset(($event.target as HTMLSelectElement).value)">
          <option v-for="(p, id) in PRESETS" :key="id" :value="id">{{ p.label }}</option>
        </select>
        <button class="btn ghost small" @click="addCharge(1)">{{ tl('+ 正电荷') }}</button>
        <button class="btn ghost small" @click="addCharge(-1)">{{ tl('+ 负电荷') }}</button>
        <span class="grow" />
        <div class="segmented focus" role="radiogroup" :aria-label="tl('观察什么')">
          <button v-for="f in FOCI" :key="f.id" role="radio" :aria-checked="S.focus === f.id" :class="{ on: S.focus === f.id }" :title="f.tip" @click="setFocus(f.id)">{{ f.label }}</button>
        </div>
        <label class="check small"><input v-model="S.lines" type="checkbox" />{{ tl('电场线') }}</label>
        <label class="check small"><input v-model="S.equip" type="checkbox" />{{ tl('等势线') }}</label>
      </div>
      <div ref="wrap" class="lab-canvas">
        <canvas ref="canvas" @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @wheel="onWheel" />
        <div class="hint top tiny muted">{{ tl('拖动电荷改变位置；点击空白处放置探针 A（Shift+点击放置 B）；滚轮缩放') }}</div>
      </div>
    </div>
    <aside class="lab-side">
      <section class="lab-block">
        <div class="lab-btitle">{{ tl('匀强电场') }}</div>
        <div class="lab-fields">
          <label>{{ tl('场强 E') }}</label><NumField :model-value="S.E" unit="V/m" :min="0" @update:model-value="v => (S.E = v)" />
          <label>{{ tl('方向') }}</label><NumField :model-value="S.Edir" unit="rad" @update:model-value="v => (S.Edir = v)" />
        </div>
      </section>
      <section v-if="sel" class="lab-block">
        <div class="lab-btitle">{{ tl('选中的电荷') }}</div>
        <div class="lab-fields">
          <label>{{ tl('电荷量 q') }}</label><NumField :model-value="sel.q" unit="C" @update:model-value="v => { if (v !== 0) sel!.q = v }" />
          <label>x</label><NumField :model-value="sel.x" unit="m" @update:model-value="v => (sel!.x = v)" />
          <label>y</label><NumField :model-value="sel.y" unit="m" @update:model-value="v => (sel!.y = v)" />
        </div>
        <button class="btn ghost small" @click="removeSelected">{{ tl('删除') }}</button>
      </section>
      <section class="lab-block">
        <div class="lab-btitle">{{ tl('测量点') }}</div>
        <div v-if="probe && probeValues" class="lab-kv">
          <span>{{ tl('位置') }}</span><b>({{ fmtQ(probe.x, 'm', 3) }}, {{ fmtQ(probe.y, 'm', 3) }})</b>
          <span>{{ tl('场强大小 E') }}</span><b class="big">{{ fmtQ(Math.hypot(probeValues.E.x, probeValues.E.y), 'V/m') }}</b>
          <span>Eₓ</span><b>{{ fmtQ(probeValues.E.x, 'V/m') }}</b>
          <span>E_y</span><b>{{ fmtQ(probeValues.E.y, 'V/m') }}</b>
          <span>{{ tl('电势 φ') }}</span><b class="big">{{ fmtQ(probeValues.V, 'V') }}</b>
        </div>
        <div v-else class="empty-probe">
          <p class="small">{{ tl('还没有放置探针。在画面中点击一点，读出该点的场强与电势；Shift+点击放置第二个探针，比较两点的电势。') }}</p>
          <button class="btn small" @click="placeAtMidpoint">{{ tl('在电荷之间放置探针') }}</button>
        </div>
        <template v-if="probe && probeValues">
          <div class="lab-fields test">
            <label>{{ tl('试探电荷 q') }}</label><NumField :model-value="S.testQ" unit="C" @update:model-value="v => (S.testQ = v)" />
          </div>
          <div v-if="force" class="lab-kv">
            <span>{{ tl('受力 F = |q|E') }}</span><b>{{ fmtQ(force.F, 'N') }}</b>
          </div>
          <p class="tiny note" :class="{ warn: force?.against }">{{ force?.against ? tl('q < 0：受力与场强方向相反（虚线箭头）。场强方向按正试探电荷的受力定义。') : tl('q > 0：受力与场强方向相同（虚线箭头）。') }}</p>
        </template>
        <div v-if="probe && probeValues && probeB && probeBValues" class="lab-kv">
          <span>{{ tl('B 点电势 φ_B') }}</span><b>{{ fmtQ(probeBValues.V, 'V') }}</b>
          <span>{{ tl('电势差 U_AB = φ_A − φ_B') }}</span><b class="big">{{ fmtQ(probeValues.V - probeBValues.V, 'V') }}</b>
          <span>{{ tl('从 A 移到 B 电场力做功 qU_AB') }}</span><b>{{ fmtQ(S.testQ * (probeValues.V - probeBValues.V), 'J') }}</b>
        </div>
      </section>
      <section v-if="probeFormula" class="lab-block">
        <LabFormula :title="tl('点电荷的场强')" tex="E = k\dfrac{|Q|}{r^2}" expr="k*Q/r^2" :vars="[{ name: 'k', symbol: 'k', value: COULOMB_K, unit: 'N·m²/C²' }, { name: 'Q', symbol: 'Q', value: probeFormula.q, unit: 'C' }, { name: 'r', symbol: 'r', value: probeFormula.r, unit: 'm' }]" unit="V/m" lhs="E" :result="probeFormula.E" />
        <LabFormula :title="tl('点电荷的电势')" tex="\varphi = k\dfrac{Q}{r}" expr="k*Q/r" :vars="[{ name: 'k', symbol: 'k', value: COULOMB_K, unit: 'N·m²/C²' }, { name: 'Q', symbol: 'Q', value: probeFormula.qs, unit: 'C' }, { name: 'r', symbol: 'r', value: probeFormula.r, unit: 'm' }]" unit="V" lhs="\varphi" :result="probeFormula.V" />
      </section>
      <section class="lab-block">
        <div class="lab-btitle">{{ tl('怎样读这张图') }}</div>
        <p class="tiny muted lab-note">{{ tl('电场线不是粒子的轨迹：它只表示各点场强的方向。每个电荷画出的场线条数是固定的示意（由正电荷出发），场线的疏密只定性表示场强大小，不能按条数读出数值；数值请用探针测量。二维画面是通过电荷的一个截面，真实的场在三维空间中。') }}</p>
      </section>
      <details class="lab-block lab-details">
        <summary>{{ tl('原理') }}</summary>
        <p class="tiny muted lab-note">{{ tl('场强是各点电荷的场强与匀强场的矢量和（叠加原理）；电势是标量和，以无穷远（匀强场以原点）为零。电场线从正电荷出发、到负电荷终止，处处与等势线垂直；等势线越密，场强越大。电荷画成半径很小的均匀带电球，球内的场有限。') }}</p>
      </details>
    </aside>
  </div>
</template>

<style scoped>
.lab-canvas .hint.top { top: 8px; bottom: auto; }
.focus button { height: calc(24px * var(--zoom)); padding: 0 8px; }
.empty-probe p { margin: 2px 0 6px; line-height: 1.5; color: var(--text-2); }
.note { margin: 4px 0 0; line-height: 1.45; color: var(--text-2); }
.note.warn { color: var(--warning); }
.test { margin-top: 6px; }
</style>
