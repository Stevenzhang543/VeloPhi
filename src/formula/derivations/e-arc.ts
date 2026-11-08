/**
 * Derivations of the circular-track formulas (26.62, D220): a body on the inside of a fixed smooth circular track
 * ("arc-inside": vertical loop, bowl, quarter arc; position angle φ from the lowest point) and on the outside
 * ("arc-outside": hump bridge, dome; θ from the top). ρ is the radius of the circle the body's centre moves on.
 */
import type { Derivation, SharedSteps } from './types'
import { st, tri } from './a-common'

const radial = tri('牛顿第二定律（法向）：合力提供向心力', "Newton's second law (radial direction): the resultant provides the centripetal force", 'Zweites Newtonsches Gesetz (radiale Richtung): Die Resultierende ist die Zentripetalkraft')
const energy = tri('机械能守恒定律', 'Conservation of mechanical energy', 'Energieerhaltung')
const rearrange = tri('整理', 'Rearranging', 'Umformen')
const pushOnly = tri('轨道的特点：只能推、不能拉（N ≥ 0）', 'Property of a track: it can only push (N ≥ 0)', 'Eigenschaft einer Bahn: Sie kann nur drücken (N ≥ 0)')
const previous = tri('上一步代入', 'Substitution of the previous result', 'Einsetzen des vorigen Ergebnisses')

export const ARC_SHARED: SharedSteps[] = [
  {
    id: 'arc-inside.forces',
    title: tri('圆轨道内侧物体的受力与能量', 'Forces and energy on the inside of a track', 'Kräfte und Energie innen an einer Kreisbahn'),
    steps: [
      st('N - mg\\cos\\varphi = \\dfrac{mv^2}{\\rho}',
        tri('光滑轨道对物体的支持力 N 沿半径指向圆心，重力沿半径的分量为 mg cos φ（φ 自最低点量起）。二者的合力提供向心力。',
          'The smooth track pushes with N along the radius towards the centre; the radial component of the weight is mg cos φ (φ from the lowest point). Their resultant provides the centripetal force.',
          'Die glatte Bahn drückt mit N längs des Radius zum Mittelpunkt; die radiale Komponente der Gewichtskraft ist mg cos φ (φ vom tiefsten Punkt aus). Ihre Resultierende ist die Zentripetalkraft.'),
        radial, ['N - m*g*cos(phi)', 'm*v^2/rho'], { N: 'N', phi: 'rad', v: 'm/s' }),
      st('\\tfrac12 mv^2 + mg\\rho(1 - \\cos\\varphi) = \\tfrac12 mv_0^2',
        tri('支持力始终与速度垂直、不做功，只有重力做功：机械能守恒。v₀ 是物体在最低点的速率。',
          'The normal force is always perpendicular to the velocity and does no work; only gravity does: mechanical energy is conserved. v₀ is the speed at the lowest point.',
          'Die Normalkraft steht stets senkrecht zur Geschwindigkeit und verrichtet keine Arbeit; nur die Gewichtskraft: Die mechanische Energie bleibt erhalten. v₀ ist die Geschwindigkeit im tiefsten Punkt.'),
        energy, ['m*v^2/2 + m*g*rho*(1 - cos(phi))', 'm*v0^2/2'], { v: 'm/s', phi: 'rad' })
    ]
  },
  {
    id: 'arc-outside.forces',
    title: tri('圆弧外侧物体的受力与能量', 'Forces and energy on the outside of a track', 'Kräfte und Energie außen an einer Kreisbahn'),
    steps: [
      st('mg\\cos\\theta - N = \\dfrac{mv^2}{\\rho}',
        tri('物体在圆弧外侧：重力沿半径指向圆心的分量 mg cos θ（θ 自最高点量起）减去支持力 N，提供向心力。',
          'On the outside: the radial component of the weight towards the centre, mg cos θ (θ from the top), minus the normal force N provides the centripetal force.',
          'Außen auf der Bahn: Die radiale Komponente der Gewichtskraft zum Mittelpunkt, mg cos θ (θ vom höchsten Punkt aus), minus die Normalkraft N ist die Zentripetalkraft.'),
        radial, ['m*g*cos(theta) - N', 'm*v^2/rho'], { N: 'N', theta: 'rad', v: 'm/s' }),
      st('\\tfrac12 mv^2 = \\tfrac12 mv_t^2 + mg\\rho(1 - \\cos\\theta)',
        tri('只有重力做功，机械能守恒；v_t 是物体在最高点的速率（由本段机械能推算）。',
          'Only gravity does work: mechanical energy is conserved; v_t is the speed at the top (from the energy of the phase).',
          'Nur die Gewichtskraft verrichtet Arbeit: Die mechanische Energie bleibt erhalten; v_t ist die Geschwindigkeit im höchsten Punkt (aus der Energie des Abschnitts).'),
        energy, ['m*v^2/2', 'm*vt^2/2 + m*g*rho*(1 - cos(theta))'], { v: 'm/s', theta: 'rad' })
    ]
  }
]

