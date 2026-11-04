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
    file: d('file', tl('左上角的菜单（文件与导出、模板与题目、教学工具、页面、帮助）')),
    menu: d('file', tl('左上角的菜单（文件与导出、模板与题目、教学工具、页面、帮助）')),
    templates: d('templates', tl('模板库')),
    problems: d('problems', tl('题目库')),
    teach: d('file', tl('菜单里的“教学”（学习路径、模型目录、受力分析图、纸带）')),
    search: d('search', tl('全局搜索（Ctrl+K）')),
    undo: d('undo', tl('撤销')),
    run: d('run', tl('运行 / 重新计算')),
    view: d('view', tl('视图（画面上显示哪些量、深浅色）')),
    compute: d('compute', tl('计算菜单（参数扫描、求解器对照、计算设置）')),
    help: d('file', tl('菜单里的“帮助”（欢迎与导览、学习手册、快捷键）')),
    'mode-build': d('mode-build', tl('“搭建”模式（工具与属性）')),
    'mode-simulate': d('mode-simulate', tl('“仿真”模式（播放、曲线与事件）')),
    'mode-analyze': d('mode-analyze', tl('“分析”模式（公式、监视、题目）')),
    copilot: d('copilot', 'Copilot'),
    'copilot-input': d('copilot-input', tl('Copilot 输入框（提问或粘贴题目）')),
    'copilot-send': d('copilot-send', tl('Copilot 的发送按钮')),
    'copilot-build': d('copilot-build', tl('“生成仿真场景”按钮（把这道题搭进引擎并验证答案）')),
    'page-studio': d('page-studio', tl('返回工作台')),
    'page-lab': d('file', tl('菜单里的“实验室”')),
    'page-monitor': d('file', tl('菜单里的“渲染与监视”')),
    'page-settings': d('file', tl('菜单里的“设置”')),
    tools: d('tools', tl('画布左侧的工具条（选择、平移、常用工具、吸附）')),
    palette: d('palette', tl('全部工具（物体、轨道、连接、力与场、编辑、标注）')),
    objects: d('objects', tl('对象列表')),
    canvas: { selector: '.page-studio .view', name: tl('画布') },
    timeline: d('timeline', tl('时间轴（展开后是曲线与事件）')),
    'right-panel': { selector: '.sidebar', name: tl('右侧的侧栏') },
    sidebar: d('sidebar', tl('展开或收起侧栏')),
    'tab-props': d('tab-props', tl('侧栏的“属性”页（所选物体、场景设置）')),
    'tab-analysis': d('tab-analysis', tl('侧栏的“分析”页（公式、监视、预测）')),
    'tab-problems': d('tab-problems', tl('侧栏的“题目”页（作答与揭晓、任务）')),
    'tab-ai': d('tab-ai', tl('侧栏的 AI 页（Copilot）')),
    'tab-task': d('tab-task', tl('“任务”（粘贴题目、求解与核对）')),
    'tab-problem': d('tab-problem', tl('“题目”（作答与揭晓）')),
    'tab-inspect': d('tab-inspect', tl('“对象”（选中物体的参数、题目参数）')),
    'tab-settings': d('tab-settings', tl('“场景”（重力、时长、计算方式）')),
    'sub-formula': d('sub-formula', tl('公式卡片')),
    'sub-watch': d('sub-watch', tl('监视（任意物理量的读数）')),
    'sub-predict': d('sub-predict', tl('预测')),
    play: d('play', tl('播放 / 暂停（空格）')),
    'next-event': d('next-event', tl('跳到下一个事件')),
    speed: d('speed', tl('播放速度')),
    branch: d('branch', tl('从此刻分支（展开时间轴后可见）')),
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
