/**
 * The mouse wheel over a number field (26.57, T21; manual §7.5): the value changes only with Alt held, so scrolling
 * a panel past a field never changes a physical parameter. Returns the signed number of steps (Shift: a tenth,
 * Ctrl/⌘: ten), or null when the wheel must scroll the page as usual.
 */
export function wheelSteps(e: { altKey: boolean; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; deltaX: number; deltaY: number }, disabled = false): number | null {
  if (!e.altKey || disabled) return null
  const d = e.deltaY || e.deltaX
  if (!d) return null
  const k = e.shiftKey ? 0.1 : e.ctrlKey || e.metaKey ? 10 : 1
  return (d < 0 ? 1 : -1) * k
}
