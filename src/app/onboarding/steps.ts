/**
 * The walkthrough's segments and steps (26.64, D249, D250). A walk through the real interface, not slides: every step
 * names the control to use and waits until the user **has done it** — `until` is a judgement on the application state
 * (a few read the page through dom.ts: which panel is on screen, whether a 3-D view was turned).
 *
 *   step     { id, page, target, text, until, prepare? }   (D251)
 *     page      the page the step happens on; while another page is shown the engine rings that page's place in the
 *               rail instead and waits for the user to go there (null: wherever the user is)
 *     target    the selector of the control to ring, or a function giving it for the state of the moment
 *     text      one short instruction
 *     until     true once the user has done it
 *     prepare   runs when the step begins on its page (opens the tab the control lives in)
 *     form      segment 0 only: the step is a choice made in the note itself, and has a 下一步 button
 *     look      a step that shows something (the list of changes): it has a button instead of a deed
 *     when      false: the step is left out (Copilot without an account or a key)
 *   segment  { id, title, minutes, steps, enter, resume, leave }
 *     enter     borrow the document: the walk happens on a temporary one (the user's is given back by `leave`)
 *     resume    make the temporary document what the steps before `index` would have left — used when a walk is
 *               taken up again, and when a step is skipped
 *     leave     give the user's document back
 *
 * Five segments, each of five steps at most (D249): 0 设置 · 1 运动 · 2 物理实验 · 3 化学实验 · 4 资源库与 AI; and the walk
 * of "what is new in 26.64" (D250), which is the list of news.ts shown one entry at a time.
 */
import { tl } from '../../i18n'
import { state, loadScene, pause, sceneLoads, serializeCurrent } from '../store'
import type { ShownPage } from '../store'
import { settings } from '../settings'
import { phone, setCopilotOpen, shell, showSideTab } from '../layout'
import { emptyScene, addGround } from '../../core/scene/build'
import { parseScene } from '../../core/scene/io'
import { buildTemplate } from '../../templates'
import { applyTemplateParams, currentTemplate } from '../templateParams'
import { detail } from '../details'
import { peekLab, labRequest } from '../lab/state'
import { ency } from '../../chem/ency/route'
import { copilot } from '../../ai/copilot/session'
import { signedIn } from '../../ai/account'
import { getKey } from '../../ai/keys'
import { clicked, dragged, shown } from './dom'
import type { SegmentId, WalkId } from './state'
import { newsOf, NEWEST } from './news'

export type FormId = 'language' | 'appearance' | 'size' | 'role'
export interface Step {
  id: string
  page: ShownPage | null
  target: string | (() => string)
  /** The instruction, in the language of the moment. */
  text: () => string
  until: () => boolean
  prepare?: () => void
  form?: FormId
  look?: boolean
  when?: () => boolean
}
export interface Segment {
  id: WalkId
  title: () => string
  /** About how long it takes, in minutes (shown where the segment begins). */
  minutes: number
  steps: Step[]
  enter?: () => void | Promise<void>
  resume?: (index: number) => void | Promise<void>
  leave?: () => void
}

const never = () => false
const ui = (id: string) => `[data-ui="${id}"]`
/** The first of the selectors that is on screen (the last one when none is). */
const firstShown = (...sels: string[]) => sels.find(s => shown(s)) ?? sels[sels.length - 1]

// ---- the motion panel's temporary document ----

let lent: { text: string; name: string | null; path: string | null; dirty: boolean; loads: number } | null = null
/** The user's scene as it is now, to be given back (with the count of loaded scenes: the walk's own do not count as the user's work). */
const lend = () => ({ text: serializeCurrent(), name: state.fileName, path: state.filePath, dirty: state.dirty, loads: sceneLoads.n })
function blankScene() {
  const s = emptyScene(tl('入门'))
  addGround(s, { name: tl('地面'), top: 0, left: -6, right: 6, material: { muS: 1, muK: 1, restitution: 1 } })
  s.view = { center: { x: 0, y: 1.2 }, pixelsPerMeter: 110 }
  return s
}
/** Put the user's scene aside (once) and show `scene` instead, without leaving the page shown. */
function borrowScene(scene = blankScene()) {
  lent ??= lend()
  const page = state.page
  pause()
  loadScene(scene, null)
  state.page = page
}
/** Give the user's scene back as it was (name, path, unsaved mark; the undo history starts again). */
function returnScene() {
  if (!lent) return
  const back = lent
  lent = null
  const page = state.page
  pause()
  try { loadScene(parseScene(back.text).scene, back.name, back.path) } catch { return }
  state.dirty = back.dirty
  sceneLoads.n = back.loads
  state.page = page
}
export const sceneLent = () => !!lent

