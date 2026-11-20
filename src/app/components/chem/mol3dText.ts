/**
 * Texts of the 3D viewer (26.64, D271): the three-language names of the geometries and polyhedra the core returns as
 * keys, the wording of its diagnostics, and the typesetting of the numbers it computed (the viewer formats, it never
 * calculates).
 */
import { locale, tl, trDeep } from '../../../i18n'
import type { ChemDiagnostic, GeometryKey, MolCentre, MolMeasurement, PolyhedronKey } from '../../../engine/mol'
import { decimalFor } from '../../settings'

const GEOMETRY: Record<GeometryKey, string> = trDeep({
  linear: '直线形', bent: 'V 形', trigonalPlanar: '平面三角形', trigonalPyramidal: '三角锥形', tShaped: 'T 形', tetrahedral: '四面体形', seesaw: '跷跷板形',
  squarePlanar: '平面正方形', trigonalBipyramidal: '三角双锥形', squarePyramidal: '四方锥形', pentagonalPlanar: '平面五边形', octahedral: '八面体形',
  pentagonalPyramidal: '五角锥形', pentagonalBipyramidal: '五角双锥形', trigonalPrismatic: '三棱柱形'
})
/** The regular forms: all neighbours the same element at the same distance. */
const REGULAR: Partial<Record<GeometryKey, string>> = trDeep({ tetrahedral: '正四面体形', octahedral: '正八面体形', trigonalPlanar: '平面正三角形' })

const POLYHEDRON: Record<PolyhedronKey, string> = trDeep({
  linear: '直线形', triangle: '平面三角形', square: '平面正方形', tetrahedron: '四面体', trigonalBipyramid: '三角双锥', squarePyramid: '四方锥', octahedron: '八面体',
  trigonalPrism: '三棱柱', cube: '立方体', squareAntiprism: '四方反棱柱', cuboctahedron: '立方八面体', anticuboctahedron: '反立方八面体', icosahedron: '二十面体'
})

/** Every geometry key the viewer can name (tests). */
export const GEOMETRY_KEYS = Object.keys(GEOMETRY) as GeometryKey[]
export const POLYHEDRON_KEYS = Object.keys(POLYHEDRON) as PolyhedronKey[]

/** Name of a geometry: 正四面体形 for a regular tetrahedron, 四面体形 otherwise. */
export function geometryName(key: GeometryKey | null, regular = false): string {
  if (!key) return ''
  return (regular && REGULAR[key]) || GEOMETRY[key] || key
}

export function polyhedronName(key: PolyhedronKey | null): string {
  return key ? POLYHEDRON[key] ?? key : ''
}

const SUBSCRIPT = '₀₁₂₃₄₅₆₇₈₉'

/** AX2E2 → AX₂E₂. */
export function classText(cls: string | null): string {
  return (cls ?? '').replace(/\d/g, d => SUBSCRIPT[Number(d)])
}

/** A number with fixed decimals, the language's decimal separator and a true minus sign. */
export function fixed(v: number, digits: number): string {
  const s = Math.abs(v).toFixed(digits)
  const zero = Number(s) === 0
  return (v < 0 && !zero ? '−' : '') + (decimalFor(locale.lang) === ',' ? s.replace('.', ',') : s)
}

/** Narrow no-break space between a number and its unit. */
const NNBSP = ' '

/** A length in picometres with ångström in parentheses: the two units school books use. */
export function lengthText(angstrom: number): string {
  return `${fixed(angstrom * 100, 1)}${NNBSP}pm (${fixed(angstrom, 3)}${NNBSP}Å)`
}

export const angleText = (deg: number): string => `${fixed(deg, 1)}°`

/** The geometry of a central atom in one line: 「V 形 · AX₂E₂ · 104.5°」. */
export function centreText(c: MolCentre): string {
  const parts = [geometryName(c.geometry, c.regular)]
  if (c.class) parts.push(classText(c.class))
  // One representative bond angle: the only one, or the common one of a regular shape
  if (c.angles.length === 1 || (c.regular && c.angles.length > 1 && c.angles[c.angles.length - 1] - c.angles[0] < 0.05)) parts.push(angleText(c.angles[0]))
  return parts.filter(Boolean).join(' · ')
}

/** A measurement between picked atoms, with the symbols of the atoms: 「O–H 95.7 pm (0.957 Å)」. */
export function measurementText(m: MolMeasurement, symbols: string[]): string {
  const who = symbols.join('–')
  if (m.kind === 'distance') return `${who} ${lengthText(m.distance)}`
  if (m.kind === 'angle') return `∠${who} ${angleText(m.angle)}`
  return m.dihedral === null ? tl('二面角没有定义（有三个原子共线）') : `${tl('二面角')} ${who} ${angleText(m.dihedral)}`
}

/** The short form drawn in the picture next to the measurement. */
export function measurementBadge(m: MolMeasurement): string {
  if (m.kind === 'distance') return `${fixed(m.distance * 100, 1)}${NNBSP}pm`
  if (m.kind === 'angle') return angleText(m.angle)
  return m.dihedral === null ? '—' : angleText(m.dihedral)
}

/** 「3d z²」 from the subshell and the core's key of the angular part (`dz2`, `dx2-y2`, `fx(x2-3y2)` …). */
export function orbitalName(subshell: string, key: string): string {
  const part = key.slice(1).replace(/([a-z)])2/g, '$1²').replace(/([a-z])3/g, '$1³').replace(/-/g, '−')
  return part ? `${subshell} ${part}` : subshell
}

/** The dipole moment: 「μ = 1.85 D」, with ≈ for the bond estimate. */
export function dipoleText(magnitude: number, estimated: boolean): string {
  return `μ ${estimated ? '≈' : '='} ${fixed(magnitude, 2)}${NNBSP}D`
}

/** The wording of a diagnostic of the molecule operations; '' for codes that need no line of their own. */
export function diagnosticText(d: ChemDiagnostic): string {
  const p = d.params ?? {}
  switch (d.code) {
    case 'mol.dipoleEstimated': return tl('偶极矩由各键的电负性差估算，没有计入孤对电子，只能看方向和量级。')
    case 'mol.dipoleIncomplete': return tl('有的元素没有电负性数据，这些键没有计入偶极矩。')
    case 'mol.dipoleOfIon': return tl('这是带电的离子，偶极矩以质心为原点。')
    case 'mol.vseprNotApplicable': return tl('{0} 是过渡金属中心，价层电子对互斥模型不适用，构型取自坐标。', [String(p.element ?? '')])
    case 'mol.vseprNoClass': return tl('{0} 这种电子对组合没有对应的构型名称。', [classText(String(p.class ?? ''))])
    case 'mol.geometryDiffers': return tl('电子对计数预测{0}，坐标显示的是{1}（离域的孤对电子或单电子会造成这种差别）。', [geometryName(p.predicted as GeometryKey), geometryName(p.observed as GeometryKey)])
    case 'mol.unknownElement': return tl('不认识元素符号 {0}，它按默认大小画出，不参与计算。', [String(p.symbol ?? '')])
    case 'crystal.structureUnknown': return tl('结构类型 {0} 还不能由晶格常数生成，需要给出晶胞内全部原子的坐标。', [String(p.structure ?? '')])
    default: return ''
  }
}
