<script setup lang="ts">
/**
 * 物理实验 — the lab page (26.54, D76; 26.64, D244: rearranged on the skeleton the three experiment panels share).
 *
 * The bar holds five controls (D243): 选择实验 (the catalogue, a popover: the experiments as a grid by domain, the
 * school level as one filter above it) · the name of the open experiment (it opens "关于本实验": summary, levels, the
 * model families it exercises) · 教学 · the inspector's switch · 更多 (export, import, reset). Entering the panel shows
 * the experiment that was open last (`settings.ui.lab`).
 *
 * The inspector has three tabs — 读数 · 器材 · 显示. The experiments keep their side column (`aside.lab-side`) where it
 * is, inside their own component; this page only says which tab is shown (`data-lab-tab` on the wrapper) and lab.css
 * shows the blocks of that tab: a block's tab is its `data-tab`, or follows from what it holds (readouts and formula
 * cards → 读数, parameter fields → 器材, switches only → 显示). A tab with no block in the open experiment is not offered.
 * The chart of nuclides and the reactor workshop (components/nuclear) keep their own column untouched.
 *
 * Every experiment computes in the Rust core (engine/labs.ts) and keeps its set-up in the browser (lab/state.ts); it
 * can be exported as a `velophi-lab` file and imported again.
 */
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import type { Component } from 'vue'
import { tl } from '../../../i18n'
import { settings } from '../../settings'
import { showToast, state } from '../../store'
import { phone } from '../../layout'
import { LAB_MODELS } from '../../../content/models/links'
import { modelById } from '../../../content/models'
import { GEOMETRY_TEXT, T3 } from '../../models/labels'
import { LABS, LAB_DOMAINS, LEVELS, LEVEL_TEXT, labInfo } from '../../lab/catalog'
import type { LabLevel } from '../../lab/catalog'
import { exportLab, importLab, resetLab } from '../../lab/state'
import { LAB_INSPECTOR, labCommand } from '../../lab/commands'
import type { LabTab } from '../../lab/commands'
import { openTextFile, saveFile } from '../../../platform/files'
import Icon from '../Icon.vue'
import StageLayout from '../StageLayout.vue'
import TeachMenu from '../TeachMenu.vue'
import CircuitLab from './CircuitLab.vue'
import FieldLab from './FieldLab.vue'
import LensLab from './LensLab.vue'
import RaysLab from './RaysLab.vue'
import HydrogenLab from './HydrogenLab.vue'
import PhotoLab from './PhotoLab.vue'
import DecayLab from './DecayLab.vue'
import HeatingLab from './HeatingLab.vue'
import MixingLab from './MixingLab.vue'
import RelativityLab from './RelativityLab.vue'
import CapacitorLab from './CapacitorLab.vue'
import MagnetLab from './MagnetLab.vue'
import WaveOpticsLab from './WaveOpticsLab.vue'
import ComptonLab from './ComptonLab.vue'
import NuclearLab from './NuclearLab.vue'
import GasLab from './GasLab.vue'
import WaveLab from './WaveLab.vue'
import QuantumLab from './QuantumLab.vue'

// 26.64 (D276, D277): the chart of nuclides and the reactor workshop load with their data on the first visit
const NuclidesLab = defineAsyncComponent(() => import('../nuclear/NuclidesLab.vue'))
const ReactorLab = defineAsyncComponent(() => import('../nuclear/ReactorLab.vue'))

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })

const VIEWS: Record<string, Component> = {
  circuit: CircuitLab, field: FieldLab, lens: LensLab, rays: RaysLab, hydrogen: HydrogenLab, photo: PhotoLab,
  decay: DecayLab, heating: HeatingLab, mixing: MixingLab, relativity: RelativityLab,
  // 26.55
  capacitor: CapacitorLab, magnet: MagnetLab, 'wave-optics': WaveOpticsLab, compton: ComptonLab, nuclear: NuclearLab, gas: GasLab, waves: WaveLab, quantum: QuantumLab,
  // 26.64
  nuclides: NuclidesLab, reactor: ReactorLab
}
const current = computed(() => {
  const info = labInfo(settings.ui.lab)
  return info && !info.planned && VIEWS[info.id] ? info : labInfo('circuit')!
})
const labModels = computed(() => (LAB_MODELS.find(([id]) => id === current.value.id)?.[1] ?? []).map(modelById).filter((m): m is NonNullable<typeof m> => !!m))
function showModel(id: string) { aboutOpen.value = false; state.modelId = id; state.showModels = true }

