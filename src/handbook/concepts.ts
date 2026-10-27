/**
 * Concept pages of the learning handbook (26.55, roadmap group E): subjects taught without a simulation — energy
 * and sustainable development, solids and liquids, the mathematical tools of physics, and a first look at quantum
 * field theory. Each page has sections of trilingual paragraphs and key relations (KaTeX), and links to the
 * templates and experiments that touch the subject.
 */
import type { Tri } from '../i18n/tri'

const tri = (zh: string, en: string, de: string): Tri => ({ zh, en, de })

export interface ConceptSection { heading: Tri; paragraphs: Tri[]; laws?: string[] }
export interface Concept {
  id: string
  icon: string
  title: Tri
  sections: ConceptSection[]
  /** Templates and experiments to try (template ids, or `lab:<id>`). */
  see: string[]
}

export const CONCEPTS: Concept[] = [
  {
    id: 'energy', icon: 'gauge',
    title: tri('能源与可持续发展', 'Energy resources and sustainability', 'Energieversorgung und Nachhaltigkeit'),
    sections: [
      {
        heading: tri('能量的转化与守恒', 'Conversion and conservation of energy', 'Umwandlung und Erhaltung der Energie'),
        paragraphs: [
          tri('能量有机械能、内能、电能、化学能、光能、核能等多种形式，它们可以相互转化，也可以在物体之间转移，但总量保持不变（能量守恒定律）。VeloPhi 的“能量账本”逐项记下动能、势能、摩擦生热、阻尼耗散、碰撞损失、外力做功、焦耳热与浮力做功，任何时刻账本的合计都等于开始时的总能量。',
            'Energy takes many forms — mechanical, internal, electrical, chemical, light, nuclear — that turn into each other and pass between bodies while the total stays the same (conservation of energy). VeloPhi’s energy ledger books kinetic and potential energy, friction heat, damping, impact losses, the work of applied forces, Joule heat and the work of buoyancy; at every instant its total equals the energy at the start.',
            'Energie tritt in vielen Formen auf — mechanisch, innere Energie, elektrisch, chemisch, Licht, Kernenergie —, die sich ineinander umwandeln und zwischen Körpern übertragen werden, während die Summe gleich bleibt (Energieerhaltung). Das Energiekonto von VeloPhi bucht kinetische und potentielle Energie, Reibungswärme, Dämpfung, Stoßverluste, die Arbeit äußerer Kräfte, Joulesche Wärme und die Arbeit des Auftriebs; seine Summe ist jederzeit gleich der Anfangsenergie.'),
          tri('能量虽然守恒，但转化有方向：机械能可以全部变成内能，内能却不能全部变回机械能。热机的效率总小于 1，可利用的能量在转化中逐渐“品质下降”（热力学第二定律）。所以要节约能源、提高效率。',
            'Although energy is conserved, conversions have a direction: mechanical energy can all become internal energy, but internal energy cannot all be turned back into work. A heat engine’s efficiency is always below 1, and usable energy degrades as it is converted (second law of thermodynamics) — which is why saving energy and raising efficiency matter.',
            'Obwohl Energie erhalten bleibt, haben Umwandlungen eine Richtung: Mechanische Energie kann vollständig zu innerer Energie werden, innere Energie aber nicht vollständig zurück in Arbeit. Der Wirkungsgrad einer Wärmekraftmaschine ist stets kleiner als 1, nutzbare Energie wird bei der Umwandlung entwertet (zweiter Hauptsatz) — deshalb sind Energiesparen und hohe Wirkungsgrade wichtig.')
        ],
        laws: ['E_k + E_p + Q + \\Delta E_{coll} - W = E_0', '\\eta = \\dfrac{W_{useful}}{W_{total}} < 1', '\\eta_{Carnot} = 1 - \\dfrac{T_2}{T_1}']
      },
      {
        heading: tri('能源的分类', 'Kinds of energy resources', 'Arten von Energiequellen'),
        paragraphs: [
          tri('一次能源直接取自自然界（煤、石油、天然气、风能、水能、太阳能、核燃料），二次能源由一次能源转化而来（电能、汽油、氢）。化石能源和核燃料用一点少一点，是不可再生能源；太阳能、风能、水能、生物质能可以不断得到补充，是可再生能源。',
            'Primary resources are taken directly from nature (coal, oil, gas, wind, water, sunlight, nuclear fuel); secondary ones are made from them (electricity, petrol, hydrogen). Fossil fuels and nuclear fuel are used up — non-renewable; solar, wind, hydro and biomass are replenished — renewable.',
            'Primärenergie stammt direkt aus der Natur (Kohle, Öl, Gas, Wind, Wasser, Sonne, Kernbrennstoff), Sekundärenergie wird daraus gewonnen (Strom, Benzin, Wasserstoff). Fossile Brennstoffe und Kernbrennstoff werden verbraucht — nicht erneuerbar; Sonne, Wind, Wasser und Biomasse erneuern sich — erneuerbar.'),
          tri('发电站把其他形式的能转化为电能：火电站经历化学能 → 内能 → 机械能 → 电能，每一步都有损失；水电站把水的重力势能变成电能；风电和光伏直接利用风和光。远距离输电用高压减小线路上的焦耳热（P损 = I²R，P 一定时 I = P/U）。',
            'Power stations turn other forms into electrical energy: a thermal plant goes chemical → internal → mechanical → electrical, losing some at each step; a hydro plant converts the potential energy of water; wind and solar use wind and light directly. Long-distance transmission uses high voltage to cut the Joule heat in the lines (P_loss = I²R with I = P/U for a given power).',
            'Kraftwerke wandeln andere Formen in elektrische Energie: Ein Wärmekraftwerk geht chemisch → innere Energie → mechanisch → elektrisch, mit Verlusten bei jedem Schritt; ein Wasserkraftwerk nutzt die Lageenergie des Wassers; Wind und Photovoltaik nutzen Wind und Licht direkt. Fernübertragung nutzt Hochspannung, um die Joulesche Wärme in den Leitungen zu senken (P_Verlust = I²R mit I = P/U bei fester Leistung).')
        ],
        laws: ['P_{loss} = I^2R = \\left(\\dfrac{P}{U}\\right)^2 R']
      },
      {
        heading: tri('可持续发展', 'Sustainable development', 'Nachhaltige Entwicklung'),
        paragraphs: [
          tri('燃烧化石燃料排放二氧化碳，加剧温室效应。可持续发展要求提高能源利用效率、发展可再生能源与储能、减少污染，在满足当代人需要的同时不损害后代的发展。',
            'Burning fossil fuels emits carbon dioxide and strengthens the greenhouse effect. Sustainable development means using energy more efficiently, expanding renewables and storage and cutting pollution — meeting today’s needs without harming those of future generations.',
            'Das Verbrennen fossiler Brennstoffe setzt Kohlendioxid frei und verstärkt den Treibhauseffekt. Nachhaltige Entwicklung heißt: Energie effizienter nutzen, erneuerbare Energien und Speicher ausbauen, Schadstoffe verringern — die heutigen Bedürfnisse decken, ohne künftigen Generationen zu schaden.')
        ]
      }
    ],
    see: ['incline-efficiency', 'rail-force', 'lab:circuit', 'lab:gas']
  },
  {
    id: 'solids', icon: 'layers',
    title: tri('固体与液体', 'Solids and liquids', 'Festkörper und Flüssigkeiten'),
    sections: [
      {
        heading: tri('晶体与非晶体', 'Crystals and amorphous solids', 'Kristalle und amorphe Festkörper'),
        paragraphs: [
          tri('晶体（食盐、石英、金属）中的微粒按一定规则在空间排成点阵，有确定的熔点，单晶体的某些物理性质（导热、导电、光学性质）与方向有关（各向异性）。非晶体（玻璃、松香、沥青）的微粒排列没有长程规则，没有确定的熔点，各向同性。“熔化与沸腾”实验中晶体的加热曲线有熔点平台，非晶体没有。',
            'In a crystal (salt, quartz, metals) the particles form a regular lattice; it has a definite melting point, and a single crystal’s properties (heat and electrical conduction, optics) can depend on direction (anisotropy). In an amorphous solid (glass, rosin, pitch) there is no long-range order, no definite melting point, and the properties are the same in all directions. In the "Melting and boiling" experiment the heating curve of a crystal has a melting plateau; an amorphous solid has none.',
            'In einem Kristall (Salz, Quarz, Metalle) bilden die Teilchen ein regelmäßiges Gitter; er hat einen festen Schmelzpunkt, und die Eigenschaften eines Einkristalls (Wärme- und Stromleitung, Optik) können von der Richtung abhängen (Anisotropie). In einem amorphen Festkörper (Glas, Kolophonium, Pech) gibt es keine Fernordnung, keinen festen Schmelzpunkt, und die Eigenschaften sind richtungsunabhängig. Im Versuch „Schmelzen und Sieden“ hat die Heizkurve eines Kristalls ein Schmelzplateau, die eines amorphen Stoffes nicht.')
        ]
      },
      {
        heading: tri('液体的表面张力', 'Surface tension', 'Oberflächenspannung'),
        paragraphs: [
          tri('液体表面层的分子比内部稀疏，分子间表现为引力，使液面像张紧的薄膜一样有收缩的趋势：表面张力 F = σL，σ 是表面张力系数。小水滴、肥皂泡呈球形，小昆虫能停在水面上，都是表面张力的作用。',
            'Molecules in the surface layer of a liquid are farther apart than inside, so they attract each other and the surface tends to contract like a stretched membrane: the surface tension force is F = σL with the coefficient σ. Small drops and soap bubbles are round and small insects can stand on water because of it.',
            'Moleküle in der Oberflächenschicht einer Flüssigkeit sind weiter voneinander entfernt als im Inneren; sie ziehen sich an, und die Oberfläche will sich wie eine gespannte Haut zusammenziehen: Die Oberflächenkraft ist F = σ·L mit dem Koeffizienten σ. Kleine Tropfen und Seifenblasen sind kugelförmig, und kleine Insekten können auf Wasser stehen.')
        ],
        laws: ['F = \\sigma L']
      },
      {
        heading: tri('浸润与毛细现象', 'Wetting and capillarity', 'Benetzung und Kapillarität'),
        paragraphs: [
          tri('液体与固体接触时，若附着层的分子受固体吸引较强，液体沿器壁扩展（浸润，如水和玻璃）；否则收缩（不浸润，如水银和玻璃）。细管中浸润液体上升、不浸润液体下降，高度 h = 2σcosθ/(ρgr)，管越细，现象越明显。液晶既能流动又有晶体的光学各向异性，用于显示器。',
            'Where a liquid touches a solid, it spreads along the wall if the solid attracts the liquid strongly (wetting, water on glass) and draws back otherwise (non-wetting, mercury on glass). In a narrow tube a wetting liquid rises and a non-wetting one falls, by h = 2σcosθ/(ρgr): the thinner the tube, the larger the effect. Liquid crystals flow like liquids but have the optical anisotropy of crystals — the basis of displays.',
            'Berührt eine Flüssigkeit einen Festkörper, breitet sie sich an der Wand aus, wenn der Festkörper sie stark anzieht (Benetzung, Wasser an Glas), sonst zieht sie sich zurück (keine Benetzung, Quecksilber an Glas). In einem engen Rohr steigt eine benetzende Flüssigkeit, eine nicht benetzende sinkt, um h = 2σ·cosθ/(ρ·g·r): je enger das Rohr, desto stärker. Flüssigkristalle fließen wie Flüssigkeiten, haben aber die optische Anisotropie von Kristallen — die Grundlage von Displays.')
        ],
        laws: ['h = \\dfrac{2\\sigma\\cos\\theta}{\\rho g r}']
      }
    ],
    see: ['lab:heating', 'floating-block', 'densities']
  },
  {
    id: 'math', icon: 'chart',
    title: tri('物理中的数学工具', 'Mathematical tools of physics', 'Mathematische Werkzeuge der Physik'),
    sections: [
      {
        heading: tri('矢量', 'Vectors', 'Vektoren'),
        paragraphs: [
          tri('力、速度、加速度、场强是矢量：既有大小又有方向，按平行四边形法则相加。解题时选坐标轴，把矢量分解成分量，每个方向分别列方程。点积 a·b = |a||b|cosθ 给出功 W = F·s，叉积给出力矩和洛伦兹力的方向。',
            'Force, velocity, acceleration and field strength are vectors: they have size and direction and add by the parallelogram rule. To solve a problem, choose axes, resolve the vectors into components and write an equation along each axis. The dot product a·b = |a||b|cosθ gives the work W = F·s; the cross product gives the direction of torques and of the Lorentz force.',
            'Kraft, Geschwindigkeit, Beschleunigung und Feldstärke sind Vektoren: Sie haben Betrag und Richtung und werden nach der Parallelogrammregel addiert. Zum Lösen wählt man Achsen, zerlegt die Vektoren in Komponenten und stellt für jede Achse eine Gleichung auf. Das Skalarprodukt a·b = |a||b|cosθ liefert die Arbeit W = F·s, das Kreuzprodukt die Richtung von Drehmomenten und der Lorentzkraft.')
        ],
        laws: ['W = \\vec F\\cdot\\vec s = Fs\\cos\\theta', '\\vec F = q\\vec v\\times\\vec B']
      },
      {
        heading: tri('导数、积分与微分方程', 'Derivatives, integrals and differential equations', 'Ableitungen, Integrale und Differentialgleichungen'),
        paragraphs: [
          tri('速度是位置对时间的导数 v = dx/dt，加速度是速度的导数；反过来，位移是速度对时间的积分（v–t 图线下的面积），功是力对位移的积分。牛顿第二定律是微分方程：m d²x/dt² = F(x, v, t)。线性阻力或导体棒的安培力给出 m dv/dt = F − kv，解是指数趋近 v = v_T + (v₀ − v_T)e^(−t/τ)；弹簧振子给出简谐运动 x = A cos(ωt + φ)。',
            'Velocity is the derivative of position, v = dx/dt, and acceleration that of velocity; conversely, displacement is the integral of velocity (the area under the v–t graph) and work the integral of force over displacement. Newton’s second law is a differential equation, m d²x/dt² = F(x, v, t). A linear drag or the force on a rod on rails gives m dv/dt = F − kv, solved by the exponential approach v = v_T + (v₀ − v_T)e^(−t/τ); a spring gives simple harmonic motion x = A cos(ωt + φ).',
            'Die Geschwindigkeit ist die Ableitung des Ortes, v = dx/dt, die Beschleunigung die der Geschwindigkeit; umgekehrt ist der Weg das Integral der Geschwindigkeit (Fläche unter dem v-t-Diagramm) und die Arbeit das Integral der Kraft über den Weg. Das zweite Newtonsche Gesetz ist eine Differentialgleichung, m·d²x/dt² = F(x, v, t). Lineare Reibung oder die Kraft auf einen Stab auf Schienen ergibt m·dv/dt = F − k·v mit der Lösung v = v_T + (v₀ − v_T)·e^(−t/τ); eine Feder ergibt die harmonische Schwingung x = A·cos(ωt + φ).')
        ],
        laws: ['v = \\dfrac{dx}{dt},\\quad a = \\dfrac{dv}{dt}', 'W = \\int F\\,dx', 'm\\dfrac{dv}{dt} = F - kv']
      },
      {
        heading: tri('数值方法：引擎如何计算', 'Numerical methods: how the engine computes', 'Numerische Verfahren: wie die Engine rechnet'),
        paragraphs: [
          tri('大多数运动方程没有解析解，计算机用数值积分一步步推进：VeloPhi 默认用 Dormand–Prince 5(4) 自适应方法，每一步估计误差并调整步长（相对误差 10⁻¹⁰ 量级）；碰撞、开始滑动、进出场区等事件的时刻用求根方法精确定位到约 10⁻¹² s。电路暂态用梯形法和步长加倍检验误差，量子实验用快速傅里叶变换（FFT）在位置与动量空间之间切换。同一场景每次计算结果逐位一致。',
            'Most equations of motion have no closed-form solution, so a computer advances them step by step by numerical integration. VeloPhi uses the adaptive Dormand–Prince 5(4) method by default, estimating the error of every step and adjusting the step size (relative error around 10⁻¹⁰); the instants of events such as impacts, the start of sliding or entering a field region are located by root finding to about 10⁻¹² s. Circuit transients use the trapezoidal rule with step doubling to check the error, and the quantum lab switches between position and momentum space with the fast Fourier transform (FFT). The same scene always gives bit-identical results.',
            'Die meisten Bewegungsgleichungen haben keine geschlossene Lösung; der Computer integriert sie numerisch Schritt für Schritt. VeloPhi verwendet standardmäßig das adaptive Dormand-Prince-5(4)-Verfahren, schätzt den Fehler jedes Schritts und passt die Schrittweite an (relativer Fehler um 10⁻¹⁰); die Zeitpunkte von Ereignissen wie Stößen, Gleitbeginn oder dem Eintritt in ein Feldgebiet werden durch Nullstellensuche auf etwa 10⁻¹² s bestimmt. Schaltvorgänge nutzen die Trapezregel mit Schrittverdopplung zur Fehlerkontrolle, das Quantenlabor wechselt mit der schnellen Fourier-Transformation (FFT) zwischen Orts- und Impulsraum. Dieselbe Szene liefert stets bitgleiche Ergebnisse.')
        ]
      },
      {
        heading: tri('复数与傅里叶分析', 'Complex numbers and Fourier analysis', 'Komplexe Zahlen und Fourier-Analyse'),
        paragraphs: [
          tri('交流电和波常用复数表示：u = U_m e^(iωt) 的实部就是 U_m cos ωt，电感与电容的阻抗是 iωL 与 1/(iωC)。任何周期信号都能分解为不同频率的正弦波之和（傅里叶级数），声音的音色由各次谐波的强弱决定；量子力学中的波函数同样可以在位置与动量之间做傅里叶变换。',
            'Alternating currents and waves are written with complex numbers: the real part of u = U_m e^(iωt) is U_m cos ωt, and the impedances of an inductor and a capacitor are iωL and 1/(iωC). Any periodic signal is a sum of sine waves of different frequencies (Fourier series) — the timbre of a sound is set by the strengths of its harmonics — and a quantum wave function can likewise be Fourier-transformed between position and momentum.',
            'Wechselströme und Wellen schreibt man mit komplexen Zahlen: Der Realteil von u = U_m·e^(iωt) ist U_m·cos ωt, die Impedanzen von Spule und Kondensator sind iωL und 1/(iωC). Jedes periodische Signal ist eine Summe von Sinuswellen verschiedener Frequenzen (Fourier-Reihe) — die Klangfarbe eines Tons bestimmen die Stärken der Obertöne —, und eine quantenmechanische Wellenfunktion lässt sich ebenso zwischen Ort und Impuls Fourier-transformieren.')
        ],
        laws: ['e^{i\\omega t} = \\cos\\omega t + i\\sin\\omega t', 'Z_L = i\\omega L,\\quad Z_C = \\dfrac{1}{i\\omega C}']
      }
    ],
    see: ['rail-coast', 'damped-spring', 'lab:circuit', 'lab:quantum']
  },
  {
    id: 'qft', icon: 'atom',
    title: tri('量子场论初步（概念）', 'Quantum field theory — the ideas', 'Quantenfeldtheorie — die Grundideen'),
    sections: [
      {
        heading: tri('场是基本的', 'Fields come first', 'Felder sind grundlegend'),
        paragraphs: [
          tri('量子场论把场看作最基本的东西：每一种粒子对应一种充满空间的场，粒子是场的量子化激发。电磁场的激发是光子，电子场的激发是电子。粒子可以产生和湮灭，所以同一种粒子完全相同、不可分辨；粒子数在高能碰撞中可以改变，这是只描述单个粒子的量子力学做不到的。',
            'Quantum field theory treats fields as the basic objects: each kind of particle belongs to a field filling all space, and particles are quantized excitations of that field — the photon of the electromagnetic field, the electron of the electron field. Particles can be created and annihilated, which is why all particles of one kind are identical, and why the number of particles can change in high-energy collisions — something single-particle quantum mechanics cannot describe.',
            'Die Quantenfeldtheorie betrachtet Felder als grundlegend: Zu jeder Teilchensorte gehört ein raumfüllendes Feld, und Teilchen sind gequantelte Anregungen dieses Feldes — das Photon des elektromagnetischen Feldes, das Elektron des Elektronenfeldes. Teilchen können erzeugt und vernichtet werden; deshalb sind alle Teilchen einer Sorte identisch, und ihre Zahl kann sich bei Stößen hoher Energie ändern — was die Einteilchen-Quantenmechanik nicht beschreiben kann.')
        ],
        laws: ['E^2 = p^2c^2 + m^2c^4', 'E = \\hbar\\omega,\\quad p = \\hbar k']
      },
      {
        heading: tri('相互作用与费曼图', 'Interactions and Feynman diagrams', 'Wechselwirkungen und Feynman-Diagramme'),
        paragraphs: [
          tri('相互作用是交换“媒介粒子”：电磁力交换光子，弱力交换 W、Z 玻色子，强力交换胶子。费曼图用线表示粒子、用顶点表示相互作用，每个图对应计算散射概率的一项；顶点越多，项越小（电磁相互作用中每个顶点带来精细结构常数 α ≈ 1/137 的因子）。图中的内线是“虚粒子”，不满足自由粒子的能量—动量关系。',
            'Interactions are the exchange of carrier particles: photons for the electromagnetic force, W and Z bosons for the weak force, gluons for the strong force. A Feynman diagram draws particles as lines and interactions as vertices; each diagram is one term in the probability of a scattering process, and more vertices mean smaller terms (in electromagnetism each vertex brings a factor of the fine-structure constant α ≈ 1/137). Internal lines are "virtual" particles that do not obey the energy–momentum relation of free particles.',
            'Wechselwirkungen sind der Austausch von Botenteilchen: Photonen bei der elektromagnetischen, W- und Z-Bosonen bei der schwachen, Gluonen bei der starken Kraft. Ein Feynman-Diagramm zeichnet Teilchen als Linien und Wechselwirkungen als Vertizes; jedes Diagramm ist ein Term der Streuwahrscheinlichkeit, und mehr Vertizes bedeuten kleinere Terme (in der Elektrodynamik bringt jeder Vertex einen Faktor der Feinstrukturkonstante α ≈ 1/137). Innere Linien sind „virtuelle“ Teilchen, die die Energie-Impuls-Beziehung freier Teilchen nicht erfüllen.')
        ],
        laws: ['\\alpha = \\dfrac{e^2}{4\\pi\\varepsilon_0\\hbar c} \\approx \\dfrac{1}{137}']
      },
      {
        heading: tri('标准模型与对称性', 'The Standard Model and symmetry', 'Das Standardmodell und Symmetrien'),
        paragraphs: [
          tri('粒子物理的标准模型由 6 种夸克、6 种轻子、传递三种相互作用的规范玻色子和希格斯玻色子组成。相互作用的形式由“规范对称性”决定；希格斯场使 W、Z 和费米子获得质量。引力尚未纳入量子场论，广义相对论与量子理论的统一仍是开放问题。本页只作概念介绍，VeloPhi 不做量子场论的模拟；“一维量子力学”“康普顿散射”“衰变链与核反应”实验展示了与它相关的量子与相对论现象。',
            'The Standard Model of particle physics consists of six quarks, six leptons, the gauge bosons that carry the three interactions, and the Higgs boson. The form of the interactions follows from gauge symmetry; the Higgs field gives mass to the W and Z and to the fermions. Gravity is not yet part of quantum field theory — unifying general relativity with quantum theory is still open. This page only introduces the ideas; VeloPhi does not simulate quantum fields. The "1D quantum mechanics", "Compton scattering" and "Decay chains and nuclear reactions" experiments show related quantum and relativistic effects.',
            'Das Standardmodell der Teilchenphysik besteht aus sechs Quarks, sechs Leptonen, den Eichbosonen der drei Wechselwirkungen und dem Higgs-Boson. Die Form der Wechselwirkungen folgt aus der Eichsymmetrie; das Higgs-Feld gibt W, Z und den Fermionen ihre Masse. Die Gravitation gehört noch nicht zur Quantenfeldtheorie — die Vereinigung von allgemeiner Relativitätstheorie und Quantentheorie ist offen. Diese Seite stellt nur die Ideen vor; VeloPhi simuliert keine Quantenfelder. Die Versuche „Eindimensionale Quantenmechanik“, „Compton-Streuung“ und „Zerfallsreihen und Kernreaktionen“ zeigen verwandte Quanten- und Relativitätseffekte.')
        ]
      }
    ],
    see: ['lab:quantum', 'lab:compton', 'lab:nuclear', 'lab:relativity']
  }
]

/** A concept page by id. */
export function conceptById(id: string): Concept | undefined { return CONCEPTS.find(c => c.id === id) }
