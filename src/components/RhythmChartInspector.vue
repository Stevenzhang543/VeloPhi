<!-- 26.46 节奏谱面组件检查器：谱面与歌曲、判定窗口、按键、显示与配色；运行时显示状态与分数。 -->
<template>
  <UiPropertySection :title="t('rhythmChart2D')" v-if="chart">
    <template #actions><span class="rhythm-status" :data-rhythm-state="chart.state">{{ statusText }}</span></template>
    <UiPropertyRow :label="t('rhythmChartAsset')">
      <div class="rhythm-asset-row">
        <select v-model="chart.chartAsset" data-rhythm-chart-select><option :value="null">{{ t('none') }}</option><option v-for="asset in chartAssets" :key="asset.uuid" :value="assetReference(asset.uuid)">{{ asset.name }}</option></select>
        <UiButton icon="add" :label="t('rhythmNewChart')" @click="createChart" />
        <UiButton icon="edit" :label="t('rhythmEditChart')" :disabled="!chart.chartAsset" @click="openEditor" data-rhythm-edit-chart />
      </div>
    </UiPropertyRow>
    <UiPropertyRow :label="t('rhythmSong')"><select v-model="chart.audioAsset"><option :value="null">{{ t('rhythmChartSong') }}</option><option v-for="asset in audioAssets" :key="asset.uuid" :value="assetReference(asset.uuid)">{{ asset.name }}</option></select></UiPropertyRow>
    <UiPropertyRow :label="t('rhythmPlayOnStart')"><input v-model="chart.playOnStart" type="checkbox"></UiPropertyRow>
    <UiPropertyRow :label="t('rhythmAutoplay')"><input v-model="chart.botPlay" type="checkbox"></UiPropertyRow>
    <UiPropertyRow :label="t('rhythmLeadIn')"><NumericExpressionInput v-model="chart.leadInSeconds" :minimum="0" :maximum="10" :step="0.5" :resource-key="key('leadIn')" /></UiPropertyRow>
    <UiPropertyRow :label="t('rhythmOffset')"><NumericExpressionInput v-model="chart.offsetMs" :minimum="-1000" :maximum="1000" :step="1" :resource-key="key('offset')" /></UiPropertyRow>
    <UiPropertyRow :label="t('rhythmScrollSpeed')"><NumericExpressionInput v-model="chart.scrollSpeed" :minimum="0.5" :maximum="100" :step="0.5" :resource-key="key('scroll')" /></UiPropertyRow>
    <UiPropertyRow :label="t('rhythmUnitScale')"><NumericExpressionInput v-model="chart.unitScale" :minimum="0.05" :maximum="20" :step="0.05" :resource-key="key('unit')" /></UiPropertyRow>
    <UiPropertyRow :label="t('rhythmLaneWidth')"><NumericExpressionInput v-model="chart.laneWidth" :minimum="0.2" :maximum="10" :step="0.1" :resource-key="key('laneWidth')" /></UiPropertyRow>
    <UiPropertyRow :label="t('rhythmJudgeY')"><NumericExpressionInput v-model="chart.judgeY" :minimum="-50" :maximum="50" :step="0.1" :resource-key="key('judgeY')" /></UiPropertyRow>
    <UiPropertyRow :label="t('rhythmLaneKeys')"><input v-model.lazy="chart.laneKeys" :placeholder="t('rhythmLaneKeysHint')" spellcheck="false"></UiPropertyRow>
    <details class="rhythm-group">
      <summary>{{ t('rhythmJudgementWindows') }}</summary>
      <UiPropertyRow :label="t('rhythmPerfect')"><NumericExpressionInput v-model="chart.perfectMs" :minimum="5" :maximum="chart.greatMs" :step="1" :resource-key="key('perfect')" /></UiPropertyRow>
      <UiPropertyRow :label="t('rhythmGreat')"><NumericExpressionInput v-model="chart.greatMs" :minimum="chart.perfectMs" :maximum="chart.goodMs" :step="1" :resource-key="key('great')" /></UiPropertyRow>
      <UiPropertyRow :label="t('rhythmGood')"><NumericExpressionInput v-model="chart.goodMs" :minimum="chart.greatMs" :maximum="chart.badMs" :step="1" :resource-key="key('good')" /></UiPropertyRow>
      <UiPropertyRow :label="t('rhythmBad')"><NumericExpressionInput v-model="chart.badMs" :minimum="chart.goodMs" :maximum="400" :step="1" :resource-key="key('bad')" /></UiPropertyRow>
      <UiPropertyRow :label="t('rhythmHitWidth')"><NumericExpressionInput v-model="chart.hitWidth" :minimum="0.1" :maximum="10" :step="0.1" :resource-key="key('hitWidth')" /></UiPropertyRow>
      <UiPropertyRow :label="t('rhythmFlickSpeed')"><NumericExpressionInput v-model="chart.flickSpeed" :minimum="1" :maximum="200" :step="1" :resource-key="key('flick')" /></UiPropertyRow>
    </details>
    <details class="rhythm-group">
      <summary>{{ t('rhythmSound') }}</summary>
      <UiPropertyRow :label="t('volume')"><NumericExpressionInput v-model="chart.volume" :minimum="0" :maximum="4" :step="0.05" :resource-key="key('volume')" /></UiPropertyRow>
      <UiPropertyRow :label="t('audioBus')"><select v-model="chart.bus"><option v-for="bus in physicsState.audioSettings.mixer.buses" :key="bus.id" :value="bus.id">{{ bus.name }}</option></select></UiPropertyRow>
      <UiPropertyRow :label="t('rhythmHitSound')"><input v-model="chart.hitSound" type="checkbox"></UiPropertyRow>
      <UiPropertyRow :label="t('rhythmHitSoundAsset')"><select v-model="chart.hitSoundAsset"><option :value="null">{{ t('rhythmBuiltInClick') }}</option><option v-for="asset in audioAssets" :key="asset.uuid" :value="assetReference(asset.uuid)">{{ asset.name }}</option></select></UiPropertyRow>
      <UiPropertyRow :label="t('rhythmHitSoundVolume')"><NumericExpressionInput v-model="chart.hitSoundVolume" :minimum="0" :maximum="4" :step="0.05" :resource-key="key('hitVolume')" /></UiPropertyRow>
    </details>
    <details class="rhythm-group">
      <summary>{{ t('rhythmDisplay') }}</summary>
      <UiPropertyRow :label="t('rhythmShowLanes')"><input v-model="chart.showLanes" type="checkbox"></UiPropertyRow>
      <UiPropertyRow :label="t('rhythmShowJudgements')"><input v-model="chart.showJudgements" type="checkbox"></UiPropertyRow>
      <UiPropertyRow :label="t('rhythmShowCombo')"><input v-model="chart.showCombo" type="checkbox"></UiPropertyRow>
      <UiPropertyRow :label="t('rhythmHitEffects')"><input v-model="chart.hitEffects" type="checkbox"></UiPropertyRow>
      <UiPropertyRow :label="t('rhythmShowErrorBar')"><input v-model="chart.showErrorBar" type="checkbox" data-rhythm-error-bar></UiPropertyRow>
      <UiPropertyRow :label="t('rhythmColors')">
        <div class="rhythm-colors">
          <label v-for="entry in colorFields" :key="entry.key" :title="t(entry.label)"><input type="color" :value="rgbHex(chart[entry.key])" @input="setColor(chart[entry.key], $event)"><span>{{ t(entry.label) }}</span></label>
        </div>
      </UiPropertyRow>
      <UiPropertyRow :label="t('sortingLayer')"><NumericExpressionInput v-model="chart.sortingLayer" :step="1" :resource-key="key('sorting')" /></UiPropertyRow>
      <UiPropertyRow :label="t('orderInLayer')"><NumericExpressionInput v-model="chart.orderInLayer" :step="1" :resource-key="key('order')" /></UiPropertyRow>
    </details>
    <p v-if="chart.lastError" class="rhythm-error" role="alert">{{ chart.lastError }}</p>
    <p v-else-if="chart.state !== 'idle'" class="rhythm-live">{{ t('rhythmLive', { score: Math.round(chart.runtimeScore).toLocaleString(), combo: chart.runtimeCombo, accuracy: (chart.runtimeAccuracy * 100).toFixed(2) }) }}</p>
  </UiPropertySection>
