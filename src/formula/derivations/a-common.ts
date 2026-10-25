/**
 * Helpers and recurring texts of the group-A derivations (manual 26.50, D28). Plain data builders: no logic
 * beyond assembling `DerivationStep` objects, so the content files read like a worked solution.
 */
import type { Tri } from '../../i18n/tri'
import type { DerivationStep } from './types'

/** One text in Chinese, English and German. */
export function tri(zh: string, en: string, de: string): Tri {
  return { zh, en, de }
}

/**
 * One derivation step: the equation (KaTeX), what is done, the law or reason, the machine-checkable form
 * `[lhs, rhs]` (formula/expr.ts syntax) and the units of symbols the situation does not provide.
 */
export function st(latex: string, text: Tri, basis: Tri, check: [string, string], symbols?: Record<string, string>): DerivationStep {
  const s: DerivationStep = { latex, text, basis, check: { lhs: check[0], rhs: check[1] } }
  if (symbols) s.symbols = symbols
  return s
}

/** Cause listed by the library for exact formulas: numerical integration error. */
export const CAUSE_NUM: Tri = tri(
  '数值积分误差（可减小时间步长或容差）',
  'Numerical integration error (reduce the time step or the tolerance)',
  'Numerischer Integrationsfehler (Zeitschritt oder Toleranz verkleinern)'
)

