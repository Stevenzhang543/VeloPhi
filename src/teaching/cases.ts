/**
 * Illuminating cases (26.63, D234): small scenes whose outcome contradicts a common belief, indexed by the belief — the
 * "misconception index" of the library and the question bank of the class tally (predict, commit, run, discuss). Each
 * case names what many students think, what happens and why, what to look at, the template that shows it and one
 * multiple-choice question whose right option the simulation decides. Pure data, trilingual; the template and its
 * closed form are checked in tests/cases2663.test.ts and tests/templates2663.test.ts.
 *
 * Sources of the beliefs: the Force Concept Inventory literature and the classroom research summarised in
 * docs/research/2663/painpoints.md (motion needs a force, heavier falls faster, the larger body pushes harder, static
 * friction is always μN, a released body flies outward).
 */
import type { Tri } from '../i18n/tri'
import { T } from '../content/models/types'

export type CaseTopic = 'motion' | 'force' | 'circular' | 'momentum' | 'rotation' | 'oscillation' | 'fluid'
export const CASE_TOPICS: Array<{ id: CaseTopic; label: Tri }> = [
  { id: 'motion', label: T('运动与抛体', 'Motion and projectiles', 'Bewegung und Würfe') },
  { id: 'force', label: T('力与牛顿定律', 'Forces and Newton\'s laws', 'Kräfte und Newtons Gesetze') },
  { id: 'circular', label: T('圆周运动', 'Circular motion', 'Kreisbewegung') },
  { id: 'momentum', label: T('动量与碰撞', 'Momentum and collisions', 'Impuls und Stöße') },
  { id: 'rotation', label: T('转动', 'Rotation', 'Rotation') },
  { id: 'oscillation', label: T('振动', 'Oscillations', 'Schwingungen') },
  { id: 'fluid', label: T('浮力', 'Buoyancy', 'Auftrieb') }
]

export interface TeachingCase {
  id: string
  topic: CaseTopic
  title: Tri
  /** What many students think. */
  belief: Tri
  /** What happens, and why. */
  physics: Tri
  /** What to look at in the simulation. */
  watch: Tri
  template: string
  values?: Record<string, number>
  question: Tri
  options: Tri[]
  /** Index of the right option. */
  answer: number
  /** Quantities to put in the curves. */
  chart?: string[]
}

