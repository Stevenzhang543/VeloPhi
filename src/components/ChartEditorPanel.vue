<!-- 26.46 谱面编辑器：时间轴画布（轨道或判定线）、波形、节拍网格、放置/选择/移动音符、变速与判定线事件、试听与节拍器、场景预览、从此处试玩、设备延迟校准。 -->
<template>
  <section class="chart-panel" data-chart-editor>
    <header class="chart-toolbar">
      <select :value="chartUuid" data-chart-select @change="openChart(($event.target as HTMLSelectElement).value)">
        <option value="">{{ t('chartChoose') }}</option>
        <option v-for="asset in chartAssets" :key="asset.uuid" :value="asset.uuid">{{ asset.name }}</option>
      </select>
      <template v-if="doc">
        <UiButton :icon="playing ? 'pause' : 'play'" :label="playing ? t('chartPause') : t('chartPlay')" data-chart-play @click="togglePlay" />
        <span class="chart-time" data-chart-time>{{ timeLabel }}</span>
        <select v-model.number="rate" :title="t('chartRate')"><option :value="1">1×</option><option :value=".75">0.75×</option><option :value=".5">0.5×</option></select>
        <span class="chart-divider" />
        <div class="chart-tools" role="radiogroup" :aria-label="t('chartTools')">
          <button v-for="(name, index) in CHART_TOOLS" :key="name" type="button" role="radio" :aria-checked="tool === name" :class="{ active: tool === name }" :data-chart-tool="name" :title="`${t('chartTool_' + name)} (${index + 1})`" :disabled="name === 'custom' && !doc.noteTypes.length" @click="tool = name">{{ t('chartTool_' + name) }}</button>
        </div>
        <select v-if="tool === 'custom' && doc.noteTypes.length" v-model="customType" :aria-label="t('chartNoteTypes')" data-chart-custom-type><option v-for="type in doc.noteTypes" :key="type.id" :value="type.id">{{ type.name || type.id }}</option></select>
        <label class="chart-compact">{{ t('chartSnap') }} <select v-model.number="snap" data-chart-snap><option v-for="value in CHART_SNAPS" :key="value" :value="value">1/{{ value }}</option></select></label>
        <label class="chart-compact"><input v-model="metronome" type="checkbox">{{ t('chartMetronome') }}</label>
        <label class="chart-compact"><input v-model="hitSounds" type="checkbox">{{ t('chartHitSounds') }}</label>
        <span class="chart-divider" />
        <UiButton icon="undo" :label="t('undo')" :disabled="!canUndo" @click="undo" />
        <UiButton icon="redo" :label="t('redo')" :disabled="!canRedo" @click="redo" />
        <UiButton icon="save" :label="dirty ? t('chartSave') + ' •' : t('chartSave')" :disabled="!dirty" data-chart-save @click="save" />
        <UiButton icon="play" :label="t('chartTestHere')" :disabled="!target?.componentUuid || !!problem" data-chart-test @click="testFromHere" />
        <UiButton icon="measure" :label="t('chartCalibrate')" data-chart-calibrate @click="openCalibration" />
      </template>
      <template v-else>
        <UiButton icon="add" :label="t('chartNewLanes')" @click="createChart('lanes')" />
        <UiButton icon="add" :label="t('chartNewLines')" @click="createChart('lines')" />
      </template>
    </header>

    <div v-if="!doc" class="chart-empty"><strong>{{ t('chartEditor') }}</strong><p>{{ loadError || t('chartEmpty') }}</p></div>
    <div v-else class="chart-workspace">
      <div ref="wrap" class="chart-canvas-wrap">
        <canvas ref="canvas" tabindex="0" :aria-label="t('chartEditor')" data-chart-canvas
          @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerUp" @pointercancel="pointerUp" @wheel.prevent="wheel" @keydown="keyDown" @contextmenu.prevent />
        <p v-if="problem" class="chart-problem" role="status" data-chart-problem>{{ problem }}</p>
        <p class="chart-hint">{{ t('chartHint') }}</p>
      </div>
      <aside class="chart-side" :key="version">
        <section>
          <h3>{{ t('chartMeta') }}</h3>
          <label>{{ t('chartTitle') }}<input :value="doc.meta.title" @change="setMeta('title', $event)"></label>
          <label>{{ t('chartArtist') }}<input :value="doc.meta.artist" @change="setMeta('artist', $event)"></label>
          <label>{{ t('chartCharter') }}<input :value="doc.meta.charter" @change="setMeta('charter', $event)"></label>
          <label>{{ t('chartLevel') }}<input :value="doc.meta.level" @change="setMeta('level', $event)"></label>
          <label>{{ t('chartSong') }}<select :value="songUuid" @change="setSong(($event.target as HTMLSelectElement).value)"><option value="">{{ t('none') }}</option><option v-for="asset in audioAssets" :key="asset.uuid" :value="asset.uuid">{{ asset.name }}</option></select></label>
          <label>{{ t('chartOffset') }}<input type="number" step="1" :value="doc.meta.offsetMs" @change="setNumber(value => doc!.meta.offsetMs = value, $event)"></label>
          <label v-if="doc.mode === 'lanes'">{{ t('chartLanes') }}<input type="number" min="1" max="16" step="1" :value="doc.lanes" @change="setLanes($event)"></label>
          <p class="chart-stats">{{ t('chartStats', { notes: doc.notes.length, length: chartLength.toFixed(1), nps: chartLength > 0 ? (doc.notes.length / chartLength).toFixed(2) : '0' }) }}</p>
        </section>
        <section>
          <h3>{{ t('chartTempo') }}</h3>
          <div v-for="(point, index) in doc.tempo" :key="index" class="chart-row">
            <label>{{ t('chartBeat') }}<input type="number" step="0.25" :value="point.beat" :disabled="index === 0" @change="setNumber(value => point.beat = value, $event, true)"></label>
            <label>BPM<input type="number" min="1" max="10000" step="0.01" :value="point.bpm" @change="setNumber(value => point.bpm = Math.max(1, Math.min(10000, value)), $event, true)"></label>
            <UiButton v-if="index > 0" icon="remove" :label="t('remove')" @click="edit(() => doc!.tempo.splice(index, 1), true)" />
          </div>
          <div class="chart-row">
            <UiButton icon="add" :label="t('chartAddTempo')" @click="addTempo" />
            <UiButton icon="bolt" :label="tapLabel" data-chart-tap-bpm @click="tapBpm" />
          </div>
        </section>
        <section v-if="doc.mode === 'lines'">
          <h3>{{ t('chartLines') }}</h3>
          <div class="chart-row">
            <select v-model.number="lineIndex" data-chart-line><option v-for="index in doc.lines.length" :key="index" :value="index - 1">{{ t('chartLine') }} {{ index }}</option></select>
            <UiButton icon="add" :label="t('chartAddLine')" @click="addLine" />
            <UiButton icon="remove" :label="t('chartRemoveLine')" :disabled="doc.lines.length < 2" @click="removeLine" />
          </div>
          <div class="chart-row">
            <label class="chart-compact"><input type="radio" :checked="side === 1" @change="side = 1">{{ t('chartSideAbove') }}</label>
            <label class="chart-compact"><input type="radio" :checked="side === -1" @change="side = -1">{{ t('chartSideBelow') }}</label>
          </div>
          <div v-if="line" class="chart-grid">
            <label v-for="field in lineFields" :key="field">{{ t('chartLine_' + field) }}<input type="number" step="0.1" :value="line[field]" @change="setNumber(value => line![field] = value, $event, true)"></label>
          </div>
          <h4>{{ t('chartEvents') }}</h4>
          <table v-if="line" class="chart-events">
            <thead><tr><th>{{ t('chartProperty') }}</th><th>{{ t('chartStart') }}</th><th>{{ t('chartEnd') }}</th><th>{{ t('chartFrom') }}</th><th>{{ t('chartTo') }}</th><th>{{ t('chartEase') }}</th><th /></tr></thead>
            <tbody>
              <tr v-for="row in lineEvents" :key="row.property + row.index">
                <td>{{ t('chartLine_' + row.property) }}</td>
                <td><input type="number" step="0.25" :value="row.event.start" @change="setNumber(value => row.event.start = value, $event, true)"></td>
                <td><input type="number" step="0.25" :value="row.event.end" @change="setNumber(value => row.event.end = Math.max(row.event.start, value), $event, true)"></td>
                <td><input type="number" step="0.1" :value="row.event.from" @change="setNumber(value => row.event.from = value, $event, true)"></td>
                <td><input type="number" step="0.1" :value="row.event.to" @change="setNumber(value => row.event.to = value, $event, true)"></td>
                <td><select :value="row.event.ease" @change="edit(() => row.event.ease = ($event.target as HTMLSelectElement).value, true)"><option v-for="ease in CHART_EASINGS" :key="ease" :value="ease">{{ ease }}</option></select></td>
                <td><UiButton icon="remove" :label="t('remove')" @click="edit(() => line!.events[row.property].splice(row.index, 1), true)" /></td>
              </tr>
            </tbody>
          </table>
          <div class="chart-row">
            <select v-model="newEventProperty"><option v-for="property in CHART_LINE_PROPERTIES" :key="property" :value="property">{{ t('chartLine_' + property) }}</option></select>
            <UiButton icon="add" :label="t('chartAddEvent')" data-chart-add-event @click="addEvent" />
          </div>
        </section>
        <ChartTypesTimeline :doc="doc" :version="version" :cursor-beat="cursorBeat" :edit="edit" />
        <section v-if="selection.size">
          <h3>{{ t('chartSelection', { count: selection.size }) }}</h3>
          <div class="chart-row">
            <select :value="selectionType" @change="setSelectionType(($event.target as HTMLSelectElement).value as ChartNoteType)"><option v-for="type in noteTypes" :key="type" :value="type">{{ t('chartTool_' + type) }}</option><option v-for="type in doc.noteTypes" :key="type.id" :value="type.id">{{ type.name || type.id }}</option></select>
            <UiButton icon="align" :label="t('chartMirror')" @click="mirrorSelection" />
            <UiButton icon="remove" :label="t('remove')" @click="deleteSelection" />
          </div>
        </section>
      </aside>
    </div>

    <div v-if="calibration.open" class="chart-calibration" role="dialog" :aria-label="t('chartCalibrationTitle')" data-chart-calibration tabindex="-1" @keydown.prevent.stop="calibrationTap">
      <div class="chart-calibration-card">
        <h3>{{ t('chartCalibrationTitle') }}</h3>
        <p>{{ t('chartCalibrationHint') }}</p>
        <p class="chart-calibration-beats"><span v-for="index in 16" :key="index" :class="{ done: index <= calibration.taps.length }" /></p>
        <button type="button" class="chart-tap-pad" data-chart-tap-pad :disabled="!calibration.clicks.length && !picture.flashes.length" @pointerdown.prevent="calibrationTap">{{ t('chartCalibrationTap') }}</button>
        <p v-if="calibration.result" data-chart-calibration-result>{{ t('chartCalibrationResult', { offset: calibration.result.offsetMs, spread: calibration.result.spreadMs }) }}</p>
        <p>{{ t('chartCalibrationCurrent', { offset: storedCalibration }) }}</p>
        <div class="chart-row">
          <UiButton icon="play" :label="t('chartCalibrationStart')" @click.stop="startCalibration" />
          <UiButton icon="save" :label="t('chartCalibrationSave')" :disabled="!calibration.result" @click.stop="saveCalibration" />
          <UiButton icon="close" :label="t('close')" data-chart-calibration-close @click.stop="calibration.open = false" />
        </div>
        <hr>
        <h3>{{ t('chartPictureTitle') }}</h3>
        <p>{{ t('chartPictureHint') }}</p>
        <div class="chart-flash" :class="{ lit: picture.lit }" data-chart-flash aria-hidden="true" />
        <p v-if="picture.result" data-chart-picture-result>{{ t('chartPictureResult', { offset: picture.result.offsetMs, spread: picture.result.spreadMs, suggestion: pictureSuggestion }) }}</p>
        <label class="chart-compact">{{ t('chartPictureOffset') }} <input type="number" min="-500" max="500" step="1" :value="storedVisual" data-chart-visual-offset @change="setVisualOffset(Number(($event.target as HTMLInputElement).value))" @keydown.stop></label>
        <div class="chart-row">
          <UiButton icon="play" :label="t('chartPictureStart')" data-chart-picture-start @click.stop="startPictureTest" />
          <UiButton icon="save" :label="t('chartPictureSave')" :disabled="!picture.result" @click.stop="setVisualOffset(pictureSuggestion)" />
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import UiButton from '../ui/components/UiButton.vue'
import ChartTypesTimeline from './ChartTypesTimeline.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { assetReference, assetState, createTextAsset, readTextAsset, resolveAsset, updateTextAsset } from '../assets/AssetDatabase'
import { t } from '../i18n'
import { physicsState, pushHistory } from '../store/physics'
import { playSimulation } from '../editor/runCommands'
import { editorState } from '../store/editor'
import { CHART_EASINGS, CHART_LINE_PROPERTIES, ChartTempo, chartNoteBase, defaultChartLine, newChartDocument, normalizeChartDocument, serializeChartDocument, type ChartDocument, type ChartLine, type ChartLineProperty, type ChartNote, type ChartNoteType } from '../runtime/rhythmChartDocument'
import { CHART_SNAPS, CHART_TOOLS, ChartHistory, calibrationFromTaps, chartXAtPx, copyNotes, deleteNotes, laneAtX, laneCentreX, laneWidthPx, mirrorNotes, moveNotes, noteAt, noteFromPointer, notesInRect, pasteNotes, placeNote, pxAtChartX, snapBeat, tapTempo, timeAtY, yAtTime, type ChartTool, type ChartView } from '../editor/chartEditing'
import { ChartAudio } from '../editor/chartAudio'
import { WasmRhythmSession, rhythm_validate_chart } from '../../nova_core/pkg/nova_core.js'
import { publishRhythmFrame } from '../renderer/rhythmFrames'
import { requestRhythmStart, rhythmFrameTypes, rhythmPreviewFrame, storeRhythmCalibration, storeRhythmVisualOffset, storedRhythmCalibration, storedRhythmVisualOffset } from '../runtime/rhythmOwner'
import type { RhythmChart2D } from '../world/components'

