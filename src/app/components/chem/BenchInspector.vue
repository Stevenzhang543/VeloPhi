<script setup lang="ts">
/**
 * The bench's inspector (26.64, D242, D267): three tabs for the selected vessel.
 * - 读数: the three or four numbers that matter first (temperature, volume, pH with a solution, pressure when
 *   closed), what the attached instruments show, the circuit the vessel is part of; everything else under
 *   “全部读数”. The core's diagnostics are lines here: “未建模” with the part of the mixture it means, “近似” with
 *   the reason.
 * - 内容: the same vessel three ways — 宏观 (what is in it, by phase), 微观 (a schematic of particles in the
 *   proportion of the species), 符号 (species with n and c, saturation of nearly saturated solids, the reactions
 *   seen, balanced by the core).
 * - 记录: the log as readable lines, with its export as text and as the document.
 * Every number is the core's; this component only formats.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { tl, activeLang, localeTag } from '../../../i18n'
import { chemBalance } from '../../../engine/chem'
import type { Diagnostic } from '../../../engine/chem'
import { useBench, BENCH_EXT } from '../../../chem/bench'
import { decimalsFor, instrumentReading, kindName, kindOf, litmusState, volumeResolution } from '../../../chem/apparatus'
import { reactionOf, speciesFormula, speciesName } from '../../../chem/catalog'
import { diagnosticText, equationText, groupedLog, isApproxNote, logLine, markLabel, phenomenonText, reactionName, recordText } from '../../../chem/benchText'
import type { MarkKind } from '../../../chem/benchText'
import { fixed, fmtAmount, fmtConc, fmtDuration, fmtKelvin, fmtMass, fmtPH, fmtPower, fmtPressure, fmtTemp, fmtVolume, qty, sig, withUnit } from '../../../chem/format'
import { chemPalette } from '../../../render/chem/palette'
import { drawParticles, particleShares } from '../../../render/chem/particles'
import { saveFile } from '../../../platform/files'
import { calmMotion, sysEnv } from '../../settings'
import { state as app } from '../../store'
import { usePageActive } from '../../live'
import FixturePanel from './FixturePanel.vue'
import LiveChart from './LiveChart.vue'

const props = defineProps<{ tab: string }>()
const bench = useBench()
const pageActive = usePageActive()

const v = computed(() => bench.reading.value)
const name = computed(() => (v.value ? bench.vesselName(v.value.id) : ''))
const parts = computed(() => (v.value ? bench.extras(v.value.id).parts.map(p => kindOf(p)!).filter(Boolean) : []))
const circuit = computed(() => (v.value ? bench.circuitOf(v.value.id) : undefined))

// ---- 读数 ----

interface Row { id: string; label: string; value: string; title?: string }
const volumeText = (mL: number) => { const res = v.value ? volumeResolution(v.value.kind, v.value.capacity_mL) : null; return fmtVolume(mL, res !== null ? decimalsFor(res) : 1) }
const main = computed<Row[]>(() => {
  const x = v.value
  if (!x) return []
  const rows: Row[] = [{ id: 'T', label: tl('温度'), value: fmtTemp(x.T, 1), title: fmtKelvin(x.T) }, { id: 'V', label: tl('体积'), value: volumeText(x.volume_mL) }]
  if (x.pH !== undefined) rows.push({ id: 'pH', label: 'pH', value: fmtPH(x.pH) })
  else rows.push({ id: 'm', label: tl('质量'), value: fmtMass(x.mass_g) })
  if (x.closed) rows.push({ id: 'P', label: tl('压强'), value: fmtPressure(x.P) })
  else if (x.collect !== 'none') rows.push({ id: 'gas', label: tl('集气'), value: fmtVolume(x.gas_mL, 1) })
  // 26.65 (D297 item 9): what went wrong is the core's state
  if (x.cracked) rows.push({ id: 'cracked', label: tl('器材'), value: tl('已破裂') })
  else if ((x.spilled_mL ?? 0) > 0.05) rows.push({ id: 'spilled', label: tl('溢出'), value: fmtVolume(x.spilled_mL!, 1) })
  return rows
})
const rest = computed<Row[]>(() => {
  const x = v.value
  if (!x) return []
  const rows: Row[] = []
  if (x.pH !== undefined) rows.push({ id: 'm', label: tl('质量'), value: fmtMass(x.mass_g) })
  rows.push({ id: 'cap', label: tl('容量'), value: fmtVolume(x.capacity_mL, 0) })
  if (!x.closed) rows.push({ id: 'P', label: tl('压强'), value: fmtPressure(x.P) })
  if (x.water_g !== undefined) rows.push({ id: 'water', label: tl('水'), value: fmtMass(x.water_g) })
  if (x.I !== undefined) rows.push({ id: 'I', label: tl('离子强度'), value: withUnit(sig(x.I, 3), 'mol/kg') })
  if (x.aw !== undefined) rows.push({ id: 'aw', label: tl('水的活度'), value: fixed(x.aw, 4) })
  rows.push({ id: 'C', label: tl('热容'), value: withUnit(sig(x.heatCapacity, 4), 'J/K') })
  if (x.heater > 0) rows.push({ id: 'heater', label: tl('加热功率'), value: fmtPower(x.heater) })
  if (x.bath !== null) rows.push({ id: 'bath', label: tl('浴温'), value: fmtTemp(x.bath, 1), title: fmtKelvin(x.bath) })
  if (x.gas_mL > 0 && x.collect === 'none') rows.push({ id: 'gas', label: tl('气体体积'), value: fmtVolume(x.gas_mL, 1) })
  for (const p of x.pressures ?? []) if (p.p > 1e-6) rows.push({ id: `p-${p.id}`, label: tl('分压 {0}', [speciesFormula(p.id)]), value: fmtPressure(p.p * 101325, 2) })
  return rows
})
const instruments = computed<Row[]>(() => {
  const x = v.value
  if (!x) return []
  return parts.value.filter(k => k.instrument).map(k => {
    const ins = k.instrument!
    const lit = ins.display === 'litmus' ? litmusState(k.id, x) : null
    const r = instrumentReading(k.id, x, circuit.value ?? null)
    const value = ins.display === 'litmus' ? (lit === 'red' ? tl('变红') : lit === 'blue' ? tl('变蓝') : lit === 'between' ? tl('不变色') : '—') : r ? qty(r.value, r.unit, r.decimals) : '—'
    return { id: k.id, label: kindName(k), value }
  })
})
const circuitRows = computed<Row[]>(() => {
  const c = circuit.value
  if (!c) return []
  const live = c.on && c.connected
  const rows: Row[] = [
    { id: 'emf', label: c.source > 0 ? tl('分解电压') : tl('电动势'), value: qty(c.emf, 'V', 3) },
    { id: 'U', label: tl('路端电压'), value: qty(live ? c.U : 0, 'V', 3) },
    { id: 'I', label: tl('电流'), value: Math.abs(c.I) < 0.1 ? qty(Math.abs(c.I) * 1000, 'mA', 2) : qty(Math.abs(c.I), 'A', 3) },
    { id: 'Pw', label: tl('功率'), value: withUnit(sig(c.P, 3), 'W') },
    { id: 'Q', label: tl('通过电量'), value: withUnit(sig(c.charge, 3), 'C') }
  ]
  if (c.internal !== null) rows.push({ id: 'r', label: tl('内阻（估计）'), value: withUnit(sig(c.internal, 3), 'Ω') })
  return rows
})
const poles = computed(() => {
  const c = circuit.value
  if (!c) return []
  const cell = !(c.source > 0)
  return (['a', 'b'] as const).map(k => {
    const pole = c[k]
    const isAnode = c.anode === k
    const role = c.anode === null ? '' : cell ? (isAnode ? tl('负极') : tl('正极')) : isAnode ? tl('阳极') : tl('阴极')
    return { id: k, role, material: speciesName(pole.material), couple: (isAnode ? c.anodeCouple : c.cathodeCouple) ?? '', dm: Math.abs(pole.massChange_g) < 1 ? qty(pole.massChange_g * 1000, 'mg', 2) : qty(pole.massChange_g, 'g', 3), vessel: bench.vesselName(pole.vessel) }
  })
})
const marks = computed<Array<{ kind: MarkKind; text: string; note: string }>>(() => {
  const lang = activeLang()
  return (v.value?.diagnostics ?? []).map((d: Diagnostic) => {
    const r = d.code.startsWith('reaction.') ? reactionOf(String(d.params?.id ?? '')) : undefined
    return { kind: d.severity as MarkKind, text: diagnosticText(d), note: r?.note ? r.note[lang] ?? r.note.zh : '' }
  })
})
const seen = computed(() => {
  const id = v.value?.id
  const lang = activeLang()
  return bench.phenomena.value.filter(p => p.vessel === id && !(p.code === 'collect.dissolved' && p.subject === 'H2O(g)')).map(p => ({ key: p.key, text: phenomenonText(p, lang), approx: isApproxNote(p), teaching: p.code === 'reaction' && p.teaching }))
})
const room = computed(() => (bench.state.value ? [fmtTemp(bench.state.value.ambient.T, 1), fmtPressure(bench.state.value.ambient.P, 1)] : []))

// ---- 内容 ----

const view = ref<'macro' | 'micro' | 'symbol'>('macro')
const macro = computed(() => {
  const x = v.value
  if (!x) return []
  const groups: Array<{ id: string; title: string; rows: Array<{ id: string; name: string; formula: string; value: string; note?: string }> }> = []
  const item = (id: string, value: string, note?: string) => ({ id, name: speciesName(id), formula: speciesFormula(id), value, note })
  if (x.volume_mL > 0 || x.water_g) groups.push({ id: 'solution', title: tl('液体'), rows: [{ id: 'sol', name: x.water_g ? tl('水溶液') : tl('液体'), formula: '', value: fmtVolume(x.volume_mL, 2) }, ...x.liquids.map(l => item(l.id, fmtAmount(l.n))), ...x.solutes.map(l => item(l.id, fmtAmount(l.n)))] })
  if (x.solids.length) groups.push({ id: 'solid', title: tl('固体'), rows: x.solids.map(s => item(s.id, fmtMass(s.g), formName(s.form))) })
  if (x.gas.length) groups.push({ id: 'gas', title: x.closed ? tl('瓶内气体') : tl('收集的气体'), rows: x.gas.map(g => item(g.id, fmtAmount(g.n))) })
  if (x.released.length) groups.push({ id: 'released', title: tl('已逸出'), rows: x.released.filter(g => g.n > 1e-9).map(g => item(g.id, fmtAmount(g.n))) })
  return groups.filter(g => g.rows.length)
})
function formName(f: string): string {
  const names: Record<string, () => string> = { powder: () => tl('粉末'), crystal: () => tl('晶体'), granule: () => tl('粒'), pellet: () => tl('片粒'), chip: () => tl('碎块'), lump: () => tl('块'), ribbon: () => tl('条'), foil: () => tl('箔'), sheet: () => tl('片'), wire: () => tl('丝'), rod: () => tl('棒'), precipitate: () => tl('沉淀') }
  return names[f]?.() ?? f
}
const species = computed(() => (v.value?.species ?? []).filter(s => s.n > 0))
const shares = computed(() => particleShares(species.value.map(s => ({ id: s.id, label: speciesFormula(s.id), z: s.z, n: s.n })), chemPalette()))
const traces = computed(() => species.value.filter(s => !shares.value.some(x => x.id === s.id)).length)
const nearly = computed(() => (v.value?.si ?? []).filter(s => s.si > -1).map(s => ({ id: s.id, name: speciesName(s.id), si: fixed(s.si, 2), saturated: s.si >= -1e-6 })))

const balanced = new Map<string, string | null>()
const reactions = computed(() => {
  const id = v.value?.id
  const lang = activeLang()
  return bench.phenomena.value.filter(p => p.vessel === id && p.code === 'reaction').map(p => {
    const r = reactionOf(p.subject)
    if (r && !balanced.has(r.id)) {
      const reactants = Object.keys(r.eq).filter(k => r.eq[k] < 0), products = Object.keys(r.eq).filter(k => r.eq[k] > 0)
      let text: string | null = null
      try { const b = chemBalance(reactants, products); if (b.balanced) text = equationText(reactants, products, b.coefficients) } catch { /* the core could not read a formula */ }
      balanced.set(r.id, text)
    }
    return { id: p.subject, name: reactionName(p.subject, lang), equation: r ? balanced.get(r.id) ?? null : null, extent: fmtAmount(p.n), teaching: p.teaching }
  })
})

