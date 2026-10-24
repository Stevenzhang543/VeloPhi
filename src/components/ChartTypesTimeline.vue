<!-- 26.47 谱面编辑器侧栏：谱面自己的音符类型（基础行为、判定窗口、分值、外观、预制体、打击音）与主时间线（轨道、事件、触发器）。 -->
<template>
  <section data-chart-note-types>
    <h3>{{ t('chartNoteTypes') }}</h3>
    <p class="chart-note">{{ t('chartNoteTypesHint') }}</p>
    <details v-for="(type, index) in doc.noteTypes" :key="index" class="chart-type" :data-chart-type="type.id">
      <summary><span class="chart-swatch" :style="{ background: type.color }" />{{ type.name || type.id }} <small>{{ t('chartBase_' + type.base) }}</small></summary>
      <div class="chart-grid">
        <label>{{ t('chartTypeId') }}<input :value="type.id" spellcheck="false" @change="renameType(type, ($event.target as HTMLInputElement).value)"></label>
        <label>{{ t('chartTypeName') }}<input :value="type.name" @change="edit(() => type.name = ($event.target as HTMLInputElement).value, false)"></label>
        <label>{{ t('chartTypeBase') }}<select :value="type.base" @change="setBase(type, ($event.target as HTMLSelectElement).value as ChartNoteBase)"><option v-for="base in CHART_NOTE_BASES" :key="base" :value="base">{{ t('chartBase_' + base) }}</option></select></label>
        <label>{{ t('chartTypeWeight') }}<input type="number" min="0" step="0.5" :value="type.weight" @change="number(value => type.weight = Math.max(0, value), $event)"></label>
        <label>{{ t('chartTypeTimeout') }}<select :value="type.timeout" @change="edit(() => type.timeout = ($event.target as HTMLSelectElement).value as 'miss' | 'perfect')"><option value="miss">{{ t('chartTimeoutMiss') }}</option><option value="perfect">{{ t('chartTimeoutPerfect') }}</option></select></label>
        <label class="chart-check"><input type="checkbox" :checked="type.combo" @change="edit(() => type.combo = ($event.target as HTMLInputElement).checked)">{{ t('chartTypeCombo') }}</label>
      </div>
      <label class="chart-check"><input type="checkbox" :checked="!!type.windows" @change="toggleWindows(type, ($event.target as HTMLInputElement).checked)">{{ t('chartTypeOwnWindows') }}</label>
      <div v-if="type.windows" class="chart-grid four">
        <label v-for="(value, slot) in type.windows" :key="slot">{{ ['Perfect', 'Great', 'Good', 'Bad'][slot] }} ±ms<input type="number" min="1" max="1000" step="1" :value="value" @change="number(next => type.windows![slot] = Math.max(1, next), $event)"></label>
      </div>
      <div class="chart-grid">
        <label>{{ t('chartTypeWidth') }}<input type="number" min="0" step="0.1" :value="type.width" @change="number(value => type.width = Math.max(0, value), $event)"></label>
        <label>{{ t('chartTypeHeight') }}<input type="number" min="0" step="0.1" :value="type.height" @change="number(value => type.height = Math.max(0, value), $event)"></label>
        <label>{{ t('chartTypeScale') }}<input type="number" min="0.05" step="0.1" :value="type.scale" @change="number(value => type.scale = Math.max(.05, value), $event, false)"></label>
        <label>{{ t('chartTypeShape') }}<select :value="type.shape" @change="edit(() => type.shape = ($event.target as HTMLSelectElement).value as ChartNoteShape, false)"><option v-for="shape in CHART_NOTE_SHAPES" :key="shape" :value="shape">{{ t('chartShape_' + shape) }}</option></select></label>
        <label>{{ t('chartTypeColor') }}<input type="color" :value="type.color" @change="edit(() => type.color = ($event.target as HTMLInputElement).value, false)"></label>
        <label>{{ t('chartTypeEffect') }}<select :value="type.effect" @change="edit(() => type.effect = ($event.target as HTMLSelectElement).value as 'burst' | 'none', false)"><option value="burst">{{ t('chartEffectBurst') }}</option><option value="none">{{ t('none') }}</option></select></label>
      </div>
      <label>{{ t('chartTypePrefab') }}<select :value="assetUuid(type.prefab)" data-chart-type-prefab @change="edit(() => type.prefab = reference(($event.target as HTMLSelectElement).value), false)"><option value="">{{ t('none') }}</option><option v-for="asset in prefabAssets" :key="asset.uuid" :value="asset.uuid">{{ asset.name }}</option></select></label>
      <div class="chart-row">
        <label>{{ t('chartTypeHitSound') }}<select :value="assetUuid(type.hitSound)" @change="edit(() => type.hitSound = reference(($event.target as HTMLSelectElement).value), false)"><option value="">{{ t('rhythmBuiltInClick') }}</option><option v-for="asset in audioAssets" :key="asset.uuid" :value="asset.uuid">{{ asset.name }}</option></select></label>
        <label>{{ t('volume') }}<input type="number" min="0" max="2" step="0.05" :value="type.hitSoundVolume" @change="number(value => type.hitSoundVolume = Math.max(0, Math.min(2, value)), $event, false)"></label>
      </div>
      <div class="chart-row">
        <span class="chart-note">{{ t('chartTypeUsed', { count: usage(type.id) }) }}</span>
        <UiButton icon="remove" :label="t('chartRemoveType')" @click="removeType(index)" />
      </div>
    </details>
    <div class="chart-row">
      <UiButton icon="add" :label="t('chartAddType')" data-chart-add-type @click="addType" />
    </div>
  </section>

  <section data-chart-timeline>
    <h3>{{ t('chartTimeline') }}</h3>
    <p class="chart-note">{{ t('chartTimelineHint') }}</p>
    <details v-for="(track, index) in doc.tracks" :key="index" class="chart-type" :data-chart-track="index">
      <summary>{{ trackLabel(track) }} <small>{{ t('chartTrackEvents', { count: track.events.length }) }}</small></summary>
      <div class="chart-row">
        <label>{{ t('chartTrackTarget') }}<select :value="track.target" @change="setTarget(track, ($event.target as HTMLSelectElement).value)"><option v-for="name in targetNames(track.target)" :key="name" :value="name">{{ targetLabel(name) }}</option></select></label>
        <label>{{ t('chartProperty') }}<select :value="track.property" @change="edit(() => track.property = ($event.target as HTMLSelectElement).value)"><option v-for="property in chartTrackProperties(track.target)" :key="property" :value="property">{{ property }}</option></select></label>
      </div>
      <table class="chart-events">
        <thead><tr><th>{{ t('chartStart') }}</th><th>{{ t('chartEnd') }}</th><th>{{ t('chartFrom') }}</th><th>{{ t('chartTo') }}</th><th>{{ t('chartEase') }}</th><th /></tr></thead>
        <tbody>
          <tr v-for="(event, row) in track.events" :key="row">
            <td><input type="number" step="0.25" :value="event.start" @change="number(value => event.start = value, $event)"></td>
            <td><input type="number" step="0.25" :value="event.end" @change="number(value => event.end = Math.max(event.start, value), $event)"></td>
            <td><input type="number" step="0.1" :value="event.from" @change="number(value => event.from = value, $event)"></td>
            <td><input type="number" step="0.1" :value="event.to" @change="number(value => event.to = value, $event)"></td>
            <td><select :value="event.ease" @change="edit(() => event.ease = ($event.target as HTMLSelectElement).value)"><option v-for="ease in CHART_EASINGS" :key="ease" :value="ease">{{ ease }}</option></select></td>
            <td><UiButton icon="remove" :label="t('remove')" @click="edit(() => track.events.splice(row, 1))" /></td>
          </tr>
        </tbody>
      </table>
      <div class="chart-row">
        <UiButton icon="add" :label="t('chartAddEvent')" data-chart-add-track-event @click="addTrackEvent(track)" />
        <UiButton icon="remove" :label="t('chartRemoveTrack')" @click="edit(() => doc.tracks.splice(index, 1))" />
      </div>
    </details>
    <div class="chart-row">
      <UiButton icon="add" :label="t('chartAddTrack')" data-chart-add-track @click="addTrack" />
    </div>
    <h4>{{ t('chartTriggers') }}</h4>
    <table v-if="doc.triggers.length" class="chart-events" data-chart-triggers>
      <thead><tr><th>{{ t('chartBeat') }}</th><th>{{ t('chartTriggerName') }}</th><th>{{ t('chartTriggerValue') }}</th><th /></tr></thead>
      <tbody>
        <tr v-for="(trigger, index) in doc.triggers" :key="index">
          <td><input type="number" step="0.25" :value="trigger.beat" @change="number(value => { trigger.beat = value; doc.triggers.sort((a, b) => a.beat - b.beat) }, $event)"></td>
          <td><input :value="trigger.name" spellcheck="false" @change="edit(() => trigger.name = ($event.target as HTMLInputElement).value.replace(/[\r\n\t]/g, ' ').trim())"></td>
          <td><input type="number" step="1" :value="trigger.value" @change="number(value => trigger.value = value, $event)"></td>
          <td><UiButton icon="remove" :label="t('remove')" @click="edit(() => doc.triggers.splice(index, 1))" /></td>
        </tr>
      </tbody>
    </table>
    <div class="chart-row">
      <UiButton icon="flag" :label="t('chartAddTrigger')" data-chart-add-trigger @click="addTrigger" />
    </div>
  </section>
