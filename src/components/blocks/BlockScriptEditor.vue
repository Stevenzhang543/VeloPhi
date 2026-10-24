<!-- 26.43 积木编辑器：事件帽 + 堆叠积木，点击添加、拖动排序，自动保存为普通 Rhai 脚本。 -->
<template>
  <section ref="root" class="block-studio" tabindex="-1" @keydown="onKeydown">
    <header class="block-toolbar">
      <select class="block-script-picker" :value="activeUuid" :aria-label="copy.ui.title" @change="openScript(($event.target as HTMLSelectElement).value)">
        <option value="">{{ blockScripts.length ? copy.ui.noScript : copy.ui.noScript }}</option>
        <option v-for="asset in blockScripts" :key="asset.uuid" :value="asset.uuid">{{ asset.path }}</option>
      </select>
      <UiButton icon="add" variant="primary" :label="copy.ui.newScript" @click="createScript" />
      <UiButton icon="link" :label="attachedToSelection ? copy.ui.attached : copy.ui.attach" :disabled="!selectedEntity || !document || attachedToSelection" @click="attach" />
      <UiButton icon="undo" :label="t('undo')" :disabled="!undoStack.length" @click="undo" />
      <UiButton icon="redo" :label="t('redo')" :disabled="!redoStack.length" @click="redo" />
      <UiButton icon="code" :label="copy.ui.openCode" :disabled="!activeUuid" @click="emit('open-code')" />
      <span class="block-status" :class="{ invalid: errors.length, dirty }" role="status">{{ statusText }}</span>
    </header>

    <div v-if="loadState === 'not-blocks'" class="block-notice" role="note">{{ copy.ui.notBlocks }}</div>
    <div v-else-if="loadState === 'code-edited'" class="block-notice warning" role="alert">
      <span>{{ copy.ui.codeEdited }}</span>
      <UiButton :label="copy.ui.useBlocks" variant="primary" @click="loadState = 'blocks'" />
      <UiButton :label="copy.ui.keepCode" @click="convertToCode(true)" />
    </div>

    <div v-if="document" class="block-body">
      <aside class="block-toolbox" :aria-label="copy.ui.toolbox">
        <input v-model="search" class="block-search" type="search" :placeholder="copy.ui.search" :aria-label="copy.ui.search">
        <nav class="block-categories" :aria-label="copy.ui.toolbox">
          <button v-for="category in categories" :key="category" type="button" :class="{ active: activeCategory === category && !search }" :style="{ '--block-fill': BLOCK_CATEGORY_COLORS[category].fill }" @click="activeCategory = category; search = ''"><i aria-hidden="true"></i>{{ copy.categories[category] }}</button>
        </nav>
        <div class="toolbox-list">
          <template v-if="showEvents">
            <button v-for="event in toolboxEvents" :key="event.type" type="button" class="toolbox-block toolbox-hat" :style="categoryStyle('events')" @click="addHandler(event.type)">{{ plainLabel(copy.events[event.type]) }}</button>
          </template>
          <button v-for="spec in toolboxStatements" :key="spec.type" type="button" class="toolbox-block" :class="{ 'toolbox-container': !!spec.container }" :style="categoryStyle(spec.category)"
            @pointerdown="startDrag($event, { kind: 'new', type: spec.type })" @click="$event.detail === 0 && insert(spec.type)">{{ plainLabel(copy.statements[spec.type]) }}</button>
          <p v-if="!toolboxStatements.length && !(showEvents && toolboxEvents.length)" class="toolbox-empty">—</p>
        </div>
      </aside>

      <main ref="canvas" class="block-canvas" @click="selectedId = ''">
        <p class="block-hint">{{ copy.ui.hint }}</p>
        <article v-for="handler in document.handlers" :key="handler.id" class="block-handler" :class="{ disabled: handler.disabled, invalid: (diagnostics.get(handler.id)?.length ?? 0) > 0 }" :data-handler-id="handler.id">
          <header class="block-hat" :style="categoryStyle('events')" @click.stop="setCursor(`${handler.id}:blocks`, handler.blocks.length)">
            <span class="block-label">
              <template v-for="(part, index) in labelParts(copy.events[handler.event] ?? handler.event)" :key="index">
                <span v-if="'text' in part" class="block-text">{{ part.text }}</span>
                <BlockFieldInput v-else-if="eventField(handler.event, part.field)" :spec="eventField(handler.event, part.field)!" :label="part.field" :placeholder="part.field === 'tag' ? copy.ui.touchAny : part.field === 'params' ? copy.ui.none : undefined" :model-value="handler.fields[part.field]" @update:model-value="mutate(() => { handler.fields[part.field] = $event })" />
              </template>
            </span>
            <span class="hat-actions" @click.stop>
              <button type="button" :aria-label="handler.collapsed ? copy.ui.expand : copy.ui.collapse" :title="handler.collapsed ? copy.ui.expand : copy.ui.collapse" @click="mutate(() => { handler.collapsed = !handler.collapsed })">{{ handler.collapsed ? '▸' : '▾' }}</button>
              <button type="button" :aria-pressed="handler.disabled === true" :title="handler.disabled ? copy.ui.enable : copy.ui.disable" @click="mutate(() => { handler.disabled = !handler.disabled })">{{ handler.disabled ? '○' : '●' }}</button>
              <button type="button" class="danger" :aria-label="copy.ui.remove" :title="copy.ui.remove" @click="removeHandler(handler.id)">×</button>
            </span>
          </header>
          <p v-for="problem in diagnostics.get(handler.id) ?? []" :key="problem.message" class="block-problem" :class="problem.severity">{{ problemText(problem) }}</p>
          <BlockStack v-if="!handler.collapsed" :list="handler.blocks" :list-key="`${handler.id}:blocks`" />
          <p v-else class="block-collapsed">{{ handler.blocks.length }} ⋯</p>
        </article>
        <div class="block-add-event">
          <select :aria-label="copy.ui.addEvent" value="" @change="addHandler(($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''">
            <option value="">+ {{ copy.ui.addEvent }}</option>
            <option v-for="event in BLOCK_EVENTS" :key="event.type" :value="event.type">{{ plainLabel(copy.events[event.type]) }}</option>
          </select>
        </div>
      </main>

      <aside class="block-side">
        <section class="block-variables">
          <header><strong>{{ copy.ui.variables }}</strong><UiButton icon="add" :label="copy.ui.addVariable" @click="addVariable" /></header>
          <p>{{ copy.ui.variableHint }}</p>
          <div v-for="(variable, index) in document.variables" :key="index" class="block-variable">
            <input :value="variable.name" :aria-label="copy.ui.name" spellcheck="false" autocomplete="off" @change="renameVariable(index, ($event.target as HTMLInputElement).value)">
            <input :value="variable.initial" :aria-label="copy.ui.initial" spellcheck="false" autocomplete="off" @change="mutate(() => { variable.initial = ($event.target as HTMLInputElement).value })">
            <button type="button" class="danger" :aria-label="copy.ui.remove" :title="copy.ui.remove" @click="mutate(() => { document!.variables.splice(index, 1) })">×</button>
          </div>
        </section>
        <section v-if="compiled.diagnostics.length" class="block-problems">
          <header><strong>{{ copy.ui.problems }}</strong><span>{{ compiled.diagnostics.length }}</span></header>
          <button v-for="(problem, index) in compiled.diagnostics" :key="index" type="button" :class="problem.severity" @click="reveal(problem.blockId)">{{ problemText(problem) }}</button>
        </section>
        <details class="block-code">
          <summary>{{ copy.ui.code }}</summary>
          <pre>{{ compiled.code }}</pre>
        </details>
        <section class="block-convert">
          <UiButton v-if="!confirmConvert" :label="copy.ui.convert" @click="confirmConvert = true" />
          <template v-else><p>{{ copy.ui.convertConfirm }}</p><UiButton variant="danger" :label="copy.ui.convert" @click="convertToCode(false)" /><UiButton :label="t('cancel')" @click="confirmConvert = false" /></template>
        </section>
      </aside>
    </div>
    <div v-else class="block-empty">
      <p>{{ copy.ui.noScript }}</p>
      <UiButton icon="add" variant="primary" :label="copy.ui.newScript" @click="createScript" />
    </div>
    <datalist :id="valueListId"><option v-for="name in valueSuggestions" :key="name" :value="name"></option></datalist>
    <datalist :id="objectListId"><option v-for="name in objectNames" :key="name" :value="name"></option></datalist>
    <div v-if="ghost" class="block-ghost" :style="{ left: `${ghost.x}px`, top: `${ghost.y}px`, '--block-fill': ghost.fill, '--block-ink': ghost.ink }" aria-hidden="true">{{ ghost.label }}</div>
  </section>