const noteTypes: ChartNoteType[] = ['tap', 'hold', 'drag', 'flick']
const lineFields = ['x', 'y', 'rotation', 'alpha', 'speed', 'length'] as const

const canvas = ref<HTMLCanvasElement | null>(null)
const wrap = ref<HTMLDivElement | null>(null)
const doc = shallowRef<ChartDocument | null>(null)
const version = ref(0)
const chartUuid = ref('')
const savedSource = ref('')
const dirty = ref(false)
const loadError = ref('')
const problem = ref('')
const tool = ref<ChartTool>('tap')
/** 26.47: the chart's own note type the 'custom' tool places. */
const customType = ref('')
const snap = ref(4)
const rate = ref(1)
const metronome = ref(false)
const hitSounds = ref(true)
const playing = ref(false)
const cursor = ref(0)
const pps = ref(260)
const lineIndex = ref(0)
const side = ref(1)
const newEventProperty = ref<ChartLineProperty>('rotation')
const selection = reactive(new Set<ChartNote>())
const history = new ChartHistory()
const canUndo = ref(false), canRedo = ref(false)
const audio = new ChartAudio()
const taps: number[] = []
const tapLabel = ref('')
const calibration = reactive({ open: false, clicks: [] as number[], taps: [] as number[], result: null as { offsetMs: number; spreadMs: number; count: number } | null })
const storedCalibration = ref(storedRhythmCalibration())
/** 26.47 picture test: flashes without sound; tapping along measures the screen's delay plus the input's. */
const picture = reactive({ flashes: [] as number[], taps: [] as number[], lit: false, result: null as { offsetMs: number; spreadMs: number; count: number } | null })
const storedVisual = ref(storedRhythmVisualOffset())
let pictureFrame = 0
/** Screen minus sound delay: the picture offset that makes notes reach the line when their sound is heard. */
const pictureSuggestion = computed(() => picture.result ? Math.max(-500, Math.min(500, picture.result.offsetMs - storedCalibration.value)) : 0)
let tempo = new ChartTempo([{ beat: 0, bpm: 120 }])
let noteTimes: number[] = []
let previewSession: WasmRhythmSession | null = null
let previewTimer: ReturnType<typeof setTimeout> | null = null
let frame = 0
let drag: { kind: 'move' | 'box' | 'hold'; startX: number; startY: number; x: number; y: number; originals: Map<ChartNote, { beat: number; endBeat?: number; lane: number; x: number }>; note?: ChartNote; recorded: boolean } | null = null

