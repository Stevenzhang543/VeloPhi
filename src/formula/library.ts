/**
 * The formula library: plain data. Each entry names the situation it applies to, the conditions it needs,
 * a symbolic LaTeX form, an expression for the theoretical value in the situation's variables, its unit,
 * and the simulated measurement it is compared with. Adding a formula to a known situation needs no code;
 * a new kind of situation needs a recognizer (situations.ts). Expressions are checked for dimensions in the
 * tests.
 */
import { trDeep } from '../i18n'
/** One formula of the library. */
export interface FormulaDef {
  id: string
  /** Situation type the formula applies to. */
  situation: string
  title: string
  /** Symbolic form shown first, e.g. "a = g(\\sin\\theta - \\mu_k\\cos\\theta)". */
  latex: string
  /** Left-hand side used in the substituted line. */
  lhs: string
  /** Theoretical value as an expression (formula/expr.ts) of the situation's variables. */
  expr: string
  /** SI unit of the result. */
  unit: string
  /** Key of the simulated measurement in the situation sample. */
  measure: string
  /** 'exact' formulas must match the simulation; 'approx' ones are graded by `approxOf`. */
  kind: 'exact' | 'approx'
  /** Conditions (ids in the situation sample) that must hold. */
  requires?: string[]
  /** For approximations: the condition that grades the approximation (ok / approx / fail, fail: 'approx-invalid'). */
  approxOf?: string
  /** Solution method shown on the card (e.g. isolating one body). */
  method?: string
  /** Remark shown on the card. */
  note?: string
  /** Typical causes when the simulation deviates. */
  causes?: string[]
}

/** Cause listed when an exact formula deviates: numerical integration error. */
const NUM = ['数值积分误差（可减小时间步长或容差）']

