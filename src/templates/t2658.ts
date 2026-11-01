/**
 * Templates of 26.58 (D142): scenes with many bodies, computed with the many-body solver (`softstep`, D126) —
 * a pyramid of boxes, a Galton board (with the histogram of the bins and the binomial distribution drawn under the
 * board), a row of dominoes and balls poured onto the floor. All are Rust-only scenes (D134) written as format 8.
 */
import { tl } from '../i18n'
import type { Scene } from '../core/scene/types'
import { DEG, asin, cos, sin } from '../core/math/dmath'
import { addBody, addGround, defaultGravity, emptyScene } from '../core/scene/build'
import type { TemplateInfo, TemplateParam } from './index'

const p = (key: string, label: string, unit: string, value: number, min?: number, max?: number, step?: number): TemplateParam => ({ key, label, unit, value, min, max, step })
const gp = (): TemplateParam => p('g', '重力加速度 g', 'm/s²', defaultGravity(), 0)

/** The Galton board's histogram (drawn by render/histogram.ts): bins along x, counted below `topY`. */
/** Probability of the middle bin of B(n, ½). */
function binomialMiddle(n: number): number {
  let c = 1
  for (let k = 0; k < Math.floor(n / 2); k++) c = (c * (n - k)) / (k + 1)
  return c / Math.pow(2, n)
}

export interface HistogramDef { x0: number; binWidth: number; bins: number; floorY: number; topY: number; rows: number }

function many(name: string, description: string, g: number): Scene {
  const s = emptyScene(name)
  s.description = description
  s.settings.integrator = 'softstep'
  s.settings.outputStep = 1 / 60
  s.settings.gravity = { x: 0, y: -g }
  return s
}

function pyramid(v: Record<string, number>): Scene {
  const s = many(tl('金字塔堆叠'), tl('方块一层层堆成金字塔，由实时多体求解器计算：接触为软约束，堆稳后整组休眠，全部静止时计算停止。可增加层数或减小摩擦因数观察堆是否还能稳住。'), v.g)
  const rows = Math.round(v.rows), a = v.size, gap = 0.04 * a
  const mat = { muS: v.mu, muK: v.mu, restitution: 0 }
  addGround(s, { id: 'ground', top: 0, left: -rows * a, right: rows * a, material: mat })
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < rows - r; c++) {
      addBody(s, { id: `box${r}_${c}`, name: tl('方块 {0}-{1}', [r + 1, c + 1]), role: 'block', shape: { type: 'box', width: a, height: a }, position: { x: (c - (rows - r - 1) / 2) * (a + gap), y: a / 2 + r * a }, mass: v.m, material: mat })
    }
  }
  s.settings.legacyDuration = 3
  s.view = { center: { x: 0, y: rows * a * 0.45 }, pixelsPerMeter: Math.max(20, Math.min(160, 420 / (rows * a))) }
  return s
}

