<script setup lang="ts">
/**
 * Convergence study (26.63, D237; analysis/convergence.ts): pick a fixed-step method, a quantity and a time; the scene
 * is computed at steps h, h/2, h/4, … and compared with the exact solver. A table (value, error, observed order, energy
 * drift), a log–log plot of the error against the step with the slope of the method's formal order, the sources of
 * the differences in words, and the manifest and CSV to repeat it. The user's scene is not changed. Runs are
 * synchronous on the interface thread and limited in length.
 */
import { computed, nextTick, ref } from 'vue'
import { tl } from '../../i18n'
import { vDialog } from '../focusTrap'
import { state, showToast } from '../store'
import { fmtQ } from '../settings'
import { shell } from '../layout'
import { sceneQuantities } from '../../engine/observe'
import { convergenceStudy, studyCsv, studySteps, FORMAL_ORDER } from '../../analysis/convergence'
import type { Study, StudyMethod } from '../../analysis/convergence'
import { saveFile } from '../../platform/files'
import { formatSig } from '../../units/units'
import NumField from './NumField.vue'
import Icon from './Icon.vue'

const close = () => { shell.convergence = false }
const METHODS = computed((): Array<{ id: StudyMethod; label: string; note: string }> => [
  { id: 'rk4', label: tl('RK4（经典四阶）'), note: tl('四阶；每步四次求导') },
  { id: 'gauss4', label: tl('Gauss（两级，辛）'), note: tl('四阶；长时间能量有界') },
  { id: 'euler', label: tl('欧拉法'), note: tl('一阶；教学用') },
  { id: 'moreau', label: tl('时间步进（Moreau–Jean）'), note: tl('一阶；事件只分辨到一步') },
  { id: 'softstep', label: tl('实时多体（软步进）'), note: tl('一阶；软接触') }
])
const method = ref<StudyMethod>(state.scene.settings.integrator === 'dopri5' ? 'rk4' : (state.scene.settings.integrator as StudyMethod))
const quantities = computed(() => { try { return sceneQuantities(state.scene) } catch { return [] } })
const firstMoving = state.scene.bodies.find(b => b.kind !== 'static')
// A position is the plain choice: speeds and energies of a conservative scene often converge one order faster
const quantity = ref(firstMoving && quantities.value.some(q => q.id === `${firstMoving.id}.x`) ? `${firstMoving.id}.x` : state.scene.watch.find(w => quantities.value.some(q => q.id === w)) ?? quantities.value[0]?.id ?? '')
const t = ref(Math.round(10 * Math.min(2, Math.max(0.2, state.scene.settings.duration ?? state.scene.settings.legacyDuration ?? 1))) / 10)
const h0 = ref(0.02)
const levels = ref(5)
const steps = computed(() => studySteps(Math.max(0.01, t.value), Math.max(1e-5, h0.value), levels.value))
const cost = computed(() => steps.value.reduce((n, h) => n + Math.round(t.value / h), 0))
const tooMany = computed(() => cost.value > 3_000_000 || (method.value === 'softstep' && (1 / steps.value.at(-1)! > 2000 || 1 / steps.value[0] < 30)))
const busy = ref(false)
const progress = ref('')
const error = ref('')
const study = ref<Study | null>(null)
const unit = computed(() => quantities.value.find(q => q.id === quantity.value)?.unit ?? '')
const sci = (v: number | null) => (v === null || !Number.isFinite(v) ? '—' : v === 0 ? '0' : v.toExponential(2))
const ord = (v: number | null) => (v === null || !Number.isFinite(v) ? '—' : v.toFixed(2))

