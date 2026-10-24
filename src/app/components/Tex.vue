<script setup lang="ts">
/** KaTeX formula (rendered to HTML, no network). Errors show the source instead of failing. */
import { computed } from 'vue'
import katex from 'katex'

const props = withDefaults(defineProps<{ tex: string; display?: boolean }>(), { display: false })
const html = computed(() => {
  try {
    return katex.renderToString(props.tex, { displayMode: props.display, throwOnError: false, strict: 'ignore', output: 'html' })
  } catch {
    return props.tex
  }
})
</script>

<template>
  <span class="tex" :class="{ block: display }" v-html="html" />
</template>

<style scoped>
.tex.block { display: block; overflow-x: auto; overflow-y: hidden; padding: 2px 0; }
</style>
