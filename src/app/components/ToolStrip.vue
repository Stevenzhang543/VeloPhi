<script setup lang="ts">
/**
 * The tool strip at the left edge of the canvas (26.60, D205). It floats over the canvas instead of taking a column:
 * select and pan, the common tools (搭建 mode; the other modes keep only select, pan and the palette), the tool picked
 * from the palette when it is not one of them, the palette (every tool with its name, a search, the category pages) and
 * the list of objects as flyouts, and the two snapping switches.
 */
import { tl } from '../../i18n'
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { state } from '../store'
import { settings, fmtQ } from '../settings'
import Icon from './Icon.vue'
import ToolPalette from './ToolPalette.vue'
import ObjectList from './ObjectList.vue'
import { ALL_TOOLS, COMMON, fieldOn, pickTool } from '../tools'
import type { Tool } from '../store'
import { shell } from '../layout'

const STRIP = COMMON
const isOn = (t: Tool) => state.tool === t || fieldOn(t)
const shown = computed(() => (shell.tools ? STRIP : STRIP.slice(0, 2)))
/** The tool in use when it is not on the strip (picked from the palette). */
const extra = computed(() => (shown.value.some(t => t.tool === state.tool) ? null : ALL_TOOLS.find(t => t.tool === state.tool) ?? null))
const objectCount = computed(() => state.scene.bodies.length + state.scene.connectors.length + state.scene.pulleys.length + state.scene.annotations.length)
const snapText = computed(() => (settings.editor.snapStep > 0 ? tl('步长 {0}', [fmtQ(settings.editor.snapStep, 'm', 3)]) : tl('步长随网格')))

function toggle(f: 'palette' | 'objects') { shell.flyout = shell.flyout === f ? null : f }
function closeOnOutside(e: PointerEvent) {
  if (!shell.flyout) return
  if (!(e.target as Element).closest('.strip-wrap')) shell.flyout = null
}
function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && shell.flyout) shell.flyout = null }
onMounted(() => { window.addEventListener('pointerdown', closeOnOutside); window.addEventListener('keydown', onKey) })
onBeforeUnmount(() => { window.removeEventListener('pointerdown', closeOnOutside); window.removeEventListener('keydown', onKey) })
</script>

<template>
  <div class="strip-wrap">
    <nav class="strip" data-ui="tools" :aria-label="tl('工具')">
      <button v-for="t in shown" :key="t.tool" class="st" :class="{ on: isOn(t.tool) }" :title="`${t.label} — ${t.tip}`" :aria-label="t.label" :aria-pressed="isOn(t.tool)" @click="pickTool(t.tool)"><Icon :name="t.icon" :size="19" /></button>
      <button v-if="extra" class="st on" :title="`${extra.label} — ${extra.tip}`" :aria-label="extra.label" aria-pressed="true" @click="pickTool(extra.tool)"><Icon :name="extra.icon" :size="19" /></button>
      <span class="sep" />
      <button class="st" data-ui="palette" :class="{ open: shell.flyout === 'palette' }" :aria-expanded="shell.flyout === 'palette'" :title="tl('全部工具（物体、轨道、连接、力与场、编辑、标注）')" :aria-label="tl('全部工具')" @click="toggle('palette')"><Icon name="shapes" :size="19" /></button>
      <button class="st" data-ui="objects" :class="{ open: shell.flyout === 'objects' }" :aria-expanded="shell.flyout === 'objects'" :title="tl('对象列表（{0}）', [objectCount])" :aria-label="tl('对象列表')" @click="toggle('objects')"><Icon name="list" :size="19" /><span v-if="objectCount" class="count">{{ objectCount }}</span></button>
      <template v-if="shell.tools">
        <span class="sep" />
        <button class="st snap" :class="{ on: settings.editor.objectSnap }" :aria-pressed="settings.editor.objectSnap" :title="tl('物体吸附：靠近其他物体时吸到刚好接触、边缘对齐；按住 Alt 临时关闭')" :aria-label="tl('物体吸附')" @click="settings.editor.objectSnap = !settings.editor.objectSnap"><Icon name="magnet" :size="17" /></button>
        <button class="st snap" :class="{ on: settings.editor.snap }" :aria-pressed="settings.editor.snap" :title="`${tl('网格吸附：物体的边、角或圆弧端点对齐网格；接触吸附仍然有效；按住 Alt 临时关闭')}（${snapText}）`" :aria-label="tl('网格吸附')" @click="settings.editor.snap = !settings.editor.snap"><Icon name="grid" :size="17" /></button>
      </template>
      <span class="sep" />
      <button class="st" :title="shell.tools ? tl('只留选择、平移与工具箱') : tl('显示常用工具与吸附开关')" :aria-label="shell.tools ? tl('收起工具条') : tl('展开工具条')" @click="shell.tools = !shell.tools"><Icon :name="shell.tools ? 'expandUp' : 'expandDown'" :size="16" /></button>
    </nav>
    <div v-if="shell.flyout === 'palette'" class="flyout" role="dialog" :aria-label="tl('全部工具')">
      <ToolPalette autofocus @pick="shell.flyout = null" />
    </div>
    <div v-else-if="shell.flyout === 'objects'" class="flyout objects" role="dialog" :aria-label="tl('对象列表')">
      <div class="ftitle">{{ tl('对象') }} <span class="tiny muted">{{ objectCount }}</span></div>
      <ObjectList @pick="shell.flyout = null" />
    </div>
  </div>
