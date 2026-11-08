/**
 * Workflows of the app that curriculum topics and components point at (26.62, D222) when the topic is not one model
 * or scene: prediction, sweeps, reports, reproduction packages, classroom views and so on. The app opens them through
 * src/app/curriculum.ts; here they are data so the mapping can be checked without the UI.
 */
import type { Tri } from '../i18n/tri'
import { T } from '../content/models/types'

export const FEATURES: Record<string, Tri> = {
  prediction: T('预测—实验—解释（预测面板）', 'Predict – observe – explain (prediction panel)', 'Vorhersagen – beobachten – erklären (Vorhersage)'),
  sweep: T('参数扫描', 'Parameter sweep', 'Parameterstudie'),
  report: T('实验报告', 'Lab report', 'Versuchsprotokoll'),
  export: T('导出数据与运行清单（CSV、JSON）', 'Export data and run manifest (CSV, JSON)', 'Daten und Laufprotokoll exportieren (CSV, JSON)'),
  repro: T('复现包（关于 → 复现）', 'Reproduction package (About → reproduce)', 'Reproduktionspaket (Über → reproduzieren)'),
  solverCompare: T('求解器对照', 'Solver comparison', 'Löservergleich'),
  lessons: T('课堂实验（教师视图、投影、打印）', 'Classroom experiments (teacher view, projection, print)', 'Unterrichtsversuche (Lehreransicht, Projektion, Druck)'),
  learning: T('学习路径', 'Learning path', 'Lernpfad'),
  task: T('解题任务', 'Problem task', 'Aufgabe lösen'),
  problems: T('题库', 'Problem bank', 'Aufgabensammlung'),
  fbd: T('受力分析图', 'Free-body diagram', 'Kräfteplan'),
  tape: T('纸带与打点计时', 'Ticker tape', 'Papierstreifen und Zeitmarken'),
  copilot: T('AI 助手（Copilot）', 'AI assistant (Copilot)', 'KI-Assistent (Copilot)'),
  courseware: T('课件', 'Courseware', 'Unterrichtsmaterial'),
  units: T('单位与量纲设置', 'Units and dimensions', 'Einheiten und Dimensionen'),
  handbook: T('学习手册', 'Handbook', 'Handbuch'),
  watch: T('读数与测量', 'Readings and measurements', 'Messwerte'),
  chart: T('图像与数据表', 'Charts and data tables', 'Diagramme und Wertetabellen')
}
