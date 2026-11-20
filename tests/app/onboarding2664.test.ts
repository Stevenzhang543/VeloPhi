/**
 * 26.64 (D248–D251): the walkthrough — what a device is offered (the version rule), the record it keeps, and the
 * engine's state machine (a step ends when its `until` holds, never by a "next" button; skipping, closing and taking
 * up again; the temporary document is given back).
 *
 * References are the table of D248 and hand-written sequences; everything is exact (no tolerances): these are
 * records and counters, not physics.
 */
import { beforeEach, describe, expect, it } from 'vitest'

const g = globalThis as Record<string, unknown>
g.cancelAnimationFrame ??= () => {}
g.requestAnimationFrame ??= () => 0
const storage = new Map<string, string>()
g.localStorage = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, v) }, removeItem: (k: string) => { storage.delete(k) } }

const S = await import('../../src/app/onboarding/state')
const { ONBOARDING_KEY, SEGMENTS, emptyRecord, minorOf, nextSegment, offer, onboarding, parseRecord, roleDefaults, seenVersionOf, withDone, withRestart, withSeen, withStep } = S
const { NEWEST, NEWS_VERSIONS, allNews, newsOf, onboardingVersion } = await import('../../src/app/onboarding/news')
const E = await import('../../src/app/onboarding/engine')
const { closeWalk, continueWalk, nextStep, skipSegment, skipStep, startWalk, tick, timing, walk } = E
const { segmentList, segmentOf } = await import('../../src/app/onboarding/steps')
const { state } = await import('../../src/app/store')
const { settings } = await import('../../src/app/settings')
const { locale } = await import('../../src/i18n/locale')
const { tIn } = await import('../../src/i18n')
type Segment = import('../../src/app/onboarding/steps').Segment

const situation = (over: Partial<Parameters<typeof offer>[1]> = {}) => ({ version: '26.64.0', welcomedBefore: false, versionsWithNews: ['26.64'], quiet: false, ...over })

describe('what a device is offered (D248)', () => {
  it('versions compare by their first two parts', () => {
    expect(minorOf('26.64.0')).toBe('26.64')
    expect(minorOf('26.64')).toBe('26.64')
    expect(minorOf('26.64.3-rc1')).toBe('26.64')
    for (const junk of ['', 'x', null, undefined, '26']) expect(minorOf(junk as string)).toBe('')
  })

  it('first run: the walkthrough; nothing after it was put away', () => {
    expect(offer(emptyRecord(), situation())).toBe('first')
    expect(offer(withSeen(emptyRecord(), '26.64.0', '2026-11-16T10:00:00.000Z'), situation())).toBe('none')
    expect(offer(withSeen(emptyRecord(), '26.64.0'), situation())).toBe('none')
  })

  it('a device that ran 26.63 (welcome flag, no record) sees only what is new', () => {
    expect(seenVersionOf(emptyRecord(), true)).toBe('26.63')
    expect(offer(emptyRecord(), situation({ welcomedBefore: true }))).toBe('new')
    // a record of an older version likewise
    expect(offer(withSeen(emptyRecord(), '26.63.0'), situation())).toBe('new')
    expect(offer(withSeen(emptyRecord(), '26.60.2'), situation())).toBe('new')
  })

  it('the same minor version, or a version without a list, offers nothing', () => {
    expect(offer(withSeen(emptyRecord(), '26.64.0'), situation({ version: '26.64.2' }))).toBe('none')
    expect(offer(withSeen(emptyRecord(), '26.64.0'), situation({ version: '26.65.0', versionsWithNews: ['26.64'] }))).toBe('none')
    expect(offer(withSeen(emptyRecord(), '26.64.0'), situation({ version: '26.65.0', versionsWithNews: ['26.64', '26.65'] }))).toBe('new')
  })

  it('share links, projection and the automatic tests: nothing, whatever the record', () => {
    expect(offer(emptyRecord(), situation({ quiet: true }))).toBe('none')
    expect(offer(emptyRecord(), situation({ quiet: true, welcomedBefore: true }))).toBe('none')
  })

  it('which starts are quiet: a share link, projection, the automatic tests — and how a test asks for the onboarding', () => {
    expect(E.isQuiet('', '', false)).toBe(false)
    for (const hash of ['#s=z1.abc', '#b=abc', '#e=Cu', '#m=ethanol', '#n=U-238']) expect(E.isQuiet('', hash, false), hash).toBe(true)
    expect(E.isQuiet('', '#top', false)).toBe(false)
    expect(E.isQuiet('', '', true)).toBe(true)
    expect(E.isQuiet('?uitest=1', '', false)).toBe(true)
    expect(E.isQuiet('?download=1&selftest', '', false)).toBe(true)
    expect(E.isQuiet('?uitest=1&onboard=1', '#s=z1.abc', true)).toBe(false)
  })

  it('the onboarding runs as the newest version that has a list while the program number is behind it', () => {
    expect(NEWS_VERSIONS[0]).toBe(NEWEST)
    expect(onboardingVersion('26.63.0')).toBe(NEWEST)
    // 26.65 has a list of its own: a 26.64 program number still runs as the newest list
    expect(onboardingVersion('26.64.0')).toBe(NEWEST)
    expect(onboardingVersion('26.65.0')).toBe('26.65')
    expect(onboardingVersion('26.65.1')).toBe('26.65')
    expect(onboardingVersion('27.0.0')).toBe('27.0')
  })
})

