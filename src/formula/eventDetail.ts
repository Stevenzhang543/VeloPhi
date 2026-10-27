/**
 * Event detail view (manual 26.50, D28; 26.53: the numbers come from the Rust session, D65): for one recorded event,
 * the event function g(t) that triggered it and what it means, how the solver located the event and how accurately,
 * what changed and by which physical law, the state of the bodies involved before and after, and for impacts the
 * restitution law and the impulse with the recorded numbers substituted (with friction: the phases of Stronge's
 * impulse path).
 *
 * The numbers — the event functions at the event, the effective inverse mass matrix, Stronge's phases, the velocity
 * changes, momenta, states, accelerations and energies — are computed by the Rust session (`eventData`,
 * engine/velophi-core/src/formula/event_detail.rs) from the recording and the solver's own functions; this module
 * writes the texts (trilingual templates `TRIGGER_TEXT`, `CHANGE_TEXT`, written inline as the derivations are) and the
 * equations.
 */
import { renderMessage } from '../i18n/coreText'
import type { Message } from '../i18n/message'
import type { Lang, Tri } from '../i18n/tri'
import { fillParams, triText } from '../i18n/tri'
import type { UnitChoice } from '../units/units'
import { defaultChoice, displayLabel, formatQuantity, formatSig, latexNumber, latexQuantity, toDisplay } from '../units/units'
import type { DetailOptions } from './detail'
import type { Recording } from '../engine/recording'
import type { DetailBlock, DetailCell, DetailSection, DetailView, Tone } from './detailTypes'

/** Kind of event function (engine EventType). */
export type EventType = 'contact' | 'liftoff' | 'leave' | 'slip' | 'stop' | 'slack' | 'taut' | 'switch' | 'pulley' | 'limit' | 'unlimit' | 'mslip' | 'mlock' | 'rollStart' | 'rollStop' | 'zone'

/** Kind of a state change reported at an event (engine ChangeType). */
export type ChangeType =
  | 'impact' | 'touch' | 'separate' | 'stick' | 'slip' | 'reverse' | 'leave' | 'slack' | 'taut' | 'switch' | 'timestep' | 'pulley'
  | 'limit' | 'unlimit' | 'motorSlip' | 'motorLock' | 'rollStop' | 'rollStart' | 'zoneEnter' | 'zoneLeave'

/** One change at an event (engine ChangeDetail). */
export interface ChangeDetail {
  type: ChangeType
  subject: string
  bodies: string[]
  impulse?: number
  vnBefore?: number
  vnAfter?: number
  restitution?: number
  point?: { x: number; y: number }
  normal?: { x: number; y: number }
  tangentImpulse?: number
  vtBefore?: number
  vtAfter?: number
  switchIndex?: number
  branch?: number
  kink?: boolean
}

/** A term of W_nn: a free body (1/m and (r × n)²/I) or a body on one fixed hinge ((r_O × n)²/I_O). */
export type WTerm = { label: 'A' | 'B'; kind: 'free'; mass: number; inertia: number; w: number; rotates: boolean } | { label: 'A' | 'B'; kind: 'hinge'; arm: number; IO: number }

/** Numbers of one impact point. */
export interface EventImpactPoint {
  /** Index of the change of the point in `changes` (−1: none; the point is not shown). */
  change: number
  kind: 'contact' | 'rope' | 'limit'
  vnBefore: number
  vnAfter: number
  impulse: number
  restitution: number
  nx: number
  ny: number
  cx: number
  cy: number
  tangentImpulse?: number
  vtBefore?: number
  vtAfter?: number
  friction?: 'slip' | 'stick' | 'reverse'
  ropeName?: string
  nameA?: string
  nameB?: string
  muK?: number
  muS?: number
  /** Single point: effective inverse mass (rope: a number; contact: the matrix of the normal and tangent rows). */
  W?: number | number[][]
  constrained?: boolean
  hinged?: { terms: WTerm[]; value: number } | null
  wTerms?: Array<{ label: 'A' | 'B'; mass: number; inertia: number; w: number; rotates: boolean }>
  stronge?: { phases: Array<{ compression: boolean; s: number; dPn: number; Pn: number; Pt: number; vn: number; vt: number }>; Pn: number; Pt: number; workC: number; end: 'slip' | 'stick' | 'reverse' } | null
  dv?: Array<{ label: 'A' | 'B'; sign: number; mass: number; vx: number; vy: number; dw: number | null }>
  momentum?: { p0: [number, number]; p1: [number, number] }
}

/** The numbers of the detail view of one event (the Rust session's `eventData`). */
export interface EventData {
  index: number
  t: number
  triggers: EventType[]
  changes: ChangeDetail[]
  segment: number
  hasPrev: boolean
  prevReduced: boolean
  reduced: boolean
  dt: number
  /** Display names of the ids the changes refer to. */
  names: Record<string, string>
  switches: Array<{ change: number; force: string; kind: string; expr: string }>
  fired: Array<{ type: EventType; who: string; value: number; threshold: number; leaveNotPf: boolean }> | null
  impact: { single: boolean; points: EventImpactPoint[]; warning: Message | null; energyBefore: number; energyAfter: number; loss: number } | null
  state: {
    bodies: Array<{ index: number; name: string; rotates: boolean; before: number[]; after: number[]; speedBefore: number; speedAfter: number; accBefore: number[] | null; accAfter: number[] | null; ekBefore: number; ekAfter: number }>
    before: { kinetic: number; gravity: number; spring: number; total: number }
    after: { kinetic: number; gravity: number; spring: number; total: number }
  }
}

const T = (zh: string, en: string, de: string): Tri => ({ zh, en, de })

/** Template of an event function type: name, g(t) in KaTeX, meaning, unit of g. */
export interface TriggerTemplate { name: Tri; g: string; meaning: Tri; unit: string }

