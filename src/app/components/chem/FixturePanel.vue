<script setup lang="ts">
/**
 * The inspector of a fixture (26.65, D297 items 4–5): a stand, a tripod, a rack, a burner, a hot plate, a bath. What it
 * is doing and its settings — the lamp's cap and flame, the heat a burner gives (its setting: what reaches the vessel
 * is the core's to count), a bath's temperature, the height of a stand's clamp and ring. A setting is applied when the
 * slider is let go: one change, and when it decides chemistry (a lit burner under a vessel) one action of the log.
 */
import { computed, ref, watch } from 'vue'
import { tl } from '../../../i18n'
import { useBench } from '../../../chem/bench'
import { kindName, kindOf } from '../../../chem/apparatus'
import { BATH_RANGE, RIG, heatedBy, isBath, isBurner, powerRange, rigWants } from '../../../chem/rig'
import { fmtPower, fmtTemp } from '../../../chem/format'
import { reagentName, reagentOf } from '../../../chem/catalog'
import { showToast } from '../../store'

const bench = useBench()
const f = computed(() => { void bench.revision.value; return bench.fixtureOf(bench.selectedFixture.value) })
const name = computed(() => (f.value ? (f.value.kind === 'reagentBottle' ? reagentName(reagentOf(f.value.reagent ?? ''), f.value.reagent) : kindName(kindOf(f.value.kind))) : ''))
const bottleLabel = computed(() => { const r = f.value?.kind === 'reagentBottle' ? reagentOf(f.value.reagent ?? '') : undefined; return r?.label ?? '' })

/** The vessel this fixture heats, holds in its bath, or carries. */
const acting = computed(() => {
  const x = f.value
  if (!x) return ''
  const vs = bench.rigVessels()
  if (isBurner(x.kind)) { const v = x.lit ? heatedBy(x, vs) : null; return v ? tl('加热{0}', [bench.vesselName(v.id)]) : x.lit ? tl('火焰下没有容器') : '' }
  const held = vs.filter(v => v.on === x.id).map(v => bench.vesselName(v.id))
  if (x.kind === 'hotPlate') { const w = rigWants(bench.fixtures.value, vs); const v = vs.find(q => q.on === x.id && (w.get(q.id)?.heater ?? 0) > 0); return v ? tl('加热{0}', [bench.vesselName(v.id)]) : held.length ? held.join(' · ') : '' }
  return held.join(' · ')
})

const state = computed(() => {
  const x = f.value
  if (!x) return ''
  if (x.kind === 'alcoholBurner') return x.lit ? tl('燃着') : x.cap ? tl('灯帽盖着') : tl('灯帽已取下')
  if (x.kind === 'blastBurner') return x.lit ? tl('燃着') : tl('未点燃')
  if (x.kind === 'hotPlate') return x.on ? tl('已打开') : tl('已关闭')
  if (x.kind === 'reagentBottle' && x.style !== 'dropper') return x.open ? tl('瓶塞已取下') : tl('瓶塞塞着')
  return ''
})

// the settings shown while a slider moves, applied when it is let go
const power = ref(0)
const bathC = ref(0)
const clamp = ref(0)
const ring = ref(0)
watch(f, x => {
  if (!x) return
  power.value = x.power ?? 0
  bathC.value = Math.round(((x.T ?? 333.15) - 273.15) * 10) / 10
  clamp.value = x.clamp ?? 22
  ring.value = x.ring ?? 12
}, { immediate: true })
const range = computed(() => (f.value ? powerRange(f.value.kind) : [0, 0]))

function setPower() { if (f.value) bench.setFixture(f.value.id, { power: Math.round(power.value) }) }
function setBath() {
  const x = f.value
  if (!x) return
  const lo = BATH_RANGE[0] - 273.15, hi = BATH_RANGE[1] - 273.15
  const c = Math.max(lo, Math.min(hi, Number(String(bathC.value).replace(',', '.'))))
  if (!Number.isFinite(c)) return
  bathC.value = c
  bench.setFixture(x.id, { T: Math.round((c + 273.15) * 100) / 100 })
}
function setClamp() { if (f.value) bench.setFixture(f.value.id, { clamp: clamp.value }) }
function setRing() { if (f.value) bench.setFixture(f.value.id, { ring: ring.value }) }
function toggleRing() {
  const x = f.value
  if (!x) return
  if (typeof x.ring === 'number') {
    if (bench.rigVessels().some(v => v.on === x.id && v.at === 'ring')) { showToast(tl('先把铁圈上的容器拿下来'), true); return }
    bench.setFixture(x.id, { ring: null })
  } else bench.setFixture(x.id, { ring: ring.value })
}
function flip() {
  const x = f.value
  if (!x) return
  if (bench.rigVessels().some(v => v.on === x.id)) { showToast(tl('先把夹着的容器拿下来'), true); return }
  bench.setFixture(x.id, { side: (x.side ?? 1) === 1 ? -1 : 1 })
}
function remove() { const x = f.value; if (x) { const n = name.value; bench.removeFixture(x.id); showToast(tl('已移走{0}', [n])) } }
</script>

