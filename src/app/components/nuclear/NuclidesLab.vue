<script setup lang="ts">
/**
 * Nuclides (26.64, D276; 物理实验 › 原子与核): the chart of nuclides with the page of the chosen nuclide, and the
 * decay-chain view — the network below a nuclide and its amounts and activities in time (Bateman's solution by the
 * core: `nuclideChain`, `nuclideDecay`). Every number shown is a field of a result of the core (src/engine/nuclear.ts);
 * the diagnostics of the core are shown with the result. Data: NUBASE2020 / AME2020, cited on the page.
 *
 * Opened from elsewhere through src/app/nuclideLink.ts (`openNuclide`, the address `#n=U-235`).
 */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { activeLang, tl } from '../../../i18n'
import { state } from '../../store'
import { labState } from '../../lab/state'
import { addUiTestHook } from '../../uitest'
import { nuclideRequest, syncNuclideHash } from '../../nuclideLink'
import type { DecayChain, DecayResult } from '../../../engine/nuclear'
import { nuclideChain, nuclideDecay } from '../../../engine/nuclear'
import type { NuclideTable } from '../../../nuclear/table'
import { loadNuclideTable } from '../../../nuclear/table'
import type { ColourScheme } from '../../../nuclear/chart'
import { chartStats } from '../../../nuclear/chartStats'
import type { ElementName } from '../../../nuclear/search'
import { resolveNuclide, searchNuclides } from '../../../nuclear/search'
import { nuclideLine, nuclidePage } from '../../../nuclear/page'
import { chainLayout, decayRows, decayView, sampleTime, sampleTimes } from '../../../nuclear/chain'
import { diagnosticLines, nuclearErrorText, severityText } from '../../../nuclear/diagText'
import { halfLifeText, nuclideLabel } from '../../../nuclear/format'
import Icon from '../Icon.vue'
import NumField from '../NumField.vue'
import LabChart from '../lab/LabChart.vue'
import NuclideChart from './NuclideChart.vue'
import NuclidePanel from './NuclidePanel.vue'
import ChainDiagram from './ChainDiagram.vue'
import NuclearSources from './NuclearSources.vue'

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })

type Unit = 'mol' | 'g' | 'Bq' | 'N'
const S = labState('nuclides', () => ({
  view: 'chart' as 'chart' | 'chain', scheme: 'mode' as ColourScheme, nuclide: 'U-235' as string, parent: 'U-238' as string,
  amount: 1, unit: 'mol' as Unit, quantity: 'A' as 'A' | 'N', logTime: true, logValue: true, span: 5
}))

const table = shallowRef<NuclideTable | null>(null)
const names = shallowRef<ElementName[]>([])
const loadError = ref('')
const chart = ref<InstanceType<typeof NuclideChart> | null>(null)
const dark = computed(() => state.theme === 'dark')

onMounted(async () => {
  try {
    table.value = await loadNuclideTable()
  } catch (e) { loadError.value = nuclearErrorText(e); return }
  // the element names of the encyclopedia make `铀235` and `Uran 235` findable; the chart works without them
  import('../../../chem/data').then(m => m.loadElementData()).then(d => { names.value = d.elements.map(e => ({ z: e.z, symbol: e.symbol, zh: e.name.zh, en: e.name.en, de: e.name.de })) }).catch(() => {})
  if (nuclideRequest.seq > nuclideRequest.done) follow()
})

// ---- the chosen nuclide ----
const record = computed(() => (table.value ? table.value.byId.get(S.nuclide) ?? null : null))
const page = computed(() => {
  activeLang()
  return record.value && table.value ? nuclidePage(record.value, table.value, names.value.find(e => e.z === record.value!.Z) ?? null, activeLang()) : null
})
function select(id: string, focus = false) {
  if (!table.value?.byId.has(id)) return
  S.nuclide = id
  if (focus) { const r = table.value.byId.get(id)!; chart.value?.focus(r.N, r.Z) }
}
function openPage(id: string) { S.view = 'chart'; select(id); requestAnimationFrame(() => { const r = table.value?.byId.get(id); if (r) chart.value?.focus(r.N, r.Z) }) }
function openChain(id: string) { S.parent = id; S.view = 'chain' }

