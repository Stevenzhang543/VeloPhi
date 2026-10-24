/** Trial log (D16): opt-in, capped ring buffer, no personal information, clear and export. */
import { beforeEach, describe, expect, it } from 'vitest'

class MemoryStorage {
  private m = new Map<string, string>()
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
  removeItem(k: string) { this.m.delete(k) }
  clear() { this.m.clear() }
  key(i: number) { return [...this.m.keys()][i] ?? null }
  get length() { return this.m.size }
}
;(globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage()

const { settings } = await import('../../src/app/settings')
const log = await import('../../src/app/trialLog')

describe('trial log', () => {
  beforeEach(() => { log.clearTrialLog(); settings.trialLog = false })

  it('is off by default and records nothing while off', () => {
    expect(settings.trialLog).toBe(false)
    log.logEvent('export.csv', { rows: 10 })
    expect(log.trialLogSize()).toBe(0)
  })

  it('records sanitised entries when switched on', () => {
    settings.trialLog = true
    log.logEvent('template.open', { template: 'board-block', fileName: 'C:\\Users\\张三\\课件.json', sceneName: '张老师的板块模型', count: 3, ok: true })
    log.logEvent('sweep.run', { param: 'template:mu1', measure: 'contact.block|board.f', note: 'hello', free: '我的名字', spaced: 'two words', path: '/home/x' })
    log.logEvent('bad kind with spaces')
    const e = log.trialLogEntries()
    expect(e[0].kind).toBe('session.start')
    expect(e[1]).toMatchObject({ kind: 'template.open', detail: { template: 'board-block', count: 3, ok: true } })
    expect(e[1].detail).not.toHaveProperty('fileName')
    expect(e[1].detail).not.toHaveProperty('sceneName')
    expect(e[2].detail).toEqual({ param: 'template:mu1', measure: 'contact.block|board.f' })
    expect(e.length).toBe(3)
    const json = log.trialLogJson()
    expect(json).not.toMatch(/张|Users|home|名字/)
    const doc = JSON.parse(json)
    expect(doc.format).toBe('verity-trial-log')
    expect(doc.entries.length).toBe(3)
  })

  it('keeps at most 5000 entries and persists them', () => {
    settings.trialLog = true
    for (let i = 0; i < log.TRIAL_LOG_CAP + 20; i++) log.logEvent('tick', { i })
    expect(log.trialLogSize()).toBe(log.TRIAL_LOG_CAP)
    const all = log.trialLogEntries()
    expect(all[all.length - 1].detail).toEqual({ i: log.TRIAL_LOG_CAP + 19 })
    log.flushTrialLog()
    const stored = JSON.parse(localStorage.getItem(log.TRIAL_LOG_KEY)!)
    expect(stored.length).toBe(log.TRIAL_LOG_CAP)
    log.clearTrialLog()
    expect(log.trialLogSize()).toBe(0)
    expect(localStorage.getItem(log.TRIAL_LOG_KEY)).toBeNull()
  })
})
