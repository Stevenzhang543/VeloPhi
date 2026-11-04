<script setup lang="ts">
/**
 * Bottom tab bar of the phone layout (26.60, D206): 工具 · 属性 · ▶ · 分析 · AI. The middle button runs the scene when
 * it changed (or has no result yet) and otherwise plays / pauses; the others open their sheet (a second tap closes it).
 */
import { computed } from 'vue'
import { tl } from '../../i18n'
import { state, runSimulation, play, pause } from '../store'
import { settings } from '../settings'
import { shell, openSheet } from '../layout'
import type { SheetId } from '../layout'
import Icon from './Icon.vue'

const needsRun = computed(() => state.stale || !state.recording)
function main() {
  if (needsRun.value) { void runSimulation(); return }
  if (state.playing) pause(); else play()
}
const ITEMS = computed((): Array<{ id: SheetId; label: string; icon: string }> => [
  { id: 'tools', label: tl('工具'), icon: 'shapes' },
  { id: 'inspect', label: tl('属性'), icon: 'inspect' },
  { id: 'analysis', label: tl('分析'), icon: 'formula' },
  ...(settings.ai.copilot ? [{ id: 'ai' as const, label: 'AI', icon: 'chat' }] : [])
])
const left = computed(() => ITEMS.value.slice(0, 2))
const right = computed(() => ITEMS.value.slice(2))
const attn = (id: SheetId) => shell.attention === id || (id === 'analysis' && shell.attention === 'problem')
</script>

<template>
  <nav class="pnav" :aria-label="tl('主要功能')">
    <button v-for="i in left" :key="i.id" type="button" class="pi" :data-ui="`sheet-${i.id}`" :class="{ on: shell.sheet === i.id, attn: attn(i.id) }" :aria-pressed="shell.sheet === i.id" @click="openSheet(i.id)"><Icon :name="i.icon" :size="21" /><span>{{ i.label }}</span></button>
    <button type="button" class="pi main" data-ui="run" :class="{ run: needsRun, busy: state.computing }" :aria-label="needsRun ? tl('运行仿真') : state.playing ? tl('暂停播放') : tl('播放')" @click="main"><span class="disc"><Icon :name="needsRun ? 'run' : state.playing ? 'pause' : 'play'" :size="22" /></span></button>
    <button v-for="i in right" :key="i.id" type="button" class="pi" :data-ui="`sheet-${i.id}`" :class="{ on: shell.sheet === i.id, attn: attn(i.id) }" :aria-pressed="shell.sheet === i.id" @click="openSheet(i.id)"><Icon :name="i.icon" :size="21" /><span>{{ i.label }}</span></button>
  </nav>
</template>

<style scoped>
.pnav { flex: 0 0 auto; display: flex; align-items: stretch; justify-content: space-around; gap: 2px; padding: 4px 6px calc(4px + env(safe-area-inset-bottom, 0px)); background: var(--pane); border-top: 0.5px solid var(--separator); position: relative; z-index: 40; }
.pi { position: relative; flex: 1 1 0; min-width: 0; min-height: 52px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; border: 0; background: none; color: var(--text-2); font: inherit; font-size: 11px; border-radius: 12px; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.pi.on { color: var(--accent); background: var(--accent-soft); }
.pi:active { transform: scale(0.96); }
.main { flex: 0 0 72px; }
.disc { width: 50px; height: 50px; border-radius: 50%; display: grid; place-items: center; background: var(--accent); color: var(--on-accent); box-shadow: 0 4px 14px color-mix(in srgb, var(--accent) 40%, transparent); margin-top: -14px; }
.main.busy .disc { animation: busy 1.4s ease-in-out infinite; }
@keyframes busy { 50% { box-shadow: 0 4px 22px color-mix(in srgb, var(--accent) 70%, transparent); } }
.attn::after { content: ''; position: absolute; top: 6px; right: calc(50% - 16px); width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }
@media (prefers-reduced-motion: reduce) { .main.busy .disc { animation: none; } }
</style>