</template>

<script setup lang="ts">
import UiButton from '../ui/components/UiButton.vue'
import { computed } from 'vue'
import { assetReference, assetState, resolveAsset } from '../assets/AssetDatabase'
import { t } from '../i18n'
import { physicsState } from '../store/physics'
import { CHART_BUILTIN_TYPES, CHART_EASINGS, CHART_NOTE_BASES, CHART_NOTE_SHAPES, CHART_TRACK_CAMERA, CHART_TRACK_POST, chartTrackProperties, defaultNoteType, type ChartDocument, type ChartNoteBase, type ChartNoteShape, type ChartNoteTypeDef, type ChartTrack } from '../runtime/rhythmChartDocument'

const props = defineProps<{
  doc: ChartDocument
  /** Bumped by the panel after every change (the sections re-read the document). */
  version: number
  /** Snapped beat at the editor's cursor. */
  cursorBeat: number
  /** Applies a change with undo; `structural` revalidates the chart. */
  edit: (change: () => void, structural?: boolean) => void
}>()

const prefabAssets = computed(() => assetState.records.filter(asset => asset.assetType === 'prefab' && asset.name.endsWith('.nova-prefab')))
const audioAssets = computed(() => assetState.records.filter(asset => asset.assetType === 'audio'))
const sceneNames = computed(() => { props.version; return [...new Set(physicsState.world.entities.map(entity => entity.name).filter(name => name && name !== CHART_TRACK_CAMERA && name !== CHART_TRACK_POST))].sort((a, b) => a.localeCompare(b)) })

