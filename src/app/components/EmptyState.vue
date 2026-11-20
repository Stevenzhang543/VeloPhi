<script setup lang="ts">
/**
 * A finished empty state (26.64, D252 "状态做全", D257): a title, one line, and one drawing. The drawing is the
 * `art` slot — a decoration computed by the engine goes there (the chemistry bench will put its slowly turning
 * wireframe molecule in it); until a page has one, a large line icon in the panel's colour stands in. Empty-state
 * drawings are one of the three places a panel's identity colour may appear.
 *
 * Props: `title`, `line` (one short phrase: what will be here), `icon` (the stand-in drawing), `tone` (the panel).
 * Slots: `art` (the decoration), default (at most one action, when there is something to do about the emptiness).
 */
import type { PanelTone } from '../panels'
import Icon from './Icon.vue'

const props = withDefaults(defineProps<{ title: string; line?: string; icon?: string; tone?: PanelTone | null }>(), { line: '', icon: 'info', tone: null })
</script>

<template>
  <div class="empty-state es" :class="props.tone ? `panel-${props.tone}` : ''">
    <div class="empty-art art" aria-hidden="true"><slot name="art"><Icon :name="props.icon" :size="72" /></slot></div>
    <h2 class="empty-title">{{ props.title }}</h2>
    <p v-if="props.line" class="line">{{ props.line }}</p>
    <i class="tick-rule" aria-hidden="true" />
    <slot />
  </div>
</template>

<style scoped>
.es { justify-content: center; height: 100%; min-height: 240px; gap: var(--space-2); padding: var(--space-8) var(--space-4); }
.art { display: grid; place-items: center; min-height: 96px; margin-bottom: var(--space-2); }
/* the stand-in drawing is three times the grid: its stroke is thinned to stay a line */
.art :deep(.icon path) { stroke-width: 0.6; }
.line { margin: 0; max-width: 46ch; color: var(--text-2); }
.tick-rule { width: 168px; margin-top: var(--space-3); }
</style>
