<script setup lang="ts">
/**
 * Melting and boiling (26.54, D85): a substance heated at constant power. The core gives the stages of the heating
 * curve (`heatingCurve`: Q = cmΔt in each phase, Q = mL at the melting and boiling points; an amorphous solid has no
 * plateau); this component plays the curve with a beaker and a thermometer and lists the heat of every stage.
 */
import { computed, ref, watch } from 'vue'
import { tl } from '../../../i18n'
import { fmtQ } from '../../settings'
import type { HeatStage, Substance } from '../../../engine/labs'
import { heatingCurve } from '../../../engine/labs'
import { labState } from '../../lab/state'
import { useLabCanvas } from '../../lab/canvas'
import { FONT, MONO } from '../../../render/style'
import NumField from '../NumField.vue'
import LabFormula from './LabFormula.vue'
import LabChart from './LabChart.vue'

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })

const SUBSTANCES: Record<string, { name: string; s: Substance; t0: number; tEnd: number }> = {
  water: { name: tl('水（冰 → 水 → 水蒸气）'), s: { cSolid: 2100, cLiquid: 4200, cGas: 2000, tMelt: 0, tBoil: 100, lFusion: 3.36e5, lVapour: 2.26e6 }, t0: -20, tEnd: 120 },
  naphthalene: { name: tl('萘（晶体）'), s: { cSolid: 1300, cLiquid: 1700, cGas: 1200, tMelt: 80.5, tBoil: 218, lFusion: 1.5e5, lVapour: 3.4e5 }, t0: 40, tEnd: 110 },
  paraffin: { name: tl('石蜡（非晶体）'), s: { cSolid: 2100, cLiquid: 2200, cGas: 2000, tMelt: 53, tBoil: 370, lFusion: 1.5e5, lVapour: 3e5, softFrom: 46, softTo: 60 }, t0: 20, tEnd: 90 },
  ethanol: { name: tl('酒精（液 → 气）'), s: { cSolid: 2000, cLiquid: 2400, cGas: 1500, tMelt: -114, tBoil: 78, lFusion: 1.1e5, lVapour: 8.5e5 }, t0: 20, tEnd: 100 }
}
const S = labState('heating', () => ({ substance: 'water', m: 0.2, P: 500, t0: -20, tEnd: 120, speed: 30 }))
const sub = computed(() => SUBSTANCES[S.substance] ?? SUBSTANCES.water)
function pickSubstance(id: string) { S.substance = id; S.t0 = SUBSTANCES[id].t0; S.tEnd = SUBSTANCES[id].tEnd; t.value = 0 }
const stages = computed<HeatStage[]>(() => { try { return heatingCurve(sub.value.s, S.m, S.P, S.t0, S.tEnd) } catch { return [] } })
const total = computed(() => stages.value.at(-1)?.t1 ?? 0)
const t = ref(0)
const playing = ref(false)
const stageAt = (time: number) => stages.value.find(s => time <= s.t1) ?? stages.value.at(-1) ?? null
const tempAt = (time: number) => { const s = stageAt(time); if (!s) return S.t0; const f = s.t1 > s.t0 ? Math.min(1, Math.max(0, (time - s.t0) / (s.t1 - s.t0))) : 1; return s.temp0 + f * (s.temp1 - s.temp0) }
const cur = computed(() => stageAt(t.value))
const PHASE: Record<string, string> = { solid: tl('固态吸热升温'), melting: tl('熔化（温度不变）'), liquid: tl('液态吸热升温'), boiling: tl('沸腾（温度不变）'), gas: tl('气态吸热升温'), softening: tl('逐渐变软（没有固定熔点）') }

const chart = computed(() => {
  const xs: number[] = [], ys: number[] = []
  for (const s of stages.value) { xs.push(s.t0, s.t1); ys.push(s.temp0, s.temp1) }
  return { xs, ys }
})

