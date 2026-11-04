<script setup lang="ts">
/**
 * The timeline of the studio (26.60, D205). Closed: one floating bar at the bottom of the canvas — play, events, the
 * track, the time, speed and what the computation is doing (it goes on while anything moves, D203). Open: a drawer
 * under the canvas with the full timeline (branches, formula timeline, frames) and the curves and events; its height is
 * dragged at the top edge.
 */
import { tl } from '../../i18n'
import { state } from '../store'
import { shell } from '../layout'
import Icon from './Icon.vue'
import Timeline from './Timeline.vue'
import ChartPanel from './ChartPanel.vue'
import EventList from './EventList.vue'

const props = withDefaults(defineProps<{ active?: boolean; part: 'bar' | 'drawer' }>(), { active: true })
const tabClass = (on: boolean) => (on ? 'is-on' : 'is-off')

function dragHeight(e: PointerEvent) {
  const start = { y: e.clientY, h: shell.drawerHeight }
  const move = (ev: PointerEvent) => { shell.drawerHeight = Math.round(Math.max(160, Math.min(window.innerHeight - 240, start.h - (ev.clientY - start.y)))) }
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
function nudge(e: KeyboardEvent) {
  if (e.key === 'ArrowUp') shell.drawerHeight = Math.min(window.innerHeight - 240, shell.drawerHeight + 20)
  else if (e.key === 'ArrowDown') shell.drawerHeight = Math.max(160, shell.drawerHeight - 20)
}
void props
</script>

<template>
  <!-- Floating bar over the canvas -->
  <div v-if="part === 'bar'" class="tbar" data-ui="timeline">
    <Timeline compact :active="active" />
    <button class="btn ghost small open-btn" data-ui="bottom-chart" :title="tl('展开曲线与事件')" :aria-expanded="false" @click="shell.drawerOpen = true"><Icon name="chart" :size="15" /><span class="lbl">{{ tl('曲线') }}</span><Icon name="expandUp" :size="13" /></button>
  </div>
  <!-- Drawer under the canvas -->
  <section v-else class="drawer" data-ui="timeline" :style="{ height: `${shell.drawerHeight}px` }" :aria-label="tl('时间轴、曲线与事件')">
    <div class="grip" role="separator" aria-orientation="horizontal" :aria-label="tl('拖动调整高度')" tabindex="0" @pointerdown.prevent="dragHeight" @keydown="nudge" />
    <Timeline :active="active" />
    <div class="dhead">
      <div class="tabs segmented" role="tablist">
        <button role="tab" data-ui="bottom-chart" :aria-selected="state.bottomTab === 'chart'" :class="{ on: state.bottomTab === 'chart' }" @click="state.bottomTab = 'chart'">{{ tl('曲线') }}</button>
        <button role="tab" data-ui="bottom-events" :aria-selected="state.bottomTab === 'events'" :class="{ on: state.bottomTab === 'events' }" @click="state.bottomTab = 'events'">{{ tl('事件') }}</button>
      </div>
      <span class="spacer" />
      <button class="btn icon ghost" :title="tl('收起曲线与事件')" :aria-label="tl('收起曲线与事件')" @click="shell.drawerOpen = false"><Icon name="expandDown" :size="15" /></button>
    </div>
    <div class="dbody">
      <ChartPanel :class="tabClass(state.bottomTab === 'chart')" :inert="state.bottomTab !== 'chart'" :active="active && state.bottomTab === 'chart'" />
      <EventList :class="tabClass(state.bottomTab === 'events')" :inert="state.bottomTab !== 'events'" :active="active && state.bottomTab === 'events'" />
    </div>
  </section>
</template>

<style scoped>
.tbar { position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); width: min(980px, calc(100% - 132px)); z-index: 5; display: flex; align-items: center; gap: 2px; padding-right: 6px; border-radius: 16px; background: var(--pane); box-shadow: var(--shadow-pop, var(--shadow)), 0 0 0 0.5px var(--separator); }
.tbar :deep(.timeline) { flex: 1; min-width: 0; }
.open-btn { flex: 0 0 auto; gap: 3px; }
:root.fx-glass .tbar { background: var(--glass-pop); -webkit-backdrop-filter: blur(var(--glass-blur-small)) saturate(var(--glass-sat)); backdrop-filter: blur(var(--glass-blur-small)) saturate(var(--glass-sat)); }
@container studio (max-width: 720px) { .open-btn .lbl { display: none; } .tbar { width: calc(100% - 72px); left: calc(50% + 24px); } }
.drawer { position: relative; flex: 0 0 auto; display: flex; flex-direction: column; min-height: 0; margin-top: 8px; border-radius: var(--radius-pane); background: var(--pane); box-shadow: var(--shadow); }
.grip { position: absolute; left: 0; right: 0; top: -6px; height: 10px; cursor: row-resize; z-index: 2; }
.grip::after { content: ''; position: absolute; left: 50%; top: 4px; width: 36px; height: 4px; margin-left: -18px; border-radius: 2px; background: var(--fill-strong); }
.grip:hover::after, .grip:focus-visible::after { background: var(--accent); }
.grip:focus-visible { outline: none; }
.dhead { display: flex; align-items: center; padding: 0 8px 4px 12px; }
.dhead .tabs { width: 160px; }
.dbody { flex: 1; min-height: 0; position: relative; }
.dbody > * { position: absolute; inset: 0; }
</style>
