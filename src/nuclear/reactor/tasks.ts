/**
 * The six guided tasks of the reactor workshop (26.64, D277) — reach criticality; raise the power and hold it; restart
 * in the iodine pit; lose the cooling and rely on the negative feedback; the smallest change that makes a subcritical
 * layout critical; refuelling. A task names the preset it starts from, how the reactor is started, and the limits
 * handed to `reactorTaskCheck`; whether it is passed is decided by the core alone. The texts are interface texts.
 */
import { tl } from '../../i18n'
import type { ReactorDoc, ReactorPresetId, ReactorTask } from '../../engine/nuclear'
import { fixed, kelvinText, pcmText, sig, timeText, withUnit } from '../format'

export interface TaskDef {
  id: ReactorTask
  preset: ReactorPresetId
  /** `build`: the layout alone; `cold`: started cold and shut down; `power`: in equilibrium at full power. */
  setup: 'build' | 'cold' | 'power'
  /** The check compares with the layout the task began with. */
  needsStart?: boolean
  params: Record<string, number>
  /** Changes to the preset before the task starts. */
  prepare?: (doc: ReactorDoc) => void
}

/** Enrichment of the burnt core of the refuelling task: just subcritical with the rods out. */
export const REFUEL_ENRICHMENT = 3.65

export const TASKS: TaskDef[] = [
  { id: 'critical', preset: 'research', setup: 'cold', params: {} },
  { id: 'power', preset: 'research', setup: 'cold', params: { target: 1, band: 0.02, hold_s: 60 } },
  { id: 'xenonRestart', preset: 'pwrLattice', setup: 'power', params: { wait_s: 3600, level: 0.05 } },
  { id: 'lossOfCooling', preset: 'heavyWater', setup: 'power', params: { wait_s: 300, fraction: 0.2 }, prepare: doc => { doc.protection = { ...doc.protection, enabled: false } } },
  { id: 'minimalChange', preset: 'heavyWater', setup: 'build', needsStart: true, params: { maxChanges: 1 } },
  { id: 'refuel', preset: 'research', setup: 'build', needsStart: true, params: { maxChanges: 8, maxPeak: 2.5, k: 1 }, prepare: doc => { doc.enrichment = REFUEL_ENRICHMENT; for (const r of Object.values(doc.rods ?? {})) r.insertion = 0 } }
]

const param = (task: ReactorTask, key: string, fallback: number): number => TASKS.find(t => t.id === task)?.params[key] ?? fallback

export function taskTitle(id: ReactorTask): string {
  switch (id) {
    case 'critical': return tl('达到临界')
    case 'power': return tl('升功率并稳住')
    case 'xenonRestart': return tl('碘坑中再启动')
    case 'lossOfCooling': return tl('失去冷却后自稳')
    case 'minimalChange': return tl('最小改动')
    case 'refuel': return tl('换料')
  }
}

/** What to do, in two or three sentences. */
export function taskGoal(id: ReactorTask): string {
  switch (id) {
    case 'critical': return tl('研究堆冷态停堆，控制棒全部插入。慢慢提棒，直到反应性的绝对值小于 0.1 β，并且没有触发保护。提得太快，周期保护会把棒落回去。')
    case 'power': return tl('从冷态把研究堆升到额定功率，并在 ±2 % 之内保持 60 秒。接近额定功率时提前压棒，温度反馈会帮你稳住。')
    case 'xenonRestart': return tl('压水堆栅格在满功率平衡。手动停堆，等至少 1 小时，让氙-135 积累到高于停堆时的水平，再复位保护并慢慢提棒，把功率恢复到 5 % 以上——不能再次触发保护。')
    case 'lossOfCooling': return tl('重水堆在满功率，停堆保护已关闭。把主泵流量降到 0，不落棒：等 5 分钟，看负的温度与空泡反馈能否把功率压到失去冷却时的 20 % 以下，而燃料没有损坏。')
    case 'minimalChange': return tl('这个重水堆布局不临界。只改动一格（材料、富集度、控制棒或它的插入深度），让冷态的增殖因数达到 1。')
    case 'refuel': return tl('燃耗后的堆芯（这里用较低的富集度代表）在控制棒全部提出时仍不临界。最多更换 8 格燃料（提高这些格的富集度），使 k 重新达到 1，功率峰因子不超过 2.5。只能改燃料格。')
  }
}

/** One condition of a task check as a line: what is required and what the core found. */
export function checkText(task: ReactorTask, c: { id: string; ok: boolean; value: number; limit: number }): string {
  const v = c.value, l = c.limit
  const time = (x: number) => (Number.isFinite(x) ? timeText(Math.max(0, x)) : '—')
  switch (c.id) {
    case 'reactivity': return tl('反应性的绝对值不超过 {1}：现在 {0}', [pcmText(v, 1), pcmText(l, 1)])
    case 'notTripped': return tl('没有触发保护，仿真没有结束')
    case 'held': return tl('最近 {1} 内功率偏离目标不超过 {2}：最大偏离 {0}', [withUnit(fixed(v * 100, 2), '%'), timeText(param(task, 'hold_s', 60)), withUnit(fixed(l * 100, 0), '%')])
    case 'recorded': return tl('记录覆盖了 {1}：现有 {0}', [time(v), time(l)])
    case 'now': return tl('现在的相对功率 {0}，目标 {1}', [fixed(v, 4), fixed(l, 2)])
    case 'shutDown': return tl('停堆后已过 {0}，要求至少 {1}', [time(v), time(l)])
    case 'xenonAbove': return tl('氙-135 高于停堆时：现在 {0}，停堆时 {1}（10²⁴ cm⁻³）', [sig(v, 4), sig(l, 4)])
    case 'running': return tl('已重新运行：相对功率 {0}，要求不低于 {1}', [sig(v, 3), fixed(l, 2)])
    case 'coolingLost': return tl('失去冷却后已过 {0}，要求至少 {1}', [time(v), time(l)])
    case 'noScram': return tl('没有落棒，也没有触发保护')
    case 'powerFell': return tl('相对功率降到 {1} 以下：现在 {0}', [sig(v, 3), sig(l, 3)])
    case 'fuelWhole': return tl('燃料最高温度 {0} 低于损坏限值 {1}', [kelvinText(v), kelvinText(l)])
    case 'startSubcritical': return tl('起始布局不临界：k = {0}', [fixed(v, 5)])
    case 'critical': return tl('现在 k = {0}，要求不低于 {1}', [fixed(v, 5), fixed(l, 3)])
    case 'changes': return tl('改动了 {0} 格，最多允许 {1} 格（至少 1 格）', [fixed(v, 0), fixed(l, 0)])
    case 'onlyFuel': return tl('只改了燃料格：有 {0} 格不是燃料', [fixed(v, 0)])
    case 'peak': return tl('功率峰因子 {0}，不超过 {1}', [fixed(v, 2), fixed(l, 2)])
    default: return `${c.id}: ${sig(v, 4)} / ${sig(l, 4)}`
  }
}