describe('the record (D248)', () => {
  it('has the five segments, in order', () => {
    expect([...SEGMENTS]).toEqual(['welcome', 'motion', 'physics', 'chem', 'library'])
    expect(Object.keys(emptyRecord().segments)).toEqual([...SEGMENTS])
    expect(emptyRecord()).toMatchObject({ seenVersion: null, dismissedAt: null })
  })

  it('survives a round trip, and junk never throws', () => {
    let r = withStep(withDone(withSeen(emptyRecord(), '26.64.0'), 'welcome'), 'motion', 3)
    r = withSeen(r, '26.64.0', '2026-11-16T10:00:00.000Z')
    expect(parseRecord(JSON.stringify(r))).toEqual(r)
    expect(r.seenVersion).toBe('26.64')
    for (const junk of [null, '', 'x', '[]', '3', '{"segments":7}', '{"seenVersion":5,"segments":{"motion":{"step":-2,"done":"yes"}}}']) expect(parseRecord(junk)).toEqual(emptyRecord())
    // unknown segments and fields are dropped, known ones kept
    expect(parseRecord('{"seenVersion":"26.64","segments":{"chem":{"step":2,"done":false},"extra":{"step":1}},"x":1}').segments.chem).toEqual({ step: 2, done: false })
  })

  it('the step reached is kept until the segment is done; a finished segment is not moved back', () => {
    let r = withStep(emptyRecord(), 'chem', 2)
    expect(r.segments.chem).toEqual({ step: 2, done: false })
    r = withDone(r, 'chem')
    expect(r.segments.chem).toEqual({ step: 0, done: true })
    expect(withStep(r, 'chem', 1)).toBe(r)
    expect(withRestart(r, 'chem').segments.chem).toEqual({ step: 0, done: false })
  })

  it('the next segment is the first unfinished one', () => {
    let r = emptyRecord()
    expect(nextSegment(r)).toBe('welcome')
    r = withDone(withDone(r, 'welcome'), 'physics')
    expect(nextSegment(r)).toBe('motion')
    for (const id of SEGMENTS) r = withDone(r, id)
    expect(nextSegment(r)).toBeNull()
  })

  it('the role sets ordinary settings', () => {
    expect(roleDefaults('learn')).toEqual({ startPage: 'home', formulaDensity: 'compact', moreGroup: 'view' })
    expect(roleDefaults('teach').moreGroup).toBe('teach')
    expect(roleDefaults('research')).toEqual({ startPage: 'home', formulaDensity: 'detailed', moreGroup: 'compute' })
  })
})

