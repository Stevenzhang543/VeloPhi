<script setup lang="ts">
/**
 * Special relativity (26.54, D84): a frame S′ moving at v = βc. The core computes γ, the dilated time and the
 * contracted length, the Lorentz transformation of the events placed on the Minkowski diagram, the addition of
 * velocities and the relativistic energy and momentum (`relativity`); this component animates two light clocks and
 * a ruler and draws the diagram with both frames' axes.
 */
import { computed, ref, watch } from 'vue'
import { tl } from '../../../i18n'
import { fmtQ } from '../../settings'
import { relativity } from '../../../engine/labs'
import { labState } from '../../lab/state'
import { useLabCanvas } from '../../lab/canvas'
import { FONT, MONO } from '../../../render/style'
import NumField from '../NumField.vue'
import LabFormula from './LabFormula.vue'
import LabChart from './LabChart.vue'

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })

const S = labState('relativity', () => ({ beta: 0.6, uPrime: 0.5, mass: 1, events: [{ x: 1, t: 2 }, { x: -1, t: 1 }] as Array<{ x: number; t: number }>, view: 'clocks' as 'clocks' | 'diagram' }))
const R = computed(() => { try { return relativity({ beta: S.beta, properTime: 1, properLength: 1, events: S.events, uPrime: S.uPrime, mass: S.mass }) } catch { return null } })
const gammaCurve = computed(() => {
  const c = R.value?.curve
  const b: number[] = [], g: number[] = []
  if (c) for (let i = 0; i + 1 < c.length; i += 2) { b.push(c[i]); g.push(c[i + 1]) }
  return { b, g }
})

const clock = ref(0)
const { canvas, wrap, redraw, at } = useLabCanvas(() => props.active, (ctx, w, h, dt, P) => {
  const r = R.value
  if (!r) return
  clock.value += dt
  const g = r.gamma
  ctx.font = `12px ${FONT}`
  if (S.view === 'clocks') {
    // two light clocks: proper period 1 s (slowed down for the eye), the moving one runs γ times slower in S
    const L = Math.min(150, h * 0.3)
    const slow = 1.2 // seconds of animation per proper period
    const draw = (cx: number, top: number, moving: boolean, label: string) => {
      const ph = ((clock.value / (slow * (moving ? g : 1))) % 1)
      const up = ph < 0.5 ? ph * 2 : 2 - ph * 2
      ctx.strokeStyle = P.text; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(cx - 24, top); ctx.lineTo(cx + 24, top); ctx.moveTo(cx - 24, top + L); ctx.lineTo(cx + 24, top + L); ctx.stroke()
      ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.arc(cx, top + L - up * L, 5, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = P.text2; ctx.fillText(label, cx - 40, top + L + 22)
      ctx.font = `11px ${MONO}`
      ctx.fillText(tl('嘀嗒 {0} 次', [Math.floor(clock.value / (slow * (moving ? g : 1)))]), cx - 34, top - 10)
      ctx.font = `12px ${FONT}`
    }
    draw(w * 0.18, 40, false, tl('静止的光钟（S 系）'))
    // moving clock crosses the stage at βc (visual speed)
    const span = w * 0.62
    const x = w * 0.32 + ((clock.value * 140 * S.beta) % span)
    draw(x, 40, true, tl('运动的光钟 v = {0}c', [S.beta.toFixed(2)]))
    // the light path in S (diagonal) for the moving clock
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(x - 60 * S.beta, 40 + L); ctx.lineTo(x, 40); ctx.lineTo(x + 60 * S.beta, 40 + L); ctx.stroke(); ctx.setLineDash([])
    // rulers: proper length and contracted
    const y = 40 + L + 70, len = Math.min(w * 0.5, 320)
    ctx.fillStyle = P.text2; ctx.fillText(tl('静止的尺 L₀'), 20, y - 8)
    ctx.fillStyle = 'rgba(37, 99, 235, 0.7)'; ctx.fillRect(140, y - 18, len, 14)
    ctx.fillStyle = P.text2; ctx.fillText(tl('运动的尺 L = L₀/γ'), 20, y + 30)
    ctx.fillStyle = 'rgba(220, 38, 38, 0.7)'; ctx.fillRect(140, y + 18, len / g, 14)
    ctx.font = `11px ${MONO}`; ctx.fillStyle = P.text
    ctx.fillText(`γ = ${g.toFixed(4)}`, 150 + len, y + 30)
  } else {
    // Minkowski diagram: x (light-seconds) horizontally, ct vertically, both frames' axes
    const sc = Math.min(w, h) / 9
    const ox = w / 2, oy = h * 0.8
    const X = (x: number) => ox + x * sc, Y = (t: number) => oy - t * sc
    ctx.strokeStyle = P.gridMinor; ctx.lineWidth = 1
    for (let k = -8; k <= 8; k++) { ctx.beginPath(); ctx.moveTo(X(k), 0); ctx.lineTo(X(k), h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, Y(k)); ctx.lineTo(w, Y(k)); ctx.stroke() }
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.6
    ctx.beginPath(); ctx.moveTo(0, oy); ctx.lineTo(w, oy); ctx.moveTo(ox, h); ctx.lineTo(ox, 0); ctx.stroke()
    ctx.fillStyle = P.text; ctx.fillText('x', w - 14, oy - 6); ctx.fillText('ct', ox + 6, 14)
    // light cone
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.8)'; ctx.setLineDash([6, 4])
    ctx.beginPath(); ctx.moveTo(X(-8), Y(8)); ctx.lineTo(ox, oy); ctx.lineTo(X(8), Y(8)); ctx.stroke(); ctx.setLineDash([])
    // S′ axes: ct′ along (β, 1), x′ along (1, β)
    const b = S.beta
    ctx.strokeStyle = P.friction; ctx.lineWidth = 1.8
    ctx.beginPath(); ctx.moveTo(X(-8 * b), Y(-8)); ctx.lineTo(X(8 * b), Y(8)); ctx.moveTo(X(-8), Y(-8 * b)); ctx.lineTo(X(8), Y(8 * b)); ctx.stroke()
    ctx.fillStyle = P.friction; ctx.fillText("ct′", X(7 * b) + 6, Y(7)); ctx.fillText("x′", X(7.5), Y(7.5 * b) - 6)
    // unit ticks on S′ axes (hyperbola calibration: one unit of S′ is γ√(1+β²) long in the drawing)
    for (let k = 1; k <= 6; k++) {
      ctx.beginPath(); ctx.arc(X(g * b * k), Y(g * k), 2.5, 0, Math.PI * 2); ctx.arc(X(g * k), Y(g * b * k), 2.5, 0, Math.PI * 2); ctx.fill()
    }
    // events
    S.events.forEach((e, i) => {
      ctx.fillStyle = P.accent; ctx.beginPath(); ctx.arc(X(e.x), Y(e.t), 5, 0, Math.PI * 2); ctx.fill()
      const p = r.events[i]
      ctx.font = `11px ${MONO}`; ctx.fillStyle = P.text
      if (p) ctx.fillText(`(${e.x.toFixed(2)}, ${e.t.toFixed(2)}) → (${p.x.toFixed(2)}, ${p.t.toFixed(2)})′`, X(e.x) + 8, Y(e.t) - 6)
      ctx.font = `12px ${FONT}`
    })
    ctx.fillStyle = P.text2; ctx.fillText(tl('点击添加事件（单位：光秒、秒），右键删除'), 10, h - 10)
  }
}, () => props.active && S.view === 'clocks')
watch(() => [S.beta, S.events, S.view, S.uPrime, S.mass], redraw, { deep: true })

