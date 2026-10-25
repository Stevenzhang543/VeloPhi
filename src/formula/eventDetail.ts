/**
 * Event detail view (manual 26.50, D28): for one recorded event, the event function g(t) that triggered it and what
 * it means, how the solver located the event and how accurately, what changed and by which physical law, the state
 * of the bodies involved before and after, and for impacts the restitution law and the impulse with the recorded
 * numbers substituted (with friction: the phases of Stronge's impulse path).
 *
 * Everything shown is read from the recording (events, segments, impact results) or recomputed from it with the
 * solver's own functions (event functions of the mode, mode solutions, effective inverse masses); nothing changes
 * the recording. The texts are trilingual templates (`TRIGGER_TEXT`, `CHANGE_TEXT`) written inline, as the
 * derivations are.
 */
import { renderMessage } from '../i18n/coreText'
import type { ChangeDetail, ChangeType, Recording, Segment, SimEvent } from '../core/solver/simulation'
import type { EventType } from '../core/solver/events'
import { buildEventFns } from '../core/solver/events'
import type { Pose, RowJ } from '../core/solver/kinematics'
import { computePoses, contactKin, distanceKin, hingeKin, ropeKin } from '../core/solver/kinematics'
import type { System } from '../core/solver/dynamics'
import type { BodyModel } from '../core/solver/model'
import { TOL, addRow, energy, rowDot, rowMinvRow, solveMode } from '../core/solver/dynamics'
import type { ImpactPoint } from '../core/solver/impact'
import { solveDense } from '../core/math/linalg'
import type { Lang, Tri } from '../i18n/tri'
import { fillParams, triText } from '../i18n/tri'
import type { UnitChoice } from '../units/units'
import { defaultChoice, displayLabel, formatQuantity, formatSig, latexNumber, latexQuantity, toDisplay } from '../units/units'
import type { DetailOptions } from './detail'
import type { DetailBlock, DetailCell, DetailSection, DetailView, Tone } from './detailTypes'

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
  rec: Recording
  sys: System
  lang: Lang
  digits: number
  units: UnitChoice
  tr: (t: Tri, params?: Record<string, string | number>) => string
  q: (v: number | null, unit: string, digits?: number) => string
}

function nameOf(sys: System, id: string): string {
  const m = sys.model
  return m.byId.get(id)?.name ?? m.ropes.find(r => r.id === id)?.name ?? m.forces.find(f => f.id === id)?.name ?? id
}

/** Segment by its index (the recording may start at a later segment after a rebuild). */
function segmentByIndex(rec: Recording, index: number): Segment | null {
  return rec.segments.find(s => s.index === index) ?? null
}

/** Value of an event function of `type` at the event, with its object and threshold. */
interface FiredValue { type: EventType; who: string; value: number; threshold: number; unit: string }

/**
 * The event functions of the mode that ended at the event, evaluated at the located state: the ones of the
 * trigger types that are past their threshold (or, if rearming moved a threshold, the closest of each type).
 */
function firedValues(c: Ctx, ev: SimEvent, prev: Segment): FiredValue[] {
  const sys = c.sys, model = sys.model
  const fns = buildEventFns(sys, prev.mode, computePoses(model, prev.X0), solveMode(sys, prev.X0, prev.mode), prev.X0)
  const poses = computePoses(model, ev.before)
  const sol = solveMode(sys, ev.before, prev.mode, poses)
  const values = fns.map(f => f.value(poses, sol, ev.before))
  const who = (k: number): string => {
    const f = fns[k]
    if (f.unit >= 0) { const p = prev.mode.units[f.unit].pair; return `${p.X.name}–${p.Y.name}` }
    if (f.probe) return `${f.probe.A.name} → ${f.probe.B.name}`
    if (f.rope >= 0) return model.ropes[f.rope].name
    if (f.sw >= 0) return model.forces[model.switchForce[f.sw]].name
    return ''
  }
  const unitOf = (k: number): string => {
    const f = fns[k]
    if (f.type === 'leave' && f.unit >= 0 && prev.mode.units[f.unit].points[f.point]?.kind !== 'pf') return ''
    return TRIGGER_TEXT[f.type].unit
  }
  const out: FiredValue[] = []
  for (const type of ev.triggers) {
    const idx = fns.map((_, k) => k).filter(k => fns[k].type === type)
    let hit = idx.filter(k => values[k] < fns[k].threshold)
    if (!hit.length && idx.length) hit = [idx.reduce((a, b) => (values[b] - fns[b].threshold < values[a] - fns[a].threshold ? b : a))]
    for (const k of hit) out.push({ type, who: who(k), value: values[k], threshold: fns[k].threshold, unit: unitOf(k) })
  }
  return out
}

/** Bilateral rows (hinges, rods) at the given poses, in the order of resolveImpact. */
function bilateralRows(sys: System, poses: Pose[]): RowJ[] {
  const model = sys.model
  const rows: RowJ[] = []
  for (const h of model.hinges) for (const k of hingeKin(poses, h.a, h.b)) rows.push(k.j)
  for (const r of model.rods) rows.push(distanceKin(poses, r.a, r.b).j)
  return rows
}

