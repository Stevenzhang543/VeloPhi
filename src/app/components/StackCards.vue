<script setup lang="ts">
/**
 * A stack of cards that opens in place (26.57, D120; manual §7.3): steps, checks, formula families, records. Closed,
 * it shows the group name, the number of cards, the current step and one key value; open, the cards follow in their
 * order. The header is a real button with aria-expanded; closed content is inert (out of the tab order). Opening is
 * a short height change (0fr → 1fr) that keeps the reading position (scroll anchoring); a card the user closed is
 * not reopened by playback. Reduced motion opens it at once.
 */
import { ref, watch } from 'vue'

const props = withDefaults(defineProps<{ title: string; count?: number; summary?: string; tone?: '' | 'ok' | 'warn' | 'bad'; open?: boolean; id?: string }>(), { count: undefined, summary: '', tone: '', open: false, id: undefined })
const emit = defineEmits<{ (e: 'toggle', open: boolean): void }>()
const isOpen = ref(props.open)
/** The user decided: later changes of the default do not reopen or close it. */
let userSet = false
watch(() => props.open, v => { if (!userSet) isOpen.value = v })
function toggle() { userSet = true; isOpen.value = !isOpen.value; emit('toggle', isOpen.value) }
const bodyId = `stack-${Math.random().toString(36).slice(2, 9)}`
</script>

<template>
  <section class="stack" :class="[{ open: isOpen }, tone ? `t-${tone}` : '']" :data-stack="id">
    <button type="button" class="stack-head" :aria-expanded="isOpen" :aria-controls="bodyId" @click="toggle">
      <span class="chev" aria-hidden="true">▸</span>
      <span class="stack-title">{{ title }}</span>
      <span v-if="count !== undefined" class="stack-count tiny">{{ count }}</span>
      <span class="stack-summary small">{{ summary }}</span>
    </button>
    <div :id="bodyId" class="stack-body" :inert="!isOpen">
      <div class="stack-inner"><slot /></div>
    </div>
  </section>
</template>

<style scoped>
.stack { border-radius: var(--radius-group); background: var(--group); margin: 0 0 8px; overflow-anchor: auto; }
.stack-head { width: 100%; display: flex; align-items: center; gap: 8px; min-height: calc(34px * var(--zoom)); padding: 4px 10px; border: 0; background: transparent; cursor: pointer; text-align: left; border-radius: var(--radius-group); }
.stack-head:hover { background: var(--hover); }
.chev { display: inline-block; transition: transform var(--dur-2) var(--ease-out); color: var(--text-3); font-size: 11px; }
.open .chev { transform: rotate(90deg); }
.stack-title { font-weight: 600; }
.stack-count { background: var(--fill); border-radius: 999px; padding: 0 7px; color: var(--text-2); }
.stack-summary { flex: 1; min-width: 0; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; }
.t-ok .stack-summary { color: var(--success); }
.t-warn .stack-summary { color: var(--warning); }
.t-bad .stack-summary { color: var(--danger); }
.stack-body { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 220ms var(--ease-out); }
.open .stack-body { grid-template-rows: 1fr; }
.stack-inner { overflow: hidden; min-height: 0; }
.open .stack-inner { padding: 2px 10px 10px; }
@media (prefers-reduced-motion: reduce) { .stack-body, .chev { transition: none; } }
</style>
