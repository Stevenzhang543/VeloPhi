/**
 * Fingerprint lines of exports (decision D26). A bounded run has its 26.49 SHA-256 fingerprint; an unbounded
 * run has a rolling fingerprint that covers the run up to a time: the final one once the run has ended, otherwise
 * the one of the last closed chunk.
 */
import { tl } from '../i18n'
import type { Recording } from '../core/solver/simulation'

/** The fingerprint (hex) an export quotes, and the time it covers for an unbounded run (null: the whole run). */
export function exportFingerprint(rec: Recording): { hash: string; upTo: number | null } {
  if (rec.hash) return { hash: rec.hash, upTo: rec.unbounded ? (rec.frameCount - 1) * rec.dt : null }
  if (rec.rolling) return { hash: rec.rolling.hash, upTo: rec.rolling.t }
  return { hash: '', upTo: null }
}

/** "SHA-256 …" with, for an unbounded run, the time the rolling fingerprint covers. */
export function fingerprintText(rec: Recording): string {
  const f = exportFingerprint(rec)
  if (!f.hash) return tl('（仍在计算，尚无指纹）')
  return f.upTo === null ? `SHA-256 ${f.hash}` : tl('SHA-256 {0}（滚动指纹，截至 t = {1} s）', [f.hash, Number(f.upTo.toPrecision(10))])
}

/** The first `n` hex digits of the fingerprint (footers). */
export function fingerprintShort(rec: Recording, n = 12): string {
  return exportFingerprint(rec).hash.slice(0, n)
}
