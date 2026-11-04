/**
 * The scene builder's built-in prompt (26.59 fix 3, D198; a JSON-only request since 26.60, D204): read the problem and
 * write a complete VeloΦ scene file (the JSON of a saved .velophi.json, `format: "velophi-scene"`) with the questions —
 * the app checks it, places it, lets the engine compute and returns the answers. The prompt describes the file format
 * field by field, the conventions (SI, x right, y up, angles counter-clockwise), recipes for the usual textbook set-ups
 * and three complete examples (checked by tests/ai/sim2659.test.ts, so they always load).
 */
import { EVENTS } from '../import/catalog'

/** Complete example files (with their questions) — shown to the model and loaded by the tests. */
export const SIM_EXAMPLES: Array<{ title: string; file: Record<string, unknown> }> = [
  {
    title: '例 1：质量 2 kg 的物块从倾角 30° 的斜面（μ = 0.2）上由静止下滑，g 取 10 m/s²，求 1 s 末的速度和下滑的加速度。',
    file: {
      format: 'velophi-scene', name: '斜面上的物块',
      settings: { gravity: { x: 0, y: -10 }, duration: 2 },
      bodies: [
        { id: 'slope', name: '斜面', kind: 'static', shape: { type: 'polygon', points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 2.3094 }] }, position: { x: 0, y: 0 }, material: { muS: 0.2, muK: 0.2, restitution: 0 } },
        { id: 'block', name: '物块', kind: 'rigid', shape: { type: 'box', width: 0.3, height: 0.2 }, position: { x: 0.5, y: 2.2 }, mass: 2, material: { muS: 0.2, muK: 0.2, restitution: 0 }, rest: true }
      ],
      questions: [
        { prompt: '1 s 末的速度', target: { kind: 'quantity', id: 'block.v', t: 1 }, unit: 'm/s' },
        { prompt: '下滑的加速度', target: { kind: 'quantity', id: 'block.a', t: 0.5 }, unit: 'm/s²' }
      ]
    }
  },
  {
    title: '例 2：水平桌面上质量 2 kg 的物块 A（与桌面 μ = 0.2）用轻绳跨过桌边的光滑定滑轮与质量 1 kg 的物块 B 相连，B 离地 0.6 m，由静止释放，求 A 的加速度和绳的拉力。',
    file: {
      format: 'velophi-scene', name: '桌面—滑轮连接体',
      settings: { gravity: { x: 0, y: -9.8 }, duration: 1.5 },
      bodies: [
        { id: 'floor', name: '地面', kind: 'static', shape: { type: 'box', width: 6, height: 0.4 }, position: { x: 0, y: -0.2 }, material: { muS: 0.5, muK: 0.5, restitution: 0 } },
        { id: 'table', name: '桌面', kind: 'static', shape: { type: 'box', width: 2, height: 0.4 }, position: { x: 0, y: 0.8 }, material: { muS: 0.2, muK: 0.2, restitution: 0 } },
        { id: 'A', name: '物块A', kind: 'rigid', shape: { type: 'box', width: 0.2, height: 0.2 }, position: { x: 0, y: 1.1 }, mass: 2, material: { muS: 0.2, muK: 0.2, restitution: 0 } },
        { id: 'B', name: '物块B', kind: 'rigid', shape: { type: 'box', width: 0.12, height: 0.12 }, position: { x: 1.1, y: 0.66 }, mass: 1, material: { muS: 0, muK: 0, restitution: 0 } }
      ],
      pulleys: [{ id: 'wheel', name: '定滑轮', position: { x: 1.05, y: 1.05 }, radius: 0.05 }],
      connectors: [{ id: 'rope', type: 'rope', a: { body: 'A', local: { x: 0, y: 0 } }, b: { body: 'B', local: { x: 0, y: 0 } }, pulleys: [{ pulley: 'wheel', wrap: 'cw' }], length: null }],
      questions: [
        { prompt: 'A 的加速度', target: { kind: 'quantity', id: 'A.a', t: 0.2 }, unit: 'm/s²' },
        { prompt: '绳的拉力', target: { kind: 'quantity', id: 'rope.T', t: 0.2 }, unit: 'N' }
      ]
    }
  },
  {
    title: '例 3：半径 R = 0.8 m 的光滑四分之一圆弧轨道竖直固定，底端与光滑水平面相切。质量 0.1 kg 的小球从轨道顶端由静止滑下，求到达底端时的速度和对轨道的压力。',
    file: {
      format: 'velophi-scene', name: '四分之一圆弧轨道',
      settings: { gravity: { x: 0, y: -9.8 }, duration: 1.5 },
      bodies: [
        { id: 'track', name: '圆弧轨道', kind: 'static', shape: { type: 'arc', radius: 0.8, thickness: 0.1, start: 3.14159265, sweep: 1.57079633 }, position: { x: 0, y: 0.8 }, material: { muS: 0, muK: 0, restitution: 0 } },
        { id: 'floor', name: '水平面', kind: 'static', shape: { type: 'box', width: 6, height: 0.4 }, position: { x: 3, y: -0.2 }, material: { muS: 0, muK: 0, restitution: 0 } },
        { id: 'ball', name: '小球', kind: 'particle', shape: { type: 'circle', radius: 0.03 }, position: { x: -0.7695, y: 0.7731 }, mass: 0.1, material: { muS: 0, muK: 0, restitution: 0 } }
      ],
      questions: [
        { prompt: '到达底端时的速度', target: { kind: 'extreme', id: 'ball.v', which: 'max' }, unit: 'm/s' },
        { prompt: '在底端时轨道对小球的支持力', target: { kind: 'extreme', id: 'contact.ball|track.N', which: 'max' }, unit: 'N' }
      ]
    }
  }
]

