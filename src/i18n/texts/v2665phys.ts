/**
 * Interface texts of 26.65 §6 (D299, D300): formula cards, situation recognition and template limits of the physics
 * audit (docs/research/2665/physics-audit.md). One entry per Chinese source text: `'中文': ['English', 'Deutsch']`
 * (British spelling; terms as in docs/i18n/GLOSSARY.md).
 */
export const TEXTS_2665_PHYS: Record<string, readonly [string, string]> = {
  // ---- Formula cards (D299) ----
  '在轨道末端离开（不高于圆心），不是因支持力减为零而脱离': ['Leaves at the end of the track (not above the centre), not because the normal force drops to zero', 'Verlässt die Bahn an ihrem Ende (nicht oberhalb des Mittelpunkts), nicht weil die Normalkraft auf null sinkt'],
  '多体求解器把每一步的能量残差计为碰撞损失，账本按构造闭合，不能用来检验能量守恒': ['The many-body solver books each step’s energy residual as impact loss, so the ledger balances by construction and cannot test energy conservation', 'Der Vielkörperlöser bucht den Energierest jedes Schritts als Stoßverlust; die Bilanz geht daher per Konstruktion auf und prüft die Energieerhaltung nicht'],
  '本阶段内两物块未达到共速（形变未达到最大）': ['The two blocks do not reach a common velocity in this phase (the deformation does not reach its maximum)', 'Die beiden Klötze erreichen in diesem Abschnitt keine gemeinsame Geschwindigkeit (die Verformung erreicht ihr Maximum nicht)'],
  '账本中最大的一项（判定的尺度）': ['Largest term of the ledger (scale of the check)', 'Größter Posten der Bilanz (Maßstab der Prüfung)'],
  // ---- Templates (D300, M1) ----
  '导轨下端': ['Bottom of the rails', 'Unteres Ende der Schienen'],
  // ---- Labs (D300, M10) ----
  '干涉与衍射的参数超出范围：λ 应在 1 nm 到 1 mm 之间，缝宽与缝间距不超过 1 m，屏距不超过 1000 m': ['Interference and diffraction values out of range: λ must lie between 1 nm and 1 mm, slit width and spacing at most 1 m, screen distance at most 1000 m', 'Werte für Interferenz und Beugung außerhalb des Bereichs: λ muss zwischen 1 nm und 1 mm liegen, Spaltbreite und Spaltabstand höchstens 1 m, Schirmabstand höchstens 1000 m'],
}
