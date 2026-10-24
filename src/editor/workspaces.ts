/** 编辑工作区布局：规范、保存及切换面板配置，管理导航历史、停靠、最大化和安全布局。 */
import { reactive, watch } from 'vue'
import { editorState, reconfigureLayout, type BottomPanelTab, type EditorPage, type EditorWorkspace, type ManageSection } from '../store/editor'
import { preferencesState } from '../store/preferences'
import { projectSessionState } from '../projects/projectSession'

export interface WorkspaceLayout {
  page: EditorPage
  hierarchyVisible: boolean
  inspectorVisible: boolean
  bottomPanelVisible: boolean
  bottomPanelOpen: boolean
  bottomPanelTab: BottomPanelTab
  bottomPanelHeight: number
  hierarchyWidth: number
  inspectorWidth: number
  hierarchyDock: 'left' | 'right'
  inspectorDock: 'left' | 'right'
  hierarchyPinned: boolean
  inspectorPinned: boolean
  bottomPanelPinned: boolean
  panelOrder: Array<'hierarchy' | 'inspector'>
  bottomTabOrder: BottomPanelTab[]
  floatingPanels: Array<'hierarchy' | 'inspector'>
  splitDocking: boolean
}

export interface WorkspacePreset extends WorkspaceLayout {
  id: EditorWorkspace
  label: string
  builtIn: boolean
}

export interface CustomWorkspace extends WorkspaceLayout {
  id: string
  name: string
}

const safeDesignLayout: WorkspaceLayout = {
  page: 'scene', hierarchyVisible: true, inspectorVisible: true, bottomPanelVisible: true,
  bottomPanelOpen: false, bottomPanelTab: 'assets', bottomPanelHeight: 280,
  hierarchyWidth: 280, inspectorWidth: 380, hierarchyDock: 'left', inspectorDock: 'right',
  hierarchyPinned: true, inspectorPinned: true, bottomPanelPinned: true,
  panelOrder: ['hierarchy', 'inspector'], bottomTabOrder: ['assets', 'console', 'animation', 'audio', 'worldProduction', 'networkStudio', 'ecosystem', 'profiler', 'tilemap', 'chart'],
  floatingPanels: [], splitDocking: false
}

export const WORKSPACE_PRESETS: readonly WorkspacePreset[] = [
  { id: 'design', label: 'workspaceDesign', builtIn: true, ...safeDesignLayout },
  { id: 'script', label: 'workspaceScript', builtIn: true, ...safeDesignLayout, page: 'script', hierarchyVisible: false, inspectorVisible: false, bottomPanelVisible: false, bottomPanelHeight: 320 },
  { id: 'animation', label: 'workspaceAnimation', builtIn: true, ...safeDesignLayout, bottomPanelOpen: true, bottomPanelTab: 'animation', bottomPanelHeight: 360 },
  { id: 'ui', label: 'workspaceUi', builtIn: true, ...safeDesignLayout, bottomPanelOpen: true, bottomPanelTab: 'assets', bottomPanelHeight: 250 },
  { id: 'debug', label: 'workspaceDebug', builtIn: true, ...safeDesignLayout, page: 'game', hierarchyVisible: false, inspectorVisible: false, bottomPanelOpen: true, bottomPanelTab: 'profiler', bottomPanelHeight: 320 },
  { id: 'manage', label: 'workspaceManage', builtIn: true, ...safeDesignLayout, page: 'manage', hierarchyVisible: false, inspectorVisible: false, bottomPanelVisible: false },
  { id: 'custom', label: 'workspaceCustom', builtIn: true, ...safeDesignLayout }
]

