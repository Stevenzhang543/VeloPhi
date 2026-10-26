/**
 * Sliding selection pill for segmented controls and tab bars (manual 26.52, D57). The directive measures the
 * child with class `on` and exposes its box as CSS variables; the container draws the pill (`.has-ind::before`)
 * and moves it with a transform transition, so switching tabs slides instead of jumping. The first placement
 * is not animated; under reduced motion the stylesheet removes the transition.
 */
import type { Directive } from 'vue'

interface IndEl extends HTMLElement { _indRo?: ResizeObserver }

function place(el: IndEl) {
  const on = el.querySelector(':scope > .on') as HTMLElement | null
  if (!on || on.offsetWidth === 0) { el.style.setProperty('--ind-o', '0'); return }
  el.style.setProperty('--ind-x', `${on.offsetLeft}px`)
  el.style.setProperty('--ind-y', `${on.offsetTop}px`)
  el.style.setProperty('--ind-w', `${on.offsetWidth}px`)
  el.style.setProperty('--ind-h', `${on.offsetHeight}px`)
  el.style.setProperty('--ind-o', '1')
}

export const vSlideIndicator: Directive<IndEl> = {
  mounted(el) {
    el.classList.add('has-ind')
    place(el)
    requestAnimationFrame(() => { place(el); requestAnimationFrame(() => el.classList.add('ind-ready')) })
    el._indRo = new ResizeObserver(() => place(el))
    el._indRo.observe(el)
  },
  updated(el) { place(el) },
  unmounted(el) { el._indRo?.disconnect() }
}
