<script setup lang="ts">
/**
 * Solver comparison (26.58, D136): the same scene for the same time, once with the exact (event-driven) solver and
 * once with the many-body solver; the largest distance between corresponding bodies and the difference of the
 * mechanical energy over time, with the sources of the difference in words. The user's scene is not changed.
 * Runs are synchronous on the interface thread, limited to a few seconds of simulated time; with many bodies the
 * exact run may be slow, so it asks first.
 */
import { computed, nextTick, ref } from 'vue'
import { vDialog } from '../focusTrap'
import { tl } from '../../i18n'
import { state } from '../store'
import { fmtQ } from '../settings'
import { simulate } from '../../engine/recording'
import type { Recording } from '../../engine/recording'
import { positions } from '../../engine/views'
import { MANY_BODIES, compareTracks, withIntegrator } from '../solver'
import type { Comparison, Track } from '../solver'
import NumField from './NumField.vue'
import Icon from './Icon.vue'

const close = () => { state.showSolverCompare = false }
const dynamic = computed(() => state.scene.bodies.filter(b => b.kind !== 'static'))
const many = computed(() => dynamic.value.length > MANY_BODIES)
const seconds = ref(Math.min(3, state.scene.settings.duration ?? state.scene.settings.legacyDuration ?? 3))
const busy = ref(false)
const error = ref('')
const result = ref<(Comparison & { exactMs: number; softMs: number; names: string[] }) | null>(null)

function track(rec: Recording, samples: number): Track {
  const last = rec.frameCount - 1
  const stride = Math.max(1, Math.floor(last / samples))
  const got = positions(rec, 0, last + 1, stride)
  const t: number[] = [], xy: Float64Array[] = []
  const frames: number[] = []
  for (let p = 0; p < got.frames.length; p++) {
    frames.push(got.frames[p])
    t.push(got.frames[p] * rec.dt)
    xy.push(got.xy.slice(2 * p * got.n, 2 * (p + 1) * got.n))
  }
  const led = rec.session.call<{ ledger: Array<{ mechanical: number }> }>({ op: 'ledger', frames }).ledger
  return { t, xy, energy: led.map(l => l.mechanical) }
}

