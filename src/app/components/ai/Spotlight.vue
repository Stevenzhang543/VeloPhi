<script setup lang="ts">
/**
 * Copilot's "show me where" (26.59, D168): a ring around the control and a note beside it. It does not block
 * anything — clicking the control (or anywhere) is the user's own action; the ring follows layout changes and goes
 * away after a click on the control, the note's button, Escape, or 15 s.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { tl } from '../../../i18n'
import { spotlight, clearSpotlight } from '../../spotlight'

const rect = ref<DOMRect | null>(null)
let timer: ReturnType<typeof setTimeout> | null = null
let raf = 0
function measure() {
  const el = spotlight.selector ? (document.querySelector(spotlight.selector) as HTMLElement | null) : null
  rect.value = el ? el.getBoundingClientRect() : null
  if (spotlight.selector) raf = requestAnimationFrame(measure)
}
function onClick(e: MouseEvent) {
  const el = spotlight.selector ? document.querySelector(spotlight.selector) : null
  if (el && e.target instanceof Node && el.contains(e.target)) clearSpotlight()
}
function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && spotlight.selector) clearSpotlight() }
watch(() => spotlight.seq, () => {
  cancelAnimationFrame(raf)
  if (timer) clearTimeout(timer)
  if (!spotlight.selector) { rect.value = null; return }
  measure()
  timer = setTimeout(clearSpotlight, 15000)
}, { immediate: true })
watch(() => spotlight.selector, s => { if (!s) { cancelAnimationFrame(raf); rect.value = null } })
onMounted(() => { window.addEventListener('click', onClick, true); window.addEventListener('keydown', onKey) })
onBeforeUnmount(() => { cancelAnimationFrame(raf); if (timer) clearTimeout(timer); window.removeEventListener('click', onClick, true); window.removeEventListener('keydown', onKey) })
const note = computed(() => {
  const r = rect.value
  if (!r) return {}
  const w = 300, vw = window.innerWidth, vh = window.innerHeight
  const left = Math.max(12, Math.min(vw - w - 12, r.left + r.width / 2 - w / 2))
  return r.bottom + 130 < vh ? { left: `${left}px`, top: `${r.bottom + 12}px` } : { left: `${left}px`, top: `${Math.max(12, r.top - 120)}px` }
})
</script>

<template>
  <div v-if="rect" class="spot" aria-live="polite">
    <div class="ring" :style="{ left: `${rect.left - 5}px`, top: `${rect.top - 5}px`, width: `${rect.width + 10}px`, height: `${rect.height + 10}px` }" />
    <div class="note glass-float" :style="note" role="status">
      <b>{{ spotlight.title }}</b>
      <p>{{ spotlight.text }}</p>
      <button type="button" class="btn small" @click="clearSpotlight">{{ tl('知道了') }}</button>
    </div>
  </div>
</template>

<style scoped>
.spot { position: fixed; inset: 0; pointer-events: none; z-index: 880; }
.ring { position: fixed; border-radius: 12px; outline: 3px solid var(--accent); box-shadow: 0 0 0 6px var(--accent-soft), 0 0 24px var(--accent-soft); animation: ring 1.6s ease-in-out infinite; }
.note { position: fixed; width: 300px; padding: 10px 12px; border-radius: 14px; pointer-events: auto; line-height: 1.5; }
.note b { display: block; margin-bottom: 2px; }
.note p { margin: 0 0 8px; color: var(--text-2); font-size: var(--type-small); }
@keyframes ring { 50% { box-shadow: 0 0 0 10px var(--accent-soft), 0 0 28px var(--accent-soft); } }
@media (prefers-reduced-motion: reduce) { .ring { animation: none; } }
</style>
