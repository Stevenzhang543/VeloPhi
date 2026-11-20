/**
 * The walkthrough engine (26.64, D249, D251). It runs one walk at a time — one of the five segments, or the list of
 * changes — and moves on **when the user has done the step**: `tick()` looks at the application (the step's `until`)
 * a few times a second; there is no "next" button on a step that asks for a deed. The overlay (WalkthroughOverlay.vue)
 * only draws what `walk` says.
 *
 *   startWalk(id)      begin, or take up again at the step this device reached (the record of state.ts)
 *   tick()             one look at the application: the page, the step's preparation, its `until`
 *   skipStep()         "跳过这一步": the segment's `resume` makes the document what the step would have left
 *   skipSegment()      leave this segment unfinished and go to the one after it
 *   closeWalk()        "稍后继续": the user's document comes back; the step reached is kept
 *   continueWalk()     from the end of a segment to the next unfinished one
 *   showNews(id)       "带我去看": one entry of the list of changes, ringed where it is
 *
 * The walk happens on a temporary document (`enter` / `resume` of the segment borrow it, `leave` gives the user's
 * back), so nothing of the user's work is touched. A step whose page is not the one shown does not switch pages: the
 * ring goes to that page's place in the rail and the walk waits for the user to go there. (The entries of the list of
 * changes are looks, not deeds: those do show their page, D250.)
 */
import { markRaw, reactive } from 'vue'
import { tl } from '../../i18n'
import { state, showToast } from '../store'
import { settings } from '../settings'
import { phone } from '../layout'
import { ENGINE_VERSION } from '../../core/scene/types'
import { panels } from '../panels'
import { clearGestures, shown, watchGestures } from './dom'
import { SEGMENTS, loadOnboarding, minorOf, nextSegment, offer, onboarding, roleDefaults, saveOnboarding, withDone, withRestart, withSeen, withStep } from './state'
import type { Offer, Role, SegmentId, WalkId } from './state'
import { newsSegment, segmentOf } from './steps'
import type { Segment, Step } from './steps'
import { NEWS_VERSIONS, newsOf, onboardingVersion } from './news'

export type Phase = 'step' | 'ok' | 'done'
export const walk = reactive({
  id: null as WalkId | null,
  minutes: 0,
  index: 0,
  total: 0,
  phase: 'step' as Phase,
  step: null as Step | null,
  /** The step's page is not the one shown: the ring is on the rail and the note says where to go. */
  elsewhere: false,
  /** One entry shown on its own ("带我去看"): closing it ends the walk. */
  single: false,
  /** The walk is being laid out (the temporary document is being made). */
  busy: false
})

let segment: Segment | null = null
let prepared = false
let timer: ReturnType<typeof setInterval> | null = null
let settle: ReturnType<typeof setTimeout> | null = null
/** How long a finished step stays on screen with its tick before the next one (0 in tests: at once). */
export const timing = { okMs: 650, tickMs: 150 }

const isSegment = (id: WalkId): id is SegmentId => (SEGMENTS as readonly string[]).includes(id)
const version = () => onboardingVersion(ENGINE_VERSION)

function setStep(i: number) {
  if (!segment) return
  walk.index = i
  walk.step = markRaw(segment.steps[i])
  walk.phase = 'step'
  walk.elsewhere = false
  prepared = false
  clearGestures()
  if (walk.id && isSegment(walk.id) && !walk.single) saveOnboarding(withStep(onboarding.record, walk.id, i))
}

/** Begin a walk, or take it up where this device left it. `segment` lets a test supply its own definition. */
export async function startWalk(id: WalkId, opts: { from?: number; single?: boolean; segment?: Segment; restart?: boolean } = {}) {
  if (walk.id) closeWalk()
  const seg = opts.segment ?? segmentOf(id)
  if (!seg.steps.length) return
  let rec = withSeen(onboarding.record, version())
  if (isSegment(id) && (opts.restart || rec.segments[id].done)) rec = withRestart(rec, id)
  saveOnboarding(rec)
  const from = Math.min(seg.steps.length - 1, Math.max(0, opts.from ?? (isSegment(id) ? rec.segments[id].step : 0)))
  segment = seg
  walk.id = id
  walk.minutes = seg.minutes
  walk.total = seg.steps.length
  walk.single = !!opts.single
  walk.busy = true
  walk.step = null
  walk.index = from
  walk.phase = 'step'
  watchGestures(true)
  try { if (from > 0 && seg.resume) await seg.resume(from); else await seg.enter?.() } finally { walk.busy = false }
  // closed or replaced while it was being laid out
  if (segment !== seg) return
  setStep(from)
  if (timing.tickMs > 0 && typeof window !== 'undefined') { if (timer) clearInterval(timer); timer = setInterval(tick, timing.tickMs) }
}