/** Event function types (core/solver/events.ts): what g(t) is and when it fires. */
export const TRIGGER_TEXT: Record<EventType, TriggerTemplate> = {
  contact: {
    name: T('接触检测', 'Contact', 'Berührung'),
    g: 'g(t) = d(t)',
    meaning: T(
      'g 为一个顶点（或圆形物体）到另一物体表面的有向距离：两物体分开时 g > 0；g 减小到 0，两物体恰好接触。',
      'g is the signed distance from a vertex (or a round body) to the surface of the other body: g > 0 while they are apart; when g falls to 0 the bodies just touch.',
      'g ist der vorzeichenbehaftete Abstand einer Ecke (oder eines runden Körpers) von der Oberfläche des anderen Körpers: Solange sie getrennt sind, ist g > 0; fällt g auf 0, berühren sich die Körper gerade.'
    ),
    unit: 'm'
  },
  liftoff: {
    name: T('脱离检测', 'Lift-off', 'Abheben'),
    g: 'g(t) = N(t)',
    meaning: T(
      'g 为接触点的支持力（法向力）N。接触面只能“推”不能“拉”，接触时 N ≥ 0；当维持接触所需的 N 减小到 0（再往后就要变成拉力），接触点脱离。',
      'g is the normal force N at the contact point. A surface can push but not pull, so N ≥ 0 while in contact; when the N needed to keep contact falls to 0 (beyond that it would have to pull), the point lifts off.',
      'g ist die Normalkraft $F_\\mathrm{N}$ im Kontaktpunkt. Eine Unterlage kann drücken, aber nicht ziehen, also gilt bei Kontakt $F_\\mathrm{N} \\ge 0$; sinkt die zum Kontakt nötige Normalkraft auf 0 (danach müsste sie ziehen), hebt der Punkt ab.'
    ),
    unit: 'N'
  },
  leave: {
    name: T('滑离表面检测', 'Leaving a face', 'Verlassen einer Fläche'),
    g: 'g(t) = s_{\\mathrm{edge}}(t)',
    meaning: T(
      'g 为接触点到所在表面端点的距离（接触点在表面范围内时 g ≥ 0）。g 减小到 0，接触点滑到表面的边缘，离开该表面。',
      'g is the distance of the contact point from the end of its face (g ≥ 0 while the point is on the face). When g falls to 0 the point reaches the edge and leaves the face.',
      'g ist der Abstand des Kontaktpunkts vom Ende seiner Fläche (g ≥ 0, solange der Punkt auf der Fläche liegt). Fällt g auf 0, erreicht der Punkt die Kante und verlässt die Fläche.'
    ),
    unit: 'm'
  },
  slip: {
    name: T('开始滑动检测', 'Onset of slipping', 'Beginn des Gleitens'),
    g: 'g(t) = \\mu_s N - |f|',
    meaning: T(
      'g 为最大静摩擦力 μₛN 与维持相对静止所需的静摩擦力 |f| 之差。g ≥ 0 时静摩擦足以维持相对静止；g 减小到 0，所需静摩擦力达到最大静摩擦力，开始相对滑动。',
      'g is the maximum static friction μₛN minus the static friction |f| needed to keep the surfaces at rest relative to each other. While g ≥ 0 static friction suffices; when g falls to 0 the needed friction reaches its maximum and the surfaces start to slide.',
      'g ist die maximale Haftreibungskraft $\\mu_s F_\\mathrm{N}$ minus der zum Haften nötigen Reibungskraft $|F_\\mathrm{R}|$. Solange g ≥ 0 ist, reicht die Haftreibung; fällt g auf 0, erreicht die nötige Reibungskraft ihr Maximum, und die Flächen beginnen zu gleiten.'
    ),
    unit: 'N'
  },
  stop: {
    name: T('共速检测', 'Common velocity', 'Gemeinsame Geschwindigkeit'),
    g: 'g(t) = s\\,(v_1 - v_2)',
    meaning: T(
      'g 为接触面两侧的相对滑动速度 v₁ − v₂（s 为滑动方向，使滑动时 g > 0）。g 减小到 0，两物体达到共同速度，即相对滑动停止的瞬间。之后若静摩擦足以维持，两物体相对静止；否则反向相对滑动。',
      'g is the relative sliding velocity v₁ − v₂ of the two surfaces (s is the sliding direction, so g > 0 while sliding). When g falls to 0 the bodies reach a common velocity: the instant the relative sliding stops. Afterwards they stick if static friction can hold them, otherwise they slide the other way.',
      'g ist die Relativgeschwindigkeit v₁ − v₂ der beiden Flächen (s ist die Gleitrichtung, sodass g > 0 beim Gleiten). Fällt g auf 0, haben die Körper eine gemeinsame Geschwindigkeit: In diesem Augenblick endet das Gleiten. Danach haften sie, wenn die Haftreibung ausreicht, sonst gleiten sie in die Gegenrichtung.'
    ),
    unit: 'm/s'
  },
  slack: {
    name: T('绳松弛检测', 'Rope going slack', 'Seil wird schlaff'),
    g: 'g(t) = F_\\mathrm{T}(t)',
    meaning: T(
      'g 为绳的拉力 $F_\\mathrm{T}$。绳只能拉不能推，绷紧时 $F_\\mathrm{T} \\ge 0$；拉力减小到 0，绳开始松弛，此后物体不再受绳的拉力。',
      'g is the rope tension $F_\\mathrm{T}$. A rope can pull but not push, so $F_\\mathrm{T} \\ge 0$ while it is taut; when the tension falls to 0 the rope goes slack and no longer pulls on the body.',
      'g ist die Seilkraft $F_\\mathrm{T}$. Ein Seil kann ziehen, aber nicht drücken, also gilt $F_\\mathrm{T} \\ge 0$, solange es gespannt ist; sinkt die Seilkraft auf 0, wird das Seil schlaff und zieht nicht mehr am Körper.'
    ),
    unit: 'N'
  },
  taut: {
    name: T('绳绷紧检测', 'Rope becoming taut', 'Seil wird gespannt'),
    g: 'g(t) = L - \\ell(t)',
    meaning: T(
      'g 为绳长 L 与两端之间沿绳路径的距离 ℓ 之差。绳松弛时 g > 0；g 减小到 0，绳被拉直（绷紧）。',
      'g is the rope length L minus the distance ℓ between its ends along the rope path. While the rope is slack g > 0; when g falls to 0 the rope is pulled straight (taut).',
      'g ist die Seillänge L minus dem Abstand ℓ der Enden entlang des Seilwegs. Solange das Seil schlaff ist, gilt g > 0; fällt g auf 0, ist das Seil gestreckt (gespannt).'
    ),
    unit: 'm'
  },
  switch: {
    name: T('变力切换检测', 'Switch of a variable force', 'Umschalten einer veränderlichen Kraft'),
    g: 'g(t) = b\\,u(t)',
    meaning: T(
      '变力表达式含分段函数（step、sign、if、abs、min、max）。u 为其切换自变量，b = ±1 为当前所在分支，使 g > 0。g 减小到 0，表达式进入另一分支：力发生跳变（step、sign、if）或出现折点（abs、min、max）。',
      'The force expression contains a piecewise function (step, sign, if, abs, min, max). u is its switching argument and b = ±1 the current branch, so g > 0. When g falls to 0 the expression enters the other branch: the force jumps (step, sign, if) or has a kink (abs, min, max).',
      'Der Kraftterm enthält eine abschnittsweise definierte Funktion (step, sign, if, abs, min, max). u ist ihr Umschaltargument und b = ±1 der aktuelle Zweig, sodass g > 0. Fällt g auf 0, wechselt der Term in den anderen Zweig: Die Kraft springt (step, sign, if) oder hat einen Knick (abs, min, max).'
    ),
    unit: ''
  },
  pulley: {
    name: T('到达滑轮检测', 'Reaching the pulley', 'Erreichen der Rolle'),
    g: 'g(t) = s(t) - s_\\mathrm{min}',
    meaning: T(
      'g 为物体与它所绕过的滑轮之间那段绳的长度 s，减去 1 mm。g 减小到 0，物体到达滑轮，计算停止。',
      'g is the length s of the rope between the body and the pulley it runs onto, minus 1 mm. When g falls to 0 the body has reached the pulley and the computation stops.',
      'g ist die Länge s des Seilstücks zwischen dem Körper und der Rolle, über die es läuft, minus 1 mm. Fällt g auf 0, hat der Körper die Rolle erreicht, und die Rechnung endet.'
    ),
    unit: 'm'
  },
  limit: {
    name: T('到达限位检测', 'Reaching an end stop', 'Erreichen eines Anschlags'),
    g: 'g(t) = s(t) - s_\\mathrm{min}\\ \\text{or}\\ s_\\mathrm{max} - s(t)',
    meaning: T(
      'g 为滑块沿滑轨到限位的距离（s 为沿滑轨方向的位移）。g 减小到 0，滑块到达限位；若此时仍有速度，按限位的恢复系数发生碰撞。',
      'g is the distance of the slider from its end stop along the rail (s is the displacement along the rail). When g falls to 0 the slider reaches the stop; if it still moves, it hits the stop with the stop\'s coefficient of restitution.',
      'g ist der Abstand des Schlittens vom Anschlag längs der Schiene (s ist die Verschiebung längs der Schiene). Fällt g auf 0, erreicht der Schlitten den Anschlag; bewegt er sich noch, stößt er mit der Stoßzahl des Anschlags dagegen.'
    ),
    unit: 'm'
  },
  unlimit: {
    name: T('离开限位检测', 'Leaving an end stop', 'Verlassen eines Anschlags'),
    g: 'g(t) = F_\\mathrm{stop}(t)',
    meaning: T(
      'g 为限位对滑块的作用力（只能向内推）。g 减小到 0，滑块不再压着限位，开始离开。',
      'g is the force of the end stop on the slider (it can only push inwards). When g falls to 0 the slider no longer presses on the stop and starts to leave it.',
      'g ist die Kraft des Anschlags auf den Schlitten (er kann nur nach innen drücken). Fällt g auf 0, drückt der Schlitten nicht mehr gegen den Anschlag und beginnt, sich zu lösen.'
    ),
    unit: 'N'
  },
  mslip: {
    name: T('马达打滑检测', 'Motor starts to slip', 'Motor beginnt zu rutschen'),
    g: 'g(t) = \\tau_\\mathrm{max} - |\\tau(t)|',
    meaning: T(
      'g 为马达的力矩上限 τ_max 与维持设定转速所需力矩 |τ| 之差。g 减小到 0，马达已不能维持设定转速，开始以最大力矩打滑。',
      'g is the motor\'s torque limit τ_max minus the torque |τ| needed to hold the set speed. When g falls to 0 the motor can no longer hold its speed and starts to slip, driving with its maximum torque.',
      'g ist die Drehmomentgrenze τ_max des Motors minus dem zum Halten der Solldrehzahl nötigen Drehmoment |τ|. Fällt g auf 0, kann der Motor die Drehzahl nicht mehr halten und rutscht mit seinem Höchstmoment.'
    ),
    unit: 'N·m'
  },
  mlock: {
    name: T('马达恢复转速检测', 'Motor back at speed', 'Motor wieder auf Solldrehzahl'),
    g: 'g(t) = d\\,(\\omega_\\mathrm{rel} - \\omega_0)',
    meaning: T(
      'g 为相对角速度与设定转速之差（d 为打滑方向，使打滑时 g > 0）。g 减小到 0，马达回到设定转速，重新锁定转速。',
      'g is the relative angular velocity minus the set speed (d is the direction of slipping, so g > 0 while slipping). When g falls to 0 the motor is back at its speed and locks onto it again.',
      'g ist die relative Winkelgeschwindigkeit minus der Solldrehzahl (d ist die Rutschrichtung, sodass g > 0 beim Rutschen). Fällt g auf 0, hat der Motor seine Drehzahl wieder erreicht und hält sie erneut.'
    ),
    unit: 'rad/s'
  },
  rollStart: {
    name: T('开始滚动检测', 'Onset of rolling', 'Beginn des Rollens'),
    g: 'g(t) = C_\\mathrm{rr} N R - |M|',
    meaning: T(
      'g 为最大滚动阻力偶 C_rr·N·R 与维持不滚动所需的力偶 |M| 之差。g 减小到 0，滚动阻力偶不足以阻止滚动，物体开始滚动。',
      'g is the largest rolling-resistance couple C_rr·N·R minus the couple |M| needed to keep the body from rolling. When g falls to 0 rolling resistance can no longer hold it and the body starts to roll.',
      'g ist das größte Rollwiderstandsmoment C_rr·N·R minus dem Moment |M|, das nötig ist, um das Rollen zu verhindern. Fällt g auf 0, reicht der Rollwiderstand nicht mehr, und der Körper beginnt zu rollen.'
    ),
    unit: 'N·m'
  },
  rollStop: {
    name: T('停止滚动检测', 'Rolling stops', 'Rollen endet'),
    g: 'g(t) = r\\,\\omega_\\mathrm{rel}',
    meaning: T(
      'g 为圆形物体相对接触面的转动角速度（r 为滚动方向，使滚动时 g > 0）。g 减小到 0，滚动停止。',
      'g is the angular velocity of the round body relative to the surface (r is the rolling direction, so g > 0 while rolling). When g falls to 0 the rolling stops.',
      'g ist die Winkelgeschwindigkeit des runden Körpers relativ zur Unterlage (r ist die Rollrichtung, sodass g > 0 beim Rollen). Fällt g auf 0, endet das Rollen.'
    ),
    unit: 'rad/s'
  },
  // 26.55 (D90)
  zone: {
    name: T('进出场区检测', 'Entering or leaving a field region', 'Eintritt in ein / Austritt aus einem Feldgebiet'),
    g: 'g(t) = b\\,d(\\vec r)',
    meaning: T(
      'd 为带电体中心到场区边界的有符号距离（在场区内为正），b = +1 表示此前在区内、−1 表示在区外，使 g 在事件前为正。g 减小到 0，带电体穿过场区边界，所受的电场力和洛伦兹力从此开始或停止。',
      'd is the signed distance from the charged body\'s centre to the boundary of the region (positive inside); b = +1 when it was inside, −1 when outside, so that g > 0 before the event. When g falls to 0 the body crosses the boundary and the region\'s electric and Lorentz forces start or stop acting.',
      'd ist der vorzeichenbehaftete Abstand des Ladungsmittelpunkts vom Rand des Gebiets (innen positiv); b = +1, wenn er innen war, −1 außen, sodass g > 0 vor dem Ereignis. Fällt g auf 0, überquert der Körper den Rand, und die elektrische Kraft und die Lorentzkraft des Gebiets setzen ein oder hören auf.'
    ),
    unit: 'm'
  }
}

/** Template of a change type: name, what happens, and the law it follows. */
export interface ChangeTemplate { name: Tri; text: Tri; law: Tri }

