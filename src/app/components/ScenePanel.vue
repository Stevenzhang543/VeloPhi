<script setup lang="ts">
/**
 * The inspector with nothing selected (26.65, D292): the scene itself — the template's parameters first (when the
 * scene came from a template), then gravity, duration, step and accuracy. It replaces the 对象 / 场景 sub-tabs of
 * 26.64 and the two sentences that asked the user to select something.
 */
import TemplateParams from './TemplateParams.vue'
import SettingsPanel from './SettingsPanel.vue'
</script>

<template>
  <div class="scene-panel">
    <TemplateParams />
    <SettingsPanel />
  </div>
</template>

<style scoped>
.scene-panel { display: flex; flex-direction: column; gap: var(--space-5); }
</style>
