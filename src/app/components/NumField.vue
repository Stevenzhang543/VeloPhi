<script setup lang="ts">
/**
 * Numeric input in SI units. Shows the value with full precision while editing, validates on commit
 * (Enter / blur), and emits only finite values inside [min, max]. `scale` converts the stored SI value
 * for display (e.g. rad ↔ ° with scale = 180/π).
 */
import { computed, ref, watch } from 'vue'

const props = withDefaults(defineProps<{ modelValue: number; unit?: string; min?: number; max?: number; scale?: number; step?: number; disabled?: boolean; width?: string }>(), { unit: '', scale: 1, step: 0.1, disabled: false, width: '100%' })
const emit = defineEmits<{ (e: 'update:modelValue', v: number): void }>()

const shown = (v: number) => {
  const d = v * props.scale
  return Number.isFinite(d) ? String(Number(d.toPrecision(12))) : ''
}
const text = ref(shown(props.modelValue))
const invalid = ref(false)
const focused = ref(false)
watch(() => props.modelValue, v => { if (!focused.value) { text.value = shown(v); invalid.value = false } })

const message = computed(() => {
  if (!invalid.value) return ''
  if (props.min !== undefined && props.max !== undefined) return `应在 ${props.min * props.scale} … ${props.max * props.scale} 之间`
  if (props.min !== undefined) return `应 ≥ ${props.min * props.scale}`
  if (props.max !== undefined) return `应 ≤ ${props.max * props.scale}`
  return '请输入数值'
})

function parse(s: string): number | null {
  const t = s.trim().replace(/，/g, '.').replace(/−/g, '-').replace(/×10\^?/g, 'e')
  if (t === '') return null
  const v = Number(t)
  return Number.isFinite(v) ? v : null
}

function commit() {
  const v = parse(text.value)
  if (v === null) { invalid.value = true; return }
  const si = v / props.scale
  if ((props.min !== undefined && si < props.min - 1e-15) || (props.max !== undefined && si > props.max + 1e-15)) { invalid.value = true; return }
  invalid.value = false
  if (si !== props.modelValue) emit('update:modelValue', si)
  text.value = shown(si)
}

function key(e: KeyboardEvent) {
  if (e.key === 'Enter') { commit(); (e.target as HTMLInputElement).blur() }
  if (e.key === 'Escape') { text.value = shown(props.modelValue); invalid.value = false; (e.target as HTMLInputElement).blur() }
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault()
    const v = parse(text.value) ?? props.modelValue * props.scale
    const step = (e.shiftKey ? 10 : e.altKey ? 0.1 : 1) * props.step
    text.value = String(Number((v + (e.key === 'ArrowUp' ? step : -step)).toPrecision(12)))
    commit()
  }
}
</script>

<template>
  <span class="numfield" :style="{ width }" :title="message">
    <input class="field mono" :class="{ invalid }" :value="text" :disabled="disabled" inputmode="decimal"
      @input="text = ($event.target as HTMLInputElement).value" @focus="focused = true" @blur="focused = false; commit()" @keydown="key" />
    <span v-if="unit" class="unit">{{ unit }}</span>
  </span>
</template>

<style scoped>
.numfield { display: inline-flex; align-items: center; position: relative; min-width: 0; }
.numfield input { width: 100%; padding-right: 44px; text-align: right; }
.unit { position: absolute; right: 8px; font-size: 11px; color: var(--text-3); pointer-events: none; font-family: var(--font-mono); }
</style>