export const WORKSPACE_PROFILE_PRESETS = Object.freeze([
  { id: 'beginner', label: 'profileBeginner', workspace: 'design' as EditorWorkspace, layout: { ...safeDesignLayout, bottomPanelOpen: false } },
  { id: 'designer', label: 'profileDesigner', workspace: 'design' as EditorWorkspace, layout: { ...safeDesignLayout, bottomPanelOpen: true, bottomPanelTab: 'assets' as BottomPanelTab } },
  { id: 'programmer', label: 'profileProgrammer', workspace: 'script' as EditorWorkspace, layout: { ...safeDesignLayout, page: 'script' as EditorPage, hierarchyVisible: false, inspectorVisible: false, bottomPanelVisible: false } },
  { id: 'ui-designer', label: 'profileUiDesigner', workspace: 'ui' as EditorWorkspace, layout: { ...safeDesignLayout, bottomPanelOpen: true, bottomPanelTab: 'assets' as BottomPanelTab } },
  { id: 'profiler', label: 'profileProfiler', workspace: 'debug' as EditorWorkspace, layout: { ...safeDesignLayout, page: 'game' as EditorPage, hierarchyVisible: false, inspectorVisible: false, bottomPanelOpen: true, bottomPanelTab: 'profiler' as BottomPanelTab } },
  { id: 'release-engineer', label: 'profileReleaseEngineer', workspace: 'manage' as EditorWorkspace, layout: { ...safeDesignLayout, page: 'manage' as EditorPage, hierarchyVisible: false, inspectorVisible: false, bottomPanelVisible: false } }
])

export const workspaceState = reactive({
  maximizedPanel: '' as '' | 'hierarchy' | 'inspector' | 'bottom',
  custom: [] as CustomWorkspace[],
  selectedCustomId: '',
  safeLayout: false,
  navigationBack: [] as Array<{ page: EditorPage; workspace: EditorWorkspace }>,
  navigationForward: [] as Array<{ page: EditorPage; workspace: EditorWorkspace }>,
  restoringNavigation: false,
  hierarchyPinned: true,
  inspectorPinned: true,
  panelOrder: ['hierarchy', 'inspector'] as Array<'hierarchy' | 'inspector'>,
  bottomTabOrder: ['assets', 'console', 'animation', 'audio', 'worldProduction', 'networkStudio', 'ecosystem', 'profiler', 'tilemap', 'chart'] as BottomPanelTab[],
  floatingPanels: [] as Array<'hierarchy' | 'inspector'>,
  splitDocking: false
})

type PanelName = 'hierarchy' | 'inspector' | 'bottom'
const USER_STORAGE_KEY = 'nova-a-editor-workspaces-v3'
const V4_STORAGE_KEY = 'nova-a-editor-workspaces-v2'
const LEGACY_STORAGE_KEY = 'nova-a-editor-layout-v1'
const MAX_CUSTOM_WORKSPACES = 24
const PAGES = new Set<EditorPage>(['scene', 'game', 'script', 'settings', 'manage'])
const BOTTOM_TABS = new Set<BottomPanelTab>(['assets', 'packages', 'console', 'animation', 'audio', 'worldProduction', 'networkStudio', 'ecosystem', 'tilemap', 'chart', 'presentation', 'profiler', 'rendering', 'project', 'build'])
let initialized = false
const rememberedLayouts = new Map<EditorWorkspace, WorkspaceLayout>()

/* 根据 preferencesState.workspaceLayoutScope === 'project' 的真假，分别返回 `${base}:project:${projectSessionState.id}` 或 base。 */ function scopedStorageKey(base: string): string { return preferencesState.workspaceLayoutScope === 'project' ? `${base}:project:${projectSessionState.id}` : base }
/* 调用 scopedStorageKey(USER_STORAGE_KEY) 并返回调用结果。 */ function storageKey(): string { return scopedStorageKey(USER_STORAGE_KEY) }

/* 根据 typeof location === 'undefined' 的真假，分别返回 new URLSearchParams() 或 new URLSearchParams(location.search)。 */ function flags(): URLSearchParams { return typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search) }
/* 根据 typeof value === 'number' && Number.isFinite(value) 的真假，分别返回 Math.min(maximum, Math.max(minimum, value)) 或 fallback。 */ function clamp(value: unknown, fallback: number, minimum: number, maximum: number): number { return typeof value === 'number' && Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback }

