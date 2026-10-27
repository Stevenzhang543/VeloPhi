/**
 * Catalogue of the lab (26.54, D76; 26.55): the experiments by domain with their school levels (初中 / 高中 / 大学).
 * The lab page shows them by topic or by level (26.55, D96).
 */
import { tl } from '../../i18n'

export type LabLevel = 'j' | 's' | 'u'
export interface LabInfo { id: string; domain: string; title: string; icon: string; levels: LabLevel[]; summary: string; planned?: string }

export const LAB_DOMAINS: Array<{ id: string; title: string }> = [
  { id: 'electric', title: tl('电与磁') },
  { id: 'optics', title: tl('光学') },
  { id: 'atomic', title: tl('原子与原子核') },
  { id: 'heat', title: tl('热学') },
  { id: 'relativity', title: tl('相对论') },
  { id: 'waves', title: tl('波与量子') }
]

export const LABS: LabInfo[] = [
  { id: 'circuit', domain: 'electric', title: tl('电路'), icon: 'battery', levels: ['j', 's', 'u'], summary: tl('直流电路的串联、并联与欧姆定律；运行：电容充放电、自感、交流电、整流、变压器、远距离输电、电动机与发电机、家庭电路、电表改装与传感器') },
  { id: 'field', domain: 'electric', title: tl('电场线与等势线'), icon: 'fieldlines', levels: ['s'], summary: tl('点电荷与匀强电场的合场：电场线、等势线、任一点的场强与电势') },
  { id: 'capacitor', domain: 'electric', title: tl('平行板电容器'), icon: 'platecap', levels: ['s'], summary: tl('C = εrS/(4πkd)：改变极板间距、面积与介质，接电源与断开电源两种情况') },
  { id: 'magnet', domain: 'electric', title: tl('磁场与电磁感应'), icon: 'compass', levels: ['j', 's'], summary: tl('直导线、环形电流、螺线管与磁铁的磁感线，平行电流的相互作用，线框的磁通量与感应电动势') },
  { id: 'lens', domain: 'optics', title: tl('透镜与面镜成像'), icon: 'lens', levels: ['j', 's'], summary: tl('凸透镜、凹透镜、凹面镜、凸面镜：三条特殊光线、像距与放大率') },
  { id: 'rays', domain: 'optics', title: tl('光的反射与折射'), icon: 'arrow', levels: ['j', 's'], summary: tl('平面镜、玻璃砖、半圆玻璃、三棱镜与透镜的光路：折射定律、全反射、色散') },
  { id: 'wave-optics', domain: 'optics', title: tl('干涉、衍射与偏振'), icon: 'slits', levels: ['s', 'u'], summary: tl('单缝、双缝、光栅的强度分布，薄膜的彩色条纹，偏振片与马吕斯定律') },
  { id: 'hydrogen', domain: 'atomic', title: tl('氢原子能级与光谱'), icon: 'atom', levels: ['s'], summary: tl('玻尔模型：能级、跃迁、谱线系与可见光谱，光子与电子的激发') },
  { id: 'photo', domain: 'atomic', title: tl('光电效应'), icon: 'sparkle', levels: ['s'], summary: tl('爱因斯坦光电效应方程、截止频率、遏止电压与饱和电流') },
  { id: 'compton', domain: 'atomic', title: tl('康普顿散射'), icon: 'scatter', levels: ['s', 'u'], summary: tl('光子与电子碰撞：波长的增加 Δλ = (h/mₑc)(1 − cosθ)，光子的动量') },
  { id: 'decay', domain: 'atomic', title: tl('放射性衰变'), icon: 'radiation', levels: ['s'], summary: tl('半衰期的统计意义：随机衰变与 N = N₀·2^(−t/T½) 对照') },
  { id: 'nuclear', domain: 'atomic', title: tl('衰变链与核反应'), icon: 'radiation', levels: ['s', 'u'], summary: tl('衰变链与放射性平衡、比结合能曲线、核反应方程与 Q 值') },
  { id: 'heating', domain: 'heat', title: tl('熔化与沸腾'), icon: 'thermometer', levels: ['j'], summary: tl('加热曲线：晶体的熔点与沸点平台，Q = cmΔt 与 Q = mL；非晶体没有熔点') },
  { id: 'mixing', domain: 'heat', title: tl('热平衡'), icon: 'thermometer', levels: ['j'], summary: tl('两种物质混合：热传递的过程与共同温度') },
  { id: 'gas', domain: 'heat', title: tl('气体与热机循环'), icon: 'piston', levels: ['s', 'u'], summary: tl('等温、等压、等容、绝热过程，p–V 图，热力学第一定律，卡诺与奥托循环的效率') },
  { id: 'relativity', domain: 'relativity', title: tl('狭义相对论'), icon: 'clock', levels: ['s', 'u'], summary: tl('时间延缓、长度收缩、洛伦兹变换、速度合成、质能关系') },
  { id: 'waves', domain: 'waves', title: tl('机械波与声'), icon: 'wave', levels: ['j', 's'], summary: tl('脉冲的反射、叠加、驻波、两种介质，多普勒效应，声音的音调、响度与拍') },
  { id: 'quantum', domain: 'waves', title: tl('一维量子力学'), icon: 'quantum', levels: ['u'], summary: tl('波包、势垒隧穿、势阱与谐振子的本征态、不确定关系') }
]

export const LEVEL_TEXT: Record<LabLevel, string> = { j: tl('初中'), s: tl('高中'), u: tl('大学') }
export const LEVELS: LabLevel[] = ['j', 's', 'u']

export function labInfo(id: string): LabInfo | undefined { return LABS.find(l => l.id === id) }
