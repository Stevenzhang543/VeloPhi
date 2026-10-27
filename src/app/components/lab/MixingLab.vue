<script setup lang="ts">
/**
 * Thermal equilibrium (26.54, D85): two bodies in contact exchange heat until they share one temperature. The core
 * gives the common temperature, the time constant and both temperature curves (`heatMix`); this component shows the
 * curves, the heat released and absorbed (Q放 = Q吸), and the weighted-mean formula.
 */
import { computed } from 'vue'
import { tl } from '../../../i18n'
import { fmtQ } from '../../settings'
import { heatMix } from '../../../engine/labs'
import { labState } from '../../lab/state'
import NumField from '../NumField.vue'
import LabFormula from './LabFormula.vue'
import LabChart from './LabChart.vue'

defineProps<{ active?: boolean }>()

const MATERIALS: Array<{ id: string; name: string; c: number }> = [
  { id: 'water', name: tl('水'), c: 4200 }, { id: 'oil', name: tl('煤油'), c: 2100 }, { id: 'alcohol', name: tl('酒精'), c: 2400 }, { id: 'ice', name: tl('冰'), c: 2100 },
  { id: 'al', name: tl('铝'), c: 880 }, { id: 'iron', name: tl('铁'), c: 460 }, { id: 'cu', name: tl('铜'), c: 390 }, { id: 'sand', name: tl('砂石'), c: 920 }
]
const S = labState('mixing', () => ({ a: { mat: 'iron', m: 0.5, t: 90 }, b: { mat: 'water', m: 1, t: 20 }, k: 20 }))
const cOf = (id: string) => MATERIALS.find(m => m.id === id)?.c ?? 4200
const nameOf = (id: string) => MATERIALS.find(m => m.id === id)?.name ?? id
const R = computed(() => { try { return heatMix({ c1: cOf(S.a.mat), m1: S.a.m, t1: S.a.t, c2: cOf(S.b.mat), m2: S.b.m, t2: S.b.t, k: S.k, samples: 301 }) } catch { return null } })
const curves = computed(() => {
  const c = R.value?.curve
  const ts: number[] = [], a: number[] = [], b: number[] = []
  if (c) for (let i = 0; i + 2 < c.length; i += 3) { ts.push(c[i]); a.push(c[i + 1]); b.push(c[i + 2]) }
  return { ts, a, b }
})
</script>

<template>
  <div class="lab-shell">
    <div class="lab-stage">
      <div class="lab-bar"><span class="small muted">{{ tl('两个物体接触，热量从高温物体传给低温物体，直到温度相同（不计热损失）') }}</span></div>
      <div class="lab-canvas chart-only">
        <LabChart v-if="R" :series="[{ x: curves.ts, y: curves.a, color: '#ef4444', label: nameOf(S.a.mat) }, { x: curves.ts, y: curves.b, color: '#0a6cff', label: nameOf(S.b.mat) }]" :markers="[{ y: R.tEq, label: tl('共同温度 {0} °C', [R.tEq.toFixed(2)]) }, { x: R.tau, label: 'τ' }]" :x-label="tl('t（s）')" :y-label="tl('温度（°C）')" :height="520" />
      </div>
    </div>
    <aside class="lab-side">
      <section v-for="(side, key) in { a: S.a, b: S.b }" :key="key" class="lab-block">
        <div class="lab-btitle"><span class="dot" :class="key" />{{ key === 'a' ? tl('物体 1') : tl('物体 2') }}</div>
        <div class="lab-fields">
          <label>{{ tl('物质') }}</label>
          <select v-model="side.mat" class="field small"><option v-for="m in MATERIALS" :key="m.id" :value="m.id">{{ m.name }}（c = {{ m.c }}）</option></select>
          <label>{{ tl('质量 m') }}</label><NumField :model-value="side.m" unit="kg" :min="0.001" @update:model-value="v => (side.m = v)" />
          <label>{{ tl('初温') }}</label><NumField :model-value="side.t" label="°C" @update:model-value="v => (side.t = v)" />
        </div>
      </section>
      <section class="lab-block">
        <div class="lab-fields"><label>{{ tl('传热快慢 k') }}</label><NumField :model-value="S.k" label="W/°C" :min="0.01" @update:model-value="v => (S.k = v)" /></div>
      </section>
      <section v-if="R" class="lab-block">
        <div class="lab-kv">
          <span>{{ tl('共同温度') }}</span><b class="big">{{ R.tEq.toFixed(3) }} °C</b>
          <span>{{ tl('传递的热量') }}</span><b>{{ fmtQ(Math.abs(R.heat), 'J', 4) }}</b>
          <span>{{ tl('时间常数 τ') }}</span><b>{{ fmtQ(R.tau, 's', 4) }}</b>
        </div>
        <LabFormula :title="tl('热平衡方程（Q放 = Q吸）')" tex="t = \dfrac{c_1m_1t_1 + c_2m_2t_2}{c_1m_1 + c_2m_2}" expr="(c1*m1*t1 + c2*m2*t2)/(c1*m1 + c2*m2)" :vars="[{ name: 'c1', symbol: 'c_1', value: cOf(S.a.mat), unit: '' }, { name: 'm1', symbol: 'm_1', value: S.a.m, unit: 'kg' }, { name: 't1', symbol: 't_1', value: S.a.t, unit: '' }, { name: 'c2', symbol: 'c_2', value: cOf(S.b.mat), unit: '' }, { name: 'm2', symbol: 'm_2', value: S.b.m, unit: 'kg' }, { name: 't2', symbol: 't_2', value: S.b.t, unit: '' }]" unit="" lhs="t\,(^\circ C)" :result="R.tEq" />
        <LabFormula :title="tl('放出的热量')" tex="Q = c_1m_1(t_1 - t)" expr="c1*m1*(t1 - t)" :vars="[{ name: 'c1', symbol: 'c_1', value: cOf(S.a.mat), unit: '' }, { name: 'm1', symbol: 'm_1', value: S.a.m, unit: 'kg' }, { name: 't1', symbol: 't_1', value: S.a.t, unit: '' }, { name: 't', symbol: 't', value: R.tEq, unit: '' }]" unit="J" lhs="Q" :result="R.heat" />
      </section>
      <details class="lab-block lab-details">
        <summary>{{ tl('原理') }}</summary>
        <p class="tiny muted lab-note">{{ tl('不计热损失时，高温物体放出的热量等于低温物体吸收的热量。传热的快慢与温差成正比（牛顿冷却定律），所以两条曲线都按指数规律趋近共同温度；比热容大、质量大的物体温度变化小。') }}</p>
      </details>
    </aside>
  </div>
</template>

<style scoped>
.chart-only { padding: 12px; }
.dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.dot.a { background: #ef4444; }
.dot.b { background: #0a6cff; }
</style>
