<script lang="ts">
/**
 * KaTeX formula (rendered to HTML, no network). Errors show the source instead of failing.
 * Rendered HTML is memoised in a small LRU keyed by source and display mode, so re-showing the formula
 * panel, playback and tab switches reuse earlier renders instead of running KaTeX again.
 */
import katex from 'katex'

const LIMIT = 500
const memo = new Map<string, string>()

/** KaTeX HTML for a LaTeX source (memoised). */
export function renderTex(tex: string, display: boolean): string {
  const key = (display ? 'D|' : 'I|') + tex
  const hit = memo.get(key)
  if (hit !== undefined) {
    // Refresh recency: Map iterates in insertion order, the first key is the oldest
    memo.delete(key)
    memo.set(key, hit)
    return hit
  }
  let html: string
  try {
    html = katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: 'ignore', output: 'html' })
  } catch {
    html = tex.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
  }
  memo.set(key, html)
  if (memo.size > LIMIT) memo.delete(memo.keys().next().value!)
  return html
}
</script>

<script setup lang="ts">
/** Renders `tex` with KaTeX through the memoised renderTex; `display` selects display mode. */
import { computed } from 'vue'

const props = withDefaults(defineProps<{ tex: string; display?: boolean }>(), { display: false })
const html = computed(() => renderTex(props.tex, props.display))
</script>

<template>
  <span class="tex" :class="{ block: display }" v-html="html" />
</template>

<style scoped>
.tex.block { display: block; overflow-x: auto; overflow-y: hidden; padding: 2px 0; }
</style>