describe('the segments (D249)', () => {
  it('five segments, five steps each at most, with a length in minutes; ten minutes in all at most', () => {
    const list = segmentList()
    expect(list.map(s => s.id)).toEqual([...SEGMENTS])
    for (const s of list) { expect(s.steps, s.id).toBeGreaterThanOrEqual(3); expect(s.steps, s.id).toBeLessThanOrEqual(5); expect(s.minutes).toBeGreaterThan(0) }
    expect(list.reduce((a, s) => a + s.minutes, 0)).toBeLessThanOrEqual(10)
  })

  it('every step names a control and waits on the application; only choices and looks have a button', () => {
    for (const id of [...SEGMENTS, 'whatsnew'] as const) {
      const seg = segmentOf(id)
      expect(new Set(seg.steps.map(s => s.id)).size, id).toBe(seg.steps.length)
      for (const st of seg.steps) {
        expect(st.text().length, `${id}.${st.id}`).toBeGreaterThan(3)
        if (id === 'welcome') expect(st.form, st.id).toBeTruthy()
        else if (id === 'whatsnew') expect(st.look, st.id).toBe(true)
        else { expect(st.form ?? st.look, `${id}.${st.id}`).toBeUndefined(); expect(typeof st.target === 'function' || st.target.length > 0, `${id}.${st.id}`).toBe(true) }
      }
    }
  })

  it('the chemistry panel is in the walk: the bench, the guided experiments, the encyclopedia', () => {
    expect(segmentOf('chem').steps.map(s => s.id)).toEqual(['flask', 'acid', 'indicator', 'titrate', 'guided'])
    expect(segmentOf('chem').steps.every(s => s.page === 'chem')).toBe(true)
    expect(segmentOf('library').steps.map(s => s.id)).toContain('element')
  })

  it('Copilot is a step only with an account or a key', () => {
    // no key, not signed in (the test machine): the step is left out, the segment still has its other steps
    expect(segmentOf('library').steps.map(s => s.id)).toEqual(['problem', 'element', 'monitor'])
  })

  it('the texts are in the language of the moment, and every one has its translations', () => {
    const zh = segmentOf('motion').steps[1].text()
    try {
      locale.lang = 'en'
      const seg = segmentOf('motion')
      expect(seg.title()).toBe('Motion')
      expect(seg.steps[1].text()).not.toBe(zh)
      expect(seg.steps[1].text()).toBe(tIn('en', zh))
      locale.lang = 'de'
      expect(segmentOf('chem').title()).toBe('Chemie')
      expect(newsOf(NEWEST).every(n => !/[一-鿿]/.test(n.title + n.text))).toBe(true)
    } finally { locale.lang = 'zh' }
  })

  it('the list of changes: 26.64 has entries, each with a target; other versions have none', () => {
    expect(allNews().map(g2 => g2.version)).toEqual(['26.65', '26.64'])
    const items = newsOf('26.64.0')
    expect(items.length).toBeGreaterThanOrEqual(6)
    expect(new Set(items.map(n => n.id)).size).toBe(items.length)
    for (const n of items) expect(typeof n.target === 'function' || n.target.length > 0, n.id).toBe(true)
    // what moved is named: the classroom and the meaning of Alt+digit (D250)
    expect(items.map(n => n.id)).toEqual(expect.arrayContaining(['classroom', 'keys', 'chem', 'more']))
    expect(newsOf('26.63.0')).toEqual([])
    // 26.65 (D290–D297): the one bar, the one inspector, the start on the home page, the bench
    const n65 = newsOf('26.65.0')
    expect(n65.map(n => n.id)).toEqual(['bar', 'inspector', 'status', 'start', 'bench'])
    for (const n of n65) expect(typeof n.target === 'function' || n.target.length > 0, n.id).toBe(true)
  })
})

