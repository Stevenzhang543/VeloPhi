<script setup lang="ts">
/**
 * One-dimensional quantum mechanics (26.55, D94): an electron in a potential. The core evolves the wave function
 * (`quantumRun`: split-operator Fourier method; the infinite well exactly in its eigenbasis) and finds the bound
 * states (`quantumSetup`: Sturm bisection and inverse iteration). Lengths in nm, energies in eV, times in fs.
 */
import { computed, ref, watch } from 'vue'
import { tl } from '../../../i18n'
import { fmtQ } from '../../settings'
import type { QPotential, QSetup } from '../../../engine/labs'
import { quantumRun, quantumSetup } from '../../../engine/labs'
import QuantumConvergence from './QuantumConvergence.vue'
import { labState } from '../../lab/state'
import { useLabCanvas } from '../../lab/canvas'
import { FONT, MONO } from '../../../render/style'
import NumField from '../NumField.vue'
import LabFormula from './LabFormula.vue'

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })

type Kind = 'free' | 'barrier' | 'step' | 'well' | 'box' | 'harmonic' | 'double'
const KINDS: Array<{ id: Kind; label: string }> = [
  { id: 'free', label: tl('自由粒子') },
  { id: 'barrier', label: tl('方势垒（隧穿）') },
  { id: 'step', label: tl('势阶') },
  { id: 'double', label: tl('双势垒（共振隧穿）') },
  { id: 'well', label: tl('有限深势阱') },
  { id: 'box', label: tl('无限深势阱') },
  { id: 'harmonic', label: tl('谐振子') }
]
const S = labState('quantum', () => ({
  kind: 'barrier' as Kind, V0: 0.6, width: 1, wellWidth: 4, gap: 3, omegaEv: 0.1, boxWidth: 2,
  x0: -15, sigma: 2.5, E0: 0.5, speed: 1, show: { re: true, im: false, prob: true },
  // infinite well: weights of the first states
  weights: [1, 1, 0, 0, 0, 0] as number[]
}))
const X0 = -40, X1 = 40, N = 1024, NBOX = 511
const units = ref({ length: 1e-9, energy: 0.0761996, time: 8.638e-15 })
const eU = computed(() => units.value.energy)

const potential = computed<QPotential>(() => {
  const V0 = S.V0 / eU.value
  switch (S.kind) {
    case 'barrier': return { kind: 'barrier', V0, c: 0, w: S.width }
    case 'step': return { kind: 'step', V0, c: 0 }
    case 'double': return { kind: 'double', V0, c: 0, w: S.width, gap: S.gap }
    case 'well': return { kind: 'well', V0, c: 0, w: S.wellWidth }
    case 'box': return { kind: 'box', c: 0, w: S.boxWidth }
    case 'harmonic': return { kind: 'harmonic', omega: S.omegaEv / eU.value, c: 0 }
    default: return { kind: 'free' }
  }
})
const bound = computed(() => S.kind === 'well' || S.kind === 'box' || S.kind === 'harmonic' || S.kind === 'double')
const setup = computed<QSetup | null>(() => {
  try {
    const s = quantumSetup({ potential: potential.value, x0: X0, x1: X1, n: S.kind === 'box' ? NBOX : N, states: bound.value ? 6 : 0 })
    units.value = s.units
    return s
  } catch { return null }
})
const levels = computed(() => (setup.value?.energies ?? []).map(e => e * eU.value).filter(e => S.kind !== 'well' || e < 0))

// ---- state ----
let re: number[] = [], im: number[] = []
const t = ref(0)
const playing = ref(false)
const frame = ref<{ prob: number[]; re: number[]; im: number[] } | null>(null)
const ex = ref<{ x: number; dx: number; p?: number; dp?: number; energy: number; norm: number; left?: number; right?: number } | null>(null)
const absorbed = ref(0)
const theoryT = ref<number | null>(null)
const k0 = computed(() => Math.sqrt(2 * Math.max(0, S.E0) / eU.value))
/** Where "transmitted" begins: beyond the barrier(s). */
const splitAt = computed(() => (S.kind === 'barrier' ? S.width / 2 : S.kind === 'double' ? S.gap / 2 + S.width : 0))