async function run() {
  error.value = ''; study.value = null; busy.value = true; progress.value = tl('准备…')
  await nextTick()
  await new Promise(r => setTimeout(r, 30))
  try {
    study.value = convergenceStudy(state.scene, { method: method.value, quantity: quantity.value, t: t.value, h0: h0.value, levels: levels.value })
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally { busy.value = false; progress.value = '' }
}

/** Points of the log–log plot (h on x, error on y), with the box they span. */
const plot = computed(() => {
  const s = study.value
  if (!s) return null
  const pts = s.rows.filter(r => r.error > 0).map(r => ({ x: Math.log10(r.h), y: Math.log10(r.error) }))
  if (pts.length < 2) return null
  const x0 = Math.min(...pts.map(p => p.x)), x1 = Math.max(...pts.map(p => p.x))
  const yLo = Math.min(...pts.map(p => p.y)), yHi = Math.max(...pts.map(p => p.y))
  const W = 520, H = 190, padL = 46, padB = 26, padT = 10, padR = 12
  const sx = (x: number) => padL + ((x - x0) / Math.max(1e-9, x1 - x0)) * (W - padL - padR)
  const span = Math.max(0.5, yHi - yLo)
  const sy = (y: number) => padT + (1 - (y - yLo) / span) * (H - padT - padB)
  // the guide: a line of the formal order through the finest point
  const last = pts[0].x < pts[pts.length - 1].x ? pts[0] : pts[pts.length - 1]
  const first = pts[0].x < pts[pts.length - 1].x ? pts[pts.length - 1] : pts[0]
  const gy = last.y + s.formal * (first.x - last.x)
  const ticksY: Array<{ y: number; label: string }> = []
  for (let e = Math.ceil(yLo); e <= Math.floor(yLo + span); e += Math.max(1, Math.round(span / 4))) ticksY.push({ y: sy(e), label: `1e${e}` })
  return {
    W, H, padL, padB,
    line: pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' '),
    dots: pts.map(p => ({ x: sx(p.x), y: sy(p.y) })),
    guide: `M${sx(last.x).toFixed(1)},${sy(last.y).toFixed(1)} L${sx(first.x).toFixed(1)},${Math.max(padT, sy(gy)).toFixed(1)}`,
    ticksX: s.rows.map(r => ({ x: sx(Math.log10(r.h)), label: r.h >= 0.001 ? formatSig(r.h, 2) : r.h.toExponential(1) })),
    ticksY
  }
})

const verdict = computed(() => {
  const s = study.value
  if (!s) return null
  if (s.order === null) return { tone: 'info', text: tl('误差已经小到参考解自身的精度，无法判断阶数（这个量在这种方法下基本是精确的，或步长已经足够小）。') }
  const d = s.order - s.formal
  if (!s.settled && Math.abs(d) > 0.35) return { tone: 'info', text: tl('最细两级的观测阶是 {0}，还在随步长变化：还没有进入渐近区。减小 h₀ 或增加减半次数再看（理论阶 {1}）。', [s.order.toFixed(2), s.formal]) }
  if (Math.abs(d) <= 0.35) return { tone: 'ok', text: tl('观测阶 {0}，与方法的理论阶 {1} 一致。', [s.order.toFixed(2), s.formal]) }
  if (d < 0) return { tone: 'warn', text: tl('观测阶 {0}，低于理论阶 {1}：区间内可能有步进法只能分辨到一步的事件（碰撞、绳绷紧、开始滑动），或步长还不够小。', [s.order.toFixed(2), s.formal]) }
  return { tone: 'info', text: tl('观测阶 {0}，高于理论阶 {1}：常见于误差恰好变号或这个量对该方法有额外的对称性，换一个时刻或物理量再看。', [s.order.toFixed(2), s.formal]) }
})

