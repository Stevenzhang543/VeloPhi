<script setup lang="ts">
/**
 * Gas in a cylinder (26.55, D95): quasi-static processes of an ideal gas and heat-engine cycles. The core computes
 * every state and energy in closed form (`gasProcess`, `gasCycle`); the cylinder, the moving molecules (speed ∝ √T,
 * for the picture only) and the p–V diagram are drawn here.
 */
import { computed, ref, watch } from 'vue'
import { tl } from '../../../i18n'
import { fmtQ } from '../../settings'
import type { GasCycle, GasProcess } from '../../../engine/labs'
import { gasCycle, gasProcess } from '../../../engine/labs'
import { labState } from '../../lab/state'
import { useLabCanvas } from '../../lab/canvas'
import { FONT } from '../../../render/style'
import NumField from '../NumField.vue'
import LabFormula from './LabFormula.vue'
import LabChart from './LabChart.vue'

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })
const R = 8.314462618

const S = labState('gas', () => ({
  mode: 'process' as 'process' | 'cycle', kind: 'isothermal' as GasProcess['kind'], n: 0.1, gamma: 5 / 3, T1: 300, V1: 2e-3, V2: 4e-3, T2: 450,
  cycle: 'carnot' as 'carnot' | 'otto' | 'rectangle', Th: 600, Tc: 300, CV1: 1e-3, CV2: 3e-3, r: 8, T3: 1800, p1: 2e5, p2: 1e5
}))
const p1 = computed(() => S.n * R * S.T1 / S.V1)
const proc = computed<GasProcess | null>(() => {
  if (S.mode !== 'process') return null
  try { return gasProcess({ n: S.n, gamma: S.gamma, p: p1.value, V: S.V1, kind: S.kind, target: S.kind === 'isochoric' ? S.T2 : S.V2, samples: 121 }) } catch { return null }
})
const cyc = computed<GasCycle | null>(() => {
  if (S.mode !== 'cycle') return null
  try { return gasCycle({ kind: S.cycle, n: S.n, gamma: S.gamma, Th: S.Th, Tc: S.Tc, V1: S.CV1, V2: S.CV2, T1: S.Tc, r: S.r, T3: S.T3, p1: S.p1, p2: S.p2, samples: 61 }) } catch { return null }
})
const curves = computed(() => (proc.value ? [proc.value] : cyc.value?.processes ?? []))

// animation along the curves
const u = ref(0)
const playing = ref(true)
/** Current point (V, p, T) at parameter u (0 … number of processes). */
const now = computed(() => {
  const cs = curves.value
  if (!cs.length) return null
  const k = Math.min(cs.length - 1, Math.floor(u.value)), f = Math.min(1, u.value - k)
  const pts = cs[k].curve, m = pts.length / 2
  const i = Math.min(m - 1, Math.round(f * (m - 1)))
  const V = pts[2 * i], p = pts[2 * i + 1]
  return { V, p, T: p * V / (S.n * R), k }
})

