/**
 * Element kinds and example circuits of the circuit experiment (26.54, D80; 26.55, D89). Elements sit between grid
 * points; a transformer or an RCD has a second pair of terminals (c, d) beside the first. Each example may start in
 * "run" mode (time domain) with a time scale (simulated seconds per real second) and a scope span.
 */
import { tl } from '../../i18n'
import type { CircuitKind } from '../../engine/labs'

export type Pt = [number, number]
/** Kinds of the editor: the core's kinds plus earth (a wire to the common earth node). */
export type EditorKind = CircuitKind | 'ground'

export interface El {
  id: string; kind: EditorKind; name: string; a: Pt; b: Pt; c?: Pt | null; d?: Pt | null
  /** Display name of an example's element ("电水壶"), shown instead of the name. */
  label?: string
  E?: number; r?: number; R?: number; U?: number; P?: number; pos?: number; C?: number; closed?: boolean
  L?: number; f?: number; phase?: number; k?: number; J?: number; fr?: number; load?: number; generator?: boolean; omega?: number
  n1?: number; n2?: number; r2?: number; I?: number; beta?: number; T?: number; gamma?: number; lux?: number; F0?: number; F?: number; channel?: number
}

export interface KindInfo { label: string; icon: string; prefix: string; group: 'basic' | 'ac' | 'sensor' }
export const KIND_INFO: Record<EditorKind, KindInfo> = {
  wire: { label: tl('导线'), icon: 'wire', prefix: '', group: 'basic' },
  battery: { label: tl('电池'), icon: 'battery', prefix: 'E', group: 'basic' },
  resistor: { label: tl('定值电阻'), icon: 'resistor', prefix: 'R', group: 'basic' },
  lamp: { label: tl('小灯泡'), icon: 'lamp', prefix: 'L', group: 'basic' },
  switch: { label: tl('开关'), icon: 'switch', prefix: 'S', group: 'basic' },
  rheostat: { label: tl('滑动变阻器'), icon: 'rheostat', prefix: 'Rp', group: 'basic' },
  ammeter: { label: tl('电流表'), icon: 'ammeter', prefix: 'A', group: 'basic' },
  voltmeter: { label: tl('电压表'), icon: 'voltmeter', prefix: 'V', group: 'basic' },
  capacitor: { label: tl('电容器'), icon: 'capacitor', prefix: 'C', group: 'basic' },
  inductor: { label: tl('电感线圈'), icon: 'inductor', prefix: 'Lc', group: 'ac' },
  ac: { label: tl('交流电源'), icon: 'ac', prefix: 'AC', group: 'ac' },
  diode: { label: tl('二极管'), icon: 'diode', prefix: 'D', group: 'ac' },
  motor: { label: tl('电动机 / 发电机'), icon: 'motor', prefix: 'M', group: 'ac' },
  transformer: { label: tl('变压器'), icon: 'transformer', prefix: 'T', group: 'ac' },
  fuse: { label: tl('保险丝'), icon: 'fuse', prefix: 'FU', group: 'ac' },
  rcd: { label: tl('漏电保护器'), icon: 'rcd', prefix: 'Q', group: 'ac' },
  ground: { label: tl('接地'), icon: 'ground', prefix: '', group: 'ac' },
  thermistor: { label: tl('热敏电阻'), icon: 'thermistor', prefix: 'Rt', group: 'sensor' },
  ldr: { label: tl('光敏电阻'), icon: 'ldr', prefix: 'Rg', group: 'sensor' },
  fsr: { label: tl('压敏电阻'), icon: 'fsr', prefix: 'Rf', group: 'sensor' },
  galvanometer: { label: tl('灵敏电流计'), icon: 'galvanometer', prefix: 'G', group: 'sensor' },
  probe: { label: tl('示波器探头'), icon: 'probe', prefix: 'CH', group: 'sensor' }
}
export const KINDS = Object.keys(KIND_INFO) as EditorKind[]
export const FOUR_TERMINAL = new Set<EditorKind>(['transformer', 'rcd'])

