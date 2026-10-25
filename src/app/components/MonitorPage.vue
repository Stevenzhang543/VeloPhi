<script setup lang="ts">
/**
 * Render and monitor page: a large rendered view with playback, and a live dashboard for presenting and
 * reading a run: watched quantities as tiles (display units, sparkline up to the current time), the energy
 * ledger as bars, up to four charts, the formula status at the current time, the event log (click to seek)
 * and the progress of a run still computing. Readouts follow `state.panelFrame`; nothing updates while the
 * page is hidden.
 */
import { tl, paren } from '../../i18n'
import { msgText } from '../../i18n/locale'
import { computed, provide, ref } from 'vue'
import { state, edit } from '../store'
import { canonicalQuantityId, evaluateQuantity, listQuantities, makeContext } from '../../core/observe/quantities'
import type { QuantityDef } from '../../core/observe/quantities'
import { cardsAt } from '../../formula/match'
import { withinLevel } from '../../formula/levels'
import type { Verdict } from '../../formula/match'
import { PAGE_ACTIVE, recentWindow, seriesFor, seriesWindow, useGated } from '../live'
import { fmtQ, fmtTime, unitLabel, effectiveCurriculum, settings } from '../settings'
import Viewport from './Viewport.vue'
import Timeline from './Timeline.vue'
import ChartPanel from './ChartPanel.vue'
import EventList from './EventList.vue'
import MetricTile from './MetricTile.vue'
import EnergyBars from './EnergyBars.vue'
import Icon from './Icon.vue'
import Tex from './Tex.vue'
import { openFormulaDetail } from '../details'

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })
provide(PAGE_ACTIVE, computed(() => props.active))

const COLORS = ['#2f7cf6', '#e5484d', '#16a34a', '#d97706', '#8b5cf6', '#0891b2', '#db2777', '#64748b']

const live = () => props.active
const rec = useGated(live, () => (state.stale ? null : state.recording))
const runId = useGated(live, () => state.runId)
const frame = useGated(live, () => state.panelFrame)

const quantities = computed<Map<string, QuantityDef>>(() => new Map((rec.value ? listQuantities(rec.value.system) : []).map(q => [q.id, q])))
/** Watched ids in their listed form (pair.b|a ≡ pair.a|b), known to this recording. */
const watchIds = computed(() => [...new Set(state.scene.watch.map(canonicalQuantityId))].filter(id => quantities.value.has(id)))
const k = computed(() => (rec.value ? Math.min(frame.value, rec.value.frameCount - 1) : 0))
// An unbounded run's sparklines show the recent window around the frame shown
const series = computed(() => (rec.value && watchIds.value.length ? (rec.value.unbounded ? seriesWindow(rec.value, runId.value, watchIds.value, recentWindow(rec.value, k.value * rec.value.dt)) : seriesFor(rec.value, runId.value, watchIds.value)) : null))
const values = computed(() => {
  const r = rec.value
  const out = new Map<string, number>()
  if (!r) return out
  const ctx = makeContext(r, k.value)
  for (const id of watchIds.value) out.set(id, evaluateQuantity(ctx, id))
  return out
})
/** Current frame as a fraction of the sparkline's sample range. */
const at = computed(() => {
  const s = series.value
  if (!s || s.total < 2) return 0
  return (k.value - s.from) / s.stride / (s.total - 1)
})
const tNow = computed(() => (rec.value ? k.value * rec.value.dt : 0))
const duration = computed(() => (rec.value ? Math.max((rec.value.frameCount - 1) * rec.value.dt, rec.value.scene.settings.duration ?? 0) : state.scene.settings.duration ?? 0))

