<script setup lang="ts">
/**
 * Imaging by thin lenses and spherical mirrors (26.54, D81). The core computes the image (`opticsImage`: 1/u + 1/v =
 * 1/f, m = −v/u) and the three special rays; this component draws the bench, lets the object be dragged, and shows
 * the nature of the image and the textbook rules (u > 2f, f < u < 2f, u < f …), with the curve v(u).
 */
import { computed, watch } from 'vue'
import { tl } from '../../../i18n'
import { fmtQ } from '../../settings'
import { opticsImage } from '../../../engine/labs'
import { labState } from '../../lab/state'
import { useLabCanvas } from '../../lab/canvas'
import { FONT } from '../../../render/style'
import NumField from '../NumField.vue'
import LabFormula from './LabFormula.vue'
import LabChart from './LabChart.vue'

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })

type Kind = 'convex' | 'concave' | 'concaveMirror' | 'convexMirror'
const KINDS: Array<{ id: Kind; label: string }> = [
  { id: 'convex', label: tl('凸透镜') }, { id: 'concave', label: tl('凹透镜') }, { id: 'concaveMirror', label: tl('凹面镜') }, { id: 'convexMirror', label: tl('凸面镜') }
]
const S = labState('lens', () => ({ kind: 'convex' as Kind, f: 0.1, u: 0.3, h: 0.03, rays: true }))
const mirror = computed(() => S.kind === 'concaveMirror' || S.kind === 'convexMirror')
const fSigned = computed(() => (S.kind === 'convex' || S.kind === 'concaveMirror' ? S.f : -S.f))
const img = computed(() => { try { return opticsImage(mirror.value ? 'mirror' : 'lens', fSigned.value, S.u, S.h) } catch { return null } })

const nature = computed(() => {
  const i = img.value
  if (!i || i.v === null || i.m === null) return tl('物体在焦点上：不成像（折射或反射光平行）')
  const m = Math.abs(i.m)
  const size = Math.abs(m - 1) < 1e-9 ? tl('等大') : m > 1 ? tl('放大') : tl('缩小')
  return tl('{0}、{1}的{2}', [i.upright ? tl('正立') : tl('倒立'), size, i.real ? tl('实像') : tl('虚像')])
})
const rule = computed(() => {
  if (fSigned.value < 0) return mirror.value ? tl('凸面镜总成正立、缩小的虚像（如汽车后视镜）') : tl('凹透镜总成正立、缩小的虚像（如近视眼镜）')
  const u = S.u, f = S.f
  if (u > 2 * f + 1e-12) return mirror.value ? tl('u > 2f：倒立缩小的实像，在 f 与 2f 之间') : tl('u > 2f：倒立缩小的实像，f < v < 2f（照相机）')
  if (Math.abs(u - 2 * f) <= 1e-12) return tl('u = 2f：倒立等大的实像，v = 2f')
  if (u > f) return mirror.value ? tl('f < u < 2f：倒立放大的实像，v > 2f') : tl('f < u < 2f：倒立放大的实像，v > 2f（投影仪）')
  if (Math.abs(u - f) <= 1e-12) return tl('u = f：不成像')
  return mirror.value ? tl('u < f：正立放大的虚像（如化妆镜）') : tl('u < f：正立放大的虚像，与物同侧（放大镜）')
})

// v(u) curve and magnification for the chart
const curve = computed(() => {
  const f = fSigned.value, us: number[] = [], vs: number[] = []
  const umax = Math.max(4 * Math.abs(f), S.u * 1.3)
  for (let k = 1; k <= 240; k++) {
    const u = (umax * k) / 240
    us.push(u)
    const v = Math.abs(u - f) < 1e-9 ? NaN : (u * f) / (u - f)
    vs.push(Math.abs(v) > 12 * Math.abs(f) ? NaN : v)
  }
  return { us, vs, umax }
})