/**
 * Effective inverse mass matrix W_ij = d_i·M⁻¹(d_j + Bᵀλ_j) of the rows `d` with the bilateral rows B kept
 * satisfied (their impulses eliminated, as in the frictional impact of core/solver/impact.ts).
 */
function effectiveW(sys: System, poses: Pose[], d: RowJ[]): { W: number[][]; constrained: boolean } {
  const model = sys.model, n = sys.n
  const bil = bilateralRows(sys, poses)
  const nb = bil.length
  const Wbb = new Float64Array(nb * nb)
  for (let x = 0; x < nb; x++) for (let y = 0; y < nb; y++) Wbb[x * nb + y] = rowMinvRow(model, bil[x], bil[y])
  const response = (row: RowJ): Float64Array => {
    const G = new Float64Array(3 * n)
    addRow(G, row, 1)
    if (nb > 0) {
      const rhs = new Float64Array(nb)
      for (let x = 0; x < nb; x++) rhs[x] = -rowMinvRow(model, bil[x], row)
      const lam = solveDense(nb, Wbb, rhs).x
      for (let x = 0; x < nb; x++) addRow(G, bil[x], lam[x])
    }
    for (const b of model.dynamic) {
      const i = b.index
      G[3 * i] *= b.invMass; G[3 * i + 1] *= b.invMass; G[3 * i + 2] *= b.invInertia
    }
    return G
  }
  const R = d.map(response)
  const W = d.map(di => R.map(rj => rowDot(di, rj)))
  // Constrained: some bilateral row couples to the given rows
  const constrained = bil.some(b => d.some(di => Math.abs(rowMinvRow(model, b, di)) > 0))
  return { W, constrained }
}

/** One phase of Stronge's impulse path. */
interface StrongePhase { compression: boolean; s: number; dPn: number; Pn: number; Pt: number; vn: number; vt: number }

/**
 * Stronge's frictional impact (core/solver/impact.ts strongeImpact) step by step: the same phase logic and
 * arithmetic, recording every phase. Returns null where strongeImpact would.
 */
function strongeTrace(vn0: number, vt0: number, Wnn: number, Wnt: number, Wtt: number, e: number, muK: number, muS: number): { phases: StrongePhase[]; Pn: number; Pt: number; workC: number; end: 'slip' | 'stick' | 'reverse' } | null {
  if (![vn0, vt0, Wnn, Wnt, Wtt, e, muK, muS].every(Number.isFinite) || !(Wnn > 0) || !(Wtt > 0)) return null
  const stickable = Math.abs(Wnt) <= muS * Wtt
  const afterZero = (): number => (stickable ? 0 : Wnt > 0 ? 1 : -1)
  let s = Math.abs(vt0) > TOL.vel ? (vt0 > 0 ? 1 : -1) : afterZero()
  const s0 = s
  let Pn = 0, Pt = 0, vn = vn0, vt = vt0, work = 0, workC = 0
  let compressing = vn < 0
  let need = 0
  const phases: StrongePhase[] = []
  if (!compressing) return { phases, Pn: 0, Pt: 0, workC: 0, end: s === 0 ? 'stick' : 'slip' }
  for (let phase = 0; phase < 8; phase++) {
    const slope = s === 0 ? -Wnt / Wtt : -muK * s
    const kap = Wnn + Wnt * slope
    const rho = s === 0 ? 0 : Wnt + Wtt * slope
    const go = (d: number) => {
      work += vn * d + 0.5 * kap * d * d
      Pn += d; Pt += slope * d; vn += kap * d; vt += rho * d
      phases.push({ compression: compressing, s, dPn: d, Pn, Pt, vn, vt })
    }
    const fix = () => { const p = phases[phases.length - 1]; p.vn = vn; p.vt = vt }
    let dTrans = s !== 0 && s * rho < 0 ? -vt / rho : Infinity
    if (s === 0 && !(kap > 1e-9 * Wnn)) {
      if (compressing && vn < -1e-9 * (Math.abs(vn0) + Math.abs(vt0))) return null
      compressing = false
      need = 0
      vn = Math.max(vn, 0)
      break
    }
    if (compressing) {
      const dC = kap > 0 ? -vn / kap : Infinity
      if (!(dC <= dTrans)) {
        if (!Number.isFinite(dTrans)) return null
        go(dTrans); vt = 0; fix(); s = afterZero()
        continue
      }
      go(dC); vn = 0; fix()
      compressing = false
      workC = work
      need = -e * e * work
      dTrans -= dC
      if (!(need > 0)) break
    }
    const disc = vn * vn + 2 * kap * need
    const dR = disc >= 0 ? 2 * need / (vn + Math.sqrt(disc)) : Infinity
    if (dR <= dTrans) { go(dR); need = 0; break }
    if (!Number.isFinite(dTrans)) return null
    const before = work
    go(dTrans); vt = 0; fix()
    need -= work - before
    s = afterZero()
  }
  if (compressing || need > 1e-12 * Math.abs(work)) return null
  const end = s === 0 ? 'stick' : s === s0 ? 'slip' : 'reverse'
  return { phases, Pn, Pt, workC, end }
}

