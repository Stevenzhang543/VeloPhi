/**
 * Search folding (26.59, UX12): full-width to half-width (NFKC), lower case, every hyphen and dash
 * (‐ ‑ ‒ – — − ﹣ －) as "-", and no spaces, so "U‑I 图像", "U-I图像" and "Ｕ－Ｉ 图像" find the same entries.
 */
export function foldSearch(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/[‐-―−﹣－]/g, '-').replace(/\s+/g, '')
}
