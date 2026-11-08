/**
 * Compatibility switches for field diagnosis on Android (26.59 fix 3, D192). A developer sets
 * `adb shell setprop debug.velophi.compat <flags>` (comma-separated); MainActivity hands the value to the page as
 * `window.__velophiCompat` before it loads. Each flag turns one rendering feature off by editing the loaded style
 * sheets, so a crashing WebView can be narrowed down without DevTools (which change how it renders). Without the
 * property nothing happens. scripts/android/mumu.ps1 -Step rotate -Compat … uses it on the MuMu emulator. "blank" stops
 * before the interface is built, "nocore" before the computing core loads; "bare", "noedge" and "sw" are handled by
 * MainActivity (a bare page instead of the app, no edge-to-edge window, a software-drawn WebView). 26.60 r2: "appfont" keeps
 * the bundled variable fonts on Android (by default the system's fonts are used there, main.ts).
 */
export const COMPAT_FLAGS = ['appfont', 'norotguard', 'blank', 'simonly', 'nosim', 'nocore', 'bare', 'noedge', 'sw', 'nowelcome', 'noinert', 'h-left', 'h-right', 'h-center', 'h-bottom', 'h-top', 'h-ambient', 'h-dialog', 'h-pages', 'h-dock', 'h-canvas', 'nocv', 'nocq', 'nohas', 'nobackdrop', 'noglass', 'noclip', 'nocontain', 'noanim', 'nofixed', 'nogrid', 'notransform', 'nofilter', 'nosticky', 'nooverflow'] as const

/** The flags asked for (none on a normal start). */
export function compatFlags(): string[] {
  const v = typeof window !== 'undefined' ? (window as unknown as { __velophiCompat?: string }).__velophiCompat : undefined
  return typeof v === 'string' ? v.split(',').map(s => s.trim().toLowerCase()).filter(s => (COMPAT_FLAGS as readonly string[]).includes(s)) : []
}

type Rule = CSSRule & { style?: CSSStyleDeclaration; selectorText?: string; cssRules?: CSSRuleList; deleteRule?: (i: number) => void }

/** Visit every rule of every readable style sheet (nested rules first, from the end so deletions are safe). */
function eachRule(fn: (r: Rule, del: () => void) => void) {
  const walk = (list: CSSRuleList, owner: { deleteRule: (i: number) => void }) => {
    for (let i = list.length - 1; i >= 0; i--) {
      const r = list[i] as Rule
      if (r.cssRules && !(r instanceof CSSStyleRule)) walk(r.cssRules, r as unknown as { deleteRule: (i: number) => void })
      fn(r, () => owner.deleteRule(i))
    }
  }
  for (const sh of Array.from(document.styleSheets)) {
    let rules: CSSRuleList
    try { rules = sh.cssRules } catch { continue }
    walk(rules, sh)
  }
}

/** Apply the switches; returns the flags applied (logged to the console). */
export function applyCompat(): string[] {
  const flags = compatFlags()
  if (!flags.length) return []
  const on = (f: string) => flags.includes(f)
  const extra: string[] = []
  eachRule((r, del) => {
    const st = r.style
    if (on('nocq') && r.constructor.name === 'CSSContainerRule') { del(); return }
    if (on('nohas') && r.selectorText?.includes(':has(')) { del(); return }
    if (!st) return
    if (on('nocv') && st.contentVisibility) { st.removeProperty('content-visibility'); if (st.visibility === 'hidden') st.setProperty('display', 'none') }
    if (on('nocq') && st.getPropertyValue('container-type')) st.removeProperty('container-type')
    if (on('nobackdrop')) { st.removeProperty('backdrop-filter'); st.removeProperty('-webkit-backdrop-filter') }
    if (on('noclip') && st.overflow === 'clip') st.overflow = 'hidden'
    if (on('nocontain') && st.contain) st.removeProperty('contain')
    if (on('nofixed') && st.position === 'fixed') st.position = 'absolute'
    if (on('nosticky') && st.position === 'sticky') st.position = 'relative'
    if (on('nogrid') && (st.display === 'grid' || st.display === 'inline-grid')) st.display = 'block'
    if (on('notransform') && st.transform) st.removeProperty('transform')
    if (on('nofilter')) { st.removeProperty('filter'); st.removeProperty('mask'); st.removeProperty('-webkit-mask') }
    if (on('nooverflow') && (st.overflow === 'auto' || st.overflowY === 'auto' || st.overflowX === 'auto')) { st.overflow = 'visible' }
  })
  if (on('noanim')) extra.push('*,*::before,*::after{animation:none!important;transition:none!important}')
  // Regions of the interface left out of layout altogether
  const HIDE: Record<string, string> = {
    'h-left': '.page-studio .left', 'h-right': '.page-studio .right, .page-studio .split-v, .drawer-btn', 'h-center': '.page-studio .center',
    'h-bottom': '.page-studio .pane.bottom, .page-studio .split-h', 'h-top': '.app > .top', 'h-ambient': '.ambient', 'h-dialog': '.dialog, .welcome, [role=dialog]',
    'h-pages': '.pages', 'h-dock': '.copilot-dock, .dock', 'h-canvas': '.page-studio .view'
  }
  const hide = Object.entries(HIDE).filter(([f]) => on(f)).map(([, sel]) => sel)
  if (hide.length) extra.push(`${hide.join(', ')} { display: none !important; }`)
  if (on('noinert')) {
    const strip = () => document.querySelectorAll('[inert]').forEach(e => e.removeAttribute('inert'))
    new MutationObserver(strip).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['inert'], childList: true })
  }
  // 'noglass' is read by the appearance driver (fx-glass and fx-ambient stay off)
  if (extra.length) { const s = document.createElement('style'); s.textContent = extra.join('\n'); document.head.append(s) }
  console.info(`VeloPhi compat: ${flags.join(',')}`)
  return flags
}
