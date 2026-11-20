/**
 * The prompt of the sketch builder (26.64, D283): one paragraph on what a sketch is, the vocabulary of the schema, and
 * six worked sketches — an incline, a pulley at a table's edge, a block on a board, a spring, an arc track, a
 * projectile — instead of the two hundred lines of file format and analytic-geometry recipes of 26.60
 * (copilot/simPrompt.ts). The examples are data: tests/ai/sketch2664/prompt.test.ts compiles each and runs it through
 * the ladder, so the prompt can never show a sketch the app would reject.
 *
 * Chinese on purpose, like the other built-in prompts (D162): text for the model, not for the interface.
 */
import { EVENTS } from '../import/catalog'
import type { BodySketch, ConnectorSketch, Diagnostic, QuestionSketch, SceneSketch, SurfaceSketch, ValueRow } from './schema'
import { emptySketch } from './schema'
import type { TemplateCandidate } from './templates'

const surface = (id: string, name: string, type: SurfaceSketch['type'], more: Partial<SurfaceSketch> = {}): SurfaceSketch => ({ id, name, type, side: '', span: '', at: '', ...more })
const body = (id: string, name: string, type: BodySketch['type'], place: BodySketch['place'], ref: string, at: BodySketch['at'], more: Partial<BodySketch> = {}): BodySketch => ({ id, name, type, place, ref, at, ref2: '', moves: 'rest', side: '', points: [], ...more })
const val = (of: string, quantity: string, value: number, unit: string, quote: string): ValueRow => ({ of, quantity, value, unit, quote })
const conn = (id: string, name: string, type: ConnectorSketch['type'], path: string[], mode: ConnectorSketch['mode'] = ''): ConnectorSketch => ({ id, name, type, path, mode })
const ask = (prompt: string, unit: string, kind: QuestionSketch['kind'], more: Partial<QuestionSketch> = {}): QuestionSketch => ({ prompt, unit, kind, id: '', t: 0, event: '', side: '', body: '', which: '', ...more })
const sketch = (title: string, more: Partial<SceneSketch>): SceneSketch => ({ ...emptySketch(), route: 'sketch', title, gravity: 'down', ...more })

/** A worked example: the problem, the reading notes a model writes first, and the sketch it then submits. */
export interface SketchExample { key: string; problem: string; notes: string; sketch: SceneSketch }

