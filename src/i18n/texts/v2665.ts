/**
 * Interface texts of 26.65: the studio bar and the inspector (D290–D293), the text fixes (D294) and the copy pass of
 * the shell (D296). One entry per Chinese source text: `'中文': ['English', 'Deutsch']` (British spelling; terms as in
 * docs/i18n/GLOSSARY.md).
 */
export const TEXTS_2665: Record<string, readonly [string, string]> = {
  // ---- The studio bar and the inspector (D291, D292) ----
  '所选物体的参数；没有选择时是整个场景': ['The selected object; with nothing selected, the whole scene', 'Das ausgewählte Objekt; ohne Auswahl die ganze Szene'],
  '回到整个场景': ['Back to the whole scene', 'Zurück zur ganzen Szene'],
  '恢复默认布局': ['Restore the default layout', 'Standardlayout wiederherstellen'],
  '为保持流畅，浮层已改用“{0}”外观': ['To keep playback smooth, floating panels now use “{0}”', 'Für flüssige Wiedergabe nutzen schwebende Bereiche jetzt „{0}“'],
  '已算至 {0} {1}': ['Computed to {0} {1}', 'Berechnet bis {0} {1}'],
  // ---- About: licences (26.65) ----
  '均未修改，按各自许可证使用；完整清单与许可证全文见 THIRD_PARTY_NOTICES.md（随程序安装，也在发布文件中）。界面图标为 VeloPhi 自绘。': ['All unmodified and used under their own licences; the full list and the licence texts are in THIRD_PARTY_NOTICES.md (installed with the program and included in the release files). The interface icons are drawn for VeloPhi.', 'Alle unverändert und unter ihren eigenen Lizenzen verwendet; die vollständige Liste und die Lizenztexte stehen in THIRD_PARTY_NOTICES.md (wird mit dem Programm installiert und liegt den Release-Dateien bei). Die Symbole der Oberfläche sind eigens für VeloPhi gezeichnet.'],
  '界面西文字体': ['Latin interface font', 'Lateinische Schrift der Oberfläche'],
  // ---- What is new in 26.65 (Help › 新变化) ----
  '一条工具栏': ['One toolbar', 'Eine Werkzeugleiste'],
  '运动面板上方只留一条栏：左边是文件、撤销、模板与运行，右边是属性、分析、题目和 AI 的开关。': ['The Motion panel has one bar: file, undo, templates and run on the left; the switches for properties, analysis, problems and AI on the right.', 'Über dem Bereich Bewegung steht nur noch eine Leiste: links Datei, Rückgängig, Vorlagen und Ablauf, rechts die Schalter für Eigenschaften, Analyse, Aufgaben und KI.'],
  '右栏只有一个属性面板：选中物体时显示它的参数，什么都不选时显示整个场景。': ['The right-hand column is one properties panel: the selected object’s parameters, or the whole scene when nothing is selected.', 'Die rechte Spalte ist ein einziger Eigenschaftenbereich: die Parameter des ausgewählten Objekts, ohne Auswahl die ganze Szene.'],
  '求解器与它的状态移到了底部的状态栏。': ['The solver and its state are now in the status bar at the bottom.', 'Der Löser und sein Zustand stehen jetzt in der Statusleiste unten.'],
  '从首页开始': ['Starts on the home page', 'Start auf der Startseite'],
  '每次启动都打开首页；Alt+1…5 直接去各面板。': ['Every start opens the home page; Alt+1…5 go straight to the panels.', 'Jeder Start öffnet die Startseite; Alt+1…5 führen direkt zu den Bereichen.'],
  '仪器可以倾倒、加塞、加热和组装；溢出、冲开塞子与骤冷炸裂都由求解器判定。': ['Glassware can be poured, stoppered, heated and assembled; overflow, a stopper blown out and a crack from sudden cooling are all decided by the solver.', 'Geräte lassen sich ausgießen, verschließen, erhitzen und zusammenbauen; Überlaufen, ein herausgedrückter Stopfen und ein Sprung durch plötzliches Abkühlen werden vom Löser bestimmt.'],
}
