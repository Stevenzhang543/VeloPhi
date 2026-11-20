<script setup lang="ts">
/**
 * Which solver computes the scene (26.58, D137): a small pill next to "重新计算". Exact (event-driven), reduced
 * (Moreau–Jean, chosen or fallen back to) or the many-body solver (approximate). The title says what that means for
 * the numbers; a click opens the scene's calculation settings.
 */
import { computed } from 'vue'
import { tl } from '../../i18n'
import { state } from '../store'
import { solverKind } from '../solver'

const kind = computed(() => solverKind(state.scene.settings.integrator, state.stale ? null : state.recording?.reducedFrom ?? null))
const TEXT = computed(() => ({
  exact: { label: tl('精确'), title: tl('事件驱动求解：约束力由加速度方程精确解出，碰撞、开始滑动等事件定位到约 10⁻¹² s，误差受容差控制。') },
  reduced: { label: tl('降阶'), title: tl('Moreau–Jean 时间步进：碰撞与摩擦在每一步内近似处理，事件时刻不精确定位，公式对照仅供参考。') },
  soft: { label: tl('实时多体'), title: tl('软步进多体求解器：子步、软接触与休眠，可算几百个物体；一阶精度，接触允许毫米级重叠，公式对照仅供参考。') }
}[kind.value]))
function open() {
  state.page = 'studio'
  state.rightTab = 'settings'
}
</script>

<template>
  <button class="solver-badge" :class="kind" :title="TEXT.title" :aria-label="tl('计算方式：{0}', [TEXT.label])" @click="open">
    {{ TEXT.label }}
  </button>
</template>

<style scoped>
/* 26.65 (D291): in the status bar — text, no pill and no dot (the result's lamp is beside it); the reduced and the
   many-body solvers are coloured, the exact one is not */
.solver-badge { display: inline-flex; align-items: center; height: calc(var(--status-h) - 6px); padding: 0 6px; border: 0; border-radius: var(--radius-row); background: none; color: var(--text-2); font: inherit; cursor: pointer; white-space: nowrap; }
.solver-badge:hover { background: var(--fill); color: var(--text); }
.dot { display: none; }
.reduced { color: var(--warning); }
.soft { color: var(--accent); }
</style>