/** One look at the application. */
export function tick() {
  const st = walk.step
  if (!segment || !st || walk.phase !== 'step' || walk.busy) return
  // a look (the list of changes) takes the user to its page; a deed waits for the user to go there
  if (st.look && st.page && state.page !== st.page) state.page = st.page
  if (st.page && state.page !== st.page) { walk.elsewhere = true; return }
  walk.elsewhere = false
  if (!prepared) { prepared = true; try { st.prepare?.() } catch { /* the step still shows */ } return }
  let done = false
  try { done = st.until() } catch { done = false }
  if (done) completeStep()
}

function completeStep() {
  walk.phase = 'ok'
  if (timing.okMs <= 0) { advance(); return }
  if (settle) clearTimeout(settle)
  settle = setTimeout(advance, timing.okMs)
}

function advance() {
  settle = null
  if (!segment || !walk.id) return
  if (walk.single) { closeWalk(); return }
  if (walk.index + 1 >= segment.steps.length) { finish(); return }
  setStep(walk.index + 1)
}

function finish() {
  if (!walk.id) return
  if (isSegment(walk.id)) saveOnboarding(withDone(onboarding.record, walk.id))
  if (walk.id === 'whatsnew') { closeWalk(); return }
  walk.phase = 'done'
  walk.step = null
}

/** The button of a step that is a choice or a look (segment 0, the list of changes). */
export function nextStep() { if (walk.phase === 'step' && walk.step && (walk.step.form || walk.step.look)) advance() }

/** "跳过这一步": the walk goes on as if the step had been done. */
export async function skipStep() {
  const seg = segment
  if (!seg || !walk.id || walk.phase !== 'step' || walk.busy) return
  if (walk.single) { closeWalk(); return }
  const i = walk.index + 1
  if (i >= seg.steps.length) { finish(); return }
  if (seg.resume) { walk.busy = true; try { await seg.resume(i) } finally { walk.busy = false } }
  if (segment === seg) setStep(i)
}

function stop() {
  if (timer) { clearInterval(timer); timer = null }
  if (settle) { clearTimeout(settle); settle = null }
  watchGestures(false)
  const seg = segment
  segment = null
  walk.id = null
  walk.step = null
  walk.phase = 'step'
  walk.single = false
  walk.elsewhere = false
  try { seg?.leave?.() } catch { /* nothing to give back */ }
}

/** "稍后继续": the user's document comes back; the step reached is kept for the next time. */
export function closeWalk() { if (walk.id) stop() }

/** Leave this segment unfinished and begin the one after it (the end of the list closes the walk). */
export function skipSegment() {
  const id = walk.id
  if (!id) return
  stop()
  if (!isSegment(id)) return
  const after = SEGMENTS[SEGMENTS.indexOf(id) + 1]
  if (after) void startWalk(after)
}

/** From the end of a segment: the next one that is not finished, in order. */
export function continueWalk() {
  stop()
  const next = nextSegment(onboarding.record)
  if (next) void startWalk(next)
}
export const upNext = (): SegmentId | null => nextSegment(onboarding.record)

/** "带我去看": show the page of one entry of the list and ring its control. */
export function showNews(id: string, version?: string) {
  // 26.65: without a version, the newest list that has the entry
  const v = version ?? NEWS_VERSIONS.find(x => newsOf(x).some(n => n.id === id)) ?? NEWS_VERSIONS[0]
  const i = newsOf(v).findIndex(n => n.id === id)
  if (i < 0) return
  const item = newsOf(v)[i]
  if (item.page) state.page = item.page
  // 26.65: the entry is walked in the list of its own version (Help › 新变化 shows every list)
  void startWalk('whatsnew', { from: i, single: true, segment: newsSegment(v) })
}

