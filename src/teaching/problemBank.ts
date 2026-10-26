/**
 * 26.52 built-in problems (D40 revised): 30 problems in textbook chapter order, each a template with parameters
 * plus a stem and questions. The stem names the parameters as `{key}` placeholders filled from the scene, and the
 * answers are read from the simulation, so "another set of numbers" (random parameters in each problem's `vary`
 * ranges) gives a new problem with correct answers. Texts are trilingual inline.
 *
 * Pure (no DOM, no Vue).
 */
import type { Tri } from '../i18n/tri'
import { buildTemplate } from '../templates'
import type { ChapterId, ChoiceQuestion, NumericQuestion, Problem, ProblemQuestion, ProblemTarget } from './problems'

/** A built-in problem: a template with parameters, its texts and questions. */
export interface BuiltinProblem {
  id: string
  chapter: ChapterId
  template: string
  params: Record<string, number>
  /** Ranges of "another set of numbers": [min, max, step]. */
  vary: Record<string, [number, number, number]>
  /** Simulated duration (s); default: the template's. */
  duration?: number
  title: Tri
  stem: Tri
  questions: ProblemQuestion[]
}

const T = (zh: string, en: string, de: string): Tri => ({ zh, en, de })
const num = (id: string, prompt: Tri, target: ProblemTarget, more: Partial<NumericQuestion> = {}): NumericQuestion => ({ id, type: 'numeric', prompt, target, ...more })
const choice = (id: string, prompt: Tri, options: Tri[], more: Partial<ChoiceQuestion>): ChoiceQuestion => ({ id, type: 'choice', prompt, options, ...more })
const formula = (situation: string, f: string, occurrence = 0): ProblemTarget => ({ kind: 'formula', situation, formula: f, occurrence })
const G = T('g 取 {g} m/s²。', 'Take g = {g} m/s².', 'Nimm g = {g} m/s².')
const withG = (t: Tri): Tri => ({ zh: `${t.zh}${G.zh}`, en: `${t.en} ${G.en}`, de: `${t.de} ${G.de}` })

