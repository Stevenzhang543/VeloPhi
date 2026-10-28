<script setup lang="ts">
/**
 * Compton scattering (26.55): an X-ray photon scattered by a free electron loses energy, its wavelength grows by
 * Δλ = (h/mₑc)(1 − cos θ). The core (`compton`) computes the wavelengths, energies and the recoil angle; this component
 * draws the collision and the curve Δλ(θ).
 */
import { computed, watch } from 'vue'
import { tl } from '../../../i18n'
import { compton } from '../../../engine/labs'
import { labState } from '../../lab/state'
import { useLabCanvas } from '../../lab/canvas'
import { FONT } from '../../../render/style'
import NumField from '../NumField.vue'
import LabChart from './LabChart.vue'
import LabFormula from './LabFormula.vue'

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })
const S = labState('compton', () => ({ lambda: 71.1, theta: 90, constantsSet: 'CODATA2022' }))
const res = computed(() => { try { return compton(S.lambda, S.theta * Math.PI / 180, S.constantsSet) } catch { return null } })

const { canvas, wrap, redraw } = useLabCanvas(() => props.active, (ctx, w, h, _dt, P) => {
  const r = res.value
  if (!r) return
  const cx = w * 0.45, cy = h / 2, L = Math.min(w, h) * 0.38
  const wave = (x0: number, y0: number, ang: number, len: number, lam: number, col: string) => {
    ctx.save(); ctx.translate(x0, y0); ctx.rotate(ang)
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath()
    const k = 2 * Math.PI / (lam / 6)
    for (let s = 0; s <= len; s += 1) { const y = 7 * Math.sin(k * s); if (s) ctx.lineTo(s, y); else ctx.moveTo(s, y) }
    ctx.stroke()
    ctx.beginPath(); ctx.moveTo(len, 0); ctx.lineTo(len - 9, -5); ctx.lineTo(len - 9, 5); ctx.closePath(); ctx.fillStyle = col; ctx.fill()
    ctx.restore()
  }
  wave(cx - L, cy, 0, L - 12, S.lambda, '#7c3aed')
  const th = S.theta * Math.PI / 180
  wave(cx, cy, -th, L, r.lambda2, '#db2777')
  // electron recoil (below the axis)
  ctx.strokeStyle = P.accent; ctx.lineWidth = 2.5
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + L * 0.7 * Math.cos(r.phi), cy + L * 0.7 * Math.sin(r.phi)); ctx.stroke()
  ctx.fillStyle = P.accent; ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill()
  ctx.font = `12px ${FONT}`; ctx.fillStyle = P.text2
  ctx.fillText(tl('入射光子 λ'), cx - L, cy - 16)
  ctx.fillText(tl("散射光子 λ'"), cx + L * 0.6 * Math.cos(th), cy - L * 0.6 * Math.sin(th) - 14)
  ctx.fillText(tl('反冲电子'), cx + L * 0.7 * Math.cos(r.phi) + 6, cy + L * 0.7 * Math.sin(r.phi))
  ctx.strokeStyle = P.gridMajor; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + L, cy); ctx.stroke(); ctx.setLineDash([])
})
watch(res, redraw)
const curve = computed(() => {
  const c = res.value?.curve
  if (!c) return { x: [], y: [] }
  const x: number[] = [], y: number[] = []
  for (let i = 0; i + 1 < c.length; i += 2) { x.push(c[i] * 180 / Math.PI); y.push(c[i + 1]) }
  return { x, y }
})
</script>

<template>
  <div class="lab-shell">
    <div class="lab-stage">
      <div class="lab-bar">
        <label class="ctl">{{ tl('散射角 θ') }} <input v-model.number="S.theta" type="range" min="0" max="180" step="1" :aria-label="tl('散射角')" /> {{ S.theta }}°</label>
        <span class="grow" />
        <label class="ctl tiny">{{ tl('常数集') }}<select v-model="S.constantsSet" class="field small" :aria-label="tl('常数集')"><option value="CODATA2022">CODATA 2022</option><option value="CODATA2018">CODATA 2018</option></select></label>
      </div>
      <div ref="wrap" class="lab-canvas"><canvas ref="canvas" /></div>
      <div class="lab-under"><LabChart :series="[{ x: curve.x, y: curve.y, color: '#db2777' }]" :markers="res ? [{ x: S.theta, y: res.shift }] : []" :x-label="tl('θ（°）')" :y-label="tl('Δλ（pm）')" :height="150" /></div>
    </div>
    <aside class="lab-side">
      <section class="lab-block">
        <div class="lab-fields"><label>{{ tl('入射波长') }}</label><NumField :model-value="S.lambda" unit="pm" :min="0.01" @update:model-value="v => (S.lambda = v)" /></div>
        <div v-if="res" class="lab-kv">
          <span>{{ tl("散射光波长 λ'") }}</span><b class="big">{{ res.lambda2.toFixed(4) }} pm</b>
          <span>{{ tl('波长的增加 Δλ') }}</span><b>{{ res.shift.toFixed(5) }} pm</b>
          <span>{{ tl('入射光子能量') }}</span><b>{{ (res.E1 * 1000).toFixed(4) }} keV</b>
          <span>{{ tl('散射光子能量') }}</span><b>{{ (res.E2 * 1000).toFixed(4) }} keV</b>
          <span>{{ tl('电子获得的动能') }}</span><b>{{ (res.Ek * 1000).toFixed(4) }} keV</b>
          <span>{{ tl('电子反冲角') }}</span><b>{{ (res.phi * 180 / Math.PI).toFixed(2) }}°</b>
        </div>
        <LabFormula v-if="res" :title="tl('康普顿公式')" tex="\Delta\lambda = \dfrac{h}{m_e c}(1 - \cos\theta)" expr="lc*(1 - cos(th))" :vars="[{ name: 'lc', symbol: 'h/(m_e c)', value: res.compton, unit: '' }, { name: 'th', symbol: '\theta', value: S.theta * Math.PI / 180, unit: 'rad' }]" unit="" lhs="\Delta\lambda/\text{pm}" :result="res.shift" />
        <p class="tiny muted lab-note">{{ tl('光子与电子碰撞时动量和能量都守恒：光子把一部分能量交给电子，波长变长。Δλ 只与散射角有关，与入射波长无关；h/(mₑc) = 2.426 pm 叫做电子的康普顿波长。这个效应说明光子具有动量 p = h/λ。') }}</p>
      </section>
    </aside>
  </div>
</template>
