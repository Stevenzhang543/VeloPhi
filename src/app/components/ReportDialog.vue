<script setup lang="ts">
/**
 * Lab report dialog: collects scene parameters (display units), key-moment screenshots, the selected curves,
 * the formula comparison with errors, events and predictions into one self-contained HTML file
 * (export/report.ts). "打印 / PDF" opens it in a new window and calls print(); choose "另存为 PDF" in the
 * system dialog.
 *
 * Mounted by App.vue while `state.showReport` is true (and a recording exists); closes itself by setting the
 * flag to false. No props, no emits.
 */
import { computed, reactive, ref, watch } from 'vue'
import { state, showToast, viewCamera } from '../store'
import { fmtQ, settings, unitLabel, toDisp } from '../settings'
import type { Recording } from '../../core/solver/simulation'
import type { QuantityDef } from '../../core/observe/quantities'
import { listQuantities, quantitySeries } from '../../core/observe/quantities'
import { ENGINE_VERSION } from '../../core/scene/types'
import { DARK, LIGHT, computeTrajectories, eventLabel, vectorScales } from '../../render/renderer'
import { THRESHOLDS } from '../../formula/match'
import { cardsForMoment, changeWho, keyMoments, nameOf, reducedNotice } from '../../export/moments'
import type { KeyMoment } from '../../export/moments'
import { stillPng } from '../../export/still'
import { PROJECTOR_STYLE } from '../../render/frame'
import type { ImageBackground } from '../../export/still'
import { VERDICT_TEXT, cardImage, relErrorText, shownCards } from '../../export/formulaImage'
import { CHART_LIGHT, SERIES_COLORS, chartPng } from '../../export/chartImage'
import type { ReportFigure, ReportInput, ReportTable } from '../../export/report'
import { buildReportHtml, printHtml } from '../../export/report'
import { safeName } from '../../export/courseware'
import { timeLabel } from '../../export/video'
import { dataUrl } from '../../export/zip'
import { GRADE_TEXT, comparePrediction, readPredictions, targetLabel } from '../../analysis/prediction'
import { templateById } from '../../templates'
import { saveFile } from '../../platform/files'
import { logEvent } from '../trialLog'
import Icon from './Icon.vue'

const rec = computed(() => (state.stale ? null : state.recording))
const opt = reactive({
  title: state.scene.name,
  notes: '',
  params: true, shots: true, curves: true, formulas: true, formulaImages: false, events: true, predictions: true,
  shotBg: (settings.export.imageBackground === 'theme' ? 'white' : settings.export.imageBackground) as ImageBackground
})
const hasPredictions = computed(() => readPredictions(state.scene).length > 0)
const curveIds = computed(() => {
  const r = rec.value
  if (!r) return []
  const known = new Set(listQuantities(r.system).map(q => q.id))
  const ids = (state.chart.length ? state.chart : r.scene.watch).filter(id => known.has(id))
  return ids.slice(0, 8)
})

const MAX_SHOTS = 8
const moments = computed<KeyMoment[]>(() => (rec.value ? keyMoments(rec.value, { events: true, segments: false, ends: true }) : []))
/** At most MAX_SHOTS moments, spread over the list (first and last kept). */
function spread<T>(list: T[], n: number): T[] {
  if (list.length <= n) return list
  return Array.from({ length: n }, (_, i) => list[Math.round(i * (list.length - 1) / (n - 1))])
}

const busy = ref(false)
const stepText = ref('')
const html = ref<string | null>(null)
watch(() => ({ ...opt }), () => { html.value = null }, { deep: true })
watch(() => [state.recording, state.stale, state.digits, settings.units], () => { html.value = null }, { deep: true })

// ---- Content ----
const KIND: Record<string, string> = { particle: '质点', rigid: '刚体', static: '固定' }
const INTEGRATOR: Record<string, string> = { dopri5: 'Dormand–Prince 5(4) 自适应', rk4: '经典四阶 Runge–Kutta', euler: '半隐式欧拉' }
const d = () => state.digits
const pair = (x: number, y: number, unit: string) => `(${fmtQ(x, unit, d()).replace(` ${unitLabel(unit)}`, '')}, ${fmtQ(y, unit, d())})`

