<script lang="ts">
/** Encyclopedias on screen (the chemistry panel's and the library's are two mounts of one state). */
let onScreen = 0
</script>

<script setup lang="ts">
/**
 * 元素与物质 — the encyclopedia (26.64, D271): the periodic table, element pages and substance pages behind one
 * search. It is mounted twice — over the bench of the chemistry panel (`closable`: a button leads back to the bench)
 * and as the library's section 元素与物质 — and both mounts show the same place (src/chem/ency/route.ts), which is
 * also what the address names (`#e=Cu`, `#m=ethanol`) while one of them is on screen.
 *
 * The pages are content: solid ground, no glass (design system §5). Data are fetched on the first visit.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { tl } from '../../../../i18n'
import { activeLang } from '../../../../i18n/locale'
import { addUiTestHook } from '../../../uitest'
import { search, searchItems } from '../../../../chem/ency/model'
import type { SearchItem } from '../../../../chem/ency/model'
import { ency, encyBack, openElement, openSubstance, openTable, syncEncyHash } from '../../../../chem/ency/route'
import { encyData, encyError, loadEncy, nuclides } from '../../../../chem/ency/store'
import Icon from '../../Icon.vue'
import EmptyState from '../../EmptyState.vue'
import ScopeTrace from '../../decor/ScopeTrace.vue'
import PeriodicTable from './PeriodicTable.vue'
import ElementPage from './ElementPage.vue'
import SubstancePage from './SubstancePage.vue'

const props = withDefaults(defineProps<{ active?: boolean; closable?: boolean }>(), { active: true, closable: false })
const emit = defineEmits<{ close: [] }>()

const query = ref('')
const focused = ref(false)
const cursor = ref(0)
const scroller = ref<HTMLElement | null>(null)
const input = ref<HTMLInputElement | null>(null)

const element = computed(() => (ency.view.kind === 'element' ? encyData.value?.bySymbol.get(ency.view.symbol) ?? null : null))
const substance = computed(() => (ency.view.kind === 'substance' ? encyData.value?.byId.get(ency.view.id) ?? null : null))
const unknown = computed(() => !!encyData.value && ((ency.view.kind === 'element' && !element.value) || (ency.view.kind === 'substance' && !substance.value)))

const items = computed(() => { void activeLang(); const d = encyData.value; return d ? searchItems(d.elements.elements, d.substances) : [] })
const results = computed(() => search(items.value, query.value, 12))
watch(results, () => { cursor.value = 0 })

function go(item: SearchItem) {
  if (item.kind === 'element') openElement(item.id); else openSubstance(item.id)
  query.value = ''
  input.value?.blur()
}
function keys(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') { cursor.value = Math.min(results.value.length - 1, cursor.value + 1); e.preventDefault() }
  else if (e.key === 'ArrowUp') { cursor.value = Math.max(0, cursor.value - 1); e.preventDefault() }
  else if (e.key === 'Enter') { const r = results.value[cursor.value]; if (r) go(r) }
  else if (e.key === 'Escape' && query.value) { query.value = ''; e.stopPropagation() }
}

const title = computed(() => {
  if (ency.view.kind === 'element') return element.value ? `${element.value.symbol} ${element.value.name[activeLang()] ?? element.value.name.zh}` : ency.view.symbol
  if (ency.view.kind === 'substance') return substance.value ? substance.value.name?.[activeLang()] ?? substance.value.formula : ency.view.id
  return ''
})

async function start() { try { await loadEncy() } catch { /* shown by encyError */ } }

// The address follows the view while an encyclopedia is on screen
let counted = false
function count(on: boolean) {
  if (on === counted) return
  counted = on
  onScreen += on ? 1 : -1
  void nextTick(() => syncEncyHash(onScreen > 0 ? ency.view : null))
}
watch(() => props.active, on => { count(on); if (on) void start() }, { immediate: true })
watch(() => ency.view, v => { if (props.active) syncEncyHash(v); scroller.value?.scrollTo({ top: 0 }) })
onMounted(() => {
  addUiTestHook('ency', { route: ency, data: () => encyData.value, nuclides: () => nuclides.value, results: () => results.value.map(r => ({ kind: r.kind, id: r.id })) })
})
onBeforeUnmount(() => count(false))
</script>

