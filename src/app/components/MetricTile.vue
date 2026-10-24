<script setup lang="ts">
/**
 * Dashboard tile of one watched quantity: name, value at the current frame in the display unit, and a sparkline
 * of the whole recording drawn up to the current time (the path is built once per recording; playback only
 * moves a clip edge).
 */
import { computed, useId } from 'vue'
import { sparkPath } from '../live'
import { fmtNum, fmtQ, unitLabel } from '../settings'
import Tex from './Tex.vue'

const props = defineProps<{
  label: string
  owner: string
  symbol: string
  unit: string
  /** Value at the current frame (SI). */
  value: number | null
  /** Samples of the recording (SI) and the sample count of the complete run. */
  series: Float64Array | null
  total: number
  /** Current time as a fraction of the complete run (0 … 1). */
  at: number
  color: string
}>()
defineEmits<{ (e: 'remove'): void; (e: 'chart'): void }>()

const W = 200, H = 34
const spark = computed(() => (props.series && props.series.length > 1 ? sparkPath(props.series, props.total, W, H) : null))
/**
 * Round-off next to a much larger range reads as 0 (−9e-17 m/s is a resting body, not a speed); the exact
 * solver value stays in the tooltip and in the watch panel.
 */
const tidy = (v: number) => {
  const sp = spark.value
  const scale = sp ? Math.max(Math.abs(sp.min), Math.abs(sp.max)) : 0
  return Math.abs(v) <= scale * 1e-9 ? 0 : v
}
const clipW = computed(() => Math.max(0, Math.min(1, props.at)) * W)
const clipId = `spark-${useId().replace(/[^\w-]/g, "-")}`
</script>

<template>
  <div class="tile" :style="{ '--c': color }">
    <div class="head" :title="`${owner} · ${label}`">
      <Tex class="sym" :tex="symbol" />
      <span class="name small">{{ label }}</span>
    </div>
    <div class="owner tiny muted">{{ owner }}</div>
    <div class="value mono" :title="value === null ? '' : `仿真值 ${value}`"><span class="num">{{ fmtNum(value === null ? null : tidy(value), unit) }}</span><span class="unit">{{ unitLabel(unit) }}</span></div>
    <svg v-if="spark && spark.d" class="spark" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" aria-hidden="true">
      <path :d="spark.d" class="ghost" vector-effect="non-scaling-stroke" />
      <clipPath :id="clipId"><rect x="-2" y="-4" :width="clipW + 2" :height="H + 8" /></clipPath>
      <path :d="spark.d" class="line" :clip-path="`url(#${clipId})`" vector-effect="non-scaling-stroke" />
      <line :x1="clipW" :x2="clipW" y1="0" :y2="H" class="now" vector-effect="non-scaling-stroke" />
    </svg>
    <div v-if="spark && spark.d" class="range tiny muted mono"><span>{{ fmtQ(tidy(spark.min), unit, 3) }}</span><span>{{ fmtQ(tidy(spark.max), unit, 3) }}</span></div>
    <div class="ops">
      <button class="op" title="在曲线中显示" @click="$emit('chart')">⌁</button>
      <button class="op" title="移出监视列表" @click="$emit('remove')">×</button>
    </div>
  </div>
</template>

<style scoped>
.tile { position: relative; background: var(--group); border-radius: var(--radius-group); padding: 8px 10px 6px; min-width: 0; border-top: 2px solid var(--c); }
.head { display: flex; align-items: baseline; gap: 6px; min-width: 0; padding-right: 30px; }
.sym { color: var(--c); flex: 0 0 auto; }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.owner { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: -1px; }
.value { display: flex; align-items: baseline; gap: 4px; margin: 2px 0 2px; }
.num { font-size: calc(19px * var(--zoom)); font-weight: 650; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; }
.unit { font-size: var(--type-tiny); color: var(--text-3); }
.spark { display: block; width: 100%; height: 34px; overflow: visible; }
.spark .ghost { fill: none; stroke: var(--c); stroke-width: 1.2; opacity: 0.22; }
.spark .line { fill: none; stroke: var(--c); stroke-width: 1.6; }
.spark .now { stroke: var(--c); stroke-width: 1; opacity: 0.6; }
.range { display: flex; justify-content: space-between; margin-top: 1px; }
.ops { position: absolute; top: 4px; right: 4px; display: flex; gap: 0; opacity: 0; transition: opacity 120ms ease; }
.tile:hover .ops, .tile:focus-within .ops { opacity: 1; }
.op { width: 20px; height: 20px; border: 0; border-radius: 5px; background: transparent; cursor: pointer; color: var(--text-3); font-size: 13px; line-height: 1; padding: 0; }
.op:hover { background: var(--hover); color: var(--text); }
</style>