/** Change types (core/solver/simulation.ts ChangeType): what happens and which law governs it. */
export const CHANGE_TEXT: Record<ChangeType, ChangeTemplate> = {
  impact: {
    name: T('碰撞', 'Impact', 'Stoß'),
    text: T(
      '两物体以相互接近的法向速度接触，发生碰撞。碰撞时间极短，按瞬时冲量处理：碰撞前后位置不变，速度突变；重力等有限大小的力在碰撞时间内的冲量可以忽略。法向速度满足恢复系数关系，由此确定法向冲量；接触面粗糙时还有切向（摩擦）冲量。',
      'The bodies meet with an approaching normal velocity: an impact. It lasts so short a time that it is treated as an instantaneous impulse: positions stay the same, velocities jump, and the impulse of finite forces such as gravity during the impact is negligible. The normal velocities obey the restitution law, which fixes the normal impulse; on a rough surface there is also a tangential (friction) impulse.',
      'Die Körper treffen mit einer Annäherungsgeschwindigkeit in Normalenrichtung aufeinander: ein Stoß. Er dauert so kurz, dass er als augenblicklicher Kraftstoß behandelt wird: Die Lagen bleiben gleich, die Geschwindigkeiten ändern sich sprunghaft, und der Kraftstoß endlicher Kräfte wie der Gewichtskraft während des Stoßes ist vernachlässigbar. Die Normalgeschwindigkeiten gehorchen dem Stoßgesetz mit der Stoßzahl e, das den Kraftstoß in Normalenrichtung festlegt; bei rauer Oberfläche kommt ein Kraftstoß der Reibung in Tangentialrichtung hinzu.'
    ),
    law: T('牛顿碰撞定律（恢复系数 e）与动量定理', "Newton's law of restitution (coefficient e) and the impulse–momentum theorem", 'Newtonsches Stoßgesetz (Stoßzahl e) und Impulssatz (Kraftstoß = Impulsänderung)')
  },
  touch: {
    name: T('接触', 'Contact begins', 'Berührung beginnt'),
    text: T(
      '两物体开始接触，但接触时法向相对速度为零（或小到可以忽略），没有碰撞冲量。此后接触面上出现支持力，粗糙时还有摩擦力。',
      'The bodies come into contact with (practically) zero normal relative velocity, so there is no impact impulse. From now on the surface exerts a normal force, and friction if it is rough.',
      'Die Körper berühren sich mit (praktisch) verschwindender Relativgeschwindigkeit in Normalenrichtung, es gibt also keinen Kraftstoß. Ab jetzt wirkt eine Normalkraft, bei rauer Oberfläche auch Reibung.'
    ),
    law: T('接触条件：法向相对加速度 ≥ 0，支持力 N ≥ 0，二者不同时为正', 'Contact conditions: normal relative acceleration ≥ 0, normal force N ≥ 0, not both positive', 'Kontaktbedingungen: Relativbeschleunigung in Normalenrichtung ≥ 0, Normalkraft $F_\\mathrm{N} \\ge 0$, nicht beide positiv')
  },
  separate: {
    name: T('分离', 'Separation', 'Ablösen'),
    text: T(
      '接触点的支持力减小到零，两物体分离。此后它们之间不再有支持力和摩擦力，各自只受其他力作用。',
      'The normal force at the contact falls to zero and the bodies separate. From now on there is no normal force and no friction between them.',
      'Die Normalkraft im Kontakt sinkt auf null, und die Körper lösen sich voneinander. Ab jetzt wirken zwischen ihnen weder Normalkraft noch Reibung.'
    ),
    law: T('支持力只能是推力：N ≥ 0；N = 0 时接触结束', 'A normal force can only push: N ≥ 0; at N = 0 the contact ends', 'Die Normalkraft kann nur drücken: $F_\\mathrm{N} \\ge 0$; bei $F_\\mathrm{N} = 0$ endet der Kontakt')
  },
  stick: {
    name: T('相对静止（共速）', 'Common velocity (sticking)', 'Gemeinsame Geschwindigkeit (Haften)'),
    text: T(
      '相对滑动速度减小到零，两物体达到共同速度。此时维持相对静止所需的静摩擦力不超过最大静摩擦力 μₛN，所以两物体保持相对静止：滑动摩擦变为静摩擦，摩擦力的大小由运动状态决定。',
      'The relative sliding velocity has fallen to zero: the bodies move with a common velocity. The static friction needed to keep them together does not exceed the maximum μₛN, so they stick: kinetic friction turns into static friction, whose size follows from the motion.',
      'Die Relativgeschwindigkeit ist auf null gesunken: Die Körper bewegen sich mit gemeinsamer Geschwindigkeit. Die zum Haften nötige Reibungskraft überschreitet die maximale Haftreibungskraft $\\mu_s F_\\mathrm{N}$ nicht, also haften sie: Aus Gleitreibung wird Haftreibung, deren Betrag sich aus der Bewegung ergibt.'
    ),
    law: T('静摩擦：|f| ≤ μₛN', 'Static friction: |f| ≤ μₛN', 'Haftreibung: $|F_\\mathrm{R}| \\le \\mu_s F_\\mathrm{N}$')
  },
  slip: {
    name: T('开始相对滑动', 'Slipping begins', 'Gleiten beginnt'),
    text: T(
      '维持相对静止所需的静摩擦力达到最大静摩擦力 μₛN，静摩擦不足以维持相对静止，开始相对滑动。摩擦力变为滑动摩擦力 μₖN，方向与相对滑动方向相反。',
      'The static friction needed to keep the surfaces together reaches its maximum μₛN; it can no longer hold them and they start to slide. Friction becomes kinetic friction μₖN, opposite to the relative sliding.',
      'Die zum Haften nötige Reibungskraft erreicht die maximale Haftreibungskraft $\\mu_s F_\\mathrm{N}$; sie kann die Flächen nicht mehr halten, und sie beginnen zu gleiten. Es wirkt nun die Gleitreibungskraft $\\mu_k F_\\mathrm{N}$ entgegen der Relativbewegung.'
    ),
    law: T('滑动摩擦：f = μₖN，方向与相对滑动方向相反', 'Kinetic friction: f = μₖN, opposite to the relative sliding', 'Gleitreibung: $F_\\mathrm{R} = \\mu_k F_\\mathrm{N}$, entgegen der Relativbewegung')
  },
  reverse: {
    name: T('相对滑动反向', 'Sliding reverses', 'Gleitrichtung kehrt um'),
    text: T(
      '相对滑动速度减小到零，但最大静摩擦力不足以使两物体保持相对静止，于是立即反向相对滑动，滑动摩擦力随之反向。',
      'The relative sliding velocity falls to zero, but the maximum static friction cannot hold the bodies together, so they immediately slide the other way and the kinetic friction reverses.',
      'Die Relativgeschwindigkeit sinkt auf null, aber die maximale Haftreibungskraft $\\mu_s F_\\mathrm{N}$ kann die Körper nicht halten; sie gleiten sofort in die Gegenrichtung, und die Gleitreibungskraft kehrt sich um.'
    ),
    law: T('滑动摩擦方向总与相对滑动方向相反；静摩擦最大为 μₛN', 'Kinetic friction always opposes the relative sliding; static friction is at most μₛN', 'Die Gleitreibung wirkt stets entgegen der Relativbewegung; die Haftreibung beträgt höchstens $\\mu_s F_\\mathrm{N}$')
  },
  leave: {
    name: T('离开表面', 'Leaves the face', 'Verlässt die Fläche'),
    text: T(
      '接触点滑过表面的端点，离开该表面；此后在这一点上不再有支持力和摩擦力。',
      'The contact point slides past the end of the face and leaves it; there is no normal force or friction at this point any more.',
      'Der Kontaktpunkt gleitet über das Ende der Fläche hinaus und verlässt sie; an diesem Punkt wirken keine Normalkraft und keine Reibung mehr.'
    ),
    law: T('接触只能发生在物体表面的范围之内', 'Contact exists only within the extent of a face', 'Kontakt gibt es nur innerhalb der Fläche')
  },
  slack: {
    name: T('绳松弛', 'Rope goes slack', 'Seil wird schlaff'),
    text: T(
      '绳的拉力减小到零，绳松弛。此后物体不受绳的拉力，只在重力等其他力作用下运动（例如做斜抛运动），直到绳再次被拉直。',
      'The rope tension falls to zero and the rope goes slack. The body is no longer pulled by the rope and moves under the other forces only (for example as a projectile) until the rope is straight again.',
      'Die Seilkraft sinkt auf null, und das Seil wird schlaff. Der Körper wird nicht mehr vom Seil gezogen und bewegt sich nur unter den übrigen Kräften (zum Beispiel als schräger Wurf), bis das Seil wieder gestreckt ist.'
    ),
    law: T('绳只能提供拉力：$F_\\mathrm{T} \\ge 0$', 'A rope can only pull: $F_\\mathrm{T} \\ge 0$', 'Ein Seil kann nur ziehen: $F_\\mathrm{T} \\ge 0$')
  },
  taut: {
    name: T('绳绷紧', 'Rope becomes taut', 'Seil wird gespannt'),
    text: T(
      '绳被拉直。若此时物体沿绳方向仍在远离，不可伸长的绳在极短时间内给物体一个冲量，使沿绳方向的相对速度变为零（相当于完全非弹性碰撞，e = 0），损失一部分动能；垂直于绳的速度分量不变。',
      'The rope is pulled straight. If the body is still moving away along the rope, the inextensible rope gives it an impulse within a very short time that stops the relative velocity along the rope (like a perfectly inelastic impact, e = 0), and some kinetic energy is lost; the velocity component perpendicular to the rope is unchanged.',
      'Das Seil ist gestreckt. Bewegt sich der Körper entlang des Seils noch weg, erteilt ihm das undehnbare Seil in sehr kurzer Zeit einen Kraftstoß, der die Relativgeschwindigkeit längs des Seils auf null bringt (wie ein vollkommen unelastischer Stoß, e = 0); dabei geht kinetische Energie verloren, die Geschwindigkeitskomponente senkrecht zum Seil bleibt erhalten.'
    ),
    law: T('绳不可伸长：ℓ ≤ L；绷紧瞬间沿绳方向完全非弹性', 'The rope is inextensible: ℓ ≤ L; perfectly inelastic along the rope when it jerks taut', 'Das Seil ist undehnbar: ℓ ≤ L; beim Straffen vollkommen unelastisch längs des Seils')
  },
  switch: {
    name: T('变力切换', 'Variable force switches', 'Veränderliche Kraft schaltet um'),
    text: T(
      '变力表达式中的分段函数进入另一分支。跳变（step、sign、if）时力突然改变，加速度随之突变，速度仍连续；折点（abs、min、max）时力连续，只是随时间变化的快慢突变。',
      'The piecewise function in the force expression enters its other branch. At a jump (step, sign, if) the force changes suddenly, so the acceleration jumps while the velocity stays continuous; at a kink (abs, min, max) the force is continuous and only its rate of change jumps.',
      'Die abschnittsweise definierte Funktion im Kraftterm wechselt in den anderen Zweig. Bei einem Sprung (step, sign, if) ändert sich die Kraft schlagartig, die Beschleunigung springt, die Geschwindigkeit bleibt stetig; bei einem Knick (abs, min, max) bleibt die Kraft stetig, nur ihre Änderungsrate springt.'
    ),
    law: T('牛顿第二定律 F = ma 对每一分支分别成立', "Newton's second law F = ma holds on each branch", 'Das zweite newtonsche Gesetz F = m·a gilt in jedem Zweig')
  },
  timestep: {
    name: T('改用时间步进', 'Switch to time stepping', 'Wechsel zur Zeitschrittrechnung'),
    text: T(
      '碰撞或接触切换过于密集（或场景设置要求），此后求解器改用 Moreau–Jean 时间步进：按固定步长前进，每一步求解接触冲量，不再逐个精确定位事件。接触力读数为近似值，精度降级。',
      'Impacts or contact changes come too densely (or the scene settings ask for it), so from here the solver uses Moreau–Jean time stepping: fixed steps, contact impulses solved in every step, events no longer located one by one. Contact force readings are approximate: reduced accuracy.',
      'Stöße oder Kontaktwechsel folgen zu dicht aufeinander (oder die Szeneneinstellungen verlangen es), daher rechnet der Löser ab hier mit dem Moreau–Jean-Zeitschrittverfahren: feste Schritte, Kontaktkraftstöße in jedem Schritt, keine einzelne Ereignisortung mehr. Kontaktkräfte sind Näherungswerte: verringerte Genauigkeit.'
    ),
    law: T('Moreau–Jean 时间步进（冲量形式的接触条件）', 'Moreau–Jean time stepping (contact conditions in impulse form)', 'Moreau–Jean-Zeitschrittverfahren (Kontaktbedingungen in Kraftstoßform)')
  },
  pulley: {
    name: T('到达滑轮', 'Reaches the pulley', 'Erreicht die Rolle'),
    text: T(
      '绳端的物体被拉到它所绕过的滑轮处：物体与滑轮之间的那段绳长减小到零。此后物体会撞上滑轮（模型中滑轮与物体之间没有接触），所以计算在这一刻停止。',
      'The body on the rope end has been pulled up to the pulley the rope runs onto: the rope between them has shrunk to zero. Beyond this the body would run into the pulley (the model has no contact between pulleys and bodies), so the computation stops here.',
      'Der Körper am Seilende ist bis an die Rolle gezogen worden, über die das Seil läuft: Das Seilstück dazwischen ist auf null geschrumpft. Danach würde der Körper gegen die Rolle laufen (im Modell gibt es keinen Kontakt zwischen Rollen und Körpern), deshalb endet die Rechnung hier.'
    ),
    law: T('绳长不变：一端缩短多少，另一端就伸长多少', 'The rope length is constant: what one end loses, the other gains', 'Die Seillänge ist konstant: Was ein Ende verliert, gewinnt das andere')
  },
  limit: {
    name: T('到达限位', 'Reaches an end stop', 'Erreicht einen Anschlag'),
    text: T(
      '滑块到达滑轨的限位。若到达时仍有速度，按限位的恢复系数 e 发生碰撞（反弹速度为碰前的 e 倍）；此后若滑块压在限位上，限位给它向内的作用力。',
      'The slider reaches the end stop of its rail. If it still moves, it hits the stop with the stop\'s coefficient of restitution e (it bounces back at e times its speed); while it presses on the stop, the stop pushes it inwards.',
      'Der Schlitten erreicht den Anschlag seiner Schiene. Bewegt er sich noch, stößt er mit der Stoßzahl e des Anschlags dagegen (er prallt mit dem e-fachen Betrag zurück); solange er gegen den Anschlag drückt, schiebt ihn dieser nach innen.'
    ),
    law: T('限位是单边约束：s_min ≤ s ≤ s_max，作用力只能向内', 'An end stop is a one-sided constraint: s_min ≤ s ≤ s_max, its force only pushes inwards', 'Ein Anschlag ist eine einseitige Bindung: s_min ≤ s ≤ s_max, seine Kraft drückt nur nach innen')
  },
  unlimit: {
    name: T('离开限位', 'Leaves the end stop', 'Verlässt den Anschlag'),
    text: T(
      '限位对滑块的作用力减小到零，滑块离开限位，此后沿滑轨自由滑动。',
      'The force of the stop on the slider falls to zero and the slider leaves it; it then slides freely along the rail.',
      'Die Kraft des Anschlags auf den Schlitten sinkt auf null, der Schlitten löst sich und gleitet frei längs der Schiene.'
    ),
    law: T('限位力只能是推力：F ≥ 0', 'The force of a stop can only push: F ≥ 0', 'Die Kraft eines Anschlags kann nur drücken: F ≥ 0')
  },
  motorSlip: {
    name: T('马达打滑', 'Motor slips', 'Motor rutscht'),
    text: T(
      '维持设定转速所需的力矩超过了马达的力矩上限，马达不能再保持转速，改为以最大力矩 τ_max 驱动（方向使相对转速趋向设定值）。',
      'The torque needed to hold the set speed exceeds the motor\'s limit: the motor can no longer hold its speed and drives with its maximum torque τ_max instead (in the direction that brings the speed back towards the set value).',
      'Das zum Halten der Solldrehzahl nötige Drehmoment übersteigt die Grenze des Motors: Er kann die Drehzahl nicht mehr halten und treibt stattdessen mit dem Höchstmoment τ_max an (in der Richtung, die die Drehzahl zur Solldrehzahl zurückführt).'
    ),
    law: T('马达力矩：|τ| ≤ τ_max；转动定律 M = Iβ', 'Motor torque: |τ| ≤ τ_max; rotational law M = Iα', 'Motormoment: |τ| ≤ τ_max; Grundgesetz der Drehbewegung M = J·α')
  },
  motorLock: {
    name: T('马达恢复转速', 'Motor back at speed', 'Motor wieder auf Drehzahl'),
    text: T(
      '相对转速回到设定值，且所需力矩不超过上限，马达重新保持设定转速。',
      'The relative speed is back at the set value and the torque needed is within the limit: the motor holds its speed again.',
      'Die relative Drehzahl hat den Sollwert wieder erreicht, und das nötige Drehmoment liegt unter der Grenze: Der Motor hält seine Drehzahl wieder.'
    ),
    law: T('设定转速：ω_rel = ω₀，所需力矩 |τ| ≤ τ_max', 'Set speed: ω_rel = ω₀ with the needed torque |τ| ≤ τ_max', 'Solldrehzahl: ω_rel = ω₀ bei nötigem Moment |τ| ≤ τ_max')
  },
  rollStop: {
    name: T('滚动停止', 'Rolling stops', 'Rollen endet'),
    text: T(
      '圆形物体相对接触面的转动停止，滚动阻力偶由滚动阻力 C_rr·N·R 变为维持不滚动所需的力偶（不超过最大值）。',
      'The round body stops turning relative to the surface; the rolling-resistance couple changes from C_rr·N·R to whatever couple keeps it from rolling (at most that value).',
      'Der runde Körper hört auf, sich relativ zur Unterlage zu drehen; das Rollwiderstandsmoment wechselt von C_rr·N·R zu dem Moment, das das Rollen verhindert (höchstens dieser Wert).'
    ),
    law: T('滚动阻力偶：|M| ≤ C_rr·N·R', 'Rolling-resistance couple: |M| ≤ C_rr·N·R', 'Rollwiderstandsmoment: |M| ≤ C_rr·N·R')
  },
  rollStart: {
    name: T('开始滚动', 'Rolling begins', 'Rollen beginnt'),
    text: T(
      '维持不滚动所需的力偶达到最大滚动阻力偶 C_rr·N·R，物体开始滚动；此后滚动阻力偶大小为 C_rr·N·R，方向与相对滚动方向相反。',
      'The couple needed to keep the body from rolling reaches the largest rolling-resistance couple C_rr·N·R and it starts to roll; from now on the couple is C_rr·N·R against the relative rolling.',
      'Das zum Verhindern des Rollens nötige Moment erreicht das größte Rollwiderstandsmoment C_rr·N·R, und der Körper beginnt zu rollen; ab jetzt wirkt C_rr·N·R entgegen der Rollbewegung.'
    ),
    law: T('滚动阻力偶：M = C_rr·N·R，与相对滚动方向相反', 'Rolling resistance: M = C_rr·N·R against the relative rolling', 'Rollwiderstand: M = C_rr·N·R entgegen der Rollbewegung')
  },
  // 26.55 (D90)
  zoneEnter: {
    name: T('进入场区', 'Enters a field region', 'Tritt in ein Feldgebiet ein'),
    text: T(
      '带电体的中心进入场区，从这一刻起受到场区的电场力 qE 和洛伦兹力 qv × B。',
      'The centre of the charged body enters the region: from now on the region\'s electric force qE and Lorentz force qv × B act on it.',
      'Der Mittelpunkt des geladenen Körpers tritt in das Gebiet ein: Ab jetzt wirken die elektrische Kraft qE und die Lorentzkraft qv × B des Gebiets.'
    ),
    law: T('F = q(E + v × B)（在场区内）', 'F = q(E + v × B) inside the region', 'F = q(E + v × B) im Gebiet')
  },
  zoneLeave: {
    name: T('离开场区', 'Leaves a field region', 'Verlässt ein Feldgebiet'),
    text: T(
      '带电体的中心离开场区，场区的电场力和洛伦兹力消失；此后在区外做的运动只受其他力。',
      'The centre of the charged body leaves the region: the region\'s electric and Lorentz forces vanish, and it moves on under the other forces only.',
      'Der Mittelpunkt des geladenen Körpers verlässt das Gebiet: Die elektrische Kraft und die Lorentzkraft des Gebiets entfallen, er bewegt sich nur unter den übrigen Kräften weiter.'
    ),
    law: T('区外：F = 0（场区的力）', 'Outside: no force of the region', 'Außerhalb: keine Kraft des Gebiets')
  }
}

