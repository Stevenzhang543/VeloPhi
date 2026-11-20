<script setup lang="ts">
/**
 * The reagent shelf (26.64, D268): the catalogue's reagents by group, with a search. A row is the reagent's name in
 * the interface language (from the catalogue), its formula or — for a solution — its concentration as the row's one
 * tag, and its hazard marks as small icons with a tooltip. Click a row to add it to the selected vessel (or to carry
 * it to a vessel tapped next); with a mouse, drag it onto a vessel.
 */
import { computed, nextTick, onMounted, ref } from 'vue'
import { tl, activeLang } from '../../../i18n'
import { foldSearch } from '../../searchText'
import { catalogue, reagentName } from '../../../chem/catalog'
import type { Reagent } from '../../../chem/catalog'
import Icon from '../Icon.vue'
import { watchDrag } from './benchUi'

const emit = defineEmits<{ (e: 'pick', reagent: string): void; (e: 'bottle', reagent: string): void; (e: 'drag'): void }>()

const GROUPS: Record<string, () => string> = {
  acid: () => tl('酸'), base: () => tl('碱'), saltSolution: () => tl('盐溶液'), indicator: () => tl('指示剂'), solvent: () => tl('溶剂'), organic: () => tl('有机物'),
  metal: () => tl('金属'), nonmetal: () => tl('非金属'), oxide: () => tl('氧化物'), solidSalt: () => tl('固体盐'), gas: () => tl('气体')
}
const HAZARD: Record<string, { icon: string; text: () => string }> = {
  flammable: { icon: 'flame', text: () => tl('易燃') }, corrosive: { icon: 'hazCorrosive', text: () => tl('腐蚀性') }, toxic: { icon: 'hazToxic', text: () => tl('有毒') },
  oxidiser: { icon: 'hazOxidiser', text: () => tl('氧化性') }, irritant: { icon: 'alert', text: () => tl('刺激性') }, environment: { icon: 'hazEnvironment', text: () => tl('危害环境') }
}

const query = ref('')
const input = ref<HTMLInputElement | null>(null)
const reagents = computed<Reagent[]>(() => catalogue.value?.reagents ?? [])
const groups = computed(() => {
  const seen: string[] = []
  for (const r of reagents.value) { const g = r.group ?? 'other'; if (!seen.includes(g)) seen.push(g) }
  return seen
})
const group = ref('')
const shownGroup = computed(() => (groups.value.includes(group.value) ? group.value : groups.value[0] ?? ''))
const groupLabel = (g: string) => GROUPS[g]?.() ?? (g === 'other' ? tl('其他') : g)

const hay = computed(() => new Map(reagents.value.map(r => [r.id, foldSearch(`${r.name?.zh ?? ''} ${r.name?.en ?? ''} ${r.name?.de ?? ''} ${r.id} ${r.label ?? ''}`)])))
const MAX = 120
const rows = computed(() => {
  void activeLang()
  const words = query.value.trim().split(/\s+/).filter(Boolean).map(foldSearch)
  const list = words.length ? reagents.value.filter(r => words.every(w => hay.value.get(r.id)!.includes(w))) : reagents.value.filter(r => (r.group ?? 'other') === shownGroup.value)
  return list.slice(0, MAX)
})
/** A solution's label is its concentration (the row's tag); a pure substance's label is its formula. */
const isConc = (r: Reagent) => r.kind === 'solution' && !!r.label
const hazards = (r: Reagent) => (r.hazard ?? []).map(h => HAZARD[h]).filter(Boolean).slice(0, 3)

onMounted(() => { void nextTick(() => { if (!matchMedia('(pointer: coarse)').matches) input.value?.focus() }) })
function keys(e: KeyboardEvent) { if (e.key === 'Enter' && rows.value.length === 1) emit('pick', rows.value[0].id) }
</script>

<template>
  <div class="shelf" data-ui="chem-shelf">
    <div class="find"><Icon name="search" :size="15" /><input ref="input" v-model="query" class="field" type="search" :placeholder="tl('搜索药品')" :aria-label="tl('搜索药品')" data-ui="chem-shelf-search" @keydown="keys" /></div>
    <div v-if="!query.trim()" class="groups" role="tablist" :aria-label="tl('药品分组')">
      <button v-for="g in groups" :key="g" type="button" class="chip" role="tab" :class="{ on: shownGroup === g }" :aria-selected="shownGroup === g" @click="group = g">{{ groupLabel(g) }}</button>
    </div>
    <ul class="rows" role="listbox" :aria-label="tl('药品')">
      <li v-for="r in rows" :key="r.id">
        <button type="button" class="rowb" role="option" :data-reagent="r.id" @pointerdown="watchDrag($event, 'reagent', r.id, () => emit('drag'))" @click="emit('pick', r.id)">
          <span class="name">{{ reagentName(r) }}</span>
          <span v-if="!isConc(r) && r.label" class="formula">{{ r.label }}</span>
          <span class="spacer" />
          <span v-if="isConc(r)" class="badge num">{{ r.label }}</span>
          <span v-for="h in hazards(r)" :key="h.icon" class="haz" :title="h.text()" :aria-label="h.text()" role="img"><Icon :name="h.icon" :size="14" /></span>
        </button>
        <button v-if="r.kind !== 'gas'" type="button" class="put" :title="tl('瓶装放到台面上')" :aria-label="tl('瓶装放到台面上')" :data-bottle="r.id" @click="emit('bottle', r.id)"><Icon name="plus" :size="14" /></button>
      </li>
      <li v-if="!rows.length" class="empty">{{ reagents.length ? tl('没有找到药品') : tl('药品目录未载入') }}</li>
    </ul>
  </div>
</template>

<style scoped>
.shelf { display: flex; flex-direction: column; gap: var(--space-2); min-height: 0; max-height: inherit; }
.find { position: relative; display: flex; align-items: center; }
.find :deep(.icon) { position: absolute; left: 9px; color: var(--text-3); pointer-events: none; }
.find .field { width: 100%; padding-left: 30px; }
.groups { display: flex; flex-wrap: wrap; gap: 4px; }
.rows { list-style: none; margin: 0; padding: 0; overflow: auto; min-height: 120px; max-height: min(46vh, 380px); display: flex; flex-direction: column; }
.rows li { display: flex; align-items: center; gap: 2px; }
.put { flex: 0 0 auto; display: grid; place-items: center; width: var(--control-sm); height: var(--control-sm); border: 0; border-radius: var(--radius-row); background: transparent; color: var(--text-3); cursor: pointer; }
.put:hover { background: var(--accent-soft); color: var(--accent); }
.rowb { flex: 1 1 auto; min-width: 0; width: 100%; display: flex; align-items: center; gap: var(--space-2); min-height: var(--menu-row); padding: 0 8px; border: 0; border-radius: var(--radius-row); background: transparent; cursor: pointer; text-align: left; font-size: var(--type-body); }
.rowb:hover { background: var(--accent-soft); color: var(--accent-strong); }
.rowb:active { background: var(--accent-press); }
.name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.formula { flex: 0 0 auto; color: var(--text-2); font-size: var(--type-small); white-space: nowrap; }
.spacer { flex: 1 1 8px; }
.haz { flex: 0 0 auto; display: grid; place-items: center; width: 18px; height: 18px; color: var(--text-2); }
.rowb:hover .formula, .rowb:hover .haz { color: inherit; }
@media (pointer: coarse) { .rowb { min-height: var(--touch-min); } .rows { max-height: 44vh; } .put { width: var(--touch-min); height: var(--touch-min); } }
</style>
