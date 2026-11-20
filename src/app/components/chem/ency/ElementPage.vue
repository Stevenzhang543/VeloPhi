<script setup lang="ts">
/**
 * 元素页 — one element (26.64, D271): the property table, the electron configuration, the shapes of its orbitals and
 * its crystal structure in the 3D viewer (one viewer, one WebGL context, a switch between the two), the isotopes, the
 * emission lines and the flame colour, compounds that lead on to substance pages, and a short text. Every number is
 * the data file's or the core's; what the data lack reads “无数据” (D273).
 */
import { computed, ref, watch } from 'vue'
import { tl } from '../../../../i18n'
import { activeLang } from '../../../../i18n/locale'
import { LANGS } from '../../../../i18n/tri'
import { state } from '../../../store'
import type { ElementRecord } from '../../../../chem/data'
import { chemFlame } from '../../../../engine/chem'
import { orbitalSample } from '../../../../engine/mol'
import { elementModel, plain } from '../../../../chem/ency/model'
import { CATEGORY_COLOUR, tint } from '../../../../chem/ency/palette'
import { canOpenNuclide, hasReactorWorkshop, openElement, openNuclideRoute, openReactor, openSubstance } from '../../../../chem/ency/route'
import type { EncyData } from '../../../../chem/ency/store'
import { nuclides } from '../../../../chem/ency/store'
import Icon from '../../Icon.vue'
import Mol3D from '../Mol3D.vue'
import { orbitalName } from '../mol3dText'
import PropTable from './PropTable.vue'
import ConfigDiagram from './ConfigDiagram.vue'
import SpectrumStrip from './SpectrumStrip.vue'

const props = withDefaults(defineProps<{ element: ElementRecord; data: EncyData; active?: boolean }>(), { active: true })

const model = computed(() => elementModel(props.element, { sources: props.data.elements.sources, crystals: props.data.crystals, nuclides: nuclides.value, substances: props.data.substances }))
const others = computed(() => LANGS.filter(l => l !== activeLang()).map(l => props.element.name[l]).filter(n => n && n !== model.value.name))
const neighbours = computed(() => {
  const list = props.data.elements.elements
  const i = list.findIndex(e => e.z === props.element.z)
  return { prev: list[i - 1] ?? null, next: list[i + 1] ?? null }
})

// ---- 3D: orbitals or the crystal ----

const view3d = ref<'orbital' | 'crystal'>('orbital')
const orbital = ref({ n: 1, l: 0, m: 0 })
const structure = ref('')
watch(() => props.element.symbol, () => {
  const last = model.value.orbitals[model.value.orbitals.length - 1]
  orbital.value = last ? { n: last.n, l: last.l, m: 0 } : { n: 1, l: 0, m: 0 }
  structure.value = model.value.structures[0]?.id ?? ''
  view3d.value = 'orbital'
}, { immediate: true })
const chosen = computed(() => model.value.structures.find(s => s.id === structure.value) ?? model.value.structures[0] ?? null)
/** The orientations of the chosen subshell with the names the core gives them (2p: x, y, z). */
const orientations = computed(() => {
  const { n, l } = orbital.value
  const out: Array<{ m: number; label: string }> = []
  for (let m = -l; m <= l; m++) {
    let label = `m = ${m}`
    try { const s = orbitalSample(n, l, m, { count: 16 }); label = orbitalName(s.subshell, s.key) } catch { /* the plain label */ }
    out.push({ m, label })
  }
  return out
})
function pickOrbital(n: number, l: number) { orbital.value = { n, l, m: 0 } }

// ---- Lines and flame ----

/** The flame colour and its lines from the core; null when the element colours no flame or the chemistry data are not loaded. */
const flame = computed(() => {
  if (!props.data.catalogue) return null
  try { const r = chemFlame([props.element.symbol]); return r.rgb ? r : null } catch { return null }
})
const lines = computed(() => model.value.lines ?? (flame.value ? flame.value.lines.map(l => l.nm).sort((a, b) => a - b) : null))
const flameCss = computed(() => (flame.value?.rgb ? `rgb(${flame.value.rgb.join(' ')})` : ''))

function reactor() { if (!openReactor()) state.page = 'lab' }
</script>

