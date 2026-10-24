<!-- 场景层级侧栏：搜索、选择和编辑实体层级，并维护资源关联。 -->
<template>
  <aside class="sidebar-container" :style="{ width: isCollapsed ? `${44 * preferencesState.uiScale}px` : `${panelWidth}px` }" :class="[dock, { 'jelly-slide': !isDragging, 'no-transition': isDragging, 'panel-maximized': workspaceState.maximizedPanel==='hierarchy' }]">
    <UiButton v-if="isCollapsed" class="expand" icon="forward" :label="t('expandPanel')" @click="expandPanel" />
    <!-- 26.44 G1: the workspace context tools (formerly a separate rail) live at the top of this panel;
         collapsed, the panel is the rail. -->
    <nav v-if="contextTools" class="context-tools" :class="{ vertical: isCollapsed }" data-control-scope="context-rail" :aria-label="t('contextTools')">
      <UiButton v-for="item in contextActions" :key="item.id" :icon="item.icon" :label="`${t(item.label)} · ${t(item.hint)}`" :title="`${t(item.label)} · ${t(item.hint)}`" :class="{ active: item.active }" :aria-pressed="item.active" @click="item.run" />
      <UiButton class="create" icon="add" :label="t('createObject')" :title="t('createObject')" :disabled="!canEdit" @click="editorState.createObjectPaletteOpen = true" />
    </nav>
    <div v-show="!isCollapsed" class="scene-sidebar">
      <section class="scene-manager">
        <UiPanelHeader :title="t('scenes')">
          <template #actions>
            <PanelMaximizeButton panel="hierarchy" />
            <UiButton class="scene-direct-action" :label="t('reloadScene')" :disabled="!canEdit" @click="reloadScene" icon="refresh" />
            <UiButton class="scene-direct-action" :label="t('addScene')" :disabled="!canEdit" @click="addScene" icon="add" />
            <UiButton class="compact-action scene-overflow" icon="more" :label="sidebarMenuLabels.scene" aria-haspopup="menu" :aria-expanded="sidebarMenu?.kind === 'scene'" @click.stop="openSidebarMenu($event, 'scene')" />
          </template>
        </UiPanelHeader>
        <div class="scene-list">
          <div v-for="scene in sceneManager.scenes" :key="scene.uuid" class="scene-item" :class="{ active: scene.uuid === sceneManager.activeSceneUuid, unloaded: !scene.loaded }">
            <div class="scene-main" role="button" tabindex="0" @click="activateScene(scene.uuid, scene.loaded)" @keyup.enter="activateScene(scene.uuid, scene.loaded)">
              <i></i><span v-if="editingSceneUuid !== scene.uuid" @dblclick.stop="startSceneEdit(scene.uuid, scene.name)">{{ scene.name }}</span>
              <input v-else v-model="sceneName" v-focus @click.stop @blur="finishSceneEdit(scene.uuid)" @keyup.enter="finishSceneEdit(scene.uuid)">
            </div>
            <button v-if="scene.uuid !== sceneManager.activeSceneUuid" class="load-toggle" :title="scene.loaded ? t('unloadScene') : t('loadScene')" :disabled="!canEdit" @click="toggleLoaded(scene.uuid, scene.loaded)"><EditorIcon :name="scene.loaded ? 'check' : 'add'" /></button>
          </div>
        </div>
      </section>

      <div class="hierarchy-header">
        <div><span class="hierarchy-title" :title="t('hierarchy')">{{ t('hierarchy') }}</span><span class="hierarchy-actions"><small>{{ state.world.entities.length }}</small><UiButton class="hierarchy-direct-action" :label="t('previousSelection')" :disabled="selectionHistoryIndex <= 0" @click="navigateSelection(-1)" icon="back" /><UiButton class="hierarchy-direct-action" :label="t('nextSelection')" :disabled="selectionHistoryIndex >= selectionHistory.length - 1" @click="navigateSelection(1)" icon="forward" /><UiButton class="hierarchy-direct-action" :label="t('createObject')" :disabled="!canEdit" @click="editorState.createObjectPaletteOpen = true" icon="add" /><UiButton class="compact-action hierarchy-overflow" icon="more" :label="sidebarMenuLabels.hierarchy" aria-haspopup="menu" :aria-expanded="sidebarMenu?.kind === 'hierarchy'" @click.stop="openSidebarMenu($event, 'hierarchy')" /></span></div>
        <div class="hierarchy-search-row"><label class="search"><EditorIcon name="search" /><input v-model="searchQuery" type="search" :aria-label="t('searchEntities')" :placeholder="t('searchEntities')"></label><details data-ui-motion-popover class="hierarchy-filter-menu"><summary :title="t('selectionFilter')" :aria-label="t('selectionFilter')"><EditorIcon name="filter" /></summary>
        <div class="hierarchy-filters"><select class="hierarchy-filter-wide" v-model="authoringState.selectionFilter" :aria-label="t('selectionFilter')"><option v-for="filter in selectionFilters" :key="filter" :value="filter">{{ t(`selection${filter}`) }}</option></select><select class="hierarchy-filter-wide" v-model="authoringState.tagFilter" :aria-label="t('tagFilter')"><option value="">{{ t('allTags') }}</option><option v-for="tag in availableTags" :key="tag" :value="tag"># {{ tag }}</option></select><select v-model="selectedSavedFilter" :aria-label="t('savedFilters')" @change="applySavedFilter"><option value="">{{ t('savedFilters') }}</option><option v-for="filter in authoringState.savedFilters" :key="filter.id" :value="filter.id">{{ filter.name }}</option></select><UiButton :label="t('saveFilter')" @click="saveCurrentFilter" icon="star" /><UiButton :class="{ active: authoringState.performanceMode }" :label="t('viewportPerformanceMode')" @click="authoringState.performanceMode = !authoringState.performanceMode" icon="bolt" /></div></details></div>
      </div>


      <div ref="entityList" class="entity-list" @scroll="onHierarchyScroll" @dragover="previewRootDrop" @drop="dropOnRoot($event)">
        <div class="hierarchy-rows" :style="{ paddingTop: `${virtualPaddingTop}px`, paddingBottom: `${virtualPaddingBottom}px` }">
        <UiTreeRow
          v-for="row in virtualHierarchyRows"
          :depth="row.depth" :selected="state.selectedEntityIds.includes(row.entity.id)"
          :key="row.entity.uuid"
          class="entity-item"
          :class="{
            selected: state.selectedEntityIds.includes(row.entity.id),
            primary: state.selectedEntityId === row.entity.id,
            disabled: !row.entity.enabled,
            hidden: !row.entity.editorVisible,
            locked: row.entity.editorLocked,
            pinned: authoringState.pinnedEntityUuids.includes(row.entity.uuid),
            'search-match': matchesHierarchySearch(row.entity),
            'drop-target': dropTargetUuid === row.entity.uuid && dropValidity !== 'invalid'
          }"
          :data-ui-drop="dropTargetUuid === row.entity.uuid ? dropValidity : undefined"
          :style="{ height: `${hierarchyRowHeight}px` }"
          :draggable="canEdit && !row.entity.editorLocked"
          @click="selectEntity($event, row.entity)"
          @contextmenu.prevent="openContextMenu($event, 'sidebar-entity', row.entity.id)"
          @dragstart="startEntityDrag($event, row.entity)"
          @dragend="finishEntityDrag"
          @dragenter.stop="previewEntityDrop($event, row.entity)"
          @dragleave.stop="leaveDropTarget($event, row.entity.uuid)"
          @dragover.stop="previewEntityDrop($event, row.entity)"
          @drop.prevent.stop="dropOnEntity($event, row.entity)"
        >
          <button class="disclosure" :class="{ placeholder: !row.hasChildren }" :aria-expanded="row.hasChildren ? row.expanded : undefined" :aria-label="row.expanded ? t('collapsePanel') : t('expandPanel')" @click.stop="toggleExpanded(row.entity.uuid)"><EditorIcon v-if="row.hasChildren" name="down" data-ui-motion-chevron /></button>
          <EditorIcon class="shape-icon" :name="entityIcon(row.entity)" />
          <button v-if="editingId !== row.entity.id" type="button" class="name" :aria-pressed="state.selectedEntityIds.includes(row.entity.id)" @click.stop="selectEntity($event, row.entity)" :title="`${row.entity.name} (${row.entity.id}) — ${t('renameHint')}`" @dblclick.stop="startEdit(row.entity)"><span class="entity-name"><mark v-if="searchQuery && row.entity.name.toLocaleLowerCase().includes(searchQuery.toLocaleLowerCase())">{{ row.entity.name }}</mark><template v-else>{{ row.entity.name }}</template></span><small>{{ row.entity.id }}</small></button>
          <input v-else v-model="editName" v-focus class="edit-input" @click.stop @blur="finishEdit(row.entity)" @keyup.enter="finishEdit(row.entity)" @keyup.escape="cancelEdit">
          <span v-if="row.entity.prefabAsset" class="status-mark" :title="t('prefabInstance')">P</span><span v-if="row.entity.sceneLayers.length" class="status-mark scene" :title="t('sceneInstance')">S</span><span v-if="Object.keys(row.entity.prefabOverrides).length" class="status-mark override" :title="t('prefabOverrides')"><EditorIcon name="circle" /></span>
          <UiButton class="state-button pin" :class="{ active: authoringState.pinnedEntityUuids.includes(row.entity.uuid) }" :label="t('pinEntity')" @click.stop="toggleHierarchyPin(row.entity.uuid)" icon="pin" />
          <button class="state-button" :disabled="!canEdit" :title="row.entity.editorVisible ? t('hideEntity') : t('showEntity')" @click.stop="toggleVisibility(row.entity)"><EditorIcon :name="row.entity.editorVisible ? 'visible' : 'hidden'" /></button>
          <button class="state-button" :disabled="!canEdit" :title="row.entity.editorLocked ? t('unlockEntity') : t('lockEntity')" @click.stop="toggleLock(row.entity)"><EditorIcon :name="row.entity.editorLocked ? 'lock' : 'unlock'" /></button>
          <button class="state-button power" :disabled="!canEdit" :title="row.entity.enabled ? t('disableEntity') : t('enableEntity')" @click.stop="toggleEnabled(row.entity)"><EditorIcon name="power" /></button>
          <UiButton class="compact-action row-overflow" icon="more" :label="`${sidebarMenuLabels.entity}: ${row.entity.name}`" aria-haspopup="menu" :aria-expanded="sidebarMenu?.kind === 'entity' && sidebarMenu.entityUuid === row.entity.uuid" @click.stop="openSidebarMenu($event, 'entity', row.entity)" />
        </UiTreeRow>
        </div>
        <p v-if="!hierarchyRows.length" class="empty-state">{{ t('noEntitiesFound') }}</p>
        <button v-if="draggingIds.length" class="root-drop" data-ui-drop="valid" @dragover="previewRootDrop" @drop.prevent.stop="dropOnRoot($event)">{{ t('reparentToRoot') }}</button>
      </div>
      <!-- Path bar: a fixed footer, so selecting a nested object never shifts the list under the pointer. -->
      <nav class="breadcrumbs" :aria-label="t('hierarchyBreadcrumb')"><span class="crumb-root">{{ sceneManager.activeScene.name }}</span><button v-for="entity in breadcrumbs" :key="entity.uuid" :title="entity.name" @click="selectBreadcrumb(entity)"><EditorIcon name="forward" /><span>{{ entity.name }}</span></button></nav>
    </div>
    <Teleport to="body"><div ref="sidebarMenuRoot" class="sidebar-action-menu" :inert="!sidebarMenu" :aria-hidden="!sidebarMenu" :style="{ left: `${sidebarMenuPosition.x}px`, top: `${sidebarMenuPosition.y}px`, pointerEvents: sidebarMenu ? 'auto' : 'none' }" @click.stop @contextmenu.prevent>
      <UiMenu :open="Boolean(sidebarMenu)" @close="closeSidebarMenu()">
        <template v-if="sidebarMenu?.kind === 'scene'">
          <UiButton class="scene-menu-reload" icon="refresh" :disabled="!canEdit" @click="runSidebarAction('reloadScene')">{{ t('reloadScene') }}</UiButton>
          <UiButton class="scene-menu-add" icon="add" :disabled="!canEdit" @click="runSidebarAction('addScene')">{{ t('addScene') }}</UiButton>
        </template>
        <template v-else-if="sidebarMenu?.kind === 'hierarchy'">
          <UiButton class="hierarchy-menu-previous" icon="back" :disabled="selectionHistoryIndex <= 0" @click="runSidebarAction('previous')">{{ t('previousSelection') }}</UiButton>
          <UiButton class="hierarchy-menu-next" icon="forward" :disabled="selectionHistoryIndex >= selectionHistory.length - 1" @click="runSidebarAction('next')">{{ t('nextSelection') }}</UiButton>
          <UiButton class="hierarchy-menu-create" icon="add" :disabled="!canEdit" @click="runSidebarAction('create')">{{ t('createObject') }}</UiButton>
        </template>
        <template v-else-if="sidebarMenuEntity">
          <strong class="sidebar-menu-title">{{ sidebarMenuEntity.name }}</strong>
          <small>{{ sidebarMenuEntity.id }} · {{ sidebarMenuEntity.shapeType }}</small>
          <p v-if="sidebarMenuEntity.prefabAsset || sidebarMenuEntity.sceneLayers.length || Object.keys(sidebarMenuEntity.prefabOverrides).length" class="sidebar-menu-status"><span v-if="sidebarMenuEntity.prefabAsset">{{ t('prefabInstance') }}</span><span v-if="sidebarMenuEntity.sceneLayers.length">{{ t('sceneInstance') }}</span><span v-if="Object.keys(sidebarMenuEntity.prefabOverrides).length">{{ t('prefabOverrides') }}</span></p>
          <UiButton class="row-menu-pin" icon="pin" @click="runSidebarAction('pin')">{{ authoringState.pinnedEntityUuids.includes(sidebarMenuEntity.uuid) ? sidebarMenuLabels.unpin : t('pinEntity') }}</UiButton>
          <UiButton class="row-menu-visibility" :icon="sidebarMenuEntity.editorVisible ? 'visible' : 'hidden'" :disabled="!canEdit" @click="runSidebarAction('visibility')">{{ sidebarMenuEntity.editorVisible ? t('hideEntity') : t('showEntity') }}</UiButton>
          <UiButton class="row-menu-lock" :icon="sidebarMenuEntity.editorLocked ? 'lock' : 'unlock'" :disabled="!canEdit" @click="runSidebarAction('lock')">{{ sidebarMenuEntity.editorLocked ? t('unlockEntity') : t('lockEntity') }}</UiButton>
          <UiButton class="row-menu-enabled" icon="power" :disabled="!canEdit" @click="runSidebarAction('enabled')">{{ sidebarMenuEntity.enabled ? t('disableEntity') : t('enableEntity') }}</UiButton>
        </template>
      </UiMenu>
    </div></Teleport>
    <PanelResizeHandle v-show="!isCollapsed" v-model="panelWidth" orientation="vertical" :minimum="0" :maximum="500" :reset-value="264" :reverse="dock==='right'" :label="t('hierarchy')" :disabled="workspaceState.maximizedPanel==='hierarchy'" @dragging="isDragging=$event" @commit="commitPanelWidth" />
  </aside>
