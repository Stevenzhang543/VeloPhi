<script setup lang="ts">
/**
 * Radioactive decay (26.54, D83): N₀ nuclei, each decaying at random with p = 1 − 2^(−Δt/T½) per step. The core
 * draws the decay step of every nucleus with a fixed generator (`decay`; a seed gives the same run everywhere);
 * this component plays the run back as a lattice of nuclei and compares N(t) with N₀·2^(−t/T½).
 */
import { computed, ref, watch } from 'vue'
import { tl } from '../../../i18n'
import { fmtQ } from '../../settings'
import { decay } from '../../../engine/labs'
import { labState } from '../../lab/state'
import { useLabCanvas } from '../../lab/canvas'
import { FONT } from '../../../render/style'
import NumField from '../NumField.vue'
import LabFormula from './LabFormula.vue'
import LabChart from './LabChart.vue'

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })

const S = labState('decay', () => ({ n0: 400, halfLife: 2, dt: 0.05, duration: 10, seed: 1, speed: 1 }))
const steps = computed(() => Math.max(1, Math.round(S.duration / S.dt)))
const run = computed(() => { try { return decay({ n0: Math.round(S.n0), halfLife: S.halfLife, dt: S.dt, steps: steps.value, seed: Math.round(S.seed) }) } catch { return null } })
const t = ref(0)
const playing = ref(false)
const step = computed(() => Math.min(steps.value, Math.floor(t.value / S.dt + 1e-9)))
const N = computed(() => run.value?.counts[step.value] ?? 0)
const theory = computed(() => S.n0 * Math.pow(2, -step.value * S.dt / S.halfLife))
const sigma = computed(() => { const p = Math.pow(2, -step.value * S.dt / S.halfLife); return Math.sqrt(S.n0 * p * (1 - p)) })

const series = computed(() => {
  const r = run.value
  if (!r) return { ts: [], n: [], th: [] }
  const ts: number[] = [], n: number[] = [], th: number[] = []
  const stride = Math.max(1, Math.floor(r.counts.length / 600))
  for (let k = 0; k < r.counts.length; k += stride) { ts.push(k * S.dt); n.push(r.counts[k]); th.push(r.theory[k]) }
  return { ts, n, th }
})

const { canvas, wrap, redraw } = useLabCanvas(() => props.active, (ctx, w, h, dt, P) => {
  if (playing.value) {
    t.value = Math.min(S.duration, t.value + dt * S.speed)
    if (t.value >= S.duration) playing.value = false
  }
  const r = run.value
  if (!r) return
  const shown = Math.min(r.stepOf.length, 2500)
  const cols = Math.ceil(Math.sqrt(shown * w / h)), rows = Math.ceil(shown / cols)
  const cell = Math.min((w - 20) / cols, (h - 20) / rows)
  const x0 = (w - cols * cell) / 2, y0 = (h - rows * cell) / 2
  const k = step.value
  for (let i = 0; i < shown; i++) {
    const s = r.stepOf[i]
    const alive = s === 0 || s > k
    const just = !alive && s > k - Math.max(1, Math.round(0.25 / S.dt))
    const cx = x0 + (i % cols + 0.5) * cell, cy = y0 + (Math.floor(i / cols) + 0.5) * cell
    ctx.fillStyle = alive ? '#f59e0b' : just ? '#ef4444' : P.gridMajor
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(1.2, cell * 0.36), 0, Math.PI * 2); ctx.fill()
  }
  if (shown < r.stepOf.length) { ctx.fillStyle = P.text2; ctx.font = `11px ${FONT}`; ctx.fillText(tl('只画出前 {0} 个原子核', [shown]), 10, h - 8) }
}, () => props.active && playing.value)
watch(() => [run.value, t.value], redraw)
watch(run, () => { if (t.value > S.duration) t.value = S.duration })

function play() { if (t.value >= S.duration) t.value = 0; playing.value = !playing.value }
function reroll() { S.seed = Math.floor(Math.random() * 1e6); t.value = 0 }
const half = (k: number) => run.value?.halvings[k] ?? null
</script>