const micro = ref<HTMLCanvasElement | null>(null)
let raf = 0, t0 = 0
function drawMicro(now = 0) {
  raf = 0
  const c = micro.value
  if (!c || props.tab !== 'contents' || view.value !== 'micro') return
  const w = c.clientWidth, h = c.clientHeight
  if (!w || !h) return
  const dpr = window.devicePixelRatio || 1
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr) }
  const ctx = c.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  const still = calmMotion() || !pageActive.value || sysEnv.hidden
  if (!t0) t0 = now
  drawParticles(ctx, chemPalette(), w, h, shares.value, still ? 0 : (now - t0) / 1000)
  if (!still) raf = requestAnimationFrame(drawMicro)
}
const kick = () => { if (!raf && typeof requestAnimationFrame !== 'undefined') raf = requestAnimationFrame(drawMicro) }
watch(() => [props.tab, view.value, shares.value, app.theme, pageActive.value, sysEnv.hidden, micro.value], kick, { flush: 'post' })
onBeforeUnmount(() => { if (raf) cancelAnimationFrame(raf) })

// ---- 记录 ----

const lines = computed(() => {
  void activeLang()
  const kinds = new Map<string, string>()
  for (const e of bench.log.value) if (e.act === 'place') kinds.set(e.object.id, e.object.kind)
  const ctx = { name: bench.vesselName, kind: (id: string) => bench.objectOf(id)?.kind ?? kinds.get(id) }
  return groupedLog(bench.log.value).map((g, i) => ({ n: i + 1, text: logLine(g.entry, ctx), count: g.count, wait: g.wait }))
})
const stem = () => (bench.fileName.value ?? 'bench').replace(/\.velophi-bench\.json$|\.json$/i, '')
async function exportText() { await saveFile(recordText(bench, new Date().toLocaleDateString(localeTag())), `${stem()}.txt`, [{ name: tl('实验记录'), extensions: ['txt'] }]) }
async function exportJson() { await saveFile(JSON.stringify(bench.portableDoc(), null, 1), `${stem()}.${BENCH_EXT}`, [{ name: tl('VeloPhi 实验台'), extensions: ['json'] }]) }
defineExpose({ exportText })
</script>