const { canvas, wrap, redraw } = useLabCanvas(() => props.active, (ctx, w, h, dt, P) => {
  if (playing.value) { t.value = Math.min(total.value, t.value + dt * S.speed); if (t.value >= total.value) playing.value = false }
  const s = cur.value, T = tempAt(t.value)
  // beaker
  const bx = w * 0.3, by = h * 0.18, bw = w * 0.3, bh = h * 0.62
  ctx.strokeStyle = P.text; ctx.lineWidth = 2.5
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, by + bh); ctx.lineTo(bx + bw, by + bh); ctx.lineTo(bx + bw, by); ctx.stroke()
  const phase = s?.phase ?? 'solid'
  const melted = phase === 'melting' && s ? (t.value - s.t0) / Math.max(1e-9, s.t1 - s.t0) : phase === 'solid' ? 0 : 1
  const boiled = phase === 'boiling' && s ? (t.value - s.t0) / Math.max(1e-9, s.t1 - s.t0) : phase === 'gas' ? 1 : 0
  const level = bh * 0.55 * (1 - 0.9 * boiled)
  const liquid = S.substance === 'paraffin' ? 'rgba(250, 204, 21, 0.45)' : 'rgba(56, 189, 248, 0.35)'
  if (melted > 0) { ctx.fillStyle = liquid; ctx.fillRect(bx + 2, by + bh - level * Math.max(0.15, melted), bw - 4, level * Math.max(0.15, melted) - 2) }
  // solid pieces
  const pieces = Math.round(9 * (1 - melted))
  ctx.fillStyle = S.substance === 'paraffin' ? 'rgba(254, 240, 138, 0.95)' : 'rgba(224, 242, 254, 0.95)'
  ctx.strokeStyle = 'rgba(14, 116, 144, 0.6)'; ctx.lineWidth = 1
  for (let k = 0; k < pieces; k++) {
    const x = bx + 12 + (k % 3) * (bw - 30) / 3, y = by + bh - 30 - Math.floor(k / 3) * 26
    ctx.beginPath(); ctx.roundRect(x, y, (bw - 30) / 3 - 6, 22, 4); ctx.fill(); ctx.stroke()
  }
  // bubbles and vapour
  if (phase === 'boiling' || (phase === 'liquid' && T > (sub.value.s.tBoil - 8))) {
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    const n = phase === 'boiling' ? 14 : 4
    for (let k = 0; k < n; k++) { const ph = (t.value * 3 + k * 0.37) % 1; ctx.beginPath(); ctx.arc(bx + 15 + ((k * 53) % (bw - 30)), by + bh - 6 - ph * level, 3 + (k % 3), 0, Math.PI * 2); ctx.fill() }
  }
  if (boiled > 0) { ctx.fillStyle = 'rgba(148, 163, 184, 0.25)'; for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.arc(bx + bw / 2 + Math.sin(t.value + k) * 30, by - 10 - k * 14, 14 + k * 3, 0, Math.PI * 2); ctx.fill() } }
  // flame
  ctx.fillStyle = 'rgba(249, 115, 22, 0.85)'
  ctx.beginPath(); ctx.moveTo(bx + bw / 2 - 18, by + bh + 46); ctx.quadraticCurveTo(bx + bw / 2, by + bh + 4 + 4 * Math.sin(t.value * 9), bx + bw / 2 + 18, by + bh + 46); ctx.closePath(); ctx.fill()
  ctx.fillStyle = P.text2; ctx.font = `12px ${FONT}`; ctx.fillText(`P = ${fmtQ(S.P, 'W', 3)}`, bx + bw / 2 + 26, by + bh + 40)
  // thermometer
  const tx = w * 0.72, ty = by, th = bh
  const tmin = Math.min(S.t0, -20), tmax = Math.max(S.tEnd, 110)
  const TY = (v: number) => ty + th - (v - tmin) / (tmax - tmin) * th
  ctx.strokeStyle = P.text2; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.roundRect(tx - 7, ty - 6, 14, th + 12, 7); ctx.stroke()
  ctx.fillStyle = '#ef4444'; ctx.fillRect(tx - 3, TY(T), 6, ty + th - TY(T)); ctx.beginPath(); ctx.arc(tx, ty + th + 12, 11, 0, Math.PI * 2); ctx.fill()
  ctx.font = `10px ${MONO}`; ctx.fillStyle = P.text2
  for (let v = Math.ceil(tmin / 20) * 20; v <= tmax; v += 20) { ctx.fillRect(tx + 8, TY(v), 6, 1); ctx.fillText(String(v), tx + 17, TY(v) + 3) }
  ctx.font = `bold 15px ${MONO}`; ctx.fillStyle = P.text
  ctx.fillText(`${T.toFixed(1)} °C`, tx - 30, ty - 16)
  ctx.font = `13px ${FONT}`; ctx.fillStyle = P.accent
  ctx.fillText(PHASE[phase] ?? '', bx, by - 16)
}, () => props.active && playing.value)
watch(() => [stages.value, t.value], redraw)

function play() { if (t.value >= total.value) t.value = 0; playing.value = !playing.value }
</script>

