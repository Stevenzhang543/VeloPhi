<script setup lang="ts">
/**
 * The sidebar (26.60, D205): one column at the right with four tabs — 属性 (the selected object, or the scene's settings),
 * 分析 (formula cards, watch, prediction), 题目 (the open problem and the task) and AI (Copilot). It folds to a rail of
 * the four icons; its width is dragged at the left edge. In a narrow window it lies over the canvas. Panels stay mounted
 * once shown (hidden with content-visibility), so switching tabs is instant; hidden panels stop following playback.
 */
import { tl } from '../../i18n'
import { computed, defineAsyncComponent, inject, type Ref } from 'vue'
import { state } from '../store'
import { settings } from '../settings'
import { shell, narrow, showSideTab, tabOf } from '../layout'
import type { SideTab } from '../layout'
import { PAGE_ACTIVE } from '../live'
import Icon from './Icon.vue'
import Inspector from './Inspector.vue'
import SettingsPanel from './SettingsPanel.vue'
import FormulaPanel from './FormulaPanel.vue'
import WatchPanel from './WatchPanel.vue'
import PredictionPanel from './PredictionPanel.vue'
import ProblemPanel from './ProblemPanel.vue'
import TaskPanel from './task/TaskPanel.vue'
const CopilotPanel = defineAsyncComponent(() => import('./ai/CopilotPanel.vue'))

const pageOn = inject<Ref<boolean>>(PAGE_ACTIVE, computed(() => true))
const TABS = computed((): Array<{ id: SideTab; label: string; icon: string; tip: string }> => [
  { id: 'inspect', label: tl('属性'), icon: 'inspect', tip: tl('所选物体的参数；未选择时是场景设置（重力、时长、计算方式）') },
  { id: 'analysis', label: tl('分析'), icon: 'formula', tip: tl('公式对照、监视读数、预测') },
  { id: 'problem', label: tl('题目'), icon: 'problem', tip: tl('作答与揭晓、任务（已知、所求与核对）') },
  ...(settings.ai.copilot ? [{ id: 'ai' as const, label: 'AI', icon: 'chat', tip: tl('Copilot：讲题、生成仿真场景、替你操作') }] : [])
])
const active = computed<SideTab>(() => (state.showCopilot ? 'ai' : shell.sideTab === 'ai' ? tabOf(state.rightTab) : shell.sideTab))
const SUB: Record<Exclude<SideTab, 'ai'>, Array<{ id: typeof state.rightTab; label: string; ui: string }>> = {
  inspect: [{ id: 'inspect', label: '对象', ui: 'tab-inspect' }, { id: 'settings', label: '场景', ui: 'tab-settings' }],
  analysis: [{ id: 'formula', label: '公式', ui: 'sub-formula' }, { id: 'watch', label: '监视', ui: 'sub-watch' }, { id: 'predict', label: '预测', ui: 'sub-predict' }],
  problem: [{ id: 'problem', label: '题目', ui: 'tab-problem' }, { id: 'task', label: '任务', ui: 'tab-task' }]
}
const subs = computed(() => (active.value === 'ai' ? [] : SUB[active.value].filter(s => s.id !== 'problem' || !!state.problem)))
const tabClass = (on: boolean) => (on ? 'is-on' : 'is-off')
const on = (rt: typeof state.rightTab) => active.value !== 'ai' && state.rightTab === rt
/** Panels that follow playback only while shown. */
const live = (rt: typeof state.rightTab) => pageOn.value && shell.sideOpen && on(rt)

function pick(t: SideTab) {
  if (!shell.sideOpen) { showSideTab(t); return }
  showSideTab(t)
}