const close = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(Math.abs(a), Math.abs(b), 1e-12)

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

function triggerSection(c: Ctx, ev: SimEvent, prev: Segment | null): DetailSection {
  const blocks: DetailBlock[] = []
  for (const type of ev.triggers) {
    const t = TRIGGER_TEXT[type]
    blocks.push({ kind: 'subhead', text: c.tr(t.name) })
    blocks.push({ kind: 'equation', tex: t.g, text: c.tr(t.meaning) })
  }
  if (!ev.triggers.length) blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.noTrigger) })
  if (prev && !prev.reduced && ev.triggers.length) {
    try {
      const fired = firedValues(c, ev, prev)
      if (fired.length) {
        blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.fired) })
        blocks.push({
          kind: 'table', head: ['', c.tr(EVENT_TEXT.object), c.tr(EVENT_TEXT.gValue), c.tr(EVENT_TEXT.threshold)], align: ['left', 'left', 'right', 'right'],
          rows: fired.map(f => [{ text: c.tr(TRIGGER_TEXT[f.type].name) }, { text: f.who }, { text: c.q(f.value, f.unit, 3), mono: true }, { text: c.q(f.threshold, f.unit, 3), mono: true }])
        })
      }
    } catch { /* The event functions are an illustration; a failure leaves them out */ }
  }
  return { id: 'trigger', title: c.tr(EVENT_TEXT.trigger), blocks }
}

function locateSection(c: Ctx, ev: SimEvent, reduced: boolean): DetailSection {
  const blocks: DetailBlock[] = []
  const tol = '10^{-12}\\,\\mathrm{s}'
  blocks.push({ kind: 'table', rows: [[{ text: c.tr(EVENT_TEXT.eventTime) }, { tex: `t_E = ${latexQuantity(ev.t, 's', c.units, 13)}` }]], align: ['left', 'right'] })
  const timestep = ev.changes.some(ch => ch.type === 'timestep')
  if (timestep) blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.fallback) })
  else if (reduced) blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.reduced), tone: 'warn' })
  else if (ev.t === 0 && ev.index === 0) blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.initial) })
  else {
    blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.method, { tol }) })
    blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.precision, { tol }) })
    const k = ev.t / c.rec.dt
    if (Math.abs(k - Math.round(k)) < 1e-9) blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.grid), small: true })
    blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.hysteresis), small: true })
  }
  if (!timestep) blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.after), small: true })
  return { id: 'locate', title: c.tr(EVENT_TEXT.locate), blocks }
}

function changeWho(c: Ctx, ch: ChangeDetail): string {
  if (ch.bodies.length) return ch.bodies.map(id => nameOf(c.sys, id)).join(' – ')
  return ch.subject && ch.subject !== 'solver' ? nameOf(c.sys, ch.subject) : ''
}

function changesSection(c: Ctx, ev: SimEvent): DetailSection {
  const blocks: DetailBlock[] = []
  for (const ch of ev.changes) {
    const t = CHANGE_TEXT[ch.type]
    const who = changeWho(c, ch)
    blocks.push({ kind: 'subhead', text: `${c.tr(t.name)}${who ? ` · ${who}` : ''}` })
    blocks.push({ kind: 'text', text: c.tr(t.text) })
    if (ch.type === 'switch' && ch.switchIndex !== undefined) {
      const model = c.sys.model
      const f = model.forces.find(x => x.id === ch.subject)
      const def = model.switches[ch.switchIndex]
      const expr = f?.expr ? `Fx = ${f.expr.x.src}, Fy = ${f.expr.y.src}` : ''
      blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.switchInfo, { f: f?.name ?? ch.subject, k: `${def?.kind ?? ''} · ${c.tr(ch.kink ? EVENT_TEXT.switchKink : EVENT_TEXT.switchJump)}`, b: ch.branch ?? 0, e: expr }), small: true })
    }
    blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.lawLabel, { l: c.tr(t.law) }), small: true, tone: 'info' })
  }
  if (!ev.changes.length) blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.noTrigger) })
  return { id: 'changes', title: c.tr(EVENT_TEXT.changes), blocks }
}

