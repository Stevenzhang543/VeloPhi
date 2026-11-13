<script setup lang="ts">
/**
 * Status bar of the studio and the monitor page (26.63, D233): on the left what the app is doing (editing, computing,
 * result ready, an error) and the hint of the tool in use; on the right the pointer's position, the snapping in
 * effect, the zoom (with one-step buttons and "fit") and what has been computed. Everything here is read-only state
 * or a small view control — nothing that changes the scene.
 */
import { computed } from 'vue'
import { tl } from '../../i18n'
import { state } from '../store'
import { settings, fmtNum, unitLabel } from '../settings'
import { msgText } from '../../i18n/locale'
import { viewStatus, zoomStudio } from '../viewStatus'
import { ALL_TOOLS } from '../tools'
import { shell } from '../layout'
import { MOD } from '../shortcuts'
import Icon from './Icon.vue'

type Tone = 'idle' | 'busy' | 'ok' | 'warn' | 'bad'
const status = computed((): { tone: Tone; text: string; tip?: string } => {
  if (state.simError) return { tone: 'bad', text: tl('计算出错'), tip: msgText(state.simError) }
  if (state.computing && !state.run.paused) return { tone: 'busy', text: tl('计算中…') }
  if (!state.recording) return { tone: 'idle', text: tl('未运行') }
  if (state.stale) return { tone: 'warn', text: tl('已修改，结果已过期'), tip: tl('按 {0}+Enter 重新计算', [MOD]) }
  return { tone: 'ok', text: tl('结果已就绪') }
})
const tool = computed(() => ALL_TOOLS.find(t => t.tool === state.tool) ?? null)
const hint = computed(() => viewStatus.hint || (state.tool === 'select' ? tl('点击选中，拖动移动；滚轮缩放，空格 + 拖动平移；右键打开菜单') : ''))
const unit = computed(() => unitLabel('m'))
const cursor = computed(() => (viewStatus.cursor ? { x: fmtNum(viewStatus.cursor.x, 'm', 4), y: fmtNum(viewStatus.cursor.y, 'm', 4) } : null))
const zoom = computed(() => (viewStatus.ppm > 0 ? `${Math.round(viewStatus.ppm)} px/m` : '—'))
const snap = computed(() => {
  const on: string[] = []
  if (settings.editor.objectSnap) on.push(tl('物体'))
  if (settings.editor.snap) on.push(tl('网格'))
  return on.length ? on.join(' + ') : tl('关')
})
const run = computed(() => {
  const rec = state.recording
  if (!rec) return ''
  const events = rec.events.length
  return tl('{0} 帧 · {1} 个事件', [rec.frameCount, events])
})
const studio = computed(() => state.page === 'studio')
</script>

<template>
  <footer class="status" role="contentinfo" :aria-label="tl('状态栏')">
    <span class="state" :class="status.tone" :title="status.tip"><i class="lamp" />{{ status.text }}</span>
    <template v-if="studio">
      <span v-if="tool && state.tool !== 'select'" class="tool"><Icon :name="tool.icon" :size="13" />{{ tool.label }}</span>
      <span class="hint" :title="hint">{{ hint }}</span>
    </template>
    <span class="spacer" />
    <template v-if="studio">
      <span v-if="cursor" class="cell mono" :title="tl('指针位置')">x {{ cursor.x }}&nbsp; y {{ cursor.y }} {{ unit }}</span>
      <button type="button" class="cell btnlike" :title="tl('吸附（在设置 › 编辑或工具条里开关）；拖动时按住 Alt 暂停')" @click="state.page = 'settings'; state.settingsSection = 'editor'"><Icon name="magnet" :size="13" />{{ tl('吸附：{0}', [snap]) }}</button>
      <span class="zoom">
        <button type="button" class="zb" :title="tl('缩小（−）')" :aria-label="tl('缩小')" @click="zoomStudio(-1)"><Icon name="zoomOut" :size="13" /></button>
        <button type="button" class="cell btnlike mono" :title="tl('适合视图：缩放到运动范围（0）')" @click="state.cameraRequest++">{{ zoom }}</button>
        <button type="button" class="zb" :title="tl('放大（+）')" :aria-label="tl('放大')" @click="zoomStudio(1)"><Icon name="zoomIn" :size="13" /></button>
      </span>
    </template>
    <span v-if="run" class="cell mono">{{ run }}</span>
    <button type="button" class="cell btnlike" :title="tl('快捷键一览（?）')" :aria-label="tl('快捷键一览')" @click="shell.shortcuts = true"><Icon name="keyboard" :size="13" /></button>
  </footer>
</template>

<style scoped>
.status { flex: 0 0 var(--status-h); height: var(--status-h); display: flex; align-items: center; gap: 10px; padding: 0 8px 0 10px; font-size: var(--type-tiny); color: var(--text-2); border-top: 1px solid var(--border); background: var(--chrome); min-width: 0; white-space: nowrap; user-select: none; }
.state { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; flex: 0 0 auto; }
.lamp { width: 7px; height: 7px; border-radius: 50%; background: var(--text-3); }
.state.ok .lamp { background: var(--success); }
.state.warn { color: var(--warning); } .state.warn .lamp { background: var(--warning); }
.state.bad { color: var(--danger); } .state.bad .lamp { background: var(--danger); }
.state.busy .lamp { background: var(--accent); animation: blink 900ms ease-in-out infinite; }
@keyframes blink { 50% { opacity: 0.25; } }
.tool { display: inline-flex; align-items: center; gap: 4px; color: var(--accent); font-weight: 600; flex: 0 0 auto; }
.hint { min-width: 0; overflow: hidden; text-overflow: ellipsis; flex: 0 1 auto; color: var(--text-3); }
.spacer { flex: 1 1 8px; }
.cell { display: inline-flex; align-items: center; gap: 4px; flex: 0 0 auto; }
.btnlike, .zb { border: 0; background: none; color: inherit; font: inherit; cursor: pointer; height: calc(var(--status-h) - 6px); padding: 0 6px; border-radius: 5px; }
.zb { padding: 0 3px; display: inline-grid; place-items: center; }
.btnlike:hover, .zb:hover { background: var(--fill); color: var(--text); }
.zoom { display: inline-flex; align-items: center; }
@media (max-width: 1100px) { .hint { display: none; } }
@media (max-width: 900px) { .cell.mono:first-of-type { display: none; } }
</style>
