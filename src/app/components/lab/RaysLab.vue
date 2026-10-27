<script setup lang="ts">
/**
 * Reflection and refraction (26.54, D81): light sources and optical elements on a bench. The core traces the rays
 * (`opticsTrace`: reflection, Snell's law, total internal reflection, Fresnel partial reflection, dispersion); this
 * component draws them, lets sources and elements be dragged, and checks the law of refraction at every surface the
 * main ray meets.
 */
import { computed, ref, watch } from 'vue'
import { tl } from '../../../i18n'
import type { OpticsElement, OpticsSource, OpticsTrace } from '../../../engine/labs'
import { opticsTrace } from '../../../engine/labs'
import { labState } from '../../lab/state'
import { useLabCanvas } from '../../lab/canvas'
import { FONT, MONO } from '../../../render/style'
import NumField from '../NumField.vue'
import LabFormula from './LabFormula.vue'

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })

const D = Math.PI / 180
const rect = (cx: number, cy: number, w: number, h: number) => [{ x: cx - w / 2, y: cy - h / 2 }, { x: cx + w / 2, y: cy - h / 2 }, { x: cx + w / 2, y: cy + h / 2 }, { x: cx - w / 2, y: cy + h / 2 }]
const PRESETS: Record<string, { label: string; elements: OpticsElement[]; sources: OpticsSource[] }> = {
  plane: { label: tl('平面镜反射'), elements: [{ type: 'mirror', x1: 0.2, y1: -0.35, x2: 0.2, y2: 0.35 }], sources: [{ type: 'ray', x: -0.5, y: -0.3, angle: 25 * D }] },
  block: { label: tl('玻璃砖的折射'), elements: [{ type: 'glass', points: rect(0.1, 0, 0.4, 0.5), n: 1.5 }], sources: [{ type: 'ray', x: -0.55, y: 0.35, angle: -35 * D }] },
  semicircle: { label: tl('半圆玻璃：全反射'), elements: [{ type: 'halfDisc', x: 0, y: 0, r: 0.3, angle: -Math.PI / 2, n: 1.5 }], sources: [{ type: 'ray', x: 0.5 * Math.sin(45 * D), y: -0.5 * Math.cos(45 * D), angle: Math.atan2(Math.cos(45 * D), -Math.sin(45 * D)) }] },
  prism: { label: tl('三棱镜色散'), elements: [{ type: 'glass', points: [{ x: -0.25, y: -0.2 }, { x: 0.25, y: -0.2 }, { x: 0, y: 0.25 }], n: 1.52, disp: 0.012 }], sources: [{ type: 'ray', x: -0.6, y: -0.12, angle: 18 * D }] },
  convex: { label: tl('凸透镜会聚平行光'), elements: [{ type: 'lens', x: 0, y: 0, angle: 0, f: 0.3, half: 0.25 }, { type: 'screen', x1: 0.3, y1: -0.35, x2: 0.3, y2: 0.35 }], sources: [{ type: 'beam', x: -0.55, y: 0, angle: 0, width: 0.36, count: 9 }] },
  concave: { label: tl('凹面镜与球差'), elements: [{ type: 'arcMirror', x: 0.35, y: 0, angle: Math.PI, R: 0.6, half: 0.35 }], sources: [{ type: 'beam', x: -0.55, y: 0, angle: 0, width: 0.6, count: 13 }] },
  fiber: { label: tl('光导纤维'), elements: [{ type: 'glass', points: rect(0.05, 0, 1.1, 0.1), n: 1.6 }], sources: [{ type: 'ray', x: -0.65, y: 0.04, angle: -16 * D }] }
}
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const S = labState('rays', () => ({ preset: 'block', elements: clone(PRESETS.block.elements), sources: clone(PRESETS.block.sources), partial: true, angles: true, scale: 380 }))
function loadPreset(id: string) { S.preset = id; S.elements = clone(PRESETS[id].elements); S.sources = clone(PRESETS[id].sources); selected.value = null }

