/**
 * The formula library: plain data. Each entry names the situation it applies to, the conditions it needs,
 * a symbolic LaTeX form, an expression for the theoretical value in the situation's variables, its unit,
 * and the simulated measurement it is compared with. Adding a formula to a known situation needs no code;
 * a new kind of situation needs a recognizer (situations.ts). Expressions are checked for dimensions in the
 * tests.
 */
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
export const FORMULAS: FormulaDef[] = [
  // ---- Incline (static incline or inclined belt) ----
  { id: 'incline.a.down', situation: 'incline', title: '沿斜面的加速度（相对斜面向下滑）', latex: 'a = g(\\sin\\theta - \\mu_k\\cos\\theta)', lhs: 'a', expr: 'g*(sin(theta) - muK*cos(theta))', unit: 'm/s²', measure: 'a', kind: 'exact', requires: ['slideDown'], note: '沿斜面向下为正', causes: NUM },
  { id: 'incline.a.up', situation: 'incline', title: '沿斜面的加速度（相对斜面向上滑）', latex: 'a = g(\\sin\\theta + \\mu_k\\cos\\theta)', lhs: 'a', expr: 'g*(sin(theta) + muK*cos(theta))', unit: 'm/s²', measure: 'a', kind: 'exact', requires: ['slideUp'], note: '沿斜面向下为正；摩擦力沿斜面向下', causes: NUM },
  { id: 'incline.a.stick', situation: 'incline', title: '与斜面相对静止', latex: 'a = 0', lhs: 'a', expr: '0', unit: 'm/s²', measure: 'a', kind: 'exact', requires: ['stick'] },
  { id: 'incline.N', situation: 'incline', title: '斜面的支持力', latex: 'N = mg\\cos\\theta', lhs: 'N', expr: 'm*g*cos(theta)', unit: 'N', measure: 'N', kind: 'exact', requires: ['contact'], causes: NUM },
  { id: 'incline.f.kinetic', situation: 'incline', title: '滑动摩擦力', latex: 'f = \\mu_k mg\\cos\\theta', lhs: 'f', expr: 'muK*m*g*cos(theta)', unit: 'N', measure: 'f', kind: 'exact', requires: ['sliding'] },
  { id: 'incline.f.static', situation: 'incline', title: '静摩擦力（平衡）', latex: 'f = mg\\sin\\theta', lhs: 'f', expr: 'm*g*sin(theta)', unit: 'N', measure: 'f', kind: 'exact', requires: ['stick', 'staticHolds'] },
  { id: 'incline.v', situation: 'incline', title: '速度—时间关系', latex: 'v = v_0 + at', lhs: 'v', expr: 'v0 + a*t', unit: 'm/s', measure: 'v', kind: 'exact', requires: ['sliding'], note: 'a 取上面的理论值；v 沿斜面向下为正' },
  { id: 'incline.s', situation: 'incline', title: '位移—时间关系', latex: 's = v_0t + \\tfrac{1}{2}at^2', lhs: 's', expr: 'v0*t + a*t^2/2', unit: 'm', measure: 's', kind: 'exact', requires: ['sliding'] },
  { id: 'incline.t.common', situation: 'incline', title: '达到共速所需时间（传送带）', latex: 't_1 = \\dfrac{|u - v_0|}{a}', lhs: 't_1', expr: 'abs(u - v0)/abs(a)', unit: 's', measure: 'tEnd', kind: 'exact', requires: ['belt', 'sliding', 'endsAtCommon'] },

  // ---- Horizontal surface (ground or belt) ----
  { id: 'flat.a', situation: 'flat', title: '滑动时的加速度大小', latex: 'a = \\mu_k g', lhs: 'a', expr: 'muK*g', unit: 'm/s²', measure: 'aMag', kind: 'exact', requires: ['sliding'] },
  { id: 'flat.N', situation: 'flat', title: '支持力', latex: 'N = mg', lhs: 'N', expr: 'm*g', unit: 'N', measure: 'N', kind: 'exact', requires: ['contact', 'onlyGravity'] },
  { id: 'flat.f', situation: 'flat', title: '滑动摩擦力', latex: 'f = \\mu_k mg', lhs: 'f', expr: 'muK*m*g', unit: 'N', measure: 'f', kind: 'exact', requires: ['sliding', 'onlyGravity'] },
  { id: 'flat.t', situation: 'flat', title: '相对滑动持续时间', latex: 't_1 = \\dfrac{|u - v_0|}{\\mu_k g}', lhs: 't_1', expr: 'abs(u - v0)/(muK*g)', unit: 's', measure: 'tEnd', kind: 'exact', requires: ['sliding', 'endsAtRest', 'onlyGravity'], note: 'u 为接触面速度（静止地面 u = 0）' },
  { id: 'flat.x', situation: 'flat', title: '滑动阶段物块的位移', latex: 'x_1 = \\dfrac{|u^2 - v_0^2|}{2\\mu_k g}', lhs: 'x_1', expr: 'abs(u^2 - v0^2)/(2*muK*g)', unit: 'm', measure: 'xEnd', kind: 'exact', requires: ['sliding', 'endsAtRest', 'onlyGravity'] },
  { id: 'flat.ds', situation: 'flat', title: '相对滑动距离', latex: '\\Delta s = \\dfrac{(u - v_0)^2}{2\\mu_k g}', lhs: '\\Delta s', expr: '(u - v0)^2/(2*muK*g)', unit: 'm', measure: 'slideEnd', kind: 'exact', requires: ['sliding', 'endsAtRest', 'onlyGravity'] },
  { id: 'flat.Q', situation: 'flat', title: '摩擦生热', latex: 'Q = \\mu_k mg\\,\\Delta s', lhs: 'Q', expr: 'muK*m*g*(u - v0)^2/(2*muK*g)', unit: 'J', measure: 'heatEnd', kind: 'exact', requires: ['sliding', 'endsAtRest', 'onlyGravity'] },
  { id: 'flat.W', situation: 'flat', title: '传送带电机多做的功', latex: 'W = \\mu_k mg\\,u\\,t_1', lhs: 'W', expr: 'muK*m*g*u*abs(u - v0)/(muK*g)', unit: 'J', measure: 'beltEnd', kind: 'exact', requires: ['belt', 'sliding', 'endsAtRest', 'onlyGravity'] },

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
  { id: 'bounce.v', situation: 'bounce', title: '与固定面碰撞后的法向速度', latex: "v_n' = -e\\,v_n", lhs: "v_n'", expr: '-e*u', unit: 'm/s', measure: 'v', kind: 'exact' },

  // ---- Projectile ----
  { id: 'pr.x', situation: 'projectile', title: '水平位置', latex: 'x = x_0 + v_{0x}t', lhs: 'x', expr: 'x0 + vx0*t', unit: 'm', measure: 'x', kind: 'exact' },
  { id: 'pr.y', situation: 'projectile', title: '竖直位置', latex: 'y = y_0 + v_{0y}t - \\tfrac{1}{2}gt^2', lhs: 'y', expr: 'y0 + vy0*t - g*t^2/2', unit: 'm', measure: 'y', kind: 'exact' },
  { id: 'pr.vx', situation: 'projectile', title: '水平速度不变', latex: 'v_x = v_{0x}', lhs: 'v_x', expr: 'vx0', unit: 'm/s', measure: 'vx', kind: 'exact' },
  { id: 'pr.vy', situation: 'projectile', title: '竖直速度', latex: 'v_y = v_{0y} - gt', lhs: 'v_y', expr: 'vy0 - g*t', unit: 'm/s', measure: 'vy', kind: 'exact' },
  { id: 'pr.T', situation: 'projectile', title: '飞行时间（落到 y₁ 高度）', latex: 'T = \\dfrac{v_{0y} + \\sqrt{v_{0y}^2 + 2g(y_0 - y_1)}}{g}', lhs: 'T', expr: '(vy0 + sqrt(vy0^2 + 2*g*(y0 - y1)))/g', unit: 's', measure: 'T', kind: 'exact', requires: ['lands'] },
  { id: 'pr.R', situation: 'projectile', title: '水平射程', latex: 'R = v_{0x}\\,T', lhs: 'R', expr: 'vx0*(vy0 + sqrt(vy0^2 + 2*g*(y0 - y1)))/g', unit: 'm', measure: 'R', kind: 'exact', requires: ['lands'] },
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
  { id: 'vc.r.crit', situation: 'vcircle-rope', title: '恰能通过最高点的最低点速度', latex: 'v_0 = \\sqrt{5gL}\\quad(\\text{此时最高点 } v = \\sqrt{gL})', lhs: 'v_0', expr: 'sqrt(5*g*L)', unit: 'm/s', measure: 'v0crit', kind: 'exact', note: '最高点的临界条件：只有重力提供向心力，mg = mv²/L，即 v = √(gL)' },
  { id: 'vc.r.slackv', situation: 'vcircle-rope', title: '绳恰好松弛的条件', latex: 'v^2 = -gL\\cos\\varphi_s\\quad(\\varphi_s = \\pi \\text{ 时即 } v = \\sqrt{gL})', lhs: 'v', expr: 'sqrt(-g*L*cos(phiS))', unit: 'm/s', measure: 'vSlack', kind: 'exact', requires: ['slack'], note: 'φ_s 取仿真中绳松弛处的位置角（自最低点量起）' },
  { id: 'vc.r.phiS', situation: 'vcircle-rope', title: '绳松弛处的位置角', latex: '\\cos\\varphi_s = \\dfrac{2gL - v_0^2}{3gL}', lhs: '\\varphi_s', expr: 'acos((2*g*L - v0^2)/(3*g*L))', unit: 'rad', measure: 'phiSlack', kind: 'exact', requires: ['slack'], note: '位置角自最低点沿运动方向量起' },
  { id: 'vc.r.hS', situation: 'vcircle-rope', title: '松弛点高出圆心的高度', latex: 'h = \\dfrac{v_0^2 - 2gL}{3g}', lhs: 'h', expr: '(v0^2 - 2*g*L)/(3*g)', unit: 'm', measure: 'hSlack', kind: 'exact', requires: ['slack'] },
  { id: 'vc.r.vS', situation: 'vcircle-rope', title: '绳松弛时小球的速率', latex: 'v_s = \\sqrt{\\dfrac{v_0^2 - 2gL}{3}}', lhs: 'v_s', expr: 'sqrt((v0^2 - 2*g*L)/3)', unit: 'm/s', measure: 'vSlack', kind: 'exact', requires: ['slack'] },
  { id: 'vc.r.tS', situation: 'vcircle-rope', title: '绳松弛的时刻（椭圆积分）', latex: 't_s = \\dfrac{2L}{v_0}\\left[F\\!\\left(\\tfrac{\\varphi_s}{2}, k\\right) - F\\!\\left(\\tfrac{\\varphi_0}{2}, k\\right)\\right],\; k = \\dfrac{2\\sqrt{gL}}{v_0}', lhs: 't_s', expr: '2*L/v0*(ellipF(acos((2*g*L - v0^2)/(3*g*L))/2, 2*sqrt(g*L)/v0) - ellipF(phi0/2, 2*sqrt(g*L)/v0))', unit: 's', measure: 'tSlack', kind: 'exact', requires: ['slack'], note: 'F 为第一类不完全椭圆积分；φ₀ 为本段起点的位置角（从最低点出发时为 0），时间自本段开始量起' },

  // ---- Vertical circle (rod) ----
  { id: 'vc.d.F0', situation: 'vcircle-rod', title: '最低点杆的拉力', latex: 'F = mg + \\dfrac{mv_0^2}{L}', lhs: 'F', expr: 'm*g + m*v0^2/L', unit: 'N', measure: 'FBottom', kind: 'exact', requires: ['atBottom'] },
  { id: 'vc.d.vtop', situation: 'vcircle-rod', title: '最高点速率（机械能守恒）', latex: 'v_{\\text{top}} = \\sqrt{v_0^2 - 4gL}', lhs: 'v_{\\text{top}}', expr: 'sqrt(v0^2 - 4*g*L)', unit: 'm/s', measure: 'vTop', kind: 'exact', requires: ['reachesTop'] },
  { id: 'vc.d.Ftop', situation: 'vcircle-rod', title: '最高点杆对球的力（拉为正）', latex: 'F = \\dfrac{mv_{\\text{top}}^2}{L} - mg = \\dfrac{m(v_0^2 - 5gL)}{L}', lhs: 'F', expr: 'm*(v0^2 - 5*g*L)/L', unit: 'N', measure: 'FTop', kind: 'exact', requires: ['reachesTop'], note: 'F > 0 为拉力，F < 0 为支持力（推力）；v_top = √(gL) 时 F = 0' },
  { id: 'vc.d.zero', situation: 'vcircle-rod', title: '杆力为零时的速率', latex: 'v^2 = -gL\\cos\\varphi\\quad(\\text{在最高点即 } v = \\sqrt{gL})', lhs: 'v', expr: 'sqrt(-g*L*cos(phiZ))', unit: 'm/s', measure: 'vZero', kind: 'exact', requires: ['forceZero'], note: 'φ 取仿真中杆力为零处的位置角' },

  // ---- Movable pulley ----
  { id: 'mp.rel', situation: 'movable-pulley', title: '加速度关系（动滑轮）', latex: 'a_1 = 2a_2', lhs: 'a_1', expr: '2*a2sim', unit: 'm/s²', measure: 'a1', kind: 'exact', note: '物块1移动的距离是动滑轮移动距离的 2 倍；a₂ 取仿真值' },
  { id: 'mp.a2', situation: 'movable-pulley', title: '动滑轮下物块的加速度（向上为正）', latex: 'a_2 = \\dfrac{(2m_1 - m_2)g}{4m_1 + m_2}', lhs: 'a_2', expr: '(2*m1 - m2)*g/(4*m1 + m2)', unit: 'm/s²', measure: 'a2', kind: 'exact', method: '隔离法联立' },
  { id: 'mp.a1', situation: 'movable-pulley', title: '绳端物块的加速度（向下为正）', latex: 'a_1 = \\dfrac{2(2m_1 - m_2)g}{4m_1 + m_2}', lhs: 'a_1', expr: '2*(2*m1 - m2)*g/(4*m1 + m2)', unit: 'm/s²', measure: 'a1', kind: 'exact', method: '隔离法联立' },
  { id: 'mp.T', situation: 'movable-pulley', title: '绳的拉力', latex: 'T = \\dfrac{3m_1m_2g}{4m_1 + m_2}', lhs: 'T', expr: '3*m1*m2*g/(4*m1 + m2)', unit: 'N', measure: 'T', kind: 'exact' },
  { id: 'mp.T1', situation: 'movable-pulley', title: '张力关系（隔离物块1）', latex: 'T = m_1(g - a_1)', lhs: 'T', expr: 'm1*(g - a1sim)', unit: 'N', measure: 'T', kind: 'exact', method: '隔离法（物块1）', note: 'a₁ 取仿真值' },
  { id: 'mp.T2', situation: 'movable-pulley', title: '张力关系（隔离动滑轮与物块2）', latex: '2T = m_2(g + a_2)', lhs: 'T', expr: 'm2*(g + a2sim)/2', unit: 'N', measure: 'T', kind: 'exact', method: '隔离法（动滑轮与物块2）', note: '动滑轮两侧两段绳各以 T 向上拉；a₂ 取仿真值' },

  // ---- Movable wedge ----
  { id: 'wd.A', situation: 'wedge', title: '斜面的加速度', latex: 'A = \\dfrac{mg\\sin\\theta\\cos\\theta}{M + m\\sin^2\\theta}', lhs: 'A', expr: 'm*g*sin(theta)*cos(theta)/(M + m*sin(theta)^2)', unit: 'm/s²', measure: 'A', kind: 'exact', method: '隔离法（斜面参考系中物块受惯性力）' },
  { id: 'wd.arel', situation: 'wedge', title: '物块相对斜面的加速度', latex: 'a_{\\text{相对}} = \\dfrac{(M + m)g\\sin\\theta}{M + m\\sin^2\\theta}', lhs: 'a_{\\text{相对}}', expr: '(M + m)*g*sin(theta)/(M + m*sin(theta)^2)', unit: 'm/s²', measure: 'arel', kind: 'exact' },
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

  // ---- Conservation laws ----
  { id: 'en.ledger', situation: 'energy', title: '能量守恒（能量账本）', latex: 'E_k + E_p + E_s + Q + \\Delta E_{\\text{碰}} - W = E_0', lhs: 'E_{\\Sigma}', expr: 'E0', unit: 'J', measure: 'balance', kind: 'exact', note: 'Q 含摩擦生热与阻尼耗散；W 含外力与传送带电机做的功' },
  { id: 'mo.px', situation: 'momentum', title: '系统动量守恒（x 方向）', latex: 'p_x = p_{x0}', lhs: 'p_x', expr: 'p0x', unit: 'kg·m/s', measure: 'px', kind: 'exact' },
  { id: 'mo.py', situation: 'momentum', title: '系统动量守恒（y 方向）', latex: 'p_y = p_{y0}', lhs: 'p_y', expr: 'p0y', unit: 'kg·m/s', measure: 'py', kind: 'exact' }
]
