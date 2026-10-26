<script setup lang="ts">
/** Placeholder of the panels hidden while a problem is answered (26.52, D40): results appear after the reveal. */
import { tl } from '../../i18n'
import { state } from '../store'
import Icon from './Icon.vue'
</script>

<template>
  <div class="lock">
    <Icon name="problem" :size="22" />
    <div class="small">{{ tl('作答期间暂时隐藏') }}</div>
    <div class="tiny muted">{{ tl('揭晓答案后显示曲线、事件、读数与公式对照。') }}</div>
    <button class="btn small" @click="state.rightTab = 'problem'">{{ tl('回到题目') }}</button>
  </div>
</template>

<style scoped>
.lock { height: 100%; min-height: 120px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: var(--text-2); text-align: center; padding: 12px; }
</style>