function galton(v: Record<string, number>): Scene {
  const s = many(tl('高尔顿板'), tl('小球从漏斗落下，穿过交错排列的钉子后落入下方各格。每颗钉子让小球向左或向右偏折，落点的分布接近二项分布 B(n, ½)（n 为钉子行数），球数多时接近正态分布。画面下方是各格的计数与二项分布的期望值。小球受到与速度成正比的阻力，相当于在倾斜木板上滚动时板面的阻碍。'), v.g)
  const rows = Math.round(v.rows), count = Math.round(v.n)
  const dx = 0.16, dy = 0.14, rPeg = 0.02, rBall = 0.035
  // bins tall enough for the expected middle count (two balls per layer, about 30 layers per metre)
  const middle = count * binomialMiddle(rows)
  const binH = Math.max(1.0, Math.ceil((1.3 * middle) / 30 * 10) / 10), pegTop = binH + 0.2 + (rows - 1) * dy
  const width = (rows + 1) * dx
  const e = 0.2, mu = 0.05
  // the board's own resistance (a tilted board on which the balls roll slows them): linear drag on each ball
  const boardDrag = 0.15
  const ball = { muS: mu, muK: mu, restitution: e }
  const wall = { muS: mu, muK: mu, restitution: e }
  addGround(s, { id: 'floor', top: 0, left: -width / 2 - 0.2, right: width / 2 + 0.2, material: wall })
  // side walls up to the funnel
  const sideH = pegTop + 1.6
  for (const [id, x] of [['wallL', -width / 2 - 0.02], ['wallR', width / 2 + 0.02]] as const) {
    addBody(s, { id, name: tl('侧壁'), kind: 'static', role: 'wall', shape: { type: 'box', width: 0.04, height: sideH }, position: { x, y: sideH / 2 }, material: wall })
  }
  // bin dividers
  for (let j = 1; j <= rows; j++) {
    const x = -width / 2 + j * dx
    addBody(s, { id: `div${j}`, name: tl('隔板'), kind: 'static', role: 'wall', shape: { type: 'box', width: 0.01, height: binH }, position: { x, y: binH / 2 }, material: wall })
  }
  // pegs: staggered rows
  for (let j = 0; j < rows; j++) {
    const y = pegTop - j * dy
    const odd = j % 2 === 1
    const k = odd ? rows : rows + 1
    for (let i = 0; i < k; i++) {
      const x = -width / 2 + (odd ? (i + 1) * dx : (i + 0.5) * dx)
      if (Math.abs(x) > width / 2 - rPeg) continue
      addBody(s, { id: `peg${j}_${i}`, name: tl('钉子'), kind: 'static', role: 'generic', shape: { type: 'circle', radius: rPeg }, position: { x, y }, material: wall, color: '#64748b' })
    }
  }
  // funnel: two slanted plates leaving an opening above the middle peg
  const fy = pegTop + 0.25, open = 0.22, fh = 1.2
  const plate = (id: string, side: number) => {
    const x0 = side * open / 2, x1 = side * (width / 2), t = 0.03
    const pts = side < 0
      ? [{ x: x1, y: fy + fh }, { x: x0, y: fy }, { x: x0 + t, y: fy }, { x: x1 + t, y: fy + fh }]
      : [{ x: x0 - t, y: fy }, { x: x0, y: fy }, { x: x1, y: fy + fh }, { x: x1 - t, y: fy + fh }]
    addBody(s, { id, name: tl('漏斗'), kind: 'static', role: 'wall', shape: { type: 'polygon', points: pts }, position: { x: 0, y: 0 }, material: wall })
  }
  plate('funnelL', -1)
  plate('funnelR', 1)
  // balls in a loose grid above the funnel
  const perRow = Math.max(4, Math.floor((width - 0.1) / (2.4 * rBall)))
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / perRow), col = i % perRow
    const x = -width / 2 + 0.06 + col * 2.4 * rBall + (row % 2) * 1.2 * rBall
    const y = fy + fh + 0.1 + row * 2.3 * rBall
    addBody(s, { id: `ball${i}`, name: tl('小球 {0}', [i + 1]), role: 'ball', shape: { type: 'circle', radius: rBall }, position: { x, y }, mass: 0.02, material: ball, drag: { linear: boardDrag, quadratic: 0 } })
  }
  const hist: HistogramDef = { x0: -width / 2, binWidth: dx, bins: rows + 1, floorY: 0, topY: binH, rows }
  s.extra = { histogram: hist }
  s.settings.legacyDuration = 20
  const top = fy + fh + 0.1 + Math.ceil(count / perRow) * 2.3 * rBall
  s.view = { center: { x: 0, y: top / 2 - 0.2 }, pixelsPerMeter: Math.max(30, Math.min(200, 520 / (top + 0.6))) }
  return s
}