function startPacket() {
  t.value = 0; absorbed.value = 0
  if (S.kind === 'box') { runBox(0); return }
  try {
    const r = quantumRun({ potential: potential.value, x0: X0, x1: X1, n: N, packet: { x0: S.x0, sigma: S.sigma, k0: k0.value }, t0: 0, duration: 0, frames: 1, split: splitAt.value })
    re = Array.from(r.re); im = Array.from(r.im)
    frame.value = { prob: Array.from(r.prob), re, im }
    ex.value = r.expect[0]
    theoryT.value = r.theoryT ?? null
  } catch { frame.value = null }
  redraw()
}
function startEigen(k: number) {
  const s = setup.value
  if (!s) return
  t.value = 0; absorbed.value = 0
  if (S.kind === 'box') { S.weights = S.weights.map((_, i) => (i === k ? 1 : 0)); runBox(0); return }
  const n = s.x.length
  re = Array.from(s.states.subarray(k * n, (k + 1) * n)); im = new Array(n).fill(0)
  frame.value = { prob: re.map(v => v * v), re, im }
  playing.value = true
}
function runBox(dt: number) {
  const w = S.weights, nrm = Math.sqrt(w.reduce((a, b) => a + b * b, 0)) || 1
  try {
    const r = quantumRun({ potential: potential.value, n: NBOX, cre: w.map(v => v / nrm), cim: w.map(() => 0), t0: t.value, duration: dt, frames: 1 })
    t.value += dt
    frame.value = { prob: Array.from(r.prob), re: Array.from(r.re), im: Array.from(r.im) }
    ex.value = r.expect[0]
  } catch { frame.value = null }
}
function advance(realDt: number) {
  // 1 s of real time = speed × 10 fs of electron time (time unit ≈ 8.6 fs)
  const dt = realDt * S.speed * 10e-15 / units.value.time
  if (S.kind === 'box') { runBox(dt); return }
  if (!re.length) return
  try {
    const r = quantumRun({ potential: potential.value, x0: X0, x1: X1, n: N, re, im, t0: t.value, duration: dt, frames: 1, absorb: 0.1, split: splitAt.value })
    re = Array.from(r.re); im = Array.from(r.im)
    t.value += dt
    absorbed.value += r.absorbed
    frame.value = { prob: Array.from(r.prob), re, im }
    ex.value = r.expect[0]
  } catch { playing.value = false }
}
watch(() => [S.kind, S.V0, S.width, S.wellWidth, S.gap, S.omegaEv, S.boxWidth], () => { playing.value = false; startPacket() })
watch(() => [S.x0, S.sigma, S.E0], () => { if (!playing.value) startPacket() })

