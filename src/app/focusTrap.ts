/**
 * Keyboard handling of modal dialogs (26.56 hand check, EDU17/UX12): Tab and Shift+Tab stay inside the dialog (the
 * page behind it must not receive keys — a stray Enter there stopped the running computation), and Escape closes it.
 */

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

/** The elements Tab can reach inside `root`, in document order (hidden ones left out). */
export function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => !el.closest('[inert]') && (el.offsetParent !== null || el.getClientRects().length > 0))
}

/** Keydown handler of a dialog root: wraps Tab at both ends and calls `close` on Escape. */
export function dialogKeys(e: KeyboardEvent, root: HTMLElement | null, close?: () => void): void {
  if (!root) return
  if (e.key === 'Escape' && close) {
    // an open <select> or a palette inside the dialog handles its own Escape
    if ((e.target as HTMLElement | null)?.tagName === 'SELECT') return
    e.preventDefault()
    e.stopPropagation()
    close()
    return
  }
  if (e.key !== 'Tab') return
  const items = focusables(root)
  if (!items.length) { e.preventDefault(); return }
  const first = items[0], last = items[items.length - 1]
  const active = document.activeElement as HTMLElement | null
  const inside = !!active && root.contains(active)
  if (e.shiftKey && (!inside || active === first)) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && (!inside || active === last)) { e.preventDefault(); first.focus() }
}
