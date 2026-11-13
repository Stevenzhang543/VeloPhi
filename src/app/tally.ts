/**
 * Class tally (26.63, D235): "predict, commit, run, discuss" for a class without student devices. The teacher shows a
 * question with two to four options, counts the show of hands (or the voting cards) into the tally, locks it and runs
 * the scene; after the result is revealed the class can discuss and vote once more, and the card shows how the
 * distribution moved between the two rounds (peer instruction). Nothing identifies a student: only counts are kept.
 *
 * The answer of a prepared case is never shown before the reveal — the teacher's screen is the projected one.
 * The last tallies are kept on this computer (localStorage) for the classroom page.
 */
import { reactive } from 'vue'
import { tl } from '../i18n'
import { ask } from '../platform/ask'
import { buildTemplate } from '../templates'
import { caseById } from '../teaching/cases'
import type { TeachingCase } from '../teaching/cases'
import { T3 } from './models/labels'
import { state, loadScene, pause, play, runSimulation, seekFrame } from './store'
import { setStudioMode } from './layout'
import { logEvent } from './trialLog'

export type TallyStage = 'ask' | 'vote' | 'run' | 'reveal'
export interface TallyRecord { at: string; caseId: string | null; question: string; options: string[]; rounds: number[][]; answer: number | null }

export const tally = reactive({
  open: false,
  collapsed: false,
  stage: 'ask' as TallyStage,
  caseId: null as string | null,
  question: '',
  options: ['', '', ''] as string[],
  /** Counts per option, one list per round (at most two rounds). */
  rounds: [[0, 0, 0]] as number[][],
  /** The right option (null: not set). Hidden until the reveal. */
  answer: null as number | null,
  /** What to look at, and the explanation shown at the reveal (from a case; empty otherwise). */
  watch: '',
  physics: '',
  history: [] as TallyRecord[]
})

const KEY = 'velophi.tally.v1'
try { const raw = localStorage.getItem(KEY); if (raw) { const list = JSON.parse(raw) as TallyRecord[]; if (Array.isArray(list)) tally.history = list.filter(r => r && Array.isArray(r.rounds) && Array.isArray(r.options)).slice(0, 40) } } catch { /* history only */ }
function saveHistory() { try { localStorage.setItem(KEY, JSON.stringify(tally.history.slice(0, 40))) } catch { /* history only */ } }

/** The round being counted. */
export const currentRound = () => tally.rounds[tally.rounds.length - 1]
export const totalOf = (counts: number[]) => counts.reduce((a, b) => a + b, 0)
/** Share of the right option in a round (null without an answer or votes). */
export function shareRight(counts: number[]): number | null {
  const n = totalOf(counts)
  return tally.answer === null || !n ? null : counts[tally.answer] / n
}

/** A new, empty tally with a free question (asks nothing: an unfinished tally is simply replaced). */
export function newTally() {
  Object.assign(tally, { open: true, collapsed: false, stage: 'ask', caseId: null, question: '', options: [tl('选项 A'), tl('选项 B'), tl('选项 C')], rounds: [[0, 0, 0]], answer: null, watch: '', physics: '' })
}

/** Open a prepared case: its scene in the studio and its question in the tally. */
export async function openCase(id: string, withTally = true): Promise<boolean> {
  const c = caseById(id)
  if (!c) return false
  if (state.dirty && !(await ask(tl('当前场景有未保存的修改，确定要打开这个案例吗？')))) return false
  const scene = buildTemplate(c.template, c.values ?? {})
  scene.extra = { ...(scene.extra ?? {}), template: { id: c.template, values: { ...(c.values ?? {}) } }, case: c.id }
  loadScene(scene, null)
  state.page = 'studio'
  if (c.chart?.length) state.chart = [...c.chart]
  logEvent('case.open', { id })
  if (withTally) fromCase(c)
  else showCaseNote(c)
  return true
}

function fromCase(c: TeachingCase) {
  Object.assign(tally, {
    open: true, collapsed: false, stage: 'vote', caseId: c.id, question: T3(c.question), options: c.options.map(o => T3(o)),
    rounds: [c.options.map(() => 0)], answer: c.answer, watch: T3(c.watch), physics: T3(c.physics)
  })
  // The scene waits at t = 0 until the class has voted
  pause(); seekFrame(0)
  setStudioMode('simulate')
}

/** A case opened for reading (from the library): the card starts at the reveal, without votes. */
function showCaseNote(c: TeachingCase) {
  Object.assign(tally, {
    open: true, collapsed: false, stage: 'reveal', caseId: c.id, question: T3(c.question), options: c.options.map(o => T3(o)),
    rounds: [c.options.map(() => 0)], answer: c.answer, watch: T3(c.watch), physics: T3(c.physics)
  })
}

export function setOptionCount(n: number) {
  const k = Math.max(2, Math.min(4, n))
  while (tally.options.length < k) tally.options.push(tl('选项 {0}', ['ABCD'[tally.options.length]]))
  tally.options.length = k
  for (const r of tally.rounds) { while (r.length < k) r.push(0); r.length = k }
  if (tally.answer !== null && tally.answer >= k) tally.answer = null
}

export function bump(i: number, d: number) { const r = currentRound(); r[i] = Math.max(0, Math.min(999, Math.round((r[i] || 0) + d))) }
export function setCount(i: number, v: number) { currentRound()[i] = Number.isFinite(v) ? Math.max(0, Math.min(999, Math.round(v))) : 0 }

/** Lock the votes and run: the scene plays from the start. */
export function lockAndRun() {
  tally.stage = 'run'
  if (state.stale || !state.recording) void runSimulation()
  seekFrame(0)
  queueMicrotask(() => play())
  logEvent('tally.run', { votes: totalOf(currentRound()), round: tally.rounds.length })
}

export function reveal() {
  pause()
  tally.stage = 'reveal'
  record()
}

/** After the discussion: a second round on the same question (the scene goes back to the start). */
export function voteAgain() {
  if (tally.rounds.length >= 2) return
  tally.rounds.push(tally.options.map(() => 0))
  tally.stage = 'vote'
  pause(); seekFrame(0)
}

function record() {
  const rec: TallyRecord = { at: new Date().toISOString(), caseId: tally.caseId, question: tally.question, options: [...tally.options], rounds: tally.rounds.map(r => [...r]), answer: tally.answer }
  // the second round replaces the entry of the first
  const last = tally.history[0]
  if (last && last.question === rec.question && rec.rounds.length === 2 && last.rounds.length === 1) tally.history.splice(0, 1)
  tally.history.unshift(rec)
  tally.history.length = Math.min(40, tally.history.length)
  saveHistory()
}

export function clearTallyHistory() { tally.history = []; saveHistory() }

/** Plain-text summary (for the clipboard, a lesson note or a report). */
export function tallySummary(r: TallyRecord = { at: new Date().toISOString(), caseId: tally.caseId, question: tally.question, options: tally.options, rounds: tally.rounds, answer: tally.answer }): string {
  const lines = [r.question]
  r.rounds.forEach((counts, k) => {
    const n = totalOf(counts)
    lines.push(r.rounds.length > 1 ? tl('第 {0} 轮（{1} 人）', [k + 1, n]) : tl('{0} 人作答', [n]))
    r.options.forEach((o, i) => lines.push(`  ${'ABCD'[i]}. ${o}: ${counts[i]}${n ? ` (${Math.round((100 * counts[i]) / n)} %)` : ''}${r.answer === i ? ' ✓' : ''}`))
  })
  return lines.join('\n')
}