/** Recurring bases (laws and reasons). */
export const B = {
  freeBody: tri('受力分析；牛顿第二定律', "Free-body diagram; Newton's second law", 'Kräfteanalyse (Freikörperbild); zweites Newtonsches Gesetz'),
  n2: tri('牛顿第二定律', "Newton's second law", 'Zweites Newtonsches Gesetz'),
  n2Along: tri('牛顿第二定律（沿斜面方向）', "Newton's second law along the incline", 'Zweites Newtonsches Gesetz parallel zur schiefen Ebene'),
  n2Normal: tri('牛顿第二定律（垂直斜面方向，a_y = 0）', "Newton's second law perpendicular to the incline (a_y = 0)", 'Zweites Newtonsches Gesetz senkrecht zur schiefen Ebene (a_y = 0)'),
  n2Vertical: tri('牛顿第二定律（竖直方向，a_y = 0）', "Newton's second law in the vertical direction (a_y = 0)", 'Zweites Newtonsches Gesetz in senkrechter Richtung (a_y = 0)'),
  n2Horizontal: tri('牛顿第二定律（水平方向）', "Newton's second law in the horizontal direction", 'Zweites Newtonsches Gesetz in waagerechter Richtung'),
  n2Whole: tri('牛顿第二定律（整体法）', "Newton's second law for the whole system", 'Zweites Newtonsches Gesetz für das Gesamtsystem'),
  n3: tri('牛顿第三定律', "Newton's third law", 'Drittes Newtonsches Gesetz (actio = reactio)'),
  kinetic: tri('滑动摩擦力 f = μN，方向与相对运动方向相反', 'Kinetic friction f = μN, opposite to the relative motion', 'Gleitreibungskraft f = μ·N, entgegen der Relativbewegung'),
  maxStatic: tri('静摩擦力不超过最大静摩擦力（最大静摩擦力取 μN）', 'Static friction cannot exceed its maximum value (taken as μN)', 'Die Haftreibungskraft kann ihren Höchstwert (hier μ·N) nicht überschreiten'),
  resolve: tri('力的正交分解（重力与斜面法线的夹角等于倾角 θ）', 'Resolution into perpendicular components (the weight makes the angle θ with the normal of the incline)', 'Zerlegung in senkrechte Komponenten (Gewichtskraft und Normale der Ebene schließen den Winkel θ ein)'),
  prev: tri('上一步代入', 'Substitution of the previous result', 'Einsetzen des vorigen Ergebnisses'),
  rearrange: tri('上一步移项', 'Rearranging the previous equation', 'Umstellen der vorigen Gleichung'),
  solve: tri('解方程', 'Solving the equation', 'Auflösen der Gleichung'),
  algebra: tri('代数变形', 'Algebraic rearrangement', 'Algebraische Umformung'),
  combine: tri('联立求解', 'Solving the equations simultaneously', 'Lösen des Gleichungssystems'),
  uniformV: tri('匀变速直线运动的速度公式 v = v₀ + at', 'Velocity–time relation of uniformly accelerated motion, v = v₀ + at', 'Geschwindigkeit-Zeit-Gesetz der gleichmäßig beschleunigten Bewegung, v = v₀ + a·t'),
  uniformX: tri('匀变速直线运动的位移公式 x = v₀t + ½at²', 'Displacement–time relation of uniformly accelerated motion, x = v₀t + ½at²', 'Weg-Zeit-Gesetz der gleichmäßig beschleunigten Bewegung, x = v₀·t + ½·a·t²'),
  uniformVX: tri('匀变速直线运动的速度—位移关系 v² − v₀² = 2ax', 'Velocity–displacement relation of uniformly accelerated motion, v² − v₀² = 2ax', 'Zeitfreie Gleichung der gleichmäßig beschleunigten Bewegung, v² − v₀² = 2·a·x'),
  meanV: tri('匀变速直线运动的平均速度 (v₀ + v)/2', 'Mean velocity of uniformly accelerated motion, (v₀ + v)/2', 'Mittlere Geschwindigkeit der gleichmäßig beschleunigten Bewegung, (v₀ + v)/2'),
  uniformMotion: tri('匀速直线运动 x = vt', 'Uniform motion, x = vt', 'Gleichförmige Bewegung, x = v·t'),
  common: tri('共速条件（相对速度为零）', 'Condition of common velocity (zero relative velocity)', 'Bedingung der gemeinsamen Geschwindigkeit (Relativgeschwindigkeit null)'),
  relDisp: tri('相对位移等于两物体位移之差', 'The relative displacement is the difference of the two displacements', 'Die Relativverschiebung ist die Differenz der beiden Verschiebungen'),
  workDef: tri('功的定义 W = Fx', 'Definition of work, W = Fx', 'Definition der Arbeit, W = F·s'),
  heat: tri('功能关系：一对滑动摩擦力做功的代数和等于 −fΔs，减少的机械能转化为内能', 'Work–energy relation: the pair of kinetic friction forces does total work −fΔs; the lost mechanical energy becomes internal energy', 'Arbeit und Energie: Das Paar der Gleitreibungskräfte verrichtet insgesamt die Arbeit −f·Δs; die verlorene mechanische Energie wird zu innerer Energie'),
  momentum: tri('动量守恒定律', 'Conservation of momentum', 'Impulserhaltungssatz'),
  impulse: tri('动量定理', 'Impulse–momentum theorem', 'Impulssatz (Kraftstoß = Impulsänderung)'),
  restitution: tri('恢复系数的定义（分离速度 = e × 接近速度）', 'Definition of the coefficient of restitution (separation speed = e × approach speed)', 'Definition der Stoßzahl (Trennungsgeschwindigkeit = e · Annäherungsgeschwindigkeit)'),
  lightRope: tri('轻绳跨过光滑轻滑轮，绳上拉力处处相等', 'Light rope over a frictionless massless pulley: the tension is the same everywhere', 'Masseloses Seil über eine reibungsfreie masselose Rolle: Die Seilkraft ist überall gleich'),
  inextensible: tri('绳不可伸长（约束条件）', 'Inextensible rope (constraint)', 'Undehnbares Seil (Zwangsbedingung)'),
  accDef: tri('加速度的定义 a = Δv/Δt', 'Definition of acceleration, a = Δv/Δt', 'Definition der Beschleunigung, a = Δv/Δt'),
  velDef: tri('速度的定义 v = Δx/Δt', 'Definition of velocity, v = Δx/Δt', 'Definition der Geschwindigkeit, v = Δx/Δt'),
  quadratic: tri('一元二次方程求根公式', 'Quadratic formula', 'Lösungsformel für quadratische Gleichungen (Mitternachtsformel)'),
  earlier: tri('前面公式的结论', 'Result of an earlier formula', 'Ergebnis einer früheren Formel'),
  wholeResult: tri('整体法的结论', 'Result of the whole-system method', 'Ergebnis der Gesamtbetrachtung')
} as const