</template>

<style scoped>
.strip-wrap { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); z-index: 6; display: flex; align-items: flex-start; gap: 8px; max-height: calc(100% - 20px); }
.strip { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 5px; border-radius: 16px; background: var(--pane); box-shadow: var(--shadow), 0 0 0 0.5px var(--separator); overflow-y: auto; max-height: 100%; scrollbar-width: none; }
.strip::-webkit-scrollbar { display: none; }
.st { position: relative; width: calc(38px * var(--zoom)); height: calc(36px * var(--zoom)); flex: 0 0 auto; display: grid; place-items: center; border: 0; border-radius: 10px; background: transparent; color: var(--text-2); cursor: pointer; transition: background var(--dur-2) var(--ease-out), color var(--dur-2) var(--ease-out), transform var(--dur-1) var(--ease-out); }
.st:hover { background: var(--fill-strong); color: var(--text); }
.st:active { transform: scale(0.92); }
.st.on { background: var(--accent); color: var(--on-accent); }
.st.snap.on { background: var(--accent-soft); color: var(--accent); }
.st.open { background: var(--fill-strong); color: var(--text); }
.count { position: absolute; right: 2px; bottom: 2px; min-width: 14px; height: 14px; padding: 0 3px; border-radius: 7px; background: var(--fill-strong); color: var(--text-2); font-size: 9.5px; line-height: 14px; font-weight: 600; }
.sep { width: 22px; height: 1px; background: var(--separator); margin: 4px 0; flex: 0 0 auto; }
.flyout { width: 330px; max-height: min(560px, 100%); overflow: auto; padding: 10px; border-radius: 16px; background: var(--pane); box-shadow: var(--shadow-pop), 0 0 0 0.5px var(--separator); animation: pop-in 140ms var(--ease-out); }
.flyout.objects { width: 260px; }
.ftitle { font-weight: 600; font-size: var(--type-small); margin: 0 4px 6px; }
:root.fx-glass .strip, :root.fx-glass .flyout { background: var(--glass-pop); -webkit-backdrop-filter: blur(var(--glass-blur-small)) saturate(var(--glass-sat)); backdrop-filter: blur(var(--glass-blur-small)) saturate(var(--glass-sat)); }
@media (max-height: 640px) { .strip-wrap { top: 10px; transform: none; } }
</style>
