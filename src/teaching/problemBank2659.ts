/**
 * 26.59 built-in problems (D171): 51 more problems, so the bank has 81 in fourteen chapters — the ten mechanics
 * chapters of 26.52 and four new ones (electrostatics, magnetism and charged particles, electromagnetic induction,
 * pressure and buoyancy). Same rules as the 26.52 bank: a template with parameters, the stem names the parameters
 * as `{key}`, every answer is read from the simulation, and "another set of numbers" varies the parameters in
 * `vary`. Each problem's first question is checked against an independent analytic value in
 * tests/teaching/problems2659.test.ts. Only magnitudes are asked (speeds, forces, times), never signed components.
 *
 * Pure (no DOM, no Vue).
 */
import type { Tri } from '../i18n/tri'
import type { BuiltinProblem } from './problemBank'
import type { NumericQuestion, ProblemTarget } from './problems'

const T = (zh: string, en: string, de: string): Tri => ({ zh, en, de })
const num = (id: string, prompt: Tri, target: ProblemTarget, more: Partial<NumericQuestion> = {}): NumericQuestion => ({ id, type: 'numeric', prompt, target, ...more })
const q = (id: string, t: number): ProblemTarget => ({ kind: 'quantity', id, t })
const G = T('g 取 {g} m/s²。', 'Take g = {g} m/s².', 'Nimm g = {g} m/s².')
const withG = (t: Tri): Tri => ({ zh: `${t.zh}${G.zh}`, en: `${t.en} ${G.en}`, de: `${t.de} ${G.de}` })
const NOG = T('不计重力。', 'Gravity is negligible.', 'Die Schwerkraft ist vernachlässigbar.')
const noG = (t: Tri): Tri => ({ zh: `${t.zh}${NOG.zh}`, en: `${t.en} ${NOG.en}`, de: `${t.de} ${NOG.de}` })
const UNIT_G1 = T('（教学单位：引力常量 G = 1）', ' (teaching units: G = 1)', ' (Lehreinheiten: G = 1)')
const g1 = (t: Tri): Tri => ({ zh: `${t.zh}${UNIT_G1.zh}`, en: `${t.en}${UNIT_G1.en}`, de: `${t.de}${UNIT_G1.de}` })

