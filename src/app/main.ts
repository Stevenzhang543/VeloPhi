import { createApp } from 'vue'
import '@fontsource-variable/noto-sans-sc'
import '@fontsource-variable/jetbrains-mono'
import 'katex/dist/katex.min.css'
import './styles.css'
import App from './App.vue'
import { loadPrefs, runSimulation, state, defaultChart } from './store'

loadPrefs()
document.documentElement.dataset.theme = state.theme
state.chart = defaultChart(state.scene)
createApp(App).mount('#app')
runSimulation()
