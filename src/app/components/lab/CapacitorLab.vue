<script setup lang="ts">
/**
 * Parallel-plate capacitor (26.55): C = ε_rε₀S/d, connected to a battery (U fixed) or charged and isolated (Q fixed).
 * Change the plate area, the gap or the dielectric and see C, Q, U, E and the stored energy change; the core
 * (`plateCapacitor`) also gives the work of the battery and of the hand for the change from the starting values.
 */
import { computed, watch } from 'vue'
import { tl } from '../../../i18n'
import { fmtQ } from '../../settings'
import { plateCapacitor } from '../../../engine/labs'
import { labState } from '../../lab/state'
import { useLabCanvas } from '../../lab/canvas'
import { FONT } from '../../../render/style'
import NumField from '../NumField.vue'
import LabFormula from './LabFormula.vue'

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })
const EPS0 = 8.8541878128e-12
const S = labState('capacitor', () => ({ mode: 'battery' as 'battery' | 'isolated', U: 100, S: 0.02, d: 2e-3, er: 1, start: { S: 0.02, d: 2e-3, er: 1 } }))
const res = computed(() => { try { return plateCapacitor({ S: S.S, d: S.d, er: S.er, mode: S.mode, U: S.U, Q: S.mode === 'isolated' ? S.start.er * EPS0 * S.start.S / S.start.d * S.U : undefined, S0: S.start.S, d0: S.start.d, er0: S.start.er }) } catch { return null } })
function setStart() { S.start = { S: S.S, d: S.d, er: S.er } }

const { canvas, wrap, redraw } = useLabCanvas(() => props.active, (ctx, w, h, _dt, P) => {
  const r = res.value
  if (!r) return
  const cx = w / 2, cy = h / 2
  const gap = Math.max(16, Math.min(h * 0.6, S.d * 40000))
  const len = Math.max(60, Math.min(w * 0.7, Math.sqrt(S.S) * 1800))
  // dielectric
  if (S.er > 1) { ctx.fillStyle = 'rgba(234, 179, 8, 0.18)'; ctx.fillRect(cx - len / 2, cy - gap / 2, len, gap) }
  // field lines: density ∝ E
  const nLines = Math.max(2, Math.min(40, Math.round(r.E / 2500)))
  ctx.strokeStyle = P.electric ?? '#0f766e'; ctx.lineWidth = 1.2
  for (let k = 0; k < nLines; k++) {
    const x = cx - len / 2 + (len * (k + 0.5)) / nLines
    ctx.beginPath(); ctx.moveTo(x, cy - gap / 2 + 3); ctx.lineTo(x, cy + gap / 2 - 3); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x, cy + 4); ctx.lineTo(x - 3, cy - 2); ctx.lineTo(x + 3, cy - 2); ctx.closePath(); ctx.fillStyle = ctx.strokeStyle; ctx.fill()
  }
  // plates with charges
  ctx.fillStyle = P.text
  ctx.fillRect(cx - len / 2, cy - gap / 2 - 6, len, 6); ctx.fillRect(cx - len / 2, cy + gap / 2, len, 6)
  ctx.font = `bold 12px ${FONT}`
  const nq = Math.max(1, Math.min(30, Math.round(r.Q / 2e-9)))
  for (let k = 0; k < nq; k++) {
    const x = cx - len / 2 + (len * (k + 0.5)) / nq
    ctx.fillStyle = P.positive ?? '#dc2626'; ctx.fillText('+', x - 4, cy - gap / 2 - 10)
    ctx.fillStyle = P.negative ?? '#2563eb'; ctx.fillText('−', x - 4, cy + gap / 2 + 20)
  }
  // battery or isolation
  ctx.strokeStyle = P.text2; ctx.lineWidth = 1.5
  if (S.mode === 'battery') {
    ctx.beginPath(); ctx.moveTo(cx + len / 2, cy - gap / 2 - 3); ctx.lineTo(cx + len / 2 + 50, cy - gap / 2 - 3); ctx.lineTo(cx + len / 2 + 50, cy - 8)
    ctx.moveTo(cx + len / 2, cy + gap / 2 + 3); ctx.lineTo(cx + len / 2 + 50, cy + gap / 2 + 3); ctx.lineTo(cx + len / 2 + 50, cy + 8); ctx.stroke()
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx + len / 2 + 38, cy - 8); ctx.lineTo(cx + len / 2 + 62, cy - 8); ctx.stroke()
    ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx + len / 2 + 44, cy + 8); ctx.lineTo(cx + len / 2 + 56, cy + 8); ctx.stroke()
    ctx.fillStyle = P.text2; ctx.font = `12px ${FONT}`; ctx.fillText(`U = ${fmtQ(S.U, 'V', 3)}`, cx + len / 2 + 66, cy + 4)
  } else {
    ctx.fillStyle = P.text2; ctx.font = `12px ${FONT}`; ctx.fillText(tl('断开电源：电荷量不变'), cx + len / 2 + 12, cy + 4)
  }
})
watch(() => [res.value, S.mode], redraw, { deep: true })
</script>