// ---- Formula status ----
const CLASS: Record<Verdict, 'match' | 'approx' | 'deviate' | 'none'> = {
  match: 'match', 'approx-ok': 'approx', approx: 'approx', deviate: 'deviate', 'approx-invalid': 'deviate', 'no-measure': 'none', 'not-applicable': 'none'
}
const VERDICT: Record<Verdict, { text: string; cls: string }> = {
  match: { text: tl('一致'), cls: 'ok' }, deviate: { text: tl('偏差超限'), cls: 'bad' }, 'approx-ok': { text: tl('近似成立'), cls: 'ok' }, approx: { text: tl('近似'), cls: 'warn' },
  'approx-invalid': { text: tl('近似失效'), cls: 'bad' }, 'not-applicable': { text: tl('不适用'), cls: '' }, 'no-measure': { text: tl('无法比较'), cls: '' }
}
const cards = computed(() => {
  const r = rec.value
  if (!r || !state.situations.length) return []
  const cur = effectiveCurriculum(), level = settings.knowledge.level
  return cardsAt(state.situations, tNow.value, { digits: state.digits }).filter(c => c.verdict !== 'not-applicable' && withinLevel(c.formula.id, cur, level))
})
const counts = computed(() => {
  const c = { match: 0, approx: 0, deviate: 0, none: 0 }
  for (const card of cards.value) c[CLASS[card.verdict]]++
  return c
})

// ---- Watch list ----
const picking = ref('')
const addable = computed(() => [...quantities.value.values()].filter(q => !watchIds.value.includes(q.id)))
function add() {
  const id = picking.value
  picking.value = ''
  if (!id || watchIds.value.includes(id)) return
  edit(s => s.watch.push(id))
}
function remove(id: string) {
  edit(s => { s.watch = s.watch.filter(w => canonicalQuantityId(w) !== id) })
  state.chart = state.chart.filter(c => canonicalQuantityId(c) !== id)
}
function chart(id: string) { if (!state.chart.some(c => canonicalQuantityId(c) === id)) state.chart = [...state.chart, id] }
function openFormulas() { state.rightTab = 'formula'; state.page = 'studio' }

const status = computed(() => {
  if (state.simError) return { text: tl('计算出错'), cls: 'bad', title: msgText(state.simError) }
  if (state.stale) return { text: state.computing ? tl('计算中…') : tl('结果已过期'), cls: 'warn', title: '' }
  if (state.computing) return { text: state.run.unbounded ? tl('持续计算') : tl('计算中 {0}%', [Math.round(state.progress * 100)]), cls: 'info', title: tl('已算出的部分可以先播放') }
  if (rec.value && rec.value.reducedFrom != null) return { text: tl('精度降级'), cls: 'warn', title: rec.value.reducedFrom > 0 ? tl('自 t = {0} 起改用 Moreau–Jean 时间步进', [fmtQ(rec.value.reducedFrom, 's', 6)]) : tl('使用 Moreau–Jean 时间步进计算') }
  if (rec.value && !rec.value.completed) return { text: tl('未完成'), cls: 'warn', title: msgText(rec.value.error) }
  return rec.value ? { text: tl('已完成'), cls: 'ok', title: tl('结果指纹 SHA-256 {0}…', [rec.value.hash.slice(0, 16)]) } : { text: tl('未运行'), cls: '', title: '' }
})
</script>

