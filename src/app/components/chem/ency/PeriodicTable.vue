<script setup lang="ts">
/**
 * 元素周期表 — the 118 elements in the standard 18 columns, the f block below (26.64, D271). Cells are coloured by
 * category, by the state at a temperature the slider sets, or on a scale of one property (electronegativity, atomic
 * radius, first ionisation energy, melting point, density); a block, a category of the legend or a group number
 * picks out its elements. A cell without a value for the chosen property stays uncoloured and the legend says so.
 *
 * Wide screens fit the table to the width; below 18 × 44 px it scrolls sideways inside its own frame (cells keep the
 * size of a finger), the page itself never does.
 */
import { computed, onMounted, ref } from 'vue'
import { tl } from '../../../../i18n'
import { activeLang } from '../../../../i18n/locale'
import type { ElementCategory, ElementRecord, StandardState } from '../../../../chem/data'
import type { ColourMode } from '../../../../chem/ency/model'
import { CATEGORIES, COLOUR_MODES, categoryLabel, cellOf, kelvinText, modeLabel, modeUnit, plain, scaleDomain, scaleValue, stateAt, stateLabel } from '../../../../chem/ency/model'
import { CATEGORY_COLOUR, STATE_COLOUR, ramp, tint } from '../../../../chem/ency/palette'
import { NAME_PARTS } from '../../../../chem/ency/text'
import { textSupported } from '../../../../chem/ency/glyph'

const props = defineProps<{ elements: ElementRecord[] }>()
const emit = defineEmits<{ pick: [symbol: string] }>()

