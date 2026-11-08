/**
 * Classroom experiments (26.61, phase B): three lessons built on the activities act-static, act-collision and act-rc,
 * each with one flow for the class — 看现象 → 提交预测 → 操纵一个变量 → 观察指定时刻 → 用证据解释 → 迁移 — a teacher
 * flow of 10–15 minutes, the assumptions under which the rule holds, common errors and two hints. Every step names
 * the evidence it shows (a scene with given values, a time or the two sides of an event, the curves, the formula
 * cards); the numbers come from the engine or the model registry (evidence.ts), never from these texts.
 * Pure data; texts are trilingual records.
 */
import type { Tri } from '../../i18n/tri'
import { T } from '../../content/models/types'

export type LessonStepId = 'observe' | 'predict' | 'manipulate' | 'observeAt' | 'explain' | 'transfer'
export const LESSON_STEPS: LessonStepId[] = ['observe', 'predict', 'manipulate', 'observeAt', 'explain', 'transfer']
export const LESSON_STEP_TEXT: Record<LessonStepId, Tri> = {
  observe: T('看现象', 'Observe', 'Beobachten'),
  predict: T('提交预测', 'Predict', 'Vorhersagen'),
  manipulate: T('操纵一个变量', 'Change one variable', 'Eine Größe ändern'),
  observeAt: T('观察指定时刻', 'Look at the moment', 'Den Zeitpunkt ansehen'),
  explain: T('用证据解释', 'Explain with evidence', 'Mit Belegen erklären'),
  transfer: T('迁移题', 'Transfer', 'Übertragen')
}

/** What a step opens: a template with values (studio) or the circuit lab, a moment, curves, a panel. */
export interface Evidence {
  label: Tri
  /** Template id and values, or the circuit lab preset. */
  template?: string
  values?: Record<string, number>
  lab?: { id: string; preset?: string }
  /** The moment: a time, or one side of the first event of a kind. */
  at?: { t?: number; event?: string; side?: 'before' | 'after' }
  /** Quantities in the curves. */
  chart?: string[]
  /** Side panel to show. */
  panel?: 'formula' | 'watch' | 'inspect'
}

export interface LessonChoice { id: string; text: Tri; feedback?: Tri }

export interface LessonStep {
  id: LessonStepId
  text: Tri
  evidence?: Evidence[]
  /** predict / explain: options; the right one is decided by the evidence (evidence.ts `verdict`). */
  options?: LessonChoice[]
  /** transfer: a number to give, checked against `answerOf` in evidence.ts. */
  number?: { prompt: Tri; unit: string; rtol: number }
  hints?: Tri[]
}

export interface Lesson {
  id: string
  activity: 'act-static' | 'act-collision' | 'act-rc'
  title: Tri
  goal: Tri
  start: Tri
  /** Conditions under which the rule holds (shown with every evidence). */
  assumptions: Tri[]
  misconceptions: Tri[]
  /** Exactly two guiding hints for the class. */
  hints: [Tri, Tri]
  teacher: { minutes: string; flow: Tri[] }
  steps: LessonStep[]
}

