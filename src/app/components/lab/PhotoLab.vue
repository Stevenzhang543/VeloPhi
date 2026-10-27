<script setup lang="ts">
/**
 * Photoelectric effect (26.54, D82): a phototube lit by monochromatic light. The core computes Einstein's equation,
 * the threshold, the stopping voltage, the saturation current and the I–U curve (`photoelectric`); this component
 * animates the electrons (their number per second follows the current) and plots the curve.
 */
import { computed, watch } from 'vue'
import { tl } from '../../../i18n'
import { fmtQ } from '../../settings'
import { photoelectric } from '../../../engine/labs'
import { labState } from '../../lab/state'
import { useLabCanvas } from '../../lab/canvas'
import { wavelengthColor } from '../../lab/color'
import { FONT } from '../../../render/style'
import LabFormula from './LabFormula.vue'
import LabChart from './LabChart.vue'

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })

const METALS: Array<{ id: string; name: string; W: number }> = [
  { id: 'W', name: tl('钨'), W: 4.54 }, { id: 'Zn', name: tl('锌'), W: 3.34 }, { id: 'Ca', name: tl('钙'), W: 3.2 },
  { id: 'Na', name: tl('钠'), W: 2.29 }, { id: 'K', name: tl('钾'), W: 2.25 }, { id: 'Rb', name: tl('铷'), W: 2.13 }
]
const S = labState('photo', () => ({ metal: 'Na', wavelength: 400, power: 20, U: 2, uMin: -4, uMax: 8 }))
const W = computed(() => METALS.find(m => m.id === S.metal)?.W ?? 2.29)
const R = computed(() => { try { return photoelectric({ W: W.value, wavelength: S.wavelength, power: S.power * 1e-6, U: S.U, uMin: S.uMin, uMax: S.uMax, samples: 241 }) } catch { return null } })
const curve = computed(() => {
  const c = R.value?.curve
  if (!c) return { u: [] as number[], i: [] as number[] }
  const u: number[] = [], i: number[] = []
  for (let k = 0; k + 1 < c.length; k += 2) { u.push(c[k]); i.push(c[k + 1] * 1e6) }
  return { u, i }
})

// electrons in flight: emitted at a rate following the current, drift to the anode (or turn back)
interface Electron { x: number; y: number; v: number; back: boolean }
const electrons: Electron[] = []
let acc = 0
const { canvas, wrap, redraw } = useLabCanvas(() => props.active, (ctx, w, h, dt, P) => {
  const r = R.value
  const kx = w * 0.22, ax = w * 0.78, cy = h / 2
  // tube
  ctx.strokeStyle = P.text2; ctx.lineWidth = 2
  ctx.beginPath(); ctx.ellipse(w / 2, cy, w * 0.36, h * 0.36, 0, 0, Math.PI * 2); ctx.stroke()
  // cathode (curved) and anode
  ctx.strokeStyle = P.text; ctx.lineWidth = 5
  ctx.beginPath(); ctx.arc(kx + 60, cy, 70, Math.PI * 0.75, Math.PI * 1.25); ctx.stroke()
  ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(ax, cy - 40); ctx.lineTo(ax, cy + 40); ctx.stroke()
  ctx.fillStyle = P.text2; ctx.font = `13px ${FONT}`
  ctx.fillText('K', kx - 30, cy + 5); ctx.fillText('A', ax + 10, cy + 5)
  // light
  const col = wavelengthColor(S.wavelength, 0.75)
  ctx.strokeStyle = col; ctx.lineWidth = 2.5
  for (let k = -2; k <= 2; k++) {
    const y = cy - 120 + k * 12
    ctx.beginPath(); ctx.moveTo(kx - 120, y - 40); ctx.lineTo(kx + 4, cy + k * 14); ctx.stroke()
  }
  ctx.fillStyle = P.text2; ctx.fillText(`λ = ${S.wavelength.toFixed(0)} nm`, kx - 150, cy - 175)
  // electrons
  if (r && r.emits) {
    const rate = Math.min(60, 4 + Math.sqrt(S.power) * 6) * (r.saturation > 0 ? 1 : 0)
    acc += rate * dt
    while (acc >= 1) {
      acc -= 1
      electrons.push({ x: kx + 14, y: cy + (Math.random() - 0.5) * 60, v: 60 + 160 * Math.random(), back: false })
    }
  }
  const field = S.U // + accelerates towards A
  for (const e of electrons) {
    const a = 120 * field / 2
    e.v += a * dt
    if (e.v < 0) e.back = true
    e.x += e.v * dt
  }
  for (let k = electrons.length - 1; k >= 0; k--) { const e = electrons[k]; if (e.x > ax || e.x < kx || electrons.length > 400) electrons.splice(k, 1) }
  ctx.fillStyle = P.negative ?? '#2563eb'
  for (const e of electrons) { ctx.beginPath(); ctx.arc(e.x, e.y, 3, 0, Math.PI * 2); ctx.fill() }
  // circuit: battery polarity
  ctx.fillStyle = P.text2; ctx.font = `12px ${FONT}`
  ctx.fillText(`U_AK = ${S.U.toFixed(2)} V`, w / 2 - 40, h - 18)
  if (r && !r.emits) { ctx.fillStyle = P.friction; ctx.fillText(tl('光子能量小于逸出功：没有光电子'), w / 2 - 90, 28) }
}, () => props.active)
watch(() => [S.metal, S.wavelength, S.power, S.U], redraw)