const mode = ref<ColourMode>('category')
const temperature = ref(298.15)
const block = ref<'' | 's' | 'p' | 'd' | 'f'>('')
const category = ref<ElementCategory | ''>('')
const group = ref(0)
const fontsReady = ref(0)
onMounted(() => { void (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready.then(() => { fontsReady.value++ }) })

const BLOCKS = ['s', 'p', 'd', 'f'] as const
const STATES: StandardState[] = ['solid', 'liquid', 'gas']
const GROUPS = Array.from({ length: 18 }, (_x, i) => i + 1)
const domain = computed(() => scaleDomain(mode.value, props.elements))

/** The name a small cell shows: the two parts of a character the device's fonts cannot draw (text.ts). */
function cellName(e: ElementRecord): string {
  const lang = activeLang()
  void fontsReady.value
  if (lang === 'zh' && NAME_PARTS[e.symbol] && !textSupported(e.name.zh)) return NAME_PARTS[e.symbol].join('')
  return e.name[lang] ?? e.name.zh
}

const cells = computed(() => props.elements.map(e => {
  const c = cellOf(e)
  let background = ''
  let value = ''
  if (mode.value === 'category') background = tint(CATEGORY_COLOUR[e.category])
  else if (mode.value === 'state') { const s = stateAt(e, temperature.value); if (s) background = tint(STATE_COLOUR[s]); value = '' }
  else {
    const v = scaleValue(mode.value, e), d = domain.value
    if (v !== null && d) { background = ramp(d[1] > d[0] ? (v - d[0]) / (d[1] - d[0]) : 0); value = plain(v) ?? '' }
  }
  const dim = (block.value !== '' && e.block !== block.value) || (category.value !== '' && e.category !== category.value) || (group.value !== 0 && e.group !== group.value)
  const state = mode.value === 'state' ? stateLabel(stateAt(e, temperature.value)) : ''
  return { e, name: cellName(e), row: c.row + 1, col: c.col, background, value, dim, title: [`${e.z} ${e.name[activeLang()] ?? e.name.zh}`, state || (value ? `${modeLabel(mode.value)} ${value}${modeUnit(mode.value) ? ` ${modeUnit(mode.value)}` : ''}` : categoryLabel(e.category))].join(' · ') }
}))

const missing = computed(() => (mode.value === 'category' ? 0 : cells.value.filter(c => !c.background).length))
const tempText = computed(() => kelvinText(Math.round(temperature.value * 100) / 100) ?? '')
function toggleCategory(c: ElementCategory) { category.value = category.value === c ? '' : c }
function toggleGroup(g: number) { group.value = group.value === g ? 0 : g }
function clearFilter() { block.value = ''; category.value = ''; group.value = 0 }
const filtered = computed(() => block.value !== '' || category.value !== '' || group.value !== 0)
</script>

<template>
  <section class="ptable" data-ui="ency-table" :aria-label="tl('元素周期表')">
    <div class="tools">
      <label class="pick"><span>{{ tl('着色依据') }}</span>
        <select v-model="mode" class="field" data-ui="ency-colour">
          <option v-for="m in COLOUR_MODES" :key="m" :value="m">{{ modeLabel(m) }}</option>
        </select>
      </label>
      <label v-if="mode === 'state'" class="temp"><span>{{ tl('温度') }}</span>
        <input v-model.number="temperature" type="range" min="0" max="6000" step="1" data-ui="ency-temperature" :aria-valuetext="tempText" />
        <output class="num">{{ tempText }}</output>
      </label>
      <div class="segmented" role="radiogroup" :aria-label="tl('按区筛选')">
        <button type="button" role="radio" :aria-checked="block === ''" :class="{ on: block === '' }" @click="block = ''">{{ tl('全部') }}</button>
        <button v-for="b in BLOCKS" :key="b" type="button" role="radio" :aria-checked="block === b" :class="{ on: block === b }" :data-block="b" @click="block = b">{{ tl('{0} 区', [b]) }}</button>
      </div>
      <button v-if="filtered" type="button" class="btn small ghost" data-ui="ency-clear-filter" @click="clearFilter">{{ tl('清除筛选') }}</button>
    </div>

    <div class="scroll">
      <div class="grid" role="grid" :aria-label="tl('元素周期表')">
        <button v-for="g in GROUPS" :key="`g${g}`" type="button" class="ghead num" :class="{ on: group === g }" :style="{ gridColumn: g, gridRow: 1 }" :aria-pressed="group === g" :title="tl('第 {0} 族', [g])" :aria-label="tl('第 {0} 族', [g])" @click="toggleGroup(g)">{{ g }}</button>
        <span class="fmark num" :style="{ gridColumn: 3, gridRow: 7 }" aria-hidden="true">57–71</span>
        <span class="fmark num" :style="{ gridColumn: 3, gridRow: 8 }" aria-hidden="true">89–103</span>
        <button
          v-for="c in cells" :key="c.e.z" type="button" class="cell" :class="{ dim: c.dim, plain: !c.background }" :style="{ gridColumn: c.col, gridRow: c.row, background: c.background || undefined }"
          :data-symbol="c.e.symbol" :title="c.title" :aria-label="c.title" @click="emit('pick', c.e.symbol)"
        >
          <span class="z num">{{ c.e.z }}</span>
          <span class="sym">{{ c.e.symbol }}</span>
          <span class="nm">{{ c.name }}</span>
          <span v-if="c.value" class="val num">{{ c.value }}</span>
        </button>
      </div>
    </div>

    <div class="legend" data-ui="ency-legend">
      <template v-if="mode === 'category'">
        <button v-for="c in CATEGORIES" :key="c" type="button" class="key" :class="{ on: category === c }" :aria-pressed="category === c" :data-category="c" @click="toggleCategory(c)"><i :style="{ background: tint(CATEGORY_COLOUR[c]) }" />{{ categoryLabel(c) }}</button>
      </template>
      <template v-else-if="mode === 'state'">
        <span v-for="s in STATES" :key="s" class="key still"><i :style="{ background: tint(STATE_COLOUR[s]) }" />{{ stateLabel(s) }}</span>
        <span class="key still"><i class="none" />{{ tl('无数据') }}</span>
        <span class="note">{{ tl('由熔点与沸点判断，101.325 kPa') }}</span>
      </template>
      <template v-else-if="domain">
        <span class="key still num">{{ plain(domain[0]) }}</span>
        <i class="bar" :style="{ background: `linear-gradient(to right, ${ramp(0)}, ${ramp(1)})` }" />
        <span class="key still num">{{ plain(domain[1]) }}<template v-if="modeUnit(mode)"> {{ modeUnit(mode) }}</template></span>
        <span v-if="missing" class="key still"><i class="none" />{{ tl('无数据：{0} 种', [missing]) }}</span>
      </template>
    </div>
  </section>
</template>

<style scoped>
.ptable { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
.tools { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-4); }
.pick, .temp { display: inline-flex; align-items: center; gap: var(--space-2); font-size: var(--type-small); color: var(--text-2); }
.pick select { width: auto; min-width: 120px; }
.temp input { width: min(240px, 40vw); accent-color: var(--accent); }
.temp output { min-width: 13em; color: var(--text); }
.scroll { overflow-x: auto; overscroll-behavior-x: contain; padding-bottom: 2px; }
.grid { display: grid; grid-template-columns: repeat(18, minmax(38px, 1fr)); grid-template-rows: auto repeat(7, auto) var(--space-2) repeat(2, auto); gap: 2px; min-width: 720px; }
.ghead { height: 20px; border: 0; background: none; color: var(--text-3); font: inherit; font-size: var(--type-tiny); cursor: pointer; border-radius: var(--radius-row); }
.ghead:hover { color: var(--text); background: var(--hover); }
.ghead.on { color: var(--accent); background: var(--accent-soft); font-weight: var(--weight-strong); }
.fmark { display: grid; place-items: center; font-size: var(--type-tiny); color: var(--text-3); border: 1px dashed var(--tick-minor); border-radius: var(--radius-row); }
.cell { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0; min-width: 0; aspect-ratio: 1 / 1.08; padding: 2px 1px; border: 0; border-radius: var(--radius-row); box-shadow: inset 0 0 0 1px var(--border); color: var(--text); font: inherit; cursor: pointer; overflow: hidden; transition: opacity var(--dur-fast) ease; }
.cell.plain { background: var(--pane); }
.cell:hover { box-shadow: inset 0 0 0 2px var(--accent); }
.cell:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; z-index: 1; }
.cell.dim { opacity: 0.28; }
.z { position: absolute; left: 3px; top: 1px; font-size: var(--type-tiny); line-height: 1.2; }
.sym { font-size: clamp(13px, 1.25vw, 19px); font-weight: var(--weight-title); line-height: 1.15; margin-top: 7px; }
.nm { max-width: 100%; font-size: clamp(8.5px, 0.68vw, 11px); line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 1px; }
.val { font-size: var(--type-tiny); line-height: 1.2; }
.legend { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-3); font-size: var(--type-small); color: var(--text-2); }
.key { display: inline-flex; align-items: center; gap: 6px; min-height: var(--control-sm); padding: 0 8px 0 4px; border: 0; background: none; color: var(--text-2); font: inherit; font-size: var(--type-small); border-radius: var(--radius-control); cursor: pointer; }
.key.still { cursor: default; padding-left: 0; }
button.key:hover { background: var(--hover); color: var(--text); }
.key.on { background: var(--accent-soft); color: var(--accent); font-weight: var(--weight-strong); }
.key i { width: 14px; height: 14px; border-radius: var(--radius-row); box-shadow: inset 0 0 0 1px var(--border); }
.key i.none { background: var(--pane); }
.bar { width: 140px; height: 12px; border-radius: var(--radius-row); box-shadow: inset 0 0 0 1px var(--border); }
.note { color: var(--text-3); font-size: var(--type-tiny); }
@media (pointer: coarse), (max-width: 760px) {
  .grid { grid-template-columns: repeat(18, 44px); min-width: 0; width: max-content; }
  .cell { aspect-ratio: auto; height: 48px; }
  .sym { font-size: 15px; }
  .nm { font-size: var(--type-tiny); }
  .ghead { height: 28px; }
  .key { min-height: var(--touch-min); }
}
</style>
