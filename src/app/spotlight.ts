/**
 * "Show me where" (26.59, D168): a ring around one control with a short note, without blocking the interface —
 * the user clicks the control themselves. Used by Copilot's `point_to`. Targets are a fixed list of named parts of
 * the interface (`data-ui` attributes or panel selectors), so the AI can only point at things that exist.
 */
import { reactive } from 'vue'
import { tl } from '../i18n'

export interface UiTarget { selector: string; name: string }

/** The parts of the interface Copilot may point at (key → selector, name). */
export function uiTargets(): Record<string, UiTarget> {
  const d = (key: string, name: string): UiTarget => ({ selector: `[data-ui="${key}"]`, name })
  return {
    file: d('file', tl('文件菜单（新建、打开、保存）')),
    templates: d('templates', tl('模板库')),
    problems: d('problems', tl('题目库')),
    teach: d('teach', tl('教学菜单（学习路径、模型目录、受力分析图）')),
    search: d('search', tl('全局搜索（Ctrl+K）')),
    undo: d('undo', tl('撤销')),
    run: d('run', tl('重新计算 / 计算状态')),
    view: d('view', tl('视图菜单（工作方式、画面上显示哪些量、深浅色）')),
    compute: d('compute', tl('计算菜单（参数扫描、求解器对照、计算设置）')),
    help: d('help', tl('帮助菜单（欢迎与导览、学习手册、快捷键）')),
    copilot: d('copilot', 'Copilot'),
    'copilot-input': d('copilot-input', tl('Copilot 输入框（提问或粘贴题目）')),
    'copilot-send': d('copilot-send', tl('Copilot 的发送 / 搭建按钮')),
    'copilot-mode-solve': d('copilot-mode-solve', tl('Copilot 的“解题”页（讲解思路与解法）')),
    'copilot-mode-sim': d('copilot-mode-sim', tl('Copilot 的“仿真”页（用引擎搭建题目）')),
    'page-studio': d('page-studio', tl('工作台')),
    'page-lab': d('page-lab', tl('实验室')),
    'page-monitor': d('page-monitor', tl('渲染与监视')),
    'page-settings': d('page-settings', tl('设置')),
    tools: { selector: '.page-studio .left', name: tl('左侧工具栏（放置物体与连接件）') },
    canvas: { selector: '.page-studio .view', name: tl('画布') },
    timeline: { selector: '.page-studio .pane.bottom', name: tl('时间轴与曲线') },
    'right-panel': { selector: '.page-studio .pane.right', name: tl('右侧面板') },
    'tab-task': d('tab-task', tl('“任务”页（粘贴题目、求解与核对）')),
    'tab-problem': d('tab-problem', tl('“题目”页（作答与揭晓）')),
    'tab-analysis': d('tab-analysis', tl('“分析”页（公式、监视、预测）')),
    'tab-inspect': d('tab-inspect', tl('“属性”页（选中物体的参数、题目参数）')),
    'tab-settings': d('tab-settings', tl('“场景”页（重力、时长、计算方式）')),
    'sub-formula': d('sub-formula', tl('公式卡片')),
    'sub-watch': d('sub-watch', tl('监视（任意物理量的读数）')),
    'sub-predict': d('sub-predict', tl('预测')),
    play: d('play', tl('播放 / 暂停（空格）')),
    'next-event': d('next-event', tl('跳到下一个事件')),
    speed: d('speed', tl('播放速度')),
    branch: d('branch', tl('从此刻分支')),
    'bottom-chart': d('bottom-chart', tl('曲线')),
    'bottom-events': d('bottom-events', tl('事件列表')),
    'chart-kin': d('chart-kin', tl('x‑t / v‑t / a‑t 曲线')),
    'chart-energy': d('chart-energy', tl('能量曲线')),
    'chart-force': d('chart-force', tl('受力曲线')),
    'template-params': { selector: '.template-params', name: tl('题目参数卡片') }
  }
}

export const spotlight = reactive({ key: '' as string, selector: '', title: '', text: '', seq: 0 })

/** Point at a part of the interface; false when it is not on screen. */
export function pointTo(key: string, note: string): boolean {
  const t = uiTargets()[key]
  if (!t) return false
  const el = document.querySelector(t.selector) as HTMLElement | null
  if (!el || !el.getClientRects().length) return false
  spotlight.key = key
  spotlight.selector = t.selector
  spotlight.title = t.name
  spotlight.text = note
  spotlight.seq++
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  return true
}

export function clearSpotlight() { spotlight.key = ''; spotlight.selector = '' }