function parameterTables(r: Recording): ReportTable[] {
  const sc = r.scene, st = sc.settings
  const out: ReportTable[] = []
  const g = Math.hypot(st.gravity.x, st.gravity.y)
  out.push({ title: '场景与求解', header: ['项目', '数值'], rows: [
    ['重力加速度 g', fmtQ(g, 'm/s²', d())], ['仿真时长', fmtQ(st.duration, 's', d())], ['记录步长 Δt', fmtQ(st.outputStep, 's', d())],
    ['积分方法', INTEGRATOR[st.integrator] ?? st.integrator], ['相对容差 / 绝对容差', `${st.relTol} / ${st.absTol}`], ['重力势能零点 y₀', fmtQ(st.energyZeroY, 'm', d())],
    ['记录帧数', String(r.frameCount)]
  ] })
  const tpl = (sc.extra as { template?: { id?: string; values?: Record<string, number> } } | undefined)?.template
  const info = tpl?.id ? templateById(tpl.id) : undefined
  if (info && tpl?.values) out.push({ title: `模板参数（${info.name}）`, header: ['参数', '数值'], rows: info.params.map(p => [p.label, `${tpl.values![p.key] ?? p.value}${p.unit ? ` ${p.unit}` : ''}`]), note: '模板参数按模板原始单位列出；场景创建后若有修改，以下方物体参数为准。' })
  const dyn = sc.bodies.filter(b => b.kind !== 'static')
  if (dyn.length) out.push({ title: '运动物体', header: ['名称', '类型', '质量', '初位置 (x, y)', '初速度 (vₓ, v_y)', '初角度', 'μs', 'μk', 'e'], rows: dyn.map(b => [
    b.name, KIND[b.kind] ?? b.kind, fmtQ(b.mass, 'kg', d()), pair(b.position.x, b.position.y, 'm'), pair(b.velocity.x, b.velocity.y, 'm/s'), fmtQ(b.angle, 'rad', d()),
    String(b.material.muS), String(b.material.muK), String(b.material.restitution)
  ]) })
  const fixed = sc.bodies.filter(b => b.kind === 'static')
  if (fixed.length) out.push({ title: '固定物体', header: ['名称', '位置 (x, y)', '角度', 'μs', 'μk', 'e', '传送带速度'], rows: fixed.map(b => [
    b.name, pair(b.position.x, b.position.y, 'm'), fmtQ(b.angle, 'rad', d()), String(b.material.muS), String(b.material.muK), String(b.material.restitution), b.beltSpeed ? fmtQ(b.beltSpeed, 'm/s', d()) : '—'
  ]) })
  if (sc.contactPairs.length) out.push({ title: '接触对（覆盖物体材料）', header: ['接触对', 'μs', 'μk', 'e'], rows: sc.contactPairs.map(p => [`${nameOf(r, p.a)}–${nameOf(r, p.b)}`, String(p.muS), String(p.muK), String(p.restitution)]) })
  if (sc.connectors.length) out.push({ title: '连接件', header: ['名称', '类型', '参数'], rows: sc.connectors.map(c => {
    if (c.type === 'spring') return [c.name, '弹簧', `k = ${fmtQ(c.stiffness, 'N/m', d())}，L₀ = ${c.restLength === null ? '初始长度' : fmtQ(c.restLength, 'm', d())}，c = ${fmtQ(c.damping, 'N·s/m', d())}`]
    if (c.type === 'rope') return [c.name, '轻绳', `L = ${c.length === null ? '初始长度（拉直）' : fmtQ(c.length, 'm', d())}${c.pulleys.length ? `，经过 ${c.pulleys.length} 个滑轮` : ''}`]
    if (c.type === 'rod') return [c.name, '轻杆', `L = ${c.length === null ? '初始长度' : fmtQ(c.length, 'm', d())}`]
    if (c.type === 'hinge') return [c.name, '铰链', '']
    return [c.name, '外力', c.expr ? `Fₓ = ${c.expr.x}，F_y = ${c.expr.y}（国际单位）` : `F = ${pair(c.force.x, c.force.y, 'N')}`]
  }) })
  return out
}