/** 校验工作区页面、停靠位置、尺寸及标签顺序，迁移旧标签并补齐受支持布局默认值。 */ function normalizeLayout(value: unknown, fallback: WorkspaceLayout = safeDesignLayout): WorkspaceLayout {
  const source = value && typeof value === 'object' ? value as Partial<WorkspaceLayout> : {}
  const page = typeof source.page === 'string' && PAGES.has(source.page as EditorPage) ? source.page as EditorPage : fallback.page
  const legacyTab = (source as { bottomPanelTab?: string }).bottomPanelTab
  let tab = legacyTab === 'world' ? 'project' : typeof source.bottomPanelTab === 'string' && BOTTOM_TABS.has(source.bottomPanelTab as BottomPanelTab) ? source.bottomPanelTab as BottomPanelTab : fallback.bottomPanelTab
  if (['presentation', 'packages', 'rendering', 'project', 'build'].includes(tab)) tab = 'assets'
  const panelOrder = Array.isArray(source.panelOrder)
    ? [...new Set(source.panelOrder.filter(/* 先计算 value === 'hierarchy'；仅当其为假值时求右侧 value === 'inspector'，返回短路求值结果。 */ value => value === 'hierarchy' || value === 'inspector'))] as Array<'hierarchy' | 'inspector'>
    : []
  for (const panel of fallback.panelOrder) if (!panelOrder.includes(panel)) panelOrder.push(panel)
  const bottomTabOrder = Array.isArray(source.bottomTabOrder)
    ? [...new Set(source.bottomTabOrder.filter(/** 只保留受支持且仍属于底部工具栏的标签，排除迁移到整页管理的分区。 */ value => BOTTOM_TABS.has(value as BottomPanelTab) && !['packages', 'rendering', 'project', 'build', 'presentation'].includes(value as string)) as BottomPanelTab[])]
    : []
  for (const bottomTab of fallback.bottomTabOrder) if (!bottomTabOrder.includes(bottomTab)) bottomTabOrder.push(bottomTab)
  return {
    page,
    hierarchyVisible: typeof source.hierarchyVisible === 'boolean' ? source.hierarchyVisible : fallback.hierarchyVisible,
    inspectorVisible: typeof source.inspectorVisible === 'boolean' ? source.inspectorVisible : fallback.inspectorVisible,
    bottomPanelVisible: typeof source.bottomPanelVisible === 'boolean' ? source.bottomPanelVisible : fallback.bottomPanelVisible,
    bottomPanelOpen: typeof source.bottomPanelOpen === 'boolean' ? source.bottomPanelOpen : fallback.bottomPanelOpen,
    bottomPanelTab: tab,
    bottomPanelHeight: clamp(source.bottomPanelHeight, fallback.bottomPanelHeight, 120, 520),
    hierarchyWidth: clamp(source.hierarchyWidth, fallback.hierarchyWidth, 160, 500),
    inspectorWidth: clamp(source.inspectorWidth, fallback.inspectorWidth, 252, 480),
    hierarchyDock: source.hierarchyDock === 'right' ? 'right' : fallback.hierarchyDock,
    inspectorDock: source.inspectorDock === 'left' ? 'left' : fallback.inspectorDock,
    hierarchyPinned: typeof source.hierarchyPinned === 'boolean' ? source.hierarchyPinned : fallback.hierarchyPinned,
    inspectorPinned: typeof source.inspectorPinned === 'boolean' ? source.inspectorPinned : fallback.inspectorPinned,
    bottomPanelPinned: typeof source.bottomPanelPinned === 'boolean' ? source.bottomPanelPinned : fallback.bottomPanelPinned,
    panelOrder,
    bottomTabOrder,
    floatingPanels: Array.isArray(source.floatingPanels) ? [...new Set(source.floatingPanels.filter(/* 先计算 value === 'hierarchy'；仅当其为假值时求右侧 value === 'inspector'，返回短路求值结果。 */ value => value === 'hierarchy' || value === 'inspector') as Array<'hierarchy' | 'inspector'>)] : [...fallback.floatingPanels],
    splitDocking: typeof source.splitDocking === 'boolean' ? source.splitDocking : fallback.splitDocking
  }
}

