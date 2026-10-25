/**
 * Texts of the core messages (warnings and errors of both engines, keys of engine/MESSAGES.md) in the three
 * languages. Numbers keep the formatting of 26.49 (e.g. times to 6 decimals where an instant matters).
 */
import type { Lang } from './tri'
import type { Message, MsgParam } from './message'
import { isMessage } from './message'

type P = Record<string, MsgParam>
type Render = (p: P, lang: Lang) => string

const num = (v: MsgParam | undefined): number => (typeof v === 'number' ? v : Number(v))
const str = (v: MsgParam | undefined): string => (Array.isArray(v) ? v.join(', ') : isMessage(v) ? '' : String(v ?? ''))
const fixed = (v: MsgParam | undefined, d: number) => num(v).toFixed(d)
const list = (v: MsgParam | undefined, lang: Lang) => (Array.isArray(v) ? v.join(lang === 'zh' ? '、' : ', ') : str(v))

/** zh, en, de renderers of every core key. */
const TEXT: Record<string, [Render, Render, Render]> = {
  'warn.initialOverlapRemoved': [
    p => `初始重叠 ${num(p.mm).toPrecision(3)} mm 已移除（物体被推到刚好接触）`,
    p => `Initial overlap of ${num(p.mm).toPrecision(3)} mm removed (bodies pushed apart to just touching)`,
    p => `Anfängliche Überlappung von ${num(p.mm).toPrecision(3)} mm entfernt (Körper auf genaue Berührung verschoben)`
  ],
  'warn.initialDeepOverlap': [
    (p, l) => `初始时 ${list(p.pairs, l)} 深度重叠（超过 5 cm），这些物体之间的接触不会被正确处理，请调整位置`,
    (p, l) => `At the start ${list(p.pairs, l)} overlap deeply (more than 5 cm); contact between these bodies will not be handled correctly — please adjust their positions`,
    (p, l) => `Zu Beginn überlappen ${list(p.pairs, l)} stark (mehr als 5 cm); der Kontakt dieser Körper wird nicht korrekt behandelt — bitte Positionen anpassen`
  ],
  'warn.reducedAccuracy': [
    (p, l) => `自 t = ${fixed(p.t, 6)} s 起改用 Moreau–Jean 时间步进（${sub(p.reason, l)}）：精度降级——事件时刻不再精确定位，接触力读数为近似值，碰撞、摩擦与数值误差损失的能量合计记为“碰撞损失”，公式对照不再给出`,
    (p, l) => `From t = ${fixed(p.t, 6)} s on, Moreau–Jean time stepping is used (${sub(p.reason, l)}): reduced accuracy — event times are no longer located exactly, contact forces are approximate, energy lost in impacts, friction and numerical error is booked together as "impact loss", and no formula comparison is given`,
    (p, l) => `Ab t = ${fixed(p.t, 6)} s wird mit Moreau–Jean-Zeitschritten gerechnet (${sub(p.reason, l)}): verringerte Genauigkeit — Ereigniszeitpunkte werden nicht mehr exakt bestimmt, Kontaktkräfte sind Näherungen, die bei Stößen, Reibung und durch numerische Fehler verlorene Energie wird zusammen als „Stoßverlust“ verbucht, und es gibt keinen Formelvergleich`
  ],
  'reason.moreauSelected': [
    () => '已选择 Moreau–Jean 时间步进',
    () => 'Moreau–Jean time stepping selected',
    () => 'Moreau–Jean-Zeitschritte gewählt'
  ],
  'reason.eventsAtInstant': [
    p => `t = ${fixed(p.t, 9)} s 处同一时刻发生 ${num(p.count)} 次状态切换`,
    p => `${num(p.count)} state changes at the same instant t = ${fixed(p.t, 9)} s`,
    p => `${num(p.count)} Zustandswechsel im selben Zeitpunkt t = ${fixed(p.t, 9)} s`
  ],
  'reason.eventStorm': [
    p => `碰撞与接触切换过于密集（${num(p.count)} 次 / ${num(p.window)} s）`,
    p => `impacts and contact changes too dense (${num(p.count)} in ${num(p.window)} s)`,
    p => `Stöße und Kontaktwechsel zu dicht (${num(p.count)} in ${num(p.window)} s)`
  ],
  'warn.ambiguousMode': [
    p => `t 时刻接触状态无完全一致解（违背量 ${num(p.violation).toExponential(2)}），已取最接近的一种`,
    p => `No fully consistent contact state at t (violation ${num(p.violation).toExponential(2)}); the closest one was taken`,
    p => `Kein vollständig konsistenter Kontaktzustand zum Zeitpunkt t (Verletzung ${num(p.violation).toExponential(2)}); der nächstliegende wurde gewählt`
  ],
  'warn.multiImpactFriction': [
    () => '多个接触点同时碰撞时没有找到满足库仑摩擦且不增能的冲量组合（或接触点超过 8 个），本次碰撞冲量未计摩擦；之后的滑动摩擦照常计算',
    () => 'For an impact at several contact points at once, no combination of impulses obeyed Coulomb friction without adding energy (or there were more than 8 points), so this impact ignores friction; sliding friction afterwards is computed as usual',
    () => 'Für einen Stoß an mehreren Kontaktpunkten zugleich erfüllte keine Kombination von Kraftstößen die Coulomb-Reibung ohne Energiezuwachs (oder es waren mehr als 8 Punkte), daher ohne Reibung berechnet; die Gleitreibung danach wird normal berechnet'
  ],
  'warn.multiImpactPlastic': [
    () => '多个接触点同时碰撞时，按牛顿恢复定律逐点反弹会使动能增加，这类碰撞已按完全非弹性（e = 0）处理',
    () => 'When several contact points collide at once and bouncing each by Newton\'s restitution law would add kinetic energy, the impact is treated as perfectly inelastic (e = 0)',
    () => 'Stoßen mehrere Kontaktpunkte gleichzeitig und würde das Zurückprallen nach Newtons Stoßgesetz an jedem Punkt kinetische Energie erzeugen, wird der Stoß als vollständig unelastisch (e = 0) behandelt'
  ],
  'warn.polygonCentred': [
    p => `${str(p.body)}：多边形顶点按质心为原点处理`,
    p => `${str(p.body)}: polygon points are taken relative to its centre of mass`,
    p => `${str(p.body)}: Polygonpunkte werden relativ zum Schwerpunkt genommen`
  ],
  'warn.muSBelowMuK': [
    p => `${str(p.body)}：静摩擦因数小于动摩擦因数（μs < μk）`,
    p => `${str(p.body)}: coefficient of static friction below kinetic (μs < μk)`,
    p => `${str(p.body)}: Haftreibungszahl kleiner als Gleitreibungszahl (μH < μG)`
  ],
  'err.forceNotFinite': [
    p => `${str(p.force)}：变力表达式在 t = ${num(p.t).toPrecision(6)} s 时没有有限值（Fx = ${num(p.fx)}，Fy = ${num(p.fy)}），仿真停止`,
    p => `${str(p.force)}: the force expression has no finite value at t = ${num(p.t).toPrecision(6)} s (Fx = ${num(p.fx)}, Fy = ${num(p.fy)}); simulation stopped`,
    p => `${str(p.force)}: Der Kraftausdruck hat bei t = ${num(p.t).toPrecision(6)} s keinen endlichen Wert (Fx = ${num(p.fx)}, Fy = ${num(p.fy)}); Simulation angehalten`
  ],
  'err.stepTooSmall': [
    p => `步长过小（t = ${fixed(p.t, 6)} s），仿真停止`,
    p => `Step size too small (t = ${fixed(p.t, 6)} s); simulation stopped`,
    p => `Schrittweite zu klein (t = ${fixed(p.t, 6)} s); Simulation angehalten`
  ],
  'err.switchChatter': [
    p => `${str(p.force)}：变力表达式在 t = ${fixed(p.t, 9)} s 附近反复切换（例如 sign(vx) 在 vx = 0 处），无法确定方向，仿真停止。模拟摩擦请使用接触面的摩擦因数`,
    p => `${str(p.force)}: the force expression keeps switching near t = ${fixed(p.t, 9)} s (e.g. sign(vx) at vx = 0), so its direction cannot be decided; simulation stopped. Use the contact's friction coefficient to model friction`,
    p => `${str(p.force)}: Der Kraftausdruck wechselt bei t = ${fixed(p.t, 9)} s ständig (z. B. sign(vx) bei vx = 0), die Richtung ist nicht bestimmbar; Simulation angehalten. Reibung bitte über die Reibungszahl der Kontaktfläche modellieren`
  ],
  'err.eventChatter': [
    p => `t = ${fixed(p.t, 9)} s 处事件抖振（同一时刻 ${num(p.count)} 次状态切换），仿真停止`,
    p => `Event chatter at t = ${fixed(p.t, 9)} s (${num(p.count)} state changes at the same instant); simulation stopped`,
    p => `Ereignisflattern bei t = ${fixed(p.t, 9)} s (${num(p.count)} Zustandswechsel im selben Zeitpunkt); Simulation angehalten`
  ],
  'err.stepLimit': [
    () => '步数超过上限，仿真停止',
    () => 'Step limit exceeded; simulation stopped',
    () => 'Schrittzahl überschritten; Simulation angehalten'
  ],
  'err.chunkStepLimit': [
    p => `t = ${fixed(p.t, 4)} s 附近 1 个计算块内积分步数超过 ${num(p.limit)}，仿真停止`,
    p => `More than ${num(p.limit)} integration steps within one chunk near t = ${fixed(p.t, 4)} s; simulation stopped`,
    p => `Mehr als ${num(p.limit)} Integrationsschritte in einem Rechenblock bei t = ${fixed(p.t, 4)} s; Simulation angehalten`
  ],
  'err.budget': [
    p => `计算时间超过 ${num(p.seconds)} s，已计算到 t = ${fixed(p.t, 4)} s（可缩短仿真时长或放宽容差）`,
    p => `Computing time exceeded ${num(p.seconds)} s; computed up to t = ${fixed(p.t, 4)} s (shorten the duration or relax the tolerances)`,
    p => `Rechenzeit über ${num(p.seconds)} s; berechnet bis t = ${fixed(p.t, 4)} s (Dauer verkürzen oder Toleranzen lockern)`
  ],
  'err.cancelled': [() => '已取消', () => 'Cancelled', () => 'Abgebrochen'],
  'err.internal': [
    p => `求解器内部错误：${str(p.message)}`,
    p => `Internal solver error: ${str(p.message)}`,
    p => `Interner Fehler des Lösers: ${str(p.message)}`
  ],
  'engine.wasmUnavailable': [
    p => `Rust/WASM 引擎不可用，已改用 TypeScript 引擎（${str(p.detail)}）`,
    p => `Rust/WASM engine unavailable; using the TypeScript engine (${str(p.detail)})`,
    p => `Rust/WASM-Engine nicht verfügbar; die TypeScript-Engine wird verwendet (${str(p.detail)})`
  ]
}

const IDX: Record<Lang, 0 | 1 | 2> = { zh: 0, en: 1, de: 2 }

function sub(v: MsgParam | undefined, lang: Lang): string {
  return isMessage(v) ? renderMessage(v, lang) : str(v)
}

/** Text of a core message in `lang`; unknown keys show the key and parameters. */
export function renderMessage(m: Message, lang: Lang): string {
  const r = TEXT[m.key]
  if (!r) return `${m.key} ${JSON.stringify(m.params)}`
  return r[IDX[lang]](m.params, lang)
}

/** Every core key (tests). */
export function coreKeys(): string[] {
  return Object.keys(TEXT)
}