const trace = computed<OpticsTrace | null>(() => { try { return opticsTrace(S.elements as OpticsElement[], S.sources as OpticsSource[], S.partial) } catch { return null } })
const BAND = ['#ef4444', '#22c55e', '#3b82f6']

type Sel = { kind: 'el' | 'src'; i: number } | null
const selected = ref<Sel>(null)
const selEl = computed(() => (selected.value?.kind === 'el' ? (S.elements[selected.value.i] as OpticsElement) : null))
const selSrc = computed(() => (selected.value?.kind === 'src' ? (S.sources[selected.value.i] as OpticsSource) : null))

function centreOf(e: OpticsElement): { x: number; y: number } {
  if ('x1' in e) return { x: (e.x1 + e.x2) / 2, y: (e.y1 + e.y2) / 2 }
  if (e.type === 'glass') return { x: e.points.reduce((s, p) => s + p.x, 0) / e.points.length, y: e.points.reduce((s, p) => s + p.y, 0) / e.points.length }
  return { x: e.x, y: e.y }
}
function moveEl(e: OpticsElement, dx: number, dy: number) {
  if ('x1' in e) { e.x1 += dx; e.x2 += dx; e.y1 += dy; e.y2 += dy } else if (e.type === 'glass') { for (const p of e.points) { p.x += dx; p.y += dy } } else { e.x += dx; e.y += dy }
}
/** Rotate an element about its centre. */
function rotateEl(e: OpticsElement, a: number) {
  const c = centreOf(e), co = Math.cos(a), si = Math.sin(a)
  const rot = (p: { x: number; y: number }) => { const x = p.x - c.x, y = p.y - c.y; return { x: c.x + co * x - si * y, y: c.y + si * x + co * y } }
  if ('x1' in e) { const p = rot({ x: e.x1, y: e.y1 }), q = rot({ x: e.x2, y: e.y2 }); e.x1 = p.x; e.y1 = p.y; e.x2 = q.x; e.y2 = q.y } else if (e.type === 'glass') e.points = e.points.map(rot)
  else if ('angle' in e) e.angle = (e.angle ?? 0) + a
}