/** 从当前编辑器和工作区状态提取布局快照，再规范化为可持久化结构。 */ export function captureWorkspaceLayout(): WorkspaceLayout {
  return normalizeLayout({
    page: editorState.currentPage, hierarchyVisible: editorState.hierarchyVisible, inspectorVisible: editorState.inspectorVisible,
    bottomPanelVisible: editorState.bottomPanelVisible, bottomPanelOpen: editorState.bottomPanelOpen,
    bottomPanelTab: editorState.bottomPanelTab, bottomPanelHeight: editorState.bottomPanelHeight,
    hierarchyWidth: editorState.hierarchyWidth, inspectorWidth: editorState.inspectorWidth,
    hierarchyDock: editorState.hierarchyDock, inspectorDock: editorState.inspectorDock,
    hierarchyPinned: workspaceState.hierarchyPinned, inspectorPinned: workspaceState.inspectorPinned,
    bottomPanelPinned: editorState.bottomPanelPinned, panelOrder: workspaceState.panelOrder,
    bottomTabOrder: workspaceState.bottomTabOrder, floatingPanels: workspaceState.floatingPanels,
    splitDocking: workspaceState.splitDocking
  })
}

/** 重新计算布局并在下一绘制帧通知窗口尺寸变化，使依赖画布同步刷新。 */ function notifyLayoutChanged(): void {
  reconfigureLayout()
  if (typeof window !== 'undefined') window.requestAnimationFrame(/* 调用 window.dispatchEvent(new Event('resize')) 并返回调用结果。 */ () => window.dispatchEvent(new Event('resize')))
}

/** 退出面板最大化并应用规范布局，替换排序和悬浮状态后通知布局变化。 */ function applyLayout(layout: WorkspaceLayout): void {
  workspaceState.maximizedPanel = ''
  const value = normalizeLayout(layout)
  Object.assign(editorState, {
    currentPage: value.page, hierarchyVisible: value.hierarchyVisible, inspectorVisible: value.inspectorVisible,
    bottomPanelVisible: value.bottomPanelVisible, bottomPanelOpen: value.bottomPanelOpen,
    bottomPanelTab: value.bottomPanelTab, bottomPanelHeight: value.bottomPanelHeight,
    hierarchyWidth: value.hierarchyWidth, inspectorWidth: value.inspectorWidth,
    hierarchyDock: value.hierarchyDock, inspectorDock: value.inspectorDock,
    bottomPanelPinned: value.bottomPanelPinned,
    distractionFree: false
  })
  workspaceState.hierarchyPinned = value.hierarchyPinned
  workspaceState.inspectorPinned = value.inspectorPinned
  workspaceState.panelOrder.splice(0, workspaceState.panelOrder.length, ...value.panelOrder)
  workspaceState.bottomTabOrder.splice(0, workspaceState.bottomTabOrder.length, ...value.bottomTabOrder)
  workspaceState.floatingPanels.splice(0, workspaceState.floatingPanels.length, ...value.floatingPanels)
  workspaceState.splitDocking = value.splitDocking
  notifyLayoutChanged()
}

/** 限制自定义工作区数量，清理名称与布局并为重复标识分配新身份。 */ function normalizeCustomList(value: unknown): CustomWorkspace[] {
  if (!Array.isArray(value)) return []
  const ids = new Set<string>()
  return value.slice(0, MAX_CUSTOM_WORKSPACES).flatMap(/** 清理单个自定义工作区名称和身份，修复重复标识并规范化布局。 */ (item, index) => {
    if (!item || typeof item !== 'object') return []
    const source = item as Partial<CustomWorkspace>
    const name = typeof source.name === 'string' ? source.name.trim().slice(0, 48) : ''
    let id = typeof source.id === 'string' && source.id.trim() ? source.id.slice(0, 80) : `custom-${index}`
    if (ids.has(id)) id = `custom-${index}-${crypto.randomUUID?.() ?? Date.now()}`
    ids.add(id)
    return name ? [{ id, name, ...normalizeLayout(source) }] : []
  })
}

