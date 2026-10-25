/**
 * Yes/no questions (26.51 hand check): in the desktop app the dialog plugin makes `window.confirm` return a Promise,
 * so a question must wait for the answer. `ask` gives the same result for the browser's blocking confirm and for
 * the asynchronous one, and opening a handbook example over unsaved changes does nothing until the answer is yes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

const loadScene = vi.fn()
const state = { dirty: true, page: 'settings', rightTab: 'inspect', pendingSeek: null as number | null, formulaFocus: null as string | null }
vi.mock('../../src/app/store', () => ({ state, loadScene }))
vi.mock('../../src/app/trialLog', () => ({ logEvent() {} }))

const { ask } = await import('../../src/platform/ask')
const { openExample } = await import('../../src/app/handbook')
const EXAMPLES = (await import('../../src/handbook/examples.json')).default as Record<string, unknown>

/** A confirm that answers later, as the desktop dialog does. */
function laterConfirm() {
  let answer!: (v: boolean) => void
  const pending = new Promise<boolean>(r => { answer = r })
  const fn = vi.fn(() => pending)
  return { fn, answer }
}

afterEach(() => { vi.unstubAllGlobals(); loadScene.mockClear() })

describe('ask', () => {
  it('works with the blocking confirm of the browser', async () => {
    vi.stubGlobal('window', { confirm: () => true })
    expect(await ask('?')).toBe(true)
    vi.stubGlobal('window', { confirm: () => false })
    expect(await ask('?')).toBe(false)
  })

  it('waits for the asynchronous confirm of the desktop app', async () => {
    const c = laterConfirm()
    vi.stubGlobal('window', { confirm: c.fn })
    const p = ask('?')
    let settled = false
    void p.then(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)
    c.answer(false)
    expect(await p).toBe(false)
  })
})

describe('opening a handbook example over unsaved changes', () => {
  const id = Object.keys(EXAMPLES)[0]

  it('Cancel keeps the current scene', async () => {
    const c = laterConfirm()
    vi.stubGlobal('window', { confirm: c.fn })
    state.dirty = true
    const p = openExample(id)
    await Promise.resolve()
    expect(loadScene).not.toHaveBeenCalled()
    c.answer(false)
    expect(await p).toBe(false)
    expect(loadScene).not.toHaveBeenCalled()
  })

  it('OK loads the example, and a clean scene is replaced without asking', async () => {
    const c = laterConfirm()
    vi.stubGlobal('window', { confirm: c.fn })
    state.dirty = true
    const p = openExample(id)
    c.answer(true)
    expect(await p).toBe(true)
    expect(loadScene).toHaveBeenCalledTimes(1)
    state.dirty = false
    const none = vi.fn(() => false)
    vi.stubGlobal('window', { confirm: none })
    expect(await openExample(id)).toBe(true)
    expect(none).not.toHaveBeenCalled()
    expect(loadScene).toHaveBeenCalledTimes(2)
  })
})
