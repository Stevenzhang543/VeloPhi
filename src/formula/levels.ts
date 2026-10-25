/**
 * Knowledge levels of the formulas (manual 26.51, D44). Every formula carries two tags: the Chinese curriculum
 * (义务教育物理课程标准 2022; 普通高中物理课程标准 2017/2020: 必修 and 选择性必修) and the IB (MYP; Diploma
 * Programme physics, first assessment 2025: SL and HL). Both map to one ordinal scale
 *   1 lower secondary (初中 / MYP) · 2 upper secondary (高中 / DP SL) · 3 DP HL · 4 university · 5 beyond,
 * so a chosen level is a ceiling: a card is shown when its ordinal in the chosen curriculum is at most the level.
 * The tags only steer what is shown; recognition and comparison are unchanged.
 *
 * Basis of the tags (see DEV_MANUAL_26_51 §1): rotational dynamics, moments of inertia, angular momentum,
 * gravitational potential energy and escape speed are HL in the IB and university in China; the coefficient of
 * restitution, non-inertial frames and integral forms are university in both; equilibrium of forces, levers,
 * pulleys, work and power are lower secondary.
 */

/** Curriculum whose level names and tags are used. */
export type Curriculum = 'cn' | 'ib'
/** Chinese curriculum: 初中, 高中必修, 高中选择性必修, 大学, 更高. */
export type CnLevel = 'j' | 's1' | 's2' | 'u' | 'a'
/** IB: MYP, DP SL, DP HL, university, beyond. */
export type IbLevel = 'myp' | 'sl' | 'hl' | 'u' | 'a'

/** Ordinal of each tag. */
export const CN_ORD: Record<CnLevel, number> = { j: 1, s1: 2, s2: 2, u: 4, a: 5 }
export const IB_ORD: Record<IbLevel, number> = { myp: 1, sl: 2, hl: 3, u: 4, a: 5 }

/** The levels a user can choose in each curriculum (ordinal and the Chinese source text of the name). */
export const LEVEL_CHOICES: Record<Curriculum, Array<{ ord: number; name: string }>> = {
  cn: [{ ord: 1, name: '初中' }, { ord: 2, name: '高中' }, { ord: 4, name: '大学' }, { ord: 5, name: '更高' }],
  ib: [{ ord: 1, name: 'MYP' }, { ord: 2, name: 'DP SL' }, { ord: 3, name: 'DP HL' }, { ord: 4, name: '大学' }, { ord: 5, name: '更高' }]
}

/** Short tag shown on a card (Chinese source text; MYP, SL, HL are the same in every language). */
export const CN_TAG: Record<CnLevel, string> = { j: '初中', s1: '高中必修', s2: '高中选必', u: '大学', a: '更高' }
export const IB_TAG: Record<IbLevel, string> = { myp: 'IB MYP', sl: 'IB SL', hl: 'IB HL', u: '大学', a: '更高' }

