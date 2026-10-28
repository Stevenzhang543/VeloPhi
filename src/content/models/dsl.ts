/**
 * Small constructors for the model registry files (26.56, D106): inputs, intermediate quantities, conditions and
 * outputs with trilingual labels, and the shared texts of assumptions. Pure data.
 */
import type { Tri } from '../../i18n/tri'
import type { UnitKind } from '../../units/units'
import type { CondSpec, InputSpec, LetSpec, OutputSpec, SolveSpec } from './types'
import { T } from './types'

export { T }

/** Input: id, KaTeX symbol, label (zh, en, de), SI unit, semantic quantity, example value, options. */
export function inp(id: string, symbol: string, label: Tri, unit: string, quantity: string, value: number, more: Partial<InputSpec> = {}): InputSpec {
  return { id, symbol, label, unit, quantity, value, ...more }
}

/** Positive input (open lower bound 0). */
export function pos(id: string, symbol: string, label: Tri, unit: string, quantity: string, value: number, more: Partial<InputSpec> = {}): InputSpec {
  return { id, symbol, label, unit, quantity, value, min: 0, open: true, ...more }
}

/** Non-negative input. */
export function nonneg(id: string, symbol: string, label: Tri, unit: string, quantity: string, value: number, more: Partial<InputSpec> = {}): InputSpec {
  return { id, symbol, label, unit, quantity, value, min: 0, ...more }
}

/** Angle input in rad (shown in degrees by default). */
export function angle(id: string, symbol: string, label: Tri, valueRad: number, more: Partial<InputSpec> = {}): InputSpec {
  return { id, symbol, label, unit: 'rad', quantity: 'angle', value: valueRad, ...more }
}

/** Intermediate quantity. */
export function let_(id: string, symbol: string, label: Tri, unit: string, expr: string, kind?: UnitKind): LetSpec {
  return kind ? { id, symbol, label, unit, expr, kind } : { id, symbol, label, unit, expr }
}

/** Condition. */
export function cond(id: string, label: Tri, expr: string, approx?: string, note?: Tri): CondSpec {
  const c: CondSpec = { id, label, expr }
  if (approx) c.approx = approx
  if (note) c.note = note
  return c
}

/** Output by formula. */
export function out(id: string, symbol: string, label: Tri, unit: string, expr: string, more: Partial<OutputSpec> = {}): OutputSpec {
  return { id, symbol, label, unit, expr, ...more }
}

/** Output as the roots of an equation. */
export function roots(id: string, symbol: string, label: Tri, unit: string, solve: SolveSpec, more: Partial<OutputSpec> = {}): OutputSpec {
  return { id, symbol, label, unit, solve, ...more }
}

/** Degrees to radians for example values. */
export const deg = (d: number) => (d * Math.PI) / 180

// ---- Shared labels ----

export const L = {
  m: T('质量', 'Mass', 'Masse'),
  g: T('重力加速度', 'Gravitational acceleration', 'Fallbeschleunigung'),
  t: T('时间', 'Time', 'Zeit'),
  h: T('高度', 'Height', 'Höhe'),
  v: T('速度', 'Velocity', 'Geschwindigkeit'),
  v0: T('初速度', 'Initial velocity', 'Anfangsgeschwindigkeit'),
  a: T('加速度', 'Acceleration', 'Beschleunigung'),
  x: T('位置', 'Position', 'Ort'),
  F: T('力', 'Force', 'Kraft'),
  theta: T('倾角', 'Angle of inclination', 'Neigungswinkel'),
  muK: T('动摩擦因数', 'Coefficient of kinetic friction', 'Gleitreibungszahl'),
  muS: T('静摩擦因数', 'Coefficient of static friction', 'Haftreibungszahl'),
  R: T('电阻', 'Resistance', 'Widerstand'),
  C: T('电容', 'Capacitance', 'Kapazität'),
  Lind: T('电感', 'Inductance', 'Induktivität'),
  U: T('电压', 'Voltage', 'Spannung'),
  emf: T('电源电动势', 'Source emf', 'Quellenspannung'),
  I: T('电流', 'Current', 'Stromstärke'),
  P: T('功率', 'Power', 'Leistung'),
  E: T('能量', 'Energy', 'Energie'),
  W: T('功', 'Work', 'Arbeit'),
  Q: T('热量', 'Heat', 'Wärme'),
  B: T('磁感应强度', 'Magnetic flux density', 'Magnetische Flussdichte'),
  q: T('电荷量', 'Charge', 'Ladung'),
  k: T('劲度系数', 'Spring constant', 'Federkonstante'),
  T: T('周期', 'Period', 'Periode'),
  f: T('频率', 'Frequency', 'Frequenz'),
  omega: T('角频率', 'Angular frequency', 'Kreisfrequenz'),
  lambda: T('波长', 'Wavelength', 'Wellenlänge'),
  rho: T('密度', 'Density', 'Dichte'),
  V: T('体积', 'Volume', 'Volumen'),
  p: T('压强', 'Pressure', 'Druck'),
  n: T('物质的量', 'Amount of substance', 'Stoffmenge'),
  temp: T('热力学温度', 'Thermodynamic temperature', 'Thermodynamische Temperatur'),
  dT: T('温差', 'Temperature difference', 'Temperaturdifferenz'),
  r: T('半径', 'Radius', 'Radius'),
  d: T('距离', 'Distance', 'Abstand'),
  len: T('长度', 'Length', 'Länge'),
  A: T('面积', 'Area', 'Fläche'),
  N: T('支持力', 'Normal force', 'Normalkraft'),
  f_fric: T('摩擦力', 'Friction force', 'Reibungskraft'),
  Ek: T('动能', 'Kinetic energy', 'Kinetische Energie'),
  p_mom: T('动量', 'Momentum', 'Impuls'),
  n_ref: T('折射率', 'Refractive index', 'Brechzahl'),
  N0: T('初始数目', 'Initial number', 'Anfangsanzahl'),
  halfLife: T('半衰期', 'Half-life', 'Halbwertszeit'),
  tau: T('时间常数', 'Time constant', 'Zeitkonstante'),
  e: T('恢复系数', 'Coefficient of restitution', 'Stoßzahl'),
  gamma: T('比热比 γ', 'Heat capacity ratio γ', 'Isentropenexponent γ'),
  c: T('波速', 'Wave speed', 'Wellengeschwindigkeit')
}