</template>

<script setup lang="ts">
import UiButton from '../ui/components/UiButton.vue'
import UiMenu from '../ui/components/UiMenu.vue'
import UiTreeRow from '../ui/components/UiTreeRow.vue'
import UiPanelHeader from '../ui/components/UiPanelHeader.vue'
import EditorIcon, { type EditorIconName } from './EditorIcon.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { t } from '../i18n'
import { preferencesState } from '../store/preferences'
import { recoveryState } from '../runtime/recovery'
import { addEditorLog, closeContextMenu, editorState, openContextMenu, setActiveLayer } from '../store/editor'
import { createScene, physicsState as state, pushHistory, reloadActiveScene, sceneManager, selectEntities, setActiveScene, setSceneLoaded, synchronizeHistoryBaseline } from '../store/physics'
import type { Entity } from '../world/Entity'
import { setParent, wouldCreateParentCycle } from '../world/hierarchy'
import { animateReorder, beginNativeDrag, cancelMotion, captureRects, endNativeDrag } from '../ui/motion'
import { selectionRoots } from '../editor/selection'
import { authoringState, saveHierarchyFilter, toggleHierarchyPin } from '../editor/authoring2d'
import { workspaceState } from '../editor/workspaces'
import PanelMaximizeButton from './PanelMaximizeButton.vue'
import PanelResizeHandle from './PanelResizeHandle.vue'
import { useContextActions } from '../editor/contextActions'

