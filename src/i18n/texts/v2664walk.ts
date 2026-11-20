/**
 * Interface texts of 26.64: the simplified bars (D243–D245), the walkthrough and "what is new" (D248–D251).
 * One entry per Chinese source text: `'中文': ['English', 'Deutsch']` (British spelling; terms as in docs/i18n/GLOSSARY.md).
 * Buttons and tabs keep to the budget of D243: 4 Chinese characters, 14 English, 18 German (scripts/copy-lint.mjs).
 */
export const TEXTS_2664_WALK: Record<string, readonly [string, string]> = {
  // ---- 运动: the bar, 更多, the tool strip (D245) ----
  '更多：题目、视图、教学、计算': ['More: problems, view, teaching, calculation', 'Mehr: Aufgaben, Ansicht, Unterricht, Rechnung'],
  '解一道题（任务）': ['Solve a problem (task)', 'Aufgabe lösen (Auftrag)'],
  '学习路径…': ['Learning path…', 'Lernpfad …'],
  '展开侧栏': ['Show sidebar', 'Seitenleiste zeigen'],
  '工具条': ['Tool strip', 'Werkzeugleiste'],
  '画面上显示哪些量、侧栏、深浅色': ['What the canvas shows, the sidebar, light or dark', 'Was die Zeichenfläche zeigt, Seitenleiste, hell oder dunkel'],
  '受力图、纸带、班级统计、课堂投影': ['Free-body diagram, ticker tape, class tally, projection', 'Kräfteplan, Papierstreifen, Klassenzählung, Projektion'],
  '参数扫描、求解器对照、收敛性研究': ['Parameter sweep, solver comparison, convergence study', 'Parameterreihe, Löservergleich, Konvergenzstudie'],
  '场景里的物体与连接件': ['The bodies and connectors of the scene', 'Die Körper und Verbindungen der Szene'],
  '展开或收起': ['Show or hide', 'Zeigen oder verbergen'],

  // ---- the offer on the home page, Help, the global search (D248) ----
  '入门': ['Get started', 'Einstieg'],
  '新变化': ['What’s new', 'Neuerungen'],
  '{0} 的新变化': ['New in {0}', 'Neu in {0}'],
  '入门：五段，在真实的界面上做，约 8 分钟': ['Get started: five parts, done in the real interface, about 8 minutes', 'Einstieg: fünf Abschnitte in der echten Oberfläche, etwa 8 Minuten'],
  '五个面板、化学实验台、更短的操作条': ['Five panels, a chemistry bench, shorter bars', 'Fünf Bereiche, ein Chemie-Labortisch, kürzere Leisten'],
  '以后再说': ['Not now', 'Später'],
  '入门清单：五段各自完成了没有': ['Checklist of the five parts', 'Checkliste der fünf Abschnitte'],
  '帮助：入门、新变化、快捷键': ['Help: get started, what’s new, shortcuts', 'Hilfe: Einstieg, Neuerungen, Tastenkürzel'],
  '五段走查与完成情况': ['The five parts and what is done', 'Die fünf Abschnitte und ihr Stand'],
  '按版本列出，每条可以带你去看': ['By version; every entry can show you where', 'Nach Version; jeder Eintrag zeigt die Stelle'],
  '入门：{0}': ['Get started: {0}', 'Einstieg: {0}'],
  '约 {0} 分钟': ['about {0} min', 'etwa {0} min'],
  'Alt+1…5 现在对应五个面板；课堂在资源库里。': ['Alt+1…5 now open the five panels; the classroom is in the library.', 'Alt+1…5 öffnen jetzt die fünf Bereiche; der Unterricht liegt in der Bibliothek.'],

  // ---- Help › 入门 / 新变化 ----
  '五段走查，在真实的界面上做，用的是临时文档。已完成 {0}/5。': ['Five parts, done in the real interface on a temporary document. {0} of 5 finished.', 'Fünf Abschnitte in der echten Oberfläche, an einem vorläufigen Dokument. {0} von 5 abgeschlossen.'],
  '第 {0}/{1} 步': ['step {0} of {1}', 'Schritt {0} von {1}'],
  '重走': ['Again', 'Noch einmal'],
  '逐条看': ['One by one', 'Der Reihe nach'],
  '带我去看': ['Show me', 'Zeig es mir'],

  // ---- the note of the walkthrough ----
  '先到“{0}”面板。': ['Go to the “{0}” panel first.', 'Zuerst zum Bereich „{0}“ wechseln.'],
  '稍后继续': ['Continue later', 'Später fortsetzen'],
  '这一段走完了。下一段：{0}，约 {1} 分钟。': ['This part is done. Next: {0}, about {1} min.', 'Dieser Abschnitt ist geschafft. Als Nächstes: {0}, etwa {1} min.'],
  '五段都走完了。“帮助 › 入门”可以重走任意一段。': ['All five parts are done. “Help › Get started” walks any of them again.', 'Alle fünf Abschnitte sind geschafft. Unter „Hilfe › Einstieg“ lässt sich jeder wiederholen.'],
  '到此为止': ['Stop here', 'Hier aufhören'],
  '正在准备…': ['Preparing…', 'Wird vorbereitet …'],
  '跳过此步': ['Skip step', 'Schritt auslassen'],
  '跳过此段': ['Skip part', 'Teil auslassen'],
  '吸到接触与对齐，Alt 暂停': ['Snaps to contact and edges; Alt suspends it', 'Rastet an Kontakt und Kanten ein; Alt setzt es aus'],
  '对齐网格，Alt 暂停': ['Snaps to the grid; Alt suspends it', 'Rastet am Raster ein; Alt setzt es aus'],
  '界面大小': ['Interface size', 'Größe der Oberfläche'],

  // ---- segment 0: the set-up ----
  '界面用哪种语言？': ['Which language for the interface?', 'Welche Sprache für die Oberfläche?'],
  '外观与浮层的材质。': ['Appearance, and the material of floating layers.', 'Erscheinungsbild und Material der schwebenden Ebenen.'],
  '界面的大小。': ['The size of the interface.', 'Die Größe der Oberfläche.'],
  '你主要用它来……（决定启动页、“更多”先显示哪一组、公式卡片的详略；以后都能在设置里改。）': [
    'You mainly use it to … (this sets the start page, the group “More” shows first and how detailed formula cards are; all of it can be changed in the settings later.)',
    'Wofür vor allem? (Das legt die Startseite fest, welche Gruppe „Mehr“ zuerst zeigt und wie ausführlich Formelkarten sind; alles lässt sich später in den Einstellungen ändern.)'
  ],
  '学': ['Learn', 'Lernen'],
  '教': ['Teach', 'Unterrichten'],
  '做研究': ['Research', 'Forschen'],
  '从首页开始，公式卡片从简': ['Starts on the home page; compact formula cards', 'Start auf der Startseite; knappe Formelkarten'],
  '“更多”先显示教学工具': ['“More” shows the teaching tools first', '„Mehr“ zeigt zuerst die Unterrichtswerkzeuge'],
  '直接进“运动”，公式卡片从详': ['Starts in “Motion”; detailed formula cards', 'Start in „Bewegung“; ausführliche Formelkarten'],

  // ---- segment 1: motion ----
  '打开“模板”，选“斜面滑块”，再点“创建场景”。': ['Open “Templates”, choose “Block on an incline”, then “Create scene”.', '„Vorlagen“ öffnen, „Klotz auf der schiefen Ebene“ wählen, dann „Szene erstellen“.'],
  '打开文件菜单里的“模板库”，选“斜面滑块”，再点“创建场景”。': ['Open “Template library” in the file menu, choose “Block on an incline”, then “Create scene”.', 'Im Dateimenü die „Vorlagenbibliothek“ öffnen, „Klotz auf der schiefen Ebene“ wählen, dann „Szene erstellen“.'],
  '按播放，看物块滑下斜面。': ['Press play and watch the block slide down the incline.', 'Wiedergabe drücken und zusehen, wie der Klotz die Ebene hinabgleitet.'],
  '把时间轴拖到第一个菱形（事件），或按“下一个事件”。': ['Drag the timeline to the first diamond (an event), or press “Next event”.', 'Die Zeitleiste zur ersten Raute (einem Ereignis) ziehen oder „Nächstes Ereignis“ drücken.'],
  '把倾角 θ 改成 40°，结果随即重算。': ['Change the angle θ to 40°; the result is computed again at once.', 'Den Neigungswinkel θ auf 40° ändern; das Ergebnis wird sofort neu berechnet.'],
  '打开“分析”里的一张公式卡片，对照公式与仿真。': ['Open a formula card under “Analysis” and compare the formula with the simulation.', 'Unter „Analyse“ eine Formelkarte öffnen und Formel und Simulation vergleichen.'],

  // ---- segment 2: physics ----
  '打开“选择实验”，选“电路”。': ['Open “Experiments” and choose “Circuits”.', '„Experimente“ öffnen und „Stromkreise“ wählen.'],
  '开关是断开的：点它一下选中，再点一下合上。': ['The switch is open: click it once to select it, once more to close it.', 'Der Schalter ist offen: einmal anklicken zum Auswählen, noch einmal zum Schließen.'],
  '点电流表（Ⓐ），在右侧读出它的示数。': ['Click the ammeter (Ⓐ) and read its value at the right.', 'Das Amperemeter (Ⓐ) anklicken und rechts seinen Wert ablesen.'],
  '点滑动变阻器，把“滑片位置”拖到另一端，看电流怎样变。': ['Click the rheostat and drag “Slider position” to the other end; watch the current change.', 'Den Schiebewiderstand anklicken und „Schleiferstellung“ ans andere Ende ziehen; die Stromstärke ändert sich.'],

  // ---- segment 3: chemistry ----
  '打开“仪器”，从架上取一只锥形瓶。': ['Open “Apparatus” and take an Erlenmeyer flask from the shelf.', '„Geräte“ öffnen und einen Erlenmeyerkolben aus dem Regal nehmen.'],
  '打开“药品”，给锥形瓶加 20 mL 稀盐酸（0.1 mol/L）。': ['Open “Reagents” and add 20 mL of dilute hydrochloric acid (0.1 mol/L) to the flask.', '„Reagenzien“ öffnen und 20 mL verdünnte Salzsäure (0,1 mol/L) in den Kolben geben.'],
  '再从“药品”里滴 2 滴酚酞。': ['From “Reagents” again, add 2 drops of phenolphthalein.', 'Wieder aus „Reagenzien“: 2 Tropfen Phenolphthalein zugeben.'],
  '取碱式滴定管，装氢氧化钠溶液，夹到锥形瓶上方，滴加到溶液变红；读数里的 pH 来自求解器。': [
    'Take a burette for bases, fill it with sodium hydroxide solution, clamp it above the flask and deliver until the solution turns pink; the pH in the readings comes from the solver.',
    'Eine Bürette für Basen nehmen, mit Natronlauge füllen, über dem Kolben einspannen und zutropfen, bis die Lösung rosa wird; der pH-Wert in den Messwerten kommt vom Löser.'
  ],
  '打开“⋯”里的“引导实验”：40 个实验按步骤做，每一步由求解器检查。': ['Open “Guided labs” under “⋯”: 40 experiments step by step, each step checked by the solver.', 'Unter „⋯“ die „Geführten Versuche“ öffnen: 40 Experimente Schritt für Schritt, jeder Schritt vom Löser geprüft.'],

  // ---- segment 4: the library and AI ----
  '资源库与 AI': ['Library and AI', 'Bibliothek und KI'],
  '在资源库的“题目”里选一道题，填上答案，按“揭晓答案”：对错由引擎算出。': ['Choose a problem under “Problems” in the library, fill in your answers and press “Reveal answers”: the engine works out what is right.', 'In der Bibliothek unter „Aufgaben“ eine Aufgabe wählen, die Antworten eintragen und „Antworten aufdecken“ drücken: Was stimmt, berechnet der Rechenkern.'],
  '在“元素与物质”里打开一个元素，切到“单质晶体”，用鼠标或手指转动它。': ['Open an element under “Elements & substances”, switch to “Crystal” and turn it with the mouse or a finger.', 'Unter „Elemente und Stoffe“ ein Element öffnen, zu „Kristall“ wechseln und es mit Maus oder Finger drehen.'],
  '让 Copilot 搭一个场景，例如“平抛，初速度 3 m/s”。坐标由程序算，答案由引擎核对。': ['Let Copilot build a scene, for example “horizontal throw at 3 m/s”. The program computes the coordinates, the engine checks the answer.', 'Copilot eine Szene bauen lassen, etwa „waagerechter Wurf mit 3 m/s“. Die Koordinaten berechnet das Programm, die Antwort prüft der Rechenkern.'],
  '“监视”把画面放大：按播放。': ['“Monitor” shows the scene large: press play.', '„Monitor“ zeigt die Szene groß: Wiedergabe drücken.'],

  // ---- what is new in 26.64 (D250) ----
  '五个面板': ['Five panels', 'Fünf Bereiche'],
  '运动、物理实验、化学实验、资源库、监视。“工作台”现在叫“运动”，“实验室”叫“物理实验”。': ['Motion, Physics, Chemistry, Library, Monitor. The “Workbench” is now “Motion”, the “Lab” is “Physics”.', 'Bewegung, Physik, Chemie, Bibliothek, Monitor. Die „Arbeitsfläche“ heißt jetzt „Bewegung“, das „Labor“ heißt „Physik“.'],
  'Alt+1 到 Alt+5 按导航栏的顺序打开五个面板，Alt+0 回首页。': ['Alt+1 to Alt+5 open the five panels in the order of the rail; Alt+0 goes home.', 'Alt+1 bis Alt+5 öffnen die fünf Bereiche in der Reihenfolge der Leiste; Alt+0 führt zur Startseite.'],
  '点左上角的标志回到首页；搜索在导航栏和 Ctrl+K。': ['The mark at the top left opens the home page; search is in the rail and on Ctrl+K.', 'Das Zeichen oben links öffnet die Startseite; die Suche liegt in der Leiste und auf Strg+K.'],
  '新的实验台：取仪器、加药品，现象与读数由求解器算出；另有 40 个引导实验和元素与物质的百科。': ['A new bench: take apparatus, add reagents; what you see and read is computed by the solver. Also 40 guided labs and an encyclopedia of elements and substances.', 'Ein neuer Labortisch: Geräte nehmen, Reagenzien zugeben; Erscheinungen und Messwerte berechnet der Löser. Dazu 40 geführte Versuche und ein Lexikon der Elemente und Stoffe.'],
  '“更多”': ['“More”', '„Mehr“'],
  '运动面板的题目、视图、教学、计算收进了“更多”，按这四个名字分组。': ['Problems, view, teaching and calculation of the Motion panel moved into “More”, grouped under these four names.', 'Aufgaben, Ansicht, Unterricht und Rechnung des Bereichs Bewegung liegen jetzt unter „Mehr“, nach diesen vier Namen gruppiert.'],
  '画布左侧留六个常用工具；其余的、对象列表和吸附开关在“全部工具”里，都带名称。': ['Six common tools stay at the left of the canvas; the others, the object list and the snapping switches are under “All tools”, each with its name.', 'Sechs häufige Werkzeuge bleiben links an der Zeichenfläche; die übrigen, die Objektliste und die Fang-Schalter liegen unter „Alle Werkzeuge“, jeweils mit Namen.'],
  '物理实验的目录是一个浮层，按领域排列；导出、导入、重置在“更多”里。': ['The catalogue of physics experiments is a popover, arranged by field; export, import and reset are under “More”.', 'Das Verzeichnis der Physik-Experimente ist ein Popover, nach Gebieten geordnet; Exportieren, Importieren und Zurücksetzen liegen unter „Mehr“.'],
  '课堂并入资源库的“课堂”分区；班级统计与课堂投影在各面板的“教学”里。': ['The classroom is now the “Classroom” section of the library; the class tally and projection are under “Teaching” in each panel.', 'Der Unterricht ist jetzt der Abschnitt „Unterricht“ der Bibliothek; Klassenzählung und Projektion liegen in jedem Bereich unter „Unterricht“.'],
  '“帮助 › 入门”可以随时重走任意一段；这张列表在“帮助 › 新变化”。': ['“Help › Get started” walks any part again at any time; this list is under “Help › What’s new”.', 'Unter „Hilfe › Einstieg“ lässt sich jeder Abschnitt jederzeit wiederholen; diese Liste steht unter „Hilfe › Neuerungen“.']
}
