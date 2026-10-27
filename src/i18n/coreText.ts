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
  'warn.compoundCentred': [
    p => `${str(p.body)}：复合体各部分的位置已改为相对于整体质心`,
    p => `${str(p.body)}: the parts of the compound body are taken relative to its centre of mass`,
    p => `${str(p.body)}: Die Teile des zusammengesetzten Körpers werden auf seinen Schwerpunkt bezogen`
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
  'err.stateNotFinite': [
    p => `t = ${fixed(p.t, 6)} s 时运动状态不再是有限值（物体被加速到无穷远，例如斥力随距离增大的有心力），仿真停止`,
    p => `The state is no longer finite at t = ${fixed(p.t, 6)} s (a body is driven off to infinity, e.g. by a repulsive central force that grows with distance); simulation stopped`,
    p => `Bei t = ${fixed(p.t, 6)} s ist der Bewegungszustand nicht mehr endlich (ein Körper wird ins Unendliche getrieben, z. B. durch eine abstoßende Zentralkraft, die mit dem Abstand wächst); Simulation angehalten`
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

/**
 * Translator of the interface tables (set by i18n/index.ts, which imports this module through locale.ts): the texts
 * of the expression messages and of the 26.53 calculation messages are interface texts (`tl` keys).
 */
type Translate = (lang: Lang, zh: string, params?: ReadonlyArray<unknown> | Record<string, unknown>) => string
let translate: Translate = (_l, zh, params) => zh.replace(/\{(\w+)\}/g, (m, k: string) => { const v = Array.isArray(params) ? params[Number(k)] : (params as Record<string, unknown> | undefined)?.[k]; return v === undefined ? m : String(v) })

/** Install the interface translator (i18n/index.ts). */
export function setTranslator(t: Translate) { translate = t }

const FORCE_VARIABLE_LIST = 't, x, y, vx, vy, v, theta, omega, m, g'

/**
 * Expression messages of the Rust parser and checks (engine/MESSAGES.md) as the texts of the 26.52 TypeScript parser
 * (formula/expr.ts, solver/forceExpr.ts), which are interface texts.
 */
function exprText(m: Message, lang: Lang): string | null {
  const p = m.params as Record<string, MsgParam>
  const t = (zh: string, params?: unknown[]) => translate(lang, zh, params)
  const dimName = (d: MsgParam | undefined) => (d === '' || d === undefined ? t('无量纲') : String(d))
  switch (m.key) {
    case 'expr.empty': return t('表达式为空')
    case 'expr.emptyComponent': return t('表达式为空')
    case 'expr.expected': return t('应为 “{0}”（位置 {1}）：{2}', [p.ch, p.pos, p.src])
    case 'expr.badNumber': return t('数字格式错误（位置 {0}）：{1}', [p.pos, p.src])
    case 'expr.unknownFunction': return t('未知函数 {0}', [p.name])
    case 'expr.arity': return t('{0} 需要 {1} 个参数，实为 {2} 个', [p.name, p.arity, p.count])
    case 'expr.functionNeedsParens': return t('函数 {0} 后面应有括号，如 {1}(t)', [p.name, p.name])
    case 'expr.comparisonOnlyInIf': return t('比较运算只能用作 if(条件, 值1, 值2) 的条件（位置 {0}）', [p.pos])
    case 'expr.incomplete': return t('表达式不完整：{0}', [p.src])
    case 'expr.badChar': return t('无法识别的字符 “{0}”（位置 {1}）：{2}', [p.ch, p.pos, p.src])
    case 'expr.unbalanced': return t('括号不匹配（位置 {0}）：{1}', [p.pos, p.src])
    case 'expr.trailing': return t('多余字符 “{0}”（位置 {1}）：{2}', [p.ch, p.pos, p.src])
    case 'expr.ifNeedsComparison': return t('if 的第一个参数应为比较式，例如 if(t < 1, 10, 0)')
    case 'expr.unsetVariable': return t('变量 {0} 没有取值', [p.name])
    case 'expr.unknownVariable': return t('未知变量 {0}。可用变量：{1}；常数 pi、e', [p.name, FORCE_VARIABLE_LIST])
    case 'expr.functionNotAllowed': return t('变力表达式中不能使用函数 {0}', [p.name])
    case 'expr.notForce': return t('表达式的量纲是 {0}，应为力（N）。数字可作为带单位的系数，例如 2*vx 表示 (2 N·s/m)·vx', [dimName(p.dim)])
    case 'expr.dimensionedPower': return t('有量纲的量（{0}）只能取数字次幂', [dimName(p.dim)])
    case 'expr.argumentNotDimensionless': {
      const fn = p.function === '^' ? t('指数') : String(p.function)
      return t('{0}( ) 的参数必须无量纲，实为 {1}（可写成系数乘变量，如 {2}(2*t)）', [fn, dimName(p.dim), fn])
    }
    case 'expr.dimMismatch': {
      const w = String(p.what)
      const what = w === '+' ? t('加法') : w === '-' ? t('减法') : w === 'if' ? t('if 的两个取值') : w === 'atan2' ? t('atan2 的参数')
        : w === 'min' || w === 'max' || w === 'clamp' ? t('{0} 的参数', [w]) : t('比较 {0} ', [w])
      return t('{0}两边量纲不同：{1} 与 {2}', [what, dimName(p.a), dimName(p.b)])
    }
  }
  return null
}

/**
 * Scene errors of the core (engine/MESSAGES.md `scene.*`, `abi.*`) as the texts of the scene check in
 * core/scene/io.ts, which are interface texts (26.53: the core reports them when the run starts).
 */
function sceneText(m: Message, lang: Lang): string | null {
  const p = m.params as Record<string, MsgParam>
  const t = (zh: string, params?: unknown[]) => translate(lang, zh, params)
  const c = str(p.connector), b = str(p.body)
  switch (m.key) {
    case 'scene.invalidJson': return t('不是有效的 JSON：{0}', [str(p.detail)])
    case 'scene.notScene': return t('文件内容不是场景')
    case 'scene.wrongFormat': return t('不是 VeloPhi 场景文件（format 字段不符）')
    case 'scene.newerVersion': return t('场景文件版本 {0} 比本程序新，请升级 VeloPhi', [num(p.version)])
    case 'scene.cannotMigrate': return t('无法从格式 {0} 升级', [num(p.version)])
    case 'scene.notList': return t('{0} 应为列表', [str(p.path)])
    case 'scene.duplicateBodyId': return t('物体 id 重复：{0}', [str(p.id)])
    case 'scene.massNotPositive': return t('{0}：质量必须大于 0', [b])
    case 'scene.sizeNotPositive': return t('{0}：宽高必须大于 0', [b])
    case 'scene.radiusNotPositive': return t('{0}：半径必须大于 0', [b])
    case 'scene.polygonTooFew': return t('{0}：多边形至少需要 3 个顶点', [b])
    case 'scene.polygonNotSimple': return t('{0}：多边形的边不能相交，面积不能为零', [b])
    case 'scene.compoundEmpty': return t('{0}：复合体至少需要一个部分', [b])
    case 'scene.compoundPartInvalid': return t('{0}：复合体的部分无效（半径、宽高须大于 0，多边形须为简单多边形）', [b])
    case 'scene.materialRange': return t('{0}：摩擦因数应 ≥ 0，恢复系数应在 0…1', [b])
    case 'scene.dragNegative': return t('{0}：阻力系数应 ≥ 0', [b])
    case 'scene.rollingRange': return t('{0}：滚动阻力系数应在 0…1', [b])
    case 'scene.stiffnessNotPositive': return t('{0}：劲度系数必须大于 0', [c])
    case 'scene.cubicNotFinite': return t('{0}：三次项系数应为有限数', [c])
    case 'scene.damperNegative': return t('{0}：阻尼系数应 ≥ 0', [c])
    case 'scene.sliderAxisZero': return t('{0}：滑轨方向不能为零向量', [c])
    case 'scene.sliderLimits': return t('{0}：滑轨限位应满足 下限 < 上限', [c])
    case 'scene.sliderLimitRestitution': return t('{0}：限位的恢复系数应在 0…1', [c])
    case 'scene.gearInvalid': return t('{0}：齿轮需要连接物体，传动比不能为 0', [c])
    case 'scene.motorMaxTorque': return t('{0}：马达的力矩上限应大于 0', [c])
    case 'scene.centralInvalid': return t('{0}：有心力的强度应为有限数，指数应在 −4…4', [c])
    case 'scene.centralTargetMissing': return t('{0}：作用对象 {1} 不存在', [c, b])
    case 'scene.connectorBodyMissing': return t('{0}：连接的物体 {1} 不存在', [c, b])
    case 'scene.pulleyBodyMissing': return t('{0}：所在的物体 {1} 不存在', [str(p.pulley), b])
    case 'scene.ropePulleyMissing': return t('{0}：滑轮 {1} 不存在', [c, str(p.pulley)])
    case 'scene.ropeSamePulleyTwice': return t('{0}：连续两次绕过同一个滑轮', [c])
    case 'scene.ropeEndOnPulleyBody': return t('{0}：绳端固定在{1}上，不能直接绕过同一物体上的{2}（请把绳端系在别处，或去掉该滑轮）', [c, b, str(p.pulley)])
    case 'scene.variableForceNeedsBody': return t('{0}：变力必须作用在物体上', [c])
    case 'scene.forceExprInvalid': {
      const reason = isMessage(p.reason) ? renderMessage(p.reason, lang) : str(p.reason)
      return t('{0}：F{1} 表达式有误：{2}', [c, str(p.component), reason])
    }
    case 'scene.durationRange': return t('仿真时长应在 (0, {0}] s，或不限时长', [num(p.max)])
    case 'scene.legacyDurationRange': return t('有限计算时长应在 (0, {0}] s', [num(p.max)])
    case 'scene.stopAtUnknown': return t('停止条件的事件类型未知')
    case 'scene.stopAtDelayRange': return t('停止条件的延时应在 [0, {0}] s', [num(p.max)])
    case 'scene.outputStepRange': return t('时间步长应在 (0, 0.1] s')
    case 'scene.tolerancesNotPositive': return t('容差必须大于 0')
    case 'scene.gravitationNotPositive': return t('引力常量 G 必须大于 0')
    case 'abi.noScene': return t('计算请求中没有场景')
    case 'abi.badOption': return t('计算请求的选项 {0} 无效', [str(p.option)])
  }
  return null
}

/** Text combinators of the Rust calculation layer: `$join` (positional items, `sep`) and `$paren`. */
function combined(m: Message, lang: Lang): string {
  const items: string[] = []
  for (let i = 0; ; i++) {
    const v = (m.params as Record<string, MsgParam>)[String(i)]
    if (v === undefined) break
    items.push(isMessage(v) ? renderMessage(v, lang) : Array.isArray(v) ? v.join(lang === 'zh' ? '、' : ', ') : String(v))
  }
  if (m.key === '$paren') return lang === 'zh' ? `（${items[0] ?? ''}）` : ` (${items[0] ?? ''})`
  const zh = lang === 'zh'
  const sep = ({ semi: zh ? '；' : '; ', list: zh ? '、' : ', ', comma: zh ? '，' : ', ', colon: zh ? '：' : ': ', none: '' } as Record<string, string>)[String((m.params as Record<string, MsgParam>).sep)] ?? ''
  return items.join(sep)
}

/** A key that is the Chinese source text itself (26.53 calculation messages, `tx` in Rust). */
const SOURCE_KEY = /[^\x00-\x7f]/

/**
 * Text of a core message in `lang`: the warnings and errors of the engines, the expression messages and the texts of
 * the Rust calculation layer (keys that are Chinese source texts, positional parameters "0", "1", …; nested messages
 * are rendered too). Unknown keys show the key and parameters.
 */
export function renderMessage(m: Message, lang: Lang): string {
  if (m.key === '$join' || m.key === '$paren') return combined(m, lang)
  const r = TEXT[m.key]
  if (r) return r[IDX[lang]](m.params, lang)
  const e = exprText(m, lang) ?? sceneText(m, lang)
  if (e !== null) return e
  if (SOURCE_KEY.test(m.key) || m.key.includes('{')) {
    const params: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(m.params ?? {})) params[k] = isMessage(v) ? renderMessage(v, lang) : Array.isArray(v) ? v.join(lang === 'zh' ? '、' : ', ') : v
    return translate(lang, m.key, params)
  }
  // A text handed over as is (e.g. the causes of the formula library, already in the interface language)
  if (!m.params || Object.keys(m.params).length === 0) return translate(lang, m.key, {})
  return `${m.key} ${JSON.stringify(m.params)}`
}

/** Every core key (tests). */
export function coreKeys(): string[] {
  return Object.keys(TEXT)
}