</template>

<script setup lang="ts">
import './blocks.css'
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, provide, ref, shallowRef, watch } from 'vue'
import UiButton from '../../ui/components/UiButton.vue'
import BlockStack from './BlockStack.vue'
import BlockFieldInput from './BlockFieldInput.vue'
import { BLOCK_EDITOR, type BlockDragPayload, type BlockEditorContext, type BlockPosition } from './blockEditorContext'
import {
  BLOCK_CATEGORY_COLORS, BLOCK_EVENTS, BLOCK_STATEMENTS, blockLists, blockScriptCode, blockSourceLines, blockScriptSource, cloneBlock, compileBlockScript, createBlock, createBlockScript, createCondition, createHandler,
  formatBlockProblem, handlerEventSpec, isBlockScriptSource, locateBlock, moveBlock, normalizeBlockScript, parseBlockScriptSource, statementSpec, validIdentifier,
  type BlockCategory, type BlockCondition, type BlockDiagnostic, type BlockNode, type BlockScriptDocument
} from '../../visual/blockScript'
import { blockCopy, labelParts } from '../../visual/blockScriptCopy'
import { graphStudioState as studio } from '../../visual/graphStudioState'
import { preferencesState } from '../../store/preferences'
import { t } from '../../i18n'
import { assetGuid, assetReference, assetState, createTextAsset, readTextAsset, updateTextAsset } from '../../assets/AssetDatabase'
import { physicsState, pushHistory, sceneManager } from '../../store/physics'
import { addEditorLog } from '../../store/editor'
import { gameplayRuntime } from '../../editor/gameplayRuntime'
import { scriptDebugState } from '../../runtime/scriptDebug'
import { Script2D } from '../../world/components'

