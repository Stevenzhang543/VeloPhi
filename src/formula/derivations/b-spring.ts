/**
 * Derivations of the spring-oscillator formulas (situation "spring": body of mass m on a spring of constant k,
 * undamped, amplitude A). Manual 26.50, D28.
 */
import type { Derivation, SharedSteps } from './types'
import { B, step, tri } from './b-common'

/** Shared step lists of the spring oscillator: equation of motion, energy. */
export const SHARED_SPRING: SharedSteps[] = [
  {
    id: 'spring.motion',
    title: tri('振子的受力分析与运动方程', 'Forces and equation of motion of the oscillator', 'Kräfte und Bewegungsgleichung des Federpendels'),
    steps: [
      step('F = -kx',
        tri('沿弹簧方向建立 x 轴，以平衡位置为原点，x 为振子离开平衡位置的位移。在光滑水平面上，竖直方向重力与支持力平衡，沿 x 方向只有弹簧弹力，平衡位置就是弹簧原长处；竖直悬挂时，在平衡位置弹力与重力平衡（kΔl = mg），以平衡位置为原点，合力同样是 −kx。这个力总指向平衡位置，是回复力。',
          'Take the x axis along the spring with the origin at the equilibrium position; x is the displacement from equilibrium. On a smooth horizontal surface the weight and the normal force cancel and only the spring force acts along x; the equilibrium position is at the natural length. For a hanging spring the spring force balances the weight at equilibrium (kΔl = mg), and measured from there the resultant force is again −kx. This force always points towards equilibrium: it is the restoring force.',
          'x-Achse längs der Feder, Ursprung in der Gleichgewichtslage; x ist die Auslenkung aus der Gleichgewichtslage. Auf einer reibungsfreien waagerechten Unterlage heben sich Gewichtskraft und Normalkraft auf, längs x wirkt nur die Federkraft; die Gleichgewichtslage liegt bei entspannter Feder. Bei einer senkrecht hängenden Feder hält die Federkraft in der Gleichgewichtslage der Gewichtskraft das Gleichgewicht (kΔl = mg); von dort aus gemessen ist die resultierende Kraft ebenfalls −kx. Diese Kraft zeigt stets zur Gleichgewichtslage: Sie ist die Rückstellkraft.'),
        B.hooke, 'F = -k*x', { F: 'N', x: 'm' }),
      step('a = -\\dfrac{k}{m}\\,x',
        tri('由牛顿第二定律 ma = −kx：加速度与位移成正比、方向相反，振子做简谐运动。',
          "Newton's second law ma = −kx: the acceleration is proportional and opposite to the displacement, so the oscillator performs simple harmonic motion.",
          'Mit dem zweiten Newtonschen Gesetz ma = −kx: Die Beschleunigung ist proportional zur Auslenkung und ihr entgegengerichtet – der Körper schwingt harmonisch.'),
        B.newton2, 'a = -k/m*x', { a: 'm/s²', x: 'm' }),
      step('x = A\\cos(\\omega t + \\varphi),\\quad \\omega = \\sqrt{\\dfrac{k}{m}}',
        tri('与简谐运动的动力学方程 a = −ω²x 比较得角频率 ω；位移随时间按余弦规律变化，A 为振幅。',
          'Comparing with a = −ω²x gives the angular frequency ω; the displacement varies sinusoidally with time, A being the amplitude.',
          'Vergleich mit a = −ω²x liefert die Kreisfrequenz ω; die Auslenkung ändert sich sinusförmig mit der Zeit, A ist die Amplitude.'),
        B.shm, 'omega = sqrt(k/m)', { omega: 'rad/s' })
    ]
  },
  {
    id: 'spring.energy',
    title: tri('振动的能量', 'Energy of the oscillation', 'Energie der Schwingung'),
    steps: [
      step('\\tfrac12 mv^2 + \\tfrac12 kx^2 = \\tfrac12 kA^2',
        tri('只有弹力（竖直悬挂时还有重力）做功，振动系统的机械能守恒。在最大位移处 x = ±A，速度为零，机械能全部是势能 ½kA²。（竖直悬挂时，以平衡位置为原点的 ½kx² 是弹性势能与重力势能的变化之和。）',
          'Only the spring force (and, for a hanging spring, gravity) does work, so the mechanical energy of the oscillator is conserved. At the maximum displacement x = ±A the speed is zero and all the energy is potential energy ½kA². (For a hanging spring, ½kx² measured from equilibrium is the sum of the changes of elastic and gravitational potential energy.)',
          'Nur die Federkraft (bei hängender Feder auch die Gewichtskraft) verrichtet Arbeit; die mechanische Energie bleibt erhalten. Im Umkehrpunkt x = ±A ist die Geschwindigkeit null, die gesamte Energie ist potentielle Energie ½kA². (Bei hängender Feder ist ½kx², von der Gleichgewichtslage aus gemessen, die Summe der Änderungen von Spannenergie und Lageenergie.)'),
        B.energy, 'm*v^2/2 + k*x^2/2 = k*A^2/2', { v: 'm/s', x: 'm' })
    ]
  }
]