/** 按存储作用域恢复布局和自定义工作区，迁移旧格式；安全模式或无效存储时使用安全设计布局。 */ function readStored(): void {
  if (typeof localStorage === 'undefined') return
  rememberedLayouts.clear()
  workspaceState.custom.splice(0)
  workspaceState.selectedCustomId = ''
  workspaceState.safeLayout = flags().get('safe-layout') === '1' || flags().get('safe-mode') === '1'
  if (workspaceState.safeLayout) { editorState.activeWorkspace = 'design'; applyLayout(safeDesignLayout); return }
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey()) ?? localStorage.getItem(scopedStorageKey(V4_STORAGE_KEY)) ?? 'null') as Record<string, unknown> | null
    if (parsed?.layout) {
      rememberedLayouts.clear()
      if (parsed.layouts && typeof parsed.layouts === 'object' && !Array.isArray(parsed.layouts)) {
        for (const preset of WORKSPACE_PRESETS) {
          const saved = (parsed.layouts as Record<string,unknown>)[preset.id]
          if (saved && preset.id !== 'custom') rememberedLayouts.set(preset.id, normalizeLayout(saved))
        }
      }
      const rawWorkspace = parsed.activeWorkspace === 'interface' ? 'ui' : parsed.activeWorkspace
      editorState.activeWorkspace = WORKSPACE_PRESETS.some(/* 比较 item.id 与 rawWorkspace，返回严格相等的判断结果。 */ item => item.id === rawWorkspace) ? rawWorkspace as EditorWorkspace : 'design'
      workspaceState.selectedCustomId = typeof parsed.selectedCustomId === 'string' ? parsed.selectedCustomId : ''
      workspaceState.custom.splice(0, workspaceState.custom.length, ...normalizeCustomList(parsed.custom))
      applyLayout(normalizeLayout(parsed.layout))
      return
    }
    const legacy = preferencesState.workspaceLayoutScope === 'user' ? JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) ?? 'null') as Record<string, unknown> | null : null
    if (legacy) {
      editorState.activeWorkspace = legacy.activeWorkspace === 'interface' ? 'ui' : 'design'
      applyLayout(normalizeLayout({ ...legacy, bottomPanelTab: legacy.bottomPanelTab === 'presentation' ? 'assets' : legacy.bottomPanelTab }))
      return
    }
    editorState.activeWorkspace = 'design'
    applyLayout(safeDesignLayout)
  } catch { editorState.activeWorkspace = 'design'; applyLayout(safeDesignLayout) }
}

/** 非安全模式下保存当前布局、各预设记忆及自定义工作区，存储异常不阻断编辑。 */ function persist(): void {
  if (typeof localStorage === 'undefined' || workspaceState.safeLayout) return
  try {
    const layout = captureWorkspaceLayout()
    if (editorState.activeWorkspace !== 'custom') rememberedLayouts.set(editorState.activeWorkspace, layout)
    localStorage.setItem(storageKey(), JSON.stringify({ version: 3, migratedFrom: localStorage.getItem(scopedStorageKey(V4_STORAGE_KEY)) ? 2 : null, activeWorkspace: editorState.activeWorkspace, selectedCustomId: workspaceState.selectedCustomId, layout, layouts: Object.fromEntries(rememberedLayouts), custom: workspaceState.custom }))
  } catch { /* Layout persistence is optional; editor operation is not. */ }
}

/** 单次恢复工作区并安装导航和持久化观察器，限制后退历史并响应存储作用域变化。 */ export function initializeEditorWorkspaces(): void {
  if (initialized) return
  initialized = true
  readStored()
  let last = { page: editorState.currentPage, workspace: editorState.activeWorkspace }
  watch(/** 构造并返回记录 { page: editorState.currentPage, workspace: editorState.activeWorkspace }，字段按当前实参及捕获状态求值。 */ () => ({ page: editorState.currentPage, workspace: editorState.activeWorkspace }), /** 页面或工作区变化时退出最大化，记录有界后退历史并清空前进栈。 */ current => {
    workspaceState.maximizedPanel = ''
    if (!workspaceState.restoringNavigation && (current.page !== last.page || current.workspace !== last.workspace)) {
      workspaceState.navigationBack.push(last)
      if (workspaceState.navigationBack.length > 50) workspaceState.navigationBack.shift()
      workspaceState.navigationForward.splice(0)
    }
    last = current
  })
  watch(storageKey, readStored)
  watch(/** 采集当前布局、自定义工作区与作用域作为持久化观察依赖。 */ () => ({ ...captureWorkspaceLayout(), workspace: editorState.activeWorkspace, custom: workspaceState.custom.map(/** 构造并返回记录 { ...item }，字段按当前实参及捕获状态求值。 */ item => ({ ...item })), selected: workspaceState.selectedCustomId, scope: preferencesState.workspaceLayoutScope }), persist, { deep: true })
}