function edit(change: () => void, structural = true): void { props.edit(change, structural) }
function number(apply: (value: number) => void, event: Event, structural = true): void {
  const value = Number((event.target as HTMLInputElement).value)
  if (Number.isFinite(value)) edit(() => apply(value), structural)
}
function assetUuid(reference: string): string { return reference ? resolveAsset(reference)?.uuid ?? '' : '' }
function reference(uuid: string): string { return uuid ? assetReference(uuid) : '' }
function usage(id: string): number { props.version; return props.doc.notes.filter(note => note.type === id).length }

function addType(): void {
  const used = new Set([...CHART_BUILTIN_TYPES, ...props.doc.noteTypes.map(type => type.id)])
  let index = props.doc.noteTypes.length + 1
  while (used.has(`type${index}`)) index++
  const hue = (props.doc.noteTypes.length * 67 + 200) % 360
  const color = hslHex(hue, .75, .62)
  edit(() => props.doc.noteTypes.push(defaultNoteType(`type${index}`, { name: `${t('chartNewType')} ${index}`, color })))
}
function hslHex(hue: number, saturation: number, lightness: number): string {
  const f = (n: number) => { const k = (n + hue / 30) % 12, a = saturation * Math.min(lightness, 1 - lightness); const value = lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(value * 255).toString(16).padStart(2, '0') }
  return `#${f(0)}${f(8)}${f(4)}`
}
/** Renames a type and every note that uses it; ids stay unique and never take a built-in name. */
function renameType(type: ChartNoteTypeDef, value: string): void {
  const id = value.trim().replace(/\s+/g, '_')
  if (!id || id === type.id || (CHART_BUILTIN_TYPES as readonly string[]).includes(id) || props.doc.noteTypes.some(other => other.id === id)) { edit(() => {}, false); return }
  const previous = type.id
  edit(() => { type.id = id; for (const note of props.doc.notes) if (note.type === previous) note.type = id })
}
function setBase(type: ChartNoteTypeDef, base: ChartNoteBase): void {
  edit(() => {
    type.base = base
    for (const note of props.doc.notes) if (note.type === type.id) { if (base === 'hold' && note.endBeat === undefined) note.endBeat = note.beat + 1; if (base !== 'hold') delete note.endBeat }
  })
}
function toggleWindows(type: ChartNoteTypeDef, on: boolean): void { edit(() => { if (on) type.windows = [45, 90, 135, 180]; else delete type.windows }) }
function removeType(index: number): void {
  const id = props.doc.noteTypes[index]?.id
  // Notes of a removed type become taps (a chart may not name a type it does not define).
  edit(() => { props.doc.noteTypes.splice(index, 1); for (const note of props.doc.notes) if (note.type === id) note.type = 'tap' })
}

