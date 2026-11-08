/**
 * 26.61 built-in problems: eight more, on the templates of 26.61 (a spring that only pushes, a point mass, a wall) and
 * on the arc tracks of 26.59 fix 3 that had none yet. Same rules as the 26.59 bank (problemBank2659.ts): the stem
 * names the parameters, every answer is read from the simulation, "another set of numbers" varies `vary`, and each
 * question is checked against an independent closed form in tests/teaching/problems2661.test.ts. Arc problems keep
 * the track radius large against the ball (r = 3 cm), so the textbook answer with R agrees within the 2 % tolerance.
 */
import type { Tri } from '../i18n/tri'
import type { BuiltinProblem } from './problemBank'
import type { NumericQuestion, ProblemTarget } from './problems'

const T = (zh: string, en: string, de: string): Tri => ({ zh, en, de })
const num = (id: string, prompt: Tri, target: ProblemTarget, more: Partial<NumericQuestion> = {}): NumericQuestion => ({ id, type: 'numeric', prompt, target, ...more })
const G = T('g 取 {g} m/s²。', 'Take g = {g} m/s².', 'Nimm g = {g} m/s².')
const withG = (t: Tri): Tri => ({ zh: `${t.zh}${G.zh}`, en: `${t.en} ${G.en}`, de: `${t.de} ${G.de}` })

