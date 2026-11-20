/**
 * 26.65 canvas labels (docs/research/2665/physics-audit.md §1C, D1–D16; M9, M10, D13): the greedy label placement,
 * the side of an axis a tick number takes, the 1D spread of the hydrogen levels, the text of a key moment with one
 * clause per contact pair, the colours of the dark canvas, and the pure helpers of the gas, thermal-equilibrium and
 * wave-optics labs. Two scenes are drawn through the real renderer into a recording 2D context: the tick numbers of
 * a ground-level axis are drawn above the ground, after it, and the pinned ones keep clear of the floating timeline.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
// @ts-expect-error — plain ES module of the build scripts
import { readTokens } from '../../scripts/token-lint.mjs'
import type { Box, LabelRequest } from '../../src/render/labels'
import { LabelLayer, besideCandidates, contrastOver, liftContrast, overlaps, placeLabels, spreadLabels, tickSide } from '../../src/render/labels'
import { CANVAS_TOKENS, DARK, LIGHT, boxTouchesPolygon, computeTrajectories, momentText, setBottomInset, trajectoryColour, vectorScales } from '../../src/render/renderer'
import type { Camera } from '../../src/render/renderer'
import { renderFrame } from '../../src/render/frame'
import { GAS_UNITS, MIX_RANGES, WAVE_LIMITS, clampToPhase, gasText, gasValue, outsidePhase, phaseRange } from '../../src/render/labLimits'
import { buildTemplate } from '../../src/templates'
import { simulate } from '../../src/engine/recording'
import { locale } from '../../src/i18n/locale'

/** A deterministic pseudo-random sequence (LCG) for the property tests. */
function lcg(seed: number) { let s = seed >>> 0; return () => { s = (1664525 * s + 1013904223) >>> 0; return s / 2 ** 32 } }

