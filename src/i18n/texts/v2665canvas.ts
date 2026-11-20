/**
 * Interface texts of 26.65 §6 (D301): canvas labels of the motion renderer and the physics labs. One entry per
 * Chinese source text: `'中文': ['English', 'Deutsch']` (British spelling; terms as in docs/i18n/GLOSSARY.md).
 */
export const TEXTS_2665_CANVAS: Record<string, readonly [string, string]> = {
  // thermal equilibrium (M9): melting and boiling are not modelled
  '不计熔化、沸腾等物态变化：初温限于所选物质保持原物态的范围': ['Melting and boiling are not modelled: each initial temperature is limited to the range in which the substance keeps its state', 'Schmelzen und Sieden werden nicht modelliert: Jede Anfangstemperatur ist auf den Bereich begrenzt, in dem der Stoff seinen Aggregatzustand behält'],
  '允许 {0} … {1} °C': ['allowed {0} … {1} °C', 'zulässig {0} … {1} °C'],
  '共同温度 {0} °C 超出了{1}保持原物态的范围：实际会熔化或沸腾，而本实验不计物态变化，所以这个结果在实际中不成立。': ['The common temperature {0} °C lies outside the range in which {1} keeps its state: in reality it would melt or boil, which this experiment does not model, so the result does not hold in practice.', 'Die gemeinsame Temperatur {0} °C liegt außerhalb des Bereichs, in dem {1} seinen Aggregatzustand behält: In Wirklichkeit würde der Stoff schmelzen oder sieden. Das modelliert dieser Versuch nicht, das Ergebnis gilt so also nicht.'],
  // interference and diffraction (M10): the core gave no pattern
  '没有算出干涉图样': ['No interference pattern was computed', 'Kein Interferenzmuster berechnet']
}
