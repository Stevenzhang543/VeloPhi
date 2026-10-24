/**
 * Keyboard and mouse shortcuts, collected from App.vue (global keys) and the viewport / editor (canvas input).
 * Shown on the settings page and in the about dialog; keep in step with the handlers.
 */
/** One shortcut: alternative key combinations and what they do. */
export interface Shortcut { keys: string[][]; text: string }
/** A titled group of shortcuts. */
export interface ShortcutGroup { title: string; items: Shortcut[] }

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
/** "Ctrl" on Windows and Linux, "⌘" on macOS. */
export const MOD = isMac ? '⌘' : 'Ctrl'

/** Every shortcut, grouped as on the settings page. */
export const SHORTCUTS: ShortcutGroup[] = [
  { title: '文件', items: [
    { keys: [[MOD, 'N']], text: '新建场景' },
    { keys: [[MOD, 'O']], text: '打开场景' },
    { keys: [[MOD, 'S']], text: '保存' },
    { keys: [[MOD, 'Shift', 'S']], text: '另存为' }
  ] },
  { title: '编辑', items: [
    { keys: [[MOD, 'Z']], text: '撤销' },
    { keys: [[MOD, 'Y'], [MOD, 'Shift', 'Z']], text: '重做' },
    { keys: [[MOD, 'C'], [MOD, 'V']], text: '复制 / 粘贴所选对象（粘贴到指针处）' },
    { keys: [[MOD, 'D']], text: '原地复制一份' },
    { keys: [['Delete'], ['Backspace']], text: '删除所选对象' },
    { keys: [['←'], ['→'], ['↑'], ['↓']], text: '编辑时微移所选对象一个网格（Shift ×10）' },
    { keys: [['Esc']], text: '取消当前工具、拖动或未完成的绘制' },
    { keys: [['Shift', '点击']], text: '连续放置同一种物体' },
    { keys: [['Alt', '拖动']], text: '临时关闭网格吸附' },
    { keys: [['Alt', '点击顶点']], text: '删除多边形的这个顶点' },
    { keys: [['Enter'], ['双击']], text: '画多边形时闭合；Backspace 撤回上一个点' },
    { keys: [['双击文字']], text: '编辑文字标注' },
    { keys: [['右键']], text: '对象的快捷菜单' }
  ] },
  { title: '工具', items: [
    { keys: [['V']], text: '选择' },
    { keys: [['H']], text: '平移视图' },
    { keys: [['B'], ['O'], ['C'], ['P']], text: '物块 / 小球 / 圆柱 / 多边形' },
    { keys: [['G'], ['I'], ['W']], text: '地面 / 斜面 / 墙' },
    { keys: [['M'], ['A']], text: '尺子 / 量角器' },
    { keys: [['T'], ['L']], text: '文字 / 箭头标注' }
  ] },
  { title: '仿真与播放', items: [
    { keys: [[MOD, 'Enter']], text: '重新计算' },
    { keys: [['空格']], text: '播放 / 暂停' },
    { keys: [['←'], ['→']], text: '上一帧 / 下一帧（未在微移对象时）' },
    { keys: [['Shift', '←'], ['Shift', '→']], text: '后退 / 前进 10 帧' },
    { keys: [['Home'], ['End']], text: '回到开始 / 跳到结尾' }
  ] },
  { title: '视图', items: [
    { keys: [['滚轮']], text: '以指针为中心缩放' },
    { keys: [['中键拖动'], ['空格', '拖动']], text: '平移视图' }
  ] },
  { title: '页面', items: [
    { keys: [['Alt', '1']], text: '工作台' },
    { keys: [['Alt', '2']], text: '渲染与监视' },
    { keys: [['Alt', '3'], [MOD, ',']], text: '设置' }
  ] }
]
