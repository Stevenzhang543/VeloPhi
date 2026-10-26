<script setup lang="ts">
/**
 * Scene tab of the right panel: the scene's own settings (name, description, g, potential-energy zero,
 * duration mode — unbounded, stop at a time, or stop some seconds after an event (decision D26) — Δt, integrator,
 * tolerances) in display units, and the statistics of the last run. Application preferences are on the
 * settings page.
 */
import { tl, paren } from '../../i18n'
import { msgText } from '../../i18n/locale'
import { computed } from 'vue'
import { state, edit, runSimulation, stopRun, showToast } from '../store'
import { fmtQ, settings } from '../settings'
import NumField from './NumField.vue'
import Icon from './Icon.vue'
import Section from './Section.vue'
import type { IntegratorKind, StopKind } from '../../core/scene/types'
import { MAX_DURATION, STOP_KINDS, finiteDuration } from '../../core/scene/types'

const s = computed(() => state.scene.settings)
const gMag = computed(() => Math.hypot(s.value.gravity.x, s.value.gravity.y))

/** Direction of gravity (rad from +x); straight down when g is zero. */
const gDir = computed(() => (gMag.value > 0 ? Math.atan2(s.value.gravity.y, s.value.gravity.x) : -Math.PI / 2))
/** Gravity vector of size v along d; components that are zero up to rounding are exactly 0 (fingerprints). */
function gravityOf(v: number, d: number) {
  const c = Math.cos(d), sn = Math.sin(d)
  return { x: Math.abs(c) < 1e-12 ? 0 : v * c, y: Math.abs(sn) < 1e-12 ? 0 : v * sn }
}
function setG(v: number) { const d = gDir.value; edit(sc => { sc.settings.gravity = gravityOf(v, d) }) }
function setGDir(d: number) { const v = gMag.value; edit(sc => { sc.settings.gravity = gravityOf(v, d) }) }
/** Gravitational constant: the real one, or G = 1 for classroom orbits. */
const G_REAL = 6.674e-11
function setGravitation(on: boolean) { edit(sc => { if (on) sc.settings.gravitation = { G: sc.settings.gravitation?.G ?? G_REAL }; else delete sc.settings.gravitation }) }
function setGConst(v: number) { if (v > 0) edit(sc => { sc.settings.gravitation = { G: v } }) }
const rec = computed(() => (state.stale ? null : state.recording))
const frames = computed(() => Math.round(finiteDuration(s.value) / s.value.outputStep) + 1)

/** Duration mode: unbounded, stop at a time, stop some seconds after the first event of a kind. */
type DurationMode = 'unbounded' | 'time' | 'event'
const mode = computed<DurationMode>(() => (s.value.duration !== null ? 'time' : s.value.stopAt ? 'event' : 'unbounded'))
const STOP_LABELS: Record<StopKind, string> = { stick: tl('共速（相对静止）'), slip: tl('开始相对滑动'), separate: tl('分离（离开接触面）'), touch: tl('接触（含碰撞）'), impact: tl('碰撞'), slack: tl('绳松弛'), taut: tl('绳绷紧') }
function setMode(m: DurationMode) {
  edit(sc => {
    const st = sc.settings
    if (m === 'unbounded') { st.duration = null; st.stopAt = null }
    else if (m === 'time') { st.duration = st.duration ?? st.legacyDuration; st.stopAt = null }
    else { st.duration = null; st.stopAt = st.stopAt ?? { on: 'stick', after: 1 } }
  })
}
/** Fingerprint shown: the 26.49 one of a bounded run, the rolling one (up to a time) of an unbounded run. */
const fingerprint = computed(() => {
  const r = rec.value
  if (!r) return null
  if (r.hash) return { hash: r.hash, upTo: r.unbounded ? (r.frameCount - 1) * r.dt : null }
  const f = state.run.fingerprint ?? r.rolling ?? null
  return f ? { hash: f.hash, upTo: f.t } : null
})
const STOP_REASONS: Record<string, string> = { duration: tl('到达设定时长'), stopAt: tl('到达停止条件'), rest: tl('检测到永久静止'), user: tl('已手动停止'), error: tl('出错停止'), pulley: tl('物体到达滑轮'), restApprox: tl('近似静止（速度与加速度持续 1 s 低于 10⁻⁶）') }
/** Engine line of the solver information (D29): Rust/WASM, or the TypeScript fallback and why. */
const engineText = computed(() => {
  const r = state.run
  if (r.engine === 'wasm') return `Rust${paren('WebAssembly')}`
  const why = r.engineReason === 'settings' ? tl('设置中选择') : r.engineReason === 'no-worker' ? tl('未使用后台线程') : r.engineReason ? tl('Rust 引擎不可用：{0}', [r.engineReason]) : ''
  return why ? `TypeScript${paren(why)}` : 'TypeScript'
})
const MB = (bytes: number) => `${(bytes / 1048576).toFixed(bytes < 10 * 1048576 ? 1 : 0)} MB`
function copyFingerprint(hash: string) {
  navigator.clipboard?.writeText(hash).then(() => showToast(tl('指纹已复制')), () => showToast(tl('无法访问剪贴板'), true))
}
/** Time from which the run fell back to Moreau–Jean time stepping (reduced accuracy), or null. */
const reducedFrom = computed(() => rec.value?.reducedFrom ?? null)
</script>