const chartAssets = computed(() => assetState.records.filter(asset => asset.assetType === 'chart'))
const audioAssets = computed(() => assetState.records.filter(asset => asset.assetType === 'audio'))
const target = computed(() => {
  const explicit = editorState.chartEditor
  if (explicit) return explicit
  const selected = physicsState.world.entities.find(entity => entity.id === physicsState.selectedEntityId)
  const component = selected?.getComponent<RhythmChart2D>('RhythmChart2D')
  return selected && component?.chartAsset ? { chartAsset: component.chartAsset, entityUuid: selected.uuid, componentUuid: component.uuid, revision: 0 } : null
})
const component = computed(() => {
  const uuid = target.value?.componentUuid
  if (!uuid) return null
  for (const entity of physicsState.world.entities) { const value = entity.getComponent<RhythmChart2D>('RhythmChart2D'); if (value?.uuid === uuid) return value }
  return null
})
const songUuid = computed(() => { version.value; const reference = doc.value?.meta.audio || component.value?.audioAsset || ''; return resolveAsset(reference)?.uuid ?? '' })
const chartLength = computed(() => { version.value; return noteTimes.length ? Math.max(...noteTimes, ...endTimes()) : 0 })
const line = computed<ChartLine | null>(() => { version.value; return doc.value?.mode === 'lines' ? doc.value.lines[lineIndex.value] ?? null : null })
const lineEvents = computed(() => { version.value; const value = line.value; return value ? CHART_LINE_PROPERTIES.flatMap(property => value.events[property].map((event, index) => ({ property, index, event }))) : [] })
const selectionType = computed(() => [...selection][0]?.type ?? 'tap')
const timeLabel = computed(() => {
  const time = cursor.value, beat = tempo.timeToBeat(time)
  const sign = time < 0 ? '-' : '', absolute = Math.abs(time), minutes = Math.floor(absolute / 60), seconds = absolute - minutes * 60
  return `${sign}${minutes}:${seconds.toFixed(2).padStart(5, '0')} · ${t('chartBeat')} ${beat.toFixed(2)} · ${tempo.bpmAt(time)} BPM`
})

function endTimes(): number[] { const value = doc.value; return (value?.notes ?? []).filter(note => note.endBeat !== undefined && chartNoteBase(value!, note.type) === 'hold').map(note => tempo.beatToTime(note.endBeat!)) }
const cursorBeat = computed(() => { version.value; return snapBeat(tempo.timeToBeat(cursor.value), snap.value) })

// ------------------------------------------------------------------ loading and saving

function openChart(uuid: string): void {
  if (!uuid) return
  const record = assetState.records.find(asset => asset.uuid === uuid)
  if (!record) return
  const selected = physicsState.world.entities.find(entity => entity.getComponent<RhythmChart2D>('RhythmChart2D')?.chartAsset === assetReference(uuid))
  const value = selected?.getComponent<RhythmChart2D>('RhythmChart2D')
  editorState.chartEditor = { chartAsset: assetReference(uuid), entityUuid: selected?.uuid ?? '', componentUuid: value?.uuid ?? '', revision: (editorState.chartEditor?.revision ?? 0) + 1 }
}

function load(): void {
  const reference = target.value?.chartAsset
  const record = reference ? resolveAsset(reference) : null
  stopPlayback()
  if (!record) { doc.value = null; chartUuid.value = ''; loadError.value = reference ? t('chartMissing') : ''; return }
  const source = readTextAsset(record.uuid) ?? ''
  try {
    doc.value = normalizeChartDocument(JSON.parse(source))
    chartUuid.value = record.uuid; savedSource.value = source; dirty.value = false; loadError.value = ''
    history.clear(); syncHistory(); selection.clear(); lineIndex.value = 0
    cursor.value = 0
    changed(false)
    void loadSong()
  } catch (error) {
    doc.value = null; chartUuid.value = record.uuid
    loadError.value = `${t('chartInvalid')}: ${error instanceof Error ? error.message : String(error)}`
  }
}