const TARGETS = `{"kind":"quantity","id":"block.v","t":2}        t 秒时的值
{"kind":"atEvent","id":"ball.v","event":"impact","side":"before","body":"ball"}   某事件第一次发生前（before）/ 后（after）瞬间的值；body 可省略
{"kind":"event","event":"leave","body":"block"}      某事件第一次发生的时刻（s）
{"kind":"end","id":"block.x"}                        仿真结束时的值
{"kind":"extreme","id":"ball.y","which":"max"}       全过程最大（max）/ 最小（min）值
事件：${Object.entries(EVENTS).map(([k, v]) => `${k}=${v}`).join('；')}。`

/**
 * The scene builder's prompt (26.60, D204): a separate request that returns exactly one JSON object — the complete
 * VeloΦ scene file and the questions — and nothing else. The app parses it, checks and places it (simScene.ts) and
 * sends the problems back for a corrected object (at most three tries). The chat Copilot never writes scene files
 * itself: it asks for a build (build_scene), and a problem's answer offers the build to the user.
 */
export function builderSystem(): string {
  return `你是 VeloΦ 的“场景构建器”。VeloΦ 是二维物理仿真与教学引擎：画面与数值都由数值求解器算出。
你的唯一任务：把题目（或用户描述的情景）写成一个 VeloΦ 场景 JSON。App 会检查、载入并让引擎计算答案。

# 输出（必须严格遵守）
只输出一个 JSON 对象，不要任何解释、Markdown、代码块标记或注释，第一个字符是 {，最后一个字符是 }：
{"title": "简短标题", "stem": "题目原文（或情景描述）", "assumptions": ["所作的假设或取的尺寸", …], "scene": 场景文件, "questions": [问题…]}
- 标准 JSON：键用双引号；没有注释、没有尾随逗号；数值只能是数字（不能写 2*sin(30)、√3、1/2 这样的表达式，先算出来，保留 6 位有效数字）。
- 输出前逐条自查：① 所有 id 唯一且被引用的物体/滑轮都存在；② 可动物体 mass > 0；③ 物体起始时不互相重叠（可以接触）；④ 读数 id 与 target 合法；⑤ 单位全部是 SI。

# 读题与建模
1. 研究对象、运动过程（分几段、何时碰撞/脱离/共速）、全部已知量（统一换算为 SI：cm→m、g→kg、km/h→m/s；角度写成弧度或用 *Deg 键）、所求。题目说“光滑”就把摩擦因数设为 0；没给 g 用 9.8（题目说取 10 就用 10）。
2. 选坐标原点（通常地面 y = 0），算出每个物体的位置；起始时物体之间只能接触，不能重叠。物体要放在某个表面上时，可以写一个大致在表面上方的位置并加 "rest": true，App 会把它放到正下方的表面上（方块与表面平行）。
3. 题目有多个过程时，一个场景就要能自然演化出全部过程（例如先在斜面上滑下再在水平面上滑行：斜面与水平面都要搭出来）。
4. 题目没给的尺寸取合理值（物块 0.2 m 左右、小球半径 0.05 m，当质点时用 kind particle 和小半径），写进 assumptions。
5. settings.duration 写成能覆盖所有所求的时长（秒）；运行时只要物体还在运动，引擎会继续算下去。
6. 引擎算不了的题（电路、光学、热学、纯代数的静力学等）：输出 {"error": "原因"}。

# 场景文件格式（SI 单位；x 向右、y 向上；角度为弧度，逆时针为正）
{
  "format": "velophi-scene",
  "name": "场景名",
  "settings": { "gravity": {"x": 0, "y": -9.8}, "duration": 3 },
  "bodies": [ 物体… ],
  "pulleys": [ 滑轮… ],
  "connectors": [ 绳、杆、弹簧、力… ],
  "watch": [ "block.v", … ]
}
省略的字段取默认值：version/engine/view（App 自动补上并取景）、angle 0、velocity 0、angularVelocity 0、material 全 0（光滑、完全非弹性）、inertia null（按均匀物体计算）、fixedRotation false。

## settings
gravity {x, y}（m/s²，竖直向下为 y 负）；duration 时长 s；stopAt {"on": "stick"|"slip"|"separate"|"touch"|"impact"|"slack"|"taut", "after": s} 某类事件后停止（题目明确要求时才用）；
electric {"E": {x, y}}（V/m，全空间匀强电场）；magnetic {"B": 数值}（T，垂直纸面向外为正）；coulomb {"k": 8.9875517862e9}（带电体间的库仑力）；
regions：有界场区与液体 [{"id": "f1", "kind": "field"|"liquid", "shape": "rect"|"circle", "x": 中心x, "y": 中心y, "w": 宽, "h": 高, "r": 半径(圆形), "E": {x, y}, "B": 数值, "density": 液体密度 kg/m³, "depth": 物体垂直纸面的厚度 m}]（液体只能是矩形，液面在顶边）；
gravitation {"G": 6.674e-11}（物体间万有引力）；integrator 默认 "dopri5"（精确事件求解），几十个物体堆叠时用 "softstep"。

## 物体 bodies[]
{ "id": "block", "name": "物块",
  "kind": "rigid" | "particle" | "static",   // rigid 刚体（可转动）；particle 质点（只平动：小球、带电粒子）；static 固定物（地面、斜面、墙、轨道）
  "shape": {…},
  "position": {"x": 0, "y": 0.1},   // 可动物体：质心；固定物：形状坐标的原点
  "angle": 0, "velocity": {"x": 0, "y": 0}, "angularVelocity": 0,
  "mass": 2,
  "material": {"muS": 0.2, "muK": 0.2, "restitution": 0},
  "charge": 1e-6, "fixedRotation": true, "drag": {"linear": b, "quadratic": c}, "beltSpeed": 2, "rest": true }   // 后五项可选
id 字母开头，只含字母、数字、_；读数 id 用它（block.v）。接触时取两物体中较小的 μ 和 e（要精确指定某一对，用 settings.contactPairs: [{"a": id, "b": id, "muS", "muK", "restitution"}]）。
形状 shape：
- {"type": "circle", "radius": r}
- {"type": "box", "width": w, "height": h}（position 是中心）
- {"type": "polygon", "points": [{"x": …, "y": …}, …]}：逆时针，不自交；固定物的顶点相对 position（通常 position 为 {0,0}，顶点直接写世界坐标）；可动物体的顶点相对质心（App 会自动移到质心）
- {"type": "compound", "parts": [{"shape": 部件形状, "position": {x, y}, "angle": 0}, …]}：一个刚体由几部分组成（带轮小车、L 形）
- {"type": "arc", "radius": 内半径, "thickness": 厚度, "start": 起始角, "sweep": 圆心角}：圆弧轨道（圆环扇形）；内侧是精确的凹圆面（槽、竖直圆轨道、凹形桥），外侧是精确的凸圆面（拱形桥）；0 指向右、π/2 指向上，从 start 逆时针转过 sweep（≤ 2π）。固定圆弧：position 就是圆心。可动圆弧槽：position 写圆心，App 换算到质心。
角度也可以写成度：angleDeg、startDeg、sweepDeg。

## 滑轮 pulleys[]
{"id": "wheel", "position": {x, y}, "radius": 0.05}（固定在世界中）；动滑轮加 "body": "物体 id"，position 为相对该物体质心的坐标。滑轮无质量、光滑。

## 连接件 connectors[]
锚点 a/b："物体 id"（质心）、{"body": id, "local": {x, y}}（物体上相对质心的点）或 {"body": null, "local": {x, y}}（世界中的固定点）。每个连接件要有唯一 id。
- 绳 {"id": "rope", "type": "rope", "a": 锚点, "b": 锚点, "pulleys": [{"pulley": "wheel", "wrap": "cw"}], "length": null}：pulleys 按从 a 到 b 的顺序；wrap 可省略（App 按几何判断）；length null 为初始拉直。读数 rope.T。
- 轻杆 {"type": "rod", "a", "b", "length": null}；铰链 {"type": "hinge", "a", "b"}（两点重合；绕固定轴转动时 b 用世界固定点）；焊接 {"type": "weld", "a", "b"}。
- 弹簧 {"type": "spring", "a", "b", "stiffness": k, "restLength": 原长（null 为初始长度）, "damping": 0}。读数 spring.F、spring.x。
- 恒力 {"type": "force", "a": "block", "force": {"x": Fx, "y": Fy}}；随时间变化加 "expr": {"x": "10*sin(2*pi*t)", "y": "0"}。读数 <力 id>.F。
- 阻尼器 {"type": "damper", "a", "b", "damping": c}；滑轨 {"type": "slider", "a", "b", "axis": {x, y}}；电动机 {"type": "motor", "a", "b", "mode": "speed"|"torque", "speed": ω, "torque": M}；齿轮 {"type": "gear", "a", "b", "ratio": r}；有心力 {"type": "central", "a": 中心锚点, "k": 强度, "n": 指数, "targets": null}。

# 常见情景
- 地面：固定 box，上表面 y = 0：{"shape": {"type": "box", "width": 20, "height": 0.4}, "position": {"x": 0, "y": -0.2}}。墙：竖直的固定 box。
- 斜面（倾角 θ，底边 b，从左上向右下）：固定 polygon [{x0, y0}, {x0 + b, y0}, {x0, y0 + b·tanθ}]；斜面上的物体用 "rest": true，或：沿坡距顶端 s 处的方块中心 = (x0 + s·cosθ + (w/2)cosθ + (h/2)sinθ, y0 + b·tanθ − s·sinθ − (w/2)sinθ + (h/2)cosθ)，angle = −θ。
- 板块模型：地面上放木板（box），板上放物块（"rest": true，或 y = 板顶 + h/2），初速度写在 velocity。
- 定滑轮：被绳竖直吊着的物体 x = 滑轮中心 x ± 半径；水平段的绳高度 = 滑轮中心 y + 半径。
- 单摆 / 绳拉小球做圆周运动：绳的一端为世界固定点 {"body": null, "local": 悬点}；杆模型用 rod。
- 碰撞：velocity 写初速度，restitution 决定弹性（1 弹性、0 完全非弹性）。抛体：小球 velocity；问到“落地”就放地面并用 impact 事件。
- 圆弧轨道：四分之一圆弧（左侧顶端到底端，底端与水平面相切）：圆心在切点正上方 R，start π、sweep π/2；半圆槽 start π、sweep π；竖直圆轨道 start 0、sweep 2π；拱形桥：radius = R − thickness，start π/6、sweep 2π/3。小球（半径 r）在内侧角 φ：圆心 + (R − r)(cos φ, sin φ)；在外侧：圆心 + (R + r)(cos φ, sin φ)；不要放在端点上，往里 1–2°。
- 带电粒子：kind particle、charge、velocity；匀强场写在 settings.electric / magnetic，有界场用 regions；题目说重力不计时 gravity 为 {"x": 0, "y": 0}。
- 浮力：settings.regions 里的液体（kind liquid），物体的 depth 为垂直纸面的厚度。

# 读数 id 与 questions
读数 id：<物体>.x .y .vx .vy .v .ax .ay .a .ek .ep .angle .omega .alpha；接触力 contact.<受力物体>|<施力物体>.N（支持力/压力）、.f（摩擦力）；摩擦生热 pair.<a>|<b>.heat；<绳>.T；<弹簧>.F .x；<力>.F；<铰链>.F；system.ek .ep .es .e；ledger.frictionHeat。
questions：每个所求一个 {"prompt": "所求（题目的语言）", "target": {…}, "unit": "答案单位"}，target 只能是：
${TARGETS}
“最低点/最高点的速度、最大压力”用 extreme；“碰前/碰后”用 atEvent；“经过多长时间到达/离开/共速”用 event；“t 秒时”用 quantity。没有可计算的所求时 questions 为 []。

# 完整示例（每个都是一份完整的输出）
${SIM_EXAMPLES.map(e => `${e.title}
${JSON.stringify(builderOutput(e))}`).join('\n\n')}`
}