</template>

<script setup lang="ts">
import NumericExpressionInput from './NumericExpressionInput.vue'
import UiButton from '../ui/components/UiButton.vue'
import UiPropertySection from '../ui/components/UiPropertySection.vue'
import UiPropertyRow from '../ui/components/UiPropertyRow.vue'
import { computed } from 'vue'
import { assetReference, assetState, createTextAsset } from '../assets/AssetDatabase'
import { t } from '../i18n'
import { physicsState, pushHistory } from '../store/physics'
import { editorState } from '../store/editor'
import { newChartDocument, serializeChartDocument } from '../runtime/rhythmChartDocument'
import type { Entity } from '../world/Entity'
import type { RhythmChart2D } from '../world/components'

const props = defineProps<{ entity: Entity }>()
const chart = computed(() => props.entity.getComponent<RhythmChart2D>('RhythmChart2D'))
const chartAssets = computed(() => assetState.records.filter(asset => asset.assetType === 'chart'))
const audioAssets = computed(() => assetState.records.filter(asset => asset.assetType === 'audio'))
type ColorKey = 'noteColor' | 'holdColor' | 'dragColor' | 'flickColor' | 'lineColor' | 'laneColor'
const colorFields: Array<{ key: ColorKey; label: string }> = [
  { key: 'noteColor', label: 'rhythmTapColor' }, { key: 'holdColor', label: 'rhythmHoldColor' }, { key: 'dragColor', label: 'rhythmDragColor' },
  { key: 'flickColor', label: 'rhythmFlickColor' }, { key: 'lineColor', label: 'rhythmLineColor' }, { key: 'laneColor', label: 'rhythmLaneColor' }
]
const statusText = computed(() => {
  const value = chart.value
  if (!value) return ''
  return t(`rhythmState_${value.state}`)
})
function key(name: string): string { return `${props.entity.uuid}:${chart.value?.uuid ?? ''}:rhythm.${name}` }
function rgbHex(value: { r: number; g: number; b: number }): string { return `#${[value.r, value.g, value.b].map(channel => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0')).join('')}` }
function setColor(target: { r: number; g: number; b: number }, event: Event): void { const value = (event.target as HTMLInputElement).value; target.r = parseInt(value.slice(1, 3), 16); target.g = parseInt(value.slice(3, 5), 16); target.b = parseInt(value.slice(5, 7), 16) }
/** A new four-lane chart at 120 BPM, assigned to this component. */
function createChart(): void {
  const component = chart.value
  if (!component) return
  const record = createTextAsset(`${props.entity.name || 'Chart'}`, 'chart', serializeChartDocument(newChartDocument('lanes')))
  component.chartAsset = assetReference(record.uuid)
  pushHistory()
  openEditor()
}
function openEditor(): void {
  const component = chart.value
  if (!component?.chartAsset) return
  editorState.chartEditor = { chartAsset: component.chartAsset, entityUuid: props.entity.uuid, componentUuid: component.uuid, revision: (editorState.chartEditor?.revision ?? 0) + 1 }
  editorState.bottomPanelTab = 'chart'
  editorState.bottomPanelOpen = true
  // The timeline needs room: open the panel at least medium-tall.
  editorState.bottomPanelHeight = Math.max(editorState.bottomPanelHeight, 420)
}
</script>

<style scoped>
.rhythm-asset-row{display:flex;gap:var(--space-1);align-items:center;min-width:0}.rhythm-asset-row select{flex:1;min-width:0}
.rhythm-group{border-top:1px solid var(--border-subtle);padding-top:var(--space-1);margin-top:var(--space-1)}
.rhythm-group summary{cursor:pointer;color:var(--text-secondary);font-weight:600;padding:var(--space-1) 0}
.rhythm-colors{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--space-1)}
.rhythm-colors label{display:flex;align-items:center;gap:var(--space-1);min-width:0;color:var(--text-muted)}
.rhythm-colors span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rhythm-error{color:var(--danger, #ff6b6b);margin:var(--space-1) 0}
.rhythm-live{color:var(--text-muted);margin:var(--space-1) 0;font-variant-numeric:tabular-nums}
.rhythm-status{color:var(--text-muted)}
</style>