async function run() {
  error.value = ''
  result.value = null
  busy.value = true
  await nextTick()
  await new Promise(r => setTimeout(r, 30))
  try {
    const d = Math.max(0.05, Math.min(30, seconds.value))
    const base = state.scene.settings.integrator === 'softstep' ? 'dopri5' : state.scene.settings.integrator
    const t0 = performance.now()
    const exact = simulate(withIntegrator(state.scene, base), { duration: d, maxSteps: 20_000_000 })
    const t1 = performance.now()
    const soft = simulate(withIntegrator(state.scene, 'softstep'), { duration: d })
    const t2 = performance.now()
    if (exact.error) throw new Error(tl('精确求解器未能完成：{0}', [String(exact.error)]))
    const c = compareTracks(track(exact, 400), track(soft, 400))
    result.value = { ...c, exactMs: t1 - t0, softMs: t2 - t1, names: exact.system.model.dynamic.map(b => b.name) }
    exact.session.free(); soft.session.free()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

/** Polyline of a series in a w × h box (y from 0 to max, or symmetric about 0). */
function path(t: number[], v: number[], w: number, h: number, symmetric: boolean): string {
  if (!t.length) return ''
  const tMax = t[t.length - 1] || 1
  const m = Math.max(1e-12, ...v.map(Math.abs))
  return v.map((y, i) => `${i ? 'L' : 'M'}${((t[i] / tMax) * w).toFixed(1)},${(symmetric ? h / 2 - (y / m) * (h / 2) : h - (y / m) * h).toFixed(1)}`).join(' ')
}
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="close">
    <div v-dialog="close" class="dialog compare-dialog" role="dialog" :aria-label="tl('求解器对照')">
      <div class="dialog-header">{{ tl('求解器对照') }}<span class="spacer" /><button class="btn icon ghost" :title="tl('关闭')" @click="close"><Icon name="close" /></button></div>
      <div class="dialog-body">
        <p class="small">{{ tl('同一个场景、同样的时长，分别用精确求解器（事件驱动）与实时多体求解器（软步进）计算，比较每个运动物体的位置与总机械能。当前场景不会被修改。') }}</p>
        <div class="row"><label>{{ tl('对照时长') }}</label><NumField class="grow" :model-value="seconds" unit="s" :min="0.05" :max="30" :step="0.5" @update:model-value="v => (seconds = v)" /></div>
        <div v-if="many" class="warn-note small"><Icon name="info" :size="14" />{{ tl('场景中有 {0} 个运动物体，精确求解器可能要算很久（界面在计算时不响应）。可以先缩短对照时长。', [dynamic.length]) }}</div>
        <div class="row actions"><button class="btn primary" :disabled="busy || !dynamic.length" @click="run"><Icon name="run" :size="14" />{{ busy ? tl('计算中…') : tl('开始对照') }}</button></div>
        <div v-if="error" class="error small" role="alert">{{ error }}</div>
        <template v-if="result">
          <div class="summary">
            <div class="tile"><div class="k">{{ tl('最大位置差 |Δr|') }}</div><div class="v mono">{{ fmtQ(result.maxDr, 'm', 4) }}</div><div class="tiny muted">{{ tl('{0}，t = {1}', [result.names[result.maxDrBody] ?? '—', fmtQ(result.maxDrAt, 's', 4)]) }}</div></div>
            <div class="tile"><div class="k">{{ tl('最大机械能差 ΔE') }}</div><div class="v mono">{{ fmtQ(result.maxDE, 'J', 4) }}</div><div class="tiny muted">{{ tl('t = {0}（实时多体 − 精确）', [fmtQ(result.maxDEAt, 's', 4)]) }}</div></div>
            <div class="tile"><div class="k">{{ tl('计算用时') }}</div><div class="v mono">{{ tl('{0} ms / {1} ms', [result.exactMs.toFixed(0), result.softMs.toFixed(0)]) }}</div><div class="tiny muted">{{ tl('精确 / 实时多体') }}</div></div>
          </div>
          <svg class="plot" viewBox="0 0 520 120" role="img" :aria-label="tl('位置差随时间')">
            <path :d="path(result.t, result.dr, 520, 110, false)" class="dr" transform="translate(0,5)" />
          </svg>
          <div class="tiny muted">{{ tl('上图：任一物体的最大位置差 |Δr|(t)；下图：机械能差 ΔE(t)（虚线为 0）。') }}</div>
          <svg class="plot" viewBox="0 0 520 120" role="img" :aria-label="tl('机械能差随时间')">
            <line x1="0" x2="520" y1="60" y2="60" class="zero" />
            <path :d="path(result.t, result.dE, 520, 110, true)" class="de" transform="translate(0,5)" />
          </svg>
          <ul class="small why">
            <li>{{ tl('一阶时间步进：自由运动的位置误差约为 ½·g·h·t（h 为子步长）。') }}</li>
            <li>{{ tl('软接触：接触允许毫米级重叠，碰撞与摩擦在每个子步内近似；碰撞时刻不精确定位。') }}</li>
            <li>{{ tl('多物体碰撞、堆积与倾倒对初值很敏感：微小差别会长成宏观差别，这时比较统计结果（如高尔顿板的分布）比比较单个物体更有意义。') }}</li>
            <li>{{ tl('休眠：静止的物体速度被置零，能量的微小残余计入损失。') }}</li>
          </ul>
        </template>
      </div>
      <div class="dialog-footer"><span class="spacer" /><button class="btn primary" @click="close">{{ tl('好') }}</button></div>
    </div>
  </div>
</template>

<style scoped>
.compare-dialog { width: min(640px, calc(100vw - 48px)); }
.summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 10px 0; }
.tile { background: var(--panel-2); border-radius: var(--radius-group); padding: 8px 10px; }
.tile .k { font-size: var(--type-small, 12px); color: var(--text-2); }
.tile .v { font-size: 18px; font-weight: 600; margin: 2px 0; }
.plot { width: 100%; height: 120px; background: var(--panel-2); border-radius: var(--radius-group); margin: 6px 0 2px; }
.plot .dr { fill: none; stroke: var(--accent); stroke-width: 1.6; }
.plot .de { fill: none; stroke: var(--warning); stroke-width: 1.6; stroke-dasharray: 5 3; }
.plot .zero { stroke: var(--border); stroke-dasharray: 3 3; }
.warn-note { display: flex; gap: 6px; align-items: flex-start; background: var(--warning-soft); border-radius: var(--radius-group); padding: 6px 10px; margin: 6px 0; }
.why { margin: 8px 0 0; padding-left: 18px; line-height: 1.6; }
.actions { justify-content: flex-start; }
.error { color: var(--danger, #dc2626); margin: 6px 0; }
@media (max-width: 560px) { .summary { grid-template-columns: 1fr; } }
</style>
