/**
 * The state of the app sent with a question to the Copilot (D154; when the user allows it). The built-in prompts are in
 * copilotPrompt.ts (the conversation) and simPrompt.ts (the scene builder) — 26.60, D204.
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