const props = withDefaults(defineProps<{ dock?: 'left' | 'right'; contextTools?: boolean }>(), { dock: 'left', contextTools: false })
const contextActions = useContextActions()
const dock = computed(/* 返回 props.dock 的当前值。 */ () => props.dock)
const panelWidth = ref(editorState.hierarchyWidth)
watch(/* 返回 editorState.hierarchyWidth 的当前值。 */ () => editorState.hierarchyWidth, /** 非拖拽期间同步外部面板宽度并展开侧栏。 */ value => { if (!isDragging.value) { panelWidth.value=value;isCollapsed.value=false } })
watch(/* 返回 workspaceState.maximizedPanel 的当前值。 */ () => workspaceState.maximizedPanel, /** 最大化目标为层级时展开侧栏。 */ value => { if(value==='hierarchy')isCollapsed.value=false })
const isCollapsed = ref(false)
const isDragging = ref(false)
const editingId = ref<number | null>(null)
const editName = ref('')
const editingSceneUuid = ref<string | null>(null)
const sceneName = ref('')
const searchQuery = ref('')
const expandedUuids = ref(new Set<string>())
const draggingIds = ref<number[]>([])
const dropTargetUuid = ref<string | null>(null)
const dropValidity = ref<'valid' | 'before' | 'invalid'>('valid')
const selectedSavedFilter = ref('')
const selectionHistory = ref<Array<{ sceneUuid: string; uuids: string[]; primaryUuid: string | null }>>([])
const selectionHistoryIndex = ref(-1)
type SidebarMenuKind = 'scene' | 'hierarchy' | 'entity'
const sidebarMenu = ref<{ kind: SidebarMenuKind; entityUuid?: string } | null>(null)
const sidebarMenuRoot = ref<HTMLElement | null>(null)
const sidebarMenuPosition = ref({ x: 0, y: 0 })
let sidebarMenuTrigger: HTMLElement | null = null
const sidebarMenuLabels = computed(() => ({
  en: { scene: 'Scene actions', hierarchy: 'Hierarchy actions', entity: 'Object actions', unpin: 'Unpin object' },
  de: { scene: 'Szenenaktionen', hierarchy: 'Hierarchieaktionen', entity: 'Objektaktionen', unpin: 'Objekt lösen' },
  zh: { scene: '场景操作', hierarchy: '层级操作', entity: '对象操作', unpin: '取消固定对象' }
}[preferencesState.locale]))
const sidebarMenuEntity = computed(() => sidebarMenu.value?.kind === 'entity' ? state.world.entities.find(entity => entity.uuid === sidebarMenu.value?.entityUuid) ?? null : null)
watch(sidebarMenuEntity, entity => { if (sidebarMenu.value?.kind === 'entity' && !entity) closeSidebarMenu(false) })
/** Narrow-host overflow uses the shared menu and current commands without changing selection. */
async function openSidebarMenu(event: MouseEvent, kind: SidebarMenuKind, entity?: Entity) {
  const trigger = event.currentTarget as HTMLElement
  if (sidebarMenu.value && sidebarMenuTrigger === trigger) { closeSidebarMenu(); return }
  closeContextMenu()
  sidebarMenuTrigger = trigger
  const anchor = trigger.getBoundingClientRect()
  sidebarMenuPosition.value = { x: anchor.left, y: anchor.bottom }
  sidebarMenu.value = { kind, entityUuid: entity?.uuid }
  await nextTick()
  if (!sidebarMenu.value || sidebarMenuTrigger !== trigger) return
  const size = sidebarMenuRoot.value?.getBoundingClientRect()
  if (!size) return
  const inset = Number.parseFloat(getComputedStyle(trigger).getPropertyValue('--ui-space-sm')) || 0
  sidebarMenuPosition.value = { x: Math.max(inset, Math.min(anchor.left, window.innerWidth - size.width - inset)), y: Math.max(inset, Math.min(anchor.bottom, window.innerHeight - size.height - inset)) }
}
function closeSidebarMenu(restoreFocus = true) {
  const trigger = sidebarMenuTrigger
  sidebarMenu.value = null
  sidebarMenuTrigger = null
  if (restoreFocus && trigger?.isConnected) trigger.focus({ preventScroll: true })
}
function dismissSidebarMenu(event: PointerEvent) {
  if (sidebarMenu.value && !sidebarMenuRoot.value?.contains(event.target as Node) && !sidebarMenuTrigger?.contains(event.target as Node)) closeSidebarMenu(false)
}
function leaveSidebarMenu(event: KeyboardEvent) { if (event.key === 'Tab' && sidebarMenu.value) closeSidebarMenu(false) }
function resizeSidebarMenu() { closeSidebarMenu(false) }
function runSidebarAction(action: 'reloadScene' | 'addScene' | 'previous' | 'next' | 'create' | 'pin' | 'visibility' | 'lock' | 'enabled') {
  const entity = sidebarMenuEntity.value
  if (action === 'reloadScene') reloadScene()
  else if (action === 'addScene') addScene()
  else if (action === 'previous') navigateSelection(-1)
  else if (action === 'next') navigateSelection(1)
  else if (action === 'create') { if (canEdit.value) editorState.createObjectPaletteOpen = true }
  else if (entity) {
    if (action === 'pin') toggleHierarchyPin(entity.uuid)
    else if (action === 'visibility') toggleVisibility(entity)
    else if (action === 'lock') toggleLock(entity)
    else if (action === 'enabled') toggleEnabled(entity)
  }
  closeSidebarMenu()
}
// Teleported actions belong to this panel and cannot outlive a hidden or moved anchor.
watch(() => [sceneManager.activeSceneUuid, state.playMode, editorState.currentPage, editorState.activeWorkspace, editorState.hierarchyVisible, editorState.distractionFree, workspaceState.maximizedPanel, workspaceState.floatingPanels.join(','), preferencesState.uiScale, preferencesState.locale, recoveryState.readOnly, isCollapsed.value, panelWidth.value, dock.value], () => closeSidebarMenu(false))
const entityList = ref<HTMLElement | null>(null)
const hierarchyScrollTop = ref(0)
const hierarchyViewportHeight = ref(400)
const hierarchyRowHeight = computed(/* 与共享行高令牌一致（标准 28 / 紧凑 24）；缩放一次并保留小数，避免累计漂移。 */ () => (preferencesState.compactMode ? 24 : 28) * preferencesState.uiScale), hierarchyOverscan = 12
let hierarchyResizeObserver: ResizeObserver | null = null
let lastSelectedId: number | null = null
let applyingSelectionHistory = false
const canEdit = computed(/* 比较 state.playMode 与 'editing'，返回严格相等的判断结果。 */ () => state.playMode === 'editing' && !recoveryState.readOnly)
const selectionFilters = ['All', 'Visible', 'Unlocked', 'Sprites', 'Cameras', 'Physics'] as const
const availableTags = computed(/** 收集所有实体标签，去重并按本地顺序排序。 */ () => [...new Set(state.world.entities.flatMap(/* 返回 entity.tags 的当前值。 */ entity => entity.tags))].sort(/* 调用 left.localeCompare(right) 并返回调用结果。 */ (left, right) => left.localeCompare(right)))
const vFocus = { mounted: /** 重命名输入挂载后聚焦并全选文本。 */ (element: HTMLInputElement) => { element.focus(); element.select() } }