/** Other texts of the event detail. */
export const EVENT_TEXT = {
  event: T('事件', 'Event', 'Ereignis'),
  trigger: T('触发条件', 'Trigger condition', 'Auslösebedingung'),
  locate: T('定位方法与精度', 'How the event was located', 'Bestimmung des Zeitpunkts'),
  changes: T('状态变化与物理规律', 'What changes and why', 'Zustandsänderung und Gesetz'),
  impact: T('碰撞方程', 'Impact equations', 'Stoßgleichungen'),
  state: T('事件前后对比', 'Before and after', 'Vorher und nachher'),
  fired: T('事件时刻各触发函数的值（已越过零或滞回阈值）：', 'Values of the triggering functions at the event time (just past zero or the hysteresis threshold):', 'Werte der auslösenden Funktionen zum Ereigniszeitpunkt (knapp jenseits von null bzw. der Hystereseschwelle):'),
  object: T('对象', 'Object', 'Objekt'),
  gValue: T('$g(t_E)$', '$g(t_E)$', '$g(t_E)$'),
  threshold: T('阈值', 'Threshold', 'Schwelle'),
  noTrigger: T('这个事件不是由事件函数触发的。', 'This event was not triggered by an event function.', 'Dieses Ereignis wurde nicht durch eine Ereignisfunktion ausgelöst.'),
  method: T(
    '每个积分步结束时计算所有事件函数 g。若某个 g 在这一步内越过零（从边界上出发的函数：越过它的滞回阈值），就在这一步内求根：采用 Illinois 法（改进的弦截法）——每次试算都从步初状态出发、用同一积分器重新积分到试探时刻，保留 g 变号的区间，每 8 次迭代插入一次二分，直到区间宽度不超过 ${tol}$（最多 200 次迭代）。事件时刻取最终区间的右端，即 g 刚刚越过零的时刻。',
    'At the end of every integration step all event functions g are evaluated. When some g has crossed zero within the step (for a function that started on its boundary: its hysteresis threshold), the root is found inside the step by the Illinois method, a modified regula falsi: every trial integrates afresh from the start of the step to the trial time with the same integrator, the interval in which g changes sign is kept, and every 8th iteration is a bisection, until the interval is at most ${tol}$ wide (at most 200 iterations). The event time is the right end of the final interval, just after g has crossed zero.',
    'Am Ende jedes Integrationsschritts werden alle Ereignisfunktionen g ausgewertet. Hat ein g im Schritt die Null überschritten (bei einer Funktion, die auf ihrer Grenze startete: ihre Hystereseschwelle), wird die Nullstelle im Schritt mit dem Illinois-Verfahren, einer verbesserten Regula falsi, bestimmt: Jeder Versuch integriert mit demselben Integrator neu vom Schrittanfang bis zum Probezeitpunkt, das Intervall mit Vorzeichenwechsel von g wird beibehalten, und jede 8. Iteration ist eine Bisektion, bis das Intervall höchstens ${tol}$ breit ist (höchstens 200 Iterationen). Der Ereigniszeitpunkt ist das rechte Ende des letzten Intervalls, also kurz nachdem g die Null überschritten hat.'
  ),
  precision: T(
    '精度：真实的过零时刻位于区间 $[t_E - {tol},\\ t_E]$ 之内；此外还有积分器本身的截断误差，由“场景”页的容差控制。',
    'Accuracy: the true zero crossing lies in $[t_E - {tol},\\ t_E]$; on top of that comes the truncation error of the integrator itself, set by the tolerances on the Scene tab.',
    'Genauigkeit: Der wahre Nulldurchgang liegt in $[t_E - {tol},\\ t_E]$; hinzu kommt der Abbruchfehler des Integrators selbst, der durch die Toleranzen im Reiter „Szene“ bestimmt wird.'
  ),
  hysteresis: T(
    '滞回：在边界上开始的事件函数，要先离开边界一个小量 ε 才会再次触发，以免同一事件在同一时刻反复触发。ε：距离 10⁻⁹ m，力 10⁻⁹ × 场景中力的典型值，相对速度 10⁻¹⁰ m/s，变力切换 10⁻¹¹。',
    'Hysteresis: an event function that starts on its boundary fires again only after it has left the boundary by a small ε, so an event cannot fire again and again at one instant. ε: distances 10⁻⁹ m, forces 10⁻⁹ × the typical force of the scene, relative velocities 10⁻¹⁰ m/s, force switches 10⁻¹¹.',
    'Hysterese: Eine Ereignisfunktion, die auf ihrer Grenze beginnt, löst erst wieder aus, nachdem sie sich um ein kleines ε von der Grenze entfernt hat, damit ein Ereignis nicht im selben Augenblick immer wieder auslöst. ε: Abstände 10⁻⁹ m, Kräfte 10⁻⁹ × typische Kraft der Szene, Relativgeschwindigkeiten 10⁻¹⁰ m/s, Kraftumschaltungen 10⁻¹¹.'
  ),
  after: T(
    '事件之后：先处理碰撞（若仍有相互接近的接触点或绳），再重新确定各接触点的接触与摩擦状态，然后从事件时刻继续积分。',
    'After the event: impacts are resolved first (if contacts or ropes are still approaching), then the contact and friction state of every contact is determined anew, and the integration continues from the event time.',
    'Nach dem Ereignis: Zuerst werden Stöße aufgelöst (falls sich Kontakte oder Seile noch annähern), dann wird der Kontakt- und Reibungszustand jedes Kontakts neu bestimmt, und die Integration läuft vom Ereigniszeitpunkt aus weiter.'
  ),
  grid: T('这个事件恰好落在输出帧的时刻上（t = kΔt）。', 'This event falls exactly on an output frame time (t = kΔt).', 'Dieses Ereignis fällt genau auf einen Ausgabezeitpunkt (t = kΔt).'),
  initial: T(
    't = 0 的事件：初始状态中已有相互接近的接触点（或绳），开始积分之前先按碰撞处理，再确定初始的接触状态，因此不需要定位。',
    'An event at t = 0: the initial state already has approaching contacts (or ropes); they are resolved as an impact before the integration starts and the initial contact state is determined, so nothing has to be located.',
    'Ein Ereignis bei t = 0: Schon der Anfangszustand hat sich annähernde Kontakte (oder Seile); sie werden vor Beginn der Integration als Stoß aufgelöst und der anfängliche Kontaktzustand bestimmt, daher muss nichts geortet werden.'
  ),
  fallback: T(
    '此时刻起不再逐个定位事件：Moreau–Jean 时间步进按固定步长前进，事件时刻只精确到一个步长。',
    'From here events are no longer located one by one: Moreau–Jean time stepping advances in fixed steps, so event times are only accurate to one step.',
    'Ab hier werden Ereignisse nicht mehr einzeln geortet: Das Moreau–Jean-Verfahren rechnet mit festen Schritten, Ereigniszeitpunkte sind nur auf einen Schritt genau.'
  ),
  eventTime: T('事件时刻', 'Event time', 'Ereigniszeitpunkt'),
  lawLabel: T('物理规律：{l}', 'Law: {l}', 'Gesetz: {l}'),
  quantity: T('物理量', 'Quantity', 'Größe'),
  before: T('事件前', 'Before', 'Vorher'),
  after2: T('事件后', 'After', 'Nachher'),
  change: T('变化', 'Change', 'Änderung'),
  position: T('位置', 'Position', 'Lage'),
  velocity: T('速度', 'Velocity', 'Geschwindigkeit'),
  speed: T('速率', 'Speed', 'Betrag der Geschwindigkeit'),
  angle: T('转角', 'Angle', 'Drehwinkel'),
  omega: T('角速度', 'Angular velocity', 'Winkelgeschwindigkeit'),
  accel: T('加速度', 'Acceleration', 'Beschleunigung'),
  beta: T('角加速度', 'Angular acceleration', 'Winkelbeschleunigung'),
  ek: T('动能', 'Kinetic energy', 'Kinetische Energie'),
  system: T('系统', 'System', 'System'),
  ekTotal: T('总动能', 'Total kinetic energy', 'Gesamte kinetische Energie'),
  epGravity: T('重力势能', 'Gravitational potential energy', 'Lageenergie'),
  epSpring: T('弹性势能', 'Elastic potential energy', 'Spannenergie'),
  mech: T('机械能', 'Mechanical energy', 'Mechanische Energie'),
  continuous: T('事件中位置和速度连续（没有冲量），改变的是受力状态，因此加速度可能突变。', 'Positions and velocities are continuous through this event (no impulse); what changes are the forces, so the accelerations may jump.', 'Lage und Geschwindigkeit sind bei diesem Ereignis stetig (kein Kraftstoß); es ändern sich die Kräfte, daher können die Beschleunigungen springen.'),
  jump: T('碰撞前后位置不变，速度突变；加速度为碰撞前后瞬间的值。', 'Positions are unchanged by the impact, velocities jump; accelerations are the values just before and just after.', 'Die Lagen bleiben beim Stoß gleich, die Geschwindigkeiten springen; die Beschleunigungen sind die Werte unmittelbar vorher und nachher.'),
  bodiesAB: T('A：{a}（接触点所在物体）；B：{b}（接触面所在物体）。法向 $\\vec n$ 由 B 指向 A，$v_n$ 为 A 相对 B 的法向速度（分离为正）。', 'A: {a} (carries the contact point); B: {b} (carries the contact face). The normal $\\vec n$ points from B to A; $v_n$ is the normal velocity of A relative to B (positive when separating).', 'A: {a} (trägt den Kontaktpunkt); B: {b} (trägt die Kontaktfläche). Die Normale $\\vec n$ zeigt von B nach A; $v_n$ ist die Normalgeschwindigkeit von A relativ zu B (positiv beim Trennen).'),
  restitution: T('恢复系数关系（牛顿碰撞定律）：碰后的法向分离速度等于碰前法向接近速度的 e 倍。', "Restitution (Newton's law of impact): the normal separation velocity after the impact is e times the normal approach velocity before it.", 'Stoßgesetz (Newton): Die Trennungsgeschwindigkeit in Normalenrichtung nach dem Stoß ist das e-fache der Annäherungsgeschwindigkeit vorher.'),
  zeno: T('接近速度小于 10⁻⁵ m/s，按完全非弹性处理（e = 0），使反复弹跳在有限次后结束。', 'The approach velocity is below 10⁻⁵ m/s, so the impact is treated as perfectly inelastic (e = 0); this ends a bouncing sequence after finitely many bounces.', 'Die Annäherungsgeschwindigkeit liegt unter 10⁻⁵ m/s, daher wird der Stoß als vollkommen unelastisch behandelt (e = 0); so endet eine Folge von Sprüngen nach endlich vielen.'),
  recordedAfter: T('仿真记录的碰后法向速度：', 'Recorded normal velocity after the impact:', 'Aufgezeichnete Normalgeschwindigkeit nach dem Stoß:'),
  recordedRope: T('仿真记录的绷紧后沿绳伸长速度：', 'Recorded extension rate along the rope afterwards:', 'Aufgezeichnete Dehnungsgeschwindigkeit längs des Seils danach:'),
  impulseText: T('法向冲量由恢复系数关系和动量定理确定。$W_{nn}$ 为沿法向施加单位冲量时法向相对速度的变化（等效质量的倒数）：', 'The normal impulse follows from the restitution law and the impulse–momentum theorem. $W_{nn}$ is the change of the normal relative velocity per unit normal impulse (the inverse of the effective mass):', 'Der Kraftstoß in Normalenrichtung folgt aus dem Stoßgesetz und dem Impulssatz. $W_{nn}$ ist die Änderung der Normalrelativgeschwindigkeit je Einheitskraftstoß in Normalenrichtung (Kehrwert der wirksamen Masse):'),
  constrained: T('物体受铰链、杆或绳约束：约束同时产生冲量，$W_{nn}$ 按约束下的运动计算（对约束冲量消元）。', 'A body is constrained by a hinge, rod or rope: the constraint acts with an impulse as well, and $W_{nn}$ is computed for the constrained motion (the constraint impulses eliminated).', 'Ein Körper ist durch Gelenk, Stange oder Seil gebunden: Auch die Bindung wirkt mit einem Kraftstoß, und $W_{nn}$ wird für die gebundene Bewegung berechnet (Bindungskraftstöße eliminiert).'),
  recordedImpulse: T('求解器记录的法向冲量 $J$ = {j}。', 'Normal impulse recorded by the solver: $J$ = {j}.', 'Vom Löser aufgezeichneter Kraftstoß in Normalenrichtung: $J$ = {j}.'),
  dv: T('冲量引起的速度变化（动量定理）：', 'Velocity changes caused by the impulse (impulse–momentum theorem):', 'Geschwindigkeitsänderungen durch den Kraftstoß (Impulssatz):'),
  energyLoss: T('碰撞中损失的动能（转化为内能等）：', 'Kinetic energy lost in the impact (turned into internal energy etc.):', 'Beim Stoß verlorene kinetische Energie (in innere Energie usw. umgewandelt):'),
  momentum: T('碰撞时两物体所受外力的冲量可以忽略，总动量守恒（动量守恒定律）：', 'The impulse of external forces on the two bodies during the impact is negligible, so the total momentum is conserved (conservation of momentum):', 'Der Kraftstoß äußerer Kräfte auf die beiden Körper während des Stoßes ist vernachlässigbar, daher bleibt der Gesamtimpuls erhalten (Impulserhaltung):'),
  multi: T('多个接触点同时碰撞：各点的冲量同时求解。每个相互接近的接触点满足 $v_n^+ \\ge -e\\,v_n^-$，只有等号成立的点才有冲量（互补条件）。', 'Several contacts are hit at once: their impulses are solved together. Every approaching contact satisfies $v_n^+ \\ge -e\\,v_n^-$, and only where equality holds is there an impulse (complementarity).', 'Mehrere Kontakte werden gleichzeitig gestoßen: Ihre Kraftstöße werden gemeinsam bestimmt. Jeder sich annähernde Kontakt erfüllt $v_n^+ \\ge -e\\,v_n^-$, und nur wo Gleichheit gilt, wirkt ein Kraftstoß (Komplementarität).'),
  point: T('接触点', 'Contact', 'Kontakt'),
  friction: T(
    '接触面粗糙，碰撞中还有摩擦冲量 $J_t$（库仑摩擦：$|J_t| \\le \\mu J_n$）。按 Stronge 能量恢复模型，以法向冲量 $J_n$ 为参数沿冲量路径推进：滑动时 $\\mathrm{d}J_t = -\\mu_k s\\,\\mathrm{d}J_n$（s 为滑动方向）；切向相对速度降为零后，若 $|W_{nt}| \\le \\mu_s W_{tt}$ 则黏着（切向相对静止），否则反向滑动。压缩阶段在 $v_n = 0$ 时结束，恢复阶段释放压缩阶段法向功的 $e^2$ 倍。',
    'The surface is rough, so there is also a friction impulse $J_t$ (Coulomb: $|J_t| \\le \\mu J_n$). Following Stronge’s energetic restitution, the normal impulse $J_n$ is the path parameter: while sliding $\\mathrm{d}J_t = -\\mu_k s\\,\\mathrm{d}J_n$ (s the sliding direction); once the tangential relative velocity reaches zero the contact sticks if $|W_{nt}| \\le \\mu_s W_{tt}$, otherwise it slides back. Compression ends at $v_n = 0$; restitution releases $e^2$ times the normal work of compression.',
    'Die Oberfläche ist rau, daher gibt es auch einen Reibungskraftstoß $J_t$ (Coulomb: $|J_t| \\le \\mu J_n$). Nach dem Stoßmodell von Stronge (energetische Stoßzahl) ist der Normalkraftstoß $J_n$ der Bahnparameter: Beim Gleiten gilt $\\mathrm{d}J_t = -\\mu_k s\\,\\mathrm{d}J_n$ (s die Gleitrichtung); erreicht die tangentiale Relativgeschwindigkeit null, haftet der Kontakt, falls $|W_{nt}| \\le \\mu_s W_{tt}$, sonst gleitet er zurück. Die Kompression endet bei $v_n = 0$; die Restitution gibt das $e^2$-fache der Normalarbeit der Kompression zurück.'
  ),
  phases: T('冲量路径的各阶段（由记录的碰前速度与等效质量矩阵重建，与求解器结果一致）：', 'Phases of the impulse path (rebuilt from the recorded velocities and the effective mass matrix; they agree with the solver’s result):', 'Abschnitte des Kraftstoßwegs (aus den aufgezeichneten Geschwindigkeiten und der wirksamen Massenmatrix rekonstruiert; sie stimmen mit dem Ergebnis des Lösers überein):'),
  noPhases: T('各阶段无法由记录的数据唯一重建，下面只给出碰撞前后的结果。', 'The phases cannot be rebuilt uniquely from the recorded data; only the result is shown.', 'Die Abschnitte lassen sich aus den aufgezeichneten Daten nicht eindeutig rekonstruieren; gezeigt wird nur das Ergebnis.'),
  phase: T('阶段', 'Phase', 'Abschnitt'),
  compression: T('压缩', 'compression', 'Kompression'),
  restitutionPhase: T('恢复', 'restitution', 'Restitution'),
  sliding: T('滑动（{s}）', 'sliding ({s})', 'Gleiten ({s})'),
  sticking: T('黏着', 'sticking', 'Haften'),
  compressionWork: T('压缩阶段法向冲量做功 $W_c$，恢复阶段释放 $-e^2 W_c$：', 'Normal work of compression $W_c$; restitution releases $-e^2 W_c$:', 'Normalarbeit der Kompression $W_c$; die Restitution gibt $-e^2 W_c$ zurück:'),
  endSlip: T('碰撞中一直相对滑动', 'sliding throughout the impact', 'Gleiten während des ganzen Stoßes'),
  endStick: T('碰撞结束时切向相对静止', 'tangentially at rest relative to each other at the end', 'am Ende tangential relativ zueinander in Ruhe'),
  endReverse: T('切向相对速度反向', 'the tangential relative velocity reverses', 'die tangentiale Relativgeschwindigkeit kehrt sich um'),
  frictionResult: T('摩擦冲量与切向相对速度（结果：{r}）：', 'Friction impulse and tangential relative velocity (outcome: {r}):', 'Reibungskraftstoß und tangentiale Relativgeschwindigkeit (Ergebnis: {r}):'),
  rope: T('绳突然绷紧：沿绳方向完全非弹性（e = 0），绳给物体的冲量使沿绳方向的伸长速度变为零：', 'The rope jerks taut: perfectly inelastic along the rope (e = 0); the rope’s impulse brings the extension rate along the rope to zero:', 'Das Seil strafft sich ruckartig: vollkommen unelastisch längs des Seils (e = 0); der Kraftstoß des Seils bringt die Dehnungsgeschwindigkeit längs des Seils auf null:'),
  switchInfo: T('{f}：{k}，进入分支 b = {b}。表达式：{e}', '{f}: {k}, now on branch b = {b}. Expression: {e}', '{f}: {k}, jetzt Zweig b = {b}. Term: {e}'),
  switchJump: T('跳变', 'jump', 'Sprung'),
  switchKink: T('折点', 'kink', 'Knick'),
  missing: T('第 {i} 个事件不存在（记录已更新）。', 'Event {i} does not exist (the recording has changed).', 'Ereignis {i} existiert nicht (die Aufzeichnung hat sich geändert).'),
  reduced: T('此事件在 Moreau–Jean 时间步进（精度降级）的范围内，事件时刻只精确到一个时间步。', 'This event lies in the Moreau–Jean time-stepping part (reduced accuracy); its time is only accurate to one time step.', 'Dieses Ereignis liegt im Bereich der Moreau–Jean-Zeitschrittrechnung (verringerte Genauigkeit); sein Zeitpunkt ist nur auf einen Zeitschritt genau.')
}

