/**
 * Derivations of the variable-force formulas (situation "var-force": body of mass m driven along x by a force
 * F_x(t) that depends on time only, on a smooth surface or free; v₀ and x₀ at the start t₀ of the phase).
 * Manual 26.50, D28.
 */
import type { Derivation, SharedSteps } from './types'
import { B, step, tri } from './b-common'

/** Shared step list: Newton's second law along x. */
export const SHARED_VAR_FORCE: SharedSteps[] = [
  {
    id: 'var-force.newton',
    title: tri('x 方向的牛顿第二定律', "Newton's second law along x", 'Zweites Newtonsches Gesetz in x-Richtung'),
    steps: [
      step('m\\dfrac{\\mathrm{d}v_x}{\\mathrm{d}t} = F_x(t)',
        tri('物体在光滑水平面上（或悬空）运动，竖直方向的力不影响 x 方向的运动；x 方向只受变力的分力 F_x(t)，它只随时间变化。',
          'The body moves on a smooth horizontal surface (or freely); vertical forces do not affect the motion along x, where only the component F_x(t) of the variable force acts, a function of time alone.',
          'Der Körper bewegt sich auf einer reibungsfreien waagerechten Unterlage (oder frei); senkrechte Kräfte beeinflussen die Bewegung in x-Richtung nicht. In x-Richtung wirkt nur die Komponente F_x(t) der veränderlichen Kraft, die nur von der Zeit abhängt.'),
        tri('牛顿第二定律（x 方向）', "Newton's second law (x direction)", 'Zweites Newtonsches Gesetz (x-Richtung)'),
        'm*ax = Fx', { ax: 'm/s²', Fx: 'N' })
    ]
  }
]

const DISPLACEMENT = tri('位移等于速度对时间的积分（v–t 图线下的面积）', 'Displacement as the time integral of velocity (area under the v–t graph)', 'Verschiebung als Zeitintegral der Geschwindigkeit (Fläche unter dem v-t-Graphen)')

