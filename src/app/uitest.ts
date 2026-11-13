/**
 * Hooks for the interface regressions (26.61, phase A; scripts/ui-regressions.mjs): with `?uitest=1` in the address
 * the page exposes the store, the settings and a few read helpers as `window.__velophiTest`, so the regressions click
 * the real interface and then assert on the real state (run id, time, event sides) instead of on pixels. Nothing is
 * exposed without the parameter; the hook carries no keys (it cannot read them).
 */
import { state, documentScene, rewind } from './store'
import { shell } from './layout'
import { tally } from './tally'
import { viewStatus } from './viewStatus'
import { settings } from './settings'
import { serializeScene } from '../core/scene/io'
import { valuesAt } from '../engine/observe'
import { setKey } from '../ai/keys'
import { copilot } from '../ai/copilot/session'
import { fingerprintText } from '../export/fingerprint'

export function installUiTestHooks() {
  if (typeof location === 'undefined' || !/[?&]uitest=1\b/.test(location.search)) return
  ;(window as unknown as { __velophiTest: unknown }).__velophiTest = {
    state, settings, copilot,
    // 26.63: the shell's own state (rail, dialogs), the class tally and the status bar's view of the canvas
    shell, tally, viewStatus,
    sceneText: () => serializeScene(documentScene()),
    events: () => (state.recording && !state.stale ? state.recording.events.map(e => ({ t: e.t, triggers: e.triggers, changes: e.changes.map(c => c.type) })) : null),
    rewind,
    run: () => ({ id: state.runId, stale: state.stale, computing: state.computing, completed: state.recording?.completed ?? null, frames: state.recording?.frameCount ?? 0, dt: state.recording?.dt ?? 0, fingerprint: state.run.fingerprint, hash: state.recording?.hash ?? null }),
    fingerprintText: () => (state.recording ? fingerprintText(state.recording) : null),
    valuesAt: (t: number, ids: string[]) => (state.recording ? Array.from(valuesAt(state.recording, t, ids)) : null),
    /** A test key for the mocked AI endpoint (never a real one). */
    useMockAi: (baseUrl: string) => { settings.ai.connection = 'openai'; settings.ai.openai = { baseUrl, model: 'mock', vision: false }; settings.ai.copilotMode = 'act'; settings.ai.thinking = false; setKey('openai', 'sk-uitest') }
  }
}