export const CASES: TeachingCase[] = [
  {
    id: 'case-heavy-light', topic: 'motion',
    title: T('重的物体下落得更快吗？', 'Do heavier things fall faster?', 'Fallen schwere Körper schneller?'),
    belief: T('越重的物体下落越快，重球先落地。', 'The heavier a body, the faster it falls; the heavy ball lands first.', 'Je schwerer ein Körper, desto schneller fällt er; die schwere Kugel landet zuerst.'),
    physics: T('不计空气阻力时，重力与质量成正比，加速度 a = mg/m = g 与质量无关，两球同时落地。', 'Without air resistance gravity is proportional to mass, so a = mg/m = g for every mass: both land together.', 'Ohne Luftwiderstand ist die Gewichtskraft proportional zur Masse, also a = mg/m = g für jede Masse: Beide landen gleichzeitig.'),
    watch: T('两球的高度曲线完全重合；再把阻力系数 b 改成 0.5 N·s/m 看看有什么不同。', 'The two height curves coincide; then set the drag coefficient b to 0.5 N·s/m and compare.', 'Die beiden Höhenkurven fallen zusammen; setze dann den Widerstandsbeiwert b auf 0,5 N·s/m und vergleiche.'),
    template: 'fall-two-masses', values: { h: 2, m1: 2, m2: 0.2, b: 0 },
    question: T('2 kg 的球和 0.2 kg 的球从同一高度同时释放（不计空气阻力），谁先落地？', 'A 2 kg ball and a 0.2 kg ball are released together from the same height (no air resistance). Which lands first?', 'Eine 2-kg-Kugel und eine 0,2-kg-Kugel werden gleichzeitig aus gleicher Höhe losgelassen (ohne Luftwiderstand). Welche landet zuerst?'),
    options: [T('重球', 'The heavy ball', 'Die schwere Kugel'), T('轻球', 'The light ball', 'Die leichte Kugel'), T('同时落地', 'Both together', 'Beide gleichzeitig')],
    answer: 2, chart: ['heavy.y', 'light.y']
  },
  {
    id: 'case-heavy-light-air', topic: 'motion',
    title: T('有空气阻力时，谁先落地？', 'With air resistance, which lands first?', 'Mit Luftwiderstand: Wer landet zuerst?'),
    belief: T('既然真空中同时落地，有空气时也一样。', 'They land together in a vacuum, so they do in air as well.', 'Im Vakuum landen sie gleichzeitig, also auch in Luft.'),
    physics: T('大小相同的两球在同样速度下受到同样的阻力，但阻力引起的减速 bv/m 对轻球更大：a = g − bv/m，重球先落地。', 'Two balls of the same size feel the same drag at the same speed, but the deceleration bv/m it causes is larger for the light one: a = g − bv/m, so the heavy ball lands first.', 'Zwei gleich große Kugeln erfahren bei gleicher Geschwindigkeit denselben Widerstand, aber die Verzögerung bv/m ist für die leichte größer: a = g − bv/m, die schwere landet zuerst.'),
    watch: T('轻球的速度很快接近终端速度 mg/b，重球仍在加速。', 'The light ball soon approaches its terminal speed mg/b while the heavy one keeps accelerating.', 'Die leichte Kugel nähert sich bald ihrer Endgeschwindigkeit mg/b, die schwere beschleunigt weiter.'),
    template: 'fall-two-masses', values: { h: 5, m1: 2, m2: 0.2, b: 0.5 },
    question: T('两球大小相同，受到的空气阻力都是 f = bv。从同一高度同时释放，谁先落地？', 'Both balls have the same size and feel the drag f = bv. Released together from the same height, which lands first?', 'Beide Kugeln sind gleich groß und erfahren den Widerstand f = bv. Gleichzeitig aus gleicher Höhe losgelassen: Welche landet zuerst?'),
    options: [T('重球', 'The heavy ball', 'Die schwere Kugel'), T('轻球', 'The light ball', 'Die leichte Kugel'), T('同时落地', 'Both together', 'Beide gleichzeitig')],
    answer: 0, chart: ['heavy.vy', 'light.vy']
  },
  {
    id: 'case-drop-throw', topic: 'motion',
    title: T('平抛的球比自由下落的球晚落地吗？', 'Does a ball thrown sideways land later than a dropped one?', 'Landet eine waagerecht geworfene Kugel später als eine fallen gelassene?'),
    belief: T('水平抛出的球飞得更远，所以在空中的时间更长。', 'The thrown ball travels further, so it stays in the air longer.', 'Die geworfene Kugel fliegt weiter, also bleibt sie länger in der Luft.'),
    physics: T('水平方向和竖直方向的运动互不影响：两球竖直方向都是自由落体，任何时刻高度相同，同时落地。', 'Horizontal and vertical motion do not affect each other: both balls are in free fall vertically, at the same height at every instant, and land together.', 'Waagerechte und senkrechte Bewegung beeinflussen sich nicht: Beide Kugeln fallen senkrecht frei, sind stets auf gleicher Höhe und landen gleichzeitig.'),
    watch: T('打开频闪：每一次曝光两球都在同一条水平线上。', 'Switch on the strobe: in every exposure the two balls are on the same horizontal line.', 'Schalte das Stroboskop ein: In jeder Aufnahme liegen die beiden Kugeln auf derselben Waagerechten.'),
    template: 'drop-vs-throw', values: { h: 1.25, v0: 3 },
    question: T('A 球自由下落，B 球同时从同一高度水平抛出，谁先落地？', 'Ball A is dropped; ball B is thrown horizontally from the same height at the same instant. Which lands first?', 'Kugel A wird fallen gelassen, Kugel B gleichzeitig aus gleicher Höhe waagerecht geworfen. Welche landet zuerst?'),
    options: [T('A 先落地', 'A first', 'A zuerst'), T('B 先落地', 'B first', 'B zuerst'), T('同时落地', 'Both together', 'Beide gleichzeitig')],
    answer: 2, chart: ['A.y', 'B.y']
  },
  {
    id: 'case-monkey', topic: 'motion',
    title: T('猎人该瞄准哪里？', 'Where should the hunter aim?', 'Wohin soll der Jäger zielen?'),
    belief: T('猴子会下落，所以要瞄准它的下方。', 'The monkey will fall, so aim below it.', 'Der Affe fällt, also muss man unter ihn zielen.'),
    physics: T('子弹和猴子都在重力下比“没有重力时的位置”多下落 ½gt²，下落得一样多：直接瞄准猴子就一定击中，与子弹速度无关。', 'Bullet and monkey both fall ½gt² below where they would be without gravity — the same amount: aiming straight at the monkey always hits, whatever the bullet\'s speed.', 'Kugel und Affe fallen beide um ½gt² unter die Lage ohne Schwerkraft — gleich viel: Direkt auf den Affen gezielt, trifft man immer, unabhängig von der Geschwindigkeit.'),
    watch: T('改变子弹速度 v₀ 再运行：击中的位置变了，但总能击中。', 'Change the bullet\'s speed v₀ and run again: the place of the hit changes, but it always hits.', 'Ändere die Geschwindigkeit v₀ und starte erneut: Der Treffpunkt ändert sich, aber getroffen wird immer.'),
    template: 'monkey-hunter', values: { d: 4, h: 3, v0: 10 },
    question: T('子弹射出的同时猴子松手下落。要击中猴子，枪口应该对准哪里？', 'The monkey lets go at the instant the bullet is fired. Where must the gun point to hit it?', 'Der Affe lässt los, sobald geschossen wird. Wohin muss das Gewehr zeigen, um ihn zu treffen?'),
    options: [T('猴子的上方', 'Above the monkey', 'Über den Affen'), T('正对猴子', 'Straight at the monkey', 'Genau auf den Affen'), T('猴子的下方', 'Below the monkey', 'Unter den Affen')],
    answer: 1, chart: ['bullet.y', 'monkey.y']
  },
  {
    id: 'case-top-acceleration', topic: 'motion',
    title: T('斜抛到最高点时加速度是零吗？', 'Is the acceleration zero at the top of a throw?', 'Ist die Beschleunigung im höchsten Punkt eines Wurfs null?'),
    belief: T('最高点速度（的竖直分量）为零，所以加速度也是零。', 'At the top the (vertical) velocity is zero, so the acceleration is zero too.', 'Im höchsten Punkt ist die (senkrechte) Geschwindigkeit null, also auch die Beschleunigung.'),
    physics: T('加速度是速度变化的快慢，不是速度本身。整个飞行过程中小球只受重力，加速度始终是 g，方向竖直向下，最高点也不例外。', 'Acceleration is the rate of change of velocity, not the velocity. Throughout the flight only gravity acts, so the acceleration is g downward all the time — at the top as well.', 'Beschleunigung ist die Änderungsrate der Geschwindigkeit, nicht die Geschwindigkeit. Während des ganzen Flugs wirkt nur die Schwerkraft, die Beschleunigung ist stets g nach unten — auch im höchsten Punkt.'),
    watch: T('打开“加速度”矢量：箭头在全程长度和方向都不变。', 'Switch on the acceleration vector: its length and direction never change.', 'Schalte den Beschleunigungsvektor ein: Länge und Richtung ändern sich nie.'),
    template: 'projectile', values: { v0: 10, alpha: 60, h: 0 },
    question: T('斜抛的小球到达最高点的瞬间，它的加速度是多少？', 'At the instant a thrown ball is at its highest point, what is its acceleration?', 'Wie groß ist die Beschleunigung einer geworfenen Kugel im höchsten Punkt?'),
    options: [T('零', 'Zero', 'Null'), T('g，竖直向下', 'g, downward', 'g, nach unten'), T('g，沿水平方向', 'g, horizontal', 'g, waagerecht')],
    answer: 1, chart: ['ball.vy', 'ball.ay']
  },
  {
    id: 'case-motion-needs-force', topic: 'force',
    title: T('没有推力，运动的物体会停下吗？', 'Without a push, does a moving body stop?', 'Bleibt ein bewegter Körper ohne Antrieb stehen?'),
    belief: T('运动需要力来维持；不再推它，它就会慢下来并停住。', 'Motion needs a force to keep going; stop pushing and it slows down and stops.', 'Bewegung braucht eine Kraft; hört man auf zu schieben, wird der Körper langsamer und bleibt stehen.'),
    physics: T('力改变运动，不是维持运动。光滑水平面上合力为零，物块保持原来的速度一直运动（牛顿第一定律）；平时看到物体停下，是因为有摩擦力。', 'Forces change motion; they do not keep it going. On a smooth floor the net force is zero and the block keeps its velocity (Newton\'s first law); things stop in everyday life because of friction.', 'Kräfte ändern die Bewegung, sie erhalten sie nicht. Auf glatter Fläche ist die Gesamtkraft null, der Klotz behält seine Geschwindigkeit (erstes Newtonsches Gesetz); im Alltag hält die Reibung die Dinge an.'),
    watch: T('速度曲线是一条水平线，位移随时间均匀增加。', 'The velocity curve is a horizontal line; the displacement grows evenly with time.', 'Die Geschwindigkeitskurve ist eine waagerechte Gerade; der Weg wächst gleichmäßig mit der Zeit.'),
    template: 'uniform-motion', values: { v: 2, m: 1 },
    question: T('光滑水平面上的物块已经以 2 m/s 运动，此后没有任何水平方向的力。它会怎样？', 'A block already moves at 2 m/s on a smooth floor; from now on no horizontal force acts. What happens?', 'Ein Klotz bewegt sich auf glatter Fläche mit 2 m/s; von nun an wirkt keine waagerechte Kraft. Was passiert?'),
    options: [T('逐渐慢下来，最后停住', 'It slows down and stops', 'Er wird langsamer und bleibt stehen'), T('一直以 2 m/s 运动', 'It keeps moving at 2 m/s', 'Er bewegt sich weiter mit 2 m/s'), T('越来越快', 'It speeds up', 'Er wird schneller')],
    answer: 1, chart: ['block.vx']
  },
  {
    id: 'case-static-friction', topic: 'force',
    title: T('静摩擦力总等于 μN 吗？', 'Is static friction always μN?', 'Ist die Haftreibung immer μN?'),
    belief: T('只要有摩擦，摩擦力就是 μN。', 'Wherever there is friction, its size is μN.', 'Wo Reibung wirkt, ist sie μN groß.'),
    physics: T('μsN 只是静摩擦力的上限。物块不动时，静摩擦力正好与拉力平衡：拉力多大它就多大；拉力超过 μsN 物块才开始滑动，此后是滑动摩擦力 μkN。', 'μsN is only the upper limit of static friction. While the block stays, static friction just balances the pull — as large as the pull; only when the pull exceeds μsN does the block slide, and then kinetic friction μkN acts.', 'μsN ist nur die Obergrenze der Haftreibung. Solange der Klotz ruht, gleicht die Haftreibung den Zug genau aus; erst wenn der Zug μsN übersteigt, rutscht er, und dann wirkt die Gleitreibung μkN.'),
    watch: T('摩擦力曲线先沿着拉力 F = kt 上升，在开始滑动的瞬间掉到 μk·mg。', 'The friction curve first rises with the pull F = kt, then drops to μk·mg at the instant sliding starts.', 'Die Reibungskurve steigt zuerst mit dem Zug F = kt und fällt beim Losrutschen auf μk·mg.'),
    template: 'ramp-pull', values: { m: 1, muS: 0.5, muK: 0.4, k: 2 },
    question: T('1 kg 的物块放在 μs = 0.5 的水平面上，用 2 N 的水平力拉它（没拉动）。此时摩擦力多大？（g = 9.8 m/s²）', 'A 1 kg block rests on a floor with μs = 0.5 and is pulled with 2 N (it does not move). How large is the friction? (g = 9.8 m/s²)', 'Ein 1-kg-Klotz liegt auf einer Fläche mit μs = 0,5 und wird mit 2 N gezogen (er bewegt sich nicht). Wie groß ist die Reibung? (g = 9,8 m/s²)'),
    options: [T('4.9 N', '4.9 N', '4,9 N'), T('2 N', '2 N', '2 N'), T('0', '0', '0')],
    answer: 1, chart: ['pull.F', 'contact.block|ground.f']
  },
  {
    id: 'case-push-through', topic: 'force',
    title: T('推力会原样传给后面的物块吗？', 'Is a push handed on unchanged to the next block?', 'Wird ein Schub unverändert an den nächsten Klotz weitergegeben?'),
    belief: T('F 推 A，A 就用同样大的 F 推 B。', 'F pushes A, so A pushes B with the same F.', 'F schiebt A, also schiebt A den Klotz B mit demselben F.'),
    physics: T('两物块以同一加速度 a = F/(m_A + m_B) 运动。A 对 B 的推力只需让 B 获得这个加速度：N = m_B·a = F·m_B/(m_A + m_B) < F；其余的力用来加速 A 自己。', 'Both blocks move with a = F/(m_A + m_B). A\'s push on B only has to give B this acceleration: N = m_B·a = F·m_B/(m_A + m_B) < F; the rest accelerates A itself.', 'Beide Klötze haben a = F/(m_A + m_B). A muss B nur diese Beschleunigung geben: N = m_B·a = F·m_B/(m_A + m_B) < F; der Rest beschleunigt A selbst.'),
    watch: T('选中 B 看受力：水平方向只有 A 的推力，大小是 2 N，不是 6 N。', 'Select B and look at its forces: horizontally only A\'s push acts — 2 N, not 6 N.', 'Wähle B und sieh dir die Kräfte an: Waagerecht wirkt nur der Schub von A — 2 N, nicht 6 N.'),
    template: 'two-blocks-push', values: { F: 6, mA: 2, mB: 1 },
    question: T('光滑水平面上，6 N 的力推 A（2 kg），A 推着 B（1 kg）一起运动。A 对 B 的推力多大？', 'On a smooth floor 6 N pushes A (2 kg), and A pushes B (1 kg) along. How large is A\'s push on B?', 'Auf glatter Fläche schieben 6 N den Klotz A (2 kg), der B (1 kg) mitschiebt. Wie groß ist der Schub von A auf B?'),
    options: [T('6 N', '6 N', '6 N'), T('4 N', '4 N', '4 N'), T('2 N', '2 N', '2 N')],
    answer: 2, chart: ['contact.A|B.N', 'A.ax']
  },
  {
    id: 'case-atwood-tension', topic: 'force',
    title: T('绳的拉力等于所挂物体的重力吗？', 'Does the rope pull with the weight of what hangs on it?', 'Zieht das Seil mit dem Gewicht dessen, was daran hängt?'),
    belief: T('绳子吊着重物，拉力就等于重物的重力。', 'A rope that carries a load pulls with the load\'s weight.', 'Ein Seil, das eine Last trägt, zieht mit deren Gewicht.'),
    physics: T('只有物体不加速时拉力才等于重力。阿特伍德机中重的一侧加速下降：m₂g − T = m₂a，所以 T < m₂g；轻的一侧加速上升：T > m₁g。T = 2m₁m₂g/(m₁ + m₂)。', 'Tension equals weight only when the body does not accelerate. In Atwood\'s machine the heavy side accelerates downward: m₂g − T = m₂a, so T < m₂g; the light side accelerates upward: T > m₁g. T = 2m₁m₂g/(m₁ + m₂).', 'Die Seilkraft gleicht dem Gewicht nur ohne Beschleunigung. Bei der Atwood-Maschine beschleunigt die schwere Seite nach unten: m₂g − T = m₂a, also T < m₂g; die leichte nach oben: T > m₁g. T = 2m₁m₂g/(m₁ + m₂).'),
    watch: T('监视里的绳拉力 T 介于两个重力之间。', 'The rope tension T in the watch panel lies between the two weights.', 'Die Seilkraft T in der Anzeige liegt zwischen den beiden Gewichten.'),
    template: 'atwood', values: { m1: 1, m2: 1.5 },
    question: T('阿特伍德机两侧挂 1 kg 和 1.5 kg 的物块，释放后绳的拉力 T 满足：', 'Atwood\'s machine carries 1 kg and 1.5 kg. After release the rope tension T is:', 'An der Atwood-Maschine hängen 1 kg und 1,5 kg. Nach dem Loslassen gilt für die Seilkraft T:'),
    options: [T('T = 1.5 kg 物块的重力', 'T = the weight of the 1.5 kg block', 'T = Gewicht des 1,5-kg-Klotzes'), T('T = 1 kg 物块的重力', 'T = the weight of the 1 kg block', 'T = Gewicht des 1-kg-Klotzes'), T('T 介于两个重力之间', 'T lies between the two weights', 'T liegt zwischen den beiden Gewichten')],
    answer: 2, chart: ['rope.T']
  },
  {
    id: 'case-elevator', topic: 'force',
    title: T('超重是重力变大了吗？', 'Does "overweight" mean gravity got larger?', 'Heißt „Überlast“, dass die Schwerkraft größer wurde?'),
    belief: T('电梯加速上升时人变重了，是因为重力变大。', 'In a lift accelerating upward you get heavier because gravity grows.', 'Im aufwärts beschleunigenden Aufzug wird man schwerer, weil die Schwerkraft wächst.'),
    physics: T('重力 mg 没有变。物体随电梯向上加速，需要向上的合力：支持力（秤的读数）F − mg = ma，所以读数 F = m(g + a) 大于重力。', 'The weight mg does not change. To accelerate upward with the lift the body needs a net upward force: F − mg = ma, so the scale reads F = m(g + a), more than the weight.', 'Das Gewicht mg ändert sich nicht. Um mit dem Aufzug nach oben zu beschleunigen, braucht der Körper eine Kraft nach oben: F − mg = ma, die Waage zeigt F = m(g + a), mehr als das Gewicht.'),
    watch: T('弹簧秤的读数稳定后大于 mg，而重力箭头的长度不变。', 'Once steady, the spring balance reads more than mg, while the weight arrow keeps its length.', 'Nach dem Einschwingen zeigt die Federwaage mehr als mg, der Gewichtspfeil bleibt gleich lang.'),
    template: 'elevator',
    question: T('电梯加速上升时，挂着物体的弹簧秤读数与物体的重力相比：', 'While the lift accelerates upward, the spring balance carrying the load reads, compared with the load\'s weight:', 'Während der Aufzug nach oben beschleunigt, zeigt die Federwaage im Vergleich zum Gewicht der Last:'),
    options: [T('更大', 'More', 'Mehr'), T('相等', 'The same', 'Gleich viel'), T('更小', 'Less', 'Weniger')],
    answer: 0, chart: ['scale.F']
  },
  {
    id: 'case-string-breaks', topic: 'circular',
    title: T('绳断了，小球往哪里飞？', 'The string breaks — where does the ball go?', 'Die Schnur reißt — wohin fliegt die Kugel?'),
    belief: T('有“离心力”把小球沿半径向外甩出去；或者小球会继续拐一会儿弯。', 'A "centrifugal force" throws the ball outward along the radius; or it keeps curving for a while.', 'Eine „Fliehkraft“ schleudert die Kugel radial nach außen; oder sie fliegt noch eine Weile im Bogen.'),
    physics: T('做圆周运动是因为绳的拉力不断改变速度的方向。绳断后水平方向不再有改变方向的力，小球保持断开瞬间的速度，沿切线做直线运动。', 'The ball moves in a circle because the string keeps changing the direction of its velocity. Once the string has broken nothing changes the direction any more: the ball keeps the velocity of that instant and moves along the tangent, in a straight line.', 'Die Kugel läuft im Kreis, weil die Schnur ständig die Richtung der Geschwindigkeit ändert. Nach dem Riss ändert nichts mehr die Richtung: Die Kugel behält die Geschwindigkeit dieses Augenblicks und fliegt geradlinig entlang der Tangente.'),
    watch: T('轨迹在断开处从圆弧变成一条与圆相切的直线。', 'At the break the path changes from the circle to a straight line tangent to it.', 'Am Riss geht die Bahn vom Kreis in eine Gerade über, die den Kreis berührt.'),
    template: 'rope-break-circle',
    question: T('光滑桌面上（俯视），拴着小球转动的绳突然断了。之后小球的轨迹是：', 'On a smooth table (top view) the string that whirls a ball suddenly breaks. The ball\'s path afterwards is:', 'Auf einem glatten Tisch (Draufsicht) reißt plötzlich die Schnur, an der eine Kugel kreist. Die Bahn danach ist:'),
    options: [T('沿半径向外的直线', 'A straight line outward along the radius', 'Eine Gerade radial nach außen'), T('沿切线的直线', 'A straight line along the tangent', 'Eine Gerade entlang der Tangente'), T('继续弯曲，逐渐变直', 'Still curved, straightening gradually', 'Weiter gekrümmt, allmählich gerade')],
    answer: 1, chart: ['rope.T', 'ball.v']
  },
  {
    id: 'case-top-of-loop', topic: 'circular',
    title: T('绳拴小球过最高点，速度可以是零吗？', 'Can a ball on a string pass the top with zero speed?', 'Kann eine Kugel am Seil den höchsten Punkt mit Geschwindigkeit null passieren?'),
    belief: T('只要能量够到最高点，在最高点速度为零也能通过。', 'If the energy is enough to reach the top, passing it with zero speed is fine.', 'Reicht die Energie bis ganz oben, kann die Kugel den Punkt auch mit Geschwindigkeit null passieren.'),
    physics: T('绳只能拉不能推。在最高点重力和拉力都指向圆心：mg + T = mv²/L，T ≥ 0 要求 v ≥ √(gL)。速度更小时绳在到达最高点之前就松了，小球做抛体运动落下。', 'A string can pull but not push. At the top weight and tension both point to the centre: mg + T = mv²/L, and T ≥ 0 needs v ≥ √(gL). Slower, and the string goes slack before the top; the ball falls as a projectile.', 'Ein Seil kann ziehen, nicht drücken. Oben zeigen Gewicht und Seilkraft zum Mittelpunkt: mg + T = mv²/L, und T ≥ 0 verlangt v ≥ √(gL). Ist die Kugel langsamer, wird das Seil vor dem höchsten Punkt schlaff und sie fällt als Wurf.'),
    watch: T('把最低点速度 v₀ 调到 4.5 m/s（小于 √(5gL) ≈ 4.95 m/s）：出现“绳松弛”事件。', 'Set the speed at the bottom v₀ to 4.5 m/s (less than √(5gL) ≈ 4.95 m/s): a "rope goes slack" event appears.', 'Setze die Geschwindigkeit unten v₀ auf 4,5 m/s (kleiner als √(5gL) ≈ 4,95 m/s): Es erscheint das Ereignis „Seil wird schlaff“.'),
    template: 'vertical-circle-rope', values: { L: 0.5, v0: 4.5, m: 0.2 },
    question: T('长 L 的绳拴着小球在竖直面内做圆周运动，恰好能通过最高点时，那里的速度是：', 'A ball on a string of length L moves in a vertical circle. When it only just passes the top, its speed there is:', 'Eine Kugel am Seil der Länge L läuft auf einem senkrechten Kreis. Wenn sie den höchsten Punkt gerade noch passiert, ist ihre Geschwindigkeit dort:'),
    options: [T('0', '0', '0'), T('√(gL)', '√(gL)', '√(gL)'), T('√(2gL)', '√(2gL)', '√(2gL)')],
    answer: 1, chart: ['rope.T', 'ball.v']
  },
  {
    id: 'case-third-law', topic: 'momentum',
    title: T('大球撞小球，谁受的力大？', 'A big ball hits a small one — which feels the larger force?', 'Eine große Kugel trifft eine kleine — welche spürt die größere Kraft?'),
    belief: T('质量大（或运动着）的物体对另一个物体的作用力更大。', 'The heavier (or the moving) body exerts the larger force on the other.', 'Der schwerere (oder der bewegte) Körper übt die größere Kraft auf den anderen aus.'),
    physics: T('相互作用力总是大小相等、方向相反（牛顿第三定律），作用时间也相同，所以两球受到的冲量大小相等：动量的变化量一样大。小球的速度变化更大，是因为它的质量小。', 'The two forces of an interaction are always equal and opposite (Newton\'s third law) and act for the same time, so the impulses are equal: both momenta change by the same amount. The small ball\'s velocity changes more because its mass is small.', 'Die beiden Kräfte einer Wechselwirkung sind stets gleich groß und entgegengesetzt (drittes Newtonsches Gesetz) und wirken gleich lang, also sind die Kraftstöße gleich: Beide Impulse ändern sich um denselben Betrag. Die kleine Kugel ändert ihre Geschwindigkeit stärker, weil ihre Masse klein ist.'),
    watch: T('碰撞事件的详情里，两球的冲量大小相等、方向相反；系统的总动量曲线是一条水平线。', 'In the details of the impact the two impulses are equal and opposite; the total momentum curve is a horizontal line.', 'In den Details des Stoßes sind die beiden Kraftstöße gleich groß und entgegengesetzt; die Kurve des Gesamtimpulses ist eine waagerechte Gerade.'),
    template: 'collision-1d', values: { m1: 5, m2: 0.5, v0: 2, e: 1 },
    question: T('5 kg 的球 A 撞上静止的 0.5 kg 的球 B。碰撞过程中，谁受到的冲量更大？', 'Ball A (5 kg) hits ball B (0.5 kg) at rest. During the impact, which receives the larger impulse?', 'Kugel A (5 kg) trifft die ruhende Kugel B (0,5 kg). Welche erhält beim Stoß den größeren Kraftstoß?'),
    options: [T('A', 'A', 'A'), T('B', 'B', 'B'), T('一样大', 'The same', 'Gleich groß')],
    answer: 2, chart: ['A.vx', 'B.vx', 'system.px']
  },
  {
    id: 'case-hoop-disc', topic: 'rotation',
    title: T('圆环和圆柱从斜面滚下，谁先到底？', 'A hoop and a cylinder roll down a slope — which arrives first?', 'Ein Reifen und ein Zylinder rollen eine Schräge hinab — wer kommt zuerst an?'),
    belief: T('它们从同一高度滚下，像滑块一样同时到底；或者质量大的先到。', 'They start from the same height, so like sliding blocks they arrive together; or the heavier one arrives first.', 'Sie starten aus gleicher Höhe, kommen also wie gleitende Klötze gleichzeitig an; oder der schwerere zuerst.'),
    physics: T('滚动时重力势能分给平动动能和转动动能。圆环的质量都在边缘，转动惯量大（I = mr²），转动占去的能量多，平动加速度只有 ½g sin θ；实心圆柱（I = ½mr²）是 ⅔g sin θ，先到底。与质量和半径无关。', 'In rolling, the potential energy is shared between translation and rotation. A hoop has all its mass at the rim (I = mr²), so rotation takes more: its acceleration is only ½g sin θ; a solid cylinder (I = ½mr²) has ⅔g sin θ and arrives first — whatever the masses and radii.', 'Beim Rollen teilt sich die Lageenergie auf Translation und Rotation auf. Beim Reifen sitzt die Masse am Rand (I = mr²), die Rotation nimmt mehr: Seine Beschleunigung ist nur ½g sin θ; der Vollzylinder (I = ½mr²) hat ⅔g sin θ und kommt zuerst an — unabhängig von Masse und Radius.'),
    watch: T('两条速度曲线的斜率之比是 4 : 3。', 'The slopes of the two velocity curves are in the ratio 4 : 3.', 'Die Steigungen der beiden Geschwindigkeitskurven verhalten sich wie 4 : 3.'),
    template: 'hoop-disc',
    question: T('圆环和实心圆柱从斜面同一高度同时由静止滚下（不打滑），谁先到底？', 'A hoop and a solid cylinder start rolling from rest at the same height of a slope (no slipping). Which arrives first?', 'Ein Reifen und ein Vollzylinder rollen aus der Ruhe von gleicher Höhe eine Schräge hinab (ohne Rutschen). Wer kommt zuerst an?'),
    options: [T('圆环', 'The hoop', 'Der Reifen'), T('圆柱', 'The cylinder', 'Der Zylinder'), T('同时', 'Both together', 'Beide gleichzeitig')],
    answer: 1
  },
  {
    id: 'case-pendulum-mass', topic: 'oscillation',
    title: T('摆球越重，摆得越慢吗？', 'Does a heavier bob swing more slowly?', 'Schwingt ein schwereres Pendel langsamer?'),
    belief: T('摆球质量越大，周期越长（或越短）。', 'The heavier the bob, the longer (or shorter) the period.', 'Je schwerer der Pendelkörper, desto länger (oder kürzer) die Periode.'),
    physics: T('回复力 mg sin θ 与质量成正比，加速度与质量无关。小角度时周期 T = 2π√(L/g)，只由摆长和 g 决定。', 'The restoring force mg sin θ is proportional to the mass, so the acceleration does not depend on it. For small angles T = 2π√(L/g): only the length and g matter.', 'Die Rückstellkraft mg sin θ ist proportional zur Masse, die Beschleunigung hängt nicht von ihr ab. Für kleine Winkel gilt T = 2π√(L/g): Nur Länge und g zählen.'),
    watch: T('把摆球质量 m 加倍再运行：角度曲线和原来完全重合。', 'Double the bob\'s mass m and run again: the angle curve is exactly the same.', 'Verdopple die Masse m und starte erneut: Die Winkelkurve ist genau dieselbe.'),
    template: 'pendulum', values: { L: 1, theta0: 5, m: 0.5 },
    question: T('把单摆摆球的质量加倍（摆长不变），小角度摆动的周期：', 'The mass of a pendulum\'s bob is doubled (same length). The period of small swings:', 'Die Masse des Pendelkörpers wird verdoppelt (gleiche Länge). Die Periode kleiner Schwingungen:'),
    options: [T('变长', 'Gets longer', 'Wird länger'), T('不变', 'Stays the same', 'Bleibt gleich'), T('变短', 'Gets shorter', 'Wird kürzer')],
    answer: 1, chart: ['bob.angle@pivot']
  },
  {
    id: 'case-sinking-buoyancy', topic: 'fluid',
    title: T('下沉的物体还受浮力吗？', 'Does a sinking body still feel buoyancy?', 'Erfährt ein sinkender Körper noch Auftrieb?'),
    belief: T('浮起来的物体才受浮力，沉下去的不受。', 'Only floating bodies feel buoyancy; sinking ones do not.', 'Nur schwimmende Körper erfahren Auftrieb, sinkende nicht.'),
    physics: T('浸在液体里的物体都受浮力 F浮 = ρ液gV排。铁球下沉是因为浮力小于重力，不是没有浮力：它的加速度 a = g(1 − ρ液/ρ物) 小于 g。', 'Every body immersed in a liquid feels the buoyant force ρ_liquid·g·V. An iron ball sinks because buoyancy is smaller than its weight, not because there is none: its acceleration a = g(1 − ρ_liquid/ρ_body) is less than g.', 'Jeder eingetauchte Körper erfährt den Auftrieb ρ_Fl·g·V. Eine Eisenkugel sinkt, weil der Auftrieb kleiner ist als ihr Gewicht, nicht weil es keinen gibt: Ihre Beschleunigung a = g(1 − ρ_Fl/ρ_K) ist kleiner als g.'),
    watch: T('选中铁球看受力：向上的浮力箭头一直都在；加速度约 8.5 m/s²，不是 9.8 m/s²。', 'Select the ball and look at its forces: the upward buoyancy arrow is there all the time; the acceleration is about 8.5 m/s², not 9.8 m/s².', 'Wähle die Kugel und sieh dir die Kräfte an: Der Auftriebspfeil nach oben ist stets da; die Beschleunigung ist etwa 8,5 m/s², nicht 9,8 m/s².'),
    template: 'sinking-ball',
    question: T('铁球在水中下沉的过程中，它受到的浮力：', 'While an iron ball sinks in water, the buoyant force on it:', 'Während eine Eisenkugel im Wasser sinkt, ist der Auftrieb auf sie:'),
    options: [T('为零', 'Is zero', 'Null'), T('不为零，小于重力', 'Is not zero, but less than its weight', 'Nicht null, aber kleiner als ihr Gewicht'), T('等于重力', 'Equals its weight', 'Gleich ihrem Gewicht')],
    answer: 1
  }
]

export function caseById(id: string): TeachingCase | undefined { return CASES.find(c => c.id === id) }