const INCLINE = 'incline'
const theta = () => { const t = currentTemplate(); return t?.info.id === INCLINE ? t.values.theta : null }
const firstEvent = () => (state.recording && !state.stale ? state.recording.events[0]?.t ?? null : null)

function motion(): Segment {
  let t0 = 0
  return {
    id: 'motion', title: () => tl('运动'), minutes: 2,
    enter: () => borrowScene(),
    resume: i => {
      if (i >= 1) { borrowScene(buildTemplate(INCLINE)); if (i >= 4) applyTemplateParams({ theta: 40 }) } else borrowScene()
    },
    leave: returnScene,
    steps: [
      { id: 'template', page: 'studio', target: () => (state.showTemplates ? firstShown(`.titem[data-template="${INCLINE}"]`, '.dialog') : firstShown(ui('templates'), '.doc-menu', ui('file'))), text: () => (phone.value ? tl('打开文件菜单里的“模板库”，选“斜面滑块”，再点“创建场景”。') : tl('打开“模板”，选“斜面滑块”，再点“创建场景”。')), until: () => theta() !== null },
      { id: 'play', page: 'studio', target: () => firstShown(`.page-studio ${ui('play')}`, ui('play'), ui('run')), text: () => tl('按播放，看物块滑下斜面。'), until: () => state.playing },
      {
        id: 'event', page: 'studio', target: () => firstShown(ui('timeline'), '.ptime'), text: () => tl('把时间轴拖到第一个菱形（事件），或按“下一个事件”。'),
        prepare: () => { t0 = state.time },
        until: () => { const te = firstEvent(); return !state.playing && (te === null ? state.time !== t0 && state.time > 0 : Math.abs(state.time - te) <= 0.06) }
      },
      { id: 'angle', page: 'studio', target: () => firstShown(ui('template-params'), ui('sheet-inspect')), text: () => tl('把倾角 θ 改成 40°，结果随即重算。'), prepare: () => { state.rightTab = 'inspect'; if (!phone.value) { showSideTab('inspect'); shell.sideOpen = true } }, until: () => { const a = theta(); return a !== null && Math.abs(a - 40) < 0.5 } },
      { id: 'formula', page: 'studio', target: () => firstShown('.page-studio [data-fid]', ui('sub-formula'), ui('tab-analysis'), ui('sheet-analysis')), text: () => tl('打开“分析”里的一张公式卡片，对照公式与仿真。'), prepare: () => { state.rightTab = 'formula'; if (!phone.value) { showSideTab('analysis'); shell.sideOpen = true } }, until: () => detail.target?.kind === 'formula' || clicked('[data-fid]') }
    ]
  }
}

// ---- physics: the circuit ----

interface CircuitEl { kind: string; closed?: boolean; pos?: number }
interface CircuitState { elements: CircuitEl[]; preset: string }
const circuit = () => peekLab<CircuitState>('circuit')
const circuitEl = (kind: string) => circuit()?.elements.find(e => e.kind === kind) ?? null
/** The preset with a switch, an ammeter and a rheostat ("测电源电动势和内阻"). */
const CIRCUIT_PRESET = 'emf'

