/**
 * Interface texts of 26.65 for the chemistry bench made for the hand (D297): pouring on the bench, the phenomena the
 * core reports, apparatus as objects, heat sources, reagent bottles, hand tools, delivery tubes, the first consequences
 * of mistakes, live curves.
 * One entry per Chinese source text: `'中文': ['English', 'Deutsch']` (British spelling; terms as in docs/i18n/GLOSSARY.md).
 */
export const TEXTS_2665_CHEM: Record<string, readonly [string, string]> = {
  // pouring on the bench (BenchCanvas.vue)
  "全部 {0}": ["all {0}", "alles {0}"],

  // the rules of the alcohol lamp: said, labelled as rules, not results of the model (BenchCanvas.vue)
  "规则：不要移动燃着的酒精灯": ["Rule: do not move a lit spirit burner", "Regel: einen brennenden Spiritusbrenner nicht bewegen"],
  "规则：禁止用燃着的酒精灯去点燃另一盏": ["Rule: never light a spirit burner from another one that is lit", "Regel: einen Spiritusbrenner nie an einem anderen, brennenden anzünden"],

  // apparatus as things: stands, tripods, racks, burners, hot plates, baths (bench.ts, FixturePanel.vue, VesselMenu.vue)
  "加热{0}": ["Heating {0}", "Erhitzt {0}"],
  "火焰下没有容器": ["Nothing over the flame", "Nichts über der Flamme"],
  "燃着": ["burning", "brennt"],
  "灯帽盖着": ["cap on", "Kappe aufgesetzt"],
  "灯帽已取下": ["cap off", "Kappe abgenommen"],
  "未点燃": ["not lit", "nicht entzündet"],
  "已打开": ["on", "an"],
  "已关闭": ["off", "aus"],
  "取下灯帽": ["Cap off", "Kappe abnehmen"],
  "点灯": ["Light", "Anzünden"],
  "盖灭": ["Cap to put out", "Kappe drauf, aus"],
  "盖上灯帽": ["Cap on", "Kappe aufsetzen"],
  "点燃喷灯": ["Light", "Anzünden"],
  "熄灭喷灯": ["Put out", "Löschen"],
  "通电": ["Switch on", "Einschalten"],
  "断电": ["Switch off", "Ausschalten"],
  "火力": ["Flame", "Flamme"],
  "到达容器的热量，量级估计": ["The heat that reaches the vessel, an order of magnitude", "Die Wärme, die das Gefäß erreicht, der Größenordnung nach"],
  "铁夹高度": ["Clamp height", "Höhe der Klemme"],
  "铁圈高度": ["Ring height", "Höhe des Rings"],
  "去掉铁圈": ["Remove ring", "Ring abnehmen"],
  "装上铁圈": ["Add a ring", "Ring anbringen"],
  "换一侧": ["Other side", "Andere Seite"],
  "先把铁圈上的容器拿下来": ["Take the vessel off the ring first", "Zuerst das Gefäß vom Ring nehmen"],
  "先把夹着的容器拿下来": ["Take the clamped vessel out first", "Zuerst das eingespannte Gefäß herausnehmen"],
  "撤去{0}": ["Remove {0}", "{0} entfernen"],

  // reagent bottles on the bench (BenchCanvas.vue, FixturePanel.vue, Shelf.vue)
  "规则：先取下瓶塞，倒放在桌面上": ["Rule: first take the stopper off and lay it upside down on the bench", "Regel: zuerst den Stopfen abnehmen und umgedreht auf den Tisch legen"],
  "瓶塞已取下": ["stopper off", "Stopfen abgenommen"],
  "瓶塞塞着": ["stoppered", "verschlossen"],
  "塞上瓶塞": ["Stopper on", "Stopfen aufsetzen"],
  "取下瓶塞": ["Stopper off", "Stopfen abnehmen"],
  "瓶装放到台面上": ["Put a bottle of it on the bench", "Eine Flasche davon auf den Tisch stellen"],

  // tools held in the hand: dropper, spatula, tweezers, glass rod (hand.ts, ChemPage.vue)
  "每次的质量": ["Mass each time", "Masse je Entnahme"],
  "放下": ["Put down", "Ablegen"],
  "{0}：点选容器搅拌": ["{0}: choose a vessel to stir", "{0}: Gefäß zum Rühren wählen"],
  "{0}（{1}）：在容器口上方按住滴加": ["{0} ({1}): hold over a vessel's mouth to add drops", "{0} ({1}): über der Öffnung eines Gefäßes gedrückt halten, um zu tropfen"],
  "{0}：点选试剂瓶或容器吸取": ["{0}: choose a bottle or a vessel to fill it from", "{0}: Flasche oder Gefäß zum Aufziehen wählen"],
  "{0}：点选容器，加入 {1}": ["{0}: choose a vessel to add {1}", "{0}: Gefäß wählen, {1} hineingeben"],
  "{0}：点选盛粉末的广口瓶": ["{0}: choose a wide bottle of a powder", "{0}: Weithalsflasche mit einem Pulver wählen"],
  "{0}：点选盛块状固体的广口瓶": ["{0}: choose a wide bottle of pieces", "{0}: Weithalsflasche mit Stücken wählen"],
  "玻璃棒搅拌：画面示意，模型里搅拌不改变溶解速率": ["Stirring with the glass rod is drawn only: in the model it does not change how fast anything dissolves", "Das Rühren mit dem Glasstab ist nur gezeichnet: im Modell ändert es keine Lösungsgeschwindigkeit"],
  "胶头滴管只吸取液体": ["A dropper takes up liquids only", "Eine Tropfpipette zieht nur Flüssigkeiten auf"],
  "{0}只取固体": ["{0}: for solids only", "{0}: nur für Feststoffe"],
  "块状固体用镊子夹取": ["Pieces are taken with the tweezers", "Stücke werden mit der Pinzette genommen"],
  "粉末用药匙取用": ["Powders are taken with the spatula", "Pulver werden mit dem Spatel genommen"],

  // the first consequences of mistakes: events and a message of the core (benchText.ts, coreText.ts)
  "容器 {0} 已破裂，不能再盛装": ["Vessel {0} is cracked and holds nothing any more", "Gefäß {0} ist gesprungen und fasst nichts mehr"],
  "溢到台面上：{0}": ["Ran over onto the bench: {0}", "Auf den Tisch übergelaufen: {0}"],
  "压强过大，塞子冲出": ["Too much pressure: the stopper was blown out", "Zu hoher Druck: der Stopfen ist herausgeschossen"],
  "骤冷破裂：热的器材遇到冷的液体": ["Cracked by sudden cooling: hot glass met a cold liquid", "Durch plötzliches Abkühlen gesprungen: heißes Glas traf auf kalte Flüssigkeit"],
  "受热破裂：这种器材不能直接加热": ["Cracked by heating: this apparatus must not be heated directly", "Beim Erhitzen gesprungen: dieses Gerät darf nicht direkt erhitzt werden"],

  // live curves of the selected vessel (LiveChart.vue)
  "pH–体积": ["pH–volume", "pH–Volumen"],
  "时间流逝后显示曲线": ["The curve appears as time passes", "Die Kurve erscheint, wenn Zeit vergeht"],
  "体积 (mL)": ["Volume (mL)", "Volumen (mL)"],
  "时间 (s)": ["Time (s)", "Zeit (s)"],
  "导出数据": ["Export the data", "Daten exportieren"],
  "{0}随{1}变化的曲线": ["{0} against {1}", "{0} gegen {1}"],

  // small items: the glowing splint (a rule), a picture of the bench (hand.ts, ChemPage.vue)
  "{0}：点选容器，伸到瓶口": ["{0}: choose a vessel to hold it at its mouth", "{0}: Gefäß wählen, um ihn an die Öffnung zu halten"],
  "规则：氧气约占 {0}，带火星的木条复燃": ["Rule: about {0} oxygen — the glowing splint flares up", "Regel: etwa {0} Sauerstoff — der Glimmspan flammt auf"],
  "规则：氧气约占 {0}，木条没有复燃": ["Rule: about {0} oxygen — the splint does not flare up", "Regel: etwa {0} Sauerstoff — der Span flammt nicht auf"],
  "实验台截图": ["Picture of the bench", "Bild des Labortischs"],
  "无法生成截图": ["The picture could not be made", "Das Bild konnte nicht erstellt werden"],
  "已破裂": ["cracked", "gesprungen"],
  "溢出": ["Ran over", "Übergelaufen"]
}
