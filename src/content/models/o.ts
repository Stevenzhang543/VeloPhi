/**
 * O01–O14: geometric and wave optics (blueprint §5.8; doc 02 §8). Lens and mirror formulas use the real-is-positive
 * convention: real object and image distances are positive, converging lenses and concave mirrors have f > 0.
 */
import type { ModelSpec } from './types'
import { A, L, T, cond, inp, let_, nonneg, out, pos } from './dsl'

const R2 = { physics: '2026-10-28', language: '2026-10-28' }
const ang = (id: string, symbol: string, label: ReturnType<typeof T>, value: number) => inp(id, symbol, label, 'rad', 'angle', value, { min: 0, max: Math.PI / 2 })
const lam = (value: number) => pos('lam', '\\lambda', L.lambda, 'm', 'length', value)
const conv = T('实物、实像距离取正；会聚透镜与凹面镜 f > 0', 'Real object and image distances positive; converging lenses and concave mirrors f > 0', 'Reelle Gegenstands- und Bildweiten positiv; Sammellinsen und Hohlspiegel f > 0')

export const MODELS_O: ModelSpec[] = [
  {
    id: 'O01', title: T('平面镜与反射', 'Plane mirror and reflection', 'Ebener Spiegel und Reflexion'),
    stages: ['j'], priority: 'P1', geometry: 'plane',
    assumptions: [T('理想平面镜，角度相对法线量', 'Ideal plane mirror; angles measured from the normal', 'Idealer ebener Spiegel; Winkel zum Lot gemessen')],
    validity: T('像距取负表示镜后的虚像（反向延长线会聚）', 'A negative image distance means a virtual image behind the mirror (backward extensions meet)', 'Eine negative Bildweite bedeutet ein virtuelles Bild hinter dem Spiegel (rückwärtige Verlängerungen treffen sich)'),
    sources: ['S35', 'S77'],
    inputs: [pos('d0', 'd_o', T('物距', 'Object distance', 'Gegenstandsweite'), 'm', 'length', 2), ang('thi', '\\theta_i', T('入射角', 'Angle of incidence', 'Einfallswinkel'), Math.PI / 6)],
    outputs: [out('thr', '\\theta_r', T('反射角', 'Angle of reflection', 'Reflexionswinkel'), 'rad', 'thi'), out('di', 'd_i', T('像距（负为镜后虚像）', 'Image distance (negative: virtual, behind)', 'Bildweite (negativ: virtuell, dahinter)'), 'm', '-d0'), out('mag', 'm', T('放大率', 'Magnification', 'Vergrößerung'), '', '1')],
    example: { text: T('物体距平面镜 2 m，入射光与法线夹角 30°。', 'An object 2 m from a plane mirror; light meets the mirror at 30° to the normal.', 'Ein Gegenstand 2 m vor einem ebenen Spiegel; Licht trifft unter 30° zum Lot.'), answer: T('像在镜后 2 m，虚像等大；反射角为 30°。', 'Image 2 m behind the mirror, virtual and the same size; angle of reflection 30°.', 'Bild 2 m hinter dem Spiegel, virtuell und gleich groß; Reflexionswinkel 30°.') },
    point: T('角度相对法线量，虚像不是实际光线会聚。', 'Angles are measured from the normal; a virtual image is not where rays actually meet.', 'Winkel zum Lot; ein virtuelles Bild ist kein Treffpunkt wirklicher Strahlen.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:O01', 'rust:src/labs/optics.rs snell_and_total_internal_reflection'],
    links: { labs: ['rays'] }, review: R2
  },
  {
    id: 'O02', title: T('折射与色散', 'Refraction and dispersion', 'Brechung und Dispersion'),
    stages: ['j', 's'], priority: 'P1', geometry: 'plane',
    assumptions: [T('各向同性均匀介质，单色光（色散时 n 随波长变化）', 'Isotropic uniform media, monochromatic light (with dispersion n depends on the wavelength)', 'Isotrope homogene Medien, monochromatisches Licht (bei Dispersion hängt n von der Wellenlänge ab)')],
    validity: T('n1 sin θ1 / n2 > 1 时无折射光（全反射）', 'No refracted ray when n1 sin θ1 / n2 > 1 (total reflection)', 'Kein gebrochener Strahl, wenn n1 sin θ1 / n2 > 1 (Totalreflexion)'),
    sources: ['S35'],
    inputs: [pos('n1', 'n_1', T('入射侧折射率', 'Index on the incident side', 'Brechzahl der Einfallsseite'), '', 'ratio', 1), pos('n2', 'n_2', T('折射侧折射率', 'Index on the far side', 'Brechzahl der anderen Seite'), '', 'ratio', 1.5), ang('th1', '\\theta_1', T('入射角', 'Angle of incidence', 'Einfallswinkel'), Math.PI / 6)],
    conditions: [cond('refracts', T('有折射光', 'A refracted ray exists', 'Ein gebrochener Strahl existiert'), 'n1*sin(th1)/n2 <= 1')],
    outputs: [out('s2', '\\sin\\theta_2', T('折射角正弦', 'Sine of the refraction angle', 'Sinus des Brechungswinkels'), '', 'n1*sin(th1)/n2', { requires: ['refracts'] }), out('th2', '\\theta_2', T('折射角', 'Angle of refraction', 'Brechungswinkel'), 'rad', 'asin(n1*sin(th1)/n2)', { requires: ['refracts'] }), out('vr', 'v_2/v_1', T('速度比（频率不变）', 'Speed ratio (frequency unchanged)', 'Geschwindigkeitsverhältnis (Frequenz gleich)'), '', 'n1/n2')],
    example: { text: T('空气 n1 = 1 入射玻璃 n2 = 1.5，入射角 30°。', 'From air (n1 = 1) into glass (n2 = 1.5) at 30°.', 'Von Luft (n1 = 1) in Glas (n2 = 1,5) unter 30°.'), answer: T('sinθ2 = 1/3，θ2 = 19.4712°。', 'sin θ2 = 1/3, θ2 = 19.4712°.', 'sin θ2 = 1/3, θ2 = 19,4712°.') },
    point: T('频率跨界面不变，波长和速度改变。', 'The frequency stays the same across the boundary; wavelength and speed change.', 'Die Frequenz bleibt an der Grenze gleich; Wellenlänge und Geschwindigkeit ändern sich.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:O02', 'rust:src/labs/optics.rs snell_and_total_internal_reflection', 'rust:src/labs/optics.rs prism_disperses_white_light'],
    links: { labs: ['rays'] }, review: R2
  },
  {
    id: 'O03', title: T('全反射与光纤', 'Total internal reflection and fibres', 'Totalreflexion und Lichtleiter'),
    stages: ['s'], priority: 'P1', geometry: 'plane',
    assumptions: [T('从折射率 n1 的介质射向 n2 的介质', 'Light goes from index n1 toward index n2', 'Licht geht von Brechzahl n1 zu Brechzahl n2')],
    validity: T('只有 n1 > n2 时存在临界角；光纤模态求解另需波动光学', 'A critical angle exists only for n1 > n2; fibre modes need wave optics', 'Ein Grenzwinkel existiert nur für n1 > n2; Fasermoden brauchen Wellenoptik'),
    sources: ['S35'],
    inputs: [pos('n1', 'n_1', T('入射侧折射率', 'Index on the incident side', 'Brechzahl der Einfallsseite'), '', 'ratio', 1.5), pos('n2', 'n_2', T('另一侧折射率', 'Index on the far side', 'Brechzahl der anderen Seite'), '', 'ratio', 1), ang('th', '\\theta', T('入射角', 'Angle of incidence', 'Einfallswinkel'), (50 * Math.PI) / 180)],
    conditions: [cond('denser', T('从光密到光疏（n1 > n2）', 'From denser to less dense (n1 > n2)', 'Vom dichteren ins dünnere Medium (n1 > n2)'), 'n1 > n2'), cond('transmits', T('有折射光（未发生全反射）', 'A refracted ray exists (no total reflection)', 'Ein gebrochener Strahl existiert (keine Totalreflexion)'), 'n1*sin(th)/n2 <= 1')],
    outputs: [out('thc', '\\theta_c', T('临界角', 'Critical angle', 'Grenzwinkel'), 'rad', 'asin(n2/n1)', { requires: ['denser'] }), out('th2', '\\theta_2', T('折射角', 'Angle of refraction', 'Brechungswinkel'), 'rad', 'asin(n1*sin(th)/n2)', { requires: ['transmits'] })],
    example: { text: T('玻璃 n1 = 1.5 到空气 n2 = 1，求临界角；再以 50° 入射。', 'Glass (n1 = 1.5) to air (n2 = 1): the critical angle; then incidence at 50°.', 'Glas (n1 = 1,5) zu Luft (n2 = 1): der Grenzwinkel; dann Einfall unter 50°.'), answer: T('临界角 41.8103°；从玻璃侧以 50° 入射发生全反射（无折射角）。', 'Critical angle 41.8103°; at 50° from the glass side the light is totally reflected (no refraction angle).', 'Grenzwinkel 41,8103°; unter 50° von der Glasseite wird das Licht total reflektiert (kein Brechungswinkel).') },
    point: T('仅从高折射率到低折射率时有该临界角。', 'Only from a higher to a lower index is there a critical angle.', 'Nur vom höheren zum niedrigeren Brechungsindex gibt es einen Grenzwinkel.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:O03', 'rust:src/labs/optics.rs snell_and_total_internal_reflection'],
    links: { labs: ['rays'] }, review: R2
  },
  {
    id: 'O04', title: T('薄透镜成像', 'Thin-lens imaging', 'Abbildung mit dünnen Linsen'),
    stages: ['j', 's'], priority: 'P1', geometry: 'plane',
    assumptions: [A.paraxial, conv],
    validity: T('物在焦点时像在无穷远（不给出数值）', 'With the object at the focus the image is at infinity (no number is given)', 'Steht der Gegenstand im Brennpunkt, liegt das Bild im Unendlichen (keine Zahl)'),
    sources: ['S77'],
    inputs: [inp('f', 'f', T('焦距（发散为负）', 'Focal length (diverging negative)', 'Brennweite (Zerstreuungslinse negativ)'), 'm', 'length', 0.1), pos('u', 'u', T('物距', 'Object distance', 'Gegenstandsweite'), 'm', 'length', 0.3)],
    conditions: [cond('finite', T('物不在焦点上', 'The object is not at the focus', 'Der Gegenstand steht nicht im Brennpunkt'), 'abs(u - f) > 1e-12*abs(f)')],
    outputs: [out('v', 'v', T('像距（负为虚像）', 'Image distance (negative: virtual)', 'Bildweite (negativ: virtuell)'), 'm', '1/(1/f - 1/u)', { requires: ['finite'] }), out('mag', 'm', T('放大率（负为倒立）', 'Magnification (negative: inverted)', 'Vergrößerung (negativ: umgekehrt)'), '', '-1/(1/f - 1/u)/u', { requires: ['finite'] })],
    example: { text: T('凸透镜 f = 0.1 m，实物距 u = 0.3 m。', 'A converging lens f = 0.1 m, real object at u = 0.3 m.', 'Sammellinse f = 0,1 m, reeller Gegenstand bei u = 0,3 m.'), answer: T('像距 v = 0.15 m，放大率 −0.5，为倒立缩小实像。', 'v = 0.15 m, magnification −0.5: a real, inverted, smaller image.', 'v = 0,15 m, Vergrößerung −0,5: reelles, umgekehrtes, verkleinertes Bild.') },
    point: T('统一符号约定；焦点处像在无穷远，不是数值崩溃。', 'Use one sign convention; at the focus the image is at infinity, not a numerical failure.', 'Eine Vorzeichenregel nutzen; im Brennpunkt liegt das Bild im Unendlichen, kein numerischer Fehler.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:O04', 'rust:src/labs/optics.rs thin_lens_and_mirror_formula'],
    links: { labs: ['lens'] }, review: R2
  },
  {
    id: 'O05', title: T('球面镜成像', 'Spherical mirrors', 'Kugelspiegel'),
    stages: ['j', 's'], priority: 'P1', geometry: 'plane',
    assumptions: [A.paraxial, conv],
    validity: T('近轴；球差超出近轴公式', 'Paraxial; spherical aberration is beyond the paraxial formula', 'Paraxial; die sphärische Aberration geht über die Paraxialformel hinaus'),
    sources: ['S77'],
    inputs: [inp('R', 'R', T('曲率半径（凸面镜为负）', 'Radius of curvature (convex negative)', 'Krümmungsradius (Wölbspiegel negativ)'), 'm', 'length', 0.4), pos('u', 'u', T('物距', 'Object distance', 'Gegenstandsweite'), 'm', 'length', 0.6)],
    lets: [let_('f', 'f', T('焦距', 'Focal length', 'Brennweite'), 'm', 'R/2')],
    conditions: [cond('finite', T('物不在焦点上', 'The object is not at the focus', 'Der Gegenstand steht nicht im Brennpunkt'), 'abs(u - R/2) > 1e-12*abs(R)')],
    outputs: [out('f', 'f', T('焦距', 'Focal length', 'Brennweite'), 'm', 'R/2'), out('v', 'v', T('像距（负为镜后虚像）', 'Image distance (negative: virtual)', 'Bildweite (negativ: virtuell)'), 'm', '1/(1/f - 1/u)', { requires: ['finite'] }), out('mag', 'm', T('放大率', 'Magnification', 'Vergrößerung'), '', '-1/(1/f - 1/u)/u', { requires: ['finite'] })],
    example: { text: T('凹面镜曲率半径 0.4 m，实物距 0.6 m。', 'A concave mirror with R = 0.4 m, real object at 0.6 m.', 'Ein Hohlspiegel mit R = 0,4 m, reeller Gegenstand bei 0,6 m.'), answer: T('f = 0.2 m；v = 0.3 m；放大率 −0.5。', 'f = 0.2 m; v = 0.3 m; magnification −0.5.', 'f = 0,2 m; v = 0,3 m; Vergrößerung −0,5.') },
    point: T('镜面与透镜符号需一致说明；球差超出近轴公式。', 'State the sign rules of mirrors and lenses consistently; spherical aberration is beyond the paraxial formula.', 'Vorzeichenregeln für Spiegel und Linsen einheitlich angeben; sphärische Aberration geht über die Paraxialformel hinaus.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:O05', 'rust:src/labs/optics.rs thin_lens_and_mirror_formula', 'rust:src/labs/optics.rs ideal_lens_focuses_parallel_rays_and_mirror_shows_aberration'],
    links: { labs: ['lens'] }, review: R2
  },
  {
    id: 'O06', title: T('透镜组合与光学仪器', 'Lens combinations and instruments', 'Linsensysteme und optische Instrumente'),
    stages: ['s', 'u'], priority: 'P2', geometry: 'plane',
    assumptions: [A.paraxial, T('两片薄透镜共轴，间距 d（紧贴时 d = 0）', 'Two coaxial thin lenses a distance d apart (d = 0 in contact)', 'Zwei koaxiale dünne Linsen im Abstand d (d = 0 bei Berührung)')],
    validity: T('非零间距不能沿用紧贴式；光阑与视场不在此模型内', 'With a gap the contact formula does not hold; stops and field of view are outside this model', 'Mit Abstand gilt die Kontaktformel nicht; Blenden und Gesichtsfeld sind nicht Teil des Modells'),
    sources: ['S77'],
    inputs: [inp('f1', 'f_1', T('第一片焦距', 'First focal length', 'Erste Brennweite'), 'm', 'length', 0.1), inp('f2', 'f_2', T('第二片焦距', 'Second focal length', 'Zweite Brennweite'), 'm', 'length', 0.2), nonneg('d', 'd', T('间距', 'Separation', 'Abstand'), 'm', 'length', 0)],
    lets: [let_('P', 'P', T('光焦度', 'Optical power', 'Brechkraft'), '1/m', '1/f1 + 1/f2 - d/(f1*f2)')],
    conditions: [cond('focal', T('系统有有限焦距（P ≠ 0）', 'The system has a finite focal length (P ≠ 0)', 'Das System hat eine endliche Brennweite (P ≠ 0)'), 'abs(P) > 1e-12*(1/abs(f1) + 1/abs(f2))')],
    outputs: [out('P', 'P', T('光焦度（屈光度 m⁻¹）', 'Optical power (dioptres m⁻¹)', 'Brechkraft (Dioptrien m⁻¹)'), '1/m', 'P'), out('feq', 'f_{eq}', T('等效焦距', 'Equivalent focal length', 'Äquivalente Brennweite'), 'm', '1/P', { requires: ['focal'] }), out('bfl', 'f_b', T('后焦距（从第二片量）', 'Back focal distance (from the second lens)', 'Hintere Schnittweite (ab der zweiten Linse)'), 'm', '(1 - d/f1)/P', { requires: ['focal'] })],
    example: { text: T('两片紧贴薄凸透镜焦距分别 0.1 m 与 0.2 m。', 'Two thin converging lenses in contact, f = 0.1 m and 0.2 m.', 'Zwei dünne Sammellinsen in Berührung, f = 0,1 m und 0,2 m.'), answer: T('等效焦距 0.0666667 m，屈光度 15 m⁻¹。', 'Equivalent focal length 0.0666667 m, power 15 m⁻¹.', 'Äquivalente Brennweite 0,0666667 m, Brechkraft 15 m⁻¹.') },
    point: T('望远镜、显微镜由组合模型派生；非零间距不能沿用紧贴式。', 'Telescopes and microscopes follow from combinations; with a gap the contact formula fails.', 'Fernrohre und Mikroskope folgen aus Kombinationen; mit Abstand gilt die Kontaktformel nicht.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:O06', 'rust:src/labs/optics.rs ideal_lens_focuses_parallel_rays_and_mirror_shows_aberration'],
    links: { labs: ['lens'] }, review: R2
  },
  {
    id: 'O07', title: T('双缝干涉', 'Double-slit interference', 'Doppelspaltinterferenz'),
    stages: ['s'], priority: 'P1', geometry: 'plane',
    assumptions: [T('相干单色光，远场（屏距 ≫ 缝距），缝宽忽略', 'Coherent monochromatic light, far field (screen far compared with the slit spacing), slit width neglected', 'Kohärentes monochromatisches Licht, Fernfeld (Schirm weit gegen den Spaltabstand), Spaltbreite vernachlässigt')],
    validity: T('Δy = λD/d 是近轴式；大角度用精确几何', 'Δy = λD/d is paraxial; large angles use the exact geometry', 'Δy = λD/d ist paraxial; große Winkel nutzen die exakte Geometrie'),
    sources: ['S36'],
    inputs: [lam(500e-9), pos('D', 'D', T('屏距', 'Screen distance', 'Schirmabstand'), 'm', 'length', 2), pos('d', 'd', T('缝距', 'Slit spacing', 'Spaltabstand'), 'm', 'length', 0.5e-3), nonneg('m', 'm', T('亮纹级次', 'Order of the bright fringe', 'Ordnung des hellen Streifens'), '', 'count', 1)],
    conditions: [cond('paraxial', T('近轴（mλ/d < 0.05）', 'Paraxial (mλ/d < 0.05)', 'Paraxial (mλ/d < 0,05)'), 'max(m, 1)*lam/d < 0.05', 'max(m, 1)*lam/d < 0.2'), cond('exists', T('该级次存在（mλ ≤ d）', 'The order exists (mλ ≤ d)', 'Die Ordnung existiert (mλ ≤ d)'), 'm*lam <= d')],
    outputs: [out('dy', '\\Delta y', T('相邻亮纹间距（近轴）', 'Fringe spacing (paraxial)', 'Streifenabstand (paraxial)'), 'm', 'lam*D/d', { requires: ['paraxial'] }), out('ym', 'y_m', T('第 m 级亮纹位置（远场精确几何）', 'Position of the m-th bright fringe (exact far-field geometry)', 'Lage des m-ten hellen Streifens (exakte Fernfeldgeometrie)'), 'm', 'D*tan(asin(m*lam/d))', { requires: ['exists'] })],
    example: { text: T('λ = 500 nm，屏距 D = 2 m，缝距 d = 0.5 mm，近轴远场。', 'λ = 500 nm, screen at D = 2 m, slit spacing d = 0.5 mm, paraxial far field.', 'λ = 500 nm, Schirm bei D = 2 m, Spaltabstand d = 0,5 mm, paraxiales Fernfeld.'), answer: T('相邻亮纹间距 0.002 m，即 2 mm。', 'Fringe spacing 0.002 m, that is 2 mm.', 'Streifenabstand 0,002 m, also 2 mm.') },
    point: T('相位差决定增强和相消；相干性与有限缝宽有条件。', 'The phase difference decides between reinforcement and cancellation; coherence and slit width impose conditions.', 'Der Phasenunterschied entscheidet über Verstärkung und Auslöschung; Kohärenz und Spaltbreite setzen Bedingungen.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:O07', 'rust:src/labs/waveoptics.rs double_slit_fringes'],
    links: { labs: ['wave-optics'] }, review: R2
  },
  {
    id: 'O08', title: T('单缝衍射与分辨率', 'Single-slit diffraction and resolution', 'Einzelspaltbeugung und Auflösung'),
    stages: ['s', 'u'], priority: 'P1', geometry: 'plane',
    assumptions: [T('Fraunhofer 远场，单色相干光', 'Fraunhofer far field, coherent monochromatic light', 'Fraunhofer-Fernfeld, kohärentes monochromatisches Licht')],
    validity: T('暗纹 a sinθ = mλ（m ≠ 0）；圆孔分辨角系数为 J1 的第一个零点 / π ≈ 1.21967', 'Dark fringes at a sin θ = mλ (m ≠ 0); for a circular aperture the factor is the first zero of J1 / π ≈ 1.21967', 'Dunkelstreifen bei a sin θ = mλ (m ≠ 0); für eine Kreisblende ist der Faktor die erste Nullstelle von J1 / π ≈ 1,21967'),
    sources: ['S78'],
    inputs: [pos('a', 'a', T('缝宽', 'Slit width', 'Spaltbreite'), 'm', 'length', 1e-4), lam(500e-9), pos('D', 'D', T('屏距', 'Screen distance', 'Schirmabstand'), 'm', 'length', 2), pos('m', 'm', T('暗纹级次', 'Order of the dark fringe', 'Ordnung des Dunkelstreifens'), '', 'count', 1), pos('Da', 'D_a', T('圆孔直径', 'Diameter of a circular aperture', 'Durchmesser einer Kreisblende'), 'm', 'length', 1e-3)],
    conditions: [cond('exists', T('该级暗纹存在（mλ ≤ a）', 'This dark fringe exists (mλ ≤ a)', 'Dieser Dunkelstreifen existiert (mλ ≤ a)'), 'm*lam <= a'), cond('central', T('中央亮纹有限宽（λ < a）', 'The central maximum has a finite width (λ < a)', 'Das Hauptmaximum hat eine endliche Breite (λ < a)'), 'lam < a')],
    outputs: [out('s', '\\sin\\theta_m', T('第 m 级暗纹正弦', 'Sine of the m-th dark fringe', 'Sinus des m-ten Dunkelstreifens'), '', 'm*lam/a', { requires: ['exists'] }), out('w', 'w', T('中央亮纹全宽（精确几何）', 'Full width of the central maximum (exact geometry)', 'Volle Breite des Hauptmaximums (exakte Geometrie)'), 'm', '2*D*tan(asin(lam/a))', { requires: ['central'] }), out('thR', '\\theta_R', T('圆孔 Rayleigh 分辨角', 'Rayleigh angle of a circular aperture', 'Rayleigh-Winkel einer Kreisblende'), 'rad', 'asin(1.2196698912665045*lam/Da)')],
    example: { text: T('缝宽 a = 0.1 mm，λ = 500 nm，屏距 2 m。', 'Slit width a = 0.1 mm, λ = 500 nm, screen at 2 m.', 'Spaltbreite a = 0,1 mm, λ = 500 nm, Schirm bei 2 m.'), answer: T('首个暗纹 sinθ = 0.005；近轴中央亮纹全宽约 20 mm。', 'First dark fringe sin θ = 0.005; paraxial central width about 20 mm.', 'Erster Dunkelstreifen sin θ = 0,005; paraxiale Breite des Hauptmaximums etwa 20 mm.') },
    point: T('暗纹公式与中央亮纹宽度不同；圆孔分辨率另有系数。', 'The dark-fringe formula is not the central width; circular apertures have their own factor.', 'Die Dunkelstreifenformel ist nicht die Hauptmaximumsbreite; Kreisblenden haben einen eigenen Faktor.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:O08', 'rust:src/labs/waveoptics.rs single_slit_and_film_and_polarizers'],
    links: { labs: ['wave-optics'] }, review: R2
  },
  {
    id: 'O09', title: T('光栅与有限缝宽包络', 'Gratings and the single-slit envelope', 'Gitter und die Einzelspalt-Einhüllende'),
    stages: ['s', 'u'], priority: 'P1', geometry: 'plane',
    assumptions: [T('多缝远场，正入射，缝宽 a、缝距 d', 'Many slits in the far field, normal incidence, slit width a, spacing d', 'Viele Spalte im Fernfeld, senkrechter Einfall, Spaltbreite a, Abstand d')],
    validity: T('|mλ/d| > 1 时该级不存在；包络零点处缺级', 'No order where |mλ/d| > 1; orders at envelope zeros are missing', 'Keine Ordnung bei |mλ/d| > 1; Ordnungen an Nullstellen der Einhüllenden fehlen'),
    sources: ['S36', 'S78'],
    inputs: [pos('nl', 'n_l', T('每米刻线数', 'Lines per metre', 'Striche pro Meter'), '1/m', 'wavenumber', 5e5), lam(500e-9), inp('m', 'm', T('级次', 'Order', 'Ordnung'), '', 'count', 1), pos('a', 'a', T('缝宽', 'Slit width', 'Spaltbreite'), 'm', 'length', 0.5e-6)],
    conditions: [cond('exists', T('该级存在（|mλ/d| ≤ 1）', 'The order exists (|mλ/d| ≤ 1)', 'Die Ordnung existiert (|mλ/d| ≤ 1)'), 'abs(m*lam*nl) <= 1')],
    outputs: [out('d', 'd', T('光栅常数', 'Grating spacing', 'Gitterkonstante'), 'm', '1/nl'), out('s', '\\sin\\theta', T('主极大正弦', 'Sine of the principal maximum', 'Sinus des Hauptmaximums'), '', 'm*lam*nl', { requires: ['exists'] }), out('th', '\\theta', T('主极大角', 'Angle of the principal maximum', 'Winkel des Hauptmaximums'), 'rad', 'asin(m*lam*nl)', { requires: ['exists'] }), out('mmax', 'm_{\\max}', T('最高级次', 'Highest order', 'Höchste Ordnung'), '', 'floor(1/(lam*nl))'), out('env', 'I_{env}', T('单缝包络（相对）', 'Single-slit envelope (relative)', 'Einzelspalt-Einhüllende (relativ)'), '', 'sinc(pi*a*m*nl)^2', { requires: ['exists'] })],
    example: { text: T('光栅每毫米 500 条，λ = 500 nm，求一级主极大（缝宽 0.5 μm）。', 'A grating with 500 lines per mm, λ = 500 nm: the first-order maximum (slit width 0.5 μm).', 'Ein Gitter mit 500 Strichen pro mm, λ = 500 nm: das Maximum erster Ordnung (Spaltbreite 0,5 μm).'), answer: T('d = 2 μm；sinθ = 0.25，θ = 14.4775°。', 'd = 2 μm; sin θ = 0.25, θ = 14.4775°.', 'd = 2 μm; sin θ = 0,25, θ = 14,4775°.') },
    point: T('多缝干涉峰叠加单缝包络；阶次有几何上限。', 'Multi-slit peaks sit under the single-slit envelope; the order has a geometric upper bound.', 'Die Mehrspaltmaxima liegen unter der Einzelspalt-Einhüllenden; die Ordnung hat eine geometrische Obergrenze.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:O09', 'test:sim2656 O09 grating'],
    links: { labs: ['wave-optics'] }, review: R2
  },
  {
    id: 'O10', title: T('薄膜干涉', 'Thin-film interference', 'Interferenz an dünnen Schichten'),
    stages: ['s', 'u'], priority: 'P1', geometry: 'line1d',
    assumptions: [T('正入射，无吸收；上方介质 n1、膜 n、下方介质 n2', 'Normal incidence, no absorption; medium n1 above, film n, medium n2 below', 'Senkrechter Einfall, keine Absorption; Medium n1 oben, Schicht n, Medium n2 unten')],
    validity: T('相位反转次数由两界面决定：一次反转时 2nt = (m + ½)λ 增强，零或两次时 2nt = (m + 1)λ；多层膜需传输矩阵', 'The number of phase reversals depends on both interfaces: one reversal gives reinforcement at 2nt = (m + ½)λ, none or two at 2nt = (m + 1)λ; multilayers need transfer matrices', 'Die Zahl der Phasensprünge hängt von beiden Grenzflächen ab: ein Sprung verstärkt bei 2nt = (m + ½)λ, keiner oder zwei bei 2nt = (m + 1)λ; Mehrschichten brauchen Transfermatrizen'),
    sources: ['S36', 'S35'],
    inputs: [pos('n', 'n', T('膜折射率', 'Index of the film', 'Brechzahl der Schicht'), '', 'ratio', 1.5), pos('n1', 'n_1', T('上方介质折射率', 'Index above', 'Brechzahl oben'), '', 'ratio', 1), pos('n2', 'n_2', T('下方介质折射率', 'Index below', 'Brechzahl unten'), '', 'ratio', 1), lam(600e-9), nonneg('m', 'm', T('序号（0 为最薄）', 'Index (0 is the thinnest)', 'Index (0 ist die dünnste)'), '', 'count', 0)],
    lets: [let_('p', 'p', T('相位反转次数', 'Number of phase reversals', 'Zahl der Phasensprünge'), '', '2 - step(n1 - n) - step(n - n2)')],
    conditions: [cond('one', T('一次相位反转', 'One phase reversal', 'Ein Phasensprung'), 'abs(p - 1) < 0.5'), cond('even', T('零或两次相位反转', 'No or two phase reversals', 'Kein oder zwei Phasensprünge'), 'abs(p - 1) >= 0.5')],
    outputs: [out('t', 't', T('反射增强厚度', 'Thickness for reflection maximum', 'Dicke für Reflexionsmaximum'), 'm', '(m + 0.5)*lam/(2*n)', { when: 'one', branch: T('一次反转：2nt = (m + ½)λ', 'One reversal: 2nt = (m + ½)λ', 'Ein Sprung: 2nt = (m + ½)λ') }), out('t', 't', T('反射增强厚度', 'Thickness for reflection maximum', 'Dicke für Reflexionsmaximum'), 'm', '(m + 1)*lam/(2*n)', { when: 'even', branch: T('零或两次反转：2nt = (m + 1)λ', 'None or two: 2nt = (m + 1)λ', 'Keiner oder zwei: 2nt = (m + 1)λ') })],
    example: { text: T('空气中的薄膜 n = 1.5，正入射 λ = 600 nm，一次反射有 π 相变。', 'A film n = 1.5 in air, normal incidence λ = 600 nm; one reflection has a π phase change.', 'Eine Schicht n = 1,5 in Luft, senkrechter Einfall λ = 600 nm; eine Reflexion hat einen Phasensprung π.'), answer: T('最薄非零反射增强厚度取 m = 0，t = 100 nm。', 'The thinnest reinforcing thickness (m = 0) is t = 100 nm.', 'Die dünnste verstärkende Dicke (m = 0) ist t = 100 nm.') },
    point: T('条件由两界面相位反转决定，不能固定套同一奇偶规则。', 'The condition depends on the phase reversals at both interfaces; there is no fixed odd/even rule.', 'Die Bedingung hängt von den Phasensprüngen an beiden Grenzflächen ab; es gibt keine feste Regel.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:O10', 'rust:src/labs/waveoptics.rs single_slit_and_film_and_polarizers'],
    links: { labs: ['wave-optics'] }, review: R2
  },
  {
    id: 'O11', title: T('迈克耳孙干涉仪', 'Michelson interferometer', 'Michelson-Interferometer'),
    stages: ['s', 'u'], priority: 'P2', geometry: 'plane',
    assumptions: [T('单色光，镜面平移或气室折射率变化，正入射', 'Monochromatic light, a mirror moves or the index in a gas cell changes, normal incidence', 'Monochromatisches Licht, ein Spiegel verschoben oder die Brechzahl in einer Gaszelle geändert, senkrechter Einfall')],
    validity: T('往返光程是镜面位移的两倍；条纹计数与方向需一致', 'The round trip doubles the mirror displacement; fringe count and direction must agree', 'Der Hin- und Rückweg verdoppelt die Spiegelverschiebung; Streifenzahl und Richtung müssen übereinstimmen'),
    sources: ['S36'],
    inputs: [lam(632.8e-9), nonneg('N', 'N', T('条纹变化数', 'Number of fringes passing', 'Anzahl durchlaufender Streifen'), '', 'count', 100), pos('Lc', 'L_c', T('气室长度', 'Length of the gas cell', 'Länge der Gaszelle'), 'm', 'length', 0.05)],
    outputs: [out('dx', '\\Delta x', T('镜面位移（镜面分支）', 'Mirror displacement (mirror branch)', 'Spiegelverschiebung (Spiegelzweig)'), 'm', 'N*lam/2'), out('dn', '\\Delta n', T('气室折射率变化（气室分支）', 'Change of index in the cell (cell branch)', 'Brechzahländerung in der Zelle (Zellenzweig)'), '', 'N*lam/(2*Lc)')],
    example: { text: T('激光 λ = 632.8 nm，镜面移动使条纹变化 100 条。', 'Laser λ = 632.8 nm; moving the mirror passes 100 fringes.', 'Laser λ = 632,8 nm; die Spiegelverschiebung lässt 100 Streifen durchlaufen.'), answer: T('镜面位移 Δx = 31.64 μm。', 'Mirror displacement Δx = 31.64 μm.', 'Spiegelverschiebung Δx = 31,64 μm.') },
    point: T('往返光程是镜面位移的两倍。', 'The optical path changes by twice the mirror displacement.', 'Der optische Weg ändert sich um das Doppelte der Spiegelverschiebung.'),
    status: 'verified', level: 1, teaching: 1, references: ['otherMethod'], benchmarks: ['oracle:O11'],
    links: {}, review: R2
  },
  {
    id: 'O12', title: T('偏振与马吕斯定律', 'Polarization and Malus’s law', 'Polarisation und Gesetz von Malus'),
    stages: ['s'], priority: 'P1', geometry: 'line1d',
    assumptions: [T('理想偏振片', 'Ideal polarizers', 'Ideale Polarisatoren')],
    validity: T('先确定入射偏振状态：线偏振直接用 cos²θ，非偏振光经第一片先减半', 'Know the incident polarization first: linear light uses cos²θ directly, unpolarized light is halved by the first polarizer', 'Zuerst den Polarisationszustand klären: linear polarisiertes Licht nutzt cos²θ direkt, unpolarisiertes wird vom ersten Polarisator halbiert'),
    sources: ['S35'],
    inputs: [nonneg('I0', 'I_0', T('入射光强', 'Incident intensity', 'Einfallende Intensität'), 'W/m²', 'intensity', 100), ang('th', '\\theta', T('检偏器与偏振方向夹角', 'Angle between analyser and polarization', 'Winkel zwischen Analysator und Polarisation'), Math.PI / 3)],
    outputs: [out('I1', 'I', T('线偏振入射时的透射光强', 'Transmitted intensity, linearly polarized input', 'Durchgelassene Intensität bei linear polarisiertem Licht'), 'W/m²', 'I0*cos(th)^2'), out('I2', "I'", T('非偏振入射经起偏器与检偏器后', 'Unpolarized input through polarizer and analyser', 'Unpolarisiertes Licht durch Polarisator und Analysator'), 'W/m²', 'I0/2*cos(th)^2')],
    example: { text: T('已线偏振光强 100 W/m²，检偏器与偏振方向夹角 60°。', 'Linearly polarized light of 100 W/m², analyser at 60° to the polarization.', 'Linear polarisiertes Licht mit 100 W/m², Analysator unter 60° zur Polarisation.'), answer: T('输出 25 W/m²；若输入为非偏振光，第一片理想偏振片先减半（12.5 W/m²）。', '25 W/m²; with unpolarized input the first ideal polarizer halves it first (12.5 W/m²).', '25 W/m²; bei unpolarisiertem Licht halbiert der erste Polarisator zuerst (12,5 W/m²).') },
    point: T('先确定入射偏振状态；光强不是电场振幅。', 'Know the incident polarization first; intensity is not the field amplitude.', 'Zuerst die Polarisation klären; Intensität ist nicht die Feldamplitude.'),
    status: 'verified', level: 2, teaching: 1, references: ['analytic', 'otherMethod'], benchmarks: ['oracle:O12', 'rust:src/labs/waveoptics.rs single_slit_and_film_and_polarizers'],
    links: { labs: ['wave-optics'] }, review: R2
  },
  {
    id: 'O13', title: T('ABCD 矩阵与近轴光学', 'ABCD matrices and paraxial optics', 'ABCD-Matrizen und paraxiale Optik'),
    stages: ['u'], priority: 'P2', geometry: 'plane',
    assumptions: [A.paraxial, T('光线 (y, θ) 先过薄透镜 f，再自由传播 d', 'A ray (y, θ) passes a thin lens f, then travels a distance d', 'Ein Strahl (y, θ) durchläuft eine dünne Linse f und dann eine Strecke d')],
    validity: T('一阶近轴矩阵不含像差；明显离轴时需更高保真度', 'First-order matrices contain no aberrations; clearly off-axis rays need higher fidelity', 'Matrizen erster Ordnung enthalten keine Aberrationen; deutlich achsferne Strahlen brauchen mehr Genauigkeit'),
    sources: ['S77'],
    inputs: [inp('f', 'f', T('焦距', 'Focal length', 'Brennweite'), 'm', 'length', 0.1), inp('y', 'y', T('入射高度', 'Ray height', 'Strahlhöhe'), 'm', 'length', 1e-3), inp('th', '\\theta', T('入射角', 'Ray angle', 'Strahlwinkel'), 'rad', 'angle', 0), nonneg('d', 'd', T('透镜后传播距离', 'Distance after the lens', 'Strecke nach der Linse'), 'm', 'length', 0.1)],
    conditions: [cond('paraxial', T('近轴（|θ|、|y/f| < 0.05）', 'Paraxial (|θ|, |y/f| < 0.05)', 'Paraxial (|θ|, |y/f| < 0,05)'), 'abs(th) < 0.05 && abs(y/f) < 0.05', 'abs(th) < 0.2 && abs(y/f) < 0.2')],
    outputs: [out('th2', "\\theta'", T('出射角', 'Angle after the lens', 'Winkel nach der Linse'), 'rad', 'th - y/f', { requires: ['paraxial'] }), out('y2', "y'", T('传播 d 后的高度', 'Height after the distance d', 'Höhe nach der Strecke d'), 'm', 'y + d*(th - y/f)', { requires: ['paraxial'] })],
    example: { text: T('薄透镜 f = 0.1 m，入射近轴光线 y = 1 mm，θ = 0。', 'Thin lens f = 0.1 m, paraxial ray y = 1 mm, θ = 0.', 'Dünne Linse f = 0,1 m, paraxialer Strahl y = 1 mm, θ = 0.'), answer: T('出射 θ′ = −0.01 rad；再传播 0.1 m 时 y = 0。', 'θ′ = −0.01 rad; after another 0.1 m, y = 0.', 'θ′ = −0,01 rad; nach weiteren 0,1 m ist y = 0.') },
    point: T('矩阵按传播顺序相乘；像差不在一阶近轴矩阵中。', 'Multiply the matrices in the order of travel; aberrations are not in first-order matrices.', 'Matrizen in Laufrichtung multiplizieren; Aberrationen fehlen in Matrizen erster Ordnung.'),
    status: 'verified', level: 1, teaching: 1, references: ['otherMethod'], benchmarks: ['oracle:O13', 'rust:src/labs/optics.rs ideal_lens_focuses_parallel_rays_and_mirror_shows_aberration'],
    links: { labs: ['rays'] }, review: R2
  },
  {
    id: 'O14', title: T('菲涅耳衍射与波前传播', 'Fresnel diffraction and wavefront propagation', 'Fresnel-Beugung und Wellenausbreitung'),
    stages: ['u', 'g'], priority: 'P3', geometry: 'plane',
    assumptions: [T('孔径特征半宽 a，观察距离 z，单色光', 'Aperture half-width a, distance z, monochromatic light', 'Halbe Blendenbreite a, Abstand z, monochromatisches Licht')],
    validity: T('受限解析：只判断近场与远场范围（NF ≪ 1 为远场）；传播积分与角谱法暂缓', 'Restricted analytic: only the near/far-field range (NF ≪ 1 is far field); propagation integrals and the angular spectrum are deferred', 'Eingeschränkt analytisch: nur Nah- oder Fernfeldbereich (NF ≪ 1 ist Fernfeld); Ausbreitungsintegrale und Winkelspektrum zurückgestellt'),
    restricted: T('Fresnel 数与区域判定；波前传播计算暂缓', 'Fresnel number and the choice of regime; wavefront propagation deferred', 'Fresnel-Zahl und Bereichswahl; Wellenausbreitung zurückgestellt'),
    sources: ['S78', 'S52', 'S53'],
    inputs: [pos('a', 'a', T('孔径半宽', 'Aperture half-width', 'Halbe Blendenbreite'), 'm', 'length', 0.5e-3), lam(500e-9), pos('z', 'z', T('传播距离', 'Propagation distance', 'Ausbreitungsstrecke'), 'm', 'length', 0.1)],
    conditions: [cond('far', T('远场（NF < 0.1）', 'Far field (NF < 0.1)', 'Fernfeld (NF < 0,1)'), 'a^2/(lam*z) < 0.1', 'a^2/(lam*z) < 1')],
    outputs: [out('NF', 'N_F', T('Fresnel 数', 'Fresnel number', 'Fresnel-Zahl'), '', 'a^2/(lam*z)'), out('zF', 'z_F', T('远场所需距离（NF = 0.1）', 'Distance for the far field (NF = 0.1)', 'Abstand für das Fernfeld (NF = 0,1)'), 'm', 'a^2/(0.1*lam)')],
    example: { text: T('孔的特征半宽 a = 0.5 mm，λ = 500 nm，z = 0.1 m。', 'Aperture half-width a = 0.5 mm, λ = 500 nm, z = 0.1 m.', 'Halbe Blendenbreite a = 0,5 mm, λ = 500 nm, z = 0,1 m.'), answer: T('Fresnel 数 NF = 5，不能默认使用远场 Fraunhofer 图样。', 'Fresnel number NF = 5: the far-field Fraunhofer pattern cannot be assumed.', 'Fresnel-Zahl NF = 5: das Fraunhofer-Fernfeldmuster darf nicht angenommen werden.') },
    point: T('近场与远场是近似范围，不是不同光学定律。', 'Near and far field are ranges of approximation, not different laws.', 'Nah- und Fernfeld sind Näherungsbereiche, keine verschiedenen Gesetze.'),
    status: 'verified', level: 1, teaching: 0, references: ['analytic'], benchmarks: ['oracle:O14'],
    links: {}, review: R2
  }
]
