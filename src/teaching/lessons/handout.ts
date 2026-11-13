/**
 * Printable materials of a classroom experiment (26.61, phase B): the student sheet (goal, start, steps with space to
 * write, two hints, the transfer question) and the teacher sheet (the same plus the flow, the assumptions, the common
 * errors and the engine's evidence with its tolerance). Self-contained HTML, offline, in one language.
 */
import type { Lang, Tri } from '../../i18n/tri'
import { triText } from '../../i18n/tri'
import type { Lesson } from './defs'
import { LESSON_STEP_TEXT } from './defs'
import { escapeHtml } from '../../core/text'

const esc = escapeHtml
const H: Record<string, Tri> = {
  goal: { zh: '学习目标', en: 'Goal', de: 'Lernziel' },
  start: { zh: '起始状态', en: 'Start', de: 'Ausgangslage' },
  steps: { zh: '步骤', en: 'Steps', de: 'Schritte' },
  hints: { zh: '提示', en: 'Hints', de: 'Hinweise' },
  assumptions: { zh: '适用条件', en: 'Assumptions', de: 'Voraussetzungen' },
  errors: { zh: '常见错误', en: 'Common errors', de: 'Häufige Fehler' },
  flow: { zh: '教师流程（{0} 分钟）', en: 'Teacher flow ({0} min)', de: 'Ablauf für Lehrkräfte ({0} min)' },
  evidence: { zh: '引擎证据', en: 'Engine evidence', de: 'Belege der Engine' },
  student: { zh: '学生材料', en: 'Student sheet', de: 'Arbeitsblatt' },
  teacher: { zh: '教师材料', en: 'Teacher sheet', de: 'Unterlagen für Lehrkräfte' },
  write: { zh: '我的记录：', en: 'My notes:', de: 'Meine Notizen:' }
}

/** The sheet as an HTML document; `evidence`: lines of the engine's values (teacher sheet only). */
export function lessonHandout(l: Lesson, lang: Lang, role: 'student' | 'teacher', evidence: string[] = []): string {
  const t = (x: Tri) => esc(triText(x, lang))
  const h = (k: string, arg?: string) => esc(triText(H[k], lang).replace('{0}', arg ?? ''))
  const steps = l.steps.map(s => {
    const opts = s.options?.length ? `<ul class="opts">${s.options.map(o => `<li>☐ ${t(o.text)}</li>`).join('')}</ul>` : ''
    const num = s.number ? `<p>${t(s.number.prompt)} = ________ ${esc(s.number.unit)}</p>` : ''
    return `<li><b>${t(LESSON_STEP_TEXT[s.id])}</b> — ${t(s.text)}${opts}${num}<p class="write">${h('write')}</p></li>`
  }).join('')
  const teacher = role === 'teacher'
    ? `<h2>${h('flow', l.teacher.minutes)}</h2><ol>${l.teacher.flow.map(f => `<li>${t(f)}</li>`).join('')}</ol>
<h2>${h('errors')}</h2><ul>${l.misconceptions.map(m => `<li>${t(m)}</li>`).join('')}</ul>
${evidence.length ? `<h2>${h('evidence')}</h2><ul>${evidence.map(e => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}`
    : ''
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${t(l.title)} · ${h(role)}</title>
<style>body{font:15px/1.55 system-ui,sans-serif;max-width:46em;margin:2em auto;padding:0 1em;color:#111;background:#fff}h1{font-size:1.4em}h2{font-size:1.05em;margin-top:1.4em}li{margin:.4em 0}.write{color:#666;border-bottom:1px dashed #aaa;min-height:2.2em}.opts{list-style:none;padding-left:1em}@media print{.write{min-height:3em}}</style></head>
<body><h1>${t(l.title)}</h1><p><i>${h(role)} · VeloΦ</i></p>
<h2>${h('goal')}</h2><p>${t(l.goal)}</p><h2>${h('start')}</h2><p>${t(l.start)}</p>
<h2>${h('assumptions')}</h2><ul>${l.assumptions.map(a => `<li>${t(a)}</li>`).join('')}</ul>
<h2>${h('steps')}</h2><ol>${steps}</ol>
<h2>${h('hints')}</h2><ol>${l.hints.map(x => `<li>${t(x)}</li>`).join('')}</ol>
${teacher}</body></html>`
}
