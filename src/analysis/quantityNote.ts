/**
 * What a watched or plotted quantity is, in words (26.57, D121; manual §4.3 item 10): a component names its frame and
 * its positive direction, a magnitude says it has no sign, a quantity along an incline names that direction. The
 * built-in quantities of bodies and contacts are measured in the ground frame with x to the right and y up (the
 * core's convention); the incline template's own quantities are along the incline, positive down the slope.
 * Returns a source text ('' when the label says everything).
 */
export function quantityNote(q: { id: string; group: string }): string {
  const id = q.id
  // the incline template's quantities along the slope (templates/t2657.ts)
  if (/^custom\.(s|vs|as)$/.test(id)) return '沿斜面坐标 s，沿斜面向下为正'
  if (q.group === '物体') {
    const k = id.slice(id.indexOf('.') + 1)
    if (k === 'x') return '地面参考系中的坐标，x 轴向右为正'
    if (k === 'y') return '地面参考系中的坐标，y 轴向上为正'
    if (['vx', 'ax', 'px'].includes(k)) return '地面参考系中的分量，x 轴向右为正'
    if (['vy', 'ay', 'py'].includes(k)) return '地面参考系中的分量，y 轴向上为正'
    if (k === 'angle') return '转角，逆时针为正'
    if (k === 'omega' || k === 'alpha') return '逆时针为正'
    if (['v', 'a', 'fd', 'Fg', 'FE', 'FB', 'Fc', 'Fb'].includes(k)) return '大小（不带方向，总为非负）'
    return ''
  }
  if (q.group === '接触') {
    if (/\.fx$/.test(id)) return '地面参考系中的分量，x 轴向右为正'
    if (/\.fy$/.test(id)) return '地面参考系中的分量，y 轴向上为正'
    if (/\.(N|f)$/.test(id)) return '这一对物体之间所有接触点的合计，大小'
    return ''
  }
  return ''
}