<template>
  <div class="ency" data-ui="ency" :data-view="ency.view.kind">
    <header class="ebar">
      <button v-if="ency.view.kind !== 'table'" type="button" class="btn icon ghost" :title="tl('返回')" :aria-label="tl('返回')" data-ui="ency-back" @click="encyBack"><Icon name="arrowLeft" /></button>
      <nav class="crumbs" :aria-label="tl('位置')">
        <button type="button" class="crumb" :class="{ here: ency.view.kind === 'table' }" data-ui="ency-home" @click="openTable"><Icon name="elements" />{{ tl('元素周期表') }}</button>
        <template v-if="title"><span class="sepr" aria-hidden="true">›</span><span class="crumb here">{{ title }}</span></template>
      </nav>
      <div class="search" role="search">
        <Icon name="search" class="glass" />
        <input
          ref="input" v-model="query" type="search" class="field" data-ui="ency-search" :placeholder="tl('搜索元素或物质')" :aria-label="tl('搜索元素或物质')" autocomplete="off" spellcheck="false"
          role="combobox" aria-controls="ency-results" :aria-expanded="focused && results.length > 0" @focus="focused = true" @blur="focused = false" @keydown="keys"
        />
        <ul v-if="focused && query" id="ency-results" class="results" role="listbox" data-ui="ency-results">
          <li v-for="(r, i) in results" :key="`${r.kind}:${r.id}`" role="option" :aria-selected="i === cursor" :class="{ on: i === cursor }" :data-kind="r.kind" :data-id="r.id" @mousedown.prevent="go(r)" @mouseenter="cursor = i">
            <Icon :name="r.kind === 'element' ? 'atom' : 'flask'" /><span class="rt">{{ r.title }}</span><span class="rd num">{{ r.detail }}</span>
          </li>
          <li v-if="!results.length" class="none">{{ tl('没有找到“{0}”', [query]) }}</li>
        </ul>
      </div>
      <button v-if="props.closable" type="button" class="btn" data-ui="ency-close" @click="emit('close')"><Icon name="flask" /><span class="lbl">{{ tl('实验台') }}</span></button>
    </header>

    <div ref="scroller" class="escroll">
      <div v-if="encyError" class="state"><EmptyState tone="chem" icon="alert" :title="tl('元素与物质的数据未载入')" :line="encyError"><button type="button" class="btn" @click="start">{{ tl('重试') }}</button></EmptyState></div>
      <div v-else-if="!encyData" class="state"><ScopeTrace :fill="false" :label="tl('正在取元素与物质的数据…')" /></div>
      <div v-else-if="unknown" class="state" data-ui="ency-unknown"><EmptyState tone="chem" icon="elements" :title="tl('没有这一页')" :line="tl('链接里的元素或物质不在数据里。')"><button type="button" class="btn" @click="openTable">{{ tl('元素周期表') }}</button></EmptyState></div>
      <div v-else class="inner">
        <PeriodicTable v-if="ency.view.kind === 'table'" :elements="encyData.elements.elements" @pick="openElement" />
        <ElementPage v-else-if="element" :element="element" :data="encyData" :active="props.active" />
        <SubstancePage v-else-if="substance" :entry="substance" :data="encyData" :active="props.active" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.ency { display: flex; flex-direction: column; min-width: 0; min-height: 0; height: 100%; background: var(--pane); color: var(--text); }
.ebar { flex: 0 0 auto; display: flex; align-items: center; gap: var(--space-2); min-height: var(--bar-h); padding: var(--space-1) var(--space-4); border-bottom: 1px solid var(--separator); }
.crumbs { display: flex; align-items: center; gap: var(--space-1); min-width: 0; flex: 1 1 0; }
span.crumb.here { display: block; flex: 0 1 auto; line-height: var(--control-h); }
.crumb { display: inline-flex; align-items: center; gap: 6px; min-height: var(--control-h); padding: 0 8px; border: 0; background: none; color: var(--text-2); font: inherit; border-radius: var(--radius-control); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
button.crumb { cursor: pointer; flex: 0 0 auto; }
button.crumb:hover { background: var(--hover); color: var(--text); }
.crumb.here { color: var(--text); font-weight: var(--weight-strong); }
.sepr { color: var(--text-3); }
.search { position: relative; flex: 0 1 300px; min-width: 120px; }
.search .glass { position: absolute; left: 9px; top: 50%; transform: translateY(-50%); color: var(--text-3); pointer-events: none; }
.search .field { width: 100%; padding-left: 30px; }
.results { position: absolute; right: 0; top: calc(100% + 6px); z-index: 30; width: min(420px, calc(100vw - 32px)); max-height: min(60vh, 460px); overflow: auto; margin: 0; padding: var(--space-1); list-style: none; background: var(--pane); border-radius: var(--radius-float); box-shadow: var(--elev-3); }
.results li { display: flex; align-items: center; gap: var(--space-2); min-height: var(--menu-row); padding: 4px 10px; border-radius: var(--radius-control); cursor: pointer; color: var(--text); }
.results li.on { background: var(--accent-soft); color: var(--accent-strong); }
.results li .icon { flex: 0 0 auto; color: var(--text-2); }
.rt { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rd { flex: 0 1 auto; max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-2); font-size: var(--type-small); }
.results .none { cursor: default; color: var(--text-2); }
.escroll { flex: 1 1 auto; min-height: 0; overflow: auto; overscroll-behavior: contain; }
.inner { max-width: 1240px; margin: 0 auto; padding: var(--space-5) var(--space-6) var(--space-12); }
.state { height: 100%; min-height: 320px; display: grid; place-items: center; }
@media (max-width: 760px) {
  .ebar { flex-wrap: wrap; padding: var(--space-1) var(--space-3); }
  .search { flex: 1 1 100%; order: 3; }
  .results { left: 0; right: auto; }
  .inner { padding: var(--space-4) var(--space-4) var(--space-10); }
  .ebar .lbl { display: none; }
}
@media (pointer: coarse) { .results li { min-height: var(--touch-min); } }
</style>