async function loadSong(): Promise<void> {
  const record = resolveAsset(doc.value?.meta.audio || component.value?.audioAsset || '')
  await audio.load(record?.source ?? null, record ? `${record.uuid}:${record.byteLength}:${record.sourceModified}` : '')
  requestDraw()
}

function save(): boolean {
  const value = doc.value
  if (!value || !chartUuid.value) return false
  const source = serializeChartDocument(value)
  if (!updateTextAsset(chartUuid.value, source)) return false
  savedSource.value = source; dirty.value = false
  pushHistory('Save chart')
  return true
}

function createChart(mode: 'lanes' | 'lines'): void {
  const record = createTextAsset(mode === 'lanes' ? 'New Lanes Chart' : 'New Lines Chart', 'chart', serializeChartDocument(newChartDocument(mode)))
  const selected = physicsState.world.entities.find(entity => entity.id === physicsState.selectedEntityId)
  const value = selected?.getComponent<RhythmChart2D>('RhythmChart2D')
  if (value) { value.chartAsset = assetReference(record.uuid); pushHistory('Assign chart') }
  editorState.chartEditor = { chartAsset: assetReference(record.uuid), entityUuid: selected?.uuid ?? '', componentUuid: value?.uuid ?? '', revision: (editorState.chartEditor?.revision ?? 0) + 1 }
}

// ------------------------------------------------------------------ edits

/** Applies an edit with undo; `structural` rebuilds the tempo map and validation. */
function edit(change: () => void, structural = true): void {
  const value = doc.value
  if (!value) return
  history.record(serializeChartDocument(value))
  change()
  syncHistory()
  changed(structural)
}

function changed(markDirty = true): void {
  const value = doc.value
  if (!value) return
  tempo = new ChartTempo(value.tempo)
  noteTimes = value.notes.map(note => tempo.beatToTime(note.beat)).sort((a, b) => a - b)
  for (const note of [...selection]) if (!value.notes.includes(note)) selection.delete(note)
  if (markDirty) dirty.value = true
  version.value++
  schedulePreview()
  requestDraw()
}

function syncHistory(): void { canUndo.value = history.canUndo; canRedo.value = history.canRedo }
function restore(source: string | null): void {
  if (source === null) return
  doc.value = normalizeChartDocument(JSON.parse(source))
  selection.clear(); syncHistory(); changed(true)
}
function undo(): void { if (doc.value) restore(history.undo(serializeChartDocument(doc.value))) }
function redo(): void { if (doc.value) restore(history.redo(serializeChartDocument(doc.value))) }

function setMeta(key: 'title' | 'artist' | 'charter' | 'level', event: Event): void { const value = (event.target as HTMLInputElement).value; edit(() => { doc.value!.meta[key] = value }, false) }
function setNumber(apply: (value: number) => void, event: Event, structural = false): void {
  const value = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(value)) { version.value++; return }
  edit(() => { apply(value); doc.value!.tempo.sort((a, b) => a.beat - b.beat) }, structural)
}
function setLanes(event: Event): void {
  const lanes = Math.round(Number((event.target as HTMLInputElement).value))
  if (!(lanes >= 1 && lanes <= 16)) { version.value++; return }
  edit(() => { doc.value!.lanes = lanes; for (const note of doc.value!.notes) note.lane = Math.min(lanes - 1, note.lane) })
}
function setSong(uuid: string): void { edit(() => { doc.value!.meta.audio = uuid ? assetReference(uuid) : '' }, false); void loadSong() }
function addTempo(): void {
  const beat = snapBeat(tempo.timeToBeat(cursor.value), 1)
  edit(() => { const value = doc.value!; if (!value.tempo.some(point => Math.abs(point.beat - beat) < 1e-6)) value.tempo.push({ beat: Math.max(0, beat), bpm: tempo.bpmAt(cursor.value) }); value.tempo.sort((a, b) => a.beat - b.beat) })
}
function tapBpm(): void {
  const now = performance.now() / 1000
  if (taps.length && now - taps[taps.length - 1] > 2) taps.length = 0
  taps.push(now)
  const bpm = tapTempo(taps)
  tapLabel.value = bpm ? `${bpm} BPM` : `${t('chartTapBpm')} (${taps.length})`
  if (bpm && taps.length >= 8) edit(() => { const value = doc.value!; let index = 0; value.tempo.forEach((point, at) => { if (tempo.beatToTime(point.beat) <= cursor.value + 1e-6) index = at }); value.tempo[index].bpm = bpm })
}
function addLine(): void { edit(() => { doc.value!.lines.push(defaultChartLine({ y: 2.5 })); lineIndex.value = doc.value!.lines.length - 1 }) }
function removeLine(): void {
  const index = lineIndex.value
  edit(() => { const value = doc.value!; value.lines.splice(index, 1); value.notes = value.notes.filter(note => note.line !== index).map(note => note.line > index ? { ...note, line: note.line - 1 } : note); lineIndex.value = Math.max(0, index - 1) })
}
function addEvent(): void {
  const value = line.value
  if (!value) return
  const start = snapBeat(tempo.timeToBeat(cursor.value), snap.value), property = newEventProperty.value
  const current = property === 'alpha' ? value.alpha : property === 'speed' ? value.speed : value[property]
  edit(() => { value.events[property].push({ start, end: start + 4, from: current, to: current, ease: 'sine_in_out' }); value.events[property].sort((a, b) => a.start - b.start) })
}
function deleteSelection(): void { const value = doc.value; if (!value || !selection.size) return; const indices = [...selection].map(note => value.notes.indexOf(note)); edit(() => deleteNotes(value, indices)); selection.clear() }
function mirrorSelection(): void { const value = doc.value; if (!value) return; edit(() => mirrorNotes(value, [...selection].map(note => value.notes.indexOf(note)))) }
function setSelectionType(type: ChartNoteType): void {
  const hold = !!doc.value && chartNoteBase(doc.value, type) === 'hold'
  edit(() => { for (const note of selection) { note.type = type; if (hold && note.endBeat === undefined) note.endBeat = note.beat + 1 / snap.value; if (!hold) delete note.endBeat } })
}

// ------------------------------------------------------------------ preview and test play

function schedulePreview(): void {
  if (previewTimer) clearTimeout(previewTimer)
  previewTimer = setTimeout(() => {
    previewTimer = null
    previewSession?.free(); previewSession = null; problem.value = ''
    const value = doc.value
    if (!value) return
    const source = serializeChartDocument(value)
    const reason = rhythm_validate_chart(source)
    if (reason) { problem.value = `${t('chartInvalid')}: ${reason}`; return }
    previewSession = new WasmRhythmSession(source, new Float64Array([0.045, 0.09, 0.135, 0.18, component.value?.scrollSpeed ?? 8, component.value?.laneWidth ?? 1.6, component.value?.judgeY ?? -3.5]))
    publishPreview()
  }, 120)
}

