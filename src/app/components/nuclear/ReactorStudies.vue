<script setup lang="ts">
/**
 * Two small studies beside the reactor workshop (26.64, D277): a reactivity step on point kinetics alone
 * (`reactorKinetics`: prompt jump, stable period of the in-hour equation) and the xenon and samarium chains after a
 * shutdown (`reactorPoisons`: equilibrium, the xenon peak). The curves and readouts are the core's results.
 */
import { computed, ref, shallowRef, watch } from 'vue'
import { activeLang, tl } from '../../../i18n'
import { state } from '../../store'
import type { KineticsRun, PoisonRun } from '../../../engine/nuclear'
import { reactorKinetics, reactorPoisons } from '../../../engine/nuclear'
import { diagnosticLines, nuclearErrorText } from '../../../nuclear/diagText'
import { fixed, pcmText, sig, timeText, withUnit } from '../../../nuclear/format'
import { CURVE_COLOURS } from '../../../nuclear/chain'
import NumField from '../NumField.vue'
import LabChart from '../lab/LabChart.vue'

const props = defineProps<{ S: { study: 'kinetics' | 'poisons'; rhoPcm: number; duration: number; flux: number; fissionRate: number; shutdownH: number; hours: number } }>()
const dark = computed(() => state.theme === 'dark')
const colour = (i: number) => CURVE_COLOURS[i][dark.value ? 1 : 0]

// ---- point kinetics: a step of reactivity ----
const kin = shallowRef<KineticsRun | null>(null)
const kinError = ref('')
watch(() => [props.S.study, props.S.rhoPcm, props.S.duration], () => {
  if (props.S.study !== 'kinetics') return
  try {
    // the reactivity is entered in pcm: 1 pcm = 10⁻⁵
    kin.value = reactorKinetics({ rho: props.S.rhoPcm * 1e-5, duration: props.S.duration, samples: 200 })
    kinError.value = ''
  } catch (e) { kin.value = null; kinError.value = nuclearErrorText(e) }
}, { immediate: true })
const kinSeries = computed(() => (kin.value && kin.value.samples > 0 ? [{ x: kin.value.t, y: kin.value.n, color: colour(0), label: 'n / n₀' }] : []))
const kinNotes = computed(() => { activeLang(); return diagnosticLines(kin.value?.diagnostics) })

// ---- xenon and samarium ----
const poi = shallowRef<PoisonRun | null>(null)
const poiError = ref('')
let token = 0
watch(() => [props.S.study, props.S.flux, props.S.fissionRate, props.S.shutdownH, props.S.hours], async () => {
  if (props.S.study !== 'poisons') return
  const mine = ++token
  try {
    const r = await reactorPoisons({ fissionRate: props.S.fissionRate, flux: props.S.flux, duration: props.S.hours * 3600, samples: 240, start: 'equilibrium', shutdownAt: props.S.shutdownH * 3600 })
    if (mine !== token) return
    poi.value = r; poiError.value = ''
  } catch (e) { if (mine === token) { poi.value = null; poiError.value = nuclearErrorText(e) } }
}, { immediate: true })
const poiSeries = computed(() => {
  const r = poi.value
  if (!r) return []
  // time axis in hours
  const x = Array.from(r.t, t => t / 3600)
  return [
    { x, y: r.xenon, color: colour(0), label: '¹³⁵Xe' }, { x, y: r.iodine, color: colour(1), label: '¹³⁵I' },
    { x, y: r.samarium, color: colour(2), label: '¹⁴⁹Sm' }, { x, y: r.promethium, color: colour(4), label: '¹⁴⁹Pm' }
  ]
})
const density = (v: number | null | undefined) => withUnit(sig(v, 4), 'cm⁻³')
</script>