describe('greedy label placement', () => {
  it('places no two shown labels over each other and keeps them off hard obstacles', () => {
    const rnd = lcg(2665)
    for (let round = 0; round < 20; round++) {
      const obstacles: Box[] = Array.from({ length: 6 }, () => ({ x: rnd() * 700, y: rnd() * 400, w: 20 + rnd() * 60, h: 20 + rnd() * 60 }))
      const labels: LabelRequest[] = Array.from({ length: 40 }, () => {
        const w = 30 + rnd() * 70, h = 15
        return { x: rnd() * 750, y: rnd() * 420, w, h, candidates: besideCandidates(h, -w - 8), optional: rnd() < 0.5 }
      })
      const out = placeLabels(labels, obstacles, { width: 800, height: 450 })
      const shown = out.filter(p => p.shown && !p.crowded)
      for (let i = 0; i < shown.length; i++) {
        for (let j = i + 1; j < shown.length; j++) expect(overlaps(shown[i], shown[j])).toBe(false)
        for (const o of obstacles) expect(overlaps(shown[i], o)).toBe(false)
      }
      // a label that found no free place is either left out (optional) or marked crowded
      for (let i = 0; i < out.length; i++) if (!out[i].shown) expect(labels[i].optional).toBe(true)
      // most labels find a place in this sparse field
      expect(shown.length).toBeGreaterThan(25)
    }
  })

  it('finds the same collisions through its grid as a brute-force check', () => {
    const rnd = lcg(7)
    for (let round = 0; round < 30; round++) {
      const layer = new LabelLayer()
      layer.reset(640, 360)
      const boxes: Box[] = []
      for (let k = 0; k < 30; k++) {
        // some boxes off the canvas, some spanning many cells
        const b = { x: rnd() * 800 - 80, y: rnd() * 460 - 50, w: 4 + rnd() * 200, h: 4 + rnd() * 120 }
        const p = layer.place({ ...b, optional: true })
        const free = boxes.every(o => !overlaps(o, b))
        expect(p.shown).toBe(free)
        if (p.shown) boxes.push(b)
      }
    }
  })

  it('respects priority: the label placed first keeps its place, the later one moves and gets a leader line', () => {
    const a = { x: 100, y: 100, w: 60, h: 16 }
    const [first, second] = placeLabels([
      { ...a, anchor: [100, 120], candidates: besideCandidates(16, -70) },
      { ...a, anchor: [110, 120], candidates: besideCandidates(16, -70) }
    ])
    expect(first).toMatchObject({ x: 100, y: 100, shown: true, moved: false, leader: false })
    expect(second.shown).toBe(true)
    expect(second.moved).toBe(true)
    expect(overlaps(first, second)).toBe(false)
    // one line up (17 px) is less than 1.2 × 16: no leader yet; a label pushed further away gets one
    expect(second.leader).toBe(false)
    const crowd = placeLabels([
      { ...a }, { ...a, y: 83 }, { ...a, y: 117 },
      { ...a, anchor: [100, 108], candidates: besideCandidates(16, 0) }
    ])
    expect(crowd[3].shown).toBe(true)
    expect(Math.hypot(crowd[3].x - a.x, crowd[3].y - a.y)).toBeGreaterThan(1.2 * 16)
    expect(crowd[3].leader).toBe(true)
  })

  it('leaves out an optional label that cannot be placed and forces a required one to its least bad place', () => {
    const block = { x: 0, y: 0, w: 200, h: 200 }
    const [tick] = placeLabels([{ x: 50, y: 50, w: 20, h: 10, optional: true }], [block])
    expect(tick.shown).toBe(false)
    const [name] = placeLabels([{ x: 50, y: 50, w: 20, h: 10, candidates: [[0, 0], [10, 0]] }], [block])
    expect(name).toMatchObject({ shown: true, crowded: true, x: 50, y: 50 })
  })

  it('avoids soft obstacles when it can and accepts them when nothing else is free', () => {
    const layer = new LabelLayer()
    layer.reset(400, 300)
    layer.obstacle({ x: 0, y: 100, w: 400, h: 200 }, true) // a ground
    const free = layer.place({ x: 50, y: 110, w: 30, h: 12, candidates: [[0, 0], [0, -30]] })
    expect(free).toMatchObject({ x: 50, y: 80, crowded: false })
    const inside = layer.place({ x: 200, y: 150, w: 30, h: 12, candidates: [[0, 0], [0, 20]] })
    expect(inside).toMatchObject({ x: 200, y: 150, shown: true, crowded: true })
    // a soft test (the real outline of a fixed body) counts like a soft box
    layer.reset(400, 300)
    layer.softTest = b => b.y + b.h > 200
    expect(layer.place({ x: 10, y: 195, w: 20, h: 10, candidates: [[0, 0], [0, -20]] })).toMatchObject({ y: 175, crowded: false })
    // reset clears the soft test
    layer.reset(400, 300)
    expect(layer.softTest).toBeNull()
  })

  it('tries the candidates of a value label like the earlier tagPosition: lines up and down, then the other side', () => {
    const c = besideCandidates(15, -80, 2)
    expect(c).toEqual([[0, 0], [0, -16], [0, 16], [0, -32], [0, 32], [-80, 0], [-80, -16], [-80, 16], [-80, -32], [-80, 32]])
  })
})

describe('tick numbers, level labels and outlines', () => {
  it('a tick number goes to the other side of its axis when a fixed body covers it there (D1, D6)', () => {
    const ground = (b: Box) => b.y + b.h > 300
    expect(tickSide({ x: 10, y: 302, w: 20, h: 13 }, { x: 10, y: 283, w: 20, h: 13 }, ground)).toBe('other')
    expect(tickSide({ x: 10, y: 270, w: 20, h: 13 }, { x: 10, y: 302, w: 20, h: 13 }, ground)).toBe('asked')
    // covered on both sides: it stays where it was asked (drawn with its halo)
    expect(tickSide({ x: 10, y: 302, w: 20, h: 13 }, { x: 10, y: 310, w: 20, h: 13 }, ground)).toBe('asked')
  })

  it('spreads close levels at least `gap` apart, in order, within the room (D9)', () => {
    const ys = [400, 120, 112, 108, 30]
    const at = spreadLabels(ys, 14, 20, 420)
    const order = ys.map((_, i) => i).sort((a, b) => ys[a] - ys[b])
    for (let k = 1; k < order.length; k++) expect(at[order[k]] - at[order[k - 1]]).toBeGreaterThanOrEqual(14 - 1e-9)
    for (const v of at) { expect(v).toBeGreaterThanOrEqual(20); expect(v).toBeLessThanOrEqual(420) }
    // labels already apart stay where they are
    expect(spreadLabels([10, 50, 90], 14)).toEqual([10, 50, 90])
    // a column pressed against the bottom moves up as a whole
    expect(spreadLabels([95, 98, 99], 10, 0, 100)).toEqual([80, 90, 100])
  })

  it('tests a box against a polygon by its outline, not its bounding box', () => {
    // an incline: right triangle (0,300) (400,300) (400,100) in screen coordinates
    const tri = [0, 300, 400, 300, 400, 100]
    expect(boxTouchesPolygon({ x: 50, y: 150, w: 40, h: 20 }, tri)).toBe(false) // in the air above the slope
    expect(boxTouchesPolygon({ x: 350, y: 250, w: 20, h: 20 }, tri)).toBe(true) // wholly inside
    expect(boxTouchesPolygon({ x: 180, y: 190, w: 60, h: 40 }, tri)).toBe(true) // across the slope
    // resting exactly on the top of a ground only touches it
    const ground = [0, 300, 400, 300, 400, 400, 0, 400]
    expect(boxTouchesPolygon({ x: 10, y: 287, w: 20, h: 13 }, ground)).toBe(false)
    expect(boxTouchesPolygon({ x: 10, y: 290, w: 20, h: 13 }, ground)).toBe(true)
  })
})