function publishPreview(): void {
  const value = component.value
  if (!value || !previewSession || physicsState.playMode !== 'editing') return
  publishRhythmFrame(value.uuid, rhythmPreviewFrame(previewSession, cursor.value, value, '', rhythmFrameTypes(previewSession, doc.value?.noteTypes ?? [])))
}

function clearPreview(): void { const value = component.value; if (value && physicsState.playMode === 'editing') publishRhythmFrame(value.uuid, null) }

function testFromHere(): void {
  const value = component.value
  if (!value || problem.value) return
  if (dirty.value && !save()) return
  stopPlayback()
  requestRhythmStart(value.uuid, Math.max(-Math.max(0, value.leadInSeconds), cursor.value - 1.5))
  void playSimulation().then(started => { if (started) document.querySelector<HTMLElement>('[data-game-input-surface]')?.focus({ preventScroll: true }) })
}

// ------------------------------------------------------------------ playback

function audioOffset(): number { return ((doc.value?.meta.offsetMs ?? 0) + storedRhythmCalibration()) / 1000 }
function togglePlay(): void { if (playing.value) stopPlayback(); else startPlayback() }
function startPlayback(): void {
  audio.metronome = metronome.value; audio.hitSounds = hitSounds.value
  if (audio.play(cursor.value, rate.value, audioOffset())) { playing.value = true; requestDraw() }
}
function stopPlayback(): void { if (!playing.value) return; cursor.value = audio.stop(); playing.value = false; requestDraw() }
watch([metronome, hitSounds], ([metronomeOn, hits]) => { audio.metronome = metronomeOn; audio.hitSounds = hits })
watch(rate, () => { if (playing.value) { stopPlayback(); startPlayback() } })

// ------------------------------------------------------------------ the canvas

function view(): ChartView | null {
  const element = canvas.value, value = doc.value
  if (!element || !value) return null
  const width = element.clientWidth, height = element.clientHeight
  const lanes = value.mode === 'lanes' ? value.lanes : 1
  const fieldLeft = 96, available = Math.max(80, width - fieldLeft - 64)
  const fieldWidth = value.mode === 'lanes' ? Math.min(available, lanes * 72) : available
  return { width, height, judgeY: height - 56, time: cursor.value, pps: pps.value, fieldLeft, fieldWidth, mode: value.mode, lanes, xRange: 9 }
}

function requestDraw(): void { if (!frame) frame = requestAnimationFrame(draw) }

function colors(element: HTMLElement) {
  const style = getComputedStyle(element), read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  return { bg: read('--bg-canvas', '#101318'), surface: read('--surface-1', '#171b22'), text: read('--text-secondary', '#aab'), muted: read('--text-muted', '#778'), accent: read('--accent', '#5aa0ff'), border: read('--border-subtle', '#2a2f39'), danger: read('--danger', '#f66') }
}

const NOTE_COLORS: Record<ChartNoteType, string> = { tap: '#6ed6ff', hold: '#ffcd6e', drag: '#ffec8c', flick: '#ff6ea0' }