<template>
  <div class="lab-shell">
    <div class="lab-stage">
      <div class="lab-bar">
        <div class="lab-seg">
          <button :class="{ on: S.mode === 'battery' }" @click="S.mode = 'battery'">{{ tl('始终接电源（U 不变）') }}</button>
          <button :class="{ on: S.mode === 'isolated' }" @click="S.mode = 'isolated'">{{ tl('充电后断开（Q 不变）') }}</button>
        </div>
        <button class="btn ghost small" :title="tl('以当前的板面积、间距和介质作为比较的起点')" @click="setStart">{{ tl('设为起点') }}</button>
      </div>
      <div ref="wrap" class="lab-canvas"><canvas ref="canvas" /></div>
    </div>
    <aside class="lab-side">
      <section class="lab-block">
        <div class="lab-fields">
          <label>{{ tl('板间距 d') }}</label><input :value="S.d * 1000" type="range" min="0.5" max="10" step="0.1" :aria-label="tl('板间距')" @input="S.d = Number(($event.target as HTMLInputElement).value) / 1000" />
          <label>{{ tl('正对面积 S') }}</label><input :value="S.S * 1e4" type="range" min="10" max="400" step="5" :aria-label="tl('正对面积')" @input="S.S = Number(($event.target as HTMLInputElement).value) / 1e4" />
          <label>{{ tl('相对介电常数 εr') }}</label><input v-model.number="S.er" type="range" min="1" max="10" step="0.1" :aria-label="tl('相对介电常数')" />
          <label>{{ S.mode === 'battery' ? tl('电源电压') : tl('起点时的充电电压') }}</label><NumField :model-value="S.U" unit="V" @update:model-value="v => (S.U = v)" />
        </div>
      </section>
      <section v-if="res" class="lab-block">
        <div class="lab-kv">
          <span>{{ tl('电容 C') }}</span><b class="big">{{ fmtQ(res.C, 'F', 4) }}</b>
          <span>{{ tl('电荷量 Q') }}</span><b>{{ fmtQ(res.Q, 'C', 4) }}</b>
          <span>{{ tl('两板电压 U') }}</span><b>{{ fmtQ(res.U, 'V', 4) }}</b>
          <span>{{ tl('板间场强 E') }}</span><b>{{ fmtQ(res.E, 'V/m', 4) }}</b>
          <span>{{ tl('储存的电场能') }}</span><b>{{ fmtQ(res.energy, 'J', 4) }}</b>
          <span>{{ tl('与起点相比：电源做功') }}</span><b>{{ fmtQ(res.batteryWork, 'J', 4) }}</b>
          <span>{{ tl('与起点相比：外力做功') }}</span><b>{{ fmtQ(res.handWork, 'J', 4) }}</b>
        </div>
        <LabFormula :title="tl('平行板电容器的电容')" tex="C = \dfrac{\varepsilon_r S}{4\pi k d} = \dfrac{\varepsilon_r\varepsilon_0 S}{d}" expr="er*e0*S/d" :vars="[{ name: 'er', symbol: '\varepsilon_r', value: S.er, unit: '' }, { name: 'e0', symbol: '\varepsilon_0', value: EPS0, unit: 'F/m' }, { name: 'S', symbol: 'S', value: S.S, unit: 'm²' }, { name: 'd', symbol: 'd', value: S.d, unit: 'm' }]" unit="F" lhs="C" :result="res.C" />
        <LabFormula :title="tl('匀强电场')" tex="E = \dfrac{U}{d}" expr="U/d" :vars="[{ name: 'U', symbol: 'U', value: res.U, unit: 'V' }, { name: 'd', symbol: 'd', value: S.d, unit: 'm' }]" unit="V/m" lhs="E" :result="res.E" />
        <LabFormula :title="tl('电容器储存的能量')" tex="E_C = \tfrac12 CU^2" expr="0.5*C*U^2" :vars="[{ name: 'C', symbol: 'C', value: res.C, unit: 'F' }, { name: 'U', symbol: 'U', value: res.U, unit: 'V' }]" unit="J" lhs="E_C" :result="res.energy" />
        <p class="tiny muted lab-note">{{ tl('接着电源时 U 不变：拉开极板 C 变小，Q 减少，电荷流回电源。断开电源后 Q 不变：拉开极板 U 变大，但 E = σ/(εrε₀) 不变。外力做的功等于电场能的增量减去电源做的功。') }}</p>
      </section>
    </aside>
  </div>
</template>