<template>
  <div class="settings">
    <Section id="scene.info" :title="tl('场景')">
      <div class="group">
        <div class="row"><label>{{ tl('名称') }}</label><input class="field grow" :value="state.scene.name" @change="edit(sc => { sc.name = ($event.target as HTMLInputElement).value || sc.name })" /></div>
        <div class="row desc"><label>{{ tl('说明') }}</label><textarea class="field grow" rows="3" :value="state.scene.description" @change="edit(sc => { sc.description = ($event.target as HTMLTextAreaElement).value })" /></div>
      </div>
    </Section>

    <Section id="scene.physics" :title="tl('物理参数')">
      <div class="group">
        <div class="row"><label>{{ tl('重力加速度 g') }}</label><NumField class="grow" :model-value="gMag" unit="m/s²" :min="0" @update:model-value="setG" /></div>
        <div class="row"><label>{{ tl('方向') }}</label><NumField class="grow" :model-value="gDir" unit="rad" @update:model-value="setGDir" /><button class="btn small ghost" :disabled="s.gravity.x === 0 && s.gravity.y <= 0" :title="tl('恢复为竖直向下')" @click="setGDir(-Math.PI / 2)">{{ tl('向下') }}</button></div>
        <div class="row"><label>{{ tl('万有引力') }}</label><label class="check grow"><input type="checkbox" :checked="!!s.gravitation" @change="setGravitation(($event.target as HTMLInputElement).checked)" />{{ tl('物体之间相互吸引 F = Gm₁m₂/r²') }}</label></div>
        <template v-if="s.gravitation">
          <div class="row"><label>{{ tl('引力常量 G') }}</label><NumField class="grow" :model-value="s.gravitation.G" unit="N·m²/kg²" :min="1e-30" @update:model-value="setGConst" /></div>
          <div class="row"><label /><span class="grow"><button class="btn small" @click="setGConst(G_REAL)">{{ tl('真实值') }}</button> <button class="btn small" @click="setGConst(1)">{{ tl('教学用 G = 1') }}</button></span></div>
          <div class="tiny muted note">{{ tl('每一对有质量的物体之间都有引力（固定物体也吸引，但自己不动）；引力势能 −Gm₁m₂/r 计入能量账本。研究行星运动时通常把上面的重力设为 0。') }}</div>
        </template>
        <div class="row"><label>{{ tl('势能零点 y₀') }}</label><NumField class="grow" :model-value="s.energyZeroY" unit="m" @update:model-value="v => edit(sc => { sc.settings.energyZeroY = v })" /></div>
      </div>
    </Section>

    <Section id="scene.solver" :title="tl('求解与记录')" :open="false">
      <div class="group">
        <div class="row"><label>{{ tl('仿真时长') }}</label>
          <select class="field grow" :value="mode" @change="setMode(($event.target as HTMLSelectElement).value as DurationMode)">
            <option value="unbounded">{{ tl('不限时长（持续计算，可随时停止）') }}</option>
            <option value="time">{{ tl('到某时刻停止') }}</option>
            <option value="event">{{ tl('某事件后 x 秒停止') }}</option>
          </select>
        </div>
        <div v-if="s.duration !== null" class="row"><label>{{ tl('停止时刻') }}</label><NumField class="grow" :model-value="s.duration" unit="s" :min="0.001" :max="MAX_DURATION" @update:model-value="v => edit(sc => { sc.settings.duration = v })" /></div>
        <template v-if="mode === 'event' && s.stopAt">
          <div class="row"><label>{{ tl('停止事件') }}</label>
            <select class="field grow" :value="s.stopAt.on" @change="edit(sc => { if (sc.settings.stopAt) sc.settings.stopAt.on = ($event.target as HTMLSelectElement).value as StopKind })">
              <option v-for="k in STOP_KINDS" :key="k" :value="k">{{ tl('首次{0}', [STOP_LABELS[k]]) }}</option>
            </select>
          </div>
          <div class="row"><label>{{ tl('之后再算') }}</label><NumField class="grow" :model-value="s.stopAt.after" unit="s" :min="0" :max="MAX_DURATION" @update:model-value="v => edit(sc => { if (sc.settings.stopAt) sc.settings.stopAt.after = v })" /></div>
        </template>
        <div class="row"><label>{{ tl('记录步长 Δt') }}</label><NumField class="grow" :model-value="s.outputStep" unit="s" :min="1e-5" :max="0.1" :step="0.001" @update:model-value="v => edit(sc => { sc.settings.outputStep = v })" /></div>
        <div class="row"><label>{{ tl('积分方法') }}</label>
          <select class="field grow" :value="s.integrator" @change="edit(sc => { sc.settings.integrator = ($event.target as HTMLSelectElement).value as IntegratorKind })">
            <option value="dopri5">{{ tl('Dormand–Prince 5(4) 自适应（推荐）') }}</option>
            <option value="rk4">{{ tl('经典四阶 Runge–Kutta（定步长 Δt）') }}</option>
            <option value="euler">{{ tl('半隐式欧拉（定步长，教学对比用）') }}</option>
            <option value="gauss4">{{ tl('Gauss–Legendre 四阶辛方法（定步长，长时间保能量）') }}</option>
            <option value="moreau">{{ tl('时间步进（Moreau–Jean，精度降级）') }}</option>
          </select>
        </div>
        <div v-if="s.integrator === 'gauss4'" class="tiny muted note">{{ tl('隐式辛方法：守恒系统（行星轨道、单摆、弹簧振子）长时间计算时能量只在很小范围内起伏，不会逐渐漂移；有摩擦或阻尼时照常计算，但不再有这一优点。') }}</div>
        <div v-if="s.integrator === 'moreau'" class="reduced-note small">
          <span class="badge warn">{{ tl('精度降级') }}</span>
          <span>{{ tl('按 Δt 逐步推进，碰撞与摩擦在每一步内近似处理；事件时刻不再精确定位，公式对照仅供参考。适合接触很多、事件驱动算不动的场景。') }}</span>
        </div>
        <template v-if="s.integrator === 'dopri5'">
          <div class="row"><label>{{ tl('相对容差') }}</label><NumField class="grow" :model-value="s.relTol" :min="1e-14" :max="1e-2" @update:model-value="v => edit(sc => { sc.settings.relTol = v })" /></div>
          <div class="row"><label>{{ tl('绝对容差') }}</label><NumField class="grow" :model-value="s.absTol" :min="1e-16" :max="1e-2" @update:model-value="v => edit(sc => { sc.settings.absTol = v })" /></div>
        </template>
        <div class="tiny muted note">
          <template v-if="s.duration !== null">{{ tl('共 {0} 帧。', [frames]) }}</template>
          <template v-else>{{ tl('按需计算：始终领先播放位置一段时间（设置页可调），所有物体永久静止时自动停止。') }}</template>
          {{ tl('每个 Δt 记录一帧完整状态；自适应积分的步长不超过 Δt，也不跨越记录时刻。碰撞、开始滑动、共速等事件的时刻单独精确定位（约 10⁻¹² s），不受 Δt 限制。') }}
        </div>
      </div>
    </Section>

    <div class="row link-row">
      <span class="tiny muted grow">{{ tl('单位、有效数字、外观与视觉效果在设置页中调整。') }}</span>
      <button class="btn small ghost" @click="state.page = 'settings'"><Icon name="settings" :size="14" />{{ tl('打开设置') }}</button>
    </div>

    <template v-if="rec">
      <div v-if="reducedFrom !== null" class="reduced-note small">
        <span class="badge warn">{{ tl('精度降级') }}</span>
        <span v-if="s.integrator === 'moreau'">{{ tl('整个过程使用 Moreau–Jean 时间步进计算。') }}</span>
        <span v-else>{{ tl('事件过于密集，自 t = {0} 起改用 Moreau–Jean 时间步进；此后的数值精度降级，事件时刻不精确定位，公式对照仅供参考。', [fmtQ(reducedFrom, 's', 6)]) }}</span>
      </div>
      <Section id="scene.run" :title="tl('本次计算')" :open="false">
        <template #badge><span v-if="!rec.completed && !(rec.unbounded && state.computing)" class="badge warn">{{ tl('未完成') }}</span><span v-if="rec.unbounded && state.computing" class="badge info">{{ tl('持续计算') }}</span><span v-if="reducedFrom !== null" class="badge warn">{{ tl('精度降级') }}</span></template>
        <div class="group stats small">
          <div class="row"><label>{{ tl('计算引擎') }}</label><span>{{ engineText }}</span></div>
          <div class="row"><label>{{ tl('已算到') }}</label><span class="mono">t = {{ fmtQ(state.run.tComputed || (rec.frameCount - 1) * rec.dt, 's', 5) }}<template v-if="state.run.paused">{{ tl('（领先播放位置，暂停中）') }}</template></span></div>
          <div v-if="state.run.speed > 0" class="row"><label>{{ tl('计算速度') }}</label><span class="mono">{{ tl('{0} × 实时', [state.run.speed >= 100 ? state.run.speed.toFixed(0) : state.run.speed.toPrecision(3)]) }}</span></div>
          <div v-if="rec.unbounded" class="row"><label>{{ tl('记录内存') }}</label><span class="mono">{{ MB(state.run.memoryBytes) }} / {{ settings.sim.memoryMB }} MB</span></div>
          <div v-if="rec.unbounded" class="row"><label>{{ tl('计算块') }}</label><span class="mono">{{ tl('在内存 {0} / 共 {1}，检查点 {2}，已重算 {3}', [state.run.residentChunks, state.run.chunks, state.run.checkpoints, state.run.rebuilds]) }}</span></div>
          <div class="row"><label>{{ tl('记录帧数') }}</label><span class="mono">{{ rec.frameCount }}</span></div>
          <div v-if="rec.stopReason" class="row"><label>{{ tl('结束原因') }}</label><span>{{ STOP_REASONS[rec.stopReason] ?? rec.stopReason }}</span></div>
          <div class="row"><label>{{ tl('积分步 / 拒绝') }}</label><span class="mono">{{ rec.stats.steps }} / {{ rec.stats.rejected }}</span></div>
          <div class="row"><label>{{ tl('事件数') }}</label><span class="mono">{{ rec.stats.events }}</span></div>
          <div class="row"><label>{{ tl('约束投影') }}</label><span class="mono">{{ tl('位置 ≤ {0}，速度 ≤ {1}', [fmtQ(rec.stats.maxPositionCorrection, 'm', 2), fmtQ(rec.stats.maxVelocityCorrection, 'm/s', 2)]) }}</span></div>
          <div class="row"><label>{{ tl('计算耗时') }}</label><span class="mono">{{ rec.stats.wallMs }} ms</span></div>
          <div v-if="fingerprint" class="row"><label>{{ tl('结果指纹') }}</label><span class="mono fp" :title="fingerprint.hash">{{ fingerprint.upTo !== null ? tl('截至 {0} · ', [fmtQ(fingerprint.upTo, 's', 4)]) : '' }}SHA-256 {{ fingerprint.hash.slice(0, 16) }}…</span><button class="btn small ghost" :title="tl('复制完整指纹')" @click="copyFingerprint(fingerprint.hash)">{{ tl('复制') }}</button></div>
          <div v-for="(w, i) in rec.warnings" :key="i" class="row warn-row"><span class="badge warn">{{ tl('提示') }}</span><span class="grow">{{ msgText(w) }}</span></div>
          <div class="row">
            <button v-if="rec.unbounded && state.computing" class="btn" @click="stopRun()">{{ tl('停止计算') }}</button>
            <button v-else class="btn" :disabled="state.computing" @click="runSimulation()">{{ tl('重新计算') }}</button>
            <span class="tiny muted">{{ tl('同一场景每次计算结果逐位一致（指纹相同）。') }}</span>
          </div>
        </div>
      </Section>
    </template>
    <div v-else-if="state.computing" class="tiny muted note">{{ tl('正在计算… {0}%', [Math.round(state.progress * 100)]) }}</div>
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
