/**
 * Recording fingerprints (decision D26; byte layouts in docs/dev/STREAMING.md).
 *
 * Bounded runs keep the 26.49 `recordingHash`: SHA-256 over all frame states (frame-major, little-endian IEEE-754
 * doubles), then for every event its time and post-event state. SHA-256 is a stream hash, so it is fed chunk by
 * chunk as the run goes and never needs the whole recording in memory.
 *
 * Unbounded runs use a rolling fingerprint: chunk c has the digest
 *   d_c = SHA-256(states of the chunk's frames ‖ for each event the chunk owns: t ‖ after)
 * and the chain H_c = SHA-256(H_{c−1} ‖ d_c), H_{−1} = 32 zero bytes. "The fingerprint up to t" is hex(H_c) of
 * the last closed chunk c. Chunk c owns the events created between its checkpoint and the next one (chunk 0
 * also owns the events of the initial state).
 */
import { Sha256, toHex } from './sha256'

/** Event fields that enter a fingerprint. */
export interface HashedEvent { t: number; after: Float64Array }

/** Start of the chunk-digest chain (H_{−1}). */
export const CHAIN_START: Uint8Array = new Uint8Array(32)

const tBuf = new Float64Array(1)

/** Feed the time and post-event state of events into a hasher (the event part of both fingerprints). */
export function hashEvents(hasher: Sha256, events: ReadonlyArray<HashedEvent>, from = 0, to = events.length) {
  for (let i = from; i < to; i++) {
    const e = events[i]
    tBuf[0] = e.t
    hasher.updateFloat64(tBuf)
    hasher.updateFloat64(e.after)
  }
}

/** SHA-256 of all frame states, then the time and post-event state of every event (26.49 recordingHash). */
export function recordingHash(states: Float64Array, events: ReadonlyArray<HashedEvent>): string {
  const hasher = new Sha256()
  hasher.updateFloat64(states)
  hashEvents(hasher, events)
  return hasher.digestHex()
}

/** Digest d_c of a chunk: its frame states (exactly count × size values), then its owned events. */
export function chunkDigest(states: Float64Array, events: ReadonlyArray<HashedEvent>, from = 0, to = events.length): Uint8Array {
  const hasher = new Sha256()
  hasher.updateFloat64(states)
  hashEvents(hasher, events, from, to)
  return hasher.digest()
}

/** Next link of the chain: H_c = SHA-256(H_{c−1} ‖ d_c). */
export function chainDigest(prev: Uint8Array, digest: Uint8Array): Uint8Array {
  return new Sha256().update(prev).update(digest).digest()
}

/** Hex form of a digest. */
export function digestHex(d: Uint8Array): string { return toHex(d) }

/** Two digests are equal. */
export function sameDigest(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}
