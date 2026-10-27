/**
 * Help texts of variable-force expressions for the inspector (decision D14). The expressions are parsed, checked and
 * evaluated in the Rust core (expr.rs); the check is `checkForceExpr` of engine/calc.ts.
 */
import { trDeep } from '../../i18n'

/** Variables of force expressions, in the order of the evaluation environment. */
export const FORCE_VARIABLES: ReadonlyArray<{ name: string; unit: string; label: string }> = trDeep([
  { name: 't', unit: 's', label: '时间' },
  { name: 'x', unit: 'm', label: '受力物体质心的 x 坐标' },
  { name: 'y', unit: 'm', label: '受力物体质心的 y 坐标' },
  { name: 'vx', unit: 'm/s', label: '质心速度的 x 分量' },
  { name: 'vy', unit: 'm/s', label: '质心速度的 y 分量' },
  { name: 'v', unit: 'm/s', label: '质心速率 √(vx² + vy²)' },
  { name: 'theta', unit: 'rad', label: '物体的角位置（逆时针为正）' },
  { name: 'omega', unit: 'rad/s', label: '物体的角速度（逆时针为正）' },
  { name: 'm', unit: 'kg', label: '物体的质量' },
  { name: 'g', unit: 'm/s²', label: '重力加速度的大小 |g|' }
])

const ALLOWED_FUNCTIONS = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'exp', 'ln', 'log', 'lg', 'sqrt', 'abs', 'min', 'max', 'sign', 'step', 'clamp', 'if']

/** Variables and functions available in force expressions, for the inspector's help text. */
export const FORCE_EXPR_HELP = trDeep({
  variables: FORCE_VARIABLES.map(v => v.name),
  constants: ['pi', 'e'],
  functions: ALLOWED_FUNCTIONS.slice(),
  /** One line per variable: name, meaning, SI unit. */
  variableInfo: FORCE_VARIABLES.map(v => ({ name: v.name, unit: v.unit, label: v.label })),
  /** One line per function. */
  functionInfo: [
    { name: 'sin(a)  cos(a)  tan(a)', label: '三角函数，参数为弧度' },
    { name: 'asin(a)  acos(a)  atan(a)  atan2(y, x)', label: '反三角函数，结果为弧度' },
    { name: 'exp(a)  ln(a)  log(a)  lg(a)', label: '指数；ln 与 log 均为自然对数，lg 为常用对数' },
    { name: 'sqrt(a)  abs(a)', label: '平方根、绝对值' },
    { name: 'min(a, b)  max(a, b)  clamp(a, lo, hi)', label: '较小值、较大值、限制在 [lo, hi] 内' },
    { name: 'sign(a)', label: '符号函数：a > 0 为 1，a < 0 为 −1，a = 0 为 0' },
    { name: 'step(a)', label: '阶跃函数：a ≥ 0 为 1，否则为 0（step(0) = 1）' },
    { name: 'if(a < b, p, q)', label: '条件：满足时取 p，否则取 q；比较可用 < <= > >=' }
  ],
  examples: ['10*sin(2*pi*t)', '5*step(t - 1)', '-0.5*vx', 'if(t < 2, 3*t, 6)', '-m*g*0.1*sign(vx)'],
  notes: [
    '分量写成世界坐标系中的 Fx、Fy（单位 N），x 向右、y 向上为正。',
    '数字视为带有合适单位的系数，例如 2*pi*t 中的 2π 单位为 1/s，-0.5*vx 中的 0.5 单位为 N·s/m。',
    '不连续处（step、sign、if 的切换）和折点（abs、min、max、clamp）作为事件精确定位，事件表中记为“变力切换”。',
    'sign(vx) 之类在速度为零附近来回切换的写法可能无法继续计算，模拟摩擦请使用接触面的摩擦因数。'
  ]
})