/** 记住离开的预设布局，再选择自定义工作区或恢复目标预设的记忆布局。 */ export function applyEditorWorkspace(workspace: EditorWorkspace): void {
  if (!workspaceState.safeLayout && editorState.activeWorkspace !== 'custom') rememberedLayouts.set(editorState.activeWorkspace, captureWorkspaceLayout())
  let preset = WORKSPACE_PRESETS.find(/* 比较 candidate.id 与 workspace，返回严格相等的判断结果。 */ candidate => candidate.id === workspace)
  if (workspace === 'custom') {
    const custom = workspaceState.custom.find(/* 比较 item.id 与 workspaceState.selectedCustomId，返回严格相等的判断结果。 */ item => item.id === workspaceState.selectedCustomId) ?? workspaceState.custom[0]
    if (custom) { editorState.activeWorkspace = 'custom'; workspaceState.selectedCustomId = custom.id; applyLayout(custom); return }
    preset = WORKSPACE_PRESETS.find(/* 比较 candidate.id 与 'custom'，返回严格相等的判断结果。 */ candidate => candidate.id === 'custom')
  }
  if (!preset) return
  editorState.activeWorkspace = preset.id
  applyLayout(rememberedLayouts.get(preset.id) ?? preset)
}

/** 按配置 ID 应用命名工作区配置及其布局，未知配置返回 false。 */ export function applyWorkspaceProfile(id: string): boolean {
  const profile = WORKSPACE_PROFILE_PRESETS.find(/* 比较 item.id 与 id，返回严格相等的判断结果。 */ item => item.id === id)
  if (!profile) return false
  editorState.activeWorkspace = profile.workspace
  applyLayout(normalizeLayout(profile.layout, safeDesignLayout))
  return true
}

/** 优先按 ID 打开自定义工作区，否则匹配内置非自定义预设。 */ export function applyNamedWorkspace(id: string): boolean {
  const custom = workspaceState.custom.find(/* 比较 item.id 与 id，返回严格相等的判断结果。 */ item => item.id === id)
  if (custom) {
    workspaceState.selectedCustomId = custom.id
    applyEditorWorkspace('custom')
    return true
  }
  const preset = WORKSPACE_PRESETS.find(/* 先计算 item.id === id；仅当其为真值时求右侧 item.id !== 'custom'，返回短路求值结果。 */ item => item.id === id && item.id !== 'custom')
  if (!preset) return false
  applyEditorWorkspace(preset.id)
  return true
}

/** 无新名称时覆盖当前自定义布局，否则检查容量后以新身份保存当前布局。 */ export function saveCurrentWorkspace(name?: string): CustomWorkspace {
  const existing = workspaceState.custom.find(/* 比较 item.id 与 workspaceState.selectedCustomId，返回严格相等的判断结果。 */ item => item.id === workspaceState.selectedCustomId)
  if (existing && !name) { Object.assign(existing, captureWorkspaceLayout()); editorState.activeWorkspace = 'custom'; return existing }
  requireCustomCapacity(1)
  const workspace: CustomWorkspace = { id: crypto.randomUUID?.() ?? `custom-${Date.now()}`, name: (name?.trim() || `Custom ${workspaceState.custom.length + 1}`).slice(0, 48), ...captureWorkspaceLayout() }
  workspaceState.custom.push(workspace); workspaceState.selectedCustomId = workspace.id; editorState.activeWorkspace = 'custom'; return workspace
}

/** 复制已有自定义或内置工作区，检查容量、分配新身份并立即应用副本。 */ export function duplicateWorkspace(id: string, name?: string): CustomWorkspace | null {
  const source = workspaceState.custom.find(/* 比较 item.id 与 id，返回严格相等的判断结果。 */ item => item.id === id) ?? WORKSPACE_PRESETS.find(/* 比较 item.id 与 id，返回严格相等的判断结果。 */ item => item.id === id)
  if (!source) return null
  requireCustomCapacity(1)
  const sourceName = 'name' in source ? source.name : source.label
  const duplicate: CustomWorkspace = { id: crypto.randomUUID?.() ?? `custom-${Date.now()}`, name: (name?.trim() || `${sourceName} Copy`).slice(0, 48), ...normalizeLayout(source) }
  workspaceState.custom.push(duplicate); workspaceState.selectedCustomId = duplicate.id; editorState.activeWorkspace = 'custom'; applyLayout(duplicate); return duplicate
}