export function defaultsOf(kind: EditorKind): Partial<El> {
  switch (kind) {
    case 'battery': return { E: 3, r: 0 }
    case 'resistor': return { R: 10 }
    case 'lamp': return { U: 2.5, P: 0.75 }
    case 'switch': return { closed: true }
    case 'rheostat': return { R: 20, pos: 0.5, c: null }
    case 'ammeter': return { r: 0 }
    case 'voltmeter': return { r: 0 }
    case 'capacitor': return { C: 1e-6 }
    case 'inductor': return { L: 0.1, r: 0 }
    case 'ac': return { E: 5, f: 50, phase: 0, r: 0 }
    case 'diode': return { U: 0.7, r: 0 }
    case 'motor': return { R: 2, k: 0.05, J: 1e-4, fr: 1e-5, load: 0, generator: false, omega: 100 }
    case 'transformer': return { n1: 1000, n2: 100, L: 50, r: 0, r2: 0 }
    case 'fuse': return { I: 1 }
    case 'rcd': return { I: 0.03 }
    case 'thermistor': return { R: 10e3, beta: 3950, T: 25 }
    case 'ldr': return { R: 20e3, gamma: 0.7, lux: 10 }
    case 'fsr': return { R: 100e3, F0: 1, F: 0 }
    case 'galvanometer': return { r: 100, I: 1e-3 }
    case 'probe': return { channel: 1 }
    default: return {}
  }
}

/** Second terminal pair of a four-terminal element: beside a–b, `gap` cells to the right of the direction a → b. */
export function besides(a: Pt, b: Pt, gap = 3): [Pt, Pt] {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1
  const nx = Math.round((dy / l) * gap), ny = Math.round((-dx / l) * gap)
  return [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny]]
}

type Raw = Omit<El, 'id' | 'name'>
function el(kind: EditorKind, a: Pt, b: Pt, extra: Partial<El> = {}): Raw {
  const base: Raw = { kind, a, b, ...defaultsOf(kind), ...extra }
  if (FOUR_TERMINAL.has(kind) && !extra.c) { const [c, d] = besides(a, b); base.c = c; base.d = d }
  return base
}

export interface Preset {
  label: string
  /** Group of the example list. */
  group: 'dc' | 'time' | 'ac' | 'home' | 'meter'
  build: () => Raw[]
  /** Start in the time domain with this time scale (simulated s per real s) and scope span (s). */
  run?: { scale: number; span: number }
}

export const PRESET_GROUPS: Array<{ id: Preset['group']; label: string }> = [
  { id: 'dc', label: tl('直流电路') },
  { id: 'time', label: tl('暂态') },
  { id: 'ac', label: tl('交流电与电机') },
  { id: 'home', label: tl('家庭电路') },
  { id: 'meter', label: tl('电表与传感器') }
]