const hierarchyRows = computed(/** 建立父子映射及置顶排序，按搜索与过滤保留匹配祖先，防循环遍历生成层级行。 */ () => {
  const rows: Array<{ entity: Entity; depth: number; hasChildren: boolean; expanded: boolean }> = []
  const children = new Map<string | null, Entity[]>()
  const byUuid = new Map(state.world.entities.map(/* 返回按声明顺序构造的数组 [entity.uuid, entity]。 */ entity => [entity.uuid, entity]))
  const known = new Set(byUuid.keys())
  for (const entity of state.world.entities) {
    const parent = entity.parentUuid && known.has(entity.parentUuid) ? entity.parentUuid : null
    const siblings = children.get(parent) ?? []
    siblings.push(entity)
    children.set(parent, siblings)
  }
  for (const siblings of children.values()) siblings.sort(/** 把置顶实体排列在同级其他实体之前。 */ (left, right) => Number(authoringState.pinnedEntityUuids.includes(right.uuid)) - Number(authoringState.pinnedEntityUuids.includes(left.uuid)))

  const query = searchQuery.value.trim().toLocaleLowerCase()
  const included = new Set<string>()
  if (query) {
    for (const entity of state.world.entities) {
      const components = entity.components.map(/* 返回 component.kind 的当前值。 */ component => component.kind).join(' ')
      if (!`${entity.name} ${entity.id} ${entity.tags.join(' ')} ${components}`.toLocaleLowerCase().includes(query)) continue
      included.add(entity.uuid)
      let parentUuid = entity.parentUuid
      while (parentUuid) {
        included.add(parentUuid)
        parentUuid = byUuid.get(parentUuid)?.parentUuid ?? null
      }
    }
  }

  const filter = authoringState.selectionFilter
  const tagFilter = authoringState.tagFilter
  const filterIncluded = new Set<string>()
  if (filter !== 'All' || tagFilter) {
    const matchesFilter = /** 按可见、未锁、精灵、相机或物理筛选条件及标签判断实体是否匹配。 */ (entity: Entity) => (filter === 'Visible' ? entity.editorVisible : filter === 'Unlocked' ? !entity.editorLocked : filter === 'Sprites' ? Boolean(entity.spriteRenderer) : filter === 'Cameras' ? Boolean(entity.camera2D) : filter === 'Physics' ? entity.hasComponent('RigidBody2D') : true) && (!tagFilter || entity.tags.includes(tagFilter))
    for (const entity of state.world.entities) {
      if (!matchesFilter(entity)) continue
      filterIncluded.add(entity.uuid)
      let parentUuid = entity.parentUuid
      while (parentUuid) {
        filterIncluded.add(parentUuid)
        parentUuid = byUuid.get(parentUuid)?.parentUuid ?? null
      }
    }
  }

  const visit = /** 跳过访问过或被过滤实体，添加当前层级行并在展开时递归子实体。 */ (entity: Entity, depth: number, visited: Set<string>) => {
    if (visited.has(entity.uuid) || ((filter !== 'All' || tagFilter) && !filterIncluded.has(entity.uuid)) || (query && !included.has(entity.uuid))) return
    visited.add(entity.uuid)
    const entityChildren = children.get(entity.uuid) ?? []
    const expanded = query ? true : expandedUuids.value.has(entity.uuid)
    rows.push({ entity, depth, hasChildren: entityChildren.length > 0, expanded })
    if (expanded) for (const child of entityChildren) visit(child, depth + 1, visited)
  }
  const visited = new Set<string>()
  for (const root of children.get(null) ?? []) visit(root, 0, visited)
  // Only objects no root reaches (a parent cycle) are listed at the top level as well; children of a
  // collapsed object stay hidden under it (26.47: they were listed at the top level before).
  const reachable = new Set<string>(), pending = [...(children.get(null) ?? [])]
  while (pending.length) { const entity = pending.pop()!; if (reachable.has(entity.uuid)) continue; reachable.add(entity.uuid); pending.push(...(children.get(entity.uuid) ?? [])) }
  for (const entity of state.world.entities) if (!reachable.has(entity.uuid)) visit(entity, 0, visited)
  return rows
})
const hierarchyContentInset = computed(() => (preferencesState.compactMode ? 2 : 4) * preferencesState.uiScale)
const virtualStart = computed(() => Math.min(hierarchyRows.value.length, Math.max(0, Math.floor((hierarchyScrollTop.value - hierarchyContentInset.value) / hierarchyRowHeight.value) - hierarchyOverscan)))
const virtualEnd = computed(() => Math.max(virtualStart.value, Math.min(hierarchyRows.value.length, Math.ceil((hierarchyScrollTop.value + hierarchyViewportHeight.value - hierarchyContentInset.value) / hierarchyRowHeight.value) + hierarchyOverscan)))
const virtualHierarchyRows = computed(/* 调用 hierarchyRows.value.slice(virtualStart.value, virtualEnd.value) 并返回调用结果。 */ () => hierarchyRows.value.slice(virtualStart.value, virtualEnd.value))
const virtualPaddingTop = computed(() => virtualStart.value * hierarchyRowHeight.value + hierarchyContentInset.value)
const virtualPaddingBottom = computed(() => (hierarchyRows.value.length - virtualEnd.value) * hierarchyRowHeight.value + hierarchyContentInset.value)
/** 记录层级列表滚动位置。 */ function onHierarchyScroll(event: Event) { hierarchyScrollTop.value = (event.currentTarget as HTMLElement).scrollTop }
/** 根据名称、编号、标签和组件种类匹配非空搜索词。 */ function matchesHierarchySearch(entity: Entity) { const query = searchQuery.value.trim().toLocaleLowerCase(); if (!query) return false; return `${entity.name} ${entity.id} ${entity.tags.join(' ')} ${entity.components.map(/* 返回 component.kind 的当前值。 */ component => component.kind).join(' ')}`.toLocaleLowerCase().includes(query) }
/** 载入已保存的查询、标签和选择类型过滤设置。 */ function applySavedFilter() { const filter = authoringState.savedFilters.find(/* 比较 candidate.id 与 selectedSavedFilter.value，返回严格相等的判断结果。 */ candidate => candidate.id === selectedSavedFilter.value); if (!filter) return; searchQuery.value = filter.query; authoringState.tagFilter = filter.tagFilter; authoringState.selectionFilter = filter.selectionFilter }
/** 保存当前层级过滤条件并选中新过滤项。 */ function saveCurrentFilter() { selectedSavedFilter.value = saveHierarchyFilter(searchQuery.value || t(`selection${authoringState.selectionFilter}`), searchQuery.value) }
const breadcrumbs = computed(/** 从选中实体沿父级向上构建面包屑，防止父级循环。 */ () => {
  const selected = state.world.entities.find(/* 比较 entity.id 与 state.selectedEntityId，返回严格相等的判断结果。 */ entity => entity.id === state.selectedEntityId)
  if (!selected) return []
  const path: Entity[] = [selected], visited = new Set([selected.uuid])
  let parentUuid = selected.parentUuid
  while (parentUuid && !visited.has(parentUuid)) { const parent = state.world.entities.find(/* 比较 entity.uuid 与 parentUuid，返回严格相等的判断结果。 */ entity => entity.uuid === parentUuid); if (!parent) break; path.unshift(parent); visited.add(parent.uuid); parentUuid = parent.parentUuid }
  return path
})
/** 选择面包屑对应实体。 */ function selectBreadcrumb(entity: Entity) { selectEntities([entity.id], 'replace', entity.id) }
/** 仅在同一场景恢复历史选择，解析实体标识后临时禁止重复记录历史。 */ function navigateSelection(offset: -1 | 1) {
  const index = selectionHistoryIndex.value + offset, entry = selectionHistory.value[index]
  if (!entry || entry.sceneUuid !== sceneManager.activeSceneUuid) return
  const ids = entry.uuids.flatMap(/** 把仍存在的实体标识转换为编号，不存在则忽略。 */ uuid => { const entity = state.world.entities.find(/* 比较 candidate.uuid 与 uuid，返回严格相等的判断结果。 */ candidate => candidate.uuid === uuid); return entity ? [entity.id] : [] })
  const primary = entry.primaryUuid ? state.world.entities.find(/* 比较 entity.uuid 与 entry.primaryUuid，返回严格相等的判断结果。 */ entity => entity.uuid === entry.primaryUuid)?.id ?? null : null
  applyingSelectionHistory = true
  selectionHistoryIndex.value = index
  selectEntities(ids, 'replace', primary)
  queueMicrotask(/** 微任务后恢复选择历史记录。 */ () => { applyingSelectionHistory = false })
}