function onDown(e: PointerEvent) {
  if (S.view !== 'diagram') return
  const [px, py] = at(e)
  const c = canvas.value!
  const sc = Math.min(c.clientWidth, c.clientHeight) / 9
  const x = (px - c.clientWidth / 2) / sc, t = (c.clientHeight * 0.8 - py) / sc
  if (e.button === 2) {
    const i = S.events.findIndex(ev => Math.hypot(ev.x - x, ev.t - t) < 0.25)
    if (i >= 0) S.events.splice(i, 1)
    return
  }
  S.events.push({ x: Math.round(x * 10) / 10, t: Math.round(t * 10) / 10 })
}
const C = 299792458
</script>

<template>
  <div class="lab-shell">
    <div class="lab-stage">
      <div class="lab-bar">
        <div class="lab-seg"><button :class="{ on: S.view === 'clocks' }" @click="S.view = 'clocks'">{{ tl('光钟与尺') }}</button><button :class="{ on: S.view === 'diagram' }" @click="S.view = 'diagram'">{{ tl('闵可夫斯基图') }}</button></div>
        <label class="ctl grow">v / c<input v-model.number="S.beta" type="range" min="0" max="0.99" step="0.01" /><span class="mono">{{ S.beta.toFixed(2) }}</span></label>
      </div>
      <div ref="wrap" class="lab-canvas"><canvas ref="canvas" @pointerdown="onDown" @contextmenu.prevent /></div>
      <div class="lab-under">
        <LabChart :series="[{ x: gammaCurve.b, y: gammaCurve.g, color: '#7c3aed' }]" :markers="R ? [{ x: S.beta, y: R.gamma, label: `γ = ${R.gamma.toFixed(3)}` }] : []" :y-range="[0.9, 10.5]" :x-label="'β = v/c'" :y-label="'γ'" :height="140" />
      </div>
    </div>
    <aside class="lab-side">
      <section v-if="R" class="lab-block">
        <div class="lab-kv">
          <span>{{ tl('速度 v') }}</span><b>{{ fmtQ(S.beta * C, 'm/s', 4) }}</b>
          <span>{{ tl('洛伦兹因子 γ') }}</span><b class="big">{{ R.gamma.toPrecision(6) }}</b>
          <span>{{ tl('固有时 1 s 在 S 中') }}</span><b>{{ fmtQ(R.dilated, 's', 6) }}</b>
          <span>{{ tl('固有长度 1 m 在 S 中') }}</span><b>{{ fmtQ(R.contracted, 'm', 6) }}</b>
        </div>
        <LabFormula :title="tl('时间延缓')" tex="\Delta t = \gamma\,\Delta\tau = \dfrac{\Delta\tau}{\sqrt{1 - v^2/c^2}}" expr="tau/sqrt(1 - b^2)" :vars="[{ name: 'tau', symbol: '\Delta\tau', value: 1, unit: 's' }, { name: 'b', symbol: 'v/c', value: S.beta, unit: '' }]" unit="s" lhs="\Delta t" :result="R.dilated" />
        <LabFormula :title="tl('长度收缩')" tex="L = L_0\sqrt{1 - v^2/c^2}" expr="L0*sqrt(1 - b^2)" :vars="[{ name: 'L0', symbol: 'L_0', value: 1, unit: 'm' }, { name: 'b', symbol: 'v/c', value: S.beta, unit: '' }]" unit="m" lhs="L" :result="R.contracted" />
      </section>
      <section v-if="R" class="lab-block">
        <div class="lab-btitle">{{ tl('速度合成') }}</div>
        <div class="lab-fields"><label>{{ tl('S′ 中物体速度 u′/c') }}</label><NumField :model-value="S.uPrime" :min="-1" :max="1" :step="0.05" @update:model-value="v => (S.uPrime = v)" /></div>
        <LabFormula :title="tl('相对论速度合成')" tex="u = \dfrac{u' + v}{1 + u'v/c^2}" expr="(up + b)/(1 + up*b)" :vars="[{ name: 'up', symbol: 'u\'/c', value: S.uPrime, unit: '' }, { name: 'b', symbol: 'v/c', value: S.beta, unit: '' }]" unit="" lhs="u/c" :result="R.u" />
        <div class="tiny muted">{{ tl('经典结果 u′ + v = {0}c，不超过光速的是相对论结果。', [(S.uPrime + S.beta).toFixed(3)]) }}</div>
      </section>
      <section v-if="R" class="lab-block">
        <div class="lab-btitle">{{ tl('质能关系') }}</div>
        <div class="lab-fields"><label>{{ tl('静止质量 m') }}</label><NumField :model-value="S.mass" unit="kg" :min="1e-35" @update:model-value="v => (S.mass = v)" /></div>
        <div class="lab-kv">
          <span>{{ tl('静能 E₀ = mc²') }}</span><b>{{ fmtQ(R.dynamics.E0, 'J', 5) }}</b>
          <span>{{ tl('总能量 E = γmc²') }}</span><b>{{ fmtQ(R.dynamics.E, 'J', 5) }}</b>
          <span>{{ tl('动能 (γ − 1)mc²') }}</span><b>{{ fmtQ(R.dynamics.Ek, 'J', 5) }}</b>
          <span>{{ tl('经典动能 ½mv²') }}</span><b>{{ fmtQ(R.dynamics.EkClassical, 'J', 5) }}</b>
          <span>{{ tl('动量 p = γmv') }}</span><b>{{ fmtQ(R.dynamics.p, 'kg·m/s', 5) }}</b>
        </div>
        <LabFormula :title="tl('能量与动量的关系')" tex="E^2 = (pc)^2 + (mc^2)^2" expr="sqrt((p*c)^2 + E0^2)" :vars="[{ name: 'p', symbol: 'p', value: R.dynamics.p, unit: 'kg·m/s' }, { name: 'c', symbol: 'c', value: C, unit: 'm/s' }, { name: 'E0', symbol: 'mc^2', value: R.dynamics.E0, unit: 'J' }]" unit="J" lhs="E" :result="R.dynamics.E" />
      </section>
      <section v-if="R && S.view === 'diagram'" class="lab-block">
        <div class="lab-btitle">{{ tl('事件的坐标') }}</div>
        <div class="lab-kv">
          <template v-for="(e, i) in S.events" :key="i">
            <span>({{ e.x }}, {{ e.t }})</span><b>→ ({{ R.events[i]?.x.toFixed(3) }}, {{ R.events[i]?.t.toFixed(3) }})′</b>
          </template>
        </div>
        <div class="tiny muted lab-note">{{ tl('x′ = γ(x − vt)，t′ = γ(t − vx/c²)。在 S 中同时（同一水平线）的两个事件，在 S′ 中一般不同时。') }}</div>
      </section>
    </aside>
  </div>
</template>
