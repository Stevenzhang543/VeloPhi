/**
 * The user's own API keys (26.59, D153): kept on this computer only, apart from the settings (so "restore
 * defaults", settings export and the trial log never contain them) and never sent to whitelists.top.
 */
const KEY = 'velophi.ai.keys'

interface Keys { openai: string; anthropic: string }

/** Kept in memory as well: storage may be unavailable (private windows, tests). */
let memory: Keys | null = null

function read(): Keys {
  if (memory) return { ...memory }
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Keys>
    return { openai: typeof raw.openai === 'string' ? raw.openai : '', anthropic: typeof raw.anthropic === 'string' ? raw.anthropic : '' }
  } catch {
    return { openai: '', anthropic: '' }
  }
}

export function getKey(kind: 'openai' | 'anthropic'): string { return read()[kind] }

export function setKey(kind: 'openai' | 'anthropic', value: string) {
  const k = read()
  k[kind] = value.trim()
  memory = k
  try { localStorage.setItem(KEY, JSON.stringify(k)) } catch { /* storage unavailable */ }
}

export function clearKeys() { memory = null; try { localStorage.removeItem(KEY) } catch { /* ignore */ } }

/** A key shown in the interface: the first characters and the length. */
export function maskKey(k: string): string { return k ? `${k.slice(0, 5)}…（${k.length}）` : '' }
