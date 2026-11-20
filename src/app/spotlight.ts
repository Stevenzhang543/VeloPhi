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
    file: d('file', tl('文件菜单（新建、打开、保存、分享链接、导出）')),
    menu: d('file', tl('文件菜单（新建、打开、保存、分享链接、导出）')),
    templates: d('templates', tl('模板库')),
    problems: d('problems', tl('题目库')),
    teach: d('teach', tl('“教学”菜单（受力分析图、纸带、班级预测统计、课堂投影）')),
    search: d('search', tl('全局搜索（Ctrl+K）')),
    share: d('file', tl('文件菜单里的“分享链接”')),
    undo: d('undo', tl('撤销')),
    run: d('run', tl('运行 / 重新计算')),
    view: d('view', tl('视图（画面上显示哪些量、深浅色）')),
    compute: d('compute', tl('计算菜单（参数扫描、求解器对照、收敛性研究、计算设置）')),
    help: d('help', tl('左侧导航栏的“帮助”（欢迎与导览、快捷键、学习手册）')),
    'mode-build': d('mode-build', tl('“搭建”模式（工具与属性）')),
    'mode-simulate': d('mode-simulate', tl('“仿真”模式（播放、曲线与事件）')),
    'mode-analyze': d('mode-analyze', tl('“分析”模式（公式、监视、题目）')),
    copilot: d('copilot', 'Copilot'),
    'copilot-input': d('copilot-input', tl('Copilot 输入框（提问或粘贴题目）')),
    'copilot-send': d('copilot-send', tl('Copilot 的发送按钮')),
    'copilot-build': d('copilot-build', tl('“生成仿真场景”按钮（把这道题搭进引擎并验证答案）')),
    // 26.64 (D240): the five panels of the rail; the mark opens the home page; the classroom is a section of the library
    'page-home': d('page-home', tl('导航栏顶部的标志（首页）')),
    'page-studio': d('page-studio', tl('导航栏的“运动”')),
    'page-lab': d('page-lab', tl('导航栏的“物理实验”')),
    'page-chem': d('page-chem', tl('导航栏的“化学实验”')),
    'page-library': d('page-library', tl('导航栏的“资源库”（模板、题目、课堂、元素与物质、手册）')),
    'page-classroom': d('page-library', tl('导航栏的“资源库”（课堂分区在里面）')),
    'page-monitor': d('page-monitor', tl('导航栏的“监视”')),
    'page-settings': d('page-settings', tl('导航栏的“设置”')),
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

/** Targets that are inside a second-level layer (26.64, D243): the `data-ui` of the control that opens the layer. */
const ONE_LEVEL_DOWN: Record<string, string> = { problems: 'studio-more', view: 'studio-more', teach: 'studio-more', compute: 'studio-more', sidebar: 'studio-more', objects: 'palette' }

export const spotlight = reactive({ key: '' as string, selector: '', title: '', text: '', seq: 0 })

/** Point at a part of the interface; false when it is not on screen. */
export function pointTo(key: string, note: string): boolean {
  const t = uiTargets()[key]
  if (!t) return false
  const shown = (sel: string) => { const e = document.querySelector(sel) as HTMLElement | null; return e && e.getClientRects().length ? e : null }
  // 26.64 (D245): what moved one level down is pointed at through the control that opens it
  const selector = shown(t.selector) ? t.selector : ONE_LEVEL_DOWN[key] ? `[data-ui="${ONE_LEVEL_DOWN[key]}"]` : t.selector
  const el = shown(selector)
  if (!el) return false
  spotlight.key = key
  spotlight.selector = selector
  spotlight.title = t.name
  spotlight.text = note
  spotlight.seq++
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  return true
}

export function clearSpotlight() { spotlight.key = ''; spotlight.selector = '' }
