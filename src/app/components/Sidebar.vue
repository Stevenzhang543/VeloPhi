<script setup lang="ts">
/**
 * The sidebar (26.60, D205; 26.65, D292): one inspector at the right. Which view it shows — 属性, 分析, 题目, AI — is
 * chosen by the buttons at the end of the studio bar (TopBar.vue); the sidebar itself has no tab row. 属性 follows the
 * selection: the selected object, or with nothing selected the scene (template parameters, gravity, duration, step,
 * accuracy). 分析 and 题目 keep one row of plain text tabs (公式 / 监视 / 预测, 题目 / 任务). Closed, it takes no room
 * (26.64 folded it to a rail of icons, a second set of the bar's buttons). Its width is dragged at the left edge; in a
 * narrow window it lies over the canvas. Panels stay mounted once shown, so switching is instant; hidden panels stop
 * following playback.
 */
import { tl } from '../../i18n'
import { computed, defineAsyncComponent, inject, watch, type Ref } from 'vue'
import { state } from '../store'
import { settings } from '../settings'
import { shell, narrow, tabOf } from '../layout'
import type { SideTab } from '../layout'
import { PAGE_ACTIVE } from '../live'
import Inspector from './Inspector.vue'
import ScenePanel from './ScenePanel.vue'
import FormulaPanel from './FormulaPanel.vue'
import WatchPanel from './WatchPanel.vue'
import PredictionPanel from './PredictionPanel.vue'
import ProblemPanel from './ProblemPanel.vue'
import TaskPanel from './task/TaskPanel.vue'
const CopilotPanel = defineAsyncComponent(() => import('./ai/CopilotPanel.vue'))

const pageOn = inject<Ref<boolean>>(PAGE_ACTIVE, computed(() => true))
const active = computed<SideTab>(() => (state.showCopilot ? 'ai' : shell.sideTab === 'ai' ? tabOf(state.rightTab) : shell.sideTab))
const SUB: Record<Exclude<SideTab, 'ai'>, Array<{ id: typeof state.rightTab; label: string; ui: string }>> = {
  inspect: [],
  analysis: [{ id: 'formula', label: '公式', ui: 'sub-formula' }, { id: 'watch', label: '监视', ui: 'sub-watch' }, { id: 'predict', label: '预测', ui: 'sub-predict' }],
  problem: [{ id: 'problem', label: '题目', ui: 'tab-problem' }, { id: 'task', label: '任务', ui: 'tab-task' }]
}
const subs = computed(() => (active.value === 'ai' ? [] : SUB[active.value].filter(s => s.id !== 'problem' || !!state.problem)))
const tabClass = (on: boolean) => (on ? 'is-on' : 'is-off')
const on = (rt: typeof state.rightTab) => active.value !== 'ai' && state.rightTab === rt
/** 属性 shows the scene when nothing is selected, or when the scene's settings were asked for (更多 › 计算设置). */
const inspectOn = computed(() => active.value === 'inspect')
const sceneShown = computed(() => !state.selection || state.rightTab === 'settings')
// Selecting something while the scene was asked for shows the selection
watch(() => state.selection, s => { if (s && state.rightTab === 'settings') state.rightTab = 'inspect' })
/** Panels that follow playback only while shown. */
const live = (rt: typeof state.rightTab) => pageOn.value && shell.sideOpen && on(rt)

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
  <aside v-if="shell.sideOpen" class="sidebar" :class="{ overlay: narrow }" :style="{ width: `${shell.sideWidth}px` }" :aria-label="tl('侧栏')">
    <div v-if="!narrow" class="resize" role="separator" aria-orientation="vertical" :aria-label="tl('拖动调整侧栏宽度')" tabindex="0" @pointerdown.prevent="dragWidth" @keydown="nudgeWidth" />
    <div v-if="subs.length > 1" class="subtabs" role="tablist">
      <button v-for="s in subs" :key="s.id" role="tab" :data-ui="s.ui" :aria-selected="state.rightTab === s.id" :class="{ on: state.rightTab === s.id }" @click="state.rightTab = s.id">{{ tl(s.label) }}</button>
    </div>
    <div class="stack">
        <div class="panel" :class="tabClass(inspectOn && !sceneShown)" :inert="!inspectOn || sceneShown"><Inspector /></div>
        <div class="panel" :class="tabClass(inspectOn && sceneShown)" :inert="!inspectOn || !sceneShown"><ScenePanel /></div>
        <div class="panel" :class="tabClass(on('formula'))" :inert="!on('formula')"><FormulaPanel :active="live('formula')" /></div>
        <div class="panel" :class="tabClass(on('watch'))" :inert="!on('watch')"><WatchPanel :active="live('watch')" /></div>
        <div class="panel" :class="tabClass(on('predict'))" :inert="!on('predict')"><PredictionPanel /></div>
        <div v-if="state.problem" class="panel" :class="tabClass(on('problem'))" :inert="!on('problem')"><ProblemPanel /></div>
        <div class="panel" :class="tabClass(on('task'))" :inert="!on('task')"><TaskPanel /></div>
        <div v-if="settings.ai.copilot && (state.showCopilot || shell.sideTab === 'ai')" class="panel ai" :class="tabClass(active === 'ai')" :inert="active !== 'ai'"><CopilotPanel /></div>
    </div>
  </aside>
</template>

<style scoped>
/* One surface, one treatment (26.65, D296): a hairline, no shadow; the scrollable content has the inspector's padding */
.sidebar { position: relative; flex: 0 0 auto; min-width: 0; display: flex; flex-direction: column; border-radius: var(--radius-panel); background: var(--pane); box-shadow: var(--elev-1); overflow: hidden; }
.sidebar.overlay { position: absolute; right: 0; top: 0; bottom: 0; z-index: 20; max-width: calc(100vw - 24px); box-shadow: var(--elev-3); }
.resize { position: absolute; left: 0; top: 0; bottom: 0; width: 8px; cursor: col-resize; z-index: 3; }
.resize:hover, .resize:focus-visible { background: color-mix(in srgb, var(--accent) 25%, transparent); outline: none; }
/* One row of plain text tabs: the view chosen is darker, with a 2 px line under it */
.subtabs { display: flex; gap: var(--space-4); margin: var(--space-2) var(--space-4) 0; border-bottom: 1px solid var(--separator); }
.subtabs button { border: 0; background: none; color: var(--text-2); font: inherit; font-size: var(--type-small); padding: 8px 0 7px; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; }
.subtabs button:hover { color: var(--text); }
.subtabs button.on { color: var(--text); border-bottom-color: var(--text); font-weight: var(--weight-strong); }
.stack { flex: 1; min-height: 0; position: relative; }
.panel { position: absolute; inset: 0; overflow: auto; padding: var(--space-3) var(--space-4) var(--space-4); }
.panel.ai { padding: 4px 0 0; overflow: hidden; }
</style>