<template>
  <div class="studies" data-ui="reactor-studies">
    <div class="lab-seg" role="tablist" :aria-label="tl('专题')">
      <button role="tab" :aria-selected="S.study === 'kinetics'" :class="{ on: S.study === 'kinetics' }" data-ui="study-kinetics" @click="S.study = 'kinetics'">{{ tl('阶跃') }}</button>
      <button role="tab" :aria-selected="S.study === 'poisons'" :class="{ on: S.study === 'poisons' }" data-ui="study-poisons" @click="S.study = 'poisons'">{{ tl('氙与钐') }}</button>
    </div>

    <template v-if="S.study === 'kinetics'">
      <div class="lab-fields">
        <label>{{ tl('反应性阶跃') }}</label><NumField :model-value="S.rhoPcm" label="pcm" :min="-5000" :max="5000" :step="10" @update:model-value="v => (S.rhoPcm = v)" />
        <label>{{ tl('时长') }}</label><NumField :model-value="S.duration" label="s" :min="0.1" :max="100000" @update:model-value="v => (S.duration = v)" />
      </div>
      <p v-if="kinError" class="small err" role="alert">{{ kinError }}</p>
      <LabChart v-if="kinSeries.length" :series="kinSeries" x-label="t / s" :y-label="tl('相对功率')" :height="200" />
      <dl v-if="kin" class="lab-kv" data-ui="kinetics-readout">
        <dt>β</dt><dd><b class="num">{{ pcmText(kin.beta, 1) }}</b></dd>
        <dt>{{ tl('瞬跳 β/(β − ρ)') }}</dt><dd><b class="num" data-row="promptJump">{{ kin.promptJump === null ? '—' : fixed(kin.promptJump, 4) }}</b></dd>
        <dt>{{ tl('稳定周期') }}</dt><dd><b class="num big" data-row="period">{{ kin.inhour.period === null ? '—' : (kin.inhour.period < 0 ? '−' : '') + timeText(Math.abs(kin.inhour.period), 4) }}</b></dd>
        <dt>{{ tl('模型的上限') }}</dt><dd><b class="num">{{ pcmText(kin.limit, 1) }}</b></dd>
      </dl>
      <p v-for="d in kinNotes" :key="d.text" class="tiny note" :class="d.severity" :data-code="d.code">{{ d.text }}</p>
      <p class="tiny sub note">{{ tl('六组缓发中子的点堆动力学，从平衡出发；稳定周期由倒时方程给出。反应性达到 0.9 β 时不再计算。') }}</p>
    </template>

    <template v-else>
      <div class="lab-fields">
        <label>{{ tl('热中子通量') }}</label><NumField :model-value="S.flux" label="cm⁻² s⁻¹" :min="0" @update:model-value="v => (S.flux = v)" />
        <label>{{ tl('裂变率') }}</label><NumField :model-value="S.fissionRate" label="cm⁻³ s⁻¹" :min="0" @update:model-value="v => (S.fissionRate = v)" />
        <label>{{ tl('停堆时刻') }}</label><NumField :model-value="S.shutdownH" label="h" :min="0" :max="S.hours" @update:model-value="v => (S.shutdownH = v)" />
        <label>{{ tl('时长') }}</label><NumField :model-value="S.hours" label="h" :min="1" :max="2000" @update:model-value="v => (S.hours = v)" />
      </div>
      <p v-if="poiError" class="small err" role="alert">{{ poiError }}</p>
      <LabChart v-if="poiSeries.length" :series="poiSeries" x-label="t / h" :y-label="tl('核密度 / cm⁻³')" :markers="[{ x: S.shutdownH, label: tl('停堆') }]" :height="220" />
      <dl v-if="poi" class="lab-kv" data-ui="poisons-readout">
        <dt>{{ tl('平衡氙') }}</dt><dd><b class="num">{{ density(poi.equilibrium.xenon) }}</b></dd>
        <dt>{{ tl('平衡钐') }}</dt><dd><b class="num">{{ density(poi.equilibrium.samarium) }}</b></dd>
        <template v-if="poi.peak">
          <dt>{{ tl('氙峰出现在停堆后') }}</dt><dd><b class="num big" data-row="peakAfter">{{ timeText(poi.peak.after, 4) }}</b></dd>
          <dt>{{ tl('氙峰与停堆时之比') }}</dt><dd><b class="num" data-row="peakRatio">{{ fixed(poi.peak.ratio, 3) }}</b></dd>
        </template>
        <dt>{{ tl('平衡氙的吸收截面') }}</dt><dd><b class="num">{{ withUnit(sig(poi.xenonAbsorption, 4), 'cm⁻¹') }}</b></dd>
      </dl>
      <p class="tiny sub note">{{ tl('碘-135 → 氙-135 与钷-149 → 钐-149 两条链，从所给通量下的平衡出发。停堆后氙先升后降——这就是“碘坑”。') }}</p>
    </template>
  </div>
</template>

<style scoped>
.studies { display: flex; flex-direction: column; gap: var(--space-2); }
.studies .lab-seg { align-self: flex-start; }
.lab-kv dt { color: var(--text-2); }
.lab-kv dd { margin: 0; text-align: right; }
.err { color: var(--danger); margin: 0; }
.sub { color: var(--text-2); }
.note { margin: 0; line-height: var(--line-body); }
</style>
