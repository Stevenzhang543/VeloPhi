<script setup lang="ts">
/**
 * Numeric input bound to an SI value. `unit` is the SI unit of the value ('m', 'kg', 'rad', 'm/s²' …): the field
 * shows and accepts the value in the display unit chosen in the settings (cm, g, ° …) and the parent always
 * receives SI. Units that are not SI keys ('μs', '°' for a value already in degrees) are shown as a plain label;
 * `label` overrides the shown unit text, `scale` multiplies an unconverted value for display (legacy).
 * Shows full precision while editing, validates on commit (Enter / blur), and emits only finite values inside
 * [min, max] (SI). Arrow keys step by `step` (SI; default: a tenth of the shown magnitude, 1° for angles).
 * Continuous adjustment (D47): drag the unit label (or the grip) left and right — Shift for fine, Ctrl for coarse
 * — or turn the mouse wheel over the focused field. Values are never rounded to the step.
 */
import { tl } from '../../i18n'
import { computed, ref, watch } from 'vue'
import { kindOf } from '../../units/units'
import { fromDisp, toDisp, unitLabel } from '../settings'
import { beginEditGesture, endEditGesture } from '../store'

const props = withDefaults(defineProps<{ modelValue: number; unit?: string; label?: string; min?: number; max?: number; scale?: number; step?: number; disabled?: boolean; width?: string }>(), { unit: '', scale: 1, disabled: false, width: '100%' })
const emit = defineEmits<{ (e: 'update:modelValue', v: number): void }>()

/** The unit converts through the settings (it is an SI unit key). */
const converts = computed(() => !!props.unit && kindOf(props.unit) !== null)
const shownLabel = computed(() => props.label ?? (converts.value ? unitLabel(props.unit) : props.unit))
const toShown = (si: number) => (converts.value ? toDisp(si, props.unit) : si * props.scale)
const fromShown = (d: number) => (converts.value ? fromDisp(d, props.unit) : d / props.scale)

/** Strip float noise of the unit conversion (30 cm must not become 0.30000000000000004 m). */
const clean = (v: number) => (v === 0 ? 0 : Number(v.toPrecision(14)))
const shown = (si: number) => {
  const d = toShown(si)
  return Number.isFinite(d) ? String(Number(d.toPrecision(12))) : ''
}
const text = ref(shown(props.modelValue))
const invalid = ref(false)
const focused = ref(false)
watch(() => [props.modelValue, shownLabel.value], () => { if (!focused.value) { text.value = shown(props.modelValue); invalid.value = false } })

const bound = (si: number) => String(Number(toShown(si).toPrecision(6)))
const message = computed(() => {
  if (!invalid.value) return ''
  const u = shownLabel.value ? ` ${shownLabel.value}` : ''
  if (props.min !== undefined && props.max !== undefined) return tl('应在 {0} … {1}{2} 之间', [bound(props.min), bound(props.max), u])
  if (props.min !== undefined) return tl('应 ≥ {0}{1}', [bound(props.min), u])
  if (props.max !== undefined) return tl('应 ≤ {0}{1}', [bound(props.max), u])
  return tl('请输入数值')
})

function parse(s: string): number | null {
  // A decimal comma (German style, 26.51) is accepted like a point
  const t = s.trim().replace(/[，,]/g, '.').replace(/−/g, '-').replace(/×10\^?/g, 'e').replace(/[°\s]+$/, '')
  if (t === '') return null
  const v = Number(t)
  return Number.isFinite(v) ? v : null
}

function commit() {
  const v = parse(text.value)
  if (v === null) { invalid.value = true; return }
  const si = clean(fromShown(v))
  if ((props.min !== undefined && si < props.min - 1e-15) || (props.max !== undefined && si > props.max + 1e-15)) { invalid.value = true; return }
  invalid.value = false
  if (si !== props.modelValue) emit('update:modelValue', si)
  text.value = shown(si)
}

/** Arrow-key step in shown units. */
function shownStep(current: number): number {
  if (props.step !== undefined) return converts.value ? Math.abs(toDisp(props.step, props.unit)) : props.step * props.scale
  if (shownLabel.value === '°') return 1
  const a = Math.abs(current)
  return a > 0 ? Math.pow(10, Math.floor(Math.log10(a)) - 1) : 0.1
}

/** Clamp a shown value into [min, max] (converted to shown units). */
function clampShown(d: number): number {
  let v = d
  if (props.min !== undefined) { const lo = toShown(props.min); v = Math.max(v, Math.min(lo, toShown(props.max ?? Infinity))) }
  if (props.max !== undefined) { const hi = toShown(props.max); v = Math.min(v, Math.max(hi, toShown(props.min ?? -Infinity))) }
  return v
}

