<script setup lang="ts">
/**
 * A parent check box over a group of check boxes (26.57, D120; manual §7.2, WAI-ARIA APG checkbox pattern S11):
 * checked when every child is on, mixed (indeterminate) when some are, unchecked when none. Activating the parent
 * turns every child on, or off when all were on. It changes visibility only; model conditions that make results
 * stale use their own controls with their own explanation.
 */
import { computed, ref, watchEffect } from 'vue'

const props = defineProps<{ label: string; children: Array<{ key: string; on: boolean; disabled?: boolean }>; tip?: string }>()
const emit = defineEmits<{ (e: 'set', keys: string[], on: boolean): void }>()

const active = computed(() => props.children.filter(c => !c.disabled))
const onCount = computed(() => active.value.filter(c => c.on).length)
/** 'true' | 'false' | 'mixed' (aria-checked). */
const state = computed(() => (onCount.value === 0 ? 'false' : onCount.value === active.value.length ? 'true' : 'mixed'))
const box = ref<HTMLInputElement | null>(null)
watchEffect(() => { if (box.value) { box.value.indeterminate = state.value === 'mixed'; box.value.checked = state.value === 'true' } })

function toggle() { emit('set', active.value.map(c => c.key), state.value !== 'true') }
</script>

<template>
  <label class="tri" :title="tip">
    <input ref="box" type="checkbox" :aria-checked="state" :aria-label="label" @click.prevent="toggle" />
    <span class="tri-label">{{ label }}</span>
    <span class="tri-count tiny muted">{{ onCount }}/{{ active.length }}</span>
  </label>
</template>

<style scoped>
.tri { display: flex; align-items: center; gap: 8px; padding: 4px 10px 2px; cursor: pointer; font-size: var(--type-tiny); color: var(--text-3); font-weight: 600; }
.tri input { accent-color: var(--accent); width: 15px; height: 15px; margin: 0; }
.tri-label { flex: 1; }
.tri-count { font-weight: 400; }
</style>