function physics(): Segment {
  let kept: { lab: string; circuit: string | null } | null = null
  let pos0 = 0.4
  /** The walk's circuit: the preset, its switch open or closed. */
  const lay = (closed: boolean) => {
    labRequest.lab = 'circuit'; labRequest.preset = CIRCUIT_PRESET; labRequest.seq++
    // the lab loads the preset after this tick (it may still be mounting): set the switch once it is there
    let tries = 0
    const set = () => {
      const c = circuit()
      const sw = c?.preset === CIRCUIT_PRESET ? c.elements.find(e => e.kind === 'switch') : null
      if (sw) { sw.closed = closed; pos0 = circuitEl('rheostat')?.pos ?? 0.4 } else if (++tries < 80) setTimeout(set, 50)
    }
    setTimeout(set, 0)
  }
  const keep = () => { kept ??= { lab: settings.ui.lab, circuit: circuit() ? JSON.stringify(circuit()) : null } }
  return {
    id: 'physics', title: () => tl('物理实验'), minutes: 1,
    // choosing 电路 must be a choice: the panel starts on another experiment for the length of the walk
    enter: () => { keep(); settings.ui.lab = 'lens' },
    resume: i => { keep(); if (i >= 1) { settings.ui.lab = 'circuit'; lay(i >= 2) } else settings.ui.lab = 'lens' },
    leave: () => {
      if (!kept) return
      const c = circuit()
      if (c && kept.circuit) { try { const old = JSON.parse(kept.circuit) as Record<string, unknown>; for (const k of Object.keys(c)) delete (c as unknown as Record<string, unknown>)[k]; Object.assign(c, old) } catch { /* the circuit stays */ } }
      settings.ui.lab = kept.lab
      kept = null
    },
    steps: [
      { id: 'choose', page: 'lab', target: () => firstShown(ui('lab-pick-circuit'), `${ui('lab-page')} ${ui('stage-catalogue')}`), text: () => tl('打开“选择实验”，选“电路”。'), until: () => settings.ui.lab === 'circuit' },
      { id: 'switch', page: 'lab', target: '[data-tour="lab-canvas"]', text: () => tl('开关是断开的：点它一下选中，再点一下合上。'), prepare: () => lay(false), until: () => circuit()?.preset === CIRCUIT_PRESET && circuitEl('switch')?.closed === true },
      { id: 'ammeter', page: 'lab', target: () => firstShown(`${ui('lab-page')} [data-selected-kind="ammeter"]`, '[data-tour="lab-canvas"]'), text: () => tl('点电流表（Ⓐ），在右侧读出它的示数。'), until: () => !!shown(`${ui('lab-page')} [data-selected-kind="ammeter"]`) },
      { id: 'rheostat', page: 'lab', target: () => firstShown(`${ui('lab-page')} [data-selected-kind="rheostat"]`, '[data-tour="lab-canvas"]'), text: () => tl('点滑动变阻器，把“滑片位置”拖到另一端，看电流怎样变。'), prepare: () => { pos0 = circuitEl('rheostat')?.pos ?? 0.4 }, until: () => { const p = circuitEl('rheostat')?.pos; return typeof p === 'number' && (p >= 0.95 || p <= 0.05) && p !== pos0 } }
    ]
  }
}

// ---- chemistry: a titration on the bench ----

type BenchModule = typeof import('../../chem/bench')
type GuideModule = typeof import('../components/chem/guide')
type Bench = ReturnType<BenchModule['useBench']>
const ACID = 'HCl_0.1M', BASE = 'NaOH_0.1M', INDICATOR = 'phenolphthalein', FLASK = 'erlenmeyer', BURETTE = 'buretteBase'