/** 为存在的自定义工作区设置截断后的非空名称。 */ export function renameWorkspace(id: string, name: string): boolean { const item = workspaceState.custom.find(/* 比较 candidate.id 与 id，返回严格相等的判断结果。 */ candidate => candidate.id === id); const safe = name.trim().slice(0, 48); if (!item || !safe) return false; item.name = safe; return true }
/** 删除自定义工作区，若删除的是当前选择则切换到剩余项或设计预设。 */ export function removeWorkspace(id: string): boolean {
  const index = workspaceState.custom.findIndex(/* 比较 item.id 与 id，返回严格相等的判断结果。 */ item => item.id === id)
  if (index < 0) return false
  workspaceState.custom.splice(index, 1)
  if (workspaceState.selectedCustomId === id) {
    workspaceState.selectedCustomId = workspaceState.custom[0]?.id ?? ''
    if (editorState.activeWorkspace === 'custom') applyEditorWorkspace(workspaceState.selectedCustomId ? 'custom' : 'design')
  }
  return true
}
/* 调用 JSON.stringify({ format: 'nova-workspaces', version: 3, engineLine: '6.x', workspaces: workspaceState.custom }, null, 2) 并返回调用结果。 */ export function exportWorkspaces(): string { return JSON.stringify({ format: 'nova-workspaces', version: 3, engineLine: '6.x', workspaces: workspaceState.custom }, null, 2) }
/** 检查新增数量是否超出自定义工作区上限，超限时抛出可操作提示。 */ function requireCustomCapacity(additional: number): void { if (workspaceState.custom.length + additional > MAX_CUSTOM_WORKSPACES) throw new Error(`A maximum of ${MAX_CUSTOM_WORKSPACES} custom workspaces can be stored. Delete an unused workspace before adding more.`) }
/** 验证导入格式和数量，规范化布局并解决标识冲突后追加自定义工作区。 */ export function importWorkspaces(source: string): number {
  const parsed = JSON.parse(source) as Record<string, unknown>
  if (!parsed || parsed.format !== 'nova-workspaces' || (parsed.version !== 2 && parsed.version !== 3)) throw new Error('Unsupported Nova_A workspace document.')
  if (Array.isArray(parsed.workspaces) && parsed.workspaces.length > MAX_CUSTOM_WORKSPACES) throw new Error(`A maximum of ${MAX_CUSTOM_WORKSPACES} custom workspaces can be imported at once.`)
  const imported = normalizeCustomList(parsed.workspaces); requireCustomCapacity(imported.length)
  const ids = new Set(workspaceState.custom.map(/* 返回 item.id 的当前值。 */ item => item.id))
  for (const item of imported) { if (ids.has(item.id)) item.id = crypto.randomUUID?.() ?? `custom-${Date.now()}-${ids.size}`; ids.add(item.id); workspaceState.custom.push(item) }
  return imported.length
}

/** 从前进或后退栈恢复工作区与页面，在微任务结束前阻止导航观察器重复入栈。 */ export function navigateHistory(direction: 'back' | 'forward'): boolean {
  const source = direction === 'back' ? workspaceState.navigationBack : workspaceState.navigationForward
  const destination = direction === 'back' ? workspaceState.navigationForward : workspaceState.navigationBack
  const target = source.pop(); if (!target) return false
  destination.push({ page: editorState.currentPage, workspace: editorState.activeWorkspace })
  workspaceState.restoringNavigation = true
  applyEditorWorkspace(target.workspace); editorState.currentPage = target.page
  queueMicrotask(/** 将 false 赋给 workspaceState.restoringNavigation，不显式返回值。 */ () => { workspaceState.restoringNavigation = false })
  notifyLayoutChanged(); return true
}

