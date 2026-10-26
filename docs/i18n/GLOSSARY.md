# 术语表 / Glossary / Glossar

VeloPhi 26.50（D27）三种语言的物理术语与界面用语。翻译以教材用语为准：中文按人教版高中物理，英文按通用教材英语，德文按德国高中（Sekundarstufe II）物理教材。界面文字表在 `src/i18n/texts/*.ts`，公式推导的三语内容在 `src/formula/derivations/`，事件说明在 `src/formula/eventDetail.ts`；新增文字时沿用这里的译法。

约定：物理符号与 LaTeX 不翻译；德文摩擦因数写作 μ_H（Haft-）/ μ_G（Gleit-），界面中的符号仍为 μs / μk；“Zweites Newtonsches Gesetz”等定律名按教材写法大写。

## 界面与求解器用语

| zh | en | de |
|---|---|---|
| 仿真 / 计算 | simulation / run | Simulation / Lauf |
| 不限时长 | unbounded | unbegrenzt |
| 前瞻时间 | look-ahead | Vorausberechnung |
| 计算块 / 检查点 | chunk / checkpoint | Rechenblock / Prüfpunkt |
| 结果指纹 / 滚动指纹 | result fingerprint / rolling fingerprint | Fingerabdruck / fortlaufender Fingerabdruck |
| 逐位一致 | bit-identical | bitgleich |
| 事件 | event | Ereignis |
| 共速 | common velocity | gemeinsame Geschwindigkeit |
| 相对静止 / 相对滑动 | relative rest / relative sliding | relative Ruhe / relatives Gleiten |
| 精度降级（时间步进） | reduced accuracy (time stepping) | verringerte Genauigkeit (Zeitschritte) |
| 公式对照 | formula comparison | Formelvergleich |
| 推导 / 代入求解 / 适用条件 | derivation / worked solution / conditions | Herleitung / Lösungsweg / Bedingungen |
| 一致 / 偏差超限 / 近似成立 / 近似失效 | agrees / deviates / approximation holds / approximation fails | stimmt überein / weicht ab / Näherung gilt / Näherung ungültig |
| 能量账本 | energy ledger | Energiebilanz |
| 监视 / 预测 / 参数扫描 | watch / predict / parameter sweep | beobachten / Vorhersage / Parameterreihe |
| 频闪照片 | stroboscopic picture | Stroboskopbild |
| 课件包 / 实验报告 | courseware / lab report | Unterrichtsmaterial / Versuchsbericht |
| 模板 / 场景 | template / scene | Vorlage / Szene |
| 计算引擎 | solver engine | Rechenkern |

## 推导术语（A 组：斜面、传送带、板块、碰撞、抛体、连接体、动滑轮、可动斜面）

### 方法与定律

| zh | en | de |
|---|---|---|
| 研究对象 | body under study | betrachteter Körper |
| 受力分析 | free-body diagram, force analysis | Kräfteanalyse (Freikörperbild) |
| 隔离法 | isolation method | Freischneiden |
| 整体法 | whole-system method | Betrachtung des Gesamtsystems |
| 联立求解 | solving the equations simultaneously | Lösen des Gleichungssystems |
| 牛顿第二定律 | Newton's second law | zweites Newtonsches Gesetz |
| 牛顿第三定律 | Newton's third law | drittes Newtonsches Gesetz (actio = reactio) |
| 作用力与反作用力 | action–reaction pair | Wechselwirkungspaar |
| 力的正交分解 | resolution into perpendicular components | Zerlegung in senkrechte Komponenten |
| 运动的合成与分解 | superposition of motions | Überlagerung von Bewegungen (Unabhängigkeitsprinzip) |
| 动能定理 | work–energy theorem | Arbeitssatz (W = ΔE_kin) |
| 功能关系 | work–energy relation | Zusammenhang von Arbeit und Energie |
| 能量守恒定律 | conservation of energy | Energieerhaltungssatz |
| 动量定理 | impulse–momentum theorem | Impulssatz (Kraftstoß = Impulsänderung) |
| 动量守恒定律 | conservation of momentum | Impulserhaltungssatz |
| 约束条件 | constraint | Zwangsbedingung |
| 一元二次方程求根公式 | quadratic formula | Lösungsformel für quadratische Gleichungen (Mitternachtsformel) |
| 数量积 | scalar product | Skalarprodukt |

