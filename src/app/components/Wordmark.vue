<script setup lang="ts">
/**
 * The VeloΦ wordmark (manual 26.52, D53): "Velo" in the text colour and Φ, the visual symbol of the product, in the
 * amber of the highlighted strobe position of the mark. The accessible name is the plain spelling VeloPhi.
 */
withDefaults(defineProps<{ size?: number }>(), { size: 16 })
</script>

<template>
  <span class="wordmark" :style="{ fontSize: `${size}px` }" aria-label="VeloPhi" role="img"><span aria-hidden="true">Velo</span><span class="phi" aria-hidden="true">Φ</span></span>
</template>

<style scoped>
.wordmark { font-weight: 700; letter-spacing: -0.01em; white-space: nowrap; display: inline-flex; align-items: baseline; }
.phi { margin-left: 0.04em; font-weight: 650; color: #f59e0b; background: linear-gradient(180deg, #fcd34d, #f59e0b 70%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
</style>
