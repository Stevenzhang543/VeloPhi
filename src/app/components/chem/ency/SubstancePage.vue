<script setup lang="ts">
/**
 * 物质页 — one molecule, ion or substance of the catalogue (26.64, D271): formula and names, molar mass, the
 * structure in the 3D viewer with the way its geometry was obtained said in words (D273: a VSEPR structure shows a
 * shape, not measured lengths), the properties and the solubility table of the catalogue, the colour of its solution
 * where the catalogue has a spectrum (computed by the core), the reagents of the shelf that are this substance
 * (“放到实验台”), and the declared reactions it takes part in, with the equations as the catalogue balances them.
 */
import { computed, ref, watch } from 'vue'
import { tl } from '../../../../i18n'
import { activeLang } from '../../../../i18n/locale'
import { LANGS } from '../../../../i18n/tri'
import { state } from '../../../store'
import { chemColour } from '../../../../engine/chem'
import { molShape } from '../../../../engine/mol'
import type { SubstanceEntry } from '../../../../chem/ency/model'
import { COLOUR_CONC, plain, substanceModel } from '../../../../chem/ency/model'
import { openElement, putOnBench } from '../../../../chem/ency/route'
import type { EncyData } from '../../../../chem/ency/store'
import Icon from '../../Icon.vue'
import Mol3D from '../Mol3D.vue'
import PropTable from './PropTable.vue'
import SolubilityChart from './SolubilityChart.vue'

const props = withDefaults(defineProps<{ entry: SubstanceEntry; data: EncyData; active?: boolean }>(), { active: true })

const model = computed(() => substanceModel(props.entry, {
  catalogue: props.data.catalogue, categories: props.data.molecules.categories, references: props.data.molecules.references, elements: props.data.elements.elements,
  molarMass: m => { try { return molShape(m).mass } catch { return null } }
}))
const others = computed(() => (model.value.names ? LANGS.filter(l => l !== activeLang()).map(l => model.value.names![l]).filter(n => n && n !== model.value.title) : []))

/** What the viewer shows: the molecule, or one of the crystals of the substance. */
const shown = ref('molecule')
watch(() => props.entry.id, () => { shown.value = model.value.molecule ? 'molecule' : model.value.crystals[0]?.id ?? '' }, { immediate: true })
const crystal = computed(() => model.value.crystals.find(c => c.id === shown.value) ?? null)
const choices = computed(() => [...(model.value.molecule ? [{ id: 'molecule', label: tl('分子') }] : []), ...model.value.crystals.map(c => ({ id: c.id, label: c.label }))])

/** The colour of the solution from the core; null without a spectrum or before the chemistry data are loaded. */
const solution = computed(() => {
  const species = model.value.colourSpecies
  if (!species || !props.data.catalogue) return null
  try { return `rgb(${chemColour(species, 1).rgb.join(' ')})` } catch { return null }
})
const solid = computed(() => (model.value.solidColour ? `rgb(${model.value.solidColour.join(' ')})` : null))

const allReactions = ref(false)
watch(() => props.entry.id, () => { allReactions.value = false })
const REACTIONS = 8
const reactions = computed(() => (allReactions.value ? model.value.reactions : model.value.reactions.slice(0, REACTIONS)))

function toBench(reagent: string) { putOnBench(reagent); state.page = 'chem' }
</script>