/** Derivations of vf.J, vf.v, vf.x, vf.W, vf.sin.v and vf.sin.x. */
export const DERIVATIONS_VAR_FORCE: Derivation[] = [
  {
    formula: 'vf.J',
    title: tri('动量定理（变力的冲量）', 'Impulse–momentum theorem (impulse of a variable force)', 'Impulssatz (Kraftstoß einer veränderlichen Kraft)'),
    note: tri('积分对表达式数值求积（与求解器无关），不连续处分段',
      'The integral is evaluated by numerical quadrature of the expression (independent of the solver), split at discontinuities',
      'Das Integral wird durch numerische Integration des Ausdrucks berechnet (unabhängig vom Löser), an Unstetigkeitsstellen aufgeteilt'),
    uses: ['var-force.newton'],
    steps: [
      step('m\\,\\mathrm{d}v_x = F_x(t)\\,\\mathrm{d}t',
        tri('两边乘以 dt：在极短的时间 dt 内力可看作恒力，动量的微小变化等于 F_x dt。',
          'Multiply by dt: during a very short time dt the force can be treated as constant, and the small change of momentum equals F_x dt.',
          'Mit dt multiplizieren: In einer sehr kurzen Zeit dt kann die Kraft als konstant gelten; die kleine Impulsänderung ist F_x dt.'),
        tri('微元法', 'Dividing into small time steps', 'Zerlegung in kleine Zeitabschnitte'),
        'm*dv = Fx*dt', { dv: 'm/s', Fx: 'N', dt: 's' }),
      step('mv_x - mv_0 = \\int_{t_0}^{t} F_x\\,\\mathrm{d}t',
        tri('从本段开始时刻 t₀ 到 t 求和（积分）：动量的变化等于变力的冲量，即 F–t 图线与时间轴所围的面积。',
          'Summing (integrating) from the start of the phase t₀ to t: the change of momentum equals the impulse of the variable force, the area under the F–t graph.',
          'Aufsummieren (integrieren) vom Beginn des Abschnitts t₀ bis t: Die Impulsänderung ist gleich dem Kraftstoß der veränderlichen Kraft, der Fläche unter dem F-t-Graphen.'),
        B.impulse, 'm*vx - m*v0 = J', { vx: 'm/s' })
    ]
  },
  {
    formula: 'vf.v',
    title: tri('速度', 'Velocity', 'Geschwindigkeit'),
    uses: ['var-force.newton'],
    steps: [
      step('mv_x - mv_0 = \\int_{t_0}^{t} F_x\\,\\mathrm{d}t',
        tri('由动量定理（见“动量定理（变力的冲量）”）。',
          'From the impulse–momentum theorem (see “Impulse–momentum theorem (impulse of a variable force)”).',
          'Aus dem Impulssatz (siehe „Impulssatz (Kraftstoß einer veränderlichen Kraft)“).'),
        B.impulse, 'm*vx - m*v0 = J', { vx: 'm/s' }),
      step('v_x = v_0 + \\dfrac{1}{m}\\int_{t_0}^{t} F_x\\,\\mathrm{d}t',
        tri('两边除以 m。', 'Divide by m.', 'Durch m teilen.'),
        B.rearrange, 'vx = v0 + J/m', { vx: 'm/s' })
    ]
  },
  {
    formula: 'vf.x',
    title: tri('位置', 'Position', 'Ort'),
    uses: ['var-force.newton'],
    steps: [
      step('v_x(s) = v_0 + \\dfrac{1}{m}\\int_{t_0}^{s}F_x(u)\\,\\mathrm{d}u',
        tri('任一时刻 s 的速度（见“速度”），积分变量改记为 u。',
          'The velocity at any time s (see “Velocity”); the integration variable is renamed u.',
          'Die Geschwindigkeit zu einem beliebigen Zeitpunkt s (siehe „Geschwindigkeit“); die Integrationsvariable heißt nun u.'),
        B.impulse, 'vs = v0 + Js/m', { vs: 'm/s', Js: 'N·s' }),
      step('x = x_0 + \\int_{t_0}^{t}v_x(s)\\,\\mathrm{d}s',
        tri('位置等于初位置加上位移，位移是速度对时间的积分。',
          'The position is the initial position plus the displacement, the time integral of the velocity.',
          'Der Ort ist der Anfangsort plus die Verschiebung, das Zeitintegral der Geschwindigkeit.'),
        DISPLACEMENT, 'x - x0 = vs*ds', { x: 'm', vs: 'm/s', ds: 's' }),
      step('x = x_0 + v_0(t - t_0) + \\dfrac{1}{m}\\int_{t_0}^{t}\\!\\int_{t_0}^{s}F_x(u)\\,\\mathrm{d}u\\,\\mathrm{d}s',
        tri('代入 v_x(s)。', 'Insert v_x(s).', 'v_x(s) einsetzen.'),
        B.previous, 'x = x0 + v0*(t - t0) + Js*ds/m', { x: 'm', Js: 'N·s', ds: 's' }),
      step('\\int_{t_0}^{t}\\!\\int_{t_0}^{s}F_x(u)\\,\\mathrm{d}u\\,\\mathrm{d}s = \\int_{t_0}^{t}(t - u)\\,F_x(u)\\,\\mathrm{d}u',
        tri('交换积分次序：时刻 u 的力 F_x(u) 对此后 [u, t] 内每一个 s 都有贡献，共计时长 t − u。',
          'Exchange the order of integration: the force F_x(u) at time u contributes for every later s in [u, t], i.e. for a time t − u.',
          'Integrationsreihenfolge vertauschen: Die Kraft F_x(u) zum Zeitpunkt u trägt zu jedem späteren s in [u, t] bei, also während der Zeit t − u.'),
        tri('交换积分次序', 'Exchanging the order of integration', 'Vertauschen der Integrationsreihenfolge'),
        'Js*ds = (t - u)*Fx*du', { Js: 'N·s', ds: 's', u: 's', Fx: 'N', du: 's' }),
      step('x = x_0 + v_0(t - t_0) + \\dfrac{1}{m}\\int_{t_0}^{t}(t - s)F_x(s)\\,\\mathrm{d}s',
        tri('代回，并把积分变量写回 s。最后一项是变力单独引起的位移。',
          'Insert, writing the integration variable as s again. The last term is the displacement caused by the variable force alone.',
          'Einsetzen und die Integrationsvariable wieder s nennen. Der letzte Term ist die allein durch die veränderliche Kraft bewirkte Verschiebung.'),
        B.previous, 'x = x0 + v0*(t - t0) + dx', { x: 'm' })
    ]
  },
  {
    formula: 'vf.W',
    title: tri('动能定理（变力做功）', 'Work–energy theorem (work of a variable force)', 'Arbeitssatz (Arbeit einer veränderlichen Kraft)'),
    uses: ['var-force.newton'],
    steps: [
      step('W = \\int F_x\\,\\mathrm{d}x',
        tri('物体在竖直方向没有位移，重力和支持力不做功，只有 F_x 做功。力在变化，不能用 W = Fs 计算，而要把位移分成许多小段 dx，对 F_x dx 求和。',
          'The body has no vertical displacement, so weight and normal force do no work; only F_x does. Since the force varies, W = Fs cannot be used: the displacement is divided into many small pieces dx and F_x dx is summed.',
          'Der Körper hat keine senkrechte Verschiebung; Gewichtskraft und Normalkraft verrichten keine Arbeit, nur F_x. Da sich die Kraft ändert, gilt W = F·s nicht: Man zerlegt die Verschiebung in viele kleine Stücke dx und summiert F_x dx.'),
        tri('功的定义（变力）', 'Definition of work (variable force)', 'Definition der Arbeit (veränderliche Kraft)'),
        'W = Fx*dX', { W: 'J', Fx: 'N', dX: 'm' }),
      step('F_x\\,\\mathrm{d}x = m\\dfrac{\\mathrm{d}v_x}{\\mathrm{d}t}\\,v_x\\,\\mathrm{d}t = mv_x\\,\\mathrm{d}v_x = \\mathrm{d}\\!\\left(\\tfrac12 mv_x^2\\right)',
        tri('代入牛顿第二定律 F_x = m dv_x/dt，并用 dx = v_x dt。',
          "Insert Newton's second law F_x = m dv_x/dt and use dx = v_x dt.",
          'Das zweite Newtonsche Gesetz F_x = m dv_x/dt einsetzen und dx = v_x dt verwenden.'),
        B.newton2, 'Fx*dX = m*vx*dv', { Fx: 'N', dX: 'm', vx: 'm/s', dv: 'm/s' }),
      step('W = \\tfrac12 mv_x^2 - \\tfrac12 mv_0^2',
        tri('对整个过程求和：变力做的功等于动能的变化（F–x 图线下的面积）。v_x 取“速度”公式的结果 v₀ + (1/m)∫F_x dt。',
          'Summed over the whole motion: the work done by the variable force equals the change of kinetic energy (the area under the F–x graph). v_x is taken from the formula “Velocity”, v₀ + (1/m)∫F_x dt.',
          'Über die ganze Bewegung summiert: Die Arbeit der veränderlichen Kraft ist gleich der Änderung der kinetischen Energie (Fläche unter dem F-x-Graphen). v_x stammt aus der Formel „Geschwindigkeit“, v₀ + (1/m)∫F_x dt.'),
        B.workEnergy, 'W = m*(v0 + J/m)^2/2 - m*v0^2/2', { W: 'J' })
    ]
  },
  {
    formula: 'vf.sin.v',
    title: tri('F = F₀ sin ωt 时的速度', 'Velocity for F = F₀ sin ωt', 'Geschwindigkeit für F = F₀ sin ωt'),
    uses: ['var-force.newton'],
    steps: [
      step('F_x = F_0\\sin\\omega t',
        tri('力按正弦规律随时间变化，t 为仿真时刻。',
          'The force varies sinusoidally with time; t is the simulation time.',
          'Die Kraft ändert sich sinusförmig mit der Zeit; t ist die Simulationszeit.'),
        tri('已知的力的表达式', 'Given force law', 'Gegebenes Kraftgesetz'),
        'Fx = F0*sin(omega*t)', { Fx: 'N' }),
      step('\\int_{t_0}^{t}F_0\\sin\\omega s\\,\\mathrm{d}s = \\dfrac{F_0}{\\omega}\\left(\\cos\\omega t_0 - \\cos\\omega t\\right)',
        tri('求冲量：−cos(ωs)/ω 是 sin ωs 的原函数。',
          'The impulse: −cos(ωs)/ω is an antiderivative of sin ωs.',
          'Der Kraftstoß: −cos(ωs)/ω ist eine Stammfunktion von sin ωs.'),
        B.antiderivative, 'J = F0/omega*(cos(omega*t0) - cos(omega*t))'),
      step('v_x = v_0 + \\dfrac{F_0}{m\\omega}\\left(\\cos\\omega t_0 - \\cos\\omega t\\right)',
        tri('代入动量定理 v_x = v₀ + (1/m)∫F_x dt。速度在平均值 v₀ + F₀cos(ωt₀)/(mω) 上下振荡，这个平均值一般不为零，所以物体总体上会向一侧漂移。',
          'Insert into the impulse–momentum theorem v_x = v₀ + (1/m)∫F_x dt. The velocity oscillates about the mean value v₀ + F₀cos(ωt₀)/(mω), which is in general not zero, so the body drifts to one side.',
          'In den Impulssatz v_x = v₀ + (1/m)∫F_x dt einsetzen. Die Geschwindigkeit schwankt um den Mittelwert v₀ + F₀cos(ωt₀)/(mω), der im Allgemeinen nicht null ist; der Körper driftet daher zu einer Seite.'),
        B.impulse, 'vx = v0 + F0*(cos(omega*t0) - cos(omega*t))/(m*omega)', { vx: 'm/s' })
    ]
  },
  {
    formula: 'vf.sin.x',
    title: tri('F = F₀ sin ωt 时的位置', 'Position for F = F₀ sin ωt', 'Ort für F = F₀ sin ωt'),
    uses: ['var-force.newton'],
    steps: [
      step('v_x(s) = v_0 + \\dfrac{F_0}{m\\omega}\\left(\\cos\\omega t_0 - \\cos\\omega s\\right)',
        tri('任一时刻 s 的速度（见“F = F₀ sin ωt 时的速度”）。',
          'The velocity at any time s (see “Velocity for F = F₀ sin ωt”).',
          'Die Geschwindigkeit zu einem beliebigen Zeitpunkt s (siehe „Geschwindigkeit für F = F₀ sin ωt“).'),
        B.impulse, 'vs = v0 + F0/(m*omega)*(cos(omega*t0) - cos(omega*s))', { vs: 'm/s', s: 's' }),
      step('x = x_0 + \\int_{t_0}^{t}v_x(s)\\,\\mathrm{d}s',
        tri('位置等于初位置加上位移，位移是速度对时间的积分。',
          'The position is the initial position plus the displacement, the time integral of the velocity.',
          'Der Ort ist der Anfangsort plus die Verschiebung, das Zeitintegral der Geschwindigkeit.'),
        DISPLACEMENT, 'x - x0 = vs*ds', { x: 'm', vs: 'm/s', ds: 's' }),
      step('\\int_{t_0}^{t}\\cos\\omega s\\,\\mathrm{d}s = \\dfrac{\\sin\\omega t - \\sin\\omega t_0}{\\omega}',
        tri('逐项积分：常数项乘以 τ = t − t₀；余弦项的原函数为 sin(ωs)/ω。',
          'Integrate term by term: the constant terms are multiplied by τ = t − t₀; the cosine term has the antiderivative sin(ωs)/ω.',
          'Gliedweise integrieren: Die konstanten Glieder werden mit τ = t − t₀ multipliziert; das Kosinusglied hat die Stammfunktion sin(ωs)/ω.'),
        B.antiderivative, 'cos(omega*s)*ds = (sin(omega*t) - sin(omega*t0))/omega', { s: 's', ds: 's' }),
      step('x = x_0 + v_0\\tau + \\dfrac{F_0}{m\\omega}\\left[\\tau\\cos\\omega t_0 - \\dfrac{\\sin\\omega t - \\sin\\omega t_0}{\\omega}\\right],\\ \\tau = t - t_0',
        tri('合并各项得位置，τ = t − t₀ 为本段经过的时间。',
          'Collecting the terms gives the position; τ = t − t₀ is the time elapsed in the phase.',
          'Zusammenfassen ergibt den Ort; τ = t − t₀ ist die im Abschnitt vergangene Zeit.'),
        B.previous, 'x = x0 + v0*(t - t0) + F0/(m*omega)*((t - t0)*cos(omega*t0) - (sin(omega*t) - sin(omega*t0))/omega)', { x: 'm' })
    ]
  }
]
