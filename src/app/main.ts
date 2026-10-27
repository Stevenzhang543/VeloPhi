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

loadSettings()
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
  await initHost(settings.sim.engine === 'wasm')
  state.scene = buildTemplate('incline')
  state.chart = defaultChart(state.scene)
  createApp(App).mount('#app')
  runSimulation()
  // Opening reveal from the centre of the screen (D54)
  void revealInterface()
  // Release self-check inside WebView2 (only with `--selftest <file>`; see app/selfCheck.ts)
  void import('./selfCheck').then(m => m.maybeSelfCheck()).catch(() => {})
}
void start()