export const ARC_DERIVATIONS: Derivation[] = [
  {
    formula: 'arc.in.Nb', note: tri('从四分之一圆弧顶端由静止滑下时 v₀² = 2gρ，N = 3mg', 'Sliding from rest at the rim of a quarter arc, v₀² = 2gρ and N = 3mg', 'Aus der Ruhe vom Rand eines Viertelkreises: v₀² = 2gρ und N = 3mg'), title: tri('最低点轨道的支持力', 'Normal force of the track at the lowest point', 'Normalkraft der Bahn im tiefsten Punkt'),
    uses: ['arc-inside.forces'],
    steps: [
      st('N - mg = \\dfrac{mv_0^2}{\\rho}', tri('在最低点 φ = 0、v = v₀：支持力向上，重力向下。', 'At the lowest point φ = 0 and v = v₀: the normal force points up, the weight down.', 'Im tiefsten Punkt ist φ = 0 und v = v₀: Die Normalkraft zeigt nach oben, die Gewichtskraft nach unten.'), radial, ['N - m*g', 'm*v0^2/rho'], { N: 'N' }),
      st('N = mg + \\dfrac{mv_0^2}{\\rho}', tri('移项得支持力，它大于重力（超重）。', 'Rearranged: the normal force, larger than the weight.', 'Umgeformt: die Normalkraft, größer als die Gewichtskraft.'), rearrange, ['N', 'm*g + m*v0^2/rho'], { N: 'N' })
    ]
  },
  {
    formula: 'arc.in.vtop', title: tri('最高点速率（机械能守恒）', 'Speed at the top (conservation of mechanical energy)', 'Geschwindigkeit im höchsten Punkt (Energieerhaltung)'),
    uses: ['arc-inside.forces'],
    steps: [
      st('\\tfrac12 mv_{\\text{top}}^2 + mg\\cdot 2\\rho = \\tfrac12 mv_0^2', tri('最高点 φ = π，比最低点高 2ρ；前提是物体沿轨道到达最高点。', 'At the top φ = π, 2ρ above the lowest point; the body must reach the top on the track.', 'Oben ist φ = π, 2ρ über dem tiefsten Punkt; der Körper muss den höchsten Punkt auf der Bahn erreichen.'), energy, ['m*vtop^2/2 + m*g*2*rho', 'm*v0^2/2'], { vtop: 'm/s' }),
      st('v_{\\text{top}} = \\sqrt{v_0^2 - 4g\\rho}', tri('解出最高点的速率。', 'Solve for the speed at the top.', 'Nach der Geschwindigkeit oben auflösen.'), rearrange, ['vtop', 'sqrt(v0^2 - 4*g*rho)'], { vtop: 'm/s' })
    ]
  },
  {
    formula: 'arc.in.Ntop', note: tri('最高点速率等于 √(gρ) 时支持力为零', 'At a speed of √(gρ) at the top the normal force is zero', 'Bei √(gρ) oben ist die Normalkraft null'), title: tri('最高点轨道的支持力', 'Normal force of the track at the top', 'Normalkraft der Bahn im höchsten Punkt'),
    uses: ['arc-inside.forces'],
    steps: [
      st('N + mg = \\dfrac{mv_{\\text{top}}^2}{\\rho}', tri('最高点 φ = π：支持力与重力都竖直向下，指向圆心。', 'At the top φ = π: the normal force and the weight both point down, towards the centre.', 'Oben ist φ = π: Normalkraft und Gewichtskraft zeigen beide nach unten, zum Mittelpunkt.'), radial, ['N + m*g', 'm*vtop^2/rho'], { N: 'N', vtop: 'm/s' }),
      st('N = \\dfrac{m(v_0^2 - 4g\\rho)}{\\rho} - mg = \\dfrac{m(v_0^2 - 5g\\rho)}{\\rho}', tri('代入 v_top² = v₀² − 4gρ。', 'With v_top² = v₀² − 4gρ.', 'Mit v_top² = v₀² − 4gρ.'), previous, ['N', 'm*(v0^2 - 5*g*rho)/rho'], { N: 'N' })
    ]
  },
  {
    formula: 'arc.in.crit', note: tri('轨道只能推不能拉：最高点 N ≥ 0 要求 mv²/ρ ≥ mg', 'The track can only push: N ≥ 0 at the top requires mv²/ρ ≥ mg', 'Die Bahn kann nur drücken: N ≥ 0 oben verlangt mv²/ρ ≥ mg'), title: tri('恰能通过最高点的最低点速度', 'Speed at the lowest point for just passing the top', 'Geschwindigkeit im tiefsten Punkt, um den höchsten Punkt gerade zu passieren'),
    uses: ['arc-inside.forces'],
    steps: [
      st('N_{\\text{top}} = \\dfrac{m(v_0^2 - 5g\\rho)}{\\rho} \\ge 0', tri('轨道只能推：通过最高点要求那里的支持力不小于零。', 'The track can only push: passing the top requires a normal force there of at least zero.', 'Die Bahn kann nur drücken: Oben muss die Normalkraft mindestens null sein.'), pushOnly, ['Ntop', 'm*(v0^2 - 5*g*rho)/rho'], { Ntop: 'N' }),
      st('v_0 = \\sqrt{5g\\rho}', tri('取等号得临界值；此时最高点的速率为 √(gρ)。', 'Equality gives the critical value; the speed at the top is then √(gρ).', 'Gleichheit ergibt den Grenzwert; oben ist die Geschwindigkeit dann √(gρ).'), rearrange, ['v0c', 'sqrt(5*g*rho)'], { v0c: 'm/s' })
    ]
  },
  {
    formula: 'arc.in.hS', title: tri('脱离点高出圆心的高度', 'Height of the leaving point above the centre', 'Höhe des Ablösepunkts über dem Mittelpunkt'),
    uses: ['arc-inside.forces'],
    steps: [
      st('-mg\\cos\\varphi_s = \\dfrac{mv_s^2}{\\rho}', tri('脱离处 N = 0：重力的法向分量单独提供向心力（φ_s > π/2，cos φ_s < 0）。', 'At the leaving point N = 0: the radial component of the weight alone provides the centripetal force (φ_s > π/2, cos φ_s < 0).', 'Am Ablösepunkt ist N = 0: Die radiale Komponente der Gewichtskraft allein ist die Zentripetalkraft (φ_s > π/2, cos φ_s < 0).'), radial, ['-m*g*cs', 'm*vs^2/rho'], { cs: '', vs: 'm/s' }),
      st('v_s^2 = v_0^2 - 2g\\rho(1 - \\cos\\varphi_s)', tri('机械能守恒。', 'Conservation of mechanical energy.', 'Energieerhaltung.'), energy, ['vs^2', 'v0^2 - 2*g*rho*(1 - cs)'], { vs: 'm/s', cs: '' }),
      st('h = -\\rho\\cos\\varphi_s = \\dfrac{v_0^2 - 2g\\rho}{3g}', tri('两式联立消去 v_s，h 为脱离点高出圆心的高度。', 'Eliminating v_s from both; h is the height above the centre.', 'v_s aus beiden eliminieren; h ist die Höhe über dem Mittelpunkt.'), rearrange, ['h', '(v0^2 - 2*g*rho)/(3*g)'], { h: 'm' })
    ]
  },
  {
    formula: 'arc.in.vS', title: tri('脱离轨道时的速率', 'Speed when leaving the track', 'Geschwindigkeit beim Ablösen'),
    uses: ['arc-inside.forces'],
    steps: [
      st('v_s^2 = -g\\rho\\cos\\varphi_s = g h', tri('由脱离条件，h = −ρ cos φ_s。', 'From the leaving condition, with h = −ρ cos φ_s.', 'Aus der Ablösebedingung, mit h = −ρ cos φ_s.'), radial, ['vs^2', 'g*h'], { vs: 'm/s', h: 'm' }),
      st('v_s = \\sqrt{\\dfrac{v_0^2 - 2g\\rho}{3}}', tri('代入脱离点的高度 h = (v₀² − 2gρ)/(3g)。', 'With the height h = (v₀² − 2gρ)/(3g).', 'Mit der Höhe h = (v₀² − 2gρ)/(3g).'), previous, ['vs', 'sqrt((v0^2 - 2*g*rho)/3)'], { vs: 'm/s' })
    ]
  },
  {
    formula: 'arc.out.Ntop', note: tri('拱形桥：压力小于重力（失重）', 'Hump bridge: the force is less than the weight (apparent weight loss)', 'Bogenbrücke: Die Kraft ist kleiner als die Gewichtskraft (scheinbare Gewichtsabnahme)'), title: tri('最高点轨道的支持力', 'Normal force of the track at the top', 'Normalkraft der Bahn im höchsten Punkt'),
    uses: ['arc-outside.forces'],
    steps: [
      st('mg - N = \\dfrac{mv_t^2}{\\rho}', tri('最高点 θ = 0：重力向下指向圆心，支持力向上。', 'At the top θ = 0: the weight points down towards the centre, the normal force up.', 'Oben ist θ = 0: Die Gewichtskraft zeigt nach unten zum Mittelpunkt, die Normalkraft nach oben.'), radial, ['m*g - N', 'm*vt^2/rho'], { N: 'N' }),
      st('N = m\\left(g - \\dfrac{v_t^2}{\\rho}\\right)', tri('移项：压力小于重力。', 'Rearranged: the force is less than the weight.', 'Umgeformt: Die Kraft ist kleiner als die Gewichtskraft.'), rearrange, ['N', 'm*(g - vt^2/rho)'], { N: 'N' })
    ]
  },
  {
    formula: 'arc.out.crit', note: tri('N = 0：重力恰好提供向心力', 'N = 0: the weight alone provides the centripetal force', 'N = 0: Die Gewichtskraft allein ist die Zentripetalkraft'), title: tri('在最高点就离开的临界速率', 'Critical speed for leaving at the top', 'Grenzgeschwindigkeit für das Ablösen oben'),
    uses: ['arc-outside.forces'],
    steps: [
      st('N = m\\left(g - \\dfrac{v_t^2}{\\rho}\\right) = 0', tri('支持力减为零时物体离开圆弧。', 'The body leaves the track when the normal force drops to zero.', 'Der Körper löst sich, wenn die Normalkraft auf null sinkt.'), pushOnly, ['Nz', 'm*(g - vc^2/rho)'], { Nz: 'N', vc: 'm/s' }),
      st('v_t = \\sqrt{g\\rho}', tri('解得临界速率：重力恰好提供向心力。', 'The critical speed: the weight alone provides the centripetal force.', 'Die Grenzgeschwindigkeit: Die Gewichtskraft allein ist die Zentripetalkraft.'), rearrange, ['vc', 'sqrt(g*rho)'], { vc: 'm/s' })
    ]
  },
  {
    formula: 'arc.out.theta', title: tri('脱离处的位置角', 'Position angle where the body leaves', 'Lagewinkel beim Ablösen'),
    uses: ['arc-outside.forces'],
    steps: [
      st('mg\\cos\\theta_s = \\dfrac{mv_s^2}{\\rho}', tri('脱离处 N = 0。', 'At the leaving point N = 0.', 'Am Ablösepunkt ist N = 0.'), radial, ['m*g*cs', 'm*vs^2/rho'], { cs: '', vs: 'm/s' }),
      st('v_s^2 = v_t^2 + 2g\\rho(1 - \\cos\\theta_s)', tri('机械能守恒。', 'Conservation of mechanical energy.', 'Energieerhaltung.'), energy, ['vs^2', 'vt^2 + 2*g*rho*(1 - cs)'], { vs: 'm/s', cs: '' }),
      st('\\cos\\theta_s = \\dfrac{1}{3}\\left(\\dfrac{v_t^2}{g\\rho} + 2\\right)', tri('联立消去 v_s。v_t = 0（从最高点由静止滑下）时 cos θ_s = 2/3。', 'Eliminating v_s. For v_t = 0 (sliding from rest at the top) cos θ_s = 2/3.', 'v_s eliminieren. Für v_t = 0 (aus der Ruhe oben) ist cos θ_s = 2/3.'), rearrange, ['thetas', 'acos((vt^2/(g*rho) + 2)/3)'], { thetas: 'rad' })
    ]
  },
  {
    formula: 'arc.out.h', title: tri('脱离点高出圆心的高度', 'Height of the leaving point above the centre', 'Höhe des Ablösepunkts über dem Mittelpunkt'),
    uses: ['arc-outside.forces'],
    steps: [
      st('h = \\rho\\cos\\theta_s', tri('脱离点高出圆心 ρ cos θ_s。', 'The leaving point is ρ cos θ_s above the centre.', 'Der Ablösepunkt liegt ρ cos θ_s über dem Mittelpunkt.'), tri('几何关系', 'Geometry', 'Geometrie'), ['h', 'rho*cs'], { h: 'm', cs: '' }),
      st('h = \\dfrac{v_t^2/g + 2\\rho}{3}', tri('代入 cos θ_s = (v_t²/(gρ) + 2)/3。', 'With cos θ_s = (v_t²/(gρ) + 2)/3.', 'Mit cos θ_s = (v_t²/(gρ) + 2)/3.'), previous, ['h', '(vt^2/g + 2*rho)/3'], { h: 'm' })
    ]
  },
  {
    formula: 'arc.out.v', title: tri('脱离圆弧时的速率', 'Speed when leaving the track', 'Geschwindigkeit beim Ablösen'),
    uses: ['arc-outside.forces'],
    steps: [
      st('v_s^2 = g\\rho\\cos\\theta_s', tri('由脱离条件 N = 0。', 'From the leaving condition N = 0.', 'Aus der Ablösebedingung N = 0.'), radial, ['vs^2', 'g*rho*cs'], { vs: 'm/s', cs: '' }),
      st('v_s = \\sqrt{\\dfrac{v_t^2 + 2g\\rho}{3}}', tri('代入 cos θ_s。', 'With cos θ_s.', 'Mit cos θ_s.'), previous, ['vs', 'sqrt((vt^2 + 2*g*rho)/3)'], { vs: 'm/s' })
    ]
  }
]