async function curveFigures(r: Recording): Promise<ReportFigure[]> {
  const defs = new Map(listQuantities(r.system).map(q => [q.id, q]))
  const groups = new Map<string, QuantityDef[]>()
  for (const id of curveIds.value) { const q = defs.get(id)!; const l = groups.get(q.unit) ?? []; l.push(q); groups.set(q.unit, l) }
  const stride = Math.max(1, Math.floor(r.frameCount / 2000))
  const marks = r.events.filter(e => e.changes.length).map(e => toDisp(e.t, 's'))
  const out: ReportFigure[] = []
  let color = 0
  for (const [unit, list] of groups) {
    const data = quantitySeries(r, list.map(q => q.id), 0, r.frameCount - 1, stride)
    const x = Array.from(data.t, t => toDisp(t, 's'))
    const series = list.map((q, i) => ({ label: `${q.owner} ${q.label}`, color: SERIES_COLORS[color++ % SERIES_COLORS.length], x, y: Array.from(data.values[i], v => (Number.isFinite(v) ? toDisp(v, unit) : null)) }))
    const ul = unitLabel(unit)
    const png = await chartPng(series, { width: 860, height: 300, xLabel: `t / ${unitLabel('s')}`, yLabel: list.length === 1 ? `${list[0].label}${ul ? ` / ${ul}` : ''}` : ul || list.map(q => q.label).join('、'), colors: CHART_LIGHT, marks })
    out.push({ src: dataUrl('image/png', png), caption: `${list.map(q => `${q.owner} ${q.label}`).join('、')}${ul ? `（${ul}）` : ''}；虚线为事件时刻`, width: 860 })
  }
  return out
}

async function generate(): Promise<string> {
  const r = rec.value
  if (!r) throw new Error('请先运行仿真')
  const units = settings.units
  const input: ReportInput = {
    title: opt.title.trim() || state.scene.name, description: state.scene.description, engineVersion: ENGINE_VERSION, hash: r.hash,
    generatedAt: new Date().toLocaleString('zh-CN'), notes: opt.notes,
    parameters: [], screenshots: [], curves: [], formulas: [], events: [], predictions: [], warnings: [],
    legend: [
      `数值按显示单位给出（长度 ${unitLabel('m')}、速度 ${unitLabel('m/s')}、角度 ${unitLabel('rad')} …）；公式代入的每个值也按显示单位写出，计算本身按国际单位进行。`,
      `精确公式：相对误差 ≤ ${THRESHOLDS.exactRel}（能量账本 ≤ ${THRESHOLDS.energyRel}）判为“一致”；近似公式按适用条件分为“近似成立 / 近似 / 近似失效”。`,
      '事件时刻由求解器在积分步之间精确定位（约 1e-12 s）；截图与读数取该时刻的精确状态（事件处为事件后的状态）。'
    ]
  }
  if (opt.params) { stepText.value = '参数表'; input.parameters = parameterTables(r) }
  const ms = moments.value
  if (opt.shots && ms.length) {
    const palette = state.theme === 'dark' ? DARK : LIGHT
    const view = { cx: viewCamera.cx, cy: viewCamera.cy, ppmAtHeight: viewCamera.ppm, viewHeight: viewCamera.height }
    const aspect = Math.max(0.4, Math.min(2.5, viewCamera.width / Math.max(1, viewCamera.height)))
    const width = 1200, height = Math.round(width / aspect)
    const trajectories = computeTrajectories(r), scales = vectorScales(r, r.system)
    const shots = spread(ms, MAX_SHOTS)
    for (let i = 0; i < shots.length; i++) {
      stepText.value = `截图 ${i + 1}/${shots.length}`
      const m = shots[i]
      const img = await stillPng(r, m.t, { width, height, view, options: { ...state.display }, palette, background: opt.shotBg, digits: state.digits, selectedId: state.selection?.id ?? null, annotations: state.scene.annotations, units: settings.units, style: settings.projector ? PROJECTOR_STYLE : null, trajectories, scales, overlay: { lines: [`${timeLabel(m.t, units)}  ${m.label}`] } })
      input.screenshots.push({ src: dataUrl('image/png', img.png), caption: `${timeLabel(m.t, units)} · ${m.label}` })
    }
  }
  if (opt.curves && curveIds.value.length) { stepText.value = '曲线'; input.curves = await curveFigures(r) }
  if (opt.formulas || opt.formulaImages) {
    const seen = new Set<string>()
    const images: ReportFigure[] = []
    for (const m of ms) {
      for (const c of shownCards(cardsForMoment(state.situations, m.t, state.digits, units))) {
        const key = `${c.key}@${m.t}`
        if (seen.has(key)) continue
        seen.add(key)
        const unit = c.formula.unit
        if (opt.formulas) input.formulas.push({
          moment: `${timeLabel(m.t, units)}`, situation: c.situation.title, formula: c.formula.title,
          theory: fmtQ(c.theory, unit, d()), sim: fmtQ(c.sim, unit, d()), absError: c.absError === null ? '—' : fmtQ(c.absError, unit, 3),
          relError: relErrorText(c.relError), verdict: VERDICT_TEXT[c.verdict].text, verdictClass: VERDICT_TEXT[c.verdict].cls
        })
        if (opt.formulaImages && images.length < 24) {
          stepText.value = `公式卡片 ${images.length + 1}`
          const img = await cardImage(c, { digits: state.digits, units, theme: 'light', background: 'white', caption: timeLabel(m.t, units), scale: 1.5 }, { png: true })
          if (img.png) images.push({ src: dataUrl('image/png', img.png), caption: `${c.formula.title}（${timeLabel(m.t, units)}）`, width: img.width })
        }
      }
    }
    input.formulaImages = images
  }
  if (opt.events) {
    input.events = r.events.filter(e => e.changes.length).flatMap(e => e.changes.map((c, i) => ({
      t: i === 0 ? fmtQ(e.t, 's', Math.max(state.digits, 9)) : '',
      what: eventLabel(c), who: changeWho(r, c),
      detail: c.type === 'impact'
        ? `法向速度 ${fmtQ(c.vnBefore ?? null, 'm/s', 4)} → ${fmtQ(c.vnAfter ?? null, 'm/s', 4)}，冲量 ${fmtQ(c.impulse ?? null, 'N·s', 4)}${c.tangentImpulse !== undefined && Math.abs(c.tangentImpulse) > 1e-12 ? `，摩擦冲量 ${fmtQ(Math.abs(c.tangentImpulse), 'N·s', 4)}` : ''}，e = ${c.restitution}${i === 0 && e.impact && e.impact.loss > 1e-12 ? `；损失动能 ${fmtQ(e.impact.loss, 'J', 5)}` : ''}`
        : c.type === 'timestep' ? '此后改用 Moreau–Jean 时间步进，精度降级、事件时刻不再精确定位' : ''
    })))
  }
  if (opt.predictions && hasPredictions.value) {
    const defs = new Map(listQuantities(r.system).map(q => [q.id, q]))
    const ctx = { quantities: defs, bodyName: (id: string) => nameOf(r, id), time: (t: number) => timeLabel(t, units) }
    input.predictions = readPredictions(state.scene).map(p => {
      const c = comparePrediction(r, state.situations, p)
      const u = c.value.unit
      return {
        target: targetLabel(p.target, ctx) + (p.note ? `（思路：${p.note}）` : ''), predicted: fmtQ(p.value, u, d()), sim: fmtQ(c.value.sim, u, d()), formula: fmtQ(c.value.formula, u, d()),
        error: c.absError === null ? '—' : `${fmtQ(c.absError, u, 3)}（${relErrorText(c.relError)}）`, grade: GRADE_TEXT[c.grade], gradeClass: c.grade === 'none' ? '' : c.grade
      }
    })
  }
  input.notice = reducedNotice(r, units)
  input.warnings = [...r.warnings]
  if (!r.completed) input.warnings.push(`仿真未算完：${r.error ?? '达到计算时间上限'}，只记录了前 ${fmtQ((r.frameCount - 1) * r.dt, 's', 4)}`)
  stepText.value = ''
  return buildReportHtml(input)
}

