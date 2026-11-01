/**
 * Provenance of the variables of a formula card (26.57, D111; FOR03 of the 26.56 matrix). The Rust core sends a
 * `src` field with every variable of a sample; the interface only names it. Translations never decide where a value
 * comes from (manual §1.3 item 3, §10.4).
 */
import type { VarSource } from './recognize'

/** Short tag shown next to a known value (Chinese source text; tl() translates it). */
export const VAR_SOURCE_TEXT: Record<VarSource, string> = {
  given: '给定',
  constant: '常数',
  phase: '初态',
  time: '时刻',
  sim: '仿真',
  derived: '派生'
}

/** What the tag means (tooltip and the detail table). */
export const VAR_SOURCE_TIP: Record<VarSource, string> = {
  given: '场景中的已知量（质量、角度、摩擦因数、场强、g 等）',
  constant: '物理常量（引力常量、静电力常量等）',
  phase: '本阶段开始时（或事件前）的状态，取自仿真记录',
  time: '求值的时刻或本阶段经过的时间',
  sim: '此刻仿真记录中的值：用它算出的理论值只检验同一次运行的内部一致性',
  derived: '由上面的量在计算核心中算出（理论加速度、数值积分等）'
}

/** Detail table texts in the three languages (formula/detail.ts builds its pages without the interface locale). */
export const VAR_SOURCE_TRI: Record<VarSource, { zh: string; en: string; de: string }> = {
  given: { zh: '给定', en: 'given', de: 'gegeben' },
  constant: { zh: '常数', en: 'constant', de: 'Konstante' },
  phase: { zh: '初态（仿真记录）', en: 'start of phase (recording)', de: 'Abschnittsbeginn (Aufzeichnung)' },
  time: { zh: '时刻', en: 'time', de: 'Zeitpunkt' },
  sim: { zh: '仿真（同源）', en: 'simulation (same run)', de: 'Simulation (gleicher Lauf)' },
  derived: { zh: '派生', en: 'derived', de: 'abgeleitet' }
}

/** Values that come from the recording (the start of the phase or the sample time). */
export function fromRecording(src: VarSource | undefined): boolean { return src === 'phase' || src === 'sim' }