// ---- 选择实验: the catalogue ----

const catalogueOpen = ref(false)
const query = ref('')
/** The level filter. `settings.ui.labView` (26.55: the catalogue by topic or by level) remembers whether one is set. */
const level = ref<LabLevel | 'all'>('all')
function setLevel(lv: LabLevel | 'all') { level.value = lv; settings.ui.labView = lv === 'all' ? 'topic' : 'level' }
const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  const match = (l: typeof LABS[number]) => (level.value === 'all' || l.levels.includes(level.value)) && (!q || l.title.toLowerCase().includes(q) || l.summary.toLowerCase().includes(q))
  return LAB_DOMAINS.map(d => ({ ...d, labs: LABS.filter(l => l.domain === d.id && match(l)) })).filter(d => d.labs.length)
})
function open(id: string, close?: () => void) {
  const info = labInfo(id)
  if (!info) return
  if (info.planned) { showToast(tl('“{0}”计划在 {1} 版加入。', [info.title, info.planned])); return }
  settings.ui.lab = id
  close?.()
}

// ---- 关于本实验 ----

const aboutOpen = ref(false)
const levelsText = computed(() => current.value.levels.map(lv => LEVEL_TEXT[lv]).join(tl('、')))
function outside(e: PointerEvent) { if (aboutOpen.value && !(e.target as Element).closest('.about-anchor')) aboutOpen.value = false }
function keys(e: KeyboardEvent) { if (e.key === 'Escape' && aboutOpen.value) { aboutOpen.value = false; e.stopPropagation() } }
watch(catalogueOpen, v => { if (v) aboutOpen.value = false })

// ---- 更多: the experiment as a file ----

async function doExport() {
  const id = current.value.id
  try {
    await saveFile(exportLab(id), `${id}.velophi-lab.json`, [{ name: tl('VeloPhi 实验'), extensions: ['json'] }])
  } catch (e) { showToast((e as Error).message, true) }
}
async function doImport() {
  try {
    const f = await openTextFile([{ name: tl('VeloPhi 实验'), extensions: ['json'] }])
    if (!f) return
    const id = importLab(f.text, x => !!labInfo(x) && !labInfo(x)!.planned, k => ({ json: tl('不是有效的 JSON'), format: tl('不是 VeloPhi 实验文件（format 字段不符）'), version: tl('实验文件来自更新的版本'), lab: tl('实验文件中的实验未知') })[k])
    settings.ui.lab = id
    showToast(tl('已导入实验“{0}”', [labInfo(id)!.title]))
  } catch (e) { showToast((e as Error).message, true) }
}
function doReset() { resetLab(current.value.id) }

// commands of the global search reach the page through one request (lab/commands.ts)
watch(() => labCommand.n, () => {
  const c = labCommand.last
  labCommand.last = null
  if (!c) return
  if (c === 'catalogue') { catalogueOpen.value = true; aboutOpen.value = false }
  else if (c === 'about') { aboutOpen.value = true; catalogueOpen.value = false }
  else if (c === 'export') void doExport()
  else if (c === 'import') void doImport()
  else doReset()
}, { immediate: true })

// ---- the inspector: 读数 · 器材 · 显示 ----