// ---- Helpers ----

interface Ctx {
  data: EventData
  lang: Lang
  digits: number
  units: UnitChoice
  tr: (t: Tri, params?: Record<string, string | number>) => string
  q: (v: number | null, unit: string, digits?: number) => string
}

const nameOf = (c: Ctx, id: string): string => c.data.names[id] ?? id

/** Rows of the event functions at the event (unit by type; a leave function of a point inside a vertex cone has none). */
function firedUnit(f: NonNullable<EventData['fired']>[number]): string {
  return f.type === 'leave' && f.leaveNotPf ? '' : TRIGGER_TEXT[f.type].unit
}

/** Zeno threshold of impacts (core TOL.zeno). */
const ZENO = 1e-5

/**
 * Unit choice for a value: impulses (N·s) are shown in N·s where the choice shows momenta in kg·m/s (the same unit,
 * the one textbooks use for impulse).
 */
function choiceFor(units: UnitChoice, unit: string): UnitChoice {
  return unit === 'N·s' && units.momentum === 'kg·m/s' ? { ...units, momentum: 'N·s' } : units
}

/** KaTeX of a number with its unit, SI (the impact equations are written in SI like the substitutions). */
function siTex(c: Ctx, v: number, unit: string, digits = c.digits): string {
  return latexQuantity(v, unit, choiceFor({ ...defaultChoice(), angle: c.units.angle }, unit), digits)
}
/** KaTeX number, parenthesised when negative. */
function texNum(v: number, digits: number): string {
  const s = latexNumber(v, digits)
  return s.startsWith('-') ? `\\left(${s}\\right)` : s
}