const emit = defineEmits<{ 'open-code': [] }>()
const copy = computed(() => blockCopy(preferencesState.locale))
const root = ref<HTMLElement | null>(null), canvas = ref<HTMLElement | null>(null)
const document = ref<BlockScriptDocument | null>(null)
const loadState = ref<'none' | 'blocks' | 'not-blocks' | 'code-edited'>('none')
const dirty = ref(false), confirmConvert = ref(false), search = ref(''), activeCategory = ref<BlockCategory>('events')
const selectedId = ref(''), cursor = ref<BlockPosition | null>(null), drop = ref<BlockPosition | null>(null), draggingId = ref('')
const ghost = shallowRef<{ x: number; y: number; label: string; fill: string; ink: string } | null>(null)
const undoStack = shallowRef<string[]>([]), redoStack = shallowRef<string[]>([])
const uid = Math.random().toString(36).slice(2, 8)
const valueListId = `block-values-${uid}`, objectListId = `block-objects-${uid}`
const activeUuid = computed(() => studio.activeBlockScriptUuid)

const categories: BlockCategory[] = ['events', 'motion', 'looks', 'sound', 'control', 'variables', 'game', 'messages']
const blockScripts = computed(() => { void assetState.generation; return assetState.records.filter(asset => asset.assetType === 'script' && isBlockScriptSource(readTextAsset(asset.uuid))).map(asset => ({ uuid: asset.uuid, path: asset.path })) })
const selectedEntity = computed(() => physicsState.world.entities.find(entity => entity.id === physicsState.selectedEntityId) ?? null)
const attachedToSelection = computed(() => !!activeUuid.value && assetGuid(selectedEntity.value?.script2D?.scriptAsset) === activeUuid.value || selectedEntity.value?.script2D?.scriptAsset === activeUuid.value)
const compiled = computed(() => document.value ? compileBlockScript(document.value) : { code: '', diagnostics: [] })
const diagnostics = computed(() => { const map = new Map<string, typeof compiled.value.diagnostics>(); for (const item of compiled.value.diagnostics) map.set(item.blockId, [...(map.get(item.blockId) ?? []), item]); return map })
const errors = computed(() => compiled.value.diagnostics.filter(item => item.severity === 'error'))
const statusText = computed(() => !document.value ? '' : dirty.value ? copy.value.ui.unsaved : errors.value.length ? `${copy.value.ui.problems}: ${errors.value.length}` : copy.value.ui.saved)