/** Derivations of sp.T, sp.vmax and sp.amax. */
export const DERIVATIONS_SPRING: Derivation[] = [
  {
    formula: 'sp.T',
    title: tri('弹簧振子周期', 'Period of a spring oscillator', 'Schwingungsdauer des Federpendels'),
    uses: ['spring.motion'],
    steps: [
      step('T = \\dfrac{2\\pi}{\\omega}',
        tri('经过一个周期，相位 ωt + φ 增加 2π。',
          'In one period the phase ωt + φ increases by 2π.',
          'Während einer Periode wächst die Phase ωt + φ um 2π.'),
        tri('周期的定义', 'Definition of the period', 'Definition der Schwingungsdauer'),
        'T = 2*pi/omega', { T: 's', omega: 'rad/s' }),
      step('T = 2\\pi\\sqrt{\\dfrac{m}{k}}',
        tri('代入 ω = √(k/m)。周期只由振子质量和劲度系数决定，与振幅无关。',
          'Substitute ω = √(k/m). The period depends only on the mass and the spring constant, not on the amplitude.',
          'ω = √(k/m) einsetzen. Die Schwingungsdauer hängt nur von Masse und Federkonstante ab, nicht von der Amplitude.'),
        B.previous, 'T = 2*pi*sqrt(m/k)', { T: 's' })
    ]
  },
  {
    formula: 'sp.vmax',
    title: tri('最大速率（平衡位置）', 'Maximum speed (at the equilibrium position)', 'Maximale Geschwindigkeit (in der Gleichgewichtslage)'),
    uses: ['spring.motion', 'spring.energy'],
    steps: [
      step('\\tfrac12 mv_{\\max}^2 = \\tfrac12 kA^2',
        tri('在平衡位置 x = 0，势能为零，动能最大。',
          'At the equilibrium position x = 0 the potential energy is zero and the kinetic energy is largest.',
          'In der Gleichgewichtslage x = 0 ist die potentielle Energie null und die kinetische Energie am größten.'),
        B.energy, 'm*vmax^2/2 = k*A^2/2', { vmax: 'm/s' }),
      step('v_{\\max} = A\\sqrt{\\dfrac{k}{m}}',
        tri('解出最大速率，即 v_max = ωA（也可由 v = −ωA sin(ωt + φ) 直接得到）。',
          'Solving gives v_max = ωA (also directly from v = −ωA sin(ωt + φ)).',
          'Auflösen ergibt v_max = ωA (auch direkt aus v = −ωA sin(ωt + φ)).'),
        B.rearrange, 'vmax = A*sqrt(k/m)', { vmax: 'm/s' })
    ]
  },
  {
    formula: 'sp.amax',
    title: tri('最大加速度（最大位移处）', 'Maximum acceleration (at maximum displacement)', 'Maximale Beschleunigung (im Umkehrpunkt)'),
    uses: ['spring.motion'],
    steps: [
      step('F_{\\max} = kA',
        tri('回复力的大小 k|x| 在最大位移 |x| = A 处最大。',
          'The magnitude k|x| of the restoring force is largest at the maximum displacement |x| = A.',
          'Der Betrag k|x| der Rückstellkraft ist im Umkehrpunkt |x| = A am größten.'),
        B.hooke, 'Fmax = k*A', { Fmax: 'N' }),
      step('a_{\\max} = \\dfrac{kA}{m}',
        tri('由牛顿第二定律，加速度的最大值 a_max = F_max/m（= ω²A），方向指向平衡位置。',
          "By Newton's second law the largest acceleration is a_max = F_max/m (= ω²A), directed towards the equilibrium position.",
          'Nach dem zweiten Newtonschen Gesetz ist die größte Beschleunigung a_max = F_max/m (= ω²A), zur Gleichgewichtslage gerichtet.'),
        B.newton2, 'amax = k*A/m', { amax: 'm/s²' })
    ]
  }
]