interface Mol { x: number; y: number; vx: number; vy: number }
const mols: Mol[] = Array.from({ length: 60 }, (_, i) => ({ x: ((i * 37) % 100) / 100, y: ((i * 61) % 100) / 100, vx: Math.cos(i * 2.4), vy: Math.sin(i * 2.4) }))
const { canvas, wrap, redraw } = useLabCanvas(() => props.active, (ctx, w, h, dt, P) => {
  if (playing.value && dt > 0 && curves.value.length) { u.value += dt * 0.35; if (u.value >= curves.value.length) u.value = S.mode === 'cycle' ? 0 : curves.value.length - 1e-9 }
  const cur = now.value
  if (!cur) return
  const vmax = Math.max(...curves.value.flatMap(c => c.curve.filter((_, i) => i % 2 === 0)))
  // cylinder
  const cx = w / 2 - 60, cw = 120, bottom = h - 30, top = 30
  const hp = (cur.V / vmax) * (bottom - top - 20)
  const py = bottom - hp
  ctx.strokeStyle = P.text; ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx, bottom); ctx.lineTo(cx + cw, bottom); ctx.lineTo(cx + cw, top); ctx.stroke()
  // gas colour by temperature
  const tt = Math.max(0, Math.min(1, (cur.T - 200) / 1600))
  ctx.fillStyle = `rgba(${Math.round(60 + 195 * tt)}, ${Math.round(130 - 60 * tt)}, ${Math.round(230 - 200 * tt)}, 0.18)`
  ctx.fillRect(cx + 2, py, cw - 4, bottom - py)
  ctx.fillStyle = P.staticFill; ctx.strokeStyle = P.staticStroke; ctx.lineWidth = 1.5
  ctx.fillRect(cx + 2, py - 14, cw - 4, 14); ctx.strokeRect(cx + 2, py - 14, cw - 4, 14)
  ctx.fillRect(cx + cw / 2 - 5, top - 20, 10, py - 14 - top + 20)
  // molecules (picture only: speed ∝ √T)
  const sp = Math.sqrt(cur.T / 300) * 0.6
  ctx.fillStyle = P.accent
  for (const m of mols) {
    m.x += m.vx * sp * dt; m.y += m.vy * sp * dt * (hp > 0 ? 120 / hp : 1)
    if (m.x < 0) { m.x = -m.x; m.vx = -m.vx } if (m.x > 1) { m.x = 2 - m.x; m.vx = -m.vx }
    if (m.y < 0) { m.y = -m.y; m.vy = -m.vy } if (m.y > 1) { m.y = 2 - m.y; m.vy = -m.vy }
    ctx.beginPath(); ctx.arc(cx + 6 + m.x * (cw - 12), py + 4 + m.y * Math.max(1, hp - 8), 2.5, 0, Math.PI * 2); ctx.fill()
  }
  // heat flow of the current process
  const c = curves.value[cur.k]
  ctx.font = `12px ${FONT}`
  if (Math.abs(c.Q) > 1e-9 * Math.max(1, Math.abs(c.W))) {
    const inflow = c.Q > 0
    ctx.fillStyle = inflow ? '#dc2626' : '#2563eb'
    ctx.fillText(inflow ? tl('吸热 Q') : tl('放热 Q'), cx + cw + 16, bottom - 20)
    ctx.beginPath()
    const ay = bottom - 40
    if (inflow) { ctx.moveTo(cx + cw + 60, ay); ctx.lineTo(cx + cw + 12, ay); ctx.lineTo(cx + cw + 20, ay - 6); ctx.moveTo(cx + cw + 12, ay); ctx.lineTo(cx + cw + 20, ay + 6) } else { ctx.moveTo(cx + cw + 12, ay); ctx.lineTo(cx + cw + 60, ay); ctx.lineTo(cx + cw + 52, ay - 6); ctx.moveTo(cx + cw + 60, ay); ctx.lineTo(cx + cw + 52, ay + 6) }
    ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 2; ctx.stroke()
  } else { ctx.fillStyle = P.text2; ctx.fillText(tl('绝热'), cx + cw + 16, bottom - 20) }
  ctx.fillStyle = P.text
  ctx.fillText(`T = ${cur.T.toFixed(1)} K`, cx - 110, top + 10)
  ctx.fillText(`p = ${fmtQ(cur.p, 'Pa', 4)}`, cx - 110, top + 30)
  ctx.fillText(`V = ${fmtQ(cur.V, 'm³', 4)}`, cx - 110, top + 50)
}, () => props.active && playing.value)
watch(curves, () => { u.value = 0; redraw() })

const COLORS = ['#dc2626', '#2563eb', '#16a34a', '#d97706']
const chartSeries = computed(() => curves.value.map((c, i) => ({ x: c.curve.filter((_, k) => k % 2 === 0).map(v => v * 1000), y: c.curve.filter((_, k) => k % 2 === 1).map(v => v / 1000), color: COLORS[i % 4], width: 2.2 })))
const marker = computed(() => (now.value ? [{ x: now.value.V * 1000, y: now.value.p / 1000, label: '' }] : []))
const KIND_TEXT: Record<string, string> = { isothermal: tl('等温'), isobaric: tl('等压'), isochoric: tl('等容'), adiabatic: tl('绝热') }
const pr = computed(() => proc.value)
</script>