/** Blocks of one impact point (contact or rope). */
function impactBlocks(c: Ctx, ev: SimEvent, ch: ChangeDetail, p: ImpactPoint, single: boolean): DetailBlock[] {
  const sys = c.sys, model = sys.model, n = sys.n
  const blocks: DetailBlock[] = []
  const d = c.digits
  const u = p.vnBefore
  const e = p.restitution
  const poses = computePoses(model, ev.before)
  if (p.kind === 'rope') {
    const rope = model.ropes[p.rope]
    blocks.push({ kind: 'subhead', text: `${c.tr(CHANGE_TEXT.taut.name)} · ${rope?.name ?? ''}` })
    blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.rope) })
    blocks.push({ kind: 'equation', tex: `v_{\\parallel}^{-} = ${siTex(c, u, 'm/s')} \\;\\rightarrow\\; v_{\\parallel}^{+} = 0` })
    blocks.push({ kind: 'text', text: `${c.tr(EVENT_TEXT.recordedRope)} ${c.q(p.vnAfter, 'm/s')}`, small: true })
    if (single && rope) {
      const { W } = effectiveW(sys, poses, [ropeKin(poses, rope).j])
      const Wv = W[0][0]
      blocks.push({ kind: 'chain', lhs: 'J', rhs: ['\\dfrac{-v_{\\parallel}^{-}}{W}', `\\dfrac{-${texNum(u, d)}\\,\\mathrm{m/s}}{${latexNumber(Wv, d)}\\,\\mathrm{kg^{-1}}}`, siTex(c, -u / Wv, 'N·s')] })
    }
    blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.recordedImpulse, { j: c.q(p.impulse, 'N·s') }), small: true })
    return blocks
  }
  const feature = p.feature
  const A = feature?.A.body, B = feature?.B.body
  const nameA = A?.name ?? '', nameB = B?.name ?? ''
  blocks.push({ kind: 'subhead', text: `${c.tr(CHANGE_TEXT.impact.name)} · ${nameA} – ${nameB}` })
  blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.bodiesAB, { a: nameA, b: nameB }), small: true })
  blocks.push({ kind: 'equation', tex: `\\vec n = \\left(${latexNumber(p.nx, d)},\\ ${latexNumber(p.ny, d)}\\right),\\quad v_n^{-} = ${siTex(c, u, 'm/s')}` })
  // Restitution
  blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.restitution) })
  const target = -e * u
  blocks.push({ kind: 'chain', lhs: 'v_n^{+}', rhs: ['-e\\,v_n^{-}', `-${latexNumber(e, d)} \\times ${texNum(u, d)}\\,\\mathrm{m/s}`, siTex(c, target, 'm/s')] })
  if (-u < TOL.zeno && ch.restitution === 0) blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.zeno), small: true })
  blocks.push({ kind: 'text', text: `${c.tr(EVENT_TEXT.recordedAfter)} $v_n^+$ = ${c.q(p.vnAfter, 'm/s')}`, small: true })
  const frictional = p.tangentImpulse !== undefined
  // Impulse (single contact): J = −(1 + e) v_n⁻ / W_nn
  if (single && feature) {
    const kin = contactKin(feature, poses)
    const rows = frictional ? [kin.jn, kin.jt] : [kin.jn]
    const { W, constrained } = effectiveW(sys, poses, rows)
    const Wnn = W[0][0]
    blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.impulseText) })
    if (constrained) {
      blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.constrained), small: true })
      const hinged = hingedTerms(c, poses, A, B, kin.jn.aw, -kin.jn.bw, p.cx, p.cy, p.nx, p.ny)
      if (hinged && close(hinged.value, Wnn)) blocks.push({ kind: 'chain', lhs: 'W_{nn}', rhs: [hinged.sym, hinged.num, `${latexNumber(Wnn, d)}\\,\\mathrm{kg^{-1}}`] })
      else blocks.push({ kind: 'equation', tex: `W_{nn} = ${latexNumber(Wnn, d)}\\,\\mathrm{kg^{-1}}` })
    } else {
      // W_nn = 1/m_A + (r_A×n)²/I_A + 1/m_B + (r_B×n)²/I_B for the dynamic bodies
      const sym: string[] = [], num: string[] = []
      const term = (b: typeof A, w: number, label: string) => {
        if (!b || !b.dynamic) return
        sym.push(`\\dfrac{1}{m_${label}}`); num.push(`\\dfrac{1}{${siTex(c, b.mass, 'kg')}}`)
        if (b.invInertia > 0 && Math.abs(w) > 1e-12) {
          sym.push(`\\dfrac{\\left(\\vec r_${label}\\times\\vec n\\right)^2}{I_${label}}`)
          num.push(`\\dfrac{${texNum(w, d)}^2\\,\\mathrm{m^2}}{${siTex(c, b.inertia, 'kg·m²')}}`)
        }
      }
      term(A, kin.jn.aw, 'A')
      term(B, -kin.jn.bw, 'B')
      blocks.push({ kind: 'chain', lhs: 'W_{nn}', rhs: [sym.join(' + '), num.join(' + '), `${latexNumber(Wnn, d)}\\,\\mathrm{kg^{-1}}`] })
    }
    const Jn = frictional ? p.impulse : -(1 + e) * u / Wnn
    if (!frictional) {
      blocks.push({ kind: 'chain', lhs: 'J', rhs: ['\\dfrac{-(1 + e)\\,v_n^{-}}{W_{nn}}', `\\dfrac{-(1 + ${latexNumber(e, d)}) \\times ${texNum(u, d)}\\,\\mathrm{m/s}}{${latexNumber(Wnn, d)}\\,\\mathrm{kg^{-1}}}`, siTex(c, Jn, 'N·s')] })
    }
    blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.recordedImpulse, { j: c.q(p.impulse, 'N·s') }), small: true })
    if (frictional) blocks.push(...frictionBlocks(c, p, W, u))
    // Velocity changes of the free bodies (no constraint impulses)
    if (!constrained) {
      blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.dv) })
      const Jt = p.tangentImpulse ?? 0
      const tx = -p.ny, ty = p.nx
      for (const [b, sign, label] of [[A, 1, 'A'], [B, -1, 'B']] as const) {
        if (!b || !b.dynamic) continue
        const i = b.index
        const lawSym = frictional ? `${sign > 0 ? '' : '-'}\\dfrac{J_n\\vec n + J_t\\vec t}{m_${label}}` : `${sign > 0 ? '' : '-'}\\dfrac{J}{m_${label}}\\vec n`
        const vx = sign * (p.impulse * p.nx + Jt * tx) / b.mass, vy = sign * (p.impulse * p.ny + Jt * ty) / b.mass
        const vec = (x: number, y: number) => `\\left(${latexNumber(x, d)},\\ ${latexNumber(y, d)}\\right)`
        const numeric = frictional
          ? `${sign > 0 ? '' : '-'}\\dfrac{${latexNumber(p.impulse, d)} \\times ${vec(p.nx, p.ny)} + ${texNum(Jt, d)} \\times ${vec(tx, ty)}}{${latexNumber(b.mass, d)}}`
          : `${sign > 0 ? '' : '-'}\\dfrac{${latexNumber(p.impulse, d)}\\,\\mathrm{N\\cdot s}}{${siTex(c, b.mass, 'kg')}} \\times ${vec(p.nx, p.ny)}`
        blocks.push({ kind: 'chain', lhs: `\\Delta\\vec v_${label}`, rhs: [lawSym, numeric, `${vec(vx, vy)}\\,\\mathrm{m/s}`] })
        if (b.invInertia > 0) {
          const w = ev.after[3 * n + 3 * i + 2] - ev.before[3 * n + 3 * i + 2]
          blocks.push({ kind: 'chain', lhs: `\\Delta\\omega_${label}`, rhs: [frictional ? `${sign > 0 ? '' : '-'}\\dfrac{\\vec r_${label}\\times(J_n\\vec n + J_t\\vec t)}{I_${label}}` : `${sign > 0 ? '' : '-'}\\dfrac{(\\vec r_${label}\\times\\vec n)\\,J}{I_${label}}`, siTex(c, w, 'rad/s')] })
        }
      }
      // Momentum of two free bodies
      if (A?.dynamic && B?.dynamic && !attachedImpulsive(sys, A.id) && !attachedImpulsive(sys, B.id)) {
        const p0 = momentum(sys, ev.before, [A.index, B.index]), p1 = momentum(sys, ev.after, [A.index, B.index])
        blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.momentum) })
        blocks.push({ kind: 'chain', lhs: '\\vec p^{-}', rhs: ['m_A\\vec v_A^{-} + m_B\\vec v_B^{-}', `\\left(${latexNumber(p0[0], d)},\\ ${latexNumber(p0[1], d)}\\right)\\,\\mathrm{kg\\cdot m/s}`] })
        blocks.push({ kind: 'chain', lhs: '\\vec p^{+}', rhs: ['m_A\\vec v_A^{+} + m_B\\vec v_B^{+}', `\\left(${latexNumber(p1[0], d)},\\ ${latexNumber(p1[1], d)}\\right)\\,\\mathrm{kg\\cdot m/s}`] })
      }
    }
  }
  return blocks
}

