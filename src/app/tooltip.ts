/**
 * Tooltips (26.63, D233): one floating label for every control that has a `title`. The browser's own tooltip appears
 * late, cannot be styled and is clipped on small windows; this one shows after a short rest of the pointer (at once
 * when another was just shown), next to the control, inside the window, and also when the control gets the keyboard
 * focus. The `title` is taken off the element while its tooltip may show (so both never appear) and kept as
 * `data-tip`; an element without a text and without an `aria-label` gets the text as its `aria-label`.
 *
 * Touch screens have no hover: nothing is shown there (titles stay as they are).
 */
const SHOW_MS = 420
const AGAIN_MS = 60
const WARM_MS = 900

let el: HTMLDivElement | null = null
let target: HTMLElement | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let lastShown = 0

function layer(): HTMLDivElement {
  if (!el) {
    el = document.createElement('div')
    el.className = 'tip'
    el.setAttribute('role', 'tooltip')
    el.setAttribute('aria-hidden', 'true')
    document.body.appendChild(el)
  }
  return el
}

/** Move an element's title to data-tip (keeping an accessible name). */
function adopt(node: HTMLElement): string {
  const title = node.getAttribute('title')
  if (title) {
    node.dataset.tip = title
    node.removeAttribute('title')
    if (!node.getAttribute('aria-label') && !(node.textContent ?? '').trim() && !node.getAttribute('aria-labelledby')) node.setAttribute('aria-label', title)
  }
  return node.dataset.tip ?? ''
}

function find(start: EventTarget | null): HTMLElement | null {
  let n = start instanceof Element ? start : null
  while (n && n !== document.body) {
    if (n instanceof HTMLElement && (n.hasAttribute('title') || n.dataset.tip)) return n
    n = n.parentElement
  }
  return null
}

function place(node: HTMLElement, tip: HTMLDivElement) {
  const r = node.getBoundingClientRect()
  const w = tip.offsetWidth, h = tip.offsetHeight
  const vw = window.innerWidth, vh = window.innerHeight
  // Next to a tall, narrow column (the navigation rail, the tool strip): to its right; else below, or above near the bottom
  const side = r.width <= 72 && r.left < 90 && r.height <= 72
  let x: number, y: number
  if (side) { x = r.right + 8; y = r.top + r.height / 2 - h / 2 }
  else { x = r.left + r.width / 2 - w / 2; y = r.bottom + 8; if (y + h > vh - 6) y = r.top - h - 8 }
  tip.style.left = `${Math.round(Math.max(6, Math.min(vw - w - 6, x)))}px`
  tip.style.top = `${Math.round(Math.max(6, Math.min(vh - h - 6, y)))}px`
}

function show(node: HTMLElement) {
  const text = adopt(node)
  if (!text || !document.contains(node)) return
  const tip = layer()
  tip.textContent = text
  tip.classList.remove('on')
  place(node, tip)
  // next frame: the transition starts from the placed, hidden state
  requestAnimationFrame(() => { if (target === node) tip.classList.add('on') })
  lastShown = performance.now()
}

function hide() {
  if (timer) { clearTimeout(timer); timer = null }
  if (target) lastShown = el?.classList.contains('on') ? performance.now() : lastShown
  target = null
  el?.classList.remove('on')
}

function aim(node: HTMLElement | null, immediate = false) {
  if (node === target) return
  hide()
  if (!node) return
  target = node
  adopt(node)
  const warm = performance.now() - lastShown < WARM_MS
  timer = setTimeout(() => { timer = null; if (target === node) show(node) }, immediate ? 0 : warm ? AGAIN_MS : SHOW_MS)
}

/** Install the tooltip layer (once, at start). */
export function installTooltips() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const hover = window.matchMedia?.('(hover: hover)')
  document.addEventListener('pointerover', e => { if (e.pointerType === 'touch' || (hover && !hover.matches)) return; aim(find(e.target)) }, { passive: true })
  document.addEventListener('pointerdown', () => hide(), { passive: true, capture: true })
  document.addEventListener('pointerleave', () => hide(), { passive: true })
  document.addEventListener('scroll', () => hide(), { passive: true, capture: true })
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide() }, { capture: true })
  // Keyboard focus shows the tip of the focused control (not a click's focus)
  document.addEventListener('focusin', e => { const n = find(e.target); if (n && (e.target as HTMLElement).matches?.(':focus-visible')) aim(n, true) })
  document.addEventListener('focusout', () => hide())
  window.addEventListener('blur', () => hide())
}