describe('key-moment text (D16)', () => {
  const names: Record<string, string> = { ground: '地面', ball: '小球', track: '圆弧轨道' }
  const nameOf = (id: string) => names[id] ?? id
  it('writes one clause per contact pair', () => {
    const text = momentText([
      { type: 'touch', subject: 'ground|ball', bodies: ['ground', 'ball'] },
      { type: 'separate', subject: 'track|ball', bodies: ['track', 'ball'] }
    ], nameOf, 0.5197, 4)
    expect(text).toBe('地面–小球 接触；圆弧轨道–小球 分离  t = 0.5197 s')
  })
  it('keeps several changes of one pair in one clause, with the impulse of an impact', () => {
    const text = momentText([
      { type: 'impact', subject: 'ground|ball', bodies: ['ground', 'ball'], impulse: -0.5 },
      { type: 'touch', subject: 'ground|ball', bodies: ['ground', 'ball'] },
      { type: 'timestep', subject: '', bodies: [] }
    ], nameOf, 1, 4)
    // the impulse in its display unit (kg·m/s by default)
    expect(text).toMatch(/^地面–小球 碰撞、接触（I = 0\.5 [^）]+）  t = 1 s$/)
  })
  it('separates the clauses the way the language does', () => {
    try {
      locale.lang = 'en'
      const text = momentText([
        { type: 'touch', subject: 'a|b', bodies: ['a', 'b'] },
        { type: 'separate', subject: 'c|b', bodies: ['c', 'b'] }
      ], id => id, 2, 4)
      expect(text).toContain('; ')
      expect(text).not.toMatch(/[一-鿿]/)
    } finally { locale.lang = 'zh' }
  })
  it('the arc-slide template names the ground and the track in their own clauses', () => {
    const rec = simulate(buildTemplate('arc-slide', {}), { duration: 1 })
    const e = rec.events.find(ev => new Set(ev.changes.filter(c => c.type !== 'timestep').map(c => c.subject)).size > 1)
    expect(e).toBeTruthy()
    const model = rec.system.model
    const text = momentText(e!.changes, id => model.byId.get(id)?.name ?? id, e!.t, 4)
    const clauses = text.split('  t = ')[0].split('；')
    expect(clauses.length).toBe(new Set(e!.changes.filter(c => c.type !== 'timestep').map(c => c.subject)).size)
  })
})

