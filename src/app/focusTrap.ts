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

/**
 * `v-dialog="close"` on a modal dialog's root (26.57, known issue of 26.56: the older dialogs had no trap): Tab stays
 * inside, Escape calls `close` (when given), the dialog takes focus when it opens (unless something inside already
 * has it) and gives it back to where it came from when it closes.
 */
type DialogEl = HTMLElement & { __dlg?: { onKey: (e: KeyboardEvent) => void; back: HTMLElement | null; close?: () => void } }
export const vDialog = {
  mounted(el: DialogEl, binding: { value?: () => void }) {
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const st = { back, close: binding.value, onKey: (e: KeyboardEvent) => dialogKeys(e, el, st.close) }
    el.__dlg = st
    el.setAttribute('aria-modal', 'true')
    el.addEventListener('keydown', st.onKey)
    if (!el.contains(document.activeElement)) {
      const first = focusables(el)[0]
      if (first) first.focus({ preventScroll: true })
      else { if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }) }
    }
  },
  updated(el: DialogEl, binding: { value?: () => void }) { if (el.__dlg) el.__dlg.close = binding.value },
  beforeUnmount(el: DialogEl) {
    const st = el.__dlg
    if (!st) return
    el.removeEventListener('keydown', st.onKey)
    if (st.back && document.contains(st.back)) st.back.focus({ preventScroll: true })
    delete el.__dlg
  }
}
