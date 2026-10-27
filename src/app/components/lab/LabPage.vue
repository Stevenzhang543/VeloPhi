<script setup lang="ts">
/**
 * The lab page (26.54, D76): a catalogue of experiments by domain on the left (folding groups, school level of each
 * experiment, the experiments planned for 26.55 greyed out), the open experiment on the right. Every experiment
 * computes in the Rust core (engine/labs.ts) and keeps its set-up in the browser (lab/state.ts); it can be exported
 * as a `velophi-lab` file and imported again.
 */
import { computed, ref } from 'vue'
import type { Component } from 'vue'
import { tl } from '../../../i18n'
import { settings } from '../../settings'
import { showToast } from '../../store'
import { LABS, LAB_DOMAINS, LEVELS, LEVEL_TEXT, labInfo } from '../../lab/catalog'
import { exportLab, importLab, resetLab } from '../../lab/state'
import { openTextFile, saveFile } from '../../../platform/files'
import Icon from '../Icon.vue'
import Section from '../Section.vue'
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

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })

const VIEWS: Record<string, Component> = {
  circuit: CircuitLab, field: FieldLab, lens: LensLab, rays: RaysLab, hydrogen: HydrogenLab, photo: PhotoLab,
  decay: DecayLab, heating: HeatingLab, mixing: MixingLab, relativity: RelativityLab,
  // 26.55
  capacitor: CapacitorLab, magnet: MagnetLab, 'wave-optics': WaveOpticsLab, compton: ComptonLab, nuclear: NuclearLab, gas: GasLab, waves: WaveLab, quantum: QuantumLab
}
const current = computed(() => {
  const info = labInfo(settings.ui.lab)
  return info && !info.planned && VIEWS[info.id] ? info : labInfo('circuit')!
})
const query = ref('')
/** 26.55 (D96): the catalogue by topic or by school level. */
const byLevel = computed({ get: () => settings.ui.labView === 'level', set: v => { settings.ui.labView = v ? 'level' : 'topic' } })
const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  const match = (l: typeof LABS[number]) => !q || l.title.toLowerCase().includes(q) || l.summary.toLowerCase().includes(q)
  if (byLevel.value) return LEVELS.map(lv => ({ id: `lv-${lv}`, title: LEVEL_TEXT[lv], labs: LABS.filter(l => l.levels.includes(lv) && match(l)) })).filter(d => d.labs.length)
  return LAB_DOMAINS.map(d => ({ ...d, labs: LABS.filter(l => l.domain === d.id && match(l)) })).filter(d => d.labs.length)
})
function open(id: string) {
  const info = labInfo(id)
  if (!info) return
  if (info.planned) { showToast(tl('“{0}”计划在 {1} 版加入。', [info.title, info.planned])); return }
  settings.ui.lab = id
}

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
</script>