const assetOptions = (type: string) => assetState.records.filter(asset => asset.assetType === type).map(asset => ({ value: assetReference(asset.uuid), label: asset.name }))
const options = computed(() => ({
  actions: physicsState.inputMap.map(action => action.name),
  variables: document.value?.variables.map(variable => variable.name) ?? [],
  audio: assetOptions('audio'), video: assetOptions('video'), prefabs: assetOptions('prefab'),
  scenes: sceneManager.scenes.map(scene => ({ value: scene.uuid, label: scene.name })),
  buses: physicsState.audioSettings?.mixer?.buses?.map(bus => bus.id) ?? ['Master', 'Music', 'SFX', 'UI']
}))
const valueSuggestions = computed(() => [...options.value.variables, 'transform().position_x', 'transform().position_y', 'rigid_body().velocity_x', 'rigid_body().velocity_y', 'score_get()', 'time_elapsed()', 'random()', 'mouse_world_x()', 'mouse_world_y()'])
const objectNames = computed(() => [...new Set(physicsState.world.entities.map(entity => entity.name))].slice(0, 500))

const problemText = (problem: BlockDiagnostic) => formatBlockProblem(copy.value.problems[problem.code] ?? problem.message, problem.params)
const plainLabel = (label: string | undefined) => (label ?? '').replace(/\{[A-Za-z]+\}/g, '…')
const categoryStyle = (category: BlockCategory) => ({ '--block-fill': BLOCK_CATEGORY_COLORS[category].fill, '--block-ink': BLOCK_CATEGORY_COLORS[category].ink })
const eventField = (type: string, key: string) => handlerEventSpec(type)?.fields.find(field => field.key === key)
const matches = (label: string) => !search.value.trim() || label.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase())
const showEvents = computed(() => !!search.value.trim() || activeCategory.value === 'events')
const toolboxEvents = computed(() => BLOCK_EVENTS.filter(event => matches(plainLabel(copy.value.events[event.type]))))
const toolboxStatements = computed(() => BLOCK_STATEMENTS.filter(spec => search.value.trim() ? matches(plainLabel(copy.value.statements[spec.type])) : spec.category === activeCategory.value))

// ---- loading and saving -------------------------------------------------------------------
function openScript(uuid: string) { void saveNow(); studio.activeBlockScriptUuid = uuid }
function load(uuid: string) {
  undoStack.value = []; redoStack.value = []; selectedId.value = ''; cursor.value = null; confirmConvert.value = false
  const source = uuid ? readTextAsset(uuid) : null
  const parsed = parseBlockScriptSource(source)
  dirty.value = false; studio.activeBlocksDirty = false
  if (!uuid || source === null) { document.value = null; loadState.value = 'none'; return }
  if (!parsed) { document.value = null; loadState.value = 'not-blocks'; return }
  document.value = parsed
  loadState.value = compileBlockScript(parsed).code === blockScriptCode(source!) ? 'blocks' : 'code-edited'
  const first = parsed.handlers[0]
  if (first) cursor.value = { key: `${first.id}:blocks`, index: first.blocks.length }
}
watch(activeUuid, uuid => load(uuid), { immediate: true })