const { canvas, wrap, redraw, at } = useLabCanvas(() => props.active, (ctx, w, h, _dt, P) => {
  const sc = S.scale
  const X = (x: number) => w / 2 + x * sc, Y = (y: number) => h / 2 - y * sc
  // grid
  ctx.strokeStyle = P.gridMinor; ctx.lineWidth = 1
  for (let x = -2; x <= 2; x += 0.1) { ctx.beginPath(); ctx.moveTo(X(x), 0); ctx.lineTo(X(x), h); ctx.stroke() }
  for (let y = -2; y <= 2; y += 0.1) { ctx.beginPath(); ctx.moveTo(0, Y(y)); ctx.lineTo(w, Y(y)); ctx.stroke() }
  // elements
  S.elements.forEach((e0, i) => {
    const e = e0 as OpticsElement
    const on = selected.value?.kind === 'el' && selected.value.i === i
    ctx.lineWidth = on ? 3 : 2
    switch (e.type) {
      case 'mirror': ctx.strokeStyle = on ? P.accent : P.text; ctx.beginPath(); ctx.moveTo(X(e.x1), Y(e.y1)); ctx.lineTo(X(e.x2), Y(e.y2)); ctx.stroke(); break
      case 'screen': ctx.strokeStyle = on ? P.accent : P.text2; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(X(e.x1), Y(e.y1)); ctx.lineTo(X(e.x2), Y(e.y2)); ctx.stroke(); break
      case 'glass': {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.16)'; ctx.strokeStyle = on ? P.accent : 'rgba(14, 116, 144, 0.8)'
        ctx.beginPath(); e.points.forEach((p, k) => (k ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y)))); ctx.closePath(); ctx.fill(); ctx.stroke(); break
      }
      case 'halfDisc': case 'disc': {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.16)'; ctx.strokeStyle = on ? P.accent : 'rgba(14, 116, 144, 0.8)'
        ctx.beginPath()
        if (e.type === 'disc') ctx.arc(X(e.x), Y(e.y), e.r * sc, 0, Math.PI * 2)
        else { const a = -(e.angle ?? 0); ctx.arc(X(e.x), Y(e.y), e.r * sc, a - Math.PI / 2, a + Math.PI / 2); ctx.closePath() }
        ctx.fill(); ctx.stroke(); break
      }
      case 'lens': {
        const wx = -Math.sin(e.angle), wy = Math.cos(e.angle)
        ctx.strokeStyle = on ? P.accent : P.tension; ctx.lineWidth = on ? 3.5 : 3
        ctx.beginPath(); ctx.moveTo(X(e.x - wx * e.half), Y(e.y - wy * e.half)); ctx.lineTo(X(e.x + wx * e.half), Y(e.y + wy * e.half)); ctx.stroke()
        ctx.fillStyle = P.text2; ctx.font = `11px ${FONT}`; ctx.fillText(`f = ${e.f}`, X(e.x) + 6, Y(e.y + wy * e.half) - 6)
        break
      }
      case 'arcMirror': {
        const ux = Math.cos(e.angle), uy = Math.sin(e.angle)
        const cx = e.x + e.R * ux, cy = e.y + e.R * uy, rad = Math.abs(e.R), span = Math.asin(Math.min(1, e.half / rad))
        const base = Math.atan2(e.y - cy, e.x - cx)
        ctx.strokeStyle = on ? P.accent : P.text
        ctx.beginPath(); ctx.arc(X(cx), Y(cy), rad * sc, -(base + span), -(base - span)); ctx.stroke()
        break
      }
    }
    const c = centreOf(e)
    ctx.fillStyle = on ? P.accent : P.text2; ctx.beginPath(); ctx.arc(X(c.x), Y(c.y), 3, 0, Math.PI * 2); ctx.fill()
  })
  // rays
  const t = trace.value
  if (t) {
    const s = t.segments
    ctx.lineCap = 'round'
    for (let k = 0; k + 5 < s.length; k += 6) {
      const band = s[k + 4], I = s[k + 5]
      ctx.strokeStyle = band < 0 ? '#f59e0b' : BAND[band]
      ctx.globalAlpha = Math.max(0.12, Math.min(1, I))
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(X(s[k]), Y(s[k + 1])); ctx.lineTo(X(s[k + 2]), Y(s[k + 3])); ctx.stroke()
    }
    ctx.globalAlpha = 1
    // normals and angles at the surfaces of the main ray
    if (S.angles) {
      ctx.font = `11px ${MONO}`
      for (const it of t.interactions.slice(0, 6)) {
        if (it.kind === 3) continue
        const L = 0.12
        ctx.strokeStyle = P.text2; ctx.lineWidth = 1; ctx.setLineDash([4, 3])
        ctx.beginPath(); ctx.moveTo(X(it.x - it.nx * L), Y(it.y - it.ny * L)); ctx.lineTo(X(it.x + it.nx * L), Y(it.y + it.ny * L)); ctx.stroke(); ctx.setLineDash([])
        ctx.fillStyle = it.kind === 2 ? P.friction : P.text
        const label = it.kind === 2 ? tl('全反射 {0}°', [(it.incidence / D).toFixed(1)]) : it.kind === 0 ? `i = r = ${(it.incidence / D).toFixed(1)}°` : `${(it.incidence / D).toFixed(1)}° → ${(it.outgoing / D).toFixed(1)}°`
        ctx.fillText(label, X(it.x) + 8, Y(it.y) - 8)
      }
    }
  }
  // sources
  S.sources.forEach((s0, i) => {
    const s = s0 as OpticsSource
    const on = selected.value?.kind === 'src' && selected.value.i === i
    ctx.fillStyle = on ? P.accent : '#f59e0b'
    ctx.beginPath(); ctx.arc(X(s.x), Y(s.y), 7, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = P.bg; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(s.x), Y(s.y)); ctx.lineTo(X(s.x) + 7 * Math.cos(s.angle), Y(s.y) - 7 * Math.sin(s.angle)); ctx.stroke()
  })
})
watch(() => [S.elements, S.sources, S.partial, S.angles, S.scale], redraw, { deep: true })
watch(selected, redraw)