export const SKETCH_EXAMPLES: SketchExample[] = [
  {
    key: 'incline',
    problem: '质量 2 kg 的物块从倾角 30° 的固定斜面顶端由静止下滑，物块与斜面间的动摩擦因数 μ = 0.2，g 取 10 m/s²。求 1 s 末的速度和下滑的加速度。',
    notes: '对象：固定斜面 slope（倾角 30°，高端在左）；物块 A。\n关系：A 在 slope 上，位于顶端，静止释放。\n已知：质量 2 kg；倾角 30°；μ = 0.2（A 与 slope）；g = 10 m/s²。斜面长度未给。\n所求：1 s 末的速度；加速度。\n模板 incline 也能表达，这里按草图写。',
    sketch: sketch('斜面上的物块', {
      movingBodies: 1,
      surfaces: [surface('slope', '斜面', 'incline', { side: 'left' })],
      bodies: [body('A', '物块', 'block', 'on', 'slope', 'top')],
      values: [val('A', 'mass', 2, 'kg', '质量 2 kg 的物块'), val('slope', 'angle', 30, '°', '倾角 30°'), val('A|slope', 'mu', 0.2, '', 'μ = 0.2'), val('world', 'g', 10, 'm/s²', 'g 取 10 m/s²')],
      expect: [{ of: 'A', state: 'moves' }],
      questions: [ask('1 s 末的速度', 'm/s', 'quantity', { id: 'A.v', t: 1 }), ask('下滑的加速度', 'm/s²', 'quantity', { id: 'A.a', t: 0.5 })]
    })
  },
  {
    key: 'table-pulley',
    problem: '水平桌面上质量 2 kg 的物块 A（与桌面 μ = 0.2）用轻绳跨过桌边的光滑定滑轮与质量 1 kg 的物块 B 相连，B 离地 0.6 m，由静止释放，求 A 的加速度和绳的拉力。',
    notes: '对象：地面 floor；桌面 table；物块 A、B；定滑轮 P；轻绳 rope1。\n关系：A 在桌面上（位置未给，取中间）；P 装在桌面右端；绳从 A 的右侧经 P 到 B 的顶部；B 挂在绳上，离地 0.6 m。\n已知：A 质量 2 kg；A 与桌面 μ = 0.2；B 质量 1 kg；B 离地 0.6 m。g、桌高未给。\n所求：A 的加速度；绳的拉力。',
    sketch: sketch('桌面—滑轮连接体', {
      movingBodies: 2,
      surfaces: [surface('floor', '地面', 'ground'), surface('table', '桌面', 'table')],
      bodies: [body('A', '物块A', 'block', 'on', 'table', 'middle'), body('B', '物块B', 'block', 'hanging', 'rope1', 'below', { ref2: 'floor' })],
      pulleys: [{ id: 'P', name: '定滑轮', at: 'table.rightEnd' }],
      connectors: [conn('rope1', '轻绳', 'rope', ['A.right', 'P', 'B.top'], 'taut')],
      values: [val('A', 'mass', 2, 'kg', '质量 2 kg 的物块 A'), val('A|table', 'mu', 0.2, '', 'μ = 0.2'), val('B', 'mass', 1, 'kg', '质量 1 kg 的物块 B'), val('B', 'heightAbove', 0.6, 'm', 'B 离地 0.6 m')],
      expect: [{ of: 'A', state: 'moves' }, { of: 'B', state: 'moves' }, { of: 'rope1', state: 'taut' }],
      questions: [ask('A 的加速度', 'm/s²', 'quantity', { id: 'A.a', t: 0.2 }), ask('绳的拉力', 'N', 'quantity', { id: 'rope1.T', t: 0.2 })]
    })
  },
  {
    key: 'board-block',
    problem: '质量 M = 2 kg 的长木板静止在水平地面上，质量 m = 1 kg 的小物块以 v₀ = 4 m/s 的速度滑上木板左端。物块与木板间的动摩擦因数 μ₁ = 0.4，木板与地面间的动摩擦因数 μ₂ = 0.1，木板足够长，g 取 10 m/s²。求物块与木板达到共同速度所需的时间和共同速度。',
    notes: '对象：地面 floor；木板 board；物块 block。\n关系：board 在地面上；block 在 board 上，位于左端，初速度向右 4 m/s。\n已知：M = 2 kg；m = 1 kg；v₀ = 4 m/s；μ₁ = 0.4（block 与 board）；μ₂ = 0.1（board 与 floor）；g = 10 m/s²。木板长度未给（足够长）。\n所求：共速的时刻（事件 stick）；共同速度（该事件之后 block 的速度）。',
    sketch: sketch('板块模型', {
      movingBodies: 2,
      surfaces: [surface('floor', '地面', 'ground')],
      bodies: [body('board', '木板', 'board', 'on', 'floor', 'middle'), body('block', '物块', 'block', 'on', 'board', 'left', { moves: 'right' })],
      values: [val('board', 'mass', 2, 'kg', 'M = 2 kg'), val('block', 'mass', 1, 'kg', 'm = 1 kg'), val('block', 'speed', 4, 'm/s', 'v₀ = 4 m/s'), val('block|board', 'mu', 0.4, '', 'μ₁ = 0.4'), val('board|floor', 'mu', 0.1, '', 'μ₂ = 0.1'), val('world', 'g', 10, 'm/s²', 'g 取 10 m/s²')],
      expect: [{ of: 'block', state: 'moves' }],
      questions: [ask('达到共同速度所需的时间', 's', 'event', { event: 'stick', body: 'block' }), ask('共同速度', 'm/s', 'atEvent', { id: 'block.vx', event: 'stick', side: 'after', body: 'block' })]
    })
  },
  {
    key: 'spring',
    problem: '光滑水平面上，劲度系数 k = 100 N/m 的轻弹簧左端固定在墙上，右端连着质量 0.5 kg 的物块。把物块向左推，使弹簧压缩 0.1 m 后由静止释放，求物块的最大速度。',
    notes: '对象：地面 floor；左侧的墙 wall；物块 A；弹簧 spring1。\n关系：弹簧一端在墙上，另一端在 A 的左侧（连着，fastened）；A 在地面上，位置由弹簧决定（at connector）。\n已知：k = 100 N/m；质量 0.5 kg；压缩 0.1 m；光滑（A 与 floor 的 μ = 0）。弹簧原长未给。\n所求：最大速度（全过程 A.v 的最大值）。',
    sketch: sketch('弹簧振子', {
      movingBodies: 1,
      surfaces: [surface('floor', '水平面', 'ground'), surface('wall', '墙', 'wall', { side: 'left' })],
      bodies: [body('A', '物块', 'block', 'on', 'floor', 'connector')],
      connectors: [conn('spring1', '弹簧', 'spring', ['wall', 'A.left'], 'fastened')],
      values: [val('spring1', 'stiffness', 100, 'N/m', 'k = 100 N/m'), val('A', 'mass', 0.5, 'kg', '质量 0.5 kg 的物块'), val('spring1', 'compression', 0.1, 'm', '压缩 0.1 m'), val('A|floor', 'mu', 0, '', '光滑水平面')],
      expect: [{ of: 'A', state: 'moves' }],
      questions: [ask('物块的最大速度', 'm/s', 'extreme', { id: 'A.v', which: 'max' })]
    })
  },
  {
    key: 'arc',
    problem: '半径 R = 0.8 m 的光滑四分之一圆弧轨道竖直固定，底端与光滑水平面相切。质量 0.1 kg 的小球从轨道顶端由静止滑下，求到达底端时的速度和此时轨道对小球的支持力。',
    notes: '对象：水平面 floor；四分之一圆弧轨道 track（上端在左，底端接水平面）；小球 ball。\n关系：ball 在 track 内侧，位于左侧上端（与圆心等高），静止释放。\n已知：R = 0.8 m；质量 0.1 kg；轨道光滑、水平面光滑（μ = 0）。g 未给。\n所求：底端的速度（全过程 ball.v 的最大值）；底端的支持力（contact.ball|track.N 的最大值）。',
    sketch: sketch('四分之一圆弧轨道', {
      movingBodies: 1,
      surfaces: [surface('floor', '水平面', 'ground'), surface('track', '圆弧轨道', 'arc', { side: 'left', span: 'quarter' })],
      bodies: [body('ball', '小球', 'ball', 'inside', 'track', 'left')],
      values: [val('track', 'radius', 0.8, 'm', 'R = 0.8 m'), val('ball', 'mass', 0.1, 'kg', '质量 0.1 kg 的小球'), val('ball|track', 'mu', 0, '', '光滑四分之一圆弧轨道'), val('ball|floor', 'mu', 0, '', '光滑水平面')],
      expect: [{ of: 'ball', state: 'moves' }],
      questions: [ask('到达底端时的速度', 'm/s', 'extreme', { id: 'ball.v', which: 'max' }), ask('此时轨道对小球的支持力', 'N', 'extreme', { id: 'contact.ball|track.N', which: 'max' })]
    })
  },
  {
    key: 'projectile',
    problem: '小球从离地 1.25 m 高处以 3 m/s 的速度水平抛出，不计空气阻力，g 取 10 m/s²。求小球落地所需的时间和落地前瞬间的速度大小。',
    notes: '对象：地面 floor；小球 ball。\n关系：ball 在空中（air），离 floor 高 1.25 m，初速度水平向右 3 m/s。\n已知：高 1.25 m；速度 3 m/s；g = 10 m/s²。质量未给：取 0.1 kg（quote 留空，作为假设）。\n所求：落地时刻（事件 impact）；落地前瞬间的速度（该事件之前的 ball.v）。',
    sketch: sketch('平抛运动', {
      movingBodies: 1,
      surfaces: [surface('floor', '地面', 'ground')],
      bodies: [body('ball', '小球', 'ball', 'air', '', '', { ref2: 'floor', moves: 'right' })],
      values: [val('ball', 'heightAbove', 1.25, 'm', '离地 1.25 m 高处'), val('ball', 'speed', 3, 'm/s', '以 3 m/s 的速度水平抛出'), val('world', 'g', 10, 'm/s²', 'g 取 10 m/s²'), val('ball', 'mass', 0.1, 'kg', '')],
      expect: [{ of: 'ball', state: 'moves' }],
      questions: [ask('落地所需的时间', 's', 'event', { event: 'impact', body: 'ball' }), ask('落地前瞬间的速度大小', 'm/s', 'atEvent', { id: 'ball.v', event: 'impact', side: 'before', body: 'ball' })]
    })
  }
]