/**
 * W_nn written with the textbook terms when each body is free or turns about one fixed hinge: a free body adds
 * 1/m + (r × n)²/I (I about its centre of mass), a hinged one (r_O × n)²/I_O with I_O = I + m·|OC|² (parallel-axis
 * theorem) and r_O from the pivot O to the contact point. Null when a body is constrained otherwise.
 */
function hingedTerms(c: Ctx, poses: Pose[], A: BodyModel | undefined, B: BodyModel | undefined, wA: number, wB: number, cx: number, cy: number, nx: number, ny: number): { sym: string; num: string; value: number } | null {
  const model = c.sys.model, d = c.digits
  const sym: string[] = [], num: string[] = []
  let value = 0
  for (const [b, w, label] of [[A, wA, 'A'], [B, wB, 'B']] as const) {
    if (!b || !b.dynamic) continue
    const on = (a: { body: BodyModel | null }) => a.body?.id === b.id
    const hinges = model.hinges.filter(h => on(h.a) || on(h.b))
    if (model.rods.some(r => on(r.a) || on(r.b)) || model.ropes.some(r => on(r.a) || on(r.b))) return null
    if (hinges.length === 0) {
      sym.push(`\\dfrac{1}{m_${label}}`); num.push(`\\dfrac{1}{${siTex(c, b.mass, 'kg')}}`)
      value += b.invMass
      if (b.invInertia > 0 && Math.abs(w) > 1e-12) {
        sym.push(`\\dfrac{\\left(\\vec r_${label}\\times\\vec n\\right)^2}{I_${label}}`)
        num.push(`\\dfrac{${texNum(w, d)}^2\\,\\mathrm{m^2}}{${siTex(c, b.inertia, 'kg·m²')}}`)
        value += w * w * b.invInertia
      }
      continue
    }
    if (hinges.length !== 1) return null
    const h = hinges[0]
    const other = on(h.a) ? h.b : h.a
    if (other.body && other.body.dynamic) return null
    const mine = on(h.a) ? h.a : h.b
    const pose = poses[b.global]
    const ox = pose.x + pose.c * mine.local.x - pose.s * mine.local.y, oy = pose.y + pose.s * mine.local.x + pose.c * mine.local.y
    const rx = cx - ox, ry = cy - oy
    const arm = rx * ny - ry * nx
    const IO = b.inertia + b.mass * ((pose.x - ox) ** 2 + (pose.y - oy) ** 2)
    sym.push(`\\dfrac{\\left(\\vec r_{O${label}}\\times\\vec n\\right)^2}{I_{O${label}}}`)
    num.push(`\\dfrac{${texNum(arm, d)}^2\\,\\mathrm{m^2}}{${siTex(c, IO, 'kg·m²')}}`)
    value += arm * arm / IO
  }
  return sym.length ? { sym: sym.join(' + '), num: num.join(' + '), value } : null
}