let drag: { sel: NonNullable<Sel>; x: number; y: number } | null = null
const world = (px: number, py: number) => { const c = canvas.value!; return { x: (px - c.clientWidth / 2) / S.scale, y: -(py - c.clientHeight / 2) / S.scale } }
function onDown(e: PointerEvent) {
  const [px, py] = at(e)
  const p = world(px, py)
  const tol = 14 / S.scale
  let hit: Sel = null
  S.sources.forEach((s, i) => { if (Math.hypot(s.x - p.x, s.y - p.y) < tol) hit = { kind: 'src', i } })
  if (!hit) S.elements.forEach((el, i) => { const c = centreOf(el as OpticsElement); if (Math.hypot(c.x - p.x, c.y - p.y) < Math.max(tol, 0.04)) hit = { kind: 'el', i } })
  selected.value = hit
  if (hit) { drag = { sel: hit, x: p.x, y: p.y }; canvas.value!.setPointerCapture(e.pointerId) }
}
function onMove(e: PointerEvent) {
  if (!drag) return
  const [px, py] = at(e)
  const p = world(px, py)
  const dx = p.x - drag.x, dy = p.y - drag.y
  drag.x = p.x; drag.y = p.y
  if (drag.sel.kind === 'src') { const s = S.sources[drag.sel.i]; s.x += dx; s.y += dy } else moveEl(S.elements[drag.sel.i] as OpticsElement, dx, dy)
}
function onUp() { drag = null }
function onWheel(e: WheelEvent) {
  e.preventDefault()
  // over a selected source: turn it; otherwise zoom
  if (selected.value?.kind === 'src' && e.shiftKey) { S.sources[selected.value.i].angle += (e.deltaY < 0 ? 1 : -1) * D; return }
  S.scale = Math.max(120, Math.min(1200, S.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1)))
}

/** Snell's law at the first refraction of the main ray. */
const firstRefraction = computed(() => trace.value?.interactions.find(i => i.kind === 1 && i.incidence > 1e-6) ?? null)
const firstTir = computed(() => trace.value?.interactions.find(i => i.kind === 2) ?? null)
const glassN = computed(() => { const e = S.elements.find(x => 'n' in x) as { n: number } | undefined; return e?.n ?? null })
</script>