export const BUILTIN_PROBLEMS: BuiltinProblem[] = [
  // ---- Uniformly accelerated motion ----
  {
    id: 'k-free-fall', chapter: 'kinematics', template: 'free-fall', params: { h: 5 }, vary: { h: [2, 20, 1] },
    title: T('自由落体', 'Free fall', 'Freier Fall'),
    stem: withG(T('小球从离地 {h} m 高处由静止释放，不计空气阻力。', 'A ball is released from rest {h} m above the ground. Air resistance is negligible.', 'Eine Kugel wird {h} m über dem Boden aus der Ruhe losgelassen. Der Luftwiderstand ist vernachlässigbar.')),
    questions: [
      num('t', T('小球经过多长时间落地？', 'How long does the ball take to reach the ground?', 'Nach welcher Zeit erreicht die Kugel den Boden?'), { kind: 'event', event: 'impact', body: 'ball' },
        { hint: T('h = ½gt²', 'h = ½gt²', 'h = ½gt²'), explain: T('由 h = ½gt² 得 t = √(2h/g)。', 'From h = ½gt²: t = √(2h/g).', 'Aus h = ½gt² folgt t = √(2h/g).') }),
      num('v', T('小球落地前瞬间的速度大小是多少？', 'What is its speed just before it hits the ground?', 'Wie groß ist ihre Geschwindigkeit kurz vor dem Aufprall?'), { kind: 'atEvent', id: 'ball.v', event: 'impact', body: 'ball', side: 'before' },
        { explain: T('v = gt = √(2gh)。', 'v = gt = √(2gh).', 'v = gt = √(2gh).') })
    ]
  },
  {
    id: 'k-pull', chapter: 'kinematics', template: 'pull-force', params: { F: 10, alpha: 0, m: 2, mu: 0.2 }, vary: { F: [6, 20, 1], mu: [0.1, 0.4, 0.05] }, duration: 2.5,
    title: T('水平拉力下的匀加速运动', 'Uniform acceleration under a horizontal pull', 'Gleichmäßig beschleunigt durch eine waagerechte Zugkraft'),
    stem: withG(T('质量 {m} kg 的物块静止在水平地面上，与地面间的动摩擦因数 μ = {mu}。现用 F = {F} N 的水平拉力拉物块。', 'A {m} kg block rests on level ground; the coefficient of kinetic friction is μ = {mu}. It is pulled by a horizontal force F = {F} N.', 'Ein Klotz der Masse {m} kg liegt auf ebenem Boden, Gleitreibungszahl μ = {mu}. Er wird mit der waagerechten Kraft F = {F} N gezogen.')),
    questions: [
      num('a', T('物块的加速度大小是多少？', 'What is the magnitude of its acceleration?', 'Wie groß ist seine Beschleunigung?'), formula('const-force', 'cf.a'),
        { hint: T('F − μmg = ma', 'F − μmg = ma', 'F − μmg = ma'), explain: T('a = (F − μmg)/m。', 'a = (F − μmg)/m.', 'a = (F − μmg)/m.') }),
      num('v2', T('拉动 2 s 末物块的速度大小是多少？', 'What is its speed 2 s after the pull starts?', 'Wie schnell ist er 2 s nach Beginn des Ziehens?'), { kind: 'quantity', id: 'block.vx', t: 2 },
        { explain: T('从静止开始匀加速：v = at。', 'Uniform acceleration from rest: v = at.', 'Gleichmäßig beschleunigt aus der Ruhe: v = at.') })
    ]
  },
  {
    id: 'k-incline', chapter: 'kinematics', template: 'incline', params: { theta: 30, m: 2, mu: 0.2 }, vary: { theta: [20, 50, 1], mu: [0, 0.3, 0.05] }, duration: 1.2,
    title: T('沿斜面下滑', 'Sliding down an incline', 'Gleiten auf der schiefen Ebene'),
    stem: withG(T('倾角 θ = {theta}° 的斜面固定不动，质量 {m} kg 的物块从斜面上由静止释放，物块与斜面间的动摩擦因数 μ = {mu}。', 'An incline at θ = {theta}° is fixed. A {m} kg block is released from rest on it; the coefficient of kinetic friction is μ = {mu}.', 'Eine schiefe Ebene mit θ = {theta}° ist fest. Ein Klotz der Masse {m} kg wird darauf aus der Ruhe losgelassen, Gleitreibungszahl μ = {mu}.')),
    questions: [
      num('a', T('物块下滑的加速度大小是多少？', 'What is the acceleration of the block down the incline?', 'Wie groß ist die Beschleunigung hangabwärts?'), formula('incline', 'incline.a.down'),
        { hint: T('沿斜面：mg sinθ − μmg cosθ = ma', 'Along the incline: mg sinθ − μmg cosθ = ma', 'Längs der Ebene: mg sinθ − μmg cosθ = ma'), explain: T('a = g(sinθ − μcosθ)。', 'a = g(sinθ − μcosθ).', 'a = g(sinθ − μcosθ).') }),
      num('v1', T('释放后 0.5 s 末物块的速度大小是多少？', 'What is its speed 0.5 s after release?', 'Wie schnell ist er 0,5 s nach dem Loslassen?'), { kind: 'quantity', id: 'block.v', t: 0.5 },
        { explain: T('v = at。', 'v = at.', 'v = at.') })
    ]
  },

  // ---- Forces and equilibrium ----
  {
    id: 'f-incline-rest', chapter: 'forces', template: 'incline', params: { theta: 30, m: 2, mu: 0.7 }, vary: { theta: [15, 30, 1], mu: [0.6, 0.9, 0.05] }, duration: 1,
    title: T('静止在斜面上的物块', 'A block at rest on an incline', 'Ein ruhender Klotz auf der schiefen Ebene'),
    stem: withG(T('倾角 θ = {theta}° 的斜面上放有质量 {m} kg 的物块，物块与斜面间的动摩擦因数 μ = {mu}（最大静摩擦力等于滑动摩擦力），物块由静止释放。', 'A {m} kg block is released from rest on an incline at θ = {theta}°. The coefficient of friction is μ = {mu} (maximum static friction equals kinetic friction).', 'Ein Klotz der Masse {m} kg wird auf einer schiefen Ebene mit θ = {theta}° aus der Ruhe losgelassen. Reibungszahl μ = {mu} (maximale Haftreibung gleich Gleitreibung).')),
    questions: [
      choice('rest', T('物块能否静止在斜面上？', 'Does the block stay at rest?', 'Bleibt der Klotz in Ruhe?'), [T('能，保持静止', 'Yes, it stays at rest', 'Ja, er bleibt in Ruhe'), T('不能，会加速下滑', 'No, it slides down', 'Nein, er gleitet hinab')],
        { answerFrom: { target: { kind: 'end', id: 'block.v' }, bounds: [1e-6] }, explain: T('比较 mg sinθ 与最大静摩擦力 μmg cosθ（即比较 tanθ 与 μ）。', 'Compare mg sinθ with the maximum static friction μmg cosθ (that is, tanθ with μ).', 'Vergleiche mg sinθ mit der maximalen Haftreibung μmg cosθ (also tanθ mit μ).') }),
      num('f', T('斜面对物块的摩擦力大小是多少？', 'What is the friction force of the incline on the block?', 'Wie groß ist die Reibungskraft der Ebene auf den Klotz?'), formula('incline', 'incline.f.static'),
        { hint: T('静摩擦力由平衡条件求，不是 μN。', 'Static friction follows from equilibrium, not from μN.', 'Die Haftreibung folgt aus dem Gleichgewicht, nicht aus μN.'), explain: T('f = mg sinθ。', 'f = mg sinθ.', 'f = mg sinθ.') }),
      num('N', T('斜面对物块的支持力大小是多少？', 'What is the normal force of the incline on the block?', 'Wie groß ist die Normalkraft der Ebene auf den Klotz?'), formula('incline', 'incline.N'),
        { explain: T('N = mg cosθ。', 'N = mg cosθ.', 'N = mg cosθ.') })
    ]
  },
  {
    id: 'f-lever', chapter: 'forces', template: 'lever', params: { m: 2, l2: 0.3, l1: 0.5, M: 1 }, vary: { m: [1, 5, 0.5], l2: [0.2, 0.5, 0.05], l1: [0.3, 0.8, 0.05] },
    title: T('杠杆平衡', 'A balanced lever', 'Hebel im Gleichgewicht'),
    stem: withG(T('质量 {M} kg 的匀质杠杆支在中点。左侧距支点 {l2} m 处固定质量 {m} kg 的重物，右侧距支点 {l1} m 处用绳竖直向下拉住，杠杆保持水平静止。', 'A uniform {M} kg lever rests on a pivot at its middle. A {m} kg load is fixed {l2} m left of the pivot; a vertical rope {l1} m right of the pivot holds the lever level.', 'Ein homogener Hebel der Masse {M} kg ist in der Mitte gelagert. Eine Last von {m} kg sitzt {l2} m links vom Drehpunkt; ein senkrechtes Seil {l1} m rechts davon hält den Hebel waagerecht.')),
    questions: [
      num('T', T('绳的拉力是多少？', 'What is the tension in the rope?', 'Wie groß ist die Seilkraft?'), formula('lever', 'lever.F'),
        { hint: T('对支点列力矩平衡。', 'Balance the torques about the pivot.', 'Momentengleichgewicht um den Drehpunkt.'), explain: T('T·l₁ = mg·l₂，T = mg·l₂/l₁。', 'T·l₁ = mg·l₂, so T = mg·l₂/l₁.', 'T·l₁ = mg·l₂, also T = mg·l₂/l₁.') }),
      num('N', T('支点对杠杆的支持力是多少？', 'What force does the pivot exert on the lever?', 'Welche Kraft übt der Drehpunkt auf den Hebel aus?'), formula('lever', 'lever.N'),
        { explain: T('竖直方向合力为零：N = (m + M)g + T。', 'Vertical forces balance: N = (m + M)g + T.', 'Senkrechtes Kräftegleichgewicht: N = (m + M)g + T.') })
    ]
  },
  {
    id: 'f-table-rest', chapter: 'forces', template: 'table-pulley', params: { m1: 2, m2: 0.5, mu: 0.5 }, vary: { m2: [0.2, 0.9, 0.1] }, duration: 1,
    title: T('桌面上静止的连接体', 'A connected system at rest', 'Ein ruhendes verbundenes System'),
    stem: withG(T('质量 {m1} kg 的物块放在水平桌面上，用跨过桌边定滑轮的轻绳与质量 {m2} kg 的悬挂物块相连。物块与桌面间的动摩擦因数 μ = {mu}（最大静摩擦力等于滑动摩擦力），系统由静止释放。', 'A {m1} kg block on a level table is tied by a light rope over a pulley at the edge to a hanging {m2} kg block. The coefficient of friction on the table is μ = {mu} (maximum static friction equals kinetic friction). The system is released from rest.', 'Ein Klotz von {m1} kg auf einem Tisch ist über eine Rolle an der Tischkante mit einem hängenden Klotz von {m2} kg verbunden. Reibungszahl auf dem Tisch μ = {mu} (maximale Haftreibung gleich Gleitreibung). Das System startet aus der Ruhe.')),
    questions: [
      num('f', T('桌面对物块的摩擦力大小是多少？', 'What is the friction force of the table on the block?', 'Wie groß ist die Reibungskraft des Tisches auf den Klotz?'), { kind: 'quantity', id: 'contact.m1|table.f', t: 0.5 },
        { hint: T('先判断系统是否运动。', 'First decide whether the system moves.', 'Prüfe zuerst, ob sich das System bewegt.'), explain: T('m₂g ≤ μm₁g，系统静止，静摩擦力 f = m₂g。', 'm₂g ≤ μm₁g, so the system stays at rest and f = m₂g.', 'm₂g ≤ μm₁g, das System bleibt in Ruhe und f = m₂g.') }),
      num('T', T('绳的拉力是多少？', 'What is the tension in the rope?', 'Wie groß ist die Seilkraft?'), { kind: 'quantity', id: 'rope.T', t: 0.5 },
        { explain: T('悬挂物块平衡：T = m₂g。', 'The hanging block is in equilibrium: T = m₂g.', 'Der hängende Klotz ist im Gleichgewicht: T = m₂g.') })
    ]
  },

  // ---- Newton's laws ----
  {
    id: 'n-atwood', chapter: 'newton', template: 'atwood', params: { m1: 1, m2: 1.5 }, vary: { m2: [1.2, 3, 0.1] },
    title: T('阿特伍德机', 'Atwood machine', 'Atwoodsche Fallmaschine'),
    stem: withG(T('质量分别为 m₁ = {m1} kg、m₂ = {m2} kg 的两物块用跨过光滑定滑轮的轻绳相连，由静止释放。', 'Two blocks of m₁ = {m1} kg and m₂ = {m2} kg hang from a light rope over a frictionless pulley and are released from rest.', 'Zwei Klötze mit m₁ = {m1} kg und m₂ = {m2} kg hängen an einem leichten Seil über eine reibungsfreie Rolle und starten aus der Ruhe.')),
    questions: [
      num('a', T('两物块加速度的大小是多少？', 'What is the magnitude of their acceleration?', 'Wie groß ist ihre Beschleunigung?'), formula('atwood', 'at.a'),
        { hint: T('整体法：(m₂ − m₁)g = (m₁ + m₂)a', 'Whole system: (m₂ − m₁)g = (m₁ + m₂)a', 'Gesamtsystem: (m₂ − m₁)g = (m₁ + m₂)a'), explain: T('a = (m₂ − m₁)g/(m₁ + m₂)。', 'a = (m₂ − m₁)g/(m₁ + m₂).', 'a = (m₂ − m₁)g/(m₁ + m₂).') }),
      num('T', T('绳的拉力是多少？', 'What is the tension in the rope?', 'Wie groß ist die Seilkraft?'), formula('atwood', 'at.T'),
        { explain: T('隔离 m₁：T − m₁g = m₁a，T = 2m₁m₂g/(m₁ + m₂)。', 'Isolate m₁: T − m₁g = m₁a, so T = 2m₁m₂g/(m₁ + m₂).', 'Freischneiden von m₁: T − m₁g = m₁a, also T = 2m₁m₂g/(m₁ + m₂).') })
    ]
  },
  {
    id: 'n-table', chapter: 'newton', template: 'table-pulley', params: { m1: 2, m2: 1, mu: 0.2 }, vary: { m2: [0.8, 2, 0.1], mu: [0.1, 0.3, 0.05] },
    title: T('桌面—滑轮连接体', 'Block on a table with a pulley', 'Klotz auf dem Tisch mit Rolle'),
    stem: withG(T('质量 m₁ = {m1} kg 的物块放在水平桌面上，用跨过桌边定滑轮的轻绳与质量 m₂ = {m2} kg 的悬挂物块相连，物块与桌面间的动摩擦因数 μ = {mu}，系统由静止释放。', 'A block m₁ = {m1} kg on a level table is tied by a light rope over a pulley to a hanging block m₂ = {m2} kg; the coefficient of kinetic friction is μ = {mu}. The system is released from rest.', 'Ein Klotz m₁ = {m1} kg auf einem Tisch ist über eine Rolle mit einem hängenden Klotz m₂ = {m2} kg verbunden; Gleitreibungszahl μ = {mu}. Das System startet aus der Ruhe.')),
    questions: [
      num('a', T('系统的加速度大小是多少？', 'What is the acceleration of the system?', 'Wie groß ist die Beschleunigung des Systems?'), formula('pulley', 'pu.a'),
        { hint: T('整体法：m₂g − μm₁g = (m₁ + m₂)a', 'Whole system: m₂g − μm₁g = (m₁ + m₂)a', 'Gesamtsystem: m₂g − μm₁g = (m₁ + m₂)a') }),
      num('T', T('绳的拉力是多少？', 'What is the tension in the rope?', 'Wie groß ist die Seilkraft?'), formula('pulley', 'pu.T2'),
        { explain: T('隔离悬挂物块：m₂g − T = m₂a。', 'Isolate the hanging block: m₂g − T = m₂a.', 'Freischneiden des hängenden Klotzes: m₂g − T = m₂a.') })
    ]
  },
  {
    id: 'n-board', chapter: 'newton', template: 'board-block', params: { M: 2, m: 1, v0: 4, mu1: 0.4, mu2: 0.1 }, vary: { v0: [2, 4.5, 0.5], mu1: [0.4, 0.6, 0.05] },
    title: T('板块模型', 'Block on a board', 'Klotz auf einem Brett'),
    stem: withG(T('质量 M = {M} kg 的长木板静止在水平地面上，质量 m = {m} kg 的小物块以 v₀ = {v0} m/s 的速度滑上木板左端。物块与木板间的动摩擦因数 μ₁ = {mu1}，木板与地面间的动摩擦因数 μ₂ = {mu2}，木板足够长。', 'A long board of M = {M} kg rests on level ground. A small block of m = {m} kg slides onto its left end at v₀ = {v0} m/s. Friction coefficients: block–board μ₁ = {mu1}, board–ground μ₂ = {mu2}. The board is long enough.', 'Ein langes Brett (M = {M} kg) liegt auf dem Boden. Ein kleiner Klotz (m = {m} kg) gleitet mit v₀ = {v0} m/s auf sein linkes Ende. Reibungszahlen: Klotz–Brett μ₁ = {mu1}, Brett–Boden μ₂ = {mu2}. Das Brett ist lang genug.')),
    questions: [
      num('t', T('经过多长时间物块与木板共速？', 'After what time do block and board reach a common velocity?', 'Nach welcher Zeit haben Klotz und Brett dieselbe Geschwindigkeit?'), formula('board-block', 'bb.t'),
        { hint: T('分别求两者的加速度，令 v₀ − a₁t = a₂t。', 'Find both accelerations and set v₀ − a₁t = a₂t.', 'Bestimme beide Beschleunigungen und setze v₀ − a₁t = a₂t.') }),
      num('vc', T('共同速度是多少？', 'What is the common velocity?', 'Wie groß ist die gemeinsame Geschwindigkeit?'), formula('board-block', 'bb.vc')),
      num('ds', T('物块在木板上滑行的距离（相对木板）是多少？', 'How far does the block slide relative to the board?', 'Wie weit gleitet der Klotz relativ zum Brett?'), formula('board-block', 'bb.ds'),
        { explain: T('相对位移 = 物块位移 − 木板位移。', 'Relative displacement = displacement of the block − displacement of the board.', 'Relative Verschiebung = Weg des Klotzes − Weg des Bretts.') })
    ]
  },
  {
    id: 'n-conveyor', chapter: 'newton', template: 'conveyor', params: { u: 2, m: 1, mu: 0.5 }, vary: { u: [1, 3, 0.5], mu: [0.3, 0.6, 0.05] }, duration: 1.6,
    title: T('水平传送带', 'Horizontal conveyor belt', 'Waagerechtes Förderband'),
    stem: withG(T('水平传送带以 u = {u} m/s 的速度匀速运行，将质量 {m} kg 的物块轻放在传送带左端，物块与传送带间的动摩擦因数 μ = {mu}，传送带足够长。', 'A horizontal belt runs at u = {u} m/s. A {m} kg block is placed on its left end at rest; the coefficient of kinetic friction is μ = {mu}. The belt is long enough.', 'Ein waagerechtes Förderband läuft mit u = {u} m/s. Ein Klotz von {m} kg wird ruhend auf sein linkes Ende gelegt, Gleitreibungszahl μ = {mu}. Das Band ist lang genug.')),
    questions: [
      num('t', T('经过多长时间物块与传送带共速？', 'After what time does the block move with the belt?', 'Nach welcher Zeit bewegt sich der Klotz mit dem Band?'), { kind: 'event', event: 'stick', body: 'block' },
        { hint: T('a = μg，u = at', 'a = μg, u = at', 'a = μg, u = at') }),
      num('ds', T('这段时间内物块相对传送带滑动的距离是多少？', 'How far does the block slide relative to the belt in that time?', 'Wie weit gleitet der Klotz in dieser Zeit relativ zum Band?'), { kind: 'end', id: 'pair.belt|block.slide' },
        { explain: T('传送带位移 ut 减去物块位移 ut/2，即 ut/2。', 'Belt displacement ut minus block displacement ut/2, that is ut/2.', 'Weg des Bandes ut minus Weg des Klotzes ut/2, also ut/2.') }),
      num('Q', T('摩擦产生的热量是多少？', 'How much heat does friction produce?', 'Wie viel Wärme entsteht durch Reibung?'), { kind: 'end', id: 'ledger.frictionHeat' },
        { explain: T('Q = μmg · Δs（Δs 为相对滑动距离）。', 'Q = μmg · Δs (Δs: the relative sliding distance).', 'Q = μmg · Δs (Δs: relative Gleitstrecke).') })
    ]
  },
  {
    id: 'n-wedge', chapter: 'newton', template: 'movable-wedge', params: { M: 3, m: 1, theta: 30 }, vary: { M: [2, 5, 0.5], theta: [20, 45, 1] },
    title: T('光滑地面上的可动斜面', 'A movable wedge on smooth ground', 'Ein beweglicher Keil auf glattem Boden'),
    stem: withG(T('质量 M = {M} kg、倾角 θ = {theta}° 的斜面放在光滑水平地面上，质量 m = {m} kg 的物块从光滑斜面上由静止下滑。', 'A wedge of M = {M} kg with angle θ = {theta}° stands on smooth level ground. A block of m = {m} kg slides down its smooth face from rest.', 'Ein Keil (M = {M} kg, θ = {theta}°) steht auf glattem Boden. Ein Klotz (m = {m} kg) gleitet aus der Ruhe seine glatte Fläche hinab.')),
    questions: [
      num('A', T('斜面的加速度大小是多少？', 'What is the acceleration of the wedge?', 'Wie groß ist die Beschleunigung des Keils?'), formula('wedge', 'wd.A'),
        { hint: T('在斜面参考系中分析物块，或用水平动量守恒。', 'Analyse the block in the frame of the wedge, or use conservation of horizontal momentum.', 'Untersuche den Klotz im Bezugssystem des Keils oder nutze die Erhaltung des waagerechten Impulses.') }),
      num('N', T('斜面对物块的支持力是多少？', 'What is the normal force of the wedge on the block?', 'Wie groß ist die Normalkraft des Keils auf den Klotz?'), formula('wedge', 'wd.N'),
        { explain: T('N = Mmg cosθ/(M + m sin²θ)。', 'N = Mmg cosθ/(M + m sin²θ).', 'N = Mmg cosθ/(M + m sin²θ).') })
    ]
  },
  {
    id: 'n-drag', chapter: 'newton', template: 'drag-fall', params: { m: 0.5, b: 0.8, c: 0, h: 100 }, vary: { m: [0.2, 0.6, 0.1], b: [0.9, 1.5, 0.1] }, duration: 6,
    title: T('有空气阻力的下落', 'Falling with air resistance', 'Fallen mit Luftwiderstand'),
    stem: withG(T('质量 {m} kg 的小球从高处由静止下落，所受空气阻力与速度成正比：f = bv，b = {b} N·s/m。', 'A {m} kg ball falls from rest; the air resistance is proportional to its speed: f = bv with b = {b} N·s/m.', 'Eine Kugel der Masse {m} kg fällt aus der Ruhe; der Luftwiderstand ist proportional zur Geschwindigkeit: f = bv mit b = {b} N·s/m.')),
    questions: [
      choice('shape', T('小球速度如何变化？', 'How does its speed change?', 'Wie ändert sich ihre Geschwindigkeit?'), [T('一直匀加速', 'It keeps increasing uniformly', 'Sie nimmt gleichmäßig zu'), T('先加速，逐渐趋于匀速', 'It increases and approaches a constant value', 'Sie nimmt zu und nähert sich einem festen Wert'), T('先加速后减速', 'It first increases, then decreases', 'Sie nimmt zuerst zu, dann ab')],
        { answer: 1, explain: T('阻力随速度增大，合力逐渐减小到零。', 'The drag grows with the speed, so the net force falls towards zero.', 'Der Widerstand wächst mit der Geschwindigkeit, die resultierende Kraft geht gegen null.') }),
      num('vt', T('小球的最大速度（终端速度）约为多少？', 'What is its largest (terminal) speed, approximately?', 'Wie groß ist ungefähr ihre Höchstgeschwindigkeit (Endgeschwindigkeit)?'), { kind: 'extreme', id: 'ball.v', which: 'max' },
        { hint: T('终端速度时 mg = bv。', 'At terminal speed mg = bv.', 'Bei Endgeschwindigkeit gilt mg = bv.'), explain: T('vₜ = mg/b。', 'vₜ = mg/b.', 'vₜ = mg/b.') })
    ]
  },

  // ---- Projectile motion ----
  {
    id: 'p-oblique', chapter: 'projectile', template: 'projectile', params: { v0: 10, alpha: 45, h: 0, m: 0.1 }, vary: { v0: [6, 15, 1], alpha: [20, 70, 5] },
    title: T('斜抛运动', 'Oblique projectile', 'Schräger Wurf'),
    stem: withG(T('小球从水平地面以 v₀ = {v0} m/s 的速度、与水平成 α = {alpha}° 斜向上抛出，不计空气阻力。', 'A ball is thrown from level ground at v₀ = {v0} m/s, α = {alpha}° above the horizontal. Air resistance is negligible.', 'Eine Kugel wird vom ebenen Boden mit v₀ = {v0} m/s unter α = {alpha}° schräg nach oben geworfen. Kein Luftwiderstand.')),
    questions: [
      num('T', T('小球在空中运动的时间是多少？', 'How long is the ball in the air?', 'Wie lange ist die Kugel in der Luft?'), formula('projectile', 'pr.T'),
        { explain: T('T = 2v₀ sinα/g。', 'T = 2v₀ sinα/g.', 'T = 2v₀ sinα/g.') }),
      num('R', T('水平射程是多少？', 'What is the horizontal range?', 'Wie groß ist die Wurfweite?'), formula('projectile', 'pr.R'),
        { explain: T('R = v₀² sin2α/g。', 'R = v₀² sin2α/g.', 'R = v₀² sin2α/g.') }),
      num('vtop', T('小球在最高点的速度大小是多少？', 'What is its speed at the highest point?', 'Wie schnell ist sie im höchsten Punkt?'), formula('projectile', 'pr.vx'),
        { explain: T('最高点只有水平速度 v₀ cosα。', 'At the top only the horizontal velocity v₀ cosα remains.', 'Oben bleibt nur die waagerechte Geschwindigkeit v₀ cosα.') })
    ]
  },
  {
    id: 'p-horizontal', chapter: 'projectile', template: 'projectile', params: { v0: 3, alpha: 0, h: 1.25, m: 0.1 }, vary: { v0: [1, 6, 0.5], h: [0.8, 3.2, 0.2] },
    title: T('平抛运动', 'Horizontal projectile', 'Waagerechter Wurf'),
    stem: withG(T('小球从高 h = {h} m 的平台边缘以 v₀ = {v0} m/s 的速度水平抛出，不计空气阻力。', 'A ball is thrown horizontally at v₀ = {v0} m/s from the edge of a platform h = {h} m high. Air resistance is negligible.', 'Eine Kugel wird von der Kante einer h = {h} m hohen Plattform waagerecht mit v₀ = {v0} m/s geworfen. Kein Luftwiderstand.')),
    questions: [
      num('t', T('小球经过多长时间落地？', 'How long does it take to land?', 'Nach welcher Zeit landet sie?'), { kind: 'event', event: 'impact', body: 'ball' },
        { explain: T('竖直方向自由落体：t = √(2h/g)。', 'Vertically it falls freely: t = √(2h/g).', 'Senkrecht fällt sie frei: t = √(2h/g).') }),
      num('x', T('落地点到抛出点的水平距离是多少？', 'How far from the launch point (horizontally) does it land?', 'In welchem waagerechten Abstand vom Abwurfpunkt landet sie?'), formula('projectile', 'pr.R'),
        { explain: T('x = v₀t。', 'x = v₀t.', 'x = v₀t.') }),
      num('v', T('落地时速度大小是多少？', 'What is its speed when it lands?', 'Wie schnell ist sie beim Aufprall?'), { kind: 'atEvent', id: 'ball.v', event: 'impact', body: 'ball', side: 'before' },
        { explain: T('v = √(v₀² + 2gh)。', 'v = √(v₀² + 2gh).', 'v = √(v₀² + 2gh).') })
    ]
  },
  {
    id: 'p-from-height', chapter: 'projectile', template: 'projectile', params: { v0: 6, alpha: 30, h: 2, m: 0.1 }, vary: { v0: [3, 10, 0.5], h: [1, 4, 0.5] }, duration: 3,
    title: T('从高处斜抛', 'Oblique throw from a height', 'Schräger Wurf aus der Höhe'),
    stem: withG(T('小球从高 h = {h} m 的平台上以 v₀ = {v0} m/s 的速度、与水平成 α = {alpha}° 斜向上抛出，不计空气阻力。', 'A ball is thrown from a platform h = {h} m high at v₀ = {v0} m/s, α = {alpha}° above the horizontal. Air resistance is negligible.', 'Eine Kugel wird von einer h = {h} m hohen Plattform mit v₀ = {v0} m/s unter α = {alpha}° schräg nach oben geworfen. Kein Luftwiderstand.')),
    questions: [
      num('v', T('小球落地时的速度大小是多少？', 'What is its speed when it lands?', 'Wie schnell ist sie beim Aufprall?'), { kind: 'atEvent', id: 'ball.v', event: 'impact', body: 'ball', side: 'before' },
        { hint: T('机械能守恒，与抛射角无关。', 'Use conservation of mechanical energy; the angle does not matter.', 'Energieerhaltung; der Winkel spielt keine Rolle.'), explain: T('½mv² = ½mv₀² + mgh，v = √(v₀² + 2gh)。', '½mv² = ½mv₀² + mgh, so v = √(v₀² + 2gh).', '½mv² = ½mv₀² + mgh, also v = √(v₀² + 2gh).') }),
      num('t', T('小球在空中运动的时间是多少？', 'How long is it in the air?', 'Wie lange ist sie in der Luft?'), { kind: 'event', event: 'impact', body: 'ball' },
        { explain: T('竖直方向：−h = v₀ sinα·t − ½gt²，取正根。', 'Vertically: −h = v₀ sinα·t − ½gt²; take the positive root.', 'Senkrecht: −h = v₀ sinα·t − ½gt²; die positive Lösung.') })
    ]
  },

  // ---- Circular motion ----
  {
    id: 'c-uniform', chapter: 'circular', template: 'uniform-circle', params: { r: 0.5, v: 2, m: 0.2 }, vary: { r: [0.3, 1.2, 0.1], v: [1, 4, 0.5] },
    title: T('匀速圆周运动', 'Uniform circular motion', 'Gleichförmige Kreisbewegung'),
    stem: T('光滑水平桌面上，质量 {m} kg 的小球用长 r = {r} m 的轻绳系在中心的钉子上，以 v = {v} m/s 的速率做匀速圆周运动。', 'On a smooth level table a {m} kg ball is tied by a light rope of length r = {r} m to a nail and moves in a circle at v = {v} m/s.', 'Auf einem glatten Tisch ist eine Kugel ({m} kg) mit einem leichten Seil der Länge r = {r} m an einen Nagel gebunden und bewegt sich mit v = {v} m/s auf einem Kreis.'),
    questions: [
      num('T', T('绳的拉力是多少？', 'What is the tension in the rope?', 'Wie groß ist die Seilkraft?'), formula('circle', 'uc.F'),
        { explain: T('拉力提供向心力：F = mv²/r。', 'The tension provides the centripetal force: F = mv²/r.', 'Die Seilkraft ist die Zentripetalkraft: F = mv²/r.') }),
      num('P', T('小球运动的周期是多少？', 'What is the period of the motion?', 'Wie groß ist die Umlaufdauer?'), formula('circle', 'uc.T'),
        { explain: T('T = 2πr/v。', 'T = 2πr/v.', 'T = 2πr/v.') })
    ]
  },
  {
    id: 'c-rod', chapter: 'circular', template: 'vertical-circle-rod', params: { L: 0.5, v0: 4.5, m: 0.2 }, vary: { v0: [4.6, 6, 0.1] },
    title: T('轻杆模型（竖直面圆周）', 'Ball on a light rod in a vertical circle', 'Kugel an einem leichten Stab im senkrechten Kreis'),
    stem: withG(T('长 L = {L} m 的轻杆一端可绕光滑轴 O 转动，另一端固定质量 {m} kg 的小球。小球在最低点时速度为 v₀ = {v0} m/s，在竖直面内做圆周运动。', 'A light rod of length L = {L} m turns about a smooth axle O and carries a {m} kg ball at its end. At the lowest point the ball moves at v₀ = {v0} m/s in a vertical circle.', 'Ein leichter Stab der Länge L = {L} m dreht sich um eine glatte Achse O und trägt am Ende eine Kugel von {m} kg. Im tiefsten Punkt hat sie v₀ = {v0} m/s und läuft auf einem senkrechten Kreis.')),
    questions: [
      num('v', T('小球在最高点的速率是多少？', 'What is its speed at the top?', 'Wie schnell ist sie im höchsten Punkt?'), formula('vcircle-rod', 'vc.d.vtop'),
        { explain: T('机械能守恒：v² = v₀² − 4gL。', 'Energy conservation: v² = v₀² − 4gL.', 'Energieerhaltung: v² = v₀² − 4gL.') }),
      choice('dir', T('在最高点，杆对小球的作用力是：', 'At the top, the force of the rod on the ball is:', 'Im höchsten Punkt ist die Kraft des Stabes auf die Kugel:'), [T('向上的支持力', 'an upward push', 'ein Druck nach oben'), T('零', 'zero', 'null'), T('向下的拉力', 'a downward pull', 'ein Zug nach unten')],
        { answerFrom: { target: formula('vcircle-rod', 'vc.d.Ftop'), bounds: [-1e-6, 1e-6] }, explain: T('比较 v 与 √(gL)：v > √(gL) 时为拉力，v < √(gL) 时为支持力。', 'Compare v with √(gL): a pull when v > √(gL), a push when v < √(gL).', 'Vergleiche v mit √(gL): Zug für v > √(gL), Druck für v < √(gL).') }),
      num('F', T('最高点杆对小球作用力的大小是多少？', 'What is the magnitude of that force?', 'Wie groß ist diese Kraft?'), { kind: 'formula', situation: 'vcircle-rod', formula: 'vc.d.Ftop' },
        { absTolerance: 1e-3, hint: T('拉力为正时：F + mg = mv²/L。', 'Taking a pull as positive: F + mg = mv²/L.', 'Zug positiv gerechnet: F + mg = mv²/L.'), explain: T('F = mv²/L − mg（负值表示支持力）。请填写带符号的值：拉力为正、支持力为负。', 'F = mv²/L − mg (negative means a push). Enter the signed value: a pull positive, a push negative.', 'F = mv²/L − mg (negativ heißt Druck). Gib den Wert mit Vorzeichen ein: Zug positiv, Druck negativ.') })
    ]
  },
  {
    id: 'c-rope', chapter: 'circular', template: 'vertical-circle-rope', params: { L: 0.5, v0: 4.5, m: 0.2 }, vary: { v0: [3.5, 4.8, 0.1] },
    title: T('轻绳模型（竖直面圆周）', 'Ball on a string in a vertical circle', 'Kugel am Faden im senkrechten Kreis'),
    stem: withG(T('长 L = {L} m 的轻绳一端固定在 O 点，另一端系质量 {m} kg 的小球。小球在最低点获得 v₀ = {v0} m/s 的水平速度。', 'A light string of length L = {L} m is fixed at O and carries a {m} kg ball. At the lowest point the ball is given a horizontal speed v₀ = {v0} m/s.', 'Ein leichter Faden der Länge L = {L} m ist in O befestigt und trägt eine Kugel von {m} kg. Im tiefsten Punkt erhält sie die waagerechte Geschwindigkeit v₀ = {v0} m/s.')),
    questions: [
      num('T0', T('小球刚开始运动时绳的拉力是多少？', 'What is the tension just as the ball starts moving?', 'Wie groß ist die Fadenkraft zu Beginn der Bewegung?'), formula('vcircle-rope', 'vc.r.T0'),
        { explain: T('T − mg = mv₀²/L。', 'T − mg = mv₀²/L.', 'T − mg = mv₀²/L.') }),
      choice('full', T('小球能否在竖直面内做完整的圆周运动？', 'Can the ball complete the vertical circle?', 'Kann die Kugel den senkrechten Kreis vollständig durchlaufen?'), [T('不能，绳会在上半周松弛', 'No, the string goes slack in the upper half', 'Nein, der Faden wird in der oberen Hälfte schlaff'), T('能', 'Yes', 'Ja')],
        { answerFrom: { target: { kind: 'extreme', id: 'rope.T', which: 'min' }, bounds: [1e-9] }, explain: T('恰能通过最高点需 v₀ ≥ √(5gL)。', 'Reaching the top needs v₀ ≥ √(5gL).', 'Um den höchsten Punkt zu erreichen, braucht es v₀ ≥ √(5gL).') }),
      num('vS', T('绳刚松弛时小球的速率是多少？', 'What is the speed of the ball when the string goes slack?', 'Wie schnell ist die Kugel, wenn der Faden schlaff wird?'), formula('vcircle-rope', 'vc.r.vS'),
        { hint: T('松弛时绳拉力为零：重力沿半径的分力提供向心力。', 'When slack the tension is zero: the radial component of gravity alone provides the centripetal force.', 'Beim Erschlaffen ist die Fadenkraft null: nur die radiale Komponente der Gewichtskraft wirkt zentripetal.') })
    ]
  },

  // ---- Gravitation ----
  {
    id: 'g-circle', chapter: 'gravitation', template: 'orbit', params: { M: 1000, r0: 5, k: 1, m: 1 }, vary: { M: [500, 2000, 100], r0: [3, 10, 1] },
    title: T('圆轨道上的行星', 'A planet on a circular orbit', 'Ein Planet auf einer Kreisbahn'),
    stem: T('（教学单位制，G = 1。）质量 M = {M} 的恒星固定不动，行星在距恒星 r = {r0} m 处做匀速圆周运动。', '(Teaching units, G = 1.) A star of mass M = {M} is fixed; a planet moves on a circular orbit of radius r = {r0} m.', '(Lehreinheiten, G = 1.) Ein Stern der Masse M = {M} ist fest; ein Planet läuft auf einer Kreisbahn mit r = {r0} m.'),
    questions: [
      num('v', T('行星的环绕速度是多少？', 'What is the orbital speed of the planet?', 'Wie groß ist die Bahngeschwindigkeit des Planeten?'), formula('orbit', 'or.v'),
        { explain: T('GMm/r² = mv²/r，v = √(GM/r)。', 'GMm/r² = mv²/r, so v = √(GM/r).', 'GMm/r² = mv²/r, also v = √(GM/r).') }),
      num('T', T('行星的公转周期是多少？', 'What is its orbital period?', 'Wie groß ist die Umlaufdauer?'), formula('orbit', 'or.T'),
        { explain: T('T = 2π√(r³/GM)。', 'T = 2π√(r³/GM).', 'T = 2π√(r³/GM).') })
    ]
  },
  {
    id: 'g-ellipse', chapter: 'gravitation', template: 'orbit', params: { M: 1000, r0: 5, k: 1.2, m: 1 }, vary: { k: [1.1, 1.3, 0.05] },
    title: T('椭圆轨道', 'An elliptical orbit', 'Eine Ellipsenbahn'),
    stem: T('（教学单位制，G = 1。）质量 M = {M} 的恒星固定不动。行星在距恒星 r₀ = {r0} m 处以垂直于连线的速度 v₀ = {k}·√(GM/r₀) 出发。', '(Teaching units, G = 1.) A star of mass M = {M} is fixed. A planet starts r₀ = {r0} m from it with a velocity perpendicular to the line joining them, v₀ = {k}·√(GM/r₀).', '(Lehreinheiten, G = 1.) Ein Stern der Masse M = {M} ist fest. Ein Planet startet r₀ = {r0} m entfernt senkrecht zur Verbindungslinie mit v₀ = {k}·√(GM/r₀).'),
    questions: [
      num('vmin', T('行星在远日点的速率是多少？', 'What is its speed at the farthest point?', 'Wie schnell ist er im sonnenfernsten Punkt?'), { kind: 'extreme', id: 'planet.v', which: 'min' },
        { hint: T('开普勒第二定律 v₁r₁ = v₂r₂ 与机械能守恒联立。', 'Combine Kepler’s second law v₁r₁ = v₂r₂ with energy conservation.', 'Verbinde das zweite Keplersche Gesetz v₁r₁ = v₂r₂ mit der Energieerhaltung.') }),
      num('E', T('行星的轨道机械能（取无穷远处势能为零）是多少？', 'What is the mechanical energy of the orbit (zero potential energy at infinity)?', 'Wie groß ist die mechanische Energie der Bahn (potentielle Energie im Unendlichen null)?'), formula('orbit', 'or.E'),
        { explain: T('E = ½mv₀² − GMm/r₀。', 'E = ½mv₀² − GMm/r₀.', 'E = ½mv₀² − GMm/r₀.') })
    ]
  },

  // ---- Mechanical energy ----
  {
    id: 'e-pendulum', chapter: 'energy', template: 'pendulum', params: { L: 1, theta0: 30, m: 0.5 }, vary: { L: [0.5, 2, 0.1], theta0: [20, 60, 5] },
    title: T('单摆的最低点', 'A pendulum at its lowest point', 'Pendel im tiefsten Punkt'),
    stem: withG(T('长 L = {L} m 的轻绳一端固定，另一端系质量 {m} kg 的小球，把小球拉到绳与竖直方向成 θ₀ = {theta0}° 处由静止释放。', 'A {m} kg ball hangs from a light string of length L = {L} m. It is pulled aside until the string makes θ₀ = {theta0}° with the vertical and released from rest.', 'Eine Kugel ({m} kg) hängt an einem leichten Faden der Länge L = {L} m. Sie wird ausgelenkt, bis der Faden θ₀ = {theta0}° mit der Senkrechten bildet, und losgelassen.')),
    questions: [
      num('v', T('小球摆到最低点时的速率是多少？', 'What is its speed at the lowest point?', 'Wie schnell ist sie im tiefsten Punkt?'), formula('pendulum', 'pe.v'),
        { explain: T('mgL(1 − cosθ₀) = ½mv²。', 'mgL(1 − cosθ₀) = ½mv².', 'mgL(1 − cosθ₀) = ½mv².') }),
      num('T', T('小球在最低点时绳的拉力是多少？', 'What is the tension at the lowest point?', 'Wie groß ist die Fadenkraft im tiefsten Punkt?'), formula('pendulum', 'pe.F'),
        { explain: T('T − mg = mv²/L，T = mg(3 − 2cosθ₀)。', 'T − mg = mv²/L, so T = mg(3 − 2cosθ₀).', 'T − mg = mv²/L, also T = mg(3 − 2cosθ₀).') })
    ]
  },
  {
    id: 'e-work', chapter: 'energy', template: 'pull-force', params: { F: 10, alpha: 37, m: 2, mu: 0.2 }, vary: { F: [8, 15, 1] }, duration: 2.5,
    title: T('斜向上拉力做功', 'Work done by an oblique pull', 'Arbeit einer schrägen Zugkraft'),
    stem: withG(T('质量 {m} kg 的物块静止在水平地面上，与地面间的动摩擦因数 μ = {mu}。用与水平成 α = {alpha}° 斜向上的恒力 F = {F} N 拉物块。', 'A {m} kg block rests on level ground, coefficient of kinetic friction μ = {mu}. It is pulled by a constant force F = {F} N at α = {alpha}° above the horizontal.', 'Ein Klotz ({m} kg) liegt auf ebenem Boden, Gleitreibungszahl μ = {mu}. Er wird mit der konstanten Kraft F = {F} N unter α = {alpha}° schräg nach oben gezogen.')),
    questions: [
      num('W', T('前 2 s 内拉力做的功是多少？', 'How much work does the pull do in the first 2 s?', 'Welche Arbeit verrichtet die Zugkraft in den ersten 2 s?'), { kind: 'quantity', id: 'ledger.appliedWork', t: 2 },
        { hint: T('先求加速度（注意支持力 N = mg − F sinα），再求位移。', 'First find the acceleration (note N = mg − F sinα), then the displacement.', 'Bestimme zuerst die Beschleunigung (beachte N = mg − F sinα), dann den Weg.'), explain: T('W = F cosα · s，s = ½at²。', 'W = F cosα · s with s = ½at².', 'W = F cosα · s mit s = ½at².') }),
      num('P', T('1 s 末拉力的功率是多少？', 'What is the power of the pull at t = 1 s?', 'Wie groß ist die Leistung der Zugkraft bei t = 1 s?'), { kind: 'quantity', id: 'pull.P', t: 1 },
        { explain: T('P = F cosα · v。', 'P = F cosα · v.', 'P = F cosα · v.') }),
      num('Q', T('前 2 s 内摩擦产生的热量是多少？', 'How much heat does friction produce in the first 2 s?', 'Wie viel Reibungswärme entsteht in den ersten 2 s?'), { kind: 'quantity', id: 'ledger.frictionHeat', t: 2 },
        { explain: T('Q = μ(mg − F sinα) · s。', 'Q = μ(mg − F sinα) · s.', 'Q = μ(mg − F sinα) · s.') })
    ]
  },
  {
    id: 'e-rod', chapter: 'energy', template: 'hinged-rod', params: { L: 1, m: 1 }, vary: { L: [0.5, 2, 0.1], m: [0.5, 3, 0.5] },
    title: T('从水平释放的细杆', 'A rod released from horizontal', 'Ein aus der Waagerechten losgelassener Stab'),
    stem: withG(T('长 L = {L} m、质量 {m} kg 的匀质细杆一端用光滑铰链固定，从水平位置由静止释放。（细杆对端点的转动惯量 I = mL²/3）', 'A uniform rod (L = {L} m, {m} kg) is hinged at one end without friction and released from rest in a horizontal position. (Moment of inertia about the end: I = mL²/3.)', 'Ein homogener Stab (L = {L} m, {m} kg) ist an einem Ende reibungsfrei gelagert und wird aus der Waagerechten losgelassen. (Trägheitsmoment um das Ende: I = mL²/3.)')),
    questions: [
      num('w', T('细杆转到竖直位置时的角速度是多少？', 'What is its angular velocity when it is vertical?', 'Wie groß ist seine Winkelgeschwindigkeit in der Senkrechten?'), formula('rotation', 'ro.omega'),
        { explain: T('mg·L/2 = ½Iω²，ω = √(3g/L)。', 'mg·L/2 = ½Iω², so ω = √(3g/L).', 'mg·L/2 = ½Iω², also ω = √(3g/L).') }),
      num('F', T('此时铰链对细杆的作用力是多少？', 'What force does the hinge exert on the rod at that moment?', 'Welche Kraft übt das Gelenk in diesem Moment auf den Stab aus?'), formula('rotation', 'ro.F'),
        { explain: T('质心做圆周运动：F − mg = mω²·L/2，F = 2.5mg。', 'The centre of mass moves on a circle: F − mg = mω²·L/2, so F = 2.5mg.', 'Der Schwerpunkt läuft auf einem Kreis: F − mg = mω²·L/2, also F = 2,5mg.') })
    ]
  },

  // ---- Momentum ----
  {
    id: 'm-elastic', chapter: 'momentum', template: 'collision-1d', params: { m1: 1, m2: 2, v0: 2, e: 1 }, vary: { m2: [0.5, 3, 0.5], v0: [1, 4, 0.5] },
    title: T('弹性正碰', 'Elastic head-on collision', 'Elastischer gerader Stoß'),
    stem: T('光滑水平面上，质量 m₁ = {m1} kg 的小球 A 以 v₀ = {v0} m/s 的速度与静止的质量 m₂ = {m2} kg 的小球 B 发生弹性正碰。', 'On a smooth level surface ball A (m₁ = {m1} kg) moving at v₀ = {v0} m/s hits ball B (m₂ = {m2} kg) at rest head-on; the collision is elastic.', 'Auf glatter Ebene stößt Kugel A (m₁ = {m1} kg, v₀ = {v0} m/s) elastisch und gerade auf die ruhende Kugel B (m₂ = {m2} kg).'),
    questions: [
      num('v1', T('碰后 A 的速度是多少？（以 v₀ 方向为正）', 'What is the velocity of A after the collision? (v₀ direction positive)', 'Welche Geschwindigkeit hat A nach dem Stoß? (Richtung von v₀ positiv)'), formula('collision', 'col.el.v1'),
        { absTolerance: 1e-3, explain: T('v₁ = (m₁ − m₂)v₀/(m₁ + m₂)。', 'v₁ = (m₁ − m₂)v₀/(m₁ + m₂).', 'v₁ = (m₁ − m₂)v₀/(m₁ + m₂).') }),
      num('v2', T('碰后 B 的速度是多少？', 'What is the velocity of B after the collision?', 'Welche Geschwindigkeit hat B nach dem Stoß?'), formula('collision', 'col.el.v2'),
        { explain: T('v₂ = 2m₁v₀/(m₁ + m₂)。', 'v₂ = 2m₁v₀/(m₁ + m₂).', 'v₂ = 2m₁v₀/(m₁ + m₂).') }),
      choice('dir', T('碰后 A 的运动情况是：', 'After the collision A', 'Nach dem Stoß'), [T('反弹（向后运动）', 'bounces back', 'prallt A zurück'), T('静止', 'stops', 'bleibt A stehen'), T('继续向前运动', 'keeps moving forward', 'läuft A weiter vorwärts')],
        { answerFrom: { target: { kind: 'atEvent', id: 'A.vx', event: 'impact', side: 'after' }, bounds: [-1e-6, 1e-6] }, explain: T('m₁ < m₂ 时反弹，m₁ = m₂ 时交换速度，m₁ > m₂ 时继续向前。', 'A bounces back if m₁ < m₂, stops if m₁ = m₂ (velocities swap), keeps moving if m₁ > m₂.', 'A prallt für m₁ < m₂ zurück, bleibt für m₁ = m₂ stehen (Geschwindigkeiten tauschen), läuft für m₁ > m₂ weiter.') })
    ]
  },
  {
    id: 'm-inelastic', chapter: 'momentum', template: 'collision-1d', params: { m1: 1, m2: 2, v0: 3, e: 0 }, vary: { m1: [0.5, 3, 0.5], m2: [0.5, 3, 0.5], v0: [1, 5, 0.5] },
    title: T('完全非弹性碰撞', 'Perfectly inelastic collision', 'Vollkommen unelastischer Stoß'),
    stem: T('光滑水平面上，质量 m₁ = {m1} kg 的小球 A 以 v₀ = {v0} m/s 的速度与静止的质量 m₂ = {m2} kg 的小球 B 相碰，碰后两球粘在一起运动。', 'On a smooth level surface ball A (m₁ = {m1} kg) moving at v₀ = {v0} m/s hits ball B (m₂ = {m2} kg) at rest; they stick together.', 'Auf glatter Ebene stößt Kugel A (m₁ = {m1} kg, v₀ = {v0} m/s) auf die ruhende Kugel B (m₂ = {m2} kg); beide bleiben aneinander haften.'),
    questions: [
      num('v', T('碰后两球的共同速度是多少？', 'What is their common velocity after the collision?', 'Wie groß ist ihre gemeinsame Geschwindigkeit nach dem Stoß?'), formula('collision', 'col.in.v'),
        { explain: T('动量守恒：m₁v₀ = (m₁ + m₂)v。', 'Momentum conservation: m₁v₀ = (m₁ + m₂)v.', 'Impulserhaltung: m₁v₀ = (m₁ + m₂)v.') }),
      num('dE', T('碰撞中损失的动能是多少？', 'How much kinetic energy is lost?', 'Wie viel kinetische Energie geht verloren?'), formula('collision', 'col.in.dE'),
        { explain: T('ΔE = ½m₁v₀² − ½(m₁ + m₂)v²。', 'ΔE = ½m₁v₀² − ½(m₁ + m₂)v².', 'ΔE = ½m₁v₀² − ½(m₁ + m₂)v².') })
    ]
  },
  {
    id: 'm-spring', chapter: 'momentum', template: 'spring-blocks', params: { m1: 1, m2: 2, k: 50, v0: 2 }, vary: { m2: [1, 4, 0.5], v0: [1, 4, 0.5] },
    title: T('弹簧连接的两物块', 'Two blocks joined by a spring', 'Zwei durch eine Feder verbundene Klötze'),
    stem: T('光滑水平面上，质量 m₁ = {m1} kg 与 m₂ = {m2} kg 的两物块用劲度系数 k = {k} N/m 的轻弹簧相连，弹簧处于原长。物块 1 获得 v₀ = {v0} m/s 指向物块 2 的速度。', 'On a smooth level surface two blocks m₁ = {m1} kg and m₂ = {m2} kg are joined by a light spring (k = {k} N/m) at its natural length. Block 1 is given v₀ = {v0} m/s towards block 2.', 'Auf glatter Ebene sind zwei Klötze m₁ = {m1} kg und m₂ = {m2} kg durch eine entspannte leichte Feder (k = {k} N/m) verbunden. Klotz 1 erhält v₀ = {v0} m/s in Richtung Klotz 2.'),
    questions: [
      num('v', T('弹簧压缩量最大时两物块的速度是多少？', 'What is the velocity of the blocks when the spring is most compressed?', 'Welche Geschwindigkeit haben die Klötze bei größter Stauchung?'), formula('spring-pair', 'sb.vc'),
        { hint: T('压缩最大时两物块共速。', 'At maximum compression both move at the same velocity.', 'Bei größter Stauchung sind beide gleich schnell.') }),
      num('Ep', T('弹簧弹性势能的最大值是多少？', 'What is the largest elastic potential energy of the spring?', 'Wie groß ist die größte Spannenergie der Feder?'), formula('spring-pair', 'sb.Ep'),
        { explain: T('Eₚ = ½m₁v₀² − ½(m₁ + m₂)v²。', 'Eₚ = ½m₁v₀² − ½(m₁ + m₂)v².', 'Eₚ = ½m₁v₀² − ½(m₁ + m₂)v².') })
    ]
  },

  // ---- Oscillations ----
  {
    id: 'o-spring', chapter: 'oscillation', template: 'spring', params: { k: 50, m: 0.5, A: 0.1 }, vary: { k: [20, 100, 5], m: [0.2, 2, 0.1] },
    title: T('弹簧振子', 'Spring oscillator', 'Federpendel'),
    stem: T('光滑水平面上，质量 {m} kg 的物块与劲度系数 k = {k} N/m 的轻弹簧相连。把物块拉离平衡位置 A = {A} m 后由静止释放。', 'On a smooth level surface a {m} kg block is attached to a light spring (k = {k} N/m). It is pulled A = {A} m from equilibrium and released from rest.', 'Auf glatter Ebene hängt ein Klotz ({m} kg) an einer leichten Feder (k = {k} N/m). Er wird um A = {A} m aus der Ruhelage gezogen und losgelassen.'),
    questions: [
      num('T', T('振动的周期是多少？', 'What is the period of the oscillation?', 'Wie groß ist die Schwingungsdauer?'), formula('spring', 'sp.T'),
        { explain: T('T = 2π√(m/k)。', 'T = 2π√(m/k).', 'T = 2π√(m/k).') }),
      num('v', T('物块的最大速率是多少？', 'What is the largest speed of the block?', 'Wie groß ist die größte Geschwindigkeit des Klotzes?'), formula('spring', 'sp.vmax'),
        { explain: T('½kA² = ½mv²，v = A√(k/m)。', '½kA² = ½mv², so v = A√(k/m).', '½kA² = ½mv², also v = A√(k/m).') })
    ]
  },
  {
    id: 'o-pendulum', chapter: 'oscillation', template: 'pendulum', params: { L: 1, theta0: 5, m: 0.5 }, vary: { L: [0.25, 2, 0.05] },
    title: T('单摆周期', 'Period of a pendulum', 'Schwingungsdauer eines Pendels'),
    stem: withG(T('摆长 L = {L} m 的单摆，从偏角 θ₀ = {theta0}° 处由静止释放。', 'A simple pendulum of length L = {L} m is released from rest at θ₀ = {theta0}°.', 'Ein Fadenpendel der Länge L = {L} m wird bei θ₀ = {theta0}° aus der Ruhe losgelassen.')),
    questions: [
      num('T', T('单摆的周期是多少？', 'What is the period of the pendulum?', 'Wie groß ist die Schwingungsdauer?'), formula('pendulum', 'pe.T.exact'),
        { hint: T('偏角很小，可用小角度近似。', 'The angle is small: use the small-angle approximation.', 'Der Winkel ist klein: Kleinwinkelnäherung.'), explain: T('T ≈ 2π√(L/g)。', 'T ≈ 2π√(L/g).', 'T ≈ 2π√(L/g).') })
    ]
  },

  // ---- Rotation ----
  {
    id: 'r-rolling', chapter: 'rotation', template: 'rolling', params: { theta: 30, r: 0.15, m: 1, mu: 0.3 }, vary: { theta: [15, 40, 1], m: [0.5, 3, 0.5] },
    title: T('斜面上纯滚动的圆柱', 'A cylinder rolling down an incline', 'Ein Zylinder rollt die schiefe Ebene hinab'),
    stem: withG(T('质量 {m} kg、半径 {r} m 的匀质圆柱从倾角 θ = {theta}° 的斜面上由静止释放，做纯滚动（不打滑）。（圆柱对轴的转动惯量 I = ½mr²）', 'A uniform cylinder ({m} kg, radius {r} m) is released from rest on an incline at θ = {theta}° and rolls without slipping. (I = ½mr² about its axis.)', 'Ein homogener Zylinder ({m} kg, Radius {r} m) wird auf einer schiefen Ebene mit θ = {theta}° losgelassen und rollt ohne zu gleiten. (I = ½mr² um seine Achse.)')),
    questions: [
      num('a', T('圆柱质心的加速度是多少？', 'What is the acceleration of its centre?', 'Wie groß ist die Beschleunigung seines Mittelpunkts?'), formula('rolling', 'rl.a'),
        { explain: T('a = g sinθ/(1 + I/mr²) = ⅔g sinθ。', 'a = g sinθ/(1 + I/mr²) = ⅔g sinθ.', 'a = g sinθ/(1 + I/mr²) = ⅔g sinθ.') }),
      num('f', T('斜面对圆柱的静摩擦力是多少？', 'What is the static friction force on the cylinder?', 'Wie groß ist die Haftreibungskraft auf den Zylinder?'), formula('rolling', 'rl.f'),
        { explain: T('f = ⅓mg sinθ。', 'f = ⅓mg sinθ.', 'f = ⅓mg sinθ.') })
    ]
  },
  {
    id: 'r-slip', chapter: 'rotation', template: 'rolling-slip', params: { r: 0.15, m: 1, v0: 3, mu: 0.2 }, vary: { v0: [1, 5, 0.5], mu: [0.1, 0.4, 0.05] }, duration: 3,
    title: T('先打滑后纯滚动', 'Skidding, then rolling', 'Erst Rutschen, dann Rollen'),
    stem: withG(T('质量 {m} kg、半径 {r} m 的匀质圆柱以 v₀ = {v0} m/s 的速度平放到粗糙水平地面上（初始不转动），与地面间的动摩擦因数 μ = {mu}。（I = ½mr²）', 'A uniform cylinder ({m} kg, radius {r} m) is set down on rough level ground moving at v₀ = {v0} m/s without spinning; the coefficient of kinetic friction is μ = {mu}. (I = ½mr².)', 'Ein homogener Zylinder ({m} kg, Radius {r} m) wird mit v₀ = {v0} m/s ohne Drehung auf rauen Boden gesetzt, Gleitreibungszahl μ = {mu}. (I = ½mr².)')),
    questions: [
      num('t', T('经过多长时间圆柱开始纯滚动？', 'After what time does it roll without slipping?', 'Nach welcher Zeit rollt er ohne zu rutschen?'), formula('roll-slip', 'rs.t'),
        { hint: T('摩擦力使质心减速、使圆柱加速转动，直到 v = ωr。', 'Friction slows the centre and spins the cylinder up until v = ωr.', 'Die Reibung bremst den Mittelpunkt und beschleunigt die Drehung, bis v = ωr.'), explain: T('t = v₀/(3μg)。', 't = v₀/(3μg).', 't = v₀/(3μg).') }),
      num('v', T('开始纯滚动时质心的速度是多少？', 'What is the speed of its centre when it starts rolling?', 'Wie schnell ist der Mittelpunkt, wenn das Rollen beginnt?'), formula('roll-slip', 'rs.v'),
        { explain: T('v = ⅔v₀。', 'v = ⅔v₀.', 'v = ⅔v₀.') })
    ]
  }
]

