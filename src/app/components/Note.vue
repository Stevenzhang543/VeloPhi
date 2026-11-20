<script setup lang="ts">
/**
 * An explanation that is there when it is wanted (26.65, D296). The inspector used to show 26 standing sentences
 * under its fields — PhET's interviews found students read one to three words at a time and that standing help steers
 * them to the step it describes — so the text now waits behind a small "说明" line and opens in place. It remembers
 * nothing; a page that needs the explanation open says so with `open`.
 */
import { tl } from '../../i18n'
import Icon from './Icon.vue'

withDefaults(defineProps<{ open?: boolean }>(), { open: false })
</script>

<template>
  <details class="note-d" :open="open">
    <summary><Icon name="info" :size="13" /><span>{{ tl('解释') }}</span></summary>
    <div class="note-body"><slot /></div>
  </details>
</template>

<style scoped>
.note-d { margin: 2px 0 var(--space-2); font-size: var(--type-small); color: var(--text-2); }
.note-d summary { display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 4px; margin-left: -4px; border-radius: var(--radius-row); cursor: pointer; list-style: none; color: var(--text-2); user-select: none; }
.note-d summary::-webkit-details-marker { display: none; }
.note-d summary:hover { background: var(--hover); color: var(--text); }
.note-d summary:focus-visible { outline: 2px solid var(--ring); outline-offset: 1px; }
.note-d[open] summary { color: var(--text); }
.note-body { padding: 2px 0 4px; line-height: var(--line-para); }
</style>