function draw(): void {
  frame = 0
  const element = canvas.value, value = doc.value, v0 = view()
  if (!element || !value || !v0) return
  if (playing.value) { cursor.value = audio.time(); audio.schedule(tempo, noteTimes); if (cursor.value > chartLength.value + 3) stopPlayback() }
  const v = view()!
  const ratio = Math.min(2, window.devicePixelRatio || 1)
  if (element.width !== Math.round(v.width * ratio) || element.height !== Math.round(v.height * ratio)) { element.width = Math.round(v.width * ratio); element.height = Math.round(v.height * ratio) }
  const context = element.getContext('2d')
  if (!context) return
  const palette = colors(element)
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  context.fillStyle = palette.bg; context.fillRect(0, 0, v.width, v.height)
  const timeTop = timeAtY(v, 0), timeBottom = timeAtY(v, v.height)
  // Waveform column.
  if (audio.peaks) {
    const peaks = audio.peaks, offset = audioOffset(), centre = 46
    context.fillStyle = 'rgba(120, 170, 255, .35)'
    for (let y = 0; y < v.height; y += 2) {
      const bucket = Math.floor((timeAtY(v, y) + offset) * audio.peaksPerSecond)
      const peak = bucket >= 0 && bucket < peaks.length ? peaks[bucket] : 0
      if (peak > .002) context.fillRect(centre - peak * 40, y, peak * 80, 2)
    }
  }
  // Note field background.
  context.fillStyle = palette.surface; context.fillRect(v.fieldLeft, 0, v.fieldWidth, v.height)
  if (v.mode === 'lanes') {
    context.strokeStyle = palette.border; context.lineWidth = 1
    for (let lane = 1; lane < v.lanes; lane++) { const x = Math.round(v.fieldLeft + lane * laneWidthPx(v)) + .5; context.beginPath(); context.moveTo(x, 0); context.lineTo(x, v.height); context.stroke() }
  } else {
    context.strokeStyle = palette.border; context.lineWidth = 1
    for (let x = -8; x <= 8; x += 2) { const px = Math.round(pxAtChartX(v, x)) + .5; context.beginPath(); context.moveTo(px, 0); context.lineTo(px, v.height); context.stroke() }
  }
  // Beat grid: bars, beats and the snap subdivision.
  const firstBeat = Math.floor(tempo.timeToBeat(timeBottom) * snap.value) / snap.value, lastBeat = tempo.timeToBeat(timeTop)
  context.font = '11px system-ui, sans-serif'; context.textBaseline = 'middle'
  for (let beat = firstBeat, guard = 0; beat <= lastBeat + 1e-9 && guard < 4000; beat += 1 / snap.value, guard++) {
    const y = Math.round(yAtTime(v, tempo.beatToTime(beat))) + .5
    const bar = Math.abs(beat / 4 - Math.round(beat / 4)) < 1e-6, whole = Math.abs(beat - Math.round(beat)) < 1e-6
    context.strokeStyle = bar ? 'rgba(255,255,255,.42)' : whole ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.07)'
    context.lineWidth = bar ? 1.5 : 1
    context.beginPath(); context.moveTo(v.fieldLeft, y); context.lineTo(v.fieldLeft + v.fieldWidth, y); context.stroke()
    if (bar) { context.fillStyle = palette.muted; context.fillText(String(Math.round(beat / 4) + 1), v.fieldLeft + v.fieldWidth + 8, y) }
  }
  // Tempo changes.
  context.fillStyle = palette.accent
  for (const point of value.tempo) { const y = yAtTime(v, tempo.beatToTime(point.beat)); if (y > -10 && y < v.height + 10) context.fillText(`♩${point.bpm}`, v.fieldLeft + v.fieldWidth + 28, y) }
  // 26.47 master timeline: track events as thin bars right of the field, triggers as flags across it.
  value.tracks.forEach((track, column) => {
    context.fillStyle = `hsla(${column * 47 + 30}, 75%, 62%, .45)`
    for (const event of track.events) {
      const top = yAtTime(v, tempo.beatToTime(event.end)), bottom = yAtTime(v, tempo.beatToTime(event.start))
      if (bottom < 0 || top > v.height) continue
      context.fillRect(v.fieldLeft + v.fieldWidth - 4 - (column % 8) * 5, top, 4, Math.max(2, bottom - top))
    }
  })
  for (const trigger of value.triggers) {
    const y = Math.round(yAtTime(v, tempo.beatToTime(trigger.beat))) + .5
    if (y < -10 || y > v.height + 10) continue
    context.strokeStyle = 'rgba(255, 200, 90, .85)'; context.setLineDash([6, 4]); context.beginPath(); context.moveTo(v.fieldLeft, y); context.lineTo(v.fieldLeft + v.fieldWidth, y); context.stroke(); context.setLineDash([])
    context.fillStyle = 'rgba(255, 200, 90, .95)'; context.fillText(`⚑ ${trigger.name}`, v.fieldLeft + 4, y - 7)
  }
  // Line events (lines mode): bars along the left edge of the field.
  if (v.mode === 'lines' && line.value) {
    CHART_LINE_PROPERTIES.forEach((property, column) => {
      for (const event of line.value!.events[property]) {
        const top = yAtTime(v, tempo.beatToTime(event.end)), bottom = yAtTime(v, tempo.beatToTime(event.start))
        if (bottom < 0 || top > v.height) continue
        context.fillStyle = `hsla(${column * 64 + 180}, 70%, 60%, .35)`
        context.fillRect(v.fieldLeft + 2 + column * 6, top, 5, Math.max(2, bottom - top))
      }
    })
  }
  // Notes.
  const half = v.mode === 'lanes' ? laneWidthPx(v) * .42 : 26
  const ownTypes = new Map(value.noteTypes.map(type => [type.id, type]))
  for (const note of value.notes) {
    const own = ownTypes.get(note.type) ?? null, base = own ? own.base : note.type
    const time = tempo.beatToTime(note.beat)
    const end = base === 'hold' && note.endBeat !== undefined ? tempo.beatToTime(note.endBeat) : time
    if (end < timeBottom - .2 || time > timeTop + .2) continue
    const other = v.mode === 'lines' && note.line !== lineIndex.value
    const x = v.mode === 'lanes' ? laneCentreX(v, note.lane) : pxAtChartX(v, note.x)
    const y = yAtTime(v, time), color = own?.color ?? NOTE_COLORS[note.type] ?? '#ffffff'
    context.globalAlpha = other ? .22 : 1
    if (base === 'hold') { const yEnd = yAtTime(v, end); context.fillStyle = color + '88'; context.fillRect(x - half * .55, yEnd, half * 1.1, y - yEnd) }
    context.fillStyle = color
    const height = base === 'drag' ? 6 : 10
    if (own && (own.shape === 'diamond' || own.base === 'custom')) { context.beginPath(); context.moveTo(x, y - 8); context.lineTo(x + 9, y); context.lineTo(x, y + 8); context.lineTo(x - 9, y); context.closePath(); context.fill() }
    else context.fillRect(x - half, y - height / 2, half * 2, height)
    if (own) { context.fillStyle = '#0b0d14'; context.font = 'bold 9px system-ui, sans-serif'; context.textAlign = 'center'; context.fillText((own.name || own.id).slice(0, 1).toUpperCase(), x, y + .5); context.textAlign = 'start'; context.font = '11px system-ui, sans-serif' }
    if (base === 'flick') { context.fillStyle = '#fff'; context.beginPath(); context.moveTo(x, y - 12); context.lineTo(x - 6, y - 5); context.lineTo(x + 6, y - 5); context.fill() }
    if (v.mode === 'lines' && note.side < 0) { context.fillStyle = '#fff'; context.fillRect(x - 2, y + 5, 4, 4) }
    if (selection.has(note)) { context.strokeStyle = '#fff'; context.lineWidth = 2; context.strokeRect(x - half - 2, y - height / 2 - 2, half * 2 + 4, height + 4) }
    context.globalAlpha = 1
  }
  // Box selection.
  if (drag?.kind === 'box') { context.strokeStyle = palette.accent; context.setLineDash([4, 3]); context.strokeRect(Math.min(drag.startX, drag.x), Math.min(drag.startY, drag.y), Math.abs(drag.x - drag.startX), Math.abs(drag.y - drag.startY)); context.setLineDash([]) }
  // Cursor (the judgement line).
  context.strokeStyle = playing.value ? '#ff6e8a' : palette.accent; context.lineWidth = 2
  context.beginPath(); context.moveTo(0, v.judgeY); context.lineTo(v.width, v.judgeY); context.stroke()
  publishPreview()
  if (playing.value) requestDraw()
}

function pointer(event: PointerEvent): { x: number; y: number } { const rect = canvas.value!.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top } }

function pointerDown(event: PointerEvent): void {
  const value = doc.value, v = view()
  if (!value || !v) return
  canvas.value?.focus()
  const at = pointer(event)
  // The waveform column seeks.
  if (at.x < v.fieldLeft) { cursor.value = timeAtY(v, at.y); if (playing.value) { stopPlayback(); startPlayback() } requestDraw(); return }
  const index = noteAt(value, tempo, v, at.x, at.y, lineIndex.value)
  if (event.button === 2) { if (index >= 0) { const note = value.notes[index]; edit(() => deleteNotes(value, [index])); selection.delete(note) } return }
  if (event.button !== 0) return
  canvas.value?.setPointerCapture(event.pointerId)
  if (tool.value === 'erase') { if (index >= 0) edit(() => deleteNotes(value, [index])); return }
  if (tool.value === 'select') {
    if (index >= 0) {
      const note = value.notes[index]
      if (event.shiftKey) { if (selection.has(note)) selection.delete(note); else selection.add(note) } else if (!selection.has(note)) { selection.clear(); selection.add(note) }
      drag = { kind: 'move', startX: at.x, startY: at.y, x: at.x, y: at.y, originals: new Map([...selection].map(item => [item, { beat: item.beat, endBeat: item.endBeat, lane: item.lane, x: item.x }])), recorded: false }
    } else {
      if (!event.shiftKey) selection.clear()
      drag = { kind: 'box', startX: at.x, startY: at.y, x: at.x, y: at.y, originals: new Map(), recorded: false }
    }
    requestDraw(); return
  }
  if (tool.value === 'custom' && !value.noteTypes.some(item => item.id === customType.value)) customType.value = value.noteTypes[0]?.id ?? ''
  const type: ChartNoteType = tool.value === 'custom' ? customType.value : tool.value
  if (!type) return
  const hold = chartNoteBase(value, type) === 'hold'
  if (index >= 0 && !hold && value.notes[index].type === type) { edit(() => deleteNotes(value, [index])); return }
  const note = noteFromPointer(v, tempo, at.x, at.y, hold ? 'hold' : 'tap', snap.value, lineIndex.value, side.value)
  if (!note) return
  note.type = type
  edit(() => placeNote(value, note))
  if (hitSounds.value && !playing.value) audio.clickNow('note', .5)
  if (hold) drag = { kind: 'hold', startX: at.x, startY: at.y, x: at.x, y: at.y, originals: new Map(), note, recorded: true }
}