/** 编辑模式创建场景成功后记录历史并提示。 */ function addScene() { if (canEdit.value && createScene()) { pushHistory('Create scene'); editorState.statusText = t('sceneCreated') } }
/** 编辑模式重载当前场景成功后同步历史基线并提示。 */ function reloadScene() {
  if (canEdit.value && reloadActiveScene()) {
    synchronizeHistoryBaseline()
    editorState.statusText = t('sceneReloaded')
  }
}
/** 编辑模式按需加载目标场景，激活成功后同步历史基线和状态。 */ function activateScene(uuid: string, loaded: boolean) {
  if (!canEdit.value) return
  if (!loaded && !setSceneLoaded(uuid, true)) return
  if (setActiveScene(uuid)) {
    synchronizeHistoryBaseline()
    editorState.statusText = t('sceneActivated')
  }
}
/** 编辑模式切换场景载入状态，成功记录历史并提示。 */ function toggleLoaded(uuid: string, loaded: boolean) {
  if (canEdit.value && setSceneLoaded(uuid, !loaded)) {
    pushHistory(loaded ? 'Unload scene' : 'Load scene')
    editorState.statusText = t(loaded ? 'sceneUnloaded' : 'sceneLoaded')
  }
}
/** 编辑模式开始指定场景的重命名。 */ function startSceneEdit(uuid: string, name: string) { if (!canEdit.value) return; editingSceneUuid.value = uuid; sceneName.value = name }
/** 结束匹配场景的重命名，清理并限制有效名称长度，变更时记录历史。 */ function finishSceneEdit(uuid: string) { if (editingSceneUuid.value !== uuid) return; const scene = sceneManager.scenes.find(/* 比较 candidate.uuid 与 uuid，返回严格相等的判断结果。 */ candidate => candidate.uuid === uuid); const name = sceneName.value.trim(); if (scene && name && name !== scene.name) { scene.name = name.slice(0, 80); pushHistory('Rename scene') } editingSceneUuid.value = null }
/** 仅对编辑模式下未锁定实体启动重命名。 */ function startEdit(entity: Entity) {
  if (!canEdit.value || entity.editorLocked) return
  const index = hierarchyRows.value.findIndex(row => row.entity.id === entity.id), list = entityList.value
  if (list && index >= 0) {
    const top = hierarchyContentInset.value + index * hierarchyRowHeight.value, bottom = top + hierarchyRowHeight.value
    if (top < list.scrollTop) list.scrollTop = top
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight
    hierarchyScrollTop.value = list.scrollTop
  }
  editingId.value = entity.id; editName.value = entity.name
}
function cancelEdit() { editingId.value = null; editName.value = ''; editorState.renameRequestId = null }
/** 提交有效实体名称并记录资源范围历史，随后清除重命名请求。 */ function finishEdit(entity: Entity) { if (editingId.value !== entity.id) return; const name = editName.value.trim(); if (name && name !== entity.name) { entity.name = name.slice(0, 80); pushHistory('Rename entity', `rename:${entity.uuid}`) } editingId.value = null; editorState.renameRequestId = null }
/* 根据 type === 'Circle' 的真假，分别返回 '○' 或 type === 'Triangle' ? '△' : type === 'Box' ? '□' : '·'。 */ function getIcon(type: string) { return type === 'Circle' ? 'circle' : type === 'Triangle' ? 'triangle' : type === 'Box' ? 'rectangle' : 'node' }
/** The row icon names what the object is: its defining component first, then its authored shape. */
function entityIcon(entity: Entity): EditorIconName {
  const has = (kind: string) => entity.hasComponent(kind as Parameters<Entity['hasComponent']>[0])
  if (has('Camera2D')) return 'camera'
  if (has('TileMap2D')) return 'grid'
  if (has('Light2D')) return 'light'
  if (has('Text') || has('TextRenderer2D')) return 'text'
  if (has('Canvas') || has('RectTransform') || has('Button') || has('Panel')) return 'ui'
  if (has('CharacterBody2D') || has('PlatformController2D') || has('TopDownController2D')) return 'person'
  if (has('SpriteRenderer2D') || has('Image')) return 'image'
  if (has('ParticleEmitter2D')) return 'sparkle'
  if (has('AudioSource')) return 'audio'
  if (has('NavigationRegion2D')) return 'path'
  return getIcon(entity.shapeType) as EditorIconName
}

