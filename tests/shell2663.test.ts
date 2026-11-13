/**
 * 26.63 (D232–D235): the shell's data — pages and their keys in the shortcut list, the things Copilot may point at,
 * the class tally's counting and summary, and the retry layer's place in the AI disclosure numbers.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { SHORTCUTS } from '../src/app/shortcuts'
import { uiTargets } from '../src/app/spotlight'
import { tally, newTally, setOptionCount, bump, setCount, currentRound, totalOf, shareRight, voteAgain, tallySummary } from '../src/app/tally'
import { RETRY } from '../src/ai/retry'
import { escapeHtml } from '../src/core/text'
import { foldSearch } from '../src/app/searchText'

describe('shell data (26.63)', () => {
  it('the shortcut list names the six pages in rail order and the new interface keys', () => {
    const pages = SHORTCUTS.find(g => g.items.some(i => i.keys.some(k => k.join('+') === 'Alt+1')))!
    expect(pages.items.filter(i => i.keys[0][0] === 'Alt').map(i => i.keys[0][1])).toEqual(['1', '2', '3', '4', '5', '6'])
    const all = SHORTCUTS.flatMap(g => g.items).map(i => i.keys.map(k => k.join('+')).join(' / '))
    for (const want of ['?', '0', '+ / −']) expect(all.some(k => k === want), want).toBe(true)
    expect(all.some(k => k.includes('\\'))).toBe(true)
    expect(all.some(k => k.endsWith('+J'))).toBe(true)
  })

  it('Copilot can point at every page of the rail and at the new menus', () => {
    const t = uiTargets()
    for (const k of ['page-home', 'page-studio', 'page-lab', 'page-library', 'page-classroom', 'page-monitor', 'page-settings', 'teach', 'share', 'help', 'file']) expect(t[k], k).toBeTruthy()
    expect(t['page-lab'].selector).toBe('[data-ui="page-lab"]')
    expect(t.help.selector).toBe('[data-ui="help"]')
  })

  it('escapes and folds in one place', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;')
    expect(foldSearch('Ｕ－Ｉ 图像')).toBe(foldSearch('u-i图像'))
  })
})

describe('class tally (26.63, D235)', () => {
  // the store's playback uses the browser's frame timer (node has none)
  const g = globalThis as { cancelAnimationFrame?: unknown; requestAnimationFrame?: unknown }
  g.cancelAnimationFrame ??= () => {}
  g.requestAnimationFrame ??= () => 0
  beforeEach(() => { newTally(); tally.history = [] })

  it('counts, clamps and keeps options and rounds in step', () => {
    expect(tally.options.length).toBe(3)
    bump(0, 1); bump(0, 5); bump(1, 1); bump(1, -3); setCount(2, 12.4); setCount(2, -4)
    expect(currentRound()).toEqual([6, 0, 0])
    setCount(2, 4)
    expect(totalOf(currentRound())).toBe(10)
    setOptionCount(4)
    expect(tally.options.length).toBe(4); expect(currentRound().length).toBe(4)
    setOptionCount(1)
    expect(tally.options.length).toBe(2); expect(currentRound()).toEqual([6, 0])
  })

  it('shares, the second round and the summary', () => {
    tally.question = 'Q?'; tally.options = ['a', 'b', 'c']; tally.rounds = [[2, 6, 2]]; tally.answer = 1
    expect(shareRight(tally.rounds[0])).toBeCloseTo(0.6, 12)
    tally.stage = 'reveal'
    voteAgain()
    expect(tally.rounds.length).toBe(2); expect(tally.stage).toBe('vote')
    tally.rounds[1] = [1, 9, 0]
    voteAgain()
    expect(tally.rounds.length).toBe(2)
    const text = tallySummary()
    expect(text.split('\n')[0]).toBe('Q?')
    expect(text).toContain('B. b: 6 (60 %) ✓')
    expect(text).toContain('B. b: 9 (90 %) ✓')
    tally.answer = null
    expect(shareRight(tally.rounds[1])).toBeNull()
  })

  it('the disclosure\'s "at most twice" is the policy', () => { expect(RETRY.retries).toBe(2) })
})