export const LESSONS: Lesson[] = [
  {
    id: 'lesson-static', activity: 'act-static',
    title: T('静摩擦的阈值：斜面上的物块何时开始滑', 'The static-friction threshold: when does the block start to slide?', 'Die Haftreibungsschwelle: wann rutscht der Klotz los?'),
    goal: T('用 tan θ ≤ μs 判断静止的物块能否保持静止，并用受力、事件与曲线说明。', 'Decide with tan θ ≤ μs whether a block at rest stays at rest, and show it with forces, events and curves.', 'Mit tan θ ≤ μs entscheiden, ob ein ruhender Klotz liegen bleibt, und es mit Kräften, Ereignissen und Kurven zeigen.'),
    start: T('固定斜面，物块由静止释放；μs = 0.5、μk = 0.4，只改变倾角 θ。', 'Fixed incline, block released from rest; μs = 0.5, μk = 0.4; only the angle θ changes.', 'Feste schiefe Ebene, Klotz aus der Ruhe; μs = 0,5, μk = 0,4; nur der Winkel θ ändert sich.'),
    assumptions: [T('物块初始静止，斜面固定', 'The block starts at rest; the incline is fixed', 'Der Klotz ruht anfangs; die Ebene ist fest'), T('库仑摩擦：静摩擦最大为 μs N，滑动时为 μk N', 'Coulomb friction: static at most μs N, sliding μk N', 'Coulomb-Reibung: Haftreibung höchstens μs N, Gleitreibung μk N'), T('临界角附近（|tan θ − μs| 很小）结果对数值误差敏感，按容差判定', 'Near the critical angle (|tan θ − μs| small) the result is sensitive to rounding; it is judged with a tolerance', 'Nahe dem Grenzwinkel (|tan θ − μs| klein) ist das Ergebnis empfindlich; es wird mit Toleranz beurteilt')],
    misconceptions: [T('“静摩擦力总等于 μs N”——它只是上限，静止时等于 mg sin θ', '“Static friction is always μs N” — that is the upper limit; at rest it equals mg sin θ', '„Haftreibung ist immer μs N“ — das ist die Obergrenze; in Ruhe ist sie mg sin θ'), T('“质量越大越容易滑”——阈值 tan θ = μs 与质量无关', '“A heavier block slides sooner” — the threshold tan θ = μs does not depend on mass', '„Ein schwererer Klotz rutscht eher“ — die Schwelle tan θ = μs hängt nicht von der Masse ab')],
    hints: [T('比较沿斜面向下的分力 mg sin θ 与最大静摩擦 μs mg cos θ。', 'Compare the downhill component mg sin θ with the maximum static friction μs mg cos θ.', 'Vergleiche die Hangabtriebskraft mg sin θ mit der maximalen Haftreibung μs mg cos θ.'), T('两边都含 mg cos θ：约掉后只剩 tan θ 与 μs。', 'Both sides contain mg cos θ: cancel it and only tan θ and μs remain.', 'Beide Seiten enthalten mg cos θ: kürzen, übrig bleiben tan θ und μs.')],
    teacher: { minutes: '12', flow: [
      T('2 分钟：投影 θ = 20°，播放，物块不动；指出受力图中的静摩擦方向。', '2 min: project θ = 20°, play — the block stays; point at the direction of static friction in the force diagram.', '2 min: θ = 20° projizieren, abspielen — der Klotz bleibt; auf die Richtung der Haftreibung im Kräfteplan zeigen.'),
      T('2 分钟：学生提交预测：θ = 28° 时会不会滑。', '2 min: students submit a prediction: will it slide at θ = 28°?', '2 min: Vorhersage abgeben: rutscht er bei θ = 28°?'),
      T('3 分钟：在临界角 26.6° 两侧各开一次（25°、28°），对照速度曲线与“开始滑动”事件。', '3 min: open both sides of the critical angle 26.6° (25°, 28°) and compare the velocity curves and the “starts to slide” event.', '3 min: beide Seiten des Grenzwinkels 26,6° öffnen (25°, 28°), Geschwindigkeitskurven und das Ereignis „beginnt zu rutschen“ vergleichen.'),
      T('3 分钟：读 t = 0.2 s 时的摩擦力与 mg sin θ、μs N，学生用证据解释。', '3 min: read the friction at t = 0.2 s against mg sin θ and μs N; students explain with the evidence.', '3 min: Reibung bei t = 0,2 s mit mg sin θ und μs N vergleichen; Erklärung mit Belegen.'),
      T('2 分钟：迁移题（另一种材料的临界角）。', '2 min: transfer (critical angle of another material).', '2 min: Übertragung (Grenzwinkel eines anderen Materials).')
    ] },
    steps: [
      { id: 'observe', text: T('θ = 20° 时播放：物块保持静止。看受力图里摩擦力的方向和大小。', 'Play at θ = 20°: the block stays at rest. Look at the direction and size of friction in the force diagram.', 'Bei θ = 20° abspielen: der Klotz bleibt. Richtung und Größe der Reibung im Kräfteplan ansehen.'),
        evidence: [{ label: T('打开 θ = 20°', 'Open θ = 20°', 'θ = 20° öffnen'), template: 'incline-friction', values: { theta: 20, muS: 0.5, muK: 0.4, v0: 0 }, chart: ['custom.vs', 'contact.block|incline.f'], panel: 'formula' }] },
      { id: 'predict', text: T('把倾角改成 28°，物块会？', 'At an angle of 28°, the block will…', 'Bei einem Winkel von 28° wird der Klotz…'),
        options: [{ id: 'stay', text: T('保持静止', 'stay at rest', 'liegen bleiben') }, { id: 'slide', text: T('开始下滑', 'start to slide', 'losrutschen') }] },
      { id: 'manipulate', text: T('只改变倾角：在临界角两侧各运行一次。', 'Change only the angle: run once on each side of the critical angle.', 'Nur den Winkel ändern: je einmal auf beiden Seiten des Grenzwinkels rechnen.'),
        evidence: [
          { label: T('θ = 25°（临界以下）', 'θ = 25° (below critical)', 'θ = 25° (unter der Grenze)'), template: 'incline-friction', values: { theta: 25, muS: 0.5, muK: 0.4, v0: 0 }, chart: ['custom.vs', 'contact.block|incline.f'] },
          { label: T('θ = 28°（临界以上）', 'θ = 28° (above critical)', 'θ = 28° (über der Grenze)'), template: 'incline-friction', values: { theta: 28, muS: 0.5, muK: 0.4, v0: 0 }, chart: ['custom.vs', 'contact.block|incline.f'] }
        ] },
      { id: 'observeAt', text: T('θ = 28°：跳到“开始滑动”事件，比较事件前后的摩擦力（静摩擦 → 滑动摩擦）。', 'θ = 28°: go to the “starts to slide” event and compare friction before and after it (static → kinetic).', 'θ = 28°: zum Ereignis „beginnt zu rutschen“ springen und die Reibung davor und danach vergleichen (Haft → Gleit).'),
        evidence: [
          { label: T('事件前', 'Before the event', 'Vor dem Ereignis'), template: 'incline-friction', values: { theta: 28, muS: 0.5, muK: 0.4, v0: 0 }, at: { event: 'slip', side: 'before' }, chart: ['contact.block|incline.f'], panel: 'watch' },
          { label: T('t = 0.2 s', 't = 0.2 s', 't = 0,2 s'), template: 'incline-friction', values: { theta: 28, muS: 0.5, muK: 0.4, v0: 0 }, at: { t: 0.2 }, chart: ['contact.block|incline.f'], panel: 'watch' }
        ] },
      { id: 'explain', text: T('哪一条最能解释你看到的结果？', 'Which statement explains what you saw best?', 'Welche Aussage erklärt die Beobachtung am besten?'),
        options: [
          { id: 'tan', text: T('tan θ > μs 时最大静摩擦不足以平衡 mg sin θ', 'For tan θ > μs the maximum static friction cannot balance mg sin θ', 'Für tan θ > μs kann die maximale Haftreibung mg sin θ nicht ausgleichen') },
          { id: 'mass', text: T('物块的质量太大', 'The block is too heavy', 'Der Klotz ist zu schwer'), feedback: T('阈值与质量无关：mg 在两边约掉。', 'The threshold does not depend on mass: mg cancels.', 'Die Schwelle hängt nicht von der Masse ab: mg kürzt sich.') },
          { id: 'muk', text: T('滑动摩擦比静摩擦小', 'Kinetic friction is smaller than static', 'Gleitreibung ist kleiner als Haftreibung'), feedback: T('这解释滑动后的加速，不解释为何开始滑动。', 'That explains the acceleration after slipping, not why it starts.', 'Das erklärt die Beschleunigung danach, nicht den Beginn.') }
        ] },
      { id: 'transfer', text: T('橡胶与木头 μs = 0.7：临界倾角是多少？', 'Rubber on wood, μs = 0.7: what is the critical angle?', 'Gummi auf Holz, μs = 0,7: wie groß ist der Grenzwinkel?'),
        number: { prompt: T('临界倾角 θc', 'Critical angle θc', 'Grenzwinkel θc'), unit: '°', rtol: 0.02 }, hints: [T('θc = arctan μs', 'θc = arctan μs', 'θc = arctan μs')] }
    ]
  },
  {
    id: 'lesson-collision', activity: 'act-collision',
    title: T('一维弹性碰撞：换方向不等于失去能量', 'Elastic collision in 1D: turning back is not losing energy', 'Elastischer gerader Stoß: Umkehren heißt nicht Energie verlieren'),
    goal: T('在同一碰撞事件的前后取值，用有符号速度、系统动量与总动能说明弹性碰撞。', 'Read values on both sides of one collision event and explain an elastic collision with signed velocities, total momentum and kinetic energy.', 'Werte auf beiden Seiten desselben Stoßereignisses ablesen und den elastischen Stoß mit vorzeichenbehafteten Geschwindigkeiten, Gesamtimpuls und Energie erklären.'),
    start: T('光滑水平面，A（1 kg）以 3 m/s 正碰静止的 B；只改变 B 的质量。', 'Smooth floor, A (1 kg) at 3 m/s hits B at rest head-on; only the mass of B changes.', 'Glatter Boden, A (1 kg) trifft mit 3 m/s gerade auf ruhendes B; nur die Masse von B ändert sich.'),
    assumptions: [T('一维正碰，两球沿同一直线运动', 'Head-on, along one line', 'Gerader Stoß auf einer Geraden'), T('弹性碰撞（e = 1），碰撞时间内外力冲量可忽略', 'Elastic (e = 1); external impulse during the impact negligible', 'Elastisch (e = 1); äußerer Kraftstoß während des Stoßes vernachlässigbar'), T('速度以向右为正', 'Velocities positive to the right', 'Geschwindigkeiten nach rechts positiv')],
    misconceptions: [T('“A 反弹了，所以能量损失了”——方向变化与动能无关', '“A bounced back, so energy was lost” — the direction does not decide the kinetic energy', '„A prallt zurück, also ging Energie verloren“ — die Richtung entscheidet nicht über die Energie'), T('“动量守恒就是速度大小不变”——守恒的是 m₁v₁ + m₂v₂（有符号）', '“Momentum conservation means the speeds stay” — conserved is m₁v₁ + m₂v₂ (signed)', '„Impulserhaltung heißt gleiche Beträge“ — erhalten ist m₁v₁ + m₂v₂ (mit Vorzeichen)')],
    hints: [T('先看系统动量曲线：碰撞前后是否同一条水平线？', 'First look at the total momentum curve: one flat line before and after?', 'Zuerst die Gesamtimpulskurve: eine waagrechte Linie davor und danach?'), T('再比较碰撞前后的总动能：弹性碰撞两者相等。', 'Then compare the total kinetic energy before and after: equal for an elastic collision.', 'Dann die gesamte kinetische Energie davor und danach vergleichen: beim elastischen Stoß gleich.')],
    teacher: { minutes: '13', flow: [
      T('2 分钟：投影 m₂ = 1 kg：A 停下、B 以 3 m/s 离开（速度交换）。', '2 min: project m₂ = 1 kg: A stops, B leaves at 3 m/s (exchange).', '2 min: m₂ = 1 kg projizieren: A bleibt stehen, B fährt mit 3 m/s weiter (Austausch).'),
      T('2 分钟：预测 m₂ = 2 kg 时 A 碰后向哪边运动。', '2 min: predict which way A moves after the impact with m₂ = 2 kg.', '2 min: vorhersagen, wohin A bei m₂ = 2 kg nach dem Stoß fährt.'),
      T('4 分钟：m₂ = 0.5、2、4 kg 各开一次，在碰撞事件前后读 v_A、v_B、p、E_k。', '4 min: open m₂ = 0.5, 2, 4 kg and read v_A, v_B, p, E_k before and after the impact.', '4 min: m₂ = 0,5, 2, 4 kg öffnen und v_A, v_B, p, E_k vor und nach dem Stoß ablesen.'),
      T('3 分钟：学生解释“换方向”与“失去能量”的区别。', '3 min: students explain “turning back” versus “losing energy”.', '3 min: Unterschied „umkehren“ und „Energie verlieren“ erklären.'),
      T('2 分钟：迁移题（两只等质量冰壶）。', '2 min: transfer (two equal curling stones).', '2 min: Übertragung (zwei gleiche Curlingsteine).')
    ] },
    steps: [
      { id: 'observe', text: T('m₂ = 1 kg：播放，看两球速度的交换。', 'm₂ = 1 kg: play and watch the velocities exchange.', 'm₂ = 1 kg: abspielen, den Geschwindigkeitsaustausch ansehen.'),
        evidence: [{ label: T('打开 m₂ = 1 kg', 'Open m₂ = 1 kg', 'm₂ = 1 kg öffnen'), template: 'collision-1d', values: { m1: 1, m2: 1, v0: 3, e: 1 }, chart: ['A.vx', 'B.vx', 'system.px'] }] },
      { id: 'predict', text: T('m₂ = 2 kg 时，A 碰后的速度方向？', 'With m₂ = 2 kg, which way does A move after the impact?', 'Mit m₂ = 2 kg: in welche Richtung fährt A nach dem Stoß?'),
        options: [{ id: 'forward', text: T('继续向右', 'still to the right', 'weiter nach rechts') }, { id: 'stop', text: T('停下', 'it stops', 'es bleibt stehen') }, { id: 'back', text: T('向左反弹', 'back to the left', 'zurück nach links') }] },
      { id: 'manipulate', text: T('只改变 B 的质量，各运行一次。', 'Change only the mass of B; run each once.', 'Nur die Masse von B ändern; je einmal rechnen.'),
        evidence: [0.5, 2, 4].map(m2 => ({ label: T(`m₂ = ${m2} kg`, `m₂ = ${m2} kg`, `m₂ = ${String(m2).replace('.', ',')} kg`), template: 'collision-1d', values: { m1: 1, m2, v0: 3, e: 1 }, chart: ['A.vx', 'B.vx', 'system.px', 'system.ek'] })) },
      { id: 'observeAt', text: T('m₂ = 2 kg：在碰撞事件的前后各取一次值。', 'm₂ = 2 kg: read the values just before and just after the impact.', 'm₂ = 2 kg: Werte direkt vor und direkt nach dem Stoß ablesen.'),
        evidence: [
          { label: T('碰撞前', 'Before the impact', 'Vor dem Stoß'), template: 'collision-1d', values: { m1: 1, m2: 2, v0: 3, e: 1 }, at: { event: 'impact', side: 'before' }, chart: ['A.vx', 'B.vx', 'system.px', 'system.ek'], panel: 'watch' },
          { label: T('碰撞后', 'After the impact', 'Nach dem Stoß'), template: 'collision-1d', values: { m1: 1, m2: 2, v0: 3, e: 1 }, at: { event: 'impact', side: 'after' }, chart: ['A.vx', 'B.vx', 'system.px', 'system.ek'], panel: 'watch' }
        ] },
      { id: 'explain', text: T('A 向左反弹。哪一条说法对？', 'A bounces back. Which statement is right?', 'A prallt zurück. Welche Aussage stimmt?'),
        options: [
          { id: 'kept', text: T('总动能与系统动量都与碰前相同：只是方向变了', 'Total kinetic energy and momentum are as before: only the direction changed', 'Gesamtenergie und Impuls wie vorher: nur die Richtung änderte sich') },
          { id: 'lost', text: T('A 反弹说明能量损失了', 'A bouncing back means energy was lost', 'Das Zurückprallen von A bedeutet Energieverlust'), feedback: T('看碰撞前后的 E_k：相等。', 'Look at E_k before and after: equal.', 'E_k davor und danach: gleich.') },
          { id: 'pchange', text: T('系统动量改变了方向', 'The total momentum changed direction', 'Der Gesamtimpuls änderte die Richtung'), feedback: T('系统动量 p 在事件两侧相同。', 'The total momentum p is the same on both sides of the event.', 'Der Gesamtimpuls p ist auf beiden Seiten gleich.') }
        ] },
      { id: 'transfer', text: T('两只 2 kg 冰壶，A 以 1.5 m/s 正碰静止的 B（弹性）。碰后 B 的速度？', 'Two 2 kg curling stones; A at 1.5 m/s hits B at rest (elastic). Velocity of B after?', 'Zwei Curlingsteine zu 2 kg; A trifft mit 1,5 m/s auf ruhendes B (elastisch). Geschwindigkeit von B danach?'),
        number: { prompt: T('碰后 B 的速度', 'Velocity of B after', 'Geschwindigkeit von B danach'), unit: 'm/s', rtol: 0.02 } }
    ]
  },
  {
    id: 'lesson-rc', activity: 'act-rc',
    title: T('RC 充电：时间常数 τ = RC', 'RC charging: the time constant τ = RC', 'RC-Laden: die Zeitkonstante τ = RC'),
    goal: T('在 t = RC 读到终值的约 63.2%，并用一份实测 CSV（列与单位映射）验证。', 'Read about 63.2 % of the final voltage at t = RC, and check it with a measured CSV (column and unit mapping).', 'Bei t = RC etwa 63,2 % der Endspannung ablesen und mit einer gemessenen CSV prüfen (Spalten- und Einheitenzuordnung).'),
    start: T('理想电源 5 V，电容初始不带电；R = 1 kΩ、C = 100 μF，只改变 R 或 C。', 'Ideal 5 V source, capacitor uncharged; R = 1 kΩ, C = 100 μF; only R or C changes.', 'Ideale 5-V-Quelle, Kondensator ungeladen; R = 1 kΩ, C = 100 μF; nur R oder C ändert sich.'),
    assumptions: [T('理想阶跃电源，t = 0 时闭合', 'Ideal step source, switched on at t = 0', 'Ideale Sprungquelle, Einschalten bei t = 0'), T('电容初始电压为零，元件理想（无漏电、无内阻）', 'The capacitor starts at zero; ideal components (no leakage, no internal resistance)', 'Kondensator anfangs bei null; ideale Bauteile (kein Leckstrom, kein Innenwiderstand)')],
    misconceptions: [T('“τ 是充满所需的时间”——t = τ 时只到 63.2%，约 5τ 才接近充满', '“τ is the time to charge fully” — at t = τ only 63.2 %; about 5τ to be nearly full', '„τ ist die Zeit bis voll“ — bei t = τ erst 63,2 %; etwa 5τ bis fast voll'), T('“R 越大充得越快”——τ = RC 随 R 增大而变长', '“A larger R charges faster” — τ = RC grows with R', '„Größeres R lädt schneller“ — τ = RC wächst mit R')],
    hints: [T('V(t) = Vs(1 − e^(−t/RC))：代入 t = RC。', 'V(t) = Vs(1 − e^(−t/RC)): put in t = RC.', 'V(t) = Vs(1 − e^(−t/RC)): t = RC einsetzen.'), T('1 − 1/e ≈ 0.632。', '1 − 1/e ≈ 0.632.', '1 − 1/e ≈ 0,632.')],
    teacher: { minutes: '14', flow: [
      T('2 分钟：打开 RC 电路，看电压曲线逐渐趋于 5 V。', '2 min: open the RC circuit and watch the voltage approach 5 V.', '2 min: RC-Schaltung öffnen, die Spannung nähert sich 5 V.'),
      T('2 分钟：预测 R 加倍后到达 3.16 V 的时间如何变化。', '2 min: predict how the time to reach 3.16 V changes when R doubles.', '2 min: vorhersagen, wie sich die Zeit bis 3,16 V bei doppeltem R ändert.'),
      T('3 分钟：R = 1 kΩ 与 2 kΩ 各读一次 t = RC 时的电压。', '3 min: read the voltage at t = RC for R = 1 kΩ and 2 kΩ.', '3 min: Spannung bei t = RC für R = 1 kΩ und 2 kΩ ablesen.'),
      T('4 分钟：导入示例 CSV，映射“时间（ms）”和“电压（V）”两列，读出 τ 与 RMS 偏差。', '4 min: import the sample CSV, map the “time (ms)” and “voltage (V)” columns, read τ and the RMS deviation.', '4 min: Beispiel-CSV laden, Spalten „Zeit (ms)“ und „Spannung (V)“ zuordnen, τ und RMS-Abweichung ablesen.'),
      T('3 分钟：解释与迁移题。', '3 min: explanation and transfer.', '3 min: Erklärung und Übertragung.')
    ] },
    steps: [
      { id: 'observe', text: T('打开 RC 电路：闭合开关，看电容电压的曲线。', 'Open the RC circuit: close the switch and watch the capacitor voltage.', 'RC-Schaltung öffnen: Schalter schließen, die Kondensatorspannung ansehen.'),
        evidence: [{ label: T('打开 RC 电路', 'Open the RC circuit', 'RC-Schaltung öffnen'), lab: { id: 'circuit', preset: 'rc' } }] },
      { id: 'predict', text: T('R 加倍后，电压到达终值 63.2% 所需的时间？', 'With R doubled, the time to reach 63.2 % of the final voltage…', 'Bei doppeltem R ist die Zeit bis 63,2 % der Endspannung…'),
        options: [{ id: 'double', text: T('变为 2 倍', 'doubles', 'verdoppelt') }, { id: 'half', text: T('变为一半', 'halves', 'halbiert') }, { id: 'same', text: T('不变', 'stays', 'gleich') }] },
      { id: 'manipulate', text: T('只改变 R：比较 τ 与 t = τ 时的电压（模型计算）。', 'Change only R: compare τ and the voltage at t = τ (model).', 'Nur R ändern: τ und die Spannung bei t = τ vergleichen (Modell).') },
      { id: 'observeAt', text: T('把示例 CSV 的两列映射为时间与电压，读出实测的 τ 与 RMS 偏差。', 'Map two columns of the sample CSV to time and voltage, read the measured τ and the RMS deviation.', 'Zwei Spalten der Beispiel-CSV als Zeit und Spannung zuordnen, τ und RMS-Abweichung ablesen.') },
      { id: 'explain', text: T('为什么 t = RC 时总是 63.2%，与 Vs 无关？', 'Why is it always 63.2 % at t = RC, whatever Vs?', 'Warum immer 63,2 % bei t = RC, unabhängig von Vs?'),
        options: [
          { id: 'ratio', text: T('V/Vs = 1 − e^(−t/RC) 只取决于 t/RC', 'V/Vs = 1 − e^(−t/RC) depends only on t/RC', 'V/Vs = 1 − e^(−t/RC) hängt nur von t/RC ab') },
          { id: 'full', text: T('电容在 t = RC 时已充满', 'The capacitor is full at t = RC', 'Der Kondensator ist bei t = RC voll'), feedback: T('t = RC 时只有 63.2%。', 'At t = RC it is only 63.2 %.', 'Bei t = RC erst 63,2 %.') },
          { id: 'source', text: T('因为电源是 5 V', 'Because the source is 5 V', 'Weil die Quelle 5 V hat'), feedback: T('换成 9 V 也是 63.2%。', 'With 9 V it is 63.2 % too.', 'Mit 9 V ebenfalls 63,2 %.') }
        ] },
      { id: 'transfer', text: T('R = 2.2 kΩ、C = 47 μF：时间常数 τ？', 'R = 2.2 kΩ, C = 47 μF: the time constant τ?', 'R = 2,2 kΩ, C = 47 μF: die Zeitkonstante τ?'),
        number: { prompt: T('时间常数 τ', 'Time constant τ', 'Zeitkonstante τ'), unit: 's', rtol: 0.02 } }
    ]
  }
]

export const lessonById = (id: string) => LESSONS.find(l => l.id === id)
export const lessonOfActivity = (activity: string) => LESSONS.find(l => l.activity === activity)
