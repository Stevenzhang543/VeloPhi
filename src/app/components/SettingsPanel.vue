<script setup lang="ts">
/**
 * Scene tab of the right panel: the scene's own settings (name, description, g, potential-energy zero,
 * duration, Δt, integrator, tolerances) in display units, and the statistics of the last run. Application
 * preferences are on the settings page.
 */
import { computed } from 'vue'
import { state, edit, runSimulation } from '../store'
import { fmtQ } from '../settings'
import NumField from './NumField.vue'
import Icon from './Icon.vue'
import type { IntegratorKind } from '../../core/scene/types'

const s = computed(() => state.scene.settings)
const gMag = computed(() => Math.hypot(s.value.gravity.x, s.value.gravity.y))

function setG(v: number) { edit(sc => { sc.settings.gravity = { x: 0, y: -v } }) }
const rec = computed(() => (state.stale ? null : state.recording))
const frames = computed(() => Math.round(s.value.duration / s.value.outputStep) + 1)
/** Time from which the run fell back to Moreau–Jean time stepping (reduced accuracy), or null. */
const reducedFrom = computed(() => rec.value?.reducedFrom ?? null)
</script>

<template>
  <div class="settings">
    <div class="group-title">场景</div>
    <div class="group">
      <div class="row"><label>名称</label><input class="field grow" :value="state.scene.name" @change="edit(sc => { sc.name = ($event.target as HTMLInputElement).value || sc.name })" /></div>
      <div class="row desc"><label>说明</label><textarea class="field grow" rows="3" :value="state.scene.description" @change="edit(sc => { sc.description = ($event.target as HTMLTextAreaElement).value })" /></div>
    </div>

    <div class="group-title">物理参数</div>
    <div class="group">
      <div class="row"><label>重力加速度 g</label><NumField class="grow" :model-value="gMag" unit="m/s²" :min="0" @update:model-value="setG" /></div>
      <div class="row"><label>方向</label><span class="grow small muted">竖直向下（−y）{{ s.gravity.x !== 0 ? `；当前含水平分量 ${fmtQ(s.gravity.x, 'm/s²')}` : '' }}</span></div>
      <div class="row"><label>势能零点 y₀</label><NumField class="grow" :model-value="s.energyZeroY" unit="m" @update:model-value="v => edit(sc => { sc.settings.energyZeroY = v })" /></div>
    </div>

    <div class="group-title">求解与记录</div>
    <div class="group">
      <div class="row"><label>仿真时长</label><NumField class="grow" :model-value="s.duration" unit="s" :min="0.001" :max="600" @update:model-value="v => edit(sc => { sc.settings.duration = v })" /></div>
      <div class="row"><label>记录步长 Δt</label><NumField class="grow" :model-value="s.outputStep" unit="s" :min="1e-5" :max="0.1" :step="0.001" @update:model-value="v => edit(sc => { sc.settings.outputStep = v })" /></div>
      <div class="row"><label>积分方法</label>
        <select class="field grow" :value="s.integrator" @change="edit(sc => { sc.settings.integrator = ($event.target as HTMLSelectElement).value as IntegratorKind })">
          <option value="dopri5">Dormand–Prince 5(4) 自适应（推荐）</option>
          <option value="rk4">经典四阶 Runge–Kutta（定步长 Δt）</option>
          <option value="euler">半隐式欧拉（定步长，教学对比用）</option>
          <option value="moreau">时间步进（Moreau–Jean，精度降级）</option>
        </select>
      </div>
      <div v-if="s.integrator === 'moreau'" class="reduced-note small">
        <span class="badge warn">精度降级</span>
        <span>按 Δt 逐步推进，碰撞与摩擦在每一步内近似处理；事件时刻不再精确定位，公式对照仅供参考。适合接触很多、事件驱动算不动的场景。</span>
      </div>
      <template v-if="s.integrator === 'dopri5'">
        <div class="row"><label>相对容差</label><NumField class="grow" :model-value="s.relTol" :min="1e-14" :max="1e-2" @update:model-value="v => edit(sc => { sc.settings.relTol = v })" /></div>
        <div class="row"><label>绝对容差</label><NumField class="grow" :model-value="s.absTol" :min="1e-16" :max="1e-2" @update:model-value="v => edit(sc => { sc.settings.absTol = v })" /></div>
      </template>
      <div class="tiny muted note">
        共 {{ frames }} 帧。每个 Δt 记录一帧完整状态；自适应积分的步长不超过 Δt，也不跨越记录时刻。碰撞、开始滑动、共速等事件的时刻单独精确定位（约 10⁻¹² s），不受 Δt 限制。
      </div>
    </div>

    <div class="row link-row">
      <span class="tiny muted grow">单位、有效数字、外观与视觉效果在设置页中调整。</span>
      <button class="btn small ghost" @click="state.page = 'settings'"><Icon name="settings" :size="14" />打开设置</button>
    </div>

    <template v-if="rec">
      <div class="group-title">本次计算<span v-if="!rec.completed" class="badge warn">未完成</span><span v-if="reducedFrom !== null" class="badge warn">精度降级</span></div>
      <div v-if="reducedFrom !== null" class="reduced-note small">
        <span class="badge warn">精度降级</span>
        <span v-if="s.integrator === 'moreau'">整个过程使用 Moreau–Jean 时间步进计算。</span>
        <span v-else>事件过于密集，自 t = {{ fmtQ(reducedFrom, 's', 6) }} 起改用 Moreau–Jean 时间步进；此后的数值精度降级，事件时刻不精确定位，公式对照仅供参考。</span>
      </div>
      <div class="group stats small">
        <div class="row"><label>记录帧数</label><span class="mono">{{ rec.frameCount }}</span></div>
        <div class="row"><label>积分步 / 拒绝</label><span class="mono">{{ rec.stats.steps }} / {{ rec.stats.rejected }}</span></div>
        <div class="row"><label>事件数</label><span class="mono">{{ rec.stats.events }}</span></div>
        <div class="row"><label>约束投影</label><span class="mono">位置 ≤ {{ fmtQ(rec.stats.maxPositionCorrection, 'm', 2) }}，速度 ≤ {{ fmtQ(rec.stats.maxVelocityCorrection, 'm/s', 2) }}</span></div>
        <div class="row"><label>计算耗时</label><span class="mono">{{ rec.stats.wallMs }} ms</span></div>
        <div class="row"><label>结果指纹</label><span class="mono fp" :title="rec.hash">SHA-256 {{ rec.hash.slice(0, 16) }}…</span></div>
        <div v-for="w in rec.warnings" :key="w" class="row warn-row"><span class="badge warn">提示</span><span class="grow">{{ w }}</span></div>
        <div class="row"><button class="btn" :disabled="state.computing" @click="runSimulation()">重新计算</button><span class="tiny muted">同一场景每次计算结果逐位一致（指纹相同）。</span></div>
      </div>
    </template>
    <div v-else-if="state.computing" class="tiny muted note">正在计算… {{ Math.round(state.progress * 100) }}%</div>
  </div>
</template>

<style scoped>
.note { padding: 6px 2px 4px; line-height: 1.5; }
.desc { align-items: flex-start; padding: 6px 0; }
.stats .row > label { width: 110px; }
.fp { font-size: var(--type-tiny); }
.warn-row { align-items: flex-start; padding: 4px 0; }
.link-row { margin: 2px 2px 4px; }
.reduced-note { display: flex; gap: 8px; align-items: flex-start; background: var(--warning-soft); color: var(--text); border-radius: var(--radius-group); padding: 8px 10px; margin: 2px 0 10px; line-height: 1.5; }
.reduced-note .badge { flex: 0 0 auto; }
</style>