function pointerMove(event: PointerEvent): void {
  const value = doc.value, v = view()
  if (!drag || !value || !v) return
  const at = pointer(event)
  drag.x = at.x; drag.y = at.y
  if (drag.kind === 'hold' && drag.note) {
    const beat = snapBeat(tempo.timeToBeat(timeAtY(v, at.y)), snap.value)
    drag.note.endBeat = Math.max(drag.note.beat + 1 / snap.value, beat)
    changed(true)
  } else if (drag.kind === 'move') {
    const beats = snapBeat(tempo.timeToBeat(timeAtY(v, at.y)) - tempo.timeToBeat(timeAtY(v, drag.startY)), snap.value)
    const lanes = v.mode === 'lanes' ? laneAtX(v, at.x) - laneAtX(v, drag.startX) : 0
    const x = v.mode === 'lines' ? Math.round((chartXAtPx(v, at.x) - chartXAtPx(v, drag.startX)) * 4) / 4 : 0
    if (!drag.recorded && (beats !== 0 || lanes !== 0 || x !== 0)) { history.record(serializeChartDocument(value)); drag.recorded = true; syncHistory() }
    if (!drag.recorded) return
    for (const [note, original] of drag.originals) { note.beat = original.beat; note.endBeat = original.endBeat; note.lane = original.lane; note.x = original.x }
    moveNotes(value, [...drag.originals.keys()].map(note => value.notes.indexOf(note)), beats, lanes, x)
    changed(true)
  } else requestDraw()
}

function pointerUp(event: PointerEvent): void {
  const value = doc.value, v = view()
  if (drag?.kind === 'box' && value && v) for (const index of notesInRect(value, tempo, v, { x: drag.startX, y: drag.startY }, { x: drag.x, y: drag.y }, lineIndex.value)) selection.add(value.notes[index])
  drag = null
  if (canvas.value?.hasPointerCapture(event.pointerId)) canvas.value.releasePointerCapture(event.pointerId)
  requestDraw()
}

function wheel(event: WheelEvent): void {
  if (event.ctrlKey || event.metaKey) { pps.value = Math.max(40, Math.min(1600, pps.value * (event.deltaY < 0 ? 1.15 : 1 / 1.15))) }
  else { stopPlayback(); cursor.value = Math.max(-10, cursor.value - event.deltaY / pps.value) }
  requestDraw()
}

let clipboard: ChartNote[] = []
function keyDown(event: KeyboardEvent): void {
  const value = doc.value
  if (!value) return
  const step = 60 / tempo.bpmAt(cursor.value) / snap.value
  const mod = event.ctrlKey || event.metaKey
  let handled = true
  if (event.code === 'Space') togglePlay()
  else if (event.key === 'Delete' || event.key === 'Backspace') deleteSelection()
  else if (mod && event.code === 'KeyZ') { if (event.shiftKey) redo(); else undo() }
  else if (mod && event.code === 'KeyY') redo()
  else if (mod && event.code === 'KeyS') save()
  else if (mod && event.code === 'KeyA') { selection.clear(); for (const note of value.notes) if (value.mode === 'lanes' || note.line === lineIndex.value) selection.add(note); requestDraw() }
  else if (mod && event.code === 'KeyC') clipboard = copyNotes(value, [...selection].map(note => value.notes.indexOf(note)))
  else if (mod && event.code === 'KeyV') { if (clipboard.length) { const at = snapBeat(tempo.timeToBeat(cursor.value), snap.value); let pasted: ChartNote[] = []; edit(() => { pasted = pasteNotes(value, clipboard, at) }); selection.clear(); for (const note of pasted) selection.add(note) } }
  else if (event.code === 'KeyM' && selection.size) mirrorSelection()
  else if ((event.code === 'ArrowUp' || event.code === 'ArrowDown') && selection.size) { const beats = (event.code === 'ArrowUp' ? 1 : -1) / snap.value; edit(() => moveNotes(value, [...selection].map(note => value.notes.indexOf(note)), beats, 0, 0)) }
  else if ((event.code === 'ArrowLeft' || event.code === 'ArrowRight') && selection.size) { const direction = event.code === 'ArrowRight' ? 1 : -1; edit(() => moveNotes(value, [...selection].map(note => value.notes.indexOf(note)), 0, value.mode === 'lanes' ? direction : 0, value.mode === 'lines' ? direction * .5 : 0)) }
  else if (event.code === 'ArrowUp') cursor.value += step
  else if (event.code === 'ArrowDown') cursor.value -= step
  else if (event.code === 'PageUp') cursor.value = tempo.beatToTime(Math.floor(tempo.timeToBeat(cursor.value) / 4 + 1) * 4)
  else if (event.code === 'PageDown') cursor.value = tempo.beatToTime(Math.ceil(tempo.timeToBeat(cursor.value) / 4 - 1) * 4)
  else if (event.code === 'Home') cursor.value = 0
  else if (!mod && /^Digit[1-7]$/.test(event.code)) { const next = CHART_TOOLS[Number(event.code.slice(5)) - 1]; if (next !== 'custom' || value.noteTypes.length) tool.value = next }
  else if (event.code === 'Escape') { selection.clear() }
  else handled = false
  if (handled) { event.preventDefault(); event.stopPropagation(); requestDraw() }
}

// ------------------------------------------------------------------ calibration