### 力

| zh | en | de |
|---|---|---|
| 重力 | weight (gravitational force) | Gewichtskraft |
| 支持力 | normal force | Normalkraft |
| 压力（物体对接触面） | push (of a body on the surface) | Andruckkraft |
| 正压力 | force pressing the surfaces together | Anpresskraft |
| 摩擦力 | friction force | Reibungskraft |
| 滑动摩擦力 | kinetic friction force | Gleitreibungskraft |
| 静摩擦力 | static friction force | Haftreibungskraft |
| 最大静摩擦力 | maximum static friction | maximale Haftreibungskraft |
| 动摩擦因数 | coefficient of kinetic friction | Gleitreibungszahl |
| 静摩擦因数 | coefficient of static friction | Haftreibungszahl |
| 绳的拉力 | rope tension | Seilkraft |
| 合力 | net force | resultierende Kraft |
| 内力 / 外力 | internal / external force | innere / äußere Kraft |
| 惯性力 | inertial force | Trägheitskraft |
| 冲量 | impulse | Kraftstoß |

### 斜面、传送带与板块

| zh | en | de |
|---|---|---|
| 斜面 | incline | schiefe Ebene |
| 倾角 | angle of the incline | Neigungswinkel |
| 重力沿斜面的分力 | component of the weight along the incline | Hangabtriebskraft |
| 重力垂直斜面的分力 | component of the weight perpendicular to the incline | Normalkomponente der Gewichtskraft |
| 传送带 | conveyor belt | Förderband |
| 带速 | belt velocity | Bandgeschwindigkeit |
| 电机多做的功 | extra work done by the motor | zusätzliche Arbeit des Motors |
| 板块模型 | board–block model | Klotz-Brett-Modell |
| 物块 | block | Klotz |
| 木板 | board | Brett |
| 相对滑动 | relative sliding | relatives Gleiten |
| 相对静止 | at rest relative to | relativ in Ruhe |
| 相对滑动距离 | relative sliding distance | relativer Gleitweg |
| 共速 / 共同速度 | common velocity | gemeinsame Geschwindigkeit |
| 摩擦生热 | heat produced by friction | Reibungswärme |
| 光滑 | smooth (frictionless) | reibungsfrei (glatt) |

### 运动学

| zh | en | de |
|---|---|---|
| 位移 | displacement | Verschiebung |
| 加速度 | acceleration | Beschleunigung |
| 匀减速 | uniform deceleration | gleichmäßige Verzögerung |
| 匀速直线运动 | uniform motion | gleichförmige Bewegung |
| 匀变速直线运动 | uniformly accelerated motion | gleichmäßig beschleunigte Bewegung |
| 速度—时间关系 | velocity–time relation | Geschwindigkeit-Zeit-Gesetz |
| 位移—时间关系 | displacement–time relation | Weg-Zeit-Gesetz |
| 速度—位移关系 v² − v₀² = 2ax | velocity–displacement relation | zeitfreie Gleichung |
| 平均速度 | mean velocity | mittlere Geschwindigkeit |
| v–t 图像 | v–t graph | v-t-Diagramm |
| 抛体运动 | projectile motion | Wurfbewegung |
| 平抛 | horizontal throw | waagerechter Wurf |
| 斜抛 | oblique throw | schräger Wurf |
| 竖直上抛 | vertical throw upwards | senkrechter Wurf nach oben |
| 飞行时间 | time of flight | Flugzeit |
| 水平射程 | horizontal range | Wurfweite |
| 最高点 | highest point | höchster Punkt (Scheitelpunkt) |
| 参考系 | frame of reference | Bezugssystem |
| 非惯性参考系 | accelerated (non-inertial) frame | beschleunigtes Bezugssystem |

### 能量与动量