const { canvas, wrap, redraw } = useLabCanvas(() => props.active, (ctx, w, h, dt, P) => {
  if (playing.value && dt > 0) advance(dt)
  const s = setup.value, f = frame.value
  if (!s) return
  const xs = s.x, n = xs.length
  const xa = S.kind === 'box' ? -S.boxWidth / 2 - 0.2 : X0, xb = S.kind === 'box' ? S.boxWidth / 2 + 0.2 : X1
  const X = (x: number) => 30 + (x - xa) / (xb - xa) * (w - 60)
  const base = h * 0.8
  // potential (eV) on the lower part
  const vmax = Math.max(0.2, Math.abs(S.V0) * 1.4, ...levels.value.map(Math.abs), (ex.value?.energy ?? 0) * eU.value * 1.3)
  const Ey = (e: number) => base - (e / vmax) * h * 0.55
  ctx.fillStyle = P.gridMinor
  if (S.kind === 'box') { ctx.fillRect(X(xa), 20, X(-S.boxWidth / 2) - X(xa), base - 20); ctx.fillRect(X(S.boxWidth / 2), 20, X(xb) - X(S.boxWidth / 2), base - 20) }
  ctx.strokeStyle = P.text2; ctx.lineWidth = 1.5; ctx.beginPath()
  for (let j = 0; j < n; j++) { const v = s.V[j] * eU.value; const y = Ey(Math.max(-vmax, Math.min(vmax * 1.5, v))); if (j) ctx.lineTo(X(xs[j]), y); else ctx.moveTo(X(xs[j]), y) }
  ctx.stroke()
  ctx.font = `11px ${FONT}`; ctx.fillStyle = P.text2; ctx.fillText(tl('势能 V（eV）'), 6, 14)
  // levels
  ctx.setLineDash([5, 4]); ctx.strokeStyle = P.gravity
  for (const e of levels.value) { ctx.beginPath(); ctx.moveTo(X(xa), Ey(e)); ctx.lineTo(X(xb), Ey(e)); ctx.stroke() }
  ctx.setLineDash([])
  // packet energy
  if (ex.value && S.kind !== 'box') { ctx.strokeStyle = P.applied; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(X(xa), Ey(ex.value.energy * eU.value)); ctx.lineTo(X(xb), Ey(ex.value.energy * eU.value)); ctx.stroke(); ctx.setLineDash([]) }
  if (!f) return
  const pmax = Math.max(1e-9, ...f.prob)
  const amp = Math.sqrt(pmax)
  const Py = (p: number) => base - (p / pmax) * h * 0.5
  const Ay = (a: number) => base - (a / amp) * h * 0.25
  if (S.show.prob) {
    ctx.fillStyle = 'rgba(37, 99, 235, 0.25)'; ctx.strokeStyle = P.accent; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(X(xs[0]), base)
    for (let j = 0; j < n; j++) ctx.lineTo(X(xs[j]), Py(f.prob[j]))
    ctx.lineTo(X(xs[n - 1]), base); ctx.closePath(); ctx.fill(); ctx.stroke()
  }
  const curve = (a: number[], col: string) => { ctx.strokeStyle = col; ctx.lineWidth = 1.3; ctx.beginPath(); for (let j = 0; j < n; j++) { const y = Ay(a[j]); if (j) ctx.lineTo(X(xs[j]), y); else ctx.moveTo(X(xs[j]), y) } ctx.stroke() }
  if (S.show.re) curve(f.re, '#16a34a')
  if (S.show.im) curve(f.im, '#db2777')
  if (ex.value) { ctx.fillStyle = P.friction; ctx.beginPath(); ctx.moveTo(X(ex.value.x), base + 2); ctx.lineTo(X(ex.value.x) - 5, base + 10); ctx.lineTo(X(ex.value.x) + 5, base + 10); ctx.closePath(); ctx.fill() }
  // axis
  ctx.strokeStyle = P.gridMajor; ctx.beginPath(); ctx.moveTo(X(xa), base); ctx.lineTo(X(xb), base); ctx.stroke()
  ctx.fillStyle = P.text2; ctx.font = `11px ${MONO}`
  const step = S.kind === 'box' ? 0.5 : 10
  for (let x = Math.ceil(xa / step) * step; x <= xb; x += step) ctx.fillText(`${+x.toFixed(2)}`, X(x) - 6, base + 22)
  ctx.fillText(`t = ${fmtQ(t.value * units.value.time, 's', 4)}`, w - 140, 16)
}, () => props.active && playing.value)
watch(() => [frame.value, S.show], redraw, { deep: true })
startPacket()

const uncertainty = computed(() => (ex.value?.dp !== undefined ? ex.value.dx * ex.value.dp! : null))
</script>