<template>
  <div class="monitor">
    <section class="stage">
      <div class="stage-view"><Viewport variant="monitor" /></div>
      <div class="pane transport">
        <Timeline :active="active" />
        <div class="chart-box"><ChartPanel variant="monitor" :limit="4" :active="active" /></div>
      </div>
    </section>

    <aside class="pane dash">
      <header class="dash-head">
        <div class="scene">
          <div class="scene-name">{{ state.scene.name }}</div>
          <div class="tiny muted">{{ tl('时长 {0} · Δt = {1} · g = {2}', [fmtQ(duration, 's'), fmtQ(state.scene.settings.outputStep, 's'), fmtQ(Math.hypot(state.scene.settings.gravity.x, state.scene.settings.gravity.y), 'm/s²')]) }}</div>
        </div>
        <span class="badge" :class="status.cls" :title="status.title">{{ status.text }}</span>
      </header>
      <div class="clock">
        <span class="t mono">t = {{ fmtTime(tNow, rec?.dt ?? state.scene.settings.outputStep) }}</span>
        <span class="tiny muted mono">{{ tl('帧 {0}', [k]) }}</span>
      </div>
      <div v-if="rec && rec.reducedFrom != null" class="reduced tiny">
        <b>{{ tl('精度降级') }}</b>{{ tl('：{0}使用 Moreau–Jean 时间步进，事件时刻不精确定位，公式对照仅供参考。', [rec.reducedFrom > 0 ? tl('自 t = {0} 起', [fmtQ(rec.reducedFrom, 's', 6)]) : tl('全程')]) }}
      </div>
      <div v-if="state.computing" class="computing">
        <div class="progress"><i :style="{ transform: `scaleX(${state.progress})` }" /></div>
        <div class="tiny muted">{{ tl('已计算到 {0}，可先播放已算出的部分。', [fmtQ(state.run.tComputed, 's', 4)]) }}</div>
      </div>

      <div class="body">
        <h3 class="sec"><Icon name="gauge" :size="15" />{{ tl('监视量') }}<span class="spacer" />
          <select v-model="picking" class="field add" :disabled="!rec" :title="tl('添加监视量')" @change="add">
            <option value="" disabled>{{ tl('＋ 添加…') }}</option>
            <option v-for="q in addable" :key="q.id" :value="q.id">{{ q.owner }} · {{ q.label }}{{ paren(unitLabel(q.unit) || tl('无量纲')) }}</option>
          </select>
        </h3>
        <div v-if="!rec" class="empty">{{ tl('运行仿真后显示读数。') }}</div>
        <div v-else-if="!watchIds.length" class="empty">{{ tl('还没有监视量。用右上角的“添加”，或在工作台点选物体后加入。') }}</div>
        <div v-else class="tiles">
          <MetricTile v-for="(id, i) in watchIds" :key="id" :label="quantities.get(id)!.label" :owner="quantities.get(id)!.owner" :symbol="quantities.get(id)!.symbol" :unit="quantities.get(id)!.unit"
            :value="values.get(id) ?? null" :series="series?.get(id) ?? null" :total="series?.total ?? 0" :at="at" :color="COLORS[i % COLORS.length]" @remove="remove(id)" @chart="chart(id)" />
        </div>

        <template v-if="rec">
          <h3 class="sec"><Icon name="layers" :size="15" />{{ tl('能量账本') }}</h3>
          <div class="card"><EnergyBars :rec="rec" :frame="k" :run-id="runId" /></div>
        </template>

        <h3 class="sec"><Icon name="check" :size="15" />{{ tl('公式对照') }}<span class="spacer" /><button class="btn ghost small" @click="openFormulas">{{ tl('查看全部') }}</button></h3>
        <div v-if="!rec" class="empty">{{ tl('运行仿真后显示。') }}</div>
        <div v-else-if="state.computing && !state.situations.length" class="empty">{{ tl('计算完成后识别典型情形…') }}</div>
        <template v-else>
          <div class="counts">
            <span class="count ok"><b>{{ counts.match }}</b>{{ tl('一致') }}</span>
            <span class="count warn"><b>{{ counts.approx }}</b>{{ tl('近似') }}</span>
            <span class="count bad"><b>{{ counts.deviate }}</b>{{ tl('偏差 / 失效') }}</span>
            <span v-if="counts.none" class="count"><b>{{ counts.none }}</b>{{ tl('无法比较') }}</span>
          </div>
          <div v-if="!cards.length" class="tiny muted none">{{ tl('当前时刻没有匹配的典型情形。') }}</div>
          <div v-for="c in cards.slice(0, 6)" :key="c.key" class="fcard" :class="VERDICT[c.verdict].cls" :title="tl('点击查看推导与代入求解')" @click="openFormulaDetail(c.formula.id, c.situation.key, tNow)">
            <div class="fhead"><span class="ftitle small">{{ c.formula.title }}</span><span class="badge" :class="VERDICT[c.verdict].cls">{{ VERDICT[c.verdict].text }}</span></div>
            <div class="frow"><Tex :tex="c.symbolic" /></div>
            <div class="fvals small"><span class="muted">{{ tl('理论') }}</span><span class="mono">{{ fmtQ(c.theory, c.formula.unit) }}</span><span class="muted">{{ tl('仿真') }}</span><span class="mono">{{ fmtQ(c.sim, c.formula.unit) }}</span></div>
          </div>
          <div v-if="cards.length > 6" class="tiny muted none">{{ tl('另有 {0} 条，点“查看全部”。', [cards.length - 6]) }}</div>
        </template>

        <h3 class="sec"><Icon name="flag" :size="15" />{{ tl('事件') }}<span class="tiny muted">{{ tl('（点击跳转）') }}</span></h3>
        <div class="event-box"><EventList compact :active="active" /></div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.monitor { display: grid; grid-template-columns: minmax(0, 1fr) calc(392px * var(--zoom)); gap: 8px; min-height: 0; height: 100%; }