/** The vocabulary of the schema: what the fields mean and which words they take. */
export const SCHEMA_NOTES = `# 草图（SceneSketch 第 2 版）
草图只写“有什么、怎样相连、题目给了哪些量”。**不写任何坐标**：位置、锚点、滑轮的位置与缠绕方向、绳长、被吊物体的位置，全部由 App 计算。每个字段都必须出现；不适用的写 ""（列表写 []）。

- surfaces（固定的面）：type 为 ground 地面 | table 桌面/平台 | wall 墙/挡板 | ceiling 天花板 | incline 固定斜面 | arc 圆弧轨道 | steps 台阶。
  side：斜面的高端在哪一侧；墙在场景的哪一侧；四分之一圆弧或竖立半圆的上端在哪一侧（left | right）。
  span（仅圆弧）：quarter 四分之一 | half 竖立的半圆 | bowl 开口向上的半圆槽 | full 整圆 | hump 拱形（物体在外侧）| angles 起止角。
  at：它的底端接在另一个面的哪一点（如 "table.rightEnd"、"floor x=2m"）；通常写 ""，由 App 摆放（斜面与圆弧的底端接在地面上）。
- bodies（可动物体）：type 为 block 方块 | ball 小球 | point 质点 | board 木板 | rod 细杆 | disc 圆盘/圆柱 | ring 圆环 | cart 小车 | wedge 可动斜劈 | polygon 多边形。
  位置用关系表达——place + ref + at：
  · on：在某个面或物体（ref）上。at：left | middle | right | top | bottom（斜面的顶端/底端）| fromLeft | fromRight | fromTop | fromBottom（配一个 distance 值）| atHeight（斜面上离底端的高度，配 heightAbove 值）| leftOf | rightOf（紧靠 ref2 指的墙或物体）| connector（位置由连着它的弹簧、杆或绳决定）。ref 也可以是一根竖直弹簧（物体放在弹簧上，at 写 connector 或 equilibrium）。
  · hanging：挂在绳、弹簧、杆或铰链（ref）上。at：below 竖直悬挂 | left | right（向该侧偏开，配 angle 值，即与竖直方向的夹角；不给则为水平）| equilibrium（弹簧的平衡位置）。离某个面的高度：ref2 写那个面，并给 heightAbove 值。
  · inside / outside：在圆弧轨道（ref）的内侧 / 外侧。at：bottom | top | left | right | leftOfBottom | rightOfBottom | leftOfTop | rightOfTop（后四个配 angle 值：与竖直方向的夹角）。
  · air：在空中（抛体的起点、自由下落）。ref 写 ""；ref2 写它离哪个面，并给 heightAbove 值；或者直接给 x、y 值（唯一可以写坐标的地方）。
  moves：初始运动 rest | right | left | up | down | upSlope | downSlope | angle（配 launchAngle 值：与水平方向的夹角）；不是 rest 时必须给 speed 值。
  side 只用于 wedge（高端在哪侧）；points 只用于 polygon（顶点 "x y"，米，逆时针）。
- pulleys（定滑轮）：at 写它装在哪里："table.rightEnd"、"incline.top"、"ceiling"，或 ""。动滑轮不能用草图表达。
- connectors：type 为 rope 绳 | spring 弹簧 | rod 轻杆 | hinge 铰链 | force 恒力。path 用命名的点：
  物体的点 "A.center" "A.top" "A.bottom" "A.left" "A.right"；面上的点 "table.leftEnd" "table.rightEnd" "incline.top" "incline.bottom" "wall"（正对另一端的那一点）"ceiling" "ceiling x=0.5m" "wall height=1m"；"fixed" 表示一个由 App 摆放的固定点。
  绳写成路径 [一端, 滑轮…, 另一端]，例如 ["A.right", "P", "B.top"]；弹簧、杆、铰链写两端；力写作用点。
  mode：绳 taut | slack；弹簧 fastened | notFastened（不拴接，只推不拉）；力的方向 right | left | up | down | upSlope | downSlope | angle。
- values（已知量表）：题目给出的每个量写一行，且只写一次：of（它属于谁：物体或面的 id、一对接触 "A|table"、或 "world"）、quantity、value 与 unit（**照题目原样写，不换算**：30 与 "cm"）、quote（题目原文里的那几个字，逐字照抄）。题目没给、但你认为需要指定的量，quote 写 ""（记为假设）；尺寸一般不必写，App 取默认值。
  quantity 的名字：所有可动物体 mass, speed, launchAngle, distance, heightAbove, angle, x, y；block / cart: width, height；board: length, height；rod: length；ball / disc / ring: radius；wedge: slopeAngle, base, height；
  table: height, length；wall: height, distance；ceiling: height；incline: angle, length | height | base（三者给一个）；arc: radius（span 为 angles 时 startAngle, endAngle；hump 可给 angle）；steps: count, stepHeight, stepDepth；ground / table / incline 还可以有 beltSpeed（传送带）；
  pulley: radius；rope: length, maxTension；spring: stiffness, naturalLength, compression | extension；rod（连接件）: length；force: magnitude, angle；
  摩擦与碰撞写在接触对上：of "A|table"，quantity mu（或 muS、muK）、restitution；“光滑”就是 mu = 0，quote 写“光滑”那几个字；world: g。
- expect：题目对开始时刻的说法。物体 atRest（保持静止）| moves（开始运动）| aboutToSlide（恰好不滑动）；绳 taut | slack。
- questions：每个所求一条，顺序与题目一致。kind 与用到的字段：
  quantity（t 秒时的值：id、t）| atEvent（某事件第一次发生前/后瞬间的值：id、event、side、body）| event（某事件第一次发生的时刻：event、body）| end（结束时的值：id）| extreme（全过程的最大/最小值：id、which）。
  读数 id：<物体>.x .y .vx .vy .v .ax .ay .a .ek .ep .omega；contact.<受力物体>|<施力物体>.N（支持力）.f（摩擦力）；pair.<a>|<b>.heat（摩擦生热）；<绳>.T；<弹簧>.F .x；system.ek .ep .e。
  事件：${Object.entries(EVENTS).map(([k, v]) => `${k}=${v}`).join('；')}。
- movingBodies：题目里可动物体的个数。gravity：down；俯视图或“不计重力”写 none。
- route：sketch（按上面描述）| template（所列模板之一恰好能表达这道题：写 templateId 与 templateParams，其余列表可为空，questions 照写）| unsupported（力学引擎做不了：电路、光学、热学等，reason 写原因）。`

