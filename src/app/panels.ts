/**
 * The five panels of the shell (26.64, D240), top to bottom in the rail: 运动 · 物理实验 · 化学实验 · 资源库 · 监视. One
 * list for the rail, the phone drawer, the home page's jump blocks, the context bar's title and the global search, so
 * a panel is called the same thing and drawn with the same icon everywhere.
 *
 * `tone` names the panel's identity colour (tokens --panel-*; class `.panel-<tone>` sets --panel). That colour is used
 * in three places only: the rail's selected indicator, the accent line of the panel's stage, and empty-state drawings.
 */
import { tl } from '../i18n'
import { T3 } from './models/labels'
import { T } from '../content/models/types'
import type { ShownPage } from './store'
import { PANEL_KEYS } from './shortcuts'

export type PanelTone = 'motion' | 'physics' | 'chem' | 'library' | 'monitor'

export interface PanelInfo {
  page: ShownPage
  /** Name on the rail and in titles. */
  label: string
  /** One line: what is in the panel (home page, drawer, search). */
  line: string
  icon: string
  tone: PanelTone
  /** Alt + this digit opens the panel. */
  digit: number
}

const TONES: Record<string, PanelTone> = { studio: 'motion', lab: 'physics', chem: 'chem', library: 'library', monitor: 'monitor' }
const ICONS: Record<string, string> = { studio: 'motion', lab: 'physicsLab', chem: 'chemLab', library: 'library', monitor: 'monitor' }

/** The panels in rail order, in the interface language (call inside a computed: the texts follow the language). */
export function panels(): PanelInfo[] {
  const text: Record<string, [string, string]> = {
    studio: [tl('运动'), tl('力学场景的搭建、运行与分析')],
    lab: [tl('物理实验'), tl('电与磁、光、波、热、近代物理')],
    chem: [tl('化学实验'), tl('实验台、引导实验、元素与物质')],
    library: [tl('资源库'), tl('模板、题目、课堂、学习手册')],
    // 监视 as a page name (the Watch panel of the sidebar has the same Chinese name and another German one)
    monitor: [T3(T('监视', 'Monitor', 'Monitor')), tl('大画面播放与读数')]
  }
  return PANEL_KEYS.map(k => ({ page: k.page, label: text[k.page][0], line: text[k.page][1], icon: ICONS[k.page], tone: TONES[k.page], digit: k.digit }))
}

/** Title and icon of any shown page (the context bar, the phone's top bar). */
export function pageTitle(page: ShownPage): { label: string; icon: string; tone: PanelTone | null } {
  if (page === 'home') return { label: tl('首页'), icon: 'home', tone: null }
  if (page === 'settings') return { label: tl('设置'), icon: 'settings', tone: null }
  const p = panels().find(x => x.page === page)!
  return { label: p.label, icon: p.icon, tone: p.tone }
}

/**
 * The page shown at start (D240): the home page, or 运动 when the setting says so or when the start is a direct one — a
 * share link in the address, an interface test, the release self-check, an Android diagnosis switch.
 */
export function initialPage(setting: 'home' | 'studio', direct: boolean): ShownPage {
  return !direct && setting === 'home' ? 'home' : 'studio'
}