/** Level tags of every formula: [Chinese curriculum, IB]. */
export const LEVELS: Record<string, readonly [CnLevel, IbLevel]> = {
  // Incline
  'incline.a.down': ['s1', 'sl'], 'incline.a.up': ['s1', 'sl'], 'incline.a.stick': ['s1', 'sl'], 'incline.N': ['s1', 'sl'],
  'incline.f.kinetic': ['s1', 'sl'], 'incline.f.static': ['s1', 'sl'], 'incline.v': ['s1', 'sl'], 'incline.s': ['s1', 'sl'], 'incline.t.common': ['s1', 'sl'],
  // Horizontal surface: N = G is lower secondary (balanced forces)
  'flat.a': ['s1', 'sl'], 'flat.N': ['j', 'myp'], 'flat.f': ['s1', 'sl'], 'flat.t': ['s1', 'sl'], 'flat.x': ['s1', 'sl'], 'flat.ds': ['s1', 'sl'], 'flat.Q': ['s1', 'sl'], 'flat.W': ['s1', 'sl'],
  // Board and block
  'bb.a1': ['s1', 'sl'], 'bb.a2': ['s1', 'sl'], 'bb.a2.rest': ['s1', 'sl'], 'bb.t': ['s1', 'sl'], 'bb.vc': ['s1', 'sl'], 'bb.ds': ['s1', 'sl'], 'bb.Q': ['s1', 'sl'],
  'bt.a': ['s1', 'sl'], 'bt.f': ['s1', 'sl'],
  // Collisions: the coefficient of restitution is university level in both curricula
  'col.v1': ['u', 'u'], 'col.v2': ['u', 'u'], 'col.px': ['s2', 'sl'], 'col.py': ['s2', 'sl'], 'col.dE': ['u', 'u'], 'col.tangent': ['u', 'u'], 'col.angle': ['u', 'u'], 'bounce.v': ['u', 'u'],
  // Projectile
  'pr.x': ['s1', 'sl'], 'pr.y': ['s1', 'sl'], 'pr.vx': ['s1', 'sl'], 'pr.vy': ['s1', 'sl'], 'pr.T': ['s1', 'sl'], 'pr.R': ['s1', 'sl'], 'pr.H': ['s1', 'sl'],
  // Pendulum
  'pe.T.small': ['s2', 'sl'], 'pe.T.exact': ['a', 'a'], 'pe.v': ['s1', 'sl'], 'pe.F': ['s1', 'sl'],
  // Spring oscillator: v = ±ω√(x₀² − x²) is HL in the IB
  'sp.T': ['s2', 'sl'], 'sp.vmax': ['s2', 'hl'], 'sp.amax': ['s2', 'sl'],
  // Rotation, rolling, impact on a hinged body: rigid-body mechanics (IB A.4, HL only)
  'ro.alpha': ['u', 'hl'], 'ro.omega': ['u', 'hl'], 'ro.rod': ['u', 'hl'], 'ro.F': ['u', 'hl'],
  'rl.a': ['u', 'hl'], 'rl.f': ['u', 'hl'], 'rl.vw': ['u', 'hl'], 'rl.a.slip': ['u', 'hl'], 'rl.beta.slip': ['u', 'hl'],
  'hi.v': ['u', 'hl'], 'hi.w': ['u', 'hl'], 'hi.L': ['u', 'hl'],
  // Connected bodies
  'pu.a': ['s1', 'sl'], 'pu.T2': ['s1', 'sl'], 'pu.T1': ['s1', 'sl'], 'at.a': ['s1', 'sl'], 'at.T': ['s1', 'sl'],
  // Vertical circles; the time of slack needs elliptic integrals
  'vc.r.T0': ['s1', 'sl'], 'vc.r.vtop': ['s1', 'sl'], 'vc.r.Ttop': ['s1', 'sl'], 'vc.r.crit': ['s1', 'sl'], 'vc.r.slackv': ['s1', 'sl'],
  'vc.r.phiS': ['s1', 'sl'], 'vc.r.hS': ['s1', 'sl'], 'vc.r.vS': ['s1', 'sl'], 'vc.r.tS': ['a', 'a'],
  'vc.d.F0': ['s1', 'sl'], 'vc.d.vtop': ['s1', 'sl'], 'vc.d.Ftop': ['s1', 'sl'], 'vc.d.zero': ['s1', 'sl'],
  // Movable pulley
  'mp.rel': ['s1', 'sl'], 'mp.a2': ['s1', 'sl'], 'mp.a1': ['s1', 'sl'], 'mp.T': ['s1', 'sl'], 'mp.T1': ['s1', 'sl'], 'mp.T2': ['s1', 'sl'],
  // Movable wedge: non-inertial frame (university); horizontal momentum is upper secondary
  'wd.A': ['u', 'u'], 'wd.arel': ['u', 'u'], 'wd.N': ['u', 'u'], 'wd.px': ['s2', 'sl'],
  // Spring-joined bodies; the reduced mass is university
  'sb.p': ['s2', 'sl'], 'sb.vc': ['s2', 'sl'], 'sb.Ep': ['s2', 'sl'], 'sb.x': ['s2', 'sl'], 'sb.T': ['u', 'u'],
  // Rolling with slipping (rotation dynamics)
  'rs.a': ['u', 'hl'], 'rs.beta': ['u', 'hl'], 'rs.t': ['u', 'hl'], 'rs.v': ['u', 'hl'], 'rs.cyl.t': ['u', 'hl'], 'rs.cyl.v': ['u', 'hl'], 'rs.Q': ['u', 'hl'],
  // Variable force: impulse as the area under F–t is upper secondary; closed forms need calculus
  'vf.J': ['s2', 'sl'], 'vf.v': ['s2', 'sl'], 'vf.x': ['u', 'u'], 'vf.W': ['s1', 'sl'], 'vf.sin.v': ['u', 'u'], 'vf.sin.x': ['u', 'u'],
  // Conservation laws
  'en.ledger': ['s1', 'sl'], 'mo.px': ['s2', 'sl'], 'mo.py': ['s2', 'sl'],
  // ---- 26.51 (D44) ----
  // Collisions: elastic and perfectly inelastic special cases need no restitution coefficient (upper secondary)
  'col.el.v1': ['s2', 'sl'], 'col.el.v2': ['s2', 'sl'], 'col.swap': ['s2', 'sl'], 'col.in.v': ['s2', 'sl'], 'col.in.dE': ['s2', 'sl'],
  // Free fall; conservation of mechanical energy (MYP: kinetic and gravitational potential energy)
  'ff.v': ['s1', 'sl'], 'ff.h': ['s1', 'sl'], 'ff.v2': ['s1', 'sl'], 'pr.E': ['s1', 'myp'], 'pr.v': ['s1', 'sl'],
  // Uniform motion, Newton's first law (lower secondary)
  'uni.s': ['j', 'myp'], 'uni.v': ['j', 'myp'], 'uni.F': ['j', 'myp'],
  // Pulling with a constant force: W = Fs and P = Fv are lower secondary; resolving forces, the work–energy and
  // impulse–momentum theorems upper secondary
  'cf.W0': ['j', 'myp'], 'cf.P': ['j', 'myp'], 'cf.a': ['s1', 'sl'], 'cf.N': ['s1', 'sl'], 'cf.W': ['s1', 'sl'], 'cf.dEk': ['s1', 'sl'], 'cf.J': ['s2', 'sl'],
  // Lever: the principle is lower secondary, the force on the fulcrum needs the balance of forces
  'lever.F': ['j', 'myp'], 'lever.N': ['s1', 'sl'],
  // Uniform circular motion
  'uc.w': ['s1', 'sl'], 'uc.T': ['s1', 'sl'], 'uc.a': ['s1', 'sl'], 'uc.F': ['s1', 'sl'],
  // Orbits: Newton's law of gravitation and Kepler's laws (必修 / SL); orbital energy HL; vis-viva and the
  // eccentricity from energy and angular momentum university
  'or.F': ['s1', 'sl'], 'or.v': ['s1', 'sl'], 'or.T': ['s1', 'sl'], 'or.A': ['s1', 'sl'], 'or.E': ['u', 'hl'], 'or.vis': ['u', 'u'], 'or.ecc': ['u', 'u'],
  // Air drag: the drag force and the terminal speed of linear (Stokes) drag are SL; the time dependence university
  'dr.F': ['u', 'sl'], 'dr.vt': ['u', 'sl'], 'dr.vt2': ['u', 'u'], 'dr.v': ['u', 'u'], 'dr.v2': ['u', 'u'],
  // Damped oscillation (the IB treats damping qualitatively)
  'dm.T': ['u', 'u'], 'dm.ratio': ['u', 'u'],
  // Rotation under a torque (IB A.4, HL)
  'spin.beta': ['u', 'hl'], 'spin.omega': ['u', 'hl'], 'spin.theta': ['u', 'hl'], 'spin.W': ['u', 'hl'],
  // Gears: equal speeds at the rim are upper secondary (传动装置); the effective inertia is rotational dynamics
  'gear.w': ['s1', 'sl'], 'gear.v': ['s1', 'sl'], 'gear.beta': ['u', 'hl']
}