describe('the engine (D249, D251)', () => {
  /** A segment of three deeds on a counter, with the calls the engine makes. */
  function fake() {
    const calls: string[] = []
    const at = { n: 0 }
    const seg: Segment = {
      id: 'motion', title: () => 'T', minutes: 1,
      enter: () => { calls.push('enter') },
      resume: i => { calls.push(`resume ${i}`); at.n = i },
      leave: () => { calls.push('leave') },
      steps: [
        { id: 'a', page: null, target: '#a', text: () => 'one', until: () => at.n >= 1, prepare: () => { calls.push('prepare a') } },
        { id: 'b', page: 'studio', target: '#b', text: () => 'two', until: () => at.n >= 2 },
        { id: 'c', page: null, target: () => '#c', text: () => 'three', until: () => at.n >= 3 }
      ]
    }
    return { seg, calls, at }
  }
  beforeEach(() => { closeWalk(); storage.clear(); onboarding.record = emptyRecord(); timing.okMs = 0; timing.tickMs = 0; state.page = 'studio' })

  it('a step ends when its deed is done — ticks alone change nothing', async () => {
    const f = fake()
    await startWalk('motion', { segment: f.seg })
    expect(walk).toMatchObject({ id: 'motion', index: 0, total: 3, phase: 'step' })
    expect(f.calls).toEqual(['enter'])
    tick()
    expect(f.calls).toEqual(['enter', 'prepare a'])
    for (let i = 0; i < 5; i++) tick()
    expect(walk.index).toBe(0)
    nextStep() // not a choice, not a look: the button does nothing
    expect(walk.index).toBe(0)
    f.at.n = 1
    tick()
    expect(walk.index).toBe(1)
    expect(walk.step?.id).toBe('b')
  })

  it('the step reached is stored, and the walk is taken up there', async () => {
    const f = fake()
    await startWalk('motion', { segment: f.seg })
    tick(); f.at.n = 1; tick()
    expect(onboarding.record.segments.motion).toEqual({ step: 1, done: false })
    expect(parseRecord(storage.get(ONBOARDING_KEY)).segments.motion.step).toBe(1)
    closeWalk()
    expect(walk.id).toBeNull()
    expect(f.calls.at(-1)).toBe('leave')
    // another session: a fresh definition, the stored step
    const g2 = fake()
    await startWalk('motion', { segment: g2.seg })
    expect(g2.calls).toEqual(['resume 1'])
    expect(walk.index).toBe(1)
  })

  it('a step on another page waits for the user to go there, and does not switch pages itself', async () => {
    const f = fake()
    await startWalk('motion', { segment: f.seg, from: 1 })
    state.page = 'library'
    f.at.n = 2
    tick()
    expect(walk.elsewhere).toBe(true)
    expect(walk.index).toBe(1)
    expect(state.page).toBe('library')
    expect(E.ringSelector()).toBe('[data-ui="page-studio"]')
    state.page = 'studio'
    tick(); tick()
    expect(walk.elsewhere).toBe(false)
    expect(walk.index).toBe(2)
  })

  it('"跳过此步" goes on as if the step had been done; the last step ends the segment', async () => {
    const f = fake()
    await startWalk('motion', { segment: f.seg })
    await skipStep()
    expect(f.calls).toEqual(['enter', 'resume 1'])
    expect(walk.index).toBe(1)
    await skipStep(); await skipStep()
    expect(walk.phase).toBe('done')
    expect(onboarding.record.segments.motion).toEqual({ step: 0, done: true })
    expect(E.upNext()).toBe('welcome')
  })

  it('finishing marks the segment, gives the document back when the note is left, and sets the version seen', async () => {
    const f = fake()
    await startWalk('motion', { segment: f.seg })
    tick()
    for (const n of [1, 2, 3]) { f.at.n = n; tick(); tick() }
    expect(walk.phase).toBe('done')
    expect(f.calls.includes('leave')).toBe(false)
    expect(onboarding.record.seenVersion).toBe(NEWEST)
    closeWalk()
    expect(f.calls.at(-1)).toBe('leave')
    // a finished segment starts from its first step again
    const g2 = fake()
    await startWalk('motion', { segment: g2.seg })
    expect(walk.index).toBe(0)
    expect(g2.calls).toEqual(['enter'])
    expect(onboarding.record.segments.motion.done).toBe(false)
  })

  it('"跳过此段" leaves it unfinished and begins the one after it', async () => {
    const f = fake()
    await startWalk('motion', { segment: f.seg })
    skipSegment()
    expect(f.calls.at(-1)).toBe('leave')
    expect(onboarding.record.segments.motion.done).toBe(false)
    await Promise.resolve(); await Promise.resolve()
    expect(walk.id).toBe('physics')
    closeWalk()
  })

  it('segment 0 is choices: its steps have the button, and the role ends it', async () => {
    await startWalk('welcome')
    expect(walk.step?.form).toBe('language')
    tick(); tick()
    expect(walk.index).toBe(0)
    nextStep(); nextStep(); nextStep()
    expect(walk.step?.form).toBe('role')
    E.applyRole('research')
    expect(settings.ui.role).toBe('research')
    expect(settings.ui.startPage).toBe('home')
    nextStep()
    expect(walk.phase).toBe('done')
    expect(onboarding.record.segments.welcome.done).toBe(true)
    E.applyRole('learn')
    // 继续 goes to the first unfinished segment
    continueWalk()
    await Promise.resolve(); await Promise.resolve()
    expect(walk.id).toBe('motion')
    closeWalk()
  })

  it('the list of changes is a walk of looks; one entry alone closes on its button', async () => {
    await startWalk('whatsnew')
    expect(walk.total).toBe(newsOf(NEWEST).length)
    expect(walk.step?.look).toBe(true)
    nextStep()
    expect(walk.index).toBe(1)
    // a look shows its page itself (a deed never does)
    state.page = 'home'
    while (walk.step && walk.step.page === null) nextStep()
    const page = walk.step!.page
    tick()
    expect(state.page).toBe(page)
    expect(walk.elsewhere).toBe(false)
    closeWalk()
    E.showNews('classroom')
    await Promise.resolve(); await Promise.resolve()
    expect(walk).toMatchObject({ id: 'whatsnew', single: true })
    expect(walk.step?.id).toBe('classroom')
    expect(state.page).toBe('library')
    // the five segments' record is untouched by it
    expect(SEGMENTS.every(id => !onboarding.record.segments[id].done)).toBe(true)
    closeWalk()
  })
})
