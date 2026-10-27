<script setup lang="ts">
/**
 * Interference and diffraction (26.55, D93): single slit, double slit, grating (Fraunhofer intensity, exact in the
 * angle), thin films (Airy reflectance, the colours of a soap-film wedge in white light) and polarizers (Malus). The
 * core computes the intensities and the colours (`waveOptics`); this component paints the screen and the curve.
 */
import { computed, watch } from 'vue'
import { tl } from '../../../i18n'
import { fmtQ } from '../../settings'
import type { FilmPattern, SlitPattern } from '../../../engine/labs'
import { filmPattern, polarizers, slitPattern } from '../../../engine/labs'
import { labState } from '../../lab/state'
import { useLabCanvas } from '../../lab/canvas'
import { FONT } from '../../../render/style'
import NumField from '../NumField.vue'
import LabFormula from './LabFormula.vue'
import LabChart from './LabChart.vue'

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })

const S = labState('wave-optics', () => ({
  setup: 'double' as 'single' | 'double' | 'grating' | 'film' | 'polarizer',
  lambda: 600, white: false, a: 0.02e-3, d: 0.25e-3, N: 6, L: 2, half: 0.03,
  n1: 1.33, n2: 1.0, t0: 0, t1: 1200, t: 300,
  angles: [0, 45, 90], polarizedIn: false, inAngle: 0
}))
const SAMPLES = 801

const slit = computed<SlitPattern | null>(() => {
  if (S.setup === 'film' || S.setup === 'polarizer') return null
  try { return slitPattern({ setup: S.setup, lambda: S.lambda, white: S.white, a: S.a, d: S.d, N: S.N, L: S.L, half: S.half, samples: SAMPLES }) } catch { return null }
})
const film = computed<FilmPattern | null>(() => {
  if (S.setup !== 'film') return null
  try { return filmPattern({ lambda: S.lambda, white: S.white, n0: 1, n1: S.n1, n2: S.n2, t0: S.t0, t1: S.t1, t: S.t, samples: SAMPLES }) } catch { return null }
})
const pol = computed(() => (S.setup === 'polarizer' ? (() => { try { return polarizers(S.angles.map(a => a * Math.PI / 180), S.polarizedIn ? S.inAngle * Math.PI / 180 : null) } catch { return [] } })() : []))

const { canvas, wrap, redraw } = useLabCanvas(() => props.active, (ctx, w, h, _dt, P) => {
  if (S.setup === 'polarizer') { drawPolarizers(ctx, w, h, P); return }
  const rgb = slit.value?.rgb ?? film.value?.rgb
  if (!rgb) return
  const n = rgb.length / 3
  const top = 24, bandH = Math.max(40, h - 70)
  // the screen
  for (let i = 0; i < n; i++) {
    const x0 = Math.floor((i / n) * w), x1 = Math.ceil(((i + 1) / n) * w)
    ctx.fillStyle = `rgb(${Math.round(rgb[3 * i] * 255)},${Math.round(rgb[3 * i + 1] * 255)},${Math.round(rgb[3 * i + 2] * 255)})`
    ctx.fillRect(x0, top, x1 - x0, bandH)
  }
  ctx.strokeStyle = P.gridMajor; ctx.strokeRect(0.5, top, w - 1, bandH)
  ctx.fillStyle = P.text2; ctx.font = `11px ${FONT}`
  if (slit.value) {
    ctx.fillText(tl('光屏（宽 {0}）', [fmtQ(2 * S.half, 'm', 3)]), 6, 16)
    const X = (x: number) => (x + S.half) / (2 * S.half) * w
    ctx.fillStyle = P.text
    for (const [m, x] of slit.value.maxima) { ctx.fillRect(X(x) - 0.5, top + bandH, 1, 6); if (Math.abs(m) <= 6) ctx.fillText(String(m), X(x) - 3, top + bandH + 18) }
  } else {
    ctx.fillText(tl('楔形薄膜：厚度从 {0} 到 {1}（反射光）', [`${S.t0} nm`, `${S.t1} nm`]), 6, 16)
    const X = (t: number) => (t - S.t0) / (S.t1 - S.t0) * w
    ctx.fillStyle = P.accent; ctx.fillRect(X(S.t) - 1, top - 4, 2, bandH + 8)
  }
})
watch(() => [slit.value, film.value, pol.value, S.setup], redraw)