let saveTimer = 0
function scheduleSave() { window.clearTimeout(saveTimer); saveTimer = window.setTimeout(() => { void saveNow() }, 700) }
function saveNow(): boolean {
  window.clearTimeout(saveTimer)
  const uuid = activeUuid.value
  if (!dirty.value || !document.value || !uuid) return true
  const { source } = blockScriptSource(document.value)
  if (!updateTextAsset(uuid, source)) { addEditorLog(`Blocks: could not save ${uuid}`, 'Script', 'error', uuid); return false }
  dirty.value = false; studio.activeBlocksDirty = false; loadState.value = 'blocks'
  pushHistory('Edit blocks', `blocks:${uuid}`)
  // Exported variables appear in the Inspector of every object using this script.
  for (const entity of physicsState.world.entities) if (entity.script2D && (assetGuid(entity.script2D.scriptAsset) === uuid || entity.script2D.scriptAsset === uuid)) gameplayRuntime.synchronizeExports(entity)
  return true
}
function mutate(edit: () => void) {
  if (!document.value) return
  undoStack.value = [...undoStack.value.slice(-99), JSON.stringify(document.value)]; redoStack.value = []
  edit()
  dirty.value = true; studio.activeBlocksDirty = true; confirmConvert.value = false
  scheduleSave()
}
function restore(snapshot: string) { document.value = normalizeBlockScript(JSON.parse(snapshot)); dirty.value = true; studio.activeBlocksDirty = true; scheduleSave() }
function undo() { const previous = undoStack.value.at(-1); if (!previous || !document.value) return; redoStack.value = [...redoStack.value, JSON.stringify(document.value)]; undoStack.value = undoStack.value.slice(0, -1); restore(previous) }
function redo() { const next = redoStack.value.at(-1); if (!next || !document.value) return; undoStack.value = [...undoStack.value, JSON.stringify(document.value)]; redoStack.value = redoStack.value.slice(0, -1); restore(next) }

function createScript() {
  void saveNow()
  const documentValue = createBlockScript()
  const record = createTextAsset('Blocks', 'script', blockScriptSource(documentValue).source, 'Assets/Scripts')
  pushHistory('Create blocks script')
  studio.activeBlockScriptUuid = record.uuid
}
function attach() {
  const entity = selectedEntity.value, uuid = activeUuid.value
  if (!entity || !uuid || !saveNow()) return
  const component = entity.script2D ?? entity.addComponent(new Script2D())
  component.scriptAsset = assetReference(uuid)
  physicsState.world.invalidateRuntime()
  gameplayRuntime.synchronizeExports(entity)
  pushHistory('Attach blocks script')
}
/** Turns the script into ordinary code (drops the block header and the generated-by comment). */
function convertToCode(keepCurrentCode: boolean) {
  const uuid = activeUuid.value
  if (!uuid) return
  if (!keepCurrentCode && dirty.value) saveNow()
  const source = readTextAsset(uuid) ?? ''
  const code = blockScriptCode(source).replace(/^\/\/ Generated by Nova_A Blocks\.[^\n]*\n/, '')
  if (updateTextAsset(uuid, code)) { pushHistory('Convert blocks to code'); confirmConvert.value = false; document.value = null; loadState.value = 'not-blocks'; emit('open-code') }
}
studio.saveActiveBlocks = () => saveNow()
onActivated(() => { studio.saveActiveBlocks = () => saveNow() })
onDeactivated(() => { saveNow() })
onBeforeUnmount(() => { saveNow(); if (studio.saveActiveBlocks) studio.saveActiveBlocks = null })

