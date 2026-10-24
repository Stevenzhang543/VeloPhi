<script setup lang="ts">
/** About dialog: the shared about content (version, verifiability, shortcuts, licenses). */
import { state } from '../store'
import AboutContent from './AboutContent.vue'
import Icon from './Icon.vue'

function openSettings() { state.showAbout = false; state.page = 'settings' }
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="state.showAbout = false">
    <div class="dialog about-dialog" role="dialog" aria-label="关于 Verity">
      <div class="dialog-header">关于 Verity<span class="spacer" /><button class="btn icon ghost" title="关闭" @click="state.showAbout = false"><Icon name="close" /></button></div>
      <div class="dialog-body"><AboutContent /></div>
      <div class="dialog-footer"><button class="btn ghost" @click="openSettings"><Icon name="settings" :size="14" />打开设置</button><span class="spacer" /><button class="btn primary" @click="state.showAbout = false">好</button></div>
    </div>
  </div>
</template>

<style scoped>
.about-dialog { width: min(720px, calc(100vw - 48px)); }
</style>
