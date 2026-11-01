<script setup lang="ts">
/**
 * Results pinned to the canvas (26.57, D123; manual §7.4 basic layer): a small stack at the top right of the studio
 * canvas, each card in its compact form with its state in words. Only results of the current revision are shown as
 * current; when the task or its scene changed, the pinned cards say so instead of showing an old value as current.
 * Pins are layout only and never change the scene.
 */
import { computed } from 'vue'
import { tl } from '../../../i18n'
import { seekTime, state } from '../../store'
import { taskUi, currentResults, onTaskScene } from '../../task/taskState'
import { docks } from '../../task/dock'
import ResultCard from './ResultCard.vue'

/** Canvas pins of the task (ids). */
const canvasIds = computed(() => (taskUi.task ? taskUi.task.targets.map(t => t.id).filter(id => docks[id] === 'canvas') : []))
// a result is shown on the canvas only over the scene it belongs to (the task's demonstration); a task read from a
// text has no scene yet, so its pins wait for “看演示” instead of sitting over an unrelated scene
// (and not over another scene loaded since: hand check H7)
const onScene = computed(() => { void state.scene; return onTaskScene() })
const pinned = computed(() => {
  if (!taskUi.task || !onScene.value) return []
  return currentResults().filter(r => docks[r.targetId] === 'canvas')
})
const waiting = computed(() => !!taskUi.task && !taskUi.boundScene && canvasIds.value.length > 0)
const stalePins = computed(() => {
  if (!taskUi.task || !onScene.value || taskUi.outcome) return 0
  const ids = new Set(taskUi.task.targets.map(t => t.id))
  return Object.entries(docks).filter(([id, z]) => z === 'canvas' && ids.has(id)).length
})
function locate(t: number) { if (taskUi.boundScene) seekTime(t) }
</script>

<template>
  <div v-if="state.page === 'studio' && (pinned.length || stalePins || waiting)" class="canvas-pins" role="region" :aria-label="tl('固定到画面的结果')">
    <div v-for="r in pinned" :key="r.targetId" class="pin">
      <!-- the card's own menu unpins it (keyboard and touch) -->
      <ResultCard :result="r" :task="taskUi.task!" compact @locate="locate" />
    </div>
    <div v-if="!pinned.length && stalePins" class="pin stale tiny">{{ tl('固定的结果已过期：题目或场景已修改，请重新求解。') }}</div>
    <div v-if="waiting" class="pin stale tiny">{{ tl('固定到画面的结果在打开这道题的演示（“看演示”）后显示在这里。') }}</div>
  </div>
</template>

<style scoped>
.canvas-pins { position: absolute; top: 10px; right: 10px; z-index: 5; display: flex; flex-direction: column; gap: 6px; width: min(300px, 46%); pointer-events: none; }
.pin { position: relative; pointer-events: auto; background: var(--pane); border-radius: var(--radius-group); box-shadow: var(--shadow); }
.pin.stale { padding: 8px 10px; color: var(--text-2); }
</style>