describe('colours of the canvas (D7)', () => {
  const css = readFileSync(join(__dirname, '../../src/app/tokens.css'), 'utf8')
  const { tokens } = readTokens(css) as { tokens: Map<string, Record<string, string>> }
  it('the palette holds the values of the canvas tokens of tokens.css, in both themes', () => {
    for (const [key, name] of Object.entries(CANVAS_TOKENS)) {
      const t = tokens.get(name)
      expect(t, name).toBeTruthy()
      expect(LIGHT[key as keyof typeof CANVAS_TOKENS]).toBe(t!.light)
      expect(DARK[key as keyof typeof CANVAS_TOKENS]).toBe(t!.dark)
    }
  })
  it('a trajectory keeps at least 3 : 1 on the dark canvas and its own colour where it already has it', () => {
    for (const body of ['#ef4444', '#f59e0b', '#2563eb', '#b45309', '#64748b', '#475569', '#92400e', '#16a34a', '#0d9488']) {
      const c = trajectoryColour(body, DARK)
      expect(contrastOver(c, DARK.bg, DARK.traceAlpha!)).toBeGreaterThanOrEqual(3 - 1e-9)
      // the light theme only lifts what is too faint there (a light grey)
      const l = trajectoryColour(body, LIGHT)
      expect(contrastOver(l, LIGHT.bg, LIGHT.traceAlpha!)).toBeGreaterThanOrEqual(1.8 - 1e-9)
    }
    expect(trajectoryColour('#ef4444', LIGHT)).toBe('#ef4444')
    expect(liftContrast('#ffffff', '#ffffff', '#000000', 3)).not.toBe('#ffffff')
    // nothing to measure on a transparent export: unchanged
    expect(trajectoryColour('#475569', { ...DARK, bg: 'rgba(0,0,0,0)' })).toBe('#475569')
  })
  it('the field lines of the dark theme are at least as visible as the light ones', () => {
    expect(contrastOver(DARK.fieldFaint!, DARK.bg)).toBeGreaterThan(contrastOver(LIGHT.fieldFaint!, LIGHT.bg))
    expect(contrastOver(DARK.fieldLine!, DARK.bg)).toBeGreaterThanOrEqual(3)
    expect(contrastOver(LIGHT.fieldLine!, LIGHT.bg)).toBeGreaterThanOrEqual(3)
  })
})

describe('lab helpers (D13, M9, M10)', () => {
  it('the gas lab shows pressure in kPa and volume in L everywhere (D13)', () => {
    expect(GAS_UNITS.p.unit).toBe('kPa')
    expect(GAS_UNITS.V.unit).toBe('L')
    expect(gasText('p', 7.597e4)).toBe('75.97 kPa')
    expect(gasText('V', 0.003283)).toBe('3.283 L')
    expect(gasText('T', 300)).toBe('300 K')
    // the chart's numbers are the same conversion
    expect(gasValue('p', 7.597e4)).toBeCloseTo(75.97, 12)
    expect(gasValue('V', 0.003283)).toBeCloseTo(3.283, 12)
  })
  it('keeps each initial temperature in the range where its substance keeps its state (M9)', () => {
    expect(phaseRange('water')).toEqual({ min: 0, max: 100 })
    expect(clampToPhase('water', 120)).toBe(100)
    expect(clampToPhase('water', -5)).toBe(0)
    expect(clampToPhase('ice', 5)).toBe(0)
    expect(clampToPhase('ice', -10)).toBe(-10)
    expect(clampToPhase('iron', 90)).toBe(90)
    expect(clampToPhase('alcohol', 90)).toBe(78)
    expect(clampToPhase('water', Number.NaN)).toBe(20)
    expect(outsidePhase('water', 100.5)).toBe(true)
    expect(outsidePhase('ice', 0)).toBe(false)
    expect(outsidePhase('ice', 0.1)).toBe(true)
    for (const r of Object.values(MIX_RANGES)) expect(r.min).toBeLessThan(r.max)
  })
  it('bounds the wave-optics inputs so the list of maxima stays small (M10)', () => {
    // principal maxima d·sinθ = mλ for |m| ≤ d/λ: at most 2·d_max/λ_min + 1 with λ ≥ 380 nm (the slider's range)
    expect(2 * WAVE_LIMITS.d.max / 380e-9 + 1).toBeLessThan(30000)
    expect(WAVE_LIMITS.a.max).toBeLessThanOrEqual(WAVE_LIMITS.d.max)
    expect(WAVE_LIMITS.half.max).toBeLessThanOrEqual(1)
  })
})

// ---- The renderer drawing real scenes into a recording context ----

