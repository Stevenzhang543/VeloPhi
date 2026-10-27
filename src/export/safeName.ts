/** File names of exports (26.55, D97: split from courseware.ts, which pulls in the video encoder). */

/** File-name-safe text: characters Windows does not allow become '_'; trailing dots and spaces are dropped. */
export function safeName(s: string, fallback = 'velophi'): string {
  // eslint-disable-next-line no-control-regex
  const t = s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim().replace(/[. ]+$/, '')
  return t || fallback
}