/** All formulas, grouped by situation. */
export const FORMULAS: FormulaDef[] = trDeep([
  // ---- Incline (static incline or inclined belt) ----
  { id: 'incline.a.down', situation: 'incline', title: '沿斜面的加速度（相对斜面向下滑）', latex: 'a = g(\\sin\\theta - \\mu_k\\cos\\theta)', lhs: 'a', expr: 'g*(sin(theta) - muK*cos(theta))', unit: 'm/s²', measure: 'a', kind: 'exact', requires: ['slideDown'], note: '沿斜面向下为正', causes: NUM },
  { id: 'incline.a.up', situation: 'incline', title: '沿斜面的加速度（相对斜面向上滑）', latex: 'a = g(\\sin\\theta + \\mu_k\\cos\\theta)', lhs: 'a', expr: 'g*(sin(theta) + muK*cos(theta))', unit: 'm/s²', measure: 'a', kind: 'exact', requires: ['slideUp'], note: '沿斜面向下为正；摩擦力沿斜面向下', causes: NUM },
  { id: 'incline.a.stick', situation: 'incline', title: '与斜面相对静止', latex: 'a = 0', lhs: 'a', expr: '0', unit: 'm/s²', measure: 'a', kind: 'exact', requires: ['stick'] },
  { id: 'incline.N', situation: 'incline', title: '斜面的支持力', latex: 'N = mg\\cos\\theta', lhs: 'N', expr: 'm*g*cos(theta)', unit: 'N', measure: 'N', kind: 'exact', requires: ['contact'], causes: NUM },
  { id: 'incline.f.kinetic', situation: 'incline', title: '滑动摩擦力', latex: 'f = \\mu_k mg\\cos\\theta', lhs: 'f', expr: 'muK*m*g*cos(theta)', unit: 'N', measure: 'f', kind: 'exact', requires: ['sliding'] },
  { id: 'incline.f.static', situation: 'incline', title: '静摩擦力（平衡）', latex: 'f = mg\\sin\\theta', lhs: 'f', expr: 'm*g*sin(theta)', unit: 'N', measure: 'f', kind: 'exact', requires: ['stick', 'staticHolds'] },
  { id: 'incline.v', situation: 'incline', title: '速度—时间关系', latex: 'v = v_0 + at', lhs: 'v', expr: 'v0 + a*t', unit: 'm/s', measure: 'v', kind: 'exact', requires: ['sliding'], note: 'a 取上面的理论值；v 沿斜面向下为正' },
  { id: 'incline.s', situation: 'incline', title: '位移—时间关系', latex: 's = v_0t + \\tfrac{1}{2}at^2', lhs: 's', expr: 'v0*t + a*t^2/2', unit: 'm', measure: 's', kind: 'exact', requires: ['sliding'] },
  { id: 'incline.t.common', situation: 'incline', title: '达到共速所需时间（传送带）', latex: 't_1 = \\dfrac{|u - v_0|}{|a|}', lhs: 't_1', expr: 'abs(u - v0)/abs(a)', unit: 's', measure: 'tEnd', kind: 'exact', requires: ['belt', 'sliding', 'endsAtCommon'] },

  // ---- Horizontal surface (ground or belt) ----
  { id: 'flat.a', situation: 'flat', title: '滑动时的加速度大小', latex: 'a = \\mu_k g', lhs: 'a', expr: 'muK*g', unit: 'm/s²', measure: 'aMag', kind: 'exact', requires: ['sliding'] },
  { id: 'flat.N', situation: 'flat', title: '支持力', latex: 'N = mg', lhs: 'N', expr: 'm*g', unit: 'N', measure: 'N', kind: 'exact', requires: ['contact', 'onlyGravity'] },
  { id: 'flat.f', situation: 'flat', title: '滑动摩擦力', latex: 'f = \\mu_k mg', lhs: 'f', expr: 'muK*m*g', unit: 'N', measure: 'f', kind: 'exact', requires: ['sliding', 'onlyGravity'] },
  { id: 'flat.t', situation: 'flat', title: '相对滑动持续时间', latex: 't_1 = \\dfrac{|u - v_0|}{\\mu_k g}', lhs: 't_1', expr: 'abs(u - v0)/(muK*g)', unit: 's', measure: 'tEnd', kind: 'exact', requires: ['sliding', 'endsAtRest', 'onlyGravity'], note: 'u 为接触面速度（静止地面 u = 0）' },
  { id: 'flat.x', situation: 'flat', title: '滑动阶段物块的位移', latex: 'x_1 = \\dfrac{|u^2 - v_0^2|}{2\\mu_k g}', lhs: 'x_1', expr: 'abs(u^2 - v0^2)/(2*muK*g)', unit: 'm', measure: 'xEnd', kind: 'exact', requires: ['sliding', 'endsAtRest', 'onlyGravity'] },
  { id: 'flat.ds', situation: 'flat', title: '相对滑动距离', latex: '\\Delta s = \\dfrac{(u - v_0)^2}{2\\mu_k g}', lhs: '\\Delta s', expr: '(u - v0)^2/(2*muK*g)', unit: 'm', measure: 'slideEnd', kind: 'exact', requires: ['sliding', 'endsAtRest', 'onlyGravity'] },
  { id: 'flat.Q', situation: 'flat', title: '摩擦生热', latex: 'Q = \\mu_k mg\\,\\Delta s', lhs: 'Q', expr: 'muK*m*g*(u - v0)^2/(2*muK*g)', unit: 'J', measure: 'heatEnd', kind: 'exact', requires: ['sliding', 'endsAtRest', 'onlyGravity'] },
  { id: 'flat.W', situation: 'flat', title: '传送带电机多做的功', latex: 'W = \\mu_k mg\\,u\\,t_1\\,\\mathrm{sgn}(u - v_0) = mu(u - v_0)', lhs: 'W', expr: 'muK*m*g*u*(u - v0)/(muK*g)', unit: 'J', measure: 'beltEnd', kind: 'exact', requires: ['belt', 'sliding', 'endsAtRest', 'onlyGravity'] },

  // ---- Board and block ----
  { id: 'bb.a1', situation: 'board-block', title: '物块的加速度大小', latex: 'a_1 = \\mu_1 g', lhs: 'a_1', expr: 'mu1*g', unit: 'm/s²', measure: 'a1', kind: 'exact', method: '隔离物块' },
  { id: 'bb.a2', situation: 'board-block', title: '木板的加速度', latex: 'a_2 = \\dfrac{\\mu_1 mg - \\mu_2(M+m)g}{M}', lhs: 'a_2', expr: '(mu1*m*g - mu2*(M + m)*g)/M', unit: 'm/s²', measure: 'a2', kind: 'exact', requires: ['boardMoves'], method: '隔离木板' },
  { id: 'bb.a2.rest', situation: 'board-block', title: '木板保持静止', latex: 'a_2 = 0\\quad(\\mu_1 m \\le \\mu_2 (M+m))', lhs: 'a_2', expr: '0', unit: 'm/s²', measure: 'a2', kind: 'exact', requires: ['boardRests'] },
  { id: 'bb.t', situation: 'board-block', title: '达到共速的时间', latex: 't_1 = \\dfrac{v_1 - v_2}{a_1 + a_2}', lhs: 't_1', expr: '(v1 - v2)/(mu1*g + a2)', unit: 's', measure: 'tEnd', kind: 'exact', requires: ['endsAtCommon'], note: 'v₁、v₂ 为本阶段开始时物块、木板的速度' },
  { id: 'bb.vc', situation: 'board-block', title: '共同速度', latex: 'v = v_2 + a_2 t_1', lhs: 'v', expr: 'v2 + a2*(v1 - v2)/(mu1*g + a2)', unit: 'm/s', measure: 'vEnd', kind: 'exact', requires: ['endsAtCommon'] },
  { id: 'bb.ds', situation: 'board-block', title: '相对滑动距离', latex: '\\Delta s = \\dfrac{(v_1 - v_2)\\,t_1}{2}', lhs: '\\Delta s', expr: '(v1 - v2)^2/(2*(mu1*g + a2))', unit: 'm', measure: 'slideEnd', kind: 'exact', requires: ['endsAtCommon'] },
  { id: 'bb.Q', situation: 'board-block', title: '物块与木板间摩擦生热', latex: 'Q = \\mu_1 mg\\,\\Delta s', lhs: 'Q', expr: 'mu1*m*g*(v1 - v2)^2/(2*(mu1*g + a2))', unit: 'J', measure: 'heatEnd', kind: 'exact', requires: ['endsAtCommon'] },
  { id: 'bt.a', situation: 'board-together', title: '共速后整体减速的加速度大小', latex: 'a = \\mu_2 g', lhs: 'a', expr: 'mu2*g', unit: 'm/s²', measure: 'aMag', kind: 'exact', requires: ['together', 'groundSliding'], method: '整体法' },
  { id: 'bt.f', situation: 'board-together', title: '共速后物块受到的静摩擦力', latex: 'f = m\\mu_2 g', lhs: 'f', expr: 'm*mu2*g', unit: 'N', measure: 'f', kind: 'exact', requires: ['together', 'groundSliding'], method: '隔离物块' },

  // ---- Collisions ----
  { id: 'col.v1', situation: 'collision', title: '碰后物体 1 的速度（沿连心线）', latex: "v_1' = \\dfrac{m_1u_1 + m_2u_2 - e\\,m_2(u_1 - u_2)}{m_1 + m_2}", lhs: "v_1'", expr: '(m1*u1 + m2*u2 - e*m2*(u1 - u2))/(m1 + m2)', unit: 'm/s', measure: 'v1', kind: 'exact', note: 'u、v 为沿碰撞法线（连心线）的分量' },
  { id: 'col.v2', situation: 'collision', title: '碰后物体 2 的速度（沿连心线）', latex: "v_2' = \\dfrac{m_1u_1 + m_2u_2 + e\\,m_1(u_1 - u_2)}{m_1 + m_2}", lhs: "v_2'", expr: '(m1*u1 + m2*u2 + e*m1*(u1 - u2))/(m1 + m2)', unit: 'm/s', measure: 'v2', kind: 'exact' },
  { id: 'col.px', situation: 'collision', title: '动量守恒（x 方向）', latex: "p_x' = m_1v_{1x} + m_2v_{2x}", lhs: "p_x'", expr: 'p0x', unit: 'kg·m/s', measure: 'px', kind: 'exact', requires: ['isolated'] },
  { id: 'col.py', situation: 'collision', title: '动量守恒（y 方向）', latex: "p_y' = m_1v_{1y} + m_2v_{2y}", lhs: "p_y'", expr: 'p0y', unit: 'kg·m/s', measure: 'py', kind: 'exact', requires: ['isolated', 'oblique'] },
  { id: 'col.dE', situation: 'collision', title: '碰撞损失的动能', latex: '\\Delta E_k = \\dfrac{m_1m_2(1 - e^2)(u_1 - u_2)^2}{2(m_1 + m_2)}', lhs: '\\Delta E_k', expr: 'm1*m2*(1 - e^2)*(u1 - u2)^2/(2*(m1 + m2))', unit: 'J', measure: 'dE', kind: 'exact', requires: ['frictionless'], note: '有摩擦冲量时动能损失更多' },
  { id: 'col.tangent', situation: 'collision', title: '光滑球切向速度不变', latex: "v_{1t}' = v_{1t}", lhs: "v_{1t}'", expr: 'w1', unit: 'm/s', measure: 'w1after', kind: 'exact', requires: ['oblique', 'frictionless'] },
  { id: 'col.angle', situation: 'collision', title: '等质量弹性斜碰：碰后速度互相垂直', latex: '\\angle(\\vec v_1\\,\', \\vec v_2\\,\') = \\dfrac{\\pi}{2}', lhs: '\\varphi', expr: 'pi/2', unit: 'rad', measure: 'angle', kind: 'exact', requires: ['oblique', 'equalMassElasticRest', 'frictionless'] },
  // 26.51: textbook special cases (D44)
  { id: 'col.el.v1', situation: 'collision', title: '弹性碰撞后物体 1 的速度', latex: "v_1' = \\dfrac{(m_1 - m_2)u_1 + 2m_2u_2}{m_1 + m_2}", lhs: "v_1'", expr: '((m1 - m2)*u1 + 2*m2*u2)/(m1 + m2)', unit: 'm/s', measure: 'v1', kind: 'exact', requires: ['elastic'], note: '动量守恒与动能守恒联立；u、v 为沿连心线的分量' },
  { id: 'col.el.v2', situation: 'collision', title: '弹性碰撞后物体 2 的速度', latex: "v_2' = \\dfrac{(m_2 - m_1)u_2 + 2m_1u_1}{m_1 + m_2}", lhs: "v_2'", expr: '((m2 - m1)*u2 + 2*m1*u1)/(m1 + m2)', unit: 'm/s', measure: 'v2', kind: 'exact', requires: ['elastic'] },
  { id: 'col.swap', situation: 'collision', title: '等质量弹性正碰：交换速度', latex: "v_1' = u_2", lhs: "v_1'", expr: 'u2', unit: 'm/s', measure: 'v1', kind: 'exact', requires: ['elastic', 'equalMass'] },
  { id: 'col.in.v', situation: 'collision', title: '完全非弹性碰撞后的共同速度', latex: "v' = \\dfrac{m_1u_1 + m_2u_2}{m_1 + m_2}", lhs: "v'", expr: '(m1*u1 + m2*u2)/(m1 + m2)', unit: 'm/s', measure: 'v1', kind: 'exact', requires: ['perfectlyInelastic'] },
  { id: 'col.in.dE', situation: 'collision', title: '完全非弹性碰撞损失的动能', latex: '\\Delta E_k = \\dfrac{m_1m_2(u_1 - u_2)^2}{2(m_1 + m_2)}', lhs: '\\Delta E_k', expr: 'm1*m2*(u1 - u2)^2/(2*(m1 + m2))', unit: 'J', measure: 'dE', kind: 'exact', requires: ['perfectlyInelastic', 'frictionless'], note: '损失的动能最多' },
  { id: 'bounce.v', situation: 'bounce', title: '与固定面碰撞后的法向速度', latex: "v_n' = -e\\,v_n", lhs: "v_n'", expr: '-e*u', unit: 'm/s', measure: 'v', kind: 'exact' },

  // ---- Projectile ----
  { id: 'pr.x', situation: 'projectile', title: '水平位置', latex: 'x = x_0 + v_{0x}t', lhs: 'x', expr: 'x0 + vx0*t', unit: 'm', measure: 'x', kind: 'exact' },
  { id: 'pr.y', situation: 'projectile', title: '竖直位置', latex: 'y = y_0 + v_{0y}t - \\tfrac{1}{2}gt^2', lhs: 'y', expr: 'y0 + vy0*t - g*t^2/2', unit: 'm', measure: 'y', kind: 'exact' },
  { id: 'pr.vx', situation: 'projectile', title: '水平速度不变', latex: 'v_x = v_{0x}', lhs: 'v_x', expr: 'vx0', unit: 'm/s', measure: 'vx', kind: 'exact' },
  { id: 'pr.vy', situation: 'projectile', title: '竖直速度', latex: 'v_y = v_{0y} - gt', lhs: 'v_y', expr: 'vy0 - g*t', unit: 'm/s', measure: 'vy', kind: 'exact' },
  { id: 'pr.T', situation: 'projectile', title: '飞行时间（落到 y₁ 高度）', latex: 'T = \\dfrac{v_{0y} + \\sqrt{v_{0y}^2 + 2g(y_0 - y_1)}}{g}', lhs: 'T', expr: '(vy0 + sqrt(vy0^2 + 2*g*(y0 - y1)))/g', unit: 's', measure: 'T', kind: 'exact', requires: ['lands'] },
  { id: 'pr.R', situation: 'projectile', title: '水平射程', latex: 'R = v_{0x}\\,T', lhs: 'R', expr: 'vx0*(vy0 + sqrt(vy0^2 + 2*g*(y0 - y1)))/g', unit: 'm', measure: 'R', kind: 'exact', requires: ['lands'] },
  // 26.51: free fall and conservation of mechanical energy (D44)
  { id: 'ff.v', situation: 'projectile', title: '自由落体的速度', latex: 'v = gt', lhs: 'v', expr: 'g*t', unit: 'm/s', measure: 'speed', kind: 'exact', requires: ['fromRest'] },
  { id: 'ff.h', situation: 'projectile', title: '自由落体的下落高度', latex: 'h = \\tfrac{1}{2}gt^2', lhs: 'h', expr: 'g*t^2/2', unit: 'm', measure: 'drop', kind: 'exact', requires: ['fromRest'] },
  { id: 'ff.v2', situation: 'projectile', title: '下落 h 时的速度', latex: 'v = \\sqrt{2gh}', lhs: 'v', expr: 'sqrt(2*g*h)', unit: 'm/s', measure: 'speed', kind: 'exact', requires: ['fromRest'], note: 'h 取仿真中已下落的高度' },
  { id: 'pr.E', situation: 'projectile', title: '机械能守恒', latex: '\\tfrac{1}{2}mv^2 + mgy = \\tfrac{1}{2}mv_0^2 + mgy_0', lhs: 'E', expr: 'm*(vx0^2 + vy0^2)/2 + m*g*y0', unit: 'J', measure: 'E', kind: 'exact', note: '只有重力做功' },
  { id: 'pr.v', situation: 'projectile', title: '由机械能守恒求速率', latex: 'v = \\sqrt{v_0^2 + 2g(y_0 - y)}', lhs: 'v', expr: 'sqrt(vx0^2 + vy0^2 + 2*g*(y0 - y))', unit: 'm/s', measure: 'speed', kind: 'exact', note: 'y 取仿真中此刻的高度' },
  { id: 'pr.H', situation: 'projectile', title: '最高点高度', latex: 'H = y_0 + \\dfrac{v_{0y}^2}{2g}', lhs: 'H', expr: 'y0 + vy0^2/(2*g)', unit: 'm', measure: 'H', kind: 'exact', requires: ['rises'] },

  // ---- Pendulum ----
  { id: 'pe.T.small', situation: 'pendulum', title: '单摆周期（小角度近似）', latex: 'T \\approx 2\\pi\\sqrt{\\dfrac{L}{g}}', lhs: 'T', expr: '2*pi*sqrt(L/g)', unit: 's', measure: 'T', kind: 'approx', approxOf: 'smallAngle', note: '仅当 sinθ ≈ θ 时成立', causes: ['摆角较大时 sinθ ≈ θ 不再成立，周期随振幅增大'] },
  { id: 'pe.T.exact', situation: 'pendulum', title: '单摆周期（任意摆角，精确）', latex: 'T = 4\\sqrt{\\dfrac{L}{g}}\\;K\\!\\left(\\sin\\dfrac{\\theta_0}{2}\\right)', lhs: 'T', expr: '4*sqrt(L/g)*ellipK(sin(theta0/2))', unit: 's', measure: 'T', kind: 'exact', requires: ['taut'], note: 'K 为第一类完全椭圆积分' },
  { id: 'pe.v', situation: 'pendulum', title: '最低点速率', latex: 'v = \\sqrt{2gL(1 - \\cos\\theta_0)}', lhs: 'v', expr: 'sqrt(2*g*L*(1 - cos(theta0)))', unit: 'm/s', measure: 'vBottom', kind: 'exact', requires: ['taut'] },
  { id: 'pe.F', situation: 'pendulum', title: '最低点绳的拉力', latex: 'F_T = mg(3 - 2\\cos\\theta_0)', lhs: 'F_T', expr: 'm*g*(3 - 2*cos(theta0))', unit: 'N', measure: 'TBottom', kind: 'exact', requires: ['taut'] },

  // ---- Spring oscillator ----
  { id: 'sp.T', situation: 'spring', title: '弹簧振子周期', latex: 'T = 2\\pi\\sqrt{\\dfrac{m}{k}}', lhs: 'T', expr: '2*pi*sqrt(m/k)', unit: 's', measure: 'T', kind: 'exact' },
  { id: 'sp.vmax', situation: 'spring', title: '最大速率（平衡位置）', latex: 'v_{\\max} = A\\sqrt{\\dfrac{k}{m}}', lhs: 'v_{\\max}', expr: 'A*sqrt(k/m)', unit: 'm/s', measure: 'vmax', kind: 'exact' },
  { id: 'sp.amax', situation: 'spring', title: '最大加速度（最大位移处）', latex: 'a_{\\max} = \\dfrac{kA}{m}', lhs: 'a_{\\max}', expr: 'k*A/m', unit: 'm/s²', measure: 'amax', kind: 'exact' },

  // ---- Fixed-axis rotation ----
  { id: 'ro.alpha', situation: 'rotation', title: '角加速度（转动定律）', latex: '\\beta = -\\dfrac{mgd\\sin\\varphi}{I}', lhs: '\\beta', expr: '-m*g*d*sin(phi)/Ip', unit: 'rad/s²', measure: 'alpha', kind: 'exact', note: 'I = I_C + md²（平行轴定理）；φ 为质心偏离竖直向下的角度' },
  { id: 'ro.omega', situation: 'rotation', title: '转到最低点的角速度（机械能守恒）', latex: '\\omega = \\sqrt{\\omega_0^2 + \\dfrac{2mgd(1 - \\cos\\varphi_0)}{I}}', lhs: '\\omega', expr: 'sqrt(omega0^2 + 2*m*g*d*(1 - cos(phi0))/Ip)', unit: 'rad/s', measure: 'omegaBottom', kind: 'exact', requires: ['reachesBottom'] },
  { id: 'ro.rod', situation: 'rotation', title: '细杆从水平释放到竖直的角速度', latex: '\\omega = \\sqrt{\\dfrac{3g}{L}}', lhs: '\\omega', expr: 'sqrt(3*g/L)', unit: 'rad/s', measure: 'omegaBottom', kind: 'exact', requires: ['thinRodFromHorizontal', 'reachesBottom'] },
  { id: 'ro.F', situation: 'rotation', title: '最低点铰链对物体的力', latex: 'F = mg + m\\omega^2 d', lhs: 'F', expr: 'm*g + m*d*(omega0^2 + 2*m*g*d*(1 - cos(phi0))/Ip)', unit: 'N', measure: 'FBottom', kind: 'exact', requires: ['reachesBottom'] },

  // ---- Rolling ----
  { id: 'rl.a', situation: 'rolling', title: '纯滚动的加速度', latex: 'a = \\dfrac{g\\sin\\theta}{1 + I/(mr^2)}', lhs: 'a', expr: 'g*sin(theta)/(1 + I/(m*r^2))', unit: 'm/s²', measure: 'a', kind: 'exact', requires: ['pureRolling'] },
  { id: 'rl.f', situation: 'rolling', title: '纯滚动所需的静摩擦力', latex: 'f = \\dfrac{I}{r^2}\\,a', lhs: 'f', expr: 'I/r^2*g*sin(theta)/(1 + I/(m*r^2))', unit: 'N', measure: 'f', kind: 'exact', requires: ['pureRolling'] },
  { id: 'rl.vw', situation: 'rolling', title: '纯滚动条件', latex: 'v = \\omega r', lhs: 'v', expr: 'omegaSim*r', unit: 'm/s', measure: 'v', kind: 'exact', requires: ['pureRolling'], note: 'ω 取仿真值，检验接触点相对速度为零' },
  { id: 'rl.a.slip', situation: 'rolling', title: '边滚边滑：质心加速度', latex: 'a = g(\\sin\\theta - \\mu_k\\cos\\theta)', lhs: 'a', expr: 'g*(sin(theta) - muK*cos(theta))', unit: 'm/s²', measure: 'a', kind: 'exact', requires: ['slipping'] },
  { id: 'rl.beta.slip', situation: 'rolling', title: '边滚边滑：角加速度', latex: '\\beta = \\dfrac{\\mu_k mgr\\cos\\theta}{I}', lhs: '\\beta', expr: 'muK*m*g*r*cos(theta)/I', unit: 'rad/s²', measure: 'beta', kind: 'exact', requires: ['slipping'] },

  // ---- Impact on a hinged body ----
  { id: 'hi.v', situation: 'hinged-impact', title: '碰后小球速度（沿碰撞法线）', latex: "v' = \\dfrac{v\\,(md^2 - eI)}{md^2 + I}", lhs: "v'", expr: 'v*(m*d^2 - e*Ip)/(m*d^2 + Ip)', unit: 'm/s', measure: 'vAfter', kind: 'exact', requires: ['rest', 'frictionless'] },
  { id: 'hi.w', situation: 'hinged-impact', title: '碰后物体的角速度', latex: "\\omega' = \\dfrac{(1 + e)\\,mdv}{md^2 + I}", lhs: "\\omega'", expr: '(1 + e)*m*d*v/(m*d^2 + Ip)', unit: 'rad/s', measure: 'omegaAfter', kind: 'exact', requires: ['rest', 'frictionless'] },
  { id: 'hi.L', situation: 'hinged-impact', title: '对转轴的角动量守恒', latex: "L' = L", lhs: "L'", expr: 'L0', unit: 'kg·m²/s', measure: 'LAfter', kind: 'exact' },

  // ---- Connected bodies ----
  { id: 'pu.a', situation: 'pulley', title: '加速度（整体法）', latex: 'a = \\dfrac{m_2 g - \\mu m_1 g}{m_1 + m_2}', lhs: 'a', expr: '(m2*g - mu*m1*g)/(m1 + m2)', unit: 'm/s²', measure: 'a', kind: 'exact', requires: ['moving'], method: '整体法' },
  { id: 'pu.T2', situation: 'pulley', title: '绳的拉力（隔离悬挂物块）', latex: 'T = m_2(g - a)', lhs: 'T', expr: 'm2*(g - (m2*g - mu*m1*g)/(m1 + m2))', unit: 'N', measure: 'T', kind: 'exact', requires: ['moving'], method: '隔离法（物块2）' },
  { id: 'pu.T1', situation: 'pulley', title: '绳的拉力（隔离桌上物块）', latex: 'T = m_1(a + \\mu g)', lhs: 'T', expr: 'm1*((m2*g - mu*m1*g)/(m1 + m2) + mu*g)', unit: 'N', measure: 'T', kind: 'exact', requires: ['moving'], method: '隔离法（物块1）' },
  { id: 'at.a', situation: 'atwood', title: '阿特伍德机加速度（整体法）', latex: 'a = \\dfrac{(m_2 - m_1)g}{m_1 + m_2}', lhs: 'a', expr: '(m2 - m1)*g/(m1 + m2)', unit: 'm/s²', measure: 'a', kind: 'exact', method: '整体法' },
  { id: 'at.T', situation: 'atwood', title: '绳的拉力（隔离法）', latex: 'T = \\dfrac{2m_1m_2 g}{m_1 + m_2}', lhs: 'T', expr: '2*m1*m2*g/(m1 + m2)', unit: 'N', measure: 'T', kind: 'exact', method: '隔离法' },

  // ---- Vertical circle (rope) ----
  { id: 'vc.r.T0', situation: 'vcircle-rope', title: '最低点绳的拉力', latex: 'F_T = mg + \\dfrac{mv_0^2}{L}', lhs: 'F_T', expr: 'm*g + m*v0^2/L', unit: 'N', measure: 'TBottom', kind: 'exact', requires: ['atBottom'], causes: NUM },
  { id: 'vc.r.vtop', situation: 'vcircle-rope', title: '最高点速率（机械能守恒）', latex: 'v_{\\text{top}} = \\sqrt{v_0^2 - 4gL}', lhs: 'v_{\\text{top}}', expr: 'sqrt(v0^2 - 4*g*L)', unit: 'm/s', measure: 'vTop', kind: 'exact', requires: ['fullCircle', 'reachesTop'] },
  { id: 'vc.r.Ttop', situation: 'vcircle-rope', title: '最高点绳的拉力', latex: 'F_T = \\dfrac{mv_{\\text{top}}^2}{L} - mg = \\dfrac{m(v_0^2 - 5gL)}{L}', lhs: 'F_T', expr: 'm*(v0^2 - 5*g*L)/L', unit: 'N', measure: 'TTop', kind: 'exact', requires: ['fullCircle', 'reachesTop'], note: '最高点速率等于临界速度 √(gL) 时拉力为零' },
  { id: 'vc.r.crit', situation: 'vcircle-rope', title: '恰能通过最高点的最低点速度', latex: 'v_0 = \\sqrt{5gL}\\quad(v_{\\mathrm{top}} = \\sqrt{gL})', lhs: 'v_0', expr: 'sqrt(5*g*L)', unit: 'm/s', measure: 'v0crit', kind: 'exact', note: '最高点的临界条件：只有重力提供向心力，mg = mv²/L，即 v = √(gL)' },
  { id: 'vc.r.slackv', situation: 'vcircle-rope', title: '绳恰好松弛的条件', latex: 'v^2 = -gL\\cos\\varphi_s\\quad(\\varphi_s = \\pi:\\ v = \\sqrt{gL})', lhs: 'v', expr: 'sqrt(-g*L*cos(phiS))', unit: 'm/s', measure: 'vSlack', kind: 'exact', requires: ['slack'], note: 'φ_s 取仿真中绳松弛处的位置角（自最低点量起）' },
  { id: 'vc.r.phiS', situation: 'vcircle-rope', title: '绳松弛处的位置角', latex: '\\cos\\varphi_s = \\dfrac{2gL - v_0^2}{3gL}', lhs: '\\varphi_s', expr: 'acos((2*g*L - v0^2)/(3*g*L))', unit: 'rad', measure: 'phiSlack', kind: 'exact', requires: ['slack'], note: '位置角自最低点沿运动方向量起' },
  { id: 'vc.r.hS', situation: 'vcircle-rope', title: '松弛点高出圆心的高度', latex: 'h = \\dfrac{v_0^2 - 2gL}{3g}', lhs: 'h', expr: '(v0^2 - 2*g*L)/(3*g)', unit: 'm', measure: 'hSlack', kind: 'exact', requires: ['slack'] },
  { id: 'vc.r.vS', situation: 'vcircle-rope', title: '绳松弛时小球的速率', latex: 'v_s = \\sqrt{\\dfrac{v_0^2 - 2gL}{3}}', lhs: 'v_s', expr: 'sqrt((v0^2 - 2*g*L)/3)', unit: 'm/s', measure: 'vSlack', kind: 'exact', requires: ['slack'] },
  { id: 'vc.r.tS', situation: 'vcircle-rope', title: '绳松弛的时刻（椭圆积分）', latex: 't_s = \\dfrac{2L}{v_0}\\left[F\\!\\left(\\tfrac{\\varphi_s}{2}, k\\right) - F\\!\\left(\\tfrac{\\varphi_0}{2}, k\\right)\\right],\; k = \\dfrac{2\\sqrt{gL}}{v_0}', lhs: 't_s', expr: '2*L/v0*(ellipF(acos((2*g*L - v0^2)/(3*g*L))/2, 2*sqrt(g*L)/v0) - ellipF(phi0/2, 2*sqrt(g*L)/v0))', unit: 's', measure: 'tSlack', kind: 'exact', requires: ['slack'], note: 'F 为第一类不完全椭圆积分；φ₀ 为本段起点的位置角（从最低点出发时为 0），时间自本段开始量起' },

  // ---- Vertical circle (rod) ----
  { id: 'vc.d.F0', situation: 'vcircle-rod', title: '最低点杆的拉力', latex: 'F = mg + \\dfrac{mv_0^2}{L}', lhs: 'F', expr: 'm*g + m*v0^2/L', unit: 'N', measure: 'FBottom', kind: 'exact', requires: ['atBottom'] },
  { id: 'vc.d.vtop', situation: 'vcircle-rod', title: '最高点速率（机械能守恒）', latex: 'v_{\\text{top}} = \\sqrt{v_0^2 - 4gL}', lhs: 'v_{\\text{top}}', expr: 'sqrt(v0^2 - 4*g*L)', unit: 'm/s', measure: 'vTop', kind: 'exact', requires: ['reachesTop'] },
  { id: 'vc.d.Ftop', situation: 'vcircle-rod', title: '最高点杆对球的力（拉为正）', latex: 'F = \\dfrac{mv_{\\text{top}}^2}{L} - mg = \\dfrac{m(v_0^2 - 5gL)}{L}', lhs: 'F', expr: 'm*(v0^2 - 5*g*L)/L', unit: 'N', measure: 'FTop', kind: 'exact', requires: ['reachesTop'], note: 'F > 0 为拉力，F < 0 为支持力（推力）；v_top = √(gL) 时 F = 0' },
  { id: 'vc.d.zero', situation: 'vcircle-rod', title: '杆力为零时的速率', latex: 'v^2 = -gL\\cos\\varphi\\quad(v_{\\mathrm{top}} = \\sqrt{gL})', lhs: 'v', expr: 'sqrt(-g*L*cos(phiZ))', unit: 'm/s', measure: 'vZero', kind: 'exact', requires: ['forceZero'], note: 'φ 取仿真中杆力为零处的位置角' },

  // ---- Movable pulley ----
  { id: 'mp.rel', situation: 'movable-pulley', title: '加速度关系（动滑轮）', latex: 'a_1 = 2a_2', lhs: 'a_1', expr: '2*a2sim', unit: 'm/s²', measure: 'a1', kind: 'exact', note: '物块1移动的距离是动滑轮移动距离的 2 倍；a₂ 取仿真值' },
  { id: 'mp.a2', situation: 'movable-pulley', title: '动滑轮下物块的加速度（向上为正）', latex: 'a_2 = \\dfrac{(2m_1 - m_2)g}{4m_1 + m_2}', lhs: 'a_2', expr: '(2*m1 - m2)*g/(4*m1 + m2)', unit: 'm/s²', measure: 'a2', kind: 'exact', method: '隔离法联立' },
  { id: 'mp.a1', situation: 'movable-pulley', title: '绳端物块的加速度（向下为正）', latex: 'a_1 = \\dfrac{2(2m_1 - m_2)g}{4m_1 + m_2}', lhs: 'a_1', expr: '2*(2*m1 - m2)*g/(4*m1 + m2)', unit: 'm/s²', measure: 'a1', kind: 'exact', method: '隔离法联立' },
  { id: 'mp.T', situation: 'movable-pulley', title: '绳的拉力', latex: 'T = \\dfrac{3m_1m_2g}{4m_1 + m_2}', lhs: 'T', expr: '3*m1*m2*g/(4*m1 + m2)', unit: 'N', measure: 'T', kind: 'exact' },
  { id: 'mp.T1', situation: 'movable-pulley', title: '张力关系（隔离物块1）', latex: 'T = m_1(g - a_1)', lhs: 'T', expr: 'm1*(g - a1sim)', unit: 'N', measure: 'T', kind: 'exact', method: '隔离法（物块1）', note: 'a₁ 取仿真值' },
  { id: 'mp.T2', situation: 'movable-pulley', title: '张力关系（隔离动滑轮与物块2）', latex: '2T = m_2(g + a_2)', lhs: 'T', expr: 'm2*(g + a2sim)/2', unit: 'N', measure: 'T', kind: 'exact', method: '隔离法（动滑轮与物块2）', note: '动滑轮两侧两段绳各以 T 向上拉；a₂ 取仿真值' },

  // ---- Movable wedge ----
  { id: 'wd.A', situation: 'wedge', title: '斜面的加速度', latex: 'A = \\dfrac{mg\\sin\\theta\\cos\\theta}{M + m\\sin^2\\theta}', lhs: 'A', expr: 'm*g*sin(theta)*cos(theta)/(M + m*sin(theta)^2)', unit: 'm/s²', measure: 'A', kind: 'exact', method: '隔离法（斜面参考系中物块受惯性力）' },
  { id: 'wd.arel', situation: 'wedge', title: '物块相对斜面的加速度', latex: 'a_{\\mathrm{rel}} = \\dfrac{(M + m)g\\sin\\theta}{M + m\\sin^2\\theta}', lhs: 'a_{\\mathrm{rel}}', expr: '(M + m)*g*sin(theta)/(M + m*sin(theta)^2)', unit: 'm/s²', measure: 'arel', kind: 'exact' },
  { id: 'wd.N', situation: 'wedge', title: '斜面对物块的支持力', latex: 'N = \\dfrac{Mmg\\cos\\theta}{M + m\\sin^2\\theta}', lhs: 'N', expr: 'M*m*g*cos(theta)/(M + m*sin(theta)^2)', unit: 'N', measure: 'N', kind: 'exact', note: '小于固定斜面时的 mg cosθ' },
  { id: 'wd.px', situation: 'wedge', title: '水平方向动量守恒', latex: 'mv_{1x} + Mv_{2x} = p_{x0}', lhs: 'p_x', expr: 'p0x', unit: 'kg·m/s', measure: 'px', kind: 'exact', note: '地面光滑，系统水平方向不受外力' },

  // ---- Spring-joined bodies ----
  { id: 'sb.p', situation: 'spring-pair', title: '动量守恒（沿弹簧方向）', latex: 'm_1v_1\' + m_2v_2\' = m_1v_1 + m_2v_2', lhs: 'p', expr: 'm1*v1 + m2*v2', unit: 'kg·m/s', measure: 'p', kind: 'exact' },
  { id: 'sb.vc', situation: 'spring-pair', title: '弹簧形变最大时两物块共速', latex: 'v = \\dfrac{m_1v_1 + m_2v_2}{m_1 + m_2}', lhs: 'v', expr: '(m1*v1 + m2*v2)/(m1 + m2)', unit: 'm/s', measure: 'vCommon', kind: 'exact' },
  { id: 'sb.Ep', situation: 'spring-pair', title: '弹性势能的最大值', latex: 'E_{p,\\max} = \\tfrac12 kx_0^2 + \\dfrac{m_1m_2(v_1 - v_2)^2}{2(m_1 + m_2)}', lhs: 'E_{p,\\max}', expr: 'k*x0^2/2 + m1*m2*(v1 - v2)^2/(2*(m1 + m2))', unit: 'J', measure: 'EpMax', kind: 'exact', note: '动能减少量等于弹性势能增加量（共速时动能最小）' },
  { id: 'sb.x', situation: 'spring-pair', title: '最大形变量', latex: 'x_{\\max} = |v_1 - v_2|\\sqrt{\\dfrac{m_1m_2}{k(m_1 + m_2)}}', lhs: 'x_{\\max}', expr: 'abs(v1 - v2)*sqrt(m1*m2/(k*(m1 + m2)))', unit: 'm', measure: 'xMax', kind: 'exact', requires: ['restStart'] },
  { id: 'sb.T', situation: 'spring-pair', title: '相对振动的周期', latex: 'T = 2\\pi\\sqrt{\\dfrac{m_1m_2}{k(m_1 + m_2)}}', lhs: 'T', expr: '2*pi*sqrt(m1*m2/(k*(m1 + m2)))', unit: 's', measure: 'T', kind: 'exact', note: '约化质量 μ = m₁m₂/(m₁ + m₂)' },

  // ---- Rolling with slipping (plane) ----
  { id: 'rs.a', situation: 'roll-slip', title: '打滑阶段质心加速度', latex: 'a = -\\mu_k g\\,\\operatorname{sgn}(v_0 + \\omega_0 r)', lhs: 'a', expr: '-muK*g*sign(v0 + omega0*r)', unit: 'm/s²', measure: 'a', kind: 'exact', note: 'v₀ + ω₀r 为接触点相对地面的滑动速度（ω 逆时针为正）' },
  { id: 'rs.beta', situation: 'roll-slip', title: '打滑阶段角加速度', latex: '\\beta = -\\dfrac{\\mu_k mgr}{I}\\operatorname{sgn}(v_0 + \\omega_0 r)', lhs: '\\beta', expr: '-muK*m*g*r/I*sign(v0 + omega0*r)', unit: 'rad/s²', measure: 'beta', kind: 'exact' },
  { id: 'rs.t', situation: 'roll-slip', title: '打滑持续时间', latex: 't_1 = \\dfrac{|v_0 + \\omega_0 r|}{\\mu_k g\\,(1 + mr^2/I)}', lhs: 't_1', expr: 'abs(v0 + omega0*r)/(muK*g*(1 + m*r^2/I))', unit: 's', measure: 'tEnd', kind: 'exact', requires: ['rolls'] },
  { id: 'rs.v', situation: 'roll-slip', title: '开始纯滚动时的速度', latex: 'v_1 = v_0 - \\dfrac{v_0 + \\omega_0 r}{1 + mr^2/I}', lhs: 'v_1', expr: 'v0 - (v0 + omega0*r)/(1 + m*r^2/I)', unit: 'm/s', measure: 'vEnd', kind: 'exact', requires: ['rolls'] },
  { id: 'rs.cyl.t', situation: 'roll-slip', title: '匀质圆柱（ω₀ = 0）的打滑时间', latex: 't_1 = \\dfrac{v_0}{3\\mu_k g}', lhs: 't_1', expr: 'v0/(3*muK*g)', unit: 's', measure: 'tEnd', kind: 'exact', requires: ['rolls', 'uniformDisc', 'noSpin'], note: '二维中的圆形物体是匀质圆柱（圆盘，I = ½mr²）；实心球的 t = 2v₀/(7μg) 是三维结果，这里不适用' },
  { id: 'rs.cyl.v', situation: 'roll-slip', title: '匀质圆柱（ω₀ = 0）的纯滚动速度', latex: 'v_1 = \\tfrac{2}{3}v_0', lhs: 'v_1', expr: '2*v0/3', unit: 'm/s', measure: 'vEnd', kind: 'exact', requires: ['rolls', 'uniformDisc', 'noSpin'], note: '实心球的 5v₀/7 是三维结果' },
  { id: 'rs.Q', situation: 'roll-slip', title: '打滑阶段摩擦生热', latex: 'Q = \\tfrac12 mv_0^2 + \\tfrac12 I\\omega_0^2 - \\tfrac12\\left(m + \\dfrac{I}{r^2}\\right)v_1^2', lhs: 'Q', expr: 'm*v0^2/2 + I*omega0^2/2 - (m + I/r^2)*(v0 - (v0 + omega0*r)/(1 + m*r^2/I))^2/2', unit: 'J', measure: 'heatEnd', kind: 'exact', requires: ['rolls'] },

  // ---- Variable force ----
  { id: 'vf.J', situation: 'var-force', title: '动量定理（变力的冲量）', latex: 'mv_x - mv_0 = \\int_{t_0}^{t} F_x\\,\\mathrm{d}t', lhs: 'I', expr: 'J', unit: 'N·s', measure: 'dp', kind: 'exact', requires: ['timeOnly'], note: '积分对表达式数值求积（与求解器无关），不连续处分段' },
  { id: 'vf.v', situation: 'var-force', title: '速度', latex: 'v_x = v_0 + \\dfrac{1}{m}\\int_{t_0}^{t} F_x\\,\\mathrm{d}t', lhs: 'v_x', expr: 'v0 + J/m', unit: 'm/s', measure: 'v', kind: 'exact', requires: ['timeOnly'] },
  { id: 'vf.x', situation: 'var-force', title: '位置', latex: 'x = x_0 + v_0(t - t_0) + \\dfrac{1}{m}\\int_{t_0}^{t}(t - s)F_x(s)\\,\\mathrm{d}s', lhs: 'x', expr: 'x0 + v0*(t - t0) + dx', unit: 'm', measure: 'x', kind: 'exact', requires: ['timeOnly'] },
  { id: 'vf.W', situation: 'var-force', title: '动能定理（变力做功）', latex: 'W = \\tfrac12 mv_x^2 - \\tfrac12 mv_0^2', lhs: 'W', expr: 'm*(v0 + J/m)^2/2 - m*v0^2/2', unit: 'J', measure: 'W', kind: 'exact', requires: ['timeOnly', 'noVerticalWork'] },
  { id: 'vf.sin.v', situation: 'var-force', title: 'F = F₀ sin ωt 时的速度', latex: 'v_x = v_0 + \\dfrac{F_0}{m\\omega}\\left(\\cos\\omega t_0 - \\cos\\omega t\\right)', lhs: 'v_x', expr: 'v0 + F0*(cos(omega*t0) - cos(omega*t))/(m*omega)', unit: 'm/s', measure: 'v', kind: 'exact', requires: ['sinusoid'] },
  { id: 'vf.sin.x', situation: 'var-force', title: 'F = F₀ sin ωt 时的位置', latex: 'x = x_0 + v_0\\tau + \\dfrac{F_0}{m\\omega}\\left[\\tau\\cos\\omega t_0 - \\dfrac{\\sin\\omega t - \\sin\\omega t_0}{\\omega}\\right],\\ \\tau = t - t_0', lhs: 'x', expr: 'x0 + v0*(t - t0) + F0/(m*omega)*((t - t0)*cos(omega*t0) - (sin(omega*t) - sin(omega*t0))/omega)', unit: 'm', measure: 'x', kind: 'exact', requires: ['sinusoid'] },

  // ---- 26.51: graded library (D44) and the physics of D50/D51 ----
  // Uniform motion
  { id: 'uni.s', situation: 'uniform', title: '匀速直线运动的路程', latex: 's = vt', lhs: 's', expr: 'v*t', unit: 'm', measure: 's', kind: 'exact', causes: NUM },
  { id: 'uni.v', situation: 'uniform', title: '速度 = 路程 ÷ 时间', latex: 'v = \\dfrac{s}{t}', lhs: 'v', expr: 's/t', unit: 'm/s', measure: 'v', kind: 'exact', note: 's 取仿真中通过的路程；匀速运动中平均速度等于瞬时速度' },
  { id: 'uni.F', situation: 'uniform', title: '牛顿第一定律：合力为零', latex: '\\textstyle\\sum F = 0', lhs: '\\textstyle\\sum F', expr: '0', unit: 'N', measure: 'F', kind: 'exact' },
  // Constant force on a horizontal surface
  { id: 'cf.a', situation: 'const-force', title: '恒力拉动物块的加速度', latex: 'a = \\dfrac{F\\cos\\alpha - \\mu(mg - F\\sin\\alpha)}{m}', lhs: 'a', expr: '(F*cos(alpha) - muK*(m*g - F*sin(alpha)))/m', unit: 'm/s²', measure: 'a', kind: 'exact', requires: ['forward'], method: '正交分解', causes: NUM },
  { id: 'cf.N', situation: 'const-force', title: '斜拉时的支持力', latex: 'N = mg - F\\sin\\alpha', lhs: 'N', expr: 'm*g - F*sin(alpha)', unit: 'N', measure: 'N', kind: 'exact' },
  { id: 'cf.W0', situation: 'const-force', title: '功 = 力 × 距离', latex: 'W = Fs', lhs: 'W', expr: 'F*s', unit: 'J', measure: 'W', kind: 'exact', requires: ['horizontalForce'], note: 's 取仿真中的位移' },
  { id: 'cf.W', situation: 'const-force', title: '恒力做功', latex: 'W = Fs\\cos\\alpha', lhs: 'W', expr: 'F*s*cos(alpha)', unit: 'J', measure: 'W', kind: 'exact', note: 's 取仿真中的位移' },
  { id: 'cf.P', situation: 'const-force', title: '功率 = 力 × 速度', latex: 'P = Fv\\cos\\alpha', lhs: 'P', expr: 'F*v*cos(alpha)', unit: 'W', measure: 'P', kind: 'exact', note: 'v 取仿真中此刻的速度' },
  { id: 'cf.dEk', situation: 'const-force', title: '动能定理', latex: '\\Delta E_k = [F\\cos\\alpha - \\mu(mg - F\\sin\\alpha)]\\,s', lhs: '\\Delta E_k', expr: '(F*cos(alpha) - muK*(m*g - F*sin(alpha)))*s', unit: 'J', measure: 'dEk', kind: 'exact', requires: ['forward'], note: '合力做的功等于动能的增加量；s 取仿真中的位移' },
  { id: 'cf.J', situation: 'const-force', title: '动量定理', latex: '\\Delta p = [F\\cos\\alpha - \\mu(mg - F\\sin\\alpha)]\\,t', lhs: '\\Delta p', expr: '(F*cos(alpha) - muK*(m*g - F*sin(alpha)))*t', unit: 'kg·m/s', measure: 'dp', kind: 'exact', requires: ['forward'] },
  // Lever
  { id: 'lever.F', situation: 'lever', title: '杠杆平衡条件', latex: 'F_1l_1 = F_2l_2', lhs: 'F_1', expr: 'm*g*l2/l1', unit: 'N', measure: 'T', kind: 'exact', note: 'F₂ = mg 为重物的重力；杠杆的重心在支点，自重不产生力矩' },
  { id: 'lever.N', situation: 'lever', title: '支点对杠杆的支持力', latex: 'N = Mg + mg + F_1', lhs: 'N', expr: 'M*g + m*g + m*g*l2/l1', unit: 'N', measure: 'N', kind: 'exact', requires: ['verticalRope'], method: '整体受力平衡' },
  // Uniform circular motion
  { id: 'uc.w', situation: 'circle', title: '角速度与线速度', latex: '\\omega = \\dfrac{v}{r}', lhs: '\\omega', expr: 'v/r', unit: 'rad/s', measure: 'omega', kind: 'exact' },
  { id: 'uc.T', situation: 'circle', title: '周期', latex: 'T = \\dfrac{2\\pi r}{v}', lhs: 'T', expr: '2*pi*r/v', unit: 's', measure: 'T', kind: 'exact' },
  { id: 'uc.a', situation: 'circle', title: '向心加速度', latex: 'a = \\dfrac{v^2}{r}', lhs: 'a', expr: 'v^2/r', unit: 'm/s²', measure: 'a', kind: 'exact' },
  { id: 'uc.F', situation: 'circle', title: '向心力', latex: 'F = \\dfrac{mv^2}{r}', lhs: 'F', expr: 'm*v^2/r', unit: 'N', measure: 'F', kind: 'exact' },
  // Orbits
  { id: 'or.F', situation: 'orbit', title: '万有引力定律', latex: 'F = \\dfrac{GMm}{r^2}', lhs: 'F', expr: 'G*M*m/r^2', unit: 'N', measure: 'F', kind: 'exact', note: 'r 取仿真中此刻的距离' },
  { id: 'or.v', situation: 'orbit', title: '圆轨道的环绕速度', latex: 'v = \\sqrt{\\dfrac{GM}{r}}', lhs: 'v', expr: 'sqrt(G*M/r0)', unit: 'm/s', measure: 'v', kind: 'exact', requires: ['circular'] },
  { id: 'or.T', situation: 'orbit', title: '开普勒第三定律（周期）', latex: 'T = 2\\pi\\sqrt{\\dfrac{a^3}{GM}}', lhs: 'T', expr: '2*pi*sqrt(a^3/(G*M))', unit: 's', measure: 'T', kind: 'exact', requires: ['bound'], note: '圆轨道 a = r' },
  { id: 'or.A', situation: 'orbit', title: '开普勒第二定律（掠面速度不变）', latex: '\\dfrac{\\mathrm{d}A}{\\mathrm{d}t} = \\tfrac{1}{2}r_0v_{0\\perp}', lhs: '\\dfrac{\\mathrm{d}A}{\\mathrm{d}t}', expr: 'L/(2*m)', unit: 'm²/s', measure: 'areal', kind: 'exact', note: '角动量守恒' },
  { id: 'or.vis', situation: 'orbit', title: '活力公式', latex: 'v^2 = GM\\left(\\dfrac{2}{r} - \\dfrac{1}{a}\\right)', lhs: 'v', expr: 'sqrt(G*M*(2/r - 1/a))', unit: 'm/s', measure: 'v', kind: 'exact', requires: ['bound'], note: 'r 取仿真中此刻的距离' },
  { id: 'or.E', situation: 'orbit', title: '轨道机械能', latex: 'E = -\\dfrac{GMm}{2a}', lhs: 'E', expr: '-G*M*m/(2*a)', unit: 'J', measure: 'E', kind: 'exact', requires: ['bound'] },
  { id: 'or.ecc', situation: 'orbit', title: '轨道偏心率', latex: 'e = \\sqrt{1 - \\dfrac{L^2}{GMm^2a}}', lhs: 'e', expr: 'sqrt(1 - L^2/(G*M*m^2*a))', unit: '', measure: 'ecc', kind: 'exact', requires: ['elliptic'], note: '仿真值由近点、远点距离求得 e = (r_max − r_min)/(r_max + r_min)' },
  // Air drag
  { id: 'dr.F', situation: 'drag', title: '空气阻力', latex: 'f = bv + cv^2', lhs: 'f', expr: 'b*v + c*v^2', unit: 'N', measure: 'F', kind: 'exact', note: 'v 取仿真中此刻的速度' },
  { id: 'dr.vt', situation: 'drag', title: '终端速度（线性阻力）', latex: 'v_t = \\dfrac{mg}{b}', lhs: 'v_t', expr: 'm*g/b', unit: 'm/s', measure: 'speed', kind: 'approx', requires: ['linearDrag'], approxOf: 'nearTerminal', note: '下落足够久后才接近终端速度' },
  { id: 'dr.vt2', situation: 'drag', title: '终端速度（平方阻力）', latex: 'v_t = \\sqrt{\\dfrac{mg}{c}}', lhs: 'v_t', expr: 'sqrt(m*g/c)', unit: 'm/s', measure: 'speed', kind: 'approx', requires: ['quadDrag'], approxOf: 'nearTerminal', note: '下落足够久后才接近终端速度' },
  { id: 'dr.v', situation: 'drag', title: '线性阻力下的下落速度', latex: 'v = \\dfrac{mg}{b}\\left(1 - \\mathrm{e}^{-bt/m}\\right)', lhs: 'v', expr: 'm*g/b*(1 - exp(-b*t/m))', unit: 'm/s', measure: 'speed', kind: 'exact', requires: ['linearDrag', 'fromRest'], causes: NUM },
  { id: 'dr.v2', situation: 'drag', title: '平方阻力下的下落速度', latex: 'v = \\sqrt{\\dfrac{mg}{c}}\\tanh\\!\\left(t\\sqrt{\\dfrac{gc}{m}}\\right)', lhs: 'v', expr: 'sqrt(m*g/c)*tanh(t*sqrt(g*c/m))', unit: 'm/s', measure: 'speed', kind: 'exact', requires: ['quadDrag', 'fromRest'], causes: NUM },
  // Damped oscillation
  { id: 'dm.T', situation: 'damped', title: '阻尼振动的周期', latex: 'T_d = \\dfrac{2\\pi}{\\sqrt{\\dfrac{k}{m} - \\dfrac{c^2}{4m^2}}}', lhs: 'T_d', expr: '2*pi/sqrt(k/m - c^2/(4*m^2))', unit: 's', measure: 'Td', kind: 'exact', note: '比无阻尼时略长' },
  { id: 'dm.ratio', situation: 'damped', title: '振幅每周期衰减的比例', latex: '\\dfrac{A_{n+1}}{A_n} = \\mathrm{e}^{-cT_d/(2m)}', lhs: '\\dfrac{A_{n+1}}{A_n}', expr: 'exp(-c/(2*m)*2*pi/sqrt(k/m - c^2/(4*m^2)))', unit: '', measure: 'ratio', kind: 'exact' },
  // Rotation under a constant torque
  { id: 'spin.beta', situation: 'spin', title: '转动定律', latex: '\\beta = \\dfrac{M}{I}', lhs: '\\beta', expr: 'M/I', unit: 'rad/s²', measure: 'beta', kind: 'exact' },
  { id: 'spin.omega', situation: 'spin', title: '匀变速转动的角速度', latex: '\\omega = \\omega_0 + \\dfrac{M}{I}t', lhs: '\\omega', expr: 'omega0 + M/I*t', unit: 'rad/s', measure: 'omega', kind: 'exact' },
  { id: 'spin.theta', situation: 'spin', title: '匀变速转动的角位移', latex: '\\theta = \\omega_0t + \\dfrac{M}{2I}t^2', lhs: '\\theta', expr: 'omega0*t + M/(2*I)*t^2', unit: 'rad', measure: 'theta', kind: 'exact' },
  { id: 'spin.W', situation: 'spin', title: '力矩做功等于转动动能的增加', latex: '\\tfrac{1}{2}I\\omega^2 - \\tfrac{1}{2}I\\omega_0^2 = M\\theta', lhs: '\\Delta E_k', expr: 'M*theta', unit: 'J', measure: 'dEk', kind: 'exact', note: 'θ 取仿真中转过的角度' },
  // Gears
  { id: 'gear.w', situation: 'gear', title: '齿轮传动的角速度', latex: '\\omega_B = -\\dfrac{\\omega_A}{r}', lhs: '\\omega_B', expr: '-omegaA/r', unit: 'rad/s', measure: 'omegaB', kind: 'exact', note: '外啮合齿轮转向相反；ω_A 取仿真值' },
  { id: 'gear.v', situation: 'gear', title: '啮合点线速度相等', latex: 'v = \\omega_Ar_A = \\omega_Br_B', lhs: 'v', expr: 'abs(omegaA)*rA', unit: 'm/s', measure: 'vB', kind: 'exact', requires: ['discs'] },
  { id: 'gear.beta', situation: 'gear', title: '齿轮系的角加速度', latex: '\\beta_A = \\dfrac{M}{I_A + I_B/r^2}', lhs: '\\beta_A', expr: 'M/(IA + IB/r^2)', unit: 'rad/s²', measure: 'betaA', kind: 'exact', requires: ['driven'], method: '等效转动惯量' },

  // ---- Charges in uniform fields and the Coulomb force (26.54, D78) ----
  { id: 'ce.a', situation: 'charge-e', title: '电场力产生的加速度', latex: 'a = \\dfrac{|q|E}{m}', lhs: 'a', expr: 'abs(q)*E/m', unit: 'm/s²', measure: 'a', kind: 'exact', requires: ['noGravity'], note: '不计重力' },
  { id: 'ce.x', situation: 'charge-e', title: 'x 方向的位移', latex: '\\Delta x = v_{0x}t + \\tfrac{1}{2}\\left(\\dfrac{qE_x}{m} + g_x\\right)t^2', lhs: '\\Delta x', expr: 'vx0*t + (q*Ex/m + gx)*t^2/2', unit: 'm', measure: 'dx', kind: 'exact', causes: NUM },
  { id: 'ce.y', situation: 'charge-e', title: 'y 方向的位移', latex: '\\Delta y = v_{0y}t + \\tfrac{1}{2}\\left(\\dfrac{qE_y}{m} + g_y\\right)t^2', lhs: '\\Delta y', expr: 'vy0*t + (q*Ey/m + gy)*t^2/2', unit: 'm', measure: 'dy', kind: 'exact', causes: NUM },
  { id: 'ce.vx', situation: 'charge-e', title: 'x 方向的速度', latex: 'v_x = v_{0x} + \\left(\\dfrac{qE_x}{m} + g_x\\right)t', lhs: 'v_x', expr: 'vx0 + (q*Ex/m + gx)*t', unit: 'm/s', measure: 'vx', kind: 'exact' },
  { id: 'ce.vy', situation: 'charge-e', title: 'y 方向的速度', latex: 'v_y = v_{0y} + \\left(\\dfrac{qE_y}{m} + g_y\\right)t', lhs: 'v_y', expr: 'vy0 + (q*Ey/m + gy)*t', unit: 'm/s', measure: 'vy', kind: 'exact' },
  { id: 'ce.drift', situation: 'charge-e', title: '垂直射入时的侧移量', latex: 'y = \\dfrac{|q|E}{2m}t^2', lhs: 'y', expr: 'abs(q)*E*t^2/(2*m)', unit: 'm', measure: 'drift', kind: 'exact', requires: ['perp', 'noGravity'], method: '类平抛：沿初速度匀速，沿电场匀加速' },
  { id: 'ce.yL', situation: 'charge-e', title: '侧移量（用沿初速度方向的位移 L 表示）', latex: 'y = \\dfrac{|q|EL^2}{2mv_0^2}', lhs: 'y', expr: 'abs(q)*E*L^2/(2*m*v0^2)', unit: 'm', measure: 'drift', kind: 'exact', requires: ['perp', 'noGravity'], note: '平行板间 E = U/d，L 为板长时即离开电场时的侧移' },
  { id: 'ce.tan', situation: 'charge-e', title: '偏转角的正切', latex: '\\tan\\theta = \\dfrac{v_\\perp}{v_0} = \\dfrac{|q|EL}{mv_0^2}', lhs: '\\tan\\theta', expr: 'abs(q)*E*L/(m*v0^2)', unit: '', measure: 'tan', kind: 'exact', requires: ['perp', 'noGravity'] },
  { id: 'ce.W', situation: 'charge-e', title: '动能定理（电场力与重力做功）', latex: '\\Delta E_k = q\\vec E\\cdot\\vec s + m\\vec g\\cdot\\vec s', lhs: '\\Delta E_k', expr: 'q*(Ex*sx + Ey*sy) + m*(gx*sx + gy*sy)', unit: 'J', measure: 'dEk', kind: 'exact', note: '匀强电场中电场力做功 W = qEd，d 为沿电场方向的位移' },
  { id: 'cb.F', situation: 'charge-b', title: '洛伦兹力', latex: 'F = |q|vB', lhs: 'F', expr: 'abs(q)*v*B', unit: 'N', measure: 'F', kind: 'exact', note: '速度垂直于磁场' },
  { id: 'cb.r', situation: 'charge-b', title: '圆周运动的半径', latex: 'r = \\dfrac{mv}{|q|B}', lhs: 'r', expr: 'm*v/(abs(q)*B)', unit: 'm', measure: 'r', kind: 'exact', method: '洛伦兹力提供向心力 |q|vB = mv²/r' },
  { id: 'cb.T', situation: 'charge-b', title: '圆周运动的周期', latex: 'T = \\dfrac{2\\pi m}{|q|B}', lhs: 'T', expr: '2*pi*m/(abs(q)*B)', unit: 's', measure: 'T', kind: 'exact', note: '周期与速度大小无关' },
  { id: 'cb.v', situation: 'charge-b', title: '洛伦兹力不做功（速率不变）', latex: "v' = v", lhs: "v'", expr: 'v', unit: 'm/s', measure: 'speed', kind: 'exact', causes: NUM },
  { id: 'cb.P', situation: 'charge-b', title: '洛伦兹力的功率', latex: 'P = \\vec F\\cdot\\vec v = 0', lhs: 'P', expr: '0', unit: 'W', measure: 'P', kind: 'exact', note: '洛伦兹力始终垂直于速度' },
  { id: 'sel.v', situation: 'selector', title: '速度选择器', latex: 'v = \\dfrac{E}{B}', lhs: 'v', expr: 'E/B', unit: 'm/s', measure: 'speed', kind: 'exact', method: '电场力与洛伦兹力平衡 qE = qvB' },
  { id: 'sel.F', situation: 'selector', title: '洛伦兹力与电场力平衡', latex: '|q|vB = |q|E', lhs: 'F_B', expr: 'abs(q)*E', unit: 'N', measure: 'FB', kind: 'exact' },
  { id: 'ceb.W', situation: 'charge-eb', title: '动能定理（洛伦兹力不做功）', latex: '\\Delta E_k = q\\vec E\\cdot\\vec s + m\\vec g\\cdot\\vec s', lhs: '\\Delta E_k', expr: 'q*(Ex*sx + Ey*sy) + m*(gx*sx + gy*sy)', unit: 'J', measure: 'dEk', kind: 'exact', causes: NUM },
  { id: 'ceb.P', situation: 'charge-eb', title: '洛伦兹力的功率', latex: 'P = \\vec F_B\\cdot\\vec v = 0', lhs: 'P', expr: '0', unit: 'W', measure: 'P', kind: 'exact' },
  { id: 'cl.F', situation: 'coulomb', title: '库仑定律', latex: 'F = k\\dfrac{|q_1q_2|}{r^2}', lhs: 'F', expr: 'k*abs(q1*q2)/r^2', unit: 'N', measure: 'F', kind: 'exact', requires: ['apart'], note: 'r 取仿真中此刻的距离' },
  { id: 'cl.E', situation: 'coulomb', title: '能量守恒（动能与电势能）', latex: 'E_k + k\\dfrac{q_1q_2}{r} = E_0', lhs: 'E', expr: 'E0', unit: 'J', measure: 'E', kind: 'exact', requires: ['apart'], causes: NUM },
  { id: 'cl.rmin', situation: 'coulomb', title: '正对射入时的最近距离', latex: 'r_{\\min} = \\dfrac{kq_1q_2}{\\tfrac{1}{2}mv_0^2 + kq_1q_2/r_0}', lhs: 'r_{\\min}', expr: 'k*q1*q2/(m*v0^2/2 + k*q1*q2/r0)', unit: 'm', measure: 'rmin', kind: 'exact', requires: ['headOn'], note: '从很远处射入时 r_min ≈ 2kq₁q₂/(mv₀²)' },

  // ---- Rail loops, liquids and bounded field regions (26.55, D90–D92) ----
  { id: 'rail.emf', situation: 'rail', title: '导体棒切割磁感线的电动势', latex: '\\varepsilon = BLv', lhs: '\\varepsilon', expr: 'B*L*v', unit: 'V', measure: 'emf', kind: 'exact', note: 'v 取仿真中此刻的速度' },
  { id: 'rail.I', situation: 'rail', title: '感应电流', latex: 'I = \\dfrac{BLv}{R}', lhs: 'I', expr: 'B*L*v/R', unit: 'A', measure: 'I', kind: 'exact', method: '闭合电路欧姆定律 I = ε/R' },
  { id: 'rail.F', situation: 'rail', title: '安培力', latex: 'F_A = BIL = \\dfrac{B^2L^2v}{R}', lhs: 'F_A', expr: 'B^2*L^2*abs(v)/R', unit: 'N', measure: 'FA', kind: 'exact', note: '方向与导体棒的运动方向相反（楞次定律）' },
  { id: 'rail.a', situation: 'rail', title: '导体棒的加速度', latex: 'a = \\dfrac{F}{m} - \\dfrac{B^2L^2v}{mR}', lhs: 'a', expr: 'F/m - B^2*L^2*v/(m*R)', unit: 'm/s²', measure: 'a', kind: 'exact', requires: ['along'], method: '牛顿第二定律：动力减去安培力' },
  { id: 'rail.v', situation: 'rail', title: '速度随时间的变化', latex: 'v = v_T + (v_0 - v_T)e^{-t/\\tau},\\ v_T = \\dfrac{FR}{B^2L^2},\\ \\tau = \\dfrac{mR}{B^2L^2}', lhs: 'v', expr: 'F*R/(B^2*L^2) + (v0 - F*R/(B^2*L^2))*exp(-B^2*L^2*t/(m*R))', unit: 'm/s', measure: 'vt', kind: 'exact', requires: ['along'], causes: NUM },
  { id: 'rail.vT', situation: 'rail', title: '收尾速度', latex: 'v_T = \\dfrac{FR}{B^2L^2}', lhs: 'v_T', expr: 'F*R/(B^2*L^2)', unit: 'm/s', measure: 'vt', kind: 'approx', approxOf: 'terminal', requires: ['along'], note: '竖直导轨上 F = mg：v_T = mgR/(B²L²)', causes: ['还没有达到收尾速度：速度按 e^(−t/τ) 逼近 v_T'] },
  { id: 'rail.Q', situation: 'rail', title: '能量守恒：焦耳热', latex: 'Q = Fs - \\left(\\tfrac12mv^2 - \\tfrac12mv_0^2\\right)', lhs: 'Q', expr: 'F*s - m*(v^2 - v0^2)/2', unit: 'J', measure: 'Q', kind: 'exact', requires: ['along'], causes: NUM },
  { id: 'fl.F', situation: 'float', title: '阿基米德原理', latex: 'F_b = \\rho_f gV_{sub} = \\rho_f gAd', lhs: 'F_b', expr: 'rho*g*A*d', unit: 'N', measure: 'Fb', kind: 'exact', requires: ['noDrag'], note: '二维中 V排 = 浸入面积 A × 厚度 d；浮力由运动求得 m(a + g)' },
  { id: 'fl.eq', situation: 'float', title: '漂浮条件', latex: 'F_b = mg', lhs: 'F_b', expr: 'm*g', unit: 'N', measure: 'FbA', kind: 'approx', approxOf: 'rest', requires: ['floating'], causes: ['物体还在上下振动，没有完全静止'] },
  { id: 'fl.ratio', situation: 'float', title: '漂浮时浸入的比例', latex: '\\dfrac{V_{sub}}{V} = \\dfrac{\\rho_b}{\\rho_f}', lhs: 'V_{sub}/V', expr: 'rhoB/rho', unit: '', measure: 'frac', kind: 'approx', approxOf: 'rest', requires: ['floating'], method: 'ρ液gV排 = ρ物gV', causes: ['物体还在上下振动，没有完全静止'] },
  { id: 'fl.h', situation: 'float', title: '吃水深度', latex: 'h = \\dfrac{m}{\\rho_f wd}', lhs: 'h', expr: 'm/(rho*w*d)', unit: 'm', measure: 'draft', kind: 'approx', approxOf: 'rest', requires: ['floating', 'box'], causes: ['物体还在上下振动，没有完全静止'] },
  { id: 'fl.a', situation: 'float', title: '浸没时的加速度', latex: 'a = g\\left(\\dfrac{\\rho_f}{\\rho_b} - 1\\right)', lhs: 'a', expr: 'g*(rho/rhoB - 1)', unit: 'm/s²', measure: 'a', kind: 'exact', requires: ['submerged', 'noDrag'], note: 'a > 0 上浮，a < 0 下沉' },
  { id: 'zb.F', situation: 'zone-b', title: '洛伦兹力', latex: 'F = |q|vB', lhs: 'F', expr: 'abs(q)*v*B', unit: 'N', measure: 'F', kind: 'exact', note: '仿真值由运动求得 F = ma' },
  { id: 'zb.r', situation: 'zone-b', title: '圆周运动的半径', latex: 'r = \\dfrac{mv}{|q|B}', lhs: 'r', expr: 'm*v/(abs(q)*B)', unit: 'm', measure: 'r', kind: 'exact', method: '洛伦兹力提供向心力 |q|vB = mv²/r' },
  { id: 'zb.v', situation: 'zone-b', title: '洛伦兹力不做功（速率不变）', latex: "v' = v", lhs: "v'", expr: 'v', unit: 'm/s', measure: 'speed', kind: 'exact', causes: NUM },
  { id: 'zb.t', situation: 'zone-b', title: '在磁场中运动的时间（半周）', latex: 't = \\dfrac{T}{2} = \\dfrac{\\pi m}{|q|B}', lhs: 't', expr: 'pi*m/(abs(q)*B)', unit: 's', measure: 'tin', kind: 'exact', requires: ['semi'], note: '与速度大小无关（回旋加速器的原理）' },
  { id: 'zb.d', situation: 'zone-b', title: '入射点与出射点的距离', latex: 'd = 2r = \\dfrac{2mv}{|q|B}', lhs: 'd', expr: '2*m*v/(abs(q)*B)', unit: 'm', measure: 'chord', kind: 'exact', requires: ['semi'], note: '质谱仪：落点到入口的距离' },
  { id: 'ze.a', situation: 'zone-e', title: '电场力产生的加速度', latex: 'a = \\dfrac{|q|E}{m}', lhs: 'a', expr: 'abs(q)*E/m', unit: 'm/s²', measure: 'a', kind: 'exact', requires: ['noGravity'], note: '不计重力' },
  { id: 'ze.v', situation: 'zone-e', title: '加速后的速度', latex: 'v = \\sqrt{v_0^2 + \\dfrac{2|q|Ed}{m}}', lhs: 'v', expr: 'sqrt(v0^2 + 2*abs(q)*E*d/m)', unit: 'm/s', measure: 'speed', kind: 'exact', requires: ['noGravity', 'along'], method: '动能定理 |q|U = ½mv² − ½mv₀²，U = Ed' },
  { id: 'ze.W', situation: 'zone-e', title: '动能定理（电场力与重力做功）', latex: '\\Delta E_k = q\\vec E\\cdot\\vec s + m\\vec g\\cdot\\vec s', lhs: '\\Delta E_k', expr: 'q*(Ex*sx + Ey*sy) + m*(gx*sx + gy*sy)', unit: 'J', measure: 'dEk', kind: 'exact', causes: NUM },

  // ---- Conservation laws ----
  { id: 'en.ledger', situation: 'energy', title: '能量守恒（能量账本）', latex: 'E_k + E_p + E_s + Q + \\Delta E_{\\mathrm{coll}} - W = E_0', lhs: 'E_{\\Sigma}', expr: 'E0', unit: 'J', measure: 'balance', kind: 'exact', note: 'Q 含摩擦生热与阻尼耗散；W 含外力与传送带电机做的功' },
  { id: 'mo.px', situation: 'momentum', title: '系统动量守恒（x 方向）', latex: 'p_x = p_{x0}', lhs: 'p_x', expr: 'p0x', unit: 'kg·m/s', measure: 'px', kind: 'exact' },
  { id: 'mo.py', situation: 'momentum', title: '系统动量守恒（y 方向）', latex: 'p_y = p_{y0}', lhs: 'p_y', expr: 'p0y', unit: 'kg·m/s', measure: 'py', kind: 'exact' }
])