/** 支持 Shift 范围选择、修饰键切换或替换选择，并同步活动图层。 */ function selectEntity(event: MouseEvent, entity: Entity) {
  if (event.shiftKey && lastSelectedId !== null) {
    const rows = hierarchyRows.value
    const start = rows.findIndex(/* 比较 row.entity.id 与 lastSelectedId，返回严格相等的判断结果。 */ row => row.entity.id === lastSelectedId)
    const end = rows.findIndex(/* 比较 row.entity.id 与 entity.id，返回严格相等的判断结果。 */ row => row.entity.id === entity.id)
    if (start !== -1 && end !== -1) selectEntities(rows.slice(Math.min(start, end), Math.max(start, end) + 1).map(/* 返回 row.entity.id 的当前值。 */ row => row.entity.id), 'add', entity.id)
  } else {
    selectEntities([entity.id], event.ctrlKey || event.metaKey ? 'toggle' : 'replace', entity.id)
  }
  lastSelectedId = entity.id
  if (entity.layer !== editorState.activeLayer) setActiveLayer(entity.layer)
}

/** 复制展开集合后切换目标实体展开状态。 */ function toggleExpanded(uuid: string) { const before = captureRects(hierarchyElements()); const next = new Set(expandedUuids.value); if (next.has(uuid)) next.delete(uuid); else next.add(uuid); expandedUuids.value = next; settleHierarchy(before) }
/** 编辑模式切换实体编辑可见性并记录历史。 */ function toggleVisibility(entity: Entity) { if (!canEdit.value) return; entity.editorVisible = !entity.editorVisible; pushHistory('Toggle editor visibility', `visibility:${entity.uuid}`) }
/** 编辑模式切换实体锁定状态并记录历史。 */ function toggleLock(entity: Entity) { if (!canEdit.value) return; entity.editorLocked = !entity.editorLocked; pushHistory('Toggle editor lock', `lock:${entity.uuid}`) }
/** 编辑模式切换实体运行启用状态并记录历史。 */ function toggleEnabled(entity: Entity) { if (!canEdit.value) return; entity.enabled = !entity.enabled; pushHistory('Toggle entity', `enabled:${entity.uuid}`) }

/** 仅可编辑且未锁实体能开始拖动，确保选中并记录选中根节点及拖拽数据。 */ function startEntityDrag(event: DragEvent, entity: Entity) {
  if (!canEdit.value || entity.editorLocked) { event.preventDefault(); return }
  if (!state.selectedEntityIds.includes(entity.id)) selectEntities([entity.id], 'replace', entity.id)
  draggingIds.value = selectionRoots(state.selectedEntityIds, state.world.entities).map(/* 返回 candidate.id 的当前值。 */ candidate => candidate.id)
  event.dataTransfer?.setData('text/plain', entity.uuid)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  beginNativeDrag(event, entity.name)
}
/** Preview hierarchy drags, rejecting impossible parents before advertising a drop. */
function previewEntityDrop(event: DragEvent, target: Entity) {
  if (!draggingIds.value.length) return
  dropTargetUuid.value = target.uuid
  const parentUuid = event.shiftKey ? target.parentUuid : target.uuid
  const moving = selectionRoots(draggingIds.value, state.world.entities)
  const valid = canEdit.value && !target.editorLocked && moving.every(entity => entity !== target && !entity.editorLocked && !wouldCreateParentCycle(entity, parentUuid, state.world.entities))
  dropValidity.value = valid ? event.shiftKey ? 'before' : 'valid' : 'invalid'
  if (valid) event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = valid ? 'move' : 'none'
}
/** 结束拖拽并清除待放置目标。 */ function finishEntityDrag() { draggingIds.value = []; dropTargetUuid.value = null; endNativeDrag() }
function hierarchyElements() { return entityList.value?.querySelectorAll<HTMLElement>('.entity-item') ?? [] }
function settleHierarchy(before: ReturnType<typeof captureRects>) { void nextTick(() => animateReorder(before, hierarchyElements())) }
function previewRootDrop(event: DragEvent) { if (canEdit.value && draggingIds.value.length) { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move' } }
/** 指针实际离开目标元素及子元素时清除对应放置高亮。 */ function leaveDropTarget(event: DragEvent, uuid: string) { if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null) && dropTargetUuid.value === uuid) dropTargetUuid.value = null }
/** 将拖动根实体重新设父级，跳过自身与锁定项，按需保留世界坐标并记录变更。 */ function reparentDragged(parentUuid: string | null, preserveWorld = true) {
  if (!canEdit.value || !draggingIds.value.length) return
  const before = captureRects(hierarchyElements())
  let changed = false
  for (const entity of selectionRoots(draggingIds.value, state.world.entities)) {
    if (entity.uuid === parentUuid || entity.editorLocked) continue
    changed = setParent(entity, parentUuid, state.world.entities, preserveWorld) || changed
  }
  if (changed) { pushHistory('Reparent entities'); addEditorLog(parentUuid ? 'Entities reparented' : 'Entities moved to scene root'); settleHierarchy(before) }
  finishEntityDrag()
}
/** 将拖动根实体移动到目标同级并插入目标之前，记录顺序历史并结束拖拽。 */ function reorderDragged(target: Entity) {
  if (!canEdit.value || target.editorLocked) { finishEntityDrag(); return }
  const moving = selectionRoots(draggingIds.value, state.world.entities).filter(/* 比较 entity 与 target，返回严格不等的判断结果。 */ entity => entity !== target)
  if (!moving.length || moving.some(entity => entity.editorLocked || wouldCreateParentCycle(entity, target.parentUuid, state.world.entities))) { finishEntityDrag(); return }
  const before = captureRects(hierarchyElements())
  const parentUuid = target.parentUuid
  for (const entity of moving) setParent(entity, parentUuid, state.world.entities)
  const remaining = state.world.entities.filter(/* 返回 moving.includes(entity) 的逻辑取反结果。 */ entity => !moving.includes(entity)), index = remaining.indexOf(target)
  remaining.splice(Math.max(0, index), 0, ...moving); state.world.entities.splice(0, state.world.entities.length, ...remaining)
  pushHistory('Reorder entities'); finishEntityDrag(); settleHierarchy(before)
}
/** Shift 放置执行排序，否则重设父级，Alt 控制是否保留世界坐标。 */ function dropOnEntity(event: DragEvent, parent: Entity) { if (!draggingIds.value.length) return; previewEntityDrop(event, parent); if (dropValidity.value === 'invalid') { finishEntityDrag(); return } if (event.shiftKey) reorderDragged(parent); else reparentDragged(parent.uuid, !event.altKey) }
/** 放置到根时重设为空父级，Alt 控制是否保留世界坐标。 */ function dropOnRoot(event?: DragEvent) { if (!draggingIds.value.length) return; event?.preventDefault(); reparentDragged(null, !event?.altKey) }
watch(() => sceneManager.activeSceneUuid, finishEntityDrag)

