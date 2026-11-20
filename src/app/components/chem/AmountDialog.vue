<script setup lang="ts">
/**
 * How much (26.64, D268): the question asked when a reagent is put on a vessel, or one vessel is poured into
 * another. Two ways, as at a real bench: **an amount** — a number and a unit the reagent can be measured in, Enter
 * confirms — or **pouring by hand** — while the button is held, small fixed portions go in one after the other
 * (each is an action of the log; the record shows them as one line with a count). A burette delivers the same two
 * ways, down to single drops. Nothing is added when the core refuses: the dialog stays and the message says why.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { tl } from '../../../i18n'
import { vDialog } from '../../focusTrap'
import type { Amount } from '../../../engine/chem'
import { useBench } from '../../../chem/bench'
import { kindOf, volumeResolution, decimalsFor } from '../../../chem/apparatus'
import { defaultAmount, reagentOf, reagentText, unitsFor } from '../../../chem/catalog'
import { fmtPH, fmtVolume, qty } from '../../../chem/format'
import Icon from '../Icon.vue'
import { benchUi, noteTransfer } from './benchUi'
import type { DialogSpec } from './benchUi'

const props = defineProps<{ spec: DialogSpec }>()
const bench = useBench()
const close = () => { stopHold(); benchUi.dialog = null }

const reagent = computed(() => (props.spec.mode === 'add' ? reagentOf(props.spec.reagent) : undefined))
const from = computed(() => (props.spec.mode === 'pour' ? bench.vesselOf(props.spec.from) : undefined))
const to = computed(() => bench.vesselOf(props.spec.to))
const fromKind = computed(() => kindOf(from.value?.kind ?? '')?.vessel)
/** A vessel with a tap (burette, separating funnel) delivers; anything else is poured. */
const tap = computed(() => !!fromKind.value?.tap)
const canFilter = computed(() => props.spec.mode === 'pour' && bench.extras(props.spec.to).parts.some(p => kindOf(p)?.tool?.action === 'filter'))

type Unit = Amount['unit']
const units = computed<Unit[]>(() => (props.spec.mode === 'add' ? (reagent.value ? unitsFor(reagent.value) : ['mL']) : ['mL', 'drop']))
const unit = ref<Unit>('mL')
const text = ref('')
const all = ref(false)
const filter = ref(false)
const hand = ref(false)
const added = ref(0)
const field = ref<HTMLInputElement | null>(null)

function reset() {
  unit.value = units.value[0]
  all.value = props.spec.mode === 'pour' && !tap.value
  filter.value = canFilter.value
  hand.value = false
  added.value = 0
  text.value = props.spec.mode === 'add' && reagent.value ? String(defaultAmount(reagent.value, unit.value)) : tap.value ? '1' : String(Math.min(20, Math.round((from.value?.volume_mL ?? 20) * 100) / 100))
}
watch(() => props.spec, reset, { immediate: true })
watch(unit, u => { if (props.spec.mode === 'add' && reagent.value) text.value = String(defaultAmount(reagent.value, u)) })

const value = computed(() => Number(text.value.trim().replace(',', '.')))
const valid = computed(() => (all.value || filter.value) || (Number.isFinite(value.value) && value.value > 0))
const unitLabel = (u: Unit) => (u === 'drop' ? tl('滴') : u)

const title = computed(() => (props.spec.mode === 'add' ? tl('加入{0}', [reagentText(props.spec.reagent)]) : tap.value ? tl('从{0}滴加', [bench.vesselName(props.spec.from)]) : tl('从{0}倒出', [bench.vesselName(props.spec.from)])))
const target = computed(() => bench.vesselName(props.spec.to))
/** What the vessels show now: so the effect of a portion is seen without closing the dialog. */
const status = computed(() => {
  void bench.revision.value
  const v = to.value
  if (!v) return ''
  const parts = [qty(v.volume_mL, 'mL', 2)]
  if (v.pH !== undefined && bench.extras(v.id).parts.some(p => kindOf(p)?.instrument?.reads === 'pH' && kindOf(p)?.instrument?.display === 'digital')) parts.push(`pH ${fmtPH(v.pH)}`)
  return parts.join(' · ')
})
const sourceStatus = computed(() => {
  void bench.revision.value
  const v = from.value
  if (!v) return ''
  const res = volumeResolution(v.kind, v.capacity_mL)
  return fromKind.value?.zero === 'top' ? tl('读数 {0}', [qty(v.capacity_mL - v.volume_mL, 'mL', decimalsFor(res ?? 0.01))]) : fmtVolume(v.volume_mL, 1)
})

function once(amount?: Amount): boolean {
  const s = props.spec
  if (s.mode === 'add') {
    if (!amount || !bench.add(s.to, s.reagent, amount)) return false
    noteTransfer(s.to, null, amount.unit === 'drop')
    return true
  }
  const ok = filter.value ? bench.filter(s.from, s.to) : bench.pour(s.from, s.to, amount)
  if (!ok) return false
  noteTransfer(s.to, s.from, amount?.unit === 'drop')
  return true
}

function confirm() {
  if (!valid.value) return
  if (once(all.value || filter.value ? undefined : { value: value.value, unit: unit.value })) close()
}