const example = (e: SketchExample, i: number) => `## 例 ${i + 1}\n题目：${e.problem}\n读题笔记：\n${e.notes}\n草图：\n${JSON.stringify(e.sketch)}`

/** The system prompt of the builder. */
export function sketchSystem(): string {
  return `你是 VeloΦ 的“场景草图员”。VeloΦ 是二维物理仿真与教学引擎：画面与数值都由求解器算出，你**不计算任何答案，也不计算任何坐标**。
你的任务分两步：先用几行自由文字写“读题笔记”（对象、它们之间的关系、题目给出的量及其原文、所求）；再按要求提交一份草图。App 把草图编译成场景、逐级检查、让引擎计算。

${SCHEMA_NOTES}

# 规则
1. 已知量的 value 与 unit 照题目原样写（72 与 "km/h"、30 与 "cm"），quote 逐字照抄题目里的那几个字；不要把题目没有的数写成已知量。
2. 一个量只属于一个字段，只写一行；题目给了但草图用不上的量不要写。
3. 能用关系说清的位置就不要用 air；air 只用于没有支撑的起点。
4. 模板优先：如果下面“候选模板”中的某一个恰好就是这道题（结构、过程都一致，只是数值不同），用 route "template"；否则用 route "sketch"。

# 示例
${SKETCH_EXAMPLES.map(example).join('\n\n')}`
}