<template>
  <article class="epage" data-ui="ency-element" :data-symbol="model.symbol">
    <header class="head">
      <div class="tile" :style="{ background: tint(CATEGORY_COLOUR[model.category]) }" aria-hidden="true">
        <span class="z num">{{ model.z }}</span>
        <span class="sym">{{ model.symbol }}</span>
        <span class="mass num">{{ props.element.massIsMassNumber ? `[${props.element.mass}]` : plain(props.element.mass) }}</span>
      </div>
      <div class="titles">
        <h1 class="page-title" data-ui="ency-title">{{ model.name }}</h1>
        <p class="sub">{{ [...others, model.categoryText].join(' · ') }}</p>
        <p v-if="model.gloss" class="gloss" data-ui="ency-gloss">{{ model.gloss }}</p>
        <p v-if="model.blurb" class="blurb" data-ui="ency-blurb">{{ model.blurb }}</p>
      </div>
      <nav class="step" :aria-label="tl('相邻元素')">
        <button type="button" class="btn small ghost" :disabled="!neighbours.prev" :title="neighbours.prev ? `${neighbours.prev.z} ${neighbours.prev.symbol}` : ''" :aria-label="tl('上一个元素')" data-ui="ency-prev" @click="neighbours.prev && openElement(neighbours.prev.symbol)"><Icon name="arrowLeft" /><span v-if="neighbours.prev">{{ neighbours.prev.symbol }}</span></button>
        <button type="button" class="btn small ghost" :disabled="!neighbours.next" :title="neighbours.next ? `${neighbours.next.z} ${neighbours.next.symbol}` : ''" :aria-label="tl('下一个元素')" data-ui="ency-next" @click="neighbours.next && openElement(neighbours.next.symbol)"><span v-if="neighbours.next">{{ neighbours.next.symbol }}</span><Icon name="arrowRight" /></button>
      </nav>
    </header>

    <div class="cols">
      <section class="sec" :aria-label="tl('性质')">
        <h2>{{ tl('性质') }}</h2>
        <PropTable :rows="model.rows" />
      </section>

      <div class="stack">
        <section class="sec">
          <h2>{{ tl('电子排布') }}</h2>
          <p class="config num">{{ model.configuration }}</p>
          <ConfigDiagram :levels="model.levels" />
          <p v-if="model.configurationPredicted" class="note">{{ tl('这个排布是理论预测，未经实验确认。') }}</p>
        </section>

        <section class="sec">
          <div class="sechead">
            <h2>{{ tl('三维') }}</h2>
            <div class="segmented" role="radiogroup" :aria-label="tl('三维内容')">
              <button type="button" role="radio" :aria-checked="view3d === 'orbital'" :class="{ on: view3d === 'orbital' }" data-ui="ency-3d-orbital" @click="view3d = 'orbital'">{{ tl('原子轨道') }}</button>
              <button type="button" role="radio" :aria-checked="view3d === 'crystal'" :class="{ on: view3d === 'crystal' }" data-ui="ency-3d-crystal" @click="view3d = 'crystal'">{{ tl('单质晶体') }}</button>
            </div>
          </div>
          <template v-if="view3d === 'orbital'">
            <div class="chips" role="group" :aria-label="tl('亚层')">
              <button v-for="o in model.orbitals" :key="o.label" type="button" class="chip num" :class="{ on: orbital.n === o.n && orbital.l === o.l }" :aria-pressed="orbital.n === o.n && orbital.l === o.l" :data-orbital="o.label" @click="pickOrbital(o.n, o.l)">{{ o.label }}</button>
            </div>
            <div v-if="orientations.length > 1" class="chips" role="group" :aria-label="tl('取向')">
              <button v-for="o in orientations" :key="o.m" type="button" class="chip num" :class="{ on: orbital.m === o.m }" :aria-pressed="orbital.m === o.m" @click="orbital.m = o.m">{{ o.label }}</button>
            </div>
            <div class="viewer"><Mol3D :orbital="orbital" :active="props.active" :label="`${model.symbol} ${orbital.n}${'spdf'[orbital.l]}`" /></div>
            <p class="note">{{ tl('画的是类氢轨道（单电子波函数）的形状，用来看 s、p、d、f 的样子；多电子原子里轨道的实际大小不同。') }}<template v-if="model.orbitalsBeyond"> {{ tl('查看器只算到 n = 4，更高的亚层未建模。') }}</template></p>
          </template>
          <template v-else>
            <template v-if="chosen">
              <div v-if="model.structures.length > 1" class="chips" role="group" :aria-label="tl('晶体结构')">
                <button v-for="s in model.structures" :key="s.id" type="button" class="chip" :class="{ on: chosen.id === s.id }" :aria-pressed="chosen.id === s.id" @click="structure = s.id">{{ s.label }}</button>
              </div>
              <p v-else class="config">{{ chosen.label }}</p>
              <div class="viewer"><Mol3D :key="chosen.id" :crystal="chosen.spec" :expand="[2, 2, 2]" :active="props.active" :label="`${model.name} · ${chosen.label}`" /></div>
              <p v-if="chosen.note" class="note" data-ui="ency-unmodelled">{{ chosen.note }}</p>
            </template>
            <p v-else class="nodata" data-ui="ency-no-crystal">{{ tl('无数据') }} — {{ tl('数据里没有这种单质的晶体结构。') }}</p>
          </template>
        </section>

        <section class="sec">
          <h2>{{ tl('同位素') }}</h2>
          <div class="tablewrap">
            <table class="iso" data-ui="ency-isotopes">
              <thead><tr><th scope="col">{{ tl('核素') }}</th><th scope="col">{{ tl('天然丰度') }}</th><th scope="col">{{ tl('半衰期') }}</th><th scope="col">{{ tl('主要衰变') }}</th></tr></thead>
              <tbody>
                <tr v-for="i in model.isotopes" :key="i.a" :data-route="i.route">
                  <th scope="row" class="num">
                    <button v-if="canOpenNuclide()" type="button" class="linkish" @click="openNuclideRoute(i.route)">{{ i.label }}</button>
                    <template v-else>{{ i.label }}</template>
                  </th>
                  <td class="num">{{ i.abundance ?? '—' }}</td>
                  <td class="num"><template v-if="i.halfLife !== null">{{ i.halfLife }}</template><span v-else class="nodata">{{ tl('无数据') }}</span></td>
                  <td class="num">{{ i.stable ? '—' : i.mode ?? '' }}<span v-if="!i.stable && i.mode === null" class="nodata">{{ tl('无数据') }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="note">{{ tl('列出天然存在与稳定的核素，以及其余当中半衰期最长的几种。') }}</p>
        </section>

        <section v-if="lines || flame" class="sec">
          <h2>{{ tl('发射光谱') }}</h2>
          <SpectrumStrip v-if="lines" :lines="lines" :label="model.name" />
          <p v-if="flame" class="flame" data-ui="ency-flame"><i :style="{ background: flameCss }" />{{ tl('焰色（由引擎按谱线算出）') }}</p>
        </section>

        <section v-if="model.compounds.length" class="sec">
          <h2>{{ tl('常见化合物') }}</h2>
          <div class="chips" data-ui="ency-compounds">
            <button v-for="c in model.compounds" :key="c.id" type="button" class="chip compound" :data-substance="c.id" @click="openSubstance(c.id)"><span class="num">{{ c.formula }}</span><span v-if="c.name" class="cname">{{ c.name }}</span></button>
          </div>
          <p v-if="model.compoundCount > model.compounds.length" class="note">{{ tl('数据里共有 {0} 种含这种元素的物质，这里列出 {1} 种；其余可以用搜索找到。', [model.compoundCount, model.compounds.length]) }}</p>
        </section>

        <section v-if="model.reactor" class="sec">
          <h2>{{ tl('反应堆工坊') }}</h2>
          <p class="note">{{ hasReactorWorkshop() ? tl('用铀燃料搭一个反应堆：在“物理实验 › 原子与核”。') : tl('反应堆工坊在“物理实验 › 原子与核”；这一版里它还没有接到这个入口，按钮打开物理实验面板。') }}</p>
          <button type="button" class="btn" data-ui="ency-reactor" @click="reactor"><Icon name="atom" />{{ tl('物理实验') }}</button>
        </section>
      </div>
    </div>

    <details class="sources" data-ui="ency-sources">
      <summary>{{ tl('数据来源') }}</summary>
      <ul><li v-for="s in model.sources" :key="s">{{ s }}</li></ul>
    </details>
  </article>
</template>

<style scoped>
.epage { display: flex; flex-direction: column; gap: var(--space-5); min-width: 0; }
.head { display: flex; align-items: flex-start; gap: var(--space-4); flex-wrap: wrap; }
.tile { position: relative; flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 96px; height: 104px; border-radius: var(--radius-panel); box-shadow: inset 0 0 0 1px var(--border); color: var(--text); }
.tile .z { position: absolute; left: 8px; top: 5px; font-size: var(--type-small); }
.tile .sym { font-size: var(--type-hero); font-weight: var(--weight-title); line-height: 1.05; margin-top: 8px; }
.tile .mass { font-size: var(--type-small); }
.titles { flex: 1 1 320px; min-width: 0; }
.sub { margin: 4px 0 0; color: var(--text-2); }
.gloss { margin: 4px 0 0; color: var(--text-2); font-size: var(--type-small); }
.blurb { margin: var(--space-3) 0 0; max-width: 72ch; line-height: var(--line-body); }
.step { display: flex; gap: var(--space-1); flex: 0 0 auto; }
.cols { display: grid; grid-template-columns: minmax(280px, 5fr) minmax(0, 7fr); gap: var(--space-6); align-items: start; }
.stack { display: flex; flex-direction: column; gap: var(--space-5); min-width: 0; }
.sec { min-width: 0; }
.sec h2 { margin: 0 0 var(--space-2); font-size: var(--type-subtitle); font-weight: var(--weight-title); line-height: var(--line-tight); }
.stack .sec { border-top: 1px solid var(--separator); padding-top: var(--space-4); }
.stack .sec:first-child { border-top: 0; padding-top: 0; }
.sechead { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-2); }
.sechead h2 { margin: 0; }
.config { margin: 0 0 var(--space-3); font-size: var(--type-subtitle); }
.note { margin: var(--space-2) 0 0; font-size: var(--type-small); color: var(--text-2); max-width: 72ch; line-height: var(--line-body); }
.nodata { color: var(--text-3); }
.chips { display: flex; flex-wrap: wrap; gap: var(--space-1); margin-bottom: var(--space-2); }
.viewer { height: min(420px, 62vh); min-height: 280px; border-radius: var(--radius-panel); box-shadow: var(--elev-1); overflow: hidden; }
.tablewrap { overflow-x: auto; }
.iso { border-collapse: collapse; width: 100%; font-size: var(--type-body); }
.iso th, .iso td { padding: 5px 10px 5px 0; text-align: left; border-top: 1px solid var(--separator); white-space: nowrap; font-weight: var(--weight-regular); }
.iso thead th { border-top: 0; color: var(--text-2); font-size: var(--type-small); font-weight: var(--weight-medium); }
.linkish { border: 0; background: none; padding: 0; font: inherit; color: var(--accent); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
.flame { display: flex; align-items: center; gap: var(--space-2); margin: var(--space-3) 0 0; font-size: var(--type-small); color: var(--text-2); }
.flame i { width: 44px; height: 20px; border-radius: var(--radius-row); box-shadow: inset 0 0 0 1px var(--border); }
.compound { height: auto; min-height: var(--control-sm); padding-top: 3px; padding-bottom: 3px; border-radius: var(--radius-control); text-align: left; }
.compound .cname { color: var(--text-2); font-size: var(--type-tiny); }
.sources { border-top: 1px solid var(--separator); padding-top: var(--space-3); font-size: var(--type-small); color: var(--text-2); }
.sources summary { cursor: pointer; color: var(--text-2); }
.sources ul { margin: var(--space-2) 0 0; padding-left: 1.2em; display: grid; gap: 4px; max-width: 96ch; overflow-wrap: break-word; }
@media (max-width: 900px) {
  .cols { grid-template-columns: minmax(0, 1fr); }
  .tile { width: 76px; height: 84px; }
  .tile .sym { font-size: var(--type-page); }
}
@media (pointer: coarse) { .chip, .linkish { min-height: var(--touch-min); } }
</style>