// ---- requests from elsewhere (element pages, the address) ----
function follow() {
  const t = table.value
  if (!t) return
  nuclideRequest.done = nuclideRequest.seq
  if (nuclideRequest.nuclide === null) { S.view = 'chart'; return }
  const r = resolveNuclide(nuclideRequest.nuclide, t)
  if (!r) { loadError.value = tl('核素表里没有 {0}。', [nuclideRequest.nuclide]); return }
  loadError.value = ''
  if (nuclideRequest.chain && !r.stable) openChain(r.id)
  else openPage(r.id)
}
watch(() => nuclideRequest.seq, () => { if (table.value) follow() })

// ---- search ----
const query = ref('')
const searchOpen = ref(false)
const hits = computed(() => (table.value && query.value.trim() ? searchNuclides(query.value, table.value, names.value, 10) : []))
const hitLines = computed(() => hits.value.map(r => ({ id: r.id, text: nuclideLine(r) })))
function pick(id: string) {
  searchOpen.value = false
  query.value = ''
  if (S.view === 'chain') { const r = table.value?.byId.get(id); if (r && !r.stable) { openChain(id); return } }
  openPage(id)
}
function searchKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && hits.value.length) { e.preventDefault(); pick(hits.value[0].id) }
  if (e.key === 'Escape') { searchOpen.value = false }
}

// ---- the decay chain ----
const chain = shallowRef<DecayChain | null>(null)
const decay = shallowRef<DecayResult | null>(null)
const chainError = ref('')
const cursor = ref(0)
const SAMPLES = 241
const parentRecord = computed(() => (table.value ? table.value.byId.get(S.parent) ?? null : null))
let token = 0
async function solveChain() {
  const p = parentRecord.value
  if (S.view !== 'chain' || !table.value || !p) return
  const mine = ++token
  chainError.value = ''
  try {
    if (p.stable || p.halfLife === null) throw new Error(`nuclide: ${p.id} does not decay`)
    const c = await nuclideChain(p.id)
    // the time span is a multiple of the parent's half-life; amounts in mol, g, becquerel or nuclei as entered
    const times = sampleTimes(S.span * p.halfLife, SAMPLES, S.logTime)
    const d = await nuclideDecay({ [p.id]: S.amount }, { times }, { unit: S.unit })
    if (mine !== token) return
    chain.value = c; decay.value = d
    cursor.value = SAMPLES - 1
  } catch (e) {
    if (mine !== token) return
    chain.value = null; decay.value = null
    chainError.value = p.stable ? tl('{0} 是稳定核素，没有衰变链。', [nuclideLabel(p.id)]) : nuclearErrorText(e)
  }
}
watch(() => [S.view, S.parent, S.amount, S.unit, S.span, S.logTime, table.value], () => { void solveChain() }, { immediate: true })
const layout = computed(() => { activeLang(); return chain.value && table.value ? chainLayout(chain.value, table.value) : null })
const view = computed(() => { activeLang(); return decay.value ? decayView(decay.value, { quantity: S.quantity, logTime: S.logTime, logValue: S.logValue, dark: dark.value }) : null })
const rows = computed(() => (decay.value && view.value ? decayRows(decay.value, cursor.value, view.value) : []))
const cursorTime = computed(() => (decay.value ? sampleTime(decay.value, cursor.value) : ''))
const cursorX = computed(() => { const d = decay.value; if (!d) return null; const t = d.t[cursor.value]; return S.logTime ? (t > 0 ? Math.log10(t) : null) : t })
const diagnostics = computed(() => { activeLang(); return diagnosticLines(decay.value?.diagnostics ?? chain.value?.diagnostics) })
const spans = [1, 5, 10, 100]

