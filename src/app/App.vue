<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { state, undo, redo, runSimulation, play, pause, seekFrame, edit } from './store'
import { deleteObject } from './editing'
import { openScene, saveScene, newScene } from './files'
import TopBar from './components/TopBar.vue'
import LeftPanel from './components/LeftPanel.vue'
import Viewport from './components/Viewport.vue'
import Inspector from './components/Inspector.vue'
import FormulaPanel from './components/FormulaPanel.vue'
import WatchPanel from './components/WatchPanel.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import Timeline from './components/Timeline.vue'
import ChartPanel from './components/ChartPanel.vue'
import EventList from './components/EventList.vue'
import TemplateGallery from './components/TemplateGallery.vue'
import ExportDialog from './components/ExportDialog.vue'
import AboutDialog from './components/AboutDialog.vue'
import { isDesktop } from '../platform/files'

const bottomHeight = ref(290)
const rightWidth = ref(380)

function typing(e: KeyboardEvent) {
  const t = e.target as HTMLElement
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable
}

function onKey(e: KeyboardEvent) {
  const mod = e.ctrlKey || e.metaKey
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveScene(e.shiftKey); return }
  if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); openScene(); return }
  if (mod && e.key.toLowerCase() === 'n') { e.preventDefault(); newScene(); return }
  if (mod && e.key === 'Enter') { e.preventDefault(); runSimulation(); return }
  if (typing(e)) return
  if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return }
  if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return }
  if (e.key === ' ') { e.preventDefault(); if (state.playing) pause(); else play(); return }
  if (e.key === 'ArrowRight') { pause(); seekFrame(state.frame + (e.shiftKey ? 10 : 1)); return }
  if (e.key === 'ArrowLeft') { pause(); seekFrame(state.frame - (e.shiftKey ? 10 : 1)); return }
  if (e.key === 'Home') { pause(); seekFrame(0); return }
  if (e.key === 'End') { pause(); seekFrame(Number.MAX_SAFE_INTEGER); return }
  if (e.key === 'Escape') { state.tool = 'select'; state.pendingConnector = null; return }
  if ((e.key === 'Delete' || e.key === 'Backspace') && state.selection) { const sel = state.selection; edit(s => deleteObject(s, sel)); state.selection = null; return }
  if (e.key.toLowerCase() === 'v') state.tool = 'select'
}

function beforeUnload(e: BeforeUnloadEvent) { if (state.dirty) { e.preventDefault(); e.returnValue = '' } }

let unlistenClose: (() => void) | null = null
onMounted(async () => {
  window.addEventListener('keydown', onKey)
  if (!isDesktop) { window.addEventListener('beforeunload', beforeUnload); return }
  // desktop: ask before closing a window with unsaved changes
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const { ask } = await import('@tauri-apps/plugin-dialog')
  unlistenClose = await getCurrentWindow().onCloseRequested(async e => {
    if (!state.dirty) return
    const leave = await ask('当前场景有未保存的修改，确定退出吗？', { title: 'Verity', kind: 'warning', okLabel: '退出', cancelLabel: '取消' })
    if (!leave) e.preventDefault()
  })
})
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', beforeUnload); unlistenClose?.() })

function dragSplit(kind: 'bottom' | 'right', e: MouseEvent) {
  const start = { x: e.clientX, y: e.clientY, h: bottomHeight.value, w: rightWidth.value }
  const move = (ev: MouseEvent) => {
    if (kind === 'bottom') bottomHeight.value = Math.max(150, Math.min(window.innerHeight - 260, start.h - (ev.clientY - start.y)))
    else rightWidth.value = Math.max(300, Math.min(640, start.w - (ev.clientX - start.x)))
  }
  const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}
</script>

<template>
  <div class="app" :style="{ '--bottom-h': `${bottomHeight}px`, '--right-w': `${rightWidth}px` }">
    <TopBar class="top" />
    <aside class="left"><LeftPanel /></aside>
    <main class="center">
      <div class="view"><Viewport /></div>
      <div class="split-h" @mousedown.prevent="dragSplit('bottom', $event)" />
      <section class="pane bottom">
        <Timeline />
        <div class="bottom-tabs">
          <div class="tabs"><button :class="{ on: state.bottomTab === 'chart' }" @click="state.bottomTab = 'chart'">曲线</button><button :class="{ on: state.bottomTab === 'events' }" @click="state.bottomTab = 'events'">事件</button></div>
        </div>
        <div class="bottom-body">
          <ChartPanel v-show="state.bottomTab === 'chart'" />
          <EventList v-if="state.bottomTab === 'events'" />
        </div>
      </section>
    </main>
    <div class="split-v" @mousedown.prevent="dragSplit('right', $event)" />
    <aside class="pane right">
      <div class="right-head">
        <div class="tabs">
          <button :class="{ on: state.rightTab === 'formula' }" @click="state.rightTab = 'formula'">公式对照</button>
          <button :class="{ on: state.rightTab === 'inspect' }" @click="state.rightTab = 'inspect'">属性</button>
          <button :class="{ on: state.rightTab === 'watch' }" @click="state.rightTab = 'watch'">监视</button>
          <button :class="{ on: state.rightTab === 'settings' }" @click="state.rightTab = 'settings'">设置</button>
        </div>
      </div>
      <div class="pane-body">
        <FormulaPanel v-if="state.rightTab === 'formula'" />
        <Inspector v-else-if="state.rightTab === 'inspect'" />
        <WatchPanel v-else-if="state.rightTab === 'watch'" />
        <SettingsPanel v-else />
      </div>
    </aside>
    <TemplateGallery v-if="state.showTemplates" />
    <ExportDialog v-if="state.showExport && state.recording" />
    <AboutDialog v-if="state.showAbout" />
    <div v-if="state.toast" class="toast" :class="{ error: state.toast.error }">{{ state.toast.text }}</div>
  </div>
</template>

<style scoped>
.app {
  height: 100vh;
  display: grid;
  grid-template-columns: 216px 1fr 6px var(--right-w);
  grid-template-rows: auto 1fr;
  grid-template-areas: 'top top top top' 'left center splitv right';
  gap: 0 8px;
  padding: 0 8px 8px;
}
.top { grid-area: top; }
.left { grid-area: left; min-height: 0; }
.center { grid-area: center; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.view { flex: 1; min-height: 160px; }
.split-h { height: 8px; cursor: row-resize; flex: 0 0 auto; }
.split-v { grid-area: splitv; cursor: col-resize; margin: 0 -4px; }
.bottom { height: var(--bottom-h); flex: 0 0 auto; }
.bottom-tabs { padding: 0 12px 4px; display: flex; }
.bottom-tabs .tabs { width: 160px; }
.bottom-body { flex: 1; min-height: 0; position: relative; }
.right { grid-area: right; min-height: 0; }
.right-head { padding: 10px 10px 6px; }
</style>
