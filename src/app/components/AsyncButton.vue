<script setup lang="ts">
/**
 * A button for work that takes a while (26.59, D157; glass handbook §02, §07): pressed feedback at once, repeat
 * clicks blocked from the first moment (`aria-busy`), a progress dot only after 300 ms (short work does not
 * flicker), the label kept so the width does not jump, a short "done" mark after real success, and the failure left
 * to the caller to explain next to it.
 */
import { onBeforeUnmount, ref, watch } from 'vue'
import Icon from './Icon.vue'

const props = withDefaults(defineProps<{ busy?: boolean; primary?: boolean; small?: boolean; icon?: string; disabled?: boolean; done?: number; title?: string }>(), { busy: false, primary: false, small: false, disabled: false, done: 0 })
defineEmits<{ click: [MouseEvent] }>()

const showSpinner = ref(false)
const showDone = ref(false)
let spinTimer: ReturnType<typeof setTimeout> | null = null
let doneTimer: ReturnType<typeof setTimeout> | null = null

watch(() => props.busy, b => {
  if (spinTimer) clearTimeout(spinTimer)
  if (b) { showDone.value = false; spinTimer = setTimeout(() => { showSpinner.value = true }, 300) }
  else showSpinner.value = false
}, { immediate: true })
// `done` is a counter the caller increments after a confirmed success
watch(() => props.done, (n, old) => {
  if (!n || n === old) return
  showDone.value = true
  if (doneTimer) clearTimeout(doneTimer)
  doneTimer = setTimeout(() => { showDone.value = false }, 1200)
})
onBeforeUnmount(() => { if (spinTimer) clearTimeout(spinTimer); if (doneTimer) clearTimeout(doneTimer) })
</script>

<template>
  <button type="button" class="btn async" :class="{ primary, small, busy, done: showDone }" :aria-busy="busy || undefined" :disabled="disabled" :title="title" @click="!busy && $emit('click', $event)">
    <span class="lead" aria-hidden="true">
      <span v-if="showSpinner" class="spin" />
      <Icon v-else-if="showDone" name="check2" :size="14" />
      <Icon v-else-if="icon" :name="icon" :size="14" />
    </span>
    <span class="label"><slot /></span>
  </button>
</template>

<style scoped>
.async { gap: 6px; }
.async.busy { cursor: progress; }
.lead { display: inline-flex; width: 14px; height: 14px; align-items: center; justify-content: center; }
.lead:empty { display: none; }
.spin { width: 12px; height: 12px; border-radius: 50%; border: 2px solid currentColor; border-right-color: transparent; animation: spin 0.8s linear infinite; }
.done .lead { color: var(--success); }
.primary.done .lead { color: inherit; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spin { animation-duration: 2.4s; } }
</style>