/** An example of the prompt as the builder's whole output. */
function builderOutput(e: { title: string; file: Record<string, unknown> }) {
  const { questions, ...scene } = e.file
  return { title: String(scene.name), stem: e.title.replace(/^例 \d+：/, ''), assumptions: [], scene, questions }
}

/** What the builder is asked: the problem, the Copilot's explanation (to read it right), a change of the current scene. */
export interface BuildAsk { problem?: string; solution?: string; request?: string; current?: unknown }
export function builderAsk(a: BuildAsk): string {
  const parts: string[] = []
  if (a.problem) parts.push(`<problem>\n${a.problem}\n</problem>`)
  if (a.solution) parts.push(`<explanation>（Copilot 对这道题的讲解，帮助你理解题意与所求；场景只按题目的条件搭建）\n${a.solution.length > 3500 ? `${a.solution.slice(0, 3500)}…` : a.solution}\n</explanation>`)
  if (a.current) parts.push(`<current_scene>（当前场景文件：在它的基础上修改，输出修改后的完整文件）\n${JSON.stringify(a.current)}\n</current_scene>`)
  if (a.request) parts.push(`<request>\n${a.request}\n</request>`)
  parts.push('只输出场景 JSON 对象。')
  return parts.join('\n\n')
}

/** Sent back when the builder's object could not be loaded. */
export const repairNote = (errors: string[]) => `App 没能载入这个场景：\n- ${errors.join('\n- ')}\n请逐条改正，重新输出完整的 JSON 对象（只输出 JSON）。`

/** The engine's answers of a built scene, as context for the Copilot's explanation. */
export function simResultsText(name: string, answers: Array<{ prompt: string; text: string; note?: string }> | null, hidden: boolean): string {
  const lines = answers?.length && !hidden
    ? answers.map((a, i) => `(${i + 1}) ${a.prompt} = ${a.text}${a.note ? `（${a.note}）` : ''}`)
    : [hidden ? '（学习模式：仿真答案暂不公开）' : '（仿真答案尚未算出）']
  return `\n\n<sim_results>\nVeloΦ 引擎对这道题的仿真结果（场景：${name}）：\n${lines.join('\n')}\n</sim_results>`
}
