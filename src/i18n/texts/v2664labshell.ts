/**
 * Interface texts of 26.64: the rearranged 物理实验 panel (D244) — the catalogue popover, "about this experiment", the
 * inspector's tabs and the component groups of the circuit.
 * One entry per Chinese source text: `'中文': ['English', 'Deutsch']` (British spelling; terms as in docs/i18n/GLOSSARY.md).
 * Button and tab labels keep to the budget of D243: 4 Chinese characters, 14 English, 18 German.
 */
export const TEXTS_2664_LABSHELL: Record<string, readonly [string, string]> = {
  // ---- the bar and its popovers (LabPage.vue) ----
  '选择实验': ['Experiments', 'Experimente'],
  '没有符合的实验': ['No experiment matches', 'Kein passendes Experiment'],
  '关于本实验': ['About this experiment', 'Über dieses Experiment'],
  '原理在“读数”页的末尾': ['The principle is at the end of the “Readings” tab', 'Das Prinzip steht am Ende des Reiters „Messwerte“'],
  '导出实验…': ['Export experiment…', 'Experiment exportieren …'],
  '导入实验…': ['Import experiment…', 'Experiment importieren …'],
  '重置实验': ['Reset experiment', 'Experiment zurücksetzen'],
  '导出实验': ['Export experiment', 'Experiment exportieren'],
  '导入实验': ['Import experiment', 'Experiment importieren'],
  '器材': ['Apparatus', 'Geräte'],
  // ---- the six groups of the panel (lab/catalog.ts) ----
  '光': ['Light', 'Licht'],
  '波': ['Waves', 'Wellen'],
  '热': ['Heat', 'Wärme'],
  '原子与核': ['Atoms and nuclei', 'Atome und Kerne'],
  // ---- the component groups of the circuit (CircuitLab.vue) ----
  '接线': ['Wiring', 'Leitungen'],
  '导线与开关': ['Wires and switches', 'Leitungen und Schalter'],
  '负载': ['Loads', 'Verbraucher'],
  '传感': ['Sensors', 'Sensoren'],
  '半导体与传感器': ['Semiconductors and sensors', 'Halbleiter und Sensoren'],
  '最近使用': ['Recently used', 'Zuletzt verwendet']
}
