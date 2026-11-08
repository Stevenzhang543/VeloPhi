/**
 * The 30 initial acceptance cases of the curriculum blueprint (数值与教学验收) → VeloPhi's automatic evidence
 * (26.62, D222). Each entry names the test files (and test titles) that check the criterion; the A01–A30 cases of
 * tests/curriculum/acceptance2662.test.ts check every row directly against the engine, the model registry or the
 * curriculum data, and tests/curriculum2662.test.ts requires that every named file and title exists.
 */
import type { Tri } from '../i18n/tri'
import { T } from '../content/models/types'

export interface AcceptanceEvidence { tests: string[]; note: Tri }

const A = (n: number) => `tests/curriculum/acceptance2662.test.ts › A${String(n).padStart(2, '0')}`

export const ACCEPTANCE: AcceptanceEvidence[] = [
  { tests: [A(1), 'tests/dims2656.test.ts › adding a voltage to an acceleration is a dimension error'], note: T('核心拒绝量纲不一致的表达式', 'The core refuses dimensionally inconsistent expressions', 'Der Kern lehnt dimensionsfalsche Ausdrücke ab') },
  { tests: [A(2), 'tests/acceptance.test.ts › 5 projectile'], note: T('自由落体模板的轨迹与 ½gt² 比较', 'The free-fall template against ½gt²', 'Die Vorlage freier Fall gegen ½gt²') },
  { tests: [A(3)], note: T('恒力拉动的物块 a = F/m', 'A block pulled by a constant force: a = F/m', 'Ein Klotz unter konstanter Kraft: a = F/m') },
  { tests: [A(4)], note: T('杠杆模型族：∑τ = 0 与支点力', 'Lever family: ∑τ = 0 and the pivot force', 'Hebel: ∑τ = 0 und die Lagerkraft') },
  { tests: [A(5), 'tests/acceptance.test.ts › μ = 0.7 > tanθ stays at rest with f = mg sinθ'], note: T('临界角两侧各算一次（课堂实验同此）', 'One run on each side of the critical angle (as in the classroom experiment)', 'Je ein Lauf beidseits des Grenzwinkels (wie im Unterrichtsversuch)') },
  { tests: [A(6)], note: T('浮力模型族：完全浸入 F = ρgV', 'Buoyancy family: fully immersed F = ρgV', 'Auftrieb: ganz eingetaucht F = ρgV') },
  { tests: [A(7), 'tests/determinism.test.ts › fixed-step integrators are deterministic too and close to the adaptive result'], note: T('单摆能量漂移随步长减小而减小', 'The pendulum’s energy drift shrinks with the step', 'Die Energiedrift des Pendels sinkt mit der Schrittweite') },
  { tests: [A(8), 'tests/acceptance.test.ts › 4 collisions'], note: T('一维碰撞前后总动量', 'Total momentum before and after a 1D collision', 'Gesamtimpuls vor und nach einem 1D-Stoß') },
  { tests: [A(9)], note: T('小角条件不满足时 T₀ 被扣留并给出精确周期', 'Outside the small-angle condition T₀ is withheld and the exact period given', 'Außerhalb der Kleinwinkelbedingung wird T₀ zurückgehalten, die exakte Periode angegeben') },
  { tests: [A(10)], note: T('斯涅耳定律与全反射条件', 'Snell’s law and the total-reflection condition', 'Brechungsgesetz und Bedingung der Totalreflexion') },
  { tests: [A(11)], note: T('实正虚负的符号约定（像距、放大率）', 'Real-positive sign convention (image distance, magnification)', 'Vorzeichen reell-positiv (Bildweite, Abbildungsmaßstab)') },
  { tests: [A(12)], note: T('v = fλ；固定端反射系数为负', 'v = fλ; the reflection coefficient at a heavier string is negative', 'v = fλ; Reflexion am schwereren Seil mit negativem Faktor') },
  { tests: [A(13)], note: T('近轴条件不满足时 Δx = λD/d 不作答', 'Outside the paraxial condition Δx = λD/d is not given', 'Außerhalb der paraxialen Bedingung wird Δx = λD/d nicht angegeben') },
  { tests: [A(14)], note: T('pV = nRT 与 ΔU = Q − W 的符号约定', 'pV = nRT and the sign convention of ΔU = Q − W', 'pV = nRT und das Vorzeichen von ΔU = Q − W') },
  { tests: [A(15)], note: T('绝热混合：放热等于吸热', 'Adiabatic mixing: heat given equals heat taken', 'Adiabatische Mischung: abgegebene gleich aufgenommene Wärme') },
  { tests: [A(16)], note: T('电桥：节点电流与回路电压残差', 'Bridge: residuals of node currents and loop voltages', 'Brücke: Reste der Knotenströme und Maschenspannungen') },
  { tests: [A(17), 'tests/teaching/lessons2661.test.ts'], note: T('τ = RC 与指数曲线', 'τ = RC and the exponential curve', 'τ = RC und die Exponentialkurve') },
  { tests: [A(18)], note: T('E ∝ 1/r²；场点在电荷上时不作答', 'E ∝ 1/r²; no answer at the charge itself', 'E ∝ 1/r²; keine Antwort an der Ladung selbst') },
  { tests: [A(19)], note: T('磁通增加时电动势为负（楞次定律）', 'The emf is negative while the flux grows (Lenz’s law)', 'Die Induktionsspannung ist negativ, solange der Fluss wächst (Lenz)') },
  { tests: [A(20)], note: T('衰变期望与二项/泊松方差', 'Decay expectation and binomial/Poisson variance', 'Zerfallserwartung und Binomial-/Poisson-Varianz') },
  { tests: [A(21)], note: T('能级比 1 : 4 : 9', 'Level ratios 1 : 4 : 9', 'Niveauverhältnis 1 : 4 : 9') },
  { tests: [A(22), 'tests/research2661.test.ts › agrees with the independent reference at three resolutions; the box size matters below 32 nm'], note: T('Q08 波包：三种网格与独立参考比较', 'Q08 wave packet: three grids against an independent reference', 'Q08-Wellenpaket: drei Gitter gegen eine unabhängige Referenz') },
  { tests: [A(23)], note: T('T²/r³ 对所有半径相同', 'T²/r³ is the same for every radius', 'T²/r³ ist für jeden Radius gleich') },
  { tests: [A(24)], note: T('收敛阶：Euler 1、RK4 4', 'Convergence order: Euler 1, RK4 4', 'Konvergenzordnung: Euler 1, RK4 4') },
  { tests: [A(25)], note: T('二倍细化的有限差分误差（X01 与 G07）', 'Finite-difference error under halving (X01 and G07)', 'Fehler der finiten Differenzen beim Halbieren (X01 und G07)') },
  { tests: [A(26)], note: T('同一知识点在不同课程体系下打开同样的资源', 'A topic opens the same resources in every course system', 'Ein Thema öffnet in jedem Lehrplan dieselben Ressourcen') },
  { tests: [A(27), 'tests/determinism.test.ts › exactStateAt at a frame time returns the frame; between frames it is repeatable'], note: T('同一场景两次运行指纹相同', 'Two runs of the same scene have the same fingerprint', 'Zwei Läufe derselben Szene haben denselben Fingerabdruck') },
  { tests: [A(28), 'tests/streaming.test.ts › memory stays within a small budget on a long run'], note: T('固定物理步长与渲染帧率无关；长时间不发散', 'A fixed physics step independent of the frame rate; no divergence on long runs', 'Fester Physikschritt unabhängig von der Bildrate; keine Divergenz bei langen Läufen') },
  { tests: [A(29)], note: T('活动可全键盘完成；色弱配色与形状/文字双重提示', 'Activities can be done with the keyboard; colour-vision palette with shape/text cues', 'Aktivitäten mit der Tastatur; Farbsehschwäche-Palette mit Form-/Textmerkmalen') },
  { tests: [A(30)], note: T('玻尔模型标注为模型，量子实验不画电子轨道', 'The Bohr model is labelled a model; the quantum lab draws no electron orbits', 'Das Bohr-Modell ist als Modell gekennzeichnet; der Quantenversuch zeichnet keine Bahnen') }
]