/** Set a shown value continuously (scrubbing, wheel): clamp, show, emit. */
function setShown(d: number) {
  const v = clampShown(Number(d.toPrecision(12)))
  const si = clean(fromShown(v))
  text.value = shown(si)
  invalid.value = false
  if (si !== props.modelValue) emit('update:modelValue', si)
}

// ---- Scrubbing: drag the label horizontally ----
let scrub: { x: number; v0: number; step: number; id: number } | null = null
const scrubbing = ref(false)
function scrubDown(e: PointerEvent) {
  if (props.disabled || e.button !== 0) return
  e.preventDefault()
  const v0 = parse(text.value) ?? toShown(props.modelValue)
  scrub = { x: e.clientX, v0, step: shownStep(v0), id: e.pointerId }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  scrubbing.value = true
  beginEditGesture()
}
function scrubMove(e: PointerEvent) {
  if (!scrub || e.pointerId !== scrub.id) return
  const k = e.shiftKey ? 0.1 : e.ctrlKey || e.metaKey ? 10 : 1
  // A tenth of a step per pixel: smooth, and one step for a short flick of 10 px
  setShown(scrub.v0 + ((e.clientX - scrub.x) * scrub.step * k) / 10)
}
function scrubUp(e: PointerEvent) {
  if (!scrub || e.pointerId !== scrub.id) return
  scrub = null
  scrubbing.value = false
  endEditGesture()
}

function wheel(e: WheelEvent) {
  if (!focused.value || props.disabled) return
  e.preventDefault()
  const v = parse(text.value) ?? toShown(props.modelValue)
  const k = e.shiftKey ? 0.1 : e.ctrlKey || e.metaKey ? 10 : 1
  setShown(v + (e.deltaY < 0 ? 1 : -1) * shownStep(v) * k)
}

function key(e: KeyboardEvent) {
  if (e.key === 'Enter') { commit(); (e.target as HTMLInputElement).blur() }
  if (e.key === 'Escape') { text.value = shown(props.modelValue); invalid.value = false; (e.target as HTMLInputElement).blur() }
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault()
    const v = parse(text.value) ?? toShown(props.modelValue)
    const step = (e.shiftKey ? 10 : e.altKey ? 0.1 : 1) * shownStep(v)
    text.value = String(Number((v + (e.key === 'ArrowUp' ? step : -step)).toPrecision(12)))
    commit()
  }
}
</script>

<template>
  <span class="numfield" :class="{ 'has-unit': !!shownLabel }" :style="{ width }" :title="message">
    <input class="field mono" :class="{ invalid }" :value="text" :disabled="disabled" inputmode="decimal" :aria-invalid="invalid"
      @input="text = ($event.target as HTMLInputElement).value" @focus="focused = true" @blur="focused = false; commit()" @keydown="key" @wheel="wheel" />
    <span class="scrub" :class="{ on: scrubbing, bare: !shownLabel }" :title="tl('左右拖动连续调节（Shift 细调，Ctrl 粗调）')"
      @pointerdown="scrubDown" @pointermove="scrubMove" @pointerup="scrubUp" @pointercancel="scrubUp">{{ shownLabel || '⇔' }}</span>
    <span v-if="invalid && message" class="msg">{{ message }}</span>
  </span>
</template>

<style scoped>
.numfield { display: inline-flex; align-items: center; position: relative; min-width: 0; }
.numfield input { width: 100%; text-align: right; }
.numfield.has-unit input { padding-right: 52px; }
.numfield:not(.has-unit) input { padding-right: 22px; }
.scrub { position: absolute; right: 2px; top: 2px; bottom: 2px; display: flex; align-items: center; justify-content: flex-end; padding: 0 6px; font-size: var(--type-tiny); color: var(--text-3); font-family: var(--font-mono); max-width: 50px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: ew-resize; border-radius: 6px; user-select: none; touch-action: none; }
.scrub:hover, .scrub.on { color: var(--accent); background: var(--accent-soft); }
.scrub.bare { opacity: 0.6; }
.msg { position: absolute; right: 0; top: calc(100% + 2px); z-index: 20; font-size: var(--type-tiny); color: var(--on-accent); background: var(--danger); padding: 2px 7px; border-radius: 6px; white-space: nowrap; pointer-events: none; box-shadow: var(--shadow); }
</style>