<template>
  <div class="insp" :data-ui="`chem-inspector-${props.tab}`">
    <!-- 读数 -->
    <template v-if="props.tab === 'readings'">
      <FixturePanel v-if="bench.selectedFixture.value" />
      <template v-else-if="v">
        <h3 class="vname">{{ name }}<span class="cap num">{{ fmtVolume(v.capacity_mL, 0) }}</span></h3>
        <dl class="key" data-ui="chem-readings">
          <div v-for="r in main" :key="r.id" class="kv" :data-reading="r.id"><dt>{{ r.label }}</dt><dd class="num" :title="r.title">{{ r.value }}</dd></div>
        </dl>
        <template v-if="instruments.length">
          <div class="group-title">{{ tl('仪表') }}</div>
          <dl class="list"><div v-for="r in instruments" :key="r.id" class="lv"><dt>{{ r.label }}</dt><dd class="num">{{ r.value }}</dd></div></dl>
        </template>
        <template v-if="circuit">
          <div class="group-title">{{ tl('电路') }}</div>
          <dl class="list" data-ui="chem-circuit">
            <div v-for="r in circuitRows" :key="r.id" class="lv"><dt>{{ r.label }}</dt><dd class="num">{{ r.value }}</dd></div>
            <div v-for="p in poles" :key="p.id" class="lv pole"><dt><b v-if="p.role">{{ p.role }}</b> {{ p.material }}<span v-if="p.couple" class="muted"> · {{ p.couple }}</span></dt><dd class="num" :title="tl('质量变化')">{{ p.dm }}</dd></div>
          </dl>
          <p v-if="!circuit.connected" class="line warn">{{ tl('电路未接通：两个容器之间需要盐桥') }}</p>
        </template>
        <ul v-if="marks.length" class="marks" data-ui="chem-diagnostics">
          <li v-for="(m, i) in marks" :key="i"><span class="badge" :class="m.kind === 'unmodelled' || m.kind === 'error' ? 'bad' : m.kind === 'approx' ? 'warn' : ''">{{ markLabel(m.kind) }}</span><span>{{ m.text }}<span v-if="m.note" class="mnote">{{ m.note }}</span></span></li>
        </ul>
        <div class="group-title">{{ tl('曲线') }}</div>
        <LiveChart :vessel="v.id" />
        <template v-if="seen.length">
          <div class="group-title">{{ tl('现象') }}</div>
          <ul class="seen"><li v-for="p in seen" :key="p.key">{{ p.text }}<span v-if="p.teaching" class="badge warn" :title="tl('速率常数是课堂量级的估计')">{{ tl('近似') }}</span></li></ul>
        </template>
        <details class="all">
          <summary data-ui="chem-all-readings">{{ tl('全部读数') }}</summary>
          <dl class="list"><div v-for="r in rest" :key="r.id" class="lv"><dt>{{ r.label }}</dt><dd class="num" :title="r.title">{{ r.value }}</dd></div></dl>
        </details>
      </template>
      <template v-else>
        <p class="none">{{ tl('选中一个容器') }}</p>
        <dl class="list"><div class="lv"><dt>{{ tl('室温') }}</dt><dd class="num">{{ room[0] }}</dd></div><div class="lv"><dt>{{ tl('气压') }}</dt><dd class="num">{{ room[1] }}</dd></div><div class="lv"><dt>{{ tl('实验台时间') }}</dt><dd class="num">{{ fmtDuration(bench.time.value) }}</dd></div></dl>
      </template>
    </template>

    <!-- 内容 -->
    <template v-else-if="props.tab === 'contents'">
      <template v-if="v">
        <h3 class="vname">{{ name }}</h3>
        <div class="segmented reps" role="tablist" :aria-label="tl('表征')">
          <button type="button" role="tab" :class="{ on: view === 'macro' }" :aria-selected="view === 'macro'" data-ui="chem-rep-macro" @click="view = 'macro'">{{ tl('宏观') }}</button>
          <button type="button" role="tab" :class="{ on: view === 'micro' }" :aria-selected="view === 'micro'" data-ui="chem-rep-micro" @click="view = 'micro'">{{ tl('微观') }}</button>
          <button type="button" role="tab" :class="{ on: view === 'symbol' }" :aria-selected="view === 'symbol'" data-ui="chem-rep-symbol" @click="view = 'symbol'">{{ tl('符号') }}</button>
        </div>
        <template v-if="view === 'macro'">
          <p v-if="!macro.length" class="none">{{ tl('空的') }}</p>
          <template v-for="g in macro" :key="g.id">
            <div class="group-title">{{ g.title }}</div>
            <dl class="list"><div v-for="r in g.rows" :key="r.id" class="lv"><dt>{{ r.name }}<span v-if="r.formula && r.formula !== r.name" class="formula">{{ r.formula }}</span><span v-if="r.note" class="muted"> · {{ r.note }}</span></dt><dd class="num">{{ r.value }}</dd></div></dl>
          </template>
        </template>
        <template v-else-if="view === 'micro'">
          <p v-if="!shares.length" class="none">{{ tl('没有溶液') }}</p>
          <template v-else>
            <div class="microbox"><canvas ref="micro" class="micro" /><span class="badge schem" :title="tl('粒子数之比按实际组成；位置与运动没有意义，未画出溶剂')">{{ tl('示意') }}</span></div>
            <ul class="legend"><li v-for="s in shares" :key="s.id"><i :style="{ borderColor: s.colour, borderStyle: s.z === 0 ? 'dashed' : 'solid' }" /><span class="formula1">{{ s.label }}</span><span class="num muted">{{ s.count }}</span></li></ul>
            <p v-if="traces" class="line muted">{{ tl('另有 {0} 种微量粒子未画出', [traces]) }}</p>
          </template>
        </template>
        <template v-else>
          <p v-if="!species.length && !reactions.length" class="none">{{ tl('没有溶液') }}</p>
          <table v-if="species.length" class="tbl" data-ui="chem-species">
            <thead><tr><th>{{ tl('粒子') }}</th><th class="r">n</th><th class="r">c</th></tr></thead>
            <tbody><tr v-for="s in species" :key="s.id" :title="speciesName(s.id)"><td class="formula1">{{ speciesFormula(s.id) }}</td><td class="r num">{{ fmtAmount(s.n) }}</td><td class="r num">{{ fmtConc(s.c) }}</td></tr></tbody>
          </table>
          <template v-if="nearly.length">
            <div class="group-title">{{ tl('饱和指数') }}</div>
            <dl class="list"><div v-for="s in nearly" :key="s.id" class="lv"><dt>{{ s.name }}</dt><dd class="num">{{ s.si }}</dd></div></dl>
          </template>
          <template v-if="reactions.length">
            <div class="group-title">{{ tl('反应') }}</div>
            <ul class="eqs" data-ui="chem-equations"><li v-for="r in reactions" :key="r.id"><span class="eqname">{{ r.name }}<span v-if="r.teaching" class="badge warn" :title="tl('速率常数是课堂量级的估计')">{{ tl('近似') }}</span></span><span v-if="r.equation" class="eq">{{ r.equation }}</span><span class="num muted">{{ tl('进度 {0}', [r.extent]) }}</span></li></ul>
          </template>
        </template>
      </template>
      <p v-else class="none">{{ tl('选中一个容器') }}</p>
    </template>

    <!-- 记录 -->
    <template v-else>
      <div class="logbar">
        <button type="button" class="btn small" :disabled="!lines.length" data-ui="chem-log-text" @click="exportText">{{ tl('导出文本') }}</button>
        <button type="button" class="btn small" :disabled="!lines.length" data-ui="chem-log-json" @click="exportJson">{{ tl('导出文档') }}</button>
      </div>
      <p v-if="!lines.length" class="none">{{ tl('还没有操作') }}</p>
      <ol class="log" data-ui="chem-log"><li v-for="l in lines" :key="l.n" :class="{ wait: l.wait }"><span class="n num">{{ l.n }}</span><span class="t">{{ l.text }}<span v-if="l.count > 1" class="num muted"> × {{ l.count }}</span></span></li></ol>
    </template>
  </div>