watch(/* 返回 editorState.renameRequestId 的当前值。 */ () => editorState.renameRequestId, /** 收到有效重命名请求编号时查找实体并启动编辑。 */ id => { if (id === null) return; const entity = state.world.entities.find(/* 比较 candidate.id 与 id，返回严格相等的判断结果。 */ candidate => candidate.id === id); if (entity) startEdit(entity) })
watch(/** 提取当前全部实体标识作为展开初始化依赖。 */ () => state.world.entities.map(/* 返回 entity.uuid 的当前值。 */ entity => entity.uuid), /** 尚无展开项时将现有实体默认展开。 */ uuids => { if (!expandedUuids.value.size) expandedUuids.value = new Set(uuids) }, { immediate: true })
watch(/** 组合场景、选择集合及主选择为历史监听标记。 */ () => `${sceneManager.activeSceneUuid}:${state.selectedEntityIds.join(',')}:${state.selectedEntityId ?? ''}`, /** 非历史回放期间记录不同的新选择，裁剪未来记录及超过一百项的旧历史。 */ () => {
  if (applyingSelectionHistory) return
  const selected = new Set(state.selectedEntityIds)
  const uuids = state.world.entities.filter(/* 调用 selected.has(entity.id) 并返回调用结果。 */ entity => selected.has(entity.id)).map(/* 返回 entity.uuid 的当前值。 */ entity => entity.uuid)
  const primaryUuid = state.world.entities.find(/* 比较 entity.id 与 state.selectedEntityId，返回严格相等的判断结果。 */ entity => entity.id === state.selectedEntityId)?.uuid ?? null
  const entry = { sceneUuid: sceneManager.activeSceneUuid, uuids, primaryUuid }, current = selectionHistory.value[selectionHistoryIndex.value]
  if (current?.sceneUuid === entry.sceneUuid && current.primaryUuid === entry.primaryUuid && current.uuids.join(',') === entry.uuids.join(',')) return
  selectionHistory.value.splice(selectionHistoryIndex.value + 1)
  selectionHistory.value.push(entry)
  if (selectionHistory.value.length > 100) selectionHistory.value.shift()
  selectionHistoryIndex.value = selectionHistory.value.length - 1
}, { immediate: true })

const collapseThreshold = 140
/** 结束宽度拖动，低于阈值则折叠，否则限制最小宽度并保存布局。 */ function commitPanelWidth(value:number) { isDragging.value=false;if(value<collapseThreshold){isCollapsed.value=true;panelWidth.value=0}else{panelWidth.value=Math.max(260,value);editorState.hierarchyWidth=panelWidth.value} }
/** 展开面板并恢复已保存宽度或默认宽度。 */ function expandPanel() { isCollapsed.value = false; panelWidth.value = editorState.hierarchyWidth || 264 }
onMounted(/** 挂载时记录层级视口高度并注册尺寸观察器。 */ () => { document.addEventListener('pointerdown', dismissSidebarMenu, true); document.addEventListener('keydown', leaveSidebarMenu, true); window.addEventListener('resize', resizeSidebarMenu); if (entityList.value) { hierarchyViewportHeight.value = entityList.value.clientHeight; hierarchyResizeObserver = new ResizeObserver(/** 从尺寸观察结果更新虚拟列表视口高度。 */ entries => { hierarchyViewportHeight.value = entries[0]?.contentRect.height ?? hierarchyViewportHeight.value }); hierarchyResizeObserver.observe(entityList.value) } })
onBeforeUnmount(/** Release animations while the mounted row references are still available. */ () => { document.removeEventListener('pointerdown', dismissSidebarMenu, true); document.removeEventListener('keydown', leaveSidebarMenu, true); window.removeEventListener('resize', resizeSidebarMenu); closeSidebarMenu(false); hierarchyResizeObserver?.disconnect(); for (const element of hierarchyElements()) cancelMotion(element); finishEntityDrag() })
</script>