// ---- Sections ----

function triggerSection(c: Ctx): DetailSection {
  const ev = c.data
  const blocks: DetailBlock[] = []
  for (const type of ev.triggers) {
    const t = TRIGGER_TEXT[type]
    blocks.push({ kind: 'subhead', text: c.tr(t.name) })
    blocks.push({ kind: 'equation', tex: t.g, text: c.tr(t.meaning) })
  }
  if (!ev.triggers.length) blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.noTrigger) })
  const fired = ev.fired
  if (fired && fired.length) {
    blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.fired) })
    blocks.push({
      kind: 'table', head: ['', c.tr(EVENT_TEXT.object), c.tr(EVENT_TEXT.gValue), c.tr(EVENT_TEXT.threshold)], align: ['left', 'left', 'right', 'right'],
      rows: fired.map(f => [{ text: c.tr(TRIGGER_TEXT[f.type].name) }, { text: f.who }, { text: c.q(f.value, firedUnit(f), 3), mono: true }, { text: c.q(f.threshold, firedUnit(f), 3), mono: true }])
    })
  }
  return { id: 'trigger', title: c.tr(EVENT_TEXT.trigger), blocks }
}

function locateSection(c: Ctx): DetailSection {
  const ev = c.data
  const blocks: DetailBlock[] = []
  const tol = '10^{-12}\\,\\mathrm{s}'
  blocks.push({ kind: 'table', rows: [[{ text: c.tr(EVENT_TEXT.eventTime) }, { tex: `t_E = ${latexQuantity(ev.t, 's', c.units, 13)}` }]], align: ['left', 'right'] })
  const timestep = ev.changes.some(ch => ch.type === 'timestep')
  if (timestep) blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.fallback) })
  else if (ev.reduced) blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.reduced), tone: 'warn' })
  else if (ev.t === 0 && ev.index === 0) blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.initial) })
  else {
    blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.method, { tol }) })
    blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.precision, { tol }) })
    const k = ev.t / ev.dt
    if (Math.abs(k - Math.round(k)) < 1e-9) blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.grid), small: true })
    blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.hysteresis), small: true })
  }
  if (!timestep) blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.after), small: true })
  return { id: 'locate', title: c.tr(EVENT_TEXT.locate), blocks }
}

function changeWho(c: Ctx, ch: ChangeDetail): string {
  if (ch.bodies.length) return ch.bodies.map(id => nameOf(c, id)).join(' – ')
  return ch.subject && ch.subject !== 'solver' ? nameOf(c, ch.subject) : ''
}

function changesSection(c: Ctx): DetailSection {
  const ev = c.data
  const blocks: DetailBlock[] = []
  ev.changes.forEach((ch, ci) => {
    const t = CHANGE_TEXT[ch.type]
    const who = changeWho(c, ch)
    blocks.push({ kind: 'subhead', text: `${c.tr(t.name)}${who ? ` · ${who}` : ''}` })
    blocks.push({ kind: 'text', text: c.tr(t.text) })
    if (ch.type === 'switch' && ch.switchIndex !== undefined) {
      const sw = ev.switches.find(x => x.change === ci)
      blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.switchInfo, { f: sw?.force ?? ch.subject, k: `${sw?.kind ?? ''} · ${c.tr(ch.kink ? EVENT_TEXT.switchKink : EVENT_TEXT.switchJump)}`, b: ch.branch ?? 0, e: sw?.expr ?? '' }), small: true })
    }
    blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.lawLabel, { l: c.tr(t.law) }), small: true, tone: 'info' })
  })
  if (!ev.changes.length) blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.noTrigger) })
  return { id: 'changes', title: c.tr(EVENT_TEXT.changes), blocks }
}