interface TextCall { op: 'fill' | 'stroke'; text: string; x: number; y: number; font: string; order: number }
/** A 2D context stand-in: records the text calls (with the font) and the order of fills; measures 0.55 em per glyph. */
function recordingContext(width: number, height: number) {
  const texts: TextCall[] = []
  let order = 0, lastFill = 0
  const fills: number[] = []
  const state: Record<string, unknown> = { font: '10px sans-serif', canvas: { width, height } }
  const size = () => parseFloat(/([\d.]+)px/.exec(String(state.font))?.[1] ?? '10')
  const ctx = new Proxy(state, {
    get(target, k) {
      if (k in target) return target[k as string]
      if (k === 'measureText') return (t: string) => ({ width: [...t].length * size() * 0.55 })
      if (k === 'fillText' || k === 'strokeText') return (t: string, x: number, y: number) => { texts.push({ op: k === 'fillText' ? 'fill' : 'stroke', text: t, x, y, font: String(target.font), order: order++ }) }
      if (k === 'fill' || k === 'fillRect') return () => { lastFill = order++; fills.push(lastFill) }
      if (k === 'createPattern' || k === 'getTransform' || k === 'createLinearGradient' || k === 'createRadialGradient') return undefined
      if (k === 'isPointInPath') return () => false
      return () => { order++ }
    },
    set(target, k, v) { target[k as string] = v; return true }
  })
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts, fills }
}

const OPTIONS = { velocity: true, acceleration: false, forces: false, forcesAll: false, trajectory: true, labels: true, grid: true, axes: true, names: true }

describe('the renderer draws the axis numbers above the scene (D1, D4)', () => {
  it('the x numbers of an axis on the top of a ground go above the axis, after the ground is filled', () => {
    const rec = simulate(buildTemplate('projectile', {}), { duration: 1.5 })
    const cam: Camera = { cx: 5, cy: 2, ppm: 60, width: 800, height: 450 }
    const { ctx, texts, fills } = recordingContext(cam.width, cam.height)
    renderFrame(ctx, cam, { rec, time: 0.6, options: OPTIONS, palette: LIGHT, digits: 4, scales: vectorScales(rec), trajectories: computeTrajectories(rec) })
    const oy = cam.height / 2 + cam.cy * cam.ppm
    const ticks = texts.filter(t => t.op === 'fill' && /^10px/.test(t.font) && /^-?\d/.test(t.text))
    const xTicks = ticks.filter(t => Math.abs(t.y - oy) < 20)
    expect(xTicks.length).toBeGreaterThan(3)
    // above the axis: below it they were inside the ground
    for (const t of xTicks) expect(t.y).toBeLessThan(oy)
    // drawn after the bodies (after the name of the ball, which follows them) with a halo stroked first
    const name = rec.system.model.dynamic[0].name
    const nameFill = texts.find(s => s.op === 'fill' && s.text === name)!
    expect(nameFill).toBeTruthy()
    expect(texts.some(s => s.op === 'stroke' && s.text === name && s.order < nameFill.order)).toBe(true)
    expect(fills.some(f => f < nameFill.order)).toBe(true)
    for (const t of xTicks) {
      expect(t.order).toBeGreaterThan(nameFill.order)
      expect(texts.some(s => s.op === 'stroke' && s.text === t.text && s.x === t.x && s.y === t.y && s.order < t.order)).toBe(true)
    }
  })

  it('numbers pinned to the bottom edge stay above the floating timeline', () => {
    const rec = simulate(buildTemplate('pendulum', {}), { duration: 0.5 })
    // the x axis (y = 0) is below the canvas: its numbers are pinned to the bottom edge
    const cam: Camera = { cx: 0, cy: 1.6, ppm: 300, width: 800, height: 450 }
    try {
      setBottomInset(64)
      const { ctx, texts } = recordingContext(cam.width, cam.height)
      renderFrame(ctx, cam, { rec, time: 0.2, options: OPTIONS, palette: LIGHT, digits: 4, scales: vectorScales(rec), trajectories: computeTrajectories(rec) })
      // the x numbers and the axis name pinned to the edge sit 30 px above the timeline …
      const pinned = texts.filter(t => t.op === 'fill' && (/^10px/.test(t.font) || t.text.startsWith('x / ')) && Math.abs(t.y - (cam.height - 30 - 64)) < 1e-9)
      expect(pinned.length).toBeGreaterThan(1)
      expect(pinned.some(t => t.text.startsWith('x / '))).toBe(true)
      // … and no text of the canvas reaches into the 64 px the timeline covers
      for (const t of texts) expect(t.y).toBeLessThanOrEqual(cam.height - 64 - 3)
    } finally { setBottomInset(0) }
  })
})