// Width: drag the left edge (300–720 px, remembered)
function dragWidth(e: PointerEvent) {
  const start = { x: e.clientX, w: shell.sideWidth }
  const move = (ev: PointerEvent) => { shell.sideWidth = Math.round(Math.max(300, Math.min(720, start.w - (ev.clientX - start.x)))) }
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
function nudgeWidth(e: KeyboardEvent) {
  if (e.key === 'ArrowLeft') shell.sideWidth = Math.min(720, shell.sideWidth + 20)
  else if (e.key === 'ArrowRight') shell.sideWidth = Math.max(300, shell.sideWidth - 20)
}
</script>

<template>
  <aside class="sidebar" :class="{ folded: !shell.sideOpen, overlay: narrow }" :style="shell.sideOpen ? { width: `${shell.sideWidth}px` } : undefined" :aria-label="tl('侧栏')">
    <!-- Folded: the four tabs as a rail -->
    <nav v-if="!shell.sideOpen" class="rail" :aria-label="tl('侧栏')">
      <button v-for="t in TABS" :key="t.id" class="rt" :data-ui="`tab-${t.id === 'inspect' ? 'inspect-rail' : t.id}`" :class="{ attn: shell.attention === t.id }" :title="t.tip" :aria-label="t.label" @click="pick(t.id)"><Icon :name="t.icon" :size="18" /><span>{{ t.label }}</span></button>
    </nav>
    <template v-else>
      <div v-if="!narrow" class="resize" role="separator" aria-orientation="vertical" :aria-label="tl('拖动调整侧栏宽度')" tabindex="0" @pointerdown.prevent="dragWidth" @keydown="nudgeWidth" />
      <header class="head">
        <div class="tabs" role="tablist" :aria-label="tl('侧栏')">
          <button v-for="t in TABS" :key="t.id" role="tab" :data-ui="t.id === 'analysis' ? 'tab-analysis' : t.id === 'ai' ? 'tab-ai' : t.id === 'problem' ? 'tab-problems' : 'tab-props'" :aria-selected="active === t.id" :class="{ on: active === t.id, attn: shell.attention === t.id && active !== t.id }" :title="t.tip" @click="pick(t.id)"><Icon :name="t.icon" :size="15" /><span>{{ t.label }}</span></button>
        </div>
        <button class="btn icon ghost fold" :title="tl('收起侧栏')" :aria-label="tl('收起侧栏')" @click="shell.sideOpen = false"><Icon name="sidebar" :size="15" /></button>
      </header>
      <div v-if="subs.length > 1" class="subtabs" role="tablist">
        <button v-for="s in subs" :key="s.id" role="tab" :data-ui="s.ui" :aria-selected="state.rightTab === s.id" :class="{ on: state.rightTab === s.id }" @click="state.rightTab = s.id">{{ tl(s.label) }}</button>
      </div>
      <div class="stack">
        <div class="panel" :class="tabClass(on('inspect'))" :inert="!on('inspect')"><Inspector /></div>
        <div class="panel" :class="tabClass(on('settings'))" :inert="!on('settings')"><SettingsPanel /></div>
        <div class="panel" :class="tabClass(on('formula'))" :inert="!on('formula')"><FormulaPanel :active="live('formula')" /></div>
        <div class="panel" :class="tabClass(on('watch'))" :inert="!on('watch')"><WatchPanel :active="live('watch')" /></div>
        <div class="panel" :class="tabClass(on('predict'))" :inert="!on('predict')"><PredictionPanel /></div>
        <div v-if="state.problem" class="panel" :class="tabClass(on('problem'))" :inert="!on('problem')"><ProblemPanel /></div>
        <div class="panel" :class="tabClass(on('task'))" :inert="!on('task')"><TaskPanel /></div>
        <div v-if="settings.ai.copilot && (state.showCopilot || shell.sideTab === 'ai')" class="panel ai" :class="tabClass(active === 'ai')" :inert="active !== 'ai'"><CopilotPanel /></div>
      </div>
    </template>
  </aside>
</template>

<style scoped>
.sidebar { position: relative; flex: 0 0 auto; min-width: 0; display: flex; flex-direction: column; border-radius: var(--radius-pane); background: var(--pane); box-shadow: var(--shadow); overflow: hidden; }
.sidebar.folded { width: 56px; background: transparent; box-shadow: none; overflow: visible; }
.sidebar.overlay:not(.folded) { position: absolute; right: 0; top: 0; bottom: 0; z-index: 20; max-width: calc(100vw - 24px); box-shadow: -10px 0 30px rgba(0, 0, 0, 0.2); }
.sidebar.overlay.folded { position: absolute; right: 0; top: 0; z-index: 20; }
.rail { display: flex; flex-direction: column; gap: 4px; padding: 6px 4px; border-radius: 16px; background: var(--pane); box-shadow: var(--shadow), 0 0 0 0.5px var(--separator); }
.rt { position: relative; display: flex; flex-direction: column; align-items: center; gap: 2px; width: 48px; padding: 6px 0 5px; border: 0; border-radius: 10px; background: none; color: var(--text-2); font: inherit; font-size: 10.5px; cursor: pointer; }
.rt:hover { background: var(--fill-strong); color: var(--text); }
.attn::after { content: ''; position: absolute; top: 5px; right: 7px; width: 7px; height: 7px; border-radius: 50%; background: var(--accent); animation: attn 1.4s ease-in-out infinite; }
@keyframes attn { 50% { opacity: 0.3; } }
.resize { position: absolute; left: 0; top: 0; bottom: 0; width: 8px; cursor: col-resize; z-index: 3; }
.resize:hover, .resize:focus-visible { background: color-mix(in srgb, var(--accent) 25%, transparent); outline: none; }
.head { display: flex; align-items: center; gap: 4px; padding: 8px 6px 4px 10px; }
.tabs { flex: 1; min-width: 0; display: flex; gap: 2px; padding: 2px; border-radius: 11px; background: var(--fill); }
.tabs button { position: relative; flex: 1 1 0; min-width: 0; display: inline-flex; align-items: center; justify-content: center; gap: 5px; height: 30px; border: 0; border-radius: 9px; background: none; color: var(--text-2); font: inherit; font-size: var(--type-small); cursor: pointer; white-space: nowrap; }
.tabs button span { overflow: hidden; text-overflow: ellipsis; }
.tabs button:hover { color: var(--text); }
.tabs button.on { background: var(--pane); color: var(--text); font-weight: 600; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12); }
.fold { flex: 0 0 auto; }
.subtabs { display: flex; gap: 2px; margin: 4px 12px 2px; border-bottom: 1px solid var(--separator); }
.subtabs button { flex: 1; border: 0; background: none; color: var(--text-2); font: inherit; font-size: var(--type-small); padding: 5px 4px 6px; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; }
.subtabs button:hover { color: var(--text); }
.subtabs button.on { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }
.stack { flex: 1; min-height: 0; position: relative; }
.panel { position: absolute; inset: 0; overflow: auto; padding: 6px 12px 12px; }
.panel.ai { padding: 4px 0 0; overflow: hidden; }
@container (max-width: 340px) { .tabs button span { display: none; } }
@media (max-width: 1280px) { .tabs button { gap: 3px; } }
@media (prefers-reduced-motion: reduce) { .attn::after { animation: none; } }
</style>