<template>
  <div class="lab-shell">
    <div class="lab-stage">
      <div class="lab-bar">
        <button class="btn small primary" @click="play">{{ playing ? tl('暂停') : tl('播放') }}</button>
        <button class="btn ghost small" @click="t = 0; playing = false">{{ tl('回到开始') }}</button>
        <input v-model.number="t" type="range" :min="0" :max="S.duration" :step="S.dt" class="grow" :aria-label="tl('时间')" />
        <span class="mono small">t = {{ fmtQ(t, 's', 4) }}</span>
        <label class="ctl">{{ tl('倍速') }}<select v-model.number="S.speed" class="field small"><option :value="0.25">0.25×</option><option :value="0.5">0.5×</option><option :value="1">1×</option><option :value="2">2×</option><option :value="5">5×</option></select></label>
      </div>
      <div ref="wrap" class="lab-canvas"><canvas ref="canvas" /></div>
      <div class="lab-under">
        <LabChart :series="[{ x: series.ts, y: series.n, color: '#f59e0b', label: tl('仿真 N') }, { x: series.ts, y: series.th, color: '#0a6cff', dash: [6, 4], label: tl('N₀·2^(−t/T½)') }]" :cursor="t" :markers="[{ x: S.halfLife, label: 'T½' }, { x: 2 * S.halfLife, label: '2T½' }, { x: 3 * S.halfLife, label: '3T½' }]" :x-label="tl('t（s）')" :y-label="tl('未衰变的核数 N')" :height="160" />
      </div>
    </div>
    <aside class="lab-side">
      <section class="lab-block">
        <div class="lab-fields">
          <label>{{ tl('初始核数 N₀') }}</label><NumField :model-value="S.n0" :min="1" :max="200000" :step="100" @update:model-value="v => (S.n0 = Math.round(v))" />
          <label>{{ tl('半衰期 T½') }}</label><NumField :model-value="S.halfLife" unit="s" :min="0.001" @update:model-value="v => (S.halfLife = v)" />
          <label>{{ tl('时间步长 Δt') }}</label><NumField :model-value="S.dt" unit="s" :min="0.0001" @update:model-value="v => (S.dt = v)" />
          <label>{{ tl('总时长') }}</label><NumField :model-value="S.duration" unit="s" :min="0.01" @update:model-value="v => (S.duration = v)" />
          <label>{{ tl('随机种子') }}</label><NumField :model-value="S.seed" :min="0" :step="1" @update:model-value="v => (S.seed = Math.round(v))" />
        </div>
        <button class="btn ghost small" :title="tl('换一个随机种子，重新做一次实验')" @click="reroll">{{ tl('再做一次') }}</button>
      </section>
      <section v-if="run" class="lab-block">
        <div class="lab-kv">
          <span>{{ tl('每步衰变概率 p') }}</span><b>{{ run.p.toPrecision(4) }}</b>
          <span>{{ tl('此刻未衰变 N') }}</span><b class="big">{{ N }}</b>
          <span>{{ tl('理论值 N₀·2^(−t/T½)') }}</span><b>{{ theory.toFixed(1) }} ± {{ sigma.toFixed(1) }}</b>
          <span>{{ tl('偏离') }}</span><b>{{ sigma > 0 ? ((N - theory) / sigma).toFixed(2) + ' σ' : '—' }}</b>
          <span>{{ tl('首次剩一半') }}</span><b>{{ half(0) === null ? '—' : fmtQ(half(0)!, 's', 4) }}</b>
          <span>{{ tl('首次剩 1/4') }}</span><b>{{ half(1) === null ? '—' : fmtQ(half(1)!, 's', 4) }}</b>
          <span>{{ tl('首次剩 1/8') }}</span><b>{{ half(2) === null ? '—' : fmtQ(half(2)!, 's', 4) }}</b>
        </div>
      </section>
      <section v-if="run" class="lab-block">
        <LabFormula :title="tl('半衰期公式')" tex="N = N_0\left(\tfrac{1}{2}\right)^{t/T_{1/2}}" expr="N0*2^(-t/T)" :vars="[{ name: 'N0', symbol: 'N_0', value: S.n0, unit: '' }, { name: 't', symbol: 't', value: step * S.dt, unit: 's' }, { name: 'T', symbol: 'T_{1/2}', value: S.halfLife, unit: 's' }]" unit="" lhs="N" />
        <LabFormula :title="tl('每步的衰变概率')" tex="p = 1 - 2^{-\Delta t/T_{1/2}}" expr="1 - 2^(-dt/T)" :vars="[{ name: 'dt', symbol: '\Delta t', value: S.dt, unit: 's' }, { name: 'T', symbol: 'T_{1/2}', value: S.halfLife, unit: 's' }]" unit="" lhs="p" :result="run.p" />
      </section>
      <details class="lab-block lab-details">
        <summary>{{ tl('原理') }}</summary>
        <p class="tiny muted lab-note">{{ tl('半衰期是统计规律：每个原子核在任一时间段内衰变的概率相同，与其他核和已经过的时间无关；单个核什么时候衰变无法预言。核数越多，N(t) 越接近指数曲线，相对涨落约为 1/√N。') }}</p>
      </details>
    </aside>
  </div>
</template>