export const PRESETS: Record<string, Preset> = {
  series: { label: tl('串联'), group: 'dc', build: () => [
    el('battery', [-4, 2], [-4, -2], { E: 3 }), el('wire', [-4, 2], [-2, 2]), el('switch', [-2, 2], [0, 2]), el('resistor', [0, 2], [2, 2], { R: 5 }),
    el('wire', [2, 2], [4, 2]), el('lamp', [4, 2], [4, -2]), el('ammeter', [4, -2], [0, -2]), el('wire', [0, -2], [-4, -2]),
    el('voltmeter', [0, 4], [2, 4]), el('wire', [0, 4], [0, 2]), el('wire', [2, 4], [2, 2])
  ] },
  parallel: { label: tl('并联'), group: 'dc', build: () => [
    el('battery', [-4, 2], [-4, -2], { E: 3 }), el('wire', [-4, 2], [0, 2]), el('lamp', [0, 2], [0, -2], { U: 3, P: 0.9 }), el('wire', [0, 2], [3, 2]),
    el('switch', [3, 2], [3, 0]), el('lamp', [3, 0], [3, -2], { U: 3, P: 1.5 }), el('wire', [3, -2], [0, -2]), el('ammeter', [0, -2], [-4, -2])
  ] },
  mixed: { label: tl('混联'), group: 'dc', build: () => [
    el('battery', [-4, 2], [-4, -2], { E: 6, r: 1 }), el('resistor', [-4, 2], [0, 2], { R: 4 }), el('resistor', [0, 2], [0, -2], { R: 6 }),
    el('wire', [0, 2], [3, 2]), el('resistor', [3, 2], [3, -2], { R: 12 }), el('wire', [3, -2], [0, -2]), el('ammeter', [0, -2], [-4, -2])
  ] },
  emf: { label: tl('测电源电动势和内阻'), group: 'dc', build: () => [
    el('battery', [-4, 2], [-4, -2], { E: 1.5, r: 0.8 }), el('switch', [-4, 2], [-1, 2]), el('ammeter', [-1, 2], [2, 2], { r: 0 }),
    el('rheostat', [2, 2], [2, -2], { R: 20, pos: 0.4 }), el('wire', [2, -2], [-4, -2]), el('voltmeter', [-8, 2], [-8, -2]), el('wire', [-8, 2], [-4, 2]), el('wire', [-8, -2], [-4, -2])
  ] },
  divider: { label: tl('分压接法'), group: 'dc', build: () => [
    el('battery', [-4, 2], [-4, -2], { E: 6 }), el('wire', [-4, 2], [0, 2]), el('rheostat', [0, 2], [0, -2], { R: 50, pos: 0.3, c: [2, 0] }), el('wire', [0, -2], [-4, -2]),
    el('lamp', [2, 0], [4, 0], { U: 6, P: 3 }), el('wire', [4, 0], [4, -2]), el('wire', [4, -2], [0, -2]), el('voltmeter', [2, -4], [4, -4]), el('wire', [2, -4], [2, 0]), el('wire', [4, -4], [4, -2])
  ] },
  capacitor: { label: tl('电容器（稳态）'), group: 'dc', build: () => [
    el('battery', [-4, 2], [-4, -2], { E: 12 }), el('resistor', [-4, 2], [0, 2], { R: 100 }), el('capacitor', [0, 2], [0, 0], { C: 2e-6 }), el('capacitor', [0, 0], [0, -2], { C: 4e-6 }),
    el('wire', [0, -2], [-4, -2]), el('voltmeter', [2, 2], [2, 0]), el('wire', [2, 2], [0, 2]), el('wire', [2, 0], [0, 0])
  ] },
  short: { label: tl('短路演示'), group: 'dc', build: () => [
    el('battery', [-3, 2], [-3, -2], { E: 3, r: 0.5 }), el('wire', [-3, 2], [0, 2]), el('lamp', [0, 2], [0, -2]), el('wire', [0, -2], [-3, -2]),
    el('switch', [2, 2], [2, -2], { closed: false }), el('wire', [0, 2], [2, 2]), el('wire', [0, -2], [2, -2])
  ] },
  // ---- 26.55: transients ----
  rc: { label: tl('RC 充电与放电'), group: 'time', run: { scale: 0.01, span: 0.06 }, build: () => [
    el('battery', [-5, 2], [-5, -2], { E: 10 }), el('switch', [-5, 2], [-2, 2], { closed: true, label: tl('充电') }), el('resistor', [-2, 2], [1, 2], { R: 1000 }),
    el('capacitor', [1, 2], [1, -2], { C: 1e-5 }), el('wire', [1, -2], [-2, -2]), el('wire', [-2, -2], [-5, -2]), el('probe', [3, 2], [3, -2], { channel: 1 }), el('wire', [1, 2], [3, 2]), el('wire', [1, -2], [3, -2]),
    el('switch', [-2, 2], [-2, -2], { closed: false, label: tl('放电') }), el('probe', [-2, 4], [1, 4], { channel: 2 }), el('wire', [-2, 4], [-2, 2]), el('wire', [1, 4], [1, 2])
  ] },
  rl: { label: tl('RL 电路：断电自感'), group: 'time', run: { scale: 0.2, span: 1 }, build: () => [
    el('battery', [-5, 2], [-5, -2], { E: 6, r: 1 }), el('switch', [-5, 2], [-1, 2]), el('wire', [-1, 2], [2, 2]),
    el('lamp', [-1, 2], [-1, -2], { U: 6, P: 3 }), el('inductor', [2, 2], [2, -2], { L: 1, r: 2 }), el('wire', [2, -2], [-1, -2]), el('wire', [-1, -2], [-5, -2]),
    el('probe', [4, 2], [4, -2], { channel: 1 }), el('wire', [2, 2], [4, 2]), el('wire', [2, -2], [4, -2])
  ] },
  lc: { label: tl('LC 振荡'), group: 'time', run: { scale: 0.002, span: 0.004 }, build: () => [
    el('battery', [-6, 2], [-6, -2], { E: 5 }), el('switch', [-6, 2], [-3, 2], { closed: true }), el('wire', [-3, 2], [0, 2]),
    el('capacitor', [0, 2], [0, -2], { C: 1e-6 }), el('wire', [0, -2], [-6, -2]), el('switch', [0, 2], [3, 2], { closed: false }), el('inductor', [3, 2], [3, -2], { L: 0.1, r: 0 }), el('wire', [3, -2], [0, -2]),
    el('probe', [5, 2], [5, -2], { channel: 1 }), el('wire', [3, 2], [5, 2]), el('wire', [3, -2], [5, -2])
  ] },
  // ---- AC, motors, transformers ----
  acR: { label: tl('交流电：有效值'), group: 'ac', run: { scale: 0.02, span: 0.04 }, build: () => [
    el('ac', [-3, 2], [-3, -2], { E: 311, f: 50 }), el('wire', [-3, 2], [1, 2]), el('lamp', [1, 2], [1, -2], { U: 220, P: 40 }), el('ammeter', [1, -2], [-3, -2]),
    el('probe', [4, 2], [4, -2], { channel: 1 }), el('wire', [1, 2], [4, 2]), el('wire', [1, -2], [4, -2])
  ] },
  rlc: { label: tl('RC、RL 中的相位'), group: 'ac', run: { scale: 0.02, span: 0.04 }, build: () => [
    el('ac', [-4, 2], [-4, -2], { E: 10, f: 50 }), el('resistor', [-4, 2], [0, 2], { R: 100 }), el('capacitor', [0, 2], [0, -2], { C: 3.183e-5 }), el('wire', [0, -2], [-4, -2]),
    el('probe', [-7, 2], [-7, -2], { channel: 1 }), el('wire', [-7, 2], [-4, 2]), el('wire', [-7, -2], [-4, -2]),
    el('probe', [3, 2], [3, -2], { channel: 2 }), el('wire', [0, 2], [3, 2]), el('wire', [0, -2], [3, -2])
  ] },
  rectifier: { label: tl('二极管整流'), group: 'ac', run: { scale: 0.02, span: 0.06 }, build: () => [
    el('ac', [-4, 2], [-4, -2], { E: 10, f: 50 }), el('diode', [-4, 2], [0, 2], { U: 0.7 }), el('resistor', [0, 2], [0, -2], { R: 1000 }), el('wire', [0, -2], [-4, -2]),
    el('probe', [-7, 2], [-7, -2], { channel: 1 }), el('wire', [-7, 2], [-4, 2]), el('wire', [-7, -2], [-4, -2]),
    el('probe', [3, 2], [3, -2], { channel: 2 }), el('wire', [0, 2], [3, 2]), el('wire', [0, -2], [3, -2]),
    el('switch', [3, 2], [6, 2], { closed: false, label: tl('滤波') }), el('capacitor', [6, 2], [6, -2], { C: 1e-4 }), el('wire', [3, -2], [6, -2])
  ] },
  transformer: { label: tl('变压器'), group: 'ac', run: { scale: 0.02, span: 0.04 }, build: () => [
    el('ac', [-5, 2], [-5, -2], { E: 311, f: 50 }), el('wire', [-5, 2], [-2, 2]), el('wire', [-5, -2], [-2, -2]),
    el('transformer', [-2, 2], [-2, -2], { n1: 1100, n2: 60, L: 50, c: [1, 2], d: [1, -2] }),
    el('wire', [1, 2], [4, 2]), el('lamp', [4, 2], [4, -2], { U: 12, P: 6 }), el('ammeter', [4, -2], [1, -2]),
    el('probe', [-8, 2], [-8, -2], { channel: 1 }), el('wire', [-8, 2], [-5, 2]), el('wire', [-8, -2], [-5, -2]),
    el('probe', [7, 2], [7, -2], { channel: 2 }), el('wire', [4, 2], [7, 2]), el('wire', [4, -2], [7, -2])
  ] },
  transmission: { label: tl('远距离输电'), group: 'ac', run: { scale: 0.02, span: 0.04 }, build: () => [
    el('ac', [-11, 2], [-11, -2], { E: 311, f: 50 }), el('wire', [-11, 2], [-7, 2]), el('wire', [-11, -2], [-7, -2]),
    el('transformer', [-7, 2], [-7, -2], { n1: 100, n2: 2000, L: 200, c: [-4, 2], d: [-4, -2] }),
    el('resistor', [-4, 2], [4, 2], { R: 50 }), el('wire', [-4, -2], [4, -2]),
    el('transformer', [4, 2], [4, -2], { n1: 2000, n2: 100, L: 200, c: [7, 2], d: [7, -2] }),
    el('wire', [7, 2], [13, 2]), el('wire', [7, -2], [13, -2]), el('lamp', [13, 2], [13, -2], { U: 220, P: 1000 }),
    el('probe', [16, 2], [16, -2], { channel: 2 }), el('wire', [13, 2], [16, 2]), el('wire', [13, -2], [16, -2]),
    el('probe', [-16, 2], [-16, -2], { channel: 1 }), el('wire', [-16, 2], [-11, 2]), el('wire', [-16, -2], [-11, -2])
  ] },
  motor: { label: tl('电动机：反电动势'), group: 'ac', run: { scale: 0.2, span: 1 }, build: () => [
    el('battery', [-4, 2], [-4, -2], { E: 6 }), el('switch', [-4, 2], [-1, 2]), el('ammeter', [-1, 2], [2, 2]),
    el('motor', [2, 2], [2, -2], { R: 2, k: 0.05, J: 1e-4, fr: 1e-5, load: 0 }), el('wire', [2, -2], [-4, -2]),
    el('voltmeter', [4, 2], [4, -2]), el('wire', [2, 2], [4, 2]), el('wire', [2, -2], [4, -2])
  ] },
  generator: { label: tl('发电机'), group: 'ac', run: { scale: 0.2, span: 1 }, build: () => [
    el('motor', [-3, 2], [-3, -2], { R: 1, k: 0.05, J: 1e-4, generator: true, omega: 150 }), el('wire', [-3, 2], [1, 2]), el('lamp', [1, 2], [1, -2], { U: 6, P: 3 }), el('ammeter', [1, -2], [-3, -2])
  ] },
  // ---- household ----
  home: { label: tl('家庭电路与漏电保护'), group: 'home', run: { scale: 0.02, span: 0.06 }, build: () => [
    el('ac', [-9, 2], [-9, -2], { E: 311, f: 50 }), el('ground', [-9, -2], [-9, -2]),
    el('rcd', [-9, 2], [-6, 2], { I: 0.03, c: [-9, -2], d: [-6, -2] }),
    el('fuse', [-6, 2], [-2, 2], { I: 10 }), el('wire', [-2, 2], [2, 2]), el('wire', [2, 2], [6, 2]), el('wire', [6, 2], [10, 2]),
    el('wire', [-6, -2], [-2, -2]), el('wire', [-2, -2], [2, -2]), el('wire', [2, -2], [6, -2]), el('wire', [6, -2], [10, -2]),
    el('switch', [-2, 2], [-2, 0]), el('lamp', [-2, 0], [-2, -2], { U: 220, P: 40 }),
    el('switch', [2, 2], [2, 0]), el('lamp', [2, 0], [2, -2], { U: 220, P: 60 }),
    el('switch', [6, 2], [6, 0], { closed: false }), el('resistor', [6, 0], [6, -2], { R: 24.2, label: tl('电水壶') }),
    el('switch', [10, 2], [10, 0], { closed: false, label: tl('触电') }), el('resistor', [10, 0], [12, 0], { R: 2000, label: tl('人体') }), el('ground', [12, 0], [12, 0])
  ] },
  // ---- meters and sensors ----
  ammeterConv: { label: tl('电流计改装成电流表'), group: 'meter', build: () => [
    el('battery', [-5, 2], [-5, -2], { E: 3, r: 0.5 }), el('rheostat', [-5, 2], [-1, 2], { R: 50, pos: 0.2 }),
    el('galvanometer', [-1, 2], [3, 2], { r: 100, I: 1e-3 }), el('resistor', [-1, 4], [3, 4], { R: 0.1001, label: tl('分流电阻') }), el('wire', [-1, 2], [-1, 4]), el('wire', [3, 2], [3, 4]),
    el('ammeter', [3, 2], [3, -2]), el('wire', [3, -2], [-5, -2])
  ] },
  voltmeterConv: { label: tl('电流计改装成电压表'), group: 'meter', build: () => [
    el('battery', [-6, 2], [-6, -2], { E: 3 }), el('rheostat', [-6, 2], [-3, 2], { R: 50, pos: 0.4 }), el('wire', [-3, 2], [0, 2]),
    el('resistor', [0, 2], [0, -2], { R: 100 }), el('wire', [0, -2], [-3, -2]), el('wire', [-3, -2], [-6, -2]),
    el('galvanometer', [0, 2], [3, 2], { r: 100, I: 1e-3 }), el('resistor', [3, 2], [3, -2], { R: 2900, label: tl('分压电阻') }), el('wire', [3, -2], [0, -2]),
    el('voltmeter', [-3, 2], [-3, -2])
  ] },
  ohmmeter: { label: tl('欧姆表'), group: 'meter', build: () => [
    el('battery', [-4, 2], [-4, -2], { E: 1.5, r: 1 }), el('galvanometer', [-4, 2], [0, 2], { r: 100, I: 1e-3 }), el('rheostat', [0, 2], [3, 2], { R: 2000, pos: 0.6995 }),
    el('wire', [-4, -2], [0, -2]), el('resistor', [3, 2], [3, -2], { R: 1500, label: tl('待测电阻') }), el('switch', [3, -2], [0, -2], { label: tl('表笔') })
  ] },
  thermistor: { label: tl('热敏电阻'), group: 'meter', build: () => [
    el('battery', [-4, 2], [-4, -2], { E: 6 }), el('resistor', [-4, 2], [0, 2], { R: 10e3 }), el('thermistor', [0, 2], [0, -2], { R: 10e3, beta: 3950, T: 25 }), el('wire', [0, -2], [-4, -2]),
    el('voltmeter', [2, 2], [2, -2]), el('wire', [0, 2], [2, 2]), el('wire', [0, -2], [2, -2])
  ] },
  ldr: { label: tl('光敏电阻'), group: 'meter', build: () => [
    el('battery', [-4, 2], [-4, -2], { E: 6 }), el('ldr', [-4, 2], [0, 2], { R: 2000, gamma: 0.7, lux: 10 }), el('lamp', [0, 2], [0, -2], { U: 6, P: 0.3 }), el('ammeter', [0, -2], [-4, -2])
  ] },
  fsr: { label: tl('压敏电阻（电子秤）'), group: 'meter', build: () => [
    el('battery', [-4, 2], [-4, -2], { E: 3 }), el('fsr', [-4, 2], [0, 2], { R: 100e3, F0: 1, F: 2 }), el('resistor', [0, 2], [0, -2], { R: 10e3 }), el('wire', [0, -2], [-4, -2]),
    el('voltmeter', [2, 2], [2, -2]), el('wire', [0, 2], [2, 2]), el('wire', [0, -2], [2, -2])
  ] }
}

/** Elements with ids and names (E1, R1 …). */
export function named(list: Raw[]): El[] {
  const count: Record<string, number> = {}
  return list.map((e, i) => {
    const pre = KIND_INFO[e.kind].prefix
    const n = pre ? (count[pre] = (count[pre] ?? 0) + 1) : 0
    return { ...e, id: `e${i + 1}`, name: pre ? `${pre}${n}` : '' }
  })
}