/** Experiments of other work packages keep their side column as they built it. */
const UNTABBED = new Set(['nuclides', 'reactor'])
const tabbed = computed(() => !UNTABBED.has(current.value.id))
const TABS = computed<Array<{ id: LabTab; label: string }>>(() => [{ id: 'readings', label: tl('读数') }, { id: 'gear', label: tl('器材') }, { id: 'display', label: tl('显示') }])
const tab = ref<LabTab>('readings')
const sideOpen = ref(!phone.value)
const wrap = ref<HTMLElement | null>(null)
/** Which tabs have a block in the open experiment (read from what it rendered; lab.css uses the same rules). */
const has = ref<Record<LabTab, boolean>>({ readings: true, gear: true, display: false })
function tabsOf(b: Element): LabTab[] {
  const own = b.getAttribute('data-tab')
  if (own === 'all') return ['readings', 'gear', 'display']
  if (own) return own.split(' ') as LabTab[]
  const out: LabTab[] = []
  if (b.querySelector('.lab-fields')) out.push('gear')
  if (b.querySelector('.lab-kv, .lf') || b.classList.contains('lab-details')) out.push('readings')
  if (!out.length) out.push(b.querySelector('input[type=checkbox]') ? 'display' : 'readings')
  return out
}
let pending = 0
function survey() {
  pending = 0
  const side = wrap.value?.querySelector('.lab-side')
  if (!side || !tabbed.value) return
  const next: Record<LabTab, boolean> = { readings: false, gear: false, display: false }
  for (const b of side.querySelectorAll(':scope > .lab-block')) for (const t of tabsOf(b)) next[t] = true
  if (!next.readings && !next.gear && !next.display) next.readings = true
  if (next.readings !== has.value.readings || next.gear !== has.value.gear || next.display !== has.value.display) has.value = next
  if (!next[tab.value]) tab.value = next.readings ? 'readings' : next.gear ? 'gear' : 'display'
}
const later = () => { if (!pending) pending = requestAnimationFrame(survey) }
let observer: MutationObserver | null = null
onMounted(() => {
  window.addEventListener('pointerdown', outside)
  if (typeof MutationObserver !== 'undefined' && wrap.value) { observer = new MutationObserver(later); observer.observe(wrap.value, { childList: true, subtree: true }) }
  later()
})
onBeforeUnmount(() => { window.removeEventListener('pointerdown', outside); observer?.disconnect(); if (pending) cancelAnimationFrame(pending) })
watch(() => current.value.id, () => { tab.value = 'readings'; aboutOpen.value = false; void nextTick(later) })
provide(LAB_INSPECTOR, { show: (t: LabTab) => { if (sideOpen.value && tabbed.value) { tab.value = t; later() } } })
function tabKeys(e: KeyboardEvent) {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
  const list = TABS.value.filter(t => has.value[t.id])
  const i = list.findIndex(t => t.id === tab.value)
  const next = list[(i + (e.key === 'ArrowRight' ? 1 : list.length - 1)) % list.length]
  if (!next) return
  e.preventDefault()
  tab.value = next.id
  requestAnimationFrame(() => wrap.value?.querySelector<HTMLElement>(`[data-ui="lab-tab-${next.id}"]`)?.focus())
}
</script>