const { canvas, wrap, redraw, at } = useLabCanvas(() => props.active, (ctx, w, h, _dt, P) => {
  const i = img.value
  const reach = Math.max(S.u, Math.abs(i?.v ?? 0), 2.4 * S.f) * 1.25
  const sc = Math.min((w / 2 - 20) / reach, (h / 2 - 30) / Math.max(S.h * 3, Math.abs(i?.tip?.y ?? 0) * 1.3, S.f * 0.6))
  const X = (x: number) => w / 2 + x * sc, Y = (y: number) => h / 2 - y * sc
  // axis
  ctx.strokeStyle = P.text2; ctx.lineWidth = 1; ctx.setLineDash([8, 4, 2, 4])
  ctx.beginPath(); ctx.moveTo(0, Y(0)); ctx.lineTo(w, Y(0)); ctx.stroke(); ctx.setLineDash([])
  // focal points (both sides for lenses; in front for mirrors)
  ctx.fillStyle = P.text2; ctx.font = `12px ${FONT}`
  const marks: Array<[number, string]> = mirror.value ? [[-fSigned.value, 'F'], [-2 * fSigned.value, 'C']] : [[-S.f, 'F'], [S.f, "F'"], [-2 * S.f, '2F'], [2 * S.f, "2F'"]]
  for (const [x, t] of marks) { ctx.beginPath(); ctx.arc(X(x), Y(0), 3, 0, Math.PI * 2); ctx.fill(); ctx.fillText(t, X(x) - 6, Y(0) + 16) }
  // element
  const eh = Math.min(h * 0.42, Math.max(S.h * 2.2, S.f * 0.5) * sc)
  ctx.strokeStyle = P.accent; ctx.lineWidth = 2.4
  if (!mirror.value) {
    ctx.beginPath(); ctx.moveTo(X(0), Y(0) - eh); ctx.lineTo(X(0), Y(0) + eh); ctx.stroke()
    // arrowheads pointing out (convex) or in (concave)
    const head = (y: number, d: number) => { ctx.beginPath(); ctx.moveTo(X(0) - 7, y + d * 8); ctx.lineTo(X(0), y); ctx.lineTo(X(0) + 7, y + d * 8); ctx.stroke() }
    const out = S.kind === 'convex' ? 1 : -1
    head(Y(0) - eh, out); head(Y(0) + eh, -out)
  } else {
    const bulge = (S.kind === 'concaveMirror' ? 1 : -1) * 10
    ctx.beginPath(); ctx.moveTo(X(0) - bulge, Y(0) - eh); ctx.quadraticCurveTo(X(0) + bulge, Y(0), X(0) - bulge, Y(0) + eh); ctx.stroke()
    ctx.strokeStyle = P.text2; ctx.lineWidth = 1
    for (let y = -eh; y <= eh; y += 10) { ctx.beginPath(); ctx.moveTo(X(0) + 4, Y(0) + y); ctx.lineTo(X(0) + 12, Y(0) + y - 6); ctx.stroke() }
  }
  // rays
  if (S.rays && i) {
    const cols = [P.velocity, P.friction, P.tension]
    i.rays.forEach((ray, k) => {
      ctx.strokeStyle = cols[k % 3]; ctx.lineWidth = 1.6
      for (const s of ray) {
        ctx.setLineDash(s.virtual ? [5, 4] : [])
        ctx.globalAlpha = s.virtual ? 0.7 : 1
        ctx.beginPath(); ctx.moveTo(X(s.x1), Y(s.y1)); ctx.lineTo(X(s.x2), Y(s.y2)); ctx.stroke()
      }
    })
    ctx.setLineDash([]); ctx.globalAlpha = 1
  }
  // object and image arrows
  const arrowUp = (x: number, y0: number, y1: number, col: string, dashed: boolean) => {
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 3; ctx.setLineDash(dashed ? [6, 4] : [])
    ctx.beginPath(); ctx.moveTo(X(x), Y(y0)); ctx.lineTo(X(x), Y(y1)); ctx.stroke(); ctx.setLineDash([])
    const d = y1 > y0 ? 1 : -1
    ctx.beginPath(); ctx.moveTo(X(x), Y(y1) - d * 2); ctx.lineTo(X(x) - 6, Y(y1) + d * 9); ctx.lineTo(X(x) + 6, Y(y1) + d * 9); ctx.closePath(); ctx.fill()
  }
  arrowUp(-S.u, 0, S.h, P.applied, false)
  ctx.fillStyle = P.applied; ctx.fillText(tl('物'), X(-S.u) - 6, Y(S.h) - 10)
  if (i?.tip) {
    arrowUp(i.tip.x, 0, i.tip.y, P.gravity, !i.real)
    ctx.fillStyle = P.gravity; ctx.fillText(i.real ? tl('实像') : tl('虚像'), X(i.tip.x) - 12, Y(i.tip.y) + (i.tip.y > 0 ? -10 : 18))
  }
})
watch(() => [S.kind, S.f, S.u, S.h, S.rays], redraw)