async function ensure(): Promise<string | null> {
  if (html.value) return html.value
  busy.value = true
  try {
    html.value = await generate()
    return html.value
  } catch (e) {
    showToast(`报告生成失败：${(e as Error).message}`, true)
    logEvent('report.export', { ok: false, mode: 'generate' })
    return null
  } finally {
    busy.value = false
  }
}

async function saveHtml() {
  const h = await ensure()
  if (!h) return
  const path = await saveFile(h, `${safeName(opt.title || state.scene.name)}_实验报告.html`, [{ name: 'HTML 网页', extensions: ['html'] }])
  if (path) showToast(`已保存 ${path}`)
  logEvent('report.export', { ok: !!path, mode: 'html', params: opt.params, screenshots: opt.shots, curves: opt.curves ? curveIds.value.length : 0, formulas: opt.formulas, cardImages: opt.formulaImages, events: opt.events, predictions: opt.predictions && hasPredictions.value })
}
async function print() {
  const h = await ensure()
  if (!h) { logEvent('report.export', { ok: false, mode: 'print' }); return }
  const how = printHtml(h)
  logEvent('report.export', { ok: true, mode: 'print', via: how })
}
const notice = computed(() => (rec.value ? reducedNotice(rec.value, settings.units) : null))
const sizeText = computed(() => (html.value ? `${(new Blob([html.value]).size / 1024 / 1024).toFixed(2)} MB` : ''))
function close() { if (!busy.value) state.showReport = false }
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="close">
    <div class="dialog report">
      <div class="dialog-header"><Icon name="file" :size="18" />实验报告<span class="spacer" /><button class="btn icon ghost" :disabled="busy" title="关闭" @click="close"><Icon name="close" /></button></div>
      <div v-if="!rec" class="dialog-body"><div class="empty">请先运行仿真（结果需与当前场景一致）。</div></div>
      <div v-else class="dialog-body">
        <div class="cols2">
          <section>
            <div class="group">
              <div class="row"><label>标题</label><input v-model="opt.title" class="field grow" /></div>
              <div class="row notes"><label>目的与结论</label><textarea v-model="opt.notes" class="field grow" rows="4" placeholder="（可选）实验目的、结论或讨论，原样写入报告" /></div>
            </div>
            <div class="group-title">包含</div>
            <div class="group checks">
              <label class="check small"><input v-model="opt.params" type="checkbox" />参数表（显示单位）</label>
              <label class="check small"><input v-model="opt.shots" type="checkbox" />关键时刻截图（{{ Math.min(moments.length, MAX_SHOTS) }} 张）
                <select v-model="opt.shotBg" class="field mini" :disabled="!opt.shots"><option value="white">白底</option><option value="theme">主题背景</option><option value="transparent">透明</option></select>
              </label>
              <label class="check small"><input v-model="opt.curves" type="checkbox" :disabled="!curveIds.length" />曲线（{{ curveIds.length ? `${curveIds.length} 条，取自“曲线”面板` : '曲线面板为空' }}）</label>
              <label class="check small"><input v-model="opt.formulas" type="checkbox" />公式对照与误差表</label>
              <label class="check small"><input v-model="opt.formulaImages" type="checkbox" />附公式卡片图片</label>
              <label class="check small"><input v-model="opt.events" type="checkbox" />事件表</label>
              <label class="check small"><input v-model="opt.predictions" type="checkbox" :disabled="!hasPredictions" />预测与对比{{ hasPredictions ? '' : '（本场景没有预测）' }}</label>
            </div>
            <div v-if="notice" class="notice small"><span class="badge warn">精度降级</span>{{ notice.replace(/^精度降级：/, '') }} 报告开头会注明。</div>
            <div class="tiny muted note">报告为单个 HTML 文件，图片内嵌，离线可打开。“打印 / PDF”会打开新窗口并调用打印，在打印对话框中选择“另存为 PDF”。</div>
          </section>
          <section class="preview-col">
            <div class="group-title">预览<span v-if="sizeText" class="muted">（{{ sizeText }}）</span></div>
            <iframe v-if="html" class="preview" sandbox="" :srcdoc="html" title="报告预览" />
            <div v-else class="preview empty-preview">
              <button class="btn" :disabled="busy" @click="ensure">{{ busy ? `生成中… ${stepText}` : '生成预览' }}</button>
            </div>
          </section>
        </div>
      </div>
      <div class="dialog-footer">
        <button class="btn" :disabled="busy" @click="close">关闭</button>
        <button class="btn" :disabled="busy || !rec" @click="print"><Icon name="file" />打印 / PDF</button>
        <button class="btn primary" :disabled="busy || !rec" @click="saveHtml">{{ busy ? `生成中… ${stepText}` : '保存 HTML' }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.report { width: min(1100px, calc(100vw - 48px)); }
.cols2 { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: 16px; }
.row > label { width: 76px; }
.notes { align-items: flex-start; padding: 6px 0; }
.notes textarea { height: auto; padding: 6px 8px; resize: vertical; }
.checks { display: flex; flex-direction: column; gap: 4px; padding: 8px 10px; }
.mini { height: 22px; width: auto; margin-left: 6px; font-size: 11px; }
.note { line-height: 1.5; margin: 4px 2px; }
.notice { display: flex; gap: 8px; align-items: flex-start; line-height: 1.5; color: var(--text-2); margin: 6px 2px; }
.notice .badge { flex: 0 0 auto; }
.preview-col { display: flex; flex-direction: column; min-height: 0; }
.preview { width: 100%; height: 440px; border: 1px solid var(--separator); border-radius: var(--radius-group); background: #fff; }
.empty-preview { display: flex; align-items: center; justify-content: center; background: var(--group); }
@media (max-width: 760px) { .cols2 { grid-template-columns: 1fr; } }
</style>