function chem(): Segment {
  let bench: Bench | null = null
  let guide: GuideModule | null = null
  let kept: { doc: ReturnType<Bench['portableDoc']>; name: string | null; dirty: boolean } | null = null
  const load = async () => { bench ??= (await import('../../chem/bench')).useBench(); guide ??= await import('../components/chem/guide') }
  /** The walk's bench is laid out (the chemistry page has been shown and its data are loaded). */
  let laid = false
  let gone = false
  const ready = () => laid && !!bench?.ready.value
  const flask = () => bench?.objects.value.find(o => o.kind === FLASK)?.id ?? null
  const added = (reagent: string, to?: string | null) => !!bench?.log.value.some(a => a.act === 'add' && a.reagent === reagent && (!to || a.to === to))
  const acidIn = () => { const f = ready() ? flask() : null; const v = f ? bench!.read(f)?.volume_mL : null; return !!f && added(ACID, f) && typeof v === 'number' && Math.abs(v - 20) <= 0.5 }
  /**
   * The bench as the steps before `i` leave it. The bench exists once the chemistry page has been shown and its data
   * are loaded, so this waits in the background — the walk meanwhile rings the page's place in the rail.
   */
  const lay = async (i: number) => {
    laid = false
    gone = false
    await load()
    while (!gone && !bench?.ready.value) await new Promise(r => setTimeout(r, 100))
    if (gone || !bench) return
    kept ??= { doc: bench.portableDoc(), name: bench.fileName.value, dirty: bench.dirty.value }
    guide!.useGuide().leave()
    guide!.guideUi.gallery = false
    ency.open = false
    bench.reset()
    if (i < 1) { laid = true; return }
    const f = bench.place(FLASK)
    if (!f) { laid = true; return }
    if (i >= 2) bench.add(f, ACID, { value: 20, unit: 'mL' })
    if (i >= 3) bench.add(f, INDICATOR, { value: 2, unit: 'drop' })
    if (i >= 4) bench.add(f, BASE, { value: 20.1, unit: 'mL' })
    bench.select(f)
    laid = true
  }
  return {
    id: 'chem', title: () => tl('化学实验'), minutes: 2,
    enter: () => { void lay(0) },
    resume: i => { void lay(i) },
    leave: () => {
      gone = true
      laid = false
      if (guide) guide.guideUi.gallery = false
      if (!bench || !kept) return
      try { bench.open(kept.doc, kept.name); bench.dirty.value = kept.dirty } catch { /* the bench stays */ }
      kept = null
    },
    steps: [
      { id: 'flask', page: 'chem', target: () => firstShown(`${ui('chem-apparatus-shelf')} [data-kind="${FLASK}"]`, ui('chem-apparatus-shelf'), ui('chem-apparatus')), text: () => tl('打开“仪器”，从架上取一只锥形瓶。'), until: () => ready() && !!flask() },
      { id: 'acid', page: 'chem', target: () => firstShown(ui('chem-amount'), `${ui('chem-shelf')} [data-reagent="${ACID}"]`, ui('chem-shelf'), `${ui('chem-page')} ${ui('stage-catalogue')}`), text: () => tl('打开“药品”，给锥形瓶加 20 mL 稀盐酸（0.1 mol/L）。'), until: acidIn },
      { id: 'indicator', page: 'chem', target: () => firstShown(ui('chem-amount'), `${ui('chem-shelf')} [data-reagent="${INDICATOR}"]`, ui('chem-shelf'), `${ui('chem-page')} ${ui('stage-catalogue')}`), text: () => tl('再从“药品”里滴 2 滴酚酞。'), until: () => ready() && added(INDICATOR, flask()) },
      {
        id: 'titrate', page: 'chem',
        // what comes next: the burette from the apparatus shelf, the base from the reagent shelf, then the bench
        target: () => {
          if (shown(ui('chem-amount'))) return ui('chem-amount')
          if (!bench?.objects.value.some(o => o.kind === BURETTE)) return firstShown(`${ui('chem-apparatus-shelf')} [data-kind="${BURETTE}"]`, ui('chem-apparatus-shelf'), ui('chem-apparatus'))
          if (!added(BASE)) return firstShown(`${ui('chem-shelf')} [data-reagent="${BASE}"]`, ui('chem-shelf'), `${ui('chem-page')} ${ui('stage-catalogue')}`)
          return firstShown(ui('chem-vessel-menu'), `${ui('chem-page')} .stage`, ui('chem-page'))
        },
        text: () => tl('取碱式滴定管，装氢氧化钠溶液，夹到锥形瓶上方，滴加到溶液变红；读数里的 pH 来自求解器。'),
        until: () => { const f = ready() ? flask() : null; const pH = f ? bench!.read(f)?.pH : null; return added(BASE) && typeof pH === 'number' && pH >= 8.2 }
      },
      // 26.65 (D290): 引导实验 is in the bench's 更多 (⋯), not under 教学
      { id: 'guided', page: 'chem', target: () => firstShown(ui('chem-guide-open'), `${ui('chem-page')} ${ui('stage-more')}`), text: () => tl('打开“⋯”里的“引导实验”：40 个实验按步骤做，每一步由求解器检查。'), until: () => ready() && !!guide?.guideUi.gallery }
    ]
  }
}

// ---- the library and AI ----

const aiReady = () => settings.ai.copilot && (signedIn() || !!getKey('openai') || !!getKey('anthropic'))