const freeTerm = (c: Ctx, t: { label: string; mass: number; inertia: number; w: number; rotates: boolean }, sym: string[], num: string[]) => {
  sym.push(`\\dfrac{1}{m_${t.label}}`); num.push(`\\dfrac{1}{${siTex(c, t.mass, 'kg')}}`)
  if (t.rotates) {
    sym.push(`\\dfrac{\\left(\\vec r_${t.label}\\times\\vec n\\right)^2}{I_${t.label}}`)
    num.push(`\\dfrac{${texNum(t.w, c.digits)}^2\\,\\mathrm{m^2}}{${siTex(c, t.inertia, 'kg·m²')}}`)
  }
}

/** Blocks of one impact point (contact or rope). */
function impactBlocks(c: Ctx, ch: ChangeDetail, p: EventImpactPoint, single: boolean): DetailBlock[] {
  const blocks: DetailBlock[] = []
  const d = c.digits
  const u = p.vnBefore
  const e = p.restitution
  if (p.kind === 'rope') {
    blocks.push({ kind: 'subhead', text: `${c.tr(CHANGE_TEXT.taut.name)} · ${p.ropeName ?? ''}` })
    blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.rope) })
    blocks.push({ kind: 'equation', tex: `v_{\\parallel}^{-} = ${siTex(c, u, 'm/s')} \\;\\rightarrow\\; v_{\\parallel}^{+} = 0` })
    blocks.push({ kind: 'text', text: `${c.tr(EVENT_TEXT.recordedRope)} ${c.q(p.vnAfter, 'm/s')}`, small: true })
    if (single && typeof p.W === 'number') {
      const Wv = p.W
      blocks.push({ kind: 'chain', lhs: 'J', rhs: ['\\dfrac{-v_{\\parallel}^{-}}{W}', `\\dfrac{-${texNum(u, d)}\\,\\mathrm{m/s}}{${latexNumber(Wv, d)}\\,\\mathrm{kg^{-1}}}`, siTex(c, -u / Wv, 'N·s')] })
    }
    blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.recordedImpulse, { j: c.q(p.impulse, 'N·s') }), small: true })
    return blocks
  }
  const nameA = p.nameA ?? '', nameB = p.nameB ?? ''
  blocks.push({ kind: 'subhead', text: `${c.tr(CHANGE_TEXT.impact.name)} · ${nameA} – ${nameB}` })
  blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.bodiesAB, { a: nameA, b: nameB }), small: true })
  blocks.push({ kind: 'equation', tex: `\\vec n = \\left(${latexNumber(p.nx, d)},\\ ${latexNumber(p.ny, d)}\\right),\\quad v_n^{-} = ${siTex(c, u, 'm/s')}` })
  // Restitution
  blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.restitution) })
  const target = -e * u
  blocks.push({ kind: 'chain', lhs: 'v_n^{+}', rhs: ['-e\\,v_n^{-}', `-${latexNumber(e, d)} \\times ${texNum(u, d)}\\,\\mathrm{m/s}`, siTex(c, target, 'm/s')] })
  if (-u < ZENO && ch.restitution === 0) blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.zeno), small: true })
  blocks.push({ kind: 'text', text: `${c.tr(EVENT_TEXT.recordedAfter)} $v_n^+$ = ${c.q(p.vnAfter, 'm/s')}`, small: true })
  const frictional = p.tangentImpulse !== undefined
  // Impulse (single contact): J = −(1 + e) v_n⁻ / W_nn
  if (single && Array.isArray(p.W)) {
    const W = p.W
    const Wnn = W[0][0]
    blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.impulseText) })
    if (p.constrained) {
      blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.constrained), small: true })
      if (p.hinged) {
        const sym: string[] = [], num: string[] = []
        for (const t of p.hinged.terms) {
          if (t.kind === 'free') { freeTerm(c, t, sym, num); continue }
          sym.push(`\\dfrac{\\left(\\vec r_{O${t.label}}\\times\\vec n\\right)^2}{I_{O${t.label}}}`)
          num.push(`\\dfrac{${texNum(t.arm, d)}^2\\,\\mathrm{m^2}}{${siTex(c, t.IO, 'kg·m²')}}`)
        }
        blocks.push({ kind: 'chain', lhs: 'W_{nn}', rhs: [sym.join(' + '), num.join(' + '), `${latexNumber(Wnn, d)}\\,\\mathrm{kg^{-1}}`] })
      } else blocks.push({ kind: 'equation', tex: `W_{nn} = ${latexNumber(Wnn, d)}\\,\\mathrm{kg^{-1}}` })
    } else {
      // W_nn = 1/m_A + (r_A×n)²/I_A + 1/m_B + (r_B×n)²/I_B for the dynamic bodies
      const sym: string[] = [], num: string[] = []
      for (const t of p.wTerms ?? []) freeTerm(c, t, sym, num)
      blocks.push({ kind: 'chain', lhs: 'W_{nn}', rhs: [sym.join(' + '), num.join(' + '), `${latexNumber(Wnn, d)}\\,\\mathrm{kg^{-1}}`] })
    }
    const Jn = frictional ? p.impulse : -(1 + e) * u / Wnn
    if (!frictional) {
      blocks.push({ kind: 'chain', lhs: 'J', rhs: ['\\dfrac{-(1 + e)\\,v_n^{-}}{W_{nn}}', `\\dfrac{-(1 + ${latexNumber(e, d)}) \\times ${texNum(u, d)}\\,\\mathrm{m/s}}{${latexNumber(Wnn, d)}\\,\\mathrm{kg^{-1}}}`, siTex(c, Jn, 'N·s')] })
    }
    blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.recordedImpulse, { j: c.q(p.impulse, 'N·s') }), small: true })
    if (frictional) blocks.push(...frictionBlocks(c, p, W, u))
    // Velocity changes of the free bodies (no constraint impulses)
    if (!p.constrained) {
      blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.dv) })
      const Jt = p.tangentImpulse ?? 0
      const tx = -p.ny, ty = p.nx
      for (const v of p.dv ?? []) {
        const sign = v.sign, label = v.label
        const lawSym = frictional ? `${sign > 0 ? '' : '-'}\\dfrac{J_n\\vec n + J_t\\vec t}{m_${label}}` : `${sign > 0 ? '' : '-'}\\dfrac{J}{m_${label}}\\vec n`
        const vec = (x: number, y: number) => `\\left(${latexNumber(x, d)},\\ ${latexNumber(y, d)}\\right)`
        const numeric = frictional
          ? `${sign > 0 ? '' : '-'}\\dfrac{${latexNumber(p.impulse, d)} \\times ${vec(p.nx, p.ny)} + ${texNum(Jt, d)} \\times ${vec(tx, ty)}}{${latexNumber(v.mass, d)}}`
          : `${sign > 0 ? '' : '-'}\\dfrac{${latexNumber(p.impulse, d)}\\,\\mathrm{N\\cdot s}}{${siTex(c, v.mass, 'kg')}} \\times ${vec(p.nx, p.ny)}`
        blocks.push({ kind: 'chain', lhs: `\\Delta\\vec v_${label}`, rhs: [lawSym, numeric, `${vec(v.vx, v.vy)}\\,\\mathrm{m/s}`] })
        if (v.dw !== null) {
          blocks.push({ kind: 'chain', lhs: `\\Delta\\omega_${label}`, rhs: [frictional ? `${sign > 0 ? '' : '-'}\\dfrac{\\vec r_${label}\\times(J_n\\vec n + J_t\\vec t)}{I_${label}}` : `${sign > 0 ? '' : '-'}\\dfrac{(\\vec r_${label}\\times\\vec n)\\,J}{I_${label}}`, siTex(c, v.dw, 'rad/s')] })
        }
      }
      // Momentum of two free bodies
      if (p.momentum) {
        const p0 = p.momentum.p0, p1 = p.momentum.p1
        blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.momentum) })
        blocks.push({ kind: 'chain', lhs: '\\vec p^{-}', rhs: ['m_A\\vec v_A^{-} + m_B\\vec v_B^{-}', `\\left(${latexNumber(p0[0], d)},\\ ${latexNumber(p0[1], d)}\\right)\\,\\mathrm{kg\\cdot m/s}`] })
        blocks.push({ kind: 'chain', lhs: '\\vec p^{+}', rhs: ['m_A\\vec v_A^{+} + m_B\\vec v_B^{+}', `\\left(${latexNumber(p1[0], d)},\\ ${latexNumber(p1[1], d)}\\right)\\,\\mathrm{kg\\cdot m/s}`] })
      }
    }
  }
  return blocks
}

/** Friction impulse and Stronge phases of a single frictional contact. */
function frictionBlocks(c: Ctx, p: EventImpactPoint, W: number[][], _u: number): DetailBlock[] {
  const blocks: DetailBlock[] = []
  const d = c.digits
  const end = p.friction ?? 'slip'
  const endText = c.tr(end === 'stick' ? EVENT_TEXT.endStick : end === 'reverse' ? EVENT_TEXT.endReverse : EVENT_TEXT.endSlip)
  blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.friction) })
  const muK = p.muK ?? 0, muS = p.muS ?? 0
  const Wnn = W[0][0], Wnt = 0.5 * (W[0][1] + W[1][0]), Wtt = W[1][1]
  blocks.push({ kind: 'equation', tex: `W = \\begin{pmatrix} W_{nn} & W_{nt} \\\\ W_{nt} & W_{tt} \\end{pmatrix} = \\begin{pmatrix} ${latexNumber(Wnn, d)} & ${latexNumber(Wnt, d)} \\\\ ${latexNumber(Wnt, d)} & ${latexNumber(Wtt, d)} \\end{pmatrix}\\,\\mathrm{kg^{-1}},\\quad \\mu_k = ${latexNumber(muK, d)},\\ \\mu_s = ${latexNumber(muS, d)}` })
  const vt0 = p.vtBefore ?? 0
  const Jt = p.tangentImpulse ?? 0
  const tr = p.stronge
  if (tr) {
    blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.phases) })
    // Units in the header, numbers in the cells (display units)
    const uJ = displayLabel('N·s', choiceFor(c.units, 'N·s')), uV = displayLabel('m/s', c.units)
    const num = (v: number, unit: string) => ({ text: formatSig(toDisplay(v, unit, choiceFor(c.units, unit)), d), mono: true })
    const head = [c.tr(EVENT_TEXT.phase), `$\\Delta J_n$ / ${uJ}`, `$J_n$ / ${uJ}`, `$J_t$ / ${uJ}`, `$v_n$ / ${uV}`, `$v_t$ / ${uV}`]
    const rows: DetailCell[][] = tr.phases.map((ph, k) => [
      { text: `${k + 1}. ${c.tr(ph.compression ? EVENT_TEXT.compression : EVENT_TEXT.restitutionPhase)} · ${ph.s === 0 ? c.tr(EVENT_TEXT.sticking) : c.tr(EVENT_TEXT.sliding, { s: ph.s > 0 ? '+' : '−' })}` },
      num(ph.dPn, 'N·s'), num(ph.Pn, 'N·s'), num(ph.Pt, 'N·s'), num(ph.vn, 'm/s'), num(ph.vt, 'm/s')
    ])
    blocks.push({ kind: 'table', head, rows, align: ['left', 'right', 'right', 'right', 'right', 'right'] })
    blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.compressionWork) })
    blocks.push({ kind: 'equation', tex: `W_c = \\int v_n\\,\\mathrm{d}J_n = ${siTex(c, tr.workC, 'J')},\\qquad W_r = -e^2 W_c = ${siTex(c, -p.restitution * p.restitution * tr.workC, 'J')}` })
  } else blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.noPhases), small: true })
  blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.frictionResult, { r: endText }) })
  blocks.push({ kind: 'equation', tex: `J_n = ${siTex(c, p.impulse, 'N·s')},\\quad J_t = ${siTex(c, Jt, 'N·s')},\\quad \\left|J_t\\right| ${Math.abs(Jt) <= muK * p.impulse * (1 + 1e-9) ? '\\le' : '>'} \\mu_k J_n = ${siTex(c, muK * p.impulse, 'N·s')}` })
  blocks.push({ kind: 'equation', tex: `v_t^{-} = ${siTex(c, vt0, 'm/s')} \\;\\rightarrow\\; v_t^{+} = ${siTex(c, p.vtAfter ?? 0, 'm/s')}` })
  return blocks
}