// ---- the address follows what is shown ----
const shown = computed(() => props.active && state.page === 'lab')
watch(() => [shown.value, S.view, S.nuclide, S.parent, !!table.value], () => {
  if (!shown.value || !table.value) { if (!shown.value) syncNuclideHash(null); return }
  syncNuclideHash(S.view === 'chain' ? { nuclide: S.parent, chain: true } : { nuclide: S.nuclide, chain: false })
}, { immediate: true })
onBeforeUnmount(() => syncNuclideHash(null))

addUiTestHook('nuclides', {
  S, stats: chartStats, table: () => table.value, view: () => chart.value?.view ?? null,
  page: () => page.value, chain: () => chain.value, decay: () => decay.value, rows: () => rows.value, diagnostics: () => diagnostics.value,
  select: (id: string) => select(id, true)
})
</script>

<template>
  <div class="lab-shell nuc" data-ui="nuclides-lab">
    <div class="lab-stage">
      <div class="lab-bar">
        <div class="lab-seg" role="tablist" :aria-label="tl('视图')">
          <button role="tab" :aria-selected="S.view === 'chart'" :class="{ on: S.view === 'chart' }" data-ui="nuclides-view-chart" @click="S.view = 'chart'">{{ tl('核素图') }}</button>
          <button role="tab" :aria-selected="S.view === 'chain'" :class="{ on: S.view === 'chain' }" data-ui="nuclides-view-chain" @click="openChain(record && !record.stable ? record.id : S.parent)">{{ tl('衰变链') }}</button>
        </div>
        <div class="nsearch">
          <label class="nsearch-box"><Icon name="search" :size="14" /><input v-model="query" class="field small" type="search" data-ui="nuclide-search" :placeholder="tl('搜索核素，如 U-235、铀235')" :aria-label="tl('搜索核素')" role="combobox" :aria-expanded="searchOpen && hits.length > 0" aria-controls="nuclide-hits" @focus="searchOpen = true" @input="searchOpen = true" @keydown="searchKey" @blur="searchOpen = false" /></label>
          <ul v-if="searchOpen && query.trim()" id="nuclide-hits" class="nhits" role="listbox" data-ui="nuclide-hits">
            <li v-if="!hits.length" class="small empty">{{ tl('没有找到这个核素') }}</li>
            <li v-for="h in hitLines" :key="h.id" role="option" :aria-selected="false"><button class="small num" :data-nuclide="h.id" @mousedown.prevent="pick(h.id)">{{ h.text }}</button></li>
          </ul>
        </div>
        <template v-if="S.view === 'chart'">
          <label class="ctl">{{ tl('配色') }}
            <select v-model="S.scheme" class="field small" data-ui="nuclide-scheme" :aria-label="tl('配色')">
              <option value="mode">{{ tl('衰变方式') }}</option>
              <option value="halfLife">{{ tl('半衰期') }}</option>
              <option value="binding">{{ tl('比结合能') }}</option>
            </select>
          </label>
        </template>
        <template v-else>
          <div class="lab-seg" :aria-label="tl('纵轴的量')">
            <button :class="{ on: S.quantity === 'A' }" data-ui="chain-quantity-A" @click="S.quantity = 'A'">{{ tl('活度') }}</button>
            <button :class="{ on: S.quantity === 'N' }" data-ui="chain-quantity-N" @click="S.quantity = 'N'">{{ tl('核数') }}</button>
          </div>
          <label class="ctl">{{ tl('时长') }}
            <select v-model.number="S.span" class="field small" data-ui="chain-span" :aria-label="tl('时长')">
              <option v-for="k in spans" :key="k" :value="k">{{ k }} T½</option>
            </select>
          </label>
          <label class="ctl"><input v-model="S.logTime" type="checkbox" data-ui="chain-log-time" />{{ tl('对数时间') }}</label>
          <label class="ctl"><input v-model="S.logValue" type="checkbox" data-ui="chain-log-value" />{{ tl('对数纵轴') }}</label>
        </template>
      </div>

      <div v-if="loadError" class="nstate small" role="alert" data-ui="nuclides-error">{{ loadError }}</div>
      <div v-if="!table && !loadError" class="nstate small" data-ui="nuclides-loading">{{ tl('正在载入核素表…') }}</div>

      <div v-if="table && S.view === 'chart'" class="lab-canvas">
        <NuclideChart ref="chart" :table="table" :scheme="S.scheme" :selected="S.nuclide" @select="id => select(id)" />
      </div>

      <div v-if="table && S.view === 'chain'" class="chain-stage" data-ui="chain-view">
        <div v-if="chainError" class="nstate small" role="alert" data-ui="chain-error">{{ chainError }}</div>
        <template v-if="layout && view">
          <div class="chain-dia"><ChainDiagram :layout="layout" :selected="S.nuclide" :dark="dark" @pick="id => select(id)" /></div>
          <div class="chain-plot">
            <LabChart :series="view.curves" :x-label="view.xLabel" :y-label="view.yLabel" :y-range="view.yRange" :cursor="cursorX" :height="280" />
            <label class="chain-cursor small">
              <span>{{ tl('读数时刻') }}</span>
              <input v-model.number="cursor" type="range" min="0" :max="SAMPLES - 1" step="1" data-ui="chain-cursor" :aria-label="tl('读数时刻')" :aria-valuetext="cursorTime" />
              <b class="num" data-ui="chain-cursor-time">t = {{ cursorTime }}</b>
            </label>
          </div>
        </template>
      </div>
    </div>

    <aside class="lab-side">
      <template v-if="S.view === 'chart'">
        <NuclidePanel v-if="page" :page="page" @open="openPage" @chain="openChain" />
        <p v-else-if="table" class="small sub">{{ tl('在图上点一个核素，或在上面搜索。') }}</p>
      </template>
      <template v-else>
        <section v-if="parentRecord" class="lab-block">
          <div class="chain-head">
            <span class="chain-sym num">{{ nuclideLabel(parentRecord.id) }}</span>
            <span class="small sub num">T½ = {{ halfLifeText(parentRecord.halfLife) }}</span>
            <button class="btn ghost small" data-ui="chain-open-page" @click="openPage(parentRecord.id)">{{ tl('核素页') }}</button>
          </div>
          <div class="lab-fields">
            <label>{{ tl('初始的量') }}</label>
            <div class="amount"><NumField :model-value="S.amount" :min="0" @update:model-value="v => (S.amount = v)" /><select v-model="S.unit" class="field small" data-ui="chain-unit" :aria-label="tl('单位')"><option value="mol">mol</option><option value="g">g</option><option value="Bq">Bq</option><option value="N">{{ tl('个') }}</option></select></div>
          </div>
        </section>
        <section v-if="rows.length" class="lab-block">
          <div class="lab-btitle">{{ tl('t = {0} 时', [cursorTime]) }}</div>
          <table class="ctable small" data-ui="chain-table">
            <thead><tr><th>{{ tl('核素') }}</th><th class="r">{{ tl('核数 N') }}</th><th class="r">{{ tl('活度 A') }}</th></tr></thead>
            <tbody>
              <tr v-for="r in rows" :key="r.id" :class="{ on: r.id === S.nuclide }" :data-nuclide="r.id">
                <td><span class="dot" :style="r.color ? { background: r.color } : undefined" /><button class="nlink" :title="r.life" @click="openPage(r.id)">{{ r.label }}</button></td>
                <td class="r num">{{ r.N }}</td>
                <td class="r num">{{ r.A }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="view" class="tiny sub note" data-ui="chain-method">{{ view.method }}</p>
        </section>
        <section v-if="diagnostics.length || (layout && layout.untracked.length)" class="lab-block" data-ui="chain-diagnostics">
          <div class="lab-btitle">{{ tl('模型的说明') }}</div>
          <p v-for="d in diagnostics" :key="d.text" class="tiny note" :class="d.severity" :data-code="d.code"><span class="badge" :class="d.severity === 'info' ? '' : 'warn'">{{ severityText(d.severity) }}</span> {{ d.text }}</p>
          <p v-for="u in layout?.untracked ?? []" :key="u" class="tiny sub note">{{ u }}</p>
        </section>
      </template>
      <NuclearSources v-if="table" :citations="table.citations" :licence="table.licence" :counts="table.counts" />
    </aside>
  </div>
</template>

<style scoped>
.nuc .lab-bar { position: relative; }
.nsearch { position: relative; flex: 0 1 240px; min-width: 150px; }
.nsearch-box { display: flex; align-items: center; gap: var(--space-1); color: var(--text-2); }
.nsearch-box .field { flex: 1; min-width: 0; }
.nhits { position: absolute; left: 0; top: calc(100% + 4px); z-index: 20; margin: 0; padding: var(--space-1); list-style: none; min-width: 100%; width: max-content; max-width: 320px; background: var(--pane); border-radius: var(--radius-float); box-shadow: var(--elev-3); }
.nhits button { display: block; width: 100%; text-align: left; border: 0; background: none; color: var(--text); padding: var(--space-1) var(--space-2); border-radius: var(--radius-row); cursor: pointer; font: inherit; font-size: var(--type-small); min-height: var(--control-sm); }
.nhits button:hover { background: var(--accent-soft); color: var(--accent-strong); }
.nhits .empty { padding: var(--space-1) var(--space-2); color: var(--text-2); }
.nstate { padding: var(--space-3); color: var(--text-2); }
.nstate[role='alert'] { color: var(--danger); }
.chain-stage { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; background: var(--canvas-bg); }
.chain-dia { flex: 0 1 auto; max-height: 52%; display: flex; min-height: 120px; overflow: auto; border-bottom: 1px solid var(--separator); }
.chain-plot { padding: var(--space-2) var(--space-3); }
.chain-cursor { display: flex; align-items: center; gap: var(--space-2); color: var(--text-2); padding: var(--space-1) 0; }
.chain-cursor input { flex: 1; min-width: 0; }
.chain-cursor b { color: var(--text); white-space: nowrap; }
.sub { color: var(--text-2); }
.chain-head { display: flex; align-items: baseline; gap: var(--space-2); margin-bottom: var(--space-2); }
.chain-head .btn { margin-left: auto; }
.chain-sym { font-size: var(--type-display); font-weight: var(--weight-title); }
.amount { display: flex; gap: var(--space-1); }
.amount .field { flex: 0 0 auto; }
.ctable { width: 100%; border-collapse: collapse; }
.ctable th { text-align: left; font-weight: var(--weight-medium); color: var(--text-2); padding: 2px var(--space-1); border-bottom: 1px solid var(--separator); }
.ctable td { padding: 2px var(--space-1); border-bottom: 1px solid var(--separator); }
.ctable .r { text-align: right; white-space: nowrap; }
.ctable tr.on td { background: var(--accent-soft); }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: var(--radius-round); margin-right: var(--space-1); background: var(--tick-minor); }
.nlink { border: 0; background: none; padding: 0; font: inherit; color: var(--accent); cursor: pointer; }
.nlink:hover { text-decoration: underline; }
.note { margin: var(--space-1) 0 0; line-height: var(--line-body); }
.note.unmodelled, .note.approx { color: var(--text); }
@media (max-width: 760px) { .nuc.lab-shell { grid-template-rows: minmax(520px, auto) auto; } .nsearch { flex-basis: 100%; } .chain-dia { max-height: 240px; } }
</style>
