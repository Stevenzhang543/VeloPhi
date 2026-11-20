<script setup lang="ts">
/**
 * Line icon (24 × 24 grid, stroke = currentColor); paths live in ../icons. 26.64 (D258): one stroke for the whole set —
 * 1.5 px on the grid (token --stroke-icon), round caps and joins.
 */
import { UI_ICONS } from '../icons/paths'
import { EDITOR_ICONS } from '../icons/editorPaths'

const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 16 })
const P: Record<string, string> = { ...UI_ICONS, ...EDITOR_ICONS }
const filled = new Set(['play', 'stop'])
const heavy = new Set(['more'])
</script>

<template>
  <svg :width="props.size" :height="props.size" viewBox="0 0 24 24" aria-hidden="true" class="icon">
    <path :d="P[props.name] ?? P.info" :fill="filled.has(props.name) ? 'currentColor' : 'none'" stroke="currentColor" :class="{ heavy: heavy.has(props.name) }" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
</template>

<style scoped>
.icon { flex: 0 0 auto; display: block; }
.icon path { stroke-width: var(--stroke-icon); }
.icon path.heavy { stroke-width: 3; }
</style>
