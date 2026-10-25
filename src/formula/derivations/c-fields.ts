/**
 * Derivations of the 26.51 situations "drag" (a fall from rest with air drag f = bv + cv², downwards positive)
 * and "damped" (a spring oscillator with viscous damping c, underdamped) (manual 26.51, D44, D50).
 */
import type { Derivation, SharedSteps } from './types'
import { B, CAUSE_NUM, st, tri } from './a-common'

const bStart = tri('积分（初始条件 v(0) = 0）', 'Integration (initial condition v(0) = 0)', 'Integration (Anfangsbedingung v(0) = 0)')
const bSeparate = tri('分离变量', 'Separation of variables', 'Trennung der Variablen')
const bTerminal = tri('二力平衡（终端速度）', 'Balance of two forces (terminal speed)', 'Gleichgewicht zweier Kräfte (Endgeschwindigkeit)')

/** Shared steps of the drag and damped situations. */
export const FIELDS_SHARED: SharedSteps[] = [
  {
    id: 'drag.forces',
    title: tri('受力分析', 'Forces', 'Kräfte'),
    steps: [
      st('f = bv + cv^2',
        tri('空气阻力与速度方向相反，随速率增大：低速、小物体以线性项 bv 为主（斯托克斯阻力），高速时以平方项 cv² 为主。',
          'Air drag opposes the velocity and grows with speed: the linear term bv (Stokes drag) dominates for small, slow bodies, the quadratic term cv² at high speed.',
          'Der Luftwiderstand ist der Geschwindigkeit entgegengerichtet und wächst mit ihr: Bei kleinen, langsamen Körpern überwiegt der lineare Anteil b·v (Stokes-Reibung), bei hoher Geschwindigkeit der quadratische c·v².'),
        tri('阻力模型', 'Drag model', 'Widerstandsmodell'), ['f', 'b*v + c*v^2'], { f: 'N' }),
      st('mg - f = ma',
        tri('取竖直向下为正：重力向下，阻力向上。',
          'Downwards positive: the weight acts down, the drag up.',
          'Nach unten positiv: Die Gewichtskraft wirkt nach unten, der Widerstand nach oben.'),
        B.n2, ['m*g - f', 'm*a'], { f: 'N', a: 'm/s²' })
    ]
  },
  {
    id: 'damped.equation',
    title: tri('运动方程及其解', 'Equation of motion and its solution', 'Bewegungsgleichung und ihre Lösung'),
    steps: [
      st('m\\ddot x = -kx - c\\dot x',
        tri('以平衡位置为原点，x 为偏离量：弹力 −kx 把振子拉回，阻尼力 −cẋ 与速度方向相反。',
          'Measure x from the equilibrium position: the spring force −kx pulls back, the damping force −cẋ opposes the velocity.',
          'x von der Gleichgewichtslage aus messen: Die Federkraft −k·x zieht zurück, die Dämpfungskraft −c·ẋ wirkt der Geschwindigkeit entgegen.'),
        B.n2, ['m*xdd', '-k*x - c*xd'], { xdd: 'm/s²', x: 'm', xd: 'm/s' }),
      st('\\gamma = \\dfrac{c}{2m},\\quad \\omega_d = \\sqrt{\\dfrac{k}{m} - \\gamma^2}',
        tri('引入衰减系数 γ 与阻尼振动的角频率 ω_d；欠阻尼（c² < 4km）时 ω_d 为实数。',
          'Introduce the decay rate γ and the angular frequency ω_d of the damped oscillation; for underdamping (c² < 4km) ω_d is real.',
          'Abklingkonstante γ und Kreisfrequenz ω_d der gedämpften Schwingung einführen; bei schwacher Dämpfung (c² < 4km) ist ω_d reell.'),
        tri('记号', 'Notation', 'Bezeichnungen'), ['gamma', 'c/(2*m)'], { gamma: '1/s' }),
      st('x = A\\,\\mathrm{e}^{-\\gamma t}\\cos(\\omega_d t + \\varphi)',
        tri('代入可验证这是方程的解：一个振幅按指数衰减的余弦振动。',
          'Substituting shows that this solves the equation: a cosine oscillation whose amplitude decays exponentially.',
          'Einsetzen zeigt, dass dies die Gleichung löst: eine Kosinusschwingung mit exponentiell abnehmender Amplitude.'),
        tri('二阶线性常微分方程的解', 'Solution of a second-order linear ODE', 'Lösung einer linearen Differentialgleichung zweiter Ordnung'), ['x', 'A*exp(-gamma*t)*cos(wd*t + phi)'], { x: 'm', A: 'm', t: 's', wd: 'rad/s', phi: 'rad', gamma: '1/s' })
    ]
  }
]