</template>

<style scoped>
.insp { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
.vname { margin: var(--space-1) 0 0; font-size: var(--type-subtitle); font-weight: var(--weight-title); line-height: var(--line-tight); display: flex; align-items: baseline; gap: var(--space-2); }
.cap { font-size: var(--type-small); font-weight: var(--weight-regular); color: var(--text-3); }
/* the readings that matter first: large figures on a scale-like grid */
.key { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; margin: 0; background: var(--separator); border-radius: var(--radius-group); overflow: hidden; box-shadow: var(--elev-1); }
.kv { background: var(--pane); padding: var(--space-2) var(--space-3); min-width: 0; }
.kv:last-child:nth-child(odd) { grid-column: 1 / -1; }
.kv dt { font-size: var(--type-small); color: var(--text-2); }
.kv dd { margin: 0; font-size: var(--type-panel); font-weight: var(--weight-strong); line-height: var(--line-tight); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.list { margin: 0; display: flex; flex-direction: column; }
.lv { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); padding: 5px 2px; }
.lv + .lv { border-top: 1px solid var(--separator); }
.lv dt { min-width: 0; color: var(--text-2); font-size: var(--type-small); overflow-wrap: break-word; }
.lv dd { margin: 0; flex: 0 0 auto; white-space: nowrap; }
.pole dt b { color: var(--text); font-weight: var(--weight-strong); }
.formula { margin-left: 6px; color: var(--text-3); }
.formula1 { white-space: nowrap; }
.marks, .seen, .eqs, .legend, .log { list-style: none; margin: 0; padding: 0; }
.marks li { display: flex; align-items: baseline; gap: var(--space-2); padding: 4px 0; font-size: var(--type-small); line-height: 1.45; }
.marks .badge { flex: 0 0 auto; }
.mnote { display: block; color: var(--text-2); }
.seen li { display: flex; align-items: center; gap: var(--space-2); padding: 3px 2px; font-size: var(--type-small); }
.line { margin: 0; font-size: var(--type-small); }
.line.warn { color: var(--warning); }
.none { margin: var(--space-4) 0; text-align: center; color: var(--text-2); font-size: var(--type-small); }
.all summary { cursor: pointer; padding: 6px 2px; font-size: var(--type-small); color: var(--text-2); font-weight: var(--weight-strong); }
.reps { display: flex; }
.reps button { flex: 1 1 0; justify-content: center; }
.microbox { position: relative; border-radius: var(--radius-group); overflow: hidden; box-shadow: var(--elev-1); }
.micro { display: block; width: 100%; height: 200px; }
.schem { position: absolute; right: 6px; top: 6px; background: var(--pane); box-shadow: var(--elev-1); }
.legend { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2px 12px; }
.legend li { display: flex; align-items: center; gap: 6px; font-size: var(--type-small); min-width: 0; }
.legend i { flex: 0 0 auto; width: 12px; height: 12px; border-radius: var(--radius-round); border-width: 1.5px; }
.legend .num { margin-left: auto; }
.tbl { width: 100%; border-collapse: collapse; font-size: var(--type-small); }
.tbl th { text-align: left; font-weight: var(--weight-strong); color: var(--text-2); padding: 4px 2px; border-bottom: 1px solid var(--separator); }
.tbl td { padding: 4px 2px; border-bottom: 1px solid var(--separator); white-space: nowrap; }
.tbl .r { text-align: right; }
.eqs li { display: flex; flex-direction: column; gap: 2px; padding: 5px 2px; font-size: var(--type-small); }
.eqs li + li { border-top: 1px solid var(--separator); }
.eqname { display: flex; align-items: center; gap: var(--space-2); color: var(--text-2); }
.eq { font-size: var(--type-body); overflow-wrap: break-word; }
.logbar { display: flex; gap: var(--space-2); }
.log li { display: flex; gap: var(--space-2); padding: 4px 2px; font-size: var(--type-small); line-height: 1.45; }
.log li + li { border-top: 1px solid var(--separator); }
.log .n { flex: 0 0 22px; text-align: right; color: var(--text-3); }
.log .t { min-width: 0; overflow-wrap: break-word; }
.log li.wait .t { color: var(--text-3); }
</style>
