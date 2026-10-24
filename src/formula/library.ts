/**
 * The formula library: plain data. Each entry names the situation it applies to, the conditions it needs,
 * a symbolic LaTeX form, an expression for the theoretical value in the situation's variables, its unit,
 * and the simulated measurement it is compared with. Adding a formula to a known situation needs no code;
 * a new kind of situation needs a recognizer (situations.ts). Expressions are checked for dimensions in the
 * tests.
 */
export interface FormulaDef {
  id: string
  situation: string
  title: string
  /** Symbolic form shown first, e.g. "a = g(\\sin\\theta - \\mu_k\\cos\\theta)". */
  latex: string
  /** Left-hand side used in the substituted line. */
  lhs: string
  expr: string
  unit: string
  /** Key of the simulated measurement in the situation sample. */
  measure: string
  kind: 'exact' | 'approx'
  /** Conditions (ids in the situation sample) that must hold. */
  requires?: string[]
  /** For approximations: the condition that grades the approximation (ok / approx / fail = 近似失效). */
  approxOf?: string
  method?: string
  note?: string
  /** Typical causes when the simulation deviates. */
  causes?: string[]
}

const NUM = ['数值积分误差（可减小时间步长或容差）']

export const FORMULAS: FormulaDef[] = [
  // ------------------------------------------------------------------ incline (static incline or inclined belt)
  { id: 'incline.a.down', situation: 'incline', title: '沿斜面的加速度（相对斜面向下滑）', latex: 'a = g(\\sin\\theta - \\mu_k\\cos\\theta)', lhs: 'a', expr: 'g*(sin(theta) - muK*cos(theta))', unit: 'm/s²', measure: 'a', kind: 'exact', requires: ['slideDown'], note: '沿斜面向下为正', causes: NUM },
  { id: 'incline.a.up', situation: 'incline', title: '沿斜面的加速度（相对斜面向上滑）', latex: 'a = g(\\sin\\theta + \\mu_k\\cos\\theta)', lhs: 'a', expr: 'g*(sin(theta) + muK*cos(theta))', unit: 'm/s²', measure: 'a', kind: 'exact', requires: ['slideUp'], note: '沿斜面向下为正；摩擦力沿斜面向下', causes: NUM },
  { id: 'incline.a.stick', situation: 'incline', title: '与斜面相对静止', latex: 'a = 0', lhs: 'a', expr: '0', unit: 'm/s²', measure: 'a', kind: 'exact', requires: ['stick'] },
  { id: 'incline.N', situation: 'incline', title: '斜面的支持力', latex: 'N = mg\\cos\\theta', lhs: 'N', expr: 'm*g*cos(theta)', unit: 'N', measure: 'N', kind: 'exact', requires: ['contact'], causes: NUM },
  { id: 'incline.f.kinetic', situation: 'incline', title: '滑动摩擦力', latex: 'f = \\mu_k mg\\cos\\theta', lhs: 'f', expr: 'muK*m*g*cos(theta)', unit: 'N', measure: 'f', kind: 'exact', requires: ['sliding'] },
  { id: 'incline.f.static', situation: 'incline', title: '静摩擦力（平衡）', latex: 'f = mg\\sin\\theta', lhs: 'f', expr: 'm*g*sin(theta)', unit: 'N', measure: 'f', kind: 'exact', requires: ['stick', 'staticHolds'] },
  { id: 'incline.v', situation: 'incline', title: '速度—时间关系', latex: 'v = v_0 + at', lhs: 'v', expr: 'v0 + a*t', unit: 'm/s', measure: 'v', kind: 'exact', requires: ['sliding'], note: 'a 取上面的理论值；v 沿斜面向下为正' },
  { id: 'incline.s', situation: 'incline', title: '位移—时间关系', latex: 's = v_0t + \\tfrac{1}{2}at^2', lhs: 's', expr: 'v0*t + a*t^2/2', unit: 'm', measure: 's', kind: 'exact', requires: ['sliding'] },
  { id: 'incline.t.common', situation: 'incline', title: '达到共速所需时间（传送带）', latex: 't_1 = \\dfrac{|u - v_0|}{a}', lhs: 't_1', expr: 'abs(u - v0)/abs(a)', unit: 's', measure: 'tEnd', kind: 'exact', requires: ['belt', 'sliding', 'endsAtCommon'] },

  // ------------------------------------------------------------------ horizontal surface (ground or belt)
  { id: 'flat.a', situation: 'flat', title: '滑动时的加速度大小', latex: 'a = \\mu_k g', lhs: 'a', expr: 'muK*g', unit: 'm/s²', measure: 'aMag', kind: 'exact', requires: ['sliding'] },
  { id: 'flat.N', situation: 'flat', title: '支持力', latex: 'N = mg', lhs: 'N', expr: 'm*g', unit: 'N', measure: 'N', kind: 'exact', requires: ['contact', 'onlyGravity'] },
  { id: 'flat.f', situation: 'flat', title: '滑动摩擦力', latex: 'f = \\mu_k mg', lhs: 'f', expr: 'muK*m*g', unit: 'N', measure: 'f', kind: 'exact', requires: ['sliding', 'onlyGravity'] },
  { id: 'flat.t', situation: 'flat', title: '相对滑动持续时间', latex: 't_1 = \\dfrac{|u - v_0|}{\\mu_k g}', lhs: 't_1', expr: 'abs(u - v0)/(muK*g)', unit: 's', measure: 'tEnd', kind: 'exact', requires: ['sliding', 'endsAtRest', 'onlyGravity'], note: 'u 为接触面速度（静止地面 u = 0）' },
  { id: 'flat.x', situation: 'flat', title: '滑动阶段物块的位移', latex: 'x_1 = \\dfrac{|u^2 - v_0^2|}{2\\mu_k g}', lhs: 'x_1', expr: 'abs(u^2 - v0^2)/(2*muK*g)', unit: 'm', measure: 'xEnd', kind: 'exact', requires: ['sliding', 'endsAtRest', 'onlyGravity'] },
  { id: 'flat.ds', situation: 'flat', title: '相对滑动距离', latex: '\\Delta s = \\dfrac{(u - v_0)^2}{2\\mu_k g}', lhs: '\\Delta s', expr: '(u - v0)^2/(2*muK*g)', unit: 'm', measure: 'slideEnd', kind: 'exact', requires: ['sliding', 'endsAtRest', 'onlyGravity'] },
  { id: 'flat.Q', situation: 'flat', title: '摩擦生热', latex: 'Q = \\mu_k mg\\,\\Delta s', lhs: 'Q', expr: 'muK*m*g*(u - v0)^2/(2*muK*g)', unit: 'J', measure: 'heatEnd', kind: 'exact', requires: ['sliding', 'endsAtRest', 'onlyGravity'] },
  { id: 'flat.W', situation: 'flat', title: '传送带电机多做的功', latex: 'W = \\mu_k mg\\,u\\,t_1', lhs: 'W', expr: 'muK*m*g*u*abs(u - v0)/(muK*g)', unit: 'J', measure: 'beltEnd', kind: 'exact', requires: ['belt', 'sliding', 'endsAtRest', 'onlyGravity'] },

  // ------------------------------------------------------------------ board and block
  { id: 'bb.a1', situation: 'board-block', title: '物块的加速度大小', latex: 'a_1 = \\mu_1 g', lhs: 'a_1', expr: 'mu1*g', unit: 'm/s²', measure: 'a1', kind: 'exact', method: '隔离物块' },
  { id: 'bb.a2', situation: 'board-block', title: '木板的加速度', latex: 'a_2 = \\dfrac{\\mu_1 mg - \\mu_2(M+m)g}{M}', lhs: 'a_2', expr: '(mu1*m*g - mu2*(M + m)*g)/M', unit: 'm/s²', measure: 'a2', kind: 'exact', requires: ['boardMoves'], method: '隔离木板' },
  { id: 'bb.a2.rest', situation: 'board-block', title: '木板保持静止', latex: 'a_2 = 0\\quad(\\mu_1 m \\le \\mu_2 (M+m))', lhs: 'a_2', expr: '0', unit: 'm/s²', measure: 'a2', kind: 'exact', requires: ['boardRests'] },
  { id: 'bb.t', situation: 'board-block', title: '达到共速的时间', latex: 't_1 = \\dfrac{v_1 - v_2}{a_1 + a_2}', lhs: 't_1', expr: '(v1 - v2)/(mu1*g + a2)', unit: 's', measure: 'tEnd', kind: 'exact', requires: ['endsAtCommon'], note: 'v₁、v₂ 为本阶段开始时物块、木板的速度' },
  { id: 'bb.vc', situation: 'board-block', title: '共同速度', latex: 'v = v_2 + a_2 t_1', lhs: 'v', expr: 'v2 + a2*(v1 - v2)/(mu1*g + a2)', unit: 'm/s', measure: 'vEnd', kind: 'exact', requires: ['endsAtCommon'] },
  { id: 'bb.ds', situation: 'board-block', title: '相对滑动距离', latex: '\\Delta s = \\dfrac{(v_1 - v_2)\\,t_1}{2}', lhs: '\\Delta s', expr: '(v1 - v2)^2/(2*(mu1*g + a2))', unit: 'm', measure: 'slideEnd', kind: 'exact', requires: ['endsAtCommon'] },
  { id: 'bb.Q', situation: 'board-block', title: '物块与木板间摩擦生热', latex: 'Q = \\mu_1 mg\\,\\Delta s', lhs: 'Q', expr: 'mu1*m*g*(v1 - v2)^2/(2*(mu1*g + a2))', unit: 'J', measure: 'heatEnd', kind: 'exact', requires: ['endsAtCommon'] },
  { id: 'bt.a', situation: 'board-together', title: '共速后整体减速的加速度大小', latex: 'a = \\mu_2 g', lhs: 'a', expr: 'mu2*g', unit: 'm/s²', measure: 'aMag', kind: 'exact', requires: ['together', 'groundSliding'], method: '整体法' },
  { id: 'bt.f', situation: 'board-together', title: '共速后物块受到的静摩擦力', latex: 'f = m\\mu_2 g', lhs: 'f', expr: 'm*mu2*g', unit: 'N', measure: 'f', kind: 'exact', requires: ['together', 'groundSliding'], method: '隔离物块' },

  // ------------------------------------------------------------------ collisions
  { id: 'col.v1', situation: 'collision', title: '碰后物体 1 的速度（沿连心线）', latex: "v_1' = \\dfrac{m_1u_1 + m_2u_2 - e\\,m_2(u_1 - u_2)}{m_1 + m_2}", lhs: "v_1'", expr: '(m1*u1 + m2*u2 - e*m2*(u1 - u2))/(m1 + m2)', unit: 'm/s', measure: 'v1', kind: 'exact', note: 'u、v 为沿碰撞法线（连心线）的分量' },
  { id: 'col.v2', situation: 'collision', title: '碰后物体 2 的速度（沿连心线）', latex: "v_2' = \\dfrac{m_1u_1 + m_2u_2 + e\\,m_1(u_1 - u_2)}{m_1 + m_2}", lhs: "v_2'", expr: '(m1*u1 + m2*u2 + e*m1*(u1 - u2))/(m1 + m2)', unit: 'm/s', measure: 'v2', kind: 'exact' },
  { id: 'col.px', situation: 'collision', title: '动量守恒（x 方向）', latex: "p_x' = m_1v_{1x} + m_2v_{2x}", lhs: "p_x'", expr: 'p0x', unit: 'kg·m/s', measure: 'px', kind: 'exact', requires: ['isolated'] },
  { id: 'col.py', situation: 'collision', title: '动量守恒（y 方向）', latex: "p_y' = m_1v_{1y} + m_2v_{2y}", lhs: "p_y'", expr: 'p0y', unit: 'kg·m/s', measure: 'py', kind: 'exact', requires: ['isolated', 'oblique'] },
  { id: 'col.dE', situation: 'collision', title: '碰撞损失的动能', latex: '\\Delta E_k = \\dfrac{m_1m_2(1 - e^2)(u_1 - u_2)^2}{2(m_1 + m_2)}', lhs: '\\Delta E_k', expr: 'm1*m2*(1 - e^2)*(u1 - u2)^2/(2*(m1 + m2))', unit: 'J', measure: 'dE', kind: 'exact' },
  { id: 'col.tangent', situation: 'collision', title: '光滑球切向速度不变', latex: "v_{1t}' = v_{1t}", lhs: "v_{1t}'", expr: 'w1', unit: 'm/s', measure: 'w1after', kind: 'exact', requires: ['oblique'] },
  { id: 'col.angle', situation: 'collision', title: '等质量弹性斜碰：碰后速度互相垂直', latex: '\\angle(\\vec v_1\\,\', \\vec v_2\\,\') = \\dfrac{\\pi}{2}', lhs: '\\varphi', expr: 'pi/2', unit: 'rad', measure: 'angle', kind: 'exact', requires: ['oblique', 'equalMassElasticRest'] },
  { id: 'bounce.v', situation: 'bounce', title: '与固定面碰撞后的法向速度', latex: "v_n' = -e\\,v_n", lhs: "v_n'", expr: '-e*u', unit: 'm/s', measure: 'v', kind: 'exact' },

  // ------------------------------------------------------------------ projectile
  { id: 'pr.x', situation: 'projectile', title: '水平位置', latex: 'x = x_0 + v_{0x}t', lhs: 'x', expr: 'x0 + vx0*t', unit: 'm', measure: 'x', kind: 'exact' },
  { id: 'pr.y', situation: 'projectile', title: '竖直位置', latex: 'y = y_0 + v_{0y}t - \\tfrac{1}{2}gt^2', lhs: 'y', expr: 'y0 + vy0*t - g*t^2/2', unit: 'm', measure: 'y', kind: 'exact' },
  { id: 'pr.vx', situation: 'projectile', title: '水平速度不变', latex: 'v_x = v_{0x}', lhs: 'v_x', expr: 'vx0', unit: 'm/s', measure: 'vx', kind: 'exact' },
  { id: 'pr.vy', situation: 'projectile', title: '竖直速度', latex: 'v_y = v_{0y} - gt', lhs: 'v_y', expr: 'vy0 - g*t', unit: 'm/s', measure: 'vy', kind: 'exact' },
  { id: 'pr.T', situation: 'projectile', title: '飞行时间（落到 y₁ 高度）', latex: 'T = \\dfrac{v_{0y} + \\sqrt{v_{0y}^2 + 2g(y_0 - y_1)}}{g}', lhs: 'T', expr: '(vy0 + sqrt(vy0^2 + 2*g*(y0 - y1)))/g', unit: 's', measure: 'T', kind: 'exact', requires: ['lands'] },
  { id: 'pr.R', situation: 'projectile', title: '水平射程', latex: 'R = v_{0x}\\,T', lhs: 'R', expr: 'vx0*(vy0 + sqrt(vy0^2 + 2*g*(y0 - y1)))/g', unit: 'm', measure: 'R', kind: 'exact', requires: ['lands'] },
  { id: 'pr.H', situation: 'projectile', title: '最高点高度', latex: 'H = y_0 + \\dfrac{v_{0y}^2}{2g}', lhs: 'H', expr: 'y0 + vy0^2/(2*g)', unit: 'm', measure: 'H', kind: 'exact', requires: ['rises'] },

  // ------------------------------------------------------------------ pendulum
  { id: 'pe.T.small', situation: 'pendulum', title: '单摆周期（小角度近似）', latex: 'T \\approx 2\\pi\\sqrt{\\dfrac{L}{g}}', lhs: 'T', expr: '2*pi*sqrt(L/g)', unit: 's', measure: 'T', kind: 'approx', approxOf: 'smallAngle', note: '仅当 sinθ ≈ θ 时成立', causes: ['摆角较大时 sinθ ≈ θ 不再成立，周期随振幅增大'] },
  { id: 'pe.T.exact', situation: 'pendulum', title: '单摆周期（任意摆角，精确）', latex: 'T = 4\\sqrt{\\dfrac{L}{g}}\\;K\\!\\left(\\sin\\dfrac{\\theta_0}{2}\\right)', lhs: 'T', expr: '4*sqrt(L/g)*ellipK(sin(theta0/2))', unit: 's', measure: 'T', kind: 'exact', requires: ['taut'], note: 'K 为第一类完全椭圆积分' },
  { id: 'pe.v', situation: 'pendulum', title: '最低点速率', latex: 'v = \\sqrt{2gL(1 - \\cos\\theta_0)}', lhs: 'v', expr: 'sqrt(2*g*L*(1 - cos(theta0)))', unit: 'm/s', measure: 'vBottom', kind: 'exact', requires: ['taut'] },
  { id: 'pe.F', situation: 'pendulum', title: '最低点绳的拉力', latex: 'F_T = mg(3 - 2\\cos\\theta_0)', lhs: 'F_T', expr: 'm*g*(3 - 2*cos(theta0))', unit: 'N', measure: 'TBottom', kind: 'exact', requires: ['taut'] },

  // ------------------------------------------------------------------ spring oscillator
  { id: 'sp.T', situation: 'spring', title: '弹簧振子周期', latex: 'T = 2\\pi\\sqrt{\\dfrac{m}{k}}', lhs: 'T', expr: '2*pi*sqrt(m/k)', unit: 's', measure: 'T', kind: 'exact' },
  { id: 'sp.vmax', situation: 'spring', title: '最大速率（平衡位置）', latex: 'v_{\\max} = A\\sqrt{\\dfrac{k}{m}}', lhs: 'v_{\\max}', expr: 'A*sqrt(k/m)', unit: 'm/s', measure: 'vmax', kind: 'exact' },
  { id: 'sp.amax', situation: 'spring', title: '最大加速度（最大位移处）', latex: 'a_{\\max} = \\dfrac{kA}{m}', lhs: 'a_{\\max}', expr: 'k*A/m', unit: 'm/s²', measure: 'amax', kind: 'exact' },

  // ------------------------------------------------------------------ fixed-axis rotation
  { id: 'ro.alpha', situation: 'rotation', title: '角加速度（转动定律）', latex: '\\beta = -\\dfrac{mgd\\sin\\varphi}{I}', lhs: '\\beta', expr: '-m*g*d*sin(phi)/Ip', unit: 'rad/s²', measure: 'alpha', kind: 'exact', note: 'I = I_C + md²（平行轴定理）；φ 为质心偏离竖直向下的角度' },
  { id: 'ro.omega', situation: 'rotation', title: '转到最低点的角速度（机械能守恒）', latex: '\\omega = \\sqrt{\\omega_0^2 + \\dfrac{2mgd(1 - \\cos\\varphi_0)}{I}}', lhs: '\\omega', expr: 'sqrt(omega0^2 + 2*m*g*d*(1 - cos(phi0))/Ip)', unit: 'rad/s', measure: 'omegaBottom', kind: 'exact', requires: ['reachesBottom'] },
  { id: 'ro.rod', situation: 'rotation', title: '细杆从水平释放到竖直的角速度', latex: '\\omega = \\sqrt{\\dfrac{3g}{L}}', lhs: '\\omega', expr: 'sqrt(3*g/L)', unit: 'rad/s', measure: 'omegaBottom', kind: 'exact', requires: ['thinRodFromHorizontal', 'reachesBottom'] },
  { id: 'ro.F', situation: 'rotation', title: '最低点铰链对物体的力', latex: 'F = mg + m\\omega^2 d', lhs: 'F', expr: 'm*g + m*d*(omega0^2 + 2*m*g*d*(1 - cos(phi0))/Ip)', unit: 'N', measure: 'FBottom', kind: 'exact', requires: ['reachesBottom'] },

  // ------------------------------------------------------------------ rolling
  { id: 'rl.a', situation: 'rolling', title: '纯滚动的加速度', latex: 'a = \\dfrac{g\\sin\\theta}{1 + I/(mr^2)}', lhs: 'a', expr: 'g*sin(theta)/(1 + I/(m*r^2))', unit: 'm/s²', measure: 'a', kind: 'exact', requires: ['pureRolling'] },
  { id: 'rl.f', situation: 'rolling', title: '纯滚动所需的静摩擦力', latex: 'f = \\dfrac{I}{r^2}\\,a', lhs: 'f', expr: 'I/r^2*g*sin(theta)/(1 + I/(m*r^2))', unit: 'N', measure: 'f', kind: 'exact', requires: ['pureRolling'] },
  { id: 'rl.vw', situation: 'rolling', title: '纯滚动条件', latex: 'v = \\omega r', lhs: 'v', expr: 'omegaSim*r', unit: 'm/s', measure: 'v', kind: 'exact', requires: ['pureRolling'], note: 'ω 取仿真值，检验接触点相对速度为零' },
  { id: 'rl.a.slip', situation: 'rolling', title: '边滚边滑：质心加速度', latex: 'a = g(\\sin\\theta - \\mu_k\\cos\\theta)', lhs: 'a', expr: 'g*(sin(theta) - muK*cos(theta))', unit: 'm/s²', measure: 'a', kind: 'exact', requires: ['slipping'] },
  { id: 'rl.beta.slip', situation: 'rolling', title: '边滚边滑：角加速度', latex: '\\beta = \\dfrac{\\mu_k mgr\\cos\\theta}{I}', lhs: '\\beta', expr: 'muK*m*g*r*cos(theta)/I', unit: 'rad/s²', measure: 'beta', kind: 'exact', requires: ['slipping'] },

  // ------------------------------------------------------------------ impact on a hinged body
  { id: 'hi.v', situation: 'hinged-impact', title: '碰后小球速度（沿碰撞法线）', latex: "v' = \\dfrac{v\\,(md^2 - eI)}{md^2 + I}", lhs: "v'", expr: 'v*(m*d^2 - e*Ip)/(m*d^2 + Ip)', unit: 'm/s', measure: 'vAfter', kind: 'exact', requires: ['rest'] },
  { id: 'hi.w', situation: 'hinged-impact', title: '碰后物体的角速度', latex: "\\omega' = \\dfrac{(1 + e)\\,mdv}{md^2 + I}", lhs: "\\omega'", expr: '(1 + e)*m*d*v/(m*d^2 + Ip)', unit: 'rad/s', measure: 'omegaAfter', kind: 'exact', requires: ['rest'] },
  { id: 'hi.L', situation: 'hinged-impact', title: '对转轴的角动量守恒', latex: "L' = L", lhs: "L'", expr: 'L0', unit: 'kg·m²/s', measure: 'LAfter', kind: 'exact' },

  // ------------------------------------------------------------------ connected bodies
  { id: 'pu.a', situation: 'pulley', title: '加速度（整体法）', latex: 'a = \\dfrac{m_2 g - \\mu m_1 g}{m_1 + m_2}', lhs: 'a', expr: '(m2*g - mu*m1*g)/(m1 + m2)', unit: 'm/s²', measure: 'a', kind: 'exact', requires: ['moving'], method: '整体法' },
  { id: 'pu.T2', situation: 'pulley', title: '绳的拉力（隔离悬挂物块）', latex: 'T = m_2(g - a)', lhs: 'T', expr: 'm2*(g - (m2*g - mu*m1*g)/(m1 + m2))', unit: 'N', measure: 'T', kind: 'exact', requires: ['moving'], method: '隔离法（物块2）' },
  { id: 'pu.T1', situation: 'pulley', title: '绳的拉力（隔离桌上物块）', latex: 'T = m_1(a + \\mu g)', lhs: 'T', expr: 'm1*((m2*g - mu*m1*g)/(m1 + m2) + mu*g)', unit: 'N', measure: 'T', kind: 'exact', requires: ['moving'], method: '隔离法（物块1）' },
  { id: 'at.a', situation: 'atwood', title: '阿特伍德机加速度（整体法）', latex: 'a = \\dfrac{(m_2 - m_1)g}{m_1 + m_2}', lhs: 'a', expr: '(m2 - m1)*g/(m1 + m2)', unit: 'm/s²', measure: 'a', kind: 'exact', method: '整体法' },
  { id: 'at.T', situation: 'atwood', title: '绳的拉力（隔离法）', latex: 'T = \\dfrac{2m_1m_2 g}{m_1 + m_2}', lhs: 'T', expr: '2*m1*m2*g/(m1 + m2)', unit: 'N', measure: 'T', kind: 'exact', method: '隔离法' },

  // ------------------------------------------------------------------ conservation laws
  { id: 'en.ledger', situation: 'energy', title: '能量守恒（能量账本）', latex: 'E_k + E_p + E_s + Q + \\Delta E_{\\text{碰}} - W = E_0', lhs: 'E_{\\Sigma}', expr: 'E0', unit: 'J', measure: 'balance', kind: 'exact', note: 'Q 含摩擦生热与阻尼耗散；W 含外力与传送带电机做的功' },
  { id: 'mo.px', situation: 'momentum', title: '系统动量守恒（x 方向）', latex: 'p_x = p_{x0}', lhs: 'p_x', expr: 'p0x', unit: 'kg·m/s', measure: 'px', kind: 'exact' },
  { id: 'mo.py', situation: 'momentum', title: '系统动量守恒（y 方向）', latex: 'p_y = p_{y0}', lhs: 'p_y', expr: 'p0y', unit: 'kg·m/s', measure: 'py', kind: 'exact' }
]