// ---- Shared assumptions ----

export const A = {
  noDrag: T('不计空气阻力', 'No air resistance', 'Kein Luftwiderstand'),
  uniformG: T('匀强重力场', 'Uniform gravitational field', 'Homogenes Schwerefeld'),
  point: T('物体视为质点', 'The body is a point mass', 'Der Körper ist ein Massenpunkt'),
  rigid: T('刚体，不形变', 'Rigid body, no deformation', 'Starrer Körper, keine Verformung'),
  lightRope: T('轻绳不可伸长，滑轮无质量无摩擦', 'Light inextensible rope, massless frictionless pulley', 'Leichtes undehnbares Seil, masselose reibungsfreie Rolle'),
  coulomb: T('库仑摩擦：静摩擦 |f| ≤ μsN，滑动摩擦 μkN', 'Coulomb friction: static |f| ≤ μsN, kinetic μkN', 'Coulombsche Reibung: Haftreibung |f| ≤ μsN, Gleitreibung μkN'),
  ideal: T('理想元件', 'Ideal elements', 'Ideale Bauteile'),
  lumped: T('集中参数电路（不计辐射与分布参数）', 'Lumped circuit (no radiation, no distributed parameters)', 'Konzentrierte Schaltung (keine Abstrahlung, keine verteilten Parameter)'),
  idealGas: T('理想气体，准静态过程', 'Ideal gas, quasi-static processes', 'Ideales Gas, quasistatische Prozesse'),
  vacuum: T('真空', 'Vacuum', 'Vakuum'),
  paraxial: T('近轴光线', 'Paraxial rays', 'Paraxiale Strahlen'),
  nonRel: T('非相对论近似', 'Non-relativistic approximation', 'Nichtrelativistische Näherung'),
  reduced: T('约化单位（ℏ = m = 1 等，数值为无量纲）', 'Reduced units (ℏ = m = 1 etc.; numbers are dimensionless)', 'Reduzierte Einheiten (ℏ = m = 1 usw.; Zahlen sind dimensionslos)'),
  steady: T('稳态', 'Steady state', 'Stationärer Zustand'),
  linear: T('线性、各向同性材料', 'Linear isotropic material', 'Lineares isotropes Material'),
  incompressible: T('不可压缩流体', 'Incompressible fluid', 'Inkompressibles Fluid'),
  thickness: T('二维截面乘以垂直纸面的厚度得到体积', 'Volume = 2D section × thickness perpendicular to the page', 'Volumen = 2D-Schnitt × Dicke senkrecht zur Zeichenebene'),
  smallAmp: T('小振幅（线性）', 'Small amplitude (linear)', 'Kleine Amplitude (linear)'),
  teachingUnits: T('教学参数（不是真实材料或天体的数据）', 'Teaching parameters (not data of a real material or body)', 'Unterrichtsparameter (keine Daten eines realen Materials oder Körpers)')
}

/** Common one-condition helpers. */
export const C = {
  positive: (id: string, v: string, label: Tri) => cond(id, label, `${v} > 0`)
}