/** Help › 入门 / 新变化: the dialog with the checklist and the list of changes (`state.showWelcome` shows it). */
export const guideUi = reactive({ tab: 'list' as 'list' | 'news' })
export function openGuide(tab: 'list' | 'news' = 'list') {
  guideUi.tab = tab
  if (tab === 'news' && offered.kind === 'new') { saveOnboarding(withSeen(onboarding.record, version())); refreshOffer() }
  state.showWelcome = true
}

// ---- what is offered on this device (D248) ----

export const offered = reactive({ kind: 'none' as Offer, quiet: false })

/**
 * Opened from a share link (a scene `#s=`, a bench `#b=`, an element, a substance or a nuclide `#e=` `#m=` `#n=`), in
 * classroom projection, or under the automatic tests (`?uitest=1`, the release self-check): the onboarding stays out
 * of the way (D248). `?onboard=1` is how the tests of the onboarding itself ask for it.
 */
export function isQuiet(search: string, hash: string, projector: boolean): boolean {
  if (/[?&]onboard=1\b/.test(search)) return false
  if (/[?&](uitest=1|selftest)\b/.test(search)) return true
  if (/^#(s|b|e|m|n)=/.test(hash)) return true
  return projector
}
function quietStart(): boolean {
  return typeof location === 'undefined' ? true : isQuiet(location.search, location.hash, settings.projector)
}

export function refreshOffer() {
  offered.kind = offer(onboarding.record, { version: version(), welcomedBefore: settings.ui.welcomed, versionsWithNews: [...NEWS_VERSIONS], quiet: offered.quiet })
}

/** Read the record and decide the offer (once, at start-up). Nothing opens by itself. */
export function initOnboarding() {
  loadOnboarding()
  offered.quiet = quietStart()
  refreshOffer()
}

/** 开始: the first segment that is not finished. */
export function beginOnboarding() {
  settings.ui.welcomed = true
  const next = nextSegment(onboarding.record) ?? 'welcome'
  void startWalk(next).then(refreshOffer)
}
/** "以后再说" / closing the offer: it does not come back for this version. */
export function dismissOffer() {
  settings.ui.welcomed = true
  saveOnboarding(withSeen(onboarding.record, version(), new Date().toISOString()))
  refreshOffer()
}
export function beginNews() {
  saveOnboarding(withSeen(onboarding.record, version()))
  refreshOffer()
  void startWalk('whatsnew', { from: 0 })
}

/** "你主要用它来……": the defaults that follow from the answer (all of them are ordinary settings). */
export function applyRole(role: Role) {
  const d = roleDefaults(role)
  settings.ui.role = role
  settings.ui.startPage = d.startPage
  settings.ui.formula.density = d.formulaDensity
}

/** Title of the walk and text of its step, in the language of the moment. */
export const walkTitle = (): string => segment?.title() ?? ''
export const stepText = (): string => walk.step?.text() ?? ''

/** Where the ring goes: the step's control, or — on another page — that page's place in the rail. */
export function ringSelector(): string {
  const st = walk.step
  if (!st || walk.phase === 'done') return ''
  if (walk.elsewhere && st.page) {
    const item = `[data-ui="page-${st.page}"]`
    return shown(item) ? item : phone.value ? '[data-ui="nav"]' : item
  }
  const t = typeof st.target === 'function' ? st.target() : st.target
  return t
}
/** The name of the page a step waits for. */
export function pageName(page: string): string {
  return panels().find(p => p.page === page)?.label ?? (page === 'home' ? tl('首页') : page)
}

// ---- things that moved: one hint, once, where they used to be (D250) ----

const HINT_KEY = 'velophi.onboarding.hints'
/** Say once on this device that something moved (the first time it is looked for in its old place). */
export function movedHint(key: 'alt6' | 'classroom', text: string) {
  let seen: string[] = []
  try { seen = JSON.parse(localStorage.getItem(HINT_KEY) ?? '[]') as string[] } catch { seen = [] }
  if (!Array.isArray(seen) || seen.includes(key)) return
  try { localStorage.setItem(HINT_KEY, JSON.stringify([...seen, key])) } catch { /* said again next time */ }
  showToast(text)
}

export { minorOf }