| zh | en | de |
|---|---|---|
| 动能 | kinetic energy | kinetische Energie |
| 重力势能 | gravitational potential energy | Lageenergie |
| 弹性势能 | elastic potential energy | Spannenergie |
| 机械能 | mechanical energy | mechanische Energie |
| 内能 | internal energy | innere Energie |
| 阻尼 | damping | Dämpfung |
| 动量 | momentum | Impuls |
| 质心速度 | centre-of-mass velocity | Schwerpunktgeschwindigkeit |

### 碰撞

| zh | en | de |
|---|---|---|
| 碰撞 | collision | Stoß |
| 恢复系数 | coefficient of restitution | Stoßzahl |
| 弹性碰撞 | elastic collision | elastischer Stoß |
| 非弹性碰撞 | inelastic collision | teilelastischer Stoß |
| 完全非弹性碰撞 | perfectly inelastic collision | vollkommen unelastischer Stoß |
| 正碰 | head-on collision | gerader Stoß |
| 斜碰 | oblique collision | schiefer Stoß |
| 连心线（碰撞法线） | line of centres (collision normal) | Stoßnormale (Verbindungslinie der Mittelpunkte) |
| 切向 / 法向 | tangential / normal | tangential / normal |
| 分离速度 / 接近速度 | speed of separation / of approach | Trennungs- / Annäherungsgeschwindigkeit |
| 摩擦冲量 | friction impulse | Reibungskraftstoß |

### 连接体

| zh | en | de |
|---|---|---|
| 轻绳 | light (massless) rope | masseloses Seil |
| 绳不可伸长 | inextensible rope | undehnbares Seil |
| 定滑轮 | fixed pulley | feste Rolle |
| 动滑轮 | movable pulley | lose Rolle |
| 阿特伍德机 | Atwood machine | Atwoodsche Fallmaschine |
| 可动斜面（楔） | movable wedge | beweglicher Keil |

## 推导术语（B 组：单摆、弹簧、圆周运动、转动、滚动、变力）

### 方法与定律

| zh | en | de |
|---|---|---|
| 牛顿第二定律（切向 / 法向） | Newton's second law (tangential / radial direction) | Zweites Newtonsches Gesetz (tangential / radial) |
| 合力提供向心力 | the resultant provides the centripetal force | die Resultierende ist die Zentripetalkraft |
| 质心运动定理 | Newton's second law for the centre of mass | Schwerpunktsatz |
| 转动定律 M = Iβ | Newton's second law for rotation | Grundgesetz der Drehbewegung |
| 平行轴定理 | parallel-axis theorem | Satz von Steiner |
| 胡克定律 | Hooke's law | Hookesches Gesetz |
| 机械能守恒定律 | conservation of mechanical energy | Energieerhaltungssatz der Mechanik |
| 角动量定理 | angular impulse–momentum theorem | Drehimpulssatz |
| 角动量守恒定律（对转轴） | conservation of angular momentum (about the axis) | Drehimpulserhaltungssatz (bezüglich der Drehachse) |
| 冲量矩 | angular impulse | Drehstoß |
| 上一步代入 | substitution of the previous result | Einsetzen des vorigen Ergebnisses |
| 整理 / 移项 | rearranging | Umformen / Umstellen |
| 微元法 | dividing into small (time) elements | Zerlegung in kleine (Zeit-)Abschnitte |
| 积分换元 | substitution in the integral | Substitution im Integral |
| 交换积分次序 | exchanging the order of integration | Vertauschen der Integrationsreihenfolge |
| 原函数 | antiderivative | Stammfunktion |
| 半角公式 | half-angle formula | Halbwinkelformel |
| 极值条件 | condition for an extremum | Extremwertbedingung |
| 小角度近似 sinθ ≈ θ | small-angle approximation | Kleinwinkelnäherung |

### 振动