function drawPolarizers(ctx: CanvasRenderingContext2D, w: number, h: number, P: { text: string; text2: string; accent: string; gridMajor: string }) {
  const n = S.angles.length, y = h / 2
  const gap = w / (n + 2)
  ctx.strokeStyle = P.gridMajor; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(20, y); ctx.lineTo(w - 20, y); ctx.stroke()
  // light beam with its intensity
  let I = 1
  for (let k = 0; k <= n; k++) {
    const x0 = k === 0 ? 20 : gap * (k + 0.5), x1 = k === n ? w - 20 : gap * (k + 1.5)
    ctx.strokeStyle = `rgba(250, 204, 21, ${0.15 + 0.85 * I})`; ctx.lineWidth = 4 + 18 * I
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke()
    if (k < n) I = pol.value[k] ?? 0
  }
  S.angles.forEach((a, k) => {
    const x = gap * (k + 1.5)
    ctx.strokeStyle = P.text; ctx.lineWidth = 2
    ctx.beginPath(); ctx.ellipse(x, y, 14, 46, 0, 0, Math.PI * 2); ctx.stroke()
    const r = a * Math.PI / 180
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.moveTo(x - 12 * Math.sin(r), y - 40 * Math.cos(r)); ctx.lineTo(x + 12 * Math.sin(r), y + 40 * Math.cos(r)); ctx.stroke()
    ctx.fillStyle = P.text2; ctx.font = `12px ${FONT}`
    ctx.fillText(`${a}°`, x - 10, y + 66)
    ctx.fillText(`I = ${((pol.value[k] ?? 0) * 100).toFixed(1)}%`, x - 24, y - 56)
  })
}

const chart = computed(() => {
  if (slit.value) return { x: Array.from(slit.value.x, v => v * 1000), y: Array.from(slit.value.I), xl: tl('x（mm）'), yl: tl('I / I₀') }
  if (film.value) return { x: Array.from(film.value.t, v => v * 1e9), y: Array.from(film.value.R), xl: tl('厚度（nm）'), yl: tl('反射率 R') }
  return null
})
const firstMax = computed(() => slit.value?.maxima.find(m => m[0] === 1)?.[1] ?? null)
const firstMin = computed(() => slit.value?.minima.find(m => m[0] === 1)?.[1] ?? null)
function addPolarizer() { if (S.angles.length < 6) S.angles.push(S.angles[S.angles.length - 1] ?? 0) }
</script>

