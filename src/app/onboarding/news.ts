/**
 * "What is new" (26.64, D250; 26.65 adds its list): a standing list, grouped by version. Every entry can take the user there ("带我去看":
 * the page is shown and the control ringed). A version that has a list here is one whose changes are offered to a
 * device that last saw another version (D248); a version without one changes nothing for its users.
 *
 * An entry: { id, title, text, page, target, prepare? } — `target` is the selector of the control it is about.
 */
import { tl } from '../../i18n'
import { state } from '../store'
import type { ShownPage } from '../store'
import { ENGINE_VERSION } from '../../core/scene/types'
import { minorOf } from './state'
import { shown } from './dom'

export interface NewsItem { id: string; title: string; text: string; page: ShownPage | null; target: string | (() => string); prepare?: () => void }

const ui = (id: string) => `[data-ui="${id}"]`

/** The versions that have a list, newest first. */
export const NEWS_VERSIONS = ['26.65', '26.64'] as const
export const NEWEST: string = NEWS_VERSIONS[0]

/**
 * The version the onboarding runs as: the program's, or the newest version that has a list when the program's number
 * is still behind it (the list is written with the release notes, the number is raised at the release).
 */
export function onboardingVersion(program: string = ENGINE_VERSION): string {
  const [a, b] = minorOf(program).split('.').map(Number)
  const [c, d] = NEWEST.split('.').map(Number)
  return a > c || (a === c && b >= d) ? minorOf(program) : NEWEST
}

export function newsOf(version: string): NewsItem[] {
  const v = minorOf(version)
  if (v === '26.65') return news2665()
  if (v !== '26.64') return []
  return [
    { id: 'panels', title: tl('五个面板'), text: tl('运动、物理实验、化学实验、资源库、监视。“工作台”现在叫“运动”，“实验室”叫“物理实验”。'), page: null, target: 'nav.rail .items:not(.foot), [data-ui="nav"]' },
    { id: 'keys', title: tl('Alt+1…5'), text: tl('Alt+1 到 Alt+5 按导航栏的顺序打开五个面板，Alt+0 回首页。'), page: null, target: 'nav.rail .items:not(.foot), [data-ui="nav"]' },
    { id: 'home', title: tl('首页'), text: tl('点左上角的标志回到首页；搜索在导航栏和 Ctrl+K。'), page: null, target: `${ui('page-home')}, ${ui('nav')}` },
    { id: 'chem', title: tl('化学实验'), text: tl('新的实验台：取仪器、加药品，现象与读数由求解器算出；另有 40 个引导实验和元素与物质的百科。'), page: 'chem', target: `${ui('chem-page')} .sbar` },
    { id: 'more', title: tl('“更多”'), text: tl('运动面板的题目、视图、教学、计算收进了“更多”，按这四个名字分组。'), page: 'studio', target: () => (shown(ui('studio-more')) ? ui('studio-more') : ui('file')) },
    { id: 'tools', title: tl('全部工具'), text: tl('画布左侧留六个常用工具；其余的、对象列表和吸附开关在“全部工具”里，都带名称。'), page: 'studio', target: `${ui('palette')}, ${ui('sheet-tools')}` },
    { id: 'labs', title: tl('选择实验'), text: tl('物理实验的目录是一个浮层，按领域排列；导出、导入、重置在“更多”里。'), page: 'lab', target: `${ui('lab-page')} ${ui('stage-catalogue')}` },
    { id: 'classroom', title: tl('课堂'), text: tl('课堂并入资源库的“课堂”分区；班级统计与课堂投影在各面板的“教学”里。'), page: 'library', target: ui('library-classroom'), prepare: () => { state.librarySection = 'classroom' } },
    { id: 'guide', title: tl('入门'), text: tl('“帮助 › 入门”可以随时重走任意一段；这张列表在“帮助 › 新变化”。'), page: null, target: `${ui('help')}, ${ui('nav')}` }
  ]
}

/** 26.65 (D290–D297): one bar, one inspector, the home page at every start, the freer chemistry bench. */
function news2665(): NewsItem[] {
  return [
    { id: 'bar', title: tl('一条工具栏'), text: tl('运动面板上方只留一条栏：左边是文件、撤销、模板与运行，右边是属性、分析、题目和 AI 的开关。'), page: 'studio', target: 'header.ctxbar .views' },
    { id: 'inspector', title: tl('属性'), text: tl('右栏只有一个属性面板：选中物体时显示它的参数，什么都不选时显示整个场景。'), page: 'studio', target: () => (shown('aside.sidebar') ? 'aside.sidebar' : ui('tab-props')) },
    { id: 'status', title: tl('状态栏'), text: tl('求解器与它的状态移到了底部的状态栏。'), page: 'studio', target: 'footer.status' },
    { id: 'start', title: tl('从首页开始'), text: tl('每次启动都打开首页；Alt+1…5 直接去各面板。'), page: null, target: `${ui('page-home')}, ${ui('nav')}` },
    { id: 'bench', title: tl('化学实验台'), text: tl('仪器可以倾倒、加塞、加热和组装；溢出、冲开塞子与骤冷炸裂都由求解器判定。'), page: 'chem', target: `${ui('chem-page')} .sbar` }
  ]
}

/** Every list, newest first (Help › 新变化). */
export function allNews(): Array<{ version: string; items: NewsItem[] }> {
  return NEWS_VERSIONS.map(v => ({ version: v, items: newsOf(v) }))
}
