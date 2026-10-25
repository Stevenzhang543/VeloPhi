/**
 * Entry point: load the settings (migrating the 26.48 preferences once), start the appearance driver (theme,
 * effects, interface scale), set the interface language, build the start scene with the default g, mount, and run the first simulation.
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

state.scene = buildTemplate('incline')
state.chart = defaultChart(state.scene)
createApp(App).mount('#app')
runSimulation()