/** The candidates of the template search as a table for the model (D284). */
export function candidateTable(list: TemplateCandidate[]): string {
  if (!list.length) return ''
  return `<templates>（候选模板：id｜名称｜说明｜结构｜参数 key=默认值 单位〔范围〕）\n${list.map(t => `${t.id}｜${t.name}｜${t.description}｜${t.structure}｜${t.params.map(p => `${p.key}（${p.label}）=${p.value}${p.unit ? ` ${p.unit}` : ''}${p.min !== undefined || p.max !== undefined ? `〔${p.min ?? ''}…${p.max ?? ''}〕` : ''}`).join('，')}`).join('\n')}\n</templates>`
}

/** What is asked: the problem (or the user's request), the Copilot's explanation to read it the same way. */
export function sketchAsk(a: { problem: string; solution?: string }, candidates: TemplateCandidate[]): string {
  const parts = [`<problem>\n${a.problem}\n</problem>`]
  if (a.solution) parts.push(`<explanation>（Copilot 对这道题的讲解，帮助你理解题意与所求；草图只按题目的条件写）\n${a.solution.length > 2500 ? `${a.solution.slice(0, 2500)}…` : a.solution}\n</explanation>`)
  const table = candidateTable(candidates)
  if (table) parts.push(table)
  parts.push('先写读题笔记（不超过 10 行）：对象、关系、已知量（原文与数值）、所求，以及是否有候选模板恰好合适。这一步只写文字，不要写 JSON。')
  return parts.join('\n\n')
}