<template>
  <div class="lab-page">
    <aside class="pane catalog">
      <div class="pane-header head">
        <Icon name="flask" :size="16" /><span class="grow">{{ tl('实验室') }}</span>
        <div class="lab-seg view-seg" role="tablist" :aria-label="tl('目录视图')">
          <button :class="{ on: !byLevel }" @click="byLevel = false">{{ tl('按主题') }}</button>
          <button :class="{ on: byLevel }" @click="byLevel = true">{{ tl('按学段') }}</button>
        </div>
      </div>
      <div class="cat-search">
        <label class="csearch"><Icon name="search" :size="14" /><input v-model="query" class="field" type="search" :placeholder="tl('搜索实验')" :aria-label="tl('搜索实验')" /></label>
      </div>
      <div class="cat-list">
        <Section v-for="d in shown" :id="`lab.${d.id}`" :key="d.id" :title="d.title" :count="d.labs.filter(l => !l.planned).length">
          <button v-for="l in d.labs" :key="l.id" class="lab-item" :class="{ on: current.id === l.id, planned: !!l.planned }" :title="l.summary" @click="open(l.id)">
            <Icon :name="l.icon" :size="16" />
            <span class="grow">{{ l.title }}</span>
            <span v-if="l.planned" class="lvl planned-tag">{{ l.planned }}</span>
            <span v-for="lv in l.levels" v-else :key="lv" class="lvl" :class="lv">{{ LEVEL_TEXT[lv] }}</span>
          </button>
        </Section>
      </div>
      <div class="cat-foot">
        <button class="btn ghost small" :title="tl('把当前实验的器材与参数导出为文件')" @click="doExport"><Icon name="export" :size="14" />{{ tl('导出') }}</button>
        <button class="btn ghost small" :title="tl('从文件恢复一个实验')" @click="doImport"><Icon name="open" :size="14" />{{ tl('导入') }}</button>
        <button class="btn ghost small" :title="tl('恢复本实验的默认器材与参数')" @click="doReset"><Icon name="undo" :size="14" />{{ tl('重置') }}</button>
      </div>
    </aside>
    <main class="lab-main">
      <header class="lab-head">
        <Icon :name="current.icon" :size="18" />
        <h2>{{ current.title }}</h2>
        <span v-for="lv in current.levels" :key="lv" class="lvl" :class="lv">{{ LEVEL_TEXT[lv] }}</span>
        <span class="summary small muted">{{ current.summary }}</span>
      </header>
      <component :is="VIEWS[current.id]" :key="current.id" :active="props.active" class="lab-view" />
    </main>
  </div>
</template>

<style scoped>
.lab-page { display: grid; grid-template-columns: calc(232px * var(--zoom)) minmax(0, 1fr); gap: 0 8px; height: 100%; min-height: 0; }
.catalog { min-height: 0; display: flex; flex-direction: column; }
.head { display: flex; align-items: center; gap: 6px; font-weight: 600; }
.grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cat-search { padding: 0 10px 4px; }
.csearch { display: flex; align-items: center; gap: 4px; background: var(--fill); border-radius: 8px; padding: 0 8px; color: var(--text-2); }
.csearch .field { border: 0; background: transparent; flex: 1; min-width: 0; height: calc(26px * var(--zoom)); padding: 0; box-shadow: none; }
.cat-list { flex: 1; min-height: 0; overflow: auto; padding: 0 10px 8px; }
.view-seg button { padding: 2px 7px; font-size: 11px; }
.lab-item { display: flex; align-items: center; gap: 6px; width: 100%; border: 0; background: transparent; padding: 6px 8px; border-radius: var(--radius-row); cursor: pointer; text-align: left; color: var(--text); }
.lab-item:hover { background: var(--hover); }
.lab-item.on { background: var(--accent-soft); color: var(--accent); }
.lab-item.planned { color: var(--text-3, var(--text-2)); opacity: 0.7; }
.lvl { flex: 0 0 auto; font-size: 10px; border-radius: 999px; padding: 0 5px; background: var(--fill); color: var(--text-2); }
.lvl.j { background: color-mix(in srgb, #16a34a 16%, transparent); color: #15803d; }
.lvl.s { background: color-mix(in srgb, #2563eb 14%, transparent); color: #1d4ed8; }
.lvl.u { background: color-mix(in srgb, #9333ea 14%, transparent); color: #7e22ce; }
.planned-tag { border: 1px dashed var(--separator); background: none; }
.cat-foot { display: flex; gap: 4px; padding: 6px 10px 8px; border-top: 1px solid var(--separator); }
.cat-foot .btn { gap: 4px; flex: 1; justify-content: center; }
.lab-main { min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.lab-head { display: flex; align-items: center; gap: 8px; padding: 6px 4px 8px; min-width: 0; }
.lab-head h2 { margin: 0; font-size: var(--type-title, 16px); font-weight: 650; white-space: nowrap; }
.summary { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lab-view { flex: 1; min-height: 0; }
/* 26.55 (D96): narrow windows give the experiment more room; phones put the catalogue above it */
@media (max-width: 1100px) { .lab-page { grid-template-columns: calc(190px * var(--zoom)) minmax(0, 1fr); } }
@media (max-width: 760px) {
  .lab-page { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); gap: 6px; }
  .catalog { max-height: 34vh; }
}
</style>

<style src="./lab.css"></style>