.stage { display: flex; flex-direction: column; gap: 8px; min-width: 0; min-height: 0; }
.stage-view { flex: 1; min-height: 200px; }
.transport { flex: 0 0 auto; height: clamp(230px, 34vh, 330px); }
.chart-box { flex: 1; min-height: 0; position: relative; }
.chart-box > * { position: absolute; inset: 0; }
.dash { min-height: 0; }
.dash-head { display: flex; align-items: flex-start; gap: 8px; padding: 12px 14px 0; }
.scene { flex: 1; min-width: 0; }
.scene-name { font-weight: 650; font-size: var(--type-title); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.clock { display: flex; align-items: baseline; gap: 10px; padding: 6px 14px 4px; }
.clock .t { font-size: var(--type-display); font-weight: 650; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.reduced { margin: 2px 14px 6px; padding: 6px 10px; border-radius: 8px; background: var(--warning-soft); line-height: 1.5; }
.reduced b { color: var(--warning); }
.computing { padding: 0 14px 6px; display: flex; flex-direction: column; gap: 4px; }
.body { flex: 1; overflow: auto; padding: 0 14px 14px; min-height: 0; }
.sec { display: flex; align-items: center; gap: 6px; font-size: var(--type-small); font-weight: 650; color: var(--text-2); margin: 14px 0 6px; }
.add { height: 24px; width: 110px; font-size: var(--type-tiny); }
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.card { background: var(--group); border-radius: var(--radius-group); padding: 10px; }
.counts { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
.count { display: inline-flex; align-items: baseline; gap: 4px; padding: 4px 10px; border-radius: 999px; background: var(--fill); font-size: var(--type-tiny); color: var(--text-2); }
.count b { font-size: var(--type-title); font-family: var(--font-mono); }
.count.ok { background: var(--success-soft); color: var(--success); }
.count.warn { background: var(--warning-soft); color: var(--warning); }
.count.bad { background: var(--danger-soft); color: var(--danger); }
.fcard { cursor: pointer; background: var(--group); border-radius: var(--radius-group); padding: 6px 10px; margin-bottom: 6px; border-left: 3px solid transparent; }
.fcard.ok { border-left-color: var(--success); }
.fcard.warn { border-left-color: var(--warning); }
.fcard.bad { border-left-color: var(--danger); }
.fhead { display: flex; align-items: center; gap: 6px; justify-content: space-between; }
.ftitle { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.frow { margin-top: 2px; overflow-x: auto; overflow-y: hidden; white-space: nowrap; }
.fvals { display: grid; grid-template-columns: auto 1fr auto 1fr; gap: 0 8px; align-items: baseline; margin-top: 2px; }
.fvals .mono { text-align: right; }
.none { padding: 4px 2px; }
.event-box { background: var(--group); border-radius: var(--radius-group); padding: 2px 6px 4px; max-height: 260px; overflow: auto; }
</style>