<template>
  <div class="lab-shell">
    <div class="lab-stage">
      <div class="lab-bar">
        <select class="field small" :value="S.substance" :aria-label="tl('物质')" @change="pickSubstance(($event.target as HTMLSelectElement).value)">
          <option v-for="(v, id) in SUBSTANCES" :key="id" :value="id">{{ v.name }}</option>
        </select>
        <button class="btn small primary" @click="play">{{ playing ? tl('暂停') : tl('加热') }}</button>
        <input v-model.number="t" type="range" min="0" :max="total" :step="total / 1000 || 1" class="grow" :aria-label="tl('时间')" />
        <span class="mono small">t = {{ fmtQ(t, 's', 4) }}</span>
        <label class="ctl">{{ tl('快进') }}<select v-model.number="S.speed" class="field small"><option :value="10">10×</option><option :value="30">30×</option><option :value="100">100×</option><option :value="300">300×</option></select></label>
      </div>
      <div ref="wrap" class="lab-canvas"><canvas ref="canvas" /></div>
      <div class="lab-under">
        <LabChart :series="[{ x: chart.xs, y: chart.ys, color: '#ef4444' }]" :cursor="t" :markers="[{ y: sub.s.tMelt, label: tl('熔点') }, { y: sub.s.tBoil, label: tl('沸点') }].filter(m => m.y >= S.t0 && m.y <= S.tEnd && !(S.substance === 'paraffin' && m.label === tl('熔点')))" :x-label="tl('t（s）')" :y-label="tl('温度（°C）')" :height="160" />
      </div>
    </div>
    <aside class="lab-side">
      <section class="lab-block">
        <div class="lab-fields">
          <label>{{ tl('质量 m') }}</label><NumField :model-value="S.m" unit="kg" :min="0.001" @update:model-value="v => (S.m = v)" />
          <label>{{ tl('加热功率 P') }}</label><NumField :model-value="S.P" unit="W" :min="1" @update:model-value="v => (S.P = v)" />
          <label>{{ tl('初温') }}</label><NumField :model-value="S.t0" label="°C" @update:model-value="v => { S.t0 = v; t = 0 }" />
          <label>{{ tl('终温') }}</label><NumField :model-value="S.tEnd" label="°C" @update:model-value="v => { if (v > S.t0) S.tEnd = v }" />
        </div>
      </section>
      <section class="lab-block">
        <div class="lab-btitle">{{ tl('各阶段') }}</div>
        <div class="lab-kv">
          <template v-for="(s, k) in stages" :key="k">
            <span :class="{ cur: cur === s }">{{ PHASE[s.phase] }}</span>
            <b :class="{ cur: cur === s }">{{ fmtQ(s.heat, 'J', 4) }} · {{ fmtQ(s.t1 - s.t0, 's', 3) }}</b>
          </template>
          <span>{{ tl('共计') }}</span><b class="big">{{ fmtQ(stages.reduce((a, s) => a + s.heat, 0), 'J', 4) }}</b>
        </div>
      </section>
      <section v-if="cur" class="lab-block">
        <LabFormula v-if="cur.phase === 'melting' || cur.phase === 'boiling'" :title="cur.phase === 'melting' ? tl('熔化热') : tl('汽化热')" tex="Q = mL" expr="m*L" :vars="[{ name: 'm', symbol: 'm', value: S.m, unit: 'kg' }, { name: 'L', symbol: 'L\,(\mathrm{J/kg})', value: cur.phase === 'melting' ? sub.s.lFusion : sub.s.lVapour, unit: '' }]" unit="J" lhs="Q" :result="cur.heat" />
        <LabFormula v-else-if="cur.phase !== 'softening'" :title="tl('吸热公式')" tex="Q = cm\Delta t" expr="c*m*dT" :vars="[{ name: 'c', symbol: 'c\,(\mathrm{J/(kg\cdot{}^\circ C)})', value: cur.phase === 'solid' ? sub.s.cSolid : cur.phase === 'liquid' ? sub.s.cLiquid : sub.s.cGas, unit: '' }, { name: 'm', symbol: 'm', value: S.m, unit: 'kg' }, { name: 'dT', symbol: '\Delta t\,(^\circ C)', value: cur.temp1 - cur.temp0, unit: '' }]" unit="J" lhs="Q" :result="cur.heat" />
        <LabFormula :title="tl('加热时间')" tex="t = \dfrac{Q}{P}" expr="Q/P" :vars="[{ name: 'Q', symbol: 'Q', value: cur.heat, unit: 'J' }, { name: 'P', symbol: 'P', value: S.P, unit: 'W' }]" unit="s" lhs="t" :result="cur.t1 - cur.t0" />
      </section>
      <details class="lab-block lab-details">
        <summary>{{ tl('原理') }}</summary>
        <p class="tiny muted lab-note">{{ tl('晶体有固定的熔点和沸点：熔化和沸腾时继续吸热，温度保持不变，吸收的热量 Q = mL 用来改变状态；非晶体（如石蜡）没有固定熔点，边吸热边变软，温度一直升高。不计热量损失，加热器的功率全部被物质吸收。') }}</p>
      </details>
    </aside>
  </div>
</template>

<style scoped>
.cur { color: var(--accent); }
</style>
