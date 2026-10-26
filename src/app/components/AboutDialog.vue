<script setup lang="ts">
/** About dialog: the shared about content (version, verifiability, shortcuts, licenses). */
import { tl } from '../../i18n'
import { state } from '../store'
import AboutContent from './AboutContent.vue'
import Icon from './Icon.vue'

function openSettings() { state.showAbout = false; state.page = 'settings' }
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="state.showAbout = false">
    <div class="dialog about-dialog" role="dialog" :aria-label="tl('关于 VeloPhi')">
      <div class="dialog-header">{{ tl('关于 VeloPhi') }}<span class="spacer" /><button class="btn icon ghost" :title="tl('关闭')" @click="state.showAbout = false"><Icon name="close" /></button></div>
      <div class="dialog-body"><AboutContent /></div>
      <div class="dialog-footer"><button class="btn ghost" @click="openSettings"><Icon name="settings" :size="14" />{{ tl('打开设置') }}</button><span class="spacer" /><button class="btn primary" @click="state.showAbout = false">{{ tl('好') }}</button></div>
    </div>
  </div>
</template>

<style scoped>
.about-dialog { width: min(720px, calc(100vw - 48px)); }
</style>
