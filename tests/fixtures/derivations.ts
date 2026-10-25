/**
 * Sample derivations for the detail tests (the real content lives in src/formula/derivations, written against the
 * same contract). Two formulas: the incline acceleration (with a shared force analysis) and the 1D collision.
 */
import type { Derivation, SharedSteps } from '../../src/formula/derivations/types'

export const SAMPLE_SHARED: SharedSteps[] = [{
  id: 'incline.block-forces',
  title: { zh: '物块的受力分析', en: 'Forces on the block', de: 'Kräfte am Klotz' },
  steps: [
    {
      latex: 'G = mg,\\quad G_{\\parallel} = mg\\sin\\theta,\\quad G_{\\perp} = mg\\cos\\theta',
      text: { zh: '物块受重力、支持力和摩擦力。把重力沿斜面和垂直斜面分解。', en: 'The block feels gravity, the normal force and friction. Resolve gravity along and normal to the incline.', de: 'Auf den Klotz wirken Gewichtskraft, Normalkraft und Reibungskraft. Zerlege die Gewichtskraft parallel und senkrecht zur schiefen Ebene.' },
      basis: { zh: '力的分解', en: 'Resolution of forces', de: 'Kräftezerlegung' }
    },
    {
      latex: 'N = mg\\cos\\theta',
      text: { zh: '垂直斜面方向没有加速度，支持力与重力的垂直分力平衡。', en: 'There is no acceleration normal to the incline, so the normal force balances the normal component of gravity.', de: 'Senkrecht zur Ebene gibt es keine Beschleunigung; die Normalkraft hält der Normalkomponente der Gewichtskraft das Gleichgewicht.' },
      basis: { zh: '牛顿第二定律，垂直斜面方向', en: "Newton's second law, normal to the incline", de: 'Zweites newtonsches Gesetz, senkrecht zur Ebene' },
      check: { lhs: 'm*g*cos(theta)', rhs: 'm*g' }
    }
  ]
}]

export const SAMPLE_DERIVATIONS: Derivation[] = [
  {
    formula: 'incline.a.down',
    title: { zh: '沿斜面的加速度（相对斜面向下滑）', en: 'Acceleration along the incline (sliding down)', de: 'Beschleunigung längs der schiefen Ebene (Abwärtsgleiten)' },
    note: { zh: '沿斜面向下为正', en: 'Down the incline is positive', de: 'Hangabwärts positiv' },
    uses: ['incline.block-forces'],
    steps: [
      {
        latex: 'f = \\mu_k N = \\mu_k mg\\cos\\theta',
        text: { zh: '物块相对斜面向下滑动，滑动摩擦力沿斜面向上。', en: 'The block slides down relative to the incline, so kinetic friction acts up the incline.', de: 'Der Klotz gleitet relativ zur Ebene abwärts, also wirkt die Gleitreibungskraft hangaufwärts.' },
        basis: { zh: '滑动摩擦力公式', en: 'Kinetic friction', de: 'Gleitreibungsgesetz' }
      },
      {
        latex: 'ma = mg\\sin\\theta - \\mu_k mg\\cos\\theta',
        text: { zh: '沿斜面方向列牛顿第二定律。', en: "Apply Newton's second law along the incline.", de: 'Stelle das zweite newtonsche Gesetz längs der Ebene auf.' },
        basis: { zh: '牛顿第二定律，沿斜面方向', en: "Newton's second law, along the incline", de: 'Zweites newtonsches Gesetz, längs der Ebene' }
      },
      {
        latex: 'a = g(\\sin\\theta - \\mu_k\\cos\\theta)',
        text: { zh: '两边除以 m。', en: 'Divide by m.', de: 'Teile durch m.' },
        basis: { zh: '上一步', en: 'Previous step', de: 'Vorheriger Schritt' },
        check: { lhs: 'a', rhs: 'g*(sin(theta) - muK*cos(theta))' },
        symbols: { a: 'm/s²' }
      }
    ]
  },
  {
    formula: 'col.v1',
    title: { zh: '碰后物体 1 的速度（沿连心线）', en: 'Velocity of body 1 after the impact (along the line of centres)', de: 'Geschwindigkeit von Körper 1 nach dem Stoß (längs der Zentrallinie)' },
    steps: [
      {
        latex: "m_1u_1 + m_2u_2 = m_1v_1' + m_2v_2'",
        text: { zh: '碰撞时间极短，内力远大于外力，沿连心线动量守恒。', en: 'The impact is so short that the internal forces dominate: momentum along the line of centres is conserved.', de: 'Der Stoß ist so kurz, dass die inneren Kräfte überwiegen: Der Impuls längs der Zentrallinie bleibt erhalten.' },
        basis: { zh: '动量守恒定律', en: 'Conservation of momentum', de: 'Impulserhaltungssatz' }
      },
      {
        latex: "v_2' - v_1' = e(u_1 - u_2)",
        text: { zh: '恢复系数的定义：分离速度等于接近速度的 e 倍。', en: 'Definition of the coefficient of restitution: separation speed = e × approach speed.', de: 'Definition der Stoßzahl: Trennungsgeschwindigkeit = e · Annäherungsgeschwindigkeit.' },
        basis: { zh: '牛顿碰撞定律', en: "Newton's law of restitution", de: 'Newtonsches Stoßgesetz' }
      },
      {
        latex: "v_1' = \\dfrac{m_1u_1 + m_2u_2 - e\\,m_2(u_1 - u_2)}{m_1 + m_2}",
        text: { zh: '两式联立，消去 v₂′。', en: "Solve both equations for v₁′ (eliminate v₂′).", de: 'Beide Gleichungen nach v₁′ auflösen (v₂′ eliminieren).' },
        basis: { zh: '联立求解', en: 'Solve simultaneously', de: 'Gleichungssystem lösen' }
      }
    ]
  }
]

const byId = new Map(SAMPLE_DERIVATIONS.map(d => [d.formula, d]))
const sharedById = new Map(SAMPLE_SHARED.map(s => [s.id, s]))
/** Lookup functions for DetailOptions. */
export const sampleDerivation = (id: string): Derivation | null => byId.get(id) ?? null
export const sampleShared = (id: string): SharedSteps | null => sharedById.get(id) ?? null