let drag = false
function onDown(e: PointerEvent) {
  const [px] = at(e)
  const c = canvas.value!
  const w = c.clientWidth
  drag = true
  c.setPointerCapture(e.pointerId)
  move(px, w)
}
function move(px: number, w: number) {
  const i = img.value
  const reach = Math.max(S.u, Math.abs(i?.v ?? 0), 2.4 * S.f) * 1.25
  const sc = (w / 2 - 20) / reach
  const u = (w / 2 - px) / sc
  if (u > S.f * 0.05) S.u = Math.round(u * 1000) / 1000
}
function onMove(e: PointerEvent) { if (drag) move(at(e)[0], canvas.value!.clientWidth) }
function onUp() { drag = false }
</script>

<template>
  <div class="lab-shell">
    <div class="lab-stage">
      <div class="lab-bar">
        <div class="lab-seg"><button v-for="k in KINDS" :key="k.id" :class="{ on: S.kind === k.id }" @click="S.kind = k.id">{{ k.label }}</button></div>
        <span class="grow" />
        <label class="check small"><input v-model="S.rays" type="checkbox" />{{ tl('特殊光线') }}</label>
      </div>
      <div ref="wrap" class="lab-canvas">
        <canvas ref="canvas" @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" />
        <div class="hint tiny muted">{{ tl('在光轴左侧拖动，改变物距 u') }}</div>
      </div>
      <div class="lab-under">
        <LabChart :series="[{ x: curve.us, y: curve.vs, color: '#0a6cff' }]" :markers="img && img.v !== null ? [{ x: S.u, y: img.v, label: 'v' }, { x: S.f, label: 'f' }, { x: 2 * S.f, label: '2f' }] : [{ x: S.f, label: 'f' }]" :x-label="tl('物距 u（m）')" :y-label="tl('像距 v（m）')" :height="150" />
      </div>
    </div>
    <aside class="lab-side">
      <section class="lab-block">
        <div class="lab-fields">
          <label>{{ tl('焦距 |f|') }}</label><NumField :model-value="S.f" unit="m" :min="0.001" @update:model-value="v => (S.f = v)" />
          <label>{{ tl('物距 u') }}</label><NumField :model-value="S.u" unit="m" :min="0.0001" @update:model-value="v => (S.u = v)" />
          <label>{{ tl('物高 h') }}</label><NumField :model-value="S.h" unit="m" :min="0.0001" @update:model-value="v => (S.h = v)" />
        </div>
      </section>
      <section class="lab-block">
        <div class="lab-btitle">{{ tl('像') }}</div>
        <div class="lab-kv">
          <span>{{ tl('像距 v') }}</span><b class="big">{{ img && img.v !== null ? fmtQ(img.v, 'm') : '∞' }}</b>
          <span>{{ tl('放大率 m') }}</span><b>{{ img && img.m !== null ? Number(img.m.toPrecision(4)) : '—' }}</b>
          <span>{{ tl('像高') }}</span><b>{{ img && img.tip ? fmtQ(img.tip.y, 'm') : '—' }}</b>
        </div>
        <div class="small"><b>{{ nature }}</b></div>
        <div class="tiny muted lab-note">{{ rule }}</div>
      </section>
      <section v-if="img && img.v !== null" class="lab-block">
        <LabFormula :title="mirror ? tl('球面镜成像公式') : tl('薄透镜成像公式')" tex="\dfrac{1}{u} + \dfrac{1}{v} = \dfrac{1}{f}\;\Rightarrow\; v = \dfrac{uf}{u - f}" expr="u*f/(u - f)" :vars="[{ name: 'u', symbol: 'u', value: S.u, unit: 'm' }, { name: 'f', symbol: 'f', value: fSigned, unit: 'm' }]" unit="m" lhs="v" :result="img.v" />
        <LabFormula :title="tl('放大率')" tex="m = -\dfrac{v}{u}" expr="-v/u" :vars="[{ name: 'v', symbol: 'v', value: img.v, unit: 'm' }, { name: 'u', symbol: 'u', value: S.u, unit: 'm' }]" unit="" lhs="m" :result="img.m" />
      </section>
      <details class="lab-block lab-details">
        <summary>{{ tl('符号约定') }}</summary>
        <p class="tiny muted lab-note">{{ tl('物距 u 取正；实像的像距 v 为正（透镜在另一侧、面镜在同侧），虚像为负；会聚的凸透镜和凹面镜 f > 0，凹透镜和凸面镜 f < 0。m < 0 为倒立。三条特殊光线：平行于主光轴的光线经过（或反向延长线经过）焦点；过光心（面镜顶点）的光线；过焦点的光线变成平行光。') }}</p>
      </details>
    </aside>
  </div>
</template>
