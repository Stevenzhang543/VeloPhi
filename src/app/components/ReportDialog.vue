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
import { tl, listSep, paren, commaSep, stripLabel, activeLang } from '../../i18n'
import { exportSituations, inExportLanguage } from '../exportLang'
import { msgText } from '../../i18n/locale'
import { derivationPages } from '../../export/derivationPages'
import { computed, reactive, ref, watch } from 'vue'
import { state, showToast, viewCamera } from '../store'
import { fmtQ, settings, unitLabel, toDisp, effectiveCurriculum } from '../settings'
import type { Recording } from '../../engine/recording'
import type { QuantityDef } from '../../engine/observe'
import { listQuantities, quantitySeries } from '../../engine/observe'
import { ENGINE_VERSION } from '../../core/scene/types'
import { exportFingerprint } from '../../export/fingerprint'
import { DARK, LIGHT, computeTrajectories, eventLabel, vectorScales } from '../../render/renderer'
import { THRESHOLDS } from '../../formula/match'
import { cardsForMoment, changeWho, keyMoments, nameOf, reducedNotice, relabelMoments } from '../../export/moments'
import type { KeyMoment } from '../../export/moments'
import { stillPng } from '../../export/still'
import { PROJECTOR_STYLE } from '../../render/frame'
import type { ImageBackground } from '../../export/still'
import { VERDICT_TEXT, cardImage, relErrorText, shownCards } from '../../export/formulaImage'
import { CHART_LIGHT, SERIES_COLORS, chartPng } from '../../export/chartImage'
import type { ReportFigure, ReportInput, ReportTable } from '../../export/report'
import { buildReportHtml, printHtml } from '../../export/report'
import { safeName } from '../../export/safeName'
import { timeLabel } from '../../export/timeLabel'
import { dataUrl } from '../../export/zip'
import { GRADE_TEXT, comparePrediction, readPredictions, targetLabel } from '../../analysis/prediction'
import { templateById } from '../../templates'
import { saveFile } from '../../platform/files'
import { FBD_DEFAULTS, fbdData, fbdSvg } from '../../teaching/fbd'
import { logEvent } from '../trialLog'
import Icon from './Icon.vue'