| zh | en | de |
|---|---|---|
| 单摆 | simple pendulum | Fadenpendel |
| 摆球 | bob | Pendelkörper |
| 摆线 / 摆线的拉力 | string / string tension | Faden / Fadenkraft |
| 摆长 | length of the pendulum | Pendellänge |
| 偏角（摆线偏离竖直方向的角度） | angle from the vertical | Auslenkwinkel |
| 最大摆角 | maximum angle (angular amplitude) | maximaler Auslenkwinkel (Umkehrpunkt) |
| 平衡位置 | equilibrium position | Gleichgewichtslage |
| 回复力 | restoring force | Rückstellkraft |
| 简谐运动 | simple harmonic motion | harmonische Schwingung |
| 周期 | period | Schwingungsdauer (Periodendauer) |
| 角频率 | angular frequency | Kreisfrequenz |
| 相位 | phase | Phase |
| 振幅 | amplitude | Amplitude |
| 单摆的等时性 | isochronism | Isochronie |
| 复摆 | physical pendulum | physikalisches Pendel |
| 弹簧振子 | spring oscillator | Federpendel |
| 劲度系数 | spring constant | Federkonstante |
| 弹簧原长 | natural length of the spring | Länge der entspannten Feder |
| 形变量（伸长 / 压缩） | deformation (extension / compression) | Verformung (Dehnung / Stauchung) |
| 最大位移处 | point of maximum displacement | Umkehrpunkt |
| 约化质量 | reduced mass | reduzierte Masse |
| 相对振动 | relative oscillation | Relativschwingung |
| 第一类完全椭圆积分 K(k) | complete elliptic integral of the first kind | vollständiges elliptisches Integral erster Art |
| 第一类不完全椭圆积分 F(φ, k) | incomplete elliptic integral of the first kind | unvollständiges elliptisches Integral erster Art |

### 竖直面内的圆周运动

| zh | en | de |
|---|---|---|
| 竖直面内的圆周运动 | vertical circular motion | Kreisbewegung in der Vertikalebene |
| 向心力 | centripetal force | Zentripetalkraft |
| 向心加速度 | centripetal acceleration | Zentripetalbeschleunigung |
| 切向 / 法向（沿半径） | tangential / radial | tangential / radial |
| 圆心 | centre | Mittelpunkt |
| 位置角（自最低点沿运动方向量起） | position angle (from the lowest point, in the direction of motion) | Lagewinkel (vom tiefsten Punkt aus in Bewegungsrichtung) |
| 最低点 / 最高点 | lowest point / top | tiefster Punkt / höchster Punkt |
| 水平直径 | horizontal diameter | waagerechter Durchmesser |
| 杆的作用力（拉力 / 推力） | rod force (pull / push) | Stabkraft (Zug / Druck) |
| 支持力（杆对球的推力） | supporting push | stützende Druckkraft |
| 临界速度 | critical speed | kritische Geschwindigkeit |
| 临界条件 | critical condition | Grenzbedingung |
| 恰能通过最高点 | just passing the top | den höchsten Punkt gerade durchlaufen |
| 绳张紧 / 绳松弛 | the rope is taut / goes slack | das Seil ist gespannt / wird schlaff |

### 刚体转动与滚动

| zh | en | de |
|---|---|---|
| 刚体 | rigid body | starrer Körper |
| 定轴转动 | rotation about a fixed axis | Drehung um eine feste Achse |
| 转轴 | axis of rotation | Drehachse |
| 铰链 / 铰链力 | hinge / hinge force | Gelenk / Gelenkkraft |
| 质心 | centre of mass | Schwerpunkt |
| 转动惯量 | moment of inertia | Trägheitsmoment |
| 力矩 | torque | Drehmoment |
| 力臂 | lever arm | Hebelarm |
| 角速度 | angular velocity | Winkelgeschwindigkeit |
| 角加速度 | angular acceleration | Winkelbeschleunigung |
| 转动动能 | rotational kinetic energy | Rotationsenergie |
| 平动动能 | translational kinetic energy | Translationsenergie |
| 匀质细杆 | uniform thin rod | homogener dünner Stab |
| 匀质圆柱（二维中的圆盘） | uniform cylinder (a disc in 2D) | homogener Zylinder (in 2D eine Scheibe) |
| 实心球 | solid sphere | Vollkugel |
| 纯滚动 | rolling without slipping | Rollen ohne Gleiten (reines Rollen) |
| 纯滚动条件 v = ωr | rolling condition | Rollbedingung |
| 边滚边滑 | rolling with slipping | Rollen mit Gleiten |
| 打滑 / 打滑持续时间 | slipping / duration of slipping | Rutschen / Rutschdauer |
| 接触点 | contact point | Berührpunkt |
| 接触点的滑动速度 | sliding velocity of the contact point | Gleitgeschwindigkeit des Berührpunkts |
| 线速度（转动引起） | linear speed (due to rotation) | Bahngeschwindigkeit |
| 静摩擦力 / 滑动摩擦力 | static / kinetic friction force | Haftreibungskraft / Gleitreibungskraft |
| 逆时针为正 | anticlockwise positive | gegen den Uhrzeigersinn positiv |

