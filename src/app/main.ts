/**
 * Entry point: load the settings (migrating the 26.48 preferences once), start the appearance driver (theme,
 * effects, interface scale), set the interface language, load the Rust core (WebAssembly, for this thread's
 * queries) and choose the simulation host (native engine on the desktop, else a Web Worker; 26.53 D65/D68), build
 * the start scene with the default g, mount, and run the first simulation.
 */
import { createApp, watch } from 'vue'
import '@fontsource-variable/noto-sans-sc'
import '@fontsource-variable/jetbrains-mono'
import 'katex/dist/katex.min.css'
import './styles.css'
import App from './App.vue'
import { recognizeAgain, runSimulation, state, defaultChart } from './store'
import { loadSettings, settings } from './settings'
import { initAppearance } from './appearance'
import { buildTemplate, setTemplateGravity } from '../templates'
import { locale, setLanguage } from '../i18n'
import { revealInterface } from './opening'
import wasmUrl from '../engine/velophi_core.wasm?url'
import { loadCore } from '../engine/core'
import { initHost } from '../engine/host'
import { ensureLibrary } from '../formula/match'
import { initRecords } from './learn/records'
import { loadAccount, refreshAccount } from '../ai/account'
import { loadMyProblems } from '../teaching/myProblems'
import { isAndroid } from '../platform/device'
import { useSystemFonts } from '../render/style'
import { installUiTestHooks } from './uitest'
import { installTooltips } from './tooltip'

// 26.60 r2: Android uses the system's fonts (the diagnosis switch "appfont" keeps the bundled ones)
if (isAndroid() && !((window as unknown as { __velophiCompat?: string }).__velophiCompat ?? '').split(',').includes('appfont')) {
  document.documentElement.classList.add('sysfont')
  useSystemFonts()
}

loadSettings()
// 26.59 (D151, D166): the account token and "my problems" from this computer; the account is checked in the
// background (offline: nothing happens, the AI features say why when used)
loadAccount()
loadMyProblems()
setTimeout(() => { void refreshAccount() }, 1500)
// 26.56 (D103): learning records after the settings (the 26.55 list of opened steps migrates to visits once)
initRecords()
initAppearance()

// Interface language (D27): set before anything builds texts; a switch re-renders and re-recognises the
// situations (their titles and conditions are texts), never recomputes the recording
setLanguage(settings.language)
watch(() => settings.language, setLanguage)
watch(() => locale.lang, recognizeAgain)

// The default g of templates and new scenes follows the setting (existing scenes keep their own g)
setTemplateGravity(settings.defaultGravity)
watch(() => settings.defaultGravity, setTemplateGravity)

async function start() {
  // 26.59 fix 3 (D192): Android diagnosis — "nocore" stops before the computing core loads
  if ((window as unknown as { __velophiCompat?: string }).__velophiCompat?.split(',').includes('nocore')) { void revealInterface(); return }
  // Every calculation of the interface runs in the Rust core: it must be loaded before the first scene is built
  try {
    await loadCore(wasmUrl)
    ensureLibrary()
  } catch (e) {
    const el = document.getElementById('app')
    if (el) el.textContent = `VeloPhi: the computing engine could not be loaded (${(e as Error).message}). WebAssembly is required.`
    void revealInterface()
    return
  }
  // 26.60 r2: the Android app computes in a Web Worker too — on Android every call to the native engine and every
  // streamed chunk passes through the WebView bridge on the interface thread (postMessage and script evaluation),
  // which competes with drawing and touch; the worker hands chunks over without copying
  await initHost(settings.sim.engine === 'wasm' || isAndroid())
  // 26.59 fix 3 (D192): rendering switches for diagnosing Android WebViews (only when set over adb)
  const { applyCompat, compatFlags } = await import('./compat')
  applyCompat()
  if (compatFlags().includes('blank')) { void revealInterface(); return }
  if (compatFlags().includes('simonly')) { state.scene = buildTemplate('incline'); runSimulation(); void revealInterface(); return }
  if (compatFlags().includes('nowelcome')) settings.ui.welcomed = true
  state.scene = buildTemplate('incline')
  state.chart = defaultChart(state.scene)
  // 26.63 (D232): the home page at start (a setting); tests, the release self-check and share links start in the studio
  const direct = /[?&](uitest|selftest)\b/.test(location.search) || location.hash.startsWith('#s=') || compatFlags().length > 0
  state.page = !direct && settings.ui.startPage === 'home' ? 'home' : 'studio'
  createApp(App).mount('#app')
  installTooltips()
  installUiTestHooks()
  // 26.63 (D236): a share link in the address opens its scene
  void import('./shareOpen').then(m => m.openShareFromAddress()).catch(() => {})
  // 26.60 r2: Android — take the interface out of layout while the screen turns (rotateGuard.ts)
  void import('./rotateGuard').then(m => m.initRotateGuard()).catch(() => {})
  runSimulation()
  // 26.59 fix 3 (D192): Android — reopen the scene after the app restarted itself, keep snapshots
  void import('./recovery').then(m => m.initRecovery()).catch(() => {})
  // Opening reveal from the centre of the screen (D54)
  void revealInterface()
  // Release self-check inside WebView2 (only with `--selftest <file>`; see app/selfCheck.ts)
  void import('./selfCheck').then(m => m.maybeSelfCheck()).catch(() => {})
}
void start()