<template>
  <div class="lab-shell">
    <div class="lab-stage">
      <div class="lab-bar">
        <div class="lab-seg">
          <button :class="{ on: S.mode === 'process' }" @click="S.mode = 'process'">{{ tl('单个过程') }}</button>
          <button :class="{ on: S.mode === 'cycle' }" @click="S.mode = 'cycle'">{{ tl('热机循环') }}</button>
        </div>
        <div v-if="S.mode === 'process'" class="lab-seg">
          <button v-for="k in (['isothermal', 'isobaric', 'isochoric', 'adiabatic'] as const)" :key="k" :class="{ on: S.kind === k }" @click="S.kind = k">{{ KIND_TEXT[k] }}</button>
        </div>
        <div v-else class="lab-seg">
          <button :class="{ on: S.cycle === 'carnot' }" @click="S.cycle = 'carnot'">{{ tl('卡诺循环') }}</button>
          <button :class="{ on: S.cycle === 'otto' }" @click="S.cycle = 'otto'">{{ tl('奥托循环') }}</button>
          <button :class="{ on: S.cycle === 'rectangle' }" @click="S.cycle = 'rectangle'">{{ tl('矩形循环') }}</button>
        </div>
        <button class="btn small primary" @click="playing = !playing">{{ playing ? tl('暂停') : tl('播放') }}</button>
        <button class="btn ghost small" @click="u = 0">{{ tl('回到起点') }}</button>
      </div>
      <div ref="wrap" class="lab-canvas"><canvas ref="canvas" /></div>
      <div class="lab-under">
        <LabChart :series="chartSeries" :markers="marker" :x-label="tl('V（L）')" :y-label="tl('p（kPa）')" :height="190" />
      </div>
    </div>
    <aside class="lab-side">
      <section class="lab-block">
        <div class="lab-fields">
          <label>{{ tl('物质的量 n') }}</label><NumField :model-value="S.n" unit="mol" :min="1e-6" @update:model-value="v => (S.n = v)" />
          <label>{{ tl('气体') }}</label>
          <select v-model.number="S.gamma" class="field small"><option :value="5 / 3">{{ tl('单原子（γ = 5/3）') }}</option><option :value="1.4">{{ tl('双原子（γ = 7/5）') }}</option></select>
          <template v-if="S.mode === 'process'">
            <label>{{ tl('初温 T₁') }}</label><NumField :model-value="S.T1" unit="K" :min="1" @update:model-value="v => (S.T1 = v)" />
            <label>{{ tl('初始体积 V₁') }}</label><NumField :model-value="S.V1" unit="m³" :min="1e-9" @update:model-value="v => (S.V1 = v)" />
            <template v-if="S.kind === 'isochoric'"><label>{{ tl('末温 T₂') }}</label><NumField :model-value="S.T2" unit="K" :min="1" @update:model-value="v => (S.T2 = v)" /></template>
            <template v-else><label>{{ tl('末体积 V₂') }}</label><input v-model.number="S.V2" type="range" :min="S.V1 * 0.2" :max="S.V1 * 4" :step="S.V1 / 200" :aria-label="tl('末体积')" /></template>
          </template>
          <template v-else-if="S.cycle === 'carnot'">
            <label>{{ tl('高温热源 T₁') }}</label><NumField :model-value="S.Th" unit="K" :min="1" @update:model-value="v => (S.Th = v)" />
            <label>{{ tl('低温热源 T₂') }}</label><NumField :model-value="S.Tc" unit="K" :min="1" @update:model-value="v => (S.Tc = v)" />
            <label>{{ tl('等温膨胀 V₁ → V₂') }}</label><span><NumField :model-value="S.CV1" unit="m³" :min="1e-9" @update:model-value="v => (S.CV1 = v)" /><NumField :model-value="S.CV2" unit="m³" :min="1e-9" @update:model-value="v => (S.CV2 = v)" /></span>
          </template>
          <template v-else-if="S.cycle === 'otto'">
            <label>{{ tl('压缩比 r') }}</label><NumField :model-value="S.r" :min="1.01" :step="0.5" @update:model-value="v => (S.r = v)" />
            <label>{{ tl('进气温度') }}</label><NumField :model-value="S.Tc" unit="K" :min="1" @update:model-value="v => (S.Tc = v)" />
            <label>{{ tl('燃烧后的温度') }}</label><NumField :model-value="S.T3" unit="K" :min="1" @update:model-value="v => (S.T3 = v)" />
          </template>
          <template v-else>
            <label>{{ tl('高压 / 低压') }}</label><span><NumField :model-value="S.p1" unit="Pa" @update:model-value="v => (S.p1 = v)" /><NumField :model-value="S.p2" unit="Pa" @update:model-value="v => (S.p2 = v)" /></span>
            <label>{{ tl('体积 V₁ / V₂') }}</label><span><NumField :model-value="S.CV1" unit="m³" @update:model-value="v => (S.CV1 = v)" /><NumField :model-value="S.CV2" unit="m³" @update:model-value="v => (S.CV2 = v)" /></span>
          </template>
        </div>
      </section>
      <section v-if="pr" class="lab-block">
        <div class="lab-btitle">{{ KIND_TEXT[pr.kind] }}{{ tl('过程') }}</div>
        <div class="lab-kv">
          <span>{{ tl('末态') }}</span><b>{{ pr.to.T.toFixed(2) }} K, {{ fmtQ(pr.to.p, 'Pa', 4) }}</b>
          <span>{{ tl('气体对外做功 W') }}</span><b class="big">{{ fmtQ(pr.W, 'J', 5) }}</b>
          <span>{{ tl('吸收的热量 Q') }}</span><b>{{ fmtQ(pr.Q, 'J', 5) }}</b>
          <span>{{ tl('内能增量 ΔU') }}</span><b>{{ fmtQ(pr.dU, 'J', 5) }}</b>
          <span>{{ tl('Q − ΔU − W') }}</span><b>{{ fmtQ(pr.Q - pr.dU - pr.W, 'J', 2) }}</b>
        </div>
        <LabFormula v-if="pr.kind === 'isothermal'" :title="tl('等温过程的功')" tex="W = nRT\ln\dfrac{V_2}{V_1}" expr="n*R*T*ln(V2/V1)" :vars="[{ name: 'n', symbol: 'n', value: S.n, unit: 'mol' }, { name: 'R', symbol: 'R', value: R, unit: 'J/(mol·K)' }, { name: 'T', symbol: 'T', value: S.T1, unit: 'K' }, { name: 'V1', symbol: 'V_1', value: S.V1, unit: 'm³' }, { name: 'V2', symbol: 'V_2', value: S.V2, unit: 'm³' }]" unit="J" lhs="W" :result="pr.W" />
        <LabFormula v-if="pr.kind === 'isobaric'" :title="tl('等压过程的功')" tex="W = p\,\Delta V" expr="p*(V2 - V1)" :vars="[{ name: 'p', symbol: 'p', value: p1, unit: 'Pa' }, { name: 'V1', symbol: 'V_1', value: S.V1, unit: 'm³' }, { name: 'V2', symbol: 'V_2', value: S.V2, unit: 'm³' }]" unit="J" lhs="W" :result="pr.W" />
        <LabFormula v-if="pr.kind === 'isochoric'" :title="tl('等容过程吸收的热量')" tex="Q = nC_V\Delta T" expr="n*R/(g - 1)*(T2 - T1)" :vars="[{ name: 'n', symbol: 'n', value: S.n, unit: 'mol' }, { name: 'R', symbol: 'R', value: R, unit: 'J/(mol·K)' }, { name: 'g', symbol: '\gamma', value: S.gamma, unit: '' }, { name: 'T1', symbol: 'T_1', value: S.T1, unit: 'K' }, { name: 'T2', symbol: 'T_2', value: S.T2, unit: 'K' }]" unit="J" lhs="Q" :result="pr.Q" />
        <LabFormula v-if="pr.kind === 'adiabatic'" :title="tl('绝热过程：pV^γ 不变')" tex="p_2 = p_1\left(\dfrac{V_1}{V_2}\right)^{\gamma}" expr="p1*(V1/V2)^g" :vars="[{ name: 'p1', symbol: 'p_1', value: p1, unit: 'Pa' }, { name: 'V1', symbol: 'V_1', value: S.V1, unit: 'm³' }, { name: 'V2', symbol: 'V_2', value: S.V2, unit: 'm³' }, { name: 'g', symbol: '\gamma', value: S.gamma, unit: '' }]" unit="Pa" lhs="p_2" :result="pr.to.p" />
        <LabFormula :title="tl('热力学第一定律')" tex="\Delta U = Q - W" expr="Q - W" :vars="[{ name: 'Q', symbol: 'Q', value: pr.Q, unit: 'J' }, { name: 'W', symbol: 'W', value: pr.W, unit: 'J' }]" unit="J" lhs="\Delta U" :result="pr.dU" />
      </section>
      <section v-if="cyc" class="lab-block">
        <table class="tbl small">
          <thead><tr><th /><th>W</th><th>Q</th><th>ΔU</th></tr></thead>
          <tbody>
            <tr v-for="(p, i) in cyc.processes" :key="i"><td><span class="dot" :style="{ background: COLORS[i % 4] }" />{{ KIND_TEXT[p.kind] }}</td><td class="mono">{{ fmtQ(p.W, 'J', 4) }}</td><td class="mono">{{ fmtQ(p.Q, 'J', 4) }}</td><td class="mono">{{ fmtQ(p.dU, 'J', 4) }}</td></tr>
          </tbody>
        </table>
        <div class="lab-kv">
          <span>{{ tl('一个循环吸热 Q₁') }}</span><b>{{ fmtQ(cyc.Qin, 'J', 5) }}</b>
          <span>{{ tl('放热 Q₂') }}</span><b>{{ fmtQ(cyc.Qout, 'J', 5) }}</b>
          <span>{{ tl('对外做功 W') }}</span><b>{{ fmtQ(cyc.W, 'J', 5) }}</b>
          <span>{{ tl('效率 η = W/Q₁') }}</span><b class="big">{{ (cyc.efficiency * 100).toFixed(4) }}%</b>
        </div>
        <LabFormula v-if="S.cycle === 'carnot'" :title="tl('卡诺热机的效率')" tex="\eta = 1 - \dfrac{T_2}{T_1}" expr="1 - Tc/Th" :vars="[{ name: 'Tc', symbol: 'T_2', value: S.Tc, unit: 'K' }, { name: 'Th', symbol: 'T_1', value: S.Th, unit: 'K' }]" unit="" lhs="\eta" :result="cyc.efficiency" />
        <LabFormula v-if="S.cycle === 'otto'" :title="tl('奥托循环的效率')" tex="\eta = 1 - \dfrac{1}{r^{\gamma - 1}}" expr="1 - 1/r^(g - 1)" :vars="[{ name: 'r', symbol: 'r', value: S.r, unit: '' }, { name: 'g', symbol: '\gamma', value: S.gamma, unit: '' }]" unit="" lhs="\eta" :result="cyc.efficiency" />
        <p class="tiny muted lab-note">{{ tl('一个循环回到初态，内能不变，对外做的净功等于 p–V 图中循环所围的面积，也等于吸收与放出的热量之差。') }}</p>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.tbl { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
.tbl th, .tbl td { text-align: right; padding: 2px 4px; }
.tbl td:first-child, .tbl th:first-child { text-align: left; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; }
</style>
