/**
 * The teaching activities of 26.56 (D102): the three closed loops of the blueprint (mechanics; circuits and
 * induction; heat, quantum and nuclear) and the junior-school floating task. Every number a learner is checked
 * against comes from the model registry evaluated in the Rust core; this file holds only texts, choices, the
 * inputs of each case and which output or condition a question asks for.
 */
import { T } from '../../content/models/types'
import type { ActivitySpec, ChoiceOption, ChoiceQuestion, NumberQuestion, TrendQuestion } from './types'

type Tx = ReturnType<typeof T>
const o = (id: string, text: Tx, feedback?: Tx): ChoiceOption => (feedback ? { id, text, feedback } : { id, text })
const num = (id: string, output: string, prompt: Tx, units: string[], more: Partial<NumberQuestion> = {}): NumberQuestion => ({ kind: 'number', id, output, prompt, units, tol: 0.01, ...more })
const trend = (id: string, output: string, prompt: Tx): TrendQuestion => ({ kind: 'trend', id, output, prompt })
const fixed = (id: string, dimension: ChoiceQuestion['dimension'], prompt: Tx, options: ChoiceOption[], answer: string, hints?: Tx[]): ChoiceQuestion => ({ kind: 'choice', id, dimension, prompt, options, answer: { fixed: answer }, ...(hints ? { hints } : {}) })
const byCondition = (id: string, prompt: Tx, options: ChoiceOption[], hints?: Tx[], map?: Record<string, string>): ChoiceQuestion => ({ kind: 'choice', id, dimension: 'modelling', prompt, options, answer: map ? { condition: true, map } : { condition: true }, ...(hints ? { hints } : {}) })
const LN2 = Math.LN2
const deg = (d: number) => (d * Math.PI) / 180

const trendWhy = (right: Tx, wrong: Tx[]): { reasons: ChoiceOption[]; reason: string } => ({ reasons: [o('r0', right), ...wrong.map((w, i) => o(`r${i + 1}`, w))], reason: 'r0' })