<style scoped>
.sidebar-container{position:relative;height:100%;flex:none;display:flex;min-width:0;border-radius:var(--radius-panel);background:var(--surface-1);box-shadow:inset 0 0 0 var(--ui-border-width) var(--border-separator)}
.sidebar-container.left>.panel-resize-handle{inset-inline-end:0}
.right .panel-resize-handle{inset-inline-start:0}
.sidebar-container:has(>.context-tools:not(.vertical)){flex-direction:column}
.context-tools{flex:none;display:flex;align-items:center;gap:2px;padding:var(--space-1) var(--space-2);border-bottom:var(--ui-border-width) solid var(--border-separator);overflow-x:auto;scrollbar-width:none}
.context-tools :deep(.ui-button){flex:none;width:var(--ui-control-height);height:var(--ui-control-height);min-height:0;padding:0;color:var(--text-muted)}
.context-tools :deep(.ui-button:hover:not(:disabled)){color:var(--text-primary)}
.context-tools :deep(.ui-button.active){background:var(--selection-bg);color:var(--text-primary)}
.context-tools :deep(.ui-button.create){margin-inline-start:auto;color:var(--creation)}
.context-tools.vertical{position:absolute;inset:var(--space-1) 0 auto;flex-direction:column;padding:0;border-bottom:0}
.context-tools.vertical :deep(.ui-button.create){margin:var(--space-1) 0 0}
.scene-sidebar{container:hierarchy-host/inline-size;min-width:0;flex:1;display:flex;flex-direction:column;overflow:hidden;border-radius:var(--radius-panel)}
.scene-manager{flex:none;border-bottom:var(--ui-border-width) solid var(--border-separator)}
.scene-manager :deep(.ui-panel-header){border-bottom:0;background:transparent}
.scene-list{max-height:calc(4 * var(--ui-tree-row-height) + var(--space-2));overflow:auto;padding:0 var(--space-2) var(--space-2)}
.scene-item{display:flex;align-items:center;border-radius:var(--radius-control)}
.scene-item:hover:not(.active){background:var(--surface-hover)}
.scene-main{display:flex;align-items:center;flex:1;min-width:0;min-height:var(--ui-tree-row-height);gap:var(--space-2);padding-inline:var(--space-2);cursor:default}
.scene-main>i{width:6px;height:6px;flex:none;border-radius:50%;background:var(--text-tertiary)}
.scene-item.active .scene-main>i{background:var(--accent)}
.scene-main span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.scene-main input{min-width:0;width:100%}
.scene-item.active{background:var(--selection-quiet);font-weight:var(--weight-medium)}
.scene-item.unloaded{opacity:.55}
.load-toggle{width:calc(var(--ui-tree-row-height) - 4px);height:calc(var(--ui-tree-row-height) - 4px);min-height:0;padding:0;display:grid;place-items:center;color:var(--text-muted)}
.hierarchy-header{flex:none;padding:var(--space-2) var(--space-2) var(--space-2) var(--ui-header-inset)}
.hierarchy-header>div:first-child{display:flex;align-items:center;justify-content:space-between;gap:var(--space-2);min-height:var(--ui-control-height)}
.hierarchy-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--type-section);font-weight:var(--weight-strong)}
.hierarchy-actions{display:flex;align-items:center;gap:0;flex:none}
.hierarchy-actions>small{margin-inline-end:var(--space-1)}
.hierarchy-actions>small:not(:empty){min-width:20px;padding:0 6px;border-radius:var(--radius-pill);background:var(--surface-3);color:var(--text-muted);font-size:var(--type-caption);text-align:center}
.hierarchy-actions .ui-button{color:var(--text-muted)}
.hierarchy-search-row{display:flex;position:relative;gap:var(--space-1);margin-top:var(--space-1);padding-inline-end:var(--space-1)}
.search{position:relative;min-width:0;flex:1;display:flex;align-items:center}
.search>.editor-icon{position:absolute;inset-inline-start:var(--space-2);color:var(--text-tertiary);width:14px;height:14px;flex-basis:14px}
.search input{width:100%;min-width:0;flex:1;padding-inline-start:calc(var(--space-2) + 20px)}
.hierarchy-filter-menu>summary{display:grid;place-items:center;inline-size:var(--ui-control-height);block-size:var(--ui-control-height);padding:0;list-style:none;color:var(--text-muted)}
.hierarchy-filter-menu>summary::-webkit-details-marker{display:none}
.hierarchy-filters{position:absolute;top:calc(100% + var(--space-1));inset-inline-end:0;z-index:30;display:grid;grid-template-columns:minmax(0,1fr) auto auto;width:min(100%,24rem);gap:var(--space-1);padding:var(--space-2);border:var(--ui-border-width) solid var(--border-subtle);border-radius:var(--radius-floating);background:var(--surface-popover);box-shadow:var(--shadow-md)}
.hierarchy-filter-wide{grid-column:1/-1;width:100%}
.entity-list{min-height:0;flex:1;overflow:auto}
.hierarchy-rows{padding-inline:var(--space-2)}
.entity-item{position:relative;gap:var(--space-1);color:var(--text-secondary)}
.entity-item.selected{color:var(--text-primary)}
.entity-item.disabled{opacity:.5}
.entity-item.hidden .name{text-decoration:line-through;text-decoration-color:var(--text-tertiary)}
.entity-item.drop-target{outline:1.5px solid var(--drag-target);outline-offset:-1.5px}
.entity-item.primary{box-shadow:none}
.shape-icon{color:var(--text-muted);width:14px;height:14px;flex-basis:14px}
.entity-item.selected .shape-icon{color:var(--accent)}
.name{min-width:0;flex:1;display:flex;align-items:center;gap:var(--space-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:transparent!important;border:0;text-align:start;padding:0 0 0 var(--space-1);height:100%;min-height:0;font:inherit;font-weight:var(--weight-regular);color:inherit;box-shadow:none!important}
.entity-item.primary .name{font-weight:var(--weight-medium)}
.name small{color:var(--text-tertiary);font-size:var(--type-caption);font-variant-numeric:tabular-nums}
.name mark{color:inherit;background:var(--warning-soft);border-radius:3px}
.edit-input{min-width:0;flex:1}
.disclosure,.state-button{flex:none;inline-size:calc(var(--ui-tree-row-height) - 6px);block-size:calc(var(--ui-tree-row-height) - 6px);min-inline-size:0;min-height:0;padding:0;display:grid;place-items:center;border:0;background:transparent;color:var(--text-muted)}
.disclosure .editor-icon{width:12px;height:12px;flex-basis:12px}
.disclosure.placeholder{visibility:hidden}
.state-button{opacity:0;transition:opacity var(--motion-micro) var(--ease-standard)}
.state-button .editor-icon{width:14px;height:14px;flex-basis:14px}
.entity-item:hover .state-button,.entity-item:focus-within .state-button,.state-button.active,.entity-item.hidden .state-button,.entity-item.locked .state-button{opacity:1}
.status-mark{display:inline-grid;place-items:center;min-width:16px;height:16px;padding:0 3px;border-radius:4px;background:var(--surface-3);font-size:11px;font-weight:var(--weight-strong);color:var(--text-muted)}
.status-mark.override{background:transparent;color:var(--warning)}
.status-mark .editor-icon{width:10px;height:10px}
.empty-state{color:var(--text-muted);padding:var(--ui-panel-inset);font-size:var(--type-dense)}
.root-drop{margin:var(--space-2);border:1.5px dashed var(--drag-target);width:calc(100% - 2 * var(--space-2))}
.breadcrumbs{display:flex;flex:none;align-items:center;min-width:0;min-height:calc(var(--ui-tree-row-height) + 2px);padding:0 var(--space-3);gap:2px;overflow-x:auto;scrollbar-width:none;border-top:var(--ui-border-width) solid var(--border-separator);color:var(--text-muted);font-size:var(--type-caption)}
.breadcrumbs::-webkit-scrollbar{display:none}
.crumb-root{flex:none;white-space:nowrap}
.breadcrumbs button{display:flex;align-items:center;gap:2px;flex:none;min-height:calc(var(--ui-tree-row-height) - 6px);padding:0 var(--space-1);white-space:nowrap;font-size:var(--type-caption);font-weight:var(--weight-regular);color:var(--text-secondary)}
.breadcrumbs button .editor-icon{width:10px;height:10px;flex-basis:10px;color:var(--text-tertiary)}
.breadcrumbs button:last-child{color:var(--text-primary)}
.expand{position:absolute;inset-inline-start:0;top:50%}
/* The host's font-relative breakpoint follows saved UI scale, never dock width. */
.compact-action{display:none}
.entity-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.name small{flex:none}
.row-overflow{flex:none;inline-size:calc(var(--ui-tree-row-height) - 6px);block-size:calc(var(--ui-tree-row-height) - 6px);min-inline-size:0;min-height:0;padding:0;color:var(--text-muted);opacity:0}
.entity-item:hover .row-overflow,.entity-item:focus-within .row-overflow,.row-overflow[aria-expanded='true']{opacity:1}
.sidebar-action-menu{position:fixed;z-index:var(--ui-popover-layer);inline-size:min(calc(8 * var(--ui-control-height)),calc(100vw - 2 * var(--ui-space-sm)));max-inline-size:calc(100vw - 2 * var(--ui-space-sm));max-block-size:calc(100dvh - 2 * var(--ui-space-sm))}
.sidebar-action-menu :deep(.ui-menu){max-inline-size:inherit;max-block-size:inherit;overflow:auto}
.sidebar-action-menu :deep(.ui-menu>button){white-space:normal}
.sidebar-menu-title{padding:var(--space-1) var(--space-2) 0;font-size:var(--type-body);overflow-wrap:anywhere}
.sidebar-action-menu small,.sidebar-menu-status{padding:0 var(--space-2) var(--space-1);color:var(--text-muted);font-size:var(--type-caption)}
.sidebar-menu-status{display:grid;gap:var(--ui-space-micro)}
@container hierarchy-host (max-width:22em){
  .compact-action{display:inline-flex}
  .scene-direct-action,.hierarchy-direct-action,.entity-item>.state-button,.entity-item>.status-mark,.name small{display:none}
  .entity-item>.disclosure.placeholder{display:none}
  .entity-item{padding-inline-start:min(calc(var(--tree-depth,0) * var(--space-3)),var(--space-3))}
  .hierarchy-filters{grid-template-columns:repeat(2,minmax(0,1fr))}
  .hierarchy-filters>select{grid-column:1/-1;width:100%}
  .hierarchy-filters>.ui-button{justify-self:start}
}
.edit-input,.scene-main input{height:calc(var(--ui-tree-row-height) - 2px);min-height:0;min-width:0;max-width:100%;font-size:var(--type-body);line-height:var(--line-control);padding-inline:var(--space-2);padding-block:0;border-width:var(--ui-border-width);border-radius:var(--radius-xs)}
.edit-input{width:100%}
</style>