const rec = computed(() => (state.stale ? null : state.recording))
/** Knowledge-level filter of the formula cards and pages (D44), from the option and the settings. */
const levelFilter = () => (opt.levelOnly ? { curriculum: effectiveCurriculum(), level: settings.knowledge.level } : null)
const opt = reactive({
  title: state.scene.name,
  notes: '',
  params: true, shots: true, fbd: false, curves: true, formulas: true, formulaImages: false, derivations: false, events: true, predictions: true, levelOnly: true,
  shotBg: (settings.export.imageBackground === 'theme' ? 'white' : settings.export.imageBackground) as ImageBackground
})
const hasPredictions = computed(() => readPredictions(state.scene).length > 0)
/** Body of the free-body diagram: the selected moving body, else the first one. */
const fbdTarget = computed(() => {
  const r = rec.value
  if (!r) return null
  const sel = state.selection?.kind === 'body' ? r.system.model.byId.get(state.selection.id) : null
  return sel && sel.dynamic ? sel : r.system.model.dynamic[0] ?? null
})
const curveIds = computed(() => {
  const r = rec.value
  if (!r) return []
  const known = new Set(listQuantities(r).map(q => q.id))
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
watch(() => [state.recording, state.stale, state.digits, settings.units, settings.export.language, settings.decimalSeparator], () => { html.value = null }, { deep: true })

// ---- Content ----
// Translated when the report is generated (the export language may differ from the interface, 26.51 hand check)
const kindText = (k: string) => ({ particle: tl('质点'), rigid: tl('刚体'), static: tl('固定') } as Record<string, string>)[k] ?? k
const integratorText = (m: string) => ({ dopri5: tl('Dormand–Prince 5(4) 自适应'), rk4: tl('经典四阶 Runge–Kutta'), euler: tl('半隐式欧拉') } as Record<string, string>)[m] ?? m
const d = () => state.digits
const pair = (x: number, y: number, unit: string) => `(${fmtQ(x, unit, d()).replace(` ${unitLabel(unit)}`, '')}, ${fmtQ(y, unit, d())})`

function parameterTables(r: Recording): ReportTable[] {
  const sc = r.scene, st = sc.settings
  const out: ReportTable[] = []
  const g = Math.hypot(st.gravity.x, st.gravity.y)
  out.push({ title: tl('场景与求解'), header: [tl('项目'), tl('数值')], rows: [
    [tl('重力加速度 g'), fmtQ(g, 'm/s²', d())], [tl('仿真时长'), st.duration === null ? tl('不限时长（已算出 {0}）', [fmtQ((r.frameCount - 1) * r.dt, 's', d())]) : fmtQ(st.duration, 's', d())], [tl('记录步长 Δt'), fmtQ(st.outputStep, 's', d())],
    [tl('积分方法'), integratorText(st.integrator)], [tl('相对容差 / 绝对容差'), `${st.relTol} / ${st.absTol}`], [tl('重力势能零点 y₀'), fmtQ(st.energyZeroY, 'm', d())],
    [tl('记录帧数'), String(r.frameCount)]
  ] })
  const tpl = (sc.extra as { template?: { id?: string; values?: Record<string, number> } } | undefined)?.template
  const info = tpl?.id ? templateById(tpl.id) : undefined
  if (info && tpl?.values) out.push({ title: tl('模板参数（{0}）', [info.name]), header: [tl('参数'), tl('数值')], rows: info.params.map(p => [p.label, `${tpl.values![p.key] ?? p.value}${p.unit ? ` ${p.unit}` : ''}`]), note: tl('模板参数按模板原始单位列出；场景创建后若有修改，以下方物体参数为准。') })
  const dyn = sc.bodies.filter(b => b.kind !== 'static')
  if (dyn.length) out.push({ title: tl('运动物体'), header: [tl('名称'), tl('类型'), tl('质量'), tl('初位置 (x, y)'), tl('初速度 (vₓ, v_y)'), tl('初角度'), 'μs', 'μk', 'e'], rows: dyn.map(b => [
    b.name, kindText(b.kind), fmtQ(b.mass, 'kg', d()), pair(b.position.x, b.position.y, 'm'), pair(b.velocity.x, b.velocity.y, 'm/s'), fmtQ(b.angle, 'rad', d()),
    String(b.material.muS), String(b.material.muK), String(b.material.restitution)
  ]) })
  const fixed = sc.bodies.filter(b => b.kind === 'static')
  if (fixed.length) out.push({ title: tl('固定物体'), header: [tl('名称'), tl('位置 (x, y)'), tl('角度'), 'μs', 'μk', 'e', tl('传送带速度')], rows: fixed.map(b => [
    b.name, pair(b.position.x, b.position.y, 'm'), fmtQ(b.angle, 'rad', d()), String(b.material.muS), String(b.material.muK), String(b.material.restitution), b.beltSpeed ? fmtQ(b.beltSpeed, 'm/s', d()) : '—'
  ]) })
  if (sc.contactPairs.length) out.push({ title: tl('接触对（覆盖物体材料）'), header: [tl('接触对'), 'μs', 'μk', 'e'], rows: sc.contactPairs.map(p => [`${nameOf(r, p.a)}–${nameOf(r, p.b)}`, String(p.muS), String(p.muK), String(p.restitution)]) })
  if (sc.connectors.length) out.push({ title: tl('连接件'), header: [tl('名称'), tl('类型'), tl('参数')], rows: sc.connectors.map(c => {
    if (c.type === 'spring') return [c.name, tl('弹簧'), `k = ${fmtQ(c.stiffness, 'N/m', d())}${c.cubic ? `${commaSep()}k₃ = ${fmtQ(c.cubic, 'N/m³', d())}` : ''}${commaSep()}L₀ = ${c.restLength === null ? tl('初始长度') : fmtQ(c.restLength, 'm', d())}${commaSep()}c = ${fmtQ(c.damping, 'N·s/m', d())}`]
    if (c.type === 'damper') return [c.name, tl('阻尼器'), `c = ${fmtQ(c.damping, 'N·s/m', d())}`]
    if (c.type === 'weld') return [c.name, tl('焊接'), '']
    if (c.type === 'slider') return [c.name, tl('滑轨'), `${tl('方向')} ${fmtQ(Math.atan2(c.axis.y, c.axis.x), 'rad', d())}${c.free ? commaSep() + tl('可转动') : ''}`]
    if (c.type === 'motor') return [c.name, tl('马达'), c.mode === 'speed' ? `ω = ${fmtQ(c.speed, 'rad/s', d())}` : `M = ${fmtQ(c.torque, 'N·m', d())}`]
    if (c.type === 'gear') return [c.name, tl('齿轮'), `r = ${fmtQ(c.ratio, '', d())}`]
    if (c.type === 'rope') return [c.name, tl('轻绳'), `L = ${c.length === null ? tl('初始长度（拉直）') : fmtQ(c.length, 'm', d())}${c.pulleys.length ? tl('，经过 {0} 个滑轮', [c.pulleys.length]) : ''}`]
    if (c.type === 'rod') return [c.name, tl('轻杆'), `L = ${c.length === null ? tl('初始长度') : fmtQ(c.length, 'm', d())}`]
    if (c.type === 'hinge') return [c.name, tl('铰链'), '']
    if (c.type === 'central') return [c.name, tl('有心力'), `F = ${fmtQ(c.k, '', d())}·r^${fmtQ(c.n, '', d())}`]
    return [c.name, tl('外力'), c.expr ? tl('Fₓ = {0}，F_y = {1}（国际单位）', [c.expr.x, c.expr.y]) : `F = ${pair(c.force.x, c.force.y, 'N')}`]
  }) })
  return out
}

async function curveFigures(r: Recording): Promise<ReportFigure[]> {
  const defs = new Map(listQuantities(r).map(q => [q.id, q]))
  const groups = new Map<string, QuantityDef[]>()
  for (const id of curveIds.value) { const q = defs.get(id)!; const l = groups.get(q.unit) ?? []; l.push(q); groups.set(q.unit, l) }
  const stride = Math.max(1, Math.floor(r.frameCount / 2000))
  const o = r.scene.settings.startTime ?? 0
  const marks = r.events.filter(e => e.changes.length).map(e => toDisp(e.t + o, 's'))
  const out: ReportFigure[] = []
  let color = 0
  for (const [unit, list] of groups) {
    const data = quantitySeries(r, list.map(q => q.id), 0, r.frameCount - 1, stride)
    const x = Array.from(data.t, t => toDisp(t + o, 's'))
    const series = list.map((q, i) => ({ label: `${q.owner} ${q.label}`, color: SERIES_COLORS[color++ % SERIES_COLORS.length], x, y: Array.from(data.values[i], v => (Number.isFinite(v) ? toDisp(v, unit) : null)) }))
    const ul = unitLabel(unit)
    const png = await chartPng(series, { width: 860, height: 300, xLabel: `t / ${unitLabel('s')}`, yLabel: list.length === 1 ? `${list[0].label}${ul ? ` / ${ul}` : ''}` : ul || list.map(q => q.label).join(listSep()), colors: CHART_LIGHT, marks })
    out.push({ src: dataUrl('image/png', png), caption: tl('{0}{1}；虚线为事件时刻', [list.map(q => `${q.owner} ${q.label}`).join(listSep()), ul ? paren(ul) : '']), width: 860 })
  }
  return out
}

async function generate(): Promise<string> {
  const r = rec.value
  if (!r) throw new Error(tl('请先运行仿真'))
  const units = settings.units
  const input: ReportInput = {
    title: opt.title.trim() || state.scene.name, description: state.scene.description, engineVersion: ENGINE_VERSION, hash: exportFingerprint(r).hash,
    generatedAt: new Date().toLocaleString('zh-CN'), notes: opt.notes,
    parameters: [], screenshots: [], curves: [], formulas: [], events: [], predictions: [], warnings: [],
    legend: [
      tl('数值按显示单位给出（长度 {0}、速度 {1}、角度 {2} …）；公式代入的每个值也按显示单位写出，计算本身按国际单位进行。', [unitLabel('m'), unitLabel('m/s'), unitLabel('rad')]),
      tl('精确公式：相对误差 ≤ {0}（能量账本 ≤ {1}）判为“一致”；近似公式按适用条件分为“近似成立 / 近似 / 近似失效”。', [THRESHOLDS.exactRel, THRESHOLDS.energyRel]),
      tl('事件时刻由求解器在积分步之间精确定位（约 1e-12 s）；截图与读数取该时刻的精确状态（事件处为事件后的状态）。')
    ]
  }
  if (opt.params) { stepText.value = tl('参数表'); input.parameters = parameterTables(r) }
  // Moment labels and situation titles in the export language
  const ms = relabelMoments(r, moments.value)
  const sits = exportSituations(r, state.situations)
  if (opt.shots && ms.length) {
    const palette = state.theme === 'dark' ? DARK : LIGHT
    const view = { cx: viewCamera.cx, cy: viewCamera.cy, ppmAtHeight: viewCamera.ppm, viewHeight: viewCamera.height }
    const aspect = Math.max(0.4, Math.min(2.5, viewCamera.width / Math.max(1, viewCamera.height)))
    const width = 1200, height = Math.round(width / aspect)
    const trajectories = computeTrajectories(r), scales = vectorScales(r)
    const shots = spread(ms, MAX_SHOTS)
    for (let i = 0; i < shots.length; i++) {
      stepText.value = tl('截图 {0}/{1}', [i + 1, shots.length])
      const m = shots[i]
      const img = await stillPng(r, m.t, { width, height, view, options: { ...state.display }, palette, background: opt.shotBg, digits: state.digits, selectedId: state.selection?.id ?? null, annotations: state.scene.annotations, units: settings.units, style: settings.projector ? PROJECTOR_STYLE : null, trajectories, scales, overlay: { lines: [`${timeLabel(m.t, units)}  ${m.label}`] } })
      input.screenshots.push({ src: dataUrl('image/png', img.png), caption: `${timeLabel(m.t, units)} · ${m.label}` })
    }
  }
  // 26.52 (D62): the free-body diagram of the selected (or first moving) body at the playhead
  const fbdBody = fbdTarget.value
  if (opt.fbd && fbdBody) {
    stepText.value = tl('受力分析图')
    const d = fbdData(r, state.time, fbdBody.id, 'light')
    if (d) {
      const g = fbdSvg(d, { ...FBD_DEFAULTS, ...settings.teaching.fbd, theme: 'light', digits: state.digits })
      input.fbd = [{ src: dataUrl('image/svg+xml', new TextEncoder().encode(g.svg)), caption: `${d.name} · ${timeLabel(d.time, units)}`, width: g.width }]
    }
  }
  if (opt.curves && curveIds.value.length) { stepText.value = tl('曲线'); input.curves = await curveFigures(r) }
  if (opt.formulas || opt.formulaImages) {
    const seen = new Set<string>()
    const images: ReportFigure[] = []
    for (const m of ms) {
      for (const c of shownCards(cardsForMoment(r, sits, m.t, state.digits, units), levelFilter())) {
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
          stepText.value = tl('公式卡片 {0}', [images.length + 1])
          const img = await cardImage(c, { digits: state.digits, units, theme: 'light', background: 'white', caption: timeLabel(m.t, units), scale: 1.5 }, { png: true })
          if (img.png) images.push({ src: dataUrl('image/png', img.png), caption: `${c.formula.title}${paren(timeLabel(m.t, units))}`, width: img.width })
        }
      }
    }
    input.formulaImages = images
  }
  if (opt.derivations) {
    stepText.value = tl('推导与解题过程')
    const pages = await derivationPages(r, sits, ms, { digits: state.digits, units, lang: activeLang(), theme: 'light', background: 'white', maxFormulas: 24, level: levelFilter() })
    input.derivations = pages.filter(p => p.png).map(p => ({ src: dataUrl('image/png', p.png!), caption: p.title, width: p.width }))
  }
  if (opt.events) {
    input.events = r.events.filter(e => e.changes.length).flatMap(e => e.changes.map((c, i) => ({
      t: i === 0 ? fmtQ(e.t + (r.scene.settings.startTime ?? 0), 's', Math.max(state.digits, 9)) : '',
      what: eventLabel(c), who: changeWho(r, c),
      detail: c.type === 'impact'
        ? tl('法向速度 {0} → {1}，冲量 {2}{3}，e = {4}{5}', [fmtQ(c.vnBefore ?? null, 'm/s', 4), fmtQ(c.vnAfter ?? null, 'm/s', 4), fmtQ(c.impulse ?? null, 'N·s', 4), c.tangentImpulse !== undefined && Math.abs(c.tangentImpulse) > 1e-12 ? tl('，摩擦冲量 {0}', [fmtQ(Math.abs(c.tangentImpulse), 'N·s', 4)]) : '', c.restitution, i === 0 && e.impact && e.impact.loss > 1e-12 ? tl('；损失动能 {0}', [fmtQ(e.impact.loss, 'J', 5)]) : ''])
        : c.type === 'timestep' ? tl('此后改用 Moreau–Jean 时间步进，精度降级、事件时刻不再精确定位') : ''
    })))
  }
  if (opt.predictions && hasPredictions.value) {
    const defs = new Map(listQuantities(r).map(q => [q.id, q]))
    const ctx = { quantities: defs, bodyName: (id: string) => nameOf(r, id), time: (t: number) => timeLabel(t, units) }
    input.predictions = readPredictions(state.scene).map(p => {
      const c = comparePrediction(r, sits, p)
      const u = c.value.unit
      return {
        target: targetLabel(p.target, ctx) + (p.note ? tl('（思路：{0}）', [p.note]) : ''), predicted: fmtQ(p.value, u, d()), sim: fmtQ(c.value.sim, u, d()), formula: fmtQ(c.value.formula, u, d()),
        error: c.absError === null ? '—' : `${fmtQ(c.absError, u, 3)}${paren(relErrorText(c.relError))}`, grade: GRADE_TEXT[c.grade], gradeClass: c.grade === 'none' ? '' : c.grade
      }
    })
  }
  input.notice = reducedNotice(r, units)
  input.warnings = r.warnings.map(w => msgText(w))
  if (r.unbounded && !r.hash) input.warnings.push(tl('不限时长的仿真仍在计算：本报告覆盖已算出的前 {0}，指纹为截至 {1} 的滚动指纹', [fmtQ((r.frameCount - 1) * r.dt, 's', 4), fmtQ(r.rolling?.t ?? 0, 's', 4)]))
  else if (!r.completed) input.warnings.push(tl('仿真未算完：{0}，只记录了前 {1}', [r.error ? msgText(r.error) : tl('达到计算时间上限'), fmtQ((r.frameCount - 1) * r.dt, 's', 4)]))
  stepText.value = ''
  return buildReportHtml(input)
}

async function ensure(): Promise<string | null> {
  if (html.value) return html.value
  busy.value = true
  try {
    html.value = await inExportLanguage(generate)
    return html.value
  } catch (e) {
    showToast(tl('报告生成失败：{0}', [(e as Error).message]), true)
    logEvent('report.export', { ok: false, mode: 'generate' })
    return null
  } finally {
    busy.value = false
  }
}

async function saveHtml() {
  const h = await ensure()
  if (!h) return
  const path = await saveFile(h, tl('{0}_实验报告.html', [safeName(opt.title || state.scene.name)]), [{ name: tl('HTML 网页'), extensions: ['html'] }])
  if (path) showToast(tl('已保存 {0}', [path]))
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
      <div class="dialog-header"><Icon name="file" :size="18" />{{ tl('实验报告') }}<span class="spacer" /><button class="btn icon ghost" :disabled="busy" :title="tl('关闭')" @click="close"><Icon name="close" /></button></div>
      <div v-if="!rec" class="dialog-body"><div class="empty">{{ tl('请先运行仿真（结果需与当前场景一致）。') }}</div></div>
      <div v-else class="dialog-body">
        <div class="cols2">
          <section>
            <div class="group">
              <div class="row"><label>{{ tl('标题') }}</label><input v-model="opt.title" class="field grow" /></div>
              <div class="row"><label>{{ tl('导出语言') }}</label><select v-model="settings.export.language" class="field grow" :title="tl('报告、课件、视频叠字与 CSV 表头使用的语言，可与界面语言不同')"><option value="ui">{{ tl('跟随界面') }}</option><option value="zh">{{ tl('简体中文') }}</option><option value="en">English</option><option value="de">Deutsch</option></select></div>
              <div class="row notes"><label>{{ tl('目的与结论') }}</label><textarea v-model="opt.notes" class="field grow" rows="4" :placeholder="tl('（可选）实验目的、结论或讨论，原样写入报告')" /></div>
            </div>
            <div class="group-title">{{ tl('包含') }}</div>
            <div class="group checks">
              <label class="check small"><input v-model="opt.params" type="checkbox" />{{ tl('参数表（显示单位）') }}</label>
              <label class="check small"><input v-model="opt.shots" type="checkbox" />{{ tl('关键时刻截图（{0} 张）', [Math.min(moments.length, MAX_SHOTS)]) }}
                <select v-model="opt.shotBg" class="field mini" :disabled="!opt.shots"><option value="white">{{ tl('白底') }}</option><option value="theme">{{ tl('主题背景') }}</option><option value="transparent">{{ tl('透明') }}</option></select>
              </label>
              <label class="check small"><input v-model="opt.fbd" type="checkbox" :disabled="!fbdTarget" />{{ tl('受力分析图（{0}，当前时刻）', [fbdTarget?.name ?? '—']) }}</label>
              <label class="check small"><input v-model="opt.curves" type="checkbox" :disabled="!curveIds.length" />{{ tl('曲线（{0}）', [curveIds.length ? tl('{0} 条，取自“曲线”面板', [curveIds.length]) : tl('曲线面板为空')]) }}</label>
              <label class="check small"><input v-model="opt.formulas" type="checkbox" />{{ tl('公式对照与误差表') }}</label>
              <label class="check small"><input v-model="opt.formulaImages" type="checkbox" />{{ tl('附公式卡片图片') }}</label>
              <label class="check small"><input v-model="opt.derivations" type="checkbox" />{{ tl('附推导与解题过程') }}</label>
              <label class="check small"><input v-model="opt.levelOnly" type="checkbox" />{{ tl('只含所选知识水平内的公式') }}</label>
              <label class="check small"><input v-model="opt.events" type="checkbox" />{{ tl('事件表') }}</label>
              <label class="check small"><input v-model="opt.predictions" type="checkbox" :disabled="!hasPredictions" />{{ tl('预测与对比{0}', [hasPredictions ? '' : tl('（本场景没有预测）')]) }}</label>
            </div>
            <div v-if="notice" class="notice small"><span class="badge warn">{{ tl('精度降级') }}</span>{{ tl('{0} 报告开头会注明。', [stripLabel(notice)]) }}</div>
            <div class="tiny muted note">{{ tl('报告为单个 HTML 文件，图片内嵌，离线可打开。“打印 / PDF”会打开新窗口并调用打印，在打印对话框中选择“另存为 PDF”。') }}</div>
          </section>
          <section class="preview-col">
            <div class="group-title">{{ tl('预览') }}<span v-if="sizeText" class="muted">{{ paren(sizeText) }}</span></div>
            <iframe v-if="html" class="preview" sandbox="" :srcdoc="html" :title="tl('报告预览')" />
            <div v-else class="preview empty-preview">
              <button class="btn" :disabled="busy" @click="ensure">{{ busy ? tl('生成中… {0}', [stepText]) : tl('生成预览') }}</button>
            </div>
          </section>
        </div>
      </div>
      <div class="dialog-footer">
        <button class="btn" :disabled="busy" @click="close">{{ tl('关闭') }}</button>
        <button class="btn" :disabled="busy || !rec" @click="print"><Icon name="file" />{{ tl('打印 / PDF') }}</button>
        <button class="btn primary" :disabled="busy || !rec" @click="saveHtml">{{ busy ? tl('生成中… {0}', [stepText]) : tl('保存 HTML') }}</button>
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