/** Tags of a formula (formulas without tags count as university, so a missing tag never hides a basic one). */
export function levelOf(id: string): { cn: CnLevel; ib: IbLevel } {
  const t = LEVELS[id]
  return t ? { cn: t[0], ib: t[1] } : { cn: 'u', ib: 'u' }
}

/** Ordinal of a formula in a curriculum. */
export function levelOrdinal(id: string, c: Curriculum): number {
  const l = levelOf(id)
  return c === 'cn' ? CN_ORD[l.cn] : IB_ORD[l.ib]
}

/** Whether a formula is within the chosen level. */
export function withinLevel(id: string, c: Curriculum, level: number): boolean {
  return levelOrdinal(id, c) <= level
}

/** Source text of a formula's tag in a curriculum (translate with tl). */
export function levelTag(id: string, c: Curriculum): string {
  const l = levelOf(id)
  return c === 'cn' ? CN_TAG[l.cn] : IB_TAG[l.ib]
}

/** The level of a curriculum closest to (and not above) an ordinal, so switching curricula keeps the ceiling. */
export function nearestLevel(c: Curriculum, ord: number): number {
  let best = LEVEL_CHOICES[c][0].ord
  for (const ch of LEVEL_CHOICES[c]) if (ch.ord <= ord) best = ch.ord
  return best
}
