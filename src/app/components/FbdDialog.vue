<script setup lang="ts">
/**
 * 26.52 free-body diagram dialog (D62): the forces on one body at one time as a textbook drawing (teaching/fbd.ts),
 * with a force table and the check ΣF = m·a. The time slider moves the playback too, so the canvas behind shows
 * the same instant. Export as SVG or PNG.
 *
 * Mounted by App.vue while `state.showFbd` is true (and a recording exists).
 */
import { tl } from '../../i18n'
import { computed, reactive, ref, watch } from 'vue'
import { state, showToast, pause, seekContinuous } from '../store'
import { settings } from '../settings'
import { fbdData, fbdSvg, fbdTable, FBD_DEFAULTS } from '../../teaching/fbd'
import type { FbdOptions } from '../../teaching/fbd'
import { formatSig } from '../../units/units'
import { svgToPng } from '../../export/formulaImage'
import { safeName } from '../../export/courseware'
import { saveFile } from '../../platform/files'
import { logEvent } from '../trialLog'
import Icon from './Icon.vue'

const rec = computed(() => (state.stale ? null : state.recording))
const bodies = computed(() => rec.value?.system.model.dynamic ?? [])
const tMax = computed(() => (rec.value ? Math.max(0, (rec.value.frameCount - 1) * rec.value.dt) : 0))

const sel = state.selection
const bodyId = ref<string>(sel && bodies.value.some(b => b.id === sel.id) ? sel.id : bodies.value[0]?.id ?? '')
const time = ref(Math.min(state.time, tMax.value))
const opt = reactive<FbdOptions>({ ...FBD_DEFAULTS, ...settings.teaching.fbd, theme: 'light', digits: state.digits })
const busy = ref(false)

// Remember the drawing options (not the theme and digits)
watch(opt, o => { Object.assign(settings.teaching.fbd, { layout: o.layout, body: o.body, magnitudes: o.magnitudes, decompose: o.decompose, resultant: o.resultant }) }, { deep: true })
// The canvas follows the slider
watch(time, t => { pause(); seekContinuous(t) })

const data = computed(() => (rec.value && bodyId.value ? fbdData(rec.value, time.value, bodyId.value, opt.theme) : null))
const drawing = computed(() => (data.value ? fbdSvg(data.value, opt) : null))
const rows = computed(() => (data.value ? fbdTable(data.value) : []))
const f = (v: number) => formatSig(v, state.digits)
const check = computed(() => {
  const d = data.value
  if (!d) return null
  return { net: Math.hypot(d.net.x, d.net.y), ma: Math.hypot(d.ma.x, d.ma.y), ok: Math.hypot(d.net.x - d.ma.x, d.net.y - d.ma.y) <= 1e-6 * Math.max(1, Math.hypot(d.ma.x, d.ma.y)) }
})
const hasOther = computed(() => rows.value.some(r => r.kind === 'other'))