const iNow = computed(() => (R.value?.current ?? 0))
</script>

<template>
  <div class="lab-shell">
    <div class="lab-stage">
      <div class="lab-bar">
        <label class="ctl">{{ tl('阴极材料') }}<select v-model="S.metal" class="field small"><option v-for="m in METALS" :key="m.id" :value="m.id">{{ m.name }}（W = {{ m.W }} eV）</option></select></label>
        <label class="ctl">{{ tl('波长') }}<input v-model.number="S.wavelength" type="range" min="200" max="700" step="1" /><span class="mono">{{ S.wavelength }} nm</span></label>
        <label class="ctl">{{ tl('光功率') }}<input v-model.number="S.power" type="range" min="1" max="100" step="1" /><span class="mono">{{ S.power }} μW</span></label>
        <label class="ctl">{{ tl('电压 U_AK') }}<input v-model.number="S.U" type="range" :min="S.uMin" :max="S.uMax" step="0.05" /><span class="mono">{{ S.U.toFixed(2) }} V</span></label>
      </div>
      <div ref="wrap" class="lab-canvas"><canvas ref="canvas" /></div>
      <div class="lab-under">
        <LabChart :series="[{ x: curve.u, y: curve.i, color: '#0a6cff' }]" :cursor="S.U" :markers="R && R.emits ? [{ x: -R.stopVoltage, label: '−U_c' }] : []" :x-label="tl('U_AK（V）')" :y-label="tl('I（μA）')" :height="160" />
      </div>
    </div>
    <aside class="lab-side">
      <section v-if="R" class="lab-block">
        <div class="lab-kv">
          <span>{{ tl('光子能量 hν') }}</span><b class="big">{{ R.photon.toFixed(3) }} eV</b>
          <span>{{ tl('逸出功 W') }}</span><b>{{ R.work.toFixed(2) }} eV</b>
          <span>{{ tl('最大初动能 Ek') }}</span><b class="big">{{ R.ekMax.toFixed(3) }} eV</b>
          <span>{{ tl('遏止电压 U_c') }}</span><b>{{ fmtQ(R.stopVoltage, 'V') }}</b>
          <span>{{ tl('截止频率 ν₀') }}</span><b>{{ R.thresholdFrequency.toExponential(3) }} Hz</b>
          <span>{{ tl('截止波长 λ₀') }}</span><b>{{ R.thresholdWavelength.toFixed(1) }} nm</b>
          <span>{{ tl('每秒光子数') }}</span><b>{{ R.photonRate.toExponential(3) }}</b>
          <span>{{ tl('饱和电流 I_s') }}</span><b>{{ fmtQ(R.saturation, 'A') }}</b>
          <span>{{ tl('此时电流 I') }}</span><b class="big">{{ fmtQ(iNow, 'A') }}</b>
        </div>
      </section>
      <section v-if="R" class="lab-block">
        <LabFormula :title="tl('爱因斯坦光电效应方程')" tex="E_k = h\nu - W = \dfrac{hc}{\lambda} - W" expr="1239.8419843320026/lambda - W" :vars="[{ name: 'lambda', symbol: '\lambda\,(\mathrm{nm})', value: S.wavelength, unit: '' }, { name: 'W', symbol: 'W\,(\mathrm{eV})', value: R.work, unit: '' }]" unit="" lhs="E_k\,(\mathrm{eV})" :result="R.emits ? R.ekMax : null" :note="R.emits ? '' : tl('hν < W：不发生光电效应')" />
        <LabFormula :title="tl('截止频率')" tex="\nu_0 = \dfrac{W}{h}" expr="W*1.602176634e-19/6.62607015e-34" :vars="[{ name: 'W', symbol: 'W\,(\mathrm{eV})', value: R.work, unit: '' }]" unit="Hz" lhs="\nu_0" :result="R.thresholdFrequency" />
      </section>
      <details class="lab-block lab-details">
        <summary>{{ tl('模型说明') }}</summary>
        <p class="tiny muted lab-note">{{ tl('每个光子最多打出一个电子（量子效率 5%），所以饱和电流正比于光的功率而与频率的关系只通过光子数体现；光电子的最大初动能只由频率决定。反向电压下，只有动能大于 eU 的电子能到达阳极，U = −U_c 时电流为零；正向电压增大时电流逐渐达到饱和（收集效率的简化模型）。') }}</p>
      </details>
    </aside>
  </div>
</template>