function library(): Segment {
  let builds = 0
  return {
    id: 'library', title: () => tl('资源库与 AI'), minutes: 2,
    enter: () => { lent ??= lend() },
    resume: () => { lent ??= lend() },
    leave: () => { ency.open = false; returnScene() },
    steps: [
      {
        id: 'problem', page: null,
        target: () => (state.problem ? firstShown('.problem-panel', ui('tab-problems'), '.sidebar', ui('sheet-analysis')) : state.page === 'library' ? firstShown('.embed-host', ui('library-problems')) : ui(phone.value ? 'nav' : 'page-library')),
        text: () => tl('在资源库的“题目”里选一道题，填上答案，按“揭晓答案”：对错由引擎算出。'),
        prepare: () => { if (!state.problem) { state.librarySection = 'problems'; state.page = 'library' } },
        until: () => !!state.problem?.revealed
      },
      {
        id: 'element', page: null,
        target: () => (state.page !== 'library' && !ency.open ? ui(phone.value ? 'nav' : 'page-library') : ency.view.kind === 'element' ? firstShown(ui('mol3d'), ui('ency-element')) : firstShown(ui('ency-table'), ui('library-matter'))),
        text: () => tl('在“元素与物质”里打开一个元素，切到“单质晶体”，用鼠标或手指转动它。'),
        prepare: () => { state.librarySection = 'matter'; state.page = 'library' },
        until: () => ency.view.kind === 'element' && dragged(ui('mol3d'))
      },
      { id: 'copilot', page: 'studio', when: aiReady, target: () => firstShown(ui('copilot-input'), ui('copilot')), text: () => tl('让 Copilot 搭一个场景，例如“平抛，初速度 3 m/s”。坐标由程序算，答案由引擎核对。'), prepare: () => { ency.open = false; builds = copilot.snapshots.length; setCopilotOpen(true) }, until: () => copilot.snapshots.length > builds },
      { id: 'monitor', page: 'monitor', target: () => firstShown(`.page.is-on ${ui('play')}`, ui('play')), text: () => tl('“监视”把画面放大：按播放。'), prepare: () => { ency.open = false; pause() }, until: () => state.page === 'monitor' && state.playing }
    ]
  }
}

// ---- segment 0: the set-up (choices made in the note itself) ----

function welcome(): Segment {
  const form = (id: FormId, text: () => string): Step => ({ id, page: null, target: '', text, until: never, form: id })
  return {
    id: 'welcome', title: () => tl('设置'), minutes: 1,
    steps: [
      form('language', () => tl('界面用哪种语言？')),
      form('appearance', () => tl('外观与浮层的材质。')),
      form('size', () => tl('界面的大小。')),
      form('role', () => tl('你主要用它来……（决定启动页、“更多”先显示哪一组、公式卡片的详略；以后都能在设置里改。）'))
    ]
  }
}

/** The walk of a list of changes (the newest by default): one entry at a time, each ringing the control it is about. */
export function newsSegment(version: string = NEWEST): Segment {
  return {
    id: 'whatsnew', title: () => tl('{0} 的新变化', [version]), minutes: 1,
    steps: newsOf(version).map((n, i) => ({ id: n.id, page: n.page, target: n.target, text: () => { const m = newsOf(version)[i]; return `${m.title} — ${m.text}` }, until: never, look: true, prepare: n.prepare }))
  }
}
const whatsnew = (): Segment => newsSegment(NEWEST)

/** The definition of a walk, in the language of the moment, without the steps that do not apply. */
export function segmentOf(id: WalkId): Segment {
  const s = id === 'welcome' ? welcome() : id === 'motion' ? motion() : id === 'physics' ? physics() : id === 'chem' ? chem() : id === 'library' ? library() : whatsnew()
  return { ...s, steps: s.steps.filter(st => !st.when || st.when()) }
}

/** Title and length of each of the five segments (the checklist). */
export function segmentList(): Array<{ id: SegmentId; title: string; minutes: number; steps: number }> {
  return (['welcome', 'motion', 'physics', 'chem', 'library'] as const).map(id => { const s = segmentOf(id); return { id, title: s.title(), minutes: s.minutes, steps: s.steps.length } })
}