<template>
  <article class="spage" data-ui="ency-substance" :data-substance="model.id">
    <header class="head">
      <div class="titles">
        <p class="formula num" data-ui="ency-formula">{{ model.formula }}</p>
        <h1 class="page-title" data-ui="ency-title">{{ model.title }}</h1>
        <p class="sub">{{ [...others, model.categoryText].filter(Boolean).join(' · ') }}</p>
      </div>
      <dl class="facts">
        <div><dt>{{ tl('摩尔质量') }}</dt><dd class="num" data-ui="ency-molar-mass"><template v-if="model.molarMass">{{ model.molarMass }}</template><span v-else class="nodata">{{ tl('无数据') }}</span></dd></div>
        <div v-if="model.charge !== 0"><dt>{{ tl('电荷') }}</dt><dd class="num">{{ model.charge > 0 ? `+${model.charge}` : `−${-model.charge}` }}</dd></div>
        <div v-if="solid"><dt>{{ tl('固体颜色') }}</dt><dd><i class="swatch" :style="{ background: solid }" />{{ tl('目录中的显示色') }}</dd></div>
        <div v-if="solution"><dt>{{ tl('溶液颜色') }}</dt><dd data-ui="ency-solution-colour"><i class="swatch" :style="{ background: solution }" />{{ tl('{0} mol/L，光程 1 cm', [plain(COLOUR_CONC)]) }}</dd></div>
      </dl>
    </header>

    <div class="cols" :class="{ bare: !choices.length }">
      <section class="sec">
        <div class="sechead">
          <h2>{{ tl('三维结构') }}</h2>
          <div v-if="choices.length > 1" class="segmented" role="radiogroup" :aria-label="tl('三维内容')">
            <button v-for="c in choices" :key="c.id" type="button" role="radio" :aria-checked="shown === c.id" :class="{ on: shown === c.id }" @click="shown = c.id">{{ c.label }}</button>
          </div>
        </div>
        <template v-if="shown === 'molecule' && model.molecule">
          <div class="viewer"><Mol3D :molecule="model.molecule" :method="model.method ?? ''" :active="props.active" :label="model.title" /></div>
          <p class="note" data-ui="ency-method" :data-method="model.method">{{ model.methodText }}</p>
          <ul v-if="model.references.length" class="refs"><li v-for="r in model.references" :key="r">{{ r }}</li></ul>
        </template>
        <template v-else-if="crystal">
          <div class="viewer"><Mol3D :key="crystal.id" :crystal="crystal.spec" :expand="[2, 2, 2]" :polyhedron="true" :active="props.active" :label="crystal.label" /></div>
          <p v-if="crystal.note" class="note">{{ crystal.note }}</p>
        </template>
        <p v-else class="nodata" data-ui="ency-no-structure">{{ tl('无数据') }} — {{ tl('数据里没有这种物质的三维结构。') }}</p>
      </section>

      <div class="stack">
        <section v-for="f in model.forms" :key="f.id" class="sec" :data-form="f.id">
          <h2>{{ f.title }}</h2>
          <PropTable :rows="f.rows" />
          <template v-if="f.solubility">
            <h3>{{ tl('溶解度') }}</h3>
            <SolubilityChart :points="f.solubility" :label="f.title" />
          </template>
        </section>
        <section v-if="!model.forms.length" class="sec">
          <h2>{{ tl('性质') }}</h2>
          <p class="nodata">{{ tl('目录里没有这种物质的熔点、沸点、密度与热力学数据。') }}</p>
        </section>

        <section v-if="model.reagents.length" class="sec">
          <h2>{{ tl('放到实验台') }}</h2>
          <div class="chips" data-ui="ency-bench">
            <button v-for="r in model.reagents.slice(0, 8)" :key="r.id" type="button" class="btn small" :data-reagent="r.id" @click="toBench(r.id)"><Icon name="flask" />{{ r.text }}</button>
          </div>
          <p class="note">{{ tl('回到实验台，把这种药品加进选中的容器（没有容器时先放一个烧杯）。') }}</p>
        </section>

        <section class="sec">
          <h2>{{ tl('参与的反应') }}</h2>
          <ol v-if="reactions.length" class="reactions" data-ui="ency-reactions">
            <li v-for="r in reactions" :key="r.id" :data-reaction="r.id">
              <strong>{{ r.name }}</strong><span v-if="r.viaIons" class="tagline">{{ tl('以溶液中的离子参加') }}</span>
              <p v-if="r.equation" class="eq num">{{ r.equation }}</p>
              <p v-if="r.note" class="note">{{ r.note }}</p>
            </li>
          </ol>
          <p v-else class="nodata">{{ tl('目录里没有它参与的反应。') }}</p>
          <button v-if="model.reactions.length > REACTIONS && !allReactions" type="button" class="btn small ghost" data-ui="ency-reactions-all" @click="allReactions = true">{{ tl('显示全部 {0} 个', [model.reactions.length]) }}</button>
          <p v-if="reactions.length" class="note">{{ tl('只列出目录里声明的反应，方程式按目录的配平写出；没有列出的不等于不反应。') }}</p>
        </section>

        <section v-if="model.elements.length" class="sec">
          <h2>{{ tl('组成元素') }}</h2>
          <div class="chips">
            <button v-for="e in model.elements" :key="e.symbol" type="button" class="chip" :data-symbol="e.symbol" @click="openElement(e.symbol)"><span class="num">{{ e.symbol }}</span> {{ e.name === e.symbol ? '' : e.name }}</button>
          </div>
        </section>
      </div>
    </div>

    <details v-if="model.sources.length" class="sources" data-ui="ency-sources">
      <summary>{{ tl('数据来源') }}</summary>
      <ul><li v-for="s in model.sources" :key="s">{{ s }}</li></ul>
    </details>
  </article>
