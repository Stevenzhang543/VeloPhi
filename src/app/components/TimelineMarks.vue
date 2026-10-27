<script setup lang="ts">
/**
 * Event and branch markers of the playback track (26.55, D97: a component of its own, so the hundreds of markers of
 * a long run are not re-rendered with the playhead on every frame — Vue skips a child whose props did not change).
 */
import { tl } from '../../i18n'

export interface EventMark { index: number; t: number; left: number; text: string }
export interface BranchMark { id: string; name: string; t: number; left: number }

defineProps<{ markers: EventMark[]; branchMarks: BranchMark[] }>()
const emit = defineEmits<{ marker: [m: EventMark]; branch: [id: string] }>()
</script>

<template>
  <div class="markers">
    <button v-for="m in markers" :key="m.index" class="marker" :style="{ left: `${m.left}%` }" :title="tl('{0}（点击查看详情）', [m.text])" @click="emit('marker', m)" />
    <button v-for="b in branchMarks" :key="`br-${b.id}`" class="marker branch" :style="{ left: `${b.left}%` }" :title="tl('分支“{0}”从这里开始（点击切换）', [b.name])" @click="emit('branch', b.id)" />
  </div>
</template>

<style scoped>
.markers { position: absolute; left: 7px; right: 7px; top: 0; height: 100%; pointer-events: none; }
.marker { position: absolute; top: 0; width: 8px; height: 8px; margin-left: -4px; border-radius: 2px; transform: rotate(45deg); background: var(--warning); border: 0; padding: 0; cursor: pointer; pointer-events: auto; }
.marker:hover { transform: rotate(45deg) scale(1.35); }
.marker.branch { width: 4px; height: 18px; margin-left: -2px; top: 2px; border-radius: 2px; transform: none; background: var(--accent); }
.marker.branch:hover { transform: scaleX(1.6); }
</style>