function fileBase(): string {
  const d = data.value
  return safeName(`${state.scene.name}-${tl('受力分析')}-${d?.name ?? ''}-t${formatSig(time.value, 3)}s`)
}
async function saveSvg() {
  const g = drawing.value
  if (!g) return
  const path = await saveFile(g.svg, `${fileBase()}.svg`, [{ name: 'SVG', extensions: ['svg'] }])
  if (path) { showToast(tl('已保存 {0}', [path])); logEvent('teach.fbd', { format: 'svg' }) }
}
async function savePng() {
  const g = drawing.value
  if (!g) return
  busy.value = true
  try {
    const png = await svgToPng(g.svg, g.width, g.height, 2)
    const path = await saveFile(png, `${fileBase()}.png`, [{ name: 'PNG', extensions: ['png'] }])
    if (path) { showToast(tl('已保存 {0}', [path])); logEvent('teach.fbd', { format: 'png' }) }
  } catch (e) {
    showToast(tl('导出失败：{0}', [(e as Error).message]), true)
  } finally { busy.value = false }
}
function close() { state.showFbd = false }
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="close">
    <div class="dialog fbd" role="dialog" :aria-label="tl('受力分析图')">
      <div class="dialog-header"><Icon name="fbd" :size="18" />{{ tl('受力分析图') }}<span class="spacer" /><button class="btn icon ghost" :title="tl('关闭')" @click="close"><Icon name="close" /></button></div>
      <div v-if="!rec" class="dialog-body"><div class="empty">{{ tl('请先运行仿真（结果需与当前场景一致）。') }}</div></div>
      <div v-else-if="!bodies.length" class="dialog-body"><div class="empty">{{ tl('场景中没有可分析的动态物体。') }}</div></div>
      <div v-else class="dialog-body">
        <div class="cols">
          <section class="controls">
            <div class="group">
              <div class="row"><label>{{ tl('研究对象') }}</label><select v-model="bodyId" class="field grow"><option v-for="b in bodies" :key="b.id" :value="b.id">{{ b.name }}</option></select></div>
              <div class="row"><label>{{ tl('时刻') }}</label><input v-model.number="time" type="range" class="grow" min="0" :max="tMax" :step="rec.dt" /><span class="mono small tval">{{ formatSig(time, 4) }} s</span></div>
            </div>
            <div class="group-title">{{ tl('画法') }}</div>
            <div class="group opts">
              <div class="row"><label>{{ tl('作用点') }}</label>
                <div class="segmented"><button :class="{ on: opt.layout === 'actual' }" :disabled="opt.body === 'particle'" @click="opt.layout = 'actual'">{{ tl('实际作用点') }}</button><button :class="{ on: opt.layout === 'concurrent' || opt.body === 'particle' }" @click="opt.layout = 'concurrent'">{{ tl('共点力') }}</button></div>
              </div>
              <div class="row"><label>{{ tl('物体画成') }}</label>
                <div class="segmented"><button :class="{ on: opt.body === 'shape' }" @click="opt.body = 'shape'">{{ tl('形状') }}</button><button :class="{ on: opt.body === 'particle' }" @click="opt.body = 'particle'">{{ tl('质点模型') }}</button></div>
              </div>
              <div class="row"><label>{{ tl('分解') }}</label>
                <select v-model="opt.decompose" class="field grow"><option value="none">{{ tl('不分解') }}</option><option value="axes">{{ tl('沿水平、竖直方向') }}</option><option value="incline">{{ tl('沿接触面与垂直接触面') }}</option></select>
              </div>
              <label class="check small"><input v-model="opt.magnitudes" type="checkbox" />{{ tl('标出大小') }}</label>
              <label class="check small"><input v-model="opt.resultant" type="checkbox" />{{ tl('画出合力 {0}', [tl('F合')]) }}</label>
              <label class="check small"><input v-model="opt.theme" type="checkbox" true-value="dark" false-value="light" />{{ tl('深色背景') }}</label>
            </div>
            <div class="group-title">{{ tl('各力') }}</div>
            <table class="forces small">
              <thead><tr><th>{{ tl('作用力') }}</th><th>{{ tl('大小') }}</th><th>{{ tl('方向') }}</th><th>F<sub>x</sub></th><th>F<sub>y</sub></th></tr></thead>
              <tbody>
                <tr v-for="(r, i) in rows" :key="i"><td><b :style="{ color: r.color }">{{ r.symbol }}</b></td><td class="mono">{{ f(r.magnitude) }} N</td><td class="mono">{{ formatSig(r.angle, 3) }}°</td><td class="mono">{{ f(r.fx) }}</td><td class="mono">{{ f(r.fy) }}</td></tr>
              </tbody>
            </table>
            <div v-if="check" class="check-line small" :class="{ ok: check.ok }">
              <Icon :name="check.ok ? 'check' : 'info'" :size="13" />{{ tl('合力 |ΣF| = {0} N，m·|a| = {1} N', [f(check.net), f(check.ma)]) }}
            </div>
            <div v-if="hasOther" class="tiny muted note">{{ tl('“{0}”是齿轮、滑轮上的绳等未单独列出的约束力之和（= m·a − ΣF），保证各力之和等于 m·a。', [tl('F其他')]) }}</div>
            <div class="tiny muted note">{{ tl('力来自求解器在该时刻的约束力，与画布上的受力箭头同源。方向为与 +x 轴的夹角（逆时针为正）。') }}</div>
          </section>
          <section class="preview-col">
            <div class="preview" :class="{ dark: opt.theme === 'dark' }" v-html="drawing?.svg ?? ''" />
          </section>
        </div>
      </div>
      <div class="dialog-footer">
        <button class="btn" @click="close">{{ tl('关闭') }}</button>
        <span class="spacer" />
        <button class="btn" :disabled="!drawing" @click="saveSvg"><Icon name="download" />SVG</button>
        <button class="btn primary" :disabled="!drawing || busy" @click="savePng"><Icon name="download" />{{ busy ? tl('生成中…') : 'PNG' }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fbd { width: min(1040px, calc(100vw - 48px)); }
.cols { display: grid; grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr); gap: 16px; }
.row > label { width: 72px; flex: 0 0 auto; }
.tval { width: 64px; text-align: right; }
.opts { display: flex; flex-direction: column; gap: 4px; padding: 6px 10px 8px; }
.opts .row { padding: 2px 0; }
.forces { width: 100%; border-collapse: collapse; margin: 2px 0 6px; }
.forces th, .forces td { text-align: right; padding: 3px 6px; border-bottom: 1px solid var(--separator); white-space: nowrap; }
.forces th:first-child, .forces td:first-child { text-align: left; }
.forces th { color: var(--text-3); font-weight: 500; }
.check-line { display: flex; align-items: center; gap: 6px; color: var(--warning); margin: 4px 2px; }
.check-line.ok { color: var(--success, #16a34a); }
.note { line-height: 1.5; margin: 4px 2px; }
.preview-col { display: flex; min-height: 0; }
.preview { flex: 1; min-height: 420px; max-height: 64vh; overflow: auto; display: flex; align-items: center; justify-content: center; border: 1px solid var(--separator); border-radius: var(--radius-group); background: #fff; padding: 8px; }
.preview.dark { background: #141518; }
.preview :deep(svg) { max-width: 100%; height: auto; }
@media (max-width: 860px) { .cols { grid-template-columns: 1fr; } }
</style>
