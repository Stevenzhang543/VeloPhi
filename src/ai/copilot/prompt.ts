/**
 * The state of the app sent with a question to the simulation Copilot (D154; when the user allows it). The built-in
 * prompts of the two Copilots are in simPrompt.ts and solvePrompt.ts (26.59 fix 3, D198; they replace the single
 * prompt of 26.59, D169/D181).
 */
import { settings } from '../../app/settings'
import { appState, sceneSummary } from './tools'

/** A short state block appended to the user's message (when sharing is allowed). */
export function stateNote(): string {
  if (!settings.ai.shareScene) return ''
  try {
    const s = appState()
    const scene = sceneSummary()
    return `\n\n<app_state>${JSON.stringify({ ...s, scene: { ...s.scene, bodies: scene.bodies.slice(0, 8), connectors: scene.connectors.slice(0, 8), gravity: scene.gravity } })}</app_state>`
  } catch { return '' }
}
