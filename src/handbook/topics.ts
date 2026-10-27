/**
 * Learning handbook (manual 26.51, D46): the topics with their principle texts in three languages, and the topic
 * of every library formula. Content is data; the handbook page is generated from it, the formula library
 * (formula/library.ts), the level tags (formula/levels.ts), the derivations (formula/derivations) and the cached
 * examples (handbook/examples.json).
 */
import type { Tri } from '../i18n/tri'
import { FORMULAS } from '../formula/library'

const tri = (zh: string, en: string, de: string): Tri => ({ zh, en, de })

/** A topic of the handbook. */
export interface Topic {
  id: string
  title: Tri
  /** Icon of the topic (app/icons). */
  icon: string
  /** The principle, paragraph by paragraph. */
  principle: Tri[]
  /** Key relations shown with the principle (KaTeX). */
  laws: string[]
  /** Situation types whose formulas belong to the topic (see FORMULA_TOPIC for exceptions). */
  situations: string[]
}

/** The topics, in reading order. */
export const TOPICS: Topic[] = [
  {
    id: 'motion', icon: 'chart',
    title: tri('力与运动', 'Force and motion', 'Kraft und Bewegung'),
    principle: [
      tri('描述运动用位置、速度和加速度：速度是位置变化的快慢，加速度是速度变化的快慢。速度不变的运动是匀速直线运动，加速度不变的运动是匀变速运动。',
        'Motion is described by position, velocity and acceleration: velocity is the rate of change of position, acceleration the rate of change of velocity. Motion with constant velocity is uniform; motion with constant acceleration is uniformly accelerated.',
        'Bewegung wird durch Ort, Geschwindigkeit und Beschleunigung beschrieben: Die Geschwindigkeit ist die Änderungsrate des Ortes, die Beschleunigung die der Geschwindigkeit. Bei konstanter Geschwindigkeit ist die Bewegung gleichförmig, bei konstanter Beschleunigung gleichmäßig beschleunigt.'),
      tri('牛顿第一定律：不受力（或合力为零）的物体保持静止或匀速直线运动。牛顿第二定律：合力决定加速度，F = ma，方向相同。牛顿第三定律：两个物体之间的作用力与反作用力等大、反向、作用在不同物体上。',
        "Newton's first law: a body with no force on it (or zero net force) stays at rest or moves uniformly in a straight line. Second law: the net force fixes the acceleration, F = ma, in the same direction. Third law: the forces two bodies exert on each other are equal, opposite and act on different bodies.",
        'Erstes Newtonsches Gesetz: Ein Körper ohne Kraft (oder mit resultierender Kraft null) bleibt in Ruhe oder bewegt sich gleichförmig geradlinig. Zweites Gesetz: Die resultierende Kraft bestimmt die Beschleunigung, F = m·a, in derselben Richtung. Drittes Gesetz: Die Kräfte zweier Körper aufeinander sind gleich groß, entgegengesetzt und wirken auf verschiedene Körper.'),
      tri('解题的一般步骤：选研究对象（隔离法或整体法），画受力图，建立坐标系并正交分解，沿各方向列牛顿第二定律，再结合运动学公式求解。抛体运动可以分解为水平方向的匀速运动和竖直方向的匀变速运动，两个分运动互不影响。',
        'The usual method: choose the body or system (isolate it or treat the whole), draw the forces, choose axes and resolve, write the second law along each axis, then use the kinematic relations. Projectile motion splits into uniform motion horizontally and uniformly accelerated motion vertically; the two do not affect each other.',
        'Das übliche Vorgehen: Körper oder System wählen (freischneiden oder als Ganzes), Kräfte einzeichnen, Achsen wählen und zerlegen, das zweite Gesetz für jede Achse aufstellen und mit den Bewegungsgleichungen lösen. Der schiefe Wurf zerfällt in eine gleichförmige waagerechte und eine gleichmäßig beschleunigte senkrechte Bewegung, die sich nicht beeinflussen.')
    ],
    laws: ['\\vec F = m\\vec a', 'v = v_0 + at', 'x = v_0t + \\tfrac{1}{2}at^2', 'v^2 - v_0^2 = 2ax'],
    situations: ['uniform', 'projectile', 'const-force', 'atwood', 'pulley', 'movable-pulley', 'var-force']
  },
  {
    id: 'friction', icon: 'incline',
    title: tri('相互作用与摩擦', 'Interactions and friction', 'Wechselwirkungen und Reibung'),
    principle: [
      tri('重力 G = mg 竖直向下；接触面的支持力垂直于接触面；绳只能拉，拉力沿绳；弹簧的弹力与形变量成正比，F = kx（胡克定律）。',
        "Weight G = mg points down; the normal force of a surface is perpendicular to it; a rope can only pull, along itself; a spring's force is proportional to its extension, F = kx (Hooke's law).",
        'Die Gewichtskraft G = m·g zeigt nach unten; die Normalkraft einer Fläche steht senkrecht auf ihr; ein Seil kann nur ziehen, längs des Seils; die Federkraft ist proportional zur Auslenkung, F = k·x (Hookesches Gesetz).'),
      tri('两个接触面相对滑动时有滑动摩擦力 f = μN，方向与相对运动方向相反；相对静止但有滑动趋势时有静摩擦力，大小由平衡或牛顿第二定律决定，最大不超过最大静摩擦力（近似取 μN）。',
        'Surfaces sliding over each other feel kinetic friction f = μN, against the relative motion; surfaces at rest relative to each other but tending to slide feel static friction, whose size follows from equilibrium or the second law and cannot exceed its maximum (about μN).',
        'Gleiten zwei Flächen aufeinander, wirkt die Gleitreibung f = μ·N gegen die Relativbewegung; ruhen sie relativ zueinander, neigen aber zum Gleiten, wirkt Haftreibung, deren Betrag aus dem Gleichgewicht oder dem zweiten Gesetz folgt und ihren Höchstwert (etwa μ·N) nicht überschreiten kann.'),
      tri('物体静止或匀速直线运动时处于平衡：合力为零。能绕支点转动的物体（杠杆）平衡时，使它向两个方向转动的力矩相等：F₁l₁ = F₂l₂。',
        'A body at rest or in uniform motion is in equilibrium: the net force is zero. A body that can turn about a pivot (a lever) is balanced when the moments turning it either way are equal: F₁l₁ = F₂l₂.',
        'Ein Körper in Ruhe oder gleichförmiger Bewegung ist im Gleichgewicht: Die resultierende Kraft ist null. Ein um einen Drehpunkt drehbarer Körper (Hebel) ist im Gleichgewicht, wenn die Drehmomente in beide Richtungen gleich sind: F₁l₁ = F₂l₂.')
    ],
    laws: ['G = mg', 'f = \\mu N', 'F = kx', 'F_1l_1 = F_2l_2'],
    situations: ['incline', 'flat', 'board-block', 'board-together', 'lever', 'wedge']
  },
  {
    id: 'energy', icon: 'gauge',
    title: tri('能量与功', 'Energy and work', 'Energie und Arbeit'),
    principle: [
      tri('力对物体做的功 W = Fs cos α：只有沿位移方向的分力做功。功率 P = W/t = Fv cos α 表示做功的快慢。',
        'The work of a force is W = Fs cos α: only the component along the displacement does work. Power P = W/t = Fv cos α is the rate of doing work.',
        'Die Arbeit einer Kraft ist W = F·s·cos α: Nur die Komponente längs der Verschiebung verrichtet Arbeit. Die Leistung P = W/t = F·v·cos α ist Arbeit pro Zeit.'),
      tri('动能 Eₖ = ½mv²，重力势能 Eₚ = mgh，弹性势能 ½kx²。动能定理：合力做的功等于动能的变化。只有重力和弹力做功时，机械能守恒。',
        "Kinetic energy is Eₖ = ½mv², gravitational potential energy Eₚ = mgh, elastic energy ½kx². Work–energy theorem: the work of the net force equals the change in kinetic energy. When only gravity and spring forces do work, mechanical energy is conserved.",
        'Kinetische Energie Eₖ = ½mv², Lageenergie Eₚ = m·g·h, Spannenergie ½kx². Arbeitssatz: Die Arbeit der resultierenden Kraft ist gleich der Änderung der kinetischen Energie. Verrichten nur Gewichts- und Federkräfte Arbeit, bleibt die mechanische Energie erhalten.'),
      tri('能量不会凭空产生或消失：摩擦生热 Q = fΔs（Δs 为相对滑动路程），碰撞、阻尼和空气阻力把机械能变成内能，外力、马达和传送带对系统做功。VeloPhi 的能量账本把这些项逐一记下，总和应保持不变。',
        'Energy is neither created nor destroyed: friction turns Q = fΔs into heat (Δs the relative sliding distance), collisions, damping and air drag turn mechanical energy into internal energy, and applied forces, motors and belts do work on the system. VeloPhi’s energy ledger books each of these; the total stays constant.',
        'Energie entsteht nicht aus dem Nichts und verschwindet nicht: Reibung erzeugt die Wärme Q = f·Δs (Δs der relative Gleitweg), Stöße, Dämpfung und Luftwiderstand wandeln mechanische in innere Energie um, äußere Kräfte, Motoren und Bänder verrichten Arbeit am System. Die Energiebilanz von VeloPhi verbucht jeden Posten; die Summe bleibt konstant.')
    ],
    laws: ['W = Fs\\cos\\alpha', 'P = Fv', 'W_{\\text{net}} = \\Delta E_k', 'E_k + E_p = \\text{const}'],
    situations: ['energy']
  },
  {
    id: 'momentum', icon: 'ball',
    title: tri('动量与碰撞', 'Momentum and collisions', 'Impuls und Stöße'),
    principle: [
      tri('动量 p = mv 是矢量。动量定理：合力的冲量等于动量的变化，FΔt = Δp；变力的冲量是 F–t 图像下的面积。',
        'Momentum p = mv is a vector. Impulse–momentum theorem: the impulse of the net force equals the change in momentum, FΔt = Δp; for a varying force the impulse is the area under the F–t graph.',
        'Der Impuls p = m·v ist ein Vektor. Impulssatz: Der Kraftstoß der resultierenden Kraft ist gleich der Impulsänderung, F·Δt = Δp; bei veränderlicher Kraft ist er die Fläche unter dem F-t-Graphen.'),
      tri('系统不受外力或外力的冲量可以忽略（如碰撞瞬间）时，系统总动量守恒；某一方向不受外力时，该方向的动量守恒。',
        'If no external force acts on a system, or its impulse is negligible (as during a collision), the total momentum is conserved; if no external force acts in one direction, the momentum in that direction is conserved.',
        'Wirkt auf ein System keine äußere Kraft oder ist ihr Kraftstoß vernachlässigbar (wie beim Stoß), bleibt der Gesamtimpuls erhalten; wirkt in einer Richtung keine äußere Kraft, bleibt der Impuls in dieser Richtung erhalten.'),
      tri('碰撞按恢复系数 e（分离速度与接近速度之比）分类：e = 1 弹性碰撞，动能不变；0 < e < 1 非弹性碰撞；e = 0 完全非弹性碰撞，碰后共速，动能损失最多。等质量的弹性正碰交换速度。',
        'Collisions are classified by the coefficient of restitution e (speed of separation over speed of approach): e = 1 elastic, kinetic energy unchanged; 0 < e < 1 inelastic; e = 0 perfectly inelastic, a common velocity afterwards and the largest loss. Equal masses in an elastic head-on collision exchange velocities.',
        'Stöße werden nach der Stoßzahl e (Trennungs- durch Annäherungsgeschwindigkeit) eingeteilt: e = 1 elastisch, die kinetische Energie bleibt; 0 < e < 1 teilelastisch; e = 0 vollkommen unelastisch, danach gemeinsame Geschwindigkeit und größter Verlust. Gleiche Massen tauschen beim elastischen geraden Stoß ihre Geschwindigkeiten.')
    ],
    laws: ['\\vec p = m\\vec v', 'F\\Delta t = \\Delta p', 'm_1u_1 + m_2u_2 = m_1v_1\' + m_2v_2\''],
    situations: ['collision', 'bounce', 'momentum', 'spring-pair']
  },
  {
    id: 'circular', icon: 'loop',
    title: tri('圆周运动', 'Circular motion', 'Kreisbewegung'),
    principle: [
      tri('圆周运动中速度方向不断改变，即使速率不变也有加速度。匀速圆周运动的加速度指向圆心，a = v²/r = ω²r；线速度 v = ωr，周期 T = 2πr/v。',
        'In circular motion the direction of the velocity keeps changing, so there is an acceleration even at constant speed. In uniform circular motion it points to the centre, a = v²/r = ω²r; the speed is v = ωr and the period T = 2πr/v.',
        'Bei der Kreisbewegung ändert sich die Richtung der Geschwindigkeit ständig; auch bei konstantem Betrag gibt es eine Beschleunigung. Bei der gleichförmigen Kreisbewegung zeigt sie zum Mittelpunkt, a = v²/r = ω²r; die Bahngeschwindigkeit ist v = ω·r, die Umlaufdauer T = 2πr/v.'),
      tri('提供向心加速度的是沿半径指向圆心的合力（向心力）F = mv²/r，它不是一种新的力，可以是绳的拉力、支持力、摩擦力或万有引力。',
        'The centripetal acceleration is produced by the net force along the radius towards the centre (the centripetal force) F = mv²/r; it is not a new kind of force but a rope’s pull, a normal force, friction or gravitation.',
        'Die Zentripetalbeschleunigung erzeugt die resultierende Kraft längs des Radius zum Mittelpunkt (Zentripetalkraft) F = m·v²/r; sie ist keine neue Kraftart, sondern Seilkraft, Normalkraft, Reibung oder Gravitation.'),
      tri('竖直面内的圆周运动速率变化：用机械能守恒联系最高点和最低点，用向心力方程求绳或杆的力。绳在最高点的临界速度是 √(gL)。',
        'In a vertical circle the speed changes: link the top and the bottom by conservation of energy, and find the force of the rope or rod from the centripetal equation. A rope’s critical speed at the top is √(gL).',
        'In einem senkrechten Kreis ändert sich der Betrag der Geschwindigkeit: Oben und unten über die Energieerhaltung verbinden, die Seil- oder Stabkraft aus der Zentripetalgleichung bestimmen. Die kritische Geschwindigkeit eines Seils oben ist √(gL).')
    ],
    laws: ['a = \\dfrac{v^2}{r}', 'F = \\dfrac{mv^2}{r}', 'v = \\omega r', 'T = \\dfrac{2\\pi r}{v}'],
    situations: ['circle', 'vcircle-rope', 'vcircle-rod']
  },
  {
    id: 'oscillation', icon: 'spring',
    title: tri('振动', 'Oscillations', 'Schwingungen'),
    principle: [
      tri('回复力与位移成正比、方向相反（F = −kx）的振动是简谐运动，周期与振幅无关：弹簧振子 T = 2π√(m/k)，小角度单摆 T ≈ 2π√(L/g)。',
        'An oscillation whose restoring force is proportional and opposite to the displacement (F = −kx) is simple harmonic; its period does not depend on the amplitude: a spring oscillator has T = 2π√(m/k), a pendulum at small angles T ≈ 2π√(L/g).',
        'Eine Schwingung mit einer zur Auslenkung proportionalen, entgegengesetzten Rückstellkraft (F = −k·x) ist harmonisch; ihre Periode hängt nicht von der Amplitude ab: Federschwinger T = 2π√(m/k), Pendel bei kleinen Winkeln T ≈ 2π√(L/g).'),
      tri('简谐运动中动能与势能不断转化，平衡位置速度最大，最大位移处加速度最大。单摆摆角较大时 sin θ ≈ θ 不再成立，周期随振幅增大，精确值要用椭圆积分。',
        'In simple harmonic motion kinetic and potential energy keep turning into each other: the speed is largest at equilibrium, the acceleration at the largest displacement. For a pendulum at large angles sin θ ≈ θ fails and the period grows with the amplitude; the exact value needs an elliptic integral.',
        'Bei der harmonischen Schwingung wandeln sich kinetische und potentielle Energie ständig ineinander um: Die Geschwindigkeit ist in der Gleichgewichtslage am größten, die Beschleunigung bei größter Auslenkung. Bei großen Pendelwinkeln gilt sin θ ≈ θ nicht mehr, die Periode wächst mit der Amplitude; der genaue Wert erfordert ein elliptisches Integral.'),
      tri('有阻尼时振幅按指数衰减，A(t) = A₀e^{−γt}，γ = c/(2m)，周期比无阻尼时略长。',
        'With damping the amplitude decays exponentially, A(t) = A₀e^{−γt} with γ = c/(2m), and the period is a little longer than without damping.',
        'Mit Dämpfung nimmt die Amplitude exponentiell ab, A(t) = A₀e^{−γt} mit γ = c/(2m), und die Periode ist etwas länger als ohne Dämpfung.')
    ],
    laws: ['F = -kx', 'T = 2\\pi\\sqrt{\\dfrac{m}{k}}', 'T \\approx 2\\pi\\sqrt{\\dfrac{L}{g}}'],
    situations: ['pendulum', 'spring', 'damped']
  },
  {
    id: 'rotation', icon: 'disc',
    title: tri('转动', 'Rotation', 'Drehbewegung'),
    principle: [
      tri('刚体绕固定轴转动时用角位移 θ、角速度 ω、角加速度 β 描述，与直线运动一一对应：ω = ω₀ + βt，θ = ω₀t + ½βt²。',
        'A rigid body turning about a fixed axis is described by its angle θ, angular velocity ω and angular acceleration β, in one-to-one correspondence with straight-line motion: ω = ω₀ + βt, θ = ω₀t + ½βt².',
        'Ein starrer Körper, der sich um eine feste Achse dreht, wird durch Drehwinkel θ, Winkelgeschwindigkeit ω und Winkelbeschleunigung β beschrieben, eins zu eins wie die geradlinige Bewegung: ω = ω₀ + β·t, θ = ω₀·t + ½·β·t².'),
      tri('力矩 M = Fd（d 为力臂）使物体转动；转动定律 M = Iβ，转动惯量 I 是转动中的“质量”，与质量分布有关（平行轴定理 I = I_C + md²）。转动动能 ½Iω²，角动量 L = Iω，不受外力矩时角动量守恒。',
        'A torque M = Fd (d the lever arm) turns a body; the rotational second law is M = Iβ, where the moment of inertia I plays the part of mass and depends on how the mass is distributed (parallel-axis theorem I = I_C + md²). The kinetic energy of rotation is ½Iω² and the angular momentum L = Iω, conserved when no external torque acts.',
        'Ein Drehmoment M = F·d (d der Hebelarm) dreht einen Körper; das Grundgesetz der Drehbewegung lautet M = I·β, wobei das Trägheitsmoment I die Rolle der Masse spielt und von der Massenverteilung abhängt (Steinerscher Satz I = I_S + m·d²). Die Rotationsenergie ist ½Iω², der Drehimpuls L = I·ω; ohne äußeres Drehmoment bleibt er erhalten.'),
      tri('纯滚动时接触点不打滑，v = ωr；齿轮或皮带传动时轮缘线速度相等。',
        'In rolling without slipping the contact point does not slide, v = ωr; in gears and belts the rims move at equal speeds.',
        'Beim Rollen ohne Gleiten rutscht der Berührpunkt nicht, v = ω·r; bei Zahnrädern und Riemen bewegen sich die Ränder gleich schnell.')
    ],
    laws: ['M = I\\beta', 'L = I\\omega', 'E_k = \\tfrac{1}{2}I\\omega^2', 'v = \\omega r'],
    situations: ['rotation', 'rolling', 'roll-slip', 'hinged-impact', 'spin', 'gear']
  },
  {
    id: 'gravitation', icon: 'orbit',
    title: tri('万有引力与轨道', 'Gravitation and orbits', 'Gravitation und Bahnen'),
    principle: [
      tri('任意两个物体都相互吸引，F = GMm/r²（万有引力定律），G = 6.674×10⁻¹¹ N·m²/kg²。地面附近的重力 mg 就是地球的引力，g = GM/R²。',
        'Any two bodies attract each other, F = GMm/r² (Newton’s law of gravitation), G = 6.674×10⁻¹¹ N·m²/kg². Weight mg near the ground is the Earth’s gravitation, g = GM/R².',
        'Zwei Körper ziehen sich an, F = G·M·m/r² (Gravitationsgesetz), G = 6,674·10⁻¹¹ N·m²/kg². Die Gewichtskraft m·g in Bodennähe ist die Gravitation der Erde, g = G·M/R².'),
      tri('开普勒定律：行星绕太阳的轨道是椭圆，太阳在一个焦点上；连线在相等时间扫过相等面积（角动量守恒）；半长轴的立方与周期的平方之比 a³/T² 对同一中心天体相同。',
        "Kepler's laws: planets move on ellipses with the Sun at one focus; the line from the Sun sweeps equal areas in equal times (conservation of angular momentum); a³/T², the cube of the semi-major axis over the square of the period, is the same for all bodies around one centre.",
        'Keplersche Gesetze: Planeten bewegen sich auf Ellipsen, in deren einem Brennpunkt die Sonne steht; die Verbindungslinie überstreicht in gleichen Zeiten gleiche Flächen (Drehimpulserhaltung); a³/T², große Halbachse hoch drei durch Umlaufdauer zum Quadrat, ist für alle Körper um dasselbe Zentrum gleich.'),
      tri('圆轨道上万有引力提供向心力，v = √(GM/r)。引力势能 −GMm/r（无穷远为零）；轨道机械能 E = −GMm/(2a) 只由半长轴决定，E < 0 时被束缚。',
        'On a circular orbit gravitation provides the centripetal force, v = √(GM/r). The potential energy is −GMm/r (zero at infinity); the orbital energy E = −GMm/(2a) depends only on the semi-major axis, and E < 0 means the body is bound.',
        'Auf einer Kreisbahn liefert die Gravitation die Zentripetalkraft, v = √(G·M/r). Die potentielle Energie ist −G·M·m/r (null im Unendlichen); die Bahnenergie E = −G·M·m/(2a) hängt nur von der großen Halbachse ab, E < 0 heißt gebunden.')
    ],
    laws: ['F = \\dfrac{GMm}{r^2}', 'v = \\sqrt{\\dfrac{GM}{r}}', '\\dfrac{a^3}{T^2} = \\dfrac{GM}{4\\pi^2}'],
    situations: ['orbit']
  },
  {
    id: 'drag', icon: 'wind',
    title: tri('阻力', 'Drag', 'Widerstand'),
    principle: [
      tri('物体在空气或液体中运动时受到与速度方向相反的阻力。速度小、物体小时阻力约与速度成正比（f = bv，斯托克斯定律，球体 b = 6πηr）；速度大时约与速度的平方成正比（f = cv²，c = ½ρC_dA）。',
        'A body moving through air or a liquid feels a drag force against its velocity. For small, slow bodies it is roughly proportional to the speed (f = bv, Stokes’s law, b = 6πηr for a sphere); at high speed roughly to the square of the speed (f = cv², c = ½ρC_dA).',
        'Ein Körper, der sich durch Luft oder eine Flüssigkeit bewegt, erfährt einen Widerstand gegen seine Geschwindigkeit. Bei kleinen, langsamen Körpern ist er etwa proportional zur Geschwindigkeit (f = b·v, Stokessches Gesetz, b = 6πηr für eine Kugel), bei hoher Geschwindigkeit etwa zu ihrem Quadrat (f = c·v², c = ½ρc_wA).'),
      tri('下落的物体越来越快，阻力越来越大，直到阻力等于重力，此后匀速下落，这个速度叫终端速度：线性阻力 v_t = mg/b，平方阻力 v_t = √(mg/c)。',
        'A falling body speeds up and the drag grows until it equals the weight; from then on it falls at a constant speed, the terminal speed: v_t = mg/b for linear drag, v_t = √(mg/c) for quadratic drag.',
        'Ein fallender Körper wird schneller, der Widerstand wächst, bis er der Gewichtskraft gleicht; danach fällt der Körper mit konstanter Geschwindigkeit, der Endgeschwindigkeit: v_t = m·g/b bei linearer Reibung, v_t = √(m·g/c) bei quadratischem Widerstand.'),
      tri('阻力做负功，机械能转化为内能；在 VeloPhi 中这部分记在能量账本的“阻尼耗散”里。',
        'Drag does negative work and turns mechanical energy into internal energy; in VeloPhi it is booked as damping in the energy ledger.',
        'Der Widerstand verrichtet negative Arbeit und wandelt mechanische in innere Energie um; in VeloPhi wird sie in der Energiebilanz als Dämpfung verbucht.')
    ],
    laws: ['f = bv + cv^2', 'v_t = \\dfrac{mg}{b}', 'v_t = \\sqrt{\\dfrac{mg}{c}}'],
    situations: ['drag']
  },
  {
    // 26.54 (D78)
    id: 'electric', icon: 'charge',
    title: tri('电场与磁场中的带电体', 'Charges in electric and magnetic fields', 'Ladungen in elektrischen und magnetischen Feldern'),
    principle: [
      tri('电荷之间的作用力遵循库仑定律 F = kq₁q₂/r²：同种电荷相斥，异种电荷相吸，k ≈ 8.99×10⁹ N·m²/C²。电场强度 E 是放在该处的电荷所受的力与电荷量之比，电荷在电场中受力 F = qE，正电荷沿电场方向受力。',
        "The force between charges follows Coulomb's law F = kq₁q₂/r²: like charges repel, unlike charges attract, k ≈ 8.99×10⁹ N·m²/C². The electric field E is the force on a charge placed there divided by its charge; a charge in a field feels F = qE, a positive one along the field.",
        'Die Kraft zwischen Ladungen folgt dem Coulombschen Gesetz F = k·q₁q₂/r²: Gleichnamige Ladungen stoßen sich ab, ungleichnamige ziehen sich an, k ≈ 8,99·10⁹ N·m²/C². Die elektrische Feldstärke E ist die Kraft auf eine dort gebrachte Ladung geteilt durch die Ladung; im Feld wirkt F = q·E, auf eine positive Ladung in Feldrichtung.'),
      tri('带电粒子垂直于匀强电场射入时做类平抛运动：沿初速度方向匀速，沿电场方向匀加速，a = qE/m。电场力做功只与始末位置有关，W = qEd = qU，动能的增加等于电场力做的功。',
        'A charged particle entering a uniform field at right angles moves like a projectile: uniformly along its initial velocity and with constant acceleration a = qE/m along the field. The work of the field depends only on the start and end points, W = qEd = qU, and equals the gain in kinetic energy.',
        'Ein senkrecht in ein homogenes Feld eintretendes geladenes Teilchen bewegt sich wie beim waagerechten Wurf: gleichförmig in Richtung der Anfangsgeschwindigkeit, gleichmäßig beschleunigt mit a = q·E/m längs des Feldes. Die Arbeit des Feldes hängt nur von Anfangs- und Endpunkt ab, W = q·E·d = q·U, und ist gleich dem Zuwachs an kinetischer Energie.'),
      tri('运动电荷在磁场中受洛伦兹力 F = qvB，方向垂直于速度和磁场（左手定则），所以洛伦兹力不做功，只改变速度方向。垂直射入匀强磁场的粒子做匀速圆周运动，r = mv/(qB)，T = 2πm/(qB)。电场和磁场同时存在且 qE = qvB 时，粒子匀速直线通过（速度选择器）。',
        'A moving charge in a magnetic field feels the Lorentz force F = qvB, perpendicular to both velocity and field, so it does no work and only turns the velocity. A particle entering a uniform field at right angles moves on a circle, r = mv/(qB), T = 2πm/(qB). With both fields and qE = qvB the particle goes straight through (velocity selector).',
        'Eine bewegte Ladung im Magnetfeld erfährt die Lorentzkraft F = q·v·B senkrecht zu Geschwindigkeit und Feld; sie verrichtet keine Arbeit und ändert nur die Richtung. Ein senkrecht eintretendes Teilchen läuft auf einem Kreis, r = m·v/(q·B), T = 2πm/(q·B). Mit beiden Feldern und q·E = q·v·B läuft es geradlinig hindurch (Geschwindigkeitsfilter).')
    ],
    laws: ['F = k\\dfrac{q_1q_2}{r^2}', 'F = qE', 'F = qvB', 'r = \\dfrac{mv}{qB}', 'v = \\dfrac{E}{B}'],
    situations: ['charge-e', 'charge-b', 'selector', 'charge-eb', 'coulomb', 'zone-b', 'zone-e']
  },
  {
    // 26.55 (D91)
    id: 'induction', icon: 'compass',
    title: tri('电磁感应', 'Electromagnetic induction', 'Elektromagnetische Induktion'),
    principle: [
      tri('穿过闭合回路的磁通量 Φ = BS 发生变化时，回路中产生感应电动势，大小等于磁通量的变化率 ε = ΔΦ/Δt（法拉第电磁感应定律）。导体棒以速度 v 垂直切割磁感线时，ε = BLv。',
        "When the magnetic flux Φ = BS through a closed circuit changes, an emf is induced equal to the rate of change of the flux, ε = ΔΦ/Δt (Faraday's law). A rod of length L cutting the field lines at right angles with speed v gives ε = BLv.",
        'Ändert sich der magnetische Fluss Φ = B·A durch einen geschlossenen Kreis, wird eine Spannung induziert, gleich der Änderungsrate des Flusses, ε = ΔΦ/Δt (Induktionsgesetz). Ein Stab der Länge L, der die Feldlinien senkrecht mit der Geschwindigkeit v schneidet, liefert ε = B·L·v.'),
      tri('感应电流的方向总是阻碍引起它的磁通量变化（楞次定律）。导体棒中的感应电流 I = BLv/R 在磁场中受安培力 F = BIL = B²L²v/R，方向与运动方向相反，像一个与速度成正比的阻力：在恒力作用下导体棒最终匀速运动，收尾速度 v = FR/(B²L²)。',
        "The induced current always opposes the change of flux that causes it (Lenz's law). The current I = BLv/R in the rod feels the force F = BIL = B²L²v/R against the motion, like a drag proportional to the speed: under a constant force the rod ends up moving uniformly at the terminal velocity v = FR/(B²L²).",
        'Der Induktionsstrom ist stets so gerichtet, dass er der Flussänderung entgegenwirkt (Lenzsche Regel). Der Strom I = B·L·v/R im Stab erfährt die Kraft F = B·I·L = B²L²v/R entgegen der Bewegung, wie eine zur Geschwindigkeit proportionale Reibung: Unter konstanter Kraft bewegt sich der Stab schließlich gleichförmig mit v = F·R/(B²L²).'),
      tri('能量转化：外力克服安培力做的功先变成电能，再在电阻中变成焦耳热。外力做的功 = 导体棒动能的增加 + 焦耳热；匀速时外力的功率全部变成电功率 P = εI = I²R。',
        'Energy: the work done against the Ampère force first becomes electrical energy and then Joule heat in the resistor. The work of the applied force equals the gain in kinetic energy plus the Joule heat; in uniform motion all the applied power becomes electrical power P = εI = I²R.',
        'Energie: Die gegen die Kraft auf den Stab verrichtete Arbeit wird zuerst zu elektrischer Energie und dann zu Joulescher Wärme im Widerstand. Die Arbeit der äußeren Kraft ist gleich dem Zuwachs an kinetischer Energie plus der Jouleschen Wärme; bei gleichförmiger Bewegung wird die gesamte Leistung zur elektrischen Leistung P = ε·I = I²·R.')
    ],
    laws: ['\\varepsilon = \\dfrac{\\Delta\\Phi}{\\Delta t}', '\\varepsilon = BLv', 'F = BIL = \\dfrac{B^2L^2v}{R}', 'v_T = \\dfrac{FR}{B^2L^2}'],
    situations: ['rail']
  },
  {
    // 26.55 (D92)
    id: 'fluids', icon: 'wave',
    title: tri('压强与浮力', 'Pressure and buoyancy', 'Druck und Auftrieb'),
    principle: [
      tri('液体内部的压强随深度增加：p = p₀ + ρgh，同一深度向各个方向的压强相等。浸在液体中的物体，下表面受到的压力大于上表面，压力的合力竖直向上，就是浮力。',
        'The pressure in a liquid grows with depth, p = p₀ + ρgh, and at one depth it is the same in every direction. On a body in a liquid the push on the lower face is larger than on the upper one; the resulting upward force is the buoyant force.',
        'Der Druck in einer Flüssigkeit wächst mit der Tiefe, p = p₀ + ρ·g·h, und ist in einer Tiefe in alle Richtungen gleich. Auf einen eingetauchten Körper drückt die Flüssigkeit unten stärker als oben; die resultierende Kraft nach oben ist der Auftrieb.'),
      tri('阿基米德原理：浮力等于物体排开的液体所受的重力，F浮 = ρ液gV排。物体的平均密度小于液体时上浮，最后漂浮，F浮 = G，浸入的体积占 ρ物/ρ液；大于液体时下沉。浸没后排开的体积不变，浮力也不变。',
        "Archimedes' principle: the buoyant force equals the weight of the displaced liquid, F_b = ρ_f gV_sub. A body less dense than the liquid rises and floats with F_b = G, with the fraction ρ_b/ρ_f submerged; a denser one sinks. Once fully submerged the displaced volume, and so the buoyant force, no longer changes.",
        'Archimedisches Prinzip: Der Auftrieb ist gleich der Gewichtskraft der verdrängten Flüssigkeit, F_A = ρ_Fl·g·V_verdr. Ein Körper mit kleinerer mittlerer Dichte als die Flüssigkeit steigt und schwimmt mit F_A = G, eingetaucht zum Anteil ρ_K/ρ_Fl; ein dichterer sinkt. Ganz eingetaucht ändern sich das verdrängte Volumen und damit der Auftrieb nicht mehr.'),
      tri('浮力作用在浸入部分的形心（浮心），重力作用在重心：两者不在同一竖直线上时形成力偶，使漂浮的物体摆正或翻倒。称重法：F浮 = G − F示。二维模拟中体积按物体垂直纸面的厚度计算。',
        'The buoyant force acts at the centroid of the submerged part (centre of buoyancy), the weight at the centre of mass; when they are not on one vertical line they form a couple that rights or capsizes a floating body. Weighing in water: F_b = G − F_reading. In the 2D simulation volumes use the thickness of the body perpendicular to the page.',
        'Der Auftrieb greift im Schwerpunkt des eingetauchten Teils an (Verdrängungsschwerpunkt), die Gewichtskraft im Massenmittelpunkt; liegen sie nicht senkrecht übereinander, entsteht ein Kräftepaar, das einen schwimmenden Körper aufrichtet oder kentern lässt. Wägung im Wasser: F_A = G − F_Anzeige. In der 2D-Simulation werden Volumen mit der Dicke des Körpers senkrecht zur Zeichenebene berechnet.')
    ],
    laws: ['p = p_0 + \\rho gh', 'F_b = \\rho_f gV_{sub}', 'F_b = G', '\\dfrac{V_{sub}}{V} = \\dfrac{\\rho_b}{\\rho_f}'],
    situations: ['float']
  }
]

/** Formulas filed under another topic than their situation's (energy and momentum statements of other situations). */
const FORMULA_TOPIC: Record<string, string> = {
  'flat.Q': 'energy', 'flat.W': 'energy', 'bb.Q': 'energy', 'cf.W0': 'energy', 'cf.W': 'energy', 'cf.P': 'energy', 'cf.dEk': 'energy',
  'pr.E': 'energy', 'pr.v': 'energy', 'vf.W': 'energy', 'sb.Ep': 'energy', 'spin.W': 'rotation',
  'cf.J': 'momentum', 'vf.J': 'momentum', 'wd.px': 'momentum', 'sb.T': 'oscillation', 'sb.x': 'oscillation'
}

/** Topic id of a formula. */
export function topicOf(formulaId: string): string {
  const over = FORMULA_TOPIC[formulaId]
  if (over) return over
  const f = FORMULAS.find(x => x.id === formulaId)
  if (!f) return 'motion'
  return TOPICS.find(t => t.situations.includes(f.situation))?.id ?? 'motion'
}

/** Formula ids of a topic, in library order. */
export function formulasOf(topicId: string): string[] {
  return FORMULAS.filter(f => topicOf(f.id) === topicId).map(f => f.id)
}
