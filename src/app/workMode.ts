/**
 * Work modes of the studio (26.57, D118; manual §3.1, VP-10): learning, solving, experimenting and editing are
 * presets of what the studio shows — the right panel's tab, the bottom tab, the tool rail and the overlays — over one
 * scene. Switching never touches the scene, the selection, the playback time, the task or its drafts. What the user
 * changes while in a mode (a tab, an overlay) is remembered for that mode; “恢复默认” returns the mode to its preset.
 */
import { reactive, watch } from 'vue'
import { state } from './store'
import type { DisplayOptions } from './settings'
import { settings } from './settings'
import { circularTransition } from './viewTransition'

export type WorkMode = 'learn' | 'solve' | 'experiment' | 'edit'
type RightTab = 'formula' | 'watch' | 'predict' | 'inspect' | 'settings' | 'task'
interface Preset { rightTab: RightTab; bottomTab: 'chart' | 'events'; rail: boolean; display: Partial<DisplayOptions> }

export const WORK_MODES: Array<{ id: WorkMode; label: string; icon: string; tip: string }> = [
  { id: 'learn', label: '学习', icon: 'graduation', tip: '为什么会这样：演示、受力与公式' },
  { id: 'solve', label: '解题', icon: 'problem', tip: '已知什么、求什么：任务、步骤与核对' },
  { id: 'experiment', label: '实验', icon: 'flask', tip: '改变一个参数会怎样：监视、曲线与扫描' },
  { id: 'edit', label: '编辑', icon: 'pen', tip: '搭建模型：工具、属性与场景诊断' }
]

export const MODE_PRESETS: Record<WorkMode, Preset> = {
  learn: { rightTab: 'formula', bottomTab: 'chart', rail: true, display: { velocity: true, acceleration: false, forces: true, trajectory: true, labels: true } },
  solve: { rightTab: 'task', bottomTab: 'events', rail: true, display: { velocity: false, acceleration: false, forces: true, trajectory: false, labels: true } },
  experiment: { rightTab: 'watch', bottomTab: 'chart', rail: true, display: { velocity: true, acceleration: false, forces: false, trajectory: true, labels: true } },
  edit: { rightTab: 'inspect', bottomTab: 'chart', rail: false, display: { velocity: false, acceleration: false, forces: false, trajectory: false, labels: false, grid: true, names: true } }
}

const KEY = 'velophi.workmode.v1'
interface Memory { rightTab?: RightTab; bottomTab?: 'chart' | 'events'; rail?: boolean; display?: Partial<DisplayOptions> }
export const work = reactive<{ mode: WorkMode | null; memory: Partial<Record<WorkMode, Memory>> }>({ mode: null, memory: {} })
try { const raw = localStorage.getItem(KEY); if (raw) Object.assign(work, JSON.parse(raw)) } catch { /* layout only */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(work)) } catch { /* layout only */ } }

const DISPLAY_KEYS: Array<keyof DisplayOptions> = ['velocity', 'acceleration', 'forces', 'trajectory', 'labels', 'grid', 'names']
function snapshot(): Memory {
  const display: Partial<DisplayOptions> = {}
  for (const k of DISPLAY_KEYS) (display as Record<string, unknown>)[k] = state.display[k]
  return { rightTab: state.rightTab === 'problem' ? undefined : state.rightTab as RightTab, bottomTab: state.bottomTab, rail: settings.ui.toolRail, display }
}

/** Apply a mode: the remembered layout of that mode, else its preset. */
function apply(mode: WorkMode) {
  const p = MODE_PRESETS[mode], m = work.memory[mode] ?? {}
  if (state.rightTab !== 'problem' || !state.problem) state.rightTab = m.rightTab ?? p.rightTab
  state.bottomTab = m.bottomTab ?? p.bottomTab
  settings.ui.toolRail = m.rail ?? p.rail
  Object.assign(state.display, p.display, m.display ?? {})
}

/** Switch the work mode (from the pointer position when there is one: the circular transition starts there). */
export function setWorkMode(mode: WorkMode, origin?: { x: number; y: number }) {
  if (work.mode === mode) return
  if (work.mode) work.memory[work.mode] = snapshot()
  return circularTransition(() => {
    work.mode = mode
    state.page = 'studio'
    apply(mode)
    save()
  }, origin)
}

/** Back to the preset of the current mode (forget what was changed in it). */
export function resetWorkMode() {
  if (!work.mode) return
  delete work.memory[work.mode]
  apply(work.mode)
  save()
}

// What the user changes inside a mode is remembered for it (not for the others)
watch(() => [state.rightTab, state.bottomTab, settings.ui.toolRail, ...DISPLAY_KEYS.map(k => state.display[k])], () => {
  if (!work.mode) return
  work.memory[work.mode] = snapshot()
  save()
})