/** Id of each built-in problem (problem ids are stable across versions). */
export function builtinById(id: string): BuiltinProblem | undefined { return BUILTIN_PROBLEMS.find(p => p.id === id) }

/** A built-in problem as a problem, with the given parameters (the problem's own when absent). */
export function builtinProblem(spec: BuiltinProblem, params: Record<string, number> = spec.params): Problem {
  const values = { ...spec.params, ...params }
  // buildTemplate records the template and all its parameter values in scene.extra.template
  const scene = buildTemplate(spec.template, values)
  scene.settings.duration = spec.duration ?? scene.settings.legacyDuration
  return { id: spec.id, title: spec.title, chapter: spec.chapter, stem: spec.stem, scene, questions: spec.questions, builtin: spec.id }
}

/** Random parameters in the problem's `vary` ranges (steps of `step`); `rand` returns numbers in [0, 1). */
export function varyParams(spec: BuiltinProblem, rand: () => number = Math.random): Record<string, number> {
  const out: Record<string, number> = { ...spec.params }
  for (const [k, [lo, hi, step]] of Object.entries(spec.vary)) {
    const n = Math.max(0, Math.round((hi - lo) / step))
    out[k] = Number((lo + Math.floor(rand() * (n + 1)) * step).toPrecision(12))
  }
  return out
}