<template>
  <div v-if="f" class="fixture" data-ui="chem-fixture" :data-kind="f.kind">
    <h3 class="vname">{{ name }}<span v-if="state" class="state">{{ state }}</span></h3>
    <p v-if="acting" class="acting">{{ acting }}</p>
    <template v-if="f.kind === 'reagentBottle'">
      <p v-if="bottleLabel" class="acting num">{{ bottleLabel }}</p>
      <div v-if="f.style !== 'dropper'" class="row">
        <button type="button" class="btn" data-ui="chem-bottle-stopper" @click="bench.setFixture(f.id, { open: !f.open })">{{ f.open ? tl('塞上瓶塞') : tl('取下瓶塞') }}</button>
      </div>
    </template>

    <template v-if="f.kind === 'alcoholBurner'">
      <div class="row">
        <button v-if="f.cap && !f.lit" type="button" class="btn" data-ui="chem-lamp-cap" @click="bench.setFixture(f.id, { cap: false })">{{ tl('取下灯帽') }}</button>
        <button v-if="!f.cap && !f.lit" type="button" class="btn primary" data-ui="chem-lamp-light" @click="bench.setFixture(f.id, { lit: true })">{{ tl('点灯') }}</button>
        <button v-if="f.lit" type="button" class="btn" data-ui="chem-lamp-out" @click="bench.setFixture(f.id, { lit: false, cap: true })">{{ tl('盖灭') }}</button>
        <button v-if="!f.cap && !f.lit" type="button" class="btn ghost" @click="bench.setFixture(f.id, { cap: true })">{{ tl('盖上灯帽') }}</button>
      </div>
    </template>
    <div v-else-if="f.kind === 'blastBurner' || f.kind === 'hotPlate'" class="row">
      <button type="button" class="btn" :class="{ primary: !(f.lit || f.on) }" data-ui="chem-fixture-toggle" @click="bench.tapFixture(f.id)">{{ f.kind === 'hotPlate' ? (f.on ? tl('断电') : tl('通电')) : f.lit ? tl('熄灭喷灯') : tl('点燃喷灯') }}</button>
    </div>

    <label v-if="isBurner(f.kind) || f.kind === 'hotPlate'" class="field-row">
      <span class="lbl" :title="tl('到达容器的热量，量级估计')">{{ isBurner(f.kind) ? tl('火力') : tl('功率') }}</span>
      <input v-model.number="power" type="range" :min="range[0]" :max="range[1]" :step="f.kind === 'alcoholBurner' ? 10 : 50" :aria-label="isBurner(f.kind) ? tl('火力') : tl('功率')" data-ui="chem-fixture-power" @change="setPower" />
      <span class="num val">{{ fmtPower(power) }}</span>
    </label>

    <template v-if="isBath(f.kind)">
      <label v-if="f.kind === 'waterBath'" class="field-row">
        <span class="lbl">{{ tl('浴温') }}</span>
        <input v-model="bathC" class="field num" inputmode="decimal" :aria-label="tl('浴温')" data-ui="chem-bath-temp" @change="setBath" @keydown.enter="setBath" />
        <span class="unit">°C</span>
      </label>
      <p v-else class="acting">{{ fmtTemp(f.T ?? 273.15, 0) }}</p>
    </template>

    <template v-if="f.kind === 'stand'">
      <label v-if="typeof f.clamp === 'number'" class="field-row">
        <span class="lbl">{{ tl('铁夹高度') }}</span>
        <input v-model.number="clamp" type="range" :min="RIG.stand.clampMin" :max="RIG.stand.clampMax" step="0.5" :aria-label="tl('铁夹高度')" data-ui="chem-clamp-height" @change="setClamp" />
        <span class="num val">{{ clamp }} cm</span>
      </label>
      <label v-if="typeof f.ring === 'number'" class="field-row">
        <span class="lbl">{{ tl('铁圈高度') }}</span>
        <input v-model.number="ring" type="range" :min="RIG.stand.ringMin" :max="RIG.stand.ringMax" step="0.5" :aria-label="tl('铁圈高度')" @change="setRing" />
        <span class="num val">{{ ring }} cm</span>
      </label>
      <div class="row">
        <button type="button" class="btn" data-ui="chem-stand-ring" @click="toggleRing">{{ typeof f.ring === 'number' ? tl('去掉铁圈') : tl('装上铁圈') }}</button>
        <button type="button" class="btn ghost" @click="flip">{{ tl('换一侧') }}</button>
      </div>
    </template>

    <div class="row end"><button type="button" class="btn ghost danger" data-ui="chem-fixture-remove" @click="remove">{{ tl('移走') }}</button></div>
  </div>
</template>

<style scoped>
.fixture { display: flex; flex-direction: column; gap: var(--space-3); }
.vname { margin: var(--space-1) 0 0; font-size: var(--type-subtitle); font-weight: var(--weight-title); line-height: var(--line-tight); display: flex; align-items: baseline; gap: var(--space-2); flex-wrap: wrap; }
.state { font-size: var(--type-small); font-weight: var(--weight-regular); color: var(--text-2); }
.acting { margin: 0; font-size: var(--type-small); color: var(--text-2); }
.row { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.row.end { justify-content: flex-end; }
.field-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--space-2); }
.field-row .lbl { font-size: var(--type-small); color: var(--text-2); }
.field-row input[type='range'] { width: 100%; }
.field-row .field { width: 100%; }
.val { min-width: 4.5em; text-align: right; font-size: var(--type-small); }
.unit { font-size: var(--type-small); color: var(--text-2); }
.danger { color: var(--danger); }
</style>