export const PROBLEMS_2661: BuiltinProblem[] = [
  {
    id: 'e-spring-drop', chapter: 'energy', template: 'spring-drop', params: { h: 0.4, m: 1, k: 400 }, vary: { h: [0.2, 0.8, 0.1], k: [200, 800, 100] },
    title: T('物块落到弹簧上：最大压缩量', 'A block falls onto a spring: the largest compression', 'Ein Klotz fällt auf eine Feder: die größte Stauchung'),
    stem: withG(T('质量 {m} kg 的物块从竖直轻弹簧上端正上方 {h} m 处由静止下落。弹簧下端固定，上端不与物块粘连，劲度系数 k = {k} N/m。', 'A {m} kg block is released from rest {h} m above the top of a light vertical spring (fixed at the bottom, not fastened to the block, k = {k} N/m).', 'Ein Klotz (m = {m} kg) fällt aus der Ruhe aus {h} m über dem oberen Ende einer leichten senkrechten Feder (unten befestigt, nicht mit dem Klotz verbunden, k = {k} N/m).')),
    questions: [
      num('x', T('弹簧的最大压缩量是多少？', 'What is the largest compression of the spring?', 'Wie groß ist die größte Stauchung der Feder?'), { kind: 'extreme', id: 'custom.x', which: 'max' },
        { hint: T('最低点速度为零：mg(h + x) = ½kx²', 'At the lowest point the speed is zero: mg(h + x) = ½kx²', 'Am tiefsten Punkt ist die Geschwindigkeit null: mg(h + x) = ½kx²'), explain: T('x = [mg + √((mg)² + 2kmgh)]/k。', 'x = [mg + √((mg)² + 2kmgh)]/k.', 'x = [mg + √((mg)² + 2kmgh)]/k.') }),
      num('v', T('下落过程中的最大速度是多少？', 'What is the largest speed during the fall?', 'Wie groß ist die größte Geschwindigkeit beim Fallen?'), { kind: 'extreme', id: 'block.v', which: 'max' },
        { hint: T('速度最大时 kx = mg', 'The speed is largest where kx = mg', 'Am schnellsten bei kx = mg'), explain: T('v² = 2gh + mg²/k。', 'v² = 2gh + mg²/k.', 'v² = 2gh + mg²/k.') })
    ]
  },
  {
    id: 'e-spring-launch', chapter: 'energy', template: 'spring-launcher', params: { k: 500, x: 0.1, m: 0.2 }, vary: { k: [300, 800, 100], x: [0.06, 0.14, 0.02] },
    title: T('弹簧竖直弹射小球', 'A spring launches a ball upward', 'Eine Feder schießt eine Kugel nach oben'),
    stem: withG(T('竖直轻弹簧（k = {k} N/m）下端固定，质量 {m} kg 的小球放在上端（不粘连），把弹簧压缩 {x} m 后由静止释放。', 'A light vertical spring (k = {k} N/m) is fixed at the bottom; a {m} kg ball rests on its top (not fastened). The spring is pressed by {x} m and released.', 'Eine leichte senkrechte Feder (k = {k} N/m) ist unten befestigt; eine Kugel (m = {m} kg) liegt lose oben. Die Feder wird um {x} m gestaucht und losgelassen.')),
    questions: [
      num('H', T('小球上升的最大高度（从释放处算起）是多少？', 'How high does the ball rise above the release point?', 'Wie hoch steigt die Kugel über den Loslasspunkt?'), { kind: 'extreme', id: 'custom.H', which: 'max' },
        { hint: T('弹性势能全部转化为重力势能', 'All the elastic energy becomes potential energy', 'Die ganze Spannenergie wird Lageenergie'), explain: T('½kx² = mgH，H = kx²/(2mg)。', '½kx² = mgH, H = kx²/(2mg).', '½kx² = mgH, H = kx²/(2mg).') }),
      num('v', T('小球离开弹簧时的速度是多少？', 'What is the speed of the ball when it leaves the spring?', 'Wie schnell ist die Kugel, wenn sie die Feder verlässt?'), { kind: 'atEvent', id: 'ball.v', event: 'springRelease', side: 'after', body: null },
        { explain: T('弹簧恢复原长时离开：½mv² = ½kx² − mgx。', 'It leaves at the rest length: ½mv² = ½kx² − mgx.', 'Sie löst sich bei der entspannten Länge: ½mv² = ½kx² − mgx.') })
    ]
  },
  {
    id: 'c-dome', chapter: 'circular', template: 'dome-slide', params: { R: 1, v0: 0.5, m: 0.1 }, vary: { R: [0.5, 2, 0.5], v0: [0.25, 1, 0.25] },
    title: T('质点从光滑半球顶滑落', 'A point mass slides off a smooth dome', 'Ein Massenpunkt gleitet von einer glatten Kuppel'),
    stem: withG(T('半径 R = {R} m 的光滑半球固定在水平地面上，质点从球面最高点以 {v0} m/s 的水平速度开始滑下。', 'A smooth hemisphere of radius R = {R} m is fixed on the floor. A point mass starts at its top with a horizontal speed of {v0} m/s.', 'Eine glatte Halbkugel mit R = {R} m ist am Boden befestigt. Ein Massenpunkt startet an ihrer Spitze mit {v0} m/s waagrecht.')),
    questions: [
      num('h', T('质点离开球面时距球心的高度是多少？', 'At what height above the centre does it leave the sphere?', 'In welcher Höhe über dem Mittelpunkt verlässt er die Kugel?'), { kind: 'atEvent', id: 'p.y', event: 'separate', side: 'before', body: null },
        { hint: T('离开时 N = 0：mg cos φ = mv²/R', 'Leaving: N = 0, mg cos φ = mv²/R', 'Beim Ablösen N = 0: mg cos φ = mv²/R'), explain: T('与 v² = v₀² + 2gR(1 − cos φ) 联立：h = R cos φ = (2R + v₀²/g)/3。', 'With v² = v₀² + 2gR(1 − cos φ): h = R cos φ = (2R + v₀²/g)/3.', 'Mit v² = v₀² + 2gR(1 − cos φ): h = R cos φ = (2R + v₀²/g)/3.') }),
      num('v', T('离开时的速度是多少？', 'What is its speed when it leaves?', 'Wie schnell ist er beim Ablösen?'), { kind: 'atEvent', id: 'p.v', event: 'separate', side: 'before', body: null },
        { explain: T('v² = gR cos φ = g h。', 'v² = gR cos φ = g h.', 'v² = gR cos φ = g h.') })
    ]
  },
  {
    id: 'p-wall', chapter: 'projectile', template: 'projectile-wall', params: { h: 2.5, v0: 5, d: 1.5, m: 0.1 }, vary: { v0: [4, 6, 0.5], d: [1, 2, 0.25] },
    title: T('平抛撞墙', 'Thrown horizontally against a wall', 'Waagrecht gegen eine Wand geworfen'),
    stem: withG(T('小球从高 {h} m 的桌面边缘以 {v0} m/s 水平抛出，水平距离 {d} m 处有一面竖直墙（小球视为质点，不计空气阻力）。', 'A ball leaves the edge of a {h} m high table horizontally at {v0} m/s; a vertical wall stands {d} m away (the ball is a point, no air resistance).', 'Eine Kugel verlässt die Kante eines {h} m hohen Tisches waagrecht mit {v0} m/s; in {d} m Abstand steht eine senkrechte Wand (Kugel als Punkt, ohne Luftwiderstand).')),
    questions: [
      num('t', T('小球经过多长时间撞到墙？', 'After what time does the ball hit the wall?', 'Nach welcher Zeit trifft die Kugel die Wand?'), { kind: 'event', event: 'impact', body: 'ball' },
        { hint: T('水平方向匀速', 'Uniform motion horizontally', 'Waagrecht gleichförmig'), explain: T('t = d/v₀。', 't = d/v₀.', 't = d/v₀.') }),
      num('v', T('撞墙前瞬间的速度大小是多少？', 'How fast is it just before it hits the wall?', 'Wie schnell ist sie kurz vor dem Aufprall?'), { kind: 'atEvent', id: 'ball.v', event: 'impact', side: 'before', body: 'ball' },
        { explain: T('v = √(v₀² + (gt)²)。', 'v = √(v₀² + (gt)²).', 'v = √(v₀² + (gt)²).') })
    ]
  },
  {
    id: 'c-arc-slide', chapter: 'circular', template: 'arc-slide', params: { R: 2, m: 0.2 }, vary: { R: [1.5, 3, 0.5], m: [0.1, 0.5, 0.1] },
    title: T('光滑四分之一圆弧轨道', 'A smooth quarter-circle track', 'Eine glatte Viertelkreisbahn'),
    stem: withG(T('质量 {m} kg 的小球从半径 R = {R} m 的光滑四分之一圆弧轨道顶端由静止滑下（小球视为质点）。', 'A {m} kg ball slides from rest from the top of a smooth quarter-circle track of radius R = {R} m (the ball is a point).', 'Eine Kugel (m = {m} kg) gleitet aus der Ruhe vom oberen Ende einer glatten Viertelkreisbahn mit R = {R} m (Kugel als Punkt).')),
    questions: [
      num('v', T('小球到达底端时的速度是多少？', 'What is its speed at the bottom?', 'Wie schnell ist sie unten?'), { kind: 'extreme', id: 'ball.v', which: 'max' },
        { explain: T('mgR = ½mv²，v = √(2gR)。', 'mgR = ½mv², v = √(2gR).', 'mgR = ½mv², v = √(2gR).') }),
      num('N', T('在底端轨道对小球的支持力是多少？', 'What is the normal force of the track at the bottom?', 'Wie groß ist die Normalkraft der Bahn unten?'), { kind: 'extreme', id: 'contact.ball|track.N', which: 'max' },
        { hint: T('底端：N − mg = mv²/R', 'At the bottom: N − mg = mv²/R', 'Unten: N − mg = mv²/R'), explain: T('N = mg + 2mg = 3mg，与半径无关。', 'N = mg + 2mg = 3mg, whatever the radius.', 'N = mg + 2mg = 3mg, unabhängig vom Radius.') })
    ]
  },
  {
    id: 'c-loop', chapter: 'circular', template: 'vertical-loop', params: { R: 2, v0: 13, m: 0.1 }, vary: { R: [2, 3, 0.5], v0: [13, 15, 0.5] },
    title: T('竖直圆轨道：最高点的速度', 'A vertical loop: the speed at the top', 'Ein senkrechter Looping: die Geschwindigkeit oben'),
    stem: withG(T('质量 {m} kg 的小球在半径 R = {R} m 的光滑竖直圆轨道内侧运动，经过最低点时速度为 {v0} m/s（小球视为质点）。', 'A {m} kg ball moves on the inside of a smooth vertical loop of radius R = {R} m; at the bottom its speed is {v0} m/s (the ball is a point).', 'Eine Kugel (m = {m} kg) läuft innen in einem glatten senkrechten Looping mit R = {R} m; unten hat sie {v0} m/s (Kugel als Punkt).')),
    questions: [
      num('vTop', T('小球通过最高点时的速度是多少？', 'What is its speed at the top?', 'Wie schnell ist sie oben?'), { kind: 'extreme', id: 'ball.v', which: 'min' },
        { hint: T('机械能守恒，高度差 2R', 'Mechanical energy is conserved over a height of 2R', 'Mechanische Energie bleibt erhalten, Höhenunterschied 2R'), explain: T('v² = v₀² − 4gR。', 'v² = v₀² − 4gR.', 'v² = v₀² − 4gR.') }),
      num('Nb', T('最低点轨道对小球的支持力是多少？', 'What is the normal force at the bottom?', 'Wie groß ist die Normalkraft unten?'), { kind: 'extreme', id: 'contact.ball|loop.N', which: 'max' },
        { explain: T('N = mg + mv₀²/R。', 'N = mg + mv₀²/R.', 'N = mg + mv₀²/R.') })
    ]
  },
  {
    id: 'c-bridge', chapter: 'circular', template: 'hump-bridge', params: { R: 5, v0: 3, m: 1 }, vary: { R: [4, 10, 1], v0: [2, 4, 0.5] },
    title: T('拱形桥：最高点的压力', 'A hump bridge: the force at the top', 'Eine Bogenbrücke: die Kraft oben'),
    stem: withG(T('质量 {m} kg 的小车（视为质点）以 {v0} m/s 通过半径 R = {R} m 的光滑拱形桥的最高点。', 'A {m} kg car (a point) passes the top of a smooth hump bridge of radius R = {R} m at {v0} m/s.', 'Ein Wagen (m = {m} kg, als Punkt) fährt mit {v0} m/s über den Scheitel einer glatten Bogenbrücke mit R = {R} m.')),
    questions: [
      num('N', T('小车在最高点对桥面的压力是多少？', 'What force does the car exert on the bridge at the top?', 'Welche Kraft übt der Wagen oben auf die Brücke aus?'), { kind: 'quantity', id: 'contact.car|bridge.N', t: 0 },
        { hint: T('最高点：mg − N = mv²/R', 'At the top: mg − N = mv²/R', 'Oben: mg − N = mv²/R'), explain: T('N = m(g − v₀²/R)，压力小于重力。', 'N = m(g − v₀²/R), less than the weight.', 'N = m(g − v₀²/R), kleiner als die Gewichtskraft.') }),
      num('v', T('小车离开桥面时的速度是多少？', 'What is its speed when it leaves the bridge?', 'Wie schnell ist er, wenn er die Brücke verlässt?'), { kind: 'atEvent', id: 'car.v', event: 'separate', side: 'before', body: null },
        { explain: T('cos θ = (v₀²/(gR) + 2)/3，v² = gR cos θ。', 'cos θ = (v₀²/(gR) + 2)/3, v² = gR cos θ.', 'cos θ = (v₀²/(gR) + 2)/3, v² = gR cos θ.') })
    ]
  },
  {
    id: 'm-groove', chapter: 'momentum', template: 'groove-momentum', params: { R: 2, M: 2, m: 0.5 }, vary: { R: [1.5, 3, 0.5], M: [1, 4, 0.5] },
    title: T('可动光滑圆弧槽', 'A smooth groove that can slide', 'Eine glatte verschiebbare Rinne'),
    stem: withG(T('质量 M = {M} kg、半径 R = {R} m 的光滑半圆槽静止在光滑水平面上，质量 m = {m} kg 的小球从槽口由静止释放（小球视为质点）。', 'A smooth semicircular groove (M = {M} kg, R = {R} m) rests on a smooth floor; a ball (m = {m} kg, a point) is released from rest at its rim.', 'Eine glatte halbkreisförmige Rinne (M = {M} kg, R = {R} m) ruht auf glattem Boden; eine Kugel (m = {m} kg, als Punkt) wird am Rand aus der Ruhe losgelassen.')),
    questions: [
      num('v', T('小球到达最低点时的速度是多少？', 'What is the speed of the ball at the lowest point?', 'Wie schnell ist die Kugel am tiefsten Punkt?'), { kind: 'extreme', id: 'ball.v', which: 'max' },
        { hint: T('水平动量守恒 + 机械能守恒', 'Horizontal momentum and mechanical energy are conserved', 'Waagrechter Impuls und mechanische Energie bleiben erhalten'), explain: T('mv = MV，mgR = ½mv² + ½MV²：v = √(2gRM/(M + m))。', 'mv = MV, mgR = ½mv² + ½MV²: v = √(2gRM/(M + m)).', 'mv = MV, mgR = ½mv² + ½MV²: v = √(2gRM/(M + m)).') }),
      num('V', T('此时槽的速度是多少？', 'What is the speed of the groove then?', 'Wie schnell ist die Rinne dann?'), { kind: 'extreme', id: 'groove.v', which: 'max' },
        { explain: T('V = mv/M。', 'V = mv/M.', 'V = mv/M.') })
    ]
  }
]