<template>
  <div class="lab-shell">
    <div class="lab-stage">
      <div class="lab-bar">
        <select class="field small" :value="S.preset" :aria-label="tl('示例光路')" @change="loadPreset(($event.target as HTMLSelectElement).value)">
          <option v-for="(p, id) in PRESETS" :key="id" :value="id">{{ p.label }}</option>
        </select>
        <span class="grow" />
        <label class="check small"><input v-model="S.angles" type="checkbox" />{{ tl('法线与角度') }}</label>
        <label class="check small"><input v-model="S.partial" type="checkbox" />{{ tl('部分反射') }}</label>
      </div>
      <div ref="wrap" class="lab-canvas">
        <canvas ref="canvas" @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @wheel="onWheel" />
        <div class="hint tiny muted">{{ tl('拖动光源（橙色圆点）或元件中心移动；选中光源后在右侧改方向；滚轮缩放') }}</div>
      </div>
    </div>
    <aside class="lab-side">
      <section v-if="selSrc" class="lab-block">
        <div class="lab-btitle">{{ tl('光源') }}</div>
        <div class="lab-fields">
          <label>{{ tl('方向') }}</label><NumField :model-value="selSrc.angle" unit="rad" @update:model-value="v => (selSrc!.angle = v)" />
          <label>{{ tl('颜色') }}</label>
          <select class="field small" :value="selSrc.color ?? 'white'" @change="(e) => { const v = (e.target as HTMLSelectElement).value; if (v === 'white') delete selSrc!.color; else selSrc!.color = v as 'red' | 'green' | 'blue' }">
            <option value="white">{{ tl('白光') }}</option><option value="red">{{ tl('红光') }}</option><option value="green">{{ tl('绿光') }}</option><option value="blue">{{ tl('蓝光') }}</option>
          </select>
          <template v-if="selSrc.type === 'beam'"><label>{{ tl('光束宽度') }}</label><NumField :model-value="selSrc.width" unit="m" :min="0" @update:model-value="v => { if (selSrc!.type === 'beam') selSrc!.width = v }" /></template>
        </div>
      </section>
      <section v-if="selEl" class="lab-block">
        <div class="lab-btitle">{{ tl('元件') }}</div>
        <div class="lab-fields">
          <template v-if="'n' in selEl"><label>{{ tl('折射率 n') }}</label><NumField :model-value="selEl.n" :min="1" :max="4" :step="0.01" @update:model-value="v => { if ('n' in selEl!) selEl!.n = v }" /></template>
          <template v-if="'n' in selEl"><label>{{ tl('色散（柯西系数 B）') }}</label><NumField :model-value="selEl.disp ?? 0" label="μm²" :min="0" :step="0.001" @update:model-value="v => { if ('n' in selEl!) selEl!.disp = v }" /></template>
          <template v-if="selEl.type === 'lens'"><label>{{ tl('焦距 f') }}</label><NumField :model-value="selEl.f" unit="m" @update:model-value="v => { if (selEl!.type === 'lens' && v !== 0) selEl!.f = v }" /></template>
          <template v-if="selEl.type === 'arcMirror'"><label>{{ tl('曲率半径 R') }}</label><NumField :model-value="selEl.R" unit="m" @update:model-value="v => { if (selEl!.type === 'arcMirror' && v !== 0) selEl!.R = v }" /></template>
        </div>
        <div class="row-btns">
          <button class="btn ghost small" @click="rotateEl(selEl!, 5 * D)">{{ tl('逆时针转 5°') }}</button>
          <button class="btn ghost small" @click="rotateEl(selEl!, -5 * D)">{{ tl('顺时针转 5°') }}</button>
        </div>
      </section>
      <section class="lab-block">
        <div class="lab-btitle">{{ tl('主光线经过的界面') }}</div>
        <div v-if="trace && trace.interactions.length" class="lab-kv">
          <template v-for="(it, k) in trace.interactions.slice(0, 8)" :key="k">
            <span>{{ it.kind === 0 ? tl('反射') : it.kind === 2 ? tl('全反射') : it.kind === 3 ? tl('透镜') : tl('折射（{0} → {1}）', [it.n1.toFixed(3), it.n2.toFixed(3)]) }}</span>
            <b>{{ (it.incidence / D).toFixed(2) }}° → {{ (it.outgoing / D).toFixed(2) }}°</b>
          </template>
        </div>
        <div v-else class="tiny muted">{{ tl('光线没有遇到元件') }}</div>
      </section>
      <section v-if="firstRefraction" class="lab-block">
        <LabFormula :title="tl('折射定律')" tex="n_1\sin i = n_2\sin r\;\Rightarrow\; r = \arcsin\dfrac{n_1\sin i}{n_2}" expr="asin(n1*sin(i)/n2)" :vars="[{ name: 'n1', symbol: 'n_1', value: firstRefraction.n1, unit: '' }, { name: 'n2', symbol: 'n_2', value: firstRefraction.n2, unit: '' }, { name: 'i', symbol: 'i', value: firstRefraction.incidence, unit: 'rad' }]" unit="rad" lhs="r" :result="firstRefraction.outgoing" />
      </section>
      <section v-if="glassN" class="lab-block">
        <LabFormula :title="tl('全反射的临界角')" tex="\sin C = \dfrac{1}{n}" expr="asin(1/n)" :vars="[{ name: 'n', symbol: 'n', value: glassN, unit: '' }]" unit="rad" lhs="C" :result="firstTir ? null : null" :note="firstTir ? tl('入射角 {0}° > C，发生全反射', [(firstTir.incidence / D).toFixed(2)]) : ''" />
      </section>
    </aside>
  </div>
</template>

<style scoped>
.row-btns { display: flex; gap: 4px; flex-wrap: wrap; }
</style>
