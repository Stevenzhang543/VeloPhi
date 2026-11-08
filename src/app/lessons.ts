/**
 * The classroom experiment in progress (26.61, phase B): which lesson, which step, the class's prediction and answers,
 * and the teacher's view. The lesson card (LessonBar.vue) stays over the studio, so every evidence button shows the
 * scene, the moment, the curves and the formula cards at once — one cursor (state.time) for all panels.
 */
import { reactive } from 'vue'
import { state, loadScene, seekTime, seekAfter, pause, showToast } from './store'
import { settings } from './settings'
import { buildTemplate } from '../templates'
import { openLab } from './learn/actions'
import { lessonById } from '../teaching/lessons/defs'
import type { Evidence, LessonStepId } from '../teaching/lessons/defs'
import { LESSON_STEPS } from '../teaching/lessons/defs'
import { tl } from '../i18n'
import { ask } from '../platform/ask'
import { logEvent } from './trialLog'

export const lessonUi = reactive({
  id: null as string | null,
  step: 'observe' as LessonStepId,
  /** Choices submitted (predict and explain are locked once submitted), the transfer value. */
  choice: {} as Record<string, string>,
  locked: {} as Record<string, boolean>,
  transfer: '',
  hints: 0,
  /** Teacher view: the flow, the common errors and the export; projection enlarges the card and the readouts. */
  teacher: false,
  projector: false,
  collapsed: false,
  /** The evidence opened last (its label), to mark it in the card. */
  shown: null as string | null,
  busy: false
})

let projectorBefore: boolean | null = null

export function openLesson(id: string, teacher = false): boolean {
  if (!lessonById(id)) return false
  Object.assign(lessonUi, { id, step: 'observe', choice: {}, locked: {}, transfer: '', hints: 0, teacher, collapsed: false, shown: null })
  state.activity = null
  state.page = 'studio'
  logEvent('lesson.open', { id })
  return true
}

export function closeLesson() {
  if (lessonUi.projector) setProjector(false)
  lessonUi.id = null
}

export function goStep(s: LessonStepId) { lessonUi.step = s; lessonUi.hints = 0 }
export function nextStep() { const i = LESSON_STEPS.indexOf(lessonUi.step); if (i < LESSON_STEPS.length - 1) goStep(LESSON_STEPS[i + 1]) }
export function prevStep() { const i = LESSON_STEPS.indexOf(lessonUi.step); if (i > 0) goStep(LESSON_STEPS[i - 1]) }

/** Projection: the app's projector mode (light, no effects) and a larger lesson card; restored on leaving. */
export function setProjector(on: boolean) {
  if (on && projectorBefore === null) projectorBefore = settings.projector
  settings.projector = on ? true : projectorBefore ?? false
  if (!on) projectorBefore = null
  lessonUi.projector = on
}

/** Wait until the run of the scene shown has reached time t (or ended), at most `ms`. */
async function computedTo(t: number, ms = 6000): Promise<boolean> {
  const t0 = Date.now()
  for (;;) {
    const rec = state.recording
    if (rec && !state.stale && ((rec.frameCount - 1) * rec.dt >= t || rec.completed !== false)) return true
    if (Date.now() - t0 > ms) return false
    await new Promise(r => setTimeout(r, 60))
  }
}

/**
 * Show one piece of evidence: the scene with the lesson's values (or the lab), then the moment — a time, or one side
 * of the first event of a kind — the curves and the panel.
 */
export async function showEvidence(e: Evidence): Promise<void> {
  if (lessonUi.busy) return
  lessonUi.busy = true
  try {
    if (e.lab) { openLab(e.lab.id, e.lab.preset); lessonUi.shown = tl(e.label.zh); return }
    if (!e.template) return
    const scene = buildTemplate(e.template, e.values ?? {})
    if (state.dirty && !(await ask(tl('当前场景有未保存的修改，确定打开实验场景吗？')))) return
    loadScene(scene, null)
    state.page = 'studio'
    if (e.chart?.length) state.chart = [...e.chart]
    if (e.panel) state.rightTab = e.panel
    lessonUi.shown = tl(e.label.zh)
    const at = e.at
    if (!at) return
    if (at.t !== undefined) { if (await computedTo(at.t)) { pause(); seekTime(at.t) } return }
    if (at.event) {
      // The event's time: the recording must reach it
      for (let k = 0; k < 40; k++) {
        const rec = state.recording
        const ev = rec && !state.stale ? rec.events.find(x => x.triggers.includes(at.event as never) || x.changes.some(c => c.type === at.event)) : null
        if (ev && rec) {
          pause()
          if (at.side === 'after') seekAfter(ev.t)
          else seekTime(Math.max(0, Math.floor(ev.t / rec.dt - 1e-9) * rec.dt))
          return
        }
        if (rec && !state.stale && rec.completed !== false) break
        await new Promise(r => setTimeout(r, 120))
      }
      showToast(tl('这次运行里没有出现该事件'), true)
    }
  } finally { lessonUi.busy = false }
}
