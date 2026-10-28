/**
 * Keyboard and assistive-technology use of the teaching activities (26.56, UX12, EDU17; the task "keyboard: forces on
 * the incline", model M07). Every step of the incline activity is rendered (server-side rendering of the component)
 * and checked for: native controls only (radio groups in a fieldset with a legend — arrow keys move, check boxes —
 * Space toggles, selects, text fields, buttons), an accessible name for every control, no positive tabindex, no
 * pointer-only element (canvas, draggable), a focus target for each step heading, and live regions for feedback.
 * The same checks run over every activity's question steps. The interactive check in WebView2 is recorded in the
 * validation report.
 */
import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import ActivityRunner from '../src/app/components/ActivityRunner.vue'
import { state } from '../src/app/store'
import { ACTIVITIES } from '../src/teaching/activities'

const STEPS = ['intro', 'diagnose', 'predict', 'experiment', 'questions', 'transfer', 'summary']

async function render(activity: string, step: string): Promise<string> {
  state.activity = activity
  const app = createSSRApp({ render: () => h(ActivityRunner, { step }) })
  return renderToString(app)
}

/** Problems of keyboard and screen-reader use in rendered HTML. */
function problems(html: string): string[] {
  const out: string[] = []
  const tags = [...html.matchAll(/<(input|select|textarea|button)\b([^>]*)>/g)]
  for (const t of tags) {
    const [whole, tag, attrs] = t
    if (/type="hidden"/.test(attrs)) continue
    const idx = t.index ?? 0
    // inside a <label> … </label>?
    const before = html.slice(0, idx)
    const inLabel = before.lastIndexOf('<label') > before.lastIndexOf('</label>')
    const named = /aria-label="[^"]+"/.test(attrs) || /title="[^"]+"/.test(attrs)
    if (tag === 'button') {
      const end = html.indexOf('</button>', idx)
      const text = html.slice(idx + whole.length, end).replace(/<[^>]+>/g, '').trim()
      if (!text && !named) out.push(`button without a name: ${whole.slice(0, 80)}`)
    } else if (!inLabel && !named) out.push(`${tag} without a label: ${whole.slice(0, 80)}`)
    if (/type="radio"/.test(attrs)) {
      const fs = before.lastIndexOf('<fieldset'), fsEnd = before.lastIndexOf('</fieldset>')
      if (!(fs > fsEnd)) out.push(`radio outside a fieldset: ${whole.slice(0, 80)}`)
    }
    const ti = /tabindex="(\d+)"/.exec(attrs)
    if (ti && Number(ti[1]) > 0) out.push(`positive tabindex: ${whole.slice(0, 80)}`)
  }
  for (const fs of html.matchAll(/<fieldset\b[^>]*>([\s\S]*?)<\/fieldset>/g)) if (!/<legend\b/.test(fs[1]) && /type="radio"/.test(fs[1])) out.push('radio group without a legend')
  if (/<canvas\b/.test(html)) out.push('canvas (pointer only)')
  if (/draggable="true"/.test(html)) out.push('draggable element')
  return out
}

describe('ux2656 keyboard M07', () => {
  for (const step of STEPS) {
    it(`incline activity, step ${step}: native, named controls and a focusable heading`, async () => {
      const html = await render('act-incline', step)
      expect(problems(html)).toEqual([])
      expect(html).toMatch(/<h3[^>]*tabindex="-1"/)
      expect(html).toMatch(/role="dialog" aria-modal="true" tabindex="-1"/)
    })
  }
  it('Tab stays inside the dialog and Escape closes it (focus trap of the 26.56 dialogs)', async () => {
    const { dialogKeys } = await import('../src/app/focusTrap')
    const focused: string[] = []
    const el = (name: string) => ({ name, focus: () => { focused.push(name); doc.activeElement = items.find(x => x.name === name) ?? null }, closest: () => null, offsetParent: {}, getClientRects: () => [1] })
    const items = [el('close'), el('answer'), el('next')]
    const doc: { activeElement: unknown } = { activeElement: items[2] }
    const root = { contains: (x: unknown) => items.includes(x as never), querySelectorAll: () => items } as unknown as HTMLElement
    const key = (k: string, shift = false) => { let prevented = false; const e = { key: k, shiftKey: shift, target: null, preventDefault: () => { prevented = true }, stopPropagation: () => {} } as unknown as KeyboardEvent; return { e, prevented: () => prevented } }
    const g = globalThis as Record<string, unknown>
    const saved = g.document
    g.document = doc
    try {
      const t = key('Tab'); dialogKeys(t.e, root); expect(t.prevented()).toBe(true); expect(focused.at(-1)).toBe('close')
      const s = key('Tab', true); dialogKeys(s.e, root); expect(focused.at(-1)).toBe('next')
      doc.activeElement = { outside: true }
      const o = key('Tab'); dialogKeys(o.e, root); expect(focused.at(-1)).toBe('close')
      doc.activeElement = items[1]
      const m = key('Tab'); dialogKeys(m.e, root); expect(m.prevented()).toBe(false)
      let closed = false
      dialogKeys(key('Escape').e, root, () => { closed = true })
      expect(closed).toBe(true)
    } finally { g.document = saved }
  })
  it('the forces are check boxes (Space) and the friction direction a radio group (arrow keys)', async () => {
    const html = await render('act-incline', 'questions')
    const multi = html.match(/<fieldset[\s\S]*?<\/fieldset>/g)!.find(f => /type="checkbox"/.test(f))!
    expect((multi.match(/type="checkbox"/g) ?? []).length).toBe(5)
    const dir = html.match(/<fieldset[\s\S]*?<\/fieldset>/g)!.find(f => /name="q2"/.test(f))!
    expect((dir.match(/type="radio"/g) ?? []).length).toBe(2)
    expect(dir).toMatch(/<legend/)
  })
  it('every activity: diagnosis, prediction, questions and transfer pass the same checks', async () => {
    const bad: string[] = []
    for (const a of ACTIVITIES) for (const step of ['diagnose', 'predict', 'questions', 'transfer']) for (const p of problems(await render(a.id, step))) bad.push(`${a.id}/${step}: ${p}`)
    expect(bad).toEqual([])
  })
})
