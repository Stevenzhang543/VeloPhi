/**
 * Helpers and recurring "basis" texts of the group-B derivations (manual 26.50, D28). Only the b-*.ts content
 * files use this module.
 */
import type { Tri } from '../../i18n/tri'
import type { DerivationStep } from './types'

/** A text in Chinese, English and German. */
export function tri(zh: string, en: string, de: string): Tri {
  return { zh, en, de }
}

/**
 * One derivation step. `check` is written as "lhs = rhs" in formula/expr.ts syntax (the expression language
 * has no "=", so the split is unambiguous); `symbols` gives the units of the symbols the check introduces.
 */
export function step(latex: string, text: Tri, basis?: Tri, check?: string, symbols?: Record<string, string>): DerivationStep {
  const s: DerivationStep = { latex, text }
  if (basis) s.basis = basis
  if (check !== undefined) {
    const parts = check.split('=')
    if (parts.length !== 2) throw new Error(`derivation check needs exactly one "=": ${check}`)
    s.check = { lhs: parts[0].trim(), rhs: parts[1].trim() }
  }
  if (symbols) s.symbols = symbols
  return s
}

/** The basis texts used by several situations. */
export const B = {
  newton2: tri('牛顿第二定律', "Newton's second law", 'Zweites Newtonsches Gesetz'),
  newton2Tangential: tri('牛顿第二定律（切向）', "Newton's second law (tangential direction)", 'Zweites Newtonsches Gesetz (tangentiale Richtung)'),
  newton2Radial: tri('牛顿第二定律（法向）：合力提供向心力', "Newton's second law (radial direction): the resultant provides the centripetal force", 'Zweites Newtonsches Gesetz (radiale Richtung): Die Resultierende ist die Zentripetalkraft'),
  newton2Cm: tri('牛顿第二定律（质心）', "Newton's second law (centre of mass)", 'Zweites Newtonsches Gesetz (Schwerpunkt)'),
  newton3: tri('牛顿第三定律', "Newton's third law", 'Drittes Newtonsches Gesetz (actio = reactio)'),
  energy: tri('机械能守恒定律', 'Conservation of mechanical energy', 'Energieerhaltungssatz der Mechanik'),
  momentum: tri('动量守恒定律', 'Conservation of momentum', 'Impulserhaltungssatz'),
  impulse: tri('动量定理', 'Impulse–momentum theorem', 'Impulssatz (Kraftstoß = Impulsänderung)'),
  workEnergy: tri('动能定理', 'Work–energy theorem', 'Arbeitssatz (W = ΔE_kin)'),
  hooke: tri('胡克定律', "Hooke's law", 'Hookesches Gesetz'),
  shm: tri('简谐运动的特征：a = −ω²x', 'Defining property of simple harmonic motion: a = −ω²x', 'Kennzeichen der harmonischen Schwingung: a = −ω²x'),
  rotationLaw: tri('转动定律 M = Iβ', "Newton's second law for rotation, M = Iβ", 'Grundgesetz der Drehbewegung M = Iβ'),
  rotationLawCm: tri('转动定律（对质心）', "Newton's second law for rotation (about the centre of mass)", 'Grundgesetz der Drehbewegung (bezüglich des Schwerpunkts)'),
  parallelAxis: tri('平行轴定理', 'Parallel-axis theorem', 'Satz von Steiner'),
  rolling: tri('纯滚动条件（接触点无相对滑动）', 'Rolling condition (no slipping at the contact point)', 'Rollbedingung (kein Gleiten im Berührpunkt)'),
  kineticFriction: tri('滑动摩擦力 f = μN', 'Kinetic friction f = μN', 'Gleitreibungskraft f = μ·N'),
  angularMomentumTheorem: tri('角动量定理（对转轴）', 'Angular impulse–momentum theorem (about the axis)', 'Drehimpulssatz (bezüglich der Drehachse)'),
  angularMomentum: tri('角动量守恒定律（对转轴）', 'Conservation of angular momentum (about the axis)', 'Drehimpulserhaltungssatz (bezüglich der Drehachse)'),
  restitution: tri('恢复系数的定义（沿碰撞法线）', 'Definition of the coefficient of restitution (along the normal)', 'Definition der Stoßzahl (längs der Stoßnormalen)'),
  pointVelocity: tri('刚体上一点的速度 = 质心速度 + 绕质心转动的速度', 'Velocity of a point of a rigid body = velocity of the centre + velocity due to rotation', 'Geschwindigkeit eines Punkts eines starren Körpers = Schwerpunktgeschwindigkeit + Geschwindigkeit der Drehung'),
  geometry: tri('几何关系', 'Geometry', 'Geometrie'),
  previous: tri('上一步代入', 'Substitution of the previous result', 'Einsetzen des vorigen Ergebnisses'),
  rearrange: tri('整理', 'Rearranging', 'Umformen'),
  algebra: tri('代数化简', 'Algebraic simplification', 'Algebraische Umformung'),
  derivative: tri('上式对时间求导', 'Time derivative of the previous equation', 'Ableitung der vorigen Gleichung nach der Zeit'),
  substitution: tri('积分换元', 'Substitution in the integral', 'Substitution im Integral'),
  antiderivative: tri('积分（求原函数）', 'Integration (antiderivative)', 'Integration (Stammfunktion)')
}