/** The second step: the constrained call (or, without function calls, the JSON object). */
export const SUBMIT_NOTE = '现在按读题笔记提交草图：调用 submit_sketch。每个字段都要有，不适用的写 ""（列表写 []）。'
export const SUBMIT_NOTE_JSON = '现在按读题笔记提交草图：只输出草图这一个 JSON 对象（第一个字符是 {，最后一个字符是 }），不要任何解释或代码块标记。每个字段都要有，不适用的写 ""（列表写 []）。'

/** Sent when an answer could not be read as a sketch at all (there is nothing to patch). */
export const resendNote = (d: Diagnostic[]) => `你的回答读不出草图：${d.map(x => `${x.expected}；实际：${x.got}${x.hint ? `（${x.hint}）` : ''}`).join('；')}\n请重新提交完整的草图。`

/** The system prompt of a repair round: the vocabulary, and how to answer with a patch. No conversation is resent. */
export function patchSystem(): string {
  return `你是 VeloΦ 的“场景草图员”。你提交的草图没有通过 App 的检查。下面给出题目、有问题的草图片段和逐条诊断（code、path、expected、got、hint）。
请只改诊断指出的地方，用补丁回答：若干条“把 path 设成 value”。
- path 用诊断里出现的路径（或它下面的字段），例如 "connectors[0].path"、"values[3].unit"、"bodies[1].at"；要在列表末尾加一行，用 "values[+]"。
- value 是新值的 JSON 文本：数字写 "0.2"，文字写 "\\"kg\\""，列表写 "[\\"A.right\\",\\"P\\",\\"B.top\\"]"，整行写成 JSON 对象；写 "null" 表示删掉列表里的那一项。
- 不要改诊断没有提到的路径（会被拒绝）；不要重写整份草图；不要计算坐标。

${SCHEMA_NOTES}`
}

/** A repair round's request: the problem, the fragments the diagnostics are about, the diagnostics. */
export function patchAsk(problem: string, fragments: Record<string, unknown>, diagnostics: Diagnostic[], rejected: string[] = []): string {
  const parts = [`<problem>\n${problem}\n</problem>`, `<sketch_fragments>\n${JSON.stringify(fragments)}\n</sketch_fragments>`, `<diagnostics>\n${diagnostics.map(d => JSON.stringify({ code: d.code, path: d.path, expected: d.expected, got: d.got, hint: d.hint, ...(d.allow?.length ? { mayAlsoSet: d.allow } : {}) })).join('\n')}\n</diagnostics>`]
  if (rejected.length) parts.push(`上一份补丁里这些条目被拒绝（改了诊断没有提到的路径，或写不进去）：${rejected.join('；')}`)
  return parts.join('\n\n')
}
export const PATCH_NOTE = '调用 submit_patch 提交补丁。'
export const PATCH_NOTE_JSON = '只输出一个 JSON 对象：{"patch":[{"op":"set","path":"…","value":…}, …]}，不要任何解释。'

/** The last resort before giving up (D282): the closest templates once more, to be used with parameters or declined. */
export function templateFallbackAsk(problem: string, candidates: TemplateCandidate[]): string {
  return `<problem>\n${problem}\n</problem>\n\n${candidateTable(candidates)}\n\n这道题的草图没能通过检查。请判断上面的候选模板里是否有一个能表达这道题：有，就提交 route "template"（templateId、templateParams 按题目原样写数值、单位与原文，questions 照写，其余列表为空）；没有，就提交 route "unsupported"，reason 写明哪一部分表达不了。`
}

/** Unit words of Chinese problem texts (longest first), read after a number when a quote is checked (check.ts): data of the problem's language, not interface text. */
export const CJK_UNITS = ['千米每小时', '米每二次方秒', '千克每立方米', '米每秒', '牛每米', '千克', '公斤', '千米', '公里', '厘米', '毫米', '分钟', '小时', '牛顿', '焦耳', '克', '米', '秒', '牛', '度', '焦', '瓦']