/** Friction impulse and Stronge phases of a single frictional contact. */
function frictionBlocks(c: Ctx, p: ImpactPoint, W: number[][], u: number): DetailBlock[] {
  const blocks: DetailBlock[] = []
  const d = c.digits
  const end = p.friction ?? 'slip'
  const endText = c.tr(end === 'stick' ? EVENT_TEXT.endStick : end === 'reverse' ? EVENT_TEXT.endReverse : EVENT_TEXT.endSlip)
  blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.friction) })
  const mat = p.pair?.material
  const muK = mat?.muK ?? 0, muS = Math.max(mat?.muS ?? 0, muK)
  const Wnn = W[0][0], Wnt = 0.5 * (W[0][1] + W[1][0]), Wtt = W[1][1]
  blocks.push({ kind: 'equation', tex: `W = \\begin{pmatrix} W_{nn} & W_{nt} \\\\ W_{nt} & W_{tt} \\end{pmatrix} = \\begin{pmatrix} ${latexNumber(Wnn, d)} & ${latexNumber(Wnt, d)} \\\\ ${latexNumber(Wnt, d)} & ${latexNumber(Wtt, d)} \\end{pmatrix}\\,\\mathrm{kg^{-1}},\\quad \\mu_k = ${latexNumber(muK, d)},\\ \\mu_s = ${latexNumber(muS, d)}` })
  const vt0 = p.vtBefore ?? 0
  const tr = strongeTrace(u, vt0, Wnn, Wnt, Wtt, p.restitution, muK, muS)
  const Jt = p.tangentImpulse ?? 0
  if (tr && close(tr.Pn, p.impulse) && close(tr.Pt, Jt) && tr.phases.length) {
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

/** Whether a body is attached to a hinge, rod or rope (connectors that act with impulses). */
function attachedImpulsive(sys: System, id: string): boolean {
  const m = sys.model
  const on = (a: { body: { id: string } | null }) => a.body?.id === id
  return m.hinges.some(h => on(h.a) || on(h.b)) || m.rods.some(r => on(r.a) || on(r.b)) || m.ropes.some(r => on(r.a) || on(r.b) || r.pulleys.some(pp => pp.pulley.body?.id === id))
}

function momentum(sys: System, X: Float64Array, idx: number[]): [number, number] {
  const n = sys.n
  let px = 0, py = 0
  for (const i of idx) { const b = sys.model.dynamic[i]; px += b.mass * X[3 * n + 3 * i]; py += b.mass * X[3 * n + 3 * i + 1] }
  return [px, py]
}

function impactSection(c: Ctx, ev: SimEvent): DetailSection | null {
  const imp = ev.impact
  if (!imp) return null
  const blocks: DetailBlock[] = []
  const points = imp.points
  const single = points.length === 1
  if (!single) {
    blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.multi) })
    blocks.push({
      kind: 'table', head: [c.tr(EVENT_TEXT.point), 'e', 'vₙ⁻', 'vₙ⁺', 'J'], align: ['left', 'right', 'right', 'right', 'right'],
      rows: points.map(p => [
        { text: p.kind === 'rope' ? c.sys.model.ropes[p.rope]?.name ?? '' : `${p.feature?.A.body.name ?? ''} – ${p.feature?.B.body.name ?? ''}` },
        { text: String(Number(p.restitution.toPrecision(c.digits))), mono: true },
        { text: c.q(p.vnBefore, 'm/s'), mono: true }, { text: c.q(p.vnAfter, 'm/s'), mono: true }, { text: c.q(p.impulse, 'N·s'), mono: true }
      ])
    })
  }
  for (const p of points) {
    const ch = ev.changes.find(x => (p.kind === 'contact' ? x.type === 'impact' && x.subject === p.pair?.key : x.type === 'taut' && x.subject === c.sys.model.ropes[p.rope]?.id)) ?? null
    if (!ch) continue
    blocks.push(...impactBlocks(c, ev, ch, p, single))
  }
  if (imp.warning) blocks.push({ kind: 'text', text: renderMessage(imp.warning, c.lang), tone: 'warn', small: true })
  blocks.push({ kind: 'text', text: c.tr(EVENT_TEXT.energyLoss) })
  blocks.push({ kind: 'chain', lhs: '\\Delta E_k', rhs: ['E_k^{-} - E_k^{+}', `${siTex(c, imp.energyBefore, 'J')} - ${siTex(c, imp.energyAfter, 'J')}`, siTex(c, imp.loss, 'J')] })
  return { id: 'impact', title: c.tr(EVENT_TEXT.impact), blocks }
}