async function saveCsv() {
  if (!study.value) return
  try { const p = await saveFile(studyCsv(study.value), `${state.scene.name || 'scene'}-convergence.csv`, [{ name: tl('CSV 表格'), extensions: ['csv'] }]); if (p) showToast(tl('已保存 {0}', [p.split(/[\\/]/).pop() ?? p])) } catch (e) { showToast(tl('保存失败：{0}', [(e as Error).message]), true) }
}
async function saveManifest() {
  if (!study.value) return
  try { const p = await saveFile(JSON.stringify(study.value.manifest, null, 1), `${state.scene.name || 'scene'}-convergence.json`, [{ name: 'JSON', extensions: ['json'] }]); if (p) showToast(tl('已保存 {0}', [p.split(/[\\/]/).pop() ?? p])) } catch (e) { showToast(tl('保存失败：{0}', [(e as Error).message]), true) }
}
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="close">
    <div v-dialog="close" class="dialog conv" role="dialog" :aria-label="tl('收敛性研究')">
      <div class="dialog-header"><Icon name="converge" :size="18" />{{ tl('收敛性研究') }}<span class="badge info">{{ tl('研究预览') }}</span><span class="spacer" /><button class="btn icon ghost" :title="tl('关闭')" :aria-label="tl('关闭')" @click="close"><Icon name="close" /></button></div>
      <div class="dialog-body">
        <p class="small lead">{{ tl('同一个场景、同一时刻，用一种定步长方法按步长 h、h/2、h/4… 各算一次，与精确事件求解器（相对容差 10⁻¹²）比较。误差随步长减小的快慢就是这种方法的“阶”。当前场景不会被修改。') }}</p>
        <div class="form">
          <label class="f"><span>{{ tl('方法') }}</span>
            <select v-model="method" class="field" data-ui="conv-method"><option v-for="m in METHODS" :key="m.id" :value="m.id">{{ m.label }} — {{ m.note }}</option></select>
          </label>
          <label class="f"><span>{{ tl('物理量') }}</span>
            <select v-model="quantity" class="field" data-ui="conv-quantity"><option v-for="q in quantities" :key="q.id" :value="q.id">{{ q.label }}（{{ q.id }}）</option></select>
          </label>
          <label class="f s"><span>{{ tl('时刻 T') }}</span><NumField :model-value="t" unit="s" :min="0.01" :max="60" :step="0.1" @update:model-value="v => (t = v)" /></label>
          <label class="f s"><span>{{ tl('最大步长 h₀') }}</span><NumField :model-value="h0" unit="s" :min="0.0001" :max="0.2" :step="0.005" @update:model-value="v => (h0 = v)" /></label>
          <label class="f s"><span>{{ tl('减半次数') }}</span>
            <select v-model.number="levels" class="field" data-ui="conv-levels"><option v-for="n in [3, 4, 5, 6, 7]" :key="n" :value="n">{{ n }}</option></select>
          </label>
        </div>
        <div class="line small">
          <span class="muted">{{ tl('步长 {0} → {1} s，共约 {2} 步', [formatSig(steps[0], 3), formatSig(steps.at(-1)!, 3), cost.toLocaleString()]) }}</span>
          <span v-if="tooMany" class="warn">{{ method === 'softstep' ? tl('实时多体求解器的步长须在 1/2000–1/30 s 之间') : tl('步数太多，请增大步长、减少次数或缩短时刻') }}</span>
          <span class="spacer" />
          <button class="btn primary" data-ui="conv-run" :disabled="busy || tooMany || !quantity" @click="run"><Icon name="run" :size="14" />{{ busy ? tl('计算中…') : tl('开始') }}</button>
        </div>
        <div v-if="error" class="err small" role="alert">{{ tl('未能完成：{0}', [error]) }}</div>

        <template v-if="study">
          <div v-if="verdict" class="verdict" :class="verdict.tone"><Icon :name="verdict.tone === 'ok' ? 'okCircle' : verdict.tone === 'warn' ? 'alert' : 'info'" :size="16" />{{ verdict.text }}</div>
          <div class="cols">
            <table class="tbl mono">
              <thead><tr><th>h / s</th><th>{{ tl('值') }}<span v-if="unit" class="muted"> / {{ unit }}</span></th><th>{{ tl('误差') }}</th><th>{{ tl('阶') }}</th><th :title="tl('不用参考解：由相邻三次结果之差算出的阶')">{{ tl('自收敛阶') }}</th><th :title="tl('机械能偏离初值的最大值')">max |ΔE| / J</th></tr></thead>
              <tbody>
                <tr v-for="r in study.rows" :key="r.h"><td>{{ r.h >= 0.001 ? formatSig(r.h, 3) : r.h.toExponential(2) }}</td><td>{{ formatSig(r.value, 9) }}</td><td>{{ sci(r.error) }}</td><td>{{ ord(r.order) }}</td><td>{{ ord(r.selfOrder) }}</td><td>{{ sci(r.drift) }}</td></tr>
                <tr class="ref"><td>{{ tl('参考') }}</td><td>{{ formatSig(study.reference.value, 12) }}</td><td colspan="4" class="note">{{ tl('精确事件求解器，{0} 个事件；自身精度约 {1}（误差小到这个量级后不再计算阶）', [study.reference.events, sci(study.reference.accuracy)]) }}</td></tr>
              </tbody>
            </table>
            <svg v-if="plot" class="plot" :viewBox="`0 0 ${plot.W} ${plot.H}`" role="img" :aria-label="tl('误差随步长（双对数）')">
              <line :x1="plot.padL" :x2="plot.W - 8" :y1="plot.H - plot.padB" :y2="plot.H - plot.padB" class="axis" />
              <line :x1="plot.padL" :x2="plot.padL" y1="6" :y2="plot.H - plot.padB" class="axis" />
              <g v-for="k in plot.ticksY" :key="k.label"><line :x1="plot.padL" :x2="plot.W - 8" :y1="k.y" :y2="k.y" class="grid" /><text :x="plot.padL - 5" :y="k.y + 3" text-anchor="end">{{ k.label }}</text></g>
              <text v-for="k in plot.ticksX" :key="k.label" :x="k.x" :y="plot.H - 9" text-anchor="middle">{{ k.label }}</text>
              <path :d="plot.guide" class="guide" />
              <path :d="plot.line" class="err-line" />
              <circle v-for="(d, i) in plot.dots" :key="i" :cx="d.x" :cy="d.y" r="3.2" class="dot" />
              <text :x="plot.W - 12" y="18" text-anchor="end" class="legend">{{ tl('虚线：斜率 {0}（理论阶）', [FORMAL_ORDER[study.method]]) }}</text>
            </svg>
          </div>
          <ul class="small why">
            <li>{{ tl('精确事件求解器把碰撞、开始滑动、绳绷紧等事件定位到约 10⁻¹² s，并在事件之间用自适应高阶方法积分，所以可以当作参考解。') }}</li>
            <li v-if="study.dissipative">{{ tl('这个场景本身不守恒机械能（摩擦、阻力、驱动力或非弹性碰撞），“max |ΔE|”包含了物理上的能量变化，不只是数值漂移。') }}</li>
            <li v-else>{{ tl('这个场景的机械能守恒，“max |ΔE|”就是数值漂移：欧拉法随时间增长，Gauss 方法保持有界。') }}</li>
            <li>{{ tl('“自收敛阶”不需要参考解：它只比较相邻三次结果，适合没有精确解可比的场景。') }}</li>
          </ul>
        </template>
      </div>
      <div class="dialog-footer">
        <span v-if="study" class="tiny muted">{{ tl('参考值 {0}', [fmtQ(study.reference.value, unit, 10)]) }}</span>
        <span class="spacer" />
        <button class="btn" :disabled="!study" @click="saveManifest"><Icon name="download" />{{ tl('复现清单（JSON）') }}</button>
        <button class="btn" :disabled="!study" @click="saveCsv"><Icon name="download" />CSV</button>
        <button class="btn primary" @click="close">{{ tl('好') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.conv { width: min(980px, calc(100vw - 32px)); }
.lead { margin: 0 0 10px; color: var(--text-2); line-height: 1.55; }
.form { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1.5fr) repeat(3, minmax(96px, 0.6fr)); gap: 10px; }
.f { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.f > span { font-size: var(--type-tiny); color: var(--text-3); font-weight: 600; }
.f .field { width: 100%; }
.line { display: flex; align-items: center; gap: 12px; margin: 10px 0 4px; flex-wrap: wrap; }
.warn { color: var(--warning); }
.err { color: var(--danger); margin: 6px 0; }
.verdict { display: flex; gap: 8px; align-items: baseline; padding: 8px 12px; border-radius: var(--radius-group); margin: 8px 0; background: var(--accent-soft); line-height: 1.5; }
.verdict.ok { background: var(--success-soft); }
.verdict.warn { background: var(--warning-soft); }
.verdict :deep(.icon) { flex: 0 0 auto; transform: translateY(3px); }
.cols { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 14px; align-items: start; }
.tbl { width: 100%; border-collapse: collapse; font-size: var(--type-tiny); display: block; overflow-x: auto; }
.tbl th { text-align: right; font-weight: 600; color: var(--text-3); font-size: var(--type-tiny); padding: 4px 6px; border-bottom: 1px solid var(--separator); font-family: var(--font-ui); white-space: nowrap; }
.tbl td { text-align: right; padding: 4px 5px; border-bottom: 1px solid var(--separator); white-space: nowrap; }
.tbl .ref td { color: var(--text-2); border-bottom: 0; }
.tbl .note { text-align: left; font-family: var(--font-ui); font-size: var(--type-tiny); }
.plot { width: 100%; height: auto; background: var(--group); border-radius: var(--radius-group); }
.plot text { font-size: 10px; fill: var(--text-3); font-family: var(--font-mono); }
.plot .legend { font-family: var(--font-ui); }
.axis { stroke: var(--separator); }
.grid { stroke: var(--separator); stroke-dasharray: 2 4; opacity: 0.6; }
.guide { fill: none; stroke: var(--text-3); stroke-width: 1.2; stroke-dasharray: 5 4; }
.err-line { fill: none; stroke: var(--accent); stroke-width: 1.8; }
.dot { fill: var(--pane); stroke: var(--accent); stroke-width: 1.8; }
.why { margin: 10px 0 0; padding-left: 18px; line-height: 1.6; color: var(--text-2); }
@media (max-width: 820px) { .form { grid-template-columns: 1fr 1fr; } .cols { grid-template-columns: 1fr; } .tbl { display: block; overflow-x: auto; } }
</style>
