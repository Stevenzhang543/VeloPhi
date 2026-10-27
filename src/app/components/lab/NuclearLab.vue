<script setup lang="ts">
/**
 * Nuclei (26.55): decay chains (Bateman's exact solution, `decayChain`), the binding-energy curve (measured values
 * of AME2020 and the semi-empirical formula, `binding`) and nuclear reactions with their Q values (`reaction`).
 */
import { computed, ref } from 'vue'
import { tl } from '../../../i18n'
import type { ReactionParticle } from '../../../engine/labs'
import { binding, decayChain, reaction } from '../../../engine/labs'
import { labState } from '../../lab/state'
import NumField from '../NumField.vue'
import LabChart from './LabChart.vue'
import LabFormula from './LabFormula.vue'

defineProps<{ active?: boolean }>()

interface Member { name: string; halfLife: number }
const CHAINS: Record<string, { label: string; unit: string; members: Member[]; tEnd: number }> = {
  ab: { label: tl('A → B → C（自定）'), unit: 's', members: [{ name: 'A', halfLife: 3 }, { name: 'B', halfLife: 1 }, { name: 'C', halfLife: 0 }], tEnd: 20 },
  secular: { label: tl('长期平衡（母核寿命很长）'), unit: 's', members: [{ name: 'A', halfLife: 1000 }, { name: 'B', halfLife: 2 }, { name: 'C', halfLife: 0 }], tEnd: 20 },
  transient: { label: tl('暂时平衡'), unit: 's', members: [{ name: 'A', halfLife: 10 }, { name: 'B', halfLife: 2 }, { name: 'C', halfLife: 0 }], tEnd: 40 },
  none: { label: tl('不平衡（子核寿命更长）'), unit: 's', members: [{ name: 'A', halfLife: 1 }, { name: 'B', halfLife: 6 }, { name: 'C', halfLife: 0 }], tEnd: 30 },
  radon: { label: tl('²²²Rn 的子体（天）'), unit: 'min', members: [{ name: '²²²Rn', halfLife: 5501.5 }, { name: '²¹⁸Po', halfLife: 3.098 }, { name: '²¹⁴Pb', halfLife: 26.8 }, { name: '²¹⁴Bi', halfLife: 19.9 }, { name: '²¹⁰Pb …', halfLife: 0 }], tEnd: 300 }
}
const S = labState('nuclear', () => ({
  part: 'chain' as 'chain' | 'binding' | 'reaction', chain: 'ab', members: CHAINS.ab.members.map(m => ({ ...m })), tEnd: 20, log: false, activity: false,
  reactionId: 'dt', Z: 26, A: 56
}))
function loadChain(id: string) { const c = CHAINS[id]; S.chain = id; S.members = c.members.map(m => ({ ...m })); S.tEnd = c.tEnd }
const COLORS = ['#dc2626', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2']
const chainRes = computed(() => { try { return decayChain({ halfLives: S.members.map(m => m.halfLife), n0: S.members.map((_, i) => (i === 0 ? 1000 : 0)), tEnd: S.tEnd, samples: 401 }) } catch { return null } })
const chainSeries = computed(() => {
  const r = chainRes.value
  if (!r) return []
  const n = r.t.length
  return S.members.map((m, k) => {
    const src = S.activity ? r.A : r.N
    const y = Array.from(src.subarray(k * n, (k + 1) * n)).map(v => (S.log ? Math.log10(Math.max(v, 1e-6)) : v))
    return { x: Array.from(r.t), y, color: COLORS[k % 6], label: m.name }
  }).filter((_, k) => !(S.activity && S.members[k].halfLife === 0))
})
const unitText = computed(() => (CHAINS[S.chain]?.unit === 'min' ? tl('min') : tl('s')))

// ---- binding energy ----
const bind = computed(() => { try { return binding([{ Z: S.Z, A: S.A }]) } catch { return null } })
const bindSeries = computed(() => {
  const b = bind.value
  if (!b) return []
  return [{ x: b.semf.map(p => p[0]), y: b.semf.map(p => p[2]), color: '#94a3b8', label: tl('半经验公式') }]
})
const bindMarkers = computed(() => (bind.value?.measured ?? []).filter(m => m.A >= 2).map(m => ({ x: m.A, y: m.BA, label: m.A <= 16 || [56, 62, 235, 238].includes(m.A) ? `${m.symbol}-${m.A}` : '', color: '#dc2626' })))
const picked = computed(() => bind.value?.nuclides[0] ?? null)

// ---- reactions ----
const nuc = (Z: number, A: number): ReactionParticle => ({ kind: 'nuclide', Z, A })
const n: ReactionParticle = { kind: 'n' }
const REACTIONS: Record<string, { label: string; before: ReactionParticle[]; after: ReactionParticle[]; text: string }> = {
  dt: { label: tl('氘氚聚变'), before: [nuc(1, 2), nuc(1, 3)], after: [nuc(2, 4), n], text: '²H + ³H → ⁴He + n' },
  dd: { label: tl('氘氘聚变'), before: [nuc(1, 2), nuc(1, 2)], after: [nuc(2, 3), n], text: '²H + ²H → ³He + n' },
  fission: { label: tl('铀 235 裂变'), before: [nuc(92, 235), n], after: [nuc(56, 141), nuc(36, 92), n, n, n], text: '²³⁵U + n → ¹⁴¹Ba + ⁹²Kr + 3n' },
  alpha: { label: tl('镭 226 的 α 衰变'), before: [nuc(88, 226)], after: [nuc(86, 222), nuc(2, 4)], text: '²²⁶Ra → ²²²Rn + ⁴He' },
  alphaU: { label: tl('铀 238 的 α 衰变'), before: [nuc(92, 238)], after: [nuc(90, 234), nuc(2, 4)], text: '²³⁸U → ²³⁴Th + ⁴He' },
  c14: { label: tl('碳 14 的 β 衰变'), before: [nuc(6, 14)], after: [nuc(7, 14), { kind: 'e-' }, { kind: 'nu' }], text: '¹⁴C → ¹⁴N + e⁻ + ν̄' },
  co60: { label: tl('钴 60 的 β 衰变'), before: [nuc(27, 60)], after: [nuc(28, 60), { kind: 'e-' }, { kind: 'nu' }], text: '⁶⁰Co → ⁶⁰Ni + e⁻ + ν̄' },
  rutherford: { label: tl('卢瑟福发现质子'), before: [nuc(7, 14), nuc(2, 4)], after: [nuc(8, 17), nuc(1, 1)], text: '¹⁴N + ⁴He → ¹⁷O + ¹H' },
  chadwick: { label: tl('查德威克发现中子'), before: [nuc(4, 9), nuc(2, 4)], after: [nuc(6, 12), n], text: '⁹Be + ⁴He → ¹²C + n' },
  li: { label: tl('锂 6 俘获中子'), before: [nuc(3, 6), n], after: [nuc(1, 3), nuc(2, 4)], text: '⁶Li + n → ³H + ⁴He' }
}
const reac = computed(() => { const r = REACTIONS[S.reactionId]; try { return r ? reaction(r.before, r.after) : null } catch { return null } })
const showMass = ref(true)
</script>

<template>
  <div class="lab-shell">
    <div class="lab-stage">
      <div class="lab-bar">
        <div class="lab-seg">
          <button :class="{ on: S.part === 'chain' }" @click="S.part = 'chain'">{{ tl('衰变链') }}</button>
          <button :class="{ on: S.part === 'binding' }" @click="S.part = 'binding'">{{ tl('结合能曲线') }}</button>
          <button :class="{ on: S.part === 'reaction' }" @click="S.part = 'reaction'">{{ tl('核反应') }}</button>
        </div>
        <template v-if="S.part === 'chain'">
          <select class="field small" :value="S.chain" :aria-label="tl('衰变链')" @change="loadChain(($event.target as HTMLSelectElement).value)">
            <option v-for="(c, id) in CHAINS" :key="id" :value="id">{{ c.label }}</option>
          </select>
          <label class="ctl"><input v-model="S.activity" type="checkbox" />{{ tl('画活度 A = λN') }}</label>
          <label class="ctl"><input v-model="S.log" type="checkbox" />{{ tl('对数坐标') }}</label>
        </template>
        <template v-if="S.part === 'reaction'">
          <select v-model="S.reactionId" class="field small" :aria-label="tl('核反应')">
            <option v-for="(r, id) in REACTIONS" :key="id" :value="id">{{ r.label }}</option>
          </select>
        </template>
      </div>
      <div class="lab-canvas pad">
        <LabChart v-if="S.part === 'chain'" :series="chainSeries" :x-label="tl('t（{0}）', [unitText])" :y-label="S.activity ? (S.log ? tl('lg A') : tl('活度 A')) : (S.log ? tl('lg N') : tl('核数 N'))" :height="380" />
        <LabChart v-if="S.part === 'binding'" :series="bindSeries" :markers="[...bindMarkers, ...(picked ? [{ x: picked.A, y: picked.BA, label: `${picked.symbol}-${picked.A}`, color: '#0a6cff' }] : [])]" :x-label="tl('质量数 A')" :y-label="tl('比结合能（MeV）')" :y-range="[0, 9.5]" :height="380" />
        <div v-if="S.part === 'reaction' && REACTIONS[S.reactionId]" class="eq">
          <div class="eq-text">{{ REACTIONS[S.reactionId].text }}</div>
          <div v-if="reac" class="eq-q" :class="{ exo: (reac.Q ?? 0) > 0 }">Q = {{ reac.Q === null || reac.Q === undefined ? '—' : `${reac.Q.toFixed(3)} MeV` }}</div>
          <div v-if="reac" class="small muted">{{ (reac.Q ?? 0) > 0 ? tl('放能反应：反应后的质量比反应前小') : tl('吸能反应：需要外界提供能量') }}</div>
        </div>
      </div>
    </div>
    <aside class="lab-side">
      <template v-if="S.part === 'chain'">
        <section class="lab-block">
          <div v-for="(m, k) in S.members" :key="k" class="lab-fields">
            <label><span class="dot" :style="{ background: COLORS[k % 6] }" />{{ m.name }} {{ tl('半衰期') }}</label>
            <NumField :model-value="m.halfLife" :min="0" @update:model-value="v => (m.halfLife = v)" />
          </div>
          <div class="tiny muted">{{ tl('半衰期为 0 表示稳定核。时间单位：{0}。', [unitText]) }}</div>
          <div class="lab-fields"><label>{{ tl('总时长') }}</label><NumField :model-value="S.tEnd" :min="1e-6" @update:model-value="v => (S.tEnd = v)" /></div>
        </section>
        <LabFormula :title="tl('两代衰变：子核的数目')" tex="N_B = N_0\dfrac{\lambda_A}{\lambda_B - \lambda_A}\left(e^{-\lambda_A t} - e^{-\lambda_B t}\right)" expr="N0*lA/(lB - lA)*(exp(-lA*t) - exp(-lB*t))" :vars="[{ name: 'N0', symbol: 'N_0', value: 1000, unit: '' }, { name: 'lA', symbol: '\lambda_A', value: chainRes?.lambda[0] ?? 0, unit: '' }, { name: 'lB', symbol: '\lambda_B', value: chainRes?.lambda[1] ?? 0, unit: '' }, { name: 't', symbol: 't', value: S.tEnd / 2, unit: '' }]" unit="" lhs="N_B(t_{mid})" :result="chainRes ? chainRes.N[401 + 200] : null" />
        <p class="tiny muted lab-note">{{ tl('核心用贝特曼方程的精确解（指数与多项式之和）逐代计算，半衰期相同时也成立。母核寿命远长于子核时，子核的活度很快与母核相等（长期平衡）。') }}</p>
      </template>
      <template v-if="S.part === 'binding'">
        <section class="lab-block">
          <div class="lab-fields">
            <label>{{ tl('质子数 Z') }}</label><NumField :model-value="S.Z" :min="1" :max="103" :step="1" @update:model-value="v => (S.Z = Math.round(v))" />
            <label>{{ tl('质量数 A') }}</label><NumField :model-value="S.A" :min="1" :max="300" :step="1" @update:model-value="v => (S.A = Math.round(v))" />
          </div>
          <div v-if="picked" class="lab-kv">
            <span>{{ tl('核素') }}</span><b>{{ picked.symbol }}-{{ picked.A }}</b>
            <span>{{ tl('结合能 B') }}</span><b>{{ picked.B.toFixed(3) }} MeV</b>
            <span>{{ tl('比结合能 B/A') }}</span><b class="big">{{ picked.BA.toFixed(4) }} MeV</b>
            <template v-if="showMass"><span>{{ tl('原子质量') }}</span><b>{{ picked.mass?.toFixed(6) }} u</b></template>
            <span>{{ tl('数据') }}</span><b>{{ picked.measured ? tl('实测（AME2020）') : tl('半经验公式估计') }}</b>
          </div>
          <p class="tiny muted lab-note">{{ tl('比结合能越大，原子核越稳定。铁、镍附近最大，所以轻核聚变和重核裂变都放出能量。') }}</p>
        </section>
      </template>
      <template v-if="S.part === 'reaction' && reac">
        <section class="lab-block">
          <div class="lab-kv">
            <span>{{ tl('质量数') }}</span><b>{{ reac.A?.[0] }} → {{ reac.A?.[1] }}</b>
            <span>{{ tl('电荷数') }}</span><b>{{ reac.Z?.[0] }} → {{ reac.Z?.[1] }}</b>
            <span>{{ tl('守恒') }}</span><b>{{ reac.balanced ? tl('是') : tl('否') }}</b>
            <span>{{ tl('释放的能量 Q') }}</span><b class="big">{{ reac.Q === null || reac.Q === undefined ? '—' : `${reac.Q.toFixed(3)} MeV` }}</b>
            <template v-if="reac.Q"><span>{{ tl('质量亏损 Δm') }}</span><b>{{ (reac.Q / 931.49410242).toFixed(6) }} u</b></template>
          </div>
          <LabFormula v-if="reac.Q" :title="tl('质能方程')" tex="\Delta E = \Delta m\,c^2" expr="dm*931.49410242" :vars="[{ name: 'dm', symbol: '\Delta m', value: reac.Q / 931.49410242, unit: '' }]" unit="" lhs="\Delta E/\text{MeV}" :result="reac.Q" />
          <p class="tiny muted lab-note">{{ tl('核反应中质量数和电荷数都守恒。Q 由反应前后原子质量之差算出（1 u 相当于 931.494 MeV）；数据为原子质量评价表 AME2020 的值。') }}</p>
          <p v-if="reac.estimated" class="tiny lab-note warn">{{ tl('有核素不在数据表中，其质量用半经验公式估计。') }}</p>
        </section>
      </template>
    </aside>
  </div>
</template>

<style scoped>
.pad { padding: 10px; overflow: auto; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; }
.eq { display: grid; place-items: center; gap: 12px; padding: 40px 10px; text-align: center; }
.eq-text { font-size: 28px; font-family: var(--mono, monospace); }
.eq-q { font-size: 22px; font-weight: 650; }
.eq-q.exo { color: var(--success); }
.warn { color: var(--warning); }
</style>
