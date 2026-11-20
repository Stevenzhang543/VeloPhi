/**
 * Interface texts of 26.64: the five-panel shell, the home page, the design system v4 and what does not belong to one of the area files below.
 * One entry per Chinese source text: `'中文': ['English', 'Deutsch']` (British spelling; terms as in docs/i18n/GLOSSARY.md).
 */
export const TEXTS_2664: Record<string, readonly [string, string]> = {
  // the five panels (D240)
  '物理实验': ['Physics', 'Physik'],
  '化学实验': ['Chemistry', 'Chemie'],
  '力学场景的搭建、运行与分析': ['Build, run and analyse mechanics scenes', 'Mechanik-Szenen bauen, rechnen, auswerten'],
  '电与磁、光、波、热、近代物理': ['Electricity, light, waves, heat, modern physics', 'Elektrizität, Licht, Wellen, Wärme, moderne Physik'],
  '实验台、引导实验、元素与物质': ['Bench, guided experiments, elements', 'Labortisch, geführte Versuche, Elemente'],
  '模板、题目、课堂、学习手册': ['Templates, problems, classroom, handbook', 'Vorlagen, Aufgaben, Unterricht, Handbuch'],
  '面板': ['Panels', 'Bereiche'],
  '元素与物质': ['Elements & substances', 'Elemente und Stoffe'],
  // home page (D241)
  '每个数都可以核对的物理与化学实验台。': ['A physics and chemistry bench where every number can be checked.', 'Ein Labortisch für Physik und Chemie, an dem sich jede Zahl nachprüfen lässt.'],
  '版本': ['Version', 'Version'],
  '粘贴的不是分享链接': ['The pasted text is not a share link', 'Der eingefügte Text ist kein Freigabelink'],
  '交给 Copilot': ['Give to Copilot', 'An Copilot geben'],
  '从链接打开': ['Open from link', 'Aus Link öffnen'],
  '从链接打开…': ['Open from link…', 'Aus Link öffnen…'],
  '粘贴 VeloΦ 分享链接': ['Paste a VeloΦ share link', 'VeloΦ-Freigabelink einfügen'],
  '这不是 VeloΦ 分享链接': ['This is not a VeloΦ share link', 'Das ist kein VeloΦ-Freigabelink'],
  '场景就在链接里，不经过任何服务器。': ['The scene is in the link itself; no server is involved.', 'Die Szene steckt im Link selbst; kein Server ist beteiligt.'],
  '打开': ['Open', 'Öffnen'],
  // global search: the panels and what the new shell moved (D246)
  '标题与五个面板的入口': ['The title and the five panels', 'Titel und die fünf Bereiche'],
  '课堂实验、教学活动、预测统计': ['Classroom experiments, activities, tallies', 'Unterrichtsexperimente, Aktivitäten, Auszählungen'],
  '资源库的分区': ['A section of the library', 'Ein Bereich der Bibliothek'],
  '按教材章节的内置题目': ['Built-in problems by textbook chapter', 'Eingebaute Aufgaben nach Lehrbuchkapiteln'],
  '从经典模型开始': ['Start from a classic model', 'Mit einem klassischen Modell beginnen'],
  '只有地面的空场景': ['An empty scene with a ground', 'Eine leere Szene mit Boden'],
  '场景文件或题目文件': ['A scene file or a problem file', 'Eine Szenen- oder Aufgabendatei'],
  // classroom section of the library and the 教学 menu (D240)
  '对当前场景提一个问题，举手计票': ['Ask a question about the current scene and count hands', 'Eine Frage zur aktuellen Szene stellen und Handzeichen zählen'],
  '字号放大、对比加强，后排也看得清': ['Larger type and stronger contrast, readable from the back row', 'Größere Schrift und stärkerer Kontrast, auch aus der letzten Reihe lesbar'],
  '场景就在链接里，网页版打开即可': ['The scene is in the link; the web version opens it', 'Die Szene steckt im Link; die Web-Version öffnet ihn'],
  '还没有统计。只记各选项的人数，不记录任何学生。': ['No tallies yet. Only the counts per option are kept, never a student.', 'Noch keine Auszählungen. Gespeichert werden nur die Zahlen je Option, nie einzelne Schüler.'],
  '教学：班级统计、课堂投影': ['Teaching: class tally, projection', 'Unterricht: Auszählung der Klasse, Projektion'],
  '资源库的课堂分区': ['Classroom section of the library', 'Unterrichtsbereich der Bibliothek'],
  // the stage skeleton and the mount points of chemistry (D242)
  '操作条': ['Action bar', 'Aktionsleiste'],
  '更多': ['More', 'Mehr'],
  '检查器': ['Inspector', 'Inspektor'],
  '加载中…': ['Loading…', 'Wird geladen…'],
  // material tiers (D255)
  '通透': ['Clear', 'Klar'],
  '着色': ['Tinted', 'Getönt'],
  '实色': ['Solid', 'Deckend'],
  '浮层材质': ['Layer material', 'Material der Ebenen'],
  '菜单、浮层、时间轴与消息条的材质；内容面板与对话框始终为实色。': ['The material of menus, popovers, the timeline and messages; content panels and dialogs are always solid.', 'Material von Menüs, Pop-ups, Zeitleiste und Meldungen; Inhaltsbereiche und Dialoge sind immer deckend.'],
  '恢复所选': ['Restore choice', 'Auswahl wiederherstellen'],
  '画布效果': ['Canvas effects', 'Leinwandeffekte'],
  '关闭后停用运动模糊、粒子与拖尾，浮层改为实色。': ['Off: no motion blur, particles or trails, and floating layers become solid.', 'Aus: keine Bewegungsunschärfe, Partikel oder Spuren; schwebende Ebenen werden deckend.'],
  '材质：{0}': ['Material: {0}', 'Material: {0}'],
  '浮层的材质、运动模糊、粒子与拖尾。': ['The material of floating layers, motion blur, particles and trails.', 'Material der schwebenden Ebenen, Bewegungsunschärfe, Partikel und Spuren.'],
  '课堂投影时为实色': ['Solid during classroom projection', 'Deckend bei Unterrichtsprojektion'],
  '画布效果关闭时为实色': ['Solid while canvas effects are off', 'Deckend, solange die Leinwandeffekte aus sind'],
  '“减少透明度”开启时为实色': ['Solid while “Reduce transparency” is on', 'Deckend, solange „Transparenz reduzieren“ an ist'],
  '系统开启“增强对比度”时为实色': ['Solid while the system asks for more contrast', 'Deckend, solange das System mehr Kontrast verlangt'],
  '播放时帧时间偏长，玻璃已降为“{0}”': ['Frames ran long during playback; glass reduced to “{0}”', 'Zu lange Bildzeiten bei der Wiedergabe; Glas auf „{0}“ reduziert'],
  '播放时帧时间偏长，本次运行已降为“{0}”': ['Frames ran long during playback; reduced to “{0}” for this run', 'Zu lange Bildzeiten bei der Wiedergabe; für diesen Lauf auf „{0}“ reduziert'],
  '第 95 百分位帧间隔 {0} ms，可在“设置 › 视觉效果”里改回': ['95th-percentile frame interval {0} ms; change it back under Settings › Visual effects', '95. Perzentil des Bildabstands {0} ms; zurückstellen unter Einstellungen › Visuelle Effekte'],
  '首页，或直接进入“运动”的画布。': ['The home page, or straight to the canvas of “Motion”.', 'Die Startseite oder direkt die Leinwand von „Bewegung“.'],
  // what Copilot may point at (spotlight.ts)
  '“教学”菜单（受力分析图、纸带、班级预测统计、课堂投影）': ['the “Teaching” menu (free-body diagram, ticker tape, class prediction tally, projection)', 'das Menü „Unterricht“ (Kräfteplan, Papierstreifen, Vorhersage-Auszählung, Projektion)'],
  '导航栏顶部的标志（首页）': ['the mark at the top of the navigation rail (home)', 'das Zeichen oben in der Navigationsleiste (Startseite)'],
  '导航栏的“运动”': ['“Motion” in the navigation rail', '„Bewegung“ in der Navigationsleiste'],
  '导航栏的“物理实验”': ['“Physics” in the navigation rail', '„Physik“ in der Navigationsleiste'],
  '导航栏的“化学实验”': ['“Chemistry” in the navigation rail', '„Chemie“ in der Navigationsleiste'],
  '导航栏的“资源库”（模板、题目、课堂、元素与物质、手册）': ['“Library” in the navigation rail (templates, problems, classroom, elements and substances, handbook)', '„Bibliothek“ in der Navigationsleiste (Vorlagen, Aufgaben, Unterricht, Elemente und Stoffe, Handbuch)'],
  '导航栏的“资源库”（课堂分区在里面）': ['“Library” in the navigation rail (the classroom section is inside)', '„Bibliothek“ in der Navigationsleiste (darin der Unterrichtsbereich)']
}
