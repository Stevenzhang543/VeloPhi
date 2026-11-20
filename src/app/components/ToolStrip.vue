<script setup lang="ts">
/**
 * The tool strip at the left edge of the canvas (26.60, D205; 26.64, D245). It floats over the canvas instead of taking
 * a column: six tools — select, pan, ball, block, incline, spring (搭建 mode; the other modes keep select and pan) —
 * the tool picked from the palette when it is not one of them, and at the bottom 全部工具: every tool with its name, a
 * search and the category pages, and below them what 26.63 kept on the strip as bare icons — the list of objects, the
 * two snapping switches and the strip's short form — now with their names.
 */
import { tl } from '../../i18n'
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { state } from '../store'
import { settings, fmtQ } from '../settings'
import Icon from './Icon.vue'
import ToolPalette from './ToolPalette.vue'
import ObjectList from './ObjectList.vue'
import { ALL_TOOLS, STRIP, fieldOn, pickTool } from '../tools'
import type { Tool } from '../store'
import { shell } from '../layout'

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
      <button class="st" data-ui="palette" :class="{ open: !!shell.flyout }" :aria-expanded="shell.flyout === 'palette'" :title="tl('全部工具')" :aria-label="tl('全部工具')" @click="toggle('palette')"><Icon name="shapes" :size="19" /></button>
    </nav>
    <div v-if="shell.flyout === 'palette'" class="flyout" role="dialog" :aria-label="tl('全部工具')">
      <ToolPalette autofocus @pick="shell.flyout = null" />
      <div class="more" role="group" :aria-label="tl('工具条')">
        <button type="button" class="row" data-ui="objects" @click="shell.flyout = 'objects'"><Icon name="list" :size="17" /><span>{{ tl('对象列表') }}</span><span class="tiny muted num">{{ objectCount }}</span></button>
        <label class="row" :title="tl('吸到接触与对齐，Alt 暂停')"><Icon name="magnet" :size="17" /><span>{{ tl('物体吸附') }}</span><input v-model="settings.editor.objectSnap" type="checkbox" class="switch" /></label>
        <label class="row" :title="`${tl('对齐网格，Alt 暂停')}（${snapText}）`"><Icon name="grid" :size="17" /><span>{{ tl('网格吸附') }}</span><input v-model="settings.editor.snap" type="checkbox" class="switch" /></label>
        <button type="button" class="row" :title="shell.tools ? tl('只留选择、平移与工具箱') : tl('显示常用工具与吸附开关')" @click="shell.tools = !shell.tools"><Icon :name="shell.tools ? 'expandUp' : 'expandDown'" :size="17" /><span>{{ shell.tools ? tl('收起工具条') : tl('展开工具条') }}</span></button>
      </div>
    </div>
    <div v-else-if="shell.flyout === 'objects'" class="flyout objects" role="dialog" :aria-label="tl('对象列表')">
      <div class="ftitle">{{ tl('对象') }} <span class="tiny muted">{{ objectCount }}</span></div>
      <ObjectList @pick="shell.flyout = null" />
    </div>
  </div>
</template>

<style scoped>
.strip-wrap { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); z-index: 6; display: flex; align-items: flex-start; gap: 8px; max-height: calc(100% - 20px); }
.strip { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 5px; border-radius: var(--radius-bar); background: var(--pane); box-shadow: var(--elev-2); overflow-y: auto; max-height: 100%; scrollbar-width: none; }
.strip::-webkit-scrollbar { display: none; }
.st { position: relative; width: calc(38px * var(--zoom)); height: calc(36px * var(--zoom)); flex: 0 0 auto; display: grid; place-items: center; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text-2); cursor: pointer; transition: background var(--dur-2) var(--ease-out), color var(--dur-2) var(--ease-out), transform var(--dur-1) var(--ease-out); }
.st:hover { background: var(--fill-strong); color: var(--text); }
.st:active { transform: scale(0.92); }
.st.on { background: var(--accent); color: var(--on-accent); }
.st.snap.on { background: var(--accent-soft); color: var(--accent); }
.st.open { background: var(--fill-strong); color: var(--text); }
.count { position: absolute; right: 2px; bottom: 2px; min-width: 14px; height: 14px; padding: 0 3px; border-radius: var(--radius-pill); background: var(--fill-strong); color: var(--text-2); font-size: var(--type-tiny); line-height: 14px; font-weight: 600; }
.sep { width: 22px; height: 1px; background: var(--separator); margin: 4px 0; flex: 0 0 auto; }
.flyout { width: 330px; max-height: min(560px, 100%); overflow: auto; padding: 10px; border-radius: var(--radius-float); background: var(--pane); box-shadow: var(--elev-3); animation: pop-in 140ms var(--ease-out); }
.flyout.objects { width: 260px; }
.more { display: flex; flex-direction: column; gap: 1px; margin-top: var(--space-2); padding-top: var(--space-1); border-top: 1px solid var(--separator); }
.row { display: flex; align-items: center; gap: var(--space-2); min-height: var(--menu-row); padding: 0 var(--space-2); border: 0; border-radius: var(--radius-control); background: none; color: var(--text); font: inherit; font-size: var(--type-small); text-align: left; cursor: pointer; }
.row:hover { background: var(--hover); }
.row > span:first-of-type { flex: 1; min-width: 0; }
.ftitle { font-weight: 600; font-size: var(--type-small); margin: 0 4px 6px; }
:root.fx-glass .strip, :root.fx-glass .flyout { background: var(--glass-pop); -webkit-backdrop-filter: blur(var(--glass-blur-small)) saturate(var(--glass-sat)); backdrop-filter: blur(var(--glass-blur-small)) saturate(var(--glass-sat)); }
@media (max-height: 640px) { .strip-wrap { top: 10px; transform: none; } }
</style>