function impactSection(c: Ctx): DetailSection | null {
  const imp = c.data.impact
  if (!imp) return null
  const blocks: DetailBlock[] = []
  const points = imp.points
  const single = imp.single
  if (!single) {
    blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.multi) })
    blocks.push({
      kind: 'table', head: [c.tr(EVENT_TEXT.point), 'e', 'vₙ⁻', 'vₙ⁺', 'J'], align: ['left', 'right', 'right', 'right', 'right'],
      rows: points.map(p => [
        { text: p.kind === 'rope' ? p.ropeName ?? '' : `${p.nameA ?? ''} – ${p.nameB ?? ''}` },
        { text: String(Number(p.restitution.toPrecision(c.digits))), mono: true },
        { text: c.q(p.vnBefore, 'm/s'), mono: true }, { text: c.q(p.vnAfter, 'm/s'), mono: true }, { text: c.q(p.impulse, 'N·s'), mono: true }
      ])
    })
  }
  for (const p of points) {
    const ch = p.change >= 0 ? c.data.changes[p.change] : null
    if (!ch) continue
    blocks.push(...impactBlocks(c, ch, p, single))
  }
  if (imp.warning) blocks.push({ kind: 'text', text: renderMessage(imp.warning, c.lang), tone: 'warn', small: true })
  blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.energyLoss) })
  blocks.push({ kind: 'chain', lhs: '\\Delta E_k', rhs: ['E_k^{-} - E_k^{+}', `${siTex(c, imp.energyBefore, 'J')} - ${siTex(c, imp.energyAfter, 'J')}`, siTex(c, imp.loss, 'J')] })
  return { id: 'impact', title: c.tr(EVENT_TEXT.impact), blocks }
}

/** Relative size below which a before/after difference is shown as "no change" (rounding, projection). */
const CHANGED = 1e-9
/** Rounding noise (|v| < 10⁻¹² in SI) is shown as 0 in the before/after tables. */
const snap = (v: number | null) => (v !== null && Math.abs(v) < 1e-12 ? 0 : v)

function stateSection(c: Ctx): DetailSection {
  const ev = c.data
  const blocks: DetailBlock[] = []
  const jumped = !!ev.impact
  blocks.push({ kind: 'text', text: c.tr(jumped ? EVENT_TEXT.jump : EVENT_TEXT.continuous), small: true })
  const head = [c.tr(EVENT_TEXT.quantity), c.tr(EVENT_TEXT.before), c.tr(EVENT_TEXT.after2), c.tr(EVENT_TEXT.change)]
  const align: Array<'left' | 'right'> = ['left', 'right', 'right', 'right']
  for (const b of ev.state.bodies) {
    const rows: DetailCell[][] = []
    const row = (label: string, sym: string, v0: number | null, v1: number | null, unit: string) => {
      const diff = v0 !== null && v1 !== null ? v1 - v0 : null
      const changed = diff !== null && Math.abs(diff) > CHANGED * Math.max(1, Math.abs(v0!), Math.abs(v1!))
      rows.push([{ text: label, tex: sym }, { text: c.q(snap(v0), unit), mono: true }, { text: c.q(snap(v1), unit), mono: true }, { text: changed ? c.q(diff, unit, 3) : '—', mono: true, tone: changed ? 'info' : undefined }])
    }
    const B = b.before, A = b.after, a0 = b.accBefore, a1 = b.accAfter
    row(`${c.tr(EVENT_TEXT.position)} `, 'x', B[0], A[0], 'm')
    row(`${c.tr(EVENT_TEXT.position)} `, 'y', B[1], A[1], 'm')
    if (b.rotates) row(`${c.tr(EVENT_TEXT.angle)} `, '\\theta', B[2], A[2], 'rad')
    row(`${c.tr(EVENT_TEXT.velocity)} `, 'v_x', B[3], A[3], 'm/s')
    row(`${c.tr(EVENT_TEXT.velocity)} `, 'v_y', B[4], A[4], 'm/s')
    row(`${c.tr(EVENT_TEXT.speed)} `, '|\\vec v|', b.speedBefore, b.speedAfter, 'm/s')
    if (b.rotates) row(`${c.tr(EVENT_TEXT.omega)} `, '\\omega', B[5], A[5], 'rad/s')
    row(`${c.tr(EVENT_TEXT.accel)} `, 'a_x', a0 ? a0[0] : null, a1 ? a1[0] : null, 'm/s²')
    row(`${c.tr(EVENT_TEXT.accel)} `, 'a_y', a0 ? a0[1] : null, a1 ? a1[1] : null, 'm/s²')
    if (b.rotates) row(`${c.tr(EVENT_TEXT.beta)} `, '\\beta', a0 ? a0[2] : null, a1 ? a1[2] : null, 'rad/s²')
    row(`${c.tr(EVENT_TEXT.ek)} `, 'E_k', b.ekBefore, b.ekAfter, 'J')
    blocks.push({ kind: 'subhead', text: b.name })
    blocks.push({ kind: 'table', head, rows, align })
  }
  // System energies
  const e0 = ev.state.before, e1 = ev.state.after
  const rows: DetailCell[][] = []
  const row = (label: string, v0: number, v1: number) => {
    const diff = v1 - v0
    const changed = Math.abs(diff) > CHANGED * Math.max(1, Math.abs(v0), Math.abs(v1))
    rows.push([{ text: label }, { text: c.q(snap(v0), 'J'), mono: true }, { text: c.q(snap(v1), 'J'), mono: true }, { text: changed ? c.q(diff, 'J', 3) : '—', mono: true, tone: changed ? 'info' : undefined }])
  }
  row(c.tr(EVENT_TEXT.ekTotal), e0.kinetic, e1.kinetic)
  if (e0.gravity !== 0 || e1.gravity !== 0) row(c.tr(EVENT_TEXT.epGravity), e0.gravity, e1.gravity)
  if (e0.spring !== 0 || e1.spring !== 0) row(c.tr(EVENT_TEXT.epSpring), e0.spring, e1.spring)
  row(c.tr(EVENT_TEXT.mech), e0.total, e1.total)
  blocks.push({ kind: 'subhead', text: c.tr(EVENT_TEXT.system) })
  blocks.push({ kind: 'table', head, rows, align })
  return { id: 'state', title: c.tr(EVENT_TEXT.state), blocks }
}

/** Display name of a change (a kink of a variable force has its own name). */
function changeName(c: Ctx, ch: ChangeDetail): string {
  const name = c.tr(CHANGE_TEXT[ch.type].name)
  if (ch.type !== 'switch' || !ch.kink) return name
  const kink = c.tr(EVENT_TEXT.switchKink)
  return c.lang === 'zh' ? `${name}（${kink}）` : `${name} (${kink})`
}

/** The view shown when the event does not exist (the recording changed). */
export function missingEventDetail(eventIndex: number, lang: Lang): DetailView {
  const tr = (t: Tri, params?: Record<string, string | number>) => fillParams(triText(t, lang), params)
  return { kind: 'event', title: tr(EVENT_TEXT.event), subtitle: '', headline: null, badges: [], sections: [{ id: 'missing', title: tr(EVENT_TEXT.event), blocks: [{ kind: 'text', text: tr(EVENT_TEXT.missing, { i: eventIndex }), tone: 'warn' }] }] }
}

/** The numbers of the detail view of event `index` of a recording, computed in the core (event_detail.rs). */
export function eventDataOf(rec: Recording, index: number): EventData | null {
  return rec.session.call<{ event: EventData | null }>({ op: 'eventData', index }).event
}

/**
 * Build the detail view of an event from its numbers (`eventData` of the session) in language `lang`. Values are shown
 * in the display units of `opts.units`; impact equations are written in SI, like the substitutions of the formulas.
 */
export function buildEventDetail(data: EventData | null, eventIndex: number, lang: Lang, opts: DetailOptions = {}): DetailView {
  if (!data) return missingEventDetail(eventIndex, lang)
  const units = opts.units ?? defaultChoice()
  const digits = opts.digits ?? 4
  const tr = (t: Tri, params?: Record<string, string | number>) => fillParams(triText(t, lang), params)
  const c: Ctx = {
    data, lang, digits, units, tr,
    q: (v, unit, nd = digits) => formatQuantity(v, unit, choiceFor(units, unit), nd)
  }
  const ev = data
  const names = [...new Set(ev.changes.map(ch => changeName(c, ch)))]
  if (!names.length) names.push(...new Set(ev.triggers.map(t => tr(TRIGGER_TEXT[t].name))))
  const who = [...new Set(ev.changes.map(ch => changeWho(c, ch)).filter(Boolean))].join(lang === 'zh' ? '；' : '; ')
  const sections: DetailSection[] = [triggerSection(c), locateSection(c), changesSection(c)]
  const impact = impactSection(c)
  if (impact) sections.push(impact)
  sections.push(stateSection(c))
  const headline = ev.impact && ev.changes.some(ch => ch.type === 'impact') ? 'v_n^{+} = -e\\,v_n^{-}' : ev.triggers.length ? TRIGGER_TEXT[ev.triggers[0]].g : null
  const badges: Array<{ text: string; tone: Tone }> = ev.triggers.map(t => ({ text: tr(TRIGGER_TEXT[t].name), tone: 'info' as Tone }))
  if (ev.reduced || ev.changes.some(ch => ch.type === 'timestep')) badges.push({ text: tr(CHANGE_TEXT.timestep.name), tone: 'warn' })
  return {
    kind: 'event',
    title: names.join(lang === 'zh' ? '、' : ', ') || tr(EVENT_TEXT.event),
    subtitle: `${who ? `${who} · ` : ''}t = ${formatQuantity(ev.t, 's', units, Math.max(digits, 9))}`,
    headline,
    badges,
    sections
  }
}