export const ACTIVITY_DEFS: ActivitySpec[] = [
  {
    id: 'act-float', title: T('预测沉浮：密度与浮力', 'Predict floating and sinking: density and buoyancy', 'Schwimmen oder Sinken vorhersagen: Dichte und Auftrieb'), stage: 'j', models: ['F02'],
    goals: [T('用物体与液体的密度比较判断沉浮', 'Decide floating or sinking by comparing densities', 'Schwimmen oder Sinken über den Dichtevergleich entscheiden'), T('二维截面乘以厚度得到体积，再求浮力与排开体积', 'Get the volume as section × thickness, then the buoyancy and the displaced volume', 'Das Volumen als Schnitt × Dicke bestimmen, dann Auftrieb und verdrängtes Volumen')],
    prerequisites: { note: T('知道密度 ρ = m/V 与重力 G = mg', 'Know density ρ = m/V and weight G = mg', 'Dichte ρ = m/V und Gewicht G = mg kennen') },
    inputs: { As: 0.05, d: 0.2, rhoB: 600, rhoF: 1000, g: 10 },
    diagnostic: [fixed('d1', 'concept', T('一根大木头和一颗小石子放进水里，决定谁漂浮的是什么？', 'A big log and a small pebble go into water. What decides which floats?', 'Ein großer Stamm und ein kleiner Kiesel kommen ins Wasser. Was entscheidet, wer schwimmt?'), [
      o('heavy', T('重的沉，轻的浮', 'Heavy things sink, light ones float', 'Schweres sinkt, Leichtes schwimmt'), T('木头比石子重却漂浮：看的不是重量，而是密度。', 'The log is heavier yet floats: weight alone does not decide, density does.', 'Der Stamm ist schwerer und schwimmt trotzdem: entscheidend ist die Dichte, nicht das Gewicht.')),
      o('density', T('物体密度与液体密度的比较', 'The density of the body compared with that of the liquid', 'Die Dichte des Körpers im Vergleich zur Dichte der Flüssigkeit')),
      o('size', T('体积大的浮', 'Big things float', 'Große Dinge schwimmen'), T('一大块铁也会沉：体积大小本身不决定沉浮。', 'A big block of iron sinks too: size alone does not decide.', 'Auch ein großer Eisenblock sinkt: die Größe allein entscheidet nicht.'))
    ], 'density')],
    predict: { question: byCondition('p', T('这块木块（ρ = 600 kg/m³）放进水中会怎样？', 'What happens to this block (ρ = 600 kg/m³) in water?', 'Was passiert mit diesem Block (ρ = 600 kg/m³) im Wasser?'), [o('floats', T('漂浮（部分露出水面）', 'It floats (partly above the water)', 'Er schwimmt (teilweise über Wasser)')), o('neutral', T('悬浮在水中任意深度', 'It hovers at any depth', 'Er schwebt in jeder Tiefe')), o('sinks', T('沉到底', 'It sinks to the bottom', 'Er sinkt auf den Grund'))]), ...trendWhy(T('木块密度小于水的密度', 'The block is less dense than water', 'Der Block hat eine kleinere Dichte als Wasser'), [T('木头总是漂浮', 'Wood always floats', 'Holz schwimmt immer'), T('它的体积很大', 'Its volume is large', 'Sein Volumen ist groß')]) },
    experiment: { vary: 'rhoB', values: [400, 600, 800, 1000, 1200, 7800], observe: ['Fb', 'Vsub', 'Fn'], note: T('只改变物体密度；截面、厚度、液体与 g 保持不变。', 'Only the density of the body changes; section, thickness, liquid and g stay the same.', 'Nur die Dichte des Körpers ändert sich; Schnitt, Dicke, Flüssigkeit und g bleiben gleich.') },
    questions: [
      num('q1', 'V', T('截面 0.05 m²、厚度 0.2 m：木块体积是多少？', 'Section 0.05 m², thickness 0.2 m: what is the volume?', 'Schnitt 0,05 m², Dicke 0,2 m: wie groß ist das Volumen?'), ['m³', 'm²', 'm'], { hints: [T('二维图只给出截面面积；体积还要乘以垂直纸面的厚度。', 'The 2D picture gives only the section area; multiply by the thickness perpendicular to the page.', 'Das 2D-Bild liefert nur die Schnittfläche; mit der Dicke senkrecht zur Zeichenebene multiplizieren.')] }),
      num('q2', 'Fb', T('木块静止漂浮时受到的浮力是多少？', 'What is the buoyant force on the floating block at rest?', 'Wie groß ist die Auftriebskraft auf den ruhenden schwimmenden Block?'), ['N', 'kg', 'N/m'], { hints: [T('漂浮静止：浮力与重力平衡。', 'Floating at rest: buoyancy balances the weight.', 'Ruhend schwimmend: Auftrieb und Gewicht sind im Gleichgewicht.'), T('重力 G = ρ_b V g。', 'Weight G = ρ_b V g.', 'Gewicht G = ρ_b V g.')] }),
      num('q3', 'Vsub', T('排开水的体积是多少？', 'What volume of water is displaced?', 'Wie viel Wasser wird verdrängt?'), ['m³', 'kg', 'm²'], { hints: [T('浮力 = ρ_f g V_排。', 'Buoyancy = ρ_f g V_sub.', 'Auftrieb = ρ_f g V_sub.')] }),
      fixed('q4', 'explanation', T('为什么浮力是 60 N 而不是 ρ水·g·V = 100 N？', 'Why is the buoyancy 60 N and not ρ_water·g·V = 100 N?', 'Warum ist der Auftrieb 60 N und nicht ρ_Wasser·g·V = 100 N?'), [o('a', T('漂浮时只有一部分浸没，浮力等于重力', 'When floating only part is submerged; buoyancy equals the weight', 'Beim Schwimmen ist nur ein Teil eingetaucht; der Auftrieb gleicht das Gewicht aus')), o('b', T('浮力总是 ρ液 g V', 'Buoyancy is always ρ_liquid g V', 'Der Auftrieb ist immer ρ_Flüssigkeit g V'), T('ρ液 g V 是完全浸没时的浮力。', 'ρ_liquid g V is the buoyancy when fully submerged.', 'ρ_Flüssigkeit g V ist der Auftrieb bei vollständigem Eintauchen.')), o('c', T('水对木头的压力比对石头小', 'Water pushes less on wood than on stone', 'Wasser drückt weniger auf Holz als auf Stein'))], 'a')
    ],
    transfer: { text: T('换成同样大小的钢块（ρ = 7800 kg/m³）。', 'Now a steel block of the same size (ρ = 7800 kg/m³).', 'Nun ein gleich großer Stahlblock (ρ = 7800 kg/m³).'), inputs: { As: 0.05, d: 0.2, rhoB: 7800, rhoF: 1000, g: 10 }, questions: [
      byCondition('t1', T('钢块会怎样？', 'What does the steel block do?', 'Was macht der Stahlblock?'), [o('floats', T('漂浮', 'Floats', 'Schwimmt')), o('neutral', T('悬浮', 'Hovers', 'Schwebt')), o('sinks', T('沉底', 'Sinks', 'Sinkt'))]),
      num('t2', 'Fn', T('沉底后容器底对它的支持力是多少？', 'Once on the bottom, what support force does the bottom exert?', 'Welche Stützkraft übt der Boden aus, wenn er unten liegt?'), ['N', 'kg', 'Pa'], { hints: [T('支持力 = 重力 − 浮力（完全浸没）。', 'Support = weight − buoyancy (fully submerged).', 'Stützkraft = Gewicht − Auftrieb (ganz eingetaucht).')] })
    ] },
    open: { template: 'floating-block' }
  },
  {
    id: 'act-units', title: T('单位、量纲与温标', 'Units, dimensions and temperature scales', 'Einheiten, Dimensionen und Temperaturskalen'), stage: 'j', models: ['G06', 'G01'],
    goals: [T('区分温度与温差：温差在 K 与 °C 中数值相同', 'Tell temperature from temperature difference: a difference is the same in K and °C', 'Temperatur und Temperaturdifferenz unterscheiden: Differenzen sind in K und °C gleich'), T('用量纲判断式子能否相加', 'Use dimensions to decide whether quantities can be added', 'Mit Dimensionen entscheiden, ob Größen addiert werden dürfen')],
    prerequisites: {},
    inputs: { T1: 293.15, dT: 10, m: 2, a: 3, v: 4 },
    diagnostic: [fixed('d1', 'concept', T('水从 20 °C 升到 30 °C，温度升高了多少 K？', 'Water warms from 20 °C to 30 °C. By how many kelvin did it warm?', 'Wasser erwärmt sich von 20 °C auf 30 °C. Um wie viele Kelvin?'), [o('k10', T('10 K', '10 K', '10 K')), o('k283', T('283.15 K', '283.15 K', '283,15 K'), T('温差不加 273.15；只有温度读数之间换算才要加。', 'Differences do not get 273.15 added; only readings are converted that way.', 'Zu Differenzen wird nicht 273,15 addiert; nur Ablesewerte werden so umgerechnet.')), o('k303', T('303.15 K', '303.15 K', '303,15 K'), T('303.15 K 是末温，不是升高的量。', '303.15 K is the final temperature, not the rise.', '303,15 K ist die Endtemperatur, nicht die Erhöhung.'))], 'k10')],
    predict: { question: trend('p', 'dTK', T('改变初温（其他不变），以 K 表示的温差会怎样变化？', 'Change the initial temperature (nothing else): how does the difference in K change?', 'Die Anfangstemperatur ändern (sonst nichts): wie ändert sich die Differenz in K?')), ...trendWhy(T('1 K 与 1 °C 的温差大小相同', 'A step of 1 K equals a step of 1 °C', 'Ein Schritt von 1 K entspricht einem Schritt von 1 °C'), [T('温度越高，开尔文越大', 'The hotter, the larger the kelvin', 'Je heißer, desto größer das Kelvin'), T('温差也要加 273.15', 'Differences also get 273.15', 'Auch Differenzen bekommen 273,15')]) },
    experiment: { vary: 'T1', values: [253.15, 273.15, 293.15, 373.15], observe: ['TK', 'tC', 'dTK'], note: T('只改变初温。', 'Only the initial temperature changes.', 'Nur die Anfangstemperatur ändert sich.') },
    questions: [
      num('q1', 'F', T('m = 2 kg，a = 3 m/s²：合力是多少？', 'm = 2 kg, a = 3 m/s²: what is the net force?', 'm = 2 kg, a = 3 m/s²: wie groß ist die resultierende Kraft?'), ['N', 'kg·m/s', 'J'], { hints: [T('N = kg·m/s²。', 'N = kg·m/s².', 'N = kg·m/s².')] }),
      num('q2', 'p', T('v = 4 m/s：动量是多少？', 'v = 4 m/s: what is the momentum?', 'v = 4 m/s: wie groß ist der Impuls?'), ['kg·m/s', 'N', 'J']),
      fixed('q3', 'explanation', T('为什么不能把 3 m/s² 与 4 m/s 相加？', 'Why can 3 m/s² and 4 m/s not be added?', 'Warum kann man 3 m/s² und 4 m/s nicht addieren?'), [o('a', T('两者量纲不同', 'They have different dimensions', 'Sie haben verschiedene Dimensionen')), o('b', T('数字太小', 'The numbers are too small', 'Die Zahlen sind zu klein')), o('c', T('可以相加，得 7', 'They can: the sum is 7', 'Doch: die Summe ist 7'), T('不同量纲的量相加没有物理意义。', 'Adding quantities of different dimensions has no physical meaning.', 'Größen verschiedener Dimension zu addieren ergibt keinen Sinn.'))], 'a')
    ],
    transfer: { text: T('m = 0.5 kg，a = 9.8 m/s²，v = 2 m/s。', 'm = 0.5 kg, a = 9.8 m/s², v = 2 m/s.', 'm = 0,5 kg, a = 9,8 m/s², v = 2 m/s.'), inputs: { T1: 373.15, dT: 25, m: 0.5, a: 9.8, v: 2 }, questions: [num('t1', 'F', T('合力？', 'Net force?', 'Resultierende Kraft?'), ['N', 'J', 'W']), num('t2', 'dTK', T('温差 25 °C 等于多少 K？', 'A difference of 25 °C is how many kelvin?', 'Eine Differenz von 25 °C sind wie viele Kelvin?'), ['K', 'J', 'm'])] }
  },
  {
    id: 'act-freefall', title: T('自由落体与事件前后', 'Free fall and the two sides of an event', 'Freier Fall und die zwei Seiten eines Ereignisses'), stage: 's', models: ['M03'],
    goals: [T('由高度求落地时间与速度', 'Find the fall time and impact speed from the height', 'Aus der Höhe Fallzeit und Aufprallgeschwindigkeit bestimmen'), T('区分碰撞前与碰撞后的速度', 'Tell the speed before the impact from the speed after it', 'Geschwindigkeit vor und nach dem Aufprall unterscheiden')],
    prerequisites: { activities: ['act-units'] },
    inputs: { h: 20, g: 9.8, e: 0 },
    diagnostic: [fixed('d1', 'concept', T('不计空气阻力，同一高度释放的铁球和木球谁先落地？', 'Without air resistance, an iron ball and a wooden ball are released from the same height. Which lands first?', 'Ohne Luftwiderstand werden eine Eisen- und eine Holzkugel aus gleicher Höhe losgelassen. Welche landet zuerst?'), [o('same', T('同时落地', 'Both at the same time', 'Beide gleichzeitig')), o('heavy', T('铁球先落地', 'The iron ball', 'Die Eisenkugel'), T('重力加速度与质量无关。', 'The acceleration of gravity does not depend on the mass.', 'Die Fallbeschleunigung hängt nicht von der Masse ab.')), o('light', T('木球先落地', 'The wooden ball', 'Die Holzkugel'))], 'same')],
    predict: { question: trend('p', 'vBefore', T('只改变恢复系数 e，落地前瞬间的速度如何变化？', 'Changing only the restitution e: how does the speed just before the impact change?', 'Nur die Stoßzahl e ändern: wie ändert sich die Geschwindigkeit kurz vor dem Aufprall?')), ...trendWhy(T('碰撞前的运动与 e 无关，e 只决定碰后', 'The motion before the impact knows nothing of e; e decides only what follows', 'Die Bewegung vor dem Aufprall hängt nicht von e ab; e bestimmt nur das Danach'), [T('e 越大下落越快', 'A larger e makes it fall faster', 'Ein größeres e lässt schneller fallen'), T('e 越大落地越慢', 'A larger e makes it land more slowly', 'Ein größeres e lässt langsamer aufkommen')]) },
    experiment: { vary: 'e', values: [0, 0.5, 0.8, 1], observe: ['vBefore', 'vAfter', 'hBounce'], note: T('只改变恢复系数；高度与 g 不变。', 'Only the restitution changes; height and g stay.', 'Nur die Stoßzahl ändert sich; Höhe und g bleiben.') },
    questions: [
      num('q1', 't', T('h = 20 m、g = 9.8 m/s²：下落时间？', 'h = 20 m, g = 9.8 m/s²: fall time?', 'h = 20 m, g = 9,8 m/s²: Fallzeit?'), ['s', 'm/s', 'm'], { hints: [T('h = ½gt²。', 'h = ½gt².', 'h = ½gt².')] }),
      num('q2', 'vBefore', T('落地前瞬间的速率？', 'Speed just before the impact?', 'Geschwindigkeit kurz vor dem Aufprall?'), ['m/s', 'm/s²', 'J'], { hints: [T('v² = 2gh。', 'v² = 2gh.', 'v² = 2gh.')] }),
      fixed('q3', 'explanation', T('“落地时的速度”为什么要说明是碰前还是碰后？', 'Why must “the speed at landing” say before or after the impact?', 'Warum muss „die Geschwindigkeit beim Aufprall“ vorher oder nachher angeben?'), [o('a', T('碰撞是一个事件，两侧速度不同', 'The impact is an event with different speeds on its two sides', 'Der Aufprall ist ein Ereignis mit verschiedenen Geschwindigkeiten auf beiden Seiten')), o('b', T('两者总相同', 'They are always equal', 'Sie sind immer gleich')), o('c', T('只是说法不同', 'It is only wording', 'Es ist nur eine Formulierung'))], 'a')
    ],
    transfer: { text: T('h = 5 m，e = 0.8 的弹跳。', 'A bounce from h = 5 m with e = 0.8.', 'Ein Aufprall aus h = 5 m mit e = 0,8.'), inputs: { h: 5, g: 9.8, e: 0.8 }, questions: [num('t1', 'vAfter', T('碰后瞬间的速率？', 'Speed just after the impact?', 'Geschwindigkeit kurz nach dem Aufprall?'), ['m/s', 'm', 's']), num('t2', 'hBounce', T('弹起的最大高度？', 'Height of the bounce?', 'Höhe des Rücksprungs?'), ['m', 'm/s', 's'])] },
    open: { template: 'free-fall' }
  },
  {
    id: 'act-incline', title: T('斜面受力分析（可全键盘完成）', 'Forces on an incline (fully by keyboard)', 'Kräfte auf der schiefen Ebene (vollständig per Tastatur)'), stage: 's', models: ['M07'],
    goals: [T('画出斜面上物块的受力并判断摩擦方向', 'Identify the forces on a block on an incline and the direction of friction', 'Die Kräfte auf einen Block auf der schiefen Ebene und die Reibungsrichtung bestimmen'), T('按运动状态选择下滑、上滑或静止分支', 'Choose the branch (sliding down, up, at rest) from the state of motion', 'Den Zweig (abwärts, aufwärts, Ruhe) nach dem Bewegungszustand wählen')],
    prerequisites: { activities: ['act-static'], models: ['M02', 'M08'] },
    inputs: { m: 2, theta: deg(30), muS: 0.25, muK: 0.2, g: 9.8, v0: 1 },
    diagnostic: [fixed('d1', 'concept', T('物块沿斜面下滑时，滑动摩擦力的方向是？', 'A block slides down an incline. Which way does kinetic friction point?', 'Ein Block gleitet hangabwärts. In welche Richtung zeigt die Gleitreibung?'), [o('opp', T('与相对滑动方向相反', 'Against the relative sliding', 'Entgegen der relativen Gleitbewegung')), o('up', T('总是沿斜面向上', 'Always up the incline', 'Immer hangaufwärts'), T('物块向上滑时摩擦力沿斜面向下。', 'When the block slides up, friction points down the incline.', 'Gleitet der Block aufwärts, zeigt die Reibung hangabwärts.')), o('along', T('与运动方向相同', 'Along the motion', 'In Bewegungsrichtung'))], 'opp')],
    predict: { question: byCondition('p', T('物块以 1 m/s 沿斜面向下运动（θ = 30°）。接下来它处于哪种状态？', 'The block moves down the 30° incline at 1 m/s. Which state follows?', 'Der Block bewegt sich mit 1 m/s die 30°-Ebene hinab. Welcher Zustand folgt?'), [o('slideDown', T('向下滑动', 'Sliding down', 'Gleitet abwärts')), o('slideUp', T('向上滑动', 'Sliding up', 'Gleitet aufwärts')), o('stick', T('静止', 'At rest', 'In Ruhe'))]), ...trendWhy(T('它已经在向下运动，摩擦只能阻碍相对滑动', 'It already moves down; friction can only oppose the relative sliding', 'Er bewegt sich bereits abwärts; Reibung kann nur der Gleitbewegung entgegenwirken'), [T('μs 大于 0 就会静止', 'Any μs > 0 keeps it at rest', 'Jedes μs > 0 hält ihn fest'), T('重力分力总是让它向上', 'The weight component pushes it up', 'Der Hangabtrieb drückt ihn aufwärts')]) },
    experiment: { vary: 'theta', values: [deg(10), deg(20), deg(30), deg(40)], observe: ['a', 'N', 'f'], note: T('只改变倾角；物块初速度向下 1 m/s 不变。', 'Only the angle changes; the block keeps its initial 1 m/s down the incline.', 'Nur der Winkel ändert sich; der Block behält seine anfänglichen 1 m/s abwärts.') },
    questions: [
      { kind: 'multi', id: 'q1', dimension: 'modelling', prompt: T('选出物块受到的全部力（空格勾选）。', 'Select every force on the block (Space toggles).', 'Alle Kräfte auf den Block auswählen (Leertaste schaltet).'), options: [o('G', T('重力', 'Weight', 'Gewichtskraft')), o('N', T('斜面支持力', 'Normal force of the incline', 'Normalkraft der Ebene')), o('f', T('摩擦力', 'Friction', 'Reibung')), o('down', T('“下滑力”', 'A “sliding force”', 'Eine „Hangabtriebskraft“ als eigene Kraft'), T('下滑的趋势来自重力的分力，不是另一个力。', 'The pull down the incline is a component of the weight, not another force.', 'Der Zug hangabwärts ist eine Komponente der Gewichtskraft, keine weitere Kraft.')), o('v', T('“惯性力”', 'An “inertial force”', 'Eine „Trägheitskraft“'))], answer: ['G', 'N', 'f'], hints: [T('只数有施力物体的力：地球、斜面。', 'Count only forces with an agent: the Earth and the incline.', 'Nur Kräfte mit Verursacher zählen: Erde und Ebene.')] },
      byCondition('q2', T('摩擦力沿斜面的方向（方向键选择）？', 'Direction of friction along the incline (arrow keys choose)?', 'Richtung der Reibung längs der Ebene (Pfeiltasten wählen)?'), [o('up', T('沿斜面向上', 'Up the incline', 'Hangaufwärts')), o('down', T('沿斜面向下', 'Down the incline', 'Hangabwärts'))], [T('看物块相对斜面的运动方向。', 'Look at how the block moves relative to the incline.', 'Auf die Bewegung des Blocks relativ zur Ebene achten.')], { slideDown: 'up', slideUp: 'down', stick: 'up' }),
      num('q3', 'N', T('支持力的大小？', 'Size of the normal force?', 'Betrag der Normalkraft?'), ['N', 'kg', 'm/s²'], { hints: [T('垂直斜面方向平衡：N = mg cos θ。', 'Balance perpendicular to the incline: N = mg cos θ.', 'Gleichgewicht senkrecht zur Ebene: N = mg cos θ.')] }),
      num('q4', 'a', T('沿斜面的加速度（向下为正）？', 'Acceleration along the incline (down positive)?', 'Beschleunigung längs der Ebene (abwärts positiv)?'), ['m/s²', 'm/s', 'N'], { signed: true, hints: [T('ma = mg sin θ − μk mg cos θ。', 'ma = mg sin θ − μk mg cos θ.', 'ma = mg sin θ − μk mg cos θ.')] })
    ],
    transfer: { text: T('同一物块静止放在 10° 的斜面上。', 'The same block placed at rest on a 10° incline.', 'Derselbe Block ruhend auf einer 10°-Ebene.'), inputs: { m: 2, theta: deg(10), muS: 0.25, muK: 0.2, g: 9.8, v0: 0 }, questions: [
      byCondition('t1', T('它会怎样？', 'What does it do?', 'Was macht er?'), [o('slideDown', T('向下滑动', 'Slides down', 'Gleitet abwärts')), o('slideUp', T('向上滑动', 'Slides up', 'Gleitet aufwärts')), o('stick', T('保持静止', 'Stays at rest', 'Bleibt in Ruhe'))], [T('比较 tan θ 与 μs。', 'Compare tan θ with μs.', 'tan θ mit μs vergleichen.')]),
      num('t2', 'f', T('此时摩擦力的大小？', 'Size of the friction force now?', 'Betrag der Reibungskraft jetzt?'), ['N', 'm/s²', 'kg'], { hints: [T('静摩擦力等于重力沿斜面的分力，不是 μs N。', 'Static friction equals the weight component along the incline, not μs N.', 'Die Haftreibung gleicht den Hangabtrieb aus, sie ist nicht μs N.')] })
    ] },
    open: { template: 'incline' }
  },
  {
    id: 'act-static', title: T('静摩擦的阈值', 'The static-friction threshold', 'Die Schwelle der Haftreibung'), stage: 's', models: ['M08'],
    goals: [T('静摩擦力随外力变化，最大为 μs N', 'Static friction follows the applied force up to μs N', 'Haftreibung folgt der angreifenden Kraft bis μs N'), T('超过阈值后改用滑动摩擦 μk N', 'Past the threshold kinetic friction μk N applies', 'Nach der Schwelle gilt Gleitreibung μk N')],
    prerequisites: {},
    inputs: { m: 2, muS: 0.4, muK: 0.3, g: 10, F: 6, v0: 0 },
    diagnostic: [fixed('d1', 'concept', T('静止木箱受到的静摩擦力总是等于 μs N 吗？', 'Is the static friction on a box at rest always μs N?', 'Ist die Haftreibung auf eine ruhende Kiste immer μs N?'), [o('no', T('不是：最大为 μs N，静止时等于所需的平衡力', 'No: at most μs N; at rest it is whatever balances the push', 'Nein: höchstens μs N; in Ruhe so groß wie zum Gleichgewicht nötig')), o('yes', T('是', 'Yes', 'Ja'), T('μs N 只是上限。', 'μs N is only the upper limit.', 'μs N ist nur die Obergrenze.')), o('kin', T('等于 μk N', 'It is μk N', 'Sie ist μk N'))], 'no')],
    predict: { question: byCondition('p', T('用 6 N 水平推静止的 2 kg 木箱（μs = 0.4，g = 10）。它会？', 'A 6 N horizontal push on a 2 kg box at rest (μs = 0.4, g = 10). It will…', 'Ein waagrechter Schub von 6 N auf eine ruhende 2-kg-Kiste (μs = 0,4, g = 10). Sie wird…'), [o('static', T('保持静止', 'Stay at rest', 'In Ruhe bleiben')), o('sliding', T('开始滑动', 'Start to slide', 'Zu gleiten beginnen'))]), ...trendWhy(T('6 N 小于最大静摩擦 8 N', '6 N is below the maximum static friction of 8 N', '6 N liegt unter der maximalen Haftreibung von 8 N'), [T('任何推力都能推动', 'Any push moves it', 'Jeder Schub bewegt sie'), T('推力大于重力才会动', 'Only a push larger than the weight moves it', 'Nur ein Schub größer als das Gewicht bewegt sie')]) },
    experiment: { vary: 'F', values: [2, 4, 6, 8, 9, 12], observe: ['f', 'a'], note: T('只改变推力；质量与摩擦因数不变。', 'Only the push changes; mass and coefficients stay.', 'Nur der Schub ändert sich; Masse und Reibungszahlen bleiben.') },
    questions: [
      num('q1', 'fmax', T('最大静摩擦力？', 'Maximum static friction?', 'Maximale Haftreibung?'), ['N', 'kg', 'm/s²']),
      num('q2', 'f', T('推力 6 N 时的摩擦力？', 'Friction with the 6 N push?', 'Reibung beim Schub von 6 N?'), ['N', 'kg', 'J'], { hints: [T('静止：摩擦力与推力平衡。', 'At rest: friction balances the push.', 'In Ruhe: Reibung und Schub halten sich die Waage.')] }),
      fixed('q3', 'explanation', T('为什么开始滑动后摩擦力会变小？', 'Why does friction drop once the box slides?', 'Warum sinkt die Reibung, sobald die Kiste gleitet?'), [o('a', T('滑动摩擦因数 μk 小于 μs', 'The kinetic coefficient μk is smaller than μs', 'Die Gleitreibungszahl μk ist kleiner als μs')), o('b', T('推力变小了', 'The push got smaller', 'Der Schub wurde kleiner')), o('c', T('重力变小了', 'The weight got smaller', 'Das Gewicht wurde kleiner'))], 'a')
    ],
    transfer: { text: T('推力增大到 9 N。', 'The push grows to 9 N.', 'Der Schub steigt auf 9 N.'), inputs: { m: 2, muS: 0.4, muK: 0.3, g: 10, F: 9, v0: 0 }, questions: [byCondition('t1', T('木箱会？', 'The box will…', 'Die Kiste wird…'), [o('static', T('静止', 'stay at rest', 'ruhen')), o('sliding', T('滑动', 'slide', 'gleiten'))]), num('t2', 'a', T('加速度？', 'Acceleration?', 'Beschleunigung?'), ['m/s²', 'N', 'm/s'])] },
    open: { template: 'pull-force' }
  },
  {
    id: 'act-series', title: T('串联与并联', 'Series and parallel', 'Reihen- und Parallelschaltung'), stage: 'j', models: ['E09'],
    goals: [T('求串、并联的等效电阻与各支路电流', 'Find the equivalent resistance and branch currents of series and parallel circuits', 'Ersatzwiderstand und Zweigströme von Reihen- und Parallelschaltungen bestimmen')],
    prerequisites: { note: T('知道欧姆定律 I = U/R', 'Know Ohm’s law I = U/R', 'Das ohmsche Gesetz I = U/R kennen') },
    inputs: { R1: 6, R2: 3, U: 9 },
    diagnostic: [fixed('d1', 'concept', T('两个电阻串联，经过第一个电阻后电流会？', 'Two resistors in series: after the first one the current…', 'Zwei Widerstände in Reihe: nach dem ersten ist der Strom…'), [o('same', T('不变：串联各处电流相同', 'is the same: one current everywhere in series', 'gleich: in Reihe überall derselbe Strom')), o('less', T('变小：被电阻“用掉”一部分', 'smaller: partly “used up”', 'kleiner: teilweise „verbraucht“'), T('电荷守恒：电流不会被用掉，被消耗的是能量。', 'Charge is conserved: current is not used up, energy is.', 'Ladung bleibt erhalten: verbraucht wird Energie, nicht Strom.')), o('more', T('变大', 'larger', 'größer'))], 'same')],
    predict: { question: trend('p', 'Is', T('增大 R2，串联电流如何变化？', 'Increase R2: how does the series current change?', 'R2 vergrößern: wie ändert sich der Reihenstrom?')), ...trendWhy(T('总电阻变大，电压不变', 'The total resistance grows at the same voltage', 'Der Gesamtwiderstand steigt bei gleicher Spannung'), [T('电流与电阻无关', 'The current does not depend on resistance', 'Der Strom hängt nicht vom Widerstand ab')]) },
    experiment: { vary: 'R2', values: [1, 3, 6, 12], observe: ['Rs', 'Is', 'Rp', 'Ip'], note: T('只改变 R2。', 'Only R2 changes.', 'Nur R2 ändert sich.') },
    questions: [
      num('q1', 'Rs', T('串联总电阻？', 'Series resistance?', 'Reihenwiderstand?'), ['Ω', 'V', 'A']),
      num('q2', 'Is', T('串联电流？', 'Series current?', 'Reihenstrom?'), ['A', 'V', 'Ω']),
      num('q3', 'Ip', T('并联时的总电流？', 'Total current in parallel?', 'Gesamtstrom parallel?'), ['A', 'W', 'Ω'], { hints: [T('先求并联电阻 R1R2/(R1+R2)。', 'First the parallel resistance R1R2/(R1+R2).', 'Zuerst der Parallelwiderstand R1R2/(R1+R2).')] }),
      fixed('q4', 'explanation', T('并联总电阻与最小分电阻相比？', 'The parallel resistance compared with the smallest branch?', 'Der Parallelwiderstand im Vergleich zum kleinsten Zweig?'), [o('a', T('更小：多一条通路', 'Smaller: there is one more path', 'Kleiner: es gibt einen Weg mehr')), o('b', T('相等', 'Equal', 'Gleich')), o('c', T('更大', 'Larger', 'Größer'))], 'a')
    ],
    transfer: { text: T('R1 = 10 Ω，R2 = 40 Ω，U = 12 V。', 'R1 = 10 Ω, R2 = 40 Ω, U = 12 V.', 'R1 = 10 Ω, R2 = 40 Ω, U = 12 V.'), inputs: { R1: 10, R2: 40, U: 12 }, questions: [num('t1', 'U1', T('串联时 R1 两端电压？', 'Voltage across R1 in series?', 'Spannung an R1 in Reihe?'), ['V', 'A', 'Ω']), num('t2', 'I2', T('并联时 R2 的电流？', 'Current through R2 in parallel?', 'Strom durch R2 parallel?'), ['A', 'V', 'W'])] },
    open: { lab: 'circuit', preset: 'series' }
  },
  {
    id: 'act-meter', title: T('电表内阻与测量干扰', 'Meter resistance and measurement disturbance', 'Messgeräteinnenwiderstand und Messfehler'), stage: 's', models: ['E13'],
    goals: [T('解释电压表内阻如何改变被测电路', 'Explain how a voltmeter’s resistance changes the circuit it measures', 'Erklären, wie der Innenwiderstand eines Voltmeters die Schaltung ändert')],
    prerequisites: { activities: ['act-series'] },
    inputs: { Vs: 10, R1: 1e4, R2: 1e4, RV: 1e5 },
    diagnostic: [fixed('d1', 'concept', T('理想电压表与实际电压表的区别？', 'Ideal versus real voltmeter?', 'Ideales gegenüber realem Voltmeter?'), [o('a', T('理想表不分流；实际表并联后会改变电路', 'An ideal meter draws no current; a real one changes the circuit', 'Ein ideales zieht keinen Strom; ein reales verändert die Schaltung')), o('b', T('没有区别', 'No difference', 'Kein Unterschied'), T('实际电压表有有限内阻，会分去电流。', 'A real voltmeter has a finite resistance and draws current.', 'Ein reales Voltmeter hat einen endlichen Widerstand und zieht Strom.')), o('c', T('实际表读数总偏大', 'A real one always reads high', 'Ein reales zeigt immer zu viel'))], 'a')],
    predict: { question: trend('p', 'Vread', T('增大电压表内阻，读数如何变化？', 'Increase the meter resistance: how does the reading change?', 'Den Innenwiderstand vergrößern: wie ändert sich die Anzeige?')), ...trendWhy(T('表分走的电流更少，更接近真实值', 'The meter draws less current and reads closer to the true value', 'Das Gerät zieht weniger Strom und zeigt näher am wahren Wert'), [T('内阻越大，分压越多所以读数越小', 'More resistance takes more voltage, so it reads less', 'Mehr Widerstand nimmt mehr Spannung, also weniger Anzeige')]) },
    experiment: { vary: 'RV', values: [1e4, 1e5, 1e6, 1e7], observe: ['Vread', 'err'], note: T('只改变电压表内阻。', 'Only the meter resistance changes.', 'Nur der Innenwiderstand ändert sich.') },
    questions: [
      num('q1', 'Vread', T('电压表读数？', 'Meter reading?', 'Anzeige?'), ['V', 'A', 'Ω'], { hints: [T('R2 与 RV 并联后再与 R1 分压。', 'R2 parallel to RV, then the divider with R1.', 'R2 parallel zu RV, dann Teiler mit R1.')] }),
      num('q2', 'err', T('相对误差（读数偏小为负）？', 'Relative error (negative when it reads low)?', 'Relativer Fehler (negativ bei zu kleiner Anzeige)?'), ['', 'V', 'Ω'], { signed: true, scale: 0.01 }),
      fixed('q3', 'explanation', T('为什么读数偏小？', 'Why does it read low?', 'Warum zeigt es zu wenig?'), [o('a', T('电压表与 R2 并联，使这部分电阻变小', 'In parallel with R2 the meter lowers that part’s resistance', 'Parallel zu R2 senkt das Gerät den Widerstand dieses Teils')), o('b', T('电源电压下降', 'The source voltage drops', 'Die Quellenspannung sinkt')), o('c', T('电压表本身有电动势', 'The meter has its own emf', 'Das Gerät hat eine eigene Spannung'))], 'a')
    ],
    transfer: { text: T('R1 = R2 = 100 kΩ，RV = 1 MΩ。', 'R1 = R2 = 100 kΩ, RV = 1 MΩ.', 'R1 = R2 = 100 kΩ, RV = 1 MΩ.'), inputs: { Vs: 10, R1: 1e5, R2: 1e5, RV: 1e6 }, questions: [num('t1', 'Vread', T('读数？', 'Reading?', 'Anzeige?'), ['V', 'A', 'Ω'])] },
    open: { lab: 'circuit', preset: 'divider' }
  },
  {
    id: 'act-rc', title: T('RC 充电：测时间常数', 'RC charging: measuring the time constant', 'RC-Laden: die Zeitkonstante messen'), stage: 's', models: ['E15'],
    goals: [T('由充电曲线读出 τ 并与 RC 比较', 'Read τ from the charging curve and compare it with RC', 'τ aus der Ladekurve ablesen und mit RC vergleichen'), T('由测量数据反推未知电容', 'Infer an unknown capacitance from measured data', 'Aus Messdaten eine unbekannte Kapazität bestimmen')],
    prerequisites: { activities: ['act-series'] },
    inputs: { R: 1000, C: 1e-4, Vs: 5, V0: 0, t: 0.1 },
    diagnostic: [fixed('d1', 'concept', T('经过一个时间常数 τ，从零开始充电的电容器两端电压约为？', 'After one time constant τ, a capacitor charged from zero is at about…', 'Nach einer Zeitkonstante τ liegt ein von null geladener Kondensator bei etwa…'), [o('63', T('电源电压的 63 %', '63 % of the source voltage', '63 % der Quellenspannung')), o('100', T('电源电压（已充满）', 'the full source voltage', 'der vollen Quellenspannung'), T('指数充电永远不会在有限时间内“充满”。', 'Exponential charging is never “full” in finite time.', 'Exponentielles Laden ist nie in endlicher Zeit „voll“.')), o('50', T('一半', 'half', 'der Hälfte'), T('一半出现在 τ·ln 2 ≈ 0.69τ。', 'Half is reached at τ·ln 2 ≈ 0.69τ.', 'Die Hälfte wird bei τ·ln 2 ≈ 0,69τ erreicht.'))], '63')],
    predict: { question: trend('p', 'tau', T('电容不变，增大 R，τ 如何变化？', 'Same capacitor, larger R: how does τ change?', 'Gleicher Kondensator, größeres R: wie ändert sich τ?')), ...trendWhy(T('电流更小，充同样电荷需要更久', 'A smaller current takes longer to bring the same charge', 'Ein kleinerer Strom braucht länger für dieselbe Ladung'), [T('电阻只影响终值', 'R only changes the final value', 'R ändert nur den Endwert')]) },
    experiment: { vary: 'R', values: [250, 500, 1000, 2000], observe: ['tau', 'VC'], note: T('只改变电阻；电容、电源与读数时刻 t = 0.1 s 不变。', 'Only R changes; capacitor, source and the reading time t = 0.1 s stay.', 'Nur R ändert sich; Kondensator, Quelle und Ablesezeit t = 0,1 s bleiben.') },
    questions: [
      num('q1', 'tau', T('τ = ?', 'τ = ?', 'τ = ?'), ['s', 'Ω', 'F'], { hints: [T('τ = RC，Ω·F = s。', 'τ = RC, Ω·F = s.', 'τ = RC, Ω·F = s.')] }),
      num('q2', 'VC', T('t = 0.1 s 时电容电压？', 'Capacitor voltage at t = 0.1 s?', 'Kondensatorspannung bei t = 0,1 s?'), ['V', 'A', 's'], { hints: [T('VC = Vs(1 − e^{−t/τ})。', 'VC = Vs(1 − e^{−t/τ}).', 'VC = Vs(1 − e^{−t/τ}).')] }),
      num('q3', 'I', T('此刻的电流？', 'Current at that moment?', 'Strom in diesem Moment?'), ['A', 'V', 'W']),
      fixed('q4', 'explanation', T('为什么常用 63 % 点测 τ？', 'Why measure τ at the 63 % point?', 'Warum τ beim 63-%-Punkt messen?'), [o('a', T('VC(τ) = Vs(1 − e⁻¹) 与 R、C 的具体值无关', 'VC(τ) = Vs(1 − e⁻¹) whatever R and C are', 'VC(τ) = Vs(1 − e⁻¹) unabhängig von R und C')), o('b', T('那时电流最大', 'The current is largest then', 'Dann ist der Strom am größten')), o('c', T('那时已经充满', 'It is full then', 'Dann ist er voll'))], 'a')
    ],
    transfer: { text: T('R = 2.2 kΩ、C = 47 μF、Vs = 9 V，t = 0.2 s。', 'R = 2.2 kΩ, C = 47 μF, Vs = 9 V, t = 0.2 s.', 'R = 2,2 kΩ, C = 47 μF, Vs = 9 V, t = 0,2 s.'), inputs: { R: 2200, C: 4.7e-5, Vs: 9, V0: 0, t: 0.2 }, questions: [num('t1', 'tau', T('τ？', 'τ?', 'τ?'), ['s', 'Hz', 'F']), num('t2', 'VC', T('t = 0.2 s 时的电压？', 'Voltage at t = 0.2 s?', 'Spannung bei t = 0,2 s?'), ['V', 'A', 'J'])] },
    open: { lab: 'circuit', preset: 'rc' }
  },
  {
    id: 'act-lc', title: T('LC 振荡的能量交换', 'Energy exchange in an LC circuit', 'Energieaustausch im LC-Kreis'), stage: 's', models: ['E17'],
    goals: [T('由 L、C 求周期，理解电场能与磁场能的交换', 'Find the period from L and C and follow the exchange of electric and magnetic energy', 'Die Periode aus L und C bestimmen und den Austausch von elektrischer und magnetischer Energie verfolgen')],
    prerequisites: { activities: ['act-rc'] },
    inputs: { L: 1, C: 1e-4, V0: 10, I0: 0 },
    diagnostic: [fixed('d1', 'concept', T('理想 LC 电路中，电容器电压为零的瞬间电流？', 'In an ideal LC circuit, when the capacitor voltage is zero the current is…', 'Im idealen LC-Kreis ist der Strom, wenn die Kondensatorspannung null ist,…'), [o('max', T('最大', 'largest', 'am größten')), o('zero', T('也为零', 'also zero', 'auch null'), T('能量没有消失，全部在线圈的磁场中。', 'The energy has not vanished; it is all in the coil’s field.', 'Die Energie ist nicht verschwunden; sie steckt ganz im Magnetfeld der Spule.')), o('half', T('一半', 'half its maximum', 'halb so groß'))], 'max')],
    predict: { question: trend('p', 'T', T('增大电容，周期如何变化？', 'Increase C: how does the period change?', 'C vergrößern: wie ändert sich die Periode?')), ...trendWhy(T('T = 2π√(LC)，随 C 增大', 'T = 2π√(LC) grows with C', 'T = 2π√(LC) wächst mit C'), [T('周期只取决于 L', 'The period depends only on L', 'Die Periode hängt nur von L ab')]) },
    experiment: { vary: 'C', values: [2.5e-5, 1e-4, 4e-4], observe: ['T', 'Imax', 'U'], note: T('只改变电容；初始电压不变。', 'Only C changes; the initial voltage stays.', 'Nur C ändert sich; die Anfangsspannung bleibt.') },
    questions: [
      num('q1', 'T', T('周期？', 'Period?', 'Periode?'), ['s', 'Hz', 'rad/s']),
      num('q2', 'Imax', T('最大电流？', 'Maximum current?', 'Höchster Strom?'), ['A', 'V', 'J'], { hints: [T('½CV0² = ½LImax²。', '½CV0² = ½LImax².', '½CV0² = ½LImax².')] }),
      num('q3', 'U', T('总能量？', 'Total energy?', 'Gesamtenergie?'), ['J', 'W', 'V']),
      fixed('q4', 'explanation', T('C 变为 4 倍，周期？', 'C four times larger: the period…', 'C viermal so groß: die Periode…'), [o('a', T('变为 2 倍', 'doubles', 'verdoppelt sich')), o('b', T('变为 4 倍', 'becomes four times longer', 'vervierfacht sich')), o('c', T('不变', 'stays', 'bleibt'))], 'a')
    ],
    transfer: { text: T('L = 0.5 H，C = 2 μF，V0 = 5 V。', 'L = 0.5 H, C = 2 μF, V0 = 5 V.', 'L = 0,5 H, C = 2 μF, V0 = 5 V.'), inputs: { L: 0.5, C: 2e-6, V0: 5, I0: 0 }, questions: [num('t1', 'omega', T('角频率？', 'Angular frequency?', 'Kreisfrequenz?'), ['rad/s', 'Hz', 's']), num('t2', 'Imax', T('最大电流？', 'Maximum current?', 'Höchster Strom?'), ['A', 'V', 'Ω'])] },
    open: { lab: 'circuit', preset: 'lc' }
  },
  {
    id: 'act-rail', title: T('导轨上的电磁感应', 'Induction on a rail', 'Induktion auf der Schiene'), stage: 's', models: ['B11', 'B10'],
    goals: [T('解释感应电流的阻碍作用与终端速度', 'Explain the braking by the induced current and the terminal speed', 'Die Bremswirkung des Induktionsstroms und die Endgeschwindigkeit erklären'), T('用能量账本：拉力做功 = 动能 + 焦耳热', 'Use the energy ledger: work of the pull = kinetic energy + Joule heat', 'Die Energiebilanz nutzen: Arbeit der Zugkraft = kinetische Energie + Joulesche Wärme')],
    prerequisites: { models: ['B10'], activities: ['act-series'] },
    inputs: { m: 1, B: 2, L: 0.5, R: 1, F: 4, t: 1, v0: 0 },
    diagnostic: [fixed('d1', 'concept', T('导体棒切割磁感线产生的感应电流受到的安培力？', 'The Ampère force on the induced current in a moving rod…', 'Die Ampère-Kraft auf den induzierten Strom im bewegten Stab…'), [o('a', T('阻碍棒的相对运动', 'opposes the rod’s motion', 'bremst die Bewegung des Stabs')), o('b', T('推动棒加速', 'pushes the rod faster', 'treibt den Stab an'), T('否则能量会凭空增加（楞次定律）。', 'Otherwise energy would appear from nothing (Lenz’s law).', 'Sonst entstünde Energie aus dem Nichts (Lenzsche Regel).')), o('c', T('与运动垂直，不做功', 'is perpendicular to the motion and does no work', 'steht senkrecht zur Bewegung und leistet keine Arbeit'))], 'a')],
    predict: { question: trend('p', 'vT', T('增大回路电阻 R，终端速度如何变化？', 'Increase the circuit resistance R: how does the terminal speed change?', 'Den Widerstand R vergrößern: wie ändert sich die Endgeschwindigkeit?')), ...trendWhy(T('电流变小，安培阻力 B²L²v/R 变小', 'The current drops, so the braking force B²L²v/R drops', 'Der Strom sinkt, also auch die Bremskraft B²L²v/R'), [T('R 越大，产生的热越多，所以越慢', 'More R makes more heat, so it is slower', 'Mehr R macht mehr Wärme, also langsamer')]) },
    experiment: { vary: 'R', values: [0.5, 1, 2, 4], observe: ['vT', 'v', 'Q'], note: T('只改变电阻；拉力、磁场与棒不变。', 'Only R changes; pull, field and rod stay.', 'Nur R ändert sich; Zug, Feld und Stab bleiben.') },
    questions: [
      num('q1', 'vT', T('终端速度？', 'Terminal speed?', 'Endgeschwindigkeit?'), ['m/s', 'm/s²', 'N'], { hints: [T('匀速时 F = B²L²v/R。', 'At constant speed F = B²L²v/R.', 'Bei konstanter Geschwindigkeit F = B²L²v/R.')] }),
      num('q2', 'v', T('t = 1 s 时的速度？', 'Speed at t = 1 s?', 'Geschwindigkeit bei t = 1 s?'), ['m/s', 'm', 's']),
      num('q3', 'Q', T('前 1 s 产生的焦耳热？', 'Joule heat in the first second?', 'Joulesche Wärme in der ersten Sekunde?'), ['J', 'W', 'N'], { hints: [T('Q = F·x − ½mv²。', 'Q = F·x − ½mv².', 'Q = F·x − ½mv².')] }),
      fixed('q4', 'explanation', T('拉力做的功去了哪里？', 'Where does the work of the pull go?', 'Wohin geht die Arbeit der Zugkraft?'), [o('a', T('棒的动能与电阻上的焦耳热', 'Kinetic energy of the rod and Joule heat in the resistor', 'Kinetische Energie des Stabs und Joulesche Wärme im Widerstand')), o('b', T('全部变成动能', 'All into kinetic energy', 'Ganz in kinetische Energie')), o('c', T('储存在磁场里', 'Stored in the magnetic field', 'Im Magnetfeld gespeichert'))], 'a')
    ],
    transfer: { text: T('B = 1 T，L = 1 m，R = 2 Ω，F = 2 N，m = 0.5 kg。', 'B = 1 T, L = 1 m, R = 2 Ω, F = 2 N, m = 0.5 kg.', 'B = 1 T, L = 1 m, R = 2 Ω, F = 2 N, m = 0,5 kg.'), inputs: { m: 0.5, B: 1, L: 1, R: 2, F: 2, t: 1, v0: 0 }, questions: [num('t1', 'vT', T('终端速度？', 'Terminal speed?', 'Endgeschwindigkeit?'), ['m/s', 'N', 'J'])] },
    open: { template: 'rail-force' }
  },
  {
    id: 'act-gas', title: T('理想气体的四个过程', 'Four processes of an ideal gas', 'Vier Prozesse des idealen Gases'), stage: 's', models: ['T10'],
    goals: [T('用第一定律 Q = ΔU + W 分析等温、等压、等容、绝热过程', 'Analyse isothermal, isobaric, isochoric and adiabatic processes with Q = ΔU + W', 'Isotherme, isobare, isochore und adiabatische Prozesse mit Q = ΔU + W analysieren')],
    prerequisites: { models: ['T08', 'T09'] },
    inputs: { n: 1, T1: 300, V1: 0.01, V2: 0.02, T2: 400, gamma: 1.4, proc: 1 },
    diagnostic: [fixed('d1', 'concept', T('理想气体等温膨胀时与外界有热交换吗？', 'Does an ideal gas exchange heat in an isothermal expansion?', 'Tauscht ein ideales Gas bei isothermer Expansion Wärme aus?'), [o('a', T('有：吸热等于对外做功', 'Yes: the heat taken in equals the work done', 'Ja: aufgenommene Wärme gleich verrichteter Arbeit')), o('b', T('没有：温度不变就没有热', 'No: constant temperature means no heat', 'Nein: konstante Temperatur heißt keine Wärme'), T('温度不变是 ΔU = 0，不是 Q = 0。', 'Constant temperature means ΔU = 0, not Q = 0.', 'Konstante Temperatur heißt ΔU = 0, nicht Q = 0.')), o('c', T('放热', 'It gives off heat', 'Es gibt Wärme ab'))], 'a')],
    predict: { question: trend('p', 'W', T('等温膨胀到更大的末体积，对外做功如何变化？', 'Isothermal expansion to a larger final volume: how does the work change?', 'Isotherme Expansion auf ein größeres Endvolumen: wie ändert sich die Arbeit?')), ...trendWhy(T('W = nRT ln(V2/V1) 随 V2 增大', 'W = nRT ln(V2/V1) grows with V2', 'W = nRT ln(V2/V1) wächst mit V2'), [T('等温过程不做功', 'Isothermal processes do no work', 'Isotherme Prozesse leisten keine Arbeit')]) },
    experiment: { vary: 'V2', values: [0.012, 0.015, 0.02, 0.03], observe: ['W', 'Q', 'dU'], note: T('只改变末体积；等温过程。', 'Only the final volume changes; isothermal.', 'Nur das Endvolumen ändert sich; isotherm.') },
    questions: [
      num('q1', 'W', T('等温膨胀到 0.02 m³ 对外做功？', 'Work in the isothermal expansion to 0.02 m³?', 'Arbeit bei isothermer Expansion auf 0,02 m³?'), ['J', 'Pa', 'm³']),
      num('q2', 'dU', T('内能变化？', 'Change of internal energy?', 'Änderung der inneren Energie?'), ['J', 'K', 'W'], { scale: 1 }),
      fixed('q3', 'explanation', T('为什么 Q = W？', 'Why is Q = W?', 'Warum ist Q = W?'), [o('a', T('理想气体内能只取决于温度，等温时 ΔU = 0', 'The internal energy of an ideal gas depends only on T; isothermal means ΔU = 0', 'Die innere Energie des idealen Gases hängt nur von T ab; isotherm heißt ΔU = 0')), o('b', T('巧合', 'Coincidence', 'Zufall')), o('c', T('压强不变', 'The pressure is constant', 'Der Druck ist konstant'))], 'a')
    ],
    transfer: { text: T('同样从 0.01 m³ 绝热膨胀到 0.02 m³（γ = 1.4）。', 'The same expansion from 0.01 m³ to 0.02 m³, but adiabatic (γ = 1.4).', 'Dieselbe Expansion von 0,01 m³ auf 0,02 m³, aber adiabatisch (γ = 1,4).'), inputs: { n: 1, T1: 300, V1: 0.01, V2: 0.02, T2: 400, gamma: 1.4, proc: 4 }, questions: [
      byCondition('t1', T('这是哪种过程？', 'Which process is it?', 'Welcher Prozess ist das?'), [o('iso', T('等温', 'Isothermal', 'Isotherm')), o('bar', T('等压', 'Isobaric', 'Isobar')), o('cho', T('等容', 'Isochoric', 'Isochor')), o('adi', T('绝热', 'Adiabatic', 'Adiabatisch'))]),
      num('t2', 'Tend', T('末温？', 'Final temperature?', 'Endtemperatur?'), ['K', 'J', 'Pa'], { hints: [T('TV^{γ−1} 不变。', 'TV^{γ−1} stays constant.', 'TV^{γ−1} bleibt konstant.')] })
    ] },
    open: { lab: 'gas' }
  },
  {
    id: 'act-well', title: T('无限深势阱的能级', 'Levels of the infinite well', 'Niveaus des unendlich tiefen Topfs'), stage: 'u', models: ['Q05'],
    goals: [T('能级随阱宽与量子数的变化：E ∝ n²/L²', 'How levels depend on width and quantum number: E ∝ n²/L²', 'Wie Niveaus von Breite und Quantenzahl abhängen: E ∝ n²/L²')],
    prerequisites: { models: ['Q03'] },
    inputs: { m: 9.1093837139e-31, Lw: 1e-9, n: 3 },
    diagnostic: [fixed('d1', 'concept', T('无限深势阱中粒子的最低能量？', 'The lowest energy of a particle in an infinite well…', 'Die niedrigste Energie eines Teilchens im unendlich tiefen Topf…'), [o('a', T('大于零（零点能）', 'is above zero (zero-point energy)', 'liegt über null (Nullpunktsenergie)')), o('b', T('为零：粒子可以静止在阱底', 'is zero: the particle can rest at the bottom', 'ist null: das Teilchen kann am Boden ruhen'), T('受限的位置意味着动量不能确定为零。', 'A confined position means the momentum cannot be exactly zero.', 'Ein eingeschränkter Ort bedeutet, dass der Impuls nicht genau null sein kann.')), o('c', T('为负', 'is negative', 'ist negativ'))], 'a')],
    predict: { question: trend('p', 'E1', T('把阱加宽，基态能量如何变化？', 'Widen the well: how does the ground-state energy change?', 'Den Topf verbreitern: wie ändert sich die Grundzustandsenergie?')), ...trendWhy(T('E ∝ 1/L²：约束变弱能量降低', 'E ∝ 1/L²: weaker confinement lowers the energy', 'E ∝ 1/L²: schwächere Einschränkung senkt die Energie'), [T('阱越宽能量越高', 'A wider well has higher energy', 'Ein breiterer Topf hat höhere Energie')]) },
    experiment: { vary: 'Lw', values: [0.5e-9, 1e-9, 2e-9], observe: ['E1', 'En'], note: T('只改变阱宽；电子质量与 n = 3 不变。', 'Only the width changes; electron mass and n = 3 stay.', 'Nur die Breite ändert sich; Elektronenmasse und n = 3 bleiben.') },
    questions: [
      num('q1', 'E1', T('1 nm 阱中电子的基态能量？', 'Ground-state energy of an electron in a 1 nm well?', 'Grundzustandsenergie eines Elektrons im 1-nm-Topf?'), ['J', 'W', 'N']),
      num('q2', 'ratio', T('E2/E1 = ?', 'E2/E1 = ?', 'E2/E1 = ?'), ['', 'J', 'm']),
      fixed('q3', 'explanation', T('第 n 个能级按什么规律增长？', 'How does the n-th level grow?', 'Wie wächst das n-te Niveau?'), [o('a', T('与 n² 成正比', 'In proportion to n²', 'Proportional zu n²')), o('b', T('与 n 成正比', 'In proportion to n', 'Proportional zu n')), o('c', T('相邻能级等间距', 'Equally spaced', 'Gleichabständig'))], 'a')
    ],
    transfer: { text: T('阱宽 0.5 nm，第 2 能级。', 'Width 0.5 nm, second level.', 'Breite 0,5 nm, zweites Niveau.'), inputs: { m: 9.1093837139e-31, Lw: 0.5e-9, n: 2 }, questions: [num('t1', 'En', T('E2 = ?', 'E2 = ?', 'E2 = ?'), ['J', 'N', 'm'])] },
    open: { lab: 'quantum' }
  },
  {
    id: 'act-packet', title: T('自由高斯波包的扩展', 'Spreading of a free Gaussian packet', 'Zerfließen eines freien Gaußschen Pakets'), stage: 'u', models: ['Q08', 'G07'],
    goals: [T('区分位置展宽的增长与动量展宽的守恒', 'Tell the growing position spread from the constant momentum spread', 'Die wachsende Ortsunschärfe von der gleichbleibenden Impulsunschärfe unterscheiden'), T('用网格收敛表判断数值结果的可信度', 'Judge a numerical result by its grid convergence table', 'Ein numerisches Ergebnis an seiner Gitterkonvergenz beurteilen')],
    prerequisites: { activities: ['act-well'] },
    inputs: { x0: -5, p0: 2, s0: 1, t: 2, m: 1, hb: 1 },
    diagnostic: [fixed('d1', 'concept', T('自由传播的高斯波包，动量分布随时间？', 'For a free Gaussian packet the momentum distribution over time…', 'Bei einem freien Gaußschen Paket bleibt die Impulsverteilung mit der Zeit…'), [o('a', T('不变', 'stays the same', 'gleich')), o('b', T('与位置一起变宽', 'widens with the position spread', 'verbreitert sich mit dem Ort'), T('无外力时动量本征态不变，动量分布守恒。', 'Without forces the momentum distribution is conserved.', 'Ohne Kräfte bleibt die Impulsverteilung erhalten.')), o('c', T('变窄', 'narrows', 'wird schmaler'))], 'a')],
    predict: { question: trend('p', 'sx', T('随时间推移，位置展宽 σx 如何变化？', 'As time passes, how does the position spread σx change?', 'Wie ändert sich die Ortsunschärfe σx mit der Zeit?')), ...trendWhy(T('不同动量分量速度不同，彼此分开', 'Components with different momenta move at different speeds and separate', 'Anteile mit verschiedenem Impuls laufen verschieden schnell und trennen sich'), [T('波包会被耗散', 'The packet is dissipated', 'Das Paket wird gedämpft')]) },
    experiment: { vary: 't', values: [0, 1, 2, 4], observe: ['x', 'sx', 'sp'], note: T('只改变时刻；初态不变。约化单位 ħ = m = 1。', 'Only the time changes; the initial state stays. Reduced units ħ = m = 1.', 'Nur die Zeit ändert sich; der Anfangszustand bleibt. Reduzierte Einheiten ħ = m = 1.') },
    questions: [
      num('q1', 'x', T('t = 2 时 ⟨x⟩ = ?', '⟨x⟩ at t = 2?', '⟨x⟩ bei t = 2?'), ['', 'J', 's'], { signed: true, scale: 1 }),
      num('q2', 'sx', T('t = 2 时 σx = ?', 'σx at t = 2?', 'σx bei t = 2?'), ['', 'J', 's']),
      num('q3', 'sp', T('σp = ?', 'σp = ?', 'σp = ?'), ['', 's', 'J']),
      fixed('q4', 'explanation', T('初始更窄的波包会？', 'A narrower initial packet…', 'Ein anfangs schmaleres Paket…'), [o('a', T('扩展得更快（σp 更大）', 'spreads faster (larger σp)', 'zerfließt schneller (größeres σp)')), o('b', T('扩展得更慢', 'spreads more slowly', 'zerfließt langsamer')), o('c', T('不扩展', 'does not spread', 'zerfließt nicht'))], 'a')
    ],
    transfer: { text: T('x0 = 0、p0 = −1、σ0 = 0.5，t = 3。', 'x0 = 0, p0 = −1, σ0 = 0.5, t = 3.', 'x0 = 0, p0 = −1, σ0 = 0,5, t = 3.'), inputs: { x0: 0, p0: -1, s0: 0.5, t: 3, m: 1, hb: 1 }, questions: [num('t1', 'x', T('⟨x⟩ = ?', '⟨x⟩ = ?', '⟨x⟩ = ?'), ['', 'J', 's'], { signed: true, scale: 1 }), num('t2', 'sx', T('σx = ?', 'σx = ?', 'σx = ?'), ['', 'J', 's'])] },
    open: { lab: 'quantum' }
  },
  {
    id: 'act-decay', title: T('衰变的统计规律', 'The statistics of decay', 'Die Statistik des Zerfalls'), stage: 's', models: ['N01', 'G08'],
    goals: [T('半衰期描述大量原子核的期望行为', 'The half-life describes the expected behaviour of many nuclei', 'Die Halbwertszeit beschreibt das erwartete Verhalten vieler Kerne'), T('单次实验围绕期望起伏（二项分布）', 'One run scatters around the expectation (binomial)', 'Ein Durchlauf streut um den Erwartungswert (binomial)')],
    prerequisites: {},
    inputs: { N0: 1600, Th: 4, t: 12 },
    diagnostic: [fixed('d1', 'concept', T('经过两个半衰期，原来的放射性核还剩（平均）？', 'After two half-lives, on average, how much of the original nuclei is left?', 'Wie viel der ursprünglichen Kerne ist nach zwei Halbwertszeiten im Mittel übrig?'), [o('q', T('四分之一', 'A quarter', 'Ein Viertel')), o('0', T('全部衰变完', 'None', 'Nichts'), T('每个半衰期减半：½ × ½ = ¼。', 'Each half-life halves: ½ × ½ = ¼.', 'Jede Halbwertszeit halbiert: ½ × ½ = ¼.')), o('h', T('一半', 'Half', 'Die Hälfte'))], 'q')],
    predict: { question: trend('p', 'A', T('随时间推移，活度如何变化？', 'As time passes, how does the activity change?', 'Wie ändert sich die Aktivität mit der Zeit?')), ...trendWhy(T('活度 A = λN，N 在减少', 'A = λN and N decreases', 'A = λN und N nimmt ab'), [T('剩下的核衰变得更快', 'The remaining nuclei decay faster', 'Die übrigen Kerne zerfallen schneller')]) },
    experiment: { vary: 't', values: [0, 4, 8, 12], observe: ['N', 'A', 'sd'], note: T('只改变时间；初始数与半衰期不变。', 'Only the time changes; initial number and half-life stay.', 'Nur die Zeit ändert sich; Anfangszahl und Halbwertszeit bleiben.') },
    questions: [
      num('q1', 'N', T('12 s 后的期望剩余数？', 'Expected number left after 12 s?', 'Erwartete Restzahl nach 12 s?'), ['', 'Bq', 's']),
      num('q2', 'A', T('此时活度？', 'Activity then?', 'Aktivität dann?'), ['Bq', 's', '']),
      num('q3', 'sd', T('单次实验剩余数的标准差？', 'Standard deviation of the count in one run?', 'Standardabweichung der Anzahl in einem Durchlauf?'), ['', 'Bq', 's'], { tol: 0.02 }),
      fixed('q4', 'explanation', T('为什么一次实验的剩余数不一定正好 200？', 'Why is one run not exactly 200?', 'Warum ergibt ein Durchlauf nicht genau 200?'), [o('a', T('每个核随机衰变，200 是期望值', 'Each nucleus decays at random; 200 is the expectation', 'Jeder Kern zerfällt zufällig; 200 ist der Erwartungswert')), o('b', T('计算有误', 'The calculation is wrong', 'Die Rechnung ist falsch')), o('c', T('半衰期会变', 'The half-life changes', 'Die Halbwertszeit ändert sich'))], 'a')
    ],
    transfer: { text: T('N0 = 500，半衰期 10 s，t = 3 s。', 'N0 = 500, half-life 10 s, t = 3 s.', 'N0 = 500, Halbwertszeit 10 s, t = 3 s.'), inputs: { N0: 500, Th: 10, t: 3 }, questions: [num('t1', 'N', T('期望剩余数？', 'Expected number left?', 'Erwartete Restzahl?'), ['', 'Bq', 's'])] },
    open: { lab: 'decay' }
  },
  {
    id: 'act-chain', title: T('衰变链与相等寿命', 'Decay chains and equal lifetimes', 'Zerfallsketten und gleiche Lebensdauern'), stage: 'u', models: ['N02'],
    goals: [T('求链中各成员随时间的数目', 'Find the numbers of the members of a chain over time', 'Die Anzahlen der Kettenglieder über die Zeit bestimmen'), T('相等衰变常数时使用解析极限', 'Use the analytic limit for equal decay constants', 'Bei gleichen Zerfallskonstanten den analytischen Grenzwert nutzen')],
    prerequisites: { activities: ['act-decay'] },
    inputs: { N10: 100, l1: LN2, l2: LN2, t: 1 },
    diagnostic: [fixed('d1', 'concept', T('Bateman 式中有 1/(λ2 − λ1)。若 λ1 = λ2，应该？', 'The Bateman formula has 1/(λ2 − λ1). If λ1 = λ2 you should…', 'Die Bateman-Formel enthält 1/(λ2 − λ1). Bei λ1 = λ2 sollte man…'), [o('a', T('取极限，得到 λ1 t e^{−λ1 t} 形式', 'take the limit, giving the form λ1 t e^{−λ1 t}', 'den Grenzwert nehmen: die Form λ1 t e^{−λ1 t}')), o('b', T('结果为无穷大', 'say the result is infinite', 'sagen, das Ergebnis sei unendlich'), T('分子同时趋于零，极限有限。', 'The numerator also tends to zero; the limit is finite.', 'Der Zähler geht auch gegen null; der Grenzwert ist endlich.')), o('c', T('把 λ2 稍微改一点再算', 'nudge λ2 a little and compute', 'λ2 etwas verschieben und rechnen'))], 'a')],
    predict: { question: byCondition('p', T('λ1 = λ2 = ln 2 s⁻¹ 时用哪一支公式？', 'With λ1 = λ2 = ln 2 s⁻¹, which branch applies?', 'Welcher Zweig gilt bei λ1 = λ2 = ln 2 s⁻¹?'), [o('equal', T('相等常数（极限式）', 'Equal constants (limit)', 'Gleiche Konstanten (Grenzwert)')), o('distinct', T('不同常数（Bateman）', 'Different constants (Bateman)', 'Verschiedene Konstanten (Bateman)'))]), ...trendWhy(T('两个常数相等，Bateman 式分母为零', 'The constants are equal, so the Bateman denominator vanishes', 'Die Konstanten sind gleich, der Bateman-Nenner verschwindet'), [T('总是用 Bateman 式', 'Always use the Bateman formula', 'Immer die Bateman-Formel nutzen')]) },
    experiment: { vary: 'l2', values: [0.3466, LN2, LN2 * (1 + 1e-6), 1.3863], observe: ['N2', 'N3'], note: T('只改变子核衰变常数；接近相等时两支结果连续。', 'Only the daughter’s constant changes; near equality both branches agree.', 'Nur die Konstante der Tochter ändert sich; nahe Gleichheit stimmen beide Zweige überein.') },
    questions: [
      num('q1', 'N2', T('t = 1 s 时子核数？', 'Daughter number at t = 1 s?', 'Anzahl der Tochterkerne bei t = 1 s?'), ['', 's', 'Bq']),
      num('q2', 'N3', T('稳定末项数？', 'Stable end product?', 'Stabiles Endprodukt?'), ['', 's', 'Bq']),
      fixed('q3', 'explanation', T('N1 + N2 + N3 等于？', 'N1 + N2 + N3 equals…', 'N1 + N2 + N3 ist…'), [o('a', T('始终等于 N10', 'always N10', 'immer N10')), o('b', T('随时间减少', 'decreasing with time', 'mit der Zeit abnehmend')), o('c', T('随时间增加', 'increasing with time', 'mit der Zeit zunehmend'))], 'a')
    ],
    transfer: { text: T('N10 = 1000，λ1 = 0.1 s⁻¹，λ2 = 1 s⁻¹，t = 5 s。', 'N10 = 1000, λ1 = 0.1 s⁻¹, λ2 = 1 s⁻¹, t = 5 s.', 'N10 = 1000, λ1 = 0,1 s⁻¹, λ2 = 1 s⁻¹, t = 5 s.'), inputs: { N10: 1000, l1: 0.1, l2: 1, t: 5 }, questions: [byCondition('t1', T('用哪一支？', 'Which branch?', 'Welcher Zweig?'), [o('equal', T('相等常数', 'Equal constants', 'Gleiche Konstanten')), o('distinct', T('不同常数', 'Different constants', 'Verschiedene Konstanten'))]), num('t2', 'N2', T('子核数？', 'Daughter number?', 'Anzahl der Tochterkerne?'), ['', 's', 'Bq'])] },
    open: { lab: 'nuclear' }
  }
]