function openCalibration(): void { stopPlayback(); calibration.open = true; calibration.result = null; storedCalibration.value = storedRhythmCalibration(); void nextTick(() => (document.querySelector('[data-chart-calibration]') as HTMLElement | null)?.focus()) }
function startCalibration(): void {
  calibration.taps = []; calibration.clicks = []; calibration.result = null; picture.flashes = []
  const start = audio.clickNow('beat', 0) + .8
  for (let index = 0; index < 20; index++) { const when = start + index * .6; calibration.clicks.push(when); audio.clickAt(when, index % 4 === 0) }
  void nextTick(() => (document.querySelector('[data-chart-calibration]') as HTMLElement | null)?.focus())
}
function calibrationTap(event: Event): void {
  if (event instanceof KeyboardEvent && event.code === 'Escape') { calibration.open = false; return }
  if (picture.flashes.length && !(event instanceof KeyboardEvent && event.repeat)) { pictureTap(event); return }
  if (!calibration.clicks.length || (event instanceof KeyboardEvent && event.repeat)) return
  const stamp = (event as Event & { timeStamp: number }).timeStamp
  calibration.taps.push(audio.heardContextTimeAt(stamp > 0 ? stamp : performance.now()))
  // The first four clicks only set the pace.
  calibration.result = calibrationFromTaps(calibration.taps, calibration.clicks.slice(4))
}
function saveCalibration(): void { if (!calibration.result) return; storeRhythmCalibration(calibration.result.offsetMs); storedCalibration.value = storedRhythmCalibration(); calibration.open = false }
/** Twenty flashes 0.6 s apart, lit on animation frames; a flash's time is the frame that showed it. */
function startPictureTest(): void {
  calibration.clicks = []; picture.taps = []; picture.result = null; picture.flashes = []
  const start = performance.now() + 800, planned = Array.from({ length: 20 }, (_, index) => start + index * 600)
  let next = 0
  if (pictureFrame) cancelAnimationFrame(pictureFrame)
  const step = (now: number) => {
    if (!calibration.open) { picture.lit = false; pictureFrame = 0; return }
    if (next < planned.length && now >= planned[next]) { picture.flashes.push(now / 1000); picture.lit = true; next++ }
    else if (picture.lit && now - picture.flashes[picture.flashes.length - 1] * 1000 > 90) picture.lit = false
    pictureFrame = next < planned.length || picture.lit ? requestAnimationFrame(step) : 0
  }
  pictureFrame = requestAnimationFrame(step)
  void nextTick(() => (document.querySelector('[data-chart-calibration]') as HTMLElement | null)?.focus())
}
function pictureTap(event: Event): void {
  const stamp = (event as Event & { timeStamp: number }).timeStamp
  picture.taps.push((stamp > 0 ? stamp : performance.now()) / 1000)
  picture.result = calibrationFromTaps(picture.taps, picture.flashes.slice(4))
}
function setVisualOffset(value: number): void { if (!Number.isFinite(value)) return; storeRhythmVisualOffset(value); storedVisual.value = storedRhythmVisualOffset() }

// ------------------------------------------------------------------ lifecycle

watch(() => [target.value?.chartAsset, target.value?.revision], () => { if (dirty.value) save(); clearPreview(); load() }, { immediate: true })
watch(() => physicsState.playMode, mode => { if (mode !== 'editing') stopPlayback(); else schedulePreview() })
watch(cursor, () => { if (!playing.value) requestDraw() })
watch([snap, lineIndex, pps], () => requestDraw())
let observer: ResizeObserver | null = null
onMounted(() => { observer = new ResizeObserver(() => requestDraw()); if (wrap.value) observer.observe(wrap.value); requestDraw() })
watch(wrap, element => { if (element && observer) { observer.disconnect(); observer.observe(element) } })
onBeforeUnmount(() => {
  if (dirty.value) save()
  observer?.disconnect(); if (frame) cancelAnimationFrame(frame); if (pictureFrame) cancelAnimationFrame(pictureFrame)
  if (previewTimer) clearTimeout(previewTimer)
  clearPreview(); previewSession?.free(); previewSession = null
  audio.dispose()
})
</script>

<style scoped>
.chart-panel{height:100%;min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden;position:relative;container-type:inline-size}
.chart-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:var(--ui-control-gap, 6px);padding:var(--space-1) var(--space-2);border-bottom:1px solid var(--border-subtle)}
.chart-toolbar select{max-width:220px}
.chart-time{font-variant-numeric:tabular-nums;color:var(--text-secondary);min-width:16ch}
.chart-divider{width:1px;align-self:stretch;background:var(--border-subtle)}
.chart-tools{display:inline-flex;border:1px solid var(--border-subtle);border-radius:var(--radius-control, 8px);overflow:hidden}
.chart-tools button{border:0;border-radius:0;background:transparent;padding:2px 10px;color:var(--text-secondary)}
.chart-tools button.active{background:var(--accent-soft, rgba(90,160,255,.2));color:var(--text-primary)}
.chart-compact{display:inline-flex;align-items:center;gap:4px;color:var(--text-secondary)}
.chart-workspace{min-height:0;flex:1;display:grid;grid-template-columns:minmax(0,1fr) minmax(240px,320px)}
.chart-canvas-wrap{position:relative;min-width:0;min-height:0}
.chart-canvas-wrap canvas{display:block;width:100%;height:100%;outline:none;cursor:crosshair}
.chart-canvas-wrap canvas:focus-visible{box-shadow:inset 0 0 0 2px var(--accent)}
.chart-problem{position:absolute;left:104px;top:8px;margin:0;padding:4px 8px;border-radius:6px;background:var(--danger-soft, rgba(255,90,90,.2));color:var(--danger, #f66);max-width:60%}
.chart-hint{position:absolute;left:104px;bottom:4px;margin:0;color:var(--text-muted);font-size:var(--type-caption, 11px);pointer-events:none}
.chart-side{min-width:0;min-height:0;overflow:auto;padding:var(--space-2);border-left:1px solid var(--border-subtle);display:grid;align-content:start;gap:var(--space-3, 12px)}
.chart-side section{display:grid;gap:var(--space-1)}
.chart-side h3,.chart-side h4{margin:0;font-size:var(--type-body, 13px)}
.chart-side label{display:grid;gap:2px;color:var(--text-secondary);font-size:var(--type-caption, 12px)}
.chart-side input,.chart-side select{min-width:0;width:100%}
.chart-row{display:flex;gap:var(--space-1);align-items:end;flex-wrap:wrap}.chart-row label{flex:1}
.chart-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--space-1)}
.chart-events{width:100%;border-collapse:collapse;font-size:var(--type-caption, 12px)}.chart-events th{text-align:start;color:var(--text-muted);font-weight:500}.chart-events td{padding:1px}.chart-events input{width:5.5em}
.chart-stats{margin:0;color:var(--text-muted)}
.chart-empty{margin:auto;padding:var(--space-4);text-align:center;color:var(--text-muted)}
.chart-calibration{position:absolute;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.45);outline:none}
.chart-calibration-card{max-width:440px;padding:var(--space-4, 16px);border-radius:var(--radius-panel, 12px);background:var(--surface-floating, #1d222b);border:1px solid var(--border-subtle);display:grid;gap:var(--space-2)}
.chart-calibration-card h3,.chart-calibration-card p{margin:0}
.chart-flash{height:40px;border-radius:8px;background:var(--surface-3, #2a2f39);transition:none}.chart-flash.lit{background:#fff}
.chart-tap-pad{height:72px;font-size:18px;font-weight:700;letter-spacing:.08em}.chart-calibration-beats{display:flex;gap:4px}.chart-calibration-beats span{width:14px;height:14px;border-radius:50%;background:var(--surface-3, #333)}.chart-calibration-beats span.done{background:var(--accent)}
@container(max-width:640px){.chart-workspace{grid-template-columns:minmax(0,1fr)}.chart-side{display:none}}
</style>