function targetNames(current: string): string[] { return [...new Set([CHART_TRACK_CAMERA, CHART_TRACK_POST, ...sceneNames.value, current])] }
function targetLabel(name: string): string { return name === CHART_TRACK_CAMERA ? t('chartTargetCamera') : name === CHART_TRACK_POST ? t('chartTargetPost') : name }
function trackLabel(track: ChartTrack): string { return `${targetLabel(track.target)} · ${track.property}` }
function setTarget(track: ChartTrack, target: string): void {
  edit(() => { track.target = target; const properties = chartTrackProperties(target); if (!properties.includes(track.property)) track.property = properties[0] })
}
function addTrack(): void {
  const target = sceneNames.value[0] ?? CHART_TRACK_CAMERA
  const property = chartTrackProperties(target)[0]
  edit(() => props.doc.tracks.push({ target, property, events: [{ start: props.cursorBeat, end: props.cursorBeat + 4, from: 0, to: 1, ease: 'sine_in_out' }] }))
}
function addTrackEvent(track: ChartTrack): void {
  const last = track.events.at(-1)
  edit(() => { track.events.push({ start: props.cursorBeat, end: props.cursorBeat + 4, from: last?.to ?? 0, to: last?.to ?? 0, ease: 'sine_in_out' }); track.events.sort((a, b) => a.start - b.start) })
}
function addTrigger(): void {
  edit(() => { props.doc.triggers.push({ beat: props.cursorBeat, name: `trigger${props.doc.triggers.length + 1}`, value: 0 }); props.doc.triggers.sort((a, b) => a.beat - b.beat) })
}
</script>

<style scoped>
.chart-type{border:1px solid var(--border-subtle);border-radius:var(--radius-control, 8px);padding:var(--space-1)}
.chart-type summary{cursor:pointer;display:flex;align-items:center;gap:6px;color:var(--text-primary)}
.chart-type summary small{color:var(--text-muted)}
.chart-type > *:not(summary){margin-top:var(--space-1)}
.chart-swatch{width:12px;height:12px;border-radius:3px;display:inline-block;border:1px solid rgba(255,255,255,.3)}
.chart-note{margin:0;color:var(--text-muted);font-size:var(--type-caption, 12px)}
.chart-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--space-1)}
.chart-grid.four{grid-template-columns:repeat(4,minmax(0,1fr))}
.chart-check{display:flex !important;align-items:center;gap:4px}
.chart-check input{width:auto !important}
label{display:grid;gap:2px;color:var(--text-secondary);font-size:var(--type-caption, 12px)}
input,select{min-width:0;width:100%}
.chart-row{display:flex;gap:var(--space-1);align-items:end;flex-wrap:wrap}.chart-row label{flex:1}
.chart-events{width:100%;border-collapse:collapse;font-size:var(--type-caption, 12px)}.chart-events th{text-align:start;color:var(--text-muted);font-weight:500}.chart-events td{padding:1px}.chart-events input{width:5em}
h3,h4{margin:0;font-size:var(--type-body, 13px)}
section{display:grid;gap:var(--space-1)}
</style>