<template>
  <div class="lab-shell">
    <div class="lab-stage">
      <div class="lab-bar">
        <select v-model="S.kind" class="field small" :aria-label="tl('势能')">
          <option v-for="k in KINDS" :key="k.id" :value="k.id">{{ k.label }}</option>
        </select>
        <button class="btn small primary" @click="playing = !playing">{{ playing ? tl('暂停') : tl('播放') }}</button>
        <button class="btn ghost small" @click="playing = false; startPacket()">{{ S.kind === 'box' ? tl('重来') : tl('重新发射波包') }}</button>
        <label class="ctl">{{ tl('速度') }}<select v-model.number="S.speed" class="field small"><option :value="0.25">0.25×</option><option :value="1">1×</option><option :value="4">4×</option><option :value="16">16×</option></select></label>
        <span class="grow" />
        <label class="ctl"><input v-model="S.show.prob" type="checkbox" />|ψ|²</label>
        <label class="ctl"><input v-model="S.show.re" type="checkbox" />Re ψ</label>
        <label class="ctl"><input v-model="S.show.im" type="checkbox" />Im ψ</label>
      </div>
      <div ref="wrap" class="lab-canvas"><canvas ref="canvas" /></div>
    </div>
    <aside class="lab-side">
      <section class="lab-block">
        <div class="lab-fields">
          <template v-if="S.kind === 'barrier' || S.kind === 'step' || S.kind === 'double' || S.kind === 'well'">
            <label>{{ S.kind === 'well' ? tl('势阱深度') : tl('势垒高度 V₀') }}</label><NumField :model-value="S.V0" unit="eV" :min="0" @update:model-value="v => (S.V0 = v)" />
          </template>
          <template v-if="S.kind === 'barrier' || S.kind === 'double'"><label>{{ tl('势垒宽度') }}</label><NumField :model-value="S.width" unit="nm" :min="0.05" @update:model-value="v => (S.width = v)" /></template>
          <template v-if="S.kind === 'well'"><label>{{ tl('势阱宽度') }}</label><NumField :model-value="S.wellWidth" unit="nm" :min="0.1" @update:model-value="v => (S.wellWidth = v)" /></template>
          <template v-if="S.kind === 'double'"><label>{{ tl('两垒间距') }}</label><NumField :model-value="S.gap" unit="nm" :min="0.1" @update:model-value="v => (S.gap = v)" /></template>
          <template v-if="S.kind === 'harmonic'"><label>{{ tl('ħω') }}</label><NumField :model-value="S.omegaEv" unit="eV" :min="0.001" @update:model-value="v => (S.omegaEv = v)" /></template>
          <template v-if="S.kind === 'box'"><label>{{ tl('阱宽 a') }}</label><NumField :model-value="S.boxWidth" unit="nm" :min="0.1" @update:model-value="v => (S.boxWidth = v)" /></template>
          <template v-if="S.kind !== 'box'">
            <label>{{ tl('波包位置') }}</label><NumField :model-value="S.x0" unit="nm" @update:model-value="v => (S.x0 = v)" />
            <label>{{ tl('波包宽度 σ') }}</label><NumField :model-value="S.sigma" unit="nm" :min="0.2" @update:model-value="v => (S.sigma = v)" />
            <label>{{ tl('动能 E') }}</label><NumField :model-value="S.E0" unit="eV" :min="0" @update:model-value="v => (S.E0 = v)" />
          </template>
        </div>
      </section>
      <section v-if="bound && setup" class="lab-block">
        <div class="lab-btitle">{{ tl('本征态（定态）') }}</div>
        <div v-if="S.kind === 'box'" class="tiny muted">{{ tl('各本征态的权重（叠加态）') }}</div>
        <div v-for="(e, k) in setup.energies.slice(0, 6)" :key="k" class="lev small">
          <button class="btn ghost small" :title="tl('从这个定态开始')" @click="startEigen(k)">n = {{ k + 1 }}</button>
          <span class="mono">{{ fmtQ(e * eU, 'eV', 5) }}</span>
          <input v-if="S.kind === 'box'" v-model.number="S.weights[k]" type="range" min="0" max="1" step="0.05" :aria-label="tl('权重')" />
        </div>
        <LabFormula v-if="S.kind === 'box'" :title="tl('无限深势阱的能级')" tex="E_n = \dfrac{n^2 \pi^2 \hbar^2}{2 m a^2}" expr="n^2*pi^2/(2*a^2)*E0" :vars="[{ name: 'n', symbol: 'n', value: 1, unit: '' }, { name: 'a', symbol: 'a', value: S.boxWidth, unit: '' }, { name: 'E0', symbol: '\hbar^2/(m\cdot\text{nm}^2)', value: eU, unit: '' }]" unit="" lhs="E_1/\text{eV}" :result="setup.energies[0] * eU" />
        <LabFormula v-if="S.kind === 'harmonic'" :title="tl('谐振子的能级')" tex="E_n = \left(n + \tfrac12\right)\hbar\omega" expr="0.5*hw" :vars="[{ name: 'hw', symbol: '\hbar\omega', value: S.omegaEv, unit: '' }]" unit="" lhs="E_0/\text{eV}" :result="setup.energies[0] * eU" />
      </section>
      <section v-if="ex" class="lab-block">
        <div class="lab-btitle">{{ tl('期望值') }}</div>
        <div class="lab-kv">
          <span>⟨x⟩</span><b>{{ fmtQ(ex.x * 1e-9, 'm', 4) }}</b>
          <span>Δx</span><b>{{ fmtQ(ex.dx * 1e-9, 'm', 4) }}</b>
          <template v-if="ex.p !== undefined"><span>⟨p⟩ / ħ</span><b>{{ ex.p!.toFixed(4) }} nm⁻¹</b><span>Δp / ħ</span><b>{{ ex.dp!.toFixed(4) }} nm⁻¹</b></template>
          <template v-if="uncertainty !== null"><span>Δx·Δp / ħ</span><b>{{ uncertainty.toFixed(4) }}</b></template>
          <span>⟨E⟩</span><b>{{ fmtQ(ex.energy * eU, 'eV', 4) }}</b>
          <span>{{ tl('总概率') }}</span><b>{{ (ex.norm + absorbed).toFixed(10) }}</b>
          <template v-if="ex.right !== undefined && (S.kind === 'barrier' || S.kind === 'double' || S.kind === 'step')"><span>{{ tl('右侧概率（透射）') }}</span><b class="big">{{ ((ex.right ?? 0) * 100).toFixed(2) }}%</b></template>
          <template v-if="theoryT !== null && S.kind === 'barrier'"><span>{{ tl('透射率理论值（按波包的动量分布平均）') }}</span><b>{{ (theoryT * 100).toFixed(2) }}%</b></template>
          <template v-if="absorbed > 1e-6"><span>{{ tl('飞出计算区域') }}</span><b>{{ (absorbed * 100).toFixed(2) }}%</b></template>
        </div>
        <p class="tiny muted lab-note">{{ tl('不确定关系：Δx·Δp ≥ ħ/2，高斯波包刚发射时取等号。粒子能量低于势垒高度时仍有一部分概率穿过势垒（隧穿），经典粒子做不到。') }}</p>
      </section>
      <QuantumConvergence />
      <details class="lab-block lab-details">
        <summary>{{ tl('原理') }}</summary>
        <p class="tiny muted lab-note">{{ tl('含时薛定谔方程 iħ∂ψ/∂t = −ħ²/(2m)∂²ψ/∂x² + Vψ 用分步傅里叶法求解：势能项在坐标空间、动能项在动量空间（快速傅里叶变换）各乘一个相位因子，每一步都严格保持总概率。本征态由有限差分哈密顿量（三对角矩阵）用 Sturm 序列二分法求得。计算区域边缘有吸收层，飞出去的概率单独列出。') }}</p>
      </details>
    </aside>
  </div>
</template>

<style scoped>
.lev { display: grid; grid-template-columns: auto auto 1fr; gap: 8px; align-items: center; }
</style>