</template>

<style scoped>
.spage { display: flex; flex-direction: column; gap: var(--space-5); min-width: 0; }
.head { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--space-4) var(--space-8); }
.titles { flex: 1 1 320px; min-width: 0; }
.formula { margin: 0 0 2px; font-size: var(--type-display); color: var(--text-2); overflow-wrap: break-word; }
.sub { margin: 4px 0 0; color: var(--text-2); overflow-wrap: break-word; }
.facts { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-6); margin: 0; }
.facts dt { font-size: var(--type-tiny); color: var(--text-3); }
.facts dd { margin: 0; display: flex; align-items: center; gap: 6px; }
.swatch { display: inline-block; width: 32px; height: 16px; border-radius: var(--radius-row); box-shadow: inset 0 0 0 1px var(--border); }
.cols { display: grid; grid-template-columns: minmax(0, 7fr) minmax(280px, 5fr); gap: var(--space-6); align-items: start; }
.stack { display: flex; flex-direction: column; gap: var(--space-5); min-width: 0; }
.sec { min-width: 0; }
.sec h2 { margin: 0 0 var(--space-2); font-size: var(--type-subtitle); font-weight: var(--weight-title); line-height: var(--line-tight); overflow-wrap: break-word; }
.sec h3 { margin: var(--space-3) 0 var(--space-1); font-size: var(--type-body); font-weight: var(--weight-strong); }
.stack .sec { border-top: 1px solid var(--separator); padding-top: var(--space-4); }
.stack .sec:first-child { border-top: 0; padding-top: 0; }
.sechead { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-2); flex-wrap: wrap; }
.sechead h2 { margin: 0; }
.viewer { height: min(480px, 62vh); min-height: 300px; border-radius: var(--radius-panel); box-shadow: var(--elev-1); overflow: hidden; }
.note { margin: var(--space-2) 0 0; font-size: var(--type-small); color: var(--text-2); max-width: 72ch; line-height: var(--line-body); }
.refs { margin: var(--space-1) 0 0; padding-left: 1.2em; font-size: var(--type-tiny); color: var(--text-3); overflow-wrap: break-word; }
.nodata { color: var(--text-3); margin: 0; }
.chips { display: flex; flex-wrap: wrap; gap: var(--space-1); }
.chips .btn { height: auto; min-height: var(--control-sm); white-space: normal; text-align: left; }
.reactions { list-style: none; margin: 0 0 var(--space-2); padding: 0; display: grid; gap: var(--space-3); }
.reactions li { min-width: 0; }
.reactions strong { font-weight: var(--weight-strong); }
.tagline { margin-left: var(--space-2); font-size: var(--type-tiny); color: var(--text-3); }
.eq { margin: 2px 0 0; overflow-wrap: break-word; }
.reactions .note { margin-top: 2px; }
.sources { border-top: 1px solid var(--separator); padding-top: var(--space-3); font-size: var(--type-small); color: var(--text-2); }
.sources summary { cursor: pointer; }
.sources ul { margin: var(--space-2) 0 0; padding-left: 1.2em; display: grid; gap: 4px; max-width: 96ch; overflow-wrap: break-word; }
.cols.bare { grid-template-columns: minmax(0, 1fr); }
@media (max-width: 900px) { .cols { grid-template-columns: minmax(0, 1fr); } }
@media (pointer: coarse) { .chip { min-height: var(--touch-min); } .chips .btn { min-height: var(--touch-min); } }
</style>