<template>
  <div class="lab-page" :class="{ phone }" data-ui="lab-page" @keydown="keys">
    <!-- 26.65 (D290): the catalogue button names the experiment shown ("电路 ▾" — it was "选择实验 ▾" beside a second
         button with the name); the about popover is the small ⓘ after it -->
    <StageLayout v-model:catalogue-open="catalogueOpen" panel="physics" :catalogue="{ label: current.title, icon: current.icon }">
      <template #catalogue="{ close }">
        <div class="cat-top">
          <label class="csearch"><Icon name="search" :size="14" /><input v-model="query" class="field" type="search" :placeholder="tl('搜索实验')" :aria-label="tl('搜索实验')" /></label>
          <div class="lab-seg" role="group" :aria-label="tl('学段')">
            <button type="button" data-ui="lab-level-all" :class="{ on: level === 'all' }" :aria-pressed="level === 'all'" @click="setLevel('all')">{{ tl('全部') }}</button>
            <button v-for="lv in LEVELS" :key="lv" type="button" :data-ui="`lab-level-${lv}`" :class="{ on: level === lv }" :aria-pressed="level === lv" @click="setLevel(lv)">{{ LEVEL_TEXT[lv] }}</button>
          </div>
        </div>
        <section v-for="d in shown" :key="d.id" class="cat-group">
          <h3>{{ d.title }}</h3>
          <div class="cat-grid">
            <button v-for="l in d.labs" :key="l.id" type="button" class="lab-pick" :data-ui="`lab-pick-${l.id}`" :class="{ on: current.id === l.id, planned: !!l.planned }" :aria-current="current.id === l.id ? 'true' : undefined" :title="l.summary" @click="open(l.id, close)">
              <Icon :name="l.icon" :size="24" /><span>{{ l.title }}</span>
            </button>
          </div>
        </section>
        <p v-if="!shown.length" class="small muted none">{{ tl('没有符合的实验') }}</p>
      </template>
      <template #bar>
        <div class="about-anchor">
          <button type="button" class="btn icon ghost name" data-ui="lab-about" :class="{ active: aboutOpen }" aria-haspopup="dialog" :aria-expanded="aboutOpen" :title="tl('关于本实验')" :aria-label="tl('关于本实验')" @click="aboutOpen = !aboutOpen; catalogueOpen = false"><Icon name="info" :size="16" /></button>
          <div v-if="aboutOpen" class="about glass-float enter" role="dialog" :aria-label="tl('关于本实验')">
            <h3>{{ current.title }}</h3>
            <p class="small muted">{{ levelsText }}</p>
            <p class="sum">{{ current.summary }}</p>
            <template v-if="labModels.length">
              <h4>{{ tl('本实验涉及的模型族') }}</h4>
              <div class="models">
                <button v-for="m in labModels" :key="m.id" type="button" class="mchip" :title="`${m.id} · L${m.level} · ${GEOMETRY_TEXT[m.geometry]}`" @click="showModel(m.id)">{{ T3(m.title) }}<span class="mid num">{{ m.id }} · L{{ m.level }}</span></button>
              </div>
            </template>
            <p v-if="tabbed" class="small muted">{{ tl('原理在“读数”页的末尾') }}</p>
          </div>
        </div>
        <TeachMenu align="left" />
      </template>
      <template #run>
        <span id="lab-run-extra" class="run-extra" />
        <button type="button" class="btn icon ghost" data-ui="lab-inspector" :class="{ active: sideOpen }" :aria-pressed="sideOpen" :title="tl('检查器')" :aria-label="tl('检查器')" @click="sideOpen = !sideOpen"><Icon name="sidebar" /></button>
      </template>
      <template #more>
        <button type="button" role="menuitem" data-ui="lab-export" :title="tl('器材与参数存为文件')" @click="doExport"><Icon name="export" />{{ tl('导出实验…') }}</button>
        <button type="button" role="menuitem" data-ui="lab-import" :title="tl('从文件恢复一个实验')" @click="doImport"><Icon name="open" />{{ tl('导入实验…') }}</button>
        <div class="sep" />
        <button type="button" role="menuitem" data-ui="lab-reset" :title="tl('恢复本实验的默认器材与参数')" @click="doReset"><Icon name="undo" />{{ tl('重置实验') }}</button>
      </template>

      <div ref="wrap" class="lab-wrap" :class="{ phone, tabbed }" :data-lab-tab="tabbed ? tab : undefined" :data-lab-side="sideOpen ? 'open' : 'closed'">
        <component :is="VIEWS[current.id]" :key="current.id" :active="props.active" class="lab-view" />
        <div v-if="tabbed && sideOpen" class="lab-tabs">
          <div class="tabs" role="tablist" :aria-label="tl('检查器')" @keydown="tabKeys">
            <button v-for="t in TABS" v-show="has[t.id]" :key="t.id" type="button" role="tab" :data-ui="`lab-tab-${t.id}`" :class="{ on: tab === t.id }" :aria-selected="tab === t.id" :tabindex="tab === t.id ? 0 : -1" @click="tab = t.id">{{ t.label }}</button>
          </div>
          <button v-if="phone" type="button" class="btn icon ghost" :aria-label="tl('关闭')" @click="sideOpen = false"><Icon name="close" /></button>
        </div>
      </div>
    </StageLayout>
  </div>
</template>

