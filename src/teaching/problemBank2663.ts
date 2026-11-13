/**
 * 26.63 built-in problems (D234): eight on the templates of 26.63 — the rope that breaks at its tension limit and the
 * illuminating cases. Same rules as the earlier banks: the stem names the parameters, every answer is read from the
 * simulation, "another set of numbers" varies `vary`, and each question is checked against an independent closed form
 * in tests/teaching/problems2663.test.ts.
 */
import type { Tri } from '../i18n/tri'
import type { BuiltinProblem } from './problemBank'
import type { NumericQuestion, ProblemTarget } from './problems'

const T = (zh: string, en: string, de: string): Tri => ({ zh, en, de })
const num = (id: string, prompt: Tri, target: ProblemTarget, more: Partial<NumericQuestion> = {}): NumericQuestion => ({ id, type: 'numeric', prompt, target, ...more })
const G = T('g 取 {g} m/s²。', 'Take g = {g} m/s².', 'Nimm g = {g} m/s².')
const withG = (t: Tri): Tri => ({ zh: `${t.zh}${G.zh}`, en: `${t.en} ${G.en}`, de: `${t.de} ${G.de}` })

export const PROBLEMS_2663: BuiltinProblem[] = [
  {
    id: 'c-rope-break', chapter: 'circular', template: 'rope-break-pendulum', params: { L: 1, theta0: 60, m: 0.5, Tmax: 9, H: 2 }, vary: { Tmax: [7, 9.5, 0.5], theta0: [50, 70, 5] },
    title: T('摆线被拉断', 'The pendulum string breaks', 'Der Pendelfaden reißt'),
    stem: withG(T('长 L = {L} m 的轻绳一端固定在离地 {H} m 的悬点，另一端系质量 {m} kg 的小球（视为质点）。把小球拉到偏角 {theta0}° 处由静止释放。绳能承受的最大拉力为 {Tmax} N。', 'A light string of length L = {L} m hangs from a point {H} m above the floor and carries a {m} kg ball (a point). The ball is released from rest at {theta0}° from the vertical. The string bears at most {Tmax} N.', 'Ein leichter Faden der Länge L = {L} m hängt an einem Punkt {H} m über dem Boden und trägt eine Kugel (m = {m} kg, punktförmig). Sie wird bei {theta0}° Auslenkung losgelassen. Der Faden hält höchstens {Tmax} N aus.')),
    questions: [
      num('v', T('绳被拉断的瞬间，小球的速度是多少？', 'How fast is the ball at the instant the string breaks?', 'Wie schnell ist die Kugel, wenn der Faden reißt?'), { kind: 'atEvent', id: 'bob.v', event: 'break', side: 'before', body: null },
        { hint: T('偏角 φ 处：T − mg cos φ = mv²/L，v² = 2gL(cos φ − cos θ₀)', 'At the angle φ: T − mg cos φ = mv²/L and v² = 2gL(cos φ − cos θ₀)', 'Beim Winkel φ: T − mg cos φ = mv²/L und v² = 2gL(cos φ − cos θ₀)'), explain: T('两式消去 v²：T = mg(3cos φ − 2cos θ₀) = T_max，解出 cos φ，再代回 v² = 2gL(cos φ − cos θ₀)。', 'Eliminating v²: T = mg(3cos φ − 2cos θ₀) = T_max gives cos φ; then v² = 2gL(cos φ − cos θ₀).', 'v² eliminiert: T = mg(3cos φ − 2cos θ₀) = T_max liefert cos φ; dann v² = 2gL(cos φ − cos θ₀).') }),
      num('h', T('绳断时小球离地多高？', 'How high above the floor is the ball when the string breaks?', 'Wie hoch über dem Boden ist die Kugel, wenn der Faden reißt?'), { kind: 'atEvent', id: 'bob.y', event: 'break', side: 'before', body: null },
        { explain: T('h = H − L cos φ，cos φ = (T_max/mg + 2cos θ₀)/3。', 'h = H − L cos φ with cos φ = (T_max/mg + 2cos θ₀)/3.', 'h = H − L cos φ mit cos φ = (T_max/mg + 2cos θ₀)/3.') }),
      num('vLand', T('小球落地前瞬间的速度是多少？', 'How fast is the ball just before it lands?', 'Wie schnell ist die Kugel kurz vor der Landung?'), { kind: 'atEvent', id: 'bob.v', event: 'impact', side: 'before', body: 'bob' },
        { hint: T('绳的拉力不做功，绳断前后机械能都守恒', 'The tension does no work; mechanical energy is conserved before and after the break', 'Die Seilkraft verrichtet keine Arbeit; die mechanische Energie bleibt vor und nach dem Riss erhalten'), explain: T('从释放到落地：½mv² = mg(H − L cos θ₀)。', 'From release to landing: ½mv² = mg(H − L cos θ₀).', 'Vom Loslassen bis zur Landung: ½mv² = mg(H − L cos θ₀).'), tolerance: 0.03 })
    ]
  },
  {
    id: 'c-rope-circle', chapter: 'circular', template: 'rope-break-circle', params: { r: 0.5, v0: 1, m: 0.2, P: 0.4, Tmax: 3.6 }, vary: { Tmax: [2.5, 6.4, 0.3], P: [0.2, 0.8, 0.2] },
    title: T('越转越快，绳什么时候断', 'Whirled faster and faster: when does the string break?', 'Immer schneller im Kreis: Wann reißt die Schnur?'),
    stem: T('光滑水平桌面上，质量 {m} kg 的小球用长 {r} m 的轻绳系在钉子上做圆周运动，初速度 {v0} m/s。沿速度方向的推力 P = {P} N 使它不断加速。绳能承受的最大拉力为 {Tmax} N。', 'On a smooth horizontal table a {m} kg ball on a {r} m string moves in a circle about a nail, starting at {v0} m/s. A push P = {P} N along its velocity keeps speeding it up. The string bears at most {Tmax} N.', 'Auf einem glatten Tisch kreist eine Kugel (m = {m} kg) an einer {r} m langen Schnur um einen Nagel, anfangs mit {v0} m/s. Ein Schub P = {P} N in Richtung der Geschwindigkeit beschleunigt sie ständig. Die Schnur hält höchstens {Tmax} N aus.'),
    questions: [
      num('v', T('绳断时小球的速度是多少？', 'How fast is the ball when the string breaks?', 'Wie schnell ist die Kugel, wenn die Schnur reißt?'), { kind: 'atEvent', id: 'ball.v', event: 'break', side: 'before', body: null },
        { hint: T('绳的拉力提供向心力', 'The tension provides the centripetal force', 'Die Schnurkraft liefert die Zentripetalkraft'), explain: T('T_max = mv²/r，v = √(T_max·r/m)。', 'T_max = mv²/r, so v = √(T_max·r/m).', 'T_max = mv²/r, also v = √(T_max·r/m).') }),
      num('t', T('从开始到绳断经过多长时间？', 'How long after the start does the string break?', 'Wie lange nach dem Start reißt die Schnur?'), { kind: 'event', event: 'break', body: null },
        { hint: T('切向只有推力 P：速率均匀增大', 'Along the path only P acts: the speed grows evenly', 'Entlang der Bahn wirkt nur P: Die Geschwindigkeit wächst gleichmäßig'), explain: T('切向加速度 a = P/m，t = (v − v₀)m/P。', 'Tangential acceleration a = P/m, so t = (v − v₀)m/P.', 'Bahnbeschleunigung a = P/m, also t = (v − v₀)m/P.') })
    ]
  },
  {
    id: 'p-drop-throw', chapter: 'projectile', template: 'drop-vs-throw', params: { h: 1.25, v0: 3, m: 0.1 }, vary: { h: [0.8, 3.2, 0.2], v0: [2, 6, 0.5] },
    title: T('平抛与自由落体', 'Thrown and dropped', 'Geworfen und fallen gelassen'),
    stem: withG(T('小球 A 从离地 {h} m 高处由静止释放，同一时刻小球 B 从同一高度以 {v0} m/s 水平抛出（不计空气阻力）。', 'Ball A is released from rest {h} m above the floor; at the same instant ball B is thrown horizontally from the same height at {v0} m/s (no air resistance).', 'Kugel A wird aus {h} m Höhe fallen gelassen; im selben Augenblick wird Kugel B aus gleicher Höhe waagerecht mit {v0} m/s geworfen (ohne Luftwiderstand).')),
    questions: [
      num('t', T('A 经过多长时间落地？', 'After what time does A land?', 'Nach welcher Zeit landet A?'), { kind: 'event', event: 'impact', body: 'A' },
        { explain: T('h = ½gt²，t = √(2h/g)。B 的竖直运动与 A 相同，同时落地。', 'h = ½gt², so t = √(2h/g). B moves vertically just like A and lands at the same time.', 'h = ½gt², also t = √(2h/g). B bewegt sich senkrecht genau wie A und landet gleichzeitig.') }),
      num('x', T('B 落地时的水平位移是多少？', 'How far has B travelled horizontally when it lands?', 'Wie weit ist B waagerecht geflogen, wenn sie landet?'), { kind: 'atEvent', id: 'B.x', event: 'impact', side: 'before', body: 'B' },
        { hint: T('水平方向匀速', 'Uniform motion horizontally', 'Waagerecht gleichförmig'), explain: T('x = v₀t = v₀√(2h/g)。', 'x = v₀t = v₀√(2h/g).', 'x = v₀t = v₀√(2h/g).') })
    ]
  },
  {
    id: 'p-monkey', chapter: 'projectile', template: 'monkey-hunter', params: { d: 4, h: 3, v0: 10 }, vary: { d: [3, 8, 1], v0: [8, 20, 2] },
    title: T('猎人与猴子', 'The monkey and the hunter', 'Der Affe und der Jäger'),
    stem: withG(T('子弹以 {v0} m/s 的速度对准树上的猴子射出，猴子与枪口的水平距离为 {d} m、比枪口高 {h} m；子弹射出的同时猴子由静止下落（不计空气阻力，子弹与猴子都视为质点）。', 'A bullet is fired at {v0} m/s straight at a monkey in a tree, {d} m away horizontally and {h} m above the muzzle; the monkey lets go from rest at that instant (no air resistance; both are points).', 'Eine Kugel wird mit {v0} m/s genau auf einen Affen im Baum abgefeuert, {d} m entfernt und {h} m über der Mündung; im selben Augenblick lässt der Affe los (ohne Luftwiderstand; beide punktförmig).')),
    questions: [
      num('t', T('子弹经过多长时间击中猴子？', 'After what time does the bullet hit the monkey?', 'Nach welcher Zeit trifft die Kugel den Affen?'), { kind: 'event', event: 'impact', body: 'bullet' },
        { hint: T('以自由下落的猴子为参考系，子弹做匀速直线运动', 'Seen from the falling monkey, the bullet moves uniformly in a straight line', 'Vom fallenden Affen aus gesehen bewegt sich die Kugel geradlinig gleichförmig'), explain: T('两者相对加速度为零，相对速度为 v₀，相距 √(d² + h²)：t = √(d² + h²)/v₀。', 'Their relative acceleration is zero and the closing speed is v₀ over the distance √(d² + h²): t = √(d² + h²)/v₀.', 'Die Relativbeschleunigung ist null, die Annäherung erfolgt mit v₀ über √(d² + h²): t = √(d² + h²)/v₀.'), tolerance: 0.03 }),
      num('v', T('被击中前瞬间，猴子的速度是多少？', 'How fast is the monkey just before it is hit?', 'Wie schnell ist der Affe, kurz bevor er getroffen wird?'), { kind: 'atEvent', id: 'monkey.v', event: 'impact', side: 'before', body: 'monkey' },
        { explain: T('猴子自由下落：v = gt。', 'The monkey is in free fall: v = gt.', 'Der Affe fällt frei: v = gt.'), tolerance: 0.03 })
    ]
  },
  {
    id: 'f-ramp-pull', chapter: 'forces', template: 'ramp-pull', params: { m: 1, muS: 0.5, muK: 0.4, k: 2 }, vary: { muS: [0.4, 0.7, 0.1], k: [1, 4, 1], m: [1, 3, 0.5] },
    title: T('逐渐增大的拉力：什么时候滑动', 'A growing pull: when does it slide?', 'Wachsender Zug: Wann rutscht der Klotz?'),
    stem: withG(T('质量 {m} kg 的物块静止在水平面上，最大静摩擦因数 μs = {muS}、动摩擦因数 μk = {muK}。从 t = 0 起用水平拉力 F = kt 拉它，k = {k} N/s。', 'A {m} kg block rests on a floor with μs = {muS} and μk = {muK}. From t = 0 it is pulled horizontally with F = kt, k = {k} N/s.', 'Ein Klotz (m = {m} kg) ruht auf einer Fläche mit μs = {muS} und μk = {muK}. Ab t = 0 wird er waagerecht mit F = kt gezogen, k = {k} N/s.')),
    questions: [
      num('t', T('物块在什么时刻开始滑动？', 'At what time does the block start to slide?', 'Zu welcher Zeit beginnt der Klotz zu rutschen?'), { kind: 'event', event: 'slip', body: 'block' },
        { hint: T('滑动前静摩擦力等于拉力，最大为 μs·mg', 'Before sliding, static friction equals the pull, at most μs·mg', 'Vor dem Rutschen gleicht die Haftreibung dem Zug, höchstens μs·mg'), explain: T('kt₁ = μs·mg，t₁ = μs·mg/k。', 'kt₁ = μs·mg, so t₁ = μs·mg/k.', 'kt₁ = μs·mg, also t₁ = μs·mg/k.') }),
      num('a', T('刚开始滑动时物块的加速度是多少？', 'What is the block\'s acceleration just after it starts to slide?', 'Wie groß ist die Beschleunigung unmittelbar nach dem Losrutschen?'), { kind: 'atEvent', id: 'block.ax', event: 'slip', side: 'after', body: 'block' },
        { hint: T('摩擦力从 μs·mg 突变为 μk·mg', 'The friction drops from μs·mg to μk·mg', 'Die Reibung springt von μs·mg auf μk·mg'), explain: T('ma = kt₁ − μk·mg = (μs − μk)mg，a = (μs − μk)g。', 'ma = kt₁ − μk·mg = (μs − μk)mg, so a = (μs − μk)g.', 'ma = kt₁ − μk·mg = (μs − μk)mg, also a = (μs − μk)g.') })
    ]
  },
  {
    id: 'n-two-blocks', chapter: 'newton', template: 'two-blocks-push', params: { F: 6, mA: 2, mB: 1 }, vary: { F: [3, 12, 1.5], mA: [1, 4, 0.5], mB: [1, 3, 0.5] },
    title: T('推着两个物块', 'Pushing two blocks', 'Zwei Klötze schieben'),
    stem: T('光滑水平面上并排放着物块 A（{mA} kg）和 B（{mB} kg）。水平推力 F = {F} N 作用在 A 上，推着两物块一起运动。', 'Blocks A ({mA} kg) and B ({mB} kg) lie side by side on a smooth floor. A horizontal force F = {F} N pushes A, which pushes B along.', 'Die Klötze A ({mA} kg) und B ({mB} kg) liegen nebeneinander auf glatter Fläche. Eine waagerechte Kraft F = {F} N schiebt A, der B mitschiebt.'),
    questions: [
      num('a', T('两物块的加速度是多少？', 'What is the acceleration of the blocks?', 'Wie groß ist die Beschleunigung der Klötze?'), { kind: 'quantity', id: 'A.ax', t: 0.5 },
        { hint: T('把两物块看成一个整体', 'Treat the two blocks as one body', 'Betrachte beide Klötze als einen Körper'), explain: T('a = F/(m_A + m_B)。', 'a = F/(m_A + m_B).', 'a = F/(m_A + m_B).') }),
      num('N', T('A 对 B 的推力是多少？', 'How large is A\'s push on B?', 'Wie groß ist der Schub von A auf B?'), { kind: 'quantity', id: 'contact.A|B.N', t: 0.5 },
        { hint: T('只看 B：水平方向只受 A 的推力', 'Look at B alone: horizontally only A\'s push acts on it', 'Betrachte nur B: Waagerecht wirkt nur der Schub von A'), explain: T('N = m_B·a = F·m_B/(m_A + m_B)，小于 F。', 'N = m_B·a = F·m_B/(m_A + m_B), less than F.', 'N = m_B·a = F·m_B/(m_A + m_B), kleiner als F.') })
    ]
  },
  {
    id: 'n-fall-drag', chapter: 'newton', template: 'fall-two-masses', params: { h: 20, m1: 2, m2: 0.2, b: 0.5 }, vary: { m2: [0.1, 0.4, 0.1], b: [0.4, 1, 0.2] },
    title: T('有空气阻力的下落：终端速度', 'Falling with air resistance: terminal speed', 'Fall mit Luftwiderstand: Endgeschwindigkeit'),
    stem: withG(T('大小相同的两个小球（{m1} kg 和 {m2} kg）从 {h} m 高处同时由静止释放，受到的空气阻力都是 f = bv，b = {b} N·s/m。', 'Two balls of the same size ({m1} kg and {m2} kg) are released together from {h} m. Both feel the drag f = bv with b = {b} N·s/m.', 'Zwei gleich große Kugeln ({m1} kg und {m2} kg) werden gleichzeitig aus {h} m Höhe losgelassen. Beide erfahren den Widerstand f = bv mit b = {b} N·s/m.')),
    questions: [
      num('vt', T('轻球下落过程中能达到的最大速度是多少？', 'What is the largest speed the light ball reaches while falling?', 'Welche Höchstgeschwindigkeit erreicht die leichte Kugel beim Fallen?'), { kind: 'extreme', id: 'light.v', which: 'max' },
        { hint: T('速度最大时加速度为零', 'At the largest speed the acceleration is zero', 'Bei der Höchstgeschwindigkeit ist die Beschleunigung null'), explain: T('mg = bv，终端速度 v = mg/b。重球的终端速度大得多，所以先落地。', 'mg = bv gives the terminal speed v = mg/b. The heavy ball\'s terminal speed is much larger, so it lands first.', 'mg = bv ergibt die Endgeschwindigkeit v = mg/b. Die der schweren Kugel ist viel größer, deshalb landet sie zuerst.') }),
      num('a', T('释放后 0.2 s 时轻球的加速度是多少？', 'What is the light ball\'s acceleration 0.2 s after release?', 'Wie groß ist die Beschleunigung der leichten Kugel 0,2 s nach dem Loslassen?'), { kind: 'quantity', id: 'light.a', t: 0.2 },
        { hint: T('v(t) = (mg/b)(1 − e^(−bt/m))', 'v(t) = (mg/b)(1 − e^(−bt/m))', 'v(t) = (mg/b)(1 − e^(−bt/m))'), explain: T('a = g − bv/m = g·e^(−bt/m)。', 'a = g − bv/m = g·e^(−bt/m).', 'a = g − bv/m = g·e^(−bt/m).') })
    ]
  },
  {
    id: 'm-big-small', chapter: 'momentum', template: 'collision-1d', params: { m1: 5, m2: 0.5, v0: 2, e: 1 }, vary: { m1: [3, 8, 1], v0: [1, 4, 0.5] },
    title: T('大球撞小球：冲量一样大', 'A big ball hits a small one: equal impulses', 'Große Kugel trifft kleine: gleiche Kraftstöße'),
    stem: T('光滑水平面上，质量 {m1} kg 的球 A 以 {v0} m/s 正碰静止的质量 {m2} kg 的球 B，碰撞是弹性的。', 'On a smooth floor ball A ({m1} kg) moving at {v0} m/s hits ball B ({m2} kg) at rest head-on; the collision is elastic.', 'Auf glatter Fläche trifft Kugel A ({m1} kg) mit {v0} m/s zentral auf die ruhende Kugel B ({m2} kg); der Stoß ist elastisch.'),
    questions: [
      num('vB', T('碰后 B 的速度是多少？', 'What is B\'s velocity after the impact?', 'Wie schnell ist B nach dem Stoß?'), { kind: 'atEvent', id: 'B.vx', event: 'impact', side: 'after', body: 'B' },
        { explain: T('动量守恒与动能守恒：v_B = 2m₁v₀/(m₁ + m₂)。', 'Momentum and kinetic energy are conserved: v_B = 2m₁v₀/(m₁ + m₂).', 'Impuls und kinetische Energie bleiben erhalten: v_B = 2m₁v₀/(m₁ + m₂).') }),
      num('I', T('碰撞中 B 获得的动量（冲量的大小）是多少？', 'How much momentum does B gain in the impact (the size of the impulse)?', 'Wie viel Impuls gewinnt B beim Stoß (Betrag des Kraftstoßes)?'), { kind: 'atEvent', id: 'B.px', event: 'impact', side: 'after', body: 'B' },
        { hint: T('A 失去的动量与 B 获得的动量大小相等', 'A loses exactly the momentum B gains', 'A verliert genau den Impuls, den B gewinnt'), explain: T('I = m₂v_B = 2m₁m₂v₀/(m₁ + m₂)；A 受到的冲量大小相同、方向相反（牛顿第三定律）。', 'I = m₂v_B = 2m₁m₂v₀/(m₁ + m₂); the impulse on A has the same size and the opposite direction (Newton\'s third law).', 'I = m₂v_B = 2m₁m₂v₀/(m₁ + m₂); der Kraftstoß auf A ist gleich groß und entgegengesetzt (drittes Newtonsches Gesetz).') })
    ]
  }
]