// ---- editing --------------------------------------------------------------------------------
function validCursor(): BlockPosition | null {
  if (!document.value || !cursor.value) return null
  const list = blockLists(document.value).get(cursor.value.key)
  return list ? { key: cursor.value.key, index: Math.min(cursor.value.index, list.length) } : null
}
function insert(type: string, at?: BlockPosition | null) {
  mutate(() => {
    const documentValue = document.value!
    let position = at ?? validCursor()
    if (!position) {
      const handler = documentValue.handlers.at(-1) ?? (documentValue.handlers.push(createHandler('start')), documentValue.handlers.at(-1)!)
      position = { key: `${handler.id}:blocks`, index: handler.blocks.length }
    }
    const list = blockLists(documentValue).get(position.key)!
    const node = createBlock(type)
    if ((type === 'setVariable' || type === 'changeVariable') && documentValue.variables[0]) node.fields.variable = documentValue.variables[0].name
    list.splice(position.index, 0, node)
    selectedId.value = node.id
    cursor.value = node.children ? { key: `${node.id}:children`, index: 0 } : { key: position.key, index: position.index + 1 }
  })
}
function addHandler(event: string) {
  if (!event) return
  mutate(() => {
    const handler = createHandler(event)
    document.value!.handlers.push(handler)
    cursor.value = { key: `${handler.id}:blocks`, index: 0 }
  })
  void nextTick(() => canvas.value?.querySelector(`[data-handler-id="${cursor.value?.key.split(':')[0]}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
}
function removeHandler(id: string) { mutate(() => { const list = document.value!.handlers; const index = list.findIndex(handler => handler.id === id); if (index >= 0) list.splice(index, 1) }) }
function remove(id: string) { mutate(() => { const found = locateBlock(document.value!, id); if (found) { found.list.splice(found.index, 1); cursor.value = { key: found.key, index: found.index }; selectedId.value = '' } }) }
function duplicate(id: string) { mutate(() => { const found = locateBlock(document.value!, id); if (found) { const copyNode = cloneBlock(found.list[found.index]); found.list.splice(found.index + 1, 0, copyNode); selectedId.value = copyNode.id } }) }
function moveRelative(id: string, delta: number) {
  const found = document.value ? locateBlock(document.value, id) : null
  if (!found) return
  const target = found.index + delta
  if (target < 0 || target >= found.list.length) return
  mutate(() => { const [node] = found.list.splice(found.index, 1); found.list.splice(target, 0, node) })
}
function toggleDisabled(node: BlockNode) { mutate(() => { node.disabled = !node.disabled }) }
// 26.45: block breakpoints (stored in the blocks document; the debugger stops where the block's code starts).
function toggleBreakpoint(node: BlockNode) { mutate(() => { if (node.breakpoint) delete node.breakpoint; else node.breakpoint = true }) }
const pausedBlockId = computed(() => {
  const frame = scriptDebugState.callStack[0], uuid = activeUuid.value
  if (!scriptDebugState.paused || !frame || !uuid || frame.scriptUuid !== uuid) return ''
  const source = readTextAsset(uuid)
  if (!source) return ''
  for (const [id, line] of blockSourceLines(source)) if (line === frame.line) return id
  return ''
})
function addCondition(node: BlockNode) { mutate(() => { node.conditions = [...(node.conditions ?? []), createCondition('compare')] }) }
function removeCondition(node: BlockNode, condition: BlockCondition) { mutate(() => { node.conditions = (node.conditions ?? []).filter(item => item.id !== condition.id) }) }
function select(node: BlockNode, key: string, index: number) { selectedId.value = node.id; cursor.value = { key, index: index + 1 } }
function setCursor(key: string, index: number) { cursor.value = { key, index }; selectedId.value = '' }
function addVariable() {
  mutate(() => {
    const names = new Set(document.value!.variables.map(variable => variable.name))
    let index = 1; while (names.has(`value${index}`)) index++
    document.value!.variables.push({ name: `value${index}`, initial: '0' })
  })
}
/** Renames a variable and its uses (variable fields, {name} in text, the name in value fields). */
function renameVariable(index: number, raw: string) {
  const documentValue = document.value!, variable = documentValue.variables[index], name = raw.trim()
  if (!variable || name === variable.name) return
  if (!validIdentifier(name) || documentValue.variables.some((item, other) => other !== index && item.name === name)) { addEditorLog(`Blocks: “${name}” is not a free variable name`, 'Script', 'warning'); return }
  const old = variable.name, word = new RegExp(`\\b${old}\\b`, 'g')
  mutate(() => {
    variable.name = name
    const visit = (fields: Record<string, string | boolean>, kinds: Record<string, string>) => { for (const [key, value] of Object.entries(fields)) if (typeof value === 'string') { const kind = kinds[key]; if (kind === 'variable' && value === old) fields[key] = name; else if (kind === 'text') fields[key] = value.split(`{${old}}`).join(`{${name}}`); else if (kind === 'number' || kind === 'code') fields[key] = value.replace(word, name) } }
    for (const list of blockLists(documentValue).values()) for (const node of list) {
      visit(node.fields, Object.fromEntries((statementSpec(node.type)?.fields ?? []).map(field => [field.key, field.kind])))
      for (const condition of node.conditions ?? []) visit(condition.fields, { a: 'number', b: 'number', percent: 'number', code: 'code' })
    }
  })
}
function reveal(id: string) {
  const element = root.value?.querySelector(`[data-block-id="${id}"], [data-handler-id="${id}"]`) as HTMLElement | null
  element?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  if (element?.dataset.blockId) selectedId.value = id
}

// ---- pointer drag (mouse, pen and touch) ------------------------------------------------------
function hitTest(x: number, y: number, payload: BlockDragPayload): BlockPosition | null {
  const element = window.document.elementFromPoint(x, y) as HTMLElement | null
  if (!element || !root.value?.contains(element)) return null
  if (payload.kind === 'move' && element.closest(`[data-block-id="${payload.id}"]`)) return null
  const slot = element.closest('[data-slot]') as HTMLElement | null
  if (slot?.dataset.listKey) return { key: slot.dataset.listKey, index: Number(slot.dataset.index) }
  const row = element.closest('.block-row') as HTMLElement | null
  if (row?.dataset.listKey) {
    const face = (row.querySelector(':scope > .block-face') as HTMLElement | null)?.getBoundingClientRect() ?? row.getBoundingClientRect()
    return { key: row.dataset.listKey, index: Number(row.dataset.index) + (y > face.top + face.height / 2 ? 1 : 0) }
  }
  const hat = element.closest('[data-handler-id]') as HTMLElement | null
  if (hat?.dataset.handlerId) return { key: `${hat.dataset.handlerId}:blocks`, index: 0 }
  return null
}
function startDrag(event: PointerEvent, payload: BlockDragPayload) {
  if (event.button !== 0 || !document.value) return
  const startX = event.clientX, startY = event.clientY
  let moved = false
  const spec = statementSpec(payload.kind === 'new' ? payload.type : locateBlock(document.value, payload.id)?.list.find(node => node.id === payload.id)?.type ?? '')
  const color = BLOCK_CATEGORY_COLORS[spec?.category ?? 'control']
  const label = plainLabel(copy.value.statements[spec?.type ?? ''])
  const onMove = (move: PointerEvent) => {
    if (!moved && Math.hypot(move.clientX - startX, move.clientY - startY) < 6) return
    if (!moved) { moved = true; draggingId.value = payload.kind === 'move' ? payload.id : '' }
    move.preventDefault()
    ghost.value = { x: move.clientX + 12, y: move.clientY + 8, label, fill: color.fill, ink: color.ink }
    drop.value = hitTest(move.clientX, move.clientY, payload)
    const area = canvas.value?.getBoundingClientRect()
    if (area && canvas.value) { if (move.clientY < area.top + 40) canvas.value.scrollTop -= 12; else if (move.clientY > area.bottom - 40) canvas.value.scrollTop += 12 }
  }
  const finish = (cancelled: boolean) => {
    window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onCancel)
    const target = drop.value
    drop.value = null; draggingId.value = ''; ghost.value = null
    if (cancelled) return
    if (!moved) { if (payload.kind === 'new') insert(payload.type); return }
    if (!target) return
    if (payload.kind === 'new') insert(payload.type, target)
    else mutate(() => { moveBlock(document.value!, payload.id, target.key, target.index); selectedId.value = payload.id })
  }
  const onUp = () => finish(false), onCancel = () => finish(true)
  window.addEventListener('pointermove', onMove, { passive: false }); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onCancel)
  if (payload.kind === 'move') event.preventDefault()
}

function onKeydown(event: KeyboardEvent) {
  const typing = (event.target as HTMLElement | null)?.closest('input, select, textarea')
  const command = event.ctrlKey || event.metaKey
  if (command && event.key.toLowerCase() === 's') { event.preventDefault(); saveNow(); return }
  if (typing) return
  if (command && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return }
  if (command && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return }
  if (!selectedId.value) return
  if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); remove(selectedId.value) }
  else if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) { event.preventDefault(); moveRelative(selectedId.value, event.key === 'ArrowUp' ? -1 : 1) }
  else if (command && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicate(selectedId.value) }
  else if (event.key === 'Escape') selectedId.value = ''
}

const context: BlockEditorContext = { copy, options, valueListId, objectListId, selectedId, cursor, drop, draggingId, diagnostics, problemText, mutate, select, setCursor, startDrag, remove, duplicate, moveRelative, toggleDisabled, toggleBreakpoint, pausedBlockId, addCondition, removeCondition }
provide(BLOCK_EDITOR, context)
defineExpose({ save: saveNow })
</script>