/** Derivations of the drag and damped-oscillation formulas. */
export const FIELDS_DERIVATIONS: Derivation[] = [
  // ---- Air drag ----
  {
    formula: 'dr.F',
    title: tri('空气阻力', 'Air drag', 'Luftwiderstand'),
    note: tri('v 取仿真中此刻的速度', 'v is the velocity at this moment in the simulation', 'v ist die momentane Geschwindigkeit in der Simulation'),
    steps: [
      st('f = bv + cv^2',
        tri('阻力与速度方向相反：线性项 bv（斯托克斯阻力，b = 6πηr 对球体）加平方项 cv²（c = ½ρC_dA）。',
          'The drag opposes the velocity: a linear term bv (Stokes drag, b = 6πηr for a sphere) plus a quadratic term cv² (c = ½ρC_dA).',
          'Der Widerstand ist der Geschwindigkeit entgegengerichtet: linearer Anteil b·v (Stokes-Reibung, b = 6πηr für eine Kugel) plus quadratischer Anteil c·v² (c = ½ρC_wA).'),
        tri('阻力模型', 'Drag model', 'Widerstandsmodell'), ['f', 'b*v + c*v^2'], { f: 'N' })
    ]
  },
  {
    formula: 'dr.vt',
    title: tri('终端速度（线性阻力）', 'Terminal speed (linear drag)', 'Endgeschwindigkeit (lineare Reibung)'),
    note: tri('下落足够久后才接近终端速度', 'The terminal speed is reached only after falling long enough', 'Die Endgeschwindigkeit wird erst nach ausreichend langem Fall erreicht'),
    uses: ['drag.forces'],
    steps: [
      st('mg - f_t = 0',
        tri('下落越来越快，阻力越来越大；阻力增大到等于重力时合力为零，速度不再增加。这时的速度叫终端速度 v_t。',
          'The body falls faster and faster and the drag grows; once it equals the weight the net force is zero and the speed no longer increases. This speed is the terminal speed v_t.',
          'Der Körper fällt immer schneller, der Widerstand wächst; erreicht er die Gewichtskraft, ist die resultierende Kraft null und die Geschwindigkeit wächst nicht mehr: die Endgeschwindigkeit v_t.'),
        bTerminal, ['m*g - ft', '0'], { ft: 'N' }),
      st('f_t = bv_t',
        tri('只有线性阻力（c = 0）。',
          'Linear drag only (c = 0).',
          'Nur lineare Reibung (c = 0).'),
        tri('线性阻力 f = bv', 'Linear drag f = bv', 'Lineare Reibung f = b·v'), ['ft', 'b*vt'], { ft: 'N', vt: 'm/s' }),
      st('v_t = \\dfrac{mg}{b}',
        tri('解出终端速度：越重的物体终端速度越大。',
          'Solve for the terminal speed: heavier bodies fall faster in the end.',
          'Nach der Endgeschwindigkeit auflösen: Schwerere Körper fallen am Ende schneller.'),
        B.solve, ['vt', 'm*g/b'], { vt: 'm/s' })
    ]
  },
  {
    formula: 'dr.vt2',
    title: tri('终端速度（平方阻力）', 'Terminal speed (quadratic drag)', 'Endgeschwindigkeit (quadratischer Widerstand)'),
    note: tri('下落足够久后才接近终端速度', 'The terminal speed is reached only after falling long enough', 'Die Endgeschwindigkeit wird erst nach ausreichend langem Fall erreicht'),
    uses: ['drag.forces'],
    steps: [
      st('mg - f_t = 0',
        tri('阻力增大到等于重力时合力为零，速度不再增加。',
          'Once the drag equals the weight the net force is zero and the speed no longer increases.',
          'Erreicht der Widerstand die Gewichtskraft, ist die resultierende Kraft null und die Geschwindigkeit wächst nicht mehr.'),
        bTerminal, ['m*g - ft', '0'], { ft: 'N' }),
      st('f_t = cv_t^2',
        tri('只有平方阻力（b = 0）。',
          'Quadratic drag only (b = 0).',
          'Nur quadratischer Widerstand (b = 0).'),
        tri('平方阻力 f = cv²', 'Quadratic drag f = cv²', 'Quadratischer Widerstand f = c·v²'), ['ft', 'c*vt^2'], { ft: 'N', vt: 'm/s' }),
      st('v_t = \\sqrt{\\dfrac{mg}{c}}',
        tri('解出终端速度。',
          'Solve for the terminal speed.',
          'Nach der Endgeschwindigkeit auflösen.'),
        B.solve, ['vt', 'sqrt(m*g/c)'], { vt: 'm/s' })
    ]
  },
  {
    formula: 'dr.v',
    title: tri('线性阻力下的下落速度', 'Speed of a fall with linear drag', 'Fallgeschwindigkeit mit linearer Reibung'),
    causes: [CAUSE_NUM],
    uses: ['drag.forces'],
    steps: [
      st('v_t = \\dfrac{mg}{b}',
        tri('终端速度（前面的结论）。',
          'The terminal speed (earlier result).',
          'Die Endgeschwindigkeit (früheres Ergebnis).'),
        B.earlier, ['vt', 'm*g/b'], { vt: 'm/s' }),
      st('m\\dfrac{\\mathrm{d}v}{\\mathrm{d}t} = mg - bv = b(v_t - v)',
        tri('只有线性阻力时，牛顿第二定律是一个一阶线性微分方程。',
          'With linear drag only, Newton’s second law is a first-order linear differential equation.',
          'Mit nur linearer Reibung ist das zweite Newtonsche Gesetz eine lineare Differentialgleichung erster Ordnung.'),
        B.n2, ['m*g - b*v', 'b*(vt - v)'], { vt: 'm/s' }),
      st('\\dfrac{\\mathrm{d}v}{v_t - v} = \\dfrac{b}{m}\\,\\mathrm{d}t',
        tri('分离变量。',
          'Separate the variables.',
          'Variablen trennen.'),
        bSeparate, ['dv/(vt - v)', 'b/m*dt'], { dv: 'm/s', vt: 'm/s', dt: 's' }),
      st('-\\ln\\dfrac{v_t - v}{v_t} = \\dfrac{bt}{m}',
        tri('两边积分，t = 0 时 v = 0。',
          'Integrate both sides with v = 0 at t = 0.',
          'Beide Seiten integrieren, mit v = 0 bei t = 0.'),
        bStart, ['-ln((vt - v)/vt)', 'b*t/m'], { vt: 'm/s' }),
      st('v = \\dfrac{mg}{b}\\left(1 - \\mathrm{e}^{-bt/m}\\right)',
        tri('解出 v。时间常数 τ = m/b：经过 τ 达到终端速度的 63%，经过 5τ 达到 99%。',
          'Solve for v. The time constant is τ = m/b: after τ the speed is 63% of the terminal speed, after 5τ 99%.',
          'Nach v auflösen. Die Zeitkonstante ist τ = m/b: Nach τ sind 63 % der Endgeschwindigkeit erreicht, nach 5τ 99 %.'),
        B.solve, ['v', 'm*g/b*(1 - exp(-b*t/m))'])
    ]
  },
  {
    formula: 'dr.v2',
    title: tri('平方阻力下的下落速度', 'Speed of a fall with quadratic drag', 'Fallgeschwindigkeit mit quadratischem Widerstand'),
    causes: [CAUSE_NUM],
    uses: ['drag.forces'],
    steps: [
      st('v_t = \\sqrt{\\dfrac{mg}{c}}',
        tri('终端速度（前面的结论）。',
          'The terminal speed (earlier result).',
          'Die Endgeschwindigkeit (früheres Ergebnis).'),
        B.earlier, ['vt', 'sqrt(m*g/c)'], { vt: 'm/s' }),
      st('m\\dfrac{\\mathrm{d}v}{\\mathrm{d}t} = mg - cv^2 = \\dfrac{mg}{v_t^2}\\left(v_t^2 - v^2\\right)',
        tri('只有平方阻力时的运动方程，用 v_t 改写。',
          'The equation of motion with quadratic drag only, rewritten with v_t.',
          'Die Bewegungsgleichung mit nur quadratischem Widerstand, mit v_t umgeschrieben.'),
        B.n2, ['m*g - c*v^2', 'm*g/vt^2*(vt^2 - v^2)'], { vt: 'm/s' }),
      st('\\dfrac{v_t\\,\\mathrm{d}v}{v_t^2 - v^2} = \\dfrac{g}{v_t}\\,\\mathrm{d}t',
        tri('分离变量。',
          'Separate the variables.',
          'Variablen trennen.'),
        bSeparate, ['vt*dv/(vt^2 - v^2)', 'g/vt*dt'], { vt: 'm/s', dv: 'm/s', dt: 's' }),
      st('\\dfrac{v}{v_t} = \\tanh\\dfrac{gt}{v_t}',
        tri('左边积分得 artanh(v/v_t)，t = 0 时 v = 0。',
          'The left side integrates to artanh(v/v_t), with v = 0 at t = 0.',
          'Die linke Seite ergibt integriert artanh(v/v_t), mit v = 0 bei t = 0.'),
        bStart, ['v/vt', 'tanh(g*t/vt)'], { vt: 'm/s' }),
      st('v = \\sqrt{\\dfrac{mg}{c}}\\tanh\\!\\left(t\\sqrt{\\dfrac{gc}{m}}\\right)',
        tri('代入 v_t，g/v_t = √(gc/m)。',
          'Insert v_t; g/v_t = √(gc/m).',
          'v_t einsetzen; g/v_t = √(g·c/m).'),
        B.prev, ['v', 'sqrt(m*g/c)*tanh(t*sqrt(g*c/m))'])
    ]
  },
  // ---- Damped oscillation ----
  {
    formula: 'dm.T',
    title: tri('阻尼振动的周期', 'Period of a damped oscillation', 'Periodendauer einer gedämpften Schwingung'),
    note: tri('比无阻尼时略长', 'A little longer than without damping', 'Etwas länger als ohne Dämpfung'),
    uses: ['damped.equation'],
    steps: [
      st('\\omega_d = \\sqrt{\\dfrac{k}{m} - \\dfrac{c^2}{4m^2}}',
        tri('代入 γ = c/(2m)。',
          'Insert γ = c/(2m).',
          'γ = c/(2m) einsetzen.'),
        B.prev, ['wd', 'sqrt(k/m - c^2/(4*m^2))'], { wd: 'rad/s' }),
      st('T_d = \\dfrac{2\\pi}{\\omega_d}',
        tri('相邻两次同向经过平衡位置之间，余弦因子变化一个周期。',
          'Between two passes through the equilibrium in the same direction the cosine factor runs through one period.',
          'Zwischen zwei gleichsinnigen Durchgängen durch die Gleichgewichtslage durchläuft der Kosinusfaktor eine Periode.'),
        tri('周期与角频率的关系', 'Period and angular frequency', 'Periodendauer und Kreisfrequenz'), ['Td', '2*pi/wd'], { Td: 's', wd: 'rad/s' }),
      st('T_d = \\dfrac{2\\pi}{\\sqrt{\\dfrac{k}{m} - \\dfrac{c^2}{4m^2}}}',
        tri('代入 ω_d。c → 0 时回到 T = 2π√(m/k)。',
          'Insert ω_d. For c → 0 this becomes T = 2π√(m/k).',
          'ω_d einsetzen. Für c → 0 ergibt sich T = 2π·√(m/k).'),
        B.prev, ['Td', '2*pi/sqrt(k/m - c^2/(4*m^2))'], { Td: 's' })
    ]
  },
  {
    formula: 'dm.ratio',
    title: tri('振幅每周期衰减的比例', 'Decay of the amplitude per period', 'Abnahme der Amplitude je Periode'),
    uses: ['damped.equation'],
    steps: [
      st('\\dfrac{A_{n+1}}{A_n} = \\mathrm{e}^{-\\gamma T_d}',
        tri('相邻两次最大位移相隔一个周期 T_d，余弦因子取同样的值，只有指数因子减小了 e^{−γT_d} 倍。',
          'Two successive maxima are one period T_d apart; the cosine factor has the same value, only the exponential factor has shrunk by e^{−γT_d}.',
          'Zwei aufeinanderfolgende Maxima liegen eine Periode T_d auseinander; der Kosinusfaktor ist gleich, nur der Exponentialfaktor ist um e^{−γT_d} kleiner.'),
        tri('解的形式', 'Form of the solution', 'Form der Lösung'), ['ratio', 'exp(-gamma*Td)'], { ratio: '', gamma: '1/s', Td: 's' }),
      st('\\dfrac{A_{n+1}}{A_n} = \\mathrm{e}^{-cT_d/(2m)}',
        tri('代入 γ 与 T_d：比值是常数，振幅按等比数列衰减。',
          'Insert γ and T_d: the ratio is constant, so the amplitudes form a geometric sequence.',
          'γ und T_d einsetzen: Das Verhältnis ist konstant, die Amplituden bilden eine geometrische Folge.'),
        B.prev, ['ratio', 'exp(-c/(2*m)*2*pi/sqrt(k/m - c^2/(4*m^2)))'], { ratio: '' })
    ]
  }
]