function dominoes(v: Record<string, number>): Scene {
  const s = many(tl('多米诺骨牌'), tl('一排竖立的骨牌，第一块被轻推后倒下，依次推倒后面的骨牌。改变间距 d 与骨牌高度 h，比较倒塌传播的快慢（d 接近 h 时传不下去）。'), v.g)
  const n = Math.round(v.n), h = v.h, w = 0.15 * h, d = v.d
  const mat = { muS: v.mu, muK: v.mu, restitution: 0 }
  addGround(s, { id: 'ground', top: 0, left: -0.5, right: n * d + 1, material: mat })
  // Dominoes about as slender as real ones (thickness 0.15 h; tipping angle atan(0.15) ≈ 8.5°). The first one
  // leans forward about its front bottom corner — at most 12° and clear of the second one — and is given a gentle
  // push: it turns at PUSH rad/s about that corner (26.58, D146: thick dominoes leaning 12° stood up again, and the
  // energy of one falling through 14° did not tip the next one)
  const gap = d - w, lean = gap > 0 ? Math.min(12 * DEG, 0.8 * asin(Math.min(1, gap / h))) : 0
  const PUSH = 2
  for (let i = 0; i < n; i++) {
    const tilt = i === 0 ? -lean : 0
    // centre relative to the front bottom corner (w/2, 0), turned by tilt
    const rx = -(w / 2) * cos(tilt) - (h / 2) * sin(tilt), ry = -(w / 2) * sin(tilt) + (h / 2) * cos(tilt)
    const x = i * d + w / 2 + rx, y = ry
    // rigid rotation about the corner with ω = −PUSH: v = ω × r
    const omega = i === 0 ? -PUSH : 0
    addBody(s, { id: `d${i}`, name: tl('骨牌 {0}', [i + 1]), role: 'block', shape: { type: 'box', width: w, height: h }, position: { x, y }, angle: tilt, velocity: { x: -omega * ry, y: omega * rx }, angularVelocity: omega, mass: v.m, material: mat })
  }
  s.settings.legacyDuration = 4
  s.view = { center: { x: (n * d) / 2, y: h }, pixelsPerMeter: Math.max(20, Math.min(400, 700 / (n * d + 1))) }
  return s
}

function pour(v: Record<string, number>): Scene {
  const s = many(tl('小球倒入容器'), tl('一堆小球从上方落到地面上堆积。摩擦因数与滚动阻力越大，堆积的坡越陡（休止角越大）；都为零时小球会散开铺平。'), v.g)
  const n = Math.round(v.n), r = 0.05
  const mat = { muS: v.mu, muK: v.mu, restitution: 0.1, rolling: v.crr }
  addGround(s, { id: 'ground', top: 0, left: -1.6, right: 1.6, material: mat })
  for (const [id, x] of [['wallL', -1.55], ['wallR', 1.55]] as const) {
    addBody(s, { id, name: tl('容器壁'), kind: 'static', role: 'wall', shape: { type: 'box', width: 0.1, height: 0.6 }, position: { x, y: 0.3 }, material: mat })
  }
  const perRow = 12
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / perRow), col = i % perRow
    addBody(s, { id: `ball${i}`, name: tl('小球 {0}', [i + 1]), role: 'ball', shape: { type: 'circle', radius: r }, position: { x: (col - perRow / 2) * 2.3 * r + (row % 2) * r, y: 0.7 + row * 2.2 * r }, mass: 0.05, material: mat })
  }
  s.settings.legacyDuration = 6
  s.view = { center: { x: 0, y: 0.9 }, pixelsPerMeter: 150 }
  return s
}

export const TEMPLATES_2658: TemplateInfo[] = [
  { id: 'pyramid', group: '多体与统计', name: '金字塔堆叠', description: '几十个方块堆成金字塔，堆稳后休眠', params: [p('rows', '层数', '', 10, 2, 16, 1), p('size', '方块边长 a', 'm', 0.4, 0.05, 2, 0.05), p('m', '每块质量 m', 'kg', 1, 0.01), p('mu', '摩擦因数 μ', '', 0.6, 0, 2, 0.05), gp()], build: pyramid },
  { id: 'galton', group: '多体与统计', name: '高尔顿板', description: '小球穿过钉阵落入各格，计数接近二项分布', params: [p('n', '小球数', '', 120, 10, 400, 10), p('rows', '钉子行数 n', '', 10, 4, 14, 1), gp()], build: galton },
  { id: 'dominoes', group: '多体与统计', name: '多米诺骨牌', description: '骨牌依次倒下；改变间距看传播快慢', params: [p('n', '骨牌数', '', 24, 3, 80, 1), p('h', '高度 h', 'm', 0.2, 0.02, 2, 0.01), p('d', '间距 d', 'm', 0.1, 0.01, 2, 0.01), p('m', '质量 m', 'kg', 0.05, 0.001), p('mu', '摩擦因数 μ', '', 0.4, 0, 2, 0.05), gp()], build: dominoes },
  { id: 'ball-pour', group: '多体与统计', name: '小球倒入容器', description: '小球落地堆积；摩擦与滚动阻力决定坡度', params: [p('n', '小球数', '', 150, 10, 400, 10), p('mu', '摩擦因数 μ', '', 0.6, 0, 2, 0.05), p('crr', '滚动阻力系数 C_rr', '', 0.1, 0, 1, 0.01), gp()], build: pour }
]