/** One portion of a pour by hand: a drop from a tap, a millilitre of a liquid, a tenth of a gram of a solid. */
const portion = computed<Amount>(() => {
  if (props.spec.mode === 'pour') return tap.value ? { value: 0.5, unit: 'mL' } : { value: 1, unit: 'mL' }
  const k = reagent.value?.kind
  return k === 'solid' ? { value: 0.1, unit: 'g' } : k === 'gas' ? { value: 10, unit: 'mL' } : { value: 1, unit: 'mL' }
})
const drop: Amount = { value: 1, unit: 'drop' }
let holding = 0
function hold(a: Amount) {
  stopHold()
  const step = () => { if (once(a)) added.value += a.unit === 'drop' ? 0.05 : a.value; else stopHold() }
  step()
  holding = window.setInterval(step, 160)
}
function stopHold() { if (holding) { window.clearInterval(holding); holding = 0 } }
onBeforeUnmount(stopHold)
// the number is what is typed first: Enter then confirms
onMounted(() => { void nextTick(() => { field.value?.focus(); field.value?.select() }) })
const addedText = computed(() => (portion.value.unit === 'g' ? qty(added.value, 'g', 1) : qty(added.value, 'mL', 2)))
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="close">
    <form v-dialog="close" class="dialog amount" role="dialog" :aria-label="title" data-ui="chem-amount" @submit.prevent="confirm">
      <div class="dialog-header"><span class="ttl">{{ title }}</span><span class="spacer" /><button type="button" class="btn icon ghost" :title="tl('关闭')" :aria-label="tl('关闭')" @click="close"><Icon name="close" /></button></div>
      <div class="dialog-body">
        <p class="where"><Icon name="arrowRight" :size="14" /><b>{{ target }}</b><span class="num muted">{{ status }}</span><span v-if="from" class="num muted src">{{ sourceStatus }}</span></p>
        <div class="segmented modes" role="tablist">
          <button type="button" role="tab" :class="{ on: !hand }" :aria-selected="!hand" data-ui="chem-amount-exact" @click="hand = false">{{ tl('定量') }}</button>
          <button type="button" role="tab" :class="{ on: hand }" :aria-selected="hand" data-ui="chem-amount-hand" @click="hand = true">{{ tap ? tl('手动滴加') : tl('真实倾倒') }}</button>
        </div>
        <div v-if="!hand" class="exact">
          <div class="line">
            <input ref="field" v-model="text" class="field num" inputmode="decimal" autocomplete="off" :disabled="all || filter" :class="{ invalid: !valid }" :aria-label="tl('数量')" data-ui="chem-amount-value" autofocus />
            <select v-model="unit" class="field" :disabled="all || filter" :aria-label="tl('单位')" data-ui="chem-amount-unit"><option v-for="u in units" :key="u" :value="u">{{ unitLabel(u) }}</option></select>
          </div>
          <label v-if="spec.mode === 'pour' && !tap" class="check"><input v-model="all" type="checkbox" :disabled="filter" data-ui="chem-amount-all" />{{ tl('全部') }}</label>
          <label v-if="canFilter" class="check"><input v-model="filter" type="checkbox" />{{ tl('经漏斗过滤') }}</label>
        </div>
        <div v-else class="byhand">
          <button type="button" class="btn lg tonal holdb" data-ui="chem-amount-hold" @pointerdown.prevent="hold(portion)" @pointerup="stopHold" @pointerleave="stopHold" @pointercancel="stopHold" @keydown.space.prevent="hold(portion)" @keyup.space="stopHold">{{ tap ? tl('按住滴加') : tl('按住倾倒') }}</button>
          <button v-if="tap || reagent?.kind === 'solution' || reagent?.kind === 'liquid'" type="button" class="btn lg" data-ui="chem-amount-drop" @click="once(drop) && (added += 0.05)">{{ tl('1 滴') }}</button>
          <span class="num total" aria-live="polite">{{ tl('已加 {0}', [addedText]) }}</span>
        </div>
      </div>
      <div class="dialog-footer">
        <button v-if="hand" type="button" class="btn primary" data-ui="chem-amount-done" @click="close">{{ tl('完成') }}</button>
        <template v-else>
          <button type="button" class="btn" @click="close">{{ tl('取消') }}</button>
          <button type="submit" class="btn primary" :disabled="!valid" data-ui="chem-amount-ok">{{ spec.mode === 'add' ? tl('加入') : tap ? tl('滴加') : tl('倒入') }}</button>
        </template>
      </div>
    </form>
  </div>
</template>

<style scoped>
.amount { width: min(400px, calc(100vw - 24px)); }
.ttl { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.where { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; margin: 0 0 var(--space-3); color: var(--text-2); }
.where b { color: var(--text); font-weight: var(--weight-strong); }
.src::before { content: '← '; }
.modes { display: flex; margin-bottom: var(--space-3); }
.modes button { flex: 1 1 0; justify-content: center; }
.line { display: flex; gap: var(--space-2); }
.line input { flex: 1 1 auto; height: var(--control-lg); font-size: var(--type-subtitle); }
.line select { flex: 0 0 96px; height: var(--control-lg); }
.exact { display: flex; flex-direction: column; gap: var(--space-2); }
.byhand { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); }
.holdb { flex: 1 1 140px; justify-content: center; touch-action: none; }
.total { flex: 1 1 100%; color: var(--text-2); }
</style>