/** 退出最大化后切换指定侧栏或底栏可见性并刷新布局。 */ export function toggleEditorPanel(panel: PanelName): void { workspaceState.maximizedPanel = ''; if (panel === 'hierarchy') editorState.hierarchyVisible = !editorState.hierarchyVisible; else if (panel === 'inspector') editorState.inspectorVisible = !editorState.inspectorVisible; else editorState.bottomPanelVisible = !editorState.bottomPanelVisible; notifyLayoutChanged() }
/** 切换指定面板最大化状态，再次选择同一面板时恢复。 */ export function togglePanelMaximize(panel: PanelName): void { workspaceState.maximizedPanel = workspaceState.maximizedPanel === panel ? '' : panel; notifyLayoutChanged() }
/** 存在最大化面板时恢复正常布局并通知刷新。 */ export function restorePanelLayout(): void { if (workspaceState.maximizedPanel) { workspaceState.maximizedPanel = ''; notifyLayoutChanged() } }
/** 将侧栏加入悬浮集合，或从悬浮移除并设置左、右停靠位置。 */ export function dockEditorPanel(panel: 'hierarchy' | 'inspector', destination: 'left' | 'right' | 'floating'): void {
  const floating = workspaceState.floatingPanels
  const index = floating.indexOf(panel)
  if (destination === 'floating') { if (index < 0) floating.push(panel) }
  else {
    if (index >= 0) floating.splice(index, 1)
    if (panel === 'hierarchy') editorState.hierarchyDock = destination
    else editorState.inspectorDock = destination
  }
  notifyLayoutChanged()
}
/** 更新指定面板固定状态并触发布局刷新。 */ export function setPanelPinned(panel: 'hierarchy' | 'inspector' | 'bottom', pinned: boolean): void {
  if (panel === 'hierarchy') workspaceState.hierarchyPinned = pinned
  else if (panel === 'inspector') workspaceState.inspectorPinned = pinned
  else editorState.bottomPanelPinned = pinned
  notifyLayoutChanged()
}
/** 退出单面板最大化并切换专注模式。 */ export function toggleFocusMode(): void { workspaceState.maximizedPanel = ''; editorState.distractionFree = !editorState.distractionFree; notifyLayoutChanged() }
const MANAGE_TABS: Partial<Record<BottomPanelTab, ManageSection>> = { packages: 'packages', project: 'project', rendering: 'rendering', build: 'build' }
/** 进入管理工作区的指定整页分区并收起底部工具面板。 */ export function openManageSection(section: ManageSection): void { editorState.activeWorkspace = 'manage'; editorState.currentPage = 'manage'; editorState.manageSection = section; editorState.bottomPanelOpen = false; notifyLayoutChanged() }
/** 管理类工具转到整页管理分区，其余工具恢复适当页面并展开对应底栏标签。 */ export function openEditorTool(tab: BottomPanelTab): void {
  const manage = MANAGE_TABS[tab]
  if (manage) { openManageSection(manage); return }
  if (editorState.currentPage === 'settings' || editorState.currentPage === 'manage') editorState.currentPage = editorState.activeWorkspace === 'debug' ? 'game' : 'scene'
  editorState.bottomPanelVisible = true; editorState.bottomPanelOpen = true; editorState.bottomPanelTab = tab === 'presentation' ? 'assets' : tab; notifyLayoutChanged()
}
/** 将存在的底栏标签移动到目标标签位置，忽略缺失或相同项。 */ export function reorderBottomTab(source: BottomPanelTab, target: BottomPanelTab): void { const order = workspaceState.bottomTabOrder; const from = order.indexOf(source), to = order.indexOf(target); if (from < 0 || to < 0 || from === to) return; order.splice(to, 0, order.splice(from, 1)[0]); notifyLayoutChanged() }
/** 清理当前作用域布局存储及适用旧格式，退出安全布局并恢复设计默认值。 */ export function resetEditorLayout(): void {
  try { if (typeof localStorage !== 'undefined') { localStorage.removeItem(storageKey()); localStorage.removeItem(scopedStorageKey(V4_STORAGE_KEY)); if (preferencesState.workspaceLayoutScope === 'user') localStorage.removeItem(LEGACY_STORAGE_KEY) } } catch { /* Reset must remain usable when browser storage is unavailable. */ }
  rememberedLayouts.clear(); workspaceState.safeLayout = false; editorState.activeWorkspace = 'design'; applyLayout(safeDesignLayout)
}
/** 启用不持久化的安全设计布局，供异常恢复使用。 */ export function enableSafeLayout(): void { workspaceState.safeLayout = true; editorState.activeWorkspace = 'design'; applyLayout(safeDesignLayout) }