<style scoped>
.lab-page { display: flex; flex-direction: column; min-width: 0; min-height: 0; height: 100%; }
.lab-page > .stage-layout { flex: 1 1 auto; }
.about-anchor { position: relative; flex: 0 1 auto; min-width: 0; display: flex; align-items: center; }
.name { color: var(--text-2); }
.run-extra { display: contents; }
.about { position: absolute; left: 0; top: calc(100% + 8px); z-index: 20; width: min(380px, calc(100vw - 48px)); max-height: min(70vh, 520px); overflow: auto; padding: var(--space-3) var(--space-4) var(--space-4); border-radius: var(--radius-float); }
.about h3 { margin: 0; font-size: var(--type-subtitle); font-weight: var(--weight-title); }
.about h4 { margin: var(--space-3) 0 var(--space-1); font-size: var(--type-small); font-weight: var(--weight-strong); color: var(--text-2); }
.about p { margin: var(--space-1) 0 0; line-height: var(--line-body); }
.about .sum { margin-top: var(--space-2); }
.models { display: flex; flex-direction: column; gap: 2px; }
.mchip { display: flex; align-items: baseline; gap: var(--space-2); border: 0; border-radius: var(--radius-row); background: transparent; color: var(--text); padding: 4px 6px; margin: 0 -6px; cursor: pointer; font: inherit; font-size: var(--type-small); text-align: left; }
.mchip:hover { background: var(--accent-soft); color: var(--accent-strong); }
.mid { margin-left: auto; flex: 0 0 auto; color: var(--text-2); font-size: var(--type-tiny); }

/* the catalogue: a grid by domain, one level filter above it */
.cat-top { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; margin-bottom: var(--space-2); }
.csearch { flex: 1 1 160px; display: flex; align-items: center; gap: 4px; background: var(--fill); border-radius: var(--radius-control); padding: 0 8px; color: var(--text-2); }
.csearch .field { border: 0; background: transparent; flex: 1; min-width: 0; height: var(--control-sm); padding: 0; box-shadow: none; }
.cat-group h3 { margin: var(--space-3) 0 var(--space-1); font-size: var(--type-small); font-weight: var(--weight-strong); color: var(--text-2); }
.cat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(calc(112px * var(--zoom)), 1fr)); gap: var(--space-1); }
.lab-pick { display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 6px; min-height: calc(76px * var(--zoom)); padding: var(--space-2) 6px; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text); font: inherit; font-size: var(--type-small); line-height: var(--line-tight); text-align: center; cursor: pointer; }
.lab-pick :deep(.icon) { color: var(--text-2); flex: 0 0 auto; }
.lab-pick:hover { background: var(--hover); }
.lab-pick.on { background: var(--accent-soft); color: var(--accent); }
.lab-pick.on :deep(.icon) { color: var(--accent); }
.lab-pick.planned { color: var(--text-2); }
.none { margin: var(--space-4) 0; text-align: center; }

/* the experiment under the floating bar; its side column carries the tab strip */
.lab-wrap { position: relative; flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; padding: calc(var(--control-h) + var(--space-5)) var(--space-2) var(--space-2); --lab-side-w: calc(300px * var(--zoom)); }
.lab-view { flex: 1 1 auto; height: auto; min-height: 0; }
.lab-tabs { position: absolute; z-index: 2; top: calc(var(--control-h) + var(--space-5) + var(--space-2)); right: calc(var(--space-2) + var(--space-2)); width: calc(var(--lab-side-w) - 2 * var(--space-2)); display: flex; align-items: center; gap: var(--space-1); }
.lab-tabs .tabs { flex: 1; min-width: 0; }
@media (max-width: 1100px) { .lab-wrap { --lab-side-w: calc(260px * var(--zoom)); } }
/* Phones: the side column rises from the bottom, as the drawer of the shared skeleton does */
.lab-wrap.phone { padding-left: 0; padding-right: 0; padding-bottom: 0; padding-top: calc(var(--touch-min) + var(--space-6)); }
.lab-wrap.phone .lab-tabs { top: auto; left: var(--space-2); right: var(--space-2); width: auto; bottom: calc(56% - var(--touch-min) - var(--space-2)); z-index: 31; }
</style>

<style src="./lab.css"></style>
