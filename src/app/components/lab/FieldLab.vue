<script setup lang="ts">
/**
 * Electric field experiment (26.54, D79): point charges (drag to move, add or remove) and an optional uniform field.
 * The core computes the field lines, the equipotentials (`fieldMap`) and the field and potential at the pointer
 * (`fieldAt`); this component draws them and shows Coulomb's law and the superposition at the probe.
 */
import { computed, ref, watch } from 'vue'
import { tl } from '../../../i18n'
import { fmtQ } from '../../settings'
import type { FieldMap } from '../../../engine/labs'
import { fieldAt, fieldMap } from '../../../engine/labs'
import { COULOMB_K } from '../../../core/scene/types'
import { labState } from '../../lab/state'
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
const S = labState('field', () => ({ charges: PRESETS.dipole.charges.map(c => ({ ...c })), E: 0, Edir: 0, lines: true, equip: true, preset: 'dipole', radius: 0.06, scale: 160 }))
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
      ctx.strokeStyle = P.text2; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.1; ctx.setLineDash([4, 3])
      const { segs, starts } = map.contours
      ctx.beginPath()
      for (let s = 0; s < (starts[starts.length - 1] ?? 0); s++) { ctx.moveTo(X(segs[4 * s]), Y(segs[4 * s + 1])); ctx.lineTo(X(segs[4 * s + 2]), Y(segs[4 * s + 3])) }
      ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1
    }
    if (S.lines) {
      const col = P.electric ?? '#0f766e'
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.5
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
  // charges
  S.charges.forEach((c, i) => {
    const x = X(c.x), y = Y(c.y), r = Math.max(9, S.radius * sc)
    const col = c.q > 0 ? P.positive ?? '#dc2626' : P.negative ?? '#2563eb'
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    if (i === selected.value) { ctx.strokeStyle = P.accent; ctx.lineWidth = 3; ctx.stroke() }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.2
    ctx.beginPath(); ctx.moveTo(x - r * 0.5, y); ctx.lineTo(x + r * 0.5, y); if (c.q > 0) { ctx.moveTo(x, y - r * 0.5); ctx.lineTo(x, y + r * 0.5) } ctx.stroke()
    ctx.fillStyle = P.text2; ctx.font = `11px ${MONO}`
    ctx.fillText(fmtQ(c.q, 'C', 3), x + r + 4, y - r)
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
  }
  // scale bar
  ctx.fillStyle = P.text2; ctx.font = `11px ${FONT}`
  ctx.fillRect(12, h - 14, 0.5 * sc, 2)
  ctx.fillText(fmtQ(0.5, 'm', 2), 12, h - 20)
})
watch(() => [S.charges, S.E, S.Edir, S.lines, S.equip, S.scale, S.radius], redraw, { deep: true })

const probeValues = computed(() => {
  const p = probe.value
  if (!p) return null
  try {
    const r = fieldAt(sources.value, [p])
    return { E: r.E[0], V: r.V[0] }
  } catch { return null }
})
watch(probeValues, redraw)

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
  if (i >= 0) { dragging = i; selected.value = i; canvas.value!.setPointerCapture(e.pointerId) } else { probe.value = p; selected.value = null }
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
        <label class="check small"><input v-model="S.lines" type="checkbox" />{{ tl('电场线') }}</label>
        <label class="check small"><input v-model="S.equip" type="checkbox" />{{ tl('等势线') }}</label>
      </div>
      <div ref="wrap" class="lab-canvas">
        <canvas ref="canvas" @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @wheel="onWheel" />
        <div class="hint tiny muted">{{ tl('拖动电荷改变位置；点击空白处测量该点的场强与电势；滚轮缩放') }}</div>
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
        <div v-else class="tiny muted">{{ tl('点击画面中的任一点') }}</div>
      </section>
      <section v-if="probeFormula" class="lab-block">
        <LabFormula :title="tl('点电荷的场强')" tex="E = k\dfrac{|Q|}{r^2}" expr="k*Q/r^2" :vars="[{ name: 'k', symbol: 'k', value: COULOMB_K, unit: 'N·m²/C²' }, { name: 'Q', symbol: 'Q', value: probeFormula.q, unit: 'C' }, { name: 'r', symbol: 'r', value: probeFormula.r, unit: 'm' }]" unit="V/m" lhs="E" :result="probeFormula.E" />
        <LabFormula :title="tl('点电荷的电势')" tex="\varphi = k\dfrac{Q}{r}" expr="k*Q/r" :vars="[{ name: 'k', symbol: 'k', value: COULOMB_K, unit: 'N·m²/C²' }, { name: 'Q', symbol: 'Q', value: probeFormula.qs, unit: 'C' }, { name: 'r', symbol: 'r', value: probeFormula.r, unit: 'm' }]" unit="V" lhs="\varphi" :result="probeFormula.V" />
      </section>
      <details class="lab-block lab-details">
        <summary>{{ tl('原理') }}</summary>
        <p class="tiny muted lab-note">{{ tl('场强是各点电荷的场强与匀强场的矢量和（叠加原理）；电势是标量和，以无穷远（匀强场以原点）为零。电场线从正电荷出发、到负电荷终止，处处与等势线垂直；等势线越密，场强越大。电荷画成半径很小的均匀带电球，球内的场有限。') }}</p>
      </details>
    </aside>
  </div>
</template>
