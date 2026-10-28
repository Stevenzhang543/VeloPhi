<script setup lang="ts">
/**
 * Convergence study of the quantum lab (26.56, D108): grid refinement of the free Gaussian packet against the
 * independent closed form of model Q08, and time-step halving in a harmonic potential (self-convergence, labelled as
 * such). Runs on request in the core; the table shows errors in the same units and the observed orders. Exports the
 * table with the run manifest (solver, physics version, inputs hashed).
 */
import { ref } from 'vue'
import { tl } from '../../../i18n'
import { DEFAULT_CASE, ROUNDING, gridStudy, stepStudy } from '../../../teaching/convergence'
import type { GridRow, StepRow } from '../../../teaching/convergence'
import { exportDocument } from '../../models/run'
import { saveFile } from '../../../platform/files'

const grid = ref<{ reference: { x: number; sx: number; sp: number }; rows: GridRow[] } | null>(null)
const steps = ref<StepRow[] | null>(null)
const ms = ref(0)
const error = ref('')
function run() {
  error.value = ''
  const t0 = performance.now()
  try {
    grid.value = gridStudy()
    steps.value = stepStudy()
  } catch (e) { error.value = String((e as Error).message ?? e) }
  ms.value = performance.now() - t0
}
const e = (x: number) => (x <= ROUNDING ? tl('≤ 舍入') : x.toExponential(2))
const p = (x: number | null) => (x === null ? '—' : x.toFixed(2))
async function exportStudy() {
  if (!grid.value || !steps.value) return
  await saveFile(exportDocument('convergence', { case: DEFAULT_CASE, grid: [64, 128, 256, 512, 1024], steps: [600, 1200, 2400, 4800], harmonic: { omega: 0.5, n: 256, L: 40 } }, { grid: grid.value, steps: steps.value }, 'quantum', 'CODATA2022'), 'velophi-quantum-convergence.json', [{ name: 'JSON', extensions: ['json'] }])
}
</script>

<template>
  <details class="lab-block lab-details">
    <summary>{{ tl('收敛研究（模型 Q08）') }}</summary>
    <p class="tiny muted lab-note">{{ tl('自由高斯波包 x₀ = −5、p₀ = 2、σ₀ = 1，t = 2（约化单位 ħ = m = 1，长度单位 nm）。网格加密与 Q08 的独立闭式解比较；时间步长在谐振势中逐次减半，只能做自收敛比较（不是独立参照）。') }}</p>
    <div class="row"><button class="btn small" @click="run">{{ tl('运行收敛研究') }}</button><button class="btn ghost small" :disabled="!grid" @click="exportStudy">{{ tl('导出（含运行清单）') }}</button><span v-if="grid" class="tiny muted">{{ tl('{0} ms', [ms.toFixed(0)]) }}</span></div>
    <p v-if="error" class="tiny err" role="alert">{{ error }}</p>
    <template v-if="grid">
      <div class="tiny">{{ tl('参照（Q08）：⟨x⟩ = {0}，σx = {1}', [grid.reference.x.toPrecision(10), grid.reference.sx.toPrecision(10)]) }}</div>
      <!-- relative errors against Q08; the spectral grid has no fixed order, so none is shown (26.56 hand check) -->
      <div class="scroll">
        <table class="tab tiny">
          <caption>{{ tl('网格加密（区域 80 nm，无吸收层）：相对误差') }}</caption>
          <thead><tr><th>N</th><th>Δx</th><th>⟨x⟩</th><th>σx</th><th>{{ tl('范数') }}</th></tr></thead>
          <tbody><tr v-for="r in grid.rows" :key="r.n"><td>{{ r.n }}</td><td>{{ r.dx.toPrecision(3) }}</td><td>{{ e(r.errX) }}</td><td>{{ e(r.errS) }}</td><td>{{ e(r.errNorm) }}</td></tr></tbody>
        </table>
      </div>
      <div v-if="steps" class="scroll">
        <table class="tab tiny">
          <caption>{{ tl('时间步长（谐振势 ω = 0.5，自收敛）') }}</caption>
          <thead><tr><th>{{ tl('步数') }}</th><th>Δt</th><th>⟨x⟩</th><th :title="tl('与上一行之差')">{{ tl('差值') }}</th><th>{{ tl('阶') }}</th></tr></thead>
          <tbody><tr v-for="r in steps" :key="r.steps"><td>{{ r.steps }}</td><td>{{ r.dt.toPrecision(3) }}</td><td>{{ r.x.toPrecision(8) }}</td><td>{{ r.diff === null ? '—' : e(r.diff) }}</td><td>{{ p(r.order) }}</td></tr></tbody>
        </table>
      </div>
      <p class="tiny muted lab-note">{{ tl('空间离散用傅里叶谱方法，分辨足够后误差直接降到舍入；Strang 分裂的时间误差为二阶，阶应接近 2。') }}</p>
    </template>
  </details>
</template>

<style scoped>
.row { display: flex; gap: 8px; align-items: center; margin: 6px 0; }
.tab { border-collapse: collapse; margin: 6px 0; width: 100%; }
.tab caption { text-align: left; font-weight: 600; padding: 2px 0; }
.tab td, .tab th { padding: 1px 3px; border-bottom: 1px solid var(--separator); text-align: right; font-family: var(--font-mono); white-space: nowrap; }
.scroll { overflow-x: auto; max-width: 100%; }
.err { color: var(--danger, #dc2626); }
</style>