/** Bodies an event concerns (dynamic ones; all dynamic bodies for a solver switch), at most four. */
function involvedBodies(c: Ctx, ev: SimEvent): number[] {
  const model = c.sys.model
  const ids = new Set<string>()
  for (const ch of ev.changes) {
    for (const id of ch.bodies) ids.add(id)
    if (ch.type === 'switch') { const f = model.forces.find(x => x.id === ch.subject); if (f?.a.body) ids.add(f.a.body.id) }
    if (ch.type === 'slack' || ch.type === 'taut') { const r = model.ropes.find(x => x.id === ch.subject); if (r) for (const a of [r.a, r.b]) if (a.body) ids.add(a.body.id) }
  }
  let list = [...ids].map(id => model.byId.get(id)).filter(b => b && b.dynamic).map(b => b!.index)
  if (!list.length) list = model.dynamic.map(b => b.index)
  return list.slice(0, 4)
}

/** Relative size below which a before/after difference is shown as "no change" (rounding, projection). */
const CHANGED = 1e-9
/** Rounding noise (|v| < 10⁻¹² in SI) is shown as 0 in the before/after tables. */
const snap = (v: number | null) => (v !== null && Math.abs(v) < 1e-12 ? 0 : v)

function stateSection(c: Ctx, ev: SimEvent, prev: Segment | null, next: Segment | null): DetailSection {
  const sys = c.sys, model = sys.model, n = sys.n
  const blocks: DetailBlock[] = []
  const jumped = !!ev.impact
  blocks.push({ kind: 'text', text: c.tr(jumped ? EVENT_TEXT.jump : EVENT_TEXT.continuous), small: true })
  const acc = (seg: Segment | null, X: Float64Array): Float64Array | null => {
    if (!seg) return null
    try { return solveMode(sys, X, seg.mode).acc } catch { return null }
  }
  const a0 = acc(prev, ev.before), a1 = acc(next, ev.after)
  const head = [c.tr(EVENT_TEXT.quantity), c.tr(EVENT_TEXT.before), c.tr(EVENT_TEXT.after2), c.tr(EVENT_TEXT.change)]
  const align: Array<'left' | 'right'> = ['left', 'right', 'right', 'right']
  for (const i of involvedBodies(c, ev)) {
    const b = model.dynamic[i]
    const rows: DetailCell[][] = []
    const row = (label: string, sym: string, v0: number | null, v1: number | null, unit: string) => {
      const diff = v0 !== null && v1 !== null ? v1 - v0 : null
      const changed = diff !== null && Math.abs(diff) > CHANGED * Math.max(1, Math.abs(v0!), Math.abs(v1!))
      rows.push([{ text: label, tex: sym }, { text: c.q(snap(v0), unit), mono: true }, { text: c.q(snap(v1), unit), mono: true }, { text: changed ? c.q(diff, unit, 3) : '—', mono: true, tone: changed ? 'info' : undefined }])
    }
    const B = ev.before, A = ev.after
    row(`${c.tr(EVENT_TEXT.position)} `, 'x', B[3 * i], A[3 * i], 'm')
    row(`${c.tr(EVENT_TEXT.position)} `, 'y', B[3 * i + 1], A[3 * i + 1], 'm')
    if (b.invInertia > 0) row(`${c.tr(EVENT_TEXT.angle)} `, '\\theta', B[3 * i + 2], A[3 * i + 2], 'rad')
    row(`${c.tr(EVENT_TEXT.velocity)} `, 'v_x', B[3 * n + 3 * i], A[3 * n + 3 * i], 'm/s')
    row(`${c.tr(EVENT_TEXT.velocity)} `, 'v_y', B[3 * n + 3 * i + 1], A[3 * n + 3 * i + 1], 'm/s')
    row(`${c.tr(EVENT_TEXT.speed)} `, '|\\vec v|', Math.hypot(B[3 * n + 3 * i], B[3 * n + 3 * i + 1]), Math.hypot(A[3 * n + 3 * i], A[3 * n + 3 * i + 1]), 'm/s')
    if (b.invInertia > 0) row(`${c.tr(EVENT_TEXT.omega)} `, '\\omega', B[3 * n + 3 * i + 2], A[3 * n + 3 * i + 2], 'rad/s')
    row(`${c.tr(EVENT_TEXT.accel)} `, 'a_x', a0 ? a0[3 * i] : null, a1 ? a1[3 * i] : null, 'm/s²')
    row(`${c.tr(EVENT_TEXT.accel)} `, 'a_y', a0 ? a0[3 * i + 1] : null, a1 ? a1[3 * i + 1] : null, 'm/s²')
    if (b.invInertia > 0) row(`${c.tr(EVENT_TEXT.beta)} `, '\\beta', a0 ? a0[3 * i + 2] : null, a1 ? a1[3 * i + 2] : null, 'rad/s²')
    const ek = (X: Float64Array) => 0.5 * b.mass * (X[3 * n + 3 * i] ** 2 + X[3 * n + 3 * i + 1] ** 2) + 0.5 * b.inertia * (b.invInertia > 0 ? X[3 * n + 3 * i + 2] ** 2 : 0)
    row(`${c.tr(EVENT_TEXT.ek)} `, 'E_k', ek(B), ek(A), 'J')
    blocks.push({ kind: 'subhead', text: b.name })
    blocks.push({ kind: 'table', head, rows, align })
  }
  // System energies
  const e0 = energy(sys, ev.before), e1 = energy(sys, ev.after)
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

/**
 * Build the detail view of event `eventIndex` (index into `rec.events`) in language `lang`. Values are shown in the
 * display units of `opts.units`; impact equations are written in SI, like the substitutions of the formulas.
 */
export function buildEventDetail(rec: Recording, eventIndex: number, lang: Lang, opts: DetailOptions = {}): DetailView {
  const units = opts.units ?? defaultChoice()
  const digits = opts.digits ?? 4
  const tr = (t: Tri, params?: Record<string, string | number>) => fillParams(triText(t, lang), params)
  const c: Ctx = {
    rec, sys: rec.system, lang, digits, units, tr,
    q: (v, unit, nd = digits) => formatQuantity(v, unit, choiceFor(units, unit), nd)
  }
  const ev = rec.events[eventIndex]
  if (!ev) return { kind: 'event', title: tr(EVENT_TEXT.event), subtitle: '', headline: null, badges: [], sections: [{ id: 'missing', title: tr(EVENT_TEXT.event), blocks: [{ kind: 'text', text: tr(EVENT_TEXT.missing, { i: eventIndex }), tone: 'warn' }] }] }
  const prev = ev.index === 0 && ev.t === 0 && ev.segment === 0 ? null : segmentByIndex(rec, ev.segment - 1)
  const next = segmentByIndex(rec, ev.segment)
  const reduced = rec.reducedFrom != null && ev.t > rec.reducedFrom + 1e-12
  const names = [...new Set(ev.changes.map(ch => changeName(c, ch)))]
  if (!names.length) names.push(...new Set(ev.triggers.map(t => tr(TRIGGER_TEXT[t].name))))
  const who = [...new Set(ev.changes.map(ch => changeWho(c, ch)).filter(Boolean))].join(lang === 'zh' ? '；' : '; ')
  const sections: DetailSection[] = [triggerSection(c, ev, prev), locateSection(c, ev, reduced), changesSection(c, ev)]
  const impact = impactSection(c, ev)
  if (impact) sections.push(impact)
  sections.push(stateSection(c, ev, prev, next))
  const headline = ev.impact && ev.changes.some(ch => ch.type === 'impact') ? 'v_n^{+} = -e\\,v_n^{-}' : ev.triggers.length ? TRIGGER_TEXT[ev.triggers[0]].g : null
  const badges: Array<{ text: string; tone: Tone }> = ev.triggers.map(t => ({ text: tr(TRIGGER_TEXT[t].name), tone: 'info' as Tone }))
  if (reduced || ev.changes.some(ch => ch.type === 'timestep')) badges.push({ text: tr(CHANGE_TEXT.timestep.name), tone: 'warn' })
  return {
    kind: 'event',
    title: names.join(lang === 'zh' ? '、' : ', ') || tr(EVENT_TEXT.event),
    subtitle: `${who ? `${who} · ` : ''}t = ${formatQuantity(ev.t, 's', units, Math.max(digits, 9))}`,
    headline,
    badges,
    sections
  }
}