<template>
  <div class="lab-shell">
    <div class="lab-stage">
      <div class="lab-bar">
        <div class="lab-seg">
          <button :class="{ on: S.setup === 'single' }" @click="S.setup = 'single'">{{ tl('单缝衍射') }}</button>
          <button :class="{ on: S.setup === 'double' }" @click="S.setup = 'double'">{{ tl('双缝干涉') }}</button>
          <button :class="{ on: S.setup === 'grating' }" @click="S.setup = 'grating'">{{ tl('光栅') }}</button>
          <button :class="{ on: S.setup === 'film' }" @click="S.setup = 'film'">{{ tl('薄膜干涉') }}</button>
          <button :class="{ on: S.setup === 'polarizer' }" @click="S.setup = 'polarizer'">{{ tl('偏振') }}</button>
        </div>
        <template v-if="S.setup !== 'polarizer'">
          <label class="ctl"><input v-model="S.white" type="checkbox" />{{ tl('白光') }}</label>
          <label v-if="!S.white" class="ctl">λ <input v-model.number="S.lambda" type="range" min="380" max="780" step="1" :aria-label="tl('波长')" /> {{ S.lambda }} nm</label>
        </template>
      </div>
      <div ref="wrap" class="lab-canvas"><canvas ref="canvas" /></div>
      <div v-if="chart" class="lab-under">
        <LabChart :series="[{ x: chart.x, y: chart.y, color: S.white ? '#888' : '#d97706', width: 1.6 }]" :x-label="chart.xl" :y-label="chart.yl" :height="150" :markers="S.setup === 'film' ? [{ x: S.t }] : []" />
      </div>
    </div>
    <aside class="lab-side">
      <section v-if="S.setup !== 'film' && S.setup !== 'polarizer'" class="lab-block">
        <div class="lab-fields">
          <label>{{ tl('缝宽 a') }}</label><NumField :model-value="S.a" unit="m" :min="1e-7" @update:model-value="v => (S.a = v)" />
          <template v-if="S.setup !== 'single'"><label>{{ tl('缝间距 d') }}</label><NumField :model-value="S.d" unit="m" :min="1e-7" @update:model-value="v => (S.d = v)" /></template>
          <template v-if="S.setup === 'grating'"><label>{{ tl('缝数 N') }}</label><NumField :model-value="S.N" :min="2" :max="2000" :step="1" @update:model-value="v => (S.N = Math.round(v))" /></template>
          <label>{{ tl('缝到屏的距离 L') }}</label><NumField :model-value="S.L" unit="m" :min="0.01" @update:model-value="v => (S.L = v)" />
          <label>{{ tl('屏的半宽') }}</label><NumField :model-value="S.half" unit="m" :min="1e-4" @update:model-value="v => (S.half = v)" />
        </div>
        <div v-if="slit" class="lab-kv">
          <template v-if="S.setup !== 'single'"><span>{{ tl('条纹间距 Lλ/d') }}</span><b class="big">{{ fmtQ(slit.spacing, 'm', 4) }}</b></template>
          <template v-if="firstMax !== null"><span>{{ tl('一级亮纹位置') }}</span><b>{{ fmtQ(firstMax, 'm', 5) }}</b></template>
          <span>{{ tl('中央亮纹宽度 2Lλ/a') }}</span><b>{{ fmtQ(slit.centralWidth, 'm', 4) }}</b>
          <template v-if="firstMin !== null"><span>{{ tl('单缝第一暗纹位置') }}</span><b>{{ fmtQ(firstMin, 'm', 5) }}</b></template>
        </div>
        <LabFormula v-if="S.setup === 'double' && firstMax !== null" :title="tl('双缝干涉的条纹间距')" tex="\Delta x = \dfrac{L}{d}\lambda" expr="L/d*lam" :vars="[{ name: 'L', symbol: 'L', value: S.L, unit: 'm' }, { name: 'd', symbol: 'd', value: S.d, unit: 'm' }, { name: 'lam', symbol: '\lambda', value: S.lambda * 1e-9, unit: 'm' }]" unit="m" lhs="\Delta x" :result="firstMax" />
        <LabFormula v-if="S.setup === 'grating' && firstMax !== null" :title="tl('光栅方程')" tex="d\sin\theta = m\lambda" expr="L*tan(asin(lam/d))" :vars="[{ name: 'L', symbol: 'L', value: S.L, unit: 'm' }, { name: 'd', symbol: 'd', value: S.d, unit: 'm' }, { name: 'lam', symbol: '\lambda', value: S.lambda * 1e-9, unit: 'm' }]" unit="m" lhs="x_1" :result="firstMax" />
        <LabFormula v-if="S.setup === 'single' && firstMin !== null" :title="tl('单缝衍射的暗纹')" tex="a\sin\theta = \lambda" expr="L*tan(asin(lam/a))" :vars="[{ name: 'L', symbol: 'L', value: S.L, unit: 'm' }, { name: 'a', symbol: 'a', value: S.a, unit: 'm' }, { name: 'lam', symbol: '\lambda', value: S.lambda * 1e-9, unit: 'm' }]" unit="m" lhs="x_1" :result="firstMin" />
        <p class="tiny muted lab-note">{{ tl('强度按夫琅禾费衍射计算：I = I₀(sin β/β)²(sin Nα/(N sin α))²，α = πd sinθ/λ，β = πa sinθ/λ，x = L tanθ（不用小角近似）。缝宽 a 决定包络，缝间距 d 决定条纹间距，缝数越多主极大越细。') }}</p>
      </section>
      <section v-if="S.setup === 'film'" class="lab-block">
        <div class="lab-fields">
          <label>{{ tl('薄膜折射率 n') }}</label><NumField :model-value="S.n1" :min="1" :step="0.01" @update:model-value="v => (S.n1 = v)" />
          <label>{{ tl('膜下介质折射率') }}</label><NumField :model-value="S.n2" :min="1" :step="0.01" @update:model-value="v => (S.n2 = v)" />
          <label>{{ tl('厚度范围（nm）') }}</label><span><NumField :model-value="S.t0" :min="0" @update:model-value="v => (S.t0 = v)" /> – <NumField :model-value="S.t1" :min="1" @update:model-value="v => (S.t1 = v)" /></span>
          <label>{{ tl('观察点的厚度（nm）') }}</label><input v-model.number="S.t" type="range" :min="S.t0" :max="S.t1" step="1" :aria-label="tl('厚度')" />
        </div>
        <div v-if="film" class="lab-kv"><span>{{ tl('此处反射率（λ = {0} nm）', [S.lambda]) }}</span><b class="big">{{ (film.Rat * 100).toFixed(2) }}%</b></div>
        <LabFormula :title="tl('反射光加强的条件（膜两侧都是空气）')" tex="2nd = \left(k + \tfrac12\right)\lambda" expr="(k + 0.5)*lam/(2*n)" :vars="[{ name: 'k', symbol: 'k', value: 0, unit: '' }, { name: 'lam', symbol: '\lambda', value: S.lambda, unit: '' }, { name: 'n', symbol: 'n', value: S.n1, unit: '' }]" unit="" lhs="d/\text{nm}" />
        <p class="tiny muted lab-note">{{ tl('反射率由多次反射的振幅叠加（艾里公式）精确算出，菲涅耳系数的符号已包含半波损失。白光下不同厚度处加强的波长不同，所以肥皂膜呈现彩色条纹；膜极薄时反射光相消，显出黑色。') }}</p>
      </section>
      <section v-if="S.setup === 'polarizer'" class="lab-block">
        <label class="check small"><input v-model="S.polarizedIn" type="checkbox" />{{ tl('入射光是线偏振光') }}</label>
        <div v-if="S.polarizedIn" class="lab-fields"><label>{{ tl('偏振方向') }}</label><input v-model.number="S.inAngle" type="range" min="-90" max="90" step="1" :aria-label="tl('偏振方向')" /></div>
        <div v-for="(a, k) in S.angles" :key="k" class="lab-fields">
          <label>{{ tl('偏振片 {0}', [k + 1]) }}</label>
          <span class="row"><input v-model.number="S.angles[k]" type="range" min="-90" max="180" step="1" :aria-label="tl('偏振片 {0}', [k + 1])" /> {{ a }}°</span>
        </div>
        <div class="row">
          <button class="btn ghost small" @click="addPolarizer">{{ tl('加一片') }}</button>
          <button class="btn ghost small" :disabled="S.angles.length <= 1" @click="S.angles.pop()">{{ tl('去掉一片') }}</button>
        </div>
        <LabFormula v-if="S.angles.length >= 2" :title="tl('马吕斯定律')" tex="I = I_0\cos^2\theta" expr="I0*cos(th)^2" :vars="[{ name: 'I0', symbol: 'I_0', value: pol[0] ?? 0, unit: '' }, { name: 'th', symbol: '\theta', value: (S.angles[1] - S.angles[0]) * Math.PI / 180, unit: 'rad' }]" unit="" lhs="I" :result="pol[1] ?? null" />
        <p class="tiny muted lab-note">{{ tl('自然光通过第一片偏振片后强度减半；之后每片按 I = I₀cos²θ 减弱（θ 为两片透振方向的夹角）。两片正交时不透光，中间再斜插一片，光又能通过一部分。') }}</p>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.row { display: flex; align-items: center; gap: 6px; }
</style>