### 碰撞（绕轴转动的物体）

| zh | en | de |
|---|---|---|
| 角动量 | angular momentum | Drehimpuls |
| 碰撞法线 | impact normal | Stoßnormale |
| 碰撞点 | point of impact | Stoßpunkt |

### 变力

| zh | en | de |
|---|---|---|
| 变力 | variable force | veränderliche Kraft |
| 冲量（F–t 图线下的面积） | impulse (area under the F–t graph) | Kraftstoß (Fläche unter dem F-t-Graphen) |
| 变力做功（F–x 图线下的面积） | work of a variable force (area under the F–x graph) | Arbeit einer veränderlichen Kraft (Fläche unter dem F-x-Graphen) |
| 位移（v–t 图线下的面积） | displacement (area under the v–t graph) | Verschiebung (Fläche unter dem v-t-Graphen) |
| 功率 P = Fv、P = Mω | power | Leistung |
| 正弦变化的力 F = F₀ sin ωt | sinusoidal force | sinusförmige Kraft |
| 漂移 | drift | Drift |

## 26.52 新增用语

| zh | en | de |
|---|---|---|
| 受力分析图（隔离体图） | free-body diagram | Kräfteplan (Freikörperbild) |
| 实际作用点 / 共点力 | actual points / concurrent forces | tatsächliche Angriffspunkte / im Schwerpunkt |
| 沿接触面与垂直接触面分解 | components along and across the contact surface | Zerlegung längs und quer zur Kontaktfläche |
| 合力 F合 | resultant F_net | Resultierende F_res |
| 打点计时器 / 纸带 | ticker timer / ticker tape | Zeitmarkengeber / Papierstreifen |
| 打点周期 / 计数点 / 计数间隔 | dot period / counting point / counting interval | Punktabstand / Zählpunkt / Zählabstand |
| 逐差法 | successive differences | Differenzenverfahren |
| 题目 / 题干 / 题目包 | problem / stem / problem file | Aufgabe / Aufgabentext / Aufgabendatei |
| 揭晓答案 / 换一组数据 | reveal answers / another set of numbers | Antworten aufdecken / andere Zahlen |
| 滑轨限位 / 限位恢复系数 | end stop / stop restitution | Anschlag / Stoßzahl am Anschlag |
| 力矩上限 / 打滑 / 锁定 | torque limit / slip / lock | Höchstmoment / Rutschen / Einrasten |
| 滚动阻力（系数 C_rr）/ 滚动静止 | rolling resistance (C_rr) / rolling rest | Rollwiderstand (C_rr) / Rollruhe |
| 有心力 / 力心 | central force / centre | Zentralkraft / Zentrum |
| 弹性中心力 / 平方反比 | elastic central force / inverse square | elastische Zentralkraft / umgekehrt quadratisch |
| 辛积分（Gauss–Legendre） | symplectic integrator (Gauss–Legendre) | symplektisches Verfahren (Gauß–Legendre) |
| 凹多边形 / 复合体 | concave polygon / compound body | konkaves Vieleck / zusammengesetzter Körper |
| 切割 / 组合 / 拆分 | cut / combine / split | schneiden / verbinden / zerlegen |