export const PROBLEMS_2659: BuiltinProblem[] = [
  // ---- Uniformly accelerated motion ----
  {
    id: 'k-pursuit', chapter: 'kinematics', template: 'pursuit', params: { v: 4, a: 2, d: 6 }, vary: { v: [3, 5, 0.5], a: [1.5, 3, 0.5], d: [4, 8, 1] },
    title: T('追及问题：最大距离', 'Pursuit: the largest gap', 'Verfolgung: der größte Abstand'),
    stem: T('物体 A 以 {v} m/s 匀速运动，此时在它后方 {d} m 处的物体 B 由静止开始以 {a} m/s² 的加速度同向做匀加速运动。', 'Body A moves uniformly at {v} m/s. At that moment body B, {d} m behind it, starts from rest with acceleration {a} m/s² in the same direction.', 'Körper A bewegt sich gleichförmig mit {v} m/s. In diesem Moment startet der {d} m dahinter liegende Körper B aus der Ruhe mit {a} m/s² in dieselbe Richtung.'),
    questions: [
      num('max', T('B 追上 A 之前，两者间的最大距离是多少？', 'What is the largest gap before B catches up with A?', 'Wie groß ist der größte Abstand, bevor B den Körper A einholt?'), { kind: 'extreme', id: 'custom.gap', which: 'max' },
        { hint: T('速度相等时距离最大', 'The gap is largest when the speeds are equal', 'Der Abstand ist am größten, wenn die Geschwindigkeiten gleich sind'), explain: T('v = at 时 Δx 最大：Δx = d + v²/(2a)。', 'Largest when v = at: Δx = d + v²/(2a).', 'Am größten bei v = at: Δx = d + v²/(2a).') }),
      num('gap1', T('开始运动 1 s 时两者相距多远？', 'How far apart are they 1 s after the start?', 'Wie weit sind sie 1 s nach dem Start voneinander entfernt?'), q('custom.gap', 1),
        { explain: T('Δx = d + vt − ½at²。', 'Δx = d + vt − ½at².', 'Δx = d + vt − ½at².') })
    ]
  },
  {
    id: 'k-slope-up', chapter: 'kinematics', template: 'incline-friction', params: { theta: 37, m: 1, muS: 0.3, muK: 0.25, v0: -4 }, vary: { theta: [25, 45, 1], muK: [0.1, 0.25, 0.05] }, duration: 1.5,
    title: T('冲上斜面再滑下', 'Up the incline and back', 'Die schiefe Ebene hinauf und zurück'),
    stem: withG(T('质量 {m} kg 的物块以 4 m/s 的初速度沿倾角 θ = {theta}° 的固定斜面向上滑，物块与斜面间的动摩擦因数 μ = {muK}，最大静摩擦因数 μs = {muS}（斜面足够长）。', 'A {m} kg block is sent up a fixed incline (θ = {theta}°) at 4 m/s; the coefficient of kinetic friction is μ = {muK}, of static friction μs = {muS} (the incline is long enough).', 'Ein Klotz (m = {m} kg) wird mit 4 m/s eine feste schiefe Ebene (θ = {theta}°) hinaufgestoßen; Gleitreibungszahl μ = {muK}, Haftreibungszahl μs = {muS} (die Ebene ist lang genug).')),
    questions: [
      num('t', T('物块经过多长时间速度减为零？', 'After what time does the block come to rest?', 'Nach welcher Zeit kommt der Klotz zur Ruhe?'), { kind: 'event', event: 'reverse', body: 'block' },
        { hint: T('上滑时摩擦力沿斜面向下', 'Going up, friction acts down the incline', 'Beim Hinaufgleiten wirkt die Reibung hangabwärts'), explain: T('a上 = g(sinθ + μcosθ)，t = v₀/a上。', 'a_up = g(sinθ + μcosθ), t = v₀/a_up.', 'a_auf = g(sinθ + μcosθ), t = v₀/a_auf.') }),
      num('v1', T('开始上滑后 1 s 末物块的速度大小是多少？', 'What is its speed 1 s after it was sent up?', 'Wie schnell ist er 1 s nach dem Abstoßen?'), q('block.v', 1),
        { explain: T('速度为零后 tanθ > μs，物块下滑：a下 = g(sinθ − μcosθ)，v = a下(1 s − t)。', 'After stopping, tanθ > μs, so it slides back: a_down = g(sinθ − μcosθ), v = a_down(1 s − t).', 'Nach dem Stillstand ist tanθ > μs, er gleitet zurück: a_ab = g(sinθ − μcosθ), v = a_ab(1 s − t).') })
    ]
  },

  // ---- Forces and equilibrium ----
  {
    id: 'f-two-ropes', chapter: 'forces', template: 'two-ropes', params: { alpha: 30, beta: 60, m: 2 }, vary: { alpha: [20, 50, 5], beta: [30, 60, 5], m: [1, 4, 0.5] },
    title: T('两绳悬挂重物', 'A load hanging from two ropes', 'Eine Last an zwei Seilen'),
    stem: withG(T('质量 {m} kg 的重物用两根轻绳挂在天花板上，绳 1 与竖直方向成 α = {alpha}°，绳 2 与竖直方向成 β = {beta}°，重物静止。', 'A {m} kg load hangs from the ceiling on two light ropes: rope 1 makes α = {alpha}° and rope 2 β = {beta}° with the vertical. The load is at rest.', 'Eine Last (m = {m} kg) hängt an zwei leichten Seilen an der Decke: Seil 1 bildet α = {alpha}°, Seil 2 β = {beta}° mit der Senkrechten. Die Last ruht.')),
    questions: [
      num('T1', T('绳 1 的拉力是多少？', 'What is the tension in rope 1?', 'Wie groß ist die Kraft in Seil 1?'), q('rope1.T', 0.5),
        { hint: T('三力平衡：正弦定理或正交分解', 'Three forces in equilibrium: law of sines or components', 'Drei Kräfte im Gleichgewicht: Sinussatz oder Komponenten'), explain: T('T₁ = mg·sinβ/sin(α + β)。', 'T₁ = mg·sinβ/sin(α + β).', 'T₁ = mg·sinβ/sin(α + β).') }),
      num('T2', T('绳 2 的拉力是多少？', 'What is the tension in rope 2?', 'Wie groß ist die Kraft in Seil 2?'), q('rope2.T', 0.5),
        { explain: T('T₂ = mg·sinα/sin(α + β)。', 'T₂ = mg·sinα/sin(α + β).', 'T₂ = mg·sinα/sin(α + β).') })
    ]
  },
  {
    id: 'f-wheel-axle', chapter: 'forces', template: 'wheel-axle', params: { R: 0.3, r: 0.1, m: 3, M: 1 }, vary: { R: [0.2, 0.5, 0.05], m: [1, 5, 0.5] },
    title: T('轮轴', 'Wheel and axle', 'Wellrad'),
    stem: withG(T('轮半径 R = {R} m、轴半径 r = {r} m 的轮轴可绕光滑轴转动。轴上的绳挂着质量 {m} kg 的重物，在轮缘的绳上竖直向下施力使重物静止。', 'A wheel and axle (wheel radius R = {R} m, axle radius r = {r} m) turns on a smooth axis. A {m} kg load hangs from a rope on the axle; a vertical pull on a rope round the wheel holds it at rest.', 'Ein Wellrad (Radradius R = {R} m, Wellenradius r = {r} m) dreht sich um eine glatte Achse. An einem Seil auf der Welle hängt eine Last von {m} kg; ein senkrechter Zug an einem Seil um das Rad hält sie in Ruhe.')),
    questions: [
      num('F', T('施加在轮缘上的拉力是多少？', 'What pull is needed on the wheel rope?', 'Welche Zugkraft ist am Radseil nötig?'), q('effort.T', 0.5),
        { hint: T('力矩平衡：F·R = G·r', 'Moments: F·R = G·r', 'Momente: F·R = G·r'), explain: T('F = mg·r/R。', 'F = mg·r/R.', 'F = mg·r/R.') })
    ]
  },
  {
    id: 'f-incline-stick', chapter: 'forces', template: 'incline-friction', params: { theta: 20, m: 2, muS: 0.5, muK: 0.4, v0: 0 }, vary: { theta: [10, 24, 1], m: [1, 4, 0.5] }, duration: 1,
    title: T('斜面上的静摩擦力', 'Static friction on an incline', 'Haftreibung auf der schiefen Ebene'),
    stem: withG(T('质量 {m} kg 的物块放在倾角 θ = {theta}° 的固定斜面上，静摩擦因数 μs = {muS}，动摩擦因数 μk = {muK}，物块由静止释放。', 'A {m} kg block is released from rest on a fixed incline at θ = {theta}°; μs = {muS}, μk = {muK}.', 'Ein Klotz (m = {m} kg) wird auf einer festen schiefen Ebene (θ = {theta}°) aus der Ruhe losgelassen; μs = {muS}, μk = {muK}.')),
    questions: [
      num('f', T('物块受到的摩擦力大小是多少？', 'What is the friction force on the block?', 'Wie groß ist die Reibungskraft auf den Klotz?'), q('contact.block|incline.f', 0.5),
        { hint: T('先判断：tanθ 与 μs 比较', 'First compare tanθ with μs', 'Vergleiche zuerst tanθ mit μs'), explain: T('tanθ ≤ μs，物块静止，静摩擦力 f = mg sinθ（不是 μN）。', 'tanθ ≤ μs, the block stays put and f = mg sinθ (not μN).', 'tanθ ≤ μs, der Klotz bleibt liegen, f = mg sinθ (nicht μN).') }),
      num('N', T('斜面对物块的支持力是多少？', 'What is the normal force on the block?', 'Wie groß ist die Normalkraft auf den Klotz?'), q('contact.block|incline.N', 0.5),
        { explain: T('N = mg cosθ。', 'N = mg cosθ.', 'N = mg cosθ.') })
    ]
  },

  // ---- Newton's laws ----
  {
    id: 'n-incline-pulley', chapter: 'newton', template: 'incline-pulley', params: { theta: 30, m1: 1, m2: 1, mu: 0.1 }, vary: { theta: [20, 35, 1], m2: [1, 2, 0.1], mu: [0, 0.2, 0.05] },
    title: T('斜面上的连接体', 'Connected bodies on an incline', 'Verbundene Körper an der schiefen Ebene'),
    stem: withG(T('倾角 θ = {theta}° 的固定斜面上有质量 m₁ = {m1} kg 的物块，它用轻绳跨过斜面顶端的光滑定滑轮与悬挂的物块 m₂ = {m2} kg 相连，m₁ 与斜面间的动摩擦因数 μ = {mu}，由静止释放。', 'A block m₁ = {m1} kg on a fixed incline (θ = {theta}°) is tied over a smooth pulley at the top to a hanging block m₂ = {m2} kg; μ between m₁ and the incline is {mu}. They start from rest.', 'Ein Klotz m₁ = {m1} kg auf einer festen schiefen Ebene (θ = {theta}°) ist über eine glatte Rolle an der Spitze mit einem hängenden Klotz m₂ = {m2} kg verbunden; μ = {mu}. Start aus der Ruhe.')),
    questions: [
      num('a', T('两物块加速度的大小是多少？', 'What is the magnitude of their acceleration?', 'Wie groß ist ihre Beschleunigung?'), q('m2.a', 0.3),
        { hint: T('整体法：m₂g − m₁g sinθ − μm₁g cosθ = (m₁ + m₂)a', 'As one system: m₂g − m₁g sinθ − μm₁g cosθ = (m₁ + m₂)a', 'Als System: m₂g − m₁g sinθ − μm₁g cosθ = (m₁ + m₂)a'), explain: T('a = g(m₂ − m₁sinθ − μm₁cosθ)/(m₁ + m₂)。', 'a = g(m₂ − m₁sinθ − μm₁cosθ)/(m₁ + m₂).', 'a = g(m₂ − m₁sinθ − μm₁cosθ)/(m₁ + m₂).') }),
      num('T', T('绳的拉力是多少？', 'What is the rope tension?', 'Wie groß ist die Seilkraft?'), q('rope.T', 0.3),
        { explain: T('隔离 m₂：T = m₂(g − a)。', 'Isolate m₂: T = m₂(g − a).', 'm₂ freigeschnitten: T = m₂(g − a).') })
    ]
  },
  {
    id: 'n-movable-pulley', chapter: 'newton', template: 'movable-pulley', params: { m1: 1, m2: 1.5 }, vary: { m1: [0.5, 1.5, 0.1], m2: [1, 3, 0.1] }, duration: 0.6,
    title: T('动滑轮连接体', 'A movable pulley', 'Eine lose Rolle'),
    stem: withG(T('如图，物块 m₁ = {m1} kg 挂在绳的一端，绳绕过定滑轮与动滑轮，动滑轮下挂物块 m₂ = {m2} kg，滑轮与绳的质量和摩擦不计，由静止释放。', 'Block m₁ = {m1} kg hangs on one end of a rope that runs over a fixed pulley and under a movable pulley carrying block m₂ = {m2} kg. Pulleys and rope are light and smooth; they start from rest.', 'Klotz m₁ = {m1} kg hängt an einem Seilende; das Seil läuft über eine feste und unter einer losen Rolle, an der Klotz m₂ = {m2} kg hängt. Rollen und Seil sind leicht und glatt; Start aus der Ruhe.')),
    questions: [
      num('a1', T('m₁ 的加速度大小是多少？', 'What is the acceleration of m₁?', 'Wie groß ist die Beschleunigung von m₁?'), q('m1.a', 0.3),
        { hint: T('约束：a₁ = 2a₂；动滑轮两侧拉力都是 T', 'Constraint a₁ = 2a₂; the movable pulley is held by 2T', 'Zwangsbedingung a₁ = 2a₂; die lose Rolle hängt an 2T'), explain: T('m₁g − T = m₁a₁，2T − m₂g = m₂a₂，a₁ = 2a₂。', 'm₁g − T = m₁a₁, 2T − m₂g = m₂a₂, a₁ = 2a₂.', 'm₁g − T = m₁a₁, 2T − m₂g = m₂a₂, a₁ = 2a₂.') }),
      num('T', T('绳的拉力是多少？', 'What is the rope tension?', 'Wie groß ist die Seilkraft?'), q('rope.T', 0.3),
        { explain: T('T = 3m₁m₂g/(4m₁ + m₂)。', 'T = 3m₁m₂g/(4m₁ + m₂).', 'T = 3m₁m₂g/(4m₁ + m₂).') })
    ]
  },
  {
    id: 'n-elevator', chapter: 'newton', template: 'elevator', params: { F: 80, M: 5, m: 1, k: 400, c: 12 }, vary: { F: [65, 100, 5], m: [0.5, 2, 0.5] }, duration: 3,
    title: T('超重：电梯中的弹簧秤', 'Apparent weight in a lift', 'Scheinbares Gewicht im Aufzug'),
    stem: withG(T('电梯厢（质量 {M} kg）在竖直向上的恒定拉力 F = {F} N 作用下由静止加速上升，厢顶用弹簧秤挂着质量 {m} kg 的物体。弹簧的振动很快衰减，物体随电梯一起加速。', 'A lift cabin ({M} kg) is pulled up from rest by a constant force F = {F} N. A {m} kg object hangs from a spring balance on the cabin roof; the spring\'s oscillation dies out quickly and the object accelerates with the cabin.', 'Eine Aufzugskabine ({M} kg) wird von einer konstanten Kraft F = {F} N aus der Ruhe nach oben gezogen. An einer Federwaage an der Decke hängt ein Körper von {m} kg; die Schwingung klingt schnell ab, der Körper beschleunigt mit der Kabine.')),
    questions: [
      num('F', T('稳定后弹簧秤的示数是多少？', 'What does the balance read once steady?', 'Was zeigt die Waage nach dem Einschwingen an?'), { kind: 'end', id: 'scale.F' },
        { hint: T('先求整体加速度 a = F/(M + m) − g', 'Whole system first: a = F/(M + m) − g', 'Zuerst das System: a = F/(M + m) − g'), explain: T('F示 = m(g + a) = mF/(M + m) > mg：超重。', 'Reading = m(g + a) = mF/(M + m) > mg: apparent weight gain.', 'Anzeige = m(g + a) = mF/(M + m) > mg: scheinbar schwerer.') })
    ]
  },
  {
    id: 'n-conveyor-incline', chapter: 'newton', template: 'conveyor-incline', params: { theta: 37, u: 2, m: 1, mu: 0.5 }, vary: { theta: [30, 40, 1], u: [1.5, 3, 0.5], mu: [0.3, 0.5, 0.05] }, duration: 1.5,
    title: T('倾斜传送带', 'An inclined conveyor belt', 'Ein schräges Förderband'),
    stem: withG(T('倾角 θ = {theta}° 的传送带以 u = {u} m/s 的速度向下运行，把质量 {m} kg 的物块轻放在传送带顶端，物块与带间的动摩擦因数 μ = {mu}（传送带足够长）。', 'A belt inclined at θ = {theta}° runs downwards at u = {u} m/s. A {m} kg block is placed gently at its top; μ = {mu} (the belt is long enough).', 'Ein unter θ = {theta}° geneigtes Band läuft mit u = {u} m/s abwärts. Ein Klotz (m = {m} kg) wird oben sanft aufgesetzt; μ = {mu} (das Band ist lang genug).')),
    questions: [
      num('t', T('经过多长时间物块与传送带速度相同？', 'After what time does the block reach the belt speed?', 'Nach welcher Zeit erreicht der Klotz die Bandgeschwindigkeit?'), { kind: 'event', event: 'reverse', body: 'block' },
        { hint: T('开始时物块比带慢，摩擦力沿斜面向下', 'At first the block is slower than the belt: friction acts down the slope', 'Zuerst ist der Klotz langsamer als das Band: Reibung wirkt hangabwärts'), explain: T('a₁ = g(sinθ + μcosθ)，t = u/a₁。', 'a₁ = g(sinθ + μcosθ), t = u/a₁.', 'a₁ = g(sinθ + μcosθ), t = u/a₁.') }),
      num('v', T('放上后 1 s 末物块的速度大小是多少？', 'What is its speed 1 s after it was placed?', 'Wie schnell ist er 1 s nach dem Aufsetzen?'), q('block.v', 1),
        { explain: T('共速后 tanθ > μ，物块继续加速：a₂ = g(sinθ − μcosθ)，摩擦力改为沿斜面向上。', 'After that tanθ > μ, so it keeps accelerating: a₂ = g(sinθ − μcosθ), friction now acts up the slope.', 'Danach ist tanθ > μ, er beschleunigt weiter: a₂ = g(sinθ − μcosθ), die Reibung wirkt nun hangaufwärts.') })
    ]
  },
  {
    id: 'n-variable-force', chapter: 'newton', template: 'variable-force', params: { F0: 5, omega: 3, m: 1 }, vary: { F0: [2, 8, 1], m: [0.5, 2, 0.5] },
    title: T('正弦变力作用下的物块', 'A block under a sinusoidal force', 'Ein Klotz unter einer sinusförmigen Kraft'),
    stem: T('光滑水平面上质量 {m} kg 的物块由静止开始受水平力 F = F₀ sin ωt 作用，F₀ = {F0} N，ω = {omega} rad/s。', 'A {m} kg block on a smooth level surface starts from rest under the horizontal force F = F₀ sin ωt with F₀ = {F0} N and ω = {omega} rad/s.', 'Ein Klotz (m = {m} kg) auf glatter Ebene startet aus der Ruhe unter der waagerechten Kraft F = F₀ sin ωt mit F₀ = {F0} N und ω = {omega} rad/s.'),
    questions: [
      num('v', T('t = π/ω（力第一次减为零）时物块的速度大小是多少？', 'What is its speed at t = π/ω, when the force first returns to zero?', 'Wie schnell ist er bei t = π/ω, wenn die Kraft erstmals wieder null ist?'), q('block.v', Math.PI / 3),
        { hint: T('动量定理：∫F dt = mv', 'Impulse: ∫F dt = mv', 'Impulssatz: ∫F dt = mv'), explain: T('∫₀^{π/ω} F₀ sin ωt dt = 2F₀/ω，v = 2F₀/(mω)。', '∫₀^{π/ω} F₀ sin ωt dt = 2F₀/ω, so v = 2F₀/(mω).', '∫₀^{π/ω} F₀ sin ωt dt = 2F₀/ω, also v = 2F₀/(mω).') })
    ]
  },
  {
    id: 'n-pull-angle', chapter: 'newton', template: 'pull-force', params: { F: 20, alpha: 37, m: 2, mu: 0.5 }, vary: { F: [12, 24, 1], alpha: [20, 45, 1] }, duration: 1.5,
    title: T('斜向上的拉力', 'Pulling at an angle', 'Schräg nach oben ziehen'),
    stem: withG(T('质量 {m} kg 的物块静止在粗糙水平地面上，μ = {mu}。用与水平方向成 α = {alpha}° 斜向上的拉力 F = {F} N 拉它。', 'A {m} kg block rests on rough level ground (μ = {mu}). It is pulled by F = {F} N directed α = {alpha}° above the horizontal.', 'Ein Klotz (m = {m} kg) ruht auf rauem ebenem Boden (μ = {mu}). Er wird mit F = {F} N unter α = {alpha}° schräg nach oben gezogen.')),
    questions: [
      num('N', T('地面对物块的支持力是多少？', 'What is the normal force from the ground?', 'Wie groß ist die Normalkraft des Bodens?'), q('contact.block|ground.N', 0.5),
        { hint: T('竖直方向：N + F sinα = mg', 'Vertically: N + F sinα = mg', 'Senkrecht: N + F sinα = mg'), explain: T('N = mg − F sinα，摩擦力随之变小。', 'N = mg − F sinα, so friction is smaller too.', 'N = mg − F sinα, die Reibung wird damit kleiner.') }),
      num('a', T('物块的加速度大小是多少？', 'What is its acceleration?', 'Wie groß ist seine Beschleunigung?'), q('block.a', 0.5),
        { explain: T('a = [F cosα − μ(mg − F sinα)]/m。', 'a = [F cosα − μ(mg − F sinα)]/m.', 'a = [F cosα − μ(mg − F sinα)]/m.') })
    ]
  },

  // ---- Projectile motion ----
  {
    id: 'p-top-speed', chapter: 'projectile', template: 'projectile', params: { v0: 12, alpha: 60, h: 0, m: 0.1 }, vary: { v0: [8, 16, 1], alpha: [30, 70, 5] }, duration: 3.5,
    title: T('斜抛：落地速度与飞行时间', 'Oblique throw: landing speed and time of flight', 'Schräger Wurf: Landegeschwindigkeit und Flugzeit'),
    stem: withG(T('在水平地面上以 v₀ = {v0} m/s、仰角 α = {alpha}° 抛出一个小球，不计空气阻力。', 'A ball is thrown from level ground at v₀ = {v0} m/s, α = {alpha}° above the horizontal. Air resistance is negligible.', 'Eine Kugel wird vom ebenen Boden mit v₀ = {v0} m/s unter α = {alpha}° geworfen. Der Luftwiderstand ist vernachlässigbar.')),
    questions: [
      num('vland', T('小球落地时的速度大小是多少？', 'What is its speed when it lands?', 'Wie schnell ist sie bei der Landung?'), { kind: 'atEvent', id: 'ball.v', event: 'impact', body: 'ball', side: 'before' },
        { hint: T('落地点与抛出点等高', 'It lands at the height it was thrown from', 'Sie landet auf der Abwurfhöhe'), explain: T('机械能守恒：落地速度大小等于 v₀（方向与水平成 α 角向下）；最高点速度为 v₀ cosα。', 'Energy conservation: it lands at speed v₀ (α below the horizontal); at the top its speed is v₀ cosα.', 'Energieerhaltung: sie landet mit v₀ (α unter der Waagerechten); im Scheitel ist sie v₀ cosα schnell.') }),
      num('t', T('小球在空中运动的时间是多少？', 'How long is it in the air?', 'Wie lange ist sie in der Luft?'), { kind: 'event', event: 'impact', body: 'ball' },
        { explain: T('t = 2v₀ sinα/g。', 't = 2v₀ sinα/g.', 't = 2v₀ sinα/g.') })
    ]
  },
  {
    id: 'p-throw-down', chapter: 'projectile', template: 'projectile', params: { v0: 5, alpha: -30, h: 10, m: 0.1 }, vary: { v0: [3, 8, 1], h: [6, 15, 1] }, duration: 2.5,
    title: T('从高处斜向下抛出', 'Thrown downwards from a height', 'Schräg nach unten aus der Höhe'),
    stem: withG(T('从 {h} m 高的平台边缘以 v₀ = {v0} m/s 的速度斜向下抛出小球，速度方向与水平方向成 30° 角，不计空气阻力。', 'A ball is thrown from the edge of a platform {h} m high at v₀ = {v0} m/s, 30° below the horizontal. Air resistance is negligible.', 'Eine Kugel wird von der Kante einer {h} m hohen Plattform mit v₀ = {v0} m/s unter 30° nach unten geworfen. Der Luftwiderstand ist vernachlässigbar.')),
    questions: [
      num('v', T('小球落地时的速度大小是多少？', 'What is its speed when it lands?', 'Wie schnell ist sie beim Aufprall?'), { kind: 'atEvent', id: 'ball.v', event: 'impact', body: 'ball', side: 'before' },
        { hint: T('机械能守恒，与抛出方向无关', 'Energy conservation; the direction does not matter', 'Energieerhaltung; die Richtung spielt keine Rolle'), explain: T('v = √(v₀² + 2gh)。', 'v = √(v₀² + 2gh).', 'v = √(v₀² + 2gh).') }),
      num('t', T('小球经过多长时间落地？', 'After what time does it land?', 'Nach welcher Zeit landet sie?'), { kind: 'event', event: 'impact', body: 'ball' },
        { explain: T('竖直方向：h = v₀ sin30° · t + ½gt²。', 'Vertically: h = v₀ sin30° · t + ½gt².', 'Senkrecht: h = v₀ sin30° · t + ½gt².') })
    ]
  },

  // 26.59 fix (D185): a ball thrown horizontally from the top of an incline lands on it
  {
    id: 'p-slope', chapter: 'projectile', template: 'projectile-slope', params: { theta: 30, v0: 15, m: 0.1 }, vary: { theta: [25, 45, 5], v0: [10, 20, 1] }, duration: 3.5,
    title: T('平抛落到斜面上', 'Thrown horizontally onto an incline', 'Waagerecht auf eine schiefe Ebene geworfen'),
    stem: withG(T('从倾角 θ = {theta}° 的斜面顶端 A 点，以 v₀ = {v0} m/s 的速度水平抛出一个小球，小球恰好落在斜面上的 B 点。不计空气阻力。', 'A ball is thrown horizontally at v₀ = {v0} m/s from the top A of an incline (θ = {theta}°) and lands on the incline at B. Air resistance is negligible.', 'Eine Kugel wird vom oberen Punkt A einer schiefen Ebene (θ = {theta}°) mit v₀ = {v0} m/s waagerecht geworfen und landet bei B auf der Ebene. Der Luftwiderstand ist vernachlässigbar.')),
    questions: [
      num('t', T('小球在空中飞行的时间是多少？', 'How long is the ball in the air?', 'Wie lange ist die Kugel in der Luft?'), { kind: 'event', event: 'impact', body: 'ball' },
        { hint: T('落点在斜面上：竖直位移与水平位移之比等于 tanθ', 'It lands on the incline: vertical over horizontal displacement equals tanθ', 'Sie landet auf der Ebene: senkrechte durch waagerechte Verschiebung ist tanθ'), explain: T('½gt² / (v₀t) = tanθ，t = 2v₀tanθ/g。', '½gt² / (v₀t) = tanθ, so t = 2v₀tanθ/g.', '½gt² / (v₀t) = tanθ, also t = 2v₀tanθ/g.') }),
      num('AB', T('A、B 两点间的距离是多少？', 'How far apart are A and B?', 'Wie weit liegen A und B auseinander?'), { kind: 'atEvent', id: 'custom.AB', event: 'impact', side: 'before', body: 'ball' },
        { explain: T('AB = x / cosθ = v₀t / cosθ。', 'AB = x / cosθ = v₀t / cosθ.', 'AB = x / cosθ = v₀t / cosθ.') }),
      num('v', T('小球落到 B 点时的速度大小是多少？', 'How fast is the ball when it lands at B?', 'Wie schnell ist die Kugel bei B?'), { kind: 'atEvent', id: 'ball.v', event: 'impact', side: 'before', body: 'ball' },
        { explain: T('v = √(v₀² + (gt)²) = v₀√(1 + 4tan²θ)。', 'v = √(v₀² + (gt)²) = v₀√(1 + 4tan²θ).', 'v = √(v₀² + (gt)²) = v₀√(1 + 4tan²θ).') })
    ]
  },

  // ---- Mechanical energy ----
  {
    id: 'e-efficiency', chapter: 'energy', template: 'incline-efficiency', params: { theta: 30, m: 2, mu: 0.2, v0: 0.5 }, vary: { theta: [20, 45, 1], mu: [0.1, 0.4, 0.05] },
    title: T('斜面的机械效率', 'Efficiency of an incline', 'Wirkungsgrad der schiefen Ebene'),
    stem: withG(T('用平行于斜面的拉力把质量 {m} kg 的物块沿倾角 θ = {theta}° 的斜面匀速拉上去，物块与斜面间的动摩擦因数 μ = {mu}。', 'A {m} kg block is pulled up an incline (θ = {theta}°) at constant speed by a force parallel to it; μ = {mu}.', 'Ein Klotz (m = {m} kg) wird mit einer Kraft parallel zur Ebene gleichförmig eine schiefe Ebene (θ = {theta}°) hinaufgezogen; μ = {mu}.')),
    questions: [
      num('F', T('拉力的大小是多少？', 'How large is the pull?', 'Wie groß ist die Zugkraft?'), q('pull.F', 0.5),
        { explain: T('匀速：F = mg(sinθ + μcosθ)。', 'Constant speed: F = mg(sinθ + μcosθ).', 'Gleichförmig: F = mg(sinθ + μcosθ).') }),
      num('eta', T('斜面的机械效率是多少？', 'What is the efficiency of the incline?', 'Wie groß ist der Wirkungsgrad der Ebene?'), { kind: 'end', id: 'custom.eta' },
        { explain: T('η = mgh/(Fs) = sinθ/(sinθ + μcosθ)。', 'η = mgh/(Fs) = sinθ/(sinθ + μcosθ).', 'η = mgh/(Fs) = sinθ/(sinθ + μcosθ).') })
    ]
  },
  {
    id: 'e-slider-stop', chapter: 'energy', template: 'slider-stop', params: { theta: 30, L: 1, m: 1, e: 0.5 }, vary: { theta: [20, 50, 5], L: [0.5, 1.5, 0.1], e: [0.3, 0.8, 0.1] },
    title: T('滑块撞上限位', 'A slider hits its stop', 'Ein Gleiter trifft den Anschlag'),
    stem: withG(T('质量 {m} kg 的滑块沿倾角 θ = {theta}° 的光滑滑轨由静止下滑 L = {L} m 后撞上限位，碰撞的恢复系数 e = {e}。', 'A {m} kg slider slides from rest {L} m down a smooth rail inclined at θ = {theta}° and hits a stop; the coefficient of restitution is e = {e}.', 'Ein Gleiter (m = {m} kg) gleitet aus der Ruhe {L} m eine glatte, unter θ = {theta}° geneigte Schiene hinab und trifft einen Anschlag; Stoßzahl e = {e}.')),
    questions: [
      num('v', T('滑块撞上限位前瞬间的速度大小是多少？', 'What is its speed just before it hits the stop?', 'Wie schnell ist er kurz vor dem Anschlag?'), { kind: 'atEvent', id: 'block.v', event: 'limit', body: 'block', side: 'before' },
        { explain: T('mgL sinθ = ½mv²，v = √(2gL sinθ)。', 'mgL sinθ = ½mv², v = √(2gL sinθ).', 'mgL sinθ = ½mv², v = √(2gL sinθ).') }),
      num('v2', T('碰撞后瞬间滑块的速度大小是多少？', 'What is its speed just after the impact?', 'Wie schnell ist er direkt nach dem Stoß?'), { kind: 'atEvent', id: 'block.v', event: 'limit', body: 'block', side: 'after' },
        { explain: T('v′ = e·v，损失的动能为 (1 − e²)·½mv²。', 'v′ = e·v; the kinetic energy lost is (1 − e²)·½mv².', 'v′ = e·v; der Energieverlust ist (1 − e²)·½mv².') })
    ]
  },
  {
    id: 'e-bounce-loss', chapter: 'energy', template: 'bouncing-ball', params: { h: 1, e: 0.8, m: 0.1 }, vary: { e: [0.5, 0.9, 0.05], m: [0.05, 0.3, 0.05] },
    title: T('弹跳损失的机械能', 'Energy lost in a bounce', 'Energieverlust beim Aufprall'),
    stem: withG(T('质量 {m} kg 的小球从离地 h = {h} m 处落下（水平方向有很小的初速度），与地面碰撞的恢复系数 e = {e}，不计空气阻力。', 'A {m} kg ball falls from h = {h} m (with a small sideways speed) and bounces on the ground with coefficient of restitution e = {e}. Air resistance is negligible.', 'Eine Kugel (m = {m} kg) fällt aus h = {h} m (mit kleiner seitlicher Geschwindigkeit) und prallt mit der Stoßzahl e = {e} vom Boden ab. Kein Luftwiderstand.')),
    questions: [
      num('loss', T('第一次碰撞损失的机械能是多少？', 'How much mechanical energy is lost in the first bounce?', 'Wie viel mechanische Energie geht beim ersten Aufprall verloren?'), q('ledger.impactLoss', 0.6),
        { hint: T('碰撞前后竖直速度之比为 e', 'The vertical speed changes by the factor e', 'Die senkrechte Geschwindigkeit ändert sich um den Faktor e'), explain: T('ΔE = (1 − e²)mgh。', 'ΔE = (1 − e²)mgh.', 'ΔE = (1 − e²)mgh.') })
    ]
  },
  {
    id: 'e-slope-heat', chapter: 'energy', template: 'incline-friction', params: { theta: 37, m: 1, muS: 0.3, muK: 0.25, v0: -4 }, vary: { theta: [25, 45, 1], m: [0.5, 2, 0.5], muK: [0.1, 0.25, 0.05] }, duration: 1.2,
    title: T('上滑过程的摩擦生热', 'Heat from friction on the way up', 'Reibungswärme beim Hinaufgleiten'),
    stem: withG(T('质量 {m} kg 的物块以 4 m/s 的初速度冲上倾角 θ = {theta}° 的固定斜面，动摩擦因数 μ = {muK}。', 'A {m} kg block is sent up a fixed incline (θ = {theta}°) at 4 m/s; μ = {muK}.', 'Ein Klotz (m = {m} kg) wird mit 4 m/s eine feste schiefe Ebene (θ = {theta}°) hinaufgestoßen; μ = {muK}.')),
    questions: [
      num('Q', T('物块上滑到最高点的过程中产生的热量是多少？', 'How much heat is produced on the way up to the highest point?', 'Wie viel Wärme entsteht auf dem Weg bis zum höchsten Punkt?'), { kind: 'atEvent', id: 'pair.block|incline.heat', event: 'reverse', body: 'block', side: 'before' },
        { hint: T('Q = f·s相对', 'Q = f · sliding distance', 'Q = f · Gleitweg'), explain: T('s = v₀²/[2g(sinθ + μcosθ)]，Q = μmg cosθ · s。', 's = v₀²/[2g(sinθ + μcosθ)], Q = μmg cosθ · s.', 's = v₀²/[2g(sinθ + μcosθ)], Q = μmg cosθ · s.') })
    ]
  },

  // ---- Gravitation ----
  {
    id: 'g-binary', chapter: 'gravitation', template: 'binary-star', params: { M1: 300, M2: 100, d: 4 }, vary: { M1: [200, 400, 50], M2: [50, 150, 25] },
    title: T('双星', 'A binary star', 'Ein Doppelstern'),
    stem: g1(T('两颗星体质量 M₁ = {M1} kg、M₂ = {M2} kg，相距 d = {d} m，在相互引力作用下绕共同的质心做匀速圆周运动', 'Two stars of masses M₁ = {M1} kg and M₂ = {M2} kg, d = {d} m apart, circle their common centre of mass under their mutual gravity', 'Zwei Sterne mit M₁ = {M1} kg und M₂ = {M2} kg im Abstand d = {d} m kreisen unter ihrer gegenseitigen Gravitation um den gemeinsamen Schwerpunkt')),
    questions: [
      num('v1', T('星体 1 的线速度大小是多少？', 'What is the speed of star 1?', 'Wie schnell ist Stern 1?'), q('star1.v', 1),
        { hint: T('角速度相同，r₁ = dM₂/(M₁ + M₂)', 'Same angular speed; r₁ = dM₂/(M₁ + M₂)', 'Gleiche Winkelgeschwindigkeit; r₁ = dM₂/(M₁ + M₂)'), explain: T('ω² = G(M₁ + M₂)/d³，v₁ = ωr₁。', 'ω² = G(M₁ + M₂)/d³, v₁ = ωr₁.', 'ω² = G(M₁ + M₂)/d³, v₁ = ωr₁.') }),
      num('v2', T('星体 2 的线速度大小是多少？', 'What is the speed of star 2?', 'Wie schnell ist Stern 2?'), q('star2.v', 1),
        { explain: T('v₂ = ωr₂，v₁/v₂ = M₂/M₁。', 'v₂ = ωr₂, v₁/v₂ = M₂/M₁.', 'v₂ = ωr₂, v₁/v₂ = M₂/M₁.') })
    ]
  },
  {
    id: 'g-kepler', chapter: 'gravitation', template: 'kepler', params: { M: 1000, r1: 3, r2: 6 }, vary: { r1: [2, 4, 0.5], r2: [5, 9, 1] },
    title: T('两颗行星的速度', 'Speeds of two planets', 'Geschwindigkeiten zweier Planeten'),
    stem: g1(T('两颗行星绕质量 M = {M} kg 的恒星做匀速圆周运动，轨道半径分别为 r₁ = {r1} m 和 r₂ = {r2} m', 'Two planets circle a star of mass M = {M} kg on orbits of radius r₁ = {r1} m and r₂ = {r2} m', 'Zwei Planeten umkreisen einen Stern der Masse M = {M} kg auf Bahnen mit r₁ = {r1} m und r₂ = {r2} m')),
    questions: [
      num('v1', T('内侧行星的线速度是多少？', 'What is the speed of the inner planet?', 'Wie schnell ist der innere Planet?'), q('inner.v', 0.5),
        { explain: T('GMm/r² = mv²/r，v = √(GM/r)。', 'GMm/r² = mv²/r, v = √(GM/r).', 'GMm/r² = mv²/r, v = √(GM/r).') }),
      num('v2', T('外侧行星的线速度是多少？', 'What is the speed of the outer planet?', 'Wie schnell ist der äußere Planet?'), q('outer.v', 0.5),
        { explain: T('轨道越高，速度越小：v ∝ 1/√r。', 'Higher orbits are slower: v ∝ 1/√r.', 'Höhere Bahnen sind langsamer: v ∝ 1/√r.') })
    ]
  },
  {
    id: 'g-cosmic', chapter: 'gravitation', template: 'cosmic-velocity', params: { M: 1000, R: 1, k: 1 }, vary: { M: [500, 2000, 250], R: [0.8, 2, 0.2] },
    title: T('第一宇宙速度', 'The first cosmic velocity', 'Die erste kosmische Geschwindigkeit'),
    stem: g1(T('质量 1 kg 的卫星贴近质量 M = {M} kg、半径 R = {R} m 的星球表面做匀速圆周运动，轨道半径 r = R + 0.031 m（卫星自身半径 0.03 m）', 'A 1 kg satellite circles close to the surface of a planet of mass M = {M} kg and radius R = {R} m, on an orbit of radius r = R + 0.031 m (the satellite itself has radius 0.03 m)', 'Ein Satellit (1 kg) kreist dicht über einem Planeten mit M = {M} kg und R = {R} m auf einer Bahn mit r = R + 0,031 m (der Satellit selbst hat den Radius 0,03 m)')),
    questions: [
      num('v', T('卫星的速度是多少？', 'What is the satellite\'s speed?', 'Wie schnell ist der Satellit?'), q('sat.v', 0.05),
        { hint: T('万有引力提供向心力', 'Gravity provides the centripetal force', 'Die Gravitation liefert die Zentripetalkraft'), explain: T('v = √(GM/r)；r ≈ R 时就是第一宇宙速度 √(GM/R)。', 'v = √(GM/r); with r ≈ R this is the first cosmic velocity √(GM/R).', 'v = √(GM/r); mit r ≈ R ist das die erste kosmische Geschwindigkeit √(GM/R).') }),
      num('F', T('卫星受到的引力是多少？', 'What is the gravitational force on it?', 'Wie groß ist die Gravitationskraft auf ihn?'), q('sat.Fg', 0.05),
        { explain: T('F = GMm/r²。', 'F = GMm/r².', 'F = GMm/r².') })
    ]
  },

  // ---- Momentum ----
  {
    id: 'm-three-balls', chapter: 'momentum', template: 'three-balls', params: { v0: 2, m1: 1, m2: 1, m3: 1, e: 1 }, vary: { v0: [1, 4, 0.5] },
    title: T('三球依次弹性碰撞', 'Three balls in elastic collisions', 'Drei Kugeln in elastischen Stößen'),
    stem: T('光滑水平面上三个质量相同的小球 A、B、C 排成一条直线，B、C 静止，A 以 {v0} m/s 的速度与 B 发生弹性正碰，B 再与 C 发生弹性正碰。', 'Three equal balls A, B and C lie in a line on a smooth level surface; B and C are at rest. A hits B head-on at {v0} m/s, then B hits C; both collisions are elastic.', 'Drei gleiche Kugeln A, B, C liegen in einer Reihe auf glatter Ebene; B und C ruhen. A stößt mit {v0} m/s zentral auf B, danach B auf C; beide Stöße sind elastisch.'),
    questions: [
      num('vC', T('最终 C 的速度大小是多少？', 'What is C\'s final speed?', 'Wie schnell ist C am Ende?'), { kind: 'end', id: 'C.v' },
        { explain: T('等质量弹性正碰交换速度：最终 A、B 静止，C 以 v₀ 运动。', 'Equal masses in elastic head-on collisions swap velocities: A and B stop, C moves at v₀.', 'Gleiche Massen tauschen im elastischen zentralen Stoß die Geschwindigkeiten: A und B ruhen, C bewegt sich mit v₀.') })
    ]
  },
  {
    id: 'm-pendulums', chapter: 'momentum', template: 'pendulum-collision', params: { L: 1, theta0: 30, m1: 0.2, m2: 0.4, e: 1 }, vary: { theta0: [20, 50, 5], m2: [0.3, 0.8, 0.1] },
    title: T('两摆球的弹性碰撞', 'Two pendulum bobs collide', 'Zwei Pendelkugeln stoßen'),
    stem: withG(T('摆长都为 L = {L} m 的两个单摆并排悬挂，摆球 A（{m1} kg）拉开 θ₀ = {theta0}° 后由静止释放，在最低点与静止的摆球 B（{m2} kg）发生弹性正碰。', 'Two pendulums of length L = {L} m hang side by side. Bob A ({m1} kg) is pulled aside by θ₀ = {theta0}° and released; at the lowest point it hits bob B ({m2} kg, at rest) elastically.', 'Zwei Pendel der Länge L = {L} m hängen nebeneinander. Kugel A ({m1} kg) wird um θ₀ = {theta0}° ausgelenkt und losgelassen; im tiefsten Punkt stößt sie elastisch auf die ruhende Kugel B ({m2} kg).')),
    questions: [
      num('vB', T('碰后瞬间 B 的速度大小是多少？', 'What is B\'s speed just after the collision?', 'Wie schnell ist B direkt nach dem Stoß?'), { kind: 'atEvent', id: 'B.v', event: 'impact', body: 'B', side: 'after' },
        { hint: T('先由机械能守恒求 A 到最低点的速度', 'First find A\'s speed at the bottom from energy conservation', 'Zuerst A\'s Geschwindigkeit unten aus der Energieerhaltung'), explain: T('v = √(2gL(1 − cosθ₀))，弹性碰撞 v_B = 2m₁v/(m₁ + m₂)。', 'v = √(2gL(1 − cosθ₀)); elastic: v_B = 2m₁v/(m₁ + m₂).', 'v = √(2gL(1 − cosθ₀)); elastisch: v_B = 2m₁v/(m₁ + m₂).') }),
      num('vA', T('碰后瞬间 A 的速度大小是多少？', 'What is A\'s speed just after the collision?', 'Wie schnell ist A direkt nach dem Stoß?'), { kind: 'atEvent', id: 'A.v', event: 'impact', body: 'A', side: 'after' },
        { explain: T('v_A = |m₁ − m₂|v/(m₁ + m₂)，m₁ < m₂ 时 A 被弹回。', 'v_A = |m₁ − m₂|v/(m₁ + m₂); with m₁ < m₂ A bounces back.', 'v_A = |m₁ − m₂|v/(m₁ + m₂); bei m₁ < m₂ prallt A zurück.') })
    ]
  },
  {
    id: 'm-oblique', chapter: 'momentum', template: 'collision-2d', params: { m1: 1, m2: 1, v0: 2, b: 0.1, e: 1 }, vary: { v0: [1, 4, 0.5], b: [0.04, 0.16, 0.02] },
    title: T('等质量小球的弹性斜碰', 'An oblique elastic collision of equal balls', 'Schiefer elastischer Stoß gleicher Kugeln'),
    stem: T('光滑水平面上（俯视），半径都是 0.1 m、质量相同的小球 A、B，A 以 {v0} m/s 的速度去碰静止的 B，A 的运动路线与 B 的球心相距 b = {b} m，碰撞是弹性的。', 'Seen from above on a smooth level surface: equal balls A and B, both of radius 0.1 m. A moves at {v0} m/s towards B (at rest) along a line b = {b} m from B\'s centre; the collision is elastic.', 'Von oben auf glatter Ebene: gleiche Kugeln A und B, beide mit Radius 0,1 m. A bewegt sich mit {v0} m/s auf die ruhende B zu, auf einer Linie im Abstand b = {b} m von B\'s Mittelpunkt; der Stoß ist elastisch.'),
    questions: [
      num('vB', T('碰后 B 的速度大小是多少？', 'What is B\'s speed after the collision?', 'Wie schnell ist B nach dem Stoß?'), { kind: 'atEvent', id: 'B.v', event: 'impact', body: 'B', side: 'after' },
        { hint: T('B 沿两球心连线方向运动；sinφ = b/(2r)', 'B moves along the line of centres; sinφ = b/(2r)', 'B bewegt sich längs der Mittelpunktslinie; sinφ = b/(2r)'), explain: T('v_B = v₀ cosφ，v_A = v₀ sinφ，碰后两球速度相互垂直。', 'v_B = v₀ cosφ, v_A = v₀ sinφ; afterwards the velocities are perpendicular.', 'v_B = v₀ cosφ, v_A = v₀ sinφ; danach stehen die Geschwindigkeiten senkrecht.') })
    ]
  },
  {
    id: 'm-bounce', chapter: 'momentum', template: 'bouncing-ball', params: { h: 1, e: 0.8, m: 0.1 }, vary: { h: [0.5, 2, 0.25], e: [0.5, 0.9, 0.05] },
    title: T('落地反弹', 'Bouncing off the ground', 'Abprall vom Boden'),
    stem: withG(T('质量 {m} kg 的小球从 h = {h} m 高处落下，落地时水平速度为 0.4 m/s，与地面碰撞的恢复系数 e = {e}，地面光滑。', 'A {m} kg ball falls from h = {h} m and lands with a horizontal speed of 0.4 m/s on smooth ground; the coefficient of restitution is e = {e}.', 'Eine Kugel (m = {m} kg) fällt aus h = {h} m und landet mit 0,4 m/s waagerechter Geschwindigkeit auf glattem Boden; Stoßzahl e = {e}.')),
    questions: [
      num('v', T('第一次反弹后瞬间小球的速度大小是多少？', 'What is its speed just after the first bounce?', 'Wie schnell ist sie direkt nach dem ersten Aufprall?'), { kind: 'atEvent', id: 'ball.v', event: 'impact', body: 'ball', side: 'after' },
        { explain: T('竖直分量变为 e√(2gh)，水平分量不变：v = √(0.4² + 2e²gh)。', 'The vertical part becomes e√(2gh), the horizontal stays: v = √(0.4² + 2e²gh).', 'Der senkrechte Anteil wird e√(2gh), der waagerechte bleibt: v = √(0,4² + 2e²gh).') }),
      num('t', T('小球第一次落地的时刻是多少？', 'When does it first hit the ground?', 'Wann trifft sie zum ersten Mal auf?'), { kind: 'event', event: 'impact', body: 'ball' },
        { explain: T('t = √(2h/g)。', 't = √(2h/g).', 't = √(2h/g).') })
    ]
  },

  // ---- Oscillations ----
  {
    id: 'o-vertical-spring', chapter: 'oscillation', template: 'vertical-spring', params: { k: 20, m: 0.5, A: 0.1 }, vary: { k: [10, 40, 5], m: [0.2, 1, 0.1], A: [0.05, 0.15, 0.01] },
    title: T('竖直弹簧振子', 'A vertical spring oscillator', 'Ein senkrechter Federschwinger'),
    stem: withG(T('劲度系数 k = {k} N/m 的轻弹簧上端固定，下端挂质量 {m} kg 的小球。把小球从平衡位置向下拉 A = {A} m 后由静止释放。', 'A light spring (k = {k} N/m) hangs from a support with a {m} kg ball at its end. The ball is pulled A = {A} m below its equilibrium position and released.', 'An einer leichten Feder (k = {k} N/m) hängt eine Kugel von {m} kg. Sie wird A = {A} m unter die Gleichgewichtslage gezogen und losgelassen.')),
    questions: [
      num('vmax', T('小球的最大速度是多少？', 'What is the ball\'s greatest speed?', 'Wie groß ist die größte Geschwindigkeit?'), { kind: 'extreme', id: 'ball.v', which: 'max' },
        { hint: T('经过平衡位置时速度最大', 'Fastest when passing the equilibrium position', 'Am schnellsten beim Durchgang durch die Gleichgewichtslage'), explain: T('v_max = Aω = A√(k/m)。', 'v_max = Aω = A√(k/m).', 'v_max = Aω = A√(k/m).') }),
      num('Fmax', T('弹簧弹力的最大值是多少？', 'What is the largest spring force?', 'Wie groß ist die größte Federkraft?'), { kind: 'extreme', id: 'spring.F', which: 'max' },
        { explain: T('在最低点：F = mg + kA。', 'At the lowest point: F = mg + kA.', 'Im tiefsten Punkt: F = mg + kA.') })
    ]
  },
  {
    id: 'o-physical', chapter: 'oscillation', template: 'physical-pendulum', params: { L: 1, theta0: 5, m: 1 }, vary: { L: [0.5, 2, 0.1], theta0: [3, 10, 1] },
    title: T('复摆（细杆摆）', 'A physical pendulum (rod)', 'Ein physisches Pendel (Stab)'),
    stem: withG(T('长 L = {L} m、质量 {m} kg 的匀质细杆一端用光滑铰链悬挂，从偏离竖直方向 θ₀ = {theta0}° 处由静止释放。', 'A uniform rod (L = {L} m, {m} kg) hangs from a smooth hinge at one end and is released from rest θ₀ = {theta0}° from the vertical.', 'Ein homogener Stab (L = {L} m, {m} kg) hängt an einem glatten Gelenk an einem Ende und wird θ₀ = {theta0}° aus der Senkrechten losgelassen.')),
    questions: [
      num('w', T('细杆的最大角速度是多少？', 'What is the rod\'s greatest angular speed?', 'Wie groß ist die größte Winkelgeschwindigkeit?'), { kind: 'extreme', id: 'rod.omega', which: 'max' },
        { hint: T('机械能守恒，I = mL²/3', 'Energy conservation with I = mL²/3', 'Energieerhaltung mit I = mL²/3'), explain: T('mg(L/2)(1 − cosθ₀) = ½(mL²/3)ω²，ω = √(3g(1 − cosθ₀)/L)。', 'mg(L/2)(1 − cosθ₀) = ½(mL²/3)ω², ω = √(3g(1 − cosθ₀)/L).', 'mg(L/2)(1 − cosθ₀) = ½(mL²/3)ω², ω = √(3g(1 − cosθ₀)/L).') })
    ]
  },
  {
    id: 'o-resonance', chapter: 'oscillation', template: 'resonance', params: { k: 50, m: 0.5, c: 0.5, F0: 1, omega: 10 }, vary: { c: [0.4, 1, 0.1], F0: [0.5, 2, 0.5] },
    title: T('共振的振幅', 'Amplitude at resonance', 'Amplitude bei Resonanz'),
    stem: T('光滑水平面上的弹簧振子（k = {k} N/m，m = {m} kg）带阻尼（c = {c} N·s/m），受驱动力 F = F₀ sin ωt，F₀ = {F0} N，ω = {omega} rad/s，从静止开始运动足够长时间。', 'A spring oscillator on a smooth surface (k = {k} N/m, m = {m} kg) with damping c = {c} N·s/m is driven by F = F₀ sin ωt with F₀ = {F0} N and ω = {omega} rad/s, starting from rest, for a long time.', 'Ein Federschwinger auf glatter Ebene (k = {k} N/m, m = {m} kg) mit Dämpfung c = {c} N·s/m wird lange von F = F₀ sin ωt angetrieben (F₀ = {F0} N, ω = {omega} rad/s), Start aus der Ruhe.'),
    questions: [
      num('F', T('稳定后弹簧弹力的最大值是多少？', 'What is the largest spring force once steady?', 'Wie groß ist die größte Federkraft im eingeschwungenen Zustand?'), { kind: 'extreme', id: 'spring.F', which: 'max' },
        { hint: T('ω = √(k/m)：共振', 'ω = √(k/m): resonance', 'ω = √(k/m): Resonanz'), explain: T('共振时 A = F₀/(cω)，最大弹力 kA。', 'At resonance A = F₀/(cω); the largest spring force is kA.', 'Bei Resonanz A = F₀/(cω); die größte Federkraft ist kA.') })
    ]
  },

  // ---- Rotation ----
  {
    id: 'r-motor-disc', chapter: 'rotation', template: 'motor-disc', params: { M: 0.5, m: 2, r: 0.3 }, vary: { M: [0.2, 1, 0.1], m: [1, 4, 0.5], r: [0.2, 0.5, 0.05] },
    title: T('转动定律', 'Newton\'s second law for rotation', 'Grundgesetz der Drehbewegung'),
    stem: T('质量 {m} kg、半径 r = {r} m 的匀质圆盘可绕中心的光滑轴转动，马达对它施加恒定力矩 M = {M} N·m，圆盘从静止开始转动。', 'A uniform disc ({m} kg, radius r = {r} m) turns about a smooth central axle; a motor applies a constant torque M = {M} N·m from rest.', 'Eine homogene Scheibe ({m} kg, Radius r = {r} m) dreht sich um eine glatte Mittelachse; ein Motor übt aus der Ruhe das konstante Moment M = {M} N·m aus.'),
    questions: [
      num('w', T('1.5 s 末圆盘的角速度是多少？', 'What is its angular speed after 1.5 s?', 'Wie groß ist die Winkelgeschwindigkeit nach 1,5 s?'), q('disc.omega', 1.5),
        { hint: T('I = ½mr²，β = M/I', 'I = ½mr², α = M/I', 'I = ½mr², α = M/I'), explain: T('ω = βt = 2Mt/(mr²)。', 'ω = αt = 2Mt/(mr²).', 'ω = αt = 2Mt/(mr²).') })
    ]
  },
  {
    id: 'r-gears', chapter: 'rotation', template: 'gears', params: { rA: 0.2, rB: 0.4, mA: 1, mB: 2, M: 0.5 }, vary: { rB: [0.3, 0.6, 0.05], M: [0.2, 1, 0.1] },
    title: T('齿轮传动', 'A gear train', 'Ein Zahnradgetriebe'),
    stem: T('两个匀质圆盘齿轮外啮合：主动轮 A（{mA} kg，r_A = {rA} m）受马达的恒定力矩 M = {M} N·m，带动从动轮 B（{mB} kg，r_B = {rB} m），两轮都绕光滑轴转动，从静止开始。', 'Two uniform disc gears mesh: driver A ({mA} kg, r_A = {rA} m) gets a constant motor torque M = {M} N·m and drives B ({mB} kg, r_B = {rB} m); both turn on smooth axles from rest.', 'Zwei homogene Scheibenzahnräder greifen ineinander: Antrieb A ({mA} kg, r_A = {rA} m) erhält das konstante Motormoment M = {M} N·m und treibt B ({mB} kg, r_B = {rB} m); beide drehen sich auf glatten Achsen aus der Ruhe.'),
    questions: [
      num('wA', T('1 s 末主动轮 A 的角速度是多少？', 'What is A\'s angular speed after 1 s?', 'Wie groß ist A\'s Winkelgeschwindigkeit nach 1 s?'), q('gearA.omega', 1),
        { hint: T('啮合点线速度相等：ω_B = ω_A·r_A/r_B', 'Same speed at the contact: ω_B = ω_A·r_A/r_B', 'Gleiche Geschwindigkeit am Eingriff: ω_B = ω_A·r_A/r_B'), explain: T('等效转动惯量 I = I_A + I_B(r_A/r_B)²，β_A = M/I。', 'Equivalent inertia I = I_A + I_B(r_A/r_B)², α_A = M/I.', 'Ersatzträgheitsmoment I = I_A + I_B(r_A/r_B)², α_A = M/I.') })
    ]
  },
  {
    id: 'r-rolling-resistance', chapter: 'rotation', template: 'rolling-resistance', params: { r: 0.15, m: 1, v0: 2, crr: 0.05, mu: 0.5 }, vary: { v0: [1, 2, 0.25], crr: [0.05, 0.1, 0.01] }, duration: 10,
    title: T('滚动阻力使圆柱停下', 'Rolling resistance stops a cylinder', 'Rollwiderstand bremst einen Zylinder'),
    stem: withG(T('质量 {m} kg、半径 r = {r} m 的匀质圆柱在水平地面上以 v₀ = {v0} m/s 纯滚动，滚动阻力系数 C_rr = {crr}（阻力偶 M = C_rr·N·r）。', 'A uniform cylinder ({m} kg, r = {r} m) rolls without slipping on level ground at v₀ = {v0} m/s; the rolling-resistance coefficient is C_rr = {crr} (resisting couple M = C_rr·N·r).', 'Ein homogener Zylinder ({m} kg, r = {r} m) rollt ohne Gleiten mit v₀ = {v0} m/s auf ebenem Boden; Rollwiderstandszahl C_rr = {crr} (Widerstandsmoment M = C_rr·N·r).')),
    questions: [
      num('t', T('圆柱经过多长时间停下？', 'After what time does it stop?', 'Nach welcher Zeit bleibt er stehen?'), { kind: 'event', event: 'rollStop', body: 'disc' },
        { hint: T('平动与转动方程联立，I = ½mr²', 'Combine translation and rotation, I = ½mr²', 'Translation und Rotation verbinden, I = ½mr²'), explain: T('a = C_rr g/(1 + I/(mr²)) = (2/3)C_rr g，t = v₀/a。', 'a = C_rr g/(1 + I/(mr²)) = (2/3)C_rr g, t = v₀/a.', 'a = C_rr g/(1 + I/(mr²)) = (2/3)C_rr g, t = v₀/a.') })
    ]
  },
  {
    id: 'r-ball-rod', chapter: 'rotation', template: 'ball-rod', params: { M: 1, L: 1, m: 0.2, v0: 3, d: 0.8, e: 0 }, vary: { v0: [2, 5, 0.5], d: [0.4, 1, 0.1] },
    title: T('小球撞击可转动的细杆', 'A ball strikes a pivoted rod', 'Eine Kugel trifft einen drehbaren Stab'),
    stem: T('光滑水平面上（俯视），长 L = {L} m、质量 M = {M} kg 的匀质细杆一端用光滑转轴固定。质量 m = {m} kg 的小球以 v₀ = {v0} m/s 垂直于杆撞在离转轴 d = {d} m 处，碰撞的恢复系数 e = 0（碰后小球与杆上的撞击点速度相同）。', 'Seen from above on a smooth surface: a uniform rod (L = {L} m, M = {M} kg) is pivoted at one end. A ball (m = {m} kg) moving at v₀ = {v0} m/s perpendicular to the rod hits it d = {d} m from the pivot with e = 0 (afterwards the ball moves with the struck point).', 'Von oben auf glatter Ebene: ein homogener Stab (L = {L} m, M = {M} kg) ist an einem Ende drehbar gelagert. Eine Kugel (m = {m} kg) trifft ihn mit v₀ = {v0} m/s senkrecht im Abstand d = {d} m von der Achse, e = 0 (danach bewegt sie sich mit dem getroffenen Punkt).'),
    questions: [
      num('v', T('碰后瞬间小球的速度大小是多少？', 'What is the ball\'s speed just after the impact?', 'Wie schnell ist die Kugel direkt nach dem Stoß?'), { kind: 'atEvent', id: 'ball.v', event: 'impact', body: 'ball', side: 'after' },
        { hint: T('对转轴角动量守恒（转轴的力不产生力矩）', 'Angular momentum about the pivot is conserved', 'Drehimpuls um die Achse bleibt erhalten'), explain: T('mv₀d = (ML²/3 + md²)ω，v = ωd。', 'mv₀d = (ML²/3 + md²)ω, v = ωd.', 'mv₀d = (ML²/3 + md²)ω, v = ωd.') })
    ]
  },

  // ---- Electrostatics ----
  {
    id: 'es-coulomb', chapter: 'electrostatics', template: 'two-charges', params: { q1: 1, q2: 1, m1: 10, m2: 10, d: 0.3 }, vary: { q1: [0.5, 2, 0.5], q2: [0.5, 2, 0.5], d: [0.2, 0.5, 0.05] },
    title: T('库仑定律', 'Coulomb\'s law', 'Coulombsches Gesetz'),
    stem: noG(T('光滑绝缘水平面上（俯视）两个带正电的小球，电荷量 q₁ = {q1} μC、q₂ = {q2} μC，质量 m₁ = {m1} g、m₂ = {m2} g，相距 d = {d} m，同时由静止释放。k = 8.99 × 10⁹ N·m²/C²。', 'Seen from above on a smooth insulating surface: two positively charged balls, q₁ = {q1} μC and q₂ = {q2} μC, masses {m1} g and {m2} g, d = {d} m apart, released together from rest. k = 8.99 × 10⁹ N·m²/C².', 'Von oben auf glatter isolierender Ebene: zwei positiv geladene Kugeln, q₁ = {q1} μC und q₂ = {q2} μC, Massen {m1} g und {m2} g, im Abstand d = {d} m, gleichzeitig aus der Ruhe losgelassen. k = 8,99 · 10⁹ N·m²/C².')),
    questions: [
      num('F', T('释放瞬间两球间库仑力的大小是多少？', 'How large is the Coulomb force at release?', 'Wie groß ist die Coulombkraft beim Loslassen?'), q('A.Fc', 0),
        { explain: T('F = kq₁q₂/d²。', 'F = kq₁q₂/d².', 'F = kq₁q₂/d².') }),
      num('a', T('释放瞬间小球 A 的加速度大小是多少？', 'What is A\'s acceleration at release?', 'Wie groß ist A\'s Beschleunigung beim Loslassen?'), q('A.a', 0),
        { explain: T('a = F/m₁。', 'a = F/m₁.', 'a = F/m₁.') })
    ]
  },
  {
    id: 'es-deflection', chapter: 'electrostatics', template: 'charge-deflection', params: { q: 1, m: 1, E: 2, v0: 3, L: 1.2 }, vary: { E: [1, 2.5, 0.5], v0: [3, 4, 0.5] },
    title: T('带电粒子在匀强电场中的偏转', 'A charged particle deflected by a uniform field', 'Ablenkung eines geladenen Teilchens im homogenen Feld'),
    stem: noG(T('带正电的小球（q = {q} mC，m = {m} g）以 v₀ = {v0} m/s 垂直于电场方向射入场强 E = {E} V/m 的匀强电场（电场充满整个区域），平行极板长 L = {L} m，荧光屏在极板右端外 0.47 m 处（小球打到屏上时球心的位置）。', 'A positive ball (q = {q} mC, m = {m} g) enters a uniform field E = {E} V/m (filling the whole region) at v₀ = {v0} m/s perpendicular to the field; the plates are L = {L} m long and the ball reaches the screen 0.47 m beyond their end (position of its centre at impact).', 'Eine positive Kugel (q = {q} mC, m = {m} g) tritt mit v₀ = {v0} m/s senkrecht in ein homogenes Feld E = {E} V/m ein (das den ganzen Raum füllt); die Platten sind L = {L} m lang, der Schirm wird 0,47 m hinter ihrem Ende erreicht (Lage des Kugelmittelpunkts beim Auftreffen).')),
    questions: [
      num('v', T('小球打到荧光屏时的速度大小是多少？', 'What is its speed when it hits the screen?', 'Wie schnell ist sie beim Auftreffen auf den Schirm?'), { kind: 'atEvent', id: 'p.v', event: 'impact', body: 'p', side: 'before' },
        { hint: T('类平抛：沿 v₀ 匀速，沿电场匀加速 a = qE/m', 'Like a projectile: uniform along v₀, a = qE/m along the field', 'Wie ein Wurf: gleichförmig längs v₀, a = qE/m längs des Feldes'), explain: T('t = (L + 0.47 m)/v₀，v_y = qEt/m，v = √(v₀² + v_y²)。', 't = (L + 0.47 m)/v₀, v_y = qEt/m, v = √(v₀² + v_y²).', 't = (L + 0,47 m)/v₀, v_y = qEt/m, v = √(v₀² + v_y²).') }),
      num('F', T('小球受到的电场力是多少？', 'What is the electric force on it?', 'Wie groß ist die elektrische Kraft auf sie?'), q('p.FE', 0.1),
        { explain: T('F = qE。', 'F = qE.', 'F = qE.') })
    ]
  },
  {
    id: 'es-oscilloscope', chapter: 'electrostatics', template: 'oscilloscope', params: { U1: 2, U2: 0.5, L: 1, d: 0.5, q: 1, m: 1 }, vary: { U1: [1, 4, 0.5], U2: [0.2, 0.8, 0.1] },
    title: T('先加速后偏转', 'Accelerated, then deflected', 'Erst beschleunigt, dann abgelenkt'),
    stem: noG(T('带正电的粒子（q = {q} mC，m = {m} g）由静止经电压 U₁ = {U1} V 加速后，垂直射入两板间电压 U₂ = {U2} V、板长 L = {L} m、板间距 d = {d} m 的偏转电场。', 'A positive particle (q = {q} mC, m = {m} g) is accelerated from rest through U₁ = {U1} V and then enters, perpendicular to the field, between plates with U₂ = {U2} V, length L = {L} m and separation d = {d} m.', 'Ein positives Teilchen (q = {q} mC, m = {m} g) wird aus der Ruhe mit U₁ = {U1} V beschleunigt und tritt dann senkrecht zum Feld zwischen Platten mit U₂ = {U2} V, Länge L = {L} m und Abstand d = {d} m ein.')),
    questions: [
      num('v0', T('粒子经加速电场后的速度是多少？', 'What is its speed after the accelerating field?', 'Wie schnell ist es nach dem Beschleunigungsfeld?'), { kind: 'atEvent', id: 'p.v', event: 'zoneLeave', body: 'p', side: 'after' },
        { explain: T('qU₁ = ½mv₀²，v₀ = √(2qU₁/m)。', 'qU₁ = ½mv₀², v₀ = √(2qU₁/m).', 'qU₁ = ½mv₀², v₀ = √(2qU₁/m).') }),
      num('v', T('粒子离开偏转电场时的速度大小是多少？', 'What is its speed when it leaves the deflecting field?', 'Wie schnell ist es beim Verlassen des Ablenkfeldes?'), { kind: 'extreme', id: 'p.v', which: 'max' },
        { explain: T('v_y = (qU₂/(md))·(L/v₀)，v = √(v₀² + v_y²)；偏移 y = U₂L²/(4dU₁) 与 q、m 无关。', 'v_y = (qU₂/(md))·(L/v₀), v = √(v₀² + v_y²); the offset y = U₂L²/(4dU₁) does not depend on q or m.', 'v_y = (qU₂/(md))·(L/v₀), v = √(v₀² + v_y²); die Ablenkung y = U₂L²/(4dU₁) hängt nicht von q und m ab.') })
    ]
  },
  {
    id: 'es-charged-pendulum', chapter: 'electrostatics', template: 'charged-pendulum', params: { E: 5, q: 1, m: 1, L: 1 }, vary: { E: [3, 8, 1], L: [0.5, 1.5, 0.25] },
    title: T('电场中的带电摆球', 'A charged pendulum in a field', 'Ein geladenes Pendel im Feld'),
    stem: withG(T('长 L = {L} m 的绝缘细线一端固定，另一端系质量 {m} g、电荷量 {q} mC 的小球，处在水平向右、场强 E = {E} V/m 的匀强电场中。小球从最低点（细线竖直）由静止释放。', 'A ball ({m} g, {q} mC) hangs on an insulating thread of length L = {L} m in a uniform horizontal field E = {E} V/m. It is released from rest with the thread vertical.', 'Eine Kugel ({m} g, {q} mC) hängt an einem isolierenden Faden der Länge L = {L} m in einem waagerechten homogenen Feld E = {E} V/m. Sie wird bei senkrechtem Faden aus der Ruhe losgelassen.')),
    questions: [
      num('T', T('运动过程中细线拉力的最大值是多少？', 'What is the largest thread tension?', 'Wie groß ist die größte Fadenkraft?'), { kind: 'extreme', id: 'thread.T', which: 'max' },
        { hint: T('等效重力 g′ = √(g² + (qE/m)²)，最大拉力在平衡位置', 'Effective gravity g′ = √(g² + (qE/m)²); the tension is largest at the equilibrium position', 'Effektive Schwere g′ = √(g² + (qE/m)²); die Kraft ist in der Gleichgewichtslage am größten'), explain: T('tanθ = qE/(mg)，T_max = mg′(3 − 2cosθ)。', 'tanθ = qE/(mg), T_max = mg′(3 − 2cosθ).', 'tanθ = qE/(mg), T_max = mg′(3 − 2cosθ).') })
    ]
  },
  {
    id: 'es-oil-drop', chapter: 'electrostatics', template: 'charged-drop', params: { E: 8, q: 1, m: 1, b: 0.01 }, vary: { E: [2, 9, 1], b: [0.01, 0.02, 0.005] },
    title: T('电场中下落的油滴', 'An oil drop falling in a field', 'Ein Öltröpfchen im Feld'),
    stem: withG(T('质量 {m} g、带负电 {q} mC 的油滴在竖直向下、场强 E = {E} V/m 的匀强电场中由静止开始下落，所受空气阻力 f = bv，b = {b} N·s/m。', 'An oil drop ({m} g, charge −{q} mC) starts falling from rest in a uniform downward field E = {E} V/m; air drag is f = bv with b = {b} N·s/m.', 'Ein Öltröpfchen ({m} g, Ladung −{q} mC) fällt aus der Ruhe in einem homogenen, nach unten gerichteten Feld E = {E} V/m; Luftwiderstand f = bv mit b = {b} N·s/m.')),
    questions: [
      num('v', T('油滴最终匀速下落的速度是多少？', 'At what steady speed does it finally fall?', 'Mit welcher konstanten Geschwindigkeit fällt es schließlich?'), q('drop.v', 0.8),
        { hint: T('电场力向上：mg = qE + bv', 'The electric force is upwards: mg = qE + bv', 'Die elektrische Kraft wirkt nach oben: mg = qE + bv'), explain: T('v = (mg − qE)/b；qE = mg 时油滴悬浮（密立根）。', 'v = (mg − qE)/b; with qE = mg the drop floats (Millikan).', 'v = (mg − qE)/b; bei qE = mg schwebt es (Millikan).') })
    ]
  },

  // ---- Magnetism and charged particles ----
  {
    id: 'mg-circle', chapter: 'magnetism', template: 'cyclotron', params: { q: 1, m: 1, B: 2, v: 1 }, vary: { B: [1, 3, 0.5], v: [0.5, 2, 0.5] },
    title: T('磁场中的匀速圆周运动', 'Circular motion in a magnetic field', 'Kreisbewegung im Magnetfeld'),
    stem: noG(T('带正电的粒子（q = {q} mC，m = {m} g）以 v = {v} m/s 垂直射入磁感应强度 B = {B} T 的匀强磁场。', 'A positive particle (q = {q} mC, m = {m} g) moves at v = {v} m/s perpendicular to a uniform magnetic field B = {B} T.', 'Ein positives Teilchen (q = {q} mC, m = {m} g) bewegt sich mit v = {v} m/s senkrecht zu einem homogenen Magnetfeld B = {B} T.')),
    questions: [
      num('F', T('粒子受到的洛伦兹力是多少？', 'What is the Lorentz force on it?', 'Wie groß ist die Lorentzkraft?'), q('p.FB', 0.5),
        { explain: T('F = qvB。', 'F = qvB.', 'F = qvB.') }),
      num('a', T('粒子的向心加速度是多少？', 'What is its centripetal acceleration?', 'Wie groß ist die Zentripetalbeschleunigung?'), q('p.a', 0.5),
        { explain: T('a = qvB/m = v²/r，r = mv/(qB)。', 'a = qvB/m = v²/r with r = mv/(qB).', 'a = qvB/m = v²/r mit r = mv/(qB).') })
    ]
  },
  {
    id: 'mg-selector', chapter: 'magnetism', template: 'velocity-selector', params: { E: 4, B: 2, v0: 2, q: 1, m: 1 }, vary: { E: [2, 6, 1] },
    title: T('速度选择器', 'A velocity selector', 'Ein Geschwindigkeitsfilter'),
    stem: noG(T('两板间有互相垂直的匀强电场 E = {E} V/m 和匀强磁场 B = {B} T，带正电的粒子（q = {q} mC，m = {m} g）以 v₀ = {v0} m/s 垂直于两场射入。', 'Between two plates are crossed uniform fields E = {E} V/m and B = {B} T. A positive particle (q = {q} mC, m = {m} g) enters at v₀ = {v0} m/s perpendicular to both.', 'Zwischen zwei Platten liegen gekreuzte homogene Felder E = {E} V/m und B = {B} T. Ein positives Teilchen (q = {q} mC, m = {m} g) tritt mit v₀ = {v0} m/s senkrecht zu beiden ein.')),
    questions: [
      num('FE', T('粒子受到的电场力是多少？', 'What is the electric force on it?', 'Wie groß ist die elektrische Kraft?'), q('p.FE', 0),
        { explain: T('F = qE。', 'F = qE.', 'F = qE.') }),
      num('FB', T('刚射入时粒子受到的洛伦兹力是多少？', 'What is the Lorentz force as it enters?', 'Wie groß ist die Lorentzkraft beim Eintritt?'), q('p.FB', 0),
        { explain: T('F = qv₀B；只有 v₀ = E/B 时两力平衡，粒子沿直线通过。', 'F = qv₀B; only with v₀ = E/B do the forces balance and the particle goes straight through.', 'F = qv₀B; nur bei v₀ = E/B heben sich die Kräfte auf, und das Teilchen fliegt geradeaus.') })
    ]
  },
  {
    id: 'mg-spectrometer', chapter: 'magnetism', template: 'mass-spectrometer', params: { U: 0.5, B: 2, q: 1, m1: 1, m2: 2 }, vary: { B: [1.5, 3, 0.5], m2: [1.5, 3, 0.5] },
    title: T('质谱仪', 'A mass spectrometer', 'Ein Massenspektrometer'),
    stem: noG(T('电荷量都为 q = {q} mC、质量分别为 m₁ = {m1} g 和 m₂ = {m2} g 的两种正粒子，由静止经电压 U = {U} V 加速后进入 B = {B} T 的匀强磁场。', 'Two kinds of positive particles, both q = {q} mC, masses m₁ = {m1} g and m₂ = {m2} g, are accelerated from rest through U = {U} V and enter a uniform field B = {B} T.', 'Zwei Sorten positiver Teilchen, beide q = {q} mC, Massen m₁ = {m1} g und m₂ = {m2} g, werden aus der Ruhe mit U = {U} V beschleunigt und treten in ein homogenes Feld B = {B} T ein.')),
    questions: [
      num('v1', T('粒子 1 进入磁场时的速度是多少？', 'How fast is particle 1 when it enters the field?', 'Wie schnell ist Teilchen 1 beim Eintritt ins Feld?'), q('p1.v', 2.5),
        { explain: T('qU = ½m₁v₁²，v₁ = √(2qU/m₁)。', 'qU = ½m₁v₁², v₁ = √(2qU/m₁).', 'qU = ½m₁v₁², v₁ = √(2qU/m₁).') }),
      num('v2', T('粒子 2 进入磁场时的速度是多少？', 'How fast is particle 2 when it enters the field?', 'Wie schnell ist Teilchen 2 beim Eintritt ins Feld?'), q('p2.v', 3.7),
        { explain: T('v₂ = √(2qU/m₂)；在磁场中 r = mv/(qB) = √(2mU/q)/B，质量大的半径大。', 'v₂ = √(2qU/m₂); in the field r = mv/(qB) = √(2mU/q)/B, so heavier particles turn wider.', 'v₂ = √(2qU/m₂); im Feld r = mv/(qB) = √(2mU/q)/B, schwerere Teilchen laufen weiter außen.') })
    ]
  },
  {
    id: 'mg-bounded', chapter: 'magnetism', template: 'bounded-field', params: { B: 1, v: 1, theta: 0, D: 2, q: 1, m: 1 }, vary: { B: [1, 2, 0.25], v: [0.5, 1, 0.1] },
    title: T('有界磁场：转半周返回', 'A bounded field: half a turn and back', 'Begrenztes Feld: eine halbe Runde zurück'),
    stem: noG(T('宽 D = {D} m 的匀强磁场（B = {B} T）左边界竖直，带正电的粒子（q = {q} mC，m = {m} g）以 v = {v} m/s 垂直于边界射入（射入前已运动 0.4r + 0.1 m，r 为轨道半径）。', 'A uniform field (B = {B} T) of width D = {D} m has a vertical left edge. A positive particle (q = {q} mC, m = {m} g) enters perpendicular to the edge at v = {v} m/s, after travelling 0.4r + 0.1 m to it (r is the radius of its path).', 'Ein homogenes Feld (B = {B} T) der Breite D = {D} m hat einen senkrechten linken Rand. Ein positives Teilchen (q = {q} mC, m = {m} g) tritt mit v = {v} m/s senkrecht ein, nachdem es 0,4r + 0,1 m bis zum Rand geflogen ist (r ist sein Bahnradius).')),
    questions: [
      num('t', T('粒子离开磁场的时刻是多少？', 'When does the particle leave the field?', 'Wann verlässt das Teilchen das Feld?'), { kind: 'event', event: 'zoneLeave', body: 'p' },
        { hint: T('r = mv/(qB) < D：转过半周后从左边界射出', 'r = mv/(qB) < D: it turns half a circle and leaves through the left edge', 'r = mv/(qB) < D: es läuft einen Halbkreis und verlässt das Feld links'), explain: T('在磁场中的时间 t = πm/(qB)，与速度无关。', 'Time in the field t = πm/(qB), independent of the speed.', 'Zeit im Feld t = πm/(qB), unabhängig von der Geschwindigkeit.') })
    ]
  },
  {
    id: 'mg-round', chapter: 'magnetism', template: 'circular-field', params: { B: 1, R: 1, v: 1, q: 1, m: 1 }, vary: { B: [0.6, 2, 0.2] },
    title: T('圆形磁场区域', 'A circular field region', 'Ein kreisförmiges Feldgebiet'),
    stem: noG(T('半径 R = {R} m 的圆形区域内有 B = {B} T 的匀强磁场，带正电的粒子（q = {q} mC，m = {m} g）以 v = {v} m/s 从距离区域 1 m 处沿半径方向射向圆心。', 'A circular region of radius R = {R} m holds a uniform field B = {B} T. A positive particle (q = {q} mC, m = {m} g) flies at v = {v} m/s along a radius towards the centre, starting 1 m outside the region.', 'Ein Kreisgebiet mit R = {R} m enthält ein homogenes Feld B = {B} T. Ein positives Teilchen (q = {q} mC, m = {m} g) fliegt mit v = {v} m/s längs eines Radius auf den Mittelpunkt zu, Start 1 m außerhalb.')),
    questions: [
      num('t', T('粒子离开磁场的时刻是多少？', 'When does it leave the field?', 'Wann verlässt es das Feld?'), { kind: 'event', event: 'zoneLeave', body: 'p' },
        { hint: T('沿半径射入必沿半径射出；tan(φ/2) = R/r', 'In along a radius, out along a radius; tan(φ/2) = R/r', 'Radial hinein, radial hinaus; tan(φ/2) = R/r'), explain: T('r = mv/(qB)，偏转角 φ = 2 arctan(R/r)，在场中的时间 φr/v。', 'r = mv/(qB), deflection φ = 2 arctan(R/r), time in the field φr/v.', 'r = mv/(qB), Ablenkwinkel φ = 2 arctan(R/r), Zeit im Feld φr/v.') })
    ]
  },
  {
    id: 'mg-combo', chapter: 'magnetism', template: 'field-combo', params: { E: 1, B: 1, L: 1, v0: 1, q: 1, m: 1 }, vary: { E: [0.5, 1.5, 0.25] },
    title: T('组合场：先电场后磁场', 'Combined fields: electric, then magnetic', 'Kombinierte Felder: erst elektrisch, dann magnetisch'),
    stem: noG(T('带正电的粒子（q = {q} mC，m = {m} g）以 v₀ = {v0} m/s 垂直射入宽 L = {L} m、场强 E = {E} V/m 的匀强电场，离开电场后进入 B = {B} T 的匀强磁场。', 'A positive particle (q = {q} mC, m = {m} g) enters a uniform electric field (width L = {L} m, E = {E} V/m) perpendicular to it at v₀ = {v0} m/s, and after leaving it enters a uniform magnetic field B = {B} T.', 'Ein positives Teilchen (q = {q} mC, m = {m} g) tritt mit v₀ = {v0} m/s senkrecht in ein homogenes elektrisches Feld (Breite L = {L} m, E = {E} V/m) ein und danach in ein homogenes Magnetfeld B = {B} T.')),
    questions: [
      num('v', T('粒子在磁场中运动的速度大小是多少？', 'What is its speed in the magnetic field?', 'Wie schnell ist es im Magnetfeld?'), q('p.v', 1.8),
        { hint: T('磁场不做功，速度大小等于离开电场时的', 'The magnetic field does no work: the speed is the one on leaving the electric field', 'Das Magnetfeld verrichtet keine Arbeit: die Geschwindigkeit ist die beim Verlassen des E-Feldes'), explain: T('v_y = qEL/(mv₀)，v = √(v₀² + v_y²)，r = mv/(qB)。', 'v_y = qEL/(mv₀), v = √(v₀² + v_y²), r = mv/(qB).', 'v_y = qEL/(mv₀), v = √(v₀² + v_y²), r = mv/(qB).') })
    ]
  },

  // ---- Electromagnetic induction ----
  {
    id: 'in-rail-force', chapter: 'induction', template: 'rail-force', params: { F: 2, B: 1, L: 0.5, R: 0.25, m: 0.5 }, vary: { F: [1, 3, 0.5], B: [0.8, 1.5, 0.1] },
    title: T('导体棒在恒力下的收尾速度', 'Terminal speed of a rod under a constant force', 'Endgeschwindigkeit eines Stabes unter konstanter Kraft'),
    stem: T('光滑水平导轨间距 L = {L} m，左端接电阻 R = {R} Ω，处在竖直向下 B = {B} T 的匀强磁场中。质量 {m} kg 的导体棒在水平恒力 F = {F} N 作用下由静止开始运动（导轨与棒的电阻不计）。', 'Smooth level rails L = {L} m apart, joined by a resistor R = {R} Ω, lie in a vertical uniform field B = {B} T. A {m} kg rod starts from rest under a constant horizontal force F = {F} N (rails and rod have no resistance).', 'Glatte waagerechte Schienen im Abstand L = {L} m, verbunden über R = {R} Ω, liegen in einem senkrechten homogenen Feld B = {B} T. Ein Stab ({m} kg) startet aus der Ruhe unter der konstanten Kraft F = {F} N (Schienen und Stab ohne Widerstand).'),
    questions: [
      num('v', T('导体棒最终的速度是多少？', 'What is the rod\'s final speed?', 'Wie groß ist die Endgeschwindigkeit des Stabes?'), { kind: 'end', id: 'rod.v' },
        { hint: T('安培力 B²L²v/R 增大到等于 F 时匀速', 'The magnetic drag B²L²v/R grows until it equals F', 'Die Bremskraft B²L²v/R wächst, bis sie F erreicht'), explain: T('v = FR/(B²L²)，时间常数 τ = mR/(B²L²)。', 'v = FR/(B²L²); time constant τ = mR/(B²L²).', 'v = FR/(B²L²); Zeitkonstante τ = mR/(B²L²).') }),
      num('I', T('最终回路中的电流是多少？', 'What is the final current?', 'Wie groß ist der Strom am Ende?'), { kind: 'end', id: 'loop.I' },
        { explain: T('I = BLv/R = F/(BL)。', 'I = BLv/R = F/(BL).', 'I = BLv/R = F/(BL).') })
    ]
  },
  {
    id: 'in-rail-coast', chapter: 'induction', template: 'rail-coast', params: { v0: 3, B: 1, L: 0.5, R: 0.25, m: 0.5 }, vary: { v0: [2, 4, 0.5], B: [0.8, 1.2, 0.1] },
    title: T('导体棒滑行减速', 'A rod coasting to rest', 'Ein Stab rollt aus'),
    stem: T('光滑水平导轨间距 L = {L} m，接电阻 R = {R} Ω，处在 B = {B} T 的竖直匀强磁场中。质量 {m} kg 的导体棒以 v₀ = {v0} m/s 的初速度开始滑行。', 'Smooth level rails L = {L} m apart with a resistor R = {R} Ω lie in a vertical field B = {B} T. A {m} kg rod starts sliding at v₀ = {v0} m/s.', 'Glatte waagerechte Schienen im Abstand L = {L} m mit R = {R} Ω liegen in einem senkrechten Feld B = {B} T. Ein Stab ({m} kg) gleitet mit v₀ = {v0} m/s los.'),
    questions: [
      num('v', T('开始滑行 1 s 后导体棒的速度是多少？', 'What is its speed after 1 s?', 'Wie schnell ist er nach 1 s?'), q('rod.v', 1),
        { hint: T('m dv/dt = −B²L²v/R：指数衰减', 'm dv/dt = −B²L²v/R: exponential decay', 'm dv/dt = −B²L²v/R: exponentieller Abfall'), explain: T('v = v₀e^(−t/τ)，τ = mR/(B²L²)。', 'v = v₀e^(−t/τ), τ = mR/(B²L²).', 'v = v₀e^(−t/τ), τ = mR/(B²L²).') }),
      num('Q', T('整个滑行过程电阻上产生的焦耳热是多少？', 'How much Joule heat is produced in all?', 'Wie viel Joulesche Wärme entsteht insgesamt?'), { kind: 'end', id: 'ledger.jouleHeat' },
        { explain: T('动能全部转化为焦耳热：Q = ½mv₀²。', 'All the kinetic energy becomes Joule heat: Q = ½mv₀².', 'Die gesamte kinetische Energie wird zu Joulescher Wärme: Q = ½mv₀².') })
    ]
  },
  {
    id: 'in-rail-fall', chapter: 'induction', template: 'rail-fall', params: { m: 0.1, B: 1, L: 0.5, R: 0.5 }, vary: { m: [0.05, 0.2, 0.05], R: [0.3, 0.8, 0.1] },
    title: T('竖直导轨上下落的导体棒', 'A rod falling along vertical rails', 'Ein Stab fällt an senkrechten Schienen'),
    stem: withG(T('竖直光滑导轨间距 L = {L} m，上端接电阻 R = {R} Ω，处在垂直于导轨平面、B = {B} T 的匀强磁场中。质量 {m} kg 的导体棒由静止释放。', 'Smooth vertical rails L = {L} m apart, joined at the top by R = {R} Ω, lie in a uniform field B = {B} T perpendicular to their plane. A {m} kg rod is released from rest.', 'Glatte senkrechte Schienen im Abstand L = {L} m, oben über R = {R} Ω verbunden, liegen in einem homogenen Feld B = {B} T senkrecht zu ihrer Ebene. Ein Stab ({m} kg) wird aus der Ruhe losgelassen.')),
    questions: [
      num('v', T('导体棒的收尾速度是多少？', 'What is the rod\'s terminal speed?', 'Wie groß ist die Endgeschwindigkeit?'), { kind: 'end', id: 'rod.v' },
        { explain: T('mg = B²L²v/R，v = mgR/(B²L²)。', 'mg = B²L²v/R, v = mgR/(B²L²).', 'mg = B²L²v/R, v = mgR/(B²L²).') }),
      num('emf', T('收尾时的感应电动势是多少？', 'What is the induced emf at terminal speed?', 'Wie groß ist die induzierte Spannung bei Endgeschwindigkeit?'), { kind: 'end', id: 'loop.emf' },
        { explain: T('ε = BLv。', 'ε = BLv.', 'ε = BLv.') })
    ]
  },

  // ---- Pressure and buoyancy ----
  {
    id: 'fl-floating', chapter: 'fluids', template: 'floating-block', params: { rhoB: 600, rho: 1000, d: 0.1, c: 10 }, vary: { rhoB: [400, 900, 50] },
    title: T('漂浮的木块', 'A floating block', 'Ein schwimmender Holzklotz'),
    stem: withG(T('20 cm × 10 cm × {d} m（厚度）的木块密度 ρ物 = {rhoB} kg/m³，放入密度 ρ液 = {rho} kg/m³ 的水中，静止时漂浮。', 'A 20 cm × 10 cm × {d} m (thickness) block of density {rhoB} kg/m³ is put into water of density {rho} kg/m³ and comes to float at rest.', 'Ein Holzklotz 20 cm × 10 cm × {d} m (Dicke) mit der Dichte {rhoB} kg/m³ wird in Wasser der Dichte {rho} kg/m³ gelegt und schwimmt schließlich ruhig.')),
    questions: [
      num('Fb', T('木块受到的浮力是多少？', 'What is the buoyant force on it?', 'Wie groß ist die Auftriebskraft?'), { kind: 'end', id: 'block.Fb' },
        { explain: T('漂浮：F浮 = G = ρ物Vg。', 'Floating: F_b = G = ρ_block·V·g.', 'Schwimmend: F_A = G = ρ_Körper·V·g.') }),
      num('V', T('木块浸在水中的体积是多少？', 'What volume of it is under water?', 'Welches Volumen liegt unter Wasser?'), { kind: 'end', id: 'block.Vsub' },
        { explain: T('V排/V = ρ物/ρ液。', 'V_sub/V = ρ_block/ρ_liquid.', 'V_ein/V = ρ_Körper/ρ_Flüssigkeit.') })
    ]
  },
  {
    id: 'fl-sinking', chapter: 'fluids', template: 'sinking-ball', params: { rhoB: 7800, rho: 1000, d: 0.1 }, vary: { rhoB: [2000, 8000, 500], rho: [800, 1200, 100] },
    title: T('在水中下沉的球', 'A ball sinking in water', 'Eine im Wasser sinkende Kugel'),
    stem: withG(T('密度 ρ物 = {rhoB} kg/m³ 的球浸没在密度 ρ液 = {rho} kg/m³ 的液体中由静止释放，不计液体阻力。', 'A ball of density {rhoB} kg/m³ is released from rest fully submerged in a liquid of density {rho} kg/m³; liquid drag is negligible.', 'Eine Kugel der Dichte {rhoB} kg/m³ wird vollständig untergetaucht in einer Flüssigkeit der Dichte {rho} kg/m³ aus der Ruhe losgelassen; kein Flüssigkeitswiderstand.')),
    questions: [
      num('a', T('球下沉的加速度是多少？', 'What is its acceleration as it sinks?', 'Wie groß ist die Beschleunigung beim Sinken?'), q('ball.a', 0.2),
        { explain: T('mg − ρ液Vg = ma，a = g(1 − ρ液/ρ物)。', 'mg − ρ_liquid·V·g = ma, a = g(1 − ρ_liquid/ρ_ball).', 'mg − ρ_Fl·V·g = ma, a = g(1 − ρ_Fl/ρ_Kugel).') })
    ]
  },
  {
    id: 'fl-weigh', chapter: 'fluids', template: 'weigh-in-water', params: { rhoB: 2700, rho: 1000, d: 0.1 }, vary: { rhoB: [2000, 8000, 500] }, duration: 10,
    title: T('称重法测浮力', 'Measuring buoyancy by weighing', 'Auftrieb durch Wägen messen'),
    stem: withG(T('边长 10 cm、厚 {d} m 的金属块（ρ物 = {rhoB} kg/m³）挂在弹簧测力计下，完全浸没在密度 ρ液 = {rho} kg/m³ 的水中静止。', 'A metal block 10 cm wide and high and {d} m thick (density {rhoB} kg/m³) hangs from a spring balance fully under water of density {rho} kg/m³ and comes to rest.', 'Ein Metallklotz (10 cm breit und hoch, {d} m dick, Dichte {rhoB} kg/m³) hängt an einer Federwaage vollständig unter Wasser (Dichte {rho} kg/m³) und kommt zur Ruhe.')),
    questions: [
      num('Fb', T('金属块受到的浮力是多少？', 'What is the buoyant force on the block?', 'Wie groß ist die Auftriebskraft auf den Klotz?'), q('block.Fb', 5),
        { explain: T('F浮 = ρ液gV排（浸没时 V排 = V）。', 'F_b = ρ_liquid·g·V_sub (fully submerged: V_sub = V).', 'F_A = ρ_Fl·g·V_ein (vollständig eingetaucht: V_ein = V).') }),
      num('F', T('弹簧测力计的示数是多少？', 'What does the spring balance read?', 'Was zeigt die Federwaage an?'), { kind: 'end', id: 'scale.F' },
        { explain: T('F示 = G − F浮 = (ρ物 − ρ液)gV。', 'Reading = G − F_b = (ρ_block − ρ_liquid)gV.', 'Anzeige = G − F_A = (ρ_Klotz − ρ_Fl)gV.') })
    ]
  },
  {
    id: 'fl-boat', chapter: 'fluids', template: 'loaded-boat', params: { m: 2, rho: 1000, d: 0.1, c: 30 }, vary: { m: [0.5, 4, 0.5] },
    title: T('船的载重', 'Loading a boat', 'Ein beladenes Boot'),
    stem: withG(T('质量 2.4 kg 的平底船漂浮在密度 ρ液 = {rho} kg/m³ 的水中，在船上放质量 m = {m} kg 的重物，船下沉后重新静止。', 'A flat boat of mass 2.4 kg floats in water of density {rho} kg/m³. A load of m = {m} kg is put on it; the boat sinks a little and comes to rest again.', 'Ein flaches Boot (2,4 kg) schwimmt in Wasser der Dichte {rho} kg/m³. Eine Last m = {m} kg wird daraufgestellt; das Boot sinkt etwas ein und kommt wieder zur Ruhe.')),
    questions: [
      num('Fb', T('船重新静止后受到的浮力是多少？', 'What is the buoyant force on the boat at rest again?', 'Wie groß ist die Auftriebskraft auf das Boot in Ruhe?'), { kind: 'end', id: 'boat.Fb' },
        { explain: T('整体漂浮：F浮 = (M + m)g。', 'The whole floats: F_b = (M + m)g.', 'Das Ganze schwimmt: F_A = (M + m)g.') }),
      num('V', T('船排开水的体积是多少？', 'What volume of water does the boat displace?', 'Welches Wasservolumen verdrängt das Boot?'), { kind: 'end', id: 'boat.Vsub' },
        { explain: T('V排 = (M + m)/ρ液。', 'V_sub = (M + m)/ρ_liquid.', 'V_ein = (M + m)/ρ_Fl.') })
    ]
  },
  {
    id: 'fl-rising', chapter: 'fluids', template: 'rising-block', params: { rhoB: 500, rho: 1000, d: 0.1 }, vary: { rhoB: [300, 800, 50] },
    title: T('水中释放的木块', 'A block released under water', 'Ein unter Wasser losgelassener Klotz'),
    stem: withG(T('密度 ρ物 = {rhoB} kg/m³ 的木块被按在密度 ρ液 = {rho} kg/m³ 的水中深处，然后由静止释放，不计水的阻力。', 'A block of density {rhoB} kg/m³ is held deep in water of density {rho} kg/m³ and released from rest; water drag is negligible.', 'Ein Klotz der Dichte {rhoB} kg/m³ wird tief im Wasser (Dichte {rho} kg/m³) festgehalten und aus der Ruhe losgelassen; kein Wasserwiderstand.')),
    questions: [
      num('a', T('释放瞬间木块的加速度是多少？', 'What is its acceleration at release?', 'Wie groß ist seine Beschleunigung beim Loslassen?'), q('block.a', 0.05),
        { explain: T('ρ液Vg − ρ物Vg = ρ物Va，a = g(ρ液/ρ物 − 1)。', 'ρ_liquid·V·g − ρ_block·V·g = ρ_block·V·a, a = g(ρ_liquid/ρ_block − 1).', 'ρ_Fl·V·g − ρ_Klotz·V·g = ρ_Klotz·V·a, a = g(ρ_Fl/ρ_Klotz − 1).') })
    ]
  },
  {
    id: 'fl-densities', chapter: 'fluids', template: 'densities', params: { rho: 1000, d: 0.1, c: 10 }, vary: { rho: [900, 1300, 100] },
    title: T('三种物体的沉浮', 'Sink or float', 'Sinken oder schwimmen'),
    stem: withG(T('16 cm × 12 cm × {d} m（厚度）的木块（600 kg/m³）、冰块（900 kg/m³）和铁块（7800 kg/m³）放入密度 ρ液 = {rho} kg/m³ 的液体中，最后都静止。', 'A wood block (600 kg/m³), an ice block (900 kg/m³) and an iron block (7800 kg/m³), each 16 cm × 12 cm × {d} m (thickness), are put into a liquid of density {rho} kg/m³ and come to rest.', 'Ein Holzklotz (600 kg/m³), ein Eisblock (900 kg/m³) und ein Eisenklotz (7800 kg/m³), je 16 cm × 12 cm × {d} m (Dicke), kommen in einer Flüssigkeit der Dichte {rho} kg/m³ zur Ruhe.')),
    questions: [
      num('Fb', T('铁块沉底后受到的浮力是多少？', 'What is the buoyant force on the iron block on the bottom?', 'Wie groß ist der Auftrieb auf den Eisenklotz am Boden?'), { kind: 'end', id: 'iron.Fb' },
        { explain: T('浸没：F浮 = ρ液gV。', 'Fully submerged: F_b = ρ_liquid·g·V.', 'Vollständig eingetaucht: F_A = ρ_Fl·g·V.') }),
      num('V', T('木块浸在液体中的体积是多少？', 'What volume of the wood is submerged?', 'Welches Holzvolumen ist eingetaucht?'), { kind: 'end', id: 'wood.Vsub' },
        { explain: T('漂浮：V排 = ρ木V/ρ液。', 'Floating: V_sub = ρ_wood·V/ρ_liquid.', 'Schwimmend: V_ein = ρ_Holz·V/ρ_Fl.') })
    ]
  }
]
